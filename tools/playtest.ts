// Scripted playtest: drives the game with real key presses in headless Chromium
// and captures screenshots at checkpoints. Fails on page errors or broken invariants.
//   bun tools/playtest.ts [--backend=webgpu|webgl2] [--out=dir] [--only=name]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.ts';
import { CHROME_ARGS } from './shot.ts';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const backend = arg('backend', 'webgpu');
const out = arg('out', 'playtest-out');
const only = arg('only', '');
mkdirSync(out, { recursive: true });

const srv = startServer(0);
const browser = await chromium.launch({ args: CHROME_ARGS });
const errors: string[] = [];
let failures = 0;

type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function open(query: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 640, height: 576 } });
  page.on('pageerror', (e) => errors.push(`${query}: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/404|audio/.test(t)) errors.push(`${query}: console: ${t}`);
    if (/missing sprite|unknown palette/.test(t)) errors.push(`${query}: ${t}`);
  });
  await page.goto(`http://localhost:${srv.port}/?renderer=${backend}&${query}`);
  await page.waitForFunction(() => (window as any).GAME?.ready && (window as any).GAME.scene, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  return page;
}

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function tap(page: Page, key: string, times = 1, gap = 120) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key);
    await page.waitForTimeout(60);
    await page.keyboard.up(key);
    await page.waitForTimeout(gap);
  }
}

async function shot(page: Page, name: string) {
  await page.locator('#screen').screenshot({ path: `${out}/${name}.png` });
}

const info = (page: Page) => page.evaluate(() => (window as any).GAME.debugInfo());
const ev = (page: Page, fn: string) => page.evaluate(fn);

function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  ✗ ${msg}`);
  } else console.log(`  ✓ ${msg}`);
}

const tests: Record<string, () => Promise<void>> = {
  async title() {
    const p = await open('');
    await p.waitForTimeout(800);
    await tap(p, 'Enter');
    await p.waitForTimeout(400);
    await shot(p, 'title');
    const i = await info(p);
    check(i.scene === 'TitleScene', 'title scene is shown');
    await tap(p, 'Enter');
    await p.waitForTimeout(1200);
    await shot(p, 'newgame');
    const j = await info(p);
    check(j.scene === 'NewGameScene', 'new game scene opens');
    await tap(p, 'ArrowRight');
    await tap(p, 'KeyZ');
    await p.waitForTimeout(300);
    await p.keyboard.type('Robin');
    await tap(p, 'Enter');
    await p.waitForTimeout(500);
    await shot(p, 'confirm-name');
    await tap(p, 'KeyZ', 2, 400);
    await p.waitForTimeout(2500);
    await shot(p, 'intro');
    const k = await info(p);
    check(k.scene === 'PlayScene', 'play scene starts after naming');
    // advance intro dialogue
    for (let n = 0; n < 150; n++) {
      const st = await info(p);
      if (!st.script && !st.overlays.length) break;
      await tap(p, 'KeyZ', 1, 150);
    }
    const l = await info(p);
    check(!l.script, 'intro finishes');
    await shot(p, 'after-intro');
    await p.close();
  },

  async farming() {
    const p = await open('autostart=1&skipintro=1');
    // walk down onto the field edge
    await hold(p, 'ArrowDown', 700);
    await ev(p, `(() => { const s = GAME.scene.state; for (let i=0;i<s.farm.debris.length;i++) s.farm.debris[i]=0; })()`);
    await tap(p, 'KeyX', 1, 500);
    const tilled = await ev(p, `GAME.scene.state.farm.soil.reduce((a,b)=>a+b,0)`);
    check(tilled >= 1, `hoe tills soil (${tilled})`);
    // switch to seeds and sow
    await ev(p, `GAME.scene.state.equipped = 'seeds:turnip'`);
    await tap(p, 'KeyX', 1, 600);
    const planted = await ev(p, `GAME.scene.state.farm.crop.filter(Boolean).length`);
    check(planted >= 1, `seeds planted (${planted})`);
    await ev(p, `GAME.scene.state.equipped = 'can'`);
    await tap(p, 'KeyX', 1, 600);
    const wet = await ev(p, `GAME.scene.state.farm.wet.reduce((a,b)=>a+b,0)`);
    check(wet >= 1, `watering wets soil (${wet})`);
    await shot(p, 'farming');
    // fast-forward crops to ripe and harvest
    await ev(p, `(() => { const f = GAME.scene.state.farm; for (let i=0;i<f.crop.length;i++) if (f.crop[i]) f.age[i]=9; })()`);
    await tap(p, 'KeyZ', 1, 500);
    const carrying = await ev(p, `GAME.scene.state.carrying`);
    check(carrying === 'turnip', `harvest picks up a turnip (${carrying})`);
    await shot(p, 'harvest');
    // walk to bin and ship
    await ev(p, `(() => { const sc = GAME.scene; sc.player.placeAt(7, 7, 'up'); })()`);
    await tap(p, 'KeyZ', 1, 500);
    const shipped = await ev(p, `GAME.scene.state.shipping.turnip ?? 0`);
    check(shipped === 1, 'turnip shipped via bin');
    // menu
    await tap(p, 'Enter', 1, 400);
    await shot(p, 'menu-items');
    for (const tab of ['tools', 'farm', 'friends', 'journal', 'options']) {
      await tap(p, 'ShiftLeft', 1, 250);
      await shot(p, `menu-${tab}`);
    }
    await tap(p, 'Enter', 1, 300);
    // sleep: go to house bed
    await ev(p, `GAME.scene.loadMap('house', 1, 3, 'left')`);
    await p.waitForTimeout(200);
    await tap(p, 'KeyZ', 1, 800);
    await shot(p, 'bed-prompt');
    await tap(p, 'KeyZ', 1, 300);
    await p.waitForTimeout(4000);
    await shot(p, 'report');
    await tap(p, 'KeyZ', 3, 700);
    await p.waitForTimeout(1500);
    const d = await info(p);
    check(d.day === 'spring 2 y1', `sleeping advances the day (${d.day})`);
    check(d.gold === 560, `shipping paid out (${d.gold})`);
    await shot(p, 'morning');
    await p.close();
  },

  async village() {
    const p = await open('autostart=1&skipintro=1&map=village&x=17&y=16&time=10');
    await p.waitForTimeout(800);
    await shot(p, 'village-day');
    const i = await info(p);
    check(i.npcs.length >= 2, `villagers present in plaza (${i.npcs.join(',')})`);
    // talk to the nearest NPC
    await ev(p, `(() => { const sc = GAME.scene; const n = sc.npcs[0]; sc.player.x = n.x; sc.player.y = n.y + 14; sc.player.dir = 'up'; })()`);
    await tap(p, 'KeyZ', 1, 600);
    await shot(p, 'talk');
    const j = await info(p);
    check(j.overlays.includes('DialogBox'), 'talking opens a dialogue');
    await tap(p, 'KeyZ', 4, 300);
    await p.close();

    const q = await open('autostart=1&skipintro=1&map=village&x=17&y=16&time=20.5');
    await q.waitForTimeout(800);
    await shot(q, 'village-night');
    await q.close();
  },

  async shop() {
    const p = await open('autostart=1&skipintro=1&map=store&x=2&y=5&time=10&day=2');
    await p.waitForTimeout(600);
    await ev(p, `GAME.scene.player.dir = 'up'`);
    await tap(p, 'KeyZ', 1, 800);
    for (let n = 0; n < 6; n++) {
      const st = await info(p);
      if (st.overlays.includes('TradeUI')) break;
      await tap(p, 'KeyZ', 1, 400);
    }
    await shot(p, 'shop');
    const i = await info(p);
    check(i.overlays.includes('TradeUI'), 'shop opens from the counter');
    await tap(p, 'KeyZ', 1, 300);
    await tap(p, 'ArrowRight', 2, 150);
    await shot(p, 'shop-qty');
    await tap(p, 'KeyZ', 1, 300);
    const seeds = await ev(p, `GAME.scene.state.seeds.turnip`);
    check(seeds === 4, `bought 3 more turnip seed bags (${seeds})`);
    await p.close();
  },

  async places() {
    for (const [name, q] of [
      ['forest', 'map=forest&x=12&y=10&time=11'],
      ['coop', 'map=coop&x=4&y=5&time=9'],
      ['barn', 'map=barn&x=4&y=6&time=9'],
      ['inn', 'map=inn&x=5&y=7&time=19'],
      ['smithy', 'map=smithy&x=4&y=6&time=12'],
      ['ranch', 'map=ranch&x=4&y=6&time=12'],
      ['house', 'map=house&x=4&y=6&time=21'],
      ['farm-rain', 'weather=rain&time=14'],
      ['farm-winter', 'season=winter&weather=snow&time=13'],
      ['farm-fall', 'season=fall&time=17.6'],
      ['farm-storm-night', 'weather=storm&time=21'],
    ]) {
      const p = await open(`autostart=1&skipintro=1&${q}`);
      if (name === 'coop' || name === 'barn')
        await ev(p, `(() => { const sc = GAME.scene; const kind = '${name}' === 'coop' ? 'chicken' : 'cow'; for (let k=0;k<3;k++) sc.state.animals.push({kind, name:'A'+k, happy:5, age:1}); sc.loadMap('${name}', 4, 5, 'up'); })()`);
      await p.waitForTimeout(900);
      await shot(p, name);
      await p.close();
    }
  },
};

for (const [name, fn] of Object.entries(tests)) {
  if (only && only !== name) continue;
  console.log(`▶ ${name} (${backend})`);
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log(`  ✗ threw: ${(e as Error).message}`);
  }
}

await browser.close();
srv.stop();
if (errors.length) console.log(`PAGE ERRORS:\n${[...new Set(errors)].join('\n')}`);
console.log(failures || errors.length ? `FAILED (${failures} checks, ${errors.length} errors)` : 'ALL PASSED');
process.exit(failures || errors.length ? 1 : 0);
