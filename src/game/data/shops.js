// Shop inventories. Each entry: { id, name, price, sprite, kind, ...}
// kind: seeds | item | meal | feed | fodder | animal | tool | upgrade | building
import { CROPS, ITEMS, TOOLS, UPGRADE_COST, TOOL_LEVELS } from './items.js';

export function storeStock(season) {
  const list = [];
  for (const [id, c] of Object.entries(CROPS)) {
    if (c.season === season) {
      list.push({ id, kind: 'seeds', name: `${c.name} Seeds`, price: c.seedPrice, sprite: `item_seeds_${id}`,
        desc: `Grows in ${c.days} days${c.regrow ? `, regrows every ${c.regrow}` : ''}. Sow on tilled soil.` });
    }
  }
  list.push(
    { id: 'bread', kind: 'item', name: 'Bread', price: 60, sprite: 'item_bread', desc: `Restores ${ITEMS.bread.stamina} stamina.` },
    { id: 'riceball', kind: 'item', name: 'Rice Ball', price: 100, sprite: 'item_riceball', desc: `Restores ${ITEMS.riceball.stamina} stamina.` },
    { id: 'bouquet', kind: 'item', name: 'Bouquet', price: 150, sprite: 'item_bouquet', desc: 'A lovely gift for someone special.' },
  );
  return list;
}

export function ranchStock(state) {
  return [
    { id: 'feed', kind: 'feed', name: 'Chicken Feed', price: 20, sprite: 'item_feed', desc: `In bin: ${state.feed}. One feeds a chicken for a day.` },
    { id: 'fodder', kind: 'fodder', name: 'Cow Fodder', price: 30, sprite: 'item_fodder', desc: `In bin: ${state.fodder}. One feeds a cow for a day.` },
    { id: 'chicken', kind: 'animal', name: 'Chicken', price: 1500, sprite: 'chicken_side_0', desc: 'Lays an egg every day it is fed.' },
    { id: 'cow', kind: 'animal', name: 'Cow', price: 5000, sprite: 'cow_down_0', desc: 'Gives milk daily when fed. Needs a milker.' },
    { id: 'milker', kind: 'tool', name: 'Milker', price: 1200, sprite: 'tool_milker', desc: TOOLS.milker.desc },
    { id: 'brush', kind: 'tool', name: 'Brush', price: 600, sprite: 'tool_brush', desc: TOOLS.brush.desc },
  ];
}

export function smithyStock(state) {
  const list = [];
  for (const id of ['hoe', 'can', 'sickle', 'hammer', 'axe']) {
    const lvl = state.tools[id];
    if (lvl === undefined || lvl >= 2) continue;
    const cost = UPGRADE_COST[lvl + 1];
    list.push({
      id, kind: 'upgrade', level: lvl + 1,
      name: `${TOOL_LEVELS[lvl + 1]} ${TOOLS[id].name}`,
      price: cost.gold, lumber: cost.lumber, sprite: `tool_${id}`,
      pal: lvl + 1 === 1 ? 'tool_copper' : 'tool_gold',
      desc: `Upgrade takes one day. Needs ${cost.lumber} lumber.`,
    });
  }
  if (!state.tools.rod && state.flags.metFinn) {
    list.push({ id: 'rod', kind: 'tool', name: 'Fishing Rod', price: 800, sprite: 'tool_rod', desc: TOOLS.rod.desc });
  }
  if (state.upgrades.coop < 1)
    list.push({ id: 'coop', kind: 'building', name: 'Coop Extension', price: 3000, lumber: 50, sprite: 'item_lumber',
      desc: 'Room for 8 chickens. Needs 50 lumber.' });
  if (state.upgrades.barn < 1)
    list.push({ id: 'barn', kind: 'building', name: 'Barn Extension', price: 5000, lumber: 80, sprite: 'item_lumber',
      desc: 'Room for 4 cows. Needs 80 lumber.' });
  if (state.upgrades.house < 1)
    list.push({ id: 'house', kind: 'building', name: 'Feather Bed', price: 4000, lumber: 40, sprite: 'item_lumber',
      desc: 'A better bed. Max stamina +30. Needs 40 lumber.' });
  return list;
}

export function innStock() {
  return [
    { id: 'soup', kind: 'meal', name: 'Daily Soup', price: 80, stamina: 30, sprite: 'item_stew', desc: 'Eat now. Restores 30 stamina.' },
    { id: 'feast', kind: 'meal', name: 'Farmhand Feast', price: 250, stamina: 999, sprite: 'item_stew', desc: 'Eat now. Fully restores stamina.' },
    { id: 'pie', kind: 'item', name: 'Berry Pie', price: 180, sprite: 'item_pie', desc: `Take away. Restores ${ITEMS.pie.stamina}.` },
    { id: 'stew', kind: 'item', name: 'Hearty Stew', price: 220, sprite: 'item_stew', desc: `Take away. Restores ${ITEMS.stew.stamina}.` },
  ];
}
