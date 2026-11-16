(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  class Atmosphere {
    constructor(width, height) {
      this.width = width; this.height = height; this.time = 0; this.waves = [];
      let seed = 9917;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      this.dust = Array.from({ length: 70 }, () => ({ x: random(), y: random(), depth: random(), phase: random() * TAU, drift: random() * .7 + .3 }));
    }
    resize(width, height) { this.width = width; this.height = height; }
    update(dt) {
      this.time += Math.max(0, dt);
      this.waves = this.waves.filter(wave => this.time - wave.started < 1.6);
    }
    impact(icon) {
      this.waves.push({ x: icon.x, y: icon.y, radius: icon.radius, started: this.time });
      if (this.waves.length > 6) this.waves.shift();
    }
    moving(config) { return config.fogStrength > 0 || config.dustCount > 0 || this.waves.length > 0; }
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
    const cloudStops = [[0,.28],[.35,.17],[.7,.045],[1,0]];
    return {
      cloud: sprite(rgb, cloudStops), cool: sprite(cool, cloudStops),
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
  }
  function drawDetails(ctx, field, sprites, config, rgba) {
    const { width: w, height: h, time: t } = field;
    const count = Math.min(70, Math.max(0, Math.floor(config.dustCount)));
    for (let i = 0; i < count; i++) {
      const p = field.dust[i], speed = 4 + p.depth * 10;
      const x = ((p.x * w + t * speed * p.drift) % (w + 20)) - 10;
      const y = ((p.y * h - t * speed * .35) % (h + 20) + h + 20) % (h + 20) - 10;
      const alpha = (.15 + p.depth * .2) * (.8 + Math.sin(t * .7 + p.phase) * .2);
      ctx.fillStyle = rgba(alpha);
      const size = .7 + p.depth * 1.1;
      ctx.fillRect(x, y, size, size);
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
