#!/bin/sh
# Serves the game folder on this computer only and opens it in the default browser. Close this window to stop.
cd "$(dirname "$0")/game" || exit 1
PORT=4725
(sleep 1; xdg-open "http://localhost:$PORT/") &
if command -v python3 >/dev/null 2>&1 && { [ "$(uname)" != Darwin ] || xcode-select -p >/dev/null 2>&1; }; then exec python3 -m http.server $PORT --bind 127.0.0.1
else exec ruby -run -e httpd . -p $PORT -b 127.0.0.1
fi
