export type AudioEffect =
  | "None"
  | "Reverb"
  | "Delay"
  | "Distort"
  | "Chorus"
  | "Flanger"
  | "Phaser";

/** A local Web Audio signal path; audio files never leave the browser. */
export class AudioEngine {
  context: AudioContext;
  analyser: AnalyserNode;
  input: GainNode;
  output: GainNode;
  filter: BiquadFilterNode;
  drive: WaveShaperNode;
  buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private wet: GainNode;
  private dry: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private reverb: ConvolverNode;
  private reverbGain: GainNode;
  private modulation: {
    effect: AudioEffect;
    wet: GainNode;
    lfo: OscillatorNode;
  }[] = [];
  private effects: readonly AudioEffect[] = ["Reverb"];
  private effectMix = 35;
  private driveAmount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeVoices = new Set<AudioScheduledSourceNode>();
  private startedAt = 0;
  private position = 0;
  private nextNote = 0;
  private step = 0;
  private playing = false;
  private rate = 1;
  onEnded?: () => void;

  constructor() {
    this.context = new AudioContext();
    const ctx = this.context;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.minDecibels = -95;
    this.analyser.maxDecibels = -15;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 0.6;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 12000;
    this.drive = ctx.createWaveShaper();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.feedback = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbGain = ctx.createGain();
    this.wet.gain.value = 0;
    this.reverbGain.gain.value = 0;
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.5);
    }
    this.reverb.buffer = impulse;
    this.input.connect(this.filter).connect(this.drive);
    this.drive.connect(this.dry).connect(this.output);
    this.drive.connect(this.delay).connect(this.wet).connect(this.output);
    this.delay.connect(this.feedback).connect(this.delay);
    this.drive
      .connect(this.reverb)
      .connect(this.reverbGain)
      .connect(this.output);
    this.output.connect(this.analyser).connect(ctx.destination);
    this.delay.delayTime.value = (60 / 138) * 0.75;
    this.feedback.gain.value = 0.38;
    for (const [effect, delayTime, feedback, rate] of [
      ["Chorus", 0.025, 0.15, 0.6],
      ["Flanger", 0.008, 0.65, 0.2],
      ["Phaser", 0.008, 0.15, 1.3],
    ] as const) {
      const delay = ctx.createDelay(1),
        wet = ctx.createGain(),
        loop = ctx.createGain(),
        lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      delay.delayTime.value = delayTime;
      wet.gain.value = 0;
      loop.gain.value = feedback;
      lfo.frequency.value = rate;
      depth.gain.value = 0.003;
      this.drive.connect(delay).connect(wet).connect(this.output);
      delay.connect(loop).connect(delay);
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      this.modulation.push({ effect, wet, lfo });
    }
    this.setEffects(["Reverb"], 35);
  }

  async load(file: File) {
    const decoded = await this.context.decodeAudioData(
      await file.arrayBuffer(),
    );
    this.pause();
    this.buffer = decoded;
    this.position = 0;
    return decoded.duration;
  }

  clear() {
    this.pause();
    this.buffer = null;
    this.position = 0;
  }

  async play() {
    await this.context.resume();
    if (this.playing) return;
    this.startPlayback();
  }

  private startPlayback() {
    this.playing = true;
    this.startedAt = this.context.currentTime;
    if (this.buffer) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.playbackRate.value = this.rate;
      source.connect(this.input);
      source.start(0, this.position);
      source.onended = () => {
        if (this.source !== source || !this.playing) return;
        this.playing = false;
        this.position = 0;
        this.source = null;
        this.onEnded?.();
      };
      this.source = source;
    } else {
      this.nextNote = this.context.currentTime + 0.05;
      this.step = Math.floor(this.position / (60 / 138 / 2));
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 60);
    }
  }

  pause() {
    if (this.playing) this.position = this.currentTime;
    this.playing = false;
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const voice of this.activeVoices) {
      try {
        voice.stop();
      } catch {
        /* Already finished. */
      }
    }
    this.activeVoices.clear();
  }

  seek(seconds: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.position = Math.max(
      0,
      Math.min(seconds, this.buffer?.duration ?? 300),
    );
    if (wasPlaying) void this.play();
  }

  get currentTime() {
    const time = this.playing
      ? this.position + (this.context.currentTime - this.startedAt) * this.rate
      : this.position;
    return this.buffer ? Math.min(time, this.buffer.duration) : time;
  }
  get playbackRate() {
    return this.rate;
  }
  get remainingTime() {
    return this.buffer
      ? Math.max(0, (this.buffer.duration - this.currentTime) / this.rate)
      : null;
  }
  setPlaybackRate(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0.5, Math.min(2, value));
    if (next === this.rate) return;
    const restartDemo = this.playing && !this.buffer;
    // Keep the source position continuous when changing the rate mid-track.
    if (restartDemo) this.pause();
    else if (this.playing) {
      this.position = this.currentTime;
      this.startedAt = this.context.currentTime;
    }
    this.rate = next;
    this.source?.playbackRate.setValueAtTime(next, this.context.currentTime);
    if (restartDemo) this.startPlayback();
  }
  get duration() {
    return this.buffer?.duration ?? 0;
  }
  get isPlaying() {
    return this.playing;
  }
  setInput(value: number) {
    this.input.gain.setTargetAtTime(
      Math.pow(value / 50, 1.5),
      this.context.currentTime,
      0.03,
    );
  }
  setOutput(value: number) {
    this.output.gain.setTargetAtTime(
      (value / 100) * 1.2,
      this.context.currentTime,
      0.03,
    );
  }
  setFilter(value: number) {
    this.filter.frequency.setTargetAtTime(
      20 * Math.pow(1000, value / 100),
      this.context.currentTime,
      0.03,
    );
  }
  setDrive(value: number) {
    this.driveAmount = value;
    this.updateDrive();
  }
  private updateDrive() {
    const value = Math.max(
      this.driveAmount,
      this.effects.includes("Distort") ? this.effectMix : 0,
    );
    if (value <= 0) {
      this.drive.curve = null;
      return;
    }
    const curve = new Float32Array(1024);
    const amount = (value / 100) * 14 + 1;
    for (let i = 0; i < curve.length; i++)
      curve[i] = Math.tanh(((i * 2) / 1023 - 1) * amount) / Math.tanh(amount);
    this.drive.curve = curve;
  }

  setEffect(effect: AudioEffect, mix: number) {
    this.setEffects(effect === "None" ? [] : [effect], mix);
  }

  setEffects(effects: readonly AudioEffect[], mix: number) {
    this.effects = effects.filter((effect) => effect !== "None");
    this.effectMix = mix;
    const wetCount = this.effects.filter(
      (effect) => effect !== "Distort",
    ).length;
    const amount = mix / 100 / Math.sqrt(Math.max(1, wetCount)),
      now = this.context.currentTime;
    this.dry.gain.setTargetAtTime(
      this.effects.length === 0 ? 1 : 1 - (mix / 100) * 0.25,
      now,
      0.03,
    );
    this.wet.gain.setTargetAtTime(
      this.effects.includes("Delay") ? amount * 0.6 : 0,
      now,
      0.03,
    );
    this.reverbGain.gain.setTargetAtTime(
      this.effects.includes("Reverb") ? amount * 0.9 : 0,
      now,
      0.03,
    );
    for (const branch of this.modulation)
      branch.wet.gain.setTargetAtTime(
        this.effects.includes(branch.effect) ? amount * 0.6 : 0,
        now,
        0.03,
      );
    this.updateDrive();
  }

  private tone(
    frequency: number,
    when: number,
    duration: number,
    gain: number,
    type: OscillatorType = "sine",
  ) {
    const osc = this.context.createOscillator(),
      envelope = this.context.createGain();
    osc.type = type;
    duration /= this.rate;
    osc.frequency.value = frequency * this.rate;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(gain, when + 0.012 / this.rate);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(envelope).connect(this.input);
    this.activeVoices.add(osc);
    osc.onended = () => {
      this.activeVoices.delete(osc);
      osc.disconnect();
      envelope.disconnect();
    };
    osc.start(when);
    osc.stop(when + duration + 0.02 / this.rate);
    return osc;
  }

  private schedule() {
    const beat = 60 / 138;
    const notes = [
      64, 67, 71, 76, 74, 71, 67, 62, 64, 67, 69, 71, 67, 64, 62, 59,
    ];
    while (this.nextNote < this.context.currentTime + 0.18) {
      const i = this.step % 32;
      if (i % 4 === 0) {
        const kick = this.tone(135, this.nextNote, 0.26, 0.42);
        kick.frequency.exponentialRampToValueAtTime(
          38 * this.rate,
          this.nextNote + 0.2 / this.rate,
        );
      }
      if (i % 2 === 0)
        this.tone(6600 + i * 40, this.nextNote, 0.035, 0.017, "triangle");
      const note = notes[this.step % notes.length];
      this.tone(
        440 * Math.pow(2, (note - 69) / 12),
        this.nextNote,
        beat * 1.5,
        0.07,
        "triangle",
      );
      if (i % 8 === 0) {
        const root = [40, 36, 43, 38][Math.floor(i / 8)];
        this.tone(
          440 * Math.pow(2, (root - 69) / 12),
          this.nextNote,
          beat * 3.7,
          0.13,
        );
        for (const offset of [12, 19, 24])
          this.tone(
            440 * Math.pow(2, (root + offset - 69) / 12),
            this.nextNote,
            beat * 4.5,
            0.025,
          );
      }
      this.nextNote += beat / 2 / this.rate;
      this.step++;
    }
  }

  dispose() {
    this.pause();
    for (const branch of this.modulation) branch.lfo.stop();
    void this.context.close();
  }
}
