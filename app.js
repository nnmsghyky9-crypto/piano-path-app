/* Piano Path app: curriculum + mic-first detection (iOS Safari), Web MIDI optional, computer keys = hidden debug. */
(() => {
  'use strict';
  const D = window.PianoDetect, C = window.Curriculum, Staff = window.Staff;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const pretty = C.pretty;

  // ---------------- settings ----------------
  const DEFAULTS = { sens: 6, strict: 3, a4: 440, noiseRms: 0.002, accidentals: true, strictOctave: false, velMin: 8, chordTypes: ['maj', 'min'], calibrated: false, mode: 'listen' };
  const S = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('pt.settings') || '{}'));
  let noiseSpec = null;
  try { const ns = JSON.parse(localStorage.getItem('pt.noiseSpec') || 'null'); if (ns) noiseSpec = Float32Array.from(ns, (db) => Math.pow(10, db / 20)); } catch (e) {}
  const save = () => localStorage.setItem('pt.settings', JSON.stringify(S));
  const gateMult = () => [0, 9, 7.5, 6, 5, 4.2, 3.5, 3, 2.5, 2, 1.6][S.sens];
  const gate = () => Math.max(0.0012, S.noiseRms * gateMult());
  const strictOpts = () => ({ presentThr: 0.25, extraThr: [0, 0.8, 0.68, 0.55, 0.45, 0.35][S.strict] });
  const Prog = C.Progress(localStorage);

  // ---------------- audio ----------------
  const POLY_N = 16384, MONO_N = 4096, TICK_MS = 50;
  let ctx = null, analyser = null, micStream = null, micSrc = null, sinkGain = null;
  const polyBuf = new Float32Array(POLY_N);
  const win = new D.NoteWindow(14000);
  const longWin = new D.NoteWindow(150000);   // long memory for grading whole phrases/pieces in time
  const onsetTracker = new D.OnsetTracker(256), onsetLog = [], levelLog = []; let lastTickT = 0;
  let micStartPerf = 0, lastLevel = 0, levelSmooth = 0, micOn = false, micPaused = false, tickTimer = null, lastYin = null, lastLoudT = 0;
  const run = { midi: null, n: 0 }; let lastEmitted = null, onsetSinceEmit = true; const midiEvents = [];

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    analyser = ctx.createAnalyser(); analyser.fftSize = POLY_N; analyser.smoothingTimeConstant = 0;
    sinkGain = ctx.createGain(); sinkGain.gain.value = 0;            // keeps the graph pulled on Safari, no feedback
    analyser.connect(sinkGain); sinkGain.connect(ctx.destination);
    return ctx;
  }
  async function startMic() {
    const errEl = $('startError'); errEl.hidden = true;
    try {
      ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();             // must run inside the tap on iOS
      if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nogum'), { name: 'NoGUM' });
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      micSrc = ctx.createMediaStreamSource(micStream); micSrc.connect(analyser);
      micOn = true; micStartPerf = performance.now(); micStream.getAudioTracks()[0].addEventListener('ended', () => { micOn = false; setPills(); });
      setPills(); startLoop(); return true;
    } catch (e) {
      errEl.textContent = {
        NotAllowedError: 'Microphone access was blocked. On iPhone, go to Settings → Safari → Microphone → Allow (or tap ᴀA in the address bar → Website Settings → Microphone), then reload this page.',
        InsecureContext: 'The microphone only works when this page is opened over https:// (or on localhost). Open the https link instead.',
        NoGUM: 'This browser does not give web pages access to the microphone. Use Safari on iPhone, or Chrome/Edge on other devices.',
        NotFoundError: 'No microphone was found.',
      }[e.name] || ('Could not start the microphone: ' + e.message);
      errEl.hidden = false; return false;
    }
  }
  function pauseMic(p) { micPaused = p; if (micStream) micStream.getAudioTracks().forEach((t) => (t.enabled = !p)); if (p) { win.clear(); run.n = 0; } setPills(); }
  document.addEventListener('touchend', () => ctx && ctx.state !== 'running' && ctx.resume(), { passive: true });
  document.addEventListener('click', () => ctx && ctx.state !== 'running' && ctx.resume());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); setTimeout(setPills, 300); });

  function setPills() {
    const running = micOn && ctx && ctx.state === 'running';
    $$('.mic-pill').forEach((p) => (p.className = 'pill mic-pill ' + (micPaused ? 'warn' : running ? 'on' : micOn ? 'warn' : 'off')));
    $$('.mic-txt').forEach((t) => (t.textContent = micPaused ? 'Mic paused (prompt playing)' : running ? 'Mic on' : micOn ? 'Tap to resume mic' : 'Mic off. It starts when you open a drill'));
    const n = midi.inputs.length;
    $$('.midi-pill').forEach((p) => { p.hidden = !midi.access; p.className = 'pill midi-pill ' + (n ? 'on' : 'warn'); });
    $$('.midi-txt').forEach((t) => (t.textContent = n ? '🎹 ' + midi.inputs.map((i) => i.name).join(', ') : 'Connect keyboard'));
    if (midi.access) $('midiStatus').textContent = n ? 'Connected: ' + midi.inputs.map((i) => i.name).join(', ') : 'Waiting for a keyboard… plug it in (USB) or pair it (Bluetooth MIDI) and it will be picked up automatically.';
  }

  // ---------------- MIDI (optional) ----------------
  const midi = { access: null, inputs: [], held: new Map(), sustain: false, sustained: new Set(), onsetFlag: false, lastVel: 0 };
  async function initMidi() {
    if (!navigator.requestMIDIAccess) return false;
    try {
      midi.access = await navigator.requestMIDIAccess({ sysex: false });
      midi.access.onstatechange = refreshMidi; refreshMidi(); ensureContext(); startLoop(); return true;
    } catch (e) { $('midiStatus').textContent = 'MIDI access was denied (' + e.name + ').'; return false; }
  }
  function refreshMidi() { midi.inputs = []; midi.access.inputs.forEach((i) => { if (i.state === 'connected') { i.onmidimessage = onMidi; midi.inputs.push(i); } }); setPills(); }
  function onMidi(ev) {
    const [st, d1, d2] = ev.data, cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) { if (d2 < S.velMin) return; midi.held.set(d1, d2); midi.sustained.delete(d1); midi.onsetFlag = true; midi.lastVel = d2; midiEvents.push(d1); }
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) { if (midi.held.has(d1)) { if (midi.sustain) midi.sustained.add(d1); midi.held.delete(d1); } }
    else if (cmd === 0xb0 && d1 === 64) { midi.sustain = d2 >= 64; if (!midi.sustain) midi.sustained.clear(); }
  }
  const midiActive = () => midi.held.size + midi.sustained.size > 0;
  const dyn = (v) => (v < 32 ? 'pp' : v < 56 ? 'p' : v < 76 ? 'mp' : v < 96 ? 'mf' : v < 112 ? 'f' : 'ff');

  // ---------------- synth (ear-training prompts + hidden debug keys) ----------------
  function pianoTone(m, when, dur, toAnalyser, vel = 1) {
    const f0 = D.midiToFreq(m), out = ctx.createGain(), t = when;
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.16 * vel, t + 0.006); out.gain.exponentialRampToValueAtTime(0.04 * vel, t + dur * 0.7); out.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    for (let h = 1; h <= 7; h++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f0 * h * Math.sqrt(1 + 0.0004 * h * h); g.gain.value = Math.pow(h, -1.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); }
    out.connect(ctx.destination); if (toAnalyser) out.connect(analyser);
    return out;
  }
  const voices = new Map();
  if (DEBUG) {
    const map = 'awsedftgyhujk'; let octave = 4;
    window.addEventListener('keydown', (e) => { if (e.repeat || e.target.tagName === 'INPUT') return; if (e.key === 'z') octave--; if (e.key === 'x') octave++; const i = map.indexOf(e.key); if (i >= 0) { ensureContext(); const m = 12 * (octave + 1) + i; voices.set(e.key, pianoTone(m, ctx.currentTime, 2.5, true)); dbgOnset = true; } });
    window.addEventListener('keyup', (e) => { const v = voices.get(e.key); if (v) { v.gain.cancelScheduledValues(ctx.currentTime); v.gain.setTargetAtTime(0, ctx.currentTime, 0.06); voices.delete(e.key); } });
  }
  let dbgOnset = false;

  // ---------------- analysis loop ----------------
  let frameHandler = null;
  function startLoop() { if (!tickTimer) tickTimer = setInterval(tick, TICK_MS); }
  function tick() {
    const now = performance.now();
    let notes = [], mono = null, onset = false, level = 0; const events = [];
    if (analyser && ctx.state === 'running' && !micPaused) {
      analyser.getFloatTimeDomainData(polyBuf);
      const sr = ctx.sampleRate, g = gate();
      level = D.rms(polyBuf, POLY_N - 2048, POLY_N);
      const nNew = lastTickT ? Math.round((now - lastTickT) * sr / 1000) : 2048; lastTickT = now;
      for (const o of onsetTracker.process(polyBuf, sr, nNew, now, g)) onsetLog.push(o);
      levelLog.push({ t: now, level });
      while (onsetLog.length && now - onsetLog[0].t > 150000) onsetLog.shift();
      while (levelLog.length && now - levelLog[0].t > 150000) levelLog.shift();
      if (level > g && (lastLevel < g || (level > lastLevel * 1.5 && level - lastLevel > g * 0.5))) onset = true;
      if (level > g) {
        lastLoudT = now;
        const mag = D.magnitudeSpectrum(polyBuf);
        notes = D.detectNotes(polyBuf, sr, { mag, a4: S.a4, absFloor: g * 0.08, noiseSpectrum: noiseSpec, noiseMult: 2 + (10 - S.sens) * 0.3 }).notes;
        const y = D.yin(polyBuf.subarray(POLY_N - MONO_N), sr);
        lastYin = y && y.clarity > 0.8 ? y : null;
        if (lastYin) mono = Math.round(D.freqToMidi(y.freq, S.a4));
      } else lastYin = null;
      lastLevel = level;
    }
    if (dbgOnset) { onset = true; dbgOnset = false; }
    if (midiActive()) {                                              // MIDI is exact: replaces mic notes
      const all = [...midi.held.entries(), ...[...midi.sustained].map((m) => [m, 60])];
      notes = all.map(([m, v]) => ({ midi: m, freq: D.midiToFreq(m), salience: 0.4 + 0.6 * v / 127 }));
      mono = notes.length === 1 ? notes[0].midi : null; lastLoudT = now;
    }
    if (midi.onsetFlag) { onset = true; midi.onsetFlag = false; onsetLog.push({ t: now - 10, level: (midi.lastVel || 64) / 127 * 0.3 }); }
    // note events (for melodic tasks: scales). Mic: new stable YIN note (3 frames) after an onset or a pitch change.
    if (onset) onsetSinceEmit = true;
    if (mono != null && mono === run.midi) run.n++; else { run.midi = mono; run.n = mono != null ? 1 : 0; }
    if (midiEvents.length) { events.push(...midiEvents.splice(0)); lastEmitted = events[events.length - 1]; onsetSinceEmit = false; }
    else if (run.n === 3 && (run.midi !== lastEmitted || onsetSinceEmit)) { events.push(run.midi); lastEmitted = run.midi; onsetSinceEmit = false; }
    if (level > 0 && level < gate() * 0.6 && !midiActive()) lastEmitted = null;  // silence: allow repeating a note
    levelSmooth = Math.max(level, levelSmooth * 0.85);
    win.push(now, notes, mono); longWin.push(now, notes, mono);
    const f = { now, notes, mono, level, onset, events };
    $$('.meter-fill.lvl').forEach((e) => (e.style.width = toPct(levelSmooth) + '%')); $$('.gt').forEach((e) => (e.style.left = toPct(gate()) + '%'));
    if (frameHandler) frameHandler(f);
  }
  const toPct = (r) => Math.max(0, Math.min(100, (20 * Math.log10(r + 1e-9) + 70) / 60 * 100));
  function heardSummary(f) {
    const recent = win.chroma(f.now - 350); let main = '—', sub = '', midis = [];
    if (recent.active >= 2) {
      const id = D.identifyChord(recent.w), pcs = []; recent.w.forEach((x, pc) => x >= 0.4 && pcs.push(pc));
      midis = f.notes.filter((n) => n.salience > 0.25).map((n) => n.midi).sort((a, b) => a - b);
      if (id && pcs.length >= 3) main = pretty(D.chordName(id.root, id.type)); else if (f.mono != null) main = pretty(D.midiName(f.mono)); else if (pcs.length) main = pcs.map((pc) => pretty(D.PC_FLAT[pc])).join(' ');
      sub = midis.map((m) => pretty(D.midiName(m))).join(' · ');
      if (midiActive() && midi.lastVel) sub += ` (MIDI vel ${midi.lastVel} ${dyn(midi.lastVel)})`;
    }
    return { main, sub, midis: midis.length ? midis : f.mono != null ? [f.mono] : [] };
  }

  // ---------------- keyboard diagram (display only) ----------------
  function drawKeyboard(svg, targets = [], heard = [], lo = 48, hi = 83) {
    const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
    const fold = (m) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
    const T = new Set(targets.map(fold)), H = new Set(heard.map(fold));
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const W = 20, Hh = 80; svg.setAttribute('viewBox', `0 0 ${whites.length * W} ${Hh + 2}`);
    const cls = (m, base) => base + (T.has(m) && H.has(m) ? ' th' : T.has(m) ? ' t' : H.has(m) ? ' h' : '');
    let s = '';
    whites.forEach((m, i) => { s += `<rect class="${cls(m, 'w')}" x="${i * W}" y="0" width="${W}" height="${Hh}" rx="2"/>`; if (m % 12 === 0) s += `<text x="${i * W + W / 2}" y="${Hh - 5}">C${m / 12 - 1}</text>`; });
    whites.forEach((m, i) => { if (m + 1 <= hi && isBlack(m + 1)) s += `<rect class="${cls(m + 1, 'b')}" x="${i * W + W * 0.65}" y="0" width="${W * 0.7}" height="${Hh * 0.6}" rx="2"/>`; });
    svg.innerHTML = s;
  }

  // ---------------- navigation ----------------
  let history = ['map'];
  function show(id, push = true) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    if (push && history[history.length - 1] !== id) history.push(id);
    if (id !== 'drill' && id !== 'practice' && id !== 'calib' && id !== 'song') frameHandler = null;
    window.scrollTo(0, 0); setPills();
  }
  function back() { history.pop(); const prev = history.pop() || 'map'; ({ map: renderMap, stats: renderStats, lesson: () => openLesson(curUnit), songs: renderSongs, daily: () => renderDaily(), place: openPlacement, metro: renderMetro }[prev] || renderMap)(); }
  $$('[data-back]').forEach((b) => (b.onclick = back));
  $$('[data-open="settings"]').forEach((b) => (b.onclick = () => $('settings').showModal()));
  let pendingAfterMic = null;
  function requireMic(next) {
    if ((micOn && ctx && ctx.state === 'running') || midi.inputs.length) { if (micStream && micPaused) pauseMic(false); return next(); }
    pendingAfterMic = next; show('start');
  }
  $('btnStartMic').onclick = async () => {
    if (!(await startMic())) return;
    const next = pendingAfterMic || renderMap; pendingAfterMic = null;
    if (!S.calibrated) startCalibration(next); else next();
  };

  // ---------------- notation helper ----------------
  function renderSpec(sp, extra = {}) {
    if (!sp) return '';
    if (sp.grand) return Staff.renderGrand({ ...sp, bassChord: sp.extraBass, ...extra });
    if (sp.measure) {
      const els = sp.els ? sp.els.map((e) => ({ ...e })) : D.parseRhythm(sp.rhythm);
      if (sp.names) { let k = 0; els.forEach((e) => { if (!e.rest) e.name = sp.names[k++]; }); }
      const top = Staff.renderMeasure({ els, timeSig: sp.timeSig, clef: sp.clef || (sp.names ? 'treble' : 'perc'), keySig: sp.keySig, ...extra });
      if (!sp.lhEls) return top;
      const total = els.reduce((a, e) => Math.max(a, e.pos + e.dur), 0), grid = [...new Set(els.concat(sp.lhEls).map((e) => e.pos).concat([total]))].sort((a, b) => a - b);
      return `<div class="sg-grand">${Staff.renderMeasure({ els, timeSig: sp.timeSig, clef: 'treble', keySig: sp.keySig, grid, ...extra })}${Staff.renderMeasure({ els: sp.lhEls, timeSig: sp.timeSig, clef: 'bass', keySig: sp.keySig, grid, ...extra, colors: undefined })}</div>`;
    }
    if (sp.chords) return `<div class="chord-row">${sp.groups.map((g, i) => `<div>${Staff.render({ clef: sp.clef, notes: g, mode: 'chord', keySig: i === 0 ? sp.keySig : undefined, labels: [sp.labels && sp.labels[i]], width: 120 })}</div>`).join('')}</div>`;
    if (sp.notes && Array.isArray(sp.notes[0])) return renderSpec({ chords: true, clef: sp.clef, groups: sp.notes, labels: sp.labels, keySig: sp.keySig });
    return Staff.render(sp);
  }

  // ---------------- curriculum map ----------------
  function renderMap() {
    show('map'); history = ['map'];
    $('dayStreak').textContent = `🔥 ${Prog.dayStreak()}`; DY = null;
    const dd = Prog.raw.daily && Prog.raw.daily.date === Prog.today() ? Prog.raw.daily : null, plan = dd ? dd.plan : Sg.dailyPlan(Prog), nDone = dd ? dd.done.length : 0;
    $('dailyRing').textContent = `${nDone}/${plan.length}`; $('btnDaily').classList.toggle('done', nDone >= plan.length);
    $('dailySub').textContent = nDone >= plan.length ? `Done for today 🎉 · 🎯 ${goalStreak()} day${goalStreak() === 1 ? '' : 's'} in a row` : `${plan.map((x) => x.kind === 'song' ? 'a song' : x.label.split(':')[0].toLowerCase()).filter((x, i, a) => a.indexOf(x) === i).join(', ')} · about ${plan.reduce((a, x) => a + x.min, 0)} min`;
    const placed = Prog.placedUpTo();
    const list = $('unitList'); list.innerHTML = '';
    let currentMarked = false;
    for (const lvl of C.LEVELS) {
      const us = C.UNITS.filter((u) => u.level === lvl);
      const avg = Math.round(us.reduce((a, u) => a + Prog.mastery(u.id), 0) / us.length);
      const h = document.createElement('li'); h.className = 'level-h'; h.innerHTML = `<span>${lvl}</span><span class="muted small">${us.filter((u) => Prog.mastery(u.id) >= Prog.PASS).length}/${us.length} · ${avg}%</span>`; list.appendChild(h);
      for (const u of us) {
        const m = Prog.mastery(u.id), open = Prog.unlocked(u.id, DEBUG), mastered = m >= Prog.PASS;
        const idx = C.ORDER.indexOf(u.id); let pj = idx - 1; while (pj > 0 && C.UNITS.find((x) => x.id === C.ORDER[pj]).selfCheck) pj--;
        const prev = C.UNITS.find((x) => x.id === C.ORDER[pj]);
        const li = document.createElement('li');
        const isCur = open && !mastered && !currentMarked && !u.selfCheck && idx >= placed;
        li.className = 'unit' + (mastered ? ' mastered' : '') + (!open ? ' locked' : '') + (isCur ? ' current' : '') + (u.selfCheck ? ' guide' : '');
        if (isCur) currentMarked = true;
        const tag = idx < placed && !mastered ? 'skipped by placement · open any time' : u.firstWin ? 'start here · 5 min · mic' : u.tutorial ? 'tutorial · learn it step by step' : u.selfCheck ? 'guide + try-it steps' : u.rhythm ? 'rhythm · mic' : u.ear ? 'ear · buttons' : 'mic-graded';
        li.innerHTML = `<div class="num">${mastered ? '✓' : open ? (idx + 1) : '🔒'}</div><div class="grow"><div class="ttl">${u.title}</div><div class="lvl">${tag}${!open && prev ? ' · master “' + prev.title + '” to unlock' : ''}</div><div class="bar"><div style="width:${m}%"></div></div></div><div class="pct">${u.selfCheck ? (mastered ? 'done' : '') : m + '%'}</div>`;
        li.dataset.unit = u.id;
        if (open) li.onclick = () => openLesson(u.id);
        list.appendChild(li);
      }
      const ss = Sg.SONGS.filter((s) => s.level === lvl);
      if (ss.length) {
        const row = document.createElement('li'); row.className = 'song-row';
        row.innerHTML = `<span class="muted small">🎵 Songs</span>` + ss.map((s) => `<button class="chip ${Sg.unlocked(Prog, s, DEBUG) ? '' : 'locked'}" data-song="${s.id}">${Sg.unlocked(Prog, s, DEBUG) ? '' : '🔒 '}${s.title}${Sg.unlocked(Prog, s, DEBUG) ? ` <i>${stars(Sg.stars(Prog, s))}</i>` : ''}</button>`).join('');
        row.querySelectorAll('button').forEach((b) => (b.onclick = () => { const s = Sg.SONGS.find((x) => x.id === b.dataset.song); if (Sg.unlocked(Prog, s, DEBUG)) requireMic(() => openSong(s.id, null)); else renderSongs(); }));
        list.appendChild(row);
      }
    }
    $('soonList').innerHTML = '';
    $('soonH').hidden = true;
  }
  $('btnFree').onclick = () => requireMic(openPractice);
  $('btnStats').onclick = renderStats;

  // ---------------- lesson ----------------
  let curUnit = 1;
  // ---------------- lessons: step-by-step cards with mic-graded "try it" steps ----------------
  const Ls = window.Lessons;
  let LS = null;
  const unitOf = (id) => C.UNITS.find((x) => x.id === id);
  const micReady = () => (micOn && ctx && ctx.state === 'running') || midi.inputs.length > 0;
  const tipOfDay = () => Ls.TIPS[Math.floor(Date.now() / 864e5) % Ls.TIPS.length];
  function openLesson(id, at) {
    curUnit = id; const u = unitOf(id), steps = Ls.steps(id), ud = Prog.unitData(id);
    const i = at != null ? at : ud.lessonSeen && !(u.firstWin || u.tutorial) ? steps.length : 0;
    if (LS && LS.timer) clearTimeout(LS.timer);
    LS = { id, u, steps, i, done: new Set(ud.lessonDone || []), tr: null };
    show('lesson');
    $('lessonLevel').textContent = `Unit ${C.ORDER.indexOf(u.id) + 1} · ${u.level}`; $('lessonTitle').textContent = u.title;
    renderCard();
  }
  function renderCard() {
    const { u, steps, i } = LS, N = steps.length, final = i >= N;
    frameHandler = null; LS.tr = null; if (LS.timer) clearTimeout(LS.timer);
    $('lsDots').innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : LS.done.has(k) ? 'ok' : ''}"></i>`).join('') + `<i class="fin ${final ? 'on' : ''}">★</i>`;
    $('lsStep').hidden = final; $('lsFinal').hidden = !final;
    $('lsBack').disabled = i === 0;
    if (final) return renderFinal();
    const c = steps[i];
    $('lsH').textContent = c.h; $('lsP').innerHTML = c.p || '';
    let vis = '';
    if (c.staff) vis += `<div class="staff-wrap">${renderSpec(c.staff)}</div>`;
    if (c.beats) vis += Ls.beats(c.beats.r, c.beats);
    if (c.chips) vis += `<div class="chips seq leadsheet">${c.chips.map((x) => `<span>${pretty(x)}</span>`).join('')}</div>`;
    if (c.hand) vis += Ls.hand(c.hand.side, c.hand.on, c.hand.names);
    if (c.kbd != null) vis += `<div id="lsKbd">${Ls.keyboard(c.kbd)}</div>`;
    $('lsVis').innerHTML = vis;
    $('lsDemo').hidden = !c.demo; $('lsDemo').onclick = () => playDemo(c.demo);
    $('lsTip').hidden = !c.tip; $('lsTip').innerHTML = c.tip ? '💡 ' + c.tip : '';
    const t = c.try;
    $('lsTry').hidden = !t; ['lsMic', 'lsGo', 'lsDone'].forEach((b) => ($(b).hidden = true));
    $('lsStatus').textContent = ''; $('lsStatus').className = 'try-status'; $('lsHear').textContent = '';
    if (t) {
      $('lsSay').textContent = t.say || '';
      LS.tr = { ...t, step: 0, since: performance.now(), ok: LS.done.has(i), heard: [] };
      if (LS.tr.ok) setStatus('✓ Done! Tap Next.', 'ok');
      if (t.t === 'self') { $('lsDone').hidden = LS.tr.ok; $('lsDone').onclick = () => tryPass('✓ Great.'); }
      else if (!micReady()) { $('lsMic').hidden = false; setStatus('The app needs to hear your piano for this step.'); }
      else { if (micPaused) pauseMic(false); frameHandler = lessonFrame; if (t.t === 'rhythm') { $('lsGo').hidden = false; $('lsGo').textContent = '▶ Start'; } else if (!LS.tr.ok) setStatus('Listening… 👂'); }
      if (t.t === 'seq') renderSeqStatus();
    }
    updateNext();
  }
  function updateNext() {
    const c = LS.steps[LS.i], pending = c && c.try && !(LS.tr && LS.tr.ok);
    $('lsNext').textContent = LS.i >= LS.steps.length - 1 ? 'Finish ★' : pending ? 'Skip →' : 'Next →';
    $('lsNext').className = pending ? 'ghost' : 'primary';
    $('lsNav').hidden = LS.i >= LS.steps.length;
  }
  $('lsNext').onclick = () => { if (!LS) return; LS.i++; renderCard(); };
  $('lsBack').onclick = () => { if (!LS || LS.i === 0) return; LS.i--; renderCard(); };
  $('lsReview').onclick = () => { LS.i = 0; renderCard(); };
  $('lsMic').onclick = () => { const id = LS.id, i = LS.i; requireMic(() => openLesson(id, i)); };
  $('lsGo').onclick = () => startTryRhythm();
  function setStatus(msg, cls) { $('lsStatus').textContent = msg; $('lsStatus').className = 'try-status' + (cls ? ' ' + cls : ''); }
  function flashKey(m, ok) { const el = $('lsKbd'); if (el) el.innerHTML = Ls.keyboard(LS.steps[LS.i].kbd, { heard: { midi: m, ok } }); }
  function tryPass(msg) {
    const t = LS.tr; if (!t || t.ok) return; t.ok = true; LS.done.add(LS.i);
    const ud = Prog.unitData(LS.id); ud.lessonDone = [...LS.done]; Prog.save();
    setStatus(msg + ' Tap Next.', 'ok'); $('lsDone').hidden = true; $('lsGo').hidden = true; updateNext(); renderDotsOnly();
    testLog.push({ lesson: LS.id, step: LS.i, ok: true, heard: msg });
  }
  function tryFail(msg) { setStatus(msg, 'bad'); testLog.push({ lesson: LS.id, step: LS.i, ok: false, heard: msg }); }
  function renderDotsOnly() { $$('#lsDots i').forEach((el, k) => k < LS.steps.length && el.classList.toggle('ok', LS.done.has(k))); }
  const nm = (m) => pretty(D.midiName(m)), letter = (m) => pretty(D.PC_FLAT[((m % 12) + 12) % 12]);
  function explain(m, tgt, exact) {
    let d = m - tgt;
    if (exact && d % 12 === 0) { const o = Math.abs(d / 12); return `You played ${nm(m)}: right letter, wrong octave. Go ${o > 1 ? o + ' octaves' : 'one octave'} ${d > 0 ? 'lower (to the left)' : 'higher (to the right)'}.`; }
    if (!exact) d = ((d % 12) + 18) % 12 - 6;
    const k = Math.abs(d), side = d > 0 ? 'right' : 'left', back = d > 0 ? 'left' : 'right';
    const isW = (x) => ![1, 3, 6, 8, 10].includes(((x % 12) + 12) % 12);
    if (isW(m) && isW(tgt) && k <= 12) { const tg2 = m - d, w = Math.abs(dia(m) - dia(tg2)); return `That was ${exact ? nm(m) : letter(m)}. The note you want is ${exact ? nm(tg2) : letter(tg2)}, ${w === 1 ? 'one white key' : w + ' white keys'} to the ${back}.`; }
    const who = exact ? nm(m) : letter(m);
    if (k > 7) return `You played ${who}. That’s too far ${side}. Look for the key further ${back}.`;
    return `You played ${who}. That’s ${k === 1 ? 'one key' : k + ' keys'} to the ${side} of ${exact ? nm(tgt) : letter(tgt)}. Move ${k === 1 ? 'one key' : k + ' keys'} ${back}.`;
  }
  function renderSeqStatus() {
    const t = LS.tr, names = [].concat(t.n);
    $('lsHear').innerHTML = names.map((n, k) => `<span class="sq ${k < t.step ? 'done' : k === t.step ? 'cur' : ''}">${pretty(n.replace(/-?\d$/, ''))}</span>`).join(' ');
  }
  function lessonFrame(f) {
    const t = LS && LS.tr; if (!t || t.ok || micPaused || LS.playing) return;
    const now = f.now;
    if (t.t !== 'seq') { const hs = heardSummary(f); if (hs.main !== '—') $('lsHear').textContent = 'I hear: ' + hs.main; }
    if (t.t === 'any') { if (f.events.length) { flashKey(f.events[0], true); tryPass(`✓ I heard ${nm(f.events[0])}! Your mic works.`); } else if (f.onset && f.level > gate() * 2) tryPass('✓ I heard you! Your mic works.'); return; }
    if (t.t === 'note') {
      const tg = C.midiOf(t.n);
      for (const m of f.events) {
        const ok = t.exact ? m === tg : ((m - tg) % 12 + 12) % 12 === 0;
        flashKey(m, ok);
        if (ok) return tryPass(`✓ Yes! That’s ${t.exact ? nm(m) : letter(m)}.`);
        tryFail(explain(m, tg, !!t.exact));
      }
      return;
    }
    if (t.t === 'seq') {
      const names = [].concat(t.n), seq = names.map(C.midiOf);
      for (const m of f.events) {
        if (m <= Math.min(...seq) - 12) continue;   // subharmonic glitch
        const tg = seq[t.step], pc = (m % 12 + 12) % 12, ok = ((m - tg) % 12 + 12) % 12 === 0;
        if (ok) { t.step++; flashKey(m, true); renderSeqStatus(); if (t.step >= seq.length) return tryPass('✓ All correct!'); setStatus(`✓ ${letter(m)}, now ${pretty(names[t.step].replace(/-?\d$/, ''))}`, 'ok'); continue; }
        if (t.step > 0 && pc === (seq[t.step - 1] % 12 + 12) % 12) continue;
        flashKey(m, false); tryFail(`Note ${t.step + 1}: ` + explain(m, tg, false) + ' Try that note again.');
      }
      return;
    }
    if (t.t === 'chord') {
      const ms = t.n.map(C.midiOf), pcs = [...new Set(ms.map((m) => (m % 12 + 12) % 12))];
      const target = { kind: 'chord', pcs, root: null }; if (t.bass) target.bass = D.PC_FLAT.indexOf(t.bass) >= 0 ? D.PC_FLAT.indexOf(t.bass) : (C.midiOf(t.bass + '3') % 12);
      if (f.onset && (!t.att || now - t.att.since > 1800)) t.att = { since: now - TICK_MS };
      if (!t.att) return;
      const el = now - t.att.since; if (el < 300) return;
      const res = D.gradeWindow(win, target, t.att.since, { ...strictOpts(), elapsedMs: el });
      if (res.ok) return tryPass('✓ That’s it!');
      if (el > 1700) {
        t.att = null; if (!res.heardLabel) return;
        let msg = `I heard ${pretty(res.heardLabel)}.`;
        if (res.missing && res.missing.length) msg += ` Missing: ${res.missing.map((pc) => pretty(D.PC_FLAT[pc])).join(', ')}.`;
        else if (target.bass != null) msg += ` Make ${pretty(D.PC_FLAT[target.bass])} your lowest note.`;
        else msg += ' Some extra keys are sounding. Play only the highlighted keys.';
        tryFail(msg);
      }
      return;
    }
    if (t.t === 'pulse') {
      const ons = onsetLog.filter((o) => o.t > t.since).filter((o, k, a) => !k || o.t - a[k - 1].t > 150);
      if (ons.length === t.lastN) return; t.lastN = ons.length;
      if (ons.length < t.count) { if (ons.length) setStatus(`${ons.length} of ${t.count}…`); return; }
      const w = ons.slice(-t.count), iv = w.slice(1).map((o, k) => o.t - w[k].t), mean = iv.reduce((a, b) => a + b, 0) / iv.length, dev = Math.max(...iv.map((x) => Math.abs(x - mean))) / mean;
      if (dev < 0.22 && mean > 220 && mean < 1600) return tryPass(`✓ Nice and steady (${Math.round(60000 / mean)} beats per minute).`);
      if (ons.length >= t.count + 2 || dev > 0.5) { t.since = now; t.lastN = 0; tryFail(mean <= 220 ? 'Too fast. Leave about half a second between notes.' : 'A bit uneven. Count “1 2 3 4” out loud and play on each number.'); }
      return;
    }
    if (t.t === 'pf') {
      const ons = onsetLog.filter((o) => o.t > t.since);
      if (ons.length < 2 || now - ons[1].t < 400) return;
      const r = peakAfter(ons[1].t) / Math.max(1e-6, peakAfter(ons[0].t)); t.since = now;
      if (r >= 2) return tryPass(`✓ Great contrast! The loud one was ${(20 * Math.log10(r)).toFixed(0)} dB louder.`);
      tryFail(r < 1 ? 'The second note was softer. Play the first one gently, the second one strongly.' : 'They sounded too similar. Make the soft one softer and the loud one louder.');
      return;
    }
    if (t.t === 'hold') {
      if (!t.h0) { if (f.onset) t.h0 = now; return; }
      const held = now - t.h0, ago = levelLog.filter((l) => l.t <= now - 200 && l.t > now - 300).pop();
      const damped = ago && held > 300 && f.level < ago.level * 0.25;       // a sudden drop = dampers came down (keys or pedal lifted)
      if (damped && held < 2000) { t.h0 = null; return tryFail(`The sound stopped after ${(held / 1000).toFixed(1)} s. Keep the pedal pressed while you lift your hands.`); }
      if (held > 2500 || (held > 1500 && f.level < gate() * 1.2)) return tryPass('✓ It kept ringing. That’s the pedal at work.');
      setStatus(`Ringing… ${(held / 1000).toFixed(1)} s`);
      return;
    }
    if (t.t === 'improv') {
      for (const m of f.events) {
        const pc = (m % 12 + 12) % 12, inside = t.scale.includes(pc); t.heard.push(inside);
        flashKey(m, inside);
        const n = t.heard.length, ins = t.heard.filter(Boolean).length;
        if (!inside) tryFail(`${letter(m)} isn’t in this scale. Stick to the blue keys.`); else setStatus(`${n} notes${n >= t.count ? `, now end on ${pretty(D.PC_FLAT[t.root])}` : ''}`);
        if (n >= t.count && pc === t.root && ins / n >= 0.8) return tryPass(`✓ You improvised ${n} notes!`);
      }
      return;
    }
    if (t.t === 'rhythm' && t.r0) {
      if (now < t.r0) { setStatus(`Count-in… ${Math.min(t.beats, Math.floor((now - (t.r0 - t.beats * t.clickMs)) / t.clickMs) + 1)}`); return; }
      if (now < t.end) { setStatus('Play! 🎵'); return; }
      const els = D.parseRhythm(t.r), exp = D.rhythmOnsets(els).map((o) => ({ t: t.r0 + o.pos * t.msPerQ, pc: null }));
      const det = onsetLog.filter((o) => o.t >= t.r0 - 400 && o.t <= t.end).map((o) => ({ t: o.t, pc: null }));
      const res = D.gradeRhythm(exp, det, { tol: 150, maxComp: 180, tailMs: Math.min(t.msPerQ * 0.6, 400), allowExtra: 1 });
      t.r0 = null; $('lsGo').hidden = false; $('lsGo').textContent = '▶ Try again';
      if (res.ok) return tryPass(`✓ Right on the beat! (±${res.meanAbs} ms)`);
      if (!det.length) return tryFail('I didn’t hear any notes. Start right after the 4th click.');
      const firstMiss = res.misses.length ? res.misses[0] + 1 : null;
      tryFail(`${res.hits.length} of ${exp.length} notes on time.` + (firstMiss ? ` Note ${firstMiss} was missing or off the beat.` : '') + (res.extras.length ? ' There were extra notes: stay silent on rests and hold long notes.' : ''));
    }
  }
  function startTryRhythm() {
    const t = LS.tr; if (!t) return; ensureContext(); ctx.resume();
    const ts = t.ts || [4, 4], msPerQ = 60000 / t.bpm, clickMs = msPerQ, beats = ts[0], lead = 0.15, base = ctx.currentTime + lead;
    for (let k = 0; k < beats; k++) clickAt(base + k * clickMs / 1000, k === 0);
    const total = D.parseRhythm(t.r).reduce((a, e) => Math.max(a, e.pos + e.dur), 0);
    Object.assign(t, { msPerQ, clickMs, beats, r0: performance.now() + lead * 1000 + beats * clickMs });
    t.end = t.r0 + total * msPerQ + 450; $('lsGo').hidden = true;
  }
  function playDemo(d) {
    ensureContext(); ctx.resume(); startLoop();
    const t0 = ctx.currentTime + 0.1; let len = 1.5;
    if (d.chord) { d.chord.map(C.midiOf).forEach((m) => pianoTone(m, t0, 1.8)); len = 1.9; }
    else if (d.seq2) { d.seq2.forEach((ch, k) => ch.map(C.midiOf).forEach((m) => pianoTone(m, t0 + k * 1.4, 1.4))); len = d.seq2.length * 1.4 + 0.3; }
    else if (d.r) {
      const q = 60 / d.bpm * (d.unit || 1), els = D.parseRhythm(d.r), on = D.rhythmOnsets(els), beatsN = d.unit ? 6 : 4;
      for (let k = 0; k < beatsN; k++) clickAt(t0 + k * q, k === 0);
      const st = t0 + beatsN * q, qq = 60 / d.bpm, notes = (d.notes || []).map(C.midiOf);
      on.forEach((o, k) => pianoTone(notes[k] || 72, st + o.pos * qq, Math.max(0.25, els[o.idx].dur * qq * 0.9)));
      len = beatsN * q + els.reduce((a, e) => Math.max(a, e.pos + e.dur), 0) * qq + 0.5;
    } else { const gap = d.gap || 0.55; d.n.map(C.midiOf).forEach((m, k) => pianoTone(m, t0 + k * gap, d.dur || 0.9, false, d.vel ? d.vel[k] : 1)); len = d.n.length * gap + 0.8; }
    const wasPaused = micPaused; if (micStream) pauseMic(true); LS.playing = true; $('lsDemo').disabled = true;
    clearTimeout(LS.timer); LS.timer = setTimeout(() => { LS.playing = false; $('lsDemo').disabled = false; if (micStream && !wasPaused) pauseMic(false); if (LS.tr) LS.tr.since = performance.now(); }, (len + 0.4) * 1000);
  }
  function renderFinal() {
    const { u, id } = { u: LS.u, id: LS.id }, m = Prog.mastery(id), ud = Prog.unitData(id);
    if (!ud.lessonSeen) { ud.lessonSeen = true; Prog.save(); }
    $('lsNav').hidden = true; $('btnStartDrill').hidden = false;
    $('lessonVisual').innerHTML = ''; $('lessonText').innerHTML = u.firstWin || u.tutorial ? '' : `<details><summary>Lesson summary</summary>${u.lesson}</details>`;
    $('lsFinalTip').textContent = '💡 ' + tipOfDay();
    $('lessonBar').style.width = m + '%'; $('lessonPct').textContent = u.selfCheck ? (m ? 'done ✓' : 'not done yet') : `${m}% mastery`;
    $('lessonChecklist').innerHTML = u.selfCheck && u.checklist.length ? `<div class="muted small">Tick each one when you can do it:</div>` + u.checklist.map((c, i) => `<label class="chk"><input type="checkbox" data-i="${i}" ${(ud.checks || [])[i] ? 'checked' : ''}> ${c}</label>`).join('') : '';
    $$('#lessonChecklist input').forEach((cb) => (cb.onchange = () => { ud.checks = ud.checks || []; ud.checks[+cb.dataset.i] = cb.checked; Prog.save(); }));
    const nextId = C.ORDER[C.ORDER.indexOf(id) + 1];
    if (u.firstWin || u.tutorial) {
      const tries = LS.steps.filter((c) => c.try).length, got = LS.steps.filter((c, k) => c.try && LS.done.has(k)).length;
      $('lsFinalH').textContent = got >= tries - 1 ? (u.firstWin ? '🎉 You played your first tune!' : '🎉 Tutorial complete!') : 'Almost there';
      $('lessonRule').textContent = got >= tries - 1 ? (u.firstWin ? 'You found middle C, learned finger numbers and played real notes. Next up: the five-finger position.' : `You can now: ${u.lesson.charAt(0).toLowerCase() + u.lesson.slice(1)} Next: ${unitOf(nextId) ? unitOf(nextId).title : 'more practice'}.`) : `You’ve done ${got} of ${tries} try-it steps. Go back and try the ones you skipped. It’s quick!`;
      if (got >= tries - 1 && !m) Prog.markDone(id, true);
      if (DY && DY.seg.kind === 'lesson' && DY.seg.unit === id && got >= tries - 1) { Sg.markDaily(Prog, DY.idx); $('btnStartDrill').textContent = 'Continue today’s practice →'; $('btnStartDrill').onclick = () => dailyNext(); $('lessonBar').style.width = '100%'; $('lessonPct').textContent = 'done ✓'; return; }
      $('btnStartDrill').textContent = 'Next lesson →'; $('btnStartDrill').onclick = () => openLesson(nextId, 0);
      $('lessonBar').style.width = Prog.mastery(id) + '%'; $('lessonPct').textContent = Prog.mastery(id) ? 'done ✓' : `${got}/${tries} steps`;
      return;
    }
    $('lsFinalH').textContent = u.selfCheck ? 'Check yourself' : 'Ready to practise';
    $('lessonRule').textContent = u.selfCheck ? 'The mic can’t judge this one fully, so you decide. This unit never blocks your path.' : u.ear ? 'The phone plays sounds and you tap the answer.' : u.rhythm ? `Each round: tap Start, hear 4 clicks, then play. Notes must start on time. Reach ${Prog.PASS}% to unlock the next unit.` : `Practice rounds are about 10 quick questions. Get ${Prog.PASS}% to unlock the next unit. Missed questions come back more often.`;
    if (u.selfCheck) { $('btnStartDrill').textContent = m ? '↺ Mark as not done' : '✓ I can do this'; $('btnStartDrill').onclick = () => { Prog.markDone(id, !m); if (!m && DY && DY.seg.kind === 'lesson' && DY.seg.unit === id) { Sg.markDaily(Prog, DY.idx); return dailyNext(); } openLesson(id); }; return; }
    $('btnStartDrill').textContent = u.ear ? 'Start ear training 🔊' : u.rhythm ? 'Start rhythm practice 🥁' : 'Start practice 🎤';
    $('btnStartDrill').onclick = () => (u.ear ? (ensureContext(), ctx.resume(), startLoop(), startDrill(id)) : requireMic(() => startDrill(id)));
  }
  // ---------------- onboarding ----------------
  function startOnboarding() { show('onboard'); ['ob1', 'ob2', 'ob3'].forEach((x, k) => ($(x).hidden = k !== 0)); }
  const obStep = (k) => ['ob1', 'ob2', 'ob3'].forEach((x, j) => ($(x).hidden = j !== k));
  const obFinish = () => { localStorage.setItem('pt.onboarded', '1'); if (pendingPlacement) { pendingPlacement = false; return openPlacement(); } openLesson(C.ORDER[0], 0); };
  $('obNext1').onclick = () => obStep(1);
  $('obSkip').onclick = () => { localStorage.setItem('pt.onboarded', '1'); renderMap(); };
  $('obMic').onclick = async () => { if (await startMic()) { if (S.calibrated) obFinish(); else obStep(2); } else { $('obErr').hidden = false; $('obErr').textContent = 'The microphone is blocked. In iPhone Settings → Safari → Microphone, choose Allow, then reload.'; } };
  $('obCalib').onclick = () => startCalibration(obFinish);
  function renderChordRow(v) { // several chords side by side, each on its own short staff
    return `<div class="chord-row" style="display:flex">${v.notes.map((g, i) => `<div style="flex:1;min-width:0">${Staff.render({ clef: v.clef, notes: g, mode: 'chord', keySig: i === 0 ? v.keySig : undefined, labels: [v.labels[i]], width: 150 })}</div>`).join('')}</div>`;
  }

  // ---------------- drill engine ----------------
  let Dr = null;
  const testLog = [];
  function startDrill(unitId, opts = {}) {
    const u = C.UNITS.find((x) => x.id === unitId);
    Dr = { u, opts, n: 0, len: opts.sessionLen || (u.rhythm ? 8 : [7, 9, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 30, 31, 32, 34].includes(u.id) ? 6 : 10), results: [], streak: 0, lastKey: null, startMastery: Prog.mastery(unitId), fixed: opts.items ? [...opts.items] : null };
    if (!opts.noRecord) { Prog.unitData(unitId).sessions++; Prog.save(); }
    $('dHint').hidden = opts.placement != null;
    show('drill'); $('summary').hidden = true; $('drillUnit').textContent = `Unit ${C.ORDER.indexOf(u.id) + 1}: ${u.title}`;
    frameHandler = drillFrame;
    const rc = !opts.items && !opts.fast && refresherCard(u.id);
    $('dRefresh').hidden = !rc; $('drillCard').hidden = !!rc; $('drill').classList.toggle('refreshing', !!rc); $('dHint').textContent = '👁 Show me';
    if (rc) {
      $('rfH').textContent = rc.h; $('rfP').innerHTML = rc.p;
      $('rfVis').innerHTML = (rc.staff ? `<div class="staff-wrap">${renderSpec(rc.staff)}</div>` : '') + (rc.beats ? Ls.beats(rc.beats.r, rc.beats) : '') + (rc.hand ? Ls.hand(rc.hand.side, rc.hand.on, rc.hand.names) : '') + (rc.kbd != null ? Ls.keyboard(rc.kbd) : '');
      Dr.waiting = true; $('rfGo').onclick = () => { $('dRefresh').hidden = true; $('drillCard').hidden = false; Dr.waiting = false; $('drill').classList.remove('refreshing'); nextItem(); };
      $('rfLesson').onclick = () => { const id = u.id; Dr = null; openLesson(id, 0); };
      return;
    }
    nextItem();
  }
  function refresherCard(id) {   // the lesson card that best sums up the skill: one with a picture and a try-it step
    const st = Ls.steps(id); return st.find((c) => c.try && c.try.t !== 'self' && (c.kbd || c.staff || c.hand || c.beats)) || st.find((c) => c.kbd || c.staff || c.beats) || null;
  }
  function nextItem() {
    if (Dr.n >= Dr.len) return showSummary();
    const key = Dr.fixed && Dr.fixed.length ? Dr.fixed.shift() : Prog.pick(Dr.u.id, Dr.lastKey);
    const it = Dr.u.item(key);
    Object.assign(Dr, { key, it, lastKey: key, shownAt: performance.now(), attempt: null, tries: 0, step: 0, missed: false, locked: false, hinted: false, recorded: false, revealed: false, playing: false });
    $('drillProg').style.width = (100 * Dr.n / Dr.len) + '%'; $('dHint').textContent = '👁 Show me';
    $('drillCard').className = 'prompt-card';
    $('dTitle').textContent = it.title; $('dBig').textContent = it.big || ''; $('dBig').style.fontSize = (it.big || '').length > 8 ? '2.1rem' : '';
    $('dStaff').innerHTML = renderSpec(it.staff);
    $('dSub').textContent = it.sub || ''; $('dAnswer').textContent = ''; $('dStatus').textContent = it.ear ? '' : 'Listening…';
    Dr.rh = null; Dr.ex = null; Dr.imp = it.grade.type === 'improv' ? { pcs: [], outside: 0 } : null;
    renderSeq(); renderChoices();
    $('dReplay').hidden = !(it.ear || it.play);
    $('dStart').hidden = it.grade.type !== 'rhythm'; $('dBeats').innerHTML = '';
    if (it.grade.type === 'rhythm') { $('dStatus').textContent = 'Tap ▶ Start: 1 bar count-in, then play'; $('dBig').textContent = it.big || ''; }
    if (it.grade.ramp) { const rp = it.grade.ramp, b = Math.min(rp.goal, rp.start + rp.step * Prog.tempoLevel(Dr.u.id, key)); $('dSub').textContent = `${it.sub} · ♩ = ${b} · goal ${rp.goal}`; }
    drawKeyboard($('dKbd'), [], []);
    if (it.ear || it.play) playPrompt();
  }
  function renderSeq() {
    const g = Dr.it.grade, el = $('dSeq');
    el.classList.toggle('leadsheet', !!Dr.it.leadsheet);
    if (g.type === 'improv') { el.innerHTML = (Dr.imp ? Dr.imp.pcs.slice(-16) : []).map((x) => `<span class="${x.in ? 'done' : 'bad'}">${pretty(D.PC_FLAT[x.pc])}</span>`).join('') || '<span class="muted">play…</span>'; return; }
    if (g.type === 'chords' && Dr.it.leadsheet) { el.innerHTML = g.labels.map((l, i) => `<span class="${i < Dr.step ? 'done' : i === Dr.step ? 'cur' : ''}">${l}</span>`).join(''); return; }
    if (g.type === 'notes') el.innerHTML = g.seq.map((_, i) => `<span class="${i < Dr.step ? 'done' : i === Dr.step ? 'cur' : ''}">${i < Dr.step || Dr.hinted ? g.labels[i] : '•'}</span>`).join('');
    else if (g.type === 'chords') el.innerHTML = g.labels.map((l, i) => `<span class="${i < Dr.step ? 'done' : i === Dr.step ? 'cur' : ''}">${l}${i < Dr.step || Dr.hinted ? ' = ' + g.names[i] : ''}</span>`).join('');
    else el.innerHTML = '';
  }
  function renderChoices() {
    const g = Dr.it.grade, el = $('dChoices'); el.innerHTML = '';
    if (g.type !== 'choice') return;
    for (const [val, label] of g.options) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.val = val;
      b.onclick = () => { if (Dr.locked || Dr.playing) return; if (val === g.answer) { b.classList.add('right'); itemCorrect({ heardLabel: '' }); } else { b.classList.add('wrong'); itemWrong({ heardLabel: label }, true); } };
      el.appendChild(b);
    }
  }
  function playPrompt() {
    ensureContext(); ctx.resume();
    const p = Dr.it.play || Dr.it.grade.play, t0 = ctx.currentTime + 0.08, gap = p.gap || 0.6;
    let dur = p.melodic ? p.notes.length * gap + 1.0 : 1.8;
    pauseMic(true); Dr.playing = true; $('dStatus').textContent = '🔊 Listen… (mic paused)';
    if (p.chords) { const gs = [].concat(p.gap || 1.1); let t = t0; p.chords.forEach((ch, k) => { ch.forEach((m) => pianoTone(m, t, 1.3, DEBUG && params.has('selfhear'))); t += gs[Math.min(k, gs.length - 1)]; }); dur = t - t0 + 0.9; }
    else p.notes.forEach((m, i) => pianoTone(m, p.melodic ? t0 + i * gap : t0, p.melodic ? 1.2 : 1.8, DEBUG && params.has('selfhear')));
    clearTimeout(Dr.playTimer);
    Dr.playTimer = setTimeout(() => { Dr.playing = false; pauseMic(false); Dr.shownAt = performance.now(); if (!Dr.locked) $('dStatus').textContent = Dr.it.ear ? 'Which one was it?' : 'Now play it back 🎤'; }, (dur + 0.45) * 1000);
  }
  $('dReplay').onclick = () => Dr && (Dr.it.ear || Dr.it.play) && !Dr.playing && !Dr.locked && (Dr.step = 0, renderSeq(), playPrompt());

  // ---------------- rhythm drills ----------------
  function clickAt(when, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.25, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g); g.connect(ctx.destination); o.start(when); o.stop(when + 0.06);
  }
  function startRhythm(anchor) {
    if (!Dr || Dr.it.grade.type !== 'rhythm' || Dr.locked) return;
    const g = Dr.it.grade, box = Prog.itemBox(Dr.u.id, Dr.key), bpm = g.ramp ? Math.min(g.ramp.goal, g.ramp.start + g.ramp.step * Prog.tempoLevel(Dr.u.id, Dr.key)) : Math.round(g.bpm * (1 + 0.08 * Math.min(box, 3)));
    const msPerQ = 60000 / bpm, clickMs = msPerQ * g.clickUnit, n = g.timeSig[0];
    let t0;
    if (anchor != null) t0 = anchor;                                  // test hook: no count-in
    else {
      ensureContext(); ctx.resume();
      const lead = 0.15, base = ctx.currentTime + lead;
      for (let k = 0; k < n; k++) clickAt(base + k * clickMs / 1000, k === 0);
      t0 = performance.now() + lead * 1000 + n * clickMs;
    }
    Dr.rh = { t0, msPerQ, clickMs, n, bpm, end: t0 + g.total * msPerQ + 450, graded: false };
    $('dStart').hidden = true; $('dSub').textContent = `${g.timeSig[0]}/${g.timeSig[1]} · ♩ = ${bpm}`;
    $('dBeats').innerHTML = Array.from({ length: n }, (_, k) => `<i data-k="${k}"></i>`).join('');
    rhythmAnim();
  }
  function rhythmAnim() {
    if (!Dr || !Dr.rh || Dr.rh.graded) return;
    const r = Dr.rh, now = performance.now();
    const beat = Math.floor((now - (r.t0 - r.n * r.clickMs)) / r.clickMs);
    $$('#dBeats i').forEach((el, k) => el.classList.toggle('on', ((beat % r.n) + r.n) % r.n === k));
    if (now < r.t0) $('dStatus').textContent = `Count-in: ${Math.min(r.n, beat + 1)}`;
    else { $('dStatus').textContent = 'Play!'; $('dStaff').innerHTML = renderSpec(Dr.it.staff, { playhead: Math.min((now - r.t0) / r.msPerQ, Dr.it.grade.total - 0.01) }); }
    requestAnimationFrame(rhythmAnim);
  }
  function pcAround(t) {      // most common detected pitch class shortly after an onset
    const cnt = {}; for (const f of longWin.frames) { if (f.t < t + 40 || f.t > t + 380) continue; const m = f.mono != null ? f.mono : (f.notes[0] && f.notes[0].midi); if (m != null) { const pc = ((m % 12) + 12) % 12; cnt[pc] = (cnt[pc] || 0) + 1; } }
    let b = null; for (const k in cnt) if (b == null || cnt[k] > cnt[b]) b = k; return b == null ? null : +b;
  }
  function pcsAround(t) {     // every pitch class that is clearly sounding shortly after an onset (for chords)
    const cnt = {}; let n = 0; for (const f of longWin.frames) { if (f.t < t + 60 || f.t > t + 420) continue; n++; for (const x of f.notes) { const pc = ((x.midi % 12) + 12) % 12; cnt[pc] = (cnt[pc] || 0) + 1; } }
    return Object.keys(cnt).filter((k) => cnt[k] >= Math.max(1, n * 0.3)).map(Number);
  }
  function gradeRhythmNow() {
    const g = Dr.it.grade, r = Dr.rh; r.graded = true;
    const detected = onsetLog.filter((o) => o.t >= r.t0 - 400 && o.t <= r.end).map((o) => ({ t: o.t, pc: g.pitched ? pcAround(o.t) : null, pcs: g.pitched ? pcsAround(o.t) : null }));
    const expected = g.onsets.map((o) => ({ t: r.t0 + o.pos * r.msPerQ, pc: o.pc, chord: o.chord }));
    const res = D.gradeRhythm(expected, detected, { tol: g.tol, maxComp: 180, tailMs: Math.min(r.msPerQ * 0.6, 400), allowExtra: g.onsets.some((o) => o.chord) ? 1e9 : g.onsets.some((o) => Array.isArray(o.pc)) ? 2 : g.pitched ? 1 : 0, ringOk: g.onsets.some((o) => Array.isArray(o.pc)) });
    if (window.PT_DEBUG) window._lastRh = { expected, detected, res };
    const colors = {}; const idxOf = (i) => D.rhythmOnsets(g.els)[i].idx;
    res.hits.forEach((h) => (colors[idxOf(h.i)] = h.pcOk ? '#3ecf8e' : '#ff6b6b')); res.misses.forEach((i) => (colors[idxOf(i)] = '#ff6b6b'));
    $('dStaff').innerHTML = renderSpec(Dr.it.staff, { colors }); $$('#dBeats i').forEach((el) => el.classList.remove('on'));
    const lag = res.offset ? ` · you play ${Math.abs(res.offset)} ms ${res.offset > 0 ? 'late' : 'early'} on average (allowed for)` : '';
    const label = `${res.hits.filter((h) => h.pcOk).length}/${expected.length} notes on time${res.meanAbs != null ? `, ±${res.meanAbs} ms` : ''}${res.extras.length ? `, ${res.extras.length} extra` : ''}`;
    Dr.lastRhythm = res;
    if (res.ok) itemCorrect({ heardLabel: label + lag }, { ms: Math.max(1, res.meanAbs || 1), target: g.tol * 0.45 });
    else {
      itemWrong({ heardLabel: detected.length ? label : '' });
      if (!detected.length) $('dStatus').textContent = "Didn't hear any notes. Play a bit louder or move the phone closer.";
      $('dStart').hidden = false; $('dStart').textContent = '▶ Try again';
    }
  }
  $('dStart').onclick = () => startRhythm();

  // ---------------- expression (dynamics / articulation) ----------------
  function peakAfter(t, ms = 300) {   // loudness the new note added (energy above whatever was still ringing just before it)
    let p = 0, pre = Infinity; for (const l of levelLog) { if (l.t >= t && l.t <= t + ms) p = Math.max(p, l.level); if (l.t >= t - 70 && l.t < t) pre = Math.min(pre, l.level); }
    if (pre === Infinity) pre = 0; return Math.sqrt(Math.max(p * p - pre * pre, p * p * 0.05));
  }
  function minBetween(a, b) { let m = Infinity; for (const l of levelLog) if (l.t > a && l.t < b) m = Math.min(m, l.level); return m === Infinity ? null : m; }
  function gradeExpr(f) {
    const g = Dr.it.grade, now = f.now;
    const ons = onsetLog.filter((o) => o.t > Dr.shownAt + 150 && (!Dr.ex || o.t >= Dr.ex.since));
    if (!Dr.ex) { if (!ons.length) return; Dr.ex = { since: ons[0].t }; }
    const mine = onsetLog.filter((o) => o.t >= Dr.ex.since);
    const done = mine.length >= g.count && now - mine[g.count - 1].t > 650;
    const timeout = now - Dr.ex.since > 3000 + g.count * 1200;
    $('dStatus').textContent = `Heard ${Math.min(mine.length, g.count)}/${g.count} notes…`;
    if (!done && !timeout) return;
    const use = mine.slice(0, g.count), pk = use.map((o) => peakAfter(o.t));
    let ok = use.length === g.count, why = ok ? '' : `only ${use.length} of ${g.count} notes`;
    const ratio = (a, b) => (b > 0 ? a / b : 0), db = (r) => (20 * Math.log10(r || 1e-9)).toFixed(0);
    if (ok && g.mode === 'pf') { const r = ratio(pk[1], pk[0]); ok = r >= 2; why = `second note ${db(r)} dB vs first (need +6 dB)`; }
    if (ok && g.mode === 'fp') { const r = ratio(pk[0], pk[1]); ok = r >= 2; why = `second note ${db(1 / r)} dB vs first (need −6 dB)`; }
    if (ok && (g.mode === 'cresc' || g.mode === 'dim')) {
      const seq = g.mode === 'cresc' ? pk : [...pk].reverse();
      const steps = seq.slice(1).every((x, i) => x >= seq[i] * 0.92), span = ratio(seq[seq.length - 1], seq[0]);   // no step clearly the wrong way + a real overall change
      ok = steps && span >= 2.2; why = steps ? `overall change ${db(span)} dB (need 7 dB)` : 'a note went ' + (g.mode === 'cresc' ? 'softer' : 'louder') + ' instead of ' + (g.mode === 'cresc' ? 'louder' : 'softer');
    }
    if (ok && g.mode === 'stacc') {
      const longs = use.filter((o, i) => { const end = Math.min(o.t + 320, use[i + 1] ? use[i + 1].t - 20 : o.t + 320), m = minBetween(o.t + 120, end); return m != null && m > pk[i] * 0.35; }).length;
      ok = longs === 0; why = `${longs} note${longs === 1 ? '' : 's'} held too long`;
    }
    if (ok && g.mode === 'legato') {
      const gaps = use.slice(0, -1).filter((o, i) => { const m = minBetween(o.t + 80, use[i + 1].t - 10); return m != null && m < pk[i] * 0.22; }).length;
      ok = gaps === 0; why = `${gaps} gap${gaps === 1 ? '' : 's'} between notes`;
    }
    if (ok) return itemCorrect({ heardLabel: g.mode === 'pf' || g.mode === 'fp' ? `${db(Math.max(ratio(pk[1], pk[0]), ratio(pk[0], pk[1])))} dB contrast` : '' });
    Dr.ex = null; itemWrong({ heardLabel: why });
    Dr.shownAt = Math.max(Dr.shownAt, now);
  }

  function drillFrame(f) {
    const hs = heardSummary(f);
    $('dHear').textContent = micPaused ? '(paused)' : hs.main; $('dHearNotes').textContent = micPaused ? '' : hs.sub;
    if (!Dr || !Dr.it) return;
    drawKeyboard($('dKbd'), Dr.locked || Dr.revealed ? Dr.it.show : [], hs.midis);
    if (Dr.locked || Dr.it.ear || micPaused || Dr.playing) return;
    const g = Dr.it.grade, now = f.now;
    if (g.type === 'rhythm') { if (Dr.rh && !Dr.rh.graded && now > Dr.rh.end) gradeRhythmNow(); return; }
    if (g.type === 'expr') return gradeExpr(f);
    if (g.type === 'improv') {
      for (const m of f.events) {
        const pc = ((m % 12) + 12) % 12, inside = g.scale.includes(pc);
        Dr.imp.pcs.push({ pc, in: inside }); if (!inside) Dr.imp.outside++;
        const n = Dr.imp.pcs.length, inRatio = 1 - Dr.imp.outside / n;
        renderSeq(); $('dStatus').textContent = `${n} notes · ${Math.round(100 * inRatio)}% in the scale${n >= g.count ? ` · now end on ${pretty(D.PC_FLAT[g.root])}` : ''}`;
        if (Dr.imp.outside > Math.max(3, n * 0.15)) { Dr.imp = { pcs: [], outside: 0 }; itemWrong({ heardLabel: `too many notes outside the scale (${pretty(D.PC_FLAT[pc])})` }); return; }
        if (n >= g.count && inRatio >= 0.85 && pc === g.root) return itemCorrect({ heardLabel: `${n} notes, ${Math.round(100 * inRatio)}% in scale` });
      }
      return;
    }
    if (g.type === 'notes') {
      const lowest = Dr.it.show && Dr.it.show.length ? Math.min(...Dr.it.show) : 0;
      for (const m of f.events) {
        const pc = ((m % 12) + 12) % 12;
        if (m <= lowest - 12 && pc !== g.seq[Dr.step]) continue;   // an octave+ below anything in the exercise: almost always a subharmonic glitch
        if (pc === g.seq[Dr.step]) { Dr.step++; renderSeq(); $('dStatus').textContent = Dr.step < g.seq.length ? `✓ ${pretty(D.PC_FLAT[pc])}, keep going` : ''; if (Dr.step === g.seq.length) return itemCorrect({ heardLabel: '' }); }
        else if (Dr.step > 0 && pc === g.seq[Dr.step - 1]) continue;  // same note re-detected
        else { Dr.missed = true; Dr.tries++; $('dStatus').textContent = `Heard ${pretty(D.midiName(m))}. That's not note ${Dr.step + 1}. Try that note again.`; log(false, D.midiName(m)); if (Dr.tries >= maxTries()) reveal(); }
      }
      return;
    }
    const target = g.type === 'chords' ? g.seq[Dr.step] : g.target;
    const windowMs = g.windowMs || 1600, seqItem = !!g.sequential;
    if (f.onset && (!Dr.attempt || now - Dr.attempt.since > (seqItem ? windowMs : 700))) {
      const before = win.chroma(now - 400), ignore = [];
      before.w.forEach((x, pc) => { if (x > 0.5 && !target.pcs.includes(pc)) ignore.push(pc); });
      Dr.attempt = { since: now - TICK_MS, ignore };
    }
    if (!Dr.attempt) return;
    const el = now - Dr.attempt.since, viaMidi = midiActive();
    if (el < (viaMidi ? 100 : 250)) return;
    const res = D.gradeWindow(win, target, Dr.attempt.since, { ...strictOpts(), elapsedMs: el, ignore: Dr.attempt.ignore, strictOctave: !!g.strictOctave });
    if (res.ok) {
      if (g.type === 'chords') {
        Dr.step++; Dr.attempt = null; renderSeq();
        if (Dr.step < g.seq.length) { $('dStatus').textContent = `✓ ${g.names[Dr.step - 1]}. Now ${g.labels[Dr.step]}`; return; }
      }
      return itemCorrect(res);
    }
    const silentFor = now - lastLoudT;
    if (el > windowMs + (seqItem ? 600 : 0) || (el > 600 && silentFor > (seqItem ? 1300 : 120) && !viaMidi)) itemWrong(res);
  }
  const maxTries = () => (Dr.opts.maxTries || 3);
  const rec = (...a) => { if (!Dr.opts.noRecord) Prog.record(...a); };   // placement checks don't touch progress
  function log(ok, heard) { testLog.push({ unit: Dr.u.id, key: Dr.key, step: Dr.step, ok, heard, t: Math.round(performance.now()) }); }
  function itemCorrect(res, timing) {
    Dr.locked = true;
    const ms = timing ? timing.ms : performance.now() - Dr.shownAt, firstTry = !Dr.missed && !Dr.hinted && Dr.tries === 0;
    const hintOnly = Dr.hinted && !Dr.missed && Dr.tries === 0;     // used "Show me" but played it right: half credit, no penalty
    if (!Dr.recorded) rec(Dr.u.id, Dr.key, firstTry || hintOnly, ms, timing ? timing.target : (Dr.it.targetMs || Dr.u.targetMs), hintOnly ? 0.5 : 1);
    const rp = Dr.it.grade.ramp; let rampMsg = '';
    if (rp && firstTry && !Dr.opts.noRecord && Dr.rh && Dr.rh.bpm < rp.goal) { Prog.bumpTempo(Dr.u.id, Dr.key); rampMsg = ` · next time ♩ = ${Math.min(rp.goal, Dr.rh.bpm + rp.step)}`; }
    else if (rp && firstTry && Dr.rh && Dr.rh.bpm >= rp.goal) rampMsg = ' · 🏁 tempo goal reached';
    Dr.results.push({ key: Dr.key, ok: firstTry, ms }); Dr.n++;
    Dr.streak = firstTry ? Dr.streak + 1 : 0; $('drillStreak').textContent = `${Dr.streak} in a row`;
    log(true, res.heardLabel);
    $('drillCard').className = 'prompt-card correct';
    $('dStatus').textContent = (firstTry ? '✓ Correct' : '✓ Got it') + (timing ? '' : ` · ${(ms / 1000).toFixed(1)} s`) + (res.heardLabel ? ` · ${timing || Dr.it.grade.type === 'expr' || Dr.it.grade.type === 'improv' ? '' : 'heard '}${pretty(res.heardLabel)}` : '') + rampMsg;
    showAnswer();
    setTimeout(nextItem, Dr.opts.fast ? 500 : 1500);
  }
  function itemWrong(res, fromButton) {
    Dr.attempt = null;
    if (!res || !res.heardLabel) { $('dStatus').textContent = "Didn't catch that. Play again, a bit louder or closer."; return; }
    Dr.tries++; Dr.missed = true; log(false, res.heardLabel);
    $('drillCard').className = 'prompt-card wrong';
    const gt = Dr.it.grade.type;
    let msg = fromButton ? `Not ${res.heardLabel}. Listen again?` : (gt === 'rhythm' || gt === 'expr' || gt === 'improv') ? `✗ ${res.heardLabel}. Try again` : `Heard ${pretty(res.heardLabel)}. Try again`;
    const tg = Dr.it.grade.target, hm = /^[A-G][#b]?-?\d$/.test(res.heardLabel || '') ? C.midiOf(res.heardLabel) : null;
    if (!fromButton && tg && tg.kind === 'note' && hm != null) msg = explain(hm, tg.midi != null ? tg.midi : hm + ((((tg.pcs[0] - hm) % 12) + 18) % 12 - 6), tg.midi != null) + ' Try again.';
    if (!fromButton && res.missing && res.missing.length && Dr.tries >= 2) msg += ` (missing ${res.missing.map((pc) => pretty(D.PC_FLAT[pc])).join(', ')})`;
    $('dStatus').textContent = msg;
    if (Dr.tries >= maxTries()) reveal();
    setTimeout(() => { if (Dr && !Dr.locked) $('drillCard').className = 'prompt-card'; }, 900);
  }
  function showAnswer() {
    Dr.revealed = true; $('dAnswer').innerHTML = pretty(Dr.it.answer) + (landmarkHint() ? `<div class="muted small">${landmarkHint()}</div>` : '');
    if (Dr.it.reveal) $('dStaff').innerHTML = renderSpec(Dr.it.reveal);
    drawKeyboard($('dKbd'), Dr.it.show, []);
  }
  function reveal() {          // after repeated misses: show the answer, count as missed, let them play it once more
    if (!Dr.recorded) { rec(Dr.u.id, Dr.key, false, performance.now() - Dr.shownAt, Dr.u.targetMs); Dr.recorded = true; }
    Dr.hinted = true; showAnswer(); renderSeq();
    $('dStatus').textContent += '. Here is the answer. Play it to continue, or skip.';
  }
  $('dHint').onclick = () => {        // "Show me" toggle: highlights the keys and explains how to find them; costs half credit
    if (!Dr || Dr.locked || !Dr.it) return;
    if (Dr.revealed) { Dr.revealed = false; $('dAnswer').innerHTML = ''; $('dStaff').innerHTML = renderSpec(Dr.it.staff); drawKeyboard($('dKbd'), [], []); $('dHint').textContent = '👁 Show me'; return; }
    if (!Dr.hinted) testLog.push({ unit: Dr.u.id, key: Dr.key, hint: true });
    Dr.hinted = true; showAnswer(); renderSeq(); $('dHint').textContent = '🙈 Hide';
    if (!Dr.missed) $('dStatus').textContent = 'Now play it. With a hint it counts for half credit.';
  };
  const LETTERS = 'CDEFGAB';
  function dia(m) { const n = D.midiName(m), oct = +n.slice(-1); return oct * 7 + LETTERS.indexOf(n[0]); }
  function landmarkHint() {      // "Find middle C, then go 2 white keys up" for single exact notes on a staff
    const it = Dr && Dr.it, tg = it && it.grade && it.grade.target; if (!tg || tg.kind !== 'note' || tg.midi == null || !it.staff) return '';
    const sp = it.staff, bass = sp.clef === 'bass' || (sp.grand && sp.notes && sp.notes[0] && sp.notes[0].staff === 'bass');
    const LM = bass ? [[60, 'middle C'], [53, 'bass F (the line between the clef’s two dots)'], [48, 'low C (2nd space)'], [43, 'G, the bottom line'], [57, 'A, the top line'], [36, 'C two ledger lines below the bass staff']] : [[60, 'middle C'], [67, 'treble G (the line the clef curls around)'], [72, 'high C (3rd space)'], [77, 'F, the top line'], [64, 'E, the bottom line'], [84, 'C two ledger lines above the treble staff']];
    const d = dia(tg.midi); let best = LM[0]; for (const l of LM) if (Math.abs(dia(l[0]) - d) < Math.abs(dia(best[0]) - d)) best = l;
    const k = d - dia(best[0]), name = pretty(D.midiName(tg.midi)), acc = /[#b]/.test(D.midiName(tg.midi)) ? (D.midiName(tg.midi).includes('#') ? ' Then the ♯ means one key right.' : ' Then the ♭ means one key left.') : '';
    if (!k) return `This is ${best[1]}.${acc}`;
    return `Find ${best[1]}, then count ${Math.abs(k)} step${Math.abs(k) > 1 ? 's' : ''} ${k > 0 ? 'up' : 'down'} (${Math.abs(k)} white key${Math.abs(k) > 1 ? 's' : ''} to the ${k > 0 ? 'right' : 'left'}).${acc}`;
  }
  $('dSkip').onclick = () => {
    if (!Dr || Dr.locked || !Dr.it) return;
    if (!Dr.recorded) rec(Dr.u.id, Dr.key, false, performance.now() - Dr.shownAt, Dr.u.targetMs);
    Dr.results.push({ key: Dr.key, ok: false }); Dr.n++; Dr.streak = 0; Dr.locked = true; showAnswer();
    $('dStatus').textContent = 'Skipped. It will come back soon.'; setTimeout(nextItem, 1600);
  };
  $('drillBack').onclick = () => { if (Dr) { clearTimeout(Dr.playTimer); if (Dr.rh) Dr.rh.graded = true; pauseMic(false); } Dr = null; renderMap(); };
  function showSummary() {
    if (Dr.opts.placement != null && PL) return placementSummary();
    const ok = Dr.results.filter((r) => r.ok).length, m = Prog.mastery(Dr.u.id), times = Dr.results.filter((r) => r.ok).map((r) => r.ms);
    const oi = C.ORDER.indexOf(Dr.u.id), next = C.UNITS.find((x) => x.id === C.ORDER[oi + 1]), unlockedNow = next && m >= Prog.PASS && Dr.startMastery < Prog.PASS;
    $('drillProg').style.width = '100%';
    const el = $('summary'); el.hidden = false;
    el.innerHTML = `<div><div class="muted">Session complete</div><div class="big-num">${ok}/${Dr.results.length}</div><div class="muted">first-try correct${times.length ? ` · median ${(times.sort((a, b) => a - b)[times.length >> 1] / 1000).toFixed(1)} s` : ''}</div>
      <p>Unit mastery: <b>${m}%</b> (${m >= Dr.startMastery ? '+' : ''}${m - Dr.startMastery})</p>${unlockedNow ? `<p>🎉 Next unit unlocked: <b>${next.title}</b></p>` : m >= Prog.PASS ? '<p>✓ Mastered</p>' : `<p class="muted small">Reach ${Prog.PASS}% to unlock the next unit.</p>`}
      <div class="row"><button class="ghost" id="sumMap">Map</button><button class="primary" id="sumAgain">Another round</button></div></div>`;
    if (Dr.opts.daily != null) { Sg.markDaily(Prog, Dr.opts.daily); $('sumAgain').textContent = 'Continue today’s practice →'; $('sumAgain').onclick = () => { el.hidden = true; Dr = null; dailyNext(); }; $('sumMap').onclick = () => { el.hidden = true; Dr = null; renderDaily(); }; $('sumMap').textContent = 'Plan'; return; }
    $('sumMap').onclick = () => { el.hidden = true; Dr = null; renderMap(); };
    $('sumAgain').onclick = () => { el.hidden = true; startDrill(Dr.u.id); };
  }

  // ---------------- stats ----------------
  function renderStats() {
    show('stats');
    const d = Prog.raw;
    const overall = d.total ? Math.round(100 * d.correct / d.total) : 0;
    const mastered = C.UNITS.filter((u) => Prog.mastery(u.id) >= Prog.PASS).length;
    $('statCards').innerHTML = `<div><b>🔥 ${Prog.dayStreak()}</b>day streak</div><div><b>${mastered}/${C.UNITS.length}</b>units mastered</div><div><b>${d.total}</b>items practised</div><div><b>${overall}%</b>first-try accuracy</div>`;
    $('statUnits').innerHTML = C.UNITS.map((u) => {
      const s = Prog.stats(u.id);
      return `<div class="srow"><div class="top"><span>${C.ORDER.indexOf(u.id) + 1}. ${u.title}</span><b>${u.selfCheck ? (s.mastery ? 'done' : '–') : s.mastery + '%'}</b></div><div class="bar"><div style="width:${s.mastery}%"></div></div>
        <div class="meta">${u.selfCheck ? 'guidance · self-check' : s.attempts ? `${s.attempts} tries · ${s.acc}% recent accuracy · median ${s.medianMs ? (s.medianMs / 1000).toFixed(1) + ' s' : '–'}${s.weak.length ? ' · practise: ' + s.weak.map(prettyKey).join(', ') : ''}` : Prog.unlocked(u.id, DEBUG) ? 'not started' : 'locked'}</div></div>`;
    }).join('');
  }
  function prettyKey(k) { return pretty(k.replace(/^(scale|ks|int|tri):/, (m, a) => ({ scale: 'scale ', ks: 'key sig ', int: '', tri: '' }[a])).replace(/:maj:(\d)/, (m, i) => ` ${['root', '1st', '2nd'][i]}`).replace(/:min:(\d)/, (m, i) => `m ${['root', '1st', '2nd'][i]}`).replace(':maj', '').replace(':min', 'm').replace(':dom7', '7').replace(':', ' ')); }
  $('btnReset').onclick = () => { if (confirm('Reset all progress? Your mastery, streaks and stats will be erased. Mic setup is kept.')) { Prog.reset(); renderStats(); } };

  // ---------------- free practice (listen + quick quiz) ----------------
  const P = { target: null, prevKey: '', attempt: null, tries: 0, score: 0, streak: 0, showAnswer: false, locked: false };
  function openPractice() {
    show('practice'); frameHandler = practiceFrame;
    $$('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === S.mode));
    const quiz = S.mode !== 'listen';
    $('promptCard').hidden = !quiz; $('quizActions').hidden = !quiz; $('score').textContent = quiz ? `Score ${P.score} · Streak ${P.streak}` : '';
    if (quiz) nextPrompt(); else P.target = null;
  }
  $$('.mode').forEach((b) => (b.onclick = () => { S.mode = b.dataset.mode; save(); openPractice(); }));
  function nextPrompt() {
    for (let k = 0; k < 20; k++) {
      let t;
      if (S.mode === 'notes') {
        let m; do { m = 48 + Math.floor(Math.random() * 25); } while (!S.accidentals && [1, 3, 6, 8, 10].includes(m % 12));
        const pc = m % 12, nm = [1, 3, 6, 8, 10].includes(pc) && Math.random() < 0.5 ? D.PC_FLAT[pc] : D.PC_SHARP[pc];
        t = { kind: 'note', midi: m, pcs: [pc], key: 'n' + (S.strictOctave ? m : pc), label: pretty(nm) + (S.strictOctave ? Math.floor(m / 12) - 1 : ''), sub: S.strictOctave ? 'exact octave' : 'any octave', show: [m] };
      } else {
        const types = S.chordTypes.length ? S.chordTypes : ['maj'], ty = types[Math.floor(Math.random() * types.length)], r = Math.floor(Math.random() * 12);
        const rn = ['min', 'dim', 'min7'].includes(ty) ? D.PC_SHARP[r] : D.PC_FLAT[r], names = C.placeChord(rn, ty in { maj: 1, min: 1, dim: 1, aug: 1, dom7: 1, maj7: 1, min7: 1 } ? ty : 'maj');
        t = { kind: 'chord', root: r, pcs: D.CHORD_TYPES[ty].iv.map((i) => (r + i) % 12), key: 'c' + r + ty, label: pretty(rn) + pretty(D.CHORD_TYPES[ty].suffix), sub: `${pretty(rn)} ${D.CHORD_TYPES[ty].name}`, show: names.map(C.midiOf), tones: names.map((n) => pretty(n.replace(/\d/, ''))).join(' – ') };
      }
      if (t.key !== P.prevKey) { P.target = t; break; }
    }
    P.prevKey = P.target.key; P.attempt = null; P.tries = 0; P.showAnswer = false; P.locked = false;
    $('promptLabel').textContent = P.target.kind === 'note' ? 'Play this note' : 'Play this chord (any inversion)';
    $('prompt').textContent = P.target.label; $('promptSub').textContent = P.target.sub; $('promptCard').className = 'prompt-card'; $('status').textContent = 'Listening…';
  }
  $('btnHint').onclick = () => { P.showAnswer = true; if (P.target && P.target.tones) $('promptSub').textContent = P.target.tones; };
  $('btnSkip').onclick = () => { P.streak = 0; nextPrompt(); };
  function practiceFrame(f) {
    const hs = heardSummary(f);
    $('hearMain').textContent = hs.main; $('hearNotes').textContent = hs.sub;
    const shown = hs.midis.slice(0, 6).map((m) => ({ name: D.midiName(m).replace('C#', 'C#').replace(/^(Eb|Ab|Bb)/, '$1') }));
    $('hearStaff').innerHTML = shown.length ? Staff.render({ clef: hs.midis[0] < 57 ? 'bass' : 'treble', notes: shown, mode: 'chord', width: 200 }) : '';
    const nd = $('tunerNeedle');
    if (lastYin) { const m = D.freqToMidi(lastYin.freq, S.a4), c = (m - Math.round(m)) * 100; nd.style.left = 50 + c + '%'; $('tuner').style.opacity = 1; } else $('tuner').style.opacity = 0.35;
    drawKeyboard($('kbd'), P.target && P.showAnswer ? P.target.show : [], hs.midis);
    if (DEBUG) $('debugInfo').textContent = `level ${f.level.toFixed(4)} gate ${gate().toFixed(4)} sr ${ctx && ctx.sampleRate}\nnotes ${f.notes.map((n) => D.midiName(n.midi) + ':' + n.salience.toFixed(2)).join(' ')}\nmono ${f.mono} events ${f.events}`;
    if (!P.target || P.locked) return;
    const now = f.now;
    if (f.onset && (!P.attempt || now - P.attempt.since > 700)) { const before = win.chroma(now - 400), ignore = []; before.w.forEach((x, pc) => { if (x > 0.5 && !P.target.pcs.includes(pc)) ignore.push(pc); }); P.attempt = { since: now - TICK_MS, ignore }; }
    if (!P.attempt) return;
    const el = now - P.attempt.since; if (el < 250) return;
    const g = D.gradeWindow(win, P.target, P.attempt.since, { ...strictOpts(), elapsedMs: el, ignore: P.attempt.ignore, strictOctave: S.strictOctave });
    if (g.ok) { P.locked = true; P.score++; P.streak++; P.showAnswer = true; $('promptCard').className = 'prompt-card correct'; $('status').textContent = '✓ Correct'; $('score').textContent = `Score ${P.score} · Streak ${P.streak}`; setTimeout(nextPrompt, 1300); }
    else if (el > 1600 || (el > 600 && now - lastLoudT > 120)) { P.attempt = null; if (g.heardLabel) { P.streak = 0; $('status').textContent = `Heard ${pretty(g.heardLabel)}. Try again`; } }
  }

  // ---------------- calibration ----------------
  function startCalibration(done = renderMap) {
    show('calib'); let step = 0, collecting = false, samples = [], calSince = null;
    const body = $('calibBody'), next = $('calibNext'), skip = $('calibSkip');
    const finish = () => { S.calibrated = true; save(); done(); };
    const steps = [
      () => { $('calibStepLbl').textContent = '1 / 3'; body.innerHTML = '<p><b>Noise check.</b> Keep the room quiet (don\'t play) and tap <b>Start</b>. It takes 2 seconds.</p>'; next.textContent = 'Start'; },
      () => { $('calibStepLbl').textContent = '2 / 3'; body.innerHTML = '<p><b>Tuning.</b> Play and hold any <b>A</b>, for example the A above middle C. This catches a digital piano set to 442 Hz or transposed.</p><p id="calibRes" class="muted">Waiting for an A…</p>'; next.textContent = 'Use 440 Hz'; collecting = true; samples = []; },
      () => { $('calibStepLbl').textContent = '3 / 3'; body.innerHTML = '<p><b>Check.</b> Play a <b>C major</b> chord (C – E – G) in any octave.</p><p id="calibRes" class="muted">Listening…</p>'; next.textContent = 'Continue'; collecting = true; calSince = null; },
    ];
    steps[0]();
    frameHandler = (f) => {
      $('calibMeter').style.width = toPct(levelSmooth) + '%'; $('calibGate').style.left = toPct(gate()) + '%';
      const res = document.getElementById('calibRes');
      if (step === 1 && collecting && lastYin && f.level > gate()) {
        const m = D.freqToMidi(lastYin.freq, 440), mr = Math.round(m);
        if (((mr % 12) + 12) % 12 === 9 && lastYin.clarity > 0.9) samples.push((m - mr) * 100);
        if (samples.length >= 10) {
          samples.sort((a, b) => a - b); const c = samples[samples.length >> 1];
          S.a4 = +(440 * Math.pow(2, c / 1200)).toFixed(1); save(); collecting = false;
          res.textContent = `Your piano: A4 = ${S.a4} Hz (${c >= 0 ? '+' : ''}${c.toFixed(0)} cents) ✓`; next.textContent = 'Next';
        } else if (res) res.textContent = `Hearing ${pretty(D.midiName(mr))}… ${samples.length ? 'hold it' : '(play an A)'}`;
      }
      if (step === 2 && collecting) {
        if (f.onset) calSince = f.now - TICK_MS;
        if (calSince != null && f.now - calSince > 250) {
          const g = D.gradeWindow(win, { kind: 'chord', pcs: [0, 4, 7], root: 0 }, calSince, { ...strictOpts(), elapsedMs: f.now - calSince });
          if (g.ok) { res.textContent = '✓ Heard C major. You\'re all set!'; collecting = false; S.calibrated = true; save(); }
          else if (g.heardLabel) res.textContent = `Heard ${pretty(g.heardLabel)}… (if this keeps failing, raise Sensitivity in Settings)`;
        }
      }
    };
    next.onclick = () => {
      if (step === 0) {
        next.disabled = true; body.innerHTML = '<p>Measuring room noise… stay quiet.</p>';
        const rmsS = [], specs = [];
        const grab = setInterval(() => { analyser.getFloatTimeDomainData(polyBuf); rmsS.push(D.rms(polyBuf, POLY_N - 2048, POLY_N)); if (rmsS.length % 4 === 0) specs.push(D.magnitudeSpectrum(polyBuf)); }, 50);
        setTimeout(() => {
          clearInterval(grab); next.disabled = false;
          rmsS.sort((a, b) => a - b); S.noiseRms = Math.max(0.0003, rmsS[Math.floor(rmsS.length * 0.8)] || 0.002);
          const avg = new Float32Array(POLY_N / 2); specs.forEach((sp) => sp.forEach((v, i) => (avg[i] += v / specs.length)));
          noiseSpec = avg; localStorage.setItem('pt.noiseSpec', JSON.stringify(Array.from(avg, (v) => Math.round(20 * Math.log10(v + 1e-9)))));
          save(); step = 1; steps[1]();
        }, 2000);
      } else if (step === 1) { step = 2; steps[2](); } else finish();
    };
    skip.onclick = () => { if (step < 2) { step++; steps[step](); } else finish(); };
  }

  // =====================================================================================
  // v4: songs & pieces, daily practice, placement test, metronome
  // =====================================================================================
  const Sg = window.Songs;
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const TEMPI = [[0.6, '🐢 Slow'], [0.8, 'Medium'], [1, 'Full']];
  let SG = null, DY = null, PL = null;
  // ---- song library ----
  function renderSongs() {
    show('songs'); const el = $('songList'); el.innerHTML = '';
    for (const lvl of C.LEVELS) {
      const ss = Sg.SONGS.filter((s) => s.level === lvl); if (!ss.length) continue;
      el.insertAdjacentHTML('beforeend', `<li class="level-h"><span>${lvl}</span><span class="muted small">${ss.filter((s) => Sg.stars(Prog, s) >= 1).length}/${ss.length} learned</span></li>`);
      for (const s of ss) {
        const open = Sg.unlocked(Prog, s, DEBUG), st = Sg.stars(Prog, s), after = unitOf(s.after);
        const li = document.createElement('li'); li.className = 'unit song' + (open ? '' : ' locked'); li.dataset.song = s.id;
        li.innerHTML = `<div class="num">${open ? '🎵' : '🔒'}</div><div class="grow"><div class="ttl">${s.title}</div><div class="lvl">${s.by} · ${s.hands} · ${s.phrases.length} lines${open ? '' : ` · opens with “${after.title}”`}</div></div><div class="pct stars">${stars(st)}</div>`;
        if (open) li.onclick = () => requireMic(() => openSong(s.id, null));
        el.appendChild(li);
      }
    }
  }
  // ---- song player ----
  function songLines(p) {      // split into lines of whole bars (about 12 notes per line) so every note stays readable
    const lines = []; let cur = null;
    for (let b = 0; b < p.bars; b++) {
      const rh = p.rh.filter((e) => e.bar === b), n = rh.length;
      if (!cur || cur.n + n > 12) { cur = { bars: [], n: 0 }; lines.push(cur); }
      cur.bars.push(b); cur.n += n;
    }
    return lines.map((L) => {
      const pick = (els) => (els || []).map((e, gi) => ({ ...e, gi })).filter((e) => L.bars.includes(e.bar));
      const rh = pick(p.rh), lh = p.lh ? pick(p.lh) : null, start = rh[0].pos, end = rh[rh.length - 1].pos + rh[rh.length - 1].dur;
      const shift = (els) => els.map((e) => ({ ...e, pos: e.pos - start }));
      return { rh: shift(rh), lh: lh ? shift(lh) : null, start, end };
    });
  }
  function songStaff(p, extra = {}) {
    const ts = p.ts, out = [];
    for (const L of songLines(p)) {
      const ph = extra.playhead != null && extra.playhead >= L.start && extra.playhead < L.end ? extra.playhead - L.start : null;
      const col = (els, cmap) => { const c = {}; els.forEach((e, i) => { if (cmap && cmap[e.gi]) c[i] = cmap[e.gi]; }); return c; };
      const w = Math.max(330, 90 + L.rh.length * 30);
      if (p.chords) {
        const syms = [...new Set(L.rh.map((e) => e.bar))].map((b) => L.rh.find((e) => e.bar === b).chord);
        out.push(`<div class="sg-chords">${syms.map((s) => `<span>${pretty(s)}</span>`).join('')}</div>` + Staff.renderMeasure({ els: L.rh.map((e) => ({ ...e, name: undefined })), timeSig: ts, clef: 'perc', width: w, playhead: ph, colors: col(L.rh, extra.colors) }));
        continue;
      }
      const grid = L.lh ? [...new Set(L.rh.concat(L.lh).map((e) => Math.round(e.pos * 1000) / 1000).concat([L.end - L.start]))].sort((a, b) => a - b) : null;
      let s = Staff.renderMeasure({ els: L.rh, timeSig: ts, clef: 'treble', keySig: p.keySig, width: w, grid, playhead: ph, colors: col(L.rh, extra.colors) });
      if (L.lh) s += Staff.renderMeasure({ els: L.lh, timeSig: ts, clef: 'bass', keySig: p.keySig, width: w, grid, playhead: ph, colors: col(L.lh, extra.lhColors) });
      out.push(`<div class="${L.lh ? 'sg-grand' : ''}">${s}</div>`);
    }
    return out.join('');
  }
  function openSong(id, i) {
    const song = Sg.SONGS.find((s) => s.id === id);
    if (i == null) { const lv = song.phrases.map((_, k) => Sg.levelOf(Prog, id, k)); i = lv.findIndex((x) => x < 3); if (i < 0) i = 'all'; }
    if (SG && SG.timer) clearTimeout(SG.timer);
    SG = { song, i, p: Sg.phrase(song, i), mode: 'idle', tempo: SG && SG.song.id === id ? SG.tempo : 0, step: 0, show: song.level === 'Beginner', heard: null };
    SG.steps = Sg.learnSteps(SG.p);
    show('song'); frameHandler = songFrame; if (micStream && micPaused) pauseMic(false);
    $('sgTitle').textContent = song.title; $('sgBy').textContent = `${song.by} · ${song.level}`;
    renderSong(); setSongStatus(song.level === 'Beginner' && i === 0 && !Sg.levelOf(Prog, id, 0) ? 'Tap 🔊 Listen first, then 🎯 Learn the notes.' : '');
  }
  function songRange() { const ms = SG.p.onsets.flatMap((o) => o.midis); let lo = Math.min(...ms) - 2, hi = Math.max(...ms) + 2; lo -= ((lo % 12) + 12) % 12; hi += 11 - (((hi % 12) + 12) % 12); if (hi - lo < 23) hi = lo + 23; return [Math.max(21, lo), Math.min(108, hi)]; }
  function songKbd(heard = []) { const st = SG.steps[SG.step], tg = SG.mode === 'learn' && st && SG.show ? st.midis : SG.showAll ? [...new Set(SG.p.onsets.flatMap((o) => o.midis))] : []; drawKeyboard($('sgKbd'), tg, heard, ...songRange()); }
  function renderSong(extra = {}) {
    const { song, i, p } = SG, n = song.phrases.length;
    $('sgStars').textContent = stars(Sg.stars(Prog, song));
    const lvAll = song.phrases.map((_, k) => Sg.levelOf(Prog, song.id, k));
    $('sgTabs').innerHTML = song.phrases.map((_, k) => `<button class="${k === i ? 'on' : ''}" data-k="${k}">Line ${k + 1}<i>${lvAll[k] ? '★'.repeat(lvAll[k]) : '·'}</i></button>`).join('') + `<button class="${i === 'all' ? 'on' : ''} ${Math.min(...lvAll) ? '' : 'dim'}" data-k="all">Whole piece<i>${Sg.levelOf(Prog, song.id, 'all') >= 3 ? '🏆' : Sg.levelOf(Prog, song.id, 'all') ? '★' : '·'}</i></button>`;
    $$('#sgTabs button').forEach((b) => (b.onclick = () => { if (SG.mode === 'time' || SG.mode === 'demo') return; openSong(song.id, b.dataset.k === 'all' ? 'all' : +b.dataset.k); }));
    const bpm = Math.round(song.bpm * TEMPI[SG.tempo][0]);
    $('sgMeta').textContent = `${i === 'all' ? 'Whole piece' : `Line ${i + 1} of ${n}`} · ${song.ts[0]}/${song.ts[1]} · ${song.hands}`;
    $('sgTempo').innerHTML = TEMPI.map((t, k) => `<button class="${k === SG.tempo ? 'on' : ''}" data-t="${k}">${t[1]}${k === SG.tempo ? ` ♩=${bpm}` : ''}</button>`).join('');
    $$('#sgTempo button').forEach((b) => (b.onclick = () => { if (SG.mode === 'time' || SG.mode === 'demo') return; SG.tempo = +b.dataset.t; renderSong(); }));
    $('sgStaff').innerHTML = songStaff(p, extra);
    renderSongNotes();
    $('sgTip').innerHTML = '💡 ' + song.tip;
    $('sgShow').textContent = SG.show ? '🙈 Hide keys' : '👁 Show keys';
    const last = i === 'all' || i === n - 1, dyHere = DY && DY.seg.kind === 'song' && DY.seg.song === song.id;
    $('sgNext').textContent = dyHere && DY.done ? 'Continue today’s practice →' : last ? (i === 'all' ? 'All songs' : 'Whole piece →') : 'Next line →';
    ['sgListen', 'sgLearn', 'sgTime'].forEach((b) => ($(b).disabled = SG.mode === 'time' || SG.mode === 'demo'));
    $('sgLearn').className = SG.mode === 'learn' ? 'primary on' : (Sg.levelOf(Prog, song.id, i) ? 'ghost' : 'primary');
    $('sgTime').className = Sg.levelOf(Prog, song.id, i) ? 'primary' : 'ghost';
    $('sgBeats').innerHTML = '';
    songKbd();
  }
  function renderSongNotes() {
    const { steps } = SG, learn = SG.mode === 'learn', fing = SG.p.fingers ? SG.p.fingers.split(' ') : null;
    $('sgNotes').classList.toggle('leadsheet', SG.p.chords);
    $('sgNotes').innerHTML = steps.map((st, k) => { const lbl = st.chord ? pretty(st.chord) : st.names.filter((nm2) => C.midiOf(nm2) >= 60 || st.names.every((x) => C.midiOf(x) < 60)).map((x) => pretty(x.replace(/-?\d$/, ''))).join('+') || pretty(st.names[0].replace(/-?\d$/, ''));
      const showIt = SG.show || st.chord || (learn && k < SG.step);
      return `<span class="${learn && k < SG.step ? 'done' : learn && k === SG.step ? 'cur' : ''}">${showIt ? lbl : '•'}${fing && fing[k] ? `<sub>${fing[k]}</sub>` : ''}</span>`; }).join('');
  }
  function setSongStatus(msg, cls) { $('sgStatus').textContent = msg; $('sgStatus').className = 'try-status' + (cls ? ' ' + cls : ''); }
  $('sgShow').onclick = () => { if (!SG) return; SG.show = !SG.show; renderSongNotes(); songKbd(); $('sgShow').textContent = SG.show ? '🙈 Hide keys' : '👁 Show keys'; };
  $('sgBack').onclick = () => { if (SG) { clearTimeout(SG.timer); SG.mode = 'idle'; if (micStream && micPaused) pauseMic(false); } SG = null; back(); };
  $('sgNext').onclick = () => {
    if (!SG) return; const { song, i } = SG, n = song.phrases.length;
    if (DY && DY.seg.kind === 'song' && DY.seg.song === song.id && DY.done) return dailyNext();
    if (i === 'all') return renderSongs();
    openSong(song.id, i === n - 1 ? 'all' : i + 1);
  };
  $('sgListen').onclick = () => songDemo();
  $('sgLearn').onclick = () => { if (!SG) return; if (!micReady()) return requireMic(() => openSong(SG.song.id, SG.i)); SG.mode = 'learn'; SG.step = 0; SG.missed = 0; SG.att = null; SG.advT = performance.now(); SG.repT = 0; renderSong(); setSongStatus(SG.p.chords ? `Play ${pretty(SG.steps[0].chord)} (left hand root, right hand chord). Take your time.` : 'Play the notes in order. Take your time, there is no clock. 👂'); };
  $('sgTime').onclick = () => { if (!SG) return; if (!micReady()) return requireMic(() => openSong(SG.song.id, SG.i)); startSongTime(); };
  function songDemo() {
    if (!SG || SG.mode === 'time' || SG.mode === 'demo') return;
    ensureContext(); ctx.resume(); startLoop();
    const q = 60 / (SG.song.bpm * TEMPI[SG.tempo][0]), t0 = ctx.currentTime + 0.15;
    SG.p.onsets.forEach((o) => o.midis.forEach((m) => pianoTone(m, t0 + o.pos * q, Math.max(0.25, Math.min(2.5, o.dur * q * 0.95)), false, m < 60 ? 0.7 : 1)));
    const len = SG.p.total * q + 0.6, wasPaused = micPaused; if (micStream) pauseMic(true);
    SG.mode = 'demo'; renderSong(); setSongStatus('🔊 Listen… (mic paused)');
    const start = performance.now() + 150;
    const anim = () => { if (!SG || SG.mode !== 'demo') return; const pos = (performance.now() - start) / (q * 1000); $('sgStaff').innerHTML = songStaff(SG.p, { playhead: Math.max(0, Math.min(pos, SG.p.total - 0.01)) }); if (pos < SG.p.total) requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
    clearTimeout(SG.timer); SG.timer = setTimeout(() => { if (!SG) return; SG.mode = 'idle'; if (micStream && !wasPaused) pauseMic(false); renderSong(); setSongStatus('Now you: 🎯 Learn the notes, or ⏱ Play in time.'); }, len * 1000 + 300);
    testLog.push({ song: SG.song.id, phrase: SG.i, demo: true });
  }
  function songPass(lvl, msg) {
    const { song, i } = SG, up = Sg.setLevel(Prog, song.id, i, lvl);
    SG.mode = 'idle'; testLog.push({ song: song.id, phrase: i, mode: lvl === 1 ? 'learn' : 'time', ok: true, heard: msg, level: lvl });
    if (DY && DY.seg.kind === 'song' && DY.seg.song === song.id) { Sg.markDaily(Prog, DY.idx); DY.done = true; }
    const next = lvl === 1 ? ' Next: ⏱ Play in time.' : lvl === 2 ? ' Next: try a faster tempo.' : i === 'all' ? ' 🏆 You can play the whole piece!' : ' Line mastered! ★★★';
    renderSong(); setSongStatus(msg + (up || lvl < 3 ? next : ''), 'ok');
  }
  function songFrame(f) {
    if (!SG) return; const hs = heardSummary(f);
    if (SG.mode !== 'time') $('sgHear').textContent = micPaused ? '' : hs.main !== '—' ? 'I hear: ' + hs.main : '';
    if (SG.mode === 'time') return songTimeFrame(f);
    if (SG.mode !== 'learn' || micPaused) { if (SG.mode === 'idle') songKbd(hs.midis); return; }
    const st = SG.steps[SG.step]; if (!st) return;
    songKbd(hs.midis);
    if (st.chord) {   // chord pieces: hold each chord until it is recognised
      const tg = C.symTarget(st.chord).target, now = f.now;
      if (f.onset && (!SG.att || now - SG.att.since > 1800)) SG.att = { since: now - TICK_MS };
      if (!SG.att) return; const el = now - SG.att.since; if (el < 300) return;
      const res = D.gradeWindow(win, tg, SG.att.since, { ...strictOpts(), elapsedMs: el });
      if (res.ok) { SG.step++; SG.att = null; renderSongNotes(); if (SG.step >= SG.steps.length) return songPass(1, '✓ All the chords!'); setSongStatus(`✓ ${pretty(st.chord)}. Now ${pretty(SG.steps[SG.step].chord)}`, 'ok'); return; }
      if (el > 1700) { SG.att = null; if (res.heardLabel) { SG.missed++; setSongStatus(`I heard ${pretty(res.heardLabel)}.${res.missing && res.missing.length ? ` Missing: ${res.missing.map((pc) => pretty(D.PC_FLAT[pc])).join(', ')}.` : ''} Play ${pretty(st.chord)} again.`, 'bad'); testLog.push({ song: SG.song.id, phrase: SG.i, ok: false, heard: res.heardLabel }); } }
      return;
    }
    const lowAll = Math.min(...SG.p.onsets.flatMap((o) => o.midis)), same = (a, b) => a && b && a.pcs.length === b.pcs.length && a.pcs.every((x) => b.pcs.includes(x));
    {   // repeated notes: a re-strike of the same key shows up as a new onset, not as a new pitch
      const cur = SG.steps[SG.step], prev = SG.steps[SG.step - 1];
      if (cur && same(cur, prev)) for (const o of onsetLog) {
        if (o.t <= Math.max(SG.advT || 0, SG.repT || 0) + 120 || o.t > f.now - 300) continue;
        SG.repT = o.t; const pc = pcAround(o.t);
        if (pc != null && cur.pcs.includes(pc)) { SG.step++; SG.advT = o.t; renderSongNotes(); if (SG.step >= SG.steps.length) return songPass(1, SG.missed ? '✓ Got it!' : '✓ Every note right!'); setSongStatus(`✓ ${pretty(D.PC_FLAT[pc])}`, 'ok'); break; }
      }
    }
    for (const m of f.events) {
      if (m <= lowAll - 12) continue;                         // subharmonic glitch
      const cur = SG.steps[SG.step]; if (!cur) return;
      const pc = ((m % 12) + 12) % 12;
      if (cur.pcs.includes(pc)) {
        if (same(cur, SG.steps[SG.step - 1]) && f.now - 150 < (SG.advT || 0) + 120) continue;   // already counted by its onset
        SG.step++; SG.advT = f.now - 150; renderSongNotes();
        if (SG.step >= SG.steps.length) return songPass(1, SG.missed ? '✓ Got it!' : '✓ Every note right!');
        setSongStatus(`✓ ${pretty(D.PC_FLAT[pc])}`, 'ok'); continue;
      }
      const prev = SG.steps[SG.step - 1];
      if (prev && same(cur, prev)) {                           // repeated notes (C C C C): a quick re-strike can blend; learn mode lets you move on
        let j = SG.step; while (j < SG.steps.length && same(SG.steps[j], prev)) j++;
        if (SG.steps[j] && SG.steps[j].pcs.includes(pc)) { SG.step = j + 1; renderSongNotes(); if (SG.step >= SG.steps.length) return songPass(1, '✓ Got it!'); setSongStatus(`✓ ${pretty(D.PC_FLAT[pc])}`, 'ok'); continue; }
      }
      if (prev && prev.pcs.includes(pc)) continue;             // the same note heard again
      const held = (SG.p.lh || []).filter((e) => !e.rest && e.pos <= cur.pos + 1e-6 && e.pos + e.dur > cur.pos).flatMap((e) => e.names.map(C.pcOf));
      if (held.includes(pc)) continue;                         // left hand still sounding
      SG.missed++;
      const want = cur.midis.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
      setSongStatus(`Note ${SG.step + 1}: ` + explain(m, want, false) + ' Try that note again.', 'bad');
      testLog.push({ song: SG.song.id, phrase: SG.i, ok: false, heard: D.midiName(m) });
    }
  }
  function startSongTime(anchor) {
    if (!SG || SG.mode === 'time' || SG.mode === 'demo') return;
    const p = SG.p, bpm = SG.song.bpm * TEMPI[SG.tempo][0], msPerQ = 60000 / bpm, cu = p.ts[1] === 8 ? 0.5 : 1, clickMs = msPerQ * cu, n = p.ts[0] < 3 ? p.ts[0] * 2 : p.ts[0];
    let t0;
    if (anchor != null) t0 = anchor;
    else { ensureContext(); ctx.resume(); const lead = 0.15, base = ctx.currentTime + lead; for (let k = 0; k < n; k++) clickAt(base + k * clickMs / 1000, k % p.ts[0] === 0); t0 = performance.now() + lead * 1000 + n * clickMs; }
    SG.mode = 'time'; SG.rt = { t0, msPerQ, clickMs, n, end: t0 + p.total * msPerQ + 500, bpm: Math.round(bpm) };
    renderSong(); $('sgBeats').innerHTML = Array.from({ length: Math.min(n, 6) }, (_, k) => `<i data-k="${k}"></i>`).join('');
    const anim = () => { if (!SG || SG.mode !== 'time') return; const r = SG.rt, now = performance.now();
      if (now < r.t0) { const b = Math.floor((now - (r.t0 - r.n * r.clickMs)) / r.clickMs); $$('#sgBeats i').forEach((el, k) => el.classList.toggle('on', b % Math.min(r.n, 6) === k)); setSongStatus(`Count-in: ${Math.min(r.n, b + 1)}`); }
      else { $('sgBeats').innerHTML = ''; setSongStatus('Play! 🎵'); $('sgStaff').innerHTML = songStaff(SG.p, { playhead: Math.min((now - r.t0) / r.msPerQ, SG.p.total - 0.01) }); }
      requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
  }
  function songTimeFrame(f) {
    const r = SG.rt; if (!r || f.now <= r.end) return;
    const p = SG.p, exp = p.onsets.map((o) => ({ t: r.t0 + o.pos * r.msPerQ, pc: o.pcs, chord: !!o.chord }));
    const gaps = p.onsets.slice(1).map((o, k) => (o.pos - p.onsets[k].pos) * r.msPerQ), minGap = gaps.length ? Math.min(...gaps) : 600;
    const tol = Math.max(80, Math.min(150, minGap * 0.45));
    const det = onsetLog.filter((o) => o.t >= r.t0 - 400 && o.t <= r.end).map((o) => ({ t: o.t, pc: pcAround(o.t), pcs: pcsAround(o.t) }));
    const res = D.gradeRhythm(exp, det, { tol, maxComp: 180, tailMs: Math.min(r.msPerQ * 0.6, 400), allowExtra: p.chords ? 1e9 : Math.max(1, Math.round(exp.length / 8)) });
    const colors = {}, lhColors = {}, byPos = (pos, els, c, col) => els.forEach((e, gi) => { if (!e.rest && Math.abs(e.pos - pos) < 1e-6) c[gi] = col; });
    res.hits.forEach((h) => { const pos = p.onsets[h.i].pos, col = h.pcOk ? '#3ecf8e' : '#ff6b6b'; byPos(pos, p.rh, colors, col); if (p.lh) byPos(pos, p.lh, lhColors, col); });
    res.misses.forEach((i) => { const pos = p.onsets[i].pos; byPos(pos, p.rh, colors, '#ff6b6b'); if (p.lh) byPos(pos, p.lh, lhColors, '#ff6b6b'); });
    const good = res.hits.filter((h) => h.pcOk).length, label = `${good}/${exp.length} notes on time${res.meanAbs != null ? `, ±${res.meanAbs} ms` : ''}`;
    SG.mode = 'idle';
    if (res.ok) { songPass(SG.tempo === 2 ? 3 : 2, `✓ In time at ♩ = ${r.bpm}! ${label}.`); $('sgStaff').innerHTML = songStaff(p, { colors, lhColors }); return; }
    renderSong({ colors, lhColors });
    const first = res.misses.length ? Math.min(...res.misses) + 1 : null, wrongPc = res.hits.find((h) => !h.pcOk);
    const msg = !det.length ? 'I didn’t hear any notes. Start right after the count-in.' : `${label}.` + (wrongPc ? ` Note ${wrongPc.i + 1} was the wrong note.` : first ? ` Note ${first} was early, late or missing.` : '') + (res.extras.length > 1 ? ' Some extra notes too.' : '') + (SG.tempo ? ' Try 🐢 Slow first.' : ' Tap ⏱ to try again.');
    setSongStatus(msg, 'bad'); testLog.push({ song: SG.song.id, phrase: SG.i, mode: 'time', ok: false, heard: label });
  }

  // ---- daily practice ----
  function goalStreak() { const set = new Set(Prog.raw.goalDays || []); let n = 0; const d = new Date(); if (!set.has(Prog.today())) d.setDate(d.getDate() - 1); while (set.has(d.toLocaleDateString('en-CA'))) { n++; d.setDate(d.getDate() - 1); } return n; }
  function renderDaily(rebuild) {
    DY = null; show('daily'); const d = Sg.today(Prog, rebuild);
    const left = d.plan.filter((_, k) => !d.done.includes(k)).reduce((a, s) => a + s.min, 0);
    $('dyMin').textContent = d.done.length >= d.plan.length ? 'All done for today 🎉' : `About ${left} minutes left`;
    $('dyGoal').textContent = `🎯 ${goalStreak()}`; $('dyGoal').title = 'Days in a row you finished the plan';
    const ICON = { drill: '🎯', lesson: '📘', song: '🎵' };
    $('dyList').innerHTML = d.plan.map((s, k) => `<li class="${d.done.includes(k) ? 'done' : ''}" data-k="${k}"><span class="dy-i">${d.done.includes(k) ? '✓' : ICON[s.kind]}</span><div class="grow"><div class="ttl">${s.label}</div><div class="muted small">${s.kind === 'drill' ? (s.items ? `${s.items.length} items picked for you` : `${s.len} questions`) : s.kind === 'lesson' ? 'step-by-step lesson' : 'learn it, then play it in time'} · ~${s.min} min</div></div><span class="muted">›</span></li>`).join('');
    $$('#dyList li').forEach((li) => (li.onclick = () => runDaily(+li.dataset.k)));
    const nxt = d.plan.findIndex((_, k) => !d.done.includes(k));
    $('dyGo').textContent = nxt < 0 ? 'Back to the map' : d.done.length ? 'Continue ▶' : 'Start ▶';
    $('dyGo').onclick = () => (nxt < 0 ? renderMap() : runDaily(nxt));
  }
  $('dyRebuild').onclick = () => renderDaily(true);
  function runDaily(k) {
    const d = Sg.today(Prog), seg = d.plan[k]; if (!seg) return renderDaily();
    DY = { idx: k, seg, done: false };
    if (seg.kind === 'lesson') return openLesson(seg.unit, 0);
    if (seg.kind === 'song') return requireMic(() => openSong(seg.song, seg.phrase));
    const u = unitOf(seg.unit), go = () => startDrill(seg.unit, { items: seg.items && seg.items.length ? [...seg.items] : null, sessionLen: seg.items && seg.items.length ? seg.items.length : seg.len, daily: k });
    if (u.ear) { ensureContext(); ctx.resume(); startLoop(); return go(); }
    requireMic(go);
  }
  function dailyNext() { const d = Sg.today(Prog), k = d.plan.findIndex((_, j) => !d.done.includes(j)); DY = null; if (k < 0) return renderDaily(); runDaily(k); }
  $('btnDaily').onclick = () => renderDaily();
  $('btnSongs').onclick = () => renderSongs();

  // ---- placement test ----
  function openPlacement() {
    PL = null; show('place'); $('plIntro').hidden = false; $('plResult').hidden = true;
    $('plSteps').innerHTML = Sg.PLACEMENT.map((c) => `<li>${c.label}</li>`).join('');
  }
  $('plGo').onclick = () => requireMic(() => { PL = { k: 0, passed: [] }; runCheckpoint(); });
  function runCheckpoint() {
    const cp = Sg.PLACEMENT[PL.k], u = unitOf(cp.unit);
    const go = () => startDrill(cp.unit, { items: [...cp.items], sessionLen: cp.items.length, placement: PL.k, noRecord: true, maxTries: 2 });
    if (u.ear) { ensureContext(); ctx.resume(); startLoop(); }
    go(); $('drillUnit').textContent = `Find my level · check ${PL.k + 1} of ${Sg.PLACEMENT.length}: ${cp.label}`;
  }
  function placementSummary() {
    const ok = Dr.results.filter((r) => r.ok).length, cp = Sg.PLACEMENT[PL.k], pass = ok >= 2, el = $('summary');
    testLog.push({ placement: PL.k, ok: pass, score: ok });
    if (pass) PL.passed.push(PL.k);
    const more = pass && PL.k + 1 < Sg.PLACEMENT.length;
    el.hidden = false;
    el.innerHTML = `<div><div class="muted">Check ${PL.k + 1}: ${cp.label}</div><div class="big-num">${ok}/${Dr.results.length}</div><p>${pass ? '✓ Passed' : 'This one is new for you, and that’s fine.'}</p>${more ? `<p class="muted small">Next: ${Sg.PLACEMENT[PL.k + 1].label}</p>` : ''}
      <div class="row">${more ? '<button class="ghost" id="plStop">Stop here</button><button class="primary" id="plNext">Next check →</button>' : '<button class="primary" id="plSee">See my level →</button>'}</div></div>`;
    const finish = (k) => { el.hidden = true; Dr = null; placementResult(k); };
    if (more) { $('plNext').onclick = () => { el.hidden = true; PL.k++; runCheckpoint(); }; $('plStop').onclick = () => finish(PL.k + 1); }
    else $('plSee').onclick = () => finish(pass ? PL.k + 1 : PL.k);
  }
  function placementResult(k) {
    const idx = Sg.placementStart(k), u = unitOf(C.ORDER[idx]); PL.result = idx;
    show('place'); $('plIntro').hidden = true; $('plResult').hidden = false;
    $('plResH').textContent = k === 0 ? 'Start at the beginning' : `Start at unit ${idx + 1}: ${u.title}`;
    $('plResP').innerHTML = (k === 0 ? 'The first lessons will get you going fast. They are short, and every step is checked by the mic.' : `You passed: ${Sg.PLACEMENT.slice(0, k).map((c) => c.label.toLowerCase()).join(', ')}.`) + ' Units before your level stay open, so you can practise or review them any time.';
    $('plApply').onclick = () => { if (k > 0) Prog.place(idx); localStorage.setItem('pt.onboarded', '1'); testLog.push({ placedUpTo: idx }); renderMap(); const cur = document.querySelector('.unit.current'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' }); };
    $('plRetry').onclick = openPlacement;
  }
  $('btnPlace').onclick = openPlacement;
  $('obPlace').onclick = () => { localStorage.setItem('pt.onboarded', '1'); obStep(1); pendingPlacement = true; };
  let pendingPlacement = false;

  // ---- metronome with tempo ramp ----
  const MT = { bpm: 80, beats: 4, on: false, timer: null, next: 0, beat: 0, bar: 0, taps: [] };
  const TEMPO_NAMES = [[60, 'Largo'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [999, 'Presto']];
  function renderMetro() {
    show('metro'); $('mtBpm').textContent = MT.bpm; $('mtSlider').value = MT.bpm;
    $('mtName').textContent = `beats per minute · ${TEMPO_NAMES.find((t) => MT.bpm < t[0])[1]}`;
    $('mtTs').innerHTML = [2, 3, 4, 6].map((b) => `<button class="${b === MT.beats ? 'on' : ''}" data-b="${b}">${b}/${b === 6 ? 8 : 4}</button>`).join('');
    $$('#mtTs button').forEach((b) => (b.onclick = () => { MT.beats = +b.dataset.b; renderMetro(); }));
    if (!$('mtGoal').options.length) { for (let v = 60; v <= 220; v += 10) $('mtGoal').add(new Option(v, v)); $('mtGoal').value = 120; }
    $('mtBeats').innerHTML = Array.from({ length: MT.beats }, (_, k) => `<i data-k="${k}"></i>`).join('');
    $('mtGo').textContent = MT.on ? '■ Stop' : '▶ Start';
  }
  const setBpm = (v) => { MT.bpm = Math.max(30, Math.min(220, Math.round(v))); $('mtBpm').textContent = MT.bpm; $('mtSlider').value = MT.bpm; $('mtName').textContent = `beats per minute · ${TEMPO_NAMES.find((t) => MT.bpm < t[0])[1]}`; };
  function mtTick() {
    while (MT.next < ctx.currentTime + 0.12) {
      const accent = MT.beat === 0 || (MT.beats === 6 && MT.beat === 3), when = MT.next, k = MT.beat;
      clickAt(when, accent);
      setTimeout(() => $$('#mtBeats i').forEach((el, j) => el.classList.toggle('on', j === k)), Math.max(0, (when - ctx.currentTime) * 1000));
      MT.beat++;
      if (MT.beat >= MT.beats) { MT.beat = 0; MT.bar++; if ($('mtRamp').checked && MT.bar % +$('mtBars').value === 0 && MT.bpm < +$('mtGoal').value) setBpm(Math.min(+$('mtGoal').value, MT.bpm + +$('mtStep').value)); }
      MT.next += 60 / MT.bpm * (MT.beats === 6 ? 0.5 : 1);
    }
  }
  function metroStop() { MT.on = false; clearInterval(MT.timer); MT.timer = null; $('mtGo').textContent = '▶ Start'; $$('#mtBeats i').forEach((el) => el.classList.remove('on')); }
  $('mtGo').onclick = () => { if (MT.on) return metroStop(); ensureContext(); ctx.resume(); MT.on = true; MT.beat = 0; MT.bar = 0; MT.next = ctx.currentTime + 0.1; MT.timer = setInterval(mtTick, 25); mtTick(); $('mtGo').textContent = '■ Stop'; };
  $('mtMinus').onclick = () => setBpm(MT.bpm - 2); $('mtPlus').onclick = () => setBpm(MT.bpm + 2);
  $('mtSlider').oninput = (e) => setBpm(+e.target.value);
  $('mtTap').onclick = () => { const t = performance.now(); MT.taps = MT.taps.filter((x) => t - x < 3000).concat(t); if (MT.taps.length >= 3) { const iv = (MT.taps[MT.taps.length - 1] - MT.taps[0]) / (MT.taps.length - 1); setBpm(60000 / iv); } };
  $('mtBack').onclick = () => { metroStop(); back(); };
  $('btnMetro').onclick = renderMetro;

  // ---------------- settings UI ----------------
  function bindSettings() {
    const upd = () => { $('sensVal').textContent = S.sens; $('strictVal').textContent = S.strict; $('velVal').textContent = S.velMin; $('tuningVal').textContent = `A4 = ${S.a4.toFixed(1)} Hz`; };
    $('sens').value = S.sens; $('strict').value = S.strict; $('velMin').value = S.velMin; $('optAcc').checked = S.accidentals; $('optOct').checked = S.strictOctave;
    $('sens').oninput = (e) => { S.sens = +e.target.value; save(); upd(); };
    $('strict').oninput = (e) => { S.strict = +e.target.value; save(); upd(); };
    $('velMin').oninput = (e) => { S.velMin = +e.target.value; save(); upd(); };
    $('optAcc').onchange = (e) => { S.accidentals = e.target.checked; save(); };
    $('optOct').onchange = (e) => { S.strictOctave = e.target.checked; save(); };
    const chips = $('chordTypes'); chips.innerHTML = '';
    for (const [k, v] of Object.entries(D.CHORD_TYPES)) {
      if (k === 'sus2' || k === 'sus4') continue;
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" value="${k}" ${S.chordTypes.includes(k) ? 'checked' : ''}> ${v.name}`;
      l.querySelector('input').onchange = () => { S.chordTypes = [...chips.querySelectorAll('input:checked')].map((i) => i.value); save(); };
      chips.appendChild(l);
    }
    $('btnRecal').onclick = () => { $('settings').close(); requireMic(() => startCalibration(renderMap)); };
    $('btnMidiConnect').onclick = () => initMidi();
    if (!navigator.requestMIDIAccess) { $('midiStatus').textContent = 'This browser has no Web MIDI (true of every iPhone/iPad browser). The microphone is used instead.'; $('btnMidiConnect').hidden = true; }
    upd();
  }

  // ---------------- wiring ----------------
  $$('.mic-pill').forEach((p) => (p.onclick = () => { if (ctx && ctx.state !== 'running') ctx.resume().then(setPills); }));
  $$('.midi-pill').forEach((p) => (p.onclick = () => $('settings').showModal()));
  if (navigator.requestMIDIAccess) {
    $('btnStartMidi').hidden = false;
    $('btnStartMidi').onclick = async () => { if (await initMidi()) { ctx.resume(); const n = pendingAfterMic || renderMap; pendingAfterMic = null; n(); } };
    if (navigator.permissions) navigator.permissions.query({ name: 'midi' }).then((p) => p.state === 'granted' && initMidi()).catch(() => {});
  }
  if (DEBUG) {
    $('debugPanel').hidden = false;
    const b = document.createElement('button'); b.className = 'link'; b.textContent = 'Debug: continue without mic (computer keys)';
    b.onclick = () => { ensureContext(); ctx.resume(); startLoop(); micOn = true; S.calibrated = true; const n = pendingAfterMic || renderMap; pendingAfterMic = null; n(); };
    document.querySelector('.start-card').appendChild(b);
  }
  bindSettings();
  if (!localStorage.getItem('pt.onboarded') && !Object.keys(Prog.raw.units).length && !S.calibrated) startOnboarding(); else renderMap();
  window.PT = { _summary: () => showSummary(), get SG() { return SG; }, openSong, startSongTime, renderSongs, renderDaily, runDaily, openPlacement, renderMetro, MT, get PL() { return PL; }, placementResult, S, Prog, win, testLog, onsetLog, levelLog, startRhythm, get micStartPerf() { return micStartPerf; }, get Dr() { return Dr; }, get ctx() { return ctx; }, startMic, startDrill, openPractice, openLesson, renderStats, renderMap, startCalibration, gate, openLesson, get LS() { return LS; }, startOnboarding };
})();
