// Audio processing unit: 2 pulse channels (one with sweep), wave, noise.
// Produces interleaved stereo float samples.

const DUTY = [0b00000001, 0b10000001, 0b10000111, 0b01111110];
const READ_OR = [
  0x80, 0x3f, 0x00, 0xff, 0xbf, // NR10-NR14
  0xff, 0x3f, 0x00, 0xff, 0xbf, // -, NR21-NR24
  0x7f, 0xff, 0x9f, 0xff, 0xbf, // NR30-NR34
  0xff, 0xff, 0x00, 0x00, 0xbf, // -, NR41-NR44
  0x00, 0x00, 0x70, // NR50-NR52
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
];

function envelope() {
  return { vol: 0, init: 0, up: false, period: 0, timer: 0 };
}

export class APU {
  constructor(gb) {
    this.gb = gb;
    this.regs = new Uint8Array(0x30);
    this.wave = new Uint8Array(16);
    this.setSampleRate(48000);
    this.buf = new Float32Array(48000);
    this.count = 0;
    this.reset();
  }

  reset() {
    this.power = true;
    this.seq = 0;
    this.ch = [0, 1, 2, 3].map((i) => ({
      on: false, dac: false, len: 0, lenOn: false, freq: 0, timer: 0, pos: 0, duty: 2, env: envelope(),
      out: 0, sweepPeriod: 0, sweepNeg: false, sweepShift: 0, sweepTimer: 0, sweepOn: false, shadow: 0,
      lfsr: 0x7fff, narrow: false, shift: 0, div: 0, volCode: 0, sample: 0,
    }));
    this.regs.fill(0);
    this.regs[0x24] = 0x77;
    this.regs[0x25] = 0xf3;
    this.nr50 = 0x77;
    this.nr51 = 0xf3;
    this.hpL = 0;
    this.hpR = 0;
    this.lpL = 0;
    this.lpR = 0;
    this.acc = 0;
  }

  /** cyclesPerSample chosen so one emulated frame fills exactly 1/60 s of audio. */
  setSampleRate(rate) {
    this.rate = rate;
    this.cyclesPerSample = (70224 * 60) / rate;
    this.hpFactor = Math.pow(0.999958, this.cyclesPerSample);
  }

  // --- register interface --------------------------------------------------
  read(addr) {
    const r = addr - 0xff10;
    if (addr >= 0xff30) return this.wave[addr - 0xff30];
    if (addr === 0xff26) {
      let v = this.power ? 0x80 : 0;
      for (let i = 0; i < 4; i++) if (this.ch[i].on) v |= 1 << i;
      return v | 0x70;
    }
    return this.regs[r] | READ_OR[r];
  }

  write(addr, v) {
    if (addr >= 0xff30) {
      this.wave[addr - 0xff30] = v;
      return;
    }
    const r = addr - 0xff10;
    if (addr === 0xff26) {
      const on = (v & 0x80) !== 0;
      if (!on && this.power) {
        for (let i = 0; i < 0x16; i++) this.write(0xff10 + i, 0);
        for (const c of this.ch) c.on = false;
        this.regs.fill(0, 0, 0x16);
      }
      if (on && !this.power) this.seq = 0;
      this.power = on;
      return;
    }
    if (!this.power) return;
    this.regs[r] = v;
    const c1 = this.ch[0], c2 = this.ch[1], c3 = this.ch[2], c4 = this.ch[3];
    switch (addr) {
      case 0xff10:
        c1.sweepPeriod = (v >> 4) & 7;
        c1.sweepNeg = (v & 8) !== 0;
        c1.sweepShift = v & 7;
        break;
      case 0xff11: case 0xff16: {
        const c = addr === 0xff11 ? c1 : c2;
        c.duty = v >> 6;
        c.len = 64 - (v & 0x3f);
        break;
      }
      case 0xff12: case 0xff17: case 0xff21: {
        const c = addr === 0xff12 ? c1 : addr === 0xff17 ? c2 : c4;
        c.env.init = v >> 4;
        c.env.up = (v & 8) !== 0;
        c.env.period = v & 7;
        c.dac = (v & 0xf8) !== 0;
        if (!c.dac) c.on = false;
        break;
      }
      case 0xff13: c1.freq = (c1.freq & 0x700) | v; break;
      case 0xff18: c2.freq = (c2.freq & 0x700) | v; break;
      case 0xff1d: c3.freq = (c3.freq & 0x700) | v; break;
      case 0xff14: case 0xff19: case 0xff1e: {
        const c = addr === 0xff14 ? c1 : addr === 0xff19 ? c2 : c3;
        c.freq = (c.freq & 0xff) | ((v & 7) << 8);
        c.lenOn = (v & 0x40) !== 0;
        if (v & 0x80) this.trigger(addr === 0xff14 ? 0 : addr === 0xff19 ? 1 : 2);
        break;
      }
      case 0xff1a:
        c3.dac = (v & 0x80) !== 0;
        if (!c3.dac) c3.on = false;
        break;
      case 0xff1b: c3.len = 256 - v; break;
      case 0xff1c: c3.volCode = (v >> 5) & 3; break;
      case 0xff20: c4.len = 64 - (v & 0x3f); break;
      case 0xff22:
        c4.shift = v >> 4;
        c4.narrow = (v & 8) !== 0;
        c4.div = v & 7;
        break;
      case 0xff23:
        c4.lenOn = (v & 0x40) !== 0;
        if (v & 0x80) this.trigger(3);
        break;
      case 0xff24: this.nr50 = v; break;
      case 0xff25: this.nr51 = v; break;
    }
  }

  period(i) {
    const c = this.ch[i];
    if (i === 2) return (2048 - c.freq) * 2;
    if (i === 3) return (c.div ? c.div * 16 : 8) << c.shift;
    return (2048 - c.freq) * 4;
  }

  trigger(i) {
    const c = this.ch[i];
    c.on = c.dac;
    if (c.len === 0) c.len = i === 2 ? 256 : 64;
    c.timer = this.period(i);
    if (i === 2) {
      c.pos = 0;
      return;
    }
    c.env.vol = c.env.init;
    c.env.timer = c.env.period || 8;
    if (i === 3) c.lfsr = 0x7fff;
    if (i === 0) {
      c.shadow = c.freq;
      c.sweepTimer = c.sweepPeriod || 8;
      c.sweepOn = c.sweepPeriod !== 0 || c.sweepShift !== 0;
      if (c.sweepShift) this.sweepCalc();
    }
  }

  sweepCalc() {
    const c = this.ch[0];
    const d = c.shadow >> c.sweepShift;
    const f = c.sweepNeg ? c.shadow - d : c.shadow + d;
    if (f > 2047) c.on = false;
    return f;
  }

  /** 512 Hz frame sequencer step (driven by the DIV counter). */
  frameStep() {
    if (!this.power) return;
    const s = this.seq;
    this.seq = (s + 1) & 7;
    if ((s & 1) === 0) {
      for (const c of this.ch) {
        if (c.lenOn && c.len > 0 && --c.len === 0) c.on = false;
      }
    }
    if (s === 2 || s === 6) {
      const c = this.ch[0];
      if (--c.sweepTimer <= 0) {
        c.sweepTimer = c.sweepPeriod || 8;
        if (c.sweepOn && c.sweepPeriod) {
          const f = this.sweepCalc();
          if (f <= 2047 && c.sweepShift) {
            c.shadow = f;
            c.freq = f;
            this.sweepCalc();
          }
        }
      }
    }
    if (s === 7) {
      for (const i of [0, 1, 3]) {
        const e = this.ch[i].env;
        if (!e.period) continue;
        if (--e.timer <= 0) {
          e.timer = e.period;
          if (e.up && e.vol < 15) e.vol++;
          else if (!e.up && e.vol > 0) e.vol--;
        }
      }
    }
  }

  /** Advance by `dots` normal-speed cycles. */
  tick(dots) {
    const ch = this.ch;
    // pulse 1 & 2
    for (let i = 0; i < 2; i++) {
      const c = ch[i];
      c.timer -= dots;
      if (c.timer <= 0) {
        const p = (2048 - c.freq) * 4;
        while (c.timer <= 0) {
          c.timer += p;
          c.pos = (c.pos + 1) & 7;
        }
      }
    }
    // wave
    const w = ch[2];
    w.timer -= dots;
    if (w.timer <= 0) {
      const p = (2048 - w.freq) * 2;
      while (w.timer <= 0) {
        w.timer += p;
        w.pos = (w.pos + 1) & 31;
      }
      const b = this.wave[w.pos >> 1];
      w.sample = w.pos & 1 ? b & 0x0f : b >> 4;
    }
    // noise
    const n = ch[3];
    n.timer -= dots;
    if (n.timer <= 0) {
      const p = (n.div ? n.div * 16 : 8) << n.shift;
      while (n.timer <= 0) {
        n.timer += p;
        const x = (n.lfsr ^ (n.lfsr >> 1)) & 1;
        n.lfsr = (n.lfsr >> 1) | (x << 14);
        if (n.narrow) n.lfsr = (n.lfsr & ~0x40) | (x << 6);
      }
    }

    this.acc += dots;
    while (this.acc >= this.cyclesPerSample) {
      this.acc -= this.cyclesPerSample;
      this.emit();
    }
  }

  emit() {
    const ch = this.ch;
    let l = 0, r = 0;
    const pan = this.nr51;
    for (let i = 0; i < 4; i++) {
      const c = ch[i];
      if (!c.dac) continue;
      let d = 0;
      if (c.on) {
        if (i < 2) d = (DUTY[c.duty] >> (7 - c.pos)) & 1 ? c.env.vol : 0;
        else if (i === 2) d = c.volCode ? c.sample >> (c.volCode - 1) : 0;
        else d = n4(c) ? 0 : c.env.vol;
      }
      const a = d / 7.5 - 1;
      if (pan & (0x10 << i)) l += a;
      if (pan & (1 << i)) r += a;
    }
    l *= (((this.nr50 >> 4) & 7) + 1) / 8 / 4;
    r *= ((this.nr50 & 7) + 1) / 8 / 4;
    // DC-blocking high-pass (like the hardware's output capacitor) + gentle low-pass
    const ol = l - this.hpL;
    this.hpL = l - ol * this.hpFactor;
    const or = r - this.hpR;
    this.hpR = r - or * this.hpFactor;
    this.lpL += (ol - this.lpL) * 0.6;
    this.lpR += (or - this.lpR) * 0.6;
    if (this.count + 2 > this.buf.length) return;
    this.buf[this.count++] = this.lpL * 0.8;
    this.buf[this.count++] = this.lpR * 0.8;
  }

  /** Collect interleaved stereo samples produced since the last call. */
  take() {
    const out = this.buf.slice(0, this.count);
    this.count = 0;
    return out;
  }

  saveState() {
    return {
      regs: this.regs.slice(), wave: this.wave.slice(), power: this.power, seq: this.seq, nr50: this.nr50, nr51: this.nr51,
      ch: this.ch.map((c) => ({ ...c, env: { ...c.env } })),
    };
  }
  loadState(s) {
    this.regs.set(s.regs);
    this.wave.set(s.wave);
    this.power = s.power;
    this.seq = s.seq;
    this.nr50 = s.nr50;
    this.nr51 = s.nr51;
    this.ch = s.ch.map((c) => ({ ...c, env: { ...c.env } }));
  }
}

function n4(c) {
  return c.lfsr & 1;
}
