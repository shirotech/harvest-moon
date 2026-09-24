// Art module: ui. See docs/ART_GUIDE.md for the sprite contract.
//
// Windows, HUD panels, cursors, 8x8 icons, stamina faces, inventory slots and
// the title logo. Everything here is original art for Moonlit Acres.

const rows = (...r) => r.join('\n');

/** Transpose an ASCII art block (swap x/y) — turns an up arrow into a left arrow. */
function transpose(art) {
  const l = art.split('\n').map((s) => s.trim()).filter(Boolean);
  return l[0].split('').map((_, x) => l.map((r) => r[x]).join('')).join('\n');
}

/**
 * Add a 1 px outline (index `o`) around every fill pixel (index >= 2).
 * 4-connected by default, which keeps corners soft; `diag` makes it 8-connected.
 */
function outline(g, o = 1, diag = false) {
  const src = g.data.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : src[y * g.w + x]);
  const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const n8 = [...n4, [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (at(x, y)) continue;
      if ((diag ? n8 : n4).some(([dx, dy]) => at(x + dx, y + dy) >= 2)) g.px(x, y, o);
    }
}

/** Icon from ASCII art, with an automatic outline around the fill colours. */
function icon(A, name, pal, art, diag = false) {
  const lines = art.split('\n').map((s) => s.trim()).filter(Boolean);
  A.paint(name, pal, lines[0].length, lines.length, (g) => {
    g.art(0, 0, art);
    outline(g, 1, diag);
  });
}

export function register(A) {
  // ---------------------------------------------------------------- palettes
  // Window: outline, dark wood, light wood, paper.
  A.pal('ui', ['#181010', '#704828', '#c89050', '#f8f8e8']);
  // HUD: outline, night-blue panel, lower edge, light edge.
  A.pal('ui_hud', ['#181010', '#283050', '#485890', '#98a8d8']);

  A.pal('ui_heart', ['#181010', '#a82030', '#e84848', '#f8c8c0']);
  A.pal('ui_heart_empty', ['#181010', '#484048', '#686068', '#888088']);
  A.pal('ui_gold', ['#181010', '#c07818', '#f8c030', '#f8f0a8']);
  A.pal('ui_sun', ['#181010', '#e87818', '#f8c030', '#f8f0a8']);
  A.pal('ui_cloud', ['#181010', '#8890a8', '#c8d0e0', '#f8f8f8']);
  A.pal('ui_rain', ['#181010', '#8890a8', '#c8d0e0', '#f8f8f8', '#3070d8']);
  A.pal('ui_snow', ['#181010', '#8890a8', '#c8d0e0', '#f8f8f8', '#78a8e8']);
  A.pal('ui_storm', ['#181010', '#585868', '#8888a0', '#a8a8c0', '#f8d830']);
  A.pal('ui_spring', ['#181010', '#c84878', '#f898b8', '#f8e060', '#58a838']);
  A.pal('ui_summer', ['#181010', '#307828', '#a8e070', '#e84040']);
  A.pal('ui_fall', ['#181010', '#b03818', '#f07820', '#f8c048']);
  A.pal('ui_winter', ['#181010', '#3868c0', '#88b8f0', '#f8f8f8']);
  A.pal('ui_clock', ['#181010', '#b07820', '#f8c030', '#f8f8e8', '#d83828']);
  A.pal('ui_check', ['#181010', '#307830', '#68c048', '#b8f088']);
  A.pal('ui_wood', ['#181010', '#704020', '#b87840', '#e8c080']);
  A.pal('ui_bag', ['#181010', '#806038', '#c09858', '#e8d098']);

  A.pal('ui_face', ['#181010', '#d89030', '#f8d048', '#f8f0a0', '#f08878', '#4890e0']);
  A.pal('ui_face_tired', ['#181010', '#b88840', '#e0c070', '#f0e0a8', '#d89080', '#4890e0']);
  A.pal('ui_face_ko', ['#181010', '#7888a0', '#a8b8c8', '#d8e0e8', '#b898a8', '#4890e0']);

  A.pal('ui_slot', ['#181010', '#a08860', '#d8c8a0', '#f0e8c8']);
  A.pal('ui_slot_sel', ['#181010', '#e89818', '#f8f0c0', '#f8d048']);

  // Logo: outline, night blue, cream, moon gold, amber, pale moonlight blue.
  A.pal('ui_logo', ['#181010', '#304080', '#f8f8e8', '#f8c830', '#d07818', '#a8c0f0']);

  // ---------------------------------------------------------------- window 9-slice
  // 4 px wooden frame: outline, highlight (top/left), wood, inner outline.
  A.sprite('ui_win_tl', 'ui', rows('..111111', '.1333333', '13222222', '13221111', '13214444', '13214444', '13214444', '13214444'));
  A.sprite('ui_win_t', 'ui', rows('11111111', '33333333', '22222222', '11111111', '44444444', '44444444', '44444444', '44444444'));
  A.sprite('ui_win_tr', 'ui', rows('111111..', '3333331.', '22222221', '11112221', '44441221', '44441221', '44441221', '44441221'));
  A.sprite('ui_win_l', 'ui', rows(...Array(8).fill('13214444')));
  A.paint('ui_win_c', 'ui', 8, 8, (g) => g.fill(4));
  A.sprite('ui_win_r', 'ui', rows(...Array(8).fill('44441221')));
  A.sprite('ui_win_bl', 'ui', rows('13214444', '13214444', '13214444', '13214444', '13221111', '13222222', '.1222222', '..111111'));
  A.sprite('ui_win_b', 'ui', rows('44444444', '44444444', '44444444', '44444444', '11111111', '22222222', '22222222', '11111111'));
  A.sprite('ui_win_br', 'ui', rows('44441221', '44441221', '44441221', '44441221', '11112221', '22222221', '2222221.', '111111..'));

  // ---------------------------------------------------------------- HUD 9-slice
  // 2 px edge: outline + light rim on top/left, deeper rim on bottom/right.
  A.sprite('ui_hud_tl', 'ui_hud', rows('..111111', '.1444444', ...Array(6).fill('14222222')));
  A.sprite('ui_hud_t', 'ui_hud', rows('11111111', '44444444', ...Array(6).fill('22222222')));
  A.sprite('ui_hud_tr', 'ui_hud', rows('111111..', '4444441.', ...Array(6).fill('22222231')));
  A.sprite('ui_hud_l', 'ui_hud', rows(...Array(8).fill('14222222')));
  A.paint('ui_hud_c', 'ui_hud', 8, 8, (g) => g.fill(2));
  A.sprite('ui_hud_r', 'ui_hud', rows(...Array(8).fill('22222231')));
  A.sprite('ui_hud_bl', 'ui_hud', rows(...Array(6).fill('14222222'), '.1333333', '..111111'));
  A.sprite('ui_hud_b', 'ui_hud', rows(...Array(6).fill('22222222'), '33333333', '11111111'));
  A.sprite('ui_hud_br', 'ui_hud', rows(...Array(6).fill('22222231'), '3333331.', '111111..'));

  // ---------------------------------------------------------------- pointers
  // Menu pointer: a chunky wooden arrowhead pointing right.
  A.sprite('ui_cursor', 'ui', rows(
    '11......',
    '1311....',
    '133311..',
    '13333311',
    '132211..',
    '1211....',
    '11......',
    '........',
  ));
  // "More text" marker: small down-pointing wedge.
  A.sprite('ui_next', 'ui', rows(
    '........',
    '11111111',
    '13333331',
    '.132231.',
    '..1221..',
    '...11...',
    '........',
    '........',
  ));
  const up = rows(
    '...11...',
    '..1331..',
    '.133331.',
    '13333331',
    '11133111',
    '..1321..',
    '..1221..',
    '..1111..',
  );
  A.sprite('ui_arrow_up', 'ui', up);
  A.derive('ui_arrow_down', 'ui_arrow_up', { flipY: true });
  A.sprite('ui_arrow_left', 'ui', transpose(up));
  A.derive('ui_arrow_right', 'ui_arrow_left', { flipX: true });

  // ---------------------------------------------------------------- 8x8 icons
  const heart = rows(
    '.11.11..',
    '1431331.',
    '1433331.',
    '1333321.',
    '.13321..',
    '..121...',
    '...1....',
    '........',
  );
  A.sprite('ic_heart', 'ui_heart', heart);
  A.sprite('ic_heart_empty', 'ui_heart_empty', heart);

  A.sprite('ic_coin', 'ui_gold', rows(
    '..1111..',
    '.133331.',
    '13433321',
    '13432321',
    '13432321',
    '13333221',
    '.122221.',
    '..1111..',
  ));
  A.sprite('ic_star', 'ui_gold', rows(
    '...11...',
    '..1431..',
    '11143111',
    '14333321',
    '.133321.',
    '.133221.',
    '13211221',
    '111..111',
  ));

  // Weather: one puffy two-bump cloud shared by all the cloudy icons.
  A.sprite('ic_sun', 'ui_sun', rows(
    '2......2',
    '.2.22.2.',
    '..2332..',
    '.234432.',
    '.233332.',
    '..2332..',
    '.2.22.2.',
    '2......2',
  ));
  icon(A, 'ic_cloud', 'ui_cloud', rows(
    '........',
    '....44..',
    '.44.444.',
    '.444444.',
    '.444443.',
    '.333332.',
    '........',
    '........',
  ));
  icon(A, 'ic_rain', 'ui_rain', rows(
    '....44..',
    '.44.444.',
    '.444443.',
    '.333333.',
    '........',
    '.5.5.5..',
    '.5.5.5..',
    '........',
  ));
  icon(A, 'ic_snow', 'ui_snow', rows(
    '....44..',
    '.44.444.',
    '.444443.',
    '.333333.',
    '........',
    '.5...5..',
    '...5...5',
    '.5...5..',
  ));
  icon(A, 'ic_storm', 'ui_storm', rows(
    '....44..',
    '.44.444.',
    '.444443.',
    '.333333.',
    '...55...',
    '..55....',
    '..5555..',
    '....5...',
  ));

  // Seasons: blossom, watermelon slice, maple leaf, snowflake.
  icon(A, 'ic_spring', 'ui_spring', rows(
    '...33...',
    '.333333.',
    '..3443..',
    '.334433.',
    '.33..33.',
    '...5....',
    '..55....',
    '........',
  ));
  icon(A, 'ic_summer', 'ui_summer', rows(
    '........',
    '.444444.',
    '.441414.',
    '.444444.',
    '..3333..',
    '..2222..',
    '........',
    '........',
  ));
  icon(A, 'ic_fall', 'ui_fall', rows(
    '........',
    '...33...',
    '.3.33.3.',
    '.334433.',
    '..3443..',
    '.333333.',
    '...2....',
    '........',
  ));
  A.sprite('ic_winter', 'ui_winter', rows(
    '...2....',
    '.2.3.2..',
    '..333...',
    '2334332.',
    '..333...',
    '.2.3.2..',
    '...2....',
    '........',
  ));

  A.sprite('ic_clock', 'ui_clock', rows(
    '..1111..',
    '.133331.',
    '13414431',
    '13414431',
    '13411431',
    '12444421',
    '.122221.',
    '..1111..',
  ));
  icon(A, 'ic_check', 'ui_check', rows(
    '........',
    '......3.',
    '.....33.',
    '.3..33..',
    '.2333...',
    '..22....',
    '........',
    '........',
  ));
  A.sprite('ic_box', 'ui_wood', rows(
    '.111111.',
    '14444441',
    '11111111',
    '13344331',
    '13333331',
    '13333331',
    '12222221',
    '.111111.',
  ));
  // Lumber: a sawn log end with growth rings.
  A.sprite('ic_lumber', 'ui_wood', rows(
    '..1111..',
    '.122221.',
    '12444421',
    '12433421',
    '12433421',
    '12444421',
    '.122221.',
    '..1111..',
  ));
  icon(A, 'ic_bag', 'ui_bag', rows(
    '........',
    '..3..3..',
    '...22...',
    '..3333..',
    '.343333.',
    '.333332.',
    '.332222.',
    '........',
  ));

  // ---------------------------------------------------------------- stamina faces
  const faceBase = (g) => {
    g.art(0, 0, rows(
      '.....111111.....',
      '...1144333311...',
      '..143333333331..',
      '.14333333333331.',
      '.13333333333331.',
      '1433333333333321',
      '1333333333333321',
      '1333333333333321',
      '1333333333333321',
      '1333333333333321',
      '1333333333333221',
      '.13333333333221.',
      '.13333333332221.',
      '..133333322221..',
      '...1122222211...',
      '.....111111.....',
    ));
  };
  // Features are centred on x = 7.5 (eyes at cols 5-6 / 9-10).
  // face_0: bright — shining eyes, big open grin, rosy cheeks.
  A.paint('face_0', 'ui_face', 16, 16, (g) => {
    faceBase(g);
    g.art(5, 4, rows('14..14', '11..11', '11..11'));
    g.art(3, 8, rows('55......55'));
    g.art(5, 9, rows('111111', '.1551.', '..11..'));
  });
  // face_1: content — dot eyes, gentle smile.
  A.paint('face_1', 'ui_face', 16, 16, (g) => {
    faceBase(g);
    g.art(5, 5, rows('1....1', '1....1'));
    g.art(5, 10, rows('1....1', '.1111.'));
  });
  // face_2: tired — heavy half-closed lids, flat mouth, a bead of sweat.
  A.paint('face_2', 'ui_face_tired', 16, 16, (g) => {
    faceBase(g);
    g.art(4, 6, rows('111..111', '.1....1.'));
    g.art(6, 11, rows('1111'));
    g.art(12, 2, rows('.6', '66', '66'));
  });
  // face_3: exhausted — screwed-shut eyes, gasping mouth, sweat drops, pale.
  A.paint('face_3', 'ui_face_ko', 16, 16, (g) => {
    faceBase(g);
    g.art(5, 5, rows('1....1', '.1..1.', '1....1'));
    g.art(6, 10, rows('.11.', '1551', '.11.'));
    g.art(12, 2, rows('.6', '66', '66'));
    g.art(2, 3, rows('6', '6'));
  });

  // ---------------------------------------------------------------- inventory slots
  A.paint('ui_slot', 'ui_slot', 18, 18, (g) => {
    g.rect(1, 1, 16, 16, 3);
    g.hline(2, 15, 1, 2);
    g.vline(1, 2, 15, 2);
    g.hline(2, 16, 16, 4);
    g.vline(16, 2, 15, 4);
    g.hline(2, 15, 0, 1);
    g.hline(2, 15, 17, 1);
    g.vline(0, 2, 15, 1);
    g.vline(17, 2, 15, 1);
    g.px(1, 1, 1); g.px(16, 1, 1); g.px(1, 16, 1); g.px(16, 16, 1);
  });
  A.paint('ui_slot_sel', 'ui_slot_sel', 18, 18, (g) => {
    g.rect(1, 1, 16, 16, 3);
    g.frame(1, 1, 16, 16, 4);
    g.frame(2, 2, 14, 14, 2);
    g.hline(2, 15, 0, 1);
    g.hline(2, 15, 17, 1);
    g.vline(0, 2, 15, 1);
    g.vline(17, 2, 15, 1);
    g.px(1, 1, 1); g.px(16, 1, 1); g.px(1, 16, 1); g.px(16, 16, 1);
  });

  // ---------------------------------------------------------------- title logo
  drawLogo(A);
}

// Big-letter masks for the logo, drawn at half resolution (each cell = 2x2 px).
const BIG = {
  M: ['##.....##', '###...###', '####.####', '##.###.##', '##..#..##', '##.....##', '##.....##', '##.....##', '##.....##'],
  O: ['..####..', '.######.', '###..###', '##....##', '##....##', '##....##', '###..###', '.######.', '..####..'],
  N: ['##....##', '###...##', '####..##', '##.##.##', '##..####', '##...###', '##....##', '##....##', '##....##'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
  I: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  T: ['########', '########', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
};
const SMALL = {
  A: ['.####.', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  C: ['.#####', '##....', '##....', '##....', '##....', '##....', '.#####'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
  S: ['.#####', '##....', '##....', '.####.', '....##', '....##', '#####.'],
};

function drawLogo(A) {
  const W = 144, H = 40;
  A.paint('ui_logo', 'ui_logo', W, H, (g) => {
    // 1) letter masks -> fill index
    const mask = new Uint8Array(W * H); // 0 empty, else colour
    const put = (x, y, v) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = v; };
    const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
    const stamp = (glyph, x0, y0, s, v) => {
      glyph.forEach((r, y) => [...r].forEach((c, x) => {
        if (c === '#') for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(x0 + x * s + dx, y0 + y * s + dy, v);
      }));
      return glyph[0].length * s;
    };
    // round off convex corners of the letter shapes
    const roundCorners = () => {
      const src = mask.slice();
      const s = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : src[y * W + x]);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!s(x, y)) continue;
          const u = !s(x, y - 1), d = !s(x, y + 1), l = !s(x - 1, y), r = !s(x + 1, y);
          if ((u && l) || (u && r) || (d && l) || (d && r)) mask[y * W + x] = 0;
        }
    };

    // Line 1: MOONLIT, 18 px tall.
    const word1 = ['M', 'O', 'O', 'N', 'L', 'I', 'T'];
    const gap = 2;
    const w1 = word1.reduce((a, c) => a + BIG[c][0].length * 2, 0) + gap * (word1.length - 1);
    let x = Math.floor((W - w1) / 2);
    const y1 = 1;
    const moonX = [];
    word1.forEach((c, i) => {
      if (c === 'O' && i === 1) moonX.push(x);
      x += stamp(BIG[c], x, y1, 2, 3) + gap;
    });
    // Line 2: ACRES, 14 px tall.
    const word2 = ['A', 'C', 'R', 'E', 'S'];
    const w2 = word2.reduce((a, c) => a + SMALL[c][0].length * 2, 0) + gap * (word2.length - 1);
    x = Math.floor((W - w2) / 2);
    const y2 = 23;
    word2.forEach((c) => { x += stamp(SMALL[c], x, y2, 2, 4) + gap; });
    roundCorners();

    // 2) shading: lower rows of MOONLIT turn moonlight-blue, lower rows of ACRES amber.
    for (let y = 0; y < H; y++)
      for (let xx = 0; xx < W; xx++) {
        const v = get(xx, y);
        if (v === 3 && y >= y1 + 13) put(xx, y, 6);
        if (v === 4 && y >= y2 + 10) put(xx, y, 5);
      }

    // 3) the first O becomes the moon: a full disc whose left side is a lit
    //    gold crescent and whose right side is pale moonlight blue.
    const mx = moonX[0], mw = 16;
    const cx = mx + mw / 2 - 0.5, cy = y1 + 8.5;
    const inDisc = (xx, y) => ((xx - cx) ** 2) / 64 + ((y - cy) ** 2) / 81 <= 1.0;
    const inShadow = (xx, y) => ((xx - (cx + 4)) ** 2) / 49 + ((y - (cy - 2)) ** 2) / 72 <= 1.0;
    for (let y = y1; y < y1 + 18; y++)
      for (let xx = mx; xx < mx + mw; xx++) {
        if (!inDisc(xx, y)) { put(xx, y, 0); continue; }
        if (inShadow(xx, y)) put(xx, y, 6);
        else put(xx, y, inShadow(xx - 1, y) || inShadow(xx, y + 1) ? 5 : 4);
      }
    // a couple of craters on the dark side
    put(cx + 3.5, cy - 3.5, 2); put(cx + 4.5, cy - 3.5, 2);
    put(cx + 1.5, cy + 2.5, 2);

    // twinkling stars around the lettering
    const twinkle = (x0, y0, big) =>
      stamp(big ? ['..#..', '..#..', '#####', '..#..', '..#..'] : ['.#.', '###', '.#.'], x0, y0, 1, 3);
    twinkle(18, 27, true);
    twinkle(121, 25, false);
    twinkle(138, 3, false);

    // 4) outline everything (8-connected so the shapes read as one solid lump).
    const src = mask.slice();
    const s = (xx, y) => (xx < 0 || y < 0 || xx >= W || y >= H ? 0 : src[y * W + xx]);
    for (let y = 0; y < H; y++)
      for (let xx = 0; xx < W; xx++) {
        if (s(xx, y)) { g.px(xx, y, s(xx, y)); continue; }
        let n = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s(xx + dx, y + dy)) n = true;
        if (n) g.px(xx, y, 1);
      }
    // 5) drop shadow: night blue, 1 px right and 1-2 px below the outlined shapes.
    const lay = g.data.slice();
    const L = (xx, y) => (xx < 0 || y < 0 || xx >= W || y >= H ? 0 : lay[y * W + xx]);
    for (let y = 0; y < H; y++)
      for (let xx = 0; xx < W; xx++) {
        if (L(xx, y)) continue;
        if (L(xx - 1, y - 1) || L(xx, y - 1) || L(xx - 1, y - 2)) g.px(xx, y, 2);
      }
  });
}
