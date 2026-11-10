// Social images in the style of the Broilers' Instagram posts: "GAME DAY" before a match, "END STAND" after it.
// Formats: feed 4:5, square 1:1, story 9:16. Upper part dark (optional team photo daten/fotos/team.jpg, used only
// with the team's consent), huge white title over a torn-paper edge, light lower part with league line, time or
// score in a black box, both crests, venue with a pin at the bottom.
// Draws on a canvas; logos and photos must be same-origin (daten/logos, daten/fotos), otherwise the canvas is tainted.
(function () {
  'use strict';
  const W = 1080;
  const FORMATS = {
    feed: { h: 1350, edge: 0.5, title: 250, top: 0, bottom: 0 },
    quadrat: { h: 1080, edge: 0.47, title: 200, top: 0, bottom: 0 },
    story: { h: 1920, edge: 0.5, title: 300, top: 160, bottom: 200 },
  };
  const F = { black: 'BullyLatoBlack', bold: 'BullyLatoBold', cond: 'BullyOswald' };
  const C = { dark: '#141416', dark2: '#2A2A2E', paper: '#ECECEC', ink: '#1A1A1C', grey: '#6E6E73', light: '#B9B9BE', white: '#FFFFFF', gold: '#E1A72A', red: '#D93A2B' };

  let fonts = null;
  function loadFonts() {
    if (fonts) return fonts;
    const list = [
      new FontFace(F.black, "url('assets/fonts/lato-black.woff') format('woff')", { weight: '900' }),
      new FontFace(F.bold, "url('assets/fonts/lato-bold.woff') format('woff')", { weight: '700' }),
      new FontFace(F.cond, "url('assets/fonts/oswald-700.woff') format('woff')", { weight: '700' }),
    ];
    fonts = Promise.all(list.map(f => f.load().then(x => { document.fonts.add(x); return x; }).catch(() => null)));
    return fonts;
  }
  function loadImage(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => res(null);
      i.src = src;
    });
  }
  // Shrink text until it fits the width
  function fit(ctx, text, family, size, maxW, weight = '') {
    let g = size;
    do { ctx.font = `${weight} ${g}px ${family}`.trim(); g -= 2; } while (ctx.measureText(text).width > maxW && g > 12);
    return g + 2;
  }
  // Seeded random so the torn edge stays the same for one match
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function background(ctx, H, edgeY, photo) {
    if (photo) {
      const q = Math.max(W / photo.width, edgeY / photo.height), w = photo.width * q, h = photo.height * q;
      ctx.drawImage(photo, (W - w) / 2, Math.min(0, (edgeY - h) / 2), w, h);
      const g = ctx.createLinearGradient(0, 0, 0, edgeY);
      g.addColorStop(0, 'rgba(10,10,12,.35)'); g.addColorStop(1, 'rgba(10,10,12,.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, edgeY + 40);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, W, edgeY);
    g.addColorStop(0, C.dark2); g.addColorStop(1, C.dark);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, edgeY + 40);
    // floorball holes as a quiet texture
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 3;
    for (let y = 60; y < edgeY; y += 120) for (let x = (y / 120) % 2 ? 60 : 0; x < W + 60; x += 120) { ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // gold sweep like the crest ribbon
    ctx.save(); ctx.globalAlpha = .9; ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.moveTo(W - 300, 0); ctx.lineTo(W - 250, 0); ctx.lineTo(W - 470, edgeY); ctx.lineTo(W - 520, edgeY); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(W - 220, 0); ctx.lineTo(W - 200, 0); ctx.lineTo(W - 420, edgeY); ctx.lineTo(W - 440, edgeY); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function tornPaper(ctx, H, edgeY, seed) {
    const r = rng(seed);
    ctx.save();
    ctx.fillStyle = C.paper;
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = -6;
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, edgeY + 10);
    for (let x = 0; x <= W; x += 18) ctx.lineTo(x, edgeY + (r() - 0.5) * 26 + Math.sin(x / 90) * 8);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.restore();
    // light fibres along the edge
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = r() * W, y = edgeY + (r() - 0.5) * 20; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + r() * 16, y + (r() - 0.5) * 6); ctx.stroke(); }
    ctx.restore();
  }

  function crest(ctx, img, mono, cx, cy, size) {
    if (img) {
      const q = Math.min(size / img.width, size / img.height), w = img.width * q, h = img.height * q;
      ctx.save(); ctx.beginPath(); ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 18); ctx.clip();
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); ctx.restore();
      return;
    }
    ctx.save(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 18); ctx.fill();
    ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(size * .42)}px ${F.black}`;
    ctx.fillText(mono || '?', cx, cy + 4); ctx.restore();
  }

  function pin(ctx, x, y, s, color) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, y + s); ctx.bezierCurveTo(x - s * .9, y + s * .1, x - s * .6, y - s * .75, x, y - s * .75);
    ctx.bezierCurveTo(x + s * .6, y - s * .75, x + s * .9, y + s * .1, x, y + s); ctx.fill();
    ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(x, y - s * .2, s * .25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  // d.art: 'ergebnis' (end stand) or 'matchday' (game day)
  async function draw(d, format = 'feed') {
    const L = FORMATS[format] || FORMATS.feed, H = L.h, md = d.art === 'matchday';
    await loadFonts();
    const [lHome, lAway, photo] = await Promise.all([loadImage(d.heim.logo), loadImage(d.gast.logo), loadImage(d.foto || null)]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const usable = H - L.top - L.bottom;
    const edgeY = L.top + usable * L.edge;
    background(ctx, H, edgeY, photo);
    tornPaper(ctx, H, edgeY, String(d.heim.name + d.gast.name + d.runde).split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));

    // date top left (game day) or result label (end stand)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const tx = 64, ty = L.top + 64;
    if (md && d.tag) {
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = `140px ${F.black}`; ctx.fillText(d.tag, tx, ty + 120);
      ctx.fillStyle = 'rgba(205,205,210,.82)'; ctx.font = `92px ${F.black}`; ctx.fillText(d.monat, tx, ty + 214);
    } else if (md) {
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = `64px ${F.black}`; ctx.fillText('TERMIN', tx, ty + 70); ctx.fillText('FOLGT', tx, ty + 136);
    } else if (d.etikett) {
      ctx.font = `56px ${F.black}`;
      const w = ctx.measureText(d.etikett).width + 56;
      ctx.fillStyle = d.etikett === 'SIEG' ? C.gold : d.etikett === 'REMIS' ? C.light : C.white;
      ctx.beginPath(); ctx.roundRect(tx, ty + 20, w, 84, 10); ctx.fill();
      ctx.fillStyle = C.ink; ctx.fillText(d.etikett, tx + 28, ty + 83);
    }

    // huge title, second line sitting on the torn edge
    const lines = md ? ['GAME', 'DAY'] : ['END', 'STAND'];
    ctx.textAlign = 'center'; ctx.fillStyle = C.white;
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    const ts = Math.min(...lines.map(l => fit(ctx, l, F.black, L.title, W - 110, '900')));
    ctx.font = `900 ${ts}px ${F.black}`;
    const lh = ts * 0.86;
    ctx.fillText(lines[0], W / 2, edgeY - lh * 0.42);
    ctx.fillText(lines[1], W / 2, edgeY + lh * 0.5);
    ctx.shadowColor = 'transparent';

    // league line
    let y = edgeY + lh * 0.5 + 78;
    const liga = `${d.liga} – ${d.eigenSeite === 'gast' ? d.gast.name : d.heim.name}`.toUpperCase();
    ctx.fillStyle = C.ink; fit(ctx, liga, F.bold, 40, W - 140, '700'); ctx.fillText(liga, W / 2, y);

    // middle row between league line and footer: crests left and right, box in the middle
    const fy = H - L.bottom - 58, frei = (fy - 64) - y;
    const cs = Math.max(110, Math.min(220, frei * 0.42));
    const rowY = y + 30 + Math.max(cs / 2 + 70, Math.min(frei * 0.34, cs / 2 + 220));
    crest(ctx, lHome, d.heim.mono, 220, rowY, cs);
    crest(ctx, lAway, d.gast.mono, W - 220, rowY, cs);
    const bw = 300, bh = 116;
    if (md) {
      ctx.fillStyle = C.ink; ctx.font = `64px ${F.black}`; ctx.fillText(d.zeit || 'TBA', W / 2, rowY - 34);
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2 + 20, rowY - 8, bw - 40, bh - 20, 4); ctx.fill();
      ctx.fillStyle = C.white; ctx.font = `76px ${F.black}`; ctx.fillText('VS.', W / 2, rowY + 70);
    } else {
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, rowY - bh / 2 - 8, bw, bh + 16, 6); ctx.fill();
      ctx.font = `104px ${F.black}`; ctx.textBaseline = 'middle';
      const h = String(d.toreHeim), a = String(d.toreGast);
      ctx.textAlign = 'right'; ctx.fillStyle = d.eigenSeite === 'heim' ? C.gold : C.white; ctx.fillText(h, W / 2 - 26, rowY + 4);
      ctx.textAlign = 'left'; ctx.fillStyle = d.eigenSeite === 'gast' ? C.gold : C.white; ctx.fillText(a, W / 2 + 26, rowY + 4);
      ctx.textAlign = 'center'; ctx.fillStyle = C.white; ctx.fillText(':', W / 2, rowY);
      ctx.textBaseline = 'alphabetic';
      const sub = [d.zusatz, d.perioden].filter(Boolean).join(' · ');
      if (sub) { ctx.fillStyle = C.grey; fit(ctx, sub, F.bold, 30, 420, '700'); ctx.fillText(sub, W / 2, rowY + bh / 2 + 52); }
    }
    // team names under the crests
    ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    [[d.heim.kurz || d.heim.name, 220], [d.gast.kurz || d.gast.name, W - 220]].forEach(([n, x]) => { fit(ctx, n.toUpperCase(), F.cond, 32, 300, '700'); ctx.fillText(n.toUpperCase(), x, rowY + cs / 2 + 44); });

    // saying, only if there is room above the footer
    const sy = rowY + cs / 2 + 112;
    if (d.spruch && sy < fy - 80) { ctx.fillStyle = C.grey; ctx.textAlign = 'center'; fit(ctx, d.spruch, F.bold, 36, W - 160, '700'); ctx.fillText(d.spruch, W / 2, sy); }

    // footer: venue left with pin, club right
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64, fy - 52); ctx.lineTo(W - 64, fy - 52); ctx.stroke();
    ctx.textAlign = 'left';
    if (d.halle) {
      pin(ctx, 84, fy - 12, 26, C.ink);
      ctx.fillStyle = C.ink; fit(ctx, d.halle, F.bold, 28, 520, '700'); ctx.fillText(d.halle, 124, fy - 10);
      ctx.fillStyle = C.grey; ctx.font = `700 22px ${F.bold}`; ctx.fillText(md ? (d.datumLang || '') : `Spieltag ${d.runde} · ${d.datumLang}`, 124, fy + 22);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = C.ink; ctx.font = `700 34px ${F.cond}`; ctx.fillText('BERLIN BROILERS', W - 64, fy - 8);
    ctx.fillStyle = C.gold; ctx.font = `700 26px ${F.cond}`; ctx.fillText('04 · FLOORBALL', W - 64, fy + 24);
    return c;
  }

  window.ergebnisBild = draw;
  window.ergebnisBildBlob = (d, format) => draw(d, format).then(c => new Promise(res => c.toBlob(res, 'image/png')));
})();
