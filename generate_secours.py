"""Génère les textes de secours pour chaque couple (extrait, contrainte).

Utilise le même LLM et les mêmes prompts que la route /generate de app.py,
puis remplit static/data/textes_secours.json sous la clé "textes" :

    { "textes": { "01": { "forcage": { "contexte": ..., "texte": ... }, ... } } }

Le fichier est sauvegardé après chaque génération : le script peut être
interrompu et relancé, il ne régénère que les couples manquants.

Usage :
    python3 generate_secours.py               # complète les couples manquants
    python3 generate_secours.py --force       # régénère tout
    python3 generate_secours.py --text 07     # limite à l'extrait 07
    python3 generate_secours.py --constraint haiku
"""

import argparse
import json
import logging
import os
import sys

from openai import OpenAI

from app import (
    BASE_DIR,
    CONSTRAINTS,
    DATA_DIR,
    SOURCE_HIGHLIGHT_CONSTRAINTS,
    badge_value,
    build_prompt,
    generate_answer,
    list_texts,
    read_file,
    strip_leading_mention,
)

SECOURS_PATH = BASE_DIR / "static" / "data" / "textes_secours.json"


def load_secours() -> dict:
    data = json.loads(SECOURS_PATH.read_text(encoding="utf-8"))
    data.setdefault("textes", {})
    return data


def save_secours(data: dict) -> None:
    tmp = SECOURS_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    tmp.replace(SECOURS_PATH)


def generate_one(client: OpenAI, model: str, text_id: str, constraint_id: str) -> dict:
    constraint = CONSTRAINTS[constraint_id]
    source_text = read_file(DATA_DIR / f"{text_id}.txt")

    # Même fabrication de prompt que la route /generate (source unique dans app.py).
    prompt, contexte = build_prompt(constraint_id, source_text)
    _, answer, source_words = generate_answer(
        client, model, prompt, constraint.get("check_french", False)
    )
    if contexte is not None:
        # Mention affichée par le cartouche du front, pas par le canvas
        answer = strip_leading_mention(answer)
        contexte = badge_value(contexte)
    entry = {"contexte": contexte, "texte": answer}
    if constraint_id in SOURCE_HIGHLIGHT_CONSTRAINTS:
        # Mots-clés du texte source, pour les surligner en écho à l'exergue.
        entry["source_words"] = source_words
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="régénère aussi les couples déjà présents")
    parser.add_argument("--text", help="limite à un extrait (ex. 07)")
    parser.add_argument("--constraint", choices=sorted(CONSTRAINTS),
                        help="limite à une contrainte")
    args = parser.parse_args()

    base_url = os.environ.get("LLM_BASE_URL") or os.environ.get("UNSLOTH_URL")
    api_key = os.environ.get("LLM_API_KEY") or os.environ.get("GEMMA_API")
    model = os.environ.get("LLM_MODEL", "gemma-4-26B-A4B-it")
    if not base_url or not api_key:
        logging.error("LLM non configuré (LLM_BASE_URL / LLM_API_KEY manquants dans .env)")
        return 1
    client = OpenAI(base_url=base_url, api_key=api_key)

    text_ids = [args.text] if args.text else list_texts()
    constraint_ids = [args.constraint] if args.constraint else list(CONSTRAINTS)

    data = load_secours()
    todo = [
        (t, c)
        for t in text_ids
        for c in constraint_ids
        if args.force or not data["textes"].get(t, {}).get(c, {}).get("texte")
    ]
    logging.info("%d couple(s) à générer sur %d",
                 len(todo), len(text_ids) * len(constraint_ids))

    failures = []
    for i, (text_id, constraint_id) in enumerate(todo, 1):
        logging.info("[%d/%d] extrait %s × %s", i, len(todo), text_id, constraint_id)
        try:
            entry = generate_one(client, model, text_id, constraint_id)
        except Exception as exc:
            logging.error("  échec : %s", exc)
            failures.append((text_id, constraint_id))
            continue
        data["textes"].setdefault(text_id, {})[constraint_id] = entry
        save_secours(data)

    if failures:
        logging.warning("%d échec(s) : %s — relancer le script pour réessayer",
                        len(failures),
                        ", ".join(f"{t}×{c}" for t, c in failures))
        return 1
    logging.info("Terminé : tous les textes de secours sont présents.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
