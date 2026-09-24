// Particle effects, weather and ambient life (all drawn as GPU sprite instances).
import { FLIP_X } from '../engine/renderer.js';

export class Effects {
  constructor() {
    this.list = [];
  }

  /** Animated sprite sequence at a world position. */
  anim(prefix, frames, x, y, rate = 5, opts = {}) {
    this.list.push({ kind: 'anim', prefix, frames, x, y, rate, t: 0, life: frames * rate, ...opts });
  }

  /** A single physics particle. */
  particle(sprite, x, y, vx, vy, life = 30, opts = {}) {
    this.list.push({ kind: 'p', sprite, x, y, vx, vy, g: opts.g ?? 0.12, life, t: 0, ...opts });
  }

  /** Floating icon (heart, note, !) that rises and fades. */
  float(sprite, x, y, life = 50) {
    this.list.push({ kind: 'float', sprite, x, y, life, t: 0 });
  }

  /** Floating text (e.g. "+4") */
  text(str, x, y, pal = 'font_light', life = 60) {
    this.list.push({ kind: 'text', str, x, y, pal, life, t: 0 });
  }

  burst(kind, x, y) {
    switch (kind) {
      case 'dust':
        this.anim('fx_dust', 3, x - 8, y - 12, 5);
        break;
      case 'water':
        this.anim('fx_water', 3, x - 8, y - 14, 6);
        break;
      case 'grass':
        this.anim('fx_grass', 2, x - 8, y - 12, 6);
        for (let k = 0; k < 3; k++) this.particle('fx_leaf', x - 2, y - 8, (Math.random() - 0.5) * 1.6, -1.2 - Math.random(), 32);
        break;
      case 'chip':
        this.anim('fx_chip', 2, x - 8, y - 12, 6);
        break;
      case 'wood':
        this.anim('fx_wood', 2, x - 8, y - 12, 6);
        break;
      case 'splash':
        this.anim('fx_ripple', 3, x - 8, y - 6, 7);
        break;
      case 'sparkle':
        this.anim('fx_sparkle', 3, x - 4, y - 4, 5);
        break;
    }
  }

  update() {
    for (const e of this.list) {
      e.t++;
      if (e.kind === 'p') {
        e.vy += e.g;
        e.x += e.vx;
        e.y += e.vy;
      } else if (e.kind === 'float' || e.kind === 'text') e.y -= 0.35;
    }
    this.list = this.list.filter((e) => e.t < e.life);
  }

  draw(r, cam, text) {
    for (const e of this.list) {
      const x = e.x - cam.x, y = e.y - cam.y;
      switch (e.kind) {
        case 'anim':
          r.spr(`${e.prefix}_${Math.min(e.frames - 1, Math.floor(e.t / e.rate))}`, x, y, e.flip ?? 0);
          break;
        case 'p':
          r.spr(e.sprite, x, y, 0, -1, Math.min(1, (e.life - e.t) / 10));
          break;
        case 'float':
          r.spr(e.sprite, x, y, 0, -1, Math.min(1, (e.life - e.t) / 15));
          break;
        case 'text':
          text.draw(e.str, x, y, e.pal, Math.min(1, (e.life - e.t) / 15));
          break;
      }
    }
  }
}

/** Rain / snow / petals / leaves / fireflies, in screen space with parallax against the camera. */
export class Weather {
  constructor() {
    this.parts = [];
    this.kind = null;
    this.flash = 0;
    this.nextThunder = 400;
  }

  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.parts = [];
  }

  update(game, cam) {
    const k = this.kind;
    const target = { rain: 70, storm: 120, snow: 50, blizzard: 130, petals: 10, leaves: 10, fireflies: 14 }[k] ?? 0;
    while (this.parts.length < target) this.parts.push(this.spawn(k, true));
    if (this.parts.length > target) this.parts.length = target;
    for (const p of this.parts) {
      p.t++;
      p.x += p.vx;
      p.y += p.vy;
      if (k === 'snow' || k === 'blizzard' || k === 'petals' || k === 'leaves') p.x += Math.sin((p.t + p.ph) / 20) * 0.3;
      if (k === 'fireflies') {
        p.vx += (Math.random() - 0.5) * 0.04;
        p.vy += (Math.random() - 0.5) * 0.04;
        p.vx = Math.max(-0.3, Math.min(0.3, p.vx));
        p.vy = Math.max(-0.3, Math.min(0.3, p.vy));
      }
      if (p.y > 150 || p.x < -10 || p.x > 170 || p.t > p.life) Object.assign(p, this.spawn(k, false));
    }
    if (this.flash > 0) this.flash--;
    if (k === 'storm' && --this.nextThunder <= 0) {
      this.nextThunder = 360 + Math.floor(Math.random() * 600);
      this.flash = 14;
      game.sfx('thunder');
    }
    this.lastCam = cam;
  }

  spawn(k, initial) {
    const p = { t: 0, ph: Math.random() * 100, life: 9999 };
    p.x = Math.random() * 180 - 10;
    p.y = initial ? Math.random() * 144 : -8;
    switch (k) {
      case 'rain':
      case 'storm':
        p.vx = k === 'storm' ? -1.6 : -0.8;
        p.vy = k === 'storm' ? 5 : 4;
        p.life = 24 + Math.random() * 30;
        break;
      case 'snow':
        p.vx = -0.15;
        p.vy = 0.4 + Math.random() * 0.4;
        p.big = Math.random() < 0.4;
        break;
      case 'blizzard':
        p.vx = -1.8 - Math.random();
        p.vy = 0.8 + Math.random() * 0.8;
        p.big = Math.random() < 0.5;
        if (!initial) p.x = 150 + Math.random() * 20;
        if (!initial) p.y = Math.random() * 144;
        break;
      case 'petals':
      case 'leaves':
        p.vx = -0.3 - Math.random() * 0.3;
        p.vy = 0.3 + Math.random() * 0.3;
        break;
      case 'fireflies':
        p.y = Math.random() * 144;
        p.vx = 0;
        p.vy = 0;
        p.life = 300 + Math.random() * 300;
        break;
    }
    return p;
  }

  draw(r, frame) {
    const k = this.kind;
    for (const p of this.parts) {
      switch (k) {
        case 'rain':
        case 'storm':
          if (p.t < p.life - 6) r.spr('fx_rain', p.x, p.y, 0, -1, 0.8);
          else r.spr(`fx_splash_${p.t % 6 < 3 ? 0 : 1}`, p.x - 2, p.y + 4, 0, -1, 0.8);
          break;
        case 'snow':
        case 'blizzard':
          r.spr(p.big ? 'fx_snow_1' : 'fx_snow_0', p.x, p.y);
          break;
        case 'petals':
          r.spr('fx_petal', p.x, p.y, (p.t >> 4) & 1 ? FLIP_X : 0);
          break;
        case 'leaves':
          r.spr('fx_leaf', p.x, p.y, (p.t >> 4) & 1 ? FLIP_X : 0);
          break;
        case 'fireflies': {
          const glow = 0.5 + 0.5 * Math.sin((frame + p.ph * 10) / 18);
          r.rect(p.x, p.y, 1, 1, 0.9, 1, 0.5, glow);
          r.light(p.x + 0.5, p.y + 0.5, 7, 0.7, 0.9, 0.3, glow * 0.8);
          break;
        }
      }
    }
  }
}
