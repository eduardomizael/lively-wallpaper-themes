(() => {
  'use strict';

  function createEnvironment({ scene, params, renderer, getClockTime }) {
    // =========================================================================
    // 3. SHADERS DE ÁGUA, FUNDO ARENOSO, CÁUSTICAS E RAIOS DE LUZ
    // =========================================================================
    const MAX_RIPPLES = 18;
    const rippleData = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(999, 999, -99, 0));
    let rippleIndex = 0;

    function spawnRipple(x, z, strength = 1.0) {
      rippleData[rippleIndex].set(x, z, getClockTime(), strength);
      rippleIndex = (rippleIndex + 1) % MAX_RIPPLES;
    }

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
        return pow(clamp(1.0 - smoothstep(0.0, 0.24, edge), 0.0, 1.0), 2.1);
      }

      float layeredCaustics(vec2 worldXZ, float t) {
        vec2 p1 = worldXZ * 0.36 + vec2(t * 0.042, -t * 0.028);
        vec2 p2 = worldXZ * 0.55 + vec2(-t * 0.034, t * 0.039);
        p1 += 0.16 * vec2(sin(worldXZ.y * 0.42 + t * 0.55), cos(worldXZ.x * 0.39 - t * 0.48));
        p2 += 0.12 * vec2(cos(worldXZ.y * 0.54 - t * 0.50), sin(worldXZ.x * 0.48 + t * 0.45));
        float c1 = voronoiCaustic(p1, t * 0.82);
        float c2 = voronoiCaustic(p2 + vec2(3.7, 1.9), t * 1.02);
        return c1 * 0.60 + c2 * 0.54 + (c1 * c2) * 0.90;
      }

      float rippleField(vec2 worldXZ, float t, vec4 ripples[18]) {
        float sum = 0.0;
        for (int i = 0; i < 18; i++) {
          float age = t - ripples[i].z;
          if (age > 0.0 && age < 4.0 && ripples[i].w > 0.001) {
            float dist = length(worldXZ - ripples[i].xy);
            float radius = age * 2.6;
            float ring = exp(-pow((dist - radius) * 1.7, 2.0));
            float wave = sin((dist - radius) * 10.5);
            float fade = exp(-age * 1.1) * ripples[i].w;
            sum += ring * (0.55 + 0.45 * wave) * fade;
          }
        }
        return sum;
      }
    `;

    // 3.1 Fundo aquático panorâmico
    const backdropUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity }
    };
    const backdropMat = new THREE.ShaderMaterial({
      uniforms: backdropUniforms,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uCausticsIntensity;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 deepBottom = vec3(0.022, 0.145, 0.175);
          vec3 midEmerald = vec3(0.062, 0.305, 0.325);
          vec3 upperTurquoise = vec3(0.155, 0.495, 0.485);

          vec3 col = mix(deepBottom, midEmerald, smoothstep(0.08, 0.56, vUv.y));
          col = mix(col, upperTurquoise, smoothstep(0.54, 0.98, vUv.y));

          // Bokeh suave de fundo subaquático (vegetação e reflexos distantes)
          float bokeh1 = noise2(vec2(vUv.x * 7.2 + sin(uTime * 0.08) * 0.12, vUv.y * 4.2));
          float bokeh2 = noise2(vec2(vUv.x * 13.5 - uTime * 0.018, vUv.y * 7.5));
          float haze = smoothstep(0.14, 0.70, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          col += vec3(0.07, 0.16, 0.14) * pow(bokeh1 * 0.65 + bokeh2 * 0.35, 2.0) * haze * 0.55;

          float topGlow = pow(smoothstep(0.56, 1.0, vUv.y), 1.7);
          col += vec3(0.14, 0.36, 0.35) * topGlow * (0.55 + 0.45 * uCausticsIntensity * 0.55);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(86, 44), backdropMat);
    backdrop.position.set(0, 2.5, -20);
    backdrop.renderOrder = -10;
    scene.add(backdrop);

    // 3.2 Leito arenoso/cascalho com ondulações e cáusticas
    const RIVERBED_Y = -3.2;
    const riverbedUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity },
      uRipples: { value: rippleData }
    };

    const riverbedGeo = new THREE.PlaneGeometry(78, 50, 88, 56);
    riverbedGeo.rotateX(-Math.PI / 2);
    const rbPos = riverbedGeo.attributes.position;
    for (let i = 0; i < rbPos.count; i++) {
      const x = rbPos.getX(i);
      const z = rbPos.getZ(i);
      const dune = Math.sin(x * 0.36 + z * 0.20) * 0.13 + Math.cos(x * 0.18 - z * 0.42) * 0.09;
      rbPos.setY(i, dune);
    }
    riverbedGeo.computeVertexNormals();

    const riverbedMat = new THREE.ShaderMaterial({
      uniforms: riverbedUniforms,
      depthWrite: true,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uCausticsIntensity;
        uniform vec4 uRipples[18];
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        ${CAUSTICS_GLSL}

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec2 xz = vWorldPos.xz;
          float n1 = valueNoise(xz * 0.55);
          float n2 = valueNoise(xz * 1.9);
          float grit = valueNoise(xz * 6.8) * 0.58 + valueNoise(xz * 15.0) * 0.42;

          vec3 sandWarm = vec3(0.47, 0.53, 0.44);
          vec3 sandCool = vec3(0.24, 0.39, 0.38);
          vec3 siltDark = vec3(0.11, 0.23, 0.25);

          vec3 base = mix(sandCool, sandWarm, n1 * 0.65 + n2 * 0.35);
          base = mix(base, siltDark, smoothstep(0.62, 0.92, n2) * 0.42);
          base *= (0.87 + 0.24 * grit);

          vec3 L = normalize(vec3(-0.32, 1.0, 0.20));
          float diff = 0.62 + 0.38 * max(dot(normalize(vWorldNormal), L), 0.0);
          base *= diff;

          float rip = rippleField(xz, uTime, uRipples);
          vec2 refrXZ = xz + vec2(rip * 0.12, -rip * 0.10);
          float cR = layeredCaustics(refrXZ + vec2(0.05, 0.02), uTime);
          float cG = layeredCaustics(refrXZ, uTime);
          float cB = layeredCaustics(refrXZ - vec2(0.05, 0.02), uTime);
          vec3 causticCol = vec3(cR * 0.72, cG * 1.02, cB * 0.94);

          float distCenter = length(xz * vec2(0.065, 0.095));
          float lightPool = exp(-distCenter * distCenter * 0.92);
          base += causticCol * 0.32 * (0.28 + 0.72 * lightPool) * uCausticsIntensity;
          base += vec3(0.26, 0.58, 0.56) * rip * 0.22 * uCausticsIntensity;

          float camDist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-pow(camDist * 0.028, 2.0));
          vec3 waterFog = vec3(0.042, 0.220, 0.250);
          vec3 col = mix(base, waterFog, clamp(fogFactor, 0.0, 0.94));

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const riverbed = new THREE.Mesh(riverbedGeo, riverbedMat);
    riverbed.position.y = RIVERBED_Y;
    scene.add(riverbed);

    // 3.3 Algas subaquáticas (Vallisneria / fita-d'água) balançando na correnteza (ligável/desligável)
    const algaeUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity },
      uFishPos: { value: new THREE.Vector3(0, 0, 0) },
      uFishPos2: { value: new THREE.Vector3(99, 0, 99) }
    };

    function createAlgaeField() {
      const positions = [];
      const uvs = [];
      const roots = [];
      const paramsAttr = []; // (height, phase, tint)
      const indices = [];

      // Touceiras orgânicas distribuídas ao fundo e laterais, mantendo o centro livre para o tucunaré
      const clusters = [
        { x: -10.5, z: -5.8, count: 16, hMin: 1.8, hMax: 3.4 },
        { x: -8.2,  z: -6.4, count: 18, hMin: 2.0, hMax: 3.8 },
        { x: -5.4,  z: -6.9, count: 15, hMin: 1.7, hMax: 3.3 },
        { x: -2.6,  z: -7.4, count: 14, hMin: 1.5, hMax: 2.9 },
        { x:  0.8,  z: -7.6, count: 13, hMin: 1.6, hMax: 3.0 },
        { x:  4.2,  z: -7.1, count: 16, hMin: 1.9, hMax: 3.6 },
        { x:  7.4,  z: -6.2, count: 18, hMin: 2.0, hMax: 3.9 },
        { x: 10.4,  z: -5.4, count: 15, hMin: 1.8, hMax: 3.4 },
        // Touceiras menores nas bordas intermediárias para paralaxe isométrica
        { x: -9.8,  z: -2.2, count: 10, hMin: 1.1, hMax: 2.1 },
        { x: -8.6,  z:  1.4, count: 9,  hMin: 0.9, hMax: 1.7 },
        { x:  9.6,  z: -2.0, count: 10, hMin: 1.2, hMax: 2.2 },
        { x:  8.5,  z:  1.6, count: 9,  hMin: 0.9, hMax: 1.7 },
        { x: -4.2,  z: -4.5, count: 8,  hMin: 1.0, hMax: 1.9 },
        { x:  4.8,  z: -4.6, count: 9,  hMin: 1.1, hMax: 2.0 }
      ];

      let vertOffset = 0;
      const segs = 10;

      // Gerador determinístico simples para layout consistente
      let seed = 1337;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      clusters.forEach(cl => {
        for (let b = 0; b < cl.count; b++) {
          const ang = rand() * Math.PI * 2;
          // Raízes mais agrupadas em touceiras naturais que abrem em leque para cima
          const dist = Math.pow(rand(), 0.75) * 0.52;
          const rx = cl.x + Math.cos(ang) * dist;
          const rz = cl.z + Math.sin(ang) * dist * 0.72;
          const ry = RIVERBED_Y + Math.sin(rx * 0.36 + rz * 0.20) * 0.13 + Math.cos(rx * 0.18 - rz * 0.42) * 0.09 - 0.06;

          const height = cl.hMin + rand() * (cl.hMax - cl.hMin);
          const baseWidth = 0.15 + rand() * 0.09;
          const archDir = ang + (rand() - 0.5) * 0.8;
          const yaw = rand() * Math.PI * 2;
          const archStrength = 0.35 + rand() * 0.55;
          const twistRate = (rand() - 0.5) * 1.4;
          const phase = rand() * Math.PI * 2;
          const tint = rand();

          for (let s = 0; s <= segs; s++) {
            const v = s / segs;
            // Fita larga de Vallisneria que afina suavemente só no terço final
            const w = baseWidth * (1.0 - Math.pow(v, 2.2) * 0.82);
            // Curvatura graciosa em arco/S para fora da touceira
            const archOut = (Math.pow(v, 1.55) * archStrength + Math.sin(v * Math.PI * 1.35) * 0.14) * height * 0.44;
            const y = ry + v * height * (1.0 - 0.14 * archStrength * v * v);

            const localYaw = yaw + twistRate * v;
            const cosY = Math.cos(localYaw), sinY = Math.sin(localYaw);
            const cx = rx + Math.cos(archDir) * archOut;
            const cz = rz + Math.sin(archDir) * archOut * 0.75;

            for (let side = 0; side < 2; side++) {
              const u = side;
              const localX = (side === 0 ? -0.5 : 0.5) * w;
              const px = cx + localX * cosY;
              const pz = cz + localX * sinY;

              positions.push(px, y, pz);
              uvs.push(u, v);
              roots.push(rx, ry, rz);
              paramsAttr.push(height, phase, tint);
            }
          }

          for (let s = 0; s < segs; s++) {
            const a = vertOffset + s * 2;
            const b1 = a + 1;
            const c = a + 2;
            const d = a + 3;
            indices.push(a, c, b1);
            indices.push(b1, c, d);
          }
          vertOffset += (segs + 1) * 2;
        }
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute('aRoot', new THREE.Float32BufferAttribute(roots, 3));
      geo.setAttribute('aParams', new THREE.Float32BufferAttribute(paramsAttr, 3));
      geo.setIndex(indices);

      const mat = new THREE.ShaderMaterial({
        uniforms: algaeUniforms,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: true,
        vertexShader: /* glsl */ `
          attribute vec3 aRoot;
          attribute vec3 aParams;
          uniform float uTime;
          uniform vec3 uFishPos;
          uniform vec3 uFishPos2;

          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying float vTint;

          void main() {
            vUv = uv;
            vTint = aParams.z;
            float h = aParams.x;
            float phase = aParams.y;
            float v = uv.y;

            vec3 p = position;
            // Balanço fluido em múltiplas frequências simulando correnteza subaquática
            float swayMain = sin(uTime * 1.15 + phase + v * 2.2) * 0.24;
            float swayFine = sin(uTime * 2.35 + phase * 1.7 + v * 4.1) * 0.065;
            float swayZ = cos(uTime * 0.92 + phase * 1.3 + v * 2.0) * 0.14;
            float bend = v * v * (0.45 + 0.55 * (h / 3.0));
            p.x += (swayMain + swayFine) * bend;
            p.z += swayZ * bend;
            // Compensa levemente a altura ao inclinar para manter o comprimento natural da folha
            p.y -= abs(swayMain) * bend * 0.16;

            // Leve afastamento na esteira quando qualquer tucunaré passa perto
            vec2 toBlade = p.xz - uFishPos.xz;
            float fDist = length(toBlade);
            if (fDist < 2.8 && fDist > 0.001) {
              float push = (1.0 - fDist / 2.8) * 0.35 * v * v;
              p.xz += (toBlade / fDist) * push;
            }
            vec2 toBlade2 = p.xz - uFishPos2.xz;
            float fDist2 = length(toBlade2);
            if (fDist2 < 2.8 && fDist2 > 0.001) {
              float push2 = (1.0 - fDist2 / 2.8) * 0.35 * v * v;
              p.xz += (toBlade2 / fDist2) * push2;
            }

            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uCausticsIntensity;
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying float vTint;

          ${CAUSTICS_GLSL}

          void main() {
            // Borda levemente suave nas extremidades da fita
            float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x) * smoothstep(1.0, 0.92, vUv.y);
            if (edge < 0.05) discard;

            // Nervura central discreta e variação natural de verde-oliva/esmeralda amazônico
            float vein = exp(-pow((vUv.x - 0.5) * 9.0, 2.0));
            vec3 rootCol = vec3(0.08, 0.20, 0.14);
            vec3 midCol = mix(vec3(0.14, 0.34, 0.19), vec3(0.22, 0.42, 0.20), vTint);
            vec3 tipCol = mix(vec3(0.32, 0.54, 0.25), vec3(0.46, 0.62, 0.28), vTint);

            vec3 col = mix(rootCol, midCol, smoothstep(0.0, 0.45, vUv.y));
            col = mix(col, tipCol, smoothstep(0.42, 1.0, vUv.y));
            col *= (0.90 + 0.18 * vein);

            // Translucidez iluminada de cima + cáusticas suaves
            float topLight = 0.55 + 0.45 * vUv.y;
            col *= topLight;
            float c = layeredCaustics(vWorldPos.xz * 0.95, uTime);
            col += vec3(0.36, 0.78, 0.62) * c * 0.16 * uCausticsIntensity * (0.3 + 0.7 * vUv.y);

            // Neblina subaquática combinando com o leito arenoso
            float camDist = length(cameraPosition - vWorldPos);
            float fogF = 1.0 - exp(-pow(camDist * 0.029, 2.0));
            vec3 waterFog = vec3(0.042, 0.220, 0.250);
            col = mix(col, waterFog, clamp(fogF, 0.0, 0.92));

            gl_FragColor = vec4(col, edge * 0.94);
          }
        `
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2;
      mesh.visible = params.showAlgae;
      scene.add(mesh);
      return mesh;
    }

    const algaeMesh = createAlgaeField();

    // 3.4 Superfície da água superior
    const waterSurfaceUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity },
      uRipples: { value: rippleData }
    };
    const waterSurfaceMat = new THREE.ShaderMaterial({
      uniforms: waterSurfaceUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
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
        uniform vec4 uRipples[18];
        varying vec2 vWorldXZ;

        ${CAUSTICS_GLSL}

        void main() {
          float c = layeredCaustics(vWorldXZ * 0.95 + vec2(1.4, -1.2), uTime * 1.15);
          float rip = rippleField(vWorldXZ, uTime, uRipples);
          float distFade = exp(-dot(vWorldXZ * vec2(0.055, 0.075), vWorldXZ * vec2(0.055, 0.075)));
          float shimmer = pow(c, 1.45) * 0.22 * uCausticsIntensity * distFade;
          float ripGlow = rip * 0.28 * distFade;
          vec3 col = vec3(0.45, 0.88, 0.86) * shimmer + vec3(0.65, 0.96, 0.94) * ripGlow;
          gl_FragColor = vec4(col, clamp(shimmer + ripGlow, 0.0, 0.55));
        }
      `
    });
    const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), waterSurfaceMat);
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.y = 3.35;
    waterSurface.renderOrder = 16;
    scene.add(waterSurface);

    // 3.5 Raios de luz solar volumétricos
    const sunbeamUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: params.sunbeamsIntensity }
    };
    const sunbeamMat = new THREE.ShaderMaterial({
      uniforms: sunbeamUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float beam = pow(max(0.0, sin(vUv.x * 3.14159)), 2.2);
          float wave = 0.65 + 0.35 * sin(vUv.x * 9.0 + uTime * 0.52) * cos(vUv.y * 3.0 - uTime * 0.34);
          float vertFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
          float alpha = beam * wave * vertFade * 0.075 * uIntensity;
          vec3 col = mix(vec3(0.28, 0.78, 0.76), vec3(0.70, 0.96, 0.86), vUv.y);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    [
      { x: -7.5, y: 0.6, z: -6.5, w: 3.4, h: 11.5, rz: -0.24 },
      { x: -3.2, y: 0.8, z: -5.2, w: 4.2, h: 12.0, rz: -0.22 },
      { x: 1.4,  y: 0.7, z: -6.0, w: 3.8, h: 11.8, rz: -0.23 },
      { x: 5.2,  y: 0.6, z: -7.2, w: 3.2, h: 11.2, rz: -0.25 }
    ].forEach(b => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), sunbeamMat);
      m.position.set(b.x, b.y, b.z);
      m.rotation.z = b.rz;
      m.renderOrder = 12;
      scene.add(m);
    });

    // 3.6 Partículas subaquáticas em suspensão
    const moteCount = 115;
    const motePos = new Float32Array(moteCount * 3);
    const moteSeed = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3 + 0] = (Math.random() - 0.5) * 28;
      motePos[i * 3 + 1] = -2.6 + Math.random() * 5.6;
      motePos[i * 3 + 2] = -8.0 + Math.random() * 14.0;
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
          p.x += sin(uTime * 0.22 + aSeed) * 0.42;
          p.y += cos(uTime * 0.18 + aSeed * 1.4) * 0.24;
          p.z += cos(uTime * 0.19 + aSeed * 0.9) * 0.35;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + 1.3 * sin(uTime * 0.75 + aSeed)) * uPixelRatio;
          vAlpha = 0.09 + 0.09 * (0.5 + 0.5 * sin(uTime * 0.65 + aSeed * 2.0));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float soft = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(0.70, 0.95, 0.89, soft * vAlpha);
        }
      `
    });
    scene.add(new THREE.Points(moteGeo, moteMat));

    const hemiLight = new THREE.HemisphereLight(0xb2f4ea, 0x0e3438, 1.35);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xfff4dd, 1.25);
    dirLight.position.set(-7, 16, 7);
    scene.add(dirLight);


    return {
      CAUSTICS_GLSL,
      RIVERBED_Y,
      spawnRipple,
      backdropUniforms,
      riverbedUniforms,
      algaeUniforms,
      algaeMesh,
      waterSurfaceUniforms,
      sunbeamUniforms,
      moteUniforms
    };
  }

  window.LagoonEnvironment = { createEnvironment };
})();
