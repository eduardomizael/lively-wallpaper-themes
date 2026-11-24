(() => {
// =========================================================================
// 1. CONFIGURAÇÃO GLOBAL (LIL-GUI + LIVELY WALLPAPER)
// =========================================================================
const urlParams = new URLSearchParams(window.location.search);
const isPreview = urlParams.has('preview');
const isInspect = urlParams.has('inspect'); // Modo inspeção de perfil para validação visual
const isInspectMouth = urlParams.has('mouth'); // Inspeção com a boca aberta
const inspectTarget = urlParams.get('inspect');
const isFishTrio = inspectTarget === 'peixes';
const inspectFish = isFishTrio ? null : urlParams.get('fish');
const isPiranhaProfile = inspectTarget === 'piranha' || (isInspect && inspectFish === 'piranha');
const inspectAngle = urlParams.get('angle');

const PIRANHA_SCALE_RATIO = 0.70;    // Piranha-vermelha (~25 cm) vs Tucunaré adulto (~52 cm)
const TUCUNARE2_SCALE_RATIO = 0.96;  // Sutil variação natural entre os dois tucunarés

const params = {
  baseSpeed: 1.85,          // Velocidade de patrulha base
  ambushTendency: 1.0,      // Frequência/duração de espairar/emboscada
  causticsIntensity: 1.15,  // Intensidade das cáusticas
  sunbeamsIntensity: 1.0,   // Intensidade dos raios de luz
  fishScale: 0.74,          // Escala global padrão reduzida para dar mais espaço na tela
  showAlgae: !isPiranhaProfile, // Exibir/ocultar algas no fundo
  interactiveMouse: true,   // Espreita, fuga e isca ao clicar
  showGui: isPreview && !isInspect,
  dropBaitCenter: () => spawnBait((Math.random() - 0.5) * 8.0, (Math.random() - 0.5) * 2.8),
  triggerStrike: () => {
    allFish.forEach(f => triggerPredatorBurst(f, 1.0));
    piranhaSchool.forEach(p => triggerPiranhaEvade(p, tucunare.pos));
  }
};

// =========================================================================
// 2. RENDERER, CENA E CÂMERA LATERAL-ISOMÉTRICA
// =========================================================================
const canvas = document.getElementById('lagoon-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a3b42);
scene.fog = new THREE.FogExp2(0x0b3d44, 0.0185);

// Câmera teleobjetiva inclinada (~19°): visão lateral-isométrica limpa e natural
const camera = new THREE.PerspectiveCamera(
  25,
  window.innerWidth / window.innerHeight,
  0.5,
  120
);
const CAM_BASE = isInspect
  ? (inspectFish === '2'
    ? new THREE.Vector3(0, 0.35, 12.6)
    : (inspectFish === '1' ? new THREE.Vector3(0, 3.2, 13.8) : new THREE.Vector3(0, 1.0, 15.2)))
  : new THREE.Vector3(0, 7.2, 21.2);
const CAM_TARGET = isInspect
  ? (inspectFish === '2' ? new THREE.Vector3(0, -0.05, 0) : new THREE.Vector3(0, 0.0, 0))
  : new THREE.Vector3(0, -0.35, 0);
if (isPiranhaProfile) {
  CAM_BASE.set(0, 1.25, 6.85);
  CAM_TARGET.set(0, 0, 0);
} else if (isFishTrio) {
  CAM_BASE.set(0, 2.1, 17.6);
  CAM_TARGET.set(0, 0, 0);
}
camera.position.copy(CAM_BASE);
camera.lookAt(CAM_TARGET);

const inspectOrbit = {
  dragging: false,
  lastX: 0,
  lastY: 0,
  yaw: 0,
  pitch: 0,
  zoom: 1.0
};
const inspectBaseOffset = CAM_BASE.clone().sub(CAM_TARGET);

if (isInspect) {
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.lil-gui')) return;
    inspectOrbit.dragging = true;
    inspectOrbit.lastX = e.clientX;
    inspectOrbit.lastY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!inspectOrbit.dragging) return;
    const dx = e.clientX - inspectOrbit.lastX;
    const dy = e.clientY - inspectOrbit.lastY;
    inspectOrbit.lastX = e.clientX;
    inspectOrbit.lastY = e.clientY;
    inspectOrbit.yaw -= dx * 0.008;
    inspectOrbit.pitch = THREE.MathUtils.clamp(inspectOrbit.pitch + dy * 0.007, -1.1, 1.1);
  });
  window.addEventListener('pointerup', () => {
    inspectOrbit.dragging = false;
  });
  window.addEventListener('pointercancel', () => {
    inspectOrbit.dragging = false;
  });
  window.addEventListener('wheel', (e) => {
    inspectOrbit.zoom = THREE.MathUtils.clamp(inspectOrbit.zoom + e.deltaY * 0.0008, 0.55, 1.8);
  }, { passive: true });
}

const swimVolume = {
  halfX: 7.4,
  minY: -1.55,
  maxY: 1.75,
  minZ: -8.2,
  maxZ: 5.8
};

function halfXAtZ(z) {
  const baseDist = CAM_BASE.distanceTo(CAM_TARGET);
  const dz = Math.max(8.5, CAM_BASE.z - z);
  return Math.max(3.6, swimVolume.halfX * (dz / baseDist));
}

function updateBounds() {
  if (isPiranhaProfile || isFishTrio) {
    camera.zoom = Math.min(1, camera.aspect / (isFishTrio ? 1.62 : 1.3));
    camera.updateProjectionMatrix();
  }
  const dist = CAM_BASE.distanceTo(CAM_TARGET);
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);
  const visibleH = 2 * Math.tan(vFovRad * 0.5) * dist;
  const visibleW = visibleH * camera.aspect;
  swimVolume.halfX = Math.max(4.6, visibleW * 0.42);
}
updateBounds();

const {
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
} = window.LagoonEnvironment.createEnvironment({
  scene,
  params,
  renderer,
  getClockTime: () => clockTime
});

const {
  tucunare,
  globalFishUniforms,
  sampleProfile
} = window.TucunareV1.createTucunareV1({
  scene,
  CAUSTICS_GLSL,
  params,
  isInspect
});

const {
  tucunareRealista
} = window.TucunareV2.createTucunareV2({
  scene,
  CAUSTICS_GLSL,
  globalFishUniforms,
  sampleProfile,
  isInspect
});
Object.assign(tucunare, {
  id: 1,
  species: 'tucunare',
  scaleRatio: 1.0,
  speedMult: 0.96,
  hoverMult: 1.15,
  preferredYBias: 0.16,
  biteCooldown: 0,
  headShakeTimer: 0,
  bloodMouthTimer: 0,
  bloodEmitAcc: 0
});
if (!isInspect) {
  tucunare.pos.set(-2.8, 0.20, 2.4);
  tucunare.waypoint.set(4.4, 0.10, -4.6);
}
Object.assign(tucunareRealista, {
  species: 'tucunare',
  scaleRatio: TUCUNARE2_SCALE_RATIO,
  speedMult: 1.08,
  hoverMult: 0.86,
  preferredYBias: -0.14,
  biteCooldown: 0,
  headShakeTimer: 0,
  bloodMouthTimer: 0,
  bloodEmitAcc: 0
});
if (!isInspect) {
  tucunareRealista.pos.set(3.2, -0.35, -3.0);
  tucunareRealista.waypoint.set(-4.2, -0.10, 3.4);
}
const allFish = [tucunare, tucunareRealista];

function createPiranhaShadowMaterial(pUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globalFishUniforms,
      ...pUniforms,
      uShadowOpacity: { value: 0.24 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uSwimPhase;
      uniform float uTailAmp;
      uniform float uSpineCurve;
      varying vec2 vShadowUv;
      void main() {
        vShadowUv = uv;
        vec3 p = position;
        float s = clamp((1.36 - p.z) / 3.49, 0.0, 1.0);
        float bodyWave = sin(uSwimPhase - s * 4.45);
        float envelope = 0.055 + 0.945 * pow(max(0.0, s - 0.06) / 0.94, 1.48);
        float headRecoil = sin(uSwimPhase + 1.15) * 0.14 * (1.0 - smoothstep(0.0, 0.32, s));
        float ds = s - 0.28;
        p.x += (bodyWave * envelope + headRecoil) * uTailAmp + uSpineCurve * (ds * ds) * 1.85;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uShadowOpacity;
      varying vec2 vShadowUv;
      void main() {
        vec2 d = (vShadowUv - vec2(0.5, 0.5)) * 2.0;
        float taper = mix(1.0, 1.7, smoothstep(0.45, 1.0, vShadowUv.y));
        float dist = length(vec2(d.x * taper, d.y));
        float soft = exp(-dist * dist * 3.0) * (1.0 - smoothstep(0.35, 1.0, dist));
        gl_FragColor = vec4(0.012, 0.058, 0.068, uShadowOpacity * soft);
      }
    `
  });
}

const PIRANHA_COUNT = 5;
const sharedPiranhaShadowGeo = new THREE.PlaneGeometry(1.15, 3.4, 6, 20);
sharedPiranhaShadowGeo.rotateX(-Math.PI / 2);

const PIRANHA_SLOTS = [
  { scale: 0.70, ox:  0.00, oy:  0.05, oz:  0.00, spd: 1.02 },
  { scale: 0.64, ox: -1.15, oy:  0.28, oz: -0.75, spd: 0.98 },
  { scale: 0.72, ox:  1.10, oy: -0.22, oz: -0.65, spd: 1.05 },
  { scale: 0.66, ox: -0.75, oy: -0.32, oz: -1.45, spd: 0.96 },
  { scale: 0.62, ox:  0.85, oy:  0.34, oz: -1.50, spd: 1.04 }
];

function createPiranhaActor(index) {
  const cfg = PIRANHA_SLOTS[index % PIRANHA_SLOTS.length];
  const pUniforms = {
    uSwimPhase: { value: index * 1.37 },
    uTailAmp: { value: 0.105 },
    uSpineCurve: { value: 0.0 }
  };
  const group = createPiranhaModel(CAUSTICS_GLSL, { ...globalFishUniforms, ...pUniforms });
  group.rotation.order = 'YXZ';
  scene.add(group);

  const shadowGroup = new THREE.Group();
  scene.add(shadowGroup);
  const shadowMat = createPiranhaShadowMaterial(pUniforms);
  const shadowBody = new THREE.Mesh(sharedPiranhaShadowGeo, shadowMat);
  shadowBody.renderOrder = 1;
  shadowGroup.add(shadowBody);

  return {
    id: 3 + index,
    schoolIndex: index,
    species: 'piranha',
    scaleRatio: cfg.scale,
    speedMult: cfg.spd,
    slotOffset: new THREE.Vector3(cfg.ox, cfg.oy, cfg.oz),
    uniforms: pUniforms,
    group,
    shadowGroup,
    shadowMat,

    pos: new THREE.Vector3(0.8 + cfg.ox, 0.55 + cfg.oy, -5.2 + cfg.oz),
    targetY: 0.55 + cfg.oy,
    velY: 0,
    heading: -Math.PI * 0.35 + (index - 2) * 0.06,
    pitch: 0,
    roll: 0,
    speed: 1.45,
    prevSpeed: 1.45,
    angularVelocity: 0,

    // Estados: 'SCHOOL' | 'CHASE' | 'STRIKE' | 'ATTACK_TURN' | 'EVADE' | 'FLEE'
    state: 'SCHOOL',
    stateTimer: 0,
    strikeDuration: 0.36,
    evadeTimer: 0,
    evadeFrom: new THREE.Vector3(),
    fleeTimer: 0,
    fleeCooldown: 0,
    fleeHeadingOffset: 0,
    biteCooldown: 0,
    headShakeTimer: 0,
    bloodMouthTimer: 0,
    bloodEmitAcc: 0,
    attackTurnTimer: 0,
    attackTurnDir: (index % 2 === 0 ? 1 : -1),

    dartCycleTimer: 0.6 + index * 0.28,
    dartBurstLeft: 0.25,

    swimPhase: index * 1.37,
    smoothEffort: 0.28,
    smoothSpineCurve: 0
  };
}

const piranhaSchool = (isInspect && !isPiranhaProfile && !isFishTrio)
  ? []
  : Array.from({ length: isInspect ? 1 : PIRANHA_COUNT }, (_, i) => createPiranhaActor(i));

const piranhaSchoolState = {
  center: new THREE.Vector3(0.8, 0.55, -5.2),
  target: new THREE.Vector3(-4.0, 0.35, 2.2),
  targetTimer: 4.8,
  hoverTimer: 0,
  nextHoverIn: 5.5
};

// =========================================================================
// 7. SISTEMA DE LAMBARIS (PRESA VIVA) + SANGUE SUBAQUÁTICO + ESCAMAS + BOLHAS
// =========================================================================
const baits = [];
const MAX_BAITS = 6;
const LAMBARI_SCALE_RATIO = 0.39; // Lambari (~10 cm) vs Tucunaré adulto (~52 cm)

const sharedLambariShadowGeo = new THREE.PlaneGeometry(0.68, 2.25, 4, 12);
sharedLambariShadowGeo.rotateX(-Math.PI / 2);

function createLambariShadowMaterial(lUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globalFishUniforms,
      ...lUniforms,
      uShadowOpacity: { value: 0.18 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uSwimPhase;
      uniform float uTailAmp;
      uniform float uSpineCurve;
      varying vec2 vShadowUv;
      void main() {
        vShadowUv = uv;
        vec3 p = position;
        float s = clamp((1.10 - p.z) / 2.88, 0.0, 1.0);
        float bodyWave = sin(uSwimPhase - s * 4.85);
        float envelope = 0.06 + 0.94 * pow(max(0.0, s - 0.05) / 0.95, 1.38);
        float ds = s - 0.25;
        p.x += bodyWave * envelope * uTailAmp + uSpineCurve * (ds * ds) * 1.95;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uShadowOpacity;
      varying vec2 vShadowUv;
      void main() {
        vec2 d = (vShadowUv - vec2(0.5, 0.5)) * 2.0;
        float dist = length(vec2(d.x * 1.35, d.y));
        float soft = exp(-dist * dist * 3.2) * (1.0 - smoothstep(0.35, 1.0, dist));
        gl_FragColor = vec4(0.012, 0.058, 0.068, uShadowOpacity * soft);
      }
    `
  });
}

// --- Sistema de Sangue Subaquático (nuvens e filamentos difusos billboarded) ---
const MAX_BLOOD_PUFFS = 240;
const bloodGeo = new THREE.PlaneGeometry(1, 1);
const bloodMetaArray = new Float32Array(MAX_BLOOD_PUFFS * 4);
const bloodMetaAttr = new THREE.InstancedBufferAttribute(bloodMetaArray, 4);
bloodGeo.setAttribute('aBloodMeta', bloodMetaAttr);

const bloodMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  vertexShader: /* glsl */ `
    attribute vec4 aBloodMeta; // x=alpha, y=ageNorm, z=seed, w=density
    varying vec2 vUv;
    varying vec4 vMeta;
    void main() {
      vUv = uv;
      vMeta = aBloodMeta;
      vec3 worldCenter = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float scale = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
      vec4 mvCenter = modelViewMatrix * vec4(worldCenter, 1.0);
      float ang = aBloodMeta.z + aBloodMeta.y * 0.65;
      float c = cos(ang);
      float s = sin(ang);
      vec2 rot = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
      mvCenter.xy += rot * scale;
      gl_Position = projectionMatrix * mvCenter;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying vec4 vMeta;

    float hash21(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.53);
      return fract(p.x * p.y);
    }

    float noise2D(vec2 p) {
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
      float alpha = vMeta.x;
      if (alpha <= 0.004) discard;

      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;

      float ageNorm = vMeta.y;
      float seed = vMeta.z;
      float density = vMeta.w;

      // Ruído orgânico de pluma de sangue se dissolvendo na água
      vec2 np = p * (2.3 + ageNorm * 1.4) + vec2(seed * 3.1, seed * 1.9 + uTime * 0.16);
      float n1 = noise2D(np);
      float n2 = noise2D(np * 2.15 - vec2(uTime * 0.12, -uTime * 0.09));
      float cloud = n1 * 0.62 + n2 * 0.38;

      float distortedR = r + (cloud - 0.52) * (0.56 + ageNorm * 0.32);
      float shape = smoothstep(0.96, 0.08, distortedR) * (0.45 + 0.75 * cloud);
      float finalAlpha = clamp(shape * alpha * density, 0.0, 0.52);
      if (finalAlpha <= 0.005) discard;

      // Vermelho-sangue fresco escurecendo/diluindo no meio subaquático
      vec3 freshCore = vec3(0.58, 0.025, 0.038);
      vec3 deepCrimson = vec3(0.30, 0.018, 0.032);
      vec3 diluted = vec3(0.20, 0.055, 0.075);
      vec3 col = mix(deepCrimson, freshCore, smoothstep(0.75, 0.12, r) * (1.0 - ageNorm * 0.58));
      col = mix(col, diluted, ageNorm * 0.72);

      gl_FragColor = vec4(col, finalAlpha);
    }
  `
});

const bloodInstanced = new THREE.InstancedMesh(bloodGeo, bloodMat, MAX_BLOOD_PUFFS);
bloodInstanced.renderOrder = 13;
bloodInstanced.frustumCulled = false;
bloodInstanced.visible = false;
scene.add(bloodInstanced);

const bloodDummy = new THREE.Object3D();
const bloodPool = Array.from({ length: MAX_BLOOD_PUFFS }, (_, idx) => {
  bloodDummy.position.set(0, -999, 0);
  bloodDummy.scale.setScalar(0.001);
  bloodDummy.updateMatrix();
  bloodInstanced.setMatrixAt(idx, bloodDummy.matrix);
  bloodMetaArray[idx * 4] = 0;
  return {
    active: false,
    x: 0, y: -999, z: 0,
    vx: 0, vy: 0, vz: 0,
    startScale: 0.25,
    endScale: 1.2,
    peakAlpha: 0.72,
    seed: Math.random() * Math.PI * 2,
    density: 1.0,
    life: 0,
    maxLife: 5.0
  };
});
bloodInstanced.instanceMatrix.needsUpdate = true;
bloodMetaAttr.needsUpdate = true;
let bloodCursor = 0;
let activeBloodCount = 0;

function spawnBloodPuff(x, y, z, vx, vy, vz, startScale, endScale, peakAlpha, maxLife, density = 1.0) {
  const slot = bloodPool[bloodCursor];
  bloodCursor = (bloodCursor + 1) % MAX_BLOOD_PUFFS;
  slot.active = true;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.vx = vx;
  slot.vy = vy;
  slot.vz = vz;
  slot.startScale = startScale;
  slot.endScale = endScale;
  slot.peakAlpha = peakAlpha;
  slot.seed = Math.random() * Math.PI * 2;
  slot.density = density;
  slot.life = 0;
  slot.maxLife = maxLife;
}

function spawnBloodBurst(x, y, z, dirX, dirZ, intensity = 1.0) {
  const count = Math.round(12 + 10 * intensity);
  for (let i = 0; i < count; i++) {
    const isJet = i < count * 0.48;
    const ang = isJet
      ? Math.atan2(dirX, dirZ) + (Math.random() - 0.5) * 1.15
      : Math.random() * Math.PI * 2;
    const spd = isJet
      ? (1.2 + Math.random() * 2.4) * intensity
      : (0.28 + Math.random() * 1.25) * intensity;
    const vx = Math.sin(ang) * spd;
    const vz = Math.cos(ang) * spd;
    const vy = (Math.random() - 0.46) * 0.85 * intensity;
    const startS = (0.18 + Math.random() * 0.24) * (0.85 + 0.25 * intensity);
    const endS = (1.05 + Math.random() * 1.20) * (0.85 + 0.30 * intensity);
    const alpha = Math.min(0.50, (0.26 + Math.random() * 0.18) * (0.85 + 0.18 * intensity));
    const life = 4.0 + Math.random() * 3.2;
    spawnBloodPuff(
      x + (Math.random() - 0.5) * 0.24,
      y + (Math.random() - 0.5) * 0.18,
      z + (Math.random() - 0.5) * 0.24,
      vx, vy, vz, startS, endS, alpha, life,
      0.75 + Math.random() * 0.35
    );
  }
}

function spawnBloodTrailDrop(x, y, z, vx = 0, vy = 0, vz = 0, scaleMult = 1.0) {
  const startS = (0.14 + Math.random() * 0.12) * scaleMult;
  const endS = (0.78 + Math.random() * 0.62) * scaleMult;
  spawnBloodPuff(
    x + (Math.random() - 0.5) * 0.12,
    y + (Math.random() - 0.5) * 0.10,
    z + (Math.random() - 0.5) * 0.12,
    vx + (Math.random() - 0.5) * 0.22,
    vy + (Math.random() - 0.45) * 0.15,
    vz + (Math.random() - 0.5) * 0.22,
    startS,
    endS,
    0.26 + Math.random() * 0.14,
    3.5 + Math.random() * 2.2,
    0.75 + Math.random() * 0.25
  );
}

// --- Escamas Prateadas Soltas (brilham e afundam após mordidas) ---
const MAX_LOOSE_SCALES = 72;
const scaleGeo = new THREE.PlaneGeometry(0.056, 0.036);
const scaleMat = new THREE.MeshBasicMaterial({
  color: 0xdff4f8,
  transparent: true,
  opacity: 0.68,
  side: THREE.DoubleSide,
  depthWrite: false
});
const scaleInstanced = new THREE.InstancedMesh(scaleGeo, scaleMat, MAX_LOOSE_SCALES);
scaleInstanced.renderOrder = 14;
scaleInstanced.frustumCulled = false;
scaleInstanced.visible = false;
scene.add(scaleInstanced);

const scaleDummy = new THREE.Object3D();
const scalePool = Array.from({ length: MAX_LOOSE_SCALES }, (_, idx) => {
  scaleDummy.position.set(0, -999, 0);
  scaleDummy.scale.setScalar(0);
  scaleDummy.updateMatrix();
  scaleInstanced.setMatrixAt(idx, scaleDummy.matrix);
  return {
    active: false,
    x: 0, y: -999, z: 0,
    vx: 0, vy: 0, vz: 0,
    rx: 0, ry: 0, rz: 0,
    vrx: 0, vry: 0, vrz: 0,
    baseScale: 1,
    life: 0,
    maxLife: 2.5
  };
});
scaleInstanced.instanceMatrix.needsUpdate = true;
let scaleCursor = 0;

function spawnLooseScales(x, y, z, count = 8) {
  for (let i = 0; i < count; i++) {
    const slot = scalePool[scaleCursor];
    scaleCursor = (scaleCursor + 1) % MAX_LOOSE_SCALES;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.45 + Math.random() * 1.45;
    slot.active = true;
    slot.x = x + (Math.random() - 0.5) * 0.22;
    slot.y = y + (Math.random() - 0.5) * 0.16;
    slot.z = z + (Math.random() - 0.5) * 0.22;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = 0.25 + Math.random() * 0.75;
    slot.vz = Math.sin(ang) * spd;
    slot.rx = Math.random() * Math.PI * 2;
    slot.ry = Math.random() * Math.PI * 2;
    slot.rz = Math.random() * Math.PI * 2;
    slot.vrx = (Math.random() - 0.5) * 11.0;
    slot.vry = (Math.random() - 0.5) * 11.0;
    slot.vrz = (Math.random() - 0.5) * 11.0;
    slot.baseScale = 0.65 + Math.random() * 0.85;
    slot.life = 0;
    slot.maxLife = 1.9 + Math.random() * 1.6;
  }
}

// --- Bolhas de Bote / Splash ---
const MAX_BITE_BUBBLES = 96;
const bubbleGeo = new THREE.SphereGeometry(0.055, 8, 6);
const bubbleMat = new THREE.MeshBasicMaterial({
  color: 0xc8faf2,
  transparent: true,
  opacity: 0.62,
  depthWrite: false
});
const bubbleInstanced = new THREE.InstancedMesh(bubbleGeo, bubbleMat, MAX_BITE_BUBBLES);
bubbleInstanced.renderOrder = 14;
bubbleInstanced.frustumCulled = false;
bubbleInstanced.visible = false;
scene.add(bubbleInstanced);

const bubbleDummy = new THREE.Object3D();
const bubblePool = Array.from({ length: MAX_BITE_BUBBLES }, (_, idx) => {
  bubbleDummy.position.set(0, -999, 0);
  bubbleDummy.scale.setScalar(0);
  bubbleDummy.updateMatrix();
  bubbleInstanced.setMatrixAt(idx, bubbleDummy.matrix);
  return {
    active: false,
    x: 0, y: -999, z: 0,
    vx: 0, vy: 0, vz: 0,
    baseScale: 1,
    life: 0,
    maxLife: 1
  };
});
bubbleInstanced.instanceMatrix.needsUpdate = true;
let bubbleCursor = 0;

function spawnStrikeSplash(x, y, z, intensity = 1.0) {
  spawnRipple(x, z, 1.35 * intensity);
  const count = Math.round(10 + 7 * intensity);
  for (let i = 0; i < count; i++) {
    const slot = bubblePool[bubbleCursor];
    bubbleCursor = (bubbleCursor + 1) % MAX_BITE_BUBBLES;
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.55 + Math.random() * 1.55) * intensity;
    slot.active = true;
    slot.x = x + (Math.random() - 0.5) * 0.18;
    slot.y = y + (Math.random() - 0.5) * 0.12;
    slot.z = z + (Math.random() - 0.5) * 0.18;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = (0.85 + Math.random() * 1.45) * intensity;
    slot.vz = Math.sin(ang) * spd;
    slot.baseScale = (0.48 + Math.random() * 1.0) * (0.85 + 0.25 * intensity);
    slot.life = 0;
    slot.maxLife = 0.72 + Math.random() * 0.58;
  }
}

function disposeLambari(l) {
  scene.remove(l.group);
  scene.remove(l.shadowGroup);
  l.group.traverse((obj) => {
    if (obj.material && typeof obj.material.dispose === 'function') {
      obj.material.dispose();
    }
  });
  if (l.shadowMat && typeof l.shadowMat.dispose === 'function') {
    l.shadowMat.dispose();
  }
}

function spawnBait(x, z) {
  const cz = THREE.MathUtils.clamp(z, swimVolume.minZ * 0.85, swimVolume.maxZ * 0.82);
  const maxX = halfXAtZ(cz) * 0.84;
  const cx = THREE.MathUtils.clamp(x, -maxX, maxX);
  if (baits.length >= MAX_BAITS) {
    const oldest = baits.shift();
    disposeLambari(oldest);
  }

  const lUniforms = {
    uSwimPhase: { value: Math.random() * Math.PI * 2 },
    uTailAmp: { value: 0.18 },
    uSpineCurve: { value: 0.0 },
    uInjury: { value: 0.0 }
  };
  const group = window.createLambariModel(CAUSTICS_GLSL, { ...globalFishUniforms, ...lUniforms });
  group.rotation.order = 'YXZ';
  scene.add(group);

  const shadowGroup = new THREE.Group();
  scene.add(shadowGroup);
  const shadowMat = createLambariShadowMaterial(lUniforms);
  const shadowBody = new THREE.Mesh(sharedLambariShadowGeo, shadowMat);
  shadowBody.renderOrder = 1;
  shadowGroup.add(shadowBody);

  const startHeading = Math.random() * Math.PI * 2;
  const lambari = {
    group,
    shadowGroup,
    shadowMat,
    uniforms: lUniforms,
    scaleRatio: LAMBARI_SCALE_RATIO * (0.92 + Math.random() * 0.18),
    pos: new THREE.Vector3(cx, 2.95, cz),
    vel: new THREE.Vector3(Math.sin(startHeading) * 0.8, -5.6, Math.cos(startHeading) * 0.8),
    heading: startHeading,
    pitch: 0.82, // Entra mergulhando de cabeça na água
    roll: (Math.random() - 0.5) * 0.8,
    speed: 2.2,
    angularVelocity: 0,
    falling: true,
    enteredWater: false,
    hp: 100,
    maxHp: 100,
    injury: 0,
    stunTimer: 0,
    bloodTrailTimer: 0,
    zigTimer: 0.35 + Math.random() * 0.3,
    zigSign: Math.random() < 0.5 ? -1 : 1,
    swimPhase: lUniforms.uSwimPhase.value,
    smoothSpineCurve: 0,
    age: 0,
    seed: Math.random() * Math.PI * 2
  };
  group.position.copy(lambari.pos);
  baits.push(lambari);
  return lambari;
}

function damageLambari(lambari, damage, attacker, isTucunare) {
  const idx = baits.indexOf(lambari);
  if (idx === -1) return false;

  lambari.hp = Math.max(0, lambari.hp - damage);
  lambari.injury = 1.0 - lambari.hp / lambari.maxHp;
  lambari.uniforms.uInjury.value = lambari.injury;
  lambari.stunTimer = isTucunare ? 0.28 : 0.18;

  const dirX = Math.sin(attacker.heading);
  const dirZ = Math.cos(attacker.heading);
  const knock = isTucunare ? 3.2 : 1.9;
  lambari.vel.x += dirX * knock;
  lambari.vel.z += dirZ * knock;
  lambari.vel.y += (Math.random() - 0.42) * 1.4;
  lambari.roll += (Math.random() < 0.5 ? -1 : 1) * (isTucunare ? 1.15 : 0.65);

  const killed = lambari.hp <= 0;
  const burstIntensity = killed ? (isTucunare ? 1.75 : 1.50) : (isTucunare ? 1.30 : 0.92);
  spawnBloodBurst(lambari.pos.x, lambari.pos.y, lambari.pos.z, dirX, dirZ, burstIntensity);
  spawnLooseScales(lambari.pos.x, lambari.pos.y, lambari.pos.z, killed ? 16 : (isTucunare ? 10 : 7));
  spawnStrikeSplash(lambari.pos.x, lambari.pos.y, lambari.pos.z, killed ? 1.35 : 0.95);

  attacker.headShakeTimer = isTucunare ? 0.34 : 0.24;
  attacker.bloodMouthTimer = killed ? 1.05 : 0.65;

  if (killed) {
    disposeLambari(lambari);
    baits.splice(idx, 1);
    return true;
  }
  return false;
}

function updateBaitsAndBubbles(dt) {
  // 1. Atualiza lambaris vivos na água (queda + fuga desesperada + rastro de sangue quando feridos)
  const hunters = [...allFish, ...piranhaSchool];
  for (let i = baits.length - 1; i >= 0; i--) {
    const l = baits[i];
    l.age += dt;
    const s = params.fishScale * l.scaleRatio;

    if (l.falling) {
      l.vel.y -= 14.5 * dt;
      l.pos.addScaledVector(l.vel, dt);
      if (!l.enteredWater && l.pos.y <= 1.65) {
        l.enteredWater = true;
        spawnStrikeSplash(l.pos.x, 1.55, l.pos.z, 1.15);
      }
      if (l.enteredWater) {
        l.vel.y *= Math.exp(-6.2 * dt);
        if (l.pos.y <= 0.85 || Math.abs(l.vel.y) < 0.9) {
          l.falling = false;
          l.speed = params.baseSpeed * 2.15;
        }
      }
      l.pitch = THREE.MathUtils.lerp(l.pitch, THREE.MathUtils.clamp(-l.vel.y * 0.14, -0.75, 0.85), Math.min(1, dt * 8.0));
      l.swimPhase += 18.0 * dt;
      l.uniforms.uSwimPhase.value = l.swimPhase;
      l.uniforms.uTailAmp.value = 0.24;
      l.uniforms.uSpineCurve.value = Math.sin(clockTime * 22.0 + l.seed) * 0.22;
    } else {
      if (l.stunTimer > 0) l.stunTimer = Math.max(0, l.stunTimer - dt);
      l.zigTimer -= dt;
      if (l.zigTimer <= 0) {
        l.zigSign = -l.zigSign;
        l.zigTimer = 0.26 + Math.random() * 0.34;
      }

      // Vetor de fuga de todos os predadores próximos
      let fleeX = 0, fleeY = 0, fleeZ = 0;
      let nearestHunterDist = 999;
      for (let h = 0; h < hunters.length; h++) {
        const pred = hunters[h];
        const dx = l.pos.x - pred.pos.x;
        const dy = l.pos.y - pred.pos.y;
        const dz = l.pos.z - pred.pos.z;
        const dist = Math.max(0.25, Math.hypot(dx, dy * 1.2, dz));
        if (dist < nearestHunterDist) nearestHunterDist = dist;
        if (dist < 10.5) {
          const weight = (pred.species === 'tucunare' ? 1.55 : 1.15) / (dist * dist);
          fleeX += (dx / dist) * weight;
          fleeY += (dy / dist) * weight * 0.65;
          fleeZ += (dz / dist) * weight;
        }
      }

      let desiredDirX = Math.sin(l.heading);
      let desiredDirZ = Math.cos(l.heading);
      let desiredY = l.pos.y;

      const fleeLen = Math.hypot(fleeX, fleeZ);
      if (fleeLen > 0.001) {
        const fx = fleeX / fleeLen;
        const fz = fleeZ / fleeLen;
        // Zigue-zague desesperado para tentar escapar dos botes
        const panicZig = nearestHunterDist < 4.5 ? 0.58 : 0.28;
        desiredDirX = fx + (-fz) * l.zigSign * panicZig;
        desiredDirZ = fz + (fx) * l.zigSign * panicZig;
        desiredY = THREE.MathUtils.clamp(l.pos.y + fleeY * 1.8, swimVolume.minY + 0.35, swimVolume.maxY - 0.1);
      }

      // Contenção firme dentro do volume visível
      const localHalfX = halfXAtZ(l.pos.z);
      const safeX = localHalfX - 1.35;
      let steerX = desiredDirX * 3.8;
      let steerZ = desiredDirZ * 3.8;
      if (Math.abs(l.pos.x) > safeX) {
        const over = (Math.abs(l.pos.x) - safeX) / 1.25;
        steerX -= Math.sign(l.pos.x) * over * over * 13.0;
      }
      if (l.pos.z > swimVolume.maxZ - 1.0) {
        const over = (l.pos.z - (swimVolume.maxZ - 1.0)) / 1.0;
        steerZ -= over * over * 13.0;
      } else if (l.pos.z < swimVolume.minZ + 1.0) {
        const over = ((swimVolume.minZ + 1.0) - l.pos.z) / 1.0;
        steerZ += over * over * 13.0;
      }

      const desiredHeading = Math.atan2(steerX, steerZ);
      const angleDiff = normalizeAngle(desiredHeading - l.heading);
      const agility = 1.0 - l.injury * 0.42;
      const targetAngVel = THREE.MathUtils.clamp(angleDiff * 7.8, -7.2 * agility, 7.2 * agility);
      l.angularVelocity = THREE.MathUtils.lerp(l.angularVelocity, targetAngVel, Math.min(1, dt * 11.0));
      l.heading = normalizeAngle(l.heading + l.angularVelocity * dt);

      // Lambari saudável é muito ágil; ferido desacelera e cambaleia
      const panicBoost = nearestHunterDist < 4.2 ? 1.28 : 1.0;
      const injurySlow = 1.0 - l.injury * 0.48;
      const targetSpeed = params.baseSpeed * 2.15 * panicBoost * injurySlow * (l.stunTimer > 0 ? 0.45 : 1.0);
      l.speed = THREE.MathUtils.lerp(l.speed, targetSpeed, Math.min(1, dt * 7.5));

      const fwdX = Math.sin(l.heading) * l.speed;
      const fwdZ = Math.cos(l.heading) * l.speed;
      l.vel.x = THREE.MathUtils.lerp(l.vel.x, fwdX, Math.min(1, dt * (l.stunTimer > 0 ? 3.2 : 8.5)));
      l.vel.z = THREE.MathUtils.lerp(l.vel.z, fwdZ, Math.min(1, dt * (l.stunTimer > 0 ? 3.2 : 8.5)));
      const targetVy = THREE.MathUtils.clamp((desiredY - l.pos.y) * 2.4, -2.0, 2.0);
      l.vel.y = THREE.MathUtils.lerp(l.vel.y, targetVy, Math.min(1, dt * 5.0));

      l.pos.x += l.vel.x * dt;
      l.pos.y = THREE.MathUtils.clamp(l.pos.y + l.vel.y * dt, swimVolume.minY + 0.25, swimVolume.maxY - 0.05);
      l.pos.z += l.vel.z * dt;

      const targetPitch = THREE.MathUtils.clamp(-l.vel.y / Math.max(1.2, l.speed + 0.5) * 0.42, -0.35, 0.35);
      l.pitch = THREE.MathUtils.lerp(l.pitch, targetPitch, Math.min(1, dt * 7.0));

      // Quando muito ferido, tomba erraticamente de lado
      const woundedList = l.injury > 0.35 ? Math.sin(clockTime * 7.5 + l.seed) * l.injury * 0.72 : 0.0;
      const targetRoll = THREE.MathUtils.clamp(-l.angularVelocity * 0.10 + woundedList, -1.05, 1.05);
      l.roll = THREE.MathUtils.lerp(l.roll, targetRoll, Math.min(1, dt * 6.0));

      const franticFreq = 10.5 + l.speed * 4.4;
      l.swimPhase += franticFreq * dt;
      l.smoothSpineCurve = THREE.MathUtils.lerp(l.smoothSpineCurve, l.angularVelocity * 0.24, Math.min(1, dt * 8.0));
      l.uniforms.uSwimPhase.value = l.swimPhase;
      l.uniforms.uTailAmp.value = 0.14 + Math.min(0.24, l.speed * 0.055);
      l.uniforms.uSpineCurve.value = l.smoothSpineCurve;

      // Rastro contínuo de sangue enquanto o lambari ferido tenta fugir!
      if (l.injury > 0.05) {
        l.bloodTrailTimer -= dt;
        if (l.bloodTrailTimer <= 0) {
          l.bloodTrailTimer = THREE.MathUtils.lerp(0.11, 0.042, l.injury);
          spawnBloodTrailDrop(
            l.pos.x - Math.sin(l.heading) * (0.28 * s),
            l.pos.y,
            l.pos.z - Math.cos(l.heading) * (0.28 * s),
            -l.vel.x * 0.12,
            0.03,
            -l.vel.z * 0.12,
            0.78 + l.injury * 0.65
          );
        }
      }
    }

    l.group.position.copy(l.pos);
    l.group.rotation.set(l.pitch, l.heading, l.roll);
    l.group.scale.setScalar(s);

    const heightAboveBed = Math.max(0.35, l.pos.y - RIVERBED_Y);
    const shadowSpread = 1.0 + heightAboveBed * 0.08;
    l.shadowGroup.position.set(
      l.pos.x + heightAboveBed * 0.30,
      RIVERBED_Y + 0.14,
      l.pos.z - heightAboveBed * 0.16
    );
    l.shadowGroup.rotation.y = l.heading;
    l.shadowGroup.scale.set(s * shadowSpread, s, s * shadowSpread);
    l.shadowMat.uniforms.uShadowOpacity.value = l.falling
      ? 0.06
      : THREE.MathUtils.clamp(0.22 - heightAboveBed * 0.03, 0.05, 0.18);

    if (l.age > 45.0) {
      disposeLambari(l);
      baits.splice(i, 1);
    }
  }

  // 2. Atualiza plumas de sangue subaquáticas (expansão, arrasto na água e dissipação)
  bloodMat.uniforms.uTime.value = clockTime;
  let bloodDirty = false;
  let bloodActive = 0;
  for (let i = 0; i < MAX_BLOOD_PUFFS; i++) {
    const p = bloodPool[i];
    if (!p.active) continue;
    bloodDirty = true;
    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active = false;
      bloodDummy.position.set(0, -999, 0);
      bloodDummy.scale.setScalar(0.001);
      bloodDummy.updateMatrix();
      bloodInstanced.setMatrixAt(i, bloodDummy.matrix);
      bloodMetaArray[i * 4] = 0;
    } else {
      bloodActive++;
      const ageNorm = p.life / p.maxLife;
      const drag = Math.exp(-2.35 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      // Correnteza e turbulência subaquática suave
      p.x += (p.vx + Math.sin(clockTime * 0.9 + p.seed) * 0.055) * dt;
      p.y += (p.vy - 0.015 + Math.cos(clockTime * 0.7 + p.seed) * 0.03) * dt;
      p.z += (p.vz + Math.cos(clockTime * 0.8 + p.seed) * 0.045) * dt;

      const grow = Math.pow(ageNorm, 0.58);
      const curScale = THREE.MathUtils.lerp(p.startScale, p.endScale, grow);
      const fadeIn = THREE.MathUtils.smoothstep(ageNorm, 0.0, 0.08);
      const fadeOut = 1.0 - THREE.MathUtils.smoothstep(ageNorm, 0.28, 1.0);
      const curAlpha = p.peakAlpha * fadeIn * fadeOut;

      bloodDummy.position.set(p.x, p.y, p.z);
      bloodDummy.scale.setScalar(curScale);
      bloodDummy.updateMatrix();
      bloodInstanced.setMatrixAt(i, bloodDummy.matrix);
      const m = i * 4;
      bloodMetaArray[m] = curAlpha;
      bloodMetaArray[m + 1] = ageNorm;
      bloodMetaArray[m + 2] = p.seed;
      bloodMetaArray[m + 3] = p.density;
    }
  }
  activeBloodCount = bloodActive;
  bloodInstanced.visible = bloodActive > 0;
  if (bloodDirty) {
    bloodInstanced.instanceMatrix.needsUpdate = true;
    bloodMetaAttr.needsUpdate = true;
  }

  // 3. Atualiza escamas prateadas soltas
  let scalesDirty = false;
  let activeScales = 0;
  for (let i = 0; i < MAX_LOOSE_SCALES; i++) {
    const sc = scalePool[i];
    if (!sc.active) continue;
    scalesDirty = true;
    sc.life += dt;
    if (sc.life >= sc.maxLife) {
      sc.active = false;
      scaleDummy.position.set(0, -999, 0);
      scaleDummy.scale.setScalar(0);
    } else {
      activeScales++;
      const drag = Math.exp(-3.1 * dt);
      sc.vx *= drag;
      sc.vz *= drag;
      sc.vy = THREE.MathUtils.lerp(sc.vy, -0.26, Math.min(1, dt * 2.4));
      sc.x += (sc.vx + Math.sin(clockTime * 3.8 + i) * 0.08) * dt;
      sc.y += sc.vy * dt;
      sc.z += sc.vz * dt;
      sc.rx += sc.vrx * dt;
      sc.ry += sc.vry * dt;
      sc.rz += sc.vrz * dt;
      const remain = Math.max(0, 1.0 - sc.life / sc.maxLife);
      scaleDummy.position.set(sc.x, sc.y, sc.z);
      scaleDummy.rotation.set(sc.rx, sc.ry, sc.rz);
      scaleDummy.scale.setScalar(sc.baseScale * Math.min(1, remain * 2.2));
    }
    scaleDummy.updateMatrix();
    scaleInstanced.setMatrixAt(i, scaleDummy.matrix);
  }
  scaleInstanced.visible = activeScales > 0;
  if (scalesDirty) scaleInstanced.instanceMatrix.needsUpdate = true;

  // 4. Atualiza bolhas de bote
  let bubblesDirty = false;
  let activeBubbles = 0;
  for (let i = 0; i < MAX_BITE_BUBBLES; i++) {
    const p = bubblePool[i];
    if (!p.active) continue;
    bubblesDirty = true;
    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active = false;
      bubbleDummy.position.set(0, -999, 0);
      bubbleDummy.scale.setScalar(0);
    } else {
      activeBubbles++;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.94;
      p.vz *= 0.94;
      const remain = Math.max(0, 1.0 - p.life / p.maxLife);
      bubbleDummy.position.set(p.x, p.y, p.z);
      bubbleDummy.scale.setScalar(p.baseScale * remain);
    }
    bubbleDummy.updateMatrix();
    bubbleInstanced.setMatrixAt(i, bubbleDummy.matrix);
  }
  bubbleInstanced.visible = activeBubbles > 0;
  if (bubblesDirty) bubbleInstanced.instanceMatrix.needsUpdate = true;
}

// =========================================================================
// 8. INTERAÇÃO COM MOUSE
// =========================================================================
const mouse = {
  world: new THREE.Vector3(999, 0, 999),
  inside: false,
  stillTime: 0,
  speed: 0,
  moving: false,
  moveCooldown: 0,
  lastRipplePos: new THREE.Vector2(999, 999),
  lastRippleTime: -10
};

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const midPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function projectPointer(clientX, clientY) {
  pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.ray.intersectPlane(midPlane, hitPoint)) {
    const cz = THREE.MathUtils.clamp(hitPoint.z, swimVolume.minZ, swimVolume.maxZ);
    const maxX = halfXAtZ(cz);
    return {
      x: THREE.MathUtils.clamp(hitPoint.x, -maxX, maxX),
      z: cz
    };
  }
  return null;
}

window.addEventListener('pointermove', (e) => {
  if (!params.interactiveMouse || isInspect) return;
  const pt = projectPointer(e.clientX, e.clientY);
  if (!pt) return;
  const movedDist = Math.hypot(pt.x - mouse.world.x, pt.z - mouse.world.z);
  mouse.world.set(pt.x, 0.1, pt.z);
  mouse.inside = true;

  if (movedDist > 0.08 && movedDist < 10.0) {
    mouse.speed = Math.min(28, movedDist * 32);
    mouse.moving = true;
    mouse.moveCooldown = 0.28;
    mouse.stillTime = 0;

    const dRip = Math.hypot(pt.x - mouse.lastRipplePos.x, pt.z - mouse.lastRipplePos.y);
    if (dRip > 0.65 || clockTime - mouse.lastRippleTime > 0.11) {
      spawnRipple(pt.x, pt.z, THREE.MathUtils.clamp(0.16 + movedDist * 0.22, 0.18, 0.42));
      mouse.lastRipplePos.set(pt.x, pt.z);
      mouse.lastRippleTime = clockTime;
    }
  } else if (movedDist >= 10.0) {
    mouse.lastRipplePos.set(pt.x, pt.z);
  }
});

window.addEventListener('pointerleave', () => {
  mouse.inside = false;
  mouse.stillTime = 0;
  mouse.moving = false;
});

window.addEventListener('pointerdown', (e) => {
  if (!params.interactiveMouse || isInspect) return;
  if (e.target.closest && e.target.closest('.lil-gui')) return;
  const pt = projectPointer(e.clientX, e.clientY);
  if (!pt) return;
  mouse.world.set(pt.x, 0.1, pt.z);
  mouse.inside = true;
  spawnBait(pt.x, pt.z);
});

function updateMouseState(dt) {
  if (!params.interactiveMouse || !mouse.inside) {
    mouse.stillTime = 0;
    mouse.moving = false;
    mouse.speed = 0;
    return;
  }
  if (mouse.moveCooldown > 0) {
    mouse.moveCooldown -= dt;
    if (mouse.moveCooldown <= 0) mouse.moving = false;
  } else {
    mouse.stillTime += dt;
  }
  mouse.speed = THREE.MathUtils.lerp(mouse.speed, 0, Math.min(1, dt * 10));
}

// =========================================================================
// 9. LOCOMOÇÃO NATURAL DO TUCUNARÉ (KICK-AND-GLIDE + ESPAIRAR + ESPREITA + BOTE)
// =========================================================================
function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pickPatrolWaypoint(fish) {
  // Alterna suavemente entre camadas de profundidade (fundo <-> primeiro plano) e lados X
  const midZ = (swimVolume.minZ + swimVolume.maxZ) * 0.5;
  const goDeep = fish.pos.z > midZ ? Math.random() < 0.72 : Math.random() < 0.28;
  const wz = goDeep
    ? THREE.MathUtils.lerp(swimVolume.minZ + 0.9, midZ - 0.5, Math.random())
    : THREE.MathUtils.lerp(midZ + 0.5, swimVolume.maxZ - 0.9, Math.random());
  const spanX = halfXAtZ(wz);
  const targetSide = fish.pos.x > 0 ? -1 : 1;
  const wx = targetSide * (spanX * (0.34 + Math.random() * 0.48));
  const yBias = fish.preferredYBias || 0;
  const wy = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(swimVolume.minY + 0.25, swimVolume.maxY - 0.2, Math.random()) + yBias,
    swimVolume.minY + 0.15,
    swimVolume.maxY - 0.15
  );
  fish.waypoint.set(wx, wy, wz);
  fish.waypointTimer = 5.2 + Math.random() * 4.5;
}

function pickSchoolTarget() {
  const midZ = (swimVolume.minZ + swimVolume.maxZ) * 0.5;
  const goDeep = piranhaSchoolState.center.z > midZ ? Math.random() < 0.68 : Math.random() < 0.34;
  const wz = goDeep
    ? THREE.MathUtils.lerp(swimVolume.minZ + 1.2, midZ - 0.4, Math.random())
    : THREE.MathUtils.lerp(midZ + 0.4, swimVolume.maxZ - 1.3, Math.random());
  const spanX = halfXAtZ(wz);
  const targetSide = piranhaSchoolState.center.x > 0 ? -1 : 1;
  const wx = targetSide * (spanX * (0.28 + Math.random() * 0.48));
  const wy = THREE.MathUtils.lerp(swimVolume.minY + 0.45, swimVolume.maxY - 0.15, Math.random());
  piranhaSchoolState.target.set(wx, wy, wz);
  piranhaSchoolState.targetTimer = 4.6 + Math.random() * 4.2;
}

function triggerPiranhaEvade(p, threatPos) {
  if (!p || p.state === 'FLEE') return;
  p.state = 'EVADE';
  p.stateTimer = 0;
  p.evadeTimer = 0.65 + Math.random() * 0.35;
  p.evadeFrom.copy(threatPos);
  const s = params.fishScale * p.scaleRatio;
  spawnRipple(
    p.pos.x - Math.sin(p.heading) * (1.2 * s),
    p.pos.z - Math.cos(p.heading) * (1.2 * s),
    0.42
  );
}

function updatePiranhaSchool(dt, predators) {
  if (piranhaSchool.length === 0) return;

  if (isInspect) {
    const p = piranhaSchool[0];
    const bob = Math.sin(clockTime * 1.24) * 0.060;
    p.uniforms.uSwimPhase.value = clockTime * 3.45;
    p.uniforms.uTailAmp.value = 0.105;
    p.uniforms.uSpineCurve.value = 0.0;
    p.shadowGroup.visible = false;
    if (isPiranhaProfile) {
      p.group.visible = true;
      p.group.position.set(0, bob, 0);
      p.group.rotation.set(0, -1.22 + Math.sin(clockTime * 0.48) * 0.24, 0);
      p.group.scale.setScalar(1.0);
    } else if (isFishTrio) {
      const inspScale = Math.max(0.95, params.fishScale) * 0.94;
      p.group.visible = true;
      p.group.position.set(3.58, 0.15 + bob, -0.46);
      p.group.rotation.set(0, -1.43 + Math.sin(clockTime * 0.69) * 0.13, 0);
      p.group.scale.setScalar(inspScale * p.scaleRatio);
    } else {
      p.group.visible = false;
    }
    return;
  }

  // 1. Atualiza o centro real do cardume e o destino compartilhado
  piranhaSchoolState.center.set(0, 0, 0);
  for (let i = 0; i < piranhaSchool.length; i++) {
    piranhaSchoolState.center.add(piranhaSchool[i].pos);
  }
  piranhaSchoolState.center.divideScalar(piranhaSchool.length);
  algaeUniforms.uFishPos3.value.copy(piranhaSchoolState.center);

  piranhaSchoolState.targetTimer -= dt;
  const distToTarget = Math.hypot(
    piranhaSchoolState.target.x - piranhaSchoolState.center.x,
    piranhaSchoolState.target.z - piranhaSchoolState.center.z
  );
  if (distToTarget < 2.2 || piranhaSchoolState.targetTimer <= 0) {
    pickSchoolTarget();
  }

  if (piranhaSchoolState.hoverTimer > 0) {
    piranhaSchoolState.hoverTimer -= dt;
  } else {
    piranhaSchoolState.nextHoverIn -= dt;
    if (piranhaSchoolState.nextHoverIn <= 0 && baits.length === 0) {
      piranhaSchoolState.hoverTimer = 1.4 + Math.random() * 1.4;
      piranhaSchoolState.nextHoverIn = 5.2 + Math.random() * 4.5;
    }
  }
  const schoolHovering = piranhaSchoolState.hoverTimer > 0 && baits.length === 0;

  // 2. Atualiza cada piranha com forças de boids (separação, alinhamento, coesão) + frenesi de caça
  const scaleNorm = Math.max(0.70, params.fishScale);
  const mateSepR = baits.length > 0 ? 0.95 * scaleNorm : 1.38 * scaleNorm;
  const mateAlignR = 4.4;
  const bloodFrenzy = Math.min(1.0, activeBloodCount / 45.0);

  for (let idx = 0; idx < piranhaSchool.length; idx++) {
    const p = piranhaSchool[idx];
    p.group.visible = true;
    p.shadowGroup.visible = true;
    p.stateTimer += dt;
    if (p.fleeCooldown > 0) p.fleeCooldown -= dt;
    if (p.biteCooldown > 0) p.biteCooldown = Math.max(0, p.biteCooldown - dt);
    if (p.headShakeTimer > 0) p.headShakeTimer = Math.max(0, p.headShakeTimer - dt);

    const s = params.fishScale * p.scaleRatio;
    const patrolSpeed = params.baseSpeed * 1.04 * p.speedMult;

    // Rastro de sangue saindo da boca logo após morder o lambari
    if (p.bloodMouthTimer > 0) {
      p.bloodMouthTimer = Math.max(0, p.bloodMouthTimer - dt);
      p.bloodEmitAcc += dt;
      if (p.bloodEmitAcc >= 0.085) {
        p.bloodEmitAcc = 0;
        const mx = p.pos.x + Math.sin(p.heading) * (1.15 * s);
        const mz = p.pos.z + Math.cos(p.heading) * (1.15 * s);
        spawnBloodTrailDrop(mx, p.pos.y, mz, -Math.sin(p.heading) * 0.2, 0.02, -Math.cos(p.heading) * 0.2, 0.65);
      }
    }

    const huntingActive = baits.length > 0;

    // Reação arisca a movimento brusco do cursor (ignorada em frenesi de caça)
    if (!huntingActive && params.interactiveMouse && mouse.inside && mouse.moving && p.fleeCooldown <= 0) {
      const dMouse = Math.hypot(p.pos.x - mouse.world.x, p.pos.z - mouse.world.z);
      if (dMouse < 3.6 && mouse.speed > 4.2) {
        p.state = 'FLEE';
        p.stateTimer = 0;
        p.fleeTimer = 0.85 + Math.random() * 0.30;
        p.fleeCooldown = 0.65;
        p.fleeHeadingOffset = (Math.random() - 0.5) * 0.75;
        spawnRipple(p.pos.x, p.pos.z, 0.55);
      }
    }

    // Cautela ecológica frente aos tucunarés maiores (reduzida durante o frenesi de caça!)
    let nearestPred = null;
    let nearestPredDist = 999;
    for (let i = 0; i < predators.length; i++) {
      const pred = predators[i];
      const d = p.pos.distanceTo(pred.pos);
      if (d < nearestPredDist) {
        nearestPredDist = d;
        nearestPred = pred;
      }
    }
    if (!huntingActive && nearestPred && p.state !== 'FLEE' && p.state !== 'EVADE') {
      const dangerRadius = (nearestPred.state === 'STRIKE' || nearestPred.state === 'FLEE')
        ? 4.6 * scaleNorm
        : 2.75 * scaleNorm;
      if (nearestPredDist < dangerRadius) {
        triggerPiranhaEvade(p, nearestPred.pos);
      }
    }

    // Frenesi de caça agressiva ao lambari (prioriza presa mais próxima ou ferida/sangrando)
    let targetBait = null;
    let bestBaitScore = 999;
    if (huntingActive) {
      for (let i = 0; i < baits.length; i++) {
        const b = baits[i];
        const d = p.pos.distanceTo(b.pos);
        // Piranhas sentem o sangue e focam ainda mais em lambaris feridos
        const score = d - b.injury * 3.2;
        if (score < bestBaitScore) {
          bestBaitScore = score;
          targetBait = b;
        }
      }
      if (targetBait && p.state !== 'CHASE' && p.state !== 'STRIKE' && p.state !== 'ATTACK_TURN') {
        p.state = 'CHASE';
        p.stateTimer = 0;
      }
    } else if (p.state === 'CHASE' || p.state === 'STRIKE' || p.state === 'ATTACK_TURN') {
      p.state = 'SCHOOL';
      p.stateTimer = 0;
    }

    // Forças de boids em relação às companheiras de cardume
    let sepX = 0, sepY = 0, sepZ = 0;
    let alignX = 0, alignZ = 0, alignCount = 0;
    for (let j = 0; j < piranhaSchool.length; j++) {
      if (j === idx) continue;
      const m = piranhaSchool[j];
      const dx = p.pos.x - m.pos.x;
      const dy = p.pos.y - m.pos.y;
      const dz = p.pos.z - m.pos.z;
      const d3 = Math.hypot(dx, dy * 1.4, dz);
      if (d3 < mateSepR && d3 > 0.001) {
        const w = (1.0 - d3 / mateSepR) * (1.0 - d3 / mateSepR);
        sepX += (dx / d3) * w;
        sepY += (dy / d3) * w;
        sepZ += (dz / d3) * w;
      }
      if (d3 < mateAlignR) {
        alignX += Math.sin(m.heading);
        alignZ += Math.cos(m.heading);
        alignCount++;
      }
    }

    let thrustEffort = 0.24;
    let desiredDirX = Math.sin(p.heading);
    let desiredDirZ = Math.cos(p.heading);
    let desiredY = piranhaSchoolState.target.y + p.slotOffset.y;

    if (p.state === 'FLEE') {
      p.fleeTimer -= dt;
      const fleeSpd = patrolSpeed * 2.95;
      p.speed = THREE.MathUtils.lerp(p.speed, p.stateTimer < 0.30 ? fleeSpd : patrolSpeed * 1.15, Math.min(1, dt * 9.0));
      thrustEffort = p.stateTimer < 0.30 ? 1.50 : 0.45;
      const away = Math.atan2(p.pos.x - mouse.world.x, p.pos.z - mouse.world.z) + p.fleeHeadingOffset;
      desiredDirX = Math.sin(away);
      desiredDirZ = Math.cos(away);
      desiredY = THREE.MathUtils.clamp(p.pos.y + 0.30, swimVolume.minY + 0.3, swimVolume.maxY);
      if (p.fleeTimer <= 0) {
        p.state = 'SCHOOL';
        p.stateTimer = 0;
      }
    } else if (p.state === 'EVADE') {
      p.evadeTimer -= dt;
      const evadeSpd = patrolSpeed * 2.40;
      p.speed = THREE.MathUtils.lerp(p.speed, p.stateTimer < 0.25 ? evadeSpd : patrolSpeed * 1.05, Math.min(1, dt * 8.0));
      thrustEffort = p.stateTimer < 0.25 ? 1.25 : 0.38;
      const fanOffset = (p.schoolIndex - 2) * 0.22;
      const away = Math.atan2(p.pos.x - p.evadeFrom.x, p.pos.z - p.evadeFrom.z) + fanOffset;
      desiredDirX = Math.sin(away);
      desiredDirZ = Math.cos(away);
      desiredY = p.pos.y >= p.evadeFrom.y ? swimVolume.maxY - 0.25 : swimVolume.minY + 0.45;
      if (p.evadeTimer <= 0) {
        p.state = 'SCHOOL';
        p.stateTimer = 0;
      }
    } else if (p.state === 'ATTACK_TURN') {
      // Guinada explosiva após arrancar um naco para dar meia-volta e atacar novamente
      p.attackTurnTimer -= dt;
      const turnAng = p.heading + p.attackTurnDir * 1.35;
      desiredDirX = Math.sin(turnAng);
      desiredDirZ = Math.cos(turnAng);
      desiredY = targetBait ? THREE.MathUtils.clamp(targetBait.pos.y + (p.schoolIndex - 2) * 0.16, swimVolume.minY + 0.3, swimVolume.maxY) : p.pos.y;
      p.speed = THREE.MathUtils.lerp(p.speed, patrolSpeed * 2.55, Math.min(1, dt * 8.5));
      thrustEffort = 1.25;
      if (p.attackTurnTimer <= 0) {
        p.state = targetBait ? 'CHASE' : 'SCHOOL';
        p.stateTimer = 0;
      }
    } else if (p.state === 'CHASE' && targetBait) {
      // Interceptação preditiva + leve flanqueamento do cardume para cercar o lambari
      const distRaw = p.pos.distanceTo(targetBait.pos);
      const lead = THREE.MathUtils.clamp(distRaw / Math.max(2.5, p.speed * 1.45), 0.04, 0.38);
      const predX = targetBait.pos.x + targetBait.vel.x * lead;
      const predZ = targetBait.pos.z + targetBait.vel.z * lead;
      const toX = predX - p.pos.x;
      const toZ = predZ - p.pos.z;
      const horizDist = Math.max(0.01, Math.hypot(toX, toZ));
      const nx = toX / horizDist;
      const nz = toZ / horizDist;
      // Flanqueamento suave em média distância para cercar o lambari
      const flankWeight = horizDist > 2.4 ? (p.schoolIndex - 2) * 0.14 : 0.0;
      desiredDirX = nx - nz * flankWeight;
      desiredDirZ = nz + nx * flankWeight;
      desiredY = targetBait.pos.y;

      const targetHeading = Math.atan2(desiredDirX, desiredDirZ);
      const headingErr = Math.abs(normalizeAngle(targetHeading - p.heading));
      const chaseSpd = patrolSpeed * (2.35 + bloodFrenzy * 0.55);
      p.speed = THREE.MathUtils.lerp(p.speed, chaseSpd, Math.min(1, dt * 8.5));
      thrustEffort = 1.15 + bloodFrenzy * 0.30;

      if (horizDist < 3.4 && headingErr < 0.68 && p.biteCooldown <= 0) {
        p.state = 'STRIKE';
        p.stateTimer = 0;
        p.strikeDuration = 0.38;
        spawnRipple(p.pos.x, p.pos.z, 0.65);
      }
    } else if (p.state === 'STRIKE') {
      const pr = Math.min(p.stateTimer / p.strikeDuration, 1.0);
      const impulse = Math.sin(pr * Math.PI);
      const strikeSpd = patrolSpeed * (3.35 + 0.65 * impulse + bloodFrenzy * 0.45);
      p.speed = THREE.MathUtils.lerp(p.speed, strikeSpd, Math.min(1, dt * 13.0));
      thrustEffort = 1.35 + 0.55 * impulse;
      if (targetBait) {
        const lead = 0.09;
        const toX = (targetBait.pos.x + targetBait.vel.x * lead) - p.pos.x;
        const toZ = (targetBait.pos.z + targetBait.vel.z * lead) - p.pos.z;
        const len = Math.max(0.01, Math.hypot(toX, toZ));
        desiredDirX = toX / len;
        desiredDirZ = toZ / len;
        desiredY = targetBait.pos.y;

        const mouthX = p.pos.x + Math.sin(p.heading) * (1.22 * s);
        const mouthZ = p.pos.z + Math.cos(p.heading) * (1.22 * s);
        const mouthDist = Math.hypot(mouthX - targetBait.pos.x, p.pos.y - targetBait.pos.y, mouthZ - targetBait.pos.z);
        if (mouthDist < 0.96 * Math.max(0.68, s) && p.biteCooldown <= 0) {
          const biteDamage = 34 + Math.random() * 18;
          const killed = damageLambari(targetBait, biteDamage, p, false);
          p.biteCooldown = 0.52 + Math.random() * 0.24;
          p.attackTurnDir = (Math.random() < 0.5 ? -1 : 1);
          p.attackTurnTimer = killed ? 0.38 : 0.26;
          p.state = 'ATTACK_TURN';
          p.stateTimer = 0;
          if (killed) pickSchoolTarget();
        }
      }
      if (p.state === 'STRIKE' && p.stateTimer >= p.strikeDuration) {
        p.state = targetBait ? 'CHASE' : 'SCHOOL';
        p.stateTimer = 0;
      }
    } else {
      // SCHOOL: nado em cardume fluido (alvo compartilhado + coesão + alinhamento + dart-and-pause)
      p.dartCycleTimer -= dt;
      if (p.dartCycleTimer <= 0) {
        p.dartBurstLeft = 0.25 + Math.random() * 0.28;
        p.dartCycleTimer = 1.15 + Math.random() * 1.15;
      }
      const isDarting = !schoolHovering && p.dartBurstLeft > 0;
      if (isDarting) p.dartBurstLeft -= dt;

      const goalX = piranhaSchoolState.target.x + p.slotOffset.x * 0.85 - p.pos.x;
      const goalZ = piranhaSchoolState.target.z + p.slotOffset.z * 0.85 - p.pos.z;
      const goalLen = Math.max(0.01, Math.hypot(goalX, goalZ));

      const cohX = (piranhaSchoolState.center.x + p.slotOffset.x * 0.7) - p.pos.x;
      const cohZ = (piranhaSchoolState.center.z + p.slotOffset.z * 0.7) - p.pos.z;
      const cohDist = Math.hypot(cohX, cohZ);
      const cohWeight = cohDist > 2.4 ? 1.65 : 0.75;

      let dirX = (goalX / goalLen) * 1.35 + (cohDist > 0.01 ? (cohX / cohDist) * cohWeight : 0);
      let dirZ = (goalZ / goalLen) * 1.35 + (cohDist > 0.01 ? (cohZ / cohDist) * cohWeight : 0);
      if (alignCount > 0) {
        dirX += (alignX / alignCount) * 1.25;
        dirZ += (alignZ / alignCount) * 1.25;
      }

      if (schoolHovering) {
        p.speed = THREE.MathUtils.lerp(p.speed, 0.22, Math.min(1, dt * 3.2));
        thrustEffort = 0.09;
        if (nearestPred && nearestPredDist < 7.0) {
          const tx = nearestPred.pos.x - p.pos.x;
          const tz = nearestPred.pos.z - p.pos.z;
          const tl = Math.max(0.01, Math.hypot(tx, tz));
          dirX = THREE.MathUtils.lerp(dirX, tx / tl, 0.55);
          dirZ = THREE.MathUtils.lerp(dirZ, tz / tl, 0.55);
        }
      } else {
        const catchUp = cohDist > 3.0 ? 1.22 : 1.0;
        const targetSpd = (isDarting ? patrolSpeed * 1.24 : patrolSpeed * 0.82) * catchUp;
        p.speed = THREE.MathUtils.lerp(p.speed, targetSpd, Math.min(1, dt * (isDarting ? 4.4 : 2.2)));
        thrustEffort = isDarting ? 0.54 : 0.18;
      }

      const dLen = Math.max(0.01, Math.hypot(dirX, dirZ));
      desiredDirX = dirX / dLen;
      desiredDirZ = dirZ / dLen;
      desiredY = THREE.MathUtils.lerp(piranhaSchoolState.center.y, piranhaSchoolState.target.y, 0.45) + p.slotOffset.y;
    }

    // Contenção adaptativa à perspectiva + separação do cardume + evasão suave de tucunarés
    const localHalfX = halfXAtZ(p.pos.z);
    const marginX = 1.45;
    const safeX = localHalfX - marginX;
    let steerX = desiredDirX * 3.2 + sepX * 5.8;
    let steerZ = desiredDirZ * 3.2 + sepZ * 5.8;
    desiredY += sepY * 1.2;

    if (Math.abs(p.pos.x) > safeX) {
      const over = (Math.abs(p.pos.x) - safeX) / marginX;
      steerX -= Math.sign(p.pos.x) * over * over * 9.5;
    }
    if (p.pos.z > swimVolume.maxZ - 0.9) {
      const over = (p.pos.z - (swimVolume.maxZ - 0.9)) / 1.0;
      steerZ -= over * over * 9.5;
    } else if (p.pos.z < swimVolume.minZ + 0.8) {
      const over = ((swimVolume.minZ + 0.8) - p.pos.z) / 1.0;
      steerZ += over * over * 9.5;
    }

    const predSepR = huntingActive ? 1.55 * scaleNorm : 3.2 * scaleNorm;
    const predSepW = huntingActive ? 2.4 : 6.5;
    for (let i = 0; i < predators.length; i++) {
      const pred = predators[i];
      const dx = p.pos.x - pred.pos.x;
      const dz = p.pos.z - pred.pos.z;
      const dH = Math.hypot(dx, dz);
      if (dH < predSepR && dH > 0.001) {
        const push = 1.0 - dH / predSepR;
        steerX += (dx / dH) * push * predSepW;
        steerZ += (dz / dH) * push * predSepW;
      }
    }

    const desiredHeading = Math.atan2(steerX, steerZ);
    const angleDiff = normalizeAngle(desiredHeading - p.heading);
    const huntingTurn = p.state === 'CHASE' || p.state === 'STRIKE' || p.state === 'ATTACK_TURN';
    const agileTurn = huntingTurn || p.state === 'FLEE' || p.state === 'EVADE';
    const maxTurn = huntingTurn ? 6.4 : (agileTurn ? 4.8 : (schoolHovering ? 1.5 : 2.7));
    const turnGain = huntingTurn ? 7.2 : (agileTurn ? 5.2 : 2.7);
    const targetAngVel = THREE.MathUtils.clamp(angleDiff * turnGain, -maxTurn, maxTurn);
    p.angularVelocity = THREE.MathUtils.lerp(p.angularVelocity, targetAngVel, Math.min(1, dt * (huntingTurn ? 10.5 : 6.5)));

    p.heading = normalizeAngle(p.heading + p.angularVelocity * dt);
    p.pos.x += Math.sin(p.heading) * p.speed * dt;
    p.pos.z += Math.cos(p.heading) * p.speed * dt;

    const clampedY = THREE.MathUtils.clamp(desiredY, swimVolume.minY + 0.25, swimVolume.maxY);
    const yRate = huntingTurn ? 2.8 : 1.5;
    const targetVelY = THREE.MathUtils.clamp((clampedY - p.pos.y) * yRate, -2.2, 2.2);
    p.velY = THREE.MathUtils.lerp(p.velY, targetVelY, Math.min(1, dt * (huntingTurn ? 5.5 : 3.0)));
    p.pos.y = THREE.MathUtils.clamp(p.pos.y + p.velY * dt, swimVolume.minY + 0.25, swimVolume.maxY);

    const targetPitch = THREE.MathUtils.clamp(-p.velY / Math.max(1.0, p.speed + 0.7) * 0.36, -0.26, 0.24);
    p.pitch = THREE.MathUtils.lerp(p.pitch, targetPitch, Math.min(1, dt * 4.5));
    const targetRoll = THREE.MathUtils.clamp(-p.angularVelocity * 0.14 * Math.min(1, p.speed * 0.5), -0.32, 0.32);
    p.roll = THREE.MathUtils.lerp(p.roll, targetRoll, Math.min(1, dt * 4.8));

    // Acoplamento corpo/cauda/curva + chacoalhão da mordida + sombra
    const rawAccel = (p.speed - p.prevSpeed) / Math.max(dt, 0.001);
    p.prevSpeed = p.speed;
    const targetEffort = THREE.MathUtils.clamp(thrustEffort + Math.max(0, rawAccel) * 0.18, 0.08, 1.95);
    p.smoothEffort = THREE.MathUtils.lerp(p.smoothEffort, targetEffort, Math.min(1, dt * 7.5));

    p.swimPhase += (2.6 + p.smoothEffort * 11.2) * dt;
    const shakeCurve = p.headShakeTimer > 0 ? Math.sin(clockTime * 44.0 + p.schoolIndex) * 0.52 * (p.headShakeTimer / 0.24) : 0;
    p.smoothSpineCurve = THREE.MathUtils.lerp(p.smoothSpineCurve, p.angularVelocity * 0.34, Math.min(1, dt * 6.5));
    p.uniforms.uSwimPhase.value = p.swimPhase;
    p.uniforms.uTailAmp.value = 0.065 + p.smoothEffort * 0.22;
    p.uniforms.uSpineCurve.value = p.smoothSpineCurve + shakeCurve;

    const bobY = Math.sin(clockTime * 1.85 + p.schoolIndex * 1.3) * 0.032;
    const finalY = p.pos.y + bobY;
    p.group.position.set(p.pos.x, finalY, p.pos.z);
    p.group.rotation.set(p.pitch, p.heading, p.roll);
    p.group.scale.setScalar(s);

    const heightAboveBed = Math.max(0.4, finalY - RIVERBED_Y);
    const shadowSpread = 1.0 + heightAboveBed * 0.08;
    p.shadowGroup.position.set(
      p.pos.x + heightAboveBed * 0.30,
      RIVERBED_Y + 0.14,
      p.pos.z - heightAboveBed * 0.16
    );
    p.shadowGroup.rotation.y = p.heading;
    p.shadowGroup.scale.set(s * shadowSpread, s, s * shadowSpread);
    p.shadowMat.uniforms.uShadowOpacity.value = THREE.MathUtils.clamp(0.26 - heightAboveBed * 0.034, 0.07, 0.23);
  }
}

function triggerPredatorBurst(fish, intensity = 1.0) {
  fish.state = 'STRIKE';
  fish.stateTimer = 0;
  fish.strikeDuration = 0.36 + Math.random() * 0.14;
  const tailDist = 2.4 * params.fishScale;
  spawnRipple(
    fish.pos.x - Math.sin(fish.heading) * tailDist,
    fish.pos.z - Math.cos(fish.heading) * tailDist,
    0.95 * intensity
  );
}

function triggerPredatorFlee(fish) {
  fish.state = 'FLEE';
  fish.stateTimer = 0;
  fish.fleeTimer = 0.95 + Math.random() * 0.35;
  fish.fleeCooldown = 0.55;
  fish.fleeHeadingOffset = (Math.random() - 0.5) * 0.55;
  const tailDist = 2.4 * params.fishScale;
  spawnRipple(
    fish.pos.x - Math.sin(fish.heading) * tailDist,
    fish.pos.z - Math.cos(fish.heading) * tailDist,
    1.15
  );
}

function updateTucunare(fish, dt, peers = []) {
  if (isInspect) {
    const isFish2 = fish.id === 2;
    if (isPiranhaProfile || (inspectFish === '1' && isFish2) || (inspectFish === '2' && !isFish2)) {
      fish.group.visible = false;
      fish.shadowGroup.visible = false;
      return;
    }
    fish.group.visible = true;
    fish.shadowGroup.visible = true;

    // Modo inspeção: tucunaré pairando para conferência visual detalhada
    const inspScale = Math.max(0.95, params.fishScale);
    const ratio = fish.scaleRatio || 1.0;
    fish.swimPhase += 2.2 * dt;
    fish.breathPhase += 2.4 * dt;
    fish.idleDriftPhase += 1.6 * dt;
    fish.pectRowPhase += 3.2 * dt;
    fish.uniforms.uSwimPhase.value = fish.swimPhase;
    fish.uniforms.uTailAmp.value = inspectFish === '2' ? 0.045 : 0.11;
    fish.uniforms.uSpineCurve.value = inspectFish === '2' ? 0.02 : 0.06;
    fish.uniforms.uPectoralSpread.value = 0.48;
    fish.uniforms.uPectoralRowL.value = Math.sin(fish.pectRowPhase) * 0.14;
    fish.uniforms.uPectoralRowR.value = -Math.sin(fish.pectRowPhase) * 0.14;
    fish.uniforms.uDorsalFlare.value = 0.94;
    fish.uniforms.uBreathPhase.value = fish.breathPhase;
    fish.uniforms.uIdleDriftPhase.value = fish.idleDriftPhase;
    fish.uniforms.uMouthOpen.value = isInspectMouth ? 0.95 : 0.0;

    if (inspectFish === '2') {
      const rotY2 = inspectAngle === '34' ? -Math.PI * 0.42 : -Math.PI * 0.5;
      const rotX2 = inspectAngle === '34' ? -0.04 : 0.0;
      fish.group.position.set(0, 0.0, 0);
      fish.group.rotation.set(rotX2, rotY2, 0);
      fish.group.scale.setScalar(inspScale * 1.12);
      fish.shadowGroup.position.set(0.95, RIVERBED_Y + 0.14, -0.45);
      fish.shadowGroup.rotation.y = rotY2;
      fish.shadowGroup.scale.setScalar(inspScale * 1.22);
    } else if (inspectFish === '1') {
      fish.group.position.set(0, 0.05, 0);
      fish.group.rotation.set(-0.04, Math.PI * 0.44, 0);
      fish.group.scale.setScalar(inspScale * 1.15);
      fish.shadowGroup.position.set(0.95, RIVERBED_Y + 0.14, -0.45);
      fish.shadowGroup.rotation.y = Math.PI * 0.44;
      fish.shadowGroup.scale.setScalar(inspScale * 1.25);
    } else {
      // A comparação com três peixes abre espaço entre as nadadeiras.
      const yOff = (isFish2 ? -1 : 1) * (isFishTrio ? 1.43 : 1.28);
      const rotYBoth = inspectAngle === '34' ? -Math.PI * 0.43 : -Math.PI * 0.5;
      fish.group.position.set(isFishTrio ? -2.05 : 0, yOff, 0);
      fish.group.rotation.set(0.0, rotYBoth, 0);
      fish.group.scale.setScalar(inspScale * 0.94 * ratio);
      fish.shadowGroup.visible = false;
    }
    return;
  }

  fish.group.visible = true;
  fish.shadowGroup.visible = true;

  fish.stateTimer += dt;
  if (fish.fleeCooldown > 0) fish.fleeCooldown -= dt;
  if (fish.biteCooldown > 0) fish.biteCooldown = Math.max(0, fish.biteCooldown - dt);
  if (fish.headShakeTimer > 0) fish.headShakeTimer = Math.max(0, fish.headShakeTimer - dt);

  const s = params.fishScale * (fish.scaleRatio || 1.0);
  const patrolSpeed = params.baseSpeed * (fish.speedMult || 1.0);
  const hoverFactor = (fish.hoverMult || 1.0) * params.ambushTendency;
  const strikePeakSpeed = patrolSpeed * 4.15;

  // Rastro de sangue saindo da boca do tucunaré após atacar o lambari
  if (fish.bloodMouthTimer > 0) {
    fish.bloodMouthTimer = Math.max(0, fish.bloodMouthTimer - dt);
    fish.bloodEmitAcc += dt;
    if (fish.bloodEmitAcc >= 0.075) {
      fish.bloodEmitAcc = 0;
      const mx = fish.pos.x + Math.sin(fish.heading) * (1.95 * s);
      const mz = fish.pos.z + Math.cos(fish.heading) * (1.95 * s);
      spawnBloodTrailDrop(mx, fish.pos.y, mz, -Math.sin(fish.heading) * 0.22, 0.02, -Math.cos(fish.heading) * 0.22, 0.92);
    }
  }

  const hasPrey = baits.length > 0;

  // 1. Reação defensiva a movimento brusco muito próximo (ignorada quando está caçando lambari)
  if (!hasPrey && params.interactiveMouse && mouse.inside && mouse.moving && fish.fleeCooldown <= 0) {
    const dMouse = Math.hypot(fish.pos.x - mouse.world.x, fish.pos.z - mouse.world.z);
    if (dMouse < 3.4 && mouse.speed > 5.5) {
      triggerPredatorFlee(fish);
    }
  }

  // 2. Caça agressiva aos lambaris na água (ambos os tucunarés caçam ativamente!)
  let nearestBait = null;
  let nearestBaitScore = 999;
  const otherTucunare = peers.find(peer => peer && peer.species === 'tucunare');
  if (hasPrey) {
    for (let i = 0; i < baits.length; i++) {
      const b = baits[i];
      const d = fish.pos.distanceTo(b.pos);
      let score = d - b.injury * 2.0;
      // Se houver mais de um lambari, evita que ambos escolham sempre o mesmo alvo distante
      if (baits.length > 1 && otherTucunare && (otherTucunare.state === 'CHASE' || otherTucunare.state === 'STRIKE')) {
        const dOther = otherTucunare.pos.distanceTo(b.pos);
        if (dOther + 0.5 < d) score += 2.8;
      }
      if (score < nearestBaitScore) {
        nearestBaitScore = score;
        nearestBait = b;
      }
    }
    if (nearestBait && fish.state !== 'CHASE' && fish.state !== 'STRIKE') {
      fish.state = 'CHASE';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'CHASE') {
    fish.state = 'PATROL';
    fish.stateTimer = 0;
  }

  // 3. Máquina de estados
  let thrustEffort = 0.18;
  let targetDorsalFlare = 0.62;
  let targetMouthOpen = 0.0;
  let desiredDirX = Math.sin(fish.heading);
  let desiredDirZ = Math.cos(fish.heading);
  let desiredY = fish.targetY;
  if (fish.biteSnapTimer > 0) fish.biteSnapTimer = Math.max(0, fish.biteSnapTimer - dt);

  if (fish.state === 'FLEE') {
    fish.fleeTimer -= dt;
    targetDorsalFlare = 1.0;
    const fleeSpeed = patrolSpeed * 3.0;
    if (fish.stateTimer < 0.34) {
      fish.speed = THREE.MathUtils.lerp(fish.speed, fleeSpeed, Math.min(1, dt * 10.0));
      thrustEffort = 1.55;
    } else {
      fish.speed = THREE.MathUtils.lerp(fish.speed, patrolSpeed * 1.05, Math.min(1, dt * 2.6));
      thrustEffort = 0.42;
    }
    const awayAng = Math.atan2(fish.pos.x - mouse.world.x, fish.pos.z - mouse.world.z) + fish.fleeHeadingOffset;
    desiredDirX = Math.sin(awayAng);
    desiredDirZ = Math.cos(awayAng);

    if (fish.fleeTimer <= 0) {
      fish.state = 'COAST';
      fish.stateTimer = 0;
      pickPatrolWaypoint(fish);
    }
  } else if (fish.state === 'CHASE' && nearestBait) {
    // Perseguição explosiva com interceptação preditiva do lambari em fuga
    targetDorsalFlare = 1.0;
    const rawDist = fish.pos.distanceTo(nearestBait.pos);
    const lead = THREE.MathUtils.clamp(rawDist / Math.max(3.0, fish.speed * 1.4), 0.05, 0.42);
    const predX = nearestBait.pos.x + nearestBait.vel.x * lead;
    const predZ = nearestBait.pos.z + nearestBait.vel.z * lead;
    const toX = predX - fish.pos.x;
    const toZ = predZ - fish.pos.z;
    const horizDist = Math.max(0.01, Math.hypot(toX, toZ));
    desiredDirX = toX / horizDist;
    desiredDirZ = toZ / horizDist;
    desiredY = nearestBait.pos.y;

    const targetHeading = Math.atan2(desiredDirX, desiredDirZ);
    const headingErr = Math.abs(normalizeAngle(targetHeading - fish.heading));

    const chaseSpd = patrolSpeed * (rawDist > 3.5 ? 2.55 : 2.25);
    fish.speed = THREE.MathUtils.lerp(fish.speed, chaseSpd, Math.min(1, dt * 7.8));
    thrustEffort = 1.15;

    if (rawDist < 3.6) {
      targetMouthOpen = THREE.MathUtils.clamp((3.6 - rawDist) / 2.6, 0.12, 0.65);
    }

    if (horizDist < 4.5 && headingErr < 0.58 && fish.biteCooldown <= 0) {
      triggerPredatorBurst(fish, 1.35);
      fish.strikeDuration = 0.44;
    }
  } else if (fish.state === 'STRIKE') {
    targetDorsalFlare = 1.0;
    const p = Math.min(fish.stateTimer / fish.strikeDuration, 1.0);
    const impulse = Math.sin(p * Math.PI);
    const accel = (strikePeakSpeed - patrolSpeed) * 6.2 * (0.45 + 0.55 * impulse);
    fish.speed = Math.min(strikePeakSpeed * 1.18, fish.speed + accel * dt);
    thrustEffort = 1.15 + 0.85 * impulse;

    if (nearestBait) {
      const lead = 0.08;
      const toX = (nearestBait.pos.x + nearestBait.vel.x * lead) - fish.pos.x;
      const toZ = (nearestBait.pos.z + nearestBait.vel.z * lead) - fish.pos.z;
      const len = Math.max(0.01, Math.hypot(toX, toZ));
      desiredDirX = toX / len;
      desiredDirZ = toZ / len;
      desiredY = nearestBait.pos.y;

      const mouthX = fish.pos.x + Math.sin(fish.heading) * (2.05 * s);
      const mouthZ = fish.pos.z + Math.cos(fish.heading) * (2.05 * s);
      const mouthDist = Math.hypot(mouthX - nearestBait.pos.x, fish.pos.y - nearestBait.pos.y, mouthZ - nearestBait.pos.z);

      // Abre a boca com força total para abocanhar o lambari no bote!
      if (mouthDist < 3.2 * Math.max(0.75, s)) {
        targetMouthOpen = THREE.MathUtils.clamp(1.0 - (mouthDist - 0.65 * s) / (2.4 * Math.max(0.75, s)), 0.25, 1.0);
      }

      if (mouthDist < 1.18 * Math.max(0.75, s) && fish.biteCooldown <= 0) {
        // Ataque violento do tucunaré: pode abater no primeiro bote ou deixar agonizando em sangue
        const biteDamage = 65 + Math.random() * 48;
        const killed = damageLambari(nearestBait, biteDamage, fish, true);
        fish.biteSnapTimer = 0.28;
        fish.biteCooldown = 0.42;
        if (killed) {
          fish.state = 'COAST';
          fish.stateTimer = 0;
          pickPatrolWaypoint(fish);
        } else {
          // Lambari escapou ferido — tucunaré já volta à perseguição imediatamente!
          fish.state = 'CHASE';
          fish.stateTimer = 0;
        }
      }
    }

    if (fish.state === 'STRIKE' && fish.stateTimer >= fish.strikeDuration) {
      fish.state = nearestBait ? 'CHASE' : 'COAST';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'COAST') {
    targetDorsalFlare = 0.68;
    const floorSpd = patrolSpeed * 0.42;
    const excess = Math.max(0, fish.speed - floorSpd);
    fish.speed = floorSpd + excess * Math.exp(-1.55 * dt);
    thrustEffort = 0.06;

    const toX = fish.waypoint.x - fish.pos.x;
    const toZ = fish.waypoint.z - fish.pos.z;
    const len = Math.max(0.01, Math.hypot(toX, toZ));
    desiredDirX = toX / len;
    desiredDirZ = toZ / len;
    desiredY = fish.waypoint.y;

    if (fish.stateTimer > 1.2 && fish.speed < patrolSpeed * 0.92) {
      if (Math.random() < 0.48 * hoverFactor) {
        fish.state = 'HOVER';
        fish.stateTimer = 0;
        fish.hoverDuration = (2.6 + Math.random() * 3.2) * hoverFactor;
      } else {
        fish.state = 'PATROL';
        fish.stateTimer = 0;
      }
    }
  } else if (fish.state === 'HOVER') {
    // ESPAIRAR: suspenso quase imóvel, peitorais remando suavemente, cauda flutuando
    targetDorsalFlare = 0.74;
    fish.speed = THREE.MathUtils.lerp(fish.speed, 0.11, Math.min(1, dt * 2.5));
    thrustEffort = 0.04;
    fish.hoverDuration -= dt;

    if (params.interactiveMouse && mouse.inside && mouse.stillTime > 1.1) {
      const toX = mouse.world.x - fish.pos.x;
      const toZ = mouse.world.z - fish.pos.z;
      const len = Math.max(0.01, Math.hypot(toX, toZ));
      desiredDirX = toX / len;
      desiredDirZ = toZ / len;
      targetDorsalFlare = 0.88;
    }

    if (fish.hoverDuration <= 0) {
      fish.state = 'PATROL';
      fish.stateTimer = 0;
      fish.nextHoverIn = (4.4 + Math.random() * 4.5) / Math.max(0.3, params.ambushTendency);
      pickPatrolWaypoint(fish);
    }
  } else {
    // PATROL com ritmo orgânico de 1-2 batidas de cauda + deslize suave (kick-and-glide)
    fish.waypointTimer -= dt;
    fish.nextHoverIn -= dt;

    const dWp = Math.hypot(fish.waypoint.x - fish.pos.x, fish.waypoint.z - fish.pos.z);
    if (dWp < 1.8 || fish.waypointTimer <= 0) {
      pickPatrolWaypoint(fish);
    }

    fish.kickCycleTimer -= dt;
    if (fish.kickCycleTimer <= 0) {
      fish.kickBurstLeft = 0.45 + Math.random() * 0.45;
      fish.kickCycleTimer = 1.65 + Math.random() * 1.45;
    }
    const isKicking = fish.kickBurstLeft > 0;
    if (isKicking) fish.kickBurstLeft -= dt;

    const targetSpd = isKicking ? patrolSpeed * 1.18 : patrolSpeed * 0.78;
    fish.speed = THREE.MathUtils.lerp(fish.speed, targetSpd, Math.min(1, dt * (isKicking ? 3.2 : 1.4)));
    thrustEffort = isKicking ? 0.42 : 0.10;

    let sx = (fish.waypoint.x - fish.pos.x) / Math.max(0.01, dWp);
    let sz = (fish.waypoint.z - fish.pos.z) / Math.max(0.01, dWp);

    if (params.interactiveMouse && mouse.inside && mouse.stillTime > 1.8) {
      const ramp = Math.min(1.0, (mouse.stillTime - 1.8) / 2.2);
      const toX = mouse.world.x - fish.pos.x;
      const toZ = mouse.world.z - fish.pos.z;
      const dist = Math.max(0.1, Math.hypot(toX, toZ));
      const nx = toX / dist, nz = toZ / dist;
      const tx = -nz * fish.curiosityOrbitSign, tz = nx * fish.curiosityOrbitSign;
      if (dist > 3.2) {
        sx = THREE.MathUtils.lerp(sx, nx * 0.85 + tx * 0.35, ramp * 0.75);
        sz = THREE.MathUtils.lerp(sz, nz * 0.85 + tz * 0.35, ramp * 0.75);
      } else {
        sx = THREE.MathUtils.lerp(sx, tx, ramp * 0.75);
        sz = THREE.MathUtils.lerp(sz, tz, ramp * 0.75);
      }
      targetDorsalFlare = THREE.MathUtils.lerp(targetDorsalFlare, 0.82, ramp);
    }

    desiredDirX = sx;
    desiredDirZ = sz;
    desiredY = fish.waypoint.y;

    if (fish.nextHoverIn <= 0 && Math.abs(fish.pos.x) < swimVolume.halfX * 0.72) {
      fish.state = 'HOVER';
      fish.stateTimer = 0;
      fish.hoverDuration = (2.8 + Math.random() * 3.4) * hoverFactor;
    }
  }

  // Alerta territorial sutil quando alguma piranha do cardume passa muito próxima à frente
  if (fish.state === 'PATROL' || fish.state === 'HOVER') {
    const alertDist = 3.0 * Math.max(0.75, params.fishScale);
    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i];
      if (!peer || peer.species !== 'piranha') continue;
      const dxP = peer.pos.x - fish.pos.x;
      const dzP = peer.pos.z - fish.pos.z;
      const dP = Math.hypot(dxP, dzP);
      if (dP < alertDist && dP > 0.001) {
        const fwdDot = (dxP * Math.sin(fish.heading) + dzP * Math.cos(fish.heading)) / dP;
        if (fwdDot > 0.25) {
          targetDorsalFlare = Math.max(targetDorsalFlare, 0.92);
          break;
        }
      }
    }
  }

  // 4. Contenção suave no volume isométrico adaptada à profundidade Z
  const localHalfX = halfXAtZ(fish.pos.z);
  const marginX = 1.65;
  const safeX = localHalfX - marginX;
  let steerX = desiredDirX * 3.0;
  let steerZ = desiredDirZ * 3.0;

  if (Math.abs(fish.pos.x) > safeX) {
    const over = (Math.abs(fish.pos.x) - safeX) / marginX;
    steerX -= Math.sign(fish.pos.x) * over * over * 9.5;
  }
  if (fish.pos.z > swimVolume.maxZ - 1.0) {
    const over = (fish.pos.z - (swimVolume.maxZ - 1.0)) / 1.1;
    steerZ -= over * over * 9.5;
  } else if (fish.pos.z < swimVolume.minZ + 1.0) {
    const over = ((swimVolume.minZ + 1.0) - fish.pos.z) / 1.1;
    steerZ += over * over * 9.5;
  }

  // Separação suave multi-peixe proporcional ao tamanho atual
  const scaleNorm = Math.max(0.72, params.fishScale);
  for (let i = 0; i < peers.length; i++) {
    const peer = peers[i];
    if (!peer) continue;
    const dxSep = fish.pos.x - peer.pos.x;
    const dzSep = fish.pos.z - peer.pos.z;
    const dHoriz = Math.hypot(dxSep, dzSep);
    const isTuc = peer.species === 'tucunare';
    const sepR = (isTuc ? 3.2 : 2.0) * scaleNorm;
    const sepW = isTuc ? 5.5 : 2.2;
    if (dHoriz < sepR && dHoriz > 0.001) {
      const push = 1.0 - dHoriz / sepR;
      steerX += (dxSep / dHoriz) * push * sepW;
      steerZ += (dzSep / dHoriz) * push * sepW;
    }
    if (isTuc && dHoriz < 2.2 * scaleNorm) {
      const dySep = fish.pos.y - peer.pos.y;
      if (Math.abs(dySep) < 0.75) {
        desiredY += (fish.id === 2 ? -1 : 1) * 0.45 * (1.0 - dHoriz / (2.2 * scaleNorm));
      }
    }
  }

  const desiredHeading = Math.atan2(steerX, steerZ);
  const angleDiff = normalizeAngle(desiredHeading - fish.heading);

  const huntingMode = fish.state === 'CHASE' || fish.state === 'STRIKE';
  const maxTurn = huntingMode ? 5.0 : (fish.state === 'FLEE' ? 3.6 : (fish.state === 'HOVER' ? 0.85 : 1.55));
  const turnGain = huntingMode ? 5.8 : (fish.state === 'FLEE' ? 3.8 : (fish.state === 'HOVER' ? 1.15 : 1.85));
  const targetAngVel = THREE.MathUtils.clamp(angleDiff * turnGain, -maxTurn, maxTurn);
  fish.angularVelocity = THREE.MathUtils.lerp(fish.angularVelocity, targetAngVel, Math.min(1, dt * (huntingMode ? 8.5 : 4.5)));

  fish.heading = normalizeAngle(fish.heading + fish.angularVelocity * dt);
  fish.pos.x += Math.sin(fish.heading) * fish.speed * dt;
  fish.pos.z += Math.cos(fish.heading) * fish.speed * dt;

  const clampedDesiredY = THREE.MathUtils.clamp(desiredY, swimVolume.minY, swimVolume.maxY);
  const targetVelY = THREE.MathUtils.clamp((clampedDesiredY - fish.pos.y) * (huntingMode ? 2.4 : 1.1), huntingMode ? -2.2 : -1.0, huntingMode ? 2.2 : 1.0);
  fish.velY = THREE.MathUtils.lerp(fish.velY, targetVelY, Math.min(1, dt * (huntingMode ? 4.8 : 2.2)));
  fish.pos.y = THREE.MathUtils.clamp(fish.pos.y + fish.velY * dt, swimVolume.minY, swimVolume.maxY);

  const hoverPitchBias = fish.state === 'HOVER' ? -0.05 : 0.0;
  const targetPitch = THREE.MathUtils.clamp(-fish.velY / Math.max(1.2, fish.speed + 0.8) * 0.40 + hoverPitchBias, -0.28, 0.26);
  fish.pitch = THREE.MathUtils.lerp(fish.pitch, targetPitch, Math.min(1, dt * 3.8));

  const targetRoll = THREE.MathUtils.clamp(-fish.angularVelocity * 0.14 * Math.min(1, fish.speed * 0.5), -0.30, 0.30);
  fish.roll = THREE.MathUtils.lerp(fish.roll, targetRoll, Math.min(1, dt * 4.2));

  const rawAccel = (fish.speed - fish.prevSpeed) / Math.max(dt, 0.001);
  fish.acceleration = THREE.MathUtils.lerp(fish.acceleration, rawAccel, Math.min(1, dt * 7.5));
  fish.prevSpeed = fish.speed;

  // 5. Acoplamento corpo-física + chacoalhão de ataque
  const accelBoost = Math.max(0, fish.acceleration) * 0.18;
  const targetEffort = THREE.MathUtils.clamp(thrustEffort + accelBoost, 0.03, 2.0);
  fish.smoothEffort = THREE.MathUtils.lerp(fish.smoothEffort, targetEffort, Math.min(1, dt * 6.5));

  const swimFreq = 1.8 + fish.smoothEffort * 9.6;
  fish.swimPhase += swimFreq * dt;
  fish.breathPhase += (2.3 + fish.smoothEffort * 2.0) * dt;
  fish.idleDriftPhase += 1.55 * dt;

  const tailAmp = 0.045 + fish.smoothEffort * 0.32;
  const tucShake = fish.headShakeTimer > 0 ? Math.sin(clockTime * 38.0 + (fish.id || 1)) * 0.62 * (fish.headShakeTimer / 0.34) : 0;
  fish.smoothSpineCurve = THREE.MathUtils.lerp(fish.smoothSpineCurve, fish.angularVelocity * 0.48, Math.min(1, dt * 6.2));
  fish.smoothDorsalFlare = THREE.MathUtils.lerp(fish.smoothDorsalFlare, targetDorsalFlare, Math.min(1, dt * 4.8));

  const fastMode = fish.state === 'CHASE' || fish.state === 'STRIKE' || fish.state === 'FLEE';
  const hoverMode = fish.state === 'HOVER';
  const targetSpread = fastMode ? 0.05 : (hoverMode ? 0.56 : 0.34);
  fish.smoothPectSpread = THREE.MathUtils.lerp(fish.smoothPectSpread, targetSpread, Math.min(1, dt * 4.2));

  fish.pectRowPhase += (hoverMode ? 3.5 : 2.0) * dt;
  const rowAmp = fastMode ? 0.03 : (hoverMode ? 0.24 : 0.10);
  const scull = Math.sin(fish.pectRowPhase) * rowAmp;
  const turnL = Math.max(0, fish.angularVelocity) * 0.22;
  const turnR = Math.max(0, -fish.angularVelocity) * 0.22;

  // Animação suave da abertura da boca (abre rápido no bote e fecha firme ao abocanhar)
  const mouthLerpRate = targetMouthOpen > fish.smoothMouthOpen ? 15.0 : (fish.biteSnapTimer > 0 ? 20.0 : 8.5);
  fish.smoothMouthOpen = THREE.MathUtils.lerp(fish.smoothMouthOpen, targetMouthOpen, Math.min(1, dt * mouthLerpRate));

  fish.uniforms.uSwimPhase.value = fish.swimPhase;
  fish.uniforms.uTailAmp.value = tailAmp;
  fish.uniforms.uSpineCurve.value = fish.smoothSpineCurve + tucShake;
  fish.uniforms.uPectoralSpread.value = fish.smoothPectSpread;
  fish.uniforms.uPectoralRowL.value = scull + turnL;
  fish.uniforms.uPectoralRowR.value = -scull + turnR;
  fish.uniforms.uDorsalFlare.value = fish.smoothDorsalFlare;
  fish.uniforms.uBreathPhase.value = fish.breathPhase;
  fish.uniforms.uIdleDriftPhase.value = fish.idleDriftPhase;
  fish.uniforms.uMouthOpen.value = fish.smoothMouthOpen;

  // Informa a posição de cada tucunaré para as algas balançarem na sua esteira
  if (fish.id === 2) {
    algaeUniforms.uFishPos2.value.copy(fish.pos);
  } else {
    algaeUniforms.uFishPos.value.copy(fish.pos);
  }

  // 6. Transformações 3D + sombra no leito arenoso
  const bobY = Math.sin(clockTime * 1.4 + (fish.id || 1) * 0.9) * 0.04;
  const finalY = fish.pos.y + bobY;

  fish.group.position.set(fish.pos.x, finalY, fish.pos.z);
  fish.group.rotation.set(fish.pitch, fish.heading, fish.roll);
  fish.group.scale.setScalar(s);

  const heightAboveBed = Math.max(0.4, finalY - RIVERBED_Y);
  const shadowSpread = 1.0 + heightAboveBed * 0.08;
  fish.shadowGroup.position.set(
    fish.pos.x + heightAboveBed * 0.30,
    RIVERBED_Y + 0.14,
    fish.pos.z - heightAboveBed * 0.16
  );
  fish.shadowGroup.rotation.y = fish.heading;
  fish.shadowGroup.scale.set(s * shadowSpread, s, s * shadowSpread);
  fish.shadowMat.uniforms.uShadowOpacity.value = THREE.MathUtils.clamp(0.34 - heightAboveBed * 0.042, 0.10, 0.32);
}

// =========================================================================
// 10. PAINEL LIL-GUI + LIVELY WALLPAPER API
// =========================================================================
let gui = null;
const guiControllers = {};

function initGui() {
  try {
    const { GUI } = window.lil;
    gui = new GUI({ title: 'Tucunaré Azul · Controles', width: 265 });

    guiControllers.baseSpeed = gui.add(params, 'baseSpeed', 0.8, 3.8, 0.05).name('Velocidade Patrulha');
    guiControllers.ambushTendency = gui.add(params, 'ambushTendency', 0.2, 1.8, 0.05).name('Tendência Emboscada');
    guiControllers.causticsIntensity = gui.add(params, 'causticsIntensity', 0.0, 2.2, 0.05).name('Cáusticas').onChange(syncEnvUniforms);
    guiControllers.sunbeamsIntensity = gui.add(params, 'sunbeamsIntensity', 0.0, 2.0, 0.05).name('Raios de Luz').onChange(syncEnvUniforms);
    guiControllers.fishScale = gui.add(params, 'fishScale', 0.4, 1.4, 0.05).name('Tamanho dos Peixes');
    guiControllers.showAlgae = gui.add(params, 'showAlgae').name('Algas no Fundo').onChange(syncAlgaeVisibility);
    guiControllers.interactiveMouse = gui.add(params, 'interactiveMouse').name('Interação Mouse');
    gui.add(params, 'dropBaitCenter').name('Soltar Lambari');
    gui.add(params, 'triggerStrike').name('Disparar Bote');

    gui.close();
    syncGuiVisibility();
  } catch (err) {
    console.warn('lil-gui indisponível:', err);
  }
}

function syncAlgaeVisibility() {
  algaeMesh.visible = Boolean(params.showAlgae);
}

function syncEnvUniforms() {
  riverbedUniforms.uCausticsIntensity.value = params.causticsIntensity;
  waterSurfaceUniforms.uCausticsIntensity.value = params.causticsIntensity;
  backdropUniforms.uCausticsIntensity.value = params.causticsIntensity;
  globalFishUniforms.uCausticsIntensity.value = params.causticsIntensity;
  algaeUniforms.uCausticsIntensity.value = params.causticsIntensity;
  sunbeamUniforms.uIntensity.value = params.sunbeamsIntensity;
}

function syncGuiVisibility() {
  if (!gui) return;
  gui.domElement.classList.toggle('hidden-gui', !params.showGui);
}

window.livelyPropertyListener = function (name, val) {
  if (name === 'baseSpeed') {
    params.baseSpeed = (Number(val) / 100) * 1.85;
  } else if (name === 'ambushTendency') {
    params.ambushTendency = Number(val) / 100;
  } else if (name === 'causticsIntensity') {
    params.causticsIntensity = Number(val) / 100;
    syncEnvUniforms();
  } else if (name === 'sunbeamsIntensity') {
    params.sunbeamsIntensity = Number(val) / 100;
    syncEnvUniforms();
  } else if (name === 'fishScale') {
    params.fishScale = Number(val) / 100;
  } else if (name === 'showAlgae') {
    params.showAlgae = Boolean(val);
    syncAlgaeVisibility();
  } else if (name === 'interactiveMouse') {
    params.interactiveMouse = Boolean(val);
  } else if (name === 'showGui') {
    params.showGui = Boolean(val);
    syncGuiVisibility();
  }
  if (guiControllers[name]) guiControllers[name].updateDisplay();
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'h' || e.key === 'H') {
    params.showGui = !params.showGui;
    syncGuiVisibility();
  } else if (e.code === 'Space') {
    params.dropBaitCenter();
  }
});

initGui();

// =========================================================================
// 11. RESIZE E LOOP PRINCIPAL
// =========================================================================
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  updateBounds();
  moteUniforms.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener('resize', onResize);

let lastNow = performance.now();
let clockTime = 0;
let livelyPaused = false;
let hiddenPaused = Boolean(document.hidden);
let paused = livelyPaused || hiddenPaused;
let rafId = 0;

function syncPaused() {
  const nextPaused = livelyPaused || hiddenPaused;
  if (nextPaused === paused) return;
  paused = nextPaused;
  if (paused) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  } else {
    lastNow = performance.now();
    if (!rafId) rafId = requestAnimationFrame(animate);
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

function animate(now) {
  rafId = 0;
  if (paused) return;
  rafId = requestAnimationFrame(animate);
  const dt = Math.min((now - lastNow) * 0.001, 0.05);
  lastNow = now;
  clockTime += dt;

  // Micro-flutuação sutil de lente subaquática (ou órbita livre em inspeção)
  if (!isInspect) {
    camera.position.set(
      CAM_BASE.x + Math.sin(clockTime * 0.25) * 0.14,
      CAM_BASE.y + Math.cos(clockTime * 0.19) * 0.09,
      CAM_BASE.z
    );
    camera.lookAt(CAM_TARGET);
  } else {
    const off = inspectBaseOffset.clone().multiplyScalar(inspectOrbit.zoom);
    const cosP = Math.cos(inspectOrbit.pitch);
    const sinP = Math.sin(inspectOrbit.pitch);
    const y1 = off.y * cosP - off.z * sinP;
    const z1 = off.y * sinP + off.z * cosP;
    const cosY = Math.cos(inspectOrbit.yaw);
    const sinY = Math.sin(inspectOrbit.yaw);
    const x2 = off.x * cosY + z1 * sinY;
    const z2 = -off.x * sinY + z1 * cosY;
    camera.position.set(CAM_TARGET.x + x2, CAM_TARGET.y + y1, CAM_TARGET.z + z2);
    camera.lookAt(CAM_TARGET);
  }

  riverbedUniforms.uTime.value = clockTime;
  waterSurfaceUniforms.uTime.value = clockTime;
  backdropUniforms.uTime.value = clockTime;
  sunbeamUniforms.uTime.value = clockTime;
  globalFishUniforms.uTime.value = clockTime;
  algaeUniforms.uTime.value = clockTime;
  moteUniforms.uTime.value = clockTime;

  updateMouseState(dt);
  updateBaitsAndBubbles(dt);
  updateTucunare(tucunare, dt, [tucunareRealista, ...piranhaSchool]);
  updateTucunare(tucunareRealista, dt, [tucunare, ...piranhaSchool]);
  updatePiranhaSchool(dt, allFish);

  renderer.render(scene, camera);
}

rafId = requestAnimationFrame(animate);
})();
