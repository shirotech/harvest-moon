// Moonlit Acres — Game Boy-flavoured WebAudio chiptune engine.
//
// Voices emulate the four DMG/GBC APU channels:
//   p1, p2  pulse waves (duty 12.5 / 25 / 50 / 75 %) built as band-limited PeriodicWaves
//   wv      the 4-bit wavetable channel (32-sample hex waveforms, stepped like the real DAC)
//   ns      the LFSR noise channel (15-bit "long" and 7-bit "short"/metallic modes)
//
// Music is written in the text notation documented in songs.js and compiled once to
// timed note events. Playback uses a lookahead scheduler (a ~25 ms tick that schedules
// nodes ~120 ms ahead on the AudioContext clock), so timing never depends on the
// main thread. Every note is a short-lived node chain that disconnects itself when it
// ends.
//
// Signal flow:  voices → channel gain/pan → player → duck → music bus ┐
//               sfx voices ───────────────────────────────→ sfx bus ├→ master → HP → LP → soft clip → out
//               ambient beds/events → ambient bus → sfx bus ─────────┘
//
// Nothing touches WebAudio until unlock() is called from a user gesture; without
// WebAudio every method is a harmless no-op.

import { SONGS, INSTRUMENTS, WAVES, DRUMS } from './songs.js';
import { SFX, AMBIENT } from './sfx.js';

// ---------------------------------------------------------------------------
// constants

export const TPQ = 96; // ticks per quarter note
const WHOLE = TPQ * 4;
const CHANNELS = ['p1', 'p2', 'wv', 'ns'];
const KIND = { p1: 'pulse', p2: 'pulse', wv: 'wave', ns: 'noise' };
const DEFAULT_INST = { p1: 'lead', p2: 'soft', wv: 'bass' };
const MIX = { p1: 0.26, p2: 0.17, wv: 0.2, ns: 0.2 }; // per-channel music mix (lead on top)
const PAN = { p1: -0.12, p2: 0.2, wv: 0, ns: -0.06 };
const LOOKAHEAD = 0.12; // seconds scheduled ahead of the clock
const HIDDEN_LOOKAHEAD = 1.2; // background tabs tick slowly; look further ahead
const TICK_MS = 25;
const MUSIC_LEVEL = 1.0;
const SFX_LEVEL = 1.1;
const AMB_LEVEL = 0.6;
const JINGLE_TAIL = 0.6;
const SR = 44100;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const KEY_PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

/** 'C6', 'F#5', 'Bb4' or a MIDI number → MIDI number. */
export function noteNum(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(n).trim());
  if (!m) throw new Error(`bad note ${n}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (parseInt(m[3], 10) + 1) + NOTE_BASE[m[1].toLowerCase()] + acc;
}
const hz = (x) => (typeof x === 'string' ? mtof(noteNum(x)) : x);

export function scaleOf(key, mode) {
  const root = KEY_PC[key] ?? 0;
  return (MODES[mode] || MODES.major).map((i) => (root + i) % 12).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// notation compiler (see the header of songs.js for the format)

function expandText(src, parts, where) {
  const strip = (s) => s.replace(/;[^\n]*/g, ' ');
  let s = strip(src);
  let guard = 0;
  while (/\{(\w+)\}/.test(s)) {
    if (++guard > 64) throw new Error(`${where}: macro recursion`);
    s = s.replace(/\{(\w+)\}/g, (_, n) => {
      if (!parts || !(n in parts)) throw new Error(`${where}: unknown part {${n}}`);
      return ` ${strip(parts[n])} `;
    });
  }
  const loop = /\[([^[\]]*)\](\d*)/;
  guard = 0;
  while (loop.test(s)) {
    if (++guard > 5000) throw new Error(`${where}: loop expansion runaway`);
    s = s.replace(loop, (_, body, n) => {
      const times = n ? parseInt(n, 10) : 2;
      const cut = body.indexOf('/');
      const full = body.replace('/', ' ');
      const last = cut >= 0 ? body.slice(0, cut) : full;
      let out = '';
      for (let i = 0; i < times; i++) out += ` ${i === times - 1 ? last : full} `;
      return out;
    });
  }
  if (/[[\]]/.test(s)) throw new Error(`${where}: unbalanced [ ]`);
  return s;
}

function parseChannel(text, kind, info) {
  const events = [];
  const warn = (m) => info.warnings.push(`${info.where}: ${m} (bar ${Math.floor(tick / info.barTicks) + 1})`);
  let i = 0;
  let tick = 0;
  let oct = 4;
  let len = WHOLE / 4;
  let vol = 12;
  let gate = 7;
  let inst = null;
  let K = 0;
  let arp = null;
  let glide = false;
  let lastMidi = null;
  const n = text.length;
  const readInt = (signed) => {
    const m = (signed ? /^-?\d+/ : /^\d+/).exec(text.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseInt(m[0], 10);
  };
  const readLen = () => {
    const d = readInt(false);
    let t;
    if (d != null) {
      t = WHOLE / d;
      if (!Number.isInteger(t) || d === 0) { warn(`odd length ${d}`); t = Math.round(t) || TPQ; }
    } else t = len;
    let add = t;
    while (text[i] === '.') { add /= 2; t += add; i++; }
    return t;
  };
  const readTies = (t) => {
    for (;;) {
      let j = i;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] !== '^') return t;
      i = j + 1;
      t += readLen();
    }
  };
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '|') {
      i++;
      if (tick % info.barTicks !== 0) warn(`bar line off by ${((tick % info.barTicks) / TPQ).toFixed(2)} beats`);
      continue;
    }
    if (kind === 'noise' && DRUMS[ch]) {
      i++;
      const dur = readTies(readLen());
      events.push({ tick, dur, drum: ch, vol });
      tick += dur;
      continue;
    }
    if (ch === 'r') { i++; tick += readTies(readLen()); continue; }
    if (ch === 'l') { i++; len = readLen(); continue; }
    if (ch === 'v') { i++; const v = readInt(false); if (v == null) warn('v needs a number'); else vol = Math.min(15, v); continue; }
    if (ch === 'q') { i++; const q = readInt(false); if (q == null) warn('q needs a number'); else gate = Math.min(8, Math.max(1, q)); continue; }
    if (kind !== 'noise') {
      if (ch === 'o') { i++; const o = readInt(false); if (o == null) warn('o needs a number'); else oct = o; continue; }
      if (ch === '>') { i++; oct++; continue; }
      if (ch === '<') { i++; oct--; continue; }
      if (ch === 'K') { i++; const k = readInt(true); if (k == null) warn('K needs a number'); else K = k; continue; }
      if (ch === '~') { i++; glide = true; continue; }
      if (ch === '@') {
        i++;
        const m = /^[A-Za-z_]\w*/.exec(text.slice(i));
        if (!m) { warn('@ needs a name'); continue; }
        i += m[0].length;
        if (!INSTRUMENTS[m[0]]) warn(`unknown instrument @${m[0]}`);
        else inst = m[0];
        continue;
      }
      if (ch === 'x') {
        i++;
        const m = /^[\d,]*/.exec(text.slice(i));
        i += m[0].length;
        const offs = m[0].split(',').filter(Boolean).map(Number);
        arp = offs.length > 1 ? offs : null;
        continue;
      }
      if (NOTE_BASE[ch] !== undefined) {
        i++;
        let semi = NOTE_BASE[ch];
        while (text[i] === '+' || text[i] === '#' || text[i] === '-') { semi += text[i] === '-' ? -1 : 1; i++; }
        const dur = readTies(readLen());
        const midi = 12 * (oct + 1) + semi + K;
        events.push({ tick, dur, midi, vol, inst, gate, arp, glideFrom: glide && lastMidi != null ? lastMidi : null });
        lastMidi = midi;
        glide = false;
        tick += dur;
        continue;
      }
    }
    warn(`unexpected '${ch}'`);
    i++;
  }
  return { events, ticks: tick };
}

function diatonicShift(midi, steps, scale) {
  let m = midi;
  while (!scale.includes(((m % 12) + 12) % 12)) m--;
  const chrom = midi - m;
  const n = scale.length;
  const deg = Math.floor(m / 12) * n + scale.indexOf(((m % 12) + 12) % 12) + steps;
  const oct = Math.floor(deg / n);
  return oct * 12 + scale[((deg % n) + n) % n] + chrom;
}

/** Compile a song definition into timed events. Pure; safe to call without WebAudio. */
export function compileSong(name, def) {
  const warnings = [];
  const meter = def.meter || 4;
  const barTicks = meter * TPQ;
  const spb = 60 / def.bpm;
  const raw = {};
  for (const id of CHANNELS) {
    const src = def[id];
    if (src == null || typeof src === 'object') continue;
    const where = `${name}.${id}`;
    try {
      raw[id] = parseChannel(expandText(src, def.parts, where), KIND[id], { warnings, where, barTicks });
    } catch (e) {
      warnings.push(String(e.message || e));
      raw[id] = { events: [], ticks: 0 };
    }
  }
  const lengths = Object.values(raw).map((r) => r.ticks);
  const lengthTicks = Math.max(0, ...lengths);
  for (const [id, r] of Object.entries(raw))
    if (r.ticks !== lengthTicks)
      warnings.push(`${name}.${id}: channel is ${(r.ticks / TPQ).toFixed(2)} beats, song is ${(lengthTicks / TPQ).toFixed(2)}`);
  const loop = def.loop !== false;
  // derived channels: echoes / diatonic harmonies of another channel
  for (const id of CHANNELS) {
    const d = def[id];
    if (d == null || typeof d !== 'object') continue;
    const src = raw[d.from];
    if (!src) { warnings.push(`${name}.${id}: derived from missing channel ${d.from}`); continue; }
    const delay = Math.round((d.delay || 0) * TPQ);
    const scale = scaleOf(def.key, def.mode);
    const events = [];
    for (const e of src.events) {
      let tick = e.tick + delay;
      if (tick >= lengthTicks) { if (!loop) continue; tick -= lengthTicks; }
      let midi = e.midi;
      if (d.steps) midi = diatonicShift(midi, d.steps, scale);
      if (d.semis) midi += d.semis;
      events.push({
        ...e,
        tick,
        midi,
        glideFrom: null,
        inst: d.inst || e.inst,
        gate: d.gate ?? e.gate,
        vol: Math.max(1, Math.round(e.vol * (d.vol ?? 0.5))),
      });
    }
    events.sort((a, b) => a.tick - b.tick);
    raw[id] = { events, ticks: lengthTicks };
  }
  // swing maps positions inside each beat (straight 8ths → long-short)
  const sw = Math.max(0, Math.min(0.45, def.swing || 0)) * (TPQ / 2);
  const swing = (tk) => {
    if (!sw) return tk;
    const pos = ((tk % TPQ) + TPQ) % TPQ;
    const base = tk - pos;
    const h = TPQ / 2;
    return base + (pos < h ? (pos * (h + sw)) / h : h + sw + ((pos - h) * (h - sw)) / h);
  };
  const toSec = (tk) => (swing(tk) / TPQ) * spb;
  const length = (lengthTicks / TPQ) * spb;
  const channels = [];
  for (const id of CHANNELS) {
    if (!raw[id]) continue;
    const events = raw[id].events.map((e) => {
      const t = toSec(e.tick);
      const out = { ...e, t, d: toSec(e.tick + e.dur) - t, inst: e.inst || DEFAULT_INST[id] };
      return out;
    });
    for (let k = 0; k < events.length; k++) {
      const e = events[k];
      const next = events[k + 1];
      e.gap = next ? next.t - e.t : loop && events.length ? events[0].t + length - e.t : Infinity;
    }
    channels.push({ id, kind: KIND[id], events });
  }
  return {
    name,
    bpm: def.bpm,
    meter,
    key: def.key,
    mode: def.mode,
    loop,
    length,
    beats: lengthTicks / TPQ,
    channels,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// per-context resources: pulse/wave tables and LFSR noise buffers

const RES = new WeakMap();

function makePulseWave(ctx, duty) {
  const N = 128;
  const re = new Float32Array(N + 1);
  const im = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) re[n] = (4 / (Math.PI * n)) * Math.sin(Math.PI * n * duty);
  return ctx.createPeriodicWave(re, im);
}

// Fourier series of the stepped (zero-order-hold) 32-sample waveform, so the table
// keeps the slightly gritty staircase character of the real wave channel.
function makeTableWave(ctx, hex) {
  const v = [...hex].map((c) => parseInt(c, 16) - 7.5);
  const N = 64;
  const re = new Float32Array(N + 1);
  const im = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    let cr = 0;
    let ci = 0;
    const k2 = 2 * Math.PI * n;
    for (let k = 0; k < 32; k++) {
      const a = (k2 * k) / 32;
      const b = (k2 * (k + 1)) / 32;
      cr += (v[k] * (Math.sin(b) - Math.sin(a))) / k2;
      ci += (v[k] * (Math.cos(b) - Math.cos(a))) / k2;
    }
    const soften = 1 / (1 + (n / 40) ** 2);
    re[n] = 2 * cr * soften;
    im[n] = -2 * ci * soften;
  }
  return ctx.createPeriodicWave(re, im);
}

function makeNoise(ctx, kind) {
  if (kind === 'amb') {
    // 23-bit LFSR (x^23 + x^18 + 1): long enough that ambient beds never audibly repeat.
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let r = 0x5a5a5a;
    for (let i = 0; i < len; i++) {
      const bit = (r ^ (r >> 5)) & 1;
      r = (r >> 1) | (bit << 22);
      d[i] = r & 1 ? 0.8 : -0.8;
    }
    return buf;
  }
  // Game Boy noise: 15-bit LFSR, or 7-bit when "short" (periodic → metallic/tonal).
  const short = kind === 'short';
  const period = short ? 127 : 32767;
  const len = short ? period * 64 : period;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let r = 0x7fff;
  const step = () => {
    const bit = (r ^ (r >> 1)) & 1;
    r = (r >> 1) | (bit << 14);
    if (short) r = (r & ~0x40) | (bit << 6);
  };
  if (short) for (let i = 0; i < 256; i++) step(); // settle into the 127-step cycle
  for (let i = 0; i < len; i++) {
    step();
    d[i] = r & 1 ? -1 : 1;
  }
  return buf;
}

function resources(ctx) {
  let R = RES.get(ctx);
  if (R) return R;
  const pulses = [0.125, 0.25, 0.5, 0.75].map((d) => makePulseWave(ctx, d));
  const waves = new Map();
  const noise = {};
  R = {
    pulse: (d) => pulses[Math.max(0, Math.min(3, d | 0))],
    wave: (name) => {
      const hex = WAVES[name] || (/^[0-9a-f]{32}$/i.test(name || '') ? name : WAVES.tri);
      let w = waves.get(hex);
      if (!w) { w = makeTableWave(ctx, hex); waves.set(hex, w); }
      return w;
    },
    noise: (kind) => noise[kind] || (noise[kind] = makeNoise(ctx, kind)),
  };
  RES.set(ctx, R);
  return R;
}

function softClipCurve() {
  // Input is pre-scaled by 0.5, so the curve covers ±2 of real amplitude:
  // linear to 0.7, then a tanh knee that approaches (never exceeds) 1.0.
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(u);
    const y = a <= 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
    c[i] = Math.sign(u) * y;
  }
  return c;
}

function buildGraph(ctx, mv, sv) {
  const master = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 30;
  hp.Q.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 9500;
  lp.Q.value = 0.45;
  const pre = ctx.createGain();
  pre.gain.value = 0.5;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = '2x';
  master.connect(hp);
  hp.connect(lp);
  lp.connect(pre);
  pre.connect(clip);
  clip.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = mv * MUSIC_LEVEL;
  music.connect(master);
  const duck = ctx.createGain();
  duck.connect(music);
  const sfx = ctx.createGain();
  sfx.gain.value = sv * SFX_LEVEL;
  sfx.connect(master);
  const amb = ctx.createGain();
  amb.gain.value = AMB_LEVEL;
  amb.connect(sfx);
  return { master, music, duck, sfx, amb };
}

/** Freeze an AudioParam at time t so new automation can start from its current value. */
function holdParam(p, t) {
  if (p.cancelAndHoldAtTime) {
    try { p.cancelAndHoldAtTime(t); return; } catch { /* fall through */ }
  }
  const v = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(v, t);
}

// ---------------------------------------------------------------------------
// the voice: one note on one simulated channel

function applyEnv(p, t, peak, a, d, s, off, r) {
  a = Math.max(0.0015, a || 0);
  r = Math.max(0.005, r || 0);
  p.setValueAtTime(0, t);
  if (off <= t + a) {
    p.linearRampToValueAtTime((peak * Math.max(0, off - t)) / a, off);
  } else {
    p.linearRampToValueAtTime(peak, t + a);
    let v = peak;
    if (d > 0 && s < 1) {
      const sus = peak * s;
      p.setTargetAtTime(sus, t + a, d);
      v = sus + (peak - sus) * Math.exp(-(off - t - a) / d);
    }
    p.setValueAtTime(v, off);
  }
  p.linearRampToValueAtTime(0, off + r);
  return off + r;
}

function voice(ctx, R, dest, v) {
  const t = v.t;
  const off = Math.max(v.off, t + 0.004);
  const isNoise = v.src === 'noise';
  const nodes = [];
  let src;
  let P;
  let base;
  let conv = (x) => x;
  if (isNoise) {
    src = ctx.createBufferSource();
    src.buffer = R.noise(v.noise || 'long');
    src.loop = true;
    P = src.playbackRate;
    conv = (x) => x / ctx.sampleRate;
    base = conv(v.clock || ctx.sampleRate);
  } else {
    src = ctx.createOscillator();
    if (v.src === 'sine' || v.src === 'triangle') src.type = v.src;
    else src.setPeriodicWave(v.src === 'wave' ? R.wave(v.wave) : R.pulse(v.duty ?? 2));
    P = src.frequency;
    base = v.f;
  }
  // Chrome applies an event at the exact start time a little late, so also set the
  // intrinsic value: the first samples of the note are then already at pitch.
  const first = v.arp && v.arp.length > 1 ? v.arp[0] : v.seq && v.seq.length ? v.seq[0] : 0;
  P.value = v.from != null ? conv(v.from) : base * Math.pow(2, first / 12);
  nodes.push(src);
  const endGuess = off + Math.max(0.005, v.r || 0);
  // pitch
  if (v.arp && v.arp.length > 1) {
    const rate = Math.max(0.008, v.arpRate || 1 / 60);
    let k = 0;
    for (let tt = t; tt < endGuess && k < 4000; tt += rate, k++) P.setValueAtTime(base * Math.pow(2, v.arp[k % v.arp.length] / 12), tt);
  } else if (v.seq && v.seq.length) {
    const st = v.stepTime || 0.05;
    v.seq.forEach((semi, k) => P.setValueAtTime(base * Math.pow(2, semi / 12), t + k * st));
  } else {
    let cur = base;
    let tt = t;
    if (v.from != null) {
      P.setValueAtTime(conv(v.from), t);
      tt = t + Math.max(0.005, v.fromT || 0.03);
      P.exponentialRampToValueAtTime(base, tt);
    } else P.setValueAtTime(base, t);
    if (v.to != null) {
      const gs = Math.max(tt, t + (v.toAt || 0));
      const target = Math.max(1e-4, conv(v.to));
      P.setValueAtTime(cur, gs);
      const ge = gs + Math.max(0.005, v.toT ?? off - gs);
      if (v.curve === 'lin') P.linearRampToValueAtTime(target, ge);
      else P.exponentialRampToValueAtTime(target, ge);
      cur = target;
    }
  }
  // vibrato
  if (v.vib && !isNoise && v.vib[1] > 0) {
    const [delay, depth, rate] = v.vib;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate || 5.5;
    const lg = ctx.createGain();
    lg.gain.value = 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + (delay || 0));
    lg.gain.linearRampToValueAtTime(depth * 100, t + (delay || 0) + 0.18);
    lfo.connect(lg);
    lg.connect(src.detune);
    lfo.start(t);
    lfo.stop(endGuess + 0.05);
    nodes.push(lfo, lg);
  }
  let node = src;
  if (v.filter) {
    const fl = v.filter;
    const bq = ctx.createBiquadFilter();
    bq.type = fl.type || 'lowpass';
    bq.Q.value = fl.q ?? (bq.type === 'bandpass' ? 1 : 0.7);
    bq.frequency.value = fl.f || 1000;
    bq.frequency.setValueAtTime(fl.f || 1000, t);
    if (fl.to) bq.frequency.exponentialRampToValueAtTime(fl.to, t + (fl.toT ?? Math.max(0.01, off - t)));
    node.connect(bq);
    node = bq;
    nodes.push(bq);
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  node.connect(g);
  nodes.push(g);
  const end = applyEnv(g.gain, t, v.peak, v.a, v.d, v.s ?? 1, off, v.r);
  if (v.pan != null && v.pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v.pan));
    g.connect(p);
    p.connect(dest);
    nodes.push(p);
  } else g.connect(dest);
  if (isNoise) src.start(t, v.offset || 0);
  else src.start(t);
  src.stop(end + 0.02);
  src.onended = () => {
    for (const nd of nodes) {
      try { nd.disconnect(); } catch { /* already gone */ }
    }
  };
  return end;
}

// ---------------------------------------------------------------------------
// music player: schedules a compiled song onto a context

class Player {
  constructor(ctx, R, song, out, startAt, offset = 0, loop = song.loop) {
    this.ctx = ctx;
    this.R = R;
    this.song = song;
    this.loop = loop;
    this.t0 = startAt - offset;
    this.startAt = startAt;
    this.stopAt = Infinity;
    this.out = ctx.createGain();
    this.out.connect(out);
    const L = song.length;
    this.chans = song.channels.map((ch) => {
      const g = ctx.createGain();
      g.gain.value = MIX[ch.id];
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = PAN[ch.id];
        g.connect(p);
        p.connect(this.out);
      } else g.connect(this.out);
      let idx = 0;
      let lap = 0;
      if (offset > 0 && ch.events.length) {
        lap = loop && L > 0 ? Math.floor(offset / L) : 0;
        const o = offset - lap * L;
        idx = ch.events.findIndex((e) => e.t >= o - 1e-6);
        if (idx < 0) { idx = 0; lap++; if (!loop) idx = ch.events.length; }
      }
      return { ch, g, idx, lap, done: !ch.events.length || idx >= ch.events.length };
    });
  }

  get endTime() {
    return this.loop ? Infinity : this.t0 + this.song.length;
  }

  position(time) {
    const p = time - this.t0;
    const L = this.song.length;
    return this.loop && L > 0 ? ((p % L) + L) % L : Math.max(0, p);
  }

  schedule(until, now = -Infinity) {
    const L = this.song.length;
    for (const c of this.chans) {
      let guard = 0;
      while (!c.done && guard++ < 2000) {
        const e = c.ch.events[c.idx];
        const t = this.t0 + c.lap * L + e.t;
        if (t >= until) break;
        if (t >= this.stopAt) { c.done = true; break; }
        if (t >= this.startAt - 1e-4 && t >= now - 0.05) this.note(c, e, t);
        if (++c.idx >= c.ch.events.length) {
          if (this.loop && L > 0) { c.idx = 0; c.lap++; } else c.done = true;
        }
      }
    }
  }

  note(c, e, t) {
    const { ctx, R } = this;
    if (c.ch.kind === 'noise') {
      const dr = DRUMS[e.drum];
      if (!dr) return;
      const vol = e.vol / 15;
      if (dr.noise !== false) {
        voice(ctx, R, c.g, {
          t,
          off: t + (dr.dur || 0.05),
          src: 'noise',
          noise: dr.noise || 'long',
          clock: dr.clock,
          to: dr.clock1,
          toT: dr.sweep,
          peak: vol * (dr.vol ?? 0.5),
          a: dr.a || 0.001,
          d: dr.d || 0.05,
          s: 0,
          r: dr.r || 0.02,
          filter: dr.filter ? { type: dr.filter[0], f: dr.filter[1], q: dr.filter[2] } : null,
        });
      }
      if (dr.tone) {
        const tn = dr.tone;
        voice(ctx, R, c.g, {
          t,
          off: t + (tn.dur || 0.08),
          src: 'wave',
          wave: tn.wave || 'sine',
          f: tn.f,
          to: tn.f1,
          toT: tn.t,
          peak: vol * (tn.vol ?? 0.8),
          a: 0.001,
          d: tn.d || 0.06,
          s: 0,
          r: 0.02,
        });
      }
      return;
    }
    const inst = INSTRUMENTS[e.inst] || INSTRUMENTS[DEFAULT_INST[c.ch.id]];
    const gateDur = (e.d * e.gate) / 8;
    const off = t + Math.max(0.01, Math.min(gateDur, e.gap));
    const limit = t + e.gap + 0.012; // channels are monophonic: fade out by the next note
    const r = Math.min(inst.r ?? 0.05, Math.max(0.006, limit - off));
    const f = mtof(e.midi);
    let from = null;
    let fromT = 0;
    if (e.glideFrom != null) { from = mtof(e.glideFrom); fromT = Math.min(0.12, e.d * 0.5); }
    else if (inst.bend) { from = f * Math.pow(2, inst.bend[0] / 12); fromT = inst.bend[1]; }
    voice(ctx, R, c.g, {
      t,
      off,
      src: c.ch.kind === 'wave' ? 'wave' : 'pulse',
      duty: inst.duty ?? 2,
      wave: inst.wave,
      f,
      from,
      fromT,
      arp: e.arp,
      arpRate: inst.arpRate,
      vib: e.arp ? null : inst.vib,
      peak: (e.vol / 15) * (inst.gain ?? 1),
      a: inst.a,
      d: inst.d,
      s: inst.s ?? 1,
      r,
    });
  }

  stop(at, fade) {
    const g = this.out.gain;
    holdParam(g, at);
    g.setTargetAtTime(0, at, Math.max(0.01, fade / 5));
    this.stopAt = Math.min(this.stopAt, at + fade);
  }

  dispose() {
    try { this.out.disconnect(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// SFX builder (used by sfx.js definitions and ambient events)

class Synth {
  constructor(ctx, R, dest, t0, pitch = 0, vol = 1) {
    this.ctx = ctx;
    this.R = R;
    this.dest = dest;
    this.t0 = t0;
    this.pm = Math.pow(2, (pitch || 0) / 12);
    this.vol = vol;
    this.end = t0;
    this.duck = 1; // < 1 dips the music while this sound plays
  }

  _env(o, t, dur) {
    const d = o.d ?? 0;
    return {
      peak: (o.vol ?? 0.3) * this.vol,
      a: o.a ?? 0.002,
      d,
      s: o.s ?? (d > 0 ? 0 : 1),
      r: o.r ?? 0.03,
      off: t + dur,
    };
  }

  _run(spec) {
    const end = this.ctx ? voice(this.ctx, this.R, this.dest, spec) : spec.off + Math.max(0.005, spec.r);
    this.end = Math.max(this.end, end);
    return this;
  }

  /** Pulse / wave / sine tone. See sfx.js for the option list. */
  tone(o) {
    const t = this.t0 + (o.at || 0);
    const dur = o.dur ?? 0.1;
    const f = hz(o.freq ?? o.note ?? 'A4') * this.pm;
    const toAt = o.toAt || 0;
    return this._run({
      t,
      src: o.type || 'pulse',
      duty: o.duty ?? 2,
      wave: o.wave,
      f,
      from: o.from != null ? hz(o.from) * this.pm : null,
      fromT: o.fromT,
      to: o.to != null ? hz(o.to) * this.pm : null,
      toAt,
      toT: o.glide ?? Math.max(0.005, dur - toAt),
      curve: o.curve,
      seq: o.seq,
      stepTime: o.stepTime,
      arp: o.arp,
      arpRate: o.rate,
      vib: o.vib ? [o.vib[2] || 0, o.vib[0], o.vib[1]] : null,
      filter: o.filter,
      pan: o.pan,
      ...this._env(o, t, dur),
    });
  }

  /** LFSR noise burst; clock = LFSR steps per second. */
  noise(o) {
    const t = this.t0 + (o.at || 0);
    const dur = o.dur ?? 0.1;
    const toAt = o.toAt || 0;
    return this._run({
      t,
      src: 'noise',
      noise: o.src === 'amb' ? 'amb' : o.short ? 'short' : 'long',
      clock: (o.clock ?? SR) * this.pm,
      to: o.to != null ? o.to * this.pm : null,
      toAt,
      toT: o.glide ?? Math.max(0.005, dur - toAt),
      curve: o.curve,
      offset: o.offset,
      filter: o.filter,
      pan: o.pan,
      ...this._env(o, t, dur),
    });
  }
}

// ---------------------------------------------------------------------------
// ambient loops

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Ambient {
  constructor(ctx, R, name, def, dest, startAt, fadeIn, seed) {
    this.ctx = ctx;
    this.R = R;
    this.name = name;
    this.def = def;
    this.rng = mulberry32(seed);
    this.stopAt = Infinity;
    this.out = ctx.createGain();
    this.out.connect(dest);
    const level = def.gain ?? 0.5;
    this.out.gain.setValueAtTime(0, startAt);
    this.out.gain.linearRampToValueAtTime(level, startAt + Math.max(0.02, fadeIn));
    this.sources = [];
    this.nodes = [];
    const buf = R.noise('amb');
    for (const bed of def.beds || []) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = (bed.clock || ctx.sampleRate) / ctx.sampleRate;
      let node = s;
      const filters = (bed.filters || []).map(([type, f, q]) => {
        const bq = ctx.createBiquadFilter();
        bq.type = type;
        bq.frequency.value = f;
        if (q != null) bq.Q.value = q;
        node.connect(bq);
        node = bq;
        return bq;
      });
      const g = ctx.createGain();
      g.gain.value = bed.gain ?? 0.2;
      node.connect(g);
      g.connect(this.out);
      if (bed.lfo) {
        const [rate, depth] = bed.lfo;
        const o = ctx.createOscillator();
        o.frequency.value = rate;
        const lg = ctx.createGain();
        lg.gain.value = depth * (bed.gain ?? 0.2);
        o.connect(lg);
        lg.connect(g.gain);
        o.start(startAt);
        this.sources.push(o);
        this.nodes.push(lg);
      }
      if (bed.flfo && filters.length) {
        const [rate, depth] = bed.flfo;
        const o = ctx.createOscillator();
        o.frequency.value = rate;
        const lg = ctx.createGain();
        lg.gain.value = depth;
        o.connect(lg);
        lg.connect(filters[0].frequency);
        o.start(startAt);
        this.sources.push(o);
        this.nodes.push(lg);
      }
      s.start(startAt, this.rng() * buf.duration);
      this.sources.push(s);
      this.nodes.push(...filters, g);
    }
    this.events = (def.events || []).map((e) => ({ ...e, next: startAt + (e.first ?? this.rng() * e.every[1]) }));
  }

  schedule(until) {
    for (const ev of this.events) {
      let guard = 0;
      while (ev.next < until && ev.next < this.stopAt && guard++ < 500) {
        const s = new Synth(this.ctx, this.R, this.out, ev.next);
        try { ev.play(s, this.rng); } catch (e) { console.warn('[audio] ambient event failed', e); }
        const [lo, hi] = ev.every;
        ev.next += lo + (hi - lo) * this.rng();
      }
    }
  }

  stop(at, fade) {
    holdParam(this.out.gain, at);
    this.out.gain.setTargetAtTime(0, at, Math.max(0.02, fade / 5));
    this.stopAt = Math.min(this.stopAt, at + fade);
    for (const s of this.sources) {
      try { s.stop(at + fade + 0.1); } catch { /* ignore */ }
    }
  }

  dispose() {
    for (const n of [...this.sources, ...this.nodes, this.out]) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// the public engine

function audioCtor() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return g.AudioContext || g.webkitAudioContext || null;
}
function offlineCtor() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return g.OfflineAudioContext || g.webkitOfflineAudioContext || null;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this._g = null;
    this._AC = audioCtor();
    this._songs = new Map();
    this._music = null; // Player for the looping track
    this._want = null; // track that should be playing (survives jingles / pre-unlock)
    this._paused = null; // { name, pos } music paused under a jingle
    this._jingle = null;
    this._fading = []; // players / ambients fading out
    this._amb = null;
    this._ambWant = null;
    this._mv = 0.8;
    this._sv = 0.8;
    this._lastSfx = new Map();
    this._duckUntil = 0;
    this._duckLevel = 1;
    this._timer = null;
    this._worker = null;
    this._seed = 1;
  }

  /** True when the browser has WebAudio at all. */
  get available() {
    return !!this._AC;
  }

  /** True once an AudioContext exists and is running. */
  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get trackNames() {
    return Object.keys(SONGS);
  }
  get musicNames() {
    return Object.keys(SONGS).filter((n) => SONGS[n].loop !== false);
  }
  get jingleNames() {
    return Object.keys(SONGS).filter((n) => SONGS[n].loop === false);
  }
  get sfxNames() {
    return Object.keys(SFX);
  }
  get ambientNames() {
    return Object.keys(AMBIENT);
  }

  get musicVolume() {
    return this._mv;
  }
  set musicVolume(v) {
    this._mv = clamp01(v);
    if (this.ctx) this._g.music.gain.setTargetAtTime(this._mv * MUSIC_LEVEL, this.ctx.currentTime, 0.03);
  }
  get sfxVolume() {
    return this._sv;
  }
  set sfxVolume(v) {
    this._sv = clamp01(v);
    if (this.ctx) this._g.sfx.gain.setTargetAtTime(this._sv * SFX_LEVEL, this.ctx.currentTime, 0.03);
  }

  /** Name of the looping track currently requested (or null). */
  get currentMusic() {
    return this._want;
  }

  _song(name) {
    let s = this._songs.get(name);
    if (!s) {
      s = compileSong(name, SONGS[name]);
      for (const w of s.warnings) console.warn('[audio]', w);
      this._songs.set(name, s);
    }
    return s;
  }

  unlock() {
    if (!this._AC) return Promise.resolve();
    try {
      if (!this.ctx) {
        this.ctx = new this._AC({ latencyHint: 'interactive' });
        this._g = buildGraph(this.ctx, this._mv, this._sv);
        this._startTimer();
      }
    } catch (e) {
      console.warn('[audio] WebAudio unavailable', e);
      this._AC = null;
      this.ctx = null;
      return Promise.resolve();
    }
    const ctx = this.ctx;
    if (ctx.state === 'running') {
      this._onReady();
      return Promise.resolve();
    }
    try {
      // iOS needs a sound started inside the gesture to really unlock output.
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch { /* ignore */ }
    let resumed;
    try { resumed = Promise.resolve(ctx.resume()).catch(() => {}); } catch { resumed = Promise.resolve(); }
    return Promise.race([resumed, new Promise((r) => setTimeout(r, 500))]).then(() => this._onReady());
  }

  _onReady() {
    if (!this.ctx) return;
    if (this._want && !this._music && !this._jingle) this._startMusic(this._want, 0, 0);
    if (this._ambWant && !this._amb) this._startAmbient(this._ambWant);
  }

  _startTimer() {
    const tick = () => {
      try { this._tick(); } catch (e) { console.error('[audio] scheduler', e); }
    };
    const fallback = () => {
      if (!this._timer) this._timer = setInterval(tick, TICK_MS);
    };
    try {
      // A worker-driven clock keeps ticking when the tab is in the background.
      const code = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = tick;
      w.onerror = () => { w.terminate(); this._worker = null; fallback(); };
      w.postMessage(TICK_MS);
      this._worker = w;
      // belt and braces: a slow main-thread tick in case the worker never starts
      this._timer = setInterval(tick, 100);
    } catch {
      fallback();
    }
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const until = now + (hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
    if (this._music) this._music.schedule(until, now);
    const j = this._jingle;
    if (j) {
      j.player.schedule(until, now);
      if (now >= j.end) this._endJingle();
    }
    if (this._amb) this._amb.schedule(until);
    if (this._fading.length) {
      this._fading = this._fading.filter((p) => {
        if (p.schedule) p.schedule(Math.min(until, p.stopAt), now);
        if (now > p.stopAt + 0.5) { p.dispose(); return false; }
        return true;
      });
    }
  }

  _startMusic(name, offset, fadeIn) {
    const ctx = this.ctx;
    const song = this._song(name);
    const now = ctx.currentTime;
    const start = now + 0.06;
    const p = new Player(ctx, resources(ctx), song, this._g.duck, start, offset, song.loop);
    if (fadeIn > 0) {
      p.out.gain.setValueAtTime(0, now);
      p.out.gain.linearRampToValueAtTime(1, start + fadeIn);
    }
    this._music = p;
    p.schedule(now + LOOKAHEAD, now);
  }

  playMusic(name, opts = {}) {
    if (!SONGS[name]) { console.warn(`[audio] unknown track ${name}`); return; }
    const restart = !!(opts && opts.restart);
    this._want = name;
    if (!this.ctx || !this._g) return;
    if (this._jingle) {
      // resumes when the jingle finishes
      if (restart || (this._paused && this._paused.name !== name)) this._paused = null;
      return;
    }
    const cur = this._music;
    if (cur && cur.song.name === name && !restart) return;
    if (cur) {
      cur.stop(this.ctx.currentTime, 0.4);
      this._fading.push(cur);
      this._music = null;
    }
    this._startMusic(name, 0, cur ? 0.2 : 0);
  }

  stopMusic(fadeSeconds = 0.5) {
    this._want = null;
    this._paused = null;
    if (!this.ctx || !this._music) return;
    this._music.stop(this.ctx.currentTime, Math.max(0.01, +fadeSeconds || 0));
    this._fading.push(this._music);
    this._music = null;
  }

  playJingle(name) {
    if (!SONGS[name]) { console.warn(`[audio] unknown jingle ${name}`); return Promise.resolve(); }
    if (!this.ctx || !this._g) return Promise.resolve();
    const ctx = this.ctx;
    const song = this._song(name);
    const now = ctx.currentTime;
    if (this._jingle) {
      const old = this._jingle;
      this._jingle = null;
      old.player.stop(now, 0.05);
      this._fading.push(old.player);
      old.resolve();
    }
    if (this._music) {
      if (!this._paused) this._paused = { name: this._music.song.name, pos: this._music.position(now + 0.1) };
      this._music.stop(now, 0.1);
      this._fading.push(this._music);
      this._music = null;
    }
    const start = now + 0.12;
    const player = new Player(ctx, resources(ctx), song, this._g.duck, start, 0, false);
    return new Promise((resolve) => {
      let done = false;
      const j = {
        player,
        end: start + song.length + JINGLE_TAIL * 0.5,
        resolve: () => {
          if (done) return;
          done = true;
          clearTimeout(j.timer);
          resolve();
        },
      };
      // if the clock stalls (suspended context) the promise still settles
      j.timer = setTimeout(() => {
        if (this._jingle === j) this._endJingle();
        else j.resolve();
      }, (j.end - now) * 1000 + 1500);
      this._jingle = j;
      player.schedule(now + LOOKAHEAD, now);
    });
  }

  _endJingle() {
    const j = this._jingle;
    if (!j) return;
    this._jingle = null;
    j.player.stopAt = Math.min(j.player.stopAt, this.ctx.currentTime + JINGLE_TAIL);
    this._fading.push(j.player);
    if (this._want) {
      const pos = this._paused && this._paused.name === this._want ? this._paused.pos : 0;
      this._paused = null;
      this._startMusic(this._want, pos, pos > 0 ? 0.8 : 0.15);
    }
    this._paused = null;
    j.resolve();
  }

  sfx(name, opts = {}) {
    const fn = SFX[name];
    if (!fn) { console.warn(`[audio] unknown sfx ${name}`); return; }
    const ctx = this.ctx;
    if (!ctx || !this._g || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this._lastSfx.get(name);
    if (last != null && now - last < 0.03) return; // don't stack identical hits
    this._lastSfx.set(name, now);
    const s = new Synth(ctx, resources(ctx), this._g.sfx, now + 0.005, opts.pitch || 0, clamp01(opts.volume ?? 1));
    try {
      fn(s);
    } catch (e) {
      console.warn(`[audio] sfx ${name} failed`, e);
      return;
    }
    if (s.duck < 1) this._duck(s.duck, now, s.end);
  }

  _duck(level, from, to) {
    if (from < this._duckUntil) {
      level = Math.min(level, this._duckLevel);
      to = Math.max(to, this._duckUntil);
    }
    this._duckLevel = level;
    this._duckUntil = to;
    const g = this._g.duck.gain;
    holdParam(g, from);
    g.setTargetAtTime(level, from, 0.015);
    g.setTargetAtTime(1, to, 0.12);
  }

  setAmbient(name) {
    const want = name || null;
    if (want && !AMBIENT[want]) { console.warn(`[audio] unknown ambient ${name}`); return; }
    this._ambWant = want;
    if (!this.ctx || !this._g) return;
    if (this._amb && this._amb.name === want) return;
    const now = this.ctx.currentTime;
    if (this._amb) {
      this._amb.stop(now, 1.2);
      this._fading.push(this._amb);
      this._amb = null;
    }
    if (want) this._startAmbient(want);
  }

  _startAmbient(name) {
    const ctx = this.ctx;
    this._amb = new Ambient(ctx, resources(ctx), name, AMBIENT[name], this._g.amb, ctx.currentTime + 0.02, 1.5, this._seed++ * 7919);
    this._amb.schedule(ctx.currentTime + LOOKAHEAD);
  }

  /** Stop everything and release the AudioContext and timers (engine is reusable after unlock()). */
  close() {
    if (this._worker) { this._worker.terminate(); this._worker = null; }
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._jingle) { const j = this._jingle; this._jingle = null; j.resolve(); }
    const ctx = this.ctx;
    this.ctx = null;
    this._g = null;
    this._music = null;
    this._amb = null;
    this._fading = [];
    this._paused = null;
    if (ctx) { try { ctx.close(); } catch { /* ignore */ } }
  }

  /**
   * Render a track, jingle, sfx or ambient loop offline (for tests / previews).
   * Names may be prefixed 'music:', 'sfx:' or 'amb:' to disambiguate.
   * Resolves null when OfflineAudioContext is unavailable.
   */
  async renderOffline(name, seconds) {
    const OAC = offlineCtor();
    if (!OAC) return null;
    let kind = null;
    let key = String(name);
    const m = /^(music|sfx|amb):(.*)$/.exec(key);
    if (m) { kind = m[1]; key = m[2]; }
    if (!kind) kind = SONGS[key] ? 'music' : SFX[key] ? 'sfx' : AMBIENT[key] ? 'amb' : null;
    if (!kind || (kind === 'music' && !SONGS[key]) || (kind === 'sfx' && !SFX[key]) || (kind === 'amb' && !AMBIENT[key]))
      throw new Error(`unknown sound ${name}`);
    let natural = 8;
    let song = null;
    if (kind === 'music') {
      song = this._song(key);
      natural = song.loop ? song.length : song.length + JINGLE_TAIL;
    } else if (kind === 'sfx') {
      const dry = new Synth(null, null, null, 0.01);
      SFX[key](dry);
      natural = dry.end + 0.15;
    }
    const secs = seconds > 0 ? seconds : natural;
    const ctx = new OAC(2, Math.max(1, Math.ceil(secs * SR)), SR);
    const g = buildGraph(ctx, this._mv, this._sv);
    const R = resources(ctx);
    let sched = null;
    if (kind === 'music') {
      const p = new Player(ctx, R, song, g.duck, 0, 0, song.loop);
      sched = (until) => p.schedule(until);
    } else if (kind === 'sfx') {
      const s = new Synth(ctx, R, g.sfx, 0.01);
      SFX[key](s);
    } else {
      const a = new Ambient(ctx, R, key, AMBIENT[key], g.amb, 0, 0.3, 12345);
      sched = (until) => a.schedule(until);
    }
    if (sched) {
      // Schedule in chunks, like the live lookahead scheduler, so only a second or
      // two of nodes exist at a time (falls back to scheduling everything at once).
      const STEP = 1;
      const ahead = (t) => Math.min(secs, t + STEP * 1.5);
      if (typeof ctx.suspend === 'function' && secs > STEP * 2) {
        sched(ahead(0));
        for (let t = STEP; t < secs - 0.05; t += STEP) {
          ctx.suspend(t).then(() => {
            sched(ahead(t));
            ctx.resume();
          });
        }
      } else sched(secs);
    }
    return ctx.startRendering();
  }
}

export default AudioEngine;
