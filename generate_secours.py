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
    python3 generate_secours.py --rehighlight # recalcule le surlignage, sans LLM
"""

import argparse
import json
import logging
import re
import sys

from app import (
    BASE_DIR,
    CONSTRAINTS,
    DATA_DIR,
    DIFF_HIGHLIGHT_CONSTRAINTS,
    apply_diff_highlight,
    badge_value,
    build_prompt,
    generate_answer,
    list_texts,
    llm_config_error,
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
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    # Les plages de surlignage (listes de paires d'entiers) tiennent sur une
    # ligne : l'indentation en ferait des centaines de lignes d'un seul nombre.
    text = re.sub(r"(?<=[\[\d,\]])\n\s*(?=[\[\d\]])", "", text)
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(SECOURS_PATH)


def generate_one(text_id: str, constraint_id: str) -> dict:
    constraint = CONSTRAINTS[constraint_id]
    source_text = read_file(DATA_DIR / f"{text_id}.txt")

    # Même fabrication de prompt que la route /generate (source unique dans app.py).
    prompt, contexte = build_prompt(constraint_id, source_text)
    _, answer, source_words = generate_answer(
        prompt, constraint.get("check_french", False)
    )
    if contexte is not None:
        # Mention affichée par le cartouche du front, pas par le canvas
        answer = strip_leading_mention(answer)
        contexte = badge_value(contexte)
    # Passages du texte source à surligner en écho à l'exergue : plages issues
    # de la comparaison quand elle s'applique, sinon mots annoncés par le modèle.
    answer, source_words, source_spans = apply_diff_highlight(
        constraint_id, source_text, answer, source_words
    )
    entry = {"contexte": contexte, "texte": answer}
    if source_words is not None:
        entry["source_words"] = source_words
    if source_spans is not None:
        entry["source_spans"] = source_spans
    return entry


def rehighlight(data: dict) -> None:
    """Recalcule le surlignage des textes déjà générés, sans rappeler le LLM."""
    for text_id, entries in data["textes"].items():
        source_text = read_file(DATA_DIR / f"{text_id}.txt")
        for constraint_id in DIFF_HIGHLIGHT_CONSTRAINTS & entries.keys():
            entry = entries[constraint_id]
            answer, source_words, source_spans = apply_diff_highlight(
                constraint_id, source_text, entry["texte"], entry.get("source_words")
            )
            if source_spans is None:
                logging.warning("extrait %s × %s : inchangé", text_id, constraint_id)
                continue
            entry["texte"] = answer
            entry["source_spans"] = source_spans
            entry.pop("source_words", None)
    save_secours(data)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="régénère aussi les couples déjà présents")
    parser.add_argument("--text", help="limite à un extrait (ex. 07)")
    parser.add_argument("--constraint", choices=sorted(CONSTRAINTS),
                        help="limite à une contrainte")
    parser.add_argument("--rehighlight", action="store_true",
                        help="recalcule le surlignage des textes existants, sans LLM")
    args = parser.parse_args()

    if args.rehighlight:
        rehighlight(load_secours())
        return 0

    config_error = llm_config_error()
    if config_error:
        logging.error(config_error)
        return 1

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
            entry = generate_one(text_id, constraint_id)
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
