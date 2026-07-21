import * as TextManager from '/js/engine/textManager.js';
import * as Algo from '/js/engine/algo_block.js';
import { ControlPanel } from '/js/engine/control_panel.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('right');

// Géométrie de la maquette : l'application est calibrée pour un écran de
// borne 1920×1080, la page générée en occupe la moitié droite.
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

// La mise en page n'est pas toujours établie quand ce module s'exécute — la
// mesure retourne alors 0 et le moteur démarrerait sur un canvas vide, sans
// jamais se redimensionner ensuite. D'où le repli sur la géométrie de la
// maquette.
const bounds = container.getBoundingClientRect();
canvas.width = Math.round(bounds.width) || DESIGN_WIDTH / 2;
canvas.height = Math.round(bounds.height) || DESIGN_HEIGHT;

// ==========================================
// 1. INVARIANTS ET PARAMÈTRES
// ==========================================
// Les couleurs sont définies dans static/css/style.css (:root) — source unique.
const rootStyles = getComputedStyle(document.documentElement);
const cssColor = name => rootStyles.getPropertyValue(name).trim();

const cellSize = 3;
const colorHighlightBg = cssColor('--color-anim-highlight-bg');   // exergue des mots sur le canvas
let currentHighlightBgPixels = [];
let highlightBgPath = new Path2D();

const formationSpeedMultiplier = 0.4;
const maxClusterSize = 3;

// ==========================================
// CONFIGURATION DE LA GRILLE
// La grille reste la trame de composition du texte du canvas ; la maquette
// ne la donne plus à voir (--color-grid-canvas transparent dans style.css),
// remonter son alpha suffit à la réafficher.
// ==========================================
const gridInterval   = 8;                                    // nombre de cellules entre chaque ligne de grille
const lineGap        = 6;                                    // lignes de grille vides entre les lignes de texte (0, gridInterval, 2*gridInterval…)
const gridColorRight = cssColor('--color-grid-canvas');      // couleur des lignes — canvas (page droite)

let pendingText = null;
let pendingVariable = null;   // paramètre du cartouche, gardé jusqu'à ce que le texte soit formé

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
      let coords = TextManager.getCoordinates(pendingText, dims.cols, dims.rows, gridInterval, lineGap, textOffsetRows, textMarginCells);
      currentHighlightBgPixels = coords.highlightBgPixels;
      highlightBgPath = new Path2D();
      for (const bp of currentHighlightBgPixels) {
        highlightBgPath.rect(bp.x * cellSize, bp.y * cellSize, cellSize, cellSize);
      }
      placeTextIteration(coords.textPixels);
      Algo.startFormation(coords.textPixels);
      pendingText = null;
      currentState = STATE_FORMING;
    }
  } else if (currentState === STATE_FORMING) {
    if (Algo.isTextFullyFormed()) {
      currentState = STATE_IDLE;
      setGeneratingButton(null);             // le texte a fini d'apparaître : déverrouillage
      showTextIteration();                   // sa signature revient en fondu
      setConstraintBadge(pendingVariable);   // et le cartouche descend du haut de l'écran
      resetIdleTimer();                      // l'écran est stabilisé : le compte à rebours peut courir
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
  controlPanel.update(getIdleStatus());

  requestAnimationFrame(animate);
}

// ==========================================
// 4. EXTRAIT ORIGINEL & GÉNÉRATION IA
// ==========================================
const GENERATION_TIMEOUT_MS = 60000;

const originalTextEl = document.querySelector('.text-content-original');
const leftPageEl = document.getElementById('left');

let textIds = [];            // identifiants des extraits disponibles côté serveur
let currentTextId = null;    // extrait actuellement affiché page gauche
let activeConstraintId = null;
let generationToken = 0;     // invalide les réponses des générations abandonnées
let fallbackContraintes = null;
let fallbackTextes = null;

// Textes de secours pré-générés, utilisés si le LLM est injoignable.
// "textes" : un texte par couple (extrait, contrainte), produit par
// generate_secours.py ; "contraintes" : anciens textes génériques, gardés
// en dernier recours si un couple manque.
try {
  ({ contraintes: fallbackContraintes, textes: fallbackTextes } =
    await (await fetch('/data/textes_secours.json')).json());
} catch (e) {
  console.warn('Textes de secours indisponibles :', e);
}

try {
  ({ texts: textIds } = await (await fetch('/texts')).json());
} catch (e) {
  console.warn('Liste des extraits indisponible :', e);
}

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

// Le modèle renvoie les mots imposés en **gras** markdown ; le moteur
// d'animation attend des *astérisques simples*.
function markdownBoldToHighlight(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
}

// Contraintes à variable aléatoire : libellé du cartouche affiché sur la
// page générée (le serveur fournit le sien via data.variable ; cette table
// sert pour les textes de secours, où seule la valeur est stockée)
const BADGE_LABELS = {
  changement_epoque: 'Époque',
  changement_lieu: 'Lieu',
  changement_genre_litteraire: 'Genre',
};

function getFallback(constraintId, textId) {
  // Texte propre au couple (extrait, contrainte) : le gras y est déjà
  // en markdown, comme dans une réponse du LLM.
  const entry = fallbackTextes?.[textId]?.[constraintId];
  const badgeLabel = BADGE_LABELS[constraintId];
  if (entry?.texte) {
    return {
      text: markdownBoldToHighlight(entry.texte),
      variable: badgeLabel ? { label: badgeLabel, value: entry.contexte } : null,
    };
  }

  // Dernier recours : texte générique de la contrainte, sans lien avec l'extrait
  const contrainte = fallbackContraintes?.find(c => c.id === constraintId);
  if (!contrainte) return null;
  let text = contrainte.texte;
  if (constraintId === 'forcage' || constraintId === 'homosemantique') {
    text = applyKeywordHighlighting(text, contrainte.contexte);
  }
  return {
    text,
    variable: badgeLabel ? { label: badgeLabel, value: contrainte.contexte } : null,
  };
}

// Aligne le haut de l'em box du texte gauche sur la grille
function snapLeftText() {
  if (!originalTextEl || !leftPageEl) return;

  const spacing     = cellSize * gridInterval;
  const cs          = getComputedStyle(originalTextEl);
  // Demi-interlignage : espace vide entre le haut de la line box et le haut de l'em box
  const halfLeading = Math.max(0, (parseFloat(cs.lineHeight) - parseFloat(cs.fontSize)) / 2);

  originalTextEl.style.transform = '';
  const delta     = originalTextEl.getBoundingClientRect().top - leftPageEl.getBoundingClientRect().top;
  const inkTop    = delta + halfLeading;
  const remainder = ((inkTop % spacing) + spacing) % spacing;
  const snap      = remainder < spacing / 2 ? -remainder : spacing - remainder;
  originalTextEl.style.transform = `translateY(${snap}px)`;
}

async function loadRandomExtract() {
  if (textIds.length === 0) return;
  const candidates = textIds.filter(id => id !== currentTextId);
  const id = candidates[Math.floor(Math.random() * candidates.length)] ?? currentTextId;
  try {
    const r = await fetch(`/text/${id}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur serveur');
    currentTextId = id;
    if (originalTextEl) {
      originalTextEl.textContent = data.content;
      snapLeftText();
    }
  } catch (e) {
    console.warn(`Chargement de l'extrait ${id} impossible :`, e);
  }
}

// Cartouche du paramètre (lieu, époque, genre) en haut de la page générée
const constraintBadgeEl = document.getElementById('constraint-badge');
const badgeLabelEl = document.getElementById('constraint-badge-label');
const badgeValueEl = document.getElementById('constraint-badge-value');

// Le cartouche entre et sort par le haut de l'écran (transition CSS sur
// .visible). Le libellé n'est réécrit qu'à l'entrée : pendant la sortie, il
// conserve l'ancienne valeur, qui s'échappe avec lui.
function setConstraintBadge(variable) {
  if (!constraintBadgeEl) return;
  if (variable?.value) {
    badgeLabelEl.textContent = `${variable.label} :`;
    badgeValueEl.textContent = variable.value;
    constraintBadgeEl.classList.add('visible');
  } else {
    constraintBadgeEl.classList.remove('visible');
  }
}

// Signature « Texte généré par IA » — la maquette la place sous le texte du
// canvas ; ce dernier étant centré verticalement, son bas dépend du nombre de
// lignes, d'où le calcul à partir des pixels de la simulation.
const TEXT_ITERATION_GAP = 82;      // écart maquette entre le bas du texte et la signature
const TEXT_ITERATION_HEIGHT = 32;   // hauteur du picto, la ligne ne dépasse pas
const ACTION_BAR_HEIGHT = 120;      // la signature ne passe pas sous la barre d'action
const textIterationEl = document.getElementById('text-iteration');

// La signature est posée hors du canvas : le moteur centre le texte seul,
// sans rien savoir de ce qui pèse en dessous, d'où un ensemble qui paraît
// trop bas. On remonte donc le texte de la moitié de la place occupée par
// la signature, pour centrer le bloc « texte + signature ».
// (Contrairement à la page de gauche, où la citation est dans le flux et
// participe naturellement au centrage.)
const textOffsetRows = -Math.round((TEXT_ITERATION_GAP + TEXT_ITERATION_HEIGHT) / 2 / cellSize);

// Marge gauche du texte généré, calée sur celle de la page originale
// (#left, padding 64px dans style.css). Le texte du canvas étant peint
// cellule par cellule, il ne peut se poser que sur des multiples de
// cellSize : 21 cellules = 63 px, à 1 px de la page de gauche. La mention
// « généré par IA » utilise cette même valeur (--canvas-margin-x), pour
// qu'elle et le texte soient alignés exactement l'un sur l'autre.
const PAGE_MARGIN = 64;
const textMarginCells = Math.round(PAGE_MARGIN / cellSize);
document.documentElement.style.setProperty('--canvas-margin-x', `${textMarginCells * cellSize}px`);

function placeTextIteration(textPixels) {
  if (!textIterationEl || textPixels.length === 0) return;
  let maxY = 0;
  for (const p of textPixels) if (p.y > maxY) maxY = p.y;
  const maxTop = canvas.height - ACTION_BAR_HEIGHT - TEXT_ITERATION_HEIGHT - 32;
  const top = Math.min((maxY + 1) * cellSize + TEXT_ITERATION_GAP, maxTop);
  textIterationEl.style.top = `${top}px`;
}

// La signature ne concerne que le texte achevé : elle s'efface dès que
// celui-ci se dissout ou se reforme, et ne revient qu'une fois la
// formation terminée (cf. transition vers STATE_IDLE dans animate()).
function showTextIteration() {
  textIterationEl?.classList.add('visible');
}

function hideTextIteration() {
  textIterationEl?.classList.remove('visible');
}

function queueTextForDisplay(text, variable = null) {
  if (currentState !== STATE_CHAOS) {
    Algo.startChaos();
    currentState = STATE_CHAOS;
  }
  hideTextIteration();   // le texte se reforme, sa signature n'a plus cours
  resetIdleTimer();      // une animation démarre : sortie du mode inactif, minuteur suspendu
  pendingText = text;
  pendingVariable = variable;   // mis de côté : le cartouche n'entre qu'au texte formé
  textIteration += 1;
  if (textIterationNumber) textIterationNumber.textContent = textIteration;
}

// Pendant une génération, seul le bouton de la contrainte en cours est
// désactivé (inutile de renvoyer la même requête) ; les autres restent
// cliquables pour pouvoir interrompre et repartir sur une autre contrainte.
function setGeneratingButton(constraintId) {
  constraintButtons.forEach(b => { b.disabled = b.dataset.id === constraintId; });
}

async function generate() {
  if (!activeConstraintId) return;
  const token = ++generationToken;
  setGeneratingButton(activeConstraintId);

  // Retour au chaos : sert d'état de chargement pendant l'appel au LLM
  if (currentState !== STATE_CHAOS) {
    Algo.startChaos();
    currentState = STATE_CHAOS;
  }
  pendingText = null;
  pendingVariable = null;
  setConstraintBadge(null); // l'ancien texte se dissout, son cartouche remonte
  hideTextIteration();
  resetIdleTimer();         // la dissolution est une animation, pas une inaction

  let text = null;
  let variable = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    const r = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_id: currentTextId, constraint_id: activeConstraintId }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur serveur');
    text = markdownBoldToHighlight(data.answer);
    variable = data.variable;
  } catch (e) {
    console.warn('Génération IA indisponible, texte de secours utilisé :', e);
    ({ text, variable } = getFallback(activeConstraintId, currentTextId) ?? {});
  }

  if (token !== generationToken) return; // une génération plus récente a pris la main
  if (text) {
    // Le déverrouillage attend la fin de l'apparition du texte sur le
    // canvas (transition vers STATE_IDLE dans animate())
    queueTextForDisplay(text, variable);
  } else {
    setGeneratingButton(null); // rien à afficher : déverrouillage immédiat
  }
}

// ==========================================
// 5. LES BOUTONS
// ==========================================
const constraintButtons = document.querySelectorAll('.btn-contrainte');
const textIterationNumber = document.getElementById('text-iteration-number');
const textIterationYear = document.getElementById('text-iteration-year');
if (textIterationYear) textIterationYear.textContent = new Date().getFullYear();
let textIteration = 0;

function activateConstraint(btn) {
  constraintButtons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeConstraintId = btn.dataset.id;
  generate();
}

constraintButtons.forEach(btn => {
  btn.addEventListener('click', () => activateConstraint(btn));
});

// Nouvel extrait originel + regénération avec la contrainte active
const btnRenewExtract = document.getElementById('btn-renew-extract');
if (btnRenewExtract) {
  btnRenewExtract.addEventListener('click', async () => {
    await loadRandomExtract();
    if (activeConstraintId) generate();
  });
}

const btnHelp = document.getElementById('btn-help');
const btnCloseHelp = document.getElementById('btn-close-help');
const helpPanel = document.getElementById('help-panel');

if (btnHelp && helpPanel) {
  // La barre d'action reste visible par-dessus la notice : les contraintes
  // y cèdent la place au libellé « Fermer la notice » (maquette A2)
  const toggleHelp = () => {
    const isOpen = helpPanel.classList.toggle('open');
    btnHelp.classList.toggle('active', isOpen);
    document.body.classList.toggle('help-open', isOpen);
  };
  btnHelp.addEventListener('click', toggleHelp);
  if (btnCloseHelp) btnCloseHelp.addEventListener('click', toggleHelp);
}

// ==========================================
// 6. ÉTAT IDLE DES BOUTONS CONTRAINTE
// ==========================================
// Après IDLE_DELAY_MS sans interaction : un voile assombrit l'écran
// (sauf la barre d'action) et un bouton aléatoire « rebondit » (classe
// .jello) à cadence légèrement irrégulière, jusqu'à la prochaine
// interaction.
const IDLE_DELAY_MS = 6000;
const IDLE_BOUNCE_MIN_MS = 1600;    // délai minimal entre deux rebonds
const IDLE_BOUNCE_JITTER_MS = 1400; // part aléatoire ajoutée au délai

const idleVeil = document.getElementById('idle-veil');

let idleTimer = null;
let bounceTimer = null;
let lastBouncedBtn = null;
let idleArmedAt = null;        // date d'armement du minuteur — lue par le panneau de debug
let idleModeActive = false;

// État du compte à rebours pour le panneau de debug (touche « D ») : soit le
// mode inactif est enclenché, soit le minuteur est suspendu par une
// animation en cours, soit il court et on affiche le temps écoulé.
function getIdleStatus() {
  if (idleModeActive) return { state: 'active' };
  if (idleArmedAt === null) return { state: 'suspended' };
  return { state: 'counting', elapsedMs: performance.now() - idleArmedAt, delayMs: IDLE_DELAY_MS };
}

function bounceRandomButton() {
  const candidates = [...constraintButtons].filter(b => b !== lastBouncedBtn);
  const btn = candidates[Math.floor(Math.random() * candidates.length)];
  lastBouncedBtn = btn;
  btn.classList.remove('jello');
  void btn.offsetWidth; // force un reflow pour pouvoir rejouer l'animation
  btn.classList.add('jello');
  bounceTimer = setTimeout(bounceRandomButton, IDLE_BOUNCE_MIN_MS + Math.random() * IDLE_BOUNCE_JITTER_MS);
}

function startIdleMode() {
  idleModeActive = true;
  if (idleVeil) idleVeil.classList.add('visible');
  bounceRandomButton();
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(bounceTimer);
  if (idleVeil) idleVeil.classList.remove('visible');
  constraintButtons.forEach(b => b.classList.remove('jello'));
  idleModeActive = false;
  idleArmedAt = null;

  // Un texte qui se dissout ou se reforme n'est pas de l'inactivité : le
  // compte à rebours ne repart qu'une fois l'écran stabilisé. La fin de la
  // formation (passage en STATE_IDLE dans animate()) rappelle cette
  // fonction, qui arme alors le minuteur.
  if (currentState !== STATE_IDLE) return;

  idleArmedAt = performance.now();
  idleTimer = setTimeout(startIdleMode, IDLE_DELAY_MS);
}

['mousemove', 'mousedown', 'keydown', 'click', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});

resetIdleTimer();

// LANCEMENT INITIAL
Algo.getGridDimensions(canvas.width, canvas.height, cellSize);
Algo.init();
requestAnimationFrame(animate);

// Extrait originel initial + snap sur la grille — s'exécute après le premier
// rendu. Une contrainte aléatoire est ensuite activée pour qu'il y ait
// toujours une contrainte active et un texte généré à l'écran.
requestAnimationFrame(() => requestAnimationFrame(() => {
  snapLeftText();
  loadRandomExtract().then(() => {
    activateConstraint(constraintButtons[Math.floor(Math.random() * constraintButtons.length)]);
  });
}));
