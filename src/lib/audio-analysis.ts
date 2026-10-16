export interface AudioSignal {
  rawRms: number;
  rms: number;
  bass: number;
  mid: number;
  treble: number;
  centroid: number;
  flux: number;
  onset: boolean;
  active: boolean;
}

const follow = (
  current: number,
  target: number,
  delta: number,
  attack = 0.025,
  release = 0.16,
) =>
  current +
  (target - current) *
    (1 - Math.exp(-delta / (target > current ? attack : release)));

/** Features are measured from the same post-volume signal sent to the speakers. */
export class AudioAnalysis {
  private previous = new Float32Array(1024);
  private floor = 0;
  private cooldown = 0;
  private bassHistory = 0;
  private previousBass = 0;
  private signal: AudioSignal = {
    rawRms: 0,
    rms: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    centroid: 0,
    flux: 0,
    onset: false,
    active: false,
  };

  update(
    frequency: Uint8Array,
    waveform: Uint8Array | Float32Array,
    sampleRate: number,
    fftSize: number,
    playing: boolean,
    delta: number,
  ): AudioSignal {
    const dt = Math.min(0.1, Math.max(0.001, delta));
    let power = 0;
    const floatingPoint = waveform instanceof Float32Array;
    if (playing)
      for (let i = 0; i < waveform.length; i++) {
        const sample = floatingPoint ? waveform[i] : (waveform[i] - 128) / 128;
        power += sample * sample;
      }
    const rms = playing ? Math.sqrt(power / waveform.length) : 0;
    const active = playing && rms > 0.0005;
    const binHz = sampleRate / fftSize;
    const band = (low: number, high: number) => {
      if (!active) return 0;
      const start = Math.max(1, Math.floor(low / binHz)),
        end = Math.min(frequency.length - 1, Math.ceil(high / binHz));
      let sum = 0;
      for (let i = start; i <= end; i++) sum += Math.pow(frequency[i] / 255, 3);
      return (
        Math.sqrt(sum / Math.max(1, end - start + 1)) * Math.min(1, rms * 10)
      );
    };
    const bass = band(30, 220),
      mid = band(220, 3000),
      treble = band(3000, 15000);
    let flux = 0,
      weight = 0,
      magnitude = 0;
    if (this.previous.length !== frequency.length)
      this.previous = new Float32Array(frequency.length);
    for (let i = 1; i < frequency.length; i++) {
      const value = active ? frequency[i] / 255 : 0;
      flux += Math.max(0, value - this.previous[i]);
      weight += i * binHz * value * value;
      magnitude += value * value;
      this.previous[i] = value;
    }
    flux /= frequency.length;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const onset =
      active &&
      this.cooldown === 0 &&
      (flux > Math.max(0.003, this.floor * 1.7) ||
        (bass > this.bassHistory * 1.35 + 0.075 &&
          bass > this.previousBass + 0.025));
    if (onset) this.cooldown = 0.14;
    this.floor = follow(this.floor, flux, dt, 0.15, 0.5);
    this.bassHistory = follow(this.bassHistory, bass, dt, 0.18, 0.3);
    this.previousBass = bass;
    this.signal = {
      rawRms: rms,
      rms: follow(this.signal.rms, rms, dt),
      bass: follow(this.signal.bass, bass, dt),
      mid: follow(this.signal.mid, mid, dt),
      treble: follow(this.signal.treble, treble, dt, 0.015, 0.1),
      centroid: follow(
        this.signal.centroid,
        magnitude ? weight / magnitude / (sampleRate / 2) : 0,
        dt,
        0.06,
        0.2,
      ),
      flux,
      onset,
      active,
    };
    return this.signal;
  }
}
