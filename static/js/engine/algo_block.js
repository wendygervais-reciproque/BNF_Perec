// Moteur d'animation — boucle de simulation.
//
// Le texte généré n'est pas du texte : c'est une nuée de particules qui
// s'assemblent en blocs, convergent vers leur position cible, et laissent
// derrière elles un plasma régi par un automate cellulaire.
//
// Ce fichier porte la boucle et l'API publique ; le reste est réparti :
//   state.js      l'état partagé
//   params.js     les réglages
//   noise.js      le champ de bruit
//   formation.js  l'appariement particules / emplacements
//   renderer.js   le dessin

import { S, allocateGrids, resetState } from './state.js';
import { PARAMS } from './params.js';
import { noise } from './noise.js';
import { startFormation, startChaos, isTextFullyFormed } from './formation.js';

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
// vers 1 une fois formé. Pilote l'extinction du plasma et l'apparition de
// l'exergue des mots imposés (lue par main.js pour le fond d'exergue).
export function getCrystallization() {
  return S.crystallizationProgress;
}

// ==========================================
// LE LIMIER — déplacement d'une case vers une cible
// ==========================================
// Le déplacement n'est jamais direct : l'angle vers la cible est dévié par le
// champ de bruit, dans un cône d'autant plus large que la cible est loin.
// D'où une approche sinueuse de loin, qui se redresse à mesure qu'on arrive.
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

// Errance d'un point dans le champ de bruit, avec enroulement aux bords.
function wander(entity, cols, rows, offset) {
  let n = noise(entity.x * PARAMS.NOISE_SCALE, entity.y * PARAMS.NOISE_SCALE, S.time + offset);
  let angle = n * Math.PI * 4;
  if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) entity.x += Math.sign(Math.cos(angle)) || 1;
  else entity.y += Math.sign(Math.sin(angle)) || 1;
  entity.x = (entity.x + cols) % cols;
  entity.y = (entity.y + rows) % rows;
}

// ==========================================
// BOUCLE PRINCIPALE
// ==========================================
export function update(dt, speedMultiplier = 1.0) {
  const cols = S.cols, rows = S.rows;
  const particles = S.particles;
  const blocks = S.blocks;
  const aliveGrid = S.aliveGrid;

  S.time += dt * 0.5;

  if (S.currentMode === 'FORMATION') {
    S.globalInertia += dt * PARAMS.accelerationSpeed;
    if (S.globalInertia > 1.0) S.globalInertia = 1.0;
  }

  // Fondus d'entrée et de sortie
  for (let p of particles) {
    if (p.state === 'BORN') {
      p.alpha += (dt * speedMultiplier) * PARAMS.fadeInSpeed;
      if (p.alpha >= 1.0) { p.alpha = 1.0; p.state = 'ALIVE'; }
    } else if (p.state === 'DYING') {
      p.alpha -= (dt * speedMultiplier) * PARAMS.fadeOutSpeed;
    }
  }
  // Suppression en place des particules mortes (évite la création d'un nouveau tableau)
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].state === 'DYING' && particles[i].alpha <= 0.0) particles.splice(i, 1);
  }

  // Le multiplicateur fractionnaire est réparti aléatoirement : à 0,4 on
  // exécute un pas 40 % des images plutôt que 0,4 pas à chaque image.
  let steps = Math.floor(speedMultiplier) + (Math.random() < (speedMultiplier % 1) ? 1 : 0);
  let textIsFormed = isTextFullyFormed();

  if (textIsFormed) {
    S.crystallizationProgress = Math.min(1.0, S.crystallizationProgress + PARAMS.plasmaExtinctionSpeed);
  }

  for (let s = 0; s < steps; s++) {
    // Les tampons sont échangés en fin de pas : ils doivent être relus ici,
    // et non hissés hors de cette boucle.
    const ephemeralState = S.ephemeralState;
    const ephemeralOpacity = S.ephemeralOpacity;
    const ephemeralHeat = S.ephemeralHeat;
    const nextEphemeralState = S.nextEphemeralState;
    const nextEphemeralOpacity = S.nextEphemeralOpacity;
    const nextEphemeralHeat = S.nextEphemeralHeat;
    const activeBox = S.activeBox;

    // --- A. DÉPLACEMENT PHYSIQUE ---
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
    }
    else {
      for (let p of particles) {
        if (p.state === 'DYING') wander(p, cols, rows, 0);
      }

      for (let b of blocks) {
        if (b.state === 'DOCKED') continue;

        if (b.state === 'ASSEMBLING') {
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
          } else {
            // Le bloc va lui-même à la rencontre de sa particule la plus proche
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

            for (let p of b.elements) {
              if (!p.isCollected && b.x + p.localX === p.x && b.y + p.localY === p.y) p.isCollected = true;
              if (p.isCollected) { p.x = b.x + p.localX; p.y = b.y + p.localY; }
            }
          }
        }
        else if (b.state === 'MIGRATING') {
          if (Math.random() <= S.globalInertia) {
            let move = getHoundMove(b.x, b.y, b.targetX, b.targetY, b.targetX + b.targetY);
            b.x += move.moveX; b.y += move.moveY;
          }
          for (let p of b.elements) { p.x = b.x + p.localX; p.y = b.y + p.localY; }
          if (b.x === b.targetX && b.y === b.targetY) b.state = 'DOCKED';
        }
      }
    }

    // --- B. CONWAY AVEC QUOTA LISSÉ ---
    let minX = cols, maxX = 0, minY = rows, maxY = 0;

    for (let p of particles) {
      let px = Math.floor(p.x), py = Math.floor(p.y);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }

    let oldMinX = Math.max(0, activeBox.minX - 5), oldMaxX = Math.min(cols - 1, activeBox.maxX + 5);
    let oldMinY = Math.max(0, activeBox.minY - 5), oldMaxY = Math.min(rows - 1, activeBox.maxY + 5);

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
        nextEphemeralHeat[idx] = Math.max(0.0, ephemeralHeat[idx] - PARAMS.collisionCoolingSpeed);
      }
    }

    let currentFramePlasmaCount = 0;
    let plasmaHealth = 1.0;
    if (S.lastFramePlasmaCount > PARAMS.maxPlasmaCells) plasmaHealth = Math.max(0.05, PARAMS.maxPlasmaCells / S.lastFramePlasmaCount);

    if (minX <= maxX && minY <= maxY) {
      activeBox.minX = Math.max(0, minX - 2); activeBox.maxX = Math.min(cols - 1, maxX + 2);
      activeBox.minY = Math.max(0, minY - 2); activeBox.maxY = Math.min(rows - 1, maxY + 2);

      for (let y = activeBox.minY; y <= activeBox.maxY; y++) {
        const rowBase = y * cols;
        for (let x = activeBox.minX; x <= activeBox.maxX; x++) {
          if (ephemeralState[rowBase + x] === 1) aliveGrid[rowBase + x] = 1;
        }
      }

      for (let p of particles) {
        let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
        if (!isLocked && p.isAlive && p.alpha > 0.0) {
          let px = Math.floor(p.x), py = Math.floor(p.y);
          if (px >= activeBox.minX && px <= activeBox.maxX && py >= activeBox.minY && py <= activeBox.maxY) {
            aliveGrid[py * cols + px] = 1;
          }
        }
      }

      // Offsets de lignes précompilés : évite cols multiplications dans la boucle interne
      for (let y = activeBox.minY; y <= activeBox.maxY; y++) {
        const rowPrev = (y - 1) * cols;
        const rowCurr = y * cols;
        const rowNext = (y + 1) * cols;

        for (let x = activeBox.minX; x <= activeBox.maxX; x++) {
          const idx = rowCurr + x;
          let neighbors = 0;
          if (y > 0 && y < rows - 1 && x > 0 && x < cols - 1) {
            neighbors = aliveGrid[rowPrev + x - 1] + aliveGrid[rowPrev + x] + aliveGrid[rowPrev + x + 1] +
                        aliveGrid[rowCurr + x - 1]                           + aliveGrid[rowCurr + x + 1] +
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
            nextEphemeralOpacity[idx] = Math.min(1.0, ephemeralOpacity[idx] + PARAMS.plasmaFadeInSpeed);
            currentFramePlasmaCount++;
          } else {
            const currentFadeSpeed = textIsFormed ? PARAMS.plasmaExtinctionSpeed : PARAMS.plasmaFadeOutSpeed;
            nextEphemeralOpacity[idx] = Math.max(0.0, ephemeralOpacity[idx] - currentFadeSpeed);
            if (nextEphemeralOpacity[idx] > 0) currentFramePlasmaCount++;
          }
        }
      }
    } else {
      // Remise à zéro en place, et non par un nouvel objet : les étapes D et E
      // qui suivent gardent une référence sur cette même boîte.
      activeBox.minX = 0; activeBox.maxX = 0; activeBox.minY = 0; activeBox.maxY = 0;
    }

    // --- C. SURVIE DES PARTICULES ---
    // Une particule collectée ne survit que si sa cellule de plasma survit :
    // c'est ce qui fait vaciller le texte pendant sa formation.
    for (let p of particles) {
      let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
      if (isLocked || !p.isCollected) p.nextAlive = true;
      else {
        let px = Math.floor(p.x), py = Math.floor(p.y);
        if (px >= 0 && px < cols && py >= 0 && py < rows) p.nextAlive = (nextEphemeralState[py * cols + px] === 1);
        else p.nextAlive = false;
      }
    }

    if (!textIsFormed) {
      // --- D. LE DÉFIBRILLATEUR ---
      // Un bloc dont il ne reste presque plus rien de vivant se ranime autour
      // d'un de ses éléments, sans quoi il s'éteindrait définitivement.
      for (let b of blocks) {
        if (b.state === 'DOCKED') continue;

        let aliveCount = 0, collectedCount = 0;
        for (let p of b.elements) {
          if (!p.isCollected) continue;
          collectedCount++;
          if (p.nextAlive) aliveCount++;
        }

        if (aliveCount < 3 && collectedCount > 0) {
          // Tirage d'un élément collecté sans créer de tableau intermédiaire
          let targetIdx = Math.floor(Math.random() * collectedCount);
          let rootP = null, ci = 0;
          for (let p of b.elements) {
            if (!p.isCollected) continue;
            if (ci === targetIdx) { rootP = p; break; }
            ci++;
          }
          if (!rootP) continue;

          let rx = Math.floor(rootP.x), ry = Math.floor(rootP.y);

          for (let p of b.elements) {
            if (!p.isCollected) continue;
            let dx = Math.abs(p.localX - rootP.localX), dy = Math.abs(p.localY - rootP.localY);
            if (dx <= PARAMS.defibRadius && dy <= PARAMS.defibRadius && Math.random() < PARAMS.defibDensity) p.nextAlive = true;
          }

          const currentSparkChance = PARAMS.defibEphemeralSparks * plasmaHealth;
          if (currentSparkChance > 0.0) {
            for (let i = -PARAMS.defibRadius; i <= PARAMS.defibRadius; i++) {
              const ty = ry + i;
              if (ty < 0 || ty >= rows) continue;
              const tRowBase = ty * cols;
              for (let j = -PARAMS.defibRadius; j <= PARAMS.defibRadius; j++) {
                const tx = rx + j;
                if (tx < 0 || tx >= cols) continue;
                if (Math.random() < currentSparkChance) {
                  const tidx = tRowBase + tx;
                  if (nextEphemeralState[tidx] === 1) nextEphemeralHeat[tidx] = 1.0;
                  nextEphemeralState[tidx] = 1;
                  nextEphemeralOpacity[tidx] = Math.min(1.0, nextEphemeralOpacity[tidx] + PARAMS.plasmaFadeInSpeed);
                  currentFramePlasmaCount++;

                  if (tx < activeBox.minX) activeBox.minX = tx;
                  if (tx > activeBox.maxX) activeBox.maxX = tx;
                  if (ty < activeBox.minY) activeBox.minY = ty;
                  if (ty > activeBox.maxY) activeBox.maxY = ty;
                }
              }
            }
          }
        }
      }

      // --- E. LES COMÈTES ---
      // Chaque particule libre sème un peu de plasma sur son passage.
      for (let p of particles) {
        let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
        if (!isLocked && p.alpha > 0.0 && Math.random() < PARAMS.defibEphemeralSparks * plasmaHealth * 8) {
          let rx = Math.floor(p.x), ry = Math.floor(p.y);
          if (rx >= 0 && rx < cols && ry >= 0 && ry < rows) {
            const ridx = ry * cols + rx;
            if (nextEphemeralState[ridx] === 1) nextEphemeralHeat[ridx] = 1.0;
            nextEphemeralState[ridx] = 1;
            nextEphemeralOpacity[ridx] = Math.min(1.0, nextEphemeralOpacity[ridx] + PARAMS.plasmaFadeInSpeed);
            currentFramePlasmaCount++;

            if (rx < activeBox.minX) activeBox.minX = rx;
            if (rx > activeBox.maxX) activeBox.maxX = rx;
            if (ry < activeBox.minY) activeBox.minY = ry;
            if (ry > activeBox.maxY) activeBox.maxY = ry;
          }
        }
      }
    }

    // --- F. LES PARTICULES CREUSENT LEUR CELLULE ---
    // Une particule visible efface le plasma sous elle : le texte se détache
    // en négatif de la nuée.
    for (let p of particles) {
      let px = Math.floor(p.x), py = Math.floor(p.y);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        if (p.nextAlive && p.alpha > 0 && p.state !== 'DYING') {
          nextEphemeralState[py * cols + px] = 0;
        }
      }
    }

    S.lastFramePlasmaCount = currentFramePlasmaCount;

    // Échange des tampons : le suivant devient le courant
    S.ephemeralState = nextEphemeralState; S.nextEphemeralState = ephemeralState;
    S.ephemeralOpacity = nextEphemeralOpacity; S.nextEphemeralOpacity = ephemeralOpacity;
    S.ephemeralHeat = nextEphemeralHeat; S.nextEphemeralHeat = ephemeralHeat;

    for (let p of particles) p.isAlive = p.nextAlive;
  }

  // Liste des cellules visibles, construite une fois pour le rendu : évite de
  // rebalayer la fenêtre active à chaque passe de couleur dans draw()
  const visibleCells = S.visibleCells;
  const opacity = S.ephemeralOpacity;
  const box = S.activeBox;
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
