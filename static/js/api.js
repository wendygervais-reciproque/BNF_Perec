// Dialogue avec le serveur, et repli hors ligne.
//
// L'installation est une borne : elle doit continuer de fonctionner si le
// modèle de langage est injoignable ou trop lent. D'où les textes de secours,
// pré-générés par generate_secours.py pour chaque couple extrait × contrainte,
// chargés au démarrage et servis en cas d'échec.

import { GENERATION_TIMEOUT_MS } from './config.js';

let textIds = [];             // identifiants des extraits disponibles
let fallbackContraintes = null;
let fallbackTextes = null;

// Contraintes à variable aléatoire : libellé du cartouche affiché sur la page
// générée. Le serveur fournit le sien via data.variable ; cette table sert
// pour les textes de secours, où seule la valeur est stockée.
const BADGE_LABELS = {
  changement_epoque: 'Époque',
  changement_lieu: 'Lieu',
  changement_genre_litteraire: 'Genre',
};

// Charge ce qui doit l'être avant le premier affichage. Les deux échecs sont
// tolérés séparément : sans textes de secours l'appli reste utilisable tant
// que le modèle répond, et inversement.
export async function initApi() {
  try {
    ({ contraintes: fallbackContraintes, textes: fallbackTextes } =
      await (await fetch('/data/textes_secours.json')).json());
  } catch (e) {
    console.warn('Textes de secours indisponibles :', e);
  }

  try {
    ({ texts: textIds } = await (await fetch('/texts')).json());
  } catch (e) {
    console.warn('Liste des extraits indisponible :', e);
  }
}

// Tire un extrait au hasard, en évitant celui déjà affiché.
// Renvoie { id, content }, ou null si le chargement échoue.
export async function fetchRandomExtract(currentTextId) {
  if (textIds.length === 0) return null;
  const candidates = textIds.filter(id => id !== currentTextId);
  const id = candidates[Math.floor(Math.random() * candidates.length)] ?? currentTextId;
  try {
    const r = await fetch(`/text/${id}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur serveur');
    return { id, content: data.content };
  } catch (e) {
    console.warn(`Chargement de l'extrait ${id} impossible :`, e);
    return null;
  }
}

// Demande une réécriture au modèle, avec repli automatique sur le texte de
// secours du couple (extrait, contrainte). Renvoie toujours { text, variable },
// text valant null si même le secours est introuvable.
export async function requestGeneration(textId, constraintId) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    const r = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_id: textId, constraint_id: constraintId }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur serveur');
    return { text: markdownBoldToHighlight(data.answer), variable: data.variable };
  } catch (e) {
    console.warn('Génération IA indisponible, texte de secours utilisé :', e);
    return getFallback(constraintId, textId) ?? { text: null, variable: null };
  }
}

// ==========================================
// MISE EN EXERGUE
// ==========================================
// Le moteur d'animation attend les mots à mettre en exergue entre astérisques
// simples ; le modèle les renvoie en gras markdown.
function markdownBoldToHighlight(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
}

// Pour les textes de secours génériques, où les mots imposés ne sont pas
// balisés dans le texte mais listés à part.
function applyKeywordHighlighting(text, contexte) {
  if (!contexte) return text;
  const keywords = contexte.split(',').map(k => k.trim()).filter(k => k.length > 0);
  // Du plus long au plus court : évite qu'un mot court n'entame un mot long
  keywords.sort((a, b) => b.length - a.length);
  let result = text;
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), match => `*${match}*`);
  }
  return result;
}

// ==========================================
// TEXTES DE SECOURS
// ==========================================
function getFallback(constraintId, textId) {
  // Texte propre au couple (extrait, contrainte) : le gras y est déjà en
  // markdown, comme dans une réponse du modèle.
  const entry = fallbackTextes?.[textId]?.[constraintId];
  const badgeLabel = BADGE_LABELS[constraintId];
  if (entry?.texte) {
    return {
      text: markdownBoldToHighlight(entry.texte),
      variable: badgeLabel ? { label: badgeLabel, value: entry.contexte } : null,
    };
  }

  // Dernier recours : texte générique de la contrainte, sans lien avec l'extrait
  const contrainte = fallbackContraintes?.find(c => c.id === constraintId);
  if (!contrainte) return null;
  let text = contrainte.texte;
  if (constraintId === 'forcage' || constraintId === 'homosemantique') {
    text = applyKeywordHighlighting(text, contrainte.contexte);
  }
  return {
    text,
    variable: badgeLabel ? { label: badgeLabel, value: contrainte.contexte } : null,
  };
}
