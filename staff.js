/* Minimal SVG staff renderer (no music font needed: clefs are drawn as paths). */
(function (root) {
  'use strict';
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SP = 10;                 // distance between staff lines
  const TOP = 40;                // y of top staff line
  const BOTTOM = TOP + 4 * SP;
  // diatonic index of bottom line: treble E4, bass G2
  const BOTTOM_D = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 };
  const SHARP_D = [38, 35, 39, 36, 33, 37, 34], FLAT_D = [34, 37, 33, 36, 32, 35, 31]; // treble positions
  const ACC = { '#': '♯', b: '♭', '##': '𝄪', bb: '♭♭', n: '♮' };

  function parse(name) { // "F#4"
    const m = /^([A-G])(##|bb|#|b|n)?(-?\d)$/.exec(name); if (!m) return null;
    return { letter: m[1], acc: m[2] || '', oct: +m[3], d: +m[3] * 7 + LETTERS.indexOf(m[1]) };
  }
  const yOf = (d, clef) => BOTTOM - (d - BOTTOM_D[clef]) * SP / 2;

  function clefPath(clef, x) {
    if (clef === 'treble') {
      return `<g transform="translate(${x},${TOP - 4})" fill="none" stroke="currentColor" stroke-linecap="round">
        <path stroke-width="2.4" d="M13 60 L17 -10 C20 -18 27 -8 21 1 C13 13 2 19 3 31 C4 43 23 44 24 33 C25 24 12 22 11 30 C11 34 14 37 17 36"/>
        <path stroke-width="2.4" d="M13 60 C12 66 4 66 4 61"/><circle cx="6" cy="61" r="3" fill="currentColor" stroke="none"/></g>`;
    }
    return `<g transform="translate(${x},${TOP})" stroke="currentColor" fill="none" stroke-linecap="round">
      <path stroke-width="2.8" d="M5 10 C5 1 21 -1 24 9 C27 21 16 33 3 40"/><circle cx="7" cy="10" r="3.6" fill="currentColor" stroke="none"/>
      <circle cx="30" cy="5" r="1.9" fill="currentColor" stroke="none"/><circle cx="30" cy="15" r="1.9" fill="currentColor" stroke="none"/></g>`;
  }

  /**
   * opts: { clef, notes: [{name:'E4', color?}], mode:'chord'|'seq', keySig:{sharps|flats:n}, width, label?: [strings under notes], showQuestion }
   */
  function render(opts = {}) {
    const clef = opts.clef || 'treble', notes = (opts.notes || []).map((n) => (typeof n === 'string' ? { name: n } : n));
    const ks = opts.keySig || {}, nAcc = ks.sharps || ks.flats || 0;
    const ksX = 46, startX = ksX + nAcc * 10 + 22;
    const step = opts.mode === 'chord' ? 0 : 44;
    const width = opts.width || Math.max(220, startX + (opts.mode === 'chord' ? 60 : notes.length * step + 30));
    const H = 140;
    let s = `<svg class="staff" viewBox="0 0 ${width} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${clef} clef staff">`;
    for (let i = 0; i < 5; i++) s += `<line x1="4" x2="${width - 4}" y1="${TOP + i * SP}" y2="${TOP + i * SP}" stroke="currentColor" stroke-width="1"/>`;
    s += `<line x1="4" x2="4" y1="${TOP}" y2="${BOTTOM}" stroke="currentColor"/>`;
    s += clefPath(clef, 10);
    // key signature
    const off = clef === 'bass' ? -12 : 0;
    for (let i = 0; i < nAcc; i++) {
      const d = (ks.sharps ? SHARP_D[i] : FLAT_D[i]) + off;
      s += `<text x="${ksX + i * 10}" y="${yOf(d, clef) + 5}" class="acc">${ks.sharps ? '♯' : '♭'}</text>`;
    }
    // notes
    const ps = notes.map((n) => ({ ...n, p: parse(n.name) })).filter((n) => n.p);
    const sorted = opts.mode === 'chord' ? [...ps].sort((a, b) => a.p.d - b.p.d).filter((n) => !n.hidden) : ps;
    sorted.forEach((n, i) => {
      if (n.hidden) return;
      let x = startX + (opts.mode === 'chord' ? 10 : i * step);
      if (opts.mode === 'chord' && i > 0 && sorted[i].p.d - sorted[i - 1].p.d === 1 && !sorted[i - 1].shifted) { x += 12; n.shifted = true; } // seconds side-by-side
      const y = yOf(n.p.d, clef), color = n.color || 'currentColor';
      const bd = BOTTOM_D[clef], td = bd + 8;
      for (let d = bd - 2; d >= n.p.d; d -= 2) s += `<line x1="${x - 10}" x2="${x + 10}" y1="${yOf(d, clef)}" y2="${yOf(d, clef)}" stroke="currentColor"/>`;
      for (let d = td + 2; d <= n.p.d; d += 2) s += `<line x1="${x - 10}" x2="${x + 10}" y1="${yOf(d, clef)}" y2="${yOf(d, clef)}" stroke="currentColor"/>`;
      if (n.p.acc) s += `<text x="${x - 20}" y="${y + 5}" class="acc" fill="${color}">${ACC[n.p.acc]}</text>`;
      s += `<ellipse cx="${x}" cy="${y}" rx="6.4" ry="4.6" transform="rotate(-20 ${x} ${y})" fill="${color}"/>`;
      if (opts.mode !== 'chord') { const up = n.p.d < bd + 4; s += `<line x1="${up ? x + 5.8 : x - 5.8}" x2="${up ? x + 5.8 : x - 5.8}" y1="${y}" y2="${up ? y - 32 : y + 32}" stroke="${color}" stroke-width="1.3"/>`; }
      if (opts.labels && opts.labels[i] != null) s += `<text x="${x}" y="${H - 6}" class="lbl">${opts.labels[i]}</text>`;
    });
    if (opts.showQuestion) s += `<text x="${startX + (notes.length ? step || 40 : 10)}" y="${TOP + 26}" class="q">?</text>`;
    return s + '</svg>';
  }

  // ---------------- grand staff (treble + bass) ----------------
  /** opts: { notes:[{name, color}], mode:'chord'|'seq', keySig, labels, width } — notes ≥ C4 go to treble, below to bass (or n.staff) */
  function renderGrand(opts = {}) {
    const notes = (opts.notes || []).map((n) => (typeof n === 'string' ? { name: n } : n));
    const isTreble = (n) => (n.staff ? n.staff === 'treble' : (parse(n.name).d >= 4 * 7));
    const mk = (clef, list) => list.map((n) => (clef === (isTreble(n) ? 'treble' : 'bass') ? n : { ...n, hidden: true }));
    const w = opts.width || Math.max(240, 110 + (opts.mode === 'chord' ? 60 : notes.length * 44));
    const t = render({ ...opts, clef: 'treble', notes: mk('treble', notes), width: w, labels: null });
    const b = opts.bassChord ? render({ clef: 'bass', notes: opts.bassChord, mode: 'chord', width: w }) : render({ ...opts, clef: 'bass', notes: mk('bass', notes), width: w, labels: opts.labels });
    return `<div class="grand"><div class="brace"></div>${t}${b}</div>`;
  }

  // ---------------- rhythm / measure rendering ----------------
  /**
   * opts: { els: parsed rhythm [{sym,dot,rest,tie,dur,pos,bar,name?}], timeSig:[n,d], clef:'perc'|'treble'|'bass',
   *         colors:{idx:color}, width, keySig, beatGroup (quarter notes per beam group) }
   */
  function renderMeasure(opts) {
    const els = opts.els, clef = opts.clef || 'perc', ts = opts.timeSig || [4, 4];
        const ks = opts.keySig || {}, nAcc = clef === 'perc' ? 0 : (ks.sharps || ks.flats || 0);
    const W = opts.width || 360, H = 130;
    const tsx = (clef === 'perc' ? 16 : 50 + nAcc * 10), x0 = tsx + 20, x1 = W - 16;
    // spacing grows sub-linearly with duration so short notes stay readable
    const wts = els.map((e) => Math.pow(e.dur, 0.6));
    const sumW = wts.reduce((a, b) => a + b, 0) || 1, unit = (x1 - x0) / sumW;
    const xs = []; let acc = 0; els.forEach((e, i) => { xs.push(x0 + 8 + acc * unit); acc += wts[i]; });
    let X = (pos) => { const i = els.findIndex((e) => Math.abs(e.pos - pos) < 1e-6); if (i >= 0) return xs[i]; let a = 0; for (let k = 0; k < els.length; k++) { if (els[k].pos + els[k].dur > pos) return x0 + 8 + (a + wts[k] * (pos - els[k].pos) / els[k].dur) * unit; a += wts[k]; } return x1; };
    if (opts.grid) {   // align with another staff: x positions come from a shared list of onset positions (+ end)
      const g = opts.grid, gw = g.slice(0, -1).map((p, k) => Math.pow(g[k + 1] - p, 0.6)), uG = (x1 - x0) / (gw.reduce((a, b) => a + b, 0) || 1);
      X = (pos) => { let a = 0; for (let k = 0; k < gw.length; k++) { if (g[k + 1] > pos + 1e-9) return x0 + 8 + (a + gw[k] * (pos - g[k]) / (g[k + 1] - g[k])) * uG; a += gw[k]; } return x1; };
      els.forEach((e, i) => (xs[i] = X(e.pos)));
    }
    const midY = TOP + 2 * SP;
    let s = `<svg class="staff measure" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    if (clef === 'perc') s += `<line x1="4" x2="${W - 4}" y1="${midY}" y2="${midY}" stroke="currentColor"/>`;
    else {
      for (let i = 0; i < 5; i++) s += `<line x1="4" x2="${W - 4}" y1="${TOP + i * SP}" y2="${TOP + i * SP}" stroke="currentColor"/>`;
      s += clefPath(clef, 10);
      const off = clef === 'bass' ? -12 : 0;
      for (let i = 0; i < nAcc; i++) { const d = (ks.sharps ? SHARP_D[i] : FLAT_D[i]) + off; s += `<text x="${46 + i * 10}" y="${yOf(d, clef) + 5}" class="acc">${ks.sharps ? '♯' : '♭'}</text>`; }
    }
    s += `<text x="${tsx}" y="${midY - 3}" class="ts">${ts[0]}</text><text x="${tsx}" y="${midY + 17}" class="ts">${ts[1]}</text>`;
    // bar lines between elements whose bar index changes
    for (let i = 1; i < els.length; i++) if (els[i].bar !== els[i - 1].bar) { const bx = (xs[i - 1] + xs[i]) / 2 + 2; s += `<line x1="${bx}" x2="${bx}" y1="${clef === 'perc' ? midY - 14 : TOP}" y2="${clef === 'perc' ? midY + 14 : BOTTOM}" stroke="currentColor"/>`; }
    s += `<line x1="${W - 5}" x2="${W - 5}" y1="${clef === 'perc' ? midY - 14 : TOP}" y2="${clef === 'perc' ? midY + 14 : BOTTOM}" stroke="currentColor" stroke-width="2"/>`;
    const headY = (e) => (clef === 'perc' || !e.name ? midY : yOf(parse(e.name).d, clef));
    const stemUp = (e) => clef === 'perc' || headY(e) >= midY;
    const pts = [];
    els.forEach((e, i) => {
      const x = xs[i], y = headY(e), col = (opts.colors && opts.colors[i]) || 'currentColor';
      if (e.rest) { s += restGlyph(e, x, midY, col); pts.push(null); return; }
      if (clef !== 'perc' && e.name) {
        const p = parse(e.name), bd = BOTTOM_D[clef];
        for (let d = bd - 2; d >= p.d; d -= 2) s += `<line x1="${x - 10}" x2="${x + 10}" y1="${yOf(d, clef)}" y2="${yOf(d, clef)}" stroke="currentColor"/>`;
        for (let d = bd + 10; d <= p.d; d += 2) s += `<line x1="${x - 10}" x2="${x + 10}" y1="${yOf(d, clef)}" y2="${yOf(d, clef)}" stroke="currentColor"/>`;
        if (p.acc && !e.hideAcc) s += `<text x="${x - 19}" y="${y + 5}" class="acc" fill="${col}">${ACC[p.acc]}</text>`;
      }
      const hollow = e.sym === 'w' || e.sym === 'h';
      s += `<ellipse cx="${x}" cy="${y}" rx="6.2" ry="4.5" transform="rotate(-20 ${x} ${y})" fill="${hollow ? 'none' : col}" stroke="${col}" stroke-width="${hollow ? 1.8 : 0}"/>`;
      if (e.dot) s += `<circle cx="${x + 11}" cy="${y - 2}" r="1.8" fill="${col}"/>`;
      if (clef !== 'perc' && e.names) for (const n2 of e.names) {   // extra notes sounding together (dyads / chords)
        if (n2 === e.name) continue; const p2 = parse(n2), y2 = yOf(p2.d, clef), bd = BOTTOM_D[clef];
        for (let d = bd - 2; d >= p2.d; d -= 2) s += `<line x1="${x - 10}" x2="${x + 10}" y1="${yOf(d, clef)}" y2="${yOf(d, clef)}" stroke="currentColor"/>`;
        for (let d = bd + 10; d <= p2.d; d += 2) s += `<line x1="${x - 10}" x2="${x + 10}" y1="${yOf(d, clef)}" y2="${yOf(d, clef)}" stroke="currentColor"/>`;
        if (p2.acc && !e.hideAcc) s += `<text x="${x - 19}" y="${y2 + 5}" class="acc" fill="${col}">${ACC[p2.acc]}</text>`;
        s += `<ellipse cx="${x}" cy="${y2}" rx="6.2" ry="4.5" transform="rotate(-20 ${x} ${y2})" fill="${hollow ? 'none' : col}" stroke="${col}" stroke-width="${hollow ? 1.8 : 0}"/>`;
      }
      const up = stemUp(e), sx = up ? x + 5.6 : x - 5.6, sy = up ? y - 30 : y + 30;
      if (e.sym !== 'w') s += `<line x1="${sx}" x2="${sx}" y1="${y}" y2="${sy}" stroke="${col}" stroke-width="1.4"/>`;
      pts.push({ x, y, sx, sy, up, e, col, i });
    });
    // beams (eighths / sixteenths grouped within a beat group) or flags
    const grp = opts.beatGroup || (ts[1] === 8 ? 1.5 : 1);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; if (!p || !(p.e.sym === 'e' || p.e.sym === 's')) continue;
      const g = Math.floor(p.e.pos / grp + 1e-6); const run = [p];
      while (i + 1 < pts.length && pts[i + 1] && (pts[i + 1].e.sym === 'e' || pts[i + 1].e.sym === 's') && Math.floor(pts[i + 1].e.pos / grp + 1e-6) === g) run.push(pts[++i]);
      if (run.length === 1) { const f = p.up ? `M${p.sx} ${p.sy} q 9 7 7 18` : `M${p.sx} ${p.sy} q 9 -7 7 -18`; s += `<path d="${f}" stroke="${p.col}" fill="none" stroke-width="1.6"/>`; if (p.e.sym === 's') s += `<path d="${p.up ? `M${p.sx} ${p.sy + 7} q 9 7 7 18` : `M${p.sx} ${p.sy - 7} q 9 -7 7 -18`}" stroke="${p.col}" fill="none" stroke-width="1.6"/>`; continue; }
      const up = run[0].up, by = up ? Math.min(...run.map((r) => r.sy)) : Math.max(...run.map((r) => r.sy));
      run.forEach((r) => (s += `<line x1="${r.sx}" x2="${r.sx}" y1="${r.y}" y2="${by}" stroke="${r.col}" stroke-width="1.4"/>`));
      s += `<line x1="${run[0].sx}" x2="${run[run.length - 1].sx}" y1="${by}" y2="${by}" stroke="currentColor" stroke-width="4"/>`;
      for (let k = 0; k < run.length; k++) if (run[k].e.sym === 's') {
        const dy = up ? 7 : -7, a = run[k], b = run[k + 1] && run[k + 1].e.sym === 's' ? run[k + 1] : null;
        if (b) { s += `<line x1="${a.sx}" x2="${b.sx}" y1="${by + dy}" y2="${by + dy}" stroke="currentColor" stroke-width="4"/>`; k++; }
        else s += `<line x1="${a.sx - (k ? 9 : -9)}" x2="${a.sx}" y1="${by + dy}" y2="${by + dy}" stroke="currentColor" stroke-width="4"/>`;
      }
    }
    // ties
    pts.forEach((p, i) => { if (p && p.e.tie) { const q = pts.slice(i + 1).find(Boolean); if (q) s += `<path d="M${p.x + 4} ${p.y + 8} Q ${(p.x + q.x) / 2} ${p.y + 20} ${q.x - 4} ${q.y + 8}" stroke="currentColor" fill="none" stroke-width="1.4"/>`; } });
    if (opts.labels) els.forEach((e, i) => { if (opts.labels[i]) s += `<text x="${xs[i]}" y="${H - 6}" class="lbl">${opts.labels[i]}</text>`; });
    if (opts.playhead != null) s += `<line x1="${X(opts.playhead) - 8}" x2="${X(opts.playhead) - 8}" y1="${TOP - 14}" y2="${BOTTOM + 14}" stroke="#6ea8ff" stroke-width="2" opacity=".8"/>`;
    return s + '</svg>';
  }
  function restGlyph(e, x, midY, col) {
    switch (e.sym) {
      case 'w': return `<rect x="${x - 6}" y="${midY - 10}" width="12" height="5" fill="${col}"/>`;
      case 'h': return `<rect x="${x - 6}" y="${midY - 5}" width="12" height="5" fill="${col}"/>${e.dot ? `<circle cx="${x + 11}" cy="${midY - 4}" r="1.8" fill="${col}"/>` : ''}`;
      case 'q': return `<path d="M${x - 3} ${midY - 14} l6 7 l-5 6 l6 7 q-7 -3 -6 5" stroke="${col}" stroke-width="2.2" fill="none" stroke-linejoin="round"/>`;
      case 'e': return `<circle cx="${x - 3}" cy="${midY - 4}" r="2.6" fill="${col}"/><path d="M${x - 3} ${midY - 2} q5 1 7 -3 l-6 15" stroke="${col}" stroke-width="1.8" fill="none"/>`;
      default: return `<circle cx="${x - 3}" cy="${midY - 4}" r="2.4" fill="${col}"/><circle cx="${x - 5}" cy="${midY + 3}" r="2.4" fill="${col}"/><path d="M${x - 3} ${midY - 2} q5 1 7 -3 l-7 20 M${x - 5} ${midY + 5} q5 1 6 -3" stroke="${col}" stroke-width="1.6" fill="none"/>`;
    }
  }

  const api = { render, parse, renderGrand, renderMeasure };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Staff = api;
})(typeof self !== 'undefined' ? self : this);
