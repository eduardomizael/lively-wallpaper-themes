/*
 * Fluid layer shared by mouse and projectile renderers. Shaders adapted from WebGL-Fluid-Simulation.
 * Copyright (c) 2017 Pavel Dobryakov. MIT license: licenses/Fluids-MIT.txt.
 * No audio input, random splats, background, bloom, network or independent animation loop.
 */
(function (root) {
  'use strict';
  const vertex = `#version 300 es
    layout(location=0) in vec2 position; out vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const prelude = `#version 300 es
    precision highp float; precision highp sampler2D;
    in vec2 uv; out vec4 result;
    uniform sampler2D a; uniform sampler2D b;
    uniform vec2 texel; uniform float dt;
    vec4 bilerp(sampler2D image,vec2 p,vec2 size){
      vec2 st=p*size-.5, i=floor(st), f=fract(st);
      return mix(mix(texture(image,(i+.5)/size),texture(image,(i+vec2(1.5,.5))/size),f.x),
                 mix(texture(image,(i+vec2(.5,1.5))/size),texture(image,(i+1.5)/size),f.x),f.y);
    }`;
  const shaders = {
    splat: `uniform vec2 point; uniform vec3 impulse; uniform float aspect; uniform float radius; uniform float twist;
      void main(){vec2 p=uv-point;p.x*=aspect;float k=exp(-dot(p,p)/radius);
        vec3 v=impulse;v.xy+=vec2(-p.y,p.x)/sqrt(radius)*twist;
        result=vec4(texture(a,uv).xyz+k*v,1.);}`,
    curl: `void main(){float L=texture(a,uv-vec2(texel.x,0)).y,R=texture(a,uv+vec2(texel.x,0)).y;
      float T=texture(a,uv+vec2(0,texel.y)).x,B=texture(a,uv-vec2(0,texel.y)).x;
      result=vec4(.5*(R-L-T+B),0,0,1);}`,
    vorticity: `void main(){float L=texture(b,uv-vec2(texel.x,0)).x,R=texture(b,uv+vec2(texel.x,0)).x;
      float T=texture(b,uv+vec2(0,texel.y)).x,B=texture(b,uv-vec2(0,texel.y)).x,C=texture(b,uv).x;
      vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+.0001;f*=24.*C;f.y*=-1.;
      result=vec4(clamp(texture(a,uv).xy+f*dt,vec2(-500.),vec2(500.)),0,1);}`,
    divergence: `void main(){vec2 C=texture(a,uv).xy;
      float L=uv.x-texel.x<0.?-C.x:texture(a,uv-vec2(texel.x,0)).x;
      float R=uv.x+texel.x>1.?-C.x:texture(a,uv+vec2(texel.x,0)).x;
      float T=uv.y+texel.y>1.?-C.y:texture(a,uv+vec2(0,texel.y)).y;
      float B=uv.y-texel.y<0.?-C.y:texture(a,uv-vec2(0,texel.y)).y;
      result=vec4(.5*(R-L+T-B),0,0,1);}`,
    clearPressure: `void main(){result=texture(a,uv)*.8;}`,
    pressure: `void main(){float L=texture(a,uv-vec2(texel.x,0)).x,R=texture(a,uv+vec2(texel.x,0)).x;
      float T=texture(a,uv+vec2(0,texel.y)).x,B=texture(a,uv-vec2(0,texel.y)).x;
      result=vec4((L+R+T+B-texture(b,uv).x)*.25,0,0,1);}`,
    project: `void main(){float L=texture(a,uv-vec2(texel.x,0)).x,R=texture(a,uv+vec2(texel.x,0)).x;
      float T=texture(a,uv+vec2(0,texel.y)).x,B=texture(a,uv-vec2(0,texel.y)).x;
      result=vec4(texture(b,uv).xy-vec2(R-L,T-B),0,1);}`,
    advect: `uniform vec2 velocitySize;uniform vec2 sourceSize;uniform float dissipation;
      void main(){vec2 p=uv-dt*bilerp(a,uv,velocitySize).xy/velocitySize;
      result=bilerp(b,p,sourceSize)/(1.+dissipation*dt);}`,
    display: `uniform vec3 tint;uniform float strength;uniform float fade;
      void main(){float d=max(0.,bilerp(a,uv,1./texel).x);
        float L=texture(a,uv-vec2(texel.x,0)).x,R=texture(a,uv+vec2(texel.x,0)).x;
        float T=texture(a,uv+vec2(0,texel.y)).x,B=texture(a,uv-vec2(0,texel.y)).x;
        float shade=.72+.28*max(0.,dot(normalize(vec3(L-R,B-T,.15)),normalize(vec3(.3,.5,1.))));
        float alpha=(1.-exp(-d*1.5))*strength*.42*fade;
        result=vec4(tint*shade,alpha);}`
  };
  class MouseFluid {
    constructor(canvas) {
      this.canvas=canvas;this.supported=false;this.active=false;this.pending=[];this.targets=[];this.programs={};
      this.width=1;this.height=1;this.quiet=3;this.accumulator=0;
      try { this.init(); } catch(error) { this.reason=String(error.message||error);this.dispose(); }
      if(canvas.dataset)canvas.dataset.renderer=this.supported?'fluid':'compatibility';
      canvas.addEventListener?.('webglcontextlost',event=>{event.preventDefault();this.supported=false;this.active=false;this.pending=[];});
      canvas.addEventListener?.('webglcontextrestored',()=>{
        try {this.targets=[];this.programs={};this.init();this.resize(this.width,this.height);} catch(error){this.reason=String(error.message||error);this.dispose();}
      });
    }
    init() {
      const gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,depth:false,stencil:false,antialias:false,preserveDrawingBuffer:false});
      if(!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets unavailable');
      this.gl=gl;
      const compile=(type,source)=>{
        const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);}
        return shader;
      };
      const vs=compile(gl.VERTEX_SHADER,vertex);
      try {
        for(const [name,body] of Object.entries(shaders)) {
          const fs=compile(gl.FRAGMENT_SHADER,prelude+body),handle=gl.createProgram();
          gl.attachShader(handle,vs);gl.attachShader(handle,fs);gl.linkProgram(handle);gl.deleteShader(fs);
          if(!gl.getProgramParameter(handle,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(handle);gl.deleteProgram(handle);throw new Error(message);}
          this.programs[name]={handle,uniforms:{}};
        }
      } finally {gl.deleteShader(vs);}
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);this.supported=true;
    }
    target(width,height) {
      const gl=this.gl,texture=gl.createTexture(),fbo=gl.createFramebuffer();
      const target={texture,fbo,width,height};this.targets.push(target);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Fluid framebuffer incomplete');
      gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT);return target;
    }
    pair(width,height) {
      return {read:this.target(width,height),write:this.target(width,height),swap(){[this.read,this.write]=[this.write,this.read];}};
    }
    resize(width,height) {
      this.width=Math.max(1,width);this.height=Math.max(1,height);
      if(!this.supported) return;
      const gl=this.gl;
      for(const target of this.targets){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.fbo);} this.targets=[];
      const outputScale=Math.min(root.devicePixelRatio||1,3840/this.width,2160/this.height);
      this.canvas.width=Math.max(1,Math.round(this.width*outputScale));this.canvas.height=Math.max(1,Math.round(this.height*outputScale));
      const size=short=>{const scale=Math.min(short/Math.min(this.width,this.height),1024/Math.max(this.width,this.height));return [Math.max(16,Math.round(this.width*scale)),Math.max(16,Math.round(this.height*scale))];};
      try {
        const sim=size(128),dye=size(384);
        this.velocity=this.pair(...sim);this.dye=this.pair(...dye);this.pressure=this.pair(...sim);
        this.curl=this.target(...sim);this.divergence=this.target(...sim);this.clear();
      } catch(error){this.reason=String(error.message||error);this.dispose();}
    }
    clear() {
      this.pending=[];this.active=false;this.quiet=3;this.accumulator=0;
      if(!this.supported) return;
      const gl=this.gl;
      for(const target of this.targets){gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.viewport(0,0,target.width,target.height);gl.clear(gl.COLOR_BUFFER_BIT);}
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);
    }
    move(x,y,dx,dy,size) {
      if(!this.supported || ![x,y,dx,dy,size].every(Number.isFinite) || x<0 || y<0 || x>this.width || y>this.height || Math.hypot(dx,dy)<.35) return false;
      this.pending.push({x:x/this.width,y:1-y/this.height,dx:dx/this.width*6000,dy:-dy/this.height*6000,size:Math.max(60,Math.min(500,size))});
      if(this.pending.length>12)this.pending.shift();this.quiet=0;this.active=true;return true;
    }
    inject(x,y,dx,dy,size,density=.75,twist=10) {
      if(!this.supported || ![x,y,dx,dy,size,density,twist].every(Number.isFinite) || x<0 || y<0 || x>this.width || y>this.height) return false;
      this.pending.push({x:x/this.width,y:1-y/this.height,dx:dx/this.width*6000,dy:-dy/this.height*6000,size:Math.max(30,Math.min(500,size)),density:Math.max(0,Math.min(3,density)),twist});
      if(this.pending.length>48)this.pending.shift();this.quiet=0;this.active=true;return true;
    }
    pass(name,target,textures={},values={}) {
      const gl=this.gl,program=this.programs[name];gl.useProgram(program.handle);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      const location=name=>name in program.uniforms?program.uniforms[name]:(program.uniforms[name]=gl.getUniformLocation(program.handle,name));
      let unit=0;
      for(const [key,image] of Object.entries(textures)){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,image.texture);gl.uniform1i(location(key),unit++);}
      const texel=target?[1/target.width,1/target.height]:[1/this.dye.read.width,1/this.dye.read.height];
      for(const [key,value] of Object.entries({texel,...values})) {
        if(Array.isArray(value)){if(value.length===2)gl.uniform2f(location(key),...value);else gl.uniform3f(location(key),...value);}
        else gl.uniform1f(location(key),value);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.width||this.canvas.width,target?.height||this.canvas.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    update(dt,config) {
      if(!this.supported) return;
      if(!config.mouseFog || !config.mouseFogStrength){if(this.active)this.clear();return;}
      if(!this.active) return;
      this.quiet+=Math.max(0,dt);
      const lifetime=this.lifetime||2.4;
      if(this.quiet>=lifetime){this.clear();return;}
      this.accumulator+=Math.max(0,dt);if(this.accumulator<1/30)return;
      const step=Math.min(this.accumulator,.0334);this.accumulator=0;
      const v=this.velocity,p=this.pressure,d=this.dye;
      for(const input of this.pending.splice(0)) {
        const radius=(input.size*.17/this.height)**2,aspect=this.width/this.height;
        this.pass('splat',v.write,{a:v.read},{point:[input.x,input.y],impulse:[input.dx,input.dy,0],radius,aspect,twist:input.twist??10*Math.sin(input.x*97+input.y*67)});v.swap();
        this.pass('splat',d.write,{a:d.read},{point:[input.x,input.y],impulse:[input.density??.75,0,0],radius,aspect,twist:0});d.swap();
      }
      this.pass('curl',this.curl,{a:v.read});
      this.pass('vorticity',v.write,{a:v.read,b:this.curl},{dt:step});v.swap();
      this.pass('divergence',this.divergence,{a:v.read});
      this.pass('clearPressure',p.write,{a:p.read});p.swap();
      for(let i=0;i<10;i++){this.pass('pressure',p.write,{a:p.read,b:this.divergence});p.swap();}
      this.pass('project',v.write,{a:p.read,b:v.read});v.swap();
      const velocitySize=[v.read.width,v.read.height];
      this.pass('advect',v.write,{a:v.read,b:v.read},{velocitySize,sourceSize:velocitySize,dt:step,dissipation:.65});v.swap();
      this.pass('advect',d.write,{a:v.read,b:d.read},{velocitySize,sourceSize:[d.read.width,d.read.height],dt:step,dissipation:2.4});d.swap();
      const tint=[1,3,5].map(i=>parseInt(config.accent.slice(i,i+2),16)/255);
      this.pass('display',null,{a:d.read},{tint,strength:config.mouseFogStrength/100,fade:Math.min(1,(lifetime-this.quiet)/Math.min(.65,lifetime))});
    }
    dispose() {
      const gl=this.gl;
      if(gl){for(const target of this.targets){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.fbo);}for(const p of Object.values(this.programs))gl.deleteProgram(p.handle);if(this.buffer)gl.deleteBuffer(this.buffer);}
      this.targets=[];this.programs={};this.supported=false;this.active=false;this.pending=[];
    }
  }
  root.CircuitMouseFluid={MouseFluid};
})(window);
