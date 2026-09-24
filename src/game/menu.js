// Pause menu (items, tools, farm, friends, journal, options) and trade screens.
import { drawWindow, stripTags, LINE_H } from '../engine/text.js';
import { ITEMS, TOOLS, CROPS, TOOL_PALETTES, toolName, CAN_CAPACITY, SEASON_NAMES } from './data/items.js';
import { NPCS, NPC_IDS } from './data/npcs.js';
import { GOALS } from './data/goals.js';
import { hearts, itemName, season, weekday, equipList, clockText } from './state.js';
import { weatherIcon } from './ui.js';

const TABS = ['Items', 'Tools', 'Farm', 'Friends', 'Journal', 'Options'];

function itemIcon(r, id, x, y, alpha = 1) {
  r.spr(`item_${id}`, x, y, 0, -1, alpha);
}

function equipIcon(r, state, eq, x, y) {
  if (eq.startsWith('seeds:')) r.spr(`item_seeds_${eq.slice(6)}`, x, y);
  else r.spr(`tool_${eq}`, x, y, 0, TOOL_PALETTES[state.tools[eq] ?? 0]);
}

function equipName(state, eq) {
  if (eq.startsWith('seeds:')) {
    const c = eq.slice(6);
    return `${CROPS[c].name} Seeds x${state.seeds[c]}`;
  }
  return toolName(eq, state.tools[eq] ?? 0);
}

export class PauseMenu {
  constructor(play) {
    this.play = play;
    this.game = play.game;
    this.state = play.state;
    this.tab = 0;
    this.cursor = 0;
    this.sub = null; // item action submenu
    this.done = false;
    this.t = 0;
    this.game.sfx('menu_open');
  }

  close() {
    this.done = true;
    this.game.sfx('menu_close');
  }

  update(input) {
    this.t++;
    if (this.sub) return this.updateSub(input);
    if (input.pressed('start') || (input.pressed('b') && TABS[this.tab] !== 'Options')) return this.close();
    if (input.pressed('select') || input.pressed('r')) this.switchTab(1);
    if (input.pressed('l')) this.switchTab(-1);
    const fn = this[`update${TABS[this.tab]}`];
    fn?.call(this, input);
  }

  switchTab(d) {
    this.tab = (this.tab + d + TABS.length) % TABS.length;
    this.cursor = 0;
    this.game.sfx('cursor');
  }

  moveCursor(input, n, cols = 1) {
    if (!n) return;
    const old = this.cursor;
    if (input.repeat('right')) this.cursor = cols > 1 ? Math.min(n - 1, this.cursor + 1) : this.cursor;
    if (input.repeat('left')) this.cursor = cols > 1 ? Math.max(0, this.cursor - 1) : this.cursor;
    if (input.repeat('down')) this.cursor = Math.min(n - 1, this.cursor + cols);
    if (input.repeat('up')) this.cursor = Math.max(0, this.cursor - cols);
    if (old !== this.cursor) this.game.sfx('cursor');
  }

  // --- Items -----------------------------------------------------------------
  updateItems(input) {
    this.moveCursor(input, 8, 4);
    if (input.pressed('a')) {
      const slot = this.state.rucksack[this.cursor];
      if (!slot) return this.game.sfx('error');
      const def = ITEMS[slot.id];
      const opts = [];
      if (!this.state.carrying) opts.push('Hold');
      if (def?.stamina) opts.push('Eat');
      opts.push('Toss', 'Cancel');
      this.sub = { kind: 'item', opts, cursor: 0, slot: this.cursor };
      this.game.sfx('confirm');
    }
  }

  updateSub(input) {
    const s = this.sub;
    if (s.kind === 'confirmQuit') {
      if (input.repeat('up') || input.repeat('down')) {
        s.cursor ^= 1;
        this.game.sfx('cursor');
      }
      if (input.pressed('b')) this.sub = null;
      if (input.pressed('a')) {
        if (s.cursor === 0) this.play.quitToTitle();
        this.sub = null;
      }
      return;
    }
    if (input.repeat('up')) s.cursor = (s.cursor + s.opts.length - 1) % s.opts.length;
    if (input.repeat('down')) s.cursor = (s.cursor + 1) % s.opts.length;
    if (input.pressed('b')) {
      this.sub = null;
      return this.game.sfx('cancel');
    }
    if (!input.pressed('a')) return;
    const choice = s.opts[s.cursor];
    const slot = this.state.rucksack[s.slot];
    this.sub = null;
    if (!slot) return;
    if (choice === 'Hold') {
      this.play.holdFromRucksack(s.slot);
      this.close();
    } else if (choice === 'Eat') {
      this.play.eatFromRucksack(s.slot);
    } else if (choice === 'Toss') {
      slot.n--;
      if (slot.n <= 0) this.state.rucksack[s.slot] = null;
      this.game.sfx('cancel');
    }
  }

  // --- Tools -----------------------------------------------------------------
  updateTools(input) {
    const list = equipList(this.state);
    this.moveCursor(input, list.length, 6);
    if (input.pressed('a') && list[this.cursor]) {
      this.state.equipped = list[this.cursor];
      this.game.sfx('confirm');
      this.close();
    }
  }

  // --- Options ---------------------------------------------------------------
  optionRows() {
    const st = this.game.settings;
    const pct = (v) => `${Math.round(v * 10)}`;
    return [
      { label: 'Music', value: pct(st.music), adj: (d) => (st.music = clamp01(st.music + d * 0.1)) },
      { label: 'Sound FX', value: pct(st.sfx), adj: (d) => (st.sfx = clamp01(st.sfx + d * 0.1)) },
      { label: 'LCD grid', value: ['Off', 'Soft', 'Medium', 'Strong'][Math.round(st.lcd * 3 / 0.9) > 3 ? 3 : Math.round(st.lcd / 0.3)], adj: (d) => (st.lcd = Math.max(0, Math.min(0.9, Math.round((st.lcd + d * 0.3) * 10) / 10))) },
      { label: 'Colours', value: st.colorMode ? 'Handheld' : 'Vivid', adj: () => (st.colorMode = st.colorMode ? 0 : 1) },
      { label: 'HUD', value: st.hud ? 'On' : 'Off', adj: () => (st.hud = !st.hud) },
      { label: 'Quit to title', value: '', act: () => (this.sub = { kind: 'confirmQuit', cursor: 1 }) },
    ];
  }

  updateOptions(input) {
    const rows = this.optionRows();
    this.moveCursor(input, rows.length);
    const row = rows[this.cursor];
    if (input.pressed('b')) return this.close();
    let d = 0;
    if (input.repeat('left')) d = -1;
    if (input.repeat('right') || (input.pressed('a') && !row.act)) d = 1;
    if (d && row.adj) {
      row.adj(d);
      this.game.applySettings();
      this.game.sfx('cursor');
    }
    if (input.pressed('a') && row.act) row.act();
  }

  // --- drawing -----------------------------------------------------------------
  draw(r) {
    const text = this.game.text;
    drawWindow(r, 0, 0, 160, 144);
    // tabs
    let x = 8;
    TABS.forEach((t, i) => {
      const label = t.slice(0, i === this.tab ? 12 : 3);
      const w = text.measure(label);
      text.draw(label, x, 6, i === this.tab ? 'font_red' : 'font_dim');
      x += w + 5;
    });
    r.rect(6, 17, 148, 1, 0.45, 0.33, 0.2, 1);
    this[`draw${TABS[this.tab]}`]?.call(this, r, text);
    text.draw('SELECT →', 118, 133, 'font_dim');
    if (this.sub) this.drawSub(r, text);
  }

  drawItems(r, text) {
    const s = this.state;
    for (let i = 0; i < 8; i++) {
      const cx = 12 + (i % 4) * 22, cy = 22 + Math.floor(i / 4) * 22;
      r.spr(i === this.cursor ? 'ui_slot_sel' : 'ui_slot', cx, cy);
      const slot = s.rucksack[i];
      if (slot) {
        itemIcon(r, slot.id, cx + 1, cy + 1);
        if (slot.n > 1) text.draw(String(slot.n), cx + 13, cy + 10, 'font_blue');
      }
    }
    text.draw('Hands', 108, 22, 'font_dim');
    r.spr('ui_slot', 112, 32);
    if (s.carrying) itemIcon(r, s.carrying, 113, 33);
    const slot = s.rucksack[this.cursor];
    drawWindow(r, 6, 70, 148, 40, 'ui_hud');
    if (slot) {
      const d = ITEMS[slot.id];
      text.draw(itemName(slot.id), 12, 76, 'font_light');
      const bits = [];
      if (d?.price) bits.push(`Sells ${d.price}G`);
      if (d?.stamina) bits.push(`+${d.stamina} stamina`);
      text.draw(bits.join('  ') || '—', 12, 88, 'font_gold');
      text.draw('A: options', 12, 98, 'font_dim');
    } else text.draw('Empty slot', 12, 76, 'font_dim');
    r.spr('ic_lumber', 8, 116);
    text.draw(`${s.lumber}`, 18, 116);
    r.spr('ic_bag', 44, 116);
    text.draw(`Feed ${s.feed}`, 54, 116);
    text.draw(`Fodder ${s.fodder}`, 96, 116);
  }

  drawTools(r, text) {
    const list = equipList(this.state);
    list.forEach((eq, i) => {
      const cx = 8 + (i % 6) * 24, cy = 22 + Math.floor(i / 6) * 22;
      r.spr(i === this.cursor ? 'ui_slot_sel' : 'ui_slot', cx, cy);
      equipIcon(r, this.state, eq, cx + 1, cy + 1);
      if (eq === this.state.equipped) r.spr('ic_check', cx + 12, cy - 2);
    });
    const eq = list[this.cursor];
    drawWindow(r, 6, 88, 148, 40, 'ui_hud');
    if (eq) {
      text.draw(equipName(this.state, eq), 12, 94, 'font_light');
      const desc = eq.startsWith('seeds:') ? `Sows 3x3. ${cap(CROPS[eq.slice(6)].season)} crop.` : TOOLS[eq].desc;
      text.draw(desc, 12, 105, 'font_gold');
      if (eq === 'can') text.draw(`Water ${this.state.water}/${CAN_CAPACITY[this.state.tools.can]}`, 12, 115, 'font_dim');
    }
    if (this.state.pendingUpgrade && !this.state.pendingUpgrade.done)
      text.draw(`At the forge: ${TOOLS[this.state.pendingUpgrade.tool].name}`, 8, 76, 'font_dim');
  }

  drawFarm(r, text) {
    const s = this.state;
    text.draw(`${s.player.name}'s farm`, 8, 22, 'font_blue');
    text.draw(`Year ${s.time.year}, ${SEASON_NAMES[season(s)]} ${s.time.day} (${weekday(s)})`, 8, 32);
    r.spr(weatherIcon(s.weather), 8, 43);
    text.draw(`Now ${clockText(s.time.min)}`, 19, 42);
    r.spr(weatherIcon(s.tomorrow), 92, 43);
    text.draw('Tomorrow', 103, 42, 'font_dim');
    text.draw(`Gold ${s.gold.toLocaleString('en-US')}G`, 8, 54, 'font_gold');
    text.draw(`Shipped ${s.stats.earned.toLocaleString('en-US')}G`, 84, 54, 'font_dim');
    text.draw('Stamina', 8, 66);
    r.rect(50, 67, 80, 6, 0.2, 0.15, 0.1, 1);
    r.rect(51, 68, Math.round(78 * (s.stamina / s.maxStamina)), 4, 0.35, 0.75, 0.3, 1);
    text.draw(`${Math.ceil(s.stamina)}`, 134, 66, 'font_dim');
    text.draw('Animals', 8, 80, 'font_blue');
    if (!s.animals.length) text.draw('None yet. Visit the ranch!', 8, 91, 'font_dim');
    s.animals.slice(0, 4).forEach((a, i) => {
      const y = 91 + i * 10;
      text.draw(`${a.name}`, 8, y);
      text.draw(a.kind === 'cow' ? 'Cow' : 'Hen', 60, y, 'font_dim');
      for (let h = 0; h < 5; h++) r.spr(h < Math.round(a.happy / 2) ? 'ic_heart' : 'ic_heart_empty', 86 + h * 9, y);
    });
    if (s.animals.length > 4) text.draw(`+${s.animals.length - 4} more`, 8, 123, 'font_dim');
  }

  drawFriends(r, text) {
    NPC_IDS.forEach((id, i) => {
      const n = this.state.npcs[id];
      const y = 22 + i * 13;
      if (!n.met) {
        text.draw('???', 8, y, 'font_dim');
        return;
      }
      text.draw(NPCS[id].name, 8, y);
      const h = hearts(n.friend);
      for (let k = 0; k < 10; k++) r.spr(k < h ? 'ic_heart' : 'ic_heart_empty', 50 + k * 9, y);
    });
  }

  updateJournal(input) {
    this.moveCursor(input, GOALS.length);
  }

  drawJournal(r, text) {
    const s = this.state;
    const done = s.goals.length;
    text.draw('Farm Journal', 8, 20, 'font_blue');
    text.draw(`${done}/${GOALS.length}`, 152 - text.measure(`${done}/${GOALS.length}`), 20, 'font_blue');
    const vis = 8;
    const top = Math.max(0, Math.min(GOALS.length - vis, this.cursor - 3));
    GOALS.slice(top, top + vis).forEach((g, k) => {
      const i = top + k;
      const y = 32 + k * 10;
      const ok = s.goals.includes(g.id);
      if (i === this.cursor) r.spr('ui_cursor', 4, y);
      r.spr(ok ? 'ic_check' : 'ic_box', 13, y);
      text.draw(g.text, 23, y, ok ? 'font_dim' : 'font');
    });
    if (top > 0) r.spr('ui_arrow_up', 146, 30);
    if (top + vis < GOALS.length) r.spr('ui_arrow_down', 146, 104);
    const g = GOALS[this.cursor];
    const ok = s.goals.includes(g.id);
    let line = ok ? 'Completed!' : 'Not yet done.';
    if (!ok && g.progress) {
      const [a, b] = g.progress(s);
      line = `Progress: ${Math.min(a, b).toLocaleString('en-US')} / ${b.toLocaleString('en-US')}`;
    }
    text.draw(line, 8, 116, ok ? 'font_blue' : 'font_dim');
  }

  drawOptions(r, text) {
    this.optionRows().forEach((row, i) => {
      const y = 24 + i * 12;
      if (i === this.cursor) r.spr('ui_cursor', 8, y);
      text.draw(row.label, 18, y);
      if (row.value) {
        text.draw(row.value, 96, y, 'font_blue');
        if (i === this.cursor) {
          r.spr('ui_arrow_left', 86, y);
          r.spr('ui_arrow_right', 98 + text.measure(row.value), y);
        }
      }
    });
    text.draw(`Renderer: ${this.game.renderer.name}`, 8, 104, 'font_dim');
    text.draw('Game saves when you sleep', 8, 114, 'font_dim');
    text.draw('or write in your diary.', 8, 123, 'font_dim');
  }

  drawSub(r, text) {
    const s = this.sub;
    if (s.kind === 'confirmQuit') {
      drawWindow(r, 30, 50, 100, 44);
      text.draw('Quit to title?', 40, 56);
      text.draw('Unsaved progress', 40, 66, 'font_dim');
      ['Yes', 'No'].forEach((o, i) => {
        text.draw(o, 60 + i * 30, 78);
        if (i === s.cursor) r.spr('ui_cursor', 50 + i * 30, 78);
      });
      return;
    }
    const w = 60;
    const h = s.opts.length * LINE_H + 12;
    const x = 96, y = 30;
    drawWindow(r, x, y, w, h);
    s.opts.forEach((o, i) => {
      text.draw(o, x + 16, y + 6 + i * LINE_H);
      if (i === s.cursor) r.spr('ui_cursor', x + 6, y + 6 + i * LINE_H);
    });
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Math.round(v * 10) / 10));
}
function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * List of entries with prices (shops) or values (shipping). onPick(entry, qty) is
 * called to perform the transaction and returns a message (string) or false.
 */
export class TradeUI {
  constructor(game, { title, entries, onPick, gold, mode = 'buy', maxQty }) {
    this.game = game;
    this.title = title;
    this.entries = entries;
    this.onPick = onPick;
    this.gold = gold;
    this.mode = mode;
    this.maxQty = maxQty ?? ((e) => (e.kind === 'feed' || e.kind === 'fodder' ? 99 : e.stack ? 9 : 1));
    this.cursor = 0;
    this.scroll = 0;
    this.qty = null;
    this.msg = null;
    this.msgT = 0;
    this.done = false;
    this.game.sfx('menu_open');
  }

  update(input) {
    if (this.msgT > 0) this.msgT--;
    const e = this.entries[this.cursor];
    if (this.qty !== null) {
      const max = Math.max(1, this.maxQty(e));
      if (input.repeat('right') || input.repeat('up')) this.qty = Math.min(max, this.qty + 1);
      if (input.repeat('left') || input.repeat('down')) this.qty = Math.max(1, this.qty - 1);
      if (input.pressed('b')) {
        this.qty = null;
        this.game.sfx('cancel');
      }
      if (input.pressed('a')) {
        const res = this.onPick(e, this.qty);
        this.qty = null;
        if (res) {
          this.msg = res;
          this.msgT = 150;
        }
        if (this.mode === 'sell') this.entries = this.entries.filter((x) => x.available() > 0);
        if (this.cursor >= this.entries.length) this.cursor = Math.max(0, this.entries.length - 1);
        if (!this.entries.length) this.done = true;
      }
      return;
    }
    if (input.pressed('b') || input.pressed('start')) {
      this.done = true;
      this.game.sfx('menu_close');
      return;
    }
    const n = this.entries.length;
    if (input.repeat('down') && n) {
      this.cursor = (this.cursor + 1) % n;
      this.game.sfx('cursor');
    }
    if (input.repeat('up') && n) {
      this.cursor = (this.cursor + n - 1) % n;
      this.game.sfx('cursor');
    }
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + 5) this.scroll = this.cursor - 4;
    if (input.pressed('a') && e) {
      if (e.disabled) {
        this.game.sfx('error');
        this.msg = e.disabled;
        this.msgT = 120;
        return;
      }
      this.qty = 1;
      this.game.sfx('confirm');
    }
  }

  draw(r) {
    const text = this.game.text;
    drawWindow(r, 0, 0, 160, 144);
    text.draw(this.title, 8, 6, 'font_blue');
    r.spr('ic_coin', 104, 7);
    text.draw(`${this.gold().toLocaleString('en-US')}G`, 114, 6, 'font_gold');
    r.rect(6, 17, 148, 1, 0.45, 0.33, 0.2, 1);
    const vis = this.entries.slice(this.scroll, this.scroll + 5);
    vis.forEach((e, k) => {
      const i = this.scroll + k;
      const y = 21 + k * 18;
      if (i === this.cursor) r.spr('ui_cursor', 6, y + 5);
      const [sw, sh] = this.game.renderer.size(e.sprite);
      if (sw <= 16 && sh <= 16) r.spr(e.sprite, 16, y + (16 - sh), 0, e.pal ?? -1);
      else r.sprPart(e.sprite, 0, 0, Math.min(sw, 16), Math.min(sh, 16), 16, y, 16, 16);
      text.draw(e.name, 36, y + 1, e.disabled ? 'font_dim' : 'font');
      const price = this.mode === 'buy' ? `${e.price}G` : `x${e.available()}`;
      text.draw(price, 36, y + 9, this.mode === 'buy' ? 'font_gold' : 'font_dim');
      if (e.lumber) {
        r.spr('ic_lumber', 80, y + 9);
        text.draw(String(e.lumber), 90, y + 9, 'font_dim');
      }
      if (this.mode === 'sell') text.draw(`${e.price}G ea`, 104, y + 9, 'font_gold');
    });
    if (this.scroll > 0) r.spr('ui_arrow_up', 146, 20);
    if (this.scroll + 5 < this.entries.length) r.spr('ui_arrow_down', 146, 104);
    drawWindow(r, 0, 110, 160, 34, 'ui_hud');
    const e = this.entries[this.cursor];
    if (this.qty !== null && e) {
      const total = (this.mode === 'buy' ? e.price : e.price) * this.qty;
      text.draw(this.mode === 'buy' ? 'How many?' : 'Ship how many?', 8, 116, 'font_light');
      r.spr('ui_arrow_left', 70, 116);
      text.draw(String(this.qty), 80, 116, 'font_light');
      r.spr('ui_arrow_right', 92, 116);
      text.draw(`= ${total.toLocaleString('en-US')}G`, 104, 116, 'font_gold');
      text.draw('A: OK   B: Back', 8, 127, 'font_dim');
    } else if (this.msgT > 0 && this.msg) {
      const lines = text.wrap(this.msg, 144);
      lines.slice(0, 2).forEach((l, i) => text.draw(l, 8, 116 + i * 10, 'font_light'));
    } else if (e) {
      const lines = text.wrap(e.desc ?? '', 144);
      lines.slice(0, 2).forEach((l, i) => text.draw(l, 8, 116 + i * 10, 'font_light'));
    } else text.draw('Nothing here.', 8, 116, 'font_light');
  }
}
