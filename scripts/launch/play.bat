@echo off
rem Serves the game folder on this computer only and opens it in the default browser.
cd /d "%~dp0game"
start "" http://localhost:4725/
py -m http.server 4725 --bind 127.0.0.1
