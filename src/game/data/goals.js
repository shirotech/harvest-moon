// Farm journal goals. Completing them all triggers the Moonlit Festival ending.
import { ITEMS } from './items.js';

const shippedKind = (s, kinds) =>
  Object.entries(s.stats.shipped).reduce((n, [id, c]) => (kinds.includes(ITEMS[id]?.kind) ? n + c : n), 0);

export const GOALS = [
  { id: 'clear', text: 'Clear 30 field debris', check: (s) => s.stats.debris >= 30, progress: (s) => [s.stats.debris, 30] },
  { id: 'firstShip', text: 'Ship your first crop', check: (s) => shippedKind(s, ['crop']) >= 1 },
  { id: 'earn5k', text: 'Ship 5,000G of goods', check: (s) => s.stats.earned >= 5000, progress: (s) => [s.stats.earned, 5000] },
  { id: 'chicken', text: 'Raise a chicken', check: (s) => s.animals.some((a) => a.kind === 'chicken') },
  { id: 'eggs', text: 'Ship 10 eggs', check: (s) => (s.stats.shipped.egg ?? 0) + (s.stats.shipped.egg_gold ?? 0) >= 10,
    progress: (s) => [(s.stats.shipped.egg ?? 0) + (s.stats.shipped.egg_gold ?? 0), 10] },
  { id: 'cow', text: 'Raise a cow', check: (s) => s.animals.some((a) => a.kind === 'cow') },
  { id: 'fish', text: 'Catch a fish', check: (s) => s.stats.fish >= 1 },
  { id: 'friend', text: 'Make a friend (4♥)', check: (s) => Object.values(s.npcs).some((n) => n.friend >= 40) },
  { id: 'seasons', text: 'Ship crops in 3 seasons', check: (s) => ['spring', 'summer', 'fall'].every((x) => s.stats.seasonsShipped.includes(x)) },
  { id: 'upgrade', text: 'Upgrade a tool', check: (s) => Object.values(s.tools).some((l) => l >= 1) },
  { id: 'forage', text: 'Forage 20 wild items', check: (s) => s.stats.forage >= 20, progress: (s) => [s.stats.forage, 20] },
  { id: 'earn50k', text: 'Ship 50,000G of goods', check: (s) => s.stats.earned >= 50000, progress: (s) => [s.stats.earned, 50000] },
];
