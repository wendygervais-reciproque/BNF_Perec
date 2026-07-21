// Constantes partagées de l'application.
//
// Tout ce qui est réglable sans toucher à la logique se trouve ici. Les
// couleurs font exception : elles vivent dans style.css (:root), calées sur
// les variables des maquettes Figma, et sont lues via cssColor().

// Lecture d'une variable CSS de :root. getComputedStyle est appelé une fois
// et mis en cache — l'objet renvoyé reste vivant, les valeurs restent à jour.
const rootStyles = getComputedStyle(document.documentElement);
export const cssColor = name => rootStyles.getPropertyValue(name).trim();

// ==========================================
// GÉOMÉTRIE
// ==========================================
// L'application est calibrée pour un écran de borne 1920×1080 ; la page
// générée en occupe la moitié droite. Sert aussi de repli si la mise en page
// n'est pas encore établie au premier rendu.
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

// Côté d'une cellule du canvas, en pixels. Le texte généré est peint cellule
// par cellule : il ne peut se poser que sur des multiples de cette valeur.
export const CELL_SIZE = 3;

// Trame de composition du texte du canvas. La maquette ne fait plus
// apparaître la grille (--color-grid-canvas transparent dans style.css), mais
// elle reste la base sur laquelle le texte s'aligne.
export const GRID_INTERVAL = 8;   // cellules entre deux lignes de grille
export const LINE_GAP = 6;        // lignes de grille vides entre deux lignes de texte

// Marge des pages, reprise de #left dans style.css.
export const PAGE_MARGIN = 64;

// Hauteur de la barre d'action, superposée au bas des deux pages.
export const ACTION_BAR_HEIGHT = 120;

// Signature « texte généré par IA », suspendue sous le texte du canvas.
export const TEXT_ITERATION_GAP = 82;      // écart maquette sous le texte
export const TEXT_ITERATION_HEIGHT = 32;   // hauteur du picto

// ==========================================
// GÉOMÉTRIE DÉRIVÉE
// ==========================================
// Marge gauche du texte généré, calée sur celle de la page originale. Le
// texte du canvas ne pouvant se poser que sur la trame, 64 px deviennent
// 21 cellules soit 63 px — un pixel d'écart, invisible, et le texte reste
// aligné sur la grille.
export const TEXT_MARGIN_CELLS = Math.round(PAGE_MARGIN / CELL_SIZE);

// La signature est posée hors du canvas : le moteur centre le texte seul,
// sans rien savoir de ce qui pèse en dessous, d'où un ensemble qui paraîtrait
// trop bas. On remonte le texte de la moitié de la place qu'elle occupe, pour
// centrer le bloc « texte + signature ». (Contrairement à la page de gauche,
// où la citation est dans le flux et participe naturellement au centrage.)
export const TEXT_OFFSET_ROWS =
  -Math.round((TEXT_ITERATION_GAP + TEXT_ITERATION_HEIGHT) / 2 / CELL_SIZE);

// ==========================================
// CADENCES
// ==========================================
// Vitesse de la formation. Fractionnaire : le moteur exécute un pas cette
// proportion des images, plutôt qu'une fraction de pas à chaque image.
export const FORMATION_SPEED = 0.4;

// Au-delà, la génération est abandonnée et un texte de secours prend le relais.
export const GENERATION_TIMEOUT_MS = 60000;

// Mode inactif : après ce délai sans interaction ET sans animation en cours,
// un voile assombrit l'écran et les boutons de contrainte se mettent à rebondir.
export const IDLE_DELAY_MS = 6000;
export const IDLE_BOUNCE_MIN_MS = 1600;    // délai minimal entre deux rebonds
export const IDLE_BOUNCE_JITTER_MS = 1400; // part aléatoire ajoutée au délai
