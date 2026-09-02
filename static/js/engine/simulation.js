// Moteur d'animation — orchestration d'un pas de simulation.
//
// Le texte généré n'est pas du texte : c'est une nuée de particules qui
// s'assemblent en blocs, convergent vers leur position cible, et laissent
// derrière elles un plasma régi par un automate cellulaire.
//
// Ce fichier porte la séquence et l'API publique. Le travail est réparti :
//   state.js      l'état partagé
//   params.js     les réglages
//   noise.js      le champ de bruit
//   formation.js  l'appariement particules / emplacements
//   physics.js    le déplacement             (phase A)
//   plasma.js     l'automate et ses greffons (phases B à F)
//   renderer.js   le dessin

import { S, allocateGrids, resetState } from './state.js';
import { PARAMS } from './params.js';
import { isTextFullyFormed } from './formation.js';
import { stepMovement } from './physics.js';
import { stepPlasma, collectVisibleCells } from './plasma.js';

export { PARAMS } from './params.js';
export { startFormation, startChaos, isTextFullyFormed } from './formation.js';
export { draw } from './renderer.js';

export function getGridDimensions(canvasWidth, canvasHeight, mainCellSize) {
  return allocateGrids(canvasWidth, canvasHeight, mainCellSize);
}

export function init() {
  resetState();
}

export function getStats() {
  return {
    particles: S.particles.length,
    plasma: S.lastFramePlasmaCount,
    state: S.currentMode
  };
}

// Progression de la cristallisation : 0 tant que le texte se forme, monte
// vers 1 une fois formé. Éteint le plasma et révèle l'exergue des mots
// imposés (lue par main.js pour peindre le fond d'exergue).
export function getCrystallization() {
  return S.crystallizationProgress;
}

// ==========================================
// UN PAS DE SIMULATION
// ==========================================
export function update(dt, speedMultiplier = 1.0) {
  const particles = S.particles;

  S.time += dt * 0.5;

  // Pendant la formation, l'inertie monte de 0 à 1 : le mouvement d'ensemble
  // démarre lentement puis s'emballe.
  if (S.currentMode === 'FORMATION') {
    S.globalInertia = Math.min(1.0, S.globalInertia + dt * PARAMS.accelerationSpeed);
  }

  applyFades(particles, dt, speedMultiplier);

  // speedMultiplier est calibré pour ~60 images/seconde ; on le ramène ici au
  // temps réellement écoulé (dt) pour que le nombre de pas par seconde — donc
  // la vitesse de l'animation — ne dépende plus du taux de rafraîchissement
  // réel (60 Hz, 120 Hz...), qui varie selon l'écran et le navigateur.
  // Le multiplicateur fractionnaire (0,4 pas par image de référence) est
  // reporté d'une image sur l'autre plutôt que tiré au sort : un pas exécuté
  // une fois sur deux ou trois, à intervalle régulier, plutôt qu'une suite de
  // « coups de dés » qui produit des paquets de pas puis des trous — la cause
  // du cadencement saccadé observé.
  S.stepAccumulator += speedMultiplier * dt * 60;
  const steps = Math.floor(S.stepAccumulator);
  S.stepAccumulator -= steps;
  const textIsFormed = isTextFullyFormed();

  if (textIsFormed) {
    S.crystallizationProgress = Math.min(1.0, S.crystallizationProgress + PARAMS.plasmaExtinctionSpeed);
  }

  for (let s = 0; s < steps; s++) {
    stepMovement();
    stepPlasma(textIsFormed);
  }

  collectVisibleCells();
}

// Fondus d'entrée et de sortie, puis retrait des particules éteintes.
function applyFades(particles, dt, speedMultiplier) {
  const fadeIn = dt * speedMultiplier * PARAMS.fadeInSpeed;
  const fadeOut = dt * speedMultiplier * PARAMS.fadeOutSpeed;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.state === 'BORN') {
      p.alpha += fadeIn;
      if (p.alpha >= 1.0) { p.alpha = 1.0; p.state = 'ALIVE'; }
    } else if (p.state === 'DYING') {
      p.alpha -= fadeOut;
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].state === 'DYING' && particles[i].alpha <= 0.0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
    }
  }
}