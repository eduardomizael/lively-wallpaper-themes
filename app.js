(() => {
  'use strict';
  const E = window.CircuitEngine, canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
  const controls = document.querySelector('#controls'), notice = document.querySelector('#notice');
  const preview = new URLSearchParams(location.search).has('preview');
  const demo = new URLSearchParams(location.search).has('demo');
  const config = { accent: '#49e5ff', speed: 160, glow: 70, trail: 180, circleSize: 100, monitor: 0, grid: true };
  let map = null, icons = [], width = 0, height = 0, signature = '', bounds, chosen = '';
  let route = null, target = null, progress = 0, phase = 'travel', angle = 0, visited = new Set(), head = null;
  let tail = [], residue = [], last = 0, collecting = false;
  let travelled = 0, roundLength = 0;
  controls.hidden = !preview;
  function color(alpha) {
    const hex = config.accent.replace('#', '');
    return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuild(true);
  }
  function chooseBounds() {
    const monitors = map.monitors, all = E.virtualBounds(monitors), dpr = devicePixelRatio || 1;
    if (config.monitor === 1) { chosen = 'Área estendida'; return all; }
    if (config.monitor >= 2) { const index = Math.min(monitors.length - 1, config.monitor - 2); chosen = `Monitor ${index + 1}`; return monitors[index]; }
    // Spanning windows match the virtual desktop's physical size.
    if (monitors.length > 1 && Math.abs(width * dpr - all.width) < 12 && Math.abs(height * dpr - all.height) < 12) { chosen = 'Área estendida (automático)'; return all; }
    const originX = (window.screenX || 0) * dpr, originY = (window.screenY || 0) * dpr;
    const sorted = monitors.map((m, i) => ({ m, i, score: Math.abs(m.width - screen.width * dpr) + Math.abs(m.height - screen.height * dpr) + Math.hypot(m.x - originX, m.y - originY) }))
      .sort((a, b) => a.score - b.score);
    chosen = `Monitor ${sorted[0].i + 1} (automático)`;
    return sorted[0].m;
  }
  function rebuild(force = false) {
    if (!map?.monitors?.length || !width) return;
    bounds = chooseBounds();
    const next = E.project(map.icons, bounds, width, height).map(i => ({ ...i, radius: (i.radius + 3) * config.circleSize / 100 }));
    const nextSignature = JSON.stringify(next);
    if (!force && nextSignature === signature) return;
    signature = nextSignature; icons = next;
    visited.clear(); route = null; head = null; target = null; tail = []; residue = [];
    travelled = 0; roundLength = 0;
    updateStatus();
  }
  function updateStatus() {
    document.querySelector('#status').textContent = `${icons.length} ícones nesta área · ${map?.monitors?.length || 0} monitor(es) · ${chosen}${demo ? ' · DEMONSTRAÇÃO' : ''}`;
    notice.hidden = !preview || (!!map && !map.error && icons.length > 0);
    notice.textContent = map?.error || (!map ? 'Use Coletar posições dos ícones para ler a área de trabalho.' : 'Nenhum ícone salvo nesta área. Confira a seleção do monitor ou colete novamente.');
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
  function refreshMap() {
    const script = document.createElement('script');
    script.src = `settings/desktop-map.js?t=${Date.now()}`;
    script.onload = script.onerror = () => { script.remove(); updateStatus(); };
    document.head.appendChild(script);
  }
  function apply(name, value) {
    if (name === 'collectIcons') { collectIcons(); return; }
    if (!(name in config)) return;
    if (name === 'accent') { if (!/^#[\da-f]{6}$/i.test(value)) return; }
    else if (name === 'grid') value = value === true || value === 'true';
    else { value = Number(value); if (!Number.isFinite(value)) return; }
    config[name] = value;
    document.documentElement.style.setProperty('--accent', config.accent);
    const input = document.getElementById(name);
    if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; }
    if (name === 'monitor' || name === 'circleSize') rebuild(true);
    updateStatus();
  }
  window.livelyPropertyListener = apply;
  let collectionTimer = null, collectionDeadline = null, collectionStarted = 0;
  function finishCollection(message) {
    clearInterval(collectionTimer); clearTimeout(collectionDeadline);
    collecting = false;
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
    collecting = true;
    const button = document.querySelector('#collectIcons'), message = document.querySelector('#collectStatus');
    button.disabled = true; message.textContent = 'Coletando posições no Windows…';
    collectionStarted = Date.now();
    // Windows launches the registered utility once; it exits after saving the settings.
    location.href = 'circuit-orbit://collect';
    collectionTimer = setInterval(() => {
      const script = document.createElement('script');
      script.src = `settings/collection-result.js?t=${Date.now()}`;
      script.onload = script.onerror = () => script.remove();
      document.head.appendChild(script);
    }, 600);
    collectionDeadline = setTimeout(() => finishCollection('Coleta não confirmada. Configure o botão com Configurar-utilitario.cmd e autorize a abertura do utilitário quando solicitado.'), 30000);
  }
  document.querySelector('#collectIcons').onclick = collectIcons;
  for (const input of controls.querySelectorAll('input,select')) input.addEventListener('input', () => apply(input.id, input.type === 'checkbox' ? input.checked : input.value));
  document.querySelector('#hide').onclick = () => { controls.hidden = true; };
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'p') controls.hidden = !controls.hidden; });
  function nextTarget() {
    if (!icons.length) return;
    const newRound = !route || visited.size >= icons.length;
    if (visited.size >= icons.length) { visited.clear(); if (icons.length > 1 && target) visited.add(target.id); }
    const from = head || { x: width / 2, y: height / 2 };
    if (newRound) roundLength = E.tourLength(from, icons, visited);
    target = E.nearest(from, icons, visited);
    if (!target) { visited.clear(); target = icons[0]; }
    const entry = { x: target.x, y: target.y - target.radius };
    route = E.polyline(E.circuit(from, entry)); progress = 0; angle = 0; phase = 'travel';
  }
  function pathStroke(points, alpha, lineWidth) {
    if (points.length < 2) return;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = color(alpha); ctx.lineWidth = lineWidth; ctx.stroke();
  }
  function frame(now) {
    const dt = Math.min((now - last) / 1000 || 0, 0.05); last = now;
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(width * .52, height * .42, 0, width * .52, height * .42, width * .8);
    bg.addColorStop(0, '#091824'); bg.addColorStop(1, '#02060c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    if (config.grid) {
      ctx.fillStyle = color(.11);
      for (let x = 24; x < width; x += 48) for (let y = 24; y < height; y += 48) ctx.fillRect(x, y, 1, 1);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const intensity = config.glow / 100;
    if (icons.length) {
      if (!route) nextTarget();
      if (phase === 'travel') {
        const step = Math.min(config.speed * dt, Math.max(0, route.total - progress));
        progress += step; travelled += step;
        head = E.sample(route, progress);
        if (progress >= route.total) { phase = 'orbit'; angle = 0; }
      } else {
        const nextAngle = Math.min(Math.PI * 2, angle + dt * config.speed / Math.max(1, target.radius));
        // Sample the actual arc, so the retained outline stays round even at low frame rates.
        const arcDistance = (nextAngle - angle) * target.radius;
        const samples = Math.max(1, Math.ceil(arcDistance / 2));
        for (let i = 1; i <= samples; i++) {
          const a = angle + (nextAngle - angle) * i / samples;
          const p = { x: target.x + Math.sin(a) * target.radius, y: target.y - Math.cos(a) * target.radius };
          tail.push({ ...p, time: now }); residue.push({ ...p, distance: travelled + arcDistance * i / samples });
        }
        travelled += (nextAngle - angle) * target.radius;
        angle = nextAngle;
        head = { x: target.x + Math.sin(angle) * target.radius, y: target.y - Math.cos(angle) * target.radius };
        if (angle >= Math.PI * 2) { visited.add(target.id); nextTarget(); }
      }
      if (head && (!tail.length || E.distance(tail[tail.length - 1], head) > .4)) {
        tail.push({ ...head, time: now }); residue.push({ ...head, distance: travelled });
      }
      // Keep almost a full round of actual travelled geometry, regardless of speed or elapsed time.
      const cutoff = travelled - roundLength * .95;
      const firstVisible = residue.findIndex(p => p.distance >= cutoff);
      if (firstVisible > 1) residue.splice(0, firstVisible - 1);
      let bucket = -1, points = [];
      for (let i = 1; i < residue.length; i++) {
        const opacity = E.residueOpacity(residue[i].distance, travelled, roundLength);
        const nextBucket = Math.min(15, Math.floor(opacity * 16));
        if (nextBucket !== bucket) {
          pathStroke(points, (bucket + .5) / 16 * .12 * intensity, 1);
          points = [residue[i - 1]]; bucket = nextBucket;
        }
        points.push(residue[i]);
      }
      pathStroke(points, (bucket + .5) / 16 * .12 * intensity, 1);
      tail = tail.filter(p => now - p.time < 1500);
      let length = 0;
      for (let i = tail.length - 1; i > 0; i--) { length += E.distance(tail[i], tail[i - 1]); if (length > config.trail) { tail.splice(0, i); break; } }
      ctx.shadowColor = config.accent; ctx.shadowBlur = 9 * intensity;
      for (let i = 1; i < tail.length; i++) pathStroke([tail[i - 1], tail[i]], (i / tail.length) ** 3 * intensity * .55, 1.3);
      if (head) { ctx.beginPath(); ctx.arc(head.x, head.y, 1.9, 0, Math.PI * 2); ctx.fillStyle = '#e1fcff'; ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    requestAnimationFrame(frame);
  }
  if (demo) {
    map = { monitors: [{ x: 0, y: 0, width: 1920, height: 1080, primary: true }], icons: Array.from({ length: 12 }, (_, i) => ({ id: i, x: 42 + Math.floor(i / 6) * 110, y: 40 + i % 6 * 145, width: 48, height: 48 })) };
  }
  addEventListener('resize', resize); resize();
  if (!demo) refreshMap();
  updateStatus(); requestAnimationFrame(frame);
})();
