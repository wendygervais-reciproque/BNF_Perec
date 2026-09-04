#!/bin/bash
cd "$(dirname "$0")"

# Ferme toutes les fenêtres Chrome existantes
osascript -e 'tell application "Google Chrome" to quit'

# Ouvre Chrome en mode kiosk (nouvelle fenêtre)
open -a "Google Chrome" --args --kiosk --new-window http://localhost:8080