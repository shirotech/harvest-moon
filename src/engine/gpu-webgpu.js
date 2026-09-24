// WebGPU backend: instanced indexed-colour sprites + lighting + composite.

const SW = 160;
const SH = 144;
const STRIDE = 64; // 16 floats per instance

const SPRITE_WGSL = /* wgsl */ `
struct Globals { screen: vec2f, pad: vec2f };
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var atlas: texture_2d<u32>;
@group(0) @binding(2) var pals: texture_2d<f32>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) uvpal: vec4f,
  @location(2) @interpolate(flat) color: vec4f,
  @location(3) @interpolate(flat) src: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) rect: vec4f,
      @location(1) uvpal: vec4f,
      @location(2) color: vec4f,
      @location(3) src: vec4f) -> VSOut {
  var corners = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
                                vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let p = rect.xy + c * rect.zw;
  var o: VSOut;
  o.pos = vec4f(p.x / G.screen.x * 2.0 - 1.0, 1.0 - p.y / G.screen.y * 2.0, 0.0, 1.0);
  o.local = c;
  o.uvpal = uvpal;
  o.color = color;
  o.src = src.xy;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  let flags = u32(i.uvpal.w + 0.5);
  if ((flags & 4u) != 0u) {
    return vec4f(i.color.rgb * i.color.a, i.color.a);
  }
  if ((flags & 8u) != 0u) {
    let d = length(i.local * 2.0 - 1.0);
    let f = clamp(1.0 - d, 0.0, 1.0);
    let k = f * f * (3.0 - 2.0 * f);
    return vec4f(i.color.rgb * (k * i.color.a), 0.0);
  }
  var l = i.local * i.src;
  if ((flags & 1u) != 0u) { l.x = i.src.x - l.x; }
  if ((flags & 2u) != 0u) { l.y = i.src.y - l.y; }
  let t = clamp(vec2i(floor(l)), vec2i(0, 0), vec2i(i.src) - vec2i(1, 1));
  let idx = textureLoad(atlas, vec2i(i.uvpal.xy + 0.5) + t, 0).r;
  if (idx == 0u) { discard; }
  let c = textureLoad(pals, vec2i(i32(idx) - 1, i32(i.uvpal.z + 0.5)), 0);
  let a = c.a * i.color.a;
  return vec4f(c.rgb * i.color.rgb * a, a);
}
`;

const COMPOSITE_WGSL = /* wgsl */ `
struct Post { src: vec2f, out: vec2f, lcd: f32, mode: f32, time: f32, pad: f32 };
@group(0) @binding(0) var<uniform> P: Post;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var worldT: texture_2d<f32>;
@group(0) @binding(3) var lightT: texture_2d<f32>;
@group(0) @binding(4) var uiT: texture_2d<f32>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
  return o;
}

fn sharp(uv: vec2f) -> vec2f {
  let texel = uv * P.src;
  let scale = max(floor(P.out / P.src), vec2f(1.0, 1.0));
  let fl = floor(texel);
  let s = fract(texel) - 0.5;
  let region = 0.5 - 0.5 / scale;
  let f = (s - clamp(s, -region, region)) * scale + 0.5;
  return (fl + f) / P.src;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  let suv = sharp(i.uv);
  let w = textureSampleLevel(worldT, samp, suv, 0.0);
  let l = textureSampleLevel(lightT, samp, i.uv, 0.0);
  let u = textureSampleLevel(uiT, samp, suv, 0.0);
  var col = w.rgb * l.rgb;
  col = col * (1.0 - u.a) + u.rgb;
  if (P.mode > 0.5) {
    // Handheld-LCD colour response: slightly washed out, warm and less saturated.
    let lum = dot(col, vec3f(0.299, 0.587, 0.114));
    col = mix(vec3f(lum), col, 0.78);
    col = col * vec3f(0.94, 0.97, 0.86) + vec3f(0.05, 0.06, 0.04);
  }
  if (P.lcd > 0.0) {
    let ppt = P.out.x / P.src.x;
    if (ppt >= 3.0) {
      let px = fract(i.uv * P.src);
      let e = min(min(px.x, 1.0 - px.x), min(px.y, 1.0 - px.y)) * ppt;
      let g = smoothstep(0.0, 1.0, e);
      col = col * mix(1.0 - 0.35 * P.lcd, 1.0, g);
    }
  }
  return vec4f(col, 1.0);
}
`;

export class WebGPUBackend {
  static async create(canvas, atlas) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) throw new Error('no adapter');
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('no webgpu context');
    const b = new WebGPUBackend(canvas, device, ctx, atlas);
    b.adapterInfo = adapter.info ? `${adapter.info.vendor} ${adapter.info.architecture}`.trim() : '';
    return b;
  }

  constructor(canvas, device, ctx, atlas) {
    this.name = 'WebGPU';
    this.canvas = canvas;
    this.device = device;
    this.ctx = ctx;
    this.lost = false;
    device.lost?.then((info) => {
      this.lost = true;
      console.error('WebGPU device lost', info?.message);
    });
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: 'opaque' });

    // Atlas: palette indices as r8uint.
    this.atlasTex = device.createTexture({
      size: [atlas.width, atlas.height],
      format: 'r8uint',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: this.atlasTex },
      atlas.pixels,
      { bytesPerRow: atlas.width },
      [atlas.width, atlas.height],
    );
    this.palTex = device.createTexture({
      size: [8, 1024],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.uploadPalettes(atlas.palRows);

    const rt = () =>
      device.createTexture({
        size: [SW, SH],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.worldRT = rt();
    this.lightRT = rt();
    this.uiRT = rt();

    this.globals = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.globals, 0, new Float32Array([SW, SH, 0, 0]));
    this.postBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const spriteMod = device.createShaderModule({ code: SPRITE_WGSL });
    const spriteLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const attrs = [0, 1, 2, 3].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' }));
    const makeSpritePipeline = (blend) =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [spriteLayout] }),
        vertex: {
          module: spriteMod,
          entryPoint: 'vs',
          buffers: [{ arrayStride: STRIDE, stepMode: 'instance', attributes: attrs }],
        },
        fragment: { module: spriteMod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm', blend }] },
        primitive: { topology: 'triangle-list' },
      });
    const premul = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    const additive = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    };
    this.spritePipe = makeSpritePipeline(premul);
    this.lightPipe = makeSpritePipeline(additive);
    this.spriteBind = device.createBindGroup({
      layout: spriteLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globals } },
        { binding: 1, resource: this.atlasTex.createView() },
        { binding: 2, resource: this.palTex.createView() },
      ],
    });

    const compMod = device.createShaderModule({ code: COMPOSITE_WGSL });
    const compLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    this.compPipe = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [compLayout] }),
      vertex: { module: compMod, entryPoint: 'vs' },
      fragment: { module: compMod, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.compBind = device.createBindGroup({
      layout: compLayout,
      entries: [
        { binding: 0, resource: { buffer: this.postBuf } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: this.worldRT.createView() },
        { binding: 3, resource: this.lightRT.createView() },
        { binding: 4, resource: this.uiRT.createView() },
      ],
    });

    this.instCap = 0;
    this.instBuf = null;
    this.staging = new Float32Array(0);
    this.postData = new Float32Array(8);
  }

  uploadPalettes(rows) {
    const data = new Uint8Array(8 * 1024 * 4);
    data.set(rows.subarray(0, Math.min(rows.length, data.length)));
    this.device.queue.writeTexture({ texture: this.palTex }, data, { bytesPerRow: 32 }, [8, 1024]);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  _ensure(count) {
    if (count <= this.instCap) return;
    let cap = Math.max(1024, this.instCap);
    while (cap < count) cap *= 2;
    this.instBuf?.destroy();
    this.instBuf = this.device.createBuffer({
      size: cap * STRIDE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.staging = new Float32Array(cap * 16);
    this.instCap = cap;
  }

  render({ world, lights, ui, ambient, post }) {
    if (this.lost) return;
    const total = world.n + lights.n + ui.n;
    this._ensure(Math.max(total, 1));
    const s = this.staging;
    s.set(world.f.subarray(0, world.n * 16), 0);
    s.set(lights.f.subarray(0, lights.n * 16), world.n * 16);
    s.set(ui.f.subarray(0, ui.n * 16), (world.n + lights.n) * 16);
    const q = this.device.queue;
    if (total) q.writeBuffer(this.instBuf, 0, s.buffer, 0, total * STRIDE);

    const pd = this.postData;
    pd[0] = SW;
    pd[1] = SH;
    pd[2] = this.canvas.width;
    pd[3] = this.canvas.height;
    pd[4] = post.lcd;
    pd[5] = post.colorMode;
    pd[6] = post.time;
    q.writeBuffer(this.postBuf, 0, pd);

    const enc = this.device.createCommandEncoder();
    const pass = (view, clear, pipe, first, count) => {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view, clearValue: clear, loadOp: 'clear', storeOp: 'store' }],
      });
      if (count > 0) {
        p.setPipeline(pipe);
        p.setBindGroup(0, this.spriteBind);
        p.setVertexBuffer(0, this.instBuf);
        p.draw(6, count, 0, first);
      }
      p.end();
    };
    pass(this.worldRT.createView(), { r: 0, g: 0, b: 0, a: 1 }, this.spritePipe, 0, world.n);
    pass(
      this.lightRT.createView(),
      { r: ambient[0], g: ambient[1], b: ambient[2], a: 1 },
      this.lightPipe,
      world.n,
      lights.n,
    );
    pass(this.uiRT.createView(), { r: 0, g: 0, b: 0, a: 0 }, this.spritePipe, world.n + lights.n, ui.n);

    const cp = enc.beginRenderPass({
      colorAttachments: [
        { view: this.ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    cp.setPipeline(this.compPipe);
    cp.setBindGroup(0, this.compBind);
    cp.draw(3);
    cp.end();
    q.submit([enc.finish()]);
  }
}
