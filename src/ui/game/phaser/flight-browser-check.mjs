/* global WebSocket, setTimeout, console, fetch */
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import process from 'node:process';
import { format } from 'prettier';

// Isolated headless Chrome only; never attaches to another pane or profile.
const profile = await mkdtemp(join(tmpdir(), 'flight-picker-chrome-'));
const evidence = process.env.FLIGHT_EVIDENCE ?? 'artifacts/board-flight';
await mkdir(evidence, { recursive: true });
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
    url: `${process.env.FLIGHT_URL ?? 'http://127.0.0.1:5214'}/?fast`,
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
    window.eventsSeen=[];window.effectsSeen=[];
    a.subscribe(u=>{eventsSeen.push(...u.events);effectsSeen.push(...(u.effects??[]));u.presentationComplete?.();});
    const original=a.selectFlightDestination.bind(a);
    window.submissions=0;
    a.selectFlightDestination=(...args)=>{submissions++;return original(...args)};
    window.game=mountGameUI(host,a);
    return {steps, destinations:flight.destinations.length, ownership:[...new Set(flight.destinations.map(d=>d.metadata?.ownership))], canvas:!!document.querySelector('canvas')};
  })()`);
  console.log('Natural authority flight', setup);
  assert.ok(setup.destinations > 20);
  await pause(2500);
  const mouse = async (type, x, y, buttons = 0) =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons,
      clickCount: 1,
    });
  const points = () =>
    evaluate(`(async()=>{
    const {boardCells}=await import('/src/ui/game/presentation.ts');
    const {tileGeometry}=await import('/src/ui/game/projection.ts');
    const v=runtime.adapter.getView(); const {side,cells}=boardCells(v.map.tiles.length);
    const c=host.querySelector('.phaser-board-surface canvas').getBoundingClientRect();
    const height=1000*c.height/c.width, framing=Math.min(1000/860,height/600);
    return flight.destinations.map(d=>{const i=v.map.tiles.findIndex(t=>t.id===d.tileId);const g=tileGeometry(cells[i],side);return {id:d.tileId,x:c.left+c.width/2+(g.x-500)*framing*c.width/1000,y:c.top+c.height/2+(g.y-340)*framing*c.width/1000};}).filter(p=>p.y>220&&p.y<c.bottom-20&&p.x>c.left+15&&p.x<c.right-15);
  })()`);
  const checks = [];
  for (const width of [1280, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    await pause(500);
    const targets = await points();
    assert.ok(targets.length > 5);
    const opponents = await evaluate(
      `flight.destinations.filter(d=>d.metadata?.ownership==='opponent').map(d=>d.tileId)`,
    );
    const p = targets.find((t) => opponents.includes(t.id)) ?? targets[0];
    await mouse('mousePressed', p.x, p.y, 1);
    await mouse('mouseMoved', p.x + 35, p.y + 25, 1);
    await mouse('mouseMoved', p.x, p.y, 1);
    await mouse('mouseReleased', p.x, p.y);
    await pause(80);
    assert.equal(
      await evaluate(
        `host.querySelector('.phaser-board').dataset.flightCandidate`,
      ),
      '',
      'drag returning to start never selects',
    );
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y, 1);
    await mouse('mouseReleased', p.x, p.y);
    await pause(80);
    assert.equal(
      await evaluate(
        `host.querySelector('.phaser-board').dataset.flightCandidate`,
      ),
      p.id,
    );
    assert.equal(await evaluate('submissions'), 0);
    assert.equal(
      await evaluate('beforeState===JSON.stringify(runtime.getState())'),
      true,
    );
    const metrics = await evaluate(
      `(()=>{const b=host.querySelector('.phaser-board'),r=b.getBoundingClientRect(),card=b.querySelector('.pm-flight-card').getBoundingClientRect();return {inside:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,cardBounded:card.height<=160,listCollapsed:!b.querySelector('.pm-board-flight details').open,cities:b.querySelectorAll('.pm-board-flight-list button').length,canvasHeight:b.querySelector('canvas').getBoundingClientRect().height};})()`,
    );
    assert.equal(metrics.inside, true);
    assert.equal(metrics.cardBounded, true);
    assert.equal(metrics.listCollapsed, true);
    assert.equal(metrics.cities, setup.destinations);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(evidence, `board-flight-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
    checks.push({ width, dragSuppressed: true, candidate: p.id, ...metrics });
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    assert.equal(
      await evaluate(
        `host.querySelector('.phaser-board').dataset.flightCandidate`,
      ),
      '',
    );
  }
  // Native Chrome touch emulation: tapping chooses a candidate, never submits.
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
  const touchPoint = (await points())[2];
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: touchPoint.x, y: touchPoint.y }],
  });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(100);
  assert.equal(
    await evaluate(
      `host.querySelector('.phaser-board').dataset.flightCandidate`,
    ),
    touchPoint.id,
  );
  assert.equal(await evaluate('submissions'), 0);
  // Revision invalidation and lifecycle use the same board selection component.
  const lifecycle = await evaluate(`(async()=>{
    const {createBoardFlight}=await import('/src/ui/game/phaser/board-flight.ts');
    const root=document.createElement('div');document.body.append(root);let calls=0;
    const f=createBoardFlight(root,()=>{});const handler=async()=>{calls++};
    f.set(flight,handler);f.pick(flight.destinations[0].tileId);
    f.invalidate({...flight,id:flight.id+':next'});const invalidated=!f.candidate&&!f.selection;
    f.set(flight,handler);f.pick(flight.destinations[0].tileId);f.set({...flight,id:'new-session'},handler);const reset=!f.candidate;
    f.destroy();root.remove();return {invalidated,reset,calls};
  })()`);
  assert.equal(lifecycle.invalidated, true);
  assert.equal(lifecycle.reset, true);
  assert.equal(lifecycle.calls, 0);
  // Accessible collapsed list uses ordinary keyboard buttons and a distinct confirmation.
  await evaluate(
    `host.querySelector('.pm-board-flight details').open=true;host.querySelector('.pm-board-flight-list button:last-child').focus()`,
  );
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
  const keyboardSelected = await evaluate(
    `host.querySelector('.phaser-board').dataset.flightCandidate`,
  );
  assert.equal(
    keyboardSelected,
    await evaluate('flight.destinations.at(-1).tileId'),
  );
  assert.equal(await evaluate('submissions'), 0);
  await evaluate(
    `const trial=flight.destinations.find(d=>d.metadata?.kind==='trial');host.querySelector('.pm-board-flight-list button[data-tile-id="'+trial.tileId+'"]').focus()`,
  );
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
  const selected = await evaluate(
    `host.querySelector('.phaser-board').dataset.flightCandidate`,
  );
  await evaluate(
    `const confirm=host.querySelector('.pm-board-flight-actions button');confirm.click();confirm.click();`,
  );
  await pause(100);
  assert.equal(await evaluate('submissions'), 1);
  let arrival;
  for (let i = 0; i < 120; i++) {
    arrival = await evaluate(
      `(()=>{const v=runtime.adapter.getView();return {position:v.state.players.find(p=>p.id===flight.playerId).position,flightEvents:effectsSeen.filter(e=>e.type==='fly').length,selectionGone:!v.flightSelection,trialIntros:effectsSeen.filter(e=>e.type==='trial-intro').length,settled:!host.querySelector('.pm-game').inert&&!document.querySelector('.pm-event')&&host.querySelector('.phaser-board')?.dataset.locked==='false',stateChanged:beforeState!==JSON.stringify(runtime.getState())};})()`,
    );
    if (arrival.settled) break;
    await pause(100);
  }
  const worldMode = await evaluate('!!runtime.getState().worldEvents');
  assert.equal(arrival.trialIntros, worldMode ? 0 : 1);
  assert.equal(arrival.position, selected);
  assert.equal(arrival.flightEvents, 1);
  assert.equal(arrival.selectionGone, true);
  assert.equal(arrival.stateChanged, true);
  assert.equal(arrival.settled, true);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const returnTurn = await evaluate('runtime.getState().turnNumber + 4');
  await evaluate(
    'runtime.adapter.dispatch({type:"end-turn",playerId:runtime.getState().activePlayerId})',
  );
  let aiReturned = false;
  for (let i = 0; i < 200; i++) {
    aiReturned = await evaluate(
      `runtime.getState().turnNumber>=${returnTurn}&&runtime.getState().activePlayerId===flight.playerId`,
    );
    if (aiReturned) break;
    await pause(100);
  }
  assert.equal(aiReturned, true, 'all three AI seats return after flight ACK');
  arrival.aiReturned = aiReturned;
  await evaluate('game.destroy()');
  await pause(200);
  const boardLifecycle = await evaluate(`(async()=>{
    const {createPhaserBoard}=await import('/src/ui/game/phaser/index.ts');
    const b=createPhaserBoard({view:runtime.adapter.getView(),onSelect:()=>{},renderer:'canvas'});
    b.mount(host);await b.ready;b.setFlightSelection(flight,()=>{});
    b.element.querySelector('.pm-board-flight-list button').click();
    await b.skip();const skipped=b.element.dataset.flightCandidate===''&&b.element.dataset.flightSelection==='false';
    b.setFlightSelection(flight,()=>{});b.element.querySelector('.pm-board-flight-list button').click();
    await b.update(runtime.adapter.getView());const reconciled=b.element.dataset.flightCandidate==='';
    b.setFlightSelection(flight,()=>{});await b.destroy();return {skipped,reconciled,destroyed:!b.element.isConnected};
  })()`);
  assert.equal(boardLifecycle.skipped, true);
  assert.equal(boardLifecycle.reconciled, true);
  assert.equal(boardLifecycle.destroyed, true);
  assert.equal(
    await evaluate(`host.querySelectorAll('canvas,.pm-board-flight').length`),
    0,
  );
  // A second naturally reached flight lands on a quoted opponent property.
  const economy = await evaluate(`(async()=>{
    const {createIntegratedPreview}=await import('/src/ui/game/integration/adapter.ts');
    const {createInitialRoster}=await import('/src/ui/game/setup.ts');
    const {kantoJohtoMap}=await import('/src/data/maps/kanto-johto.ts');
    const {plan}=await import('/src/game/ai/planner.ts');
    const {mountGameUI}=await import('/src/ui/game/index.ts');
    window.moneyRuntime=createIntegratedPreview({computerDelayMs:0,seed:42});const a=moneyRuntime.adapter;
    a.start({mapId:kantoJohtoMap.id,participants:createInitialRoster('pokemon:0007')});
    for(let i=0;i<1000&&!a.getView().flightSelection;i++) {
      const v=a.getView(),snap=moneyRuntime.snapshot();
      if(snap.players.find(p=>p.id===snap.activePlayerId).controller==='computer') await a.runComputerTurn(snap.activePlayerId,new AbortController().signal);
      else {const c=plan({...snap,players:snap.players.map(p=>({...p,controller:'computer'}))},42).candidate;if(v.prompt)a.choose(v.prompt.id,c.id);else a.dispatch(c.action);}
    }
    const v=a.getView(),f=v.flightSelection,player=v.state.players.find(p=>p.id===f.playerId);
    window.moneyTarget=f.destinations.find(d=>d.metadata?.ownership==='opponent'&&d.metadata.toll>0&&d.metadata.toll<=player.balance);
    if(!moneyTarget)throw Error('no affordable opponent toll');
    window.moneyBefore=moneyRuntime.getState();window.moneyFlight=f;window.moneyCalls=0;
    const original=a.selectFlightDestination.bind(a);a.selectFlightDestination=(...args)=>{moneyCalls++;return original(...args)};
    window.moneyGame=mountGameUI(host,a);
    return {tile:moneyTarget.tileId,quote:moneyTarget.metadata.toll,balance:player.balance};
  })()`);
  await pause(1800);
  await evaluate(
    `host.querySelector('.pm-board-flight-list button[data-tile-id="'+moneyTarget.tileId+'"]').click();host.querySelector('.pm-board-flight-actions button').click();host.querySelector('.pm-board-flight-actions button').click()`,
  );
  const settlement = await evaluate(
    `(()=>{const after=moneyRuntime.getState(),id=moneyFlight.playerId,holding=moneyBefore.holdings.find(h=>h.tileId===moneyTarget.tileId);return {calls:moneyCalls,paid:moneyBefore.players.find(p=>p.id===id).balance-after.players.find(p=>p.id===id).balance,recovered:after.players.find(p=>p.id===holding.ownerId).balance-moneyBefore.players.find(p=>p.id===holding.ownerId).balance,position:after.players.find(p=>p.id===id).position};})()`,
  );
  assert.equal(settlement.calls, 1);
  assert.equal(settlement.paid, economy.quote);
  assert.equal(settlement.recovered, economy.quote);
  assert.equal(settlement.position, economy.tile);
  await evaluate('moneyGame.destroy()');
  await pause(100);
  await writeFile(
    join(evidence, 'board-flight-results.json'),
    await format(
      JSON.stringify(
        {
          setup,
          checks,
          touch: { candidate: touchPoint.id, submissions: 0 },
          lifecycle,
          boardLifecycle,
          economy: { ...economy, ...settlement },
          selected,
          arrival,
        },
        null,
        2,
      ),
      { parser: 'json' },
    ),
  );
  console.log(JSON.stringify({ setup, checks, lifecycle, arrival }));
} finally {
  socket?.close();
  chrome.kill();
  await pause(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
