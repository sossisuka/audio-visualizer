import type { AudioSignal } from "./audio-analysis";
import type { VisualSettings } from "./visual-engine";
import { fragmentVisibility } from "./visual-presence";
import {
  formationPoint,
  type ConstellationState,
  type Vec3,
} from "./constellation";

export const SCENES = [
  {
    id: "Orbit",
    name: "Orbit",
    description: "A circular spectrum emitting particles on the beat",
  },
  {
    id: "Senbonzakura",
    name: "Senbonzakura",
    description: "A thousand fluttering cherry petals carried by the music",
  },
  {
    id: "Galaxy",
    name: "Galaxy",
    description: "A rotating spiral galaxy with a luminous core",
  },
  {
    id: "Warp",
    name: "Warp",
    description: "A twisting tunnel with accelerating star trails",
  },
  {
    id: "Constellation",
    name: "Constellation",
    description:
      "Stars morphing into musical formations, with harmonic motion and travelling pulses",
  },
  {
    id: "Mandala",
    name: "Mandala",
    description: "A mirrored, flowering spectrum mandala",
  },
  {
    id: "Terrain",
    name: "Terrain",
    description: "A flowing wireframe landscape shaped by the spectrum",
  },
  {
    id: "Rain",
    name: "Rain",
    description: "Falling light and ripples that respond to the beat",
  },
  {
    id: "Particle",
    name: "Ribbon",
    description: "The original twisting particle sculpture and lightning",
  },
  {
    id: "Wave",
    name: "Wave",
    description: "Layered traces of the actual audio waveform",
  },
  {
    id: "Beat",
    name: "Pulse",
    description: "A particle ribbon that expands with the bass",
  },
  {
    id: "Visual",
    name: "Filament",
    description: "An intricate, oscillating particle filament",
  },
] as const;

export type VisualMode = (typeof SCENES)[number]["id"];

export interface SceneFrame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  t: number;
  dt: number;
  signal: AudioSignal;
  data: Uint8Array;
  waveform: Uint8Array;
  sampleRate: number;
  settings: VisualSettings;
  opacity: number;
  seed: number;
  reducedMotion: boolean;
  pulse: number;
  light: number;
  scale: number;
  constellation: ConstellationState;
}

type Seed = { x: number; y: number; z: number; a: number };
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  seed: number;
  size: number;
};
const TAU = Math.PI * 2;
const fract = (n: number) => n - Math.floor(n);
const white = (alpha: number) =>
  `rgba(255,255,255,${Math.max(0, Math.min(1, alpha))})`;

/** Independent compositions share the audio envelope and finite silence transition. */
export class VisualScenes {
  private seeds: Seed[] = [];
  private sparks: Spark[] = [];
  private mode: VisualMode | null = null;
  private emission = 0;
  private petal = new Path2D();
  private constellationPositions: Vec3[] = [];
  private constellationEdges = new Map<
    number,
    { a: number; b: number; alpha: number; target: number }
  >();
  private constellationLinkClock = 0;
  private constellationCount = 0;

  constructor() {
    let state = 918273;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < 4200; i++)
      this.seeds.push({ x: random(), y: random(), z: random(), a: random() });
    // A notched cherry petal, rather than a generic oval or dot.
    this.petal.moveTo(0, 1);
    this.petal.bezierCurveTo(-1.25, 0.15, -0.92, -1.12, -0.25, -0.95);
    this.petal.lineTo(0, -0.68);
    this.petal.lineTo(0.25, -0.95);
    this.petal.bezierCurveTo(0.92, -1.12, 1.25, 0.15, 0, 1);
    this.petal.closePath();
  }

  clear() {
    this.sparks.length = 0;
    this.emission = 0;
  }

  get particleCount() {
    return this.sparks.length;
  }

  get constellationLinkCount() {
    return this.constellationEdges.size;
  }

  render(f: SceneFrame): boolean {
    if (this.mode !== f.settings.mode) {
      this.mode = f.settings.mode;
      this.clear();
    }
    f.ctx.save();
    const depth = (f.settings.depth - 50) / 100;
    f.ctx.translate(f.w / 2, f.h / 2);
    f.ctx.scale(1 + depth * 0.08, 1 - depth * 0.12);
    f.ctx.translate(-f.w / 2, -f.h / 2);
    if (!f.reducedMotion && f.signal.active && Math.sin(f.t * 17) > 0.995)
      f.ctx.translate(
        Math.sin(f.t * 37) * f.settings.glitch * f.signal.treble * 0.4,
        0,
      );
    switch (f.settings.mode) {
      case "Orbit":
        this.orbit(f);
        break;
      case "Senbonzakura":
        this.sakura(f);
        break;
      case "Galaxy":
        this.galaxy(f);
        break;
      case "Warp":
        this.warp(f);
        break;
      case "Constellation":
        this.constellation(f);
        break;
      case "Mandala":
        this.mandala(f);
        break;
      case "Terrain":
        this.terrain(f);
        break;
      case "Rain":
        this.rain(f);
        break;
      default:
        f.ctx.restore();
        return false;
    }
    f.ctx.restore();
    return true;
  }

  private count(f: SceneFrame, high: number) {
    return Math.round(
      high *
        (f.settings.quality === "High"
          ? 1
          : f.settings.quality === "Medium"
            ? 0.65
            : 0.38),
    );
  }

  private material(f: SceneFrame, order: number) {
    return f.opacity >= 0.999
      ? 1
      : fragmentVisibility(f.opacity, fract(order + f.seed));
  }

  private scatter(f: SceneFrame, order: number, material: number) {
    const amount = f.reducedMotion
      ? 0
      : (1 - material) * (1 - f.opacity) * Math.min(f.w, f.h) * 0.24;
    const turbulence = f.reducedMotion
      ? 0
      : (f.settings.noise / 100) * f.signal.treble * Math.min(f.w, f.h) * 0.022;
    return {
      x:
        Math.sin(order * 127.1 + f.seed * 37) * amount +
        Math.sin(f.t * 0.9 + order * 73) * turbulence,
      y:
        Math.cos(order * 311.7 + f.seed * 53) * amount +
        Math.cos(f.t * 0.7 + order * 91) * turbulence,
    };
  }

  private spectrum(f: SceneFrame, u: number) {
    const hz = 35 * Math.pow(420, Math.max(0, Math.min(1, u)));
    const bin = Math.min(
      f.data.length - 1,
      Math.round(hz / (f.sampleRate / 2048)),
    );
    return (
      (f.data[bin] + (f.data[Math.min(bin + 1, f.data.length - 1)] ?? 0)) / 510
    );
  }

  private glow(
    f: SceneFrame,
    x: number,
    y: number,
    radius: number,
    alpha: number,
  ) {
    const gradient = f.ctx.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      Math.max(1, radius),
    );
    gradient.addColorStop(0, white(alpha));
    gradient.addColorStop(0.15, white(alpha * 0.3));
    gradient.addColorStop(0.5, white(alpha * 0.06));
    gradient.addColorStop(1, white(0));
    f.ctx.fillStyle = gradient;
    f.ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  private particles(f: SceneFrame, radius: number, petals = false) {
    const dt = f.signal.active
      ? f.dt * (0.4 + f.settings.speed / 65) * (f.reducedMotion ? 0.15 : 1)
      : 0;
    const max = this.count(f, petals ? 160 : 700);
    if (dt > 0) {
      this.emission +=
        dt *
        (petals
          ? 8 + f.signal.treble * 35
          : 28 + f.signal.treble * 160 + f.signal.rms * 100);
      const count = Math.min(
        max - this.sparks.length,
        Math.floor(this.emission) +
          (f.signal.onset && !f.reducedMotion ? (petals ? 40 : 65) : 0),
      );
      this.emission %= 1;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * TAU;
        const velocity =
          (0.05 + Math.random() * 0.14 + f.signal.bass * 0.2) *
          Math.min(f.w, f.h);
        this.sparks.push({
          x:
            0.5 +
            (Math.cos(angle) * radius) / f.w +
            (petals ? Math.sin(f.t * 0.65) * 0.14 : 0),
          y:
            (petals ? 0.35 + Math.cos(f.t * 0.45) * 0.12 : 0.5) +
            (Math.sin(angle) * radius) / f.h,
          vx: (Math.cos(angle) * velocity) / f.w,
          vy: (Math.sin(angle) * velocity) / f.h - (petals ? 0.1 : 0),
          age: 0,
          ttl: 1.3 + Math.random() * (petals ? 4 : 2),
          seed: Math.random(),
          size: petals ? 3 + Math.random() * 5 : 0.65 + Math.random() * 1.6,
        });
      }
      for (const p of this.sparks) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += petals ? dt * 0.045 : 0;
        if (petals) p.vx += Math.sin(f.t + p.seed * TAU) * dt * 0.025;
      }
      this.sparks = this.sparks.filter(
        (p) =>
          p.age < p.ttl && p.x > -0.2 && p.x < 1.2 && p.y > -0.2 && p.y < 1.2,
      );
    }
    const { ctx } = f;
    for (const p of this.sparks) {
      const m = this.material(f, p.seed);
      if (m < 0.005) continue;
      const scatter = this.scatter(f, p.seed, m);
      const x = p.x * f.w + scatter.x,
        y = p.y * f.h + scatter.y;
      const alpha =
        Math.sin((Math.min(1, p.age / 0.12) * Math.PI) / 2) *
        Math.pow(1 - p.age / p.ttl, 1.4) *
        m;
      if (petals)
        this.drawPetal(
          f,
          x,
          y,
          p.size,
          p.seed * TAU + f.t,
          Math.cos(f.t * 2 + p.seed * 17),
          alpha,
        );
      else {
        ctx.strokeStyle = white(alpha * 0.24 * f.light);
        ctx.lineWidth = p.size * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * f.w * 0.12, y - p.vy * f.h * 0.12);
        ctx.stroke();
        ctx.fillStyle = white(alpha * f.light);
        ctx.fillRect(x, y, p.size, p.size);
      }
    }
  }

  private orbit(f: SceneFrame) {
    const { ctx, w, h, t, signal } = f;
    const d = Math.min(w, h),
      radius = d * 0.235 * f.scale;
    this.glow(f, w / 2, h / 2, radius * 1.65, 0.07 + signal.bass * 0.12);
    const segments = this.count(f, 180);
    const halo = new Path2D();
    ctx.lineCap = "round";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 0;
    for (let i = 0; i < segments; i++) {
      const u = i / segments,
        angle = u * TAU - Math.PI / 2;
      const m = this.material(f, u * 7.31);
      if (m < 0.005) continue;
      const scatter = this.scatter(f, u, m);
      const mirrored = 1 - Math.abs(u * 2 - 1);
      const band = this.spectrum(f, mirrored);
      const sample = (f.waveform[Math.floor(u * 2047)] - 128) / 128;
      const inner = radius + sample * d * 0.018;
      const outer = inner + d * (0.008 + band * (0.09 + signal.bass * 0.11));
      const cx = w / 2 + scatter.x,
        cy = h / 2 + scatter.y;
      ctx.strokeStyle = white((0.28 + band * 0.65) * m * f.light);
      ctx.lineWidth = d < 400 ? 1.3 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      halo.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      halo.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
      // An inner segmented waveform keeps the ring alive even during narrow-band audio.
      ctx.strokeStyle = white(m * 0.3 * f.light);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        Math.max(1, inner - 6),
        angle,
        angle + (TAU / segments) * 0.7,
      );
      ctx.stroke();
    }
    // One bloom pass avoids hundreds of full-canvas shadow operations per frame.
    ctx.strokeStyle = white(0.15 * f.light * f.opacity);
    ctx.shadowBlur = (f.settings.bloom / 100) * 9;
    ctx.lineWidth = 1;
    ctx.stroke(halo);
    ctx.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      const m = this.material(f, i * 0.271);
      const scatter = this.scatter(f, i * 0.271, m);
      ctx.strokeStyle = white(0.16 * m * f.light);
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.arc(
        w / 2 + scatter.x,
        h / 2 + scatter.y,
        radius * (0.78 - i * 0.07),
        t * (i % 2 ? -0.4 : 0.5) + i * 2,
        t * (i % 2 ? -0.4 : 0.5) + i * 2 + 1.6,
      );
      ctx.stroke();
    }
    this.particles(f, radius);
  }

  private drawPetal(
    f: SceneFrame,
    x: number,
    y: number,
    size: number,
    rotation: number,
    flip: number,
    alpha: number,
  ) {
    const { ctx } = f;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(size * (0.15 + Math.abs(flip) * 0.85), size);
    const silk = ctx.createLinearGradient(-1, -1, 0.7, 1);
    silk.addColorStop(0, white(alpha * 0.35));
    silk.addColorStop(0.45, white(alpha));
    silk.addColorStop(1, white(alpha * 0.58));
    ctx.fillStyle = silk;
    ctx.fill(this.petal);
    ctx.restore();
  }

  private sakura(f: SceneFrame) {
    const { w, h, t, signal } = f;
    const count = this.count(f, 1000);
    const size =
      Math.max(0.65, Math.min(1.15, w / 650)) * (0.65 + f.settings.size / 100);
    for (let i = 0; i < count; i++) {
      const p = this.seeds[i];
      const m = this.material(f, p.a);
      if (m < 0.005) continue;
      const fall = fract(p.x + t * (0.025 + p.z * 0.045));
      const angle = p.y * TAU + t * (0.4 + f.settings.motion / 90) + fall * 7;
      const radius = w * (0.12 + p.z * 0.34) * (0.8 + signal.bass * 0.3);
      const scatter = this.scatter(f, p.a, m);
      const x =
        w / 2 +
        Math.cos(angle) * radius +
        Math.sin(fall * 9 + t * 0.4) * w * (0.06 + signal.mid * 0.12) +
        scatter.x;
      const y = fall * (h + 100) - 50 + scatter.y;
      const petalSize = (1.4 + p.z * p.z * 6.5) * size;
      const alpha = (0.16 + p.z * 0.65) * m * Math.min(1.4, f.light);
      const rotation = p.a * TAU + t * (p.z - 0.5) * 2;
      if (i % 47 === 0 && p.z > 0.45) {
        // Occasional complete five-petal blossoms among the drifting petals.
        for (let petal = 0; petal < 5; petal++) {
          const a = (petal / 5) * TAU + rotation;
          this.drawPetal(
            f,
            x + Math.cos(a) * petalSize * 0.72,
            y + Math.sin(a) * petalSize * 0.72,
            petalSize * 0.72,
            a - Math.PI / 2,
            1,
            alpha,
          );
        }
      } else
        this.drawPetal(
          f,
          x,
          y,
          petalSize,
          rotation,
          Math.sin(t * (1 + p.z * 2) + p.y * 20),
          alpha,
        );
    }
    this.particles(f, Math.min(w, h) * 0.13, true);
  }

  private galaxy(f: SceneFrame) {
    const { ctx, w, h, t, signal } = f;
    const d = Math.min(w, h) * f.scale;
    this.glow(f, w / 2, h / 2, d * 0.4, 0.2 + signal.bass * 0.25);
    const rotation = -0.35 + Math.sin(t * 0.12) * 0.22;
    const count = this.count(f, 4200);
    for (let i = 0; i < count; i++) {
      const p = this.seeds[i],
        m = this.material(f, p.a);
      if (m < 0.005) continue;
      const r = Math.pow(p.x, 0.65);
      const arm = Math.floor(p.y * 5);
      const angle =
        (arm * TAU) / 5 + r * 9 - t * 0.23 + (p.z - 0.5) * (0.25 + r * 0.6);
      const spectral = this.spectrum(f, r);
      const radius = r * d * 0.47 * (1 + signal.bass * 0.12 + spectral * 0.12);
      const px = Math.cos(angle) * radius;
      const py =
        Math.sin(angle) * radius * (0.46 + f.settings.depth / 300) +
        (p.z - 0.5) * d * 0.045 * (1 - r);
      const scatter = this.scatter(f, p.a, m);
      const x =
        w / 2 + px * Math.cos(rotation) - py * Math.sin(rotation) + scatter.x;
      const y =
        h / 2 + px * Math.sin(rotation) + py * Math.cos(rotation) + scatter.y;
      const alpha = (0.12 + p.a * 0.65) * (1 - r * 0.5) * m * f.light;
      const size = p.a > 0.985 ? 2 : p.a > 0.6 ? 1.1 : 0.65;
      ctx.fillStyle = white(alpha);
      ctx.fillRect(x, y, size, size);
      if (p.a > 0.996) this.glow(f, x, y, 7 + signal.treble * 10, alpha * 0.8);
    }
    this.glow(
      f,
      w / 2,
      h / 2,
      16 + f.settings.bloom * 0.3,
      Math.min(0.9, f.light * 0.55),
    );
  }

  private warp(f: SceneFrame) {
    const { ctx, w, h, t, signal } = f;
    const d = Math.min(w, h) * f.scale;
    const cx = w * (0.5 + Math.sin(t * 0.4) * 0.045),
      cy = h * (0.48 + Math.cos(t * 0.3) * 0.025);
    const rings = this.count(f, 30);
    for (let i = 0; i < rings; i++) {
      const z = fract(i / rings + t * 0.085);
      const radius = (d * 0.035) / (1 - z * 0.97);
      const m = this.material(f, i * 0.371);
      const scatter = this.scatter(f, i * 0.371, m);
      ctx.strokeStyle = white((0.06 + z * z * 0.35) * m * f.light);
      ctx.lineWidth = 0.5 + z;
      ctx.beginPath();
      for (let j = 0; j <= 8; j++) {
        const angle = (j / 8) * TAU + z * 1.7 + t * 0.15;
        const x = cx + Math.cos(angle) * radius + scatter.x,
          y = cy + Math.sin(angle) * radius + scatter.y;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < this.count(f, 650); i++) {
      const p = this.seeds[i],
        m = this.material(f, p.a);
      if (m < 0.005) continue;
      const z = fract(p.x + t * (0.1 + p.z * 0.06));
      const angle = p.y * TAU + t * 0.045;
      const r = (d * (0.015 + p.z * 0.06)) / (1 - z * 0.98);
      const length = (2 + z * z * 50) * (0.4 + signal.treble * 2);
      const scatter = this.scatter(f, p.a, m);
      const x = cx + Math.cos(angle) * r + scatter.x,
        y = cy + Math.sin(angle) * r + scatter.y;
      ctx.strokeStyle = white(z * m * (0.12 + p.a * 0.65) * f.light);
      ctx.lineWidth = 0.5 + z * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    this.glow(f, cx, cy, d * 0.1, 0.16 + signal.bass * 0.15);
  }

  private constellation(f: SceneFrame) {
    const { ctx, w, h, signal, constellation: state } = f;
    const d = Math.min(w * 0.88, h * 0.84),
      count = this.count(f, 260);
    const phase = state.phase * (0.4 + f.settings.speed / 70);
    const motion = (f.settings.motion / 100) * (f.reducedMotion ? 0.2 : 1);
    const yaw = phase * 0.13,
      pitch = 0.32 + Math.sin(phase * 0.11) * 0.24;
    const response = signal.active
      ? 1 - Math.exp(-f.dt / (f.reducedMotion ? 0.4 : 0.13))
      : 0;
    const nodes = Array.from({ length: count }, (_, i) => {
      const p = this.seeds[i];
      const from = formationPoint(state.from, i, count, p),
        to = formationPoint(state.to, i, count, p);
      const base = {
        x: from.x + (to.x - from.x) * state.blend,
        y: from.y + (to.y - from.y) * state.blend,
        z: from.z + (to.z - from.z) * state.blend,
      };
      const band = this.spectrum(f, p.x);
      const sample = (f.waveform[Math.floor(p.y * 2047)] - 128) / 128;
      // Additive partials and frequency modulation deform the geometry without obscuring its silhouette.
      const fm =
        Math.sin(phase * 0.7 + base.z * 4) * (0.15 + signal.treble * 1.6);
      const synthesis =
        (state.partials[0] * Math.sin(base.x * 6 + phase) +
          state.partials[1] * Math.sin(base.y * 9 - phase * 1.2 + fm) +
          state.partials[2] * Math.sin(base.z * 12 + phase * 1.7)) *
        motion *
        0.055;
      const expansion =
        1 + signal.bass * 0.16 + state.peak * 0.07 + band * 0.035;
      const target = {
        x: base.x * expansion + synthesis,
        y: base.y * expansion + sample * motion * 0.035,
        z: base.z * expansion + synthesis * 0.7,
      };
      const position = (this.constellationPositions[i] ??= { ...target });
      position.x += (target.x - position.x) * response;
      position.y += (target.y - position.y) * response;
      position.z += (target.z - position.z) * response;
      const rx = position.x * Math.cos(yaw) + position.z * Math.sin(yaw);
      const rz = -position.x * Math.sin(yaw) + position.z * Math.cos(yaw);
      const ry = position.y * Math.cos(pitch) - rz * Math.sin(pitch);
      const z = position.y * Math.sin(pitch) + rz * Math.cos(pitch);
      const perspective = 1 / (1 + z * (0.16 + f.settings.depth / 450));
      const m = this.material(f, p.a),
        scatter = this.scatter(f, p.a, m);
      const radius = Math.hypot(base.x, base.y, base.z);
      const wavefront =
        Math.exp(-(((radius - state.sinceOnset * 1.2) * 7) ** 2)) * state.peak;
      return {
        x: w / 2 + rx * d * 0.4 * f.scale * perspective + scatter.x,
        y: h * 0.49 + ry * d * 0.4 * f.scale * perspective + scatter.y,
        z,
        m,
        p,
        wavefront,
      };
    });

    this.constellationLinkClock += signal.active ? f.dt : 0;
    if (
      count !== this.constellationCount ||
      this.constellationLinkClock >= 0.12
    ) {
      this.constellationCount = count;
      this.constellationLinkClock = 0;
      const range = d * (0.16 + f.settings.size / 1100) * f.scale;
      const candidates: {
        a: number;
        b: number;
        distance: number;
        key: number;
      }[] = [];
      for (const edge of this.constellationEdges.values()) edge.target = 0;
      for (let a = 0; a < count; a++)
        for (let b = a + 1; b < count; b++) {
          const distance = Math.hypot(
            nodes[a].x - nodes[b].x,
            nodes[a].y - nodes[b].y,
          );
          const key = a * 512 + b;
          if (distance < range * (this.constellationEdges.has(key) ? 1.15 : 1))
            candidates.push({ a, b, distance, key });
        }
      candidates.sort((a, b) => a.distance - b.distance);
      const degrees = new Uint8Array(count);
      for (const edge of candidates) {
        if (degrees[edge.a] >= 4 || degrees[edge.b] >= 4) continue;
        degrees[edge.a]++;
        degrees[edge.b]++;
        const target = Math.max(0.12, 1 - edge.distance / (range * 1.15));
        const existing = this.constellationEdges.get(edge.key);
        if (existing) existing.target = target;
        else
          this.constellationEdges.set(edge.key, {
            a: edge.a,
            b: edge.b,
            alpha: 0,
            target,
          });
      }
    }
    for (const [key, edge] of this.constellationEdges) {
      const a = nodes[edge.a],
        b = nodes[edge.b];
      if (!a || !b) {
        this.constellationEdges.delete(key);
        continue;
      }
      if (signal.active)
        edge.alpha += (edge.target - edge.alpha) * (1 - Math.exp(-f.dt / 0.22));
      if (edge.alpha < 0.006 && edge.target === 0) {
        this.constellationEdges.delete(key);
        continue;
      }
      const alpha = edge.alpha * Math.min(a.m, b.m) * f.light;
      if (alpha < 0.005) continue;
      ctx.strokeStyle = white(
        alpha * (0.19 + signal.mid * 0.45 + (a.wavefront + b.wavefront) * 0.15),
      );
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const travel = fract(phase * (0.24 + signal.mid * 0.6) + a.p.z + b.p.a);
      ctx.fillStyle = white(
        alpha * (0.3 + signal.treble * 1.6 + state.peak * 0.3),
      );
      ctx.fillRect(
        a.x + (b.x - a.x) * travel,
        a.y + (b.y - a.y) * travel,
        1.4,
        1.4,
      );
    }
    for (const node of nodes) {
      if (node.m < 0.005) continue;
      const size =
        (node.p.z > 0.88 ? 1.8 : 0.85) *
        (1 + node.wavefront * 0.8) *
        (1 - node.z * 0.16);
      const alpha =
        node.m * (0.3 + node.p.z * 0.5 + node.wavefront * 0.5) * f.light;
      ctx.fillStyle = white(alpha);
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, TAU);
      ctx.fill();
      if (node.p.z > 0.92) {
        this.glow(
          f,
          node.x,
          node.y,
          7 + f.settings.bloom * 0.1 + node.wavefront * 5,
          node.m * (0.25 + node.wavefront * 0.35),
        );
        ctx.strokeStyle = white(node.m * (0.3 + node.wavefront * 0.4));
        ctx.beginPath();
        ctx.moveTo(node.x - 4, node.y);
        ctx.lineTo(node.x + 4, node.y);
        ctx.moveTo(node.x, node.y - 4);
        ctx.lineTo(node.x, node.y + 4);
        ctx.stroke();
      }
    }
  }

  private mandala(f: SceneFrame) {
    const { ctx, w, h, t, signal } = f;
    const d = Math.min(w, h) * f.scale;
    const petals = [8, 10, 12, 6][f.settings.preset % 4];
    const segments = this.count(f, 480);
    const halo = new Path2D();
    ctx.shadowColor = "#fff";
    for (let layer = 0; layer < 7; layer++) {
      ctx.lineWidth = layer === 6 ? 1.2 : 0.6;
      ctx.shadowBlur = 0;
      for (let chunk = 0; chunk < 24; chunk++) {
        const m = this.material(f, fract(chunk * 0.173 + layer * 0.271));
        if (m < 0.005) continue;
        const scatter = this.scatter(f, chunk + layer * 0.071, m);
        ctx.strokeStyle = white(
          (0.15 + layer * 0.055 + signal.treble * 0.3) * m * f.light,
        );
        const path = new Path2D();
        const steps = Math.ceil(segments / 24);
        for (let i = 0; i <= steps; i++) {
          const u = (chunk + i / steps) / 24;
          const angle = u * TAU + (layer % 2 ? -1 : 1) * t * 0.065;
          const folded = Math.abs(Math.sin(u * Math.PI * petals));
          const band = this.spectrum(f, folded);
          const radius =
            d *
              (0.045 + layer * 0.047) *
              (0.7 + folded * (0.35 + signal.mid * 0.25)) +
            band * d * 0.028;
          const x = w / 2 + Math.cos(angle) * radius + scatter.x,
            y = h / 2 + Math.sin(angle) * radius + scatter.y;
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
        ctx.stroke(path);
        if (layer === 6) halo.addPath(path);
      }
    }
    ctx.strokeStyle = white(0.13 * f.light * f.opacity);
    ctx.shadowBlur = f.settings.bloom * 0.12;
    ctx.stroke(halo);
    ctx.shadowBlur = 0;
    this.glow(f, w / 2, h / 2, d * 0.11, 0.22 + f.pulse * 0.3);
  }

  private terrain(f: SceneFrame) {
    const { ctx, w, h, t, signal } = f;
    const rows = this.count(f, 42),
      columns = this.count(f, 68);
    let previous: { x: number; y: number; m: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const z = row / (rows - 1),
        perspective = 0.12 + z * z * 1.65;
      const current: typeof previous = [];
      for (let col = 0; col < columns; col++) {
        const u = col / (columns - 1),
          world = z * 7 - t * 0.65;
        const m = this.material(f, fract(col * 0.617 + row * 0.173));
        const scatter = this.scatter(f, col * 0.11 + row * 0.73, m);
        const hills = Math.pow(
          (Math.sin(u * 12 + world) * Math.cos(u * 6 - world * 0.7) + 1) / 2,
          2,
        );
        const band = this.spectrum(f, u);
        const peak =
          (hills * (0.06 + signal.bass * 0.09) + band * 0.12) *
          h *
          (0.2 + z * 0.8) *
          (0.5 + f.settings.depth / 75);
        const x = w / 2 + (u - 0.5) * w * perspective * f.scale + scatter.x;
        const y = h * 0.4 + z * z * h * 0.56 - peak + scatter.y;
        const p = { x, y, m };
        current.push(p);
        ctx.lineWidth = 0.5 + z * 0.4;
        if (col > 0) {
          const before = current[col - 1];
          ctx.strokeStyle = white(
            Math.min(m, before.m) * (0.08 + z * 0.5) * f.light,
          );
          ctx.beginPath();
          ctx.moveTo(before.x, before.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (previous[col] && col % 2 === 0) {
          ctx.strokeStyle = white(
            Math.min(m, previous[col].m) * (0.04 + z * 0.18) * f.light,
          );
          ctx.beginPath();
          ctx.moveTo(previous[col].x, previous[col].y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
      previous = current;
    }
    this.glow(f, w / 2, h * 0.38, w * 0.3, 0.06 + signal.mid * 0.12);
  }

  private rain(f: SceneFrame) {
    const { ctx, w, h, t, signal } = f;
    const count = this.count(f, 460);
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const p = this.seeds[i],
        m = this.material(f, p.a);
      if (m < 0.005) continue;
      const depth = 0.3 + p.z * 0.7;
      const band = this.spectrum(f, p.x);
      const fall = fract(p.y + t * (0.12 + p.z * 0.2));
      const scatter = this.scatter(f, p.a, m);
      const x = p.x * w + Math.sin(t * 0.2 + p.y * 4) * w * 0.025 + scatter.x;
      const y = fall * h * 0.83 + scatter.y;
      const length = (5 + depth * 26 + band * 28) * f.scale;
      const slant = (Math.sin(t * 0.25) * 0.12 + signal.mid * 0.15) * length;
      ctx.strokeStyle = white(m * depth * (0.12 + band * 0.6) * f.light);
      ctx.lineWidth = depth * 1.2;
      ctx.beginPath();
      ctx.moveTo(x - slant, y - length);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = white(m * depth * 0.65 * f.light);
      ctx.fillRect(x - 0.6, y, 1.2 * depth, 1.8 * depth);
      if (i % 8 === 0) {
        const age = fract(p.y + t * 0.35);
        const r = age * (10 + signal.bass * 35 + f.pulse * 10);
        ctx.strokeStyle = white((1 - age) * m * 0.2 * f.light);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(
          p.x * w + scatter.x,
          h * (0.79 + p.z * 0.13) + scatter.y,
          r,
          r * 0.23,
          0,
          0,
          TAU,
        );
        ctx.stroke();
      }
    }
  }
}
