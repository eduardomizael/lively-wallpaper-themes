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

const params = {
  baseSpeed: 1.85,          // Velocidade de patrulha do tucunaré
  ambushTendency: 1.0,      // Frequência/duração de espairar/emboscada
  causticsIntensity: 1.15,  // Intensidade das cáusticas
  sunbeamsIntensity: 1.0,   // Intensidade dos raios de luz
  fishScale: 1.08,          // Escala global do tucunaré
  showAlgae: !isPiranhaProfile, // Exibir/ocultar algas no fundo
  interactiveMouse: true,   // Espreita, fuga e isca ao clicar
  showGui: isPreview && !isInspect,
  dropBaitCenter: () => spawnBait((Math.random() - 0.5) * 8.0, (Math.random() - 0.5) * 2.8),
  triggerStrike: () => allFish.forEach(f => triggerPredatorBurst(f, 1.0))
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
  minY: -1.40,
  maxY: 1.50,
  minZ: -2.8,
  maxZ: 2.6
};

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
const allFish = [tucunare, tucunareRealista];
const piranha = !isInspect || isPiranhaProfile || isFishTrio
  ? createPiranhaModel(CAUSTICS_GLSL, globalFishUniforms)
  : null;
if (piranha) scene.add(piranha);

function posePiranha(time) {
  if (!piranha) return;
  const bob = Math.sin(time * 1.24) * 0.060;
  if (isPiranhaProfile) {
    piranha.position.set(0, bob, 0);
    piranha.rotation.y = -1.22 + Math.sin(time * 0.48) * 0.24;
    return;
  }
  if (isFishTrio) {
    piranha.position.set(3.58, 0.15 + bob, -0.46);
  } else {
    const laneX = Math.min(swimVolume.halfX * 0.51, 3.55);
    piranha.position.set(laneX + Math.sin(time * 0.51) * 0.32, 1.17 + bob, -3.8);
  }
  piranha.rotation.y = -1.43 + Math.sin(time * 0.69) * 0.13;
}

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

const biteBubbles = [];
const bubbleGeo = new THREE.SphereGeometry(0.055, 8, 6);
const bubbleMat = new THREE.MeshBasicMaterial({
  color: 0xc8faf2,
  transparent: true,
  opacity: 0.68,
  depthWrite: false
});

function spawnStrikeSplash(x, y, z) {
  spawnRipple(x, z, 1.35);
  for (let i = 0; i < 11; i++) {
    const mesh = new THREE.Mesh(bubbleGeo, bubbleMat.clone());
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.55 + Math.random() * 1.45;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.5 + Math.random() * 1.0);
    mesh.renderOrder = 14;
    scene.add(mesh);
    biteBubbles.push({
      mesh,
      vx: Math.cos(ang) * spd,
      vy: 0.9 + Math.random() * 1.35,
      vz: Math.sin(ang) * spd,
      life: 0,
      maxLife: 0.75 + Math.random() * 0.55
    });
  }
}

function spawnBait(x, z) {
  const cx = THREE.MathUtils.clamp(x, -swimVolume.halfX * 0.90, swimVolume.halfX * 0.90);
  const cz = THREE.MathUtils.clamp(z, swimVolume.minZ * 0.85, swimVolume.maxZ * 0.85);
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

  for (let i = biteBubbles.length - 1; i >= 0; i--) {
    const p = biteBubbles[i];
    p.life += dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vx *= 0.94;
    p.vz *= 0.94;
    const remain = 1.0 - p.life / p.maxLife;
    p.mesh.material.opacity = Math.max(0, remain * 0.68);
    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      biteBubbles.splice(i, 1);
    }
  }
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
    return {
      x: THREE.MathUtils.clamp(hitPoint.x, -swimVolume.halfX, swimVolume.halfX),
      z: THREE.MathUtils.clamp(hitPoint.z, swimVolume.minZ, swimVolume.maxZ)
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
  const targetSide = fish.pos.x > 0 ? -1 : 1;
  const wx = targetSide * (swimVolume.halfX * (0.38 + Math.random() * 0.44));
  const wy = THREE.MathUtils.lerp(swimVolume.minY + 0.25, swimVolume.maxY - 0.2, Math.random());
  const wz = THREE.MathUtils.lerp(swimVolume.minZ * 0.68, swimVolume.maxZ * 0.68, Math.random());
  fish.waypoint.set(wx, wy, wz);
  fish.waypointTimer = 4.8 + Math.random() * 4.2;
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

function updateTucunare(fish, dt, otherFish = null) {
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
      fish.group.scale.setScalar(params.fishScale * 1.12);
      fish.shadowGroup.position.set(0.95, RIVERBED_Y + 0.14, -0.45);
      fish.shadowGroup.rotation.y = rotY2;
      fish.shadowGroup.scale.setScalar(params.fishScale * 1.22);
    } else if (inspectFish === '1') {
      fish.group.position.set(0, 0.05, 0);
      fish.group.rotation.set(-0.04, Math.PI * 0.44, 0);
      fish.group.scale.setScalar(params.fishScale * 1.15);
      fish.shadowGroup.position.set(0.95, RIVERBED_Y + 0.14, -0.45);
      fish.shadowGroup.rotation.y = Math.PI * 0.44;
      fish.shadowGroup.scale.setScalar(params.fishScale * 1.25);
    } else {
      // A comparação com três peixes abre espaço entre as nadadeiras.
      const yOff = (isFish2 ? -1 : 1) * (isFishTrio ? 1.43 : 1.28);
      const rotYBoth = inspectAngle === '34' ? -Math.PI * 0.43 : -Math.PI * 0.5;
      fish.group.position.set(isFishTrio ? -2.05 : 0, yOff, 0);
      fish.group.rotation.set(0.0, rotYBoth, 0);
      fish.group.scale.setScalar(params.fishScale * 0.94);
      fish.shadowGroup.visible = false;
    }
    return;
  }

  fish.group.visible = true;
  fish.shadowGroup.visible = true;

  fish.stateTimer += dt;
  if (fish.fleeCooldown > 0) fish.fleeCooldown -= dt;

  const patrolSpeed = params.baseSpeed;
  const strikePeakSpeed = patrolSpeed * 3.2;

  // 1. Reação defensiva a movimento brusco muito próximo
  if (params.interactiveMouse && mouse.inside && mouse.moving && fish.fleeCooldown <= 0) {
    const dMouse = Math.hypot(fish.pos.x - mouse.world.x, fish.pos.z - mouse.world.z);
    if (dMouse < 3.4 && mouse.speed > 5.5) {
      triggerPredatorFlee(fish);
    }
  }

  // 2. Verifica isca na água
  let nearestBait = null;
  let nearestBaitDist = 999;
  if (fish.state !== 'FLEE' && baits.length > 0) {
    for (let i = 0; i < baits.length; i++) {
      const d = fish.pos.distanceTo(baits[i].pos);
      if (d < nearestBaitDist) {
        nearestBaitDist = d;
        nearestBait = baits[i];
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

      const s = params.fishScale;
      const mouthX = fish.pos.x + Math.sin(fish.heading) * (2.1 * s);
      const mouthZ = fish.pos.z + Math.cos(fish.heading) * (2.1 * s);
      const mouthDist = Math.hypot(mouthX - nearestBait.pos.x, fish.pos.y - nearestBait.pos.y, mouthZ - nearestBait.pos.z);

      // Abre a boca progressivamente conforme se aproxima para engolir a isca no bote!
      if (mouthDist < 2.8 * s) {
        targetMouthOpen = THREE.MathUtils.clamp(1.0 - (mouthDist - 0.65 * s) / (2.15 * s), 0.18, 1.0);
      }

      if (mouthDist < 0.88 * s) {
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
      if (Math.random() < 0.48 * params.ambushTendency) {
        fish.state = 'HOVER';
        fish.stateTimer = 0;
        fish.hoverDuration = (2.6 + Math.random() * 3.2) * params.ambushTendency;
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
      fish.hoverDuration = (2.8 + Math.random() * 3.4) * params.ambushTendency;
    }
  }

  // 4. Contenção suave no volume isométrico
  const marginX = 2.0;
  const safeX = swimVolume.halfX - marginX;
  let steerX = desiredDirX * 3.0;
  let steerZ = desiredDirZ * 3.0;

  if (Math.abs(fish.pos.x) > safeX) {
    const over = (Math.abs(fish.pos.x) - safeX) / marginX;
    steerX -= Math.sign(fish.pos.x) * over * over * 9.5;
  }
  if (fish.pos.z > swimVolume.maxZ - 0.8) {
    const over = (fish.pos.z - (swimVolume.maxZ - 0.8)) / 0.9;
    steerZ -= over * over * 9.5;
  } else if (fish.pos.z < swimVolume.minZ + 0.8) {
    const over = ((swimVolume.minZ + 0.8) - fish.pos.z) / 0.9;
    steerZ += over * over * 9.5;
  }

  // Separação suave entre os dois tucunarés para evitar sobreposição
  if (otherFish) {
    const dxSep = fish.pos.x - otherFish.pos.x;
    const dzSep = fish.pos.z - otherFish.pos.z;
    const dHoriz = Math.hypot(dxSep, dzSep);
    if (dHoriz < 3.2 && dHoriz > 0.001) {
      const push = 1.0 - dHoriz / 3.2;
      steerX += (dxSep / dHoriz) * push * 5.2;
      steerZ += (dzSep / dHoriz) * push * 5.2;
    }
    if (dHoriz < 2.2) {
      const dySep = fish.pos.y - otherFish.pos.y;
      if (Math.abs(dySep) < 0.8) {
        desiredY += (fish.id === 2 ? -1 : 1) * 0.45 * (1.0 - dHoriz / 2.2);
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
  const s = params.fishScale;
  const bobY = Math.sin(clockTime * 1.4) * 0.04;
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
    guiControllers.fishScale = gui.add(params, 'fishScale', 0.6, 1.6, 0.05).name('Tamanho Tucunaré');
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

function animate(now) {
  requestAnimationFrame(animate);
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
  updateTucunare(tucunare, dt, tucunareRealista);
  updateTucunare(tucunareRealista, dt, tucunare);
  posePiranha(clockTime);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
})();
