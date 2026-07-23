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

// Date et heure sous une forme élégante, ex. « 23 juillet 2026, 14:32 »
function formatElegantDate(date = new Date()) {
  const datePart = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${datePart}, ${timePart}`;
}

if (textIterationYear) {
  textIterationYear.textContent = formatElegantDate();
}

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

// Affiche la signature (appelée quand le texte est achevé)
export function showTextIteration() {
  textIterationEl?.classList.add('visible');
}

// Cache la signature (appelée quand le texte se dissout ou se reforme)
export function hideTextIteration() {
  textIterationEl?.classList.remove('visible');
}

// Incrémente le compteur local ET le compteur serveur
export async function bumpTextIteration(textId, constraintId) {
  textIteration += 1;
  if (textIterationNumber) {
    textIterationNumber.textContent = textIteration;
  }
  if (textIterationYear) {
    textIterationYear.textContent = formatElegantDate();
  }

  // Synchronise avec le serveur
  try {
    await fetch('/api/counter/increment', { method: 'POST' });
  } catch (e) {
    console.warn('Impossible de synchroniser le compteur avec le serveur :', e);
  }

  // Envoie le log au serveur (si currentTextId et activeConstraintId sont disponibles)
  if (textId && constraintId) {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text_id: textId,
          constraint_id: constraintId
        })
      });
    } catch (e) {
      console.warn('Impossible d\'enregistrer le log :', e);
    }
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
      textIterationYear.textContent = formatElegantDate();
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

export function initConstraints(onClick) {
  constraintButtons.forEach(btn => {
    // Stocke le texte et la largeur d'origine
    btn.dataset.originalLabel = btn.textContent.trim();
    btn.dataset.originalWidth = `${btn.offsetWidth}px`;

    // Applique la largeur minimale
    btn.style.minWidth = btn.dataset.originalWidth;

    btn.addEventListener('click', () => onClick(btn));
  });
}
let generatingSVG = `                
<svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
  <style>
    .dot {
      fill: var(--color-btn-active-text); /* Dot color (change as needed) */
      opacity: 0.2;
      animation: pulse 1.4s infinite ease-in-out;
    }
    .dot:nth-child(1) { animation-delay: 0s; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes pulse {
      0%, 60%, 100% { opacity: 0.2s; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-5px); }
    }
  </style>
  <circle class="dot" cx="30" cy="10" r="4" />
  <circle class="dot" cx="50" cy="10" r="4" />
  <circle class="dot" cx="10" cy="10" r="4" />
</svg>`;

export function markActiveConstraint(btn) {
  constraintButtons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

export function randomConstraintButton() {
  return constraintButtons[Math.floor(Math.random() * constraintButtons.length)];
}

// Pendant une génération, tous les boutons sont désactivés : il faut attendre
// la fin pour choisir une nouvelle contrainte (le serveur ne traite qu'une
// requête à la fois).
export function setGeneratingButton(constraintId) {
  constraintButtons.forEach(btn => {
    const isActive = btn.dataset.id === constraintId;
    btn.disabled = constraintId !== null; // tous désactivés dès qu'une génération est en cours

    if (isActive) {
      btn.innerHTML = generatingSVG;
    } else {
      btn.innerHTML = btn.dataset.originalLabel;
    }
  });
}

// ==========================================
// PAGE ORIGINALE
// ==========================================
const originalTextEl = document.querySelector('.text-content-original');
const leftPageEl = document.getElementById('left');

let sourcePlain = '';   // texte source brut, base du (dé)surlignage

export function setExtractText(content) {
  if (!originalTextEl) return;
  sourcePlain = content;
  originalTextEl.textContent = content;
  snapLeftText();
}

const escapeHtml = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Surligne dans la page source les mots-clés réutilisés par la contrainte
// (forçage : mots imposés ; homosémantique : mots remplacés par des synonymes),
// en écho à leur mise en exergue sur le canvas. Sans effet si la liste est vide
// ou si aucun mot ne figure tel quel dans le texte source.
export function highlightSource(words) {
  if (!originalTextEl) return;
  const terms = (words || []).map(w => w.trim()).filter(Boolean);
  if (terms.length === 0) { clearSourceHighlight(); return; }
  // Du plus long au plus court : évite qu'un mot court n'entame une expression.
  const pattern = terms
    .sort((a, b) => b.length - a.length)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  let html = '', last = 0;
  for (const m of sourcePlain.matchAll(re)) {
    html += escapeHtml(sourcePlain.slice(last, m.index));
    html += `<span class="source-highlight">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  html += escapeHtml(sourcePlain.slice(last));
  originalTextEl.innerHTML = html;
  snapLeftText();
}

export function clearSourceHighlight() {
  if (!originalTextEl) return;
  originalTextEl.textContent = sourcePlain;
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

  const setHelpOpen = (isOpen) => {
    helpPanel.classList.toggle('open', isOpen);
    btnHelp.classList.toggle('active', isOpen);
    document.body.classList.toggle('help-open', isOpen);
  };

  const toggleHelp = () => setHelpOpen(!helpPanel.classList.contains('open'));

  btnHelp.addEventListener('click', toggleHelp);
  helpPanel.addEventListener('click', toggleHelp);
  if (btnCloseHelp) btnCloseHelp.addEventListener('click', toggleHelp);
}

export function closeHelpPanel() {
  const btnHelp = document.getElementById('btn-help');
  const helpPanel = document.getElementById('help-panel');
  if (!helpPanel || !helpPanel.classList.contains('open')) return;

  helpPanel.classList.remove('open');
  if (btnHelp) btnHelp.classList.remove('active');
  document.body.classList.remove('help-open');
}