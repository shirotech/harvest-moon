// Art module: tiles — 16x16 opaque ground, water autotiles, interior floors and
// walls. See docs/ART_GUIDE.md for the sprite contract.
//
// Everything here is drawn procedurally or from small ASCII stamps. Light comes
// from the top-left. Tiles that only repeat themselves (field, path, floors...)
// may wrap their details across the edges; tiles that are mixed with variants
// (grass_0..3, grass_flowers) keep every detail inside the tile.

const T = 16;
const wrap = (v) => ((v % T) + T) % T;

/** Plot with wrap-around so a detail crossing an edge re-enters on the other side. */
function wpx(g, x, y, i) {
  g.px(wrap(x), wrap(y), i);
}

/** ASCII stamp with wrap-around ('.' = skip). */
function wart(g, x, y, art) {
  const rows = art
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  rows.forEach((r, yy) => {
    for (let xx = 0; xx < r.length; xx++) {
      const c = r[xx];
      if (c !== '.' && c !== ' ') wpx(g, x + xx, y + yy, c.charCodeAt(0) - 48);
    }
  });
}

// ---------------------------------------------------------------------------
// Palettes

function palettes(A) {
  // grass: 1 deep, 2 tuft, 3 base, 4 light, 5 flower petal, 6 flower centre
  A.pal('grass@spring', ['#286020', '#489838', '#70b848', '#a0d868', '#f8a8c8', '#f8e050']);
  A.pal('grass@summer', ['#184818', '#307828', '#489838', '#78c050', '#f8f8e8', '#f8c030']);
  A.pal('grass@fall', ['#504010', '#806828', '#a89040', '#c8b860', '#d85828', '#f8d860']);
  A.pal('grass@winter', ['#586880', '#a8b8d0', '#d8e0f0', '#f8f8f8', '#488040', '#d83030']);

  // field (untilled farm dirt): 1 clod shadow, 2 dark, 3 base, 4 light
  A.pal('field@spring', ['#583818', '#886038', '#a87850', '#c89868']);
  A.pal('field@summer', ['#604020', '#907040', '#b08858', '#d0a878']);
  A.pal('field@fall', ['#503018', '#805030', '#a06840', '#c08858']);
  A.pal('field@winter', ['#706050', '#a8b8d0', '#d8e0f0', '#f8f8f8']);

  // tilled soil: 1 furrow, 2 dark slope, 3 ridge, 4 lit slope
  A.pal('soil', ['#402010', '#683818', '#885030', '#a87048']);
  A.pal('soil_wet', ['#200808', '#401810', '#582818', '#784028']);

  // path (packed dirt): 1 pebble shadow, 2 dark, 3 base, 4 light, 5 seasonal speck
  A.pal('path@spring', ['#806040', '#b09060', '#d0b078', '#e8d098', '#f8b8c8']);
  A.pal('path@summer', ['#806040', '#b89868', '#d8b880', '#f0d8a0', '#a08858']);
  A.pal('path@fall', ['#785030', '#a88050', '#c8a068', '#e0c088', '#d86020']);
  A.pal('path@winter', ['#787080', '#a8a8b8', '#c8c8d8', '#e8e8f0', '#f8f8f8']);

  A.pal('tile_cobble', ['#686068', '#908888', '#b0a8a8', '#d0c8c0']);
  A.pal('tile_sand', ['#a07840', '#c8a060', '#e8d098', '#f8f0c8']);
  A.pal('tile_bridge', ['#402010', '#805028', '#a87040', '#d0a060']);

  // water: 1 bank edge, 2 bank earth, 3 bank lip, 4 deep, 5 water, 6 light
  const water = ['#302010', '#805830', '#b08858', '#3868b0', '#5090d8', '#a0d0f8'];
  A.pal('water@spring', water);
  A.pal('water@summer', ['#302010', '#805830', '#b08858', '#3060a8', '#4888d0', '#98d0f8']);
  A.pal('water@fall', ['#302010', '#785028', '#a88050', '#305898', '#4880c0', '#90c0e8']);
  A.pal('water@winter', ['#383848', '#806858', '#e0e8f0', '#305080', '#4870a8', '#c0d8f0']);

  // interiors
  A.pal('tile_floor_wood', ['#583018', '#906030', '#b07840', '#d09858']);
  A.pal('tile_floor_stone', ['#686870', '#888890', '#a8a8b0', '#c8c8c8']);
  A.pal('tile_floor_hay', ['#806020', '#b09038', '#d0b058', '#f0d888']);
  A.pal('tile_doormat', ['#402018', '#883828', '#b86838', '#e0a060']);

  // walls: 1 outline, 2 paper dark, 3 paper, 4 paper light, 5 trim dark, 6 trim light,
  // 7 glass, 8 glass light. The outline and wood trim (1/5/6) are shared by every wall
  // palette so window_int (which keeps its own palette) matches any room's moulding.
  // wall_barn uses the same layout (2-4 planks, 5/6 beams) and also works for wall_top/low.
  const trim = (paper) => ['#382018', ...paper, '#784828', '#a87040', '#88c8f8', '#e0f8f8'];
  A.pal('wall_home', trim(['#c8a878', '#e8d0a0', '#f8f0c8']));
  A.pal('wall_shop', trim(['#78a068', '#a0c888', '#c8e8b0']));
  A.pal('wall_inn', trim(['#983040', '#b85058', '#d88880']));
  A.pal('wall_barn', trim(['#704020', '#985830', '#b87840']).slice(0, 6));
  A.pal('tile_window', trim(['#c8a878', '#e8d0a0', '#f8f0c8']));
}

// ---------------------------------------------------------------------------
// Grass

const TUFTS = [
  // small V tuft
  `
  2.2
  .2.
  `,
  // three blades with lit tips
  `
  4.4.4
  2.2.2
  .222.
  `,
  // low clump
  `
  .4.
  424
  `,
  // two blades
  `
  4..
  2.4
  .22
  `,
];

function grass(A) {
  const base = (g, seed, specks) => {
    g.fill(3);
    const r = g.rng(seed);
    for (let i = 0; i < specks; i++) {
      const x = 1 + ((r() * 14) | 0);
      const y = 1 + ((r() * 14) | 0);
      g.px(x, y, r() < 0.5 ? 2 : 4);
    }
  };
  A.paint('grass_0', 'grass', T, T, (g) => {
    base(g, 11, 4);
    g.art(3, 4, TUFTS[0]);
    g.art(10, 10, TUFTS[0]);
  });
  A.paint('grass_1', 'grass', T, T, (g) => {
    base(g, 23, 3);
    g.art(2, 9, TUFTS[1]);
    g.art(10, 3, TUFTS[3]);
  });
  A.paint('grass_2', 'grass', T, T, (g) => {
    base(g, 37, 5);
    g.art(8, 6, TUFTS[2]);
    g.art(2, 2, TUFTS[0]);
    g.art(11, 12, TUFTS[0]);
  });
  A.paint('grass_3', 'grass', T, T, (g) => {
    base(g, 51, 2);
    // a patch of taller blades
    g.art(3, 5, `
      ..4...4...
      .4.2.4.24.
      .2.4.2.42.
      4.42.4.2.4
      2.2.42.2.2
      .2.2.2.21.
      ..1.1.1...
    `);
  });
  A.paint('grass_flowers', 'grass', T, T, (g) => {
    base(g, 67, 3);
    const flower = `
      .5.
      565
      .5.
    `;
    g.art(2, 3, flower);
    g.px(3, 6, 1);
    g.art(10, 7, flower);
    g.px(11, 10, 1);
    g.art(5, 11, flower);
    g.px(6, 14, 1);
    g.art(11, 2, TUFTS[0]);
  });
}

// ---------------------------------------------------------------------------
// Farm ground

function farm(A) {
  A.paint('field', 'field', T, T, (g) => {
    g.fill(3);
    const r = g.rng(9);
    for (let i = 0; i < 10; i++) wpx(g, r() * 16, r() * 16, 2);
    for (let i = 0; i < 5; i++) wpx(g, r() * 16, r() * 16, 4);
    // clods: lit top, dark underside
    wart(g, 3, 3, `
      44.
      421
      .1.
    `);
    wart(g, 11, 9, `
      4.
      21
    `);
    wart(g, 6, 12, `
      .44
      421
    `);
    wart(g, 13, 1, `
      4
      1
    `);
  });

  // Two furrows per tile, running east-west so neighbouring plots join into rows.
  A.paint('tilled', 'soil', T, T, (g) => {
    g.fill(3);
    const wobble = [
      [0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    ];
    for (let band = 0; band < 2; band++)
      for (let x = 0; x < T; x++) {
        const y = band * 8 + 4 + wobble[band][x];
        g.px(x, y, 2); // shaded slope
        g.px(x, y + 1, 1); // furrow bottom
        g.px(x, y + 2, 4); // lit slope
      }
    // clods and pits on the ridges
    const clod = `
      4
      2
    `;
    for (const [x, y] of [[2, 1], [9, 2], [14, 0], [6, 10], [12, 9], [1, 13]]) wart(g, x, y, clod);
    for (const [x, y] of [[5, 2], [11, 0], [3, 9], [15, 11]]) wpx(g, x, y, 2);
    for (const [x, y] of [[11, 5], [3, 13]]) wpx(g, x, y, 2);
  });

  A.paint('path', 'path', T, T, (g) => {
    g.fill(3);
    const r = g.rng(77);
    for (let i = 0; i < 9; i++) wpx(g, r() * 16, r() * 16, 2);
    for (let i = 0; i < 4; i++) wpx(g, r() * 16, r() * 16, 4);
    const pebble = `
      .4.
      431
      .1.
    `;
    wart(g, 2, 2, pebble);
    wart(g, 10, 11, pebble);
    wart(g, 12, 4, `
      42
      21
    `);
    wart(g, 5, 9, '5');
    wart(g, 6, 10, '5');
    wart(g, 14, 14, '5');
  });

  A.paint('sand', 'tile_sand', T, T, (g) => {
    g.fill(3);
    const r = g.rng(123);
    for (let i = 0; i < 12; i++) wpx(g, r() * 16, r() * 16, 2);
    for (let i = 0; i < 6; i++) wpx(g, r() * 16, r() * 16, 4);
    // ripple marks
    wart(g, 2, 5, `
      .444.
      2...2
    `);
    wart(g, 9, 12, `
      .44.
      2..2
    `);
    wart(g, 12, 2, `
      1
    `);
  });
}

// ---------------------------------------------------------------------------
// Stone and wood

function stones(A) {
  // Cobble: irregular stones from a Voronoi split of a torus, so the tile wraps.
  const seeds = [[2, 2], [8, 1], [13, 3], [5, 7], [11, 8], [0, 10], [3, 13], [9, 13], [14, 13]];
  A.paint('cobble', 'tile_cobble', T, T, (g) => {
    const cell = new Int8Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        let d1 = 99, d2 = 99, best = 0;
        seeds.forEach(([sx, sy], k) => {
          for (const ox of [-T, 0, T])
            for (const oy of [-T, 0, T]) {
              const d = Math.hypot(x - sx - ox, (y - sy - oy) * 1.15);
              if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
            }
        });
        cell[y * T + x] = d2 - d1 < 1.1 ? -1 : best;
      }
    const at = (x, y) => cell[wrap(y) * T + wrap(x)];
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const c = at(x, y);
        let v = 1;
        if (c >= 0) {
          v = 3;
          if (at(x, y + 1) !== c || at(x + 1, y) !== c) v = 2;
          else if (at(x, y - 1) !== c || at(x - 1, y) !== c) v = 4;
        }
        g.px(x, y, v);
      }
  });

  A.paint('floor_stone', 'tile_floor_stone', T, T, (g) => {
    const slabs = [
      [0, 0, 8, 8], [8, 0, 8, 8],
      [4, 8, 8, 8], [12, 8, 8, 8],
    ];
    for (const [x, y, w, h] of slabs)
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          let v = 3;
          if (yy === 0 || xx === 0) v = 1;
          else if (yy === 1 && xx < w - 1) v = 4;
          else if (yy === h - 1) v = 2;
          wpx(g, x + xx, y + yy, v);
        }
    // wear and a hairline crack
    wpx(g, 4, 4, 2);
    wpx(g, 5, 5, 2);
    wpx(g, 10, 12, 2);
    wpx(g, 11, 12, 2);
    wpx(g, 13, 4, 4);
  });

  A.paint('floor_wood', 'tile_floor_wood', T, T, (g) => {
    // four planks, joints staggered
    const joints = [5, 13, 9, 1];
    for (let p = 0; p < 4; p++) {
      const y = p * 4;
      g.hline(0, T - 1, y, 1);
      g.hline(0, T - 1, y + 1, 4);
      g.hline(0, T - 1, y + 2, 3);
      g.hline(0, T - 1, y + 3, 3);
      const j = joints[p];
      wpx(g, j, y + 1, 1);
      wpx(g, j, y + 2, 1);
      wpx(g, j, y + 3, 1);
      wpx(g, j + 1, y + 1, 4);
      // grain
      wpx(g, j + 4, y + 2, 2);
      wpx(g, j + 5, y + 2, 2);
      wpx(g, j - 4, y + 3, 2);
    }
  });

  A.paint('floor_hay', 'tile_floor_hay', T, T, (g) => {
    g.fill(3);
    const r = g.rng(314);
    // one straw per 4x4 cell (jittered) keeps the scatter even
    for (let cy = 0; cy < 4; cy++)
      for (let cx = 0; cx < 4; cx++) {
        const x = cx * 4 + ((r() * 4) | 0);
        const y = cy * 4 + ((r() * 4) | 0);
        const dir = r() < 0.5 ? 1 : -1;
        const len = 3 + ((r() * 2) | 0);
        const col = r() < 0.6 ? 4 : 2;
        for (let k = 0; k < len; k++) wpx(g, x + k * dir, y + (k >> 1), col);
      }
    for (let i = 0; i < 4; i++) wpx(g, r() * 16, r() * 16, 1);
  });

  A.paint('doormat', 'tile_doormat', T, T, (g) => {
    g.fill(1);
    g.rect(1, 2, 14, 12, 2);
    g.rect(2, 3, 12, 10, 3);
    for (let x = 3; x < 13; x += 2) g.vline(x, 4, 11, 4);
    // fringe
    for (let x = 1; x < 15; x += 2) {
      g.px(x, 1, 4);
      g.px(x, 14, 4);
    }
  });

  // Bridges: rails on the sides the water is on, planks across the way of travel.
  const bridgeH = (g) => {
    // planks run north-south (travel east-west); rails at top and bottom
    for (let x = 0; x < T; x++) {
      const k = x % 4;
      const v = k === 0 ? 1 : k === 1 ? 4 : 3;
      g.vline(x, 0, T - 1, v);
    }
    for (let x = 0; x < T; x += 4) {
      g.px(x + 2, 5, 2);
      g.px(x + 3, 10, 2);
    }
    // rails
    g.hline(0, T - 1, 0, 1);
    g.hline(0, T - 1, 1, 4);
    g.hline(0, T - 1, 2, 2);
    g.hline(0, T - 1, 3, 1);
    g.hline(0, T - 1, 12, 1);
    g.hline(0, T - 1, 13, 4);
    g.hline(0, T - 1, 14, 2);
    g.hline(0, T - 1, 15, 1);
    for (let x = 1; x < T; x += 8) {
      g.px(x + 1, 4, 2);
      g.px(x + 1, 11, 2);
    }
  };
  A.paint('bridge_h', 'tile_bridge', T, T, bridgeH);
  A.paint('bridge_v', 'tile_bridge', T, T, (g) => {
    // transpose: a diagonal flip keeps the top-left lighting
    const h = A.sprites.get('bridge_h').data;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.px(x, y, h[x * T + y]);
  });
}

// ---------------------------------------------------------------------------
// Water autotiles

const WAVES = [
  // x, y, length
  [1, 1, 3],
  [9, 3, 4],
  [4, 7, 3],
  [13, 8, 3],
  [8, 11, 4],
  [1, 13, 3],
];

function waterBase(g, frame) {
  g.fill(5);
  for (const [x0, y, len] of WAVES) {
    const x = x0 + (frame ? 1 : 0);
    const l = frame ? len - 1 : len;
    for (let k = 0; k < l; k++) wpx(g, x + k, y, 6);
    wpx(g, x - 1, y + 1, 4);
    wpx(g, x + l, y + 1, 4);
  }
}

function water(A) {
  const B = 3; // bank thickness
  const R = 4; // inner corner radius
  for (let mask = 0; mask < 16; mask++) {
    const n = mask & 1, e = mask & 2, s = mask & 4, w = mask & 8;
    const land = (x, y) => {
      if (x < 0 || y < 0 || x >= T || y >= T) return false;
      if ((n && y < B) || (s && y >= T - B) || (w && x < B) || (e && x >= T - B)) return true;
      // round the inner corners where two banks meet
      const px = x + 0.5, py = y + 0.5;
      const lo = B + R, hi = T - B - R;
      const corner = (cx, cy) => (px - cx) ** 2 + (py - cy) ** 2 > R * R;
      if (n && w && px < lo && py < lo && corner(lo, lo)) return true;
      if (n && e && px > hi && py < lo && corner(hi, lo)) return true;
      if (s && w && px < lo && py > hi && corner(lo, hi)) return true;
      if (s && e && px > hi && py > hi && corner(hi, hi)) return true;
      return false;
    };
    for (let frame = 0; frame < 2; frame++) {
      A.paint(`water_${mask}_${frame}`, 'water', T, T, (g) => {
        waterBase(g, frame);
        if (!mask) return;
        // distance (chebyshev) from each land pixel to the nearest water pixel
        const isWater = (x, y) => x >= 0 && y >= 0 && x < T && y < T && !land(x, y);
        for (let y = 0; y < T; y++)
          for (let x = 0; x < T; x++) {
            if (!land(x, y)) continue;
            let d = 9;
            for (let yy = -3; yy <= 3; yy++)
              for (let xx = -3; xx <= 3; xx++)
                if (isWater(x + xx, y + yy)) d = Math.min(d, Math.max(Math.abs(xx), Math.abs(yy)));
            g.px(x, y, d === 1 ? 1 : d === 2 ? 2 : 3);
          }
        // shadow under north/west banks, glint along south/east ones
        for (let y = 0; y < T; y++)
          for (let x = 0; x < T; x++) {
            if (land(x, y)) continue;
            if (land(x, y - 1) || land(x - 1, y)) g.px(x, y, 4);
            else if ((land(x, y + 1) || land(x + 1, y)) && (x + y + frame) % 3 !== 0) g.px(x, y, 6);
          }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Interior walls

/** Wallpaper pattern at wall-local coordinates (y continues from wall_top into wall_low). */
function paper(x, y) {
  const xm = x % 8;
  if (xm === 0) return 4;
  const ym = y % 8;
  // small diamond motif between the stripes
  if (xm === 4 && ym === 2) return 2;
  if ((xm === 3 || xm === 5) && ym === 3) return 2;
  if (xm === 4 && ym === 4) return 2;
  return 3;
}

function walls(A) {
  const top = (g) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.px(x, y, paper(x, y));
    // crown moulding
    g.hline(0, T - 1, 0, 1);
    g.hline(0, T - 1, 1, 6);
    g.hline(0, T - 1, 2, 5);
    g.hline(0, T - 1, 3, 1);
    g.hline(0, T - 1, 4, 2);
  };
  A.paint('wall_top', 'wall_home', T, T, top);
  A.paint('wall_low', 'wall_home', T, T, (g) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.px(x, y, paper(x, y + T));
    // chair rail
    g.hline(0, T - 1, 5, 1);
    g.hline(0, T - 1, 6, 6);
    g.hline(0, T - 1, 7, 5);
    // beadboard wainscot
    for (let y = 8; y < 12; y++) for (let x = 0; x < T; x++) g.px(x, y, x % 4 === 0 ? 5 : 6);
    // skirting board
    g.hline(0, T - 1, 12, 5);
    g.hline(0, T - 1, 13, 1);
    g.hline(0, T - 1, 14, 5);
    g.hline(0, T - 1, 15, 1);
  });

  // The window fills the tile width below the moulding, so it sits on any wallpaper.
  // Same index layout as the wall palettes (7/8 = glass) if the engine wants to
  // draw it with wall_home / wall_shop / wall_inn instead of its own palette.
  A.paint('window_int', 'tile_window', T, T, (g) => {
    top(g);
    // frame
    g.rect(0, 4, 16, 11, 1);
    g.rect(1, 5, 14, 9, 6);
    g.hline(2, 13, 13, 5);
    // four panes of sky
    g.rect(2, 6, 5, 3, 7);
    g.rect(9, 6, 5, 3, 7);
    g.rect(2, 10, 5, 3, 7);
    g.rect(9, 10, 5, 3, 7);
    g.vline(7, 6, 12, 5);
    g.hline(2, 13, 9, 5);
    // glints
    for (const [x, y] of [[2, 6], [3, 6], [2, 7], [9, 6], [10, 6], [9, 7], [6, 12], [13, 12], [12, 12]]) g.px(x, y, 8);
    // sill
    g.hline(0, 15, 14, 6);
    g.hline(0, 15, 15, 1);
  });

  const planks = (g, y0, y1) => {
    for (let x = 0; x < T; x++) {
      const k = x % 4;
      const v = k === 0 ? 1 : k === 1 ? 4 : 3;
      g.vline(x, y0, y1, v);
    }
  };
  A.paint('wall_wood_top', 'wall_barn', T, T, (g) => {
    planks(g, 0, T - 1);
    g.px(2, 9, 2);
    g.px(10, 12, 2);
    g.px(14, 6, 2);
    // cross beam
    g.hline(0, T - 1, 0, 1);
    g.hline(0, T - 1, 1, 6);
    g.hline(0, T - 1, 2, 5);
    g.hline(0, T - 1, 3, 5);
    g.hline(0, T - 1, 4, 1);
  });
  A.paint('wall_wood_low', 'wall_barn', T, T, (g) => {
    planks(g, 0, T - 1);
    g.px(6, 3, 2);
    g.px(13, 7, 2);
    // kick board
    g.hline(0, T - 1, 11, 1);
    g.hline(0, T - 1, 12, 6);
    g.hline(0, T - 1, 13, 5);
    g.hline(0, T - 1, 14, 5);
    g.hline(0, T - 1, 15, 1);
  });
}

export function register(A) {
  palettes(A);
  grass(A);
  farm(A);
  stones(A);
  water(A);
  walls(A);
}
