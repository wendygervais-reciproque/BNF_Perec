import logging
import os
import random
import re
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from openai import OpenAI

logging.basicConfig(level=logging.INFO)

THINK_RE = re.compile(
    r"<think>(.*?)(?:</think>|\Z)\s*", re.DOTALL | re.IGNORECASE
)

# Le modèle place parfois en tête de réponse la liste des mots à réutiliser
# (contraintes forçage / homosémantique) avant le texte transformé : une
# énumération courte, isolée du récit par un saut de ligne, dont les items
# peuvent être en gras, non balisés, ou précédés d'une étiquette ("mots
# imposés :"). On la retire de la réponse affichée ; les mots restent en gras
# dans le corps du texte. NB : demander au modèle d'omettre cette liste le fait
# aussi renoncer au gras dans le texte, d'où ce nettoyage a posteriori.
# Étiquette optionnelle en tête de liste ("Mots imposés :", "mots choisis :"…).
LIST_LABEL_RE = re.compile(
    r"^(?:mots?(?:\s+(?:choisis|imposés|clés|à réutiliser))?|liste|contrainte|"
    r"éléments?)\s*:\s*",
    re.IGNORECASE,
)

# Garde-fou de langue : le modèle bascule parfois dans la langue du pays
# (contrainte changement_lieu, surtout avec l'espagnol). On mesure la densité
# de mots-outils typiquement français ; un texte français en contient ≥ 14 %,
# un texte dans une autre langue ≤ 3 %. Sous le seuil, on redemande une
# réponse. Trop grossier pour les textes courts (haïkus ≈ 0 %), donc activé
# par contrainte via "check_french".
FRENCH_STOPWORDS = frozenset(
    "le les des du et est une dans pour avec ne pas au aux ce cette qui elle "
    "était avait mais où sur son ses leur par comme plus ils sont être très "
    "même".split()
)
FRENCH_RATIO_MIN = 0.10
RETRY_FRENCH_PREFIX = (
    "RAPPEL CRITIQUE : ta précédente réponse à cette tâche était rédigée "
    "dans la langue du pays au lieu du français. C'est interdit. Réponds "
    "cette fois intégralement en langue française, du premier au dernier "
    "mot.\n\n"
)


def french_ratio(text: str) -> float:
    words = re.findall(r"\w+", text.lower(), re.UNICODE)
    if not words:
        return 0.0
    return sum(w in FRENCH_STOPWORDS for w in words) / len(words)

load_dotenv()

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def read_lines(path: Path) -> list[str]:
    return [line.strip() for line in read_file(path).splitlines() if line.strip()]


COUNTRIES = read_lines(DATA_DIR / "pays.txt")
EPOQUES = read_lines(DATA_DIR / "epoques.txt")
FORMES = read_lines(DATA_DIR / "formes.txt")

# Les identifiants correspondent aux data-id des boutons du front (static/index.html).
# "placeholder"/"choices" : variable aléatoire injectée dans le prompt avant envoi.
CONSTRAINTS = {
    "changement_epoque": {
        "label": "Changement d'époque",
        "file": "prompt_epoque.txt",
        "placeholder": "<EPOQUE>",
        "choices": EPOQUES,
        "badge": "Époque",
    },
    "forcage": {
        "label": "Mots imposés",
        "file": "prompt_forcage.txt",
    },
    "haiku": {
        "label": "Haïku",
        "file": "prompt_haiku.txt",
    },
    "homosemantique": {
        "label": "Synonymes",
        "file": "prompt_homosemantique.txt",
    },
    "changement_lieu": {
        "label": "Changement de lieu",
        "file": "prompt_lieu.txt",
        "placeholder": "<PAYS>",
        "choices": COUNTRIES,
        "check_french": True,
        "badge": "Lieu",
    },
    "changement_genre_litteraire": {
        "label": "Changement de genre littéraire",
        "file": "prompt_genre.txt",
        "placeholder": "<FORME>",
        "choices": FORMES,
        "badge": "Genre",
    },
}

# Les prompts à variable demandent au modèle d'annoncer le paramètre choisi
# (lieu, époque, forme) en première ligne de sa réponse. Cette mention est
# désormais affichée par le front dans un cartouche HTML : on la retire donc
# du texte destiné au canvas. Garde-fou de longueur : si la première ligne
# est anormalement longue, c'est du récit, on n'y touche pas.
MENTION_MAX_LEN = 80


def strip_leading_mention(answer: str) -> str:
    first, sep, rest = answer.partition("\n")
    if sep and len(first.strip()) <= MENTION_MAX_LEN and rest.strip():
        return rest.strip()
    return answer


def strip_leading_word_list(answer: str) -> str:
    """Retire une éventuelle liste de mots en tête de réponse (cf. LIST_LABEL_RE).

    On ne coupe que si le premier bloc, séparé du reste par un saut de ligne,
    est une énumération courte (≥ 3 items brefs) et dépourvue de ponctuation de
    phrase interne : garde-fous pour ne jamais entamer une vraie ouverture (une
    didascalie « Scène : une taverne animée. Untel… » n'a ni la brièveté ni la
    ponctuation d'une liste).
    """
    for sep in ("\n\n", "\n"):
        head, found, tail = answer.partition(sep)
        if not found or not tail.strip():
            continue
        candidate = LIST_LABEL_RE.sub("", head.replace("**", "").strip())
        # Une ponctuation de phrase suivie de texte (« . D », « : U ») trahit
        # de la prose, jamais une énumération de mots.
        if re.search(r"[.!?:]\s+\S", candidate):
            continue
        items = [s.strip() for s in re.split(r"[;,]", candidate) if s.strip()]
        if (len(candidate) <= 150 and len(items) >= 3
                and all(len(s.split()) <= 6 for s in items)):
            return tail.lstrip()
    return answer


def badge_value(selected: str) -> str:
    """Libellé court pour le cartouche : les formes littéraires sont décrites
    ("théâtre tragédie : ton solennel, …"), on ne garde que le nom."""
    return selected.split(":")[0].strip()


# Dernier paramètre tiré pour chaque contrainte à variable (pays, époque,
# forme) : on l'exclut du tirage suivant pour que deux générations
# successives d'une même contrainte ne retombent jamais sur la même valeur.
_last_choices: dict[str, str] = {}


def pick_choice(constraint_id: str, constraint: dict) -> str:
    last = _last_choices.get(constraint_id)
    candidates = [c for c in constraint["choices"] if c != last]
    selected = random.choice(candidates or constraint["choices"])
    _last_choices[constraint_id] = selected
    return selected


def generate_answer(client: OpenAI, model: str, prompt: str,
                    check_french: bool = False) -> tuple[str, str]:
    """Appelle le LLM et renvoie (réponse brute, réponse nettoyée).

    Si check_french est actif et que la réponse ne semble pas française,
    on réessaie (conversation vierge, rappel en tête de prompt) : renvoyer
    la mauvaise réponse dans l'historique ancre le modèle dans sa langue.
    """
    raw_answer = answer = ""
    for attempt in (1, 2, 3):
        content = prompt if attempt == 1 else RETRY_FRENCH_PREFIX + prompt
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            extra_body={
                "chat_template_kwargs": {"enable_thinking": False},
                "reasoning_effort": "low",
            },
        )
        raw_answer = response.choices[0].message.content or ""
        answer = THINK_RE.sub("", raw_answer).strip()
        answer = strip_leading_word_list(answer).strip()
        if not check_french or french_ratio(answer) >= FRENCH_RATIO_MIN:
            break
        logging.warning(
            "Réponse non française (ratio %.0f%%, tentative %d) : %.60r",
            french_ratio(answer) * 100, attempt, answer,
        )
    return raw_answer, answer


def build_prompt(constraint_id: str, source_text: str) -> tuple[str, str | None]:
    """Assemble le prompt envoyé au modèle pour une contrainte donnée.

    Source unique partagée par la route /generate et le script de génération
    des textes de secours (generate_secours.py) : les deux doivent produire des
    textes selon exactement la même consigne. Tire aussi la variable aléatoire
    éventuelle (époque / lieu / genre) et l'injecte à la place du placeholder.
    Renvoie (prompt, selected) ; selected vaut None sans variable.
    """
    constraint = CONSTRAINTS[constraint_id]
    constraint_text = read_file(DATA_DIR / constraint["file"])
    selected = None
    if "placeholder" in constraint:
        selected = pick_choice(constraint_id, constraint)
        logging.info(
            "Variable '%s' pour la contrainte '%s' : %s",
            constraint["placeholder"], constraint_id, selected,
        )
        constraint_text = constraint_text.replace(constraint["placeholder"], selected)
    prompt = (
        f"{constraint_text}\n\n"
        f"Voici le texte à transformer :\n\n{source_text}"
    )
    return prompt, selected


app = Flask(__name__, static_folder="static", static_url_path="")


def list_texts():
    return sorted(f.stem for f in DATA_DIR.glob("[0-9][0-9].txt"))


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/texts")
def get_texts():
    return jsonify({"texts": list_texts()})


@app.route("/text/<text_id>")
def get_text(text_id):
    path = DATA_DIR / f"{text_id}.txt"
    if not text_id.isdigit() or not path.exists():
        return jsonify({"error": "Texte introuvable"}), 404
    return jsonify({"id": text_id, "content": read_file(path)})


@app.route("/generate", methods=["POST"])
def generate():
    payload = request.get_json(silent=True) or {}
    text_id = payload.get("text_id")
    constraint_id = payload.get("constraint_id")

    constraint = CONSTRAINTS.get(constraint_id)
    if constraint is None:
        return jsonify({"error": "Contrainte inconnue"}), 400

    if not isinstance(text_id, str) or not text_id.isdigit():
        return jsonify({"error": "Texte introuvable"}), 400
    text_path = DATA_DIR / f"{text_id}.txt"
    if not text_path.exists():
        return jsonify({"error": "Texte introuvable"}), 400

    # LLM_* prioritaires ; UNSLOTH_URL / GEMMA_API acceptés pour compatibilité
    # avec la config d'origine du serveur teklia.
    base_url = os.environ.get("LLM_BASE_URL") or os.environ.get("UNSLOTH_URL")
    api_key = os.environ.get("LLM_API_KEY") or os.environ.get("GEMMA_API")
    model = os.environ.get("LLM_MODEL", "gemma-4-26B-A4B-it")
    if not base_url or not api_key:
        return jsonify({
            "error": "LLM non configuré (LLM_BASE_URL / LLM_API_KEY manquants dans .env)"
        }), 503

    source_text = read_file(text_path)
    prompt, selected = build_prompt(constraint_id, source_text)

    client = OpenAI(base_url=base_url, api_key=api_key)

    try:
        raw_answer, answer = generate_answer(
            client, model, prompt, constraint.get("check_french", False)
        )
    except Exception as exc:
        logging.exception("Appel LLM échoué")
        return jsonify({"error": f"LLM injoignable : {exc}"}), 502

    thinking = "\n\n".join(
        m.group(1).strip() for m in THINK_RE.finditer(raw_answer)
    )
    variable = None
    if selected is not None:
        answer = strip_leading_mention(answer)
        variable = {"label": constraint["badge"], "value": badge_value(selected)}
    return jsonify({
        "prompt": prompt,
        "answer": answer,
        "raw_answer": raw_answer,
        "thinking": thinking,
        "variable": variable,
    })


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5001)))
