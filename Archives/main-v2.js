// On importe notre constructeur de lettres
import { getLetterBitmap } from './font.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('right');

canvas.width = container.clientWidth;
canvas.height = container.clientHeight;

// Typo
const cellSize = 2;   //taille du texte
const textGap = 1;    // Liseré pour le texte (0 = lettres pleines et lisses)
const macroGap = 0;   // Liseré entre les gros blocs de chaos (en pixels)
const macroRatio = 1; // taille blocs de l'animation
const letterSpacing = 1;
const wordSpacing = 3;

// Couleurs
const colorText = '#f0f0f0';          // Texte
const colorHighlight = '#1a1a1a';     // Couleur des lettres en exergue
const colorHighlightBg = '#ffee00f6'; // Couleur du surlignage des lettres en exergue
const baseDecayHue = 270;             // Teinte de départ des traînées (270 = Pourpre/Violet)
const finalDecayHue = 20;             // 20 = orange

// Mise en page
const lineSpacing = 4;
const padding = 40;
const fontHeight = 10;

// Grille (texte)
const cols = Math.floor(canvas.width / cellSize);
const rows = Math.floor(canvas.height / cellSize);
let grid = [];

// Grille Macro (Pour le Jeu de la Vie)
const macroCols = Math.floor(cols / macroRatio);
const macroRows = Math.floor(rows / macroRatio);
let macroGrid = [];

// ==========================================
// 1. PARAMÈTRES PHYSIQUES ET VITESSES (réglages)
// ==========================================
const frameDelay = 2;           // Fluidité (16ms = 60 FPS)

const formationSpeed = 0.0045;    // Vitesse de FORMATION du texte (Gravité qui monte)
const destructionSpeed = 0.006;   // Vitesse d'EXPLOSION du texte (Gravité qui tombe)
const extinctionSpeed = 0.008;    // Vitesse de la mort finale des cellules
const gravityTension = 6;

const silenceDuration = 1;      // Temps de pause dans le noir complet (en frames)
const simmerDuration = 10;       // Durée du fondu d'apparition (ébullition) du nouveau texte

const decaySpeed = 0.2;          
const edgeFadeDistance = 20;
const maxInitialDensity = 0.28;  // Densité de départ (28% de cellules vivantes, idéal pour Conway)

// ==========================================
// 2. COMPTEURS D'ANIMATION (Gérés par le code)
// ==========================================
let gravityForce = 0.0;          // Force d'attraction vers le texte (calculée par la courbe cubique)
let animationProgress = 0.0;     // Progression de la formation/destruction (0.0 à 1.0)
let extinctionProgress = 0.0;    // Progression de l'extinction finale (0.0 à 1.0)
let simmerTimer = simmerDuration;// Compte à rebours de l'ébullition en cours
let silenceTimer = 0;

// ==========================================
// 3. TEXTES ET MACHINE À ÉTATS
// ==========================================
const texts = [
  'Dans le coin gauche de la pièce, il y a un grand *fauteuil moderne*, fait d’une gigantesque *demi-sphère d’altuglas cerclée d’acier*,posée sur un piétement de métal chromé. À côté, un bloc de marbre de section octogonale fait office de table basse ; un briquet d’acier est posé dessus ainsi qu’un *cache-pot cylindrique* d’où émerge un chêne nain, un de ces bonzaï japonais dont la croissance a été à ce point contrôlée, ralentie, modifiée, qu’ils offrent tous les signes de la maturité, voire de la sénescence, en n’ayant pratiquement pas grandi, et dont ceux qui les cultivent disent que leur perfection dépend moins du soin matériel qu’on leur apporte que de la *concentration méditative que leur éleveur leur consacre*.',
  "Le *Jeu de la vie* est un automate cellulaire imaginé par John Horton Conway...",
  "*L'ordre et le chaos* ne sont que deux mots pour désigner une seule et même chose..."
];
let currentTextIndex = 0;

const STATE_SIMMERING = 0;       // Phase 1 : Genèse visuelle et ébullition
const STATE_FORMING = 1;         // Phase 2 : Gravité et formation
const STATE_IDLE = 2;            // Phase 3 : Texte figé en attente
const STATE_DESTRUCTURING = 3;   // Phase 4 : Relâchement de la gravité
const STATE_EXTINCTION = 4;      // Phase 5 : Extinction progressive
const STATE_SILENCE = 5;         // La phase de noir absolu entre deux textes

let currentState = STATE_SIMMERING;

/**
 * Scanne la matrice d'une lettre pour trouver ses limites réelles (minX, maxX)
 * et ignorer les colonnes vides à gauche et à droite.
 */
function getLetterBounds(matrix) {
  let minX = matrix[0].length;
  let maxX = -1;
  let isEmpty = true;

  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x] === 1) {
        isEmpty = false;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  // Si la lettre est totalement vide (comme un espace), on lui donne une largeur par défaut
  if (isEmpty) {
    return { minX: 0, maxX: 0, width: 0 };
  }

  return { minX, maxX, width: (maxX - minX + 1) };
}


// Calcule la largeur réelle d'un mot en pixels/cases.
function measureWord(word) {
  let width = 0;
  for (let i = 0; i < word.length; i++) {
    let char = word[i];
    if (char === '*') continue; // L'astérisque de ciblage ne prend pas de place visuelle

    let bounds = getLetterBounds(getLetterBitmap(char));
    if (bounds.width > 0) {
      width += bounds.width + letterSpacing;
    }
  }
  if (width > 0) width -= letterSpacing; // On retire l'espace en trop après la dernière lettre
  return width;
}

function initGrid(text) {
  grid = [];
  macroGrid = [];

  // 1A. Initialisation de la MACRO-GRILLE avec VOS paramètres de vignettage
  for (let y = 0; y < macroRows; y++) {
    let row = [];
    for (let x = 0; x < macroCols; x++) {
      let distanceX = Math.min(x, macroCols - 1 - x);
      let distanceY = Math.min(y, macroRows - 1 - y);
      let minDistance = Math.min(distanceX, distanceY);

      let macroFadeDistance = edgeFadeDistance / macroRatio;
      let linearFade = Math.min(1.0, minDistance / macroFadeDistance);
      let fadeFactor = linearFade * linearFade * (3 - 2 * linearFade);

      // On utilise maxInitialDensity (0.28)
      let isAlive = Math.random() < (maxInitialDensity * fadeFactor) ? 1 : 0;
      row.push({
        currentState: isAlive,
        targetState: 0
      });
    }
    macroGrid.push(row);
  }

  // 1B. Initialisation de la MICRO-GRILLE (Le dessin final)
  for (let y = 0; y < rows; y++) {
    let row = [];
    for (let x = 0; x < cols; x++) {
      row.push({
        currentState: 0,
        targetState: 0,
        isHighlighted: false,
        age: 0,
        decay: 0,
        decayHue: baseDecayHue,
        isText: false,
        isHighlightBg: false
      });
    }
    grid.push(row);
  }

  // 2. ÉTAPE DE CALCUL : Découpage en lignes
  const maxWidth = cols - (padding * 2); // Largeur max autorisée pour le texte
  let words = text.split(' '); // On sépare le texte par les espaces
  let lines = [];
  let currentLine = { words: [], width: 0 };

  for (let w of words) {
    let wWidth = measureWord(w);
    // Si la ligne n'est pas vide, on compte l'espace avant d'ajouter le mot
    let addedWidth = currentLine.width === 0 ? wWidth : wordSpacing + wWidth;

    // Si le mot fait déborder la ligne (et qu'on a déjà des mots), on passe à la suivante
    if (currentLine.width + addedWidth > maxWidth && currentLine.words.length > 0) {
      lines.push(currentLine);
      currentLine = { words: [w], width: wWidth };
    } else {
      currentLine.words.push(w);
      currentLine.width += addedWidth;
    }
  }
  if (currentLine.words.length > 0) {
    lines.push(currentLine); // On n'oublie pas d'ajouter la toute dernière ligne
  }

  // 3. ÉTAPE DE RENDU : Centrage et dessin
  // Hauteur totale du bloc de texte
  let totalTextHeight = (lines.length * fontHeight) + ((lines.length - 1) * lineSpacing);

  // Centrage vertical
  let startY = Math.floor((rows - totalTextHeight) / 2);
  if (startY < padding) startY = padding; // Sécurité pour ne pas coller en haut

  let cursorY = startY;
  let highlightMode = false;

  // On boucle sur chaque ligne calculée
  for (let line of lines) {

    /*Centrage horizontal de la ligne
    let startX = Math.floor((cols - line.width) / 2);
    if (startX < padding) startX = padding; // Sécurité marge*/

    let cursorX = padding;

    // On boucle sur les mots de la ligne
    for (let word of line.words) {
      // On boucle sur les lettres du mot
      for (let char of word) {
        if (char === '*') {
          highlightMode = !highlightMode;
          continue;
        }

        let letterMatrix = getLetterBitmap(char);
        let bounds = getLetterBounds(letterMatrix);

        if (bounds.width > 0) {

          // --- NOUVEAU : MARQUAGE DU SURLIGNAGE (FOND DE LA LETTRE) ---
          if (highlightMode) {
            for (let hy = 0; hy < letterMatrix.length; hy++) {
              for (let hx = 0; hx < bounds.width + letterSpacing; hx++) {
                let bgY = cursorY + hy;
                let bgX = cursorX + hx;
                if (bgY >= 0 && bgY < rows && bgX >= 0 && bgX < cols) {
                  grid[bgY][bgX].isHighlightBg = true;
                }
              }
            }
          }

          // On tamponne la matrice dans la grille
          for (let ly = 0; ly < letterMatrix.length; ly++) {
            for (let lx = bounds.minX; lx <= bounds.maxX; lx++) {
              if (letterMatrix[ly][lx] === 1) {
                let gridY = cursorY + ly;
                let gridX = cursorX + (lx - bounds.minX);

                if (gridY >= 0 && gridY < rows && gridX >= 0 && gridX < cols) {
                  grid[gridY][gridX].targetState = 1;
                  grid[gridY][gridX].isHighlighted = highlightMode;

                  let macroX = Math.floor(gridX / macroRatio);
                  let macroY = Math.floor(gridY / macroRatio);
                  if (macroX >= 0 && macroX < macroCols && macroY >= 0 && macroY < macroRows) {
                    macroGrid[macroY][macroX].targetState = 1;
                  }
                }
              }
            }
          }
          cursorX += bounds.width + letterSpacing;
        }
      }

      // --- NOUVEAU : MARQUAGE DU SURLIGNAGE (ESPACE ENTRE LES MOTS) ---
      if (highlightMode) {
        for (let hy = 0; hy < fontHeight; hy++) {
          for (let hx = 0; hx < wordSpacing; hx++) {
            let bgY = cursorY + hy;
            let bgX = cursorX + hx;
            if (bgY >= 0 && bgY < rows && bgX >= 0 && bgX < cols) {
              grid[bgY][bgX].isHighlightBg = true;
            }
          }
        }
      }

      cursorX += wordSpacing; // Espace entre les mots
    }
    // On passe à la ligne suivante
    cursorY += fontHeight + lineSpacing;
  }
}

function countMacroNeighbors(x, y) {
  let sum = 0;
  for (let i = -1; i < 2; i++) {
    for (let j = -1; j < 2; j++) {
      if (i === 0 && j === 0) continue;
      let col = x + j;
      let row = y + i;
      if (col >= 0 && col < macroCols && row >= 0 && row < macroRows) {
        sum += macroGrid[row][col].currentState;
      }
    }
  }
  return sum;
}

function resetForGenesis() {
  // 1. On sème TOUT le chaos d'un seul coup (Le Big Bang)
  for (let y = 0; y < macroRows; y++) {
    for (let x = 0; x < macroCols; x++) {
      let distanceX = Math.min(x, macroCols - 1 - x);
      let distanceY = Math.min(y, macroRows - 1 - y);
      let minDistance = Math.min(distanceX, distanceY);

      let macroFadeDistance = edgeFadeDistance / macroRatio;
      let linearFade = Math.min(1.0, minDistance / macroFadeDistance);
      let fadeFactor = linearFade * linearFade * (3 - 2 * linearFade);

      // On crée la vie immédiatement !
      let isAlive = Math.random() < (maxInitialDensity * fadeFactor) ? 1 : 0;
      macroGrid[y][x].currentState = isAlive;
    }
  }

  // 2. On nettoie la micro-grille de ses vieux fantômes
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      grid[y][x].currentState = 0;
      grid[y][x].age = 0;
      grid[y][x].decay = 0;
      grid[y][x].isText = false;
    }
  }
}

function updateGrid() {

  // A. Évolution de la MACRO-GRILLE (Conway + Gravité)
  let nextMacroStates = [];
  for (let y = 0; y < macroRows; y++) {
    nextMacroStates[y] = [];
    for (let x = 0; x < macroCols; x++) {
      let cell = macroGrid[y][x];
      let neighbors = countMacroNeighbors(x, y);
      let nextState = cell.currentState;

      // 1. Règles de Conway
      if (cell.currentState === 1 && (neighbors < 2 || neighbors > 3)) {
        nextState = 0;
      } else if (cell.currentState === 0 && neighbors === 3) {
        nextState = 1;
      }

      // Extinction
      if (extinctionProgress > 0 && Math.random() < extinctionProgress) {
        nextState = 0;
      }

      // --- Les gros blocs sont EUX AUSSI attirés par le texte ! ---
      if (Math.random() < gravityForce) {
        nextState = cell.targetState;
      }

      nextMacroStates[y][x] = nextState;
    }
  }

  // Application immédiate à la macro-grille
  for (let y = 0; y < macroRows; y++) {
    for (let x = 0; x < macroCols; x++) {
      macroGrid[y][x].currentState = nextMacroStates[y][x];
    }
  }

  // B. Mise à jour de la MICRO-GRILLE (Désintégration vers le texte)
  let nextStates = [];
  for (let y = 0; y < rows; y++) {
    nextStates[y] = [];
    for (let x = 0; x < cols; x++) {
      let cell = grid[y][x];

      // 1. On lit l'état du "parent" dans la macro-grille
      let macroX = Math.min(Math.floor(x / macroRatio), macroCols - 1);
      let macroY = Math.min(Math.floor(y / macroRatio), macroRows - 1);
      let macroState = macroGrid[macroY][macroX].currentState;

      // 2. Attracteur Gravitationnel
      // Soit la cellule suit son parent (gros bloc), soit elle rejoint le texte (grain de sable)
      let nextState = macroState;
      let nextIsText = false;

      if (Math.random() < gravityForce) {
        nextState = cell.targetState;
        nextIsText = true;
      }

      // 3. Gestion de l'Âge et de la Rémanence (Identique à avant)
      let nextAge = cell.age;
      let nextDecay = cell.decay;
      let nextDecayHue = cell.decayHue;

      if (nextState === 1) {
        nextAge = (cell.currentState === 1) ? cell.age + 1 : 0;
        nextDecay = 0;
      } else {
        nextAge = 0;
        if (cell.currentState === 1 && cell.age > 0) {
          nextDecay = 1.0;

          let randomVariation = (Math.random() * 30) - 15;
          let ageBonus = Math.min(cell.age * 2, 20);

          // Si la cible (30) est plus petite que le départ (270), on ajoute 360 à la cible (390) 
          // pour forcer le code à passer par les couleurs chaudes (Magenta -> Rouge -> Orange)
          // plutôt que de faire marche arrière par le bleu et le vert.
          let targetHue = finalDecayHue < baseDecayHue ? finalDecayHue + 360 : finalDecayHue;

          // On calcule la couleur exacte à l'instant T selon la gravité
          let currentBaseHue = baseDecayHue + ((targetHue - baseDecayHue) * gravityForce);

          // On applique le modulo 360 à la toute fin pour rester sur la roue
          nextDecayHue = (currentBaseHue + ageBonus + randomVariation) % 360;

        } else if (cell.decay > 0) {
          nextDecay = Math.max(0, cell.decay - decaySpeed);
        } else {
          nextDecay = 0;
        }
      }

      nextStates[y][x] = {
        state: nextState,
        age: nextAge,
        decay: nextDecay,
        decayHue: nextDecayHue,
        isText: nextIsText
      };
    }
  }

  // Application des états à la micro-grille
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

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Le surlignage ne commence à apparaître QUE quand la gravité dépasse 0.8 (80%)
  let highlightAlpha = 0;
  if (gravityForce > 0.8) {
    highlightAlpha = (gravityForce - 0.8) * 5;
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let cell = grid[y][x];
      let drawHighlightBg = cell.isHighlightBg && highlightAlpha > 0;

      // Optimisation : On ne rentre que s'il y a quelque chose à dessiner
      if (cell.currentState === 1 || cell.decay > 0 || drawHighlightBg) {

        let gapX = 0;
        let gapY = 0;

        if (cell.currentState === 1 || cell.decay > 0) {
          // 1. Si la cellule est vivante ou laisse une traînée :
          // Elle respecte SON état physique (brique de texte ou gros bloc de chaos)
          if (cell.isText) {
            gapX = textGap;
            gapY = textGap;
          } else {
            gapX = ((x + 1) % macroRatio === 0) ? macroGap : 0;
            gapY = ((y + 1) % macroRatio === 0) ? macroGap : 0;
          }
        } else if (drawHighlightBg) {
          // 2. Si c'est une case VIDE qui doit afficher le surlignage de fond :
          // Elle épouse parfaitement le liseré du texte.
          gapX = textGap;
          gapY = textGap;
        }

        let w = Math.max(0, cellSize - gapX);
        let h = Math.max(0, cellSize - gapY);

        // --- LE FONDU D'APPARITION (GENÈSE) ---
        let cellGenesisAlpha = 1.0;
        if (currentState === STATE_SIMMERING) {
          // On traduit le timer en progression de 0.0 à 1.0
          let genesisProgress = 1.0 - (simmerTimer / simmerDuration);

          // Un fade-in simple, global et uniforme pour toutes les cellules
          cellGenesisAlpha = genesisProgress;
        }

        // --- DESSIN ---
        if (cell.currentState === 1) {
          ctx.globalAlpha = cellGenesisAlpha; // On applique le fondu d'apparition
          ctx.fillStyle = colorText;
          ctx.fillRect(x * cellSize, y * cellSize, w, h);

          if (cell.isHighlighted && highlightAlpha > 0) {
            ctx.globalAlpha = cellGenesisAlpha * highlightAlpha;
            ctx.fillStyle = colorHighlight;
            ctx.fillRect(x * cellSize, y * cellSize, w, h);
          }

        } else if (cell.decay > 0) {
          let lightness = cell.decay * 45;
          ctx.globalAlpha = cellGenesisAlpha; // La traînée de mort subit aussi le fondu
          ctx.fillStyle = `hsl(${cell.decayHue}, 100%, ${lightness}%)`;
          ctx.fillRect(x * cellSize, y * cellSize, w, h);

        } else if (drawHighlightBg) {
          ctx.globalAlpha = cellGenesisAlpha * highlightAlpha;
          ctx.fillStyle = colorHighlightBg;
          ctx.fillRect(x * cellSize, y * cellSize, w, h);
        }

        ctx.globalAlpha = 1.0; // Réinitialisation de sécurité

      }
    }
  }
}

function animate() {
  updateGrid();
  drawGrid();

  if (currentState === STATE_SIMMERING) {
    // 1. Ébullition (Le nouveau texte apparaît doucement)
    simmerTimer--;
    if (simmerTimer <= 0) {
      currentState = STATE_FORMING;
    }
  } 
  else if (currentState === STATE_FORMING) {
    // 2. Formation (Utilise formationSpeed)
    animationProgress += formationSpeed;
    if (animationProgress >= 1.0) {
      animationProgress = 1.0;
      currentState = STATE_IDLE;
    }
  } 
  else if (currentState === STATE_DESTRUCTURING) {
    // 4. Déstructuration (Utilise destructionSpeed)
    animationProgress -= destructionSpeed;
    if (animationProgress <= 0.0) {
      animationProgress = 0.0;
      currentState = STATE_EXTINCTION;
    }
  } 
  else if (currentState === STATE_EXTINCTION) {
    // 5. Mort des cellules
    extinctionProgress += extinctionSpeed;
    if (extinctionProgress >= 1.0) {
      extinctionProgress = 1.0; // On s'assure que tout est bien mort
      
      // On passe au temps mort (Silence)
      silenceTimer = silenceDuration; 
      currentState = STATE_SILENCE;
    }
  }
  else if (currentState === STATE_SILENCE) {
    // 6. NOUVEAU : Le temps mort absolu dans le noir
    silenceTimer--;
    if (silenceTimer <= 0) {
      // Fin du silence, on charge le texte suivant !
      extinctionProgress = 0.0;
      animationProgress = 0.0;
      currentTextIndex = (currentTextIndex + 1) % texts.length;
      
      initGrid(texts[currentTextIndex]); 
      
      simmerTimer = simmerDuration; 
      currentState = STATE_SIMMERING; 
    }
  }

  gravityForce = Math.pow(animationProgress, gravityTension);
  setTimeout(() => requestAnimationFrame(animate), frameDelay);
}

// --- GESTION DU BOUTON ---
const toggleBtn = document.getElementById('toggle-btn');
if (toggleBtn) {
  toggleBtn.innerText = 'Passer au texte suivant';

  toggleBtn.addEventListener('click', () => {
    // Au lieu d'utiliser animationDirection, on vérifie l'état de notre machine.
    // On ne permet de détruire le texte que s'il est fini (IDLE) ou en train de se former (FORMING).
    if (currentState === STATE_IDLE || currentState === STATE_FORMING) {
      currentState = STATE_DESTRUCTURING; // On déclenche la phase 4 !
    }
  });
}

// Lancement initial de la machine (n'oubliez pas ces deux lignes à la toute fin !)
initGrid(texts[currentTextIndex]);
animate();