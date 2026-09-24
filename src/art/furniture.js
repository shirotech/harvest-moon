// Art module: furniture — interior props (home, shop, barn, coop, smithy).
// See docs/ART_GUIDE.md for the sprite contract.
//
// Original Moonlit Acres pixel art, top-down 3/4 view (top surfaces visible,
// front faces below), lit from the top-left, bottom-aligned, outlined with
// index 1 (#181010). Wall hangings (calendar, painting) are centred.

// ---------------------------------------------------------------------------
// Local drawing helpers (self-contained copy; see objects.js)
// ---------------------------------------------------------------------------

const layer = (g) => new g.constructor(g.w, g.h, g._b);

/** Draw a part on its own layer, outline its silhouette and composite it over g. */
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

/** Recolour pixels of index `from` (any when null) whose neighbour at (dx,dy) is empty. */
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
  const O = '#181010';
  A.pal('fur_wood', [O, '#602818', '#984830', '#c87848', '#e8b078']);
  A.pal('fur_bed', [O, '#703818', '#b06830', '#f0f0e0', '#3868a8', '#70a0d8']);
  A.pal('fur_tv', [O, '#584038', '#987050', '#304858', '#78a8b8', '#d0d0c8']);
  A.pal('fur_calendar', [O, '#a09890', '#f8f8e8', '#d04038', '#686060']);
  A.pal('fur_books', [O, '#602818', '#a85830', '#c03830', '#3858a8', '#d8b040']);
  A.pal('fur_dresser', [O, '#602818', '#984830', '#c87848', '#f0c848', '#a8c8d8']);
  A.pal('fur_fireplace', [O, '#883828', '#b85838', '#d8c8b0', '#a09080', '#302020']);
  A.pal('fur_fire', [O, '#704020', '#d83818', '#f88828', '#f8d048', '#f8f8c0']);
  A.pal('fur_plant', [O, '#305890', '#6090c8', '#287030', '#58a848']);
  A.pal('fur_rug', [O, '#883038', '#c04848', '#f0d8a8', '#388890']);
  A.pal('fur_stove', [O, '#303038', '#585868', '#9898a8', '#f09838', '#b86030']);
  A.pal('fur_counter', [O, '#704018', '#a86830', '#d09850', '#f0c880']);
  A.pal('fur_shelf', [O, '#602818', '#a85830', '#98c0a8', '#d8b878', '#c84838']);
  A.pal('fur_sack', [O, '#806038', '#b89058', '#e0c890', '#704028']);
  A.pal('fur_anvil', [O, '#383840', '#686878', '#a8a8b8', '#603820', '#986038']);
  A.pal('fur_forge', [O, '#585058', '#989090', '#a82818', '#f07828', '#f8d860']);
  A.pal('fur_rack', [O, '#602818', '#a86030', '#687078', '#b8c0c8']);
  A.pal('fur_hay', [O, '#987018', '#d0a838', '#f0d880', '#604018']);
  A.pal('fur_feedbin', [O, '#602818', '#984830', '#c87848', '#e8b078', '#e0c040']);
  A.pal('fur_trough', [O, '#603018', '#985028', '#c88048', '#98a030', '#d8d858']);
  A.pal('fur_diary', [O, '#602818', '#984830', '#c87848', '#f8f8e8', '#3858a8']);
  A.pal('fur_painting', [O, '#986020', '#e0b048', '#88c0e8', '#58a048', '#f8f8e8']);

  drawHome(A);
  drawFire(A);
  drawShop(A);
  drawBarn(A);
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
function drawHome(A) {
  // Bed: headboard at the top, pillow, turned-down sheet, patchwork quilt.
  A.paint('bed', 'fur_bed', 16, 32, (g) => {
    part(g, (t) => {
      t.rect(1, 7, 14, 23, 2);
    });
    part(g, (t) => {
      t.rect(1, 2, 14, 6, 3);
      t.hline(2, 13, 1, 3);
      t.rect(4, 3, 8, 3, 2);
      t.hline(1, 14, 7, 2);
      t.vline(1, 2, 7, 3);
    });
    part(g, (t) => {
      t.rect(2, 9, 12, 5, 4);
    });
    part(g, (t) => {
      t.rect(3, 9, 10, 4, 4);
      t.hline(4, 11, 12, 6);
      t.px(12, 11, 6);
    });
    part(g, (t) => {
      t.rect(1, 14, 14, 13, 6);
      t.hline(1, 14, 14, 4);
      t.hline(1, 14, 15, 4);
      for (let y = 17; y <= 26; y++)
        for (let x = 1; x <= 14; x++) if ((Math.floor((x - 1) / 3) + Math.floor((y - 17) / 3)) % 2 === 0) t.px(x, y, 5);
      for (let y = 16; y <= 26; y++) t.px(14, y, 5);
      t.hline(1, 14, 16, 6);
    });
    part(g, (t) => {
      t.rect(1, 27, 14, 4, 3);
      t.hline(1, 14, 30, 2);
      t.vline(14, 27, 30, 2);
      t.hline(3, 12, 28, 2);
    });
  });

  // Table: plank top, apron and four sturdy legs.
  A.paint('table', 'fur_wood', 32, 24, (g) => {
    part(g, (t) => {
      for (const x of [2, 27]) {
        t.rect(x, 13, 3, 10, 3);
        t.vline(x + 2, 13, 22, 2);
      }
    });
    part(g, (t) => {
      t.rect(1, 2, 30, 10, 4);
      t.hline(1, 30, 2, 5);
      t.hline(2, 29, 5, 3);
      t.hline(2, 29, 8, 3);
      t.rect(1, 12, 30, 3, 3);
      t.hline(1, 30, 14, 2);
      t.vline(30, 2, 14, 2);
      t.px(9, 4, 3); t.px(22, 7, 3); t.px(14, 10, 3);
    });
  });

  A.paint('chair', 'fur_wood', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(3, 1, 10, 8, 3);
      t.hline(3, 12, 1, 5);
      t.hline(3, 12, 2, 4);
      t.rect(5, 4, 6, 5, 0);
      t.vline(7, 4, 8, 3);
      t.vline(8, 4, 8, 2);
      t.vline(12, 1, 8, 2);
    });
    part(g, (t) => {
      t.rect(3, 12, 2, 3, 3);
      t.rect(11, 12, 2, 3, 2);
    });
    part(g, (t) => {
      t.rect(2, 8, 12, 3, 4);
      t.hline(2, 13, 8, 5);
      t.hline(2, 13, 11, 2);
      t.vline(13, 9, 11, 2);
    });
  });

  A.paint('stool', 'fur_wood', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(4, 9, 2, 6, 3);
      t.rect(10, 9, 2, 6, 2);
      t.rect(7, 9, 2, 5, 2);
      t.hline(5, 10, 12, 2);
    });
    part(g, (t) => {
      oval(t, 2, 5, 13, 11, 2);
      oval(t, 2, 4, 13, 10, 4);
      rim(t, 4, 5, -1, -1);
      t.px(9, 7, 3); t.px(6, 8, 3);
    });
  });

  // Small wood-cased CRT with rabbit-ear antenna on a little stand.
  A.paint('tv', 'fur_tv', 16, 16, (g) => {
    g.line(6, 3, 3, 0, 1);
    g.line(9, 3, 12, 0, 1);
    g.px(3, 0, 6);
    g.px(12, 0, 6);
    part(g, (t) => {
      t.rect(3, 12, 10, 1, 2);
      t.rect(3, 13, 1, 2, 2);
      t.rect(12, 13, 1, 2, 2);
    });
    part(g, (t) => {
      t.rect(1, 3, 14, 9, 3);
      t.vline(14, 3, 11, 2);
      t.hline(1, 14, 11, 2);
      t.rect(2, 4, 9, 7, 4);
      t.px(2, 4, 1); t.px(10, 4, 1); t.px(2, 10, 1); t.px(10, 10, 1);
      t.hline(3, 5, 5, 5);
      t.px(3, 6, 5);
      t.hline(4, 9, 8, 5);
      t.hline(5, 7, 9, 5);
      t.px(12, 5, 6);
      t.px(12, 7, 6);
      t.hline(12, 13, 9, 2);
    });
  });

  // Wall calendar: red header with rings, day grid, one day circled.
  A.paint('calendar', 'fur_calendar', 16, 16, (g) => {
    g.line(7, 0, 4, 2, 5);
    g.line(8, 0, 11, 2, 5);
    part(g, (t) => {
      t.rect(2, 3, 12, 11, 3);
      t.rect(2, 3, 12, 3, 4);
      t.px(5, 3, 5);
      t.px(10, 3, 5);
      for (let y = 7; y <= 12; y += 2) for (let x = 3; x <= 12; x += 2) t.px(x, y, 2);
      t.px(9, 9, 4);
      t.px(10, 9, 4);
      t.px(13, 13, 2);
      t.px(12, 13, 2);
      t.px(13, 12, 2);
    });
  });

  // Bookshelf: three shelves of mixed books.
  A.paint('bookshelf', 'fur_books', 16, 32, (g) => {
    part(g, (t) => {
      t.rect(1, 1, 14, 30, 3);
      t.vline(14, 1, 30, 2);
      t.hline(1, 14, 30, 2);
      // [width, colour, top offset, label band]; colour 0 = gap, -1 = a stack lying flat
      const shelves = [
        [3, 9, [[2, 4, 1, 1], [2, 5, 0, 0], [1, 6, 2, 0], [2, 4, 1, 0], [2, 6, 0, 1], [1, 0], [2, 5, 2, 1]]],
        [12, 18, [[2, 6, 1, 1], [1, 4, 0, 0], [2, 5, 2, 0], [3, -1], [1, 4, 1, 0], [2, 5, 0, 1], [1, 6, 2, 0]]],
        [21, 27, [[1, 5, 2, 0], [2, 4, 0, 1], [2, 6, 1, 0], [2, 5, 0, 1], [1, 0], [2, 4, 1, 1], [2, 6, 0, 0]]],
      ];
      for (const [y0, y1, books] of shelves) {
        t.rect(2, y0, 12, y1 - y0 + 1, 2);
        t.hline(2, 13, y0, 1);
        let x = 2;
        for (const [w, c, top, band] of books) {
          if (c > 0) {
            t.rect(x, y0 + 1 + top, w, y1 - y0 - top, c);
            if (band) t.hline(x, x + w - 1, y1 - 2, c === 6 ? 4 : 6);
          } else if (c < 0) {
            t.hline(x, x + w - 1, y1 - 2, 6);
            t.hline(x, x + w - 1, y1 - 1, 4);
            t.hline(x, x + w - 1, y1, 5);
          }
          x += w;
        }
      }
    });
  });

  // Dresser with a small standing mirror.
  A.paint('dresser', 'fur_dresser', 16, 32, (g) => {
    part(g, (t) => {
      oval(t, 4, 1, 11, 10, 3);
      oval(t, 5, 2, 10, 9, 6);
      t.px(6, 4, 4); t.px(6, 5, 4); t.px(7, 3, 4);
      t.vline(11, 4, 8, 2);
    });
    part(g, (t) => {
      t.rect(1, 10, 14, 19, 3);
      t.rect(1, 10, 14, 3, 4);
      t.hline(1, 14, 10, 4);
      for (const y of [13, 18, 23]) {
        t.hline(1, 14, y, 2);
        t.px(4, y + 2, 5);
        t.px(11, y + 2, 5);
      }
      t.hline(1, 14, 28, 2);
      t.vline(14, 11, 28, 2);
      t.vline(1, 13, 27, 4);
    });
    part(g, (t) => {
      t.rect(2, 29, 2, 2, 2);
      t.rect(12, 29, 2, 2, 2);
    });
  });

  // Plant: broad-leaved houseplant in a glazed pot.
  A.paint('plant', 'fur_plant', 16, 16, (g) => {
    part(g, (t) => {
      const leaf = (x0, y0, cx, cy, x1, y1) =>
        curve(t, x0, y0, cx, cy, x1, y1, (x, y, s) => {
          const wdt = s < 0.15 || s > 0.85 ? 0 : 1;
          for (let k = -wdt; k <= wdt; k++) t.px(x, y + k, k < 0 ? 5 : 4);
          if (s > 0.3 && s < 0.7) t.px(x, y, 5);
        });
      leaf(8, 10, 4, 8, 2, 3);
      leaf(8, 10, 12, 8, 13, 3);
      leaf(8, 10, 7, 5, 8, 1);
      leaf(7, 10, 3, 11, 1, 8);
      leaf(9, 10, 13, 11, 14, 8);
    });
    part(g, (t) => {
      t.rect(3, 10, 10, 2, 3);
      t.rect(4, 12, 8, 3, 2);
      t.vline(4, 12, 14, 3);
      t.hline(3, 12, 11, 2);
    });
  });

  // Rug: woven rug with fringe, bordered field and diamond medallion.
  A.paint('rug', 'fur_rug', 32, 32, (g) => {
    part(g, (t) => {
      t.rect(1, 3, 30, 26, 2);
      t.rect(3, 5, 26, 22, 4);
      t.rect(4, 6, 24, 20, 3);
      for (let x = 4; x <= 27; x += 2) {
        t.px(x, 4, 4);
        t.px(x + 1, 27, 4);
      }
      for (let y = 7; y <= 25; y += 2) {
        t.px(2, y, 4);
        t.px(29, y, 4);
      }
      // medallion
      for (let y = 9; y <= 22; y++)
        for (let x = 6; x <= 25; x++) {
          const d = Math.abs(x - 15.5) / 9 + Math.abs(y - 15.5) / 6.5;
          if (d <= 1) t.px(x, y, d > 0.8 ? 4 : d > 0.55 ? 5 : d > 0.3 ? 2 : 4);
        }
      for (const [x, y] of [[6, 8], [25, 8], [6, 23], [25, 23]]) {
        t.px(x, y, 5);
        t.px(x - 1, y, 4); t.px(x + 1, y, 4); t.px(x, y - 1, 4); t.px(x, y + 1, 4);
      }
    });
    // fringe tassels
    for (let x = 3; x <= 28; x += 2) {
      g.px(x, 0, 4); g.px(x, 1, 4);
      g.px(x, 30, 4); g.px(x, 31, 4);
    }
  });

  // Cast-iron cook stove with a kettle and a stovepipe.
  A.paint('stove', 'fur_stove', 16, 32, (g) => {
    part(g, (t) => {
      t.rect(10, 1, 3, 13, 3);
      t.vline(12, 1, 13, 2);
      t.hline(9, 13, 6, 4);
      t.hline(10, 12, 7, 2);
    });
    part(g, (t) => {
      t.rect(1, 13, 14, 15, 3);
      t.rect(1, 13, 14, 4, 4);
      t.hline(1, 14, 17, 2);
      oval(t, 9, 14, 13, 16, 2);
      t.hline(10, 12, 15, 1);
      t.vline(14, 13, 27, 2);
      // oven door
      t.rect(2, 19, 7, 7, 2);
      t.rect(3, 20, 5, 5, 3);
      t.hline(3, 7, 21, 4);
      // firebox
      t.rect(10, 19, 4, 5, 2);
      t.hline(11, 12, 21, 5);
      t.hline(11, 12, 22, 5);
      t.hline(1, 14, 27, 2);
    });
    part(g, (t) => {
      t.rect(2, 28, 2, 3, 2);
      t.rect(12, 28, 2, 3, 2);
    });
    // kettle on the left hob
    part(g, (t) => {
      oval(t, 2, 11, 7, 15, 6);
      t.hline(3, 6, 10, 6);
      t.px(4, 9, 3);
      t.px(5, 9, 3);
      t.px(3, 12, 5);
      t.px(3, 13, 5);
      t.px(8, 12, 6);
      t.px(9, 11, 6);
      t.hline(3, 6, 15, 2);
    });
  });

  // Writing desk with an open journal, inkwell and quill.
  A.paint('diary', 'fur_diary', 16, 24, (g) => {
    part(g, (t) => {
      t.rect(2, 15, 2, 8, 3);
      t.rect(12, 15, 2, 8, 2);
    });
    part(g, (t) => {
      t.rect(1, 8, 14, 5, 4);
      t.rect(1, 13, 14, 3, 3);
      t.hline(1, 14, 15, 2);
      t.vline(14, 8, 15, 2);
      t.hline(6, 9, 14, 2);
    });
    part(g, (t) => {
      t.art(1, 6, `
        .55555.55555.
        5544455544455
        5555555555555
        5544455544555
        5555555555555
        6666666666666
      `);
      t.vline(7, 7, 10, 3);
    });
    part(g, (t) => {
      t.rect(12, 9, 2, 2, 6);
      t.px(12, 8, 2);
      t.px(13, 8, 2);
    });
    part(g, (t) => {
      t.px(13, 7, 2);
      t.px(13, 6, 5);
      t.px(14, 5, 5);
      t.px(13, 5, 5);
      t.px(14, 4, 5);
      t.px(14, 3, 5);
      t.px(14, 2, 5);
    }, { soft: true });
  });

  // Painting: gilt frame, moonlit hills.
  A.paint('painting', 'fur_painting', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(1, 2, 14, 12, 3);
      t.hline(1, 14, 13, 2);
      t.vline(14, 2, 13, 2);
      t.rect(3, 4, 10, 8, 4);
      for (let x = 3; x <= 12; x++) {
        const hy = Math.round(8 + Math.sin((x - 3) / 2.2) * 1.5);
        for (let y = hy; y <= 11; y++) t.px(x, y, 5);
      }
      t.hline(3, 12, 11, 5);
      t.rect(9, 5, 2, 2, 6);
      t.px(4, 6, 6);
      t.px(5, 6, 6);
      t.hline(3, 12, 4, 2);
      t.vline(3, 4, 11, 2);
    });
  });

  // Round table on a pedestal.
  A.paint('round_table', 'fur_wood', 32, 24, (g) => {
    part(g, (t) => {
      t.rect(13, 14, 6, 7, 3);
      t.vline(17, 14, 20, 2);
      t.vline(18, 14, 20, 2);
      oval(t, 8, 20, 23, 22, 3);
      t.hline(9, 22, 22, 2);
    });
    part(g, (t) => {
      oval(t, 1, 3, 30, 15, 2);
      oval(t, 1, 1, 30, 13, 4);
      rim(t, 4, 5, -1, -1);
      rim(t, 4, 5, 0, -1);
      t.hline(8, 13, 6, 3);
      t.hline(17, 24, 9, 3);
      t.hline(11, 15, 11, 3);
    });
  });
}

// ---------------------------------------------------------------------------
// Fireplace + fire
// ---------------------------------------------------------------------------
function drawFire(A) {
  // Opening spans x 8..23, y 14..28 so fire_0/1 (drawn at 8,14) sits inside.
  A.paint('fireplace', 'fur_fireplace', 32, 32, (g) => {
    part(g, (t) => {
      t.rect(2, 1, 28, 28, 3);
      for (let y = 1; y <= 28; y++) {
        const row = Math.floor((y - 1) / 3);
        for (let x = 2; x <= 29; x++) {
          if ((y - 1) % 3 === 2 || (x + (row % 2) * 3) % 6 === 0) t.px(x, y, 2);
        }
      }
      t.vline(29, 1, 28, 2);
    });
    part(g, (t) => {
      t.rect(1, 9, 30, 2, 4);
      t.hline(1, 30, 11, 5);
    });
    part(g, (t) => {
      t.rect(6, 13, 20, 16, 5);
      t.rect(6, 13, 20, 1, 4);
      t.vline(6, 13, 28, 4);
      t.rect(8, 16, 16, 13, 6);
      t.hline(9, 22, 15, 6);
      t.hline(10, 21, 14, 6);
      t.hline(9, 10, 15, 5);
      t.hline(21, 22, 15, 5);
    });
    part(g, (t) => {
      t.rect(3, 29, 26, 2, 4);
      t.hline(3, 28, 30, 5);
    });
  });

  // Flames on two logs. No outline on the flames: they glow.
  const flame = (heights, sparks) => (g) => {
    const t = layer(g);
    heights.forEach((h, i) => {
      const x = i + 2;
      for (let y = 13 - h; y <= 13; y++) t.px(x, y, 3);
    });
    const m = (x, y) => t.get(x, y) > 0;
    const src = layer(g);
    src.data.set(t.data);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!src.get(x, y)) continue;
        let k = 0;
        while (k < 3 && src.get(x - k - 1, y) && src.get(x + k + 1, y) && src.get(x, y - 2 * (k + 1))) k++;
        t.px(x, y, 3 + k);
      }
    for (const [x, y] of sparks) t.px(x, y, 5);
    for (let k = 0; k < g.data.length; k++) if (t.data[k]) g.data[k] = t.data[k];
    part(g, (l) => {
      l.rect(2, 12, 12, 2, 2);
      l.hline(2, 13, 12, 2);
      l.px(2, 12, 4);
      l.px(2, 13, 3);
      l.rect(4, 14, 9, 1, 2);
      l.px(12, 14, 4);
    });
  };
  A.paint('fire_0', 'fur_fire', 16, 16, flame([2, 4, 7, 5, 8, 11, 10, 7, 9, 5, 3, 1], [[6, 1], [11, 3]]));
  A.paint('fire_1', 'fur_fire', 16, 16, flame([1, 5, 4, 8, 10, 8, 11, 9, 6, 7, 4, 2], [[9, 0], [4, 4]]));
}

// ---------------------------------------------------------------------------
// Shop / smithy
// ---------------------------------------------------------------------------
function drawShop(A) {
  // Counter pieces join seamlessly: counter_l + counter_m* + counter_r.
  const counter = (side) => (g) => {
    for (let x = 0; x < 16; x++) {
      g.px(x, 2, 1);
      g.px(x, 3, 5);
      for (let y = 4; y <= 6; y++) g.px(x, y, 4);
      g.px(x, 7, 3);
      g.px(x, 8, 1);
      for (let y = 9; y <= 12; y++) g.px(x, y, x % 8 === 3 ? 2 : x % 8 === 4 ? 4 : 3);
      g.px(x, 13, 2);
      g.px(x, 14, 2);
      g.px(x, 15, 1);
    }
    g.hline(5, 7, 5, 3);
    g.hline(12, 13, 4, 3);
    if (side === 'l') {
      g.vline(0, 3, 15, 1);
      g.px(0, 2, 0);
      g.vline(1, 3, 6, 5);
      g.vline(1, 9, 12, 4);
    }
    if (side === 'r') {
      g.vline(15, 3, 15, 1);
      g.px(15, 2, 0);
      g.vline(14, 4, 7, 3);
      g.vline(14, 9, 14, 2);
    }
  };
  A.paint('counter_l', 'fur_counter', 16, 16, counter('l'));
  A.paint('counter_m', 'fur_counter', 16, 16, counter('m'));
  A.paint('counter_r', 'fur_counter', 16, 16, counter('r'));

  // Shop shelving: jars, sacks and a crate of apples.
  A.paint('shelf_goods', 'fur_shelf', 32, 32, (g) => {
    part(g, (t) => {
      t.rect(1, 1, 30, 30, 3);
      t.rect(3, 3, 26, 8, 2);
      t.rect(3, 13, 26, 8, 2);
      t.rect(3, 23, 26, 6, 2);
      t.hline(1, 30, 30, 2);
      t.vline(30, 1, 30, 2);
      t.hline(3, 28, 11, 3);
    });
    // jars
    for (const [x, lid] of [[4, 6], [9, 2], [14, 6], [19, 2], [24, 6]])
      part(g, (t) => {
        t.rect(x, 5, 4, 5, 4);
        t.rect(x, 4, 4, 1, lid);
        t.hline(x, x + 3, 7, 5);
        t.px(x, 6, 5);
      }, { soft: true });
    // sacks
    for (const [x, w] of [[4, 7], [12, 8], [21, 7]])
      part(g, (t) => {
        oval(t, x, 14, x + w - 1, 20, 5);
        rim(t, 5, 3, 1, 1);
        const c = x + (w >> 1);
        t.px(c, 13, 5);
        t.px(c - 1, 12, 5);
        t.px(c + 1, 12, 5);
        t.px(c, 14, 2);
        t.hline(c - 1, c + 1, 17, 6);
      }, { soft: true });
    // apple crates
    for (const x of [4, 17])
      part(g, (t) => {
        t.rect(x, 26, 11, 3, 3);
        t.hline(x, x + 10, 28, 2);
        t.vline(x, 26, 28, 5);
        for (let k = 0; k < 4; k++) {
          const ax = x + 1 + k * 3 - (k > 1 ? 1 : 0);
          t.rect(ax, 24, 2, 2, 6);
          t.px(ax, 24, 5);
        }
        t.rect(x + 4, 23, 2, 2, 6);
        t.px(x + 4, 23, 5);
      }, { soft: true });
  });

  A.paint('sack_pile', 'fur_sack', 16, 16, (g) => {
    const sack = (x0, y0, x1, y1) =>
      part(g, (t) => {
        oval(t, x0, y0, x1, y1, 3);
        rim(t, 3, 2, 1, 1);
        rim(t, 3, 2, 0, 1);
        rim(t, 3, 4, -1, -1);
        const cx = (x0 + x1) >> 1;
        t.px(cx, y0 - 1, 3);
        t.px(cx + 1, y0 - 1, 3);
        t.px(cx, y0, 5);
        t.px(cx + 1, y0, 5);
      });
    sack(4, 3, 11, 9);
    sack(1, 8, 8, 14);
    sack(8, 8, 14, 14);
  });

  // Anvil on a wooden block.
  A.paint('anvil', 'fur_anvil', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(4, 10, 8, 5, 6);
      t.rect(8, 10, 4, 5, 5);
      t.hline(4, 11, 10, 6);
      t.px(6, 12, 5);
      t.px(6, 13, 5);
    });
    part(g, (t) => {
      t.art(1, 3, `
        ...44444444444
        44433333333332
        ..222333333322
        .....233322...
        .....233322...
        ....23333332..
      `);
    });
  });

  // Forge: stone hearth with glowing coals under a hood.
  const forge = (f) => (g) => {
    part(g, (t) => {
      t.rect(12, 1, 8, 6, 2);
      t.vline(12, 1, 6, 3);
      t.vline(13, 1, 6, 3);
      for (let y = 5; y <= 10; y++) {
        const i = y - 5;
        t.hline(10 - i, 21 + i, y, 3);
        t.px(21 + i, y, 2);
        t.px(20 + i, y, 2);
      }
      t.hline(5, 26, 10, 2);
      t.hline(12, 19, 3, 2);
    });
    part(g, (t) => {
      t.rect(2, 12, 28, 19, 3);
      for (let y = 18; y <= 30; y++) {
        const row = Math.floor((y - 18) / 3);
        for (let x = 2; x <= 29; x++) if ((y - 18) % 3 === 2 || (x + row * 3) % 7 === 0) t.px(x, y, 2);
      }
      t.vline(29, 12, 30, 2);
      t.hline(2, 29, 17, 2);
      // coal bed
      t.rect(5, 13, 22, 4, 4);
      const r = t.rng(11 + f * 7);
      for (let y = 13; y <= 16; y++)
        for (let x = 5; x <= 26; x++) {
          const v = r();
          t.px(x, y, v < 0.28 ? 5 : v < 0.38 ? 6 : v < 0.55 && y > 13 ? 1 : 4);
        }
      // ash door glow
      t.rect(12, 21, 8, 6, 1);
      t.rect(13, 23, 6, 3, f ? 5 : 4);
      t.hline(14, 17, 25, f ? 6 : 5);
    });
  };
  A.paint('forge_0', 'fur_forge', 32, 32, forge(0));
  A.paint('forge_1', 'fur_forge', 32, 32, forge(1));

  // Tool rack: a dark plank board on the wall with a rake, axe, hoe and spade.
  A.paint('tool_rack', 'fur_rack', 32, 32, (g) => {
    part(g, (t) => {
      t.rect(1, 2, 30, 27, 2);
      t.hline(1, 30, 2, 3);
      for (const y of [9, 16, 23]) t.hline(2, 29, y, 1);
      t.hline(1, 30, 28, 1);
    });
    part(g, (t) => {
      t.rect(1, 29, 2, 2, 2);
      t.rect(29, 29, 2, 2, 2);
    });
    // handles
    for (const [x, y0, y1] of [[6, 6, 26], [13, 5, 27], [20, 5, 26], [26, 4, 19]])
      part(g, (t) => {
        t.vline(x, y0, y1, 3);
      });
    // rake: tines up
    part(g, (t) => {
      t.hline(3, 9, 5, 4);
      t.hline(3, 9, 6, 4);
      t.hline(3, 9, 5, 5);
      for (let x = 3; x <= 9; x += 2) t.vline(x, 3, 4, 4);
    });
    // axe
    part(g, (t) => {
      t.rect(14, 4, 3, 5, 4);
      t.vline(17, 3, 9, 5);
      t.px(14, 4, 5);
    });
    // hoe
    part(g, (t) => {
      t.rect(20, 3, 4, 2, 4);
      t.hline(20, 23, 3, 5);
      t.rect(22, 5, 2, 3, 4);
      t.px(23, 7, 5);
    });
    // spade, blade down
    part(g, (t) => {
      t.hline(25, 27, 3, 3);
      t.rect(24, 20, 5, 6, 4);
      t.vline(24, 20, 24, 5);
      t.hline(25, 27, 26, 4);
    });
    // pegs
    for (const [x, y] of [[5, 7], [7, 7], [12, 10], [14, 10], [19, 9], [21, 9], [25, 6], [27, 6]]) g.px(x, y, 4);
  });
}

// ---------------------------------------------------------------------------
// Barn / coop
// ---------------------------------------------------------------------------
function drawBarn(A) {
  A.paint('hay_pile', 'fur_hay', 16, 16, (g) => {
    part(g, (t) => {
      oval(t, 1, 6, 14, 14, 3);
      oval(t, 4, 3, 11, 9, 3);
      rim(t, 3, 4, -1, -1);
      rim(t, 3, 4, 0, -1);
      rim(t, 3, 2, 1, 1);
      rim(t, 3, 2, 0, 1);
      for (const [x, y, d] of [[4, 9, 1], [8, 6, -1], [10, 10, 1], [6, 12, -1], [12, 12, 1]]) {
        t.px(x, y, 2);
        t.px(x + d, y + 1, 2);
      }
      for (const [x, y] of [[6, 8], [9, 11], [3, 11], [11, 8]]) t.px(x, y, 4);
      t.px(3, 3, 3);
      t.px(12, 4, 3);
      t.px(13, 5, 3);
    });
  });

  A.paint('feed_bin', 'fur_feedbin', 16, 16, (g) => {
    part(g, (t) => {
      t.rect(2, 8, 12, 7, 3);
      for (const x of [5, 10]) t.vline(x, 8, 14, 2);
      t.vline(2, 8, 14, 4);
      t.vline(13, 8, 14, 2);
      t.hline(2, 13, 14, 2);
      // wheat emblem
      t.vline(7, 10, 13, 6);
      t.px(6, 10, 6);
      t.px(8, 11, 6);
      t.px(6, 12, 6);
    });
    part(g, (t) => {
      t.rect(1, 3, 14, 4, 4);
      t.hline(1, 14, 3, 5);
      t.hline(1, 14, 6, 3);
      t.hline(1, 14, 7, 2);
      t.rect(6, 7, 4, 1, 2);
      t.hline(6, 9, 4, 3);
    });
  });

  // Troughs share one layout; the full one is heaped with fodder.
  const trough = (full) => (g) => {
    part(g, (t) => {
      t.rect(2, 13, 2, 2, 2);
      t.rect(12, 13, 2, 2, 2);
    });
    part(g, (t) => {
      t.rect(1, 6, 14, 7, 3);
      t.hline(1, 14, 6, 4);
      t.rect(3, 7, 10, 3, 2);
      t.hline(1, 14, 12, 2);
      t.hline(2, 13, 10, 4);
      t.vline(1, 7, 11, 4);
      t.vline(14, 7, 12, 2);
      if (full) {
        t.rect(3, 6, 10, 4, 5);
        const r = t.rng(5);
        for (let y = 5; y <= 9; y++)
          for (let x = 3; x <= 12; x++) {
            if (y === 5 && (x < 4 || x > 11 || r() < 0.4)) continue;
            if (r() < 0.45) t.px(x, y, 6);
            else if (y > 5) t.px(x, y, 5);
          }
        t.px(3, 5, 6);
      }
    });
  };
  A.paint('trough_empty', 'fur_trough', 16, 16, trough(false));
  A.paint('trough_full', 'fur_trough', 16, 16, trough(true));

  A.paint('nest', 'fur_hay', 16, 16, (g) => {
    part(g, (t) => {
      oval(t, 1, 7, 14, 14, 3);
      rim(t, 3, 2, 0, 1);
      rim(t, 3, 2, 1, 1);
      rim(t, 3, 4, -1, -1);
      oval(t, 4, 8, 11, 11, 5);
      t.hline(5, 10, 8, 2);
      for (const [x, y] of [[2, 10], [13, 10], [6, 13], [10, 13], [3, 12]]) t.px(x, y, 2);
      for (const [x, y] of [[4, 12], [9, 12], [12, 12]]) t.px(x, y, 4);
      t.px(1, 9, 3);
      t.px(14, 11, 3);
      t.px(1, 7, 4);
      t.px(13, 7, 4);
      t.px(14, 6, 4);
    });
  });
}
