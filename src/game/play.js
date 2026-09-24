// The main gameplay scene.
import { FLIP_X, FLIP_Y } from '../engine/renderer.js';
import { drawWindow, stripTags, LINE_H } from '../engine/text.js';
import { rng } from '../engine/atlas.js';
import { World, T } from './world.js';
import { Player, NPC, Animal, Dog, DIRS, dirTo, moveBody } from './entities.js';
import { Effects, Weather } from './fx.js';
import { DialogBox, Toasts, drawHUD, NameEntry } from './ui.js';
import { PauseMenu, TradeUI } from './menu.js';
import { NPCS, NPC_IDS, SHOPS, FESTIVALS } from './data/npcs.js';
import { ITEMS, TOOLS, CROPS, SEASON_NAMES, TOOL_PALETTES, CAN_CAPACITY, SEASONS } from './data/items.js';
import { storeStock, ranchStock, smithyStock, innStock } from './data/shops.js';
import { GOALS } from './data/goals.js';
import {
  season, dow, weekday, isWet, festivalToday, clockText, addItem, canAdd, takeFromSlot, itemName, hearts,
  saveGame, cycleEquip, equipList, dayIndex, coopCapacity, barnCapacity,
} from './state.js';
import {
  applyTool, plantSeeds, harvest, cropAt, toolArea, endDay, ship, shippable, refillCan, rollFish, milkSize,
  fillTroughs, newAnimal, animalSpace, isFieldCell,
} from './sim.js';
import * as CharArt from '../art/characters.js';

const MINUTE_FRAMES = 40;
const HAND_POS = CharArt.HAND_POS ?? {
  use_down_0: [11, 4], use_down_1: [10, 11], use_up_0: [11, 4], use_up_1: [11, 6], use_side_0: [9, 5], use_side_1: [12, 10],
};
const CHICKEN_NAMES = ['Clover', 'Pebble', 'Nugget', 'Dotty', 'Maple', 'Poppy', 'Hazel', 'Sprout', 'Button', 'Fern'];
const COW_NAMES = ['Bluebell', 'Daisy', 'Buttercup', 'Mocha', 'Willow', 'Honey'];

const TIPS = [
  'Crops only grow on days they are watered. Rain waters them for you!',
  'Hold B with an upgraded tool to charge it and work several tiles at once.',
  'Villagers love gifts. Everyone has favourites — watch their reactions.',
  'The warm spring in Whisperwood restores your stamina.',
  'Seeds only grow in their own season. Crops wither when the season changes.',
  'Fill the feed bin troughs every day so your animals stay happy.',
  'Stumps and branches give lumber. Bram can build with it.',
  'Wild herbs, berries and mushrooms grow in Whisperwood. They sell well!',
  'Finn says the biggest fish bite early in the morning.',
];

export class PlayScene {
  constructor(game, state, opts = {}) {
    this.game = game;
    this.state = state;
    this.player = null;
    this.world = null;
    this.npcs = [];
    this.animals = [];
    this.dog = null;
    this.fx = new Effects();
    this.weather = new Weather();
    this.toasts = new Toasts(game);
    this.overlays = [];
    this.script = null;
    this.cam = { x: 0, y: 0 };
    this.minuteT = 0;
    this.fade = 1;
    this.fadeTarget = 0;
    this.lastHour = -1;
    this.rand = rng((state.seed + dayIndex(state) * 7919) >>> 0);
    this.opts = opts;
    this.flash = 0;
  }

  // --- lifecycle ------------------------------------------------------------------

  enter() {
    const p = this.state.player;
    this.player = new Player(this);
    this.loadMap(p.map, p.x, p.y, p.dir, true);
    this.fade = 1;
    this.fadeTarget = 0;
    if (!this.state.flags.intro && !this.opts.skipIntro) this.run(this.introScript());
    else if (this.opts.continued) this.toast(`Welcome back, ${p.name}!`);
    if (this.opts.skipIntro) this.state.flags.intro = true;
  }

  exit() {
    this.game.ambient(null);
  }

  quitToTitle() {
    this.overlays = [];
    this.run(
      function* () {
        yield* this.fadeOut();
        const { TitleScene } = yield this.importTitle();
        this.game.setScene(new TitleScene(this.game));
      }.call(this),
    );
  }

  importTitle() {
    const p = import('./title.js');
    const w = { done: false, value: null };
    p.then((m) => {
      w.value = m;
      w.done = true;
    });
    return w;
  }

  // --- scripting ------------------------------------------------------------------

  run(gen) {
    this.script = gen;
    this.scriptWait = null;
  }

  stepScript() {
    if (!this.script) return;
    if (this.scriptWait) {
      if (typeof this.scriptWait === 'number') {
        if (--this.scriptWait > 0) return;
      } else if (!this.scriptWait.done) return;
    }
    const sent = this.scriptWait && typeof this.scriptWait === 'object' ? this.scriptWait.value ?? this.scriptWait.result : undefined;
    this.scriptWait = null;
    const r = this.script.next(sent);
    if (r.done) this.script = null;
    else this.scriptWait = r.value ?? null;
  }

  /** Show a widget and wait for it to finish; returns its result. */
  *show(widget) {
    this.overlays.push(widget);
    yield widget;
    const i = this.overlays.indexOf(widget);
    if (i >= 0) this.overlays.splice(i, 1);
    this.game.input.consume();
    return widget.result;
  }

  *say(speaker, text, choices = null, opts) {
    return yield* this.show(new DialogBox(this.game, speaker, this.fmt(text), choices, opts));
  }

  *ask(speaker, text, choices = ['Yes', 'No']) {
    return yield* this.say(speaker, text, choices);
  }

  *wait(frames) {
    yield frames;
  }

  *fadeOut(speed = 0.06) {
    this.fadeTarget = 1;
    this.fadeSpeed = speed;
    while (this.fade < 1) yield 1;
  }

  *fadeIn(speed = 0.06) {
    this.fadeTarget = 0;
    this.fadeSpeed = speed;
    while (this.fade > 0) yield 1;
  }

  *walkNPC(npc, cx, cy) {
    npc.walkTo(this.world, cx, cy);
    while (npc.path && npc.path.length) yield 1;
  }

  fmt(text) {
    return text.replaceAll('{name}', this.state.player.name).replaceAll('{farm}', `${this.state.player.name}'s farm`);
  }

  toast(msg, icon) {
    this.toasts.push(this.fmt(msg), icon);
  }

  busy() {
    return this.overlays.length > 0 || this.script !== null || this.transition;
  }

  // --- maps ---------------------------------------------------------------------

  loadMap(id, cx, cy, dir, initial = false) {
    this.world = new World(this.game, this.state, id);
    this.player.placeAt(cx, cy, dir);
    this.player.action = null;
    Object.assign(this.state.player, { map: id, x: cx, y: cy, dir: dir ?? this.player.dir });
    this.npcs = [];
    this.refreshNPCs(true);
    this.spawnAnimals();
    this.updateAtmosphere(true);
    this.snapCamera();
    this.onEnterMap(id, initial);
  }

  spawnAnimals() {
    this.animals = [];
    this.dog = null;
    const id = this.world.id;
    const pen = this.world.map.pen;
    if (pen) {
      const kind = id === 'coop' ? 'chicken' : id === 'barn' ? 'cow' : null;
      const list = this.state.animals.filter((a) => a.kind === kind);
      list.forEach((a, i) => {
        const x = (pen.x + 1 + ((i * 3) % (pen.w - 1))) * T + 8;
        const y = (pen.y + 1 + (Math.floor(i / 3) % (pen.h - 1))) * T + 12;
        this.animals.push(new Animal(this, a, pen, x, y));
      });
    }
    if (id === 'farm' && this.state.time.min < 20 * 60 && !isWet(this.state.weather) && this.state.weather !== 'blizzard') {
      const s = this.world.map.spots.dog;
      this.dog = new Dog(this, s.x, s.y);
    }
  }

  warpTo(w) {
    if (this.transition) return;
    this.transition = true;
    this.game.sfx(w.door ? 'door' : 'step');
    this.run(
      function* () {
        yield* this.fadeOut(0.1);
        this.loadMap(w.to, w.tx, w.ty, w.dir);
        this.transition = false;
        yield* this.fadeIn(0.1);
        yield* this.afterEnter();
      }.call(this),
    );
  }

  onEnterMap() {}

  *afterEnter() {
    const s = this.state;
    const id = this.world.id;
    if (id === 'village') {
      const fest = festivalToday(s);
      const key = `${s.time.year}-${s.time.season}`;
      if (s.flags.ending === 'ready' && s.time.min >= 8 * 60 && s.time.min < 21 * 60) {
        yield* this.endingScript();
        return;
      }
      if (fest && s.time.min >= 9 * 60 && s.time.min < 18 * 60 && !s.flags.festivals.includes(key)) {
        s.flags.festivals.push(key);
        yield* this.festivalScript(fest);
      }
    }
  }

  // --- NPC placement ------------------------------------------------------------

  scheduleCtx() {
    const s = this.state;
    return {
      min: s.time.min,
      dow: dow(s),
      weekday: weekday(s),
      rain: isWet(s.weather) || s.weather === 'blizzard',
      season: season(s),
      day: s.time.day,
      festival: !!festivalToday(s),
    };
  }

  placementFor(id) {
    if (this.cutsceneNPCs?.has(id)) return null;
    const p = NPCS[id].schedule(this.scheduleCtx());
    if (!p) return null;
    const map = this.game.mapsCache?.[p.map];
    return p;
  }

  resolveSpot(p) {
    const spot = p.spot ? this.world.map.spots[p.spot] : { x: p.x, y: p.y, dir: p.dir };
    if (!spot) return null;
    return { cx: spot.x, cy: spot.y, dir: spot.dir ?? 'down', wander: p.wander ?? 0 };
  }

  entranceNear(cx, cy) {
    const cells = [...this.world.warpAt.keys()].map((i) => [i % this.world.w, Math.floor(i / this.world.w)]);
    let best = null, bd = 1e9;
    for (const [x, y] of cells) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < bd) {
        bd = d;
        best = [x, y];
      }
    }
    return best;
  }

  refreshNPCs(initial = false) {
    for (const id of NPC_IDS) {
      if (this.cutsceneNPCs?.has(id)) continue;
      const p = this.placementFor(id);
      const here = p && p.map === this.world.id ? this.resolveSpot(p) : null;
      let npc = this.npcs.find((n) => n.id === id);
      if (here) {
        if (npc && !npc.leaving) {
          if (npc.target?.cx !== here.cx || npc.target?.cy !== here.cy) {
            npc.target = here;
            npc.walkTo(this.world, here.cx, here.cy);
          }
          continue;
        }
        if (npc?.leaving) {
          npc.leaving = null;
          npc.target = here;
          npc.walkTo(this.world, here.cx, here.cy);
          continue;
        }
        npc = new NPC(this, id, NPCS[id]);
        npc.target = here;
        const ent = !initial && this.entranceNear(here.cx, here.cy);
        if (ent) {
          npc.placeAt(ent[0], ent[1], 'down');
          if (!npc.walkTo(this.world, here.cx, here.cy)) npc.placeAt(here.cx, here.cy, here.dir);
        } else npc.placeAt(here.cx, here.cy, here.dir);
        this.npcs.push(npc);
      } else if (npc && !npc.leaving) {
        const [cx, cy] = npc.cell();
        const ex = this.entranceNear(cx, cy);
        npc.leaving = true;
        npc.target = null;
        npc.onArrive = () => (npc.gone = true);
        if (!ex || !npc.walkTo(this.world, ex[0], ex[1])) npc.gone = true;
      }
    }
  }

  // --- update -------------------------------------------------------------------

  update(input) {
    const s = this.state;
    s.playTime++;
    this.toasts.update();
    this.fx.update();

    if (this.fade !== this.fadeTarget) {
      const sp = this.fadeSpeed ?? 0.06;
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + sp) : Math.max(this.fadeTarget, this.fade - sp);
    }

    const top = this.overlays[this.overlays.length - 1];
    if (top && !top.passive) {
      top.update(input);
    }
    this.stepScript();

    if (!this.busy()) this.controlPlayer(input);
    else if (this.player.action?.kind === 'tool') this.tickAction();

    // world simulation keeps running under dialogue (NPCs finish walking)
    const blockers = [this.player, ...this.npcs.filter((n) => !n.moving), ...this.animals, ...(this.dog ? [this.dog] : [])];
    for (const n of this.npcs) n.update(this.world, blockers);
    this.npcs = this.npcs.filter((n) => !n.gone);
    for (const a of this.animals) a.update(this.world, blockers);
    this.dog?.update(this.world, blockers);
    this.player.t++;

    if (!this.busy() || this.clockDuringScript) this.tickClock();
    this.weather.update(this.game, this.cam);
    if (this.weather.flash) this.flash = this.weather.flash;
    if (this.flash > 0) this.flash--;
    this.updateCamera();
    this.spawnAmbientFx();
  }

  tickClock() {
    const s = this.state;
    if (++this.minuteT < MINUTE_FRAMES) return;
    this.minuteT = 0;
    s.time.min++;
    if (s.time.min % 10 === 0) this.refreshNPCs();
    const hour = Math.floor(s.time.min / 60);
    if (hour !== this.lastHour) {
      this.lastHour = hour;
      this.updateAtmosphere();
      if (s.time.min === 24 * 60) this.toast("It's midnight. Time for bed!");
      if (s.time.min === 20 * 60 && this.dog && this.world.id === 'farm') this.dog = null;
    }
    if (s.time.min >= 26 * 60) this.run(this.faintScript('late'));
  }

  // --- atmosphere ------------------------------------------------------------------

  updateAtmosphere(force = false) {
    const s = this.state;
    const w = this.world;
    const game = this.game;
    this.game.renderer.applySeason(season(s));
    const hour = s.time.min / 60;
    const night = hour >= 19 || hour < 6;
    const wet = isWet(s.weather);
    let track;
    const fest = festivalToday(s);
    if (fest && w.id === 'village' && hour >= 9 && hour < 18) track = 'festival';
    else if (!w.outdoor) track = 'indoor';
    else if (wet || s.weather === 'blizzard') track = null;
    else if (night) track = 'night';
    else if (w.id === 'village') track = 'village';
    else track = season(s);
    if (this.forcedMusic !== undefined) track = this.forcedMusic;
    if (track !== this.music || force) {
      this.music = track;
      game.music(track);
    }
    let amb = null;
    if (w.outdoor) {
      if (s.weather === 'rain') amb = 'rain';
      else if (s.weather === 'storm') amb = 'storm';
      else if (s.weather === 'blizzard') amb = 'wind';
      else if (w.id === 'forest') amb = 'stream';
      else if (night && season(s) === 'summer') amb = 'crickets';
    } else if (wet) amb = 'rain';
    if (amb !== this.amb) {
      this.amb = amb;
      game.ambient(amb);
    }
    let wk = null;
    if (w.outdoor) {
      if (s.weather === 'rain' || s.weather === 'storm') wk = s.weather;
      else if (s.weather === 'snow' || s.weather === 'blizzard') wk = s.weather;
      else if (season(s) === 'spring' && !night) wk = 'petals';
      else if (season(s) === 'fall' && !night) wk = 'leaves';
      else if (season(s) === 'summer' && night) wk = 'fireflies';
    }
    this.weather.set(wk);
  }

  ambientLight() {
    const s = this.state;
    const m = s.time.min;
    const h = m / 60;
    if (!this.world.outdoor) {
      const nightK = h >= 19 || h < 6 ? 1 : h >= 17 ? (h - 17) / 2 : 0;
      return mix3([1, 1, 1], [0.62, 0.56, 0.6], nightK);
    }
    const keys = [
      [0, [0.26, 0.28, 0.5]],
      [5, [0.3, 0.3, 0.52]],
      [6, [0.75, 0.68, 0.8]],
      [7.5, [1, 1, 1]],
      [16, [1, 1, 1]],
      [17.5, [1, 0.86, 0.72]],
      [18.7, [0.8, 0.58, 0.62]],
      [19.7, [0.42, 0.42, 0.68]],
      [21, [0.32, 0.34, 0.58]],
      [26, [0.24, 0.26, 0.48]],
    ];
    let c = keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (h >= keys[i][0] && h < keys[i + 1][0]) {
        c = mix3(keys[i][1], keys[i + 1][1], (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
        break;
      }
    }
    if (isWet(s.weather)) c = mix3(c, [c[0] * 0.72, c[1] * 0.76, c[2] * 0.86], 1);
    if (s.weather === 'snow' || s.weather === 'blizzard') c = [c[0] * 0.92, c[1] * 0.95, c[2] * 1.0];
    if (this.flash > 0) c = mix3(c, [1.6, 1.6, 1.8], this.flash / 14);
    return c;
  }

  spawnAmbientFx() {
    const w = this.world;
    if (!w.outdoor) return;
    for (const o of w.objects) {
      if (o.smoke && this.game.frame % 40 === 0) this.fx.particle('fx_smoke_0', o.smoke.x, o.smoke.y, 0.1, -0.35, 70, { g: 0, sprite: 'fx_smoke_0' });
      if (o.name === 'hot_spring' && this.game.frame % 30 === 0)
        this.fx.particle(`fx_steam_${Math.floor(Math.random() * 3)}`, o.px + 8 + Math.random() * 32, o.py + 10, 0.05, -0.3, 60, { g: 0 });
    }
  }

  // --- camera -----------------------------------------------------------------------

  updateCamera() {
    const w = this.world;
    const tx = Math.round(this.player.x - 80);
    const ty = Math.round(this.player.y - 8 - 72);
    this.cam.x = w.pw <= 160 ? Math.floor((w.pw - 160) / 2) : Math.max(0, Math.min(w.pw - 160, tx));
    this.cam.y = w.ph <= 144 ? Math.floor((w.ph - 144) / 2) : Math.max(0, Math.min(w.ph - 144, ty));
  }

  snapCamera() {
    this.updateCamera();
  }

  // --- player control ------------------------------------------------------------------

  controlPlayer(input) {
    const pl = this.player;
    const s = this.state;
    if (pl.action) {
      this.tickAction(input);
      return;
    }
    if (input.pressed('start')) {
      this.run(this.menuScript());
      return;
    }
    if (input.pressed('select') || input.pressed('r')) {
      if (cycleEquip(s, 1)) this.game.sfx('cursor');
    }
    if (input.pressed('l')) {
      if (cycleEquip(s, -1)) this.game.sfx('cursor');
    }
    if (input.pressed('a')) {
      this.interact();
      return;
    }
    if (input.pressed('b')) {
      this.startTool(input);
      if (pl.action) return;
    }
    const d = input.dir();
    const speed = 1.1;
    pl.moving = false;
    if (d.x || d.y) {
      if (d.x && d.y) {
        // keep facing if one of the two directions is already the facing
        if (!(pl.dir === dirTo(d.x, 0) || pl.dir === dirTo(0, d.y))) pl.dir = dirTo(d.x, 0);
      } else pl.dir = dirTo(d.x, d.y);
      const k = d.x && d.y ? 0.7071 : 1;
      const blockers = [...this.npcs, ...this.animals, ...(this.dog ? [this.dog] : [])];
      pl.moving = moveBody(this.world, pl, d.x * speed * k, d.y * speed * k, blockers);
      if (pl.moving && pl.t % 18 === 0) this.game.sfx('step', { volume: 0.25 });
      const [cx, cy] = pl.cell();
      if (cx !== pl.lastCell[0] || cy !== pl.lastCell[1]) {
        pl.lastCell = [cx, cy];
        const wp = this.world.warpAt.get(cy * this.world.w + cx);
        if (wp) this.warpTo(wp);
      }
    }
  }

  // --- tools ------------------------------------------------------------------------

  startTool(input) {
    const s = this.state;
    const pl = this.player;
    if (s.carrying) {
      this.toast('Your hands are full.');
      return;
    }
    const eq = s.equipped;
    if (!eq) return;
    if (eq.startsWith('seeds:')) {
      pl.action = { kind: 'tool', t: 0, tool: eq, charge: 0 };
      return;
    }
    const lvl = s.tools[eq] ?? 0;
    if (eq === 'rod') {
      const [fx, fy] = pl.front();
      if (!this.world.isWater(fx, fy)) {
        this.toast('Face some water to fish.');
        return;
      }
      if (!this.spend(TOOLS.rod.stamina)) return;
      pl.action = { kind: 'fish', t: 0, phase: 'cast', timer: 20, bx: fx * T + 8, by: fy * T + 8 };
      this.game.sfx('cast');
      return;
    }
    if (['hoe', 'can', 'sickle'].includes(eq) && lvl > 0) {
      pl.action = { kind: 'charge', t: 0, tool: eq, charge: 0, max: lvl };
      return;
    }
    pl.action = { kind: 'tool', t: 0, tool: eq, charge: 0 };
  }

  tickAction(input) {
    const pl = this.player;
    const a = pl.action;
    a.t++;
    if (a.kind === 'charge') {
      const c = Math.min(a.max, Math.floor(a.t / 32));
      if (c > a.charge) {
        a.charge = c;
        this.game.sfx('confirm', { pitch: c * 3 });
        this.fx.burst('sparkle', pl.x, pl.y - 18);
      }
      if (!input || !input.down('b')) pl.action = { kind: 'tool', t: 0, tool: a.tool, charge: a.charge };
      return;
    }
    if (a.kind === 'tool') {
      if (a.t === 8) this.applyAction(a.tool, a.charge);
      if (a.t >= 22) pl.action = null;
      return;
    }
    if (a.kind === 'fish') return this.tickFishing(input, a);
    if (a.kind === 'pose' && a.t >= (a.len ?? 60)) pl.action = null;
  }

  spend(cost) {
    const s = this.state;
    if (s.stamina <= 0) {
      this.run(this.faintScript('tired'));
      return false;
    }
    const before = s.stamina;
    s.stamina = Math.max(0, s.stamina - cost);
    const q = s.maxStamina * 0.3;
    if (before > q && s.stamina <= q) {
      this.toast("You're getting tired...");
      this.game.sfx('tired');
    }
    if (s.stamina <= 0) {
      this.player.pendingFaint = true;
    }
    return true;
  }

  applyAction(tool, charge) {
    const s = this.state;
    const pl = this.player;
    const [fx, fy] = pl.front();
    const w = this.world;
    const d = DIRS[pl.dir];

    if (tool.startsWith('seeds:')) {
      const crop = tool.slice(6);
      if (!w.isFarm || !isFieldCell(fx, fy)) {
        this.toast('Sow seeds on your field.');
        return this.afterAction();
      }
      const n = plantSeeds(s, crop, fx, fy);
      if (n < 0) this.toast(`${CROPS[crop].name} won't grow in ${SEASON_NAMES[season(s)]}.`);
      else if (n === 0) this.toast('Till the soil before sowing.');
      else {
        s.seeds[crop]--;
        this.spend(1);
        this.game.sfx('seed');
        for (let yy = -1; yy <= 1; yy++)
          for (let xx = -1; xx <= 1; xx++) this.fx.burst('sparkle', (fx + xx) * T + 8, (fy + yy) * T + 8);
        if (s.seeds[crop] <= 0) {
          delete s.seeds[crop];
          s.equipped = equipList(s)[0] ?? null;
          this.toast(`Used your last bag of ${CROPS[crop].name} seeds.`);
        }
      }
      return this.afterAction();
    }

    const lvl = s.tools[tool] ?? 0;
    const cost = (TOOLS[tool]?.stamina ?? 1) * (1 + 2 * charge);

    if (tool === 'can') {
      const obj = w.objectAt(fx, fy);
      if (w.isWater(fx, fy) || obj?.name === 'well') {
        refillCan(s);
        this.game.sfx('refill');
        this.fx.burst('splash', fx * T + 8, fy * T + 10);
        this.toast('Filled the watering can.');
        return this.afterAction();
      }
      if (s.water <= 0) {
        this.toast('The watering can is empty. Refill it at water.');
        this.game.sfx('error');
        return this.afterAction();
      }
    }
    if (tool === 'milker' || tool === 'brush') {
      const an = this.animalInFront();
      if (!an || an.kind !== 'cow') {
        this.toast(tool === 'milker' ? 'Use the milker on a cow.' : 'Brush a cow to keep her happy.');
        return this.afterAction();
      }
      this.spend(1);
      if (tool === 'milker') {
        if (!an.data.milkReady) {
          this.toast(`${an.data.name} has no milk right now.`);
          return this.afterAction();
        }
        an.data.milkReady = false;
        this.game.sfx('milk');
        this.pickUp(milkSize(an.data.happy));
      } else {
        if (!an.data.brushed) {
          an.data.brushed = true;
          an.data.happy = Math.min(10, an.data.happy + 1);
          this.fx.float('fx_heart', an.x - 4, an.y - 30);
        }
        this.game.sfx('brush');
      }
      return this.afterAction();
    }
    if (!this.spend(cost)) return;

    if (!w.isFarm) {
      if (tool === 'can') {
        s.water = Math.max(0, s.water - 1);
        this.fx.burst('water', fx * T + 8, fy * T + 12);
        this.game.sfx('water');
      } else this.game.sfx(tool === 'hoe' ? 'hoe' : 'hammer', { volume: 0.6 });
      return this.afterAction();
    }
    const cells = toolArea(fx, fy, d.x, d.y, charge);
    let any = false;
    const sfxPlayed = new Set();
    for (const [cx, cy] of cells) {
      if (tool === 'can') {
        if (s.water <= 0) break;
        s.water--;
        this.fx.burst('water', cx * T + 8, cy * T + 12);
      }
      const res = applyTool(s, tool, lvl, cx, cy);
      if (res.msg) this.toast(res.msg);
      if (res.fx && tool !== 'can') this.fx.burst(res.fx, cx * T + 8, cy * T + 12);
      if (res.sfx && !sfxPlayed.has(res.sfx)) {
        this.game.sfx(res.sfx);
        sfxPlayed.add(res.sfx);
      }
      if (res.lumber) this.fx.text(`+${res.lumber}`, cx * T + 4, cy * T - 4, 'font_gold');
      if (res.ok) any = true;
    }
    if (tool === 'can' && !sfxPlayed.size) this.game.sfx('water');
    if (!any && !sfxPlayed.size) this.game.sfx(tool === 'sickle' ? 'sickle' : 'hoe', { volume: 0.5 });
    this.afterAction();
  }

  afterAction() {
    if (this.player.pendingFaint) {
      this.player.pendingFaint = false;
      this.run(this.faintScript('tired'));
    }
  }

  tickFishing(input, a) {
    const pl = this.player;
    const s = this.state;
    if (a.phase === 'cast') {
      if (--a.timer <= 0) {
        a.phase = 'wait';
        a.timer = 90 + Math.floor(Math.random() * 240);
        this.fx.burst('splash', a.bx, a.by + 2);
        this.game.sfx('splash');
      }
      return;
    }
    if (a.phase === 'wait') {
      if (input?.pressed('b') || input?.pressed('a')) {
        pl.action = null;
        this.toast('You reeled in the line.');
        return;
      }
      if (--a.timer <= 0) {
        a.phase = 'bite';
        a.timer = 38;
        this.game.sfx('bite');
        this.fx.float('fx_exclaim', pl.x - 4, pl.y - 30, 38);
      }
      return;
    }
    if (a.phase === 'bite') {
      if (input?.pressed('b') || input?.pressed('a')) {
        const fish = rollFish(this.rand, this.world.id, s.time.min);
        pl.action = null;
        this.game.sfx('catch');
        if (fish !== 'boot') s.stats.fish++;
        this.pickUp(fish);
        this.toast(fish === 'boot' ? 'You fished up... an old boot.' : `You caught a ${itemName(fish)}!`);
        if (fish === 'fish_gold') this.game.jingle('j_fanfare');
        this.checkGoals();
        return;
      }
      if (--a.timer <= 0) {
        pl.action = null;
        this.game.sfx('fail');
        this.toast('It got away...');
      }
    }
  }

  // --- interaction ------------------------------------------------------------------

  npcInFront() {
    const pl = this.player;
    const d = DIRS[pl.dir];
    const px = pl.x + d.x * 12, py = pl.y - 3 + d.y * 12;
    return this.npcs.find((n) => !n.gone && Math.abs(n.x - px) < 10 && Math.abs(n.y - 3 - py) < 10) ?? null;
  }

  animalInFront() {
    const pl = this.player;
    const d = DIRS[pl.dir];
    const px = pl.x + d.x * 12, py = pl.y - 3 + d.y * 12;
    const list = [...this.animals, ...(this.dog ? [this.dog] : [])];
    return list.find((a) => Math.abs(a.x - px) < (a.hw ?? 5) + 7 && Math.abs(a.y - 3 - py) < (a.hh ?? 5) + 7) ?? null;
  }

  interact() {
    const s = this.state;
    const w = this.world;
    const pl = this.player;
    const [fx, fy] = pl.front();
    const npc = this.npcInFront();
    if (npc) {
      npc.dir = dirTo(pl.x - npc.x, pl.y - npc.y);
      npc.talkFace = 1;
      this.run(s.carrying ? this.giftScript(npc) : this.talkScript(npc));
      return;
    }
    const an = this.animalInFront();
    if (an && !s.carrying) return this.petAnimal(an);

    const obj = w.objectAt(fx, fy);
    if (s.carrying) {
      if (obj?.def?.interact === 'bin') return this.shipCarried();
      if (obj?.def?.interact === 'trough' || obj?.def?.interact === 'feed_bin') return this.useFeedBin();
      if (addItem(s, s.carrying, 1) === 0) {
        this.toast(`Put the ${itemName(s.carrying)} in your rucksack.`, `item_${s.carrying}`);
        s.carrying = null;
        this.game.sfx('pickup', { pitch: -3 });
      } else {
        this.toast('Your rucksack is full!');
        this.game.sfx('error');
      }
      return;
    }
    // pick up items on the ground (front cell, then own cell)
    const [cx, cy] = pl.cell();
    const drop = w.dropAt(fx, fy) ?? w.dropAt(cx, cy);
    if (drop) {
      w.removeDrop(drop);
      if (drop.forage) s.stats.forage++;
      if (drop.id === 'egg' || drop.id === 'egg_gold') s.stats.eggs++;
      this.pickUp(drop.id);
      this.checkGoals();
      return;
    }
    if (w.isFarm) {
      const got = harvest(s, fx, fy);
      if (got) {
        this.pickUp(got);
        this.game.sfx('harvest');
        this.fx.burst('dust', fx * T + 8, fy * T + 12);
        return;
      }
      const c = cropAt(s, fx, fy);
      if (c && !c.dead) {
        const left = CROPS[c.id].days - c.age;
        this.toast(`${CROPS[c.id].name}: ${left > 0 ? `about ${left} more day${left > 1 ? 's' : ''}` : 'ready!'}`);
        return;
      }
    }
    if (obj?.def?.interact) return this.useObject(obj, fx, fy);
    const door = w.doorAt.get(fy * w.w + fx);
    if (door?.locked) {
      this.game.sfx('door', { volume: 0.4 });
      this.run(this.say(null, door.locked));
    }
  }

  pickUp(id) {
    this.state.carrying = id;
    this.player.action = { kind: 'pose', pose: 'happy', t: 0, len: 24 };
    this.game.sfx('pickup');
  }

  holdFromRucksack(slot) {
    const id = takeFromSlot(this.state, slot, 1);
    if (id) this.state.carrying = id;
  }

  eatFromRucksack(slot) {
    const s = this.state;
    const id = s.rucksack[slot]?.id;
    const def = ITEMS[id];
    if (!def?.stamina) return;
    takeFromSlot(s, slot, 1);
    s.stamina = Math.min(s.maxStamina, s.stamina + def.stamina);
    this.game.sfx('eat');
    this.toast(`Ate the ${def.name}. (+${def.stamina})`);
  }

  shipCarried() {
    const s = this.state;
    const id = s.carrying;
    if (!shippable(id)) {
      this.toast("That can't be shipped.");
      this.game.sfx('error');
      return;
    }
    ship(s, id, 1);
    s.carrying = null;
    this.game.sfx('ship');
    this.toast(`Shipped ${itemName(id)}.`, `item_${id}`);
  }

  petAnimal(an) {
    const s = this.state;
    if (an instanceof Dog) {
      an.dir = dirTo(this.player.x - an.x, this.player.y - an.y);
      an.sitting = true;
      if (!s.dog.petted) {
        s.dog.petted = true;
        s.dog.affection = Math.min(100, s.dog.affection + 2);
        an.heart = 60;
      }
      this.fx.float('fx_heart', an.x - 4, an.y - 22);
      this.game.sfx('bark');
      return;
    }
    const a = an.data;
    if (!a.talked) {
      a.talked = true;
      a.happy = Math.min(10, a.happy + 1);
    }
    this.fx.float('fx_heart', an.x - 4, an.y - (a.kind === 'cow' ? 30 : 20));
    this.game.sfx(a.kind === 'cow' ? 'moo' : 'cluck');
    const mood = a.happy >= 8 ? 'very happy' : a.happy >= 5 ? 'content' : a.happy >= 2 ? 'a bit lonely' : 'unhappy';
    const extra = a.kind === 'cow' ? (a.milkReady ? ' She has milk ready.' : '') : '';
    this.toast(`${a.name} looks ${mood}.${extra}`);
  }

  useFeedBin() {
    const kind = this.world.id === 'coop' ? 'chicken' : this.world.id === 'barn' ? 'cow' : null;
    if (!kind) return this.run(this.say(null, 'A bin of animal feed.'));
    const s = this.state;
    const have = s.animals.filter((a) => a.kind === kind).length;
    const key = kind === 'chicken' ? 'coopFeed' : 'barnFeed';
    const stockKey = kind === 'chicken' ? 'feed' : 'fodder';
    const target = Math.min(Math.max(have, 1), kind === 'chicken' ? coopCapacity(s) : barnCapacity(s));
    if (s[key] >= target) return this.toast('The troughs are already full.');
    const n = fillTroughs(s, kind);
    if (!n) {
      this.game.sfx('error');
      return this.toast(`No ${stockKey} left! Buy more at Theo's ranch.`);
    }
    this.game.sfx('pickup', { pitch: -5 });
    this.toast(`Filled ${n} trough${n > 1 ? 's' : ''}. (${stockKey} left: ${s[stockKey]})`);
  }

  useObject(obj, fx, fy) {
    const s = this.state;
    const kind = obj.def.interact;
    switch (kind) {
      case 'bin':
        return this.run(this.shipMenuScript());
      case 'bed':
        return this.run(this.bedScript());
      case 'tv':
        return this.run(this.tvScript());
      case 'calendar':
        return this.run(this.calendarScript());
      case 'diary':
        return this.run(this.diaryScript());
      case 'bookshelf':
        return this.run(this.say(null, TIPS[(dayIndex(s) + fx) % TIPS.length]));
      case 'sign':
        return this.run(this.say(null, obj.text ?? 'A wooden sign.'));
      case 'mailbox':
        return this.run(this.say(null, 'No letters today. The mailbox smells faintly of cedar.'));
      case 'noticeboard':
        return this.run(this.noticeScript());
      case 'well':
        if (s.tools.can !== undefined) {
          refillCan(s);
          this.game.sfx('refill');
          return this.toast('Filled the watering can at the well.');
        }
        return;
      case 'fountain':
        return this.run(this.say(null, 'Coins glint at the bottom of the fountain. Someone wished for rain, by the look of it.'));
      case 'hot_spring':
        return this.run(this.springScript());
      case 'feed_bin':
      case 'trough':
        return this.useFeedBin();
      case 'counter':
        return this.run(this.counterScript(fx, fy));
    }
  }

  // --- scripts ----------------------------------------------------------------------

  *menuScript() {
    yield* this.show(new PauseMenu(this));
  }

  *talkScript(npc) {
    const s = this.state;
    const data = s.npcs[npc.id];
    const def = NPCS[npc.id];
    const name = def.name;
    npc.talkFace = 99999;
    this.game.sfx('confirm', { volume: 0.4 });
    if (!data.met) {
      data.met = true;
      data.friend += 3;
      data.talked = true;
      yield* this.say(name, def.lines.intro[0]);
      if (npc.id === 'finn' && !s.tools.rod) {
        yield* this.say(name, "You'll want one of these if you're going to live out here. I've got a spare.");
        s.tools.rod = 0;
        s.flags.metFinn = true;
        this.game.jingle('j_fanfare');
        yield* this.say(null, 'You received a {b}Fishing Rod{/}! Face water and press B to cast.');
      }
    } else {
      if (!data.talked) {
        data.talked = true;
        data.friend = Math.min(100, data.friend + 1);
      }
      yield* this.say(name, this.pickLine(npc.id));
    }
    const shopId = def.shop;
    if (shopId && this.world.id === shopId && this.shopOpen(shopId)) {
      const c = yield* this.ask(name, 'Can I get you anything?', ['Shop', 'Just chatting']);
      if (c === 0) yield* this.shopScript(shopId);
    }
    npc.talkFace = 20;
    this.checkGoals();
  }

  pickLine(id) {
    const s = this.state;
    const L = NPCS[id].lines;
    const f = s.npcs[id].friend;
    const r = Math.random();
    if (festivalToday(s) && L.festival && s.time.min >= 9 * 60 && s.time.min < 18 * 60) return L.festival[0];
    if (isWet(s.weather) && L.rain && r < 0.4) return pick(L.rain);
    if (hearts(f) >= 5 && L.close && r < 0.35) return pick(L.close);
    const seasonal = L[season(s)];
    if (seasonal && r < 0.3) return pick(seasonal);
    return pick(L.any);
  }

  *giftScript(npc) {
    const s = this.state;
    const data = s.npcs[npc.id];
    const def = NPCS[npc.id];
    npc.talkFace = 99999;
    const item = s.carrying;
    if (!data.met) {
      yield* this.talkScript(npc);
      return;
    }
    if (data.gifted) {
      yield* this.say(def.name, "You already gave me something today. Thank you, though!");
      npc.talkFace = 20;
      return;
    }
    const c = yield* this.ask(null, `Give the ${itemName(item)} to ${def.name}?`);
    if (c !== 0) {
      npc.talkFace = 20;
      return;
    }
    s.carrying = null;
    data.gifted = true;
    let key = 'neutral', pts = 2;
    if (def.gifts.love.includes(item)) (key = 'love'), (pts = 8);
    else if (def.gifts.like.includes(item)) (key = 'like'), (pts = 4);
    else if (def.gifts.hate.includes(item)) (key = 'hate'), (pts = -4);
    data.friend = Math.max(0, Math.min(100, data.friend + pts));
    if (!data.talked) {
      data.talked = true;
      data.friend = Math.min(100, data.friend + 1);
    }
    if (pts > 0) {
      this.fx.float('fx_heart', npc.x - 4, npc.y - 26);
      this.game.sfx('heart');
    } else this.game.sfx('error');
    yield* this.say(def.name, def.lines[key][0]);
    npc.talkFace = 20;
    this.checkGoals();
  }

  shopOpen(shopId) {
    const sh = SHOPS[shopId];
    const s = this.state;
    return s.time.min >= sh.open[0] && s.time.min < sh.open[1] && !sh.closedDow.includes(dow(s)) && !festivalToday(s);
  }

  *counterScript(fx, fy) {
    const shopId = Object.keys(SHOPS).find((k) => k === this.world.id);
    if (!shopId) return;
    const sh = SHOPS[shopId];
    const keeper = this.npcs.find((n) => n.id === sh.keeper && !n.gone && Math.abs(n.y - (fy * T + 14)) < 40);
    if (!keeper) {
      yield* this.say(null, "Nobody's at the counter right now.");
      return;
    }
    const def = NPCS[sh.keeper];
    if (!this.shopOpen(shopId)) {
      yield* this.say(def.name, def.lines.closed?.[0] ?? "Sorry, we're closed.");
      return;
    }
    const s = this.state;
    if (!s.npcs[sh.keeper].met) {
      s.npcs[sh.keeper].met = true;
      s.npcs[sh.keeper].friend += 3;
      yield* this.say(def.name, def.lines.intro[0]);
    }
    yield* this.shopScript(shopId);
  }

  *shopScript(shopId) {
    const s = this.state;
    const sh = SHOPS[shopId];
    const entriesFor = () => {
      switch (shopId) {
        case 'store': {
          const list = storeStock(season(s));
          if (season(s) === 'winter') list.unshift({ id: 'none', kind: 'info', name: 'No seeds in winter', price: 0, sprite: 'ic_snow', desc: 'The ground is frozen. Come back in spring!', disabled: 'No seeds sell in winter.' });
          return list.map((e) => ({ ...e, stack: e.kind === 'seeds' || e.kind === 'item' }));
        }
        case 'ranch':
          return ranchStock(s);
        case 'smithy':
          return smithyStock(s).map((e) => {
            if (e.kind === 'upgrade' && s.pendingUpgrade && !s.pendingUpgrade.done) return { ...e, disabled: "I'm already working on one of your tools." };
            return e;
          });
        case 'inn':
          return innStock().map((e) => ({ ...e, stack: e.kind === 'item' }));
      }
      return [];
    };
    const ui = new TradeUI(this.game, {
      title: sh.short ?? sh.name,
      entries: entriesFor(),
      gold: () => s.gold,
      onPick: (e, qty) => {
        const msg = this.buy(shopId, e, qty);
        ui.entries = entriesFor();
        if (ui.cursor >= ui.entries.length) ui.cursor = Math.max(0, ui.entries.length - 1);
        return msg;
      },
    });
    yield* this.show(ui);
    this.checkGoals();
  }

  buy(shopId, e, qty) {
    const s = this.state;
    const cost = e.price * qty;
    if (s.gold < cost) {
      this.game.sfx('error');
      return "You don't have enough gold.";
    }
    if (e.lumber && s.lumber < e.lumber) {
      this.game.sfx('error');
      return `You need ${e.lumber} lumber. Chop stumps and branches on your farm.`;
    }
    switch (e.kind) {
      case 'seeds':
        s.seeds[e.id] = (s.seeds[e.id] ?? 0) + qty;
        if (!s.equipped) s.equipped = `seeds:${e.id}`;
        break;
      case 'item': {
        const left = addItem(s, e.id, qty);
        if (left === qty) {
          this.game.sfx('error');
          return 'Your rucksack is full.';
        }
        if (left) {
          s.gold -= e.price * (qty - left);
          this.game.sfx('buy');
          return `Only ${qty - left} fit in your rucksack.`;
        }
        break;
      }
      case 'feed':
        s.feed += qty;
        break;
      case 'fodder':
        s.fodder += qty;
        break;
      case 'animal': {
        if (animalSpace(s, e.id) < qty) {
          this.game.sfx('error');
          return `Your ${e.id === 'chicken' ? 'coop' : 'barn'} is full. Bram can extend it.`;
        }
        const pool = e.id === 'chicken' ? CHICKEN_NAMES : COW_NAMES;
        const count = s.animals.filter((a) => a.kind === e.id).length;
        const name = pool[count % pool.length];
        newAnimal(s, e.id, name);
        s.gold -= cost;
        this.game.jingle('j_fanfare');
        return `${name} the ${e.id} will be waiting in your ${e.id === 'chicken' ? 'coop' : 'barn'}!`;
      }
      case 'tool':
        if (s.tools[e.id] !== undefined) return 'You already have one.';
        s.tools[e.id] = 0;
        break;
      case 'upgrade':
        s.lumber -= e.lumber;
        s.pendingUpgrade = { tool: e.id, level: e.level, ready: dayIndex(s) + 1 };
        if (s.equipped === e.id) s.equipped = equipList(s)[0] ?? null;
        s.gold -= cost;
        this.game.sfx('buy');
        return `Bram takes your ${TOOLS[e.id].name}. "Come back tomorrow."`;
      case 'building':
        s.lumber -= e.lumber;
        s.upgrades[e.id] = 1;
        if (e.id === 'house') s.maxStamina = 130;
        s.gold -= cost;
        this.game.jingle('j_fanfare');
        return e.id === 'house' ? 'Your new feather bed is ready! Max stamina +30.' : `Your ${e.id} has been extended!`;
      case 'meal':
        s.stamina = Math.min(s.maxStamina, s.stamina + e.stamina);
        s.gold -= cost;
        this.game.sfx('eat');
        return `Delicious! You feel refreshed.`;
    }
    s.gold -= cost;
    this.game.sfx('buy');
    return `Bought ${qty > 1 ? `${qty} x ` : ''}${e.name}.`;
  }

  *shipMenuScript() {
    const s = this.state;
    const make = () =>
      s.rucksack
        .map((slot, i) => ({ slot, i }))
        .filter(({ slot }) => slot && shippable(slot.id))
        .reduce((acc, { slot }) => {
          if (!acc.find((e) => e.id === slot.id))
            acc.push({
              id: slot.id,
              name: itemName(slot.id),
              price: ITEMS[slot.id].price,
              sprite: `item_${slot.id}`,
              stack: true,
              available: () => s.rucksack.reduce((n, sl) => n + (sl?.id === slot.id ? sl.n : 0), 0),
              desc: 'Shipped goods are paid for the next morning.',
            });
          return acc;
        }, []);
    const entries = make();
    const pending = Object.values(s.shipping).reduce((a, b) => a + b, 0);
    if (!entries.length) {
      yield* this.say(null, pending ? `The shipping bin holds ${pending} item${pending > 1 ? 's' : ''}. They'll be collected tonight.` : 'The shipping bin. Put harvested goods in here and they are sold overnight.');
      return;
    }
    const ui = new TradeUI(this.game, {
      title: 'Shipping Bin',
      entries,
      mode: 'sell',
      gold: () => s.gold,
      maxQty: (e) => e.available(),
      onPick: (e, qty) => {
        let left = qty;
        for (let i = 0; i < s.rucksack.length && left > 0; i++) {
          const sl = s.rucksack[i];
          if (sl?.id !== e.id) continue;
          const k = Math.min(sl.n, left);
          sl.n -= k;
          left -= k;
          if (sl.n <= 0) s.rucksack[i] = null;
        }
        ship(s, e.id, qty);
        this.game.sfx('ship');
        return `Shipped ${qty} x ${e.name}.`;
      },
    });
    yield* this.show(ui);
  }

  *bedScript() {
    const s = this.state;
    const early = s.time.min < 18 * 60;
    const c = yield* this.ask(null, early ? "It's still early. Go to bed anyway?" : 'Go to bed for the night?');
    if (c !== 0) return;
    yield* this.sleepScript('sleep');
  }

  *faintScript(why) {
    const pl = this.player;
    pl.action = { kind: 'pose', pose: 'faint', t: 0, len: 9999 };
    this.game.sfx('tired');
    this.game.jingle('j_faint');
    yield 50;
    yield* this.say(null, why === 'late' ? 'You stayed up far too late and collapsed from exhaustion...' : 'You pushed yourself too hard and collapsed...');
    pl.action = null;
    yield* this.sleepScript('faint');
  }

  *sleepScript(mode) {
    const s = this.state;
    this.forcedMusic = null;
    this.game.music(null);
    if (mode === 'sleep') {
      this.player.action = { kind: 'pose', pose: 'sleep', t: 0, len: 9999 };
      const bed = this.world.objects.find((o) => o.name === 'bed');
      if (bed) {
        this.player.x = bed.px + 8;
        this.player.y = bed.py + 26;
      }
      this.game.jingle('j_sleep');
    }
    yield* this.fadeOut(0.02);
    const report = endDay(s, this.rand, mode);
    if (s.pendingUpgrade?.done) s.pendingUpgrade = null;
    this.rand = rng((s.seed + dayIndex(s) * 7919) >>> 0);
    const newGoals = this.checkGoals(true);
    const allDone = GOALS.every((g) => s.goals.includes(g.id));
    if (allDone && !s.flags.ending) s.flags.ending = 'ready';
    saveGame(s);
    this.player.action = null;
    yield* this.show(new MorningReport(this, report, newGoals));
    this.forcedMusic = undefined;
    this.lastHour = -1;
    this.loadMap('house', 1, 3, 'down');
    yield* this.fadeIn(0.04);
    this.game.jingle('j_morning');
    if (this.state.weather === 'sun') this.game.sfx('rooster');
    if (s.flags.ending === 'ready') {
      yield* this.say(null, 'A note is pinned to your door: "Please come to the village plaza. — Mayor Hollis"');
    }
  }

  *tvScript() {
    const s = this.state;
    const names = { sun: 'sunny skies', rain: 'rain', storm: 'a thunderstorm', snow: 'snow', blizzard: 'a blizzard' };
    yield* this.say('Valley Radio', `Tomorrow's forecast: ${names[s.tomorrow] ?? s.tomorrow}.`);
    const f = FESTIVALS[season(s)];
    if (f && f.day > s.time.day) yield* this.say('Valley Radio', `Don't forget: ${f.name} is on ${SEASON_NAMES[season(s)]} ${f.day}!`);
    yield* this.say('Valley Radio', `Farming tip: ${TIPS[dayIndex(s) % TIPS.length]}`);
  }

  *calendarScript() {
    const s = this.state;
    const f = FESTIVALS[season(s)];
    const fest = f ? `${f.name} is on the ${f.day}${ordinal(f.day)}.` : '';
    const days = 30 - s.time.day;
    yield* this.say(null, `${SEASON_NAMES[season(s)]} ${s.time.day}, ${weekday(s)}. Year ${s.time.year}. ${fest} ${days ? `${days} days left this season.` : 'Last day of the season!'}`);
  }

  *diaryScript() {
    const c = yield* this.ask(null, 'Write in your diary? (Save the game)');
    if (c !== 0) return;
    const ok = saveGame(this.state);
    this.game.sfx(ok ? 'confirm' : 'error');
    yield* this.say(null, ok ? 'You wrote about your day. (Game saved)' : 'Saving failed — your browser may be blocking storage.');
  }

  *noticeScript() {
    const s = this.state;
    const lines = SEASONS.map((k) => `${SEASON_NAMES[k]} ${FESTIVALS[k].day}: ${FESTIVALS[k].name}`).join('\n');
    yield* this.say('Noticeboard', `Festivals:\n${lines}`);
    yield* this.say('Noticeboard', 'Shop hours — Store 9-5 (closed Wed). Ranch 10-4 (closed Sun). Workshop 10-6 (closed Sat). Inn 10:30-10.');
  }

  *springScript() {
    const s = this.state;
    const c = yield* this.ask(null, 'Take a long soak in the warm spring?');
    if (c !== 0) return;
    yield* this.fadeOut(0.05);
    s.stamina = s.maxStamina;
    s.time.min = Math.min(25 * 60, s.time.min + 60);
    this.refreshNPCs();
    this.updateAtmosphere();
    yield 30;
    yield* this.fadeIn(0.05);
    this.toast('You feel completely refreshed!');
    this.game.sfx('heart');
  }

  *introScript() {
    const s = this.state;
    const farm = this.world;
    this.cutsceneNPCs = new Set(['hollis']);
    const mayor = new NPC(this, 'hollis', NPCS.hollis);
    const ms = farm.map.spots.intro_mayor;
    mayor.placeAt(30, 8, 'left');
    this.npcs.push(mayor);
    this.fade = 1;
    this.forcedMusic = 'title';
    this.updateAtmosphere(true);
    yield* this.fadeIn(0.03);
    yield 30;
    yield* this.walkNPC(mayor, ms.x, ms.y);
    mayor.dir = 'left';
    this.player.dir = 'right';
    s.npcs.hollis.met = true;
    s.npcs.hollis.friend += 3;
    const H = 'Hollis';
    yield* this.say(H, "Ah, there you are! You must be {name}. I'm Hollis, mayor of Willowmere. Welcome, welcome!");
    yield* this.say(H, "This farm belonged to your grandmother, Wren. It's been quiet since she passed on... and the field has gone rather wild, I'm afraid.");
    yield* this.say(H, "But she always said you'd come. The land is yours now — every weed and pebble of it!");
    yield* this.say(H, 'Clear the field with your tools, till the soil, sow seeds and water them every day. Rain does the watering for you.');
    yield* this.say(H, "When you harvest, put your crops in the {b}shipping bin{/} beside the house. I collect it every night and you're paid the next morning.");
    this.game.jingle('j_fanfare');
    yield* this.say(null, 'You received a bag of {b}Turnip Seeds{/} and your grandmother\'s {b}Farm Journal{/}!');
    yield* this.say(H, "Wren wrote her hopes for the farm in that journal. See if you can fulfil them all — I'd love to see this place thrive again.");
    const touch = this.game.input.lastDevice === 'touch';
    yield* this.say(
      H,
      touch
        ? 'Use the {b}B{/} button for tools, {b}A{/} to talk and pick things up, {b}SELECT{/} to switch tools and {b}START{/} for your menu.'
        : 'Press {b}X{/} to use tools, {b}Z{/} to talk and pick things up, {b}Shift{/} or {b}Q/E{/} to switch tools and {b}Enter{/} for your menu.',
    );
    yield* this.say(H, "The village is east along the road — Marta's store sells seeds. South is Whisperwood forest. Oh, and Biscuit, Wren's old dog, has been waiting for you!");
    yield* this.say(H, "Mind your stamina, and sleep in your own bed at night. Good luck, {name}!");
    this.forcedMusic = undefined;
    this.updateAtmosphere(true);
    mayor.walkTo(farm, 31, 7);
    mayor.onArrive = () => (mayor.gone = true);
    s.flags.intro = true;
    this.cutsceneNPCs = null;
    saveGame(s);
  }

  *festivalScript(f) {
    const s = this.state;
    this.forcedMusic = 'festival';
    this.updateAtmosphere(true);
    yield* this.say('Hollis', `Welcome, {name}! Today is ${f.name}! ${f.desc}`);
    let n = 0;
    for (const npc of this.npcs) {
      s.npcs[npc.id].friend = Math.min(100, s.npcs[npc.id].friend + 3);
      s.npcs[npc.id].met = true;
      n++;
    }
    this.game.sfx('heart');
    yield* this.say(null, `You spend time celebrating with everyone. (${n} villagers are a little fonder of you!)`);
    this.forcedMusic = undefined;
    this.updateAtmosphere(true);
  }

  *endingScript() {
    const s = this.state;
    s.flags.ending = 'done';
    this.forcedMusic = 'ending';
    this.updateAtmosphere(true);
    yield* this.say('Hollis', "There you are, {name}! Everyone — gather round!");
    yield* this.say('Hollis', "When you arrived, your grandmother's farm was a tangle of weeds and stones. Look at it now!");
    yield* this.say('Hollis', "You've done everything Wren dreamed of in that journal. On behalf of all of Willowmere — thank you.");
    for (const npc of this.npcs) s.npcs[npc.id].friend = Math.min(100, s.npcs[npc.id].friend + 5);
    this.game.jingle('j_goal');
    yield* this.show(new Credits(this));
    yield* this.say(null, 'Congratulations! You completed the Farm Journal. Your life in Willowmere goes on — enjoy the seasons ahead!');
    this.forcedMusic = undefined;
    this.updateAtmosphere(true);
    saveGame(s);
  }

  checkGoals(silent = false) {
    const s = this.state;
    const fresh = [];
    for (const g of GOALS) {
      if (s.goals.includes(g.id)) continue;
      if (g.check(s)) {
        s.goals.push(g.id);
        fresh.push(g);
      }
    }
    if (!silent && fresh.length) {
      this.game.jingle('j_goal');
      for (const g of fresh) this.toast(`Journal: ${g.text} ✓`, 'ic_star');
      if (GOALS.every((g) => s.goals.includes(g.id)) && !s.flags.ending) s.flags.ending = 'ready';
    }
    return fresh;
  }

  // --- rendering ----------------------------------------------------------------------

  render(r) {
    const cam = this.cam;
    const w = this.world;
    const s = this.state;
    r.ambient = this.ambientLight();
    r.useWorld();
    w.drawGround(r, cam);

    const list = [];
    w.collectSorted(list, cam);
    const chars = [...this.npcs, ...this.animals, ...(this.dog ? [this.dog] : [])];
    for (const c of chars) {
      r.spr('fx_shadow', c.x - 6 - cam.x, c.y - 3 - cam.y, 0, -1, 0.35);
      list.push({ y: c.y, draw: (rr) => this.drawChar(rr, c) });
    }
    r.spr('fx_shadow', this.player.x - 6 - cam.x, this.player.y - 3 - cam.y, 0, -1, 0.35);
    list.push({ y: this.player.y, draw: (rr) => this.drawPlayer(rr) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw(r);

    // fishing line & bobber
    const a = this.player.action;
    if (a?.kind === 'fish' && a.phase !== 'cast') {
      const bob = a.phase === 'bite' ? 1 : Math.floor(this.game.frame / 20) % 2;
      r.spr(`fx_bobber_${bob}`, a.bx - 4 - cam.x, a.by - 4 - cam.y + (a.phase === 'bite' ? 2 : 0));
    }
    this.fx.draw(r, cam, this.game.text);
    this.drawTargetCursor(r);
    this.weather.draw(r, this.game.frame);
    this.drawLights(r);

    // UI
    r.useUI();
    const top = this.overlays[this.overlays.length - 1];
    const fullscreen = top && (top instanceof PauseMenu || top instanceof TradeUI || top instanceof MorningReport || top instanceof Credits || top instanceof NameEntry);
    if (!fullscreen && this.game.settings.hud && !this.hideHud) {
      const psx = this.player.x - cam.x, psy = this.player.y - cam.y;
      const alpha = psy < 52 && (psx < 84 || psx > 104) ? 0.45 : 1;
      drawHUD(this.game, r, s, alpha * (1 - this.fade));
    }
    if (!fullscreen) this.toasts.draw(r);
    if (this.fade > 0) r.rect(0, 0, 160, 144, 0, 0, 0, this.fade);
    for (const o of this.overlays) o.draw(r);
  }

  drawChar(r, c) {
    const f = c.frame();
    const [sw, sh] = r.size(f.name);
    r.spr(f.name, c.x - sw / 2 - this.cam.x, c.y - sh - this.cam.y + 1, f.flip);
    if (c.heart > 0 && c.heart % 30 < 20) r.spr('fx_heart', c.x - 4 - this.cam.x, c.y - sh - 9 - this.cam.y);
  }

  drawPlayer(r) {
    const pl = this.player;
    const cam = this.cam;
    const f = pl.frame();
    const x = Math.round(pl.x - 8 - cam.x);
    const y = Math.round(pl.y - 16 - cam.y + 1);
    const a = pl.action;
    const toolId = a?.kind === 'fish' ? 'rod' : a?.tool;
    const drawTool = () => {
      if (!toolId || f.useFrame === undefined) return;
      if (toolId.startsWith('seeds:')) {
        if (f.useFrame === 1) r.spr(`item_seeds_${toolId.slice(6)}`, x + (pl.dir === 'left' ? -6 : pl.dir === 'right' ? 6 : 0), y - 2);
        return;
      }
      const key = `use_${f.view}_${f.useFrame}`;
      let [hx, hy] = HAND_POS[key] ?? [8, 8];
      let flags = 0;
      let gx = 2, gy = 13; // grip pixel inside the 16x16 tool icon
      const strike = f.useFrame === 1 && f.view !== 'up';
      if (strike) {
        flags |= FLIP_Y;
        gy = 2;
      }
      if (pl.dir === 'left') {
        flags |= FLIP_X;
        hx = 15 - hx;
        gx = 13;
      }
      const pal = TOOL_PALETTES[this.state.tools[toolId] ?? 0] ?? 'tool';
      r.spr(`tool_${toolId}`, x + hx - gx, y + hy - gy, flags, pal);
    };
    if (pl.dir === 'up') drawTool();
    r.spr(f.name, x, y, f.flip);
    if (pl.dir !== 'up') drawTool();
    if (this.state.carrying) {
      const bob = pl.moving && Math.floor(pl.t / 9) % 2 ? 1 : 0;
      r.spr(`item_${this.state.carrying}`, x, y - 13 + bob);
    }
    if (a?.kind === 'charge' && a.charge > 0 && Math.floor(this.game.frame / 4) % 2) r.spr('fx_sparkle_0', x + 12, y - 4);
    if (this.state.stamina / this.state.maxStamina < 0.15 && Math.floor(this.game.frame / 30) % 2 && !a) r.spr('fx_sweat', x + 12, y - 2);
  }

  drawTargetCursor(r) {
    const s = this.state;
    if (this.busy() || s.carrying || !this.world.isFarm) return;
    const eq = s.equipped;
    if (!eq || eq === 'rod' || eq === 'milker' || eq === 'brush') return;
    const [fx, fy] = this.player.front();
    if (!isFieldCell(fx, fy)) return;
    const alpha = 0.55 + 0.25 * Math.sin(this.game.frame / 10);
    if (eq.startsWith('seeds:')) {
      r.spr('fx_cursor', (fx - 1) * T - this.cam.x, (fy - 1) * T - this.cam.y, 0, -1, alpha * 0.6);
      r.spr('fx_cursor', (fx + 1) * T - this.cam.x, (fy + 1) * T - this.cam.y, FLIP_X | FLIP_Y, -1, alpha * 0.6);
    }
    r.spr('fx_cursor', fx * T - this.cam.x, fy * T - this.cam.y, 0, -1, alpha);
  }

  drawLights(r) {
    const s = this.state;
    const h = s.time.min / 60;
    const w = this.world;
    const cam = this.cam;
    const night = h >= 18 || h < 6.5;
    const k = w.outdoor ? (h >= 19 || h < 6 ? 1 : h >= 18 ? h - 18 : h < 6.5 ? (6.5 - h) * 2 : 0) : 1;
    for (const L of w.lights) {
      if (w.outdoor && !night && !L.c) continue;
      const lx = L.x - cam.x, ly = L.y - cam.y;
      if (lx < -60 || ly < -60 || lx > 220 || ly > 200) continue;
      const flicker = 0.9 + 0.1 * Math.sin((this.game.frame + L.x) / 7);
      const intensity = (L.window ? 0.75 : 1) * (w.outdoor ? k : 0.9) * flicker;
      if (intensity <= 0.01) continue;
      r.light(lx, ly, L.r, L.c[0], L.c[1], L.c[2], intensity);
    }
    if (w.outdoor && k > 0) {
      r.light(this.player.x - cam.x, this.player.y - 8 - cam.y, 44, 0.55, 0.5, 0.4, 0.55 * k);
    }
    if (!w.outdoor) {
      r.light(80, 60, 110, 0.25, 0.22, 0.18, 0.6);
    }
  }

  debugInfo() {
    const s = this.state;
    return {
      map: this.world.id,
      time: clockText(s.time.min),
      day: `${season(s)} ${s.time.day} y${s.time.year}`,
      gold: s.gold,
      stamina: s.stamina,
      player: [Math.round(this.player.x), Math.round(this.player.y), this.player.dir],
      npcs: this.npcs.map((n) => n.id),
      overlays: this.overlays.map((o) => o.constructor.name),
      script: !!this.script,
      missing: [...this.game.renderer._missing],
    };
  }
}

class MorningReport {
  constructor(play, report, goals) {
    this.play = play;
    this.game = play.game;
    this.report = report;
    this.goals = goals;
    this.t = 0;
    this.done = false;
    this.page = report.shipped.length || report.notes.length || goals.length ? 0 : 1;
    if (report.total > 0) this.game.jingle('j_ship');
  }
  update(input) {
    this.t++;
    if (this.t > 20 && (input.pressed('a') || input.pressed('b') || input.pressed('start'))) {
      this.page++;
      this.t = 0;
      this.game.sfx('confirm');
      if (this.page > 1) this.done = true;
    }
  }
  draw(r) {
    const text = this.game.text;
    const s = this.play.state;
    r.rect(0, 0, 160, 144, 0.04, 0.05, 0.1, 1);
    if (this.page === 0) {
      drawWindow(r, 4, 4, 152, 136);
      text.center('Shipping Report', 4, 152, 10, 'font_blue');
      let y = 24;
      const rows = this.report.shipped.slice(0, 7);
      for (const it of rows) {
        r.spr(`item_${it.id}`, 12, y - 4);
        text.draw(`${itemName(it.id)} x${it.n}`, 32, y);
        text.draw(`${it.value}G`, 148 - text.measure(`${it.value}G`), y, 'font_gold');
        y += 13;
      }
      if (!rows.length) {
        text.draw('Nothing was shipped.', 12, y, 'font_dim');
        y += 12;
      }
      r.rect(12, y, 136, 1, 0.45, 0.33, 0.2, 1);
      y += 4;
      text.draw('Total', 12, y);
      text.draw(`${this.report.total.toLocaleString('en-US')}G`, 148 - text.measure(`${this.report.total.toLocaleString('en-US')}G`), y, 'font_gold');
      y += 12;
      for (const n of this.report.notes.slice(0, 2)) {
        for (const l of text.wrap(n, 136).slice(0, 2)) {
          text.draw(l, 12, y, 'font_red');
          y += 10;
        }
      }
      for (const g of this.goals.slice(0, 2)) {
        text.draw(`★ ${g.text}`, 12, Math.min(y, 128), 'font_blue');
        y += 10;
      }
    } else {
      const sn = SEASON_NAMES[season(s)];
      text.center(`${sn} ${s.time.day}`, 0, 160, 50, 'font_light');
      text.center(`${weekday(s)} · Year ${s.time.year}`, 0, 160, 62, 'font_dim');
      const f = festivalToday(s);
      if (f) text.center(`Today: ${f.name}!`, 0, 160, 80, 'font_gold');
      const icons = { sun: 'ic_sun', rain: 'ic_rain', storm: 'ic_storm', snow: 'ic_snow', blizzard: 'ic_snow' };
      r.spr(icons[s.weather] ?? 'ic_sun', 76, 94);
    }
    if (this.t > 20 && Math.floor(this.t / 20) % 2 === 0) r.spr('ui_next', 146, 128);
  }
}

class Credits {
  constructor(play) {
    this.play = play;
    this.game = play.game;
    this.t = 0;
    this.done = false;
    this.lines = [
      ['{g}MOONLIT ACRES', 0],
      ['', 0],
      ['Thank you for playing!', 0],
      ['', 0],
      ['{b}A farm reborn', 0],
      [`${play.state.player.name} of Willowmere`, 0],
      ['', 0],
      ['{b}Villagers', 0],
      ...NPC_IDS.map((id) => [`${NPCS[id].name} the ${NPCS[id].title}`, 0]),
      ['Biscuit the dog', 0],
      ['', 0],
      ['{b}Made with', 0],
      ['WebGPU + WebGL2', 0],
      ['Hand-made pixel art', 0],
      ['Synthesised chiptunes', 0],
      ['', 0],
      ['{b}Inspired by the cosy', 0],
      ['farming games of the', 0],
      ['handheld era', 0],
      ['', 0],
      ['{g}The End?', 0],
      ['Your farm awaits...', 0],
    ];
  }
  update(input) {
    this.t++;
    const end = this.lines.length * 12 + 160;
    if (this.t / 1.2 > end || (this.t > 60 && input.pressed('start'))) this.done = true;
  }
  draw(r) {
    r.rect(0, 0, 160, 144, 0.03, 0.04, 0.09, 1);
    const off = 150 - this.t / 1.2;
    this.lines.forEach(([l], i) => {
      const y = off + i * 12;
      if (y < -10 || y > 144) return;
      this.game.text.center(l, 0, 160, Math.round(y), 'font_light');
    });
    for (let k = 0; k < 18; k++) {
      const x = (k * 37 + this.t * (0.2 + (k % 3) * 0.1)) % 160;
      const y = (k * 53) % 144;
      if ((this.t + k * 7) % 50 < 25) r.rect(x, y, 1, 1, 1, 1, 0.8, 0.8);
    }
  }
}

function mix3(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function ordinal(n) {
  return n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
}
