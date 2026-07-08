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
// Les couleurs sont définies dans static/style.css (:root) — source unique.
const rootStyles = getComputedStyle(document.documentElement);
const cssColor = name => rootStyles.getPropertyValue(name).trim();

const cellSize = 3;
const colorHighlightBg = cssColor('--color-highlight-bg');   // exergue des mots sur le canvas
let currentHighlightBgPixels = [];
let highlightBgPath = new Path2D();

const formationSpeedMultiplier = 0.4;
const maxClusterSize = 3;

// ==========================================
// CONFIGURATION DE LA GRILLE
// Modifier ces 2 valeurs pour ajuster les deux grilles simultanément
// (couleurs : --color-grid-page / --color-grid-canvas dans style.css).
// ==========================================
const gridInterval   = 8;                                    // nombre de cellules entre chaque ligne de grille
const lineGap        = 6;                                    // lignes de grille vides entre les lignes de texte (0, gridInterval, 2*gridInterval…)
const gridColorRight = cssColor('--color-grid-canvas');      // couleur des lignes — canvas (page droite)

// Propagation au CSS de l'espacement pour la grille de la page gauche
document.documentElement.style.setProperty('--grid-spacing', `${cellSize * gridInterval}px`);

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
      setGeneratingButton(null); // le texte a fini d'apparaître : déverrouillage
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
    await (await fetch('/textes_secours.json')).json());
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

function setConstraintBadge(variable) {
  if (!constraintBadgeEl) return;
  if (variable?.value) {
    badgeLabelEl.textContent = `${variable.label} :`;
    badgeValueEl.textContent = variable.value;
    constraintBadgeEl.hidden = false;
  } else {
    constraintBadgeEl.hidden = true;
  }
}

function queueTextForDisplay(text, variable = null) {
  if (currentState !== STATE_CHAOS) {
    Algo.startChaos();
    currentState = STATE_CHAOS;
  }
  pendingText = text;
  setConstraintBadge(variable);
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
  setConstraintBadge(null); // l'ancien texte se dissout, sa mention avec

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
const helpPanel = document.getElementById('help-panel');

if (btnHelp && helpPanel) {
  btnHelp.addEventListener('click', () => {
    const isOpen = helpPanel.classList.toggle('open');
    btnHelp.classList.toggle('active', isOpen);
  });
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
  if (idleVeil) idleVeil.classList.add('visible');
  bounceRandomButton();
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(bounceTimer);
  if (idleVeil) idleVeil.classList.remove('visible');
  constraintButtons.forEach(b => b.classList.remove('jello'));
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
