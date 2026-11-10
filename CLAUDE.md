# CLAUDE.md

Orientation for working in this repository. Keep it current when the architecture, data flow or conventions change.

## What this is

**Bully** is a private fan project: a German-language floorball prognosis web app for the men's small-field team
**SG Berlin Broilers** in the *Verbandsliga Herren Kleinfeld* of the Floorball-Verband Berlin-Brandenburg
(saisonmanager.de league 2573, `daten/liga_id.txt`, team name in `daten/team_name.txt`). It was derived from the
handball app FNNSHLE/teutonia-prognose ("Anwurf") and converted to floorball. Any team of the league can be the focus;
the own team is the default. Not affiliated with the club, Floorball Deutschland or saisonmanager.de (`ABSENDER` in `app/app.js`).

## Layout

```
index.html                Redirect -> app/index.html
sw.js                     Service worker (network first, cache fallback); must stay at the root
abruf.sh, Start (Mac).command, Start (Windows).bat   Launchers, all call scripts/abruf.py
scripts/abruf.py          Data fetch from saisonmanager.de (Python stdlib only, English)
scripts/demo.py           Writes clearly marked demo data (FB_DATA.demo = true) in the real API shapes
app/index.html            Single page: CSS tokens (Broilers: black, gold #E1A72A, Oswald), DOM skeleton, script tags
app/adapter.js            saisonmanager shapes -> internal shapes of the original app (HB_DATA, HB_DETAILS) + window.SPORT
app/app.js                UI, routing, rendering (German, IIFE)
app/modell.js             Team strength model on regulation time, league point rule, season simulation (overtime aware)
app/spieler.js            Player evaluation (goals, assists, penalty minutes, goalkeeper on/off), match timelines
app/kennzahlen.js         Per-team metrics: six equal phase slots, penalties, power play / short-handed goals
app/matchplan.js          Rule engine (AU1, AU2, AU5, AU7, DI1, DI2, PH1, PH2, GE1, GE2 power play, GE3) + lineup optimiser
app/ergebnisbild.js       Canvas renderer for GAME DAY / END STAND images (style of the club's Instagram posts)
app/assets/               Icons (own design, not the club crest), keyvisual, OG image, fonts (Oswald, Lato; OFL)
daten/daten.js            Generated: window.FB_DATA = {leagueId, teamName, fetchedAt, meta, schedule, table, scorer[, demo]}
daten/spielberichte.js    Generated: window.FB_GAMES = {gameId: games/<id>.json}
daten/cache/<id>.json     Raw game reports
daten/aenderung.js        Generated: when the set of finished games last changed ("Was sich geändert hat")
daten/logos.js, logos/    Generated team logos (same-origin for the canvas); logos/eigen.jpg = club crest fallback for the own team
daten/profile.js, fotos.js, zusagen.js, berichte.js   Hand-maintained (see LIESMICH.txt)
.github/workflows/daten.yml  Daily 05:00 UTC + Sat/Sun 21:30 UTC, commits "Daten aktualisiert YYYY-MM-DD"
```

No build step, no package manager. Classic scripts in a fixed order: data files, `adapter.js`, `modell.js`,
`spieler.js`, `kennzahlen.js`, `matchplan.js`, `ergebnisbild.js`, `app.js`. Bump `?v=` on every change to app JS files.

## Data source and access

saisonmanager.de API v2 (`https://saisonmanager.de/api/v2/`): `leagues/<id>/schedule.json`, `table.json`, `scorer.json`,
`meta.json`, `games/<id>.json`. Since API v2.6.0 (2026-10-29) these need an **API key** in the header `X-Api-Key`
(apply at https://saisonmanager.de/api-zugang; fair use 60 requests/minute). The key comes from the env var
`SAISONMANAGER_API_KEY` (GitHub secret) or a git-ignored `.api-key` file. The anonymous website session
(`POST public_session`) is for browsers on saisonmanager.de and is deliberately not used by the scripts.
Without a key the workflow exits with a warning and the app keeps the demo data. Source and OpenAPI spec of the API:
github.com/floorballdeutschland/saisonmanager-api (`docs/openapi/openapi.yml`, `app/models/game.rb#full_hash`).

Shapes used: schedule item `{game_id, game_day, date, time, arena_name, arena_address, home/guest_team_id|name|logo,
ended, result_string, result{home_goals, guest_goals, overtime, forfait, postfix}}`; table row `{team_id, games, won,
draw, lost, won_ot, lost_ot, goals_scored, goals_received, points, position}`; game report `{players{home|guest:
[{player_id, player_firstname, player_name, trikot_number, goalkeeper, captain}]}, starting_players, events: [{event_type
goal|penalty|timeout, event_team home|guest, period, time "mm:ss" cumulative, home_goals, guest_goals, number, assist,
goal_type regular|penalty_shot|owngoal|penalty_shots|..., penalty_type penalty_2|penalty_2and2|penalty_5|penalty_10|penalty_ms_*}],
period_titles, max_lineup_players}`. Player names can be masked by the API (privacy); the adapter falls back to `#number`.

## Adapter (app/adapter.js)

Keeps the original app's internal shapes so most of `app.js` stayed intact: matches with `local/visitor/result/status`,
lineups with `goals, assists, pim, two_minutes (team penalties), seven_meter_goals (penalty shot goals), is_goalkeeper,
starting_goalkeeper`, events with `event_type.id` 15 goal, 39 penalty-shot goal, 13 penalty, 14 personal 10', 8 match
penalty, 30 timeout. Dates keep the original convention (local time with a bogus `+00:00`, read via UTC getters;
missing time -> `T00:00:00` = "Termin offen"). It also derives:
- `window.SPORT`: periods (halves or thirds from `period_titles`), period length (from event times), six phase slots,
  point rule (scheme that best explains the official table), whether draws exist (else "Verlängerung").
- Regulation score for overtime games (`regular`), used by the model; tables use the official result + `verl`.
- Power-play / short-handed flag per goal from running penalties (minor ends on a power-play goal).

## Conventions

- UI copy and commit messages German; new files English (owner's rule from the original repo). Men's team: masculine
  forms (Spieler, Torhüter, Trainer, Schütze).
- Helpers in `app.js`: `dez()`, `vz()`, `pct()`, `stand()`, `esc()`, `modul()`, `kachel()`, `seitenkopf()`, `periodenText()`.
- Photos only for the own team and only with consent, hand-maintained in `daten/fotos.js`. Never fetch other teams' photos.
- Player sayings: `spruchFuerSpieler()` picks a stable line by category (goalkeeper, top scorer, many goals, playmaker,
  scorer, worker) from goals and assists; a `satz` in `daten/profile.js` always wins.
- Instagram match report (`spielberichtText`) names the own scorers and goalkeeper, never opposing players.
- WhatsApp message carries exactly one tip (`tippFuer`).
- The handball goalkeeper tracker, team song and sponsor images were removed.

## Working here

- Run: `python3 -m http.server` in the root, open `http://localhost:8000/app/`. Demo data: `python3 scripts/demo.py`.
- Syntax: `for f in app/*.js sw.js; do node --check "$f"; done`; `python3 -m py_compile scripts/*.py`.
- Verify by clicking through Start, Matchplan, Spiele, Tabelle, Durchspielen, Spieler, Teams, Social, Methodik in light
  and dark mode on a phone-sized viewport, and render the social images in all three formats.
- Do not hand-edit generated files in `daten/`; fix `scripts/abruf.py` instead.
