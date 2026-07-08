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
- `generate_secours.py` — script qui (re)génère les textes de secours via
  le LLM (voir plus bas)
- `static/textes_secours.json` — textes de secours affichés si le LLM est
  injoignable ou trop lent. Deux clés : `textes`, un texte par couple
  extrait × contrainte (33 × 6 = 198), rempli par `generate_secours.py` ;
  `contraintes`, les anciens textes génériques (un par contrainte), gardés
  en dernier recours si un couple manque. Format de mise en exergue : les
  mots imposés sont entourés d'astérisques simples (`*mot*`) dans `texte`,
  ou listés dans `contexte` (séparés par des virgules) pour les contraintes
  `forcage` et `homosemantique`.

## Lancer l'application

**macOS** : double-cliquer sur `start.command` (lance le serveur et ouvre le
navigateur sur http://localhost:5001). Laisser la fenêtre du Terminal ouverte ;
la fermer arrête le serveur.
Au tout premier lancement, macOS peut bloquer le fichier (« téléchargé
d'Internet ») : clic droit → **Ouvrir** → confirmer, une seule fois.

**Windows** : double-cliquer sur `start.bat` (même comportement, fenêtre de
console à laisser ouverte).

**En ligne de commande** (tout OS) :

```bash
pip install -r requirements.txt   # première fois seulement
cp .env.example .env              # puis renseigner les clés
python3 app.py                    # serveur sur http://localhost:5001
```

Le port par défaut est 5001 ; il peut être changé via la variable
d'environnement `PORT`.

Le serveur tourne en mode debug : les modifications de `app.py` le relancent
automatiquement ; pour les fichiers du front (`static/`), il suffit de
rafraîchir le navigateur.

Docker (`Dockerfile`, `fly.toml`) n'est **pas** nécessaire en local : ces
fichiers ne servent qu'au déploiement cloud (fly.io) hérité de teklia.

## Régénérer les textes de secours

`generate_secours.py` produit les textes de secours en appelant le LLM avec
les mêmes prompts que le site (les clés `.env` doivent donc être renseignées).
Le fichier est sauvegardé après chaque texte : le script peut être interrompu
et relancé, il ne régénère que ce qui manque.

```bash
python3 generate_secours.py                   # complète les couples manquants
python3 generate_secours.py --force           # régénère tout
python3 generate_secours.py --text 07         # limite à l'extrait 07
python3 generate_secours.py --constraint haiku # limite à une contrainte
```

À relancer après l'ajout d'un extrait dans `data/` ou la modification d'un
prompt.

## Configuration du LLM

Voir `.env.example`. L'appel au modèle passe par le protocole
OpenAI-compatible : la bascule du serveur distant vers un modèle local
(vLLM, llama.cpp, LM Studio, Ollama…) se fait uniquement dans `.env`
(`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`), sans modifier le code.
