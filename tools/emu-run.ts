// Run a Game Boy ROM headlessly.
//   bun tools/emu-run.ts rom.gb [--seconds=10] [--png=out.png] [--expect=ref.png] [--model=dmg|cgb] [--mooneye]
import { GameBoy } from '../src/emu/gb.js';
import { encodePNG } from './png.ts';
import { decodePNG } from './pngdecode.ts';

export function runRom(path: string, opts: { seconds?: number; model?: string; mooneye?: boolean } = {}) {
  const rom = new Uint8Array(require('node:fs').readFileSync(path));
  const gb = new GameBoy(rom, { model: opts.model });
  let broke = false;
  if (opts.mooneye) (gb as any).onBreakpoint = () => (broke = true);
  const t0 = performance.now();
  gb.runSeconds(opts.seconds ?? 10, () => !broke);
  const ms = performance.now() - t0;
  const c = gb.cpu;
  const fib = c.b === 3 && c.c === 5 && c.d === 8 && c.e === 13 && c.h === 21 && c.l === 34;
  return { gb, ms, serial: gb.serialText(), mooneyePass: broke && fib, broke };
}

export function compareFrame(fb: Uint8Array, refPath: string) {
  const ref = decodePNG(new Uint8Array(require('node:fs').readFileSync(refPath)));
  let diff = 0;
  for (let i = 0; i < 160 * 144; i++) {
    const o = i * 4;
    if (fb[o] !== ref.rgba[o] || fb[o + 1] !== ref.rgba[o + 1] || fb[o + 2] !== ref.rgba[o + 2]) diff++;
  }
  return diff;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (k: string, d = '') => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const path = args.find((a) => !a.startsWith('--'))!;
  const r = runRom(path, { seconds: Number(opt('seconds', '10')), model: opt('model') || undefined, mooneye: args.includes('--mooneye') });
  console.log(`${path}: ${r.gb.cart.header.title} (${r.gb.cgb ? 'CGB' : 'DMG'} mode, ${r.gb.cart.header.mbc}) ran in ${r.ms.toFixed(0)}ms`);
  if (r.serial) console.log('serial:', JSON.stringify(r.serial.slice(-200)));
  if (args.includes('--mooneye')) console.log(r.mooneyePass ? 'MOONEYE PASS' : `MOONEYE FAIL (break=${r.broke})`);
  if (opt('png')) await Bun.write(opt('png'), encodePNG(160, 144, r.gb.framebuffer));
  if (opt('expect')) {
    const d = compareFrame(r.gb.framebuffer, opt('expect'));
    console.log(d === 0 ? 'SCREEN MATCH' : `SCREEN DIFF: ${d} pixels`);
  }
}
