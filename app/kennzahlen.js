// Kennzahlen je Team aus den Spielberichten (Tore mit Minute, Strafen, Auszeiten), Grundlage für den Matchplan.
// Floorball: sechs gleich lange Abschnitte (passen zu Halbzeiten und Dritteln), Strafschüsse, Zeitstrafen, Über- und Unterzahl.

function teamKennzahlen(details, spiele, verlaeufe, teamIds) {
  const k = {};
  teamIds.forEach(id => k[id] = {
    spiele: 0, tore: [0, 0, 0, 0, 0, 0], gegen: [0, 0, 0, 0, 0, 0],
    smTor: 0, smFehl: 0, smGegenTor: 0, smGegenFehl: 0, zwei: 0, zweiGegner: 0, auszeiten: 0, strafmin: 0,
    ppTore: 0, ppGegen: 0, shTore: 0, shGegen: 0, // Tore in Überzahl/Unterzahl (aus den Strafzeiten abgeleitet)
    torHz: {}, // Spieler -> [Tore 1. Spielhälfte, Tore 2. Spielhälfte]
    serienGegen: 0, serienFuer: 0, // Läufe von 3 oder mehr Toren in Folge
  });
  spiele.filter(g => g.gewertet && verlaeufe[g.id] && details[g.id] && details[g.id].e).forEach(g => {
    const v = verlaeufe[g.id];
    const ev = details[g.id].e.data || [];
    [g.heim, g.gast].forEach(tid => {
      const x = k[tid]; x.spiele++;
      v.tore.forEach(t => {
        const s = Math.min(5, Math.floor((t.min - 0.001) / ((window.SPORT && window.SPORT.slotMin) || 10)));
        (t.team === tid ? x.tore : x.gegen)[s]++;
        if (t.team === tid && t.name) { x.torHz[t.name] = x.torHz[t.name] || [0, 0]; x.torHz[t.name][t.hz - 1]++; }
        if (t.staerke === 'ueberzahl') t.team === tid ? x.ppTore++ : x.ppGegen++;
        if (t.staerke === 'unterzahl') t.team === tid ? x.shTore++ : x.shGegen++;
      });
      // Läufe: drei oder mehr Tore eines Teams ohne Gegentor
      let lauf = 0, wer = null;
      v.tore.forEach(t => {
        if (t.team === wer) lauf++; else { if (lauf >= 3) (wer === tid ? x.serienFuer++ : x.serienGegen++); wer = t.team; lauf = 1; }
      });
      if (lauf >= 3) (wer === tid ? x.serienFuer++ : x.serienGegen++);
      ev.forEach(e => {
        const eigen = (e.is_home ? g.heim : g.gast) === tid;
        const n = e.event_type ? e.event_type.name : '';
        if (/Strafschuss Tor/.test(n)) eigen ? x.smTor++ : x.smGegenTor++;
        else if (/Strafschuss Fehl/.test(n)) eigen ? x.smFehl++ : x.smGegenFehl++;
        else if (e.event_type && e.event_type.is_sanction) { const a = e.anzahl || 0; if (eigen) { x.zwei += a; x.strafmin += e.minuten || 0; } else x.zweiGegner += a; }
        else if (/Auszeit/.test(n) && eigen) x.auszeiten++;
      });
    });
  });
  Object.values(k).forEach(x => {
    const n = x.spiele || 1;
    x.toreSumme = x.tore.reduce((a, b) => a + b, 0);
    x.gegenSumme = x.gegen.reduce((a, b) => a + b, 0);
    x.diffAbschnitt = x.tore.map((t, i) => (t - x.gegen[i]) / n);
    x.smGegen = x.smGegenTor + x.smGegenFehl;
    x.smGegenProSpiel = x.smGegen / n;
    x.smQuote = (x.smTor + x.smFehl) ? x.smTor / (x.smTor + x.smFehl) : null;
    x.zweiProSpiel = x.zwei / n;
    x.strafminProSpiel = x.strafmin / n;
    x.ppQuote = x.zweiGegner ? x.ppTore / x.zweiGegner : null; // Überzahltore je Strafe des Gegners
    x.pkQuote = x.zwei ? 1 - x.ppGegen / x.zwei : null;        // überstandene eigene Strafen
    x.toreProSpiel = x.toreSumme / n;
    x.gegenProSpiel = x.gegenSumme / n;
  });
  return k;
}

function ligaKennzahlen(k) {
  const t = Object.values(k).filter(x => x.spiele);
  const s = f => t.reduce((a, x) => a + f(x), 0);
  const n = s(x => x.spiele) || 1;
  return {
    smGegenProSpiel: s(x => x.smGegen) / n,
    zweiProSpiel: s(x => x.zwei) / n,
    ppQuote: s(x => x.ppTore) / (s(x => x.zweiGegner) || 1),
    smQuote: s(x => x.smTor) / (s(x => x.smTor + x.smFehl) || 1),
    toreProSpiel: s(x => x.toreSumme) / n,
    abschnitt: [0, 1, 2, 3, 4, 5].map(i => s(x => x.tore[i]) / n),
  };
}
