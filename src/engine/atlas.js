// Indexed-colour sprite atlas builder.
//
// Every sprite is stored as palette indices (0 = transparent, 1..8 = palette
// colour). The GPU looks the colour up in a palette texture at draw time, which
// lets us swap palettes per instance (e.g. dry vs. watered soil) and per season
// (grass@spring -> grass@fall) without touching the pixel data.
//
// This module is pure JS so it runs both in the browser and under Bun (tools).

export const PAL_COLORS = 8; // colours per palette row

export function hexToRgba(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** Parse an ASCII-art block: '.' or ' ' = 0, '1'..'9' = index. */
export function parseArt(art) {
  const lines = art
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error('empty art');
  const w = Math.max(...lines.map((l) => l.length));
  const h = lines.length;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const l = lines[y];
    for (let x = 0; x < l.length; x++) {
      const c = l[x];
      if (c === '.' || c === ' ') continue;
      const v = c.charCodeAt(0) - 48;
      if (v < 0 || v > 9) throw new Error(`bad art char '${c}' at ${x},${y}`);
      data[y * w + x] = v;
    }
  }
  return { w, h, data };
}

/** Tiny deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Drawing surface handed to paint() callbacks. */
export class Canvas {
  constructor(w, h, builder) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h);
    this._b = builder;
  }
  px(x, y, i) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = i;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }
  fill(i) {
    this.data.fill(i);
  }
  rect(x, y, w, h, i) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, i);
  }
  frame(x, y, w, h, i) {
    this.hline(x, x + w - 1, y, i);
    this.hline(x, x + w - 1, y + h - 1, i);
    this.vline(x, y, y + h - 1, i);
    this.vline(x + w - 1, y, y + h - 1, i);
  }
  hline(x0, x1, y, i) {
    for (let x = x0; x <= x1; x++) this.px(x, y, i);
  }
  vline(x, y0, y1, i) {
    for (let y = y0; y <= y1; y++) this.px(x, y, i);
  }
  line(x0, y0, x1, y1, i) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, i);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  circle(cx, cy, r, i, filled = true) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (filled ? d <= r * r + r * 0.8 : d <= r * r + r * 0.8 && d >= (r - 1) * (r - 1) + (r - 1) * 0.8)
          this.px(cx + x, cy + y, i);
      }
  }
  ellipse(cx, cy, rx, ry, i) {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) this.px(cx + x, cy + y, i);
  }
  /** Draw ASCII art at an offset; '.' pixels are skipped. */
  art(x, y, art) {
    const a = parseArt(art);
    for (let yy = 0; yy < a.h; yy++)
      for (let xx = 0; xx < a.w; xx++) {
        const v = a.data[yy * a.w + xx];
        if (v) this.px(x + xx, y + yy, v);
      }
  }
  /** Copy a previously defined sprite into this canvas (transparent pixels skipped). */
  blit(name, dx = 0, dy = 0, opts = {}) {
    const s = this._b.sprites.get(name);
    if (!s) throw new Error(`blit: unknown sprite ${name}`);
    const { flipX = false, flipY = false, remap = null } = opts;
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        let v = s.data[y * s.w + x];
        if (!v) continue;
        if (remap && remap[v] !== undefined) v = remap[v];
        const tx = flipX ? s.w - 1 - x : x;
        const ty = flipY ? s.h - 1 - y : y;
        this.px(dx + tx, dy + ty, v);
      }
  }
  /** Replace every pixel of index `from` with `to`. */
  replace(from, to) {
    for (let k = 0; k < this.data.length; k++) if (this.data[k] === from) this.data[k] = to;
  }
  rng(seed) {
    return rng(seed);
  }
}

export class AtlasBuilder {
  constructor() {
    /** @type {Map<string, number[][]>} */
    this.palettes = new Map();
    /** @type {Map<string, {name:string,w:number,h:number,data:Uint8Array,pal:string}>} */
    this.sprites = new Map();
  }

  /** Define a palette of up to 8 colours (hex strings). Index 1 = first colour. */
  pal(name, colors) {
    if (colors.length > PAL_COLORS) throw new Error(`palette ${name} has >${PAL_COLORS} colours`);
    this.palettes.set(name, colors.map(hexToRgba));
    return name;
  }

  _add(name, pal, w, h, data) {
    if (this.sprites.has(name)) throw new Error(`duplicate sprite ${name}`);
    this.sprites.set(name, { name, w, h, data, pal });
  }

  /** Define a sprite from ASCII art. */
  sprite(name, pal, art) {
    const a = parseArt(art);
    this._add(name, pal, a.w, a.h, a.data);
    return name;
  }

  /** Define a sprite procedurally. fn receives a Canvas. */
  paint(name, pal, w, h, fn) {
    const c = new Canvas(w, h, this);
    fn(c);
    this._add(name, pal, w, h, c.data);
    return name;
  }

  /** Derive a sprite from another: flip and/or remap indices, optional new palette. */
  derive(name, from, opts = {}) {
    const s = this.sprites.get(from);
    if (!s) throw new Error(`derive: unknown sprite ${from}`);
    return this.paint(name, opts.pal ?? s.pal, s.w, s.h, (g) =>
      g.blit(from, 0, 0, { flipX: opts.flipX, flipY: opts.flipY, remap: opts.remap }),
    );
  }

  /** Pack everything into a single index texture. */
  build(width = 1024) {
    const list = [...this.sprites.values()].sort((a, b) => b.h - a.h || b.w - a.w || (a.name < b.name ? -1 : 1));
    const PAD = 1;
    let x = PAD, y = PAD, rowH = 0;
    const rects = {};
    for (const s of list) {
      if (s.w + 2 * PAD > width) throw new Error(`sprite ${s.name} too wide for atlas`);
      if (x + s.w + PAD > width) {
        x = PAD;
        y += rowH + PAD;
        rowH = 0;
      }
      rects[s.name] = { x, y, w: s.w, h: s.h };
      x += s.w + PAD;
      rowH = Math.max(rowH, s.h);
    }
    let height = 1;
    while (height < y + rowH + PAD) height *= 2;
    const pixels = new Uint8Array(width * height);
    for (const s of list) {
      const r = rects[s.name];
      for (let yy = 0; yy < s.h; yy++) pixels.set(s.data.subarray(yy * s.w, yy * s.w + s.w), (r.y + yy) * width + r.x);
    }

    // Palette table. Seasonal variants ("grass@summer") live in their own rows
    // and the base name ("grass") gets a row the engine overwrites at runtime.
    const palNames = [];
    const seen = new Set();
    for (const n of this.palettes.keys()) {
      const base = n.split('@')[0];
      if (!seen.has(base)) {
        seen.add(base);
        palNames.push(base);
      }
    }
    for (const n of this.palettes.keys()) if (n.includes('@')) palNames.push(n);
    if (palNames.length > 1024) throw new Error('too many palettes');
    const palIndex = {};
    const palRows = new Uint8Array(palNames.length * PAL_COLORS * 4);
    palNames.forEach((n, row) => {
      palIndex[n] = row;
      const cols = this.palettes.get(n) ?? this.palettes.get(`${n}@spring`) ?? this.palettes.get(
        [...this.palettes.keys()].find((k) => k.startsWith(`${n}@`)),
      );
      if (!cols) throw new Error(`palette ${n} missing`);
      cols.forEach((c, i) => palRows.set(c, (row * PAL_COLORS + i) * 4));
    });

    const sprites = {};
    for (const s of this.sprites.values()) {
      const pal = palIndex[s.pal];
      if (pal === undefined) throw new Error(`sprite ${s.name} uses unknown palette ${s.pal}`);
      sprites[s.name] = { ...rects[s.name], pal };
    }
    return { width, height, pixels, sprites, palIndex, palNames, palRows, rawPalettes: this.palettes };
  }
}
