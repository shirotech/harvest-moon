// Unified input: keyboard, gamepad and on-screen touch buttons map onto a
// Game Boy-style button set (+ two shoulder buttons for tool cycling).

export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select', 'l', 'r'];

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', KeyJ: 'a', Space: 'a',
  KeyX: 'b', KeyK: 'b', Backspace: 'b',
  Enter: 'start', Escape: 'start', KeyP: 'start',
  ShiftLeft: 'select', ShiftRight: 'select', KeyC: 'select', Tab: 'select',
  KeyQ: 'l', KeyE: 'r',
};

export class Input {
  constructor() {
    this.state = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    this.prev = { ...this.state };
    this.held = Object.fromEntries(BUTTONS.map((b) => [b, 0]));
    this.sources = { key: new Set(), touch: new Set(), pad: new Set() };
    this.lastDevice = 'keyboard';
    this.typed = []; // printable characters typed this frame (name entry)
    this.anyPressed = false;
    this._onGesture = [];
  }

  attach(target = window) {
    target.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const b = KEYMAP[e.code];
      if (e.key.length === 1) this.typed.push(e.key);
      else if (e.key === 'Backspace') this.typed.push('\b');
      else if (e.key === 'Enter') this.typed.push('\n');
      if (b) {
        this.sources.key.add(b);
        e.preventDefault();
      }
      this.lastDevice = 'keyboard';
      this._gesture();
    });
    target.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (b) this.sources.key.delete(b);
    });
    target.addEventListener('blur', () => {
      this.sources.key.clear();
      this.sources.touch.clear();
    });
    target.addEventListener('pointerdown', () => this._gesture(), { passive: true });
  }

  /** Register a callback for the first user gesture (audio unlock). */
  onGesture(fn) {
    this._onGesture.push(fn);
  }

  _gesture() {
    const fns = this._onGesture;
    this._onGesture = [];
    fns.forEach((f) => f());
  }

  /** Wire DOM buttons carrying data-btn="a" etc. */
  attachTouch(root) {
    const active = new Map(); // pointerId -> button element
    const btnAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest?.('[data-btn]') ?? null;
    };
    const update = () => {
      this.sources.touch.clear();
      for (const el of active.values()) {
        if (!el) continue;
        for (const b of el.dataset.btn.split(' ')) this.sources.touch.add(b);
      }
      root.querySelectorAll('[data-btn]').forEach((el) => {
        el.classList.toggle('down', [...active.values()].includes(el));
      });
    };
    root.addEventListener('pointerdown', (e) => {
      const el = btnAt(e.clientX, e.clientY);
      if (!el) return;
      e.preventDefault();
      root.setPointerCapture?.(e.pointerId);
      active.set(e.pointerId, el);
      this.lastDevice = 'touch';
      this._gesture();
      navigator.vibrate?.(8);
      update();
    });
    root.addEventListener('pointermove', (e) => {
      if (!active.has(e.pointerId)) return;
      const el = btnAt(e.clientX, e.clientY);
      if (el !== active.get(e.pointerId)) {
        active.set(e.pointerId, el);
        update();
      }
    });
    const end = (e) => {
      if (!active.has(e.pointerId)) return;
      active.delete(e.pointerId);
      update();
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pollPads() {
    this.sources.pad.clear();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const btn = (i) => p.buttons[i]?.pressed;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      const add = (b) => this.sources.pad.add(b);
      if (btn(12) || ay < -0.5) add('up');
      if (btn(13) || ay > 0.5) add('down');
      if (btn(14) || ax < -0.5) add('left');
      if (btn(15) || ax > 0.5) add('right');
      if (btn(0)) add('a');
      if (btn(1) || btn(2)) add('b');
      if (btn(9)) add('start');
      if (btn(8) || btn(3)) add('select');
      if (btn(4)) add('l');
      if (btn(5)) add('r');
      if (this.sources.pad.size) {
        this.lastDevice = 'gamepad';
        this._gesture();
      }
    }
  }

  /** Call once per fixed update step. */
  update() {
    this._pollPads();
    this.prev = { ...this.state };
    this.anyPressed = false;
    for (const b of BUTTONS) {
      const d = this.sources.key.has(b) || this.sources.touch.has(b) || this.sources.pad.has(b);
      this.state[b] = d;
      this.held[b] = d ? this.held[b] + 1 : 0;
      if (d && !this.prev[b]) this.anyPressed = true;
    }
  }

  /** Clear per-frame typed buffer (call after the scene consumed it). */
  endFrame() {
    this.typed.length = 0;
  }

  down(b) {
    return this.state[b];
  }
  pressed(b) {
    return this.state[b] && !this.prev[b];
  }
  released(b) {
    return !this.state[b] && this.prev[b];
  }
  /** Pressed, or held long enough to auto-repeat (menus). */
  repeat(b, delay = 18, rate = 5) {
    const h = this.held[b];
    return h === 1 || (h > delay && (h - delay) % rate === 0);
  }
  /** Swallow current presses so they don't leak into the next UI element. */
  consume() {
    for (const b of BUTTONS) this.prev[b] = this.state[b];
  }
  dir() {
    let x = 0, y = 0;
    if (this.state.left) x -= 1;
    if (this.state.right) x += 1;
    if (this.state.up) y -= 1;
    if (this.state.down) y += 1;
    return { x, y };
  }
}
