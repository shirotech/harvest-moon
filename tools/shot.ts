// Headless screenshot / smoke-test harness for the game.
//   bun tools/shot.ts [--backend=webgpu|webgl2] [--out=shot.png] [--query=k=v&...] [--wait=2000] [--script=path.js]
// --script: JS evaluated in the page after load (can drive window.GAME for tests).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { startServer } from './serve.ts';

export const CHROME_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--use-angle=swiftshader',
  '--disable-gpu-sandbox',
  '--autoplay-policy=no-user-gesture-required',
];

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;

if (import.meta.main) {
  const srv = startServer(0);
  const browser = await chromium.launch({ args: CHROME_ARGS });
  const page = await browser.newPage({ viewport: { width: Number(arg('w', '800')), height: Number(arg('h', '720')) } });
  const errors: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/experimental|GroupMarker/.test(t)) return;
    console.log(`[console.${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = arg('backend', 'webgpu');
  const q = arg('query', '');
  await page.goto(`http://localhost:${srv.port}/?renderer=${backend}&${q}`);
  await page.waitForFunction(() => (window as any).GAME?.ready, null, { timeout: 20000 }).catch(() => {});
  const script = arg('script', '');
  if (script) {
    const code = await Bun.file(script).text();
    const res = await page.evaluate(code);
    if (res !== undefined) console.log('script result:', JSON.stringify(res));
  }
  await page.waitForTimeout(Number(arg('wait', '1500')));
  await page.screenshot({ path: arg('out', 'shot.png') });
  const info = await page.evaluate(() => (window as any).GAME?.debugInfo?.());
  console.log('info:', JSON.stringify(info));
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
  srv.stop();
  process.exit(errors.length ? 1 : 0);
}
