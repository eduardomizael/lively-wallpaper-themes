(() => {
  'use strict';

  const canvas = document.getElementById('sky-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const controls = document.getElementById('controls');
  const urlParams = new URLSearchParams(location.search);
  const isPreview = urlParams.has('preview');

  if (controls) controls.hidden = !isPreview;

  const config = {
    layoutMode: 0,          // 0 = Mapa Completo (12 signos), 1 = Ciclo por Data (signo atual grande no centro)
    dateOffsetDays: 0,      // 0..365 dias de deslocamento para simular outras datas do ano
    starDensity: 100,       // 30..200 (%) quantidade de estrelas de fundo
    twinkleStrength: 65,    // 0..100 (%) cintilação
    hoverRadius: 100,       // 50..180 (%) raio de detecção ao redor da constelação
    lineBrightness: 80,     // 20..150 (%) brilho das linhas ao passar o mouse
    artOpacity: 58,         // 20..100 (%) opacidade da ilustração etérea ao clicar
    showLabels: true,       // exibir nome da constelação e estrelas principais
    revealAll: false,       // exibir todos os 12 desenhos etéreos ao mesmo tempo
    artAutoFade: 10,        // segundos até o desenho desvanecer (0 = fixo)
    milkyWay: 45,           // 0..100 (%) intensidade da Via Láctea sutil
    skyDrift: 25,           // 0..100 (%) micro-paralaxe / deriva suave do céu
    interactiveMouse: true
  };

  // Ordem zodiacal real e data de início [mês (1..12), dia] de cada signo
  const ZODIAC_CALENDAR = [
    { id: 'aries',       month: 3,  day: 21 },
    { id: 'taurus',      month: 4,  day: 20 },
    { id: 'gemini',      month: 5,  day: 21 },
    { id: 'cancer',      month: 6,  day: 21 },
    { id: 'leo',         month: 7,  day: 23 },
    { id: 'virgo',       month: 8,  day: 23 },
    { id: 'libra',       month: 9,  day: 23 },
    { id: 'scorpius',    month: 10, day: 23 },
    { id: 'sagittarius', month: 11, day: 22 },
    { id: 'capricornus', month: 12, day: 22 },
    { id: 'aquarius',    month: 1,  day: 20 },
    { id: 'pisces',      month: 2,  day: 19 }
  ];
  const ZODIAC_INDEX_BY_ID = Object.fromEntries(ZODIAC_CALENDAR.map((z, i) => [z.id, i]));

  function getZodiacPhase(offsetDays = 0) {
    const now = new Date(Date.now() + offsetDays * 86400000);
    const y = now.getFullYear();
    const t = now.getTime();
    // Monta fronteiras contínuas cobrindo o ano anterior, atual e próximo
    const marks = [];
    for (let yr = y - 1; yr <= y + 1; yr++) {
      for (let i = 0; i < ZODIAC_CALENDAR.length; i++) {
        const z = ZODIAC_CALENDAR[i];
        marks.push({ idx: i, ms: new Date(yr, z.month - 1, z.day, 0, 0, 0).getTime() });
      }
    }
    marks.sort((a, b) => a.ms - b.ms);
    for (let i = 0; i < marks.length - 1; i++) {
      if (t >= marks[i].ms && t < marks[i + 1].ms) {
        const frac = (t - marks[i].ms) / Math.max(1, marks[i + 1].ms - marks[i].ms);
        return (marks[i].idx + frac) % 12;
      }
    }
    return 0;
  }

  function wrapDelta12(d) {
    let v = ((d % 12) + 12) % 12;
    if (v > 6) v -= 12;
    return v;
  }

  let width = 1, height = 1, dpr = 1;
  let bgCanvas = document.createElement('canvas');
  let bgStars = [];
  const constellations = [];

  const pointer = {
    x: -9999,
    y: -9999,
    inside: false,
    normX: 0,
    normY: 0,
    smoothX: 0,
    smoothY: 0
  };

  // Gerador determinístico para o campo estelar permanecer consistente
  function mulberry32(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Temperaturas espectrais naturais (O/B/A/F/G/K/M) como no Stellarium
  const STAR_PALETTE = [
    [186, 212, 255], // azul-claro (B)
    [214, 228, 255], // branco-azulado (A)
    [244, 246, 255], // branco puro (F)
    [255, 244, 222], // branco-amarelado (G)
    [255, 220, 172], // âmbar suave (K)
    [255, 186, 138]  // laranja-avermelhado (M)
  ];

  function buildStaticSky() {
    bgCanvas.width = Math.max(1, Math.round(width * dpr));
    bgCanvas.height = Math.max(1, Math.round(height * dpr));
    const g = bgCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Gradiente noturno profundo (índigo zenital -> azul-ardósia sutil no horizonte)
    const skyGrad = g.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0.00, '#040712');
    skyGrad.addColorStop(0.42, '#080e20');
    skyGrad.addColorStop(0.78, '#0f172c');
    skyGrad.addColorStop(1.00, '#162038');
    g.fillStyle = skyGrad;
    g.fillRect(0, 0, width, height);

    // Faixa etérea da Via Láctea passando discretamente atrás de Escorpião (como no céu real!)
    const mwAlpha = (config.milkyWay / 100) * 0.22;
    if (mwAlpha > 0.005) {
      g.save();
      g.translate(width * 0.44, height * 0.56);
      g.rotate(-0.56);
      const band = g.createRadialGradient(0, 0, height * 0.04, 0, 0, Math.max(width, height) * 0.65);
      band.addColorStop(0.0, `rgba(128, 148, 198, ${mwAlpha * 0.95})`);
      band.addColorStop(0.35, `rgba(88, 108, 158, ${mwAlpha * 0.52})`);
      band.addColorStop(0.70, `rgba(48, 62, 104, ${mwAlpha * 0.18})`);
      band.addColorStop(1.0, 'rgba(10, 16, 34, 0)');
      g.scale(1.9, 0.46);
      g.fillStyle = band;
      g.fillRect(-width, -height, width * 2, height * 2);
      g.restore();
    }

    // Vinheta atmosférica sutil
    const vig = g.createRadialGradient(width * 0.5, height * 0.46, Math.min(width, height) * 0.25, width * 0.5, height * 0.5, Math.max(width, height) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,4,10,0.42)');
    g.fillStyle = vig;
    g.fillRect(0, 0, width, height);
  }

  function buildStarfield() {
    const rand = mulberry32(42071);
    const count = Math.round(950 * (config.starDensity / 100));
    bgStars = [];
    for (let i = 0; i < count; i++) {
      const x = rand() * width;
      const y = rand() * height;
      // Distribuição realista: muitas estrelas tênues, poucas brilhantes
      const p = Math.pow(rand(), 3.4);
      const radius = 0.45 + p * 1.75;
      const baseAlpha = 0.20 + p * 0.72;
      const color = STAR_PALETTE[Math.floor(Math.pow(rand(), 1.15) * STAR_PALETTE.length)];
      bgStars.push({
        x, y,
        r: radius,
        a: baseAlpha,
        c: color,
        phase: rand() * Math.PI * 2,
        freq: 0.7 + rand() * 2.4,
        twinkle: rand() < 0.45 ? (0.25 + rand() * 0.55) : 0.08,
        depth: 0.25 + p * 0.75
      });
    }
  }

  function initConstellations() {
    constellations.length = 0;
    const reg = window.ZodiacRegistry || [];
    for (const def of reg) {
      const entry = {
        def,
        zodiacIndex: ZODIAC_INDEX_BY_ID[def.id] ?? 0,
        artImg: null,
        artReady: false,
        artCanvas: document.createElement('canvas'),
        artBounds: { x: 0, y: 0, w: 0, h: 0 },
        projected: [],
        starMap: {},
        center: { x: 0, y: 0 },
        hitRadius: 100,
        scale: 100,
        visibility: 1,
        heroWeight: 0,
        hoverAmount: 0,
        lineAlpha: 0,
        artTarget: 0,
        artAlpha: 0,
        artTimer: 0,
        revealPulse: 0
      };
      if (def.artImage) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { entry.artReady = true; };
        img.src = def.artImage;
        entry.artImg = img;
      }
      constellations.push(entry);
    }
  }

  let lastOrbitalSync = 0;

  function layoutConstellations() {
    const minDim = Math.min(width, height);
    const isCycleMode = Math.round(config.layoutMode) === 1;
    const phase = isCycleMode ? getZodiacPhase(config.dateOffsetDays) : 0;

    for (const c of constellations) {
      const d = c.def;
      let scale, cx, cy;

      if (isCycleMode) {
        // Modo Ciclo por Data: signo atual grande no centro, vizinhos girando em arco suave leste -> oeste
        const delta = wrapDelta12(c.zodiacIndex + 0.5 - phase);
        const absD = Math.abs(delta);
        const hero = Math.exp(-absD * absD * 1.35);
        c.heroWeight = hero;
        c.visibility = absD >= 2.05 ? 0 : Math.max(0, Math.min(1, 1 - (absD - 1.15) / 0.90));

        const ang = delta * 0.62;
        cx = width * (0.50 + Math.sin(ang) * 0.44);
        cy = height * (0.50 + (1 - Math.cos(ang)) * 0.24);
        scale = minDim * (0.145 + hero * 0.205);
      } else {
        c.visibility = 1;
        c.heroWeight = 0;
        scale = minDim * d.scaleFactor;
        cx = width * d.anchor.x;
        cy = height * d.anchor.y;
      }

      c.scale = scale;
      c.center.x = cx;
      c.center.y = cy;

      const project = (nx, ny) => [cx + nx * scale, cy + ny * scale];

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      c.projected = [];
      c.starMap = {};
      for (const s of d.stars) {
        const [sx, sy] = project(s.x, s.y);
        if (sx < minX) minX = sx;
        if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx;
        if (sy > maxY) maxY = sy;
        const item = { ...s, sx, sy };
        c.projected.push(item);
        c.starMap[s.id] = item;
      }

      const bw = maxX - minX;
      const bh = maxY - minY;
      c.hitRadius = Math.max(bw, bh) * (isCycleMode ? 0.56 : 0.52);

      if (d.artRect) {
        c.artBounds = {
          x: cx + d.artRect.x * scale,
          y: cy + d.artRect.y * scale,
          w: d.artRect.w * scale,
          h: d.artRect.h * scale
        };
      } else if (typeof d.renderArt === 'function') {
        const pad = scale * 0.42;
        const ox = Math.floor(minX - pad);
        const oy = Math.floor(minY - pad);
        const ow = Math.max(16, Math.ceil(bw + pad * 2));
        const oh = Math.max(16, Math.ceil(bh + pad * 2));
        c.artBounds = { x: ox, y: oy, w: ow, h: oh };
        c.artCanvas.width = Math.max(1, Math.round(ow * dpr));
        c.artCanvas.height = Math.max(1, Math.round(oh * dpr));
        const ag = c.artCanvas.getContext('2d');
        ag.setTransform(dpr, 0, 0, dpr, 0, 0);
        ag.clearRect(0, 0, ow, oh);
        d.renderArt(ag, (nx, ny) => [cx + nx * scale - ox, cy + ny * scale - oy], scale);
      }
    }
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    buildStaticSky();
    buildStarfield();
    layoutConstellations();
  }

  // Calcula distância mínima do cursor às estrelas ou ao centro da constelação
  function distanceToConstellation(c, px, py) {
    let minD = Math.hypot(px - c.center.x, py - c.center.y) * 0.78;
    for (let i = 0; i < c.projected.length; i++) {
      const s = c.projected[i];
      const d = Math.hypot(px - s.sx, py - s.sy);
      if (d < minD) minD = d;
    }
    return minD;
  }

  function drawStar(x, y, radius, rgb, alpha, haloBoost = 0, diffraction = 0) {
    if (alpha <= 0.01) return;
    const [r, g, b] = rgb;

    // Halo suave
    const haloR = radius * (2.6 + haloBoost * 3.8);
    if (haloR > 1.4) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
      grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * (0.55 + haloBoost * 0.35))})`);
      grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * (0.20 + haloBoost * 0.22))})`);
      grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Espículas de difração discretas em estrelas brilhantes/destacadas
    if (diffraction > 0.08) {
      const spikeLen = radius * (4.0 + diffraction * 5.2);
      ctx.save();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.65, alpha * diffraction * 0.55)})`;
      ctx.lineWidth = Math.max(0.6, radius * 0.36);
      ctx.beginPath();
      ctx.moveTo(x - spikeLen, y);
      ctx.lineTo(x + spikeLen, y);
      ctx.moveTo(x, y - spikeLen);
      ctx.lineTo(x, y + spikeLen);
      ctx.stroke();
      ctx.restore();
    }

    // Núcleo estelar luminoso
    ctx.fillStyle = `rgba(${Math.min(255, r + 35)}, ${Math.min(255, g + 35)}, ${Math.min(255, b + 35)}, ${Math.min(1, alpha)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  // Interação de mouse
  window.addEventListener('pointermove', (e) => {
    if (!config.interactiveMouse) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    pointer.normX = (e.clientX / width - 0.5) * 2;
    pointer.normY = (e.clientY / height - 0.5) * 2;
  });

  window.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });

  window.addEventListener('pointerdown', (e) => {
    if (!config.interactiveMouse || e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('#controls')) return;

    const px = e.clientX;
    const py = e.clientY;
    const ox = -pointer.smoothX * 0.85;
    const oy = -pointer.smoothY * 0.85;
    const radiusScale = config.hoverRadius / 100;
    let best = null;
    let bestDist = Infinity;

    for (const c of constellations) {
      if (c.visibility <= 0.08) continue;
      const d = distanceToConstellation(c, px - ox, py - oy);
      const clickLimit = c.hitRadius * 0.95 * radiusScale;
      if (d <= clickLimit && d < bestDist) {
        best = c;
        bestDist = d;
      }
    }

    if (best) {
      best.artTarget = best.artTarget > 0.5 ? 0 : 1;
      best.artTimer = 0;
      if (best.artTarget > 0.5) best.revealPulse = 1.0;
    }
  });

  // Controles de prévia + Lively API
  function applyProperty(name, value) {
    if (!(name in config)) return;
    const prevDensity = config.starDensity;
    const prevMilky = config.milkyWay;

    if (name === 'showLabels' || name === 'interactiveMouse' || name === 'revealAll') {
      config[name] = value === true || value === 'true' || value === 1;
    } else {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      config[name] = n;
    }

    if (name === 'starDensity' && config.starDensity !== prevDensity) buildStarfield();
    if (name === 'milkyWay' && config.milkyWay !== prevMilky) buildStaticSky();
    if (name === 'layoutMode' || name === 'dateOffsetDays') {
      layoutConstellations();
    }
    if (name === 'revealAll') {
      for (const c of constellations) {
        c.artTarget = config.revealAll ? 1 : 0;
        c.artTimer = 0;
      }
    }

    const el = document.getElementById(name);
    if (el) {
      if (el.type === 'checkbox') el.checked = config[name];
      else el.value = config[name];
    }
  }

  window.livelyPropertyListener = applyProperty;

  Object.keys(config).forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = config[key];
    else el.value = config[key];
    el.addEventListener('input', () => {
      applyProperty(key, el.type === 'checkbox' ? el.checked : Number(el.value));
    });
  });

  function toggleAllConstellations() {
    const anyOff = constellations.some(c => c.artTarget < 0.5);
    config.revealAll = anyOff;
    const el = document.getElementById('revealAll');
    if (el) el.checked = anyOff;
    for (const c of constellations) {
      c.artTarget = anyOff ? 1 : 0;
      c.artTimer = 0;
      if (anyOff) c.revealPulse = 1.0;
    }
  }

  const toggleArtBtn = document.getElementById('toggleArt');
  if (toggleArtBtn) {
    toggleArtBtn.addEventListener('click', toggleAllConstellations);
  }

  const hideBtn = document.getElementById('hide');
  if (hideBtn) hideBtn.addEventListener('click', () => { if (controls) controls.hidden = true; });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      if (controls) controls.hidden = !controls.hidden;
    } else if (e.code === 'Space') {
      const tag = document.activeElement?.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
      e.preventDefault();
      toggleAllConstellations();
    }
  });

  // Pausa automática (Lively Wallpaper + visibilidade da aba)
  let livelyPaused = false;
  let hiddenPaused = Boolean(document.hidden);
  let paused = livelyPaused || hiddenPaused;
  let rafId = 0;
  let lastTime = performance.now();
  let clockTime = 0;

  function syncPaused() {
    const nextPaused = livelyPaused || hiddenPaused;
    if (nextPaused === paused) return;
    paused = nextPaused;
    if (paused) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    } else {
      lastTime = performance.now();
      if (!rafId) rafId = requestAnimationFrame(frame);
    }
  }

  window.livelyWallpaperPlaybackChanged = function (data) {
    let parsed = data;
    try { if (typeof data === 'string') parsed = JSON.parse(data); } catch { parsed = null; }
    livelyPaused = Boolean(parsed && parsed.IsPaused);
    syncPaused();
  };

  document.addEventListener('visibilitychange', () => {
    hiddenPaused = Boolean(document.hidden);
    syncPaused();
  });

  function frame(now) {
    rafId = 0;
    if (paused) return;
    rafId = requestAnimationFrame(frame);

    const dt = Math.min((now - lastTime) * 0.001, 0.05);
    lastTime = now;
    clockTime += dt;

    // Suavização da micro-paralaxe do céu
    const driftAmt = (config.skyDrift / 100) * 14;
    const targetPx = (pointer.inside ? pointer.normX : Math.sin(clockTime * 0.08) * 0.35) * driftAmt;
    const targetPy = (pointer.inside ? pointer.normY : Math.cos(clockTime * 0.06) * 0.25) * driftAmt;
    const kP = 1 - Math.exp(-dt * 2.5);
    pointer.smoothX += (targetPx - pointer.smoothX) * kP;
    pointer.smoothY += (targetPy - pointer.smoothY) * kP;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bgCanvas, 0, 0, width, height);

    // 1. Campo estelar de fundo
    const twAmt = config.twinkleStrength / 100;
    for (let i = 0; i < bgStars.length; i++) {
      const s = bgStars[i];
      const sx = s.x - pointer.smoothX * s.depth;
      const sy = s.y - pointer.smoothY * s.depth;
      const wave = 0.5 + 0.5 * Math.sin(clockTime * s.freq + s.phase);
      const a = s.a * (1 - twAmt * s.twinkle * 0.55 + twAmt * s.twinkle * 0.55 * wave);
      if (s.r > 1.35) {
        drawStar(sx, sy, s.r, s.c, a, 0.15, 0);
      } else {
        ctx.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Atualiza posição orbital periodicamente no modo Ciclo por Data (acompanha o relógio real)
    if (Math.round(config.layoutMode) === 1 && now - lastOrbitalSync > 2000) {
      lastOrbitalSync = now;
      layoutConstellations();
    }

    // 2. As 12 Constelações do Zodíaco
    const radiusScale = config.hoverRadius / 100;
    const lineMult = config.lineBrightness / 100;
    const artMaxOpacity = config.artOpacity / 100;

    for (const c of constellations) {
      const vis = c.visibility;
      if (vis <= 0.005) {
        c.hoverAmount = 0;
        c.lineAlpha = 0;
        continue;
      }
      const ox = -pointer.smoothX * 0.85;
      const oy = -pointer.smoothY * 0.85;

      // Proximidade do cursor
      let targetHover = 0;
      if (config.interactiveMouse && pointer.inside) {
        const d = distanceToConstellation(c, pointer.x - ox, pointer.y - oy);
        const outerR = c.hitRadius * 0.96 * radiusScale;
        const innerR = c.hitRadius * 0.25 * radiusScale;
        if (d < outerR) {
          const u = Math.max(0, Math.min(1, (outerR - d) / Math.max(1, outerR - innerR)));
          targetHover = u * u * (3 - 2 * u);
        }
      }

      if (c.artTarget > 0.5 && !config.revealAll && config.artAutoFade > 0) {
        c.artTimer += dt;
        if (c.artTimer >= config.artAutoFade) c.artTarget = 0;
      }

      const kHover = 1 - Math.exp(-dt * (targetHover > c.hoverAmount ? 4.8 : 2.6));
      c.hoverAmount += (targetHover - c.hoverAmount) * kHover;

      const kArt = 1 - Math.exp(-dt * (c.artTarget > c.artAlpha ? 2.4 : 0.75));
      c.artAlpha += (c.artTarget - c.artAlpha) * kArt;

      if (c.revealPulse > 0) c.revealPulse = Math.max(0, c.revealPulse - dt * 1.1);

      // Enquanto a arte estiver visível, mantém as linhas suavemente visíveis também (como nas fotos!)
      const targetLine = Math.max(c.hoverAmount, c.artAlpha * 0.72);
      const kLine = 1 - Math.exp(-dt * 4.0);
      c.lineAlpha += (targetLine - c.lineAlpha) * kLine;

      // 2a. Ilustração etérea (aparece ao clicar)
      if (c.artAlpha > 0.005) {
        const artSrc = c.artImg ? (c.artReady ? c.artImg : null) : c.artCanvas;
        if (artSrc) {
          ctx.save();
          ctx.globalAlpha = c.artAlpha * artMaxOpacity * vis;
          ctx.shadowColor = 'rgba(138, 166, 232, 0.28)';
          ctx.shadowBlur = Math.max(6, c.scale * 0.025);
          ctx.drawImage(
            artSrc,
            c.artBounds.x + ox,
            c.artBounds.y + oy,
            c.artBounds.w,
            c.artBounds.h
          );
          ctx.restore();
        }
      }

      // Onda etérea muito sutil no instante da revelação
      if (c.revealPulse > 0.01) {
        const p = 1 - c.revealPulse;
        const r = c.hitRadius * (0.35 + p * 1.15);
        ctx.save();
        ctx.strokeStyle = `rgba(170, 198, 255, ${(c.revealPulse * 0.22).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(c.center.x + ox, c.center.y + oy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2b. Linhas delicadas entre as estrelas (aparecem com a aproximação do mouse)
      if (c.lineAlpha > 0.008) {
        const la = Math.min(0.85, c.lineAlpha * 0.56 * lineMult * vis);
        ctx.save();
        ctx.strokeStyle = `rgba(182, 206, 248, ${la.toFixed(3)})`;
        ctx.lineWidth = 1.05;
        ctx.shadowColor = `rgba(148, 184, 255, ${(la * 0.55).toFixed(3)})`;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        for (const [idA, idB] of c.def.edges) {
          const a = c.starMap[idA];
          const b = c.starMap[idB];
          if (!a || !b) continue;
          ctx.moveTo(a.sx + ox, a.sy + oy);
          ctx.lineTo(b.sx + ox, b.sy + oy);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 2c. Estrelas da constelação: discretas no estado normal, mais destacadas no hover e piscando levemente quando selecionada
      const highlight = Math.max(c.hoverAmount, c.artAlpha * 0.85);
      const selected = c.artAlpha;
      for (let i = 0; i < c.projected.length; i++) {
        const s = c.projected[i];
        const rgb = hexToRgb(s.color);
        // Magnitude -> raio natural: sem grande destaque quando ocioso, cresce suavemente no hover
        const magNorm = Math.max(0, Math.min(1, (4.3 - s.mag) / 3.4));
        const baseR = 0.95 + magNorm * 1.15;

        // Cintilação orgânica fora de fase quando a constelação está selecionada
        const w1 = 0.5 + 0.5 * Math.sin(clockTime * (2.5 + (i % 5) * 0.42) + i * 2.13);
        const w2 = 0.5 + 0.5 * Math.sin(clockTime * (1.3 + (i % 3) * 0.35) + i * 0.97);
        const blink = (w1 * 0.65 + w2 * 0.35); // 0..1 suave
        const blinkAmp = selected * (0.28 + 0.72 * blink); // 0.28..1.0 quando selecionada

        const radius = baseR * (1 + highlight * 0.55) * (1 - selected * 0.08 + blinkAmp * 0.18);
        const tw = 0.88 + 0.12 * Math.sin(clockTime * (1.4 + i * 0.19) + i * 1.7);
        const baseAlpha = (0.58 + magNorm * 0.34) * tw;
        const alpha = Math.min(1, (baseAlpha + highlight * 0.32) * (1 - selected * 0.28 + blinkAmp * 0.34)) * vis;
        const haloBoost = (0.12 + highlight * (0.75 + magNorm * 0.55)) * (1 - selected * 0.25 + blinkAmp * 0.55);
        const diff = highlight * (s.hero ? 0.95 : magNorm * 0.48) * (1 - selected * 0.35 + blinkAmp * 0.65);

        drawStar(s.sx + ox, s.sy + oy, radius, rgb, alpha, haloBoost, diff);

        // Nome de estrelas principais (ex.: Antares) quando a arte está ativa
        if (config.showLabels && s.hero && c.artAlpha > 0.15) {
          ctx.save();
          ctx.font = '500 12px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = `rgba(232, 238, 252, ${(c.artAlpha * 0.82 * vis).toFixed(3)})`;
          ctx.shadowColor = 'rgba(4, 8, 18, 0.9)';
          ctx.shadowBlur = 4;
          ctx.fillText(s.name, s.sx + ox + radius + 7, s.sy + oy + 4);
          ctx.restore();
        }
      }

      // 2d. Nome da constelação sutil (aparece com hover forte ou com o desenho)
      const labelAlpha = Math.max(c.hoverAmount * 0.48, c.artAlpha * 0.78) * vis;
      if (config.showLabels && labelAlpha > 0.04) {
        const lx = c.center.x + c.def.labelOffset.x * c.scale + ox;
        const ly = c.center.y + c.def.labelOffset.y * c.scale + oy;
        ctx.save();
        ctx.font = 'italic 400 17px Georgia, "Times New Roman", serif';
        ctx.fillStyle = `rgba(216, 224, 244, ${labelAlpha.toFixed(3)})`;
        ctx.shadowColor = 'rgba(4, 8, 18, 0.92)';
        ctx.shadowBlur = 6;
        ctx.textAlign = 'center';
        ctx.fillText(`${c.def.namePt} · ${c.def.name}`, lx, ly);
        ctx.restore();
      }
    }
  }

  initConstellations();
  resize();
  window.addEventListener('resize', resize);
  if (!paused) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }
})();
