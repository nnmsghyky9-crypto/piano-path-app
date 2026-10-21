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
    const sorted = opts.mode === 'chord' ? [...ps].sort((a, b) => a.p.d - b.p.d) : ps;
    sorted.forEach((n, i) => {
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
  const api = { render, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Staff = api;
})(typeof self !== 'undefined' ? self : this);
