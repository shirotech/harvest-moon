// Backend-agnostic 2D renderer.
//
// Frame structure (all on the GPU):
//   1. world pass  -> 160x144 RGBA target (indexed sprites, palette lookup in shader)
//   2. light pass  -> 160x144 RGBA target cleared to the ambient colour, lights added
//   3. ui pass     -> 160x144 RGBA target (premultiplied alpha, transparent)
//   4. composite   -> canvas: world * light, UI over it, sharp-bilinear upscale,
//                     optional LCD grid and colour grading.
//
// Every sprite is one instance of a 6-vertex quad; each pass is a single
// instanced draw call.

import { WebGPUBackend } from './gpu-webgpu.js';
import { WebGL2Backend } from './gpu-webgl2.js';

export const SCREEN_W = 160;
export const SCREEN_H = 144;

export const FLIP_X = 1;
export const FLIP_Y = 2;
export const SOLID = 4;
export const LIGHT = 8;

export const FLOATS_PER_INSTANCE = 16;

class Batch {
  constructor(cap = 1024) {
    this.f = new Float32Array(cap * FLOATS_PER_INSTANCE);
    this.n = 0;
  }
  reserve() {
    if ((this.n + 1) * FLOATS_PER_INSTANCE > this.f.length) {
      const g = new Float32Array(this.f.length * 2);
      g.set(this.f);
      this.f = g;
    }
    return this.n++ * FLOATS_PER_INSTANCE;
  }
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ReturnType<import('./atlas.js').AtlasBuilder['build']>} atlas
   */
  static async create(canvas, atlas, opts = {}) {
    let backend = null;
    const errors = [];
    if (opts.backend !== 'webgl2' && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        backend = await WebGPUBackend.create(canvas, atlas);
      } catch (e) {
        errors.push(`WebGPU: ${e.message ?? e}`);
        backend = null;
      }
    }
    if (!backend) {
      // A canvas that had a WebGPU context requested cannot switch to WebGL,
      // so the caller may hand us a fresh canvas via opts.fallbackCanvas().
      const glCanvas = errors.length && opts.fallbackCanvas ? opts.fallbackCanvas() : canvas;
      try {
        backend = WebGL2Backend.create(glCanvas, atlas);
      } catch (e) {
        errors.push(`WebGL2: ${e.message ?? e}`);
      }
    }
    if (!backend) throw new Error(`No GPU renderer available.\n${errors.join('\n')}`);
    return new Renderer(backend, atlas, errors);
  }

  constructor(backend, atlas, warnings = []) {
    this.backend = backend;
    this.atlas = atlas;
    this.warnings = warnings;
    this.sprites = atlas.sprites;
    this.palIndex = atlas.palIndex;
    this.palRows = atlas.palRows.slice();
    this.world = new Batch(2048);
    this.lights = new Batch(256);
    this.ui = new Batch(2048);
    this.layer = this.world;
    this.ambient = [1, 1, 1];
    this.post = { lcd: 0, colorMode: 0, time: 0 };
    this.stats = { instances: 0, drawCalls: 0, frameMs: 0 };
    this._palDirty = false;
    this._missing = new Set();
  }

  get name() {
    return this.backend.name;
  }

  // --- palettes -----------------------------------------------------------

  pal(name) {
    const p = this.palIndex[name];
    if (p === undefined) {
      if (!this._missing.has(name)) {
        this._missing.add(name);
        console.warn(`unknown palette ${name}`);
      }
      return 0;
    }
    return p;
  }

  /** Copy all `<base>@<season>` palette rows into their `<base>` rows. */
  applySeason(season) {
    const rows = this.atlas.palRows;
    for (const [name, row] of Object.entries(this.palIndex)) {
      if (name.includes('@')) continue;
      const src = this.palIndex[`${name}@${season}`];
      if (src === undefined) continue;
      this.palRows.set(rows.subarray(src * 32, src * 32 + 32), row * 32);
    }
    this._palDirty = true;
  }

  /** Override one palette row at runtime (8 RGBA colours). */
  setPalette(name, rgbaList) {
    const row = this.palIndex[name];
    if (row === undefined) return;
    rgbaList.forEach((c, i) => this.palRows.set(c, (row * 8 + i) * 4));
    this._palDirty = true;
  }

  // --- drawing ------------------------------------------------------------

  useWorld() {
    this.layer = this.world;
  }
  useUI() {
    this.layer = this.ui;
  }

  has(name) {
    return name in this.sprites;
  }

  size(name) {
    const s = this.sprites[name];
    return s ? [s.w, s.h] : [0, 0];
  }

  /**
   * Draw an atlas sprite at integer position.
   * @param {string} name
   * @param {number} x
   * @param {number} y
   * @param {number} [flags] FLIP_X | FLIP_Y
   * @param {string|number} [pal] palette name or row (defaults to the sprite's palette)
   * @param {number} [alpha]
   * @param {number} [scale]
   */
  spr(name, x, y, flags = 0, pal = -1, alpha = 1, scale = 1, tr = 1, tg = 1, tb = 1) {
    const s = this.sprites[name];
    if (!s) {
      if (!this._missing.has(name)) {
        this._missing.add(name);
        console.warn(`missing sprite ${name}`);
      }
      return;
    }
    const b = this.layer;
    const o = b.reserve();
    const f = b.f;
    f[o] = Math.round(x);
    f[o + 1] = Math.round(y);
    f[o + 2] = s.w * scale;
    f[o + 3] = s.h * scale;
    f[o + 4] = s.x;
    f[o + 5] = s.y;
    f[o + 6] = typeof pal === 'string' ? this.pal(pal) : pal < 0 ? s.pal : pal;
    f[o + 7] = flags & 3;
    f[o + 8] = tr;
    f[o + 9] = tg;
    f[o + 10] = tb;
    f[o + 11] = alpha;
    f[o + 12] = s.w;
    f[o + 13] = s.h;
  }

  /** Draw a sub-rectangle of a sprite (used for 9-slice stretching and bars). */
  sprPart(name, sx, sy, sw, sh, x, y, w = sw, h = sh, pal = -1, alpha = 1) {
    const s = this.sprites[name];
    if (!s) return;
    const b = this.layer;
    const o = b.reserve();
    const f = b.f;
    f[o] = Math.round(x);
    f[o + 1] = Math.round(y);
    f[o + 2] = w;
    f[o + 3] = h;
    f[o + 4] = s.x + sx;
    f[o + 5] = s.y + sy;
    f[o + 6] = typeof pal === 'string' ? this.pal(pal) : pal < 0 ? s.pal : pal;
    f[o + 7] = 0;
    f[o + 8] = 1;
    f[o + 9] = 1;
    f[o + 10] = 1;
    f[o + 11] = alpha;
    f[o + 12] = sw;
    f[o + 13] = sh;
  }

  /** Solid colour rectangle (colour components 0..1). */
  rect(x, y, w, h, r, g, b, a = 1) {
    const bt = this.layer;
    const o = bt.reserve();
    const f = bt.f;
    f[o] = Math.round(x);
    f[o + 1] = Math.round(y);
    f[o + 2] = w;
    f[o + 3] = h;
    f[o + 4] = 0;
    f[o + 5] = 0;
    f[o + 6] = 0;
    f[o + 7] = SOLID;
    f[o + 8] = r;
    f[o + 9] = g;
    f[o + 10] = b;
    f[o + 11] = a;
    f[o + 12] = 1;
    f[o + 13] = 1;
  }

  /** Additive radial light centred at (x,y) in screen pixels. */
  light(x, y, radius, r, g, b, intensity = 1) {
    const bt = this.lights;
    const o = bt.reserve();
    const f = bt.f;
    f[o] = x - radius;
    f[o + 1] = y - radius;
    f[o + 2] = radius * 2;
    f[o + 3] = radius * 2;
    f[o + 4] = 0;
    f[o + 5] = 0;
    f[o + 6] = 0;
    f[o + 7] = LIGHT;
    f[o + 8] = r;
    f[o + 9] = g;
    f[o + 10] = b;
    f[o + 11] = intensity;
    f[o + 12] = 1;
    f[o + 13] = 1;
  }

  begin() {
    this.world.n = 0;
    this.lights.n = 0;
    this.ui.n = 0;
    this.layer = this.world;
  }

  end() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this._palDirty) {
      this.backend.uploadPalettes(this.palRows);
      this._palDirty = false;
    }
    this.backend.render({
      world: this.world,
      lights: this.lights,
      ui: this.ui,
      ambient: this.ambient,
      post: this.post,
    });
    this.stats.instances = this.world.n + this.lights.n + this.ui.n;
    this.stats.drawCalls = 4;
    if (t0) this.stats.frameMs = performance.now() - t0;
  }

  resize(w, h) {
    this.backend.resize(w, h);
  }
}
