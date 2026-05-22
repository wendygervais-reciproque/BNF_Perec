// ==========================================
// 1. PARAMÈTRES SPÉCIFIQUES À CONWAY
// ==========================================

// --- Animation & Temps (Ease-in) ---
const formationTime = 3.0;     // Durée de la formation (en secondes)
const destructionTime = 1.5;   // Durée de la destruction (en secondes)
const easeInPower = 7;         // Puissance de la courbe : 5 = Très lent au début, fulgurant à la fin

// --- La Traînée Lumineuse (Decay) ---
const decaySpeed = 0.1;       // Vitesse d'effacement de la trace (0.01 = très long, 0.2 = très court)
const baseDecayHue = 270;      // Teinte HSL de début (ex: 270 = Violet)
const finalDecayHue = 20;      // Teinte HSL de fin (ex: 20 = Orange/Rouge)

// --- Grille & Typographie ---
let cellSize = 2;
const textGap = 1;
const macroGap = 0;
const macroRatio = 1;

// --- Couleurs ---
const colorText = '#f0f0f0';
const colorHighlight = '#1a1a1a';
const colorHighlightBg = '#ffee00f6';

// --- Physique originelle ---
const edgeFadeDistance = 20;
const maxInitialDensity = 0.28;

// ==========================================
// 2. VARIABLES D'ÉTAT
// ==========================================
let cols, rows, macroCols, macroRows;
let grid = [], macroGrid = [];

let currentMode = 'CHAOS';
let internalProgress = 0.0; // Le chronomètre linéaire interne (0.0 à 1.0)

export function getGridDimensions(canvasWidth, canvasHeight, mainCellSize) {
  if (mainCellSize) cellSize = mainCellSize; 
  cols = Math.floor(canvasWidth / cellSize);
  rows = Math.floor(canvasHeight / cellSize);
  macroCols = Math.floor(cols / macroRatio);
  macroRows = Math.floor(rows / macroRatio);
  return { cols, rows };
}

export function init() {
  grid = [];
  macroGrid = [];
  currentMode = 'CHAOS';
  internalProgress = 0.0;

  for (let y = 0; y < macroRows; y++) {
    let row = [];
    for (let x = 0; x < macroCols; x++) {
      let distanceX = Math.min(x, macroCols - 1 - x);
      let distanceY = Math.min(y, macroRows - 1 - y);
      let linearFade = Math.min(1.0, Math.min(distanceX, distanceY) / (edgeFadeDistance / macroRatio));
      let fadeFactor = linearFade * linearFade * (3 - 2 * linearFade);
      let isAlive = Math.random() < (maxInitialDensity * fadeFactor) ? 1 : 0;
      row.push({ currentState: isAlive, targetState: 0 });
    }
    macroGrid.push(row);
  }

  for (let y = 0; y < rows; y++) {
    let row = [];
    for (let x = 0; x < cols; x++) {
      row.push({
        currentState: 0, targetState: 0, isHighlighted: false,
        age: 0, decay: 0, decayHue: baseDecayHue,
        isText: false, isHighlightBg: false
      });
    }
    grid.push(row);
  }
}

// ==========================================
// 3. L'ADAPTATEUR POUR LE CHEF D'ORCHESTRE
// ==========================================
export function startChaos() {
  currentMode = 'CHAOS';
}

export function startFormation(textPixels) {
  currentMode = 'FORMATION';
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      grid[y][x].targetState = 0;
      grid[y][x].isHighlighted = false;
      grid[y][x].isHighlightBg = false;
    }
  }
  for (let y = 0; y < macroRows; y++) {
    for (let x = 0; x < macroCols; x++) {
      macroGrid[y][x].targetState = 0;
    }
  }

  for (let p of textPixels) {
    if (p.y >= 0 && p.y < rows && p.x >= 0 && p.x < cols) {
      grid[p.y][p.x].targetState = 1;
      grid[p.y][p.x].isHighlighted = p.isHighlighted;
      let mX = Math.floor(p.x / macroRatio), mY = Math.floor(p.y / macroRatio);
      if (mX >= 0 && mX < macroCols && mY >= 0 && mY < macroRows) macroGrid[mY][mX].targetState = 1;
    }
  }
}

export function isTextFullyFormed() {
  return internalProgress >= 1.0;
}

// ==========================================
// 4. LA PHYSIQUE ET L'EASE-IN
// ==========================================
export function update(dt, speedMultiplier = 1.0) {
  // --- 1. Gestion du temps linéaire ---
  if (currentMode === 'FORMATION') {
    internalProgress = Math.min(1.0, internalProgress + (dt * speedMultiplier) / formationTime);
  } else {
    internalProgress = Math.max(0.0, internalProgress - (dt * speedMultiplier) / destructionTime);
  }

  // --- 2. Application de l'Ease-In sur la gravité ---
  let gravityForce = Math.pow(internalProgress, easeInPower);
  let extinctionProgress = currentMode === 'CHAOS' ? (1.0 - internalProgress) : 0.0;

  // --- 3. L'algorithme de Conway ---
  let nextMacroStates = [];
  for (let y = 0; y < macroRows; y++) {
    nextMacroStates[y] = [];
    for (let x = 0; x < macroCols; x++) {
      let cell = macroGrid[y][x];
      let sum = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          let c = x + j, r = y + i;
          if (c >= 0 && c < macroCols && r >= 0 && r < macroRows) sum += macroGrid[r][c].currentState;
        }
      }
      let nextState = cell.currentState;
      if (cell.currentState === 1 && (sum < 2 || sum > 3)) nextState = 0;
      else if (cell.currentState === 0 && sum === 3) nextState = 1;

      if (extinctionProgress > 0 && Math.random() < (extinctionProgress * 0.05)) nextState = 0;
      if (Math.random() < gravityForce) nextState = cell.targetState;
      nextMacroStates[y][x] = nextState;
    }
  }
  for (let y = 0; y < macroRows; y++) for (let x = 0; x < macroCols; x++) macroGrid[y][x].currentState = nextMacroStates[y][x];

  let nextStates = [];
  for (let y = 0; y < rows; y++) {
    nextStates[y] = [];
    for (let x = 0; x < cols; x++) {
      let cell = grid[y][x];
      let mX = Math.min(Math.floor(x / macroRatio), macroCols - 1);
      let mY = Math.min(Math.floor(y / macroRatio), macroRows - 1);
      let nextState = macroGrid[mY][mX].currentState;
      let nextIsText = false;

      if (Math.random() < gravityForce) {
        nextState = cell.targetState;
        nextIsText = true;
      }

      // --- 4. Gestion de la Traînée lumineuse (Decay) ---
      let nextAge = cell.age, nextDecay = cell.decay, nextDecayHue = cell.decayHue;
      if (nextState === 1) {
        nextAge = (cell.currentState === 1) ? cell.age + 1 : 0;
        nextDecay = 0;
      } else {
        nextAge = 0;
        if (cell.currentState === 1 && cell.age > 0) {
          nextDecay = 1.0;
          let targetHue = finalDecayHue < baseDecayHue ? finalDecayHue + 360 : finalDecayHue;
          let currentBaseHue = baseDecayHue + ((targetHue - baseDecayHue) * gravityForce);
          nextDecayHue = (currentBaseHue + Math.min(cell.age * 2, 20) + (Math.random() * 30 - 15)) % 360;
        } else if (cell.decay > 0) {
          // Utilisation de NOTRE variable personnalisable
          nextDecay = Math.max(0, cell.decay - decaySpeed);
        } else {
          nextDecay = 0;
        }
      }
      nextStates[y][x] = { state: nextState, age: nextAge, decay: nextDecay, decayHue: nextDecayHue, isText: nextIsText };
    }
  }
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      grid[y][x].currentState = nextStates[y][x].state;
      grid[y][x].age = nextStates[y][x].age;
      grid[y][x].decay = nextStates[y][x].decay;
      grid[y][x].decayHue = nextStates[y][x].decayHue;
      grid[y][x].isText = nextStates[y][x].isText;
    }
  }
}

export function draw(ctx) {
  let gravityForce = Math.pow(internalProgress, easeInPower);
  let highlightAlpha = gravityForce > 0.8 ? (gravityForce - 0.8) * 5 : 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let cell = grid[y][x];
      let drawHighlightBg = cell.isHighlightBg && highlightAlpha > 0;

      if (cell.currentState === 1 || cell.decay > 0 || drawHighlightBg) {
        let gapX = 0, gapY = 0;
        if (cell.currentState === 1 || cell.decay > 0) {
          gapX = cell.isText ? textGap : (((x + 1) % macroRatio === 0) ? macroGap : 0);
          gapY = cell.isText ? textGap : (((y + 1) % macroRatio === 0) ? macroGap : 0);
        } else if (drawHighlightBg) {
          gapX = textGap; gapY = textGap;
        }

        let w = Math.max(0, cellSize - gapX);
        let h = Math.max(0, cellSize - gapY);

        if (cell.currentState === 1) {
          ctx.fillStyle = colorText;
          ctx.fillRect(x * cellSize, y * cellSize, w, h);
          if (cell.isHighlighted && highlightAlpha > 0) {
            ctx.globalAlpha = highlightAlpha;
            ctx.fillStyle = colorHighlight;
            ctx.fillRect(x * cellSize, y * cellSize, w, h);
            ctx.globalAlpha = 1.0;
          }
        } else if (cell.decay > 0) {
          ctx.fillStyle = `hsl(${cell.decayHue}, 100%, ${cell.decay * 45}%)`;
          ctx.fillRect(x * cellSize, y * cellSize, w, h);
        } else if (drawHighlightBg) {
          ctx.globalAlpha = highlightAlpha;
          ctx.fillStyle = colorHighlightBg;
          ctx.fillRect(x * cellSize, y * cellSize, w, h);
          ctx.globalAlpha = 1.0;
        }
      }
    }
  }
}