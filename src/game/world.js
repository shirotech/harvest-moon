// Runtime map: collision, queries, pathfinding and rendering.
import { GROUND, GROUND_IDS, G } from './mapbuilder.js';
import { OBJDEFS, BUILDINGS } from './data/objects.js';
import { getMaps } from './data/maps.js';
import { CROP_IDS, DEBRIS, DEBRIS_SPRITES, coopCapacity, barnCapacity } from './state.js';
import { cropSprite } from './data/items.js';
import * as BuildingArt from '../art/buildings.js';

export const T = 16;
const WINDOWS = BuildingArt.BUILDING_WINDOWS ?? {};

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class World {
  constructor(game, state, mapId) {
    this.game = game;
    this.state = state;
    this.map = getMaps()[mapId];
    if (!this.map) throw new Error(`unknown map ${mapId}`);
    this.id = mapId;
    const m = this.map;
    this.w = m.w;
    this.h = m.h;
    this.pw = m.w * T;
    this.ph = m.h * T;
    this.solid = new Uint8Array(m.w * m.h);
    this.cellObj = new Map();
    this.doorAt = new Map();
    this.warpAt = new Map();
    this.objects = [];
    this.lights = [];
    this.isFarm = mapId === 'farm';

    for (let i = 0; i < m.ground.length; i++) if (GROUND[GROUND_IDS[m.ground[i]]].solid) this.solid[i] = 1;

    const r = game.renderer;
    for (const o of m.objects) {
      let def, sprite, fw, fh;
      if (o.name === '$building') {
        def = { building: true };
        sprite = o.sprite;
        fw = o.fw;
        fh = o.fh - 1; // top row is roof overhang you can walk behind
      } else {
        def = OBJDEFS[o.name];
        sprite = def.sprite;
        fw = def.fw ?? 1;
        fh = def.fh ?? 1;
      }
      const [sw, sh] = r.size(sprite);
      const obj = {
        ...o,
        def,
        sprite,
        px: o.x * T,
        py: (o.y + 1) * T - sh,
        sw,
        sh,
        sortY: (o.y + 1) * T - 1,
      };
      this.objects.push(obj);
      if (def.wall || def.flat) {
        if (def.walkOnWater) this.solid[o.y * m.w + o.x] = 0;
        if (def.interact) this.cellObj.set(o.y * m.w + o.x, obj);
        continue;
      }
      for (let yy = o.y; yy > o.y - fh; yy--)
        for (let xx = o.x; xx < o.x + fw; xx++) {
          if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
          const i = yy * m.w + xx;
          if (def.solid !== false) this.solid[i] = 1;
          this.cellObj.set(i, obj);
        }
      if (def.light) this.lights.push({ x: obj.px + def.light.x, y: obj.py + def.light.y, ...def.light });
      if (def.building) {
        for (const [wx, wy] of WINDOWS[sprite] ?? [])
          this.lights.push({ x: obj.px + wx, y: obj.py + wy, r: 14, c: [1, 0.8, 0.45], window: true });
        const b = BUILDINGS[sprite];
        if (b.smoke) obj.smoke = { x: obj.px + b.smoke.x, y: obj.py + b.smoke.y };
      }
    }
    for (const d of m.doors) {
      const i = d.y * m.w + d.x;
      this.doorAt.set(i, d);
      if (d.to) {
        this.solid[i] = 0;
        this.warpAt.set(i, { to: d.to, tx: d.tx, ty: d.ty, dir: d.dir, door: true });
      }
    }
    for (const wp of m.warps) this.warpAt.set(wp.y * m.w + wp.x, wp);
  }

  get outdoor() {
    return !!this.map.outdoor;
  }

  inBounds(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h;
  }

  groundAt(cx, cy) {
    if (!this.inBounds(cx, cy)) return 'void';
    return GROUND_IDS[this.map.ground[cy * this.w + cx]];
  }

  isWater(cx, cy) {
    return this.groundAt(cx, cy) === 'water' && !this.solidOverride(cx, cy);
  }

  solidOverride(cx, cy) {
    const o = this.cellObj.get(cy * this.w + cx);
    return o?.def?.walkOnWater;
  }

  /** Blocking for movement (static map + farm debris). */
  blocked(cx, cy) {
    if (!this.inBounds(cx, cy)) return true;
    const i = cy * this.w + cx;
    if (this.solid[i]) return true;
    if (this.isFarm) {
      const d = this.state.farm.debris[i];
      if (d && d !== DEBRIS.weed) return true;
    }
    return false;
  }

  objectAt(cx, cy) {
    return this.cellObj.get(cy * this.w + cx) ?? null;
  }

  drops() {
    const d = this.state.drops;
    if (!d[this.id]) d[this.id] = [];
    return d[this.id];
  }

  dropAt(cx, cy) {
    return this.drops().find((d) => d.x === cx && d.y === cy) ?? null;
  }

  removeDrop(drop) {
    const list = this.drops();
    const i = list.indexOf(drop);
    if (i >= 0) list.splice(i, 1);
  }

  /** BFS path from cell to cell over walkable cells. Returns list of [cx,cy] (excluding start). */
  path(sx, sy, tx, ty, maxNodes = 4000) {
    if (sx === tx && sy === ty) return [];
    const w = this.w;
    const prev = new Int32Array(this.w * this.h).fill(-1);
    const start = sy * w + sx;
    const goal = ty * w + tx;
    prev[start] = start;
    const q = [start];
    let head = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length && head < maxNodes) {
      const c = q[head++];
      if (c === goal) break;
      const cx = c % w, cy = (c - cx) / w;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny)) continue;
        const n = ny * w + nx;
        if (prev[n] !== -1) continue;
        if (n !== goal && (this.blocked(nx, ny) || this.warpAt.has(n))) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    if (prev[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push([c % w, Math.floor(c / w)]);
    return out.reverse();
  }

  // --- rendering ---------------------------------------------------------------

  groundSprite(cx, cy, g) {
    switch (g) {
      case 'grass':
      case 'block': {
        const h = hash(cx, cy);
        if (h % 23 === 0) return 'grass_flowers';
        return `grass_${h % 7 < 4 ? 0 : (h >>> 3) % 4}`;
      }
      case 'field':
        return 'field';
      case 'path':
        return 'path';
      case 'cobble':
        return 'cobble';
      case 'sand':
        return 'sand';
      case 'bridge_h':
      case 'bridge_v':
        return g;
      case 'water': {
        const land = (x, y) => {
          if (!this.inBounds(x, y)) return false;
          const n = this.groundAt(x, y);
          return n !== 'water' && n !== 'bridge_h' && n !== 'bridge_v';
        };
        const mask = (land(cx, cy - 1) ? 1 : 0) | (land(cx + 1, cy) ? 2 : 0) | (land(cx, cy + 1) ? 4 : 0) | (land(cx - 1, cy) ? 8 : 0);
        return `water_${mask}_${Math.floor(this.game.frame / 40) % 2}`;
      }
      default:
        return GROUND[g]?.sprite ?? null;
    }
  }

  /** Visible cell range for a camera. */
  view(cam) {
    return {
      x0: Math.max(0, Math.floor(cam.x / T)),
      y0: Math.max(0, Math.floor(cam.y / T)),
      x1: Math.min(this.w - 1, Math.floor((cam.x + 160) / T)),
      y1: Math.min(this.h - 1, Math.floor((cam.y + 144) / T) + 2),
    };
  }

  drawGround(r, cam) {
    const { x0, y0, x1, y1 } = this.view(cam);
    const wallPal = this.map.wallPal ?? -1;
    const farm = this.isFarm ? this.state.farm : null;
    for (let cy = y0; cy <= Math.min(y1, this.h - 1); cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const g = this.groundAt(cx, cy);
        if (g === 'void') continue;
        const sx = cx * T - cam.x;
        const sy = cy * T - cam.y;
        if (farm && g === 'field') {
          const i = cy * this.w + cx;
          if (farm.soil[i]) {
            r.spr('tilled', sx, sy, 0, farm.wet[i] ? 'soil_wet' : 'soil');
            continue;
          }
        }
        const s = this.groundSprite(cx, cy, g);
        if (s) r.spr(s, sx, sy, 0, GROUND[g]?.wallPal ? wallPal : -1);
      }
    // flat & wall objects
    for (const o of this.objects) {
      if (!(o.def.flat || o.def.wall)) continue;
      r.spr(o.sprite, o.px - cam.x, o.py - cam.y);
    }
    // items lying on the ground
    for (const d of this.drops()) {
      const sx = d.x * T - cam.x;
      const sy = d.y * T - cam.y;
      if (sx < -16 || sy < -16 || sx > 160 || sy > 144) continue;
      r.spr(`item_${d.id}`, sx, sy - (d.forage ? 0 : 1));
      if (d.forage && (this.game.frame + d.x * 13) % 120 < 18)
        r.spr(`fx_sparkle_${Math.floor(((this.game.frame + d.x * 13) % 120) / 6)}`, sx + 10, sy - 2);
    }
  }

  /** Push y-sorted drawables for objects, debris and crops into `list`. */
  collectSorted(list, cam) {
    const { x0, y0, x1, y1 } = this.view(cam);
    const f = this.game.frame;
    for (const o of this.objects) {
      if (o.def.flat || o.def.wall) continue;
      if (o.px - cam.x > 160 || o.px + o.sw - cam.x < 0 || o.py - cam.y > 144 || o.py + o.sh - cam.y < 0) continue;
      let sprite = o.sprite;
      if (o.def.anim) sprite = o.def.anim[Math.floor(f / (o.def.animRate ?? 20)) % o.def.anim.length];
      if (o.name === 'trough') {
        const cap = o.kind === 'chicken' ? coopCapacity(this.state) : barnCapacity(this.state);
        if (o.slot >= cap) continue;
        const filled = o.kind === 'chicken' ? this.state.coopFeed : this.state.barnFeed;
        sprite = o.slot < filled ? 'trough_full' : 'trough_empty';
      }
      list.push({
        y: o.sortY,
        draw: (r) => {
          r.spr(sprite, o.px - cam.x, o.py - cam.y);
          const ov = o.def.overlay;
          if (ov) r.spr(ov.anim[Math.floor(f / ov.rate) % ov.anim.length], o.px + ov.x - cam.x, o.py + ov.y - cam.y);
        },
      });
    }
    if (!this.isFarm) return;
    const farm = this.state.farm;
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * this.w + cx;
        const d = farm.debris[i];
        const c = farm.crop[i];
        if (d && DEBRIS_SPRITES[d]) {
          const s = DEBRIS_SPRITES[d];
          const [, sh] = this.game.renderer.size(s);
          const sx = cx * T - cam.x;
          const sy = (cy + 1) * T - sh - cam.y;
          list.push({ y: (cy + 1) * T - 1, draw: (r) => r.spr(s, sx, sy) });
        }
        if (c) {
          const s = cropSprite(CROP_IDS[c - 1], farm.age[i], farm.dead[i]);
          const [, sh] = this.game.renderer.size(s);
          const sx = cx * T - cam.x;
          const sy = (cy + 1) * T - sh - cam.y;
          list.push({ y: (cy + 1) * T - 2, draw: (r) => r.spr(s, sx, sy) });
        }
      }
  }
}
