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
  const CHORD_DEG = { maj: [0, 2, 4], min: [0, 2, 4], dim: [0, 2, 4], aug: [0, 2, 4], dom7: [0, 2, 4, 6], maj7: [0, 2, 4, 6], min7: [0, 2, 4, 6], m7b5: [0, 2, 4, 6], dim7: [0, 2, 4, 6], sus2: [0, 1, 4], sus4: [0, 3, 4], sus7: [0, 3, 4, 6], six: [0, 2, 4, 5], add9: [0, 2, 4, 8], maj9: [0, 2, 4, 6, 8], dom9: [0, 2, 4, 6, 8], min9: [0, 2, 4, 6, 8] };
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
  const SUFFIX_PRETTY = { m7b5: 'm7♭5', dim7: '°7', dim: '°', aug: '+' };
  const chordSym = (rootBase, type) => pretty(rootBase) + (SUFFIX_PRETTY[type] || D.CHORD_TYPES[type].suffix);
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
  // =====================================================================================
  // Expanded curriculum (v2). Existing unit ids 1–10 are kept so saved progress carries over.
  // =====================================================================================
  function seeded(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const noOct = (n) => n.replace(/-?\d$/, '');
  const pn = (n) => pretty(noOct(n));
  /** diatonic scale (spelled, with octaves) from a tonic name like 'G4', using semitone steps */
  function scaleFrom(tonic, steps, degs) { return steps.map((st, i) => transpose(tonic, st, degs[i])); }
  const MODES = {
    major: [[0, 2, 4, 5, 7, 9, 11, 12], 'major'], natural: [[0, 2, 3, 5, 7, 8, 10, 12], 'natural minor'], harmonic: [[0, 2, 3, 5, 7, 8, 11, 12], 'harmonic minor'],
    melodic: [[0, 2, 3, 5, 7, 9, 11, 12], 'melodic minor (ascending)'], dorian: [[0, 2, 3, 5, 7, 9, 10, 12], 'Dorian'], phrygian: [[0, 1, 3, 5, 7, 8, 10, 12], 'Phrygian'],
    lydian: [[0, 2, 4, 6, 7, 9, 11, 12], 'Lydian'], mixolydian: [[0, 2, 4, 5, 7, 9, 10, 12], 'Mixolydian'], aeolian: [[0, 2, 3, 5, 7, 8, 10, 12], 'Aeolian (natural minor)'],
  };
  const DEG8 = [0, 1, 2, 3, 4, 5, 6, 7];
  const modeScale = (tonicBase, mode) => scaleFrom(tonicBase + (['A', 'B'].includes(tonicBase[0]) ? 3 : 4), MODES[mode][0], DEG8);
  const notesGrade = (names, extra = {}) => ({ type: 'notes', seq: names.map(pcOf), labels: names.map(pn), ...extra });
  const rootOf = (sym) => /^([A-G][#b]?)/.exec(sym)[1];
  /** "Am7", "C/E", "F#m7b5", "Gsus4", "Cadd9", "C6", "G9" → {root, type, bass} */
  function parseSym(sym) {
    const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym); if (!m) throw new Error('bad chord ' + sym);
    const map = { '': 'maj', m: 'min', dim: 'dim', aug: 'aug', 7: 'dom7', maj7: 'maj7', m7: 'min7', m7b5: 'm7b5', dim7: 'dim7', 6: 'six', add9: 'add9', sus2: 'sus2', sus4: 'sus4', '7sus4': 'sus7', maj9: 'maj9', 9: 'dom9', m9: 'min9' };
    const type = map[m[2]]; if (!type) throw new Error('bad chord type ' + sym);
    return { root: m[1], type, bass: m[3] || null };
  }
  function symTarget(sym) {
    const c = parseSym(sym), names = placeChord(c.root, c.type);
    const pcs = [...new Set(names.map(pcOf).concat(c.bass ? [pcOf(c.bass)] : []))];
    return { target: { kind: 'chord', pcs, root: pcOf(c.root), bass: c.bass ? pcOf(c.bass) : undefined }, names, label: pretty(sym).replace('m7♭5', 'm7♭5') };
  }
  const chordsGrade = (syms) => { const t = syms.map(symTarget); return { type: 'chords', seq: t.map((x) => x.target), labels: syms.map((x) => pretty(x)), names: syms.map((x) => pretty(x)) }; };

  // ---- rhythm helpers ----
  function rhythmItem(key, { bpm, tol, title, pitchesFrom }) {
    let [, spec] = /^[^:]+:(.*)$/.exec(key); let ts = [4, 4];
    const tm = /^(\d)\/(\d):(.*)$/.exec(spec); if (tm) { ts = [+tm[1], +tm[2]]; spec = tm[3]; }
    const els = D.parseRhythm(spec), ons = D.rhythmOnsets(els);
    let names = null;
    if (pitchesFrom) { names = pitchesFrom(ons.length); let k = 0; els.forEach((e, i) => { if (!e.rest) { if (i > 0 && els[i - 1].tie) e.name = els[i - 1].name; else e.name = names[k++]; } }); }
    const total = els[els.length - 1].pos + els[els.length - 1].dur;
    return { title, big: '', sub: `${ts[0]}/${ts[1]} · ♩ = ${bpm} · count-in ${ts[1] === 8 ? ts[0] : ts[0]} clicks`,
      staff: { measure: true, els, timeSig: ts, clef: names ? 'treble' : 'perc' },
      grade: { type: 'rhythm', els, onsets: ons.map((o) => ({ pos: o.pos, pc: names ? pcOf(els[o.idx].name) : null })), timeSig: ts, bpm, tol, total, clickUnit: ts[1] === 8 ? 0.5 : 1, pitched: !!names },
      show: names ? names.map(midiOf) : [], answer: names ? names.map(pn).join(' ') : 'Tap Start and play along.', targetMs: 1e9 };
  }
  function melodyEls(names, rnd) {   // simple rhythm for sight-reading displays: quarters, last note half
    const out = []; let pos = 0;
    names.forEach((n, i) => { const last = i === names.length - 1, dur = last ? Math.max(2, 4 - (pos % 4)) : 1, sym = dur >= 4 ? 'w' : dur >= 3 ? 'h' : dur >= 2 ? 'h' : 'q';
      const d = sym === 'w' ? 4 : sym === 'h' ? 2 : 1; out.push({ sym, dot: dur === 3, rest: false, tie: false, dur: dur === 3 ? 3 : d, pos, bar: Math.floor(pos / 4 + 1e-6), name: n }); pos += dur === 3 ? 3 : d; });
    return out;
  }
  function genMelody(rnd, scale, len, maxLeap, startIdx, endOnTonic = true) {
    let i = startIdx; const out = [i];
    for (let k = 1; k < len; k++) {
      let step; do { step = Math.floor(rnd() * (2 * maxLeap + 1)) - maxLeap; } while (step === 0 || i + step < 0 || i + step >= scale.length);
      i += step; out.push(i);
    }
    if (endOnTonic) { const t = scale.findIndex((n, j) => j % 7 === 0 && Math.abs(j - out[out.length - 2]) <= Math.max(2, maxLeap)); if (t >= 0) out[out.length - 1] = t; }
    return out.map((j) => scale[j]);
  }
  const C_SCALE_2OCT = (tonic) => scaleFrom(tonic, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

  const NEW_UNITS = [
    { id: 35, title: 'Practising effectively', level: 'Beginner', selfCheck: true,
      lesson: '<b>Sit</b> centred on middle C, with your elbows a little in front of your body and your forearms level with the keys. <b>Practise</b> 10–20 minutes a day; little and often beats one long session. <b>Go slow</b>: play a passage slowly enough to get it right three times in a row, then speed up a little. <b>Isolate</b>: practise hands separately first, and only the hard bar. <b>Tip:</b> use a metronome, and record yourself once a week.',
      checklist: ['Bench height: forearms level with the keys, sitting near the front edge', 'Fingers curved like holding a ball; wrists loose', 'A daily 10-minute slot set aside (e.g. after dinner)', 'Plan: warm-up (5-finger pattern), one new skill, one piece'],
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'F4', 'G4'], labels: ['1', '2', '3', '4', '5'] } },
    { id: 11, title: 'Hand position & five-finger patterns', level: 'Beginner', targetMs: 9000,
      lesson: 'Fingers are numbered <b>1 = thumb</b> to <b>5 = pinky</b> in both hands. In <b>C position</b>, the right-hand thumb sits on middle C and each finger covers one white key: C D E F G. Keep the fingers curved, play on the fingertips, and don\'t let the knuckles collapse. Play the pattern up and back down evenly, one finger per key. <b>Tip:</b> the left hand is a mirror image, with the pinky on C below middle C.',
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'F4', 'G4'], labels: ['1', '2', '3', '4', '5'] },
      pool: ['C:up', 'G:up', 'C:skip', 'F:up', 'D:up', 'G:skip', 'Am:up', 'C:wave', 'Dm:up', 'E:up', 'F:skip', 'Em:up', 'A:up', 'D:wave'],
      item(key) {
        const [k, pat] = key.split(':'), minor = k.endsWith('m'), tonic = (minor ? k.slice(0, -1) : k);
        const five = scaleFrom(tonic + (tonic >= 'A' && tonic <= 'B' ? 3 : 4), minor ? [0, 2, 3, 5, 7] : [0, 2, 4, 5, 7], [0, 1, 2, 3, 4]);
        const P = { up: [0, 1, 2, 3, 4, 3, 2, 1, 0], skip: [0, 2, 4, 2, 0], wave: [0, 1, 2, 1, 2, 3, 4, 3, 2, 1, 0] }[pat];
        const names = P.map((i) => five[i]);
        return { title: `${pretty(tonic)} ${minor ? 'minor' : 'major'} five-finger pattern`, big: '', sub: 'one note at a time, fingers shown under the notes', targetMs: names.length * 900,
          staff: { clef: 'treble', notes: names, labels: P.map((i) => String(i + 1)) }, grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' ') };
      } },
    { id: 12, title: 'Rhythm I: beats, quarter/half/whole notes, rests', level: 'Beginner', targetMs: 1e9, rhythm: true,
      lesson: '<b>Count out loud</b> "1 2 3 4" steadily with the clicks. A <b>quarter note</b> (♩) gets 1 beat, a <b>half note</b> 2, and a <b>whole note</b> 4. A <b>rest</b> means silence for that many beats. The top number of the time signature is the beats per bar. Tap <b>Start</b>, listen to the count-in, then play any key on every note, staying silent on rests. <b>Tip:</b> lift your finger between notes. The app grades when each note starts.',
      visual: { measure: true, rhythm: 'q q h | w', timeSig: [4, 4] },
      pool: ['r1:q q q q', 'r1:h h', 'r1:q q h', 'r1:h q q', 'r1:w', 'r1:q qr q qr', 'r1:q h q', 'r1:q q q qr', 'r1:3/4:q q q', 'r1:h hr', 'r1:qr q qr q', 'r1:3/4:h q', 'r1:q q h | w', 'r1:h q q | h h', 'r1:3/4:q h', 'r1:q qr h | q q q qr'],
      item(key) { return rhythmItem(key, { bpm: 72, tol: 140, title: 'Play this rhythm (any key)' }); } },
    { id: 13, title: 'Grand staff & ledger lines', level: 'Beginner', targetMs: 4500,
      lesson: 'The <b>grand staff</b> joins the treble staff (usually the right hand) and the bass staff (usually the left hand). <b>Middle C</b> sits on one ledger line between them, written either just below the treble staff or just above the bass staff. It is the same key either way. <b>Ledger lines</b> extend the staff: count lines and spaces up or down from a note you know (C6 is 2 ledger lines above the treble staff, and C2 is 2 below the bass). Octave matters.',
      visual: { grand: true, notes: ['C2', 'G2', 'C4', 'G4', 'C6'], labels: ['C2', 'G2', 'C4', 'G4', 'C6'] },
      pool: ['C4:t', 'C4:b', 'D4:t', 'B3:b', 'A5:t', 'E2:b', 'C6:t', 'C2:b', 'A3:t', 'E4:b', 'B5:t', 'D2:b', 'G5:t', 'F2:b', 'B3:t', 'D4:b'],
      item(key) {
        const [n, st] = key.split(':');
        return { title: 'Play this note (exact octave)', staff: { grand: true, notes: [{ name: n, staff: st === 't' ? 'treble' : 'bass' }] }, sub: st === 't' ? 'treble staff' : 'bass staff',
          grade: { type: 'window', target: { kind: 'note', pcs: [pcOf(n)], midi: midiOf(n) }, strictOctave: true }, show: [midiOf(n)], answer: pretty(n) };
      } },
    { id: 14, title: 'Sharps, flats, naturals & key signatures', level: 'Beginner', targetMs: 5000,
      lesson: 'A <b>♯ sharp</b> means play the very next key to the right (usually black), and a <b>♭ flat</b> the next key to the left. A <b>♮ natural</b> cancels a sharp or flat. A <b>key signature</b> at the start of the line applies to that letter in <b>every octave</b> for the whole piece. An accidental written in the music lasts until the bar line. <b>Tip:</b> before you play, say the key signature out loud ("F sharp").',
      visual: { clef: 'treble', keySig: { sharps: 1 }, notes: ['F4', 'Fn4', 'G4'], labels: ['F♯', 'F♮', 'G'] },
      pool: ['G:F5', 'F:B4', 'C:F#4', 'C:Bb4', 'D:C5', 'G:Fn4', 'Bb:E4', 'F:Bn4', 'C:Eb5', 'A:G4', 'Eb:A4', 'D:F4', 'Bb:B3', 'E:D5', 'C:C#5', 'Ab:D5'],
      item(key) {
        const [ks, written] = key.split(':'), p = /^([A-G])(#|b|n)?(\d)$/.exec(written), sig = KEYSIG[ks] || {};
        let acc = p[2] === '#' ? 1 : p[2] === 'b' ? -1 : 0;
        if (!p[2]) { const sh = ['F', 'C', 'G', 'D', 'A', 'E', 'B'].slice(0, sig.sharps || 0), fl = ['B', 'E', 'A', 'D', 'G', 'C', 'F'].slice(0, sig.flats || 0); if (sh.includes(p[1])) acc = 1; if (fl.includes(p[1])) acc = -1; }
        const real = p[1] + (acc > 0 ? '#' : acc < 0 ? 'b' : '') + p[3];
        return { title: 'Play this note (exact octave)', staff: { clef: 'treble', keySig: sig, notes: [written] }, sub: ks === 'C' ? 'no key signature' : `key signature: ${sig.sharps ? sig.sharps + ' sharp' + (sig.sharps > 1 ? 's' : '') : sig.flats + ' flat' + (sig.flats > 1 ? 's' : '')}`,
          grade: { type: 'window', target: { kind: 'note', pcs: [pcOf(real)], midi: midiOf(real) }, strictOctave: true }, show: [midiOf(real)], answer: pretty(real) };
      } },
    { id: 15, title: 'Dynamics & touch', level: 'Beginner', targetMs: 8000,
      lesson: '<b>Loud and soft</b> come from key speed, not from pressing harder at the bottom: a fast drop is <i>f</i> (forte, loud) and a slow drop is <i>p</i> (piano, soft). <b>Staccato</b> (a dot over the note) means short and bouncy, so release right away. <b>Legato</b> (a curved line) means smooth: don\'t lift one finger until the next key is down. The mic measures loudness and note length. <b>Tip:</b> keep the piano\'s volume knob fixed while you do this unit.',
      visual: { clef: 'treble', notes: ['C4', 'C4', 'E4', 'F4', 'G4'], labels: ['p', 'f', 'cresc.', '', ''] },
      pool: ['pf', 'fp', 'stacc', 'legato', 'cresc', 'dim'],
      item(key) {
        const T = {
          pf: ['Play one note softly (p), then the same note loudly (f)', 'p → f', 'second note at least twice as loud'],
          fp: ['Play one note loudly (f), then softly (p)', 'f → p', 'second note at most half as loud'],
          stacc: ['Play C D E F staccato: short and detached', 'staccato ·', '4 short notes, lifting right away'],
          legato: ['Play C D E F G legato: smooth, no gaps', 'legato ⁀', '5 connected notes, never lifting early'],
          cresc: ['Play C D E F getting louder (crescendo)', 'cresc. <', 'each note louder than the last'],
          dim: ['Play F E D C getting softer (diminuendo)', 'dim. >', 'each note softer than the last'],
        }[key];
        const n = { pf: 2, fp: 2, stacc: 4, legato: 5, cresc: 4, dim: 4 }[key];
        const names = { pf: ['C4', 'C4'], fp: ['C4', 'C4'], stacc: ['C4', 'D4', 'E4', 'F4'], legato: ['C4', 'D4', 'E4', 'F4', 'G4'], cresc: ['C4', 'D4', 'E4', 'F4'], dim: ['F4', 'E4', 'D4', 'C4'] }[key];
        return { title: T[0], big: T[1], sub: T[2], staff: { clef: 'treble', notes: names, labels: key === 'pf' ? ['p', 'f'] : key === 'fp' ? ['f', 'p'] : key === 'stacc' ? ['·', '·', '·', '·'] : null },
          grade: { type: 'expr', mode: key, count: n }, show: names.map(midiOf), answer: T[2] };
      } },
    { id: 16, title: 'Rhythm II: eighths, dotted notes, ties, 3/4', level: 'Intermediate', targetMs: 1e9, rhythm: true,
      lesson: 'Split the beat: count <b>"1 & 2 & 3 & 4 &"</b>. <b>Eighth notes</b> (♫) fall on each number and each "&". A <b>dot</b> adds half the note\'s value again: a dotted quarter lasts 1½ beats and is usually followed by an eighth. A <b>tie</b> joins two notes into one, so <i>don\'t</i> replay the second one. In <b>3/4</b> (waltz time) count 1 2 3. <b>Tip:</b> keep counting the "&"s, even in long notes.',
      visual: { measure: true, rhythm: 'q e e q. e', timeSig: [4, 4] },
      pool: ['r2:e e e e q q', 'r2:q e e q q', 'r2:q. e q q', 'r2:q. e h', 'r2:e e q e e q', 'r2:h. q', 'r2:3/4:h.', 'r2:3/4:q. e q', 'r2:3/4:e e e e q', 'r2:q~ e e q q', 'r2:h~ e e q', 'r2:e e q q. e', 'r2:q e e h | q. e h', 'r2:3/4:q e e q | h.'],
      item(key) { return rhythmItem(key, { bpm: 72, tol: 120, title: 'Play this rhythm (any key)' }); } },
    { id: 17, title: 'Minor scales', level: 'Intermediate', targetMs: 15000,
      lesson: 'Every major key has a <b>relative minor</b> that shares its key signature and starts on the 6th note: A minor goes with C major, E minor with G, D minor with F. <b>Natural minor</b> uses just the key signature. <b>Harmonic minor</b> raises the 7th note. <b>Melodic minor</b> (going up) raises the 6th and 7th. <b>Fingering (RH):</b> A, E and D minor use 1-2-3, thumb under, 1-2-3-4-5, like C major. For keys that start on a black key, start on finger 2, 3 or 4 so your thumb lands on white keys.',
      visual: { clef: 'treble', notes: modeScale('A', 'harmonic'), labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G♯', 'A'] },
      pool: ['natural:A', 'harmonic:A', 'natural:E', 'natural:D', 'harmonic:E', 'melodic:A', 'harmonic:D', 'natural:G', 'natural:C', 'harmonic:G', 'melodic:D', 'natural:B', 'harmonic:C', 'melodic:E', 'natural:F#', 'harmonic:B'],
      item(key) {
        const [mode, t] = key.split(':'), names = modeScale(t, mode);
        return { title: `Play ${pretty(t)} ${MODES[mode][1]}, up one octave`, big: `${pretty(t)} ${mode === 'natural' ? 'minor' : MODES[mode][1].split(' ')[0] + ' minor'}`, sub: '8 notes, one at a time',
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), reveal: { clef: 'treble', notes: names } };
      } },
    { id: 18, title: 'Arpeggios', level: 'Intermediate', targetMs: 9000,
      lesson: 'An <b>arpeggio</b> plays a chord one note at a time: 1 – 3 – 5 – 8 and back down. <b>RH fingering</b> for one octave is 1-2-3-5 going up and 5-3-2-1 coming down. Keep the wrist level and let it glide sideways. Don\'t stretch with the fingers. Arpeggios train your hand to "know" every chord shape. <b>Tip:</b> once one octave is easy, try two, passing the thumb under after finger 3.',
      visual: { clef: 'treble', notes: ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'], labels: ['1', '2', '3', '5', '3', '2', '1'] },
      pool: ['C:maj', 'A:min', 'G:maj', 'E:min', 'F:maj', 'D:min', 'D:maj', 'B:min', 'A:maj', 'Bb:maj', 'G:min', 'E:maj', 'C:min', 'Eb:maj', 'F#:min', 'F:min'],
      item(key) {
        const [r, t] = key.split(':'), tri = placeChord(r, t), top = parseName(tri[0]).base + (parseName(tri[0]).oct + 1);
        const names = [tri[0], tri[1], tri[2], top, tri[2], tri[1], tri[0]];
        return { title: `${chordSym(r, t)} arpeggio, up and down`, big: chordSym(r, t), sub: '1 – 3 – 5 – 8 – 5 – 3 – 1', targetMs: 9000,
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), reveal: { clef: 'treble', notes: names, labels: ['1', '2', '3', '5', '3', '2', '1'] } };
      } },
    { id: 22, title: 'Smooth chord changes (voice leading)', level: 'Intermediate', targetMs: 16000,
      lesson: 'Don\'t jump your whole hand to each new chord in root position. <b>Keep the shared note</b> and move the other fingers to the <b>nearest</b> chord notes. In C, play I (C-E-G) → IV as C-F-A (the C stays) → I → V as B-D-G (the G stays). The bass note of each voicing is shown, and the app checks your lowest note. <b>Tip:</b> watch your hand. It should barely move.',
      visual: { chords: true, clef: 'treble', groups: [['C4', 'E4', 'G4'], ['C4', 'F4', 'A4'], ['C4', 'E4', 'G4'], ['B3', 'D4', 'G4'], ['C4', 'E4', 'G4']], labels: ['I', 'IV', 'I', 'V', 'I'] },
      pool: ['C:a', 'G:a', 'F:a', 'C:b', 'D:a', 'Am:a', 'G:b', 'Bb:a', 'F:b', 'Em:a', 'A:a', 'Dm:a'],
      item(key) {
        const [k, v] = key.split(':'), minor = k.endsWith('m'), ton = minor ? k.slice(0, -1) : k;
        const rel = (semi, deg) => noOct(transpose(ton + '4', semi, deg));
        let syms, nums;
        if (minor) { const iv = rel(5, 3), V = rel(7, 4), leading = rel(11, 6); syms = [`${ton}m`, `${iv}m/${ton}`, `${V}/${leading}`, `${ton}m`]; nums = ['i', 'iv', 'V', 'i']; }
        else if (v === 'a') { const IV = rel(5, 3), V = rel(7, 4), seven = rel(11, 6); syms = [ton, `${IV}/${ton}`, ton, `${V}/${seven}`, ton]; nums = ['I', 'IV', 'I', 'V', 'I']; }
        else { const vi = rel(9, 5), IV = rel(5, 3), V = rel(7, 4), third = rel(4, 2), seven = rel(11, 6); syms = [ton, `${vi}m/${third}`, `${IV}/${rel(9, 5)}`, `${V}/${seven}`, ton]; nums = ['I', 'vi', 'IV', 'V', 'I']; }
        const g = chordsGrade(syms);
        return { title: `Key of ${pretty(k.replace('m', ' minor'))}: ${nums.join(' – ')} with smooth voicings`, big: nums.join(' – '), sub: 'play the bass note shown after each slash as the lowest note',
          grade: { ...g, labels: nums, names: syms.map((x) => pretty(x)) }, chips: syms.map((x) => pretty(x)), show: symTarget(syms[0]).names.map(midiOf), answer: syms.map((x) => pretty(x)).join('  ') };
      } },
    { id: 19, title: 'Left-hand accompaniment patterns', level: 'Intermediate', targetMs: 9000,
      lesson: 'Your left hand turns a chord into a groove. <b>Broken chord:</b> root-5th-3rd-5th, or 1-3-5-3. <b>Alberti bass:</b> low-high-middle-high (C-G-E-G), and keep the hand still over the chord shape. <b>Root–fifth:</b> alternate the root and the 5th (great for pop and country). <b>Stride:</b> a low bass note on beats 1 and 3 and the chord on 2 and 4, so the hand jumps. Play what\'s shown in any octave. <b>Tip:</b> practise at half speed until the pattern runs on autopilot.',
      visual: { clef: 'bass', notes: ['C3', 'G3', 'E3', 'G3', 'C3', 'G3', 'E3', 'G3'], labels: ['C', 'G', 'E', 'G', '', '', '', ''] },
      pool: ['broken:C', 'alberti:C', 'r5:C', 'broken:G', 'alberti:G', 'r5:F', 'stride:C', 'alberti:F', 'broken:Am', 'r5:G', 'stride:G', 'alberti:Dm', 'broken:F', 'stride:F'],
      item(key) {
        const [pat, k] = key.split(':'), minor = k.endsWith('m'), r = minor ? k.slice(0, -1) : k, type = minor ? 'min' : 'maj';
        const tri = chordNames(r + 3, type), [R, T, F] = tri;
        if (pat === 'stride') {
          const low = parseName(R).base + 2, low5 = parseName(F).base + (parseName(F).oct - 1);
          const syms = [`${R.replace(/\d/, '')}`, `${noOct(R)}${minor ? 'm' : ''}`, `${noOct(F)}`, `${noOct(R)}${minor ? 'm' : ''}`];
          const seq = [{ kind: 'chord', pcs: [pcOf(R)], bass: pcOf(R) }, symTarget(syms[1]).target, { kind: 'chord', pcs: [pcOf(F)], bass: pcOf(F) }, symTarget(syms[3]).target];
          return { title: `Stride in ${pretty(k)}: bass – chord – bass – chord`, big: '', sub: 'low root, chord, low 5th, chord', staff: { clef: 'bass', notes: [low, ...tri, low5, ...tri].slice(0, 8) },
            grade: { type: 'chords', seq, labels: ['bass ' + pn(R), 'chord', 'bass ' + pn(F), 'chord'], names: [pn(R), chordSym(r, type), pn(F), chordSym(r, type)] }, show: [midiOf(low), ...tri.map(midiOf)], answer: `${pn(R)}, ${chordSym(r, type)}, ${pn(F)}, ${chordSym(r, type)}` };
        }
        const P = { broken: [R, T, F, T, R, T, F, T], alberti: [R, F, T, F, R, F, T, F], r5: [R, F, R, F] }[pat];
        const nameP = { broken: 'Broken chord', alberti: 'Alberti bass', r5: 'Root–fifth' }[pat];
        return { title: `${nameP} in ${pretty(k)}`, big: '', sub: 'one note at a time, in the left hand', staff: { clef: 'bass', notes: P },
          grade: notesGrade(P), show: tri.map(midiOf), answer: P.map(pn).join(' ') };
      } },
    { id: 20, title: 'Hands together: melody + chord', level: 'Intermediate', targetMs: 14000,
      lesson: 'This is how songs are played. The <b>left hand</b> holds a chord or bass note while the <b>right hand</b> plays the melody on top. Practise each hand alone first, then together <b>very slowly</b>. Line up each new chord with the melody note that starts it. The app checks that your lowest note is the chord\'s root (the LH) and listens for each melody note over it. <b>Tip:</b> play the melody a little louder than the chord.',
      visual: { grand: true, notes: [{ name: 'E4' }, { name: 'D4' }, { name: 'C4', staff: 'treble' }, { name: 'C3' }], labels: null },
      pool: ['C:I:3-2-1', 'C:I:5-4-3', 'G:I:1-2-3', 'F:I:3-2-1', 'C:I-V:3-4|2-7', 'G:I-IV:3-2|1-1', 'C:I-IV:5-6|6-4', 'F:I-V:1-2|7-2', 'D:I:3-2-1', 'C:I-vi:3-2|1-3', 'Am:i:5-4-3', 'G:I-V:5-4|2-7'],
      item(key) {
        const [k, chords, mel] = key.split(':'), minor = k.endsWith('m'), ton = minor ? k.slice(0, -1) : k;
        const sc = scaleFrom(ton + 4, minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12], DEG8);
        const DEG = { I: 0, i: 0, ii: 1, IV: 3, V: 4, vi: 5 };
        const nums = chords.split('-'), groups = mel.split('|');
        const seq = [], labels = [], names = [], tnotes = [];
        nums.forEach((num, ci) => {
          const d = DEG[num], root = noOct(sc[d]), type = num === num.toUpperCase() ? 'maj' : 'min';
          const chord = chordNames(root + 3, type);
          groups[ci].split('-').forEach((deg) => {
            let n = sc[(+deg - 1) % 7]; if (+deg === 7) { const p7 = parseName(n); n = p7.base + (p7.oct - 1); }  // leading tone just below the tonic
            const mp = pcOf(n), pcs = [...new Set([...chord.map(pcOf), mp])];
            seq.push({ kind: 'chord', pcs, root: pcOf(root), bass: pcOf(root) }); labels.push(`${pn(n)} (${chordSym(root, type)})`); names.push(pn(n)); tnotes.push(n);
          });
        });
        const firstChord = chordNames(noOct(sc[DEG[nums[0]]]) + 3, nums[0] === nums[0].toUpperCase() ? 'maj' : 'min');
        return { title: `Key of ${pretty(k)}: LH ${nums.map((n) => chordSym(noOct(sc[DEG[n]]), n === n.toUpperCase() ? 'maj' : 'min')).join(' → ')}, RH melody`, big: '', sub: 'hold the LH chord; play each RH note over it',
          staff: { grand: true, notes: [...tnotes.map((n) => ({ name: n, staff: 'treble' }))], extraBass: firstChord }, grade: { type: 'chords', seq, labels, names }, show: [...firstChord, ...tnotes].map(midiOf), answer: labels.join('  ') };
      } },
    { id: 21, title: 'Sight-reading I', level: 'Intermediate', targetMs: 8000,
      lesson: 'Before you play, take <b>5 seconds</b> to look: find the first note, the lowest and highest notes, and whether the line moves by <b>step</b> (next line or space) or by <b>skip</b>. Then read <b>by shape</b>: up a step, down a skip. Don\'t name every note. Keep going even after a mistake. These short melodies stay inside C position. <b>Tip:</b> keep your eyes on the page, not your hands.',
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'D4', 'C4'], labels: ['', 'step', 'step', 'step', ''] },
      pool: Array.from({ length: 16 }, (_, i) => 'sr1:' + (i + 1)),
      item(key) {
        const n = +key.split(':')[1], rnd = seeded(key);
        const scale = ['C4', 'D4', 'E4', 'F4', 'G4'];
        const names = genMelody(rnd, scale, n <= 8 ? 5 : 6, n <= 8 ? 1 : 2, Math.floor(rnd() * 3));
        return { title: 'Sight-read this melody', big: '', sub: n <= 8 ? 'steps only · C position' : 'steps and skips · C position', staff: { measure: true, clef: 'treble', els: melodyEls(names), timeSig: [4, 4] },
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), targetMs: names.length * 1300 };
      } },
    { id: 23, title: 'Using the sustain pedal', level: 'Intermediate', selfCheck: true,
      lesson: 'The right pedal (sustain) keeps notes ringing after you let go. Use <b>legato pedaling</b> so chords join without blurring: play a chord, <b>then</b> press the pedal. At the next chord, <b>lift the pedal as you play it and press it again right after</b> ("up-down" just after the new chord). Keep your heel on the floor and use the ball of the foot. Change the pedal whenever the harmony changes. The mic can\'t see your foot, so check yourself by ear: chords should sound connected but not muddy.',
      checklist: ['Heel stays on the floor; pedal pressed with the ball of the foot', 'C – F – G – C chords: pedal changes just after each new chord, with no gaps and no blur', 'Same exercise with eyes closed, listening for gaps or mud', 'Half-pedal: lift only halfway to thin out a muddy sound'],
      visual: { chords: true, clef: 'treble', groups: [['C4', 'E4', 'G4'], ['C4', 'F4', 'A4'], ['B3', 'D4', 'G4'], ['C4', 'E4', 'G4']], labels: ['Ped.', '↑↓', '↑↓', '↑↓'] } },
    { id: 24, title: 'Rhythm III: syncopation, sixteenths, 6/8', level: 'Advanced', targetMs: 1e9, rhythm: true,
      lesson: '<b>Syncopation</b> puts notes on the "&" instead of the beat. Keep the beat steady in your body and let the notes fall in between. <b>Sixteenths</b> split each beat into four: count "1 e & a". In <b>6/8</b> there are two big beats per bar, each made of three eighths: count "1 2 3 4 5 6" and feel 1 and 4. The count-in clicks eighth notes. <b>Tip:</b> tap your foot on the beat while you play.',
      visual: { measure: true, rhythm: 'e q e q q', timeSig: [4, 4] },
      pool: ['r3:e q e q q', 'r3:q e q e q', 'r3:s s s s q q q', 'r3:6/8:q e q e', 'r3:e q q q e', 'r3:q s s s s h', 'r3:6/8:q. q.', 'r3:e. s q e. s q', 'r3:6/8:e e e q.', 'r3:e q e e q e', 'r3:e s s q e s s q', 'r3:6/8:q e e e e', 'r3:q e q e q | e q e h'],
      item(key) { const six = key.includes('6/8'); return rhythmItem(key, { bpm: six ? 60 : 66, tol: 100, title: 'Play this rhythm (any key)' }); } },
    { id: 25, title: 'Sight-reading II', level: 'Advanced', targetMs: 10000,
      lesson: 'Longer melodies now, in either clef, with key signatures and skips up to a 5th. Look at the <b>key signature</b> first and say its sharps or flats. Then spot <b>patterns</b>: scale runs, chord outlines and repeated notes. Read <b>ahead</b>: while you play one note, your eyes should already be on the next. <b>Tip:</b> if you miss a note, keep going. Fluency matters more than perfection here.',
      visual: { clef: 'bass', keySig: { flats: 1 }, notes: ['F3', 'A3', 'C4', 'Bb3', 'A3'], labels: null },
      pool: Array.from({ length: 18 }, (_, i) => 'sr2:' + (i + 1)),
      item(key) {
        const n = +key.split(':')[1], rnd = seeded(key);
        const keys = ['G', 'F', 'D', 'C', 'Bb', 'A'], k = keys[n % keys.length], bass = n % 3 === 0;
        const scale = C_SCALE_2OCT(k + (bass ? 2 : (k >= 'A' && k <= 'B' ? 3 : 4)));
        const lo = bass ? scale.findIndex((x) => midiOf(x) >= 43) : scale.findIndex((x) => midiOf(x) >= 62);
        const range = scale.slice(Math.max(0, lo), Math.max(0, lo) + 9);
        const names = genMelody(rnd, range, n <= 9 ? 6 : 8, n <= 9 ? 3 : 4, Math.floor(rnd() * 5), true);
        return { title: 'Sight-read this melody', big: '', sub: `${pretty(k)} major · ${bass ? 'bass' : 'treble'} clef`, staff: { measure: true, clef: bass ? 'bass' : 'treble', keySig: KEYSIG[k], els: melodyEls(names), timeSig: [4, 4] },
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), targetMs: names.length * 1300 };
      } },
    { id: 26, title: 'Chord symbols & lead sheets', level: 'Advanced', targetMs: 16000,
      lesson: 'A <b>lead sheet</b> gives the melody plus chord symbols, and you make up the accompaniment. Reading symbols: the letter is the root, <b>m</b> = minor, <b>7</b> = dominant 7th, <b>maj7</b>, <b>m7</b>, <b>°</b> = diminished. A <b>slash</b> (C/E) means play C with E as the lowest note. The simplest approach: LH plays the root (or the slash note), RH plays the chord in whatever inversion is closest. <b>Tip:</b> say each chord name one bar ahead.',
      visual: { chords: true, clef: 'treble', groups: [['C4', 'E4', 'G4'], ['C4', 'E4', 'A4'], ['C4', 'F4', 'A4'], ['B3', 'D4', 'G4']], labels: ['C', 'Am/C', 'F', 'G/B'] },
      pool: ['C|Am|F|G', 'C|Am7|Dm7|G7', 'F|C/E|Dm|Bb', 'G|D/F#|Em|C', 'Am|F|C|G', 'D|Bm|G|A7', 'Cmaj7|A7|Dm7|G7', 'Bb|Gm7|Cm7|F7', 'E|C#m|A|B7', 'C|C7|F|Fm', 'G|B7|Em|Edim', 'F|Dm7|Gm7|C7'],
      item(key) {
        const syms = key.split('|'), g = chordsGrade(syms);
        return { title: 'Play these chord symbols, one per bar', big: '', sub: 'root in the bass (or the slash note); any voicing', chips: syms.map((x) => pretty(x)), leadsheet: true,
          grade: g, show: symTarget(syms[0]).names.map(midiOf), answer: syms.map((x) => `${pretty(x)} = ${symTarget(x).names.map(pn).join('-')}`).join('  ') };
      } },
    { id: 27, title: 'Transposition', level: 'Advanced', targetMs: 12000,
      lesson: '<b>Transposing</b> means playing the same tune starting on a different note, for example to suit a singer. Find the <b>new first note</b>, then copy the <b>shape</b>: same steps, same skips, same direction. Use the new key\'s sharps and flats. Thinking in <b>scale degrees</b> (1-2-3-1) makes it automatic. <b>Tip:</b> sing the tune in your head as you play.',
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'C4', 'G4', 'A4', 'B4', 'G4'], labels: ['1', '2', '3', '1', '1', '2', '3', '1'] },
      pool: ['m1:G', 'm2:F', 'm3:G', 'm1:F', 'm4:G', 'm2:D', 'm5:F', 'm6:G', 'm3:D', 'm4:F', 'm1:D', 'm6:F', 'm5:Bb', 'm2:A', 'm3:Eb', 'm6:D'],
      item(key) {
        const MEL = { m1: ['C4', 'D4', 'E4', 'C4'], m2: ['E4', 'F4', 'G4', 'E4', 'C4'], m3: ['C4', 'E4', 'G4', 'E4', 'C4'], m4: ['G4', 'F4', 'E4', 'D4', 'C4'], m5: ['C4', 'D4', 'E4', 'F4', 'G4', 'E4', 'C4'], m6: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4'] };
        const [m, k] = key.split(':'), src = MEL[m];
        const semi = (pcOf(k) + 12) % 12, deg = 'CDEFGAB'.indexOf(k[0]);
        const names = src.map((n) => transpose(n, semi, deg));
        return { title: `This tune is in C. Play it in ${pretty(k)} major`, big: `→ ${pretty(k)}`, sub: `start on ${pn(names[0])}`, staff: { clef: 'treble', notes: src },
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), reveal: { clef: 'treble', keySig: KEYSIG[k], notes: names } };
      } },
    { id: 28, title: 'Playing by ear', level: 'Advanced', targetMs: 9000, earPlay: true,
      lesson: 'Listen to the short melody (the mic pauses while it plays), then play it back. You are told the <b>first note</b>. Hum it first and ask yourself: did it go <b>up or down</b>? By a <b>step</b> or a <b>jump</b>? Most simple tunes move by step and end on the home note. Replay as often as you like. <b>Tip:</b> this is the skill behind playing songs you hear on the radio, and it grows fast with daily practice.',
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'C4'], labels: ['1', '↑', '↑', '↓'] },
      pool: Array.from({ length: 15 }, (_, i) => 'pbe:' + (i + 1)),
      item(key) {
        const n = +key.split(':')[1], rnd = seeded(key), k = n <= 7 ? 'C' : n <= 11 ? 'G' : 'F';
        const scale = C_SCALE_2OCT(k + (k === 'G' ? 3 : 4)).slice(k === 'G' ? 3 : 0, (k === 'G' ? 3 : 0) + 8);
        const len = Math.min(6, 3 + Math.floor(n / 3)), names = genMelody(rnd, scale, len, n <= 5 ? 1 : 2, [0, 2, 4][Math.floor(rnd() * 3)]);
        return { title: 'Listen, then play it back', big: '🔊', sub: `${pretty(k)} major · starts on ${pn(names[0])}`, play: { notes: names.map(midiOf), melodic: true, gap: 0.55 },
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), reveal: { clef: 'treble', notes: names } };
      } },
    { id: 29, title: 'Extended chords: sus, add9, 6ths, 9ths', level: 'Advanced', targetMs: 7000,
      lesson: 'Here are some modern-sounding colours. <b>sus2 / sus4</b>: swap the 3rd for the 2nd or 4th (Csus4 = C-F-G); it wants to resolve. <b>add9</b>: a triad plus the 9th, which is the 2nd an octave up (Cadd9 = C-E-G-D). <b>6</b>: a triad plus the 6th (C6 = C-E-G-A). <b>9th chords</b>: a 7th chord plus the 9th. When there are too many notes for one hand, <b>leave out the 5th</b> or let the LH take the root. Any voicing counts.',
      visual: { chords: true, clef: 'treble', groups: [['C4', 'F4', 'G4'], ['C4', 'E4', 'G4', 'D5'], ['C4', 'E4', 'G4', 'A4']], labels: ['Csus4', 'Cadd9', 'C6'] },
      pool: ['C:sus4', 'D:sus2', 'G:sus4', 'C:add9', 'F:add9', 'C:six', 'G:sus7', 'A:sus2', 'F:six', 'C:maj9', 'G:dom9', 'D:min9', 'G:add9', 'F:maj9', 'A:min9', 'D:dom9'],
      item(key) {
        const [r, t] = key.split(':'), names = chordNames(r + (r >= 'F' ? 3 : 4), t);
        return { title: 'Play this chord', big: chordSym(r, t), sub: `${pretty(r)} ${D.CHORD_TYPES[t].name} · any voicing`,
          grade: { type: 'window', target: { kind: 'chord', pcs: [...new Set(names.map(pcOf))], root: pcOf(r) } }, show: names.map(midiOf), answer: names.map(pn).join(' – '), reveal: { clef: 'treble', notes: names, mode: 'chord' } };
      } },
    { id: 30, title: 'Blues scale & 12-bar blues', level: 'Advanced', targetMs: 14000,
      lesson: 'The <b>blues scale</b> is 1 – ♭3 – 4 – ♯4 – 5 – ♭7 – 8 (in C: C E♭ F F♯ G B♭ C). The <b>12-bar blues</b> uses three dominant-7th chords: | I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7 |. Play the LH root or a root–fifth pattern and the RH chord, one chord per bar. <b>Tip:</b> once the form is in your fingers, improvise with the blues scale over it.',
      visual: { clef: 'treble', notes: ['C4', 'Eb4', 'F4', 'F#4', 'G4', 'Bb4', 'C5'], labels: ['1', '♭3', '4', '♯4', '5', '♭7', '8'] },
      pool: ['scale:C', 'scale:A', '12:C', 'scale:G', 'scale:F', '12:F', 'scale:E', '12:G', 'scale:D', '12:A', 'scale:Bb', '12:D'],
      item(key) {
        const [kind, k] = key.split(':');
        if (kind === 'scale') {
          const names = scaleFrom(k + ((k >= 'A' && k <= 'B') ? 3 : 4), [0, 3, 5, 6, 7, 10, 12], [0, 2, 3, 3, 4, 6, 7]);
          return { title: `${pretty(k)} blues scale, up one octave`, big: `${pretty(k)} blues`, sub: '1 ♭3 4 ♯4 5 ♭7 8', grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), reveal: { clef: 'treble', notes: names } };
        }
        const I = k, IV = noOct(transpose(k + 4, 5, 3)), V = noOct(transpose(k + 4, 7, 4));
        const form = [I, I, I, I, IV, IV, I, I, V, IV, I, V].map((x) => x + '7');
        return { title: `12-bar blues in ${pretty(k)}: one chord per bar`, big: '', sub: 'dominant 7ths · root in the bass helps', chips: form.map((x) => pretty(x)), leadsheet: true, targetMs: 30000,
          grade: chordsGrade(form), show: symTarget(form[0]).names.map(midiOf), answer: `I7=${pretty(I)}7  IV7=${pretty(IV)}7  V7=${pretty(V)}7` };
      } },
    { id: 31, title: 'Improvisation basics', level: 'Expert', targetMs: 25000,
      lesson: 'Improvising is just making choices inside a safe set of notes. Hold the LH chord (or play root–fifth). With the RH, use <b>only the scale shown</b>: the pentatonic and blues scales have no "wrong" notes over their chord. Make a short <b>motif</b> (3–4 notes), repeat it, then vary it. Leave space. <b>End on the root.</b> The app checks that you stay in the scale (at least 85% of notes) and finish on the home note after at least 12 notes.',
      visual: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'], labels: ['C', 'D', 'E', 'G', 'A', 'C'] },
      pool: ['pent:C', 'minpent:A', 'blues:C', 'pent:G', 'minpent:E', 'blues:A', 'pent:F', 'minpent:D', 'blues:G', 'pent:D'],
      item(key) {
        const [sc, r] = key.split(':');
        const S = { pent: [[0, 2, 4, 7, 9], 'major pentatonic'], minpent: [[0, 3, 5, 7, 10], 'minor pentatonic'], blues: [[0, 3, 5, 6, 7, 10], 'blues scale'] }[sc];
        const pcs = S[0].map((i) => (pcOf(r) + i) % 12);
        const names = S[0].map((i, k) => noOct(transpose(r + 4, i, sc === 'pent' ? [0, 1, 2, 4, 5][k] : [0, 2, 3, 3, 4, 6][k])));
        return { title: `Improvise with ${pretty(r)} ${S[1]}`, big: `${pretty(r)} ${S[1].split(' ')[0]}`, sub: `notes: ${names.map((n) => pretty(n)).join(' ')} · at least 12 notes, end on ${pretty(r)}`, targetMs: 25000,
          grade: { type: 'improv', scale: pcs, root: pcOf(r), count: 12 }, show: S[0].map((i) => 60 + ((pcOf(r) + i) % 12)), answer: names.map((n) => pretty(n)).join(' ') };
      } },
    { id: 32, title: 'Modes', level: 'Expert', targetMs: 15000,
      lesson: 'Think of modes as small tweaks to scales you already know. <b>Dorian</b> = natural minor with a raised 6th; use it over m7 chords (D Dorian is all white keys from D). <b>Mixolydian</b> = major with a ♭7, for dominant 7th chords and rock. <b>Lydian</b> = major with a ♯4, a dreamy film sound. <b>Phrygian</b> = minor with a ♭2, a Spanish flavour. <b>Tip:</b> name the one note that differs from the major or minor scale, then play.',
      visual: { clef: 'treble', notes: modeScale('D', 'dorian'), labels: ['D', 'E', 'F', 'G', 'A', 'B', 'C', 'D'] },
      pool: ['dorian:D', 'mixolydian:G', 'dorian:A', 'mixolydian:C', 'lydian:F', 'phrygian:E', 'dorian:E', 'mixolydian:D', 'lydian:C', 'phrygian:A', 'dorian:G', 'lydian:G', 'mixolydian:F', 'aeolian:D'],
      item(key) {
        const [mode, t] = key.split(':'), names = modeScale(t, mode);
        return { title: `Play ${pretty(t)} ${MODES[mode][1]}, up one octave`, big: `${pretty(t)} ${MODES[mode][1].split(' ')[0]}`, sub: '8 notes, one at a time',
          grade: notesGrade(names), show: names.map(midiOf), answer: names.map(pn).join(' '), reveal: { clef: 'treble', notes: names } };
      } },
    { id: 33, title: 'Rhythm & sight-reading together', level: 'Expert', targetMs: 1e9, rhythm: true,
      lesson: 'Now combine both skills: read the <b>pitches</b> and play them <b>in time</b> after the count-in. Keep the pulse going even after a mistake, because stopping is the most common sight-reading habit to break. Look one note ahead. The app grades both when each note starts and which note it is. <b>Tip:</b> before you start, tap the rhythm once on your knee.',
      visual: { measure: true, rhythm: 'q e e q q', timeSig: [4, 4], clef: 'treble', names: ['C4', 'D4', 'E4', 'F4', 'G4'] },
      pool: ['rs:q q q q', 'rs:q e e q q', 'rs:h q q', 'rs:q q h', 'rs:q. e q q', 'rs:e e q q q', 'rs:q e e h', 'rs:3/4:q q q', 'rs:3/4:h q', 'rs:q q e e q', 'rs:q. e h', 'rs:e e e e h'],
      item(key) {
        const rnd = seeded(key);
        return rhythmItem(key, { bpm: 66, tol: 130, title: 'Play these notes in rhythm', pitchesFrom: (n) => genMelody(rnd, ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], n, 2, Math.floor(rnd() * 3), false) });
      } },
    { id: 34, title: 'Jazz ii–V–I & seventh-chord voicings', level: 'Expert', targetMs: 14000,
      lesson: 'The <b>ii–V–I</b> drives most jazz and pop standards: in C it is Dm7 – G7 – Cmaj7. Its secret is <b>guide tones</b>: the 3rd and 7th of each chord move by half or whole step (the C of Dm7 falls to the B of G7, and the F stays as G7\'s 7th). Use <b>shell voicings</b>: LH root, RH 3rd + 7th. In minor it becomes iiø7 – V7 – i (Dm7♭5 – G7 – Cm). Any voicing is accepted, but aim for the smallest hand movement.',
      visual: { chords: true, clef: 'treble', groups: [['D4', 'F4', 'A4', 'C5'], ['D4', 'F4', 'G4', 'B4'], ['C4', 'E4', 'G4', 'B4']], labels: ['Dm7', 'G7', 'Cmaj7'] },
      pool: ['C', 'F', 'Bb', 'G', 'Am', 'D', 'Eb', 'Dm', 'A', 'Em', 'Ab', 'Gm'],
      item(key) {
        const minor = key.endsWith('m'), t = minor ? key.slice(0, -1) : key;
        const ii = noOct(transpose(t + 4, 2, 1)), V = noOct(transpose(t + 4, 7, 4));
        const syms = minor ? [`${ii}m7b5`, `${V}7`, `${t}m`] : [`${ii}m7`, `${V}7`, `${t}maj7`];
        return { title: `ii–V–I in ${pretty(t)} ${minor ? 'minor' : 'major'}`, big: syms.map((x) => pretty(x).replace('m7b5', 'm7♭5')).join(' – '), sub: 'one chord at a time · any voicing', chips: syms.map((x) => pretty(x).replace('m7b5', 'm7♭5')), leadsheet: true,
          grade: chordsGrade(syms), show: symTarget(syms[0]).names.map(midiOf), answer: syms.map((x) => `${pretty(x)} = ${symTarget(x).names.map(pn).join('-')}`).join('  ') };
      } },
    { id: 36, title: 'Performance polish', level: 'Expert', selfCheck: true,
      lesson: 'Make it music. <b>Balance</b>: the melody sings above the accompaniment, so play the LH softer. <b>Phrasing</b>: shape each phrase like a sentence, rising toward the middle and relaxing at the end. <b>Pedal</b> with your ears and change it with the harmony. <b>Memorise</b> in sections (chords, then melody, then both). <b>Perform</b>: play through slips without stopping, and record a run-through each week.',
      checklist: ['Melody clearly louder than accompaniment in one piece', 'A piece recorded start to finish without stopping', 'One piece memorised by sections', 'Played for someone (or a video call)'],
      visual: { grand: true, notes: [{ name: 'E5' }, { name: 'D5' }, { name: 'C5' }, { name: 'C3' }], labels: null } },
  ];
  NEW_UNITS.forEach((u) => UNITS.push(u));
  const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  const ORDER = [35, 11, 1, 12, 2, 3, 13, 14, 15, 4, 16, 5, 6, 7, 17, 18, 9, 22, 19, 20, 21, 23, 8, 24, 25, 26, 27, 10, 28, 29, 30, 31, 32, 33, 34, 36];
  const LEVEL_OF = { 1: 'Beginner', 2: 'Beginner', 3: 'Beginner', 4: 'Intermediate', 5: 'Intermediate', 6: 'Intermediate', 7: 'Intermediate', 9: 'Intermediate', 8: 'Advanced', 10: 'Advanced' };
  UNITS.forEach((u) => { if (LEVEL_OF[u.id]) u.level = LEVEL_OF[u.id]; });
  UNITS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const COMING = [];


  // ---------------- progress / SRS ----------------
  const PASS = 80, HIST = 20, MIN_FOR_MASTERY = 12, BOX_W = [8, 4, 2, 1, 0.5];
  const today = () => new Date().toLocaleDateString('en-CA');
  function Progress(storage) {
    const KEY = 'pt.progress';
    let data;
    const load = () => { try { data = JSON.parse(storage.getItem(KEY) || 'null'); } catch (e) { data = null; } if (!data) data = { units: {}, days: [], best: 0, total: 0, correct: 0 }; if (!data.v) { data.v = 2; } };  // v1 (10-unit) progress is compatible: unit ids were kept
    const save = () => storage.setItem(KEY, JSON.stringify(data));
    load();
    const unitData = (id) => (data.units[id] = data.units[id] || { hist: [], items: {}, retry: [], sessions: 0 });
    const unitDef = (id) => UNITS.find((u) => u.id === id);  // eslint-disable-line
    function mastery(id) {
      const u = unitData(id), h = u.hist;
      if (unitDef(id) && unitDef(id).selfCheck) return u.selfDone ? 100 : 0;
      if (!h.length) return 0;
      const acc = h.filter((x) => x.ok).length / h.length;
      const oks = h.filter((x) => x.ok); const speed = oks.length ? oks.reduce((s, x) => s + Math.max(0.4, Math.min(1, x.target / x.ms)), 0) / oks.length : 0;
      return Math.round(100 * acc * (0.5 + 0.5 * speed) * Math.min(1, h.length / MIN_FOR_MASTERY));
    }
    function unlocked(id, all) {
      if (all) return true;
      const i = ORDER.indexOf(id); if (i <= 0) return true;
      const u = unitData(id);
      if (u.hist.length || u.selfDone) return true;
      // already past this point (e.g. progress from before new units were inserted): don't lock it
      for (let k = i + 1; k < ORDER.length; k++) { const v = data.units[ORDER[k]]; if (v && (v.hist.length || v.selfDone)) return true; }
      let j = i - 1; while (j > 0 && unitDef(ORDER[j]).selfCheck) j--;      // guidance units never block
      const prev = ORDER[j];
      if (unitDef(id).selfCheck) return unlocked(prev, false);
      return unitDef(prev).selfCheck ? unlocked(prev, false) : mastery(prev) >= PASS;
    }
    function markDone(id, done = true) { unitData(id).selfDone = done; const d = today(); if (!data.days.includes(d)) data.days.push(d); save(); }
    const itemBox = (id, key) => ((unitData(id).items[key] || {}).box || 0);
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
    return { data, mastery, unlocked, markDone, itemBox, record, pick, dayStreak, stats, unitData, save, reset() { storage.removeItem(KEY); load(); Object.assign(this, { data }); }, get raw() { return data; }, PASS };
  }

  const api = { UNITS, COMING, LEVELS, ORDER, Progress, parseSym, symTarget, seeded, MODES, modeScale, pretty, parseName, transpose, chordNames, scaleNames, placeChord, INTERVALS, KEYSIG, midiOf, pcOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Curriculum = api;
})(typeof self !== 'undefined' ? self : this);
