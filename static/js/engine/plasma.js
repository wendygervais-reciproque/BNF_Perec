// Le plasma — phases B à F d'un pas de simulation.
//
// === OPTIMISATION SAFARI ===
// · Remplacement des boucles for...of par des boucles for indexées :
//   Safari (JavaScriptCore) ne optimise pas for...of sur les tableaux aussi
//   agressivement que V8. Les itérateurs créent des objets et des appels de
//   fonction cachés.
// · Hoisting de S.framePlasmaCount dans une locale : chaque S.framePlasmaCount++
//   est un accès propriété sur un objet module-level, que Safari ne inline pas
//   systématiquement.
// · Le reste de la logique (activeBox, Conway, défibrillateur, comètes) est
//   inchangé : l'automate lui-même n'est pas le goulet d'étranglement Safari,
//   c'est le rendu (renderer.js) qui l'était.

import { S } from './state.js';
import { PARAMS } from './params.js';

export function stepPlasma(textIsFormed) {
  const cols = S.cols, rows = S.rows;
  const particles = S.particles;
  const blocks = S.blocks;
  const aliveGrid = S.aliveGrid;

  const ephemeralState = S.ephemeralState;
  const ephemeralOpacity = S.ephemeralOpacity;
  const ephemeralHeat = S.ephemeralHeat;
  const nextEphemeralState = S.nextEphemeralState;
  const nextEphemeralOpacity = S.nextEphemeralOpacity;
  const nextEphemeralHeat = S.nextEphemeralHeat;
  const activeBox = S.activeBox;

  let framePlasmaCount = 0;

  // --- B. FENÊTRE ACTIVE ET REPORT DU PAS PRÉCÉDENT ---
  let minX = cols, maxX = 0, minY = rows, maxY = 0;

  const nParticles = particles.length;
  for (let i = 0; i < nParticles; i++) {
    const p = particles[i];
    let px = p.x | 0, py = p.y | 0;
    if (px >= 0 && px < cols && py >= 0 && py < rows) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
  }

  let oldMinX = Math.max(0, activeBox.minX - 5), oldMaxX = Math.min(cols - 1, activeBox.maxX + 5);
  let oldMinY = Math.max(0, activeBox.minY - 5), oldMaxY = Math.min(rows - 1, activeBox.maxY + 5);

  const coolingSpeed = PARAMS.collisionCoolingSpeed;

  for (let y = oldMinY; y <= oldMaxY; y++) {
    const rowBase = y * cols;
    for (let x = oldMinX; x <= oldMaxX; x++) {
      const idx = rowBase + x;
      if (ephemeralOpacity[idx] > 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      aliveGrid[idx] = 0;
      nextEphemeralState[idx] = 0;
      nextEphemeralOpacity[idx] = ephemeralOpacity[idx];
      const h = nextEphemeralHeat[idx] = ephemeralHeat[idx] - coolingSpeed;
      if (h < 0) nextEphemeralHeat[idx] = 0;
    }
  }

  S.plasmaHealth = 1.0;
  if (S.lastFramePlasmaCount > PARAMS.maxPlasmaCells) {
    S.plasmaHealth = Math.max(0.05, PARAMS.maxPlasmaCells / S.lastFramePlasmaCount);
  }

  if (minX <= maxX && minY <= maxY) {
    activeBox.minX = Math.max(0, minX - 2); activeBox.maxX = Math.min(cols - 1, maxX + 2);
    activeBox.minY = Math.max(0, minY - 2); activeBox.maxY = Math.min(rows - 1, maxY + 2);

    for (let y = activeBox.minY; y <= activeBox.maxY; y++) {
      const rowBase = y * cols;
      for (let x = activeBox.minX; x <= activeBox.maxX; x++) {
        if (ephemeralState[rowBase + x] === 1) aliveGrid[rowBase + x] = 1;
      }
    }

    for (let i = 0; i < nParticles; i++) {
      const p = particles[i];
      const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
      if (!isLocked && p.isAlive && p.alpha > 0.0) {
        let px = p.x | 0, py = p.y | 0;
        if (px >= activeBox.minX && px <= activeBox.maxX && py >= activeBox.minY && py <= activeBox.maxY) {
          aliveGrid[py * cols + px] = 1;
        }
      }
    }

    const plasmaFadeInSpeed = PARAMS.plasmaFadeInSpeed;
    const plasmaFadeOutSpeed = PARAMS.plasmaFadeOutSpeed;
    const plasmaExtinctionSpeed = PARAMS.plasmaExtinctionSpeed;
    const plasmaHealth = S.plasmaHealth;

    for (let y = activeBox.minY; y <= activeBox.maxY; y++) {
      const rowPrev = (y - 1) * cols;
      const rowCurr = y * cols;
      const rowNext = (y + 1) * cols;

      for (let x = activeBox.minX; x <= activeBox.maxX; x++) {
        const idx = rowCurr + x;
        let neighbors = 0;
        if (y > 0 && y < rows - 1 && x > 0 && x < cols - 1) {
          neighbors = aliveGrid[rowPrev + x - 1] + aliveGrid[rowPrev + x] + aliveGrid[rowPrev + x + 1] +
                      aliveGrid[rowCurr + x - 1]                       + aliveGrid[rowCurr + x + 1] +
                      aliveGrid[rowNext + x - 1] + aliveGrid[rowNext + x] + aliveGrid[rowNext + x + 1];
        }

        const isAlive = ephemeralState[idx] === 1;

        if (textIsFormed) {
          nextEphemeralState[idx] = 0;
        } else {
          if (isAlive && (neighbors === 2 || neighbors === 3)) {
            nextEphemeralState[idx] = 1;
          } else if (!isAlive && neighbors === 3) {
            if (Math.random() <= plasmaHealth) {
              nextEphemeralState[idx] = 1;
              nextEphemeralHeat[idx] = 1.0;
            }
          }
        }

        if (nextEphemeralState[idx] === 1) {
          nextEphemeralOpacity[idx] = Math.min(1.0, ephemeralOpacity[idx] + plasmaFadeInSpeed);
          framePlasmaCount++;
        } else {
          const currentFadeSpeed = textIsFormed ? plasmaExtinctionSpeed : plasmaFadeOutSpeed;
          nextEphemeralOpacity[idx] = Math.max(0.0, ephemeralOpacity[idx] - currentFadeSpeed);
          if (nextEphemeralOpacity[idx] > 0) framePlasmaCount++;
        }
      }
    }
  } else {
    activeBox.minX = 0; activeBox.maxX = 0; activeBox.minY = 0; activeBox.maxY = 0;
  }

  // --- C. SURVIE DES PARTICULES ---
  for (let i = 0; i < nParticles; i++) {
    const p = particles[i];
    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    if (isLocked || !p.isCollected) p.nextAlive = true;
    else {
      let px = p.x | 0, py = p.y | 0;
      if (px >= 0 && px < cols && py >= 0 && py < rows) p.nextAlive = (nextEphemeralState[py * cols + px] === 1);
      else p.nextAlive = false;
    }
  }

  if (!textIsFormed) {
    framePlasmaCount = stepDefibrillator(blocks, cols, rows, nextEphemeralState, nextEphemeralOpacity, nextEphemeralHeat, activeBox, framePlasmaCount);
    framePlasmaCount = stepComets(particles, cols, rows, nextEphemeralState, nextEphemeralOpacity, nextEphemeralHeat, activeBox, framePlasmaCount);
  }

  // --- F. LES PARTICULES CREUSENT LEUR CELLULE ---
  for (let i = 0; i < nParticles; i++) {
    const p = particles[i];
    let px = p.x | 0, py = p.y | 0;
    if (px >= 0 && px < cols && py >= 0 && py < rows) {
      if (p.nextAlive && p.alpha > 0 && p.state !== 'DYING') {
        nextEphemeralState[py * cols + px] = 0;
      }
    }
  }

  S.lastFramePlasmaCount = framePlasmaCount;

  S.ephemeralState = nextEphemeralState; S.nextEphemeralState = ephemeralState;
  S.ephemeralOpacity = nextEphemeralOpacity; S.nextEphemeralOpacity = ephemeralOpacity;
  S.ephemeralHeat = nextEphemeralHeat; S.nextEphemeralHeat = ephemeralHeat;

  for (let i = 0; i < nParticles; i++) particles[i].isAlive = particles[i].nextAlive;
}

// --- D. LE DÉFIBRILLATEUR ---
function stepDefibrillator(blocks, cols, rows, nextState, nextOpacity, nextHeat, activeBox, framePlasmaCount) {
  const defibRadius = PARAMS.defibRadius;
  const defibDensity = PARAMS.defibDensity;
  const plasmaFadeInSpeed = PARAMS.plasmaFadeInSpeed;
  const currentSparkChance = PARAMS.defibEphemeralSparks * S.plasmaHealth;

  const nBlocks = blocks.length;
  for (let bi = 0; bi < nBlocks; bi++) {
    const b = blocks[bi];
    if (b.state === 'DOCKED') continue;

    let aliveCount = 0, collectedCount = 0;
    const elements = b.elements;
    const nElem = elements.length;
    for (let i = 0; i < nElem; i++) {
      const p = elements[i];
      if (!p.isCollected) continue;
      collectedCount++;
      if (p.nextAlive) aliveCount++;
    }

    if (aliveCount >= 3 || collectedCount === 0) continue;

    let targetIdx = Math.floor(Math.random() * collectedCount);
    let rootP = null, ci = 0;
    for (let i = 0; i < nElem; i++) {
      const p = elements[i];
      if (!p.isCollected) continue;
      if (ci === targetIdx) { rootP = p; break; }
      ci++;
    }
    if (!rootP) continue;

    let rx = rootP.x | 0, ry = rootP.y | 0;

    for (let i = 0; i < nElem; i++) {
      const p = elements[i];
      if (!p.isCollected) continue;
      let dx = Math.abs(p.localX - rootP.localX), dy = Math.abs(p.localY - rootP.localY);
      if (dx <= defibRadius && dy <= defibRadius && Math.random() < defibDensity) p.nextAlive = true;
    }

    if (currentSparkChance <= 0.0) continue;

    for (let i = -defibRadius; i <= defibRadius; i++) {
      const ty = ry + i;
      if (ty < 0 || ty >= rows) continue;
      const tRowBase = ty * cols;
      for (let j = -defibRadius; j <= defibRadius; j++) {
        const tx = rx + j;
        if (tx < 0 || tx >= cols) continue;
        if (Math.random() < currentSparkChance) {
          const tidx = tRowBase + tx;
          if (nextState[tidx] === 1) nextHeat[tidx] = 1.0;
          nextState[tidx] = 1;
          nextOpacity[tidx] = Math.min(1.0, nextOpacity[tidx] + plasmaFadeInSpeed);
          framePlasmaCount++;

          if (tx < activeBox.minX) activeBox.minX = tx;
          if (tx > activeBox.maxX) activeBox.maxX = tx;
          if (ty < activeBox.minY) activeBox.minY = ty;
          if (ty > activeBox.maxY) activeBox.maxY = ty;
        }
      }
    }
  }
  return framePlasmaCount;
}

// --- E. LES COMÈTES ---
function stepComets(particles, cols, rows, nextState, nextOpacity, nextHeat, activeBox, framePlasmaCount) {
  const cometChance = PARAMS.defibEphemeralSparks * S.plasmaHealth * 8;
  const plasmaFadeInSpeed = PARAMS.plasmaFadeInSpeed;
  const nParticles = particles.length;

  for (let i = 0; i < nParticles; i++) {
    const p = particles[i];
    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    if (isLocked || p.alpha <= 0.0) continue;
    if (Math.random() >= cometChance) continue;

    let rx = p.x | 0, ry = p.y | 0;
    if (rx < 0 || rx >= cols || ry < 0 || ry >= rows) continue;

    const ridx = ry * cols + rx;
    if (nextState[ridx] === 1) nextHeat[ridx] = 1.0;
    nextState[ridx] = 1;
    nextOpacity[ridx] = Math.min(1.0, nextOpacity[ridx] + plasmaFadeInSpeed);
    framePlasmaCount++;

    if (rx < activeBox.minX) activeBox.minX = rx;
    if (rx > activeBox.maxX) activeBox.maxX = rx;
    if (ry < activeBox.minY) activeBox.minY = ry;
    if (ry > activeBox.maxY) activeBox.maxY = ry;
  }
  return framePlasmaCount;
}

// Liste des cellules à dessiner, construite une fois par image.
export function collectVisibleCells() {
  const cols = S.cols, rows = S.rows;
  const opacity = S.ephemeralOpacity;
  const box = S.activeBox;
  const visibleCells = S.visibleCells;

  visibleCells.length = 0;
  const vcMinY = Math.max(0, box.minY - 2);
  const vcMaxY = Math.min(rows - 1, box.maxY + 2);
  const vcMinX = Math.max(0, box.minX - 2);
  const vcMaxX = Math.min(cols - 1, box.maxX + 2);
  for (let y = vcMinY; y <= vcMaxY; y++) {
    const rowBase = y * cols;
    for (let x = vcMinX; x <= vcMaxX; x++) {
      if (opacity[rowBase + x] > 0.0) visibleCells.push(rowBase + x);
    }
  }
}