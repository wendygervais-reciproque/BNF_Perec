#!/bin/bash
cd "$(dirname "$0")"

URL="http://localhost:8080"
CHROME_APP="Google Chrome"

# --- Masquage Dock + barre de menus (appliqué à chaque lancement) ---
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 1000
defaults write com.apple.dock autohide-time-modifier -float 0.1
defaults write NSGlobalDomain _HIHideMenuBar -bool true
killall Dock 2>/dev/null
killall SystemUIServer 2>/dev/null

# --- Fonction : fermeture complète + relance en kiosque ---
# On quitte TOUJOURS Chrome avant de le relancer, même s'il tourne déjà
# sans fenêtre, sinon macOS ignore les nouveaux arguments (--kiosk, URL)
# et ouvre juste une fenêtre normale sur la page par défaut.
relaunch_kiosk() {
    osascript -e "tell application \"$CHROME_APP\" to quit" 2>/dev/null
    sleep 1
    pkill -x "Google Chrome" 2>/dev/null
    sleep 1
    open -a "$CHROME_APP" --args --kiosk --new-window \
        --no-first-run \
        --disable-session-crashed-bubble \
        --disable-infobars \
        --noerrdialogs \
        "$URL"
}

echo "$(date '+%Y-%m-%d %H:%M:%S') - Démarrage de la surveillance kiosque..."
relaunch_kiosk

# --- Boucle de surveillance ---
while true; do
    sleep 2

    if ! pgrep -x "Google Chrome" > /dev/null; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Chrome ne tourne plus, relance..."
        relaunch_kiosk
        continue
    fi

    WINDOW_COUNT=$(osascript -e "tell application \"$CHROME_APP\" to count windows" 2>/dev/null)

    if [ -z "$WINDOW_COUNT" ] || [ "$WINDOW_COUNT" -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Fenêtre fermée, relance complète en kiosque..."
        relaunch_kiosk
    fi
done
