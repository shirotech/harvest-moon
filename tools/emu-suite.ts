// Run the open Game Boy test-ROM suites headlessly and report pass/fail.
//   bun tools/emu-suite.ts <path-to-game-boy-test-roms> [filter]
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runRom, compareFrame } from './emu-run.ts';

const root = process.argv[2];
const filter = process.argv[3] ?? '';
if (!root || !existsSync(root)) {
  console.log('usage: bun tools/emu-suite.ts <game-boy-test-roms dir> [filter]');
  process.exit(2);
}

type Case = { name: string; rom: string; seconds: number; model?: string; expect?: string; mooneye?: boolean; serialPass?: boolean };
const cases: Case[] = [];
const B = join(root, 'blargg');
cases.push({ name: 'blargg/cpu_instrs', rom: join(B, 'cpu_instrs/cpu_instrs.gb'), seconds: 31, expect: join(B, 'cpu_instrs/cpu_instrs-dmg-cgb.png') });
cases.push({ name: 'blargg/instr_timing', rom: join(B, 'instr_timing/instr_timing.gb'), seconds: 2, expect: join(B, 'instr_timing/instr_timing-dmg-cgb.png') });
cases.push({ name: 'blargg/halt_bug', rom: join(B, 'halt_bug.gb'), seconds: 3, expect: join(B, 'halt_bug-dmg-cgb.png') });
cases.push({ name: 'blargg/interrupt_time', rom: join(B, 'interrupt_time/interrupt_time.gb'), seconds: 3, expect: join(B, 'interrupt_time/interrupt_time-cgb.png') });
cases.push({ name: 'blargg/mem_timing', rom: join(B, 'mem_timing/mem_timing.gb'), seconds: 4, expect: join(B, 'mem_timing/mem_timing-dmg-cgb.png') });
cases.push({ name: 'blargg/mem_timing-2', rom: join(B, 'mem_timing-2/mem_timing.gb'), seconds: 5, expect: join(B, 'mem_timing-2/mem_timing-dmg-cgb.png') });
cases.push({ name: 'dmg-acid2 (DMG)', rom: join(root, 'dmg-acid2/dmg-acid2.gb'), seconds: 2, model: 'dmg', expect: join(root, 'dmg-acid2/dmg-acid2-dmg.png') });
cases.push({ name: 'cgb-acid2', rom: join(root, 'cgb-acid2/cgb-acid2.gbc'), seconds: 2, expect: join(root, 'cgb-acid2/cgb-acid2.png') });
const M = join(root, 'mooneye-test-suite');
for (const dir of ['acceptance', 'acceptance/timer', 'acceptance/bits', 'acceptance/instr', 'acceptance/interrupts', 'acceptance/oam_dma', 'emulator-only/mbc1', 'emulator-only/mbc2', 'emulator-only/mbc5']) {
  const d = join(M, dir);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((f) => f.endsWith('.gb')).sort()) {
    if (/-(dmg0|mgb|sgb|sgb2|S|A|dmgABC|dmgABCmgb|dmgABCmgbS|dmgABCmgbS2)\.gb$/.test(f)) continue; // non-CGB hardware variants
    cases.push({ name: `mooneye/${dir}/${f}`, rom: join(d, f), seconds: 20, mooneye: true });
  }
}

let pass = 0, fail = 0;
const failed: string[] = [];
for (const c of cases) {
  if (filter && !c.name.includes(filter)) continue;
  if (!existsSync(c.rom)) continue;
  const r = runRom(c.rom, c);
  let ok: boolean;
  let detail = '';
  if (c.mooneye) ok = r.mooneyePass;
  else if (c.expect) {
    const d = compareFrame(r.gb.framebuffer, c.expect);
    ok = d === 0;
    detail = ok ? '' : `${d} px differ`;
  } else {
    ok = /Passed/.test(r.serial);
    detail = ok ? '' : JSON.stringify(r.serial.slice(-80));
  }
  if (ok) pass++;
  else {
    fail++;
    failed.push(`${c.name} ${detail}`);
  }
  console.log(`${ok ? '✓' : '✗'} ${c.name} ${detail}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (failed.length) console.log('FAILED:\n  ' + failed.join('\n  '));
