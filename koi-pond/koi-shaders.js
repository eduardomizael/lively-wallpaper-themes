(() => {
  'use strict';

  function createKoiShaders({ CAUSTICS_GLSL, params }) {
    // =========================================================================
    // 6. SHADERS DAS CARPAS (5 PADRÕES PROCEDURAIS + DEFORMAÇÃO FÍSICA)
    // =========================================================================
    const globalFishUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity }
    };

    const FISH_DEFORM_GLSL = /* glsl */ `
      uniform float uSwimPhase;
      uniform float uTailAmp;
      uniform float uSpineCurve;

      float spineOffsetX(float z) {
        float s = clamp((2.05 - z) / 6.20, 0.0, 1.0);
        float wave = sin(uSwimPhase - s * 5.7);
        float amp = uTailAmp * (0.03 + 0.97 * pow(s, 1.75));
        float swimX = wave * amp;

        float ds = s - 0.27;
        float bendX = uSpineCurve * (ds * ds) * 2.85;

        return swimX + bendX;
      }

      vec3 deformFishPosition(vec3 p) {
        p.x += spineOffsetX(p.z);
        return p;
      }

      vec3 deformFishNormal(vec3 p, vec3 n) {
        float eps = 0.06;
        float dx = spineOffsetX(p.z + eps) - spineOffsetX(p.z - eps);
        float angle = atan(dx / (2.0 * eps));
        float c = cos(angle);
        float s = sin(angle);
        return normalize(vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c));
      }
    `;

    function createKoiBodyMaterial(fishUniforms, archetype) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms,
          uPatternId: { value: archetype.patternId },
          uSeed: { value: archetype.seed }
        },
        vertexShader: /* glsl */ `
          varying vec3 vObjPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${FISH_DEFORM_GLSL}

          void main() {
            vObjPos = position;
            vec3 deformedPos = deformFishPosition(position);
            vec3 deformedNorm = deformFishNormal(position, normal);

            vec4 wp = modelMatrix * vec4(deformedPos, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * deformedNorm);

            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uCausticsIntensity;
          uniform int uPatternId;
          uniform float uSeed;
          varying vec3 vObjPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${CAUSTICS_GLSL}

          float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }

          float noise2D(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.52;
            mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
            for (int i = 0; i < 4; i++) {
              v += a * noise2D(p);
              p = rot * p * 2.05;
              a *= 0.5;
            }
            return v;
          }

          void main() {
            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.35, 1.0, -0.28));

            vec2 p = vec2(vObjPos.x * 1.45, vObjPos.z * 0.92);
            vec2 warp = vec2(fbm(p * 1.45 + uSeed), fbm(p * 1.45 + uSeed + 4.3)) - 0.5;
            vec2 wp = p + warp * 0.60;

            // Escamas procedurais
            vec2 scaleUv = vec2(vObjPos.z * 9.5, atan(vObjPos.y, vObjPos.x) * 4.2);
            scaleUv.y += floor(scaleUv.x) * 0.5;
            float scaleCell = length(fract(scaleUv) - 0.5);
            float scaleRim = smoothstep(0.48, 0.34, scaleCell);
            float scaleShade = mix(0.93, 1.04, scaleRim);

            vec3 albedo = vec3(0.95);
            float metallicBoost = 0.0;

            if (uPatternId == 0) {
              // 0: KOHAKU (Branco perolado + grandes manchas vermelho-alaranjado vibrantes)
              float p1 = 1.0 - smoothstep(0.30, 0.54, length((wp - vec2(0.02, 1.32)) * vec2(1.15, 0.95)));
              float p2 = 1.0 - smoothstep(0.54, 0.82, length((wp - vec2(-0.08, 0.16)) * vec2(0.88, 0.68)));
              float p3 = 1.0 - smoothstep(0.42, 0.66, length((wp - vec2(0.10, -1.08)) * vec2(1.05, 0.82)));
              float orangeMask = smoothstep(0.28, 0.43, max(p1, max(p2, p3)));
              vec3 pearl = vec3(0.97, 0.955, 0.925);
              vec3 hi = mix(vec3(0.95, 0.18, 0.03), vec3(1.0, 0.42, 0.06), fbm(wp * 2.5 + uSeed));
              albedo = mix(pearl, hi, orangeMask) * scaleShade;
            } else if (uPatternId == 1) {
              // 1: TAISHO SANKE (Branco perolado + laranja vibrante + pintas pretas Sumi)
              float p1 = 1.0 - smoothstep(0.28, 0.50, length((wp - vec2(0.08, 1.15)) * vec2(1.15, 0.95)));
              float p2 = 1.0 - smoothstep(0.48, 0.74, length((wp - vec2(-0.18, 0.08)) * vec2(0.95, 0.74)));
              float p3 = 1.0 - smoothstep(0.34, 0.58, length((wp - vec2(0.14, -1.02)) * vec2(1.1, 0.84)));
              float orangeMask = smoothstep(0.28, 0.44, max(p1, max(p2, p3)));

              float s1 = 1.0 - smoothstep(0.18, 0.32, length((wp - vec2(0.28, 0.58)) * vec2(1.25, 1.0)));
              float s2 = 1.0 - smoothstep(0.20, 0.35, length((wp - vec2(-0.22, -0.56)) * vec2(1.2, 0.95)));
              float s3 = 1.0 - smoothstep(0.14, 0.25, length((wp - vec2(0.06, -1.42)) * vec2(1.35, 1.0)));
              float blackMask = smoothstep(0.32, 0.48, max(s1, max(s2, s3)));

              vec3 pearl = vec3(0.96, 0.945, 0.91);
              vec3 hi = mix(vec3(0.97, 0.28, 0.04), vec3(1.0, 0.50, 0.09), fbm(wp * 2.8));
              vec3 sumi = vec3(0.07, 0.08, 0.105);
              albedo = mix(pearl, hi, orangeMask);
              albedo = mix(albedo, sumi, blackMask);
              albedo *= scaleShade;
            } else if (uPatternId == 2) {
              // 2: SHOWA SANSHOKU (Base preta profunda + faixas brancas + manchas carmesim)
              float whiteBand1 = 1.0 - smoothstep(0.34, 0.56, length((wp - vec2(0.05, 0.85)) * vec2(0.82, 1.18)));
              float whiteBand2 = 1.0 - smoothstep(0.36, 0.58, length((wp - vec2(-0.10, -0.78)) * vec2(0.85, 1.08)));
              float whiteMask = smoothstep(0.30, 0.46, max(whiteBand1, whiteBand2));

              float red1 = 1.0 - smoothstep(0.34, 0.58, length((wp - vec2(-0.08, 1.25)) * vec2(1.05, 0.90)));
              float red2 = 1.0 - smoothstep(0.42, 0.68, length((wp - vec2(0.12, -0.05)) * vec2(0.92, 0.78)));
              float red3 = 1.0 - smoothstep(0.28, 0.48, length((wp - vec2(-0.08, -1.32)) * vec2(1.15, 0.90)));
              float redMask = smoothstep(0.30, 0.46, max(red1, max(red2, red3)));

              vec3 sumiBase = vec3(0.08, 0.095, 0.125);
              vec3 snow = vec3(0.95, 0.95, 0.94);
              vec3 crimson = mix(vec3(0.88, 0.12, 0.04), vec3(0.98, 0.30, 0.06), fbm(wp * 2.6));
              albedo = mix(sumiBase, snow, whiteMask);
              albedo = mix(albedo, crimson, redMask);
              albedo *= mix(0.94, 1.05, scaleRim);
            } else if (uPatternId == 3) {
              // 3: YAMABUKI OGON (Ouro metálico luminoso com escamas cintilantes)
              float goldVar = fbm(wp * 2.2 + uSeed);
              vec3 deepGold = vec3(0.94, 0.60, 0.06);
              vec3 brightGold = vec3(1.0, 0.86, 0.30);
              vec3 headSheen = vec3(1.0, 0.92, 0.55);
              albedo = mix(deepGold, brightGold, goldVar);
              float headMask = smoothstep(0.85, 1.65, vObjPos.z);
              albedo = mix(albedo, headSheen, headMask * 0.45);
              // Escamas douradas mais marcadas
              albedo *= mix(0.87, 1.12, scaleRim);
              metallicBoost = 0.42;
            } else {
              // 4: ASAGI / SHUSUI (Dorso azul-ardósia prateado reticulado + laterais coral)
              float dorsalBand = 1.0 - smoothstep(0.18, 0.48, abs(vObjPos.x + warp.x * 0.12));
              float headWhite = smoothstep(0.95, 1.55, vObjPos.z);
              vec3 slateBlue = mix(vec3(0.18, 0.36, 0.54), vec3(0.45, 0.66, 0.82), scaleRim);
              vec3 silverSide = vec3(0.88, 0.93, 0.96);
              vec3 coral = vec3(0.98, 0.40, 0.24);

              float coralFlank = smoothstep(0.14, 0.38, abs(vObjPos.x)) * smoothstep(1.25, 0.35, vObjPos.z) * smoothstep(-1.8, -0.4, vObjPos.z);
              albedo = mix(silverSide, slateBlue, dorsalBand * (1.0 - headWhite * 0.92));
              albedo = mix(albedo, coral, coralFlank * 0.78);
              albedo *= mix(0.90, 1.07, scaleRim);
              metallicBoost = 0.22;
            }

            float bellyFade = smoothstep(-0.35, 0.35, N.y);
            albedo *= mix(0.66, 1.0, bellyFade);

            float diff = max(dot(N, L), 0.0);
            vec3 hemi = mix(vec3(0.04, 0.18, 0.26), vec3(0.75, 0.92, 0.98), N.y * 0.5 + 0.5);
            vec3 lighting = hemi * 0.48 + vec3(1.0, 0.97, 0.90) * diff * 0.78;

            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), 38.0) * (0.36 + metallicBoost * 0.45);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * (0.22 + metallicBoost * 0.25);

            vec3 specTint = mix(vec3(0.86, 0.96, 1.0), vec3(1.0, 0.93, 0.68), metallicBoost);
            vec3 color = albedo * lighting + specTint * (spec + fresnel * 0.65);

            float c = layeredCaustics(vWorldPos.xz * 1.05, uTime * 1.05);
            color += vec3(0.35, 0.82, 0.95) * c * 0.22 * uCausticsIntensity * max(N.y, 0.0);

            // Leve absorção de água proporcional à profundidade do peixe
            float depthTint = clamp(0.10 - vWorldPos.y * 0.06, 0.06, 0.20);
            color = mix(color, vec3(0.05, 0.26, 0.34), depthTint);

            gl_FragColor = vec4(color, 1.0);
          }
        `
      });
    }

    function createFinMaterial(fishUniforms, finType, sideSign, rootHex, tipHex) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms,
          uFinType: { value: finType },
          uSideSign: { value: sideSign },
          uPivot: { value: new THREE.Vector3(0, 0, 0) },
          uRootColor: { value: new THREE.Color(rootHex) },
          uTipColor: { value: new THREE.Color(tipHex) }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform int uFinType;
          uniform float uSideSign;
          uniform vec3 uPivot;
          uniform float uPectoralSpread;
          uniform float uPectoralRowL;
          uniform float uPectoralRowR;
          uniform float uTime;

          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${FISH_DEFORM_GLSL}

          void main() {
            vUv = uv;
            vec3 p = position;
            vec3 n = normal;

            if (uFinType == 1) {
              float row = (uSideSign > 0.0) ? uPectoralRowL : uPectoralRowR;
              float angle = uSideSign * (uPectoralSpread + row);
              float tipLag = sin(uTime * 3.8 + uSideSign) * 0.05 * uv.x;
              float c = cos(angle);
              float s = sin(angle);
              p = uPivot + vec3(p.x * c - p.z * s, p.y + tipLag, p.x * s + p.z * c);
            } else if (uFinType == 2) {
              float angle = uSideSign * (uPectoralSpread * 0.45);
              float c = cos(angle);
              float s = sin(angle);
              p = uPivot + vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
            } else if (uFinType == 3) {
              float sBody = clamp((2.05 - p.z) / 6.20, 0.0, 1.0);
              float dorsalWave = sin(uSwimPhase - sBody * 5.7 - uv.y * 1.15) * (uTailAmp * 0.32 + 0.06) * uv.y;
              p.x += dorsalWave;
            } else if (uFinType == 0) {
              float whip = sin(uSwimPhase - 5.2 - uv.x * 2.15) * (uTailAmp * 0.25) * pow(uv.x, 1.5);
              p.x += whip;
            }

            vec3 deformedPos = deformFishPosition(p);
            vec3 deformedNorm = deformFishNormal(p, n);

            vec4 wp = modelMatrix * vec4(deformedPos, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * deformedNorm);

            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform int uFinType;
          uniform float uTime;
          uniform float uCausticsIntensity;
          uniform vec3 uRootColor;
          uniform vec3 uTipColor;
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${CAUSTICS_GLSL}

          void main() {
            float rayCoord = (uFinType == 3) ? vUv.x * 26.0 : vUv.y * 28.0;
            float rays = pow(0.5 + 0.5 * sin(rayCoord * 3.14159), 1.8);

            float t = (uFinType == 3) ? vUv.y : vUv.x;
            vec3 col = mix(uRootColor, uTipColor, smoothstep(0.0, 0.58, t));
            col *= (0.86 + 0.16 * rays);

            vec3 N = normalize(vWorldNormal);
            col *= (0.68 + 0.32 * abs(N.y));

            float c = layeredCaustics(vWorldPos.xz * 1.05, uTime * 1.05);
            col += vec3(0.35, 0.85, 0.98) * c * 0.16 * uCausticsIntensity;

            float alpha = mix(0.76, 0.20, smoothstep(0.12, 1.0, t));
            float edgeSoft = (uFinType == 3)
              ? smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(1.0, 0.84, vUv.y)
              : smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.93, vUv.y) * smoothstep(1.0, 0.86, vUv.x);

            alpha *= (0.72 + 0.28 * rays) * edgeSoft;
            gl_FragColor = vec4(col, alpha);
          }
        `
      });
    }

    function createDetailMaterial(fishUniforms, baseColor) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...fishUniforms,
          uColor: { value: new THREE.Color(baseColor) }
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          ${FISH_DEFORM_GLSL}
          void main() {
            vec3 p = deformFishPosition(position);
            vec3 n = deformFishNormal(position, normal);
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * n);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          void main() {
            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.35, 1.0, -0.28));
            float diff = 0.4 + 0.6 * max(dot(N, L), 0.0);
            float spec = pow(max(dot(N, normalize(L + V)), 0.0), 64.0) * 0.85;
            gl_FragColor = vec4(uColor * diff + vec3(spec), 1.0);
          }
        `
      });
    }

    function createShadowMaterial(fishUniforms, finType = -1, sideSign = 0, pivot = new THREE.Vector3()) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms,
          uFinType: { value: finType },
          uSideSign: { value: sideSign },
          uPivot: { value: pivot },
          uOpacity: { value: finType === -1 ? 0.34 : 0.14 }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform int uFinType;
          uniform float uSideSign;
          uniform vec3 uPivot;
          uniform float uPectoralSpread;
          uniform float uPectoralRowL;
          uniform float uPectoralRowR;
          uniform float uTime;
          varying vec2 vUv;

          ${FISH_DEFORM_GLSL}

          void main() {
            vUv = uv;
            vec3 p = position;

            if (uFinType == 1) {
              float row = (uSideSign > 0.0) ? uPectoralRowL : uPectoralRowR;
              float angle = uSideSign * (uPectoralSpread + row);
              float c = cos(angle);
              float s = sin(angle);
              p = uPivot + vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
            } else if (uFinType == 0) {
              float whip = sin(uSwimPhase - 5.2 - uv.x * 2.15) * (uTailAmp * 0.25) * pow(uv.x, 1.5);
              p.x += whip;
            }

            p = deformFishPosition(p);
            p.y = 0.0;
            p.x *= 1.10;
            p.z *= 1.05;
            p.x += sin(p.z * 1.4 + uTime * 1.6) * 0.04;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          uniform int uFinType;
          varying vec2 vUv;
          void main() {
            float soft = 1.0;
            if (uFinType >= 0) {
              soft = smoothstep(1.0, 0.15, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
            }
            gl_FragColor = vec4(0.004, 0.024, 0.055, uOpacity * soft);
          }
        `
      });
    }

    return {
      globalFishUniforms,
      createKoiBodyMaterial,
      createFinMaterial,
      createDetailMaterial,
      createShadowMaterial
    };
  }

  window.KoiShaders = { createKoiShaders };
})();
