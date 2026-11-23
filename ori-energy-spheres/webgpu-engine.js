(() => {
  'use strict';

  const MAX_SPLATS = 48;
  const PARTICLE_COUNT = 8192;

  const WGSL_COMMON = /* wgsl */ `
    fn hash12(p: vec2<f32>) -> f32 {
      var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    fn noise2(p: vec2<f32>) -> f32 {
      let i = floor(p);
      let f = fract(p);
      let u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash12(i + vec2<f32>(0.0, 0.0)), hash12(i + vec2<f32>(1.0, 0.0)), u.x),
        mix(hash12(i + vec2<f32>(0.0, 1.0)), hash12(i + vec2<f32>(1.0, 1.0)), u.x),
        u.y
      );
    }

    fn fbm(pIn: vec2<f32>) -> f32 {
      var p = pIn;
      var v = 0.0;
      var a = 0.52;
      let rot = mat2x2<f32>(0.87758, 0.47942, -0.47942, 0.87758);
      for (var i = 0; i < 3; i++) {
        v += a * noise2(p);
        p = rot * p * 1.95;
        a *= 0.48;
      }
      return v;
    }

    fn ridgedFbm(pIn: vec2<f32>) -> f32 {
      var p = pIn;
      var v = 0.0;
      var a = 0.52;
      let rot = mat2x2<f32>(0.80, 0.60, -0.60, 0.80);
      for (var i = 0; i < 4; i++) {
        let n = 1.0 - abs(noise2(p) * 2.0 - 1.0);
        v += a * n * n;
        p = rot * p * 2.06;
        a *= 0.48;
      }
      return v;
    }

    fn silkyFbm(p: vec2<f32>, t: f32) -> f32 {
      let q = vec2<f32>(
        fbm(p + vec2<f32>(0.0, 0.0) + t * 0.22),
        fbm(p + vec2<f32>(5.2, 1.3) - t * 0.18)
      );
      return fbm(p + 1.35 * q);
    }

    fn radialFlowFbm(normP: vec2<f32>, r: f32, speed: f32, scale: f32, t: f32) -> f32 {
      let dir = normP / max(r, 0.08);
      let ph0 = fract(t * speed);
      let ph1 = fract(t * speed + 0.5);
      let uv0 = (normP - dir * (ph0 * 0.85)) * scale;
      let uv1 = (normP - dir * (ph1 * 0.85)) * scale + vec2<f32>(7.3, 3.1);
      let w = abs(ph0 * 2.0 - 1.0);
      return mix(fbm(uv0), fbm(uv1), w);
    }

    fn radialFlowRidged(normP: vec2<f32>, r: f32, speed: f32, scale: f32, t: f32) -> f32 {
      let dir = normP / max(r, 0.08);
      let ph0 = fract(t * speed);
      let ph1 = fract(t * speed + 0.5);
      let tang = vec2<f32>(-dir.y, dir.x) * (fbm(normP * 1.8 + t * 0.4) - 0.5) * 0.42;
      let uv0 = (normP - dir * (ph0 * 0.90) + tang * ph0) * scale;
      let uv1 = (normP - dir * (ph1 * 0.90) + tang * ph1) * scale + vec2<f32>(11.7, 5.9);
      let w = abs(ph0 * 2.0 - 1.0);
      return mix(ridgedFbm(uv0), ridgedFbm(uv1), w);
    }
  `;

  const FLUID_COMPUTE_WGSL = /* wgsl */ `
    ${WGSL_COMMON}

    struct SimParams {
      simW: u32,
      simH: u32,
      dyeW: u32,
      dyeH: u32,
      dt: f32,
      aspect: f32,
      curlStrength: f32,
      velDissipation: f32,
      dyeDissipation: f32,
      splatCount: u32,
      time: f32,
      particleCount: u32,
    };

    struct Splat {
      posRad: vec4<f32>,    // (x, y, radius2, phase)
      velTwist: vec4<f32>,  // (vx, vy, twist, dyeScale)
      dyeColor: vec4<f32>,  // (r, g, b, pad)
    };

    @group(0) @binding(0) var<uniform> params: SimParams;
    @group(0) @binding(1) var<storage, read> srcA: array<vec4<f32>>;
    @group(0) @binding(2) var<storage, read> srcB: array<vec4<f32>>;
    @group(0) @binding(3) var<storage, read_write> dst: array<vec4<f32>>;
    @group(0) @binding(4) var<storage, read> splats: array<Splat>;

    fn idxSim(x: i32, y: i32) -> u32 {
      let cx = clamp(x, 0, i32(params.simW) - 1);
      let cy = clamp(y, 0, i32(params.simH) - 1);
      return u32(cy) * params.simW + u32(cx);
    }

    fn idxDye(x: i32, y: i32) -> u32 {
      let cx = clamp(x, 0, i32(params.dyeW) - 1);
      let cy = clamp(y, 0, i32(params.dyeH) - 1);
      return u32(cy) * params.dyeW + u32(cx);
    }

    fn bilerpSim(buf: ptr<storage, array<vec4<f32>>, read>, uv: vec2<f32>) -> vec4<f32> {
      let size = vec2<f32>(f32(params.simW), f32(params.simH));
      let st = uv * size - 0.5;
      let i = vec2<i32>(floor(st));
      let f = fract(st);
      let a = (*buf)[idxSim(i.x, i.y)];
      let b = (*buf)[idxSim(i.x + 1, i.y)];
      let c = (*buf)[idxSim(i.x, i.y + 1)];
      let d = (*buf)[idxSim(i.x + 1, i.y + 1)];
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    fn bilerpDye(buf: ptr<storage, array<vec4<f32>>, read>, uv: vec2<f32>) -> vec4<f32> {
      let size = vec2<f32>(f32(params.dyeW), f32(params.dyeH));
      let st = uv * size - 0.5;
      let i = vec2<i32>(floor(st));
      let f = fract(st);
      let a = (*buf)[idxDye(i.x, i.y)];
      let b = (*buf)[idxDye(i.x + 1, i.y)];
      let c = (*buf)[idxDye(i.x, i.y + 1)];
      let d = (*buf)[idxDye(i.x + 1, i.y + 1)];
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    @compute @workgroup_size(8, 8)
    fn splatVelocity(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let uv = (vec2<f32>(gid.xy) + 0.5) / vec2<f32>(f32(params.simW), f32(params.simH));
      let id = gid.y * params.simW + gid.x;
      var vel = srcA[id].xy;
      let count = min(params.splatCount, ${MAX_SPLATS}u);
      for (var i = 0u; i < count; i++) {
        let sp = splats[i];
        var p = uv - sp.posRad.xy;
        p.x *= params.aspect;
        let d2 = dot(p, p);
        if (d2 > sp.posRad.z * 9.0) { continue; }
        let k = exp(-d2 / max(sp.posRad.z, 0.00001));
        let ph = sp.posRad.w;
        let n1 = fbm(p * 11.0 + vec2<f32>(cos(ph), sin(ph)) * 2.0);
        let n2 = fbm(p * 20.0 - vec2<f32>(sin(ph * 1.3), cos(ph * 1.3)) * 1.8);
        let patchy = smoothstep(0.24, 0.78, n1 * 0.65 + n2 * 0.35);
        var val = sp.velTwist.xy * (0.45 + 0.85 * patchy);
        val += vec2<f32>(-p.y, p.x) / sqrt(max(sp.posRad.z, 0.00001)) * sp.velTwist.z * (0.4 + 0.8 * n1);
        vel += k * val;
      }
      dst[id] = vec4<f32>(vel, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn splatDye(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.dyeW || gid.y >= params.dyeH) { return; }
      let uv = (vec2<f32>(gid.xy) + 0.5) / vec2<f32>(f32(params.dyeW), f32(params.dyeH));
      let id = gid.y * params.dyeW + gid.x;
      var col = srcA[id].xyz;
      let count = min(params.splatCount, ${MAX_SPLATS}u);
      for (var i = 0u; i < count; i++) {
        let sp = splats[i];
        var p = uv - sp.posRad.xy;
        p.x *= params.aspect;
        let r2 = sp.posRad.z * 0.9;
        let d2 = dot(p, p);
        if (d2 > r2 * 9.0) { continue; }
        let k = exp(-d2 / max(r2, 0.00001));
        let ph = sp.posRad.w;
        let n1 = fbm(p * 11.0 + vec2<f32>(cos(ph), sin(ph)) * 2.0);
        let n2 = fbm(p * 20.0 - vec2<f32>(sin(ph * 1.3), cos(ph * 1.3)) * 1.8);
        let patchy = smoothstep(0.24, 0.78, n1 * 0.65 + n2 * 0.35);
        col += k * sp.dyeColor.xyz * (0.45 + 0.85 * patchy);
      }
      dst[id] = vec4<f32>(col, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn computeCurl(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let x = i32(gid.x);
      let y = i32(gid.y);
      let L = srcA[idxSim(x - 1, y)].y;
      let R = srcA[idxSim(x + 1, y)].y;
      let T = srcA[idxSim(x, y + 1)].x;
      let B = srcA[idxSim(x, y - 1)].x;
      dst[gid.y * params.simW + gid.x] = vec4<f32>(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn applyVorticity(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let x = i32(gid.x);
      let y = i32(gid.y);
      let id = gid.y * params.simW + gid.x;
      let L = srcB[idxSim(x - 1, y)].x;
      let R = srcB[idxSim(x + 1, y)].x;
      let T = srcB[idxSim(x, y + 1)].x;
      let B = srcB[idxSim(x, y - 1)].x;
      let C = srcB[id].x;
      var force = 0.5 * vec2<f32>(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= params.curlStrength * C;
      force.y *= -1.0;
      let vel = clamp(srcA[id].xy + force * params.dt, vec2<f32>(-380.0), vec2<f32>(380.0));
      dst[id] = vec4<f32>(vel, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn computeDivergence(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let x = i32(gid.x);
      let y = i32(gid.y);
      let id = gid.y * params.simW + gid.x;
      let C = srcA[id].xy;
      let L = select(srcA[idxSim(x - 1, y)].x, -C.x, x == 0);
      let R = select(srcA[idxSim(x + 1, y)].x, -C.x, x == i32(params.simW) - 1);
      let T = select(srcA[idxSim(x, y + 1)].y, -C.y, y == i32(params.simH) - 1);
      let B = select(srcA[idxSim(x, y - 1)].y, -C.y, y == 0);
      dst[id] = vec4<f32>(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn clearPressure(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let id = gid.y * params.simW + gid.x;
      dst[id] = srcA[id] * 0.78;
    }

    @compute @workgroup_size(8, 8)
    fn solvePressure(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let x = i32(gid.x);
      let y = i32(gid.y);
      let id = gid.y * params.simW + gid.x;
      let L = srcA[idxSim(x - 1, y)].x;
      let R = srcA[idxSim(x + 1, y)].x;
      let T = srcA[idxSim(x, y + 1)].x;
      let B = srcA[idxSim(x, y - 1)].x;
      let div = srcB[id].x;
      dst[id] = vec4<f32>((L + R + T + B - div) * 0.25, 0.0, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn projectVelocity(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let x = i32(gid.x);
      let y = i32(gid.y);
      let id = gid.y * params.simW + gid.x;
      let L = srcA[idxSim(x - 1, y)].x;
      let R = srcA[idxSim(x + 1, y)].x;
      let T = srcA[idxSim(x, y + 1)].x;
      let B = srcA[idxSim(x, y - 1)].x;
      let vel = srcB[id].xy - vec2<f32>(R - L, T - B);
      dst[id] = vec4<f32>(vel, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn advectVelocity(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.simW || gid.y >= params.simH) { return; }
      let size = vec2<f32>(f32(params.simW), f32(params.simH));
      let uv = (vec2<f32>(gid.xy) + 0.5) / size;
      let v = bilerpSim(&srcA, uv).xy;
      let coord = uv - params.dt * v / size;
      let center = bilerpSim(&srcA, coord);
      let stepUv = 1.25 / size;
      let blur = 0.25 * (
        bilerpSim(&srcA, coord + vec2<f32>(stepUv.x, 0.0)) +
        bilerpSim(&srcA, coord - vec2<f32>(stepUv.x, 0.0)) +
        bilerpSim(&srcA, coord + vec2<f32>(0.0, stepUv.y)) +
        bilerpSim(&srcA, coord - vec2<f32>(0.0, stepUv.y))
      );
      let mixed = mix(center, blur, 0.08);
      let res = mixed.xy / (1.0 + params.velDissipation * params.dt);
      dst[gid.y * params.simW + gid.x] = vec4<f32>(res, 0.0, 1.0);
    }

    @compute @workgroup_size(8, 8)
    fn advectDye(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= params.dyeW || gid.y >= params.dyeH) { return; }
      let velSize = vec2<f32>(f32(params.simW), f32(params.simH));
      let dyeSize = vec2<f32>(f32(params.dyeW), f32(params.dyeH));
      let uv = (vec2<f32>(gid.xy) + 0.5) / dyeSize;
      let v = bilerpSim(&srcA, uv).xy;
      let coord = uv - params.dt * v / velSize;
      let center = bilerpDye(&srcB, coord);
      let stepUv = 1.25 / dyeSize;
      let blur = 0.25 * (
        bilerpDye(&srcB, coord + vec2<f32>(stepUv.x, 0.0)) +
        bilerpDye(&srcB, coord - vec2<f32>(stepUv.x, 0.0)) +
        bilerpDye(&srcB, coord + vec2<f32>(0.0, stepUv.y)) +
        bilerpDye(&srcB, coord - vec2<f32>(0.0, stepUv.y))
      );
      let mixed = mix(center, blur, 0.28);
      let res = max(vec3<f32>(0.0), mixed.xyz) / (1.0 + params.dyeDissipation * params.dt);
      dst[gid.y * params.dyeW + gid.x] = vec4<f32>(res, 1.0);
    }
  `;

  const PARTICLE_COMPUTE_WGSL = /* wgsl */ `
    struct Particle {
      posLife: vec4<f32>,   // (x, y, age, maxLife)
      velColor: vec4<f32>,  // (vx, vy, orbIndex, size)
    };

    struct ParticleParams {
      simW: u32,
      simH: u32,
      orbCount: u32,
      count: u32,
      dt: f32,
      time: f32,
      aspect: f32,
      intensity: f32,
      orbCenters: array<vec4<f32>, 5>,
    };

    @group(0) @binding(0) var<uniform> pParams: ParticleParams;
    @group(0) @binding(1) var<storage, read> velocity: array<vec4<f32>>;
    @group(0) @binding(2) var<storage, read_write> particles: array<Particle>;

    fn hash11(p: f32) -> f32 {
      var x = fract(p * 0.1031);
      x *= x + 33.33;
      x *= x + x;
      return fract(x);
    }

    fn sampleVel(uv: vec2<f32>) -> vec2<f32> {
      let cx = clamp(i32(uv.x * f32(pParams.simW)), 0, i32(pParams.simW) - 1);
      let cy = clamp(i32(uv.y * f32(pParams.simH)), 0, i32(pParams.simH) - 1);
      return velocity[u32(cy) * pParams.simW + u32(cx)].xy;
    }

    @compute @workgroup_size(64)
    fn updateParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
      let id = gid.x;
      if (id >= pParams.count) { return; }
      var p = particles[id];
      p.posLife.z += pParams.dt;

      let outOfBounds = p.posLife.x < -0.05 || p.posLife.x > 1.05 || p.posLife.y < -0.05 || p.posLife.y > 1.05;
      if (p.posLife.z >= p.posLife.w || p.posLife.w <= 0.0 || outOfBounds) {
        let seed = f32(id) * 1.37 + pParams.time * 13.7;
        let orbIdx = id % max(1u, pParams.orbCount);
        let orb = pParams.orbCenters[orbIdx];
        let ang = hash11(seed) * 6.2831853;
        let rad = orb.z * (0.68 + 0.22 * hash11(seed + 7.1));
        p.posLife.x = orb.x + (cos(ang) * rad) / max(pParams.aspect, 0.1);
        p.posLife.y = orb.y + sin(ang) * rad;
        p.posLife.z = 0.0;
        p.posLife.w = 0.75 + hash11(seed + 19.3) * 1.45;
        let spd = (0.04 + 0.08 * hash11(seed + 31.7)) * pParams.intensity;
        p.velColor = vec4<f32>(
          (cos(ang) / max(pParams.aspect, 0.1)) * spd,
          sin(ang) * spd,
          f32(orbIdx),
          1.2 + hash11(seed + 43.1) * 2.1
        );
      } else {
        let vField = sampleVel(p.posLife.xy) / vec2<f32>(f32(pParams.simW), f32(pParams.simH));
        let vel = mix(p.velColor.xy, vField * 1.15, min(1.0, pParams.dt * 5.0));
        p.posLife.x += vel.x * pParams.dt;
        p.posLife.y += vel.y * pParams.dt;
        p.velColor.x = vel.x;
        p.velColor.y = vel.y;
      }
      particles[id] = p;
    }
  `;

  const DISPLAY_WGSL = /* wgsl */ `
    ${WGSL_COMMON}

    struct DisplayParams {
      resolution: vec2<f32>,
      dyeSize: vec2<f32>,
      time: f32,
      glow: f32,
      orbCount: u32,
      pad: u32,
      orbCenters: array<vec4<f32>, 5>, // (x, y, r, type)
      coreColors: array<vec4<f32>, 5>,
      midColors: array<vec4<f32>, 5>,
      smokeColors: array<vec4<f32>, 5>,
    };

    @group(0) @binding(0) var<uniform> u: DisplayParams;
    @group(0) @binding(1) var<storage, read> dyeBuf: array<vec4<f32>>;

    struct VsOut {
      @builtin(position) pos: vec4<f32>,
      @location(0) uv: vec2<f32>,
    };

    @vertex
    fn vsMain(@builtin(vertex_index) vid: u32) -> VsOut {
      var pts = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0,  1.0)
      );
      let p = pts[vid];
      var o: VsOut;
      o.pos = vec4<f32>(p, 0.0, 1.0);
      o.uv = p * 0.5 + 0.5;
      return o;
    }

    fn sampleDye(uv: vec2<f32>) -> vec3<f32> {
      let st = uv * u.dyeSize - 0.5;
      let i = vec2<i32>(floor(st));
      let f = fract(st);
      let w = i32(u.dyeSize.x);
      let h = i32(u.dyeSize.y);
      let x0 = clamp(i.x, 0, w - 1);
      let x1 = clamp(i.x + 1, 0, w - 1);
      let y0 = clamp(i.y, 0, h - 1);
      let y1 = clamp(i.y + 1, 0, h - 1);
      let a = dyeBuf[u32(y0 * w + x0)].xyz;
      let b = dyeBuf[u32(y0 * w + x1)].xyz;
      let c = dyeBuf[u32(y1 * w + x0)].xyz;
      let d = dyeBuf[u32(y1 * w + x1)].xyz;
      return max(vec3<f32>(0.0), mix(mix(a, b, f.x), mix(c, d, f.x), f.y));
    }

    fn crescentRibbon(r: f32, a: f32, targetR: f32, width: f32, phase: f32, streakLen: f32) -> f32 {
      let deltaA = atan2(sin(a - phase), cos(a - phase));
      let rSpiral = targetR + deltaA * 0.12;
      let radialProfile = exp(-pow((r - rSpiral) / width, 2.0));
      let angularProfile = exp(-pow(deltaA / streakLen, 2.0)) * smoothstep(-streakLen * 1.6, streakLen * 0.4, deltaA);
      return radialProfile * angularProfile;
    }

    fn evalType0(normP: vec2<f32>, r: f32, a: f32, cCore: vec3<f32>, cMid: vec3<f32>, cSmoke: vec3<f32>) -> vec3<f32> {
      let t = u.time;
      let warp1 = silkyFbm(normP * 1.20, t * 0.65) - 0.5;
      let warp2 = fbm(normP * 2.1 - vec2<f32>(cos(t * 0.5), sin(t * 0.5))) - 0.5;
      let aWarped = a + warp1 * 0.55 + warp2 * 0.25;
      var ribbons = 0.0;
      ribbons += 1.05 * crescentRibbon(r, aWarped, 0.62, 0.13, t * 1.55 + 0.0, 1.35);
      ribbons += 0.95 * crescentRibbon(r, aWarped, 0.72, 0.14, t * 1.25 + 2.1, 1.45);
      ribbons += 0.90 * crescentRibbon(r, aWarped, 0.82, 0.15, t * 1.70 + 4.2, 1.25);
      ribbons += 0.80 * crescentRibbon(r, aWarped, 0.94, 0.17, t * 1.10 + 1.1, 1.50);
      ribbons += 0.65 * crescentRibbon(r, aWarped, 1.08, 0.19, t * 1.40 + 3.5, 1.30);
      ribbons += 0.48 * crescentRibbon(r, aWarped, 1.24, 0.22, t * 0.95 + 5.1, 1.15);

      let swirlA = -t * 0.75 + log(r + 0.35) * 1.85;
      let rotSwirl = mat2x2<f32>(cos(swirlA), -sin(swirlA), sin(swirlA), cos(swirlA));
      let flameField = silkyFbm(rotSwirl * normP * 1.45, t * 0.45);
      let flameTongues = smoothstep(0.28, 0.78, flameField) * smoothstep(0.25, 0.78, r) * exp(-pow(max(0.0, r - 0.72) / 0.52, 2.0));
      let outerMist = smoothstep(0.32, 0.82, flameField + warp1 * 0.35) * smoothstep(0.55, 1.05, r) * exp(-pow(max(0.0, r - 0.85) / 0.70, 2.0));
      let pulse = 1.0 + 0.04 * sin(t * 2.9);
      let rCore = (r / pulse) + warp1 * 0.05;
      let coreHot = exp(-(rCore * rCore) / 0.22);
      let sphereBody = exp(-(rCore * rCore) / 0.54);
      let softRim = exp(-pow((rCore - 0.72) / 0.16, 2.0)) * (0.65 + 0.55 * flameField);
      let ambientGlow = exp(-(r * r) * 0.65) * 0.36;

      var col = vec3<f32>(0.0);
      col += cSmoke * (ambientGlow + outerMist * 1.45 + flameTongues * 0.45);
      col += cMid * (sphereBody * 0.75 + softRim * 0.85 + flameTongues * 1.35 + ribbons * 1.18);
      let hotCrossings = pow(max(0.0, ribbons * 0.75 + flameTongues * 0.45), 2.1);
      col += cCore * (coreHot * 1.45 + softRim * 0.35 + hotCrossings * 0.95);
      return col;
    }

    fn evalType1(normP: vec2<f32>, r: f32, a: f32, cCore: vec3<f32>, cMid: vec3<f32>, cSmoke: vec3<f32>) -> vec3<f32> {
      let t = u.time;
      let fire1 = radialFlowRidged(normP, r, 0.62, 1.85, t);
      let fire2 = radialFlowRidged(mat2x2<f32>(0.8, 0.6, -0.6, 0.8) * normP, r, 0.48, 2.35, t + 4.7);
      let fireBillow = fire1 * 0.62 + fire2 * 0.48;
      let smokeFlow = radialFlowFbm(normP, r, 0.42, 1.55, t + 2.1);
      let surfaceBoil = ridgedFbm(normP * 2.4 + vec2<f32>(cos(t * 0.6), sin(t * 0.6)) * 0.8);
      let rPerturbed = r - (fireBillow - 0.45) * 0.14 + (smokeFlow - 0.5) * 0.08;
      let eruptingRim = exp(-pow((rPerturbed - 0.73) / 0.11, 2.0)) * (0.75 + 0.90 * fireBillow);
      let lobeMask = smoothstep(0.28, 0.78, smokeFlow);
      let flameReach = 0.46 + 0.38 * lobeMask;
      let flameEnv = smoothstep(0.42, 0.72, r) * exp(-pow(max(0.0, r - 0.70) / flameReach, 1.85));
      let tongues = pow(max(0.0, fireBillow), 1.65) * (0.45 + 0.85 * lobeMask) * flameEnv;
      let heatSmoke = smoothstep(0.32, 0.82, smokeFlow * 0.7 + fire1 * 0.4) * lobeMask * smoothstep(0.62, 1.05, r) * exp(-pow(max(0.0, r - 0.88) / 0.68, 2.0));
      let insideMask = 1.0 - smoothstep(0.68, 0.80, rPerturbed);
      let boilingInterior = insideMask * (0.50 + 0.70 * surfaceBoil);
      let hotCore = exp(-(r * r) / 0.22) * (0.95 + 0.25 * surfaceBoil);

      var col = vec3<f32>(0.0);
      col += cSmoke * (heatSmoke * 1.65 + exp(-(r * r) * 0.62) * 0.38 + tongues * 0.50);
      col += cMid * (boilingInterior * 0.85 + eruptingRim * 1.35 + tongues * 1.95);
      col += cCore * (hotCore * 1.25 + eruptingRim * 0.65 + pow(max(0.0, tongues), 2.0) * 1.45);
      return col;
    }

    fn evalType2(normP: vec2<f32>, r: f32, a: f32, cCore: vec3<f32>, cMid: vec3<f32>, cSmoke: vec3<f32>) -> vec3<f32> {
      let t = u.time;
      let w1 = silkyFbm(normP * 1.35 + vec2<f32>(cos(t * 0.35), sin(t * 0.35)), t * 0.45);
      let w2 = silkyFbm(normP * 1.35 - vec2<f32>(cos(t * 0.35), sin(t * 0.35)), -t * 0.45);
      let ether = (w1 + w2) * 0.5;
      let wavePhase = r * 7.2 - t * 1.85 + (ether - 0.5) * 2.2;
      let pulseRings = pow(0.5 + 0.5 * sin(wavePhase), 3.6) * smoothstep(0.30, 0.68, r) * exp(-pow(max(0.0, r - 0.68) / 0.48, 2.0));
      let mistFlow = radialFlowFbm(normP, r, 0.38, 1.45, t);
      let nebulaCloud = smoothstep(0.30, 0.80, mistFlow * 0.65 + ether * 0.45) * smoothstep(0.45, 0.82, r) * exp(-pow(max(0.0, r - 0.76) / 0.60, 2.0));
      let rBreath = 0.72 + 0.035 * sin(t * 2.4) + (ether - 0.5) * 0.06;
      let primaryRim = exp(-pow((r - rBreath) / 0.065, 2.0));
      let secondaryRim = 0.55 * exp(-pow((r - rBreath * 1.18) / 0.085, 2.0));
      let doubleRim = primaryRim + secondaryRim;
      let innerFill = smoothstep(0.0, 0.70, r) * (1.0 - smoothstep(0.70, 0.78, r)) * 0.55;
      let coreOrb = exp(-(r * r) / 0.18) * (0.9 + 0.12 * sin(t * 3.5));
      let deepMist = exp(-(r * r) * 0.72) * (0.35 + 0.55 * ether);

      var col = vec3<f32>(0.0);
      col += cSmoke * (deepMist * 1.20 + nebulaCloud * 1.45);
      col += cMid * (innerFill + doubleRim * 1.15 + pulseRings * 1.35 + nebulaCloud * 1.15);
      col += cCore * (coreOrb * 1.35 + primaryRim * 0.75 + pow(pulseRings, 1.8) * 1.05);
      return col;
    }

    fn chaoticLightningLayer(normP: vec2<f32>, seedTime: f32, scale: f32) -> f32 {
      let p = normP * scale;
      let warp = vec2<f32>(
        fbm(p * 1.4 + vec2<f32>(seedTime * 1.9, -seedTime * 1.3)) - 0.5,
        fbm(p * 1.4 + vec2<f32>(-seedTime * 1.5, seedTime * 2.1) + 4.7) - 0.5
      );
      let q = p + warp * 1.65;
      let nMain = noise2(q * 1.8 + vec2<f32>(seedTime * 0.7, -seedTime * 0.5)) - 0.5;
      let nBranch = noise2(q * 3.7 - vec2<f32>(seedTime * 1.1, seedTime * 0.9)) - 0.5;
      let mainBolt = exp(-abs(nMain + nBranch * 0.35) * 32.0);
      let subBranch = exp(-abs(nMain * 0.6 - nBranch) * 45.0) * exp(-abs(nMain) * 6.0);
      let sectorGate = smoothstep(0.38, 0.72, noise2(normP * 1.15 + vec2<f32>(floor(seedTime * 3.5) * 1.7, seedTime * 0.8)));
      return (mainBolt + subBranch * 0.65) * (0.25 + 0.95 * sectorGate);
    }

    fn evalType3(normP: vec2<f32>, r: f32, a: f32, cCore: vec3<f32>, cMid: vec3<f32>, cSmoke: vec3<f32>) -> vec3<f32> {
      let t = u.time;
      let fineWarp = fbm(normP * 2.6 + vec2<f32>(t * 0.9, -t * 0.7)) - 0.5;
      let rCrystal = r + fineWarp * 0.045;
      let insideSphere = 1.0 - smoothstep(0.73, 0.79, rCrystal);
      let zNorm = sqrt(max(0.0, 1.0 - min(1.0, (rCrystal / 0.76) * (rCrystal / 0.76))));
      let fresnelShell = pow(1.0 - zNorm, 2.4) * insideSphere;
      let electricRim = exp(-pow((rCrystal - 0.75) / 0.045, 2.0)) * (0.8 + 0.5 * abs(fineWarp) * 4.0);
      let bolt1 = chaoticLightningLayer(normP, t * 1.35 + 1.0, 1.65);
      let bolt2 = chaoticLightningLayer(mat2x2<f32>(0.6, 0.8, -0.8, 0.6) * normP, t * 1.85 + 13.7, 2.15);
      let bolt3 = chaoticLightningLayer(mat2x2<f32>(-0.5, -0.86, 0.86, -0.5) * normP, t * 2.40 + 29.3, 1.35);
      let innerArcsMask = smoothstep(0.10, 0.75, r) * insideSphere;
      let outerArcsMask = smoothstep(0.45, 0.76, r) * exp(-pow(max(0.0, r - 0.74) / 0.62, 1.75));
      let lightning = (bolt1 * 0.95 + bolt2 * 0.80 + bolt3 * 0.75) * (innerArcsMask * 0.65 + outerArcsMask * 1.35);
      let ionCloud = smoothstep(0.32, 0.82, radialFlowFbm(normP, r, 0.50, 1.5, t)) * outerArcsMask * 0.85;
      let starCore = exp(-(r * r) / 0.13) * (0.95 + 0.15 * sin(t * 14.0));

      var col = vec3<f32>(0.0);
      col += cSmoke * (ionCloud * 1.35 + exp(-(r * r) * 0.65) * 0.35);
      col += cMid * (fresnelShell * 1.15 + electricRim * 1.10 + lightning * 1.65 + ionCloud * 0.55);
      col += cCore * (starCore * 1.50 + electricRim * 0.85 + pow(max(0.0, lightning), 1.55) * 1.65);
      return col;
    }

    fn evalType4(normP: vec2<f32>, r: f32, a: f32, cCore: vec3<f32>, cMid: vec3<f32>, cSmoke: vec3<f32>) -> vec3<f32> {
      let t = u.time;
      let zSphere = sqrt(max(0.0, 1.0 - min(1.0, (r / 0.76) * (r / 0.76))));
      let sphereUv = normP / (0.62 + 0.38 * zSphere);
      let gran1 = ridgedFbm(sphereUv * 3.4 + vec2<f32>(t * 0.32, -t * 0.25));
      let gran2 = fbm(sphereUv * 6.0 - vec2<f32>(t * 0.48, t * 0.38));
      let solarGranules = gran1 * 0.68 + gran2 * 0.32;
      let sunDisc = 1.0 - smoothstep(0.73, 0.78, r + (gran2 - 0.5) * 0.035);
      let chromosphereRim = exp(-pow((r - 0.75) / 0.055, 2.0)) * (0.95 + 0.65 * gran1);
      let magWarp = silkyFbm(normP * 1.6, t * 0.55) - 0.5;
      let loopedP = normP + vec2<f32>(-normP.y, normP.x) * magWarp * 0.55;
      let prom1 = radialFlowRidged(loopedP, r, 0.55, 1.75, t);
      let prom2 = radialFlowFbm(mat2x2<f32>(0.7, -0.7, 0.7, 0.7) * loopedP, r, 0.42, 1.45, t + 6.2);
      let activeZones = smoothstep(0.26, 0.78, prom2);
      let flareReach = 0.48 + 0.40 * activeZones;
      let coronaEnv = smoothstep(0.58, 0.76, r) * exp(-pow(max(0.0, r - 0.74) / flareReach, 1.75));
      let solarFlares = pow(max(0.0, prom1), 1.60) * (0.45 + 0.90 * activeZones) * coronaEnv;
      let outerCorona = smoothstep(0.30, 0.82, prom2 * 0.7 + prom1 * 0.4) * smoothstep(0.65, 1.05, r) * exp(-pow(max(0.0, r - 0.85) / 0.72, 2.0));

      var col = vec3<f32>(0.0);
      col += cSmoke * (outerCorona * 1.55 + solarFlares * 0.60 + exp(-(r * r) * 0.55) * 0.42);
      col += cMid * (sunDisc * (0.75 + 0.85 * solarGranules) + chromosphereRim * 1.25 + solarFlares * 1.95);
      let hotRegions = sunDisc * pow(solarGranules, 2.1) * (0.65 + 0.55 * zSphere);
      col += cCore * (hotRegions * 1.55 + chromosphereRim * 0.75 + pow(max(0.0, solarFlares), 1.9) * 1.45);
      return col;
    }

    @fragment
    fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      var centered = (in.uv - 0.5) * 2.0;
      centered.x *= aspect;

      var color = vec3<f32>(0.003, 0.004, 0.008) * smoothstep(2.4, 0.0, length(centered));

      let fluidDye = sampleDye(in.uv);
      let cloudBreakup = smoothstep(0.16, 0.82, fbm(centered * 2.6 + vec2<f32>(u.time * 0.15, -u.time * 0.12)));
      let smokePlume = fluidDye * (0.55 + 0.75 * cloudBreakup) + pow(fluidDye, vec3<f32>(1.55)) * 0.80;
      color += smokePlume;

      for (var i = 0u; i < 5u; i++) {
        if (i >= u.orbCount) { break; }
        let oc = u.orbCenters[i];
        var p = in.uv - oc.xy;
        p.x *= aspect;
        let normP = p / oc.z;
        let r = length(normP);
        let a = atan2(normP.y, normP.x);
        let radialFade = 1.0 - smoothstep(2.0, 3.2, r);
        if (radialFade <= 0.0001) { continue; }

        let orbType = i32(oc.w + 0.5);
        let cCore = u.coreColors[i].xyz;
        let cMid = u.midColors[i].xyz;
        let cSmoke = u.smokeColors[i].xyz;

        var orbCol = vec3<f32>(0.0);
        if (orbType == 0) {
          orbCol = evalType0(normP, r, a, cCore, cMid, cSmoke);
        } else if (orbType == 1) {
          orbCol = evalType1(normP, r, a, cCore, cMid, cSmoke);
        } else if (orbType == 2) {
          orbCol = evalType2(normP, r, a, cCore, cMid, cSmoke);
        } else if (orbType == 3) {
          orbCol = evalType3(normP, r, a, cCore, cMid, cSmoke);
        } else {
          orbCol = evalType4(normP, r, a, cCore, cMid, cSmoke);
        }
        color += orbCol * radialFade;
      }

      color *= u.glow;
      let mapped = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
      return vec4<f32>(mapped, 1.0);
    }
  `;

  const PARTICLE_RENDER_WGSL = /* wgsl */ `
    struct Particle {
      posLife: vec4<f32>,
      velColor: vec4<f32>,
    };

    struct DisplayParams {
      resolution: vec2<f32>,
      dyeSize: vec2<f32>,
      time: f32,
      glow: f32,
      orbCount: u32,
      pad: u32,
      orbCenters: array<vec4<f32>, 5>,
      coreColors: array<vec4<f32>, 5>,
      midColors: array<vec4<f32>, 5>,
      smokeColors: array<vec4<f32>, 5>,
    };

    @group(0) @binding(0) var<uniform> u: DisplayParams;
    @group(0) @binding(1) var<storage, read> particles: array<Particle>;

    struct VsOut {
      @builtin(position) pos: vec4<f32>,
      @location(0) local: vec2<f32>,
      @location(1) color: vec3<f32>,
      @location(2) alpha: f32,
    };

    @vertex
    fn vsMain(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VsOut {
      var quad = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>(1.0, -1.0), vec2<f32>( 1.0, 1.0)
      );
      let p = particles[iid];
      let lifeFrac = clamp(p.posLife.z / max(p.posLife.w, 0.001), 0.0, 1.0);
      let env = sin(lifeFrac * 3.14159265);
      let pxSize = p.velColor.w * (0.65 + 0.55 * env);
      let offsetNdc = (quad[vid] * pxSize) / max(u.resolution, vec2<f32>(1.0)) * 2.0;
      let ndc = p.posLife.xy * 2.0 - 1.0;

      let orbIdx = min(max(1u, u.orbCount) - 1u, u32(max(0.0, p.velColor.z)));
      let col = mix(u.coreColors[orbIdx].xyz, u.midColors[orbIdx].xyz, lifeFrac) * 0.42 * u.glow;

      var o: VsOut;
      o.pos = vec4<f32>(ndc + offsetNdc, 0.0, 1.0);
      o.local = quad[vid];
      o.color = col;
      o.alpha = env * 0.55;
      return o;
    }

    @fragment
    fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
      let d2 = dot(in.local, in.local);
      if (d2 > 1.0) { discard; }
      let soft = exp(-d2 * 3.4);
      return vec4<f32>(in.color * soft * in.alpha, 1.0);
    }
  `;

  function isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  async function create(canvas, onLost = null) {
    if (!isSupported()) throw new Error('WebGPU indisponível neste navegador/contexto');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Adaptador WebGPU não encontrado');
    const device = await adapter.requestDevice();
    let disposed = false;
    device.lost.then(info => {
      if (!disposed && info.reason !== 'destroyed' && typeof onLost === 'function') {
        onLost(info);
      }
    });
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('Falha ao obter contexto WebGPU');

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    const fluidModule = device.createShaderModule({ code: FLUID_COMPUTE_WGSL });
    const particleComputeModule = device.createShaderModule({ code: PARTICLE_COMPUTE_WGSL });
    const displayModule = device.createShaderModule({ code: DISPLAY_WGSL });
    const particleRenderModule = device.createShaderModule({ code: PARTICLE_RENDER_WGSL });

    const fluidBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });
    const fluidLayout = device.createPipelineLayout({ bindGroupLayouts: [fluidBgl] });

    const makeCompute = entryPoint => device.createComputePipeline({
      layout: fluidLayout,
      compute: { module: fluidModule, entryPoint },
    });

    const pipelines = {
      splatVelocity: makeCompute('splatVelocity'),
      splatDye: makeCompute('splatDye'),
      curl: makeCompute('computeCurl'),
      vorticity: makeCompute('applyVorticity'),
      divergence: makeCompute('computeDivergence'),
      clearPressure: makeCompute('clearPressure'),
      pressure: makeCompute('solvePressure'),
      project: makeCompute('projectVelocity'),
      advectVelocity: makeCompute('advectVelocity'),
      advectDye: makeCompute('advectDye'),
    };

    const particleComputeBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const particleComputePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [particleComputeBgl] }),
      compute: { module: particleComputeModule, entryPoint: 'updateParticles' },
    });

    const displayBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    });
    const displayPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [displayBgl] }),
      vertex: { module: displayModule, entryPoint: 'vsMain' },
      fragment: { module: displayModule, entryPoint: 'fsMain', targets: [{ format }] },
      primitive: { topology: 'triangle-strip' },
    });

    const particleRenderBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const particleRenderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [particleRenderBgl] }),
      vertex: { module: particleRenderModule, entryPoint: 'vsMain' },
      fragment: {
        module: particleRenderModule,
        entryPoint: 'fsMain',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const simUniformBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const splatBuf = device.createBuffer({ size: MAX_SPLATS * 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const displayUniformBuf = device.createBuffer({ size: 352, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const particleUniformBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const particleBuf = device.createBuffer({ size: PARTICLE_COUNT * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const initParticles = new Float32Array(PARTICLE_COUNT * 8);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      initParticles[i * 8 + 2] = Math.random() * 2.0;
      initParticles[i * 8 + 3] = 0.01; // força respawn espalhado no primeiro frame
    }
    device.queue.writeBuffer(particleBuf, 0, initParticles);

    const simUniformData = new ArrayBuffer(64);
    const simU32 = new Uint32Array(simUniformData);
    const simF32 = new Float32Array(simUniformData);
    const splatData = new Float32Array(MAX_SPLATS * 12);
    const displayData = new ArrayBuffer(352);
    const displayF32 = new Float32Array(displayData);
    const displayU32 = new Uint32Array(displayData);
    const particleUniformData = new ArrayBuffer(128);
    const particleU32 = new Uint32Array(particleUniformData);
    const particleF32 = new Float32Array(particleUniformData);

    let simW = 240, simH = 135, dyeW = 600, dyeH = 338;
    let buffers = [];
    let velA, velB, dyeA, dyeB, presA, presB, curlBuf, divBuf;
    let velOrigA = null, dyeOrigA = null;
    let bgCache = new Map();
    let particleRenderBg = device.createBindGroup({
      layout: particleRenderBgl,
      entries: [
        { binding: 0, resource: { buffer: displayUniformBuf } },
        { binding: 1, resource: { buffer: particleBuf } },
      ],
    });
    let particleComputeBgA = null;
    let particleComputeBgB = null;
    let displayBgA = null;
    let displayBgB = null;
    let lastPassesPerFrame = 22;

    function allocStorage(countVec4) {
      const b = device.createBuffer({
        size: countVec4 * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      buffers.push(b);
      return b;
    }

    function clearBuffers() {
      const enc = device.createCommandEncoder();
      for (const b of buffers) enc.clearBuffer(b);
      enc.clearBuffer(particleBuf);
      device.queue.submit([enc.finish()]);
      device.queue.writeBuffer(particleBuf, 0, initParticles);
    }

    function getFluidBg(a, b, dst) {
      let m1 = bgCache.get(a);
      if (!m1) { m1 = new Map(); bgCache.set(a, m1); }
      let m2 = m1.get(b);
      if (!m2) { m2 = new Map(); m1.set(b, m2); }
      let bg = m2.get(dst);
      if (!bg) {
        bg = device.createBindGroup({
          layout: fluidBgl,
          entries: [
            { binding: 0, resource: { buffer: simUniformBuf } },
            { binding: 1, resource: { buffer: a } },
            { binding: 2, resource: { buffer: b } },
            { binding: 3, resource: { buffer: dst } },
            { binding: 4, resource: { buffer: splatBuf } },
          ],
        });
        m2.set(dst, bg);
      }
      return bg;
    }

    function resize(width, height, simShortSide = 240) {
      for (const b of buffers) b.destroy();
      buffers = [];
      bgCache = new Map();

      const calcSize = shortSide => {
        const maxSide = Math.max(1280, shortSide * 2.4);
        const scale = Math.min(shortSide / Math.min(width, height), maxSide / Math.max(width, height));
        return [Math.max(32, Math.round(width * scale)), Math.max(32, Math.round(height * scale))];
      };
      const [sw, sh] = calcSize(simShortSide);
      const [dw, dh] = calcSize(Math.round(simShortSide * 2.5));
      simW = sw; simH = sh; dyeW = dw; dyeH = dh;

      velA = allocStorage(simW * simH);
      velB = allocStorage(simW * simH);
      velOrigA = velA;
      presA = allocStorage(simW * simH);
      presB = allocStorage(simW * simH);
      curlBuf = allocStorage(simW * simH);
      divBuf = allocStorage(simW * simH);
      dyeA = allocStorage(dyeW * dyeH);
      dyeB = allocStorage(dyeW * dyeH);
      dyeOrigA = dyeA;

      particleComputeBgA = device.createBindGroup({
        layout: particleComputeBgl,
        entries: [
          { binding: 0, resource: { buffer: particleUniformBuf } },
          { binding: 1, resource: { buffer: velA } },
          { binding: 2, resource: { buffer: particleBuf } },
        ],
      });
      particleComputeBgB = device.createBindGroup({
        layout: particleComputeBgl,
        entries: [
          { binding: 0, resource: { buffer: particleUniformBuf } },
          { binding: 1, resource: { buffer: velB } },
          { binding: 2, resource: { buffer: particleBuf } },
        ],
      });
      displayBgA = device.createBindGroup({
        layout: displayBgl,
        entries: [
          { binding: 0, resource: { buffer: displayUniformBuf } },
          { binding: 1, resource: { buffer: dyeA } },
        ],
      });
      displayBgB = device.createBindGroup({
        layout: displayBgl,
        entries: [
          { binding: 0, resource: { buffer: displayUniformBuf } },
          { binding: 1, resource: { buffer: dyeB } },
        ],
      });
      clearBuffers();
    }

    function step(time, dt, width, height, config, orbs, emitters) {
      const splatCount = Math.min(emitters.length, MAX_SPLATS);
      for (let i = 0; i < splatCount; i++) {
        const e = emitters[i];
        const base = i * 12;
        splatData[base + 0] = e.x;
        splatData[base + 1] = e.y;
        splatData[base + 2] = e.r2;
        splatData[base + 3] = e.phase;
        splatData[base + 4] = e.vx;
        splatData[base + 5] = e.vy;
        splatData[base + 6] = e.twist;
        splatData[base + 7] = 1.0;
        splatData[base + 8] = e.dye[0];
        splatData[base + 9] = e.dye[1];
        splatData[base + 10] = e.dye[2];
        splatData[base + 11] = 0.0;
      }
      if (splatCount > 0) {
        device.queue.writeBuffer(splatBuf, 0, splatData, 0, splatCount * 12);
      }

      const lifeFactor = Math.max(0.3, config.smokeLifetime / 100);
      simU32[0] = simW;
      simU32[1] = simH;
      simU32[2] = dyeW;
      simU32[3] = dyeH;
      simF32[4] = dt;
      simF32[5] = width / Math.max(height, 1);
      simF32[6] = 34.0 * (config.turbulence / 100);
      simF32[7] = 1.05;
      simF32[8] = 2.05 / lifeFactor;
      simU32[9] = splatCount;
      simF32[10] = time;
      simU32[11] = PARTICLE_COUNT;
      device.queue.writeBuffer(simUniformBuf, 0, simUniformData);

      const enc = device.createCommandEncoder();
      const simWgX = Math.ceil(simW / 8), simWgY = Math.ceil(simH / 8);
      const dyeWgX = Math.ceil(dyeW / 8), dyeWgY = Math.ceil(dyeH / 8);
      let passCount = 0;

      const runCompute = (pipe, a, b, dst, wx, wy) => {
        const pass = enc.beginComputePass();
        pass.setPipeline(pipe);
        pass.setBindGroup(0, getFluidBg(a, b, dst));
        pass.dispatchWorkgroups(wx, wy);
        pass.end();
        passCount++;
      };

      let velSwapped = false;
      let dyeSwapped = false;
      const swapVel = () => { [velA, velB] = [velB, velA]; velSwapped = !velSwapped; };
      const swapDye = () => { [dyeA, dyeB] = [dyeB, dyeA]; dyeSwapped = !dyeSwapped; };

      if (splatCount > 0) {
        runCompute(pipelines.splatVelocity, velA, velA, velB, simWgX, simWgY);
        swapVel();
        runCompute(pipelines.splatDye, dyeA, dyeA, dyeB, dyeWgX, dyeWgY);
        swapDye();
      }

      runCompute(pipelines.curl, velA, velA, curlBuf, simWgX, simWgY);
      runCompute(pipelines.vorticity, velA, curlBuf, velB, simWgX, simWgY);
      swapVel();

      runCompute(pipelines.divergence, velA, velA, divBuf, simWgX, simWgY);
      runCompute(pipelines.clearPressure, presA, presA, presB, simWgX, simWgY);
      [presA, presB] = [presB, presA];

      for (let i = 0; i < 12; i++) {
        runCompute(pipelines.pressure, presA, divBuf, presB, simWgX, simWgY);
        [presA, presB] = [presB, presA];
      }

      runCompute(pipelines.project, presA, velA, velB, simWgX, simWgY);
      swapVel();

      runCompute(pipelines.advectVelocity, velA, velA, velB, simWgX, simWgY);
      swapVel();

      runCompute(pipelines.advectDye, velA, dyeA, dyeB, dyeWgX, dyeWgY);
      swapDye();

      if (config.gpuParticles) {
        particleU32[0] = simW;
        particleU32[1] = simH;
        particleU32[2] = orbs.length;
        particleU32[3] = PARTICLE_COUNT;
        particleF32[4] = dt;
        particleF32[5] = time;
        particleF32[6] = width / Math.max(height, 1);
        particleF32[7] = config.swirlSpeed / 100;
        for (let i = 0; i < orbs.length; i++) {
          const o = orbs[i];
          particleF32[8 + i * 4 + 0] = o.x;
          particleF32[8 + i * 4 + 1] = o.y;
          particleF32[8 + i * 4 + 2] = o.r;
          particleF32[8 + i * 4 + 3] = o.arch.type;
        }
        device.queue.writeBuffer(particleUniformBuf, 0, particleUniformData);
        const pPass = enc.beginComputePass();
        pPass.setPipeline(particleComputePipeline);
        pPass.setBindGroup(0, velA === velOrigA ? particleComputeBgA : particleComputeBgB);
        pPass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 64));
        pPass.end();
        passCount++;
      }

      // Display uniform buffer
      displayF32[0] = canvas.width;
      displayF32[1] = canvas.height;
      displayF32[2] = dyeW;
      displayF32[3] = dyeH;
      displayF32[4] = time * (config.swirlSpeed / 100);
      displayF32[5] = config.glowStrength / 100;
      displayU32[6] = orbs.length;
      displayU32[7] = 0;
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        displayF32[8 + i * 4 + 0] = o.x;
        displayF32[8 + i * 4 + 1] = o.y;
        displayF32[8 + i * 4 + 2] = o.r;
        displayF32[8 + i * 4 + 3] = o.arch.type;

        displayF32[28 + i * 4 + 0] = o.arch.core[0];
        displayF32[28 + i * 4 + 1] = o.arch.core[1];
        displayF32[28 + i * 4 + 2] = o.arch.core[2];
        displayF32[28 + i * 4 + 3] = 0;

        displayF32[48 + i * 4 + 0] = o.arch.mid[0];
        displayF32[48 + i * 4 + 1] = o.arch.mid[1];
        displayF32[48 + i * 4 + 2] = o.arch.mid[2];
        displayF32[48 + i * 4 + 3] = 0;

        displayF32[68 + i * 4 + 0] = o.arch.smoke[0];
        displayF32[68 + i * 4 + 1] = o.arch.smoke[1];
        displayF32[68 + i * 4 + 2] = o.arch.smoke[2];
        displayF32[68 + i * 4 + 3] = 0;
      }
      device.queue.writeBuffer(displayUniformBuf, 0, displayData);

      const view = context.getCurrentTexture().createView();
      const rPass = enc.beginRenderPass({
        colorAttachments: [{
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      rPass.setPipeline(displayPipeline);
      rPass.setBindGroup(0, dyeA === dyeOrigA ? displayBgA : displayBgB);
      rPass.draw(4);

      if (config.gpuParticles) {
        rPass.setPipeline(particleRenderPipeline);
        rPass.setBindGroup(0, particleRenderBg);
        rPass.draw(6, PARTICLE_COUNT);
      }

      rPass.end();
      passCount++;
      lastPassesPerFrame = passCount;
      device.queue.submit([enc.finish()]);
    }

    function dispose() {
      disposed = true;
      bgCache = new Map();
      for (const b of buffers) b.destroy();
      buffers = [];
      simUniformBuf.destroy();
      splatBuf.destroy();
      displayUniformBuf.destroy();
      particleUniformBuf.destroy();
      particleBuf.destroy();
      try { context.unconfigure(); } catch {}
      device.destroy();
    }

    return {
      backend: 'webgpu',
      resize,
      clear: clearBuffers,
      step,
      dispose,
      getStats: () => ({
        backend: 'WebGPU Compute',
        simRes: `${simW}×${simH}`,
        dyeRes: `${dyeW}×${dyeH}`,
        passesPerFrame: lastPassesPerFrame,
        particles: PARTICLE_COUNT,
      }),
    };
  }

  window.OriWebGPUEngine = { isSupported, create };
})();
