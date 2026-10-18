import type { AudioSignal } from "./audio-analysis";
export { SYMBOL_FORMATIONS } from "./constellation-symbols";
import {
  EXTRA_FORMATIONS,
  extraFormationFamily,
  extraFormationPoint,
  type FormationFamily,
} from "./constellation-formations";

export const FORMATIONS = [
  "Nebula",
  "Sphere",
  "Torus",
  "Helix",
  "Spiral",
  "Rose",
  "Knot",
  "Crystal",
  "Orbitals",
  "Supernova",
  "Lissajous",
  ...EXTRA_FORMATIONS,
] as const;
export type Formation = (typeof FORMATIONS)[number];
export type MorphReason =
  | "intro"
  | "peak"
  | "phrase"
  | "section"
  | "evolution"
  | "seek"
  | "selection";
export type Vec3 = { x: number; y: number; z: number };
export type ConstellationSeed = Vec3 & { a: number };
export type PlaybackPosition = { position: number; duration: number };

export interface ConstellationState {
  from: Formation;
  to: Formation;
  blend: number;
  changes: number;
  reason: MorphReason;
  phase: number;
  energy: number;
  peak: number;
  sinceOnset: number;
  beatPeriod: number;
  beatConfidence: number;
  entropy: number;
  partials: readonly number[];
}

const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const follow = (a: number, b: number, dt: number, seconds: number) =>
  a + (b - a) * (1 - Math.exp(-dt / seconds));
const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0.5;
};

/** Audio-directed choreography; no musical clock or morph progresses in silence. */
export class ConstellationDirector {
  private from: Formation = "Nebula";
  private to: Formation = "Nebula";
  private blend = 1;
  private changes = 0;
  private reason: MorphReason = "intro";
  private phase = 0;
  private clock = 0;
  private sinceChange = 0;
  private duration = 2.6;
  private energy = 0;
  private longEnergy = 0;
  private longCentroid = 0;
  private fluxFloor = 0;
  private peak = 0;
  private sinceOnset = 100;
  private beatPeriod = 0.5;
  private beatConfidence = 0;
  private intervals: number[] = [];
  private beats = 0;
  private lastOnset = -100;
  private entropy = 0;
  private partials = [1, 0, 0];
  private history: Formation[] = ["Nebula"];
  private section = 0;
  private pending: MorphReason | null = null;
  private pendingFor = 0;
  private lastPosition: number | null = null;
  private trackDuration: number | null = null;
  private randomState = 41729;

  get state(): ConstellationState {
    // Quintic easing has zero velocity and acceleration at both morph endpoints.
    const b = this.blend;
    return {
      from: this.from,
      to: this.to,
      blend: clamp(b * b * b * (b * (b * 6 - 15) + 10)),
      changes: this.changes,
      reason: this.reason,
      phase: this.phase,
      energy: this.energy,
      peak: this.peak,
      sinceOnset: this.sinceOnset,
      beatPeriod: this.beatPeriod,
      beatConfidence: this.beatConfidence,
      entropy: this.entropy,
      partials: this.partials,
    };
  }

  update(
    signal: AudioSignal,
    spectrum: Uint8Array,
    delta: number,
    playback: PlaybackPosition | null = null,
    reducedMotion = false,
    selected: Formation | null = null,
  ): ConstellationState {
    const dt = Math.max(0, Math.min(0.25, delta));
    if (playback) {
      const jump =
        this.lastPosition !== null &&
        (playback.position < this.lastPosition - 0.35 ||
          playback.position > this.lastPosition + 1.25);
      const newTrack =
        this.trackDuration !== null &&
        Math.abs(playback.duration - this.trackDuration) > 0.01;
      if (jump || newTrack) {
        // Forget stale beat/section predictions after a seek, but keep node identity.
        this.intervals = [];
        this.beatConfidence = 0;
        this.beats = 0;
        this.lastOnset = -100;
        this.sinceChange = 0;
        this.longEnergy = 0;
        this.longCentroid = signal.centroid;
        this.pending = "seek";
        this.pendingFor = 0;
      }
      this.lastPosition = playback.position;
      this.trackDuration = playback.duration;
    }
    if (!signal.active || dt === 0) return this.state;

    this.clock += dt;
    this.sinceChange += dt;
    this.sinceOnset += dt;
    this.blend = Math.min(1, this.blend + dt / this.duration);
    const energy = clamp(Math.log1p(signal.rms * 35) / Math.log(12));
    this.energy = follow(this.energy, energy, dt, 0.18);
    this.longEnergy = follow(this.longEnergy, energy, dt, 6);
    this.longCentroid = follow(this.longCentroid, signal.centroid, dt, 5);
    this.fluxFloor = follow(this.fluxFloor, signal.flux, dt, 2);
    this.phase += dt * (0.4 + this.energy * 0.85) * (reducedMotion ? 0.15 : 1);
    this.peak *= Math.exp(-dt / 0.85);
    this.analyseSpectrum(spectrum, dt);

    const surprise =
      Math.max(0, this.energy - this.longEnergy) * 1.8 +
      Math.abs(signal.centroid - this.longCentroid) * 2;
    const strength = clamp(
      signal.flux * 24 + signal.bass * 0.65 + surprise * 0.55,
    );
    if (signal.onset) {
      const interval = this.clock - this.lastOnset;
      if (interval >= 0.18 && interval <= 2) {
        let folded = interval;
        while (folded < 0.3) folded *= 2;
        while (folded > 1) folded /= 2;
        this.intervals.push(folded);
        this.intervals = this.intervals.slice(-12);
        this.beatPeriod = median(this.intervals);
        const deviation = median(
          this.intervals.map((x) => Math.abs(x - this.beatPeriod)),
        );
        this.beatConfidence =
          Math.min(1, this.intervals.length / 6) *
          clamp(1 - deviation / (this.beatPeriod * 0.3));
      }
      this.lastOnset = this.clock;
      this.sinceOnset = 0;
      this.beats++;
      this.peak = Math.max(this.peak, strength);
    }

    if (playback && playback.duration > 0) {
      const section = Math.min(
        7,
        Math.floor(clamp(playback.position / playback.duration) * 8),
      );
      if (section !== this.section) {
        this.section = section;
        if (this.pending !== "seek") this.pending = "section";
      }
    }
    if (this.pending) this.pendingFor += dt;
    if (selected) {
      if (this.blend === 1 && this.to !== selected)
        this.beginMorph(selected, "selection", reducedMotion);
      return this.state;
    }
    const minHold = reducedMotion
      ? 8
      : Math.max(3.6, Math.min(6, this.beatPeriod * 8));
    if (this.blend < 1 || this.sinceChange < minHold) return this.state;

    let cue: MorphReason | null = null;
    if (this.pending && (signal.onset || this.pendingFor > 1.5))
      cue = this.pending;
    else if (
      signal.onset &&
      strength > 0.72 &&
      signal.flux > Math.max(0.004, this.fluxFloor * 1.25)
    )
      cue = "peak";
    else if (signal.onset && this.beats >= (this.energy > 0.45 ? 8 : 16))
      cue = "phrase";
    else if (
      this.sinceChange > (reducedMotion ? 18 : 8 + (1 - this.energy) * 5)
    )
      cue = "evolution";
    if (cue) {
      this.beginMorph(this.choose(signal, strength, cue), cue, reducedMotion);
    }
    return this.state;
  }

  private beginMorph(
    target: Formation,
    reason: MorphReason,
    reducedMotion: boolean,
  ) {
    this.from = this.to;
    this.to = target;
    this.blend = 0;
    this.duration = reducedMotion
      ? 5.5
      : reason === "peak"
        ? 1.9
        : 2.6 + (1 - this.energy) * 0.9;
    this.sinceChange = 0;
    this.beats = 0;
    this.pending = null;
    this.pendingFor = 0;
    this.reason = reason;
    this.changes++;
    this.history.push(this.to);
    this.history = this.history.slice(-13);
  }

  private analyseSpectrum(spectrum: Uint8Array, dt: number) {
    const bands = new Float64Array(12);
    let power = 0,
      peak = 1,
      max = 0;
    for (let i = 2; i < Math.min(640, spectrum.length); i++) {
      const p = (spectrum[i] / 255) ** 2;
      bands[Math.min(11, Math.floor((Math.log2(i / 2 + 1) / 8.4) * 12))] += p;
      power += p;
      if (p > max) {
        max = p;
        peak = i;
      }
    }
    let entropy = 0;
    if (power > 0)
      for (const band of bands) {
        const p = band / power;
        if (p > 0) entropy -= (p * Math.log(p)) / Math.log(12);
      }
    this.entropy = follow(this.entropy, entropy, dt, 0.3);
    const harmonics = [1, 2, 3].map((h) => {
      const bin = peak * h;
      return bin < spectrum.length
        ? ((spectrum[bin - 1] ?? 0) +
            spectrum[bin] +
            (spectrum[bin + 1] ?? 0)) /
            765
        : 0;
    });
    const total = harmonics.reduce((sum, x) => sum + x, 0) || 1;
    for (let i = 0; i < 3; i++)
      this.partials[i] = follow(
        this.partials[i],
        harmonics[i] / total,
        dt,
        0.2,
      );
  }

  private choose(
    signal: AudioSignal,
    strength: number,
    reason: MorphReason,
  ): Formation {
    const total = signal.bass + signal.mid + signal.treble + 0.0001;
    const bass = signal.bass / total,
      mid = signal.mid / total,
      treble = signal.treble / total;
    const tonal = 1 - this.entropy;
    const scores: Partial<Record<Formation, number>> = {
      Nebula: 0.4 + (1 - this.energy) * 3,
      Sphere: 0.7 + tonal * 3 + mid,
      Torus: 0.5 + bass * 5 + tonal,
      Helix: 0.7 + mid * 4 + surprise(signal, this.longCentroid),
      Spiral: 0.7 + this.entropy * 2 + this.energy,
      Rose: 0.6 + treble * 3 + tonal,
      Knot: 0.6 + mid * 2 + this.entropy * 3,
      Crystal: 0.5 + treble * 5 + signal.flux * 20,
      Orbitals: 0.7 + tonal * 3 + mid * 2,
      Supernova: 0.3 + strength * 2 + (reason === "peak" ? 9 : 0),
      Lissajous: 0.6 + mid * 3 + this.entropy * 2,
    };
    const familyScores: Record<FormationFamily, number> = {
      geometry: 0.5 + treble * 5 + signal.flux * 20,
      knots: 0.6 + mid * 3 + this.entropy * 2,
      surfaces: 0.7 + mid * 2 + tonal * 2,
      botanical: 0.6 + treble * 2 + tonal * 3,
      shells: 0.7 + bass * 2 + tonal * 2,
      fractals: 0.5 + this.entropy * 4 + strength,
      astronomy: 0.7 + bass * 3 + (reason === "peak" ? 2 : 0),
      curves: 0.7 + mid * 3 + tonal,
      structures: 0.5 + this.entropy * 2 + treble * 3,
      waves: 0.7 + bass * 2 + mid * 2 + this.energy,
      scifi: 1 + bass * 3 + this.energy,
      logos: 1 + mid * 2 + strength,
      anatomy: 1 + treble * 2 + this.entropy * 2,
    };
    const previousFamily = extraFormationFamily(this.to);
    const weight = (name: Formation) => {
      const family = extraFormationFamily(name);
      return (
        scores[name] ??
        (family
          ? familyScores[family] * (family === previousFamily ? 0.4 : 1)
          : 1)
      );
    };
    const recent = this.history.slice(-12);
    const candidates = FORMATIONS.filter((name) => !recent.includes(name));
    this.randomState =
      (this.randomState * 1664525 +
        1013904223 +
        Math.round(signal.centroid * 10000 + strength * 1000) +
        this.section * 97) >>>
      0;
    let cursor =
      (this.randomState / 4294967296) *
      candidates.reduce((sum, name) => sum + weight(name), 0);
    for (const name of candidates) {
      cursor -= weight(name);
      if (cursor <= 0) return name;
    }
    return candidates[candidates.length - 1];
  }
}

const surprise = (signal: AudioSignal, baseline: number) =>
  Math.min(2, Math.abs(signal.centroid - baseline) * 4);
const CUBE_EDGES = [
  [-1, -1, -1, 1, -1, -1],
  [-1, 1, -1, 1, 1, -1],
  [-1, -1, 1, 1, -1, 1],
  [-1, 1, 1, 1, 1, 1],
  [-1, -1, -1, -1, 1, -1],
  [1, -1, -1, 1, 1, -1],
  [-1, -1, 1, -1, 1, 1],
  [1, -1, 1, 1, 1, 1],
  [-1, -1, -1, -1, -1, 1],
  [1, -1, -1, 1, -1, 1],
  [-1, 1, -1, -1, 1, 1],
  [1, 1, -1, 1, 1, 1],
];

/** A stable node index maps into every shape, so morphing never replaces the stars. */
export function formationPoint(
  form: Formation,
  i: number,
  count: number,
  seed: ConstellationSeed,
): Vec3 {
  const extra = extraFormationPoint(form, i, count);
  if (extra) return extra;
  const u = (i + 0.5) / count,
    angle = u * TAU;
  switch (form) {
    case "Nebula":
      return {
        x: (seed.x - 0.5) * 1.8,
        y: (seed.y - 0.5) * 1.5,
        z: (seed.z - 0.5) * 1.3,
      };
    case "Sphere": {
      const y = 1 - 2 * u,
        r = Math.sqrt(1 - y * y),
        a = i * 2.3999632297;
      return { x: Math.cos(a) * r * 0.9, y: y * 0.9, z: Math.sin(a) * r * 0.9 };
    }
    case "Torus": {
      const v = i * 2.3999632297,
        r = 0.66 + Math.cos(v) * 0.23;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: Math.sin(v) * 0.23,
      };
    }
    case "Helix": {
      const along = Math.floor(i / 2) / Math.max(1, Math.ceil(count / 2) - 1),
        a = along * TAU * 2.2 + (i % 2) * Math.PI;
      return {
        x: Math.cos(a) * 0.46,
        y: (along - 0.5) * 1.75,
        z: Math.sin(a) * 0.46,
      };
    }
    case "Spiral": {
      const r = Math.sqrt(u) * 0.95,
        a = u * TAU * 2 + ((i % 3) * TAU) / 3;
      return {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        z: (seed.z - 0.5) * 0.18,
      };
    }
    case "Rose": {
      const r = 0.58 + Math.cos(angle * 5) * 0.32;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: Math.sin(angle * 3) * 0.16,
      };
    }
    case "Knot": {
      const r = 0.63 + Math.cos(angle * 3) * 0.23;
      return {
        x: Math.cos(angle * 2) * r,
        y: Math.sin(angle * 2) * r,
        z: Math.sin(angle * 3) * 0.32,
      };
    }
    case "Crystal": {
      const edge = CUBE_EDGES[Math.min(11, Math.floor(u * 12))],
        v = (u * 12) % 1;
      return {
        x: (edge[0] + (edge[3] - edge[0]) * v) * 0.59,
        y: (edge[1] + (edge[4] - edge[1]) * v) * 0.59,
        z: (edge[2] + (edge[5] - edge[2]) * v) * 0.59,
      };
    }
    case "Orbitals": {
      const plane = i % 3,
        a = (Math.floor(i / 3) / Math.ceil(count / 3)) * TAU,
        tilt = ((plane - 1) * Math.PI) / 3;
      return {
        x: Math.cos(a) * 0.9,
        y: Math.sin(a) * Math.cos(tilt) * 0.9,
        z: Math.sin(a) * Math.sin(tilt) * 0.9,
      };
    }
    case "Supernova": {
      const ray = i % 14,
        y = 1 - (ray + 0.5) / 7,
        r = Math.sqrt(1 - y * y),
        a = ray * 2.3999632297;
      const distance =
        0.12 + (Math.floor(i / 14) / Math.ceil(count / 14)) * 0.9;
      return {
        x: Math.cos(a) * r * distance,
        y: y * distance,
        z: Math.sin(a) * r * distance,
      };
    }
    case "Lissajous":
      return {
        x: Math.sin(angle * 3 + Math.PI / 2) * 0.85,
        y: Math.sin(angle * 2) * 0.85,
        z: Math.sin(angle * 5) * 0.28,
      };
  }
  throw new Error(`Unknown constellation formation: ${form}`);
}
