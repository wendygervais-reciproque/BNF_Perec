// État partagé de la simulation.
//
// Pourquoi un objet mutable plutôt que des `export let` : le moteur échange
// ses tampons à chaque pas (`ephemeralState` devient `nextEphemeralState` et
// réciproquement). Or les liaisons d'export ES sont en lecture seule pour les
// importateurs — seul le module propriétaire peut réassigner un `export let`.
// Un objet partagé lève cette limite : toutes les phases de la boucle
// (physics, plasma, renderer) lisent et écrivent le même S.
//
// Coût : un accès propriété par lecture. Dans les boucles chaudes — l'automate
// de Conway parcourt la fenêtre active à chaque pas — les tableaux doivent
// donc être extraits dans des locales à l'entrée de la fonction, jamais lus
// via S au cœur d'une boucle imbriquée.

export const S = {
  // ===== Géométrie de la grille =====
  cols: 0,
  rows: 0,
  cellSize: 3,

  // ===== Horloge et régime =====
  time: 0,
  currentMode: 'CHAOS',   // 'CHAOS' | 'FORMATION'
  globalInertia: 1.0,     // 0 → 1 : monte pendant la formation, dose la part
                          // de particules autorisées à bouger à chaque pas

  // ===== Entités =====
  blocks: [],
  particles: [],

  // ===== Plasma : grilles 1D, index = y * cols + x =====
  ephemeralState: null,       // Uint8Array   0 ou 1
  ephemeralOpacity: null,     // Float32Array
  ephemeralHeat: null,        // Float32Array
  nextEphemeralState: null,   // Uint8Array
  nextEphemeralOpacity: null, // Float32Array
  nextEphemeralHeat: null,    // Float32Array
  aliveGrid: null,            // Uint8Array   voisinage de Conway du pas courant

  // ===== Compteurs et fenêtre de travail =====
  lastFramePlasmaCount: 0,  // sert au quota : lu au pas suivant pour brider
                            // la natalité si le plasma dépasse maxPlasmaCells
  framePlasmaCount: 0,      // accumulé pendant le pas courant
  plasmaHealth: 1.0,        // 1 = pas de bridage ; calculé par Conway,
                            // consommé par les injections
  activeBox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },

  // Construite en fin d'update(), consommée par le rendu — évite de rebalayer
  // la fenêtre active une fois par passe de couleur
  visibleCells: [],

  // 0 → 1 une fois le texte formé : éteint le plasma et révèle l'exergue
  crystallizationProgress: 0.0,
};

// Alloue les grilles pour une taille de canvas donnée. Appelée au démarrage et
// à chaque changement de dimensions ; remet la fenêtre active au plein cadre.
export function allocateGrids(canvasWidth, canvasHeight, mainCellSize) {
  if (mainCellSize) S.cellSize = mainCellSize;
  S.cols = Math.floor(canvasWidth / S.cellSize);
  S.rows = Math.floor(canvasHeight / S.cellSize);

  const size = S.rows * S.cols;
  S.ephemeralState = new Uint8Array(size);
  S.ephemeralOpacity = new Float32Array(size);
  S.ephemeralHeat = new Float32Array(size);
  S.nextEphemeralState = new Uint8Array(size);
  S.nextEphemeralOpacity = new Float32Array(size);
  S.nextEphemeralHeat = new Float32Array(size);
  S.aliveGrid = new Uint8Array(size);
  S.visibleCells.length = 0;

  S.activeBox = { minX: 0, maxX: S.cols - 1, minY: 0, maxY: S.rows - 1 };
  return { cols: S.cols, rows: S.rows };
}

// Remet la simulation à zéro sans réallouer les grilles.
export function resetState() {
  S.blocks = [];
  S.particles = [];
  S.currentMode = 'CHAOS';
  S.time = 0;
  S.globalInertia = 1.0;
  S.lastFramePlasmaCount = 0;
  S.framePlasmaCount = 0;
  S.plasmaHealth = 1.0;
  S.crystallizationProgress = 0.0;
  S.ephemeralState.fill(0);
  S.ephemeralOpacity.fill(0);
  S.ephemeralHeat.fill(0);
  S.nextEphemeralState.fill(0);
  S.nextEphemeralOpacity.fill(0);
  S.nextEphemeralHeat.fill(0);
  S.visibleCells.length = 0;
}
