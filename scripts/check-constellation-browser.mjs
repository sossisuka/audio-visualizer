import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("artifacts", { recursive: true });
execFileSync("bun", [
  "build",
  "src/lib/constellation.ts",
  "--target",
  "browser",
  "--outfile",
  "artifacts/constellation-library.js",
]);
const moduleUrl = `data:text/javascript;base64,${(await readFile("artifacts/constellation-library.js")).toString("base64")}`;
const base = process.env.VISUALIZER_BASE_URL ?? "http://localhost:3000";
const targets = await (await fetch("http://127.0.0.1:9228/json/list")).json();
const target = targets.find((item) => item.type === "page");
assert(target, "Start a separate Chrome on debugging port 9228");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done) =>
  socket.addEventListener("open", done, { once: true }),
);
let id = 0;
const pending = new Map(),
  errors = [];
socket.addEventListener("message", (event) => {
  const result = JSON.parse(event.data);
  if (result.id && pending.has(result.id)) {
    const task = pending.get(result.id);
    pending.delete(result.id);
    if (result.error) task.reject(result.error);
    else task.resolve(result.result);
  }
  if (result.method === "Runtime.exceptionThrown")
    errors.push(result.params.exceptionDetails);
  if (
    result.method === "Log.entryAdded" &&
    result.params.entry.level === "error"
  )
    errors.push(result.params.entry);
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
const waitFor = async (expression, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Timed out: ${expression}`);
};
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const selectFormation = (name) =>
  evaluate(
    `(() => {const select=document.querySelector('[aria-label="Constellation formation"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(name)});select.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
const state = () =>
  evaluate(`({...document.querySelector('.visual-canvas').dataset})`);
const screenshot = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(`artifacts/${name}.png`, Buffer.from(result.data, "base64"));
};
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
  await cdp("Page.navigate", { url: base });
  await waitFor(
    `document.querySelector('.visual-canvas')?.dataset.wavePhase === 'hidden'`,
  );
  await click('input[name="Display"][value="Constellation"]');
  assert.equal(
    await evaluate(
      `document.querySelectorAll('[aria-label="Constellation formation"] option').length`,
    ),
    130,
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('.visual-screen .formation-control')`,
    ),
    false,
  );
  await selectFormation("Death Star");
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1",
  );
  await click('[aria-label="Play audio"]');
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.constellationShape === 'Death Star' && document.querySelector('.visual-canvas').dataset.constellationMorph === '1.0000'`,
  );
  const active = await state();
  assert.equal(active.constellationShape, "Death Star");
  await screenshot("constellation-death-star");
  const selectedFigures = ["Death Star"];
  for (const [name, file] of [
    ["Death Star II", "death-star-ii"],
    ["Nike Swoosh", "nike"],
    ["Jordan Jumpman", "jordan"],
    ["Skull", "skull"],
    ["Skeleton Point Right", "point-right"],
    ["Skeleton Peace", "peace"],
    ["Skeleton Rock On", "rock-on"],
  ]) {
    await selectFormation(name);
    await waitFor(
      `document.querySelector('.visual-canvas').dataset.constellationShape === ${JSON.stringify(name)} && document.querySelector('.visual-canvas').dataset.constellationMorph === '1.0000'`,
    );
    assert.equal((await state()).constellationReason, "selection");
    selectedFigures.push(name);
    await screenshot(`constellation-${file}`);
  }
  await screenshot("constellation-expanded-desktop");
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
    const layout = await evaluate(
      `(() => {const selector=document.querySelector('.formation-control').getBoundingClientRect(),screen=document.querySelector('.visual-screen').getBoundingClientRect();return {width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,noOverflow:document.documentElement.scrollWidth<=innerWidth,selectorVisible:selector.width>0&&selector.left>=0&&selector.right<=innerWidth,selectorBelowDisplay:selector.top>=screen.bottom,displayHeight:screen.height}})()`,
    );
    assert(
      layout.noOverflow &&
        layout.selectorVisible &&
        layout.selectorBelowDisplay,
      JSON.stringify(layout),
    );
    if (width > 700)
      assert(
        layout.documentHeight <= height + 1 && layout.displayHeight > 100,
        JSON.stringify(layout),
      );
    layouts.push(layout);
  }
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('input[name="Quality"][value="Low"]');
  await selectFormation("Skull");
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.constellationShape==='Skull'&&document.querySelector('.visual-canvas').dataset.constellationMorph==='1.0000'`,
  );
  await screenshot("constellation-skull-low");
  await click('input[name="Quality"][value="High"]');
  await selectFormation("Skeleton Rock On");
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.constellationShape==='Skeleton Rock On'&&document.querySelector('.visual-canvas').dataset.constellationMorph==='1.0000'`,
  );
  await click('[aria-label="Pause audio"]');
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.wavePhase === 'hidden'`,
  );
  const paused = await state();
  await new Promise((done) => setTimeout(done, 350));
  assert.equal((await state()).constellationPhase, paused.constellationPhase);
  assert.equal(
    await evaluate(
      `(() => {const c=document.querySelector('.visual-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=4)if(d[i]>24)return false;return true})()`,
    ),
    true,
  );
  await click('input[name="Display"][value="Galaxy"]');
  assert.equal(
    await evaluate(`!!document.querySelector('[aria-label="Audio speed"]')`),
    true,
  );
  await click('input[name="Display"][value="Constellation"]');
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Constellation formation"]').value`,
    ),
    "Skeleton Rock On",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1",
  );
  await click('[aria-label="Play audio"]');
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await waitFor(
    `document.querySelector('.visual-canvas').dataset.wavePhase === 'visible'`,
  );
  await screenshot("constellation-expanded-mobile");
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth <= innerWidth`),
    true,
  );
  await click('[aria-label="Reset all controls"]');
  await click('input[name="Display"][value="Constellation"]');
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Constellation formation"]').value`,
    ),
    "Auto",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Audio speed"]').value`,
    ),
    "1",
  );

  // Render the actual geometry library to inspect every new silhouette at once.
  const catalog = await evaluate(`(async () => {
    const {FORMATIONS,formationPoint,SYMBOL_FORMATIONS}=await import(${JSON.stringify(moduleUrl)});
    window.__formationCatalog={FORMATIONS,formationPoint,SYMBOL_FORMATIONS};
    return FORMATIONS;
  })()`);
  assert.equal(catalog.length, 129);
  assert(catalog.includes(active.constellationShape));
  const contacts = await evaluate(`(() => {
    const {FORMATIONS,formationPoint,SYMBOL_FORMATIONS}=window.__formationCatalog;
    const names=FORMATIONS.slice(11),results=[];
    for(let sheet=0;sheet<Math.ceil(names.length/20);sheet++) {
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1150;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#050505';ctx.fillRect(0,0,1200,1150);
      for(let slot=0;slot<20;slot++) {
        const name=names[sheet*20+slot],ox=(slot%4)*300,oy=Math.floor(slot/4)*230;
        if(!name)continue;
        ctx.strokeStyle='#292929';ctx.strokeRect(ox+0.5,oy+0.5,299,229);
        ctx.font='12px monospace';ctx.fillStyle='#c0c0c0';ctx.textAlign='center';ctx.fillText(name,ox+150,oy+215);
        const nodes=Array.from({length:260},(_,i)=>{
          const s={x:(i*.618)%1,y:(i*.754)%1,z:(i*.569)%1,a:.5},p=formationPoint(name,i,260,s);
          const yaw=SYMBOL_FORMATIONS.includes(name)?.12:.55,pitch=SYMBOL_FORMATIONS.includes(name)?.06:.3;
          const rx=p.x*Math.cos(yaw)+p.z*Math.sin(yaw),rz=-p.x*Math.sin(yaw)+p.z*Math.cos(yaw);
          return {x:ox+150+rx*85,y:oy+105+(p.y*Math.cos(pitch)-rz*Math.sin(pitch))*85};
        });
        ctx.strokeStyle='#ffffff28';ctx.lineWidth=.5;
        for(let i=0;i<nodes.length;i++){
          const closest=nodes.map((p,j)=>({j,d:(p.x-nodes[i].x)**2+(p.y-nodes[i].y)**2})).filter(p=>p.j!==i).sort((a,b)=>a.d-b.d).slice(0,2);
          for(const edge of closest){if(edge.d>900)continue;ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[edge.j].x,nodes[edge.j].y);ctx.stroke();}
        }
        ctx.fillStyle='#ffffff';for(const node of nodes){ctx.beginPath();ctx.arc(node.x,node.y,1.1,0,Math.PI*2);ctx.fill();}
      }
      results.push(canvas.toDataURL('image/png').split(',')[1]);
    }
    return results;
  })()`);
  for (let i = 0; i < contacts.length; i++)
    await writeFile(
      `artifacts/constellation-catalog-${i + 1}.png`,
      Buffer.from(contacts[i], "base64"),
    );
  assert.deepEqual(errors, []);
  const report = {
    formations: catalog.length,
    additions: 118,
    newFigures: 18,
    selectedFigures,
    layouts,
    lowQualitySilhouette: true,
    activeShape: active.constellationShape,
    pauseClearsCanvas: true,
    mobileOverflow: false,
    audioSpeedAvailableBetweenScenes: true,
    consoleErrors: errors,
  };
  await writeFile(
    "artifacts/constellation-expanded-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket.close();
}
