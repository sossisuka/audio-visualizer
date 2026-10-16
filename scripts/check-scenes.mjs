import { mkdir, writeFile } from "node:fs/promises";

const targets = await (await fetch("http://127.0.0.1:9228/json/list")).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("Start Chrome with remote debugging on port 9228");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
let id = 0;
const pending = new Map(),
  errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    if (task) {
      pending.delete(message.id);
      message.error ? task.reject(message.error) : task.resolve(message.result);
    }
  }
  if (message.method === "Runtime.exceptionThrown")
    errors.push(message.params.exceptionDetails);
  if (
    message.method === "Log.entryAdded" &&
    message.params.entry.level === "error"
  )
    errors.push(message.params.entry);
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const sequence = ++id;
    pending.set(sequence, { resolve, reject });
    socket.send(JSON.stringify({ id: sequence, method, params }));
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (expression) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${expression}`);
};
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const canvasStats = () =>
  evaluate(`(() => {
  const canvas = document.querySelector('.visual-canvas');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let bright = 0, colored = 0, difference = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 24) bright++;
    if (data[i] !== data[i+1] || data[i] !== data[i+2]) colored++;
    if (window.__scenePixels && Math.abs(data[i] - window.__scenePixels[i]) > 12) difference++;
  }
  window.__scenePixels = data;
  return {bright, colored, difference, ...canvas.dataset};
})()`);
const screenshot = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    `artifacts/scene-${name}.png`,
    Buffer.from(result.data, "base64"),
  );
};
try {
  await mkdir("artifacts", { recursive: true });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.navigate", { url: "http://127.0.0.1:43127" });
  await waitFor(
    `document.querySelectorAll('.scene-choice').length === 12 && document.fonts.status === 'loaded' && document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
  );
  const report = { scenes: [], mobile: [], errors };
  const modes = await evaluate(
    `Array.from(document.querySelectorAll('.scene-choice input'), e => e.value)`,
  );
  for (const mode of modes) {
    await click(`input[name="Display"][value="${mode}"]`);
    if ((await canvasStats()).bright !== 0)
      throw new Error(
        `${mode}: changing a scene in silence must not create idle art`,
      );
    await click('[aria-label="Play audio"]');
    await waitFor(
      `document.querySelector('.visual-canvas').dataset.scene === ${JSON.stringify(mode)} && document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
    );
    await sleep(700);
    const before = await canvasStats();
    const intervals = await evaluate(`new Promise(resolve => {
      const times = []; let last = performance.now();
      const frame = now => { times.push(now - last); last = now;
        if (times.length === 30) resolve(times); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    })`);
    const after = await canvasStats();
    if (before.bright < 150 || after.bright < 150)
      throw new Error(`${mode}: no visible composition`);
    if (before.colored || after.colored)
      throw new Error(`${mode}: must remain monochrome`);
    if (
      after.difference < 80 ||
      Number(after.signalTime) <= Number(before.signalTime)
    )
      throw new Error(`${mode}: animation did not advance with audio`);
    if (
      ["Orbit", "Senbonzakura"].includes(mode) &&
      Number(after.emittedParticles) === 0
    )
      throw new Error(`${mode}: no emitted particles`);
    const png = await evaluate(
      `document.querySelector('.visual-canvas').toDataURL('image/png').split(',')[1]`,
    );
    await writeFile(
      `artifacts/scene-canvas-${mode.toLowerCase()}.png`,
      Buffer.from(png, "base64"),
    );
    if (["Orbit", "Senbonzakura"].includes(mode))
      await screenshot(mode.toLowerCase());
    await click('[aria-label="Pause audio"]');
    await waitFor(
      `document.querySelector('.visual-canvas').dataset.wavePhase === 'leaving'`,
    );
    const exit = await canvasStats();
    await waitFor(
      `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
    );
    const hidden = await canvasStats();
    if (hidden.bright !== 0)
      throw new Error(`${mode}: residual art remains after stopping`);
    const sorted = intervals.slice(1).sort((a, b) => a - b);
    report.scenes.push({
      mode,
      brightPixels: after.bright,
      changedPixels: after.difference,
      emittedParticles: after.emittedParticles,
      exitOpacity: exit.waveOpacity,
      hiddenPixels: hidden.bright,
      medianFrameMs: sorted[Math.floor(sorted.length / 2)],
    });
    console.log(JSON.stringify(report.scenes.at(-1)));
  }
  // Native radios support arrow-key scene selection without interrupting playback.
  await click('input[name="Display"][value="Orbit"]');
  await evaluate(
    `document.querySelector('input[name="Display"][value="Orbit"]').focus()`,
  );
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  const keyboardMode = await evaluate(
    `document.querySelector('input[name="Display"]:checked').value`,
  );
  if (keyboardMode !== "Senbonzakura")
    throw new Error("Scene picker arrow-key navigation failed");
  for (const width of [390, 320]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await click('input[name="Display"][value="Senbonzakura"]');
    await click('[aria-label="Play audio"]');
    await waitFor(
      `document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
    );
    await sleep(450);
    if (width === 390) {
      const before = await evaluate(
        `Number(document.querySelector('.visual-canvas').dataset.signalTime)`,
      );
      await click('input[name="Display"][value="Orbit"]');
      await waitFor(
        `document.querySelector('.visual-canvas').dataset.scene === 'Orbit'`,
      );
      await click('input[name="Display"][value="Senbonzakura"]');
      await waitFor(
        `document.querySelector('.visual-canvas').dataset.scene === 'Senbonzakura'`,
      );
      const after = await evaluate(
        `Number(document.querySelector('.visual-canvas').dataset.signalTime)`,
      );
      if (
        after <= before ||
        !(await evaluate(
          `!!document.querySelector('[aria-label="Pause audio"]')`,
        ))
      )
        throw new Error("Switching scenes interrupted playback");
    }
    const layout = await evaluate(
      `({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, choices: Array.from(document.querySelectorAll('.scene-tile')).map(e => ({width:e.clientWidth, height:e.clientHeight, overflow:e.scrollWidth>e.clientWidth})) })`,
    );
    if (
      layout.documentWidth > width ||
      layout.choices.some((e) => e.overflow || e.height < 44)
    )
      throw new Error(
        `${width}px: scene picker overflow or insufficient touch target`,
      );
    report.mobile.push(layout);
    await screenshot(`mobile-${width}`);
    await click('[aria-label="Pause audio"]');
    await waitFor(
      `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
    );
  }
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await cdp("Page.navigate", { url: "http://127.0.0.1:43127" });
  await waitFor(
    `document.querySelector('.visual-canvas') && document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
  );
  await click('[aria-label="Play audio"]');
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
  );
  await click('[aria-label="Pause audio"]');
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
  );
  if ((await canvasStats()).bright !== 0)
    throw new Error("Reduced-motion scene did not clear");
  await cdp("Emulation.setEmulatedMedia", { features: [] });
  if (errors.length) throw new Error(JSON.stringify(errors));
  await writeFile(
    "artifacts/scene-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Passed: 12 distinct scenes, live animation, emitted particles, exact-zero silence, monochrome, keyboard selection, mobile, and reduced motion.",
  );
} finally {
  socket.close();
}
