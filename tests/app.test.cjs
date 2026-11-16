const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
let frame, interval, deadline, cleared = 0, numbers = 0;
const arcs = [], scripts = [];
let drawnPath = [];
const residualStrokes = [];
const ctx = new Proxy({
  arc: (...args) => arcs.push(args), fillText: () => numbers++,
  beginPath: () => { drawnPath = []; },
  moveTo: (x, y) => drawnPath.push([x, y]), lineTo: (x, y) => drawnPath.push([x, y]),
  stroke() { if (this.lineWidth === 1) residualStrokes.push(drawnPath.slice()); },
  createRadialGradient: () => ({ addColorStop() {} })
}, { get: (target, key) => target[key] || (() => {}) });
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    style: { setProperty() {} }, hidden: true, options: [0, 1],
    querySelectorAll: () => [], add(option) { this.options.push(option); },
    getContext: () => ctx, textContent: '', remove() {}
  });
  return elements.get(selector);
}
const page = {
  CircuitEngine: E, URLSearchParams, console, Date, Math,
  innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
  screen: { width: 1000, height: 800 },
  location: { search: '?preview', href: '' },
  document: {
    querySelector: element, getElementById: id => element('#' + id),
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => scripts.push(script) },
    documentElement: { style: { setProperty() {} } }
  },
  addEventListener() {}, requestAnimationFrame: callback => { frame = callback; },
  setInterval: callback => { interval = callback; return 1; },
  setTimeout: callback => { deadline = callback; return 2; },
  clearInterval: () => { interval = null; cleared++; },
  clearTimeout: () => { deadline = null; cleared++; },
  Option: function(text, value) { this.text = text; this.value = value; this.dataset = {}; }
};
page.window = page;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), page);
assert.equal(interval, undefined, 'No recurring collection or file polling at startup');
const snapshot = { monitors: [{ x: 0, y: 0, width: 1000, height: 800 }], icons: [{ id: 0, x: 400, y: 300, width: 48, height: 48 }], updatedAt: new Date().toISOString() };
page.receiveDesktopMap(snapshot);
assert.equal(arcs.length, 0, 'Loading icon positions must not draw any circle');
page.livelyPropertyListener('debug', true); // Old persisted settings cannot restore the removed overlay.
for (let i = 0; i < 500; i++) frame(i * 16);
assert.ok(arcs.length > 0);
assert.ok(arcs.every(arc => arc[2] === 1.9), 'Only the light head is drawn as an arc; no icon rings or pulses');
assert.equal(numbers, 0, 'No icon numbers are rendered');
const longMap = { ...snapshot, icons: [
  { id: 0, x: 20, y: 20, width: 48, height: 48 },
  { id: 1, x: 920, y: 20, width: 48, height: 48 },
  { id: 2, x: 920, y: 720, width: 48, height: 48 },
  { id: 3, x: 20, y: 720, width: 48, height: 48 }
] };
page.receiveDesktopMap(longMap);
residualStrokes.length = 0;
frame(8000); frame(8016);
const firstPoint = residualStrokes[0][0];
for (let i = 1; i <= 300; i++) { residualStrokes.length = 0; frame(8016 + i * 16); }
assert.ok(residualStrokes.some(points => points.some(p => p[0] === firstPoint[0] && p[1] === firstPoint[1])), 'The start of a long route remains visible beyond three seconds');
element('#collectIcons').onclick();
assert.equal(page.location.href, 'circuit-orbit://collect');
assert.equal(typeof interval, 'function');
assert.equal(typeof deadline, 'function');
assert.equal(element('#collectIcons').disabled, true);
page.receiveCollectionResult({ completedAt: new Date(Date.now() + 1000).toISOString(), ok: true, map: snapshot });
assert.equal(interval, null, 'Polling stops after collecting');
assert.equal(deadline, null);
assert.equal(cleared, 2);
assert.equal(element('#collectIcons').disabled, false);
assert.match(element('#collectStatus').textContent, /Mapa salvo/);
element('#collectIcons').onclick();
deadline();
assert.equal(interval, null, 'Polling also stops when utility launch is cancelled or unavailable');
assert.match(element('#collectStatus').textContent, /Coleta não confirmada/);
console.log('Sem círculos prévios/números; coleta pontual e espera limitada: OK');
