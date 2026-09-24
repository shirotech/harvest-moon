// Emulator tests. The synthetic tests assemble tiny programs in memory, so they
// need no external ROMs. If the open test-ROM collection is present in
// .cache/roms (see README), those run too.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { GameBoy } from '../src/emu/gb.js';
import { parseHeader } from '../src/emu/cart.js';

/** Build a 32 KiB ROM image with a valid header and `code` at 0x150. */
function makeRom(code, { cgb = true, type = 0x00, ram = 0x00, title = 'TEST' } = {}) {
  const rom = new Uint8Array(0x8000);
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x100); // nop; jp $0150
  for (let i = 0; i < title.length; i++) rom[0x134 + i] = title.charCodeAt(i);
  rom[0x143] = cgb ? 0x80 : 0x00;
  rom[0x147] = type;
  rom[0x149] = ram;
  let sum = 0;
  for (let i = 0x134; i <= 0x14c; i++) sum = (sum - rom[i] - 1) & 0xff;
  rom[0x14d] = sum;
  rom.set(code, 0x150);
  return rom;
}

function run(code, frames = 2, opts) {
  const gb = new GameBoy(makeRom(code, opts));
  for (let i = 0; i < frames; i++) gb.runFrame();
  return gb;
}

describe('cartridge header', () => {
  test('parses title, CGB flag and checksum', () => {
    const h = parseHeader(makeRom([], { title: 'MOON', type: 0x1b, ram: 0x03 }));
    expect(h.title).toBe('MOON');
    expect(h.cgb).toBe(true);
    expect(h.mbc).toBe('mbc5');
    expect(h.battery).toBe(true);
    expect(h.ramSize).toBe(0x8000);
    expect(h.headerOk).toBe(true);
  });
});

describe('CPU', () => {
  test('boots into CGB mode with A=0x11', () => {
    // halt: 0x76, loop forever: jr -2
    const gb = run([0x76, 0x18, 0xfe], 1);
    expect(gb.cgb).toBe(true);
    expect(gb.cpu.a).toBe(0x11);
  });

  test('computes a Fibonacci number with loops and 16-bit adds', () => {
    // ld b,10; ld hl,0; ld de,1; loop: push hl; add hl,de; pop de; dec b; jr nz,loop; halt
    const gb = run([0x06, 10, 0x21, 0, 0, 0x11, 1, 0, 0xe5, 0x19, 0xd1, 0x05, 0x20, 0xfa, 0x76, 0x18, 0xfe]);
    expect(gb.cpu.hl).toBe(55);
  });

  test('DAA produces packed BCD', () => {
    // ld a,$19; add a,$28; daa; ld b,a; halt
    const gb = run([0x3e, 0x19, 0xc6, 0x28, 0x27, 0x47, 0x76, 0x18, 0xfe]);
    expect(gb.cpu.b).toBe(0x47);
  });

  test('timer interrupt fires and is serviced', () => {
    // ld sp,$fffe; ld a,$04; ldh (IE),a; ld a,$05; ldh (TAC),a; ei; loop: jr loop
    // handler at $50: ld c,$42; reti
    const code = [0x31, 0xfe, 0xff, 0x3e, 0x04, 0xe0, 0xff, 0x3e, 0x05, 0xe0, 0x07, 0xfb, 0x18, 0xfe];
    const rom = makeRom(code);
    rom.set([0x0e, 0x42, 0xd9], 0x50);
    const gb = new GameBoy(rom);
    gb.runFrame();
    expect(gb.cpu.c).toBe(0x42);
  });

  test('serial output is captured', () => {
    // ld a,'K'; ldh (SB),a; ld a,$81; ldh (SC),a; halt
    const gb = run([0x3e, 0x4b, 0xe0, 0x01, 0x3e, 0x81, 0xe0, 0x02, 0x76, 0x18, 0xfe]);
    expect(gb.serialText()).toBe('K');
  });
});

describe('memory & video', () => {
  test('CGB WRAM banking keeps banks separate', () => {
    // ld a,2; ldh (SVBK),a; ld a,$aa; ld ($d000),a; ld a,3; ldh (SVBK),a; ld a,($d000); ld b,a; halt
    const gb = run([0x3e, 2, 0xe0, 0x70, 0x3e, 0xaa, 0xea, 0x00, 0xd0, 0x3e, 3, 0xe0, 0x70, 0xfa, 0x00, 0xd0, 0x47, 0x76, 0x18, 0xfe]);
    expect(gb.cpu.b).toBe(0x00);
    expect(gb.wram[2 * 0x1000]).toBe(0xaa);
  });

  test('CGB palette RAM auto-increments and renders a solid colour', () => {
    // Set BG palette 0 colour 0 to pure red (0x001f), fill the screen with tile 0 (all zero pixels).
    // ld a,$80; ldh (BCPS),a; ld a,$1f; ldh (BCPD),a; xor a; ldh (BCPD),a; halt-loop
    const gb = run([0x3e, 0x80, 0xe0, 0x68, 0x3e, 0x1f, 0xe0, 0x69, 0xaf, 0xe0, 0x69, 0x18, 0xfe], 3);
    const fb = gb.framebuffer;
    expect([fb[0], fb[1], fb[2]]).toEqual([255, 0, 0]);
    expect(gb.ppu.bcps).toBe(0x82);
  });

  test('save states round-trip', () => {
    const gb = run([0x3e, 0x12, 0x06, 0x34, 0x18, 0xfe], 1);
    const st = gb.saveState();
    gb.cpu.a = 0;
    gb.loadState(st);
    expect(gb.cpu.a).toBe(0x12);
    expect(gb.cpu.b).toBe(0x34);
  });

  test('MBC5 battery RAM exports and imports', () => {
    // enable RAM, write $5a to $a000
    const gb = run([0x3e, 0x0a, 0xea, 0x00, 0x00, 0x3e, 0x5a, 0xea, 0x00, 0xa0, 0x18, 0xfe], 1, { type: 0x1b, ram: 0x03 });
    const save = gb.cart.exportSave();
    expect(save[0]).toBe(0x5a);
    const gb2 = new GameBoy(makeRom([0x18, 0xfe], { type: 0x1b, ram: 0x03 }));
    gb2.cart.importSave(save);
    expect(gb2.cart.ram[0]).toBe(0x5a);
  });
});

const ROMS = '.cache/roms';
describe.skipIf(!existsSync(`${ROMS}/cpu_instrs.gb`))('open test ROMs', () => {
  test('Blargg cpu_instrs passes', () => {
    const gb = new GameBoy(new Uint8Array(readFileSync(`${ROMS}/cpu_instrs.gb`)));
    for (let i = 0; i < 31 * 60 && !/Passed all tests|Failed/.test(gb.serialText()); i++) gb.runFrame();
    expect(gb.serialText()).toContain('Passed all tests');
  }, 60000);
});
