#!/usr/bin/env bash
# Bully: Datenabruf ohne Browser (Mac, Linux, GitHub Actions). Holt Spielplan, Tabelle und Spielberichte
# von saisonmanager.de nach daten/. Braucht einen API-Schlüssel, siehe scripts/abruf.py und LIESMICH.txt.
set -u
cd "$(dirname "$0")"
exec python3 scripts/abruf.py
