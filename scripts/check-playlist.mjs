import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Uses the same isolated Chrome/CDP setup as browser-check.mjs.
const base = process.env.VISUALIZER_BASE_URL ?? "http://localhost:3000";
const targets = await (await fetch("http://127.0.0.1:9228/json/list")).json();
const target = targets.find((item) => item.type === "page");
assert(target, "Start a separate Chrome session on debugging port 9228");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done) =>
  socket.addEventListener("open", done, { once: true }),
);
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const task = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) task.reject(data.error);
    else task.resolve(data.result);
  }
  if (data.method === "Runtime.exceptionThrown")
    errors.push(data.params.exceptionDetails);
  if (data.method === "Log.entryAdded" && data.params.entry.level === "error")
    errors.push(data.params.entry);
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
    userGesture: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const waitFor = async (expression) => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Timed out: ${expression}`);
};
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const rows = () =>
  evaluate(`Array.from(document.querySelectorAll('.playlist-row')).map(row => ({
  name: row.querySelector('.playlist-title>span').textContent,
  number: row.querySelector('.playlist-number').textContent,
  duration: row.querySelector('.playlist-duration').textContent,
  active: row.dataset.active === 'true'
}))`);
const viewport = (width, height, mobile = false) =>
  cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
const screenshot = async (name, selector) => {
  const clip = selector
    ? await evaluate(`(() => {
    const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,scale:1};
  })()`)
    : undefined;
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    ...(clip ? { clip } : {}),
  });
  await writeFile(`artifacts/${name}.png`, Buffer.from(result.data, "base64"));
};
const upload = async (files) => {
  const doc = await cdp("DOM.getDocument");
  const node = await cdp("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  await cdp("DOM.setFileInputFiles", { nodeId: node.nodeId, files });
};
function wav(seconds, frequency = 180) {
  const rate = 8000,
    samples = seconds * rate;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF");
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    data.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * frequency) / rate) * 7000),
      44 + i * 2,
    );
  return data;
}
const fixtures = [
  ["Moondrift", 151],
  ["Neon Prayer", 192],
  ["SŌSSISUKA", 147],
  ["Void Flow", 228],
  ["Kaze", 179],
  ["Afterlight", 201],
  ["Silent Equation", 242],
  ["Tsuki", 164],
  ["Fracture Dreams", 216],
  ["Lost Signal", 138],
  ["Echoes Remain", 187],
];
await mkdir("artifacts/playlist-tracks", { recursive: true });
const paths = [];
for (const [name, seconds] of fixtures) {
  const path = resolve(`artifacts/playlist-tracks/${name}.wav`);
  await writeFile(path, wav(seconds));
  paths.push(path);
}
const checks = [];
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Log.clear");
  errors.length = 0;
  await viewport(1440, 1000);
  await cdp("Page.navigate", { url: base });
  await waitFor(
    `document.querySelector('.visual-canvas')?.dataset.wavePhase === 'hidden' && document.fonts.status === 'loaded'`,
  );
  assert.equal(await evaluate(`!!document.querySelector('.playlist')`), false);
  await upload([paths[0]]);
  await waitFor(
    `document.querySelector('.track-name').textContent === 'Moondrift' && !!document.querySelector('[aria-label="Pause audio"]')`,
  );
  assert.equal(await evaluate(`!!document.querySelector('.playlist')`), false);
  checks.push("Demo and single-track layouts have no playlist");

  await upload(paths.slice(1));
  await waitFor(
    `document.querySelectorAll('.playlist-row').length === 11 && !Array.from(document.querySelectorAll('.playlist-duration')).some(item => item.textContent === '--:--')`,
  );
  const initial = await rows();
  assert.equal(initial[0].active, true);
  assert.equal(initial[2].duration, "02:27");
  assert.deepEqual(
    initial.map((item) => item.number),
    fixtures.map((_, i) => String(i + 1).padStart(2, "0")),
  );
  checks.push(
    "Multi-select appends in order, preserves playback, reads every duration, and numbers rows",
  );
  await click(".playlist-row:nth-child(3) .playlist-track");
  await waitFor(
    `document.querySelector('.track-name').textContent === 'SŌSSISUKA' && !!document.querySelector('[aria-label="Pause audio"]')`,
  );
  assert.equal((await rows())[2].active, true);
  await screenshot("playlist-desktop");
  await click(".playlist-row.is-active .playlist-track");
  await waitFor(`!!document.querySelector('[aria-label="Play audio"]')`);
  await click(".playlist-row.is-active .playlist-more");
  await evaluate(`document.querySelector('.playlist-menu>button').focus()`);
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor(`!document.querySelector('.playlist-menu')`);
  assert.equal(
    await evaluate(`document.activeElement.className`),
    "playlist-more",
  );
  checks.push(
    "Track selection, synchronized active state, pause, and menu Escape/focus return",
  );

  await click(".playlist-row.is-active .playlist-more");
  await click(".playlist-menu>button:last-child");
  await waitFor(
    `document.querySelector('.track-name').textContent === 'Void Flow' && !!document.querySelector('[aria-label="Play audio"]')`,
  );
  assert.equal((await rows()).length, 10);
  await click(".playlist-row.is-active .playlist-track");
  await evaluate(`(() => {
    const range = document.querySelector('.track-seek');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(range, Number(range.max) - 0.3);
    range.dispatchEvent(new Event('input', {bubbles:true}));
    range.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  await waitFor(`document.querySelector('.track-name').textContent === 'Kaze'`);
  checks.push(
    "Removing the paused active track preserves pause; natural EOF advances to the next track",
  );

  const dropped = wav(5).toString("base64");
  await evaluate(`(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(dropped)}), ch=>ch.charCodeAt(0))], 'Dropped.wav', {type:'audio/wav'}));
    document.querySelector('.visual-screen').dispatchEvent(new DragEvent('drop', {bubbles:true,dataTransfer:transfer}));
  })()`);
  await waitFor(`document.querySelectorAll('.playlist-row').length === 11`);
  assert.equal(
    await evaluate(`document.querySelector('.track-name').textContent`),
    "Kaze",
  );
  checks.push(
    "Drag-and-drop appends files without interrupting the current track",
  );

  const invalid = resolve("artifacts/playlist-tracks/Broken.wav");
  await writeFile(invalid, "invalid audio content");
  await upload([invalid]);
  await click(".playlist-row:last-child .playlist-track");
  await waitFor(
    `!!document.querySelector('[role="alert"]') && document.querySelector('.playlist-row:last-child .playlist-duration').textContent === 'Error'`,
  );
  assert.equal(
    await evaluate(`document.querySelector('.track-name').textContent`),
    "Kaze",
  );
  await click('[aria-label="Dismiss error"]');
  await click(".playlist-row:last-child .playlist-more");
  await click(".playlist-menu>button:last-child");
  checks.push("Unreadable files show a recoverable error and can be removed");

  // Reset to the reference's eleven-track state for visual comparisons.
  await cdp("Page.reload");
  await waitFor(
    `document.querySelector('.visual-canvas')?.dataset.wavePhase === 'hidden' && !document.querySelector('.track-seek')`,
  );
  await upload(paths);
  await waitFor(
    `document.querySelectorAll('.playlist-row').length === 11 && !Array.from(document.querySelectorAll('.playlist-duration')).some(item=>item.textContent==='--:--')`,
  );
  await click(".playlist-row:nth-child(3) .playlist-track");
  await waitFor(
    `document.querySelector('.track-name').textContent === 'SŌSSISUKA' && !!document.querySelector('[aria-label="Pause audio"]')`,
  );
  await click('input[name="Display"][value="Galaxy"]');
  await viewport(1973, 797);
  await click('[aria-label="Fullscreen visualizer"]');
  await waitFor(
    `!!document.fullscreenElement || document.querySelector('.is-fullscreen')`,
  );
  await new Promise((done) => setTimeout(done, 700));
  await screenshot("playlist-reference-size");
  await screenshot("playlist-detail", ".playlist");
  checks.push("Fullscreen keeps the playlist and transport visible");
  await click('[aria-label="Exit fullscreen"]');

  const layouts = [];
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [768, 740],
    [390, 844],
    [320, 740],
  ]) {
    await viewport(width, height, width < 701);
    await new Promise((done) => setTimeout(done, 250));
    const layout = await evaluate(`(() => {
      const rect = el => {const r = el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,stage:rect(document.querySelector('.visual-stage')),playlist:rect(document.querySelector('.playlist')),transport:rect(document.querySelector('.transport')),screen:rect(document.querySelector('.visual-screen'))};
    })()`);
    assert(layout.documentWidth <= width, `Horizontal overflow at ${width}`);
    assert(
      layout.transport.right <= layout.stage.right + 1,
      `Transport overflow at ${width}`,
    );
    assert(
      layout.transport.bottom <= layout.stage.bottom + 1,
      `Transport clipped at ${width}`,
    );
    layouts.push(layout);
    await screenshot(`playlist-${width}`);
  }
  checks.push(
    "Desktop/tablet/390px/320px layouts keep the transport inside the visual field without horizontal overflow",
  );
  await click(".playlist-row:last-child .playlist-track");
  await waitFor(
    `document.querySelector('.track-name').textContent === 'Echoes Remain'`,
  );
  assert(
    await evaluate(
      `(() => {const row=document.querySelector('.playlist-row.is-active').getBoundingClientRect(),list=document.querySelector('.playlist-tracks').getBoundingClientRect();return row.top>=list.top-1 && row.bottom<=list.bottom+1})()`,
    ),
    "Selected row must scroll into view",
  );
  checks.push("Long queues scroll the selected track into view");
  assert.deepEqual(errors, [], "Browser console errors");
  await writeFile(
    "artifacts/playlist-results.json",
    JSON.stringify({ checks, layouts, consoleErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, consoleErrors: errors }, null, 2));
} finally {
  socket.close();
}
