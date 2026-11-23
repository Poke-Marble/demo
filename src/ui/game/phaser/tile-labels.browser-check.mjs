/* global window, document, fetch */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ||
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const phase = process.argv.includes('--before') ? 'before' : 'after';
const folder = 'artifacts/board-tile-labels';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { browser: browser.version(), phase, checks: [], errors: [] };
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [844, 390],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.route('**/src/main.ts', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.goto('http://127.0.0.1:5228/demo/');
    await page.evaluate(async () => {
      const source = await (
        await fetch('/demo/src/ui/game/phaser/index.ts')
      ).text();
      const { default: Phaser } = await import(
        source.match(/import Phaser from ["']([^"']+)/)[1]
      );
      const boot = Phaser.Game.prototype.boot;
      Phaser.Game.prototype.boot = function () {
        window.labelGame = this;
        return boot.call(this);
      };
      const { createIntegratedPreview } =
        await import('/demo/src/ui/game/integration/adapter.ts');
      const { createInitialRoster } =
        await import('/demo/src/ui/game/setup.ts');
      const { mountGameUI } = await import('/demo/src/ui/game/index.ts');
      const preview = createIntegratedPreview();
      await preview.adapter.start({
        mapId: preview.adapter.getView().map.id,
        participants: createInitialRoster('pokemon:0001'),
      });
      const view = preview.adapter.getView();
      view.computer.connected = false;
      view.actions = [];
      let listener;
      document.body.replaceChildren();
      const root = document.createElement('div');
      document.body.append(root);
      window.labelUI = mountGameUI(root, {
        getView: () => view,
        subscribe(fn) {
          listener = fn;
          return () => {};
        },
        dispatch() {},
        start() {},
        choose() {},
        restart() {},
      });
      window.labelFixture = {
        view,
        async stage(final) {
          view.state.holdings = final
            ? view.map.tiles
                .filter((t) => t.kind === 'city')
                .map((t, i) => ({
                  tileId: t.id,
                  ownerId: view.state.players[i % 4].id,
                  facilityLevel: 3,
                }))
            : [];
          view.state.players.forEach((p) => {
            p.position = view.map.tiles[9].id;
          });
          return new Promise((resolve) =>
            listener({ view, events: [], presentationComplete: resolve }),
          );
        },
      };
    });
    await page.waitForFunction(
      () => document.querySelector('.phaser-board')?.dataset.locked === 'false',
    );
    await page.waitForTimeout(500);
    await page.evaluate(() => document.fonts.ready);
    for (const final of [false, true]) {
      await page.evaluate((final) => window.labelFixture.stage(final), final);
      await page.waitForTimeout(180);
      const labels = page.locator('button.phaser-map-label');
      if (phase === 'after') assert.equal(await labels.count(), 32);
      const geometry = () =>
        labels.evaluateAll((xs) =>
          xs.map((x) => {
            const r = x.getBoundingClientRect();
            return [
              x.dataset.tileId,
              r.x,
              r.y,
              r.width,
              r.height,
              x.style.transform,
            ];
          }),
        );
      const before = await geometry();
      const target = labels.nth(9);
      if (await labels.count()) await target.click({ force: true });
      await page.waitForTimeout(180);
      const after = await geometry();
      if (phase === 'after') {
        assert.deepEqual(
          after,
          before,
          'click preserves every label transform',
        );
        assert.equal(
          await page
            .locator(
              '.phaser-map-labels svg, .phaser-map-label-directory, .phaser-map-label-focused',
            )
            .count(),
          0,
        );
        assert.match(await page.locator('.pm-dialog').innerText(), /보라타운/);
      }
      await page.screenshot({
        path: `${folder}/${phase}-${width}x${height}-${final ? 'final' : 'empty'}-selected.png`,
      });
      // Close city information using its existing Escape handler.
      await page.keyboard.press('Escape');
      await page.screenshot({
        path: `${folder}/${phase}-${width}x${height}-${final ? 'final' : 'empty'}.png`,
      });
      report.checks.push({
        width,
        height,
        stage: final ? 'final + four pawns' : 'empty + four pawns',
        stable: JSON.stringify(before) === JSON.stringify(after),
      });
    }
    if (phase === 'after') {
      const textFit = await page
        .locator('button.phaser-map-label')
        .evaluateAll((xs) =>
          xs
            .filter((x) => /칠색조|루기아|공중날기/.test(x.textContent))
            .map((x) => ({
              name: x.textContent,
              fits: x.scrollWidth <= x.clientWidth,
              font: x.style.fontSize,
            })),
        );
      assert.equal(textFit.length, 3);
      assert.ok(
        textFit.every((x) => x.fits),
        JSON.stringify(textFit),
      );
      await page.evaluate(async () => {
        await window.labelUI.destroy();
        const { createPhaserBoard } =
          await import('/demo/src/ui/game/phaser/index.ts');
        const view = window.labelFixture.view;
        document.body.replaceChildren();
        const host = document.createElement('div');
        document.body.append(host);
        window.flightBoard = createPhaserBoard({
          view,
          onSelect() {},
          reducedMotion: true,
        });
        window.flightBoard.mount(host);
        await window.flightBoard.ready;
        // Same short allocation used for all fixtures; only renderer UI is mounted.
        document.querySelector('.phaser-board-surface').style.height = '260px';
        window.flightBoard.resize();
        window.flightBoard.setFlightSelection(
          {
            id: 'visual-flight',
            playerId: view.state.players[0].id,
            cancellable: true,
            destinations: view.map.tiles
              .filter((t) => t.kind === 'city')
              .map((t) => ({ tileId: t.id, label: t.nameKo })),
          },
          (_id, tile) => {
            window.flightSubmitted = tile;
          },
        );
      });
      await page.waitForTimeout(180);
      const flightLabel = page.locator('button.phaser-map-label').nth(1);
      const id = await flightLabel.getAttribute('data-tile-id');
      await flightLabel.click({ force: true });
      assert.equal(
        await page
          .locator('.phaser-board')
          .getAttribute('data-flight-candidate'),
        id,
      );
      const scroll = await page.evaluate(
        () => window.labelGame.scene.scenes[0].cameras.main.scrollX,
      );
      const box = await page.locator('.phaser-board-surface').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 35,
        box.y + box.height / 2 + 12,
        { steps: 8 },
      );
      await page.mouse.up();
      assert.notEqual(
        await page.evaluate(
          () => window.labelGame.scene.scenes[0].cameras.main.scrollX,
        ),
        scroll,
      );
      await page.locator('.pm-board-flight summary').click();
      const choice = page.locator('.pm-board-flight-list button').nth(2);
      await choice.focus();
      await page.keyboard.press('Enter');
      const chosen = await choice.getAttribute('data-tile-id');
      assert.equal(
        await page
          .locator('.phaser-board')
          .getAttribute('data-flight-candidate'),
        chosen,
      );
      await page.screenshot({
        path: `${folder}/after-${width}x${height}-flight.png`,
      });
      await page
        .getByRole('button', { name: '목적지 확정', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.flightSubmitted), chosen);
      report.checks.push({
        width,
        height,
        textFit,
        flight: 'board click, pointer pan, keyboard candidate, explicit submit',
      });
    }
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${folder}/${phase}-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
