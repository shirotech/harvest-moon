// Picture processing unit: CGB + DMG modes, scanline renderer.
// Output: 160x144 RGBA8 framebuffer, 5-bit colours expanded as (x<<3)|(x>>2).

const W = 160, H = 144;
const DMG_SHADES = [0xff, 0xaa, 0x55, 0x00];

export class PPU {
  constructor(gb) {
    this.gb = gb;
    this.fb = new Uint8Array(W * H * 4);
    this.fbDone = new Uint8Array(W * H * 4); // last completed frame
    this.vram = [new Uint8Array(0x2000), new Uint8Array(0x2000)];
    this.oam = new Uint8Array(0xa0);
    this.bgPal = new Uint8Array(64);
    this.objPal = new Uint8Array(64);
    this.lineColor = new Uint8Array(W); // bg colour index for priority
    this.linePrio = new Uint8Array(W); // bg attribute priority
    this.objLine = new Int16Array(W);
    this.reset();
  }

  reset() {
    this.lcdc = 0x91;
    this.stat = 0x85 & 0x78;
    this.scy = 0;
    this.scx = 0;
    this.ly = 0;
    this.lyc = 0;
    this.bgp = 0xfc;
    this.obp0 = 0xff;
    this.obp1 = 0xff;
    this.wy = 0;
    this.wx = 0;
    this.vbk = 0;
    this.bcps = 0;
    this.ocps = 0;
    this.opri = this.gb.cgb ? 0 : 1;
    this.mode = 2;
    this.dot = 0;
    this.winLine = 0;
    this.statLine = false;
    this.frameReady = false;
    this.bgPal.fill(0xff);
    this.objPal.fill(0);
  }

  get cgb() {
    return this.gb.cgb;
  }

  // --- register access ------------------------------------------------------
  readStat() {
    return 0x80 | (this.stat & 0x78) | (this.ly === this.lyc ? 4 : 0) | (this.lcdc & 0x80 ? this.mode : 0);
  }

  writeLcdc(v) {
    const was = this.lcdc & 0x80;
    this.lcdc = v;
    if (was && !(v & 0x80)) {
      this.ly = 0;
      this.dot = 0;
      this.mode = 0;
      this.winLine = 0;
      this.statLine = false;
    } else if (!was && v & 0x80) {
      this.ly = 0;
      this.dot = 0;
      this.mode = 2;
      this.winLine = 0;
      this.updateStat();
    }
  }

  writeStat(v) {
    this.stat = v & 0x78;
    this.updateStat();
  }

  writeLyc(v) {
    this.lyc = v;
    this.updateStat();
  }

  readPalData(obj) {
    return obj ? this.objPal[this.ocps & 0x3f] : this.bgPal[this.bcps & 0x3f];
  }

  writePalData(obj, v) {
    if (obj) {
      this.objPal[this.ocps & 0x3f] = v;
      if (this.ocps & 0x80) this.ocps = 0x80 | ((this.ocps + 1) & 0x3f);
    } else {
      this.bgPal[this.bcps & 0x3f] = v;
      if (this.bcps & 0x80) this.bcps = 0x80 | ((this.bcps + 1) & 0x3f);
    }
  }

  updateStat() {
    if (!(this.lcdc & 0x80)) return;
    const s = this.stat;
    const line =
      (s & 0x40 && this.ly === this.lyc) ||
      (s & 0x08 && this.mode === 0) ||
      (s & 0x10 && this.mode === 1) ||
      (s & 0x20 && this.mode === 2);
    if (line && !this.statLine) this.gb.if |= 2;
    this.statLine = !!line;
  }

  // --- timing -----------------------------------------------------------------
  /** Advance by `dots` (normal-speed T-cycles). */
  tick(dots) {
    if (!(this.lcdc & 0x80)) {
      // LCD off: still pace frames so the emulator loop keeps time
      this.dot += dots;
      if (this.dot >= 70224) {
        this.dot -= 70224;
        this.fb.fill(0xff);
        this.fbDone.set(this.fb);
        this.frameReady = true;
      }
      return;
    }
    this.dot += dots;
    for (;;) {
      if (this.mode === 2) {
        if (this.dot < 80) break;
        this.mode = 3;
      } else if (this.mode === 3) {
        if (this.dot < 252) break;
        this.renderLine();
        this.mode = 0;
        this.updateStat();
        this.gb.hblankDma();
      } else if (this.mode === 0) {
        if (this.dot < 456) break;
        this.dot -= 456;
        this.ly++;
        if (this.ly === 144) {
          this.mode = 1;
          this.gb.if |= 1;
          this.fbDone.set(this.fb);
          this.frameReady = true;
        } else this.mode = 2;
        this.updateStat();
      } else {
        if (this.dot < 456) break;
        this.dot -= 456;
        this.ly++;
        if (this.ly > 153) {
          this.ly = 0;
          this.winLine = 0;
          this.mode = 2;
        }
        this.updateStat();
      }
    }
  }

  // --- rendering --------------------------------------------------------------
  cgbColor(pal, idx, i, off) {
    const lo = pal[idx * 8 + i * 2];
    const hi = pal[idx * 8 + i * 2 + 1];
    const c = lo | (hi << 8);
    const r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    const fb = this.fb;
    fb[off] = (r << 3) | (r >> 2);
    fb[off + 1] = (g << 3) | (g >> 2);
    fb[off + 2] = (b << 3) | (b >> 2);
    fb[off + 3] = 255;
  }

  dmgColor(palReg, i, off) {
    const s = DMG_SHADES[(palReg >> (i * 2)) & 3];
    const fb = this.fb;
    fb[off] = s;
    fb[off + 1] = s;
    fb[off + 2] = s;
    fb[off + 3] = 255;
  }

  renderLine() {
    const ly = this.ly;
    const lcdc = this.lcdc;
    const cgb = this.cgb;
    const v0 = this.vram[0], v1 = this.vram[1];
    const row = ly * W * 4;
    const lineColor = this.lineColor;
    const linePrio = this.linePrio;
    const bgEnabled = cgb || lcdc & 1;
    const unsignedTiles = lcdc & 0x10;
    const winVisible = lcdc & 0x20 && (cgb || lcdc & 1) && this.wy <= ly && this.wx <= 166;
    const winX = this.wx - 7;
    let usedWindow = false;

    for (let x = 0; x < W; x++) {
      const off = row + x * 4;
      if (!bgEnabled) {
        lineColor[x] = 0;
        linePrio[x] = 0;
        this.dmgColor(this.bgp, 0, off);
        continue;
      }
      let mapBase, px, py;
      if (winVisible && x >= winX) {
        mapBase = lcdc & 0x40 ? 0x1c00 : 0x1800;
        px = x - winX;
        py = this.winLine;
        usedWindow = true;
      } else {
        mapBase = lcdc & 0x08 ? 0x1c00 : 0x1800;
        px = (x + this.scx) & 0xff;
        py = (ly + this.scy) & 0xff;
      }
      const mapAddr = mapBase + ((py >> 3) << 5) + (px >> 3);
      const tile = v0[mapAddr];
      const attr = cgb ? v1[mapAddr] : 0;
      const bank = attr & 0x08 ? v1 : v0;
      let ty = py & 7;
      if (attr & 0x40) ty = 7 - ty;
      const tileAddr = unsignedTiles ? tile << 4 : 0x1000 + (((tile << 24) >> 24) << 4);
      const lo = bank[tileAddr + ty * 2];
      const hi = bank[tileAddr + ty * 2 + 1];
      let bit = 7 - (px & 7);
      if (attr & 0x20) bit = 7 - bit;
      const ci = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
      lineColor[x] = ci;
      linePrio[x] = attr & 0x80 ? 1 : 0;
      if (cgb) this.cgbColor(this.bgPal, attr & 7, ci, off);
      else this.dmgColor(this.bgp, ci, off);
    }
    if (usedWindow) this.winLine++;

    if (lcdc & 0x02) this.renderSprites(ly, row);
  }

  renderSprites(ly, row) {
    const lcdc = this.lcdc;
    const cgb = this.cgb;
    const oam = this.oam;
    const h = lcdc & 0x04 ? 16 : 8;
    const list = [];
    for (let i = 0; i < 40 && list.length < 10; i++) {
      const y = oam[i * 4] - 16;
      if (ly >= y && ly < y + h) list.push(i);
    }
    if (!list.length) return;
    // Priority order: CGB = OAM index; DMG = lower X first, then OAM index.
    if (!cgb || this.opri & 1) list.sort((a, b) => oam[a * 4 + 1] - oam[b * 4 + 1] || a - b);
    const objLine = this.objLine;
    objLine.fill(-1);
    const lineColor = this.lineColor, linePrio = this.linePrio;
    const bgMaster = !cgb || lcdc & 1; // CGB: LCDC.0 = 0 makes sprites always win
    for (const i of list) {
      const y = oam[i * 4] - 16;
      const x = oam[i * 4 + 1] - 8;
      let tile = oam[i * 4 + 2];
      const attr = oam[i * 4 + 3];
      let ty = ly - y;
      if (attr & 0x40) ty = h - 1 - ty;
      if (h === 16) tile = (tile & 0xfe) | (ty >> 3);
      const bank = cgb && attr & 0x08 ? this.vram[1] : this.vram[0];
      const addr = (tile << 4) + (ty & 7) * 2;
      const lo = bank[addr], hi = bank[addr + 1];
      for (let px = 0; px < 8; px++) {
        const sx = x + px;
        if (sx < 0 || sx >= W || objLine[sx] !== -1) continue;
        const bit = attr & 0x20 ? px : 7 - px;
        const ci = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
        if (!ci) continue;
        objLine[sx] = i;
        const bgci = lineColor[sx];
        if (bgMaster && bgci !== 0 && (attr & 0x80 || (cgb && linePrio[sx]))) continue;
        const off = row + sx * 4;
        if (cgb) this.cgbColor(this.objPal, attr & 7, ci, off);
        else this.dmgColor(attr & 0x10 ? this.obp1 : this.obp0, ci, off);
      }
    }
  }

  saveState() {
    const p = {};
    for (const k of ['lcdc', 'stat', 'scy', 'scx', 'ly', 'lyc', 'bgp', 'obp0', 'obp1', 'wy', 'wx', 'vbk', 'bcps', 'ocps', 'opri', 'mode', 'dot', 'winLine', 'statLine'])
      p[k] = this[k];
    p.vram0 = this.vram[0].slice();
    p.vram1 = this.vram[1].slice();
    p.oam = this.oam.slice();
    p.bgPal = this.bgPal.slice();
    p.objPal = this.objPal.slice();
    return p;
  }

  loadState(p) {
    for (const [k, v] of Object.entries(p)) if (!(v instanceof Uint8Array) && !ArrayBuffer.isView(v) && typeof v !== 'object') this[k] = v;
    this.vram[0].set(p.vram0);
    this.vram[1].set(p.vram1);
    this.oam.set(p.oam);
    this.bgPal.set(p.bgPal);
    this.objPal.set(p.objPal);
  }
}
