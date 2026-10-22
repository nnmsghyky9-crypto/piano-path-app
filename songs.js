/* Piano Path songs & pieces: public-domain melodies (traditional, Beethoven, Petzold, Pachelbel, Bach, Mozart)
   and short original pieces. Each piece is split into phrases that are learned and graded one at a time.
   Phrase notation: "E4/q D4/q C4/h | ..." (name/duration, r = rest, | = bar line, durations w h q e s, '.' = dotted, '~' = tie). */
(function (root) {
  const D = root.PianoDetect || require('./detector.js');
  const C = root.Curriculum || require('./curriculum.js');
  const SONGS = [
    { id: 'hcb', title: 'Hot Cross Buns', by: 'Traditional', level: 'Beginner', after: 12, bpm: 92, ts: [4, 4], key: 'C', hands: 'Right hand',
      tip: 'Right hand in C position: thumb (1) on middle C, 2 on D, 3 on E.',
      phrases: [{ rh: 'E4/q D4/q C4/h | E4/q D4/q C4/h', fingers: '3 2 1 3 2 1' },
        { rh: 'C4/e C4/e C4/e C4/e D4/e D4/e D4/e D4/e | E4/q D4/q C4/h', fingers: '1 1 1 1 2 2 2 2 3 2 1' }] },
    { id: 'mary', title: 'Mary Had a Little Lamb', by: 'Traditional', level: 'Beginner', after: 12, bpm: 100, ts: [4, 4], key: 'C', hands: 'Right hand',
      tip: 'C position. Only C, D, E and G. G is your pinky (5).',
      phrases: [{ rh: 'E4/q D4/q C4/q D4/q | E4/q E4/q E4/h' }, { rh: 'D4/q D4/q D4/h | E4/q G4/q G4/h' },
        { rh: 'E4/q D4/q C4/q D4/q | E4/q E4/q E4/q E4/q' }, { rh: 'D4/q D4/q E4/q D4/q | C4/w' }] },
    { id: 'ode', title: 'Ode to Joy', by: 'Ludwig van Beethoven', level: 'Beginner', after: 12, bpm: 100, ts: [4, 4], key: 'C', hands: 'Right hand',
      tip: 'C position, fingers 1–5 on C D E F G. Notice the dotted quarter near the end of lines 2 and 4: long-short.',
      phrases: [{ rh: 'E4/q E4/q F4/q G4/q | G4/q F4/q E4/q D4/q' }, { rh: 'C4/q C4/q D4/q E4/q | E4/q. D4/e D4/h' },
        { rh: 'E4/q E4/q F4/q G4/q | G4/q F4/q E4/q D4/q' }, { rh: 'C4/q C4/q D4/q E4/q | D4/q. C4/e C4/h' }] },
    { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', by: 'Traditional', level: 'Beginner', after: 2, bpm: 100, ts: [4, 4], key: 'C', hands: 'Right hand',
      tip: 'Starts on middle C, then jumps up to G. A is one white key above G: stretch your pinky or move your hand.',
      phrases: [{ rh: 'C4/q C4/q G4/q G4/q | A4/q A4/q G4/h' }, { rh: 'F4/q F4/q E4/q E4/q | D4/q D4/q C4/h' },
        { rh: 'G4/q G4/q F4/q F4/q | E4/q E4/q D4/h' }, { rh: 'G4/q G4/q F4/q F4/q | E4/q E4/q D4/h' }] },
    { id: 'jingle', title: 'Jingle Bells (chorus)', by: 'James Lord Pierpont', level: 'Beginner', after: 2, bpm: 120, ts: [4, 4], key: 'C', hands: 'Right hand',
      tip: 'Thumb on C, 3 on E, 5 on G. Lots of repeated E’s: lift and replay each one.',
      phrases: [{ rh: 'E4/q E4/q E4/h | E4/q E4/q E4/h' }, { rh: 'E4/q G4/q C4/q. D4/e | E4/w' },
        { rh: 'F4/q F4/q F4/q. F4/e | F4/q E4/q E4/q E4/e E4/e' }, { rh: 'E4/q D4/q D4/q E4/q | D4/h G4/h' }] },
    { id: 'saints', title: 'When the Saints Go Marching In', by: 'Traditional', level: 'Beginner', after: 2, bpm: 110, ts: [4, 4], key: 'C', hands: 'Right hand',
      tip: 'Each line starts after a quarter rest: count “1” silently, then play on “2”.',
      phrases: [{ rh: 'r/q C4/q E4/q F4/q | G4/w' }, { rh: 'r/q C4/q E4/q F4/q | G4/h E4/h | C4/h E4/h | D4/w' },
        { rh: 'r/q C4/q E4/q F4/q | G4/h E4/h | C4/h D4/h | C4/w' }] },
    { id: 'march', title: 'Two-Hand March', by: 'Original (Piano Path)', level: 'Beginner', after: 13, bpm: 84, ts: [4, 4], key: 'C', hands: 'Both hands',
      tip: 'Left hand plays one long note per bar: C (pinky on the C below middle C) or G. Hold it while the right hand moves.',
      phrases: [{ rh: 'C4/q D4/q E4/q C4/q | E4/q F4/q G4/h', lh: 'C3/w | C3/w' }, { rh: 'G4/q F4/q E4/q D4/q | C4/w', lh: 'G2/w | C3/w' }] },
    { id: 'minuet', title: 'Minuet in G', by: 'Christian Petzold', level: 'Intermediate', after: 16, bpm: 100, ts: [3, 4], key: 'G', hands: 'Right hand',
      tip: 'Key of G: every F is F♯. Three beats per bar. Keep the eighth notes even: “1 & 2 & 3 &”.',
      phrases: [{ rh: 'D5/q G4/e A4/e B4/e C5/e | D5/q G4/q G4/q' }, { rh: 'E5/q C5/e D5/e E5/e F#5/e | G5/q G4/q G4/q' },
        { rh: 'C5/q D5/e C5/e B4/e A4/e | B4/q C5/e B4/e A4/e G4/e' }, { rh: 'F#4/q G4/e A4/e B4/e G4/e | A4/h.' }] },
    { id: 'odeht', title: 'Ode to Joy (hands together)', by: 'Ludwig van Beethoven, arranged', level: 'Intermediate', after: 20, bpm: 92, ts: [4, 4], key: 'C', hands: 'Both hands',
      tip: 'Left hand: C below middle C, or the G below that. Play it together with the first melody note of the bar and hold it.',
      phrases: [{ rh: 'E4/q E4/q F4/q G4/q | G4/q F4/q E4/q D4/q', lh: 'C3/w | G2/w' }, { rh: 'C4/q C4/q D4/q E4/q | E4/q. D4/e D4/h', lh: 'C3/w | G2/w' },
        { rh: 'E4/q E4/q F4/q G4/q | G4/q F4/q E4/q D4/q', lh: 'C3/w | G2/w' }, { rh: 'C4/q C4/q D4/q E4/q | D4/q. C4/e C4/h', lh: 'C3/w | G2/h C3/h' }] },
    { id: 'canon', title: 'Canon chords', by: 'Johann Pachelbel, simplified in C', level: 'Intermediate', after: 9, bpm: 72, ts: [4, 4], key: 'C', hands: 'Both hands',
      tip: 'One chord per bar: left hand plays the root low, right hand plays the triad. Play on beats 1 and 3.',
      phrases: [{ chords: 'C G Am Em', pattern: 'h h' }, { chords: 'F C F G', pattern: 'h h' }] },
    { id: 'elise', title: 'Für Elise (opening)', by: 'Ludwig van Beethoven', level: 'Advanced', after: 24, bpm: 60, ts: [3, 8], key: 'C', hands: 'Right hand',
      tip: 'Sixteenth notes: four per beat. E–D♯ is a half step: rock between fingers 5 and 4. Take the slow tempo first.',
      phrases: [{ rh: 'r/q E5/s D#5/s | E5/s D#5/s E5/s B4/s D5/s C5/s | A4/e r/s C4/s E4/s A4/s | B4/e r/s E4/s G#4/s B4/s' },
        { rh: 'C5/e r/s E4/s E5/s D#5/s | E5/s D#5/s E5/s B4/s D5/s C5/s | A4/e r/s C4/s E4/s A4/s | B4/e r/s E4/s C5/s B4/s | A4/q.' }] },
    { id: 'green', title: 'Greensleeves', by: 'Traditional', level: 'Advanced', after: 24, bpm: 66, ts: [6, 8], key: 'C', hands: 'Right hand',
      tip: 'A minor, in 6/8: two big beats per bar, each split in three. G♯ is the raised 7th that pulls back to A.',
      phrases: [{ rh: 'r/h r/e A4/e | C5/q D5/e E5/e. F5/s E5/e | D5/q B4/e G4/e. A4/s B4/e' }, { rh: 'C5/q A4/e A4/e. G#4/s A4/e | B4/q G#4/e E4/q A4/e' },
        { rh: 'C5/q D5/e E5/e. F5/s E5/e | D5/q B4/e G4/e. A4/s B4/e' }, { rh: 'C5/e. B4/s A4/e G#4/e. F#4/s G#4/e | A4/q. A4/q.' }] },
    { id: 'prelude', title: 'Prelude in C (bars 1–4)', by: 'Johann Sebastian Bach, BWV 846', level: 'Advanced', after: 24, bpm: 60, ts: [4, 4], key: 'C', hands: 'Both hands (one line)',
      tip: 'Each bar is one chord, broken into 8 notes and played twice. Left hand takes the first two notes, right hand the other six.',
      phrases: [{ rh: 'C4/s E4/s G4/s C5/s E5/s G4/s C5/s E5/s C4/s E4/s G4/s C5/s E5/s G4/s C5/s E5/s | C4/s D4/s A4/s D5/s F5/s A4/s D5/s F5/s C4/s D4/s A4/s D5/s F5/s A4/s D5/s F5/s' },
        { rh: 'B3/s D4/s G4/s D5/s F5/s G4/s D5/s F5/s B3/s D4/s G4/s D5/s F5/s G4/s D5/s F5/s | C4/s E4/s G4/s C5/s E5/s G4/s C5/s E5/s C4/s E4/s G4/s C5/s E5/s G4/s C5/s E5/s' }] },
    { id: 'turca', title: 'Rondo alla Turca (opening)', by: 'Wolfgang Amadeus Mozart', level: 'Expert', after: 33, bpm: 72, ts: [2, 4], key: 'C', hands: 'Right hand',
      tip: 'A minor. Fingers 2-1-2-3 for B A G♯ A, then jump. Keep the wrist loose and the sixteenths even.',
      phrases: [{ rh: 'r/q B4/s A4/s G#4/s A4/s | C5/e r/e D5/s C5/s B4/s C5/s | E5/e r/e F5/s E5/s D#5/s E5/s' },
        { rh: 'B5/s A5/s G#5/s A5/s B5/s A5/s G#5/s A5/s | C6/q r/q' }] },
    { id: 'comp', title: 'ii–V–I comping (Charleston rhythm)', by: 'Original (Piano Path)', level: 'Expert', after: 34, bpm: 92, ts: [4, 4], key: 'C', hands: 'Both hands',
      tip: 'Charleston rhythm: chord on beat 1, then again on the “and” of 2. Use any voicing that has the 3rd and 7th.',
      phrases: [{ chords: 'Dm7 G7 Cmaj7 Cmaj7', pattern: 'q. e~ h' }, { chords: 'Em7 A7 Dm7 G7', pattern: 'q. e~ h' }] },
  ];
  const LETTER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  /** "E4/q r/e C4+E4/h." → parsed rhythm elements with names */
  function parsePart(str) {
    const toks = str.trim().split(/\s+/), rh = [], names = [];
    for (const t of toks) {
      if (t === '|') { rh.push('|'); continue; }
      const m = /^([^/]+)\/([whqes]\.?~?)$/.exec(t); if (!m) throw new Error('bad token ' + t);
      if (m[1] === 'r') { rh.push(m[2].replace('~', '').replace(/^([whqes])(\.?)$/, '$1$2r')); names.push(null); }
      else { rh.push(m[2]); names.push(m[1].split('+')); }
    }
    const els = D.parseRhythm(rh.join(' '));
    els.forEach((e, i) => { if (names[i]) { e.names = names[i]; e.name = names[i][0]; } });
    return els;
  }
  const keyAccs = (key) => new Set(C.scaleNames(key).map((n) => n.replace(/-?\d$/, '')).filter((n) => /[#b]/.test(n)));
  function chordPart(chords, pattern) {   // one chord per bar, the rhythm pattern repeated in every bar
    const syms = chords.trim().split(/\s+/); let tokens = [];
    syms.forEach((s, b) => { if (b) tokens.push('|'); tokens = tokens.concat(pattern.trim().split(/\s+/)); });
    const els = D.parseRhythm(tokens.join(' '));
    els.forEach((e) => { e.chord = syms[e.bar]; });
    return { els, syms };
  }
  const pcOf = (n) => C.pcOf(n), midiOf = (n) => C.midiOf(n);
  function chordVoicing(sym) {   // left-hand root around C3, right-hand chord tones from C4 up
    const t = C.symTarget(sym), c = C.parseSym(sym), names = C.placeChord(c.root, c.type);
    const rootM = 48 + ((pcOf(c.bass || c.root) - 0 + 12) % 12); return { pcs: t.target.pcs, midis: [rootM < 52 ? rootM : rootM - 12, ...names.map(midiOf)], names };
  }
  /** Everything the player needs for one phrase (or the whole piece when i === 'all'). */
  function phrase(song, i) {
    if (i === 'all') {
      const parts = song.phrases.map((_, k) => phrase(song, k)); let off = 0, barOff = 0; const onsets = [], rh = [], lh = [];
      parts.forEach((p) => { p.onsets.forEach((o) => onsets.push({ ...o, pos: o.pos + off })); p.rh.forEach((e) => rh.push({ ...e, pos: e.pos + off, bar: e.bar + barOff })); (p.lh || []).forEach((e) => lh.push({ ...e, pos: e.pos + off, bar: e.bar + barOff })); off += p.total; barOff += p.bars; });
      return { ...parts[0], onsets, rh, lh: lh.length ? lh : null, total: off, bars: barOff, whole: true, syms: parts[0].syms ? parts.flatMap((p) => p.syms) : null };
    }
    const ph = song.phrases[i], ka = keyAccs(song.key);
    let rh, lh = null, syms = null;
    if (ph.chords) { const cp = chordPart(ph.chords, ph.pattern); rh = cp.els; syms = cp.syms; }
    else { rh = parsePart(ph.rh); if (ph.lh) lh = parsePart(ph.lh); }
    [rh, lh || []].forEach((els) => els.forEach((e) => { if (e.name) { const b = e.name.replace(/-?\d$/, ''); e.hideAcc = ka.has(b); } }));
    const by = new Map();
    const add = (pos, pcs, midis, names, chord, bar) => { const k = Math.round(pos * 1000); const o = by.get(k) || { pos, bar, pcs: [], midis: [], names: [], chord: null }; pcs.forEach((p) => !o.pcs.includes(p) && o.pcs.push(p)); o.midis.push(...midis); o.names.push(...names); if (chord) o.chord = chord; by.set(k, o); };
    const ons = (els) => els.forEach((e, k) => { if (e.rest || (k > 0 && els[k - 1].tie)) return; if (e.chord) { const v = chordVoicing(e.chord); add(e.pos, v.pcs, v.midis, [e.chord], e.chord, e.bar); } else add(e.pos, e.names.map(pcOf), e.names.map(midiOf), e.names, null, e.bar); });
    ons(rh); if (lh) ons(lh);
    const onsets = [...by.values()].sort((a, b) => a.pos - b.pos);
    onsets.forEach((o) => { const src = rh.concat(lh || []).filter((e) => Math.abs(e.pos - o.pos) < 1e-6 && !e.rest); o.dur = Math.max(...src.map((e) => e.dur)); });
    const total = rh.reduce((a, e) => Math.max(a, e.pos + e.dur), 0);
    return { rh, lh, syms, onsets, total, bars: rh[rh.length - 1].bar + 1, ts: song.ts, keySig: C.KEYSIG[song.key] || {}, bpm: song.bpm, chords: !!ph.chords, fingers: ph.fingers || null };
  }
  /** learn-mode steps: chord pieces = one step per chord; melodies = one step per onset */
  function learnSteps(p) {
    if (p.chords) return p.onsets.filter((o, k, a) => !k || o.chord !== a[k - 1].chord || o.bar !== a[k - 1].bar);
    return p.onsets;
  }
  // ---- song progress (stored in the same progress record: data.songs, so nothing old is touched) ----
  // phrase level: 1 = notes learned, 2 = played in time (slower tempo), 3 = in time at full tempo
  const sd = (prog, id) => { const d = prog.raw; d.songs = d.songs || {}; return (d.songs[id] = d.songs[id] || { p: {} }); };
  function setLevel(prog, id, i, lvl) { const s = sd(prog, id); if ((s.p[i] || 0) < lvl) { s.p[i] = lvl; s.last = Date.now(); prog.save(); return true; } return false; }
  const levelOf = (prog, id, i) => sd(prog, id).p[i] || 0;
  function stars(prog, song) { const s = sd(prog, song.id); return Math.min(...song.phrases.map((_, i) => s.p[i] || 0)); }
  const unlocked = (prog, song, all) => all || prog.unlocked(song.after, false);
  // ---------------- daily practice: warm-up + review of weak items + next new thing + a song ----------------
  const U = (id) => C.UNITS.find((u) => u.id === id);
  function currentUnit(prog) {   // first open unit on the path that isn't finished yet (past any placement point)
    const from = Math.max(0, prog.placedUpTo ? prog.placedUpTo() : 0);
    for (let i = from; i < C.ORDER.length; i++) { const id = C.ORDER[i], u = U(id); if (!prog.unlocked(id, false)) continue; if (u.selfCheck ? !prog.mastery(id) : prog.mastery(id) < prog.PASS) return id; }
    return null;
  }
  function weakKeys(prog, id, n) {
    const ud = prog.unitData(id), it = Object.entries(ud.items);
    const weak = it.filter(([, v]) => v.miss > 0).sort((a, b) => b[1].miss / b[1].seen - a[1].miss / a[1].seen).map(([k]) => k);
    const shaky = it.filter(([k, v]) => !weak.includes(k) && v.box <= 1).map(([k]) => k);
    const rest = U(id).pool.filter((k) => !weak.includes(k) && !shaky.includes(k));
    return weak.concat(shaky, rest).filter((k) => U(id).pool.includes(k)).slice(0, n);
  }
  function dailyPlan(prog, all = false) {
    const plan = [], cur = currentUnit(prog), started = (id) => prog.unitData(id).hist.length > 0;
    // 1. warm-up: technique in time if it's open, otherwise five-finger patterns
    const warm = [48, 11].find((id) => prog.unlocked(id, false) && started(id) && id !== cur);
    if (warm) plan.push({ kind: 'drill', unit: warm, items: weakKeys(prog, warm, warm === 48 ? 2 : 3), label: warm === 48 ? 'Warm-up: a scale in time' : 'Warm-up: five-finger patterns', min: 2 });
    // 2. review: the started drills you're weakest at (lowest recent accuracy, then lowest mastery)
    const rev = C.ORDER.filter((id) => !U(id).selfCheck && id !== cur && id !== warm && started(id) && prog.unlocked(id, false))
      .map((id) => { const st = prog.stats(id); return { id, score: (st.acc == null ? 100 : st.acc) + prog.mastery(id) * 0.5 - (prog.unitData(id).retry.length ? 30 : 0) }; })
      .sort((a, b) => a.score - b.score).slice(0, 2);
    rev.forEach((r) => plan.push({ kind: 'drill', unit: r.id, items: weakKeys(prog, r.id, 4), label: `Review: ${U(r.id).title}`, min: 3 }));
    // 3. new material: the next lesson, or a round of the current drill
    if (cur != null) { const u = U(cur); plan.push(u.selfCheck ? { kind: 'lesson', unit: cur, label: `New: ${u.title}`, min: 5 } : { kind: 'drill', unit: cur, items: null, len: 6, label: `New: ${u.title}`, min: 4 }); }
    // 4. a song: the first open piece that isn't fully starred, at its weakest phrase
    const song = SONGS.find((s) => unlocked(prog, s, all) && stars(prog, s) < 3);
    if (song) { const lv = song.phrases.map((_, i) => levelOf(prog, song.id, i)), i = lv.indexOf(Math.min(...lv)); plan.push({ kind: 'song', song: song.id, phrase: i, label: `Song: ${song.title}, line ${i + 1}`, min: 3 }); }
    return plan;
  }
  /** daily state for today (kept in the progress record so it survives reloads); built once per day */
  function today(prog, rebuild) {
    const d = prog.raw, t = prog.today();
    if (rebuild || !d.daily || d.daily.date !== t) { d.daily = { date: t, plan: dailyPlan(prog), done: [] }; prog.save(); }
    return d.daily;
  }
  function markDaily(prog, idx) {
    const d = today(prog); if (!d.done.includes(idx)) d.done.push(idx);
    if (d.done.length >= d.plan.length) { prog.raw.goalDays = prog.raw.goalDays || []; if (!prog.raw.goalDays.includes(d.date)) prog.raw.goalDays.push(d.date); }
    prog.save(); return d;
  }
  // ---------------- placement test: short checks of increasing difficulty; stop at the first one you can't do ----------------
  const PLACEMENT = [
    { unit: 1, label: 'Find notes on the keyboard' }, { unit: 2, label: 'Read the treble clef' }, { unit: 3, label: 'Read the bass clef' },
    { unit: 12, label: 'Play simple rhythms' }, { unit: 14, label: 'Sharps, flats & key signatures' }, { unit: 4, label: 'Intervals' },
    { unit: 5, label: 'Major & minor chords' }, { unit: 16, label: 'Eighth notes & dotted rhythms' }, { unit: 7, label: 'Major scales' },
    { unit: 9, label: 'Chord progressions' }, { unit: 8, label: 'Seventh chords' }, { unit: 26, label: 'Lead sheets' }, { unit: 34, label: 'Jazz ii–V–I voicings' },
  ];
  PLACEMENT.sort((a, b) => C.ORDER.indexOf(a.unit) - C.ORDER.indexOf(b.unit));
  PLACEMENT.forEach((c) => { const p = U(c.unit).pool; c.items = [p[0], p[Math.min(2, p.length - 1)], p[Math.min(4, p.length - 1)]]; });
  /** ORDER index where someone who couldn't do checkpoint k should start: that unit, or the tutorials just before it */
  function placementStart(k) {
    if (k >= PLACEMENT.length) return C.ORDER.length - 1;
    let i = C.ORDER.indexOf(PLACEMENT[k].unit); while (i > 0 && U(C.ORDER[i - 1]).selfCheck) i--;
    return i;
  }
  const api = { SONGS, dailyPlan, today, markDaily, currentUnit, weakKeys, PLACEMENT, placementStart, parsePart, phrase, learnSteps, setLevel, levelOf, stars, unlocked, chordVoicing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Songs = api;
})(typeof window !== 'undefined' ? window : globalThis);
