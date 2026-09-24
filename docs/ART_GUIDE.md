# Moonlit Acres — Art Guide & Sprite Contract

Moonlit Acres is an **original** farming game in the style of the Game Boy Color
era. All art is drawn from scratch for this project. **Do not copy, trace or
recreate sprites, characters, logos or layouts from Harvest Moon, Story of
Seasons, Stardew Valley or any other game.** Genre conventions (tilled soil,
crops, a shipping bin) are fine; specific designs are not.

## Technical format

The engine stores sprites as **palette indices** and resolves colours on the GPU.

* `0` / `.` = transparent, `1`..`8` = palette colour 1..8.
* Palettes hold up to 8 colours. Convention: **1 = darkest (outline)**, and
  higher indices get lighter.
* Every art module exports `register(A)` where `A` is an `AtlasBuilder`
  (`src/engine/atlas.js`):

```js
export function register(A) {
  A.pal('item_turnip', ['#181010', '#488830', '#90d058', '#f0e8f0', '#b85898']);
  A.sprite('item_turnip', 'item_turnip', `
    ......2.2.......
    .....23232......
    ...
  `); // rows are trimmed; every row must have the same width

  // procedural sprites
  A.paint('grass_0', 'grass', 16, 16, (g) => {
    g.fill(3);
    const r = g.rng(42);
    for (let i = 0; i < 12; i++) g.px(r() * 16, r() * 16, 4);
  });

  // flipped / recoloured copies
  A.derive('item_milk_l', 'item_milk_s', { remap: { 3: 4 } });
}
```

Canvas helpers available in `paint()`: `px get fill rect frame hline vline line
circle ellipse art(x,y,ascii) blit(name,x,y,{flipX,flipY,remap}) replace(from,to) rng(seed)`,
plus `w`/`h`.

* Sprite names are global; duplicates throw. Palette names are global too, so
  prefix module-private palettes (e.g. `npc_marta`).
* **Seasonal palettes**: define `name@spring`, `name@summer`, `name@fall`,
  `name@winter` and give sprites the base palette `name`. The engine copies the
  current season's colours into the base row, so one sprite recolours per
  season. All four variants must use the same index layout.
* Several palettes can share one sprite (e.g. `tilled` is drawn with `soil` or
  `soil_wet`) as long as the index layout matches.

## Style rules

* Target look: Game Boy Color. Chunky, readable silhouettes, **no
  anti-aliasing**, light from the top-left.
* Colours: prefer 5-bit-per-channel values (channel values that are multiples of 8,
  e.g. `#f8d0a0`). Shared outline colour: `#181010`. Paper white: `#f8f8e8`.
* Tiles and items: ≤ 4 colours plus transparency is ideal and matches the
  hardware; up to 6 is acceptable for complex pieces. Characters: up to 6.
* Ground tiles (16×16) are fully opaque and must tile seamlessly with
  themselves and with their numbered variants.
* Objects, characters and items have a dark outline (index 1) and transparent
  backgrounds.
* The screen is 160×144 px: 10×9 tiles. Keep detail legible at 1×.

## Preview tool

```
bun tools/preview-atlas.ts '<regex>' --scale=4 --out=/path/to/preview.png [--season=fall] [--bg=#88c070]
```

Writes a labelled contact sheet PNG; open it with the Read tool to inspect your
work. It also runs a full atlas build, so it reports packing errors,
duplicate names and unknown palettes.

## Anchoring conventions used by the engine

* Sprites are drawn **bottom-aligned** to their tile: a 32×48 tree standing on
  tile (tx,ty) spans x ∈ [tx·16, tx·16+32), bottom edge at (ty+1)·16.
* Characters are 16×16. Feet sit on the bottom 2 rows. `side` frames face
  **right**; the engine mirrors them for left.
* Walk animation: frame `0` = standing, frame `1` = mid-step. The engine plays
  0,1,0,1(mirrored) for up/down and 0,1 for side.
* Buildings: doors are 16 px wide, in the **bottom tile row** at the listed door
  column (in tiles from the left edge). The bottom row of the door must look
  walkable (a threshold or step).

## Required sprites

Detailed checklists for each module follow. Names are exact.

### font.js — 8 px text
* `font_<charCode>` for every printable ASCII char 32–126, plus the specials
  128 ♥ heart, 129 ★ star, 130 ♪ note, 131 → right arrow, 132 ↓ down, 133 ↑ up,
  134 ← left, 135 ✓ tick, 136 ✕ cross, 137 ● bullet.
* Each glyph is **exactly 9 rows** tall: rows 0–6 hold cap height (7 px),
  row 6 is the baseline row, rows 7–8 are for descenders (g j p q y , ;).
  Lower-case x-height is 5 px (rows 2–6).
* Width is variable. The glyph's art width is its ink width (most letters 5,
  `i`/`l`/`!` narrower, `m`/`w` up to 7). The engine adds 1 px of spacing.
  Space (32) is 3 px wide of all `.`.
* Ink = index 1. Palettes: `font` (#181010), `font_light` (#f8f8e8),
  `font_dim` (#788080), `font_gold` (#f8c030), `font_red` (#d83828), `font_blue` (#3060c8).

### ui.js
* Window 9-slice, 8×8 each: `ui_win_tl ui_win_t ui_win_tr ui_win_l ui_win_c ui_win_r ui_win_bl ui_win_b ui_win_br`
  — cream paper interior, dark border with slightly rounded corners (palette `ui`).
* HUD 9-slice, 8×8 each: `ui_hud_tl … ui_hud_br` (same 9 names) — compact dark
  panel with light edge (palette `ui_hud`), readable with `font_light` text.
* 8×8: `ui_cursor` (pointer pointing right), `ui_next` (small down triangle
  "more text"), `ui_arrow_up`, `ui_arrow_down`, `ui_arrow_left`, `ui_arrow_right`.
* 8×8 icons: `ic_heart ic_heart_empty ic_coin ic_sun ic_cloud ic_rain ic_snow ic_storm
  ic_spring ic_summer ic_fall ic_winter ic_clock ic_check ic_box ic_star ic_lumber ic_bag`.
* 16×16 stamina faces `face_0` (bright, energetic) … `face_3` (exhausted) — a
  simple round original emoji-like face, not a character.
* 18×18 `ui_slot` (inventory slot frame) and `ui_slot_sel` (highlighted).
* `ui_logo` — title logo ~144×40 reading **MOONLIT ACRES** in chunky original
  lettering with a crescent moon motif.

### items.js — 16×16 icons, also shown held above the player's head
* Crops: `item_turnip item_potato item_strawberry item_tomato item_corn item_melon item_carrot item_eggplant item_pumpkin`
* Seed packets: `item_seeds_<crop>` for the same nine crops (packet with a small
  picture/colour of the crop).
* Animal: `item_egg item_egg_gold item_milk_s item_milk_m item_milk_l`
* Forage: `item_herb item_bamboo item_berry item_moonflower item_mushroom item_chestnut item_snowroot item_pinecone`
* Fish/fishing: `item_fish_s item_fish_m item_fish_l item_fish_gold item_boot`
* Food: `item_bread item_riceball item_pie item_stew`
* Materials: `item_lumber item_stone item_feed item_fodder item_bouquet`
* Tools (16×16, drawn diagonally): `tool_hoe tool_can tool_sickle tool_hammer tool_axe tool_rod tool_milker tool_brush`.
  **All tools share one index layout** so they can be drawn with palettes
  `tool` (iron), `tool_copper` and `tool_gold`:
  1 outline, 2 wood dark, 3 wood light, 4 metal dark, 5 metal mid, 6 metal highlight.

### effects.js
* `fx_rain` (3×8 streak), `fx_splash_0/1` (8×4), `fx_snow_0/1` (3×3 / 4×4),
  `fx_petal` (4×4), `fx_leaf` (5×5),
* `fx_dust_0..2` (16×16 puff), `fx_water_0..2` (16×16 watering splash),
  `fx_grass_0..1` (16×16 cut grass bits), `fx_chip_0..1` (16×16 stone chips),
  `fx_wood_0..1` (16×16 wood chips),
* 8×8: `fx_sparkle_0..2`, `fx_heart`, `fx_note`, `fx_zzz`, `fx_exclaim`,
  `fx_question`, `fx_sweat`, `fx_bobber_0/1`,
* `fx_ripple_0..2` (16×8), `fx_shadow` (12×5 ellipse, single index 1, palette
  `shadow`), `fx_cursor` (16×16 corner brackets marking a target tile),
  `fx_steam_0..2` and `fx_smoke_0..2` (8×8 wisps).

### tiles.js — 16×16 opaque ground
* `grass_0..3` (palette `grass`, seasonal: winter = snow), `grass_flowers` (palette `grass`)
* `field` (untilled farm dirt, palette `field`, seasonal: winter = snowy),
  `tilled` (palettes `soil` **and** `soil_wet`, same layout — wet is darker)
* `path` (packed dirt road, `path`, seasonal), `cobble` (village stone), `sand`,
  `bridge_h`, `bridge_v`
* Water autotiles `water_<mask>_<frame>`: mask 0–15 where bit 1 = land to the
  north, 2 = east, 4 = south, 8 = west (draw a bank on those sides); frames 0/1
  animate. Palette `water`.
* Interiors: `floor_wood`, `floor_stone`, `floor_hay`, `doormat`,
  `wall_top` + `wall_low` (wallpaper upper / lower with skirting; palettes
  `wall_home`, `wall_shop`, `wall_inn` share its layout), `wall_wood_top` +
  `wall_wood_low` (palette `wall_barn`), `window_int` (window on an upper wall,
  palette of its own).

### crops.js — 16×16 transparent, drawn on top of `tilled`
* `crop_seed`, `crop_dead`, and `crop_<crop>_1` (young), `_2` (growing),
  `_3` (ripe, clearly harvestable) for the nine crops. Corn and tomato stages 2–3
  may be 16×24 (bottom-aligned).

### objects.js — transparent world objects
* Debris 16×16: `weed` (seasonal palette `weed`), `stone`, `stump`, `branch`; `boulder` 32×32.
* Nature: `tree` 32×48 (seasonal `tree`: spring blossom, summer green, fall
  orange, winter snow-laden), `pine` 32×48 (seasonal `pine`), `bush` 16×16
  (seasonal `bush`), `flower_bed` 16×16 (seasonal), `hedge` 16×16 (seasonal), `log` 32×16.
* Farm: `shipping_bin` 32×24, `fence_h`, `fence_v`, `fence_post` 16×16,
  `doghouse` 32×32, `mailbox` 16×24, `sign` 16×16, `well` 32×32,
  `scarecrow` 16×32.
* Village: `lamp` 16×32, `bench` 32×16, `fountain_0/1` 48×48, `flower_pot`,
  `barrel`, `crate` 16×16, `noticeboard` 32×32.
* Forest: `hot_spring` 48×32 (stone-rimmed warm pool), `stepping_stone` 16×16.

### buildings.js — exteriors, bottom-aligned
| sprite | size | door col |
|---|---|---|
| `bld_house` (player farmhouse) | 64×64 | 1 |
| `bld_barn` (cows) | 80×64 | 2 |
| `bld_coop` (chickens) | 48×48 | 1 |
| `bld_store` (general store, seed sign) | 64×64 | 1 |
| `bld_ranch` (animal shop) | 64×64 | 2 |
| `bld_smithy` (workshop, chimney) | 64×64 | 1 |
| `bld_inn` (inn / tavern) | 80×64 | 2 |
| `bld_mayor` (mayor's house) | 64×64 | 2 |
| `bld_cottage_a`, `bld_cottage_b` | 48×48 | 1 |
| `bld_cabin` (log cabin) | 48×48 | 1 |

Also export `BUILDING_WINDOWS = { bld_house: [[x, y], ...], ... }` listing
the pixel centre of each window (relative to the sprite's top-left); the engine
puts a warm glow there at night.

### furniture.js — interiors, transparent
`bed` 16×32, `table` 32×24, `chair` 16×16, `stool` 16×16, `tv` 16×16,
`calendar` 16×16 (hangs on a wall), `bookshelf` 16×32, `dresser` 16×32,
`fireplace` 32×32, `fire_0/1` 16×16, `plant` 16×16, `rug` 32×32, `stove` 16×32,
`counter_l`, `counter_m`, `counter_r` 16×16, `shelf_goods` 32×32,
`sack_pile` 16×16, `anvil` 16×16, `forge_0/1` 32×32, `tool_rack` 32×32,
`hay_pile` 16×16, `feed_bin` 16×16, `trough_empty`, `trough_full` 16×16,
`nest` 16×16, `diary` 16×24 (small desk with a journal), `painting` 16×16,
`round_table` 32×24.

### characters.js — 16×16
* Player: `boy_<pose>_<dir>_<f>` and `girl_<pose>_<dir>_<f>`, pose ∈ `walk`,
  `carry` (both hands raised holding something above the head; the engine
  draws the item so its bottom edge overlaps the top 3 rows), `use` (frame 0 =
  wind-up, frame 1 = strike; the engine draws the tool separately); dir ∈
  `down up side`; f ∈ `0 1`. Plus `boy_sleep`, `boy_faint`, `boy_happy`
  (and girl_ equivalents), all 16×16.
* NPCs (walk only): `npc_<id>_<dir>_<f>` for `hollis marta theo bram june pip rosa finn`.

### animals.js
* `chicken_<dir>_<f>` 16×16, `chicken_sit` 16×16
* `cow_side_<f>` 32×24, `cow_down_<f>` / `cow_up_<f>` 24×24
* `dog_<dir>_<f>` 16×16, `dog_sit` 16×16
* `butterfly_0/1` 5×5, `bird_0/1` 8×8 (ambient)
