// Déplacement des particules et des blocs — phase A d'un pas de simulation.
//
// === OPTIMISATION SAFARI ===
// Remplacement des boucles for...of par des boucles for indexées dans les
// chemins chauds (stepMigrating). Le reste est inchangé : les perfs Safari
// sont dominées par le rendu (renderer.js), pas par la physique.

import { S } from './state.js';
import { PARAMS } from './params.js';
import { noise } from './noise.js';

const _move = { moveX: 0, moveY: 0 };

function getHoundMove(currentX, currentY, targetX, targetY, identityOffset) {
  const dx = targetX - currentX, dy = targetY - currentY;
  if (dx === 0 && dy === 0) { _move.moveX = 0; _move.moveY = 0; return _move; }

  const dist = Math.abs(dx) + Math.abs(dy);
  const maxConeAngleRadians = PARAMS.maxConeAngleDegrees * (Math.PI / 180);
  const minConeAngleRadians = PARAMS.minConeAngleDegrees * (Math.PI / 180);
  const coneWidth = Math.max(minConeAngleRadians,
    Math.min(maxConeAngleRadians, (dist / 100.0) * maxConeAngleRadians));
  const n = noise(currentX * PARAMS.NOISE_SCALE, currentY * PARAMS.NOISE_SCALE, S.time + identityOffset);
  const delta = (n - 0.5) * coneWidth;

  const cosD = Math.cos(delta), sinD = Math.sin(delta);
  const rx = dx * cosD - dy * sinD;
  const ry = dx * sinD + dy * cosD;

  const absRx = Math.abs(rx), absRy = Math.abs(ry);
  const pickX = Math.random() * (absRx + absRy) < absRx;
  if (pickX) { _move.moveX = rx >= 0 ? 1 : -1; _move.moveY = 0; }
  else { _move.moveX = 0; _move.moveY = ry >= 0 ? 1 : -1; }
  return _move;
}

function wander(entity, cols, rows, offset) {
  const n = noise(entity.x * PARAMS.NOISE_SCALE, entity.y * PARAMS.NOISE_SCALE, S.time + offset);
  const angle = n * Math.PI * 4;
  const c = Math.cos(angle), s = Math.sin(angle);
  if (Math.abs(c) > Math.abs(s)) entity.x += c >= 0 ? 1 : -1;
  else entity.y += s >= 0 ? 1 : -1;
  entity.x = (entity.x + cols) % cols;
  entity.y = (entity.y + rows) % rows;
}

export function stepMovement() {
  const cols = S.cols, rows = S.rows;
  const particles = S.particles;
  const blocks = S.blocks;

  if (S.currentMode === 'CHAOS') {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.isCollected) wander(p, cols, rows, 0);
    }
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      wander(b, cols, rows, b.targetX);
      const elements = b.elements;
      for (let j = 0; j < elements.length; j++) {
        const p = elements[j];
        if (p.isCollected) {
          p.x = (b.x + p.localX + cols) % cols;
          p.y = (b.y + p.localY + rows) % rows;
        }
      }
    }
    return;
  }

  const nParticles = particles.length;
  for (let i = 0; i < nParticles; i++) {
    const p = particles[i];
    if (p.state === 'DYING') wander(p, cols, rows, 0);
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.state === 'DOCKED') continue;
    if (b.state === 'ASSEMBLING') stepAssembling(b);
    else if (b.state === 'MIGRATING') stepMigrating(b);
  }
}

function stepAssembling(b) {
  if (b.uncollectedCount === undefined) {
    let u = 0, c = 0;
    for (let i = 0; i < b.elements.length; i++) {
      if (b.elements[i].isCollected) c++; else u++;
    }
    b.uncollectedCount = u;
    b.collectedCount = c;
  }

  const elements = b.elements;
  const nElem = elements.length;
  for (let i = 0; i < nElem; i++) {
    const p = elements[i];
    if (p.isCollected) continue;
    if (Math.random() > S.globalInertia) continue;
    const expectedX = b.x + p.localX, expectedY = b.y + p.localY;
    const move = getHoundMove(p.x, p.y, expectedX, expectedY, p.localX + p.localY);
    p.x += move.moveX; p.y += move.moveY;
    if (p.x === expectedX && p.y === expectedY) {
      p.isCollected = true;
      b.collectedCount++;
      b.uncollectedCount--;
    }
  }

  if (b.uncollectedCount === 0) { b.state = 'MIGRATING'; return; }

  if (b.collectedCount >= 1 && Math.random() <= S.globalInertia) {
    let closestP = null, minDist = Infinity;
    for (let i = 0; i < nElem; i++) {
      const p = elements[i];
      if (p.isCollected) continue;
      const dist = Math.abs((p.x - p.localX) - b.x) + Math.abs((p.y - p.localY) - b.y);
      if (dist < minDist) { minDist = dist; closestP = p; }
    }
    if (closestP) {
      const move = getHoundMove(b.x, b.y, closestP.x - closestP.localX, closestP.y - closestP.localY, b.targetX);
      b.x += move.moveX; b.y += move.moveY;
    }
  }

  for (let i = 0; i < nElem; i++) {
    const p = elements[i];
    if (!p.isCollected && b.x + p.localX === p.x && b.y + p.localY === p.y) {
      p.isCollected = true;
      b.collectedCount++;
      b.uncollectedCount--;
    }
    if (p.isCollected) { p.x = b.x + p.localX; p.y = b.y + p.localY; }
  }
}

// Le bloc complet convoie ses particules. for indexé au lieu de for...of.
function stepMigrating(b) {
  if (Math.random() <= S.globalInertia) {
    let move = getHoundMove(b.x, b.y, b.targetX, b.targetY, b.targetX + b.targetY);
    b.x += move.moveX; b.y += move.moveY;
  }
  const elements = b.elements;
  const nElem = elements.length;
  for (let i = 0; i < nElem; i++) {
    const p = elements[i];
    p.x = b.x + p.localX; p.y = b.y + p.localY;
  }
  if (b.x === b.targetX && b.y === b.targetY) b.state = 'DOCKED';
}