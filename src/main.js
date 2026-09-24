// Bootstrap: build the sprite atlas, pick a GPU backend, wire input/audio, start.
import { AtlasBuilder } from './engine/atlas.js';
import { Renderer, SCREEN_W, SCREEN_H } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { registerAll } from './art/index.js';
import { Game } from './game/game.js';
import { TitleScene } from './game/title.js';

const boot = document.getElementById('boot');
const params = new URLSearchParams(location.search);

function fail(msg) {
  boot.classList.remove('hidden');
  boot.innerHTML = `<div><p>Moonlit Acres could not start.</p><p class="err"></p>
    <p>This game needs a browser with WebGPU or WebGL2 support.</p></div>`;
  boot.querySelector('.err').textContent = msg;
}

async function main() {
  const t0 = performance.now();
  const atlas = registerAll(new AtlasBuilder()).build(1024);
  const t1 = performance.now();

  let canvas = document.getElementById('screen');
  const freshCanvas = () => {
    const c = canvas.cloneNode(false);
    canvas.replaceWith(c);
    canvas = c;
    return c;
  };
  const want = params.get('renderer');
  const renderer = await Renderer.create(canvas, atlas, {
    backend: want === 'webgl2' || want === 'webgl' ? 'webgl2' : undefined,
    fallbackCanvas: freshCanvas,
  });
  canvas = document.getElementById('screen');

  const input = new Input();
  input.attach(window);
  const pad = document.getElementById('pad');
  input.attachTouch(pad);
  const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
  if (isTouch) document.body.classList.add('touch');
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  let audio = null;
  try {
    const mod = await import('./audio/audio.js');
    audio = new mod.AudioEngine();
  } catch (e) {
    console.warn('audio unavailable', e);
  }
  input.onGesture(() => audio?.unlock?.().catch?.(() => {}));

  const game = new Game({ renderer, input, audio, canvas });
  window.GAME = game;

  const resize = () => {
    const c = document.getElementById('screen');
    const padH = document.body.classList.contains('touch') ? pad.getBoundingClientRect().height : 0;
    const availW = window.innerWidth - 16;
    const availH = window.innerHeight - padH - 16;
    const fit = Math.min(availW / SCREEN_W, availH / SCREEN_H);
    // Integer scaling on desktops; touch screens fill the width (the composite
    // shader's sharp-bilinear filter keeps pixels crisp at fractional scales).
    const touch = document.body.classList.contains('touch');
    const scale = !touch && fit >= 2 ? Math.floor(fit) : Math.max(1, fit);
    const cssW = Math.floor(SCREEN_W * scale);
    const cssH = Math.floor(SCREEN_H * scale);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    renderer.resize(Math.round(cssW * dpr), Math.round(cssH * dpr));
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(document.body);
  resize();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat) {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });

  boot.classList.add('hidden');
  console.info(
    `Moonlit Acres: ${renderer.name} renderer, atlas ${atlas.width}x${atlas.height} ` +
      `(${Object.keys(atlas.sprites).length} sprites, built in ${(t1 - t0).toFixed(0)}ms)`,
  );
  game.setScene(new TitleScene(game));
  game.start();
}

main().catch((e) => {
  console.error(e);
  fail(String(e?.stack ?? e));
});
