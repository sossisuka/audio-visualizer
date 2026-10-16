import assert from "node:assert/strict";
import { AudioAnalysis } from "../src/lib/audio-analysis";

const sampleRate = 48000,
  fftSize = 2048;
function tone(hz: number, amplitude = 0.3) {
  const spectrum = new Uint8Array(1024);
  const center = Math.round(hz / (sampleRate / fftSize));
  for (let offset = -2; offset <= 2; offset++)
    spectrum[center + offset] = Math.round(230 * (1 - Math.abs(offset) * 0.3));
  const waveform = Uint8Array.from({ length: 2048 }, (_, i) =>
    Math.round(
      128 + Math.sin(((i * hz) / sampleRate) * Math.PI * 2) * 127 * amplitude,
    ),
  );
  return { spectrum, waveform };
}
function measure(hz: number, amplitude = 0.3) {
  const analysis = new AudioAnalysis(),
    { spectrum, waveform } = tone(hz, amplitude);
  let result;
  for (let i = 0; i < 60; i++)
    result = analysis.update(
      spectrum,
      waveform,
      sampleRate,
      fftSize,
      true,
      1 / 60,
    );
  return result!;
}
const bass = measure(80),
  mid = measure(1000),
  treble = measure(7000);
assert.ok(
  bass.bass > bass.mid * 5 && bass.bass > bass.treble * 5,
  "Bass must activate the bass band",
);
assert.ok(
  mid.mid > mid.bass * 5 && mid.mid > mid.treble * 5,
  "Mid tone must activate the mid band",
);
assert.ok(
  treble.treble > treble.bass * 5 && treble.treble > treble.mid * 5,
  "High tone must activate the treble band",
);
assert.ok(
  measure(1000, 0.05).rms < mid.rms * 0.25,
  "Visual envelope must track actual signal volume",
);
const analysis = new AudioAnalysis(),
  { spectrum, waveform } = tone(80);
let onsets = 0;
for (let i = 0; i < 120; i++)
  if (
    analysis.update(spectrum, waveform, sampleRate, fftSize, true, 1 / 60).onset
  )
    onsets++;
assert.equal(
  onsets,
  1,
  "A sustained tone must not produce timer-driven beat events",
);
let stopped;
for (let i = 0; i < 180; i++)
  stopped = analysis.update(
    spectrum,
    waveform,
    sampleRate,
    fftSize,
    false,
    1 / 60,
  );
assert.ok(
  !stopped!.active &&
    stopped!.rms < 0.00001 &&
    stopped!.bass < 0.00001 &&
    !stopped!.onset,
  "Pause must release the envelope and stop new events",
);
const silence = new AudioAnalysis().update(
  new Uint8Array(1024),
  new Uint8Array(2048).fill(128),
  sampleRate,
  fftSize,
  true,
  1 / 60,
);
const quietWaveform = Float32Array.from(
  { length: 2048 },
  (_, i) => Math.sin(i * 0.13) * 0.0018,
);
const quiet = new AudioAnalysis().update(
  new Uint8Array(1024),
  quietWaveform,
  sampleRate,
  fftSize,
  true,
  1 / 60,
);
assert.ok(
  quiet.rawRms > 0.001 && quiet.active,
  "Quiet audio below byte quantization must remain detectable with float samples",
);
assert.ok(
  !silence.active && silence.rms === 0 && !silence.onset,
  "Silent playback must not synthesize visual energy",
);
console.log(
  "Passed: frequency isolation, volume response, transient detection, sustained tone, pause release, and silence.",
);
