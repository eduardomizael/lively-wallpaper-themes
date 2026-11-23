(() => {
  'use strict';

  window.ZodiacRegistry = window.ZodiacRegistry || [];

  // Coordenadas normalizadas reais de Scorpius (visão sul, RA crescente para a esquerda)
  // Antares (α) no coração; coroa/garras à direita; cauda em "J" varrendo para baixo e esquerda até Shaula/Lesath.
  const STARS = [
    { id: 'nu',      name: 'Jabbah',     x:  0.60, y: -0.66, mag: 4.00, color: '#cfe0ff' },
    { id: 'beta',    name: 'Acrab',      x:  0.71, y: -0.62, mag: 2.62, color: '#d5e4ff' },
    { id: 'delta',   name: 'Dschubba',   x:  0.78, y: -0.45, mag: 2.32, color: '#cce0ff' },
    { id: 'pi',      name: 'Fang',       x:  0.80, y: -0.24, mag: 2.89, color: '#d4e4ff' },
    { id: 'rho',     name: 'Iklil',      x:  0.82, y: -0.06, mag: 3.86, color: '#d8e6ff' },
    { id: 'sigma',   name: 'Alniyat',    x:  0.48, y: -0.30, mag: 2.89, color: '#dce8ff' },
    { id: 'alpha',   name: 'Antares',    x:  0.36, y: -0.24, mag: 0.96, color: '#ff9d6e', hero: true },
    { id: 'tau',     name: 'Paikauhale', x:  0.26, y: -0.13, mag: 2.82, color: '#cfe2ff' },
    { id: 'epsilon', name: 'Larawag',    x:  0.07, y:  0.17, mag: 2.29, color: '#ffd8a8' },
    { id: 'mu1',     name: 'Xamidimura', x:  0.03, y:  0.38, mag: 3.00, color: '#d6e5ff' },
    { id: 'zeta2',   name: 'Zeta Sco',   x: -0.01, y:  0.60, mag: 3.62, color: '#ffd2a1' },
    { id: 'eta',     name: 'Eta Sco',    x: -0.25, y:  0.65, mag: 3.33, color: '#fff0d2' },
    { id: 'theta',   name: 'Sargas',     x: -0.60, y:  0.63, mag: 1.87, color: '#fff1cc' },
    { id: 'iota1',   name: 'Iota Sco',   x: -0.75, y:  0.47, mag: 3.03, color: '#fff3d6' },
    { id: 'kappa',   name: 'Girtab',     x: -0.68, y:  0.40, mag: 2.41, color: '#d4e4ff' },
    { id: 'lambda',  name: 'Shaula',     x: -0.55, y:  0.30, mag: 1.63, color: '#cbe0ff', hero: true },
    { id: 'upsilon', name: 'Lesath',     x: -0.50, y:  0.32, mag: 2.69, color: '#cfe2ff' }
  ];

  const EDGES = [
    ['nu', 'beta'],
    ['beta', 'delta'],
    ['delta', 'pi'],
    ['pi', 'rho'],
    ['delta', 'sigma'],
    ['sigma', 'alpha'],
    ['alpha', 'tau'],
    ['tau', 'epsilon'],
    ['epsilon', 'mu1'],
    ['mu1', 'zeta2'],
    ['zeta2', 'eta'],
    ['eta', 'theta'],
    ['theta', 'iota1'],
    ['iota1', 'kappa'],
    ['kappa', 'lambda'],
    ['lambda', 'upsilon']
  ];

  // Utilitários de desenho etéreo no estilo atlas celestial / Stellarium
  function strokeHatching(ctx, x0, y0, x1, y1, count, nx, ny, len) {
    ctx.beginPath();
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const mx = x0 + (x1 - x0) * t;
      const my = y0 + (y1 - y0) * t;
      ctx.moveTo(mx - nx * len * 0.5, my - ny * len * 0.5);
      ctx.lineTo(mx + nx * len * 0.5, my + ny * len * 0.5);
    }
    ctx.stroke();
  }

  function makeVolumeFill(ctx, x, y, r, hi = 'rgba(176, 188, 224, 0.72)', mid = 'rgba(116, 128, 166, 0.58)', lo = 'rgba(54, 62, 92, 0.44)') {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.28, r * 0.08, x, y, r * 1.15);
    g.addColorStop(0, hi);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, lo);
    return g;
  }

  function drawSegment(ctx, ax, ay, bx, by, wA, wB, scale, hatchCount = 4) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    const bulge = (wA + wB) * 0.5 * 1.14;

    ctx.beginPath();
    ctx.moveTo(ax + nx * wA, ay + ny * wA);
    ctx.quadraticCurveTo(mx + nx * bulge, my + ny * bulge, bx + nx * wB, by + ny * wB);
    ctx.quadraticCurveTo(bx + ux * wB * 0.35, by + uy * wB * 0.35, bx - nx * wB, by - ny * wB);
    ctx.quadraticCurveTo(mx - nx * bulge, my - ny * bulge, ax - nx * wA, ay - ny * wA);
    ctx.quadraticCurveTo(ax - ux * wA * 0.28, ay - uy * wA * 0.28, ax + nx * wA, ay + ny * wA);
    ctx.closePath();

    ctx.fillStyle = makeVolumeFill(ctx, mx, my, Math.max(len, bulge) * 0.85);
    ctx.fill();

    // Contorno de gravura escura (estilo Stellarium)
    ctx.strokeStyle = 'rgba(12, 16, 30, 0.84)';
    ctx.lineWidth = Math.max(1.2, scale * 0.0065);
    ctx.stroke();

    // Nervura dorsal iluminada e hachura clássica nas laterais
    ctx.save();
    ctx.strokeStyle = 'rgba(195, 208, 240, 0.28)';
    ctx.lineWidth = Math.max(0.9, scale * 0.004);
    ctx.beginPath();
    ctx.moveTo(ax + ux * len * 0.15, ay + uy * len * 0.15);
    ctx.lineTo(bx - ux * len * 0.15, by - uy * len * 0.15);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(14, 18, 34, 0.45)';
    ctx.lineWidth = Math.max(0.75, scale * 0.0032);
    strokeHatching(ctx, ax, ay, bx, by, hatchCount, nx, ny, (wA + wB) * 0.82);
    ctx.restore();
  }

  function drawLeg(ctx, pts, widths, scale) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const wA = widths[i] * scale;
      const wB = widths[i + 1] * scale;
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;

      ctx.beginPath();
      ctx.moveTo(ax + nx * wA, ay + ny * wA);
      ctx.quadraticCurveTo(mx + nx * (wA + wB) * 0.58, my + ny * (wA + wB) * 0.58, bx + nx * wB, by + ny * wB);
      ctx.lineTo(bx - nx * wB, by - ny * wB);
      ctx.quadraticCurveTo(mx - nx * (wA + wB) * 0.58, my - ny * (wA + wB) * 0.58, ax - nx * wA, ay - ny * wA);
      ctx.closePath();

      ctx.fillStyle = makeVolumeFill(ctx, mx, my, len * 0.75, 'rgba(155, 168, 205, 0.62)', 'rgba(98, 110, 148, 0.52)', 'rgba(42, 48, 74, 0.40)');
      ctx.fill();
      ctx.strokeStyle = 'rgba(12, 16, 30, 0.82)';
      ctx.lineWidth = Math.max(1.0, scale * 0.005);
      ctx.stroke();
    }
  }

  function drawPincer(ctx, P, armPts, clawTipA, clawTipB, clawBase, scale, upper) {
    // Braço articulado do pedipalpo
    drawLeg(ctx, armPts, [0.044, 0.038, 0.046], scale);

    // Palma musculosa da garra (chela) + pinças curvas
    const [bx, by] = clawBase;
    const [ax, ay] = clawTipA;
    const [cx, cy] = clawTipB;
    const mx = (ax + cx) * 0.5, my = (ay + cy) * 0.5;
    const dx = mx - bx, dy = my - by;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const palmX = bx + ux * len * 0.36;
    const palmY = by + uy * len * 0.36;
    const palmR = scale * 0.072;

    // Forma contínua da palma + dedo fixo e dedo móvel
    ctx.beginPath();
    ctx.moveTo(bx + nx * palmR * 0.55, by + ny * palmR * 0.55);
    ctx.bezierCurveTo(
      palmX + nx * palmR * 1.45, palmY + ny * palmR * 1.45,
      ax + nx * palmR * 0.55 - ux * palmR * 0.6, ay + ny * palmR * 0.55 - uy * palmR * 0.6,
      ax, ay
    );
    // Lado interno da pinça A até a fenda
    const gapX = palmX + ux * palmR * 0.85;
    const gapY = palmY + uy * palmR * 0.85;
    ctx.quadraticCurveTo(
      (ax + gapX) * 0.5 + nx * palmR * 0.25,
      (ay + gapY) * 0.5 + ny * palmR * 0.25,
      gapX, gapY
    );
    // Lado interno da pinça B até a ponta
    ctx.quadraticCurveTo(
      (cx + gapX) * 0.5 - nx * palmR * 0.25,
      (cy + gapY) * 0.5 - ny * palmR * 0.25,
      cx, cy
    );
    ctx.bezierCurveTo(
      cx - nx * palmR * 0.55 - ux * palmR * 0.6, cy - ny * palmR * 0.55 - uy * palmR * 0.6,
      palmX - nx * palmR * 1.45, palmY - ny * palmR * 1.45,
      bx - nx * palmR * 0.55, by - ny * palmR * 0.55
    );
    ctx.closePath();

    ctx.fillStyle = makeVolumeFill(ctx, palmX, palmY, len * 0.72);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 14, 28, 0.88)';
    ctx.lineWidth = Math.max(1.3, scale * 0.0068);
    ctx.stroke();

    // Hachura clássica na palma
    ctx.save();
    ctx.strokeStyle = 'rgba(14, 18, 34, 0.45)';
    ctx.lineWidth = Math.max(0.8, scale * 0.0032);
    strokeHatching(ctx, bx, by, gapX, gapY, 5, nx, ny, palmR * (upper ? 1.4 : 1.3));
    ctx.restore();
  }

  function renderArt(ctx, project, scale) {
    const pt = (x, y) => project(x, y);
    const byId = Object.fromEntries(STARS.map(s => [s.id, pt(s.x, s.y)]));

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Aura etérea muito sutil envolvendo toda a criatura
    ctx.shadowColor = 'rgba(148, 172, 232, 0.34)';
    ctx.shadowBlur = Math.max(8, scale * 0.032);

    // 1. PERNAS ARTICULADAS (4 pares saindo do tórax/mesossoma)
    const upperLegs = [
      [pt(0.56, -0.36), pt(0.50, -0.58), pt(0.36, -0.72), pt(0.24, -0.76)],
      [pt(0.45, -0.30), pt(0.32, -0.50), pt(0.16, -0.60), pt(0.03, -0.60)],
      [pt(0.34, -0.22), pt(0.18, -0.38), pt(0.02, -0.42), pt(-0.10, -0.39)],
      [pt(0.24, -0.12), pt(0.06, -0.22), pt(-0.10, -0.20), pt(-0.20, -0.14)]
    ];
    const lowerLegs = [
      [pt(0.60, -0.24), pt(0.74, -0.08), pt(0.84, 0.06), pt(0.89, 0.16)],
      [pt(0.50, -0.18), pt(0.64, 0.02),  pt(0.70, 0.20), pt(0.69, 0.33)],
      [pt(0.40, -0.10), pt(0.52, 0.14),  pt(0.53, 0.32), pt(0.48, 0.45)],
      [pt(0.29, -0.02), pt(0.38, 0.22),  pt(0.36, 0.40), pt(0.28, 0.52)]
    ];
    for (const leg of upperLegs) drawLeg(ctx, leg, [0.028, 0.023, 0.017, 0.008], scale);
    for (const leg of lowerLegs) drawLeg(ctx, leg, [0.028, 0.023, 0.017, 0.008], scale);

    // 2. PEDIPALPOS / GARRAS (alinhados com Jabbah, Acrab, Dschubba, Fang e Iklil)
    drawPincer(
      ctx, pt,
      [pt(0.57, -0.35), pt(0.60, -0.50), pt(0.68, -0.58)],
      pt(0.74, -0.78),
      pt(0.90, -0.62),
      pt(0.68, -0.58),
      scale, true
    );
    drawPincer(
      ctx, pt,
      [pt(0.62, -0.25), pt(0.74, -0.28), pt(0.81, -0.22)],
      pt(0.96, -0.32),
      pt(0.88, -0.02),
      pt(0.81, -0.22),
      scale, false
    );

    // 3. CAUDA CURVA (METASSOMA) — segue exatamente ε -> μ -> ζ -> η -> θ -> ι -> κ -> λ
    const tailChain = [
      { a: byId.tau,     b: byId.epsilon, wA: 0.092, wB: 0.072, h: 4 },
      { a: byId.epsilon, b: byId.mu1,     wA: 0.068, wB: 0.056, h: 4 },
      { a: byId.mu1,     b: byId.zeta2,   wA: 0.054, wB: 0.048, h: 4 },
      { a: byId.zeta2,   b: byId.eta,     wA: 0.047, wB: 0.044, h: 4 },
      { a: byId.eta,     b: byId.theta,   wA: 0.044, wB: 0.041, h: 5 },
      { a: byId.theta,   b: byId.iota1,   wA: 0.040, wB: 0.036, h: 4 },
      { a: byId.iota1,   b: byId.kappa,   wA: 0.036, wB: 0.033, h: 3 }
    ];
    for (const seg of tailChain) {
      drawSegment(ctx, seg.a[0], seg.a[1], seg.b[0], seg.b[1], seg.wA * scale, seg.wB * scale, scale, seg.h);
    }

    // 4. TELSON / FERRÃO VENENOSO (alinhado com κ Girtab -> λ Shaula / υ Lesath)
    {
      const [kx, ky] = byId.kappa;
      const [lx, ly] = byId.lambda;
      const [ux, uy] = byId.upsilon;
      const tipX = lx + (ux - kx) * 0.55;
      const tipY = ly - scale * 0.055;
      const bulbX = (kx + lx) * 0.54;
      const bulbY = (ky + ly) * 0.54;
      const rBulb = scale * 0.048;

      ctx.beginPath();
      ctx.moveTo(kx - scale * 0.022, ky - scale * 0.015);
      ctx.bezierCurveTo(
        bulbX - rBulb * 1.15, bulbY - rBulb * 0.95,
        lx - rBulb * 0.35, ly - rBulb * 1.15,
        tipX, tipY
      );
      ctx.bezierCurveTo(
        lx + rBulb * 0.35, ly - rBulb * 0.25,
        bulbX + rBulb * 1.10, bulbY + rBulb * 0.95,
        kx + scale * 0.026, ky + scale * 0.020
      );
      ctx.closePath();

      ctx.fillStyle = makeVolumeFill(ctx, bulbX, bulbY, rBulb * 1.7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 14, 28, 0.88)';
      ctx.lineWidth = Math.max(1.2, scale * 0.0065);
      ctx.stroke();
    }

    // 5. MESOSSOMA (placas dorsais segmentadas do corpo em torno de Antares e Tau)
    const bodyPlates = [
      { a: pt(0.55, -0.33), b: pt(0.45, -0.28), wA: 0.105, wB: 0.128, h: 4 },
      { a: pt(0.45, -0.28), b: pt(0.36, -0.23), wA: 0.128, wB: 0.136, h: 4 },
      { a: pt(0.36, -0.23), b: pt(0.27, -0.14), wA: 0.132, wB: 0.112, h: 4 }
    ];
    for (const pl of bodyPlates) {
      drawSegment(ctx, pl.a[0], pl.a[1], pl.b[0], pl.b[1], pl.wA * scale, pl.wB * scale, scale, pl.h);
    }

    // 6. PROSSOMA / CARAPAÇA CEFÁLICA + QUELÍCERAS (entre σ Alniyat e δ Dschubba)
    {
      const [hx, hy] = pt(0.57, -0.32);
      const [fx, fy] = pt(0.68, -0.37);
      const rH = scale * 0.095;
      const ang = Math.atan2(fy - hy, fx - hx);

      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-rH * 0.85, -rH * 0.92);
      ctx.quadraticCurveTo(rH * 0.35, -rH * 1.05, rH * 1.05, -rH * 0.42);
      ctx.quadraticCurveTo(rH * 1.25, 0, rH * 1.05, rH * 0.42);
      ctx.quadraticCurveTo(rH * 0.35, rH * 1.05, -rH * 0.85, rH * 0.92);
      ctx.quadraticCurveTo(-rH * 1.05, 0, -rH * 0.85, -rH * 0.92);
      ctx.closePath();

      ctx.fillStyle = makeVolumeFill(ctx, 0, 0, rH * 1.25);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 14, 28, 0.88)';
      ctx.lineWidth = Math.max(1.3, scale * 0.0068);
      ctx.stroke();

      // Olhos medianos sutis e sulco da carapaça
      ctx.fillStyle = 'rgba(12, 16, 30, 0.85)';
      ctx.beginPath();
      ctx.arc(rH * 0.38, -rH * 0.16, Math.max(1.6, scale * 0.0075), 0, Math.PI * 2);
      ctx.arc(rH * 0.38,  rH * 0.16, Math.max(1.6, scale * 0.0075), 0, Math.PI * 2);
      ctx.fill();

      // Pequenas quelíceras frontais
      ctx.strokeStyle = 'rgba(10, 14, 28, 0.82)';
      ctx.lineWidth = Math.max(1.1, scale * 0.0055);
      ctx.beginPath();
      ctx.moveTo(rH * 1.0, -rH * 0.20);
      ctx.quadraticCurveTo(rH * 1.38, -rH * 0.30, rH * 1.42, -rH * 0.08);
      ctx.moveTo(rH * 1.0,  rH * 0.20);
      ctx.quadraticCurveTo(rH * 1.38,  rH * 0.30, rH * 1.42,  rH * 0.08);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  window.ZodiacRegistry.push({
    id: 'scorpius',
    name: 'Scorpius',
    namePt: 'Escorpião',
    symbol: '♏',
    // Posição padrão na tela (centralizada para ajuste do estilo inicial)
    anchor: { x: 0.50, y: 0.51 },
    scaleFactor: 0.34,
    labelOffset: { x: 0.06, y: 0.02 },
    stars: STARS,
    edges: EDGES,
    renderArt
  });
})();
