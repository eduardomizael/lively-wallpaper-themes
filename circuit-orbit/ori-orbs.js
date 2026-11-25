/* V7 orb renderer: up to five 256px tiles sharing one WebGL context and scheduler. */
(function(root){
  'use strict';
  const PALETTES = [
    {
      type: 0,
      name: '1 · Vórtice Solar (Fitas em Espiral)',
      core: [2.35, 2.05, 1.15],
      mid: [1.55, 0.72, 0.10],
      smoke: [0.55, 0.15, 0.015],
      dye: [1.10, 0.42, 0.04],
    },
    {
      type: 1,
      name: '2 · Combustão Radial (Erupção Carmesim 360°)',
      core: [2.45, 1.55, 1.05],
      mid: [1.65, 0.20, 0.04],
      smoke: [0.58, 0.035, 0.01],
      dye: [1.15, 0.14, 0.02],
    },
    {
      type: 2,
      name: '3 · Pulso de Éter (Ondas Concêntricas)',
      core: [2.15, 1.55, 2.55],
      mid: [0.90, 0.18, 1.58],
      smoke: [0.30, 0.04, 0.58],
      dye: [0.70, 0.12, 1.18],
    },
    {
      type: 3,
      name: '4 · Tempestade de Plasma (Raios Caóticos)',
      core: [1.65, 2.45, 2.65],
      mid: [0.06, 1.10, 1.62],
      smoke: [0.015, 0.32, 0.62],
      dye: [0.05, 0.78, 1.15],
    },
    {
      type: 4,
      name: '5 · Estrela Solar (Fotosfera & Coroa 360°)',
      core: [2.55, 2.25, 1.35],
      mid: [1.75, 0.62, 0.08],
      smoke: [0.62, 0.14, 0.015],
      dye: [1.20, 0.40, 0.03],
    },
  ];

  function createTile(makeCanvas, shared=null) {
    const canvas=shared?.canvas||makeCanvas(256,256), image=makeCanvas(256,256), imageCtx=image.getContext('2d');
    const gl=shared?.gl||canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,depth:false,stencil:false,antialias:false});
    if(!gl||!gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float unavailable');
    const linearSupported=Boolean(gl.getExtension('OES_texture_float_linear'));
    const ARCHETYPES=PALETTES.map(a=>({...a}));
    const config={preset:0,sphereScale:100,flameIntensity:100,swirlSpeed:100,turbulence:110,smokeLifetime:100,glowStrength:115};
  const S = window.OriShaders;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vs = shared?.vs||compile(gl.VERTEX_SHADER, S.VERT);
  function buildProgram(fragBody) {
    const fs = compile(gl.FRAGMENT_SHADER, S.PRELUDE + fragBody);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    return { handle: prog, uniforms: {} };
  }

  const programs = shared?.programs||{
    splat: buildProgram(S.EMITTER_SPLAT),
    curl: buildProgram(S.CURL_FRAG),
    vorticity: buildProgram(S.VORTICITY_FRAG),
    divergence: buildProgram(S.DIVERGENCE_FRAG),
    clearPressure: buildProgram(S.CLEAR_PRESSURE_FRAG),
    pressure: buildProgram(S.PRESSURE_FRAG),
    project: buildProgram(S.PROJECT_FRAG),
    advect: buildProgram(S.ADVECT_FRAG),
    display: buildProgram(S.DISPLAY_FRAG),
  };

  const quadBuffer = shared?.quadBuffer||gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  let fboTargets = [];
  function createTarget(w, h, linear = true) {
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = linear && linearSupported ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Orb framebuffer incomplete");
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const t = { texture, fbo, width: w, height: h };
    fboTargets.push(t);
    return t;
  }

  function createPair(w, h, linear = true) {
    return {
      read: createTarget(w, h, linear),
      write: createTarget(w, h, linear),
      swap() {
        const tmp = this.read;
        this.read = this.write;
        this.write = tmp;
      },
    };
  }

  let width = 256;
  let height = 256;
  let velocity, dye, pressure, curlTarget, divergenceTarget;

  function clearFluidTargets() {
    for (const t of fboTargets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.width, t.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    width = 256;
    height = 256;
    const dpr = 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    for (const t of fboTargets) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.fbo);
    }
    fboTargets = [];

    const calcSize = shortSide => {
      const scale = Math.min(shortSide / Math.min(width, height), 1280 / Math.max(width, height));
      return [Math.max(32, Math.round(width * scale)), Math.max(32, Math.round(height * scale))];
    };

    const simRes = calcSize(128);
    const dyeRes = calcSize(256);

    velocity = createPair(simRes[0], simRes[1], true);
    dye = createPair(dyeRes[0], dyeRes[1], true);
    pressure = createPair(simRes[0], simRes[1], false);
    curlTarget = createTarget(simRes[0], simRes[1], false);
    divergenceTarget = createTarget(simRes[0], simRes[1], false);
  }

  function getUniformLoc(prog, name) {
    if (!(name in prog.uniforms)) {
      prog.uniforms[name] = gl.getUniformLocation(prog.handle, name);
    }
    return prog.uniforms[name];
  }

  function runPass(name, target, textures = {}, uniforms = {}) {
    const prog = programs[name];
    gl.useProgram(prog.handle);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let unit = 0;
    for (const [k, texObj] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texObj.texture);
      gl.uniform1i(getUniformLoc(prog, k), unit++);
    }

    const texel = target
      ? [1 / target.width, 1 / target.height]
      : [1 / dye.read.width, 1 / dye.read.height];
    gl.uniform2f(getUniformLoc(prog, 'uTexel'), texel[0], texel[1]);

    for (const [k, val] of Object.entries(uniforms)) {
      const loc = getUniformLoc(prog, k);
      if (loc === null) continue;
      if (typeof val === 'number') {
        gl.uniform1f(loc, val);
      } else if (Array.isArray(val)) {
        if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
        else if (val.length === 3) gl.uniform3f(loc, val[0], val[1], val[2]);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function injectFluid(x, y, vx, vy, radiusNorm, colorRgb, twist, phase = 0) {
    const aspect = width / height;
    const r2 = radiusNorm * radiusNorm;

    runPass(
      'splat',
      velocity.write,
      { uSource: velocity.read },
      {
        uPoint: [x, y],
        uImpulse: [vx, vy, 0],
        uAspect: aspect,
        uRadius: r2,
        uTwist: twist,
        uPhase: phase,
      }
    );
    velocity.swap();

    runPass(
      'splat',
      dye.write,
      { uSource: dye.read },
      {
        uPoint: [x, y],
        uImpulse: colorRgb,
        uAspect: aspect,
        uRadius: r2 * 0.9,
        uTwist: 0,
        uPhase: phase,
      }
    );
    dye.swap();
  }

  function getActiveOrbs() {
    const baseR = 0.13 * (config.sphereScale / 100);
    if (config.preset < 5) {
      const arch = ARCHETYPES[config.preset];
      return [
        {
          x: 0.5,
          y: 0.5,
          r: baseR * 1.18,
          arch,
        },
      ];
    }
    // Modo 5: Vitrine com as 5 Esferas perfeitamente alinhadas
    return [
      { x: 0.11, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[0] },
      { x: 0.305, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[1] },
      { x: 0.50, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[2] },
      { x: 0.695, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[3] },
      { x: 0.89, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[4] },
    ];
  }

  // Gerador pseudo-aleatório determinístico por pulso para espalhar tufos em todas as direções (360°)
  function pseudoRand(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ===========================================================================
  // EMISSÃO ESPARSA E MULTIDIRECIONAL (360°) NA SUPERFÍCIE DA ESFERA
  // ===========================================================================
  function emitArchetypeFluid(time, dt) {
    const orbs = getActiveOrbs();
    const aspect = width / height;
    const intensity = (config.flameIntensity / 100) * (dt * 60);
    if (intensity <= 0.01) return;

    const speedMul = config.swirlSpeed / 100;
    const isMulti = orbs.length > 1;
    const scaleFactor = isMulti ? 0.58 : 1.0;
    const t = time * speedMul;

    for (let idx = 0; idx < orbs.length; idx++) {
      const orb = orbs[idx];
      const pal = orb.arch;
      const type = pal.type;

      // 8 emissores estocásticos distribuídos em 360° (Golden Angle + salto pseudo-aleatório por ciclo)
      const emitters = 8;
      for (let j = 0; j < emitters; j++) {
        const freq = 1.45 + j * 0.23;
        const cycle = Math.floor(t * freq + j * 11.3);
        const cyclePhase = (t * freq + j * 11.3) - cycle;
        const pulseEnv = Math.sin(cyclePhase * Math.PI);

        // Golden Angle (2.39996 rad) garante cobertura 360° uniforme + jitter por ciclo para ser esparso e imprevisível
        const goldenBase = j * 2.3999632 + idx * 1.1;
        const randJitter = (pseudoRand(cycle * 19.3 + j * 73.1 + idx * 101.0) - 0.5) * 1.45;
        const randA = goldenBase + randJitter + cycle * 0.85;
        const randSign = pseudoRand(cycle * 37.7 + j * 13.9) > 0.5 ? 1.0 : -1.0;

        let a = randA;
        let radialWeight = 0.85;
        let tangWeight = 0.45 * randSign;
        let speedBase = 95;
        let splatRadius = orb.r * 0.175;
        let twist = 26 * randSign * speedMul;

        if (type === 0) {
          // 1 · Vórtice Solar: rotação tangencial + ejeções esparsas em 360°
          a = randA + cyclePhase * 0.65;
          radialWeight = 0.65;
          tangWeight = 0.72;
          speedBase = 95;
          splatRadius = orb.r * 0.19;
        } else if (type === 1) {
          // 2 · Combustão Radial: explosões de fogo nascendo na casca (r = 0.72) e saindo em 360°
          a = randA;
          radialWeight = 0.96;
          tangWeight = 0.38 * randSign;
          speedBase = 110;
          splatRadius = orb.r * 0.18;
          twist = 32 * randSign * speedMul;
        } else if (type === 2) {
          // 3 · Pulso de Éter: nuvens suaves que se expandem em várias direções com redemoinhos duplos
          a = randA;
          radialWeight = 0.85;
          tangWeight = 0.52 * randSign;
          speedBase = 82;
          splatRadius = orb.r * 0.205;
        } else if (type === 3) {
          // 4 · Tempestade de Plasma (Ciano): descargas rápidas e finas em direções aleatórias
          a = randA;
          radialWeight = 0.98;
          tangWeight = 0.45 * randSign;
          speedBase = 115;
          splatRadius = orb.r * 0.135;
          twist = 35 * randSign * speedMul;
        } else if (type === 4) {
          // 5 · Estrela Solar Completa: proeminências e ejeções coronais arqueadas em 360°
          a = randA + Math.sin(cyclePhase * Math.PI) * 0.45 * randSign;
          radialWeight = 0.90;
          tangWeight = 0.58 * randSign;
          speedBase = 105;
          splatRadius = orb.r * 0.185;
        }

        // Nasce na casca visível da esfera (0.72 * orb.r) e se move para fora!
        const emitDist = orb.r * (0.72 + 0.16 * cyclePhase);
        const ex = orb.x + (Math.cos(a) * emitDist) / aspect;
        const ey = orb.y + Math.sin(a) * emitDist;

        const radX = Math.cos(a), radY = Math.sin(a);
        const tangX = -Math.sin(a), tangY = Math.cos(a);

        const speed = speedBase * (0.75 + 0.65 * pulseEnv) * speedMul * scaleFactor;
        const vx = (radX * radialWeight + tangX * tangWeight) * speed;
        const vy = (radY * radialWeight + tangY * tangWeight) * speed;

        const dScale = 0.095 * intensity * scaleFactor * pulseEnv;

        injectFluid(
          ex,
          ey,
          vx,
          vy,
          splatRadius,
          pal.dye.map(c => c * dScale),
          twist,
          t * 1.4 + j * 2.1 + cycle
        );
      }
    }
  }


  function step(dt,time){
    if(gl.isContextLost()) throw new Error('Orb WebGL context lost');
    emitArchetypeFluid(time, dt);

    runPass('curl', curlTarget, { uVelocity: velocity.read }, { uDt: dt });

    const curlStrength = 34.0 * (config.turbulence / 100);
    runPass(
      'vorticity',
      velocity.write,
      { uVelocity: velocity.read, uCurl: curlTarget },
      { uDt: dt, uCurlStrength: curlStrength }
    );
    velocity.swap();

    runPass('divergence', divergenceTarget, { uVelocity: velocity.read }, { uDt: dt });
    runPass('clearPressure', pressure.write, { uPressure: pressure.read }, { uDt: dt });
    pressure.swap();

    for (let i = 0; i < 12; i++) {
      runPass(
        'pressure',
        pressure.write,
        { uPressure: pressure.read, uDivergence: divergenceTarget },
        { uDt: dt }
      );
      pressure.swap();
    }

    runPass(
      'project',
      velocity.write,
      { uPressure: pressure.read, uVelocity: velocity.read },
      { uDt: dt }
    );
    velocity.swap();

    const velSize = [velocity.read.width, velocity.read.height];
    const dyeSize = [dye.read.width, dye.read.height];
    const lifeFactor = Math.max(0.3, config.smokeLifetime / 100);
    const dyeDissipation = 2.05 / lifeFactor;

    runPass(
      'advect',
      velocity.write,
      { uVelocity: velocity.read, uSource: velocity.read },
      { uDt: dt, uVelocitySize: velSize, uSourceSize: velSize, uDissipation: 1.05, uBlurMix: 0.08 }
    );
    velocity.swap();

    runPass(
      'advect',
      dye.write,
      { uVelocity: velocity.read, uSource: dye.read },
      { uDt: dt, uVelocitySize: velSize, uSourceSize: dyeSize, uDissipation: dyeDissipation, uBlurMix: 0.28 }
    );
    dye.swap();

    const orbs = getActiveOrbs();
    const prog = programs.display;
    gl.useProgram(prog.handle);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.texture);
    gl.uniform1i(getUniformLoc(prog, 'uDye'), 0);

    gl.uniform2f(getUniformLoc(prog, 'uTexel'), 1 / dye.read.width, 1 / dye.read.height);
    gl.uniform2f(getUniformLoc(prog, 'uResolution'), canvas.width, canvas.height);
    gl.uniform1f(getUniformLoc(prog, 'uTime'), time * (config.swirlSpeed / 100));
    gl.uniform1f(getUniformLoc(prog, 'uGlow'), config.glowStrength / 100);
    gl.uniform1i(getUniformLoc(prog, 'uOrbCount'), orbs.length);

    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      gl.uniform3f(getUniformLoc(prog, `uOrbCenters[${i}]`), o.x, o.y, o.r);
      gl.uniform1i(getUniformLoc(prog, `uOrbTypes[${i}]`), o.arch.type);
      gl.uniform3fv(getUniformLoc(prog, `uCoreColors[${i}]`), o.arch.core);
      gl.uniform3fv(getUniformLoc(prog, `uMidColors[${i}]`), o.arch.mid);
      gl.uniform3fv(getUniformLoc(prog, `uSmokeColors[${i}]`), o.arch.smoke);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


    imageCtx.clearRect(0,0,256,256);imageCtx.drawImage(canvas,0,0);
  }
  resize();
  return {image, step, shared:{canvas,gl,vs,programs,quadBuffer},
    select(type,original,accent){
      config.preset=type;
      ARCHETYPES[type]={...PALETTES[type]};
      if(!original){const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)/255);
        Object.assign(ARCHETYPES[type],{core:rgb.map(c=>c*1.8+.5),mid:rgb.map(c=>c*1.6),smoke:rgb.map(c=>c*.5),dye:rgb.map(c=>c*1.1)});}
      clearFluidTargets();
    },
    dispose(){for(const t of fboTargets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}}
  };
  }
  class Orbs {
    constructor(makeCanvas){this.makeCanvas=makeCanvas;this.tiles=new Map();this.shared=null;this.failed=false;this.time=0;this.readyTypes=new Set();this.stats={frames:0,totalMs:0,maxMs:0};}
    update(dt,system,config){
      this.ready=false;
      this.readyTypes.clear();this.currentStyle=config.markerStyle;
      if(config.markerStyle<2||!system?.stations.size)return;
      if(this.failed)return;
      try {
        const requested=config.markerStyle===7?new Set([...system.stations.values()].map(s=>root.CircuitEngine.stationMarkerStyle(s,7)).filter(s=>s>=2)):new Set([config.markerStyle]);
        for(const [style,entry] of this.tiles)if(!requested.has(style)){entry.tile.dispose();this.tiles.delete(style);}
        this.time+=Math.max(0,dt);
        for(const style of requested){
          let entry=this.tiles.get(style);
          if(!entry){const tile=createTile(this.makeCanvas,this.shared);this.shared=tile.shared;entry={tile,key:'',accumulator:0};this.tiles.set(style,entry);}
          const type=style-2,key=JSON.stringify([type,config.orbOriginalColors,config.accent]);
          if(key!==entry.key){entry.tile.select(type,config.orbOriginalColors,config.accent);entry.key=key;entry.accumulator=1/30;}
          entry.accumulator+=Math.max(0,dt);
          if(entry.accumulator>=1/30){const started=performance.now();entry.tile.step(Math.min(entry.accumulator,.05),this.time);entry.accumulator=0;
            const ms=performance.now()-started;this.stats.frames++;this.stats.totalMs+=ms;this.stats.maxMs=Math.max(this.stats.maxMs,ms);}
          this.readyTypes.add(style);
        }
        this.ready=this.readyTypes.size>0;
      } catch(error){this.reason=String(error.message||error);this.failed=true;this.dispose();}
    }
    drawStation(ctx,station,time,charge,flare,opacity,intensity,style=this.currentStyle){
      if(!this.readyTypes.has(style)||opacity<=0)return false;
      const {x,y,radius}=station.icon, pulse=Math.sin(time*2.3+station.spin)*.025;
      const extent=radius*3.26*(1+pulse-charge**4*.12+flare*.15);
      ctx.globalAlpha=Math.min(1,opacity*intensity*(.8+charge**4*.4+flare*.3));
      ctx.save();ctx.translate(x,y);ctx.rotate(station.spin);
      ctx.drawImage(this.tiles.get(style).tile.image,-extent,-extent,extent*2,extent*2);ctx.restore();ctx.globalAlpha=1;return true;
    }
    dispose(){for(const e of this.tiles.values())e.tile.dispose();this.tiles.clear();if(this.shared){const {gl,programs,quadBuffer,vs}=this.shared;for(const p of Object.values(programs))gl.deleteProgram(p.handle);gl.deleteBuffer(quadBuffer);gl.deleteShader(vs);gl.getExtension('WEBGL_lose_context')?.loseContext?.();}this.shared=null;this.ready=false;this.readyTypes.clear();}
  }
  root.CircuitOriOrbs={Orbs};
})(window);
