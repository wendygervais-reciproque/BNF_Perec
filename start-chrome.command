#!/bin/bash
cd "$(dirname "$0")"

URL="http://localhost:8080"
CHROME_APP="Google Chrome"

# Ferme toutes les fenêtres Chrome existantes au démarrage
osascript -e "tell application \"$CHROME_APP\" to quit" 2>/dev/null
sleep 1

open_kiosk() {
    open -a "$CHROME_APP" --args --kiosk --new-window \
        --no-first-run \
        --disable-session-crashed-bubble \
        --disable-infobars \
        --noerrdialogs \
        "$URL"
}

echo "$(date '+%Y-%m-%d %H:%M:%S') - Démarrage de la surveillance kiosque..."
open_kiosk

# Boucle de surveillance : relance Chrome
# - si le processus n'existe plus (crash, Cmd+Q)
# - si le processus existe mais qu'il n'a plus aucune fenêtre ouverte
#   (cas du bouton rouge / Cmd+W qui ferme la fenêtre sans quitter l'app)
while true; do
    sleep 2

    if ! pgrep -x "Google Chrome" > /dev/null; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Chrome ne tourne plus, relance..."
        open_kiosk
        continue
    fi

    WINDOW_COUNT=$(osascript -e "tell application \"$CHROME_APP\" to count windows" 2>/dev/null)

    if [ -z "$WINDOW_COUNT" ] || [ "$WINDOW_COUNT" -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Chrome tourne mais aucune fenêtre ouverte, réouverture..."
        open_kiosk
    fi
done
