const assert = require('node:assert/strict');
const E = require('../engine.js');
const monitors = [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: -1280, y: -200, width: 1280, height: 1024 }];
assert.deepEqual(E.virtualBounds(monitors), { x: -1280, y: -200, width: 3200, height: 1280 });
const icons = [{ id: 0, x: -1240, y: -160, width: 48, height: 48 }, { id: 1, x: 40, y: 40, width: 48, height: 48 }];
assert.deepEqual(E.project(icons, monitors[1], 1280, 1024).map(i => [i.id, i.x, i.y]), [[0, 64, 64]]);
assert.deepEqual(E.project(icons, monitors[0], 960, 540).map(i => [i.id, i.x, i.y]), [[1, 32, 32]]);
const points = [{ id: 0, x: 0, y: 0 }, { id: 1, x: 1, y: 0 }, { id: 2, x: 20, y: 10 }];
assert.equal(E.nearest(points[0], points, new Set([0])).id, 1);
assert.equal(E.nearest(points[0], points, new Set([0, 1])).id, 2);
assert.equal(E.nearest(points[0], points, new Set([0, 1, 2])), undefined);
for (const end of [{ x: 100, y: 30 }, { x: -20, y: 80 }, { x: 0, y: 0 }, { x: 0, y: -70 }]) {
  const route = E.polyline(E.circuit({ x: 0, y: 0 }, end));
  assert.deepEqual(E.sample(route, 0), { x: 0, y: 0 });
  assert.deepEqual(E.sample(route, route.total + 1), end);
  for (let i = 1; i < route.points.length; i++) {
    const dx = Math.abs(route.points[i].x - route.points[i - 1].x), dy = Math.abs(route.points[i].y - route.points[i - 1].y);
    assert.ok(dx < 1e-8 || dy < 1e-8 || Math.abs(dx - dy) < 1e-8);
  }
}
assert.equal(E.project([{ id: 0, x: 0, y: 0, width: 76, height: 52 }], monitors[0], 1920, 1080)[0].radius, 26);
assert.ok(Math.abs(E.tourLength({ x: 50, y: 30 }, [{ id: 0, x: 50, y: 50, radius: 20 }]) - 40 * Math.PI) < 1e-8);
assert.equal(E.residueOpacity(0, 500, 1000), 1);
assert.equal(E.residueOpacity(0, 800, 1000), 1);
assert.equal(E.residueOpacity(0, 875, 1000), .5);
assert.equal(E.residueOpacity(0, 950, 1000), 0);
assert.equal(E.residueOpacity(300, 950, 1000), 1);
assert.equal(E.residueOpacity(1100, 950, 1000), 0);
console.log('Geometria, monitores, contorno menor e desvanecimento por percurso: OK');
