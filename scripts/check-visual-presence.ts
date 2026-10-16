import assert from "node:assert/strict";
import { VisualPresence, fragmentVisibility } from "../src/lib/visual-presence";

function advance(
  presence: VisualPresence,
  seconds: number,
  level: number,
  playing = true,
  remaining: number | null = null,
  rate = 60,
) {
  for (let i = 0; i < Math.ceil(seconds * rate); i++)
    presence.update(level, playing, 1 / rate, remaining);
  return presence.state;
}
const presence = new VisualPresence(false, () => 0.37);
assert.equal(
  advance(presence, 2, 0).opacity,
  0,
  "An initially silent player must not draw a resting wave",
);
assert.equal(presence.state.phase, "hidden");
const appearing = advance(presence, 0.15, 0.1);
assert.ok(
  appearing.opacity > 0 && appearing.opacity < 0.8,
  "Audio must bring the wave in progressively",
);
assert.equal(advance(presence, 0.4, 0.1).opacity, 1);
assert.equal(
  advance(presence, 0.08, 0).opacity,
  1,
  "Short musical gaps must not flicker the visual gate",
);
assert.equal(
  advance(presence, 0.2, 0.0007).opacity,
  1,
  "Hysteresis must preserve a quiet signal between thresholds",
);
const disappearing = advance(presence, 0.4, 0);
assert.equal(disappearing.phase, "leaving");
assert.ok(
  disappearing.opacity > 0 && disappearing.opacity < 1,
  "Silence must dissolve the visible wave",
);
assert.ok(
  fragmentVisibility(disappearing.opacity, 0.1) >
    fragmentVisibility(disappearing.opacity, 0.9),
  "Fragments must disappear in a staggered order",
);
assert.equal(
  advance(presence, 1.1, 0).opacity,
  0,
  "A completed fade must reach exact zero",
);
assert.equal(presence.state.phase, "hidden");
for (const order of [0, 0.2, 0.5, 0.99])
  assert.equal(fragmentVisibility(0, order), 0);

advance(presence, 0.5, 0.1);
const pauseFade = advance(presence, 0.2, 0, false);
assert.ok(
  pauseFade.opacity > 0 && pauseFade.opacity < 1,
  "Pause must begin a fade rather than cut the wave",
);
const recoveryStart = pauseFade.opacity;
const recovered = presence.update(0.1, true, 1 / 60);
assert.ok(
  recovered.opacity >= recoveryStart && recovered.opacity < 1,
  "Resuming during a fade must reverse smoothly",
);
advance(presence, 0.5, 0.1);
presence.update(0.1, true, 1 / 60, 0.65);
assert.equal(
  presence.state.phase,
  "leaving",
  "Known track endings should begin the visual fade before EOF",
);
assert.equal(
  advance(presence, 0.8, 0.1, true, 0.1).opacity,
  0,
  "An ending must not repeatedly restart the visual",
);

const at24 = new VisualPresence(),
  at60 = new VisualPresence();
advance(at24, 0.5, 0.1, true, null, 24);
advance(at60, 0.5, 0.1, true, null, 60);
const a = advance(at24, 0.5, 0, false, null, 24),
  b = advance(at60, 0.5, 0, false, null, 60);
assert.ok(
  Math.abs(a.opacity - b.opacity) < 0.03,
  "Fade timing must be independent of frame rate",
);
const reduced = new VisualPresence(true);
assert.equal(advance(reduced, 0.3, 0.1).opacity, 1);
assert.equal(advance(reduced, 0.4, 0, false).opacity, 0);
console.log(
  "Passed: initial silence, progressive entry, silence hold, hysteresis, staggered dissolution, exact-zero cleanup, pause/resume, predicted EOF, frame-rate independence, and reduced motion.",
);
