// Game Boy / Game Boy Color system: memory bus, I/O, timer, joypad, serial,
// OAM DMA, CGB HDMA, double-speed mode and the frame loop.
// Starts from the documented post-boot state; no boot ROM is used or needed.
import { Cartridge } from './cart.js';
import { CPU } from './cpu.js';
import { PPU } from './ppu.js';
import { APU } from './apu.js';

export const BUTTON_BITS = {
  right: 0x01, left: 0x02, up: 0x04, down: 0x08, // direction nibble
  a: 0x10, b: 0x20, select: 0x40, start: 0x80, // action nibble (shifted)
};

export const CYCLES_PER_FRAME = 70224;

export class GameBoy {
  constructor(romBytes, opts = {}) {
    this.cart = new Cartridge(romBytes);
    const forceDmg = opts.model === 'dmg';
    this.cgb = !forceDmg && this.cart.header.cgb;
    this.wram = new Uint8Array(0x8000);
    this.hram = new Uint8Array(0x7f);
    this.ppu = new PPU(this);
    this.apu = new APU(this);
    this.cpu = new CPU(this);
    this.serialOut = [];
    this.reset();
  }

  reset() {
    this.cpu.reset(this.cgb);
    this.ppu.reset();
    this.apu.reset();
    this.wram.fill(0);
    this.hram.fill(0);
    this.ie = 0;
    this.if = 0xe1 & 0x1f;
    this.divCounter = this.cgb ? 0x1ea0 : 0xabcc;
    this.tima = 0;
    this.tma = 0;
    this.tac = 0xf8;
    this.timaState = 0;
    this.dmaActive = false;
    this.dmaDelay = 0;
    this.dmaIndex = 0;
    this.dmaSrc = 0;
    this.dmaNextSrc = 0;
    this.buttons = 0; // pressed bits (1 = pressed), see BUTTON_BITS
    this.p1 = 0xcf;
    this.sb = 0;
    this.sc = 0x7e;
    this.serialCycles = 0;
    this.svbk = 1;
    this.doubleSpeed = false;
    this.speedPrepare = false;
    this.dmaReg = 0xff;
    this.hdmaSrc = 0;
    this.hdmaDst = 0x8000;
    this.hdmaLen = 0x7f;
    this.hdmaActive = false;
    this.stall = 0;
    this.rp = 0;
    this.undoc = new Uint8Array(4);
    this.totalCycles = 0;
  }

  // --- memory bus ---------------------------------------------------------------
  read(a) {
    if (a < 0x8000) return this.cart.readRom(a);
    if (a < 0xa000) return this.ppu.vram[this.ppu.vbk][a - 0x8000];
    if (a < 0xc000) return this.cart.readRam(a);
    if (a < 0xd000) return this.wram[a - 0xc000];
    if (a < 0xe000) return this.wram[this.svbk * 0x1000 + (a - 0xd000)];
    if (a < 0xfe00) return this.read(a - 0x2000);
    if (a < 0xfea0) return this.dmaActive ? 0xff : this.ppu.oam[a - 0xfe00];
    if (a < 0xff00) return 0x00;
    if (a < 0xff80) return this.readIO(a);
    if (a < 0xffff) return this.hram[a - 0xff80];
    return this.ie;
  }

  write(a, v) {
    if (a < 0x8000) return this.cart.writeRom(a, v);
    if (a < 0xa000) {
      this.ppu.vram[this.ppu.vbk][a - 0x8000] = v;
      return;
    }
    if (a < 0xc000) return this.cart.writeRam(a, v);
    if (a < 0xd000) {
      this.wram[a - 0xc000] = v;
      return;
    }
    if (a < 0xe000) {
      this.wram[this.svbk * 0x1000 + (a - 0xd000)] = v;
      return;
    }
    if (a < 0xfe00) return this.write(a - 0x2000, v);
    if (a < 0xfea0) {
      if (!this.dmaActive) this.ppu.oam[a - 0xfe00] = v;
      return;
    }
    if (a < 0xff00) return;
    if (a < 0xff80) return this.writeIO(a, v);
    if (a < 0xffff) {
      this.hram[a - 0xff80] = v;
      return;
    }
    this.ie = v;
  }

  readIO(a) {
    const p = this.ppu;
    const cgb = this.cgb;
    switch (a) {
      case 0xff00: return this.readJoypad();
      case 0xff01: return this.sb;
      case 0xff02: return this.sc | (cgb ? 0x7c : 0x7e);
      case 0xff04: return (this.divCounter >> 8) & 0xff;
      case 0xff05: return this.tima;
      case 0xff06: return this.tma;
      case 0xff07: return this.tac | 0xf8;
      case 0xff0f: return this.if | 0xe0;
      case 0xff40: return p.lcdc;
      case 0xff41: return p.readStat();
      case 0xff42: return p.scy;
      case 0xff43: return p.scx;
      case 0xff44: return p.ly;
      case 0xff45: return p.lyc;
      case 0xff46: return this.dmaReg;
      case 0xff47: return p.bgp;
      case 0xff48: return p.obp0;
      case 0xff49: return p.obp1;
      case 0xff4a: return p.wy;
      case 0xff4b: return p.wx;
    }
    if (a >= 0xff10 && a < 0xff40) return this.apu.read(a);
    if (!cgb) return 0xff;
    switch (a) {
      case 0xff4d: return 0x7e | (this.doubleSpeed ? 0x80 : 0) | (this.speedPrepare ? 1 : 0);
      case 0xff4f: return 0xfe | p.vbk;
      case 0xff55: return this.hdmaActive ? this.hdmaLen & 0x7f : 0x80 | (this.hdmaLen & 0x7f);
      case 0xff56: return (this.rp & 0xc1) | 0x3e | 0x02;
      case 0xff68: return p.bcps | 0x40;
      case 0xff69: return p.readPalData(false);
      case 0xff6a: return p.ocps | 0x40;
      case 0xff6b: return p.readPalData(true);
      case 0xff6c: return p.opri | 0xfe;
      case 0xff70: return this.svbk | 0xf8;
      case 0xff72: return this.undoc[0];
      case 0xff73: return this.undoc[1];
      case 0xff74: return this.undoc[2];
      case 0xff75: return this.undoc[3] | 0x8f;
      case 0xff76: case 0xff77: return 0x00;
    }
    return 0xff;
  }

  writeIO(a, v) {
    const p = this.ppu;
    switch (a) {
      case 0xff00: this.p1 = (v & 0x30) | (this.p1 & 0xcf); return;
      case 0xff01: this.sb = v; return;
      case 0xff02:
        this.sc = v;
        if ((v & 0x81) === 0x81) {
          this.serialOut.push(this.sb);
          this.serialCycles = (this.cgb && v & 2 ? 16 : 512) * 8;
        }
        return;
      case 0xff04: this.writeDiv(); return;
      case 0xff05:
        if (this.timaState === 2) return; // ignored on the reload cycle
        this.tima = v;
        this.timaState = 0; // writing during the overflow cycle cancels the reload
        return;
      case 0xff06:
        this.tma = v;
        if (this.timaState === 2) this.tima = v;
        return;
      case 0xff07: {
        const before = this.timerBit();
        this.tac = v & 7;
        if (before && !this.timerBit()) this.incTima(true);
        return;
      }
      case 0xff0f: this.if = v & 0x1f; return;
      case 0xff40: p.writeLcdc(v); return;
      case 0xff41: p.writeStat(v); return;
      case 0xff42: p.scy = v; return;
      case 0xff43: p.scx = v; return;
      case 0xff44: return;
      case 0xff45: p.writeLyc(v); return;
      case 0xff46: this.oamDma(v); return;
      case 0xff47: p.bgp = v; return;
      case 0xff48: p.obp0 = v; return;
      case 0xff49: p.obp1 = v; return;
      case 0xff4a: p.wy = v; return;
      case 0xff4b: p.wx = v; return;
    }
    if (a >= 0xff10 && a < 0xff40) return this.apu.write(a, v);
    if (!this.cgb) return;
    switch (a) {
      case 0xff4d: this.speedPrepare = (v & 1) !== 0; return;
      case 0xff4f: p.vbk = v & 1; return;
      case 0xff51: this.hdmaSrc = (this.hdmaSrc & 0x00f0) | (v << 8); return;
      case 0xff52: this.hdmaSrc = (this.hdmaSrc & 0xff00) | (v & 0xf0); return;
      case 0xff53: this.hdmaDst = 0x8000 | ((v & 0x1f) << 8) | (this.hdmaDst & 0xf0); return;
      case 0xff54: this.hdmaDst = (this.hdmaDst & 0x9f00) | (v & 0xf0); return;
      case 0xff55: this.startHdma(v); return;
      case 0xff56: this.rp = v; return;
      case 0xff68: p.bcps = v & 0xbf; return;
      case 0xff69: p.writePalData(false, v); return;
      case 0xff6a: p.ocps = v & 0xbf; return;
      case 0xff6b: p.writePalData(true, v); return;
      case 0xff6c: p.opri = v & 1; return;
      case 0xff70: this.svbk = v & 7 || 1; return;
      case 0xff72: this.undoc[0] = v; return;
      case 0xff73: this.undoc[1] = v; return;
      case 0xff74: this.undoc[2] = v; return;
      case 0xff75: this.undoc[3] = v & 0x70; return;
    }
  }

  // --- joypad -----------------------------------------------------------------
  readJoypad() {
    let low = 0x0f;
    if (!(this.p1 & 0x10)) low &= ~(this.buttons & 0x0f);
    if (!(this.p1 & 0x20)) low &= ~((this.buttons >> 4) & 0x0f);
    return 0xc0 | (this.p1 & 0x30) | (low & 0x0f);
  }

  /** Set the full button state (bitmask of BUTTON_BITS). */
  setButtons(mask) {
    const pressed = mask & ~this.buttons;
    this.buttons = mask;
    if (pressed) {
      this.if |= 0x10;
      if (this.cpu.stopped) this.cpu.stopped = false;
    }
  }

  // --- timer ------------------------------------------------------------------
  timerBit() {
    if (!(this.tac & 4)) return 0;
    const bit = [9, 3, 5, 7][this.tac & 3];
    return (this.divCounter >> bit) & 1;
  }

  /** fromWrite: the increment was caused by a register write mid-cycle, so the
   *  reload happens one M-cycle later than for a normal overflow. */
  incTima(fromWrite = false) {
    if (this.tima === 0xff) {
      this.tima = 0;
      this.timaState = fromWrite ? 3 : 1;
    } else this.tima++;
  }

  writeDiv() {
    const apuBit = this.doubleSpeed ? 13 : 12;
    if (this.timerBit()) this.incTima(true);
    if ((this.divCounter >> apuBit) & 1) this.apu.frameStep();
    this.divCounter = 0;
  }

  tickTimer(cycles) {
    const apuBit = this.doubleSpeed ? 13 : 12;
    for (let c = 0; c < cycles; c += 4) {
      if (this.timaState === 2) this.timaState = 0;
      else if (this.timaState === 3) this.timaState = 1;
      else if (this.timaState === 1) {
        this.tima = this.tma;
        this.if |= 4;
        this.timaState = 2;
      }
      this.tickDma();
      const oldBit = this.timerBit();
      const old = this.divCounter;
      this.divCounter = (this.divCounter + 4) & 0xffff;
      if (oldBit && !this.timerBit()) this.incTima();
      if ((old >> apuBit) & 1 && !((this.divCounter >> apuBit) & 1)) this.apu.frameStep();
    }
  }

  // --- DMA --------------------------------------------------------------------
  oamDma(v) {
    this.dmaReg = v;
    // A new transfer starts after a short setup delay; if one is already running
    // it keeps OAM blocked (and keeps copying) until the new one takes over.
    this.dmaNextSrc = (v >= 0xe0 ? v - 0x20 : v) << 8;
    this.dmaDelay = 2;
  }

  /** One M-cycle of OAM DMA: copies one byte. */
  tickDma() {
    if (this.dmaDelay && --this.dmaDelay === 0) {
      this.dmaSrc = this.dmaNextSrc;
      this.dmaIndex = 0;
      this.dmaActive = true;
      return;
    }
    if (!this.dmaActive) return;
    this.dmaActive = false; // let the source read through
    const v = this.read(this.dmaSrc + this.dmaIndex);
    this.dmaActive = true;
    this.ppu.oam[this.dmaIndex] = v;
    if (++this.dmaIndex >= 0xa0) this.dmaActive = false;
  }

  startHdma(v) {
    if (this.hdmaActive && !(v & 0x80)) {
      // cancel an HBlank transfer
      this.hdmaActive = false;
      this.hdmaLen = 0x80 | (v & 0x7f);
      return;
    }
    this.hdmaLen = v & 0x7f;
    if (v & 0x80) {
      this.hdmaActive = true;
      if (!(this.ppu.lcdc & 0x80) || this.ppu.mode === 0) {
        // HBlank DMA started during HBlank / LCD off transfers one block at once
        if (!(this.ppu.lcdc & 0x80)) this.hblankDma();
      }
      return;
    }
    // general-purpose DMA: copy everything now
    const blocks = (v & 0x7f) + 1;
    for (let b = 0; b < blocks; b++) this.copyHdmaBlock();
    this.hdmaLen = 0xff;
    this.stall += blocks * 32 * (this.doubleSpeed ? 2 : 1);
  }

  copyHdmaBlock() {
    const vram = this.ppu.vram[this.ppu.vbk];
    for (let i = 0; i < 16; i++) {
      vram[(this.hdmaDst + i) & 0x1fff] = this.read((this.hdmaSrc + i) & 0xffff);
    }
    this.hdmaSrc = (this.hdmaSrc + 16) & 0xffff;
    this.hdmaDst = 0x8000 | ((this.hdmaDst + 16) & 0x1fff);
  }

  hblankDma() {
    if (!this.hdmaActive || this.cpu.halted) return;
    this.copyHdmaBlock();
    this.stall += 32 * (this.doubleSpeed ? 2 : 1);
    if (this.hdmaLen === 0) {
      this.hdmaActive = false;
      this.hdmaLen = 0xff;
    } else this.hdmaLen = (this.hdmaLen - 1) & 0x7f;
  }

  trySpeedSwitch() {
    if (!this.cgb || !this.speedPrepare) return false;
    this.doubleSpeed = !this.doubleSpeed;
    this.speedPrepare = false;
    this.divCounter = 0;
    return true;
  }

  // --- main loop --------------------------------------------------------------
  /** Advance other components by `c` CPU cycles. */
  advance(c) {
    this.tickTimer(c);
    if (this.serialCycles > 0) {
      this.serialCycles -= c;
      if (this.serialCycles <= 0) {
        this.serialCycles = 0;
        this.sb = 0xff;
        this.sc &= 0x7f;
        this.if |= 8;
      }
    }
    const dots = this.doubleSpeed ? c >> 1 : c;
    this.ppu.tick(dots);
    this.apu.tick(dots);
    this.totalCycles += dots;
  }

  /** Run until the next frame is complete (or a safety budget elapses). */
  runFrame() {
    const ppu = this.ppu;
    ppu.frameReady = false;
    const start = this.totalCycles;
    const cpu = this.cpu;
    while (!ppu.frameReady && this.totalCycles - start < CYCLES_PER_FRAME * 2) {
      let c = 4;
      if (cpu.stopped) this.advance(4);
      else {
        c = cpu.step();
        if (c > cpu.ticked) this.advance(c - cpu.ticked);
      }
      if (this.stall) {
        const st = this.stall;
        this.stall = 0;
        this.advance(st);
      }
    }
    if (this.cart.dirty) this.saveDirty = true;
  }

  /** Run a number of emulated seconds (used by headless tests). */
  runSeconds(sec, onFrame) {
    const frames = Math.ceil(sec * 59.7275);
    for (let i = 0; i < frames; i++) {
      this.runFrame();
      if (onFrame && onFrame(i) === false) break;
    }
  }

  get framebuffer() {
    return this.ppu.fbDone;
  }

  serialText() {
    return String.fromCharCode(...this.serialOut);
  }

  // --- save states --------------------------------------------------------------
  saveState() {
    const keys = ['ie', 'if', 'divCounter', 'tima', 'tma', 'tac', 'timaState', 'dmaActive', 'dmaDelay', 'dmaIndex', 'dmaSrc', 'dmaNextSrc', 'p1', 'sb', 'sc', 'serialCycles', 'svbk',
      'doubleSpeed', 'speedPrepare', 'dmaReg', 'hdmaSrc', 'hdmaDst', 'hdmaLen', 'hdmaActive', 'rp', 'totalCycles'];
    const s = { v: 1, id: this.cart.header.id };
    for (const k of keys) s[k] = this[k];
    s.wram = this.wram.slice();
    s.hram = this.hram.slice();
    s.undoc = this.undoc.slice();
    s.cpu = this.cpu.saveState();
    s.ppu = this.ppu.saveState();
    s.apu = this.apu.saveState();
    s.cart = this.cart.saveState();
    return s;
  }

  loadState(s) {
    if (s.id !== this.cart.header.id) throw new Error('This save state belongs to a different cartridge.');
    for (const [k, v] of Object.entries(s)) {
      if (['wram', 'hram', 'undoc', 'cpu', 'ppu', 'apu', 'cart', 'v', 'id'].includes(k)) continue;
      this[k] = v;
    }
    this.wram.set(s.wram);
    this.hram.set(s.hram);
    this.undoc.set(s.undoc);
    this.cpu.loadState(s.cpu);
    this.ppu.loadState(s.ppu);
    this.apu.loadState(s.apu);
    this.cart.loadState(s.cart);
  }
}
