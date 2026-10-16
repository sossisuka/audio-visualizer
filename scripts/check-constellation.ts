import assert from "node:assert/strict";
import {
  ConstellationDirector,
  FORMATIONS,
  formationPoint,
} from "../src/lib/constellation";
import type { AudioSignal } from "../src/lib/audio-analysis";

const silent: AudioSignal = {
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
const spectrum = new Uint8Array(1024);
spectrum[4] = 230;
spectrum[8] = 140;
spectrum[12] = 80;
const bass: AudioSignal = {
  rawRms: 0.15,
  rms: 0.15,
  bass: 0.45,
  mid: 0.05,
  treble: 0.005,
  centroid: 0.04,
  flux: 0,
  onset: false,
  active: true,
};
const bright: AudioSignal = {
  ...bass,
  bass: 0.01,
  mid: 0.12,
  treble: 0.4,
  centroid: 0.45,
};

const empty = new ConstellationDirector();
const initial = JSON.stringify(empty.state);
for (let i = 0; i < 600; i++) empty.update(silent, spectrum, 1 / 60);
assert.equal(
  JSON.stringify(empty.state),
  initial,
  "Silence must not invent motion, peaks, or shape changes",
);

for (const count of [99, 169, 260])
  for (const form of FORMATIONS) {
    const points = Array.from({ length: count }, (_, i) =>
      formationPoint(form, i, count, {
        x: (i * 0.618) % 1,
        y: (i * 0.754) % 1,
        z: (i * 0.569) % 1,
        a: 0.5,
      }),
    );
    assert.ok(
      points.every(
        (p) =>
          Object.values(p).every(Number.isFinite) &&
          Math.hypot(p.x, p.y, p.z) < 1.7,
      ),
      `${form} must have bounded, finite geometry at every quality`,
    );
    assert.ok(
      Math.max(...points.map((p) => p.x)) -
        Math.min(...points.map((p) => p.x)) >
        0.8,
      `${form} must have a visible silhouette`,
    );
  }

function simulate(
  signal: AudioSignal,
  seconds = 60,
  fps = 60,
  reduced = false,
  rhythmic = true,
) {
  const director = new ConstellationDirector();
  const changes: { time: number; state: typeof director.state }[] = [];
  let transitions = 0,
    last = director.state;
  for (let frame = 0; frame < seconds * fps; frame++) {
    const onset = rhythmic && frame % (fps / 2) === 0;
    const state = director.update(
      { ...signal, onset, flux: onset ? 0.025 : 0.0001 },
      spectrum,
      1 / fps,
      null,
      reduced,
    );
    if (state.changes !== last.changes) {
      assert.equal(
        state.from,
        last.to,
        "A new morph must retain the preceding formation's node identities",
      );
      assert.ok(
        last.blend > 0.99,
        "An ongoing morph must finish before another begins",
      );
      assert.ok(
        !changes.slice(-3).some((x) => x.state.to === state.to),
        "Avoid repeating recent formations",
      );
      changes.push({
        time: frame / fps,
        state: { ...state, partials: [...state.partials] },
      });
    }
    if (state.blend > 0 && state.blend < 1) transitions++;
    assert.ok(state.blend >= 0 && state.blend <= 1);
    last = state;
  }
  return { director, changes, transitions };
}

const rhythmic = simulate(bass);
assert.ok(
  rhythmic.changes.length >= 8 && rhythmic.changes.length <= 16,
  "A track should evolve repeatedly without changing on every beat",
);
assert.ok(
  rhythmic.transitions > 300,
  "Formation changes must have a gradual interpolation",
);
assert.ok(
  rhythmic.changes.every(
    (x, i, all) => x.time - (all[i - 1]?.time ?? 0) >= 3.5,
  ),
  "Peaks need a minimum hold interval",
);
assert.ok(
  Math.abs(rhythmic.director.state.beatPeriod - 0.5) < 0.03 &&
    rhythmic.director.state.beatConfidence > 0.8,
  "Regular onsets should establish a stable pulse estimate",
);
assert.ok(
  rhythmic.changes.some((x) => x.state.reason === "peak"),
  "Measured peaks should influence choreography",
);
const treble = simulate(bright);
assert.notEqual(
  rhythmic.changes.map((x) => x.state.to).join(),
  treble.changes.map((x) => x.state.to).join(),
  "Different spectral balances should produce different shape sequences",
);

const sustained = simulate(bass, 40, 60, false, false);
assert.ok(
  sustained.changes.length >= 2 &&
    sustained.changes.every((x) => x.state.reason === "evolution"),
  "Sustained audio should evolve gently without inventing beat events",
);
assert.equal(sustained.director.state.beatConfidence, 0);
const frozen = JSON.stringify(rhythmic.director.state);
for (let i = 0; i < 180; i++)
  rhythmic.director.update(silent, spectrum, 1 / 60);
assert.equal(
  JSON.stringify(rhythmic.director.state),
  frozen,
  "Pause and silence must freeze morphs, synthesis, and peak propagation",
);

const slowerFrames = simulate(bass, 60, 24);
assert.ok(
  Math.abs(slowerFrames.director.state.phase - rhythmic.director.state.phase) <
    0.01,
  "Synthesis time must be frame-rate independent",
);
assert.ok(
  Math.abs(slowerFrames.changes.length - rhythmic.changes.length) <= 1,
  "Choreography cadence must be frame-rate independent",
);
const reduced = simulate(bass, 30, 60, true);
assert.ok(reduced.director.state.phase < rhythmic.director.state.phase * 0.2);
assert.ok(
  reduced.changes.every((x, i, all) => x.time - (all[i - 1]?.time ?? 0) >= 7.9),
  "Reduced motion should slow formation changes",
);

const timeline = new ConstellationDirector();
for (let frame = 0; frame < 600; frame++)
  timeline.update({ ...bass, onset: frame % 30 === 0 }, spectrum, 1 / 60, {
    position: frame / 60,
    duration: 80,
  });
const beforeSeek = timeline.state;
timeline.update(bass, spectrum, 1 / 60, { position: 52, duration: 80 });
assert.equal(
  timeline.state.beatConfidence,
  0,
  "A seek must discard stale pulse predictions",
);
assert.equal(
  timeline.state.changes,
  beforeSeek.changes,
  "A seek should not teleport into a new formation",
);
for (let frame = 1; frame <= 260; frame++)
  timeline.update(bass, spectrum, 1 / 60, {
    position: 52 + frame / 60,
    duration: 80,
  });
assert.equal(timeline.state.reason, "seek");
assert.ok(
  timeline.state.changes > beforeSeek.changes,
  "Choreography should resume smoothly after seeking",
);

console.log(
  "Passed: 11 bounded formations, musical peak/phrase cues, spectral adaptation, sustained-tone evolution, smooth interpolation, pulse estimation, no recent repeats, silence freeze, seeking, reduced motion, and frame-rate independence.",
);
