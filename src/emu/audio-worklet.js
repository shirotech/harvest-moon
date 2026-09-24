// AudioWorklet that plays interleaved stereo samples pushed from the emulator.
class CartridgeOutput extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1 << 15; // stereo frames
    this.buf = new Float32Array(this.size * 2);
    this.r = 0;
    this.w = 0;
    this.lastL = 0;
    this.lastR = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d === 'flush') {
        this.r = this.w = 0;
        return;
      }
      const frames = d.length >> 1;
      for (let i = 0; i < frames; i++) {
        const k = this.w % this.size;
        this.buf[k * 2] = d[i * 2];
        this.buf[k * 2 + 1] = d[i * 2 + 1];
        this.w++;
      }
      // keep latency bounded (~120 ms): drop the oldest samples if we fall behind
      const max = Math.floor(sampleRate * 0.12);
      if (this.w - this.r > max) this.r = this.w - max;
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] ?? out[0];
    for (let i = 0; i < L.length; i++) {
      if (this.r < this.w) {
        const k = this.r % this.size;
        this.lastL = this.buf[k * 2];
        this.lastR = this.buf[k * 2 + 1];
        this.r++;
      } else {
        // underrun: decay towards silence instead of clicking
        this.lastL *= 0.995;
        this.lastR *= 0.995;
      }
      L[i] = this.lastL;
      R[i] = this.lastR;
    }
    return true;
  }
}
registerProcessor('cartridge-output', CartridgeOutput);
