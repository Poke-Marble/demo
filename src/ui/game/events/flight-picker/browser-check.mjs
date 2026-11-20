/* global WebSocket, setTimeout, console, fetch */
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import process from 'node:process';
import { format } from 'prettier';

// Isolated headless Chrome only; never attaches to another pane or profile.
const profile = await mkdtemp(join(tmpdir(), 'flight-picker-chrome-'));
const here = fileURLToPath(new URL('.', import.meta.url));
const evidence = process.env.FLIGHT_EVIDENCE ?? join(here, 'evidence');
await mkdir(evidence, { recursive: true });
const baselinePath = join(here, 'baseline.ts');
const baseline = execFileSync(
  'git',
  ['show', 'a18c2c4:src/ui/game/events/presenter.ts'],
  { encoding: 'utf8' },
);
await writeFile(
  baselinePath,
  baseline
    .replaceAll("from './", "from '../")
    .replace("import './special-events.css'", "import '../special-events.css'"),
);
const chrome = spawn(
  process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')[0];
      break;
    } catch {
      await pause(100);
    }
  }
  assert.ok(port, 'Chrome CDP ready');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(
    targets.find((t) => t.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const task = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) task.reject(data.error);
      else task.resolve(data.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', {
    url: `${process.env.FLIGHT_URL ?? 'http://127.0.0.1:5190'}/?fast`,
  });
  await pause(2500);
  const setup = await evaluate(`(async () => {
    const { createIntegratedPreview } = await import('/src/ui/game/integration/adapter.ts');
    const { createInitialRoster } = await import('/src/ui/game/setup.ts');
    const { kantoJohtoMap } = await import('/src/data/maps/kanto-johto.ts');
    const { plan } = await import('/src/game/ai/planner.ts');
    window.runtime = createIntegratedPreview({ computerDelayMs: 0, seed: 42 });
    const a = runtime.adapter;
    a.start({mapId:kantoJohtoMap.id, participants:createInitialRoster('pokemon:0007')});
    let steps = 0;
    for (; steps < 1000; steps++) {
      const v = a.getView();
      if(v.flightSelection) break;
      if(v.state.phase !== 'playing') throw Error('game ended before flight');
      const snap = runtime.snapshot();
      if(snap.players.find(p=>p.id===snap.activePlayerId).controller==='computer') {
        await a.runComputerTurn(snap.activePlayerId,new AbortController().signal);
      } else {
        const choice=plan({...snap,players:snap.players.map(p=>({...p,controller:'computer'}))},42).candidate;
        if(v.prompt) a.choose(v.prompt.id,choice.id); else a.dispatch(choice.action);
      }
    }
    const v=a.getView(); if(!v.flightSelection) throw Error('no flight');
    window.flight=v.flightSelection;
    window.beforeState=JSON.stringify(runtime.getState());
    if(flight.destinations.some(d=>d.tileId===v.state.players.find(p=>p.id===v.state.activePlayerId).position)) throw Error('current tile offered');
    const {createEconomyContext,quoteToll}=await import('/src/game/economy/index.ts');
    const context=createEconomyContext(kantoJohtoMap);
    for(const d of flight.destinations) if(d.metadata?.toll!==undefined && d.metadata.toll!==quoteToll(runtime.getState(),context,v.state.activePlayerId,d.tileId).total) throw Error('authority quote mismatch');
    if(beforeState!==JSON.stringify(runtime.getState())) throw Error('quote mutated state');
    const {mountGameUI}=await import('/src/ui/game/index.ts');
    document.querySelector('#app').hidden=true;
    window.host=document.createElement('div'); document.body.append(host);
    window.game=mountGameUI(host,a);
    return {steps, destinations:flight.destinations.length, ownership:[...new Set(flight.destinations.map(d=>d.metadata?.ownership))], canvas:!!document.querySelector('canvas')};
  })()`);
  console.log('Natural authority flight', setup);
  assert.ok(setup.destinations > 20);
  assert.ok(setup.canvas);
  // Compare the original presenter on exactly the same authoritative snapshot.
  await evaluate(
    `(async()=>{ document.querySelector('.pm-flight-picker').close(); const {createSpecialEventPresenter}=await import('/src/ui/game/events/flight-picker/baseline.ts'); window.old=createSpecialEventPresenter({root:host,describe:()=>({playerName:'나',partnerName:'꼬부기'}),lock:()=>{}}); old.select(flight,()=>{}); })()`,
  );
  for (const width of [1280, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    await pause(200);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(evidence, `before-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
  }
  await evaluate(
    `(async()=>{ old.destroy(); game.destroy(); const {mountGameUI}=await import('/src/ui/game/index.ts'); window.game=mountGameUI(host,runtime.adapter); })()`,
  );
  const checks = [];
  for (const width of [1280, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    await pause(500);
    const metrics = await evaluate(
      `(()=>{ const dialog=document.querySelector('.pm-flight-picker'); const list=dialog.querySelector('.pm-event-destinations'); const card=list.querySelector('button'); const r=dialog.getBoundingClientRect(); return {width:innerWidth,dialogWidth:r.width,inside:r.left>=0&&r.right<=innerWidth,scrollable:list.scrollHeight>list.clientHeight,cards:list.querySelectorAll('button').length,text:card.textContent,unchanged:beforeState===JSON.stringify(runtime.getState())}; })()`,
    );
    assert.equal(metrics.inside, true);
    assert.equal(metrics.scrollable, true);
    assert.equal(metrics.unchanged, true);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(evidence, `after-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
    checks.push(metrics);
  }
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const point = await evaluate(
    `(()=>{const r=document.querySelector('.pm-flight-card').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touch = await evaluate(
    `document.querySelector('.pm-flight-card').getAttribute('aria-pressed')==='true'`,
  );
  assert.equal(touch, true);
  const keyboard = await evaluate(
    `(()=>{ const cards=[...document.querySelectorAll('.pm-flight-card')]; cards[0].focus(); cards[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})); return {last:document.activeElement===cards.at(-1),scroll:cards[0].parentElement.scrollTop>0}; })()`,
  );
  assert.equal(keyboard.last, true);
  assert.equal(keyboard.scroll, true);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  console.log(
    'Keyboard selection',
    await evaluate(
      `({active:document.activeElement?.outerHTML,pressed:!!document.querySelector('[aria-pressed="true"]')})`,
    ),
  );
  const selected = await evaluate(
    `(()=>{const d=document.querySelector('.pm-flight-picker'); return {pressed:!!d.querySelector('[aria-pressed="true"]'),unchanged:beforeState===JSON.stringify(runtime.getState())};})()`,
  );
  assert.equal(selected.pressed, true);
  assert.equal(selected.unchanged, true);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  const tab = await evaluate(
    `document.activeElement.textContent==='목적지 확정'`,
  );
  assert.equal(tab, true);
  const commit = await evaluate(
    `(async()=>{const d=document.querySelector('.pm-flight-picker');const b=[...d.querySelectorAll('button')].find(b=>b.textContent==='목적지 확정');b.click();b.click();await new Promise(r=>setTimeout(r,20));return {changed:beforeState!==JSON.stringify(runtime.getState()),event:document.querySelector('.pm-event-fly')?.dataset.eventId};})()`,
  );
  assert.equal(commit.changed, true);
  assert.ok(commit.event);
  await writeFile(
    join(evidence, 'results.json'),
    await format(
      JSON.stringify({ setup, checks, touch, keyboard, selected, tab, commit }),
      { parser: 'json' },
    ),
  );
  console.log(
    'PASS Chrome actual game 1280/390, scroll, keyboard, separate confirmation and flight pipeline',
  );
} finally {
  socket?.close();
  chrome.kill();
  await rm(baselinePath, { force: true });
  await pause(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
