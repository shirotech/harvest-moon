// Moonlit Acres — original soundtrack, written for this game.
//
// ============================================================================
//  NOTATION ("MML-lite", parsed by compileSong in audio.js)
// ============================================================================
//  A song has four channels, like the Game Boy APU:
//     p1, p2 : pulse channels      wv : 4-bit wave channel      ns : noise channel
//  Each channel is a string of tokens (whitespace is ignored):
//
//   c d e f g a b   note; add + or # for sharp, - for flat          e.g. f+8  b-4.
//   <digits>        length after a note/rest: 1 whole, 2 half, 4 quarter, 8 eighth,
//                   16 sixteenth; 3/6/12/24 are triplet lengths (12 = triplet eighth)
//   .               dotted (repeatable)                              c4.  c8..
//   ^<len>          tie more time onto the previous note or rest     c2^8
//   r<len>          rest
//   o<n>            octave (o4 c = middle C, MIDI 60);  > up one, < down one
//   l<len>          default length for notes without digits          l8 c d e
//   v<0-15>         volume (GB-style 4-bit)
//   q<1-8>          gate: note sounds for q/8 of its length (8 = legato; default 7)
//   @name           instrument from INSTRUMENTS (duty / wave / envelope / vibrato)
//   x0,4,7          arpeggio offsets in semitones (GB "chord" effect); x alone = off
//   ~               glide into the next note from the previous one
//   K<n>            transpose following notes by n semitones (K0 resets)
//   |               bar line — checked against the meter, catches counting errors
//   [ ... ]n        repeat n times; a '/' inside marks where the last pass stops
//   {Name}          paste the song's parts.Name here
//   ; comment       to end of line
//  Noise channel uses drum letters instead of notes (see DRUMS):
//   k kick  s snare  h closed hat  j open hat  t tom/thud  c crash+kick
//   b brush/shaker   i rim click   m metallic tambourine
//
//  A channel may instead be derived from another channel:
//   { from: 'p1', delay: 0.5 }        echo, delayed in beats, wrapping round the loop
//   { from: 'p1', steps: -2 }         diatonic harmony (steps in the song's key/mode)
//   plus vol (multiplier) and inst (instrument override).
//
//  Song fields: bpm, key, mode ('major'|'minor'), meter (beats per bar, default 4),
//  swing (0..0.45, delays off-beat 8ths), loop (false for jingles), chromatic
//  (skip in-key checks), parts.  All channels must add up to the same length.
// ============================================================================

// ----------------------------------------------------------------------------
// 4-bit, 32-sample wave channel tables (hex digits, one per sample)
export const WAVES = {
  tri: '89ABCDEFFEDCBA987654321001234567',
  sine: '8ABCDEFFFFEDCBA87543210000123457',
  flute: '9BDEFFFEEDCCBA987654332110001246',
  bass: '9BDFFFEDCCBBAA987655443321000246',
  organ: '9DFFEEDDEDCA86678997532122110026',
  reed: '9DFFEDBBBBBA98887776544444210026',
  mbox: '9CCBBBBCDFFDA8887775200234444336',
  saw: '00112233445566778899AABBCCDDEEFF',
  square: 'FFFFFFFFFFFFFFFF0000000000000000',
};

// ----------------------------------------------------------------------------
// Instruments. Pulse: duty 0..3 = 12.5/25/50/75 %. Wave: wave table name.
// Envelope: a attack (s), d decay time-constant (s), s sustain level, r release (s).
// vib: [delay s, depth semitones, rate Hz]; bend: [start semitones, glide s].
export const INSTRUMENTS = {
  lead: { duty: 1, a: 0.004, d: 0.3, s: 0.62, r: 0.06, vib: [0.16, 0.16, 5.6], gain: 1.0 },
  lead50: { duty: 2, a: 0.004, d: 0.28, s: 0.58, r: 0.06, vib: [0.16, 0.18, 5.4], gain: 0.85 },
  harm: { duty: 1, a: 0.004, d: 0.25, s: 0.5, r: 0.05, gain: 0.8 },
  soft: { duty: 0, a: 0.03, d: 0.8, s: 0.75, r: 0.18, vib: [0.35, 0.1, 4.6], gain: 0.9 },
  pluck: { duty: 1, a: 0.003, d: 0.12, s: 0.18, r: 0.06, gain: 0.8 },
  stab: { duty: 2, a: 0.003, d: 0.07, s: 0.3, r: 0.04, gain: 0.6, arpRate: 1 / 60 },
  bell: { duty: 0, a: 0.002, d: 0.32, s: 0, r: 0.25, gain: 1.0 },
  brass: { duty: 2, a: 0.012, d: 0.3, s: 0.72, r: 0.07, bend: [-1, 0.035], vib: [0.22, 0.18, 6], gain: 0.9 },
  warm: { duty: 2, a: 0.035, d: 0.6, s: 0.72, r: 0.16, vib: [0.24, 0.14, 5], gain: 0.8 },
  bass: { wave: 'bass', a: 0.004, d: 0.25, s: 0.75, r: 0.04, gain: 1.0 },
  bassp: { wave: 'bass', a: 0.003, d: 0.14, s: 0.45, r: 0.05, gain: 1.0 },
  harp: { wave: 'flute', a: 0.003, d: 0.35, s: 0.3, r: 0.18, gain: 0.8 },
  sub: { wave: 'sine', a: 0.06, d: 1.2, s: 0.8, r: 0.35, gain: 0.9 },
  mbox: { wave: 'mbox', a: 0.002, d: 0.4, s: 0, r: 0.3, gain: 0.8 },
};

// ----------------------------------------------------------------------------
// Noise-channel drum kit. clock = LFSR steps/s (clock1 = sweep target over `sweep` s),
// noise 'long' (15-bit) or 'short' (7-bit metallic); d = decay, dur = gate.
// tone = optional wave-channel thump (f → f1 over t seconds).
const KICK_TONE = { f: 165, f1: 46, t: 0.09, d: 0.07, dur: 0.12, vol: 1.0 };
export const DRUMS = {
  k: { clock: 5000, d: 0.02, dur: 0.02, vol: 0.3, tone: KICK_TONE },
  s: { clock: 24000, clock1: 11000, sweep: 0.12, d: 0.065, dur: 0.11, vol: 0.85, tone: { f: 250, f1: 165, t: 0.05, d: 0.03, dur: 0.05, vol: 0.4 } },
  h: { clock: 250000, d: 0.016, dur: 0.03, vol: 0.5, filter: ['highpass', 7000] },
  j: { clock: 250000, d: 0.08, dur: 0.16, vol: 0.42, filter: ['highpass', 6000] },
  t: { clock: 3000, d: 0.05, dur: 0.05, vol: 0.3, tone: { f: 135, f1: 72, t: 0.18, d: 0.12, dur: 0.22, vol: 0.95 } },
  c: { clock: 180000, d: 0.4, dur: 0.8, vol: 0.4, r: 0.2, filter: ['highpass', 3500], tone: KICK_TONE },
  b: { clock: 60000, a: 0.008, d: 0.05, dur: 0.07, vol: 0.5, filter: ['bandpass', 3800, 0.8] },
  i: { noise: 'short', clock: 60000, d: 0.012, dur: 0.02, vol: 0.4 },
  m: { noise: 'short', clock: 120000, d: 0.05, dur: 0.09, vol: 0.28, filter: ['highpass', 5000] },
};

// ----------------------------------------------------------------------------
// small helpers that write repetitive notation
const MAJ = '0,4,7';
const MIN = '0,3,7';
const DOM7 = '0,4,7,10';
const MIN7 = '0,3,7,10';
// off-beat chord stabs, one bar of 4/4
const stab = (arp, n) => `x${arp} r8 ${n}8 r8 ${n}8 r8 ${n}8 r8 ${n}8 |`;
const stab2 = (a1, n1, a2, n2) => `x${a1} r8 ${n1}8 r8 ${n1}8 x${a2} r8 ${n2}8 r8 ${n2}8 |`;
// "oom-pah" chord on beats 2 and 4
const pah = (arp, n) => `x${arp} r4 ${n}8 r8 r4 ${n}8 ${n}8 |`;
const pah2 = (a1, n1, a2, n2) => `x${a1} r4 ${n1}8 r8 x${a2} r4 ${n2}8 ${n2}8 |`;
// bass figures
const bounce = (r, f) => `${r}4 ${f}4 ${r}4 ${f}8 ${r}8 |`;
const octs = (n, o) => `[o${o}${n}8 o${o + 1}${n}8]4 |`;
const lilt = (r, f) => `${r}4. ${r}8 ${f}2 |`;
const oom = (r, f) => `${r}4 r4 ${f}4 r4 |`;
const waltz = (a, b, c) => `${a}4 ${b}4 ${c}4 |`;
const jig = (r, f, x) => `${r}6 ${f}12 ${x}6 ${f}12 ${r}6 ${f}12 ${x}6 ${f}12 |`;
const cat = (...xs) => xs.join(' ');

// ============================================================================
//  LOOPING TRACKS
// ============================================================================
export const SONGS = {
  // --------------------------------------------------------------------------
  // TITLE — C major, gentle & hopeful. Harp-like wave arpeggios, lead with a
  // dotted-eighth echo on pulse 2.
  title: {
    bpm: 92,
    key: 'C',
    mode: 'major',
    parts: {
      C: 'o3 c g >c e g e c <g',
      Am: 'o2 a >e a >c e c <a e',
      F: 'o2 f >c f a >c <a f c',
      G: 'o2 g >d g b >d <b g d',
      EmB: 'o2 b >e g b >e <b g e',
      Em: 'o2 e b >e g b g e <b',
      Gs: 'o2 g >d g >c d <b g d',
      Dm: 'o2 d a >d f a f d <a',
      CeF: 'o2 e >c e g <f >c f a',
      NA: 'v3 r8 h8 v6 b8 v3 h8 r8 h8 v6 b8 v3 h8',
      NB: 'v7 k8 v3 h8 v6 b8 v3 h8 r8 v6 k8 v6 b8 v3 h8',
      NF: 'v7 k8 v3 h8 v6 b8 v3 h8 v5 b16 b16 v6 b8 v7 b8 v8 b8',
    },
    p1: `@lead v12 q8 o5
      e4. d8 c4 <g4 | a4 >c4 e4 d8 c8 | d4. c8 <a4 >c4 | d2 r8 <g8 a8 b8 |
      >c4 e4 g4. f8 | e4 d8 e8 <b2 | a4 >c4 f4 e8 d8 | d2. c8 d8 |
      f4. e8 d4 c4 | d4 <b8 >c8 d2 | e4. d8 e4 g4 | a2 g4 e4 |
      f4. e8 d4 <a4 | b4 >d4 g4 f4 | e4. d8 c4 <a4 | >d2. r4 |`,
    p2: { from: 'p1', delay: 0.75, vol: 0.42 },
    wv: `@harp v12 l8
      {C}|{Am}|{F}|{G}|{C}|{EmB}|{F}|{Gs}|
      {F}|{G}|{Em}|{Am}|{Dm}|{G}|{CeF}|{Gs}|`,
    ns: `l8 [{NA}|]8 [{NB}|]7 {NF}|`,
  },

  // --------------------------------------------------------------------------
  // SPRING — D major, the main farm theme. AABA', bouncy lead over off-beat
  // arpeggiated chord stabs and a root/fifth bass.
  spring: {
    bpm: 132,
    key: 'D',
    mode: 'major',
    parts: {
      MA: `o5 f+4 a8 f+8 e8 d8 e4 | d4 <b8 >d8 g2 | f+4 a8 f+8 a8 b8 a4 |
           e4 c+8 <a8 >e2 | d4 f+8 d8 <b4 >d4 | g4 f+8 e8 d4 <b4 |`,
      E1: '>e4 g4 c+4 e8 g8 | f+2. r4 |',
      E2: '>e4 g4 c+4 e8 g8 | f+4 d8 f+8 a2 |',
      E3: '>e4 g4 c+4 e8 g8 | f+4 d4 e8 f+8 e8 c+8 |',
      MB: `o5 b4. a8 g4 d4 | c+4 e4 a2 | a4. f+8 c+4 f+4 | f+8 e8 d4 <b2 |
           >g4. f+8 e4 <b4 | >c+4 e4 a4. g8 | d8 e8 f+8 g8 a8 b8 a8 g8 | a4. g8 e4 c+4 |`,
      SA: cat(stab(MAJ, 'o4d'), stab(MAJ, 'o3g'), stab(MAJ, 'o4d'), stab(MAJ, 'o3a'), stab(MIN, 'o3b'), stab(MAJ, 'o3g')),
      SE: stab2(MIN7, 'o4e', DOM7, 'o3a'),
      SB: cat(stab(MAJ, 'o3g'), stab(MAJ, 'o3a'), stab(MIN, 'o3f+'), stab(MIN, 'o3b'), stab(MIN, 'o4e'), stab(MAJ, 'o3a'), stab(MAJ, 'o3g'), stab(DOM7, 'o3a')),
      BA: cat(bounce('o3d', 'o2a'), bounce('o2g', 'o3d'), bounce('o3d', 'o2a'), bounce('o2a', 'o3e'), bounce('o2b', 'o3f+'), bounce('o2g', 'o3d'), 'o2e4 o2b4 o2a4 o3c+4 |'),
      BB: cat(bounce('o2g', 'o3d'), bounce('o2a', 'o3e'), bounce('o2f+', 'o3c+'), bounce('o2b', 'o3f+'), bounce('o2e', 'o2b'), bounce('o2a', 'o3e'), bounce('o2g', 'o3d'), 'o2a4 o3e4 o3c+4 o2a4 |'),
      DR: 'v9 k8 v4 h8 v8 s8 v4 h8 v9 k8 v8 k8 v8 s8 v4 h8 |',
      DC: 'v8 c8 v4 h8 v8 s8 v4 h8 v9 k8 v8 k8 v8 s8 v4 h8 |',
      DF: 'v9 k8 v4 h8 v8 s8 v4 h8 v7 s16 s16 v8 s8 v9 s16 s16 v10 s8 |',
    },
    p1: '@lead v12 {MA}{E1} {MA}{E2} {MB} {MA}{E3}',
    p2: `@stab v9
      {SA}{SE}${stab(MAJ, 'o4d')}
      {SA}{SE}${stab(MAJ, 'o4d')}
      {SB}
      {SA}{SE}${stab2(MAJ, 'o4d', DOM7, 'o3a')}`,
    wv: `@bass v13 q6
      {BA}${bounce('o3d', 'o2a')}
      {BA}o3d4 o3c+4 o2b4 o2a4 |
      {BB}
      {BA}o3d4 o2a4 o2a4 o3c+4 |`,
    ns: '[{DC}[{DR}]6{DF}]4',
  },

  // --------------------------------------------------------------------------
  // SUMMER — A major, sunny and driving. Syncopated lead doubled a diatonic
  // third below on pulse 2, octave-bouncing bass.
  summer: {
    bpm: 152,
    key: 'A',
    mode: 'major',
    parts: {
      CORE: `o5 >c+8 <b8 a8 e8 r8 a8 >c+4 | <b8 a8 f+8 a8 r8 >d8 <b4 |
             >c+8 <b8 a8 e8 r8 a8 >c+8 e8 | e4. d8 <b4 g+4 |
             a8 >c+8 f+4 e8 c+8 <a4 | >f+8 e8 d8 <a8 r8 f+8 a4 |`,
      E1: '>d4 c+8 <b8 a4 f+4 | b2 r8 e8 g+8 b8 |',
      E2: 'g+8 a8 b8 >c+8 d8 c+8 <b8 g+8 | a2. r4 |',
      B: `o6 f+2 e4 d4 | e2. <b4 | >c+2 e4 c+4 | <a4. g+8 f+4 e4 |
          f+4. a8 >d4 c+8 <b8 | b4. a8 g+4 e4 | f+4 a4 >d4 c+8 <b8 | b2 >d4 <b4 |`,
      BC: cat(octs('a', 2), octs('d', 2), octs('a', 2), octs('e', 2), octs('f+', 2), octs('d', 2)),
      BB: cat(octs('d', 2), octs('e', 2), octs('c+', 2), octs('f+', 2), octs('d', 2), octs('e', 2), octs('b', 2), octs('e', 2)),
      DR: 'v9 k8 v4 h8 v8 s8 v4 h8 v9 k16 k16 v5 j8 v8 s8 v4 h8 |',
      DC: 'v8 c8 v4 h8 v8 s8 v4 h8 v9 k16 k16 v5 j8 v8 s8 v4 h8 |',
      DF: 'v9 k8 v4 h8 v8 s8 s16 s16 v9 s8 s16 s16 v10 s8 s8 |',
    },
    p1: '@lead50 v12 {CORE}{E1} {CORE}{E2} {B} {CORE}{E1}',
    p2: { from: 'p1', steps: -2, vol: 0.62, inst: 'harm' },
    wv: `@bassp v13 q6
      {BC}${octs('b', 2)}${octs('e', 2)}
      {BC}${octs('e', 2)}${octs('a', 2)}
      {BB}
      {BC}${octs('b', 2)}${octs('e', 2)}`,
    ns: '[{DC}[{DR}]6{DF}]4',
  },

  // --------------------------------------------------------------------------
  // FALL — B♭ major, warm and mellow. ABA with a soft vibrato lead, finger-
  // picked pulse arpeggios and a lilting bass.
  fall: {
    bpm: 100,
    key: 'Bb',
    mode: 'major',
    parts: {
      A: `o4 f8 b-8 >d4. c8 d4 | f4. d8 <b-2 | g8 b-8 >e-4. d8 e-4 | c4. <a8 f2 |
          f8 b-8 >d4. c8 d8 f8 | g4. f8 e-4 <b-4 | >e-4. d8 c4 <a4 | b-2. r4 |`,
      B: `o5 d4 g4 b-4. a8 | a2 f4 d4 | g4. f8 e-4 <b-4 | >d2. c8 d8 |
          e-4. d8 c4 <g4 | >f4. d8 <a4 >c4 | <b-4 >e-4 g4 f8 e-8 | f2 e-4 c4 |`,
      Bb: 'o3 b- >d f b- f d <b- >d',
      Gm7: 'o3 g b- >d f d <b- g b-',
      Eb: 'o3 e- g b- >e- <b- g e- g',
      F: 'o3 f a >c f c <a f a',
      BbD: 'o3 d f b- >d <b- f d f',
      CmF: 'o3 c e- g b- f a >c <a',
      Gm: 'o3 g b- >d g d <b- g b-',
      Dm: 'o3 d f a >d <a f d f',
      Cm7: 'o3 c e- g b- g e- c e-',
      Dm7: 'o3 d f a >c <a f d f',
      F7: 'o3 f a >c e- c <a f a',
      PA: '{Bb}|{Gm7}|{Eb}|{F}|{BbD}|{Eb}|{CmF}|{Bb}|',
      PB: '{Gm}|{Dm}|{Eb}|{Bb}|{Cm7}|{Dm7}|{Eb}|{F7}|',
      LA: cat(lilt('o2b-', 'o3f'), lilt('o2g', 'o3d'), lilt('o2e-', 'o2b-'), lilt('o2f', 'o3c'), lilt('o2d', 'o2f'), lilt('o2e-', 'o2b-'), 'o3c4 o2g4 o2f4 o2a4 |'),
      LB: cat(lilt('o2g', 'o3d'), lilt('o2d', 'o2a'), lilt('o2e-', 'o2b-'), lilt('o2b-', 'o3f'), lilt('o3c', 'o2g'), lilt('o2d', 'o2a'), lilt('o2e-', 'o2b-'), 'o2f4. o2f8 o2a4 o3c4 |'),
      DR: 'v7 k8 v3 h8 v6 b8 v3 h8 r8 v6 k8 v6 b8 v3 h8 |',
      DF: 'v7 k8 v3 h8 v6 b8 v3 h8 v5 b16 b16 v6 b8 v7 b8 v8 b8 |',
    },
    p1: '@warm v12 q8 {A}{B}{A}',
    p2: '@pluck v9 l8 {PA}{PB}{PA}',
    wv: `@bass v13
      {LA}o2b-4. o2b-8 o3f4 o3d4 |
      {LB}
      {LA}o2b-4. o2b-8 o3f4 o3c4 |`,
    ns: '[[{DR}]7{DF}]3',
  },

  // --------------------------------------------------------------------------
  // WINTER — E minor waltz, music-box. Sparse bell melody with an eighth-note
  // echo; second pass rises an octave over a soft waltz accompaniment.
  winter: {
    bpm: 96,
    key: 'E',
    mode: 'minor',
    meter: 3,
    parts: {
      A: `o4 b4 >e4 g4 | g4. f+8 e4 | e2 c4 | <b4 >d+4 f+4 |
          g2 f+8 e8 | e4 g4 >c4 | <a4 f+4 d+4 | e2. |`,
      B: `o5 d4 g4 b4 | a2 f+4 | g4. f+8 e4 | d2. |
          c4 e4 a4 | g2 <b4 | >e4. d8 c4 | d+2. |`,
      W1: `o3 e2. | c2. | <a2. | b2. | >e2. | c2. | <b2. | >e2. |
           <g2. | >d2. | c2. | <g2. | a2. | >e2. | c2. | <b2. |`,
      Em: waltz('o3e', 'o3b', 'o4e'),
      C: waltz('o3c', 'o3g', 'o4c'),
      Am: waltz('o2a', 'o3e', 'o3a'),
      B7: waltz('o2b', 'o3f+', 'o3b'),
      G: waltz('o2g', 'o3d', 'o3g'),
      D: waltz('o3d', 'o3a', 'o4d'),
    },
    p1: '@bell v12 {A}{B} K12 v8 {A}{B} K0',
    p2: { from: 'p1', delay: 0.5, vol: 0.4 },
    wv: `@sub v10 {W1}
      @harp v9 {Em}{C}{Am}{B7}{Em}{C}{B7}{Em} {G}{D}{C}{G}{Am}{Em}{C}{B7}`,
    ns: '[v2 r4 h4 h4 |]16 [v4 b4 v2 h4 h4 |]16',
  },

  // --------------------------------------------------------------------------
  // VILLAGE — F major, bouncy swung town theme with oom-pah bass and chords.
  village: {
    bpm: 120,
    key: 'F',
    mode: 'major',
    swing: 0.2,
    parts: {
      A: `o5 c8 f8 a8 f8 >c4 <a4 | a8 g8 f8 d8 f4 d4 | <b-8 >d8 g8 f8 d4 <b-4 |
          >c8 e8 g8 b-8 a4 g4 | c8 f8 a8 f8 >c4 <a4 | >d8 c8 <a8 f8 d4 f4 |`,
      E1: 'g8 a8 b-8 a8 g4 d4 | e8 f8 g8 a8 b-4 r4 |',
      B: `o5 >d4. c8 <b-4 f4 | a4. g8 f4 c4 | d8 f8 b-8 >d8 c4 <b-4 | a2 r4 c4 |
          b-8 a8 g8 f8 d4 g4 | e8 g8 >c8 <b-8 a4 g4 | f4 a4 >d4 <a4 | g4 f4 e4 g4 |`,
      E2: '>d4 <b-4 g4 e4 | f2. r4 |',
      CA: cat(pah(MAJ, 'o4f'), pah(MIN, 'o4d'), pah(MIN7, 'o3g'), pah(DOM7, 'o4c'), pah(MAJ, 'o4f'), pah(MIN, 'o4d')),
      CE1: cat(pah(MIN7, 'o3g'), pah(DOM7, 'o4c')),
      CB: cat(pah(MAJ, 'o3b-'), pah(MAJ, 'o4f'), pah(MAJ, 'o3b-'), pah(MAJ, 'o4f'), pah(MIN7, 'o3g'), pah(DOM7, 'o4c'), pah2(MAJ, 'o4f', MIN, 'o4d'), pah2(MIN7, 'o3g', DOM7, 'o4c')),
      CE2: cat(pah2(MIN7, 'o3g', DOM7, 'o4c'), pah(MAJ, 'o4f')),
      BA: cat(oom('o2f', 'o3c'), oom('o2d', 'o2a'), oom('o2g', 'o3d'), oom('o3c', 'o2g'), oom('o2f', 'o3c'), oom('o2d', 'o2a')),
      BE1: cat(oom('o2g', 'o3d'), 'o3c4 r4 o2g4 o2a4 |'),
      BB: cat(oom('o2b-', 'o3f'), oom('o2f', 'o3c'), oom('o2b-', 'o3f'), oom('o2f', 'o3c'), oom('o2g', 'o3d'), oom('o3c', 'o2g'), 'o2f4 r4 o2d4 r4 |', 'o2g4 r4 o3c4 r4 |'),
      BE2: 'o2g4 r4 o3c4 r4 | o2f4 o2a4 o3c4 o2c4 |',
      DR: 'v8 k8 v4 h8 v7 s8 v4 h8 v8 k8 v4 h8 v7 s8 v5 h8 |',
      DF: 'v8 k8 v4 h8 v7 s8 v4 h8 v8 k8 v7 s16 s16 v8 s8 v9 s8 |',
    },
    p1: '@lead v12 q6 l8 {A}{E1} {B} {A}{E2}',
    p2: '@stab v9 {CA}{CE1} {CB} {CA}{CE2}',
    wv: '@bassp v13 q7 {BA}{BE1} {BB} {BA}{BE2}',
    ns: '[[{DR}]7{DF}]3',
  },

  // --------------------------------------------------------------------------
  // NIGHT — E♭ major lullaby in 3/4. Rocking wave arpeggios, soft sustained
  // inner voice, very light shaker.
  night: {
    bpm: 80,
    key: 'Eb',
    mode: 'major',
    meter: 3,
    parts: {
      A: `o5 g4. f8 e-4 | e-4 c4 <a-4 | b-2 >e-4 | f4. e-8 d4 |
          e-4. d8 c4 | c4 e-4 a-4 | g4 f4 d4 | e-2. |`,
      B: `o6 c4. <b-8 a-4 | b-2 f4 | g4. f8 d4 | e-2. |
          a-4. g8 f4 | f4 d4 <b-4 | >c4 e-4 a-4 | f2. |`,
      IA: 'o4 g2. | a-2. | g2. | f2. | g2. | a-2. | f2. | g2. |',
      IB: 'o4 e-2. | d2. | d2. | e-2. | c2. | d2. | e-2. | d2. |',
      Eb: 'o3 e- b- >e- g e- <b-',
      Ab: 'o2 a- >e- a- >c <a- e-',
      Bb: 'o2 b- >f b- >d <b- f',
      Cm: 'o3 c g >c e- c <g',
      Gm: 'o2 g >d g b- g d',
      Fm: 'o2 f >c f a- f c',
      WA: '{Eb}|{Ab}|{Eb}|{Bb}|{Cm}|{Ab}|{Bb}|{Eb}|',
      WB: '{Ab}|{Bb}|{Gm}|{Cm}|{Fm}|{Bb}|{Ab}|{Bb}|',
    },
    p1: '@warm v11 q8 {A}{B}{A}',
    p2: '@soft v8 q8 {IA}{IB}{IA}',
    wv: '@harp v11 l8 {WA}{WB}{WA}',
    ns: '[v3 b4 v2 h4 h4 |]24',
  },

  // --------------------------------------------------------------------------
  // INDOOR — G major, cosy swung home/shop tune: seventh chords, a walking
  // bass and soft guide-tone pads.
  indoor: {
    bpm: 104,
    key: 'G',
    mode: 'major',
    swing: 0.22,
    p1: `@lead v11 o4
      b8 >d8 f+4. e8 d4 | e8 d8 <b4 g2 | >c8 e8 g4. e8 c4 | f+4. e8 d4 c4 |
      <b8 >d8 f+4. e8 d4 | g8 f+8 e4 <b2 | >c4 e4 f+4 a4 | g2. r4 |
      e4. d8 e4 g4 | f+2 d4 <b4 | >c8 d8 e8 g8 a4 g4 | f+4. e8 d2 |
      e4. d8 c4 <b4 | >f+4 d4 <a4 b4 | >c4 e4 d4 c4 | <b2. r4 |`,
    p2: `@soft v8 q8 o4
      f+1 | g1 | g1 | f+1 | f+1 | g1 | g2 f+2 | e1 |
      o3 b1 | a1 | g1 | f+1 | o4 e1 | d1 | c1 | <b1 |`,
    wv: `@bassp v13 q7 o2
      g4 a4 b4 >d4 | e4 d4 <b4 g4 | a4 b4 >c4 c+4 | d4 c4 <a4 f+4 |
      g4 b4 >d4 <b4 | >e4 d4 <b4 g4 | a4 >c4 d4 <f+4 | g4 >d4 e4 <b4 |
      >c4 e4 g4 e4 | <b4 >d4 f+4 d4 | <a4 >c4 e4 c4 | d4 <a4 f+4 a4 |
      >c4 e4 g4 e4 | <b4 >d4 f+4 <a4 | a4 >c4 d4 <f+4 | g4 b4 >d4 <f+4 |`,
    ns: '[v6 k4 v6 b8 v3 h8 v5 h4 v6 b8 v3 h8 |]15 v6 k4 v6 b8 v3 h8 v5 b8 v6 b8 v7 b8 v8 b8 |',
  },

  // --------------------------------------------------------------------------
  // FESTIVAL — C major jig (12/8 written as triplets), AABB, fiddle-style
  // thirds on pulse 2, "boom-chick" bass.
  festival: {
    bpm: 120,
    key: 'C',
    mode: 'major',
    parts: {
      A: `o5 e12 c12 e12 g12 e12 g12 >c6 <g12 e6 c12 | f12 a12 >c12 <a6 f12 a12 g12 f12 e6 d12 |
          e6 g12 >c6 <g12 e12 g12 e12 d6 c12 | d6 <b12 g6 b12 >d6 g12 f6 d12 |
          e12 c12 e12 g12 e12 g12 >c6 <g12 e6 c12 | f12 a12 >c12 f6 e12 d12 c12 <a12 >c6 <a12 |
          g12 b12 >d12 f6 d12 <b6 g12 >d6 <b12 | >c6 <g12 e6 g12 >c4 r4 |`,
      B: `o5 a6 e12 a6 >c12 <b6 a12 g6 e12 | g6 e12 b6 g12 >e6 d12 <b6 g12 |
          a6 f12 >c6 <a12 >f12 e12 d12 c6 <a12 | g6 e12 g6 >c12 <g12 e12 g12 e6 c12 |
          d12 f12 a12 >d6 <a12 f6 a12 >d6 c12 | <b6 g12 >d6 <b12 g12 a12 b12 >d6 <b12 |
          a6 f12 >c6 <a12 b6 g12 >d6 <b12 | >c6 <g12 e6 g12 >c4 r4 |`,
      JA: cat(jig('o3c', 'o2g', 'o3e'), jig('o2f', 'o3c', 'o2a'), jig('o3c', 'o2g', 'o3e'), jig('o2g', 'o3d', 'o2b'),
        jig('o3c', 'o2g', 'o3e'), jig('o2f', 'o3c', 'o2a'), jig('o2g', 'o3d', 'o2b'), 'o3c6 o2g12 o3e6 o2g12 o3c4 r4 |'),
      JB: cat(jig('o2a', 'o3e', 'o3c'), jig('o2e', 'o2b', 'o2g'), jig('o2f', 'o3c', 'o2a'), jig('o3c', 'o2g', 'o3e'),
        jig('o2d', 'o2a', 'o2f'), jig('o2g', 'o3d', 'o2b'), 'o2f6 o3c12 o2a6 o3c12 o2g6 o3d12 o2b6 o3d12 |', 'o3c6 o2g12 o3e6 o2g12 o3c4 r4 |'),
      DR: 'v9 k6 v4 h12 v8 s6 v4 h12 v9 k6 v6 k12 v8 s6 v5 m12 |',
      DC: 'v8 c6 v4 h12 v8 s6 v4 h12 v9 k6 v6 k12 v8 s6 v5 m12 |',
      DE: 'v9 k6 v4 h12 v8 s6 v4 h12 v10 c4 r4 |',
    },
    p1: '@lead v12 {A}{A}{B}{B}',
    p2: { from: 'p1', steps: -2, vol: 0.6, inst: 'harm' },
    wv: '@bassp v13 q6 {JA}{JA}{JB}{JB}',
    ns: '[{DC}[{DR}]6{DE}]4',
  },

  // --------------------------------------------------------------------------
  // ENDING — C major. A triumphant brass march (12 bars) that settles into a
  // warm, singing coda (12 bars) and builds back up into the loop.
  ending: {
    bpm: 112,
    key: 'C',
    mode: 'major',
    parts: {
      T: `o4 g8. g16 >c4 e4 g4 | g4. f8 e4 d4 | c4. <b8 >c4 e4 | a2. g8 f8 |
          e8. e16 e4 g4 >c4 | c4. <a8 f4 a4 | g4. f8 d4 <b4 | >d2 g4 f4 |
          e4 g4 >c2 | <a4. g8 f4 >c4 | d4 c4 <b4 g4 | >c1 |`,
      W: `o5 c2. <a4 | b2. g4 | a4 >d4 f4. e8 | e2 d4 c4 |
          f2 e4 c4 | e2 d4 <b4 | >c4 d4 f4 a4 | g2. r4 |
          e4. d8 c4 e4 | a2 g4 f4 | f4. e8 d4 c4 | d2. r4 |`,
      PT: `o4 e8. e16 g4 >c4 e4 | e4. d8 c4 <b4 | a4. g8 a4 >c4 | f2. e8 d8 |
           c8. c16 c4 e4 g4 | a4. f8 c4 f4 | d4. d8 <b4 g4 | b2 >d4 <b4 |
           >c4 e4 g2 | f4. e8 c4 a4 | f4 a4 g4 d4 | e2 g2 |`,
      F: 'o3 f a >c f c <a f a',
      Em: 'o3 e g b >e <b g e g',
      Dm: 'o3 d f a >d <a f d f',
      C: 'o3 c e g >c <g e c e',
      Dm7: 'o3 d f a >c <a f d f',
      G: 'o3 g b >d g d <b g b',
      Am: 'o3 a >c e a e c <a >c',
      G7: 'o3 g b >d f d <b g b',
      PW: '{F}|{Em}|{Dm}|{C}|{F}|{Em}|{Dm7}|{G}|{Am}|{F}|{Dm7}|{G7}|',
      BT: `o3c4 o2g4 o3c4 o2g4 | o2g4 o3d4 o2g4 o2b4 | o2a4 o3e4 o2a4 o3c4 | o2f4 o3c4 o2f4 o2g4 |
           o3c4 o2g4 o3c4 o3e4 | o3f4 o3c4 o2a4 o2f4 | o2g4 o3d4 o2b4 o2g4 | o2g4 o2b4 o3d4 o3f4 |
           o3c4 o2g4 o3c4 o3e4 | o2f4 o2a4 o3c4 o2a4 | o2d4 o2a4 o2g4 o2b4 | o3c4 o2g4 o2e4 o2c4 |`,
      BW: `o2f2 o3c2 | o2e2 o2b2 | o2d2 o2a2 | o3c2 o2g2 | o2f2 o3c2 | o2e2 o2b2 |
           o2d2 o3c2 | o2g2 o3d2 | o2a2 o3e2 | o2f2 o3c2 | o2d2 o2a2 | o2g2 o2b2 |`,
      MR: 'v9 k4 v7 s8. s16 v9 k4 v8 s8 s8 |',
      MC: 'v9 c4 v7 s8. s16 v9 k4 v8 s8 s8 |',
      ROLL: 'v6 s16 s16 s16 s16 v8 s16 s16 s16 s16 v10 c2 |',
      SW: 'v5 k4 v2 h8 h8 v5 b4 v2 h8 h8 |',
      UP: 'v5 k4 v2 h8 h8 v5 b8 v6 b8 v7 b8 v8 b8 |',
    },
    p1: '@brass v12 {T} @warm v11 q8 {W}',
    p2: '@harm v10 {PT} @pluck v8 l8 {PW}',
    wv: '@bass v13 q6 {BT} @sub v12 q8 {BW}',
    ns: '{MC}[{MR}]7{MC}[{MR}]2{ROLL} [{SW}]11{UP}',
  },

  // ==========================================================================
  //  JINGLES (loop: false)
  // ==========================================================================
  // New day: a sunrise arpeggio that lands on a shimmering tonic.
  j_morning: {
    bpm: 132,
    key: 'C',
    mode: 'major',
    loop: false,
    p1: '@lead v12 o4 g8 >c8 e8 g8 a8 g8 e8 g8 | >c2. r4 |',
    p2: '@harm v9 o4 e8 g8 >c8 e8 f8 e8 c8 e8 | x0,4,7 c2. x r4 |',
    wv: '@bass v12 o3 c4 e4 f4 g4 | c2. r4 |',
    ns: 'v4 h8 h8 h8 h8 v5 h8 h8 v7 s8 s16 s16 | v8 c2. r4 |',
  },
  // Evening shipment tally: counting blips, then a pleased cadence.
  j_ship: {
    bpm: 144,
    key: 'F',
    mode: 'major',
    loop: false,
    p1: '@lead v12 o5 c16 f16 a16 >c16 <c16 f16 a16 >c16 <d16 g16 b-16 >d16 <e16 g16 b-16 >e16 | <f4 c8 f8 a4 r4 |',
    p2: '@stab v9 x0,4,7 o4 f8 f8 f8 f8 x0,3,7 g8 g8 x0,4,7,10 c8 c8 | x0,4,7 f4 r8 f8 f4 r4 |',
    wv: '@bassp v12 o2 f4 a4 g4 >c4 | <f4 r8 >c8 <f4 r4 |',
    ns: 'v4 [h16]12 v6 s16 s16 v7 s16 s16 | v8 k4 r8 v6 s8 v8 c4 r4 |',
  },
  // Goal achieved: a rising brass fanfare.
  j_goal: {
    bpm: 144,
    key: 'C',
    mode: 'major',
    loop: false,
    p1: '@brass v12 o5 c8. c16 c8. d16 e4 g4 | f8. f16 f8. g16 a4 b4 | >c2.',
    p2: '@harm v10 o4 g8. g16 g8. b16 >c4 e4 | c8. c16 c8. e16 f4 g4 | x0,5,9 g2.',
    wv: '@bass v12 o3 c8. c16 c8. c16 c4 <g4 | f8. f16 f8. f16 f4 g4 | >c2.',
    ns: 'v8 k8. v6 s16 v8 k8. v6 s16 v9 k4 v8 s4 | v8 k8. v6 s16 v8 k8. v6 s16 v9 k4 v8 s8 s8 | v10 c2.',
  },
  // Got an item / animal: short triplet flourish.
  j_fanfare: {
    bpm: 150,
    key: 'G',
    mode: 'major',
    loop: false,
    p1: '@brass v12 o5 d12 d12 d12 g4 b4 >d2',
    p2: '@harm v10 o4 b12 b12 b12 >d4 g4 x0,3,8 b2',
    wv: '@bass v12 o2 g12 g12 g12 g4 >d4 g2',
    ns: 'v5 s12 s12 s12 v8 k4 v7 s4 v9 c2',
  },
  // Going to bed: a slow descent onto the tonic.
  j_sleep: {
    bpm: 96,
    key: 'Eb',
    mode: 'major',
    loop: false,
    p1: '@warm v10 q8 o5 b-4 g4 e-4 f4 | d4 <b-4 >e-2 |',
    p2: '@soft v8 q8 o4 g2 a-2 | f2 g2 |',
    wv: '@harp v10 l8 o2 e- b- >e- g <a- >e- a- >c | o2 b- >f b- >d o2 e-2 |',
    ns: 'v3 b2 v2 b2 | v2 b2 r2 |',
  },
  // Collapsed from exhaustion: a woozy chromatic slump and a thud.
  j_faint: {
    bpm: 120,
    key: 'D',
    mode: 'minor',
    chromatic: true,
    loop: false,
    p1: '@lead50 v11 o5 a8 g+8 g8 f+8 f8 e8 d+8 d8 | ~<d2 r4',
    p2: '@harm v8 o4 f8 e8 e-8 d8 c+8 c8 <b8 b-8 | a2 r4',
    wv: '@bass v12 o3 d4 c+4 c4 <b4 | o2 d2 r4',
    ns: 'r2 r4 v4 b8 b8 | v11 t4 r4 r4',
  },
};
