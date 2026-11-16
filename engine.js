(function (root) {
  'use strict';
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  function nearest(current, icons, visited) {
    return icons.filter(i => !visited.has(i.id)).sort((a, b) => distance(current, a) - distance(current, b) || a.id - b.id)[0];
  }
  function circuit(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy)) * 0.65;
    const middle = { x: b.x - Math.sign(dx) * diagonal, y: a.y };
    const elbow = { x: b.x, y: a.y + Math.sign(dy) * diagonal };
    return [a, middle, elbow, b].filter((p, i, points) => !i || distance(p, points[i - 1]) > 0.01);
  }
  function polyline(points) {
    const lengths = points.slice(1).map((p, i) => distance(points[i], p));
    return { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
  }
  function sample(path, progress) {
    if (progress >= path.total) return path.points[path.points.length - 1];
    let left = Math.max(0, Math.min(path.total, progress));
    for (let i = 0; i < path.lengths.length; i++) {
      if (left <= path.lengths[i]) {
        const t = path.lengths[i] ? left / path.lengths[i] : 0;
        return { x: path.points[i].x + (path.points[i + 1].x - path.points[i].x) * t, y: path.points[i].y + (path.points[i + 1].y - path.points[i].y) * t };
      }
      left -= path.lengths[i];
    }
    return path.points[path.points.length - 1];
  }
  function virtualBounds(monitors) {
    const x = Math.min(...monitors.map(m => m.x)), y = Math.min(...monitors.map(m => m.y));
    return { x, y, width: Math.max(...monitors.map(m => m.x + m.width)) - x, height: Math.max(...monitors.map(m => m.y + m.height)) - y };
  }
  function project(icons, bounds, width, height) {
    const sx = width / bounds.width, sy = height / bounds.height;
    return icons.filter(i => i.x + i.width / 2 >= bounds.x && i.x + i.width / 2 < bounds.x + bounds.width && i.y + i.height / 2 >= bounds.y && i.y + i.height / 2 < bounds.y + bounds.height)
      .map(i => ({ id: i.id, x: (i.x + i.width / 2 - bounds.x) * sx, y: (i.y + i.height / 2 - bounds.y) * sy, radius: Math.min(i.width * sx, i.height * sy) / 2 }));
  }
  function tourLength(start, icons, alreadyVisited = new Set()) {
    const visited = new Set(alreadyVisited);
    let from = start, total = 0, target;
    while ((target = nearest(from, icons, visited))) {
      const entry = { x: target.x, y: target.y - target.radius };
      total += polyline(circuit(from, entry)).total + Math.PI * 2 * target.radius;
      visited.add(target.id); from = entry;
    }
    return total;
  }
  function residueOpacity(position, travelled, roundLength) {
    if (roundLength <= 0 || position > travelled) return 0;
    // The beginning stays intact until 80% of a round, then fades out in order by 95%.
    return Math.max(0, Math.min(1, (position - travelled + roundLength * .95) / (roundLength * .15)));
  }
  const api = { distance, nearest, circuit, polyline, sample, virtualBounds, project, tourLength, residueOpacity };
  if (typeof module !== 'undefined') module.exports = api;
  root.CircuitEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
