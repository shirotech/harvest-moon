// Main-thread side of cartridge audio: an AudioContext + worklet ring buffer
// (falls back to a ScriptProcessorNode where AudioWorklet is unavailable).

export class CartridgeAudio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.gain = null;
    this.ready = false;
    this.volume = 0.8;
    this.pending = [];
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);
    try {
      await this.ctx.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'cartridge-output', { outputChannelCount: [2] });
      this.post = (samples) => this.node.port.postMessage(samples, [samples.buffer]);
    } catch (e) {
      console.warn('AudioWorklet unavailable, using ScriptProcessor', e);
      const ring = [];
      let cur = null, pos = 0;
      this.node = this.ctx.createScriptProcessor(1024, 0, 2);
      this.node.onaudioprocess = (ev) => {
        const L = ev.outputBuffer.getChannelData(0), R = ev.outputBuffer.getChannelData(1);
        for (let i = 0; i < L.length; i++) {
          if (!cur || pos >= cur.length) {
            cur = ring.shift() ?? null;
            pos = 0;
          }
          L[i] = cur ? cur[pos] : 0;
          R[i] = cur ? cur[pos + 1] : 0;
          if (cur) pos += 2;
        }
      };
      this.post = (samples) => {
        ring.push(samples);
        while (ring.length > 8) ring.shift();
      };
    }
    this.node.connect(this.gain);
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    this.ready = true;
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 48000;
  }

  push(samples) {
    if (this.ready && samples.length) this.post(samples);
  }

  setVolume(v) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }

  async suspend() {
    await this.ctx?.suspend().catch(() => {});
  }

  close() {
    this.node?.disconnect();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.ready = false;
  }
}
