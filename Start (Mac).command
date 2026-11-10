#!/usr/bin/env bash
# Doppelklick: Daten holen (wenn ein API-Schlüssel da ist) und Bully im Browser öffnen.
cd "$(dirname "$0")"
python3 scripts/abruf.py || echo "Ohne neue Daten weiter."
open "app/index.html"
