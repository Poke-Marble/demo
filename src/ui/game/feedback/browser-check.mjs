/* global window, document, AudioContext, setInterval, innerWidth, structuredClone, Event */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
const { chromium } = await import(
  pathToFileURL(
    resolve('artifacts/browser-tools/node_modules/playwright/index.mjs'),
  ).href
);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const folder = 'artifacts/gameplay-feedback';
await mkdir(folder, { recursive: true });
const report = { directListening: false, errors: [], checks: [] };
async function page(options = {}) {
  const p = await browser.newPage(options);
  p.on('pageerror', (e) => report.errors.push(e.message));
  await p.addInitScript(() => {
    window.qa = { contexts: [], cues: [], sources: 0, peak: 0 };
    const Native = AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        window.qa.contexts.push(this);
      }
      createGain() {
        const gain = super.createGain();
        const analyser = this.createAnalyser();
        analyser.fftSize = 256;
        gain.connect(analyser);
        const data = new Float32Array(256);
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(data);
          window.qa.peak = Math.max(window.qa.peak, ...data.map(Math.abs));
        }, 10);
        const disconnect = gain.disconnect.bind(gain);
        gain.disconnect = (...args) => {
          window.clearInterval(timer);
          analyser.disconnect();
          return disconnect(...args);
        };
        return gain;
      }
      createBufferSource() {
        const source = super.createBufferSource();
        window.qa.sources++;
        const stop = source.stop.bind(source);
        source.stop = (when) => {
          if (when)
            window.qa.cues.push(
              when - this.currentTime > 0.3 ? 'dice' : 'step',
            );
          return stop(when);
        };
        return source;
      }
    };
  });
  return p;
}
const cues = (p) => p.evaluate(() => [...window.qa.cues]);
async function fixture(p, expectAudio = true) {
  await p.goto('http://127.0.0.1:5176/feedback-preview.html');
  await p.evaluate(async () => {
    const { mountGameUI } = await import('/src/ui/game/index.ts');
    const { createIntegratedPreview } =
      await import('/src/ui/game/integration/adapter.ts');
    const { createInitialRoster } = await import('/src/ui/game/setup.ts');
    const real = createIntegratedPreview();
    const setup = real.adapter.getView();
    await real.adapter.start({
      mapId: setup.map.id,
      participants: createInitialRoster('pokemon:0001'),
    });
    const base = real.adapter.getView();
    base.computer.connected = false;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const unlock = document.createElement('button');
    unlock.textContent = '오디오 활성화';
    root.append(unlock);
    let listener;
    const adapter = {
      getView: () => base,
      subscribe: (fn) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
      dispatch() {},
      start() {},
      choose() {},
      restart() {},
    };
    const ui = mountGameUI(root, adapter);
    window.fixture = {
      send(id, path = [0, 0, 1, 1, 2], playerIndex = 0, values = [1, 1]) {
        const view = structuredClone(base);
        const player = view.state.players[playerIndex];
        view.state.activePlayerId = player.id;
        const tiles = view.map.tiles;
        const from = tiles[0].id;
        player.position = tiles[path.at(-1)].id;
        const update = {
          id,
          view,
          events: [
            { type: 'dice-rolled', playerId: player.id, values },
            {
              type: 'player-moved',
              playerId: player.id,
              from,
              to: player.position,
            },
          ],
          movement: { playerId: player.id, path: path.map((i) => tiles[i].id) },
        };
        listener(update);
        return root.querySelector('.pm-game').inert;
      },
      reset() {
        listener({ id: 'reset', view: setup, events: [] });
      },
      destroy() {
        ui.destroy();
      },
    };
  });
  await p.getByRole('button', { name: '오디오 활성화' }).click();
  if (expectAudio)
    await p.waitForFunction(() =>
      window.qa.contexts.some((c) => c.state === 'running'),
    );
}
try {
  const p = await page({ viewport: { width: 1200, height: 900 } });
  await p.goto('http://127.0.0.1:5176/feedback-preview.html');
  assert.equal(await p.evaluate(() => window.qa.contexts.length), 0);
  await p.getByRole('button', { name: '굴리고 7칸 이동', exact: true }).click();
  await p.locator('.pm-feedback-overlay:not([hidden])').waitFor();
  await p.screenshot({ path: `${folder}/preview-rolling.png` });
  await p.waitForTimeout(2450);
  assert.deepEqual(await cues(p), ['dice', ...Array(7).fill('step')]);
  const audio = await p.evaluate(() => ({
    states: window.qa.contexts.map((c) => c.state),
    sources: window.qa.sources,
    peak: window.qa.peak,
  }));
  assert.ok(audio.states.includes('running'));
  assert.ok(audio.peak > 0);
  report.checks.push({ previewSevenSteps: true, audio });
  await p.getByRole('slider', { name: '효과음 볼륨' }).focus();
  await p.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowRight');
  await p.getByRole('button', { name: '음소거', exact: true }).click();
  await p.reload();
  assert.equal(await p.getByRole('button', { name: '소리 켜기' }).count(), 1);
  assert.equal(
    await p.getByRole('slider', { name: '효과음 볼륨' }).inputValue(),
    '20',
  );
  await p.getByRole('button', { name: '소리 켜기' }).click();
  await p.getByRole('button', { name: '굴리고 7칸 이동', exact: true }).click();
  await p.getByRole('button', { name: '스킵', exact: true }).click();
  await p.waitForTimeout(750);
  assert.equal((await cues(p)).filter((x) => x === 'step').length, 0);
  report.checks.push({ persistedMuteAndVolume: true, skipNoSteps: true });
  await p.close();

  const game = await page();
  await fixture(game);
  assert.equal(await game.evaluate(() => window.fixture.send('human')), true);
  await game.locator('.pm-feedback-overlay:not([hidden])').waitFor();
  assert.ok(
    (await game.locator('.pm-dice-result').textContent()).includes('굴리는 중'),
  );
  assert.equal(await game.locator('.pm-records li').count(), 0);
  const originalCanvas = await game.locator('canvas').elementHandle();
  await game.screenshot({ path: `${folder}/integrated-fixture-rolling.png` });
  await game.waitForTimeout(1250);
  assert.deepEqual(await cues(game), ['dice', 'step', 'step']);
  assert.equal(await originalCanvas.evaluate((n) => n.isConnected), true);
  assert.equal(await game.locator('.pm-game').evaluate((n) => n.inert), false);
  assert.ok(
    (await game.locator('.pm-dice-result').textContent()).includes('1 · 1'),
  );
  await game.evaluate(() => window.fixture.send('human'));
  await game.waitForTimeout(750);
  assert.deepEqual(await cues(game), ['dice', 'step', 'step']);
  await game.evaluate(() => window.fixture.send('computer', [0, 1, 2], 1));
  await game.waitForTimeout(1250);
  assert.deepEqual(await cues(game), [
    'dice',
    'step',
    'step',
    'dice',
    'step',
    'step',
  ]);
  await game.evaluate(() => window.fixture.send('stationary', [0, 0]));
  await game.waitForTimeout(750);
  assert.equal((await cues(game)).filter((x) => x === 'step').length, 4);
  await game.evaluate(() => window.fixture.send('flight', [8]));
  await game.waitForTimeout(750);
  assert.equal((await cues(game)).filter((x) => x === 'step').length, 4);
  await game.evaluate(() => {
    window.fixture.send('reset-during-roll');
    window.setTimeout(() => window.fixture.reset(), 100);
  });
  await game.waitForTimeout(900);
  assert.equal(
    await game.locator('.pm-feedback-overlay:not([hidden])').count(),
    0,
  );
  assert.equal(await game.locator('.pm-game').evaluate((n) => n.inert), false);
  await game.evaluate(() => window.fixture.destroy());
  assert.equal(await game.locator('canvas').count(), 0);
  assert.ok(
    (await game.evaluate(() => window.qa.contexts.map((c) => c.state))).every(
      (s) => s === 'closed',
    ),
  );
  report.checks.push({
    synchronousLock: true,
    delayedText: true,
    stableCanvas: true,
    duplicateID: true,
    humanAndComputer: true,
    repeatedWaypoints: true,
    stationaryAndFlightSilent: true,
    resetAndDestroy: true,
  });
  await game.close();

  const reduced = await page({
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  await fixture(reduced);
  await reduced.evaluate(() => window.fixture.send('reduced'));
  await reduced.waitForTimeout(100);
  assert.deepEqual(await cues(reduced), []);
  assert.equal(
    await reduced.locator('.pm-game').evaluate((n) => n.inert),
    false,
  );
  await reduced.screenshot({ path: `${folder}/integrated-mobile-reduced.png` });
  report.checks.push({
    reducedMotion: true,
    mobileOverflow: await reduced.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  });
  await reduced.close();

  const hidden = await page();
  await fixture(hidden);
  await hidden.evaluate(() => window.fixture.send('hidden'));
  await hidden.locator('.pm-feedback-overlay:not([hidden])').waitFor();
  await hidden.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await hidden.waitForTimeout(800);
  assert.deepEqual(await cues(hidden), ['dice']);
  assert.equal(
    await hidden.locator('.pm-game').evaluate((n) => n.inert),
    false,
  );
  report.checks.push({ simulatedHiddenCleanup: true });
  await hidden.close();

  const failed = await page();
  await failed.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw Error('audio disabled for test');
      }
    };
  });
  await fixture(failed, false);
  await failed.evaluate(() => window.fixture.send('audio-failure'));
  await failed.waitForTimeout(1250);
  assert.equal(
    await failed.locator('.pm-game').evaluate((n) => n.inert),
    false,
  );
  assert.ok(
    (await failed.locator('.pm-dice-result').textContent()).includes('1 · 1'),
  );
  report.checks.push({ audioFailureProgress: true });
  await failed.close();

  const real = await page({ viewport: { width: 1200, height: 900 } });
  await real.goto('http://127.0.0.1:5176/');
  await real.locator('.pm-setup-title .pm-primary').click();
  await real.locator('.pm-setup-starter .pm-primary').click();
  await real.locator('.pm-setup-map .pm-primary').click();
  await real.locator('.pm-action-roll').click();
  await real.locator('.pm-feedback-overlay:not([hidden])').waitFor();
  await real.screenshot({ path: `${folder}/real-integrated-roll.png` });
  await real.waitForFunction(() => !document.querySelector('.pm-game').inert, {
    timeout: 8000,
  });
  assert.equal((await cues(real))[0], 'dice');
  assert.ok((await cues(real)).includes('step'));
  await real.screenshot({ path: `${folder}/real-integrated-arrival.png` });
  report.checks.push({ realIntegratedDemo: true, cues: await cues(real) });
  await real.close();
  for (const [outDir, path] of [
    ['dist/feedback-preview', '/feedback-preview.html'],
    ['dist', '/'],
  ]) {
    const server = await preview({
      configFile: false,
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    try {
      const address = server.httpServer.address();
      const built = await page();
      await built.goto(`http://127.0.0.1:${address.port}${path}`);
      if (path === '/') {
        await built.locator('.pm-setup-title .pm-primary').click();
        await built.locator('.pm-setup-starter .pm-primary').click();
        await built.locator('.pm-setup-map .pm-primary').click();
        await built.locator('.pm-action-roll').click();
      } else
        await built
          .getByRole('button', { name: '굴리고 7칸 이동', exact: true })
          .click();
      await built.locator('.pm-feedback-overlay:not([hidden])').waitFor();
      await built.waitForTimeout(2500);
      assert.equal((await cues(built))[0], 'dice');
      assert.ok((await cues(built)).includes('step'));
      await built.screenshot({
        path: `${folder}/production-${path === '/' ? 'integrated' : 'preview'}.png`,
      });
      report.checks.push({ productionBundle: outDir, cues: await cues(built) });
      await built.close();
    } finally {
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${folder}/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
globalThis.console.log(JSON.stringify(report, null, 2));
