// Couche DOM : tout ce qui s'affiche en HTML autour du canvas.
//
// Ce module ne décide de rien — il expose des commandes que main.js déclenche
// au bon moment de la machine à états. Les interactions sont remontées par
// rappel, pour qu'il n'ait pas à connaître la logique de génération.

import {
  CELL_SIZE, GRID_INTERVAL, ACTION_BAR_HEIGHT,
  TEXT_ITERATION_GAP, TEXT_ITERATION_HEIGHT
} from './config.js';
import { canvas } from './stage.js';

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
const textIterationEl = document.getElementById('text-iteration');
const textIterationNumber = document.getElementById('text-iteration-number');
const textIterationYear = document.getElementById('text-iteration-year');
if (textIterationYear) textIterationYear.textContent = new Date().getFullYear();

let textIteration = 0;

// La maquette place la signature sous le texte du canvas. Ce dernier étant
// centré verticalement, son bas dépend du nombre de lignes : la position se
// calcule donc à partir des pixels réellement occupés par la simulation.
export function placeTextIteration(textPixels) {
  if (!textIterationEl || textPixels.length === 0) return;
  let maxY = 0;
  for (const p of textPixels) if (p.y > maxY) maxY = p.y;
  // Garde-fou : la signature ne passe pas sous la barre d'action
  const maxTop = canvas.height - ACTION_BAR_HEIGHT - TEXT_ITERATION_HEIGHT - 32;
  const top = Math.min((maxY + 1) * CELL_SIZE + TEXT_ITERATION_GAP, maxTop);
  textIterationEl.style.top = `${top}px`;
}

// Affiche la signature (appelée quand le texte est achevé)
export function showTextIteration() {
  textIterationEl?.classList.add('visible');
}

// Cache la signature (appelée quand le texte se dissout ou se reforme)
export function hideTextIteration() {
  textIterationEl?.classList.remove('visible');
}

// Incrémente le compteur local ET le compteur serveur
export async function bumpTextIteration() {
  textIteration += 1;
  if (textIterationNumber) {
    textIterationNumber.textContent = textIteration;
  }
  if (textIterationYear) {
    textIterationYear.textContent = new Date().getFullYear();
  }

  // Synchronise avec le serveur
  try {
    await fetch('/api/counter/increment', { method: 'POST' });
  } catch (e) {
    console.warn('Impossible de synchroniser le compteur avec le serveur :', e);
  }
}

// Charge le compteur depuis le serveur au chargement de la page
async function initTextIteration() {
  try {
    const response = await fetch('/api/counter');
    const { count } = await response.json();
    textIteration = count;
    if (textIterationNumber) {
      textIterationNumber.textContent = textIteration;
    }
    if (textIterationYear) {
      textIterationYear.textContent = new Date().getFullYear();
    }
  } catch (e) {
    console.warn('Impossible de charger le compteur depuis le serveur :', e);
    // En cas d'échec, on garde le compteur local à 0 ou on utilise une valeur par défaut
    textIteration = 0;
    if (textIterationNumber) {
      textIterationNumber.textContent = textIteration;
    }
  }
}

// Appelle l'initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', initTextIteration);

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
