// Sharp SM83 CPU core (the Game Boy / Game Boy Color processor).
// Instruction-level interpreter; step() returns elapsed T-cycles.

const FZ = 0x80, FN = 0x40, FH = 0x20, FC = 0x10;

export class CPU {
  constructor(bus) {
    this.bus = bus;
    this.reset(true);
  }

  reset(cgb) {
    // Register state right after the boot ROM hands over control.
    if (cgb) {
      this.a = 0x11; this.f = 0x80;
      this.b = 0x00; this.c = 0x00;
      this.d = 0xff; this.e = 0x56;
      this.h = 0x00; this.l = 0x0d;
    } else {
      this.a = 0x01; this.f = 0xb0;
      this.b = 0x00; this.c = 0x13;
      this.d = 0x00; this.e = 0xd8;
      this.h = 0x01; this.l = 0x4d;
    }
    this.sp = 0xfffe;
    this.pc = 0x0100;
    this.ime = false;
    this.imeDelay = 0;
    this.halted = false;
    this.haltBug = false;
    this.stopped = false;
  }

  // --- helpers ----------------------------------------------------------------
  // Each memory access (and each internal delay) advances the rest of the system
  // by one M-cycle first, so reads and writes land on the right cycle.
  idle() {
    this.bus.advance(4);
    this.ticked += 4;
  }
  rd(a) {
    this.bus.advance(4);
    this.ticked += 4;
    return this.bus.read(a & 0xffff);
  }
  wr(a, v) {
    this.bus.advance(4);
    this.ticked += 4;
    this.bus.write(a & 0xffff, v & 0xff);
  }
  fetch() {
    this.bus.advance(4);
    this.ticked += 4;
    const v = this.bus.read(this.pc);
    if (this.haltBug) this.haltBug = false;
    else this.pc = (this.pc + 1) & 0xffff;
    return v;
  }
  fetch16() {
    const lo = this.fetch();
    return lo | (this.fetch() << 8);
  }
  push(v) {
    this.idle(); // internal delay before the writes
    this.sp = (this.sp - 1) & 0xffff;
    this.wr(this.sp, v >> 8);
    this.sp = (this.sp - 1) & 0xffff;
    this.wr(this.sp, v);
  }
  pop() {
    const lo = this.rd(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    const hi = this.rd(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    return lo | (hi << 8);
  }
  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }
  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }
  get af() { return (this.a << 8) | this.f; }
  set af(v) { this.a = (v >> 8) & 0xff; this.f = v & 0xf0; }

  getR(i) {
    switch (i) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return this.h;
      case 5: return this.l;
      case 6: return this.rd(this.hl);
      default: return this.a;
    }
  }
  setR(i, v) {
    v &= 0xff;
    switch (i) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4: this.h = v; break;
      case 5: this.l = v; break;
      case 6: this.wr(this.hl, v); break;
      default: this.a = v;
    }
  }

  // --- ALU ----------------------------------------------------------------------
  add(v, carry) {
    const c = carry && this.f & FC ? 1 : 0;
    const r = this.a + v + c;
    this.f = ((r & 0xff) === 0 ? FZ : 0) | ((this.a & 0xf) + (v & 0xf) + c > 0xf ? FH : 0) | (r > 0xff ? FC : 0);
    this.a = r & 0xff;
  }
  sub(v, carry, store = true) {
    const c = carry && this.f & FC ? 1 : 0;
    const r = this.a - v - c;
    this.f = ((r & 0xff) === 0 ? FZ : 0) | FN | ((this.a & 0xf) - (v & 0xf) - c < 0 ? FH : 0) | (r < 0 ? FC : 0);
    if (store) this.a = r & 0xff;
  }
  and(v) { this.a &= v; this.f = (this.a === 0 ? FZ : 0) | FH; }
  xor(v) { this.a = (this.a ^ v) & 0xff; this.f = this.a === 0 ? FZ : 0; }
  or(v) { this.a = (this.a | v) & 0xff; this.f = this.a === 0 ? FZ : 0; }
  alu(op, v) {
    switch (op) {
      case 0: this.add(v, false); break;
      case 1: this.add(v, true); break;
      case 2: this.sub(v, false); break;
      case 3: this.sub(v, true); break;
      case 4: this.and(v); break;
      case 5: this.xor(v); break;
      case 6: this.or(v); break;
      case 7: this.sub(v, false, false); break;
    }
  }
  inc8(v) {
    const r = (v + 1) & 0xff;
    this.f = (this.f & FC) | (r === 0 ? FZ : 0) | ((v & 0xf) === 0xf ? FH : 0);
    return r;
  }
  dec8(v) {
    const r = (v - 1) & 0xff;
    this.f = (this.f & FC) | (r === 0 ? FZ : 0) | FN | ((v & 0xf) === 0 ? FH : 0);
    return r;
  }
  addHL(v) {
    const hl = this.hl;
    const r = hl + v;
    this.f = (this.f & FZ) | ((hl & 0xfff) + (v & 0xfff) > 0xfff ? FH : 0) | (r > 0xffff ? FC : 0);
    this.hl = r & 0xffff;
  }
  addSPe(e) {
    // e is a signed 8-bit offset; flags from the unsigned low-byte addition
    const sp = this.sp;
    const u = e & 0xff;
    this.f = ((sp & 0xf) + (u & 0xf) > 0xf ? FH : 0) | ((sp & 0xff) + u > 0xff ? FC : 0);
    return (sp + ((e << 24) >> 24)) & 0xffff;
  }
  daa() {
    let a = this.a;
    let adj = 0;
    let carry = false;
    if (this.f & FH || (!(this.f & FN) && (a & 0xf) > 9)) adj |= 0x06;
    if (this.f & FC || (!(this.f & FN) && a > 0x99)) {
      adj |= 0x60;
      carry = true;
    }
    a = this.f & FN ? a - adj : a + adj;
    a &= 0xff;
    this.f = (a === 0 ? FZ : 0) | (this.f & FN) | (carry ? FC : 0);
    this.a = a;
  }
  cond(c) {
    switch (c) {
      case 0: return !(this.f & FZ);
      case 1: return !!(this.f & FZ);
      case 2: return !(this.f & FC);
      default: return !!(this.f & FC);
    }
  }

  cb() {
    const op = this.fetch();
    const r = op & 7;
    const cyc = r === 6 ? 16 : 8;
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const v = this.getR(r);
    if (x === 1) {
      // BIT y, r
      this.f = (this.f & FC) | FH | (v & (1 << y) ? 0 : FZ);
      return r === 6 ? 12 : 8;
    }
    if (x === 2) {
      this.setR(r, v & ~(1 << y));
      return cyc;
    }
    if (x === 3) {
      this.setR(r, v | (1 << y));
      return cyc;
    }
    let res, c;
    switch (y) {
      case 0: // RLC
        c = v >> 7;
        res = ((v << 1) | c) & 0xff;
        break;
      case 1: // RRC
        c = v & 1;
        res = (v >> 1) | (c << 7);
        break;
      case 2: // RL
        c = v >> 7;
        res = ((v << 1) | (this.f & FC ? 1 : 0)) & 0xff;
        break;
      case 3: // RR
        c = v & 1;
        res = (v >> 1) | (this.f & FC ? 0x80 : 0);
        break;
      case 4: // SLA
        c = v >> 7;
        res = (v << 1) & 0xff;
        break;
      case 5: // SRA
        c = v & 1;
        res = (v >> 1) | (v & 0x80);
        break;
      case 6: // SWAP
        c = 0;
        res = ((v << 4) | (v >> 4)) & 0xff;
        break;
      default: // SRL
        c = v & 1;
        res = v >> 1;
    }
    this.f = (res === 0 ? FZ : 0) | (c ? FC : 0);
    this.setR(r, res);
    return cyc;
  }

  /** Service a pending interrupt if allowed. Returns cycles used (0 if none). */
  interrupt() {
    const bus = this.bus;
    if (!(bus.ie & bus.if & 0x1f)) return 0;
    this.halted = false;
    if (!this.ime) return 0;
    this.ime = false;
    this.idle();
    this.idle();
    this.sp = (this.sp - 1) & 0xffff;
    this.wr(this.sp, this.pc >> 8);
    // The vector is chosen after the high byte is pushed (which may overwrite IE).
    const pending = bus.ie & bus.if & 0x1f;
    this.sp = (this.sp - 1) & 0xffff;
    this.wr(this.sp, this.pc & 0xff);
    if (!pending) this.pc = 0;
    else {
      let bit = 0;
      while (!(pending & (1 << bit))) bit++;
      bus.if &= ~(1 << bit);
      this.pc = 0x40 + bit * 8;
    }
    this.idle();
    return 20;
  }

  step() {
    this.ticked = 0;
    if (this.imeDelay) {
      if (--this.imeDelay === 0) this.ime = true;
    }
    const ic = this.interrupt();
    if (ic) return ic;
    if (this.halted) return 4;
    const op = this.fetch();

    // LD r, r'
    if (op >= 0x40 && op < 0x80) {
      if (op === 0x76) {
        // HALT
        const bus = this.bus;
        if (!this.ime && bus.ie & bus.if & 0x1f) this.haltBug = true;
        else this.halted = true;
        return 4;
      }
      const d = (op >> 3) & 7, s = op & 7;
      if (op === 0x40 && this.bus.onBreakpoint) this.bus.onBreakpoint(); // LD B,B: test-ROM breakpoint
      this.setR(d, this.getR(s));
      return d === 6 || s === 6 ? 8 : 4;
    }
    // ALU A, r
    if (op >= 0x80 && op < 0xc0) {
      const s = op & 7;
      this.alu((op >> 3) & 7, this.getR(s));
      return s === 6 ? 8 : 4;
    }

    switch (op) {
      case 0x00: return 4;
      case 0x01: this.bc = this.fetch16(); return 12;
      case 0x11: this.de = this.fetch16(); return 12;
      case 0x21: this.hl = this.fetch16(); return 12;
      case 0x31: this.sp = this.fetch16(); return 12;
      case 0x02: this.wr(this.bc, this.a); return 8;
      case 0x12: this.wr(this.de, this.a); return 8;
      case 0x22: { const hl = this.hl; this.wr(hl, this.a); this.hl = (hl + 1) & 0xffff; return 8; }
      case 0x32: { const hl = this.hl; this.wr(hl, this.a); this.hl = (hl - 1) & 0xffff; return 8; }
      case 0x0a: this.a = this.rd(this.bc); return 8;
      case 0x1a: this.a = this.rd(this.de); return 8;
      case 0x2a: { const hl = this.hl; this.a = this.rd(hl); this.hl = (hl + 1) & 0xffff; return 8; }
      case 0x3a: { const hl = this.hl; this.a = this.rd(hl); this.hl = (hl - 1) & 0xffff; return 8; }
      case 0x03: this.bc = (this.bc + 1) & 0xffff; return 8;
      case 0x13: this.de = (this.de + 1) & 0xffff; return 8;
      case 0x23: this.hl = (this.hl + 1) & 0xffff; return 8;
      case 0x33: this.sp = (this.sp + 1) & 0xffff; return 8;
      case 0x0b: this.bc = (this.bc - 1) & 0xffff; return 8;
      case 0x1b: this.de = (this.de - 1) & 0xffff; return 8;
      case 0x2b: this.hl = (this.hl - 1) & 0xffff; return 8;
      case 0x3b: this.sp = (this.sp - 1) & 0xffff; return 8;
      case 0x09: this.addHL(this.bc); return 8;
      case 0x19: this.addHL(this.de); return 8;
      case 0x29: this.addHL(this.hl); return 8;
      case 0x39: this.addHL(this.sp); return 8;
      case 0x04: this.b = this.inc8(this.b); return 4;
      case 0x0c: this.c = this.inc8(this.c); return 4;
      case 0x14: this.d = this.inc8(this.d); return 4;
      case 0x1c: this.e = this.inc8(this.e); return 4;
      case 0x24: this.h = this.inc8(this.h); return 4;
      case 0x2c: this.l = this.inc8(this.l); return 4;
      case 0x34: this.wr(this.hl, this.inc8(this.rd(this.hl))); return 12;
      case 0x3c: this.a = this.inc8(this.a); return 4;
      case 0x05: this.b = this.dec8(this.b); return 4;
      case 0x0d: this.c = this.dec8(this.c); return 4;
      case 0x15: this.d = this.dec8(this.d); return 4;
      case 0x1d: this.e = this.dec8(this.e); return 4;
      case 0x25: this.h = this.dec8(this.h); return 4;
      case 0x2d: this.l = this.dec8(this.l); return 4;
      case 0x35: this.wr(this.hl, this.dec8(this.rd(this.hl))); return 12;
      case 0x3d: this.a = this.dec8(this.a); return 4;
      case 0x06: this.b = this.fetch(); return 8;
      case 0x0e: this.c = this.fetch(); return 8;
      case 0x16: this.d = this.fetch(); return 8;
      case 0x1e: this.e = this.fetch(); return 8;
      case 0x26: this.h = this.fetch(); return 8;
      case 0x2e: this.l = this.fetch(); return 8;
      case 0x36: this.wr(this.hl, this.fetch()); return 12;
      case 0x3e: this.a = this.fetch(); return 8;
      case 0x07: { const c = this.a >> 7; this.a = ((this.a << 1) | c) & 0xff; this.f = c ? FC : 0; return 4; }
      case 0x0f: { const c = this.a & 1; this.a = (this.a >> 1) | (c << 7); this.f = c ? FC : 0; return 4; }
      case 0x17: { const c = this.a >> 7; this.a = ((this.a << 1) | (this.f & FC ? 1 : 0)) & 0xff; this.f = c ? FC : 0; return 4; }
      case 0x1f: { const c = this.a & 1; this.a = (this.a >> 1) | (this.f & FC ? 0x80 : 0); this.f = c ? FC : 0; return 4; }
      case 0x08: { const a = this.fetch16(); this.wr(a, this.sp & 0xff); this.wr(a + 1, this.sp >> 8); return 20; }
      case 0x10: // STOP
        this.fetch();
        if (this.bus.trySpeedSwitch()) return 4;
        this.stopped = true;
        return 4;
      case 0x18: { const e = (this.fetch() << 24) >> 24; this.pc = (this.pc + e) & 0xffff; return 12; }
      case 0x20: case 0x28: case 0x30: case 0x38: {
        const e = (this.fetch() << 24) >> 24;
        if (this.cond((op >> 3) & 3)) {
          this.pc = (this.pc + e) & 0xffff;
          return 12;
        }
        return 8;
      }
      case 0x27: this.daa(); return 4;
      case 0x2f: this.a ^= 0xff; this.f = (this.f & (FZ | FC)) | FN | FH; return 4;
      case 0x37: this.f = (this.f & FZ) | FC; return 4;
      case 0x3f: this.f = (this.f & FZ) | (this.f & FC ? 0 : FC); return 4;

      case 0xc0: case 0xc8: case 0xd0: case 0xd8:
        this.idle();
        if (this.cond((op >> 3) & 3)) {
          this.pc = this.pop();
          return 20;
        }
        return 8;
      case 0xc9: this.pc = this.pop(); return 16;
      case 0xd9: this.pc = this.pop(); this.ime = true; this.imeDelay = 0; return 16;
      case 0xc1: this.bc = this.pop(); return 12;
      case 0xd1: this.de = this.pop(); return 12;
      case 0xe1: this.hl = this.pop(); return 12;
      case 0xf1: this.af = this.pop(); return 12;
      case 0xc5: this.push(this.bc); return 16;
      case 0xd5: this.push(this.de); return 16;
      case 0xe5: this.push(this.hl); return 16;
      case 0xf5: this.push(this.af); return 16;
      case 0xc2: case 0xca: case 0xd2: case 0xda: {
        const a = this.fetch16();
        if (this.cond((op >> 3) & 3)) {
          this.pc = a;
          return 16;
        }
        return 12;
      }
      case 0xc3: this.pc = this.fetch16(); return 16;
      case 0xe9: this.pc = this.hl; return 4;
      case 0xc4: case 0xcc: case 0xd4: case 0xdc: {
        const a = this.fetch16();
        if (this.cond((op >> 3) & 3)) {
          this.push(this.pc);
          this.pc = a;
          return 24;
        }
        return 12;
      }
      case 0xcd: { const a = this.fetch16(); this.push(this.pc); this.pc = a; return 24; }
      case 0xc7: case 0xcf: case 0xd7: case 0xdf: case 0xe7: case 0xef: case 0xf7: case 0xff:
        this.push(this.pc);
        this.pc = op & 0x38;
        return 16;
      case 0xc6: this.alu(0, this.fetch()); return 8;
      case 0xce: this.alu(1, this.fetch()); return 8;
      case 0xd6: this.alu(2, this.fetch()); return 8;
      case 0xde: this.alu(3, this.fetch()); return 8;
      case 0xe6: this.alu(4, this.fetch()); return 8;
      case 0xee: this.alu(5, this.fetch()); return 8;
      case 0xf6: this.alu(6, this.fetch()); return 8;
      case 0xfe: this.alu(7, this.fetch()); return 8;
      case 0xcb: return this.cb();
      case 0xe0: this.wr(0xff00 | this.fetch(), this.a); return 12;
      case 0xf0: this.a = this.rd(0xff00 | this.fetch()); return 12;
      case 0xe2: this.wr(0xff00 | this.c, this.a); return 8;
      case 0xf2: this.a = this.rd(0xff00 | this.c); return 8;
      case 0xea: this.wr(this.fetch16(), this.a); return 16;
      case 0xfa: this.a = this.rd(this.fetch16()); return 16;
      case 0xe8: this.sp = this.addSPe(this.fetch()); return 16;
      case 0xf8: this.hl = this.addSPe(this.fetch()); return 12;
      case 0xf9: this.sp = this.hl; return 8;
      case 0xf3: this.ime = false; this.imeDelay = 0; return 4;
      case 0xfb: if (!this.ime && !this.imeDelay) this.imeDelay = 2; return 4;
      default:
        // Illegal opcodes (D3, DB, DD, E3, E4, EB, EC, ED, F4, FC, FD) hang the real CPU.
        this.halted = true;
        this.bus.ie = 0;
        return 4;
    }
  }

  saveState() {
    const { a, f, b, c, d, e, h, l, sp, pc, ime, imeDelay, halted, haltBug, stopped } = this;
    return { a, f, b, c, d, e, h, l, sp, pc, ime, imeDelay, halted, haltBug, stopped };
  }
  loadState(s) {
    Object.assign(this, s);
  }
}
