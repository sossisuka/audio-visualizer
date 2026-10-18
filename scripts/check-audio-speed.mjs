import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir("artifacts", { recursive: true });
execFileSync("bun", [
  "build",
  "src/lib/audio-engine.ts",
  "--target",
  "browser",
  "--outfile",
  "artifacts/audio-speed-engine.js",
]);
const moduleUrl = `data:text/javascript;base64,${(await readFile("artifacts/audio-speed-engine.js")).toString("base64")}`;
const targets = await (await fetch("http://127.0.0.1:9228/json/list")).json();
const target = targets.find((item) => item.type === "page");
assert(target, "Start isolated Chrome on debugging port 9228");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done) =>
  socket.addEventListener("open", done, { once: true }),
);
let id = 0;
const pending = new Map(),
  errors = [];
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
    pending.set(++id, { resolve, reject });
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
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out: ${expression}`);
};
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const setRange = (selector, value) =>
  evaluate(`(() => {
  const range=document.querySelector(${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(range,${value});
  range.dispatchEvent(new Event('input',{bubbles:true}));range.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
const upload = async (paths) => {
  const doc = await cdp("DOM.getDocument");
  const node = await cdp("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  await cdp("DOM.setFileInputFiles", { nodeId: node.nodeId, files: paths });
};
const screenshot = async (name) => {
  const capture = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(`artifacts/${name}.png`, Buffer.from(capture.data, "base64"));
};
function wav(seconds) {
  const rate = 8000,
    samples = seconds * rate,
    data = Buffer.alloc(44 + samples * 2);
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
      Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * 8000),
      44 + i * 2,
    );
  return data;
}
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Log.clear");
  errors.length = 0;
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.navigate", {
    url: process.env.VISUALIZER_BASE_URL ?? "http://localhost:3000",
  });
  await waitFor(
    `document.querySelector('.visual-canvas')?.dataset.wavePhase === 'hidden'`,
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('[aria-label="Slow constellation motion"]')`,
    ),
    false,
  );

  // Effects combine, can be removed independently, and retain native keyboard behavior.
  const selectedEffects = () =>
    evaluate(
      `Array.from(document.querySelectorAll('input[name="FX"]:checked'),input=>input.value)`,
    );
  assert(
    await evaluate(
      `Array.from(document.querySelectorAll('input[name="FX"]')).every(input=>input.type==='checkbox')`,
    ),
  );
  assert.deepEqual(await selectedEffects(), ["Reverb"]);
  for (const effect of ["Delay", "Distort", "Chorus", "Flanger", "Phaser"])
    await click(`input[name="FX"][value="${effect}"]`);
  assert.deepEqual(await selectedEffects(), [
    "Reverb",
    "Delay",
    "Distort",
    "Chorus",
    "Flanger",
    "Phaser",
  ]);
  await click('input[name="FX"][value="Chorus"]');
  assert.deepEqual(await selectedEffects(), [
    "Reverb",
    "Delay",
    "Distort",
    "Flanger",
    "Phaser",
  ]);
  await click('input[name="FX"][value="None"]');
  assert.deepEqual(await selectedEffects(), ["None"]);
  await evaluate(
    `document.querySelector('input[name="FX"][value="Delay"]').focus()`,
  );
  for (const type of ["keyDown", "keyUp"])
    await cdp("Input.dispatchKeyEvent", {
      type,
      key: " ",
      code: "Space",
      windowsVirtualKeyCode: 32,
    });
  assert.deepEqual(await selectedEffects(), ["Delay"]);
  await click('input[name="FX"][value="Delay"]');
  assert.deepEqual(await selectedEffects(), ["None"]);
  await click('input[name="Quality"][value="Low"]');
  await click('input[name="Quality"][value="Medium"]');
  assert.equal(
    await evaluate(
      `document.querySelectorAll('input[name="Quality"]:checked').length`,
    ),
    1,
  );
  await click('[aria-label="Reset all controls"]');
  assert.deepEqual(await selectedEffects(), ["Reverb"]);

  const layouts = [];
  for (const [width, height] of [
    [1440, 1000],
    [1366, 768],
    [1024, 600],
    [768, 600],
    [390, 844],
    [320, 740],
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 700,
    });
    await new Promise((done) => setTimeout(done, 150));
    const layout = await evaluate(`(() => {
      const control=document.querySelector('.audio-speed-control').getBoundingClientRect(),rail=document.querySelector('.left-rail').getBoundingClientRect(),screen=document.querySelector('.visual-screen').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,controlBottom:control.bottom,railBottom:rail.bottom,documentHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,insideRail:control.left>=rail.left-1&&control.right<=rail.right+1&&control.bottom<=rail.bottom+1,outsideScreen:control.right<=screen.left||control.left>=screen.right||control.top>=screen.bottom||control.bottom<=screen.top,onDisplay:!!document.querySelector('.visual-screen .audio-speed-control')};
    })()`);
    assert(
      layout.insideRail &&
        layout.outsideScreen &&
        !layout.onDisplay &&
        !layout.overflow,
      JSON.stringify(layout),
    );
    if (width > 700)
      assert(layout.documentHeight <= height + 1, JSON.stringify(layout));
    layouts.push(layout);
  }
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Check actual Web Audio output, transport accounting, pause/seek, and EOF.
  const engine = await evaluate(`(async () => {
    const {AudioEngine}=await import(${JSON.stringify(moduleUrl)});
    const engine=new AudioEngine(), sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const require=(condition,message)=>{if(!condition)throw new Error(message)};
    try {
      await engine.context.resume();
      engine.setDrive(18);const driveCurve=engine.drive.curve[700];
      engine.setEffects(['Reverb','Delay','Distort','Chorus','Flanger','Phaser'],60);
      await sleep(220);
      require(engine.wet.gain.value>.05&&engine.reverbGain.gain.value>.05&&engine.modulation.every(branch=>branch.wet.gain.value>.05),'All selected effects must have simultaneous independent audio paths');
      require(engine.drive.curve[700]>driveCurve,'Distort must combine with wet effects');
      engine.setEffects(['Reverb','Delay'],60);await sleep(220);
      require(engine.wet.gain.value>.05&&engine.reverbGain.gain.value>.05&&engine.modulation.every(branch=>branch.wet.gain.value<.001),'Removing modulation must preserve Reverb and Delay');
      require(Math.abs(engine.drive.curve[700]-driveCurve)<.00001,'Removing Distort must preserve the Drive dial');
      engine.setDrive(0);
      const burst=engine.context.createBuffer(1,Math.floor(engine.context.sampleRate*.04),engine.context.sampleRate),burstData=burst.getChannelData(0);
      for(let i=0;i<burstData.length;i++)burstData[i]=Math.sin(i*2*Math.PI*440/burst.sampleRate)*.25;
      engine.buffer=burst;await engine.play();await sleep(350);
      const rms=()=>{const data=new Float32Array(2048);engine.analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length)};
      const effectsTail=rms();require(!engine.isPlaying&&effectsTail>.001,'Combined effects must produce audible output after the dry burst ends');
      engine.setEffects([],60);await sleep(300);const bypassRms=rms();
      require(bypassRms<.0001&&engine.drive.curve===null,'None must silence effect tails and disable distortion when Drive is zero');
      engine.setEffect('None',0);engine.setDrive(0);engine.setFilter(100);
      const buffer=engine.context.createBuffer(1,engine.context.sampleRate*8,engine.context.sampleRate),samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i*2*Math.PI*440/buffer.sampleRate)*.25;
      engine.buffer=buffer;
      const frequency=()=>{const data=new Float32Array(2048);engine.analyser.getFloatTimeDomainData(data);let crosses=0;for(let i=1;i<data.length;i++)if(data[i-1]<=0&&data[i]>0)crosses++;return crosses*engine.context.sampleRate/data.length};
      const progress=async()=>{const a=engine.context.currentTime,p=engine.currentTime;await sleep(400);return (engine.currentTime-p)/(engine.context.currentTime-a)};
      engine.setPlaybackRate(.5);await engine.play();await sleep(200);
      const halfProgress=await progress(),halfHz=frequency(),before=engine.currentTime,source=engine.source;
      engine.setPlaybackRate(2);
      require(Math.abs(engine.currentTime-before)<.03,'Changing rate must not jump the playhead');
      require(engine.source===source,'Changing a loaded track rate must keep the same source');
      await sleep(200);const doubleProgress=await progress(),doubleHz=frequency();
      require(Math.abs(halfProgress-.5)<.05&&Math.abs(doubleProgress-2)<.05,'Playhead must follow actual source speed');
      require(halfHz>170&&halfHz<270&&doubleHz>800&&doubleHz<960,'Audible signal must actually slow down and speed up');
      engine.pause();const paused=engine.currentTime;engine.setPlaybackRate(.75);await sleep(150);
      require(!engine.isPlaying&&engine.currentTime===paused,'Changing speed while paused must not start playback');
      engine.seek(4);require(engine.currentTime===4,'Paused seeking uses source seconds');
      require(Math.abs(engine.remainingTime-4/.75)<.01,'Remaining wall time must account for rate');
      await engine.play();const resumedProgress=await progress();
      require(Math.abs(resumedProgress-.75)<.05,'Resume must preserve rate');
      engine.pause();engine.seek(7.8);engine.setPlaybackRate(2);let endings=0;engine.onEnded=()=>endings++;
      await engine.play();await sleep(250);
      require(endings===1&&!engine.isPlaying&&engine.currentTime===0,'Natural EOF must fire once at adjusted speed');
      engine.clear();engine.setPlaybackRate(.5);await engine.play();const demoHalf=await progress();
      const demoPosition=engine.currentTime;engine.setPlaybackRate(2);
      require(engine.isPlaying&&Math.abs(engine.currentTime-demoPosition)<.03,'Demo speed change must preserve playback position');
      const demoDouble=await progress();
      require(Math.abs(demoHalf-.5)<.05&&Math.abs(demoDouble-2)<.05,'Synthesized demo must follow audio speed');
      return {halfProgress,doubleProgress,halfHz,doubleHz,resumedProgress,demoHalf,demoDouble,endings,effectsTail,bypassRms};
    } finally {engine.dispose()}
  })()`);

  // Exercise the user-facing slider, playlist persistence, reset, and layout.
  await setRange('[aria-label="Audio speed"]', 0.5);
  await click('[aria-label="Play audio"]');
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
  );
  await click('[aria-label="Pause audio"]');
  const first = resolve("artifacts/audio-speed-first.wav"),
    next = resolve("artifacts/audio-speed-next.wav");
  await writeFile(first, wav(16));
  await writeFile(next, wav(16));
  await upload([first, next]);
  await waitFor(
    `document.querySelector('.track-name').textContent==='audio-speed-first' && !!document.querySelector('.track-seek') && !document.querySelector('.play-button').disabled`,
  );
  const position = () =>
    evaluate(`Number(document.querySelector('.track-seek').value)`);
  await new Promise((done) => setTimeout(done, 300));
  const halfStart = await position();
  await new Promise((done) => setTimeout(done, 1400));
  const halfDelta = (await position()) - halfStart;
  assert(
    halfDelta > 0.45 && halfDelta < 1,
    `Half-speed UI progress: ${halfDelta}`,
  );
  await setRange('[aria-label="Audio speed"]', 2);
  const fastStart = await position();
  await new Promise((done) => setTimeout(done, 1400));
  const fastDelta = (await position()) - fastStart;
  assert(
    fastDelta > 2.1 && fastDelta < 3.5,
    `Double-speed UI progress: ${fastDelta}`,
  );
  await click('[aria-label="Pause audio"]');
  await setRange('[aria-label="Audio speed"]', 1.5);
  assert(
    await evaluate(`!!document.querySelector('[aria-label="Play audio"]')`),
  );
  await setRange('[aria-label="Playback position"]', 15.8);
  await click('[aria-label="Play audio"]');
  await waitFor(
    `document.querySelector('.track-name').textContent==='audio-speed-next'`,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1.5",
  );
  await click('input[name="Display"][value="Constellation"]');
  await click('input[name="FX"][value="Delay"]');
  await click('input[name="FX"][value="Chorus"]');
  assert.deepEqual(await selectedEffects(), ["Reverb", "Delay", "Chorus"]);
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1.5",
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('[aria-label="Slow constellation motion"]')`,
    ),
    false,
  );
  await screenshot("audio-speed-desktop");
  await click('[aria-label="Reset audio speed"]');
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1",
  );
  await setRange('[aria-label="Audio speed"]', 0.75);
  await click('[aria-label="Reset all controls"]');
  assert.deepEqual(await selectedEffects(), ["Reverb"]);
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1",
  );
  for (const width of [390, 320]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await new Promise((done) => setTimeout(done, 150));
    assert(
      await evaluate(
        `(() => {const s=document.querySelector('.left-rail').getBoundingClientRect(),c=document.querySelector('.audio-speed-control').getBoundingClientRect();return c.left>=s.left&&c.right<=s.right&&!document.querySelector('.visual-screen [aria-label="Audio speed"]')&&document.documentElement.scrollWidth<=innerWidth})()`,
      ),
    );
    await screenshot(`audio-speed-${width}`);
  }
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('[aria-label="Fullscreen visualizer"]');
  await waitFor(
    `!!document.fullscreenElement || !!document.querySelector('.is-fullscreen')`,
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('.visual-screen [aria-label="Audio speed"]')`,
    ),
    false,
  );
  await click('[aria-label="Exit fullscreen"]');
  assert.deepEqual(errors, []);
  const report = {
    engine,
    layouts,
    multipleEffects: true,
    keyboardSelection: true,
    audioSpeedOutsideDisplay: true,
    halfDelta,
    fastDelta,
    playlistSpeedPersists: true,
    pauseSeekResume: true,
    fullscreen: true,
    oldVisualControlRemoved: true,
    mobileOverflow: false,
    resetRestoresNormal: true,
    consoleErrors: errors,
  };
  await writeFile(
    "artifacts/audio-speed-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket.close();
}
