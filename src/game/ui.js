// UI widgets. Each widget has update(input) and draw(r); `done` + `result` when finished.
import { drawWindow, stripTags, LINE_H } from '../engine/text.js';
import { clockText, season, weekday, festivalToday } from './state.js';
import { TOOL_PALETTES } from './data/items.js';

export class DialogBox {
  constructor(game, speaker, text, choices = null, opts = {}) {
    this.game = game;
    this.speaker = speaker;
    this.choices = choices;
    this.cursor = opts.defaultChoice ?? 0;
    const lines = game.text.wrap(text, 144);
    const per = speaker ? 3 : 4;
    this.pages = [];
    for (let i = 0; i < lines.length; i += per) this.pages.push(lines.slice(i, i + per));
    if (!this.pages.length) this.pages.push(['']);
    this.page = 0;
    this.shown = 0;
    this.done = false;
    this.result = null;
    this.t = 0;
    this.instant = opts.instant ?? false;
    this.cancelChoice = opts.cancelChoice ?? (choices ? choices.length - 1 : null);
  }

  pageLen() {
    return this.pages[this.page].reduce((n, l) => n + stripTags(l).length, 0);
  }

  update(input) {
    this.t++;
    const len = this.pageLen();
    if (this.shown < len) {
      const speed = input.down('a') || input.down('b') ? 3 : 1;
      const before = this.shown;
      this.shown = this.instant ? len : Math.min(len, this.shown + speed);
      if (Math.floor(this.shown / 3) !== Math.floor(before / 3)) this.game.sfx('text');
      if (this.t > 4 && (input.pressed('a') || input.pressed('b'))) this.shown = len;
      return;
    }
    const last = this.page === this.pages.length - 1;
    if (last && this.choices) {
      if (input.repeat('up')) {
        this.cursor = (this.cursor + this.choices.length - 1) % this.choices.length;
        this.game.sfx('cursor');
      }
      if (input.repeat('down')) {
        this.cursor = (this.cursor + 1) % this.choices.length;
        this.game.sfx('cursor');
      }
      if (input.pressed('a')) {
        this.game.sfx('confirm');
        this.result = this.cursor;
        this.done = true;
      } else if (input.pressed('b') && this.cancelChoice !== null) {
        this.game.sfx('cancel');
        this.result = this.cancelChoice;
        this.done = true;
      }
      return;
    }
    if (input.pressed('a') || input.pressed('b')) {
      if (last) {
        this.done = true;
      } else {
        this.page++;
        this.shown = 0;
      }
    }
  }

  draw(r) {
    const text = this.game.text;
    const y0 = 94;
    drawWindow(r, 0, y0, 160, 50);
    let ly = y0 + 6;
    if (this.speaker) {
      text.draw(this.speaker, 8, ly, 'font_blue');
      ly += LINE_H;
    }
    let left = this.shown;
    for (const line of this.pages[this.page]) {
      const n = stripTags(line).length;
      text.draw(line, 8, ly, 'font', 1, Math.max(0, left));
      left -= n;
      ly += LINE_H;
    }
    const complete = this.shown >= this.pageLen();
    if (complete && !(this.choices && this.page === this.pages.length - 1) && Math.floor(this.t / 20) % 2 === 0)
      r.spr('ui_next', 146, y0 + 40);
    if (complete && this.choices && this.page === this.pages.length - 1) {
      const w = Math.max(...this.choices.map((c) => text.measure(stripTags(c)))) + 26;
      const h = this.choices.length * LINE_H + 12;
      const x = 160 - w - 2;
      const y = y0 - h - 2;
      drawWindow(r, x, y, w, h);
      this.choices.forEach((c, i) => {
        text.draw(c, x + 16, y + 6 + i * LINE_H);
        if (i === this.cursor) r.spr('ui_cursor', x + 6, y + 6 + i * LINE_H);
      });
    }
  }
}

/** Short-lived notifications stacked at the top of the screen. */
export class Toasts {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  push(msg, icon = null) {
    this.list.push({ msg, icon, t: 0 });
    if (this.list.length > 3) this.list.shift();
  }
  update() {
    for (const t of this.list) t.t++;
    this.list = this.list.filter((t) => t.t < 150);
  }
  draw(r, yBase = 38) {
    const text = this.game.text;
    let y = yBase;
    for (const t of this.list) {
      const maxW = 148 - (t.icon ? 10 : 0);
      const lines = text.wrap(t.msg, maxW - 12).slice(0, 3);
      const w = Math.min(156, Math.max(...lines.map((l) => text.measure(stripTags(l)))) + (t.icon ? 26 : 16));
      const h = lines.length * LINE_H + 8;
      const x = Math.floor((160 - w) / 2);
      const a = Math.min(1, (150 - t.t) / 20, t.t / 6);
      drawWindow(r, x, y, w, h, 'ui_hud', a);
      let tx = x + 8;
      if (t.icon) {
        r.spr(t.icon, x + 5, y + 5, 0, -1, a);
        tx += 10;
      }
      lines.forEach((l, i) => text.draw(l, tx, y + 5 + i * LINE_H, 'font_light', a));
      y += h + 2;
    }
  }
}

const WEATHER_ICON = { sun: 'ic_sun', rain: 'ic_rain', storm: 'ic_storm', snow: 'ic_snow', blizzard: 'ic_snow', cloud: 'ic_cloud' };
const SEASON_ICON = { spring: 'ic_spring', summer: 'ic_summer', fall: 'ic_fall', winter: 'ic_winter' };
const SEASON_SHORT = { spring: 'Spr', summer: 'Sum', fall: 'Fall', winter: 'Win' };

export function weatherIcon(w) {
  return WEATHER_ICON[w] ?? 'ic_sun';
}

export function drawHUD(game, r, state, alpha = 1) {
  const text = game.text;
  const s = season(state);
  // date / time panel
  drawWindow(r, 2, 2, 70, 34, 'ui_hud', alpha);
  r.spr(SEASON_ICON[s], 7, 7, 0, -1, alpha);
  const fest = festivalToday(state);
  text.draw(`${SEASON_SHORT[s]} ${state.time.day} ${weekday(state)}`, 17, 6, fest ? 'font_gold' : 'font_light', alpha);
  r.spr(weatherIcon(state.weather), 7, 17, 0, -1, alpha);
  text.draw(clockText(state.time.min), 17, 16, 'font_light', alpha);
  r.spr('ic_coin', 7, 26, 0, -1, alpha);
  text.draw(`${state.gold.toLocaleString('en-US')}G`, 17, 26, 'font_gold', alpha);

  // stamina face + equipped item
  const st = state.stamina / state.maxStamina;
  const face = st > 0.6 ? 0 : st > 0.3 ? 1 : st > 0.1 ? 2 : 3;
  drawWindow(r, 112, 2, 22, 22, 'ui_hud', alpha);
  r.spr(`face_${face}`, 115, 5, 0, -1, alpha);
  drawWindow(r, 136, 2, 22, 22, 'ui_hud', alpha);
  const eq = state.equipped;
  if (eq) {
    if (eq.startsWith('seeds:')) {
      const c = eq.slice(6);
      r.spr(`item_seeds_${c}`, 139, 5, 0, -1, alpha);
      text.draw(String(state.seeds[c] ?? 0), 151, 15, 'font_light', alpha);
    } else {
      r.spr(`tool_${eq}`, 139, 5, 0, TOOL_PALETTES[state.tools[eq] ?? 0], alpha);
      if (eq === 'can') {
        const cap = [30, 50, 80][state.tools.can ?? 0];
        const fill = Math.round((state.water / cap) * 14);
        r.rect(139, 20, 14, 1, 0.1, 0.1, 0.2, alpha);
        if (fill) r.rect(139, 20, fill, 1, 0.3, 0.6, 1, alpha);
      }
    }
  }
}

const GRID = [
  'ABCDEFGHIJ',
  'KLMNOPQRST',
  'UVWXYZ-.\'!',
  'abcdefghij',
  'klmnopqrst',
  'uvwxyz0123',
];

/** Name entry with an on-screen letter grid (keyboard typing also works). */
export class NameEntry {
  constructor(game, prompt, initial = '', max = 8) {
    this.game = game;
    this.prompt = prompt;
    this.name = initial;
    this.max = max;
    this.cx = 0;
    this.cy = 0;
    this.done = false;
    this.result = null;
    this.t = 0;
  }

  rows() {
    return GRID.length + 1; // last row: space / DEL / END
  }

  update(input) {
    this.t++;
    for (const ch of input.typed) {
      if (ch === '\b') this.name = this.name.slice(0, -1);
      else if (ch === '\n') {
        if (this.name.trim()) this.finish();
      } else if (/^[A-Za-z0-9 .'!-]$/.test(ch) && this.name.length < this.max) this.name += ch;
    }
    if (input.typed.length) {
      input.consume();
      return;
    }
    const move = (dx, dy) => {
      this.cy = (this.cy + dy + this.rows()) % this.rows();
      const w = this.cy === GRID.length ? 3 : 10;
      this.cx = dx ? (this.cx + dx + w) % w : Math.min(this.cx, w - 1);
      this.game.sfx('cursor');
    };
    if (input.repeat('up')) move(0, -1);
    if (input.repeat('down')) move(0, 1);
    if (input.repeat('left')) move(-1, 0);
    if (input.repeat('right')) move(1, 0);
    if (input.pressed('b')) {
      this.name = this.name.slice(0, -1);
      this.game.sfx('cancel');
    }
    if (input.pressed('start')) {
      if (this.name.trim()) this.finish();
    }
    if (input.pressed('a')) {
      if (this.cy < GRID.length) {
        if (this.name.length < this.max) this.name += GRID[this.cy][this.cx];
        this.game.sfx('confirm');
      } else if (this.cx === 0) {
        if (this.name.length < this.max) this.name += ' ';
      } else if (this.cx === 1) this.name = this.name.slice(0, -1);
      else if (this.name.trim()) this.finish();
      else this.game.sfx('error');
    }
  }

  finish() {
    this.result = this.name.trim().slice(0, this.max);
    this.done = true;
    this.game.sfx('confirm');
  }

  draw(r) {
    const text = this.game.text;
    drawWindow(r, 0, 0, 160, 144);
    text.center(this.prompt, 0, 160, 8, 'font');
    const nx = 44;
    for (let i = 0; i < this.max; i++) {
      const ch = this.name[i];
      if (ch) text.draw(ch, nx + i * 9, 24);
      r.rect(nx + i * 9, 34, 7, 1, 0.3, 0.25, 0.2, 1);
    }
    if (this.name.length < this.max && Math.floor(this.t / 16) % 2 === 0)
      r.rect(nx + this.name.length * 9, 24, 1, 9, 0.2, 0.2, 0.4, 1);
    GRID.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const px = 18 + x * 13, py = 44 + y * 12;
        text.draw(ch, px, py, this.cy === y && this.cx === x ? 'font_red' : 'font');
      });
    });
    const opts = ['Space', 'Del', 'End'];
    opts.forEach((o, i) => {
      const px = 18 + i * 44, py = 120;
      text.draw(o, px + 8, py, this.cy === GRID.length && this.cx === i ? 'font_red' : 'font_blue');
    });
    if (this.cy === GRID.length) r.spr('ui_cursor', 18 + this.cx * 44, 120);
    else r.spr('ui_cursor', 10 + this.cx * 13, 44 + this.cy * 12);
  }
}

/** Generic vertical menu in a window. */
export class ListMenu {
  constructor(game, items, opts = {}) {
    this.game = game;
    this.items = items;
    this.cursor = 0;
    this.x = opts.x ?? 40;
    this.y = opts.y ?? 40;
    this.w = opts.w ?? Math.max(...items.map((i) => game.text.measure(stripTags(i)))) + 28;
    this.done = false;
    this.result = null;
    this.cancel = opts.cancel ?? -1;
  }
  update(input) {
    const n = this.items.length;
    if (input.repeat('up')) {
      this.cursor = (this.cursor + n - 1) % n;
      this.game.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.cursor = (this.cursor + 1) % n;
      this.game.sfx('cursor');
    }
    if (input.pressed('a')) {
      this.result = this.cursor;
      this.done = true;
      this.game.sfx('confirm');
    } else if (input.pressed('b') && this.cancel !== null) {
      this.result = this.cancel;
      this.done = true;
      this.game.sfx('cancel');
    }
  }
  draw(r) {
    const h = this.items.length * LINE_H + 12;
    drawWindow(r, this.x, this.y, this.w, h);
    this.items.forEach((it, i) => {
      this.game.text.draw(it, this.x + 16, this.y + 6 + i * LINE_H);
      if (i === this.cursor) r.spr('ui_cursor', this.x + 6, this.y + 6 + i * LINE_H);
    });
  }
}
