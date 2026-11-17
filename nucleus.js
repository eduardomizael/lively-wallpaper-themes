(function (root) {
  'use strict';
  const TAU = Math.PI * 2, SIZE = 192, FRAMES = 24;
  const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
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
        const a = angle + warp * 1.7 + phase * .16;
        const nx = Math.cos(a) * radius, ny = Math.sin(a) * radius;
        const coarse = noise(nx * 5 + cx * .8, ny * 5 + cy * .8);
        const fine = noise(nx * 13 + coarse * 2 + cy, ny * 13 + cx);
        const ridge = Math.pow(1 - Math.abs(fine * 2 - 1), 3);
        const envelope = Math.exp(-(((radius - (.3 + warp * .48)) / .37) ** 2));
        const hole = .12 + .88 * smooth((radius - .1) / .23), edge = 1 - smooth((radius - .7) / .28);
        const density = envelope * hole * edge * smooth((coarse - .19) / .5) * (.12 + ridge * .95);
        const index = (y * SIZE + x) * 4;
        for (let k = 0; k < 3; k++) image.data[index + k] = Math.min(255, rgb[k] * (.82 + ridge * .18));
        image.data[index + 3] = Math.round(Math.min(.65, density * .58) * 255);
      }
      ctx.putImageData(image, 0, 0); return canvas;
    });
  }
  function drawStation(ctx, sprites, station, time, charge, flare, opacity, intensity) {
    if (!sprites?.length || opacity <= 0) return;
    const { x, y, radius } = station.icon;
    const phase = ((time * .19 + station.spin / TAU) % 1 + 1) % 1 * sprites.length;
    const frame = Math.floor(phase), mix = phase - frame;
    const pulse = .5 + .5 * Math.sin(time * 2.7 + station.spin);
    const ignition = charge ** 4;
    const extent = radius * (2.15 + pulse * .09 - ignition * .22 + flare * .12);
    const strength = opacity * intensity * (.63 + pulse * .1 + ignition * .6 + flare * .5);
    const draw = (index, weight, ox, oy, scale) => {
      ctx.globalAlpha = Math.min(1, strength * weight);
      ctx.drawImage(sprites[index % sprites.length], x - extent * scale + ox, y - extent * scale + oy, extent * scale * 2, extent * scale * 2);
    };
    draw(frame, 1 - mix, 0, 0, 1); draw(frame + 1, mix, 0, 0, 1);
    // A diffuse upper plume rises and curls; the central hole keeps the icon readable.
    const rise = (time * .32 + station.spin / TAU) % 1;
    const plume = Math.sin(rise * Math.PI) * .22;
    draw((frame + 7) % sprites.length, plume * (1 - mix), Math.sin(time + station.spin) * radius * .15, -rise * radius * .55, 1 + rise * .15);
    draw((frame + 8) % sprites.length, plume * mix, Math.sin(time + station.spin) * radius * .15, -rise * radius * .55, 1 + rise * .15);
    ctx.globalAlpha = 1;
  }
  root.CircuitNucleus = { createSprites, drawStation };
})(window);
