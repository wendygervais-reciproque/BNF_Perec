#!/bin/bash
cd "$(dirname "$0")"

source .venv/bin/activate

# Lance le serveur Python en arrière-plan
python3 app.py &

# Attend que le port 5001 soit accessible
echo "Attente du démarrage du serveur..."
while ! nc -z localhost 5001; do
  sleep 1
done

# Ferme toutes les fenêtres Chrome existantes
osascript -e 'tell application "Google Chrome" to quit'

# Ouvre Chrome en mode kiosk (nouvelle fenêtre)
open -a "Google Chrome" --args --kiosk --new-window http://localhost:5001