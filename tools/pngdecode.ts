// Minimal PNG decoder (8-bit grey/RGB/RGBA/palette, non-interlaced) for test comparisons.
import { inflateSync } from 'node:zlib';

export function decodePNG(buf: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8, width = 0, height = 0, depth = 0, type = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = dv.getUint32(pos);
    const t = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (t === 'IHDR') {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      depth = data[8];
      type = data[9];
      if (data[12]) throw new Error('interlaced PNG not supported');
    } else if (t === 'PLTE') palette = data;
    else if (t === 'tRNS') trns = data;
    else if (t === 'IDAT') idat.push(data);
    else if (t === 'IEND') break;
    pos += 12 + len;
  }
  const total = idat.reduce((n, d) => n + d.length, 0);
  const z = new Uint8Array(total);
  let o = 0;
  for (const d of idat) { z.set(d, o); o += d.length; }
  const raw = new Uint8Array(inflateSync(z));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  const bitsPP = channels * depth;
  const stride = Math.ceil((width * bitsPP) / 8);
  const bpp = Math.max(1, bitsPP >> 3);
  const out = new Uint8Array(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[rp++];
    const line = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = raw[rp++];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const row = out.subarray(y * stride);
      const sample = (idx: number) => {
        if (depth === 8) return row[idx];
        const bit = idx * depth;
        return (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      };
      if (type === 3) {
        const pi = sample(x);
        rgba.set([palette![pi * 3], palette![pi * 3 + 1], palette![pi * 3 + 2], trns && pi < trns.length ? trns[pi] : 255], i);
      } else if (type === 0) {
        const g = depth === 8 ? row[x] : Math.round((sample(x) * 255) / ((1 << depth) - 1));
        rgba.set([g, g, g, 255], i);
      } else if (type === 2) rgba.set([row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255], i);
      else if (type === 6) rgba.set(row.subarray(x * 4, x * 4 + 4), i);
      else if (type === 4) rgba.set([row[x * 2], row[x * 2], row[x * 2], row[x * 2 + 1]], i);
    }
  return { width, height, rgba };
}
