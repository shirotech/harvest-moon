// Bitmap text and window helpers on top of the Renderer.

const SPECIALS = {
  '♥': 128, '★': 129, '♪': 130, '→': 131, '↓': 132, '↑': 133, '←': 134, '✓': 135, '✕': 136, '●': 137,
};

export const LINE_H = 10;

// Characters without a glyph are mapped to close equivalents.
const NORMALIZE = { '\u2014': '-', '\u2013': '-', '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"',
  '\u00b7': '-', '\u25b6': '\u2192', '\u2026': '...', '\u00e9': 'e' };
const NORM_RE = new RegExp(`[${Object.keys(NORMALIZE).join('')}]`, 'g');
export function norm(s) {
  return s.replace(NORM_RE, (c) => NORMALIZE[c]);
}

export class Text {
  constructor(renderer) {
    this.r = renderer;
    this.widths = new Map();
  }

  code(ch) {
    return SPECIALS[ch] ?? ch.charCodeAt(0);
  }

  glyphW(ch) {
    let w = this.widths.get(ch);
    if (w === undefined) {
      const s = this.r.sprites[`font_${this.code(ch)}`];
      w = s ? s.w : 5;
      this.widths.set(ch, w);
    }
    return w;
  }

  measure(str) {
    str = norm(str);
    let w = 0;
    for (const ch of str) w += this.glyphW(ch) + 1;
    return w > 0 ? w - 1 : 0;
  }

  /**
   * Draw a single line. Colour tags: {r}red{/} {g}gold{/} {b}blue{/} {d}dim{/} {w}light{/}.
   * Returns the x after the last glyph.
   */
  draw(str, x, y, pal = 'font', alpha = 1, maxChars = Infinity) {
    str = norm(str);
    const r = this.r;
    let cx = Math.round(x);
    let curPal = pal;
    let n = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{') {
        const end = str.indexOf('}', i);
        if (end > i) {
          const tag = str.slice(i + 1, end);
          curPal = TAGS[tag] ?? pal;
          i = end;
          continue;
        }
      }
      if (n >= maxChars) break;
      n++;
      const w = this.glyphW(ch);
      if (ch !== ' ') r.spr(`font_${this.code(ch)}`, cx, y, 0, curPal, alpha);
      cx += w + 1;
    }
    return cx;
  }

  /** Centre a line horizontally in [x, x+w). */
  center(str, x, w, y, pal = 'font', alpha = 1) {
    this.draw(str, x + Math.floor((w - this.measure(stripTags(str))) / 2), y, pal, alpha);
  }

  /** Word-wrap into lines no wider than maxW. Honours explicit \n. */
  wrap(str, maxW) {
    str = norm(str);
    const out = [];
    for (const para of str.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const tryLine = line ? `${line} ${word}` : word;
        if (this.measure(stripTags(tryLine)) <= maxW || !line) line = tryLine;
        else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }
}

const TAGS = { r: 'font_red', g: 'font_gold', b: 'font_blue', d: 'font_dim', w: 'font_light', k: 'font', '/': null };

export function stripTags(s) {
  return s.replace(/\{[a-z/]\}/g, '');
}

/** Draw a 9-slice window using sprites `<prefix>_tl` … `<prefix>_br` (8x8 pieces). */
export function drawWindow(r, x, y, w, h, prefix = 'ui_win', alpha = 1) {
  const T = 8;
  x = Math.round(x);
  y = Math.round(y);
  const iw = w - 2 * T;
  const ih = h - 2 * T;
  r.spr(`${prefix}_tl`, x, y, 0, -1, alpha);
  r.spr(`${prefix}_tr`, x + w - T, y, 0, -1, alpha);
  r.spr(`${prefix}_bl`, x, y + h - T, 0, -1, alpha);
  r.spr(`${prefix}_br`, x + w - T, y + h - T, 0, -1, alpha);
  if (iw > 0) {
    tileH(r, `${prefix}_t`, x + T, y, iw, alpha);
    tileH(r, `${prefix}_b`, x + T, y + h - T, iw, alpha);
  }
  if (ih > 0) {
    tileV(r, `${prefix}_l`, x, y + T, ih, alpha);
    tileV(r, `${prefix}_r`, x + w - T, y + T, ih, alpha);
  }
  if (iw > 0 && ih > 0) {
    // centre is a solid fill: stretch a single texel
    r.sprPart(`${prefix}_c`, 0, 0, 1, 1, x + T, y + T, iw, ih, -1, alpha);
  }
}

function tileH(r, name, x, y, w, alpha) {
  for (let o = 0; o < w; o += 8) {
    const pw = Math.min(8, w - o);
    r.sprPart(name, 0, 0, pw, 8, x + o, y, pw, 8, -1, alpha);
  }
}

function tileV(r, name, x, y, h, alpha) {
  for (let o = 0; o < h; o += 8) {
    const ph = Math.min(8, h - o);
    r.sprPart(name, 0, 0, 8, ph, x, y + o, 8, ph, -1, alpha);
  }
}
