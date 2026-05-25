import * as TextManager from '/scripts/textManager.js';
import * as Algo from '/scripts/algo_block.js';
import { ControlPanel } from '/scripts/control_panel.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('right');

canvas.width = container.clientWidth;
canvas.height = container.clientHeight;

// ==========================================
// 1. INVARIANTS ET PARAMÈTRES
// ==========================================
const cellSize = 3;
const colorHighlightBg = '#15b1b1f6';
let currentHighlightBgPixels = [];
let highlightBgPath = new Path2D();

const formationSpeedMultiplier = 0.4;
const maxClusterSize = 3;

// ==========================================
// CONFIGURATION DE LA GRILLE
// Modifier ces 3 valeurs pour ajuster les deux grilles simultanément.
// ==========================================
const gridInterval   = 8;                             // nombre de cellules entre chaque ligne de grille
const lineGap        = 6;                              // lignes de grille vides entre les lignes de texte (0, gridInterval, 2*gridInterval…)
const gridColorLeft  = 'rgba(18, 19, 23, 0.06)';      // couleur des lignes — page gauche
const gridColorRight = 'rgba(255, 255, 255, 0.06)';   // couleur des lignes — canvas (page droite)

// Propagation au CSS pour la grille de la page gauche
document.documentElement.style.setProperty('--grid-spacing',    `${cellSize * gridInterval}px`);
document.documentElement.style.setProperty('--grid-color-left', gridColorLeft);

let pendingText = null;

const controlPanel = new ControlPanel();

// ==========================================
// 2. MACHINE À ÉTATS
// ==========================================
const STATE_CHAOS = 0;
const STATE_FORMING = 1;
const STATE_IDLE = 2;

let currentState = STATE_CHAOS;
let lastTime = 0;

// ==========================================
// 3. LA BOUCLE D'ANIMATION
// ==========================================
// Grille pré-rendue une seule fois sur un canvas hors-écran
const gridCanvas = new OffscreenCanvas(canvas.width, canvas.height);
(function () {
  const gctx = gridCanvas.getContext('2d');
  const spacing = cellSize * gridInterval;
  gctx.beginPath();
  gctx.strokeStyle = gridColorRight;
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
}());

function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (dt > 0.1) dt = 0.1;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(gridCanvas, 0, 0);

  if (currentState === STATE_CHAOS) {
    if (pendingText !== null) {
      let dims = Algo.getGridDimensions(canvas.width, canvas.height, cellSize);
      let coords = TextManager.getCoordinates(pendingText, dims.cols, dims.rows, gridInterval, lineGap);
      currentHighlightBgPixels = coords.highlightBgPixels;
      highlightBgPath = new Path2D();
      for (const bp of currentHighlightBgPixels) {
        highlightBgPath.rect(bp.x * cellSize, bp.y * cellSize, cellSize, cellSize);
      }
      Algo.startFormation(coords.textPixels);
      pendingText = null;
      currentState = STATE_FORMING;
    }
  } else if (currentState === STATE_FORMING) {
    if (Algo.isTextFullyFormed()) {
      currentState = STATE_IDLE;
    }
  }

  if (currentState === STATE_FORMING || currentState === STATE_IDLE) {
    if (currentHighlightBgPixels.length > 0 && Algo.crystallizationProgress > 0) {
      ctx.globalAlpha = Algo.crystallizationProgress;
      ctx.fillStyle = colorHighlightBg;
      ctx.fill(highlightBgPath);
      ctx.globalAlpha = 1.0;
    }
  }

  Algo.update(dt, formationSpeedMultiplier);
  Algo.draw(ctx);
  controlPanel.update();

  requestAnimationFrame(animate);
}

// ==========================================
// 4. CHARGEMENT DES CONTRAINTES
// ==========================================
const { contraintes } = await (await fetch('/textes.json')).json();

function applyKeywordHighlighting(text, contexte) {
  if (!contexte) return text;
  const keywords = contexte.split(',').map(k => k.trim()).filter(k => k.length > 0);
  keywords.sort((a, b) => b.length - a.length);
  let result = text;
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), match => `*${match}*`);
  }
  return result;
}

// ==========================================
// 5. LES BOUTONS
// ==========================================
const constraintButtons = document.querySelectorAll('.btn-contrainte');
const btnShow = document.getElementById('btn-show');
let selectedText = null;

constraintButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    constraintButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const id = btn.dataset.id;
    const contrainte = contraintes.find(c => c.id === id);
    let text = contrainte.texte;
    if (id === 'forcage' || id === 'homosemantique') {
      text = applyKeywordHighlighting(text, contrainte.contexte);
    }
    selectedText = text;

    if (currentState !== STATE_CHAOS) {
      Algo.startChaos();
      currentState = STATE_CHAOS;
    }
    pendingText = null;

    if (btnShow) btnShow.disabled = false;
  });
});

if (btnShow) {
  btnShow.addEventListener('click', () => {
    pendingText = selectedText;
    btnShow.disabled = true;
  });
}

const btnHelp = document.getElementById('btn-help');
const helpPanel = document.getElementById('help-panel');

if (btnHelp && helpPanel) {
  btnHelp.addEventListener('click', () => {
    const isOpen = helpPanel.classList.toggle('open');
    btnHelp.classList.toggle('active', isOpen);
    btnHelp.textContent = isOpen ? '×' : '?';
  });
}

// LANCEMENT INITIAL
Algo.getGridDimensions(canvas.width, canvas.height, cellSize);
Algo.init();
requestAnimationFrame(animate);

// Snap du texte gauche sur la grille — s'exécute après le premier rendu
requestAnimationFrame(() => requestAnimationFrame(() => {
  const textEl = document.querySelector('.text-content-original');
  const leftEl  = document.getElementById('left');
  if (!textEl || !leftEl) return;

  const spacing     = cellSize * gridInterval;
  const cs          = getComputedStyle(textEl);
  // Demi-interlignage : espace vide entre le haut de la line box et le haut de l'em box
  const halfLeading = Math.max(0, (parseFloat(cs.lineHeight) - parseFloat(cs.fontSize)) / 2);

  // On snappe le haut de l'em box (là où l'encre commence) plutôt que le haut de la line box
  const delta     = textEl.getBoundingClientRect().top - leftEl.getBoundingClientRect().top;
  const inkTop    = delta + halfLeading;
  const remainder = ((inkTop % spacing) + spacing) % spacing;
  const snap      = remainder < spacing / 2 ? -remainder : spacing - remainder;
  textEl.style.transform = `translateY(${snap}px)`;
}));
