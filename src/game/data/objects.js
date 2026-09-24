// Static world object definitions.
//
// Sprites are bottom-aligned on their anchor cell (bottom-left). The solid
// footprint is fw x fh cells extending right and UP from the anchor.
//   flat:     drawn with the ground (never occludes anything)
//   wall:     hangs on a wall tile; no collision of its own
//   interact: id handled by the play scene when the player presses A facing it
//   light:    night light {x, y, r, c:[r,g,b]} relative to the sprite's top-left

export const OBJDEFS = {
  // nature
  tree: { sprite: 'tree', fw: 2, fh: 1 },
  pine: { sprite: 'pine', fw: 2, fh: 1 },
  bush: { sprite: 'bush', fw: 1, fh: 1 },
  flower_bed: { sprite: 'flower_bed', fw: 1, fh: 1 },
  hedge: { sprite: 'hedge', fw: 1, fh: 1 },
  boulder_deco: { sprite: 'boulder', fw: 2, fh: 2 },
  log: { sprite: 'log', fw: 2, fh: 1 },
  stump_deco: { sprite: 'stump', fw: 1, fh: 1 },
  stepping_stone: { sprite: 'stepping_stone', fw: 1, fh: 1, flat: true, solid: false, walkOnWater: true },
  hot_spring: { sprite: 'hot_spring', fw: 3, fh: 2, interact: 'hot_spring' },

  // farm
  shipping_bin: { sprite: 'shipping_bin', fw: 2, fh: 1, interact: 'bin' },
  fence_h: { sprite: 'fence_h', fw: 1, fh: 1 },
  fence_v: { sprite: 'fence_v', fw: 1, fh: 1 },
  fence_post: { sprite: 'fence_post', fw: 1, fh: 1 },
  doghouse: { sprite: 'doghouse', fw: 2, fh: 1 },
  mailbox: { sprite: 'mailbox', fw: 1, fh: 1, interact: 'mailbox' },
  sign: { sprite: 'sign', fw: 1, fh: 1, interact: 'sign' },
  well: { sprite: 'well', fw: 2, fh: 1, interact: 'well' },
  scarecrow: { sprite: 'scarecrow', fw: 1, fh: 1 },

  // village
  lamp: { sprite: 'lamp', fw: 1, fh: 1, light: { x: 8, y: 5, r: 34, c: [1.0, 0.85, 0.55] } },
  bench: { sprite: 'bench', fw: 2, fh: 1 },
  fountain: { sprite: 'fountain_0', anim: ['fountain_0', 'fountain_1'], animRate: 20, fw: 3, fh: 2, interact: 'fountain' },
  flower_pot: { sprite: 'flower_pot', fw: 1, fh: 1 },
  barrel: { sprite: 'barrel', fw: 1, fh: 1 },
  crate: { sprite: 'crate', fw: 1, fh: 1 },
  noticeboard: { sprite: 'noticeboard', fw: 2, fh: 1, interact: 'noticeboard' },

  // interiors
  bed: { sprite: 'bed', fw: 1, fh: 2, interact: 'bed' },
  table: { sprite: 'table', fw: 2, fh: 1 },
  round_table: { sprite: 'round_table', fw: 2, fh: 1 },
  chair: { sprite: 'chair', fw: 1, fh: 1 },
  stool: { sprite: 'stool', fw: 1, fh: 1 },
  tv: { sprite: 'tv', fw: 1, fh: 1, interact: 'tv' },
  calendar: { sprite: 'calendar', wall: true, interact: 'calendar' },
  painting: { sprite: 'painting', wall: true },
  tool_rack: { sprite: 'tool_rack', wall: true },
  bookshelf: { sprite: 'bookshelf', fw: 1, fh: 1, interact: 'bookshelf' },
  dresser: { sprite: 'dresser', fw: 1, fh: 1 },
  fireplace: {
    sprite: 'fireplace', fw: 2, fh: 1,
    overlay: { anim: ['fire_0', 'fire_1'], x: 8, y: 14, rate: 10 },
    light: { x: 16, y: 22, r: 44, c: [1.0, 0.6, 0.3] },
  },
  plant: { sprite: 'plant', fw: 1, fh: 1 },
  rug: { sprite: 'rug', flat: true, solid: false },
  stove: { sprite: 'stove', fw: 1, fh: 1 },
  counter_l: { sprite: 'counter_l', fw: 1, fh: 1, interact: 'counter' },
  counter_m: { sprite: 'counter_m', fw: 1, fh: 1, interact: 'counter' },
  counter_r: { sprite: 'counter_r', fw: 1, fh: 1, interact: 'counter' },
  shelf_goods: { sprite: 'shelf_goods', fw: 2, fh: 1 },
  sack_pile: { sprite: 'sack_pile', fw: 1, fh: 1 },
  anvil: { sprite: 'anvil', fw: 1, fh: 1 },
  forge: {
    sprite: 'forge_0', anim: ['forge_0', 'forge_1'], animRate: 14, fw: 2, fh: 1,
    light: { x: 16, y: 16, r: 40, c: [1.0, 0.5, 0.2] },
  },
  hay_pile: { sprite: 'hay_pile', fw: 1, fh: 1 },
  feed_bin: { sprite: 'feed_bin', fw: 1, fh: 1, interact: 'feed_bin' },
  trough: { sprite: 'trough_empty', fw: 1, fh: 1, interact: 'trough' },
  nest: { sprite: 'nest', fw: 1, fh: 1 },
  diary: { sprite: 'diary', fw: 1, fh: 1, interact: 'diary' },
};

// Buildings: size in tiles, door column, and where the door leads.
export const BUILDINGS = {
  bld_house: { w: 4, h: 4, door: 1 },
  bld_barn: { w: 5, h: 4, door: 2 },
  bld_coop: { w: 3, h: 3, door: 1 },
  bld_store: { w: 4, h: 4, door: 1 },
  bld_ranch: { w: 4, h: 4, door: 2 },
  bld_smithy: { w: 4, h: 4, door: 1, smoke: { x: 50, y: 4 } },
  bld_inn: { w: 5, h: 4, door: 2 },
  bld_mayor: { w: 4, h: 4, door: 2 },
  bld_cottage_a: { w: 3, h: 3, door: 1 },
  bld_cottage_b: { w: 3, h: 3, door: 1 },
  bld_cabin: { w: 3, h: 3, door: 1 },
};
