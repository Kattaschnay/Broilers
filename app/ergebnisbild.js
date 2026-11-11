// Social images in the style of the Broilers' own posts (design reference: Janek_Floorball.pdf, pages 2 and 4).
// Announcement "NEXT MATCH": dark #09111A, rooster dimmed in the centre, white rusty title, rows "Home VS Away",
// date / times and hall at the bottom. Result "MATCH RESULTS": rooster large on the left, gold rusty title,
// rows with the score in place of "VS", scorers below. One image per match day with all own games of that day.
// The original title font (Zing Rust) is commercial; Anton (OFL) plus a generated rust texture stands in for it.
// Formats: feed 4:5, square 1:1, story 9:16. The design is laid out on a 1080 square and centred vertically.
(function () {
  'use strict';
  const W = 1080, S = 1080;
  const FORMATS = { feed: { h: 1350 }, quadrat: { h: 1080 }, story: { h: 1920 } };
  const C = { bg: '#09111A', gold: '#D09E49', white: '#FFFFFF', soft: 'rgba(255,255,255,.92)' };
  const F = { title: 'BullyAnton', text: 'BullyLato', bold: 'BullyLatoBold' };

  let ready = null;
  function load() {
    if (ready) return ready;
    const fonts = [
      new FontFace(F.title, "url('assets/fonts/anton.woff') format('woff')"),
      new FontFace(F.text, "url('assets/fonts/lato-regular.woff') format('woff')"),
      new FontFace(F.bold, "url('assets/fonts/lato-bold.woff') format('woff')"),
    ].map(f => f.load().then(x => { document.fonts.add(x); }).catch(() => null));
    ready = Promise.all([img('assets/hahn-ohne.webp'), img('assets/rost.png'), ...fonts]).then(([hahn, rost]) => ({ hahn, rost }));
    return ready;
  }
  function img(src) {
    return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }
  function fit(ctx, text, family, size, maxW, weight = '') {
    let g = size;
    do { ctx.font = `${weight} ${g}px ${family}`.trim(); g -= 2; } while (ctx.measureText(text).width > maxW && g > 10);
    return g + 2;
  }
  // Rusty title text: sized by cap height (cap), drawn on its own canvas, then the rust texture punches holes into it.
  // y is the baseline. opt.maxW squeezes the text horizontally (like the condensed original).
  function rusty(ctx, A, text, x, y, cap, color, opt = {}) {
    const c = document.createElement('canvas'), k = c.getContext('2d');
    k.font = `100px ${F.title}`;
    const m = k.measureText('H'), ratio = (m.actualBoundingBoxAscent || 73) / 100;
    const size = cap / ratio;
    k.font = `${size}px ${F.title}`;
    let w = k.measureText(text).width;
    const sx = (opt.maxW && w > opt.maxW ? opt.maxW / w : 1) * (opt.wide || 1);
    w *= sx;
    const pad = size * 0.25;
    c.width = Math.ceil(w + pad * 2 + Math.abs(opt.skew || 0) * cap); c.height = Math.ceil(cap + pad * 2);
    k.font = `${size}px ${F.title}`; k.textBaseline = 'alphabetic'; k.fillStyle = color;
    k.save(); k.translate(pad, pad + cap); if (opt.skew) k.transform(1, 0, opt.skew, 1, 0, 0); k.scale(sx, 1); k.fillText(text, 0, 0); k.restore();
    if (A.rost) {
      k.globalCompositeOperation = 'destination-in';
      const scale = Math.max(0.35, cap / 260), pat = k.createPattern(A.rost, 'repeat');
      k.save(); k.scale(scale, scale); k.translate(-((opt.seed || 0) * 37 % 512), -((opt.seed || 0) * 91 % 512)); k.fillStyle = pat; k.fillRect(0, 0, c.width / scale + 1024, c.height / scale + 1024); k.restore();
    }
    const left = opt.align === 'center' ? x - w / 2 - pad : opt.align === 'right' ? x - w - pad : x - pad;
    ctx.drawImage(c, left, y - cap - pad);
    return w;
  }
  function background(ctx, H, A, mode, oy) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (!A.hahn) return;
    if (mode === 'announce') {
      // rooster centred, dimmed behind the text
      const s = S * 1.15, x = (W - s) / 2 + s * 0.1, y = oy + S * 0.19;
      ctx.drawImage(A.hahn, x, y, s * 0.8, s * 0.711);
      ctx.fillStyle = 'rgba(9,17,26,.62)'; ctx.fillRect(0, 0, W, H);
      // the wordmark under the rooster stays hidden: fade to the background at the bottom
      const g = ctx.createLinearGradient(0, oy + S * 0.9, 0, oy + S * 1.05); g.addColorStop(0, 'rgba(9,17,26,0)'); g.addColorStop(1, C.bg);
      ctx.fillStyle = g; ctx.fillRect(0, oy + S * 0.9, W, H);
    } else {
      // rooster large on the left, head at the left edge, slightly dimmed
      const s = S * 1.56;
      ctx.drawImage(A.hahn, -0.71 * S + s * 0.1, oy - 0.01 * S, s * 0.8, s * 0.711);
      ctx.fillStyle = 'rgba(9,17,26,.22)'; ctx.fillRect(0, 0, W, H);
    }
  }
  function text(ctx, t, x, y, size, color, opt = {}) {
    ctx.fillStyle = color; ctx.textAlign = opt.align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(9,17,26,.85)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2; // stays readable on the rooster
    if (opt.maxW) fit(ctx, t, opt.bold ? F.bold : F.text, size, opt.maxW, opt.bold ? '700' : '');
    else ctx.font = `${opt.bold ? '700 ' : ''}${size}px ${opt.bold ? F.bold : F.text}`;
    ctx.fillText(t, x, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  // wraps only between list items ("3x Janek, 2x Lennart") so a name never splits
  function wrap(ctx, t, maxW) {
    const words = t.split(', '), lines = []; let cur = '';
    words.forEach((w, i) => { const item = w + (i < words.length - 1 ? ',' : ''); const n = cur ? cur + ' ' + item : item; if (ctx.measureText(n).width > maxW && cur) { lines.push(cur); cur = item; } else cur = n; });
    if (cur) lines.push(cur);
    return lines;
  }

  // d: { art: 'matchday'|'ergebnis', liga, datum ('15.03.2026'), datumLang, halle, zeiten ('12:30 & 14 Uhr'),
  //      spiele: [{ heim, gast, toreHeim, toreGast, zusatz }], torschuetzen ('3x Janek, 2x Lennart'), seed }
  async function draw(d, format = 'feed') {
    const H = (FORMATS[format] || FORMATS.feed).h, oy = (H - S) / 2;
    const A = await load();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const seed = d.seed || 1, md = d.art === 'matchday';
    background(ctx, H, A, md ? 'announce' : 'result', oy);
    const spiele = (d.spiele || []).slice(0, 3);

    // positions measured on the reference posts (1250 px) and scaled to 1080
    if (md) {
      rusty(ctx, A, 'NEXT', 152, oy + 132, 64, C.white, { skew: -0.14, seed });
      rusty(ctx, A, 'MATCH', 250, oy + 336, 182, C.white, { maxW: 605, seed: seed + 3 });
      text(ctx, (d.liga || '').toUpperCase(), 245, oy + 396, 31, C.white, { maxW: 700 });
      const n = spiele.length, top = oy + (n === 1 ? 650 : n === 2 ? 575 : 545), step = n === 3 ? 130 : 160;
      spiele.forEach((g, i) => {
        const y = top + i * step;
        text(ctx, g.heim, 100, y, 45, C.white, { maxW: 425 });
        rusty(ctx, A, 'VS', 577, y + 6, 52, C.gold, { align: 'center', skew: -0.1, seed: seed + 11 + i });
        text(ctx, g.gast, 640, y, 45, C.white, { maxW: 425 });
      });
      const dy = oy + 966;
      text(ctx, d.datum || 'Termin folgt', 500, dy, 50, C.white, { align: 'right' });
      rusty(ctx, A, '/', 566, dy + 8, 50, C.gold, { align: 'center', skew: -0.15, seed: seed + 21 });
      if (d.zeiten) text(ctx, d.zeiten, 640, dy, 50, C.white, { maxW: 420 });
      if (d.halle) text(ctx, d.halle, W / 2, oy + 1030, 29, C.white, { align: 'center', maxW: 900 });
    } else {
      rusty(ctx, A, 'MATCH', 275, oy + 132, 64, C.gold, { skew: -0.14, seed });
      rusty(ctx, A, 'RESULTS', 300, oy + 336, 182, C.gold, { maxW: 740, seed: seed + 5 });
      text(ctx, `${(d.liga || '').toUpperCase()} | ${(d.datumLang || '').toUpperCase()}`, 640, oy + 404, 27, C.gold, { align: 'center', maxW: 700 });
      spiele.forEach((g, i) => {
        const y = oy + 520 + i * 100;
        text(ctx, g.heim, 286, y, 38, C.gold, { bold: true, maxW: 300 });
        rusty(ctx, A, `${g.toreHeim}:${g.toreGast}`, 646, y + 4, 46, C.white, { align: 'center', seed: seed + 13 + i });
        text(ctx, g.gast + (g.zusatz ? ` (${g.zusatz})` : ''), 722, y, 38, C.gold, { bold: true, maxW: 330 });
      });
      if (d.torschuetzen) {
        ctx.font = `30px ${F.text}`;
        const lines = wrap(ctx, d.torschuetzen, 560).slice(0, 4);
        const y0 = oy + 520 + spiele.length * 100 + 50;
        lines.forEach((l, i) => text(ctx, l, 720, y0 + i * 42, 30, C.gold, { align: 'center' }));
      }
    }
    // footer for the taller formats: club line
    if (H > S) {
      ctx.globalAlpha = .75;
      text(ctx, 'BERLIN BROILERS 04 · FLOORBALL', W / 2, H - (format === 'story' ? 250 : 60), 26, C.gold, { align: 'center', bold: true });
      ctx.globalAlpha = 1;
    }
    return c;
  }

  window.ergebnisBild = draw;
  window.ergebnisBildBlob = (d, format) => draw(d, format).then(c => new Promise(res => c.toBlob(res, 'image/png')));
})();
