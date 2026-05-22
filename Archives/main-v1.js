// On importe notre constructeur de lettres
import { getLetterBitmap } from './font.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('right');
console.log(container.clientWidth);
console.log(container.clientHeight);

canvas.width = container.clientWidth;
canvas.height = container.clientHeight;

// Typo
const cellSize = 4; //taille du texte
const letterSpacing = 1;
const wordSpacing = 4;

// Mise en page
const lineSpacing = 4;
const padding = 40;
const fontHeight = 10;

// Grille
const cols = Math.floor(canvas.width / cellSize);
const rows = Math.floor(canvas.height / cellSize);

let grid = [];

// Animation
let gravityForce = 0.0;
let animationProgress = 0.0;
const animationSpeed = 0.015;
let decaySpeed = 0.4;
const edgeFadeDistance = 20;   // distance du vignettage
const maxInitialDensity = 0.4; // 0.4 = 40% de cellules vivantes, idéal pour Conway


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
  // 1. Initialisation de la grille (avec dégradé radial vers les bords)
  for (let y = 0; y < rows; y++) {
    let row = [];
    for (let x = 0; x < cols; x++) {

      // A. Calculer la distance vers le bord le plus proche (haut, bas, gauche ou droite)
      let distanceX = Math.min(x, cols - 1 - x);
      let distanceY = Math.min(y, rows - 1 - y);
      let minDistance = Math.min(distanceX, distanceY);

      // B. Linear fade
      let linearFade = Math.min(1.0, minDistance / edgeFadeDistance);

      // C. Appliquer la courbe "Smoothstep" pour un fondu entre les bords et le threshold
      // Formule mathématique : 3x² - 2x³
      let fadeFactor = linearFade * linearFade * (3 - 2 * linearFade);

      // Pour plus de contraste
      //fadeFactor = Math.pow(fadeFactor, 2); 

      // D. Définir si la cellule naît vivante selon la densité finale calculée
      let isAlive = Math.random() < (maxInitialDensity * fadeFactor) ? 1 : 0;

      row.push({
        currentState: isAlive,
        targetState: 0,
        isHighlighted: false,
        age: 0,
        decay: 0,
        decayHue: 270
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
          // On tamponne la matrice dans la grille
          for (let ly = 0; ly < letterMatrix.length; ly++) {
            for (let lx = bounds.minX; lx <= bounds.maxX; lx++) {
              if (letterMatrix[ly][lx] === 1) {
                let gridY = cursorY + ly;
                let gridX = cursorX + (lx - bounds.minX);

                // Vérification finale des limites de la grille
                if (gridY >= 0 && gridY < rows && gridX >= 0 && gridX < cols) {
                  grid[gridY][gridX].targetState = 1;
                  grid[gridY][gridX].isHighlighted = highlightMode;
                }
              }
            }
          }
          cursorX += bounds.width + letterSpacing;
        }
      }
      cursorX += wordSpacing; // Espace entre les mots
    }
    // On passe à la ligne suivante
    cursorY += fontHeight + lineSpacing;
  }
}

function countNeighbors(x, y) {
  let sum = 0;
  for (let i = -1; i < 2; i++) {
    for (let j = -1; j < 2; j++) {
      if (i === 0 && j === 0) continue;
      let col = x + j;
      let row = y + i;
      if (col >= 0 && col < cols && row >= 0 && row < rows) {
        sum += grid[row][col].currentState;
      }
    }
  }
  return sum;
}

function updateGrid() {
  let nextStates = [];

  for (let y = 0; y < rows; y++) {
    nextStates[y] = [];
    for (let x = 0; x < cols; x++) {
      let cell = grid[y][x];
      let neighbors = countNeighbors(x, y);

      let nextState = cell.currentState;
      let nextAge = cell.age;
      let nextDecay = cell.decay;

      // A. Règles de Conway classiques
      if (cell.currentState === 1 && (neighbors < 2 || neighbors > 3)) {
        nextState = 0;
      } else if (cell.currentState === 0 && neighbors === 3) {
        nextState = 1;
      }

      // B. Attracteur Gravitationnel
      if (Math.random() < gravityForce) {
        nextState = cell.targetState;
      }

      // C. Gestion de l'âge et de la rémanence (Decay)
      let nextDecayHue = cell.decayHue; // On conserve la teinte en mémoire par défaut

      if (nextState === 1) {
        // La cellule est vivante
        nextAge = (cell.currentState === 1) ? cell.age + 1 : 0;
        nextDecay = 0;
      } else {
        // La cellule est morte
        nextAge = 0;

        if (cell.currentState === 1 && cell.age > 0) {
          nextDecay = 1.0; // Déclenchement de l'animation

          // --- CALCUL DE LA COULEUR DE MORT ---
          // 270 = Pourpre. L'âge pousse vers 360/0 (Rouge) puis 30-60 (Orange/Jaune).
          // Math.random() * 30 - 15 crée une variation aléatoire de +/- 15 degrés.
          let randomVariation = (Math.random() * 30) - 15;
          let ageBonus = cell.age * 15; // Vitesse vers le chaud

          nextDecayHue = (270 + ageBonus + randomVariation) % 360;

        } else if (cell.decay > 0) {
          nextDecay = Math.max(0, cell.decay - decaySpeed);
        } else {
          nextDecay = 0;
        }
      }

      nextStates[y][x] = { state: nextState, age: nextAge, decay: nextDecay, decayHue: nextDecayHue };
    }
  }

  // Application des nouveaux états
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      grid[y][x].currentState = nextStates[y][x].state;
      grid[y][x].age = nextStates[y][x].age;
      grid[y][x].decay = nextStates[y][x].decay;

      // Sauvegarde de la couleur
      grid[y][x].decayHue = nextStates[y][x].decayHue;
    }
  }
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let cell = grid[y][x];

      if (cell.currentState === 1) {

        // --- CELLULES VIVANTES ---
        if (cell.isHighlighted) {
          if (gravityForce < 1.0) {
            // 1. Phase de formation : animation des couleurs (ex: teintes rosées/violettes)
            let hue = (320 + cell.age * 4) % 360;
            ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
          } else {
            // 2. Phase finale (texte figé) : couleur fixe et immuable
            ctx.fillStyle = '#ffd900ff';
          }
        } else {
          // 3. Texte normal : toujours blanc pur
          ctx.fillStyle = '#ffffff';
        }

        // Dessin du carré (avec 1px d'espace pour la grille)
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);

      } else if (cell.decay > 0) {

        // --- CELLULES MORTES (Traînée lumineuse) ---
        let lightness = cell.decay * 45; // Descend de 45% à 0%
        // On utilise le decayHue figé lors du décès
        ctx.fillStyle = `hsl(${cell.decayHue}, 100%, ${lightness}%)`;

        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }
}

function animate() {
  updateGrid();
  drawGrid();

  // On fait avancer le "chronomètre" au lieu de la gravité directe
  if (animationProgress < 1.0) {
    animationProgress += animationSpeed;

    // On s'assure de ne pas dépasser 1.0
    if (animationProgress > 1.0) {
      animationProgress = 1.0;
    }

    // --- LA COURBE EASE-IN (Puissance 3) ---
    // La gravité suit une courbe exponentielle lente au début, rapide à la fin
    gravityForce = Math.pow(animationProgress, 3);

    // Mise à jour de l'affichage (optionnel, si vous avez gardé l'UI)
    let displayElement = document.getElementById('gravity-display');
    if (displayElement) {
      displayElement.innerText = `Gravité : ${gravityForce.toFixed(3)}`;
    }
  }

  setTimeout(() => requestAnimationFrame(animate), 60);
}

initGrid('*Dans le coin gauche de la pièce,* il y a un grand fauteuil moderne, fait d’une gigantesque demi-sphère d’altuglas cerclée d’acier, posée sur un piétement de métal chromé. À côté, un bloc de marbre de section octogonale fait office de table basse ; un briquet d’acier est posé dessus ainsi qu’un cache - pot cylindrique d’où émerge un chêne nain, un de ces bonzaï japonais dont la croissance a été à ce point contrôlée, ralentie, modifiée, qu’ils offrent tous les signes de la maturité, voire de la sénescence, en n’ayant pratiquement pas grandi, et dont ceux qui les cultivent disent que leur perfection dépend moins du soin matériel qu’on leur apporte que de la concentration méditative que leur éleveur leur consacre.');
animate();