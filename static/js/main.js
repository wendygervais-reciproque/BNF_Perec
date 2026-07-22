// Chef d'orchestre.
//
// Ce fichier ne fait que trois choses : tenir la machine à états, faire
// tourner la boucle d'animation, et déclencher au bon moment ce que les
// autres modules savent faire.
//
//   config.js   les constantes
//   api.js      le serveur et les textes de secours
//   stage.js    le canvas et ses couches de fond
//   ui.js       le DOM autour du canvas
//   idle.js     le mode inactif
//   engine/     la simulation

import * as Engine from '/js/engine/simulation.js';
import * as TextManager from '/js/engine/text_manager.js';
import { ControlPanel } from '/js/engine/control_panel.js';

import {
  CELL_SIZE, GRID_INTERVAL, LINE_GAP,
  FORMATION_SPEED, TEXT_OFFSET_ROWS, TEXT_MARGIN_CELLS
} from './config.js';
import { initApi, fetchRandomExtract, requestGeneration } from './api.js';
import {
  canvas, ctx, beginFrame, setHighlightPixels, paintHighlight,
  setCanvasHeight, viewportHeight
} from './stage.js';
import * as UI from './ui.js';
import { initIdleMode, resetIdleTimer, getIdleStatus } from './idle.js';

// ==========================================
// MACHINE À ÉTATS
// ==========================================
// CHAOS   : la nuée erre — au repos, pendant l'appel au modèle, ou le temps
//           que le texte précédent se dissolve
// FORMING : les blocs convergent vers leur position
// STABLE  : le texte est posé, plus rien ne bouge
const STATE_CHAOS = 0;
const STATE_FORMING = 1;
const STATE_STABLE = 2;

let currentState = STATE_CHAOS;
let lastTime = 0;

let pendingText = null;
let pendingVariable = null;   // cartouche mis de côté : il n'entre qu'au texte formé

let currentTextId = null;     // extrait affiché page gauche
let activeConstraintId = null;
let generationToken = 0;      // invalide les réponses des générations abandonnées

const controlPanel = new ControlPanel();

// ==========================================
// BOUCLE D'ANIMATION
// ==========================================
function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (dt > 0.1) dt = 0.1;   // un onglet revenu d'arrière-plan ne rattrape pas

  beginFrame();

  if (currentState === STATE_CHAOS && pendingText !== null) {
    startFormation(pendingText);
    pendingText = null;
    currentState = STATE_FORMING;
  } else if (currentState === STATE_FORMING && Engine.isTextFullyFormed()) {
    currentState = STATE_STABLE;
    onTextFormed();
  }

  if (currentState !== STATE_CHAOS) paintHighlight(Engine.getCrystallization());

  Engine.update(dt, FORMATION_SPEED);
  Engine.draw(ctx);
  controlPanel.update(getIdleStatus());

  requestAnimationFrame(animate);
}

// Compose le texte sur la trame, puis confie les pixels obtenus au moteur.
// Le texte est d'abord composé pour la hauteur du cadre visible : s'il tient,
// il reste centré ; s'il déborde, la composition le cale en haut et on agrandit
// le canvas à la hauteur qu'il réclame — il défile alors dans #canvas-scroll.
function startFormation(text) {
  const cols = Math.floor(canvas.width / CELL_SIZE);
  const viewportRows = Math.floor(viewportHeight / CELL_SIZE);
  const coords = TextManager.getCoordinates(
    text, cols, viewportRows, GRID_INTERVAL, LINE_GAP, TEXT_OFFSET_ROWS, TEXT_MARGIN_CELLS
  );

  // Le canvas prend la hauteur du texte (signature et dégagement compris), sans
  // jamais descendre sous celle du cadre. La grille du moteur est ensuite
  // (ré)allouée à cette taille définitive.
  setCanvasHeight(Math.max(viewportHeight, UI.contentHeight(coords.textPixels)));
  Engine.getGridDimensions(canvas.width, canvas.height, CELL_SIZE);

  setHighlightPixels(coords.highlightBgPixels);
  UI.placeTextIteration(coords.textPixels);
  UI.resetScroll();
  Engine.startFormation(coords.textPixels);
}

// Le texte vient de se poser : tout ce qui l'accompagne apparaît d'un coup.
function onTextFormed() {
  UI.setGeneratingButton(null);           // déverrouillage des contraintes
  UI.showTextIteration();                 // la signature revient en fondu
  UI.setConstraintBadge(pendingVariable); // le cartouche descend du haut
  resetIdleTimer();                       // écran stabilisé : le minuteur peut courir
}

// ==========================================
// GÉNÉRATION
// ==========================================
// Retour au chaos : la dissolution du texte précédent sert d'état de
// chargement pendant l'appel au modèle.
function dissolve() {
  if (currentState !== STATE_CHAOS) {
    Engine.startChaos();
    currentState = STATE_CHAOS;
  }
  UI.hideTextIteration();
  resetIdleTimer();   // une animation démarre : le minuteur reste suspendu
}

async function generate() {
  if (!activeConstraintId) return;
  const token = ++generationToken;
  UI.setGeneratingButton(activeConstraintId);

  pendingText = null;
  pendingVariable = null;
  UI.setConstraintBadge(null);   // l'ancien texte se dissout, son cartouche remonte
  dissolve();

  const { text, variable } = await requestGeneration(currentTextId, activeConstraintId);

  if (token !== generationToken) return;  // une génération plus récente a pris la main
  if (!text) {
    UI.setGeneratingButton(null);         // rien à afficher : déverrouillage immédiat
    return;
  }

  // Le déverrouillage attend la fin de l'apparition du texte (cf. onTextFormed)
  dissolve();
  pendingText = text;
  pendingVariable = variable;
  UI.bumpTextIteration(currentTextId, activeConstraintId);
}

async function loadRandomExtract() {
  const extract = await fetchRandomExtract(currentTextId);
  if (!extract) return;
  currentTextId = extract.id;
  UI.setExtractText(extract.content);
}

function activateConstraint(btn) {
  UI.markActiveConstraint(btn);
  activeConstraintId = btn.dataset.id;
  generate();
}

// Regroupe les rafales de clics : n'agit qu'une fois les clics arrêtés, pour ne
// pas émettre une action par clic quand on enchaîne (cf. bouton « renouveler »).
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ==========================================
// OUTIL DE DÉVELOPPEMENT
// ==========================================
// Texte de test exerçant toute la police — majuscules, minuscules, accents,
// ligatures (œ Œ), diacritiques rares (ō ā ã ø ḥ), chiffres, ponctuation et
// signes spéciaux ([ ] < > = _ ° « » — …). Affiché sans passer par le modèle
// (touche « t »), pour valider d'un coup d'œil le rendu des glyphes en itérant
// sur bitmap_font.js. Prose réaliste, les signes rares regroupés en fin.
const TEST_TEXT = [
  `PORTEZ CE VIEUX WHISKY AU JUGE BLOND QUI FUME.`,
  `Prénoms : LOÏC, ANAÏS, ÈVE ; villes : NÎMES, ANGERS. OÙ donc ?`,
  `Voyez : l’écrivain rêva d'un drôle d'été où quelque garçon goûtait un maïs brûlé, âcre et âpre, près de l'île.`,
  `Ô temps ! Être, ou n'être pas ? À l'Âme d'Étienne, l'Église, l'Èbre : Ça, c'est vrai.`,
  `Le 24 juin 1975 (à 18 h 30), il lut « La Vie mode d'emploi » — pages 380–967, n° 12, à 20°.`,
  `Un cœur, des œufs, l'Œuvre ; le kōdō, un feijão, le mørkhet, l'ḥarāf, un ā long.`,
  `Réf. " test " : y = [x_1] < 9 > 0 ; kilo-watt, peut-être, va–t–il jouer ?`,
].join('\n');

// Pose un texte local comme s'il venait d'une génération, mais sans requête :
// invalide toute génération en vol, puis suit le même chemin (dissolution →
// formation) que generate().
function showLocalText(text) {
  ++generationToken;               // une génération en cours ne l'écrasera pas
  UI.setGeneratingButton(null);
  UI.setConstraintBadge(null);
  dissolve();
  pendingText = text;
  pendingVariable = null;
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 't' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
  showLocalText(TEST_TEXT);
});

// ==========================================
// AMORÇAGE
// ==========================================
await initApi();

UI.initConstraints(activateConstraint);
UI.initRenewButton(debounce(async () => {
  await loadRandomExtract();
  if (activeConstraintId) generate();
}, 200));
UI.initHelpPanel();
initIdleMode(() => currentState === STATE_STABLE);

Engine.getGridDimensions(canvas.width, canvas.height, CELL_SIZE);
Engine.init();
requestAnimationFrame(animate);

// Extrait initial et première contrainte, après le premier rendu : le calage
// du texte sur la trame a besoin d'une mise en page établie. Une contrainte
// est activée d'office pour qu'il y ait toujours un texte à l'écran.
requestAnimationFrame(() => requestAnimationFrame(() => {
  UI.snapLeftText();
  loadRandomExtract().then(() => {
    activateConstraint(UI.randomConstraintButton());
  });
}));
