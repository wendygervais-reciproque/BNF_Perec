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

# Liste de mots en gras que le modèle place en tête de réponse (contraintes
# forçage / homosémantique) avant le texte transformé. On la retire de la
# réponse affichée ; les mots restent en gras dans le corps du texte.
# NB : demander au modèle d'omettre cette liste le fait aussi renoncer au
# gras dans le texte, d'où ce nettoyage a posteriori.
WORD_LIST_RE = re.compile(r"^(?:\s*\*\*[^*\n]+\*\*\s*[,;.:]?[ \t]*)+\n+")

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
    },
    "changement_genre_litteraire": {
        "label": "Changement de genre littéraire",
        "file": "prompt_genre.txt",
        "placeholder": "<FORME>",
        "choices": FORMES,
    },
}

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

    constraint_text = read_file(DATA_DIR / constraint["file"])
    source_text = read_file(text_path)

    if "placeholder" in constraint:
        selected = random.choice(constraint["choices"])
        logging.info(
            "Variable '%s' pour la contrainte '%s' : %s",
            constraint["placeholder"], constraint_id, selected,
        )
        constraint_text = constraint_text.replace(constraint["placeholder"], selected)

    prompt = (
        f"{constraint_text}\n\n"
        f"Voici le texte à transformer :\n\n{source_text}"
    )

    client = OpenAI(base_url=base_url, api_key=api_key)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            extra_body={
                "chat_template_kwargs": {"enable_thinking": False},
                "reasoning_effort": "low",
            },
        )
    except Exception as exc:
        logging.exception("Appel LLM échoué")
        return jsonify({"error": f"LLM injoignable : {exc}"}), 502

    raw_answer = response.choices[0].message.content or ""
    thinking = "\n\n".join(
        m.group(1).strip() for m in THINK_RE.finditer(raw_answer)
    )
    answer = THINK_RE.sub("", raw_answer).strip()
    answer = WORD_LIST_RE.sub("", answer).strip()
    return jsonify({
        "prompt": prompt,
        "answer": answer,
        "raw_answer": raw_answer,
        "thinking": thinking,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5001)
