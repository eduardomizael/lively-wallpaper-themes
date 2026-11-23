(() => {
  'use strict';

  const controls = document.getElementById('controls');
  const modeBar = document.getElementById('mode-bar');
  const perfHud = document.getElementById('perf-hud');

  const params = new URLSearchParams(location.search);
  const isPreview = params.has('preview');
  const urlBackend = (params.get('backend') || '').toLowerCase();

  controls.hidden = !isPreview;
  modeBar.hidden = !isPreview;

  // 5 Arquétipos Físicos Distintos de Esferas de Energia
  const ARCHETYPES = [
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

  const SIM_RES_LEVELS = [240, 384, 512];
  const MAX_BATCH_SPLATS = 48;

  const config = {
    preset: 0,
    sphereScale: 100,
    flameIntensity: 100,
    swirlSpeed: 100,
    turbulence: 110,
    smokeLifetime: 100,
    glowStrength: 115,
    interactiveMouse: true,
    rendererBackend: urlBackend === 'webgpu' ? 1 : (urlBackend === 'webgl2' ? 2 : 0),
    simQuality: 0,
    gpuParticles: true,
    showStats: isPreview,
  };

  let canvas = document.getElementById('gl-canvas');
  let width = window.innerWidth;
  let height = window.innerHeight;
  let engine = null;
  let switching = false;
  let pendingReinit = false;
  let livelyPaused = false;
  let hiddenPaused = Boolean(document.hidden);
  let paused = livelyPaused || hiddenPaused;
  let rafId = 0;
  let lastTime = performance.now();
  let lastMouse = null;
  const pendingMouseSplats = [];

  const perf = {
    frames: 0,
    accMs: 0,
    lastSample: performance.now(),
    fps: 0,
    avgMs: 0,
  };

  // ===========================================================================
  // MOTOR WEBGL2 OTIMIZADO (SPLAT EM LOTE: 80 PASSES -> 2 PASSES/FRAME)
  // ===========================================================================
  function createWebGL2Engine(targetCanvas) {
    const gl = targetCanvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      powerPreference: 'high-performance',
    });

    if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('WebGL2 com EXT_color_buffer_float é necessário.');
    }
    gl.getExtension('OES_texture_float_linear');

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

    const vs = compile(gl.VERTEX_SHADER, S.VERT);
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

    const programs = {
      splatBatch: buildProgram(S.EMITTER_SPLAT_BATCH),
      curl: buildProgram(S.CURL_FRAG),
      vorticity: buildProgram(S.VORTICITY_FRAG),
      divergence: buildProgram(S.DIVERGENCE_FRAG),
      clearPressure: buildProgram(S.CLEAR_PRESSURE_FRAG),
      pressure: buildProgram(S.PRESSURE_FRAG),
      project: buildProgram(S.PROJECT_FRAG),
      advect: buildProgram(S.ADVECT_FRAG),
      display: buildProgram(S.DISPLAY_FRAG),
    };
    gl.deleteShader(vs);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posRadArr = new Float32Array(MAX_BATCH_SPLATS * 4);
    const velTwistArr = new Float32Array(MAX_BATCH_SPLATS * 4);
    const dyeArr = new Float32Array(MAX_BATCH_SPLATS * 4);

    let fboTargets = [];
    let velocity, dye, pressure, curlTarget, divergenceTarget;

    function createTarget(w, h, linear = true) {
      const texture = gl.createTexture();
      const fbo = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const filter = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
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

    function clear() {
      for (const t of fboTargets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.width, t.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function resize(w, h, simShortSide = 240) {
      for (const t of fboTargets) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.fbo);
      }
      fboTargets = [];

      const calcSize = shortSide => {
        const maxSide = Math.max(1280, shortSide * 2.4);
        const scale = Math.min(shortSide / Math.min(w, h), maxSide / Math.max(w, h));
        return [Math.max(32, Math.round(w * scale)), Math.max(32, Math.round(h * scale))];
      };

      const simRes = calcSize(simShortSide);
      const dyeRes = calcSize(Math.round(simShortSide * 2.5));

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
      gl.viewport(0, 0, target ? target.width : targetCanvas.width, target ? target.height : targetCanvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function runSplatBatch(emitters, w, h) {
      const count = Math.min(emitters.length, MAX_BATCH_SPLATS);
      if (count === 0) return;

      const aspect = w / Math.max(h, 1);
      for (let i = 0; i < count; i++) {
        const e = emitters[i];
        const b = i * 4;
        posRadArr[b + 0] = e.x;
        posRadArr[b + 1] = e.y;
        posRadArr[b + 2] = e.r2;
        posRadArr[b + 3] = e.phase;

        velTwistArr[b + 0] = e.vx;
        velTwistArr[b + 1] = e.vy;
        velTwistArr[b + 2] = 0;
        velTwistArr[b + 3] = e.twist;

        dyeArr[b + 0] = e.dye[0];
        dyeArr[b + 1] = e.dye[1];
        dyeArr[b + 2] = e.dye[2];
        dyeArr[b + 3] = 0;
      }

      const prog = programs.splatBatch;
      gl.useProgram(prog.handle);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(getUniformLoc(prog, 'uSplatCount'), count);
      gl.uniform1f(getUniformLoc(prog, 'uAspect'), aspect);
      gl.uniform4fv(getUniformLoc(prog, 'uSplatPosRad[0]'), posRadArr);

      // Passe 1: Velocidade
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
      gl.uniform1i(getUniformLoc(prog, 'uSource'), 0);
      gl.uniform4fv(getUniformLoc(prog, 'uSplatImpTwist[0]'), velTwistArr);
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
      gl.viewport(0, 0, velocity.write.width, velocity.write.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      velocity.swap();

      // Passe 2: Dye (raio 0.9x)
      for (let i = 0; i < count; i++) posRadArr[i * 4 + 2] *= 0.9;
      gl.uniform4fv(getUniformLoc(prog, 'uSplatPosRad[0]'), posRadArr);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dye.read.texture);
      gl.uniform1i(getUniformLoc(prog, 'uSource'), 0);
      gl.uniform4fv(getUniformLoc(prog, 'uSplatImpTwist[0]'), dyeArr);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
      gl.viewport(0, 0, dye.write.width, dye.write.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      dye.swap();
    }

    function step(time, dt, w, h, cfg, orbs, emitters) {
      runSplatBatch(emitters, w, h);

      runPass('curl', curlTarget, { uVelocity: velocity.read }, { uDt: dt });

      const curlStrength = 34.0 * (cfg.turbulence / 100);
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
      const lifeFactor = Math.max(0.3, cfg.smokeLifetime / 100);
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

      const prog = programs.display;
      gl.useProgram(prog.handle);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dye.read.texture);
      gl.uniform1i(getUniformLoc(prog, 'uDye'), 0);

      gl.uniform2f(getUniformLoc(prog, 'uTexel'), 1 / dye.read.width, 1 / dye.read.height);
      gl.uniform2f(getUniformLoc(prog, 'uResolution'), targetCanvas.width, targetCanvas.height);
      gl.uniform1f(getUniformLoc(prog, 'uTime'), time * (cfg.swirlSpeed / 100));
      gl.uniform1f(getUniformLoc(prog, 'uGlow'), cfg.glowStrength / 100);
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
      gl.viewport(0, 0, targetCanvas.width, targetCanvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function dispose() {
      for (const t of fboTargets) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.fbo);
      }
      fboTargets = [];
      for (const p of Object.values(programs)) gl.deleteProgram(p.handle);
      gl.deleteBuffer(quadBuffer);
    }

    return {
      backend: 'webgl2',
      resize,
      clear,
      step,
      dispose,
      getStats: () => ({
        backend: 'WebGL2 Batch',
        simRes: `${velocity.read.width}×${velocity.read.height}`,
        dyeRes: `${dye.read.width}×${dye.read.height}`,
        passesPerFrame: 21,
        particles: 0,
      }),
    };
  }

  // ===========================================================================
  // TROCA SEGURA DE BACKEND (SUBSTITUI CANVAS PARA EVITAR CONFLITO DE CONTEXTO)
  // ===========================================================================
  function replaceCanvas() {
    const fresh = document.createElement('canvas');
    fresh.id = 'gl-canvas';
    fresh.setAttribute('aria-label', canvas.getAttribute('aria-label') || '');
    canvas.replaceWith(fresh);
    canvas = fresh;
    applyCanvasSize();
  }

  function applyCanvasSize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  async function initEngine(replace = false) {
    if (switching) {
      pendingReinit = true;
      return;
    }
    switching = true;
    try {
      if (engine) {
        engine.dispose();
        engine = null;
      }
      if (replace) replaceCanvas();
      else applyCanvasSize();

      const wantWebGPU = config.rendererBackend === 0 || config.rendererBackend === 1;

      if (wantWebGPU && window.OriWebGPUEngine?.isSupported()) {
        try {
          engine = await window.OriWebGPUEngine.create(canvas, () => {
            console.warn('Dispositivo WebGPU perdido; reinicializando com fallback.');
            initEngine(true);
          });
          engine.resize(width, height, SIM_RES_LEVELS[config.simQuality] || 240);
          canvas.dataset.backend = 'webgpu';
          return;
        } catch (err) {
          console.warn('WebGPU falhou, usando fallback WebGL2:', err);
          replaceCanvas();
        }
      }

      engine = createWebGL2Engine(canvas);
      engine.resize(width, height, SIM_RES_LEVELS[config.simQuality] || 240);
      canvas.dataset.backend = 'webgl2';
    } catch (err) {
      console.error('Erro ao inicializar motor gráfico:', err);
    } finally {
      switching = false;
      if (pendingReinit) {
        pendingReinit = false;
        initEngine(true);
      }
    }
  }

  function resize() {
    applyCanvasSize();
    if (engine) {
      const simShort = SIM_RES_LEVELS[config.simQuality] || 240;
      engine.resize(width, height, simShort);
    }
  }

  function getActiveOrbs() {
    const baseR = 0.145 * (config.sphereScale / 100);
    if (config.preset < 5) {
      const arch = ARCHETYPES[config.preset];
      return [{ x: 0.5, y: 0.5, r: baseR * 1.18, arch }];
    }
    return [
      { x: 0.11, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[0] },
      { x: 0.305, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[1] },
      { x: 0.50, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[2] },
      { x: 0.695, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[3] },
      { x: 0.89, y: 0.50, r: baseR * 0.52, arch: ARCHETYPES[4] },
    ];
  }

  function pseudoRand(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildEmitters(time, dt, orbs) {
    const list = [];
    const aspect = width / Math.max(height, 1);
    const intensity = (config.flameIntensity / 100) * (dt * 60);
    if (intensity > 0.01) {
      const speedMul = config.swirlSpeed / 100;
      const isMulti = orbs.length > 1;
      const scaleFactor = isMulti ? 0.58 : 1.0;
      const t = time * speedMul;

      for (let idx = 0; idx < orbs.length; idx++) {
        const orb = orbs[idx];
        const pal = orb.arch;
        const type = pal.type;

        for (let j = 0; j < 8; j++) {
          const freq = 1.45 + j * 0.23;
          const cycle = Math.floor(t * freq + j * 11.3);
          const cyclePhase = (t * freq + j * 11.3) - cycle;
          const pulseEnv = Math.sin(cyclePhase * Math.PI);

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
            a = randA + cyclePhase * 0.65;
            radialWeight = 0.65;
            tangWeight = 0.72;
            speedBase = 95;
            splatRadius = orb.r * 0.19;
          } else if (type === 1) {
            radialWeight = 0.96;
            tangWeight = 0.38 * randSign;
            speedBase = 110;
            splatRadius = orb.r * 0.18;
            twist = 32 * randSign * speedMul;
          } else if (type === 2) {
            radialWeight = 0.85;
            tangWeight = 0.52 * randSign;
            speedBase = 82;
            splatRadius = orb.r * 0.205;
          } else if (type === 3) {
            radialWeight = 0.98;
            tangWeight = 0.45 * randSign;
            speedBase = 115;
            splatRadius = orb.r * 0.135;
            twist = 35 * randSign * speedMul;
          } else if (type === 4) {
            a = randA + Math.sin(cyclePhase * Math.PI) * 0.45 * randSign;
            radialWeight = 0.90;
            tangWeight = 0.58 * randSign;
            speedBase = 105;
            splatRadius = orb.r * 0.185;
          }

          const emitDist = orb.r * (0.72 + 0.16 * cyclePhase);
          const ex = orb.x + (Math.cos(a) * emitDist) / aspect;
          const ey = orb.y + Math.sin(a) * emitDist;
          const radX = Math.cos(a), radY = Math.sin(a);
          const tangX = -Math.sin(a), tangY = Math.cos(a);
          const speed = speedBase * (0.75 + 0.65 * pulseEnv) * speedMul * scaleFactor;
          const dScale = 0.095 * intensity * scaleFactor * pulseEnv;

          list.push({
            x: ex,
            y: ey,
            r2: splatRadius * splatRadius,
            vx: (radX * radialWeight + tangX * tangWeight) * speed,
            vy: (radY * radialWeight + tangY * tangWeight) * speed,
            dye: [pal.dye[0] * dScale, pal.dye[1] * dScale, pal.dye[2] * dScale],
            twist,
            phase: t * 1.4 + j * 2.1 + cycle,
          });
        }
      }
    }

    while (pendingMouseSplats.length > 0 && list.length < MAX_BATCH_SPLATS) {
      list.push(pendingMouseSplats.shift());
    }
    return list;
  }

  window.addEventListener('pointermove', e => {
    if (!config.interactiveMouse || paused) return;
    const nx = e.clientX / Math.max(width, 1);
    const ny = 1.0 - e.clientY / Math.max(height, 1);
    if (lastMouse) {
      const dx = (nx - lastMouse.x) * 3200;
      const dy = (ny - lastMouse.y) * 3200;
      if (Math.hypot(dx, dy) > 1.5) {
        const orbs = getActiveOrbs();
        let nearest = orbs[0];
        let bestD = 999;
        for (const o of orbs) {
          const d = Math.hypot(nx - o.x, ny - o.y);
          if (d < bestD) { bestD = d; nearest = o; }
        }
        pendingMouseSplats.push({
          x: nx,
          y: ny,
          r2: 0.026 * 0.026,
          vx: dx,
          vy: dy,
          dye: [nearest.arch.dye[0] * 0.22, nearest.arch.dye[1] * 0.22, nearest.arch.dye[2] * 0.22],
          twist: 20,
          phase: performance.now() * 0.002,
        });
        if (pendingMouseSplats.length > 8) pendingMouseSplats.shift();
      }
    }
    lastMouse = { x: nx, y: ny };
  });

  function syncModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.mode) === config.preset);
    });
  }

  function syncHudVisibility() {
    if (perfHud) perfHud.hidden = !config.showStats;
  }

  function applyProperty(name, value) {
    if (!(name in config)) return;
    const prevPreset = config.preset;
    const prevBackend = config.rendererBackend;
    const prevQuality = config.simQuality;

    if (name === 'interactiveMouse' || name === 'gpuParticles' || name === 'showStats') {
      config[name] = value === true || value === 'true' || value === 1;
    } else {
      config[name] = Number(value);
    }

    if (name === 'preset' && config.preset !== prevPreset && engine) {
      engine.clear();
    }
    if (name === 'rendererBackend' && config.rendererBackend !== prevBackend) {
      initEngine(true);
    } else if (name === 'simQuality' && config.simQuality !== prevQuality && engine) {
      engine.resize(width, height, SIM_RES_LEVELS[config.simQuality] || 240);
    }
    if (name === 'showStats') syncHudVisibility();

    const input = document.getElementById(name);
    if (input) {
      if (input.type === 'checkbox') input.checked = config[name];
      else input.value = config[name];
    }
    syncModeButtons();
  }

  window.livelyPropertyListener = applyProperty;

  function syncPaused() {
    const nextPaused = livelyPaused || hiddenPaused;
    if (nextPaused === paused) return;
    paused = nextPaused;
    if (paused) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    } else {
      lastTime = performance.now();
      if (!rafId) rafId = requestAnimationFrame(frame);
    }
  }

  window.livelyWallpaperPlaybackChanged = function (data) {
    let parsed = data;
    try { if (typeof data === 'string') parsed = JSON.parse(data); } catch { parsed = null; }
    livelyPaused = Boolean(parsed && parsed.IsPaused);
    syncPaused();
  };

  document.addEventListener('visibilitychange', () => {
    hiddenPaused = Boolean(document.hidden);
    syncPaused();
  });

  Object.keys(config).forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = config[key];
    else el.value = config[key];
    el.addEventListener('input', () => {
      const val = el.type === 'checkbox' ? el.checked : Number(el.value);
      applyProperty(key, val);
    });
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => applyProperty('preset', Number(btn.dataset.mode)));
  });

  const hideBtn = document.getElementById('hide');
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      controls.hidden = true;
      modeBar.hidden = true;
    });
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') {
      const next = !controls.hidden;
      controls.hidden = next;
      modeBar.hidden = next;
    } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
      applyProperty('preset', Number(e.key) - 1);
    }
  });

  window.addEventListener('resize', resize);

  function updatePerfHud(now, frameCpuMs) {
    perf.frames++;
    perf.accMs += frameCpuMs;
    const elapsed = now - perf.lastSample;
    if (elapsed >= 500) {
      perf.fps = Math.round((perf.frames * 1000) / elapsed);
      perf.avgMs = perf.accMs / Math.max(1, perf.frames);
      perf.frames = 0;
      perf.accMs = 0;
      perf.lastSample = now;
      if (perfHud && !perfHud.hidden && engine) {
        const s = engine.getStats();
        const pLine = s.particles > 0 && config.gpuParticles ? `\nPartículas GPU: ${s.particles}` : '';
        perfHud.textContent =
          `Backend: ${s.backend}\n` +
          `FPS: ${perf.fps} (${perf.avgMs.toFixed(2)} ms CPU)\n` +
          `Fluido: ${s.simRes} · Dye: ${s.dyeRes}\n` +
          `Passes/frame: ${s.passesPerFrame}${pLine}`;
      }
    }
  }

  function frame(now) {
    rafId = 0;
    if (paused) return;
    rafId = requestAnimationFrame(frame);

    const dt = Math.min((now - lastTime) * 0.001, 0.033);
    lastTime = now;
    if (!engine || switching) return;

    const t0 = performance.now();
    const time = now * 0.001;
    const orbs = getActiveOrbs();
    const emitters = buildEmitters(time, dt, orbs);
    engine.step(time, dt, width, height, config, orbs, emitters);
    updatePerfHud(now, performance.now() - t0);
  }

  syncHudVisibility();
  initEngine(false).then(() => {
    if (!paused && !rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
})();
