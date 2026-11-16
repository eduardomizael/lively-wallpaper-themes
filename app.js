(() => {
  'use strict';
  const E = window.CircuitEngine, canvas = document.querySelector('#scene'), ctx = canvas.getContext('2d');
  const A = window.CircuitAtmosphere, fogCanvas = document.querySelector('#atmosphere'), fogCtx = fogCanvas.getContext('2d');
  const controls = document.querySelector('#controls'), notice = document.querySelector('#notice');
  const params = new URLSearchParams(location.search), preview = params.has('preview'), demo = params.has('demo');
  const config = { accent: '#49e5ff', speed: 160, glow: 70, trail: 180, circleSize: 100, chargeTime: 1000, persistencePercent: 60, frameRate: 1, monitor: 0, grid: true, fogStrength: 45, dustCount: 32, impactStrength: 40, mouseFog: true, mouseFogStrength: 35, mouseFogSize: 260 };
  const ranges = { speed: [40, 800], glow: [10, 100], trail: [60, 700], circleSize: [40, 200], chargeTime: [300, 2400], persistencePercent: [1, 99], frameRate: [0, 1], monitor: [0, 9], fogStrength: [0, 100], dustCount: [0, 70], impactStrength: [0, 100], mouseFogStrength: [0, 100], mouseFogSize: [60, 500] };
  let rgb = '73,229,255', map = null, system = null, width = 0, height = 0, signature = '', chosen = '';
  let framePending = false, lastDraw = null, nextDraw = 0, collecting = false;
  let collectionTimer = null, collectionDeadline = null, collectionStarted = 0;
  const field = new A.Atmosphere(1, 1);
  const makeCanvas = (width, height) => { const image = document.createElement('canvas'); image.width = width; image.height = height; return image; };
  let sprites = A.createSprites(makeCanvas, config.accent), fogDirty = true, lastFog = -1;
  controls.hidden = !preview;
  const rgba = alpha => `rgba(${rgb},${alpha})`;
  function schedule() {
    if ((system?.icons.length || field.moving(config)) && !framePending) { framePending = true; requestAnimationFrame(frame); }
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fogScale = Math.min(devicePixelRatio || 1, 3840 / width, 2160 / height);
    fogCanvas.width = Math.max(1, Math.round(width * fogScale)); fogCanvas.height = Math.max(1, Math.round(height * fogScale));
    fogCtx.setTransform(fogScale, 0, 0, fogScale, 0, 0);
    fogCtx.imageSmoothingEnabled = true; fogCtx.imageSmoothingQuality = 'high';
    field.resize(width, height); field.waves = []; fogDirty = true;
    rebuild(true);
    schedule();
  }
  function chooseBounds() {
    const monitors = map.monitors, all = E.virtualBounds(monitors), dpr = devicePixelRatio || 1;
    if (config.monitor === 1) { chosen = 'Área estendida'; return all; }
    if (config.monitor >= 2) { const index = Math.min(monitors.length - 1, config.monitor - 2); chosen = `Monitor ${index + 1}`; return monitors[index]; }
    if (monitors.length > 1 && Math.abs(width * dpr - all.width) < 12 && Math.abs(height * dpr - all.height) < 12) { chosen = 'Área estendida (automático)'; return all; }
    const originX = (window.screenX || 0) * dpr, originY = (window.screenY || 0) * dpr;
    const sorted = monitors.map((m, i) => ({ m, i, score: Math.abs(m.width - screen.width * dpr) + Math.abs(m.height - screen.height * dpr) + Math.hypot(m.x - originX, m.y - originY) })).sort((a, b) => a.score - b.score);
    chosen = `Monitor ${sorted[0].i + 1} (automático)`;
    return sorted[0].m;
  }
  function rebuild(force = false) {
    if (!map?.monitors?.length || !width) return;
    const icons = E.project(map.icons, chooseBounds(), width, height).map(i => ({ ...i, radius: (i.radius + 3) * config.circleSize / 100 }));
    const nextSignature = JSON.stringify(icons);
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    system = new E.PulseSystem(icons, { width, height, ...config });
    field.waves = [];
    ctx.clearRect(0, 0, width, height); lastDraw = null; nextDraw = 0;
    updateStatus(); schedule();
  }
  function updateStatus() {
    document.querySelector('#status').textContent = `${system?.icons.length || 0} ícones · ${map?.monitors?.length || 0} monitor(es) · ${chosen}${demo ? ' · DEMONSTRAÇÃO' : ''}`;
    notice.hidden = !preview || (!!map && !map.error && system?.icons.length > 0);
    notice.textContent = map?.error || (!map ? 'Use Coletar posições dos ícones para salvar o mapa da área de trabalho.' : 'Nenhum ícone salvo nesta área. Confira o monitor ou colete novamente.');
  }
  window.receiveDesktopMap = next => {
    if (demo) return;
    map = next;
    const select = document.querySelector('#monitor');
    if (select.options.length !== next.monitors.length + 2) {
      select.querySelectorAll('option[data-monitor]').forEach(o => o.remove());
      next.monitors.forEach((m, i) => { const o = new Option(`Monitor ${i + 1}${m.primary ? ' (principal)' : ''}`, i + 2); o.dataset.monitor = ''; select.add(o); });
      select.value = config.monitor;
    }
    rebuild(); updateStatus();
  };
  function loadScript(url, done = () => {}) {
    const script = document.createElement('script'); script.src = `${url}?t=${Date.now()}`;
    script.onload = script.onerror = () => { script.remove(); done(); };
    document.head.appendChild(script);
  }
  function apply(name, value) {
    if (name === 'collectIcons') { collectIcons(); return; }
    if (!(name in config)) return;
    if (name === 'accent') { if (!/^#[\da-f]{6}$/i.test(value)) return; }
    else if (name === 'grid' || name === 'mouseFog') value = value === true || value === 'true';
    else { value = Number(value); if (!Number.isFinite(value)) return; value = E.clamp(value, ...ranges[name]); }
    config[name] = value;
    if (name === 'accent') sprites = A.createSprites(makeCanvas, config.accent);
    if (name === 'accent' || name === 'fogStrength') fogDirty = true;
    if (name === 'impactStrength' && !value) field.waves = [];
    if ((name === 'mouseFog' || name === 'mouseFogStrength') && !value) field.clearPointer();
    rgb = [1, 3, 5].map(start => parseInt(config.accent.slice(start, start + 2), 16)).join(',');
    document.documentElement.style.setProperty('--accent', config.accent);
    document.documentElement.style.setProperty('--grid-color', rgba(.09));
    document.body.classList.toggle('with-grid', config.grid);
    const input = document.getElementById(name);
    if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; }
    if (name === 'monitor' || name === 'circleSize') rebuild(true);
    else system?.setOptions(config);
    updateStatus(); schedule();
    if (!config.fogStrength) { fogCtx.clearRect(0, 0, width, height); fogDirty = false; }
    if (!system?.icons.length && !field.moving(config)) ctx.clearRect(0, 0, width, height);
  }
  window.livelyPropertyListener = apply;
  function finishCollection(message) {
    clearInterval(collectionTimer); clearTimeout(collectionDeadline); collecting = false;
    document.querySelector('#collectIcons').disabled = false;
    document.querySelector('#collectStatus').textContent = message;
  }
  window.receiveCollectionResult = result => {
    if (!collecting || Date.parse(result.completedAt) < collectionStarted) return;
    if (!result.ok) { finishCollection(`Falha na coleta: ${result.error}`); return; }
    window.receiveDesktopMap(result.map);
    finishCollection(`Mapa salvo · ${result.map.icons.length} ícones · ${new Date(result.completedAt).toLocaleTimeString('pt-BR')}`);
  };
  function collectIcons() {
    if (collecting) return;
    collecting = true; collectionStarted = Date.now();
    document.querySelector('#collectIcons').disabled = true;
    document.querySelector('#collectStatus').textContent = 'Coletando posições no Windows…';
    try { location.href = 'circuit-orbit-v2://collect'; }
    catch { finishCollection('Configure o botão executando Configurar-utilitario.cmd.'); return; }
    collectionTimer = setInterval(() => loadScript('settings/collection-result.js'), 600);
    collectionDeadline = setTimeout(() => finishCollection('Coleta não confirmada. Execute Configurar-utilitario.cmd e autorize a abertura do utilitário quando solicitado.'), 30000);
  }
  document.querySelector('#collectIcons').onclick = collectIcons;
  for (const input of controls.querySelectorAll('input,select')) input.addEventListener('input', () => apply(input.id, input.type === 'checkbox' ? input.checked : input.value));
  document.querySelector('#hide').onclick = () => { controls.hidden = true; };
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'p') controls.hidden = !controls.hidden; });
  addEventListener('mousemove', event => {
    if (!config.mouseFog || !config.mouseFogStrength || event.target?.closest?.('#controls')) { field.leavePointer(); return; }
    if (field.movePointer(event.clientX, event.clientY)) schedule();
  });
  addEventListener('mouseleave', () => field.leavePointer());
  addEventListener('blur', () => field.leavePointer());
  function frame(now) {
    framePending = false;
    if (!system?.icons.length && !field.moving(config)) { ctx.clearRect(0, 0, width, height); return; }
    const interval = 1000 / (config.frameRate === 0 ? 30 : 60);
    if (now + .4 < nextDraw) { schedule(); return; }
    const elapsed = lastDraw === null ? 0 : now - lastDraw;
    const dt = Math.min(elapsed / 1000, .05);
    lastDraw = now;
    nextDraw = nextDraw && now - nextDraw < interval ? nextDraw + interval : now + interval;
    field.update(dt);
    const previousSequence = system?.sequence;
    system?.update(dt);
    if (config.impactStrength > 0 && system?.sequence !== previousSequence && system?.current) field.impact(system.current);
    if (fogDirty || (config.fogStrength > 0 && field.time - lastFog >= .05)) {
      fogCtx.clearRect(0, 0, width, height);
      A.drawFog(fogCtx, field, sprites, config.fogStrength); fogDirty = false; lastFog = field.time;
    }
    ctx.clearRect(0, 0, width, height);
    A.drawDetails(ctx, field, sprites, config, rgba);
    if (system?.icons.length) window.CircuitHud.drawScene(ctx, system, config, rgba);
    schedule();
  }
  if (demo) {
    map = { monitors: [{ x: 0, y: 0, width: 1920, height: 1080, primary: true }], icons: Array.from({ length: 15 }, (_, i) => ({ id: i, x: 130 + i % 5 * 350, y: 150 + Math.floor(i / 5) * 300, width: 48, height: 48 })) };
  }
  addEventListener('resize', resize); resize();
  if (!demo) loadScript('settings/desktop-map.js', updateStatus);
  updateStatus();
})();
