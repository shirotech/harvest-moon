// Cartridge: header parsing and memory bank controllers (MBC1/2/3/5).
// The player supplies their own cartridge dump; nothing is bundled.

const RAM_SIZES = [0, 0x800, 0x2000, 0x8000, 0x20000, 0x10000];

export function parseHeader(rom) {
  let title = '';
  for (let i = 0x134; i < 0x144; i++) {
    const c = rom[i];
    if (!c) break;
    if (c >= 32 && c < 127) title += String.fromCharCode(c);
  }
  const cgbFlag = rom[0x143];
  const type = rom[0x147];
  const romBanks = Math.max(2, rom.length >> 14);
  let ramSize = RAM_SIZES[rom[0x149]] ?? 0;
  let mbc = 'none', battery = false, rtc = false, rumble = false;
  switch (type) {
    case 0x00: break;
    case 0x08: break;
    case 0x09: battery = true; break;
    case 0x01: case 0x02: mbc = 'mbc1'; break;
    case 0x03: mbc = 'mbc1'; battery = true; break;
    case 0x05: mbc = 'mbc2'; break;
    case 0x06: mbc = 'mbc2'; battery = true; break;
    case 0x0f: case 0x10: mbc = 'mbc3'; battery = true; rtc = true; break;
    case 0x11: case 0x12: mbc = 'mbc3'; break;
    case 0x13: mbc = 'mbc3'; battery = true; break;
    case 0x19: case 0x1a: mbc = 'mbc5'; break;
    case 0x1b: mbc = 'mbc5'; battery = true; break;
    case 0x1c: case 0x1d: mbc = 'mbc5'; rumble = true; break;
    case 0x1e: mbc = 'mbc5'; battery = true; rumble = true; break;
    default: mbc = 'mbc5'; battery = true; // best effort for exotic mappers
  }
  if (mbc === 'mbc2') ramSize = 512;
  if (type === 0x08 || type === 0x09) ramSize = ramSize || 0x2000;
  let checksum = 0;
  for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) checksum = (checksum + rom[i]) & 0xffff;
  let hsum = 0;
  for (let i = 0x134; i <= 0x14c; i++) hsum = (hsum - rom[i] - 1) & 0xff;
  return {
    title: title.trim() || 'UNTITLED',
    cgb: (cgbFlag & 0x80) !== 0,
    cgbOnly: cgbFlag === 0xc0,
    type, mbc, battery, rtc, rumble, romBanks, ramSize,
    checksum,
    headerOk: hsum === rom[0x14d],
    id: `${(title.trim() || 'UNTITLED').replace(/[^A-Za-z0-9]/g, '_')}-${checksum.toString(16).padStart(4, '0')}`,
  };
}

export class Cartridge {
  constructor(rom) {
    if (rom.length < 0x150) throw new Error('Not a Game Boy cartridge image (file too small).');
    // pad to a power-of-two bank count so masking works
    let banks = 2;
    while (banks * 0x4000 < rom.length) banks *= 2;
    if (banks * 0x4000 !== rom.length) {
      const padded = new Uint8Array(banks * 0x4000).fill(0xff);
      padded.set(rom);
      rom = padded;
    }
    this.rom = rom;
    this.header = parseHeader(rom);
    // MBC1 multicarts (MBC1M) wire the bank register differently; detect them by
    // a second copy of the header logo in the upper 256 KiB game slots.
    this.multicart = false;
    if (this.header.mbc === 'mbc1' && rom.length === 0x100000) {
      let same = true;
      for (let i = 0; i < 0x30 && same; i++) same = rom[0x104 + i] === rom[0x40104 + i];
      this.multicart = same;
    }
    this.romMask = banks - 1;
    this.ram = new Uint8Array(Math.max(this.header.ramSize, 0));
    this.ramMask = this.ram.length ? (this.ram.length >> 13) - 1 : 0;
    this.ramEnabled = false;
    this.romBank = 1;
    this.ramBank = 0;
    this.bankHi = 0; // MBC1 upper bits
    this.mode = 0; // MBC1 banking mode
    this.dirty = false;
    // MBC3 real-time clock: registers derived from wall-clock seconds
    this.rtcBase = Date.now() / 1000; // wall time corresponding to rtc counter 0
    this.rtcHalt = false;
    this.rtcHaltAt = 0;
    this.rtcCarry = false;
    this.rtcLatched = new Uint8Array(5);
    this.rtcLatchState = 0xff;
    this.rtcSelect = -1;
  }

  // --- ROM ------------------------------------------------------------------
  readRom(addr) {
    const h = this.header;
    if (addr < 0x4000) {
      if (h.mbc === 'mbc1' && this.mode === 1) {
        const bank = (this.bankHi << (this.multicart ? 4 : 5)) & this.romMask;
        return this.rom[bank * 0x4000 + addr];
      }
      return this.rom[addr];
    }
    let bank;
    switch (h.mbc) {
      case 'none':
        bank = 1;
        break;
      case 'mbc1':
        bank = this.multicart
          ? ((this.bankHi << 4) | ((this.romBank || 1) & 0x0f)) & this.romMask
          : ((this.bankHi << 5) | (this.romBank || 1)) & this.romMask;
        break;
      case 'mbc2':
        bank = (this.romBank || 1) & this.romMask;
        break;
      case 'mbc3':
        bank = (this.romBank || 1) & this.romMask;
        break;
      default:
        bank = this.romBank & this.romMask;
    }
    return this.rom[bank * 0x4000 + (addr - 0x4000)];
  }

  writeRom(addr, v) {
    const h = this.header;
    switch (h.mbc) {
      case 'mbc1':
        if (addr < 0x2000) this.ramEnabled = (v & 0x0f) === 0x0a;
        else if (addr < 0x4000) this.romBank = v & 0x1f;
        else if (addr < 0x6000) this.bankHi = v & 3;
        else this.mode = v & 1;
        break;
      case 'mbc2':
        if (addr < 0x4000) {
          if (addr & 0x100) this.romBank = v & 0x0f;
          else this.ramEnabled = (v & 0x0f) === 0x0a;
        }
        break;
      case 'mbc3':
        if (addr < 0x2000) this.ramEnabled = (v & 0x0f) === 0x0a;
        else if (addr < 0x4000) this.romBank = v & 0x7f;
        else if (addr < 0x6000) {
          if (v <= 3) {
            this.ramBank = v;
            this.rtcSelect = -1;
          } else if (v >= 0x08 && v <= 0x0c) this.rtcSelect = v - 0x08;
        } else {
          if (this.rtcLatchState === 0 && v === 1) this.latchRtc();
          this.rtcLatchState = v;
        }
        break;
      case 'mbc5':
        if (addr < 0x2000) this.ramEnabled = (v & 0x0f) === 0x0a;
        else if (addr < 0x3000) this.romBank = (this.romBank & 0x100) | v;
        else if (addr < 0x4000) this.romBank = (this.romBank & 0xff) | ((v & 1) << 8);
        else if (addr < 0x6000) this.ramBank = v & (h.rumble ? 0x07 : 0x0f);
        break;
    }
  }

  // --- RAM ------------------------------------------------------------------
  ramOffset(addr) {
    let bank = this.ramBank;
    if (this.header.mbc === 'mbc1') bank = this.mode === 1 ? this.bankHi : 0;
    return ((bank & this.ramMask) << 13) + (addr - 0xa000);
  }

  readRam(addr) {
    const h = this.header;
    if (h.mbc !== 'none' && !this.ramEnabled) return 0xff;
    if (h.mbc === 'mbc3' && this.rtcSelect >= 0) return this.rtcLatched[this.rtcSelect];
    if (h.mbc === 'mbc2') return this.ram[(addr - 0xa000) & 0x1ff] | 0xf0;
    if (!this.ram.length) return 0xff;
    return this.ram[this.ramOffset(addr) % this.ram.length];
  }

  writeRam(addr, v) {
    const h = this.header;
    if (h.mbc !== 'none' && !this.ramEnabled) return;
    if (h.mbc === 'mbc3' && this.rtcSelect >= 0) return this.writeRtc(this.rtcSelect, v);
    if (h.mbc === 'mbc2') {
      this.ram[(addr - 0xa000) & 0x1ff] = v & 0x0f;
      this.dirty = true;
      return;
    }
    if (!this.ram.length) return;
    this.ram[this.ramOffset(addr) % this.ram.length] = v;
    this.dirty = true;
  }

  // --- RTC (MBC3) -----------------------------------------------------------
  rtcSeconds() {
    const now = this.rtcHalt ? this.rtcHaltAt : Date.now() / 1000;
    return Math.max(0, Math.floor(now - this.rtcBase));
  }

  latchRtc() {
    let t = this.rtcSeconds();
    let days = Math.floor(t / 86400);
    if (days > 511) {
      this.rtcCarry = true;
      days %= 512;
      this.rtcBase += 512 * 86400;
      t = this.rtcSeconds();
    }
    const r = this.rtcLatched;
    r[0] = t % 60;
    r[1] = Math.floor(t / 60) % 60;
    r[2] = Math.floor(t / 3600) % 24;
    r[3] = days & 0xff;
    r[4] = ((days >> 8) & 1) | (this.rtcHalt ? 0x40 : 0) | (this.rtcCarry ? 0x80 : 0);
  }

  writeRtc(reg, v) {
    const t = this.rtcSeconds();
    let s = t % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600) % 24, d = Math.floor(t / 86400) % 512;
    switch (reg) {
      case 0: s = v % 60; break;
      case 1: m = v % 60; break;
      case 2: h = v % 24; break;
      case 3: d = (d & 0x100) | v; break;
      case 4: {
        d = (d & 0xff) | ((v & 1) << 8);
        const halt = (v & 0x40) !== 0;
        if (halt && !this.rtcHalt) this.rtcHaltAt = Date.now() / 1000;
        if (!halt && this.rtcHalt) this.rtcBase += Date.now() / 1000 - this.rtcHaltAt;
        this.rtcHalt = halt;
        this.rtcCarry = (v & 0x80) !== 0;
        break;
      }
    }
    const total = s + m * 60 + h * 3600 + d * 86400;
    const now = this.rtcHalt ? this.rtcHaltAt : Date.now() / 1000;
    this.rtcBase = now - total;
    this.rtcLatched[reg] = v;
    this.dirty = true;
  }

  // --- persistence ------------------------------------------------------------
  /** Battery-backed data (RAM + RTC) as a byte array, or null. */
  exportSave() {
    if (!this.header.battery) return null;
    const extra = this.header.rtc ? 16 : 0;
    const out = new Uint8Array(this.ram.length + extra);
    out.set(this.ram);
    if (extra) {
      const dv = new DataView(out.buffer, this.ram.length);
      dv.setFloat64(0, this.rtcBase);
      dv.setUint8(8, (this.rtcHalt ? 1 : 0) | (this.rtcCarry ? 2 : 0));
      dv.setFloat32(12, this.rtcHalt ? this.rtcHaltAt - this.rtcBase : 0);
    }
    return out;
  }

  importSave(data) {
    if (!data) return;
    this.ram.set(data.subarray(0, Math.min(this.ram.length, data.length)));
    if (this.header.rtc && data.length >= this.ram.length + 16) {
      const dv = new DataView(data.buffer, data.byteOffset + this.ram.length);
      this.rtcBase = dv.getFloat64(0);
      const fl = dv.getUint8(8);
      this.rtcHalt = (fl & 1) !== 0;
      this.rtcCarry = (fl & 2) !== 0;
      if (this.rtcHalt) this.rtcHaltAt = this.rtcBase + dv.getFloat32(12);
    }
  }

  saveState() {
    return {
      ram: this.ram.slice(),
      ramEnabled: this.ramEnabled, romBank: this.romBank, ramBank: this.ramBank, bankHi: this.bankHi, mode: this.mode,
      rtcBase: this.rtcBase, rtcHalt: this.rtcHalt, rtcHaltAt: this.rtcHaltAt, rtcCarry: this.rtcCarry,
      rtcLatched: this.rtcLatched.slice(), rtcLatchState: this.rtcLatchState, rtcSelect: this.rtcSelect,
    };
  }

  loadState(st) {
    this.ram.set(st.ram);
    Object.assign(this, { ...st, ram: this.ram, rtcLatched: Uint8Array.from(st.rtcLatched) });
  }
}
