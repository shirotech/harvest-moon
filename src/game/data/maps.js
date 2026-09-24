// World maps. Coordinates are tile cells; objects anchor at their bottom-left cell.
import { MapBuilder } from '../mapbuilder.js';

function farm() {
  const m = new MapBuilder('farm', 32, 26, 'grass', { name: 'Your Farm', outdoor: true, music: 'season' });
  m.treeline('top', 'pine');
  m.treeline('left', 'pine');
  m.treeline('right', 'pine', [[6, 9]]);
  m.treeline('bottom', 'pine', [[12, 15]]);
  m.fill(2, 7, 30, 2, 'path'); // road to the village
  m.fill(4, 10, 21, 11, 'field');
  m.fill(13, 21, 2, 5, 'path'); // road to the forest
  m.fill(26, 12, 3, 4, 'water'); // pond
  m.set(25, 13, 'water').set(26, 16, 'water').set(27, 16, 'water');

  m.building('bld_house', 2, 6, { to: 'house', tx: 4, ty: 7, dir: 'up' });
  m.obj('mailbox', 6, 6);
  m.obj('shipping_bin', 7, 6);
  m.obj('doghouse', 10, 6);
  m.building('bld_coop', 14, 6, { to: 'coop', tx: 4, ty: 6, dir: 'up' });
  m.building('bld_barn', 19, 6, { to: 'barn', tx: 4, ty: 7, dir: 'up' });
  m.obj('tree', 25, 5);
  m.obj('bush', 28, 4).obj('bush', 24, 3).obj('flower_bed', 12, 6).obj('flower_bed', 13, 6);
  m.obj('well', 2, 11);
  m.obj('scarecrow', 2, 16);
  m.obj('sign', 12, 21, { text: '↓ Whisperwood Forest' });
  m.obj('sign', 29, 9, { text: '→ Willowmere Village' });
  m.objs('bush', [[5, 22], [9, 21], [18, 22], [22, 21], [3, 21], [26, 21]]);
  m.objs('fence_h', [[25, 17], [26, 17], [27, 17], [28, 17]]);
  m.obj('log', 27, 20);

  m.warp(31, 7, 'village', 1, 12, 'right');
  m.warp(31, 8, 'village', 1, 13, 'right');
  m.warp(13, 25, 'forest', 6, 1, 'down');
  m.warp(14, 25, 'forest', 7, 1, 'down');

  m.spot('intro_player', 4, 8, 'down');
  m.spot('intro_mayor', 6, 8, 'left');
  m.spot('dog', 12, 8);
  m.spot('june_visit', 9, 9, 'left');
  return m.build();
}

function village() {
  const m = new MapBuilder('village', 36, 28, 'grass', { name: 'Willowmere', outdoor: true, music: 'village' });
  m.treeline('top', 'pine');
  m.treeline('left', 'pine', [[11, 14]]);
  m.treeline('right', 'pine');
  m.treeline('bottom', 'pine', [[16, 19]]);
  m.fill(2, 8, 32, 1, 'cobble'); // north street
  m.fill(13, 9, 10, 10, 'cobble'); // plaza
  m.fill(0, 12, 13, 2, 'path'); // west road
  m.fill(2, 19, 32, 1, 'cobble'); // south street
  m.fill(17, 20, 2, 8, 'path'); // road to forest
  m.fill(24, 21, 7, 3, 'water'); // pond
  m.set(25, 20, 'water').set(26, 20, 'water').set(28, 24, 'water').set(29, 24, 'water');

  m.building('bld_store', 4, 7, { to: 'store', tx: 4, ty: 7, dir: 'up' });
  m.building('bld_mayor', 15, 7, { locked: "Mayor Hollis's house. The door is locked." });
  m.building('bld_smithy', 27, 7, { to: 'smithy', tx: 4, ty: 7, dir: 'up' });
  m.building('bld_cottage_a', 3, 18, { locked: "June's cottage. It smells of flowers." });
  m.building('bld_ranch', 7, 18, { to: 'ranch', tx: 4, ty: 7, dir: 'up' });
  m.building('bld_inn', 25, 18, { to: 'inn', tx: 5, ty: 8, dir: 'up' });
  m.building('bld_cottage_b', 30, 18, { locked: "Pip's house. Someone is humming inside." });

  m.obj('fountain', 16, 14);
  m.objs('lamp', [[12, 9], [23, 9], [12, 18], [23, 18], [2, 11], [33, 9]]);
  m.obj('bench', 14, 10).obj('bench', 20, 10);
  m.obj('noticeboard', 9, 9);
  m.objs('flower_bed', [[24, 10], [25, 10], [26, 10], [10, 14], [11, 14], [24, 14]]);
  m.objs('flower_pot', [[3, 7], [8, 7], [31, 7], [14, 18], [21, 18]]);
  m.objs('barrel', [[26, 7], [24, 18]]);
  m.obj('crate', 11, 18);
  m.objs('tree', [[9, 5], [20, 5], [31, 13], [20, 23], [13, 23], [31, 24]]);
  m.objs('bush', [[23, 5], [11, 5], [14, 5], [33, 16], [16, 22], [19, 22]]);
  // ranch pasture
  for (let x = 3; x <= 11; x++) {
    if (x !== 7) m.obj('fence_h', x, 20);
    m.obj('fence_h', x, 24);
  }
  for (let y = 21; y <= 23; y++) {
    m.obj('fence_v', 3, y);
    m.obj('fence_v', 11, y);
  }
  m.obj('hay_pile', 9, 22);
  m.obj('sign', 16, 20, { text: '↓ Whisperwood Forest' });
  m.obj('sign', 2, 14, { text: '← To your farm' });

  m.warp(0, 12, 'farm', 30, 7, 'left');
  m.warp(0, 13, 'farm', 30, 8, 'left');
  m.warp(17, 27, 'forest', 24, 1, 'down');
  m.warp(18, 27, 'forest', 25, 1, 'down');

  m.spot('fountain_n', 17, 11, 'down');
  m.spot('fountain_s', 17, 16, 'up');
  m.spot('fountain_w', 14, 13, 'right');
  m.spot('fountain_e', 20, 13, 'left');
  m.spot('bench_w', 15, 11, 'down');
  m.spot('bench_e', 21, 11, 'down');
  m.spot('north_st', 20, 9, 'down');
  m.spot('board', 10, 10, 'up');
  m.spot('flowers', 25, 11, 'up');
  m.spot('pasture', 7, 22, 'down');
  m.spot('pond', 27, 20, 'down');
  m.spot('june_garden', 5, 19, 'up');
  m.spot('store_front', 5, 9, 'down');
  m.spot('smithy_front', 28, 9, 'down');
  return m.build();
}

function forest() {
  const m = new MapBuilder('forest', 32, 28, 'grass', { name: 'Whisperwood', outdoor: true, music: 'season' });
  m.treeline('top', 'pine', [[6, 7], [14, 16], [24, 25]]);
  m.treeline('left', 'pine');
  m.treeline('right', 'pine');
  m.treeline('bottom', 'pine');
  m.fill(14, 0, 3, 28, 'water'); // river
  m.fill(13, 16, 1, 4, 'water');
  m.fill(17, 4, 1, 3, 'water');
  m.fill(14, 9, 3, 2, 'bridge_h');
  m.fill(6, 0, 2, 11, 'path');
  m.fill(6, 9, 8, 2, 'path');
  m.fill(17, 9, 9, 2, 'path');
  m.fill(24, 0, 2, 11, 'path');
  m.fill(4, 20, 6, 4, 'water'); // pond
  m.set(5, 19, 'water').set(6, 19, 'water').set(8, 24, 'water');
  m.fill(4, 18, 6, 1, 'sand');
  m.objs('stepping_stone', [[14, 21], [15, 21], [16, 21]]);

  m.building('bld_cabin', 2, 15, { locked: "Finn's cabin. A fishing net hangs by the door." });
  m.obj('hot_spring', 21, 16);
  m.obj('sign', 20, 17, { text: 'Warm spring. Soak to rest your body.' });
  m.obj('sign', 8, 8, { text: '↑ Farm    → Village' });
  m.objs('tree', [[9, 5], [18, 6], [26, 14], [10, 15], [19, 24], [24, 24], [11, 24], [27, 20]]);
  m.objs('pine', [[3, 7], [20, 3], [27, 5], [9, 13], [2, 11]]);
  m.objs('bush', [[5, 13], [12, 6], [22, 8], [28, 11], [23, 21], [18, 13], [12, 23], [26, 8], [4, 25]]);
  m.obj('log', 19, 20).obj('boulder_deco', 28, 24).obj('log', 11, 3);
  m.obj('stump_deco', 11, 18);

  m.warp(6, 0, 'farm', 13, 24, 'up');
  m.warp(7, 0, 'farm', 14, 24, 'up');
  m.warp(24, 0, 'village', 17, 26, 'up');
  m.warp(25, 0, 'village', 18, 26, 'up');

  m.spot('river_bank', 13, 13, 'right');
  m.spot('pond_bank', 7, 19, 'down');
  m.spot('cabin_front', 3, 16, 'down');
  m.spot('spring', 22, 17, 'up');
  m.spot('clearing', 22, 11, 'down');
  m.spot('meadow', 10, 20, 'left');
  m.forage = [
    [4, 9], [11, 8], [21, 6], [21, 12], [28, 9], [27, 17], [12, 20], [22, 23], [26, 22], [3, 22], [11, 12], [28, 3],
  ];
  const map = m.build();
  map.forage = m.forage;
  return map;
}

// Interiors: ground from ASCII, objects listed.
const IN = { W: 'wall', L: 'wall_low', N: 'window', V: 'wwall', v: 'wwall_low', w: 'wood', s: 'stone', h: 'hay', m: 'mat', ' ': 'void' };

function room(id, rows, props) {
  const m = new MapBuilder(id, rows[0].length, rows.length, 'void', { outdoor: false, music: 'indoor', ...props });
  m.ascii(0, 0, rows, IN);
  return m;
}

function house() {
  const m = room('house', [
    'WWNWWWWNWW',
    'LLLLLLLLLL',
    'wwwwwwwwww',
    'wwwwwwwwww',
    'wwwwwwwwww',
    'wwwwwwwwww',
    'wwwwwwwwww',
    'wwwwwwwwww',
    '    m     ',
  ], { name: 'Farmhouse', wallPal: 'wall_home' });
  m.obj('bed', 0, 3).obj('bookshelf', 1, 2).obj('tv', 3, 2).obj('diary', 6, 2);
  m.obj('stove', 8, 2).obj('plant', 9, 2).obj('dresser', 9, 5);
  m.obj('calendar', 5, 1).obj('painting', 2, 1);
  m.obj('table', 4, 5).obj('chair', 3, 5).obj('chair', 6, 5);
  m.obj('rug', 4, 7);
  m.obj('plant', 0, 7);
  m.warp(4, 8, 'farm', 3, 7, 'down');
  return m.build();
}

function coop() {
  const m = room('coop', [
    'VVVVVVVVVV',
    'vvvvvvvvvv',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    '    m     ',
  ], { name: 'Chicken Coop', music: 'indoor' });
  m.obj('feed_bin', 0, 2);
  for (let i = 0; i < 8; i++) m.obj('trough', 2 + i, 2, { slot: i, kind: 'chicken' });
  m.obj('nest', 0, 5).obj('nest', 9, 5).obj('hay_pile', 0, 6);
  m.warp(4, 7, 'farm', 15, 7, 'down');
  m.pen = { x: 1, y: 3, w: 9, h: 4 };
  const map = m.build();
  map.pen = m.pen;
  return map;
}

function barn() {
  const m = room('barn', [
    'VVVVVVVVVV',
    'vvvvvvvvvv',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    'hhhhhhhhhh',
    '    m     ',
  ], { name: 'Barn', music: 'indoor' });
  m.obj('feed_bin', 0, 2);
  for (let i = 0; i < 4; i++) m.obj('trough', 2 + i * 2, 2, { slot: i, kind: 'cow' });
  m.obj('hay_pile', 9, 7).obj('hay_pile', 0, 7);
  m.warp(4, 8, 'farm', 21, 7, 'down');
  const map = m.build();
  map.pen = { x: 1, y: 3, w: 9, h: 5 };
  return map;
}

function shopRoom(id, name, wallPal, floor, counterX, keeperSpot, exit) {
  const f = floor;
  const rows = [
    'WWWNWWNWWW',
    'LLLLLLLLLL',
    f.repeat(10),
    f.repeat(10),
    f.repeat(10),
    f.repeat(10),
    f.repeat(10),
    f.repeat(10),
    '    m     ',
  ];
  const m = room(id, rows, { name, wallPal });
  m.obj('counter_l', counterX, 4);
  m.obj('counter_m', counterX + 1, 4);
  m.obj('counter_m', counterX + 2, 4);
  m.obj('counter_r', counterX + 3, 4);
  m.spot('keeper', keeperSpot[0], keeperSpot[1], 'down');
  m.warp(4, 8, exit[0], exit[1], exit[2], 'down');
  return m;
}

function store() {
  const m = shopRoom('store', "Marta's General Store", 'wall_shop', 's', 1, [2, 3], ['village', 5, 8]);
  m.obj('shelf_goods', 6, 2).obj('shelf_goods', 8, 2);
  m.obj('sack_pile', 0, 3).obj('barrel', 0, 2);
  m.obj('sack_pile', 9, 6).obj('plant', 9, 7).obj('crate', 0, 7);
  m.obj('painting', 4, 1);
  m.spot('customer', 7, 5, 'up');
  return m.build();
}

function ranch() {
  const m = shopRoom('ranch', "Theo's Ranch Supply", 'wall_barn', 'w', 5, [6, 3], ['village', 9, 19]);
  m.obj('hay_pile', 0, 2).obj('hay_pile', 1, 2).obj('sack_pile', 0, 6).obj('feed_bin', 9, 2);
  m.obj('barrel', 9, 7).obj('crate', 0, 7).obj('tool_rack', 2, 1);
  return m.build();
}

function smithy() {
  const m = shopRoom('smithy', "Bram's Workshop", 'wall_shop', 's', 5, [6, 3], ['village', 28, 8]);
  m.obj('forge', 0, 2).obj('anvil', 3, 3).obj('tool_rack', 7, 1);
  m.obj('barrel', 9, 7).obj('crate', 0, 7).obj('crate', 0, 6);
  return m.build();
}

function inn() {
  const m = room('inn', [
    'WWWNWWWNWWWW',
    'LLLLLLLLLLLL',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    '     m      ',
  ], { name: 'The Lantern Inn', wallPal: 'wall_inn' });
  m.obj('counter_l', 1, 4).obj('counter_m', 2, 4).obj('counter_m', 3, 4).obj('counter_m', 4, 4).obj('counter_r', 5, 4);
  m.obj('barrel', 0, 2).obj('barrel', 0, 3).obj('shelf_goods', 2, 2);
  m.obj('fireplace', 10, 2);
  m.obj('round_table', 7, 5).obj('stool', 6, 5).obj('stool', 9, 5);
  m.obj('round_table', 7, 8).obj('stool', 6, 8).obj('stool', 9, 8);
  m.obj('round_table', 1, 8).obj('stool', 0, 8).obj('stool', 3, 8);
  m.obj('plant', 11, 8).obj('painting', 5, 1).obj('painting', 9, 1);
  m.spot('keeper', 3, 3, 'down');
  m.spot('seat_a', 6, 6, 'up');
  m.spot('seat_b', 9, 6, 'up');
  m.spot('seat_c', 9, 7, 'down');
  m.spot('seat_d', 3, 7, 'down');
  m.spot('seat_e', 0, 7, 'down');
  m.spot('seat_f', 6, 7, 'down');
  m.warp(5, 9, 'village', 27, 19, 'down');
  return m.build();
}

let cache = null;
export function getMaps() {
  if (!cache) {
    cache = {};
    for (const f of [farm, village, forest, house, coop, barn, store, ranch, smithy, inn]) {
      const map = f();
      cache[map.id] = map;
    }
  }
  return cache;
}
