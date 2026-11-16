const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const E = require('../engine.js');
let frame, interval, deadline, draws = 0, clock = 0, simulationTime = 0;
const elements = new Map(), arcs = [];
const gradient = { addColorStop() {} };
const ctx = new Proxy({ arc: (...args) => arcs.push(args), createRadialGradient: () => gradient, createLinearGradient: () => gradient }, { get: (t, k) => t[k] || (() => {}) });
function element(key) {
  if (!elements.has(key)) elements.set(key, { style: { setProperty() {} }, hidden: true, options: [0, 1], querySelectorAll: () => [], add(option) { this.options.push(option); }, getContext: () => ctx, textContent: '' });
  return elements.get(key);
}
const page = {
  CircuitEngine: E, URLSearchParams, console, Date, Math,
  innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1, screen: { width: 1000, height: 800 }, location: { search: '?preview', href: '' },
  document: { querySelector: element, getElementById: id => element('#' + id), createElement: () => ({ remove() {} }), head: { appendChild() {} }, documentElement: { style: { setProperty() {} } }, body: { classList: { toggle() {} } } },
  addEventListener() {}, requestAnimationFrame: callback => { frame = callback; },
  setInterval: callback => { interval = callback; return 1; }, setTimeout: callback => { deadline = callback; return 2; }, clearInterval: () => { interval = null; }, clearTimeout: () => { deadline = null; },
  Option: function(text, value) { this.text = text; this.value = value; this.dataset = {}; }
};
page.window = page;
const context = vm.createContext(page);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../hud.js'), 'utf8'), context);
const realDraw = page.CircuitHud.drawScene;
page.CircuitHud.drawScene = (...args) => { draws++; simulationTime = args[1].time; realDraw(...args); };
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
assert.equal(frame, undefined, 'No idle animation before a saved map loads');
assert.equal(interval, undefined, 'No background collector or file polling');
const snapshot = { monitors: [{ x: 0, y: 0, width: 1000, height: 800 }], icons: [{ id: 0, x: 50, y: 50, width: 48, height: 48 }, { id: 1, x: 800, y: 650, width: 48, height: 48 }] };
page.receiveDesktopMap(snapshot); assert.equal(arcs.length, 0);
for (let i = 0; i <= 165; i++) { frame(clock); clock += 1000 / 165; }
assert.ok(draws >= 58 && draws <= 62, `60 FPS cap at 165 Hz: observed ${draws}`);
assert.ok(Math.abs(simulationTime - 1) < .03, 'Frame limiting preserves real elapsed time');
page.livelyPropertyListener('frameRate', 0); draws = 0;
for (let i = 0; i < 165; i++) { frame(clock); clock += 1000 / 165; }
assert.ok(draws >= 29 && draws <= 31, `30 FPS cap: observed ${draws}`);
assert.ok(Math.abs(simulationTime - 2) < .05, 'Switching FPS must not speed up or slow down the simulation');
page.livelyPropertyListener('speed', 9999); assert.equal(element('#speed').value, 800);
page.receiveDesktopMap({ ...snapshot, icons: [] }); draws = 0; frame(clock);
assert.equal(draws, 0, 'An empty monitor stops redrawing');
element('#collectIcons').onclick(); assert.equal(page.location.href, 'circuit-orbit-v2://collect'); assert.ok(interval); assert.ok(deadline);
page.receiveCollectionResult({ completedAt: new Date(Date.now() + 1000).toISOString(), ok: true, map: snapshot });
assert.equal(interval, null); assert.equal(deadline, null); assert.match(element('#collectStatus').textContent, /Mapa salvo/);
element('#collectIcons').onclick(); deadline(); assert.equal(interval, null); assert.equal(element('#collectIcons').disabled, false);
console.log('HUD, limite de FPS, monitor vazio e coleta unica: OK');
