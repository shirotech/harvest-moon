// Declarative helpers for authoring maps in code.

import { OBJDEFS, BUILDINGS } from './data/objects.js';

// Ground types. `solid` blocks walking, `water` allows fishing/refilling.
export const GROUND = {
  void: { solid: true },
  grass: {},
  block: { solid: true, draw: 'grass' }, // grass under dense border trees
  field: { farm: true },
  path: {},
  cobble: {},
  sand: {},
  water: { solid: true, water: true },
  bridge_h: {},
  bridge_v: {},
  wood: { sprite: 'floor_wood' },
  stone: { sprite: 'floor_stone' },
  hay: { sprite: 'floor_hay' },
  wall: { solid: true, sprite: 'wall_top', wallPal: true },
  wall_low: { solid: true, sprite: 'wall_low', wallPal: true },
  wwall: { solid: true, sprite: 'wall_wood_top' },
  wwall_low: { solid: true, sprite: 'wall_wood_low' },
  window: { solid: true, sprite: 'window_int' },
  mat: { sprite: 'doormat' },
};
export const GROUND_IDS = Object.keys(GROUND);
export const G = Object.fromEntries(GROUND_IDS.map((k, i) => [k, i]));

export class MapBuilder {
  constructor(id, w, h, ground = 'grass', props = {}) {
    this.id = id;
    this.w = w;
    this.h = h;
    this.ground = new Uint8Array(w * h).fill(G[ground]);
    this.objects = [];
    this.warps = [];
    this.doors = [];
    this.spots = {};
    this.props = props;
  }

  set(x, y, g) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    if (G[g] === undefined) throw new Error(`unknown ground ${g}`);
    this.ground[y * this.w + x] = G[g];
    return this;
  }

  fill(x, y, w, h, g) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, g);
    return this;
  }

  get(x, y) {
    return GROUND_IDS[this.ground[y * this.w + x]];
  }

  /** Paint ground from ASCII rows starting at (x0,y0) using a legend. */
  ascii(x0, y0, rows, legend) {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const g = legend[ch];
        if (g) this.set(x0 + x, y0 + y, g);
      });
    });
    return this;
  }

  obj(name, x, y, extra = {}) {
    if (!OBJDEFS[name]) throw new Error(`unknown object ${name}`);
    this.objects.push({ name, x, y, ...extra });
    return this;
  }

  /** Place several objects of one kind. */
  objs(name, points) {
    for (const [x, y] of points) this.obj(name, x, y);
    return this;
  }

  /** Building anchored at bottom-left cell (x,y). door: {to, tx, ty, dir} or {locked: 'text'}. */
  building(sprite, x, y, door) {
    const b = BUILDINGS[sprite];
    if (!b) throw new Error(`unknown building ${sprite}`);
    this.objects.push({ name: '$building', sprite, x, y, fw: b.w, fh: b.h });
    const dx = x + b.door;
    this.doors.push({ x: dx, y, ...door });
    return this;
  }

  warp(x, y, to, tx, ty, dir) {
    this.warps.push({ x, y, to, tx, ty, dir });
    return this;
  }

  spot(name, x, y, dir = 'down') {
    this.spots[name] = { x, y, dir };
    return this;
  }

  /** Line a border with trees, leaving gaps. side: top|bottom|left|right. */
  treeline(side, kind = 'pine', gaps = [], depth = 3) {
    const { w, h } = this;
    const inGap = (v) => gaps.some(([a, b]) => v >= a && v <= b);
    if (side === 'top' || side === 'bottom') {
      const y0 = side === 'top' ? 0 : h - depth;
      for (let x = 0; x < w; x++) if (!inGap(x)) this.fill(x, y0, 1, depth, 'block');
      for (let x = 0; x < w; x += 2) {
        if (inGap(x) || inGap(x + 1)) continue;
        this.obj(kind, x, side === 'top' ? depth - 1 : h - 1);
        if (side === 'bottom' && depth > 3) this.obj(kind, x, h - 1 - 2);
      }
    } else {
      const x0 = side === 'left' ? 0 : w - 2;
      for (let y = 0; y < h; y++) if (!inGap(y)) this.fill(x0, y, 2, 1, 'block');
      for (let y = depth + 2; y < h; y += 3) {
        if (inGap(y) || inGap(y - 1) || inGap(y - 2)) continue;
        this.obj(kind, x0, y);
      }
    }
    return this;
  }

  build() {
    return {
      id: this.id,
      w: this.w,
      h: this.h,
      ground: this.ground,
      objects: this.objects,
      warps: this.warps,
      doors: this.doors,
      spots: this.spots,
      ...this.props,
    };
  }
}
