// Auswertung der Spielberichte: Spieler, Einfluss auf die Tordifferenz, Spielverläufe.
// Floorball: Tore, Assists (Scorerpunkte), Strafen; Torhüter sind im Spielbericht gekennzeichnet.
const SP_DAUER = (window.SPORT && window.SPORT.total) || 40, SP_PERIODEN = (window.SPORT && window.SPORT.periods) || 2;

const SPIELERIN = {
  ERSATZ: 0.5,       // Anteil ihrer Tore, den die Mitspieler bei einem Ausfall auffangen
  SCHRUMPF_TORE: 2,  // Tore je Spiel werden um so viele Spiele Richtung Ziel gezogen
  SCHRUMPF_ZIEL: 0.5, // Ziel ist der halbe Teamschnitt: selten eingesetzte Spieler treffen im Schnitt weniger
  TIEFE_MAX: 0.6,     // mehr als die übliche Besetzung bringt höchstens so viele Tore (Kleinfeld: nur 3 + 1 auf dem Feld)
  SCHRUMPF_ONOFF: 6, // ab wie vielen Vergleichsspielen der Mit/Ohne-Vergleich halbes Gewicht bekommt
  MIN_VERGLEICH: 2,  // so viele Spiele mit UND ohne sie braucht es, bevor der Vergleich zählt
  MAX_ONOFF: 3,      // Mit/Ohne-Differenz wird auf diese Tore begrenzt
  MIN: -1.5, MAX: 4,
};

// details: window.HB_DETAILS, spiele: aufbereitete Spiele, modell: aktuelles Teammodell,
// torhueterinnen: {pid: true} aus der eigenen Erfassung (app/goalkeepers.js). Torhüter bekommen keine
// Torwirkung aus Toren und Mit/Ohne-Vergleich; die kommt, wenn überhaupt, aus der Paradenquote (app.js).
function werteSpielberichteAus(details, spiele, modell, torhueterinnen = {}) {
  const teams = {};       // teamId -> { spiele: [matchId], spielerinnen: {pid: {...}} }
  const verlaeufe = {};   // matchId -> { tore: [{min, heim, gast, team, name}], halbzeit: {heim, gast} }
  const nachId = {};
  spiele.forEach(g => nachId[g.id] = g);

  Object.keys(details || {}).forEach(mid => {
    const g = nachId[mid];
    const d = details[mid];
    if (!g || !g.gewertet || !d || !d.l || !d.l.data) return;
    [['local', g.heim], ['visitor', g.gast]].forEach(([seite, tid]) => {
      const block = d.l.data[seite];
      if (!block || !block.players || !block.players.length) return;
      const t = teams[tid] || (teams[tid] = { spiele: [], spielerinnen: {} });
      t.spiele.push(g.id);
      block.players.forEach(p => {
        if (p.is_staff) return;
        const pid = p.player.id;
        const s = t.spielerinnen[pid] || (t.spielerinnen[pid] = {
          id: pid, team: tid, name: `${p.player.first_name} ${p.player.last_name}`.trim(),
          nummern: {}, spiele: [], tore: 0, assists: 0, pim: 0, sm: 0, smVers: 0, zwei: 0, disq: 0, torwart: false, kapitaen: 0,
        });
        s.spiele.push(g.id);
        s.nummern[p.number] = (s.nummern[p.number] || 0) + 1;
        s.tore += p.goals || 0;
        s.assists += p.assists || 0;
        s.pim += p.pim || 0;
        if (p.is_captain) s.kapitaen++;
        s.sm += p.seven_meter_goals || 0;
        s.smVers += p.seven_meter_attempts || 0;
        s.zwei += p.two_minutes || 0;
        if (p.sanctions && p.sanctions.disqualification) s.disq++;
        if (p.is_goalkeeper || torhueterinnen[pid]) s.torwart = true;
      });
    });

    if (d.e && d.e.data) {
      // Zeitachse in Minuten der regulären Spielzeit; Tore der Verlängerung hängen hinten an (verl).
      // hz: erste oder zweite Spielhälfte (auch bei Dritteln), per: Abschnitt laut Spielbericht.
      const tore = d.e.data.filter(e => e.event_type && e.event_type.is_goal && e.score)
        .map(e => ({
          min: e.global_minute != null ? e.global_minute : 0,
          heim: e.score.local, gast: e.score.visitor,
          team: e.is_home ? g.heim : g.gast,
          name: e.player ? `${e.player.first_name} ${e.player.last_name}`.trim() : '',
          sm: /Strafschuss/.test(e.event_type.name),
          per: e.period || 1, verl: !!e.overtime, staerke: e.staerke || '',
          hz: (e.global_minute || 0) <= SP_DAUER / 2 ? 1 : 2,
        }))
        .sort((a, b) => (a.heim + a.gast) - (b.heim + b.gast));
      const regulaer = tore.filter(t => !t.verl);
      const hz1 = regulaer.filter(t => t.hz === 1).pop();
      // Stand nach jedem Abschnitt (Halbzeit oder Drittel)
      const perioden = [];
      for (let p = 1; p <= SP_PERIODEN; p++) { const x = regulaer.filter(t => t.per <= p).pop(); perioden.push(x ? { heim: x.heim, gast: x.gast } : { heim: 0, gast: 0 }); }
      const ende = regulaer[regulaer.length - 1];
      verlaeufe[g.id] = { tore: regulaer, verlaengerung: tore.filter(t => t.verl), perioden, regulaer: ende ? { heim: ende.heim, gast: ende.gast } : { heim: 0, gast: 0 },
        halbzeit: hz1 ? { heim: hz1.heim, gast: hz1.gast } : { heim: 0, gast: 0 } };
    }
  });

  // Residuum je Spiel und Team: echte Tordifferenz minus erwartete (aus Sicht des Teams)
  const residuum = (g, tid) => {
    const p = prognose(modell, g.heim, g.gast);
    const echt = g.toreHeim - g.toreGast;
    return tid === g.heim ? echt - p.diff : -(echt - p.diff);
  };

  Object.keys(teams).forEach(tid => {
    tid = Number(tid);
    const t = teams[tid];
    const n = t.spiele.length;
    const liste = Object.values(t.spielerinnen);
    const einsaetze = liste.reduce((s, x) => s + x.spiele.length, 0);
    const teamTore = liste.reduce((s, x) => s + x.tore, 0);
    const schnitt = einsaetze ? teamTore / einsaetze : 0;
    const res = {};
    t.spiele.forEach(mid => res[mid] = residuum(nachId[mid], tid));
    t.teamTore = teamTore;

    liste.forEach(s => {
      s.nummer = Number(Object.entries(s.nummern).sort((a, b) => b[1] - a[1])[0][0]);
      s.anz = s.spiele.length;
      s.verfuegbar = n ? s.anz / n : 0;
      s.toreProSpiel = s.anz ? s.tore / s.anz : 0;
      s.punkte = s.tore + s.assists;
      s.punkteProSpiel = s.anz ? s.punkte / s.anz : 0;
      s.assistsProSpiel = s.anz ? s.assists / s.anz : 0;
      s.anteil = teamTore ? s.tore / teamTore : 0;
      const tps = (s.tore + SPIELERIN.SCHRUMPF_TORE * SPIELERIN.SCHRUMPF_ZIEL * schnitt) / (s.anz + SPIELERIN.SCHRUMPF_TORE);
      s.torbeitrag = tps * (1 - SPIELERIN.ERSATZ);
      const mit = t.spiele.filter(m => s.spiele.includes(m)), ohne = t.spiele.filter(m => !s.spiele.includes(m));
      s.mitOhne = null; s.gewichtMitOhne = 0;
      if (mit.length && ohne.length) {
        const mean = a => a.reduce((x, m) => x + res[m], 0) / a.length;
        s.mitOhne = Math.max(-SPIELERIN.MAX_ONOFF, Math.min(SPIELERIN.MAX_ONOFF, mean(mit) - mean(ohne)));
        const k = Math.min(mit.length, ohne.length);
        s.gewichtMitOhne = k >= SPIELERIN.MIN_VERGLEICH ? k / (k + SPIELERIN.SCHRUMPF_ONOFF) : 0;
      }
      const roh = !s.gewichtMitOhne ? s.torbeitrag : (1 - s.gewichtMitOhne) * s.torbeitrag + s.gewichtMitOhne * s.mitOhne;
      s.einfluss = Math.max(SPIELERIN.MIN, Math.min(SPIELERIN.MAX, roh));
      // Torhüter: keine Tore, aber der Mit/Ohne-Vergleich zeigt, ob das Team mit ihm im Tor besser abschneidet (halbes Gewicht)
      if (s.torwart) { s.torbeitrag = 0; s.einfluss = s.gewichtMitOhne ? Math.max(SPIELERIN.MIN, Math.min(SPIELERIN.MAX, 0.5 * s.gewichtMitOhne * s.mitOhne)) : 0; }
      s.ohneMit = ohne.length;
    });

    // Abhängigkeit: wie stark konzentrieren sich die Tore auf wenige Spieler
    const anteile = liste.map(s => s.anteil).sort((a, b) => b - a);
    t.top1 = anteile[0] || 0;
    t.top3 = anteile.slice(0, 3).reduce((a, b) => a + b, 0);
    t.konzentration = anteile.reduce((a, b) => a + b * b, 0); // Herfindahl-Index
    t.effektiv = t.konzentration ? 1 / t.konzentration : 0;   // "effektive Zahl" Torschützen
    t.liste = liste.sort((a, b) => b.einfluss - a.einfluss || b.tore - a.tore);
  });

  return { teams, verlaeufe };
}

// Übliche Besetzung: wer in mindestens der Hälfte der Spiele dabei war.
function ueblichDabei(s) { return s.verfuegbar >= 0.5; }

// Verschiebung der erwarteten Tore eines Teams, wenn die Besetzung von der üblichen abweicht.
// Die Teamstärke enthält schon, wie oft ein Spieler sonst fehlt. Fehlt ein Stammspieler,
// zählt ihr Einfluss deshalb mit ihrer Einsatzquote, spielt eine Seltener, mit ihrer Fehlquote.
// dabei: {pid: true/false}, eigene: {pid: Einfluss-Überschreibung}
function besetzungsEffekt(teamInfo, dabei, eigene) {
  if (!teamInfo) return 0;
  let verlust = 0, gewinn = 0;
  teamInfo.liste.forEach(s => {
    const wert = eigene && eigene[s.id] != null ? eigene[s.id] : s.einfluss;
    const ist = dabei[s.id] ? 1 : 0, ueblich = ueblichDabei(s) ? 1 : 0;
    if (ist === ueblich) return;
    if (ueblich) verlust += wert * s.verfuegbar;          // Stammspieler fehlt
    else if (belegt(s, eigene)) gewinn += wert * (1 - s.verfuegbar); // Seltener ist dabei
  });
  // Zusätzliche Spieler ersetzen zuerst fehlende, darüber hinaus zählt nur begrenzte Kadertiefe
  return -verlust + Math.min(gewinn, verlust + SPIELERIN.TIEFE_MAX);
}

// Belegschranke: Wer selten dabei war und nie getroffen oder vorbereitet hat, bekommt keinen Mehrwert zugeschrieben,
// außer der Trainer setzt eine eigene Einschätzung.
function belegt(s, eigene) {
  return ueblichDabei(s) || s.tore > 0 || s.assists > 0 || (eigene && eigene[s.id] != null) || !!(s.tw && s.tw.reliable);
}

function prognoseMitBesetzung(m, heimId, gastId, effHeim, effGast) {
  const basis = prognose(m, heimId, gastId);
  const eHeim = basis.eHeim + effHeim, eGast = basis.eGast + effGast;
  const diff = eHeim - eGast;
  const pGast = normCdf((-0.5 - diff) / m.sigma);
  const pHeim = 1 - normCdf((0.5 - diff) / m.sigma);
  return { pHeim, pRemis: 1 - pHeim - pGast, pGast, eHeim, eGast, diff };
}

// Teamprofile aus den Spielverläufen: Halbzeiten, Schlussphase, Aufholjagden
function teamMuster(spiele, verlaeufe, teamIds) {
  const r = {};
  teamIds.forEach(id => r[id] = { n: 0, hz1: 0, hz2: 0, schluss: 0, gedreht: 0, verspielt: 0, rueckstandPause: 0, fuehrungPause: 0, groessteFuehrung: 0, knapp: 0, knappGewonnen: 0, zwei: 0, sm: 0, smVers: 0 });
  spiele.filter(g => g.gewertet).forEach(g => {
    const v = verlaeufe[g.id];
    [[g.heim, 1], [g.gast, -1]].forEach(([tid, vz]) => {
      const x = r[tid];
      const end = vz * (g.toreHeim - g.toreGast);
      if (Math.abs(end) <= 2) { x.knapp++; if (end > 0) x.knappGewonnen++; }
      if (!v) return;
      x.n++;
      const hz = vz * (v.halbzeit.heim - v.halbzeit.gast);
      const endR = vz * (v.regulaer.heim - v.regulaer.gast); // ohne Verlängerung
      x.hz1 += hz; x.hz2 += endR - hz;
      const vorSchluss = v.tore.filter(t => t.min < SP_DAUER * 5 / 6).pop();
      const standVor = vorSchluss ? vz * (vorSchluss.heim - vorSchluss.gast) : 0;
      x.schluss += endR - standVor;
      if (hz < 0) { x.rueckstandPause++; if (end > 0) x.gedreht++; }
      if (hz > 0) { x.fuehrungPause++; if (end < 0) x.verspielt++; }
      v.tore.forEach(t => { x.groessteFuehrung = Math.max(x.groessteFuehrung, vz * (t.heim - t.gast)); });
    });
  });
  return r;
}
