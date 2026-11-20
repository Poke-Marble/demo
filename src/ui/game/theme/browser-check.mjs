/* global window, document, innerWidth, getComputedStyle, structuredClone, AudioContext */
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  pathToFileURL(
    resolve('artifacts/browser-tools/node_modules/playwright/index.mjs'),
  ).href
);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: process.env.HEADED !== '1',
});
const folder = 'artifacts/ui-polish';
await mkdir(folder, { recursive: true });
const report = { errors: [], checks: [] };
const baseURL = process.env.UI_POLISH_URL ?? 'http://127.0.0.1:5187';
async function fixture(page) {
  await page.goto(baseURL);
  await page.evaluate(async () => {
    const { mountGameUI } = await import('/src/ui/game/index.ts');
    const { createIntegratedPreview } =
      await import('/src/ui/game/integration/adapter.ts');
    const { createInitialRoster } = await import('/src/ui/game/setup.ts');
    const { createFeedbackAudio } =
      await import('/src/ui/game/feedback/audio.ts');
    const preview = createIntegratedPreview();
    await preview.adapter.start({
      mapId: preview.adapter.getView().map.id,
      participants: createInitialRoster('pokemon:0001'),
    });
    const base = preview.adapter.getView();
    base.computer.connected = false;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    document.body.append(root);
    let listener;
    const sfx = createFeedbackAudio();
    const cues = [];
    const play = sfx.play.bind(sfx);
    sfx.play = (cue) => {
      cues.push(cue);
      play(cue);
    };
    const game = mountGameUI(
      root,
      {
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
      },
      { sfx },
    );
    let sequence = 0;
    window.polish = {
      cues,
      sfx,
      send(values = [6, 3], playerIndex = 0) {
        const view = structuredClone(base);
        const player = view.state.players[playerIndex];
        view.state.activePlayerId = player.id;
        const tiles = view.map.tiles;
        const path = tiles.slice(1, 10).map((tile) => tile.id);
        player.position = path.at(-1);
        listener({
          id: `polish:${++sequence}`,
          view,
          events: [
            { type: 'dice-rolled', playerId: player.id, values },
            {
              type: 'player-moved',
              playerId: player.id,
              from: tiles[0].id,
              to: player.position,
            },
          ],
          movement: { playerId: player.id, path },
        });
      },
      destroy: () => game.destroy(),
    };
  });
}
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => {
      window.audioQA = { contexts: [], sources: 0 };
      const Native = AudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args);
          window.audioQA.contexts.push(this);
        }
        createBufferSource() {
          window.audioQA.sources++;
          return super.createBufferSource();
        }
      };
    });
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(baseURL);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${folder}/after-title-${width}.png`,
      fullPage: true,
    });
    await fixture(page);
    const font = await page.evaluate(async () => {
      const loaded = await document.fonts.load(
        '14px "PM Galmuri"',
        '이동 완료 한글 ABC 0123456789',
      );
      return {
        status: loaded.map((face) => face.status),
        family: getComputedStyle(document.querySelector('.pm-game')).fontFamily,
      };
    });
    assert.deepEqual(font.status, ['loaded']);
    assert.ok(font.family.includes('PM Galmuri'));
    assert.equal(await page.locator('.pm-sfx-controls').count(), 0);
    assert.equal(await page.locator('.pm-feedback-skip').isVisible(), false);
    assert.equal(await page.locator('.pm-dice-result').textContent(), '이동 —');
    // A trusted gesture still reaches the existing audio bootstrap without a panel.
    await page.locator('.pm-dice-result').click();
    await page.waitForFunction(() =>
      window.audioQA.contexts.some((context) => context.state === 'running'),
    );
    await page.evaluate(() => window.polish.send());
    await page.waitForFunction(
      () =>
        document.querySelector('.pm-dice-result').textContent === '굴리는 중…',
    );
    await page.screenshot({
      path: `${folder}/rolling-${width}.png`,
      fullPage: true,
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.pm-dice-result').textContent ===
        '이동 9칸 · 이동 중…',
    );
    await page.screenshot({
      path: `${folder}/moving-${width}.png`,
      fullPage: true,
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.pm-dice-result').textContent ===
        '이동 9칸 · 완료',
    );
    assert.equal(
      await page.locator('.pm-dice').textContent(),
      '이동 9칸 · 완료',
    );
    assert.deepEqual(await page.evaluate(() => window.polish.cues), [
      'dice',
      ...Array(9).fill('step'),
    ]);
    assert.ok(await page.evaluate(() => window.audioQA.sources > 0));
    assert.equal(await page.locator('.pm-feedback-skip').isVisible(), false);
    assert.equal(
      await page.locator('.pm-game').evaluate((node) => node.inert),
      false,
    );
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      centerOverflow:
        document.querySelector('.pm-dice').scrollWidth >
        document.querySelector('.pm-dice').clientWidth,
      resultOverflow:
        document.querySelector('.pm-dice-result').scrollWidth >
        document.querySelector('.pm-dice-result').clientWidth,
    }));
    assert.deepEqual(layout, {
      overflow: false,
      centerOverflow: false,
      resultOverflow: false,
    });
    await page.screenshot({
      path: `${folder}/after-board-${width}.png`,
      fullPage: true,
    });
    // Skip both the dice and an in-flight walking timer, through both supported paths.
    for (const skip of ['Escape', 'button']) {
      await page.evaluate(() => window.polish.send([1, 2, 3]));
      await page.locator('.pm-feedback-skip:visible').waitFor();
      if (skip === 'button') {
        await page.waitForFunction(() =>
          document
            .querySelector('.pm-dice-result')
            .textContent.includes('이동 중'),
        );
        await page.locator('.pm-feedback-skip').click();
      } else await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('.pm-game').inert,
      );
      assert.equal(
        await page.locator('.pm-dice-result').textContent(),
        '이동 6칸 · 완료',
      );
      const count = await page.evaluate(() => window.polish.cues.length);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.polish.cues.length), count);
    }
    await page.evaluate(() => {
      window.polish.sfx.setMuted(true);
      window.polish.sfx.setVolume(0.2);
    });
    await fixture(page);
    assert.deepEqual(
      await page.evaluate(() => window.polish.sfx.getSettings()),
      { muted: true, volume: 0.2 },
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.polish.send([2, 5, 1]));
    await page.waitForFunction(
      () =>
        document.querySelector('.pm-dice-result').textContent ===
        '이동 8칸 · 완료',
    );
    assert.equal(await page.locator('.pm-feedback-skip').isVisible(), false);
    await page.evaluate(() => window.polish.send([4, 5], 1));
    await page.waitForFunction(
      () =>
        document.querySelector('.pm-computer-dice')?.textContent ===
        '이동 9칸 · 완료',
    );
    assert.equal(
      await page.locator('.pm-dice').textContent(),
      '이동 9칸 · 완료',
    );
    await page.evaluate(() => window.polish.destroy());
    assert.equal(await page.locator('.pm-feedback-skip').count(), 0);
    await page.evaluate(() => window.localStorage.removeItem('pm:sfx:v1'));
    report.checks.push({
      width,
      font,
      layout,
      nineSteps: true,
      escapeAndButtonSkip: true,
      savedAudio: true,
      reducedMotion: true,
      cleanup: true,
    });
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${folder}/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
