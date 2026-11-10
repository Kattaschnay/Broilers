// Adapter: saisonmanager.de (Floorball Deutschland) -> internal shapes used by app.js and the model files.
// Input:  window.FB_DATA (daten/daten.js) and window.FB_GAMES (daten/spielberichte.js), see scripts/abruf.py.
// Output: window.HB_DATA    { teamId, fetchedAt, demo, leagueName, pages: [{data: [match]}], standings: {data: [row]} }
//         window.HB_DETAILS { gameId: { l: {data: {local, visitor}}, e: {data: [event]} } }
//         window.SPORT      period structure, point rules and helpers (see below)
// Dates keep the convention of the original app: local Berlin time with a bogus +00:00 suffix, the app reads the UTC
// components for display. A missing kick-off time becomes T00:00:00 (= "Termin offen").
(function () {
  'use strict';
  const src = window.FB_DATA;
  const reports = window.FB_GAMES || {};
  const schedule = src && Array.isArray(src.schedule) ? src.schedule : [];

  // ---------- period structure ----------
  // Regular periods from period_titles of any report (halves or thirds), length estimated from event times.
  const anyReport = Object.values(reports).find(r => r && Array.isArray(r.period_titles) && r.period_titles.length);
  const regularTitles = anyReport ? anyReport.period_titles.filter(p => Number.isInteger(Number(p.period)) && /drittel|halbzeit|hälfte|periode/i.test(p.title || '')) : [];
  const periods = regularTitles.length >= 2 ? regularTitles.length : 2;
  const toSec = t => { const m = /^(\d+):(\d\d)$/.exec(String(t || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  // Event times are either counted per period ("0:07" in the 2nd half) or cumulative ("20:07"); detect which.
  const allEvents = [].concat(...Object.values(reports).map(r => r.events || []));
  const perPeriod = allEvents.some(e => Number(e.period) >= 2 && Number(e.period) <= periods && (toSec(e.time) || 0) < 600);
  let maxRegular = 0;
  allEvents.forEach(e => {
    const s = toSec(e.time);
    if (s != null && Number(e.period) <= periods && e.event_type !== 'timeout') maxRegular = Math.max(maxRegular, s);
  });
  // Period length: smallest of the usual lengths that covers every regular event (Kleinfeld 15 or 20, Großfeld 20).
  const periodMin = [10, 12, 15, 20, 25, 30].find(x => x * (perPeriod ? 1 : periods) * 60 >= maxRegular) || 20;
  // Seconds since the start of the game
  const gameSec = e => { const s = toSec(e.time); if (s == null) return null; const p = Number(e.period) || 1; return perPeriod ? (Math.min(p, periods + 1) - 1) * periodMin * 60 + s : s; };
  const total = periods * periodMin;

  // ---------- point rules ----------
  // Derived from the official table: which scheme explains the points best? Draws allowed unless overtime shows up.
  const table = src && Array.isArray(src.table) ? src.table : [];
  const SCHEMES = [
    { S: 2, U: 1, N: 0, SV: 2, NV: 1 }, { S: 3, U: 1, N: 0, SV: 2, NV: 1 }, { S: 3, U: 2, N: 0, SV: 2, NV: 1 },
    { S: 2, U: 1, N: 0, SV: 2, NV: 0 }, { S: 3, U: 1, N: 0, SV: 3, NV: 0 }, { S: 2, U: 1, N: 0, SV: 1, NV: 0 },
  ];
  const err = s => table.reduce((a, z) => {
    const corr = z.point_corrections && Number(z.point_corrections.points) || 0;
    const p = s.S * (z.won || 0) + s.U * (z.draw || 0) + s.N * (z.lost || 0) + s.SV * (z.won_ot || 0) + s.NV * (z.lost_ot || 0) + corr;
    return a + Math.abs(p - (z.points || 0));
  }, 0);
  const points = SCHEMES.slice().sort((a, b) => err(a) - err(b))[0];
  const anyOT = table.some(z => (z.won_ot || 0) + (z.lost_ot || 0) > 0) || schedule.some(g => g.result && g.result.overtime);
  const anyDraw = table.some(z => (z.draw || 0) > 0);
  const draws = anyDraw || !anyOT;

  // Slots for phase analysis: always six, so they line up with halves (3+3) and thirds (2+2+2).
  const slotMin = total / 6;
  const slotLabel = i => `${Math.round(i * slotMin)}`;
  window.SPORT = {
    periods, periodMin, total, slotMin, slotLabel, points, draws,
    periodName: periods === 3 ? 'Drittel' : 'Halbzeit',
    periodNames: periods === 3 ? ['1. Drittel', '2. Drittel', '3. Drittel'] : ['1. Halbzeit', '2. Halbzeit'],
    drawLabel: draws ? 'Remis' : 'Verlängerung',
  };
  if (!src || !schedule.length) return;

  // ---------- teams and own team ----------
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
  const teamsById = {};
  schedule.forEach(g => {
    if (g.home_team_id) teamsById[g.home_team_id] = teamsById[g.home_team_id] || { id: g.home_team_id, name: g.home_team_name, logo: g.home_team_logo };
    if (g.guest_team_id) teamsById[g.guest_team_id] = teamsById[g.guest_team_id] || { id: g.guest_team_id, name: g.guest_team_name, logo: g.guest_team_logo };
  });
  const wanted = norm(src.teamName || 'SG Berlin Broilers');
  const allTeams = Object.values(teamsById);
  const own = allTeams.find(t => norm(t.name) === wanted) || allTeams.find(t => norm(t.name).includes('broilers')) ||
    allTeams.find(t => wanted.split(' ').filter(w => w.length > 3).every(w => norm(t.name).includes(w)));

  // ---------- results ----------
  const parseResult = g => {
    const r = g.result || {};
    let h = r.home_goals, a = r.guest_goals, extra = (r.postfix && r.postfix.short) || '';
    if ((h == null || a == null) && g.result_string) {
      const m = /(\d+)\s*:\s*(\d+)\s*(.*)$/.exec(g.result_string);
      if (m) { h = Number(m[1]); a = Number(m[2]); extra = extra || m[3]; }
    }
    const forfait = !!r.forfait || /forfait|kampflos/i.test(extra) || /forfait/i.test(g.notice_type || '');
    return { h: h == null ? null : Number(h), a: a == null ? null : Number(a), extra: String(extra || '').trim(), forfait, overtime: !!r.overtime || /n\.\s?V|PS/i.test(extra) };
  };

  // ---------- game reports: lineups and events ----------
  const PEN = { // penalty_type -> [team penalties counted as "Zeitstrafen", minutes, seconds short-handed, name]
    penalty_2: [1, 2, 120, 'Zeitstrafe 2'], penalty_2and2: [2, 4, 240, 'Zeitstrafe 2+2'], penalty_5: [1, 5, 300, 'Zeitstrafe 5'],
    penalty_10: [0, 10, 0, 'Persönliche Strafe 10'], penalty_ms_tech: [1, 20, 300, 'Matchstrafe'], penalty_ms_full: [1, 25, 300, 'Matchstrafe'],
    penalty_ms1: [1, 20, 300, 'Matchstrafe'], penalty_ms2: [1, 25, 300, 'Matchstrafe'], penalty_ms3: [1, 25, 300, 'Matchstrafe'],
  };
  const details = {};
  const regulation = {};
  Object.keys(reports).forEach(gid => {
    const r = reports[gid];
    if (!r) return;
    const players = r.players || {};
    const byNumber = { home: {}, guest: {} };
    const lineup = { home: [], guest: [] };
    ['home', 'guest'].forEach(side => (players[side] || []).forEach(p => {
      const first = String(p.player_firstname || '').trim(), last = String(p.player_name || '').trim();
      const entry = {
        player: { id: String(p.player_id), first_name: first, last_name: last || (first ? '' : `#${p.trikot_number}`) },
        number: Number(p.trikot_number) || 0, goals: 0, assists: 0, seven_meter_goals: 0, seven_meter_attempts: 0,
        two_minutes: 0, pim: 0, sanctions: { disqualification: false }, is_staff: false,
        is_goalkeeper: p.goalkeeper === true || p.position === 'Tor', is_captain: !!p.captain,
      };
      lineup[side].push(entry);
      byNumber[side][String(p.trikot_number)] = entry;
    }));
    // Starting goalkeeper from the starting lineup (both goalkeepers are usually on the sheet)
    const starters = r.starting_players || {};
    ['home', 'guest'].forEach(side => {
      const gk = (starters[side] || []).find(x => x.position === 'goal' && x.player_id);
      const e = gk && lineup[side].find(x => x.player.id === String(gk.player_id));
      if (e) e.starting_goalkeeper = true;
    });
    const evs = (r.events || []).slice().sort((x, y) => (Number(x.period) - Number(y.period)) || ((toSec(x.time) || 0) - (toSec(y.time) || 0)) || ((x.event_id || 0) - (y.event_id || 0)));
    const out = [];
    const active = { home: [], guest: [] }; // running penalties for power-play detection: {end, minor, left}
    let reg = { home: 0, guest: 0 };
    evs.forEach(e => {
      const side = e.event_team === 'guest' ? 'guest' : 'home', other = side === 'home' ? 'guest' : 'home';
      const sec = gameSec(e);
      const period = Number(e.period) || 1;
      const minute = sec == null ? 0 : Math.max(1, Math.ceil(sec / 60));
      const who = byNumber[side][String(e.number)];
      const base = { minute: e.time || '', sec, global_minute: minute, period, overtime: period > periods, is_home: side === 'home' };
      if (e.event_type === 'goal') {
        if (e.goal_type === 'penalty_shots') return; // shootout, not part of the game timeline
        const own = e.goal_type === 'owngoal', ps = e.goal_type === 'penalty_shot';
        if (who && !own && e.goal_type !== 'not_assigned' && e.goal_type !== 'technical') {
          who.goals++; if (ps) { who.seven_meter_goals++; who.seven_meter_attempts++; }
        }
        const helper = e.assist != null ? byNumber[side][String(e.assist)] : null;
        if (helper && !own) helper.assists++;
        // Power play: strength before the goal
        const t = sec == null ? -1 : sec;
        ['home', 'guest'].forEach(s => { active[s] = active[s].filter(p => p.end > t); });
        const mine = active[side].length, theirs = active[other].length;
        const pp = theirs > mine ? 'ueberzahl' : mine > theirs ? 'unterzahl' : '';
        if (pp === 'ueberzahl') { // a power-play goal ends the oldest running minor of the other team
          const minor = active[other].filter(p => p.minor).sort((a, b) => a.end - b.end)[0];
          if (minor) { if (minor.double && minor.end - t > 120) minor.end -= 120; else minor.end = t; }
        }
        if (period <= periods) reg[side]++;
        out.push(Object.assign(base, {
          event_type: { id: ps ? 39 : 15, name: ps ? 'Strafschuss Tor' : own ? 'Eigentor' : 'Tor', is_goal: true },
          player: who && !own ? { id: who.player.id, first_name: who.player.first_name, last_name: who.player.last_name } : null,
          assist: helper && !own ? { id: helper.player.id, first_name: helper.player.first_name, last_name: helper.player.last_name } : null,
          score: { local: Number(e.home_goals), visitor: Number(e.guest_goals) }, staerke: pp,
        }));
      } else if (e.event_type === 'penalty') {
        const k = PEN[e.penalty_type] || [1, 2, 120, 'Zeitstrafe 2'];
        if (who) { who.two_minutes += k[0]; who.pim += k[1]; if (k[1] >= 20) who.sanctions.disqualification = true; }
        if (k[2] && sec != null) active[side].push({ end: sec + k[2], minor: k[2] <= 240 && k[1] < 5, double: k[2] === 240 });
        out.push(Object.assign(base, {
          event_type: { id: k[1] >= 20 ? 8 : k[0] ? 13 : 14, name: k[3], is_goal: false, is_sanction: true },
          anzahl: k[0], minuten: k[1], player: null,
        }));
      } else if (e.event_type === 'timeout') {
        out.push(Object.assign(base, { event_type: { id: 30, name: 'Auszeit', is_goal: false }, player: null }));
      }
    });
    const res = r.result || {};
    regulation[gid] = { h: reg.home, a: reg.guest, fromEvents: out.some(x => x.event_type.is_goal) };
    details[gid] = {
      l: { data: { local: { players: lineup.home }, visitor: { players: lineup.guest } } },
      e: { data: out },
      perioden: { heim: (res.home_goals_period || []).slice(0, periods), gast: (res.guest_goals_period || []).slice(0, periods) },
      maxKader: r.max_lineup_players || null,
    };
  });

  // ---------- matches ----------
  const matches = schedule.filter(g => g.home_team_id && g.guest_team_id).map(g => {
    const res = parseResult(g);
    const finished = !!g.ended || (res.forfait && res.h != null);
    const scored = finished && !res.forfait && res.h != null && res.a != null;
    // Regulation score for the model: from the events, or for overtime games the tied score before it.
    let regH = res.h, regA = res.a;
    const rg = regulation[g.game_id];
    if (scored && res.overtime) {
      if (rg && rg.fromEvents && rg.h === rg.a) { regH = rg.h; regA = rg.a; } else { regH = regA = Math.min(res.h, res.a); }
    }
    const time = /^\d\d?:\d\d/.test(g.time || '') ? g.time.slice(0, 5).padStart(5, '0') : null;
    const day = g.date || '2099-12-31';
    return {
      id: g.game_id, round: g.game_day || 0, date: `${day}T${time || '00:00'}:00+00:00`,
      status: { is_finished: finished },
      local: { id: g.home_team_id, name: g.home_team_name, club: { logo: g.home_team_logo || null } },
      visitor: { id: g.guest_team_id, name: g.guest_team_name, club: { logo: g.guest_team_logo || null } },
      result: scored ? { local: res.h, visitor: res.a } : {},
      regular: scored ? { local: regH, visitor: regA } : null,
      extra: scored && res.overtime ? (/PS/.test(res.extra) ? 'n. PS' : 'n. V.') : '',
      field: { installation: { name: g.arena_name || '', address: g.arena_address || '' } },
      phase: { name: (src.meta && src.meta.name) || 'Verbandsliga Herren Kleinfeld' },
    };
  });

  const maxRound = Math.max(0, ...matches.filter(m => m.status.is_finished).map(m => m.round));
  const standings = table.map(z => ({
    team: { id: z.team_id }, round: maxRound, position: z.position, played: z.games || 0,
    won: (z.won || 0) + (z.won_ot || 0), drawn: z.draw || 0, lost: (z.lost || 0) + (z.lost_ot || 0),
    won_ot: z.won_ot || 0, lost_ot: z.lost_ot || 0,
    goals_for: z.goals_scored || 0, goals_against: z.goals_received || 0, points: z.points || 0,
  }));

  window.HB_DATA = {
    teamId: own ? own.id : null, teamName: own ? own.name : (src.teamName || ''), fetchedAt: src.fetchedAt, demo: !!src.demo,
    leagueId: src.leagueId, leagueName: (src.meta && src.meta.name) || 'Verbandsliga Herren Kleinfeld',
    pages: [{ data: matches }], standings: { data: standings }, scorer: src.scorer || [],
  };
  window.HB_DETAILS = details;
})();
