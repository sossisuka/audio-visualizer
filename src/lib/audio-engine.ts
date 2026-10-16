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
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeVoices = new Set<AudioScheduledSourceNode>();
  private startedAt = 0;
  private position = 0;
  private nextNote = 0;
  private step = 0;
  private playing = false;
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
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.5);
    }
    this.reverb.buffer = impulse;
    this.lfo = ctx.createOscillator();
    this.lfoDepth = ctx.createGain();
    this.lfo.frequency.value = 0.8;
    this.lfo.connect(this.lfoDepth).connect(this.delay.delayTime);
    this.lfo.start();
    this.input.connect(this.filter).connect(this.drive);
    this.drive.connect(this.dry).connect(this.output);
    this.drive.connect(this.delay).connect(this.wet).connect(this.output);
    this.delay.connect(this.feedback).connect(this.delay);
    this.drive
      .connect(this.reverb)
      .connect(this.reverbGain)
      .connect(this.output);
    this.output.connect(this.analyser).connect(ctx.destination);
    this.setEffect("Reverb", 35);
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

  async play() {
    await this.context.resume();
    if (this.playing) return;
    this.playing = true;
    this.startedAt = this.context.currentTime - this.position;
    if (this.buffer) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
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
    return this.playing
      ? this.context.currentTime - this.startedAt
      : this.position;
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
    const amount = mix / 100,
      now = this.context.currentTime;
    this.dry.gain.setTargetAtTime(
      effect === "None" ? 1 : 1 - amount * 0.25,
      now,
      0.03,
    );
    this.wet.gain.setTargetAtTime(
      ["Delay", "Chorus", "Flanger", "Phaser"].includes(effect)
        ? amount * 0.6
        : 0,
      now,
      0.03,
    );
    this.reverbGain.gain.setTargetAtTime(
      effect === "Reverb" ? amount * 0.9 : 0,
      now,
      0.03,
    );
    this.delay.delayTime.setTargetAtTime(
      effect === "Delay"
        ? (60 / 138) * 0.75
        : effect === "Chorus"
          ? 0.025
          : 0.008,
      now,
      0.03,
    );
    this.feedback.gain.setTargetAtTime(
      effect === "Delay" ? 0.38 : effect === "Flanger" ? 0.65 : 0.15,
      now,
      0.03,
    );
    this.lfo.frequency.setTargetAtTime(
      effect === "Phaser" ? 1.3 : effect === "Chorus" ? 0.6 : 0.2,
      now,
      0.03,
    );
    this.lfoDepth.gain.setTargetAtTime(
      ["Chorus", "Flanger", "Phaser"].includes(effect) ? 0.003 : 0,
      now,
      0.03,
    );
    this.setDrive(effect === "Distort" ? mix : 0);
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
    osc.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(gain, when + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(envelope).connect(this.input);
    this.activeVoices.add(osc);
    osc.onended = () => {
      this.activeVoices.delete(osc);
      osc.disconnect();
      envelope.disconnect();
    };
    osc.start(when);
    osc.stop(when + duration + 0.02);
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
        kick.frequency.exponentialRampToValueAtTime(38, this.nextNote + 0.2);
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
      this.nextNote += beat / 2;
      this.step++;
    }
  }

  dispose() {
    this.pause();
    this.lfo.stop();
    void this.context.close();
  }
}
