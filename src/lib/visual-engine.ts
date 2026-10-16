import { AudioAnalysis, type AudioSignal } from "./audio-analysis";
import { VisualPresence, fragmentVisibility } from "./visual-presence";
import { VisualScenes, type VisualMode } from "./visual-scenes";
import { ConstellationDirector, type PlaybackPosition } from "./constellation";

export interface VisualSettings {
  depth: number;
  speed: number;
  size: number;
  intensity: number;
  noise: number;
  glitch: number;
  contrast: number;
  brightness: number;
  motion: number;
  bloom: number;
  mode: VisualMode;
  quality: "Low" | "Medium" | "High";
  preset: number;
  powered: boolean;
}

interface Point {
  x: number;
  y: number;
  z: number;
  light: number;
}
type Bolt = {
  points: { x: number; y: number }[];
  distances: number[];
  length: number;
  revealStart: number;
  light: number;
  width: number;
};

type LightningStrike = {
  bolts: Bolt[];
  age: number;
  duration: number;
  energy: number;
};

export class VisualEngine {
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private width = 0;
  private height = 0;
  private time = 0;
  private lastTime = 0;
  private lastDraw = 0;
  private lastStrike = -1000;
  private lastReadout = 0;
  private strikes = 0;
  private lightningStrikes: LightningStrike[] = [];
  private lastStrikeWasGradual = false;
  private gradualStrikes = 0;
  private instantStrikes = 0;
  private pulse = 0;
  private bolts: Bolt[] = [];
  private observer: ResizeObserver;
  private data = new Uint8Array(1024);
  private waveform = new Uint8Array(2048).fill(128);
  private floatWaveform = new Float32Array(2048);
  private lastWaveform = new Uint8Array(2048).fill(128);
  private lastSpectrum = new Uint8Array(1024);
  private lastSceneSignal: AudioSignal | null = null;
  private scenes = new VisualScenes();
  private constellation = new ConstellationDirector();
  private analysis = new AudioAnalysis();
  private points: Point[] = [];
  private stars: { x: number; y: number; light: number }[] = [];
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private presence = new VisualPresence(this.reducedMotion);

  constructor(
    private canvas: HTMLCanvasElement,
    private getSettings: () => VisualSettings,
    private getAnalyser: () => AnalyserNode | null,
    private getPlaying: () => boolean,
    private onSignal?: (signal: AudioSignal) => void,
    private getRemainingTime?: () => number | null,
    private getPlaybackPosition?: () => PlaybackPosition | null,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    let seed = 72314;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 17000; i++)
      this.points.push({
        x: random(),
        y: random(),
        z: random(),
        light: random(),
      });
    for (let i = 0; i < 190; i++)
      this.stars.push({ x: random(), y: random(), light: random() });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.render);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private branch(
    x: number,
    y: number,
    endX: number,
    endY: number,
    level = 0,
    revealStart = 0,
  ) {
    const points = [{ x, y }],
      distance = Math.hypot(endX - x, endY - y);
    const subdivide = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      amplitude: number,
      remaining: number,
    ) => {
      if (remaining === 0) {
        points.push({ x: bx, y: by });
        return;
      }
      const dx = bx - ax,
        dy = by - ay,
        length = Math.hypot(dx, dy) || 1;
      const offset = (Math.random() - 0.5) * amplitude;
      const mx = (ax + bx) / 2 - (dy / length) * offset;
      const my = (ay + by) / 2 + (dx / length) * offset;
      subdivide(ax, ay, mx, my, amplitude * 0.52, remaining - 1);
      subdivide(mx, my, bx, by, amplitude * 0.52, remaining - 1);
    };
    subdivide(x, y, endX, endY, distance * 0.35, level ? 5 : 7);
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
      distances.push(
        distances[i - 1] +
          Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y,
          ),
      );
    }
    const length = distances[distances.length - 1];
    if (level < 2)
      for (let i = 8; i < points.length - 8; i += 9) {
        if (Math.random() < (level ? 0.15 : 0.6)) {
          const p = points[i];
          this.branch(
            p.x,
            p.y,
            p.x + (Math.random() - 0.5) * distance * 0.65,
            p.y + (Math.random() - 0.5) * distance * 0.7,
            level + 1,
            revealStart + ((1 - revealStart) * distances[i]) / (length || 1),
          );
        }
      }
    this.bolts.push({
      points,
      distances,
      length,
      revealStart,
      light: level ? 0.2 + Math.random() * 0.35 : 0.8 + Math.random() * 0.2,
      width: level ? 0.4 : 0.85,
    });
  }

  private createLightning(signal: AudioSignal) {
    this.bolts = [];
    const w = this.width,
      h = this.height;
    const count = 2 + Math.ceil(signal.bass * 3 + signal.treble * 8);
    for (let i = 0; i < count; i++) {
      const x = w * (0.25 + Math.random() * 0.5),
        y = h * (0.12 + Math.random() * 0.76),
        side = i % 4;
      this.branch(
        x,
        y,
        side === 0 ? -20 : side === 1 ? w + 20 : w * Math.random(),
        side === 2 ? -20 : side === 3 ? h + 20 : h * Math.random(),
      );
    }
    // Occasionally trace a strike; an instant strike always follows a gradual one.
    const gradual =
      !this.reducedMotion && !this.lastStrikeWasGradual && Math.random() < 0.5;
    this.lastStrikeWasGradual = gradual;
    if (gradual) this.gradualStrikes++;
    else this.instantStrikes++;
    this.lightningStrikes.push({
      bolts: this.bolts,
      age: 0,
      duration: gradual ? 0.3 + Math.random() * 0.2 : 0,
      energy: Math.min(
        1,
        0.55 + signal.flux * 30 + signal.treble * 2 + signal.bass * 0.9,
      ),
    });
    // Let an older line finish drawing when the next beat arrives.
    this.lightningStrikes = this.lightningStrikes.slice(-4);
  }

  private render = (timestamp: number) => {
    this.frame = requestAnimationFrame(this.render);
    if (document.hidden || !this.width || !this.height) return;
    const s = this.getSettings();
    const targetFps = this.reducedMotion
      ? 12
      : s.quality === "Low"
        ? 24
        : s.quality === "Medium"
          ? 40
          : 60;
    if (timestamp - this.lastDraw < 1000 / targetFps - 1) return;
    const elapsedDelta = this.lastTime
      ? Math.min((timestamp - this.lastTime) / 1000, 0.25)
      : 0.016;
    const dt = Math.min(elapsedDelta, 0.1);
    this.lastTime = timestamp;
    this.lastDraw = timestamp;
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    const analyser = this.getAnalyser(),
      playing = this.getPlaying() && s.powered;
    if (analyser && playing) {
      analyser.getByteFrequencyData(this.data);
      analyser.getByteTimeDomainData(this.waveform);
      analyser.getFloatTimeDomainData(this.floatWaveform);
    } else {
      this.data.fill(0);
      this.waveform.fill(128);
      this.floatWaveform.fill(0);
    }
    const signal = this.analysis.update(
      this.data,
      this.floatWaveform,
      analyser?.context.sampleRate ?? 48000,
      analyser?.fftSize ?? 2048,
      playing,
      dt,
    );
    const presence = this.presence.update(
      signal.rawRms,
      playing,
      elapsedDelta,
      this.getRemainingTime?.() ?? null,
    );
    const constellation = this.constellation.update(
      signal,
      this.data,
      elapsedDelta,
      this.getPlaybackPosition?.() ?? null,
      this.reducedMotion,
    );
    if (signal.active) {
      this.lastWaveform.set(this.waveform);
      this.lastSpectrum.set(this.data);
      this.lastSceneSignal = { ...signal, onset: false };
    }
    const displayWaveform = signal.active ? this.waveform : this.lastWaveform;
    const energy = Math.min(1.5, signal.rms * 7);
    const audioDrive = Math.min(1, Math.log1p(signal.rms * 35) / Math.log(12));
    // Time advances with the measured audio envelope; silence and pause hold the sculpture still.
    if (signal.active)
      this.time +=
        dt *
        (0.35 + (s.speed / 100) * 1.6) *
        (0.5 + s.motion / 100) *
        (0.28 + audioDrive * 1.25 + signal.mid * 0.7) *
        (this.reducedMotion ? 0.15 : 1);
    this.pulse *= Math.exp(-dt / 0.17);
    for (const strike of this.lightningStrikes) {
      if (signal.active) strike.age += dt;
      if (!signal.active || strike.age >= strike.duration) {
        strike.energy *= Math.exp(
          -dt / (signal.active ? 0.38 + signal.treble * 0.4 : 0.16),
        );
      }
    }
    this.lightningStrikes = this.lightningStrikes.filter(
      (strike) => strike.energy > 0.005,
    );
    if (signal.onset) {
      this.pulse = Math.min(1, energy + signal.bass);
      if (
        ["Particle", "Wave", "Beat", "Visual"].includes(s.mode) &&
        timestamp - this.lastStrike > (this.reducedMotion ? 1000 : 140)
      ) {
        this.createLightning(signal);
        this.lastStrike = timestamp;
        this.strikes++;
      }
    }
    if (timestamp - this.lastReadout > 100) {
      this.onSignal?.(signal);
      Object.assign(this.canvas.dataset, {
        rms: signal.rms.toFixed(5),
        bass: signal.bass.toFixed(4),
        mid: signal.mid.toFixed(4),
        treble: signal.treble.toFixed(4),
        signalTime: this.time.toFixed(5),
        strikes: String(this.strikes),
        waveOpacity: presence.opacity.toFixed(4),
        wavePhase: presence.phase,
        scene: s.mode,
        emittedParticles: String(this.scenes.particleCount),
        constellationFrom: constellation.from,
        constellationShape: constellation.to,
        constellationMorph: constellation.blend.toFixed(4),
        constellationChanges: String(constellation.changes),
        constellationReason: constellation.reason,
        constellationPhase: constellation.phase.toFixed(4),
        constellationBeatPeriod: constellation.beatPeriod.toFixed(4),
        constellationBeatConfidence: constellation.beatConfidence.toFixed(3),
        constellationLinks: String(this.scenes.constellationLinkCount),
        gradualStrikes: String(this.gradualStrikes),
        instantStrikes: String(this.instantStrikes),
        lightningProgress: this.lightningStrikes
          .filter((strike) => strike.duration > 0)
          .map((strike) => Math.min(1, strike.age / strike.duration).toFixed(3))
          .join(","),
      });
      this.lastReadout = timestamp;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    if (!s.powered) return;
    const t = this.time;
    ctx.strokeStyle = "rgba(192,192,192,0.075)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const x of [0.075, 0.5, 0.925]) {
      ctx.moveTo(w * x, 16);
      ctx.lineTo(w * x, h - 16);
    }
    for (const y of [0.2, 0.4, 0.6, 0.8]) {
      ctx.moveTo(20, h * y);
      ctx.lineTo(w - 20, h * y);
    }
    ctx.stroke();
    // Hidden means no particle sculpture, residual waveform, stars, or lightning.
    if (presence.phase === "hidden") {
      this.scenes.clear();
      return;
    }
    ctx.globalAlpha = presence.opacity;
    for (const star of this.stars) {
      ctx.fillStyle = `rgba(216,216,216,${0.04 + star.light * 0.2})`;
      ctx.fillRect(star.x * w, star.y * h, 0.6, 0.6);
    }
    ctx.globalCompositeOperation = "lighter";
    const bloom = s.bloom / 100;
    const light =
      (0.4 + (s.brightness / 100) * 2) *
      (0.5 + s.intensity / 100) *
      (0.65 + energy * 0.5 + this.pulse * 0.25);
    const baseScale = 0.65 + (s.size / 100) * 0.75;
    const scale = baseScale * (1 + signal.bass * 0.36 + this.pulse * 0.1);
    const motion = s.motion / 100;
    const disorder = this.reducedMotion ? 0 : 1 - presence.opacity;
    const count =
      s.quality === "High" ? 16500 : s.quality === "Medium" ? 10000 : 5500;
    const rotation = Math.sin(t * 0.42) * 0.32,
      cos = Math.cos(rotation),
      sin = Math.sin(rotation);
    const variant = s.preset % 4;
    let lastX = 0,
      lastY = 0;
    ctx.shadowBlur = 0;

    const customScene = this.scenes.render({
      ctx,
      w,
      h,
      t,
      dt,
      signal:
        signal.active || !this.lastSceneSignal
          ? signal
          : { ...this.lastSceneSignal, active: false, onset: false },
      data: signal.active ? this.data : this.lastSpectrum,
      waveform: displayWaveform,
      sampleRate: analyser?.context.sampleRate ?? 48000,
      settings: s,
      opacity: presence.opacity,
      seed: presence.seed,
      reducedMotion: this.reducedMotion,
      pulse: this.pulse,
      light: light * (0.65 + s.contrast / 100),
      scale,
      constellation,
    });

    if (!customScene && s.mode === "Wave") {
      const centerLayer = 5;
      const waveGain = Math.min(4, 1 / Math.max(0.25, signal.rms * 5));
      for (let layer = 0; layer < 11; layer++) {
        const offset = layer - centerLayer;
        const baseAlpha = Math.min(
          1,
          light * (layer === centerLayer ? 0.95 : 0.08 + audioDrive * 0.1),
        );
        const transitioning = presence.opacity < 0.999;
        ctx.strokeStyle = `rgba(255,255,255,${baseAlpha})`;
        ctx.lineWidth = layer === centerLayer ? 1.5 : 0.65;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur =
          !transitioning && layer === centerLayer
            ? bloom * (14 + audioDrive * 14)
            : 0;
        ctx.beginPath();
        let material = 1,
          scatterX = 0,
          scatterY = 0;
        for (let i = 0; i < 500; i++) {
          const u = i / 499;
          if (transitioning && i % 20 === 0) {
            const chunk = i / 20;
            const randomOrder =
              (Math.sin(chunk * 91.17 + layer * 13.7 + presence.seed * 71) +
                1) /
              2;
            material = fragmentVisibility(presence.opacity, randomOrder);
            const scatter = (1 - material) * disorder;
            scatterX =
              Math.sin(chunk * 13.2 + presence.seed * 20) * scatter * w * 0.1;
            scatterY =
              Math.cos(chunk * 21.3 + layer + presence.seed * 20) *
              scatter *
              h *
              0.16;
          }
          const x = u * w + scatterX;
          const sampleIndex = Math.min(
            2047,
            Math.max(
              0,
              Math.floor(u * 2047 + offset * (7 + Math.sin(t * 1.8) * 4)),
            ),
          );
          const sample = (displayWaveform[sampleIndex] - 128) / 128;
          const envelope = Math.pow(Math.sin(u * Math.PI), 0.7);
          const ripple =
            Math.sin(u * 13 - t * 3.2 + offset * 0.36) *
            envelope *
            offset *
            h *
            0.012 *
            audioDrive;
          const y =
            h / 2 +
            Math.tanh(sample * waveGain) *
              h *
              0.36 *
              scale *
              (1 + Math.abs(offset) * 0.05) +
            ripple +
            offset * envelope * h * 0.008 * audioDrive +
            scatterY;
          if (transitioning && i % 20 === 0) {
            if (i > 0) ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${baseAlpha * material})`;
          }
          if (i === 0 || (transitioning && i % 20 === 0)) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (!customScene) {
      for (let i = 0; i < count; i++) {
        const point = this.points[i],
          v = point.x,
          strand = Math.floor(point.y * 11);
        const randomOrder =
          (point.z * 0.754877 + point.y * 0.56984 + presence.seed) % 1;
        const material =
          presence.opacity >= 0.999
            ? 1
            : fragmentVisibility(presence.opacity, randomOrder);
        if (material <= 0.005) continue;
        const angle =
          v * Math.PI * (variant === 2 ? 12 : 7) +
          strand * 0.48 +
          t * (0.9 + motion * 2.2) +
          signal.mid * Math.sin(v * 12 - t * 1.8 + strand) * motion * 1.8;
        const taper = Math.pow(Math.sin(v * Math.PI), 0.7);
        const wave =
          Math.sin(v * 11 + t * 1.25) * 0.45 +
          Math.cos(v * 5 - t * 0.85) * 0.24;
        const radius =
          (0.075 + Math.sin(v * 8 + strand * 0.17 + t * 1.5) * 0.045) * taper;
        const frequency = 30 * Math.pow(500, v);
        const bin = Math.min(
          this.data.length - 1,
          Math.floor(
            frequency / ((analyser?.context.sampleRate ?? 48000) / 2048),
          ),
        );
        const spectral = signal.active ? this.data[bin] / 255 : 0;
        const expansion = 1 + spectral * energy * 0.65 + signal.mid * 0.55;
        let px =
          (wave * 0.36 +
            Math.cos(angle) * radius * (1 + strand * 0.075) * expansion) *
          scale;
        let py = (v - 0.5) * 0.9 * baseScale;
        const z = Math.sin(angle) * radius;
        px +=
          (point.z - 0.5) *
          (0.015 + (s.noise / 100) * 0.055 + signal.treble * 0.08) *
          taper;
        px +=
          ((displayWaveform[Math.floor(v * 2047)] - 128) / 128) *
          signal.mid *
          motion *
          0.06;
        py += (point.z - 0.5) * 0.014;
        px +=
          Math.sin(v * 15 - t * 2.8 + strand * 0.12) *
          taper *
          audioDrive *
          (0.025 + signal.mid * 0.07) *
          motion;
        py +=
          Math.sin(v * 18 - t * 3 + strand * 0.2) *
          taper *
          audioDrive *
          0.025 *
          motion;
        if (variant === 1) px += Math.sin(v * 19 + t * 0.4) * 0.13 * taper;
        if (variant === 2) {
          px *= 1.6;
          py *= 0.78;
        }
        if (variant === 3) px += Math.cos(v * 24 + t) * 0.08;
        if (s.mode === "Beat") {
          px *= 0.65 + signal.bass * 1.8 + this.pulse * 0.3;
          py *= 0.8 + signal.bass * 0.4;
        }
        if (s.mode === "Visual")
          px += Math.sin(v * 37 + t * 1.6) * (0.025 + signal.mid * 0.1);
        const perspective = 1 + z * ((s.depth / 100) * 3);
        let x = w * 0.5 + (px * cos - py * sin * 0.18) * w * perspective;
        let y = h * 0.5 + (py * cos + px * sin) * h;
        if (disorder > 0) {
          const scatter = (1 - material) * disorder * (35 + point.light * 120);
          const scatterAngle = (point.y + presence.seed) * Math.PI * 2;
          x +=
            Math.cos(scatterAngle) * scatter +
            Math.sin(disorder * 13 + point.z * 30) * scatter * 0.3;
          y +=
            Math.sin(scatterAngle) * scatter +
            Math.cos(disorder * 11 + point.y * 30) * scatter * 0.3;
        }
        if (signal.active && s.glitch > 5 && Math.sin(y * 0.06 + t * 4) > 0.995)
          x += Math.sin(t * 10) * s.glitch * signal.treble;
        const facing = 0.2 + (z / (radius || 1) + 1) * 0.32;
        const alpha =
          material *
          Math.min(
            0.96,
            (0.12 + point.light * 0.8) *
              facing *
              light *
              (0.65 + s.contrast / 100),
          );
        const dot =
          (point.light > 0.97 ? 1.55 : point.light > 0.7 ? 1 : 0.65) *
          (0.95 + energy * 0.6);
        ctx.fillStyle = `rgba(237,237,237,${alpha})`;
        ctx.fillRect(x, y, dot, dot);
        if (point.light > 0.99 && audioDrive > 0.02 && !this.reducedMotion) {
          const trail = (audioDrive + this.pulse) * 5 * motion;
          ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.22})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(angle) * trail, y - Math.sin(angle) * trail);
          ctx.stroke();
        }
        if (
          i % 109 === 0 &&
          i > 0 &&
          Math.hypot(x - lastX, y - lastY) < w * 0.35
        ) {
          ctx.strokeStyle = `rgba(223,223,223,${alpha * 0.08})`;
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (i % 109 === 0) {
          lastX = x;
          lastY = y;
        }
      }
    }

    // Lightning belongs to the original filament scenes, leaving each new composition distinct.
    const lightningHalo = new Path2D();
    let haloEnergy = 0;
    ctx.shadowBlur = 0;
    for (const strike of customScene ? [] : this.lightningStrikes) {
      haloEnergy = Math.max(haloEnergy, strike.energy);
      const elapsed = strike.duration
        ? Math.min(1, strike.age / strike.duration)
        : 1;
      const reveal = elapsed * elapsed * (3 - 2 * elapsed);
      for (const bolt of strike.bolts) {
        const progress = Math.min(
          1,
          Math.max(0, (reveal - bolt.revealStart) / (1 - bolt.revealStart)),
        );
        if (progress <= 0) continue;
        const alpha = bolt.light * light * strike.energy;
        const visibleLength = bolt.length * progress;
        let tip = bolt.points[0];
        const path = new Path2D();
        path.moveTo(tip.x, tip.y);
        for (let i = 1; i < bolt.points.length; i++) {
          const point = bolt.points[i];
          if (bolt.distances[i] <= visibleLength) {
            tip = point;
            path.lineTo(point.x, point.y);
          } else {
            const previous = bolt.points[i - 1];
            const fraction =
              (visibleLength - bolt.distances[i - 1]) /
              (bolt.distances[i] - bolt.distances[i - 1] || 1);
            tip = {
              x: previous.x + (point.x - previous.x) * fraction,
              y: previous.y + (point.y - previous.y) * fraction,
            };
            path.lineTo(tip.x, tip.y);
            break;
          }
        }
        ctx.strokeStyle = `rgba(243,243,243,${Math.min(1, alpha)})`;
        ctx.shadowColor = "#f1f1f1";
        ctx.lineWidth = bolt.width;
        ctx.stroke(path);
        if (bolt.light > 0.25 && strike.energy > 0.03)
          lightningHalo.addPath(path);
        if (bolt.light > 0.65) {
          const p = strike.duration > 0 ? tip : bolt.points[0],
            glow = ctx.createRadialGradient(
              p.x,
              p.y,
              0,
              p.x,
              p.y,
              8 + bloom * 20,
            );
          glow.addColorStop(0, `rgba(251,251,251,${Math.min(0.9, alpha)})`);
          glow.addColorStop(0.04, `rgba(246,246,246,${alpha * 0.35})`);
          glow.addColorStop(0.15, `rgba(242,242,242,${alpha * 0.08})`);
          glow.addColorStop(1, "rgba(238,238,238,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(p.x - 40, p.y - 40, 80, 80);
        }
      }
    }
    if (haloEnergy > 0.03) {
      ctx.strokeStyle = `rgba(243,243,243,${Math.min(0.3, haloEnergy * light * 0.16)})`;
      ctx.shadowBlur = 3 + bloom * 15 + signal.treble * 8;
      ctx.lineWidth = 0.65;
      ctx.stroke(lightningHalo);
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    const vignette = ctx.createRadialGradient(
      w / 2,
      h / 2,
      w * 0.1,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.63,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
  }
}
