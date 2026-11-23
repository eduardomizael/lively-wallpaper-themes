(() => {
  'use strict';

  function createKoiModels() {
    // =========================================================================
    // 4. GEOMETRIAS PROCEDURAIS COMPARTILHADAS DA CARPA KOI
    // =========================================================================
    const HEAD_Z = 2.05;
    const BODY_LEN = 4.10;

    function koiBodyWidth(t) {
      if (t < 0.27) {
        const u = t / 0.27;
        return 0.04 + 0.56 * Math.pow(Math.sin(u * Math.PI * 0.5), 0.78);
      }
      const u = (t - 0.27) / 0.73;
      return 0.60 * Math.pow(1.0 - u, 1.42) + 0.075 * Math.pow(u, 0.6);
    }

    function koiBodyHeight(t) {
      if (t < 0.30) {
        const u = t / 0.30;
        return 0.05 + 0.44 * Math.pow(Math.sin(u * Math.PI * 0.5), 0.75);
      }
      const u = (t - 0.30) / 0.70;
      return 0.49 * Math.pow(1.0 - u, 1.28) + 0.08;
    }

    function createKoiBodyGeometry() {
      const lengthSegs = 60;
      const radialSegs = 26;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= lengthSegs; i++) {
        const t = i / lengthSegs;
        const z = HEAD_Z - t * BODY_LEN;
        const rx = koiBodyWidth(t);
        const ry = koiBodyHeight(t);
        const yOffset = Math.sin(t * Math.PI) * 0.05;

        for (let j = 0; j <= radialSegs; j++) {
          const v = j / radialSegs;
          const theta = v * Math.PI * 2.0;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);

          const yScale = sinT >= 0 ? 1.05 : 0.78;
          positions.push(cosT * rx, sinT * ry * yScale + yOffset, z);
          uvs.push(t, v);
        }
      }

      const stride = radialSegs + 1;
      for (let i = 0; i < lengthSegs; i++) {
        for (let j = 0; j < radialSegs; j++) {
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

    function createCaudalFinGeometry(tailLength = 1.82, spreadScale = 1.0) {
      const segU = 24;
      const segV = 20;
      const positions = [];
      const uvs = [];
      const indices = [];

      const baseZ = -1.96;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const side = (v - 0.5) * 2.0;
          const absSide = Math.abs(side);

          const spread = (0.08 + Math.pow(u, 0.78) * 1.08) * spreadScale;
          const forkNotch = 0.42 * (1.0 - Math.pow(absSide, 1.45)) * Math.pow(u, 1.35);
          const outerRound = 0.16 * Math.pow(absSide, 2.6) * u;

          const z = baseZ - (u * tailLength) + forkNotch + outerRound;
          const x = side * spread;
          const y = 0.02 + Math.sin(u * Math.PI) * 0.06 * (1.0 - absSide * 0.5) - absSide * u * 0.05;

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

    function createPectoralFinGeometry(sideSign) {
      const segU = 14;
      const segV = 10;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const chord = Math.sin(Math.pow(u, 0.72) * Math.PI) * 0.88 + 0.16 * (1.0 - u);
        const reach = u * 1.18;
        const sweepBack = Math.pow(u, 1.25) * 0.68;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const localX = sideSign * reach;
          const localZ = (0.35 - v) * chord - sweepBack;
          const localY = -0.06 - u * 0.12 + Math.sin(v * Math.PI) * 0.045 * u;
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

    function createPelvicFinGeometry(sideSign) {
      const segU = 9;
      const segV = 7;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const chord = Math.sin(Math.pow(u, 0.75) * Math.PI) * 0.48 + 0.1 * (1.0 - u);
        const reach = u * 0.56;
        const sweepBack = Math.pow(u, 1.15) * 0.42;

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          positions.push(sideSign * reach, -0.18 - u * 0.08, (0.28 - v) * chord - sweepBack);
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

    function createDorsalFinGeometry() {
      const segU = 22;
      const segV = 7;
      const positions = [];
      const uvs = [];
      const indices = [];

      const startZ = 0.55;
      const endZ = -1.15;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const z = THREE.MathUtils.lerp(startZ, endZ, u);
        const tBody = (HEAD_Z - z) / BODY_LEN;
        const baseY = koiBodyHeight(tBody) * 0.95;
        const finHeight = Math.sin(Math.pow(u, 0.78) * Math.PI) * 0.42 + 0.06 * (1.0 - u);

        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          positions.push(0, baseY + v * finHeight, z - v * 0.22);
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

    function createWhiskerGeo(sideSign) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sideSign * 0.14, -0.02, 1.92),
        new THREE.Vector3(sideSign * 0.28, -0.04, 1.88),
        new THREE.Vector3(sideSign * 0.36, -0.06, 1.72)
      ]);
      return new THREE.TubeGeometry(curve, 8, 0.014, 5, false);
    }

    // Geometrias compartilhadas (instanciadas em memória apenas uma vez)
    const sharedGeos = {
      body: createKoiBodyGeometry(),
      caudalStandard: createCaudalFinGeometry(1.82, 1.0),
      caudalVeil: createCaudalFinGeometry(2.22, 1.18), // Cauda véu mais longa para variedade elegante
      pectL: createPectoralFinGeometry(1),
      pectR: createPectoralFinGeometry(-1),
      pelvL: createPelvicFinGeometry(1),
      pelvR: createPelvicFinGeometry(-1),
      dorsal: createDorsalFinGeometry(),
      eyeL: new THREE.SphereGeometry(0.085, 12, 8).scale(0.85, 0.72, 1.05).translate(0.42, 0.17, 1.46),
      eyeR: new THREE.SphereGeometry(0.085, 12, 8).scale(0.85, 0.72, 1.05).translate(-0.42, 0.17, 1.46),
      whiskerL: createWhiskerGeo(1),
      whiskerR: createWhiskerGeo(-1)
    };

    const pectLPivot = new THREE.Vector3(0.46, -0.05, 0.96);
    const pectRPivot = new THREE.Vector3(-0.46, -0.05, 0.96);
    const pelvLPivot = new THREE.Vector3(0.22, -0.14, -0.22);
    const pelvRPivot = new THREE.Vector3(-0.22, -0.14, -0.22);

    // =========================================================================
    // 5. OS 5 MODELOS DE CARPA KOI (ESTÉTICA + PERSONALIDADE INDIVIDUAL)
    // =========================================================================
    const KOI_ARCHETYPES = [
      {
        name: 'Kohaku (Clássica Real)',
        patternId: 0, // Branca perolada + grandes manchas laranja-vermelhão
        seed: 1.7,
        veilTail: false,
        scale: 1.06,
        widthRatio: 1.04,
        depthY: 0.15,
        finRootColor: 0xfcb484,
        finTipColor: 0xf7fbff,
        whiskerColor: 0xefe5d8,
        // Personalidade: equilibrada, majestosa, medo moderado, boa curiosidade
        speedFactor: 0.96,
        burstRate: 0.95,
        burstPower: 2.35,
        fearRadius: 5.2,
        fearBoost: 2.45,
        fleeDuration: 1.15,
        fleeDistanceBias: 1.0,
        curiosity: 0.85,
        curiosityOrbit: 2.6,
        appetite: 1.05,
        restTendency: 0.25
      },
      {
        name: 'Taisho Sanke (Tricolor)',
        patternId: 1, // Branca + laranja vibrante + manchas pretas Sumi
        seed: 4.3,
        veilTail: false,
        scale: 0.96,
        widthRatio: 0.98,
        depthY: -0.05,
        finRootColor: 0xf8b990,
        finTipColor: 0xf2f7fc,
        whiskerColor: 0xe8dfd3,
        // Personalidade: ágil, curiosa, gosta de explorar e disputar petiscos
        speedFactor: 1.12,
        burstRate: 1.25,
        burstPower: 2.55,
        fearRadius: 5.6,
        fearBoost: 2.65,
        fleeDuration: 1.05,
        fleeDistanceBias: 1.15,
        curiosity: 1.18,
        curiosityOrbit: 2.0,
        appetite: 1.28,
        restTendency: 0.12
      },
      {
        name: 'Showa Sanshoku (Negra & Carmesim)',
        patternId: 2, // Base preta aveludada com faixas brancas e vermelho-fogo
        seed: 8.9,
        veilTail: false,
        scale: 1.16,
        widthRatio: 1.10,
        depthY: -0.32,
        finRootColor: 0x3b3e48,
        finTipColor: 0xe6ecf5,
        whiskerColor: 0x3a3d46,
        // Personalidade: grande, tranquila, corajosa (pouco medo, foge só se chegar muito perto e não vai longe)
        speedFactor: 0.78,
        burstRate: 0.60,
        burstPower: 2.05,
        fearRadius: 3.5,
        fearBoost: 1.90,
        fleeDuration: 0.72,
        fleeDistanceBias: 0.65,
        curiosity: 0.95,
        curiosityOrbit: 1.85,
        appetite: 0.92,
        restTendency: 0.55
      },
      {
        name: 'Yamabuki Ogon (Ouro Puro)',
        patternId: 3, // Dourado metálico luminoso com escamas cintilantes e cauda véu
        seed: 12.4,
        veilTail: true,
        scale: 0.88,
        widthRatio: 0.92,
        depthY: 0.34,
        finRootColor: 0xffc84a,
        finTipColor: 0xfff3c4,
        whiskerColor: 0xffd56e,
        // Personalidade: muito inquieta, rápida e arisca (se assusta de longe e dispara para bem longe!)
        speedFactor: 1.28,
        burstRate: 1.65,
        burstPower: 2.85,
        fearRadius: 7.2,
        fearBoost: 3.25,
        fleeDuration: 1.65,
        fleeDistanceBias: 1.55,
        curiosity: 0.62,
        curiosityOrbit: 3.4,
        appetite: 1.35,
        restTendency: 0.05
      },
      {
        name: 'Asagi Shusui (Azul-Prata & Coral)',
        patternId: 4, // Dorso azul-ardósia prateado reticulado + laterais coral + cauda véu
        seed: 19.2,
        veilTail: true,
        scale: 0.84,
        widthRatio: 0.94,
        depthY: -0.18,
        finRootColor: 0xff8a65,
        finTipColor: 0xdff2ff,
        whiskerColor: 0xd9e8f2,
        // Personalidade: tímida ao movimento mas super curiosa quando o mouse para, adora petiscos
        speedFactor: 0.90,
        burstRate: 0.82,
        burstPower: 2.40,
        fearRadius: 6.2,
        fearBoost: 2.85,
        fleeDuration: 1.35,
        fleeDistanceBias: 1.25,
        curiosity: 1.35,
        curiosityOrbit: 1.65,
        appetite: 1.18,
        restTendency: 0.38
      }
    ];

    return {
      sharedGeos,
      pectLPivot,
      pectRPivot,
      pelvLPivot,
      pelvRPivot,
      KOI_ARCHETYPES
    };
  }

  window.KoiModels = { createKoiModels };
})();
