(function () {
  'use strict';
  const APP = 'Bully';
  const ABSENDER = 'Bully ist ein privates Fan-Projekt, kein Angebot der Berlin Broilers 04 e. V., von Floorball Deutschland oder saisonmanager.de. Daten: saisonmanager.de.';
  // Floorball-Struktur der Liga aus app/adapter.js: Halbzeiten oder Drittel, Spieldauer, Punkteregel
  const SPORT = window.SPORT || { periods: 2, periodMin: 20, total: 40, slotMin: 40 / 6, slotLabel: i => String(Math.round(i * 40 / 6)), draws: true, drawLabel: 'Remis', periodName: 'Halbzeit', periodNames: ['1. Halbzeit', '2. Halbzeit'] };
  const DAUER = SPORT.total, REMIS = SPORT.drawLabel;
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const merk = {
    get(k, d) { try { const v = localStorage.getItem('fbprog.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fbprog.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  // Früher eine eigene Trainerinnen-Ansicht (#trainerin). Jetzt für alle sichtbar und nicht mehr eigens gekennzeichnet;
  // die Konstante bleibt, damit die Bedingungen im Code lesbar bleiben.
  const TRAINERIN = true;

  // ================= Zahlensatz =================
  const NB = ' ', MINUS = '−';
  const dez = (x, n = 1) => x.toFixed(n).replace('.', ',').replace('-', MINUS);
  const vz = (x, n = 1) => { const r = Number(x.toFixed(n)); return (r > 0 ? '+' : r < 0 ? MINUS : '±') + Math.abs(r).toFixed(n).replace('.', ','); };
  const vzGanz = x => { const r = Math.round(x); return (r > 0 ? '+' : r < 0 ? MINUS : '±') + Math.abs(r); };
  const pct = x => Math.round(x * 100) + NB + '%';
  function drei(a, b, c) {
    const roh = [a, b, c].map(x => x * 100), ganz = roh.map(Math.floor);
    let rest = 100 - ganz.reduce((x, y) => x + y, 0);
    roh.map((x, i) => [x - ganz[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (rest > 0) { ganz[i]++; rest--; } });
    return ganz;
  }
  const stand = (a, b) => `${a}${NB}:${NB}${b}`;

  const D = window.HB_DATA;
  if (!D || !D.pages || !D.pages.length) {
    $('#inhalt').innerHTML = `<div class="leer" style="padding-top:20vh">${ico('tafel')}<b>Noch keine Daten</b><p>Öffne ${APP} über „Start (Mac)“ oder „Start (Windows)“. Beim ersten Start braucht es Internet und einen API-Schlüssel für saisonmanager.de.</p></div>`;
    return;
  }

  // ================= Daten =================
  const roh = D.pages.flatMap(p => p.data || []);
  const teams = {};
  const spiele = roh.map(m => {
    [m.local, m.visitor].forEach(t => { if (t && !teams[t.id]) teams[t.id] = { id: t.id, roh: t.name, logo: t.club && t.club.logo }; });
    const r = m.result || {};
    const hat = typeof r.local === 'number' && typeof r.visitor === 'number';
    const inst = m.field && m.field.installation;
    return {
      id: m.id, runde: m.round, datum: new Date(m.date), terminOffen: /T00:00:00/.test(m.date),
      heim: m.local.id, gast: m.visitor.id,
      toreHeim: hat ? r.local : null, toreGast: hat ? r.visitor : null,
      // reguläre Spielzeit fürs Modell; zusatz „n. V.“ oder „n. PS“, wenn erst Verlängerung oder Penaltyschießen entschied
      regHeim: hat && m.regular ? m.regular.local : null, regGast: hat && m.regular ? m.regular.visitor : null, zusatz: m.extra || '', verl: !!m.extra,
      gewertet: m.status.is_finished && hat, urteil: m.status.is_finished && !hat, offen: !m.status.is_finished,
      halle: inst ? String(inst.name || '').replace(/^\d+\s*[-–]\s*/, '') : (m.field && m.field.name) || '',
      adresse: inst && inst.address ? inst.address : '',
      lat: inst && inst.latitude, lon: inst && inst.longitude,
    };
  }).filter(g => g.heim && g.gast).sort((a, b) => a.datum - b.datum || a.runde - b.runde);
  const spielNach = {}; spiele.forEach(g => spielNach[g.id] = g);
  const teamIds = Object.keys(teams).map(Number);
  const gewertet = spiele.filter(g => g.gewertet);
  const offen = spiele.filter(g => g.offen);
  const urteile = spiele.filter(g => g.urteil);
  const ligaName = D.leagueName || 'Verbandsliga Herren Kleinfeld';
  const DETAILS = window.HB_DETAILS || {};

  // Namen aus saisonmanager.de sind schon richtig geschrieben; nur komplett großgeschriebene Namen werden angepasst
  function normalisiere(s) {
    if (String(s) !== String(s).toUpperCase()) return String(s).replace(/\s+[–—]\s+/g, ' · ');
    return String(s).replace(/\s+[–—-]\s+/g, ' · ').split(' ').map(w => {
      if (/^(SC|TSV|TV|FC|BFC|UHC|FBC|SG|SV|ESV|TSC|TUS|VFL|MTV|TSG|II|III|IV|V|VI|KF|GF)$/.test(w)) return w === 'TUS' ? 'TuS' : w === 'VFL' ? 'VfL' : w;
      if (w.length > 1 && w === w.toUpperCase() && /[A-ZÄÖÜ]{2,}/.test(w)) return w.split('-').map(t => t.charAt(0) + t.slice(1).toLowerCase()).join('-');
      return w;
    }).join(' ');
  }
  // Adresse wie „NEUMOORSTüCK 1, 21147 HAMBURG“ in Titelschreibung
  const adresseSchoen = a => String(a).toLowerCase().replace(/(^|[\s,/-])([a-zäöüß])/g, (m, p, c) => p + c.toUpperCase()).replace(/(\d)([A-Z])/g, '$1$2');
  teamIds.forEach(id => {
    const t = teams[id];
    t.lang = normalisiere(t.roh);
    t.kurz = t.lang.replace(/^(SC|TSV|TV|FC|BFC|UHC|FBC|SG|SV|ESV|TSC|TuS|VfL|MTV|TSG)\s+/, '').replace(/^(Floorball|Unihockey)\s+(?=\S+\s+\S)/, '');
    t.mono = t.kurz.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2).toUpperCase();
  });
  const kurz = id => teams[id] ? teams[id].kurz : '?';
  const lang = id => teams[id] ? teams[id].lang : '?';
  window.kurzname = kurz;
  const UNSER = D.teamId;
  // Teamlogos lokal (daten/logos, für das Canvas der Social-Bilder); fürs eigene Team notfalls das Vereinswappen
  const LOGOS = window.HB_LOGOS || {};
  const logoLokal = id => LOGOS[id] ? `../daten/logos/${id}.jpg?u=${encodeURIComponent(LOGOS[id])}` : Number(id) === Number(UNSER) ? '../daten/logos/eigen.jpg' : null;
  const logoQuelle = id => { const t = teams[id], l = logoLokal(id); if (l) return l; if (!t || !t.logo) return null; return /^https?:/.test(t.logo) ? t.logo : 'https://saisonmanager.de' + t.logo; };

  // ================= Modelle =================
  const modell = schaetzeModell(gewertet, teamIds);
  const vorher = {}, cache = {};
  gewertet.forEach(g => {
    const tag = g.datum.toISOString().slice(0, 10);
    if (!cache[tag]) cache[tag] = schaetzeModell(gewertet.filter(x => x.datum.toISOString().slice(0, 10) < tag), teamIds);
    vorher[g.id] = prognose(cache[tag], g.heim, g.gast);
  });
  const B = werteSpielberichteAus(DETAILS, spiele, modell);
  const muster = teamMuster(spiele, B.verlaeufe, teamIds);
  const K = teamKennzahlen(DETAILS, spiele, B.verlaeufe, teamIds);
  const LIGA = ligaKennzahlen(K);
  const alleSp = Object.values(B.teams).flatMap(t => t.liste);
  const spNach = {}; alleSp.forEach(s => spNach[s.id] = s);
  // Torhüter sind im Floorball-Spielbericht gekennzeichnet (spieler.js); Paraden liefert saisonmanager.de öffentlich nicht.
  Object.values(B.teams).forEach(t => t.liste.sort((a, b) => b.einfluss - a.einfluss || b.punkte - a.punkte));

  const eigeneTab = tabelleAus(gewertet, teamIds);
  const stRoh = (D.standings && D.standings.data) || [];
  const maxRunde = Math.max(0, ...gewertet.map(g => g.runde));
  const offiziell = {};
  stRoh.forEach(z => { const id = z.team.id; if (!offiziell[id] || z.round > offiziell[id].round) offiziell[id] = z; });
  // Offizielle Tabelle nur, wenn sie alle beendeten Spiele enthält. saisonmanager.de kann hinterherhängen
  // nach; dann rechnet die App selbst und übernimmt aus der offiziellen nur die Punkte aus Urteilen.
  const offAlle = Object.keys(offiziell).length === teamIds.length;
  const offAktuell = offAlle && Object.values(offiziell).reduce((a, z) => a + z.played, 0) >= 2 * (gewertet.length + urteile.length);
  const bonus = {};
  const P = PUNKTE;
  // Punkte eines Spiels aus Sicht von id nach der Regel der Liga
  const punkteAus = (g, id) => { const eig = g.heim === id ? g.toreHeim - g.toreGast : g.toreGast - g.toreHeim; return eig > 0 ? (g.verl ? P.SV : P.S) : eig === 0 ? P.U : (g.verl ? P.NV : P.N); };
  let tabelle;
  if (offAktuell) {
    tabelle = Object.values(offiziell).sort((a, b) => a.position - b.position).map(z => ({ id: z.team.id, sp: z.played, s: z.won, u: z.drawn, n: z.lost, sv: z.won_ot || 0, nv: z.lost_ot || 0, tp: z.goals_for, tm: z.goals_against, pkt: z.points }));
    tabelle.forEach(z => { const e = eigeneTab.find(x => x.id === z.id); bonus[z.id] = Math.max(0, z.pkt - e.pkt); });
  } else {
    const urteilVon = id => urteile.filter(g => g.heim === id || g.gast === id).length;
    tabelle = eigeneTab.map(z => {
      const r = { id: z.id, sp: z.sp, s: z.s, u: z.u, n: z.n, sv: z.sv, nv: z.nv, tp: z.tp, tm: z.tm, pkt: z.pkt, mpkt: z.mpkt }, nu = urteilVon(z.id);
      if (!nu) return r;
      // Punkte aus kampflos gewerteten Spielen: offizielle Punkte minus eigene Punkte aus genauso vielen gewerteten Spielen wie offiziell gezählt
      const o = offiziell[z.id], frueh = gewertet.filter(g => g.heim === z.id || g.gast === z.id).slice(0, o ? Math.max(0, o.played - nu) : 0);
      const pFrueh = frueh.reduce((a, g) => a + punkteAus(g, z.id), 0);
      const b = o ? Math.max(0, Math.min(P.S * nu, o.points - pFrueh)) : 0;
      const siege = Math.floor(b / P.S);
      bonus[z.id] = b; r.pkt += b; r.sp += nu; r.s += siege; r.n += nu - siege; r.mpkt += P.S * nu - b;
      return r;
    }).sort((x, y) => y.pkt - x.pkt || (y.tp - y.tm) - (x.tp - x.tm) || y.tp - x.tp);
  }
  const platz = id => tabelle.findIndex(z => z.id === id) + 1;
  // Platz je Spieltag aus den Ergebnissen (saisonmanager.de liefert nur die aktuelle Tabelle)
  const verlaufTab = {};
  for (let r = 1; r <= maxRunde; r++) {
    const bis = gewertet.filter(g => g.runde <= r);
    if (!bis.some(g => g.runde === r)) continue;
    tabelleAus(bis, teamIds).forEach((z, i) => { (verlaufTab[z.id] = verlaufTab[z.id] || {})[r] = i + 1; });
  }
  const simBasis = simuliereSaison(modell, gewertet, offen, teamIds, 5000, {}, bonus);
  const rang = teamIds.slice().sort((a, b) => staerke(modell, b) - staerke(modell, a));

  // ================= Was hat sich geändert? =================
  // Neu = alle Ergebnisse der letzten 7 Tage bis zum jüngsten Ergebnis. Verglichen wird der Stand ohne diese Spiele
  // (Tabelle und Modell) mit dem jetzigen: Platz, wer vorbeigezogen ist, Siegchancen der nächsten eigenen Spiele.
  const AEND = (() => {
    const fertig = gewertet.concat(urteile);
    if (!fertig.length || !teams[UNSER]) return null;
    const tag = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const jungst = Math.max(...fertig.map(g => tag(g.datum)));
    const neu = fertig.filter(g => tag(g.datum) >= jungst - 6 * 864e5).sort((a, b) => a.datum - b.datum);
    const gewV = gewertet.filter(g => !neu.includes(g)), urtV = urteile.filter(g => !neu.includes(g));
    if (!gewV.length) return null;
    const tabV = tabelleAus(gewV, teamIds).map(z => {
      const r = Object.assign({}, z), nu = urtV.filter(g => g.heim === z.id || g.gast === z.id).length;
      if (nu) { const b = Math.min(P.S * nu, bonus[z.id] || 0); r.pkt += b; r.sp += nu; r.mpkt += P.S * nu - b; }
      return r;
    }).sort((x, y) => y.pkt - x.pkt || (y.tp - y.tm) - (x.tp - x.tm) || y.tp - x.tp);
    const platzV = id => tabV.findIndex(z => z.id === id) + 1;
    const mV = schaetzeModell(gewV, teamIds);
    const chance = (m, g) => { const p = prognose(m, g.heim, g.gast); return g.heim === UNSER ? p.pHeim : p.pGast; };
    const meine = offen.filter(g => g.heim === UNSER || g.gast === UNSER).slice(0, 4);
    const chancen = meine.map(g => ({ g, geg: g.heim === UNSER ? g.gast : g.heim, vorher: Math.round(chance(mV, g) * 100), jetzt: Math.round(chance(modell, g) * 100) }))
      .map(x => Object.assign(x, { d: x.jetzt - x.vorher }));
    const vorbei = teamIds.filter(id => id !== UNSER && platzV(id) > platzV(UNSER) && platz(id) < platz(UNSER));
    const zurueck = teamIds.filter(id => id !== UNSER && platzV(id) < platzV(UNSER) && platz(id) > platz(UNSER));
    return { neu, von: new Date(tag(neu[0].datum)), bis: new Date(jungst), platzVorher: platzV(UNSER), platzJetzt: platz(UNSER), vorbei, zurueck, chancen, chanceVon: g => chancen.find(x => x.g === g) };
  })();
  function ergebnisSatz(g) {
    if (g.urteil) return `${kurz(g.heim)} gegen ${kurz(g.gast)} kampflos gewertet`;
    const sieger = g.toreHeim > g.toreGast ? g.heim : g.toreHeim < g.toreGast ? g.gast : null;
    const st = (g.toreHeim >= g.toreGast ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)) + (g.zusatz ? ' ' + g.zusatz : '');
    if (!sieger) return `${kurz(g.heim)} und ${kurz(g.gast)} spielen ${stand(g.toreHeim, g.toreGast)} unentschieden`;
    const verlierer = sieger === g.heim ? g.gast : g.heim;
    return `${kurz(sieger)} gewinnt ${st} ${sieger === g.heim ? 'gegen' : 'bei'} ${kurz(verlierer)}`;
  }
  function platzSatz(a) {
    const nennen = l => l.map(id => kurz(id)).join(' und ');
    if (a.platzJetzt === a.platzVorher) return `Ihr bleibt auf Platz ${a.platzJetzt}.`;
    const wegen = a.platzJetzt > a.platzVorher ? (a.vorbei.length ? ` ${nennen(a.vorbei)} ${a.vorbei.length > 1 ? 'sind' : 'ist'} an euch vorbeigezogen.` : '') : (a.zurueck.length ? ` Ihr habt ${nennen(a.zurueck)} überholt.` : '');
    return `Ihr ${a.platzJetzt > a.platzVorher ? 'rutscht' : 'klettert'} von Platz ${a.platzVorher} auf Platz ${a.platzJetzt}.${wegen}`;
  }
  function chanceSatz(x) {
    const wo = x.g.heim === UNSER ? 'gegen' : 'bei';
    if (Math.abs(x.d) < 1) return `${wo} ${kurz(x.geg)}: unverändert ${x.jetzt} %`;
    return `${wo} ${kurz(x.geg)}: ${x.vorher} % → <b>${x.jetzt} %</b> <span class="delta ${x.d > 0 ? 'plus' : 'minus'}">${x.d > 0 ? '+' : MINUS}${Math.abs(x.d)}</span>`;
  }

  // ================= Zustand =================
  // Der Fokus wird bewusst nicht gespeichert: Beim Öffnen zeigt die App immer das eigene Team.
  let fokus = teams[UNSER] ? UNSER : teamIds[0];
  let bereich = merk.get('bereich', 'heute');
  const ui = { spieleTeam: 'fokus', spieleStatus: 'alle', tabelleAnsicht: 'tabelle', spSuche: '', spTeam: UNSER, spSort: 'punkte', tmSort: 'staerke', tmAb: true };
  let fest = merk.get('fest', {}); Object.keys(fest).forEach(k => { if (!spielNach[k] || !spielNach[k].offen) delete fest[k]; });
  const labor = { spiel: null, dabei: {}, eigene: merk.get('eigene', {}), form: { f: 0, g: 0 }, neutral: false, offen: null };
  const kader = merk.get('kader', {});
  const datumKurz = iso => { const [j, m, t] = String(iso).split('-'); return `${t}.${m}.${j}`; };
  const kaderVon = id => (kader[id] = kader[id] || { verf: {}, pins: {} });
  // Zu- und Absagen aus SpielerPlus (daten/zusagen.js, von Hand gepflegt). Für das Spiel g einmal je Stand in den
  // lokalen Kader übernehmen; danach kann man am Gerät weiter umschalten, bis ein neuer Stand kommt.
  const ZUSAGEN = window.HB_ZUSAGEN || {};
  function zusagenFuer(g) { const z = g && (g.heim === UNSER || g.gast === UNSER) ? ZUSAGEN[g.id] : null; return z && Array.isArray(z.dabei) ? z : null; }
  const immerRaus = Array.isArray(ZUSAGEN.immerRaus) ? ZUSAGEN.immerRaus : [];
  // „Immer raus“ (z. B. die ganze Saison weg): bleibt in Listen sichtbar, aber ausgegraut, und fehlt im Matchplan,
  // auf dem Kabinenblatt und in der WhatsApp-Nachricht. Dafür bekommt der Matchplan eine Sicht ohne sie (Bmp).
  const istRaus = s => !!s && immerRaus.includes(s.id);
  const Bmp = Object.assign({}, B, { teams: Object.fromEntries(Object.entries(B.teams).map(([k, t]) => [k, Object.assign({}, t, { liste: t.liste.filter(s => !istRaus(s)) })])) });
  // Matchplan ohne „Anfragen“ (AU2): für das Team nicht hilfreich
  const matchplanFuer = (g, f) => { const mp = erzeugeMatchplan({ modell, B: Bmp, K, liga: LIGA, g, fokus: f, eigene: labor.eigene }); mp.empfehlungen = mp.empfehlungen.filter(e => e.id !== 'AU2'); return mp; };
  function zusagenAnwenden(g) {
    if (!g || fokus !== UNSER || !B.teams[UNSER]) return;
    const z = zusagenFuer(g), kd = kaderVon(UNSER);
    const key = z ? `${g.id}@${z.stand}` : `${g.id}@raus:${immerRaus.join(',')}`;
    if (kd.zusagen === key) return;
    if (z) { kd.verf = {}; B.teams[UNSER].liste.forEach(s => { if (!z.dabei.includes(s.id)) kd.verf[s.id] = false; }); }
    immerRaus.forEach(id => { kd.verf[id] = false; });
    kd.zusagen = key; merk.set('kader', kader);
  }

  // ================= Perspektive =================
  function sicht(g) {
    const dabei = g.heim === fokus || g.gast === fokus;
    return { dabei, heim: g.heim === fokus, gegner: dabei ? (g.heim === fokus ? g.gast : g.heim) : null };
  }
  function ausFokus(p, g) {
    const s = sicht(g);
    if (!s.dabei) return { a: p.pHeim, u: p.pRemis, b: p.pGast, neutral: true };
    return s.heim ? { a: p.pHeim, u: p.pRemis, b: p.pGast } : { a: p.pGast, u: p.pRemis, b: p.pHeim };
  }
  // Streifen aus Fokus-Sicht: Sieg links
  function streifen(w, dick) {
    const r = drei(w.a, w.u, w.b);
    const c = w.neutral ? ['h', 'u', 'g'] : ['s', 'u', 'n'];
    const lab = w.neutral ? ['Heim', REMIS, 'Gast'] : ['Sieg', REMIS, 'Niederlage'];
    return `<div class="streifen${dick ? '' : ' d'}" role="img" aria-label="${lab.map((l, i) => l + ' ' + r[i] + ' Prozent').join(', ')}">${r.map((v, i) => `<i class="${c[i]}" style="flex:${Math.max(v, 1)} 1 0"></i>`).join('')}</div>`;
  }
  // Streifen räumlich an Heim und Gast gebunden (Spiel-Sheet, Labor): Farbe aus Fokus-Sicht
  function streifenHG(p, g, dick) {
    const s = sicht(g), r = drei(p.pHeim, p.pRemis, p.pGast);
    const c = !s.dabei ? ['h', 'u', 'g'] : s.heim ? ['s', 'u', 'n'] : ['n', 'u', 's'];
    return `<div class="streifen${dick ? '' : ' d'}" role="img" aria-label="Sieg ${esc(kurz(g.heim))} ${r[0]} Prozent, ${REMIS} ${r[1]} Prozent, Sieg ${esc(kurz(g.gast))} ${r[2]} Prozent">${r.map((v, i) => `<i class="${c[i]}" style="flex:${Math.max(v, 1)} 1 0"></i>`).join('')}</div>`;
  }
  function dreiHG(p, g) {
    const s = sicht(g), r = drei(p.pHeim, p.pRemis, p.pGast);
    const farbe = i => !s.dabei || i === 1 ? '' : ((i === 0) === s.heim ? 'plus' : 'minus');
    const lab = [`Sieg ${esc(kurz(g.heim))}`, REMIS, `Sieg ${esc(kurz(g.gast))}`];
    return `<div class="ergebnis3">${r.map((v, i) => `<div><div class="w ${farbe(i)}">${v}<span class="pz">%</span></div><div class="lab">${lab[i]}</div></div>`).join('')}</div>`;
  }
  const erwartet = (p, g) => `Erwartet etwa ${esc(kurz(g.heim))} ${Math.round(p.eHeim)}, ${esc(kurz(g.gast))} ${Math.round(p.eGast)}`;
  const ergebnisAus = (g, id) => { const e = g.heim === id ? g.toreHeim - g.toreGast : g.toreGast - g.toreHeim; return e > 0 ? 'S' : e < 0 ? 'N' : 'U'; };
  const SUN = { S: 'Sieg', U: 'Remis', N: 'Niederlage' };
  // Zwischenstände: „Halbzeit 3:2“ oder bei Dritteln „1:0 · 3:2 · 5:4“
  const periodenText = v => !v || !v.perioden ? '' : SPORT.periods === 2 ? `Halbzeit ${stand(v.perioden[0].heim, v.perioden[0].gast)}` : v.perioden.map(p => `${p.heim}:${p.gast}`).join(' · ');

  // ================= Icons =================
  function ico(n, k) {
    const P = {
      tafel: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>',
      kamera: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
      extern: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
      play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
      pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
      ausruf: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M12 6.5v7" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.5" fill="#fff" stroke="none"/>',
      stern: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
      plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 12l2 2 4-4"/>',
      kalender: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
      tabelle: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
      labor: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
      trikot: '<path d="M8 3l-4 3 2 4 2-1v12h8V9l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>',
      schilde: '<path d="M8 4l5 2v5c0 4-2.5 6.5-5 8-2.5-1.5-5-4-5-8V6zM16 4l5 2v5c0 4-2.5 6.5-5 8"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
      mehr: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
      chev: '<path d="M8 10l4 4 4-4"/>', chevr: '<path d="M10 7l5 5-5 5"/>',
      zu: '<path d="M7 7l10 10M17 7L7 17"/>', haken: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
      druck: '<path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
      uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      teilen: '<path d="M12 4v11M8 8l4-4 4 4M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5"/>',
      pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
      ort: '<path d="M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
      schloss: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
      tor: '<path d="M4 20V6h16v14"/><path d="M4 11h16M9.3 6v14M14.7 6v14M4 15.5h16"/>',
    };
    return `<svg class="ico${k ? ' k' : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  }
  const wortmarke = gr => `<span class="wortmarke"${gr ? ` style="font-size:${gr}px"` : ''}>${APP}<span class="ws" aria-hidden="true"><i></i><i></i><i></i></span></span>`;

  function logo(id, g = 20) {
    const t = teams[id];
    const q = logoQuelle(id);
    const img = q ? `<img alt="" loading="lazy" src="${esc(q)}" onload="this.classList.add('da')" onerror="this.remove()">` : '';
    return `<span class="logo l${g}" aria-hidden="true"><span class="mono">${esc(t ? t.mono : '?')}</span>${img}</span>`;
  }
  // Spieler als runder Avatar. Fotos gibt es nur fürs eigene Team und nur mit Zustimmung (von Hand in daten/fotos/
  // abgelegt und in daten/fotos.js eingetragen); alle anderen, auch ohne Foto, bekommen Initialen.
  const FOTOS = window.HB_FOTOS || {};
  const initialen = name => String(name || '').trim().split(/\s+/).filter(Boolean).map((w, i, a) => i === 0 || i === a.length - 1 ? w.charAt(0) : '').join('').toUpperCase() || '?';
  function avatar(id, name, team, g = 32) {
    const k = Number(team) === Number(UNSER) && FOTOS[id];
    const img = k ? `<img alt="" loading="lazy" src="../daten/fotos/${encodeURIComponent(id)}.jpg?u=${encodeURIComponent(k)}" onload="this.classList.add('da')" onerror="this.remove()">` : '';
    return `<span class="ava a${g}" aria-hidden="true"><span class="ini">${esc(initialen(name))}</span>${img}</span>`;
  }
  const ava = (s, g) => avatar(s.id, s.name, s.team, g);
  // Von Hand gepflegte Positionen und ein Satz je Spieler des eigenen Teams (daten/profile.js).
  // Ohne Eintrag: Torhüter aus dem Spielbericht, Satz automatisch aus Toren und Assists (spruchFuer).
  const PROFIL = window.HB_PROFILE || {};
  const POS = { TW: 'Torhüter', VT: 'Verteidigung', C: 'Center', ST: 'Sturm' };
  const profil = s => Number(s.team) === Number(UNSER) ? PROFIL[s.id] || null : null;
  const positionen = s => { const p = profil(s); const l = p && Array.isArray(p.position) ? p.position.filter(x => POS[x]) : []; return l.length ? l : s.torwart ? ['TW'] : []; };
  // ================= Sprüche je Spieler aus Toren und Assists =================
  // Stabil je Spieler (Auswahl über die ID), ändert sich, wenn er in eine andere Kategorie rutscht. Ein Satz aus
  // daten/profile.js geht immer vor. {t} Tore, {a} Assists, {p} Scorerpunkte, {s} Spiele.
  const SPRUECHE_SPIELER = {
    torwart: ['Hinter ihm ist Schluss – der Ball kommt nicht vorbei.', 'Die Wand im Broilers-Tor.', 'Schüsse? Nimmt er persönlich.', 'Fängt alles, was fliegt. Auch Bälle mit Löchern.'],
    topscorer: ['Bester Schütze im Team: {t} Tore. Wenn’s brennt, liegt der Ball bei ihm.', '{t} Tore – der Broiler mit dem heißesten Schläger.', 'Teamintern Torjäger Nummer eins. {t}-mal geknipst.', 'Hält den Laden mit {p} Scorerpunkten am Laufen.'],
    vielTore: ['{t} Tore in {s} Spielen – Knipser aus Leidenschaft.', 'Sieht die Lücke, bevor sie da ist. {t} Tore.', 'Der Ball will einfach zu ihm. {t}-mal drin.', 'Schuss, Tor, Jubel – {t}-mal geübt.'],
    vorbereiter: ['{a} Assists: Er macht die anderen besser.', 'Der Pass, nach dem alle jubeln. {a}-mal.', 'Spielmacher mit Übersicht – {a} Vorlagen.', 'Lieber ein schöner Pass als ein schneller Schuss. {a} Assists.'],
    trifft: ['{t} Tor{tn}, {a} Assist{an} – zuverlässig dabei.', 'Wenn er trifft, trifft er richtig. {t} Tor{tn} bisher.', 'Hat Torinstinkt – {t}-mal bewiesen.', 'Jedes Tor zählt doppelt, wenn es von ihm kommt.'],
    arbeiter: ['Macht die Drecksarbeit, die keine Statistik zählt.', 'Blockt, läuft, kämpft – das Tor kommt noch.', 'Sein Tor kommt. Bis dahin räumt er hinten auf.', 'Stark ohne Ball. Unbezahlbar fürs Team.'],
  };
  function spruchFuerSpieler(s) {
    const team = B.teams[s.team], top = team ? team.liste.filter(x => !x.torwart).slice().sort((a, b) => b.tore - a.tore || b.punkte - a.punkte)[0] : null;
    const k = s.torwart ? 'torwart' : top === s && s.tore >= 3 ? 'topscorer' : s.tore >= 5 || (s.anz >= 2 && s.toreProSpiel >= 1.5) ? 'vielTore'
      : s.assists >= 3 && s.assists > s.tore ? 'vorbereiter' : s.tore >= 1 ? 'trifft' : s.assists >= 1 ? 'vorbereiter' : 'arbeiter';
    const l = SPRUECHE_SPIELER[k], h = String(s.id).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return l[h % l.length].replace(/\{t\}/g, s.tore).replace(/\{a\}/g, s.assists).replace(/\{p\}/g, s.punkte).replace(/\{s\}/g, s.anz)
      .replace(/\{tn\}/g, s.tore === 1 ? '' : 'e').replace(/\{an\}/g, s.assists === 1 ? '' : 's');
  }
  const satzVon = s => { const p = profil(s); return p && p.satz ? p.satz : Number(s.team) === Number(UNSER) ? spruchFuerSpieler(s) : ''; };
  const posKurz = s => positionen(s).join('/');
  const mitPos = s => posKurz(s) ? `${posKurz(s)} · ` : '';
  const aemter = s => { const p = profil(s); return p && Array.isArray(p.aemter) ? p.aemter.filter(Boolean) : []; };

  // ================= Datum (Ortszeit mit falscher UTC-Kennung, UTC-Werte direkt lesen) =================
  const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const zeit = d => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  const tagKurz = d => String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.';
  const tagLang = d => `${WT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`;
  function tageBis(d) {
    const h = new Date(); const heute = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - heute) / 864e5);
  }
  const naechstes = id => offen.filter(g => g.heim === id || g.gast === id)[0];
  const spieleVon = id => gewertet.filter(g => g.heim === id || g.gast === id);
  const routeLink = g => g.lat && g.lon ? `<a class="route" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.lat + ',' + g.lon)}" target="_blank" rel="noopener">Route</a>` : '';

  // ================= Bereiche =================
  const BEREICHE = [
    { id: 'heute', name: 'Start', kurz: 'Start', ico: 'tafel' },
    { id: 'matchplan', name: 'Matchplan', kurz: 'Matchplan', ico: 'plan' },
    { id: 'spiele', name: 'Spiele', kurz: 'Spiele', ico: 'kalender' },
    { id: 'tabelle', name: 'Tabelle', kurz: 'Tabelle', ico: 'tabelle' },
    { id: 'labor', name: 'Durchspielen', kurz: 'Durchspielen', ico: 'labor' },
    { id: 'spieler', name: 'Spieler', kurz: 'Spieler', ico: 'trikot' },
    { id: 'teams', name: 'Teams', kurz: 'Teams', ico: 'schilde' },
    { id: 'social', name: 'Social & Assets', kurz: 'Social', ico: 'kamera' },
    { id: 'methodik', name: 'So rechnet Bully', kurz: 'Methodik', ico: 'info' },
  ];
  // Bereich per Link öffnen, z. B. app/index.html#matchplan
  const bereichAusHash = () => { const h = location.hash.replace('#', '').toLowerCase(); return BEREICHE.some(b => b.id === h) ? h : null; };
  if (bereichAusHash()) bereich = bereichAusHash();
  const geholt = new Date(D.fetchedAt);
  const datenstand = `Datenstand ${geholt.toLocaleDateString('de-DE')} ${geholt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;

  function gerüst() {
    $('#seitenleiste').innerHTML = `
      <div class="marke">${wortmarke(24)}</div>
      <button class="wechsler" data-aktion="team">${logo(fokus, 28)}<span class="txt"><span class="n" style="display:block">${esc(kurz(fokus))}</span><small>Platz ${platz(fokus)} · ${(tabelle.find(z => z.id === fokus) || {}).pkt || 0} Punkte</small></span>${ico('chev', 1)}</button>
      <nav>${BEREICHE.map((b, i) => `${i === 4 ? '<div class="luecke"></div>' : ''}<button data-bereich="${b.id}" class="${bereich === b.id ? 'an' : ''}">${ico(b.ico)}${b.name}</button>`).join('')}</nav>
      <div class="fuss">${esc(datenstand)}<div class="absender">${esc(ABSENDER)}</div></div>`;
    $('#kopf').innerHTML = `<button class="wechsler" data-aktion="team" aria-label="Team wählen">${logo(fokus, 24)}<span class="n">${esc(kurz(fokus))}</span>${ico('chev', 1)}</button><span class="platz"></span>
      `;
    const tabs = ['heute', 'matchplan', 'spiele', 'tabelle'];
    $('#tabbar').innerHTML = tabs.map(id => { const b = BEREICHE.find(x => x.id === id); return `<button data-bereich="${id}" class="${bereich === id ? 'an' : ''}">${ico(b.ico)}<span>${b.kurz}</span></button>`; }).join('') +
      `<button data-aktion="mehr" class="${tabs.includes(bereich) ? '' : 'an'}">${ico('mehr')}<span>Mehr</span></button>`;
  }

  // ================= Sheet =================
  const sheet = $('#sheet');
  function oeffneSheet(titel, html) {
    sheet.innerHTML = `<div class="skopf"><h2 class="titel" id="sheetTitel">${titel}</h2><button class="zu" data-aktion="zu" aria-label="Schließen"><span>${ico('zu', 1)}</span></button></div><div class="sinhalt">${html}</div>`;
    sheet.setAttribute('aria-labelledby', 'sheetTitel');
    if (!sheet.open) { if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); }
    sheet.querySelector('.sinhalt').scrollTop = 0;
  }
  function schliesseSheet() { if (sheet.open) sheet.close ? sheet.close() : sheet.removeAttribute('open'); }
  sheet.addEventListener('click', e => { if (e.target === sheet) schliesseSheet(); });

  // ================= Bausteine =================
  const seitenkopf = (titel, metaZeile, rechts) => `<div class="seitenkopf"><div><h1 class="h1">${titel}</h1>${metaZeile ? `<div class="meta">${metaZeile}</div>` : ''}</div>${rechts || ''}</div>`;
  const modul = (titel, inhalt, opt = {}) => `<section class="modul${opt.klasse ? ' ' + opt.klasse : ''}"${opt.id ? ` id="${opt.id}"` : ''}>${titel ? `<div class="mkopf"><div>${opt.eyebrow ? `<span class="micro">${opt.eyebrow}</span>` : ''}<h2 class="titel">${titel}</h2></div>${opt.aktion || ''}</div>` : ''}${inhalt}${opt.fuss ? `<div class="fussnote">${opt.fuss}</div>` : ''}</section>`;
  const kachel = (lab, wert, ctx, delta) => `<div class="kachel"><div class="lab">${lab}</div><div class="kpi"><span>${wert}</span>${delta || ''}</div>${ctx ? `<div class="ctx">${ctx}</div>` : ''}</div>`;
  const etikett = (t, kontur) => `<span class="etikett${kontur ? ' kontur' : ''}">${t}</span>`;
  const ausSpielen = n => etikett(`aus ${n} Spiel${n === 1 ? '' : 'en'}`);
  const breite = (abzug = 0) => {
    const el = $('#inhalt'); const cs = getComputedStyle(document.documentElement);
    const rand = parseFloat(cs.getPropertyValue('--rand')) || 16, pad = parseFloat(cs.getPropertyValue('--pad')) || 16;
    return Math.max(260, Math.min(1040, el.clientWidth - 2 * rand) - 2 * pad - 2 - abzug);
  };

  function hinweisFokus() {
    if (fokus === UNSER) return '';
    return `<div class="hinweis">${ico('info')}<span>Du schaust auf ${esc(kurz(fokus))}.</span><button class="textaktion" data-fokus="${UNSER}">Zurück zu ${esc(kurz(UNSER))}</button></div>`;
  }

  function tafel(id) {
    const g = naechstes(id);
    if (!g) {
      const erw = simBasis.plaetze[id].indexOf(Math.max(...simBasis.plaetze[id])) + 1;
      return `<section class="tafel"><div class="zone-a"><span class="micro">Saison</span></div><div class="zahl"><div><div class="hero">${erw}.</div><div class="lab">Platz am Saisonende erwartet</div></div></div><div class="aktionen"><button class="btn prim" data-bereich="tabelle">Zur Tabelle</button></div></section>`;
    }
    const p = prognose(modell, g.heim, g.gast), w = ausFokus(p, g), r = drei(w.a, w.u, w.b);
    const s = sicht(g), t = tageBis(g.datum);
    const count = g.terminOffen ? '' : t === 0 ? '' : t === 1 ? '<span class="count">morgen</span>' : t > 1 ? `<span class="count">in ${t} Tagen</span>` : '';
    const seite = (tid, rolle) => `<div>${logo(tid, 48)}<div class="nm">${esc(kurz(tid))}</div><div class="pl">${rolle} · Platz ${platz(tid)}</div>${tid === fokus ? '<div class="fstrich"></div>' : ''}</div>`;
    const eyebrow = t === 0 && !g.terminOffen ? `Heute ist Spieltag · Bully um ${zeit(g.datum)} Uhr` : id === UNSER ? `Nächstes Spiel · Spieltag ${g.runde}` : `Nächstes Spiel von ${esc(kurz(id))}`;
    const eF = s.heim ? p.eHeim : p.eGast, eG = s.heim ? p.eGast : p.eHeim;
    return `<section class="tafel">
      <div class="zone-a"><span class="micro">${eyebrow}</span>${count}</div>
      <div class="termin">${g.terminOffen ? 'Termin noch offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr · ${s.heim ? 'zu Hause' : 'auswärts'}`}</div>
      ${g.halle ? `<div class="halle">${esc(normalisiere(g.halle))}${g.adresse ? ` · ${esc(adresseSchoen(g.adresse))}` : ''} ${routeLink(g)}</div>` : ''}
      <div class="kern">
        <button class="paarung" data-spiel="${g.id}" aria-label="Spieldetails">${seite(g.heim, 'Heim')}<div class="vs">${s.heim ? 'gegen' : 'bei'}</div>${seite(g.gast, 'Gast')}</button>
        <div>
          <div class="zahl"><div><div class="hero">${r[0]}<span class="pz">%</span></div><div class="lab">Siegchance ${esc(kurz(id))}</div></div>
          <div class="neben">${REMIS} <b>${r[1]}${NB}%</b><br>Niederlage <b>${r[2]}${NB}%</b></div></div>
          ${streifen(w, true)}
          <div class="erw">Erwartet etwa ${Math.round(eF)}${NB}:${NB}${Math.round(eG)} · aus je ${B.teams[id] ? B.teams[id].spiele.length : 0} Spielen mit Spielbericht</div>
        </div>
      </div>
      <div class="aktionen"><button class="btn prim" data-bereich="matchplan">Matchplan</button><button class="btn" data-labor="${g.id}">Durchspielen</button></div>
    </section>`;
  }

  function spielZeile(g, opt = {}) {
    const s = sicht(g), d = g.datum;
    const datum = g.terminOffen ? `<div class="wt">Termin</div><div class="tg t3">offen</div>` : `<div class="wt">${WT[d.getUTCDay()]}</div><div class="tg">${tagKurz(d)}</div>${g.offen ? `<div class="cap t2">${zeit(d)}</div>` : ''}`;
    let paar, rechts;
    if (g.gewertet) {
      const hs = g.toreHeim > g.toreGast ? 'sieger' : g.toreHeim < g.toreGast ? 'verl' : '';
      const gs = g.toreGast > g.toreHeim ? 'sieger' : g.toreGast < g.toreHeim ? 'verl' : '';
      paar = `<div class="${hs}">${logo(g.heim)}<span>${esc(kurz(g.heim))}</span></div><div class="${gs}">${logo(g.gast)}<span>${esc(kurz(g.gast))}</span></div>`;
      const v = B.verlaeufe[g.id];
      const e = s.dabei ? ergebnisAus(g, fokus) : null;
      rechts = `<div class="ergbox">${e ? `<span class="sun ${e}" aria-label="${SUN[e]}">${e}</span>` : ''}<div class="tz" style="grid-template-columns:auto"><span>${g.toreHeim}</span><span>${g.toreGast}</span></div></div>${g.zusatz ? `<div class="cap t2">${g.zusatz}</div>` : v ? `<div class="cap t3">${periodenText(v)}</div>` : ''}`;
    } else {
      paar = `<div>${logo(g.heim)}<span>${esc(kurz(g.heim))}</span></div><div>${logo(g.gast)}<span>${esc(kurz(g.gast))}</span></div>`;
      if (g.urteil) rechts = '<span class="cap t2">kampflos</span>';
      else {
        const p = prognose(modell, g.heim, g.gast), w = ausFokus(p, g), r = drei(w.a, w.u, w.b);
        rechts = `<div class="chance">${s.dabei ? `${r[0]}${NB}%` : `<span class="cap t2">Heim ${r[0]}${NB}%</span>`}</div>${streifen(w)}`;
      }
    }
    return `<button class="spiel${s.dabei && !opt.ohneMarke ? ' fokus' : ''}" data-spiel="${g.id}"><div class="dat">${datum}</div><div class="paar">${paar}</div><div class="erg">${rechts}</div></button>`;
  }

  function formSun(g, id, gr) { const e = ergebnisAus(g, id); return `<span class="sun ${e}${gr ? ' gross' : ''}" aria-label="${SUN[e]}"${gr ? '' : ' style="width:18px;height:18px;font-size:11px"'}>${e}</span>`; }
  function tabelleHtml(zeilen, kompakt) {
    return `<div class="${kompakt ? 'kompakt' : 'scrollx'}"><table class="tab"><thead><tr><th>#</th><th class="l">Team</th><th>Sp</th><th class="opt">S</th>${SPORT.draws ? '<th class="opt">U</th>' : ''}<th class="opt">N</th><th class="opt tore">Tore</th><th>Diff</th><th>${kompakt ? 'Pkt' : 'Punkte'}</th><th class="opt l form" style="padding-left:12px">Form</th></tr></thead><tbody>
      ${zeilen.map(z => { const i = platz(z.id), d = z.tp - z.tm; return `<tr class="klick${z.id === fokus ? ' f' : ''}" data-team="${z.id}"><td class="t2">${i}</td><td class="l tw"><span class="team">${logo(z.id)}<span>${esc(kurz(z.id))}</span></span></td><td>${z.sp}</td><td class="opt">${z.s}${z.sv ? `<span class="t3" title="davon nach Verlängerung"> (${z.sv})</span>` : ''}</td>${SPORT.draws ? `<td class="opt">${z.u}</td>` : ''}<td class="opt">${z.n}${z.nv ? `<span class="t3" title="davon nach Verlängerung"> (${z.nv})</span>` : ''}</td><td class="opt tore">${stand(z.tp, z.tm)}</td><td>${d > 0 ? '+' : d < 0 ? MINUS : ''}${Math.abs(d)}</td><td class="pk">${z.pkt}</td><td class="opt l form" style="padding-left:12px"><span style="display:inline-flex;gap:3px">${spieleVon(z.id).slice(-5).reverse().map(g => formSun(g, z.id)).join('')}</span></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  // ================= Diagramme =================
  function siegchanceVerlauf(id) {
    const liste = spiele.filter(g => (g.heim === id || g.gast === id) && !g.urteil);
    if (liste.length < 2) return '';
    const W = breite(), H = 184, L = 4, R = 8, T = 16, Bt = 28;
    const x = i => L + 44 + i * (W - L - R - 44) / (liste.length - 1);
    const y = v => T + (1 - v) * (H - T - Bt);
    const jede = Math.ceil(liste.length / Math.max(4, Math.floor(W / 64)));
    let pfad = '', punkte = '';
    liste.forEach((g, i) => {
      const p = g.gewertet ? vorher[g.id] : prognose(modell, g.heim, g.gast);
      const v = g.heim === id ? p.pHeim : p.pGast;
      pfad += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      const geg = kurz(g.heim === id ? g.gast : g.heim);
      const e = g.gewertet ? ergebnisAus(g, id) : null;
      const farbe = e ? { S: 'var(--sieg)', U: 'var(--remis)', N: 'var(--niederlage)' }[e] : 'var(--bg-1)';
      const info = `${g.terminOffen ? 'Termin offen' : tagKurz(g.datum)} ${g.heim === id ? 'gegen' : 'bei'} ${geg} · Siegchance ${pct(v)}` + (g.gewertet ? ` · ${stand(g.toreHeim, g.toreGast)}` : '');
      punkte += `<g class="pkt" data-wert="${esc(info)}" data-spiel="${g.id}" style="cursor:pointer"><circle cx="${x(i)}" cy="${y(v)}" r="14" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${farbe}" stroke="${e ? farbe : 'var(--accent)'}" stroke-width="2"/></g>`;
      if (i % jede === 0) punkte += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--text-3)">${g.terminOffen ? 'offen' : tagKurz(g.datum)}</text>`;
    });
    const gitter = [0, .5, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-1)"/><text x="${L}" y="${y(v) - 4}" font-size="12" fill="var(--text-3)">${v * 100}${NB}%</text>`).join('');
    return modul('Siegchance je Spiel', `<div class="wertzeile" data-wertzeile>Punkt antippen für Details</div><svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Siegchance je Spiel der Saison">${gitter}<path d="${pfad}" fill="none" stroke="var(--line-2)" stroke-width="1.5"/>${punkte}</svg>`,
      { fuss: 'Gefüllt: gespielt, die Farbe zeigt das Ergebnis, der Wert die Chance vor dem Anpfiff. Leer: noch offen.' });
  }

  function tabellenVerlauf() {
    const runden = []; for (let r = 1; r <= maxRunde; r++) runden.push(r);
    if (runden.length < 2 || !Object.keys(verlaufTab).length) return `<div class="leer">${ico('tabelle')}<b>Noch kein Verlauf</b><p>Der Verlauf erscheint ab dem zweiten Spieltag.</p></div>`;
    const n = teamIds.length, W = breite(), lab = W < 500 ? 96 : 130, H = 28 * n + 30, L = 22, R = lab, T = 10, Bt = 22;
    const x = r => L + (r - 1) * (W - L - R) / (runden.length - 1);
    const y = p => T + (p - 1) * (H - T - Bt) / (n - 1);
    const reihen = teamIds.slice().sort((a, b) => (a === fokus) - (b === fokus));
    const linien = reihen.map(id => {
      const v = verlaufTab[id] || {};
      const pts = runden.filter(r => v[r]).map(r => [x(r), y(v[r])]);
      if (!pts.length) return '';
      const f = id === fokus, letzte = pts[pts.length - 1];
      return `<g data-team="${id}" style="cursor:pointer"><path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')}" fill="none" stroke="${f ? 'var(--accent)' : 'var(--text-3)'}" stroke-width="${f ? 2.5 : 1.25}" stroke-linejoin="round"/>
        ${f ? pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--accent)"/>`).join('') : ''}
        <text x="${letzte[0] + 8}" y="${letzte[1] + 4}" font-size="12" fill="${f ? 'var(--accent)' : 'var(--text-2)'}" font-weight="${f ? 600 : 400}">${esc(kurz(id).slice(0, lab > 100 ? 18 : 12))}</text></g>`;
    }).join('');
    const achse = runden.map(r => `<text x="${x(r)}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--text-3)">${r}</text>`).join('') +
      Array.from({ length: n }, (_, i) => `<text x="${L - 8}" y="${y(i + 1) + 4}" text-anchor="end" font-size="12" fill="var(--text-3)">${i + 1}</text>`).join('');
    return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tabellenplatz je Spieltag">${achse}${linien}</svg>`;
  }

  const abst0 = 4;
  function phasenGrafik(mp) {
    const ph = mp.phasen; if (!ph.fokus || !ph.gegner) return '';
    const W = breite(), rowH = 76, kopfH = 22, zw = 18, H = kopfH + rowH + zw + kopfH + rowH + 24;
    const hzL = SPORT.periods === 2 ? 20 : abst0, abst = 4, sw = (W - hzL - abst * 4) / 6;
    const sx = i => i * (sw + abst) + (SPORT.periods === 2 && i >= 3 ? hzL - abst : 0);
    const max = Math.max(3, ...ph.fokus.map(Math.abs), ...ph.gegner.map(Math.abs));
    const bw = Math.min(28, sw * .5);
    const reihe = (werte, y0, eigen, name) => {
      const mitte = y0 + kopfH + rowH / 2, halb = rowH / 2 - 16;
      let s = `<text x="0" y="${y0 + 12}" font-size="12" font-weight="600" fill="var(--text-1)">${esc(name)}</text><line x1="0" x2="${W}" y1="${mitte}" y2="${mitte}" stroke="var(--line-2)"/>`;
      werte.forEach((v, i) => {
        const h = Math.abs(v) / max * halb, bx = sx(i) + sw / 2 - bw / 2, by = v >= 0 ? mitte - h : mitte;
        const fill = eigen ? (v >= 0 ? 'var(--sieg)' : 'var(--niederlage)') : (v >= 0 ? 'var(--text-2)' : 'none');
        if (v !== 0) s += `<rect class="b" x="${bx}" y="${by}" width="${bw}" height="${Math.max(h, 1.5)}" rx="2" fill="${fill}" stroke="${eigen ? 'none' : 'var(--text-2)'}" stroke-width="${eigen ? 0 : 1.5}" style="animation-delay:${i * 30}ms"/>`;
        s += `<text x="${sx(i) + sw / 2}" y="${v >= 0 ? by - 5 : by + h + 14}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text-2)">${vzGanz(v)}</text>`;
      });
      return s;
    };
    let svg = reihe(ph.fokus, 0, true, kurz(fokus)) + reihe(ph.gegner, kopfH + rowH + zw, false, kurz(mp.gegner));
    const hzX = sx(3) - hzL / 2 - abst / 2 + 2;
    // gestrichelt: Pausen (Halbzeit oder Drittelpausen)
    const pausen = SPORT.periods === 2 ? [hzX] : [2, 4].map(i => sx(i) - abst / 2);
    pausen.forEach(x => { svg += `<line x1="${x}" x2="${x}" y1="${kopfH}" y2="${H - 22}" stroke="var(--line-2)" stroke-dasharray="3 3"/>`; });
    const grenze = i => i === 0 ? 0 : i === 6 ? W : (SPORT.periods === 2 && i === 3) ? hzX : sx(i) - abst / 2;
    for (let i = 0; i <= 6; i++) svg += `<text x="${grenze(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === 6 ? 'end' : 'middle'}" font-size="12" fill="var(--text-3)">${SPORT.slotLabel(i)}'</text>`;
    return `<svg class="diagramm wachsen" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tordifferenz je Spielabschnitt">${svg}</svg>`;
  }

  function spielverlaufSvg(g, v, W) {
    const s = sicht(g), vzF = s.dabei && !s.heim ? -1 : 1;
    const H = W > 420 ? 200 : 160, L = 4, R = 36, T = 12, Bt = 22;
    const pts = [[0, 0]].concat(v.tore.map(t => [t.min, vzF * (t.heim - t.gast)])); pts.push([DAUER, vzF * (v.regulaer.heim - v.regulaer.gast)]);
    const mx = Math.max(3, ...pts.map(p => Math.abs(p[1])));
    const x = m => L + Math.min(DAUER, m) / DAUER * (W - L - R);
    const y = d => T + (mx - d) / (2 * mx) * (H - T - Bt);
    let pfad = `M${x(0)} ${y(0)}`;
    for (let i = 1; i < pts.length; i++) pfad += `H${x(pts[i][0]).toFixed(1)}V${y(pts[i][1]).toFixed(1)}`;
    const fl = pfad + `H${x(DAUER)}V${y(0)}H${x(0)}Z`;
    const oben = s.dabei ? 'var(--sieg)' : 'var(--text-3)', unten = s.dabei ? 'var(--niederlage)' : 'var(--text-3)', dk = s.dabei ? .16 : .12;
    const ziele = v.tore.map(t => `<rect x="${x(t.min) - 6}" y="${T}" width="12" height="${H - T - Bt}" fill="transparent" data-wert="${t.min}. Minute · ${stand(t.heim, t.gast)}${t.name ? ' · ' + esc(t.name) : ''}${t.sm ? ' · Strafschuss' : ''}${t.staerke === 'ueberzahl' ? ' · Überzahl' : t.staerke === 'unterzahl' ? ' · Unterzahl' : ''}"/>`).join('');
    let hoch = 0, tief = 0; pts.forEach(p => { hoch = Math.max(hoch, p[1]); tief = Math.min(tief, p[1]); });
    const obenName = s.dabei ? kurz(fokus) : kurz(g.heim), untenName = s.dabei ? kurz(s.gegner) : kurz(g.gast);
    return `<div class="wertzeile" data-wertzeile>Größte Führung ${esc(obenName)} ${hoch > 0 ? '+' + hoch : '0'}, ${esc(untenName)} ${tief < 0 ? '+' + (-tief) : '0'}</div>
      <svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Spielverlauf">
      <clipPath id="ob${g.id}"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="un${g.id}"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath>
      <path d="${fl}" fill="${oben}" opacity="${dk}" clip-path="url(#ob${g.id})"/><path d="${fl}" fill="${unten}" opacity="${dk}" clip-path="url(#un${g.id})"/>
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)"/>
      ${Array.from({ length: SPORT.periods - 1 }, (_, i) => { const m = (i + 1) * SPORT.periodMin; return `<line x1="${x(m)}" x2="${x(m)}" y1="${T}" y2="${H - Bt}" stroke="var(--line-2)"/><text x="${x(m) + 4}" y="${T + 8}" font-size="11" font-weight="600" fill="var(--text-3)">${SPORT.periods === 2 ? 'Halbzeit' : (i + 1) + '. Pause'}</text>`; }).join('')}
      <path d="${pfad}" fill="none" stroke="var(--text-1)" stroke-width="1.5"/>
      <text x="${W - R + 6}" y="${y(pts[pts.length - 1][1]) + 4}" font-size="12" font-weight="600" fill="var(--text-1)">${vzGanz(pts[pts.length - 1][1])}</text>
      ${Array.from({ length: 5 }, (_, i) => Math.round(i * DAUER / 4)).map(m => `<text x="${x(m)}" y="${H - 4}" text-anchor="${m === 0 ? 'start' : m === DAUER ? 'end' : 'middle'}" font-size="12" fill="var(--text-3)">${m}'</text>`).join('')}
      <text x="${L}" y="${T + 8}" font-size="11" fill="var(--text-3)">${esc(obenName)} führt</text><text x="${L}" y="${H - Bt - 4}" font-size="11" fill="var(--text-3)">${esc(untenName)} führt</text>
      ${ziele}</svg>`;
  }

  function verteilungSvg(p, basis, g) {
    const W = breite(), H = 150, T = 18, Bt = 22, von = W < 500 ? -7 : -9, bis = -von;
    const n = bis - von + 1, bw = W / n, s = sicht(g);
    const sd = modell.sigma;
    const pd = (d, m) => normCdf((d + .5 - m) / sd) - normCdf((d - .5 - m) / sd);
    let mx = 0; for (let d = von; d <= bis; d++) mx = Math.max(mx, pd(d, p.diff), pd(d, basis.diff));
    const hh = v => v / mx * (H - T - Bt);
    // x-Achse Heim links, Gast rechts: Differenz Gast minus Heim nach rechts
    let bars = '', huelle = '';
    for (let d = von; d <= bis; d++) {
      const xx = (d - von) * bw, diffHeim = -d;
      const heimGewinnt = diffHeim > 0, gastGewinnt = diffHeim < 0;
      const c = !s.dabei ? (heimGewinnt ? 'var(--neutral-heim)' : gastGewinnt ? 'var(--neutral-gast)' : 'var(--remis)')
        : (diffHeim === 0 ? 'var(--remis)' : (heimGewinnt === s.heim) ? 'var(--sieg)' : 'var(--niederlage)');
      const v = pd(diffHeim, p.diff), vb = pd(diffHeim, basis.diff);
      bars += `<rect x="${xx + bw * .18}" y="${H - Bt - hh(v)}" width="${bw * .64}" height="${hh(v)}" rx="1.5" fill="${c}"/>`;
      huelle += (d === von ? 'M' : 'L') + xx.toFixed(1) + ' ' + (H - Bt - hh(vb)).toFixed(1) + 'H' + (xx + bw).toFixed(1);
    }
    const achse = [-6, -3, 0, 3, 6].map(d => `<text x="${(d - von + .5) * bw}" y="${H - 4}" text-anchor="middle" font-size="12" fill="${d === 0 ? 'var(--text-2)' : 'var(--text-3)'}" font-weight="${d === 0 ? 600 : 400}">${d === 0 ? (SPORT.draws ? 'Remis' : 'Gleichstand') : '+' + Math.abs(d)}</text>`).join('');
    return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Verteilung der Tordifferenz"><text x="0" y="10" font-size="12" fill="var(--text-3)">${esc(kurz(g.heim))} gewinnt</text><text x="${W}" y="10" text-anchor="end" font-size="12" fill="var(--text-3)">${esc(kurz(g.gast))} gewinnt</text>${bars}<path d="${huelle}" fill="none" stroke="var(--text-1)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>${achse}</svg>`;
  }

  // ================= Start =================
  function auffaelligkeiten(id) {
    const t = B.teams[id], m = muster[id], kz = K[id], liste = [];
    const r = rang.indexOf(id) + 1, pl = platz(id);
    if (r - pl >= 2) liste.push(`Die Tabelle schmeichelt: Platz <b>${pl}</b>, nach Toren und Gegnern eher Platz <b>${r}</b>.`);
    if (pl - r >= 2) liste.push(`Stärker als der Tabellenplatz: Platz <b>${pl}</b>, nach Toren und Gegnern eher Platz <b>${r}</b>.`);
    if (t && t.liste.length) {
      const top = t.liste.slice().sort((a, b) => b.punkte - a.punkte || b.tore - a.tore)[0];
      liste.push(`<b>${esc(top.name)}</b> ist Topscorer: ${top.punkte} Punkte (${top.tore} Tore, ${top.assists} Assists) in ${top.anz} Spiel${top.anz > 1 ? 'en' : ''}.`);
    }
    if (kz && kz.spiele >= 2) {
      const d = kz.diffAbschnitt; const best = d.indexOf(Math.max(...d)), worst = d.indexOf(Math.min(...d));
      if (d[best] >= 0.7) liste.push(`Stärkste Phase: Minute ${SPORT.slotLabel(best)} bis ${SPORT.slotLabel(best + 1)}, im Schnitt <b>${vz(d[best])}</b> Tore pro Spiel.`);
      if (d[worst] <= -0.7) liste.push(`Schwächste Phase: Minute ${SPORT.slotLabel(worst)} bis ${SPORT.slotLabel(worst + 1)}, im Schnitt <b>${vz(d[worst])}</b> Tore pro Spiel.`);
    }
    if (m && m.n) {
      const h1 = m.hz1 / m.n, h2 = m.hz2 / m.n;
      if (Math.abs(h2 - h1) >= 0.7) liste.push(`Erste Spielhälfte im Schnitt <b>${vz(h1)}</b> Tore, zweite Hälfte <b>${vz(h2)}</b>.`);
      if (m.knapp) liste.push(`${m.knapp} Spiel${m.knapp > 1 ? 'e' : ''} mit höchstens zwei Toren Unterschied, davon ${m.knappGewonnen} gewonnen.`);
    }
    if (kz && kz.spiele) liste.push(`${dez(kz.zweiProSpiel)} Zeitstrafen pro Spiel, Ligaschnitt ${dez(LIGA.zweiProSpiel)}.`);
    if (kz && kz.zweiGegner >= 3) liste.push(`In Überzahl: <b>${kz.ppTore}</b> Tore aus ${kz.zweiGegner} Strafen des Gegners${kz.zwei ? `, in Unterzahl ${kz.ppGegen} Gegentore aus ${kz.zwei} eigenen Strafen` : ''}.`);
    return liste;
  }

  function seiteHeute() {
    const z = tabelle.find(x => x.id === fokus) || { pkt: 0, tp: 0, tm: 0, sp: 0 };
    const r = rang.indexOf(fokus) + 1, pl = platz(fokus), diff = z.tp - z.tm;
    const alter = (Date.now() - geholt) / 864e5;
    const alt = alter > 7 ? `<div class="hinweis">${ico('uhr')}<span>Die Daten sind ${Math.floor(alter)} Tage alt. ${location.protocol === 'file:' ? 'Für den aktuellen Stand die App über die Start-Datei neu öffnen.' : 'Neue Daten kommen, sobald sie eingespielt sind.'}</span></div>` : '';
    const intro = merk.get('intro', false) ? '' : `<section class="intro"><div class="bild" style="background-image:url('assets/keyvisual.jpg')"></div>
      <div>${wortmarke(26)}</div>
      <p><b style="color:var(--text-1)">${APP} rechnet aus Ergebnissen und Spielberichten von saisonmanager.de aus, wie die Chancen im nächsten Spiel stehen.</b> Die Zahlen sind Richtwerte aus wenigen Spielen, keine Gewissheit.</p>
      <p class="cap">${esc(ABSENDER)}</p>
      <div class="aktionen"><button class="btn prim" data-aktion="introWeg">Verstanden</button><button class="btn" data-bereich="methodik">Wie entsteht die Zahl?</button></div></section>`;
    const sim = simBasis.plaetze[fokus];
    const kach = `<div class="kacheln">
      ${kachel('Tabellenplatz', `${pl}.`, r === pl ? 'passt zu Toren und Gegnern' : `nach Toren und Gegnern eher ${r}.`)}
      ${kachel('Punkte', `${z.pkt}`, `aus ${z.sp || 0} Spielen`)}
      ${kachel('Tordifferenz', `${diff > 0 ? '+' : diff < 0 ? MINUS : ''}${Math.abs(diff)}`, `${stand(z.tp, z.tm)} Tore`)}
      ${kachel('Platz 1 am Saisonende', `${Math.round(sim[0] * 100)}<span class="pz">%</span>`, `unter die ersten 3: ${pct(sim[0] + sim[1] + sim[2])}`)}
    </div>`;
    const form = spieleVon(fokus).slice(-5).reverse();
    const letztes = form[0];
    let moment = '';
    if (letztes) {
      const e = ergebnisAus(letztes, fokus), geg = kurz(letztes.heim === fokus ? letztes.gast : letztes.heim), wo = letztes.heim === fokus ? 'gegen' : 'bei';
      const st = letztes.heim === fokus ? stand(letztes.toreHeim, letztes.toreGast) : stand(letztes.toreGast, letztes.toreHeim);
      moment = e === 'S' ? `Sieg ${wo} ${esc(geg)}, ${st}!` : e === 'U' ? `Remis ${wo} ${esc(geg)}, ${st}` : `${st} ${wo} ${esc(geg)}`;
    }
    const formHtml = form.length ? `${letztes ? `<p style="margin:0 0 12px">Zuletzt: <b>${moment}</b> <span class="t2">${tagLang(letztes.datum)}</span></p>` : ''}
      <div class="formreihe">${form.map((g, i) => { const geg = g.heim === fokus ? g.gast : g.heim; return `<button data-spiel="${g.id}">${i === 0 ? '<span class="micro" style="font-size:11px">zuletzt</span>' : '<span class="micro" style="font-size:11px;visibility:hidden">.</span>'}${formSun(g, fokus, true)}<span>${esc(kurz(geg).split(' ')[0])}</span><span class="t3">${g.heim === fokus ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)}</span></button>`; }).join('')}</div>
      <div class="legende-sun"><span>${'<span class="sun S" style="width:16px;height:16px;font-size:10px">S</span>'} Sieg</span><span><span class="sun U" style="width:16px;height:16px;font-size:10px">U</span> Remis</span><span><span class="sun N" style="width:16px;height:16px;font-size:10px">N</span> Niederlage</span></div>` : '<p class="meta">Noch keine Spiele.</p>';
    const ins = auffaelligkeiten(fokus);
    const pIdx = tabelle.findIndex(x => x.id === fokus), start = Math.max(0, Math.min(pIdx - 2, tabelle.length - 5)), mini = tabelle.slice(start, start + 5);
    const bald = offen.filter(g => !g.terminOffen).slice(0, 5);
    return `${seitenkopf(esc(kurz(fokus)), `Platz ${pl} · ${z.pkt} Punkte · ${esc(ligaName)}`)}${demoHinweis()}${alt}${intro}
      <div class="hero-raster">${tafel(fokus)}${kach}</div>
      ${aenderungKarte()}
      ${teamKarussell()}
      ${newsroom()}
      <div class="zwei-sp">${modul('Form', formHtml, { eyebrow: 'Letzte Spiele', aktion: `<button class="textaktion" data-kader="${fokus}">Kader</button>` })}
      ${modul('Auffälligkeiten', ins.slice(0, 4).map(x => `<div class="satz">${x}</div>`).join('') || '<p class="meta">Noch zu wenig Daten.</p>', { aktion: ins.length > 4 ? '<button class="textaktion" data-aktion="alleInsights">Alle</button>' : '', fuss: `Aus ${B.teams[fokus] ? B.teams[fokus].spiele.length : 0} Spielen mit Spielbericht.` })}</div>
      ${siegchanceVerlauf(fokus)}
      <div class="zwei-sp">${modul('Tabelle', tabelleHtml(mini, true), { aktion: '<button class="textaktion" data-bereich="tabelle">Ganze Tabelle</button>' })}
      ${modul('Nächste Spiele der Liga', `<div class="zeilen">${bald.map(g => spielZeile(g)).join('') || '<p class="meta">Keine terminierten Spiele.</p>'}</div>`, { aktion: '<button class="textaktion" data-aktion="alleSpiele">Alle</button>' })}</div>
      <div class="datenfuss">${esc(datenstand)}<br>${esc(ABSENDER)}</div>`;
  }

  // Solange noch kein API-Schlüssel da ist, zeigt die App erfundene Demodaten (scripts/demo.py) und sagt das deutlich.
  const demoHinweis = () => D.demo ? `<div class="hinweis demo">${ico('ausruf')}<span><b>Demodaten.</b> Gegner, Ergebnisse und Namen sind erfunden, bis der API-Schlüssel für saisonmanager.de eingetragen ist. Danach kommen die echten Daten der ${esc(ligaName)} automatisch.</span></div>` : '';

  // ================= Karussell „Get to know the team“ =================
  // Nur das eigene Team: Foto (mit Zustimmung), Nummer, Positionen und Satz (daten/profile.js, sonst Spruch aus den Toren). Läuft von selbst weiter,
  // hält bei Berührung, Maus oder Fokus an und bleibt bei „weniger Bewegung“ ganz stehen.
  function teamKarussell() {
    if (fokus !== UNSER || !B.teams[UNSER]) return '';
    const liste = B.teams[UNSER].liste.slice().sort((a, b) => a.nummer - b.nummer || a.name.localeCompare(b.name));
    if (!liste.length) return '';
    const karte = s => {
      const pos = positionen(s);
      return `<button class="kk${istRaus(s) ? ' raus' : ''}" data-spielerin="${esc(s.id)}" aria-label="${esc(s.name)}, Nummer ${s.nummer}">
        <span class="kk-bild">${ava(s, 96)}<span class="kk-nr">${s.nummer}</span></span>
        <span class="kk-name">${esc(s.name)}</span>
        ${pos.length ? `<span class="kk-pos">${pos.map((x, i) => i === 0 ? `<span class="etikett lieb">${ico('stern', 1)}${POS[x]}</span>` : etikett(POS[x], true)).join('')}</span>` : ''}
        ${satzVon(s) ? `<span class="kk-satz">„${esc(satzVon(s))}“</span>` : ''}
        <span class="kk-zahlen">${s.torwart ? `${s.anz} Spiele` : `${s.tore} Tore · ${s.assists} Assists`}</span>
        ${istRaus(s) ? '<span class="kk-amt" style="color:var(--text-2)">Diese Saison nicht dabei</span>' : ''}
        ${aemter(s).length ? `<span class="kk-amt">${aemter(s).map(esc).join(' · ')}</span>` : ''}
      </button>`;
    };
    const pfeile = `<span class="kk-pfeile"><button class="icobtn" data-karussell="-1" aria-label="Zurück"><span style="display:inline-block;transform:scaleX(-1)">${ico('chevr', 1)}</span></button><button class="icobtn" data-karussell="1" aria-label="Weiter">${ico('chevr', 1)}</button></span>`;
    return modul('Get to know the team', `<div class="karussell" id="karussell" tabindex="0" aria-label="Spieler von ${esc(kurz(UNSER))}">${liste.map(g => karte(g)).join('')}</div>`,
      { eyebrow: `${esc(kurz(UNSER))} · ${liste.length} Spieler`, aktion: pfeile, klasse: 'karussell-modul' });
  }
  let karussellUhr = null, karussellPause = 0;
  function karussellSchritt(r) {
    const el = $('#karussell'); if (!el) return;
    const k = el.querySelector('.kk'); if (!k) return;
    const w = k.getBoundingClientRect().width + 12;
    const ende = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (r > 0 && ende) el.scrollTo({ left: 0, behavior: 'smooth' });
    else if (r < 0 && el.scrollLeft <= 4) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    else el.scrollBy({ left: r * w, behavior: 'smooth' });
  }
  function karussellStart() {
    clearInterval(karussellUhr); karussellUhr = null;
    const el = $('#karussell'); if (!el) return;
    const halt = () => { karussellPause = Date.now() + 8000; };
    ['pointerdown', 'pointerenter', 'wheel', 'focusin', 'touchstart'].forEach(ev => el.addEventListener(ev, halt, { passive: true }));
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    karussellUhr = setInterval(() => {
      if (!document.body.contains(el)) { clearInterval(karussellUhr); karussellUhr = null; return; }
      if (document.hidden || Date.now() < karussellPause || (sheet && sheet.open)) return;
      karussellSchritt(1);
    }, 3500);
  }

  // ================= Gegner im Blick (für „Das Wichtigste“, Kabinenblatt, WhatsApp) =================
  // Topscorer, Überzahl, stärkste und schwächste Phase (je ein Drittel der Spielzeit), Form des Gegners.
  function gegnerWichtig(g, f) {
    const geg = g.heim === f ? g.gast : g.heim, t = Bmp.teams[geg], k = K[geg], z = [];
    const kn = n => { const x = n.split(' '); return x.length > 1 ? `${x[0]} ${x[x.length - 1]}` : n; };
    if (t && t.spiele.length) {
      const top = t.liste.filter(s => s.anz >= 1 && s.punkte > 0 && !s.torwart).sort((a, b) => b.punkteProSpiel - a.punkteProSpiel || b.tore - a.tore).slice(0, 3);
      if (top.length) z.push(['Topscorer', top.map(s => `#${s.nummer} ${kn(s.name)} (${s.tore}+${s.assists} in ${s.anz} Sp.)`).join(' · '), 3]);
    }
    if (k && k.zweiGegner >= 3) z.push(['Überzahl', `${k.ppTore} Tore aus ${k.zweiGegner} Strafen des Gegners (${pct(k.ppTore / k.zweiGegner)}, Liga ${pct(LIGA.ppQuote)})${k.ppTore / k.zweiGegner > LIGA.ppQuote + 0.05 ? ' – Strafen vermeiden' : ''}`, k.ppTore / k.zweiGegner > LIGA.ppQuote + 0.05 ? 2 : 0]);
    if (k && k.spiele >= 1 && Array.isArray(k.tore)) {
      const fenster = [0, 1, 2, 3, 4].map(i => ({ i, d: (k.tore[i] + k.tore[i + 1] - k.gegen[i] - k.gegen[i + 1]) / k.spiele }));
      const best = fenster.slice().sort((a, b) => b.d - a.d)[0], worst = fenster.slice().sort((a, b) => a.d - b.d)[0];
      const vz1 = x => `${x > 0 ? '+' : x < 0 ? MINUS : ''}${dez(Math.abs(x))}`;
      if (best && best.d > 0.3) z.push(['Stärkste Phase', `Minute ${SPORT.slotLabel(best.i)} bis ${SPORT.slotLabel(best.i + 2)} (im Schnitt ${vz1(best.d)} Tore) – hier dagegenhalten`, 1 + best.d]);
      if (worst && worst.d < -0.3) z.push(['Schwächste Phase', `Minute ${SPORT.slotLabel(worst.i)} bis ${SPORT.slotLabel(worst.i + 2)} (im Schnitt ${vz1(worst.d)} Tore) – hier zuschlagen`, 1 - worst.d]);
    }
    const form = spieleVon(geg).slice(-3).reverse();
    if (form.length) z.push(['Form', form.map(x => { const e = ergebnisAus(x, geg), w = x.heim === geg ? x.toreHeim : x.toreGast, s2 = x.heim === geg ? x.toreGast : x.toreHeim; return `${e === 'S' ? 'Sieg' : e === 'U' ? 'Remis' : 'Niederlage'} ${w}:${s2} ${x.heim === geg ? 'gegen' : 'bei'} ${kurz(x.heim === geg ? x.gast : x.heim)}`; }).join(' · '), 0]);
    return z.map(([k2, v2, gewicht]) => [`${kurz(geg)}: ${k2}`, v2, gewicht, k2]);
  }

  // Der eine Tipp für die WhatsApp-Nachricht: der wichtigste Hinweis zum Gegner als ein Satz
  function tippFuer(g, f) {
    const geg = g.heim === f ? g.gast : g.heim, w = gegnerWichtig(g, f).filter(x => x[2] > 0).sort((a, b) => b[2] - a[2])[0];
    const t = Bmp.teams[geg], top = t ? t.liste.filter(s => !s.torwart && s.punkte > 0).sort((a, b) => b.punkteProSpiel - a.punkteProSpiel)[0] : null;
    if (w && w[3] === 'Schwächste Phase') return `${kurz(geg)} schwächelt ${w[1].split(' (')[0].replace('Minute', 'zwischen Minute').replace(' bis ', ' und ')} – genau da Druck machen!`;
    if (w && w[3] === 'Stärkste Phase') return `${kurz(geg)} ist ${w[1].split(' (')[0].replace('Minute', 'zwischen Minute').replace(' bis ', ' und ')} am stärksten – da hinten dicht bleiben.`;
    if (w && w[3] === 'Überzahl') return `${kurz(geg)} ist in Überzahl gefährlich – keine unnötigen Strafen!`;
    if (top) return `Auf #${top.nummer} ${top.name.split(' ')[0]} aufpassen: ${top.tore} Tore und ${top.assists} Assists in ${top.anz} Spiel${top.anz === 1 ? '' : 'en'}.`;
    return 'Kompakt stehen, schnell umschalten, Spaß haben!';
  }

  // ================= WhatsApp-Nachricht =================
  // Kurzer Text fürs Team zum nächsten Spiel mit genau einem Tipp. Automatisch in eine Gruppe schreiben erlaubt WhatsApp
  // nicht, deshalb öffnet ein Knopf WhatsApp mit dem fertigen Text (wa.me), Empfänger und Senden wählt man selbst.
  const APP_URL = /^https?:/.test(location.protocol) ? location.href.split('#')[0] : 'https://kattaschnay.github.io/Broilers/app/index.html';
  function whatsappText() {
    const g = naechstes(UNSER); if (!g) return '';
    const heim = g.heim === UNSER, geg = heim ? g.gast : g.heim;
    const mp = matchplanFuer(g, UNSER);
    const r = drei(mp.basis.s, mp.basis.u, mp.basis.n);
    const z = [];
    z.push(`🐓🏒 *${kurz(UNSER)} ${heim ? 'gegen' : 'gegen'} ${kurz(geg)}*`);
    z.push(`📅 ${g.terminOffen ? 'Termin noch offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr`}`);
    if (g.halle) z.push(`📍 ${normalisiere(g.halle)}${g.adresse ? `, ${g.adresse}` : ''}`);
    if (g.halle) z.push(`🗺️ https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.halle + (g.adresse ? ', ' + g.adresse : ''))}`);
    z.push(`📊 Siegchance ${r[0]} % · ${REMIS} ${r[1]} % · Niederlage ${r[2]} %`);
    z.push('');
    z.push(`💡 *Tipp:* ${tippFuer(g, UNSER)}`);
    z.push(''); z.push(`👉 Matchplan: ${APP_URL}#matchplan`);
    return z.join('\n');
  }
  const whatsappLink = () => { const t = whatsappText(); return t ? `https://wa.me/?text=${encodeURIComponent(t)}` : ''; };
  function whatsappSheet() {
    const t = whatsappText();
    if (!t) return oeffneSheet('Nachricht fürs Team', `<div class="leer">${ico('plan')}<b>Kein offenes Spiel</b><p>Für ${esc(kurz(UNSER))} steht kein Spiel mehr an.</p></div>`);
    oeffneSheet('Nachricht fürs Team', `<p class="meta" style="margin:0 0 12px">Tippe auf „In WhatsApp öffnen“, wähle die Teamgruppe und sende ab.</p>
      <pre class="wa-vorschau">${esc(t)}</pre>
      <div style="display:grid;gap:8px;margin-top:12px"><a class="btn prim wa-knopf" href="${whatsappLink()}" target="_blank" rel="noopener">${ico('teilen', 1)} In WhatsApp öffnen</a>
      <button class="btn" data-aktion="waKopieren">Text kopieren</button></div>`);
  }

  // ================= Karte „Was sich geändert hat“ =================
  const aendSeit = () => { const t = window.HB_AENDERUNG && window.HB_AENDERUNG.seit ? new Date(window.HB_AENDERUNG.seit) : geholt; return `${t.toLocaleDateString('de-DE')}, ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`; };
  const aendIco = () => `<span class="ausruf" role="img" aria-label="Neu">${ico('ausruf')}</span>`;
  function aenderungKarte() {
    const a = AEND; if (!a || fokus !== UNSER) return '';
    const relevant = a.chancen.filter(x => Math.abs(x.d) >= 1);
    const zeitraum = a.von.getTime() === a.bis.getTime() ? tagLang(a.bis) : `${tagKurz(a.von)} bis ${tagKurz(a.bis)}`;
    return modul(`${aendIco()}Was sich geändert hat`, `<div class="aend">
        <div class="aend-block"><span class="micro">Neue Ergebnisse</span><ul>${a.neu.map(g => `<li><button class="aend-spiel" data-spiel="${g.id}">${esc(ergebnisSatz(g))}</button></li>`).join('')}</ul></div>
        ${a.neu.filter(g => g.gewertet && (g.heim === UNSER || g.gast === UNSER)).map(g => `<div class="aend-block"><span class="micro">Euer Ergebnis-Bild</span><button class="btn prim wa-knopf" data-spiel="${g.id}">${ico('teilen', 1)} Bild ansehen und teilen</button></div>`).join('')}
        <div class="aend-block"><span class="micro">Tabelle</span><p>${esc(platzSatz(a))}</p></div>
        ${a.chancen.length ? `<div class="aend-block"><span class="micro">Eure Siegchancen</span><ul>${(relevant.length ? relevant : a.chancen.slice(0, 1)).map(x => `<li>${chanceSatz(x)}</li>`).join('')}</ul>${relevant.length ? '' : '<p class="cap" style="margin:4px 0 0">Die neuen Ergebnisse ändern an euren Chancen kaum etwas.</p>'}</div>` : ''}
      </div>`, { eyebrow: `Aktualisiert am ${aendSeit()} · Spiele vom ${zeitraum}`, klasse: 'aend-modul', fuss: 'Verglichen mit dem Stand vor diesen Ergebnissen. Die Teamstärken werden aus allen Ergebnissen neu geschätzt, deshalb verschieben auch fremde Spiele eure Chancen.' });
  }

  // ================= Ergebnis-Bild (app/ergebnisbild.js) =================
  // Auf den Social-Bildern steht unten die Halle des Spiels; das eigene Wappen kommt aus daten/logos
  const VEREIN = 'Berlin Broilers 04 e. V.';
  const MANNSCHAFT = 'Herren Kleinfeld';
  const SPRUECHE = {
    siegKnapp: ['Knapp ist auch gewonnen.', 'Nerven aus Stahl, Punkte im Sack.', 'Bis zur letzten Sekunde – und dann gejubelt.', 'Ein Tor reicht, wenn es das richtige ist.'],
    sieg: ['Heute gab’s Broiler – knusprig und siegreich.', 'Gemeinsam gekämpft, gemeinsam gewonnen.', 'So sieht Broilers-Floorball aus.'],
    siegHoch: ['Ein Spiel zum Einrahmen.', 'Volle Kraft, volle Punkte.', 'Das war eine Ansage aus Lankwitz.'],
    remis: ['Geteilte Punkte, volle Leidenschaft.', 'Ein Punkt Moral.', 'Unentschieden – aber nicht unverdient.'],
    niederlageKnapp: ['Ein Tor fehlt, der Kampf nicht.', 'So nah dran – nächstes Mal gehört das Spiel uns.', 'Kopf hoch, weiter geht’s.'],
    niederlage: ['Abhaken, trainieren, zurückschlagen.', 'Nicht unser Tag – aber unser Team.', 'Aus Niederlagen lernt man. Wir lernen schnell.'],
    heim: ['Heimspiel! Kommt vorbei und macht Lärm.', 'Unsere Halle, unser Spiel.', 'Lankwitz wird laut – seid dabei!'],
    auswaerts: ['Auswärts – wir holen uns die Punkte.', 'Fremde Halle, gleiche Leidenschaft.', 'Kommt mit, wir brauchen jede Stimme!'],
  };
  function spruchFuer(g) {
    if (!g.gewertet) { const l = SPRUECHE[g.heim === UNSER ? 'heim' : 'auswaerts']; return l[Math.abs(Number(g.id)) % l.length]; }
    const eig = g.heim === UNSER ? g.toreHeim - g.toreGast : g.toreGast - g.toreHeim;
    const k = eig > 0 ? (eig <= 1 || g.verl ? 'siegKnapp' : eig >= 6 ? 'siegHoch' : 'sieg') : eig === 0 ? 'remis' : (eig >= -1 || g.verl ? 'niederlageKnapp' : 'niederlage');
    const l = SPRUECHE[k]; return l[Math.abs(Number(g.id)) % l.length];
  }
  const saisonVon = d => { const j = d.getUTCFullYear(); return d.getUTCMonth() >= 6 ? `${j}/${String(j + 1).slice(2)}` : `${j - 1}/${String(j).slice(2)}`; };
  const TEAMFOTO = FOTOS.team ? `../daten/fotos/team.jpg?u=${encodeURIComponent(FOTOS.team)}` : null; // Mannschaftsfoto, nur mit Zustimmung
  const bildTeam = id => ({ name: lang(id), kurz: kurz(id), logo: logoLokal(id), mono: teams[id] ? teams[id].mono : '?' });
  function ergebnisDaten(g) {
    if (!g.gewertet) return matchdayDaten(g);
    const eigen = g.heim === UNSER ? 'heim' : g.gast === UNSER ? 'gast' : null;
    const eig = eigen === 'heim' ? g.toreHeim - g.toreGast : g.toreGast - g.toreHeim;
    const v = B.verlaeufe[g.id];
    return {
      art: 'ergebnis', heim: bildTeam(g.heim), gast: bildTeam(g.gast), toreHeim: g.toreHeim, toreGast: g.toreGast, zusatz: g.zusatz,
      perioden: v ? periodenText(v) : '', runde: g.runde, saison: saisonVon(g.datum), liga: ligaName, mannschaft: MANNSCHAFT,
      datumLang: `${tagLang(g.datum)} ${g.datum.getUTCFullYear()}`, halle: g.halle ? normalisiere(g.halle) : '', verein: VEREIN,
      foto: TEAMFOTO, eigenSeite: eigen, etikett: !eigen ? '' : eig > 0 ? 'SIEG' : eig === 0 ? 'REMIS' : 'NIEDERLAGE', spruch: eigen ? spruchFuer(g) : '',
    };
  }
  const BILDFORMATE = [['feed', 'Feed 4:5'], ['quadrat', 'Quadrat 1:1'], ['story', 'Story 9:16']];
  let bildFormat = 'feed';
  function matchdayDaten(g) {
    return {
      art: 'matchday', heim: bildTeam(g.heim), gast: bildTeam(g.gast), runde: g.runde, saison: saisonVon(g.datum), liga: ligaName, mannschaft: MANNSCHAFT,
      tag: g.terminOffen ? null : String(g.datum.getUTCDate()), monat: g.terminOffen ? null : ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][g.datum.getUTCMonth()],
      datumLang: g.terminOffen ? 'Termin folgt' : `${tagLang(g.datum)} ${g.datum.getUTCFullYear()}`, zeit: g.terminOffen ? null : zeit(g.datum),
      halle: g.halle ? normalisiere(g.halle) : '', adresse: g.adresse || '', verein: VEREIN, foto: TEAMFOTO, eigenSeite: g.heim === UNSER ? 'heim' : g.gast === UNSER ? 'gast' : null,
      spruch: spruchFuer(g),
    };
  }
  // ================= Spielbericht für Instagram =================
  // Aus der Torfolge (B.verlaeufe) und den Strafen: Start, größte Führungen, Läufe, Pausenstände, Aufholjagden,
  // Überzahl, Schlussphase, Verlängerung. Mit Namen der eigenen Torschützen und des Torhüters (gegnerische Spieler
  // bleiben ohne Namen). Aus Sicht des eigenen Teams („wir“).
  function spielberichtText(g) {
    if (!g || !g.gewertet || (g.heim !== UNSER && g.gast !== UNSER)) return '';
    const heim = g.heim === UNSER, geg = kurz(heim ? g.gast : g.heim);
    const wir = heim ? g.toreHeim : g.toreGast, sie = heim ? g.toreGast : g.toreHeim, diff = wir - sie;
    const st = (a, b) => `${a}:${b}`;
    const v = B.verlaeufe[g.id];
    const zahl = n => ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn'][n] || String(n);
    const toreW = n => `${zahl(n)} Tor${n === 1 ? '' : 'e'}`, toreD = n => `${zahl(n)} Tor${n === 1 ? '' : 'en'}`;
    const zeilen = [];
    const kopf = diff > 0 ? (heim ? '💪 Sieg!' : `💪 Sieg gegen ${geg}!`) : diff === 0 ? `🤝 Unentschieden gegen ${geg}` : `Niederlage gegen ${geg}`;
    zeilen.push(kopf + (g.zusatz ? ` (${g.zusatz === 'n. PS' ? 'nach Penaltyschießen' : 'nach Verlängerung'})` : ''));
    zeilen.push(`🏒 ${lang(g.heim)} – ${lang(g.gast)} ${g.toreHeim}:${g.toreGast}${g.zusatz ? ' ' + g.zusatz : ''}${v ? ` (${v.perioden.map((p, i) => i === 0 ? st(p.heim, p.gast) : st(p.heim - v.perioden[i - 1].heim, p.gast - v.perioden[i - 1].gast)).join(', ')})` : ''}`);
    zeilen.push('');
    if (v && v.tore.length > 3) {
      const T = v.tore.map(t => ({ min: t.min, per: t.per, staerke: t.staerke, unser: t.team === UNSER, name: t.team === UNSER ? t.name : '', w: heim ? t.heim : t.gast, s: heim ? t.gast : t.heim })).map(t => Object.assign(t, { d: t.w - t.s }));
      const bis = m => { let x = { w: 0, s: 0, d: 0 }; T.forEach(t => { if (t.min <= m) x = t; }); return x; };
      const pause = SPORT.periodMin, START = Math.max(5, Math.round(DAUER / 8)), ENDE = DAUER - Math.max(3, Math.round(DAUER / 10));
      const ev = []; // [Minute, Satz], am Ende chronologisch sortiert
      const z0 = bis(START);
      if (Math.abs(z0.d) <= 1) ev.push([START, `Ausgeglichener Start: Nach ${zahl(START)} Minuten stand es ${st(z0.w, z0.s)}.`]);
      else if (z0.d > 1) ev.push([START, `Wir sind hellwach gestartet und lagen nach ${zahl(START)} Minuten mit ${st(z0.w, z0.s)} vorn. 🔥`]);
      else ev.push([START, `${geg} erwischte den besseren Start, nach ${zahl(START)} Minuten stand es ${st(z0.w, z0.s)}.`]);
      const p1 = T.filter(t => t.per === 1);
      const m1 = p1.reduce((a, t) => t.d > a.d ? t : a, { d: 0 }), n1 = p1.reduce((a, t) => t.d < a.d ? t : a, { d: 0 });
      if (m1.d >= 3 && m1.d > z0.d) ev.push([m1.min, `Bis zur ${m1.min}. Minute konnten wir uns auf ${toreW(m1.d)} absetzen (${st(m1.w, m1.s)}).`]);
      if (n1.d <= -3 && n1.d < z0.d) ev.push([n1.min, `${geg} zog in der ${n1.min}. Minute auf ${toreW(-n1.d)} davon (${st(n1.w, n1.s)}).`]);
      // Läufe: längste Serie eines Teams, ab drei Toren
      let lauf = { n: 0 }, cur = { n: 0 };
      T.forEach((t, i) => { const prev = i ? T[i - 1] : { w: 0, s: 0 }; const wer = t.unser ? 'w' : 's';
        if (cur.wer === wer) { cur.n++; cur.bis = t; } else cur = { wer, n: 1, von: prev, bis: t, start: t.min };
        if (cur.n > lauf.n) lauf = Object.assign({}, cur); });
      if (lauf.n >= 3 && lauf.start > START) {
        const vorher = lauf.von.w - lauf.von.s;
        const laufNamen = lauf.wer === 'w' ? [...new Set(T.filter(t => t.unser && t.min >= lauf.start && t.min <= lauf.bis.min).map(t => t.name).filter(Boolean))] : [];
        const mit = laufNamen.length ? ` (Tore: ${laufNamen.join(', ')})` : '';
        ev.push([lauf.start, lauf.wer === 'w'
          ? (vorher < 0 ? `Mit einem ${lauf.n}:0-Lauf ab der ${lauf.start}. Minute haben wir uns zurückgekämpft${mit}. 🚀` : `Mit einem ${lauf.n}:0-Lauf ab der ${lauf.start}. Minute haben wir uns abgesetzt${mit}. 🚀`)
          : (vorher > 0 ? `Mit einem ${lauf.n}:0-Lauf ab der ${lauf.start}. Minute kam ${geg} zurück.` : `Ein ${lauf.n}:0-Lauf von ${geg} ab der ${lauf.start}. Minute hat uns wehgetan.`)]);
      }
      // Pausenstände
      v.perioden.slice(0, -1).forEach((p, i) => {
        const pw = heim ? p.heim : p.gast, ps = heim ? p.gast : p.heim, m = (i + 1) * pause, wann = SPORT.periods === 2 ? 'Zur Pause' : `Nach dem ${i + 1}. Drittel`;
        ev.push([m, pw > ps ? `${wann} führten wir mit ${st(pw, ps)}.` : pw < ps ? `${wann} lagen wir mit ${st(pw, ps)} hinten.` : `${wann} stand es ${st(pw, ps)} – alles offen.`]);
      });
      // Ausgleich oder Wende nach der ersten Pause, dann ab wann der Sieger dauerhaft vorn lag
      const p0 = v.perioden[0], start2 = heim ? p0.heim - p0.gast : p0.gast - p0.heim;
      const ausgl = T.filter(t => t.per > 1).find(t => (start2 > 0 && t.d <= 0) || (start2 < 0 && t.d >= 0));
      if (ausgl && start2 > 0) ev.push([ausgl.min, `Danach kämpfte sich ${geg} heran und ${ausgl.d === 0 ? `glich in der ${ausgl.min}. Minute zum ${st(ausgl.w, ausgl.s)} aus` : `drehte in der ${ausgl.min}. Minute das Spiel (${st(ausgl.w, ausgl.s)})`}.`]);
      else if (ausgl && start2 < 0) ev.push([ausgl.min, `Danach kamen wir zurück und ${ausgl.d === 0 ? `glichen in der ${ausgl.min}. Minute zum ${st(ausgl.w, ausgl.s)} aus` : `drehten in der ${ausgl.min}. Minute das Spiel (${st(ausgl.w, ausgl.s)})`}. 💥`]);
      const dR = (heim ? v.regulaer.heim - v.regulaer.gast : v.regulaer.gast - v.regulaer.heim);
      if (dR !== 0) {
        let ab = null; for (let i = T.length - 1; i >= 0; i--) { if ((dR > 0 && T[i].d <= 0) || (dR < 0 && T[i].d >= 0)) { ab = T[i + 1]; break; } }
        if (ab && ab.per > 1) ev.push([ab.min + 0.5, dR > 0 ? `${ab.name ? `${ab.name} traf in der ${ab.min}. Minute zum ${st(ab.w, ab.s)}` : `Ab der ${ab.min}. Minute (${st(ab.w, ab.s)}) lagen wir vorn`} – die Führung gaben wir nicht mehr her.` : `Ab der ${ab.min}. Minute (${st(ab.w, ab.s)}) lag ${geg} vorn und gab die Führung nicht mehr her.`]);
      }
      // Auszeiten und Matchstrafen, ohne Namen
      const ev2 = (DETAILS[g.id] && DETAILS[g.id].e && DETAILS[g.id].e.data) || [];
      ev2.filter(e => e.event_type && e.event_type.id === 30 && !e.overtime).forEach(e => {
        const m = e.global_minute || 0, unsere = e.is_home === heim, vor = bis(m), nach = bis(m + 4), w4 = nach.w - vor.w, s4 = nach.s - vor.s;
        if (unsere && w4 - s4 >= 2) ev.push([m + 0.2, `Nach unserer Auszeit in der ${m}. Minute (${st(vor.w, vor.s)}) drehten wir auf: ${st(w4, s4)} in den folgenden Minuten. ⏱️`]);
        else if (unsere && m >= ENDE - 3 && Math.abs(vor.d) <= 1 && diff > 0) ev.push([m + 0.2, `Unsere Auszeit beim ${st(vor.w, vor.s)} (${m}.) saß: Danach haben wir die Nerven behalten. ⏱️`]);
      });
      ev2.filter(e => e.event_type && e.event_type.id === 8).forEach(e => { const m = e.global_minute || 0; ev.push([m + 0.1, e.is_home === heim ? `In der ${m}. Minute mussten wir nach einer Matchstrafe mit einem Spieler weniger auskommen.` : `${geg} musste ab der ${m}. Minute nach einer Matchstrafe auf einen Spieler verzichten.`]); });
      const zE = bis(ENDE);
      if (Math.abs(zE.d) <= 1 && !(ausgl && ausgl.min >= ENDE - 2)) ev.push([ENDE, `${zahl(DAUER - ENDE).replace(/^./, c => c.toUpperCase())} Minuten vor Schluss stand es ${st(zE.w, zE.s)} – Spannung bis zum Ende! 😮‍💨`]);
      if (g.zusatz) ev.push([DAUER + 1, g.zusatz === 'n. PS' ? `Nach ${st(v.regulaer.heim, v.regulaer.gast)} in der regulären Spielzeit musste das Penaltyschießen entscheiden${diff > 0 ? ' – und wir behielten die Nerven! 🎯' : '.'}` : `Nach ${st(heim ? v.regulaer.heim : v.regulaer.gast, heim ? v.regulaer.gast : v.regulaer.heim)} ging es in die Verlängerung${diff > 0 ? ' – und dort machten wir den Deckel drauf! 🔥' : '.'}`]);
      zeilen.push(ev.sort((x, y) => x[0] - y[0]).map(x => x[1]).join(' '));
      zeilen.push('');
    }
    // Von Hand ergänzter Absatz (daten/berichte.js), z. B. Einordnung des Spiels
    const eigen = (window.HB_BERICHTE || {})[g.id];
    if (eigen && eigen.einschub) { zeilen.push(eigen.einschub.trim()); zeilen.push(''); }
    const L = DETAILS[g.id] && DETAILS[g.id].l && DETAILS[g.id].l.data;
    const E = (DETAILS[g.id] && DETAILS[g.id].e && DETAILS[g.id].e.data) || [];
    if (L) {
      const seite = k => ((L[k] || {}).players || []).filter(p => !p.is_staff);
      const uns = seite(heim ? 'local' : 'visitor'), die = seite(heim ? 'visitor' : 'local');
      const summe = (l, f) => l.reduce((a, p) => a + (p[f] || 0), 0);
      const zw = summe(uns, 'two_minutes'), zg = summe(die, 'two_minutes'), pw = summe(uns, 'pim'), pg = summe(die, 'pim');
      const schuetz = uns.filter(p => p.goals > 0).length, vorlagen = summe(uns, 'assists');
      const ppW = E.filter(e => e.event_type.is_goal && e.is_home === heim && e.staerke === 'ueberzahl').length;
      const ppS = E.filter(e => e.event_type.is_goal && e.is_home !== heim && e.staerke === 'ueberzahl').length;
      const shW = E.filter(e => e.event_type.is_goal && e.is_home === heim && e.staerke === 'unterzahl').length;
      const saetze = [];
      if (ppW >= 2) saetze.push(`In Überzahl waren wir eiskalt: ${toreW(ppW)} mit einem Mann mehr. 🎯`);
      if (shW) saetze.push(`Sogar in Unterzahl trafen wir ${shW === 1 ? 'einmal' : zahl(shW) + '-mal'}! 🦾`);
      if (zg >= 2 && ppS === 0 && zw >= 2) saetze.push(`Alle ${zw} Unterzahlsituationen haben wir ohne Gegentor überstanden. 🧱`);
      if (schuetz >= 5) saetze.push(`${schuetz} verschiedene Torschützen – das war echte Teamleistung! 🙌`);
      if (vorlagen >= 5 && vorlagen >= wir * 0.6) saetze.push(`${vorlagen} Assists bei ${wir} Toren: Wir haben uns die Tore herausgespielt.`);
      if (zw + zg && Math.abs(zw - zg) >= 2 && !(eigen && eigen.einschub)) saetze.push(zw < zg ? `Diszipliniert: nur ${zw} Strafe${zw === 1 ? '' : 'n'} gegen uns, ${zg} gegen ${geg}.` : `Mit ${zw} Strafen machten wir es uns selbst schwer.`);
      if (saetze.length) { zeilen.push(saetze.join(' ')); zeilen.push(''); }
      // Namen: Torschützen mit Toren und Assists, Torhüter
      const nm = p => `${p.player.first_name} ${p.player.last_name}`.trim();
      const scorer = uns.filter(p => p.goals || p.assists).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
      if (scorer.length) zeilen.push(`🎯 Scorer: ${scorer.map(p => `${nm(p)} ${p.goals ? `${p.goals} Tor${p.goals > 1 ? 'e' : ''}` : ''}${p.goals && p.assists ? ' + ' : ''}${p.assists ? `${p.assists} Assist${p.assists > 1 ? 's' : ''}` : ''}`).join(', ')}`);
      const keeper = uns.some(p => p.starting_goalkeeper) ? uns.filter(p => p.starting_goalkeeper) : uns.filter(p => p.is_goalkeeper);
      if (keeper.length) zeilen.push(`🧤 Im Tor: ${keeper.map(nm).join(' und ')}`);
      if (scorer.length || keeper.length) zeilen.push('');
      zeilen.push('📊 Zahlen zum Spiel');
      if (v) zeilen.push(`• ${SPORT.periods === 2 ? 'Halbzeiten' : 'Drittel'}: ${v.perioden.map((p, i) => { const a = heim ? p.heim : p.gast, b = heim ? p.gast : p.heim, pa = i ? (heim ? v.perioden[i - 1].heim : v.perioden[i - 1].gast) : 0, pb = i ? (heim ? v.perioden[i - 1].gast : v.perioden[i - 1].heim) : 0; return st(a - pa, b - pb); }).join(' | ')}`);
      zeilen.push(`• Torschützen: ${schuetz} · Assists: ${vorlagen}`);
      zeilen.push(`• Überzahltore: ${ppW} (${geg}: ${ppS})`);
      zeilen.push(`• Strafminuten: ${pw} (${geg}: ${pg})`);
      zeilen.push('');
    }
    zeilen.push(diff > 0 ? `Am Ende steht ein ${st(wir, sie)} – die Punkte gehen nach Lankwitz! 🎉${diff <= 1 ? ' Nervenstark, Jungs!' : ''}` : diff === 0 ? `Am Ende ein ${st(wir, sie)} – ein Punkt, den wir mitnehmen.` : `Am Ende ${st(wir, sie)}. Kopf hoch – wir haben gezeigt, was in uns steckt! 💪`);
    const n = offen.find(x => x.heim === UNSER || x.gast === UNSER);
    if (n) zeilen.push(`📅 Nächstes Spiel: ${n.terminOffen ? 'Termin folgt' : `${tagLang(n.datum)}, ${zeit(n.datum)} Uhr`} gegen ${kurz(n.heim === UNSER ? n.gast : n.heim)}${n.halle ? ` (${normalisiere(n.halle)})` : ''}. Kommt vorbei! 📣`);
    zeilen.push('');
    zeilen.push('#BerlinBroilers #Broilers04 #Floorball #FloorballBerlin #Unihockey #Verbandsliga');
    return zeilen.join('\n');
  }
  const berichtHtml = g => { const t = spielberichtText(g); return t ? `<details class="bericht"><summary>Spielbericht für Instagram</summary><pre class="wa-vorschau">${esc(t)}</pre><button class="btn" data-aktion="berichtKopieren" data-spiel-id="${g.id}" style="width:100%;margin-top:8px">Text kopieren</button></details>` : ''; };

  const bildObj = id => spielNach[id];
  const bildName = g => `${g.gewertet ? 'endstand' : 'gameday'}-${kurz(g.heim)}-${kurz(g.gast)}-${g.datum.toISOString().slice(0, 10)}-${bildFormat}.png`.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9.-]+/g, '-');
  let bildCache = {};
  function ergebnisBildFuer(g) {
    const k = `${g.id}:${bildFormat}`;
    if (!bildCache[k]) bildCache[k] = window.ergebnisBildBlob ? window.ergebnisBildBlob(ergebnisDaten(g), bildFormat) : Promise.resolve(null);
    return bildCache[k];
  }
  const formatWahl = () => `<div class="seg ebild-format">${BILDFORMATE.map(([k, l]) => `<button data-aktion="bildFormat" data-format="${k}" class="${bildFormat === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
  const ergebnisBildHtml = (g, ohneFormat) => `<div class="ebild" data-ebild="${g.id}">${ohneFormat ? '' : formatWahl()}<div class="ebild-vorschau f-${bildFormat}"><span class="cap t2">Bild wird erstellt …</span></div>
      <div class="ebild-knoepfe"><button class="btn prim wa-knopf" data-aktion="bildTeilen" data-spiel-id="${g.id}">${ico('teilen', 1)} Bild teilen</button><button class="btn" data-aktion="bildSpeichern" data-spiel-id="${g.id}">Speichern</button></div></div>`;
  function ergebnisBildZeigen() {
    $$('[data-ebild]').forEach(el => {
      const g = bildObj(el.dataset.ebild); if (!g) return;
      const zu = el.closest('details:not([open])'); if (zu) return;
      ergebnisBildFuer(g).then(blob => {
        const v = el.querySelector('.ebild-vorschau'); if (!v) return;
        v.className = `ebild-vorschau f-${bildFormat}`;
        v.innerHTML = blob ? `<img src="${URL.createObjectURL(blob)}" alt="${g.gewertet ? 'Endstand' : 'Game-Day'}-Bild ${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}">` : '<span class="cap t2">Bild konnte nicht erstellt werden.</span>';
      });
    });
  }
  async function bildTeilen(g, knopf) {
    const blob = await ergebnisBildFuer(g); if (!blob) return;
    const datei = new File([blob], bildName(g), { type: 'image/png' });
    const text = g.gewertet ? `${kurz(g.heim)} ${g.toreHeim}:${g.toreGast}${g.zusatz ? ' ' + g.zusatz : ''} ${kurz(g.gast)} · ${spruchFuer(g)}` : `Game Day: ${kurz(g.heim)} gegen ${kurz(g.gast)} · ${g.terminOffen ? 'Termin folgt' : `${tagLang(g.datum)}, ${zeit(g.datum)} Uhr`}`;
    if (navigator.canShare && navigator.canShare({ files: [datei] })) { try { await navigator.share({ files: [datei], text }); } catch (e) {} return; }
    bildSpeichern(g, knopf);
  }
  async function bildSpeichern(g) {
    const blob = await ergebnisBildFuer(g); if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = bildName(g);
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ================= Social & Assets =================
  // Alles zum Teilen an einem Ort: Ergebnis-Bilder, Nachricht fürs Team, Team-Song, Instagram.
  function seiteSocial() {
    const kopf = seitenkopf('Social & Assets', `${esc(kurz(UNSER))} · Game-Day- und Endstand-Bilder, Spielberichte und Nachrichten zum Teilen`);
    const meine = spiele.filter(g => g.heim === UNSER || g.gast === UNSER);
    const kommend = meine.filter(g => g.offen), gespielt = meine.filter(g => g.gewertet).slice().reverse();
    const naechstes = kommend[0];
    const titelVon = g => `${g.terminOffen ? 'Termin folgt' : tagKurz(g.datum)} · gegen ${esc(kurz(g.heim === UNSER ? g.gast : g.heim))}${g.gewertet ? ` · ${g.heim === UNSER ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)}${g.zusatz ? ' ' + g.zusatz : ''}` : ''}`;
    // Am Handy als aufklappbare Zeile (nur das nächste Spiel offen), am Computer immer offen
    const mobil = window.innerWidth < 600;
    const karte = (g, offen) => `<details class="ebild-karte"${!mobil || offen ? ' open' : ''}><summary class="ebild-titel">${g.gewertet ? `<span class="sun ${ergebnisAus(g, UNSER)}">${ergebnisAus(g, UNSER)}</span>` : `<span class="md-punkt">${ico('kalender', 1)}</span>`}<span>${titelVon(g)}</span>${mobil ? ico('chev', 1) : ''}</summary>${ergebnisBildHtml(g, true)}${g.gewertet ? berichtHtml(g) : ''}</details>`;
    const leiste = `<div class="social-leiste"><span class="cap t2">Format für alle Bilder</span>${formatWahl()}</div>`;
    const t = whatsappText();
    const nachricht = t ? `<div><div class="ebild-titel">Nachricht fürs Team</div><pre class="wa-vorschau">${esc(t)}</pre><div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:8px"><a class="btn prim wa-knopf" href="${whatsappLink()}" target="_blank" rel="noopener">${ico('teilen', 1)} In WhatsApp öffnen</a><button class="btn" data-aktion="waKopieren">Text kopieren</button></div></div>` : '';
    const vorSpiel = naechstes ? modul('Nächstes Spiel', `<div class="social-zwei">${karte(naechstes, true)}${nachricht}</div>`, { eyebrow: 'Vor dem Spiel teilen', klasse: 'social-naechstes' }) : '';
    const weitere = kommend.slice(1);
    const ankuend = weitere.length ? modul('Ankündigungen', `<div class="ebild-raster">${weitere.map(g => karte(g)).join('')}</div>`, { eyebrow: `Game Day · ${weitere.length} weitere Spiele`, fuss: 'Für jedes kommende Spiel liegt ein Game-Day-Bild bereit. Spiele ohne festen Termin zeigen „Termin folgt“ und aktualisieren sich, sobald saisonmanager.de den Termin kennt.' }) : '';
    const ergebn = gespielt.length ? modul('Ergebnisse', `<div class="ebild-raster">${gespielt.map(g => karte(g)).join('')}</div>`, { eyebrow: 'Endstand · nach jedem Spiel automatisch' }) : '';
    return `${kopf}${demoHinweis()}${leiste}${vorSpiel}${ankuend}${ergebn}${newsroom(true)}
      <p class="fussnote">Formate: Feed 4:5 für Instagram-Beiträge und WhatsApp, Quadrat 1:1, Story 9:16 für Instagram-Story und WhatsApp-Status. „Bild teilen“ öffnet am Handy das Teilen-Menü.</p>`;
  }

  // ================= Newsroom =================
  // Nur ein Verweis aufs Instagram-Profil. Beiträge selbst bräuchten einen Feed mit Zustimmung des Kontos;
  // ohne den lädt die App nichts von Instagram, es fließen also keine Daten an Meta.
  const INSTAGRAM = { handle: 'berlinbroilers04floorball', url: 'https://www.instagram.com/berlinbroilers04floorball/' };
  function newsroom(immer) {
    if (fokus !== UNSER && !immer) return '';
    return modul('Neues aus dem Team', `<div class="news">
        <span class="news-ico" aria-hidden="true">${ico('kamera')}</span>
        <div class="news-txt"><b>@${esc(INSTAGRAM.handle)}</b><p>Game Days, Ergebnisse und alles rund um die Broilers gibt es auf Instagram.</p></div>
        <a class="btn prim" href="${INSTAGRAM.url}" target="_blank" rel="noopener noreferrer">Zu Instagram ${ico('extern', 1)}</a>
      </div>`, { eyebrow: 'Newsroom · Instagram', klasse: 'news-modul' });
  }

  // ================= Matchplan =================
  const kurzName = n => { const t = n.split(' '); return t.length > 1 ? `${t[0]} ${t[t.length - 1][0]}.` : n; };
  function seiteMatchplan() {
    const g = naechstes(fokus);
    zusagenAnwenden(g);
    if (!g) return seitenkopf('Matchplan') + modul('', `<div class="leer">${ico('plan')}<b>Kein offenes Spiel</b><p>Für ${esc(kurz(fokus))} steht kein Spiel mehr an.</p></div>`);
    const s = sicht(g);
    const mp = matchplanFuer(g, fokus);
    const r = drei(mp.basis.s, mp.basis.u, mp.basis.n), n = Math.min(mp.n || 0, mp.nG || 0);
    const wichtig = [];
    if (fokus === UNSER) wichtig.push(['Tipp', esc(tippFuer(g, fokus))]);
    gegnerWichtig(g, fokus).forEach(([k, v]) => wichtig.push([k, esc(v)]));
    const kopf = seitenkopf('Matchplan', `${s.heim ? 'gegen' : 'bei'} ${esc(kurz(mp.gegner))} · ${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr`}`,
      `<div style="text-align:right"><div class="kpi">${r[0]}<span class="pz">%</span></div><div class="cap t2">Siegchance</div></div>`);
    const aktionen = `<div style="display:flex;gap:8px;margin-bottom:var(--gap)" class="nicht-druck"><button class="btn prim" data-aktion="kabine">${ico('druck', 1)} Kabinenblatt</button>${fokus === UNSER ? `<button class="btn wa-knopf" data-aktion="whatsapp">${ico('teilen', 1)} WhatsApp</button>` : ''}${navigator.share ? `<button class="btn" data-aktion="teilen">${ico('teilen', 1)} Teilen</button>` : ''}</div>`;
    const das = wichtig.length ? `<section class="wichtigstes"><div class="mkopf"><div><span class="micro">Gegner im Blick</span><h2 class="titel">Das Wichtigste</h2></div></div>${wichtig.map(([k, v]) => `<div class="zeile"><span class="micro">${k}</span><span>${v}</span></div>`).join('')}</section>` : '';
    const hinweis = `<div class="hinweis">${ico('info')}<span>${n || 'Wenige'} Spielberichte je Team. Genug für eine Richtung, zu wenig für Gewissheit.</span></div>`;
    const maxEff = Math.max(1, ...mp.empfehlungen.map(e => Math.abs(e.eff || 0)));
    const karte = e => {
      let links = '';
      if (e.id === 'AU1') links = `<span class="kpi">${Math.round(e.eff)}<span class="pz">%</span></span><small>Siegchance hängt an ihm</small><div class="spur"><i style="width:${Math.abs(e.eff) / maxEff * 100}%"></i></div>`;
      else if (e.id === 'AU2') links = `<span class="kpi gut">+${Math.round(e.eff)}<span class="pz">%</span></span><small>Siegchance mit ihm</small><div class="spur"><i style="width:${Math.abs(e.eff) / maxEff * 100}%"></i></div>`;
      else if (e.id === 'AU5') links = `<span class="kpi">${Math.round(B.teams[fokus].liste.slice().sort((a, b) => b.tore - a.tore).slice(0, 2).reduce((a, x) => a + x.anteil, 0) * 100)}<span class="pz">%</span></span><small>der Tore von zwei</small>`;
      else if (e.id === 'AU7') { const m = e.text.match(/^(\d+) seiner (\d+)/); links = m ? `<span class="kpi">${m[1]}/${m[2]}</span><small>Tore ${/zweiten/.test(e.titel) ? '2.' : '1.'} Hälfte</small>` : ''; }
      else if (e.id === 'DI1') { const m = e.text.match(/hat (\d+)/); links = m ? `<span class="kpi">${m[1]}</span><small>Zeitstrafen</small>` : ''; }
      else if (e.id === 'DI2') links = `<span class="kpi">${dez(K[fokus].zweiProSpiel)}</span><small>Zeitstrafen pro Spiel</small>`;
      return `<article class="karte"><div class="eff">${links}</div><div><span class="micro">${e.kat}</span><h3${e.person ? ' style="display:flex;gap:8px;align-items:center"' : ''}>${e.person ? ava(e.person, 28) : ''}<span>${esc(e.titel)}</span></h3><p>${esc(e.text)}</p><div class="belege">${ausSpielen(e.n)}</div></div></article>`;
    };
    const karten = mp.empfehlungen;
    const empf = karten.length ? `<div class="karten zwei">${karten.map(x => karte(x)).join('')}</div>` : modul('', `<div class="leer">${ico('plan')}<b>Noch zu früh für Empfehlungen</b><p>Ab 2 Spielberichten je Team stehen hier Hinweise zur Aufstellung. Bisher: ${n || 0}.</p></div>`);
    const befund = b => `<div class="satz"><span class="micro">${b.kat}</span><div style="font-weight:600;margin:2px 0">${esc(b.titel)}</div><div class="t2">${esc(b.text)}</div></div>`;
    const phasenBef = mp.befunde.filter(b => b.id === 'PH1' || b.id === 'PH2'), weitere = mp.befunde.filter(b => b.id !== 'PH1' && b.id !== 'PH2');
    const gegnerinnen = mp.gegnerinnen.length ? `<div class="mkopf" style="margin-top:8px"><div><span class="micro">${esc(kurz(mp.gegner))}</span><h2 class="titel">Gegner im Blick</h2></div></div><div class="karten zwei">${mp.gegnerinnen.map(x => `<article class="karte"><div class="eff"><span class="kpi">#${x.s.nummer}</span></div><div><h3 style="margin-top:0;display:flex;gap:8px;align-items:center">${ava(x.s, 28)}<span>${esc(x.s.name)}</span></h3><div class="tags">${x.tags.map(t => etikett(esc(t.replace(' Sp.', ' Spielen')))).join('')}</div></div></article>`).join('')}</div>` : '';
    const ac = fokus === UNSER && AEND ? AEND.chanceVon(g) : null;
    const aendHinweis = ac && Math.abs(ac.d) >= 1 ? `<div class="hinweis aend-hinweis">${aendIco()}<span>Durch die neuen Ergebnisse (${esc(AEND.neu.map(ergebnisSatz).join('; '))}) ist eure Siegchance ${ac.d > 0 ? 'gestiegen' : 'gesunken'}: ${ac.vorher} % → ${ac.jetzt} %.<span class="cap" style="display:block">Aktualisiert am ${aendSeit()}</span></span></div>` : '';
    return `${kopf}${demoHinweis()}${aktionen}${das}${aendHinweis}${hinweis}
      <div class="mkopf" style="margin-top:8px"><div><span class="micro">Aufstellung und Disziplin</span><h2 class="titel">Empfehlungen</h2></div></div>
      ${empf}${optimiererModul(g)}
      ${mp.phasen.fokus && mp.phasen.gegner ? modul('Spielphasen', `${phasenGrafik(mp)}${phasenBef.map(befund).join('')}`, { eyebrow: 'Befund', fuss: `Tordifferenz je ${dez(SPORT.slotMin, SPORT.slotMin % 1 ? 1 : 0)} Minuten, Summe aus ${mp.phasen.nF === mp.phasen.nG ? 'je ' + mp.phasen.nF : mp.phasen.nF + ' und ' + mp.phasen.nG} Spielen mit Spielbericht. Gestrichelt: ${SPORT.periods === 2 ? 'Halbzeit' : 'Drittelpausen'}. Warum die Phasen so verlaufen, zeigen die Daten nicht.` }) : ''}
      ${gegnerinnen}
      ${weitere.length ? modul('Weitere Befunde', weitere.map(befund).join('')) : ''}
      ${kabinenblatt(g, mp, r, wichtig)}`;
  }

  function kabinenblatt(g, mp, r, wichtig) {
    const t = B.teams[fokus], kd = kaderVon(fokus);
    const kaderListe = t ? t.liste.slice().sort((a, b) => a.nummer - b.nummer).filter(s => kd.verf[s.id] !== false && !istRaus(s)) : [];
    return `<section class="kabinenblatt" aria-hidden="true">
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><h1>${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}</h1><div>${wortmarke(16)}</div></div>
      <div>${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)} · ${zeit(g.datum)} Uhr`}${g.halle ? ` · ${esc(normalisiere(g.halle))}${g.adresse ? ', ' + esc(g.adresse) : ''}` : ''}</div>
      <div class="gross" style="margin-top:3mm">Siegchance ${esc(kurz(fokus))}: ${r[0]} % · ${REMIS} ${r[1]} % · Niederlage ${r[2]} %</div>
      <h2>Das Wichtigste</h2><table>${wichtig.map(([k, v]) => `<tr><th style="width:28mm">${k}</th><td>${v}</td></tr>`).join('')}</table>
      <div class="spalten"><div><h2>Kader</h2><table>${kaderListe.map(s => `<tr><td style="width:10mm">${s.nummer}</td><td>${esc(s.name)}${s.torwart ? ' (TW)' : ''}${kd.pins[s.id] ? ' (immer dabei)' : ''}</td></tr>`).join('')}</table></div>
      <div><h2>Gegner im Blick</h2><table>${mp.gegnerinnen.map(x => `<tr><td style="width:10mm">${x.s.nummer}</td><td>${esc(x.s.name)}<br><span style="color:#555">${esc(x.tags.join(' · ').replace(' Sp.', ' Spielen'))}</span></td></tr>`).join('')}</table>
        <h2>Spielphasen</h2>${mp.befunde.filter(b => b.id === 'PH1' || b.id === 'PH2').map(b => `<p style="margin:0 0 2mm">${esc(b.titel)}. ${esc(b.text)}</p>`).join('')}</div></div>
      <div class="fuss">${esc(datenstand)} · Grundlage je ${Math.min(mp.n, mp.nG)} Spielberichte. Richtwerte, keine Gewissheit. ${esc(ABSENDER)}</div>
    </section>`;
  }

  function optimiererModul(g) {
    const t = B.teams[fokus]; if (!t) return '';
    const kd = kaderVon(fokus);
    const K_MAX = (Object.values(DETAILS).find(d => d.maxKader) || {}).maxKader || MATCHPLAN.K;
    const o = optimiereAufstellung(modell, g, fokus, B, kd.verf, kd.pins, labor.eigene, K_MAX);
    const verf = t.liste.filter(s => kd.verf[s.id] !== false).length;
    const rO = drei(o.chance.s, o.chance.u, o.chance.n);
    const wertVon = s => { const a = o.auswahl.find(x => x.s === s); if (a) return a.wert; const gst = o.gestrichen.find(x => x.s === s); return gst ? gst.wert : null; };
    const sortiert = t.liste.slice().sort((a, b) => (kd.verf[a.id] === false) - (kd.verf[b.id] === false) || (wertVon(b) || 0) - (wertVon(a) || 0));
    const zeile = s => {
      const an = kd.verf[s.id] !== false, w = wertVon(s), pin = !!kd.pins[s.id], im = o.auswahl.some(x => x.s === s);
      const info = [`${s.anz}/${t.spiele.length} Sp.`];
      if (!s.torwart) info.push(`${s.tore} T · ${s.assists} A`);
      if (s.zwei) info.push(`${s.zwei}× Zeitstrafe`);
      const tag = s.torwart ? 'Torhüter' : !ueblichDabei(s) ? (belegt(s, labor.eigene) ? 'selten dabei' : 'noch ohne Scorerpunkt') : '';
      const wert = !an ? '<small>nicht dabei</small>' : w == null || w < 1 ? '<small>kaum messbar</small>' : `${Math.round(w)}<small>%</small>`;
      const nadel = s.torwart ? `<span class="pin an" title="Torhüter, steht immer im Kader" aria-label="Torhüter, immer dabei">${ico('pin')}</span>`
        : `<button type="button" class="pin${pin ? ' an' : ''}" data-pin="${esc(s.id)}" aria-pressed="${pin}" aria-label="${esc(s.name)} immer dabei" title="Immer dabei">${ico('pin')}</button>`;
      return `<label class="sz label mitbild${an && im ? '' : ' aus'}">
        <input type="checkbox" role="switch" class="schalter" data-verf="${esc(s.id)}" ${an ? 'checked' : ''} aria-label="${esc(s.name)} dabei">
        <span class="nr">#${s.nummer}</span>${ava(s, 28)}
        <span class="wer"><b><span>${esc(s.name)}</span>${tag ? etikett(tag, tag !== 'Torhüter') : ''}</b><span class="cap zwei"><span class="nur-mobil">#${s.nummer} · ${tag && tag !== 'Torhüter' ? tag + ' · ' : ''}</span>${mitPos(s)}${info.join(' · ')}</span></span>
        <span style="display:flex;align-items:center;gap:4px">${nadel}<span class="wirk">${wert}</span></span></label>`;
    };
    const nameListe = l => l.length > 3 ? `${l.slice(0, 2).map(s => esc(s.name)).join(', ')} und ${l.length - 2} weitere` : l.map(s => esc(s.name)).join(', ');
    const nichtDabei = t.liste.filter(s => kd.verf[s.id] === false);
    const vergleich = nichtDabei.length ? `Nicht dabei: ${nameListe(nichtDabei)}.` : 'Alle sind dabei.';
    const ergebnis = `<div class="kacheln" style="margin-bottom:12px;grid-template-columns:1fr">${kachel('Siegchance mit diesem Kader', `${rO[0]}<span class="pz">%</span>`, `${o.auswahl.length} im Spielbericht (höchstens ${K_MAX})`)}</div><p class="meta" style="margin:0 0 8px">${vergleich}</p>`;
    const warn = o.gestrichen.length ? `Nicht im Spielbericht (Grenze ${K_MAX}): ${o.gestrichen.map(x => esc(x.s.name)).join(', ')}.` : '';
    return modul('Aufstellung durchrechnen', `${ergebnis}
      ${zusagenFuer(g) ? `<div class="hinweis" style="margin-bottom:8px">${ico('haken', 1)}<span>Zu- und Absagen übernommen, Stand ${datumKurz(zusagenFuer(g).stand)}. Umschalten geht weiter von Hand.</span></div>` : ''}
      <div class="listenkopf"><span class="meta">${verf} von ${t.liste.length} verfügbar</span><button class="textaktion" data-aktion="alleVerf">Alle verfügbar</button></div>
      <div class="zeilen">${sortiert.map(zeile).join('')}</div>`,
      { eyebrow: 'Aufstellung', id: 'optimierer', fuss: `Zeile antippen schaltet: an heißt dabei. Die Zahl rechts sagt, wie viele Prozentpunkte Siegchance ungefähr an ihm hängen. Im Kleinfeld stehen nur drei Feldspieler und ein Torhüter auf dem Feld, mehr Spieler bringen deshalb nur begrenzt mehr. Torhüter zählen über den Vergleich mit und ohne ihn im Tor. Abwehrarbeit erfassen die Spielberichte nicht, eine niedrige Zahl heißt nicht, dass jemand wenig bringt. ${warn}` });
  }

  // ================= Spiele =================
  function seiteSpiele() {
    let liste = ui.spieleTeam === 'fokus' ? spiele.filter(g => g.heim === fokus || g.gast === fokus) : spiele;
    if (ui.spieleStatus === 'offen') liste = liste.filter(g => g.offen);
    if (ui.spieleStatus === 'gespielt') liste = liste.filter(g => !g.offen);
    const segT = `<div class="seg">${[['fokus', kurz(fokus)], ['alle', 'Alle Teams']].map(([k, l]) => `<button data-ui="spieleTeam" data-wert="${k}" class="${ui.spieleTeam === k ? 'an' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const segS = `<div class="seg">${[['alle', 'Alle'], ['offen', 'Offen'], ['gespielt', 'Gespielt']].map(([k, l]) => `<button data-ui="spieleStatus" data-wert="${k}" class="${ui.spieleStatus === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    let html;
    if (ui.spieleTeam === 'fokus') {
      // chronologisch, Spieltag als Etikett
      const nxt = liste.find(g => g.offen);
      html = `<div class="zeilen">${liste.map(g => `${g === nxt ? '<div class="spieltag micro" data-naechste>Als Nächstes</div>' : ''}${spielZeile(g, { ohneMarke: true })}`).join('')}</div>`;
    } else if (ui.spieleStatus === 'offen') {
      // offene Spiele aller Teams: nach Datum, Monat als Etikett, Spiele ohne Termin am Ende
      const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      const gruppe = g => g.terminOffen ? 'Termin noch offen' : `${MONAT[g.datum.getUTCMonth()]} ${g.datum.getUTCFullYear()}`;
      const sortiert = liste.filter(g => !g.terminOffen).sort((a, b) => a.datum - b.datum || a.runde - b.runde)
        .concat(liste.filter(g => g.terminOffen).sort((a, b) => a.runde - b.runde || a.datum - b.datum));
      const gruppen = [...new Set(sortiert.map(gruppe))];
      html = gruppen.map((k, i) => `<div class="spieltag micro"${i === 0 ? ' data-naechste' : ''}>${k}</div><div class="zeilen">${sortiert.filter(g => gruppe(g) === k).map(g => spielZeile(g)).join('')}</div>`).join('');
    } else {
      const runden = [...new Set(liste.map(g => g.runde))].sort((a, b) => a - b);
      const naechsteRunde = (offen[0] || {}).runde;
      html = runden.map(r => `<div class="spieltag micro"${r === naechsteRunde ? ' data-naechste' : ''}>Spieltag ${r}</div><div class="zeilen">${liste.filter(g => g.runde === r).map(g => spielZeile(g)).join('')}</div>`).join('');
    }
    return `${seitenkopf('Spiele', `${esc(ligaName)} · ${gewertet.length} gespielt, ${offen.length} offen`)}${hinweisFokus()}${segT}${segS}
      ${modul('', html || `<div class="leer">${ico('kalender')}<b>Keine Spiele</b></div>`, { fuss: 'Prozent: Siegchance des eigenen Teams, bei fremden Spielen die Chance des Heimteams. Spiel antippen für Details, Halle und Route.' })}`;
  }

  // ================= Tabelle =================
  function seiteTabelle() {
    const seg = `<div class="seg">${[['tabelle', 'Tabelle'], ['verlauf', 'Verlauf'], ['saison', 'Saisonende']].map(([k, l]) => `<button data-ui="tabelleAnsicht" data-wert="${k}" class="${ui.tabelleAnsicht === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    let inhalt = '';
    const tabHinweis = AEND && fokus === UNSER && AEND.platzJetzt !== AEND.platzVorher ? `<div class="hinweis aend-hinweis">${aendIco()}<span>${esc(AEND.neu.map(ergebnisSatz).join('; '))}. ${esc(platzSatz(AEND))}<span class="cap" style="display:block">Aktualisiert am ${aendSeit()}</span></span></div>` : '';
    if (ui.tabelleAnsicht === 'tabelle') inhalt = tabHinweis + modul('', tabelleHtml(tabelle), { fuss: `${offAktuell ? 'Tabelle laut saisonmanager.de.' : 'Aus den Ergebnissen berechnet, weil die Tabelle bei saisonmanager.de noch nicht alle Spiele enthält.'} Punkte: Sieg ${P.S}, ${SPORT.draws ? `Remis ${P.U}, ` : ''}Niederlage ${P.N}${(P.SV !== P.S || P.NV !== P.N) ? `, nach Verlängerung ${P.SV} und ${P.NV}` : ''}. Team antippen für Details.${urteile.length ? ` ${urteile.length} Spiel${urteile.length > 1 ? 'e' : ''} kampflos gewertet.` : ''}` });
    if (ui.tabelleAnsicht === 'verlauf') inhalt = modul('Platz je Spieltag', tabellenVerlauf(), { fuss: 'Linie antippen für Details zum Team.' });
    if (ui.tabelleAnsicht === 'saison') {
      const nFest = Object.keys(fest).length;
      const sim = nFest ? simuliereSaison(modell, gewertet, offen, teamIds, 5000, fest, bonus) : simBasis;
      const top3 = (s, id) => s.plaetze[id][0] + s.plaetze[id][1] + s.plaetze[id][2];
      const dl = (a, b) => { const d = Math.round((a - b) * 100); return nFest && d ? ` <span class="delta ${d > 0 ? 'plus' : 'minus'}">${d > 0 ? '+' : MINUS}${Math.abs(d)}</span>` : ''; };
      const stufe = v => v < .01 ? null : v < .05 ? 1 : v < .15 ? 2 : v < .30 ? 3 : v < .50 ? 4 : v < .75 ? 5 : 6;
      const zelle = v => { const s = stufe(v); return s ? `<td class="z" style="background:var(--seq-${s});color:${s >= 5 ? `var(--seq-${s}-text)` : 'var(--text-1)'}">${Math.round(v * 100)}</td>` : '<td class="z"></td>'; };
      const reihe = teamIds.slice().sort((a, b) => sim.punkte[b] - sim.punkte[a]);
      const heat = `<div class="scroll-hinweis"><div class="scrollx"><table class="tab heat"><thead><tr><th class="l">Team</th><th>Punkte</th>${teamIds.map((_, i) => `<th style="text-align:center;padding:0">${i + 1}.</th>`).join('')}</tr></thead><tbody>
        ${reihe.map(id => `<tr class="klick${id === fokus ? ' f' : ''}" data-team="${id}"><td class="l tw"><span class="team">${logo(id)}<span>${esc(kurz(id))}</span></span></td><td>${dez(sim.punkte[id])}</td>${sim.plaetze[id].map(zelle).join('')}</tr>`).join('')}</tbody></table></div></div>`;
      const runden = [...new Set(offen.map(g => g.runde))].sort((a, b) => a - b);
      const wi = runden.map(r => `<div class="spieltag micro">Spieltag ${r}</div>` + offen.filter(g => g.runde === r).map(g => {
        const p = prognose(modell, g.heim, g.gast), rr = drei(p.pHeim, p.pRemis, p.pGast), sv = sicht(g);
        return `<div class="sz" style="grid-template-columns:minmax(0,1fr) auto;${sv.dabei ? 'box-shadow:inset 3px 0 0 var(--accent)' : ''}"><span class="wer"><b><span>${esc(kurz(g.heim))} gegen ${esc(kurz(g.gast))}</span></b><span class="cap">${g.terminOffen ? 'Termin offen' : tagKurz(g.datum)} · Heim ${rr[0]} % · ${REMIS} ${rr[1]} % · Gast ${rr[2]} %</span></span>
          <span class="mini-seg">${['H', 'U', 'G'].map(k => `<button data-fest="${g.id}" data-wert="${k}" class="${fest[g.id] === k ? 'an' : ''}" aria-label="${k === 'H' ? 'Heimsieg' : k === 'U' ? (SPORT.draws ? 'Unentschieden' : 'Verlängerung') : 'Gastsieg'} festlegen">${k === 'U' && !SPORT.draws ? 'V' : k}</button>`).join('')}</span></div>`;
      }).join('')).join('');
      inhalt = `<div class="kacheln">${kachel(`Platz 1 · ${esc(kurz(fokus))}`, `${Math.round(sim.plaetze[fokus][0] * 100)}<span class="pz">%</span>`, `erwartet ${dez(sim.punkte[fokus])} Punkte`, dl(sim.plaetze[fokus][0], simBasis.plaetze[fokus][0]))}${kachel('Unter die ersten 3', `${Math.round(top3(sim, fokus) * 100)}<span class="pz">%</span>`, nFest ? `${nFest} Ergebnis${nFest > 1 ? 'se' : ''} festgelegt` : 'ohne Festlegungen', dl(top3(sim, fokus), top3(simBasis, fokus)))}</div>
        ${modul('Wo landet wer am Ende?', heat, { eyebrow: '5.000 durchgespielte Saisons', fuss: 'Prozent je Endplatz. Je dunkler, desto wahrscheinlicher. Zur Seite wischen für alle Plätze.' })}
        ${modul('Was wäre wenn?', `<div class="listenkopf" style="padding:0"><span class="meta">${nFest ? `${nFest} Ergebnis${nFest > 1 ? 'se' : ''} festgelegt` : `Lege Ergebnisse fest (H Heimsieg, ${SPORT.draws ? 'U Remis' : 'V Verlängerung'}, G Gastsieg), die Saison rechnet sofort neu.`}</span>${nFest ? '<button class="textaktion" data-aktion="festWeg">Zurücksetzen</button>' : `<button class="textaktion" data-aktion="fokusSiegt">${esc(kurz(fokus))} gewinnt alles</button>`}</div><div class="zeilen">${wi}</div>`, { id: 'wasWaere' })}`;
    }
    return `${seitenkopf('Tabelle', `${esc(ligaName)} · nach ${maxRunde} Spieltagen`)}${hinweisFokus()}${seg}${inhalt}`;
  }

  // ================= Durchspielen (Labor) =================
  function laborStandard(g) {
    labor.dabei = ueblicheBesetzung(B, [g.heim, g.gast]); labor.form = { f: 0, g: 0 }; labor.neutral = false;
    // Eigenes Team: Zu- und Absagen aus SpielerPlus (daten/zusagen.js) und „immer raus“ übernehmen
    if ((g.heim === UNSER || g.gast === UNSER) && B.teams[UNSER]) {
      const z = zusagenFuer(g);
      B.teams[UNSER].liste.forEach(s => { if (z) labor.dabei[s.id] = z.dabei.includes(s.id); if (immerRaus.includes(s.id)) labor.dabei[s.id] = false; });
    }
  }
  function laborRechne(g, ohne) {
    const s = sicht(g), fHeim = s.dabei ? s.heim : true;
    const dab = ohne ? Object.assign({}, labor.dabei, { [ohne]: false }) : labor.dabei;
    let eh = besetzungsEffekt(B.teams[g.heim], dab, labor.eigene) + (fHeim ? labor.form.f : labor.form.g);
    const eg = besetzungsEffekt(B.teams[g.gast], dab, labor.eigene) + (fHeim ? labor.form.g : labor.form.f);
    if (labor.neutral) eh -= modell.heim;
    return prognoseMitBesetzung(modell, g.heim, g.gast, eh, eg);
  }
  function seiteLabor() {
    if (!offen.length) return seitenkopf('Durchspielen') + modul('', `<div class="leer">${ico('labor')}<b>Keine offenen Spiele</b></div>`);
    if (!labor.spiel || !spielNach[labor.spiel] || !spielNach[labor.spiel].offen) { const n = naechstes(fokus) || offen[0]; labor.spiel = n.id; laborStandard(n); }
    const g = spielNach[labor.spiel], s = sicht(g);
    const reihen = offen.filter(o => o.heim === fokus || o.gast === fokus).concat(offen.filter(o => o.heim !== fokus && o.gast !== fokus)).slice(0, 24);
    const chips = `<div class="chipreihe">${reihen.map(o => `<button class="chip${o.id === g.id ? ' an' : ''}" data-labor="${o.id}">${esc(kurz(o.heim))} · ${esc(kurz(o.gast))} · ${o.terminOffen ? 'offen' : tagKurz(o.datum)}</button>`).join('')}</div>`;
    const seiten = [g.heim, g.gast];
    const h2h = gewertet.filter(x => (x.heim === g.heim && x.gast === g.gast) || (x.heim === g.gast && x.gast === g.heim));
    return `${seitenkopf('Durchspielen', 'Wer spielt, wer nicht, wie ist die Tagesform')}${hinweisFokus()}${chips}
      <div class="modul labor-leiste" id="laborErgebnis"></div>
      <div class="zwei-sp">${seiten.map(tid => kaderModul(g, tid)).join('')}</div>
      ${modul('Tagesform und Halle', `${regler('formF', s.dabei ? kurz(fokus) : kurz(g.heim), labor.form.f)}${regler('formG', s.dabei ? kurz(s.gegner) : kurz(g.gast), labor.form.g)}
        <label class="sz label" style="padding:6px 0;grid-template-columns:44px minmax(0,1fr)"><input type="checkbox" role="switch" class="schalter" id="neutral" ${labor.neutral ? 'checked' : ''}><span class="meta" style="color:var(--text-1)">Neutrale Halle, ohne Heimvorteil von ${dez(modell.heim)} Toren</span></label>`, { fuss: 'Tagesform: besser oder schlechter als sonst, in Toren.' })}
      ${modul('So könnte es ausgehen', '<div id="laborVerteilung"></div>', { fuss: 'Wahrscheinlichkeit je Tordifferenz. Balken: mit deinen Einstellungen. Gestrichelt: ohne Kaderinfo.' })}
      ${TRAINERIN ? modul('An wem hängt am meisten?', '<div id="laborWichtig"></div>', { eyebrow: 'Einfluss', fuss: 'Um so viele Prozentpunkte sinkt die Siegchance, wenn nur dieser eine Spieler zusätzlich nicht dabei ist.' }) : ''}
      ${modul('Direktvergleich', h2h.length ? `<div class="zeilen">${h2h.map(x => spielZeile(x)).join('')}</div>` : '<p class="meta" style="margin:0">Die beiden Teams haben in dieser Saison noch nicht gegeneinander gespielt.</p>')}`;
  }
  function regler(id, name, wert) {
    const pos = (wert + 4) / 8 * 100;
    return `<div class="regler"><label for="${id}">${esc(name)}</label><input type="range" id="${id}" min="-4" max="4" step="0.5" value="${wert}" data-skala="0.5" style="--f0:${Math.min(50, pos)}%;--f1:${Math.max(50, pos)}%" aria-valuetext="${vz(wert)} Tore"><output id="${id}W" class="${wert ? '' : 'null'}">${wert ? vz(wert) : '0'}</output></div>`;
  }
  function kaderModul(g, tid) {
    const t = B.teams[tid];
    if (!t) return modul(esc(kurz(tid)), '<p class="meta" style="margin:0">Für dieses Team liegen noch keine Spielberichte vor.</p>');
    const an = t.liste.filter(s => labor.dabei[s.id]).length;
    return modul(`${logo(tid, 24)} ${esc(kurz(tid))}`, `<div class="listenkopf" style="padding:0 0 4px"><span class="meta">${an} von ${t.liste.length} dabei${tid === UNSER && zusagenFuer(g) ? ` · Zusagen aus SpielerPlus, Stand ${datumKurz(zusagenFuer(g).stand)}` : ''}</span></div>
      <div class="zeilen">${t.liste.slice().sort((a, b) => a.nummer - b.nummer).map(s => {
        const dab = !!labor.dabei[s.id], eig = labor.eigene[s.id], w = eig != null ? eig : s.einfluss;
        const tagText = s.torwart ? 'Torhüter' : !ueblichDabei(s) ? (belegt(s, labor.eigene) ? 'selten dabei' : 'noch ohne Scorerpunkt') : '';
        const rechts = `<button type="button" class="wirk" data-einfluss="${esc(s.id)}" title="Eigene Einschätzung">${vz(w)}<small>Tore</small></button>`;
        return `<label class="sz label mitbild${dab ? '' : ' aus'}" data-zeile="${esc(s.id)}"><input type="checkbox" role="switch" class="schalter" data-dabei="${esc(s.id)}" ${dab ? 'checked' : ''} aria-label="${esc(s.name)} spielt mit">
          <span class="nr">#${s.nummer}</span>${ava(s, 28)}<span class="wer"><b><span>${esc(s.name)}</span>${tagText ? etikett(tagText, tagText !== 'Torhüter') : ''}</b><span class="cap"><span class="nur-mobil">#${s.nummer} · ${tagText && tagText !== 'Torhüter' ? tagText + ' · ' : ''}</span>${mitPos(s)}${s.anz} von ${t.spiele.length} Spielen${s.torwart ? '' : ` · ${s.tore} T, ${s.assists} A`}</span></span>
          ${rechts}
          ${TRAINERIN && labor.offen === s.id ? `<div class="regelzeile">${reglerEigen(s.id, w)}</div>` : ''}</label>`;
      }).join('')}</div>`, { fuss: 'Zahl rechts: Torwirkung, also so viele Tore Unterschied macht er im Schnitt. Antippen, um sie selbst einzuschätzen. Torhüter bekommen sie aus dem Vergleich mit und ohne ihn im Tor.' });
  }
  function reglerEigen(pid, w) {
    const pos = (w + 2) / 10 * 100;
    return `<div class="regler"><label class="t2">Eigene Einschätzung</label><input type="range" data-eigen="${esc(pid)}" min="-2" max="8" step="0.25" value="${w}" style="--f0:${Math.min(20, pos)}%;--f1:${Math.max(20, pos)}%"><output>${vz(w)}</output></div>`;
  }
  function laborErgebnis() {
    const g = spielNach[labor.spiel]; if (!g || !$('#laborErgebnis')) return;
    const basis = prognose(modell, g.heim, g.gast), p = laborRechne(g);
    const rb = drei(basis.pHeim, basis.pRemis, basis.pGast), rp = drei(p.pHeim, p.pRemis, p.pGast);
    const s = sicht(g);
    const d = i => { const x = rp[i] - rb[i]; if (!x) return ''; const gut = !s.dabei || i === 1 ? null : ((i === 0) === s.heim) === (x > 0); return `<span class="d ${gut == null ? 't2' : gut ? 'plus' : 'minus'}">${x > 0 ? '+' : MINUS}${Math.abs(x)}</span>`; };
    const lab = [`Sieg ${esc(kurz(g.heim))}`, REMIS, `Sieg ${esc(kurz(g.gast))}`];
    const farbe = i => !s.dabei || i === 1 ? '' : ((i === 0) === s.heim ? 'plus' : 'minus');
    $('#laborErgebnis').innerHTML = `<div class="ergebnis3">${rp.map((v, i) => `<div><div class="w ${farbe(i)}">${v}<span class="pz">%</span>${d(i)}</div><div class="lab">${lab[i]}</div></div>`).join('')}</div>
      ${streifenHG(p, g, true)}<div class="cap t2" style="text-align:center;margin-top:8px">Ohne Kaderinfo ${rb.join(' / ')} % · ${erwartet(p, g)}</div>`;
    $('#laborVerteilung').innerHTML = verteilungSvg(p, basis, g);
    if (!TRAINERIN || !$('#laborWichtig')) return;
    $('#laborWichtig').innerHTML = `<div class="zwei-sp" style="margin:0">${[g.heim, g.gast].map(tid => {
      const t = B.teams[tid]; if (!t) return '<div></div>';
      const sv = q => (g.heim === tid ? q.pHeim : q.pGast), b0 = sv(p);
      const l = t.liste.filter(x => labor.dabei[x.id]).map(x => ({ x, d: sv(laborRechne(g, x.id)) - b0 })).sort((a, b) => a.d - b.d).slice(0, 5);
      const mx = Math.max(.01, ...l.map(z => -z.d));
      return `<div><div class="cap" style="font-weight:600;margin-bottom:6px;display:flex;gap:8px;align-items:center">${logo(tid)} ${esc(kurz(tid))}</div>${l.map(z => `<div class="bl"><span class="nm"><span>${esc(z.x.name)}</span></span><span class="spur"><i class="${tid === fokus ? 'f' : ''}" style="left:0;width:${Math.max(0, -z.d) / mx * 100}%"></i></span><span class="w">${vzGanz(z.d * 100)}${NB}%</span></div>`).join('')}</div>`;
    }).join('')}</div>`;
  }

  // ================= Spieler =================
  const SORT = { punkte: ['Scorer', s => s.punkte + s.tore / 100], tore: ['Tore', s => s.tore + s.punkte / 1000], assists: ['Assists', s => s.assists + s.punkte / 1000], pps: ['pro Spiel', s => s.punkteProSpiel], pim: ['Strafmin.', s => s.pim], einfluss: ['Torwirkung', s => s.einfluss] };
  function seiteSpieler() {
    if (!SORT[ui.spSort]) ui.spSort = 'punkte';
    // Eigenes Team zuerst und als eigener Knopf, alle anderen Teams im Auswahlfeld daneben
    const eigen = String(ui.spTeam) === String(UNSER);
    const chips = `<div class="team-filter"><button class="chip${eigen ? ' an' : ''}" data-ui="spTeam" data-wert="${UNSER}">${logo(UNSER, 16)}${esc(kurz(UNSER))}</button>
      <select class="gk-select${eigen ? '' : ' an'}" id="spTeamWahl" aria-label="Anderes Team wählen">
        <option value="" ${eigen ? 'selected' : ''} disabled>Andere Teams …</option>
        <option value="alle" ${ui.spTeam === 'alle' ? 'selected' : ''}>Alle Teams</option>
        ${tabelle.filter(z => z.id !== UNSER).map(z => `<option value="${z.id}" ${String(ui.spTeam) === String(z.id) ? 'selected' : ''}>${esc(kurz(z.id))}</option>`).join('')}
      </select></div>`;
    const seg = `<div class="seg">${Object.entries(SORT).map(([k, [l]]) => `<button data-ui="spSort" data-wert="${k}" class="${ui.spSort === k ? 'an' : ''}">${l}</button>`).join('')}</div>`;
    const abh = teamIds.filter(id => B.teams[id]).sort((a, b) => B.teams[b].top1 - B.teams[a].top1);
    return `${seitenkopf('Spieler', `${alleSp.length} Spieler aus ${Object.keys(B.teams).length} Teams`)}${demoHinweis()}
      <input class="chip" style="width:100%;height:44px;border-radius:var(--r-m);padding:0 14px;margin-bottom:12px;font-size:16px" id="spSuche" type="search" placeholder="Name suchen" value="${esc(ui.spSuche)}" autocomplete="off">
      ${chips}${seg}<div id="spListe"></div>
      ${modul('Wie sehr hängt jedes Team an seinem besten Schützen?', abh.map(id => { const t = B.teams[id];
        return `<button class="bl" data-team="${id}"><span class="nm">${logo(id)}<span>${esc(kurz(id))}</span></span><span class="spur"><i class="${id === fokus ? 'f' : ''}" style="left:0;width:${Math.min(100, t.top1 * 100 / .5)}%"></i></span><span class="w">${pct(t.top1)}</span></button>`; }).join(''),
        { fuss: 'Anteil des besten Torschützen an allen Toren des Teams.' })}`;
  }
  function spListe() {
    const q = ui.spSuche.trim().toLowerCase(), f = SORT[ui.spSort][1];
    const liste = alleSp.filter(s => (ui.spTeam === 'alle' || String(s.team) === String(ui.spTeam)) && (!q || s.name.toLowerCase().includes(q))).sort((a, b) => f(b) - f(a));
    const wert = s => ({ einfluss: vz(s.einfluss), tore: s.tore, assists: s.assists, punkte: s.punkte, pps: dez(s.punkteProSpiel), pim: s.pim }[ui.spSort]);
    const zeile2 = s => s.torwart ? `Torhüter · ${s.anz} Spiel${s.anz > 1 ? 'e' : ''}` : `${s.tore} Tore, ${s.assists} Assists in ${s.anz} Spiel${s.anz > 1 ? 'en' : ''}`;
    const el = $('#spListe'); if (!el) return;
    el.innerHTML = liste.length ? modul('', `<div class="zeilen">${liste.slice(0, 120).map((s, i) => `<button class="spiel${s.team === fokus ? ' fokus' : ''}${istRaus(s) ? ' raus' : ''}" style="grid-template-columns:24px 40px minmax(0,1fr) auto;min-height:56px" data-spielerin="${esc(s.id)}">
        <span class="cap t3" style="text-align:right">${i + 1}</span>${ava(s, 40)}<span class="paar"><div style="height:auto"><span style="font-weight:500">${esc(s.name)}</span></div><div style="height:auto;gap:6px">${logo(s.team, 16)}<span class="cap t2">#${s.nummer} · ${istRaus(s) ? 'diese Saison nicht dabei · ' : ''}${mitPos(s)}${esc(kurz(s.team))} · ${zeile2(s)}</span></div></span>
        <span style="font-weight:600;font-size:17px">${wert(s)}</span></button>`).join('')}</div>`) :
      modul('', `<div class="leer">${ico('trikot')}<b>Kein Spieler gefunden</b><p>Keine Treffer für „${esc(ui.spSuche)}“.</p><button class="textaktion" data-aktion="filterWeg" style="margin:0">Filter zurücksetzen</button></div>`);
  }

  // ================= Teams =================
  const TM = [
    ['name', 'Team', id => kurz(id)], ['staerke', 'Teamstärke', id => staerke(modell, id)], ['att', 'Tore mehr', id => modell.att[id] || 0], ['def', 'Gegentore weniger', id => modell.def[id] || 0],
    ['hz1', '1. Hälfte', id => muster[id].n ? muster[id].hz1 / muster[id].n : 0], ['hz2', '2. Hälfte', id => muster[id].n ? muster[id].hz2 / muster[id].n : 0],
    ['schluss', `Letzte ${Math.round(SPORT.slotMin)} Min.`, id => muster[id].n ? muster[id].schluss / muster[id].n : 0],
    ['pp', 'Überzahl', id => K[id].ppQuote == null ? -1 : K[id].ppQuote], ['zwei', 'Zeitstr./Sp.', id => K[id].zweiProSpiel], ['top1', 'Bester Schütze', id => B.teams[id] ? B.teams[id].top1 : 0],
  ];
  function seiteTeams() {
    const sp = TM.find(c => c[0] === ui.tmSort);
    const liste = teamIds.slice().sort((a, b) => { const x = sp[2](a), y = sp[2](b); const c = typeof x === 'string' ? x.localeCompare(y, 'de') : x - y; return ui.tmAb ? -c : c; });
    const mx = Math.max(1, ...teamIds.map(id => Math.abs(staerke(modell, id))));
    const balken = rang.map(id => { const s = staerke(modell, id), w = Math.abs(s) / mx * 50;
      return `<button class="bl" data-team="${id}"><span class="nm">${logo(id)}<span style="${id === fokus ? 'font-weight:600' : ''}">${esc(kurz(id))}</span></span><span class="spur"><span class="null"></span><i class="${id === fokus ? 'f' : ''}" style="left:${s >= 0 ? 50 : 50 - w}%;width:${w}%"></i></span><span class="w">${vz(s)}</span></button>`; }).join('');
    const tab = `<div class="scroll-hinweis"><div class="scrollx"><table class="tab"><thead><tr>${TM.map(c => `<th class="sort${c[0] === 'name' ? ' l' : ''}${ui.tmSort === c[0] ? ' an' : ''}" data-tmsort="${c[0]}">${c[1]}${ui.tmSort === c[0] ? (ui.tmAb ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>
      ${liste.map(id => { const m = muster[id], k = K[id], t = B.teams[id];
        return `<tr class="klick${id === fokus ? ' f' : ''}" data-team="${id}"><td class="l tw"><span class="team">${logo(id)}<span>${esc(kurz(id))}</span></span></td><td style="font-weight:700">${vz(staerke(modell, id))}</td><td>${vz(modell.att[id] || 0)}</td><td>${vz(modell.def[id] || 0)}</td>
        <td>${m.n ? vz(m.hz1 / m.n) : ''}</td><td>${m.n ? vz(m.hz2 / m.n) : ''}</td><td>${m.n ? vz(m.schluss / m.n) : ''}</td><td>${k.ppQuote == null ? '' : pct(k.ppQuote)}</td><td>${k.spiele ? dez(k.zweiProSpiel) : ''}</td><td>${t ? pct(t.top1) : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    return `${seitenkopf('Teams', 'Stärke und Profile im Vergleich')}
      ${modul('Teamstärke in Toren', balken, { fuss: '+0,3 heißt: im Schnitt 0,3 Tore besser als ein Durchschnittsteam in neutraler Halle.' })}
      ${modul('Vergleich', tab, { fuss: 'Tore mehr geschossen und Gegentore weniger kassiert als der Ligaschnitt. Hälften und Schlussphase: durchschnittliche Tordifferenz in diesem Abschnitt. Überzahl: Tore je Strafe des Gegners. Spaltenkopf sortiert, zur Seite wischen für alle Spalten.' })}`;
  }

  // ================= Methodik =================
  function seiteMethodik() {
    let treffer = 0, summe = 0, brier = 0;
    gewertet.forEach(g => {
      const rh = g.regHeim != null ? g.regHeim : g.toreHeim, rg = g.regGast != null ? g.regGast : g.toreGast;
      const p = vorher[g.id], real = rh > rg ? 0 : rh === rg ? 1 : 2, arr = [p.pHeim, p.pRemis, p.pGast];
      if (arr.indexOf(Math.max(...arr)) === real) treffer++;
      summe += arr[real]; brier += arr.reduce((s, q, i) => s + (q - (i === real ? 1 : 0)) ** 2, 0);
    });
    const n = gewertet.length || 1;
    const GLOSSAR = [
      ['Siegchance', `Wie wahrscheinlich ein Sieg laut den bisherigen Ergebnissen ist. ${REMIS} und Niederlage ergänzen sie auf 100 %.`],
      ['Prozentpunkte', 'Unterschied zwischen zwei Prozentwerten. Von 42 % auf 27 % sind 15 Prozentpunkte.'],
      ['Teamstärke', 'So viele Tore ist ein Team im Schnitt besser oder schlechter als ein Durchschnittsteam der Liga, in neutraler Halle.'],
      ['Spielbericht', 'Spiel mit Aufstellung, Toren, Assists und Strafen auf saisonmanager.de.'],
      ['Scorerpunkte', 'Tore plus Assists eines Spielers.'],
      ['Torwirkung', 'So viele Tore Unterschied macht ein Spieler im Schnitt, wenn er spielt. Bei Torhütern aus dem Vergleich mit und ohne ihn im Tor; Abwehrarbeit fehlt darin.'],
      ['Überzahl', 'Tor, während der Gegner eine Strafe absitzt. Abgeleitet aus den Strafzeiten im Spielbericht, nicht offiziell gekennzeichnet.'],
      ['Kampflos', 'Spiel, das ohne Ergebnis auf dem Feld gewertet wurde (Forfait).'],
    ];
    return `${seitenkopf(wortmarke(32), 'So rechnet die App und wie gut sie bisher lag')}
      <div class="kacheln vier">${kachel('Favorit gewann', `${treffer} von ${gewertet.length}`, 'gemessen vor dem Anpfiff')}${kachel('Chance fürs echte Ergebnis', `${Math.round(summe / n * 100)}<span class="pz">%</span>`, 'im Schnitt')}${kachel('Treffsicherheit', dez(brier / n, 2), '0 wäre perfekt, 0,67 wäre Raten')}${kachel('Heimvorteil', `${vz(modell.heim)}`, 'Tore in dieser Liga')}</div>
      ${modul('Teamstärke und Siegchance', `<div class="fliess"><p>Aus allen Ergebnissen schätzt ${APP} für jedes Team, wie viele Tore es mehr schießt und weniger kassiert als der Schnitt, dazu den Heimvorteil. Gerechnet wird mit der regulären Spielzeit (${SPORT.periods} × ${SPORT.periodMin} Minuten), Tore in Verlängerung und Penaltyschießen zählen nur für die Tabelle. Am Saisonanfang zieht die Rechnung alle Teams Richtung Durchschnitt und wird mit jedem Ergebnis mutiger.</p><p>Daraus ergibt sich für jedes Spiel eine erwartete Tordifferenz. Weil Floorball streut, wird sie als Glockenkurve behandelt: Die Flächen links, in der Mitte und rechts sind Niederlage, ${REMIS} und Sieg. Die Zahlen oben sind ehrlich gemessen, jedes Spiel nur mit dem, was vor dem Anpfiff bekannt war.</p></div>`)}
      ${modul('Matchplan', `<div class="fliess"><p>Der Matchplan zeigt nur, was die Spielberichte belegen: wer unverzichtbar ist, wer die Tore macht und vorbereitet, in welcher Spielhälfte wer trifft, Strafen, Über- und Unterzahl, Spielphasen und die wichtigsten Gegenspieler. Taktische Ratschläge gibt es bewusst nicht, weil Reihen, Einsatzzeiten, Schüsse und Paraden fehlen. Jede Karte sagt, aus wie vielen Spielen sie stammt.</p></div>`)}
      ${modul('Begriffe', GLOSSAR.map(([k, v]) => `<div class="satz"><b>${k}</b><div class="t2">${v}</div></div>`).join(''))}
      ${modul('Grenzen', `<div class="fliess"><p>Paraden und Schüsse liefert saisonmanager.de öffentlich nicht, Torhüter werden deshalb nur über die Ergebnisse mit und ohne sie bewertet. Reihen und Einsatzzeiten fehlen ebenfalls. Verletzungen, Trainingsstand und die Vorsaison kennt die Rechnung nicht. Bei wenigen Spielen je Team sind alle Werte Richtwerte.</p></div>`)}
      ${modul('Absender', `<div class="meta">${esc(ABSENDER)}<br>${esc(datenstand)}. ${gewertet.length} gewertete Spiele, ${Object.keys(DETAILS).length} Spielberichte, ${offen.length} offene Spiele.${D.demo ? ' Derzeit Demodaten.' : ''}</div>`)}`;
  }

  // ================= Detail-Sheets =================
  function spielDetail(id) {
    const g = spielNach[id]; if (!g) return;
    const v = B.verlaeufe[id], d = DETAILS[id];
    const W = Math.min(448, window.innerWidth) - 2 * 16 - 2;
    let html = `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;text-align:center;align-items:center;margin:4px 0 16px">
      <button data-team="${g.heim}" style="border:0;background:none;color:inherit">${logo(g.heim, 48)}<div style="font-weight:600;margin-top:8px">${esc(kurz(g.heim))}</div><div class="cap t2">Heim</div></button>
      <div>${g.gewertet ? `<div style="font:700 40px/40px var(--font-display);letter-spacing:-.03em">${stand(g.toreHeim, g.toreGast)}</div>${g.zusatz ? `<div class="meta">${g.zusatz === 'n. PS' ? 'nach Penaltyschießen' : 'nach Verlängerung'}</div>` : ''}${v ? `<div class="meta">${periodenText(v)}</div>` : ''}` : `<div class="meta">${g.terminOffen ? 'Termin offen' : `${tagLang(g.datum)}<br>${zeit(g.datum)} Uhr`}</div>`}</div>
      <button data-team="${g.gast}" style="border:0;background:none;color:inherit">${logo(g.gast, 48)}<div style="font-weight:600;margin-top:8px">${esc(kurz(g.gast))}</div><div class="cap t2">Gast</div></button></div>`;
    if (g.halle) html += `<div class="hinweis" style="margin-bottom:16px">${ico('ort')}<span>${esc(normalisiere(g.halle))}${g.adresse ? `<br><span class="t2">${esc(adresseSchoen(g.adresse))}</span>` : ''}</span>${routeLink(g) ? `<span style="margin-left:auto">${routeLink(g)}</span>` : ''}</div>`;
    if ((g.gewertet || g.offen) && (g.heim === UNSER || g.gast === UNSER)) html += `<div class="micro" style="margin-bottom:8px">${g.gewertet ? 'Endstand-Bild' : 'Game-Day-Bild'}</div>${ergebnisBildHtml(g)}${g.gewertet ? `<div style="margin:-8px 0 20px">${berichtHtml(g)}</div>` : ''}`;
    if (g.gewertet) {
      html += `<div class="micro">Chance vor dem Spiel</div>${dreiHG(vorher[g.id], g)}${streifenHG(vorher[g.id], g, true)}`;
      if (v && v.tore.length) html += `<div class="micro" style="margin:20px 0 4px">Spielverlauf</div>${spielverlaufSvg(g, v, W)}`;
      if (d && d.l && d.l.data) {
        const spalte = (seite, tid) => {
          const ps = (d.l.data[seite].players || []).filter(p => !p.is_staff).sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals || a.number - b.number);
          return `<div class="micro" style="margin:20px 0 4px;display:flex;gap:8px;align-items:center">${logo(tid, 16)} ${esc(kurz(tid))}</div><table class="tab"><thead><tr><th>#</th><th class="l">Spieler</th><th>Tore</th><th>Ass.</th><th>Strafmin.</th></tr></thead><tbody>
            ${ps.map(p => `<tr class="klick" data-spielerin="${esc(p.player.id)}"><td class="t3">${p.number}</td><td class="l" style="max-width:190px"><span style="display:flex;gap:8px;align-items:center;min-width:0">${avatar(p.player.id, p.player.first_name + ' ' + p.player.last_name, tid, 24)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((p.player.first_name + ' ' + p.player.last_name).trim())}${p.is_goalkeeper ? ' <span class="t3">TW</span>' : ''}${p.is_captain ? ' <span class="t3">(C)</span>' : ''}</span></span></td><td style="font-weight:600">${p.goals || ''}</td><td class="t2">${p.assists || ''}</td><td class="t2">${p.pim || ''}</td></tr>`).join('')}</tbody></table>`;
        };
        html += spalte('local', g.heim) + spalte('visitor', g.gast);
      } else html += `<div class="leer">${ico('info')}<b>Kein Spielbericht</b><p>Für dieses Spiel liegt noch kein Spielbericht vor. Ergebnis und Chance stehen oben.</p></div>`;
    } else if (g.urteil) {
      html += '<p class="meta">Dieses Spiel wurde kampflos gewertet (Forfait). Die Punkte stehen in der Tabelle.</p>';
    } else {
      const p = prognose(modell, g.heim, g.gast), s = sicht(g);
      html += `${dreiHG(p, g)}${streifenHG(p, g, true)}<div class="cap t2" style="text-align:center;margin-top:8px">${erwartet(p, g)}</div>
        <div class="kacheln" style="margin-top:20px">${[g.heim, g.gast].map(tid => kachel(esc(kurz(tid)), `${platz(tid)}.`, `Teamstärke ${vz(staerke(modell, tid))} Tore · zuletzt ${spieleVon(tid).slice(-3).reverse().map(x => ergebnisAus(x, tid)).join(' ') || 'noch nichts'}`)).join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${s.dabei ? '<button class="btn prim" data-bereich="matchplan">Matchplan</button>' : ''}<button class="btn${s.dabei ? '' : ' prim'}" data-labor="${g.id}" style="${s.dabei ? '' : 'grid-column:1/-1'}">Durchspielen</button></div>`;
    }
    oeffneSheet(`${g.gewertet ? 'Ergebnis' : 'Vorschau'} · Spieltag ${g.runde}`, html);
    ergebnisBildZeigen();
  }

  function teamDetail(id) {
    const z = tabelle.find(x => x.id === id) || { pkt: 0, tp: 0, tm: 0, sp: 0 };
    const nx = naechstes(id), letzte = spieleVon(id).slice(-5).reverse();
    oeffneSheet(`${esc(kurz(id))}`, `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">${logo(id, 48)}<div><div style="font-weight:600">${esc(lang(id))}</div><div class="meta">Platz ${platz(id)} · ${z.pkt} Punkte · ${stand(z.tp, z.tm)} Tore</div></div></div>
      <div class="kacheln">${kachel('Teamstärke', vz(staerke(modell, id)), 'Tore gegenüber dem Schnitt')}${kachel('Platz 1 am Ende', `${Math.round(simBasis.plaetze[id][0] * 100)}<span class="pz">%</span>`, `unter die ersten 3: ${pct(simBasis.plaetze[id][0] + simBasis.plaetze[id][1] + simBasis.plaetze[id][2])}`)}</div>
      ${letzte.length ? `<div class="micro" style="margin:4px 0 8px">Zuletzt, neuestes zuerst</div><div class="formreihe" style="margin-bottom:16px">${letzte.map(g => `<button data-spiel="${g.id}">${formSun(g, id, true)}<span>${esc(kurz(g.heim === id ? g.gast : g.heim).split(' ')[0])}</span><span class="t3">${g.heim === id ? stand(g.toreHeim, g.toreGast) : stand(g.toreGast, g.toreHeim)}</span></button>`).join('')}</div>` : ''}
      ${nx ? `<div class="micro" style="margin-bottom:4px">Nächstes Spiel</div><div class="zeilen" style="margin:0 -16px 16px">${spielZeile(nx, { ohneMarke: true })}</div>` : ''}
      <div style="display:grid;gap:8px">${id !== fokus ? `<button class="btn" data-fokus="${id}">Aus Sicht von ${esc(kurz(id))} ansehen</button>` : ''}<button class="btn" data-kader="${id}">Kader ansehen</button></div>`);
  }

  function spielerinDetail(pid) {
    const s = spNach[pid]; if (!s) return;
    const t = B.teams[s.team];
    const zeilen = t.spiele.map(mid => spielNach[mid]).sort((a, b) => b.datum - a.datum).map(g => {
      const dabei = s.spiele.includes(g.id);
      let wert = '';
      if (dabei && DETAILS[g.id]) { const seite = g.heim === s.team ? 'local' : 'visitor'; const p = DETAILS[g.id].l.data[seite].players.find(x => x.player.id === pid); if (p) wert = s.torwart ? `${g.heim === s.team ? g.toreGast : g.toreHeim} Gegentore` : `${p.goals} T · ${p.assists} A${p.pim ? ` · ${p.pim}'` : ''}`; }
      const geg = g.heim === s.team ? g.gast : g.heim;
      return `<tr class="klick" data-spiel="${g.id}" style="${dabei ? '' : 'opacity:.5'}"><td class="l t2">${tagKurz(g.datum)}</td><td class="l" style="max-width:150px;overflow:hidden;text-overflow:ellipsis">gegen ${esc(kurz(geg))}</td><td>${formSun(g, s.team)}</td><td style="font-weight:600">${dabei ? wert : '<span class="cap t3">nicht dabei</span>'}</td></tr>`;
    }).join('');
    const hz = (K[s.team].torHz[s.name] || [0, 0]);
    const satz = satzVon(s);
    const mitIhm = s.spiele.map(id => spielNach[id]).filter(g => g && g.gewertet);
    const gegen = mitIhm.length ? mitIhm.reduce((a, g) => a + (g.heim === s.team ? g.toreGast : g.toreHeim), 0) / mitIhm.length : null;
    const kach = s.torwart
      ? `<div class="kacheln">${kachel('Spiele', `${s.anz}`, `von ${t.spiele.length} mit Spielbericht`)}${kachel('Gegentore pro Spiel', gegen == null ? '–' : dez(gegen), `Team mit ihm im Kader, Liga ${dez(LIGA.toreProSpiel)}`)}${kachel('Torwirkung', vz(s.einfluss), s.gewichtMitOhne ? 'mit und ohne ihn verglichen' : 'noch zu wenige Spiele ohne ihn')}${kachel('Strafminuten', `${s.pim}`, `in ${s.anz} Spiel${s.anz > 1 ? 'en' : ''}`)}</div>`
      : `<div class="kacheln">${kachel('Scorerpunkte', `${s.punkte}`, `${s.tore} Tore + ${s.assists} Assists`)}${kachel('Punkte pro Spiel', dez(s.punkteProSpiel), `in ${s.anz} von ${t.spiele.length} Spielen`)}${kachel('Anteil an den Teamtoren', `${Math.round(s.anteil * 100)}<span class="pz">%</span>`, `erste Spielhälfte ${hz[0]}, zweite ${hz[1]}`)}${kachel('Torwirkung', vz(s.einfluss), `Tore Unterschied, wenn er spielt · ${s.pim} Strafmin.`)}</div>
      <div class="fussnote" style="margin-top:0">Tore mehr als ein Ersatzspieler: ${vz(s.torbeitrag)}. ${s.mitOhne == null ? 'Noch kein Spiel ohne ihn.' : !s.gewichtMitOhne ? `So lief es mit und ohne ihn: ${vz(s.mitOhne)} Tore, zählt erst ab zwei Spielen mit und zwei ohne ihn.` : `So lief es mit und ohne ihn: ${vz(s.mitOhne)} Tore.`}</div>`;
    oeffneSheet(`#${s.nummer} ${esc(s.name)}`, `<div class="meta" style="display:flex;gap:16px;align-items:center;margin-bottom:16px">${ava(s, 72)}<span style="display:grid;gap:8px"><span style="display:flex;gap:8px;align-items:center">${logo(s.team)} ${esc(lang(s.team))}</span>${positionen(s).length ? `<span class="profiltags">${positionen(s).map((x, i) => i === 0 ? `<span class="etikett lieb" title="Lieblingsposition">${ico('stern', 1)}${POS[x]}</span>` : etikett(POS[x], true)).join('')}</span>` : ''}</span></div>
      ${istRaus(s) ? `<div class="hinweis">${ico('info')}<span>Diese Saison nicht dabei. Im Matchplan und auf dem Kabinenblatt taucht er nicht auf.</span></div>` : ''}
      ${satz ? `<p class="profilsatz">„${esc(satz)}“</p>` : ''}
      ${aemter(s).length ? `<div class="aemter"><span class="micro">Ämter im Team</span><div class="profiltags">${aemter(s).map(a => etikett(esc(a))).join('')}</div></div>` : ''}
      ${kach}
      <div class="micro" style="margin:20px 0 4px">Spiele, neuestes zuerst</div><table class="tab"><tbody>${zeilen}</tbody></table>`);
  }

  function teamWechsler() {
    oeffneSheet('Team wählen', tabelle.map(z => `<button class="listezeile" data-fokus="${z.id}"><span class="platz">${platz(z.id)}</span>${logo(z.id, 28)}<span class="nm">${esc(kurz(z.id))} ${z.id === UNSER ? etikett('eigenes Team') : ''}</span>${z.id === fokus ? ico('haken', 1) : ''}</button>`).join('') + `<p class="cap t2" style="margin:12px 0 0">Beim nächsten Öffnen zeigt ${APP} wieder ${esc(kurz(UNSER))}.</p>`);
  }
  function mehrSheet() {
    oeffneSheet('Mehr', BEREICHE.slice(4).map(b => `<button class="listezeile" data-bereich="${b.id}">${ico(b.ico)}<span class="nm">${b.name}</span>${bereich === b.id ? ico('haken', 1) : ico('chevr', 1).replace('class="ico k"', 'class="ico k t3"')}</button>`).join(''));
  }

  // ================= Zeichnen =================
  let letzteBreite = 0;
  function zeichne(scrollOben) {
    const seiten = { heute: seiteHeute, matchplan: seiteMatchplan, spiele: seiteSpiele, tabelle: seiteTabelle, labor: seiteLabor, spieler: seiteSpieler, teams: seiteTeams, methodik: seiteMethodik, social: seiteSocial };
    if (!seiten[bereich]) bereich = 'heute';
    gerüst();
    $('#inhalt').innerHTML = seiten[bereich]();
    document.title = `${(BEREICHE.find(b => b.id === bereich) || {}).name} · ${APP}`;
    if (bereich === 'labor') laborErgebnis();
    if (bereich === 'spieler') spListe();
    if (bereich === 'social') ergebnisBildZeigen();
    if (bereich === 'heute') karussellStart(); else { clearInterval(karussellUhr); karussellUhr = null; }
    letzteBreite = window.innerWidth;
    if (scrollOben) {
      window.scrollTo(0, 0);
      if (bereich === 'spiele') { const el = document.querySelector('[data-naechste]'); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }
    }
  }
  function wechsle(b) { bereich = b; merk.set('bereich', b); if (bereichAusHash() && bereichAusHash() !== b) history.replaceState(null, '', location.pathname + location.search); schliesseSheet(); zeichne(true); }
  function setzeFokus(id) { fokus = id; labor.spiel = null; schliesseSheet(); zeichne(true); }

  // Aufgeklappte Bild-Karte: jetzt erst das Bild erzeugen
  // Am Computer bleiben die Karten offen
  document.addEventListener('click', e => { const sm = e.target.closest && e.target.closest('details.ebild-karte > summary'); if (sm && window.innerWidth >= 600) e.preventDefault(); }, true);
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.ebild-karte') && e.target.open) ergebnisBildZeigen(); }, true);

  // ================= Ereignisse =================
  document.addEventListener('click', e => {
    if (e.target.matches('input')) return;
    const el = e.target.closest('[data-aktion],[data-bereich],[data-fokus],[data-team],[data-kader],[data-spiel],[data-spielerin],[data-labor],[data-ui],[data-fest],[data-tmsort],[data-einfluss],[data-pin],[data-wert],[data-karussell]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.wert && !el.closest('.pkt') && !ds.ui && !ds.fest && el.tagName !== 'BUTTON') {
      const z = el.closest('.modul, .sinhalt'); const wz = z && z.querySelector('[data-wertzeile]'); if (wz) wz.textContent = ds.wert; return;
    }
    if (ds.pin) { e.preventDefault(); const kd = kaderVon(UNSER === fokus ? fokus : fokus); kd.pins[ds.pin] = !kd.pins[ds.pin]; merk.set('kader', kader); const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.karussell) { karussellPause = Date.now() + 8000; return karussellSchritt(Number(ds.karussell)); }
    if (ds.einfluss) { e.preventDefault(); labor.offen = labor.offen === ds.einfluss ? null : ds.einfluss; const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.aktion) {
      const a = ds.aktion;
      if (a === 'zu') return schliesseSheet();
      if (a === 'team') return teamWechsler();
      if (a === 'mehr') return mehrSheet();
      if (a === 'bildFormat') { bildFormat = el.dataset.format; $$('[data-aktion="bildFormat"]').forEach(b => b.classList.toggle('an', b.dataset.format === bildFormat)); $$('.ebild-vorschau').forEach(v => { v.className = `ebild-vorschau f-${bildFormat}`; v.innerHTML = '<span class="cap t2">Bild wird erstellt …</span>'; }); return ergebnisBildZeigen(); }
      if (a === 'berichtKopieren') { const t = spielberichtText(spielNach[el.dataset.spielId]); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { el.textContent = 'Kopiert ✓'; setTimeout(() => { el.textContent = 'Text kopieren'; }, 2000); }, () => {}); return; }
      if (a === 'bildTeilen') return bildTeilen(bildObj(el.dataset.spielId), el);
      if (a === 'bildSpeichern') return bildSpeichern(bildObj(el.dataset.spielId), el);
      if (a === 'whatsapp') return whatsappSheet();
      if (a === 'waKopieren') { const t = whatsappText(); const ok = () => { el.textContent = 'Kopiert'; }; if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, () => {}); return; }
      if (a === 'kabine') { document.body.classList.add('druck-kabine'); window.print(); return; }
      if (a === 'teilen') { navigator.share({ title: `${APP}: Matchplan`, url: location.href.split('#')[0] }).catch(() => {}); return; }
      if (a === 'introWeg') { merk.set('intro', true); return zeichne(); }
      if (a === 'alleInsights') return oeffneSheet('Auffälligkeiten', auffaelligkeiten(fokus).map(x => `<div class="satz">${x}</div>`).join(''));
      if (a === 'alleSpiele') { ui.spieleTeam = 'alle'; return wechsle('spiele'); }
      if (a === 'filterWeg') { ui.spSuche = ''; ui.spTeam = UNSER; return zeichne(); }
      if (a === 'festWeg') { fest = {}; merk.set('fest', fest); return zeichne(); }
      if (a === 'fokusSiegt') { offen.forEach(o => { if (o.heim === fokus) fest[o.id] = 'H'; if (o.gast === fokus) fest[o.id] = 'G'; }); merk.set('fest', fest); return zeichne(); }
      if (a === 'alleVerf') { kaderVon(fokus).verf = {}; merk.set('kader', kader); return zeichne(); }
      if (a === 'laborUeblich') { laborStandard(spielNach[labor.spiel]); return zeichne(); }
      return;
    }
    if (ds.bereich) return wechsle(ds.bereich);
    if (ds.fokus) return setzeFokus(Number(ds.fokus));
    if (ds.team) return teamDetail(Number(ds.team));
    if (ds.kader) { ui.spTeam = ds.kader; ui.spSuche = ''; return wechsle('spieler'); }
    if (ds.labor) { const g = spielNach[ds.labor]; labor.spiel = g.id; laborStandard(g); labor.offen = null; if (bereich !== 'labor') return wechsle('labor'); return zeichne(); }
    if (el.closest('.pkt')) { const p = el.closest('.pkt'); const z = p.closest('.modul'); const wz = z && z.querySelector('[data-wertzeile]'); if (wz && wz.textContent !== p.dataset.wert) { wz.textContent = p.dataset.wert; return; } return spielDetail(Number(p.dataset.spiel)); }
    if (ds.spiel) return spielDetail(Number(ds.spiel));
    if (ds.spielerin) return spielerinDetail(ds.spielerin);
    if (ds.ui) {
      const k = ds.ui; ui[k] = ds.wert;
      if (k === 'spTeam') { const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
      if (k === 'spSort') { $$(`[data-ui="${k}"]`).forEach(b => b.classList.toggle('an', b.dataset.wert === ds.wert)); return spListe(); }
      return zeichne(k === 'spieleTeam');
    }
    if (ds.fest) { if (fest[ds.fest] === ds.wert) delete fest[ds.fest]; else fest[ds.fest] = ds.wert; merk.set('fest', fest); const y = window.scrollY; zeichne(); window.scrollTo(0, y); return; }
    if (ds.tmsort) { if (ui.tmSort === ds.tmsort) ui.tmAb = !ui.tmAb; else { ui.tmSort = ds.tmsort; ui.tmAb = ds.tmsort !== 'name'; } return zeichne(); }
  });
  document.addEventListener('change', e => {
    const t = e.target, y = window.scrollY;
    if (t.dataset.verf) { const kd = kaderVon(fokus); if (t.checked) delete kd.verf[t.dataset.verf]; else kd.verf[t.dataset.verf] = false; merk.set('kader', kader); zeichne(); window.scrollTo(0, y); return; }
    if (t.dataset.dabei) { labor.dabei[t.dataset.dabei] = t.checked; t.closest('.sz').classList.toggle('aus', !t.checked); const m = t.closest('.modul'); const kopf = m.querySelector('.listenkopf .meta'); if (kopf) { const alle = m.querySelectorAll('[data-dabei]'); kopf.textContent = `${[...alle].filter(x => x.checked).length} von ${alle.length} dabei`; } return laborErgebnis(); }
    if (t.id === 'neutral') { labor.neutral = t.checked; return laborErgebnis(); }
    if (t.id === 'spTeamWahl') { ui.spTeam = t.value === 'alle' ? 'alle' : Number(t.value); return zeichne(); }
    if (t.dataset.eigen) { merk.set('eigene', labor.eigene); return; }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'formF' || t.id === 'formG') {
      const v = Number(t.value); labor.form[t.id === 'formF' ? 'f' : 'g'] = v;
      const pos = (v + 4) / 8 * 100; t.style.setProperty('--f0', Math.min(50, pos) + '%'); t.style.setProperty('--f1', Math.max(50, pos) + '%');
      const o = $('#' + t.id + 'W'); o.textContent = v ? vz(v) : '0'; o.classList.toggle('null', !v);
      return laborErgebnis();
    }
    if (t.dataset.eigen) {
      const v = Number(t.value); labor.eigene[t.dataset.eigen] = v;
      const pos = (v + 2) / 10 * 100; t.style.setProperty('--f0', Math.min(20, pos) + '%'); t.style.setProperty('--f1', Math.max(20, pos) + '%');
      t.parentNode.querySelector('output').textContent = vz(v);
      const btn = t.closest('.sz').querySelector('.wirk'); if (btn) btn.innerHTML = `${vz(v)}<small>Tore</small>`;
      return laborErgebnis();
    }
    if (t.id === 'spSuche') { ui.spSuche = t.value; return spListe(); }
  });
  window.addEventListener('hashchange', () => { if (bereichAusHash()) { bereich = bereichAusHash(); merk.set('bereich', bereich); } schliesseSheet(); zeichne(); });
  if (/^#whatsapp$/i.test(location.hash)) { history.replaceState(null, '', location.pathname + location.search); if (fokus !== UNSER) { fokus = UNSER; } wechsle('matchplan'); whatsappSheet(); }
  window.addEventListener('afterprint', () => document.body.classList.remove('druck-kabine'));
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey && BEREICHE[Number(e.key) - 1]) wechsle(BEREICHE[Number(e.key) - 1].id);
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(window.innerWidth - letzteBreite) > 40) { const y = window.scrollY; zeichne(); window.scrollTo(0, y); } }, 180); });

  // Service Worker für die Halle ohne Empfang. Liegt im Wurzelverzeichnis, weil der Geltungsbereich auf das Verzeichnis
  // der Datei begrenzt ist und app/ die Daten aus ../daten/ lädt. Scheitert die Registrierung, läuft die App wie bisher.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('../sw.js').catch(() => {}); } catch (e) {}
  }

  zeichne(true);
})();
