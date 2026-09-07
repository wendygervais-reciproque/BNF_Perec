#!/bin/bash
cd "$(dirname "$0")"

URL="http://localhost:8080"
CHROME_APP="Google Chrome"

# Ferme toutes les fenêtres Chrome existantes au démarrage
osascript -e "tell application \"$CHROME_APP\" to quit" 2>/dev/null
sleep 1

# Boucle de surveillance : relance Chrome en mode kiosque
# à chaque fois qu'il n'est plus en cours d'exécution.
while true; do
    if ! pgrep -x "Google Chrome" > /dev/null; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Chrome n'est pas actif, lancement en mode kiosque..."
        open -a "$CHROME_APP" --args --kiosk --new-window \
            --no-first-run \
            --disable-session-crashed-bubble \
            --disable-infobars \
            --noerrdialogs \
            "$URL"
    fi
    # Vérifie l'état toutes les 3 secondes
    sleep 3
done
