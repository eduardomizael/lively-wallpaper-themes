(() => {
  'use strict';

  function createEnvironment({ scene, params, renderer, worldBounds, getClockTime }) {
    // =========================================================================
    // 3. SHADERS DE ÁGUA, FUNDO DO LAGO E CÁUSTICAS (VORONOI EM CAMADAS)
    // =========================================================================
    const MAX_RIPPLES = 22;
    const rippleData = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(999, 999, -99, 0));
    let rippleIndex = 0;

    function spawnRipple(x, z, strength = 1.0) {
      rippleData[rippleIndex].set(x, z, getClockTime(), strength);
      rippleIndex = (rippleIndex + 1) % MAX_RIPPLES;
    }

    // Cellular-noise references: Inigo Quilez (Voronoise) and The Book of Shaders, ch. 12.
    const CAUSTICS_GLSL = /* glsl */ `
      vec2 hash22(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453123);
      }

      float voronoiCaustic(vec2 uv, float t) {
        vec2 n = floor(uv);
        vec2 f = fract(uv);

        float md = 8.0;
        float md2 = 8.0;

        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            o = 0.5 + 0.42 * sin(t + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md2 = md;
              md = d;
            } else if (d < md2) {
              md2 = d;
            }
          }
        }
        float edge = sqrt(md2) - sqrt(md);
        return pow(clamp(1.0 - smoothstep(0.0, 0.24, edge), 0.0, 1.0), 2.2);
      }

      float layeredCaustics(vec2 worldXZ, float t) {
        vec2 p1 = worldXZ * 0.34 + vec2(t * 0.045, -t * 0.032);
        vec2 p2 = worldXZ * 0.52 + vec2(-t * 0.038, t * 0.041);
        p1 += 0.18 * vec2(sin(worldXZ.y * 0.45 + t * 0.6), cos(worldXZ.x * 0.42 - t * 0.5));
        p2 += 0.14 * vec2(cos(worldXZ.y * 0.58 - t * 0.55), sin(worldXZ.x * 0.51 + t * 0.48));

        float c1 = voronoiCaustic(p1, t * 0.85);
        float c2 = voronoiCaustic(p2 + vec2(4.2, 1.7), t * 1.05);

        return c1 * 0.62 + c2 * 0.55 + (c1 * c2) * 0.95;
      }

      float rippleField(vec2 worldXZ, float t, vec4 ripples[22]) {
        float sum = 0.0;
        for (int i = 0; i < 22; i++) {
          float age = t - ripples[i].z;
          if (age > 0.0 && age < 4.2 && ripples[i].w > 0.001) {
            float dist = length(worldXZ - ripples[i].xy);
            float radius = age * 2.75;
            float ring = exp(-pow((dist - radius) * 1.75, 2.0));
            float wave = sin((dist - radius) * 11.0);
            float fade = exp(-age * 1.05) * ripples[i].w;
            sum += ring * (0.55 + 0.45 * wave) * fade;
          }
        }
        return sum;
      }
    `;

    // 3.1 Fundo do Lago (y = -3.4)
    const pondBottomUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity },
      uHalfSize: { value: new THREE.Vector2(worldBounds.halfW, worldBounds.halfH) },
      uRipples: { value: rippleData }
    };

    const pondBottomMat = new THREE.ShaderMaterial({
      uniforms: pondBottomUniforms,
      depthWrite: true,
      vertexShader: /* glsl */ `
        varying vec2 vWorldXZ;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uCausticsIntensity;
        uniform vec2 uHalfSize;
        uniform vec4 uRipples[22];
        varying vec2 vWorldXZ;

        ${CAUSTICS_GLSL}

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
          float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
          float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
          float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 normPos = vWorldXZ / max(uHalfSize, vec2(1.0));
          float radialDist = length(normPos * vec2(0.88, 1.0));
          float centerGlow = exp(-radialDist * radialDist * 1.45);

          vec3 edgeNavy = vec3(0.008, 0.038, 0.088);
          vec3 midDeepTeal = vec3(0.025, 0.145, 0.215);
          vec3 centerPetrol = vec3(0.058, 0.305, 0.375);

          vec3 bg = mix(edgeNavy, midDeepTeal, smoothstep(1.35, 0.15, radialDist));
          bg = mix(bg, centerPetrol, centerGlow * 0.85);

          float grit = valueNoise(vWorldXZ * 0.9) * 0.55 + valueNoise(vWorldXZ * 2.4) * 0.3 + valueNoise(vWorldXZ * 5.2) * 0.15;
          bg *= (0.91 + 0.16 * grit);

          float rip = rippleField(vWorldXZ, uTime, uRipples);
          vec2 refractedXZ = vWorldXZ + vec2(rip * 0.14, -rip * 0.12);

          float cR = layeredCaustics(refractedXZ + vec2(0.05, 0.03), uTime);
          float cG = layeredCaustics(refractedXZ, uTime);
          float cB = layeredCaustics(refractedXZ - vec2(0.05, 0.03), uTime);
          vec3 causticCol = vec3(cR * 0.42, cG * 0.88, cB * 1.05);

          float causticMask = (0.28 + 0.72 * centerGlow) * uCausticsIntensity;
          bg += causticCol * 0.26 * causticMask;

          bg += vec3(0.18, 0.48, 0.58) * rip * 0.20 * uCausticsIntensity;

          float vig = smoothstep(1.65, 0.55, radialDist);
          bg *= mix(0.62, 1.0, vig);

          gl_FragColor = vec4(bg, 1.0);
        }
      `
    });

    const pondBottom = new THREE.Mesh(new THREE.PlaneGeometry(90, 56), pondBottomMat);
    pondBottom.rotation.x = -Math.PI / 2;
    pondBottom.position.y = -3.4;
    scene.add(pondBottom);

    // 3.2 Plano de Água Superior com Cáusticas de Superfície e Ripples (y = 1.8)
    const waterSurfaceUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity },
      uHalfSize: { value: new THREE.Vector2(worldBounds.halfW, worldBounds.halfH) },
      uRipples: { value: rippleData }
    };

    const waterSurfaceMat = new THREE.ShaderMaterial({
      uniforms: waterSurfaceUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vWorldXZ;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uCausticsIntensity;
        uniform vec2 uHalfSize;
        uniform vec4 uRipples[22];
        varying vec2 vWorldXZ;

        ${CAUSTICS_GLSL}

        void main() {
          vec2 normPos = vWorldXZ / max(uHalfSize, vec2(1.0));
          float radialDist = length(normPos * vec2(0.9, 1.0));
          float centerMask = 0.22 + 0.78 * exp(-radialDist * radialDist * 1.3);

          float c = layeredCaustics(vWorldXZ * 1.12 + vec2(2.3, -1.9), uTime * 1.12);
          float shimmer = pow(c, 1.35) * 0.20 * uCausticsIntensity * centerMask;

          float rip = rippleField(vWorldXZ, uTime, uRipples);
          float ripGlow = rip * 0.30;

          vec3 col = vec3(0.42, 0.86, 0.96) * shimmer + vec3(0.58, 0.93, 1.0) * ripGlow;
          float alpha = clamp(shimmer * 1.15 + ripGlow, 0.0, 0.68);

          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(90, 56), waterSurfaceMat);
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.y = 1.8;
    waterSurface.renderOrder = 15;
    scene.add(waterSurface);

    // 3.3 Partículas subaquáticas sutis em suspensão
    const moteCount = 95;
    const motePos = new Float32Array(moteCount * 3);
    const moteSeed = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3 + 0] = (Math.random() - 0.5) * 38;
      motePos[i * 3 + 1] = -2.5 + Math.random() * 3.8;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 24;
      moteSeed[i] = Math.random() * 6.2831;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));

    const moteUniforms = { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } };
    const moteMat = new THREE.ShaderMaterial({
      uniforms: moteUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.25 + aSeed) * 0.45;
          p.z += cos(uTime * 0.21 + aSeed * 1.3) * 0.45;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.2 + 1.4 * sin(uTime * 0.8 + aSeed)) * uPixelRatio;
          vAlpha = 0.08 + 0.09 * (0.5 + 0.5 * sin(uTime * 0.7 + aSeed * 2.0));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float soft = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(0.55, 0.90, 0.98, soft * vAlpha);
        }
      `
    });
    scene.add(new THREE.Points(moteGeo, moteMat));

    return {
      CAUSTICS_GLSL,
      spawnRipple,
      pondBottomUniforms,
      waterSurfaceUniforms,
      moteUniforms
    };
  }

  window.KoiEnvironment = { createEnvironment };
})();
