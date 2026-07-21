import { getLetterBitmap } from './bitmap_font.js';

const letterSpacing = 1;
const wordSpacing = 3;
const paddingTop = 40;   // garde verticale : le texte ne colle jamais au haut du canvas
const fontHeight = 10;

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
  if (isEmpty) return { minX: 0, maxX: 0, width: 0 };
  return { minX, maxX, width: (maxX - minX + 1) };
}

function measureWord(word) {
  let width = 0;
  for (let i = 0; i < word.length; i++) {
    let char = word[i];
    if (char === '*') continue;
    let bounds = getLetterBounds(getLetterBitmap(char));
    if (bounds.width > 0) width += bounds.width + letterSpacing;
  }
  // Pas de retrait du letterSpacing final : la mesure doit rendre ce que la
  // composition avance réellement (elle ajoute l'espacement après chaque
  // lettre, y compris la dernière). Retrancher ici faisait dériver le retour
  // à la ligne d'une cellule par mot, soit une ligne qui débordait d'autant
  // sur la marge droite.
  return width;
}

// L'interface principale pour notre chef d'orchestre
// offsetRows décale le bloc de texte sur l'axe Y (en cellules, négatif =
// vers le haut). Sert à compenser ce qui est posé sous le texte mais hors
// du canvas — la signature « texte généré par IA » — pour que l'ensemble
// paraisse centré, et non le texte seul.
// marginX est la marge gauche et droite, en cellules : l'appelant la dérive
// de la marge de la page originale (cf. main.js).
export function getCoordinates(text, cols, rows, gridInterval = 10, lineGap = 0, offsetRows = 0, marginX = 40) {
  let textPixels = [];
  let highlightBgPixels = [];

  const lineSpacing = lineGap;
  // Ligne de base à l'index 8 du bitmap (cf. bitmap_font.js : "Ligne 8 = Ligne de base")
  // Les 2 lignes vides du bas (indices 8-9) créent l'écart sous l'encre.
  const baselineRow = 8;

  const maxWidth = cols - (marginX * 2);
  let lines = [];

  for (const segment of text.split('\n')) {
    let currentLine = { words: [], width: 0 };
    for (let w of segment.split(' ').filter(w => w.length > 0)) {
      let wWidth = measureWord(w);
      let addedWidth = currentLine.width === 0 ? wWidth : wordSpacing + wWidth;
      if (currentLine.width + addedWidth > maxWidth && currentLine.words.length > 0) {
        lines.push(currentLine);
        currentLine = { words: [w], width: wWidth };
      } else {
        currentLine.words.push(w);
        currentLine.width += addedWidth;
      }
    }
    lines.push(currentLine);
  }
  while (lines.length > 0 && lines[lines.length - 1].words.length === 0) lines.pop();

  let totalTextHeight = (lines.length * fontHeight) + ((lines.length - 1) * lineSpacing);

  // Snap la baseline (pas le haut du caractère) sur la ligne de grille la plus proche.
  // La baseline est à baselineRow cellules depuis le haut du caractère.
  // Le décalage est appliqué avant le snap : la baseline reste sur la grille.
  let rawBaseline = (rows - totalTextHeight) / 2 + baselineRow + offsetRows;
  let snappedBaseline = Math.round(rawBaseline / gridInterval) * gridInterval;
  let startY = snappedBaseline - baselineRow;
  if (startY < paddingTop) {
    startY = Math.ceil((paddingTop + baselineRow) / gridInterval) * gridInterval - baselineRow;
  }

  let cursorY = startY;
  let highlightMode = false;

  for (let line of lines) {
    let cursorX = marginX;
    for (let word of line.words) {
      for (let char of word) {
        if (char === '*') { highlightMode = !highlightMode; continue; }

        let letterMatrix = getLetterBitmap(char);
        let bounds = getLetterBounds(letterMatrix);

        if (bounds.width > 0) {
          if (highlightMode) {
            for (let hy = 0; hy < letterMatrix.length; hy++) {
              for (let hx = 0; hx < bounds.width + letterSpacing; hx++) {
                highlightBgPixels.push({ x: cursorX + hx, y: cursorY + hy });
              }
            }
          }

          for (let ly = 0; ly < letterMatrix.length; ly++) {
            for (let lx = bounds.minX; lx <= bounds.maxX; lx++) {
              if (letterMatrix[ly][lx] === 1) {
                textPixels.push({ 
                  x: cursorX + (lx - bounds.minX), 
                  y: cursorY + ly, 
                  isHighlighted: highlightMode 
                });
              }
            }
          }
          cursorX += bounds.width + letterSpacing;
        }
      }

      if (highlightMode) {
        for (let hy = 0; hy < fontHeight; hy++) {
          for (let hx = 0; hx < wordSpacing; hx++) {
            highlightBgPixels.push({ x: cursorX + hx, y: cursorY + hy });
          }
        }
      }
      cursorX += wordSpacing;
    }
    cursorY += fontHeight + lineSpacing;
  }

  return { textPixels, highlightBgPixels };
}