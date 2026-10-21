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
  function pianoTone(m, when, dur, toAnalyser) {
    const f0 = D.midiToFreq(m), out = ctx.createGain(), t = when;
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.16, t + 0.006); out.gain.exponentialRampToValueAtTime(0.04, t + dur * 0.7); out.gain.exponentialRampToValueAtTime(0.0005, t + dur);
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
      while (onsetLog.length && now - onsetLog[0].t > 20000) onsetLog.shift();
      while (levelLog.length && now - levelLog[0].t > 20000) levelLog.shift();
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
    win.push(now, notes, mono);
    const f = { now, notes, mono, level, onset, events };
    $$('.lvl').forEach((e) => (e.style.width = toPct(levelSmooth) + '%')); $$('.gt').forEach((e) => (e.style.left = toPct(gate()) + '%'));
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
    if (id !== 'drill' && id !== 'practice' && id !== 'calib') frameHandler = null;
    window.scrollTo(0, 0); setPills();
  }
  function back() { history.pop(); const prev = history.pop() || 'map'; ({ map: renderMap, stats: renderStats, lesson: () => openLesson(curUnit) }[prev] || renderMap)(); }
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
      return Staff.renderMeasure({ els, timeSig: sp.timeSig, clef: sp.clef || (sp.names ? 'treble' : 'perc'), keySig: sp.keySig, ...extra });
    }
    if (sp.chords) return `<div class="chord-row">${sp.groups.map((g, i) => `<div>${Staff.render({ clef: sp.clef, notes: g, mode: 'chord', keySig: i === 0 ? sp.keySig : undefined, labels: [sp.labels && sp.labels[i]], width: 120 })}</div>`).join('')}</div>`;
    if (sp.notes && Array.isArray(sp.notes[0])) return renderSpec({ chords: true, clef: sp.clef, groups: sp.notes, labels: sp.labels, keySig: sp.keySig });
    return Staff.render(sp);
  }

  // ---------------- curriculum map ----------------
  function renderMap() {
    show('map'); history = ['map'];
    $('dayStreak').textContent = `🔥 ${Prog.dayStreak()}`;
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
        const isCur = open && !mastered && !currentMarked && !u.selfCheck;
        li.className = 'unit' + (mastered ? ' mastered' : '') + (!open ? ' locked' : '') + (isCur ? ' current' : '') + (u.selfCheck ? ' guide' : '');
        if (isCur) currentMarked = true;
        const tag = u.selfCheck ? 'guide · self-check' : u.rhythm ? 'rhythm · mic' : u.ear ? 'ear · buttons' : 'mic-graded';
        li.innerHTML = `<div class="num">${mastered ? '✓' : open ? (idx + 1) : '🔒'}</div><div class="grow"><div class="ttl">${u.title}</div><div class="lvl">${tag}${!open && prev ? ' · master “' + prev.title + '” to unlock' : ''}</div><div class="bar"><div style="width:${m}%"></div></div></div><div class="pct">${u.selfCheck ? (mastered ? 'done' : '') : m + '%'}</div>`;
        li.dataset.unit = u.id;
        if (open) li.onclick = () => openLesson(u.id);
        list.appendChild(li);
      }
    }
    $('soonList').innerHTML = '';
    $('soonH').hidden = true;
  }
  $('btnFree').onclick = () => requireMic(openPractice);
  $('btnStats').onclick = renderStats;

  // ---------------- lesson ----------------
  let curUnit = 1;
  function openLesson(id) {
    curUnit = id; const u = C.UNITS.find((x) => x.id === id), v = u.visual;
    show('lesson');
    $('lessonLevel').textContent = `Unit ${C.ORDER.indexOf(u.id) + 1} · ${u.level}`; $('lessonTitle').textContent = u.title;
    $('lessonVisual').innerHTML = renderSpec(v);
    $('lessonText').innerHTML = u.lesson;
    const m = Prog.mastery(id); $('lessonBar').style.width = m + '%'; $('lessonPct').textContent = u.selfCheck ? (m ? 'done ✓' : 'not done yet') : `${m}% mastery`;
    const ud = Prog.unitData(id);
    $('lessonChecklist').innerHTML = u.selfCheck ? `<div class="muted small">The mic can't grade this. Tick each item when you've done it:</div>` + u.checklist.map((c, i) => `<label class="chk"><input type="checkbox" data-i="${i}" ${(ud.checks || [])[i] ? 'checked' : ''}> ${c}</label>`).join('') : '';
    $$('#lessonChecklist input').forEach((cb) => (cb.onchange = () => { ud.checks = ud.checks || []; ud.checks[+cb.dataset.i] = cb.checked; Prog.save(); }));
    $('lessonRule').textContent = u.selfCheck ? 'Guidance units never block your path. Mark it practised when you can do every item.' : u.rhythm ? `Rhythm drills are graded on when each note starts, compared with the beat (a constant delay from the mic is cancelled out automatically). Reach ${Prog.PASS}% to master the unit. Tighter timing scores higher.` : `To master this unit, reach ${Prog.PASS}%. Mastery is based on your last 20 answers: accuracy on the first try, plus speed. Items you miss come back more often.`;
    if (u.selfCheck) {
      $('btnStartDrill').textContent = m ? '↺ Mark as not done' : '✓ I\'ve practised this';
      $('btnStartDrill').onclick = () => { Prog.markDone(id, !m); openLesson(id); };
      return;
    }
    $('btnStartDrill').textContent = u.ear ? 'Start ear training 🔊' : u.rhythm ? 'Start rhythm drill 🥁' : 'Start drill 🎤';
    $('btnStartDrill').onclick = () => (u.ear ? (ensureContext(), ctx.resume(), startLoop(), startDrill(id)) : requireMic(() => startDrill(id)));
  }
  function renderChordRow(v) { // several chords side by side, each on its own short staff
    return `<div class="chord-row" style="display:flex">${v.notes.map((g, i) => `<div style="flex:1;min-width:0">${Staff.render({ clef: v.clef, notes: g, mode: 'chord', keySig: i === 0 ? v.keySig : undefined, labels: [v.labels[i]], width: 150 })}</div>`).join('')}</div>`;
  }

  // ---------------- drill engine ----------------
  let Dr = null;
  const testLog = [];
  function startDrill(unitId, opts = {}) {
    const u = C.UNITS.find((x) => x.id === unitId);
    Dr = { u, opts, n: 0, len: opts.sessionLen || (u.rhythm ? 8 : [7, 9, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 30, 31, 32, 34].includes(u.id) ? 6 : 10), results: [], streak: 0, lastKey: null, startMastery: Prog.mastery(unitId), fixed: opts.items ? [...opts.items] : null };
    Prog.unitData(unitId).sessions++; Prog.save();
    show('drill'); $('summary').hidden = true; $('drillUnit').textContent = `Unit ${C.ORDER.indexOf(u.id) + 1}: ${u.title}`;
    frameHandler = drillFrame;
    nextItem();
  }
  function nextItem() {
    if (Dr.n >= Dr.len) return showSummary();
    const key = Dr.fixed && Dr.fixed.length ? Dr.fixed.shift() : Prog.pick(Dr.u.id, Dr.lastKey);
    const it = Dr.u.item(key);
    Object.assign(Dr, { key, it, lastKey: key, shownAt: performance.now(), attempt: null, tries: 0, step: 0, missed: false, locked: false, hinted: false, recorded: false, revealed: false, playing: false });
    $('drillProg').style.width = (100 * Dr.n / Dr.len) + '%';
    $('drillCard').className = 'prompt-card';
    $('dTitle').textContent = it.title; $('dBig').textContent = it.big || ''; $('dBig').style.fontSize = (it.big || '').length > 8 ? '2.1rem' : '';
    $('dStaff').innerHTML = renderSpec(it.staff);
    $('dSub').textContent = it.sub || ''; $('dAnswer').textContent = ''; $('dStatus').textContent = it.ear ? '' : 'Listening…';
    Dr.rh = null; Dr.ex = null; Dr.imp = it.grade.type === 'improv' ? { pcs: [], outside: 0 } : null;
    renderSeq(); renderChoices();
    $('dReplay').hidden = !(it.ear || it.play);
    $('dStart').hidden = it.grade.type !== 'rhythm'; $('dBeats').innerHTML = '';
    if (it.grade.type === 'rhythm') { $('dStatus').textContent = 'Tap ▶ Start: 1 bar count-in, then play'; $('dBig').textContent = ''; }
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
    const dur = p.melodic ? p.notes.length * gap + 1.0 : 1.8;
    pauseMic(true); Dr.playing = true; $('dStatus').textContent = '🔊 Listen… (mic paused)';
    p.notes.forEach((m, i) => pianoTone(m, p.melodic ? t0 + i * gap : t0, p.melodic ? 1.2 : 1.8, DEBUG && params.has('selfhear')));
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
    const g = Dr.it.grade, box = Prog.itemBox(Dr.u.id, Dr.key), bpm = Math.round(g.bpm * (1 + 0.08 * Math.min(box, 3)));
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
    const cnt = {}; for (const f of win.frames) { if (f.t < t + 40 || f.t > t + 380) continue; const m = f.mono != null ? f.mono : (f.notes[0] && f.notes[0].midi); if (m != null) { const pc = ((m % 12) + 12) % 12; cnt[pc] = (cnt[pc] || 0) + 1; } }
    let b = null; for (const k in cnt) if (b == null || cnt[k] > cnt[b]) b = k; return b == null ? null : +b;
  }
  function gradeRhythmNow() {
    const g = Dr.it.grade, r = Dr.rh; r.graded = true;
    const detected = onsetLog.filter((o) => o.t >= r.t0 - 400 && o.t <= r.end).map((o) => ({ t: o.t, pc: g.pitched ? pcAround(o.t) : null }));
    const expected = g.onsets.map((o) => ({ t: r.t0 + o.pos * r.msPerQ, pc: o.pc }));
    const res = D.gradeRhythm(expected, detected, { tol: g.tol, maxComp: 180, tailMs: Math.min(r.msPerQ * 0.6, 400), allowExtra: g.pitched ? 1 : 0 });
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
  function log(ok, heard) { testLog.push({ unit: Dr.u.id, key: Dr.key, step: Dr.step, ok, heard, t: Math.round(performance.now()) }); }
  function itemCorrect(res, timing) {
    Dr.locked = true;
    const ms = timing ? timing.ms : performance.now() - Dr.shownAt, firstTry = !Dr.missed && !Dr.hinted && Dr.tries === 0;
    if (!Dr.recorded) Prog.record(Dr.u.id, Dr.key, firstTry, ms, timing ? timing.target : (Dr.it.targetMs || Dr.u.targetMs));
    Dr.results.push({ key: Dr.key, ok: firstTry, ms }); Dr.n++;
    Dr.streak = firstTry ? Dr.streak + 1 : 0; $('drillStreak').textContent = `${Dr.streak} in a row`;
    log(true, res.heardLabel);
    $('drillCard').className = 'prompt-card correct';
    $('dStatus').textContent = (firstTry ? '✓ Correct' : '✓ Got it') + (timing ? '' : ` · ${(ms / 1000).toFixed(1)} s`) + (res.heardLabel ? ` · ${timing || Dr.it.grade.type === 'expr' || Dr.it.grade.type === 'improv' ? '' : 'heard '}${pretty(res.heardLabel)}` : '');
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
    if (!fromButton && res.missing && res.missing.length && Dr.tries >= 2) msg += ` (missing ${res.missing.map((pc) => pretty(D.PC_FLAT[pc])).join(', ')})`;
    $('dStatus').textContent = msg;
    if (Dr.tries >= maxTries()) reveal();
    setTimeout(() => { if (Dr && !Dr.locked) $('drillCard').className = 'prompt-card'; }, 900);
  }
  function showAnswer() {
    Dr.revealed = true; $('dAnswer').textContent = Dr.it.answer;
    if (Dr.it.reveal) $('dStaff').innerHTML = renderSpec(Dr.it.reveal);
    drawKeyboard($('dKbd'), Dr.it.show, []);
  }
  function reveal() {          // after repeated misses: show the answer, count as missed, let them play it once more
    if (!Dr.recorded) { Prog.record(Dr.u.id, Dr.key, false, performance.now() - Dr.shownAt, Dr.u.targetMs); Dr.recorded = true; }
    Dr.hinted = true; showAnswer(); renderSeq();
    $('dStatus').textContent += '. Here is the answer. Play it to continue, or skip.';
  }
  $('dHint').onclick = () => { if (!Dr || Dr.locked) return; Dr.hinted = true; showAnswer(); renderSeq(); };
  $('dSkip').onclick = () => {
    if (!Dr || Dr.locked) return;
    if (!Dr.recorded) Prog.record(Dr.u.id, Dr.key, false, performance.now() - Dr.shownAt, Dr.u.targetMs);
    Dr.results.push({ key: Dr.key, ok: false }); Dr.n++; Dr.streak = 0; Dr.locked = true; showAnswer();
    $('dStatus').textContent = 'Skipped. It will come back soon.'; setTimeout(nextItem, 1600);
  };
  $('drillBack').onclick = () => { if (Dr) { clearTimeout(Dr.playTimer); if (Dr.rh) Dr.rh.graded = true; pauseMic(false); } Dr = null; renderMap(); };
  function showSummary() {
    const ok = Dr.results.filter((r) => r.ok).length, m = Prog.mastery(Dr.u.id), times = Dr.results.filter((r) => r.ok).map((r) => r.ms);
    const oi = C.ORDER.indexOf(Dr.u.id), next = C.UNITS.find((x) => x.id === C.ORDER[oi + 1]), unlockedNow = next && m >= Prog.PASS && Dr.startMastery < Prog.PASS;
    $('drillProg').style.width = '100%';
    const el = $('summary'); el.hidden = false;
    el.innerHTML = `<div><div class="muted">Session complete</div><div class="big-num">${ok}/${Dr.results.length}</div><div class="muted">first-try correct${times.length ? ` · median ${(times.sort((a, b) => a - b)[times.length >> 1] / 1000).toFixed(1)} s` : ''}</div>
      <p>Unit mastery: <b>${m}%</b> (${m >= Dr.startMastery ? '+' : ''}${m - Dr.startMastery})</p>${unlockedNow ? `<p>🎉 Next unit unlocked: <b>${next.title}</b></p>` : m >= Prog.PASS ? '<p>✓ Mastered</p>' : `<p class="muted small">Reach ${Prog.PASS}% to unlock the next unit.</p>`}
      <div class="row"><button class="ghost" id="sumMap">Map</button><button class="primary" id="sumAgain">Another round</button></div></div>`;
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
  bindSettings(); renderMap();
  window.PT = { S, Prog, win, testLog, onsetLog, levelLog, startRhythm, get micStartPerf() { return micStartPerf; }, get Dr() { return Dr; }, get ctx() { return ctx; }, startMic, startDrill, openPractice, openLesson, renderStats, renderMap, startCalibration, gate };
})();
