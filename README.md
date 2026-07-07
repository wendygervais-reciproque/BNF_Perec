# Perec — Jeux d'écriture

Installation interactive : un extrait de Georges Perec est réécrit par un
modèle de langage selon une contrainte oulipienne choisie par le visiteur,
puis le texte généré se forme à l'écran via une animation procédurale.

## Structure

- `app.py` — serveur Flask : sert le front et expose l'API (`/texts`,
  `/text/<id>`, `/generate`)
- `data/` — les 33 extraits sources (`01.txt`–`33.txt`), les prompts des
  6 contraintes (`prompt_*.txt`) et les listes de variables aléatoires
  (`pays.txt`, `epoques.txt`, `formes.txt`)
- `static/` — le front : interface, moteur d'animation (`scripts/`) et
  `textes_secours.json`
- `static/textes_secours.json` — textes de secours affichés si le LLM est
  injoignable ou trop lent (un texte pré-écrit par contrainte).
  ⚠ À actualiser avec des textes générés par le modèle, notamment pour le
  format de mise en exergue : les mots imposés doivent être entourés
  d'astérisques simples (`*mot*`) directement dans `texte`, ou listés dans
  `contexte` (séparés par des virgules) pour les contraintes `forcage` et
  `homosemantique`.

## Lancer l'application

Sous Windows : double-cliquer sur `start.bat` (lance le serveur et ouvre le
navigateur sur http://localhost:5001). Laisser la fenêtre de console ouverte ;
la fermer arrête le serveur.

En ligne de commande :

```bash
pip install -r requirements.txt   # première fois seulement
cp .env.example .env              # puis renseigner les clés
python app.py                     # serveur sur http://localhost:5001
```

Le serveur tourne en mode debug : les modifications de `app.py` le relancent
automatiquement ; pour les fichiers du front (`static/`), il suffit de
rafraîchir le navigateur.

Docker (`Dockerfile`, `fly.toml`) n'est **pas** nécessaire en local : ces
fichiers ne servent qu'au déploiement cloud (fly.io) hérité de teklia.

## Configuration du LLM

Voir `.env.example`. L'appel au modèle passe par le protocole
OpenAI-compatible : la bascule du serveur distant vers un modèle local
(vLLM, llama.cpp, LM Studio, Ollama…) se fait uniquement dans `.env`
(`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`), sans modifier le code.
