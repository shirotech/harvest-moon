// Art module: crops — plants drawn on top of a `tilled` tile.
// See docs/ART_GUIDE.md for the sprite contract.
//
// Palette layout shared by every crop_<crop> palette:
//   1 outline, 2 leaf dark, 3 leaf mid, 4 leaf light,
//   5 produce dark, 6 produce mid, 7 produce light, 8 extra (flower / seeds / tassel)
// Plants are centred with their base on row 12-13 so furrowed soil shows all round.

const LEAF = ['#183018', '#307828', '#50a030', '#88d050'];
const P = [1, 5, 6, 7]; // produce ramp for blob()

function palettes(A) {
  A.pal('crop_seed', ['#301808', '#805830', '#c8a060', '#f0e0b0']);
  A.pal('crop_dead', ['#281808', '#604020', '#907040', '#b8a068']);
  A.pal('crop_turnip', [...LEAF, '#983078', '#d070b0', '#f8f0f0', '#d0c0d8']);
  A.pal('crop_potato', [...LEAF, '#a07838', '#d0a860', '#f0d898', '#f0e0f8']);
  A.pal('crop_strawberry', [...LEAF, '#a01828', '#e03030', '#f88878', '#f8f0c0']);
  A.pal('crop_tomato', [...LEAF, '#a82010', '#e84828', '#f8a070', '#f8d838']);
  A.pal('crop_corn', [...LEAF, '#c08010', '#f0c030', '#f8f080', '#c89858']); // 5/8 spare
  A.pal('crop_melon', [...LEAF, '#285818', '#a0d058', '#e0f8a8', '#f8d030']);
  A.pal('crop_carrot', [...LEAF, '#b04808', '#f07818', '#f8b050', '#f8f0d0']);
  A.pal('crop_eggplant', [...LEAF, '#301840', '#683890', '#a878d0', '#f8e040']);
  A.pal('crop_pumpkin', [...LEAF, '#a83800', '#e87818', '#f8b040', '#f8e060']);
}

// ---------------------------------------------------------------------------
// helpers

function measure(art) {
  const rows = art
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`crop art row ${i} is ${r.length} wide, expected ${w}: ${r}`);
  });
  return { w, h: rows.length };
}

/** Draw ASCII art centred horizontally with its last row on `base`. */
function place(g, art, base, dx = 0) {
  const { w, h } = measure(art);
  g.art(((g.w - w) >> 1) + dx, base - h + 1, art);
}

/** A shaded round clump (leaf or fruit) with its own outline, lit from the top-left. */
function blob(g, cx, cy, rx, ry, ramp = [1, 2, 3, 4]) {
  const [o, d, m, l] = ramp;
  g.ellipse(cx, cy, rx + 1, ry + 1, o);
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) > 1) continue;
      const t = x / (rx + 0.5) + y / (ry + 0.5);
      g.px(cx + x, cy + y, t < -0.7 ? l : t > 0.55 ? d : m);
    }
}

/** Polyline. */
function poly(g, pts, c) {
  for (let i = 1; i < pts.length; i++) g.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c);
}

/** Wrap every filled pixel in a 1px outline (4-neighbour), leaving existing outlines alone. */
function outline(g, o = 1) {
  const src = g.data.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : src[y * g.w + x]);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (at(x, y)) continue;
      const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (n.some((v) => v && v !== o)) g.px(x, y, o);
    }
}

/**
 * Paint a crop sprite; fn gets the canvas and the base row (last filled row).
 * Ripe plants fold the dark leaf shade into the mid shade so leaves + produce
 * stay within 6 colours (the outline keeps the leaves readable).
 */
function plant(A, name, pal, h, fn, { ripe = false } = {}) {
  A.paint(name, pal, 16, h, (g) => {
    fn(g, h - 4);
    if (ripe) g.replace(2, 3);
    outline(g);
    const used = new Set(g.data);
    used.delete(0);
    if (used.size > 6) throw new Error(`${name} uses ${used.size} colours (max 6)`);
  });
}
const RIPE = { ripe: true };

// ---------------------------------------------------------------------------
// shared shapes (fill only — the outline pass adds the contour)

const SPROUT_ROUND = `
  44...44
  433.433
  .32.23.
  ...2...
  ...2...
`;

const SPROUT_BLADE = `
  ..4..
  4.4..
  3.3.4
  3.33.
  .33..
  ..2..
`;

// ---------------------------------------------------------------------------

function seedAndDead(A) {
  A.paint('crop_seed', 'crop_seed', 16, 16, (g) => {
    place(g, `
      ....11......
      ...1431.11..
      ....11.1431.
      .11.....11..
      1431..11....
      .11..1431...
      ......11....
    `, 12);
  });

  plant(A, 'crop_dead', 'crop_dead', 16, (g, b) => {
    // stem flopped over at the top
    g.vline(7, b - 7, b, 3);
    g.vline(8, b - 5, b, 2);
    poly(g, [[7, b - 7], [8, b - 9], [10, b - 9], [11, b - 7], [11, b - 5]], 3);
    g.px(11, b - 4, 2);
    // limp leaves hanging down either side
    poly(g, [[6, b - 4], [4, b - 5], [2, b - 4], [1, b - 2]], 4);
    poly(g, [[6, b - 3], [4, b - 4], [2, b - 3]], 2);
    poly(g, [[9, b - 2], [11, b - 2], [13, b - 1], [13, b]], 3);
    // a fallen leaf
    g.hline(3, 4, b, 2);
    g.px(2, b, 3);
  });
}

function turnip(A) {
  plant(A, 'crop_turnip_1', 'crop_turnip', 16, (g, b) => place(g, SPROUT_ROUND, b));
  const leaves = `
    .....1.....
    11..141..11
    141.141.141
    13411311431
    .131131131.
    ..1212121..
  `;
  plant(A, 'crop_turnip_2', 'crop_turnip', 16, (g, b) => {
    place(g, leaves + `
      ...12221...
      ....121....
    `, b);
  });
  plant(A, 'crop_turnip_3', 'crop_turnip', 16, (g, b) => {
    place(g, leaves + `
      ..1565651..
      .156666651.
      .167777761.
      .177777771.
      ..1777771..
    `, b + 1);
  }, RIPE);
}

function potato(A) {
  plant(A, 'crop_potato_1', 'crop_potato', 16, (g, b) => {
    place(g, `
      ...44...
      ..4433..
      44.33.43
      4332.433
      .33223..
      ...2....
    `, b);
  });
  plant(A, 'crop_potato_2', 'crop_potato', 16, (g, b) => {
    blob(g, 5, b - 3, 2, 2);
    blob(g, 10, b - 3, 2, 2);
    blob(g, 7, b - 6, 2, 2);
    blob(g, 8, b - 1, 3, 2);
    // pale flowers
    g.art(6, b - 10, `
      .8.
      868
      .8.
    `);
    g.px(11, b - 5, 8);
    g.px(3, b - 4, 8);
  });
  plant(A, 'crop_potato_3', 'crop_potato', 16, (g, b) => {
    blob(g, 4, b - 5, 2, 2);
    blob(g, 11, b - 5, 2, 2);
    blob(g, 7, b - 8, 3, 2);
    blob(g, 8, b - 4, 3, 2);
    // potatoes pushing out of the soil
    blob(g, 4, b, 2, 1, P);
    blob(g, 11, b, 2, 1, P);
    blob(g, 8, b, 1, 1, P);
  }, RIPE);
}

function strawberry(A) {
  plant(A, 'crop_strawberry_1', 'crop_strawberry', 16, (g, b) => {
    place(g, `
      .4.4.
      43.34
      .323.
      ..2..
    `, b);
  });
  const leaves = (g, b) => {
    blob(g, 4, b - 4, 2, 2);
    blob(g, 11, b - 4, 2, 2);
    blob(g, 7, b - 6, 2, 2);
    blob(g, 8, b - 2, 3, 2);
  };
  plant(A, 'crop_strawberry_2', 'crop_strawberry', 16, (g, b) => {
    leaves(g, b);
    const flower = `
      .8.
      878
      .8.
    `;
    g.art(3, b - 8, flower);
    g.art(10, b - 7, flower);
    g.px(7, b - 1, 8);
  });
  plant(A, 'crop_strawberry_3', 'crop_strawberry', 16, (g, b) => {
    leaves(g, b);
    const berry = `
      .131.
      17661
      16761
      .151.
      ..1..
    `;
    g.art(1, b - 5, berry);
    g.art(10, b - 6, berry);
    g.art(6, b - 3, berry);
  }, RIPE);
}

function tomato(A) {
  plant(A, 'crop_tomato_1', 'crop_tomato', 16, (g, b) => {
    place(g, `
      ..4..
      .434.
      4.3.4
      32323
      .323.
      ..2..
    `, b);
  });
  const foliage = (g, b) => {
    g.vline(8, b - 17, b, 2); // main vine
    blob(g, 5, b - 14, 2, 2);
    blob(g, 11, b - 11, 2, 2);
    blob(g, 4, b - 8, 2, 2);
    blob(g, 11, b - 4, 2, 2);
    blob(g, 5, b - 2, 2, 2);
    blob(g, 9, b - 16, 2, 1);
  };
  const flower = `
    .8.
    828
    .8.
  `;
  const small = `
    .111.
    17661
    16651
    16551
    .111.
  `;
  plant(A, 'crop_tomato_2', 'crop_tomato', 24, (g, b) => {
    foliage(g, b);
    g.art(7, b - 13, flower);
    g.art(2, b - 11, flower);
    g.art(7, b - 6, flower);
    g.art(12, b - 8, flower);
  });
  plant(A, 'crop_tomato_3', 'crop_tomato', 24, (g, b) => {
    foliage(g, b);
    blob(g, 9, b - 12, 2, 2, P);
    blob(g, 8, b - 5, 2, 2, P);
    g.art(1, b - 12, small);
    g.art(11, b - 9, small);
    g.px(9, b - 15, 2);
    g.px(8, b - 8, 2);
  }, RIPE);
}

function corn(A) {
  plant(A, 'crop_corn_1', 'crop_corn', 16, (g, b) => place(g, SPROUT_BLADE, b));
  // a 2px stalk with arching two-tone leaves
  const leafL = (g, x, y, len) => {
    poly(g, [[x, y], [x - 2, y - 2], [x - len, y - 2], [x - len - 1, y]], 4);
    poly(g, [[x, y + 1], [x - 2, y - 1], [x - len, y - 1]], 3);
  };
  const leafR = (g, x, y, len) => {
    poly(g, [[x, y], [x + 2, y - 2], [x + len, y - 2], [x + len + 1, y]], 4);
    poly(g, [[x, y + 1], [x + 2, y - 1], [x + len, y - 1]], 3);
  };
  const stalk = (g, b, top) => {
    g.vline(7, top, b, 4);
    g.vline(8, top, b, 3);
    g.px(8, b, 2);
    g.px(7, b, 3);
  };
  plant(A, 'crop_corn_2', 'crop_corn', 24, (g, b) => {
    stalk(g, b, b - 15);
    leafL(g, 6, b - 12, 3);
    leafR(g, 9, b - 8, 3);
    leafL(g, 6, b - 4, 3);
    leafR(g, 9, b - 1, 2);
    poly(g, [[7, b - 15], [6, b - 17]], 4);
    poly(g, [[8, b - 15], [9, b - 16]], 3);
  });
  plant(A, 'crop_corn_3', 'crop_corn', 24, (g, b) => {
    stalk(g, b, b - 16);
    leafR(g, 9, b - 12, 3);
    leafL(g, 6, b - 3, 3);
    leafR(g, 9, b - 1, 2);
    // tassel
    g.art(5, b - 20, `
      7.6.7
      .676.
      ..6..
    `);
    // ripe cobs, husks peeled back
    const cob = `
      .7.
      676
      767
      676
      767
      323
      .3.
    `;
    g.art(2, b - 14, cob);
    g.art(10, b - 9, cob);
  });
}

function melon(A) {
  plant(A, 'crop_melon_1', 'crop_melon', 16, (g, b) => place(g, SPROUT_ROUND, b));
  plant(A, 'crop_melon_2', 'crop_melon', 16, (g, b) => {
    poly(g, [[2, b], [6, b - 1], [10, b], [13, b - 1]], 2);
    blob(g, 4, b - 3, 2, 2);
    blob(g, 11, b - 3, 2, 2);
    blob(g, 8, b - 5, 2, 2);
    g.art(6, b - 2, `
      .8.
      858
      .8.
    `);
  });
  plant(A, 'crop_melon_3', 'crop_melon', 16, (g, b) => {
    blob(g, 3, b - 6, 2, 2);
    blob(g, 12, b - 6, 2, 2);
    // the melon lies on its side: pale rind with dark stripes running end to end
    const cy = b - 3;
    blob(g, 8, cy, 5, 3, [1, 3, 6, 7]);
    for (const k of [-0.6, 0, 0.6])
      for (let x = -4; x <= 4; x++) {
        const y = Math.round(k * 3.5 * Math.sqrt(1 - (x / 5.5) ** 2));
        if (g.get(8 + x, cy + y) > 1) g.px(8 + x, cy + y, 5);
      }
    g.px(5, cy - 2, 7);
    g.px(6, cy - 2, 7);
    g.px(4, cy - 1, 7);
    // curly stem
    g.art(8, cy - 6, `
      .2
      2.
      .2
    `);
  }, RIPE);
}

function carrot(A) {
  plant(A, 'crop_carrot_1', 'crop_carrot', 16, (g, b) => {
    place(g, `
      4...4
      34.43
      .343.
      ..3..
      ..2..
    `, b);
  });
  const fronds = `
    4...4...4
    34.434.43
    .3..3..3.
    .43.3.34.
    ..3.3.3..
    ..34343..
    ...323...
  `;
  plant(A, 'crop_carrot_2', 'crop_carrot', 16, (g, b) => place(g, fronds + `
    ....2....
  `, b));
  plant(A, 'crop_carrot_3', 'crop_carrot', 16, (g, b) => {
    place(g, fronds, b - 3);
    place(g, `
      6777665
      .67665.
      ..665..
    `, b + 1);
  }, RIPE);
}

function eggplant(A) {
  plant(A, 'crop_eggplant_1', 'crop_eggplant', 16, (g, b) => {
    place(g, `
      .4...4.
      443.344
      .33233.
      ...2...
      ...2...
    `, b);
  });
  const bush = (g, b) => {
    g.vline(7, b - 8, b, 2);
    blob(g, 4, b - 7, 2, 2);
    blob(g, 11, b - 7, 2, 2);
    blob(g, 7, b - 10, 2, 2);
  };
  plant(A, 'crop_eggplant_2', 'crop_eggplant', 16, (g, b) => {
    bush(g, b);
    g.art(9, b - 4, `
      .7.
      787
      .7.
    `);
  });
  plant(A, 'crop_eggplant_3', 'crop_eggplant', 16, (g, b) => {
    bush(g, b);
    const fruit = `
      .131.
      12321
      17661
      17661
      16651
      16551
      .111.
    `;
    g.art(2, b - 5, fruit);
    g.art(9, b - 4, fruit);
  }, RIPE);
}

function pumpkin(A) {
  plant(A, 'crop_pumpkin_1', 'crop_pumpkin', 16, (g, b) => place(g, SPROUT_ROUND, b));
  plant(A, 'crop_pumpkin_2', 'crop_pumpkin', 16, (g, b) => {
    poly(g, [[2, b], [7, b - 1], [13, b]], 2);
    blob(g, 4, b - 4, 3, 2);
    blob(g, 11, b - 3, 2, 2);
    g.art(8, b - 1, `
      .8.
      888
    `);
  });
  plant(A, 'crop_pumpkin_3', 'crop_pumpkin', 16, (g, b) => {
    blob(g, 3, b - 7, 2, 2);
    blob(g, 13, b - 6, 1, 1);
    blob(g, 8, b - 3, 6, 4, P);
    // ribs
    for (const x of [5, 8, 11]) for (let y = b - 6; y <= b; y++) if (g.get(x, y) > 1) g.px(x, y, 5);
    g.px(6, b - 5, 7);
    g.px(7, b - 5, 7);
    g.art(7, b - 9, `
      .11
      121
    `);
  }, RIPE);
}

export function register(A) {
  palettes(A);
  seedAndDead(A);
  turnip(A);
  potato(A);
  strawberry(A);
  tomato(A);
  corn(A);
  melon(A);
  carrot(A);
  eggplant(A);
  pumpkin(A);
}
