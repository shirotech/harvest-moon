// Top-level game object: fixed-timestep loop, scene switching, settings, audio.
import { Text } from '../engine/text.js';

const STEP = 1000 / 60;
const SETTINGS_KEY = 'moonlit-acres-settings';

export class Game {
  constructor({ renderer, input, audio, canvas }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.canvas = canvas;
    this.text = new Text(renderer);
    this.scene = null;
    this.frame = 0;
    this.acc = 0;
    this.last = 0;
    this.ready = false;
    this.paused = false;
    this.fastForward = 1;
    this.settings = {
      music: 0.7,
      sfx: 0.8,
      lcd: 0.6,
      colorMode: 0,
      hud: true,
      ...loadSettings(),
    };
    this.applySettings();
  }

  applySettings() {
    this.renderer.post.lcd = this.settings.lcd;
    this.renderer.post.colorMode = this.settings.colorMode;
    try {
      if (this.audio) {
        this.audio.musicVolume = this.settings.music;
        this.audio.sfxVolume = this.settings.sfx;
      }
    } catch (e) {
      console.warn(e);
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable */
    }
  }

  // --- audio helpers (never throw) ---
  sfx(name, opts) {
    try {
      this.audio?.sfx(name, opts);
    } catch (e) {
      console.warn('sfx', name, e);
    }
  }
  music(name) {
    try {
      if (!name) this.audio?.stopMusic(0.6);
      else this.audio?.playMusic(name);
    } catch (e) {
      console.warn('music', name, e);
    }
  }
  jingle(name) {
    try {
      return this.audio?.playJingle(name) ?? Promise.resolve();
    } catch (e) {
      console.warn('jingle', name, e);
      return Promise.resolve();
    }
  }
  ambient(name) {
    try {
      this.audio?.setAmbient(name);
    } catch (e) {
      console.warn('ambient', name, e);
    }
  }

  setScene(scene) {
    this.scene?.exit?.();
    this.scene = scene;
    scene.enter?.();
  }

  start() {
    this.ready = true;
    this.last = performance.now();
    const loop = (t) => {
      requestAnimationFrame(loop);
      let dt = t - this.last;
      this.last = t;
      if (dt > 250) dt = 250; // tab was hidden
      if (this.paused) return;
      this.acc += dt * this.fastForward;
      let steps = 0;
      while (this.acc >= STEP && steps < 8 * this.fastForward) {
        this.tick();
        this.acc -= STEP;
        steps++;
      }
      if (steps >= 8 * this.fastForward) this.acc = 0;
      this.render();
    };
    requestAnimationFrame(loop);
  }

  tick() {
    this.input.update();
    this.scene?.update(this.input);
    this.input.endFrame();
    this.frame++;
  }

  render() {
    const r = this.renderer;
    r.begin();
    r.post.time = this.frame / 60;
    this.scene?.render(r);
    r.end();
  }

  debugInfo() {
    return {
      backend: this.renderer.name,
      frame: this.frame,
      scene: this.scene?.constructor?.name,
      stats: this.renderer.stats,
      ...(this.scene?.debugInfo?.() ?? {}),
    };
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
