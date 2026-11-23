(() => {
  'use strict';

  function createTucunareV1({ scene, CAUSTICS_GLSL, params, isInspect }) {
    // =========================================================================
    // 4. ANATOMIA 3D ESCULPIDA DO TUCUNARÉ AZUL (Cichla piquiti)
    // =========================================================================
    const HEAD_Z = 2.25;
    const BODY_LEN = 4.09;
    const PEDUNCLE_END_Z = HEAD_Z - BODY_LEN;
    const CAUDAL_ROOT_Z = PEDUNCLE_END_Z + 0.10;
    const CAUDAL_LEN = 1.08;
    const EYE_Z = 1.65;
    const EYE_Y = 0.215;
    const MOUTH_END = 0.16;
    const MOUTH_TIP_Y = -0.045;
    const MOUTH_SLOPE = 2.53;
    const MOUTH_SETTLE = 0.29;
    const JAW_HINGE_Z = HEAD_Z - MOUTH_END * BODY_LEN;
    const JAW_HINGE_Y = MOUTH_TIP_Y - MOUTH_SLOPE * MOUTH_END;

    function operculumZ(y) {
      return 1.06 + 0.43 * (y + 0.10) ** 2 + 0.19 * y;
    }

    // Interpolação suave por tabela anatômica (Catmull-Rom 1D) para silhueta real de Tucunaré
    function sampleProfile(table, t) {
      const clamped = Math.max(0, Math.min(1, t));
      let i = 0;
      while (i < table.length - 2 && clamped > table[i + 1][0]) i++;
      const p0 = table[Math.max(0, i - 1)];
      const p1 = table[i];
      const p2 = table[i + 1];
      const p3 = table[Math.min(table.length - 1, i + 2)];
      const span = Math.max(1e-5, p2[0] - p1[0]);
      const u = (clamped - p1[0]) / span;
      const u2 = u * u, u3 = u2 * u;
      return 0.5 * (
        (2 * p1[1]) +
        (-p0[1] + p2[1]) * u +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3
      );
    }

    // Perfil dorsal (+Y): focinho baixo, testa arredondada e dorso arqueado.
    const DORSAL_TABLE = [
      [0.00, 0.13],
      [0.04, 0.22],
      [0.09, 0.33],
      [0.16, 0.52],
      [0.24, 0.69],
      [0.33, 0.79],
      [0.46, 0.78],
      [0.59, 0.68],
      [0.71, 0.51],
      [0.82, 0.34],
      [0.92, 0.255],
      [1.00, 0.255]
    ];

    // Perfil ventral (-Y): queixo arredondado e forte, garganta cheia, ventre suave e pedúnculo recortado
    const VENTRAL_TABLE = [
      [0.00, 0.19],
      [0.04, 0.33],
      [0.10, 0.49],
      [0.18, 0.62],
      [0.28, 0.72],
      [0.45, 0.73],
      [0.59, 0.65],
      [0.70, 0.52],
      [0.82, 0.34],
      [0.93, 0.24],
      [1.00, 0.235]
    ];

    // Largura lateral (X): focinho largo de predador, ombros musculosos e ponta traseira afinando na cauda
    const WIDTH_TABLE = [
      [0.00, 0.15],
      [0.05, 0.204],
      [0.15, 0.276],
      [0.27, 0.392],
      [0.43, 0.393],
      [0.60, 0.325],
      [0.76, 0.218],
      [0.91, 0.115],
      [0.978, 0.073],
      [1.00, 0.0]
    ];

    const tucunareHeightUp = t => Math.max(0.02, sampleProfile(DORSAL_TABLE, t));
    const tucunareHeightDown = t => Math.max(0.02, sampleProfile(VENTRAL_TABLE, t));
    const tucunareWidth = t => Math.max(0.0, sampleProfile(WIDTH_TABLE, t));

    function createTucunareBodyGeometry() {
      const lengthSegs = 120;
      const halfRingSegs = 24;
      const positions = [];
      const uvs = [];
      const anatomy = [];
      const indices = [];
      const mouthRings = [];
      const stride = halfRingSegs + 1;
      const halfSize = (lengthSegs + 1) * stride;

      // As duas metades se encontram no flanco e se separam à frente da articulação.
      for (const jaw of [1, -1]) {
        const offset = jaw > 0 ? 0 : halfSize;
        for (let i = 0; i <= lengthSegs; i++) {
          const t = i / lengthSegs;
          const baseZ = HEAD_Z - t * BODY_LEN;
          const mouth = 1 - THREE.MathUtils.smoothstep(t, 0.093, MOUTH_END);
          const noseRound = Math.sqrt(1 - (1 - Math.min(1, t / 0.026)) ** 2);
          const lipAxis = (MOUTH_TIP_Y - MOUTH_SLOPE * Math.min(t, MOUTH_END)) *
            (1 - THREE.MathUtils.smoothstep(t, MOUTH_END, MOUTH_SETTLE));
          const lipY = lipAxis + jaw * 0.006 * mouth;
          const rx = tucunareWidth(t) * THREE.MathUtils.lerp(0.79, 1, noseRound);
          const endY = jaw > 0 ? tucunareHeightUp(t) : -tucunareHeightDown(t);
          const lipZ = jaw < 0 ? 0.052 * (1 - THREE.MathUtils.smoothstep(t, 0.015, 0.115)) : 0;
          const noseBow = 0.034 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.040));
          const faceSlope = 0.031 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.08));

          for (let j = 0; j <= halfRingSegs; j++) {
            const v = (j / halfRingSegs + (jaw < 0 ? 1 : 0)) * 0.5;
            const theta = v * Math.PI * 2;
            const cosT = Math.cos(theta);
            const sinAbs = Math.abs(Math.sin(theta));
            const flankRadius = Math.pow(Math.abs(cosT), 0.86);
            const lipRoll = jaw * 0.026 * sinAbs * (1 - sinAbs) * mouth * noseRound;
            const z = baseZ + lipZ + noseBow * (1 - flankRadius ** 2) - faceSlope * sinAbs * noseRound;
            const y = lipY + sinAbs * (endY - lipY) * noseRound + lipRoll;
            const cheek = Math.exp(-(((z - operculumZ(y) - 0.12) / 0.22) ** 2 + ((y + 0.10) / 0.35) ** 2));
            const gillFold = Math.exp(-(((z - operculumZ(y)) / 0.043) ** 2 + ((y + 0.11) / 0.32) ** 2));
            const socket = Math.exp(-(((z - EYE_Z) / 0.115) ** 2 + ((y - EYE_Y) / 0.105) ** 2));
            const lipRim = 0.013 * mouth * (1 - sinAbs) ** 5;
            const x = Math.sign(cosT) * flankRadius *
              (rx * (1 + 0.07 * jaw * sinAbs) + lipRim + 0.044 * cheek - 0.018 * gillFold - 0.031 * socket);

            positions.push(x, y, z);
            uvs.push(t, v);
            anatomy.push(jaw, 0);

            if (i < lengthSegs && j < halfRingSegs) {
              const a = offset + i * stride + j;
              indices.push(a, a + stride, a + 1, a + stride, a + stride + 1, a + 1);
            }
          }

          if (mouth > 0) {
            const first = (offset + i * stride) * 3;
            const last = first + halfRingSegs * 3;
            mouthRings.push({ jaw, t, z: baseZ + lipZ, y: lipY, noseBow, left: positions[first], right: positions[last] });
          }
        }
      }

      // Céu da boca e assoalho acompanham cada maxila e fecham a cavidade por dentro.
      const palateSegs = 12;
      for (let i = 0; i < mouthRings.length; i++) {
        const { jaw, t, z, y, noseBow, left, right } = mouthRings[i];
        const row = positions.length / 3;
        for (let j = 0; j <= palateSegs; j++) {
          const v = j / palateSegs;
          const span = 2 * v - 1;
          const arch = Math.sin(v * Math.PI) * THREE.MathUtils.smoothstep(t, 0.012, 0.063);
          positions.push(THREE.MathUtils.lerp(left, right, v), y + jaw * 0.102 * arch, z + noseBow * (1 - span * span));
          uvs.push(t, v);
          anatomy.push(jaw, 1);
          if (j < palateSegs && mouthRings[i + 1]?.jaw === jaw) {
            const a = row + j;
            const b = a + palateSegs + 1;
            indices.push(a, a + 1, b, b, a + 1, b + 1);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute('anatomy', new THREE.Float32BufferAttribute(anatomy, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      // Une as normais nos flancos atrás dos cantos da boca.
      const normals = geo.getAttribute('normal');
      const normal = new THREE.Vector3();
      const other = new THREE.Vector3();
      for (let i = 0; i <= lengthSegs; i++) {
        const join = THREE.MathUtils.smoothstep(i / lengthSegs, 0.113, MOUTH_END);
        for (const j of [0, halfRingSegs]) {
          const a = i * stride + j;
          const b = halfSize + i * stride + halfRingSegs - j;
          normal.fromBufferAttribute(normals, a);
          other.fromBufferAttribute(normals, b);
          normal.lerp(other, join * 0.5).normalize();
          other.lerp(normal, join).normalize();
          normals.setXYZ(a, normal.x, normal.y, normal.z);
          normals.setXYZ(b, other.x, other.y, other.z);
        }
      }
      return geo;
    }

    // Cauda vertical arredondada/truncada com encaixe contínuo no pedúnculo
    function createCaudalFinGeometry() {
      const segU = 28;
      const segV = 26;
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const side = (v - 0.5) * 2.0; // -1 inferior, +1 superior
          const absSide = Math.abs(side);

          const spreadY = 0.208 + Math.pow(u, 0.87) * (0.60 + side * 0.026);
          const cornerRound = 0.165 * Math.pow(absSide, 4.5) * u;
          const rearCurve = -0.035 * (1.0 - absSide * absSide) * u;

          const z = CAUDAL_ROOT_Z - u * CAUDAL_LEN + cornerRound + rearCurve;
          const y = side * spreadY + 0.012;
          // Ligeira curvatura 3D suave na membrana (evita parecer papel rígido)
          const x = Math.sin(v * Math.PI * 2.0) * 0.012 * u;

          positions.push(x, y, z);
          uvs.push(u, v);
        }
      }

      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    // Dorsal Anterior Espinhosa (14 espinhos individuais com membrana recortada + entalhe final)
    function createSpinyDorsalGeometry() {
      const segU = 112;
      const segV = 10;
      const positions = [];
      const uvs = [];
      const indices = [];
      const startZ = 0.87;
      const endZ = -0.57;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z - z) / BODY_LEN;
        const baseY = tucunareHeightUp(tBody) * 0.94;

        // Sobe rápido nos primeiros espinhos, mantém crista imponente e faz o entalhe característico antes da dorsal mole
        const frontRise = THREE.MathUtils.smoothstep(u, 0.0, 0.18);
        const rearNotch = 1.0 - 0.80 * Math.pow(THREE.MathUtils.smoothstep(u, 0.33, 1.0), 0.93);
        const envelope = (0.035 + 0.59 * frontRise) * rearNotch;

        // 14 espinhos serrilhados com membrana côncava entre as pontas
        const spinePhase = (u * 14.0) % 1.0;
        const scallop = 0.77 + 0.23 * Math.pow(1 - Math.abs(spinePhase * 2 - 1), 1.55);
        const finHeight = envelope * scallop;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          positions.push(0, baseY + v * finHeight, z - v * finHeight * 0.47);
          uvs.push(u, v);
        }
      }

      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    // Dorsal Posterior Mole (leque arredondado iridescente azulado com pintas)
    function createSoftDorsalGeometry() {
      const segU = 32;
      const segV = 10;
      const positions = [];
      const uvs = [];
      const indices = [];
      const startZ = -0.49;
      const endZ = -1.44;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z - z) / BODY_LEN;
        const baseY = tucunareHeightUp(tBody) * 0.91;
        const finHeight = Math.pow(Math.sin(Math.pow(u, 0.89) * Math.PI), 0.62) * 0.54 + 0.035;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const sweep = v * finHeight * (0.68 + 0.79 * u);
          positions.push(0, baseY + v * finHeight, z - sweep);
          uvs.push(u, v);
        }
      }

      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    // Nadadeira Anal (arredondada, base âmbar + borda azul iridescente com pintas)
    function createAnalFinGeometry() {
      const segU = 22;
      const segV = 10;
      const positions = [];
      const uvs = [];
      const indices = [];
      const startZ = -0.58;
      const endZ = -1.46;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z - z) / BODY_LEN;
        const baseY = -tucunareHeightDown(tBody) * 0.91;
        const finDepth = Math.pow(Math.sin(Math.pow(u, 0.79) * Math.PI), 0.66) * 0.48 + 0.03;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          positions.push(0, baseY - v * finDepth, z - v * finDepth * (0.70 + 0.76 * u));
          uvs.push(u, v);
        }
      }

      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          indices.push(a, d, b);
          indices.push(b, d, c);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    // Peitorais translúcidas em leque alongado e curvado ao longo do flanco
    function createPectoralFinGeometry(sideSign) {
      const segU = 18;
      const segV = 12;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const heightSpan = 0.093 + 0.48 * Math.sin(Math.pow(u, 0.93) * Math.PI);
        const reachX = Math.pow(u, 0.85) * 0.52;
        const sweepBack = Math.pow(u, 1.02) * 0.84;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const cup = Math.sin(v * Math.PI) * 0.06 * u;
          const localX = sideSign * (reachX + cup);
          const localY = (0.53 - v) * heightSpan - u * 0.045;
          const localZ = -sweepBack + Math.pow(v, 2.3) * 0.23 * u;
          positions.push(localX, localY, localZ);
          uvs.push(u, v);
        }
      }

      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          if (sideSign > 0) {
            indices.push(a, d, b);
            indices.push(b, d, c);
          } else {
            indices.push(a, b, d);
            indices.push(b, c, d);
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

    // Pélvicas inferiores bem formadas (leque ventral curvado para trás, sem parecer fio fino)
    function createPelvicFinGeometry(sideSign) {
      const segU = 12;
      const segV = 8;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const reach = Math.pow(u, 0.92);

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const depth = 0.56 + 0.18 * Math.sin(v * Math.PI) - 0.41 * v ** 2;
          const sweep = 0.13 + 0.50 * v;
          positions.push(
            sideSign * (reach * (0.17 + 0.13 * (1 - v)) + (0.5 - v) * 0.03),
            -reach * depth + (0.5 - v) * 0.047,
            -reach * sweep - v * 0.058
          );
          uvs.push(u, v);
        }
      }

      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          if (sideSign > 0) {
            indices.push(a, d, b);
            indices.push(b, d, c);
          } else {
            indices.push(a, b, d);
            indices.push(b, c, d);
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

    const sharedGeos = {
      body: createTucunareBodyGeometry(),
      caudal: createCaudalFinGeometry(),
      spinyDorsal: createSpinyDorsalGeometry(),
      softDorsal: createSoftDorsalGeometry(),
      anal: createAnalFinGeometry(),
      pectL: createPectoralFinGeometry(1),
      pectR: createPectoralFinGeometry(-1),
      pelvL: createPelvicFinGeometry(1),
      pelvR: createPelvicFinGeometry(-1),
      eye: new THREE.SphereGeometry(0.108, 24, 16).scale(0.71, 1.0, 1.0)
    };

    const pectLPivot = new THREE.Vector3(0.357, -0.18, 0.99);
    const pectRPivot = new THREE.Vector3(-0.357, -0.18, 0.99);
    const pelvLPivot = new THREE.Vector3(0.098, -0.66, 0.71);
    const pelvRPivot = new THREE.Vector3(-0.098, -0.66, 0.71);
    const eyeLPos = new THREE.Vector3(0.208, EYE_Y, EYE_Z);
    const eyeRPos = new THREE.Vector3(-0.208, EYE_Y, EYE_Z);

    // =========================================================================
    // 5. SHADERS REALISTAS DO TUCUNARÉ AZUL (ESCAMAS COM BUMP + IRIDESCÊNCIA + 5 BARRAS + OCELO)
    // =========================================================================
    const globalFishUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: params.causticsIntensity }
    };

    const FISH_DEFORM_GLSL = /* glsl */ `
      uniform float uSwimPhase;
      uniform float uTailAmp;
      uniform float uSpineCurve;
      uniform float uBreathPhase;
      uniform float uIdleDriftPhase;
      uniform float uMouthOpen;

      float fishLengthFraction(float z) {
        return clamp((${HEAD_Z} - z) / ${HEAD_Z - CAUDAL_ROOT_Z + CAUDAL_LEN + 0.035}, 0.0, 1.0);
      }

      float spineOffsetX(float z) {
        float s = fishLengthFraction(z);
        // Propulsão subcarangiforme: cabeça firme de predador, onda cresce a partir do meio do corpo
        float wave = sin(uSwimPhase - s * 4.9);
        float amp = uTailAmp * (0.006 + 0.994 * pow(max(0.0, s - 0.10) / 0.90, 2.05));
        float swimX = wave * amp;

        // Micro-ondulação sedosa só na ponta traseira mesmo quando quase parado
        float idleDrift = sin(uIdleDriftPhase - s * 3.2) * 0.035 * pow(s, 2.6);

        float ds = s - 0.25;
        float bendX = uSpineCurve * (ds * ds) * 2.45;
        return swimX + idleDrift + bendX;
      }

      vec3 deformFishPosition(vec3 p) {
        // Expansão dos opérculos na respiração e durante o bote.
        float gillDist = (p.z - 1.19) * 4.0;
        float gillMask = exp(-gillDist * gillDist);
        p.x *= (1.0 + gillMask * (0.042 * sin(uBreathPhase) + 0.11 * uMouthOpen));
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

    function createTucunareBodyMaterial(fishUniforms) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms
        },
        vertexShader: /* glsl */ `
          attribute vec2 anatomy;
          varying vec2 vUv;
          varying float vOralSurface;
          varying vec3 vObjPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${FISH_DEFORM_GLSL}

          void main() {
            vUv = uv;
            vOralSurface = anatomy.y;
            vObjPos = position;
            vec3 p = position;
            vec3 n = normal;
            float upper = step(0.0, anatomy.x);
            float jawWeight = 1.0 - smoothstep(0.065, ${MOUTH_END}, uv.x);
            float jawMotion = uMouthOpen * jawWeight;
            float breath = (1.0 - upper) * jawWeight * (0.005 + 0.005 * sin(uBreathPhase));
            float angle = mix(-0.59, 0.12, upper) * jawMotion - breath;
            mat2 jawRotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
            vec2 hinge = vec2(${JAW_HINGE_Z}, ${JAW_HINGE_Y});
            p.zy = hinge + jawRotation * (p.zy - hinge);
            p.z += jawMotion * mix(-0.15, 0.066, upper);
            n.zy = jawRotation * n.zy;
            vec3 deformedPos = deformFishPosition(p);
            vec3 deformedNorm = deformFishNormal(p, n);

            vec4 wp = modelMatrix * vec4(deformedPos, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * deformedNorm);

            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uCausticsIntensity;
          varying vec2 vUv;
          varying float vOralSurface;
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

          float bell(float x) {
            return exp(-x * x);
          }

          // Bordas sobrepostas em fileiras alternadas, com relevo concentrado atrás da escama.
          vec3 fishScalePattern(vec2 grid) {
            float row = floor(grid.y);
            vec2 coord = vec2(grid.x + mod(row, 2.0) * 0.5, grid.y);
            vec2 cell = floor(coord);
            vec2 p = fract(coord);
            float arch = 0.68 - 0.89 * (p.y - 0.5) * (p.y - 0.5);
            float distanceToEdge = fract(p.x - arch + 0.5) - 0.5;
            float ridge = bell(distanceToEdge / 0.106);
            float plate = smoothstep(0.0, 0.5, -distanceToEdge) * (0.75 + 0.25 * sin(p.y * 3.14159));
            return vec3(plate, ridge, hash21(cell));
          }

          float darkBar(float z, float y, float center, float width, float lowerEnd, float grain) {
            float along = smoothstep(lowerEnd - 0.025, lowerEnd + 0.20, y + grain * 0.20);
            float taper = mix(0.62, 1.13, smoothstep(lowerEnd, 0.48, y));
            float lean = (y - 0.36) * (center < -0.65 ? -0.23 : 0.12);
            float distanceToSide = abs(z - center + lean) / (width * taper);
            return (1.0 - smoothstep(0.64, 1.18, distanceToSide)) * along;
          }

          float oval(vec2 xy, vec2 center, vec2 radius) {
            vec2 p = (xy - center) / radius;
            return exp(-dot(p, p));
          }

          void main() {
            vec3 Ngeom = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.38, 0.82, 0.43));
            vec3 H = normalize(L + V);
            float t = vUv.x;
            float y = vObjPos.y;
            float z = vObjPos.z;
            vec2 flank = vObjPos.zy;
            float head = 1.0 - smoothstep(0.20, 0.31, t);

            float mottle = noise2D(flank * vec2(7.9, 9.5));
            float grain = noise2D(flank * vec2(26.0, 28.0));
            float cloud = noise2D(flank * vec2(2.8, 4.1));
            float flankLight = (mottle - 0.5) * 0.50 + (cloud - 0.5) * 0.50;

            vec3 oliveBack = vec3(0.22, 0.31, 0.21);
            vec3 blueShoulder = vec3(0.39, 0.54, 0.38);
            vec3 flankGold = vec3(0.77, 0.70, 0.27);
            vec3 lowerFlank = vec3(0.86, 0.69, 0.30);
            vec3 silverBelly = vec3(0.82, 0.80, 0.63);
            float colorY = y + flankLight * 0.14;
            vec3 albedo = mix(flankGold, blueShoulder, smoothstep(0.06, 0.48, colorY));
            albedo = mix(albedo, oliveBack, smoothstep(0.42, 0.72, colorY));
            albedo = mix(albedo, lowerFlank, 1.0 - smoothstep(-0.41, -0.07, colorY));
            albedo = mix(albedo, silverBelly, 1.0 - smoothstep(-0.55, -0.38, colorY));

            float cheek = oval(flank, vec2(1.37, -0.13), vec2(0.62, 0.33));
            albedo = mix(albedo, vec3(0.86, 0.71, 0.29), cheek * 0.84);
            float throat = oval(flank, vec2(1.23, -0.42), vec2(0.95, 0.12));
            albedo = mix(albedo, vec3(0.84, 0.43, 0.21), throat * 0.69);
            float peduncle = smoothstep(0.81, 1.0, t);
            albedo = mix(albedo, mix(vec3(0.56, 0.49, 0.24), vec3(0.35, 0.46, 0.32),
              smoothstep(-0.12, 0.09, y)), peduncle * 0.80);
            albedo *= 1.0 + flankLight * 0.36;

            // Barras de comprimentos diferentes e manchas quebradas sobre a bochecha.
            float warp = (mottle - 0.5) * 0.15 + (grain - 0.5) * 0.065;
            float bz = z + warp;
            float marks = darkBar(bz, y, 0.83, 0.145, -0.21, mottle - 0.5);
            marks = max(marks, darkBar(bz, y, 0.23, 0.145, -0.31, mottle - 0.5));
            marks = max(marks, darkBar(bz, y, -0.46, 0.161, -0.20, mottle - 0.5));
            marks = max(marks, darkBar(bz, y, -0.99, 0.13, -0.17, mottle - 0.5));
            marks = max(marks, darkBar(bz, y, -1.39, 0.095, -0.10, mottle - 0.5) * 0.83);

            float freckles = oval(flank, vec2(1.24, 0.015), vec2(0.31, 0.18)) *
              smoothstep(0.40, 0.75, mottle * 0.65 + grain * 0.61);
            float cheekPatch = oval(vec2(bz, y + warp * 0.6), vec2(1.29, 0.09), vec2(0.23, 0.077));
            freckles = max(freckles, cheekPatch * smoothstep(0.28, 0.69, grain + 0.13));
            float shoulderMarks = oval(flank, vec2(0.91, -0.13), vec2(0.18, 0.19)) *
              smoothstep(0.53, 0.75, mottle + grain * 0.32);
            marks = max(marks, max(freckles * 1.27, shoulderMarks));
            vec3 pigment = mix(vec3(0.052, 0.079, 0.068), vec3(0.15, 0.17, 0.095), grain);
            albedo = mix(albedo, pigment, min(1.0, marks) * 0.94);

            // Linha lateral, dobra do opérculo e contorno do olho.
            float latLineY = 0.10 + 0.16 * sin(clamp((t - 0.23) / 0.55, 0.0, 1.0) * 3.14159);
            float lateral = bell((y - latLineY) / 0.009) * smoothstep(0.28, 0.36, t) *
              (1.0 - smoothstep(0.67, 0.74, t));
            albedo *= 1.0 - lateral * (0.13 + 0.19 * grain);

            float gillZ = 1.06 + 0.43 * (y + 0.10) * (y + 0.10) + 0.19 * y;
            float gillLength = smoothstep(-0.46, -0.30, y) * (1.0 - smoothstep(0.16, 0.36, y));
            float gillFold = bell((z - gillZ) / 0.020) * gillLength;
            float gillRim = bell((z - gillZ - 0.033) / 0.025) * gillLength;
            albedo = mix(albedo, vec3(0.28, 0.16, 0.079), gillFold * 0.58);
            albedo = mix(albedo, vec3(0.81, 0.71, 0.42), gillRim * 0.32);
            float eyeSocket = oval(flank, vec2(${EYE_Z}, ${EYE_Y}), vec2(0.138, 0.119));
            float nostril = oval(flank, vec2(1.89, 0.119), vec2(0.026, 0.018));
            albedo *= 1.0 - eyeSocket * 0.29 - nostril * 0.55;
            albedo += vec3(0.12, 0.091, 0.047) *
              oval(flank, vec2(${EYE_Z}, ${EYE_Y + 0.093}), vec2(0.145, 0.041)) * (1.0 - eyeSocket);
            albedo *= 1.0 + head * (grain - 0.5) * 0.16;

            // O ocelo fica sobre a pele no pedúnculo, antes da membrana da cauda.
            vec2 oc = (flank - vec2(${CAUDAL_ROOT_Z + 0.074}, 0.051)) / vec2(0.113, 0.108);
            float ocDist = length(oc) + (grain - 0.5) * 0.12;
            float ring = 1.0 - smoothstep(0.86, 1.13, ocDist);
            float core = 1.0 - smoothstep(0.65, 0.78, ocDist);
            albedo = mix(albedo, vec3(0.94, 0.79, 0.36), ring * 0.96);
            albedo = mix(albedo, vec3(0.026, 0.043, 0.037), core);

            float lipY = (${MOUTH_TIP_Y} - ${MOUTH_SLOPE} * min(t, ${MOUTH_END})) *
              (1.0 - smoothstep(${MOUTH_END}, ${MOUTH_SETTLE}, t));
            float lipMask = 1.0 - smoothstep(0.102, ${MOUTH_END}, t);
            float lips = bell((y - lipY) / 0.050) * lipMask;
            float lipHighlight = bell((y - lipY + 0.026) / 0.022) * lipMask;
            albedo = mix(albedo, vec3(0.78, 0.52, 0.25), lips * 0.62);
            albedo += vec3(0.074, 0.046, 0.022) * lipHighlight;

            // Filtra o relevo quando o peixe está longe e poupa detalhes no focinho.
            vec2 grid = vec2(t * (77.0 + 9.0 * t), vUv.y * 48.0);
            vec3 scales = fishScalePattern(grid);
            float scaleFade = (1.0 - smoothstep(0.30, 0.82, max(fwidth(grid.x), fwidth(grid.y)))) *
              mix(1.0, 0.09, head) * mix(1.0, 0.36, ring);
            albedo *= 1.0 + scaleFade * ((scales.z - 0.5) * 0.14 + scales.x * 0.060 - scales.y * 0.061);
            float height = (scales.x + scales.y * 0.21) * scaleFade * 0.007;
            vec3 dPdx = dFdx(vWorldPos);
            vec3 dPdy = dFdy(vWorldPos);
            vec3 surfaceGradient = normalize(cross(dPdy, Ngeom)) * dFdx(height) +
              normalize(cross(Ngeom, dPdx)) * dFdy(height);
            vec3 N = normalize(Ngeom - surfaceGradient * 8.0);

            float diff = max(dot(N, L), 0.0);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
            float glint = pow(max(dot(N, H), 0.0), 29.0) * 0.115 +
              pow(max(dot(N, H), 0.0), 76.0) * (0.09 + scaleFade * scales.x * 0.20);
            vec3 illumination = mix(vec3(0.49, 0.60, 0.58), vec3(0.78, 0.86, 0.83), Ngeom.y * 0.5 + 0.5);
            vec3 color = albedo * (illumination + vec3(0.56, 0.53, 0.43) * diff);
            float sheen = smoothstep(0.05, 0.62, y) * (0.28 + 0.72 * (1.0 - head));
            color += vec3(0.31, 0.62, 0.72) * (fresnel * 0.095 + sheen * (0.10 + glint * 0.63));
            color += vec3(1.0, 0.97, 0.84) * glint * (1.0 - core * 0.82);

            float caustics = layeredCaustics(vWorldPos.xz * 1.05, uTime * 1.05);
            color += vec3(0.38, 0.80, 0.73) * caustics * 0.17 * uCausticsIntensity *
              smoothstep(-0.22, 0.76, Ngeom.y);

            if (vOralSurface > 0.5) {
              vec3 mouth = mix(vec3(0.27, 0.112, 0.084), vec3(0.069, 0.029, 0.030), smoothstep(0.015, 0.146, t));
              float gum = smoothstep(0.35, 0.49, abs(vUv.y - 0.5)) * (1.0 - smoothstep(0.06, 0.15, t));
              float lipRim = 0.78 * (1.0 - smoothstep(0.006, 0.054, t));
              color = mix(mouth, vec3(0.51, 0.29, 0.16), max(gum, lipRim));
              color += vec3(0.24, 0.11, 0.08) * glint;
            }

            float waterAbsorb = clamp((length(cameraPosition - vWorldPos) - 13.0) * 0.012, 0.025, 0.24);
            color = mix(color, vec3(0.07, 0.26, 0.29), waterAbsorb);

            gl_FragColor = vec4(color, 1.0);
          }
        `
      });
    }

    // Olho realista com íris fibrosa dourada/vermelho-âmbar, pupila profunda e córnea úmida
    function createEyeMaterial(fishUniforms, sideSign, eyeOffset) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...fishUniforms,
          uSideSign: { value: sideSign },
          uEyeOffset: { value: eyeOffset.clone() }
        },
        vertexShader: /* glsl */ `
          uniform vec3 uEyeOffset;
          varying vec3 vLocalNorm;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          ${FISH_DEFORM_GLSL}
          void main() {
            vLocalNorm = normalize(normal);
            vec3 p = position + uEyeOffset;
            vec3 dp = deformFishPosition(p);
            vec3 dn = deformFishNormal(p, normal);
            vec4 wp = modelMatrix * vec4(dp, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * dn);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uSideSign;
          varying vec3 vLocalNorm;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          void main() {
            vec3 nLoc = normalize(vLocalNorm);
            vec3 gaze = normalize(vec3(uSideSign * 0.94, 0.04, 0.23));
            vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), gaze));
            vec3 up = cross(gaze, tangent);
            float r = acos(clamp(dot(nLoc, gaze), -1.0, 1.0));
            float ang = atan(dot(nLoc, up), dot(nLoc, tangent));
            float fibers = 0.87 + 0.09 * sin(ang * 23.0 + sin(ang * 7.0)) + 0.045 * sin(ang * 37.0);

            vec3 col = mix(vec3(0.27, 0.25, 0.11), vec3(0.45, 0.30, 0.13), 1.0 - smoothstep(0.64, 0.87, r));
            col = mix(col, vec3(0.65, 0.208, 0.084) * fibers, 1.0 - smoothstep(0.65, 0.73, r));
            col = mix(col, vec3(0.93, 0.43, 0.15) * fibers, 1.0 - smoothstep(0.39, 0.51, r));
            col = mix(col, vec3(0.013, 0.018, 0.014), 1.0 - smoothstep(0.344, 0.409, r));

            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.38, 0.82, 0.43));
            float diff = 0.74 + 0.26 * max(dot(N, L), 0.0);
            float reflex = max(dot(N, normalize(L + V)), 0.0);
            float spec = pow(reflex, 92.0) * 0.94 + pow(reflex, 20.0) * 0.065;
            gl_FragColor = vec4(col * diff + vec3(0.94, 0.97, 1.0) * spec, 1.0);
          }
        `
      });
    }

    // Nadadeiras com raios pigmentados e membranas mais finas nas bordas.
    function createTucunareFinMaterial(fishUniforms, finType, sideSign = 0, pivot = new THREE.Vector3()) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms,
          uFinType: { value: finType },
          uSideSign: { value: sideSign },
          uPivot: { value: pivot.clone() }
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
          uniform float uDorsalFlare;
          uniform float uTime;

          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${FISH_DEFORM_GLSL}

          void main() {
            vUv = uv;
            vec3 p = position;
            vec3 n = normal;

            if (uFinType == 0) {
              // Cauda: chicote fluido + leve atraso nas pontas superior/inferior
              float edgeLag = abs(uv.y - 0.5) * 0.45;
              float whip = sin(uSwimPhase - 4.7 - uv.x * 2.15 - edgeLag) * (uTailAmp * 0.30) * pow(uv.x, 1.45);
              float silkTip = sin(uIdleDriftPhase - uv.x * 2.8 - uv.y * 1.8) * 0.032 * pow(uv.x, 1.8);
              p.x += whip + silkTip;
            } else if (uFinType == 1) {
              // Dorsal espinhosa: ergue em alerta/espreita e relaxa no cruzeiro
              float flareScale = mix(0.56, 1.06, uDorsalFlare);
              float baseY = p.y - uv.y * 0.45;
              p.y = mix(p.y, baseY + uv.y * 0.45 * flareScale, uv.y);
              float sBody = fishLengthFraction(p.z);
              p.x += sin(uSwimPhase - sBody * 4.9 - uv.y * 0.7) * (uTailAmp * 0.14 + 0.015) * uv.y;
            } else if (uFinType == 2 || uFinType == 3) {
              // Dorsal mole e anal: ondulação suave na membrana
              float sBody = fishLengthFraction(p.z);
              float wave = sin(uSwimPhase - sBody * 4.9 - uv.y * 1.25 - uv.x * 1.1) * (uTailAmp * 0.26 + 0.035) * uv.y;
              p.x += wave;
            } else if (uFinType == 4) {
              // Peitorais: onda viajando de cima para baixo nos raios (sculling realista de ciclídeo!)
              float row = (uSideSign > 0.0) ? uPectoralRowL : uPectoralRowR;
              float phaseLag = uv.y * 1.35;
              float angleY = uSideSign * (uPectoralSpread + row * cos(phaseLag));
              float featherZ = sin(uTime * 4.6 + (uSideSign > 0.0 ? 0.0 : 3.14159) - phaseLag) * 0.095 * uv.x;
              float c = cos(angleY);
              float s = sin(angleY);
              vec3 q = vec3(p.x * c - p.z * s, p.y + featherZ, p.x * s + p.z * c);
              p = uPivot + q;
              n = vec3(n.x * c - n.z * s, n.y, n.x * s + n.z * c);
            } else if (uFinType == 5) {
              float tuck = mix(0.42, 0.0, clamp(uPectoralSpread * 1.4, 0.0, 1.0));
              float c = cos(tuck);
              float s = sin(tuck);
              vec3 q = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
              p = uPivot + q;
              n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
            }

            vec3 dp = deformFishPosition(p);
            vec3 dn = deformFishNormal(p, n);

            vec4 wp = modelMatrix * vec4(dp, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * dn);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform int uFinType;
          uniform float uTime;
          uniform float uCausticsIntensity;
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${CAUSTICS_GLSL}

          float hash21(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 41.3);
            return fract(p.x * p.y);
          }

          float organicSpots(vec2 uv, vec2 scale, float density, float seed) {
            vec2 p = uv * scale;
            vec2 cell = floor(p);
            vec2 f = fract(p) - 0.5;
            float r1 = hash21(cell + seed);
            float r2 = hash21(cell + seed + 17.3);
            float r3 = hash21(cell + seed + 43.7);
            vec2 jitter = (vec2(r1, r2) - 0.5) * 0.53;
            float rad = 0.10 + 0.12 * r2;
            float d = length((f - jitter) * vec2(1.05, 0.87));
            return (1.0 - smoothstep(rad * 0.3, rad, d)) * step(1.0 - density, r3);
          }

          float edgeFade(float coord, float width) {
            return smoothstep(0.0, width, coord) * (1.0 - smoothstep(1.0 - width, 1.0, coord));
          }

          float finRays(float coord, float count, float offset) {
            float band = coord * count + offset;
            float ray = 1.0 - smoothstep(0.07, 0.27, abs(fract(band) - 0.5));
            return mix(ray, 0.28, smoothstep(0.35, 0.96, fwidth(band)));
          }

          void main() {
            float u = vUv.x;
            float v = vUv.y;
            bool radial = uFinType == 0 || uFinType >= 4;
            float reach = radial ? u : v;
            float across = radial ? v : u;
            float rayCount = 18.0;
            float opacity = 0.85;
            vec3 col;
            float spots = 0.0;

            if (uFinType == 0) {
              float transition = smoothstep(0.44, 0.63, v + 0.055 * sin(u * 5.0));
              vec3 upper = mix(vec3(0.38, 0.46, 0.32), vec3(0.26, 0.51, 0.51), smoothstep(0.06, 0.78, u));
              vec3 lower = mix(vec3(0.55, 0.47, 0.24), vec3(0.75, 0.34, 0.16), smoothstep(0.03, 0.74, u));
              col = mix(lower, upper, transition);
              spots = organicSpots(vUv, vec2(10.0, 13.0), 0.29, 5.1) * transition * smoothstep(0.14, 0.44, u);
              rayCount = 24.0;
              opacity = 0.97;
            } else if (uFinType == 1) {
              col = mix(vec3(0.32, 0.42, 0.23), vec3(0.16, 0.31, 0.29), smoothstep(0.04, 0.86, v));
              rayCount = 14.0;
              opacity = 0.91;
            } else if (uFinType == 2) {
              col = mix(vec3(0.32, 0.45, 0.33), vec3(0.27, 0.55, 0.56), smoothstep(0.10, 0.89, v));
              spots = organicSpots(vUv, vec2(12.0, 8.0), 0.33, 2.3) * smoothstep(0.31, 0.65, v);
              rayCount = 20.0;
              opacity = 0.91;
            } else if (uFinType == 3) {
              col = mix(vec3(0.56, 0.38, 0.19), vec3(0.77, 0.32, 0.16), smoothstep(0.07, 0.73, v));
              col = mix(col, vec3(0.32, 0.43, 0.42), smoothstep(0.83, 1.0, v) * 0.60);
              rayCount = 17.0;
            } else if (uFinType == 4) {
              col = mix(vec3(0.63, 0.52, 0.26), vec3(0.71, 0.66, 0.44), smoothstep(0.11, 0.97, u));
              rayCount = 14.0;
              opacity = 0.64;
            } else {
              col = mix(vec3(0.58, 0.36, 0.19), vec3(0.82, 0.41, 0.21), smoothstep(0.07, 0.89, u));
              col = mix(col, vec3(0.81, 0.71, 0.46), (1.0 - smoothstep(0.01, 0.13, v)) * 0.49);
              rayCount = 9.0;
            }

            float rayBend = uFinType == 1 ? 0.0 : 0.28 * sin(across * 5.2) * reach;
            float rays = finRays(across, rayCount, rayBend);
            float fiberGrain = hash21(floor(vec2(across * rayCount, reach * 18.0)) + float(uFinType) * 19.0);
            col *= 0.86 + 0.22 * rays + (fiberGrain - 0.5) * 0.09;
            col = mix(col, vec3(0.71, 0.87, 0.79), spots * 0.66);

            float edge = edgeFade(across, 0.046) * (1.0 - smoothstep(0.94, 1.0, reach));
            float alpha = opacity * edge * mix(1.0, 0.77, reach) * (0.87 + 0.13 * rays);

            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.38, 0.82, 0.43));
            float transmit = 0.31 * abs(dot(N, L));
            float rim = pow(1.0 - abs(dot(N, V)), 2.5);
            float spec = pow(abs(dot(N, normalize(L + V))), 34.0) * (0.09 + 0.13 * rays);
            col *= 0.72 + transmit;
            col += vec3(0.64, 0.87, 0.83) * (spec + rim * 0.08);
            float caustics = layeredCaustics(vWorldPos.xz * 1.05, uTime * 1.05);
            col += vec3(0.38, 0.80, 0.73) * caustics * 0.12 * uCausticsIntensity;
            float waterAbsorb = clamp((length(cameraPosition - vWorldPos) - 13.0) * 0.012, 0.025, 0.24);
            col = mix(col, vec3(0.07, 0.26, 0.29), waterAbsorb);

            gl_FragColor = vec4(col, alpha);
          }
        `
      });
    }

    function createShadowMaterial(fishUniforms) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms,
          uShadowOpacity: { value: 0.28 }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vShadowUv;
          ${FISH_DEFORM_GLSL}
          void main() {
            vShadowUv = uv;
            vec3 p = position;
            p.x += spineOffsetX(p.z);
            p.x += sin(p.z * 1.3 + uTime * 1.5) * 0.04;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uShadowOpacity;
          varying vec2 vShadowUv;
          void main() {
            // Sombra subaquática difusa e suave (sem bordas duras artificiais)
            vec2 d = (vShadowUv - vec2(0.5, 0.5)) * 2.0;
            // Afina levemente em direção à cauda
            float taper = mix(1.0, 1.8, smoothstep(0.45, 1.0, vShadowUv.y));
            float dist = length(vec2(d.x * taper, d.y));
            float soft = exp(-dist * dist * 3.0) * (1.0 - smoothstep(0.35, 1.0, dist));
            gl_FragColor = vec4(0.012, 0.058, 0.068, uShadowOpacity * soft);
          }
        `
      });
    }

    // =========================================================================
    // 6. INSTÂNCIA DO TUCUNARÉ AZUL HERÓI
    // =========================================================================
    function createTucunare() {
      const fishUniforms = {
        uSwimPhase: { value: 0 },
        uTailAmp: { value: 0.14 },
        uSpineCurve: { value: 0.0 },
        uPectoralSpread: { value: 0.42 },
        uPectoralRowL: { value: 0.0 },
        uPectoralRowR: { value: 0.0 },
        uDorsalFlare: { value: 0.65 },
        uBreathPhase: { value: 0.0 },
        uIdleDriftPhase: { value: 0.0 },
        uMouthOpen: { value: 0.0 }
      };

      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      scene.add(group);

      const bodyMesh = new THREE.Mesh(sharedGeos.body, createTucunareBodyMaterial(fishUniforms));
      bodyMesh.renderOrder = 4;
      group.add(bodyMesh);

      const caudalMesh = new THREE.Mesh(sharedGeos.caudal, createTucunareFinMaterial(fishUniforms, 0));
      caudalMesh.renderOrder = 5;
      group.add(caudalMesh);

      const spinyDorsalMesh = new THREE.Mesh(sharedGeos.spinyDorsal, createTucunareFinMaterial(fishUniforms, 1));
      spinyDorsalMesh.renderOrder = 5;
      group.add(spinyDorsalMesh);

      const softDorsalMesh = new THREE.Mesh(sharedGeos.softDorsal, createTucunareFinMaterial(fishUniforms, 2));
      softDorsalMesh.renderOrder = 5;
      group.add(softDorsalMesh);

      const analMesh = new THREE.Mesh(sharedGeos.anal, createTucunareFinMaterial(fishUniforms, 3));
      analMesh.renderOrder = 5;
      group.add(analMesh);

      const pectLMesh = new THREE.Mesh(sharedGeos.pectL, createTucunareFinMaterial(fishUniforms, 4, 1, pectLPivot));
      pectLMesh.renderOrder = 6;
      group.add(pectLMesh);

      const pectRMesh = new THREE.Mesh(sharedGeos.pectR, createTucunareFinMaterial(fishUniforms, 4, -1, pectRPivot));
      pectRMesh.renderOrder = 6;
      group.add(pectRMesh);

      const pelvLMesh = new THREE.Mesh(sharedGeos.pelvL, createTucunareFinMaterial(fishUniforms, 5, 1, pelvLPivot));
      pelvLMesh.renderOrder = 5;
      group.add(pelvLMesh);

      const pelvRMesh = new THREE.Mesh(sharedGeos.pelvR, createTucunareFinMaterial(fishUniforms, 5, -1, pelvRPivot));
      pelvRMesh.renderOrder = 5;
      group.add(pelvRMesh);

      const eyeLMesh = new THREE.Mesh(sharedGeos.eye, createEyeMaterial(fishUniforms, 1, eyeLPos));
      eyeLMesh.renderOrder = 5;
      group.add(eyeLMesh);

      const eyeRMesh = new THREE.Mesh(sharedGeos.eye, createEyeMaterial(fishUniforms, -1, eyeRPos));
      eyeRMesh.renderOrder = 5;
      group.add(eyeRMesh);

      const shadowGroup = new THREE.Group();
      scene.add(shadowGroup);
      const shadowMat = createShadowMaterial(fishUniforms);
      const shadowPlaneGeo = new THREE.PlaneGeometry(1.65, 5.4, 8, 28);
      shadowPlaneGeo.rotateX(-Math.PI / 2);
      const shadowBody = new THREE.Mesh(shadowPlaneGeo, shadowMat);
      shadowBody.renderOrder = 1;
      shadowGroup.add(shadowBody);

      return {
        uniforms: fishUniforms,
        group,
        shadowGroup,
        shadowMat,

        pos: isInspect ? new THREE.Vector3(0.0, 0.05, 0.0) : new THREE.Vector3(-1.4, 0.1, 0.2),
        targetY: 0.1,
        velY: 0,
        heading: Math.PI * 0.46,
        pitch: 0,
        roll: 0,
        speed: isInspect ? 0.0 : 1.35,
        prevSpeed: 1.35,
        acceleration: 0,
        angularVelocity: 0,

        // Estados: 'PATROL' | 'HOVER' | 'STALK' | 'STRIKE' | 'COAST' | 'FLEE'
        state: 'PATROL',
        stateTimer: 0,
        hoverDuration: 0,
        nextHoverIn: 3.6,
        strikeDuration: 0.40,
        fleeTimer: 0,
        fleeCooldown: 0,
        fleeHeadingOffset: 0,

        // Ritmo orgânico de batida-e-deslize (não metronômico!)
        kickCycleTimer: 0.8,
        kickBurstLeft: 0.45,

        waypoint: new THREE.Vector3(4.6, 0.25, -0.3),
        waypointTimer: 0,
        curiosityOrbitSign: 1,

        swimPhase: 0,
        breathPhase: 0,
        idleDriftPhase: 0,
        smoothEffort: 0.24,
        smoothSpineCurve: 0,
        smoothPectSpread: 0.42,
        smoothDorsalFlare: 0.65,
        pectRowPhase: 0,
        smoothMouthOpen: 0,
        biteSnapTimer: 0
      };
    }

    const tucunare = createTucunare();

    return {
      tucunare,
      globalFishUniforms,
      sampleProfile
    };
  }

  window.TucunareV1 = { createTucunareV1 };
})();
