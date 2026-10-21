// Piano Path: step-by-step lesson cards (content + display-only diagrams).
// Each unit has a few short cards. A card can show a keyboard / hand / staff / beat diagram,
// offer a demo ("Listen") and a mic-graded "Try it" micro-step.
(function (root) {
  'use strict';
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = (n) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const pretty = (s) => String(s).replace(/([A-G])#/g, '$1♯').replace(/([A-G])b/g, '$1♭');

  // ---------- diagrams (display only) ----------
  /** keys: "C4:1 D4:2" (note:label, label optional) or array; opts.heard {midi, ok} flashes a key */
  function keyboard(keys, opts = {}) {
    const list = (Array.isArray(keys) ? keys : String(keys || '').split(/\s+/).filter(Boolean)).map((k) => { const [n, l] = k.split(':'); return { m: midiOf(n), l: l == null ? '' : l.replace(/_/g, ' ') }; });
    const ms = list.map((k) => k.m).concat(opts.heard ? [opts.heard.midi] : []);
    let lo = opts.from ? midiOf(opts.from) : Math.min(60, ...ms), hi = opts.to ? midiOf(opts.to) : Math.max(71, ...ms);
    lo -= ((lo % 12) + 12) % 12; hi += 11 - (((hi % 12) + 12) % 12);
    while (hi - lo < 23) { if (lo > 36) lo -= 12; else hi += 12; }
    while (hi - lo > 35 && !opts.from) { if (Math.max(...ms) < hi - 11) hi -= 12; else if (Math.min(...ms) > lo + 11) lo += 12; else break; }
    const map = new Map(list.map((k) => [k.m, k.l]));
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const W = 360 / whites.length, H = 92;
    let s = `<svg class="kb2" viewBox="0 0 360 ${H + 16}" xmlns="http://www.w3.org/2000/svg">`;
    const fillOf = (m, base) => (opts.heard && opts.heard.midi === m ? (opts.heard.ok ? '#3ecf8e' : '#ff6b6b') : map.has(m) ? '#6ea8ff' : base);
    whites.forEach((m, i) => {
      s += `<rect x="${i * W}" y="0" width="${W - 1}" height="${H}" rx="3" fill="${fillOf(m, '#f4f5f8')}" stroke="#222"/>`;
      if (map.has(m) && map.get(m)) s += `<text x="${i * W + W / 2}" y="${H - 9}" class="kl">${map.get(m)}</text>`;
      if (m === 60) s += `<text x="${i * W + W / 2}" y="${H + 13}" class="km">middle C</text>`;
      else if (m % 12 === 0 && opts.cLabels !== false) s += `<text x="${i * W + W / 2}" y="${H + 13}" class="kc">C</text>`;
    });
    whites.forEach((m, i) => {
      if (m + 1 > hi || !isBlack(m + 1)) return; const x = i * W + W * 0.66, m1 = m + 1;
      s += `<rect x="${x}" y="0" width="${W * 0.68}" height="${H * 0.6}" rx="2" fill="${fillOf(m1, '#1b1e26')}" stroke="#111"/>`;
      if (map.has(m1) && map.get(m1)) s += `<text x="${x + W * 0.34}" y="${H * 0.6 - 7}" class="kl kb">${map.get(m1)}</text>`;
    });
    return s + '</svg>';
  }
  /** a simple hand: fingers numbered 1 (thumb) to 5 (pinky); on = highlighted fingers; names = label under each finger */
  function hand(side = 'R', on = [], names = {}) {
    const order = side === 'R' ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
    const len = { 1: 44, 2: 66, 3: 74, 4: 68, 5: 54 };
    let s = `<svg class="hand" viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg"><text x="110" y="146" class="hl">${side === 'R' ? 'Right hand' : 'Left hand'} (palm down)</text>`;
    s += `<rect x="38" y="84" width="144" height="46" rx="20" fill="#e7c9a9"/>`;
    order.forEach((f, i) => {
      const x = 40 + i * 30 + (f === 1 ? (side === 'R' ? -14 : 14) : 0), h = len[f], y = (f === 1 ? 112 : 92) - h, hot = on.includes(f);
      s += `<rect x="${x}" y="${y}" width="22" height="${h + 8}" rx="11" fill="${hot ? '#6ea8ff' : '#e7c9a9'}" stroke="#a5866a"/>`;
      s += `<text x="${x + 11}" y="${y + 18}" class="hf">${f}</text>`;
      if (names[f]) s += `<text x="${x + 11}" y="${y - 6}" class="hn">${pretty(names[f])}</text>`;
    });
    return s + '</svg>';
  }
  /** beat grid: r = rhythm string (see detector.parseRhythm), n = beats shown, sub = 2 shows "&" */
  function beats(r, opts = {}) {
    const D = root.PianoDetect || (typeof require !== 'undefined' ? require('./detector.js') : null);
    const els = D.parseRhythm(r), total = els.reduce((a, e) => Math.max(a, e.pos + e.dur), 0), n = opts.n || Math.ceil(total), sub = opts.sub || 1;
    const W = 340 / n, x0 = 10; let s = `<svg class="beats2" viewBox="0 0 360 86" xmlns="http://www.w3.org/2000/svg">`;
    for (let b = 0; b < n; b++) s += `<rect x="${x0 + b * W + 1}" y="6" width="${W - 2}" height="40" rx="6" fill="${b === 0 ? '#273150' : '#222838'}"/>`;
    els.forEach((e) => { if (e.rest) { s += `<text x="${x0 + (e.pos + e.dur / 2) * W}" y="31" class="br">rest</text>`; return; }
      s += `<rect x="${x0 + e.pos * W + 4}" y="14" width="${Math.max(8, e.dur * W - 8)}" height="24" rx="5" fill="#6ea8ff"/>`; });
    const counts = opts.counts || (sub === 3 ? Array.from({ length: n * 3 }, (_, i) => String(i + 1)) : Array.from({ length: n * sub }, (_, i) => (i % sub ? (sub === 4 ? ['', 'e', '&', 'a'][i % 4] : '&') : String(i / sub + 1))));
    counts.forEach((c, i) => (s += `<text x="${x0 + (i + 0.5) * W * n / counts.length}" y="68" class="bc${/^\d/.test(c) ? '' : ' bs'}">${c}</text>`));
    return s + '</svg>';
  }

  // ---------- practice tips (short, shown around the app) ----------
  const TIPS = [
    '10 minutes every day beats one hour on Sunday.',
    'Go slow enough to get it right 3 times in a row. Then speed up a little.',
    'Stuck on a bit? Practise just that bit, one hand at a time.',
    'Curved fingers, loose wrists. Shake your hands out if they feel tight.',
    'Made a mistake? Keep going. Stopping becomes a habit.',
    'Record yourself once a week. You will hear things you miss while playing.',
    'Sit so your elbows are a bit in front of your body, forearms level with the keys.',
    'Finish each session with something you can already play well. End on a win.',
  ];

  // ---------- lesson content ----------
  // try types: any | note {n, exact} | seq {n:[..], exact} | chord {n:[..], bass} | pulse {count} | pf | hold | rhythm {r, bpm} | self
  const L = {};
  L[35] = [
    { h: 'Welcome! Let’s play your first note', p: 'Sit in the middle of the keyboard. Put your phone on the music stand or the piano lid, close to the speakers.<br><br>Now press <b>any key</b>. Let the phone hear it.', kbd: '', try: { t: 'any', say: 'Press any key on your piano' } },
    { h: 'The black keys are your map', p: 'Black keys come in groups of <b>2</b> and <b>3</b>. Find a group of <b>two</b> black keys near the middle of your piano.', kbd: 'C#4:2 D#4:2 F#4:3 G#4:3 A#4:3', tip: 'Every white key can be found from the black-key groups.' },
    { h: 'Find middle C', p: '<b>C</b> is the white key just <b>left of the two black keys</b>. The C nearest the middle of your piano is called <b>middle C</b>.<br>Play middle C now.', kbd: 'C4:C', demo: { n: ['C4'] }, try: { t: 'note', n: 'C4', exact: true, say: 'Play middle C' } },
    { h: 'Finger numbers', p: 'Each finger has a number. Your <b>thumb is 1</b>, your <b>pinky is 5</b>. Both hands use the same numbers.<br>Put your right thumb on middle C. Curve your fingers like you are holding a ball.', hand: { side: 'R', on: [1], names: { 1: 'C' } } },
    { h: 'Your first three notes', p: 'Thumb on <b>C</b>, finger 2 on <b>D</b>, finger 3 on <b>E</b>. Play them one at a time: <b>C, D, E</b>.', kbd: 'C4:1 D4:2 E4:3', hand: { side: 'R', on: [1, 2, 3], names: { 1: 'C', 2: 'D', 3: 'E' } }, demo: { n: ['C4', 'D4', 'E4'] }, try: { t: 'seq', n: ['C4', 'D4', 'E4'], say: 'Play C, D, E' } },
    { h: 'Your first tune!', p: 'These five notes play the start of “Mary Had a Little Lamb”: <b>E D C D E E E</b>. Use fingers <b>3 2 1 2 3 3 3</b>.', kbd: 'C4:1 D4:2 E4:3', demo: { n: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4'], gap: 0.45 }, try: { t: 'seq', n: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4'], say: 'Play E D C D E E E' }, tip: 'Go as slowly as you like. Right notes matter more than speed.' },
  ];
  L[11] = [
    { h: 'The C position', p: 'Right thumb on middle C. Fingers 1 2 3 4 5 rest on <b>C D E F G</b>, one finger per key.', kbd: 'C4:1 D4:2 E4:3 F4:4 G4:5', hand: { side: 'R', on: [1, 2, 3, 4, 5], names: { 1: 'C', 2: 'D', 3: 'E', 4: 'F', 5: 'G' } } },
    { h: 'Up the hill', p: 'Play <b>C D E F G</b>, one finger after another. Keep the fingers curved and play on the fingertips.', kbd: 'C4:1 D4:2 E4:3 F4:4 G4:5', demo: { n: ['C4', 'D4', 'E4', 'F4', 'G4'] }, try: { t: 'seq', n: ['C4', 'D4', 'E4', 'F4', 'G4'], say: 'Play C D E F G' } },
    { h: 'And back down', p: 'Now from the pinky back to the thumb: <b>G F E D C</b>.', kbd: 'C4:1 D4:2 E4:3 F4:4 G4:5', try: { t: 'seq', n: ['G4', 'F4', 'E4', 'D4', 'C4'], say: 'Play G F E D C' } },
    { h: 'The left hand is a mirror', p: 'Left hand: <b>pinky (5) on the C below middle C</b>, thumb (1) on G. Play <b>C D E F G</b> with fingers 5 4 3 2 1.', kbd: 'C3:5 D3:4 E3:3 F3:2 G3:1', hand: { side: 'L', on: [1, 2, 3, 4, 5], names: { 5: 'C', 4: 'D', 3: 'E', 2: 'F', 1: 'G' } }, try: { t: 'seq', n: ['C3', 'D3', 'E3', 'F3', 'G3'], say: 'LH: play C D E F G' } },
    { h: 'Move the whole hand', p: 'The same shape works anywhere. Put your right thumb on <b>G</b> and play G A B C D. In the drill, the first note tells you where your thumb goes.', kbd: 'G4:1 A4:2 B4:3 C5:4 D5:5', try: { t: 'seq', n: ['G4', 'A4', 'B4', 'C5', 'D5'], say: 'Play G A B C D' } },
  ];
  L[1] = [
    { h: 'Only 7 letter names', p: 'White keys are named <b>A B C D E F G</b>, then it starts again. The same pattern repeats all the way along the piano.', kbd: 'C4:C D4:D E4:E F4:F G4:G A4:A B4:B' },
    { h: 'C and F', p: '<b>C</b> is left of the <b>two</b> black keys. <b>F</b> is left of the <b>three</b> black keys. Play any F.', kbd: 'C4:C F4:F', try: { t: 'note', n: 'F4', say: 'Play any F' } },
    { h: 'Find G', p: 'Count up from C: C, D, E, F, <b>G</b>. G sits between the 1st and 2nd black key of the group of three. Play any G.', kbd: 'G4:G', try: { t: 'note', n: 'G4', say: 'Play any G' } },
    { h: 'Black keys: sharps and flats', p: 'A <b>sharp ♯</b> is the key just to the <b>right</b>. A <b>flat ♭</b> is the key just to the <b>left</b>. So the black key between C and D is both C♯ and D♭. Play C♯.', kbd: 'C4:C C#4:C♯ D4:D', try: { t: 'note', n: 'C#4', say: 'Play C♯ (any octave)' } },
    { h: 'One more', p: 'B♭ is the key just left of B. That is the top black key of the group of three. Play B♭.', kbd: 'Bb4:B♭ B4:B', try: { t: 'note', n: 'Bb4', say: 'Play B♭' }, tip: 'In this drill, any octave counts.' },
  ];
  L[12] = [
    { h: 'The beat', p: 'Music has a steady pulse, like a clock ticking. We count it: <b>1 2 3 4, 1 2 3 4</b>. Listen, then count along out loud.', beats: { r: 'q q q q' }, demo: { r: 'q q q q', bpm: 72 } },
    { h: 'Play a steady beat', p: 'Play <b>any key</b> 4 times, evenly, like a ticking clock. Count “1 2 3 4” as you play.', beats: { r: 'q q q q' }, try: { t: 'pulse', count: 4, say: 'Play 4 even notes (any key)' } },
    { h: 'Long notes', p: 'A quarter note ♩ is <b>1 beat</b>. A half note 𝅗𝅥 (hollow) is <b>2 beats</b>: play on 1 and keep holding through 2. A whole note is <b>4 beats</b>.', staff: { measure: true, rhythm: 'q q h', timeSig: [4, 4] }, beats: { r: 'q q h' }, demo: { r: 'q q h', bpm: 72 } },
    { h: 'Try it with the count-in', p: 'Tap Start. You hear 4 clicks (“1 2 3 4”), then play: <b>short, short, long</b>.', staff: { measure: true, rhythm: 'q q h', timeSig: [4, 4] }, try: { t: 'rhythm', r: 'q q h', bpm: 70, say: 'Play the rhythm after the count-in' } },
    { h: 'Rests = silence', p: 'A <b>rest</b> means don’t play, but keep counting. Lift your finger and wait for the next beat.', staff: { measure: true, rhythm: 'q qr q qr', timeSig: [4, 4] }, beats: { r: 'q qr q qr' }, try: { t: 'rhythm', r: 'q qr q qr', bpm: 70, say: 'Play on 1 and 3, silent on 2 and 4' } },
  ];
  L[2] = [
    { h: 'The treble staff', p: 'Music is written on 5 lines. Notes higher on the staff are higher on the piano. The <b>treble clef</b> is used for the right hand.', staff: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'F4', 'G4'] } },
    { h: 'Middle C on the staff', p: 'Middle C sits on a little extra line <b>below</b> the staff. Play it.', staff: { clef: 'treble', notes: ['C4'] }, kbd: 'C4:C', try: { t: 'note', n: 'C4', exact: true, say: 'Play this C (middle C)' } },
    { h: 'Step by step', p: 'Each line and each space is the next white key. The bottom line is <b>E</b>, just above middle C. Play it.', staff: { clef: 'treble', notes: ['E4'] }, kbd: 'E4:E', try: { t: 'note', n: 'E4', exact: true, say: 'Play this E' } },
    { h: 'A trick for the lines', p: 'The lines, bottom to top, are <b>E G B D F</b>: “<b>E</b>very <b>G</b>ood <b>B</b>oy <b>D</b>oes <b>F</b>ine”. The spaces spell <b>F A C E</b>. The space note here is A.', staff: { clef: 'treble', notes: ['A4'] }, kbd: 'A4:A', try: { t: 'note', n: 'A4', exact: true, say: 'Play this A' } },
    { h: 'Octave matters here', p: 'The drill wants the <b>exact</b> key, not any A. Use middle C as your anchor and count up.', tip: 'Read the note, then find it. Don’t guess by trying keys.' },
  ];
  L[3] = [
    { h: 'The bass staff', p: 'The <b>bass clef</b> is for low notes, usually the left hand. Its two dots sit around the <b>F</b> line.', staff: { clef: 'bass', notes: ['F3'] }, kbd: 'F3:F', try: { t: 'note', n: 'F3', exact: true, say: 'Play this F (below middle C)' } },
    { h: 'Middle C from below', p: 'Here middle C sits on a little line <b>above</b> the staff. It’s the same middle C.', staff: { clef: 'bass', notes: ['C4'] }, kbd: 'C4:C', try: { t: 'note', n: 'C4', exact: true, say: 'Play middle C' } },
    { h: 'Bass lines and spaces', p: 'Lines, bottom to top: <b>G B D F A</b> (“<b>G</b>ood <b>B</b>oys <b>D</b>o <b>F</b>ine <b>A</b>lways”). Spaces: <b>A C E G</b> (“<b>A</b>ll <b>C</b>ows <b>E</b>at <b>G</b>rass”). The bottom line is G.', staff: { clef: 'bass', notes: ['G2'] }, kbd: 'G2:G', try: { t: 'note', n: 'G2', exact: true, say: 'Play this low G' } },
    { h: 'The C in the middle space', p: 'The 2nd space is C, the C below middle C (one octave = 8 white keys lower).', staff: { clef: 'bass', notes: ['C3'] }, kbd: 'C3:C C4:middle', try: { t: 'note', n: 'C3', exact: true, say: 'Play this C' } },
  ];
  L[13] = [
    { h: 'Two staffs together', p: 'The <b>grand staff</b> joins treble (right hand) and bass (left hand). Middle C sits right between them.', staff: { grand: true, notes: [{ name: 'C4', staff: 'treble' }, { name: 'C4', staff: 'bass' }] }, kbd: 'C4:C' },
    { h: 'Ledger lines', p: 'Notes above or below the staff get short extra lines, called <b>ledger lines</b>. Count from a note you know. This is A, two ledger lines above the treble staff.', staff: { clef: 'treble', notes: ['A5'] }, kbd: 'A5:A', try: { t: 'note', n: 'A5', exact: true, say: 'Play this high A' } },
    { h: 'Low ledger notes', p: 'Below the bass staff: this E is one ledger line down, the lowest E most songs use.', staff: { clef: 'bass', notes: ['E2'] }, kbd: 'E2:E', try: { t: 'note', n: 'E2', exact: true, say: 'Play this low E' } },
    { h: 'Same key, two spellings', p: 'D just above middle C can be written in either staff. Play it.', staff: { grand: true, notes: [{ name: 'D4', staff: 'treble' }] }, kbd: 'D4:D', try: { t: 'note', n: 'D4', exact: true, say: 'Play this D' } },
  ];
  L[14] = [
    { h: 'Sharp, flat, natural', p: '♯ = one key <b>right</b>. ♭ = one key <b>left</b>. ♮ (natural) cancels them and means the plain white key.', kbd: 'F4:F F#4:F♯ Bb4:B♭ B4:B' },
    { h: 'Try a sharp', p: 'This is F♯ above middle C. Find F, then go one key to the right.', staff: { clef: 'treble', notes: ['F#4'] }, kbd: 'F#4:F♯', try: { t: 'note', n: 'F#4', exact: true, say: 'Play this F♯' } },
    { h: 'Key signature', p: 'Sharps or flats at the start of the line are the <b>key signature</b>. They apply to <b>every</b> note with that letter. Here F is always F♯, even without a ♯ next to it.', staff: { clef: 'treble', notes: ['F5'], keySig: 'G' }, kbd: 'F#5:F♯', try: { t: 'note', n: 'F#5', exact: true, say: 'Play this note (look at the key signature!)' } },
    { h: 'A natural cancels it', p: 'With ♮ in front, play the plain white key, F.', staff: { clef: 'treble', notes: ['Fn4'], keySig: 'G' }, kbd: 'F4:F', try: { t: 'note', n: 'F4', exact: true, say: 'Play this F natural' }, tip: 'Before you play, say the key signature out loud: “F sharp”.' },
  ];
  L[15] = [
    { h: 'Soft and loud', p: '<b>p</b> (piano) means soft, <b>f</b> (forte) means loud. Loudness comes from <b>how fast</b> the key goes down. Press slowly for soft, quickly for loud.', demo: { n: ['C4', 'C4'], vel: [0.25, 1] } },
    { h: 'Soft, then loud', p: 'Play middle C <b>very softly</b>, then <b>loudly</b>. Make the difference big!', kbd: 'C4:C', try: { t: 'pf', say: 'Play a soft C, then a loud C' }, tip: 'Keep your piano’s volume the same during this unit.' },
    { h: 'Staccato: short and bouncy', p: 'A dot over a note means <b>staccato</b>. Bounce off the key right away, like touching something hot.', kbd: 'C4:1 D4:2 E4:3 F4:4' },
    { h: 'Legato: smooth', p: 'A curved line means <b>legato</b>. Don’t lift one finger until the next key is down, so there are no gaps.', kbd: 'C4:1 D4:2 E4:3 F4:4 G4:5', demo: { n: ['C4', 'D4', 'E4', 'F4', 'G4'], gap: 0.45, dur: 0.6 } },
  ];
  L[4] = [
    { h: 'Distance between notes', p: 'An <b>interval</b> is how far apart two notes are. Count the letters, including both ends: C→E is C-D-E = a <b>3rd</b>.', kbd: 'C4:1 D4:2 E4:3' },
    { h: 'A 5th', p: 'C up to G is C-D-E-F-G = a <b>5th</b>. With your right hand: thumb on C, pinky on G. Play them together.', kbd: 'C4:1 G4:5', demo: { chord: ['C4', 'G4'] }, try: { t: 'chord', n: ['C4', 'G4'], say: 'Play C and G together' } },
    { h: 'Major and minor 3rds', p: 'Count every key, black ones too. <b>4 keys up</b> from C is E: a <b>major 3rd</b> (bright). 3 keys up is E♭: a <b>minor 3rd</b> (darker).', kbd: 'C4:C E4:E Eb4:E♭', demo: { chord: ['C4', 'E4'] }, try: { t: 'chord', n: ['C4', 'E4'], say: 'Play C and E (a major 3rd)' } },
    { h: 'A 4th', p: 'C up to F is a <b>4th</b> (5 keys up). In the drill you can play the two notes together or one after the other.', kbd: 'C4:C F4:F', try: { t: 'chord', n: ['C4', 'F4'], say: 'Play C and F' } },
  ];
  L[16] = [
    { h: 'Splitting the beat', p: 'Two <b>eighth notes</b> fit in one beat. Count “<b>1 & 2 & 3 & 4 &</b>”. The numbers fall on the beat, the “&” halfway between.', beats: { r: 'e e e e q q', sub: 2 }, demo: { r: 'e e e e q q', bpm: 72 } },
    { h: 'Try eighths', p: 'Play: <b>quick-quick, quick-quick, slow, slow</b>.', staff: { measure: true, rhythm: 'e e e e q q', timeSig: [4, 4] }, try: { t: 'rhythm', r: 'e e e e q q', bpm: 66, say: 'Play after the count-in' } },
    { h: 'The dot', p: 'A dot makes a note <b>1½ times longer</b>. A dotted quarter lasts 1½ beats and is usually followed by an eighth.', staff: { measure: true, rhythm: 'q. e h', timeSig: [4, 4] }, beats: { r: 'q. e h', sub: 2 }, demo: { r: 'q. e h', bpm: 72 } },
    { h: 'Waltz time', p: '<b>3/4</b> means 3 beats per bar: count “<b>1</b> 2 3, <b>1</b> 2 3”. A tie (curved line between two notes) means hold, don’t play again.', staff: { measure: true, rhythm: 'h q', timeSig: [3, 4] }, try: { t: 'rhythm', r: 'h q', bpm: 70, ts: [3, 4], say: 'Play in 3/4 after the count-in' } },
  ];
  L[5] = [
    { h: 'Chords: 3 notes together', p: 'A <b>triad</b> is three notes, skipping one white key each time: <b>C _ E _ G</b>. Use fingers 1, 3, 5.', kbd: 'C4:1 E4:3 G4:5', hand: { side: 'R', on: [1, 3, 5], names: { 1: 'C', 3: 'E', 5: 'G' } }, demo: { chord: ['C4', 'E4', 'G4'] } },
    { h: 'Play C major', p: 'Press C, E and G <b>at the same time</b>. Let it ring.', kbd: 'C4:1 E4:3 G4:5', try: { t: 'chord', n: ['C4', 'E4', 'G4'], say: 'Play C–E–G together' } },
    { h: 'Make it minor', p: 'Move the middle note <b>one key left</b>, to E♭. That makes <b>C minor</b>: sadder, darker.', kbd: 'C4:1 Eb4:3 G4:5', demo: { chord: ['C4', 'Eb4', 'G4'] }, try: { t: 'chord', n: ['C4', 'Eb4', 'G4'], say: 'Play C–E♭–G' } },
    { h: 'Same shape anywhere', p: 'Major = root, +4 keys, +3 keys. Try <b>G major: G B D</b>.', kbd: 'G4:1 B4:3 D5:5', try: { t: 'chord', n: ['G4', 'B4', 'D5'], say: 'Play G major' }, tip: 'Any octave works in the drill.' },
  ];
  L[6] = [
    { h: 'Shuffle the notes', p: 'An <b>inversion</b> is the same chord with a different note at the bottom. C major is still C–E–G, just reordered.', kbd: 'C4:C E4:E G4:G' },
    { h: '1st inversion', p: 'Move the bottom C up to the top: <b>E G C</b>. Now E is lowest.', kbd: 'E4:1 G4:2 C5:5', demo: { chord: ['E4', 'G4', 'C5'] }, try: { t: 'chord', n: ['E4', 'G4', 'C5'], bass: 'E', say: 'Play E–G–C' } },
    { h: '2nd inversion', p: 'Move E up too: <b>G C E</b>. Now G is lowest.', kbd: 'G4:1 C5:3 E5:5', try: { t: 'chord', n: ['G4', 'C5', 'E5'], bass: 'G', say: 'Play G–C–E' } },
    { h: 'Why bother?', p: 'Inversions let your hand move less between chords. The app checks your <b>lowest</b> note, so don’t add a lower one.' },
  ];
  L[7] = [
    { h: 'A scale is a ladder', p: 'The <b>C major scale</b> is all white keys from C to C: C D E F G A B C.', kbd: 'C4:1 D4:2 E4:3 F4:1 G4:2 A4:3 B4:4 C5:5', demo: { n: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], gap: 0.4 } },
    { h: 'Thumb under', p: 'You have 5 fingers but 8 notes. Play C D E with <b>1 2 3</b>, then tuck your <b>thumb under</b> to F and play F G A B C with <b>1 2 3 4 5</b>.', kbd: 'C4:1 D4:2 E4:3 F4:1 G4:2 A4:3 B4:4 C5:5', try: { t: 'seq', n: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], say: 'Play the C major scale up' } },
    { h: 'Other keys need black keys', p: 'Every major scale has the same sound. G major needs one black key: <b>F♯</b>.', kbd: 'G4:1 A4:2 B4:3 C5:1 D5:2 E5:3 F#5:4 G5:5', try: { t: 'seq', n: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5'], say: 'Play the G major scale' } },
    { h: 'Key signatures name the key', p: 'One sharp (F♯) = G major. One flat (B♭) = F major. In the drill, you may see just a key signature: play its home note (the key name).', staff: { clef: 'treble', notes: [], keySig: 'G' }, try: { t: 'note', n: 'G4', say: 'This key signature means G major: play G' } },
  ];
  L[17] = [
    { h: 'Minor scales sound darker', p: 'A minor uses the same white keys as C major, but starts on <b>A</b>: A B C D E F G A.', kbd: 'A3:1 B3:2 C4:3 D4:1 E4:2 F4:3 G4:4 A4:5', demo: { n: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], gap: 0.4 } },
    { h: 'Play A natural minor', p: 'Fingers 1 2 3, thumb under, 1 2 3 4 5, just like C major.', kbd: 'A3:1 B3:2 C4:3 D4:1 E4:2 F4:3 G4:4 A4:5', try: { t: 'seq', n: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], say: 'Play A minor up' } },
    { h: 'Harmonic minor', p: 'Raise the 7th note by one key: G becomes <b>G♯</b>. It sounds exotic and leads strongly home.', kbd: 'A3:1 B3:2 C4:3 D4:1 E4:2 F4:3 G#4:4 A4:5', try: { t: 'seq', n: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4', 'A4'], say: 'Play A harmonic minor' } },
  ];
  L[18] = [
    { h: 'A chord, one note at a time', p: 'An <b>arpeggio</b> plays a chord’s notes one by one: C E G C, then back down.', kbd: 'C4:1 E4:2 G4:3 C5:5', demo: { n: ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'], gap: 0.4 } },
    { h: 'Your turn', p: 'Fingers <b>1 2 3 5</b> up, <b>5 3 2 1</b> down. Let your wrist glide sideways. Don’t stretch.', kbd: 'C4:1 E4:2 G4:3 C5:5', try: { t: 'seq', n: ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'], say: 'Play C E G C G E C' } },
    { h: 'Minor too', p: 'A minor arpeggio: <b>A C E A</b>.', kbd: 'A3:1 C4:2 E4:3 A4:5', try: { t: 'seq', n: ['A3', 'C4', 'E4', 'A4'], say: 'Play A C E A' } },
  ];
  L[9] = [
    { h: 'Chords have numbers', p: 'Number the notes of the scale 1 to 7. The chord built on each note gets a Roman numeral. In C: <b>I = C, IV = F, V = G</b>.', kbd: 'C4:I F4:IV G4:V' },
    { h: 'The I chord', p: 'Play <b>I</b> in C: C E G.', kbd: 'C4:1 E4:3 G4:5', try: { t: 'chord', n: ['C4', 'E4', 'G4'], say: 'Play I (C major)' } },
    { h: 'IV, the easy way', p: 'Keep C, move the other two fingers up: <b>C F A</b> = F major (IV).', kbd: 'C4:1 F4:4 A4:5', try: { t: 'chord', n: ['C4', 'F4', 'A4'], say: 'Play IV (C–F–A)' } },
    { h: 'V, the easy way', p: '<b>B D G</b> = G major (V). Then back to I. You just played the most common progression: I–IV–V–I.', kbd: 'B3:1 D4:2 G4:5', try: { t: 'chord', n: ['B3', 'D4', 'G4'], say: 'Play V (B–D–G)' }, tip: 'Upper case = major chord, lower case (ii, vi) = minor chord.' },
  ];
  L[22] = [
    { h: 'Move as little as possible', p: '<b>Voice leading</b> means each finger moves to the nearest note of the next chord. Notes both chords share stay put.', kbd: 'C4:C E4:E G4:G' },
    { h: 'C to F, smoothly', p: 'From C E G, keep <b>C</b>, move E→F and G→A. The app checks that <b>C</b> is your lowest note.', kbd: 'C4:1 F4:3 A4:5', try: { t: 'chord', n: ['C4', 'F4', 'A4'], bass: 'C', say: 'Play C–F–A (F chord over C)' } },
    { h: 'C to G, smoothly', p: 'From C E G, keep <b>G</b>, move C→B and E→D: <b>B D G</b>.', kbd: 'B3:1 D4:2 G4:5', try: { t: 'chord', n: ['B3', 'D4', 'G4'], bass: 'B', say: 'Play B–D–G' }, tip: 'Watch your hand. It should barely move.' },
  ];
  L[19] = [
    { h: 'The left hand plays the groove', p: 'Most songs: left hand plays the chord, broken into a pattern. Start with <b>root–5th</b>: C and G, back and forth.', kbd: 'C3:5 G3:1', demo: { n: ['C3', 'G3', 'C3', 'G3'], gap: 0.5 }, try: { t: 'seq', n: ['C3', 'G3', 'C3', 'G3'], say: 'LH: play C G C G' } },
    { h: 'Broken chord', p: 'Play the chord notes one at a time: <b>C E G E</b>.', kbd: 'C3:5 E3:3 G3:1', try: { t: 'seq', n: ['C3', 'E3', 'G3', 'E3'], say: 'LH: play C E G E' } },
    { h: 'Alberti bass', p: 'The classic pattern: <b>low – high – middle – high</b> = C G E G. Keep the hand still over the chord.', kbd: 'C3:5 E3:3 G3:1', demo: { n: ['C3', 'G3', 'E3', 'G3', 'C3', 'G3', 'E3', 'G3'], gap: 0.25 }, try: { t: 'seq', n: ['C3', 'G3', 'E3', 'G3'], say: 'LH: play C G E G' } },
    { h: 'Stride', p: '<b>Stride</b>: a low bass note on beats 1 and 3, the chord on 2 and 4. Your hand jumps. Try it slowly.', kbd: 'C2:bass C3:chord E3:chord G3:chord' },
  ];
  L[20] = [
    { h: 'Two jobs at once', p: 'Left hand <b>holds</b> a chord. Right hand plays the <b>melody</b> on top. Practise each hand alone first.', kbd: 'C3:L E3:L G3:L E4:R D4:R C4:R' },
    { h: 'Step 1: the left hand', p: 'Left hand: play C E G and keep holding it.', kbd: 'C3:5 E3:3 G3:1', try: { t: 'chord', n: ['C3', 'E3', 'G3'], bass: 'C', say: 'LH: play and hold C–E–G' } },
    { h: 'Step 2: add the melody', p: 'Keep holding the chord. Right hand plays <b>E D C</b> on top, slowly.', kbd: 'C3:L E3:L G3:L E4:3 D4:2 C4:1', try: { t: 'seq', n: ['E4', 'D4', 'C4'], say: 'RH: E D C (while LH holds)' }, tip: 'Play the melody a bit louder than the chord.' },
  ];
  L[21] = [
    { h: 'Look before you play', p: 'Take 5 seconds: find the <b>first note</b>, then see if the line goes <b>up or down</b>, by <b>step</b> (next line/space) or <b>skip</b>.', staff: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'C4'] } },
    { h: 'Read by shape', p: 'Don’t name every note. Here: start on C, step up, step up, skip down.', staff: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'C4'] }, try: { t: 'seq', n: ['C4', 'D4', 'E4', 'C4'], say: 'Play the four notes shown' } },
    { h: 'Keep your eyes on the page', p: 'Your hand stays in C position (thumb on middle C), so you don’t need to look down.', staff: { clef: 'treble', notes: ['E4', 'G4', 'F4', 'D4', 'C4'] }, try: { t: 'seq', n: ['E4', 'G4', 'F4', 'D4', 'C4'], say: 'Play these five notes' }, tip: 'Made a mistake? Keep going.' },
  ];
  L[23] = [
    { h: 'The right pedal', p: 'The <b>right pedal</b> (sustain) keeps notes ringing after you let go. Heel on the floor, press with the ball of your foot.' },
    { h: 'Hear it ring', p: 'Press the pedal down. Play a C chord, then <b>let go of the keys</b> but keep the pedal down. The sound should keep going.', kbd: 'C4:1 E4:3 G4:5', try: { t: 'hold', say: 'Play C–E–G, let go of the keys, keep the pedal down' } },
    { h: 'Changing the pedal', p: 'At each new chord: play the chord, <b>then</b> lift the pedal and press it straight back down. “Play – up – down.” This joins chords without blurring them.' },
    { h: 'Try a pedal change', p: 'Play C chord (pedal down) → play F chord (C F A) → quickly lift and press the pedal. Listen: no blur, no gap.', kbd: 'C4:C F4:F A4:A', try: { t: 'self', say: 'Tap when the change sounds clean' } },
  ];
  L[8] = [
    { h: 'Add one more note', p: 'Stack another 3rd on a triad to get a <b>seventh chord</b>: C E G + <b>B</b> = <b>Cmaj7</b>, a soft, dreamy sound.', kbd: 'C4:1 E4:2 G4:3 B4:5', demo: { chord: ['C4', 'E4', 'G4', 'B4'] }, try: { t: 'chord', n: ['C4', 'E4', 'G4', 'B4'], say: 'Play Cmaj7' } },
    { h: 'Dominant 7', p: 'Lower the top note one key to <b>B♭</b>: C E G B♭ = <b>C7</b>. Bluesy, wants to move on.', kbd: 'C4:1 E4:2 G4:3 Bb4:5', try: { t: 'chord', n: ['C4', 'E4', 'G4', 'Bb4'], say: 'Play C7' } },
    { h: 'Minor 7', p: 'Also lower the E: C E♭ G B♭ = <b>Cm7</b>. Mellow.', kbd: 'C4:1 Eb4:2 G4:3 Bb4:5', try: { t: 'chord', n: ['C4', 'Eb4', 'G4', 'Bb4'], say: 'Play Cm7' }, tip: 'The 5th (G) can be left out if it’s a stretch.' },
  ];
  L[24] = [
    { h: 'Off the beat', p: '<b>Syncopation</b> puts notes on the “&” instead of the number. Keep counting “1 & 2 &” and let the notes fall in between.', beats: { r: 'e q e q q', sub: 2 }, demo: { r: 'e q e q q', bpm: 72 } },
    { h: 'Try syncopation', p: 'Short–long–short–long–long. Count the “&”s out loud.', staff: { measure: true, rhythm: 'e q e q q', timeSig: [4, 4] }, try: { t: 'rhythm', r: 'e q e q q', bpm: 63, say: 'Play after the count-in' } },
    { h: 'Sixteenths', p: 'Four notes per beat: count “<b>1 e & a</b>”.', beats: { r: 's s s s q q q', sub: 4 }, demo: { r: 's s s s q q q', bpm: 66 } },
    { h: '6/8 time', p: 'Two big beats per bar, each split in three: “<b>1</b> 2 3 <b>4</b> 5 6”. Feel 1 and 4.', beats: { r: 'q e q e', n: 3, sub: 2, counts: ['1', '2', '3', '4', '5', '6'] }, demo: { r: 'q e q e', bpm: 60, unit: 0.5 } },
  ];
  L[25] = [
    { h: 'Key signature first', p: 'Before playing, look at the key signature and say it out loud. Here: B♭. Every B is B♭.', staff: { clef: 'treble', notes: ['F4', 'G4', 'A4', 'Bb4'], keySig: 'F' }, try: { t: 'seq', n: ['F4', 'G4', 'A4', 'Bb4'], say: 'Play these four notes' } },
    { h: 'Spot patterns', p: 'Look for scale runs (steps), chord shapes (skips) and repeated notes. Read ahead: while you play one note, look at the next.', staff: { clef: 'bass', notes: ['C3', 'E3', 'G3', 'E3'] }, try: { t: 'seq', n: ['C3', 'E3', 'G3', 'E3'], say: 'Play this (bass clef)' } },
  ];
  L[26] = [
    { h: 'Reading chord symbols', p: 'A <b>lead sheet</b> gives the melody plus chord names like <b>C, Am, F, G7</b>. Letter = root. <b>m</b> = minor. <b>7</b> = add the 7th.', chips: ['C', 'Am', 'F', 'G7'] },
    { h: 'Simple accompaniment', p: 'Left hand: the <b>root</b> (the letter). Right hand: the chord in the closest shape. Try <b>Am</b>: LH A, RH A C E.', kbd: 'A2:LH A3:1 C4:2 E4:3', try: { t: 'chord', n: ['A2', 'A3', 'C4', 'E4'], bass: 'A', say: 'Play Am (A in the bass)' } },
    { h: 'Slash chords', p: '<b>C/E</b> means a C chord with <b>E</b> as the lowest note.', kbd: 'E3:LH C4:1 E4:2 G4:3', try: { t: 'chord', n: ['E3', 'C4', 'E4', 'G4'], bass: 'E', say: 'Play C/E' }, tip: 'Say each chord name one bar ahead.' },
  ];
  L[27] = [
    { h: 'Same tune, new start', p: '<b>Transposing</b> = playing a tune starting on a different note. Copy the <b>shape</b>: same steps up and down.', kbd: 'C4:1 D4:2 E4:3', try: { t: 'seq', n: ['C4', 'D4', 'E4', 'C4'], say: 'Play C D E C' } },
    { h: 'Now from G', p: 'Same shape from G: <b>G A B G</b>. Up a step, up a step, back down.', kbd: 'G4:1 A4:2 B4:3', try: { t: 'seq', n: ['G4', 'A4', 'B4', 'G4'], say: 'Play the same shape from G' } },
    { h: 'Watch for black keys', p: 'From D, the 3rd step is <b>F♯</b> (to keep the same sound): D E F♯ D.', kbd: 'D4:1 E4:2 F#4:3', try: { t: 'seq', n: ['D4', 'E4', 'F#4', 'D4'], say: 'Play it from D' } },
  ];
  L[10] = [
    { h: 'Listen, don’t look', p: 'The phone plays a chord. You tap the answer on screen. The mic is paused while it plays.', demo: { chord: ['C4', 'E4', 'G4'] } },
    { h: 'Major vs minor', p: '<b>Major</b> sounds bright and happy. <b>Minor</b> sounds darker or sad. Listen to both.', demo: { seq2: [['C4', 'E4', 'G4'], ['C4', 'Eb4', 'G4']] } },
    { h: 'Intervals as songs', p: 'Tie intervals to songs you know: a <b>4th</b> = “Here Comes the Bride”, a <b>5th</b> = “Twinkle Twinkle” (the jump on “twinkle, twinkle”).', demo: { n: ['C4', 'C4', 'G4', 'G4'], gap: 0.45 } },
  ];
  L[28] = [
    { h: 'Hear it, play it', p: 'The phone plays a short tune. You play it back. You’ll be told the first note.', demo: { n: ['C4', 'D4', 'E4'], gap: 0.5 } },
    { h: 'Up or down? Step or jump?', p: 'Listen again and hum it. Did it go up or down? By one key (step) or more (jump)? This one starts on C.', demo: { n: ['C4', 'D4', 'E4'], gap: 0.5 }, try: { t: 'seq', n: ['C4', 'D4', 'E4'], say: 'Play back what you heard' } },
    { h: 'A little longer', p: 'Starts on E. Most simple tunes move by step and end on the home note.', demo: { n: ['E4', 'D4', 'C4', 'D4', 'E4'], gap: 0.5 }, try: { t: 'seq', n: ['E4', 'D4', 'C4', 'D4', 'E4'], say: 'Play back the tune' } },
  ];
  L[29] = [
    { h: 'Sus chords', p: 'Swap the 3rd for the 4th: C F G = <b>Csus4</b>. It sounds open and wants to settle back to C.', kbd: 'C4:1 F4:3 G4:5', demo: { seq2: [['C4', 'F4', 'G4'], ['C4', 'E4', 'G4']] }, try: { t: 'chord', n: ['C4', 'F4', 'G4'], say: 'Play Csus4' } },
    { h: 'add9', p: 'A triad plus the note a step above the root, an octave up: C E G <b>D</b> = <b>Cadd9</b>. Modern pop sound.', kbd: 'C4:1 E4:2 G4:3 D5:5', try: { t: 'chord', n: ['C4', 'E4', 'G4', 'D5'], say: 'Play Cadd9' } },
    { h: '6th chords', p: 'Triad plus the 6th: C E G <b>A</b> = <b>C6</b>. Jazzy and sweet.', kbd: 'C4:1 E4:2 G4:3 A4:4', try: { t: 'chord', n: ['C4', 'E4', 'G4', 'A4'], say: 'Play C6' }, tip: 'Too many notes for one hand? Let the left hand take the root.' },
  ];
  L[30] = [
    { h: 'The blues scale', p: 'C blues: <b>C E♭ F F♯ G B♭ C</b>. That F♯ is the “blue note” that gives the gritty sound.', kbd: 'C4:C Eb4:E♭ F4:F F#4:F♯ G4:G Bb4:B♭ C5:C', demo: { n: ['C4', 'Eb4', 'F4', 'F#4', 'G4', 'Bb4', 'C5'], gap: 0.35 }, try: { t: 'seq', n: ['C4', 'Eb4', 'F4', 'F#4', 'G4', 'Bb4', 'C5'], say: 'Play the C blues scale' } },
    { h: '12-bar blues', p: 'Thousands of songs use this 12-bar plan: <b>4 bars of C7, 2 of F7, 2 of C7, then G7 F7 C7 G7</b>. One chord per bar.', chips: ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'] },
    { h: 'Try the first change', p: 'Play C7, then F7: LH root, RH the chord.', kbd: 'F3:LH A3:1 C4:2 Eb4:3', try: { t: 'chord', n: ['F3', 'A3', 'C4', 'Eb4'], bass: 'F', say: 'Play F7 (F in the bass)' } },
  ];
  L[31] = [
    { h: 'No wrong notes', p: 'Improvising = making up music. Use a safe set of notes: the <b>C pentatonic</b>, C D E G A. Every note sounds good over a C chord.', kbd: 'C4:C D4:D E4:E G4:G A4:A', demo: { n: ['E4', 'G4', 'A4', 'G4', 'E4', 'D4', 'C4'], gap: 0.35 } },
    { h: 'Make a little idea', p: 'Play a 3–4 note idea. Repeat it. Change it a bit. Leave some silence. <b>End on C</b>.', kbd: 'C4:C D4:D E4:E G4:G A4:A', try: { t: 'improv', scale: [0, 2, 4, 7, 9], root: 0, count: 8, say: 'Improvise 8+ notes from C D E G A, end on C' } },
    { h: 'Over a chord', p: 'Hold C–E–G in the left hand while the right hand improvises. The drill uses major and minor pentatonic and blues scales.', tip: 'Simple ideas, repeated, sound musical.' },
  ];
  L[32] = [
    { h: 'Modes = scale flavours', p: 'A <b>mode</b> is a scale with one note changed. <b>Dorian</b> = all white keys from D: D E F G A B C D. Minor, but brighter.', kbd: 'D4:D E4:E F4:F G4:G A4:A B4:B C5:C D5:D', demo: { n: ['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'], gap: 0.35 }, try: { t: 'seq', n: ['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'], say: 'Play D Dorian' } },
    { h: 'Mixolydian', p: 'A major scale with the 7th lowered: G A B C D E <b>F</b> G (F instead of F♯). Rock and blues sound.', kbd: 'G4:G A4:A B4:B C5:C D5:D E5:E F5:F G5:G', try: { t: 'seq', n: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'], say: 'Play G Mixolydian' } },
    { h: 'Lydian and Phrygian', p: '<b>Lydian</b> = major with a raised 4th (F G A B C D E F): dreamy film sound. <b>Phrygian</b> = minor with a lowered 2nd: Spanish flavour.', tip: 'Learn each mode as “major/minor + one change”.' },
  ];
  L[33] = [
    { h: 'Notes and rhythm together', p: 'Now read the notes <b>and</b> play them in time after the count-in. Don’t stop for mistakes.', staff: { measure: true, rhythm: 'q q h', names: ['C4', 'D4', 'E4'], timeSig: [4, 4] }, demo: { r: 'q q h', notes: ['C4', 'D4', 'E4'], bpm: 70 } },
    { h: 'Try it', p: 'Tap the rhythm on your knee once, then play it.', staff: { measure: true, rhythm: 'q q h', names: ['C4', 'D4', 'E4'], timeSig: [4, 4] }, try: { t: 'rhythm', r: 'q q h', bpm: 66, say: 'Play C D E in rhythm' } },
  ];
  L[34] = [
    { h: 'The jazz progression', p: '<b>ii – V – I</b> drives most jazz standards. In C: <b>Dm7 → G7 → Cmaj7</b>.', chips: ['Dm7', 'G7', 'Cmaj7'], demo: { seq2: [['D3', 'F4', 'C5'], ['G3', 'F4', 'B4'], ['C3', 'E4', 'B4']] } },
    { h: 'Shell voicings', p: 'Left hand: the root. Right hand: just the <b>3rd and 7th</b>. Dm7 = LH D, RH F + C.', kbd: 'D3:LH F4:RH C5:RH', try: { t: 'chord', n: ['D3', 'F4', 'C5'], bass: 'D', say: 'Play Dm7 (shell)' } },
    { h: 'Tiny moves', p: 'To G7: the C falls one key to <b>B</b>, F stays. LH plays G.', kbd: 'G2:LH F4:RH B4:RH', try: { t: 'chord', n: ['G2', 'F4', 'B4'], bass: 'G', say: 'Play G7 (shell)' }, tip: 'The app accepts any voicing, but aim for the smallest moves.' },
  ];
  L[36] = [
    { h: 'Make it music', p: 'Pick a piece you can already play. This unit is about making it sound great, not about new notes.' },
    { h: 'Melody louder', p: 'Play the left hand <b>softer</b> than the right so the melody sings on top. Try just the first line this way.', try: { t: 'self', say: 'Tap when the melody stands out' } },
    { h: 'Shape the phrase', p: 'Like a sentence: get a little louder toward the middle, relax at the end. Breathe between phrases.', try: { t: 'self', say: 'Tap when you’ve shaped one phrase' } },
    { h: 'Perform it', p: 'Record a full run-through on your phone. <b>Don’t stop</b> for slips. Listen back once.', try: { t: 'self', say: 'Tap when you’ve recorded a run-through' } },
  ];

  const api = { steps: (id) => L[id] || [], keyboard, hand, beats, TIPS, midiOf, ids: Object.keys(L).map(Number) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Lessons = api;
})(typeof self !== 'undefined' ? self : this);
