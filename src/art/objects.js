// Art module: objects — transparent world objects (debris, nature, farm,
// village and forest props). See docs/ART_GUIDE.md for the sprite contract.
//
// Everything here is original pixel art for Moonlit Acres. Sprites are drawn
// in a top-down 3/4 view, lit from the top-left, bottom-aligned (they stand on
// the bottom edge of their canvas) and outlined with index 1 (#181010).

// ---------------------------------------------------------------------------
// Local drawing helpers (kept inside the module so it stays self-contained)
// ---------------------------------------------------------------------------

const layer = (g) => new g.constructor(g.w, g.h, g._b);

/**
 * Draw one part of an object on its own layer, give its silhouette a 1px
 * (4-neighbour) outline and composite it on top of `g`. Parts drawn later sit
 * in front of earlier ones, and their outline separates them. With
 * `soft = true` the outline is only added over transparent pixels.
 */
function part(g, fn, { ol = 1, soft = false } = {}) {
  const t = layer(g);
  fn(t);
  const { w, h } = g;
  const T = t.data, G = g.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && T[y * w + x] > 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (T[k]) G[k] = T[k];
      else if (ol && (!soft || !G[k]) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) G[k] = ol;
    }
  return t;
}

/** Recolour pixels of index `from` (or any when null) whose neighbour at (dx,dy) is empty. */
function rim(t, from, to, dx, dy) {
  const { w, h } = t;
  const src = t.data.slice();
  const m = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] > 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x];
      if (!v || (from !== null && v !== from)) continue;
      if (!m(x + dx, y + dy)) t.data[y * w + x] = to;
    }
}

/** A shaded ball: dark rim bottom-right, mid body, light cap top-left. */
function ball(t, cx, cy, r, d, m, l) {
  t.circle(cx, cy, r, d);
  t.circle(cx - 1, cy - 1, r - 1, m);
  if (r >= 4) t.circle(cx - Math.ceil(r / 3), cy - Math.ceil(r / 3), Math.max(1, r - 4), l);
}

/** Remove 1px nubs (pixels with at most one 4-neighbour) left by ellipse extremes. */
function despeckle(t, passes = 2) {
  const { w, h } = t;
  for (let p = 0; p < passes; p++) {
    const src = t.data.slice();
    const m = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] > 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (src[y * w + x] && m(x - 1, y) + m(x + 1, y) + m(x, y - 1) + m(x, y + 1) <= 1) t.data[y * w + x] = 0;
  }
}

/** Filled ellipse inscribed in the inclusive pixel box (x0,y0)-(x1,y1). */
function oval(t, x0, y0, x1, y1, i) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      if (u * u + v * v <= 0.92) t.px(x, y, i);
    }
}

/** Shift the drawing down so its lowest row touches the bottom edge. */
function settle(g) {
  const { w, h } = g;
  let low = -1;
  for (let y = h - 1; y >= 0 && low < 0; y--) for (let x = 0; x < w; x++) if (g.data[y * w + x]) { low = y; break; }
  const d = h - 1 - low;
  if (low < 0 || d === 0) return;
  g.data.copyWithin(d * w, 0, (h - d) * w);
  g.data.fill(0, 0, d * w);
}

/** Quadratic bezier stroke. */
function curve(t, x0, y0, cx, cy, x1, y1, fn) {
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
    fn(Math.round(a * x0 + b * cx + c * x1), Math.round(a * y0 + b * cy + c * y1), s);
  }
}

// ---------------------------------------------------------------------------

export function register(A) {
  // ---------------- palettes ----------------
  const O = '#181010';

  // Seasonal (contract names). All variants share one index layout.
  // weed: 1 outline, 2 dark, 3 mid, 4 tip
  A.pal('weed@spring', [O, '#306828', '#58a038', '#a8d868']);
  A.pal('weed@summer', [O, '#205820', '#408830', '#80c048']);
  A.pal('weed@fall', [O, '#704818', '#a87028', '#d8b048']);
  A.pal('weed@winter', [O, '#485060', '#8890a0', '#d8e0e8']);

  // tree: 1 outline, 2 trunk dark, 3 trunk light, 4 canopy dark, 5 canopy mid, 6 canopy light
  A.pal('tree@spring', [O, '#583820', '#906040', '#b85880', '#f090b0', '#f8c8d8']);
  A.pal('tree@summer', [O, '#583820', '#906040', '#206828', '#409838', '#80c850']);
  A.pal('tree@fall', [O, '#583820', '#906040', '#a02818', '#d86820', '#f8b038']);
  A.pal('tree@winter', [O, '#583820', '#906040', '#504040', '#887870', '#f8f8f8']);

  // pine: 1 outline, 2 trunk dark, 3 trunk light, 4 needles dark, 5 needles mid, 6 highlight / snow
  A.pal('pine@spring', [O, '#503018', '#805030', '#184830', '#307848', '#60a860']);
  A.pal('pine@summer', [O, '#503018', '#805030', '#184028', '#287040', '#58a050']);
  A.pal('pine@fall', [O, '#503018', '#805030', '#203828', '#386838', '#789850']);
  A.pal('pine@winter', [O, '#503018', '#805030', '#183830', '#306050', '#f0f8f8']);

  // bush: 1 outline, 2 dark, 3 mid, 4 light, 5 flowers / berries
  A.pal('bush@spring', [O, '#306828', '#58a040', '#90d060', '#f8b8d0']);
  A.pal('bush@summer', [O, '#205820', '#408830', '#78c048', '#e03830']);
  A.pal('bush@fall', [O, '#883018', '#c86020', '#f0a030', '#f8e070']);
  A.pal('bush@winter', [O, '#203828', '#386048', '#f0f8f8', '#d03028']);

  // flower_bed: 1 outline, 2 soil, 3 leaves, 4 petals, 5 petal centre, 6 edging stone
  A.pal('flower_bed@spring', [O, '#684830', '#48a038', '#f880a8', '#f8f0a0', '#b0a8a0']);
  A.pal('flower_bed@summer', [O, '#684830', '#389030', '#e83828', '#f8d040', '#b0a8a0']);
  A.pal('flower_bed@fall', [O, '#684830', '#688830', '#a050c0', '#f8b830', '#b0a8a0']);
  A.pal('flower_bed@winter', [O, '#8890a8', '#586858', '#f0f8f8', '#c8d0e0', '#b0a8a0']);

  // hedge: 1 outline, 2 dark, 3 mid, 4 light (winter: snow on top)
  A.pal('hedge@spring', [O, '#285828', '#489838', '#80c858']);
  A.pal('hedge@summer', [O, '#184818', '#308030', '#60b048']);
  A.pal('hedge@fall', [O, '#384818', '#607828', '#98a840']);
  A.pal('hedge@winter', [O, '#284030', '#487058', '#f0f8f8']);

  // Module-private palettes
  A.pal('obj_stone', [O, '#585860', '#888898', '#b8b8c8', '#e8e8f0']);
  A.pal('obj_wood', [O, '#583018', '#885828', '#c08040', '#e8b870']);
  A.pal('obj_fence', [O, '#704828', '#b07840', '#e8c080']);
  A.pal('obj_bin', [O, '#603818', '#985828', '#d09848', '#687080', '#f0e0b0']);
  A.pal('obj_dog', [O, '#784020', '#c07838', '#305888', '#5888c0', '#f0e0b0']);
  A.pal('obj_mail', [O, '#704828', '#b07840', '#305890', '#6898d0', '#d83828']);
  A.pal('obj_well', [O, '#686870', '#a8a8b0', '#704020', '#b87838', '#284878']);
  A.pal('obj_scarecrow', [O, '#704020', '#d8a038', '#f0d890', '#385098', '#6088d0']);
  A.pal('obj_lamp', [O, '#303840', '#687880', '#f8c040', '#f8f0b0']);
  A.pal('obj_bench', [O, '#703818', '#a86030', '#d89850', '#384048']);
  A.pal('obj_fountain', [O, '#808088', '#c0c0c8', '#3070c0', '#68a8e8', '#f0f8f8']);
  A.pal('obj_pot', [O, '#a04828', '#d87848', '#48a038', '#f05878', '#f8e070']);
  A.pal('obj_barrel', [O, '#603018', '#985028', '#c88048', '#505860']);
  A.pal('obj_board', [O, '#603818', '#986030', '#d0a068', '#f8f8e8', '#d04030']);
  A.pal('obj_spring', [O, '#686068', '#a8a0a0', '#208878', '#48b8a8', '#a8e8d8']);

  drawDebris(A);
  drawNature(A);
  drawFarm(A);
  drawVillage(A);
  drawForest(A);
}

// ---------------------------------------------------------------------------
// Debris
// ---------------------------------------------------------------------------
function drawDebris(A) {
  // Weed: a tuft of arching blades.
  A.paint('weed', 'weed', 16, 16, (g) => {
    part(g, (t) => {
      const blade = (x0, y0, cx, cy, x1, y1) =>
        curve(t, x0, y0, cx, cy, x1, y1, (x, y, s) => {
          t.px(x, y, s > 0.8 ? 4 : 3);
          if (s < 0.72) t.px(x + 1, y, 2);
        });
      blade(5, 14, 2, 13, 1, 9);
      blade(9, 14, 13, 13, 13, 8);
      blade(6, 14, 4, 10, 4, 5);
      blade(8, 14, 10, 9, 10, 4);
      t.hline(4, 11, 14, 2);
      t.hline(5, 10, 13, 3);
    });
  });

  A.sprite('stone', 'obj_stone', `
    ................
    ................
    ................
    ................
    ................
    ................
    .....111111.....
    ...1144443311...
    ..144554433321..
    ..145444333221..
    .13444333312221.
    .13443333122221.
    .13333331222221.
    .12333322222211.
    ..122222222111..
    ...1111111111...
  `);

  A.sprite('stump', 'obj_wood', `
    ................
    ................
    ................
    ................
    ....11111111....
    ...1555555551...
    ..155444444551..
    ..154455554451..
    ..155444444551..
    ..113555555211..
    ..134333232221..
    ..134332232221..
    .11343322322211.
    1233433232222221
    1223332222222211
    .11111111111111.
  `);

  // Branch: a fallen forked stick.
  A.paint('branch', 'obj_wood', 16, 16, (g) => {
    part(g, (t) => {
      t.line(7, 10, 5, 5, 3);
      t.px(4, 5, 3);
      t.line(2, 12, 13, 8, 3);
      t.line(2, 13, 13, 9, 2);
      for (let x = 3; x < 12; x += 3) t.px(x, t.get(x, 11) === 3 ? 11 : 12, 4);
      t.px(13, 8, 5);
      t.px(13, 9, 4);
    });
    settle(g);
  });

  // Boulder: a big faceted rock.
  A.paint('boulder', 'obj_stone', 32, 32, (g) => {
    part(g, (t) => {
      t.ellipse(16, 21, 14, 9, 3);
      t.ellipse(12, 15, 9, 7, 3);
      t.ellipse(21, 14, 7, 6, 3);
      t.hline(0, 31, 30, 0);
      despeckle(t);
      rim(t, 3, 2, 2, 2);
      rim(t, 3, 2, 0, 3);
      rim(t, 3, 4, -2, -2);
      rim(t, 3, 4, 0, -2);
      rim(t, 4, 5, -1, -1);
      // facets and cracks
      t.line(18, 10, 16, 15, 2);
      t.line(16, 15, 19, 21, 2);
      t.line(15, 9, 14, 14, 4);
      t.line(19, 21, 26, 23, 2);
      t.line(8, 22, 13, 20, 2);
      t.line(8, 21, 12, 19, 4);
    });
    settle(g);
  });
}

// ---------------------------------------------------------------------------
// Nature
// ---------------------------------------------------------------------------
function drawNature(A) {
  // Deciduous tree: round lumpy canopy over a sturdy trunk.
  A.paint('tree', 'tree', 32, 48, (g) => {
    part(g, (t) => {
      for (let y = 28; y <= 46; y++) {
        let x0 = 13, x1 = 18;
        if (y >= 43) { x0 = 12; x1 = 19; }
        if (y >= 45) { x0 = 11; x1 = 20; }
        for (let x = x0; x <= x1; x++) t.px(x, y, x <= x0 + 1 ? 3 : 2);
      }
      t.px(10, 46, 2);
      t.px(21, 46, 2);
      // bark marks
      t.vline(16, 38, 40, 3);
      t.px(14, 41, 2);
      t.px(13, 36, 2);
    });
    part(g, (t) => {
      const clumps = [[16, 11, 10], [8, 17, 7], [23, 17, 7], [9, 26, 8], [22, 26, 8], [16, 25, 9]];
      for (const [cx, cy, r] of clumps) ball(t, cx, cy, r, 4, 5, 6);
      // leaf texture: little lit tufts with a shadow tick
      const r = t.rng(7);
      for (let y = 2; y < 34; y++)
        for (let x = 2; x < 30; x++) {
          if (t.get(x, y) !== 5) continue;
          if ((x * 3 + y * 5) % 11 === 0 && r() < 0.8) {
            t.px(x, y, 6);
            if (t.get(x + 1, y + 1) === 5) t.px(x + 1, y + 1, 4);
          }
        }
    });
  });

  // Pine: stacked tiers with a zig-zag hem.
  A.paint('pine', 'pine', 32, 48, (g) => {
    part(g, (t) => {
      for (let y = 38; y <= 46; y++) {
        const x0 = y >= 45 ? 12 : 13, x1 = y >= 45 ? 19 : 18;
        for (let x = x0; x <= x1; x++) t.px(x, y, x <= x0 + 1 ? 3 : 2);
      }
    });
    const tiers = [[19, 40, 14.5], [11, 31, 12], [5, 22, 9], [1, 13, 6]];
    for (const [ap, bs, hw] of tiers)
      part(g, (t) => {
        const cx = 15.5;
        for (let y = ap; y <= bs; y++) {
          const f = (y - ap + 1) / (bs - ap + 1);
          const half = Math.max(0.5, hw * f);
          for (let x = 0; x < 32; x++) {
            const dx = x - cx;
            if (Math.abs(dx) > half) continue;
            const tooth = Math.floor((x + 1) / 3) % 2;
            if (y === bs && tooth) continue;
            let c = dx > half * 0.15 ? 4 : 5;
            if (y >= bs - 1) c = 4;
            if (dx < 0 && -dx > half - 2 && y < bs - 1) c = 6;
            if (dx > 0 && dx > half - 1 && f < 0.45) c = 6;
            if (y === Math.round(ap + (bs - ap) * 0.62) && dx < half * 0.5 && dx > -half + 2 && Math.floor(x / 2) % 2 === 0) c = 6;
            t.px(x, y, c);
          }
        }
      });
  });

  A.paint('bush', 'bush', 16, 16, (g) => {
    part(g, (t) => {
      ball(t, 5, 10, 4, 2, 3, 4);
      ball(t, 10, 10, 4, 2, 3, 4);
      ball(t, 8, 7, 5, 2, 3, 4);
      t.hline(3, 12, 14, 2);
      // light / snow cap along the top of the silhouette
      rim(t, 3, 4, 0, -1);
      rim(t, 3, 4, -1, -1);
      for (const [x, y] of [[4, 8], [9, 4], [12, 9], [6, 12], [10, 12], [7, 6]]) t.px(x, y, 5);
    });
  });

  A.paint('flower_bed', 'flower_bed', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(1, 7, 14, 5, 2);
      t.px(1, 7, 0);
      t.px(14, 7, 0);
      t.rect(1, 11, 14, 4, 6);
    });
    for (const x of [5, 10]) g.vline(x, 12, 14, 1);
    g.hline(1, 14, 11, 1);
    part(g, (t) => {
      const fl = (x, y) => {
        t.px(x, y + 1, 3);
        t.px(x - 1, y, 4);
        t.px(x + 1, y, 4);
        t.px(x, y - 1, 4);
        t.px(x, y + 1, 4);
        t.px(x, y, 5);
      };
      t.line(3, 9, 4, 6, 3);
      t.line(12, 9, 11, 5, 3);
      t.line(7, 9, 8, 4, 3);
      t.px(5, 9, 3); t.px(10, 8, 3);
      fl(3, 5);
      fl(8, 3);
      fl(12, 4);
      fl(5, 8);
      fl(10, 8);
    }, { soft: true });
  });

  A.sprite('hedge', 'hedge', `
    ................
    ................
    .11111111111111.
    1444434444444341
    1443444443444441
    1444444344443441
    1344344444434431
    1333333333333331
    1332333233323331
    1323232323232321
    1333233323332331
    1332333233323331
    1323232323232321
    1222222222222221
    1222122212221221
    .11111111111111.
  `);

  // Log: fallen trunk lying left-right, cut end facing left.
  A.paint('log', 'obj_wood', 32, 16, (g) => {
    part(g, (t) => {
      t.rect(6, 4, 22, 10, 3);
      t.ellipse(27, 9, 3, 5, 3);
      despeckle(t);
      for (let x = 6; x <= 30; x++) {
        for (let y = 4; y <= 14; y++) {
          if (!t.get(x, y)) continue;
          if (y <= 5) t.px(x, y, 4);
          if (y >= 11) t.px(x, y, 2);
        }
      }
      rim(t, null, 2, 1, 0);
      // bark grain
      for (const [x, y, l] of [[9, 7, 5], [17, 8, 6], [12, 10, 4], [22, 6, 4], [24, 10, 3]]) t.hline(x, x + l, y, 2);
      for (const [x, y, l] of [[10, 6, 3], [19, 7, 3], [14, 9, 2]]) t.hline(x, x + l, y, 4);
      // broken stub on top
      t.rect(18, 2, 3, 2, 3);
      t.px(18, 2, 4);
    });
    part(g, (t) => {
      t.ellipse(6, 9, 4, 5, 5);
      despeckle(t);
      t.ellipse(6, 9, 2, 3, 4);
      t.ellipse(6, 9, 1, 1, 5);
      t.px(6, 9, 3);
      rim(t, 5, 4, 1, 1);
    });
    settle(g);
  });
}

// ---------------------------------------------------------------------------
// Farm
// ---------------------------------------------------------------------------
function drawFarm(A) {
  // Shipping bin: plank bin with iron bands, a hinged lid and a painted moon.
  A.paint('shipping_bin', 'obj_bin', 32, 24, (g) => {
    part(g, (t) => {
      t.rect(2, 10, 28, 13, 3);
      for (let x = 6; x < 29; x += 5) t.vline(x, 10, 22, 2);
      t.vline(2, 10, 22, 4);
      t.vline(29, 10, 22, 2);
      t.hline(2, 29, 22, 2);
      for (const y of [12, 20]) {
        t.hline(2, 29, y, 5);
        t.px(3, y, 6);
        t.px(28, y, 6);
      }
      t.art(14, 14, `
        .66.
        66..
        66..
        .66.
      `);
    });
    part(g, (t) => {
      t.rect(1, 2, 30, 6, 4);
      t.hline(1, 30, 4, 3);
      t.hline(1, 30, 7, 3);
      t.rect(1, 8, 30, 2, 3);
      t.hline(1, 30, 9, 2);
      t.vline(30, 2, 9, 2);
      t.rect(12, 9, 8, 2, 5);
      t.hline(12, 19, 9, 6);
      t.hline(12, 19, 10, 1);
      t.px(12, 10, 5);
      t.px(19, 10, 5);
    });
  });

  // Fences. fence_h rails run edge to edge; fence_post / fence_h posts reach
  // the top of the tile so a vertical run above a corner still touches it;
  // fence_v is a short post with the rail coming in from the tile above.
  A.sprite('fence_post', 'obj_fence', `
    ......1111......
    .....144441.....
    .....133321.....
    .....143321.....
    .....143321.....
    .....143321.....
    .....143321.....
    .....143221.....
    .....143321.....
    .....143321.....
    .....143321.....
    .....143321.....
    .....143321.....
    .....143321.....
    .....122221.....
    .....111111.....
  `);
  A.sprite('fence_h', 'obj_fence', `
    ......1111......
    .....144441.....
    .....133321.....
    1111114332111111
    4444414332144444
    3333314332133333
    1111114332111111
    .....143321.....
    .....143221.....
    1111114332111111
    4444414332144444
    3333314332133333
    1111114332111111
    .....143321.....
    .....122221.....
    .....111111.....
  `);
  A.sprite('fence_v', 'obj_fence', `
    ......1431......
    ......1431......
    ......1431......
    ......1431......
    ......1431......
    ......1431......
    ......1431......
    ......1111......
    .....144441.....
    .....133321.....
    .....143321.....
    .....143321.....
    .....143221.....
    .....143321.....
    .....122221.....
    .....111111.....
  `);

  // Doghouse: gabled kennel with a round door and a name plaque.
  A.paint('doghouse', 'obj_dog', 32, 32, (g) => {
    part(g, (t) => {
      for (let y = 6; y <= 30; y++)
        for (let x = 5; x <= 26; x++) {
          const top = 4 + Math.abs(x - 15.5) * 1.1;
          if (y < top + 4) continue;
          t.px(x, y, (x - 5) % 4 === 3 ? 2 : 3);
        }
      t.hline(5, 26, 30, 2);
      rim(t, 3, 2, 1, 0);
      // door
      t.rect(12, 21, 8, 10, 1);
      t.hline(13, 18, 20, 1);
      t.hline(14, 17, 19, 1);
      // plaque
      t.rect(13, 14, 6, 3, 6);
      t.px(14, 15, 2);
      t.px(16, 15, 2);
    });
    part(g, (t) => {
      for (let y = 0; y < 32; y++)
        for (let x = 1; x <= 30; x++) {
          const d = y - (4 + Math.abs(x - 15.5) * 1.1);
          if (d < 0 || d >= 4 || y > 24) continue;
          const left = x < 16;
          t.px(x, y, d < (left ? 2 : 1) ? 5 : 4);
        }
    });
  });

  // Mailbox: a rounded metal box on a post, seen from the side, red flag raised.
  A.paint('mailbox', 'obj_mail', 16, 24, (g) => {
    part(g, (t) => {
      t.rect(6, 12, 4, 11, 3);
      t.vline(8, 12, 22, 2);
      t.vline(9, 12, 22, 2);
    });
    part(g, (t) => {
      t.vline(13, 3, 9, 2);
      t.rect(13, 2, 2, 3, 6);
    });
    part(g, (t) => {
      t.rect(1, 6, 12, 6, 4);
      t.hline(2, 11, 5, 5);
      t.hline(1, 12, 6, 5);
      t.hline(2, 11, 7, 5);
      t.hline(1, 12, 11, 1);
      t.hline(2, 11, 10, 4);
      // door at the front (left) end
      t.vline(3, 6, 10, 1);
      t.vline(1, 7, 10, 5);
      t.vline(2, 8, 9, 5);
    });
    part(g, (t) => {
      t.rect(5, 12, 6, 1, 2);
    });
  });

  A.sprite('sign', 'obj_wood', `
    ................
    ................
    .11111111111111.
    1444444444444441
    1433333333333321
    1432223222233321
    1433333333333321
    1432222322233321
    1433333333333321
    1222222222222221
    .11111132111111.
    ......1321......
    ......1321......
    ......1321......
    ......1321......
    ......1111......
  `);

  // Well: round stone well with a little shingled roof and a bucket.
  A.paint('well', 'obj_well', 32, 32, (g) => {
    const yb = (x) => 20 + 5 * Math.sqrt(Math.max(0, 1 - ((x - 16) / 13.5) ** 2));
    part(g, (t) => {
      for (let x = 3; x <= 29; x++) {
        const b = Math.round(yb(x));
        for (let y = 20; y <= b + 5; y++) {
          const row = Math.floor((y - b + 6) / 3);
          const mortar = (y - b + 6) % 3 === 2 || (x + row * 2) % 5 === 0;
          t.px(x, y, mortar ? (x < 16 ? 2 : 1) : x < 12 ? 3 : 2);
        }
      }
      t.ellipse(16, 20, 13, 5, 3);
      t.ellipse(16, 20, 10, 3, 2);
      t.ellipse(16, 21, 9, 2, 6);
      t.hline(8, 24, 18, 1);
    });
    part(g, (t) => {
      for (const x of [4, 25]) {
        t.rect(x, 7, 3, 15, 4);
        t.vline(x, 7, 21, 5);
      }
      t.rect(7, 10, 18, 2, 4);
      t.hline(7, 24, 10, 5);
      t.vline(15, 12, 13, 4);
      t.rect(13, 14, 6, 4, 4);
      t.hline(13, 18, 14, 5);
      t.hline(13, 18, 16, 2);
    });
    part(g, (t) => {
      for (let y = 1; y <= 7; y++) {
        const inset = Math.floor((7 - y) / 2);
        for (let x = 1 + inset; x <= 30 - inset; x++) t.px(x, y, y % 2 === 1 ? 5 : 4);
      }
      t.hline(1, 30, 7, 4);
    });
  });

  // Scarecrow: sack head, wide straw hat, patched indigo shirt, straw hands.
  A.paint('scarecrow', 'obj_scarecrow', 16, 32, (g) => {
    part(g, (t) => {
      t.rect(7, 16, 2, 15, 2);
      t.vline(7, 16, 30, 3);
    });
    part(g, (t) => {
      t.rect(2, 13, 12, 3, 5);
      t.hline(2, 13, 13, 6);
      for (const x of [1, 14]) t.vline(x, 13, 16, 3);
      t.px(2, 16, 3);
      t.px(13, 16, 3);
      t.px(4, 15, 3);
      t.px(11, 15, 3);
    });
    part(g, (t) => {
      t.rect(5, 13, 6, 9, 5);
      t.rect(5, 13, 2, 8, 6);
      t.rect(8, 16, 2, 2, 3);
      t.hline(5, 10, 20, 2);
      for (const x of [5, 7, 9]) t.px(x, 22, 3);
      t.px(6, 23, 3);
      t.px(10, 22, 3);
    });
    part(g, (t) => {
      t.rect(4, 7, 8, 6, 4);
      t.px(4, 12, 0);
      t.px(11, 12, 0);
      t.px(6, 9, 1);
      t.px(9, 9, 1);
      t.hline(6, 9, 11, 2);
      t.px(7, 11, 1);
      t.px(5, 10, 3);
      t.px(10, 10, 3);
    });
    part(g, (t) => {
      t.rect(5, 2, 6, 3, 3);
      t.hline(6, 9, 1, 3);
      t.hline(5, 10, 4, 2);
      t.rect(1, 5, 14, 2, 3);
      t.hline(2, 13, 5, 4);
      t.px(6, 2, 4);
      t.px(6, 3, 4);
    });
  });
}

// ---------------------------------------------------------------------------
// Village
// ---------------------------------------------------------------------------
function drawVillage(A) {
  A.paint('lamp', 'obj_lamp', 16, 32, (g) => {
    part(g, (t) => {
      t.rect(7, 13, 2, 15, 2);
      t.vline(7, 13, 27, 3);
      t.rect(5, 27, 6, 3, 2);
      t.hline(5, 10, 27, 3);
      t.rect(4, 30, 8, 1, 2);
    });
    part(g, (t) => {
      t.rect(4, 6, 8, 6, 4);
      t.rect(5, 7, 2, 2, 5);
      t.vline(4, 6, 11, 2);
      t.vline(11, 6, 11, 2);
      t.hline(4, 11, 11, 2);
      t.rect(5, 12, 6, 1, 2);
    });
    part(g, (t) => {
      t.hline(3, 12, 5, 2);
      t.hline(4, 11, 4, 3);
      t.hline(5, 10, 3, 3);
      t.hline(6, 9, 2, 3);
      t.hline(7, 8, 1, 3);
      t.hline(8, 12, 5, 2);
    });
  });

  A.paint('bench', 'obj_bench', 32, 16, (g) => {
    part(g, (t) => {
      for (const x of [2, 28]) t.rect(x, 2, 2, 12, 5);
    });
    part(g, (t) => {
      t.rect(2, 2, 28, 2, 4);
      t.hline(2, 29, 3, 3);
      t.rect(2, 5, 28, 2, 4);
      t.hline(2, 29, 6, 3);
    });
    part(g, (t) => {
      t.rect(1, 8, 30, 3, 4);
      t.hline(1, 30, 9, 3);
      t.hline(1, 30, 10, 2);
      t.rect(3, 11, 2, 4, 5);
      t.rect(27, 11, 2, 4, 5);
    });
  });

  // Fountain: round stone basin, pedestal bowl and a spout; two frames.
  const fountain = (frame) => (g) => {
    const cx = 24;
    const yb = (x) => 33 + 9 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 22.5) ** 2));
    // basin
    part(g, (t) => {
      for (let x = 2; x <= 46; x++) {
        const b = Math.round(yb(x));
        for (let y = 33; y <= b + 4; y++) t.px(x, y, x < 16 ? 3 : 2);
      }
      for (let x = 2; x <= 46; x++) {
        const b = Math.round(yb(x));
        for (let y = b + 1; y <= b + 4; y++) if ((x + (y % 2 ? 0 : 3)) % 6 === 0) t.px(x, y, x < 16 ? 2 : 1);
      }
      t.ellipse(cx, 33, 22, 9, 3);
      t.ellipse(cx, 33, 19, 7, 2);
      t.ellipse(cx, 34, 18, 6, 4);
      // ripples
      const ph = frame * 2;
      for (const [x, y, l] of [[12, 34, 3], [30, 37, 4], [18, 38, 3], [34, 32, 3], [9, 36, 2]])
        t.hline(x + ph - 1, x + ph + l - 1, y, 5);
    });
    // pedestal
    part(g, (t) => {
      t.rect(21, 18, 6, 17, 2);
      t.vline(21, 18, 34, 3);
      t.vline(22, 18, 34, 3);
      t.hline(20, 27, 33, 2);
      t.hline(20, 27, 34, 5);
    });
    // upper bowl
    part(g, (t) => {
      t.ellipse(cx, 16, 9, 3, 3);
      for (let y = 17; y <= 20; y++) t.hline(cx - 9 + (y - 17) * 2, cx + 9 - (y - 17) * 2, y, 2);
      t.ellipse(cx, 16, 9, 3, 3);
      t.ellipse(cx, 16, 7, 2, 4);
      t.hline(cx - 5, cx - 3, 15, 5);
      // spout finial
      t.rect(23, 10, 2, 5, 3);
      t.hline(22, 25, 13, 2);
    });
    // water: jet and falling streams
    part(g, (t) => {
      t.vline(23, 3, 9, 6);
      t.vline(24, 3, 9, 5);
      const drops = frame ? [[20, 4], [28, 4], [17, 7], [31, 7], [15, 11], [33, 11]] : [[21, 3], [27, 3], [18, 5], [30, 5], [16, 9], [32, 9]];
      for (const [x, y] of drops) {
        t.px(x, y, 6);
        t.px(x, y + 1, 5);
      }
      const falls = frame ? [21, 25, 29] : [19, 23, 27];
      for (const x of [14, 34]) {
        for (let y = 18; y <= 31; y++) t.px(x, y, falls.includes(y) || falls.includes(y - 1) ? 6 : 5);
      }
      for (const x of [13, 35]) for (let y = 30; y <= 32; y++) t.px(x, y, 6);
    }, { soft: true });
  };
  A.paint('fountain_0', 'obj_fountain', 48, 48, fountain(0));
  A.paint('fountain_1', 'obj_fountain', 48, 48, fountain(1));

  A.paint('flower_pot', 'obj_pot', 16, 16, (g) => {
    part(g, (t) => {
      t.ellipse(8, 7, 5, 3, 4);
      t.line(4, 9, 2, 6, 4);
      t.line(11, 9, 13, 6, 4);
      const fl = (x, y) => {
        t.px(x - 1, y, 5); t.px(x + 1, y, 5); t.px(x, y - 1, 5); t.px(x, y + 1, 5); t.px(x, y, 6);
      };
      fl(5, 4); fl(10, 3); fl(8, 7); fl(12, 7); fl(3, 7);
    });
    part(g, (t) => {
      t.rect(3, 9, 10, 2, 3);
      t.hline(3, 12, 10, 2);
      for (let y = 11; y <= 14; y++) {
        const i = y >= 13 ? 5 : 4;
        t.hline(i, 15 - i, y, 2);
        t.hline(i, i + 2, y, 3);
      }
    });
  });

  A.paint('barrel', 'obj_barrel', 16, 16, (g) => {
    part(g, (t) => {
      for (let y = 4; y <= 14; y++) {
        const hw = y >= 7 && y <= 11 ? 6 : 5;
        for (let x = 8 - hw; x <= 7 + hw; x++) {
          const u = x - (8 - hw);
          t.px(x, y, u < 2 ? 4 : x >= 6 + hw ? 2 : 3);
        }
      }
      for (const x of [6, 10]) t.vline(x, 5, 14, 2);
      for (const y of [6, 12]) {
        for (let x = 1; x <= 14; x++) if (t.get(x, y)) t.px(x, y, 5);
      }
      t.hline(3, 12, 14, 2);
      t.ellipse(8, 4, 5, 2, 3);
      t.ellipse(8, 4, 4, 1, 4);
      t.hline(5, 10, 4, 3);
    });
  });

  A.paint('crate', 'obj_wood', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(1, 3, 14, 3, 4);
      t.hline(1, 14, 3, 5);
      t.vline(5, 4, 5, 3);
      t.vline(10, 4, 5, 3);
      t.rect(1, 7, 14, 8, 3);
      t.hline(1, 14, 6, 1);
      // frame
      t.hline(1, 14, 7, 4);
      t.vline(1, 7, 14, 4);
      t.vline(2, 7, 14, 4);
      t.vline(13, 7, 14, 2);
      t.vline(14, 7, 14, 2);
      t.hline(1, 14, 14, 2);
      t.line(3, 13, 12, 8, 4);
      t.line(4, 13, 12, 9, 2);
    });
  });

  A.paint('noticeboard', 'obj_board', 32, 32, (g) => {
    part(g, (t) => {
      for (const x of [4, 25]) {
        t.rect(x, 6, 3, 25, 3);
        t.vline(x + 2, 6, 30, 2);
      }
    });
    part(g, (t) => {
      t.rect(2, 8, 28, 16, 2);
      t.rect(4, 10, 24, 12, 3);
      t.hline(4, 27, 10, 2);
      // papers
      t.rect(6, 12, 6, 7, 5);
      for (const y of [14, 16]) t.hline(7, 10, y, 2);
      t.px(8, 12, 6);
      t.rect(14, 11, 6, 8, 5);
      t.rect(15, 13, 4, 3, 4);
      t.hline(15, 18, 17, 2);
      t.px(16, 11, 6);
      t.rect(22, 13, 4, 5, 5);
      t.hline(22, 25, 15, 6);
      t.px(23, 13, 6);
    });
    part(g, (t) => {
      for (let y = 2; y <= 6; y++) {
        const inset = 7 - y;
        for (let x = inset; x <= 31 - inset; x++) t.px(x, y, y === 2 ? 4 : y === 6 ? 2 : (x + y) % 4 === 0 ? 2 : 3);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Forest
// ---------------------------------------------------------------------------
function drawForest(A) {
  A.paint('hot_spring', 'obj_spring', 48, 32, (g) => {
    part(g, (t) => {
      t.ellipse(24, 16, 19, 11, 2);
      t.ellipse(24, 17, 17, 9, 4);
      t.ellipse(24, 18, 16, 8, 5);
      despeckle(t);
      for (const [x, y, l] of [[14, 15, 4], [26, 13, 5], [18, 21, 3], [30, 20, 4], [10, 19, 2], [36, 16, 3]]) t.hline(x, x + l, y, 6);
    });
    // rim stones
    const stones = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      stones.push([24 + Math.cos(a) * 18.5, 16 + Math.sin(a) * 10.5, i]);
    }
    stones.sort((a, b) => a[1] - b[1]);
    for (const [sx, sy, i] of stones)
      part(g, (t) => {
        const rx = 3 + (i % 3 === 0 ? 1 : 0), ry = 2 + (sy > 16 ? 1 : 0);
        t.ellipse(Math.round(sx), Math.round(sy), rx, ry, 2);
        despeckle(t);
        t.ellipse(Math.round(sx) - 1, Math.round(sy) - 1, rx - 1, ry - 1, 3);
      });
    settle(g);
  });

  A.paint('stepping_stone', 'obj_stone', 16, 16, (g) => {
    part(g, (t) => {
      t.ellipse(8, 11, 6, 3, 2);
      t.ellipse(8, 10, 6, 3, 3);
      despeckle(t);
      rim(t, 3, 4, -1, -1);
      rim(t, 3, 4, 0, -1);
      t.px(10, 10, 2);
      t.px(11, 10, 2);
      t.px(5, 9, 4);
    });
  });
}
