// Pure simulation rules: tool actions on the farm, the overnight update,
// animals, foraging and fishing. No rendering; unit-tested in tests/.
import { CROPS, ITEMS, SEASONS, DAYS_PER_SEASON, CAN_CAPACITY, cropStage } from './data/items.js';
import { getMaps } from './data/maps.js';
import { G } from './mapbuilder.js';
import { OBJDEFS } from './data/objects.js';
import {
  CROP_IDS, DEBRIS, season, rollWeather, isWet, dayIndex, coopCapacity, barnCapacity, festivalToday,
} from './state.js';
import { NPC_IDS } from './data/npcs.js';

const idx = (s, x, y) => y * s.farm.w + x;
const inFarm = (s, x, y) => x >= 0 && y >= 0 && x < s.farm.w && y < s.farm.h;

export function isFieldCell(x, y) {
  const fm = getMaps().farm;
  return x >= 0 && y >= 0 && x < fm.w && y < fm.h && fm.ground[y * fm.w + x] === G.field;
}

/** Cells affected by a (possibly charged) tool. dx,dy = facing. */
export function toolArea(fx, fy, dx, dy, charge = 0) {
  if (charge <= 0) return [[fx, fy]];
  const out = [];
  if (charge === 1) {
    for (let k = 0; k < 3; k++) out.push([fx + dx * k, fy + dy * k]);
    return out;
  }
  const px = -dy, py = dx; // perpendicular
  for (let k = 0; k < 3; k++) for (let l = -1; l <= 1; l++) out.push([fx + dx * k + px * l, fy + dy * k + py * l]);
  return out;
}

/** Find the anchor of a (possibly multi-cell) boulder covering (x,y). */
export function boulderAnchor(s, x, y) {
  for (const [ax, ay] of [[x, y], [x - 1, y], [x, y + 1], [x - 1, y + 1]]) {
    if (inFarm(s, ax, ay) && s.farm.debris[idx(s, ax, ay)] === DEBRIS.boulder) {
      const cells = [[ax, ay], [ax + 1, ay], [ax, ay - 1], [ax + 1, ay - 1]];
      if (cells.some(([cx, cy]) => cx === x && cy === y)) return [ax, ay];
    }
  }
  return null;
}

/**
 * Apply one tool to one farm cell. Returns an effect record
 * { ok, fx, sfx, lumber, msg } — ok=false means nothing happened.
 */
export function applyTool(s, tool, level, x, y) {
  const none = { ok: false };
  if (!inFarm(s, x, y) || !isFieldCell(x, y)) return none;
  const f = s.farm;
  const i = idx(s, x, y);
  const d = f.debris[i];
  switch (tool) {
    case 'hoe': {
      if (d || f.soil[i] || f.crop[i]) return none;
      f.soil[i] = 1;
      f.wet[i] = isWet(s.weather) ? 1 : 0;
      return { ok: true, fx: 'dust', sfx: 'hoe' };
    }
    case 'can': {
      if (!f.soil[i]) return { ok: false, splash: true };
      f.wet[i] = 1;
      return { ok: true, fx: 'water', sfx: 'water' };
    }
    case 'sickle': {
      if (d === DEBRIS.weed) {
        f.debris[i] = 0;
        s.stats.debris++;
        return { ok: true, fx: 'grass', sfx: 'sickle' };
      }
      if (f.crop[i] && f.dead[i]) {
        f.crop[i] = 0;
        f.dead[i] = 0;
        f.age[i] = 0;
        return { ok: true, fx: 'grass', sfx: 'sickle' };
      }
      return none;
    }
    case 'hammer': {
      if (d === DEBRIS.stone) {
        f.debris[i] = 0;
        s.stats.debris++;
        return { ok: true, fx: 'chip', sfx: 'rock_break' };
      }
      if (d === DEBRIS.boulder || d === DEBRIS.boulderPart) {
        const a = boulderAnchor(s, x, y);
        if (!a) return none;
        if (level < 1) return { ok: false, fx: 'chip', sfx: 'hammer', msg: 'This boulder is too hard. A stronger hammer might do it.' };
        const ai = idx(s, a[0], a[1]);
        f.hp[ai] -= level + 1;
        if (f.hp[ai] > 0) return { ok: true, fx: 'chip', sfx: 'hammer' };
        for (const [cx, cy] of [[a[0], a[1]], [a[0] + 1, a[1]], [a[0], a[1] - 1], [a[0] + 1, a[1] - 1]])
          f.debris[idx(s, cx, cy)] = 0;
        f.hp[ai] = 0;
        s.stats.debris++;
        return { ok: true, fx: 'chip', sfx: 'rock_break', big: true };
      }
      if (f.soil[i] && !f.crop[i]) {
        f.soil[i] = 0;
        f.wet[i] = 0;
        return { ok: true, fx: 'dust', sfx: 'hammer' };
      }
      return none;
    }
    case 'axe': {
      if (d === DEBRIS.branch) {
        f.debris[i] = 0;
        s.lumber += 1;
        s.stats.debris++;
        return { ok: true, fx: 'wood', sfx: 'wood_break', lumber: 1 };
      }
      if (d === DEBRIS.stump) {
        f.hp[i] -= level + 1;
        if (f.hp[i] > 0) return { ok: true, fx: 'wood', sfx: 'axe' };
        f.debris[i] = 0;
        f.hp[i] = 0;
        s.lumber += 4;
        s.stats.debris++;
        return { ok: true, fx: 'wood', sfx: 'wood_break', lumber: 4 };
      }
      return none;
    }
  }
  return none;
}

/** Sow a bag of seeds in the 3x3 area centred on (cx,cy). Returns cells planted. */
export function plantSeeds(s, cropId, cx, cy) {
  if (CROPS[cropId].season !== season(s)) return -1;
  let n = 0;
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inFarm(s, x, y) || !isFieldCell(x, y)) continue;
      const i = idx(s, x, y);
      if (!s.farm.soil[i] || s.farm.crop[i] || s.farm.debris[i]) continue;
      s.farm.crop[i] = CROP_IDS.indexOf(cropId) + 1;
      s.farm.age[i] = 0;
      s.farm.dead[i] = 0;
      n++;
    }
  return n;
}

export function cropAt(s, x, y) {
  if (!inFarm(s, x, y)) return null;
  const i = idx(s, x, y);
  const c = s.farm.crop[i];
  if (!c) return null;
  const id = CROP_IDS[c - 1];
  return { id, age: s.farm.age[i], dead: !!s.farm.dead[i], stage: cropStage(id, s.farm.age[i]) };
}

/** Harvest a ripe crop. Returns the item id or null. */
export function harvest(s, x, y) {
  const c = cropAt(s, x, y);
  if (!c || c.dead || c.stage < 3) return null;
  const i = idx(s, x, y);
  const def = CROPS[c.id];
  if (def.regrow) s.farm.age[i] = def.days - def.regrow;
  else {
    s.farm.crop[i] = 0;
    s.farm.age[i] = 0;
  }
  return c.id;
}

export function refillCan(s) {
  s.water = CAN_CAPACITY[s.tools.can ?? 0];
}

// --- forage & fishing -----------------------------------------------------------

export const FORAGE = {
  spring: ['herb', 'herb', 'bamboo'],
  summer: ['berry', 'berry', 'berry', 'moonflower'],
  fall: ['mushroom', 'mushroom', 'chestnut'],
  winter: ['snowroot', 'pinecone', 'pinecone'],
};

export function spawnForage(s, r) {
  const map = getMaps().forest;
  const list = FORAGE[season(s)];
  s.drops.forest = (s.drops.forest ?? []).filter((d) => !d.forage);
  for (const [x, y] of map.forage) {
    if (r() < 0.45) s.drops.forest.push({ x, y, id: list[Math.floor(r() * list.length)], forage: true });
  }
}

export function rollFish(r, mapId, min) {
  const v = r();
  if (v < 0.05) return 'boot';
  if (v < 0.065 && mapId === 'forest') return 'fish_gold';
  const morning = min < 9 * 60 ? 0.1 : 0;
  if (v < 0.22 + morning) return 'fish_l';
  if (v < 0.55 + morning) return 'fish_m';
  return 'fish_s';
}

// --- shipping & overnight --------------------------------------------------------

export function ship(s, id, n = 1) {
  s.shipping[id] = (s.shipping[id] ?? 0) + n;
}

export function shippable(id) {
  return (ITEMS[id]?.price ?? 0) > 0;
}

function freePenCell(map, taken, r) {
  const pen = map.pen;
  for (let t = 0; t < 40; t++) {
    const x = pen.x + Math.floor(r() * pen.w);
    const y = pen.y + Math.floor(r() * pen.h);
    const key = `${x},${y}`;
    if (taken.has(key)) continue;
    const blocked = map.objects.some((o) => {
      const d = OBJDEFS[o.name];
      if (!d || d.wall || d.solid === false) return false;
      const fw = d.fw ?? 1, fh = d.fh ?? 1;
      return x >= o.x && x < o.x + fw && y <= o.y && y > o.y - fh;
    });
    if (blocked) continue;
    taken.add(key);
    return [x, y];
  }
  return null;
}

/**
 * Advance to the next morning. mode: 'sleep' | 'faint'.
 * Returns a report shown on the morning summary screen.
 */
export function endDay(s, r, mode = 'sleep') {
  const report = { shipped: [], total: 0, notes: [], mode };
  const seasonNow = season(s);

  // 1. shipping
  for (const [id, n] of Object.entries(s.shipping)) {
    const value = (ITEMS[id]?.price ?? 0) * n;
    report.shipped.push({ id, n, value });
    report.total += value;
    s.stats.shipped[id] = (s.stats.shipped[id] ?? 0) + n;
    if (ITEMS[id]?.kind === 'crop') {
      const cs = CROPS[id]?.season;
      if (cs && !s.stats.seasonsShipped.includes(cs)) s.stats.seasonsShipped.push(cs);
    }
  }
  s.gold += report.total;
  s.stats.earned += report.total;
  s.shipping = {};

  // 2. crops
  const f = s.farm;
  for (let i = 0; i < f.crop.length; i++) {
    if (f.crop[i] && !f.dead[i] && f.wet[i]) f.age[i]++;
    f.wet[i] = 0;
  }

  // 3. animals
  const maps = getMaps();
  const chickens = s.animals.filter((a) => a.kind === 'chicken');
  const cows = s.animals.filter((a) => a.kind === 'cow');
  const taken = new Set((s.drops.coop ?? []).map((d) => `${d.x},${d.y}`));
  s.drops.coop = s.drops.coop ?? [];
  chickens.forEach((a, k) => {
    const fed = k < s.coopFeed;
    if (fed) {
      const cell = freePenCell(maps.coop, taken, r);
      if (cell) {
        const gold = a.happy >= 8 && r() < 0.2;
        s.drops.coop.push({ x: cell[0], y: cell[1], id: gold ? 'egg_gold' : 'egg' });
      }
    } else a.happy = Math.max(0, a.happy - 1);
    a.talked = false;
    a.age = (a.age ?? 0) + 1;
  });
  cows.forEach((a, k) => {
    const fed = k < s.barnFeed;
    a.milkReady = fed;
    if (!fed) {
      a.happy = Math.max(0, a.happy - 1);
      report.notes.push(`${a.name} went hungry.`);
    }
    a.talked = false;
    a.brushed = false;
    a.age = (a.age ?? 0) + 1;
  });
  if (chickens.length > s.coopFeed) report.notes.push(`${chickens.length - s.coopFeed} chicken(s) went hungry.`);
  s.coopFeed = 0;
  s.barnFeed = 0;

  // 4. villagers & dog
  for (const id of NPC_IDS) {
    s.npcs[id].talked = false;
    s.npcs[id].gifted = false;
  }
  s.dog.petted = false;

  // 5. calendar
  s.time.day++;
  let newSeason = false;
  if (s.time.day > DAYS_PER_SEASON) {
    s.time.day = 1;
    s.time.season++;
    newSeason = true;
    if (s.time.season >= 4) {
      s.time.season = 0;
      s.time.year++;
    }
  }
  s.time.min = 6 * 60;
  s.stats.days++;
  const seasonNew = season(s);
  if (newSeason) {
    let withered = 0;
    for (let i = 0; i < f.crop.length; i++) {
      if (!f.crop[i] || f.dead[i]) continue;
      if (CROPS[CROP_IDS[f.crop[i] - 1]].season !== seasonNew) {
        f.dead[i] = 1;
        withered++;
      }
    }
    if (withered) report.notes.push(`${withered} ${seasonNow} crop(s) withered with the change of season.`);
  }

  // 6. tool upgrade
  if (s.pendingUpgrade && dayIndex(s) >= s.pendingUpgrade.ready) {
    s.tools[s.pendingUpgrade.tool] = s.pendingUpgrade.level;
    report.notes.push('Your upgraded tool is ready at the workshop!');
    report.upgradeReady = s.pendingUpgrade.tool;
    s.pendingUpgrade.done = true;
  }

  // 7. weather
  s.weather = s.tomorrow;
  const nextDay = s.time.day + 1 > DAYS_PER_SEASON ? SEASONS[(s.time.season + 1) % 4] : seasonNew;
  s.tomorrow = rollWeather(nextDay, r);
  if (festivalToday(s) && isWet(s.weather)) s.weather = 'sun'; // festivals always get fair skies
  if (isWet(s.weather)) for (let i = 0; i < f.soil.length; i++) if (f.soil[i]) f.wet[i] = 1;

  // 8. regrowth of weeds on idle field
  if (seasonNew !== 'winter') {
    for (let i = 0; i < f.debris.length; i++) {
      if (f.debris[i] || f.soil[i] || f.crop[i]) continue;
      const x = i % f.w, y = Math.floor(i / f.w);
      if (!isFieldCell(x, y)) continue;
      const v = r();
      if (v < 0.004) f.debris[i] = DEBRIS.weed;
      else if (v < 0.005) f.debris[i] = DEBRIS.stone;
    }
  }

  // 9. forage
  spawnForage(s, r);

  // 10. rest
  const bed = s.upgrades.house ? 30 : 0;
  s.maxStamina = 100 + bed;
  s.stamina = mode === 'faint' ? Math.floor(s.maxStamina / 2) : s.maxStamina;
  s.carrying = null;
  return report;
}

export function newAnimal(s, kind, name) {
  const a = { kind, name, happy: kind === 'cow' ? 3 : 3, age: 0, talked: false, brushed: false, milkReady: false };
  s.animals.push(a);
  return a;
}

export function animalSpace(s, kind) {
  const n = s.animals.filter((a) => a.kind === kind).length;
  return (kind === 'chicken' ? coopCapacity(s) : barnCapacity(s)) - n;
}

export function milkSize(happy) {
  return happy >= 7 ? 'milk_l' : happy >= 4 ? 'milk_m' : 'milk_s';
}

/** Fill feeding troughs from stock. Returns how many were filled. */
export function fillTroughs(s, kind) {
  const count = s.animals.filter((a) => a.kind === kind).length;
  const cap = kind === 'chicken' ? coopCapacity(s) : barnCapacity(s);
  const key = kind === 'chicken' ? 'coopFeed' : 'barnFeed';
  const stock = kind === 'chicken' ? 'feed' : 'fodder';
  const want = Math.min(Math.max(count, 1), cap) - s[key];
  const n = Math.max(0, Math.min(want, s[stock]));
  s[key] += n;
  s[stock] -= n;
  return n;
}
