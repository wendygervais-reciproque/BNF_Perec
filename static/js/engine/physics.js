// Déplacement des particules et des blocs — phase A d'un pas de simulation.
//
// Deux régimes :
//   · CHAOS      tout erre dans le champ de bruit, avec enroulement aux bords ;
//   · FORMATION  chaque bloc rassemble ses particules (ASSEMBLING), puis
//                convoie l'ensemble jusqu'à sa cible (MIGRATING) avant de s'y
//                figer (DOCKED).

import { S } from './state.js';
import { PARAMS } from './params.js';
import { noise } from './noise.js';

// ==========================================
// LE LIMIER
// ==========================================
// Le déplacement n'est jamais direct : l'angle vers la cible est dévié par le
// champ de bruit, dans un cône d'autant plus large que la cible est loin.
// D'où une approche sinueuse de loin, qui se redresse à mesure qu'on arrive.
// identityOffset décale le champ par entité : deux particules voisines visant
// la même cible ne suivent pas la même trajectoire.
function getHoundMove(currentX, currentY, targetX, targetY, identityOffset) {
  let dx = targetX - currentX, dy = targetY - currentY;
  if (dx === 0 && dy === 0) return { moveX: 0, moveY: 0 };
  let targetAngle = Math.atan2(dy, dx), dist = Math.abs(dx) + Math.abs(dy);
  let maxConeAngleRadians = PARAMS.maxConeAngleDegrees * (Math.PI / 180);
  let coneWidth = Math.min(maxConeAngleRadians, (dist / 100.0) * maxConeAngleRadians);
  let n = noise(currentX * PARAMS.NOISE_SCALE, currentY * PARAMS.NOISE_SCALE, S.time + identityOffset);
  let actualAngle = targetAngle + (n - 0.5) * coneWidth;

  if (Math.abs(Math.cos(actualAngle)) > Math.abs(Math.sin(actualAngle))) return { moveX: Math.cos(actualAngle) > 0 ? 1 : -1, moveY: 0 };
  else return { moveX: 0, moveY: Math.sin(actualAngle) > 0 ? 1 : -1 };
}

// Errance libre d'un point dans le champ de bruit, avec enroulement aux bords.
// Le déplacement est toujours d'une case, en X ou en Y : la trame reste nette.
function wander(entity, cols, rows, offset) {
  let n = noise(entity.x * PARAMS.NOISE_SCALE, entity.y * PARAMS.NOISE_SCALE, S.time + offset);
  let angle = n * Math.PI * 4;
  if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) entity.x += Math.sign(Math.cos(angle)) || 1;
  else entity.y += Math.sign(Math.sin(angle)) || 1;
  entity.x = (entity.x + cols) % cols;
  entity.y = (entity.y + rows) % rows;
}

export function stepMovement() {
  const cols = S.cols, rows = S.rows;
  const particles = S.particles;
  const blocks = S.blocks;

  if (S.currentMode === 'CHAOS') {
    for (let p of particles) {
      if (!p.isCollected) wander(p, cols, rows, 0);
    }
    for (let b of blocks) {
      wander(b, cols, rows, b.targetX);
      for (let p of b.elements) {
        if (p.isCollected) { p.x = (b.x + p.localX + cols) % cols; p.y = (b.y + p.localY + rows) % rows; }
      }
    }
    return;
  }

  // --- FORMATION ---
  // Les agonisantes continuent d'errer pendant qu'elles s'effacent.
  for (let p of particles) {
    if (p.state === 'DYING') wander(p, cols, rows, 0);
  }

  for (let b of blocks) {
    if (b.state === 'DOCKED') continue;
    if (b.state === 'ASSEMBLING') stepAssembling(b);
    else if (b.state === 'MIGRATING') stepMigrating(b);
  }
}

// Le bloc rassemble ses particules. globalInertia, qui monte de 0 à 1 pendant
// la formation, dose la proportion autorisée à bouger : le démarrage est lent,
// puis l'ensemble s'anime.
function stepAssembling(b) {
  // Comptage direct plutôt que des .filter() répétés
  let uncollectedCount = 0, collectedCount = 0;
  for (let p of b.elements) {
    if (p.isCollected) collectedCount++;
    else uncollectedCount++;
  }

  for (let p of b.elements) {
    if (p.isCollected) continue;
    if (Math.random() > S.globalInertia) continue;
    let expectedX = b.x + p.localX, expectedY = b.y + p.localY;
    let move = getHoundMove(p.x, p.y, expectedX, expectedY, p.localX + p.localY);
    p.x += move.moveX; p.y += move.moveY;
  }

  for (let p of b.elements) {
    if (!p.isCollected && b.x + p.localX === p.x && b.y + p.localY === p.y) {
      p.isCollected = true;
      collectedCount++;
      uncollectedCount--;
    }
  }

  if (uncollectedCount === 0) {
    b.state = 'MIGRATING';
    return;
  }

  // Le bloc va lui-même à la rencontre de sa particule la plus éloignée du
  // compte : sans cela, une traînarde bloquerait indéfiniment l'assemblage.
  if (collectedCount >= 1 && Math.random() <= S.globalInertia) {
    let closestP = null, minDist = Infinity;
    for (let p of b.elements) {
      if (p.isCollected) continue;
      let dist = Math.abs((p.x - p.localX) - b.x) + Math.abs((p.y - p.localY) - b.y);
      if (dist < minDist) { minDist = dist; closestP = p; }
    }
    if (closestP) {
      let move = getHoundMove(b.x, b.y, closestP.x - closestP.localX, closestP.y - closestP.localY, b.targetX);
      b.x += move.moveX; b.y += move.moveY;
    }
  }

  // Les particules déjà collectées suivent le bloc dans son déplacement
  for (let p of b.elements) {
    if (!p.isCollected && b.x + p.localX === p.x && b.y + p.localY === p.y) p.isCollected = true;
    if (p.isCollected) { p.x = b.x + p.localX; p.y = b.y + p.localY; }
  }
}

// Le bloc complet convoie ses particules jusqu'à sa position dans le texte.
function stepMigrating(b) {
  if (Math.random() <= S.globalInertia) {
    let move = getHoundMove(b.x, b.y, b.targetX, b.targetY, b.targetX + b.targetY);
    b.x += move.moveX; b.y += move.moveY;
  }
  for (let p of b.elements) { p.x = b.x + p.localX; p.y = b.y + p.localY; }
  if (b.x === b.targetX && b.y === b.targetY) b.state = 'DOCKED';
}
