// Rendu du moteur. Ne lit que l'état, n'en modifie rien.
//
// === OPTIMISATION SAFARI ===
// Le code original utilisait Path2D pour batcher le rendu : N_BUCKETS chemins
// accumulaient chacun des centaines de rect(), puis un seul fill() par chemin.
// Sur Chrome (Skia, GPU) c'est optimal. Sur Safari (WebKit, CPU) c'est
// catastrophique : chaque Path2D.fill() tesselle tous ses segments sur CPU,
// et avec 12000+ cellules on chute à 4 fps.
//
// La solution : remplacer Path2D par des fillRect() directs, mais en fusionnant
// les cellules adjacentes d'une même ligne en un seul fillRect horizontal
// (run-length encoding des spans). Cela réduit le nombre d'appels de dessin
// tout en restant sur le chemin GPU de Safari — qui est rapide pour fillRect
// mais lent pour Path2D.
//
// De plus :
//   · Les chemins Path2D sont supprimés entièrement.
//   · L'opacité est quantifiée en N_LEVELS paliers (4 au lieu de 8) pour
//     limiter les changements de globalAlpha.
//   · Les particules à opacité pleine sont dessinées en un seul parcours,
//     sans second passage Path2D.

import { S } from './state.js';
import { PARAMS } from './params.js';

// 4 paliers suffisent visuellement ; chacun déclenche un setStyle + une série
// de fillRect. Moins de paliers = moins de changements d'état canvas.
const N_LEVELS = 4;

// Tampons réutilisés d'une frame à l'autre pour éviter les allocations.
// Chaque niveau stocke des spans [x, y, width] contigus, 3 valeurs par span.
const _eSpans = [];
const _hSpans = [];
for (let i = 0; i < N_LEVELS; i++) { _eSpans.push([]); _hSpans.push([]); }

// Tampons pour les particules highlight (coordonnées px, 2 valeurs par part).
const _pHighlightOverlay = [];

export function draw(ctx) {
  const cols = S.cols;
  const opacities = S.ephemeralOpacity;
  const heats = S.ephemeralHeat;
  const cells = S.visibleCells;
  const cs = S.cellSize;
  const csm1 = S.cellSize - PARAMS.cellGap;

  // ===== Vider les tampons =====
  for (let i = 0; i < N_LEVELS; i++) { _eSpans[i].length = 0; _hSpans[i].length = 0; }
  _pHighlightOverlay.length = 0;

  let hasHeat = false;

  // ===== Collecter le plasma en spans horizontaux (RLE) =====
  // S.visibleCells est produit par collectVisibleCells qui balaie ligne par
  // ligne (y externe, x interne) et push(rowBase + x). Les index sont donc
  // DÉJÀ triés par ordre croissant — on peut faire le RLE directement.
  const nCells = cells.length;

  let prevIdx = -1;
  let runStartX = 0, runY = 0, runLen = 0;
  let runLevel = 0;

  for (let k = 0; k < nCells; k++) {
    const idx = cells[k];
    const opacity = opacities[idx];
    if (opacity <= 0) {
      // Finaliser le span en cours s'il existe
      if (runLen > 0) {
        _eSpans[runLevel].push(runStartX, runY, runLen);
        runLen = 0;
      }
      prevIdx = -1;
      continue;
    }

    const x = idx % cols;
    const y = (idx / cols) | 0;
    const level = Math.min(N_LEVELS - 1, (opacity * N_LEVELS) | 0);

    // Étendre le span si même niveau, ligne contiguë, X contigu
    if (idx === prevIdx + 1 && level === runLevel) {
      runLen++;
    } else {
      if (runLen > 0) {
        _eSpans[runLevel].push(runStartX, runY, runLen);
      }
      runStartX = x; runY = y; runLen = 1; runLevel = level;
    }
    prevIdx = idx;

    // Chaleur : clairsemée, pas de RLE, stockée cellule par cellule [x, y, 1]
    const heat = heats[idx];
    if (heat > 0) {
      hasHeat = true;
      const hLevel = Math.min(N_LEVELS - 1, (opacity * heat * N_LEVELS) | 0);
      _hSpans[hLevel].push(x, y, 1);
    }
  }
  if (runLen > 0) {
    _eSpans[runLevel].push(runStartX, runY, runLen);
  }

  // ===== PASSE 1 : base du plasma =====
  ctx.fillStyle = PARAMS.colorEphemeral;
  for (let i = 0; i < N_LEVELS; i++) {
    const spans = _eSpans[i];
    if (spans.length === 0) continue;
    ctx.globalAlpha = PARAMS.alphaEphemeral * (i + 0.5) / N_LEVELS;
    for (let j = 0; j < spans.length; j += 3) {
      ctx.fillRect(spans[j] * cs, spans[j + 1] * cs, spans[j + 2] * cs, csm1);
    }
  }

  // ===== PASSE 2 : chaleur des collisions =====
  if (hasHeat) {
    ctx.fillStyle = PARAMS.colorCollision;
    for (let i = 0; i < N_LEVELS; i++) {
      const spans = _hSpans[i];
      if (spans.length === 0) continue;
      ctx.globalAlpha = PARAMS.alphaEphemeral * (i + 0.5) / N_LEVELS;
      for (let j = 0; j < spans.length; j += 3) {
        ctx.fillRect(spans[j] * cs, spans[j + 1] * cs, csm1, csm1);
      }
    }
  }

  // ===== PASSE 3 : particules =====
  const particles = S.particles;
  const crystal = S.crystallizationProgress;

  ctx.globalAlpha = 1.0;
  ctx.fillStyle = PARAMS.colorPhysical;

  // Particules à opacité pleine — fillRect direct
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.isAlive) continue;
    const alpha = p.alpha ?? 1.0;
    if (alpha <= 0) continue;
    if (alpha < 0.995) continue;

    const px = p.x * cs, py = p.y * cs;
    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    if (isLocked && p.isHighlighted) {
      // Highlight base = même fillStyle que regular, on dessine direct
      ctx.fillRect(px, py, csm1, csm1);
      if (crystal > 0) _pHighlightOverlay.push(px, py);
    } else {
      ctx.fillRect(px, py, csm1, csm1);
    }
  }

  // Overlay highlight (cristallisation)
  if (crystal > 0 && _pHighlightOverlay.length > 0) {
    ctx.globalAlpha = crystal;
    ctx.fillStyle = PARAMS.colorHighlight;
    for (let j = 0; j < _pHighlightOverlay.length; j += 2) {
      ctx.fillRect(_pHighlightOverlay[j], _pHighlightOverlay[j + 1], csm1, csm1);
    }
    ctx.globalAlpha = 1.0;
  }

  // Particules en transition (rares — BORN/DYING uniquement)
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.isAlive) continue;
    const alpha = Math.max(0, Math.min(1, p.alpha ?? 1.0));
    if (alpha <= 0 || alpha >= 0.995) continue;

    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PARAMS.colorPhysical;
    ctx.fillRect(p.x * cs, p.y * cs, csm1, csm1);

    if (isLocked && p.isHighlighted && crystal > 0) {
      ctx.globalAlpha = alpha * crystal;
      ctx.fillStyle = PARAMS.colorHighlight;
      ctx.fillRect(p.x * cs, p.y * cs, csm1, csm1);
    }
  }

  ctx.globalAlpha = 1.0;
}