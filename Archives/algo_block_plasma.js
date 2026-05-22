// ==========================================
// 1. PARAMÈTRES ET COULEURS
// ==========================================
let cols, rows;
let cellSize = 2;

const BLOCK_W = 6;
const BLOCK_H = 10;

// --- Le Limier (Déplacement Organique) ---
const NOISE_SCALE = 0.008; 
const maxConeAngleDegrees = 100; 

// --- Le Défibrillateur ---
const defibDensity = 0.4;       
const defibEphemeralSparks = 0.005; 
const defibRadius = 8;          

// --- Transitions des Particules Physiques ---
const fadeInSpeed = 0.8;  
const fadeOutSpeed = 0.8; 
const accelerationSpeed = 0.4; 

// --- Transitions du Plasma Éphémère (NOUVEAU SYSTÈME) ---
const plasmaFadeInSpeed = 0.2;       // Vitesse d'allumage des étincelles (0 = lent, 1 = instantané)
const plasmaFadeOutSpeed = 0.05;     // Vitesse de disparition de la traînée pendant le vol
const plasmaExtinctionSpeed = 0.02;  // Vitesse de disparition (nettoyage) une fois le texte garé

// --- Zone d'apparition (Spawn) ---
const spawnMarginX = 0.05; 
const spawnMarginY = 0.15; 

// --- Esthétique ---
const colorPhysical = '#f0f0f0';
const colorHighlight = '#1a1a1a';
const colorEphemeral = '#6925e9'; 
const alphaEphemeral = 0.8;      

// ==========================================
// 2. VARIABLES D'ÉTAT
// ==========================================
let time = 0; 
let blocks = [];
let particles = []; 
let currentMode = 'CHAOS';
let globalInertia = 1.0; 

// Séparation stricte : La logique d'un côté, le rendu visuel de l'autre
let ephemeralState = [];   // 0 ou 1
let ephemeralOpacity = []; // 0.0 à 1.0

export function getGridDimensions(canvasWidth, canvasHeight, mainCellSize) {
  if (mainCellSize) cellSize = mainCellSize;
  cols = Math.floor(canvasWidth / cellSize);
  rows = Math.floor(canvasHeight / cellSize);
  ephemeralState = Array(rows).fill(0).map(() => Array(cols).fill(0));
  ephemeralOpacity = Array(rows).fill(0).map(() => Array(cols).fill(0.0));
  return { cols, rows };
}

export function init() {
  blocks = []; particles = []; currentMode = 'CHAOS'; time = 0; globalInertia = 1.0;
  ephemeralState = Array(rows).fill(0).map(() => Array(cols).fill(0));
  ephemeralOpacity = Array(rows).fill(0).map(() => Array(cols).fill(0.0));
}

export function isTextFullyFormed() {
  if (currentMode !== 'FORMATION' || blocks.length === 0) return false;
  return blocks.every(b => b.state === 'DOCKED');
}

export function startChaos() {
  currentMode = 'CHAOS'; globalInertia = 1.0; 
  for (let b of blocks) b.state = 'WANDERING';
  for (let p of particles) if (p.state === 'BORN') p.state = 'ALIVE';
}

export function startFormation(textPixels) {
  if (textPixels.length === 0) return;
  currentMode = 'FORMATION'; globalInertia = 0.0; 

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
        x: mX + Math.floor(Math.random() * spawnW), 
        y: mY + Math.floor(Math.random() * spawnH),
        parentBlock: null, isCollected: false,
        isAlive: true, nextAlive: true, state: 'BORN', alpha: -Math.random() * 2.0 
      });
    }
  } else if (difference < 0) {
    let excess = activeParticles.splice(requiredSlots.length);
    for (let p of excess) {
      p.state = 'DYING'; p.parentBlock = null; p.alpha = 1.0 + Math.random() * 2.0; 
      dyingParticles.push(p);
    }
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
    p.localX = slot.localX; p.localY = slot.localY;
    p.isHighlighted = slot.isHighlighted; 
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

    let closestP = b.elements[0];
    let minDist = Infinity;
    
    for (let p of b.elements) {
      let targetBx = p.x - p.localX;
      let targetBy = p.y - p.localY;
      let dist = Math.abs(targetBx - cgX) + Math.abs(targetBy - cgY);
      if (dist < minDist) { minDist = dist; closestP = p; }
    }

    b.x = closestP.x - closestP.localX;
    b.y = closestP.y - closestP.localY;
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
  let dx = targetX - currentX;
  let dy = targetY - currentY;
  
  if (dx === 0 && dy === 0) return { moveX: 0, moveY: 0 };

  let targetAngle = Math.atan2(dy, dx);
  let dist = Math.abs(dx) + Math.abs(dy);

  let maxConeAngleRadians = maxConeAngleDegrees * (Math.PI / 180);
  let maxDist = 100.0;
  let coneWidth = Math.min(maxConeAngleRadians, (dist / maxDist) * maxConeAngleRadians);

  let n = noise(currentX * NOISE_SCALE, currentY * NOISE_SCALE, time + identityOffset);
  let actualAngle = targetAngle + (n - 0.5) * coneWidth;

  if (Math.abs(Math.cos(actualAngle)) > Math.abs(Math.sin(actualAngle))) {
    return { moveX: Math.cos(actualAngle) > 0 ? 1 : -1, moveY: 0 };
  } else {
    return { moveX: 0, moveY: Math.sin(actualAngle) > 0 ? 1 : -1 };
  }
}

// ==========================================
// 4. BOUCLE PRINCIPALE
// ==========================================
export function update(dt, speedMultiplier = 1.0) {
  time += dt * 0.5; 

  if (currentMode === 'FORMATION') {
    globalInertia += dt * accelerationSpeed;
    if (globalInertia > 1.0) globalInertia = 1.0;
  }

  for (let p of particles) {
    if (p.state === 'BORN') {
      p.alpha += (dt * speedMultiplier) * fadeInSpeed; 
      if (p.alpha >= 1.0) { p.alpha = 1.0; p.state = 'ALIVE'; }
    } else if (p.state === 'DYING') {
      p.alpha -= (dt * speedMultiplier) * fadeOutSpeed; 
    }
  }
  particles = particles.filter(p => p.state !== 'DYING' || p.alpha > 0.0);

  let steps = Math.floor(speedMultiplier) + (Math.random() < (speedMultiplier % 1) ? 1 : 0);
  let textIsFormed = isTextFullyFormed(); 

  for (let s = 0; s < steps; s++) {

    // --- A. DÉPLACEMENT PHYSIQUE ---
    if (currentMode === 'CHAOS') {
      for (let p of particles) {
        if (!p.isCollected) {
          let n = noise(p.x * NOISE_SCALE, p.y * NOISE_SCALE, time);
          let angle = n * Math.PI * 4; 
          if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) p.x += Math.sign(Math.cos(angle)) || 1;
          else p.y += Math.sign(Math.sin(angle)) || 1;
          p.x = (p.x + cols) % cols; p.y = (p.y + rows) % rows;
        }
      }
      for (let b of blocks) {
        let n = noise(b.x * NOISE_SCALE, b.y * NOISE_SCALE, time + b.targetX);
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
      for (let b of blocks) {
        if (b.state === 'DOCKED') continue;

        if (b.state === 'ASSEMBLING') {
          let uncollected = b.elements.filter(p => !p.isCollected);
          let collected = b.elements.filter(p => p.isCollected);

          for (let p of uncollected) {
            if (Math.random() > globalInertia) continue; 
            let expectedX = b.x + p.localX, expectedY = b.y + p.localY;
            let move = getHoundMove(p.x, p.y, expectedX, expectedY, p.localX + p.localY);
            p.x += move.moveX; p.y += move.moveY;
          }

          for (let p of b.elements) {
            if (!p.isCollected && b.x + p.localX === p.x && b.y + p.localY === p.y) p.isCollected = true;
          }
          uncollected = b.elements.filter(p => !p.isCollected);

          if (uncollected.length === 0) b.state = 'MIGRATING';
          else {
            if (collected.length >= 1 && Math.random() <= globalInertia) { 
              let closestP = null, minDist = Infinity;
              for (let p of uncollected) {
                let dist = Math.abs((p.x - p.localX) - b.x) + Math.abs((p.y - p.localY) - b.y);
                if (dist < minDist) { minDist = dist; closestP = p; }
              }
              let move = getHoundMove(b.x, b.y, closestP.x - closestP.localX, closestP.y - closestP.localY, b.targetX);
              b.x += move.moveX; b.y += move.moveY;
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

    // --- B. CONWAY UNIVERSEL SÉPARÉ (Logique vs Visuel) ---
    
    // 1. Détecter ce qui est VRAIMENT vivant pour les règles de Conway
    let aliveGrid = Array(rows).fill(0).map(() => Array(cols).fill(0));
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) if (ephemeralState[y][x] === 1) aliveGrid[y][x] = 1;
    }
    
    for (let p of particles) {
      let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
      // CORRECTION DU FLASH : Les particules en train de mourir ne simulent plus la vie de Conway !
      if (!isLocked && p.isAlive && p.alpha > 0.0 && p.state !== 'DYING') {
        let px = Math.floor(p.x), py = Math.floor(p.y);
        if (px >= 0 && px < cols && py >= 0 && py < rows) aliveGrid[py][px] = 1;
      }
    }

    let nextEphemeralState = Array(rows).fill(0).map(() => Array(cols).fill(0));
    let nextEphemeralOpacity = Array(rows).fill(0).map(() => Array(cols).fill(0.0));

    // 2. Moteur de Conway + Gestion de l'Opacité
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let neighbors = 0;
        if (y > 0 && y < rows - 1 && x > 0 && x < cols - 1) {
          neighbors = aliveGrid[y-1][x-1] + aliveGrid[y-1][x] + aliveGrid[y-1][x+1] +
                      aliveGrid[y][x-1]                       + aliveGrid[y][x+1] +
                      aliveGrid[y+1][x-1] + aliveGrid[y+1][x] + aliveGrid[y+1][x+1];
        }

        let isAlive = (ephemeralState[y][x] === 1);
        
        // Logique stricte
        if (textIsFormed) {
          nextEphemeralState[y][x] = 0; // Extinction forcée
        } else {
          if (isAlive && (neighbors === 2 || neighbors === 3)) nextEphemeralState[y][x] = 1;
          else if (!isAlive && neighbors === 3) nextEphemeralState[y][x] = 1;
        }

        // Rendu Visuel lissé (Fade In / Fade Out du plasma)
        let targetOpacity = nextEphemeralState[y][x] === 1 ? 1.0 : 0.0;
        
        if (targetOpacity === 1.0) {
          nextEphemeralOpacity[y][x] = Math.min(1.0, ephemeralOpacity[y][x] + plasmaFadeInSpeed);
        } else {
          // Disparition lente pendant le vol, disparition rapide à la fin
          let currentFadeSpeed = textIsFormed ? plasmaExtinctionSpeed : plasmaFadeOutSpeed;
          nextEphemeralOpacity[y][x] = Math.max(0.0, ephemeralOpacity[y][x] - currentFadeSpeed);
        }
      }
    }

    // 3. Survie des particules solides par rapport à la grille logique
    for (let p of particles) {
      let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
      if (isLocked || !p.isCollected) p.nextAlive = true; 
      else {
        let px = Math.floor(p.x), py = Math.floor(p.y);
        if (px >= 0 && px < cols && py >= 0 && py < rows) p.nextAlive = (nextEphemeralState[py][px] === 1);
        else p.nextAlive = false;
      }
    }

    // 4. Le Défibrillateur (Intervient sur l'état logique)
    if (!textIsFormed) {
      for (let b of blocks) {
        if (b.state === 'DOCKED') continue;
        let collectedElements = b.elements.filter(p => p.isCollected);
        let aliveCount = 0;
        for (let p of collectedElements) if (p.nextAlive) aliveCount++;

        if (aliveCount < 3 && collectedElements.length > 0) {
          let rootP = collectedElements[Math.floor(Math.random() * collectedElements.length)];
          let rx = Math.floor(rootP.x), ry = Math.floor(rootP.y);

          for (let p of collectedElements) {
            let dx = Math.abs(p.localX - rootP.localX), dy = Math.abs(p.localY - rootP.localY);
            if (dx <= defibRadius && dy <= defibRadius && Math.random() < defibDensity) p.nextAlive = true;
          }

          for(let i = -defibRadius; i <= defibRadius; i++) {
            for(let j = -defibRadius; j <= defibRadius; j++) {
              if (ry+i >= 0 && ry+i < rows && rx+j >= 0 && rx+j < cols && Math.random() < defibEphemeralSparks) {
                nextEphemeralState[ry+i][rx+j] = 1;
                // On donne un petit coup de pouce visuel immédiat pour que l'étincelle soit visible sans latence
                nextEphemeralOpacity[ry+i][rx+j] = Math.min(1.0, nextEphemeralOpacity[ry+i][rx+j] + plasmaFadeInSpeed);
              }
            }
          }
        }
      }
    }

    // 5. Nettoyage visuel sous les particules solides
    for (let p of particles) {
      let px = Math.floor(p.x), py = Math.floor(p.y);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        // Seulement si la particule est saine, elle efface le plasma sous elle pour ne pas faire doublon visuel
        if (p.nextAlive && p.alpha > 0 && p.state !== 'DYING') {
          nextEphemeralOpacity[py][px] = 0.0;
          nextEphemeralState[py][px] = 0;
        }
      }
    }

    ephemeralState = nextEphemeralState;
    ephemeralOpacity = nextEphemeralOpacity;
    for (let p of particles) p.isAlive = p.nextAlive;
  }
}

// ==========================================
// 5. RENDU GRAPHIQUE
// ==========================================
export function draw(ctx) {
  ctx.fillStyle = colorEphemeral;
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (ephemeralOpacity[y][x] > 0.0) {
        // L'opacité est gérée directement par notre nouvelle matrice lissée
        ctx.globalAlpha = alphaEphemeral * ephemeralOpacity[y][x]; 
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }

  for (let p of particles) {
    if (!p.isAlive) continue; 
    let renderAlpha = Math.max(0, Math.min(1, p.alpha || 1.0));
    if (renderAlpha <= 0) continue; 

    let isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    ctx.globalAlpha = renderAlpha; 
    
    if (isLocked && p.isHighlighted) ctx.fillStyle = colorHighlight;
    else ctx.fillStyle = colorPhysical;

    ctx.fillRect(p.x * cellSize, p.y * cellSize, cellSize - 1, cellSize - 1);
  }
  ctx.globalAlpha = 1.0; 
}