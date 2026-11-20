(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  class Atmosphere {
    constructor(width, height) {
      this.width = width; this.height = height; this.time = 0; this.waves = [];
      this.cursor = null; this.cursorPuffs = []; this.lastPuff = -1;
      let seed = 9917;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      this.dust = Array.from({ length: 70 }, () => ({ x: random(), y: random(), depth: random(), phase: random() * TAU, drift: random() * .7 + .3 }));
    }
    resize(width, height) { this.width = width; this.height = height; this.clearPointer(); }
    clearPointer() { this.cursor = null; this.cursorPuffs = []; this.lastPuff = -1; }
    leavePointer() { if (this.cursor) this.cursor.lastMove = this.time - 1.1; }
    movePointer(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > this.width || y > this.height) { this.leavePointer(); return false; }
      if (!this.cursor) {
        this.cursor = { x, y, targetX: x, targetY: y, lastMove: this.time - 2, strength: 0, energy: 0 };
        return false;
      }
      const p = this.cursor, distance = Math.hypot(x - p.targetX, y - p.targetY);
      if (distance < .35) return false; // Repeated stationary input must not create a permanent halo.
      if (distance > Math.max(160, Math.min(this.width, this.height) * .35)) {
        this.clearPointer(); return this.movePointer(x, y);
      }
      p.targetX = x; p.targetY = y; p.lastMove = this.time;
      p.energy = Math.min(1, p.energy + .08 + distance * .008);
      return true;
    }
    update(dt) {
      this.time += Math.max(0, dt);
      this.waves = this.waves.filter(wave => this.time - wave.started < 1.6);
      this.cursorPuffs = this.cursorPuffs.filter(puff => this.time - puff.started < 1);
      if (this.cursor) {
        const p = this.cursor, follow = 1 - Math.exp(-Math.max(0, dt) / .085);
        p.x += (p.targetX - p.x) * follow; p.y += (p.targetY - p.y) * follow;
        const activity = Math.max(0, 1 - (this.time - p.lastMove) / 1.05);
        p.energy *= Math.exp(-Math.max(0, dt) * .5);
        p.strength += (activity * p.energy - p.strength) * (1 - Math.exp(-Math.max(0, dt) / .09));
        if (this.time - p.lastMove > 1.4 && p.strength < .005) p.strength = 0;
        if (p.strength > .03 && this.time - p.lastMove < .18 && this.time - this.lastPuff >= .05) {
          this.cursorPuffs.push({ x: p.x, y: p.y, started: this.time, strength: p.strength });
          if (this.cursorPuffs.length > 16) this.cursorPuffs.shift();
          this.lastPuff = this.time;
        }
      }
    }
    impact(icon) {
      this.waves.push({ x: icon.x, y: icon.y, radius: icon.radius, started: this.time });
      if (this.waves.length > 6) this.waves.shift();
    }
    moving(config) {
      const pointerActive = config.mouseFog && config.mouseFogStrength > 0 && ((this.cursor?.energy > 0 && this.time - this.cursor.lastMove < 1.1) || (this.cursor?.strength || 0) > .003 || this.cursorPuffs.length > 0);
      return Boolean(config.fogStrength > 0 || config.dustCount > 0 || this.waves.length > 0 || pointerActive);
    }
  }
  function createSprites(makeCanvas, accent) {
    const rgb = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16));
    const cool = [Math.round(rgb[0] * .55), Math.round(rgb[1] * .55), Math.min(255, Math.round(rgb[2] * 1.12))];
    function sprite(channels, stops) {
      const canvas = makeCanvas(256, 256), ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      for (const [position, alpha] of stops) gradient.addColorStop(position, `rgba(${channels.join(',')},${alpha})`);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
      return canvas;
    }
    function randomSource(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
    function cloud(channels, diffuse = false) {
      const size = 512, canvas = makeCanvas(size, size), ctx = canvas.getContext('2d');
      const image = ctx.createImageData(size, size), random = randomSource(diffuse ? 7411 : 1907);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const nx = (x + .5) / (size / 2) - 1, ny = (y + .5) / (size / 2) - 1, r = Math.hypot(nx, ny);
        const edge = Math.max(0, Math.min(1, (r - .72) / .28));
        const fade = 1 - edge * edge * (3 - 2 * edge);
        const density = diffuse
          ? .17 * (.7 * Math.exp(-1.7 * (nx * nx + ny * ny)) + .3 * Math.exp(-2.3 * ((nx + .2) ** 2 + (ny - .12) ** 2)))
          : .28 * (.6 * Math.exp(-3.6 * (nx * nx + ny * ny)) + .25 * Math.exp(-6 * ((nx + .25) ** 2 + (ny - .12) ** 2)) + .15 * Math.exp(-7 * ((nx - .3) ** 2 + (ny + .22) ** 2)));
        const i = (y * size + x) * 4;
        image.data[i] = channels[0]; image.data[i + 1] = channels[1]; image.data[i + 2] = channels[2];
        // Stochastic rounding breaks coherent alpha contours; textures are generated only once per color.
        image.data[i + 3] = Math.floor(density * fade * 255 + random());
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    }
    const grain = makeCanvas(64, 64), grainCtx = grain.getContext('2d'), noise = grainCtx.createImageData(64, 64), random = randomSource(2189);
    for (let i = 0; i < noise.data.length; i += 4) {
      const value = random() < .5 ? 0 : 255;
      noise.data[i] = value; noise.data[i + 1] = value; noise.data[i + 2] = value;
      noise.data[i + 3] = random() < .5 ? 1 : 2;
    }
    grainCtx.putImageData(noise, 0, 0);
    return {
      cloud: cloud(rgb), cool: cloud(cool), mouse: cloud(rgb, true), grain,
      wave: sprite(rgb, [[0,0],[.64,0],[.79,.035],[.87,.24],[.94,.08],[1,0]])
    };
  }
  function drawFog(ctx, field, sprites, strength) {
    if (strength <= 0) return;
    const { width: w, height: h, time: t } = field;
    const clouds = [
      [sprites.cloud, w * (.27 + Math.sin(t * .028) * .12), h * (.43 + Math.cos(t * .019) * .15), w * .8, h * 1.13, 1],
      [sprites.cool, w * (.71 + Math.cos(t * .021) * .13), h * (.55 + Math.sin(t * .025) * .18), w * .87, h * 1.2, .85],
      [sprites.cloud, w * (.5 + Math.sin(t * .016 + 2) * .2), h * (.2 + Math.sin(t * .017 + 3) * .12), w * .6, h * .7, .4]
    ];
    for (const [image,x,y,width,height,opacity] of clouds) {
      ctx.globalAlpha = strength / 100 * opacity;
      ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
    }
    ctx.globalAlpha = 1;
    // A fixed, very low amplitude grain masks the final 8-bit compositing steps without flicker.
    if (!sprites.grainPattern) sprites.grainPattern = ctx.createPattern(sprites.grain, 'repeat');
    ctx.fillStyle = sprites.grainPattern; ctx.fillRect(0, 0, w, h);
  }
  function drawDetails(ctx, field, sprites, config, rgba, fluidMouseActive = false) {
    const { width: w, height: h, time: t } = field;
    const count = Math.min(70, Math.max(0, Math.floor(config.dustCount)));
    for (let i = 0; i < count; i++) {
      const p = field.dust[i], speed = 4 + p.depth * 10;
      let x = ((p.x * w + t * speed * p.drift) % (w + 20)) - 10;
      let y = ((p.y * h - t * speed * .35) % (h + 20) + h + 20) % (h + 20) - 10;
      if (config.mouseFog && config.mouseFogStrength > 0 && field.cursor?.strength > .003) {
        const dx = x - field.cursor.x, dy = y - field.cursor.y, distance = Math.hypot(dx, dy);
        const reach = config.mouseFogSize * .65;
        if (distance > 0 && distance < reach) {
          const push = (1 - distance / reach) ** 2 * 12 * field.cursor.strength * config.mouseFogStrength / 100;
          x += dx / distance * push; y += dy / distance * push;
        }
      }
      const alpha = (.15 + p.depth * .2) * (.8 + Math.sin(t * .7 + p.phase) * .2);
      ctx.fillStyle = rgba(alpha);
      const size = .7 + p.depth * 1.1;
      ctx.fillRect(x, y, size, size);
    }
    if (!fluidMouseActive && config.mouseFog && config.mouseFogStrength > 0) {
      const amount = config.mouseFogStrength / 100, size = config.mouseFogSize;
      for (const puff of field.cursorPuffs) {
        const age = Math.min(1, (t - puff.started)), expansion = 1 + age * .35;
        ctx.globalAlpha = amount * puff.strength * (1 - age) ** 2 * .1;
        ctx.drawImage(sprites.mouse, puff.x - size * expansion * .5, puff.y - size * expansion * .47, size * expansion, size * expansion * .94);
      }
      if (field.cursor?.strength > .003) {
        ctx.globalAlpha = amount * field.cursor.strength * .55;
        ctx.drawImage(sprites.mouse, field.cursor.x - size * .5, field.cursor.y - size * .47, size, size * .94);
      }
      ctx.globalAlpha = 1;
    }
    if (config.impactStrength > 0) {
      for (const wave of field.waves) {
        const progress = Math.max(0, Math.min(1, (t - wave.started) / 1.6));
        const radius = wave.radius * 1.25 + Math.min(w, h) * .24 * (1 - (1 - progress) ** 2);
        ctx.globalAlpha = config.impactStrength / 100 * (1 - progress) ** 2;
        ctx.drawImage(sprites.wave, wave.x - radius, wave.y - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  root.CircuitAtmosphere = { Atmosphere, createSprites, drawFog, drawDetails };
})(window);
