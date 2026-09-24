# Moonlit Acres

An original Game Boy Color–style farming game for the web, rendered on the GPU
with **WebGPU** (automatic **WebGL2** fallback).

Inherit your grandmother's overgrown farm in the valley village of Willowmere:
clear the field, grow crops through four seasons, raise chickens and cows, fish,
forage, befriend eight villagers and complete the Farm Journal.

> This is a tribute to the cosy handheld farming games of the late '90s, not a
> copy of one. All code, pixel art, characters, story, dialogue and music were
> made from scratch for this project; no ROMs or assets from existing games are
> used.

## Play

```sh
bun install        # nothing to install — no dependencies
bun start          # http://localhost:8080
```

Any static file server works, since the game is plain ES modules with no build
step. Useful URL parameters: `?renderer=webgl2` forces the fallback renderer,
`?touch=1` shows the on-screen gamepad.

### Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / stick | D-pad |
| A — talk, pick up, confirm | Z / J / Space | A | A |
| B — use tool, cancel | X / K | B | B |
| Switch tool | Shift / C / Tab, Q / E | Select, LB / RB | Select, ◀ ▶ |
| Menu | Enter / Esc | Start | Start |
| Fullscreen | F | | |

Hold **B** with an upgraded hoe, watering can or sickle to charge it and work up
to nine tiles at once.

## Features

- **Farming**: till, sow 3×3 seed bags, water, harvest nine crops across spring,
  summer and fall. Crops only grow on watered days; rain waters for you; season
  changes wither out-of-season crops. Clear weeds, stones, stumps, branches and
  boulders (boulders need an upgraded hammer).
- **Economy**: ship goods in the bin, get paid overnight with a shipping report.
  Upgrade tools (Iron → Copper → Golden) and buildings with gold and lumber.
- **Animals**: buy chickens and cows, fill their troughs from the feed bin, collect
  eggs, milk and brush cows. Happiness affects milk size and golden eggs.
- **Village life**: eight villagers with daily schedules that react to weekday,
  weather and festivals; friendship hearts, gifts with likes and dislikes; four
  shops with opening hours; four seasonal festivals.
- **Exploration**: the farm, Willowmere village, Whisperwood forest with a river,
  pond, a warm spring that restores stamina, forageables and fishing.
- **Time & weather**: 30-day seasons, day/night cycle with dynamic lighting, rain,
  thunderstorms, snow, blizzards, petals, falling leaves and fireflies.
- **Save/continue** via the bed and the diary (localStorage).
- **Chiptune audio** synthesised live with WebAudio in the style of the handheld's
  sound chip: two pulse channels, a wave channel and noise.

## Technical overview

```
src/
  engine/   atlas.js (indexed-colour sprite atlas), renderer.js,
            gpu-webgpu.js / gpu-webgl2.js (backends), input.js, text.js
  art/      pixel art as ASCII + procedural painters, one module per theme
  audio/    WebAudio chiptune engine, songs and sound effects
  game/     state & simulation (pure, unit-tested), world, entities, UI, scenes
tools/      dev server, atlas preview, headless screenshot and playtest harness
tests/      bun unit tests for the simulation
```

**Rendering pipeline.** Every sprite is stored as palette indices in a single
`r8uint` atlas texture; colours are looked up in a palette texture in the fragment
shader, so seasonal recolours (grass, trees, soil wet/dry) are palette-row swaps
with no new pixel data. Each frame is four GPU passes, each a single instanced
draw call:

1. **World** → 160×144 target (sprites, y-sorted in 3/4 perspective)
2. **Light** → 160×144 target cleared to the ambient colour of the time of day,
   with additive radial lights for lamps, windows, forges, fireflies and the
   player's lantern
3. **UI** → 160×144 target (premultiplied alpha)
4. **Composite** → canvas: world × light, UI over it, sharp-bilinear upscaling to
   any size and an optional LCD pixel grid plus handheld colour response

The WebGL2 backend mirrors the same pipeline (`usampler2D` + `texelFetch`, three
framebuffers, instanced arrays).

## Development

```sh
bun test                                   # simulation unit tests
bun tools/playtest.ts [--backend=webgl2]   # drives the real game in headless Chromium
bun tools/shot.ts --query="autostart=1&skipintro=1&map=village&time=20"
bun tools/preview-atlas.ts '^npc_' --scale=4 --out=npcs.png
```

`docs/ART_GUIDE.md` is the sprite contract used for the art.

## License

MIT
