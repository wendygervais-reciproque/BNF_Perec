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

// Une seule génération en vol à la fois : quand une nouvelle est demandée (on
// enchaîne les extraits, par exemple), la précédente encore en cours est
// annulée au lieu d'être laissée à s'empiler. Sinon les requêtes s'accumulent,
// le navigateur sature ses connexions simultanées, et les suivantes finissent
// par expirer — d'où lenteur et « operation aborted » en cascade.
let inFlight = null;   // { controller, superseded }

// Demande une réécriture au modèle, avec repli automatique sur le texte de
// secours du couple (extrait, contrainte). Renvoie toujours { text, variable },
// text valant null si même le secours est introuvable.
export async function requestGeneration(textId, constraintId) {
  if (inFlight) {
    inFlight.superseded = true;
    inFlight.controller.abort();
  }
  const current = { controller: new AbortController(), superseded: false };
  inFlight = current;
  const timer = setTimeout(() => current.controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const r = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_id: textId, constraint_id: constraintId }),
      signal: current.controller.signal,
    });
    clearTimeout(timer);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur serveur');
    return {
      text: formatForConstraint(data.answer, constraintId),
      variable: data.variable,
      sourceWords: data.source_words ?? null,   // mots à surligner dans la source
    };
  } catch (e) {
    clearTimeout(timer);
    // Annulée parce qu'une génération plus récente l'a supplantée : son résultat
    // serait de toute façon écarté (jeton périmé, cf. main.js). On sort en
    // silence, sans basculer sur le secours ni alarmer la console.
    if (current.superseded) return { text: null, variable: null, sourceWords: null };
    console.warn('Génération IA indisponible, texte de secours utilisé :', e);
    return getFallback(constraintId, textId) ?? { text: null, variable: null, sourceWords: null };
  } finally {
    if (inFlight === current) inFlight = null;
  }
}

// ==========================================
// MISE EN EXERGUE
// ==========================================
// Seules les contraintes forçage et homosémantique désignent des mots à mettre
// en exergue (cf. prompts : « Mets les mots… en gras »). Pour les autres
// (époque, lieu, genre, haïku), un éventuel gras est du balisage incident — les
// didascalies de théâtre « **SCÈNE :** » notamment — qu'il faut retirer sans
// créer d'exergue.
const HIGHLIGHT_CONSTRAINTS = new Set(['forcage', 'homosemantique']);

// Prépare le texte pour le moteur d'animation selon la contrainte : conversion
// du gras markdown en exergue là où c'est attendu, simple nettoyage du balisage
// ailleurs.
function formatForConstraint(text, constraintId) {
  return HIGHLIGHT_CONSTRAINTS.has(constraintId)
    ? markdownBoldToHighlight(text)
    : stripEmphasis(text);
}

// Le moteur d'animation attend les mots à mettre en exergue entre astérisques
// simples ; le modèle les renvoie en gras markdown.
function markdownBoldToHighlight(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
}

// Retire tout astérisque de balisage : le moteur traite chaque « * » comme une
// bascule d'exergue, donc un markdown résiduel (gras ou italique) créerait une
// exergue parasite là où la contrainte n'en attend aucune.
function stripEmphasis(text) {
  return text.replace(/\*+/g, '');
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
      text: formatForConstraint(entry.texte, constraintId),
      variable: badgeLabel ? { label: badgeLabel, value: entry.contexte } : null,
      // Présent seulement si les secours ont été (re)générés après l'ajout du
      // surlignage source ; sinon null → pas de surlignage source (dégradation).
      sourceWords: entry.source_words ?? null,
    };
  }

  // Dernier recours : texte générique de la contrainte, sans lien avec l'extrait
  const contrainte = fallbackContraintes?.find(c => c.id === constraintId);
  if (!contrainte) return null;
  let text = contrainte.texte;
  if (HIGHLIGHT_CONSTRAINTS.has(constraintId)) {
    text = applyKeywordHighlighting(text, contrainte.contexte);
  } else {
    text = stripEmphasis(text);
  }
  return {
    text,
    variable: badgeLabel ? { label: badgeLabel, value: contrainte.contexte } : null,
    sourceWords: null,   // texte générique : sans lien avec l'extrait affiché
  };
}
