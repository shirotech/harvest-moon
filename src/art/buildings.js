// Art module: buildings. See docs/ART_GUIDE.md for the sprite contract.
//
// Village exteriors in a 3/4 top-down view: the roof is seen from above and
// fills roughly the top half, the front wall (door + windows) sits below.
// Every building is composed from the shared helpers in this file so the set
// reads as one village. Each building has its own palette (<= 6 colours),
// index 1 is always the shared outline.
//
// Doors are 16 px wide and sit in the bottom tile row at the column listed in
// the art guide; their bottom rows are a light step so they read as walkable.

const O = 1; // outline index

// ---------------------------------------------------------------------------
// Window layout (x, y, w, h) per building. Used both to paint the windows and
// to publish BUILDING_WINDOWS (pixel centres, for the night-time glow).
// ---------------------------------------------------------------------------
const WIN = {
  bld_house: [[5, 38, 7, 9], [39, 37, 13, 11], [26, 16, 7, 7]],
  bld_barn: [[9, 42, 9, 9], [62, 42, 9, 9]],
  bld_coop: [[4, 27, 9, 7], [35, 27, 9, 7]],
  bld_store: [[4, 38, 9, 11], [35, 38, 23, 13]],
  bld_ranch: [[6, 38, 13, 11], [51, 37, 9, 9]],
  bld_smithy: [[37, 38, 13, 11]],
  bld_inn: [[7, 25, 9, 9], [23, 25, 9, 9], [48, 25, 9, 9], [64, 25, 9, 9], [6, 47, 13, 9], [62, 47, 11, 9]],
  bld_mayor: [[5, 35, 9, 13], [18, 35, 9, 13], [53, 35, 7, 13], [10, 12, 7, 7], [47, 12, 7, 7]],
  bld_cottage_a: [[4, 32, 9, 9], [35, 32, 9, 9], [21, 13, 6, 6]],
  bld_cottage_b: [[4, 31, 9, 10], [35, 31, 9, 10]],
  bld_cabin: [[4, 30, 9, 9], [35, 30, 9, 9]],
};

export const BUILDING_WINDOWS = Object.fromEntries(
  Object.entries(WIN).map(([k, list]) => [k, list.map(([x, y, w, h]) => [x + (w >> 1), y + (h >> 1)])]),
);

// ---------------------------------------------------------------------------
// Palettes: 1 outline, 2 roof dark, 3 roof light, 4 wall dark, 5 wall light,
// 6 accent (glass / trim). Channel values are multiples of 8.
// ---------------------------------------------------------------------------
const PALS = {
  bld_house: ['#181010', '#a03830', '#d86848', '#986038', '#f0d8a8', '#88c0e8'],
  bld_barn: ['#181010', '#585060', '#8888a0', '#983020', '#c85030', '#f0e8d8'],
  bld_coop: ['#181010', '#983828', '#d06040', '#a89880', '#f0e8d0', '#f0b840'],
  bld_store: ['#181010', '#306838', '#58a048', '#985830', '#e8c890', '#f8f0e0'],
  bld_ranch: ['#181010', '#284878', '#4878b8', '#885028', '#c88848', '#f0e8d0'],
  bld_smithy: ['#181010', '#404050', '#687088', '#807068', '#b8b0a0', '#f09838'],
  bld_inn: ['#181010', '#683048', '#a05068', '#704828', '#f0e0b8', '#f8c048'],
  bld_mayor: ['#181010', '#283868', '#4870b0', '#a04030', '#d07050', '#f8f0e0'],
  bld_cottage_a: ['#181010', '#286878', '#48a0a8', '#b88838', '#f0d878', '#f8f8e8'],
  bld_cottage_b: ['#181010', '#a06828', '#e0b050', '#b86878', '#f0b8b8', '#78b0d8'],
  bld_cabin: ['#181010', '#385830', '#608840', '#784820', '#b87838', '#e0b878'],
};

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
const mod = (a, n) => ((a % n) + n) % n;
const lerp = (a, b, t) => a + (b - a) * t;

/** Fill a rectangle with a pattern fn(x, y) -> index (absolute coords). */
function rectP(g, x, y, w, h, pat) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const v = typeof pat === 'function' ? pat(xx, yy) : pat;
      if (v) g.px(xx, yy, v);
    }
}

/** Fill rows y0..y1 between span(y) = [xa, xb] (inclusive) with a pattern. */
function spanP(g, y0, y1, span, pat) {
  for (let y = y0; y <= y1; y++) {
    const s = span(y);
    if (!s) continue;
    for (let x = s[0]; x <= s[1]; x++) {
      const v = typeof pat === 'function' ? pat(x, y) : pat;
      if (v) g.px(x, y, v);
    }
  }
}

/** Trapezoid span: top edge [tl, tr] at y0, bottom edge [bl, br] at y1. */
const trap = (y0, y1, tl, tr, bl, br) => (y) => {
  const t = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
  return [Math.round(lerp(tl, bl, t)), Math.round(lerp(tr, br, t))];
};

/** Silhouette pass: any opaque pixel touching transparency becomes outline. */
function autoOutline(g) {
  const src = g.data.slice();
  const at = (x, y) => (x < 0 || x >= g.w || y < 0 ? 0 : y >= g.h ? 9 : src[y * g.w + x]);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!src[y * g.w + x]) continue;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) g.px(x, y, O);
    }
}

// ---- patterns (return a fn(x, y) -> palette index) -----------------------

/** Shingle courses: `row` px tall, dark line under each course, staggered joints. */
const shingles = (dark, light, ox, oy, row = 4, joint = 6) => (x, y) => {
  const rx = x - ox, ry = y - oy;
  const r = Math.floor(ry / row), yy = mod(ry, row);
  if (yy === row - 1) return dark;
  if (yy >= row - 3 && mod(rx + (r & 1) * (joint >> 1), joint) === 0) return dark;
  return light;
};

/** Scalloped shingles (rounded tiles). */
const scallops = (dark, light, ox, oy) => (x, y) => {
  const rx = x - ox, ry = y - oy;
  const r = Math.floor(ry / 4), yy = mod(ry, 4);
  const cx = mod(rx + (r & 1) * 2, 4);
  return yy === 3 || (yy === 2 && cx === 0) ? dark : light;
};

/** Horizontal siding boards. */
const siding = (dark, light, oy, row = 4) => (x, y) => (mod(y - oy, row) === row - 1 ? dark : light);

/** Vertical boards. */
const boards = (dark, light, ox, col = 4) => (x, y) => (mod(x - ox, col) === col - 1 ? dark : light);

/** Running-bond bricks. */
const bricks = (mortar, brick, ox, oy, bw = 6, bh = 3) => (x, y) => {
  const r = Math.floor((y - oy) / bh);
  if (mod(y - oy, bh) === bh - 1) return mortar;
  if (mod(x - ox + (r & 1) * (bw >> 1), bw) === 0) return mortar;
  return brick;
};

/** Irregular stone courses with a lit top-left edge on each stone. */
function stoneP(mortar, stone, hi, ox, oy, seed, row = 5) {
  const r = rngLocal(seed);
  const rows = [];
  for (let k = 0; k < 40; k++) {
    const cuts = [];
    let x = -Math.floor(r() * 5);
    while (x < 120) {
      cuts.push(x);
      x += 4 + Math.floor(r() * 5);
    }
    rows.push(cuts);
  }
  return (x, y) => {
    const ry = y - oy, rx = x - ox;
    const k = Math.floor(ry / row), yy = mod(ry, row);
    if (yy === row - 1) return mortar;
    const cuts = rows[mod(k, 40)];
    for (let i = 0; i < cuts.length; i++) {
      if (cuts[i] === rx) return mortar;
      if (hi && yy === 0 && cuts[i] + 1 <= rx && (i + 1 >= cuts.length || rx < cuts[i + 1]) && rx - cuts[i] < 3) return hi;
    }
    return stone;
  };
}

function rngLocal(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- building parts --------------------------------------------------------

/** Roof eave: outline at y, fascia board just above it. */
function eave(g, y, x0, x1, fascia) {
  g.hline(x0, x1, y - 1, fascia);
  g.hline(x0, x1, y, O);
}

/**
 * A window: outline frame, glass, optional cross bars, glint, sill and shutters.
 * o: { glass, bar, glint, sill, shutter, cross, frame }
 */
function windowAt(g, [x, y, w, h], o) {
  const { glass, bar = O, glint, sill, shutter, cross = true, frame } = o;
  if (shutter) {
    for (const sx of [x - 4, x + w]) {
      g.rect(sx, y, 4, h, O);
      g.rect(sx + 1, y + 1, 2, h - 2, shutter);
      g.hline(sx + 1, sx + 2, y + (h >> 1), O);
    }
  }
  g.rect(x, y, w, h, O);
  if (frame) g.rect(x + 1, y + 1, w - 2, h - 2, frame);
  const f = frame ? 2 : 1;
  g.rect(x + f, y + f, w - 2 * f, h - 2 * f, glass);
  if (cross) {
    const cx = x + (w >> 1), cy = y + (h >> 1);
    if (w >= 7) g.vline(cx, y + f, y + h - 1 - f, bar);
    if (h >= 7) g.hline(x + f, x + w - 1 - f, cy, bar);
  }
  if (glint) {
    g.px(x + f + 1, y + f + 1, glint);
    g.px(x + f, y + f + 2, glint);
    g.px(x + f + 2, y + f, glint);
  }
  if (sill) {
    g.hline(x - 1, x + w, y + h, sill);
    g.px(x - 1, y + h, O);
    g.px(x + w, y + h, O);
    g.hline(x - 1, x + w, y + h + 1, O);
  }
}

/**
 * Door in tile column `col`, spanning 16 px, from y=top down to the bottom row.
 * The last 3 rows are a stone step so the door reads as walkable.
 * o: { leaf, leafDark, trim, step, stepDark, knob, glass, open, inside }
 */
function doorAt(g, col, top, o) {
  const x = col * 16;
  const H = g.h;
  const sy = H - 3;
  const { leaf, leafDark, trim, step, stepDark, knob, glass, open, inside } = o;
  // frame + casing
  g.rect(x + 1, top, 14, sy - top, O);
  g.rect(x + 2, top + 1, 12, sy - top - 1, trim);
  if (open) {
    g.rect(x + 3, top + 2, 10, sy - top - 2, O);
    if (inside) inside(x + 3, top + 2, 10, sy - top - 2);
  } else {
    g.rect(x + 3, top + 2, 10, sy - top - 2, leaf);
    // planks
    g.vline(x + 6, top + 2, sy - 1, leafDark);
    g.vline(x + 9, top + 2, sy - 1, leafDark);
    g.hline(x + 3, x + 12, top + 2, leafDark);
    if (glass) {
      g.rect(x + 4, top + 4, 8, 7, O);
      g.rect(x + 5, top + 5, 6, 5, glass);
      g.hline(x + 5, x + 10, top + 7, O);
    }
    // knob
    g.px(x + 11, top + ((sy - top) >> 1) + 2, knob);
    g.px(x + 11, top + ((sy - top) >> 1) + 3, O);
  }
  // threshold + step
  g.hline(x + 1, x + 14, sy, O);
  g.hline(x + 1, x + 14, sy + 1, step);
  g.hline(x + 1, x + 14, sy + 2, stepDark);
  g.px(x, sy + 1, O);
  g.px(x, sy + 2, O);
  g.px(x + 15, sy + 1, O);
  g.px(x + 15, sy + 2, O);
  g.px(x + 1, sy + 1, step);
}

/** Flower box under a window. */
function flowerBox(g, x, y, w, box, bloom, leaf) {
  g.rect(x, y, w, 3, O);
  g.hline(x + 1, x + w - 2, y + 1, box);
  for (let i = 0; i < w - 2; i++) {
    g.px(x + 1 + i, y - 1, i % 3 === 1 ? bloom : leaf);
    if (i % 3 === 1) g.px(x + 1 + i, y - 2, bloom);
  }
}

/** Round off the top corners of a framed opening (x0..x1) whose top row is y. */
function archTop(g, x0, x1, y, wall) {
  g.px(x0, y, wall); g.px(x0 + 1, y, wall); g.px(x0, y + 1, wall);
  g.px(x1, y, wall); g.px(x1 - 1, y, wall); g.px(x1, y + 1, wall);
  g.px(x0 + 1, y + 1, O); g.px(x1 - 1, y + 1, O);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function house(A) {
  A.pal('bld_house', PALS.bld_house);
  A.paint('bld_house', 'bld_house', 64, 64, (g) => {
    // walls: cream siding with brown lines, timber corner posts
    rectP(g, 2, 30, 60, 34, siding(4, 5, 30, 5));
    g.rect(2, 30, 2, 34, 4);
    g.rect(60, 30, 2, 34, 4);
    g.rect(2, 30, 60, 2, 4); // eave shadow
    // stone foundation
    g.rect(2, 60, 60, 4, 4);
    g.hline(2, 61, 60, O);
    for (let x = 5; x < 60; x += 6) g.px(x, 62, O);
    // windows
    const [wl, wr, wd] = WIN.bld_house;
    windowAt(g, wl, { glass: 6, bar: 4, glint: 5, sill: 4 });
    windowAt(g, wr, { glass: 6, bar: 4, glint: 5, shutter: 3 });
    flowerBox(g, wr[0] - 1, wr[1] + wr[3], wr[2] + 2, 4, 3, 2);
    // door
    doorAt(g, 1, 38, { leaf: 3, leafDark: 2, trim: 5, step: 5, stepDark: 4, knob: 5 });
    // roof
    spanP(g, 2, 29, trap(2, 29, 8, 55, 0, 63), shingles(2, 3, 0, 2));
    g.hline(8, 55, 3, 2); // ridge cap
    eave(g, 29, 0, 63, 2);
    // dormer
    spanP(g, 9, 15, (y) => [29 - (y - 9) - 1, 29 + (y - 9) + 1], (x, y) => (y === 15 ? 2 : 3));
    g.line(28, 9, 22, 15, O);
    g.line(30, 9, 36, 15, O);
    g.px(29, 8, O);
    g.hline(22, 36, 16, O);
    rectP(g, 24, 16, 11, 9, 5);
    g.vline(23, 16, 25, O);
    g.vline(35, 16, 25, O);
    g.hline(23, 35, 25, O);
    windowAt(g, wd, { glass: 6, bar: 4, glint: 5 });
    // chimney
    g.rect(44, 0, 8, 13, O);
    rectP(g, 45, 2, 6, 10, bricks(4, 5, 45, 2, 4, 3));
    g.hline(44, 51, 1, O);
    g.hline(45, 50, 2, 4);
    g.vline(52, 4, 13, 2); // shadow on roof
    autoOutline(g);
  });
}

function barn(A) {
  A.pal('bld_barn', PALS.bld_barn);
  // gambrel front face: returns [xa, xb] for row y (or null)
  const face = (y) => {
    if (y < 14) return null;
    if (y >= 34) return [4, 75];
    if (y >= 24) {
      const t = (y - 24) / 10;
      return [Math.round(lerp(13, 4, t)), Math.round(lerp(66, 75, t))];
    }
    const t = (y - 14) / 10;
    return [Math.round(lerp(38, 13, t)), Math.round(lerp(41, 66, t))];
  };
  const inFace = (x, y) => {
    const s = face(y);
    return s && x >= s[0] && x <= s[1];
  };
  A.paint('bld_barn', 'bld_barn', 80, 64, (g) => {
    const D = 13; // depth of the roof seen above the gable
    // roof: everything above the face within D px
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 80; x++) {
        if (inFace(x, y)) continue;
        let hit = false;
        for (let k = 1; k <= D; k++) if (inFace(x, y + k)) { hit = true; break; }
        if (!hit) continue;
        // standing-seam roof: vertical seams, left half lit
        const lit = x < 40;
        const seam = mod(x, 4) === 0;
        g.px(x, y, seam ? (lit ? 2 : O) : lit ? 3 : 2);
      }
    // face: vertical red boards
    for (let y = 14; y < 64; y++) {
      const s = face(y);
      for (let x = s[0]; x <= s[1]; x++) g.px(x, y, mod(x, 4) === 3 ? 4 : 5);
    }
    // white trim along the gable edge
    for (let y = 14; y < 35; y++) {
      const s = face(y);
      const n = face(y - 1);
      const la = n ? Math.max(n[0], s[0] + 1) : s[1];
      for (let x = s[0]; x <= Math.min(la, s[0] + 2); x++) g.px(x, y, 6);
      const ra = n ? Math.min(n[1], s[1] - 1) : s[0];
      for (let x = Math.max(ra, s[1] - 2); x <= s[1]; x++) g.px(x, y, 6);
    }
    g.hline(4, 75, 34, 6); // band under gable
    g.hline(4, 75, 35, O);
    g.hline(4, 75, 36, 4);
    // corner trim
    g.rect(4, 36, 2, 28, 6);
    g.rect(74, 36, 2, 28, 6);
    // foundation (stone grey)
    rectP(g, 4, 60, 72, 4, (x, y) => (y === 60 ? O : mod(x + (y & 1) * 3, 6) === 0 ? O : 2));
    for (const w of WIN.bld_barn) windowAt(g, w, { glass: 2, bar: 6, frame: 6, cross: true });
    // hay-loft door (not a window: it stays dark at night)
    const wl = [35, 19, 11, 9];
    g.rect(wl[0], wl[1], wl[2], wl[3], O);
    g.rect(wl[0] + 1, wl[1] + 1, wl[2] - 2, wl[3] - 2, 6);
    g.rect(wl[0] + 2, wl[1] + 2, wl[2] - 4, wl[3] - 4, 4);
    g.line(wl[0] + 2, wl[1] + 2, wl[0] + wl[2] - 3, wl[1] + wl[3] - 3, 6);
    g.line(wl[0] + wl[2] - 3, wl[1] + 2, wl[0] + 2, wl[1] + wl[3] - 3, 6);
    // sliding-door rail
    g.hline(16, 63, 39, O);
    // open sliding leaves beside the doorway
    for (const lx of [19, 48]) {
      g.rect(lx, 40, 13, 20, O);
      g.rect(lx + 1, 41, 11, 18, 6);
      g.rect(lx + 2, 42, 9, 16, 5);
      g.line(lx + 2, 42, lx + 10, 57, 6);
      g.line(lx + 10, 42, lx + 2, 57, 6);
    }
    // doorway (open, dark) + threshold
    doorAt(g, 2, 38, {
      open: true, trim: 6, step: 3, stepDark: 2,
      inside: (x, y, w, h) => {
        g.hline(x, x + w - 1, y + h - 1, 2);
        g.px(x + 1, y + h - 2, 2);
        g.px(x + w - 2, y + h - 2, 2);
      },
    });
    autoOutline(g);
  });
}

function coop(A) {
  A.pal('bld_coop', PALS.bld_coop);
  A.paint('bld_coop', 'bld_coop', 48, 48, (g) => {
    // whitewashed vertical boards
    rectP(g, 2, 21, 44, 27, boards(4, 5, 2, 4));
    g.rect(2, 21, 44, 2, 4);
    g.rect(2, 44, 44, 4, 4);
    g.hline(2, 45, 44, O);
    for (let x = 4; x < 45; x += 5) g.px(x, 46, O);
    windowAt(g, WIN.bld_coop[0], { glass: O, bar: 5, glint: 6, sill: 3 });
    windowAt(g, WIN.bld_coop[1], { glass: O, bar: 5, glint: 6, sill: 3 });
    // hen hatch with a slatted ramp
    g.rect(36, 37, 7, 7, O);
    g.rect(37, 38, 5, 5, O);
    g.hline(37, 41, 42, 6);
    g.px(38, 41, 6);
    archTop(g, 36, 42, 37, 5);
    g.rect(36, 44, 7, 4, O);
    for (let y = 45; y < 48; y += 2) g.hline(37, 41, y, 5);
    doorAt(g, 1, 27, { leaf: 3, leafDark: 2, trim: 5, step: 5, stepDark: 4, knob: 6 });
    // egg plaque above the door
    g.rect(20, 22, 8, 5, O);
    g.rect(21, 23, 6, 3, 2);
    g.hline(23, 24, 23, 6); g.hline(22, 25, 24, 6); g.hline(23, 24, 25, 6);
    // roof
    spanP(g, 4, 20, trap(4, 20, 5, 42, 0, 47), shingles(2, 3, 0, 4, 3, 4));
    g.hline(5, 42, 5, 2);
    eave(g, 20, 0, 47, 2);
    // little vent cupola on the ridge
    g.rect(20, 2, 8, 6, O);
    g.rect(21, 3, 6, 4, 5);
    g.hline(21, 26, 4, 4);
    g.hline(21, 26, 6, 4);
    spanP(g, 0, 2, (y) => [23 - y * 2, 24 + y * 2], (x, y) => (y === 2 ? O : 3));
    autoOutline(g);
  });
}

function store(A) {
  A.pal('bld_store', PALS.bld_store);
  A.paint('bld_store', 'bld_store', 64, 64, (g) => {
    rectP(g, 2, 28, 60, 36, siding(4, 5, 28, 4));
    g.rect(2, 28, 60, 2, 4);
    g.rect(2, 60, 60, 4, 4);
    g.hline(2, 61, 60, O);
    // display window with goods on shelves
    const [wl, wd] = WIN.bld_store;
    windowAt(g, wl, { glass: 6, bar: 4, glint: 5, sill: 4 });
    g.rect(wd[0], wd[1], wd[2], wd[3], O);
    g.rect(wd[0] + 1, wd[1] + 1, wd[2] - 2, wd[3] - 2, 4);
    for (const sy of [wd[1] + 6, wd[1] + 11]) {
      g.hline(wd[0] + 1, wd[0] + wd[2] - 2, sy, O);
      for (let x = wd[0] + 2; x < wd[0] + wd[2] - 2; x += 3) {
        g.px(x, sy - 1, (x >> 1) % 3 === 0 ? 3 : (x >> 1) % 3 === 1 ? 6 : 5);
        g.px(x + 1, sy - 1, (x >> 1) % 3 === 0 ? 2 : 5);
        g.px(x, sy - 2, (x >> 1) % 3 === 0 ? 3 : 5);
      }
    }
    g.px(wd[0] + 2, wd[1] + 2, 6); g.px(wd[0] + 3, wd[1] + 1, 6); g.px(wd[0] + 1, wd[1] + 3, 6);
    g.vline(wd[0] + (wd[2] >> 1), wd[1] + 1, wd[1] + wd[3] - 2, O);
    g.hline(wd[0] - 1, wd[0] + wd[2], wd[1] + wd[3], 4);
    g.hline(wd[0] - 1, wd[0] + wd[2], wd[1] + wd[3] + 1, O);
    // striped awning over the display window
    for (let y = 31; y <= 36; y++)
      for (let x = 33; x <= 60; x++) g.px(x, y, y === 31 ? O : mod(x - 33, 6) < 3 ? 3 : 6);
    for (let x = 33; x <= 60; x++) {
      const c = mod(x - 33, 6);
      if (c === 1 || c === 4) g.px(x, 37, mod(x - 33, 6) < 3 ? 3 : 6);
      g.px(x, c === 1 || c === 4 ? 38 : 37, O);
    }
    // door with glass pane
    doorAt(g, 1, 36, { leaf: 4, leafDark: O, trim: 6, step: 6, stepDark: 4, knob: 6, glass: 6 });
    // roof
    spanP(g, 2, 27, trap(2, 27, 8, 55, 0, 63), shingles(2, 3, 0, 2));
    g.hline(8, 55, 3, 2);
    eave(g, 27, 0, 63, 2);
    // sign board: sprout + SEEDS
    g.rect(14, 12, 36, 13, O);
    g.rect(15, 13, 34, 11, 4);
    g.rect(16, 14, 32, 9, 6);
    g.px(15, 13, 5); g.px(48, 13, 5); g.px(15, 23, 5); g.px(48, 23, 5);
    g.art(18, 14, `
      33.....33
      323...323
      3223.3223
      .3222223.
      ..32223..
      ....2....
      ....2....
      .1111111.
      144444441
    `);
    const font = { S: '011100010001110', E: '111100110100111', D: '110101101101110' };
    [...'SEEDS'].forEach((ch, i) => {
      for (let k = 0; k < 15; k++) if (font[ch][k] === '1') g.px(29 + i * 4 + (k % 3), 16 + Math.floor(k / 3), 2);
    });
    autoOutline(g);
  });
}

function ranch(A) {
  A.pal('bld_ranch', PALS.bld_ranch);
  const gable = (y) => (y < 12 || y > 30 ? null : [Math.round(lerp(31, 3, (y - 12) / 18)), Math.round(lerp(32, 60, (y - 12) / 18))]);
  const inG = (x, y) => {
    const s = gable(y);
    return s && x >= s[0] && x <= s[1];
  };
  A.paint('bld_ranch', 'bld_ranch', 64, 64, (g) => {
    // roof planes behind the front gable
    const D = 11;
    for (let y = 0; y < 31; y++)
      for (let x = 0; x < 64; x++) {
        if (inG(x, y)) continue;
        let hit = false;
        for (let k = 1; k <= D; k++) if (inG(x, y + k) || (y + k === 31 && x >= 1 && x <= 62)) { hit = true; break; }
        if (!hit) continue;
        const lit = x < 32;
        const d = x < 32 ? x + y : 63 - x + y;
        g.px(x, y, mod(d, 4) === 0 ? (lit ? 2 : O) : lit ? 3 : 2);
      }
    // gable: vertical boards
    spanP(g, 12, 30, gable, boards(4, 5, 0, 3));
    // gable trim
    for (let y = 12; y <= 30; y++) {
      const s = gable(y);
      g.px(s[0], y, 6); g.px(s[0] + 1, y, 6);
      g.px(s[1], y, 6); g.px(s[1] - 1, y, 6);
    }
    // cow-head plaque in the gable
    g.rect(23, 17, 18, 13, O);
    g.rect(24, 18, 16, 11, 6);
    g.art(25, 18, `
      .1..........1.
      151........151
      .151111111151.
      11116644661111
      16616446661661
      .111616616111.
      ...14666661...
      ..1555555551..
      ..1551551551..
      ...11111111...
    `);
    // lower wall
    rectP(g, 2, 31, 60, 33, siding(4, 5, 31, 4));
    g.hline(2, 61, 31, O);
    g.rect(2, 32, 60, 2, 4);
    g.rect(2, 60, 60, 4, 4);
    g.hline(2, 61, 60, O);
    windowAt(g, WIN.bld_ranch[0], { glass: 3, bar: 6, glint: 6, shutter: 2 });
    windowAt(g, WIN.bld_ranch[1], { glass: 3, bar: 6, glint: 6, sill: 4 });
    // hitching rail
    g.rect(3, 51, 26, 3, O);
    g.hline(4, 27, 52, 6);
    for (const px of [5, 15, 25]) { g.rect(px, 51, 3, 9, O); g.vline(px + 1, 52, 59, 6); }
    // feed sacks by the door
    const sack = `
      ..111..
      .16661.
      ..161..
      .16661.
      1666661
      1664661
      1666661
      .11111.
    `;
    g.art(49, 52, sack);
    g.art(55, 52, sack);
    // double barn-style door
    doorAt(g, 2, 37, { leaf: 5, leafDark: 4, trim: 6, step: 6, stepDark: 4, knob: 6 });
    g.vline(39, 39, 60, O);
    g.line(35, 40, 38, 59, 4);
    g.line(43, 40, 40, 59, 4);
    autoOutline(g);
  });
}

function smithy(A) {
  A.pal('bld_smithy', PALS.bld_smithy);
  A.paint('bld_smithy', 'bld_smithy', 64, 64, (g) => {
    rectP(g, 2, 30, 60, 34, stoneP(O, 4, 5, 2, 30, 7, 5));
    g.rect(2, 30, 60, 2, 2);
    // forge-lit window
    windowAt(g, WIN.bld_smithy[0], { glass: 6, bar: O, glint: 5, sill: 2 });
    // open workshop door with forge glow inside
    doorAt(g, 1, 37, {
      open: true, trim: 3, step: 5, stepDark: 4,
      inside: (x, y, w, h) => {
        // forge glow at the back, anvil silhouette in front, lit floor
        g.rect(x + 5, y + 3, 5, 6, 2);
        g.rect(x + 6, y + 6, 3, 3, 6);
        g.px(x + 7, y + 5, 6);
        g.hline(x, x + w - 1, y + h - 1, 2);
        g.hline(x + 2, x + w - 1, y + h - 2, 2);
        g.art(x, y + h - 7, `
          .3333.
          ..33..
          ..33..
          .3333.
        `);
      },
    });
    // anvil sign hanging from an iron bracket
    g.hline(50, 61, 34, O);
    g.px(61, 33, O);
    g.vline(52, 34, 36, O); g.vline(58, 34, 36, O);
    g.rect(50, 36, 11, 9, O);
    g.rect(51, 37, 9, 7, 3);
    g.art(51, 38, `
      111111111
      .11111111
      ...1111..
      ...111...
      ..11111..
    `);
    // roof: slate
    spanP(g, 6, 29, trap(6, 29, 4, 59, 0, 63), shingles(2, 3, 0, 6, 3, 5));
    g.hline(4, 59, 7, 2);
    eave(g, 29, 0, 63, 2);
    // stone chimney
    g.rect(45, 0, 13, 22, O);
    rectP(g, 46, 1, 11, 20, stoneP(O, 4, 5, 46, 1, 3, 4));
    g.rect(44, 0, 15, 3, O);
    g.hline(45, 57, 1, 5);
    g.rect(48, 0, 7, 2, O);
    g.hline(49, 53, 0, 6);
    g.vline(59, 4, 21, 2);
    autoOutline(g);
  });
}

function inn(A) {
  A.pal('bld_inn', PALS.bld_inn);
  A.paint('bld_inn', 'bld_inn', 80, 64, (g) => {
    // upper storey (timber frame)
    rectP(g, 3, 21, 74, 22, 5);
    g.rect(3, 21, 74, 2, 4);
    for (const bx of [3, 19, 35, 44, 60, 76]) g.vline(bx, 21, 42, 4);
    g.hline(3, 76, 37, 4); // mid rail
    for (const bx of [3, 19, 44, 60]) {
      g.line(bx + 1, 40, bx + 3, 38, 4);
      g.line(bx + 15, 40, bx + 13, 38, 4);
    }
    // jetty beam
    g.rect(2, 41, 76, 3, 4);
    g.hline(2, 77, 41, O);
    g.hline(2, 77, 43, O);
    // lower storey
    rectP(g, 4, 44, 72, 20, siding(4, 5, 44, 5));
    g.rect(4, 44, 72, 2, 4);
    g.rect(4, 60, 72, 4, 4);
    g.hline(4, 75, 60, O);
    for (const w of WIN.bld_inn.slice(0, 4)) windowAt(g, w, { glass: 6, bar: 4, glint: 5, sill: 4 });
    for (const w of WIN.bld_inn.slice(4)) windowAt(g, w, { glass: 6, bar: 4, glint: 5, sill: 4 });
    doorAt(g, 2, 45, { leaf: 2, leafDark: O, trim: 4, step: 5, stepDark: 4, knob: 6 });
    // hanging sign: bracket + board with a mug
    g.hline(49, 58, 46, O);
    g.px(49, 45, O);
    g.vline(51, 46, 48, O); g.vline(57, 46, 48, O);
    g.rect(49, 48, 11, 9, O);
    g.rect(50, 49, 9, 7, 3);
    g.art(51, 49, `
      .5555.
      166661
      1666611
      1666611
      166661
      .1111.
    `);
    // roof: hipped, plum tiles
    spanP(g, 2, 20, trap(2, 20, 12, 67, 0, 79), scallops(2, 3, 0, 2));
    g.hline(12, 67, 3, 2);
    eave(g, 20, 0, 79, 2);
    // small chimney
    g.rect(14, 0, 7, 9, O);
    rectP(g, 15, 1, 5, 7, 4);
    g.hline(15, 19, 1, 2);
    autoOutline(g);
  });
}

function mayor(A) {
  A.pal('bld_mayor', PALS.bld_mayor);
  A.paint('bld_mayor', 'bld_mayor', 64, 64, (g) => {
    rectP(g, 2, 29, 60, 35, bricks(4, 5, 2, 29, 6, 3));
    g.rect(2, 29, 60, 3, 6); // cornice
    g.hline(2, 61, 32, O);
    // quoins
    for (let y = 33; y < 60; y += 4) { g.rect(2, y, 3, 2, 6); g.rect(59, y, 3, 2, 6); }
    // plinth
    g.rect(2, 60, 60, 4, 6);
    g.hline(2, 61, 60, O);
    for (const w of WIN.bld_mayor.slice(0, 3)) windowAt(g, w, { glass: 3, bar: 6, frame: 6, sill: 6 });
    // portico: pediment + columns around the door
    doorAt(g, 2, 42, { leaf: 2, leafDark: O, trim: 6, step: 6, stepDark: 3, knob: 6 });
    g.vline(38, 44, 60, O); // double door split
    spanP(g, 34, 40, (y) => [39 - (y - 34) * 2 - 1, 40 + (y - 34) * 2 + 1], 6);
    g.line(38, 34, 27, 40, O); g.line(41, 34, 52, 40, O); g.hline(38, 41, 33, O);
    g.hline(27, 52, 41, O);
    g.rect(29, 41, 4, 20, O); g.vline(30, 42, 59, 6); g.vline(31, 42, 59, 6);
    g.rect(47, 41, 4, 20, O); g.vline(48, 42, 59, 6); g.vline(49, 42, 59, 6);
    g.px(39, 37, 3); g.px(40, 37, 3);
    // roof: navy mansard
    spanP(g, 3, 28, trap(3, 28, 6, 57, 0, 63), shingles(2, 3, 0, 3, 4, 4));
    g.hline(6, 57, 4, 2);
    eave(g, 28, 0, 63, 6);
    g.hline(0, 63, 27, 6);
    // dormers
    for (const w of WIN.bld_mayor.slice(3)) {
      const [x, y, ww, hh] = w;
      g.rect(x - 2, y - 2, ww + 4, hh + 4, O);
      g.rect(x - 1, y - 1, ww + 2, hh + 3, 6);
      windowAt(g, w, { glass: 3, bar: 6, cross: true });
      spanP(g, y - 6, y - 2, (yy) => [x + 3 - (yy - (y - 6)) * 2, x + 3 + (yy - (y - 6)) * 2], (xx, yy) => (yy === y - 2 ? O : 2));
    }
    // flag on the ridge
    g.vline(31, 0, 7, O);
    g.rect(32, 0, 7, 5, O);
    g.rect(32, 1, 6, 3, 5);
    g.hline(33, 37, 2, 6);
    autoOutline(g);
  });
}

function cottageA(A) {
  A.pal('bld_cottage_a', PALS.bld_cottage_a);
  const gable = (y) => (y < 9 || y > 25 ? null : [Math.round(lerp(23, 3, (y - 9) / 16)), Math.round(lerp(24, 44, (y - 9) / 16))]);
  const inG = (x, y) => {
    const s = gable(y);
    return s && x >= s[0] && x <= s[1];
  };
  A.paint('bld_cottage_a', 'bld_cottage_a', 48, 48, (g) => {
    const D = 8;
    for (let y = 0; y < 27; y++)
      for (let x = 0; x < 48; x++) {
        if (inG(x, y)) continue;
        let hit = false;
        for (let k = 1; k <= D; k++) if (inG(x, y + k) || (y + k === 26 && x >= 1 && x <= 46)) { hit = true; break; }
        if (!hit) continue;
        const lit = x < 24;
        const d = lit ? x + y : 47 - x + y;
        g.px(x, y, mod(d, 3) === 0 ? (lit ? 2 : O) : lit ? 3 : 2);
      }
    spanP(g, 9, 25, gable, siding(4, 5, 9, 3));
    for (let y = 9; y <= 25; y++) {
      const s = gable(y);
      g.px(s[0], y, 6); g.px(s[1], y, 6);
    }
    // round attic window
    const [ax, ay] = [WIN.bld_cottage_a[2][0], WIN.bld_cottage_a[2][1]];
    g.circle(ax + 3, ay + 3, 3, O);
    g.circle(ax + 3, ay + 3, 2, 3);
    g.px(ax + 2, ay + 2, 6);
    g.vline(ax + 3, ay + 1, ay + 5, O);
    rectP(g, 2, 26, 44, 22, siding(4, 5, 26, 4));
    g.hline(2, 45, 26, O);
    g.rect(2, 27, 44, 2, 4);
    g.rect(2, 44, 44, 4, 4);
    g.hline(2, 45, 44, O);
    for (const w of WIN.bld_cottage_a.slice(0, 2)) windowAt(g, w, { glass: 3, bar: 6, glint: 6, sill: 6 });
    doorAt(g, 1, 30, { leaf: 2, leafDark: O, trim: 6, step: 6, stepDark: 4, knob: 6 });
    autoOutline(g);
  });
}

function cottageB(A) {
  A.pal('bld_cottage_b', PALS.bld_cottage_b);
  A.paint('bld_cottage_b', 'bld_cottage_b', 48, 48, (g) => {
    // pink plaster with a few rough speckles
    rectP(g, 3, 22, 42, 26, 5);
    const r = rngLocal(11);
    for (let i = 0; i < 14; i++) g.px(5 + Math.floor(r() * 38), 29 + Math.floor(r() * 13), 4);
    g.rect(3, 22, 42, 5, 4);
    g.rect(3, 44, 42, 4, 4);
    g.hline(3, 44, 44, O);
    for (let x = 5; x < 44; x += 5) g.px(x, 46, O);
    for (const w of WIN.bld_cottage_b) {
      windowAt(g, w, { glass: 6, bar: 4, glint: 5, sill: 4 });
      archTop(g, w[0], w[0] + w[2] - 1, w[1], 5);
    }
    // arched door
    doorAt(g, 1, 29, { leaf: 4, leafDark: O, trim: 3, step: 3, stepDark: 2, knob: 3 });
    archTop(g, 17, 30, 29, 5);
    // thatched roof: rounded mound, layered straw with a wavy eave
    const wave = (x) => (mod(x, 8) >= 2 && mod(x, 8) <= 5 ? 1 : 0);
    for (let y = 1; y <= 27; y++) {
      const t = Math.min(1, (y - 1) / 19);
      const inset = Math.round(13 * Math.pow(1 - t, 2.2));
      for (let x = inset; x <= 47 - inset; x++) {
        const e = 24 + wave(x);
        if (y > e + 1) continue;
        if (y === e + 1) { g.px(x, y, O); continue; }
        const band = mod(y - wave(x) - 1, 6) === 5;
        const streak = mod(x, 3) === 1 && mod(y + (x >> 1), 5) < 2;
        g.px(x, y, band ? 2 : streak ? 2 : 3);
      }
    }
    // ridge roll
    g.hline(12, 35, 2, 2);
    // chimney
    g.rect(35, 0, 7, 9, O);
    rectP(g, 36, 1, 5, 7, bricks(O, 4, 36, 1, 3, 3));
    g.hline(36, 40, 1, 5);
    g.hline(34, 42, 0, O);
    autoOutline(g);
  });
}

function cabin(A) {
  A.pal('bld_cabin', PALS.bld_cabin);
  A.paint('bld_cabin', 'bld_cabin', 48, 48, (g) => {
    // horizontal logs: highlight, body, shade, gap
    for (let y = 21; y < 48; y++) {
      const ry = mod(y - 21, 4);
      g.hline(4, 43, y, ry === 3 ? O : ry === 0 ? 6 : ry === 2 ? 4 : 5);
    }
    // round log ends stacked at both corners
    const end = `
      .44.
      4564
      .44.
    `;
    for (let y = 21; y < 45; y += 4) {
      g.rect(0, y, 4, 4, O);
      g.rect(44, y, 4, 4, O);
      g.rect(0, y, 4, 3, 4);
      g.art(0, y, end);
      g.rect(44, y, 4, 3, 4);
      g.art(44, y, end);
    }
    g.rect(4, 21, 40, 2, 4);
    for (const w of WIN.bld_cabin) windowAt(g, w, { glass: O, bar: 4, glint: 6, sill: 4 });
    doorAt(g, 1, 29, { leaf: 4, leafDark: O, trim: 5, step: 6, stepDark: 4, knob: 6 });
    // firewood stack under the right window
    for (const [lx, ly] of [[36, 43], [40, 43], [38, 40]]) {
      g.rect(lx, ly, 5, 5, O);
      g.rect(lx + 1, ly + 1, 3, 3, 6);
      g.px(lx + 2, ly + 2, 5);
    }
    // shake roof, moss green
    spanP(g, 3, 20, trap(3, 20, 4, 43, 0, 47), shingles(2, 3, 0, 3, 3, 5));
    g.hline(4, 43, 4, 2);
    eave(g, 20, 0, 47, 2);
    // stone chimney
    g.rect(34, 0, 8, 11, O);
    rectP(g, 35, 1, 6, 9, bricks(4, 6, 35, 1, 3, 3));
    g.hline(34, 41, 1, O);
    g.vline(42, 3, 11, 2);
    autoOutline(g);
  });
}

export function register(A) {
  house(A);
  barn(A);
  coop(A);
  store(A);
  ranch(A);
  smithy(A);
  inn(A);
  mayor(A);
  cottageA(A);
  cottageB(A);
  cabin(A);
}
