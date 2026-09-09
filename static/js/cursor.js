// Curseur et feedback tactile.
//
// L'interface est tactile : le curseur système est masqué par défaut (voir
// « * { cursor: none } » dans style.css, activé via la classe .hide-cursor
// posée ici sur <html>). La touche « c » permet de le faire réapparaître,
// utile en développement ou pour un pilotage à la souris.
//
// Le protocole qui pilote l'écran tactile ne remonte pas de retour visuel au
// clic : on le simule ici par un petit rond translucide qui apparaît puis
// s'estompe au point de contact.

const root = document.documentElement;

function toggleCursor() {
  root.classList.toggle('hide-cursor');
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'c' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
  toggleCursor();
});

root.classList.add('hide-cursor');

// ==========================================
// FEEDBACK DE CLIC
// ==========================================
function spawnClickRipple(x, y) {
  const ripple = document.createElement('div');
  ripple.className = 'click-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

window.addEventListener('pointerdown', (e) => {
  spawnClickRipple(e.clientX, e.clientY);
});
