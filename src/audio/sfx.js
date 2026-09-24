// Moonlit Acres — synthesized Game Boy-style sound effects and ambient loops.
//
// Each SFX is a function receiving a builder `s` (see Synth in audio.js):
//
//   s.tone({ at, dur, note | freq, type, duty, wave, vol, a, d, s, r,
//            to, toAt, glide, curve, from, fromT, seq, stepTime, arp, rate, vib, filter, pan })
//     at      start offset (s)          dur     time until release (s)
//     note    'C6' / MIDI, or freq (Hz)  type    'pulse' (default) | 'wave' | 'sine'
//     duty    0..3 → 12.5/25/50/75 %     wave    wave-table name for type 'wave'
//     vol     peak 0..1                  a/d/s/r attack, decay time-constant, sustain, release
//                                                (giving d without s decays to silence)
//     to      glide target (note/Hz), starting at toAt and lasting `glide` s
//     from    pitch to scoop in from over fromT s
//     seq     one-shot semitone steps every stepTime s (GB-style pitch sequence)
//     arp     cycling semitone offsets every `rate` s
//     vib     [depth semitones, rate Hz, delay s]
//     filter  { type, f, q, to, toT }    pan -1..1
//
//   s.noise({ at, dur, clock, to, short, src, vol, a, d, s, r, filter, pan })
//     clock   LFSR steps per second (low = rumbly, high = hissy); `to` sweeps it
//     short   7-bit LFSR mode (metallic / tonal);  src:'amb' uses the long ambient noise
//
//   s.duck    set < 1 to dip the music under this effect
//
// Global opts from engine.sfx(name, { pitch, volume }) are applied by the builder.

const range = (n) => Array.from({ length: n }, (_, i) => i);

export const SFX = {
  // ---------------------------------------------------------------- UI
  cursor(s) {
    s.tone({ duty: 1, note: 'B6', dur: 0.022, vol: 0.22, r: 0.015 });
  },
  confirm(s) {
    s.tone({ duty: 2, note: 'E6', dur: 0.045, vol: 0.24, r: 0.01 });
    s.tone({ at: 0.055, duty: 2, note: 'B6', dur: 0.07, vol: 0.24, d: 0.1, s: 0.4, r: 0.05 });
  },
  cancel(s) {
    s.tone({ duty: 1, note: 'A6', to: 'D6', dur: 0.09, glide: 0.08, vol: 0.22, r: 0.03 });
  },
  text(s) {
    s.tone({ duty: 0, note: 'E6', dur: 0.012, vol: 0.09, a: 0.001, r: 0.012 });
  },
  menu_open(s) {
    s.tone({ duty: 1, note: 'C6', seq: [0, 4, 7, 12], stepTime: 0.028, dur: 0.11, vol: 0.2, r: 0.04 });
  },
  menu_close(s) {
    s.tone({ duty: 1, note: 'C6', seq: [12, 7, 4, 0], stepTime: 0.028, dur: 0.11, vol: 0.2, r: 0.04 });
  },
  error(s) {
    s.tone({ duty: 1, freq: 147, dur: 0.08, vol: 0.34, r: 0.02 });
    s.tone({ at: 0.11, duty: 1, freq: 139, dur: 0.13, vol: 0.34, r: 0.03 });
  },

  // ---------------------------------------------------------------- tools
  hoe(s) {
    s.duck = 0.85;
    s.tone({ type: 'wave', wave: 'sine', freq: 150, to: 55, glide: 0.08, dur: 0.07, vol: 0.7, d: 0.05, r: 0.03 });
    s.noise({ clock: 8000, to: 2500, dur: 0.06, vol: 0.45, d: 0.04, r: 0.03 });
    s.noise({ at: 0.05, clock: 16000, dur: 0.09, vol: 0.18, d: 0.05, filter: { type: 'lowpass', f: 3000 } });
  },
  water(s) {
    s.duck = 0.85;
    s.noise({ clock: 60000, dur: 0.38, vol: 0.12, a: 0.03, r: 0.1, filter: { type: 'bandpass', f: 2400, q: 0.9 } });
    for (const k of range(8))
      s.noise({ at: k * 0.042, clock: 40000 + k * 4000, dur: 0.025, vol: 0.2 * (1 - k / 11), d: 0.018,
        filter: { type: 'bandpass', f: 3000 + (k % 3) * 700, q: 1.4 }, pan: ((k % 3) - 1) * 0.3 });
  },
  sickle(s) {
    s.duck = 0.85;
    s.noise({ clock: 30000, to: 140000, dur: 0.12, vol: 0.38, a: 0.02, d: 0.06, r: 0.04,
      filter: { type: 'bandpass', f: 1600, to: 6500, q: 1.4 } });
    s.noise({ at: 0.08, short: true, clock: 90000, dur: 0.025, vol: 0.12, d: 0.02 });
  },
  hammer(s) {
    s.duck = 0.8;
    s.noise({ short: true, clock: 36000, dur: 0.05, vol: 0.4, d: 0.045, r: 0.04 });
    s.tone({ duty: 0, note: 'A6', dur: 0.01, vol: 0.2, d: 0.07, r: 0.12 });
    s.tone({ duty: 0, freq: 2489, dur: 0.01, vol: 0.12, d: 0.05, r: 0.1 });
    s.tone({ type: 'wave', wave: 'sine', freq: 190, to: 80, glide: 0.06, dur: 0.06, vol: 0.55, d: 0.04 });
  },
  axe(s) {
    s.duck = 0.8;
    s.tone({ type: 'wave', wave: 'sine', freq: 330, to: 120, glide: 0.06, dur: 0.06, vol: 0.65, d: 0.045 });
    s.noise({ clock: 12000, dur: 0.05, vol: 0.4, d: 0.03, filter: { type: 'lowpass', f: 2600 } });
    s.tone({ duty: 2, freq: 540, to: 420, dur: 0.02, vol: 0.15, r: 0.02 });
  },
  rock_break(s) {
    s.duck = 0.75;
    s.tone({ type: 'wave', wave: 'sine', freq: 120, to: 50, glide: 0.12, dur: 0.1, vol: 0.55, d: 0.07 });
    for (const k of range(4))
      s.noise({ at: k * 0.055, clock: 9000 - k * 1600, dur: 0.07, vol: 0.5 - k * 0.09, d: 0.045, r: 0.03, pan: (k % 2 ? 0.25 : -0.25) });
    s.noise({ at: 0.24, clock: 22000, dur: 0.03, vol: 0.14, d: 0.02 });
    s.noise({ at: 0.31, clock: 18000, dur: 0.03, vol: 0.1, d: 0.02 });
  },
  wood_break(s) {
    s.duck = 0.75;
    s.noise({ clock: 42000, to: 7000, dur: 0.08, vol: 0.5, d: 0.05, r: 0.03 });
    s.tone({ duty: 0, freq: 320, to: 90, glide: 0.24, dur: 0.24, vol: 0.28, d: 0.12, r: 0.05 });
    s.tone({ at: 0.17, type: 'wave', wave: 'sine', freq: 260, to: 110, glide: 0.05, dur: 0.05, vol: 0.5, d: 0.04 });
    s.noise({ at: 0.17, clock: 14000, dur: 0.04, vol: 0.3, d: 0.03 });
    s.tone({ at: 0.29, type: 'wave', wave: 'sine', freq: 220, to: 100, glide: 0.05, dur: 0.05, vol: 0.35, d: 0.04 });
  },

  // ---------------------------------------------------------------- farming
  harvest(s) {
    s.duck = 0.7;
    s.noise({ clock: 30000, dur: 0.02, vol: 0.22, d: 0.015 });
    s.tone({ duty: 1, note: 'G5', seq: [0, 4, 7, 12], stepTime: 0.045, dur: 0.19, vol: 0.28, r: 0.08 });
    s.tone({ at: 0.02, duty: 0, note: 'D5', seq: [0, 5, 9, 12], stepTime: 0.045, dur: 0.17, vol: 0.12, r: 0.08, pan: 0.3 });
  },
  pickup(s) {
    s.duck = 0.85;
    s.tone({ duty: 1, note: 'E6', to: 'E7', glide: 0.07, dur: 0.08, vol: 0.24, r: 0.04 });
  },
  seed(s) {
    for (const [i, at] of [0, 0.03, 0.065, 0.1, 0.14, 0.185].entries())
      s.noise({ at, clock: 100000 + i * 9000, dur: 0.008, vol: 0.18 - i * 0.015, d: 0.01, r: 0.01,
        filter: { type: 'highpass', f: 3000 }, pan: ((i % 3) - 1) * 0.35 });
    s.noise({ clock: 50000, dur: 0.2, vol: 0.05, a: 0.04, r: 0.05, filter: { type: 'bandpass', f: 4500, q: 1 } });
  },
  ship(s) {
    s.duck = 0.7;
    s.noise({ clock: 20000, to: 90000, dur: 0.15, vol: 0.22, a: 0.05, r: 0.03, filter: { type: 'bandpass', f: 1400, to: 4200, q: 1 } });
    s.tone({ at: 0.16, type: 'wave', wave: 'sine', freq: 150, to: 65, glide: 0.08, dur: 0.08, vol: 0.6, d: 0.06 });
    s.noise({ at: 0.16, clock: 6000, dur: 0.05, vol: 0.32, d: 0.035 });
    s.tone({ at: 0.27, duty: 0, note: 'E6', dur: 0.02, vol: 0.22, d: 0.18, r: 0.25 });
    s.tone({ at: 0.27, duty: 0, note: 'B6', dur: 0.02, vol: 0.1, d: 0.14, r: 0.2, pan: 0.3 });
  },
  coin(s) {
    s.duck = 0.8;
    s.noise({ short: true, clock: 200000, dur: 0.012, vol: 0.12, d: 0.01 });
    s.tone({ duty: 2, note: 'G6', dur: 0.05, vol: 0.24, r: 0.008 });
    s.tone({ at: 0.058, duty: 2, note: 'D7', dur: 0.16, vol: 0.24, d: 0.12, s: 0.25, r: 0.1 });
  },
  buy(s) {
    s.duck = 0.75;
    s.noise({ short: true, clock: 64000, dur: 0.035, vol: 0.34, d: 0.03, r: 0.02 });
    s.noise({ at: 0.035, clock: 9000, dur: 0.03, vol: 0.25, d: 0.02 });
    s.tone({ at: 0.08, duty: 1, note: 'E6', arp: [0, 4, 7, 12], rate: 1 / 50, dur: 0.05, vol: 0.2, d: 0.2, s: 0.35, r: 0.25 });
    s.tone({ at: 0.08, duty: 0, note: 'B6', dur: 0.05, vol: 0.12, d: 0.25, r: 0.3, pan: 0.3 });
  },
  refill(s) {
    s.duck = 0.8;
    s.noise({ clock: 30000, dur: 0.5, vol: 0.12, a: 0.03, r: 0.1, filter: { type: 'bandpass', f: 1100, to: 2600, q: 1 } });
    for (const k of range(7))
      s.tone({ at: k * 0.07, type: 'sine', freq: 300 + k * 90, to: 620 + k * 140, glide: 0.045, dur: 0.045, vol: 0.18, r: 0.02 });
  },
  splash(s) {
    s.duck = 0.75;
    s.noise({ clock: 70000, to: 9000, glide: 0.4, dur: 0.36, vol: 0.45, a: 0.004, d: 0.16, r: 0.08,
      filter: { type: 'lowpass', f: 7000, to: 1400 } });
    for (const k of range(3))
      s.tone({ at: 0.12 + k * 0.07, type: 'sine', freq: 700 + k * 260, to: 1500 + k * 300, glide: 0.03, dur: 0.03, vol: 0.12, r: 0.02 });
  },

  // ---------------------------------------------------------------- fishing
  cast(s) {
    s.duck = 0.8;
    s.noise({ clock: 20000, to: 110000, dur: 0.2, vol: 0.28, a: 0.08, r: 0.05, filter: { type: 'bandpass', f: 900, to: 5000, q: 1.5 } });
    for (const k of range(8))
      s.noise({ at: 0.2 + k * 0.032, short: true, clock: 80000, dur: 0.008, vol: 0.12 - k * 0.01, d: 0.008, r: 0.01 });
  },
  bite(s) {
    s.duck = 0.75;
    s.noise({ clock: 8000, dur: 0.04, vol: 0.28, d: 0.03, filter: { type: 'lowpass', f: 2000 } });
    s.tone({ at: 0.03, duty: 1, note: 'A6', dur: 0.045, vol: 0.26, r: 0.01 });
    s.tone({ at: 0.1, duty: 1, note: 'A6', dur: 0.045, vol: 0.26, r: 0.02 });
  },
  catch(s) {
    s.duck = 0.65;
    s.noise({ clock: 60000, to: 10000, dur: 0.18, vol: 0.22, d: 0.08, filter: { type: 'lowpass', f: 6000, to: 1500 } });
    s.tone({ duty: 2, note: 'C6', seq: [0, 4, 7, 12, 16], stepTime: 0.055, dur: 0.34, vol: 0.24, d: 0.3, s: 0.5, r: 0.14 });
    s.tone({ duty: 1, note: 'C5', seq: [0, 4, 7, 12, 16], stepTime: 0.055, dur: 0.34, vol: 0.14, d: 0.3, s: 0.5, r: 0.14, pan: 0.3 });
  },
  fail(s) {
    s.duck = 0.7;
    s.tone({ duty: 2, note: 'G5', to: 'F#5', dur: 0.18, vol: 0.24, r: 0.03 });
    s.tone({ at: 0.22, duty: 2, note: 'F5', to: 'C#5', toAt: 0.05, glide: 0.35, dur: 0.4, vol: 0.24, vib: [0.4, 7, 0.1], r: 0.08 });
  },

  // ---------------------------------------------------------------- house & life
  door(s) {
    s.duck = 0.85;
    s.tone({ duty: 0, freq: 210, to: 270, glide: 0.2, dur: 0.2, vol: 0.1, a: 0.03, vib: [1.5, 17], r: 0.03 });
    s.tone({ at: 0.21, type: 'wave', wave: 'sine', freq: 115, to: 55, glide: 0.09, dur: 0.09, vol: 0.6, d: 0.06 });
    s.noise({ at: 0.21, clock: 4000, dur: 0.06, vol: 0.3, d: 0.04 });
  },
  eat(s) {
    s.duck = 0.85;
    for (const k of range(3)) {
      s.noise({ at: k * 0.13, clock: 9000 + (k % 2) * 3000, dur: 0.06, vol: 0.34, d: 0.035, filter: { type: 'lowpass', f: 3500 } });
      s.tone({ at: k * 0.13, type: 'wave', wave: 'sine', freq: 210, to: 120, glide: 0.04, dur: 0.04, vol: 0.25, r: 0.02 });
    }
    s.tone({ at: 0.43, type: 'sine', freq: 300, to: 620, glide: 0.06, dur: 0.06, vol: 0.18, r: 0.03 });
  },
  tired(s) {
    s.duck = 0.8;
    s.noise({ clock: 30000, dur: 0.45, vol: 0.1, a: 0.1, r: 0.12, filter: { type: 'bandpass', f: 1500, to: 700, q: 0.8 } });
    s.tone({ duty: 2, note: 'A5', to: 'D5', glide: 0.5, dur: 0.5, vol: 0.2, a: 0.05, vib: [0.35, 6, 0.05], r: 0.1 });
  },
  heart(s) {
    s.duck = 0.8;
    s.tone({ duty: 0, note: 'E6', seq: [0, 4, 7], stepTime: 0.07, dur: 0.24, vol: 0.22, d: 0.3, s: 0.4, r: 0.15, vib: [0.2, 6, 0.2] });
    s.tone({ at: 0.14, duty: 1, note: 'B6', dur: 0.03, vol: 0.1, d: 0.2, r: 0.2, pan: 0.35 });
  },
  milk(s) {
    for (const k of range(2)) {
      s.noise({ at: k * 0.18, clock: 50000, dur: 0.09, vol: 0.28, a: 0.01, d: 0.06, r: 0.03,
        filter: { type: 'bandpass', f: 2600, to: 1400, q: 2 } });
      s.tone({ at: k * 0.18 + 0.02, type: 'sine', freq: 900, to: 700, dur: 0.05, vol: 0.07, r: 0.02 });
    }
  },
  brush(s) {
    for (const k of range(3))
      s.noise({ at: k * 0.12, clock: 80000, dur: 0.08, vol: 0.2, a: 0.03, d: 0.05, r: 0.03,
        filter: { type: 'bandpass', f: 3000 + k * 400, q: 1.2 }, pan: (k - 1) * 0.2 });
  },
  step(s) {
    s.noise({ clock: 6000, dur: 0.014, vol: 0.12, d: 0.012, r: 0.012, filter: { type: 'lowpass', f: 1800 } });
  },

  // ---------------------------------------------------------------- animals
  moo(s) {
    s.duck = 0.7;
    s.tone({ type: 'wave', wave: 'reed', from: 104, fromT: 0.22, freq: 128, to: 96, toAt: 0.32, glide: 0.5, dur: 0.78,
      vol: 0.5, a: 0.07, d: 0.5, s: 0.75, r: 0.16, vib: [0.25, 5, 0.25],
      filter: { type: 'lowpass', f: 380, to: 1100, toT: 0.3, q: 2.5 } });
  },
  cluck(s) {
    s.duck = 0.85;
    s.tone({ duty: 1, freq: 900, to: 620, dur: 0.035, vol: 0.24, r: 0.01 });
    s.tone({ at: 0.06, duty: 1, freq: 1150, to: 700, glide: 0.08, dur: 0.08, vol: 0.26, r: 0.02 });
    s.noise({ at: 0.06, clock: 30000, dur: 0.03, vol: 0.08, d: 0.02 });
    s.tone({ at: 0.2, duty: 1, freq: 820, to: 600, dur: 0.03, vol: 0.16, r: 0.01 });
  },
  bark(s) {
    s.duck = 0.8;
    for (const [k, f] of [[0, 560], [0.2, 500]]) {
      s.tone({ at: k, duty: 2, freq: f, to: f * 0.55, glide: 0.1, dur: 0.1, vol: 0.3, a: 0.005, r: 0.03,
        filter: { type: 'lowpass', f: 1800 } });
      s.noise({ at: k, clock: 12000, dur: 0.06, vol: 0.16, d: 0.04, filter: { type: 'bandpass', f: 900, q: 1 } });
    }
  },
  rooster(s) {
    s.duck = 0.6;
    const v = { duty: 1, vol: 0.24, r: 0.03 };
    s.tone({ ...v, at: 0, from: 'B5', fromT: 0.03, note: 'D6', dur: 0.08 });
    s.tone({ ...v, at: 0.12, from: 'D6', fromT: 0.03, note: 'F#6', dur: 0.08 });
    s.tone({ ...v, at: 0.24, from: 'F#6', fromT: 0.04, note: 'A6', dur: 0.11 });
    s.tone({ ...v, at: 0.4, from: 'A6', fromT: 0.08, note: 'D7', to: 'A6', toAt: 0.3, glide: 0.4, dur: 0.72, vib: [0.35, 7, 0.15], r: 0.12 });
    s.tone({ duty: 0, at: 0.4, from: 'A5', fromT: 0.08, note: 'D6', to: 'A5', toAt: 0.3, glide: 0.4, dur: 0.72, vol: 0.08, vib: [0.35, 7, 0.15], r: 0.12, pan: 0.3 });
    s.noise({ at: 0.4, clock: 40000, dur: 0.6, vol: 0.04, a: 0.1, r: 0.2, filter: { type: 'bandpass', f: 2500, q: 1 } });
  },

  // ---------------------------------------------------------------- weather
  thunder(s) {
    s.duck = 0.5;
    s.noise({ clock: 60000, dur: 0.1, vol: 0.5, d: 0.08, r: 0.05, filter: { type: 'lowpass', f: 5000 } });
    s.noise({ at: 0.03, clock: 2000, to: 700, glide: 2.0, dur: 1.6, vol: 0.55, a: 0.08, d: 0.9, s: 0.25, r: 0.8,
      filter: { type: 'lowpass', f: 420, to: 150, q: 0.8 } });
    s.noise({ at: 0.05, src: 'amb', dur: 1.8, vol: 0.6, a: 0.2, d: 1.0, s: 0.3, r: 0.9, filter: { type: 'lowpass', f: 260, q: 0.9 } });
    s.noise({ at: 0.7, src: 'amb', dur: 0.8, vol: 0.35, a: 0.25, d: 0.5, r: 0.6, filter: { type: 'lowpass', f: 180, q: 1 } });
  },
};

// ----------------------------------------------------------------------------
// Ambient loops: noise `beds` (looped ambient LFSR noise through filters, with
// optional slow gain / filter LFOs) plus randomly timed `events` built with the
// same builder as SFX. lfo: [rate Hz, depth fraction]; flfo: [rate Hz, depth Hz].
const rpan = (r, w = 0.8) => (r() * 2 - 1) * w;

export const AMBIENT = {
  rain: {
    gain: 0.55,
    beds: [
      { gain: 0.2, filters: [['highpass', 700], ['lowpass', 6000]], lfo: [0.11, 0.18] },
      { gain: 0.16, filters: [['lowpass', 800]], lfo: [0.07, 0.25] },
    ],
    events: [
      { every: [0.02, 0.09], play: (s, r) => s.noise({ clock: 60000 + r() * 80000, dur: 0.005, d: 0.008, r: 0.01, vol: 0.05 + r() * 0.09,
        filter: { type: 'bandpass', f: 2500 + r() * 4000, q: 2 }, pan: rpan(r) }) },
      { every: [0.3, 1.2], play: (s, r) => s.tone({ type: 'sine', freq: 1400 + r() * 1400, to: 2600 + r() * 1200, glide: 0.02,
        dur: 0.02, vol: 0.03 + r() * 0.03, r: 0.02, pan: rpan(r) }) },
    ],
  },
  storm: {
    gain: 0.6,
    beds: [
      { gain: 0.3, filters: [['highpass', 500], ['lowpass', 4500]], lfo: [0.17, 0.3] },
      { gain: 0.28, filters: [['lowpass', 500]], lfo: [0.09, 0.35] },
    ],
    events: [
      { every: [0.01, 0.05], play: (s, r) => s.noise({ clock: 50000 + r() * 90000, dur: 0.005, d: 0.008, r: 0.01, vol: 0.06 + r() * 0.1,
        filter: { type: 'bandpass', f: 2000 + r() * 4000, q: 2 }, pan: rpan(r) }) },
      { every: [5, 11], first: 1.5, play: (s, r) => {
        const len = 2 + r() * 2;
        s.noise({ src: 'amb', dur: len, vol: 0.4 + r() * 0.25, a: 0.6 + r() * 0.6, d: len * 0.6, s: 0.4, r: 1.4,
          filter: { type: 'lowpass', f: 140 + r() * 90, q: 0.8 }, pan: rpan(r, 0.4) });
        s.noise({ at: 0.3, clock: 1500, to: 800, glide: len, dur: len * 0.7, vol: 0.12, a: 0.5, d: len * 0.5, r: 1,
          filter: { type: 'lowpass', f: 320, q: 0.7 } });
      } },
    ],
  },
  wind: {
    gain: 0.55,
    beds: [
      { gain: 0.3, filters: [['bandpass', 520, 0.8]], flfo: [0.06, 260], lfo: [0.09, 0.55] },
      { gain: 0.1, filters: [['bandpass', 1500, 2.5]], flfo: [0.13, 600], lfo: [0.05, 0.7] },
    ],
    events: [
      { every: [4, 9], first: 2, play: (s, r) => s.noise({ src: 'amb', dur: 1.6 + r(), vol: 0.22 + r() * 0.12, a: 0.9, d: 0.8, s: 0.4, r: 1.1,
        filter: { type: 'bandpass', f: 380 + r() * 200, to: 900 + r() * 700, toT: 1.8, q: 1.6 }, pan: rpan(r, 0.6) }) },
    ],
  },
  stream: {
    gain: 0.5,
    beds: [
      { gain: 0.24, filters: [['bandpass', 1500, 0.6]], flfo: [0.31, 350], lfo: [0.47, 0.2] },
      { gain: 0.1, filters: [['highpass', 3200]], lfo: [0.83, 0.3] },
      { gain: 0.1, filters: [['lowpass', 450]] },
    ],
    events: [
      { every: [0.04, 0.2], play: (s, r) => {
        const f = 480 + r() * 1000;
        s.tone({ type: 'sine', freq: f, to: f * (1.4 + r() * 0.6), glide: 0.025 + r() * 0.02, dur: 0.03, vol: 0.03 + r() * 0.05, r: 0.02, pan: rpan(r, 0.7) });
      } },
    ],
  },
  crickets: {
    gain: 0.45,
    beds: [{ gain: 0.05, filters: [['lowpass', 1200]], lfo: [0.05, 0.3] }],
    events: [
      { every: [0.7, 1.9], play: (s, r) => chirp(s, 4400, 3 + Math.floor(r() * 3), 0.1, -0.45) },
      { every: [0.9, 2.6], first: 0.4, play: (s, r) => chirp(s, 5100, 2 + Math.floor(r() * 3), 0.08, 0.5) },
      { every: [1.5, 3.5], first: 1.1, play: (s, r) => chirp(s, 3900, 4, 0.04, rpan(r, 0.3)) },
    ],
  },
};

function chirp(s, f, pulses, vol, pan) {
  for (let k = 0; k < pulses; k++)
    s.tone({ at: k * 0.045, duty: 2, freq: f, dur: 0.02, vol, a: 0.004, r: 0.012, pan });
}
