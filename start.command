#!/bin/zsh
# Lance le serveur de l'application (Flask) puis ouvre le navigateur.
# L'application est servie sur http://localhost:5001
cd "$(dirname "$0")"
open http://localhost:5001
python3 app.py
