// Mode inactif.
//
// Après un délai sans interaction, un voile assombrit l'écran et un bouton de
// contrainte au hasard « rebondit », à cadence légèrement irrégulière, pour
// attirer le visiteur. Toute interaction y met fin.
//
// Nuance qui gouverne tout le module : un texte qui se dissout ou se reforme
// n'est pas de l'inactivité. Le compte à rebours ne court que lorsque l'écran
// est stabilisé — d'où le prédicat isStable, injecté par main.js pour que ce
// module n'ait pas à connaître la machine à états.

import { IDLE_DELAY_MS, IDLE_BOUNCE_MIN_MS, IDLE_BOUNCE_JITTER_MS } from './config.js';
import { constraintButtons, closeHelpPanel } from './ui.js';

const idleVeil = document.getElementById('idle-veil');

let idleTimer = null;
let bounceTimer = null;
let lastBouncedBtn = null;
let idleArmedAt = null;      // date d'armement — lue par le panneau de debug
let idleModeActive = false;
let isStable = () => true;   // remplacé par initIdleMode()

export function initIdleMode(stablePredicate) {
  isStable = stablePredicate;
  ['mousemove', 'mousedown', 'keydown', 'click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
}

function bounceRandomButton() {
  const candidates = [...constraintButtons].filter(b => b !== lastBouncedBtn);
  const btn = candidates[Math.floor(Math.random() * candidates.length)];
  lastBouncedBtn = btn;
  btn.classList.remove('jello');
  void btn.offsetWidth; // force un reflow pour pouvoir rejouer l'animation
  btn.classList.add('jello');
  bounceTimer = setTimeout(bounceRandomButton, IDLE_BOUNCE_MIN_MS + Math.random() * IDLE_BOUNCE_JITTER_MS);
}

function startIdleMode() {
  closeHelpPanel();
  idleModeActive = true;
  if (idleVeil) idleVeil.classList.add('visible');
  bounceRandomButton();
}

// Sort du mode inactif, puis réarme le minuteur — mais seulement si rien ne
// bouge à l'écran. Appelée à chaque interaction, au démarrage d'une animation
// (le minuteur reste alors suspendu) et à sa fin (il repart de zéro).
export function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(bounceTimer);
  if (idleVeil) idleVeil.classList.remove('visible');
  constraintButtons.forEach(b => b.classList.remove('jello'));
  idleModeActive = false;
  idleArmedAt = null;

  if (!isStable()) return;

  idleArmedAt = performance.now();
  idleTimer = setTimeout(startIdleMode, IDLE_DELAY_MS);
}

// État du compte à rebours, affiché par le panneau de debug (touche « D ») :
// soit le mode inactif est enclenché, soit le minuteur est suspendu par une
// animation en cours, soit il court et on donne le temps écoulé.
export function getIdleStatus() {
  if (idleModeActive) return { state: 'active' };
  if (idleArmedAt === null) return { state: 'suspended' };
  return { state: 'counting', elapsedMs: performance.now() - idleArmedAt, delayMs: IDLE_DELAY_MS };
}
