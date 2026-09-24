// Game state: creation, persistence and small helpers. Pure data — no rendering.
import { CROPS, ITEMS, SEASONS, WEEKDAYS, DAYS_PER_SEASON, CAN_CAPACITY } from './data/items.js';
import { NPC_IDS, FESTIVALS } from './data/npcs.js';
import { getMaps } from './data/maps.js';
import { G } from './mapbuilder.js';
import { rng } from '../engine/atlas.js';

export const SAVE_KEY = 'moonlit-acres-save-v1';
export const CROP_IDS = Object.keys(CROPS);
export const DEBRIS = { none: 0, weed: 1, stone: 2, stump: 3, branch: 4, boulder: 5, boulderPart: 6 };
export const DEBRIS_SPRITES = [null, 'weed', 'stone', 'stump', 'branch', 'boulder', null];
export const RUCKSACK_SIZE = 8;
export const STACK = 9;

export function newGame({ name = 'Sam', gender = 'boy', seed = Date.now() % 1e9 } = {}) {
  const maps = getMaps();
  const fm = maps.farm;
  const s = {
    version: 1,
    seed,
    player: { name, gender, map: 'farm', x: 4, y: 8, dir: 'down' },
    gold: 500,
    stamina: 100,
    maxStamina: 100,
    tools: { hoe: 0, can: 0, sickle: 0, hammer: 0, axe: 0 },
    equipped: 'hoe',
    seeds: { turnip: 1 },
    water: 0,
    rucksack: Array(RUCKSACK_SIZE).fill(null),
    carrying: null,
    lumber: 0,
    feed: 0,
    fodder: 0,
    time: { year: 1, season: 0, day: 1, min: 6 * 60 },
    weather: 'sun',
    tomorrow: 'sun',
    farm: newFarm(fm, seed),
    drops: {},
    shipping: {},
    animals: [],
    coopFeed: 0,
    barnFeed: 0,
    upgrades: { coop: 0, barn: 0, house: 0 },
    pendingUpgrade: null,
    npcs: Object.fromEntries(NPC_IDS.map((id) => [id, { friend: 0, met: false, talked: false, gifted: false }])),
    dog: { name: 'Biscuit', affection: 0, petted: false },
    stats: { shipped: {}, earned: 0, debris: 0, fish: 0, forage: 0, eggs: 0, seasonsShipped: [], days: 0 },
    goals: [],
    flags: { intro: false, metFinn: false, ending: false, festivals: [] },
    lastReport: null,
    playTime: 0,
  };
  s.water = CAN_CAPACITY[0];
  return s;
}

export function newFarm(fm, seed) {
  const n = fm.w * fm.h;
  const f = {
    w: fm.w,
    h: fm.h,
    debris: new Array(n).fill(0),
    hp: new Array(n).fill(0),
    soil: new Array(n).fill(0),
    wet: new Array(n).fill(0),
    crop: new Array(n).fill(0),
    age: new Array(n).fill(0),
    dead: new Array(n).fill(0),
  };
  const r = rng(seed ^ 0x5eed);
  const isField = (x, y) => x >= 0 && y >= 0 && x < fm.w && y < fm.h && fm.ground[y * fm.w + x] === G.field;
  // boulders first (2x2)
  let boulders = 0;
  for (let tries = 0; tries < 200 && boulders < 3; tries++) {
    const x = 5 + Math.floor(r() * 18);
    const y = 11 + Math.floor(r() * 9);
    const cells = [[x, y], [x + 1, y], [x, y - 1], [x + 1, y - 1]];
    if (!cells.every(([cx, cy]) => isField(cx, cy) && !f.debris[cy * fm.w + cx])) continue;
    cells.forEach(([cx, cy], i) => (f.debris[cy * fm.w + cx] = i === 0 ? DEBRIS.boulder : DEBRIS.boulderPart));
    f.hp[y * fm.w + x] = 6;
    boulders++;
  }
  for (let y = 0; y < fm.h; y++)
    for (let x = 0; x < fm.w; x++) {
      const i = y * fm.w + x;
      if (!isField(x, y) || f.debris[i]) continue;
      const v = r();
      if (v < 0.2) f.debris[i] = DEBRIS.weed;
      else if (v < 0.28) f.debris[i] = DEBRIS.stone;
      else if (v < 0.34) f.debris[i] = DEBRIS.branch;
      else if (v < 0.37) {
        f.debris[i] = DEBRIS.stump;
        f.hp[i] = 3;
      }
    }
  return f;
}

// --- persistence --------------------------------------------------------------

export function serialize(s) {
  return JSON.stringify(s);
}

export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.version !== 1) throw new Error('incompatible save');
  // forward-compatible defaults
  const fresh = newGame({ name: s.player?.name, gender: s.player?.gender, seed: s.seed });
  for (const k of Object.keys(fresh)) if (s[k] === undefined) s[k] = fresh[k];
  for (const k of Object.keys(fresh.stats)) if (s.stats[k] === undefined) s.stats[k] = fresh.stats[k];
  for (const k of Object.keys(fresh.flags)) if (s.flags[k] === undefined) s.flags[k] = fresh.flags[k];
  for (const id of NPC_IDS) if (!s.npcs[id]) s.npcs[id] = fresh.npcs[id];
  return s;
}

export function saveGame(s, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch (e) {
    console.warn('save load failed', e);
    return null;
  }
}

export function hasSave(storage = globalThis.localStorage) {
  try {
    return !!storage?.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

// --- calendar -----------------------------------------------------------------

export function season(s) {
  return SEASONS[s.time.season];
}

export function dayIndex(s) {
  return (s.time.year - 1) * 4 * DAYS_PER_SEASON + s.time.season * DAYS_PER_SEASON + (s.time.day - 1);
}

/** 0 = Monday … 6 = Sunday */
export function dow(s) {
  return dayIndex(s) % 7;
}

export function weekday(s) {
  return WEEKDAYS[dow(s)];
}

export function festivalToday(s) {
  const f = FESTIVALS[season(s)];
  return f && f.day === s.time.day ? f : null;
}

export function clockText(min) {
  const m = Math.floor(min) % (24 * 60);
  let h = Math.floor(m / 60);
  const mm = Math.floor((m % 60) / 10) * 10;
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')}${ap}`;
}

export function rollWeather(seasonName, r) {
  const v = r();
  switch (seasonName) {
    case 'spring':
      return v < 0.25 ? 'rain' : 'sun';
    case 'summer':
      return v < 0.12 ? 'rain' : v < 0.2 ? 'storm' : 'sun';
    case 'fall':
      return v < 0.22 ? 'rain' : 'sun';
    default:
      return v < 0.3 ? 'snow' : v < 0.35 ? 'blizzard' : 'sun';
  }
}

export const isWet = (w) => w === 'rain' || w === 'storm';

// --- inventory ----------------------------------------------------------------

export function countItem(s, id) {
  return s.rucksack.reduce((n, slot) => n + (slot?.id === id ? slot.n : 0), 0);
}

/** Add n of an item to the rucksack; returns how many didn't fit. */
export function addItem(s, id, n = 1) {
  for (const slot of s.rucksack) {
    if (n <= 0) break;
    if (slot && slot.id === id && slot.n < STACK) {
      const k = Math.min(STACK - slot.n, n);
      slot.n += k;
      n -= k;
    }
  }
  for (let i = 0; i < s.rucksack.length && n > 0; i++) {
    if (!s.rucksack[i]) {
      const k = Math.min(STACK, n);
      s.rucksack[i] = { id, n: k };
      n -= k;
    }
  }
  return n;
}

export function canAdd(s, id) {
  return s.rucksack.some((slot) => !slot || (slot.id === id && slot.n < STACK));
}

export function takeFromSlot(s, i, n = 1) {
  const slot = s.rucksack[i];
  if (!slot) return null;
  slot.n -= n;
  if (slot.n <= 0) s.rucksack[i] = null;
  return slot.id;
}

export function hearts(friend) {
  return Math.min(10, Math.floor(friend / 10));
}

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

export function coopCapacity(s) {
  return s.upgrades.coop ? 8 : 4;
}

export function barnCapacity(s) {
  return s.upgrades.barn ? 4 : 2;
}

// --- equipment ----------------------------------------------------------------

/** All equippable entries in cycling order: owned tools, then seed bags. */
export function equipList(s) {
  const out = [];
  for (const t of ['hoe', 'can', 'sickle', 'hammer', 'axe', 'rod', 'milker', 'brush'])
    if (s.tools[t] !== undefined && s.pendingUpgrade?.tool !== t) out.push(t);
  for (const c of CROP_IDS) if ((s.seeds[c] ?? 0) > 0) out.push(`seeds:${c}`);
  return out;
}

export function cycleEquip(s, delta = 1) {
  const list = equipList(s);
  if (!list.length) return (s.equipped = null);
  const i = list.indexOf(s.equipped);
  s.equipped = list[(i + delta + list.length) % list.length];
  return s.equipped;
}
