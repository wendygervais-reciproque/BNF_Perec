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
import { canvas, ctx, beginFrame, setHighlightPixels, paintHighlight } from './stage.js';
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
function startFormation(text) {
  const dims = Engine.getGridDimensions(canvas.width, canvas.height, CELL_SIZE);
  const coords = TextManager.getCoordinates(
    text, dims.cols, dims.rows, GRID_INTERVAL, LINE_GAP, TEXT_OFFSET_ROWS, TEXT_MARGIN_CELLS
  );
  setHighlightPixels(coords.highlightBgPixels);
  UI.placeTextIteration(coords.textPixels);
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
  UI.bumpTextIteration();
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

// ==========================================
// AMORÇAGE
// ==========================================
await initApi();

UI.initConstraints(activateConstraint);
UI.initRenewButton(async () => {
  await loadRandomExtract();
  if (activeConstraintId) generate();
});
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
