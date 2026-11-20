const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let draws=0,deleted=0,contexts=0,copies=0,clock=0;
const gl=new Proxy({FRAMEBUFFER_COMPLETE:1,getExtension:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,
checkFramebufferStatus:()=>1,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),createFramebuffer:()=>({}),getUniformLocation:()=>({}),
drawArrays(){draws++;},deleteTexture(){deleted++;}},{get:(t,k)=>k in t?t[k]:(()=>{})});
const E=require('../engine.js'),root={CircuitEngine:E};const context=vm.createContext({window:root,Math,performance:{now:()=>clock++}});
for(const name of ['ori-orb-shaders','ori-orbs'])vm.runInContext(fs.readFileSync(`${__dirname}/../${name}.js`,'utf8'),context);
const makeCanvas=()=>({getContext(type){if(type==='webgl2'){contexts++;return gl;}return {clearRect(){},drawImage(){copies++;}};}});
const renderer=new root.CircuitOriOrbs.Orbs(makeCanvas),system={stations:new Map()},config={markerStyle:2,orbOriginalColors:true,accent:'#49e5ff'};
renderer.update(.1,system,config);assert.equal(contexts,0,'No renderer before any hit');
system.stations.set(0,{});
for(let style=2;style<=6;style++){config.markerStyle=style;renderer.update(.04,system,config);assert.equal(renderer.ready,true,renderer.reason);}
assert.equal(contexts,1,'All archetypes reuse one context');assert.equal(copies,5);
const count=draws;renderer.update(.001,system,config);assert.equal(draws,count,'Solver is capped independently of the display FPS');
const station={icon:{x:100,y:100,radius:24},spin:1};let stamps=0;
const ctx={globalAlpha:1,save(){},restore(){},translate(){},rotate(){},drawImage(...args){stamps++;assert.ok(args.slice(1).every(Number.isFinite));}};
for(let i=0;i<90;i++)renderer.drawStation(ctx,station,1,.8,.3,1,.7);
assert.equal(stamps,90);assert.equal(contexts,1);assert.equal(draws,count,'More icons stamp the shared image without extra solver passes');assert.equal(ctx.globalAlpha,1);
config.orbOriginalColors=false;renderer.update(.04,system,config);assert.equal(renderer.ready,true);
const beforeDispose=deleted;renderer.dispose();assert.equal(deleted-beforeDispose,8);assert.equal(renderer.ready,false);
const mixed=new root.CircuitOriOrbs.Orbs(makeCanvas),contextsBefore=contexts;
system.stations=new Map(Array.from({length:7},(_,i)=>[i,{...station,spin:(i+.2)/7*E.TAU}]));
assert.deepEqual([...system.stations.values()].map(s=>E.stationMarkerStyle(s,7)),[0,1,2,3,4,5,6]);
const copiesBefore=copies;mixed.update(.04,system,{...config,markerStyle:7});
assert.equal(contexts-contextsBefore,1,'Mixed markers share one WebGL context and shader programs');
assert.equal(mixed.tiles.size,5);assert.equal(copies-copiesBefore,5);
const images=new Set();ctx.drawImage=image=>images.add(image);
for(const s of system.stations.values()){const style=E.stationMarkerStyle(s,7);if(style>=2)mixed.drawStation(ctx,s,1,0,0,1,.7,style);}
assert.equal(images.size,5,'Each v7 archetype retains its own image in mixed mode');
mixed.update(.04,system,config);assert.equal(mixed.tiles.size,1,'Returning to a fixed marker frees unused simulations');
mixed.dispose();
const fallback=new root.CircuitOriOrbs.Orbs(()=>({getContext:()=>null}));fallback.update(.04,system,config);assert.equal(fallback.failed,true);assert.equal(fallback.ready,false);
console.log('Orbes v7: cinco estilos, contexto compartilhado, limite de FPS, cores, descarte e fallback: OK');
