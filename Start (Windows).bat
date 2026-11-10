@echo off
REM Doppelklick: Daten holen (wenn ein API-Schluessel da ist) und Bully im Browser oeffnen.
cd /d "%~dp0"
py -3 scripts\abruf.py 2>nul || python scripts\abruf.py
start "" "app\index.html"
