export class Sound {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  enabled = true;
  private nextBeat = 0;
  private beat = 0;
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.enabled ? 0.22 : 0;
      this.gain.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 36;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 130;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.05;
      this.engine.connect(filter).connect(this.engineGain).connect(this.gain);
      this.engine.start();
    }
    await this.ctx.resume();
  }
  toggle() {
    this.enabled = !this.enabled;
    if (this.gain && this.ctx)
      this.gain.gain.setTargetAtTime(this.enabled ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }
  tone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.3,
    pan = 0,
    end = frequency,
  ) {
    if (!this.ctx || !this.gain || !this.enabled) return;
    const t = this.ctx.currentTime,
      osc = this.ctx.createOscillator(),
      g = this.ctx.createGain(),
      p = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(g).connect(p).connect(this.gain);
    osc.start();
    osc.stop(t + duration);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }
  shot(pan = 0) {
    this.tone(500, 0.08, 'sawtooth', 0.12, pan, 100);
  }
  blast(pan = 0) {
    this.tone(90, 0.4, 'sawtooth', 0.65, pan, 15);
    this.tone(230, 0.18, 'triangle', 0.3, pan, 25);
  }
  jump() {
    this.tone(90, 0.25, 'triangle', 0.4, 0, 420);
  }
  checkpoint() {
    [0, 1, 2, 3].forEach((i) =>
      setTimeout(() => this.tone([330, 440, 550, 880][i], 0.3, 'sine', 0.3), i * 95),
    );
  }
  update(speed: number, boost: boolean, active: boolean) {
    if (!this.ctx || !this.engine || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(28 + speed * 1.5, t, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.08 : 0, t, 0.1);
    if (!active) {
      this.nextBeat = t;
      return;
    }
    if (t > this.nextBeat) {
      this.nextBeat = t + 60 / 140 / 2;
      this.beat++;
      this.tone([55, 55, 65.4, 49][Math.floor(this.beat / 8) % 4], 0.17, 'triangle', 0.22);
      if (this.beat % 2 === 0) this.tone(110, 0.12, 'sine', 0.35, 0, 25);
      if (boost)
        this.tone([220, 330, 440, 660][this.beat % 4], 0.12, 'triangle', 0.1, Math.sin(this.beat));
    }
  }
  dispose() {
    this.engine?.stop();
    void this.ctx?.close();
  }
}
