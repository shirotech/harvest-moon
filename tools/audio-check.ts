// Audio system checker for Moonlit Acres.
//
//   bun tools/audio-check.ts [--out=dir] [--only=regex] [--no-wav]
//
// 1. Static checks (in Bun): compiles every song, reports length / tempo / key,
//    notation warnings, channel sync, and how well the notes fit the declared key.
//    Also checks the engine is a harmless no-op without WebAudio.
// 2. Browser checks (headless Chromium via Playwright): renders every track, jingle,
//    sfx and ambient loop with renderOffline() and prints duration, peak, RMS,
//    loop-seam similarity; flags silence, clipping, clicks and exceptions; exercises
//    the live engine (unlock / crossfade / jingle ducking / ambient / volumes).
// 3. Writes a few WAVs so the results can be listened to.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { SONGS } from '../src/audio/songs.js';
import { AudioEngine, compileSong, scaleOf } from '../src/audio/audio.js';

const ROOT = normalize(join(import.meta.dir, '..'));
const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = opt('out', '/tmp/claude-0/-home-user-harvest-moon/6d5899dd-d5c6-5cbf-af20-bec2dd915907/scratchpad/audio');
const ONLY = opt('only', '');
const NO_WAV = args.includes('--no-wav');
const onlyRe = ONLY ? new RegExp(ONLY) : null;

let problems = 0;
const flag = (msg: string) => { problems++; console.log(`  !! ${msg}`); };
const pad = (s: unknown, n: number) => String(s).padEnd(n);
const lpad = (s: unknown, n: number) => String(s).padStart(n);

// ---------------------------------------------------------------------------
// 1. static analysis
console.log('== songs (static) ==');
const KEY_PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Krumhansl–Kessler key profiles
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a: number[], b: number[]) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
};
const staticInfo: Record<string, any> = {};
console.log(`${pad('name', 11)}${lpad('bpm', 4)} ${pad('meter', 5)}${lpad('bars', 5)}${lpad('sec', 7)}  ${pad('key', 10)}${lpad('in-key', 7)}  best-fit`);
for (const [name, def] of Object.entries(SONGS) as [string, any][]) {
  const s = compileSong(name, def);
  const hist = new Array(12).fill(0);
  let total = 0;
  for (const ch of s.channels) {
    if (ch.kind === 'noise') continue;
    for (const e of ch.events) {
      const w = e.d * (e.arp ? 0.5 : 1);
      hist[((e.midi % 12) + 12) % 12] += w;
      total += w;
    }
  }
  const scale = scaleOf(def.key, def.mode);
  const ok = new Set(scale);
  if (def.mode === 'minor') {
    ok.add((KEY_PC[def.key] + 11) % 12); // harmonic-minor leading tone
    ok.add((KEY_PC[def.key] + 9) % 12); // melodic-minor sixth
  }
  const inKey = total ? hist.reduce((a, w, pc) => a + (ok.has(pc) ? w : 0), 0) / total : 1;
  let best = { r: -2, name: '' };
  for (let k = 0; k < 12; k++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - k + 12) % 12]);
    const rMaj = corr(hist, rot(KK_MAJ));
    const rMin = corr(hist, rot(KK_MIN));
    if (rMaj > best.r) best = { r: rMaj, name: `${PC[k]} major` };
    if (rMin > best.r) best = { r: rMin, name: `${PC[k]} minor` };
  }
  const bars = s.beats / s.meter;
  staticInfo[name] = { ...s, inKey, best: best.name };
  console.log(`${pad(name, 11)}${lpad(s.bpm, 4)} ${pad(`${s.meter}/4`, 5)}${lpad(bars.toFixed(bars % 1 ? 2 : 0), 5)}${lpad(s.length.toFixed(1), 7)}  ${pad(`${def.key} ${def.mode}`, 10)}${lpad((inKey * 100).toFixed(1) + '%', 7)}  ${best.name} (r=${best.r.toFixed(2)})`);
  for (const w of s.warnings) flag(`${name}: ${w}`);
  if (s.channels.length !== 4) flag(`${name}: has ${s.channels.length} channels, expected 4`);
  for (const ch of s.channels) if (!ch.events.length) flag(`${name}.${ch.id}: empty channel`);
  if (s.loop && (s.length < 30 || s.length > 75)) flag(`${name}: loop length ${s.length.toFixed(1)}s outside 30–75s`);
  if (!s.loop && (s.length < 1.5 || s.length > 6)) flag(`${name}: jingle length ${s.length.toFixed(1)}s outside 2–6s`);
  if (!def.chromatic && inKey < 0.9) flag(`${name}: only ${(inKey * 100).toFixed(1)}% of note time is in ${def.key} ${def.mode}`);
}

console.log('\n== engine without WebAudio (Bun) ==');
try {
  const e = new AudioEngine();
  e.playMusic('spring');
  e.sfx('coin', { pitch: 2, volume: 0.5 });
  e.setAmbient('rain');
  e.musicVolume = 0.3;
  e.sfxVolume = 2;
  await e.unlock();
  await e.playJingle('j_goal');
  e.stopMusic();
  e.setAmbient(null);
  const r = await e.renderOffline('spring', 1);
  console.log(`  ok: no throw, unlock resolves, renderOffline → ${r}, sfxVolume clamped to ${e.sfxVolume}, tracks=${e.trackNames.length} sfx=${e.sfxNames.length}`);
} catch (err) {
  flag(`engine threw without WebAudio: ${err}`);
}

// ---------------------------------------------------------------------------
// 2. browser rendering
const MIME: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const PAGE = `<!doctype html><meta charset="utf-8"><title>audio check</title>
<script>
  window.__ctxCount = 0;
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__ctxCount++; } };
</script>
<script type="module">
  import { AudioEngine } from '/src/audio/audio.js';
  window.AudioEngine = AudioEngine;
  window.__ready = true;
</script>`;

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/__audio_check.html') return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
    const p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) return new Response('not found', { status: 404 });
    return new Response(readFileSync(p), { headers: { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' } });
  },
});

const WAVS: Record<string, number> = { spring: 20, title: 15, festival: 12, winter: 12, night: 10, j_goal: 0, j_morning: 0, rooster: 0, harvest: 0, coin: 0, moo: 0, thunder: 0, buy: 0, rain: 8, crickets: 8, stream: 8 };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on('pageerror', (e: Error) => pageErrors.push(String(e)));
page.on('console', (m: any) => { if (m.type() === 'error' || m.type() === 'warning') pageErrors.push(`${m.type()}: ${m.text()}`); });
await page.goto(`http://localhost:${server.port}/__audio_check.html`);
await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 15000 });

const lists = await page.evaluate(() => {
  const e = new (window as any).AudioEngine();
  return { tracks: e.trackNames, jingles: e.jingleNames, sfx: e.sfxNames, amb: e.ambientNames, ctxCount: (window as any).__ctxCount };
});
if (lists.ctxCount !== 0) flag(`constructing AudioEngine created ${lists.ctxCount} AudioContext(s) before unlock()`);

type Item = { kind: string; name: string; secs: number };
const items: Item[] = [];
for (const n of lists.tracks) items.push({ kind: lists.jingles.includes(n) ? 'jingle' : 'music', name: n, secs: 0 });
for (const n of lists.sfx) items.push({ kind: 'sfx', name: n, secs: 0 });
for (const n of lists.amb) items.push({ kind: 'amb', name: n, secs: 12 });

if (!NO_WAV) mkdirSync(OUT, { recursive: true });
const results: any[] = [];
console.log('\n== offline renders (Chromium) ==');
console.log(`${pad('kind', 7)}${pad('name', 12)}${lpad('dur', 7)}${lpad('peak', 7)}${lpad('rms dB', 8)}${lpad('loud dB', 8)}${lpad('jump', 6)}${lpad('seam', 6)}${lpad('ms', 6)}  flags`);
for (const it of items) {
  if (onlyRe && !onlyRe.test(it.name)) continue;
  const info = staticInfo[it.name];
  // loops: render one full pass plus 3 s to compare the loop seam
  const secs = it.kind === 'music' ? info.length + 3 : it.secs;
  const wavSecs = !NO_WAV && it.name in WAVS ? WAVS[it.name] : -1;
  const r = await page.evaluate(async ({ name, kind, secs, wavSecs, loopLen }) => {
    const E = new (window as any).AudioEngine();
    const t0 = performance.now();
    let buf: AudioBuffer;
    try {
      buf = await E.renderOffline((kind === 'amb' ? 'amb:' : kind === 'sfx' ? 'sfx:' : 'music:') + name, secs || undefined);
    } catch (err) {
      return { error: String(err && (err as any).stack || err) };
    }
    const ms = performance.now() - t0;
    const chs = [0, 1].map((i) => buf.getChannelData(Math.min(i, buf.numberOfChannels - 1)));
    const end = loopLen ? Math.min(buf.length, Math.round(loopLen * buf.sampleRate)) : buf.length;
    // clicks: a sample that leaps out of near-silence, or signal that drops straight to silence
    let peak = 0, sum = 0, jump = 0, clip = 0;
    const Q = 24;
    for (const d of chs) {
      let quietRun = Q;
      for (let i = 1; i < end; i++) {
        const v = d[i];
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        if (a > 0.985) clip++;
        sum += v * v;
        const pa = Math.abs(d[i - 1]);
        if (quietRun >= Q && a > 0.03) jump = Math.max(jump, a); // hard onset
        if (pa > 0.03 && a < 0.002) {
          let silent = true;
          for (let k = i; k < Math.min(end, i + Q); k++) if (Math.abs(d[k]) > 0.002) { silent = false; break; }
          if (silent) jump = Math.max(jump, pa); // hard stop
        }
        quietRun = a < 0.001 ? quietRun + 1 : 0;
      }
    }
    const rms = Math.sqrt(sum / (end * 2));
    // "loudness": RMS over the loudest 20% of 50 ms windows (ignores silences)
    const win = Math.round(buf.sampleRate * 0.05);
    const wins: number[] = [];
    for (let s = 0; s + win <= end; s += win) {
      let w = 0;
      for (const d of chs) for (let i = s; i < s + win; i++) w += d[i] * d[i];
      wins.push(Math.sqrt(w / (win * 2)));
    }
    wins.sort((a, b) => b - a);
    const top = wins.slice(0, Math.max(1, Math.ceil(wins.length * 0.2)));
    const loud = top.reduce((a, b) => a + b, 0) / top.length;
    let tail = 0;
    for (const d of chs) for (let i = Math.max(0, buf.length - Math.round(buf.sampleRate * 0.01)); i < buf.length; i++) tail = Math.max(tail, Math.abs(d[i]));
    // loop seam: the 10 ms loudness envelope just after the loop point should match the
    // same span of the first pass (phase-independent, so noise and oscillator phase don't matter)
    let seam = null as null | number;
    if (loopLen && buf.length > (loopLen + 2.6) * buf.sampleRate) {
      const w = Math.round(0.01 * buf.sampleRate);
      const env = (s0: number) => {
        const out: number[] = [];
        for (let k = 0; k < 250; k++) {
          let e = 0;
          for (const d of chs) for (let i = s0 + k * w; i < s0 + (k + 1) * w; i++) e += d[i] * d[i];
          out.push(Math.sqrt(e));
        }
        return out;
      };
      const A = env(Math.round(0.05 * buf.sampleRate)), B = env(Math.round((loopLen + 0.05) * buf.sampleRate));
      const ma = A.reduce((x, y) => x + y) / A.length, mb = B.reduce((x, y) => x + y) / B.length;
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i < A.length; i++) { ab += (A[i] - ma) * (B[i] - mb); aa += (A[i] - ma) ** 2; bb += (B[i] - mb) ** 2; }
      seam = ab / Math.sqrt(aa * bb || 1);
    }
    let wav = null as null | string;
    if (wavSecs >= 0) {
      const len = wavSecs > 0 ? Math.min(buf.length, Math.round(wavSecs * buf.sampleRate)) : buf.length;
      const bytes = new Uint8Array(44 + len * 4);
      const dv = new DataView(bytes.buffer);
      const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
      str(0, 'RIFF'); dv.setUint32(4, 36 + len * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 4, true);
      dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, len * 4, true);
      for (let i = 0; i < len; i++) for (let c = 0; c < 2; c++) dv.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, chs[c][i])) * 32767, true);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      wav = btoa(bin);
    }
    return { dur: buf.duration, peak, rms, loud, jump, clip, tail, seam, ms, wav };
  }, { name: it.name, kind: it.kind, secs, wavSecs, loopLen: it.kind === 'music' ? info.length : 0 });

  const flags: string[] = [];
  if (r.error) {
    flag(`${it.name}: exception ${r.error}`);
    continue;
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  if (r.peak < 0.01 || db(r.rms) < -60) flags.push('SILENT');
  if (r.clip > 0 || r.peak > 0.97) flags.push(`CLIP(${r.clip})`);
  if (r.jump > 0.1) flags.push(`CLICK?(${r.jump.toFixed(2)})`);
  if ((it.kind === 'sfx' || it.kind === 'jingle') && r.tail > 0.02) flags.push(`TAIL(${r.tail.toFixed(3)})`);
  if (r.seam != null && r.seam < 0.85) flags.push(`SEAM(${r.seam.toFixed(2)})`);
  if (it.kind === 'jingle' && (r.dur < 2 || r.dur > 6.2)) flags.push(`LEN(${r.dur.toFixed(2)})`);
  for (const f of flags) flag(`${it.name}: ${f}`);
  if (r.wav) {
    const file = join(OUT, `${it.name}.wav`);
    writeFileSync(file, Buffer.from(r.wav, 'base64'));
  }
  results.push({ ...it, ...r, wav: undefined });
  console.log(
    `${pad(it.kind, 7)}${pad(it.name, 12)}${lpad(r.dur.toFixed(2), 7)}${lpad(r.peak.toFixed(3), 7)}${lpad(db(r.rms).toFixed(1), 8)}${lpad(db(r.loud).toFixed(1), 8)}${lpad(r.jump.toFixed(2), 6)}${lpad(r.seam == null ? '-' : r.seam.toFixed(2), 6)}${lpad(Math.round(r.ms), 6)}  ${flags.join(' ') || 'ok'}`,
  );
}

// mix sanity: SFX should sit above the music
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const mus = results.filter((r) => r.kind === 'music');
const sfx = results.filter((r) => r.kind === 'sfx' && !['text', 'step', 'cursor'].includes(r.name));
if (mus.length && sfx.length) {
  const m = 20 * Math.log10(avg(mus.map((r) => r.loud)));
  const s = 20 * Math.log10(avg(sfx.map((r) => r.loud)));
  console.log(`\nmix: music loud avg ${m.toFixed(1)} dB, sfx loud avg ${s.toFixed(1)} dB → sfx sit ${(s - m).toFixed(1)} dB above music`);
  if (s - m < 1) flag('sfx are not louder than music');
}

// ---------------------------------------------------------------------------
// live engine smoke test
console.log('\n== live engine (real-time AudioContext) ==');
const live = await page.evaluate(async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const W = window as any;
  const log: string[] = [];
  const e = new W.AudioEngine();
  e.playMusic('title');
  e.sfx('coin');
  e.setAmbient('rain');
  const before = W.__ctxCount;
  await e.unlock();
  await e.unlock();
  const after = W.__ctxCount;
  const an = e.ctx.createAnalyser();
  an.fftSize = 2048;
  e._g.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const level = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
  await sleep(900);
  const titleLevel = level();
  const t0 = e.ctx.currentTime;
  e.playMusic('spring');
  e.playMusic('spring'); // no-op
  await sleep(700);
  const springLevel = level();
  const playing = e._music && e._music.song.name;
  for (const n of e.sfxNames) { e.sfx(n, { pitch: 1, volume: 0.4 }); await sleep(15); }
  const j0 = performance.now();
  await e.playJingle('j_fanfare');
  const jingleMs = performance.now() - j0;
  const resumed = e._music && e._music.song.name;
  const resumedPos = e._music ? e._music.position(e.ctx.currentTime) : null;
  e.setAmbient('storm');
  await sleep(300);
  e.setAmbient('crickets');
  e.musicVolume = 0.4;
  e.sfxVolume = 0.6;
  await sleep(300);
  const p1 = e.playJingle('j_ship');
  await sleep(200);
  const p2 = e.playJingle('j_sleep'); // interrupts j_ship
  e.playMusic('night'); // queued behind the jingle
  await Promise.all([p1, p2]);
  const afterJ = e._music && e._music.song.name;
  e.stopMusic(0.2);
  e.setAmbient(null);
  await sleep(1600);
  const quiet = level();
  const elapsed = e.ctx.currentTime - t0;
  return { before, after, state: e.ctx.state, titleLevel, springLevel, playing, jingleMs, resumed, resumedPos, afterJ, quiet, elapsed, fading: e._fading.length, log };
});
console.log(`  AudioContexts before unlock: ${live.before}, after 2× unlock: ${live.after}; state=${live.state}`);
console.log(`  title level ${live.titleLevel.toFixed(3)}, spring level ${live.springLevel.toFixed(3)} (now playing: ${live.playing})`);
console.log(`  j_fanfare resolved after ${Math.round(live.jingleMs)} ms; music resumed: ${live.resumed} @ ${live.resumedPos?.toFixed(2)}s`);
console.log(`  jingle interrupt + queued playMusic → ${live.afterJ}; after stop level ${live.quiet.toFixed(4)}; lingering fades ${live.fading}`);
if (live.before !== 0) flag('AudioContext created before unlock()');
if (live.after !== 1) flag(`expected exactly one AudioContext, got ${live.after}`);
if (live.state !== 'running') flag(`context state ${live.state}`);
if (!(live.titleLevel > 0.002)) flag('no live output while title plays');
if (live.playing !== 'spring' || live.resumed !== 'spring') flag('music did not switch/resume correctly');
if (live.afterJ !== 'night') flag('queued playMusic did not start after jingle');
if (live.quiet > 0.003) flag('audio still playing after stopMusic/setAmbient(null)');

const relevant = pageErrors.filter((e) => !/favicon/.test(e));
if (relevant.length) {
  console.log('\n== page errors / warnings ==');
  for (const e of relevant) flag(e);
}

await browser.close();
server.stop(true);

console.log(`\n${results.length} renders; ${problems ? `${problems} problem(s)` : 'no problems'}${NO_WAV ? '' : `; WAVs in ${OUT}`}`);
process.exit(problems ? 1 : 0);
