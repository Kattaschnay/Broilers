#!/usr/bin/env python3
"""One-off import of data read in the browser from saisonmanager.de (compact form in /tmp/raw) into daten/.

Used once on 2026-11-10 because no API key was available yet. Writes the same shapes as scripts/abruf.py,
so the app and the regular fetch work unchanged. Usage: python3 scripts/import_browser.py /tmp/raw
"""
import json, os, sys, zlib, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = sys.argv[1] if len(sys.argv) > 1 else '/tmp/raw'
load = lambda n: json.load(open(os.path.join(RAW, n), encoding='utf-8'))
teams, s = load('teams.json'), load('sched.json')
games = {**load('games1.json'), **load('games2.json')}
PT = [{'period': 1, 'title': '1. Hälfte'}, {'period': 1.5, 'title': 'Halbzeitpause'}, {'period': 2, 'title': '2. Hälfte'},
      {'period': 3, 'title': 'Verlängerung'}, {'period': 4, 'title': 'Penalty-Schießen'}]
schedule, reports = [], {}
for r in s['rows']:
    gid, nr, day, ar, date, time, h, g = r[:8]
    a = s['arenas'][ar]
    item = {'game_id': gid, 'game_number': nr, 'game_day': day, 'arena_name': a[0], 'arena_address': a[1], 'date': date, 'time': time,
            'home_team_name': teams[str(h)][0], 'home_team_id': h, 'home_team_logo': teams[str(h)][1],
            'guest_team_name': teams[str(g)][0], 'guest_team_id': g, 'guest_team_logo': teams[str(g)][1],
            'started': len(r) > 8, 'ended': len(r) > 8, 'result_string': None, 'result': None}
    schedule.append(item)
    if len(r) > 8:
        hg, gg, hp, gp = r[8:12]
        item['result_string'] = f'{hg}:{gg}'
        item['result'] = {'home_goals': hg, 'guest_goals': gg, 'home_goals_period': hp + [0, 0], 'guest_goals_period': gp + [0, 0],
                          'postfix': {'short': '', 'long': ''}, 'forfait': False, 'overtime': False}
        ev, (ph, pg) = games[str(gid)]
        events = []
        for i, e in enumerate(ev, 1):
            t, side, per, tm, hgo, ggo, num, ass, kind = e
            x = {'event_id': i, 'event_type': t, 'event_team': side, 'period': per, 'time': tm, 'home_goals': hgo, 'guest_goals': ggo}
            if t == 'goal':
                x.update(number=num, goal_type=kind)
                if ass: x['assist'] = ass
            elif t == 'penalty':
                x.update(number=num, penalty_type=kind)
            events.append(x)
        pl = lambda l: [{'player_id': p[0], 'player_firstname': p[1], 'player_name': p[2], 'trikot_number': p[3], 'goalkeeper': bool(p[4]), 'captain': bool(p[5])} for p in l]
        reports[gid] = {'id': gid, 'game_number': nr, 'date': date, 'start_time': time, 'home_team_name': item['home_team_name'], 'guest_team_name': item['guest_team_name'],
                        'home_team_id': h, 'guest_team_id': g, 'events': events, 'players': {'home': pl(ph), 'guest': pl(pg)},
                        'started': True, 'ended': True, 'result_string': item['result_string'], 'result': item['result'],
                        'league_name': 'Verbandsliga Herren Kleinfeld', 'period_titles': PT, 'max_lineup_players': 14,
                        'arena_name': a[0], 'arena_address': a[1]}
        # check: last goal event equals official result
        goals = [x for x in events if x['event_type'] == 'goal']
        if goals and (goals[-1]['home_goals'], goals[-1]['guest_goals']) != (hg, gg):
            print('MISMATCH', gid, goals[-1]['home_goals'], goals[-1]['guest_goals'], hg, gg)
table = [{'team_id': z[0], 'team_name': teams[str(z[0])][0], 'team_logo': teams[str(z[0])][1], 'games': z[1], 'won': z[2], 'draw': z[3], 'lost': z[4],
          'won_ot': 0, 'lost_ot': 0, 'goals_scored': z[5], 'goals_received': z[6], 'goals_diff': z[5] - z[6], 'points': z[7], 'position': z[8]} for z in s['table']]
now = '2026-11-10T20:35:00Z'
data = {'leagueId': 2573, 'teamName': 'SG Berlin Broilers', 'fetchedAt': now, 'source': 'browser-import',
        'meta': {'name': 'Verbandsliga Herren Kleinfeld', 'short_name': 'VL Herren KF'}, 'schedule': schedule, 'table': table, 'scorer': []}
D = os.path.join(ROOT, 'daten')
dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
os.makedirs(os.path.join(D, 'cache'), exist_ok=True)
for gid, rep in reports.items():
    open(os.path.join(D, 'cache', f'{gid}.json'), 'w', encoding='utf-8').write(dump(rep))
open(os.path.join(D, 'daten.js'), 'w', encoding='utf-8').write(f'window.FB_DATA = {dump(data)};\n')
open(os.path.join(D, 'spielberichte.js'), 'w', encoding='utf-8').write('window.FB_GAMES = {};\n' + ''.join(f'window.FB_GAMES[{k}] = {dump(v)};\n' for k, v in sorted(reports.items())))
sig = str(zlib.crc32(' '.join(sorted(str(k) for k in reports)).encode()))
open(os.path.join(D, 'aenderung.js'), 'w', encoding='utf-8').write(f'window.HB_AENDERUNG = {{"sig": "{sig}", "seit": "{now}"}};\n')
print(len(schedule), 'Spiele,', len(reports), 'Spielberichte')
