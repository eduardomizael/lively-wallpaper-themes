(() => {
  'use strict';

  window.ZodiacRegistry = window.ZodiacRegistry || [];

  const ZODIAC_ELEVEN = [
    // 1. ÁRIES (Aries) — Carneiro saltando para cima-direita
    {
      id: 'aries',
      name: 'Aries',
      namePt: 'Áries',
      symbol: '♈',
      anchor: { x: 0.13, y: 0.21 },
      scaleFactor: 0.145,
      labelOffset: { x: 0.0, y: 0.88 },
      artImage: 'assets/aries.png',
      artRect: { x: -0.94, y: -0.94, w: 1.88, h: 1.88 },
      stars: [
        { id: 'hamal',    name: 'Hamal',    x:  0.34, y: -0.44, mag: 2.00, color: '#ffd2a1', hero: true },
        { id: 'sheratan', name: 'Sheratan', x:  0.64, y: -0.28, mag: 2.64, color: '#dce8ff', hero: true },
        { id: 'mesarthim',name: 'Mesarthim',x:  0.72, y: -0.14, mag: 3.88, color: '#d4e4ff' },
        { id: 'botein',   name: 'Botein',   x: -0.22, y: -0.12, mag: 4.35, color: '#ffd9ad' },
        { id: 'c41',      name: 'Bharani',  x: -0.58, y: -0.34, mag: 3.61, color: '#cfe2ff' },
        { id: 'delta',    name: 'Delta Ari',x: -0.62, y:  0.22, mag: 4.35, color: '#ffe1b8' }
      ],
      edges: [
        ['c41', 'hamal'],
        ['hamal', 'sheratan'],
        ['sheratan', 'mesarthim'],
        ['hamal', 'botein'],
        ['botein', 'delta']
      ]
    },

    // 2. TOURO (Taurus) — Touro avançando para cima-esquerda (Aldebaran no olho, chifres em Elnath e Tianguan)
    {
      id: 'taurus',
      name: 'Taurus',
      namePt: 'Touro',
      symbol: '♉',
      anchor: { x: 0.37, y: 0.22 },
      scaleFactor: 0.155,
      labelOffset: { x: 0.05, y: 0.90 },
      artImage: 'assets/taurus.png',
      artRect: { x: -0.95, y: -0.95, w: 1.90, h: 1.90 },
      stars: [
        { id: 'elnath',    name: 'Elnath',    x: -0.78, y: -0.66, mag: 1.65, color: '#cfe2ff', hero: true },
        { id: 'zeta',      name: 'Tianguan',  x: -0.76, y: -0.20, mag: 3.00, color: '#d4e4ff' },
        { id: 'aldebaran', name: 'Aldebaran', x: -0.14, y: -0.06, mag: 0.85, color: '#ffa870', hero: true },
        { id: 'ain',       name: 'Ain',       x: -0.04, y: -0.24, mag: 3.53, color: '#ffd4a3' },
        { id: 'hyadum1',   name: 'Hyadum I',  x:  0.14, y: -0.04, mag: 3.65, color: '#ffdcb0' },
        { id: 'theta',     name: 'Chamukuy',  x: -0.06, y:  0.08, mag: 3.40, color: '#fff0d4' },
        { id: 'lambda',    name: 'Lambda Tau',x:  0.34, y:  0.30, mag: 3.47, color: '#d4e4ff' },
        { id: 'omicron',   name: 'Omicron',   x:  0.58, y:  0.48, mag: 3.61, color: '#ffe4be' },
        { id: 'alcyone',   name: 'Alcyone',   x:  0.48, y: -0.46, mag: 2.87, color: '#c8dfff' }
      ],
      edges: [
        ['elnath', 'ain'],
        ['ain', 'hyadum1'],
        ['hyadum1', 'theta'],
        ['theta', 'aldebaran'],
        ['aldebaran', 'zeta'],
        ['hyadum1', 'lambda'],
        ['lambda', 'omicron'],
        ['ain', 'alcyone']
      ]
    },

    // 3. GÊMEOS (Gemini) — Castor e Pólux lado a lado
    {
      id: 'gemini',
      name: 'Gemini',
      namePt: 'Gêmeos',
      symbol: '♊',
      anchor: { x: 0.62, y: 0.21 },
      scaleFactor: 0.15,
      labelOffset: { x: 0.0, y: 0.92 },
      artImage: 'assets/gemini.png',
      artRect: { x: -0.93, y: -0.93, w: 1.86, h: 1.86 },
      stars: [
        { id: 'castor',  name: 'Castor',  x: -0.26, y: -0.68, mag: 1.58, color: '#e6f0ff', hero: true },
        { id: 'pollux',  name: 'Pólux',   x:  0.24, y: -0.62, mag: 1.14, color: '#ffd29e', hero: true },
        { id: 'tau',     name: 'Tau Gem', x: -0.32, y: -0.36, mag: 4.41, color: '#ffd9b0' },
        { id: 'upsilon', name: 'Upsilon', x:  0.14, y: -0.30, mag: 4.06, color: '#ffc999' },
        { id: 'mebsuta', name: 'Mebsuta', x: -0.44, y:  0.02, mag: 3.06, color: '#ffe2b8' },
        { id: 'wasat',   name: 'Wasat',   x:  0.18, y:  0.06, mag: 3.53, color: '#fff3db' },
        { id: 'mekbuda', name: 'Mekbuda', x:  0.16, y:  0.34, mag: 3.79, color: '#ffebb8' },
        { id: 'tejat',   name: 'Tejat',   x: -0.46, y:  0.54, mag: 2.88, color: '#ffb88c' },
        { id: 'alhena',  name: 'Alhena',  x:  0.28, y:  0.64, mag: 1.93, color: '#e2ecff', hero: true },
        { id: 'xi',      name: 'Alzirr',  x:  0.46, y:  0.58, mag: 3.36, color: '#fff1d4' }
      ],
      edges: [
        ['castor', 'tau'],
        ['tau', 'mebsuta'],
        ['mebsuta', 'tejat'],
        ['pollux', 'upsilon'],
        ['upsilon', 'wasat'],
        ['wasat', 'mekbuda'],
        ['mekbuda', 'alhena'],
        ['wasat', 'xi'],
        ['tau', 'upsilon']
      ]
    },

    // 4. CÂNCER (Cancer) — Caranguejo em vista superior
    {
      id: 'cancer',
      name: 'Cancer',
      namePt: 'Câncer',
      symbol: '♋',
      anchor: { x: 0.86, y: 0.21 },
      scaleFactor: 0.14,
      labelOffset: { x: 0.0, y: 0.88 },
      artImage: 'assets/cancer.png',
      artRect: { x: -0.94, y: -0.94, w: 1.88, h: 1.88 },
      stars: [
        { id: 'iota',    name: 'Iota Cnc',          x: -0.22, y: -0.68, mag: 4.02, color: '#ffe0b4' },
        { id: 'asellusN',name: 'Asellus Borealis',  x: -0.06, y: -0.22, mag: 4.66, color: '#dce8ff' },
        { id: 'asellusS',name: 'Asellus Australis', x:  0.04, y:  0.04, mag: 3.94, color: '#ffd5a6', hero: true },
        { id: 'acubens', name: 'Acubens',           x: -0.44, y:  0.56, mag: 4.25, color: '#e4eeff', hero: true },
        { id: 'altarf',  name: 'Altarf',            x:  0.52, y:  0.52, mag: 3.52, color: '#ffc294' }
      ],
      edges: [
        ['iota', 'asellusN'],
        ['asellusN', 'asellusS'],
        ['asellusS', 'acubens'],
        ['asellusS', 'altarf']
      ]
    },

    // 5. LEÃO (Leo) — Leão caminhando para a esquerda (Foice na cabeça, Regulus no coração, Denebola na cauda)
    {
      id: 'leo',
      name: 'Leo',
      namePt: 'Leão',
      symbol: '♌',
      anchor: { x: 0.15, y: 0.51 },
      scaleFactor: 0.16,
      labelOffset: { x: 0.04, y: 0.84 },
      artImage: 'assets/leo.png',
      artRect: { x: -0.96, y: -0.96, w: 1.92, h: 1.92 },
      stars: [
        { id: 'algenubi', name: 'Algenubi', x: -0.70, y: -0.34, mag: 2.98, color: '#ffe3b8' },
        { id: 'rasalas',  name: 'Rasalas',  x: -0.54, y: -0.56, mag: 3.88, color: '#ffd1a0' },
        { id: 'adhafera', name: 'Adhafera', x: -0.34, y: -0.48, mag: 3.44, color: '#fff1d6' },
        { id: 'algieba',  name: 'Algieba',  x: -0.30, y: -0.22, mag: 2.08, color: '#ffd098', hero: true },
        { id: 'eta',      name: 'Eta Leo',  x: -0.38, y:  0.04, mag: 3.52, color: '#e6f0ff' },
        { id: 'regulus',  name: 'Regulus',  x: -0.34, y:  0.34, mag: 1.35, color: '#cce0ff', hero: true },
        { id: 'zosma',    name: 'Zosma',    x:  0.34, y: -0.18, mag: 2.56, color: '#e6f0ff' },
        { id: 'chertan',  name: 'Chertan',  x:  0.32, y:  0.22, mag: 3.33, color: '#e8f0ff' },
        { id: 'denebola', name: 'Denebola', x:  0.80, y:  0.08, mag: 2.14, color: '#e4eeff', hero: true }
      ],
      edges: [
        ['algenubi', 'rasalas'],
        ['rasalas', 'adhafera'],
        ['adhafera', 'algieba'],
        ['algieba', 'eta'],
        ['eta', 'regulus'],
        ['algieba', 'zosma'],
        ['zosma', 'denebola'],
        ['denebola', 'chertan'],
        ['chertan', 'regulus'],
        ['zosma', 'chertan']
      ]
    },

    // 6. VIRGEM (Virgo) — Donzela alada flutuando para a esquerda (Spica na espiga de trigo)
    {
      id: 'virgo',
      name: 'Virgo',
      namePt: 'Virgem',
      symbol: '♍',
      anchor: { x: 0.40, y: 0.52 },
      scaleFactor: 0.16,
      labelOffset: { x: 0.0, y: 0.86 },
      artImage: 'assets/virgo.png',
      artRect: { x: -0.95, y: -0.95, w: 1.90, h: 1.90 },
      stars: [
        { id: 'vindemiatrix', name: 'Vindemiatrix', x:  0.18, y: -0.58, mag: 2.83, color: '#ffe4b8' },
        { id: 'auva',         name: 'Minelauva',    x:  0.04, y: -0.22, mag: 3.38, color: '#ffb98c' },
        { id: 'porrima',      name: 'Porrima',      x: -0.18, y:  0.02, mag: 2.74, color: '#fff3dc' },
        { id: 'zaniah',       name: 'Zaniah',       x: -0.44, y: -0.06, mag: 3.89, color: '#e6f0ff' },
        { id: 'zavijava',     name: 'Zavijava',     x: -0.74, y: -0.16, mag: 3.61, color: '#fff1d4' },
        { id: 'spica',        name: 'Spica',        x: -0.24, y:  0.54, mag: 0.97, color: '#c4dcff', hero: true },
        { id: 'heze',         name: 'Heze',         x:  0.24, y:  0.04, mag: 3.37, color: '#e4eeff' },
        { id: 'syrma',        name: 'Syrma',        x:  0.60, y:  0.32, mag: 4.08, color: '#fff0d2' },
        { id: 'mu',           name: 'Rijl al Awwa', x:  0.76, y:  0.14, mag: 3.88, color: '#fff2d8' }
      ],
      edges: [
        ['vindemiatrix', 'auva'],
        ['auva', 'porrima'],
        ['porrima', 'zaniah'],
        ['zaniah', 'zavijava'],
        ['porrima', 'spica'],
        ['auva', 'heze'],
        ['heze', 'spica'],
        ['heze', 'syrma'],
        ['syrma', 'mu']
      ]
    },

    // 7. LIBRA (Libra) — Balança celestial clássica
    {
      id: 'libra',
      name: 'Libra',
      namePt: 'Libra',
      symbol: '♎',
      anchor: { x: 0.63, y: 0.51 },
      scaleFactor: 0.14,
      labelOffset: { x: 0.0, y: 0.90 },
      artImage: 'assets/libra.png',
      artRect: { x: -0.92, y: -0.92, w: 1.84, h: 1.84 },
      stars: [
        { id: 'zubeneschamali', name: 'Zubeneschamali', x:  0.00, y: -0.60, mag: 2.61, color: '#d4ecff', hero: true },
        { id: 'zubenelgenubi',  name: 'Zubenelgenubi',  x:  0.52, y: -0.06, mag: 2.75, color: '#e6f0ff', hero: true },
        { id: 'zubenelhakrabi', name: 'Zubenelhakrabi', x: -0.50, y: -0.10, mag: 3.91, color: '#ffe1b4' },
        { id: 'brachium',       name: 'Brachium',       x:  0.34, y:  0.58, mag: 3.29, color: '#ffb588' },
        { id: 'upsilon',        name: 'Upsilon Lib',    x: -0.46, y:  0.46, mag: 3.60, color: '#ffd09c' }
      ],
      edges: [
        ['zubeneschamali', 'zubenelgenubi'],
        ['zubeneschamali', 'zubenelhakrabi'],
        ['zubenelgenubi', 'zubenelhakrabi'],
        ['zubenelgenubi', 'brachium'],
        ['zubenelhakrabi', 'upsilon']
      ]
    },

    // 9. SAGITÁRIO (Sagittarius) — Centauro arqueiro apontando para a direita (Bule / Arco)
    {
      id: 'sagittarius',
      name: 'Sagittarius',
      namePt: 'Sagitário',
      symbol: '♐',
      anchor: { x: 0.15, y: 0.81 },
      scaleFactor: 0.155,
      labelOffset: { x: 0.0, y: 0.86 },
      artImage: 'assets/sagittarius.svg',
      artRect: { x: -0.96, y: -0.96, w: 1.92, h: 1.92 },
      stars: [
        { id: 'kausB',   name: 'Kaus Borealis',  x:  0.44, y: -0.58, mag: 2.81, color: '#ffd5a2' },
        { id: 'kausM',   name: 'Kaus Media',     x:  0.42, y: -0.14, mag: 2.70, color: '#ffc896' },
        { id: 'alnasl',  name: 'Alnasl',         x:  0.76, y: -0.16, mag: 2.99, color: '#ffd4a4' },
        { id: 'kausA',   name: 'Kaus Australis', x:  0.42, y:  0.36, mag: 1.85, color: '#cfe2ff', hero: true },
        { id: 'ascella', name: 'Ascella',        x:  0.02, y:  0.22, mag: 2.60, color: '#e4eeff' },
        { id: 'phi',     name: 'Phi Sgr',        x:  0.04, y: -0.16, mag: 3.17, color: '#d4e4ff' },
        { id: 'nunki',   name: 'Nunki',          x: -0.24, y: -0.26, mag: 2.05, color: '#cbe0ff', hero: true },
        { id: 'tau',     name: 'Tau Sgr',        x: -0.32, y:  0.14, mag: 3.32, color: '#ffd4a2' },
        { id: 'arkab',   name: 'Arkab',          x: -0.66, y:  0.54, mag: 3.96, color: '#d8e6ff' }
      ],
      edges: [
        ['kausB', 'kausM'],
        ['kausM', 'kausA'],
        ['kausM', 'alnasl'],
        ['kausB', 'phi'],
        ['phi', 'kausM'],
        ['phi', 'ascella'],
        ['ascella', 'kausA'],
        ['phi', 'nunki'],
        ['nunki', 'tau'],
        ['tau', 'ascella'],
        ['tau', 'arkab']
      ]
    },

    // 10. CAPRICÓRNIO (Capricornus) — Cabra-marinha saltando para a direita
    {
      id: 'capricornus',
      name: 'Capricornus',
      namePt: 'Capricórnio',
      symbol: '♑',
      anchor: { x: 0.39, y: 0.80 },
      scaleFactor: 0.15,
      labelOffset: { x: 0.0, y: 0.84 },
      artImage: 'assets/capricornus.png',
      artRect: { x: -0.94, y: -0.94, w: 1.88, h: 1.88 },
      stars: [
        { id: 'algedi',   name: 'Algedi',        x:  0.66, y: -0.56, mag: 3.57, color: '#ffe4b8' },
        { id: 'dabih',    name: 'Dabih',         x:  0.58, y: -0.34, mag: 3.08, color: '#ffe6be', hero: true },
        { id: 'nashira',  name: 'Nashira',       x: -0.52, y: -0.22, mag: 3.68, color: '#e8f0ff' },
        { id: 'denebAlg', name: 'Deneb Algedi',  x: -0.72, y: -0.26, mag: 2.85, color: '#e4eeff', hero: true },
        { id: 'omega',    name: 'Omega Cap',     x:  0.22, y:  0.56, mag: 4.12, color: '#ffb88c' },
        { id: 'zeta',     name: 'Marakk',        x: -0.28, y:  0.34, mag: 3.74, color: '#ffe4b8' },
        { id: 'theta',    name: 'Dorsum',        x:  0.04, y: -0.14, mag: 4.07, color: '#dce8ff' }
      ],
      edges: [
        ['algedi', 'dabih'],
        ['dabih', 'theta'],
        ['theta', 'nashira'],
        ['nashira', 'denebAlg'],
        ['denebAlg', 'zeta'],
        ['zeta', 'omega'],
        ['omega', 'dabih']
      ]
    },

    // 11. AQUÁRIO (Aquarius) — Aguadeiro derramando o fluxo para baixo-esquerda
    {
      id: 'aquarius',
      name: 'Aquarius',
      namePt: 'Aquário',
      symbol: '♒',
      anchor: { x: 0.63, y: 0.80 },
      scaleFactor: 0.155,
      labelOffset: { x: 0.04, y: 0.86 },
      artImage: 'assets/aquarius.svg',
      artRect: { x: -0.94, y: -0.94, w: 1.88, h: 1.88 },
      stars: [
        { id: 'sadalmelik', name: 'Sadalmelik', x:  0.02, y: -0.46, mag: 2.95, color: '#ffe6bc', hero: true },
        { id: 'sadalsuud',  name: 'Sadalsuud',  x:  0.46, y: -0.28, mag: 2.90, color: '#ffe8c2', hero: true },
        { id: 'albali',     name: 'Albali',     x:  0.76, y: -0.16, mag: 3.77, color: '#dce8ff' },
        { id: 'sadachbia',  name: 'Sadachbia',  x: -0.26, y: -0.36, mag: 3.84, color: '#e2ecff' },
        { id: 'zeta',       name: 'Zeta Aqr',   x: -0.34, y: -0.24, mag: 3.65, color: '#fff1d4' },
        { id: 'skat',       name: 'Skat',       x: -0.48, y:  0.34, mag: 3.27, color: '#e4eeff' },
        { id: 'psi',        name: 'Psi Aqr',    x: -0.68, y:  0.56, mag: 4.21, color: '#ffd8aa' },
        { id: 'tau',        name: 'Tau Aqr',    x: -0.10, y:  0.44, mag: 4.05, color: '#ffb98c' }
      ],
      edges: [
        ['albali', 'sadalsuud'],
        ['sadalsuud', 'sadalmelik'],
        ['sadalmelik', 'sadachbia'],
        ['sadachbia', 'zeta'],
        ['zeta', 'skat'],
        ['skat', 'psi'],
        ['sadalmelik', 'tau']
      ]
    },

    // 12. PEIXES (Pisces) — Dois peixes unidos pelo cordão em V em Alrescha
    {
      id: 'pisces',
      name: 'Pisces',
      namePt: 'Peixes',
      symbol: '♓',
      anchor: { x: 0.86, y: 0.81 },
      scaleFactor: 0.15,
      labelOffset: { x: 0.0, y: 0.86 },
      artImage: 'assets/pisces.png',
      artRect: { x: -0.94, y: -0.94, w: 1.88, h: 1.88 },
      stars: [
        { id: 'alrescha', name: 'Alrescha', x:  0.48, y:  0.48, mag: 3.82, color: '#dce8ff', hero: true },
        { id: 'nu',       name: 'Nu Psc',   x:  0.22, y:  0.36, mag: 4.44, color: '#ffd2a0' },
        { id: 'omega',    name: 'Omega Psc',x: -0.26, y:  0.14, mag: 4.03, color: '#fff2d8' },
        { id: 'gamma',    name: 'Gamma Psc',x: -0.68, y:  0.04, mag: 3.70, color: '#ffe1b6' },
        { id: 'kappa',    name: 'Kappa Psc',x: -0.58, y:  0.26, mag: 4.94, color: '#dce8ff' },
        { id: 'iota',     name: 'Iota Psc', x: -0.42, y: -0.06, mag: 4.13, color: '#fff0d4' },
        { id: 'omicron',  name: 'Torcular', x:  0.44, y:  0.04, mag: 4.26, color: '#ffe0b4' },
        { id: 'eta',      name: 'Alpherg',  x:  0.36, y: -0.34, mag: 3.62, color: '#ffe4b8', hero: true },
        { id: 'tau',      name: 'Tau Psc',  x:  0.48, y: -0.62, mag: 4.51, color: '#ffd5a4' }
      ],
      edges: [
        ['alrescha', 'nu'],
        ['nu', 'omega'],
        ['omega', 'iota'],
        ['iota', 'gamma'],
        ['gamma', 'kappa'],
        ['kappa', 'omega'],
        ['alrescha', 'omicron'],
        ['omicron', 'eta'],
        ['eta', 'tau']
      ]
    }
  ];

  for (const c of ZODIAC_ELEVEN) window.ZodiacRegistry.push(c);
})();
