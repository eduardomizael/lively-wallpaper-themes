import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const REQUIRED_PACKAGES = ['esbuild', 'html-minifier-terser'];

async function loadDependencies() {
  const missing = [];
  const loaded = {};

  for (const pkg of REQUIRED_PACKAGES) {
    try {
      loaded[pkg] = await import(pkg);
    } catch {
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    console.error('\n[ERRO] Dependências de build ausentes:');
    for (const pkg of missing) {
      console.error(`  - ${pkg}`);
    }
    console.error('\nExecute o comando abaixo na raiz do projeto para instalar:');
    console.error('  npm install\n');
    process.exit(2);
  }

  return {
    esbuild: loaded.esbuild,
    minifyHtml: loaded['html-minifier-terser'].minify,
  };
}

function isLocalAsset(url) {
  if (!url) return false;
  const trimmed = url.trim();
  return !/^(https?:|\/\/|data:|blob:|mailto:|#)/i.test(trimmed);
}

function normalizeRelPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function escapeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyle(code) {
  return code.replace(/<\/style/gi, '<\\/style');
}

function parseAttributes(tag) {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(tag)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = value;
  }
  return attrs;
}

async function replaceAsync(str, regex, asyncFn) {
  const matches = [];
  str.replace(regex, (...args) => {
    const offset = args[args.length - 2];
    const fullMatch = args[0];
    matches.push({ fullMatch, args, offset });
    return fullMatch;
  });

  if (matches.length === 0) return str;

  const replacements = await Promise.all(
    matches.map((m) => asyncFn(...m.args))
  );

  let result = '';
  let lastIndex = 0;
  for (let i = 0; i < matches.length; i++) {
    const { offset, fullMatch } = matches[i];
    result += str.slice(lastIndex, offset) + replacements[i];
    lastIndex = offset + fullMatch.length;
  }
  result += str.slice(lastIndex);
  return result;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function buildTheme(theme, outRoot, deps) {
  const { esbuild, minifyHtml } = deps;
  const themeDir = path.join(ROOT_DIR, theme.id);
  const indexPath = path.join(themeDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Arquivo principal não encontrado: ${indexPath}`);
  }

  let html = fs.readFileSync(indexPath, 'utf8');
  const inlinedFiles = new Set(['index.html']);
  let sourceBytes = Buffer.byteLength(html, 'utf8');

  // 1. Inline e minifica <link rel="stylesheet" href="...">
  const linkRegex = /<link\b[^>]*>/gi;
  html = await replaceAsync(html, linkRegex, async (fullMatch) => {
    const attrs = parseAttributes(fullMatch);
    if (attrs.rel?.toLowerCase() !== 'stylesheet' || !isLocalAsset(attrs.href)) {
      return fullMatch;
    }

    const relPath = normalizeRelPath(attrs.href.split(/[?#]/)[0]);
    const cssPath = path.join(themeDir, relPath);
    if (!fs.existsSync(cssPath)) {
      throw new Error(`[${theme.id}] CSS referenciado não encontrado: ${relPath}`);
    }

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    sourceBytes += Buffer.byteLength(cssContent, 'utf8');
    inlinedFiles.add(relPath);

    const { code } = await esbuild.transform(cssContent, {
      loader: 'css',
      minify: true,
    });

    return `<style>${escapeInlineStyle(code.trim())}</style>`;
  });

  // 2. Minifica <style>...</style> já existentes inline
  const styleRegex = /<style(\b[^>]*)>([\s\S]*?)<\/style>/gi;
  html = await replaceAsync(html, styleRegex, async (fullMatch, attrStr, cssContent) => {
    if (!cssContent.trim()) return fullMatch;
    const { code } = await esbuild.transform(cssContent, {
      loader: 'css',
      minify: true,
    });
    return `<style${attrStr}>${escapeInlineStyle(code.trim())}</style>`;
  });

  // 3. Inline e minifica <script src="..."></script> locais e <script>...</script> inline
  const scriptRegex = /<script(\b[^>]*)>([\s\S]*?)<\/script>/gi;
  html = await replaceAsync(html, scriptRegex, async (fullMatch, attrStr, inlineCode) => {
    const attrs = parseAttributes(`<script${attrStr}>`);
    const type = (attrs.type || '').toLowerCase().trim();
    const isJsType = !type || type === 'text/javascript' || type === 'application/javascript' || type === 'module';
    if (!isJsType) {
      return fullMatch;
    }

    if (attrs.src) {
      if (!isLocalAsset(attrs.src)) {
        return fullMatch;
      }

      const relPath = normalizeRelPath(attrs.src.split(/[?#]/)[0]);
      const jsPath = path.join(themeDir, relPath);
      if (!fs.existsSync(jsPath)) {
        throw new Error(`[${theme.id}] Script referenciado não encontrado: ${relPath}`);
      }

      const jsContent = fs.readFileSync(jsPath, 'utf8');
      sourceBytes += Buffer.byteLength(jsContent, 'utf8');
      inlinedFiles.add(relPath);

      const { code } = await esbuild.transform(jsContent, {
        loader: 'js',
        minify: true,
        legalComments: 'none',
      });

      const typeAttr = type === 'module' ? ' type="module"' : '';
      return `<script${typeAttr}>${escapeInlineScript(code.trim())}</script>`;
    }

    if (!inlineCode.trim()) return fullMatch;

    const { code } = await esbuild.transform(inlineCode, {
      loader: 'js',
      minify: true,
      legalComments: 'none',
    });

    const typeAttr = type === 'module' ? ' type="module"' : '';
    return `<script${typeAttr}>${escapeInlineScript(code.trim())}</script>`;
  });

  // 4. Minifica a estrutura HTML final (CSS e JS já foram minificados pelo esbuild)
  const finalHtml = await minifyHtml(html, {
    collapseWhitespace: true,
    conservativeCollapse: false,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: false,
    minifyJS: false,
  });

  // 5. Prepara pasta de saída limpa em dist/<tema.id>
  const targetDir = path.join(outRoot, theme.id);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const outIndexPath = path.join(targetDir, 'index.html');
  fs.writeFileSync(outIndexPath, finalHtml, 'utf8');

  // 6. Copia LICENSE da raiz
  const rootLicense = path.join(ROOT_DIR, 'LICENSE');
  if (fs.existsSync(rootLicense)) {
    fs.copyFileSync(rootLicense, path.join(targetDir, 'LICENSE'));
  }

  // 7. Copia metadados, thumbnails, licenças e ferramentas não embutidas
  const copiedFiles = ['index.html'];
  for (const rel of theme.arquivos) {
    const normalized = normalizeRelPath(rel);
    if (inlinedFiles.has(normalized)) {
      continue;
    }

    const from = path.join(themeDir, normalized);
    const to = path.join(targetDir, normalized);
    if (!fs.existsSync(from)) {
      throw new Error(`[${theme.id}] Arquivo listado no catálogo não encontrado: ${normalized}`);
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copiedFiles.push(normalized);
  }

  const outBytes = Buffer.byteLength(finalHtml, 'utf8');
  const reduction = sourceBytes > 0 ? ((1 - outBytes / sourceBytes) * 100).toFixed(1) : '0.0';

  return {
    id: theme.id,
    destino: theme.destino,
    outDir: targetDir,
    inlinedCount: inlinedFiles.size,
    copiedCount: copiedFiles.length,
    sourceBytes,
    outBytes,
    reduction,
  };
}

function parseCliArgs(argv) {
  let checkDeps = false;
  let outDir = path.join(ROOT_DIR, 'dist');
  const themeArgs = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check-deps') {
      checkDeps = true;
    } else if (arg === '--out') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('O parâmetro --out exige um caminho de pasta.');
      }
      outDir = path.resolve(ROOT_DIR, next);
      i++;
    } else if (arg === '--') {
      continue;
    } else if (arg.startsWith('-')) {
      throw new Error(`Opção desconhecida: ${arg}`);
    } else {
      themeArgs.push(arg);
    }
  }

  return { checkDeps, outDir, themeArgs };
}

async function main() {
  const { checkDeps, outDir, themeArgs } = parseCliArgs(process.argv.slice(2));
  const deps = await loadDependencies();

  if (checkDeps) {
    console.log('Dependências de build verificadas com sucesso.');
    return;
  }

  const catalogPath = path.join(ROOT_DIR, 'catalogo.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catálogo não encontrado: ${catalogPath}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let selected = catalog;

  if (themeArgs.length > 0 && !(themeArgs.length === 1 && /^(all|todos)$/i.test(themeArgs[0]))) {
    const requested = new Set(themeArgs.map((t) => t.trim()).filter(Boolean));
    const unknown = [...requested].filter(
      (name) => !catalog.some((item) => item.id === name || item.destino === name)
    );
    if (unknown.length > 0) {
      throw new Error(`Tema(s) desconhecido(s): ${unknown.join(', ')}`);
    }
    selected = catalog.filter((item) => requested.has(item.id) || requested.has(item.destino));
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Gerando build minificado em: ${outDir}\n`);

  const results = [];
  for (const theme of selected) {
    const res = await buildTheme(theme, outDir, deps);
    results.push(res);
    console.log(
      `  [OK] ${res.id} -> index.html único (${res.inlinedCount} arq. combinados | ${formatKb(res.sourceBytes)} -> ${formatKb(res.outBytes)}, -${res.reduction}%)`
    );
  }

  console.log(`\nBuild concluído: ${results.length} tema(s) prontos em ${outDir}`);
}

main().catch((err) => {
  console.error(`\n[ERRO] ${err.message || err}`);
  process.exit(1);
});

