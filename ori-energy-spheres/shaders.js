(() => {
  'use strict';

  const VERT = `#version 300 es
    layout(location=0) in vec2 aPos;
    out vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const PRELUDE = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    in vec2 vUv;
    out vec4 fragColor;
    uniform vec2 uTexel;
    uniform float uDt;

    vec4 bilerp(sampler2D tex, vec2 p, vec2 size) {
      vec2 st = p * size - 0.5;
      vec2 i = floor(st);
      vec2 f = fract(st);
      return mix(
        mix(texture(tex, (i + 0.5) / size), texture(tex, (i + vec2(1.5, 0.5)) / size), f.x),
        mix(texture(tex, (i + vec2(0.5, 1.5)) / size), texture(tex, (i + 1.5) / size), f.x),
        f.y
      );
    }

    // Hash without Sine (hash12), David Hoskins (MIT). See licenses/Hash-without-Sine-MIT.txt.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.52;
      mat2 rot = mat2(0.87758, 0.47942, -0.47942, 0.87758);
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = rot * p * 1.95;
        a *= 0.48;
      }
      return v;
    }

    float ridgedFbm(vec2 p) {
      float v = 0.0;
      float a = 0.52;
      mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
      for (int i = 0; i < 4; i++) {
        float n = noise(p);
        n = 1.0 - abs(n * 2.0 - 1.0);
        v += a * n * n;
        p = rot * p * 2.06;
        a *= 0.48;
      }
      return v;
    }

    float silkyFbm(vec2 p, float t) {
      vec2 q = vec2(
        fbm(p + vec2(0.0, 0.0) + t * 0.22),
        fbm(p + vec2(5.2, 1.3) - t * 0.18)
      );
      return fbm(p + 1.35 * q);
    }

    // Advecta uma coordenada 2D Cartesiana para fora (radialmente) em duas fases defasadas (Flow Mapping)
    // Preserva formas volumétricas 2D (chamas e nuvens largas) sem JAMAIS criar agulhas radiais!
    float radialFlowFbm(vec2 normP, float r, float speed, float scale, float t) {
      vec2 dir = normP / max(r, 0.08);
      float ph0 = fract(t * speed);
      float ph1 = fract(t * speed + 0.5);
      vec2 uv0 = (normP - dir * (ph0 * 0.85)) * scale;
      vec2 uv1 = (normP - dir * (ph1 * 0.85)) * scale + vec2(7.3, 3.1);
      float w = abs(ph0 * 2.0 - 1.0); // Triângulo 0..1..0 para blend contínuo sem salto
      return mix(fbm(uv0), fbm(uv1), w);
    }

    float radialFlowRidged(vec2 normP, float r, float speed, float scale, float t) {
      vec2 dir = normP / max(r, 0.08);
      float ph0 = fract(t * speed);
      float ph1 = fract(t * speed + 0.5);
      // Adiciona leve ondulação tangencial (curl) para as labaredas dançarem ao sair da casca
      vec2 tang = vec2(-dir.y, dir.x) * (fbm(normP * 1.8 + t * 0.4) - 0.5) * 0.42;
      vec2 uv0 = (normP - dir * (ph0 * 0.90) + tang * ph0) * scale;
      vec2 uv1 = (normP - dir * (ph1 * 0.90) + tang * ph1) * scale + vec2(11.7, 5.9);
      float w = abs(ph0 * 2.0 - 1.0);
      return mix(ridgedFbm(uv0), ridgedFbm(uv1), w);
    }
  `;

  // 1. Splat de Fluido omnidirecional esparso
  const EMITTER_SPLAT = `
    uniform sampler2D uSource;
    uniform vec2 uPoint;
    uniform vec3 uImpulse;
    uniform float uAspect;
    uniform float uRadius;
    uniform float uTwist;
    uniform float uPhase;

    void main() {
      vec2 p = vUv - uPoint;
      p.x *= uAspect;
      float d2 = dot(p, p);
      float k = exp(-d2 / uRadius);

      float n1 = fbm(p * 11.0 + vec2(cos(uPhase), sin(uPhase)) * 2.0);
      float n2 = fbm(p * 20.0 - vec2(sin(uPhase * 1.3), cos(uPhase * 1.3)) * 1.8);
      float patchy = smoothstep(0.24, 0.78, n1 * 0.65 + n2 * 0.35);

      vec3 val = uImpulse * (0.45 + 0.85 * patchy);
      val.xy += vec2(-p.y, p.x) / sqrt(max(uRadius, 0.00001)) * uTwist * (0.4 + 0.8 * n1);
      fragColor = vec4(texture(uSource, vUv).xyz + k * val, 1.0);
    }
  `;

  const CURL_FRAG = `
    uniform sampler2D uVelocity;
    void main() {
      float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
      float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
      float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
      float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
      fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }
  `;

  const VORTICITY_FRAG = `
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float uCurlStrength;
    void main() {
      float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
      float R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
      float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
      float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
      float C = texture(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= uCurlStrength * C;
      force.y *= -1.0;
      vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
      fragColor = vec4(clamp(vel, vec2(-380.0), vec2(380.0)), 0.0, 1.0);
    }
  `;

  const DIVERGENCE_FRAG = `
    uniform sampler2D uVelocity;
    void main() {
      vec2 C = texture(uVelocity, vUv).xy;
      float L = vUv.x - uTexel.x < 0.0 ? -C.x : texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
      float R = vUv.x + uTexel.x > 1.0 ? -C.x : texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
      float T = vUv.y + uTexel.y > 1.0 ? -C.y : texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
      float B = vUv.y - uTexel.y < 0.0 ? -C.y : texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
      fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }
  `;

  const CLEAR_PRESSURE_FRAG = `
    uniform sampler2D uPressure;
    void main() {
      fragColor = texture(uPressure, vUv) * 0.78;
    }
  `;

  const PRESSURE_FRAG = `
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main() {
      float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
      float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
      float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
      float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
      float div = texture(uDivergence, vUv).x;
      fragColor = vec4((L + R + T + B - div) * 0.25, 0.0, 0.0, 1.0);
    }
  `;

  const PROJECT_FRAG = `
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main() {
      float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
      float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
      float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
      float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
      vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
      fragColor = vec4(vel, 0.0, 1.0);
    }
  `;

  const ADVECT_FRAG = `
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 uVelocitySize;
    uniform vec2 uSourceSize;
    uniform float uDissipation;
    uniform float uBlurMix;

    void main() {
      vec2 coord = vUv - uDt * bilerp(uVelocity, vUv, uVelocitySize).xy / uVelocitySize;
      vec4 center = bilerp(uSource, coord, uSourceSize);

      if (uBlurMix > 0.01) {
        vec2 stepUv = 1.25 / uSourceSize;
        vec4 blur = 0.25 * (
          bilerp(uSource, coord + vec2(stepUv.x, 0.0), uSourceSize) +
          bilerp(uSource, coord - vec2(stepUv.x, 0.0), uSourceSize) +
          bilerp(uSource, coord + vec2(0.0, stepUv.y), uSourceSize) +
          bilerp(uSource, coord - vec2(0.0, stepUv.y), uSourceSize)
        );
        center = mix(center, blur, uBlurMix);
      }

      vec3 res = max(vec3(0.0), center.rgb) / (1.0 + uDissipation * uDt);
      fragColor = vec4(res, 1.0);
    }
  `;

  // ===========================================================================
  // COMPOSIÇÃO FINAL HDR COM AS 5 ESFERAS SEM ESTRIAS RADIAIS (v7)
  // ===========================================================================
  const DISPLAY_FRAG = `
    uniform sampler2D uDye;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uGlow;
    uniform int uOrbCount;
    uniform vec3 uOrbCenters[5];
    uniform int uOrbTypes[5];
    uniform vec3 uCoreColors[5];
    uniform vec3 uMidColors[5];
    uniform vec3 uSmokeColors[5];

    float crescentRibbon(float r, float a, float targetR, float width, float phase, float streakLen) {
      float deltaA = atan(sin(a - phase), cos(a - phase));
      float rSpiral = targetR + deltaA * 0.12;
      float radialProfile = exp(-pow((r - rSpiral) / width, 2.0));
      float angularProfile = exp(-pow(deltaA / streakLen, 2.0)) * smoothstep(-streakLen * 1.6, streakLen * 0.4, deltaA);
      return radialProfile * angularProfile;
    }

    // -------------------------------------------------------------------------
    // TIPO 0: VÓRTICE SOLAR (Ouro) — Fitas crescentes sedosas em espiral + nuvens esparsas
    // -------------------------------------------------------------------------
    vec3 evalType0_SolarVortex(vec2 normP, float r, float a, vec3 cCore, vec3 cMid, vec3 cSmoke) {
      float t = uTime;
      float warp1 = silkyFbm(normP * 1.20, t * 0.65) - 0.5;
      float warp2 = fbm(normP * 2.1 - vec2(cos(t * 0.5), sin(t * 0.5))) - 0.5;
      float aWarped = a + warp1 * 0.55 + warp2 * 0.25;

      float ribbons = 0.0;
      ribbons += 1.05 * crescentRibbon(r, aWarped, 0.62, 0.13, t * 1.55 + 0.0, 1.35);
      ribbons += 0.95 * crescentRibbon(r, aWarped, 0.72, 0.14, t * 1.25 + 2.1, 1.45);
      ribbons += 0.90 * crescentRibbon(r, aWarped, 0.82, 0.15, t * 1.70 + 4.2, 1.25);
      ribbons += 0.80 * crescentRibbon(r, aWarped, 0.94, 0.17, t * 1.10 + 1.1, 1.50);
      ribbons += 0.65 * crescentRibbon(r, aWarped, 1.08, 0.19, t * 1.40 + 3.5, 1.30);
      ribbons += 0.48 * crescentRibbon(r, aWarped, 1.24, 0.22, t * 0.95 + 5.1, 1.15);

      // Coordenadas rotacionadas 2D para nuvens em espiral sedosas (sem estrias radiais!)
      float swirlA = -t * 0.75 + log(r + 0.35) * 1.85;
      mat2 rotSwirl = mat2(cos(swirlA), -sin(swirlA), sin(swirlA), cos(swirlA));
      float flameField = silkyFbm(rotSwirl * normP * 1.45, t * 0.45);

      float flameTongues = smoothstep(0.28, 0.78, flameField)
                         * smoothstep(0.25, 0.78, r)
                         * exp(-pow(max(0.0, r - 0.72) / 0.52, 2.0));
      float outerMist    = smoothstep(0.32, 0.82, flameField + warp1 * 0.35)
                         * smoothstep(0.55, 1.05, r)
                         * exp(-pow(max(0.0, r - 0.85) / 0.70, 2.0));

      float pulse = 1.0 + 0.04 * sin(t * 2.9);
      float rCore = (r / pulse) + warp1 * 0.05;
      float coreHot     = exp(-(rCore * rCore) / 0.22);
      float sphereBody  = exp(-(rCore * rCore) / 0.54);
      float softRim     = exp(-pow((rCore - 0.72) / 0.16, 2.0)) * (0.65 + 0.55 * flameField);
      float ambientGlow = exp(-(r * r) * 0.65) * 0.36;

      vec3 col = vec3(0.0);
      col += cSmoke * (ambientGlow + outerMist * 1.45 + flameTongues * 0.45);
      col += cMid   * (sphereBody * 0.75 + softRim * 0.85 + flameTongues * 1.35 + ribbons * 1.18);
      float hotCrossings = pow(max(0.0, ribbons * 0.75 + flameTongues * 0.45), 2.1);
      col += cCore  * (coreHot * 1.45 + softRim * 0.35 + hotCrossings * 0.95);
      return col;
    }

    // -------------------------------------------------------------------------
    // TIPO 1: ESFERA DE COMBUSTÃO RADIAL (Carmesim) — Labaredas volumétricas que brotam da casca 360°
    // -------------------------------------------------------------------------
    vec3 evalType1_RadialCombustion(vec2 normP, float r, float a, vec3 cCore, vec3 cMid, vec3 cSmoke) {
      float t = uTime;

      // Dual-phase 2D flow mapping: as línguas de fogo têm largura e volume reais (não agulhas!)
      // e nascem continuamente da superfície da esfera expandindo para fora em 360°
      float fire1 = radialFlowRidged(normP, r, 0.62, 1.85, t);
      float fire2 = radialFlowRidged(normP * mat2(0.8, -0.6, 0.6, 0.8), r, 0.48, 2.35, t + 4.7);
      float fireBillow = fire1 * 0.62 + fire2 * 0.48;

      float smokeFlow = radialFlowFbm(normP, r, 0.42, 1.55, t + 2.1);

      // Células de plasma fervendo dentro da esfera e conectadas às erupções da borda
      float surfaceBoil = ridgedFbm(normP * 2.4 + vec2(cos(t * 0.6), sin(t * 0.6)) * 0.8);

      // Casca incandescente viva (r = 0.74) que deforma onde uma língua de chama está saindo
      float rPerturbed = r - (fireBillow - 0.45) * 0.14 + (smokeFlow - 0.5) * 0.08;
      float eruptingRim = exp(-pow((rPerturbed - 0.73) / 0.11, 2.0)) * (0.75 + 0.90 * fireBillow);

      // Labaredas esparsas e largas que saem da casca em direções variadas (360°)
      float lobeMask = smoothstep(0.28, 0.78, smokeFlow);
      float flameReach = 0.46 + 0.38 * lobeMask;
      float flameEnv = smoothstep(0.42, 0.72, r) * exp(-pow(max(0.0, r - 0.70) / flameReach, 1.85));
      float tongues = pow(max(0.0, fireBillow), 1.65) * (0.45 + 0.85 * lobeMask) * flameEnv;

      // Tufos de fumaça de calor esparsos além das chamas
      float heatSmoke = smoothstep(0.32, 0.82, smokeFlow * 0.7 + fire1 * 0.4)
                      * lobeMask
                      * smoothstep(0.62, 1.05, r)
                      * exp(-pow(max(0.0, r - 0.88) / 0.68, 2.0));

      float insideMask = 1.0 - smoothstep(0.68, 0.80, rPerturbed);
      float boilingInterior = insideMask * (0.50 + 0.70 * surfaceBoil);
      float hotCore = exp(-(r * r) / 0.22) * (0.95 + 0.25 * surfaceBoil);

      vec3 col = vec3(0.0);
      col += cSmoke * (heatSmoke * 1.65 + exp(-(r * r) * 0.62) * 0.38 + tongues * 0.50);
      col += cMid   * (boilingInterior * 0.85 + eruptingRim * 1.35 + tongues * 1.95);
      col += cCore  * (hotCore * 1.25 + eruptingRim * 0.65 + pow(max(0.0, tongues), 2.0) * 1.45);
      return col;
    }

    // -------------------------------------------------------------------------
    // TIPO 2: PULSO DE ÉTER ARCANO (Violeta) — Anéis concêntricos lisos + nuvens esparsas
    // -------------------------------------------------------------------------
    vec3 evalType2_AetherPulse(vec2 normP, float r, float a, vec3 cCore, vec3 cMid, vec3 cSmoke) {
      float t = uTime;

      float w1 = silkyFbm(normP * 1.35 + vec2(cos(t * 0.35), sin(t * 0.35)), t * 0.45);
      float w2 = silkyFbm(normP * 1.35 - vec2(cos(t * 0.35), sin(t * 0.35)), -t * 0.45);
      float ether = (w1 + w2) * 0.5;

      // Anéis concêntricos que expandem suavemente
      float wavePhase = r * 7.2 - t * 1.85 + (ether - 0.5) * 2.2;
      float pulseRings = pow(0.5 + 0.5 * sin(wavePhase), 3.6)
                       * smoothstep(0.30, 0.68, r)
                       * exp(-pow(max(0.0, r - 0.68) / 0.48, 2.0));

      // Nuvens volumétricas usando Flow Mapping 2D (sem estrias radiais!)
      float mistFlow = radialFlowFbm(normP, r, 0.38, 1.45, t);
      float nebulaCloud = smoothstep(0.30, 0.80, mistFlow * 0.65 + ether * 0.45)
                        * smoothstep(0.45, 0.82, r)
                        * exp(-pow(max(0.0, r - 0.76) / 0.60, 2.0));

      float rBreath = 0.72 + 0.035 * sin(t * 2.4) + (ether - 0.5) * 0.06;
      float primaryRim   = exp(-pow((r - rBreath) / 0.065, 2.0));
      float secondaryRim = 0.55 * exp(-pow((r - rBreath * 1.18) / 0.085, 2.0));
      float doubleRim    = primaryRim + secondaryRim;

      float innerFill = smoothstep(0.0, 0.70, r) * (1.0 - smoothstep(0.70, 0.78, r)) * 0.55;
      float coreOrb   = exp(-(r * r) / 0.18) * (0.9 + 0.12 * sin(t * 3.5));
      float deepMist  = exp(-(r * r) * 0.72) * (0.35 + 0.55 * ether);

      vec3 col = vec3(0.0);
      col += cSmoke * (deepMist * 1.20 + nebulaCloud * 1.45);
      col += cMid   * (innerFill + doubleRim * 1.15 + pulseRings * 1.35 + nebulaCloud * 1.15);
      col += cCore  * (coreOrb * 1.35 + primaryRim * 0.75 + pow(pulseRings, 1.8) * 1.05);
      return col;
    }

    // -------------------------------------------------------------------------
    // TIPO 3: ESFERA DE RAIOS CAÓTICOS (Ciano) — Descargas elétricas imprevisíveis e assimétricas
    // -------------------------------------------------------------------------
    float chaoticLightningLayer(vec2 normP, float r, float seedTime, float scale) {
      vec2 p = normP * scale;
      vec2 warp = vec2(
        fbm(p * 1.4 + vec2(seedTime * 1.9, -seedTime * 1.3)) - 0.5,
        fbm(p * 1.4 + vec2(-seedTime * 1.5, seedTime * 2.1) + 4.7) - 0.5
      );
      vec2 q = p + warp * 1.65;

      float nMain   = noise(q * 1.8 + vec2(seedTime * 0.7, -seedTime * 0.5)) - 0.5;
      float nBranch = noise(q * 3.7 - vec2(seedTime * 1.1, seedTime * 0.9)) - 0.5;

      float mainBolt  = exp(-abs(nMain + nBranch * 0.35) * 32.0);
      float subBranch = exp(-abs(nMain * 0.6 - nBranch) * 45.0) * exp(-abs(nMain) * 6.0);

      float sectorGate = smoothstep(0.38, 0.72, noise(normP * 1.15 + vec2(floor(seedTime * 3.5) * 1.7, seedTime * 0.8)));
      return (mainBolt + subBranch * 0.65) * (0.25 + 0.95 * sectorGate);
    }

    vec3 evalType3_ChaoticLightning(vec2 normP, float r, float a, vec3 cCore, vec3 cMid, vec3 cSmoke) {
      float t = uTime;

      float fineWarp = fbm(normP * 2.6 + vec2(t * 0.9, -t * 0.7)) - 0.5;
      float rCrystal = r + fineWarp * 0.045;

      float insideSphere = 1.0 - smoothstep(0.73, 0.79, rCrystal);
      float zNorm = sqrt(max(0.0, 1.0 - min(1.0, (rCrystal / 0.76) * (rCrystal / 0.76))));
      float fresnelShell = pow(1.0 - zNorm, 2.4) * insideSphere;
      float electricRim  = exp(-pow((rCrystal - 0.75) / 0.045, 2.0)) * (0.8 + 0.5 * abs(fineWarp) * 4.0);

      float bolt1 = chaoticLightningLayer(normP, r, t * 1.35 + 1.0, 1.65);
      float bolt2 = chaoticLightningLayer(normP * mat2(0.6, -0.8, 0.8, 0.6), r, t * 1.85 + 13.7, 2.15);
      float bolt3 = chaoticLightningLayer(normP * mat2(-0.5, 0.86, -0.86, -0.5), r, t * 2.40 + 29.3, 1.35);

      float innerArcsMask = smoothstep(0.10, 0.75, r) * insideSphere;
      float outerArcsMask = smoothstep(0.45, 0.76, r) * exp(-pow(max(0.0, r - 0.74) / 0.62, 1.75));

      float lightning = (bolt1 * 0.95 + bolt2 * 0.80 + bolt3 * 0.75) * (innerArcsMask * 0.65 + outerArcsMask * 1.35);

      float ionCloud = smoothstep(0.32, 0.82, radialFlowFbm(normP, r, 0.50, 1.5, t)) * outerArcsMask * 0.85;
      float starCore = exp(-(r * r) / 0.13) * (0.95 + 0.15 * sin(t * 14.0));

      vec3 col = vec3(0.0);
      col += cSmoke * (ionCloud * 1.35 + exp(-(r * r) * 0.65) * 0.35);
      col += cMid   * (fresnelShell * 1.15 + electricRim * 1.10 + lightning * 1.65 + ionCloud * 0.55);
      col += cCore  * (starCore * 1.50 + electricRim * 0.85 + pow(max(0.0, lightning), 1.55) * 1.65);
      return col;
    }

    // -------------------------------------------------------------------------
    // TIPO 4: ESTRELA SOLAR COMPLETA (Sol 360°) — Fotosfera 3D + Proeminências e Arcos Solares!
    // -------------------------------------------------------------------------
    vec3 evalType4_SolarStar(vec2 normP, float r, float a, vec3 cCore, vec3 cMid, vec3 cSmoke) {
      float t = uTime;

      // 1. FOTOSFERA SOLAR 3D (r <= 0.76): Células de convecção (grânulos solares) + limb darkening
      float zSphere = sqrt(max(0.0, 1.0 - min(1.0, (r / 0.76) * (r / 0.76))));
      vec2 sphereUv = normP / (0.62 + 0.38 * zSphere);
      float gran1 = ridgedFbm(sphereUv * 3.4 + vec2(t * 0.32, -t * 0.25));
      float gran2 = fbm(sphereUv * 6.0 - vec2(t * 0.48, t * 0.38));
      float solarGranules = gran1 * 0.68 + gran2 * 0.32;

      float sunDisc = 1.0 - smoothstep(0.73, 0.78, r + (gran2 - 0.5) * 0.035);
      float chromosphereRim = exp(-pow((r - 0.75) / 0.055, 2.0)) * (0.95 + 0.65 * gran1);

      // 2. PROEMINÊNCIAS SOLARES E EJEÇÕES CORONAIS CURVAS (Sem espinhos retos!)
      // Combina Flow Mapping 2D com torção magnética para criar laços/arcos de plasma solar (solar loops)
      float magWarp = silkyFbm(normP * 1.6, t * 0.55) - 0.5;
      vec2 loopedP = normP + vec2(-normP.y, normP.x) * magWarp * 0.55;

      float prom1 = radialFlowRidged(loopedP, r, 0.55, 1.75, t);
      float prom2 = radialFlowFbm(loopedP * mat2(0.7, 0.7, -0.7, 0.7), r, 0.42, 1.45, t + 6.2);

      // Máscara de regiões ativas ao redor do limbo solar (erupções esparsas em 360°)
      float activeZones = smoothstep(0.26, 0.78, prom2);
      float flareReach  = 0.48 + 0.40 * activeZones;

      float coronaEnv   = smoothstep(0.58, 0.76, r) * exp(-pow(max(0.0, r - 0.74) / flareReach, 1.75));
      float solarFlares = pow(max(0.0, prom1), 1.60) * (0.45 + 0.90 * activeZones) * coronaEnv;

      // Atmosfera coronal externa difusa e quente
      float outerCorona = smoothstep(0.30, 0.82, prom2 * 0.7 + prom1 * 0.4)
                        * smoothstep(0.65, 1.05, r)
                        * exp(-pow(max(0.0, r - 0.85) / 0.72, 2.0));

      vec3 col = vec3(0.0);
      col += cSmoke * (outerCorona * 1.55 + solarFlares * 0.60 + exp(-(r * r) * 0.55) * 0.42);
      col += cMid   * (sunDisc * (0.75 + 0.85 * solarGranules) + chromosphereRim * 1.25 + solarFlares * 1.95);
      float hotRegions = sunDisc * pow(solarGranules, 2.1) * (0.65 + 0.55 * zSphere);
      col += cCore  * (hotRegions * 1.55 + chromosphereRim * 0.75 + pow(max(0.0, solarFlares), 1.9) * 1.45);

      return col;
    }

    void main() {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 centered = (vUv - 0.5) * 2.0;
      centered.x *= aspect;

      vec3 color = vec3(0.003, 0.004, 0.008) * smoothstep(2.4, 0.0, length(centered));

      // 1. CAMADA DE FUMAÇA E PLASMA DO FLUIDO NAVIER-STOKES (Com tufos multidirecionais)
      vec3 fluidDye = max(vec3(0.0), texture(uDye, vUv).rgb);
      float cloudBreakup = smoothstep(0.16, 0.82, fbm(centered * 2.6 + vec2(uTime * 0.15, -uTime * 0.12)));
      vec3 smokePlume = fluidDye * (0.55 + 0.75 * cloudBreakup) + pow(fluidDye, vec3(1.55)) * 0.80;
      color += smokePlume;

      // 2. RENDERIZAÇÃO DE CADA ESFERA
      for (int i = 0; i < 5; i++) {
        if (i >= uOrbCount) break;
        vec2 p = vUv - uOrbCenters[i].xy;
        p.x *= aspect;
        float radius = uOrbCenters[i].z;
        vec2 normP = p / radius;
        float r = length(normP);
        float a = atan(normP.y, normP.x);

        float radialFade = 1.0 - smoothstep(2.0, 3.2, r);
        if (radialFade <= 0.0001) continue;

        int orbType = uOrbTypes[i];
        vec3 cCore  = uCoreColors[i];
        vec3 cMid   = uMidColors[i];
        vec3 cSmoke = uSmokeColors[i];

        vec3 orbCol = vec3(0.0);
        if (orbType == 0) {
          orbCol = evalType0_SolarVortex(normP, r, a, cCore, cMid, cSmoke);
        } else if (orbType == 1) {
          orbCol = evalType1_RadialCombustion(normP, r, a, cCore, cMid, cSmoke);
        } else if (orbType == 2) {
          orbCol = evalType2_AetherPulse(normP, r, a, cCore, cMid, cSmoke);
        } else if (orbType == 3) {
          orbCol = evalType3_ChaoticLightning(normP, r, a, cCore, cMid, cSmoke);
        } else {
          orbCol = evalType4_SolarStar(normP, r, a, cCore, cMid, cSmoke);
        }
        color += orbCol * radialFade;
      }

      // 3. TONE MAPPING CINEMATOGRÁFICO
      color *= uGlow;
      vec3 mapped = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
      mapped = clamp(mapped, 0.0, 1.0);

      fragColor = vec4(mapped, 1.0);
    }
  `;

  window.OriShaders = {
    VERT,
    PRELUDE,
    EMITTER_SPLAT,
    CURL_FRAG,
    VORTICITY_FRAG,
    DIVERGENCE_FRAG,
    CLEAR_PRESSURE_FRAG,
    PRESSURE_FRAG,
    PROJECT_FRAG,
    ADVECT_FRAG,
    DISPLAY_FRAG,
  };
})();
