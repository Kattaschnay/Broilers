#!/usr/bin/env python3
"""Fetch league data from saisonmanager.de (Floorball Deutschland) into daten/.

Used by abruf.sh, the double-click launchers and the daily GitHub Action. Standard library only.

Access: since API v2.6.0 (2026-10-29) the public endpoints need an API key (header X-Api-Key).
Apply for one at https://saisonmanager.de/api-zugang and either
  - set the environment variable SAISONMANAGER_API_KEY (GitHub: repository secret of the same name), or
  - put the key into a file `.api-key` in the repository root (git-ignored, for local use).
The anonymous website session (POST public_session) is meant for browsers on saisonmanager.de and is
deliberately not used here.

Writes (all loaded by app/index.html as classic scripts, so the app works offline and from file://):
  daten/daten.js         window.FB_DATA  = {leagueId, teamName, fetchedAt, meta, schedule, table, scorer}
  daten/spielberichte.js window.FB_GAMES = {gameId: game report}  (finished games only)
  daten/aenderung.js     window.HB_AENDERUNG = {sig, seit}  (changes only when the set of finished games changes)
  daten/logos.js         window.HB_LOGOS = {teamId: key}  + daten/logos/<teamId>.jpg (same-origin for the canvas)
and bumps the ?t= cache buster in app/index.html.
"""
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'daten')
CACHE = os.path.join(DATA, 'cache')
LOGOS = os.path.join(DATA, 'logos')
BASE = 'https://saisonmanager.de/api/v2/'
UA = 'Mozilla/5.0 (compatible; bully-floorball-prognose/1.0; +https://github.com/Kattaschnay/Broilers)'
REFETCH_DAYS = 7  # finished games are fetched again for a week, reports get corrected after the fact


def read_text(name, default=''):
    try:
        with open(os.path.join(DATA, name), encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return default


def api_key():
    key = os.environ.get('SAISONMANAGER_API_KEY', '').strip()
    if not key:
        try:
            with open(os.path.join(ROOT, '.api-key'), encoding='utf-8') as f:
                key = f.read().strip()
        except OSError:
            pass
    return key


def get(url, key=None, binary=False, tries=3):
    headers = {'User-Agent': UA, 'Accept': '*/*' if binary else 'application/json'}
    if key:
        headers['X-Api-Key'] = key
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                body = r.read()
            return body if binary else json.loads(body.decode('utf-8'))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (401, 403, 404):
                break
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'{url}: {last}')


def write_js(path, text):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, path)


def dumps(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


def shrink_logo(path):
    tool = shutil.which('magick') or shutil.which('convert')
    if tool:
        subprocess.run([tool, path, '-background', 'white', '-flatten', '-resize', '256x256', '-strip', '-quality', '88', path + '.jpg'],
                       check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(path + '.jpg'):
            os.replace(path + '.jpg', path)
            return
    if shutil.which('sips'):
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-Z', '256', path, '--out', path], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def fetch_logos(schedule, key=None):
    """Store every team logo locally: the social images draw them on a canvas, which needs same-origin images."""
    os.makedirs(LOGOS, exist_ok=True)
    sources_file = os.path.join(LOGOS, 'quellen.txt')
    sources = {}
    if os.path.exists(sources_file):
        for line in open(sources_file, encoding='utf-8'):
            parts = line.split()
            if len(parts) == 2:
                sources[parts[0]] = parts[1]
    wanted = {}
    for g in schedule:
        for side in ('home', 'guest'):
            tid, url = g.get(f'{side}_team_id'), g.get(f'{side}_team_logo')
            if tid and url and isinstance(url, str):
                wanted[str(tid)] = url if url.startswith('http') else 'https://saisonmanager.de' + url
    new = 0
    for tid, url in sorted(wanted.items()):
        target = os.path.join(LOGOS, f'{tid}.jpg')
        if os.path.exists(target) and sources.get(tid) == url:
            continue
        try:
            body = get(url, key if 'saisonmanager.de' in url else None, binary=True)
        except RuntimeError:
            continue
        if len(body) < 100:
            continue
        with open(target, 'wb') as f:
            f.write(body)
        shrink_logo(target)
        sources[tid] = url
        new += 1
    with open(sources_file, 'w', encoding='utf-8') as f:
        f.writelines(f'{k} {v}\n' for k, v in sorted(sources.items()))
    keys = {tid: hashlib.sha1(url.encode()).hexdigest()[:8] for tid, url in sources.items()
            if os.path.exists(os.path.join(LOGOS, f'{tid}.jpg'))}
    # The own club crest (daten/logos/eigen.jpg, from the club website) is kept as a fallback for the own team.
    write_js(os.path.join(DATA, 'logos.js'), f'window.HB_LOGOS = {dumps(keys)};\n')
    return new


def bump_cache_buster():
    path = os.path.join(ROOT, 'app', 'index.html')
    with open(path, encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'\?t=\d+', f'?t={int(time.time())}', html)
    write_js(path, html)


def main():
    league = re.sub(r'\D', '', read_text('liga_id.txt', '2573')) or '2573'
    team_name = read_text('team_name.txt', 'SG Berlin Broilers')
    key = api_key()
    if not key:
        print('Kein API-Schlüssel für saisonmanager.de gefunden (SAISONMANAGER_API_KEY oder Datei .api-key).')
        print('Antrag: https://saisonmanager.de/api-zugang – bis dahin zeigt die App die Demodaten.')
        return 2
    print(f'Hole Daten von saisonmanager.de (Liga {league}, Team „{team_name}“) …')
    try:
        schedule = get(f'{BASE}leagues/{league}/schedule.json', key)
        table = get(f'{BASE}leagues/{league}/table.json', key)
    except RuntimeError as e:
        print('Abruf fehlgeschlagen:', e)
        return 1
    try:
        scorer = get(f'{BASE}leagues/{league}/scorer.json', key)
    except RuntimeError:
        scorer = []
    try:
        meta = get(f'{BASE}leagues/{league}/meta.json', key)
    except RuntimeError:
        meta = {}
    if not isinstance(schedule, list) or not schedule:
        print('Spielplan leer oder unerwartet, nichts geschrieben.')
        return 1

    now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    data = {'leagueId': int(league), 'teamName': team_name, 'fetchedAt': now, 'meta': meta,
            'schedule': schedule, 'table': table if isinstance(table, list) else [], 'scorer': scorer if isinstance(scorer, list) else []}
    write_js(os.path.join(DATA, 'daten.js'), f'window.FB_DATA = {dumps(data)};\n')

    # Game reports of finished games, cached; recent ones are refreshed.
    os.makedirs(CACHE, exist_ok=True)
    border = (dt.date.today() - dt.timedelta(days=REFETCH_DAYS)).isoformat()
    finished = [g for g in schedule if g.get('ended') and g.get('game_id')]
    fresh = 0
    for g in finished:
        gid = g['game_id']
        path = os.path.join(CACHE, f'{gid}.json')
        if os.path.exists(path) and os.path.getsize(path) > 0 and str(g.get('date') or '') < border:
            continue
        try:
            report = get(f'{BASE}games/{gid}.json', key)
        except RuntimeError:
            continue
        for private in ('permission', 'checklist', 'special_event_string'):
            report.pop(private, None)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(dumps(report))
        fresh += 1
        time.sleep(0.3)  # stay far below the fair-use limit of 60 requests per minute
    print(f'{fresh} Spielberichte geladen.')

    parts = ['window.FB_GAMES = {};\n']
    for name in sorted(os.listdir(CACHE)):
        if name.endswith('.json'):
            with open(os.path.join(CACHE, name), encoding='utf-8') as f:
                parts.append(f'window.FB_GAMES[{int(name[:-5])}] = {f.read().strip()};\n')
    write_js(os.path.join(DATA, 'spielberichte.js'), ''.join(parts))

    # When did the set of finished games last change? Shown as „Aktualisiert am …“ in the app.
    ids = sorted(str(g['game_id']) for g in finished if g.get('result_string') or g.get('result'))
    sig = str(zlib.crc32(' '.join(ids).encode()))
    old = re.search(r'"sig":\s*"(\d+)"', read_text('aenderung.js'))
    if ids and (not old or old.group(1) != sig):
        write_js(os.path.join(DATA, 'aenderung.js'), f'window.HB_AENDERUNG = {{"sig": "{sig}", "seit": "{now}"}};\n')

    print(f'{fetch_logos(schedule, key)} Logos geladen.')
    bump_cache_buster()
    print('Daten aktualisiert.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
