// Capture actual engine/HUD drawing commands; rasterize with Render-Thumbnail.py.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'outputs', 'thumbnail');
fs.mkdirSync(out, { recursive: true });
let seed = 8041;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const icons = [[105,125],[300,100],[495,130],[535,265],[320,275],[100,265]].map(([x,y],id) => ({ id, x, y, radius: 21 }));
const config = { accent: '#49e5ff', glow: 90, trail: 110, fogStrength: 45, dustCount: 32, impactStrength: 40, mouseFog:true, mouseFogStrength:35, mouseFogSize:160 };
const system = new E.PulseSystem(icons, { width: 640, height: 360, speed: 210, chargeTime: 650, persistencePercent: 60 }, random);
let commands = [], currentPath = [];
const ctx = {
  shadowBlur: 0, shadowColor: config.accent, lineWidth: 1,
  globalAlpha: 1,
  beginPath() { currentPath = []; },
  moveTo(x,y) { currentPath.push(['move',x,y]); },
  lineTo(x,y) { currentPath.push(['line',x,y]); },
  arc(x,y,r,start,end) { currentPath.push(['arc',x,y,r,start,end]); },
  stroke() { commands.push({ op: 'stroke', path: currentPath.slice(), style: this.strokeStyle, width: this.lineWidth, blur: this.shadowBlur, shadow: this.shadowColor }); },
  fill() { commands.push({ op: 'fill', path: currentPath.slice(), style: this.fillStyle }); },
  fillRect(x,y,w,h) { commands.push({ op: 'rect', rect: [x,y,w,h], style: this.fillStyle }); },
  drawImage(image,x,y,w,h) { commands.push({ op: 'image', image: image.assetId, rect: [x,y,w,h], alpha: this.globalAlpha }); },
  createRadialGradient(...args) { return { kind: 'radial', args, stops: [], addColorStop(offset,color) { this.stops.push([offset,color]); } }; },
  createLinearGradient(...args) { return { kind: 'linear', args, stops: [], addColorStop(offset,color) { this.stops.push([offset,color]); } }; }
};
const context = vm.createContext({ window: { CircuitEngine: E }, Math });
vm.runInContext(fs.readFileSync(path.join(root,'hud.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'atmosphere.js'),'utf8'),context);
const A = context.window.CircuitAtmosphere;
const field = new A.Atmosphere(640,360), assets = [];
const sprites = A.createSprites((width,height) => {
  const asset = { width,height,commands:[] }, assetId = assets.length;
  assets.push(asset);
  return { assetId,getContext:()=>({createRadialGradient:ctx.createRadialGradient,fillRect(x,y,w,h){asset.commands.push({op:'rect',rect:[x,y,w,h],style:this.fillStyle})}}) };
},config.accent);
function step() {
  // A generic pointer path illustrates the interaction without capturing the user's cursor.
  const time = field.time;
  field.movePointer(320 + Math.sin(time * .8) * 160, 185 + Math.sin(time * 1.2) * 55);
  field.update(1/20); const previous = system.sequence;
  system.update(1/20);
  if (system.sequence !== previous) field.impact(system.current);
}
for (let i=0;i<60;i++) step();
const frames = [];
for (let i=0;i<120;i++) {
  step(); commands = [];
  A.drawFog(ctx,field,sprites,config.fogStrength);
  A.drawDetails(ctx,field,sprites,config,alpha => `rgba(73,229,255,${alpha})`);
  context.window.CircuitHud.drawScene(ctx,system,config,alpha => `rgba(73,229,255,${alpha})`);
  frames.push(commands);
}
fs.writeFileSync(path.join(out,'commands.json'), JSON.stringify({ width:640,height:360,fps:20,icons,assets,frames }));
console.log(`Captured ${frames.length} frames from the v2 engine and HUD`);
