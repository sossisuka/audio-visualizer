import assert from "node:assert/strict";
import {
  ConstellationDirector,
  FORMATIONS,
  formationPoint,
} from "../src/lib/constellation";
import type { AudioSignal } from "../src/lib/audio-analysis";
import {
  EXTRA_FORMATIONS,
  extraFormationFamily,
} from "../src/lib/constellation-formations";
import {
  SYMBOL_FORMATIONS,
  isSymbolFormation,
} from "../src/lib/constellation-symbols";

assert.equal(SYMBOL_FORMATIONS.length, 18);
assert.equal(
  EXTRA_FORMATIONS.length,
  118,
  "Keep the 100 existing additions and add 18 figures",
);
assert.equal(FORMATIONS.length, 129);
assert.equal(
  new Set(FORMATIONS).size,
  129,
  "Every formation needs a unique name",
);
const families = new Map<string, number>();
for (const name of EXTRA_FORMATIONS.filter(
  (name) => !isSymbolFormation(name),
)) {
  const family = extraFormationFamily(name)!;
  families.set(family, (families.get(family) ?? 0) + 1);
}
assert.equal(families.size, 10, "The catalog must span ten geometry families");
assert.ok([...families.values()].every((count) => count === 10));
const geometries = new Set<string>();

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
    const spans = (["x", "y", "z"] as const)
      .map(
        (axis) =>
          Math.max(...points.map((point) => point[axis])) -
          Math.min(...points.map((point) => point[axis])),
      )
      .sort((a, b) => b - a);
    assert.ok(
      spans[0] > 0.8 && spans[1] > 0.3,
      `${form} must have a visible silhouette in at least two dimensions`,
    );
    assert.ok(
      new Set(
        points.map(
          (point) =>
            `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`,
        ),
      ).size >
        count * 0.45,
      `${form} must distribute its stars rather than collapse onto a few points`,
    );
    if (count === 260) {
      const signature = points
        .map((point) =>
          [point.x, point.y, point.z].map((v) => v.toFixed(5)).join(","),
        )
        .join(";");
      assert.ok(
        !geometries.has(signature),
        `${form} must have its own geometry`,
      );
      geometries.add(signature);
    }
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
        !changes.slice(-12).some((x) => x.state.to === state.to),
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

const varied = simulate(bass, 3600, 24);
assert.ok(
  new Set(varied.changes.map((change) => change.state.to)).size >= 105,
  "The music director must actually explore the expanded catalog",
);

for (const selected of SYMBOL_FORMATIONS) {
  const manual = new ConstellationDirector();
  const start = manual.update(bass, spectrum, 1 / 60, null, false, selected);
  assert.equal(start.to, selected);
  assert.equal(start.reason, "selection");
  assert.equal(
    start.blend,
    0,
    "A manual selection must morph instead of teleporting",
  );
  for (let frame = 0; frame < 600; frame++)
    manual.update(
      { ...bright, onset: frame % 30 === 0 },
      spectrum,
      1 / 60,
      null,
      false,
      selected,
    );
  assert.equal(
    manual.state.to,
    selected,
    "Peaks must not override a selected figure",
  );
  assert.equal(manual.state.changes, 1);
  assert.equal(manual.state.blend, 1);
  for (let frame = 0; frame < 900; frame++)
    manual.update(bass, spectrum, 1 / 60);
  assert.ok(
    manual.state.changes > 1,
    "Auto must resume music-directed choreography",
  );
}
const queued = new ConstellationDirector();
queued.update(silent, spectrum, 1 / 60, null, false, "Death Star");
assert.equal(
  queued.state.to,
  "Nebula",
  "A selection during silence must wait for audio",
);
queued.update(bass, spectrum, 1 / 60, null, false, "Death Star");
queued.update(bass, spectrum, 1 / 60, null, false, "Nike Swoosh");
assert.equal(
  queued.state.to,
  "Death Star",
  "Finish the current morph before the next selection",
);
for (let frame = 0; frame < 500; frame++)
  queued.update(bass, spectrum, 1 / 60, null, false, "Nike Swoosh");
assert.equal(queued.state.to, "Nike Swoosh");
assert.equal(queued.state.blend, 1);

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
  "Passed: 129 distinct bounded formations across all quality levels, 18 recognizable figures, manual selection and queuing, automatic choreography, musical cues, smooth morphs, no recent repeats, silence freeze, seeking, reduced motion, and frame-rate independence.",
);
