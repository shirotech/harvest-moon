// WebGL2 fallback backend. Mirrors the WebGPU pipeline: integer atlas texture,
// palette texture, three low-res render targets and a composite pass.

const SW = 160;
const SH = 144;
const STRIDE = 64;

const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aRect;
layout(location=1) in vec4 aUvPal;
layout(location=2) in vec4 aColor;
layout(location=3) in vec4 aSrc;
uniform vec2 uScreen;
out vec2 vLocal;
flat out vec4 vUvPal;
flat out vec4 vColor;
flat out vec2 vSrc;
const vec2 C[6] = vec2[6](vec2(0,0), vec2(1,0), vec2(0,1), vec2(0,1), vec2(1,0), vec2(1,1));
void main() {
  vec2 c = C[gl_VertexID];
  vec2 p = aRect.xy + c * aRect.zw;
  gl_Position = vec4(p.x / uScreen.x * 2.0 - 1.0, 1.0 - p.y / uScreen.y * 2.0, 0.0, 1.0);
  vLocal = c;
  vUvPal = aUvPal;
  vColor = aColor;
  vSrc = aSrc.xy;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D uAtlas;
uniform sampler2D uPals;
in vec2 vLocal;
flat in vec4 vUvPal;
flat in vec4 vColor;
flat in vec2 vSrc;
out vec4 outColor;
void main() {
  int flags = int(vUvPal.w + 0.5);
  if ((flags & 4) != 0) { outColor = vec4(vColor.rgb * vColor.a, vColor.a); return; }
  if ((flags & 8) != 0) {
    float d = length(vLocal * 2.0 - 1.0);
    float f = clamp(1.0 - d, 0.0, 1.0);
    float k = f * f * (3.0 - 2.0 * f);
    outColor = vec4(vColor.rgb * (k * vColor.a), 0.0);
    return;
  }
  vec2 l = vLocal * vSrc;
  if ((flags & 1) != 0) l.x = vSrc.x - l.x;
  if ((flags & 2) != 0) l.y = vSrc.y - l.y;
  ivec2 t = clamp(ivec2(floor(l)), ivec2(0), ivec2(vSrc) - ivec2(1));
  uint idx = texelFetch(uAtlas, ivec2(vUvPal.xy + 0.5) + t, 0).r;
  if (idx == 0u) discard;
  vec4 c = texelFetch(uPals, ivec2(int(idx) - 1, int(vUvPal.z + 0.5)), 0);
  float a = c.a * vColor.a;
  outColor = vec4(c.rgb * vColor.rgb * a, a);
}`;

const COMP_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = p * 0.5 + 0.5;
}`;

const COMP_FS = `#version 300 es
precision highp float;
uniform sampler2D uWorld;
uniform sampler2D uLight;
uniform sampler2D uUI;
uniform vec2 uSrc;
uniform vec2 uOut;
uniform float uLcd;
uniform float uMode;
in vec2 vUv;
out vec4 outColor;
vec2 sharp(vec2 uv) {
  vec2 texel = uv * uSrc;
  vec2 scale = max(floor(uOut / uSrc), vec2(1.0));
  vec2 fl = floor(texel);
  vec2 s = fract(texel) - 0.5;
  vec2 region = 0.5 - 0.5 / scale;
  vec2 f = (s - clamp(s, -region, region)) * scale + 0.5;
  return (fl + f) / uSrc;
}
void main() {
  vec2 suv = sharp(vUv);
  vec4 w = texture(uWorld, suv);
  vec4 l = texture(uLight, vUv);
  vec4 u = texture(uUI, suv);
  vec3 col = w.rgb * l.rgb;
  col = col * (1.0 - u.a) + u.rgb;
  if (uMode > 1.5) {
    vec3 lin = pow(col, vec3(2.2));
    vec3 m = vec3(dot(lin, vec3(0.82, 0.125, 0.055)), dot(lin, vec3(0.0, 0.75, 0.25)), dot(lin, vec3(0.19, 0.125, 0.685)));
    col = pow(m, vec3(1.0 / 2.0));
  } else if (uMode > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.78);
    col = col * vec3(0.94, 0.97, 0.86) + vec3(0.05, 0.06, 0.04);
  }
  if (uLcd > 0.0) {
    float ppt = uOut.x / uSrc.x;
    if (ppt >= 3.0) {
      vec2 px = fract(vUv * uSrc);
      float e = min(min(px.x, 1.0 - px.x), min(px.y, 1.0 - px.y)) * ppt;
      float g = smoothstep(0.0, 1.0, e);
      col *= mix(1.0 - 0.35 * uLcd, 1.0, g);
    }
  }
  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export class WebGL2Backend {
  static create(canvas, atlas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL2 not supported');
    return new WebGL2Backend(canvas, gl, atlas);
  }

  constructor(canvas, gl, atlas) {
    this.name = 'WebGL2';
    this.canvas = canvas;
    this.gl = gl;

    this.spriteProg = program(gl, SPRITE_VS, SPRITE_FS);
    this.compProg = program(gl, COMP_VS, COMP_FS);
    this.u = {
      screen: gl.getUniformLocation(this.spriteProg, 'uScreen'),
      atlas: gl.getUniformLocation(this.spriteProg, 'uAtlas'),
      pals: gl.getUniformLocation(this.spriteProg, 'uPals'),
      world: gl.getUniformLocation(this.compProg, 'uWorld'),
      light: gl.getUniformLocation(this.compProg, 'uLight'),
      ui: gl.getUniformLocation(this.compProg, 'uUI'),
      src: gl.getUniformLocation(this.compProg, 'uSrc'),
      out: gl.getUniformLocation(this.compProg, 'uOut'),
      lcd: gl.getUniformLocation(this.compProg, 'uLcd'),
      mode: gl.getUniformLocation(this.compProg, 'uMode'),
    };

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, atlas.width, atlas.height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, atlas.pixels);
    this._nearest();

    this.palTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 8, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this._nearest();
    this.uploadPalettes(atlas.palRows);

    const rt = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SW, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb };
    };
    this.worldRT = rt();
    this.lightRT = rt();
    this.uiRT = rt();

    this.vao = gl.createVertexArray();
    this.instBuf = gl.createBuffer();
    this.instCap = 0;
    this.staging = new Float32Array(0);
    this.emptyVao = gl.createVertexArray();
  }

  _nearest() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  uploadPalettes(rows) {
    const gl = this.gl;
    const data = new Uint8Array(8 * 1024 * 4);
    data.set(rows.subarray(0, Math.min(rows.length, data.length)));
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 8, 1024, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  _ensure(count) {
    const gl = this.gl;
    if (count <= this.instCap) return;
    let cap = Math.max(1024, this.instCap);
    while (cap < count) cap *= 2;
    this.instCap = cap;
    this.staging = new Float32Array(cap * 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cap * STRIDE, gl.DYNAMIC_DRAW);
  }

  _bindInstances(first) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE, first * STRIDE + i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
  }

  render({ world, lights, ui, ambient, post, frame }) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    if (frame) {
      // GL framebuffer textures are bottom-up: flip rows while uploading.
      const flipped = this.flipBuf ?? (this.flipBuf = new Uint8Array(SW * SH * 4));
      for (let y = 0; y < SH; y++) flipped.set(frame.subarray(y * SW * 4, (y + 1) * SW * 4), (SH - 1 - y) * SW * 4);
      gl.bindTexture(gl.TEXTURE_2D, this.worldRT.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SW, SH, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
    }
    const total = world.n + lights.n + ui.n;
    this._ensure(Math.max(total, 1));
    const s = this.staging;
    s.set(world.f.subarray(0, world.n * 16), 0);
    s.set(lights.f.subarray(0, lights.n * 16), world.n * 16);
    s.set(ui.f.subarray(0, ui.n * 16), (world.n + lights.n) * 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    if (total) gl.bufferSubData(gl.ARRAY_BUFFER, 0, s, 0, total * 16);

    gl.useProgram(this.spriteProg);
    gl.uniform2f(this.u.screen, SW, SH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(this.u.atlas, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(this.u.pals, 1);
    gl.viewport(0, 0, SW, SH);
    gl.enable(gl.BLEND);

    const pass = (rt, clear, additive, first, count) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      if (additive) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this._bindInstances(first);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    };
    if (!frame) pass(this.worldRT, [0, 0, 0, 1], false, 0, world.n);
    pass(this.lightRT, [ambient[0], ambient[1], ambient[2], 1], true, world.n, lights.n);
    pass(this.uiRT, [0, 0, 0, 0], false, world.n + lights.n, ui.n);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.compProg);
    const bindRT = (unit, rt, loc) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, rt.tex);
      gl.uniform1i(loc, unit);
    };
    bindRT(0, this.worldRT, this.u.world);
    bindRT(1, this.lightRT, this.u.light);
    bindRT(2, this.uiRT, this.u.ui);
    gl.uniform2f(this.u.src, SW, SH);
    gl.uniform2f(this.u.out, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.lcd, post.lcd);
    gl.uniform1f(this.u.mode, post.colorMode);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
