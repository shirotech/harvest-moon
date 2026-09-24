// Render sprites to a labelled contact sheet PNG so pixel art can be reviewed.
//
//   bun tools/preview-atlas.ts [filterRegex] [--scale=3] [--out=path.png] [--pal=name] [--season=summer] [--bg=#hex]
//
// Each sprite is drawn with its own palette at the given scale on a checker
// background, with its name printed underneath in a tiny 3x5 debug font.
import { AtlasBuilder } from '../src/engine/atlas.js';
import { registerAll } from '../src/art/index.js';
import { encodePNG } from './png.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const filter = args.find((a) => !a.startsWith('--'));
const scale = Number(opt('scale', '3'));
const out = opt('out', 'art-preview.png');
const season = opt('season', 'spring');
const forcePal = opt('pal', '');
const bg = opt('bg', '');

const A = new AtlasBuilder();
registerAll(A);
const re = filter ? new RegExp(filter) : null;
const list = [...A.sprites.values()].filter((s) => !re || re.test(s.name));
if (!list.length) { console.error('no sprites match'); process.exit(1); }

// 3x5 debug font
const F: Record<string, string> = {
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',
  F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',
  K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',
  P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',
  U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',
  Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110',
  '4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111',
  '9':'111101111001110','_':'000000000000111','@':'010101111100011','-':'000000111000000','.':'000000000000010',
};
const labelW = (s: string) => s.length * 4;

const pad = 4;
const cells = list.map((s) => {
  const w = Math.max(s.w * scale, labelW(s.name));
  return { s, w: w + pad * 2, h: s.h * scale + 9 + pad * 2 };
});
const sheetW = Math.max(512, Math.min(1400, Math.max(...cells.map((c) => c.w))));
let x = 0, y = 0, rowH = 0;
const pos: { x: number; y: number }[] = [];
for (const c of cells) {
  if (x + c.w > sheetW) { x = 0; y += rowH; rowH = 0; }
  pos.push({ x, y });
  x += c.w; rowH = Math.max(rowH, c.h);
}
const W = sheetW, H = y + rowH;
const img = new Uint8Array(W * H * 4);
const put = (px: number, py: number, c: number[]) => {
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  img.set(c, (py * W + px) * 4);
};
for (let py = 0; py < H; py++)
  for (let px = 0; px < W; px++) put(px, py, [40, 40, 48, 255]);

const palFor = (name: string) => {
  const n = forcePal || name;
  return A.palettes.get(`${n}@${season}`) ?? A.palettes.get(n) ?? [...A.palettes.entries()].find(([k]) => k.startsWith(`${n}@`))?.[1];
};
const bgc = bg ? [parseInt(bg.slice(1, 3), 16), parseInt(bg.slice(3, 5), 16), parseInt(bg.slice(5, 7), 16), 255] : null;

cells.forEach((c, k) => {
  const { s } = c;
  const p = pos[k];
  const ox = p.x + pad, oy = p.y + pad;
  const pal = palFor(s.pal);
  if (!pal) console.warn(`missing palette ${s.pal} for ${s.name}`);
  for (let yy = 0; yy < s.h * scale; yy++)
    for (let xx = 0; xx < s.w * scale; xx++) {
      const v = s.data[Math.floor(yy / scale) * s.w + Math.floor(xx / scale)];
      let col: number[];
      if (v === 0) col = bgc ?? (((xx >> 2) + (yy >> 2)) & 1 ? [90, 90, 100, 255] : [70, 70, 80, 255]);
      else col = pal?.[v - 1] ?? [255, 0, 255, 255];
      put(ox + xx, oy + yy, col);
    }
  const ly = oy + s.h * scale + 2;
  [...s.name.toUpperCase()].forEach((ch, i) => {
    const g = F[ch];
    if (!g) return;
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++) if (g[gy * 3 + gx] === '1') put(ox + i * 4 + gx, ly + gy, [230, 230, 200, 255]);
  });
});

await Bun.write(out, encodePNG(W, H, img));
console.log(`wrote ${out}: ${list.length} sprites, ${W}x${H}`);
const atlas = A.build();
console.log(`atlas ${atlas.width}x${atlas.height}, ${Object.keys(atlas.sprites).length} sprites, ${atlas.palNames.length} palettes`);
