// Cartridge mode: play a dump of a Game Boy / Game Boy Color cartridge you own,
// emulated in the browser and presented through the same GPU pipeline.
import { drawWindow, LINE_H } from '../engine/text.js';
import { GameBoy, BUTTON_BITS } from '../emu/gb.js';
import { CartridgeAudio } from '../emu/audio-out.js';
import { storage } from '../emu/storage.js';
import { Toasts } from './ui.js';

const COLOR_MODES = [
  { name: 'GBC LCD', mode: 2 },
  { name: 'Raw', mode: 0 },
  { name: 'Soft', mode: 1 },
];
const PREFS_KEY = 'moonlit-cartridge-prefs';

function loadPrefs() {
  try {
    return { color: 0, slot: 1, volume: 0.8, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { color: 0, slot: 1, volume: 0.8 };
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export async function bootCartridge(game, bytes, name = 'cartridge') {
  const gb = new GameBoy(bytes); // validates the image
  const h = gb.cart.header;
  await storage.put('roms', h.id, { title: h.title, name, bytes, cgb: h.cgb, lastPlayed: Date.now() });
  const save = await storage.get('saves', h.id);
  if (save) gb.cart.importSave(save);
  game.setScene(new EmulatorScene(game, gb, name));
}

export class CartridgeScene {
  constructor(game) {
    this.game = game;
    this.items = [{ kind: 'load', label: 'Open a cartridge file' }, { kind: 'back', label: 'Back to title' }];
    this.cursor = 0;
    this.t = 0;
    this.toasts = new Toasts(game);
    this.busy = false;
    this.confirmDelete = null;
  }

  enter() {
    this.game.music(null);
    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.accept = '.gb,.gbc,.cgb,.sgb,.bin';
    this.input.style.display = 'none';
    this.input.addEventListener('change', () => {
      const f = this.input.files?.[0];
      if (f) this.loadFile(f);
      this.input.value = '';
    });
    document.body.appendChild(this.input);
    this.onDrop = (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) this.loadFile(f);
    };
    this.onDragOver = (e) => e.preventDefault();
    window.addEventListener('drop', this.onDrop);
    window.addEventListener('dragover', this.onDragOver);
    storage.all('roms').then((list) => {
      list.sort((a, b) => (b.value.lastPlayed ?? 0) - (a.value.lastPlayed ?? 0));
      const saved = list.map(({ key, value }) => ({ kind: 'rom', key, label: value.title, value }));
      this.items = [this.items[0], ...saved, this.items[this.items.length - 1]];
    });
  }

  exit() {
    this.input?.remove();
    window.removeEventListener('drop', this.onDrop);
    window.removeEventListener('dragover', this.onDragOver);
  }

  async loadFile(file) {
    if (this.busy) return;
    this.busy = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await bootCartridge(this.game, bytes, file.name);
    } catch (e) {
      console.warn(e);
      this.toasts.push(`Couldn't load that file: ${e.message}`);
      this.game.sfx('error');
      this.busy = false;
    }
  }

  update(input) {
    this.t++;
    this.toasts.update();
    if (this.busy) return;
    if (this.confirmDelete) {
      if (input.pressed('a')) {
        storage.del('roms', this.confirmDelete.key);
        storage.del('saves', this.confirmDelete.key);
        this.items = this.items.filter((i) => i !== this.confirmDelete);
        this.cursor = Math.min(this.cursor, this.items.length - 1);
        this.toasts.push('Removed from this device.');
        this.confirmDelete = null;
      } else if (input.pressed('b')) this.confirmDelete = null;
      return;
    }
    const n = this.items.length;
    if (input.repeat('up')) {
      this.cursor = (this.cursor + n - 1) % n;
      this.game.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.cursor = (this.cursor + 1) % n;
      this.game.sfx('cursor');
    }
    const it = this.items[this.cursor];
    if (input.pressed('select') && it.kind === 'rom') this.confirmDelete = it;
    if (input.pressed('b')) return this.back();
    if (!(input.pressed('a') || input.pressed('start'))) return;
    this.game.sfx('confirm');
    if (it.kind === 'load') this.input.click();
    else if (it.kind === 'back') this.back();
    else {
      this.busy = true;
      bootCartridge(this.game, it.value.bytes, it.value.name).catch((e) => {
        this.toasts.push(`Couldn't start: ${e.message}`);
        this.busy = false;
      });
    }
  }

  back() {
    import('./title.js').then((m) => this.game.setScene(new m.TitleScene(this.game)));
  }

  render(r) {
    const text = this.game.text;
    r.ambient = [1, 1, 1];
    r.useUI();
    r.rect(0, 0, 160, 144, 0.08, 0.1, 0.18, 1);
    drawWindow(r, 4, 4, 152, 66);
    text.draw('Game Cartridge', 12, 10, 'font_blue');
    const info = text.wrap('Play a dump of a Game Boy or Game Boy Color cartridge you own (.gb/.gbc), or drop the file on this page. It stays on this device.', 136);
    info.slice(0, 5).forEach((l, i) => text.draw(l, 12, 21 + i * 9, 'font_dim'));
    const vis = 5;
    const top = Math.max(0, Math.min(this.items.length - vis, this.cursor - 2));
    drawWindow(r, 4, 72, 152, vis * LINE_H + 12, 'ui_hud');
    this.items.slice(top, top + vis).forEach((it, k) => {
      const i = top + k;
      const y = 78 + k * LINE_H;
      if (i === this.cursor) r.spr('ui_cursor', 10, y);
      text.draw(it.label.slice(0, 24), 20, y, it.kind === 'rom' ? 'font_gold' : 'font_light');
    });
    if (this.items[this.cursor]?.kind === 'rom') text.draw('SELECT: remove', 12, 134, 'font_dim');
    if (this.busy) text.center('Loading...', 0, 160, 134, 'font_light');
    if (this.confirmDelete) {
      drawWindow(r, 16, 50, 128, 40);
      text.draw(`Remove ${this.confirmDelete.label.slice(0, 14)}?`, 24, 56);
      text.draw('Saves are deleted too.', 24, 66, 'font_dim');
      text.draw('A: yes   B: no', 24, 77, 'font_blue');
    }
    this.toasts.draw(r, 96);
  }
}

class EmuMenu {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.cursor = 0;
    this.done = false;
  }
  rows() {
    const sc = this.scene;
    const p = sc.prefs;
    return [
      { label: 'Resume', act: () => (this.done = true) },
      { label: `Save state ${p.slot}`, act: () => sc.saveState() },
      { label: `Load state ${p.slot}`, act: () => sc.loadState() },
      { label: 'Slot', value: String(p.slot), adj: (d) => (p.slot = ((p.slot - 1 + d + 3) % 3) + 1) },
      { label: 'Colours', value: COLOR_MODES[p.color].name, adj: (d) => (p.color = (p.color + d + COLOR_MODES.length) % COLOR_MODES.length) },
      { label: 'Volume', value: String(Math.round(p.volume * 10)), adj: (d) => (p.volume = Math.max(0, Math.min(1, Math.round((p.volume + d * 0.1) * 10) / 10))) },
      { label: 'Reset', act: () => sc.reset() },
      { label: 'Quit to title', act: () => sc.quit() },
    ];
  }
  update(input) {
    const rows = this.rows();
    if (input.pressed('b') || input.pressed('l') || input.pressed('start')) {
      this.done = true;
      return;
    }
    if (input.repeat('up')) this.cursor = (this.cursor + rows.length - 1) % rows.length;
    if (input.repeat('down')) this.cursor = (this.cursor + 1) % rows.length;
    const row = rows[this.cursor];
    let d = 0;
    if (input.repeat('left')) d = -1;
    if (input.repeat('right')) d = 1;
    if (d && row.adj) {
      row.adj(d);
      this.scene.applyPrefs();
      this.game.sfx('cursor');
    }
    if (input.pressed('a')) {
      if (row.act) {
        this.game.sfx('confirm');
        row.act();
      } else if (row.adj) {
        row.adj(1);
        this.scene.applyPrefs();
      }
    }
  }
  draw(r) {
    const text = this.game.text;
    const rows = this.rows();
    const h = rows.length * LINE_H + 22;
    const y0 = Math.floor((144 - h) / 2);
    drawWindow(r, 20, y0, 120, h);
    text.draw(this.scene.title.slice(0, 18), 28, y0 + 6, 'font_blue');
    rows.forEach((row, i) => {
      const y = y0 + 17 + i * LINE_H;
      if (i === this.cursor) r.spr('ui_cursor', 26, y);
      text.draw(row.label, 36, y);
      if (row.value) text.draw(row.value, 132 - text.measure(row.value), y, 'font_blue');
    });
  }
}

export class EmulatorScene {
  constructor(game, gb, name) {
    this.game = game;
    this.gb = gb;
    this.name = name;
    this.title = gb.cart.header.title;
    this.id = gb.cart.header.id;
    this.audio = new CartridgeAudio();
    this.prefs = loadPrefs();
    this.menu = null;
    this.toasts = new Toasts(game);
    this.dirtyFrames = 0;
    this.frames = 0;
  }

  enter() {
    this.game.music(null);
    this.game.ambient(null);
    this.savedColorMode = this.game.renderer.post.colorMode;
    this.applyPrefs();
    this.audio.start().then(() => {
      this.gb.apu.setSampleRate(this.audio.sampleRate);
      this.audio.setVolume(this.prefs.volume);
    });
    this.onHide = () => this.persist();
    window.addEventListener('pagehide', this.onHide);
    document.addEventListener('visibilitychange', this.onHide);
    const h = this.gb.cart.header;
    this.toasts.push(`${h.title} (${this.gb.cgb ? 'Color' : 'Classic'})`);
    this.toasts.push(this.game.input.lastDevice === 'touch' ? '◀ menu   ▶ hold: fast' : 'Q: menu   E (hold): fast-forward');
    this.lastUnlock = 0;
  }

  exit() {
    this.persist();
    this.audio.close();
    window.removeEventListener('pagehide', this.onHide);
    document.removeEventListener('visibilitychange', this.onHide);
    this.game.renderer.post.colorMode = this.savedColorMode;
  }

  applyPrefs() {
    this.game.renderer.post.colorMode = COLOR_MODES[this.prefs.color].mode;
    this.audio.setVolume(this.prefs.volume);
    savePrefs(this.prefs);
  }

  persist() {
    const data = this.gb.cart.exportSave();
    if (!data) return;
    storage.put('saves', this.id, data);
    this.gb.cart.dirty = false;
    this.dirtyFrames = 0;
  }

  async saveState() {
    const st = this.gb.saveState();
    await storage.put('states', `${this.id}:${this.prefs.slot}`, st);
    this.persist();
    this.toasts.push(`Saved state ${this.prefs.slot}.`);
    this.menu = null;
  }

  async loadState() {
    const st = await storage.get('states', `${this.id}:${this.prefs.slot}`);
    if (!st) {
      this.toasts.push(`Slot ${this.prefs.slot} is empty.`);
      return;
    }
    try {
      this.gb.loadState(st);
      this.toasts.push(`Loaded state ${this.prefs.slot}.`);
      this.menu = null;
    } catch (e) {
      this.toasts.push(e.message);
    }
  }

  reset() {
    this.persist();
    const save = this.gb.cart.exportSave();
    this.gb.reset();
    if (save) this.gb.cart.importSave(save);
    this.menu = null;
    this.toasts.push('Reset.');
  }

  quit() {
    this.persist();
    import('./title.js').then((m) => this.game.setScene(new m.TitleScene(this.game)));
  }

  update(input) {
    this.toasts.update();
    if (this.audio.ctx && this.audio.ctx.state !== 'running' && input.anyPressed) this.audio.start();
    if (this.menu) {
      this.menu.update(input);
      if (this.menu?.done) this.menu = null;
      return;
    }
    if (input.pressed('l')) {
      this.menu = new EmuMenu(this);
      this.gb.setButtons(0);
      return;
    }
    let mask = 0;
    for (const [k, bit] of Object.entries(BUTTON_BITS)) if (input.down(k)) mask |= bit;
    // opposite directions can't be pressed at once on a real D-pad
    if ((mask & 0x03) === 0x03) mask &= ~0x03;
    if ((mask & 0x0c) === 0x0c) mask &= ~0x0c;
    this.gb.setButtons(mask);
    const ff = input.down('r') ? 4 : 1;
    for (let i = 0; i < ff; i++) {
      this.gb.runFrame();
      const samples = this.gb.apu.take();
      if (ff === 1) this.audio.push(samples);
    }
    this.frames++;
    if (this.gb.cart.dirty) {
      // write battery RAM shortly after the game stops writing to it
      if (++this.dirtyFrames > 90) this.persist();
    }
  }

  render(r) {
    r.ambient = [1, 1, 1];
    r.presentFramebuffer(this.gb.framebuffer);
    r.useUI();
    if (this.menu) {
      r.rect(0, 0, 160, 144, 0, 0, 0, 0.45);
      this.menu.draw(r);
    }
    this.toasts.draw(r, 4);
  }

  debugInfo() {
    const c = this.gb.cpu;
    return { cart: this.gb.cart.header, pc: c.pc, frames: this.frames, cgb: this.gb.cgb };
  }
}
