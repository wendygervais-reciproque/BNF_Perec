// Bascule du chaos vers la formation d'un texte.
//
// Appelé une fois par texte, hors boucle chaude : c'est ici que se décide
// quelle particule ira occuper quel pixel. Trois opérations successives —
// découper le texte en blocs, ajuster l'effectif de particules, puis les
// apparier aux emplacements.

import { S } from './state.js';
import { BLOCK_W, BLOCK_H, SPAWN_MARGIN_X, SPAWN_MARGIN_Y } from './params.js';

export function startFormation(textPixels) {
  if (textPixels.length === 0) return;
  S.currentMode = 'FORMATION';
  S.globalInertia = 0.0;
  S.crystallizationProgress = 0.0;

  // --- 1. Découpage du texte en blocs de BLOCK_W × BLOCK_H ---
  // Chaque pixel devient un emplacement à pourvoir, rattaché à son bloc.
  let newBlocksMap = {};
  let requiredSlots = [];

  for (let p of textPixels) {
    let bX = Math.floor(p.x / BLOCK_W), bY = Math.floor(p.y / BLOCK_H);
    let key = `${bX}_${bY}`;

    if (!newBlocksMap[key]) {
      newBlocksMap[key] = {
        targetX: bX * BLOCK_W, targetY: bY * BLOCK_H,
        x: 0, y: 0, state: 'ASSEMBLING', elements: []
      };
    }
    requiredSlots.push({
      localX: p.x - (bX * BLOCK_W), localY: p.y - (bY * BLOCK_H),
      isHighlighted: p.isHighlighted, parentBlockKey: key
    });
  }

  // --- 2. Ajustement de l'effectif ---
  // Les particules du texte précédent sont réutilisées : on n'en crée que le
  // complément, et l'excédent part en agonie plutôt que de disparaître net.
  let activeParticles = S.particles.filter(p => p.state !== 'DYING');
  let dyingParticles = S.particles.filter(p => p.state === 'DYING');
  let difference = requiredSlots.length - activeParticles.length;

  let mX = Math.floor(S.cols * SPAWN_MARGIN_X);
  let mY = Math.floor(S.rows * SPAWN_MARGIN_Y);
  let spawnW = S.cols - (mX * 2);
  let spawnH = S.rows - (mY * 2);

  if (difference > 0) {
    for (let i = 0; i < difference; i++) {
      activeParticles.push({
        x: mX + Math.floor(Math.random() * spawnW), y: mY + Math.floor(Math.random() * spawnH),
        parentBlock: null, isCollected: false,
        // alpha négatif : décale l'apparition, les nouvelles ne surgissent
        // pas toutes au même instant
        isAlive: true, nextAlive: true, state: 'BORN', alpha: -Math.random() * 2.0
      });
    }
  } else if (difference < 0) {
    let excess = activeParticles.splice(requiredSlots.length);
    for (let p of excess) { p.state = 'DYING'; p.parentBlock = null; p.alpha = 1.0 + Math.random() * 2.0; dyingParticles.push(p); }
  }

  // --- 3. Appariement ---
  // Les deux listes sont triées dans le même ordre (haut vers bas, gauche vers
  // droite) : l'appariement par index limite ainsi les croisements de
  // trajectoires, sans avoir à résoudre une affectation optimale.
  activeParticles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  requiredSlots.sort((a, b) => {
    let absYa = newBlocksMap[a.parentBlockKey].targetY + a.localY;
    let absXa = newBlocksMap[a.parentBlockKey].targetX + a.localX;
    let absYb = newBlocksMap[b.parentBlockKey].targetY + b.localY;
    let absXb = newBlocksMap[b.parentBlockKey].targetX + b.localX;
    return (absYa - absYb) || (absXa - absXb);
  });

  S.blocks = [];
  for (let key in newBlocksMap) S.blocks.push(newBlocksMap[key]);

  for (let i = 0; i < activeParticles.length; i++) {
    let p = activeParticles[i], slot = requiredSlots[i], block = newBlocksMap[slot.parentBlockKey];
    p.localX = slot.localX; p.localY = slot.localY; p.isHighlighted = slot.isHighlighted;
    p.parentBlock = block; p.isCollected = false; p.isAlive = true;
    if (p.state !== 'BORN') { p.state = 'ALIVE'; p.alpha = 1.0; }
    block.elements.push(p);
  }
  S.particles = [...activeParticles, ...dyingParticles];

  // --- 4. Point de ralliement de chaque bloc ---
  // Le bloc se pose sur la particule la plus proche du centre de gravité de
  // ses éléments : les autres ont ainsi le moins de chemin à parcourir.
  for (let b of S.blocks) {
    let sumX = 0, sumY = 0;
    for (let p of b.elements) { sumX += p.x; sumY += p.y; }
    let cgX = Math.floor(sumX / b.elements.length);
    let cgY = Math.floor(sumY / b.elements.length);

    let closestP = b.elements[0]; let minDist = Infinity;
    for (let p of b.elements) {
      let targetBx = p.x - p.localX, targetBy = p.y - p.localY;
      let dist = Math.abs(targetBx - cgX) + Math.abs(targetBy - cgY);
      if (dist < minDist) { minDist = dist; closestP = p; }
    }
    b.x = closestP.x - closestP.localX; b.y = closestP.y - closestP.localY;
  }
}

// Retour à l'errance : les blocs se délient, les particules reprennent leur
// dérive. Les particules qui n'étaient pas encore nées sont considérées comme
// vivantes, sans quoi elles resteraient invisibles.
export function startChaos() {
  S.currentMode = 'CHAOS';
  S.globalInertia = 1.0;
  S.crystallizationProgress = 0.0;
  for (let b of S.blocks) b.state = 'WANDERING';
  for (let p of S.particles) if (p.state === 'BORN') p.state = 'ALIVE';
}

// Le texte est formé quand tous ses blocs sont arrivés à destination.
export function isTextFullyFormed() {
  if (S.currentMode !== 'FORMATION' || S.blocks.length === 0) return false;
  return S.blocks.every(b => b.state === 'DOCKED');
}
