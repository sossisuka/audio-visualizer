import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.env.VISUALIZER_BASE_URL ?? "http://127.0.0.1:43127";
const targets = await (await fetch("http://127.0.0.1:9228/json/list")).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("No browser page available");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
let sequence = 0;
const pending = new Map(),
  consoleErrors = [];
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  if (data.id) {
    const task = pending.get(data.id);
    if (task) {
      pending.delete(data.id);
      data.error ? task.reject(data.error) : task.resolve(data.result);
    }
  }
  if (data.method === "Runtime.exceptionThrown")
    consoleErrors.push(data.params.exceptionDetails);
  if (data.method === "Log.entryAdded" && data.params.entry.level === "error")
    consoleErrors.push(data.params.entry);
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const waitFor = async (expression) => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out: ${expression}`);
};
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const signal = () =>
  evaluate(`({...document.querySelector('.visual-canvas').dataset})`);
const visualPixels = () =>
  evaluate(`(() => {
  const canvas = document.querySelector('.visual-canvas');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let brightPixels = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] > 24 || data[i+1] > 24 || data[i+2] > 24) brightPixels++;
  return brightPixels;
})()`);
const key = async (keyName, code) => {
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: keyName,
    code: keyName,
    windowsVirtualKeyCode: code,
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyName,
    code: keyName,
    windowsVirtualKeyCode: code,
  });
};
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Log.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await cdp("Page.navigate", { url: base });
await waitFor(
  `document.querySelector('.visual-canvas') && document.fonts.status === 'loaded'`,
);
await new Promise((r) => setTimeout(r, 1600));
await mkdir("artifacts", { recursive: true });
const initialSignal = await signal();
if (initialSignal.wavePhase !== "hidden" || (await visualPixels()) !== 0)
  throw new Error("Initial silence must contain no resting wave or particles");
const screenshot = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(`artifacts/${name}.png`, Buffer.from(result.data, "base64"));
};
await screenshot("desktop");
const desktop = await evaluate(
  `({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, dials: document.querySelectorAll('[role=slider]').length, canvas: (()=>{ const r = document.querySelector('.visual-canvas').getBoundingClientRect(); return {width:r.width,height:r.height}; })() })`,
);
await click('[aria-label="Next preset"]');
const preset = await evaluate(
  `document.querySelector('.preset-display>span').textContent`,
);
if (preset !== "Ghost in the signal")
  throw new Error("Preset navigation failed");
await click('[aria-label="Previous preset"]');
await evaluate(
  `document.querySelector('[role=slider][aria-label="Depth"]').focus()`,
);
await cdp("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "ArrowUp",
  code: "ArrowUp",
  windowsVirtualKeyCode: 38,
});
await cdp("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "ArrowUp",
  code: "ArrowUp",
  windowsVirtualKeyCode: 38,
});
const depth = await evaluate(
  `document.querySelector('[role=slider][aria-label="Depth"]').getAttribute('aria-valuenow')`,
);
if (depth !== "51") throw new Error(`Keyboard knob failed: ${depth}`);
await click('input[name="Display"][value="Wave"]');
await screenshot("wave-mode");
await click('input[name="Display"][value="Particle"]');
await click('[aria-label="Play audio"]');
await waitFor(`!!document.querySelector('[aria-label="Pause audio"]')`);
await waitFor(
  `Number(document.querySelector('.visual-canvas').dataset.waveOpacity) > 0 && Number(document.querySelector('.visual-canvas').dataset.waveOpacity) < 1`,
);
const entrySignal = await signal();
await new Promise((r) => setTimeout(r, 1300));
const audioPlaying = await evaluate(
  `document.querySelector('.track-time>span').textContent`,
);
await click('[aria-label="Pause audio"]');
await new Promise((r) => setTimeout(r, 500));
const pausedBefore = await signal();
await new Promise((r) => setTimeout(r, 400));
const pausedAfter = await signal();
if (
  pausedBefore.signalTime !== pausedAfter.signalTime ||
  pausedBefore.strikes !== pausedAfter.strikes
)
  throw new Error(
    "Paused audio must stop particle motion and lightning triggers",
  );
await waitFor(
  `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
);
if ((await visualPixels()) !== 0)
  throw new Error("A paused visualizer must dissolve completely");

// Feed a real decoded WAV through the complete UI → audio graph → analyser → canvas path.
await click('input[name="FX"][value="None"]');
await evaluate(`document.querySelector('input[aria-label="Filter"]').focus()`);
await key("End", 35);
const rate = 48000,
  seconds = 16,
  samples = rate * seconds;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + samples * 2, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const hz = t < 3 ? 80 : t < 6 ? 0 : t < 9 ? 6500 : t < 12 ? 1000 : 0;
  const envelope = Math.min(1, (t % 3) * 50, (3 - (t % 3)) * 50);
  wav.writeInt16LE(
    hz
      ? Math.round(Math.sin(2 * Math.PI * hz * t) * 0.3 * 32767 * envelope)
      : 0,
    44 + i * 2,
  );
}
await writeFile("artifacts/audio-test.wav", wav);
await cdp("DOM.enable");
const doc = await cdp("DOM.getDocument");
const fileNode = await cdp("DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: 'input[type="file"]',
});
await cdp("DOM.setFileInputFiles", {
  nodeId: fileNode.nodeId,
  files: [resolve("artifacts/audio-test.wav")],
});
await waitFor(
  `document.querySelector('.track-name').textContent === 'audio-test' && Number(document.querySelector('.visual-canvas').dataset.bass) > 0.12`,
);
const bassSignal = await signal();
if (+bassSignal.bass <= +bassSignal.mid * 2)
  throw new Error("Uploaded bass must drive the bass response");
await waitFor(
  `document.querySelector('.track-time>span').textContent >= '00:04' && Number(document.querySelector('.visual-canvas').dataset.rms) < 0.003 && document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
);
const silenceSignal = await signal();
if ((await visualPixels()) !== 0)
  throw new Error("Silence inside a playing track must leave no visible wave");
await waitFor(
  `Number(document.querySelector('.visual-canvas').dataset.treble) > 0.035`,
);
const trebleSignal = await signal();
if (+trebleSignal.treble <= +trebleSignal.bass * 2)
  throw new Error("Uploaded treble must drive a distinct frequency response");
await waitFor(
  `document.querySelector('.track-time>span').textContent >= '00:10' && Number(document.querySelector('.visual-canvas').dataset.mid) > 0.07`,
);
const midSignal = await signal();
await evaluate(
  `document.querySelector('[role=slider][aria-label="Output"]').focus()`,
);
await key("Home", 36);
await waitFor(
  `Number(document.querySelector('.visual-canvas').dataset.rms) < 0.002`,
);
const mutedSignal = await signal();
await new Promise((r) => setTimeout(r, 350));
const mutedAfter = await signal();
if (Math.abs(+mutedAfter.signalTime - +mutedSignal.signalTime) > 0.001)
  throw new Error("Muted audio must stop visual motion");
await waitFor(
  `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
);
if ((await visualPixels()) !== 0)
  throw new Error("Mute must dissolve the wave completely");
await click('[aria-label="Pause audio"]');

// A short file ending on an audible tone verifies the actual EOF transition.
const endingRate = 48000,
  endingSeconds = 2.5,
  endingSamples = endingRate * endingSeconds;
const endingWav = Buffer.alloc(44 + endingSamples * 2);
wav.copy(endingWav, 0, 0, 44);
endingWav.writeUInt32LE(36 + endingSamples * 2, 4);
endingWav.writeUInt32LE(endingSamples * 2, 40);
for (let i = 0; i < endingSamples; i++)
  endingWav.writeInt16LE(
    Math.round(Math.sin((2 * Math.PI * 300 * i) / endingRate) * 0.25 * 32767),
    44 + i * 2,
  );
await writeFile("artifacts/ending-test.wav", endingWav);
await evaluate(
  `document.querySelector('[role=slider][aria-label="Output"]').focus()`,
);
await key("End", 35);
await cdp("DOM.setFileInputFiles", {
  nodeId: fileNode.nodeId,
  files: [resolve("artifacts/ending-test.wav")],
});
// Subsequent uploads append to the queue and preserve the current track.
await waitFor(`document.querySelectorAll('.playlist-row').length === 2`);
await click('.playlist-row:last-child .playlist-track');
await waitFor(
  `document.querySelector('.track-name').textContent === 'ending-test' && document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
);
await screenshot("wave-visible");
await waitFor(
  `!!document.querySelector('[aria-label="Pause audio"]') && document.querySelector('.visual-canvas').dataset.wavePhase === 'leaving'`,
);
const endingSignal = await signal();
await screenshot("wave-dissolving");
await waitFor(
  `!!document.querySelector('[aria-label="Play audio"]') && document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
);
const endedSignal = await signal();
if ((await visualPixels()) !== 0)
  throw new Error("Track end must clear all wave particles");
await screenshot("wave-ended");

await click('input[name="Display"][value="Wave"]');
await click('[aria-label="Play audio"]');
await waitFor(
  `document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
);
await click('[aria-label="Pause audio"]');
await waitFor(
  `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
);
if ((await visualPixels()) !== 0)
  throw new Error("Wave mode must not retain a flat line after silence");
await click('[aria-label="Visualizer power"]');
if (
  (await evaluate(
    `document.querySelector('[role=switch]').getAttribute('aria-checked')`,
  )) !== "false"
)
  throw new Error("Power switch failed");
await click('[aria-label="Visualizer power"]');
await click('input[name="FX"][value="Delay"]');
await click('input[name="Quality"][value="Medium"]');
await click('[aria-label="Reset all controls"]');
const reset = await evaluate(
  `({depth:document.querySelector('[role=slider][aria-label="Depth"]').getAttribute('aria-valuenow'),effect:document.querySelector('input[name="FX"]:checked').value})`,
);
if (reset.depth !== "50" || reset.effect !== "Reverb")
  throw new Error("Reset failed");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await new Promise((r) => setTimeout(r, 700));
await screenshot("mobile");
const mobile = await evaluate(
  `({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, canvas: (()=>{const r = document.querySelector('.visual-canvas').getBoundingClientRect();return {width:r.width,height:r.height};})() })`,
);
if (mobile.documentWidth > mobile.width)
  throw new Error("Mobile horizontal overflow");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 320,
  height: 740,
  deviceScaleFactor: 1,
  mobile: true,
});
await new Promise((r) => setTimeout(r, 400));
const narrow = await evaluate(
  `({width:innerWidth,documentWidth:document.documentElement.scrollWidth})`,
);
if (narrow.documentWidth > narrow.width)
  throw new Error("Narrow mobile horizontal overflow");
await screenshot("mobile-small");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 881,
  height: 1566,
  deviceScaleFactor: 1,
  mobile: false,
});
await new Promise((r) => setTimeout(r, 400));
await screenshot("reference-size");
const report = {
  initialSignal,
  entrySignal,
  endingSignal,
  endedSignal,
  desktop,
  mobile,
  narrow,
  preset,
  depth,
  audioPlaying,
  reset,
  pausedBefore,
  pausedAfter,
  bassSignal,
  silenceSignal,
  trebleSignal,
  midSignal,
  mutedSignal,
  mutedAfter,
  consoleErrors,
};
await writeFile(
  "artifacts/browser-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await cdp("Page.navigate", { url: base });
await waitFor(
  `!!document.querySelector('[aria-label="Play audio"]') && document.querySelector('.visual-canvas').dataset.signalTime !== undefined`,
);
await click('[aria-label="Play audio"]');
await waitFor(`!!document.querySelector('[aria-label="Pause audio"]')`);
await new Promise((r) => setTimeout(r, 400));
await screenshot("desktop-playing");
await click('[aria-label="Pause audio"]');
socket.close();
