import { describe, expect, test } from 'bun:test';
import { newGame, serialize, deserialize, addItem, countItem, DEBRIS, dow, clockText, equipList, cycleEquip } from '../src/game/state.js';
import { applyTool, plantSeeds, harvest, endDay, cropAt, toolArea, isFieldCell, fillTroughs, newAnimal, ship } from '../src/game/sim.js';
import { getMaps } from '../src/game/data/maps.js';
import { GOALS } from '../src/game/data/goals.js';
import { rng } from '../src/engine/atlas.js';

function clearField(s) {
  s.farm.debris.fill(0);
  s.farm.hp.fill(0);
}

describe('new game', () => {
  test('farm has debris on field cells only', () => {
    const s = newGame({ seed: 7 });
    let n = 0;
    s.farm.debris.forEach((d, i) => {
      if (!d) return;
      n++;
      expect(isFieldCell(i % s.farm.w, Math.floor(i / s.farm.w))).toBe(true);
    });
    expect(n).toBeGreaterThan(40);
  });

  test('save round-trips', () => {
    const s = newGame({ name: 'Robin', seed: 3 });
    s.gold = 1234;
    const t = deserialize(serialize(s));
    expect(t.gold).toBe(1234);
    expect(t.player.name).toBe('Robin');
    expect(t.farm.debris.length).toBe(s.farm.debris.length);
  });

  test('calendar helpers', () => {
    const s = newGame();
    expect(dow(s)).toBe(0);
    expect(clockText(6 * 60)).toBe('6:00AM');
    expect(clockText(13 * 60 + 25)).toBe('1:20PM');
    expect(clockText(24 * 60)).toBe('12:00AM');
  });
});

describe('farming', () => {
  test('till, plant, water, grow, harvest turnips', () => {
    const s = newGame({ seed: 1 });
    clearField(s);
    const r = rng(1);
    for (const [x, y] of toolArea(10, 14, 0, 1, 2)) expect(applyTool(s, 'hoe', 2, x, y).ok).toBe(true);
    expect(plantSeeds(s, 'turnip', 10, 15)).toBe(9);
    for (let day = 0; day < 4; day++) {
      for (let y = 14; y <= 16; y++) for (let x = 9; x <= 11; x++) applyTool(s, 'can', 0, x, y);
      endDay(s, r);
    }
    expect(cropAt(s, 10, 15).stage).toBe(3);
    expect(harvest(s, 10, 15)).toBe('turnip');
    expect(cropAt(s, 10, 15)).toBe(null);
  });

  test('unwatered crops do not grow', () => {
    const s = newGame({ seed: 1 });
    clearField(s);
    s.tomorrow = 'sun';
    applyTool(s, 'hoe', 0, 8, 12);
    plantSeeds(s, 'turnip', 8, 12);
    endDay(s, rng(2));
    s.weather = 'sun';
    expect(cropAt(s, 8, 12).age).toBe(0);
  });

  test('debris clearing rewards lumber and counts', () => {
    const s = newGame({ seed: 1 });
    clearField(s);
    const i = 12 * s.farm.w + 8;
    s.farm.debris[i] = DEBRIS.stump;
    s.farm.hp[i] = 3;
    applyTool(s, 'axe', 0, 8, 12);
    applyTool(s, 'axe', 0, 8, 12);
    expect(s.farm.debris[i]).toBe(DEBRIS.stump);
    applyTool(s, 'axe', 0, 8, 12);
    expect(s.farm.debris[i]).toBe(0);
    expect(s.lumber).toBe(4);
    expect(s.stats.debris).toBe(1);
  });

  test('boulders need an upgraded hammer', () => {
    const s = newGame({ seed: 1 });
    clearField(s);
    const w = s.farm.w;
    s.farm.debris[12 * w + 8] = DEBRIS.boulder;
    s.farm.debris[12 * w + 9] = DEBRIS.boulderPart;
    s.farm.debris[11 * w + 8] = DEBRIS.boulderPart;
    s.farm.debris[11 * w + 9] = DEBRIS.boulderPart;
    s.farm.hp[12 * w + 8] = 6;
    expect(applyTool(s, 'hammer', 0, 9, 11).ok).toBe(false);
    for (let k = 0; k < 3; k++) applyTool(s, 'hammer', 1, 9, 11);
    expect(s.farm.debris[11 * w + 9]).toBe(0);
  });

  test('season change withers crops', () => {
    const s = newGame({ seed: 1 });
    clearField(s);
    applyTool(s, 'hoe', 0, 8, 12);
    plantSeeds(s, 'turnip', 8, 12);
    s.time.day = 30;
    endDay(s, rng(3));
    expect(s.time.season).toBe(1);
    expect(cropAt(s, 8, 12).dead).toBe(true);
    expect(plantSeeds(s, 'turnip', 8, 12)).toBe(-1);
  });
});

describe('economy & animals', () => {
  test('shipping pays out overnight and updates goals data', () => {
    const s = newGame({ seed: 1 });
    ship(s, 'turnip', 9);
    const rep = endDay(s, rng(4));
    expect(rep.total).toBe(540);
    expect(s.gold).toBe(1040);
    expect(GOALS.find((g) => g.id === 'firstShip').check(s)).toBe(true);
  });

  test('fed chickens lay eggs in the coop', () => {
    const s = newGame({ seed: 1 });
    newAnimal(s, 'chicken', 'Clucky');
    newAnimal(s, 'chicken', 'Pecky');
    s.feed = 1;
    expect(fillTroughs(s, 'chicken')).toBe(1);
    endDay(s, rng(5));
    expect(s.drops.coop.length).toBe(1);
  });

  test('rucksack stacks to 9', () => {
    const s = newGame();
    expect(addItem(s, 'egg', 20)).toBe(0);
    expect(countItem(s, 'egg')).toBe(20);
    expect(s.rucksack.filter(Boolean).length).toBe(3);
  });

  test('equip cycling covers tools and seeds', () => {
    const s = newGame();
    expect(equipList(s)).toEqual(['hoe', 'can', 'sickle', 'hammer', 'axe', 'seeds:turnip']);
    s.equipped = 'seeds:turnip';
    expect(cycleEquip(s)).toBe('hoe');
  });
});

describe('maps', () => {
  test('warps land on walkable cells inside target map', () => {
    const maps = getMaps();
    for (const m of Object.values(maps)) {
      for (const w of [...m.warps, ...m.doors.filter((d) => d.to)]) {
        const t = maps[w.to];
        expect(t).toBeDefined();
        expect(w.tx).toBeGreaterThanOrEqual(0);
        expect(w.ty).toBeGreaterThanOrEqual(0);
        expect(w.tx).toBeLessThan(t.w);
        expect(w.ty).toBeLessThan(t.h);
      }
    }
  });
});
