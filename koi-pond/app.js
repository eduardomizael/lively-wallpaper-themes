(() => {
// =========================================================================
// 1. CONFIGURAÇÃO GLOBAL (SINCRONIZADA COM LIL-GUI E LIVELY WALLPAPER)
// =========================================================================
const params = {
  fishCount: 5,             // Quantidade de carpas ativas (1 a 5)
  burstFrequency: 1.0,      // Multiplicador de frequência dos impulsos (0.3 a 2.5)
  baseSpeed: 2.25,          // Velocidade base de cruzeiro
  causticsIntensity: 1.05,  // Intensidade das cáusticas
  fishScale: 0.92,          // Escala global das carpas
  interactiveMouse: true,   // Fuga ao mover, curiosidade parado, petisco ao clicar
  showGui: true,            // Mostrar/ocultar painel recolhido
  dropTreatCenter: () => spawnTreat((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4),
  triggerAllBursts: () => fishList.forEach(f => { if (f.visible) triggerFishBurst(f, 1.0); })
};

// =========================================================================
// 2. RENDERER, CENA E CÂMERA TOP-DOWN
// =========================================================================
const canvas = document.getElementById('pond-canvas');
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
scene.background = new THREE.Color(0x020d1a);

const CAMERA_Y = 27.5;
const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.5,
  100
);
camera.position.set(0, CAMERA_Y, 0);
camera.up.set(0, 0, -1); // -Z aponta para o topo da tela
camera.lookAt(0, 0, 0);

const worldBounds = { halfW: 13, halfH: 7.5 };
function updateBounds() {
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);
  const visibleH = 2 * Math.tan(vFovRad * 0.5) * CAMERA_Y;
  const visibleW = visibleH * camera.aspect;
  worldBounds.halfW = visibleW * 0.5;
  worldBounds.halfH = visibleH * 0.5;
}
updateBounds();

const {
  CAUSTICS_GLSL,
  spawnRipple,
  pondBottomUniforms,
  waterSurfaceUniforms,
  moteUniforms
} = window.KoiEnvironment.createEnvironment({
  scene,
  params,
  renderer,
  worldBounds,
  getClockTime: () => clockTime
});

const {
  sharedGeos,
  pectLPivot,
  pectRPivot,
  pelvLPivot,
  pelvRPivot,
  KOI_ARCHETYPES
} = window.KoiModels.createKoiModels();

const {
  globalFishUniforms,
  createKoiBodyMaterial,
  createFinMaterial,
  createDetailMaterial,
  createShadowMaterial
} = window.KoiShaders.createKoiShaders({ CAUSTICS_GLSL, params });
// =========================================================================
// 7. FÁBRICA DE CARPAS (INSTANCIA OS 5 MODELOS + SOMBRAS)
// =========================================================================
const fishList = [];

function createKoiInstance(archetype, index) {
  const fishUniforms = {
    uSwimPhase: { value: Math.random() * Math.PI * 2 },
    uTailAmp: { value: 0.26 },
    uSpineCurve: { value: 0.0 },
    uPectoralSpread: { value: 0.35 },
    uPectoralRowL: { value: 0.0 },
    uPectoralRowR: { value: 0.0 }
  };

  const group = new THREE.Group();
  scene.add(group);

  const caudalGeo = archetype.veilTail ? sharedGeos.caudalVeil : sharedGeos.caudalStandard;

  const bodyMesh = new THREE.Mesh(sharedGeos.body, createKoiBodyMaterial(fishUniforms, archetype));
  bodyMesh.renderOrder = 3 + index * 0.1;
  group.add(bodyMesh);

  const caudalMesh = new THREE.Mesh(
    caudalGeo,
    createFinMaterial(fishUniforms, 0, 0, archetype.finRootColor, archetype.finTipColor)
  );
  caudalMesh.renderOrder = 4;
  group.add(caudalMesh);

  const pectLMat = createFinMaterial(fishUniforms, 1, 1, archetype.finTipColor, archetype.finTipColor);
  pectLMat.uniforms.uPivot.value.copy(pectLPivot);
  const pectLMesh = new THREE.Mesh(sharedGeos.pectL, pectLMat);
  pectLMesh.renderOrder = 2;
  group.add(pectLMesh);

  const pectRMat = createFinMaterial(fishUniforms, 1, -1, archetype.finTipColor, archetype.finTipColor);
  pectRMat.uniforms.uPivot.value.copy(pectRPivot);
  const pectRMesh = new THREE.Mesh(sharedGeos.pectR, pectRMat);
  pectRMesh.renderOrder = 2;
  group.add(pectRMesh);

  const pelvLMat = createFinMaterial(fishUniforms, 2, 1, archetype.finTipColor, archetype.finTipColor);
  pelvLMat.uniforms.uPivot.value.copy(pelvLPivot);
  const pelvLMesh = new THREE.Mesh(sharedGeos.pelvL, pelvLMat);
  pelvLMesh.renderOrder = 2;
  group.add(pelvLMesh);

  const pelvRMat = createFinMaterial(fishUniforms, 2, -1, archetype.finTipColor, archetype.finTipColor);
  pelvRMat.uniforms.uPivot.value.copy(pelvRPivot);
  const pelvRMesh = new THREE.Mesh(sharedGeos.pelvR, pelvRMat);
  pelvRMesh.renderOrder = 2;
  group.add(pelvRMesh);

  const dorsalMesh = new THREE.Mesh(
    sharedGeos.dorsal,
    createFinMaterial(fishUniforms, 3, 0, archetype.finRootColor, archetype.finTipColor)
  );
  dorsalMesh.renderOrder = 5;
  group.add(dorsalMesh);

  const eyeMat = createDetailMaterial(fishUniforms, 0x101318);
  group.add(new THREE.Mesh(sharedGeos.eyeL, eyeMat));
  group.add(new THREE.Mesh(sharedGeos.eyeR, eyeMat));

  const whiskerMat = createDetailMaterial(fishUniforms, archetype.whiskerColor);
  group.add(new THREE.Mesh(sharedGeos.whiskerL, whiskerMat));
  group.add(new THREE.Mesh(sharedGeos.whiskerR, whiskerMat));

  // Sombra sincronizada no fundo do lago
  const shadowGroup = new THREE.Group();
  scene.add(shadowGroup);

  const shadowBody = new THREE.Mesh(sharedGeos.body, createShadowMaterial(fishUniforms, -1, 0));
  shadowBody.renderOrder = 1;
  shadowGroup.add(shadowBody);

  const shadowCaudal = new THREE.Mesh(caudalGeo, createShadowMaterial(fishUniforms, 0, 0));
  shadowCaudal.renderOrder = 1;
  shadowGroup.add(shadowCaudal);

  const shadowPectL = new THREE.Mesh(sharedGeos.pectL, createShadowMaterial(fishUniforms, 1, 1, pectLPivot));
  shadowPectL.renderOrder = 1;
  shadowGroup.add(shadowPectL);

  const shadowPectR = new THREE.Mesh(sharedGeos.pectR, createShadowMaterial(fishUniforms, 1, -1, pectRPivot));
  shadowPectR.renderOrder = 1;
  shadowGroup.add(shadowPectR);

  // Posição inicial bem distribuída pelo lago
  const startAngle = (index / KOI_ARCHETYPES.length) * Math.PI * 2 + 0.4;
  const startDist = 3.2 + (index % 2) * 2.4;

  const fish = {
    index,
    archetype,
    uniforms: fishUniforms,
    group,
    shadowGroup,
    visible: true,

    pos: new THREE.Vector2(Math.cos(startAngle) * startDist, Math.sin(startAngle) * startDist * 0.7),
    heading: startAngle + Math.PI * 0.55,
    speed: params.baseSpeed * archetype.speedFactor,
    prevSpeed: params.baseSpeed * archetype.speedFactor,
    acceleration: 0,
    angularVelocity: 0,

    // Estados: 'CRUISE' | 'REST' | 'BURST' | 'COAST' | 'FLEE' | 'SEEK_TREAT'
    state: 'CRUISE',
    stateTimer: 0,
    burstDuration: 0.45,
    fleeTimer: 0,
    fleeHeadingOffset: (Math.random() - 0.5) * 0.65,
    fleeCooldown: 0,
    nextBurstIn: (2.2 + Math.random() * 4.2) / archetype.burstRate,
    restDuration: 0,

    // Steering
    wanderAngle: Math.random() * Math.PI * 2,
    curiosityOrbitSign: index % 2 === 0 ? 1 : -1,

    // Acoplamento corpo-física
    swimPhase: Math.random() * Math.PI * 2,
    smoothEffort: 0.32,
    smoothSpineCurve: 0,
    smoothPectSpread: 0.36,
    pectRowPhase: Math.random() * Math.PI * 2
  };

  fishList.push(fish);
  return fish;
}

KOI_ARCHETYPES.forEach((arch, idx) => createKoiInstance(arch, idx));

function syncFishCount() {
  fishList.forEach((f, idx) => {
    const show = idx < params.fishCount;
    f.visible = show;
    f.group.visible = show;
    f.shadowGroup.visible = show;
  });
}

// =========================================================================
// 8. SISTEMA DE PETISCOS (CLIQUE NA ÁGUA ATRAI AS CARPAS)
// =========================================================================
const treats = [];
const MAX_TREATS = 12;

const treatGeo = new THREE.SphereGeometry(0.16, 12, 10);
const treatMat = new THREE.MeshStandardMaterial({
  color: 0xc98a42,
  roughness: 0.65,
  metalness: 0.08,
  emissive: 0x3b2208,
  emissiveIntensity: 0.35
});
const treatRingGeo = new THREE.RingGeometry(0.19, 0.27, 20);
treatRingGeo.rotateX(-Math.PI / 2);
const treatRingMat = new THREE.MeshBasicMaterial({
  color: 0x8be4f5,
  transparent: true,
  opacity: 0.38,
  depthWrite: false
});

// Luz suave para iluminar os petiscos 3D na superfície
const hemiLight = new THREE.HemisphereLight(0xbef0ff, 0x0b3545, 1.4);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xfff5e4, 1.3);
dirLight.position.set(-6, 18, -5);
scene.add(dirLight);

// Pequenas bolhinhas quando uma carpa come o petisco
const biteParticles = [];
const bubbleGeo = new THREE.SphereGeometry(0.065, 8, 6);
const bubbleMat = new THREE.MeshBasicMaterial({
  color: 0xbef5ff,
  transparent: true,
  opacity: 0.65,
  depthWrite: false
});

function spawnBiteEffect(x, z) {
  spawnRipple(x, z, 1.15);
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(bubbleGeo, bubbleMat.clone());
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.6 + Math.random() * 1.1;
    mesh.position.set(x, 0.6, z);
    mesh.scale.setScalar(0.5 + Math.random() * 0.9);
    mesh.renderOrder = 14;
    scene.add(mesh);
    biteParticles.push({
      mesh,
      vx: Math.cos(ang) * spd,
      vz: Math.sin(ang) * spd,
      life: 0,
      maxLife: 0.55 + Math.random() * 0.35
    });
  }
}

function spawnTreat(x, z) {
  // Remove o petisco mais antigo se exceder o limite
  if (treats.length >= MAX_TREATS) {
    const oldest = treats.shift();
    scene.remove(oldest.group);
  }

  const group = new THREE.Group();
  const pellet = new THREE.Mesh(treatGeo, treatMat);
  pellet.scale.set(1.0, 0.72, 1.0);
  group.add(pellet);

  const ring = new THREE.Mesh(treatRingGeo, treatRingMat.clone());
  ring.position.y = 0.02;
  group.add(ring);

  group.position.set(x, 0.85, z);
  group.renderOrder = 12;
  scene.add(group);

  spawnRipple(x, z, 1.05);

  treats.push({
    group,
    ring,
    pos: new THREE.Vector2(x, z),
    age: 0,
    bobSeed: Math.random() * Math.PI * 2
  });
}

function updateTreatsAndBites(dt) {
  for (let i = treats.length - 1; i >= 0; i--) {
    const t = treats[i];
    t.age += dt;
    // Flutuação suave na superfície da água
    t.group.position.y = 0.82 + Math.sin(clockTime * 3.2 + t.bobSeed) * 0.06;
    t.group.rotation.y += dt * 0.6;
    const pulse = 1.0 + Math.sin(clockTime * 2.8 + t.bobSeed) * 0.16;
    t.ring.scale.setScalar(pulse);
    t.ring.material.opacity = 0.25 + 0.16 * Math.sin(clockTime * 2.8 + t.bobSeed);

    // Expira suavemente após 35s caso ninguém coma
    if (t.age > 35.0) {
      scene.remove(t.group);
      treats.splice(i, 1);
    }
  }

  for (let i = biteParticles.length - 1; i >= 0; i--) {
    const p = biteParticles[i];
    p.life += dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.position.y += dt * 1.1;
    p.vx *= 0.94;
    p.vz *= 0.94;
    const remain = 1.0 - p.life / p.maxLife;
    p.mesh.material.opacity = Math.max(0, remain * 0.65);
    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      biteParticles.splice(i, 1);
    }
  }
}

// =========================================================================
// 9. RASTREAMENTO DO MOUSE (MOVIMENTO = FUGA | PARADO = CURIOSIDADE | CLIQUE = PETISCO)
// =========================================================================
const mouse = {
  world: new THREE.Vector2(999, 999),
  prevWorld: new THREE.Vector2(999, 999),
  lastRipplePos: new THREE.Vector2(999, 999),
  lastRippleTime: -10,
  inside: false,
  stillTime: 0,      // Tempo acumulado com o mouse parado dentro da tela
  speed: 0,          // Velocidade instantânea do cursor no mundo
  moving: false,     // True se o mouse se mexeu recentemente
  moveCooldown: 0    // Mantém estado de movimento por breve instante
};

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function projectPointer(clientX, clientY) {
  pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.ray.intersectPlane(waterPlane, hitPoint)) {
    return { x: hitPoint.x, z: hitPoint.z };
  }
  return null;
}

window.addEventListener('pointermove', (e) => {
  if (!params.interactiveMouse) return;
  const pt = projectPointer(e.clientX, e.clientY);
  if (!pt) return;

  const dx = pt.x - mouse.world.x;
  const dz = pt.z - mouse.world.y;
  const movedDist = Math.hypot(dx, dz);

  mouse.prevWorld.copy(mouse.world);
  mouse.world.set(pt.x, pt.z);
  mouse.inside = true;

  // Só considera movimento real se passou de um micro-tremor de pixel
  if (movedDist > 0.06 && movedDist < 12.0) {
    mouse.speed = Math.min(30, movedDist * 35);
    mouse.moving = true;
    mouse.moveCooldown = 0.28;
    mouse.stillTime = 0; // Quebra imediatamente a curiosidade -> fuga!

    // Gera leve ondulação na água acompanhando o rastro do mouse
    const distSinceRipple = Math.hypot(pt.x - mouse.lastRipplePos.x, pt.z - mouse.lastRipplePos.y);
    const dtSinceRipple = clockTime - mouse.lastRippleTime;
    if (distSinceRipple > 0.52 || dtSinceRipple > 0.085) {
      const gentleStrength = THREE.MathUtils.clamp(0.18 + movedDist * 0.24, 0.20, 0.46);
      spawnRipple(pt.x, pt.z, gentleStrength);
      mouse.lastRipplePos.set(pt.x, pt.z);
      mouse.lastRippleTime = clockTime;
    }
  } else if (movedDist >= 12.0) {
    mouse.lastRipplePos.set(pt.x, pt.z);
  }
});

window.addEventListener('pointerleave', () => {
  mouse.inside = false;
  mouse.stillTime = 0;
  mouse.moving = false;
});

window.addEventListener('pointerdown', (e) => {
  if (!params.interactiveMouse) return;
  if (e.target.closest && e.target.closest('.lil-gui')) return;
  const pt = projectPointer(e.clientX, e.clientY);
  if (!pt) return;

  mouse.world.set(pt.x, pt.z);
  mouse.inside = true;
  // Solta petisco na água na posição clicada!
  spawnTreat(pt.x, pt.z);
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
    if (mouse.moveCooldown <= 0) {
      mouse.moving = false;
    }
  } else {
    mouse.stillTime += dt;
  }
  mouse.speed = THREE.MathUtils.lerp(mouse.speed, 0, Math.min(1, dt * 10));
}

// =========================================================================
// 10. FÍSICA INDIVIDUAL DE LOCOMOÇÃO (BURST-AND-COAST + PERSONALIDADES)
// =========================================================================
function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function scheduleNextBurst(fish) {
  const freq = Math.max(0.25, params.burstFrequency * fish.archetype.burstRate);
  fish.nextBurstIn = (2.8 + Math.random() * 4.2) / freq;
}

function triggerFishBurst(fish, intensity = 1.0) {
  fish.state = 'BURST';
  fish.stateTimer = 0;
  fish.burstDuration = (0.34 + Math.random() * 0.18) * (0.85 + intensity * 0.2);
  fish.wanderAngle += (Math.random() - 0.5) * 1.15;

  const tailDist = 2.4 * params.fishScale * fish.archetype.scale;
  const tailX = fish.pos.x - Math.sin(fish.heading) * tailDist;
  const tailZ = fish.pos.y - Math.cos(fish.heading) * tailDist;
  spawnRipple(tailX, tailZ, 0.72 * intensity);
  scheduleNextBurst(fish);
}

function triggerFishFlee(fish) {
  fish.state = 'FLEE';
  fish.stateTimer = 0;
  fish.fleeTimer = fish.archetype.fleeDuration * (0.85 + Math.random() * 0.35);
  // Cada carpa foge com um ligeiro ângulo próprio para não parecerem robóticas
  fish.fleeHeadingOffset = (Math.random() - 0.5) * 0.85;
  fish.fleeCooldown = 0.45;

  const tailDist = 2.4 * params.fishScale * fish.archetype.scale;
  const tailX = fish.pos.x - Math.sin(fish.heading) * tailDist;
  const tailZ = fish.pos.y - Math.cos(fish.heading) * tailDist;
  spawnRipple(tailX, tailZ, 1.05);
}

function updateSingleFish(fish, dt) {
  if (!fish.visible) return;

  const arch = fish.archetype;
  fish.stateTimer += dt;
  if (fish.fleeCooldown > 0) fish.fleeCooldown -= dt;

  const cruiseSpeed = params.baseSpeed * arch.speedFactor;
  const burstPeakSpeed = cruiseSpeed * arch.burstPower;

  // 1. Checa ameaça do mouse em movimento (FUGA INDIVIDUAL)
  let distToMouse = 999;
  if (params.interactiveMouse && mouse.inside) {
    distToMouse = fish.pos.distanceTo(mouse.world);
    if (mouse.moving && distToMouse < arch.fearRadius && fish.fleeCooldown <= 0) {
      // Carpas mais medrosas fogem instantaneamente; mais corajosas só fogem se realmente perto ou movimento brusco
      const triggerDist = arch.fearRadius * (mouse.speed > 4.0 ? 1.0 : 0.78);
      if (distToMouse < triggerDist) {
        triggerFishFlee(fish);
      }
    }
  }

  // 2. Procura o petisco mais próximo na água (se não estiver fugindo)
  let nearestTreat = null;
  let nearestTreatDist = 999;
  if (fish.state !== 'FLEE' && treats.length > 0) {
    for (let i = 0; i < treats.length; i++) {
      const d = fish.pos.distanceTo(treats[i].pos);
      if (d < nearestTreatDist) {
        nearestTreatDist = d;
        nearestTreat = treats[i];
      }
    }
    // Só entra em SEEK_TREAT se houver petisco
    if (nearestTreat && fish.state !== 'SEEK_TREAT') {
      fish.state = 'SEEK_TREAT';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'SEEK_TREAT' && treats.length === 0) {
    fish.state = 'COAST';
    fish.stateTimer = 0;
  }

  // 3. Máquina de Estados Comportamental
  let thrustEffort = 0.25;

  if (fish.state === 'FLEE') {
    fish.fleeTimer -= dt;
    const fleeTargetSpeed = cruiseSpeed * arch.fearBoost;
    // Arrancada rápida no início da fuga, depois desliza longe
    if (fish.stateTimer < 0.42) {
      fish.speed = THREE.MathUtils.lerp(fish.speed, fleeTargetSpeed, Math.min(1, dt * 8.5));
      thrustEffort = 1.48;
    } else {
      fish.speed = THREE.MathUtils.lerp(fish.speed, cruiseSpeed * 1.45, Math.min(1, dt * 2.2));
      thrustEffort = 0.72;
    }

    if (fish.fleeTimer <= 0) {
      fish.state = 'COAST';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'SEEK_TREAT' && nearestTreat) {
    // Nada animada em direção ao petisco (com impulso se estiver mais longe)
    const targetSpd = cruiseSpeed * (nearestTreatDist > 4.5 ? 1.42 * arch.appetite : 1.08 * arch.appetite);
    fish.speed = THREE.MathUtils.lerp(fish.speed, targetSpd, Math.min(1, dt * 3.2));
    thrustEffort = nearestTreatDist > 4.0 ? 0.85 : 0.48;

    // Posição da boca (focinho) para comer o petisco
    const scale = params.fishScale * arch.scale;
    const mouthX = fish.pos.x + Math.sin(fish.heading) * (1.85 * scale);
    const mouthZ = fish.pos.y + Math.cos(fish.heading) * (1.85 * scale);
    const mouthDist = Math.hypot(mouthX - nearestTreat.pos.x, mouthZ - nearestTreat.pos.y);

    if (mouthDist < 0.62 * scale + 0.22) {
      // Comeu o petisco!
      const idx = treats.indexOf(nearestTreat);
      if (idx !== -1) {
        spawnBiteEffect(nearestTreat.pos.x, nearestTreat.pos.y);
        scene.remove(nearestTreat.group);
        treats.splice(idx, 1);
      }
      fish.state = 'COAST';
      fish.stateTimer = 0;
      fish.wanderAngle += (Math.random() > 0.5 ? 1 : -1) * 1.3;
    }
  } else if (fish.state === 'REST') {
    // Algumas carpas (como a Showa e a Asagi) gostam de ficar quase paradas deslizando lentamente
    const restSpeed = cruiseSpeed * 0.36;
    fish.speed = THREE.MathUtils.lerp(fish.speed, restSpeed, Math.min(1, dt * 1.8));
    thrustEffort = 0.12;
    fish.restDuration -= dt;
    if (fish.restDuration <= 0) {
      fish.state = 'CRUISE';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'CRUISE') {
    fish.nextBurstIn -= dt;
    const speedErr = cruiseSpeed - fish.speed;
    fish.speed += speedErr * Math.min(1.0, dt * 1.8);
    thrustEffort = 0.32 + 0.08 * Math.sin(clockTime * 1.2 + fish.index);

    if (fish.nextBurstIn <= 0) {
      // Carpas mais calmas às vezes preferem descansar um pouco em vez de dar burst
      if (Math.random() < arch.restTendency * 0.45) {
        fish.state = 'REST';
        fish.restDuration = 2.0 + Math.random() * 2.5;
        scheduleNextBurst(fish);
      } else {
        triggerFishBurst(fish, 0.9 + Math.random() * 0.25);
      }
    }
  } else if (fish.state === 'BURST') {
    const p = Math.min(fish.stateTimer / fish.burstDuration, 1.0);
    const impulseCurve = Math.sin(p * Math.PI);
    const burstAccel = (burstPeakSpeed - cruiseSpeed) * 3.8 * impulseCurve;
    fish.speed += burstAccel * dt;
    fish.speed = Math.min(fish.speed, burstPeakSpeed * 1.15);
    thrustEffort = 0.55 + 1.15 * impulseCurve;

    if (fish.stateTimer >= fish.burstDuration) {
      fish.state = 'COAST';
      fish.stateTimer = 0;
    }
  } else if (fish.state === 'COAST') {
    const waterDrag = 1.08;
    const floorSpeed = cruiseSpeed * 0.68;
    const excess = Math.max(0, fish.speed - floorSpeed);
    fish.speed = floorSpeed + excess * Math.exp(-waterDrag * dt);
    thrustEffort = 0.08;

    if (fish.speed <= cruiseSpeed * 1.05 && fish.stateTimer > 1.0) {
      fish.state = 'CRUISE';
      fish.stateTimer = 0;
    }
  }

  // 4. Steering Behaviors (Wander + Petisco + Fuga + Curiosidade + Separação + Bordas)
  fish.wanderAngle += (Math.sin(clockTime * 0.7 + fish.index * 2.1) * 0.6 + (Math.random() - 0.5) * 1.7) * dt;
  const forwardX = Math.sin(fish.heading);
  const forwardZ = Math.cos(fish.heading);

  let steerX = forwardX * 3.0 + Math.sin(fish.wanderAngle) * 1.45;
  let steerZ = forwardZ * 3.0 + Math.cos(fish.wanderAngle) * 1.45;

  if (fish.state === 'FLEE') {
    // Fuga ativa para longe do mouse, proporcional à personalidade (fleeDistanceBias)
    const awayX = fish.pos.x - mouse.world.x;
    const awayZ = fish.pos.y - mouse.world.y;
    const baseAwayAngle = Math.atan2(awayX, awayZ) + fish.fleeHeadingOffset;
    const fleeWeight = 12.0 * arch.fleeDistanceBias;
    steerX = Math.sin(baseAwayAngle) * fleeWeight;
    steerZ = Math.cos(baseAwayAngle) * fleeWeight;
  } else if (fish.state === 'SEEK_TREAT' && nearestTreat) {
    // Atração direta e suave ao petisco
    const toX = nearestTreat.pos.x - fish.pos.x;
    const toZ = nearestTreat.pos.y - fish.pos.y;
    const len = Math.max(0.01, Math.hypot(toX, toZ));
    steerX = (toX / len) * 10.5;
    steerZ = (toZ / len) * 10.5;
  } else if (params.interactiveMouse && mouse.inside && mouse.stillTime > 1.65) {
    // CURIOSIDADE: mouse parado por um tempo atrai as carpas suavemente para perto
    const curiosityRamp = Math.min(1.0, (mouse.stillTime - 1.65) / 2.6) * arch.curiosity;
    const toX = mouse.world.x - fish.pos.x;
    const toZ = mouse.world.y - fish.pos.y;
    const dist = Math.max(0.1, Math.hypot(toX, toZ));
    const nx = toX / dist;
    const nz = toZ / dist;

    // Componente tangencial para orbitar suavemente em volta do cursor sem bater nele
    const tx = -nz * fish.curiosityOrbitSign;
    const tz = nx * fish.curiosityOrbitSign;
    const desiredOrbit = arch.curiosityOrbit;

    if (dist > desiredOrbit + 0.6) {
      // Aproxima-se com curiosidade
      steerX += (nx * 4.4 + tx * 1.4) * curiosityRamp;
      steerZ += (nz * 4.4 + tz * 1.4) * curiosityRamp;
    } else if (dist < desiredOrbit - 0.5) {
      // Mantém distância respeitosa orbitando
      steerX += (-nx * 2.2 + tx * 3.8) * curiosityRamp;
      steerZ += (-nz * 2.2 + tz * 3.8) * curiosityRamp;
    } else {
      // Circula calmamente observando o cursor parado
      steerX += (tx * 4.2 + nx * 0.4) * curiosityRamp;
      steerZ += (tz * 4.2 + nz * 0.4) * curiosityRamp;
    }
  }

  // Separação suave entre as 5 carpas (evita sobreposição artificial)
  for (let j = 0; j < fishList.length; j++) {
    const other = fishList[j];
    if (other === fish || !other.visible) continue;
    const dx = fish.pos.x - other.pos.x;
    const dz = fish.pos.y - other.pos.y;
    const dSq = dx * dx + dz * dz;
    const minSep = 2.65 * params.fishScale;
    if (dSq < minSep * minSep && dSq > 0.001) {
      const d = Math.sqrt(dSq);
      const push = (1.0 - d / minSep) * (fish.state === 'SEEK_TREAT' ? 2.4 : 4.2);
      steerX += (dx / d) * push;
      steerZ += (dz / d) * push;
    }
  }

  // Evasão suave das bordas da viewport
  const marginX = Math.max(2.6, worldBounds.halfW * 0.22);
  const marginZ = Math.max(2.2, worldBounds.halfH * 0.24);
  const safeW = Math.max(1.5, worldBounds.halfW - marginX);
  const safeH = Math.max(1.2, worldBounds.halfH - marginZ);

  if (Math.abs(fish.pos.x) > safeW) {
    const over = (Math.abs(fish.pos.x) - safeW) / marginX;
    steerX -= Math.sign(fish.pos.x) * over * over * 11.5;
  }
  if (Math.abs(fish.pos.y) > safeH) {
    const over = (Math.abs(fish.pos.y) - safeH) / marginZ;
    steerZ -= Math.sign(fish.pos.y) * over * over * 11.5;
  }

  const desiredHeading = Math.atan2(steerX, steerZ);
  const angleDiff = normalizeAngle(desiredHeading - fish.heading);

  const maxTurnRate = fish.state === 'FLEE' ? 3.2 : (fish.state === 'SEEK_TREAT' ? 2.5 : 1.75);
  const turnGain = fish.state === 'FLEE' ? 3.4 : (fish.state === 'SEEK_TREAT' ? 2.4 : 1.85);
  const targetAngVel = THREE.MathUtils.clamp(angleDiff * turnGain, -maxTurnRate, maxTurnRate);
  fish.angularVelocity = THREE.MathUtils.lerp(fish.angularVelocity, targetAngVel, Math.min(1, dt * 4.8));

  fish.heading = normalizeAngle(fish.heading + fish.angularVelocity * dt);
  fish.pos.x += Math.sin(fish.heading) * fish.speed * dt;
  fish.pos.y += Math.cos(fish.heading) * fish.speed * dt;

  // Aceleração real
  const rawAccel = (fish.speed - fish.prevSpeed) / Math.max(dt, 0.001);
  fish.acceleration = THREE.MathUtils.lerp(fish.acceleration, rawAccel, Math.min(1, dt * 8.0));
  fish.prevSpeed = fish.speed;

  // 5. Acoplamento Corpo-Física (Vertex Shader Uniforms)
  const accelBoost = Math.max(0, fish.acceleration) * 0.16;
  const targetEffort = THREE.MathUtils.clamp(thrustEffort + accelBoost, 0.06, 1.85);
  fish.smoothEffort = THREE.MathUtils.lerp(fish.smoothEffort, targetEffort, Math.min(1, dt * 6.8));

  const swimFreq = 2.5 + fish.smoothEffort * 8.6;
  fish.swimPhase += swimFreq * dt;

  const tailAmp = 0.10 + fish.smoothEffort * 0.34;

  fish.smoothSpineCurve = THREE.MathUtils.lerp(
    fish.smoothSpineCurve,
    fish.angularVelocity * 0.50,
    Math.min(1, dt * 6.2)
  );

  const fastMode = fish.state === 'BURST' || fish.state === 'FLEE';
  const targetSpread = fastMode
    ? 0.08
    : (fish.state === 'COAST' || fish.state === 'REST' ? 0.56 : 0.38);
  fish.smoothPectSpread = THREE.MathUtils.lerp(fish.smoothPectSpread, targetSpread, Math.min(1, dt * 4.2));

  fish.pectRowPhase += (1.7 + fish.smoothEffort * 1.4) * dt;
  const gentleRow = Math.sin(fish.pectRowPhase) * (fastMode ? 0.04 : 0.11);
  const turnL = Math.max(0, fish.angularVelocity) * 0.22;
  const turnR = Math.max(0, -fish.angularVelocity) * 0.22;

  fish.uniforms.uSwimPhase.value = fish.swimPhase;
  fish.uniforms.uTailAmp.value = tailAmp;
  fish.uniforms.uSpineCurve.value = fish.smoothSpineCurve;
  fish.uniforms.uPectoralSpread.value = fish.smoothPectSpread;
  fish.uniforms.uPectoralRowL.value = gentleRow + turnL;
  fish.uniforms.uPectoralRowR.value = -gentleRow + turnR;

  // 6. Aplica posição, rotação, profundidade e sombra proporcional
  const s = params.fishScale * arch.scale;
  const bobY = Math.sin(clockTime * 1.1 + fish.index * 1.7) * 0.06;
  const yPos = arch.depthY + bobY;

  fish.group.position.set(fish.pos.x, yPos, fish.pos.y);
  fish.group.rotation.y = fish.heading;
  fish.group.scale.set(s * arch.widthRatio, s, s);

  // Quanto mais alta a carpa na coluna d'água, maior o deslocamento da sombra no fundo
  const heightAboveBottom = yPos - (-3.3);
  const shadowOffsetFactor = heightAboveBottom / 3.3;
  fish.shadowGroup.position.set(
    fish.pos.x + 1.12 * shadowOffsetFactor,
    -3.28 + fish.index * 0.004,
    fish.pos.y + 1.02 * shadowOffsetFactor
  );
  fish.shadowGroup.rotation.y = fish.heading;
  fish.shadowGroup.scale.set(s * arch.widthRatio * 1.04, s, s * 1.04);
}

// =========================================================================
// 11. PAINEL LIL-GUI (RECOLHIDO POR PADRÃO) + LIVELY WALLPAPER API
// =========================================================================
let gui = null;
const guiControllers = {};

function initGui() {
  try {
    const { GUI } = window.lil;
    gui = new GUI({ title: 'Koi Pond · Controles', width: 260 });

    guiControllers.fishCount = gui
      .add(params, 'fishCount', 1, 5, 1)
      .name('Quantidade de Carpas')
      .onChange(syncFishCount);

    guiControllers.burstFrequency = gui
      .add(params, 'burstFrequency', 0.3, 2.5, 0.05)
      .name('Frequência Impulsos');

    guiControllers.baseSpeed = gui
      .add(params, 'baseSpeed', 1.0, 5.0, 0.1)
      .name('Velocidade Base');

    guiControllers.causticsIntensity = gui
      .add(params, 'causticsIntensity', 0.0, 2.2, 0.05)
      .name('Intensidade Cáusticas')
      .onChange(syncCausticsUniform);

    guiControllers.fishScale = gui
      .add(params, 'fishScale', 0.55, 1.65, 0.05)
      .name('Tamanho das Carpas');

    guiControllers.interactiveMouse = gui
      .add(params, 'interactiveMouse')
      .name('Interação Mouse');

    gui.add(params, 'dropTreatCenter').name('🍤 Soltar Petisco');
    gui.add(params, 'triggerAllBursts').name('⚡ Disparar Impulsos');

    gui.close();
    syncGuiVisibility();
  } catch (err) {
    console.warn('lil-gui indisponível (modo offline):', err);
  }
}

function syncCausticsUniform() {
  pondBottomUniforms.uCausticsIntensity.value = params.causticsIntensity;
  waterSurfaceUniforms.uCausticsIntensity.value = params.causticsIntensity;
  globalFishUniforms.uCausticsIntensity.value = params.causticsIntensity;
}

function syncGuiVisibility() {
  if (!gui) return;
  gui.domElement.classList.toggle('hidden-gui', !params.showGui);
}

window.livelyPropertyListener = function (name, val) {
  if (name === 'fishCount') {
    params.fishCount = Math.max(1, Math.min(5, Number(val)));
    syncFishCount();
  } else if (name === 'burstFrequency') {
    params.burstFrequency = Number(val) / 100;
  } else if (name === 'baseSpeed') {
    params.baseSpeed = (Number(val) / 100) * 2.25;
  } else if (name === 'causticsIntensity') {
    params.causticsIntensity = Number(val) / 100;
    syncCausticsUniform();
  } else if (name === 'fishScale') {
    params.fishScale = Number(val) / 100;
  } else if (name === 'interactiveMouse') {
    params.interactiveMouse = Boolean(val);
  } else if (name === 'showGui') {
    params.showGui = Boolean(val);
    syncGuiVisibility();
  }
  if (guiControllers[name]) {
    guiControllers[name].updateDisplay();
  }
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'h' || e.key === 'H') {
    params.showGui = !params.showGui;
    syncGuiVisibility();
  } else if (e.code === 'Space') {
    params.dropTreatCenter();
  }
});

initGui();

// =========================================================================
// 12. RESIZE E LOOP PRINCIPAL A 60 FPS
// =========================================================================
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  updateBounds();
  pondBottomUniforms.uHalfSize.value.set(worldBounds.halfW, worldBounds.halfH);
  waterSurfaceUniforms.uHalfSize.value.set(worldBounds.halfW, worldBounds.halfH);
  moteUniforms.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener('resize', onResize);

let lastNow = performance.now();
let clockTime = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastNow) * 0.001, 0.05);
  lastNow = now;
  clockTime += dt;

  pondBottomUniforms.uTime.value = clockTime;
  waterSurfaceUniforms.uTime.value = clockTime;
  globalFishUniforms.uTime.value = clockTime;
  moteUniforms.uTime.value = clockTime;

  updateMouseState(dt);
  updateTreatsAndBites(dt);

  for (let i = 0; i < fishList.length; i++) {
    updateSingleFish(fishList[i], dt);
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
})();
