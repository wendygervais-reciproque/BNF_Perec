// ==========================================
// 1. PARAMÈTRES DYNAMIQUES (DICTIONNAIRE)
// ==========================================
// Couleurs par défaut lues depuis static/style.css (:root) ; restent
// modifiables en direct via le panneau de contrôle (control_panel.js).
const cssColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const PARAMS = {
  // Le Limier
  NOISE_SCALE: 0.008,
  maxConeAngleDegrees: 100,

  // Le Défibrillateur
  defibDensity: 0.25,
  defibEphemeralSparks: 0.005,
  defibRadius: 8,

  // Quota
  maxPlasmaCells: 2500,

  // Transitions Physiques
  fadeInSpeed: 0.8,
  fadeOutSpeed: 0.4,
  accelerationSpeed: 0.6,

  // Transitions du Plasma
  plasmaFadeInSpeed: 0.5,
  plasmaFadeOutSpeed: 0.03,
  plasmaExtinctionSpeed: 0.02,
  collisionCoolingSpeed: 0.04,

  // Esthétique & Couleurs
  colorPhysical: cssColor('--color-anim-physical'),
  colorHighlight: cssColor('--color-anim-highlight'),
  colorEphemeral: cssColor('--color-anim-ephemeral'),
  colorCollision: cssColor('--color-anim-collision'),
  alphaEphemeral: 0.8,
  cellGap: 0
};

// Paramètres figés
const BLOCK_W = 6;
const BLOCK_H = 10;
const spawnMarginX = 0.05;
const spawnMarginY = 0.15;

// ==========================================
// 2. VARIABLES D'ÉTAT & MÉMOIRE
// ==========================================
let cols, rows, cellSize = 2;
let time = 0;
let blocks = [];
let particles = [];
let currentMode = 'CHAOS';
let globalInertia = 1.0;
let lastFramePlasmaCount = 0;

export let crystallizationProgress = 0.0;

// Grilles en TypedArrays 1D — index : y * cols + x
let ephemeralState;      // Uint8Array  (0 ou 1)
let ephemeralOpacity;    // Float32Array
let ephemeralHeat;       // Float32Array
let nextEphemeralState;  // Uint8Array
let nextEphemeralOpacity;// Float32Array
let nextEphemeralHeat;   // Float32Array
let aliveGrid;           // Uint8Array  (0 ou 1)

let activeBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

// Liste des cellules visibles construite dans update(), consommée dans draw()
let visibleCells = [];

export function getGridDimensions(canvasWidth, canvasHeight, mainCellSize) {
  if (mainCellSize) cellSize = mainCellSize;
  cols = Math.floor(canvasWidth / cellSize);
  rows = Math.floor(canvasHeight / cellSize);

  const size = rows * cols;
  ephemeralState      = new Uint8Array(size);
  ephemeralOpacity    = new Float32Array(size);
  ephemeralHeat       = new Float32Array(size);
  nextEphemeralState  = new Uint8Array(size);
  nextEphemeralOpacity= new Float32Array(size);
  nextEphemeralHeat   = new Float32Array(size);
  aliveGrid           = new Uint8Array(size);
  visibleCells        = [];

  activeBox = { minX: 0, maxX: cols - 1, minY: 0, maxY: rows - 1 };
  return { cols, rows };
}

export function getStats() {
  return {
    particles: particles.length,
    plasma: lastFramePlasmaCount,
    state: currentMode
  };
}

export function init() {
  blocks = []; particles = []; currentMode = 'CHAOS'; time = 0; globalInertia = 1.0;
  lastFramePlasmaCount = 0;
  crystallizationProgress = 0.0;
  ephemeralState.fill(0);
  ephemeralOpacity.fill(0);
  ephemeralHeat.fill(0);
  nextEphemeralState.fill(0);
  nextEphemeralOpacity.fill(0);
  nextEphemeralHeat.fill(0);
  visibleCells = [];
}

export function isTextFullyFormed() {
  if (currentMode !== 'FORMATION' || blocks.length === 0) return false;
  return blocks.every(b => b.state === 'DOCKED');
}

// ==========================================
// CONTRÔLE DES ÉTATS
// ==========================================
export function startChaos() {
  currentMode = 'CHAOS'; globalInertia = 1.0;
  crystallizationProgress = 0.0;
  for (let b of blocks) b.state = 'WANDERING';
  for (let p of particles) if (p.state === 'BORN') p.state = 'ALIVE';
}

export function startFormation(textPixels) {
  if (textPixels.length === 0) return;
  currentMode = 'FORMATION'; globalInertia = 0.0;
  crystallizationProgress = 0.0;

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

  let activeParticles = particles.filter(p => p.state !== 'DYING');
  let dyingParticles = particles.filter(p => p.state === 'DYING');
  let difference = requiredSlots.length - activeParticles.length;

  let mX = Math.floor(cols * spawnMarginX);
  let mY = Math.floor(rows * spawnMarginY);
  let spawnW = cols - (mX * 2);
  let spawnH = rows - (mY * 2);

  if (difference > 0) {
    for (let i = 0; i < difference; i++) {
      activeParticles.push({
        x: mX + Math.floor(Math.random() * spawnW), y: mY + Math.floor(Math.random() * spawnH),
        parentBlock: null, isCollected: false,
        isAlive: true, nextAlive: true, state: 'BORN', alpha: -Math.random() * 2.0
      });
    }
  } else if (difference < 0) {
    let excess = activeParticles.splice(requiredSlots.length);
    for (let p of excess) { p.state = 'DYING'; p.parentBlock = null; p.alpha = 1.0 + Math.random() * 2.0; dyingParticles.push(p); }
  }

  activeParticles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  requiredSlots.sort((a, b) => {
    let absYa = newBlocksMap[a.parentBlockKey].targetY + a.localY;
    let absXa = newBlocksMap[a.parentBlockKey].targetX + a.localX;
    let absYb = newBlocksMap[b.parentBlockKey].targetY + b.localY;
    let absXb = newBlocksMap[b.parentBlockKey].targetX + b.localX;
    return (absYa - absYb) || (absXa - absXb);
  });

  blocks = [];
  for (let key in newBlocksMap) blocks.push(newBlocksMap[key]);

  for (let i = 0; i < activeParticles.length; i++) {
    let p = activeParticles[i], slot = requiredSlots[i], block = newBlocksMap[slot.parentBlockKey];
    p.localX = slot.localX; p.localY = slot.localY; p.isHighlighted = slot.isHighlighted;
    p.parentBlock = block; p.isCollected = false; p.isAlive = true;
    if (p.state !== 'BORN') { p.state = 'ALIVE'; p.alpha = 1.0; }
    block.elements.push(p);
  }
  particles = [...activeParticles, ...dyingParticles];

  for (let b of blocks) {
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

// ==========================================
// 3. MOTEUR DE BRUIT ET INTELLIGENCE
// ==========================================
const perm = new Uint8Array(512);
const p_arr = new Uint8Array([151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,234,137,133,222,143,76,78,134,103,121,111,90,203,7,253,13,25,124,115,103,95,190,57,196,142,74,157,40,15,212,189,93,121,156,211,67,64,44,239,218,180,245,217,162,156,233,96,22,239,122,81,131,76,132,157,11,108,189,28,42,223,184,57,163,221,66,220,31,242,210,126,172,13,22,130,214,118,78,121,108,86,28,42,34,184,150,32,213,221,137,208,68,141,128,195,134,95,129,36,191,7,122,160,95,161,243,11,183,119,166,120,241,138,216,161,162,3,23,115,154,150,78,81,108,28,42,126,169,118,78,121,108,86,183,120,241,138,216,161,162,122,160,95,161,243,11,183,119,166,120,241,138,216,161,162,3,23,115,154,150,78,81,108,28,42,126,169,118,78,121,108,86]);
for (let i=0; i<512; i++) perm[i] = p_arr[i & 255];
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }
function grad(hash, x, y, z) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function noise(x, y, z) {
  let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  let u = fade(x), v = fade(y), w = fade(z);
  let a = perm[X]+Y, aa = perm[a]+Z, ab = perm[a+1]+Z, b = perm[X+1]+Y, ba = perm[b]+Z, bb = perm[b+1]+Z;
  return lerp(w, lerp(v, lerp(u, grad(perm[aa  ], x  , y  , z   ), grad(perm[ba  ], x-1, y  , z   )), lerp(u, grad(perm[ab  ], x  , y-1, z   ), grad(perm[bb  ], x-1, y-1, z   ))),
                 lerp(v, lerp(u, grad(perm[aa+1], x  , y  , z-1 ), grad(perm[ba+1], x-1, y  , z-1 )), lerp(u, grad(perm[ab+1], x  , y-1, z-1 ), grad(perm[bb+1], x-1, y-1, z-1 ))));
}

function getHoundMove(currentX, currentY, targetX, targetY, identityOffset) {
  let dx = targetX - currentX, dy = targetY - currentY;
  if (dx === 0 && dy === 0) return { moveX: 0, moveY: 0 };
  let targetAngle = Math.atan2(dy, dx), dist = Math.abs(dx) + Math.abs(dy);
  let maxConeAngleRadians = PARAMS.maxConeAngleDegrees * (Math.PI / 180);
  let coneWidth = Math.min(maxConeAngleRadians, (dist / 100.0) * maxConeAngleRadians);
  let n = noise(currentX * PARAMS.NOISE_SCALE, currentY * PARAMS.NOISE_SCALE, time + identityOffset);
  let actualAngle = targetAngle + (n - 0.5) * coneWidth;

  if (Math.abs(Math.cos(actualAngle)) > Math.abs(Math.sin(actualAngle))) return { moveX: Math.cos(actualAngle) > 0 ? 1 : -1, moveY: 0 };
  else return { moveX: 0, moveY: Math.sin(actualAngle) > 0 ? 1 : -1 };
}

// ==========================================
// 4. BOUCLE PRINCIPALE
// ==========================================
export function update(dt, speedMultiplier = 1.0) {
  time += dt * 0.5;

  if (currentMode === 'FORMATION') {
    globalInertia += dt * PARAMS.accelerationSpeed;
    if (globalInertia > 1.0) globalInertia = 1.0;
  }

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

  let steps = Math.floor(speedMultiplier) + (Math.random() < (speedMultiplier % 1) ? 1 : 0);
  let textIsFormed = isTextFullyFormed();

  if (textIsFormed) {
    crystallizationProgress = Math.min(1.0, crystallizationProgress + PARAMS.plasmaExtinctionSpeed);
  }

  for (let s = 0; s < steps; s++) {

    // --- A. DÉPLACEMENT PHYSIQUE ---
    if (currentMode === 'CHAOS') {
      for (let p of particles) {
        if (!p.isCollected) {
          let n = noise(p.x * PARAMS.NOISE_SCALE, p.y * PARAMS.NOISE_SCALE, time);
          let angle = n * Math.PI * 4;
          if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) p.x += Math.sign(Math.cos(angle)) || 1;
          else p.y += Math.sign(Math.sin(angle)) || 1;
          p.x = (p.x + cols) % cols; p.y = (p.y + rows) % rows;
        }
      }
      for (let b of blocks) {
        let n = noise(b.x * PARAMS.NOISE_SCALE, b.y * PARAMS.NOISE_SCALE, time + b.targetX);
        let angle = n * Math.PI * 4;
        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) b.x += Math.sign(Math.cos(angle)) || 1;
        else b.y += Math.sign(Math.sin(angle)) || 1;
        b.x = (b.x + cols) % cols; b.y = (b.y + rows) % rows;
        for (let p of b.elements) {
          if (p.isCollected) { p.x = (b.x + p.localX + cols) % cols; p.y = (b.y + p.localY + rows) % rows; }
        }
      }
    }
    else {
      for (let p of particles) {
        if (p.state === 'DYING') {
          let n = noise(p.x * PARAMS.NOISE_SCALE, p.y * PARAMS.NOISE_SCALE, time);
          let angle = n * Math.PI * 4;
          if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) p.x += Math.sign(Math.cos(angle)) || 1;
          else p.y += Math.sign(Math.sin(angle)) || 1;
          p.x = (p.x + cols) % cols; p.y = (p.y + rows) % rows;
        }
      }

      for (let b of blocks) {
        if (b.state === 'DOCKED') continue;

        if (b.state === 'ASSEMBLING') {
          // Remplacement des .filter() répétés par des compteurs directs
          let uncollectedCount = 0, collectedCount = 0;
          for (let p of b.elements) {
            if (p.isCollected) collectedCount++;
            else uncollectedCount++;
          }

          for (let p of b.elements) {
            if (p.isCollected) continue;
            if (Math.random() > globalInertia) continue;
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
            if (collectedCount >= 1 && Math.random() <= globalInertia) {
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
          if (Math.random() <= globalInertia) {
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
    if (lastFramePlasmaCount > PARAMS.maxPlasmaCells) plasmaHealth = Math.max(0.05, PARAMS.maxPlasmaCells / lastFramePlasmaCount);

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

      // Boucle Conway avec offsets de lignes précompilés (évite cols multiplications dans l'inner loop)
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
      activeBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

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
      for (let b of blocks) {
        if (b.state === 'DOCKED') continue;

        // Remplacement du .filter() par un comptage direct
        let aliveCount = 0, collectedCount = 0;
        for (let p of b.elements) {
          if (!p.isCollected) continue;
          collectedCount++;
          if (p.nextAlive) aliveCount++;
        }

        if (aliveCount < 3 && collectedCount > 0) {
          // Sélectionner un élément collecté aléatoire sans créer de tableau intermédiaire
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

      // Les Comètes
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

    for (let p of particles) {
      let px = Math.floor(p.x), py = Math.floor(p.y);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        if (p.nextAlive && p.alpha > 0 && p.state !== 'DYING') {
          nextEphemeralState[py * cols + px] = 0;
        }
      }
    }

    lastFramePlasmaCount = currentFramePlasmaCount;

    let tempState = ephemeralState; ephemeralState = nextEphemeralState; nextEphemeralState = tempState;
    let tempOpacity = ephemeralOpacity; ephemeralOpacity = nextEphemeralOpacity; nextEphemeralOpacity = tempOpacity;
    let tempHeat = ephemeralHeat; ephemeralHeat = nextEphemeralHeat; nextEphemeralHeat = tempHeat;

    for (let p of particles) p.isAlive = p.nextAlive;
  }

  // Construction de visibleCells après le dernier step pour draw()
  // Évite de scanner activeBox deux fois dans draw() (une fois par passe couleur)
  visibleCells.length = 0;
  const vcMinY = Math.max(0, activeBox.minY - 2);
  const vcMaxY = Math.min(rows - 1, activeBox.maxY + 2);
  const vcMinX = Math.max(0, activeBox.minX - 2);
  const vcMaxX = Math.min(cols - 1, activeBox.maxX + 2);
  for (let y = vcMinY; y <= vcMaxY; y++) {
    const rowBase = y * cols;
    for (let x = vcMinX; x <= vcMaxX; x++) {
      if (ephemeralOpacity[rowBase + x] > 0.0) visibleCells.push(rowBase + x);
    }
  }
}

// ==========================================
// 5. RENDU GRAPHIQUE — Path2D batching
// ==========================================
const N_BUCKETS = 8;

export function draw(ctx) {
  // PASSES ÉPHÉMÈRES : on regroupe les cellules par bucket d'opacité (8 niveaux)
  // pour remplacer N changements de globalAlpha par 8 appels fill()
  const ePaths = [];
  const hPaths = [];
  for (let i = 0; i < N_BUCKETS; i++) {
    ePaths.push(new Path2D());
    hPaths.push(new Path2D());
  }

  let hasHeat = false;
  const cs = cellSize, csm1 = cellSize - PARAMS.cellGap;

  for (let k = 0; k < visibleCells.length; k++) {
    const idx = visibleCells[k];
    const opacity = ephemeralOpacity[idx];
    if (opacity <= 0) continue;

    const x = idx % cols;
    const y = (idx / cols) | 0;
    const px = x * cs, py = y * cs;

    const eBucket = Math.min(N_BUCKETS - 1, (opacity * N_BUCKETS) | 0);
    ePaths[eBucket].rect(px, py, csm1, csm1);

    const heat = ephemeralHeat[idx];
    if (heat > 0) {
      // La chaleur module l'opacité effective : opacity * heat
      const hBucket = Math.min(N_BUCKETS - 1, (opacity * heat * N_BUCKETS) | 0);
      hPaths[hBucket].rect(px, py, csm1, csm1);
      hasHeat = true;
    }
  }

  // PASSE 1 : BASE VIOLETTE
  ctx.fillStyle = PARAMS.colorEphemeral;
  for (let i = 0; i < N_BUCKETS; i++) {
    ctx.globalAlpha = PARAMS.alphaEphemeral * (i + 0.5) / N_BUCKETS;
    ctx.fill(ePaths[i]);
  }

  // PASSE 2 : CHALEUR DES COLLISIONS (CYAN)
  if (hasHeat) {
    ctx.fillStyle = PARAMS.colorCollision;
    for (let i = 0; i < N_BUCKETS; i++) {
      ctx.globalAlpha = PARAMS.alphaEphemeral * (i + 0.5) / N_BUCKETS;
      ctx.fill(hPaths[i]);
    }
  }

  // PASSE 3 : PARTICULES DURES
  // On sépare les particules à alpha plein (1 seul fill() global) des particules
  // en transition (BORN/DYING, traitées individuellement car rares)
  const pathRegular = new Path2D();
  const pathHighlightBase = new Path2D();
  const pathHighlightOverlay = new Path2D();

  for (let p of particles) {
    if (!p.isAlive) continue;
    const alpha = p.alpha ?? 1.0;
    if (alpha <= 0) continue;
    if (alpha < 0.995) continue; // transitions traitées dans le second loop

    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    if (isLocked && p.isHighlighted) {
      pathHighlightBase.rect(p.x * cs, p.y * cs, csm1, csm1);
      if (crystallizationProgress > 0) pathHighlightOverlay.rect(p.x * cs, p.y * cs, csm1, csm1);
    } else {
      pathRegular.rect(p.x * cs, p.y * cs, csm1, csm1);
    }
  }

  ctx.globalAlpha = 1.0;
  ctx.fillStyle = PARAMS.colorPhysical;
  ctx.fill(pathRegular);
  ctx.fill(pathHighlightBase);

  if (crystallizationProgress > 0) {
    ctx.globalAlpha = crystallizationProgress;
    ctx.fillStyle = PARAMS.colorHighlight;
    ctx.fill(pathHighlightOverlay);
  }

  // Particules en transition (rares — BORN/DYING uniquement)
  for (let p of particles) {
    if (!p.isAlive) continue;
    const alpha = Math.max(0, Math.min(1, p.alpha ?? 1.0));
    if (alpha <= 0 || alpha >= 0.995) continue;

    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PARAMS.colorPhysical;
    ctx.fillRect(p.x * cs, p.y * cs, csm1, csm1);

    if (isLocked && p.isHighlighted && crystallizationProgress > 0) {
      ctx.globalAlpha = alpha * crystallizationProgress;
      ctx.fillStyle = PARAMS.colorHighlight;
      ctx.fillRect(p.x * cs, p.y * cs, csm1, csm1);
    }
  }

  ctx.globalAlpha = 1.0;
}
