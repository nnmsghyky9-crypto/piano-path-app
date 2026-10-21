/* Curriculum: units, item generators, spaced repetition, mastery + progress storage. */
(function (root) {
  'use strict';
  const D = root.PianoDetect || require('./detector.js');
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const ACC_SEMI = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };
  const pretty = (s) => String(s).replace(/([A-G])##/g, '$1𝄪').replace(/([A-G])bb/g, '$1𝄫').replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭');

  function parseName(n) {
    const m = /^([A-G])(##|bb|#|b)?(-?\d)?$/.exec(n); if (!m) return null;
    const li = LETTERS.indexOf(m[1]), acc = ACC_SEMI[m[2] || ''];
    const pc = (LETTER_PC[li] + acc + 12) % 12, oct = m[3] != null ? +m[3] : null;
    return { li, acc, pc, oct, midi: oct != null ? 12 * (oct + 1) + LETTER_PC[li] + acc : null, base: m[1] + (m[2] || '') };
  }
  /** transpose a spelled name up by `semi` semitones and `deg` letter steps. Keeps octave if present. */
  function transpose(name, semi, deg) {
    const p = parseName(name), li = (p.li + deg) % 7, octUp = Math.floor((p.li + deg) / 7);
    const pc = (p.pc + semi) % 12, diff = ((pc - LETTER_PC[li] + 18) % 12) - 6;
    const acc = diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff);
    return LETTERS[li] + acc + (p.oct != null ? p.oct + octUp + (LETTER_PC[li] + diff < 0 ? 0 : 0) : '');
  }
  const midiOf = (name) => parseName(name).midi;
  const pcOf = (name) => parseName(name).pc;

  const INTERVALS = {
    M2: { semi: 2, deg: 1, name: 'major 2nd' }, m3: { semi: 3, deg: 2, name: 'minor 3rd' }, M3: { semi: 4, deg: 2, name: 'major 3rd' },
    P4: { semi: 5, deg: 3, name: 'perfect 4th' }, P5: { semi: 7, deg: 4, name: 'perfect 5th' }, m6: { semi: 8, deg: 5, name: 'minor 6th' },
    M6: { semi: 9, deg: 5, name: 'major 6th' }, m7: { semi: 10, deg: 6, name: 'minor 7th' }, P8: { semi: 12, deg: 7, name: 'octave' },
  };
  const CHORD_DEG = { maj: [0, 2, 4], min: [0, 2, 4], dim: [0, 2, 4], aug: [0, 2, 4], dom7: [0, 2, 4, 6], maj7: [0, 2, 4, 6], min7: [0, 2, 4, 6] };
  function chordNames(rootName, type) { return D.CHORD_TYPES[type].iv.map((iv, k) => transpose(rootName, iv, CHORD_DEG[type][k])); }
  const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MIN_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const KEYSIG = { C: {}, G: { sharps: 1 }, D: { sharps: 2 }, A: { sharps: 3 }, E: { sharps: 4 }, B: { sharps: 5 }, F: { flats: 1 }, Bb: { flats: 2 }, Eb: { flats: 3 }, Ab: { flats: 4 }, Db: { flats: 5 } };
  const MAJOR_STEPS = [[0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6], [12, 7]];
  const scaleNames = (tonic) => MAJOR_STEPS.map(([s, d]) => transpose(tonic + '4', s, d));
  /** octave-placed voicing for display (root near middle C) */
  function placeChord(rootBase, type, inversion = 0) {
    let names = chordNames(rootBase + 4, type);
    for (let i = 0; i < inversion; i++) { const n = names.shift(), p = parseName(n); names.push(p.base + (p.oct + 1)); }
    const shift = (k) => names.map((n) => { const p = parseName(n); return p.base + (p.oct + k); });
    while (midiOf(names[0]) > 64) names = shift(-1);
    while (midiOf(names[0]) < 53) names = shift(1);
    return names;
  }
  const qualOf = (type) => (type === 'maj' ? 'major' : type === 'min' ? 'minor' : D.CHORD_TYPES[type].name);
  const chordSym = (rootBase, type) => pretty(rootBase) + pretty(D.CHORD_TYPES[type].suffix);
  const pcsOfNames = (names) => names.map(pcOf);
  const INV_NAMES = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];

  // ---------------- units ----------------
  const UNITS = [
    { id: 1, title: 'Finding notes', level: 'Beginner', targetMs: 3500,
      lesson: 'The piano repeats the same 12 notes in every octave. Black keys come in groups of <b>2</b> and <b>3</b>. <b>C</b> sits just left of each pair of black keys, and <b>F</b> just left of each group of three. A black key has two names: the one above a white key is its sharp (♯), and the one below is its flat (♭). So C♯ and D♭ are the same key. In this drill, play the named note in <b>any octave</b>.',
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], labels: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'] },
      pool: ['C', 'G', 'E', 'F', 'D', 'A', 'B', 'F#', 'Bb', 'C#', 'Eb', 'Ab', 'Gb', 'Db', 'G#', 'D#', 'A#'],
      item(key) {
        const p = parseName(key);
        return { title: 'Play this note (any octave)', big: pretty(key), sub: p.acc ? `black key · same key as ${pretty(D.PC_SHARP[p.pc] === key ? D.PC_FLAT[p.pc] : D.PC_SHARP[p.pc])}` : 'white key',
          grade: { type: 'window', target: { kind: 'note', pcs: [p.pc] } }, show: [60 + p.pc], answer: pretty(key) };
      } },
    { id: 2, title: 'Treble clef reading', level: 'Beginner', targetMs: 4000,
      lesson: 'The treble clef (the curly G clef) curls around the <b>G line</b>, the second line up, which is the G above middle C (G4). From bottom to top the lines are <b>E G B D F</b> ("Every Good Boy Does Fine") and the spaces spell <b>F A C E</b>. Middle C (C4) sits on a short ledger line below the staff. Play the exact key shown: <b>octave matters</b>.',
      visual: { clef: 'treble', notes: ['C4', 'E4', 'G4', 'B4', 'D5', 'F5'], labels: ['C4', 'E', 'G', 'B', 'D', 'F'] },
      pool: ['G4', 'E4', 'C4', 'B4', 'D5', 'F4', 'A4', 'C5', 'D4', 'F5', 'E5', 'G5', 'A5', 'F#4', 'Bb4', 'C#5', 'Eb5'],
      item(key) {
        return { title: 'Play this note (exact octave)', staff: { clef: 'treble', notes: [key] }, sub: 'Treble clef',
          grade: { type: 'window', target: { kind: 'note', pcs: [pcOf(key)], midi: midiOf(key) }, strictOctave: true }, show: [midiOf(key)], answer: pretty(key) };
      } },
    { id: 3, title: 'Bass clef reading', level: 'Beginner', targetMs: 4500,
      lesson: 'The bass clef (the F clef) puts its two dots around the <b>F line</b>, the 4th line up, which is the F below middle C (F3). From bottom to top the lines are <b>G B D F A</b> ("Good Boys Do Fine Always") and the spaces are <b>A C E G</b> ("All Cows Eat Grass"). Middle C sits on a ledger line just <i>above</i> the bass staff. Octave matters.',
      visual: { clef: 'bass', notes: ['G2', 'B2', 'D3', 'F3', 'A3', 'C4'], labels: ['G', 'B', 'D', 'F', 'A', 'C4'] },
      pool: ['F3', 'C3', 'A3', 'G2', 'D3', 'B2', 'E3', 'G3', 'C4', 'A2', 'F2', 'B3', 'E2', 'F#3', 'Bb2', 'C#3', 'Eb3'],
      item(key) {
        return { title: 'Play this note (exact octave)', staff: { clef: 'bass', notes: [key] }, sub: 'Bass clef',
          grade: { type: 'window', target: { kind: 'note', pcs: [pcOf(key)], midi: midiOf(key) }, strictOctave: true }, show: [midiOf(key)], answer: pretty(key) };
      } },
    { id: 4, title: 'Intervals', level: 'Beginner+', targetMs: 6000,
      lesson: 'An <b>interval</b> is the distance between two notes. Count semitones: a minor 3rd is 3, a major 3rd is 4, a perfect 4th is 5, and a perfect 5th is 7. The letter-name count gives the number: C up to E covers C-D-E, three letters, so it is a 3rd. Play the start note and the note above it, <b>together or one after the other</b>.',
      visual: { clef: 'treble', notes: ['C4', 'E4', 'C4', 'G4'], labels: ['M3', '', 'P5', ''] },
      pool: ['C4:P5', 'G4:P5', 'C4:M3', 'F4:M3', 'D4:P4', 'G4:P4', 'D4:m3', 'A4:m3', 'C4:M2', 'E4:M2', 'F4:M6', 'C4:M6', 'E4:m6', 'D4:m7', 'G4:m7', 'D4:P5', 'A4:M3', 'E4:P4'],
      item(key) {
        const [start, iv] = key.split(':'), I = INTERVALS[iv], top = transpose(start, I.semi, I.deg);
        return { title: `Play a ${I.name} up from ${pretty(start.replace(/\d/, ''))}`, big: `${pretty(start.replace(/\d/, ''))} + ${iv}`, sub: 'together or one after another',
          staff: { clef: 'treble', notes: [start], showQuestion: true },
          grade: { type: 'window', target: { kind: 'chord', pcs: [pcOf(start), pcOf(top)], root: null }, windowMs: 4000, sequential: true },
          show: [midiOf(start), midiOf(top)], answer: `${pretty(start)} – ${pretty(top)}`, reveal: { clef: 'treble', notes: [start, top] } };
      } },
    { id: 5, title: 'Major & minor triads', level: 'Intermediate', targetMs: 5000,
      lesson: 'A <b>triad</b> stacks two thirds. A <b>major</b> triad is root, then a major 3rd (+4 semitones), then a perfect 5th (+7): C – E – G. A <b>minor</b> triad lowers the third by one semitone: C – E♭ – G. Any octave or inversion is accepted here. The app checks note names, not which C you use.',
      visual: { clef: 'treble', notes: [['C4', 'E4', 'G4'], ['C4', 'Eb4', 'G4']], labels: ['C', 'Cm'] },
      pool: ['C:maj', 'G:maj', 'F:maj', 'A:min', 'D:min', 'E:min', 'D:maj', 'Bb:maj', 'C:min', 'G:min', 'A:maj', 'E:maj', 'Eb:maj', 'F:min', 'B:min', 'F#:min', 'Ab:maj', 'Db:maj', 'B:maj', 'F#:maj', 'Bb:min', 'Eb:min', 'C#:min', 'G#:min'],
      item(key) {
        const [r, t] = key.split(':'), names = placeChord(r, t);
        return { title: 'Play this chord', big: chordSym(r, t), sub: `${pretty(r)} ${qualOf(t)} · any inversion`,
          grade: { type: 'window', target: { kind: 'chord', pcs: pcsOfNames(names), root: pcOf(r) } }, show: names.map(midiOf), answer: names.map((n) => pretty(n.replace(/\d/, ''))).join(' – '), reveal: { clef: 'treble', notes: names, mode: 'chord' } };
      } },
    { id: 6, title: 'Inversions', level: 'Intermediate', targetMs: 6500,
      lesson: 'An inversion reorders a chord so a different note is <b>lowest</b>. In <b>root position</b> the root is at the bottom (C-E-G). <b>1st inversion</b> puts the 3rd on the bottom (E-G-C). <b>2nd inversion</b> puts the 5th on the bottom (G-C-E). The app listens for your lowest note, so keep the bass note clear and don\'t add a lower one.',
      visual: { clef: 'treble', notes: [['C4', 'E4', 'G4'], ['E4', 'G4', 'C5'], ['G4', 'C5', 'E5']], labels: ['root', '1st', '2nd'] },
      pool: ['C:maj:1', 'C:maj:2', 'G:maj:1', 'F:maj:2', 'A:min:1', 'D:min:2', 'C:maj:0', 'E:min:1', 'G:maj:2', 'F:maj:1', 'D:maj:1', 'A:min:2', 'Bb:maj:1', 'E:min:2', 'D:maj:2', 'G:min:1', 'C:min:2', 'A:maj:1'],
      item(key) {
        const [r, t, inv] = key.split(':'), names = placeChord(r, t, +inv);
        return { title: `Play ${chordSym(r, t)} in ${INV_NAMES[inv]}`, big: chordSym(r, t), sub: `${pretty(r)} ${qualOf(t)} · ${INV_NAMES[inv]}`,
          grade: { type: 'window', target: { kind: 'chord', pcs: pcsOfNames(names), root: pcOf(r), bass: pcOf(names[0]) } },
          show: names.map(midiOf), answer: names.map((n) => pretty(n.replace(/\d/, ''))).join(' – ') + ` (${pretty(names[0].replace(/\d/, ''))} lowest)`, reveal: { clef: 'treble', notes: names, mode: 'chord' } };
      } },
    { id: 7, title: 'Major scales & key signatures', level: 'Intermediate', targetMs: 14000,
      lesson: 'Every major scale follows the step pattern <b>W W H W W W H</b> (W = whole step, 2 semitones; H = half step, 1). Starting on G, that pattern needs an F♯, so G major\'s <b>key signature</b> has one sharp. Sharps are added in the order F C G D A E B, and flats in the order B E A D G C F. Shortcut: with sharps, the key is a half step above the last sharp. With flats, the key is the second-to-last flat.',
      visual: { clef: 'treble', keySig: { sharps: 1 }, notes: scaleNames('G'), labels: ['G', 'A', 'B', 'C', 'D', 'E', 'F♯', 'G'] },
      pool: ['scale:C', 'scale:G', 'ks:G', 'scale:F', 'ks:F', 'scale:D', 'ks:D', 'ks:Bb', 'scale:Bb', 'scale:A', 'ks:A', 'ks:Eb', 'scale:Eb', 'scale:E', 'ks:E', 'ks:Ab', 'ks:B', 'ks:Db'],
      item(key) {
        const [kind, tonic] = key.split(':');
        if (kind === 'scale') {
          const names = scaleNames(tonic);
          return { title: `Play the ${pretty(tonic)} major scale, up one octave`, big: `${pretty(tonic)} major`, sub: '8 notes, one at a time, any octave', targetMs: 16000,
            staff: { clef: 'treble', keySig: KEYSIG[tonic] }, grade: { type: 'notes', seq: names.map(pcOf), labels: names.map((n) => pretty(n.replace(/\d/, ''))) },
            show: names.map(midiOf), answer: names.map((n) => pretty(n.replace(/\d/, ''))).join(' '), reveal: { clef: 'treble', keySig: KEYSIG[tonic], notes: names } };
        }
        return { title: 'Which major key is this? Play its tonic (any octave)', big: '', sub: 'key signature', targetMs: 6000, staff: { clef: 'treble', keySig: KEYSIG[tonic] },
          grade: { type: 'window', target: { kind: 'note', pcs: [pcOf(tonic)] } }, show: [60 + pcOf(tonic)], answer: `${pretty(tonic)} major` };
      } },
    { id: 8, title: 'Seventh chords', level: 'Advanced', targetMs: 6500,
      lesson: 'Add another third on top of a triad to get a <b>seventh chord</b>. <b>Major 7</b> (Cmaj7: C E G B) is a major triad plus a major 7th. <b>Dominant 7</b> (C7: C E G B♭) is a major triad plus a minor 7th. <b>Minor 7</b> (Cm7: C E♭ G B♭) is a minor triad plus a minor 7th. Any voicing works. The 5th may be left out.',
      visual: { clef: 'treble', notes: [['C4', 'E4', 'G4', 'B4'], ['C4', 'E4', 'G4', 'Bb4'], ['C4', 'Eb4', 'G4', 'Bb4']], labels: ['Cmaj7', 'C7', 'Cm7'] },
      pool: ['G:dom7', 'C:maj7', 'D:min7', 'A:min7', 'F:maj7', 'C:dom7', 'E:min7', 'D:dom7', 'G:maj7', 'Bb:maj7', 'F:dom7', 'B:min7', 'A:dom7', 'Eb:maj7', 'G:min7', 'E:dom7', 'C:min7', 'Bb:dom7'],
      item(key) {
        const [r, t] = key.split(':'), names = placeChord(r, t);
        return { title: 'Play this seventh chord', big: chordSym(r, t), sub: `${pretty(r)} ${qualOf(t)}`,
          grade: { type: 'window', target: { kind: 'chord', pcs: pcsOfNames(names), root: pcOf(r) } }, show: names.map(midiOf), answer: names.map((n) => pretty(n.replace(/\d/, ''))).join(' – '), reveal: { clef: 'treble', notes: names, mode: 'chord' } };
      } },
    { id: 9, title: 'Progressions (Roman numerals)', level: 'Advanced', targetMs: 18000,
      lesson: 'Roman numerals name chords by their scale degree in a key. <b>Upper case</b> means major and <b>lower case</b> means minor. In C major, I = C, ii = Dm, IV = F, V = G and vi = Am. The same numerals work in every key, which is why <b>I – IV – V – vi</b> songs can be moved anywhere. Play each chord in turn. Inversions are fine, so try to move as little as possible between chords.',
      visual: { clef: 'treble', keySig: {}, notes: [['C4', 'E4', 'G4'], ['C4', 'F4', 'A4'], ['B3', 'D4', 'G4'], ['C4', 'E4', 'A4']], labels: ['I', 'IV', 'V', 'vi'] },
      pool: ['C:I-IV-V-I', 'G:I-IV-V-I', 'C:I-V-vi-IV', 'F:I-IV-V-I', 'C:I-vi-IV-V', 'G:I-V-vi-IV', 'C:ii-V-I', 'D:I-IV-V-I', 'F:I-V-vi-IV', 'G:I-vi-IV-V', 'D:I-V-vi-IV', 'F:ii-V-I', 'G:ii-V-I', 'Bb:I-IV-V-I', 'D:ii-V-I', 'Bb:I-V-vi-IV'],
      item(key) {
        const [tonic, prog] = key.split(':'), nums = prog.split('-');
        const DEG = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 };
        const chords = nums.map((n) => {
          const [semi, deg] = MAJOR_STEPS[DEG[n]], rootN = transpose(tonic + '4', semi, deg).replace(/\d/, ''), type = n === n.toUpperCase() ? 'maj' : 'min';
          const names = placeChord(rootN, type);
          return { num: n, sym: chordSym(rootN, type), target: { kind: 'chord', pcs: pcsOfNames(names), root: pcOf(rootN) }, names };
        });
        return { title: `Key of ${pretty(tonic)} major: play ${nums.join(' – ')}`, big: nums.join(' – '), sub: `key of ${pretty(tonic)} major`, staff: { clef: 'treble', keySig: KEYSIG[tonic] },
          grade: { type: 'chords', seq: chords.map((c) => c.target), labels: nums, names: chords.map((c) => c.sym) },
          show: chords[0].names.map(midiOf), answer: chords.map((c) => `${c.num}=${c.sym}`).join('  '), chords };
      } },
    { id: 10, title: 'Ear training', level: 'Advanced', targetMs: 4500, ear: true,
      lesson: 'Now listen instead of read. The phone plays an interval or chord, and you tap what you heard. The mic is <b>paused while the prompt plays</b> so the app can\'t grade its own sound. Tips: a <b>major</b> chord sounds bright and a <b>minor</b> one darker. <b>Diminished</b> sounds tense and <b>augmented</b> sounds dreamy and unresolved. For intervals, think of song openings: a P4 is "Here Comes the Bride" and a P5 is "Twinkle Twinkle".',
      visual: { clef: 'treble', notes: [['C4', 'E4', 'G4'], ['C4', 'Eb4', 'G4'], ['C4', 'Eb4', 'Gb4'], ['C4', 'E4', 'G#4']], labels: ['maj', 'min', 'dim', 'aug'] },
      pool: ['tri:maj', 'tri:min', 'int:P5', 'int:M3', 'int:P8', 'int:m3', 'tri:dim', 'int:P4', 'tri:aug', 'int:M2', 'int:M6', 'int:m7'],
      item(key, rnd = Math.random) {
        const [kind, v] = key.split(':'), rootMidi = 55 + Math.floor(rnd() * 10);
        if (kind === 'tri') {
          const iv = D.CHORD_TYPES[v].iv, melodic = rnd() < 0.3;
          return { title: 'What kind of triad?', big: '🔊', sub: melodic ? 'played broken (one note at a time)' : 'played together', ear: true,
            grade: { type: 'choice', options: [['maj', 'Major'], ['min', 'Minor'], ['dim', 'Diminished'], ['aug', 'Augmented']], answer: v, play: { notes: iv.map((i) => rootMidi + i), melodic } },
            show: iv.map((i) => rootMidi + i), answer: qualOf(v) };
        }
        const opts = ['M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'm7', 'P8'];
        return { title: 'Which interval?', big: '🔊', sub: 'played low note, then high note', ear: true,
          grade: { type: 'choice', options: opts.map((o) => [o, INTERVALS[o].name.replace('perfect ', 'P').replace('major ', 'M').replace('minor ', 'm')]), answer: v, play: { notes: [rootMidi, rootMidi + INTERVALS[v].semi], melodic: true } },
          show: [rootMidi, rootMidi + INTERVALS[v].semi], answer: INTERVALS[v].name };
      } },
  ];
  const COMING = [
    { title: 'Rhythm & sight-reading', level: 'Expert', desc: 'Read and play short phrases in time against a metronome.' },
    { title: 'Voice leading', level: 'Expert', desc: 'Connect chords smoothly with common tones and stepwise motion.' },
    { title: 'Extended chords', level: 'Expert', desc: '9ths, 11ths and 13ths, plus altered dominants.' },
    { title: 'Improvisation', level: 'Expert', desc: 'Play over backing progressions using scales and chord tones.' },
  ];

  // ---------------- progress / SRS ----------------
  const PASS = 80, HIST = 20, MIN_FOR_MASTERY = 12, BOX_W = [8, 4, 2, 1, 0.5];
  const today = () => new Date().toLocaleDateString('en-CA');
  function Progress(storage) {
    const KEY = 'pt.progress';
    let data;
    const load = () => { try { data = JSON.parse(storage.getItem(KEY) || 'null'); } catch (e) { data = null; } if (!data) data = { units: {}, days: [], best: 0, total: 0, correct: 0 }; };
    const save = () => storage.setItem(KEY, JSON.stringify(data));
    load();
    const unitData = (id) => (data.units[id] = data.units[id] || { hist: [], items: {}, retry: [], sessions: 0 });
    const unitDef = (id) => UNITS.find((u) => u.id === id);
    function mastery(id) {
      const u = unitData(id), h = u.hist; if (!h.length) return 0;
      const acc = h.filter((x) => x.ok).length / h.length;
      const oks = h.filter((x) => x.ok); const speed = oks.length ? oks.reduce((s, x) => s + Math.max(0.4, Math.min(1, x.target / x.ms)), 0) / oks.length : 0;
      return Math.round(100 * acc * (0.5 + 0.5 * speed) * Math.min(1, h.length / MIN_FOR_MASTERY));
    }
    const unlocked = (id, all) => all || id === 1 || mastery(id - 1) >= PASS || (unitData(id).hist.length > 0);
    function record(id, key, ok, ms, target) {
      const u = unitData(id);
      u.hist.push({ ok, ms: Math.round(ms), target, key }); if (u.hist.length > HIST) u.hist.shift();
      const it = (u.items[key] = u.items[key] || { box: 0, seen: 0, miss: 0 });
      it.seen++;
      if (!ok) { it.miss++; it.box = 0; u.retry.push({ key, wait: 2 }); }      // missed: comes back after 2 other items
      else if (ms <= target) it.box = Math.min(4, it.box + 1);
      else it.box = Math.max(1, it.box);                                        // correct but slow: stays in rotation
      data.total++; if (ok) data.correct++;
      const d = today(); if (!data.days.includes(d)) { data.days.push(d); if (data.days.length > 400) data.days.shift(); }
      save();
    }
    /** adaptive pick: due retries first, then weighted random over an expanding pool */
    function pick(id, lastKey, rnd = Math.random) {
      const u = unitData(id), def = unitDef(id);
      u.retry.forEach((r) => r.wait--);
      const due = u.retry.findIndex((r) => r.wait <= 0 && r.key !== lastKey);
      if (due >= 0) { const k = u.retry.splice(due, 1)[0].key; save(); return k; }
      const learned = def.pool.filter((k) => (u.items[k] || {}).box >= 2).length;
      const size = Math.min(def.pool.length, 5 + learned * 2);
      const cands = def.pool.slice(0, size).filter((k) => k !== lastKey);
      const w = cands.map((k) => { const it = u.items[k]; return it ? BOX_W[it.box] : 6; });
      let r = rnd() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) return cands[i]; }
      return cands[cands.length - 1];
    }
    function dayStreak() {
      const set = new Set(data.days); let n = 0; const d = new Date();
      if (!set.has(today())) d.setDate(d.getDate() - 1);           // streak still alive until end of today
      while (set.has(d.toLocaleDateString('en-CA'))) { n++; d.setDate(d.getDate() - 1); }
      return n;
    }
    function stats(id) {
      const u = unitData(id), h = u.hist, oks = h.filter((x) => x.ok);
      const med = oks.length ? oks.map((x) => x.ms).sort((a, b) => a - b)[oks.length >> 1] : null;
      const weak = Object.entries(u.items).filter(([, it]) => it.miss > 0).sort((a, b) => b[1].miss / b[1].seen - a[1].miss / a[1].seen).slice(0, 3).map(([k]) => k);
      const seen = Object.values(u.items).reduce((s, it) => s + it.seen, 0);
      return { mastery: mastery(id), attempts: seen, acc: h.length ? Math.round(100 * oks.length / h.length) : null, medianMs: med, weak, sessions: u.sessions };
    }
    return { data, mastery, unlocked, record, pick, dayStreak, stats, unitData, save, reset() { storage.removeItem(KEY); load(); Object.assign(this, { data }); }, get raw() { return data; }, PASS };
  }

  const api = { UNITS, COMING, Progress, pretty, parseName, transpose, chordNames, scaleNames, placeChord, INTERVALS, KEYSIG, midiOf, pcOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Curriculum = api;
})(typeof self !== 'undefined' ? self : this);
