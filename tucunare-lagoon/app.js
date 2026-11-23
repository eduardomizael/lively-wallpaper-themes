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
  preferredYBias: 0.16
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
  preferredYBias: -0.14
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

    // Estados: 'SCHOOL' | 'STALK' | 'STRIKE' | 'EVADE' | 'FLEE'
    state: 'SCHOOL',
    stateTimer: 0,
    strikeDuration: 0.32,
    evadeTimer: 0,
    evadeFrom: new THREE.Vector3(),
    fleeTimer: 0,
    fleeCooldown: 0,
    fleeHeadingOffset: 0,

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
// 7. SISTEMA DE ISCAS + BOLHAS DE BOTE
// =========================================================================
const baits = [];
const MAX_BAITS = 8;

const baitGeo = new THREE.SphereGeometry(0.13, 12, 10);
const baitMat = new THREE.MeshStandardMaterial({
  color: 0xe6a854,
  roughness: 0.48,
  metalness: 0.15,
  emissive: 0x422406,
  emissiveIntensity: 0.35
});

const MAX_BITE_BUBBLES = 64;
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

function spawnStrikeSplash(x, y, z) {
  spawnRipple(x, z, 1.35);
  for (let i = 0; i < 11; i++) {
    const slot = bubblePool[bubbleCursor];
    bubbleCursor = (bubbleCursor + 1) % MAX_BITE_BUBBLES;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.55 + Math.random() * 1.45;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = 0.9 + Math.random() * 1.35;
    slot.vz = Math.sin(ang) * spd;
    slot.baseScale = 0.5 + Math.random() * 1.0;
    slot.life = 0;
    slot.maxLife = 0.75 + Math.random() * 0.55;
  }
}

function spawnBait(x, z) {
  const cz = THREE.MathUtils.clamp(z, swimVolume.minZ * 0.88, swimVolume.maxZ * 0.85);
  const maxX = halfXAtZ(cz) * 0.88;
  const cx = THREE.MathUtils.clamp(x, -maxX, maxX);
  if (baits.length >= MAX_BAITS) {
    const oldest = baits.shift();
    scene.remove(oldest.mesh);
  }
  const mesh = new THREE.Mesh(baitGeo, baitMat);
  mesh.scale.set(1.25, 0.72, 0.82);
  mesh.position.set(cx, 2.3, cz);
  mesh.renderOrder = 10;
  scene.add(mesh);

  spawnRipple(cx, cz, 0.95);
  baits.push({
    mesh,
    pos: new THREE.Vector3(cx, 2.3, cz),
    targetY: -0.20 + Math.random() * 1.20,
    age: 0,
    seed: Math.random() * Math.PI * 2
  });
}

function updateBaitsAndBubbles(dt) {
  for (let i = baits.length - 1; i >= 0; i--) {
    const b = baits[i];
    b.age += dt;
    b.pos.y = THREE.MathUtils.lerp(b.pos.y, b.targetY + Math.sin(clockTime * 2.8 + b.seed) * 0.14, Math.min(1, dt * 1.4));
    b.pos.x += Math.sin(clockTime * 1.6 + b.seed) * 0.10 * dt;
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y += dt * 1.4;
    if (b.age > 32.0) {
      scene.remove(b.mesh);
      baits.splice(i, 1);
    }
  }

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

  // 2. Atualiza cada piranha com forças de boids (separação, alinhamento, coesão) + ecologia
  const scaleNorm = Math.max(0.70, params.fishScale);
  const mateSepR = 1.38 * scaleNorm;
  const mateAlignR = 4.4;

  for (let idx = 0; idx < piranhaSchool.length; idx++) {
    const p = piranhaSchool[idx];
    p.group.visible = true;
    p.shadowGroup.visible = true;
    p.stateTimer += dt;
    if (p.fleeCooldown > 0) p.fleeCooldown -= dt;

    const s = params.fishScale * p.scaleRatio;
    const patrolSpeed = params.baseSpeed * 1.04 * p.speedMult;

    // Reação arisca a movimento brusco do cursor
    if (params.interactiveMouse && mouse.inside && mouse.moving && p.fleeCooldown <= 0) {
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

    // Cautela ecológica frente aos tucunarés maiores (abre o cardume em leque)
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
    if (nearestPred && p.state !== 'FLEE' && p.state !== 'EVADE') {
      const dangerRadius = (nearestPred.state === 'STRIKE' || nearestPred.state === 'FLEE')
        ? 4.6 * scaleNorm
        : 2.75 * scaleNorm;
      if (nearestPredDist < dangerRadius) {
        triggerPiranhaEvade(p, nearestPred.pos);
      }
    }

    // Frenesi oportunista em iscas desprotegidas
    let targetBait = null;
    let bestBaitDist = 999;
    if (p.state !== 'FLEE' && p.state !== 'EVADE' && baits.length > 0) {
      for (let i = 0; i < baits.length; i++) {
        const b = baits[i];
        const d = p.pos.distanceTo(b.pos);
        let predTooClose = false;
        for (let j = 0; j < predators.length; j++) {
          if (predators[j].pos.distanceTo(b.pos) < 1.85 * scaleNorm) {
            predTooClose = true;
            break;
          }
        }
        if (!predTooClose && d < bestBaitDist && d < 7.2) {
          bestBaitDist = d;
          targetBait = b;
        }
      }
      if (targetBait && p.state !== 'STALK' && p.state !== 'STRIKE') {
        p.state = 'STALK';
        p.stateTimer = 0;
      }
    } else if ((p.state === 'STALK' || p.state === 'STRIKE') && baits.length === 0) {
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
    } else if (p.state === 'STALK' && targetBait) {
      const toX = targetBait.pos.x - p.pos.x;
      const toZ = targetBait.pos.z - p.pos.z;
      const horizDist = Math.max(0.01, Math.hypot(toX, toZ));
      desiredDirX = toX / horizDist;
      desiredDirZ = toZ / horizDist;
      desiredY = targetBait.pos.y;
      const targetHeading = Math.atan2(desiredDirX, desiredDirZ);
      const headingErr = Math.abs(normalizeAngle(targetHeading - p.heading));
      p.speed = THREE.MathUtils.lerp(p.speed, patrolSpeed * 1.22, Math.min(1, dt * 4.5));
      thrustEffort = 0.48;
      if (horizDist < 2.8 && headingErr < 0.40 && p.stateTimer > 0.18) {
        p.state = 'STRIKE';
        p.stateTimer = 0;
        p.strikeDuration = 0.32;
        spawnRipple(p.pos.x, p.pos.z, 0.55);
      }
    } else if (p.state === 'STRIKE') {
      const pr = Math.min(p.stateTimer / p.strikeDuration, 1.0);
      const impulse = Math.sin(pr * Math.PI);
      p.speed = THREE.MathUtils.lerp(p.speed, patrolSpeed * (2.6 + 0.5 * impulse), Math.min(1, dt * 10.0));
      thrustEffort = 0.80 + 0.90 * impulse;
      if (targetBait) {
        const toX = targetBait.pos.x - p.pos.x;
        const toZ = targetBait.pos.z - p.pos.z;
        const len = Math.max(0.01, Math.hypot(toX, toZ));
        desiredDirX = toX / len;
        desiredDirZ = toZ / len;
        desiredY = targetBait.pos.y;
        const mouthX = p.pos.x + Math.sin(p.heading) * (1.25 * s);
        const mouthZ = p.pos.z + Math.cos(p.heading) * (1.25 * s);
        const mouthDist = Math.hypot(mouthX - targetBait.pos.x, p.pos.y - targetBait.pos.y, mouthZ - targetBait.pos.z);
        if (mouthDist < 0.72 * Math.max(0.65, s)) {
          const bIdx = baits.indexOf(targetBait);
          if (bIdx !== -1) {
            spawnStrikeSplash(targetBait.pos.x, targetBait.pos.y, targetBait.pos.z);
            scene.remove(targetBait.mesh);
            baits.splice(bIdx, 1);
          }
          // Após abocanhar, o cardume inteiro dá uma arrancada curta e muda de destino
          const retreatRef = nearestPred ? nearestPred.pos : p.pos;
          piranhaSchool.forEach(mate => triggerPiranhaEvade(mate, retreatRef));
          pickSchoolTarget();
        }
      }
      if (p.state === 'STRIKE' && p.stateTimer >= p.strikeDuration) {
        p.state = 'SCHOOL';
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

    const predSepR = 3.2 * scaleNorm;
    for (let i = 0; i < predators.length; i++) {
      const pred = predators[i];
      const dx = p.pos.x - pred.pos.x;
      const dz = p.pos.z - pred.pos.z;
      const dH = Math.hypot(dx, dz);
      if (dH < predSepR && dH > 0.001) {
        const push = 1.0 - dH / predSepR;
        steerX += (dx / dH) * push * 6.5;
        steerZ += (dz / dH) * push * 6.5;
      }
    }

    const desiredHeading = Math.atan2(steerX, steerZ);
    const angleDiff = normalizeAngle(desiredHeading - p.heading);
    const agileTurn = p.state === 'FLEE' || p.state === 'EVADE' || p.state === 'STRIKE';
    const maxTurn = agileTurn ? 4.8 : (schoolHovering ? 1.5 : 2.7);
    const turnGain = agileTurn ? 5.2 : 2.7;
    const targetAngVel = THREE.MathUtils.clamp(angleDiff * turnGain, -maxTurn, maxTurn);
    p.angularVelocity = THREE.MathUtils.lerp(p.angularVelocity, targetAngVel, Math.min(1, dt * 6.5));

    p.heading = normalizeAngle(p.heading + p.angularVelocity * dt);
    p.pos.x += Math.sin(p.heading) * p.speed * dt;
    p.pos.z += Math.cos(p.heading) * p.speed * dt;

    const clampedY = THREE.MathUtils.clamp(desiredY, swimVolume.minY + 0.25, swimVolume.maxY);
    const targetVelY = THREE.MathUtils.clamp((clampedY - p.pos.y) * 1.5, -1.25, 1.25);
    p.velY = THREE.MathUtils.lerp(p.velY, targetVelY, Math.min(1, dt * 3.0));
    p.pos.y = THREE.MathUtils.clamp(p.pos.y + p.velY * dt, swimVolume.minY + 0.25, swimVolume.maxY);

    const targetPitch = THREE.MathUtils.clamp(-p.velY / Math.max(1.0, p.speed + 0.7) * 0.36, -0.22, 0.20);
    p.pitch = THREE.MathUtils.lerp(p.pitch, targetPitch, Math.min(1, dt * 4.5));
    const targetRoll = THREE.MathUtils.clamp(-p.angularVelocity * 0.14 * Math.min(1, p.speed * 0.5), -0.24, 0.24);
    p.roll = THREE.MathUtils.lerp(p.roll, targetRoll, Math.min(1, dt * 4.8));

    // Acoplamento corpo/cauda/curva + sombra
    const rawAccel = (p.speed - p.prevSpeed) / Math.max(dt, 0.001);
    p.prevSpeed = p.speed;
    const targetEffort = THREE.MathUtils.clamp(thrustEffort + Math.max(0, rawAccel) * 0.18, 0.08, 1.75);
    p.smoothEffort = THREE.MathUtils.lerp(p.smoothEffort, targetEffort, Math.min(1, dt * 6.8));

    p.swimPhase += (2.4 + p.smoothEffort * 9.8) * dt;
    p.smoothSpineCurve = THREE.MathUtils.lerp(p.smoothSpineCurve, p.angularVelocity * 0.34, Math.min(1, dt * 6.0));
    p.uniforms.uSwimPhase.value = p.swimPhase;
    p.uniforms.uTailAmp.value = 0.065 + p.smoothEffort * 0.21;
    p.uniforms.uSpineCurve.value = p.smoothSpineCurve;

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

  const s = params.fishScale * (fish.scaleRatio || 1.0);
  const patrolSpeed = params.baseSpeed * (fish.speedMult || 1.0);
  const hoverFactor = (fish.hoverMult || 1.0) * params.ambushTendency;
  const strikePeakSpeed = patrolSpeed * 3.2;

  // 1. Reação defensiva a movimento brusco muito próximo
  if (params.interactiveMouse && mouse.inside && mouse.moving && fish.fleeCooldown <= 0) {
    const dMouse = Math.hypot(fish.pos.x - mouse.world.x, fish.pos.z - mouse.world.z);
    if (dMouse < 3.4 && mouse.speed > 5.5) {
      triggerPredatorFlee(fish);
    }
  }

  // 2. Verifica isca na água (evitando colisão direta quando o outro tucunaré já está mais perto)
  let nearestBait = null;
  let nearestBaitScore = 999;
  const otherTucunare = peers.find(peer => peer && peer.species === 'tucunare');
  if (fish.state !== 'FLEE' && baits.length > 0) {
    for (let i = 0; i < baits.length; i++) {
      const b = baits[i];
      const d = fish.pos.distanceTo(b.pos);
      let score = d;
      if (otherTucunare && (otherTucunare.state === 'STALK' || otherTucunare.state === 'STRIKE')) {
        const dOther = otherTucunare.pos.distanceTo(b.pos);
        if (dOther + 0.4 < d) score += 3.5;
      }
      if (score < nearestBaitScore) {
        nearestBaitScore = score;
        nearestBait = b;
      }
    }
    if (nearestBait && fish.state !== 'STALK' && fish.state !== 'STRIKE') {
      fish.state = 'STALK';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'STALK' && baits.length === 0) {
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
  } else if (fish.state === 'STALK' && nearestBait) {
    targetDorsalFlare = 0.98;
    const toX = nearestBait.pos.x - fish.pos.x;
    const toZ = nearestBait.pos.z - fish.pos.z;
    const horizDist = Math.max(0.01, Math.hypot(toX, toZ));
    desiredDirX = toX / horizDist;
    desiredDirZ = toZ / horizDist;
    desiredY = nearestBait.pos.y;

    const targetHeading = Math.atan2(desiredDirX, desiredDirZ);
    const headingErr = Math.abs(normalizeAngle(targetHeading - fish.heading));

    const stalkSpd = horizDist > 4.6 ? patrolSpeed * 0.88 : patrolSpeed * 0.42;
    fish.speed = THREE.MathUtils.lerp(fish.speed, stalkSpd, Math.min(1, dt * 3.2));
    thrustEffort = horizDist > 4.6 ? 0.30 : 0.12;

    if (horizDist < 4.2 && headingErr < 0.30 && fish.stateTimer > 0.38) {
      triggerPredatorBurst(fish, 1.15);
    }
  } else if (fish.state === 'STRIKE') {
    targetDorsalFlare = 1.0;
    const p = Math.min(fish.stateTimer / fish.strikeDuration, 1.0);
    const impulse = Math.sin(p * Math.PI);
    const accel = (strikePeakSpeed - patrolSpeed) * 4.8 * impulse;
    fish.speed = Math.min(strikePeakSpeed * 1.15, fish.speed + accel * dt);
    thrustEffort = 0.65 + 1.20 * impulse;

    if (nearestBait) {
      const toX = nearestBait.pos.x - fish.pos.x;
      const toZ = nearestBait.pos.z - fish.pos.z;
      const len = Math.max(0.01, Math.hypot(toX, toZ));
      desiredDirX = toX / len;
      desiredDirZ = toZ / len;
      desiredY = nearestBait.pos.y;

      const mouthX = fish.pos.x + Math.sin(fish.heading) * (2.1 * s);
      const mouthZ = fish.pos.z + Math.cos(fish.heading) * (2.1 * s);
      const mouthDist = Math.hypot(mouthX - nearestBait.pos.x, fish.pos.y - nearestBait.pos.y, mouthZ - nearestBait.pos.z);

      // Abre a boca progressivamente conforme se aproxima para engolir a isca no bote!
      if (mouthDist < 2.8 * Math.max(0.75, s)) {
        targetMouthOpen = THREE.MathUtils.clamp(1.0 - (mouthDist - 0.65 * s) / (2.15 * Math.max(0.75, s)), 0.18, 1.0);
      }

      if (mouthDist < 0.92 * Math.max(0.75, s)) {
        const idx = baits.indexOf(nearestBait);
        if (idx !== -1) {
          spawnStrikeSplash(nearestBait.pos.x, nearestBait.pos.y, nearestBait.pos.z);
          scene.remove(nearestBait.mesh);
          baits.splice(idx, 1);
        }
        fish.biteSnapTimer = 0.24; // Fecha a boca com firmeza e engole
        fish.state = 'COAST';
        fish.stateTimer = 0;
        pickPatrolWaypoint(fish);
      }
    }

    if (fish.state === 'STRIKE' && fish.stateTimer >= fish.strikeDuration) {
      fish.state = 'COAST';
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

  const maxTurn = fish.state === 'FLEE' || fish.state === 'STRIKE' ? 3.4 : (fish.state === 'HOVER' ? 0.85 : 1.55);
  const turnGain = fish.state === 'FLEE' || fish.state === 'STRIKE' ? 3.8 : (fish.state === 'HOVER' ? 1.15 : 1.85);
  const targetAngVel = THREE.MathUtils.clamp(angleDiff * turnGain, -maxTurn, maxTurn);
  fish.angularVelocity = THREE.MathUtils.lerp(fish.angularVelocity, targetAngVel, Math.min(1, dt * 4.5));

  fish.heading = normalizeAngle(fish.heading + fish.angularVelocity * dt);
  fish.pos.x += Math.sin(fish.heading) * fish.speed * dt;
  fish.pos.z += Math.cos(fish.heading) * fish.speed * dt;

  const clampedDesiredY = THREE.MathUtils.clamp(desiredY, swimVolume.minY, swimVolume.maxY);
  const targetVelY = THREE.MathUtils.clamp((clampedDesiredY - fish.pos.y) * 1.1, -1.0, 1.0);
  fish.velY = THREE.MathUtils.lerp(fish.velY, targetVelY, Math.min(1, dt * 2.2));
  fish.pos.y = THREE.MathUtils.clamp(fish.pos.y + fish.velY * dt, swimVolume.minY, swimVolume.maxY);

  const hoverPitchBias = fish.state === 'HOVER' ? -0.05 : 0.0;
  const targetPitch = THREE.MathUtils.clamp(-fish.velY / Math.max(1.2, fish.speed + 0.8) * 0.40 + hoverPitchBias, -0.24, 0.22);
  fish.pitch = THREE.MathUtils.lerp(fish.pitch, targetPitch, Math.min(1, dt * 3.4));

  const targetRoll = THREE.MathUtils.clamp(-fish.angularVelocity * 0.14 * Math.min(1, fish.speed * 0.5), -0.22, 0.22);
  fish.roll = THREE.MathUtils.lerp(fish.roll, targetRoll, Math.min(1, dt * 3.8));

  const rawAccel = (fish.speed - fish.prevSpeed) / Math.max(dt, 0.001);
  fish.acceleration = THREE.MathUtils.lerp(fish.acceleration, rawAccel, Math.min(1, dt * 7.5));
  fish.prevSpeed = fish.speed;

  // 5. Acoplamento corpo-física
  const accelBoost = Math.max(0, fish.acceleration) * 0.18;
  const targetEffort = THREE.MathUtils.clamp(thrustEffort + accelBoost, 0.03, 1.85);
  fish.smoothEffort = THREE.MathUtils.lerp(fish.smoothEffort, targetEffort, Math.min(1, dt * 5.8));

  const swimFreq = 1.8 + fish.smoothEffort * 8.6;
  fish.swimPhase += swimFreq * dt;
  fish.breathPhase += (2.3 + fish.smoothEffort * 2.0) * dt;
  fish.idleDriftPhase += 1.55 * dt;

  const tailAmp = 0.045 + fish.smoothEffort * 0.30;
  fish.smoothSpineCurve = THREE.MathUtils.lerp(fish.smoothSpineCurve, fish.angularVelocity * 0.48, Math.min(1, dt * 5.8));
  fish.smoothDorsalFlare = THREE.MathUtils.lerp(fish.smoothDorsalFlare, targetDorsalFlare, Math.min(1, dt * 4.2));

  const fastMode = fish.state === 'STRIKE' || fish.state === 'FLEE';
  const hoverMode = fish.state === 'HOVER' || fish.state === 'STALK';
  const targetSpread = fastMode ? 0.05 : (hoverMode ? 0.56 : 0.34);
  fish.smoothPectSpread = THREE.MathUtils.lerp(fish.smoothPectSpread, targetSpread, Math.min(1, dt * 4.2));

  fish.pectRowPhase += (hoverMode ? 3.5 : 2.0) * dt;
  const rowAmp = fastMode ? 0.03 : (hoverMode ? 0.24 : 0.10);
  const scull = Math.sin(fish.pectRowPhase) * rowAmp;
  const turnL = Math.max(0, fish.angularVelocity) * 0.22;
  const turnR = Math.max(0, -fish.angularVelocity) * 0.22;

  // Animação suave da abertura da boca (abre rápido no bote e fecha firme ao abocanhar)
  const mouthLerpRate = targetMouthOpen > fish.smoothMouthOpen ? 13.0 : (fish.biteSnapTimer > 0 ? 18.0 : 8.5);
  fish.smoothMouthOpen = THREE.MathUtils.lerp(fish.smoothMouthOpen, targetMouthOpen, Math.min(1, dt * mouthLerpRate));

  fish.uniforms.uSwimPhase.value = fish.swimPhase;
  fish.uniforms.uTailAmp.value = tailAmp;
  fish.uniforms.uSpineCurve.value = fish.smoothSpineCurve;
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
    gui.add(params, 'dropBaitCenter').name('Soltar Isca');
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
