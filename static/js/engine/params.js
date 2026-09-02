// Réglages du moteur d'animation.
//
// PARAMS est volontairement mutable : le panneau de debug (touche « D »)
// écrit directement dedans pour régler la simulation en direct. C'est aussi
// la raison pour laquelle ces réglages vivent ici et non dans state.js —
// ce sont des paramètres, pas de l'état de simulation.

const cssColor = name =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const PARAMS = {
  // Le Limier
  NOISE_SCALE: 0.08,
  maxConeAngleDegrees: 60,
  // Cône minimal, même tout près de la cible : évite une approche finale en
  // ligne parfaitement droite (cf. getHoundMove dans physics.js).
  minConeAngleDegrees: 2,

  // Le Défibrillateur
  defibDensity: 0.8,
  defibEphemeralSparks: 0.042,
  defibRadius: 3,

  // Quota
  maxPlasmaCells: 4300,

  // Transitions Physiques
  fadeInSpeed: 0.8,
  fadeOutSpeed: 0.2,
  accelerationSpeed: 6,
  // Pas de simulation par image de référence (60 Hz) : pilote la vitesse
  // globale de la formation du texte, indépendamment du taux de
  // rafraîchissement réel (cf. l'accumulateur dans simulation.js).
  FORMATION_SPEED: 1.3,

  // Transitions du Plasma
  plasmaFadeInSpeed: 0.8,
  plasmaFadeOutSpeed: 0.02,
  plasmaExtinctionSpeed: 0.03,
  collisionCoolingSpeed: 0.05,

  // Esthétique & Couleurs
  // Valeurs par défaut lues dans static/css/style.css (:root) — source unique
  colorPhysical: cssColor('--color-anim-physical'),
  colorHighlight: cssColor('--color-anim-highlight'),
  colorEphemeral: cssColor('--color-anim-ephemeral'),
  colorCollision: cssColor('--color-anim-collision'),
  alphaEphemeral: 0.8,
  cellGap: 0
};

// Constantes de structure, non réglables à chaud.
//
// La taille de bloc découpe le texte en pavés que les particules assemblent
// puis convoient jusqu'à leur cible. La changer en cours de formation
// invaliderait les appariements particule/emplacement déjà établis : elle
// n'est donc pas exposée au panneau de debug.
export const BLOCK_W = 6;
export const BLOCK_H = 10;

// Marges (en proportion du canvas) de la zone où naissent les particules
// manquantes : évite de les faire apparaître collées aux bords.
export const SPAWN_MARGIN_X = 0.05;
export const SPAWN_MARGIN_Y = 0.15;
