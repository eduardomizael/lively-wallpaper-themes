(function (root) {
  'use strict';
  const TAU = Math.PI * 2, SIZE = 192, FRAMES = 24;
  const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const lattice = new Float32Array(4096);
  let seed = 41731;
  for (let i = 0; i < lattice.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; lattice[i] = seed / 4294967296; }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const hash = (a, b) => lattice[(a & 63) + (b & 63) * 64];
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  // Shared, seamless animated density atlas. No per-icon simulation or growing history.
  function createSprites(makeCanvas, accent) {
    const rgb = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16));
    return Array.from({ length: FRAMES }, (_, frame) => {
      const canvas = makeCanvas(SIZE, SIZE), ctx = canvas.getContext('2d'), image = ctx.createImageData(SIZE, SIZE);
      const phase = TAU * frame / FRAMES, cx = Math.cos(phase), cy = Math.sin(phase);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const u = (x + .5) / (SIZE / 2) - 1, v = (y + .5) / (SIZE / 2) - 1;
        const radius = Math.hypot(u, v), angle = Math.atan2(v, u);
        const warp = noise(u * 3 + cx, v * 3 + cy) - .5;
        const a = angle + warp * .9;
        const nx = Math.cos(a) * radius, ny = Math.sin(a) * radius;
        const coarse = noise(nx * 5 + cx * .55, ny * 5 + cy * .55);
        const fine = noise(nx * 14 + coarse * 2 + cy, ny * 14 + cx);
        // Coherent tongues originate at the core. Radial phase travels outward,
        // while warped angular channels curl and break into smaller wisps.
        const channels = Math.sin(a * 5 + radius * 8 + warp * 6 - Math.sin(phase) * 1.4) * .5
          + Math.sin(a * 3 - radius * 11 + coarse * 4 + Math.cos(phase)) * .3
          + Math.sin(a * 9 + radius * 17 + warp * 3) * .2;
        const tongue = smooth((channels + .35) / .95);
        const transport = .5 + .5 * Math.sin(radius * 20 - phase * 2 + a * 3 + coarse * 3);
        const ridge = Math.pow(1 - Math.abs(fine * 2 - 1), 2);
        const edge = 1 - smooth((radius - .64) / .34);
        const envelope = Math.exp(-radius * radius / .33) * edge;
        const flames = tongue * (.2 + transport * .8) * (.23 + ridge * .77) * envelope * smooth((radius - .17) / .22);
        const core = Math.exp(-radius * radius / (.075 + warp * .018));
        const density = core * .62 + flames * .88;
        const hot = Math.min(.78, core * (.7 + coarse * .1));
        const index = (y * SIZE + x) * 4;
        for (let k = 0; k < 3; k++) image.data[index + k] = Math.round(rgb[k] + (255 - rgb[k]) * hot);
        image.data[index + 3] = Math.round(Math.min(.68, density) * 255);
      }
      ctx.putImageData(image, 0, 0); return canvas;
    });
  }
  function drawStation(ctx, sprites, station, time, charge, flare, opacity, intensity) {
    if (!sprites?.length || opacity <= 0) return;
    const { x, y, radius } = station.icon;
    const phase = ((time * .32 + station.spin / TAU) % 1 + 1) % 1 * sprites.length;
    const frame = Math.floor(phase), mix = phase - frame;
    const pulse = .5 + .5 * Math.sin(time * 2.7 + station.spin);
    const ignition = charge ** 4;
    const extent = radius * (2.25 + pulse * .08 - ignition * .3 + flare * .4);
    const strength = opacity * intensity * (.78 + pulse * .12 + ignition * .65 + flare * .55);
    const draw = (index, weight, ox, oy, scale) => {
      ctx.globalAlpha = Math.min(1, strength * weight);
      ctx.drawImage(sprites[index % sprites.length], x - extent * scale + ox, y - extent * scale + oy, extent * scale * 2, extent * scale * 2);
    };
    draw(frame, 1 - mix, 0, 0, 1); draw(frame + 1, mix, 0, 0, 1);
    // The core stays centered; emission expands the entire corona after firing.
    ctx.globalAlpha = 1;
  }
  root.CircuitNucleus = { createSprites, drawStation };
})(window);
