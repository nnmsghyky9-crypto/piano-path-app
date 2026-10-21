/* Piano Trainer — audio detection core (shared by browser + Node tests).
 * - YIN monophonic pitch detector
 * - Harmonic-sum polyphonic note estimator with spectral-smoothness subtraction
 * - Window accumulator + tolerant pitch-class chord matcher
 */
(function (root) {
  'use strict';
  const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const PC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const CHORD_TYPES = {
    maj: { name: 'major', suffix: '', iv: [0, 4, 7] },
    min: { name: 'minor', suffix: 'm', iv: [0, 3, 7] },
    dim: { name: 'diminished', suffix: 'dim', iv: [0, 3, 6] },
    aug: { name: 'augmented', suffix: 'aug', iv: [0, 4, 8] },
    sus2: { name: 'sus2', suffix: 'sus2', iv: [0, 2, 7] },
    sus4: { name: 'sus4', suffix: 'sus4', iv: [0, 5, 7] },
    dom7: { name: 'dominant 7th', suffix: '7', iv: [0, 4, 7, 10] },
    maj7: { name: 'major 7th', suffix: 'maj7', iv: [0, 4, 7, 11] },
    min7: { name: 'minor 7th', suffix: 'm7', iv: [0, 3, 7, 10] },
  };

  const midiToFreq = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
  const midiName = (m) => PC_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

  // ---------- FFT (in-place radix-2) ----------
  const fftCache = {};
  function getTables(n) {
    if (fftCache[n]) return fftCache[n];
    const rev = new Uint32Array(n), bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
    const win = new Float32Array(n);
    for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return (fftCache[n] = { rev, cos, sin, win });
  }
  function fft(re, im) {
    const n = re.length, { rev, cos, sin } = getTables(n);
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half;
        const tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  /** Magnitude spectrum (Hann window), length n/2. */
  function magnitudeSpectrum(buf) {
    const n = buf.length, { win } = getTables(n);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = buf[i] * win[i];
    fft(re, im);
    const mag = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) * 4 / n; // ~= sine amplitude
    return mag;
  }

  function rms(buf, start = 0, end = buf.length) {
    let s = 0; for (let i = start; i < end; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / Math.max(1, end - start));
  }

  // ---------- YIN monophonic ----------
  /** Returns {freq, clarity} or null. buf: Float32Array (≈2048-4096 samples). */
  function yin(buf, sampleRate, opts = {}) {
    const threshold = opts.threshold ?? 0.15;
    const minF = opts.minFreq ?? 50, maxF = opts.maxFreq ?? 2200;
    const W = Math.floor(buf.length / 2);
    const tauMin = Math.max(2, Math.floor(sampleRate / maxF));
    const tauMax = Math.min(W - 1, Math.ceil(sampleRate / minF));
    const d = new Float32Array(tauMax + 2);
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
      d[tau] = s;
    }
    // cumulative mean normalised difference
    const c = new Float32Array(tauMax + 2); c[0] = 1; let run = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; c[tau] = run ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (c[t] < threshold) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
    }
    if (tau < 0) { // fall back to global min if reasonably clear
      let best = 1, bt = -1; for (let t = tauMin; t <= tauMax; t++) if (c[t] < best) { best = c[t]; bt = t; }
      if (best > 0.35) return null; tau = bt;
    }
    let betterTau = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = c[tau - 1], s1 = c[tau], s2 = c[tau + 1], den = 2 * (2 * s1 - s2 - s0);
      if (den) betterTau = tau + (s2 - s0) / den;
    }
    return { freq: sampleRate / betterTau, clarity: 1 - c[tau] };
  }

  // ---------- Polyphonic ----------
  function pickPeaks(mag, sampleRate, n, opts) {
    const binHz = sampleRate / n, peaks = [];
    const lo = Math.max(2, Math.floor((opts.minFreq ?? 55) / binHz));
    const hi = Math.min(mag.length - 3, Math.ceil((opts.maxFreq ?? 5000) / binHz));
    let max = 0; for (let i = lo; i <= hi; i++) if (mag[i] > max) max = mag[i];
    const floor = Math.max(opts.absFloor ?? 0, max * Math.pow(10, -(opts.dynRangeDb ?? 38) / 20));
    const noise = opts.noiseSpectrum;
    for (let i = lo; i <= hi; i++) {
      const m = mag[i];
      if (m < floor || m < mag[i - 1] || m < mag[i + 1] || m < mag[i - 2] || m < mag[i + 2]) continue;
      if (noise && m < noise[i] * (opts.noiseMult ?? 3)) continue;
      const a = Math.log(mag[i - 1] + 1e-12), b = Math.log(m + 1e-12), g = Math.log(mag[i + 1] + 1e-12);
      const den = a - 2 * b + g, p = den ? 0.5 * (a - g) / den : 0;
      peaks.push({ freq: (i + p) * binHz, amp: Math.exp(b - 0.25 * (a - g) * p), res: 0 });
    }
    for (const pk of peaks) pk.res = pk.amp;
    return { peaks, max, binHz };
  }

  function findPeak(peaks, f, tolHz) {
    let best = null, bd = tolHz;
    for (const p of peaks) { const dd = Math.abs(p.freq - f); if (dd <= bd) { bd = dd; best = p; } }
    return best;
  }

  /**
   * Estimate the set of sounding notes from a time-domain buffer (≈16384 samples).
   * Returns {notes:[{midi, freq, salience}], level}
   */
  function detectNotes(buf, sampleRate, opts = {}) {
    const a4 = opts.a4 ?? 440;
    const n = buf.length;
    const mag = opts.mag || magnitudeSpectrum(buf);
    const { peaks, binHz } = pickPeaks(mag, sampleRate, n, opts);
    const H = opts.harmonics ?? 10, maxNotes = opts.maxNotes ?? 6;
    const notes = [];
    if (!peaks.length) return { notes, peaks };
    let firstScore = 0;
    const used = new Set();
    for (let iter = 0; iter < maxNotes; iter++) {
      let best = null;
      for (const p of peaks) {
        if (p.freq < (opts.minF0 ?? 60) || p.freq > (opts.maxF0 ?? 2100)) continue;
        if (p.res < p.amp * 0.3) continue;
        const m = freqToMidi(p.freq, a4), mr = Math.round(m);
        if (Math.abs(m - mr) > 0.42 || used.has(mr)) continue;
        // harmonic sum (allow slight piano inharmonicity / tuning drift)
        let score = 0, matched = [];
        for (let h = 1; h <= H; h++) {
          const fh = p.freq * h;
          if (fh > sampleRate / 2 - binHz * 3) break;
          const tol = Math.max(binHz * 1.2, fh * 0.018);
          const q = h === 1 ? p : findPeak(peaks, fh * (1 + 0.0004 * h * h), tol);
          matched.push(q ? q.res : 0);
          if (q) score += q.res * (h === 1 ? 1 : 1 / Math.sqrt(h));
        }
        // need some harmonic support or a strong fundamental
        const support = matched.slice(1).filter((x) => x > 0).length;
        if (support === 0 && iter > 0) score *= 0.5;
        if (!best || score > best.score) best = { p, score, midi: mr, matched };
      }
      if (!best) break;
      if (iter === 0) firstScore = best.score;
      else if (best.score < firstScore * (opts.relThreshold ?? 0.18)) break;
      notes.push({ midi: best.midi, freq: best.p.freq, salience: best.score / firstScore });
      used.add(best.midi);
      // spectral-smoothness subtraction of claimed harmonics
      const mt = best.matched;
      for (let h = 1; h <= mt.length; h++) {
        const fh = best.p.freq * h;
        const q = h === 1 ? best.p : findPeak(peaks, fh * (1 + 0.0004 * h * h), Math.max(binHz * 1.2, fh * 0.018));
        if (!q) continue;
        const nb = [mt[h - 2], mt[h - 1], mt[h]].filter((x) => x !== undefined);
        const smooth = h === 1 ? q.res : nb.reduce((s, x) => s + x, 0) / nb.length;
        q.res = Math.max(0, q.res - Math.min(q.res, smooth * 1.0));
      }
    }
    return { notes, peaks };
  }

  // ---------- Chord matching ----------
  function pcsOf(midis) { return [...new Set(midis.map((m) => ((m % 12) + 12) % 12))]; }

  /** Accumulates per-frame detections over a short window (handles rolled / staggered chords). */
  class NoteWindow {
    constructor(windowMs = 1500) { this.windowMs = windowMs; this.frames = []; }
    clear() { this.frames = []; }
    push(t, notes, mono) { this.frames.push({ t, notes, mono }); this.trim(t); }
    trim(now) { while (this.frames.length && now - this.frames[0].t > this.windowMs) this.frames.shift(); }
    /** chroma weights 0..1 = fraction of active frames where pitch class was detected (salience-weighted). */
    chroma(since = -Infinity) {
      const w = new Array(12).fill(0); let active = 0;
      for (const f of this.frames) {
        if (f.t < since || !f.notes.length) continue; active++;
        const seen = new Array(12).fill(0);
        for (const nt of f.notes) { const pc = ((nt.midi % 12) + 12) % 12; seen[pc] = Math.max(seen[pc], Math.min(1, 0.4 + nt.salience)); }
        for (let i = 0; i < 12; i++) w[i] += seen[i];
      }
      if (active) for (let i = 0; i < 12; i++) w[i] /= active;
      return { w, active };
    }
    /** stable monophonic note: most common YIN midi in window (needs >= minFrames). */
    monoNote(since = -Infinity, minFrames = 3) {
      const cnt = {}; let tot = 0;
      for (const f of this.frames) { if (f.t < since || f.mono == null) continue; cnt[f.mono] = (cnt[f.mono] || 0) + 1; tot++; }
      let best = null; for (const k in cnt) if (!best || cnt[k] > cnt[best]) best = k;
      return best != null && cnt[best] >= minFrames ? { midi: +best, frac: cnt[best] / tot } : null;
    }
  }

  /**
   * Tolerant matcher: target pitch classes must all be present (weight >= presentThr),
   * and no strong extra pitch class (weight >= extraThr) unless allowExtra.
   */
  function matchChord(chroma, targetPcs, opts = {}) {
    const presentThr = opts.presentThr ?? 0.25, extraThr = opts.extraThr ?? 0.55;
    const missing = targetPcs.filter((pc) => chroma[pc] < presentThr);
    const reqMin = Math.min(...targetPcs.map((pc) => chroma[pc]));
    const extras = [];
    const recent = opts.recent || chroma; // late-arriving notes (rolled chords) are judged on recent frames too
    for (let pc = 0; pc < 12; pc++) {
      if (targetPcs.includes(pc) || (opts.ignore && opts.ignore.includes(pc))) continue;
      if (chroma[pc] >= Math.max(extraThr, reqMin * 0.9) || recent[pc] >= 0.5) extras.push(pc);
    }
    // (Only after the chord has had time to settle, so a rolled chord's late note can still count as an extra.)
    // A perfect 5th coincides with the 3rd harmonic of the root, so when the root is doubled in
    // low octaves the detector can "explain away" the 5th. Pianists also often omit it. Forgive it.
    let miss = missing;
    if (opts.root != null && opts.forgiveFifth !== false && (opts.elapsedMs ?? 1e9) >= (opts.settleMs ?? 350) && missing.length === 1 && missing[0] === (opts.root + 7) % 12 && targetPcs.length >= 3) miss = [];
    return { ok: miss.length === 0 && extras.length <= (opts.allowExtra ?? 0), missing, extras };
  }

  /** Name the best-fitting chord for a chroma vector (for the "what I hear" readout). */
  function identifyChord(chroma, types = Object.keys(CHORD_TYPES), thr = 0.25) {
    const present = []; for (let pc = 0; pc < 12; pc++) if (chroma[pc] >= thr) present.push(pc);
    if (present.length < 2) return null;
    let best = null;
    for (const t of types) for (let r = 0; r < 12; r++) {
      const pcs = CHORD_TYPES[t].iv.map((i) => (r + i) % 12);
      let s = 0; for (let pc = 0; pc < 12; pc++) s += pcs.includes(pc) ? chroma[pc] : -0.8 * chroma[pc];
      s -= 0.05 * pcs.length;
      if (!best || s > best.s) best = { s, root: r, type: t, pcs };
    }
    const allIn = best.pcs.every((pc) => chroma[pc] >= thr);
    return allIn ? best : null;
  }
  /**
   * Grade the current window against a target. target = {kind:'note', midi, pcs:[pc]} | {kind:'chord', pcs:[...]}
   * Returns {ok, heardPcs, heardLabel}
   */
  function gradeWindow(win, target, since, opts = {}) {
    const { w, active } = win.chroma(since);
    if (target.kind === 'note') {
      const mono = win.monoNote(since, opts.minStableFrames ?? 3);
      const midi = mono ? mono.midi : null;
      let pc = midi != null ? ((midi % 12) + 12) % 12 : null;
      if (pc == null && active >= 3) { // poly fallback: dominant pitch class
        let b = 0; for (let i = 1; i < 12; i++) if (w[i] > w[b]) b = i;
        if (w[b] > 0.5) pc = b;
      }
      if (pc == null) return { ok: false, heardPcs: [], heardLabel: '' };
      const ok = pc === target.pcs[0] && (!opts.strictOctave || midi === target.midi);
      return { ok, heardPcs: [pc], heardMidi: midi, heardLabel: midi != null ? midiName(midi) : PC_NAMES[pc] };
    }
    if (active < (opts.minActiveFrames ?? 3)) return { ok: false, heardPcs: [], heardLabel: '' };
    const lastT = win.frames.length ? win.frames[win.frames.length - 1].t : 0;
    const recent = win.chroma(Math.max(since, lastT - (opts.recentMs ?? 400))).w;
    // time since the most recent new pitch class appeared (chord "settled")
    const firstSeen = new Array(12).fill(null);
    for (const f of win.frames) { if (f.t < since) continue; for (const nt of f.notes) { const pc = ((nt.midi % 12) + 12) % 12; if (firstSeen[pc] == null) firstSeen[pc] = f.t; } }
    let latest = since; for (let pc = 0; pc < 12; pc++) if (firstSeen[pc] != null && w[pc] >= 0.15) latest = Math.max(latest, firstSeen[pc]);
    const settled = Math.min(opts.elapsedMs ?? 1e9, lastT - latest);
    const m = matchChord(w, target.pcs, { ...opts, root: target.root, recent, elapsedMs: settled });
    const id = identifyChord(w);
    const heardPcs = []; for (let pc = 0; pc < 12; pc++) if (w[pc] >= (opts.presentThr ?? 0.25)) heardPcs.push(pc);
    let label = id ? chordName(id.root, id.type) : heardPcs.map((pc) => PC_FLAT[pc]).join(' ');
    let ok = m.ok, bassPc = null;
    if (target.bass != null) { // inversions: the lowest sounding note must be the requested bass
      bassPc = lowestPc(win, since, opts.ignore);
      if (bassPc !== target.bass) ok = false;
      if (bassPc != null) label += ` (lowest ${PC_FLAT[bassPc]})`;
    }
    return { ok, missing: m.missing, extras: m.extras, heardPcs, bassPc, heardLabel: label };
  }

  /** most frequent per-frame lowest note (pitch class) since `since`, ignoring ringing pcs */
  function lowestPc(win, since, ignore) {
    const cnt = new Array(12).fill(0); let n = 0;
    for (const f of win.frames) {
      if (f.t < since || !f.notes.length) continue;
      let lo = null;
      for (const nt of f.notes) { const pc = ((nt.midi % 12) + 12) % 12; if (nt.salience < 0.15 || (ignore && ignore.includes(pc))) continue; if (lo == null || nt.midi < lo) lo = nt.midi; }
      if (lo != null) { cnt[((lo % 12) + 12) % 12]++; n++; }
    }
    if (!n) return null;
    let b = 0; for (let i = 1; i < 12; i++) if (cnt[i] > cnt[b]) b = i;
    return b;
  }

  const chordName = (root, type, flats = true) => (flats ? PC_FLAT : PC_SHARP)[root] + CHORD_TYPES[type].suffix;

  const api = { PC_NAMES, PC_FLAT, PC_SHARP, CHORD_TYPES, midiToFreq, freqToMidi, midiName, magnitudeSpectrum, rms, yin, detectNotes, NoteWindow, matchChord, identifyChord, chordName, gradeWindow, lowestPc, pcsOf, fft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PianoDetect = api;
})(typeof self !== 'undefined' ? self : this);
