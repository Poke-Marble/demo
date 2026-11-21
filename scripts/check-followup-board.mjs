/* global window, document, getComputedStyle, innerWidth, innerHeight */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const origin = process.env.BOARD_ORIGIN ?? 'http://127.0.0.1:5197';
const folder = 'artifacts/followup-board';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { errors: [], checks: [] };
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(`${origin}/?qa&fast&seed=42`);
    // Observe rendering only; all product actions still use the actual UI/adapter.
    await page.evaluate(async () => {
      const source = await (await fetch('/src/ui/game/phaser/index.ts')).text();
      const url = source.match(/import Phaser from ["']([^"']+)/)[1];
      const { default: Phaser } = await import(url);
      const boot = Phaser.Game.prototype.boot;
      Phaser.Game.prototype.boot = function () {
        window.followupGame = this;
        return boot.call(this);
      };
    });
    await page.getByRole('button', { name: /NEW GAME/ }).click();
    await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
    await page.getByRole('button', { name: /게임 시작/ }).click();
    await page.waitForFunction(
      () => document.querySelector('.phaser-board')?.dataset.locked === 'false',
    );
    const canvas = await page.locator('.phaser-board canvas').elementHandle();
    const measurements = [];
    for (const zoom of [1, 1.25]) {
      if (zoom > 1)
        await page.getByRole('button', { name: '확대', exact: true }).click();
      await page.waitForTimeout(160);
      const m = await page.evaluate(() => {
        const game = window.followupGame,
          scene = game.scene.scenes[0];
        const b = game.canvas.getBoundingClientRect();
        const foreground = scene.children.list
          .filter(
            (x) =>
              x.visible &&
              x.texture &&
              (x.texture.key.startsWith('model:') || x.type === 'Sprite'),
          )
          .map((image) => {
            const r = image.getBounds();
            const a = scene.cameras.main.matrixCombined.transformPoint(
              r.left,
              r.top,
            );
            const z = scene.cameras.main.matrixCombined.transformPoint(
              r.right,
              r.bottom,
            );
            return {
              left: b.left + (a.x * b.width) / 1000,
              right: b.left + (z.x * b.width) / 1000,
              top: b.top + (a.y * b.height) / 720,
              bottom: b.top + (z.y * b.height) / 720,
            };
          });
        const labels = [
          ...document.querySelectorAll('.phaser-map-labels .phaser-map-label'),
        ].filter((x) => !x.hidden);
        return {
          zoom: scene.cameras.main.zoom,
          canvas: { width: b.width, height: b.height },
          sprites: scene.children.list.filter((x) => x.type === 'Sprite')
            .length,
          foregroundOverlaps: labels
            .filter((label) => {
              const r = label.getBoundingClientRect();
              return foreground.some(
                (f) =>
                  r.left < f.right &&
                  r.right > f.left &&
                  r.top < f.bottom &&
                  r.bottom > f.top,
              );
            })
            .map((x) => x.textContent),
          fontSizes: labels.map((x) => getComputedStyle(x).fontSize),
          viewport: [innerWidth, innerHeight],
          document: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
        };
      });
      assert.equal(m.sprites, 4);
      assert.deepEqual(
        m.foregroundOverlaps,
        [],
        'labels clear actual fullscreen models/pawns',
      );
      assert.ok(
        m.fontSizes.length > 0 &&
          m.fontSizes.every((s) => Number.parseFloat(s) >= 14),
      );
      assert.deepEqual(m.document, m.viewport);
      measurements.push(m);
    }
    const surface = await page.locator('.phaser-board-surface').boundingBox();
    const before = await page.evaluate(
      () => window.followupGame.scene.scenes[0].cameras.main.scrollX,
    );
    await page.mouse.move(
      surface.x + surface.width / 2,
      surface.y + surface.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      surface.x + surface.width / 2 + 35,
      surface.y + surface.height / 2 + 10,
      { steps: 6 },
    );
    await page.mouse.up();
    assert.notEqual(
      await page.evaluate(
        () => window.followupGame.scene.scenes[0].cameras.main.scrollX,
      ),
      before,
    );
    await page.getByRole('button', { name: '전체 보기', exact: true }).click();
    await page.getByRole('button', { name: '도시 목록', exact: true }).click();
    const cities = page.locator('.pm-dialog .phaser-board-tiles button');
    assert.equal(await cities.count(), 32);
    const names = await cities.allTextContents();
    assert.ok(names.some((name) => name.includes('분노의호수')));
    assert.ok(names.some((name) => name.includes('용의굴')));
    await cities.last().click();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    assert.equal(
      await page
        .locator('.phaser-board canvas')
        .evaluate((node, original) => node === original, canvas),
      true,
    );
    await page.screenshot({ path: `${folder}/board-${width}.png` });
    report.checks.push({
      width,
      height,
      measurements,
      cityListCount: 32,
      pan: true,
      sameCanvas: true,
    });
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  'PASS fullscreen board labels/pawns, identity, camera and city modal',
  report.checks.length,
);
