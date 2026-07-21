// Rendu du moteur. Ne lit que l'état, n'en modifie rien.
//
// La contrainte de performance dicte la forme : à 60 images par seconde sur
// plusieurs milliers de cellules, un appel de dessin par cellule est hors
// budget. Deux techniques s'y substituent —
//   · le plasma est réparti en N_BUCKETS paliers d'opacité, chacun accumulé
//     dans un Path2D : N changements de globalAlpha deviennent N_BUCKETS
//     appels de fill() ;
//   · les particules à opacité pleine, qui sont l'immense majorité, tiennent
//     en trois Path2D ; seules celles en transition (BORN/DYING, rares) sont
//     dessinées une à une.

import { S } from './state.js';
import { PARAMS } from './params.js';

const N_BUCKETS = 8;

export function draw(ctx) {
  const cols = S.cols;
  const opacities = S.ephemeralOpacity;
  const heats = S.ephemeralHeat;
  const cells = S.visibleCells;
  const cs = S.cellSize, csm1 = S.cellSize - PARAMS.cellGap;

  // ===== Plasma : répartition en paliers d'opacité =====
  const ePaths = [];
  const hPaths = [];
  for (let i = 0; i < N_BUCKETS; i++) {
    ePaths.push(new Path2D());
    hPaths.push(new Path2D());
  }

  let hasHeat = false;

  for (let k = 0; k < cells.length; k++) {
    const idx = cells[k];
    const opacity = opacities[idx];
    if (opacity <= 0) continue;

    const x = idx % cols;
    const y = (idx / cols) | 0;
    const px = x * cs, py = y * cs;

    const eBucket = Math.min(N_BUCKETS - 1, (opacity * N_BUCKETS) | 0);
    ePaths[eBucket].rect(px, py, csm1, csm1);

    const heat = heats[idx];
    if (heat > 0) {
      // La chaleur module l'opacité effective : opacity * heat
      const hBucket = Math.min(N_BUCKETS - 1, (opacity * heat * N_BUCKETS) | 0);
      hPaths[hBucket].rect(px, py, csm1, csm1);
      hasHeat = true;
    }
  }

  // PASSE 1 : base du plasma
  ctx.fillStyle = PARAMS.colorEphemeral;
  for (let i = 0; i < N_BUCKETS; i++) {
    ctx.globalAlpha = PARAMS.alphaEphemeral * (i + 0.5) / N_BUCKETS;
    ctx.fill(ePaths[i]);
  }

  // PASSE 2 : chaleur des collisions
  if (hasHeat) {
    ctx.fillStyle = PARAMS.colorCollision;
    for (let i = 0; i < N_BUCKETS; i++) {
      ctx.globalAlpha = PARAMS.alphaEphemeral * (i + 0.5) / N_BUCKETS;
      ctx.fill(hPaths[i]);
    }
  }

  // ===== PASSE 3 : particules =====
  const particles = S.particles;
  const crystal = S.crystallizationProgress;

  const pathRegular = new Path2D();
  const pathHighlightBase = new Path2D();
  const pathHighlightOverlay = new Path2D();

  for (let p of particles) {
    if (!p.isAlive) continue;
    const alpha = p.alpha ?? 1.0;
    if (alpha <= 0) continue;
    if (alpha < 0.995) continue; // transitions traitées dans le second parcours

    const isLocked = (p.parentBlock && p.parentBlock.state === 'DOCKED');
    if (isLocked && p.isHighlighted) {
      pathHighlightBase.rect(p.x * cs, p.y * cs, csm1, csm1);
      if (crystal > 0) pathHighlightOverlay.rect(p.x * cs, p.y * cs, csm1, csm1);
    } else {
      pathRegular.rect(p.x * cs, p.y * cs, csm1, csm1);
    }
  }

  ctx.globalAlpha = 1.0;
  ctx.fillStyle = PARAMS.colorPhysical;
  ctx.fill(pathRegular);
  ctx.fill(pathHighlightBase);

  if (crystal > 0) {
    ctx.globalAlpha = crystal;
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

    if (isLocked && p.isHighlighted && crystal > 0) {
      ctx.globalAlpha = alpha * crystal;
      ctx.fillStyle = PARAMS.colorHighlight;
      ctx.fillRect(p.x * cs, p.y * cs, csm1, csm1);
    }
  }

  ctx.globalAlpha = 1.0;
}
