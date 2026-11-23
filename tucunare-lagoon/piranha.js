(() => {
  'use strict';

  const HEAD_Z = 1.36;
  const BODY_LENGTH = 2.57;
  const EYE_Z = 1.046;
  const EYE_Y = 0.128;
  const MOUTH_END = 0.148;

  // Dorso, ventre e meia largura, do focinho ao pedúnculo.
  const BODY_PROFILE = [
    [0, 0.068, -0.342, 0.118],
    [0.018, 0.135, -0.377, 0.150],
    [0.050, 0.311, -0.434, 0.195],
    [0.100, 0.528, -0.496, 0.233],
    [0.178, 0.698, -0.608, 0.273],
    [0.289, 0.824, -0.704, 0.317],
    [0.420, 0.854, -0.770, 0.335],
    [0.532, 0.777, -0.751, 0.304],
    [0.650, 0.639, -0.700, 0.251],
    [0.770, 0.443, -0.546, 0.182],
    [0.883, 0.227, -0.273, 0.112],
    [0.965, 0.153, -0.158, 0.071],
    [1, 0.143, -0.153, 0]
  ];

  function profile(t, component) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    let i = 0;
    while (t > BODY_PROFILE[i + 1][0]) i++;
    const left = BODY_PROFILE[i];
    const right = BODY_PROFILE[i + 1];
    const previous = BODY_PROFILE[Math.max(0, i - 1)];
    const next = BODY_PROFILE[Math.min(BODY_PROFILE.length - 1, i + 2)];
    const span = right[0] - left[0];
    const u = (t - left[0]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    const leftSlope = (right[component] - previous[component]) / (right[0] - previous[0]);
    const rightSlope = (next[component] - left[component]) / (next[0] - left[0]);
    return (2 * u3 - 3 * u2 + 1) * left[component] + (u3 - 2 * u2 + u) * leftSlope * span +
      (-2 * u3 + 3 * u2) * right[component] + (u3 - u2) * rightSlope * span;
  }

  function mouthOpening(t) {
    return 1 - THREE.MathUtils.smoothstep(t, 0.012, MOUTH_END);
  }

  function gillZ(y) {
    return 0.656 + 0.88 * (y + 0.078) ** 2 + 0.08 * y;
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

  function cheekPoint(t, v, jaw) {
    const top = profile(t, 1);
    const bottom = profile(t, 2);
    const tFront = 1 - THREE.MathUtils.smoothstep(t, 0.01, 0.16);
    const lipBlend = 1 - THREE.MathUtils.smoothstep(t, MOUTH_END, 0.27);
    const opening = mouthOpening(t);
    const split = THREE.MathUtils.lerp((top + bottom) * 0.5, -0.123 - 0.96 * t, lipBlend);
    const lipY = split + (jaw > 0 ? 0.049 : -0.101) * opening;
    const angle = Math.PI * (v + (jaw < 0 ? 1 : 0));
    const sin = Math.abs(Math.sin(angle));
    const cos = Math.cos(angle);
    const rounding = Math.sqrt(1 - (1 - Math.min(1, t / 0.026)) ** 2);
    const edgeY = jaw > 0 ? top : bottom;
    const y = lipY + sin * (edgeY - lipY) * rounding;
    const shape = Math.sign(cos) * Math.abs(cos) ** 0.92;
    const zBase = HEAD_Z - t * BODY_LENGTH - 0.150 * tFront + (jaw < 0 ? 0.025 * opening : 0);
    const muzzle = (jaw > 0 ? 0.066 : 0.085) * rounding * (4 * sin * (1 - sin)) *
      (1 - THREE.MathUtils.smoothstep(t, 0.012, 0.067));
    const z = zBase + 0.036 * tFront * (1 - shape * shape) + muzzle;
    const lip = (jaw > 0 ? 0.013 : 0.022) * opening * (1 - sin) ** 3;
    const cheek = 0.032 * Math.exp(-(((z - gillZ(y) - 0.11) / 0.20) ** 2 + ((y + 0.09) / 0.38) ** 2));
    const gillFold = 0.013 * Math.exp(-(((z - gillZ(y)) / 0.039) ** 2 + ((y + 0.09) / 0.43) ** 2));
    const orbit = 0.031 * Math.exp(-(((z - EYE_Z) / 0.116) ** 2 + ((y - EYE_Y) / 0.102) ** 2));
    const x = shape * Math.max(0, profile(t, 3) + lip + cheek - gillFold - orbit);
    return [x, y, z];
  }

  function cheekGeometries() {
    const lengthSteps = 128;
    const widthSteps = 26;
    const upper = surface(lengthSteps, widthSteps, (t, v) => cheekPoint(t, v, 1));
    const lower = surface(lengthSteps, widthSteps, (t, v) => cheekPoint(t, v, -1));
    for (const [index, geo] of [upper, lower].entries()) {
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + index) * 0.5);
    }

    // Atrás da abertura, as duas superfícies têm a mesma posição e normal no flanco.
    const aNormals = upper.getAttribute('normal');
    const bNormals = lower.getAttribute('normal');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const average = new THREE.Vector3();
    const stride = widthSteps + 1;
    for (let i = 0; i <= lengthSteps; i++) {
      const join = THREE.MathUtils.smoothstep(i / lengthSteps, 0.112, MOUTH_END);
      for (const edge of [0, widthSteps]) {
        const aIndex = i * stride + edge;
        const bIndex = i * stride + widthSteps - edge;
        a.fromBufferAttribute(aNormals, aIndex);
        b.fromBufferAttribute(bNormals, bIndex);
        average.copy(a).add(b).normalize();
        a.lerp(average, join).normalize();
        b.lerp(average, join).normalize();
        aNormals.setXYZ(aIndex, a.x, a.y, a.z);
        bNormals.setXYZ(bIndex, b.x, b.y, b.z);
      }
    }
    return [upper, lower];
  }

  function palatePoint(t, lateral, jaw) {
    const [width, edgeY, edgeZ] = cheekPoint(t, jaw > 0 ? 0 : 1, jaw);
    const arch = 1 - lateral * lateral;
    const bow = 0.036 * (1 - THREE.MathUtils.smoothstep(t, 0.01, 0.16));
    const hollow = Math.sin(Math.PI * t / MOUTH_END) * 0.062;
    return [width * lateral, edgeY + jaw * arch * hollow, edgeZ + bow * arch];
  }

  function mouthGeometries() {
    return [1, -1].map(jaw =>
      surface(28, 28, (u, v) => palatePoint(u * MOUTH_END, jaw * (2 * v - 1), jaw)));
  }

  function teethGeometry() {
    const positions = [];
    const tri = (a, b, c) => positions.push(...a, ...b, ...c);

    function toothBase(span, jaw) {
      const angle = span * Math.PI * 0.5;
      const t = 0.006 + 0.101 * (1 - Math.cos(angle));
      return new THREE.Vector3(...palatePoint(t, 0.94 * Math.sin(angle), jaw));
    }

    for (const jaw of [1, -1]) {
      const count = jaw > 0 ? 9 : 8;
      for (let i = 0; i < count; i++) {
        const s = (2 * i / (count - 1) - 1) * (jaw > 0 ? 0.91 : 0.86);
        const distance = Math.abs(s);
        const base = toothBase(s, jaw);
        const tangent = toothBase(s + 0.01, jaw).sub(toothBase(s - 0.01, jaw));
        tangent.y = 0;
        tangent.normalize();
        const outward = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const width = THREE.MathUtils.lerp(0.018, 0.023, distance);
        const height = (jaw > 0 ? 0.075 : 0.065) * (1 - 0.50 * distance ** 2);
        base.addScaledVector(outward, -0.005);
        base.y += jaw * 0.009;
        const left = base.clone().addScaledVector(tangent, -width);
        const right = base.clone().addScaledVector(tangent, width);
        const tip = base.clone().addScaledVector(outward, -0.006);
        tip.y -= jaw * height;
        const back = base.clone().addScaledVector(outward, -0.017);
        back.y -= jaw * height * 0.24;

        if (jaw > 0) {
          tri(left, tip, right);
          tri(left, right, back);
          tri(right, tip, back);
          tri(tip, left, back);
        } else {
          tri(left, right, tip);
          tri(left, back, right);
          tri(right, back, tip);
          tri(tip, back, left);
        }
      }
    }

    const teeth = new THREE.BufferGeometry();
    teeth.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    teeth.computeVertexNormals();
    return teeth;
  }

  function medianFin(startZ, endZ, upper, height, peak, sweep, roundness) {
    return surface(34, 12, (u, v) => {
      const z = THREE.MathUtils.lerp(startZ, endZ, u);
      const t = (HEAD_Z - z) / BODY_LENGTH;
      const baseY = profile(t, upper ? 1 : 2) * 0.92;
      const rise = THREE.MathUtils.smoothstep(u, 0, peak);
      const fall = 1 - THREE.MathUtils.smoothstep(u, peak, 1);
      const reach = height * (rise * fall) ** roundness * v;
      return [0.019 * Math.sin(Math.PI * u) * reach, baseY + (upper ? reach : -reach),
        z - reach * sweep * (0.90 + 0.32 * u)];
    });
  }

  function tailGeometry() {
    return surface(28, 36, (u, v) => {
      const side = 2 * v - 1;
      const lobe = Math.abs(side);
      const reach = 0.71 + 0.43 * lobe ** 0.94 - 0.22 * lobe ** 10;
      const y = side * (0.129 + u ** 0.84 * (0.436 - side * 0.032));
      return [0.018 * Math.sin(2 * Math.PI * v) * u, y, -1.125 - u * reach * 0.88];
    });
  }

  function pairedFin(side, pelvic) {
    return surface(18, 14, (u, v) => {
      const reach = u ** 0.88;
      const fan = Math.sin(v * Math.PI);
      if (pelvic) {
        return [side * (0.159 + reach * (0.128 + fan * 0.053)), -0.592 - reach * (0.235 + fan * 0.125 - 0.131 * v),
          0.101 - reach * (0.15 + 0.32 * v) - v * 0.045];
      }
      return [side * (0.271 + reach * (0.112 + fan * 0.048)), -0.365 + reach * (0.174 * v - 0.094 - fan * 0.018),
        0.589 - reach * (0.55 + 0.23 * v) - v * 0.025];
    });
  }

  const SWIM_VERTEX = /* glsl */ `
    uniform float uTime;
    uniform float uSwimPhase;
    uniform float uTailAmp;
    uniform float uSpineCurve;
    varying vec3 vLocal;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec2 vTex;

    // Nado subcarangiforme realista de caracídeo (corpo alto):
    // onda contínua percorrendo o corpo da cabeça à cauda (~0.75 ciclo),
    // leve contrabalanço no focinho e flexão em arco C do corpo inteiro nas curvas.
    float sway(float z) {
      float s = clamp((1.36 - z) / 3.49, 0.0, 1.0);
      float bodyWave = sin(uSwimPhase - s * 4.45);
      float envelope = 0.055 + 0.945 * pow(max(0.0, s - 0.06) / 0.94, 1.48);
      float headRecoil = sin(uSwimPhase + 1.15) * 0.14 * (1.0 - smoothstep(0.0, 0.32, s));
      float swim = (bodyWave * envelope + headRecoil) * uTailAmp;
      float ds = s - 0.28;
      float bend = uSpineCurve * (ds * ds) * 1.85;
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
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
    }

    float bell(float x) {
      return exp(-x * x);
    }

    vec3 throughWater(vec3 color, vec3 N) {
      float rays = layeredCaustics(vWorld.xz * 1.05, uTime * 1.05);
      color += vec3(0.36, 0.68, 0.65) * rays * 0.15 * uCausticsIntensity *
        smoothstep(-0.34, 0.78, N.y);
      float distanceToCamera = length(cameraPosition - vWorld);
      float water = clamp((distanceToCamera - 8.0) * 0.009, 0.02, 0.24);
      return mix(color, vec3(0.06, 0.265, 0.287), water);
    }
  `;

  const SKIN = /* glsl */ `
    void main() {
      float t = vTex.x;
      float y = vLocal.y;
      float z = vLocal.z;
      vec2 flank = vLocal.zy;
      float head = 1.0 - smoothstep(0.205, 0.34, t);
      float tailRoot = smoothstep(0.89, 1.0, t);
      float mottling = noise2D(flank * vec2(8.5, 9.5));
      float detail = noise2D(flank * vec2(31.7, 26.6));
      float cloud = noise2D(flank * vec2(3.3, 3.6));

      vec3 silver = mix(vec3(0.425, 0.47, 0.465), vec3(0.69, 0.70, 0.65), cloud);
      float back = smoothstep(0.10, 0.83, y + (mottling - 0.5) * 0.14);
      vec3 color = mix(silver, vec3(0.170, 0.235, 0.236), back * 0.90);
      float redY = y + 0.12 * smoothstep(0.58, 0.87, t) + (mottling - 0.5) * 0.20;
      float throat = (1.0 - smoothstep(-0.32, -0.02, redY)) * (1.0 - smoothstep(0.69, 0.94, t));
      vec3 copper = mix(vec3(0.675, 0.152, 0.105), vec3(0.94, 0.374, 0.173),
        smoothstep(0.24, 0.82, cloud * 0.73 + mottling * 0.40));
      color = mix(color, copper, throat);
      color *= 0.94 + (mottling - 0.5) * 0.18 + (detail - 0.5) * 0.11;
      color = mix(color, vec3(0.35, 0.40, 0.38), tailRoot);

      // Escamas finas e reflexos isolados em fileiras que acompanham o volume.
      vec2 grid = vec2(t * 97.0, vTex.y * 76.0);
      vec2 wiggle = vec2(0.16 * sin(vTex.y * 12.56637), 0.0);
      grid += wiggle;
      float row = floor(grid.y);
      vec2 cellGrid = grid + vec2(mod(row, 2.0) * 0.5, 0.0);
      vec2 cell = floor(cellGrid);
      vec2 uvCell = fract(cellGrid);
      float arch = 0.69 - 0.92 * (uvCell.y - 0.5) * (uvCell.y - 0.5);
      float edgeDist = fract(uvCell.x - arch + 0.5) - 0.5;
      float ridge = bell(edgeDist / 0.092);
      float face = smoothstep(0.015, 0.40, -edgeDist);
      float seed = hash21(cell + 13.37);
      float fade = (1.0 - smoothstep(0.40, 0.97, max(fwidth(grid.x), fwidth(grid.y)))) *
        (1.0 - 0.91 * head) * (1.0 - 0.92 * tailRoot);
      float reflection = bell((uvCell.y - 0.33 - 0.28 * seed) / 0.19) * bell((edgeDist + 0.11) / 0.18);
      float pearls = smoothstep(0.56, 0.97, seed) * reflection * fade;
      color *= 1.0 + fade * ((seed - 0.5) * 0.125 + face * 0.055 - ridge * 0.062);
      color = mix(color, vec3(0.92, 0.89, 0.78), pearls * (0.70 - 0.31 * throat));
      float flecks = smoothstep(0.64, 0.84, mottling * 0.72 + detail * 0.43);
      color *= 1.0 - flecks * 0.25 * (1.0 - 0.68 * head) * (1.0 - 0.75 * throat);

      float gillZ = 0.656 + 0.88 * (y + 0.078) * (y + 0.078) + 0.08 * y;
      float gillLength = smoothstep(-0.62, -0.34, y) * (1.0 - smoothstep(0.17, 0.41, y));
      float gill = bell((z - gillZ) / 0.021) * gillLength;
      float gillRim = bell((z - gillZ - 0.025) / 0.022) * gillLength;
      color = mix(color, vec3(0.22, 0.123, 0.083), gill * (0.36 + mottling * 0.20));
      color += vec3(0.14, 0.10, 0.082) * gillRim;
      float lipMask = 1.0 - smoothstep(0.083, ${MOUTH_END}, t);
      float seam = abs(fract(vTex.y * 2.0 + 0.5) - 0.5);
      float lip = (1.0 - smoothstep(0.014, 0.145, seam)) * lipMask;
      color = mix(color, vec3(0.46, 0.257, 0.187), lip * 0.49);
      vec2 orbital = (flank - vec2(${EYE_Z}, ${EYE_Y})) / vec2(0.142, 0.122);
      vec2 nose = (flank - vec2(1.155, 0.111)) / vec2(0.022, 0.017);
      color *= 1.0 - 0.28 * exp(-dot(orbital, orbital)) - 0.48 * exp(-dot(nose, nose));
      color *= 1.0 - head * (1.0 - throat) * (0.09 + 0.13 * mottling);

      vec3 Ngeom = normalize(vNormal);
      float relief = (face + 0.28 * ridge) * 0.005 * fade;
      vec3 bump = normalize(cross(dFdy(vWorld), Ngeom)) * dFdx(relief) +
        normalize(cross(Ngeom, dFdx(vWorld))) * dFdy(relief);
      vec3 N = normalize(Ngeom - bump * 9.0);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 H = normalize(V + keyLight);
      float hemi = 0.70 + 0.28 * (0.5 + 0.5 * Ngeom.y);
      float diffuse = max(dot(N, keyLight), 0.0);
      float nh = max(dot(N, H), 0.0);
      float glint = 0.15 * pow(nh, 25.0) + (0.095 + pearls * 0.62) * pow(nh, 80.0);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      color *= hemi + 0.45 * diffuse;
      color += vec3(0.86, 0.94, 0.95) * glint + vec3(0.25, 0.48, 0.51) * rim * 0.21;
      gl_FragColor = vec4(throughWater(color, Ngeom), 1.0);
    }
  `;

  const PALATE = /* glsl */ `
    void main() {
      float depth = vTex.x;
      float gum = max(1.0 - smoothstep(0.07, 0.35, depth), smoothstep(0.35, 0.5, abs(vTex.y - 0.5)));
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      float light = 0.64 + 0.32 * max(dot(N, keyLight), 0.0);
      float wet = pow(max(dot(N, normalize(V + keyLight)), 0.0), 40.0) * 0.11;
      vec3 color = mix(vec3(0.11, 0.045, 0.041), vec3(0.48, 0.221, 0.174), gum * (1.0 - depth * 0.42));
      color *= light * (0.86 + 0.19 * noise2D(vLocal.xz * 46.0));
      color += vec3(0.81, 0.57, 0.53) * wet * (1.0 - depth);
      gl_FragColor = vec4(throughWater(color, N), 1.0);
    }
  `;

  const TEETH = /* glsl */ `
    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      float diffuse = max(dot(N, keyLight), 0.0);
      float shine = pow(max(dot(N, normalize(V + keyLight)), 0.0), 36.0);
      vec3 color = vec3(0.89, 0.83, 0.67) * (0.65 + diffuse * 0.32);
      color += vec3(0.87, 0.93, 0.96) * shine * 0.21;
      gl_FragColor = vec4(throughWater(color, N), 1.0);
    }
  `;

  const FIN = /* glsl */ `
    uniform vec3 uBase;
    uniform vec3 uOuter;
    uniform vec2 uFin;
    uniform float uRayCount;

    void main() {
      float reach = mix(vTex.y, vTex.x, uFin.x);
      float across = mix(vTex.x, vTex.y, uFin.x);
      float rayPath = across * uRayCount + sin(across * 6.0) * 0.27 * reach;
      float rays = 1.0 - smoothstep(0.08, 0.28, abs(fract(rayPath) - 0.5));
      rays = mix(rays, 0.24, smoothstep(0.34, 0.96, fwidth(rayPath)));
      float fiber = hash21(floor(vec2(across * uRayCount, reach * 19.0)));
      vec3 color = mix(uBase, uOuter, smoothstep(0.15, 0.90, reach));
      color *= 0.83 + 0.24 * rays + 0.14 * fiber;
      float membrane = 1.0 - smoothstep(0.84, 0.98, reach);
      float darkBand = uFin.y * smoothstep(0.60, 0.92, reach);
      color = mix(color, vec3(0.075, 0.114, 0.122), darkBand * 0.79);
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - abs(dot(N, V)), 2.5);
      float sheen = pow(abs(dot(N, normalize(V + keyLight))), 30.0);
      color *= 0.77 + 0.28 * abs(dot(N, keyLight));
      color += vec3(0.48, 0.72, 0.71) * (rim * 0.105 + sheen * (0.11 + 0.13 * rays));
      float sideFade = smoothstep(0.0, 0.050, across) * (1.0 - smoothstep(0.95, 1.0, across));
      float alpha = (0.47 + membrane * 0.35 + rays * 0.11 + darkBand * 0.12) * sideFade;
      alpha *= 1.0 - smoothstep(0.983, 1.0, reach);
      gl_FragColor = vec4(throughWater(color, N), alpha);
    }
  `;

  const EYE = /* glsl */ `
    uniform float uSide;
    uniform vec3 uEyeCenter;

    void main() {
      vec3 sphere = normalize((vLocal - uEyeCenter) * vec3(1.45, 1.0, 1.0));
      vec3 gaze = normalize(vec3(uSide * 0.95, 0.07, 0.30));
      vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), gaze));
      float angle = atan(dot(sphere, cross(gaze, tangent)), dot(sphere, tangent));
      float radius = acos(clamp(dot(sphere, gaze), -1.0, 1.0));
      float grain = 0.87 + 0.10 * sin(angle * 25.0 + sin(angle * 8.0)) + 0.05 * sin(angle * 43.0);
      vec3 color = mix(vec3(0.30, 0.319, 0.26), vec3(0.79, 0.58, 0.32) * grain,
        1.0 - smoothstep(0.62, 0.77, radius));
      color = mix(color, vec3(0.81, 0.369, 0.15) * grain, 1.0 - smoothstep(0.43, 0.62, radius));
      color = mix(color, vec3(0.012, 0.017, 0.020), 1.0 - smoothstep(0.362, 0.414, radius));
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      float reflectance = max(dot(N, normalize(keyLight + V)), 0.0);
      color *= 0.82 + 0.25 * max(dot(N, keyLight), 0.0);
      color += vec3(0.86, 0.94, 0.98) * (0.90 * pow(reflectance, 98.0) + 0.065 * pow(reflectance, 23.0));
      gl_FragColor = vec4(throughWater(color, N), 1.0);
    }
  `;

  let sharedGeos = null;
  function getSharedGeometries() {
    if (sharedGeos) return sharedGeos;
    const [upperBody, lowerBody] = cheekGeometries();
    const [roof, floor] = mouthGeometries();
    sharedGeos = {
      upperBody,
      lowerBody,
      roof,
      floor,
      teeth: teethGeometry(),
      tail: tailGeometry(),
      dorsal: medianFin(0.205, -0.500, true, 0.31, 0.28, 0.93, 0.58),
      adipose: medianFin(-0.655, -0.965, true, 0.137, 0.46, 0.53, 0.59),
      anal: medianFin(-0.294, -1.054, false, 0.333, 0.42, 0.93, 0.75),
      pectL: pairedFin(1, false),
      pectR: pairedFin(-1, false),
      pelvL: pairedFin(1, true),
      pelvR: pairedFin(-1, true),
      eyeL: new THREE.SphereGeometry(0.094, 24, 18).scale(0.69, 1, 1).translate(0.194, EYE_Y, EYE_Z),
      eyeR: new THREE.SphereGeometry(0.094, 24, 18).scale(0.69, 1, 1).translate(-0.194, EYE_Y, EYE_Z)
    };
    return sharedGeos;
  }

  function create(causticsGLSL, sceneUniforms) {
    const geos = getSharedGeometries();
    const fish = new THREE.Group();
    fish.name = 'Piranha-vermelha';
    const baseUniforms = {
      uSwimPhase: { value: 0 },
      uTailAmp: { value: 0.105 },
      uSpineCurve: { value: 0.0 },
      ...sceneUniforms
    };

    function mesh(name, geometry, fragment, uniforms = {}, membrane = false) {
      const part = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: { ...baseUniforms, ...uniforms },
        vertexShader: SWIM_VERTEX,
        fragmentShader: causticsGLSL + WATER_LIGHT + fragment,
        side: membrane ? THREE.DoubleSide : THREE.FrontSide,
        transparent: membrane,
        depthWrite: !membrane,
        forceSinglePass: membrane
      }));
      part.name = name;
      part.frustumCulled = false; // Os vértices do pedúnculo e da cauda oscilam no shader.
      fish.add(part);
    }

    function fin(name, geometry, base, tip, count, radial, darkBand = 0) {
      mesh(name, geometry, FIN, {
        uBase: { value: new THREE.Vector3(...base) },
        uOuter: { value: new THREE.Vector3(...tip) },
        uRayCount: { value: count },
        uFin: { value: new THREE.Vector2(radial ? 1 : 0, darkBand) }
      }, true);
    }

    mesh('Corpo e maxila', geos.upperBody, SKIN);
    mesh('Corpo e mandíbula', geos.lowerBody, SKIN);
    mesh('Céu da boca', geos.roof, PALATE);
    mesh('Assoalho da boca', geos.floor, PALATE);
    mesh('Dentes', geos.teeth, TEETH);
    fin('Cauda bifurcada', geos.tail, [0.39, 0.44, 0.42], [0.45, 0.52, 0.49], 28, true, 1);
    fin('Dorsal', geos.dorsal, [0.33, 0.38, 0.35], [0.29, 0.37, 0.39], 16, false, 0.54);
    fin('Adiposa', geos.adipose, [0.26, 0.33, 0.32], [0.47, 0.56, 0.51], 4, false, 0.14);
    fin('Anal', geos.anal, [0.63, 0.30, 0.159], [0.32, 0.325, 0.285], 24, false, 0.58);

    for (const side of [-1, 1]) {
      fin('Peitoral', side > 0 ? geos.pectL : geos.pectR, [0.51, 0.303, 0.164], [0.50, 0.385, 0.263], 13, true);
      fin('Pélvica', side > 0 ? geos.pelvL : geos.pelvR, [0.73, 0.33, 0.166], [0.56, 0.40, 0.285], 9, true);
      const center = new THREE.Vector3(side * 0.194, EYE_Y, EYE_Z);
      mesh('Olho', side > 0 ? geos.eyeL : geos.eyeR, EYE, { uSide: { value: side }, uEyeCenter: { value: center } });
    }

    return fish;
  }

  window.createPiranhaModel = create;
})();
