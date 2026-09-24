// Item, crop and tool definitions.

export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_NAMES = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_PER_SEASON = 30;

/**
 * kind: crop | forage | animal | fish | food | junk
 * price: shipping value (0 = can't be shipped)
 * stamina: restored when eaten (0/undefined = not edible)
 */
export const ITEMS = {
  turnip: { name: 'Turnip', price: 60, kind: 'crop', stamina: 6 },
  potato: { name: 'Potato', price: 80, kind: 'crop', stamina: 8 },
  strawberry: { name: 'Strawberry', price: 30, kind: 'crop', stamina: 4 },
  tomato: { name: 'Tomato', price: 60, kind: 'crop', stamina: 6 },
  corn: { name: 'Corn', price: 100, kind: 'crop', stamina: 8 },
  melon: { name: 'Melon', price: 250, kind: 'crop', stamina: 15 },
  carrot: { name: 'Carrot', price: 120, kind: 'crop', stamina: 8 },
  eggplant: { name: 'Eggplant', price: 80, kind: 'crop', stamina: 6 },
  pumpkin: { name: 'Pumpkin', price: 250, kind: 'crop', stamina: 12 },

  egg: { name: 'Egg', price: 50, kind: 'animal', stamina: 5 },
  egg_gold: { name: 'Golden Egg', price: 150, kind: 'animal', stamina: 10 },
  milk_s: { name: 'Milk (S)', price: 100, kind: 'animal', stamina: 8 },
  milk_m: { name: 'Milk (M)', price: 150, kind: 'animal', stamina: 10 },
  milk_l: { name: 'Milk (L)', price: 200, kind: 'animal', stamina: 12 },

  herb: { name: 'Wild Herb', price: 50, kind: 'forage', stamina: 10 },
  bamboo: { name: 'Bamboo Shoot', price: 50, kind: 'forage', stamina: 5 },
  berry: { name: 'Wild Berry', price: 40, kind: 'forage', stamina: 6 },
  moonflower: { name: 'Moonflower', price: 300, kind: 'forage' },
  mushroom: { name: 'Mushroom', price: 70, kind: 'forage', stamina: 8 },
  chestnut: { name: 'Chestnut', price: 60, kind: 'forage', stamina: 6 },
  snowroot: { name: 'Snowroot', price: 80, kind: 'forage', stamina: 10 },
  pinecone: { name: 'Pinecone', price: 30, kind: 'forage' },

  fish_s: { name: 'Small Fish', price: 50, kind: 'fish', stamina: 6 },
  fish_m: { name: 'Medium Fish', price: 120, kind: 'fish', stamina: 10 },
  fish_l: { name: 'Large Fish', price: 200, kind: 'fish', stamina: 14 },
  fish_gold: { name: 'Moonscale Koi', price: 1000, kind: 'fish' },
  boot: { name: 'Old Boot', price: 0, kind: 'junk' },

  bread: { name: 'Bread', price: 0, kind: 'food', stamina: 25 },
  riceball: { name: 'Rice Ball', price: 0, kind: 'food', stamina: 35 },
  pie: { name: 'Berry Pie', price: 0, kind: 'food', stamina: 50 },
  stew: { name: 'Hearty Stew', price: 0, kind: 'food', stamina: 70 },
  bouquet: { name: 'Bouquet', price: 0, kind: 'gift' },
};

export function itemSprite(id) {
  return `item_${id}`;
}

export const CROPS = {
  turnip: { name: 'Turnip', season: 'spring', days: 4, regrow: 0, seedPrice: 120 },
  potato: { name: 'Potato', season: 'spring', days: 7, regrow: 0, seedPrice: 150 },
  strawberry: { name: 'Strawberry', season: 'spring', days: 8, regrow: 2, seedPrice: 150 },
  tomato: { name: 'Tomato', season: 'summer', days: 9, regrow: 3, seedPrice: 200 },
  corn: { name: 'Corn', season: 'summer', days: 13, regrow: 3, seedPrice: 300 },
  melon: { name: 'Melon', season: 'summer', days: 11, regrow: 0, seedPrice: 250 },
  carrot: { name: 'Carrot', season: 'fall', days: 7, regrow: 0, seedPrice: 200 },
  eggplant: { name: 'Eggplant', season: 'fall', days: 9, regrow: 3, seedPrice: 120 },
  pumpkin: { name: 'Pumpkin', season: 'fall', days: 14, regrow: 0, seedPrice: 500 },
};

/** Growth stage for a crop of the given age: 0 seed, 1 young, 2 growing, 3 ripe. */
export function cropStage(cropId, age) {
  const c = CROPS[cropId];
  if (age >= c.days) return 3;
  if (age >= Math.ceil(c.days / 2)) return 2;
  if (age >= 1) return 1;
  return 0;
}

export function cropSprite(cropId, age, dead) {
  if (dead) return 'crop_dead';
  const s = cropStage(cropId, age);
  return s === 0 ? 'crop_seed' : `crop_${cropId}_${s}`;
}

export const TOOL_LEVELS = ['Iron', 'Copper', 'Golden'];
export const TOOL_PALETTES = ['tool', 'tool_copper', 'tool_gold'];

export const TOOLS = {
  hoe: { name: 'Hoe', stamina: 2, upgradable: true, desc: 'Tills field soil.' },
  can: { name: 'Watering Can', stamina: 1, upgradable: true, desc: 'Waters crops. Refill at water.' },
  sickle: { name: 'Sickle', stamina: 1, upgradable: true, desc: 'Cuts weeds and dead crops.' },
  hammer: { name: 'Hammer', stamina: 2, upgradable: true, desc: 'Breaks stones and boulders.' },
  axe: { name: 'Axe', stamina: 2, upgradable: true, desc: 'Chops stumps and branches.' },
  rod: { name: 'Fishing Rod', stamina: 1, upgradable: false, desc: 'Cast into water to fish.' },
  milker: { name: 'Milker', stamina: 1, upgradable: false, desc: 'Milks a fed, happy cow.' },
  brush: { name: 'Brush', stamina: 1, upgradable: false, desc: 'Keeps cows happy.' },
};

export const TOOL_ORDER = ['hoe', 'can', 'sickle', 'hammer', 'axe', 'rod', 'milker', 'brush'];

export const CAN_CAPACITY = [30, 50, 80];

export const UPGRADE_COST = [
  null,
  { gold: 1500, lumber: 10 },
  { gold: 5000, lumber: 30 },
];

export function toolName(id, level = 0) {
  const t = TOOLS[id];
  return t.upgradable ? `${TOOL_LEVELS[level]} ${t.name}` : t.name;
}
