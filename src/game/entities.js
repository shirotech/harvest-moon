// Characters that move around: player, villagers, animals, the farm dog.
import { FLIP_X } from '../engine/renderer.js';
import { T } from './world.js';

export const DIRS = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function dirTo(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Sprite name + flags for a standard 3-direction, 2-frame character sheet. */
export function charFrame(prefix, dir, moving, t, pose = 'walk') {
  const view = dir === 'left' || dir === 'right' ? 'side' : dir;
  let frame = 0;
  let flip = dir === 'left' ? FLIP_X : 0;
  if (moving) {
    const step = Math.floor(t / 9) % 4;
    if (view === 'side') frame = step % 2;
    else {
      frame = step % 2;
      if (step === 3) flip ^= FLIP_X;
    }
  }
  const p = pose ? `${prefix}_${pose}` : prefix;
  return { name: `${p}_${view}_${frame}`, flip };
}

/** Axis-separated movement with tile collision and corner sliding. */
export function moveBody(world, body, dx, dy, blockers = []) {
  const hw = body.hw ?? 5;
  const hh = body.hh ?? 5;
  const hit = (x, y) => {
    const x0 = Math.floor((x - hw) / T), x1 = Math.floor((x + hw - 0.01) / T);
    const y0 = Math.floor((y - hh) / T), y1 = Math.floor((y - 0.01) / T);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (world.blocked(cx, cy)) return true;
    for (const b of blockers) {
      if (b === body) continue;
      const bw = b.hw ?? 5, bh = b.hh ?? 5;
      if (x - hw < b.x + bw && x + hw > b.x - bw && y - hh < b.y && y > b.y - bh) return true;
    }
    return x - hw < 0 || y - hh < 0 || x + hw > world.pw || y > world.ph;
  };
  let moved = false;
  if (dx) {
    if (!hit(body.x + dx, body.y)) {
      body.x += dx;
      moved = true;
    } else if (!dy && body.slide !== false) {
      for (const s of [1, -1])
        for (let k = 1; k <= 6; k++)
          if (!hit(body.x + dx, body.y + s * k)) {
            if (!hit(body.x, body.y + s)) {
              body.y += s * Math.min(1, Math.abs(dx));
              moved = true;
            }
            return moved;
          }
    }
  }
  if (dy) {
    if (!hit(body.x, body.y + dy)) {
      body.y += dy;
      moved = true;
    } else if (!dx && body.slide !== false) {
      for (const s of [1, -1])
        for (let k = 1; k <= 6; k++)
          if (!hit(body.x + s * k, body.y + dy)) {
            if (!hit(body.x + s, body.y)) {
              body.x += s * Math.min(1, Math.abs(dy));
              moved = true;
            }
            return moved;
          }
    }
  }
  return moved;
}

export class Player {
  constructor(play) {
    this.play = play;
    const p = play.state.player;
    this.x = p.x * T + 8;
    this.y = p.y * T + 14;
    this.dir = p.dir ?? 'down';
    this.hw = 5;
    this.hh = 5;
    this.t = 0;
    this.moving = false;
    this.action = null; // { kind:'tool'|'charge'|'fish'|'pose', t, ... }
    this.lastCell = this.cell();
  }

  get prefix() {
    return this.play.state.player.gender === 'girl' ? 'girl' : 'boy';
  }

  cell() {
    return [Math.floor(this.x / T), Math.floor((this.y - 2) / T)];
  }

  front() {
    const [cx, cy] = this.cell();
    const d = DIRS[this.dir];
    return [cx + d.x, cy + d.y];
  }

  placeAt(cx, cy, dir) {
    this.x = cx * T + 8;
    this.y = cy * T + 14;
    if (dir) this.dir = dir;
    this.lastCell = this.cell();
  }

  frame() {
    const s = this.play.state;
    if (this.action?.kind === 'pose') return { name: `${this.prefix}_${this.action.pose}`, flip: 0 };
    if (this.action && (this.action.kind === 'tool' || this.action.kind === 'charge' || this.action.kind === 'fish')) {
      const view = this.dir === 'left' || this.dir === 'right' ? 'side' : this.dir;
      const f = this.action.kind === 'charge' ? 0 : this.action.kind === 'fish' ? 1 : this.action.t < 8 ? 0 : 1;
      return { name: `${this.prefix}_use_${view}_${f}`, flip: this.dir === 'left' ? FLIP_X : 0, useFrame: f, view };
    }
    return charFrame(this.prefix, this.dir, this.moving, this.t, s.carrying ? 'carry' : 'walk');
  }
}

export class NPC {
  constructor(play, id, def) {
    this.play = play;
    this.id = id;
    this.def = def;
    this.x = 0;
    this.y = 0;
    this.dir = 'down';
    this.hw = 5;
    this.hh = 5;
    this.t = 0;
    this.path = null;
    this.moving = false;
    this.speed = 0.75;
    this.wait = 60 + Math.floor(Math.random() * 120);
    this.target = null;
    this.leaving = null;
    this.talkFace = 0;
  }

  cell() {
    return [Math.floor(this.x / T), Math.floor((this.y - 2) / T)];
  }

  placeAt(cx, cy, dir = 'down') {
    this.x = cx * T + 8;
    this.y = cy * T + 14;
    this.dir = dir;
  }

  walkTo(world, cx, cy) {
    const [sx, sy] = this.cell();
    const p = world.path(sx, sy, cx, cy);
    this.path = p;
    return !!p;
  }

  update(world, blockers) {
    this.t++;
    if (this.talkFace > 0) {
      this.talkFace--;
      this.moving = false;
      return;
    }
    if (this.path && this.path.length) {
      const [nx, ny] = this.path[0];
      const tx = nx * T + 8, ty = ny * T + 14;
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= this.speed) {
        this.x = tx;
        this.y = ty;
        this.path.shift();
      } else {
        const mx = (dx / d) * this.speed, my = (dy / d) * this.speed;
        this.dir = dirTo(dx, dy);
        const player = this.play.player;
        const px = this.x + mx, py = this.y + my;
        const blockedByPlayer = Math.abs(px - player.x) < 10 && Math.abs(py - player.y) < 7;
        if (!blockedByPlayer) {
          this.x = px;
          this.y = py;
          this.stuck = 0;
        } else if (++this.stuck > 120) {
          // step around the player by re-pathing through them next time
          this.x = px;
          this.y = py;
        }
      }
      this.moving = true;
      if (!this.path.length) {
        this.path = null;
        this.moving = false;
        if (this.target && !this.leaving) this.dir = this.target.dir ?? this.dir;
        this.onArrive?.();
      }
      return;
    }
    this.moving = false;
    if (this.target?.wander && --this.wait <= 0) {
      this.wait = 90 + Math.floor(Math.random() * 180);
      const w = this.target.wander;
      const cx = this.target.cx + Math.round((Math.random() * 2 - 1) * w);
      const cy = this.target.cy + Math.round((Math.random() * 2 - 1) * w);
      if (world.inBounds(cx, cy) && !world.blocked(cx, cy) && !world.warpAt.has(cy * world.w + cx)) this.walkTo(world, cx, cy);
    }
  }

  frame() {
    return charFrame(this.def.sprite, this.dir, this.moving, this.t, null);
  }
}

/** Chickens and cows wandering inside their building. */
export class Animal {
  constructor(play, data, pen, x, y) {
    this.play = play;
    this.data = data;
    this.kind = data.kind;
    this.pen = pen;
    this.x = x;
    this.y = y;
    this.dir = 'down';
    this.t = Math.floor(Math.random() * 100);
    this.moving = false;
    this.goal = null;
    this.wait = 30 + Math.floor(Math.random() * 120);
    this.hw = this.kind === 'cow' ? 10 : 5;
    this.hh = this.kind === 'cow' ? 8 : 5;
    this.heart = 0;
    this.slide = false;
  }

  update(world, blockers) {
    this.t++;
    if (this.heart > 0) this.heart--;
    if (this.goal) {
      const dx = this.goal[0] - this.x, dy = this.goal[1] - this.y;
      const d = Math.hypot(dx, dy);
      const sp = this.kind === 'cow' ? 0.35 : 0.5;
      if (d < 1) {
        this.goal = null;
        this.moving = false;
      } else {
        this.dir = dirTo(dx, dy);
        this.moving = moveBody(world, this, (dx / d) * sp, (dy / d) * sp, blockers);
        if (!this.moving) this.goal = null;
      }
      return;
    }
    if (--this.wait <= 0) {
      this.wait = 60 + Math.floor(Math.random() * 200);
      const p = this.pen;
      this.goal = [(p.x + Math.random() * p.w) * T, (p.y + 0.9 + Math.random() * (p.h - 0.2)) * T];
    }
  }

  frame() {
    if (this.kind === 'chicken') {
      if (!this.moving && this.t % 600 > 420) return { name: 'chicken_sit', flip: 0 };
      return charFrame('chicken', this.dir, this.moving, this.t, null);
    }
    const view = this.dir === 'left' || this.dir === 'right' ? 'side' : this.dir;
    const f = this.moving ? Math.floor(this.t / 16) % 2 : 0;
    return { name: `cow_${view}_${f}`, flip: this.dir === 'left' ? FLIP_X : 0 };
  }
}

export class Dog {
  constructor(play, cx, cy) {
    this.play = play;
    this.x = cx * T + 8;
    this.y = cy * T + 14;
    this.dir = 'down';
    this.t = 0;
    this.goal = null;
    this.wait = 60;
    this.hw = 5;
    this.hh = 4;
    this.heart = 0;
    this.sitting = false;
    this.slide = false;
  }

  update(world, blockers) {
    this.t++;
    if (this.heart > 0) this.heart--;
    const pl = this.play.player;
    if (this.goal) {
      const dx = this.goal[0] - this.x, dy = this.goal[1] - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) this.goal = null;
      else {
        this.dir = dirTo(dx, dy);
        this.sitting = false;
        this.moving = moveBody(world, this, (dx / d) * 0.9, (dy / d) * 0.9, blockers);
        if (!this.moving) this.goal = null;
      }
      return;
    }
    this.moving = false;
    if (--this.wait <= 0) {
      this.wait = 90 + Math.floor(Math.random() * 200);
      const r = Math.random();
      const near = Math.hypot(pl.x - this.x, pl.y - this.y) < 120;
      if (r < 0.35 && near) this.goal = [pl.x + (Math.random() * 40 - 20), pl.y + (Math.random() * 30 - 10)];
      else if (r < 0.75) this.goal = [this.x + (Math.random() * 96 - 48), this.y + (Math.random() * 64 - 32)];
      else this.sitting = true;
    }
  }

  frame() {
    if (this.sitting) return { name: 'dog_sit', flip: 0 };
    return charFrame('dog', this.dir, this.moving, this.t, null);
  }
}
