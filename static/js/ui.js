// Couche DOM : tout ce qui s'affiche en HTML autour du canvas.
//
// Ce module ne décide de rien — il expose des commandes que main.js déclenche
// au bon moment de la machine à états. Les interactions sont remontées par
// rappel, pour qu'il n'ait pas à connaître la logique de génération.

import {
  CELL_SIZE, GRID_INTERVAL, ACTION_BAR_HEIGHT,
  TEXT_ITERATION_GAP, TEXT_ITERATION_HEIGHT
} from './config.js';

// ==========================================
// CARTOUCHE DU PARAMÈTRE (lieu, époque, genre)
// ==========================================
const constraintBadgeEl = document.getElementById('constraint-badge');
const badgeLabelEl = document.getElementById('constraint-badge-label');
const badgeValueEl = document.getElementById('constraint-badge-value');

// Le cartouche entre et sort par le haut de l'écran (transition CSS sur
// .visible). Le libellé n'est réécrit qu'à l'entrée : pendant la sortie il
// conserve l'ancienne valeur, qui s'échappe avec lui.
export function setConstraintBadge(variable) {
  if (!constraintBadgeEl) return;
  if (variable?.value) {
    badgeLabelEl.textContent = `${variable.label} :`;
    badgeValueEl.textContent = variable.value;
    constraintBadgeEl.classList.add('visible');
  } else {
    constraintBadgeEl.classList.remove('visible');
  }
}

// ==========================================
// SIGNATURE « TEXTE GÉNÉRÉ PAR IA »
// ==========================================
const canvasScrollEl = document.getElementById('canvas-scroll');
const textIterationEl = document.getElementById('text-iteration');
const textIterationNumber = document.getElementById('text-iteration-number');
const textIterationYear = document.getElementById('text-iteration-year');
if (textIterationYear) textIterationYear.textContent = new Date().getFullYear();

let textIteration = 0;

// Marge sous la signature, une fois la barre d'action dégagée : évite qu'elle
// ne colle au bas du défilement.
const SCROLL_BOTTOM_MARGIN = 32;

// Bas de l'encre du texte, en pixels du canvas.
function textInkBottom(textPixels) {
  let maxY = 0;
  for (const p of textPixels) if (p.y > maxY) maxY = p.y;
  return (maxY + 1) * CELL_SIZE;
}

// La maquette place la signature sous le texte du canvas. Ce dernier étant
// centré verticalement, son bas dépend du nombre de lignes : la position se
// calcule donc à partir des pixels réellement occupés par la simulation.
// Plus de plafond ici : quand le texte est long, le canvas est agrandi en
// conséquence (cf. contentHeight) et la signature défile au bout du texte.
export function placeTextIteration(textPixels) {
  if (!textIterationEl || textPixels.length === 0) return;
  textIterationEl.style.top = `${textInkBottom(textPixels) + TEXT_ITERATION_GAP}px`;
}

// Hauteur totale que le canvas doit atteindre pour ce texte : bas de l'encre +
// signature + un dégagement égal à la barre d'action (qui recouvre le bas du
// cadre), pour que la signature puisse défiler au-dessus d'elle quand le texte
// déborde. Sous la hauteur du cadre, main.js garde le canvas à sa taille.
export function contentHeight(textPixels) {
  if (textPixels.length === 0) return 0;
  return textInkBottom(textPixels) + TEXT_ITERATION_GAP + TEXT_ITERATION_HEIGHT
       + ACTION_BAR_HEIGHT + SCROLL_BOTTOM_MARGIN;
}

// Remet le défilement en haut au moment où un nouveau texte se pose.
export function resetScroll() {
  if (canvasScrollEl) canvasScrollEl.scrollTop = 0;
}

// La signature ne concerne que le texte achevé : elle s'efface dès qu'il se
// dissout ou se reforme, et ne revient qu'une fois la formation terminée.
export function showTextIteration() {
  textIterationEl?.classList.add('visible');
}

export function hideTextIteration() {
  textIterationEl?.classList.remove('visible');
}

export function bumpTextIteration() {
  textIteration += 1;
  if (textIterationNumber) textIterationNumber.textContent = textIteration;
}

// ==========================================
// BOUTONS DE CONTRAINTE
// ==========================================
export const constraintButtons = document.querySelectorAll('.btn-contrainte');

export function initConstraints(onActivate) {
  constraintButtons.forEach(btn => {
    btn.addEventListener('click', () => onActivate(btn));
  });
}

export function markActiveConstraint(btn) {
  constraintButtons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

export function randomConstraintButton() {
  return constraintButtons[Math.floor(Math.random() * constraintButtons.length)];
}

// Pendant une génération, seul le bouton de la contrainte en cours est
// désactivé — inutile de renvoyer la même requête. Les autres restent
// cliquables, pour pouvoir interrompre et repartir sur une autre contrainte.
export function setGeneratingButton(constraintId) {
  constraintButtons.forEach(b => { b.disabled = b.dataset.id === constraintId; });
}

// ==========================================
// PAGE ORIGINALE
// ==========================================
const originalTextEl = document.querySelector('.text-content-original');
const leftPageEl = document.getElementById('left');

export function setExtractText(content) {
  if (!originalTextEl) return;
  originalTextEl.textContent = content;
  snapLeftText();
}

// Aligne le haut de l'em box de l'extrait sur la trame, pour que les deux
// pages partagent la même ligne de base optique.
export function snapLeftText() {
  if (!originalTextEl || !leftPageEl) return;

  const spacing = CELL_SIZE * GRID_INTERVAL;
  const cs = getComputedStyle(originalTextEl);
  // Demi-interlignage : espace vide entre le haut de la line box et celui de l'em box
  const halfLeading = Math.max(0, (parseFloat(cs.lineHeight) - parseFloat(cs.fontSize)) / 2);

  originalTextEl.style.transform = '';
  const delta = originalTextEl.getBoundingClientRect().top - leftPageEl.getBoundingClientRect().top;
  const inkTop = delta + halfLeading;
  const remainder = ((inkTop % spacing) + spacing) % spacing;
  const snap = remainder < spacing / 2 ? -remainder : spacing - remainder;
  originalTextEl.style.transform = `translateY(${snap}px)`;
}

export function initRenewButton(onRenew) {
  const btn = document.getElementById('btn-renew-extract');
  if (btn) btn.addEventListener('click', onRenew);
}

// ==========================================
// NOTICE D'AIDE
// ==========================================
// La barre d'action reste visible par-dessus la notice : les contraintes y
// cèdent la place au libellé « Fermer la notice » (maquette A2).
export function initHelpPanel() {
  const btnHelp = document.getElementById('btn-help');
  const btnCloseHelp = document.getElementById('btn-close-help');
  const helpPanel = document.getElementById('help-panel');
  if (!btnHelp || !helpPanel) return;

  const toggleHelp = () => {
    const isOpen = helpPanel.classList.toggle('open');
    btnHelp.classList.toggle('active', isOpen);
    document.body.classList.toggle('help-open', isOpen);
  };
  btnHelp.addEventListener('click', toggleHelp);
  if (btnCloseHelp) btnCloseHelp.addEventListener('click', toggleHelp);
}
