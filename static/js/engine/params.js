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
  NOISE_SCALE: 0.008,
  maxConeAngleDegrees: 100,

  // Le Défibrillateur
  defibDensity: 0.25,
  defibEphemeralSparks: 0.005,
  defibRadius: 8,

  // Quota
  maxPlasmaCells: 2500,

  // Transitions Physiques
  fadeInSpeed: 0.8,
  fadeOutSpeed: 0.4,
  accelerationSpeed: 0.6,

  // Transitions du Plasma
  plasmaFadeInSpeed: 0.5,
  plasmaFadeOutSpeed: 0.03,
  plasmaExtinctionSpeed: 0.02,
  collisionCoolingSpeed: 0.04,

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
