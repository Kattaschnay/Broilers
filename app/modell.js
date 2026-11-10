// Prognosemodell: Angriffs- und Abwehrstärke je Team plus Heimvorteil,
// geschätzt per Ridge-Regression auf die bisherigen Ergebnisse der Liga (reguläre Spielzeit, ohne Verlängerung).
// Ergebnis eines Spiels: Tordifferenz ~ Normalverteilung um die erwartete Differenz.
// Floorball Kleinfeld: wenige Tore je Spiel, Spieltage oft in einer Halle mit mehreren Spielen, daher kleiner Heimvorteil.

const MODELL = {
  LAMBDA: 3,        // Schrumpfung der Teamstärken (entspricht ca. 3 Spielen "Durchschnitt")
  HEIM0: 0.3,       // Vorannahme Heimvorteil in Toren (Kleinfeld: oft Spieltage in neutraler Halle)
  LAMBDA_HEIM: 12,  // Gewicht der Vorannahme Heimvorteil
  SIGMA0: 3.6,      // Vorannahme Streuung der Tordifferenz
  GEWICHT_SIGMA: 10,
  TORE0: 6,         // Vorannahme Tore je Team und Spiel
};

function normCdf(x) {
  // Abramowitz/Stegun 7.1.26
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

// Tore in regulärer Spielzeit (bei Spielen mit Verlängerung der Stand davor), sonst Endstand
const regH = g => g.regHeim != null ? g.regHeim : g.toreHeim;
const regG = g => g.regGast != null ? g.regGast : g.toreGast;
// Punkteregel der Liga (aus der offiziellen Tabelle erkannt, app/adapter.js): Sieg, Remis, Niederlage, nach Verlängerung
const PUNKTE = (window.SPORT && window.SPORT.points) || { S: 2, U: 1, N: 0, SV: 2, NV: 1 };
const REMIS_MOEGLICH = !window.SPORT || window.SPORT.draws !== false;

// spiele: [{heim, gast, toreHeim, toreGast}] nur gewertete Spiele mit Ergebnis
function schaetzeModell(spiele, teamIds) {
  const att = {}, def = {};
  teamIds.forEach(id => { att[id] = 0; def[id] = 0; });
  const n = spiele.length;
  let mu = n ? spiele.reduce((s, g) => s + regH(g) + regG(g), 0) / (2 * n) : MODELL.TORE0;
  let heim = MODELL.HEIM0;

  // Beobachtungen: jedes Spiel liefert zwei (Tore Heim, Tore Gast)
  const obs = [];
  spiele.forEach(g => {
    obs.push({ off: g.heim, def: g.gast, heim: 1, tore: regH(g) });
    obs.push({ off: g.gast, def: g.heim, heim: 0, tore: regG(g) });
  });

  for (let it = 0; it < 300 && n; it++) {
    let s = 0;
    obs.forEach(o => { s += o.tore - heim * o.heim - att[o.off] + def[o.def]; });
    mu = s / obs.length;

    let sh = MODELL.LAMBDA_HEIM * MODELL.HEIM0, nh = MODELL.LAMBDA_HEIM;
    obs.forEach(o => { if (o.heim) { sh += o.tore - mu - att[o.off] + def[o.def]; nh++; } });
    heim = sh / nh;

    const sa = {}, na = {}, sd = {}, nd = {};
    teamIds.forEach(id => { sa[id] = 0; na[id] = 0; sd[id] = 0; nd[id] = 0; });
    obs.forEach(o => {
      sa[o.off] += o.tore - mu - heim * o.heim + def[o.def]; na[o.off]++;
    });
    teamIds.forEach(id => { att[id] = sa[id] / (na[id] + MODELL.LAMBDA); });
    obs.forEach(o => {
      sd[o.def] += mu + heim * o.heim + att[o.off] - o.tore; nd[o.def]++;
    });
    teamIds.forEach(id => { def[id] = sd[id] / (nd[id] + MODELL.LAMBDA); });
  }

  let rss = 0;
  spiele.forEach(g => {
    const e = (heim + att[g.heim] - def[g.gast]) - (att[g.gast] - def[g.heim]);
    rss += Math.pow(regH(g) - regG(g) - e, 2);
  });
  const sigma = Math.sqrt((MODELL.GEWICHT_SIGMA * MODELL.SIGMA0 ** 2 + rss) / (MODELL.GEWICHT_SIGMA + n));

  return { mu, heim, att, def, sigma, n };
}

function prognose(m, heimId, gastId) {
  const a = id => m.att[id] || 0, d = id => m.def[id] || 0;
  const eHeim = m.mu + m.heim + a(heimId) - d(gastId);
  const eGast = m.mu + a(gastId) - d(heimId);
  const diff = eHeim - eGast;
  const pGast = normCdf((-0.5 - diff) / m.sigma);
  const pHeim = 1 - normCdf((0.5 - diff) / m.sigma);
  return { pHeim, pRemis: 1 - pHeim - pGast, pGast, eHeim, eGast, diff };
}

function staerke(m, id) { return (m.att[id] || 0) + (m.def[id] || 0); }

// Zufallszahl mit Seed, damit die Simulation bei gleichem Datenstand gleich bleibt
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Punkte nach der Regel der Liga. g.verl: Spiel nach Verlängerung oder Penaltyschießen entschieden.
// mpkt: Punkte, die das Team hätte holen können und nicht geholt hat (Sortierung bei Gleichstand wie im Original).
function tabelleAus(spiele, teamIds) {
  const t = {}, P = PUNKTE;
  teamIds.forEach(id => t[id] = { id, sp: 0, s: 0, u: 0, n: 0, sv: 0, nv: 0, tp: 0, tm: 0, pkt: 0, mpkt: 0 });
  spiele.forEach(g => {
    const h = t[g.heim], a = t[g.gast];
    h.sp++; a.sp++; h.tp += g.toreHeim; h.tm += g.toreGast; a.tp += g.toreGast; a.tm += g.toreHeim;
    const wer = g.toreHeim > g.toreGast ? [h, a] : g.toreHeim < g.toreGast ? [a, h] : null;
    if (wer && g.verl) { wer[0].s++; wer[0].sv++; wer[1].n++; wer[1].nv++; wer[0].pkt += P.SV; wer[1].pkt += P.NV; wer[0].mpkt += P.S - P.SV; wer[1].mpkt += P.S - P.NV; }
    else if (wer) { wer[0].s++; wer[1].n++; wer[0].pkt += P.S; wer[1].pkt += P.N; wer[1].mpkt += P.S - P.N; }
    else { h.u++; a.u++; h.pkt += P.U; a.pkt += P.U; h.mpkt += P.S - P.U; a.mpkt += P.S - P.U; }
  });
  return Object.values(t).sort((x, y) => y.pkt - x.pkt || (y.tp - y.tm) - (x.tp - x.tm) || y.tp - x.tp);
}

// fest: {matchId: 'H'|'U'|'G'} vom Nutzer gesetzte Ausgänge, bonus: {teamId: Punkte} z. B. aus Urteilen
function simuliereSaison(m, gespielt, offen, teamIds, laeufe = 5000, fest = {}, bonus = {}) {
  const r = rng(gespielt.length * 7919 + offen.length * 104729 + 17);
  const plaetze = {}, punkte = {};
  teamIds.forEach(id => { plaetze[id] = new Array(teamIds.length).fill(0); punkte[id] = 0; });
  const progs = offen.map(g => ({ g, p: prognose(m, g.heim, g.gast), f: fest[g.id] }));
  const sd = m.sigma / Math.SQRT2;
  for (let l = 0; l < laeufe; l++) {
    const sim = gespielt.slice();
    progs.forEach(({ g, p, f }) => {
      let h = Math.max(0, Math.round(p.eHeim + gauss(r) * sd));
      let a = Math.max(0, Math.round(p.eGast + gauss(r) * sd));
      const extra = Math.floor(r() * 3); // immer ziehen, damit Festlegungen die übrigen Spiele nicht verschieben
      if (f === 'H' && h <= a) h = a + 1 + extra;
      if (f === 'G' && a <= h) a = h + 1 + extra;
      if (f === 'U') a = h;
      // Ohne Remis: Gleichstand geht in die Verlängerung, dort entscheidet der Zufall mit leichtem Vorteil des Stärkeren
      if (!REMIS_MOEGLICH && h === a) { const heimSiegt = r() < 0.5 + Math.max(-0.2, Math.min(0.2, p.diff / 10)); sim.push({ heim: g.heim, gast: g.gast, toreHeim: heimSiegt ? h + 1 : h, toreGast: heimSiegt ? a : a + 1, verl: true }); return; }
      sim.push({ heim: g.heim, gast: g.gast, toreHeim: h, toreGast: a });
    });
    const tab = tabelleAus(sim, teamIds);
    tab.forEach(z => z.pkt += bonus[z.id] || 0);
    tab.sort((x, y) => y.pkt - x.pkt || (y.tp - y.tm) - (x.tp - x.tm) || y.tp - x.tp);
    tab.forEach((z, i) => { plaetze[z.id][i]++; punkte[z.id] += z.pkt; });
  }
  teamIds.forEach(id => { plaetze[id] = plaetze[id].map(x => x / laeufe); punkte[id] /= laeufe; });
  return { plaetze, punkte };
}
