const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
let id=0,draws=0,deleted=0;
const gl=new Proxy({
  FRAMEBUFFER_COMPLETE:1,getExtension:()=>({}),createShader:()=>({id:id++}),createProgram:()=>({id:id++}),createBuffer:()=>({id:id++}),createTexture:()=>({id:id++}),createFramebuffer:()=>({id:id++}),
  getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>1,getUniformLocation:()=>({}),drawArrays:()=>draws++,deleteTexture:()=>deleted++,deleteFramebuffer:()=>deleted++
},{get:(target,key)=>key in target?target[key]:(()=>{})});
const canvas={dataset:{},getContext:()=>gl,addEventListener(){}};
const context=vm.createContext({window:{devicePixelRatio:1},Math,Float32Array,Number,Array,Object});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../mouse-fluid.js'),'utf8'),context);
const fluid=new context.window.CircuitMouseFluid.MouseFluid(canvas);
assert.equal(fluid.supported,true);
fluid.resize(3440,1440);
assert.equal(fluid.targets.length,8);
assert.ok(fluid.dye.read.width<=1024&&fluid.velocity.read.height===128);
const config={mouseFog:true,mouseFogStrength:35,accent:'#49e5ff'};
fluid.update(1,config);assert.equal(draws,0,'No fluid work before cursor motion');
for(let i=0;i<100;i++)fluid.move(100+i,200,2,1,260);
assert.equal(fluid.pending.length,12);
fluid.update(.04,config);assert.ok(draws>0);assert.equal(fluid.pending.length,0);
assert.equal(fluid.active,true);
fluid.update(2.5,config);assert.equal(fluid.active,false,'Fluid clears and sleeps after the fade');
fluid.move(300,200,3,1,260);fluid.update(.04,{...config,mouseFog:false});assert.equal(fluid.active,false);
fluid.resize(1920,1080);assert.ok(deleted>=16,'Resize frees the old textures/framebuffers');assert.equal(fluid.targets.length,8);
assert.equal(fluid.move(-1,200,2,2,260),false);
assert.equal(fluid.move(20,20,0,0,260),false);
for(let i=0;i<100;i++)fluid.inject(500,500,0,0,120,2,20);
assert.equal(fluid.pending.length,48,'Projectile splats are bounded even at impact');
assert.equal(fluid.inject(NaN,200,1,1,100),false);
fluid.lifetime=.8;fluid.update(.04,config);fluid.update(.9,config);assert.equal(fluid.active,false,'Projectile residue honors its configured lifetime');
fluid.dispose();assert.equal(fluid.targets.length,0);
const fallback=new context.window.CircuitMouseFluid.MouseFluid({getContext:()=>null});assert.equal(fallback.supported,false);fallback.resize(100,100);fallback.update(1,config);
console.log('Fluido: fila limitada, recursos liberados, repouso e compatibilidade: OK');
