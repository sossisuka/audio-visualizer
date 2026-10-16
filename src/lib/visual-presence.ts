export type PresencePhase = "hidden" | "entering" | "visible" | "leaving";

export const smoothstep = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

/** A stable per-fragment threshold; randomize the order once, never every frame. */
export const fragmentVisibility = (opacity: number, order: number) =>
  smoothstep((opacity - order * 0.65) / 0.35);

/** Separate visual attack/release from FFT smoothing and the musical animation clock. */
export class VisualPresence {
  private phase: PresencePhase = "hidden";
  private opacity = 0;
  private elapsed = 0;
  private duration = 0;
  private from = 0;
  private quietFor = 0;
  private audible = false;
  private ending = false;
  private seed = 0;

  constructor(
    private reducedMotion = false,
    private random = Math.random,
  ) {}

  get state() {
    return { phase: this.phase, opacity: this.opacity, seed: this.seed };
  }

  update(
    rms: number,
    playing: boolean,
    delta: number,
    remaining: number | null = null,
  ) {
    const dt = Math.max(0, Math.min(0.25, delta));
    // -60 dB opens the visual gate; -66 dB closes it after a short hold.
    // The two thresholds avoid chatter around the silence floor.
    if (!playing) {
      this.audible = false;
      this.quietFor = 0;
    } else if (rms >= 0.001) {
      this.audible = true;
      this.quietFor = 0;
    } else if (rms <= 0.0005) {
      this.quietFor += dt;
      if (this.quietFor >= 0.12) this.audible = false;
    } else {
      this.quietFor = 0;
    }

    if (this.ending && playing && (remaining === null || remaining > 0.8))
      this.ending = false;
    if (this.audible && !this.ending) {
      if (this.phase === "hidden" || this.phase === "leaving") {
        if (this.phase === "hidden") this.seed = this.random();
        this.begin("entering", this.reducedMotion ? 0.18 : 0.4);
      }
      if (this.phase === "visible" && remaining !== null && remaining <= 0.8) {
        this.ending = true;
        this.begin("leaving", Math.max(0.25, remaining));
      }
    } else if (this.phase === "entering" || this.phase === "visible") {
      this.begin("leaving", this.reducedMotion ? 0.25 : 0.9);
    }

    if (this.phase === "entering" || this.phase === "leaving") {
      this.elapsed += dt;
      const progress = Math.min(1, this.elapsed / this.duration);
      const target = this.phase === "entering" ? 1 : 0;
      this.opacity = this.from + (target - this.from) * smoothstep(progress);
      if (progress >= 1) {
        this.opacity = target;
        this.phase = target ? "visible" : "hidden";
      }
    }
    return this.state;
  }

  private begin(phase: "entering" | "leaving", duration: number) {
    if (phase === "leaving" && this.opacity > 0.98) this.seed = this.random();
    this.phase = phase;
    this.from = this.opacity;
    this.elapsed = 0;
    this.duration = duration;
  }
}
