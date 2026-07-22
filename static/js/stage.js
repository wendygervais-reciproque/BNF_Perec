// La scène : le canvas de la page générée et ses couches de fond.
//
// Trois choses se superposent à chaque image, du fond vers la surface :
//   1. la grille de trame (pré-rendue une fois hors écran) ;
//   2. le fond d'exergue des mots imposés, qui se révèle à la cristallisation ;
//   3. les particules, dessinées par le moteur (renderer.js).

import {
  CELL_SIZE, GRID_INTERVAL, DESIGN_WIDTH, DESIGN_HEIGHT,
  TEXT_MARGIN_CELLS, cssColor
} from './config.js';

export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas.getContext('2d');

const container = document.getElementById('right');

// La mise en page n'est pas toujours établie quand ce module s'exécute — la
// mesure retourne alors 0, et le moteur démarrerait sur un canvas vide sans
// jamais se redimensionner ensuite. D'où le repli sur la géométrie de la
// maquette.
const bounds = container.getBoundingClientRect();
canvas.width = Math.round(bounds.width) || DESIGN_WIDTH / 2;
canvas.height = Math.round(bounds.height) || DESIGN_HEIGHT;

// Hauteur du cadre visible : le canvas peut ensuite être agrandi au-delà pour
// contenir un texte trop long (il défile alors dans #canvas-scroll), et
// revenir à cette hauteur quand le texte suivant tient à l'écran.
export const viewportHeight = canvas.height;

// La marge du texte du canvas est arrondie à la trame ; la signature, qui est
// en HTML, doit s'y aligner exactement. On publie donc la valeur calculée en
// variable CSS plutôt que de la répéter dans la feuille de style.
document.documentElement.style.setProperty(
  '--canvas-margin-x', `${TEXT_MARGIN_CELLS * CELL_SIZE}px`
);

// ==========================================
// GRILLE DE FOND
// ==========================================
// Pré-rendue hors écran : la redessiner à chaque image coûterait un tracé de
// plusieurs centaines de lignes pour un fond immobile. Re-rendue seulement
// quand le canvas change de hauteur (cf. setCanvasHeight).
let gridCanvas = new OffscreenCanvas(canvas.width, canvas.height);
function renderGrid() {
  gridCanvas = new OffscreenCanvas(canvas.width, canvas.height);
  const gctx = gridCanvas.getContext('2d');
  const spacing = CELL_SIZE * GRID_INTERVAL;
  gctx.beginPath();
  gctx.strokeStyle = cssColor('--color-grid-canvas');
  gctx.lineWidth = 1;
  for (let x = spacing; x < canvas.width; x += spacing) {
    gctx.moveTo(x + 0.5, 0);
    gctx.lineTo(x + 0.5, canvas.height);
  }
  for (let y = spacing; y < canvas.height; y += spacing) {
    gctx.moveTo(0, y + 0.5);
    gctx.lineTo(canvas.width, y + 0.5);
  }
  gctx.stroke();
}
renderGrid();

// Ajuste la hauteur du canvas à celle qu'exige le texte courant (main.js), et
// remet la grille de fond à cette taille. Sans effet si la hauteur ne change
// pas — inutile de réallouer la grille hors écran à chaque génération.
export function setCanvasHeight(height) {
  if (height === canvas.height) return;
  canvas.height = height;
  renderGrid();
}

// ==========================================
// FOND D'EXERGUE
// ==========================================
// Les mots imposés reçoivent un aplat derrière eux. Les cellules concernées
// sont fournies par le compositeur de texte et regroupées en un seul Path2D :
// un appel de remplissage par image, quel que soit le nombre de mots.
const colorHighlightBg = cssColor('--color-anim-highlight-bg');
let highlightPath = new Path2D();
let hasHighlight = false;

export function setHighlightPixels(pixels) {
  highlightPath = new Path2D();
  hasHighlight = pixels.length > 0;
  for (const p of pixels) {
    highlightPath.rect(p.x * CELL_SIZE, p.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }
}

// Efface l'image précédente et repose la grille.
export function beginFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(gridCanvas, 0, 0);
}

// L'exergue apparaît au rythme de la cristallisation : invisible pendant que
// le texte se forme, pleine une fois qu'il est posé.
export function paintHighlight(progress) {
  if (!hasHighlight || progress <= 0) return;
  ctx.globalAlpha = progress;
  ctx.fillStyle = colorHighlightBg;
  ctx.fill(highlightPath);
  ctx.globalAlpha = 1.0;
}
