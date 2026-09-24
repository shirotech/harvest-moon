// Title screen and new-game setup.
import { drawWindow, LINE_H } from '../engine/text.js';
import { World } from './world.js';
import { newGame, hasSave, loadGame } from './state.js';
import { PlayScene } from './play.js';
import { NameEntry, DialogBox } from './ui.js';

function applyDebugParams(state) {
  const q = new URLSearchParams(location.search);
  if (q.has('season')) state.time.season = ['spring', 'summer', 'fall', 'winter'].indexOf(q.get('season'));
  if (q.has('day')) state.time.day = Number(q.get('day'));
  if (q.has('time')) state.time.min = Math.round(Number(q.get('time')) * 60);
  if (q.has('weather')) state.weather = q.get('weather');
  if (q.has('gold')) state.gold = Number(q.get('gold'));
  if (q.has('map')) {
    state.player.map = q.get('map');
    state.player.x = Number(q.get('x') ?? 4);
    state.player.y = Number(q.get('y') ?? 6);
  }
  if (q.has('girl')) state.player.gender = 'girl';
  return state;
}

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.demo = newGame({ seed: 1234 });
    this.demo.time.min = 18 * 60 + 40;
    this.demo.time.season = 1;
    this.world = new World(game, this.demo, 'farm');
    this.cam = { x: 0, y: 40 };
    this.hasSave = hasSave();
    this.items = this.hasSave ? ['Continue', 'New Game'] : ['New Game'];
    this.cursor = 0;
    this.stage = 'press';
    this.fade = 1;
  }

  enter() {
    const q = new URLSearchParams(location.search);
    if (q.has('autostart')) {
      const s = applyDebugParams(newGame({ name: q.get('name') ?? 'Robin', gender: q.get('girl') ? 'girl' : 'boy', seed: 77 }));
      this.game.setScene(new PlayScene(this.game, s, { skipIntro: q.has('skipintro') }));
      return;
    }
    this.game.renderer.applySeason('summer');
    this.game.music('title');
  }

  update(input) {
    this.t++;
    if (this.fade > 0 && this.stage !== 'leaving') this.fade = Math.max(0, this.fade - 0.03);
    this.cam.x = Math.round(((Math.sin(this.t / 900) + 1) / 2) * (this.world.pw - 160));
    if (this.stage === 'press') {
      if (input.anyPressed && this.t > 20) {
        this.stage = 'menu';
        this.game.sfx('confirm');
        this.game.music('title');
      }
      return;
    }
    if (this.stage === 'leaving') {
      this.fade = Math.min(1, this.fade + 0.05);
      if (this.fade >= 1) this.next();
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
    if (input.pressed('a') || input.pressed('start')) {
      this.game.sfx('confirm');
      this.choice = this.items[this.cursor];
      this.stage = 'leaving';
    }
  }

  next() {
    if (this.choice === 'Continue') {
      const s = loadGame();
      if (s) {
        this.game.setScene(new PlayScene(this.game, s, { continued: true }));
        return;
      }
    }
    this.game.setScene(new NewGameScene(this.game));
  }

  render(r) {
    const w = this.world;
    r.ambient = [0.78, 0.6, 0.72];
    r.useWorld();
    w.drawGround(r, this.cam);
    const list = [];
    w.collectSorted(list, this.cam);
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw(r);
    for (const L of w.lights) r.light(L.x - this.cam.x, L.y - this.cam.y, L.r, L.c[0], L.c[1], L.c[2], 0.9);
    // fireflies
    for (let k = 0; k < 12; k++) {
      const x = (k * 53 + Math.sin((this.t + k * 40) / 60) * 20 + 800) % 160;
      const y = 60 + ((k * 37) % 80) + Math.cos((this.t + k * 30) / 50) * 6;
      const g = 0.5 + 0.5 * Math.sin((this.t + k * 20) / 16);
      r.rect(x, y, 1, 1, 0.9, 1, 0.5, g);
      r.light(x, y, 8, 0.6, 0.8, 0.3, g);
    }
    r.useUI();
    // dusk sky band behind the logo
    for (let i = 0; i < 12; i++) r.rect(0, i * 4, 160, 4, 0.1 + i * 0.012, 0.1 + i * 0.01, 0.25 + i * 0.012, 0.9 - i * 0.06);
    const bob = Math.round(Math.sin(this.t / 40) * 2);
    r.spr('ui_logo', 8, 6 + bob);
    const text = this.game.text;
    if (this.stage === 'press') {
      if (Math.floor(this.t / 30) % 2 === 0) text.center('Press START', 0, 160, 104, 'font_light');
    } else {
      const h = this.items.length * LINE_H + 12;
      const wdt = 80;
      const x = 40, y = 96;
      drawWindow(r, x, y, wdt, h);
      this.items.forEach((it, i) => {
        text.draw(it, x + 18, y + 6 + i * LINE_H);
        if (i === this.cursor) r.spr('ui_cursor', x + 8, y + 6 + i * LINE_H);
      });
    }
    text.draw(this.game.renderer.name, 158 - text.measure(this.game.renderer.name), 134, 'font_dim');
    text.draw('v0.1', 2, 134, 'font_dim');
    if (this.fade > 0) r.rect(0, 0, 160, 144, 0, 0, 0, this.fade);
  }
}

export class NewGameScene {
  constructor(game) {
    this.game = game;
    this.stage = 'gender';
    this.gender = 0;
    this.t = 0;
    this.widget = null;
    this.fade = 1;
  }

  enter() {
    this.game.music('title');
  }

  update(input) {
    this.t++;
    if (this.fade > 0 && this.stage !== 'go') this.fade = Math.max(0, this.fade - 0.05);
    if (this.widget) {
      this.widget.update(input);
      if (this.widget.done) {
        const res = this.widget.result;
        const kind = this.widgetKind;
        this.widget = null;
        input.consume();
        if (kind === 'name') {
          this.name = res;
          this.widgetKind = 'confirm';
          this.widget = new DialogBox(this.game, null, `So your name is ${res}? Welcome to Willowmere!`, ['Yes', 'No']);
        } else if (kind === 'confirm') {
          if (res === 0) this.stage = 'go';
          else this.openName();
        }
      }
      return;
    }
    if (this.stage === 'gender') {
      if (input.pressed('left') || input.pressed('right')) {
        this.gender ^= 1;
        this.game.sfx('cursor');
      }
      if (input.pressed('a') || input.pressed('start')) {
        this.game.sfx('confirm');
        this.openName();
      }
      if (input.pressed('b')) {
        import('./title.js').then((m) => this.game.setScene(new m.TitleScene(this.game)));
      }
    } else if (this.stage === 'go') {
      this.fade = Math.min(1, this.fade + 0.04);
      if (this.fade >= 1) {
        const s = newGame({ name: this.name, gender: this.gender ? 'girl' : 'boy', seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        this.game.setScene(new PlayScene(this.game, s));
      }
    }
  }

  openName() {
    this.stage = 'name';
    this.widgetKind = 'name';
    this.widget = new NameEntry(this.game, "What's your name?", this.name ?? '');
  }

  render(r) {
    r.ambient = [1, 1, 1];
    r.useUI();
    r.rect(0, 0, 160, 144, 0.1, 0.12, 0.22, 1);
    const text = this.game.text;
    if (this.stage === 'gender' || (this.widget && this.widgetKind === 'confirm') || this.stage === 'go') {
      drawWindow(r, 8, 8, 144, 30);
      text.center('Welcome, new farmer!', 8, 144, 13, 'font');
      text.center('Who are you?', 8, 144, 23, 'font_dim');
      ['boy', 'girl'].forEach((g, i) => {
        const x = 30 + i * 64;
        const sel = this.gender === i;
        drawWindow(r, x - 6, 52, 48, 56, sel ? 'ui_win' : 'ui_hud');
        const frame = sel ? Math.floor(this.t / 18) % 2 : 0;
        r.spr(`${g}_walk_down_${frame}`, x + 2, 60, 0, -1, 1, 2);
        text.center(g === 'boy' ? 'Boy' : 'Girl', x - 6, 48, 94, sel ? 'font' : 'font_light');
      });
      if (this.stage === 'gender') text.center('←→ choose   A: OK', 0, 160, 122, 'font_light');
    }
    if (this.widget) this.widget.draw(r);
    if (this.fade > 0) r.rect(0, 0, 160, 144, 0, 0, 0, this.fade);
  }
}
