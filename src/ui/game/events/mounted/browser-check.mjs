/* global window, document, AudioContext */
import { chromium } from '../../../../../../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import console from 'node:console';
const out = 'artifacts/mounted-flight';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  results = [];
async function open(
  width,
  pokemon = 'pokemon:0001',
  reducedMotion = 'no-preference',
  failure = false,
) {
  const page = await browser.newPage({
    viewport: { width, height: width === 390 ? 844 : 720 },
    reducedMotion,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.audioQA = { contexts: 0, started: 0 };
    const Base = AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        window.audioQA.contexts++;
      }
      createOscillator() {
        const n = super.createOscillator();
        const start = n.start.bind(n);
        n.start = (...args) => {
          window.audioQA.started++;
          start(...args);
        };
        return n;
      }
    };
  });
  if (failure)
    await page.route('**/mounted/assets/sprite/0823/*-Anim.png*', (route) =>
      route.request().resourceType() === 'image'
        ? route.abort()
        : route.continue(),
    );
  await page.goto(
    `http://127.0.0.1:5215/mounted-flight-preview.html?pokemon=${pokemon}`,
  );
  await page.waitForSelector('.phaser-board canvas');
  await page.waitForFunction(
    () => document.querySelector('.phaser-board')?.dataset.tiles === '32',
  );
  return page;
}
async function complete(page, count = 1) {
  await page.waitForFunction((n) => window.mountedQA.ack === n, count);
  assert.equal(await page.locator('.pm-mounted-flight').count(), 0);
  assert.equal(await page.locator('[data-mounted-player]').count(), 0);
}
try {
  for (const width of [1280, 390])
    for (const pokemon of [
      'pokemon:0001',
      'pokemon:0004',
      'pokemon:0007',
      'pokemon:0025',
    ]) {
      const page = await open(width, pokemon);
      await page.getByText('Fly', { exact: true }).click();
      await page.waitForSelector('.pm-mounted-flight[data-state=ready]');
      assert.equal(
        await page
          .locator('.pm-mounted-flight')
          .getAttribute('data-pokemon-id'),
        pokemon,
      );
      assert.equal(
        await page.locator('.phaser-board').getAttribute('data-mounted-player'),
        'player:1',
      );
      const phases = [];
      for (const phase of ['takeoff', 'cross', 'land']) {
        await page.waitForSelector(`.pm-mounted-flight[data-phase=${phase}]`);
        phases.push(phase);
        if (phase !== 'takeoff' || pokemon === 'pokemon:0001')
          await page.screenshot({
            path: `${out}/${width}-${pokemon.slice(-4)}-${phase}.png`,
          });
        if (phase === 'land')
          assert.match(
            await page.locator('.pm-mounted-caption').innerText(),
            /\uB3C4\uCC29/,
          );
      }
      await complete(page);
      assert.equal(
        await page.evaluate(
          () => window.mountedQA.view.state.players[0].position,
        ),
        'tile:projection:14',
      );
      await page.getByText('Replay', { exact: true }).click();
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.mountedQA.ack), 1);
      assert.equal(await page.locator('.pm-mounted-flight').count(), 0);
      results.push({
        width,
        pokemon,
        phases,
        ack: 1,
        actualDestination: 'tile:projection:14',
      });
      await page.close();
    }
  for (const key of ['Enter', 'Space', 'Escape']) {
    const page = await open(390);
    await page.getByText('Fly', { exact: true }).click();
    await page.waitForSelector('.pm-mounted-flight');
    await page.keyboard.press(key);
    await complete(page);
    results.push({ skip: key, ack: 1 });
    await page.close();
  }
  const reduced = await open(390, 'pokemon:0025', 'reduce');
  await reduced.getByText('Fly', { exact: true }).click();
  await complete(reduced);
  results.push({ reduced: true, ack: 1 });
  await reduced.close();
  const failure = await open(390, 'pokemon:0007', 'no-preference', true);
  await failure.getByText('Fly', { exact: true }).click();
  await failure.waitForSelector('.pm-mounted-flight[data-state=failed]');
  await failure.screenshot({ path: `${out}/390-failed.png` });
  await complete(failure);
  results.push({ loadFailure: true, ack: 1 });
  await failure.close();
  const destroyed = await open(1280);
  await destroyed.getByText('Fly', { exact: true }).click();
  await destroyed.waitForSelector('.pm-mounted-flight[data-state=ready]');
  await destroyed.evaluate(() => {
    window.mountedQA.mounted.destroy();
    window.mountedQA.mounted.destroy();
  });
  await complete(destroyed);
  await destroyed.waitForTimeout(200);
  assert.equal(await destroyed.locator('.phaser-board canvas').count(), 0);
  results.push({ destroyTwice: true, ack: 1 });
  await destroyed.close();
  const changed = await open(390);
  await changed.getByText('Fly', { exact: true }).click();
  await changed.waitForSelector('.pm-mounted-flight[data-state=ready]');
  await changed.emulateMedia({ reducedMotion: 'reduce' });
  await complete(changed);
  results.push({ liveReduced: true, ack: 1 });
  await changed.close();
  const audio = await open(1280);
  assert.equal(await audio.evaluate(() => window.audioQA.contexts), 0);
  await audio.evaluate(() => window.mountedQA.audio.playFlight('select'));
  assert.equal(await audio.evaluate(() => window.audioQA.started), 0);
  await audio.getByText('Fly', { exact: true }).click();
  await audio.waitForSelector('.pm-mounted-flight[data-phase=cross]');
  const sounded = await audio.evaluate(() => window.audioQA.started);
  assert.ok(sounded > 0);
  assert.equal(await audio.evaluate(() => window.audioQA.contexts), 1);
  await audio.evaluate(() => window.mountedQA.audio.setMuted(true));
  const muted = await audio.evaluate(() => window.audioQA.started);
  await audio.waitForTimeout(450);
  assert.equal(await audio.evaluate(() => window.audioQA.started), muted);
  await audio.keyboard.press('Escape');
  await complete(audio);
  await audio.evaluate(() => {
    window.mountedQA.audio.setMuted(false);
    window.mountedQA.audio.setVolume(0);
    window.mountedQA.audio.playFlight('select');
  });
  assert.equal(await audio.evaluate(() => window.audioQA.started), muted);
  await audio.evaluate(() => {
    window.mountedQA.audio.setVolume(0.25);
    for (let i = 0; i < 100; i++) window.mountedQA.audio.playFlight('hover');
  });
  assert.equal(await audio.evaluate(() => window.audioQA.started), muted + 1);
  await audio.evaluate(() => window.mountedQA.audio.stop());
  assert.deepEqual(
    await audio.evaluate(() => window.mountedQA.audio.getSettings()),
    { muted: false, volume: 0.25 },
  );
  results.push({
    audio: {
      lockedBeforeGesture: true,
      sharedContext: 1,
      muted: true,
      zeroVolume: true,
      hover100Calls: 1,
      stop: true,
    },
  });
  await audio.close();
  for (const width of [1280, 390]) {
    const actual = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 720 },
    });
    actual.on('pageerror', (e) => errors.push(e.message));
    await actual.goto('http://127.0.0.1:5215/actual-flight-preview.html');
    await actual.waitForSelector('body[data-actual-ready]');
    await actual.waitForSelector('.phaser-board canvas');
    const before = await actual.evaluate(
      () => window.actualFlightQA.state.economy.revision,
    );
    await actual.evaluate(() => {
      window.actualFlightQA.choose();
      window.actualFlightQA.choose();
    });
    await actual.waitForSelector('.pm-mounted-flight[data-state=ready]');
    await actual.waitForSelector('.pm-mounted-flight[data-phase=cross]');
    await actual.screenshot({ path: `${out}/actual-${width}-cross.png` });
    await actual.waitForSelector('.pm-mounted-flight[data-phase=land]');
    await actual.screenshot({ path: `${out}/actual-${width}-land.png` });
    await actual.waitForFunction(
      () => window.actualFlightQA.receipts[0]?.ack === 1,
    );
    const receipt = await actual.evaluate(
      () => window.actualFlightQA.receipts[0],
    );
    assert.equal(receipt.revision, before + 1);
    assert.equal(receipt.to, receipt.actualPosition);
    assert.equal(receipt.ack, 1);
    assert.equal(receipt.from, 'tile:kj:fly');
    assert.equal(await actual.locator('.pm-mounted-flight').count(), 0);
    assert.equal(
      await actual.locator('.pm-game').evaluate((n) => n.inert),
      false,
    );
    results.push({ actualFly: width, ...receipt });
    await actual.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${out}/results.json`,
    JSON.stringify({ browser: browser.version(), results, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      cases: results.length,
      browser: browser.version(),
      errors,
    }),
  );
} finally {
  await browser.close();
}
