(() => {
  'use strict';

  function createTucunareV2({ scene, CAUSTICS_GLSL, globalFishUniforms, sampleProfile, isInspect }) {
    // =========================================================================
    // 6B. TUCUNARÉ REALISTA V2 (MODELO BASEADO NA REFERÊNCIA VISUAL)
    // =========================================================================
    const glslF = n => Number(n).toFixed(4);
    const HEAD_Z2 = 2.26;
    const BODY_LEN2 = 4.10;
    const PEDUNCLE_END_Z2 = HEAD_Z2 - BODY_LEN2;
    const CAUDAL_ROOT_Z2 = PEDUNCLE_END_Z2 + 0.12;
    const CAUDAL_LEN2 = 1.14;
    const EYE_Z2 = 1.66;
    const EYE_Y2 = 0.225;
    const MOUTH_END2 = 0.172;
    const MOUTH_TIP_Y2 = -0.055;
    const MOUTH_SLOPE2 = 2.32;
    const MOUTH_SETTLE2 = 0.30;
    const JAW_HINGE_Z2 = HEAD_Z2 - MOUTH_END2 * BODY_LEN2;
    const JAW_HINGE_Y2 = MOUTH_TIP_Y2 - MOUTH_SLOPE2 * MOUTH_END2;

    function operculumZ2(y) {
      return 1.06 + 0.42 * (y + 0.10) ** 2 + 0.20 * y;
    }

    // Perfil dorsal (+Y): focinho arredondado compacto, testa cheia sobre o olho e dorso musculoso
    const DORSAL_TABLE2 = [
      [0.00, 0.095],
      [0.04, 0.195],
      [0.09, 0.305],
      [0.15, 0.430],
      [0.22, 0.590],
      [0.31, 0.755],
      [0.42, 0.805],
      [0.54, 0.765],
      [0.65, 0.635],
      [0.76, 0.445],
      [0.85, 0.275],
      [0.92, 0.210],
      [1.00, 0.240]
    ];

    // Perfil ventral (-Y): queixo curto e largo, garganta cheia, subida firme atrás da anal
    const VENTRAL_TABLE2 = [
      [0.00, 0.165],
      [0.04, 0.295],
      [0.10, 0.455],
      [0.17, 0.600],
      [0.26, 0.715],
      [0.36, 0.765],
      [0.48, 0.765],
      [0.59, 0.690],
      [0.69, 0.530],
      [0.79, 0.345],
      [0.88, 0.225],
      [0.94, 0.205],
      [1.00, 0.230]
    ];

    // Largura lateral (X): focinho largo em ferradura (U), cabeça robusta e flanco comprimido
    const WIDTH_TABLE2 = [
      [0.00, 0.155],
      [0.04, 0.220],
      [0.10, 0.275],
      [0.16, 0.315],
      [0.26, 0.405],
      [0.40, 0.420],
      [0.56, 0.340],
      [0.72, 0.220],
      [0.86, 0.115],
      [0.96, 0.062],
      [1.00, 0.000]
    ];

    const peacockHeightUp = t => Math.max(0.015, sampleProfile(DORSAL_TABLE2, t));
    const peacockHeightDown = t => Math.max(0.015, sampleProfile(VENTRAL_TABLE2, t));
    const peacockWidth = t => Math.max(0.0, sampleProfile(WIDTH_TABLE2, t));

    function createPeacockBodyGeometry() {
      const lengthSegs = 168;
      const halfRingSegs = 40;
      const positions = [];
      const uvs = [];
      const anatomy = [];
      const reliefs = [];
      const indices = [];
      const mouthRings = [];
      const stride = halfRingSegs + 1;
      const halfSize = (lengthSegs + 1) * stride;

      for (const jaw of [1, -1]) {
        const offset = jaw > 0 ? 0 : halfSize;
        for (let i = 0; i <= lengthSegs; i++) {
          const t = i / lengthSegs;
          const baseZ = HEAD_Z2 - t * BODY_LEN2;
          const mouth = 1 - THREE.MathUtils.smoothstep(t, 0.095, MOUTH_END2);
          const noseRound = Math.sqrt(1 - (1 - Math.min(1, t / 0.024)) ** 2);
          const lipAxis = (MOUTH_TIP_Y2 - MOUTH_SLOPE2 * Math.min(t, MOUTH_END2)) *
            (1 - THREE.MathUtils.smoothstep(t, MOUTH_END2, MOUTH_SETTLE2));
          const lipY = lipAxis + jaw * 0.005 * mouth;
          const rx = peacockWidth(t) * THREE.MathUtils.lerp(0.76, 1.0, noseRound);
          const endY = jaw > 0 ? peacockHeightUp(t) : -peacockHeightDown(t);
          // Mandíbula inferior curta e robusta (sem bico fino alongado)
          const lipZ = jaw < 0 ? 0.042 * (1 - THREE.MathUtils.smoothstep(t, 0.015, 0.110)) : 0.0;
          const noseBow = 0.055 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.055));
          const faceSlope = 0.026 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.080));

          for (let j = 0; j <= halfRingSegs; j++) {
            const v = (j / halfRingSegs + (jaw < 0 ? 1 : 0)) * 0.5;
            const theta = v * Math.PI * 2;
            const cosT = Math.cos(theta);
            const sinAbs = Math.abs(Math.sin(theta));
            // Cabeça e dorso mais cheios em 3/4 com transição suave para o flanco
            const crossExp = jaw > 0 ? THREE.MathUtils.lerp(0.80, 0.90, sinAbs) : 0.83;
            const flankRadius = Math.pow(Math.abs(cosT), crossExp);

            // Boca com fenda profundamente recuada, lábios carnudos salientes e sulco maxilar
            const mouthCleft = Math.exp(-((sinAbs / 0.055) ** 2)) * mouth * noseRound;
            const lipPad = Math.exp(-(((sinAbs - 0.115) / 0.075) ** 2)) * mouth * noseRound;
            const maxGroove = (jaw > 0 ? 1.0 : 0.45) *
              Math.exp(-(((sinAbs - 0.245) / 0.065) ** 2)) *
              (1 - THREE.MathUtils.smoothstep(t, 0.11, 0.21)) * noseRound;

            const z = baseZ + lipZ + noseBow * (1 - flankRadius ** 2) -
              faceSlope * sinAbs * noseRound + 0.024 * lipPad - 0.032 * mouthCleft;
            const y = lipY + sinAbs * (endY - lipY) * noseRound + jaw * 0.026 * lipPad;

            // Cratera orbital funda com anel ósseo/pálpebra elevado ao redor
            const ez = (z - EYE_Z2) / 0.128;
            const ey = (y - EYE_Y2) / 0.118;
            const er = Math.hypot(ez, ey);
            const eyeCavity = Math.exp(-Math.pow(er / 0.86, 4.0));
            const eyeRing = Math.exp(-(((er - 1.18) / 0.34) ** 2)) *
              (0.75 + 0.55 * THREE.MathUtils.clamp((ey + 0.5) / 1.5, 0, 1));
            const nostrilPit = Math.exp(-(((z - (EYE_Z2 + 0.24)) / 0.032) ** 2 + ((y - (EYE_Y2 - 0.04)) / 0.024) ** 2));

            // Guelras profundas: bochecha, crista/sulco do pré-opérculo, aba do opérculo, fenda branquial e bolso peitoral
            const opZ = operculumZ2(y);
            const dOp = z - opZ;
            const gillSpan = THREE.MathUtils.smoothstep(y, -0.56, -0.34) * (1 - THREE.MathUtils.smoothstep(y, 0.18, 0.36));
            const preopSpan = THREE.MathUtils.smoothstep(y, -0.46, -0.26) * (1 - THREE.MathUtils.smoothstep(y, 0.06, 0.22));
            const cheekPlate = Math.exp(-(((dOp - 0.20) / 0.28) ** 2 + ((y + 0.08) / 0.38) ** 2));
            const opFlange = Math.exp(-(((dOp - 0.065) / 0.060) ** 2)) * gillSpan;
            const gillSlit = Math.exp(-(((dOp + 0.025) / 0.038) ** 2)) * gillSpan;
            const preopRidge = Math.exp(-(((dOp - 0.34) / 0.048) ** 2)) * preopSpan;
            const preopGroove = Math.exp(-(((dOp - 0.28) / 0.034) ** 2)) * preopSpan;
            const pectPocket = Math.exp(-(((z - 0.94) / 0.09) ** 2 + ((y + 0.19) / 0.14) ** 2));

            const keelPinch = jaw > 0 ? 1.0 - 0.10 * Math.pow(sinAbs, 3.0) * THREE.MathUtils.smoothstep(t, 0.22, 0.72) : 1.0;

            const x = Math.sign(cosT) * flankRadius *
              (rx * keelPinch * (1 + 0.06 * jaw * sinAbs) +
               0.038 * lipPad - 0.028 * mouthCleft - 0.018 * maxGroove +
               0.055 * cheekPlate + 0.032 * opFlange - 0.072 * gillSlit +
               0.020 * preopRidge - 0.022 * preopGroove - 0.022 * pectPocket -
               0.088 * eyeCavity + 0.034 * eyeRing - 0.014 * nostrilPit);

            positions.push(x, y, z);
            uvs.push(t, v);
            anatomy.push(jaw, 0);
            reliefs.push(
              mouthCleft,
              gillSlit,
              eyeCavity,
              Math.min(1.0, preopGroove + maxGroove * 0.85 + pectPocket * 0.7)
            );

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

      // Cavidade bucal interna (céu da boca e assoalho) acompanhando a mandíbula inferior/superior
      const palateSegs = 14;
      for (let i = 0; i < mouthRings.length; i++) {
        const { jaw, t, z, y, noseBow, left, right } = mouthRings[i];
        const row = positions.length / 3;
        for (let j = 0; j <= palateSegs; j++) {
          const v = j / palateSegs;
          const span = 2 * v - 1;
          const arch = Math.sin(v * Math.PI) * THREE.MathUtils.smoothstep(t, 0.012, 0.068);
          positions.push(THREE.MathUtils.lerp(left, right, v), y + jaw * 0.108 * arch, z + noseBow * (1 - span * span));
          uvs.push(t, v);
          anatomy.push(jaw, 1);
          reliefs.push(0, 0, 0, 0);
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
      geo.setAttribute('aRelief', new THREE.Float32BufferAttribute(reliefs, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      // Solda as normais no flanco atrás dos cantos da boca
      const normals = geo.getAttribute('normal');
      const normal = new THREE.Vector3();
      const other = new THREE.Vector3();
      for (let i = 0; i <= lengthSegs; i++) {
        const join = THREE.MathUtils.smoothstep(i / lengthSegs, 0.115, MOUTH_END2);
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

    // Cauda larga em cunha truncada com leve micro-corrugação dos raios
    function createPeacockCaudalGeometry() {
      const segU = 34;
      const segV = 32;
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const side = (v - 0.5) * 2.0;
          const absSide = Math.abs(side);

          const spreadY = 0.205 + Math.pow(u, 0.85) * (0.655 + side * 0.022);
          const cornerTrim = 0.095 * Math.pow(absSide, 4.2) * u;
          const centerDip = 0.045 * (1.0 - absSide * absSide) * Math.pow(u, 1.4);
          const edgeSerrate = Math.sin(v * 22.0 * Math.PI) * 0.012 * Math.pow(u, 3.0);

          const z = CAUDAL_ROOT_Z2 - u * CAUDAL_LEN2 + cornerTrim + centerDip + edgeSerrate;
          const y = side * spreadY + 0.01;
          const rayRipple = Math.sin(v * 24.0 * Math.PI) * 0.010 * u;
          const x = Math.sin(v * Math.PI * 2.0) * 0.010 * u + rayRipple;

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

    // Dorsal Anterior Espinhosa: 10 espinhos em serra inclinados para trás com entalhe antes da dorsal mole
    function createPeacockSpinyDorsalGeometry() {
      const segU = 132;
      const segV = 12;
      const positions = [];
      const uvs = [];
      const indices = [];
      const startZ = 0.96;
      const endZ = -0.34;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z2 - z) / BODY_LEN2;
        const baseY = peacockHeightUp(tBody) * 0.93;

        const frontRise = THREE.MathUtils.smoothstep(u, 0.0, 0.14);
        const rearSlope = 1.0 - 0.76 * Math.pow(THREE.MathUtils.smoothstep(u, 0.20, 1.0), 0.88);
        const envelope = (0.04 + 0.64 * frontRise) * rearSlope;

        const spinePhase = (u * 10.0) % 1.0;
        const saw = spinePhase < 0.24
          ? THREE.MathUtils.smoothstep(spinePhase, 0.0, 0.24)
          : Math.pow(1.0 - (spinePhase - 0.24) / 0.76, 1.50);
        const scallop = 0.73 + 0.27 * saw;
        const finHeight = envelope * scallop;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const xRipple = Math.sin(u * 10.0 * Math.PI * 2.0) * 0.009 * v;
          positions.push(xRipple, baseY + v * finHeight, z - v * finHeight * 0.48);
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

    // Dorsal Posterior Mole: leque amplo inclinado para trás sobre o pedúnculo
    function createPeacockSoftDorsalGeometry() {
      const segU = 40;
      const segV = 14;
      const positions = [];
      const uvs = [];
      const indices = [];
      const startZ = -0.28;
      const endZ = -1.24;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z2 - z) / BODY_LEN2;
        const baseY = peacockHeightUp(tBody) * 0.90;
        const finHeight = Math.pow(Math.sin(Math.pow(u, 0.78) * Math.PI), 0.54) * 0.59 + 0.035;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const sweep = v * finHeight * (0.72 + 0.88 * Math.pow(u, 0.92));
          const xRipple = Math.sin(u * 14.0 * Math.PI) * 0.007 * v;
          positions.push(xRipple, baseY + v * finHeight, z - sweep);
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

    // Nadadeira Anal: leque trapezoidal-arredondado bem pronunciado
    function createPeacockAnalGeometry() {
      const segU = 28;
      const segV = 12;
      const positions = [];
      const uvs = [];
      const indices = [];
      const startZ = -0.36;
      const endZ = -1.22;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z2 - z) / BODY_LEN2;
        const baseY = -peacockHeightDown(tBody) * 0.90;
        const finDepth = Math.pow(Math.sin(Math.pow(u, 0.72) * Math.PI), 0.58) * 0.56 + 0.03;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const xRipple = Math.sin(u * 12.0 * Math.PI) * 0.007 * v;
          positions.push(xRipple, baseY - v * finDepth, z - v * finDepth * (0.72 + 0.80 * u));
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

    // Peitorais: leque arredondado-alongado e ligeiramente em concha com relevo nos raios
    function createPeacockPectoralGeometry(sideSign) {
      const segU = 22;
      const segV = 16;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const heightSpan = 0.105 + 0.46 * Math.sin(Math.pow(u, 0.86) * Math.PI);
        const reachX = Math.pow(u, 0.88) * 0.48;
        const sweepBack = Math.pow(u, 1.00) * 0.88;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const cup = Math.sin(v * Math.PI) * 0.062 * u;
          const rayRipple = Math.sin(v * 14.0 * Math.PI) * 0.007 * u;
          const localX = sideSign * (reachX + cup + rayRipple);
          const localY = (0.56 - v) * heightSpan + u * 0.04;
          const localZ = -sweepBack + Math.pow(v, 2.2) * 0.22 * u;
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

    // Pélvicas longas e pontiagudas com relevo nos raios e borda frontal arqueada
    function createPeacockPelvicGeometry(sideSign) {
      const segU = 16;
      const segV = 12;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const reach = Math.pow(u, 0.90);

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const depth = 0.78 + 0.14 * Math.sin(v * Math.PI) - 0.56 * v * v;
          const sweep = 0.20 + 0.56 * v;
          const rayRipple = Math.sin(v * 10.0 * Math.PI) * 0.010 * reach;
          const frontArc = Math.sin(u * Math.PI) * 0.032 * (1 - v);
          positions.push(
            sideSign * (reach * (0.14 + 0.11 * (1 - v)) + (0.5 - v) * 0.028 + rayRipple),
            -reach * depth + (0.5 - v) * 0.042,
            -reach * sweep - v * 0.075 + frontArc
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

    const peacockGeos = {
      body: createPeacockBodyGeometry(),
      caudal: createPeacockCaudalGeometry(),
      spinyDorsal: createPeacockSpinyDorsalGeometry(),
      softDorsal: createPeacockSoftDorsalGeometry(),
      anal: createPeacockAnalGeometry(),
      pectL: createPeacockPectoralGeometry(1),
      pectR: createPeacockPectoralGeometry(-1),
      pelvL: createPeacockPelvicGeometry(1),
      pelvR: createPeacockPelvicGeometry(-1),
      eye: new THREE.SphereGeometry(0.102, 28, 18).scale(0.54, 1.0, 1.0)
    };

    const pectLPivot2 = new THREE.Vector3(0.355, -0.19, 0.96);
    const pectRPivot2 = new THREE.Vector3(-0.355, -0.19, 0.96);
    const pelvLPivot2 = new THREE.Vector3(0.105, -0.69, 0.84);
    const pelvRPivot2 = new THREE.Vector3(-0.105, -0.69, 0.84);
    const eyeLPos2 = new THREE.Vector3(0.188, EYE_Y2, EYE_Z2);
    const eyeRPos2 = new THREE.Vector3(-0.188, EYE_Y2, EYE_Z2);

    const FISH_DEFORM_V2_GLSL = /* glsl */ `
      uniform float uSwimPhase;
      uniform float uTailAmp;
      uniform float uSpineCurve;
      uniform float uBreathPhase;
      uniform float uIdleDriftPhase;
      uniform float uMouthOpen;

      float fishLengthFraction2(float z) {
        return clamp((${glslF(HEAD_Z2)} - z) / ${glslF(HEAD_Z2 - CAUDAL_ROOT_Z2 + CAUDAL_LEN2 + 0.035)}, 0.0, 1.0);
      }

      float spineOffsetX2(float z) {
        float s = fishLengthFraction2(z);
        float wave = sin(uSwimPhase - s * 4.9);
        float amp = uTailAmp * (0.006 + 0.994 * pow(max(0.0, s - 0.10) / 0.90, 2.05));
        float swimX = wave * amp;
        float idleDrift = sin(uIdleDriftPhase - s * 3.2) * 0.035 * pow(s, 2.6);
        float ds = s - 0.25;
        float bendX = uSpineCurve * (ds * ds) * 2.45;
        return swimX + idleDrift + bendX;
      }

      vec3 deformFishPosition2(vec3 p) {
        float gillDist = (p.z - 1.1800) * 4.0;
        float gillMask = exp(-gillDist * gillDist);
        p.x *= (1.0 + gillMask * (0.042 * sin(uBreathPhase) + 0.11 * uMouthOpen));
        p.x += spineOffsetX2(p.z);
        return p;
      }

      vec3 deformFishNormal2(vec3 p, vec3 n) {
        float eps = 0.06;
        float dx = spineOffsetX2(p.z + eps) - spineOffsetX2(p.z - eps);
        float angle = atan(dx / (2.0 * eps));
        float c = cos(angle);
        float s = sin(angle);
        return normalize(vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c));
      }
    `;

    function createPeacockBodyMaterial(fishUniforms) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...globalFishUniforms,
          ...fishUniforms
        },
        vertexShader: /* glsl */ `
          attribute vec2 anatomy;
          attribute vec4 aRelief;
          varying vec2 vUv;
          varying float vOralSurface;
          varying vec4 vRelief;
          varying vec3 vObjPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;

          ${FISH_DEFORM_V2_GLSL}

          void main() {
            vUv = uv;
            vOralSurface = anatomy.y;
            vRelief = aRelief;
            vObjPos = position;
            vec3 p = position;
            vec3 n = normal;
            float upper = step(0.0, anatomy.x);
            float jawWeight = 1.0 - smoothstep(0.065, ${glslF(MOUTH_END2)}, uv.x);
            float jawMotion = uMouthOpen * jawWeight;
            float breath = (1.0 - upper) * jawWeight * (0.005 + 0.005 * sin(uBreathPhase));
            float angle = mix(-0.62, 0.13, upper) * jawMotion - breath;
            mat2 jawRotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
            vec2 hinge = vec2(${glslF(JAW_HINGE_Z2)}, ${glslF(JAW_HINGE_Y2)});
            p.zy = hinge + jawRotation * (p.zy - hinge);
            p.z += jawMotion * mix(-0.15, 0.066, upper);
            n.zy = jawRotation * n.zy;
            vec3 deformedPos = deformFishPosition2(p);
            vec3 deformedNorm = deformFishNormal2(p, n);

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
          varying vec4 vRelief;
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

          float oval(vec2 xy, vec2 center, vec2 radius) {
            vec2 p = (xy - center) / radius;
            return exp(-dot(p, p));
          }

          // Escamas cicloides maiores e com relevo nítido na borda posterior
          vec4 peacockScalePattern(vec2 grid) {
            float row = floor(grid.y);
            vec2 coord = vec2(grid.x + mod(row, 2.0) * 0.5, grid.y);
            vec2 cell = floor(coord);
            vec2 p = fract(coord);
            float arch = 0.68 - 0.90 * (p.y - 0.5) * (p.y - 0.5);
            float distEdge = fract(p.x - arch + 0.5) - 0.5;
            float ridge = bell(distEdge / 0.12);
            float edgeInk = bell((distEdge + 0.028) / 0.105);
            float plate = smoothstep(0.0, 0.55, -distEdge) * (0.74 + 0.26 * sin(p.y * 3.14159));
            return vec4(plate, ridge, hash21(cell), edgeInk);
          }

          // Barra vertical com topo arredondado e contorno orgânico irregular pelas escamas
          float darkBar2(float z, float y, float center, float width, float lowerEnd, float upperEnd, float leanSlope, float warp, float scaleEdge) {
            float topFade = 1.0 - smoothstep(upperEnd - 0.12, upperEnd + 0.05, y + warp * 0.35);
            float botFade = smoothstep(lowerEnd - 0.08, lowerEnd + 0.14, y + warp * 0.45);
            float pinch = 1.0 - 0.16 * bell((y - 0.05) / 0.22);
            float lean = (y - 0.10) * leanSlope;
            float dist = abs(z - center + lean + warp * 0.65) / (width * pinch);
            float edgeBreak = 0.15 * (scaleEdge - 0.35);
            return (1.0 - smoothstep(0.68 + edgeBreak, 1.08 + edgeBreak, dist)) * topFade * botFade;
          }

          // Pintinha escura com anel dourado ao redor (como na linha lateral da referência)
          void applyMiniOcellus(vec2 flank, vec2 center, float rad, float grain, inout vec3 albedo) {
            float d = length((flank - center) / vec2(rad * 1.15, rad)) + (grain - 0.5) * 0.14;
            float halo = 1.0 - smoothstep(0.85, 1.35, d);
            float spot = 1.0 - smoothstep(0.45, 0.72, d);
            albedo = mix(albedo, vec3(0.92, 0.78, 0.25), halo * 0.85);
            albedo = mix(albedo, vec3(0.03, 0.04, 0.03), spot * 0.96);
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
            float head = 1.0 - smoothstep(0.18, 0.30, t);

            float cloud = noise2D(flank * vec2(2.6, 3.8));
            float mottle = noise2D(flank * vec2(7.8, 9.2));
            float grain = noise2D(flank * vec2(26.0, 28.0));
            float fineNoise = noise2D(flank * vec2(44.0, 44.0));
            float flankLight = (mottle - 0.5) * 0.45 + (cloud - 0.5) * 0.55;

            // Grade de escamas maiores (48 x 34) para volume e brilho legíveis
            vec2 grid = vec2(t * (48.0 + 8.0 * t), vUv.y * 34.0);
            vec4 scales = peacockScalePattern(grid);
            float scaleFade = (1.0 - smoothstep(0.35, 0.86, max(fwidth(grid.x), fwidth(grid.y)))) *
              mix(1.0, 0.06, head);

            // Paleta fiel à referência: dorso verde-musgo, flanco dourado e ventre laranja-tangerina vivo
            vec3 deepMoss = vec3(0.14, 0.28, 0.15);
            vec3 oliveBack = vec3(0.27, 0.46, 0.21);
            vec3 chartreuseShoulder = vec3(0.55, 0.64, 0.21);
            vec3 flankGold = vec3(0.84, 0.70, 0.17);
            vec3 warmAmber = vec3(0.90, 0.52, 0.13);
            vec3 bellyOrange = vec3(0.91, 0.29, 0.07);

            float colorY = y + flankLight * 0.11;
            vec3 albedo = mix(flankGold, chartreuseShoulder, smoothstep(0.08, 0.36, colorY));
            albedo = mix(albedo, oliveBack, smoothstep(0.30, 0.56, colorY));
            albedo = mix(albedo, deepMoss, smoothstep(0.52, 0.78, colorY));
            albedo = mix(albedo, warmAmber, 1.0 - smoothstep(-0.36, -0.06, colorY));
            albedo = mix(albedo, bellyOrange, 1.0 - smoothstep(-0.56, -0.26, colorY));

            // Bochecha amarelo-ouro brilhante e queixo/garganta laranja vivo
            float cheekZone = oval(flank, vec2(1.36, -0.09), vec2(0.54, 0.34));
            albedo = mix(albedo, vec3(0.93, 0.75, 0.19), cheekZone * 0.88);
            float throatZone = oval(flank, vec2(1.18, -0.44), vec2(0.92, 0.24));
            albedo = mix(albedo, vec3(0.93, 0.35, 0.08), throatZone * 0.82);

            // Testa/focinho superior verde-oliva descendo sobre o olho + anel orbital verde-esmeralda
            float snoutGreen = oval(flank, vec2(1.84, 0.17), vec2(0.42, 0.22)) * smoothstep(-0.02, 0.20, y);
            albedo = mix(albedo, vec3(0.30, 0.48, 0.24), snoutGreen * 0.85);
            float eyeRimVis = smoothstep(0.42, 0.85,
              oval(flank, vec2(${glslF(EYE_Z2)}, ${glslF(EYE_Y2 + 0.015)}), vec2(0.155, 0.142))) * (1.0 - vRelief.z);
            albedo = mix(albedo, vec3(0.22, 0.48, 0.22),
              eyeRimVis * smoothstep(-0.08, 0.14, y - ${glslF(EYE_Y2)}) * 0.65);

            // Pedúnculo caudal: transição verde em cima / laranja-âmbar embaixo
            float peduncle = smoothstep(0.78, 1.0, t);
            vec3 pedCol = mix(vec3(0.84, 0.42, 0.12), vec3(0.28, 0.47, 0.25), smoothstep(-0.08, 0.06, y));
            albedo = mix(albedo, pedCol, peduncle * 0.82);

            albedo *= 1.0 + flankLight * 0.26;

            // Contorno escuro em cada escama (malha visível no dorso verde e flanco dourado)
            float netStrength = smoothstep(-0.22, 0.24, y) * (1.0 - head * 0.92) * scaleFade;
            albedo *= 1.0 - scales.w * 0.30 * netStrength;
            albedo *= 1.0 + scaleFade * ((scales.z - 0.5) * 0.14 + scales.x * 0.09 - scales.y * 0.055);

            // As 3 barras pretas verticais características da imagem de referência
            float warp = (mottle - 0.5) * 0.16 + (grain - 0.5) * 0.07;
            float b1 = darkBar2(z, y, 0.28, 0.168, -0.52, 0.56, 0.08, warp, scales.w);
            float b2 = darkBar2(z, y, -0.34, 0.180, -0.55, 0.58, -0.10, warp, scales.w);
            float b3 = darkBar2(z, y, -0.96, 0.140, -0.43, 0.36, 0.12, warp * 1.15, scales.w) * 0.92;
            float bars = max(b1, max(b2, b3));

            // Manchas pretas irregulares atrás do olho e respingos na bochecha
            float cheekBlotchA = oval(vec2(z + warp * 0.45, y + (grain - 0.5) * 0.06), vec2(1.32, 0.04), vec2(0.20, 0.095));
            float cheekBlotchB = oval(vec2(z + warp * 0.35, y + (mottle - 0.5) * 0.05), vec2(1.12, 0.00), vec2(0.11, 0.065));
            float cheekBlotches = smoothstep(0.32, 0.55, max(cheekBlotchA, cheekBlotchB) + (mottle - 0.5) * 0.30);

            float spatterArea = oval(flank, vec2(1.26, -0.06), vec2(0.36, 0.20));
            float spatter = smoothstep(0.64, 0.72, grain * 0.72 + fineNoise * 0.38) * smoothstep(0.18, 0.55, spatterArea);
            float shoulderSpots = smoothstep(0.66, 0.74, mottle * 0.65 + grain * 0.42) *
              oval(flank, vec2(0.84, 0.00), vec2(0.18, 0.18));

            float marks = max(bars, max(cheekBlotches, max(spatter, shoulderSpots)));
            vec3 inkBlack = mix(vec3(0.032, 0.038, 0.028), vec3(0.075, 0.082, 0.050), grain);
            albedo = mix(albedo, inkBlack, min(1.0, marks) * 0.95);

            // Pintinhas com halo dourado próximas à linha lateral entre as barras (como na referência)
            applyMiniOcellus(flank, vec2(0.00, 0.16), 0.045, grain, albedo);
            applyMiniOcellus(flank, vec2(-0.64, 0.21), 0.040, grain, albedo);
            applyMiniOcellus(flank, vec2(-0.78, 0.16), 0.038, grain, albedo);
            applyMiniOcellus(flank, vec2(0.18, 0.57), 0.036, grain, albedo);

            // Linha lateral, guelras com aba carnosa + fenda branquial profunda, narina e órbita
            float latLineY = 0.08 + 0.17 * sin(clamp((t - 0.22) / 0.56, 0.0, 1.0) * 3.14159);
            float lateral = bell((y - latLineY) / 0.008) * smoothstep(0.26, 0.35, t) * (1.0 - smoothstep(0.68, 0.76, t));
            albedo *= 1.0 - lateral * (0.14 + 0.18 * grain);

            float gillZ = 1.06 + 0.42 * (y + 0.10) * (y + 0.10) + 0.20 * y;
            float gillLength = smoothstep(-0.56, -0.34, y) * (1.0 - smoothstep(0.18, 0.36, y));
            float opFlangeRim = bell((z - gillZ - 0.065) / 0.055) * gillLength;
            float gillFold = bell((z - gillZ) / 0.022) * gillLength;
            albedo = mix(albedo, vec3(0.94, 0.62, 0.22), opFlangeRim * 0.42);
            albedo = mix(albedo, vec3(0.32, 0.11, 0.04), gillFold * 0.55);
            albedo = mix(albedo, vec3(0.16, 0.04, 0.02), vRelief.y * 0.92);

            float eyeSocket = oval(flank, vec2(${glslF(EYE_Z2)}, ${glslF(EYE_Y2)}), vec2(0.132, 0.118));
            float nostril = oval(flank, vec2(${glslF(EYE_Z2 + 0.24)}, ${glslF(EYE_Y2 - 0.04)}), vec2(0.026, 0.018));
            albedo *= 1.0 - eyeSocket * 0.34 - nostril * 0.62;
            albedo *= 1.0 - vRelief.z * 0.55 - vRelief.w * 0.38;
            albedo *= 1.0 + head * (grain - 0.5) * 0.12;

            // Lábios carnosos dourado-alaranjados com fenda bucal profunda
            float lipY = (${glslF(MOUTH_TIP_Y2)} - ${glslF(MOUTH_SLOPE2)} * min(t, ${glslF(MOUTH_END2)})) *
              (1.0 - smoothstep(${glslF(MOUTH_END2)}, ${glslF(MOUTH_SETTLE2)}, t));
            float lipMask = 1.0 - smoothstep(0.105, ${glslF(MOUTH_END2)}, t);
            float lipCrease = bell((y - lipY) / 0.014) * lipMask;
            float lips = bell((y - lipY) / 0.058) * lipMask;
            float lipHighlight = bell((y - lipY + 0.028) / 0.022) * lipMask;
            albedo = mix(albedo, vec3(0.88, 0.58, 0.21), lips * 0.70);
            albedo = mix(albedo, vec3(0.14, 0.06, 0.03), max(lipCrease * 0.65, vRelief.x * 0.88));
            albedo += vec3(0.10, 0.06, 0.02) * lipHighlight * (1.0 - vRelief.x);

            // Bump map mais marcado das escamas 3D
            float height = (scales.x + scales.y * 0.30) * scaleFade * 0.013;
            vec3 dPdx = dFdx(vWorldPos);
            vec3 dPdy = dFdy(vWorldPos);
            vec3 surfaceGradient = normalize(cross(dPdy, Ngeom)) * dFdx(height) +
              normalize(cross(Ngeom, dPdx)) * dFdy(height);
            vec3 N = normalize(Ngeom - surfaceGradient * 13.5);

            // Oclusão ambiental real das cavidades (boca, guelra, órbita e sulcos ósseos)
            float creviceAO = clamp(vRelief.x * 0.82 + vRelief.y * 0.90 + vRelief.z * 0.65 + vRelief.w * 0.52, 0.0, 0.94);

            // Iluminação úmida com duplo lóbulo especular e rebote subaquático
            float diff = max(dot(N, L), 0.0);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            float wetBroad = pow(max(dot(N, H), 0.0), 22.0) * 0.18;
            float wetSharp = pow(max(dot(N, H), 0.0), 96.0) * (0.28 + scaleFade * scales.x * 0.28);
            vec3 illumination = mix(vec3(0.50, 0.58, 0.54), vec3(0.84, 0.90, 0.84), Ngeom.y * 0.5 + 0.5);
            vec3 color = albedo * (illumination + vec3(0.62, 0.57, 0.45) * diff) * (1.0 - creviceAO * 0.62);

            // Brilho úmido sobre escamas e barras + contorno subaquático frio sob o queixo/ventre
            float specMask = (1.0 - min(1.0, marks) * 0.38) * (1.0 - creviceAO * 0.95);
            float sheen = smoothstep(0.02, 0.62, y) * (0.28 + 0.72 * (1.0 - head));
            color += vec3(0.36, 0.66, 0.52) * sheen * (0.07 + wetBroad * 0.45) * (1.0 - creviceAO * 0.85);
            color += vec3(1.00, 0.98, 0.92) * (wetBroad * 0.42 + wetSharp) * specMask;
            float chinRim = fresnel * (1.0 - smoothstep(-0.58, 0.05, Ngeom.y)) * smoothstep(0.15, 1.8, z);
            color += vec3(0.55, 0.92, 0.95) * (fresnel * 0.08 + chinRim * 0.36) * (1.0 - creviceAO * 0.80);

            float caustics = layeredCaustics(vWorldPos.xz * 1.05, uTime * 1.05);
            color += vec3(0.38, 0.80, 0.73) * caustics * 0.16 * uCausticsIntensity *
              smoothstep(-0.22, 0.76, Ngeom.y) * (1.0 - creviceAO * 0.75);

            if (vOralSurface > 0.5) {
              vec3 mouthCol = mix(vec3(0.32, 0.12, 0.09), vec3(0.07, 0.03, 0.03), smoothstep(0.015, 0.15, t));
              float gum = smoothstep(0.35, 0.49, abs(vUv.y - 0.5)) * (1.0 - smoothstep(0.06, 0.16, t));
              float lipRimCol = 0.78 * (1.0 - smoothstep(0.006, 0.055, t));
              color = mix(mouthCol, vec3(0.55, 0.30, 0.16), max(gum, lipRimCol));
              color += vec3(0.24, 0.11, 0.08) * wetBroad;
            }

            float waterAbsorb = clamp((length(cameraPosition - vWorldPos) - 13.0) * 0.012, 0.020, 0.24);
            color = mix(color, vec3(0.07, 0.26, 0.29), waterAbsorb);

            gl_FragColor = vec4(color, 1.0);
          }
        `
      });
    }

    // Olho realista encaixado na órbita com íris vermelho-rubi profunda, borda escura e brilho vítreo
    function createPeacockEyeMaterial(fishUniforms, sideSign, eyeOffset) {
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
          ${FISH_DEFORM_V2_GLSL}
          void main() {
            vLocalNorm = normalize(normal);
            vec3 p = position + uEyeOffset;
            vec3 dp = deformFishPosition2(p);
            vec3 dn = deformFishNormal2(p, normal);
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
            vec3 gaze = normalize(vec3(uSideSign * 0.94, 0.04, 0.24));
            vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), gaze));
            vec3 up = cross(gaze, tangent);
            float r = acos(clamp(dot(nLoc, gaze), -1.0, 1.0));
            float ang = atan(dot(nLoc, up), dot(nLoc, tangent));
            float fibers = 0.86 + 0.09 * sin(ang * 26.0 + sin(ang * 6.0)) + 0.05 * sin(ang * 41.0);

            // Transição escura com a pálpebra -> anel externo prateado sutil -> íris rubi profunda -> pupila
            vec3 col = mix(vec3(0.08, 0.09, 0.07), vec3(0.54, 0.50, 0.42), 1.0 - smoothstep(0.68, 0.80, r));
            col = mix(col, vec3(0.72, 0.12, 0.07) * fibers, 1.0 - smoothstep(0.58, 0.67, r));
            col = mix(col, vec3(0.88, 0.26, 0.10) * fibers, 1.0 - smoothstep(0.39, 0.48, r));
            col = mix(col, vec3(0.012, 0.014, 0.016), 1.0 - smoothstep(0.325, 0.385, r));

            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.38, 0.82, 0.43));
            float diff = 0.74 + 0.26 * max(dot(N, L), 0.0);
            float reflex = max(dot(N, normalize(L + V)), 0.0);
            float spec = pow(reflex, 128.0) * 1.15 + pow(reflex, 28.0) * 0.10;
            gl_FragColor = vec4(col * diff + vec3(0.96, 0.98, 1.0) * spec, 1.0);
          }
        `
      });
    }

    // Nadadeiras fiéis à referência (cauda bicolor verde/vermelho com ocelo grande, dorsal verde-sálvia, anal e pélvicas laranja-vermelho)
    function createPeacockFinMaterial(fishUniforms, finType, sideSign = 0, pivot = new THREE.Vector3()) {
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

          ${FISH_DEFORM_V2_GLSL}

          void main() {
            vUv = uv;
            vec3 p = position;
            vec3 n = normal;

            if (uFinType == 0) {
              float edgeLag = abs(uv.y - 0.5) * 0.45;
              float whip = sin(uSwimPhase - 4.7 - uv.x * 2.15 - edgeLag) * (uTailAmp * 0.30) * pow(uv.x, 1.45);
              float silkTip = sin(uIdleDriftPhase - uv.x * 2.8 - uv.y * 1.8) * 0.032 * pow(uv.x, 1.8);
              p.x += whip + silkTip;
            } else if (uFinType == 1) {
              float flareScale = mix(0.62, 1.06, uDorsalFlare);
              float baseY = p.y - uv.y * 0.45;
              p.y = mix(p.y, baseY + uv.y * 0.45 * flareScale, uv.y);
              float sBody = fishLengthFraction2(p.z);
              p.x += sin(uSwimPhase - sBody * 4.9 - uv.y * 0.7) * (uTailAmp * 0.14 + 0.015) * uv.y;
            } else if (uFinType == 2 || uFinType == 3) {
              float sBody = fishLengthFraction2(p.z);
              float wave = sin(uSwimPhase - sBody * 4.9 - uv.y * 1.25 - uv.x * 1.1) * (uTailAmp * 0.25 + 0.032) * uv.y;
              p.x += wave;
            } else if (uFinType == 4) {
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
              float tuck = mix(0.36, 0.0, clamp(uPectoralSpread * 1.4, 0.0, 1.0));
              float c = cos(tuck);
              float s = sin(tuck);
              vec3 q = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
              p = uPivot + q;
              n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
            }

            vec3 dp = deformFishPosition2(p);
            vec3 dn = deformFishNormal2(p, n);

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

          float edgeFade(float coord, float width) {
            return smoothstep(0.0, width, coord) * (1.0 - smoothstep(1.0 - width, 1.0, coord));
          }

          float finRays(float coord, float count, float offset) {
            float band = coord * count + offset;
            float ray = 1.0 - smoothstep(0.08, 0.29, abs(fract(band) - 0.5));
            return mix(ray, 0.28, smoothstep(0.35, 0.96, fwidth(band)));
          }

          void main() {
            float u = vUv.x;
            float v = vUv.y;
            bool radial = uFinType == 0 || uFinType >= 4;
            float reach = radial ? u : v;
            float across = radial ? v : u;
            float rayCount = 18.0;
            float opacity = 0.88;
            vec3 col;

            if (uFinType == 0) {
              // Cauda bicolor: verde-oliva translúcido em cima + laranja-vermelho estriado embaixo
              float split = smoothstep(0.43, 0.49, v + 0.02 * sin(u * 4.0));
              vec3 upper = mix(vec3(0.26, 0.46, 0.26), vec3(0.40, 0.56, 0.36), smoothstep(0.08, 0.80, u));
              vec3 lower = mix(vec3(0.84, 0.34, 0.09), vec3(0.90, 0.26, 0.07), smoothstep(0.05, 0.78, u));
              col = mix(lower, upper, split);
              rayCount = 26.0;
              opacity = mix(0.95, 0.86, split);
            } else if (uFinType == 1) {
              // Dorsal espinhosa verde-sálvia pálida translúcida
              col = mix(vec3(0.32, 0.47, 0.27), vec3(0.48, 0.59, 0.40), smoothstep(0.05, 0.88, v));
              rayCount = 10.0;
              opacity = 0.82;
            } else if (uFinType == 2) {
              // Dorsal mole verde-oliva luminosa
              col = mix(vec3(0.30, 0.45, 0.26), vec3(0.44, 0.58, 0.36), smoothstep(0.08, 0.90, v));
              rayCount = 18.0;
              opacity = 0.84;
            } else if (uFinType == 3) {
              // Anal laranja-vermelho vivo com raios definidos
              col = mix(vec3(0.84, 0.34, 0.10), vec3(0.93, 0.28, 0.08), smoothstep(0.08, 0.85, v));
              col = mix(col, vec3(0.96, 0.60, 0.34), (1.0 - smoothstep(0.02, 0.14, u)) * 0.45);
              rayCount = 16.0;
              opacity = 0.93;
            } else if (uFinType == 4) {
              // Peitoral âmbar-dourado translúcido
              col = mix(vec3(0.84, 0.62, 0.22), vec3(0.93, 0.80, 0.48), smoothstep(0.10, 0.96, u));
              rayCount = 14.0;
              opacity = 0.72;
            } else {
              // Pélvica longa laranja-vermelha com borda frontal clara
              col = mix(vec3(0.84, 0.34, 0.10), vec3(0.91, 0.26, 0.08), smoothstep(0.08, 0.90, u));
              col = mix(col, vec3(0.96, 0.66, 0.42), (1.0 - smoothstep(0.01, 0.14, v)) * 0.55);
              rayCount = 10.0;
              opacity = 0.94;
            }

            float rayBend = uFinType == 1 ? 0.26 : 0.22 * sin(across * 5.0) * reach;
            float rays = finRays(across, rayCount, rayBend);
            float fiberGrain = hash21(floor(vec2(across * rayCount, reach * 20.0)) + float(uFinType) * 19.0);
            float rayContrast = (uFinType == 0 && v < 0.47) || uFinType == 3 || uFinType == 5 ? 0.32 : 0.20;
            col *= 0.84 + rayContrast * rays + (fiberGrain - 0.5) * 0.08;

            // Ocelos na cauda: grande na transição verde/laranja + menor atrás/acima
            float ocellusMask = 0.0;
            if (uFinType == 0) {
              float dMain = length((vUv - vec2(0.21, 0.52)) / vec2(0.078, 0.072));
              float haloMain = 1.0 - smoothstep(0.84, 1.18, dMain);
              float coreMain = 1.0 - smoothstep(0.58, 0.74, dMain);
              col = mix(col, vec3(0.92, 0.78, 0.24), haloMain * 0.92);
              col = mix(col, vec3(0.025, 0.032, 0.024), coreMain);

              float dSec = length((vUv - vec2(0.37, 0.64)) / vec2(0.036, 0.033));
              float haloSec = 1.0 - smoothstep(0.82, 1.24, dSec);
              float coreSec = 1.0 - smoothstep(0.48, 0.68, dSec);
              col = mix(col, vec3(0.92, 0.80, 0.28), haloSec * 0.85);
              col = mix(col, vec3(0.03, 0.035, 0.025), coreSec * 0.95);
              ocellusMask = max(haloMain, haloSec);
            }

            float edge = edgeFade(across, 0.042) * (1.0 - smoothstep(0.95, 1.0, reach));
            float alpha = max(opacity, ocellusMask * 0.96) * edge * mix(1.0, 0.82, reach) * (0.86 + 0.14 * rays);

            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(vec3(-0.38, 0.82, 0.43));
            float transmit = 0.34 * abs(dot(N, L)) + 0.14 * max(0.0, dot(vec3(0.0, 1.0, 0.0), L));
            float rim = pow(1.0 - abs(dot(N, V)), 2.5);
            float specExp = uFinType >= 4 ? 32.0 : 40.0;
            float specStrength = uFinType >= 4 ? 0.19 : 0.12;
            float spec = pow(abs(dot(N, normalize(L + V))), specExp) * (specStrength + 0.16 * rays);
            col *= 0.74 + transmit;
            col += vec3(0.74, 0.90, 0.78) * (spec + rim * 0.08);

            float caustics = layeredCaustics(vWorldPos.xz * 1.05, uTime * 1.05);
            col += vec3(0.38, 0.80, 0.73) * caustics * 0.11 * uCausticsIntensity;
            float waterAbsorb = clamp((length(cameraPosition - vWorldPos) - 13.0) * 0.012, 0.020, 0.24);
            col = mix(col, vec3(0.07, 0.26, 0.29), waterAbsorb);

            gl_FragColor = vec4(col, alpha);
          }
        `
      });
    }

    function createPeacockShadowMaterial(fishUniforms) {
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
          ${FISH_DEFORM_V2_GLSL}
          void main() {
            vShadowUv = uv;
            vec3 p = position;
            p.x += spineOffsetX2(p.z);
            p.x += sin(p.z * 1.3 + uTime * 1.5) * 0.04;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uShadowOpacity;
          varying vec2 vShadowUv;
          void main() {
            vec2 d = (vShadowUv - vec2(0.5, 0.5)) * 2.0;
            float taper = mix(1.0, 1.8, smoothstep(0.45, 1.0, vShadowUv.y));
            float dist = length(vec2(d.x * taper, d.y));
            float soft = exp(-dist * dist * 3.0) * (1.0 - smoothstep(0.35, 1.0, dist));
            gl_FragColor = vec4(0.012, 0.058, 0.068, uShadowOpacity * soft);
          }
        `
      });
    }

    function createPeacockBass() {
      const fishUniforms = {
        uSwimPhase: { value: 1.4 },
        uTailAmp: { value: 0.14 },
        uSpineCurve: { value: 0.0 },
        uPectoralSpread: { value: 0.42 },
        uPectoralRowL: { value: 0.0 },
        uPectoralRowR: { value: 0.0 },
        uDorsalFlare: { value: 0.72 },
        uBreathPhase: { value: 0.8 },
        uIdleDriftPhase: { value: 1.1 },
        uMouthOpen: { value: 0.0 }
      };

      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      scene.add(group);

      const bodyMesh = new THREE.Mesh(peacockGeos.body, createPeacockBodyMaterial(fishUniforms));
      bodyMesh.renderOrder = 4;
      group.add(bodyMesh);

      const caudalMesh = new THREE.Mesh(peacockGeos.caudal, createPeacockFinMaterial(fishUniforms, 0));
      caudalMesh.renderOrder = 5;
      group.add(caudalMesh);

      const spinyDorsalMesh = new THREE.Mesh(peacockGeos.spinyDorsal, createPeacockFinMaterial(fishUniforms, 1));
      spinyDorsalMesh.renderOrder = 5;
      group.add(spinyDorsalMesh);

      const softDorsalMesh = new THREE.Mesh(peacockGeos.softDorsal, createPeacockFinMaterial(fishUniforms, 2));
      softDorsalMesh.renderOrder = 5;
      group.add(softDorsalMesh);

      const analMesh = new THREE.Mesh(peacockGeos.anal, createPeacockFinMaterial(fishUniforms, 3));
      analMesh.renderOrder = 5;
      group.add(analMesh);

      const pectLMesh = new THREE.Mesh(peacockGeos.pectL, createPeacockFinMaterial(fishUniforms, 4, 1, pectLPivot2));
      pectLMesh.renderOrder = 6;
      group.add(pectLMesh);

      const pectRMesh = new THREE.Mesh(peacockGeos.pectR, createPeacockFinMaterial(fishUniforms, 4, -1, pectRPivot2));
      pectRMesh.renderOrder = 6;
      group.add(pectRMesh);

      const pelvLMesh = new THREE.Mesh(peacockGeos.pelvL, createPeacockFinMaterial(fishUniforms, 5, 1, pelvLPivot2));
      pelvLMesh.renderOrder = 5;
      group.add(pelvLMesh);

      const pelvRMesh = new THREE.Mesh(peacockGeos.pelvR, createPeacockFinMaterial(fishUniforms, 5, -1, pelvRPivot2));
      pelvRMesh.renderOrder = 5;
      group.add(pelvRMesh);

      const eyeLMesh = new THREE.Mesh(peacockGeos.eye, createPeacockEyeMaterial(fishUniforms, 1, eyeLPos2));
      eyeLMesh.renderOrder = 5;
      group.add(eyeLMesh);

      const eyeRMesh = new THREE.Mesh(peacockGeos.eye, createPeacockEyeMaterial(fishUniforms, -1, eyeRPos2));
      eyeRMesh.renderOrder = 5;
      group.add(eyeRMesh);

      const shadowGroup = new THREE.Group();
      scene.add(shadowGroup);
      const shadowMat = createPeacockShadowMaterial(fishUniforms);
      const shadowPlaneGeo = new THREE.PlaneGeometry(1.70, 5.5, 8, 28);
      shadowPlaneGeo.rotateX(-Math.PI / 2);
      const shadowBody = new THREE.Mesh(shadowPlaneGeo, shadowMat);
      shadowBody.renderOrder = 1;
      shadowGroup.add(shadowBody);

      return {
        id: 2,
        uniforms: fishUniforms,
        group,
        shadowGroup,
        shadowMat,

        pos: isInspect ? new THREE.Vector3(0.0, 0.0, 0.0) : new THREE.Vector3(2.2, -0.22, -0.65),
        targetY: -0.22,
        velY: 0,
        heading: -Math.PI * 0.48,
        pitch: 0,
        roll: 0,
        speed: isInspect ? 0.0 : 1.25,
        prevSpeed: 1.25,
        acceleration: 0,
        angularVelocity: 0,

        state: 'PATROL',
        stateTimer: 0,
        hoverDuration: 0,
        nextHoverIn: 5.4,
        strikeDuration: 0.40,
        fleeTimer: 0,
        fleeCooldown: 0,
        fleeHeadingOffset: 0,

        kickCycleTimer: 1.2,
        kickBurstLeft: 0.35,

        waypoint: new THREE.Vector3(-4.4, 0.2, 0.45),
        waypointTimer: 0,
        curiosityOrbitSign: -1,

        swimPhase: 1.4,
        breathPhase: 0.8,
        idleDriftPhase: 1.1,
        smoothEffort: 0.22,
        smoothSpineCurve: 0,
        smoothPectSpread: 0.42,
        smoothDorsalFlare: 0.72,
        pectRowPhase: 1.2,
        smoothMouthOpen: 0,
        biteSnapTimer: 0
      };
    }

    const tucunareRealista = createPeacockBass();

    return {
      tucunareRealista
    };
  }

  window.TucunareV2 = { createTucunareV2 };
})();
