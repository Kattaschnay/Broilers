#!/usr/bin/env python3
"""Write clearly marked demo data in the exact saisonmanager.de shapes to daten/.

Only for trying the app before an API key is available. Team and player names are invented
("Demo …"), results are simulated. The first successful run of scripts/abruf.py overwrites everything.
The app shows a banner as long as FB_DATA.demo is true.

Usage: python3 scripts/demo.py
"""
import datetime as dt
import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'daten')
OWN = 'SG Berlin Broilers'
TEAMS = [OWN, 'Demo Adler', 'Demo Bären', 'Demo Füchse', 'Demo Haie', 'Demo Luchse', 'Demo Wölfe', 'Demo Zebras']
FIRST = ['Jonas', 'Felix', 'Lukas', 'Paul', 'Tim', 'Moritz', 'Jan', 'Niklas', 'Leon', 'David', 'Simon', 'Philipp', 'Max', 'Erik',
         'Tom', 'Ben', 'Jakob', 'Noah', 'Malte', 'Ole', 'Hannes', 'Karl', 'Linus', 'Theo', 'Anton', 'Emil', 'Henrik', 'Lars']
LAST = ['Becker', 'Hoffmann', 'Schulz', 'Krüger', 'Wolf', 'Neumann', 'Braun', 'Zimmermann', 'Hartmann', 'Lange', 'Werner', 'Krause',
        'Lehmann', 'Köhler', 'Maier', 'Fuchs', 'Vogel', 'Jung', 'Roth', 'Frank', 'Berger', 'Kaiser', 'Seidel', 'Arnold', 'Brandt', 'Haas']
VENUES = [('Sporthalle Geocampus Lankwitz', 'Malteserstr. 74–100, 12249 Berlin'),
          ('Demo-Sporthalle Nord', 'Musterstraße 1, 13353 Berlin'),
          ('Demo-Halle Süd', 'Beispielweg 5, 12043 Berlin'),
          ('Demo-Arena Ost', 'Probeallee 9, 10247 Berlin')]
PERIODS, PERIOD_MIN = 2, 20
PERIOD_TITLES = [{'period': 1, 'short_title': '1', 'title': '1. Halbzeit'}, {'period': 1.5, 'short_title': 'P', 'title': 'Halbzeitpause'},
                 {'period': 2, 'short_title': '2', 'title': '2. Halbzeit'}]


def poisson(r, lam):
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= l:
            return k
        k += 1


def main():
    r = random.Random(2573)
    teams = [{'id': 9100 + i, 'name': n, 'att': r.gauss(0, .18), 'def': r.gauss(0, .18)} for i, n in enumerate(TEAMS)]
    teams[0]['att'] += .12
    rosters = {}
    pid = 700000
    for t in teams:
        names, used = [], set()
        while len(names) < 13:
            n = (r.choice(FIRST), r.choice(LAST))
            if n not in used:
                used.add(n)
                names.append(n)
        nums = r.sample(range(2, 99), 13)
        roster = []
        for i, (f, l) in enumerate(names):
            pid += 1
            roster.append({'player_id': pid, 'player_firstname': f, 'player_name': l, 'trikot_number': 1 if i == 0 else (30 if i == 1 else nums[i]),
                           'goalkeeper': i < 2, 'captain': i == 4, 'weight': 0 if i < 2 else r.uniform(.4, 2.2) * (1.6 if i in (2, 3, 4) else 1),
                           'regular': i not in (1, 11, 12) or r.random() < .4})
        rosters[t['id']] = roster

    # Double round robin, Kleinfeld style: game days at one venue with several games each.
    ids = [t['id'] for t in teams]
    rounds = []
    lst = ids[:]
    for _ in range(len(ids) - 1):
        rounds.append([(lst[i], lst[-1 - i]) for i in range(len(ids) // 2)])
        lst = [lst[0]] + [lst[-1]] + lst[1:-1]
    rounds += [[(b, a) for a, b in rd] for rd in rounds]
    start = dt.date(2026, 9, 12)
    today = dt.date(2026, 11, 10)
    schedule, games, gid, gno = [], {}, 880000, 1
    for day_no, rd in enumerate(rounds, 1):
        # two rounds share one weekend date (Saturday and Sunday), every three weeks
        date = start + dt.timedelta(days=21 * ((day_no - 1) // 2) + (day_no - 1) % 2)
        venue = VENUES[(day_no - 1) % len(VENUES)]
        no_time = date > today + dt.timedelta(days=60)
        for k, (h, a) in enumerate(rd):
            gid += 1
            hour = 10 + 2 * k
            item = {'game_id': gid, 'game_number': gno, 'game_day': day_no, 'game_day_id': 5000 + day_no, 'arena': day_no,
                    'arena_name': venue[0], 'arena_address': venue[1], 'date': date.isoformat(), 'time': None if no_time else f'{hour:02d}:00',
                    'home_team_name': teams[ids.index(h)]['name'], 'home_team_id': h, 'home_team_logo': None,
                    'guest_team_name': teams[ids.index(a)]['name'], 'guest_team_id': a, 'guest_team_logo': None,
                    'started': False, 'ended': False, 'state': 'planned', 'result_string': None}
            gno += 1
            if date < today:
                report = simulate(r, item, teams[ids.index(h)], teams[ids.index(a)], rosters[h], rosters[a])
                item.update(started=True, ended=True, state='ended', result_string=report['result_string'], result=report['result'])
                games[gid] = report
            schedule.append(item)

    table = {t['id']: {'team_id': t['id'], 'team_name': t['name'], 'team_logo': None, 'games': 0, 'won': 0, 'draw': 0, 'lost': 0,
                       'won_ot': 0, 'lost_ot': 0, 'goals_scored': 0, 'goals_received': 0, 'goals_diff': 0, 'points': 0} for t in teams}
    for g in schedule:
        if not g['ended']:
            continue
        hg, ag = g['result']['home_goals'], g['result']['guest_goals']
        for tid, f, a in ((g['home_team_id'], hg, ag), (g['guest_team_id'], ag, hg)):
            row = table[tid]
            row['games'] += 1
            row['goals_scored'] += f
            row['goals_received'] += a
            row['goals_diff'] = row['goals_scored'] - row['goals_received']
            if f > a:
                row['won'] += 1; row['points'] += 2
            elif f == a:
                row['draw'] += 1; row['points'] += 1
            else:
                row['lost'] += 1
    rows = sorted(table.values(), key=lambda x: (-x['points'], -x['goals_diff'], -x['goals_scored']))
    for i, row in enumerate(rows):
        row['position'] = i + 1
        row['sort'] = i

    now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    data = {'demo': True, 'leagueId': 2573, 'teamName': OWN, 'fetchedAt': now,
            'meta': {'name': 'Verbandsliga Herren Kleinfeld', 'short_name': 'VL KF'},
            'schedule': schedule, 'table': rows, 'scorer': []}
    dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(DATA, 'daten.js'), 'w', encoding='utf-8') as f:
        f.write(f'window.FB_DATA = {dump(data)};\n')
    with open(os.path.join(DATA, 'spielberichte.js'), 'w', encoding='utf-8') as f:
        f.write('window.FB_GAMES = {};\n' + ''.join(f'window.FB_GAMES[{k}] = {dump(v)};\n' for k, v in games.items()))
    ended = [g for g in schedule if g['ended']]
    with open(os.path.join(DATA, 'aenderung.js'), 'w', encoding='utf-8') as f:
        f.write(f'window.HB_AENDERUNG = {{"sig": "demo{len(ended)}", "seit": "{now}"}};\n')
    print(f'Demodaten: {len(ended)} Spiele gespielt, {len(schedule) - len(ended)} offen.')


def simulate(r, item, th, ta, rh, ra):
    lam = 6.2
    eh = lam * math.exp(.05 + th['att'] - ta['def'])
    ea = lam * math.exp(ta['att'] - th['def'])
    hg, ag = poisson(r, eh), poisson(r, ea)
    total = PERIODS * PERIOD_MIN * 60
    times = sorted(r.sample(range(15, total - 5), hg + ag))
    sides = ['home'] * hg + ['guest'] * ag
    r.shuffle(sides)
    lineup = {'home': [p for p in rh if p['regular'] or r.random() < .5], 'guest': [p for p in ra if p['regular'] or r.random() < .5]}
    events, score, eid = [], {'home': 0, 'guest': 0}, 0

    def pick(side, exclude=None):
        cands = [p for p in lineup[side] if not p['goalkeeper'] and p is not exclude]
        return r.choices(cands, weights=[p['weight'] for p in cands])[0]

    def stamp(sec):
        return f'{sec // 60:02d}:{sec % 60:02d}'

    pens = sorted(r.sample(range(30, total - 30), r.randint(1, 5)))
    for sec in pens:
        side = r.choice(['home', 'guest'])
        kind = r.choices(['penalty_2', 'penalty_2and2', 'penalty_10', 'penalty_5'], [80, 8, 9, 3])[0]
        eid += 1
        events.append({'event_id': eid, 'event_type': 'penalty', 'event_team': side, 'period': 1 + sec // (PERIOD_MIN * 60), 'time': stamp(sec),
                       'home_goals': None, 'guest_goals': None, 'number': pick(side)['trikot_number'], 'penalty_type': kind,
                       'penalty_type_string': {'penalty_2': '2 Minuten', 'penalty_2and2': '2+2 Minuten', 'penalty_10': '10 Minuten', 'penalty_5': '5 Minuten'}[kind]})
    for side in ('home', 'guest'):
        if r.random() < .5:
            sec = r.randint(PERIOD_MIN * 60, total - 60)
            eid += 1
            events.append({'event_id': 9000 + (1 if side == 'home' else 2), 'event_type': 'timeout', 'event_team': side,
                           'period': 1 + sec // (PERIOD_MIN * 60), 'time': stamp(sec)})
    for sec, side in zip(times, sides):
        score[side] += 1
        scorer = pick(side)
        eid += 1
        pshot = r.random() < .03
        ev = {'event_id': eid, 'event_type': 'goal', 'event_team': side, 'period': 1 + sec // (PERIOD_MIN * 60), 'time': stamp(sec),
              'home_goals': score['home'], 'guest_goals': score['guest'], 'number': scorer['trikot_number'],
              'goal_type': 'penalty_shot' if pshot else 'regular', 'goal_type_string': 'Strafschuss' if pshot else 'Tor'}
        if not pshot and r.random() < .7:
            ev['assist'] = pick(side, scorer)['trikot_number']
        events.append(ev)
    events.sort(key=lambda e: (e['period'], e['time']))
    per = lambda side: [sum(1 for e in events if e['event_type'] == 'goal' and e['event_team'] == side and e['period'] == p) for p in (1, 2)] + [0, 0]
    players = {s: [{k: p[k] for k in ('player_id', 'player_firstname', 'player_name', 'trikot_number', 'goalkeeper', 'captain')}
                   | {'position': 'Tor' if p['goalkeeper'] else 'Feld'} for p in lineup[s]] for s in lineup}
    result = {'home_goals': hg, 'guest_goals': ag, 'home_goals_period': per('home'), 'guest_goals_period': per('guest'),
              'postfix': {'short': '', 'long': ''}, 'forfait': False, 'overtime': False}
    return {'id': item['game_id'], 'game_number': item['game_number'], 'start_time': item['time'], 'date': item['date'],
            'home_team_name': item['home_team_name'], 'guest_team_name': item['guest_team_name'],
            'home_team_id': item['home_team_id'], 'guest_team_id': item['guest_team_id'], 'home_team_logo': None, 'guest_team_logo': None,
            'events': events, 'players': players, 'started': True, 'ended': True, 'result_string': f'{hg}:{ag}', 'result': result,
            'league_name': 'Verbandsliga Herren Kleinfeld', 'period_titles': PERIOD_TITLES, 'max_lineup_players': 14,
            'arena_name': item['arena_name'], 'arena_address': item['arena_address']}


if __name__ == '__main__':
    main()
