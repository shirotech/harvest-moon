// Registers every sprite and palette into an AtlasBuilder.
import * as font from './font.js';
import * as ui from './ui.js';
import * as items from './items.js';
import * as effects from './effects.js';
import * as tiles from './tiles.js';
import * as crops from './crops.js';
import * as objects from './objects.js';
import * as buildings from './buildings.js';
import * as furniture from './furniture.js';
import * as characters from './characters.js';
import * as npcs from './npcs.js';
import * as animals from './animals.js';

// Order matters only for derive()/blit() between modules.
export const MODULES = { font, ui, items, effects, tiles, crops, objects, buildings, furniture, characters, npcs, animals };

export function registerAll(A) {
  for (const m of Object.values(MODULES)) m.register(A);
  return A;
}
