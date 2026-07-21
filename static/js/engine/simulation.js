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

  // Le multiplicateur fractionnaire est réparti aléatoirement : à 0,4 on
  // exécute un pas 40 % des images, plutôt que 0,4 pas à chaque image.
  const steps = Math.floor(speedMultiplier) + (Math.random() < (speedMultiplier % 1) ? 1 : 0);
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
  for (let p of particles) {
    if (p.state === 'BORN') {
      p.alpha += (dt * speedMultiplier) * PARAMS.fadeInSpeed;
      if (p.alpha >= 1.0) { p.alpha = 1.0; p.state = 'ALIVE'; }
    } else if (p.state === 'DYING') {
      p.alpha -= (dt * speedMultiplier) * PARAMS.fadeOutSpeed;
    }
  }
  // Suppression en place, pour ne pas réallouer un tableau à chaque image
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].state === 'DYING' && particles[i].alpha <= 0.0) particles.splice(i, 1);
  }
}
