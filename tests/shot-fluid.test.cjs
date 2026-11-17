const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../engine.js');
class Fluid {constructor(){this.supported=true;this.active=false;this.pending=[];}resize(){}clear(){this.active=false;this.pending=[];}inject(...args){this.pending.push(args);this.active=true;}update(dt,config){this.config=config;}}
const root={CircuitEngine:E,CircuitMouseFluid:{MouseFluid:Fluid}};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../shot-fluid.js`,'utf8'),{window:root,Math});
const effect=new root.CircuitShotFluid.ShotFluid({});effect.resize(3440,1440);
const config={shotStyle:0,trail:180,glow:70,accent:'#49e5ff'};
const system=new E.PulseSystem([{id:0,x:1000,y:700,radius:24},{id:1,x:2200,y:700,radius:24}],{width:3440,height:1440,speed:800});
let before=effect.capture(system);system.update(.05);effect.update(.05,system,before,config);
assert.equal(effect.fluid,null,'Laser mode allocates no extra WebGL context');
config.shotStyle=1;
before=effect.capture(system);system.update(.05);effect.update(.05,system,before,config);
assert.ok(effect.fluid.pending.length>1,'Fast shots interpolate multiple fluid samples');
assert.ok(effect.fluid.pending.length<=24);assert.equal(effect.fluid.config.mouseFog,true,'Projectile fluid is independent of mouse controls');
while(system.shot){before=effect.capture(system);system.update(.05);effect.fluid.pending=[];effect.update(.05,system,before,config);}
assert.ok(effect.fluid.pending.filter(p=>p[5]>=1.25).length===9,'Impact emits a center and eight expanding splats');
config.shotStyle=0;effect.update(.05,system,effect.capture(system),config);assert.equal(effect.active,false);
config.shotStyle=1;effect.fluid.supported=false;
for(let i=0;i<200;i++)effect.emit(500,500,1,1,100,.4,10);
assert.equal(effect.puffs.length,96,'Compatibility trail is bounded');
effect.update(4,system,effect.capture(system),config);assert.equal(effect.puffs.length,0,'Compatibility trail expires');
const click=new root.CircuitShotFluid.ShotFluid({});click.resize(1000,800);
assert.equal(click.burst(-1,50),false);assert.equal(click.fluid,null,'Invalid clicks allocate nothing');
assert.equal(click.burst(400,300),true);assert.equal(click.fluid.pending.length,9);
click.update(.04,null,click.capture(null),{...config,shotStyle:0});
assert.equal(click.active,true,'Click burst works without icons, mouse fog or fluid projectiles');
assert.equal(click.fluid.lifetime,1.6);
click.update(2,null,click.capture(null),{...config,shotStyle:0});assert.equal(click.active,false,'Manual explosion expires and sleeps');
console.log('Tiro fluido: amostragem, impacto, controles independentes, alternativa e limites: OK');
