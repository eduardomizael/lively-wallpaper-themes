(() => {
  'use strict';

  window.ZodiacRegistry = window.ZodiacRegistry || [];

  // Coordenadas normalizadas reais de Scorpius (visão sul, RA crescente para a esquerda)
  // Antares (α) no coração; coroa/garras à direita; cauda em "J" varrendo para baixo e esquerda até Shaula/Lesath.
  const STARS = [
    { id: 'nu',      name: 'Jabbah',     x:  0.60, y: -0.66, mag: 4.00, color: '#cfe0ff' },
    { id: 'beta',    name: 'Acrab',      x:  0.71, y: -0.62, mag: 2.62, color: '#d5e4ff' },
    { id: 'delta',   name: 'Dschubba',   x:  0.78, y: -0.45, mag: 2.32, color: '#cce0ff' },
    { id: 'pi',      name: 'Fang',       x:  0.80, y: -0.24, mag: 2.89, color: '#d4e4ff' },
    { id: 'rho',     name: 'Iklil',      x:  0.82, y: -0.06, mag: 3.86, color: '#d8e6ff' },
    { id: 'sigma',   name: 'Alniyat',    x:  0.48, y: -0.30, mag: 2.89, color: '#dce8ff' },
    { id: 'alpha',   name: 'Antares',    x:  0.36, y: -0.24, mag: 0.96, color: '#ff9d6e', hero: true },
    { id: 'tau',     name: 'Paikauhale', x:  0.26, y: -0.13, mag: 2.82, color: '#cfe2ff' },
    { id: 'epsilon', name: 'Larawag',    x:  0.07, y:  0.17, mag: 2.29, color: '#ffd8a8' },
    { id: 'mu1',     name: 'Xamidimura', x:  0.03, y:  0.38, mag: 3.00, color: '#d6e5ff' },
    { id: 'zeta2',   name: 'Zeta Sco',   x: -0.01, y:  0.60, mag: 3.62, color: '#ffd2a1' },
    { id: 'eta',     name: 'Eta Sco',    x: -0.25, y:  0.65, mag: 3.33, color: '#fff0d2' },
    { id: 'theta',   name: 'Sargas',     x: -0.60, y:  0.63, mag: 1.87, color: '#fff1cc' },
    { id: 'iota1',   name: 'Iota Sco',   x: -0.75, y:  0.47, mag: 3.03, color: '#fff3d6' },
    { id: 'kappa',   name: 'Girtab',     x: -0.68, y:  0.40, mag: 2.41, color: '#d4e4ff' },
    { id: 'lambda',  name: 'Shaula',     x: -0.55, y:  0.30, mag: 1.63, color: '#cbe0ff', hero: true },
    { id: 'upsilon', name: 'Lesath',     x: -0.50, y:  0.32, mag: 2.69, color: '#cfe2ff' }
  ];

  const EDGES = [
    ['nu', 'beta'],
    ['beta', 'delta'],
    ['delta', 'pi'],
    ['pi', 'rho'],
    ['delta', 'sigma'],
    ['sigma', 'alpha'],
    ['alpha', 'tau'],
    ['tau', 'epsilon'],
    ['epsilon', 'mu1'],
    ['mu1', 'zeta2'],
    ['zeta2', 'eta'],
    ['eta', 'theta'],
    ['theta', 'iota1'],
    ['iota1', 'kappa'],
    ['kappa', 'lambda'],
    ['lambda', 'upsilon']
  ];

  window.ZodiacRegistry.push({
    id: 'scorpius',
    name: 'Scorpius',
    namePt: 'Escorpião',
    symbol: '♏',
    anchor: { x: 0.50, y: 0.51 },
    scaleFactor: 0.36,
    labelOffset: { x: -0.04, y: -0.02 },
    artImage: 'assets/scorpius.png',
    artRect: { x: -0.90, y: -0.86, w: 1.98, h: 1.72 },
    stars: STARS,
    edges: EDGES
  });
})();
