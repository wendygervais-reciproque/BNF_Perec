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
const colorHighlightBg = '#ffee00f6';
let currentHighlightBgPixels = [];
let highlightBgPath = new Path2D();

const formationSpeedMultiplier = 0.4;
const maxClusterSize = 3;

const texts = [
  "L'obscurité de la demeure semblait vibrer sous l'effet de *couinements incessants* qui troublaient le sommeil du vieil homme. Il soupçonnait que le savant démoniaque avait orchestré un plan machiavélique pour dérober les précieuses montres de la collection familiale. Armé de son petit marteau, le cocher s'avança avec une détermination fébrile vers la source du trouble. Il s'approcha de la lourde tenture qui pendait au mur, le cœur battant. D'un geste sec, il frappa la cloison, espérant ainsi mettre fin au mystère qui hantait la nuit et déjouer la ruse maléfique.",
  "Une nuit, le vieux palefrenier fut tiré de son sommeil par de *légers grattements* qui semblaient émaner de la cellule voisine. Il songea que l'alchimiste hérétique avait dompté l'un de ses rongeurs pour qu'il vienne lui dérober ses amulettes. Il se leva, saisit dans sa sacoche de cuir un petit maillet de fer qu'il ne quittait jamais, pénétra dans la chambre, s'approcha avec la plus grande prudence de la tapisserie de laine et frappa violemment à l'endroit d'où le bruit semblait sourdre."
];
let currentTextIndex = 0;
let pendingText = null;

const controlPanel = new ControlPanel();

// ==========================================
// 2. MACHINE À ÉTATS 
// ==========================================
const STATE_CHAOS = 0;           // Destruction en cours, mouvement organique perpétuel
const STATE_FORMING = 1;         // Les particules cherchent leur place
const STATE_IDLE = 2;            // Texte formé, système immobile

let currentState = STATE_CHAOS;
let lastTime = 0;

// ==========================================
// 3. LA BOUCLE D'ANIMATION
// ==========================================
function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (dt > 0.1) dt = 0.1;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // LOGIQUE D'ÉTAT PURE
  if (currentState === STATE_CHAOS) {
    if (pendingText !== null) {
      let dims = Algo.getGridDimensions(canvas.width, canvas.height, cellSize);
      let coords = TextManager.getCoordinates(pendingText, dims.cols, dims.rows);
      currentHighlightBgPixels = coords.highlightBgPixels;
      // Reconstruire le Path2D une seule fois par formation (pas chaque frame)
      highlightBgPath = new Path2D();
      for (const bp of currentHighlightBgPixels) {
        highlightBgPath.rect(bp.x * cellSize, bp.y * cellSize, cellSize, cellSize);
      }

      Algo.startFormation(coords.textPixels);

      pendingText = null;
      currentState = STATE_FORMING;
    }
  }
  else if (currentState === STATE_FORMING) {
    if (Algo.isTextFullyFormed()) {
      currentState = STATE_IDLE;
    }
  }

  // DESSIN DU FOND JAUNE (Fondu synchronisé avec la cristallisation)
  if (currentState === STATE_FORMING || currentState === STATE_IDLE) {
    if (currentHighlightBgPixels.length > 0 && Algo.crystallizationProgress > 0) {

      // On utilise la progression calculée par l'algo pour le fondu (de 0.0 à 1.0)
      ctx.globalAlpha = Algo.crystallizationProgress;
      ctx.fillStyle = colorHighlightBg;
      ctx.fill(highlightBgPath);
      ctx.globalAlpha = 1.0;
    }
  }

  // L'ALGORITHME FAIT SA VIE (Nettoyé du paramètre inutile)
  Algo.update(dt, formationSpeedMultiplier);
  Algo.draw(ctx);

  // NOUVEAU : Mise à jour du panneau de contrôle pour calculer les FPS
  controlPanel.update();

  requestAnimationFrame(animate);
}

// ==========================================
// 4. LES BOUTONS
// ==========================================
const btnLoad = document.getElementById('btn-load');
const btnSend = document.getElementById('btn-send');

if (btnLoad && btnSend) {
  // BOUTON "GÉNÉRER" -> Lance la destruction et l'errance
  btnLoad.addEventListener('click', () => {
    if (currentState === STATE_IDLE || currentState === STATE_FORMING) {
      Algo.startChaos(); // SIGNAL EXPLICITE DE DESTRUCTION
      currentState = STATE_CHAOS;

      btnLoad.disabled = true;
      btnLoad.innerText = 'Génération en cours...';
      btnSend.disabled = false;
    }
  });

  // BOUTON "ENVOYER" -> Lance la formation du nouveau texte
  btnSend.addEventListener('click', () => {
    currentTextIndex = (currentTextIndex + 1) % texts.length;
    pendingText = texts[currentTextIndex];

    btnLoad.disabled = false;
    btnLoad.innerText = '1. Charger un nouveau texte';
    btnSend.disabled = true;
  });
}

// LANCEMENT INITIAL
Algo.getGridDimensions(canvas.width, canvas.height, cellSize);
Algo.init();
pendingText = texts[currentTextIndex];
requestAnimationFrame(animate);