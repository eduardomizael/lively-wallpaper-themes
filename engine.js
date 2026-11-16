(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  function virtualBounds(monitors) {
    const x = Math.min(...monitors.map(m => m.x)), y = Math.min(...monitors.map(m => m.y));
    return { x, y, width: Math.max(...monitors.map(m => m.x + m.width)) - x, height: Math.max(...monitors.map(m => m.y + m.height)) - y };
  }
  function project(icons, bounds, width, height) {
    const sx = width / bounds.width, sy = height / bounds.height;
    return icons.filter(i => i.x + i.width / 2 >= bounds.x && i.x + i.width / 2 < bounds.x + bounds.width && i.y + i.height / 2 >= bounds.y && i.y + i.height / 2 < bounds.y + bounds.height)
      .map(i => ({ id: i.id, x: (i.x + i.width / 2 - bounds.x) * sx, y: (i.y + i.height / 2 - bounds.y) * sy, radius: Math.min(i.width * sx, i.height * sy) / 2 }));
  }
  function pickTarget(icons, currentId, previousId, random = Math.random) {
    let candidates = icons.filter(i => i.id !== currentId);
    const fresh = candidates.filter(i => i.id !== previousId);
    if (fresh.length) candidates = fresh;
    return candidates[Math.min(candidates.length - 1, Math.floor(clamp(random(), 0, .999999) * candidates.length))] || null;
  }
  const flightDuration = (length, speed) => clamp(length / (clamp(speed, 40, 800) * 8), .16, 4);
  function shotPosition(shot) {
    const progress = clamp(shot.elapsed / shot.duration, 0, 1) ** 2.6;
    return { x: shot.from.x + (shot.to.x - shot.from.x) * progress, y: shot.from.y + (shot.to.y - shot.from.y) * progress, progress };
  }
  const retentionCount = (count, percent) => Math.max(1, Math.floor(count * clamp(percent, 1, 99) / 100));
  function stationOpacity(elapsed, duration = .9) {
    const t = clamp(elapsed / duration, 0, 1);
    return 1 - t * t * (3 - 2 * t);
  }
  class PulseSystem {
    constructor(icons, options = {}, random = Math.random) {
      this.icons = icons;
      this.options = { width: 1920, height: 1080, speed: 160, chargeTime: 1000, persistencePercent: 60, ...options };
      this.random = random;
      this.time = 0; this.sequence = 0; this.phase = 'idle'; this.charge = 0;
      this.current = null; this.previousId = null; this.shot = null;
      this.stations = new Map(); this.particles = [];
      this.available = icons.slice(); this.round = 1;
      if (icons.length) {
        const target = this.takeTarget();
        const { width, height } = this.options;
        const edges = [{ x: -30, y: target.y }, { x: width + 30, y: target.y }, { x: target.x, y: -30 }, { x: target.x, y: height + 30 }];
        edges.sort((a, b) => distance(a, target) - distance(b, target));
        this.launch(edges[0], target, false);
      }
    }
    takeTarget() {
      if (this.current && this.icons.length < 2) return null;
      if (!this.available.length) { this.available = this.icons.slice(); this.round++; }
      const target = pickTarget(this.available, this.current?.id, this.previousId, this.random);
      if (target) this.available.splice(this.available.indexOf(target), 1);
      return target;
    }
    setOptions(options) {
      const fraction = this.shot ? this.shot.elapsed / this.shot.duration : 0;
      Object.assign(this.options, options);
      if (this.shot) {
        this.shot.duration = flightDuration(distance(this.shot.from, this.shot.to), this.options.speed);
        this.shot.elapsed = fraction * this.shot.duration;
      }
    }
    launch(source, target, fromStation = true) {
      const length = distance(source, target), dx = (target.x - source.x) / (length || 1), dy = (target.y - source.y) / (length || 1);
      const offset = fromStation ? Math.min(source.radius + 6, length * .3) : 0;
      const from = { x: source.x + dx * offset, y: source.y + dy * offset };
      this.shot = { from, to: target, elapsed: 0, duration: flightDuration(distance(from, target), this.options.speed) };
      this.phase = 'flight';
      const station = this.stations.get(source.id);
      if (station) station.emission = .2;
    }
    impact(target) {
      this.sequence++;
      const existing = this.stations.get(target.id);
      this.stations.set(target.id, { icon: target, lastHit: this.sequence, hitTime: this.time, emission: 0, fadeStartedAt: null, spin: existing?.spin ?? this.random() * TAU });
      this.previousId = this.current?.id ?? null;
      this.current = target; this.shot = null; this.phase = 'charge'; this.charge = 0;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU + this.random() * .2, speed = 30 + this.random() * 65;
        this.particles.push({ x: target.x + Math.cos(a) * target.radius * .8, y: target.y + Math.sin(a) * target.radius * .8, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .38, maxLife: .38 });
      }
    }
    update(dt) {
      dt = Math.max(0, dt); this.time += dt;
      for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const station of this.stations.values()) station.emission = Math.max(0, station.emission - dt);
      if (this.phase === 'flight') {
        this.shot.elapsed = Math.min(this.shot.duration, this.shot.elapsed + dt);
        if (this.shot.elapsed >= this.shot.duration) this.impact(this.shot.to);
      } else if (this.phase === 'charge') {
        this.charge = Math.min(1, this.charge + dt / (this.options.chargeTime / 1000));
        if (this.charge >= 1) {
          const next = this.takeTarget();
          if (next) this.launch(this.current, next);
          else { this.charge = 0; this.stations.get(this.current.id).emission = .16; }
        }
      }
      for (const [id, station] of this.stations) {
        const age = this.sequence - station.lastHit;
        if (age < retentionCount(this.icons.length, this.options.persistencePercent)) station.fadeStartedAt = null;
        else if (station.fadeStartedAt === null) station.fadeStartedAt = this.time;
        if (id !== this.current?.id && this.opacity(station) <= 0) this.stations.delete(id);
      }
    }
    opacity(station) {
      if (station.icon.id === this.current?.id) return 1;
      return station.fadeStartedAt === null ? 1 : stationOpacity(this.time - station.fadeStartedAt);
    }
  }
  const api = { TAU, clamp, distance, virtualBounds, project, pickTarget, flightDuration, shotPosition, retentionCount, stationOpacity, PulseSystem };
  if (typeof module !== 'undefined') module.exports = api;
  root.CircuitEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
