# Bully · Floorball-Prognose der Broilers

Fan-App für die **SG Berlin Broilers** in der *Verbandsliga Herren Kleinfeld* (FVBB, saisonmanager.de Liga 2573).
Abgeleitet aus der Handball-App [FNNSHLE/teutonia-prognose](https://github.com/FNNSHLE/teutonia-prognose), umgebaut auf Floorball.
Anleitung für Nutzer: `LIESMICH.txt`, Architektur für Entwickler: `CLAUDE.md`.

## Offene Punkte
- [ ] API-Schlüssel für saisonmanager.de beantragen und als Secret `SAISONMANAGER_API_KEY` eintragen
- [ ] Nach dem ersten echten Abruf prüfen: Teamname erkannt (`daten/team_name.txt`), Spielzeit (Halbzeiten/Drittel), Punkteregel
- [ ] `daten/profile.js` mit Positionen und Sprüchen füllen, Fotos nur mit Zustimmung
- [ ] GitHub Pages einschalten
- [ ] Optional: Mannschaftsfoto für die Game-Day-Bilder (`daten/fotos/team.jpg`)
