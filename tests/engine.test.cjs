const assert = require('node:assert/strict');
const E = require('../engine.js');
const monitors = [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: -1280, y: -200, width: 1280, height: 1024 }];
assert.deepEqual(E.virtualBounds(monitors), { x: -1280, y: -200, width: 3200, height: 1280 });
const raw = [{ id: 0, x: -1240, y: -160, width: 48, height: 48 }, { id: 1, x: 40, y: 40, width: 48, height: 48 }];
assert.deepEqual(E.project(raw, monitors[1], 1280, 1024).map(i => [i.id, i.x, i.y]), [[0, 64, 64]]);
const icons = [{ id: 0, x: 80, y: 80, radius: 29 }, { id: 1, x: 800, y: 400, radius: 29 }, { id: 2, x: 400, y: 650, radius: 29 }, { id: 3, x: 1000, y: 800, radius: 29 }];
assert.equal(E.pickTarget(icons, 0, 1, () => 0).id, 2);
assert.equal(E.pickTarget(icons, 0, 1, () => .99).id, 3);
assert.equal(E.pickTarget(icons.slice(0, 2), 0, 1, () => 0).id, 1);
assert.equal(E.pickTarget(icons.slice(0, 1), 0, null), null);
const shot = { from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, speed: 160, elapsed: 0 };
shot.duration = E.flightDuration(E.distance(shot.from, shot.to), shot.speed);
const early = E.shotPosition({ ...shot, elapsed: .02 }), middle = E.shotPosition({ ...shot, elapsed: .04 }), late = E.shotPosition({ ...shot, elapsed: .06 });
assert.ok(late.x - middle.x > middle.x - early.x, 'Projectile accelerates toward the target');
assert.equal(early.y, early.x / 2, 'Flight is straight');
assert.deepEqual(E.shotPosition({ ...shot, elapsed: shot.duration }), { x: 100, y: 50, progress: 1 });
for (const speed of [40, 160, 800]) {
  for (const length of [0, 1, 10, 40, 300, 2400, 10000]) {
    const duration = E.flightDuration(length, speed);
    assert.ok(Number.isFinite(duration));
    assert.ok(Math.abs(E.travelDistance(duration, speed) - length) < 1e-8, 'Impact time matches physical travelled distance, including short flights');
  }
}
const near = { from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, speed: 160, elapsed: .1 };
const far = { ...near, to: { x: 2400, y: 0 } };
assert.equal(E.shotPosition(near).x, E.shotPosition(far).x, 'Equal distance travelled during launch regardless of target range');
assert.ok(Math.abs(E.shotPosition(near).x - 76.8) < 1e-8);
assert.ok(Math.abs(E.travelDistance(.15, 160) - E.travelDistance(.1, 160) - 64) < 1e-8, 'Cruise speed is constant after 80 ms');
assert.ok(Math.abs(E.travelDistance(.08 - 1e-8, 160) - E.travelDistance(.08 + 1e-8, 160)) < .001, 'No positional jump at ramp transition');
assert.equal(E.retentionCount(10, 60), 6);
assert.equal(E.retentionCount(10, 99), 9);
assert.equal(E.retentionCount(10, 1), 1);
assert.equal(E.stationOpacity(0), 1); assert.equal(E.stationOpacity(.9), 0);
assert.ok(E.stationOpacity(.3) > E.stationOpacity(.6));
const system = new E.PulseSystem(icons, { speed: 800, chargeTime: 300 }, () => .2);
assert.equal(system.stations.size, 0, 'Nothing is lit before the bootstrap impact');
assert.equal(system.phase, 'flight');
const target = system.shot.to;
system.update(system.shot.duration);
assert.equal(system.stations.size, 1); assert.equal(system.phase, 'charge'); assert.equal(system.current.id, target.id);
system.update(.15); assert.equal(system.shot, null); assert.ok(system.charge > 0 && system.charge < 1);
system.update(.15); assert.equal(system.phase, 'flight'); assert.notEqual(system.shot.to.id, system.current.id);
system.update(system.shot.duration * .3);
const beforeSpeedChange = E.shotPosition(system.shot);
system.setOptions({ speed: 160 });
assert.ok(E.distance(beforeSpeedChange, E.shotPosition(system.shot)) < 1e-8, 'Changing speed must not teleport the projectile');
for (let i = 0; i < 10000; i++) { system.update(.02); assert.ok(system.stations.size <= icons.length); assert.ok(system.particles.length <= 24); }
assert.ok(system.sequence > 20);
const empty = new E.PulseSystem([]); empty.update(100); assert.equal(empty.phase, 'idle');
const single = new E.PulseSystem(icons.slice(0, 1), { chargeTime: 300 });
for (let i = 0; i < 1000; i++) single.update(.02);
assert.equal(single.sequence, 1); assert.equal(single.stations.size, 1); assert.equal(single.shot, null);
const ten = Array.from({ length: 10 }, (_, id) => ({ id, x: 100 + id * 80, y: 100, radius: 25 }));
const bag = new E.PulseSystem(ten, { speed: 800, chargeTime: 300, persistencePercent: 60 }, () => 0);
const hits = [];
function nextHit() {
  if (bag.phase === 'charge') bag.update(.3);
  assert.equal(bag.phase, 'flight');
  const id = bag.shot.to.id;
  bag.update(bag.shot.duration); hits.push(id);
  return bag.stations.get(id);
}
const first = nextHit();
assert.equal(bag.available.length, 9, 'The selected target is removed from the bag');
for (let i = 0; i < 5; i++) nextHit();
assert.equal(bag.opacity(first), 1, 'First marker stays intact through the sixth impact');
assert.equal(first.fadeStartedAt, null);
// Flying toward the seventh must not prematurely start the fade.
bag.update(.3); bag.update(bag.shot.duration * .5);
assert.equal(first.fadeStartedAt, null);
const seventhId = bag.shot.to.id;
bag.update(bag.shot.duration); hits.push(seventhId);
assert.notEqual(first.fadeStartedAt, null, 'Fade starts exactly when the seventh is marked');
bag.update(.1); assert.ok(bag.opacity(first) < 1 && bag.opacity(first) > 0);
while (hits.length < 30) nextHit();
for (let round = 0; round < 3; round++) assert.equal(new Set(hits.slice(round * 10, (round + 1) * 10)).size, 10, 'Every round visits all ten icons once');
for (let i = 1; i < hits.length; i++) assert.notEqual(hits[i], hits[i - 1], 'No self-shot across round boundaries');
console.log('Impacto, aceleracao, sorteio, carga, desvanecimento e limites de memoria: OK');
