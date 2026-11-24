(() => {
  'use strict';

  // Lambari-do-rabo-amarelo (Astyanax altiparanae / Astyanax lacustris)
  // Corpo alongado, comprimido lateralmente, flancos prateados brilhantes,
  // mancha umeral escura, faixa lateral prateada e cauda bifurcada amarelada.
  const HEAD_Z = 1.10;
  const BODY_LENGTH = 2.20;
  const EYE_Z = 0.86;
  const EYE_Y = 0.082;

  // [t, dorsoY, ventreY, meiaLarguraX] do focinho (t=0) ao pedúnculo (t=1)
  const BODY_PROFILE = [
    [0.000,  0.025, -0.055, 0.032],
    [0.035,  0.108, -0.115, 0.072],
    [0.095,  0.205, -0.185, 0.112],
    [0.185,  0.305, -0.255, 0.146],
    [0.310,  0.372, -0.310, 0.168],
    [0.450,  0.382, -0.320, 0.165],
    [0.600,  0.325, -0.278, 0.140],
    [0.745,  0.228, -0.202, 0.102],
    [0.875,  0.128, -0.118, 0.064],
    [0.955,  0.092, -0.088, 0.042],
    [1.000,  0.084, -0.082, 0.000]
  ];

  function profile(t, component) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    let i = 0;
    while (i < BODY_PROFILE.length - 2 && t > BODY_PROFILE[i + 1][0]) i++;
    const left = BODY_PROFILE[i];
    const right = BODY_PROFILE[i + 1];
    const prev = BODY_PROFILE[Math.max(0, i - 1)];
    const next = BODY_PROFILE[Math.min(BODY_PROFILE.length - 1, i + 2)];
    const span = Math.max(0.0001, right[0] - left[0]);
    const u = (t - left[0]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    const leftSlope = (right[component] - prev[component]) / Math.max(0.0001, right[0] - prev[0]);
    const rightSlope = (next[component] - left[component]) / Math.max(0.0001, next[0] - left[0]);
    return (2 * u3 - 3 * u2 + 1) * left[component]
      + (u3 - 2 * u2 + u) * leftSlope * span
      + (-2 * u3 + 3 * u2) * right[component]
      + (u3 - u2) * rightSlope * span;
  }

  function surface(lengthSteps, widthSteps, sample) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const stride = widthSteps + 1;
    for (let i = 0; i <= lengthSteps; i++) {
      for (let j = 0; j <= widthSteps; j++) {
        const u = i / lengthSteps;
        const v = j / widthSteps;
        positions.push(...sample(u, v));
        uvs.push(u, v);
        if (i < lengthSteps && j < widthSteps) {
          const a = i * stride + j;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function bodyGeometry() {
    return surface(48, 22, (t, v) => {
      const top = profile(t, 1);
      const bottom = profile(t, 2);
      const halfW = profile(t, 3);
      const angle = v * Math.PI * 2.0; // 0 = dorso, PI = ventre
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const midY = (top + bottom) * 0.5;
      const halfH = (top - bottom) * 0.5;
      const y = midY + cosA * halfH;
      const xShape = Math.sign(sinA) * Math.pow(Math.abs(sinA), 0.86);
      const x = xShape * halfW;
      const z = HEAD_Z - t * BODY_LENGTH;
      return [x, y, z];
    });
  }

  function tailGeometry() {
    return surface(14, 22, (u, v) => {
      const side = 2 * v - 1; // -1..1
      const lobe = Math.abs(side);
      // Cauda bem bifurcada típica de lambari
      const reach = 0.26 + 0.58 * Math.pow(lobe, 0.88) - 0.14 * Math.pow(lobe, 8.0);
      const y = side * (0.072 + Math.pow(u, 0.85) * 0.34);
      const z = -1.06 - u * reach;
      const x = 0.010 * Math.sin(2.0 * Math.PI * v) * u;
      return [x, y, z];
    });
  }

  function medianFin(startZ, endZ, upper, height, peak, sweep) {
    return surface(16, 8, (u, v) => {
      const z = THREE.MathUtils.lerp(startZ, endZ, u);
      const t = (HEAD_Z - z) / BODY_LENGTH;
      const baseY = profile(t, upper ? 1 : 2) * 0.92;
      const rise = THREE.MathUtils.smoothstep(u, 0, peak);
      const fall = 1 - THREE.MathUtils.smoothstep(u, peak, 1);
      const reach = height * Math.pow(Math.max(0, rise * fall), 0.55) * v;
      return [
        0.008 * Math.sin(Math.PI * u) * reach,
        baseY + (upper ? reach : -reach),
        z - reach * sweep * (0.85 + 0.35 * u)
      ];
    });
  }

  function pairedFin(side) {
    return surface(10, 8, (u, v) => {
      const reach = Math.pow(u, 0.9);
      const fan = Math.sin(v * Math.PI);
      return [
        side * (0.125 + reach * (0.14 + fan * 0.05)),
        -0.155 + reach * (0.08 * v - 0.085),
        0.54 - reach * (0.34 + 0.14 * v)
      ];
    });
  }

  const SWIM_VERTEX = /* glsl */ `
    uniform float uSwimPhase;
    uniform float uTailAmp;
    uniform float uSpineCurve;
    varying vec3 vLocal;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec2 vTex;

    float sway(float z) {
      float s = clamp((1.10 - z) / 2.88, 0.0, 1.0);
      float bodyWave = sin(uSwimPhase - s * 4.85);
      float envelope = 0.06 + 0.94 * pow(max(0.0, s - 0.05) / 0.95, 1.38);
      float headRecoil = sin(uSwimPhase + 1.1) * 0.15 * (1.0 - smoothstep(0.0, 0.30, s));
      float swim = (bodyWave * envelope + headRecoil) * uTailAmp;
      float ds = s - 0.25;
      float bend = uSpineCurve * (ds * ds) * 1.95;
      return swim + bend;
    }

    void main() {
      vTex = uv;
      vLocal = position;
      vec3 p = position;
      p.x += sway(p.z);
      float slope = (sway(p.z + 0.04) - sway(p.z - 0.04)) / 0.08;
      float angle = atan(slope);
      float c = cos(angle);
      float sn = sin(angle);
      vec3 n = normalize(vec3(normal.x * c + normal.z * sn, normal.y, -normal.x * sn + normal.z * c));
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;

  const WATER_LIGHT = /* glsl */ `
    uniform float uTime;
    uniform float uCausticsIntensity;
    uniform float uInjury;
    varying vec3 vLocal;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec2 vTex;

    const vec3 keyLight = vec3(-0.328, 0.820, 0.467);

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise2D(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f *= f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x),
        f.y
      );
    }

    vec3 throughWater(vec3 color, vec3 N) {
      float rays = layeredCaustics(vWorld.xz * 1.12, uTime * 1.05);
      color += vec3(0.42, 0.76, 0.74) * rays * 0.16 * uCausticsIntensity * smoothstep(-0.3, 0.78, N.y);
      float dist = length(cameraPosition - vWorld);
      float water = clamp((dist - 8.0) * 0.009, 0.02, 0.24);
      return mix(color, vec3(0.06, 0.265, 0.287), water);
    }
  `;

  const SKIN_FRAG = /* glsl */ `
    void main() {
      float t = vTex.x;
      float y = vLocal.y;
      float z = vLocal.z;
      float mottling = noise2D(vLocal.zy * vec2(12.0, 14.0));

      // Paleta clássica de lambari: dorso oliva-esverdeado, flanco prateado vivo e ventre claro
      vec3 backCol = vec3(0.20, 0.31, 0.24);
      vec3 silverCol = vec3(0.76, 0.83, 0.84);
      vec3 bellyCol = vec3(0.86, 0.90, 0.88);

      float dorsalMask = smoothstep(0.04, 0.30, y);
      float bellyMask = 1.0 - smoothstep(-0.24, -0.04, y);
      vec3 color = mix(silverCol, backCol, dorsalMask * 0.92);
      color = mix(color, bellyCol, bellyMask * 0.65);

      // Faixa lateral prateada-iridescente brilhante
      float lateralBand = exp(-pow((y - 0.015) / 0.085, 2.0)) * smoothstep(0.18, 0.34, t) * (1.0 - smoothstep(0.92, 1.0, t));
      color = mix(color, vec3(0.90, 0.96, 0.98), lateralBand * 0.52);

      // Mancha umeral escura característica atrás do opérculo
      vec2 humeral = (vLocal.zy - vec2(0.42, 0.06)) / vec2(0.11, 0.095);
      float humeralSpot = exp(-dot(humeral, humeral));
      color = mix(color, vec3(0.09, 0.13, 0.13), humeralSpot * 0.68);

      // Mancha escura no pedúnculo caudal
      vec2 caudal = (vLocal.zy - vec2(-0.92, 0.00)) / vec2(0.16, 0.075);
      float caudalSpot = exp(-dot(caudal, caudal));
      color = mix(color, vec3(0.10, 0.13, 0.14), caudalSpot * 0.72);

      // Linha do opérculo
      float gillZ = 0.62 + 0.55 * y * y;
      float gill = exp(-pow((z - gillZ) / 0.022, 2.0)) * smoothstep(-0.20, -0.05, y) * (1.0 - smoothstep(0.12, 0.24, y));
      color = mix(color, vec3(0.24, 0.29, 0.28), gill * 0.45);

      // Escamas finas cintilantes
      vec2 scGrid = vec2(t * 62.0, vTex.y * 44.0);
      vec2 scCell = fract(scGrid);
      float scShine = exp(-dot(scCell - 0.5, scCell - 0.5) * 14.0) * (1.0 - dorsalMask * 0.55);
      color += vec3(0.12, 0.15, 0.16) * scShine * (0.5 + 0.5 * mottling);

      // Marcas de mordida / ferimento sangrento quando atacado
      if (uInjury > 0.01) {
        float w1 = exp(-dot((vLocal.zy - vec2(0.05, -0.02)) / vec2(0.28, 0.17), (vLocal.zy - vec2(0.05, -0.02)) / vec2(0.28, 0.17)));
        float w2 = exp(-dot((vLocal.zy - vec2(-0.38, 0.04)) / vec2(0.24, 0.15), (vLocal.zy - vec2(-0.38, 0.04)) / vec2(0.24, 0.15)));
        float woundNoise = 0.65 + 0.55 * mottling;
        float wound = clamp((w1 + w2 * smoothstep(0.35, 0.85, uInjury)) * woundNoise * uInjury * 1.45, 0.0, 0.95);
        vec3 bloodCol = mix(vec3(0.55, 0.03, 0.04), vec3(0.28, 0.01, 0.02), wound);
        color = mix(color, bloodCol, wound);
      }

      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 H = normalize(V + keyLight);
      float hemi = 0.72 + 0.28 * (0.5 + 0.5 * N.y);
      float diff = max(dot(N, keyLight), 0.0);
      float spec = pow(max(dot(N, H), 0.0), 42.0) * (0.45 + lateralBand * 0.55);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);
      color *= hemi + 0.42 * diff;
      color += vec3(0.92, 0.98, 1.0) * spec + vec3(0.30, 0.58, 0.62) * rim * 0.24;
      gl_FragColor = vec4(throughWater(color, N), 1.0);
    }
  `;

  const FIN_FRAG = /* glsl */ `
    uniform vec3 uBase;
    uniform vec3 uOuter;
    uniform float uRadial;

    void main() {
      float reach = mix(vTex.y, vTex.x, uRadial);
      float across = mix(vTex.x, vTex.y, uRadial);
      float rays = 0.85 + 0.22 * sin(across * 46.0);
      vec3 color = mix(uBase, uOuter, smoothstep(0.15, 0.88, reach)) * rays;
      vec3 N = normalize(vNormal);
      float alpha = (0.58 - reach * 0.26) * smoothstep(0.0, 0.06, across) * (1.0 - smoothstep(0.94, 1.0, across));
      gl_FragColor = vec4(throughWater(color, N), alpha);
    }
  `;

  const EYE_FRAG = /* glsl */ `
    uniform float uSide;
    uniform vec3 uEyeCenter;

    void main() {
      vec3 sp = normalize((vLocal - uEyeCenter) * vec3(1.35, 1.0, 1.0));
      vec3 gaze = normalize(vec3(uSide * 0.94, 0.06, 0.32));
      float r = acos(clamp(dot(sp, gaze), -1.0, 1.0));
      vec3 col = mix(vec3(0.74, 0.79, 0.76), vec3(0.90, 0.86, 0.62), 1.0 - smoothstep(0.45, 0.72, r));
      col = mix(col, vec3(0.015, 0.02, 0.025), 1.0 - smoothstep(0.38, 0.46, r));
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      float spec = pow(max(dot(N, normalize(keyLight + V)), 0.0), 72.0);
      col += vec3(0.92, 0.97, 1.0) * spec * 0.85;
      gl_FragColor = vec4(throughWater(col, N), 1.0);
    }
  `;

  let sharedGeos = null;
  function getSharedGeometries() {
    if (sharedGeos) return sharedGeos;
    sharedGeos = {
      body: bodyGeometry(),
      tail: tailGeometry(),
      dorsal: medianFin(0.18, -0.34, true, 0.28, 0.26, 0.75),
      anal: medianFin(-0.30, -0.82, false, 0.20, 0.30, 0.80),
      pectL: pairedFin(1),
      pectR: pairedFin(-1),
      eyeL: new THREE.SphereGeometry(0.068, 16, 12).scale(0.68, 1, 1).translate(0.095, EYE_Y, EYE_Z),
      eyeR: new THREE.SphereGeometry(0.068, 16, 12).scale(0.68, 1, 1).translate(-0.095, EYE_Y, EYE_Z)
    };
    return sharedGeos;
  }

  function createLambariModel(causticsGLSL, sceneUniforms) {
    const geos = getSharedGeometries();
    const group = new THREE.Group();
    group.name = 'Lambari';
    const baseUniforms = {
      uSwimPhase: { value: 0 },
      uTailAmp: { value: 0.14 },
      uSpineCurve: { value: 0 },
      uInjury: { value: 0 },
      ...sceneUniforms
    };

    function addPart(name, geo, frag, extraUniforms = {}, transparent = false) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...baseUniforms, ...extraUniforms },
        vertexShader: SWIM_VERTEX,
        fragmentShader: causticsGLSL + WATER_LIGHT + frag,
        side: transparent ? THREE.DoubleSide : THREE.FrontSide,
        transparent,
        depthWrite: !transparent
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.frustumCulled = false;
      group.add(m);
    }

    addPart('Corpo', geos.body, SKIN_FRAG);
    // Cauda amarelada/alaranjada típica do lambari-do-rabo-amarelo
    addPart('Cauda', geos.tail, FIN_FRAG, {
      uBase: { value: new THREE.Vector3(0.86, 0.68, 0.18) },
      uOuter: { value: new THREE.Vector3(0.95, 0.56, 0.16) },
      uRadial: { value: 1.0 }
    }, true);
    addPart('Dorsal', geos.dorsal, FIN_FRAG, {
      uBase: { value: new THREE.Vector3(0.58, 0.66, 0.58) },
      uOuter: { value: new THREE.Vector3(0.76, 0.72, 0.42) },
      uRadial: { value: 0.0 }
    }, true);
    addPart('Anal', geos.anal, FIN_FRAG, {
      uBase: { value: new THREE.Vector3(0.72, 0.64, 0.36) },
      uOuter: { value: new THREE.Vector3(0.86, 0.56, 0.24) },
      uRadial: { value: 0.0 }
    }, true);

    for (const side of [-1, 1]) {
      addPart('Peitoral', side > 0 ? geos.pectL : geos.pectR, FIN_FRAG, {
        uBase: { value: new THREE.Vector3(0.74, 0.78, 0.72) },
        uOuter: { value: new THREE.Vector3(0.84, 0.72, 0.44) },
        uRadial: { value: 1.0 }
      }, true);
      addPart('Olho', side > 0 ? geos.eyeL : geos.eyeR, EYE_FRAG, {
        uSide: { value: side },
        uEyeCenter: { value: new THREE.Vector3(side * 0.095, EYE_Y, EYE_Z) }
      });
    }

    return group;
  }

  window.createLambariModel = createLambariModel;
})();
