// Le plasma — phases B à F d'un pas de simulation.
//
// Une grille d'automate cellulaire (règles de Conway) couvre le canvas. Les
// particules l'ensemencent en se déplaçant, il leur sert en retour de
// condition de survie : une particule collectée ne vit que si sa cellule vit.
// C'est ce couplage qui fait vaciller le texte pendant qu'il se forme.
//
// Trois garde-fous s'y ajoutent :
//   · un quota, qui bride la natalité quand le plasma prolifère ;
//   · un défibrillateur, qui ranime un bloc au bord de l'extinction ;
//   · l'effacement du plasma sous les particules, qui détache le texte en
//     négatif de la nuée.
//
// Tout se joue dans une fenêtre englobante (activeBox) plutôt que sur le
// canvas entier : c'est ce qui rend l'automate tenable à 60 images/seconde.

import { S } from './state.js';
import { PARAMS } from './params.js';

export function stepPlasma(textIsFormed) {
  const cols = S.cols, rows = S.rows;
  const particles = S.particles;
  const blocks = S.blocks;
  const aliveGrid = S.aliveGrid;

  // Les tampons sont échangés en fin de pas : ils sont relus à chaque appel,
  // et extraits ici en locales pour éviter un accès propriété par cellule.
  const ephemeralState = S.ephemeralState;
  const ephemeralOpacity = S.ephemeralOpacity;
  const ephemeralHeat = S.ephemeralHeat;
  const nextEphemeralState = S.nextEphemeralState;
  const nextEphemeralOpacity = S.nextEphemeralOpacity;
  const nextEphemeralHeat = S.nextEphemeralHeat;
  const activeBox = S.activeBox;

  // --- B. FENÊTRE ACTIVE ET REPORT DU PAS PRÉCÉDENT ---
  let minX = cols, maxX = 0, minY = rows, maxY = 0;

  for (let p of particles) {
    let px = Math.floor(p.x), py = Math.floor(p.y);
    if (px >= 0 && px < cols && py >= 0 && py < rows) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
  }

  // On balaie un peu plus large que la fenêtre du pas précédent : le plasma
  // en cours d'extinction doit être reporté et refroidi même hors zone.
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

  S.framePlasmaCount = 0;

  // Quota : au-delà de maxPlasmaCells, la natalité est bridée dans la même
  // proportion. Lissé plutôt que couperet, pour ne pas faire clignoter le fond.
  S.plasmaHealth = 1.0;
  if (S.lastFramePlasmaCount > PARAMS.maxPlasmaCells) {
    S.plasmaHealth = Math.max(0.05, PARAMS.maxPlasmaCells / S.lastFramePlasmaCount);
  }

  if (minX <= maxX && minY <= maxY) {
    activeBox.minX = Math.max(0, minX - 2); activeBox.maxX = Math.min(cols - 1, maxX + 2);
    activeBox.minY = Math.max(0, minY - 2); activeBox.maxY = Math.min(rows - 1, maxY + 2);

    // Voisinage du pas : plasma vivant, plus les particules libres qui
    // l'ensemencent
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

    // Règles de Conway, avec offsets de lignes précompilés pour épargner
    // cols multiplications par cellule
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

        // Texte formé : plus aucune naissance, le plasma s'éteint
        if (textIsFormed) {
          nextEphemeralState[idx] = 0;
        } else {
          if (isAlive && (neighbors === 2 || neighbors === 3)) {
            nextEphemeralState[idx] = 1;
          } else if (!isAlive && neighbors === 3) {
            if (Math.random() <= S.plasmaHealth) {
              nextEphemeralState[idx] = 1;
              nextEphemeralHeat[idx] = 1.0;
            }
          }
        }

        if (nextEphemeralState[idx] === 1) {
          nextEphemeralOpacity[idx] = Math.min(1.0, ephemeralOpacity[idx] + PARAMS.plasmaFadeInSpeed);
          S.framePlasmaCount++;
        } else {
          const currentFadeSpeed = textIsFormed ? PARAMS.plasmaExtinctionSpeed : PARAMS.plasmaFadeOutSpeed;
          nextEphemeralOpacity[idx] = Math.max(0.0, ephemeralOpacity[idx] - currentFadeSpeed);
          if (nextEphemeralOpacity[idx] > 0) S.framePlasmaCount++;
        }
      }
    }
  } else {
    // Remise à zéro en place, et non par un nouvel objet : les phases
    // suivantes gardent une référence sur cette même boîte.
    activeBox.minX = 0; activeBox.maxX = 0; activeBox.minY = 0; activeBox.maxY = 0;
  }

  // --- C. SURVIE DES PARTICULES ---
  // Les particules libres et celles des blocs arrivés sont toujours vivantes ;
  // seules les collectées d'un bloc encore en route dépendent du plasma.
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
    stepDefibrillator(blocks, cols, rows, nextEphemeralState, nextEphemeralOpacity, nextEphemeralHeat, activeBox);
    stepComets(particles, cols, rows, nextEphemeralState, nextEphemeralOpacity, nextEphemeralHeat, activeBox);
  }

  // --- F. LES PARTICULES CREUSENT LEUR CELLULE ---
  for (let p of particles) {
    let px = Math.floor(p.x), py = Math.floor(p.y);
    if (px >= 0 && px < cols && py >= 0 && py < rows) {
      if (p.nextAlive && p.alpha > 0 && p.state !== 'DYING') {
        nextEphemeralState[py * cols + px] = 0;
      }
    }
  }

  S.lastFramePlasmaCount = S.framePlasmaCount;

  // Échange des tampons : le suivant devient le courant
  S.ephemeralState = nextEphemeralState; S.nextEphemeralState = ephemeralState;
  S.ephemeralOpacity = nextEphemeralOpacity; S.nextEphemeralOpacity = ephemeralOpacity;
  S.ephemeralHeat = nextEphemeralHeat; S.nextEphemeralHeat = ephemeralHeat;

  for (let p of particles) p.isAlive = p.nextAlive;
}

// --- D. LE DÉFIBRILLATEUR ---
// Un bloc dont il ne reste presque plus rien de vivant se ranime autour d'un
// de ses éléments tiré au sort, et projette des étincelles alentour. Sans
// cela, un bloc éteint ne se reformerait jamais et le texte resterait troué.
function stepDefibrillator(blocks, cols, rows, nextState, nextOpacity, nextHeat, activeBox) {
  for (let b of blocks) {
    if (b.state === 'DOCKED') continue;

    let aliveCount = 0, collectedCount = 0;
    for (let p of b.elements) {
      if (!p.isCollected) continue;
      collectedCount++;
      if (p.nextAlive) aliveCount++;
    }

    if (aliveCount >= 3 || collectedCount === 0) continue;

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

    const currentSparkChance = PARAMS.defibEphemeralSparks * S.plasmaHealth;
    if (currentSparkChance <= 0.0) continue;

    for (let i = -PARAMS.defibRadius; i <= PARAMS.defibRadius; i++) {
      const ty = ry + i;
      if (ty < 0 || ty >= rows) continue;
      const tRowBase = ty * cols;
      for (let j = -PARAMS.defibRadius; j <= PARAMS.defibRadius; j++) {
        const tx = rx + j;
        if (tx < 0 || tx >= cols) continue;
        if (Math.random() < currentSparkChance) {
          const tidx = tRowBase + tx;
          if (nextState[tidx] === 1) nextHeat[tidx] = 1.0;
          nextState[tidx] = 1;
          nextOpacity[tidx] = Math.min(1.0, nextOpacity[tidx] + PARAMS.plasmaFadeInSpeed);
          S.framePlasmaCount++;

          // L'étincelle peut tomber hors de la fenêtre : on l'étend
          if (tx < activeBox.minX) activeBox.minX = tx;
          if (tx > activeBox.maxX) activeBox.maxX = tx;
          if (ty < activeBox.minY) activeBox.minY = ty;
          if (ty > activeBox.maxY) activeBox.maxY = ty;
        }
      }
    }
  }
}

// --- E. LES COMÈTES ---
// Chaque particule libre sème un peu de plasma sur son passage : c'est ce qui
// donne leur traînée aux particules errantes.
function stepComets(particles, cols, rows, nextState, nextOpacity, nextHeat, activeBox) {
  for (let p of particles) {
    let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    if (isLocked || p.alpha <= 0.0) continue;
    if (Math.random() >= PARAMS.defibEphemeralSparks * S.plasmaHealth * 8) continue;

    let rx = Math.floor(p.x), ry = Math.floor(p.y);
    if (rx < 0 || rx >= cols || ry < 0 || ry >= rows) continue;

    const ridx = ry * cols + rx;
    if (nextState[ridx] === 1) nextHeat[ridx] = 1.0;
    nextState[ridx] = 1;
    nextOpacity[ridx] = Math.min(1.0, nextOpacity[ridx] + PARAMS.plasmaFadeInSpeed);
    S.framePlasmaCount++;

    if (rx < activeBox.minX) activeBox.minX = rx;
    if (rx > activeBox.maxX) activeBox.maxX = rx;
    if (ry < activeBox.minY) activeBox.minY = ry;
    if (ry > activeBox.maxY) activeBox.maxY = ry;
  }
}

// Liste des cellules à dessiner, construite une fois par image plutôt qu'une
// fois par passe de couleur dans le rendu.
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
