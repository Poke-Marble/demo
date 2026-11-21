/* global window, document, getComputedStyle */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_PATH ??
      'C:/Users/hyun/.herdr/worktrees/demo/feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
  ).href
);
const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5201';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
await mkdir('artifacts/mobile-framing', { recursive: true });
try {
  for (const [width, height] of [
    [375, 812],
    [390, 844],
    [844, 390],
    [1280, 720],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await page.route('**/src/main.ts', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.goto(origin);
    await page.evaluate(async () => {
      const source = await (await fetch('/src/ui/game/phaser/index.ts')).text();
      const url = source.match(/import Phaser from ["']([^"']+)/)[1];
      const { default: Phaser } = await import(url);
      const boot = Phaser.Game.prototype.boot;
      Phaser.Game.prototype.boot = function () {
        window.frameGame = this;
        return boot.call(this);
      };
      const { mountGameUI } = await import('/src/ui/game/index.ts');
      const { createIntegratedPreview } =
        await import('/src/ui/game/integration/adapter.ts');
      const { createInitialRoster } = await import('/src/ui/game/setup.ts');
      const preview = createIntegratedPreview();
      await preview.adapter.start({
        mapId: preview.adapter.getView().map.id,
        participants: createInitialRoster('pokemon:0001'),
      });
      document.body.replaceChildren();
      const root = document.createElement('div');
      document.body.append(root);
      window.frameUI = mountGameUI(root, preview.adapter);
    });
    await page.waitForFunction(
      () =>
        window.frameGame?.scene.scenes[0]?.children.list.filter(
          (x) => x.type === 'Sprite',
        ).length === 4,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const measure = () =>
      page.evaluate(() => {
        const game = window.frameGame,
          scene = game.scene.scenes[0],
          camera = scene.cameras.main;
        const canvas = game.canvas.getBoundingClientRect();
        const project = (x, y) => {
          const p = camera.matrixCombined.transformPoint(x, y);
          return {
            x: canvas.left + (p.x * canvas.width) / scene.scale.width,
            y: canvas.top + (p.y * canvas.height) / scene.scale.height,
          };
        };
        const obstacles = scene.children.list
          .filter(
            (x) =>
              x.visible &&
              x.texture &&
              (x.texture.key.startsWith('model:') || x.type === 'Sprite'),
          )
          .map((x) => {
            const b = x.getBounds();
            const a = project(b.left, b.top),
              z = project(b.right, b.bottom);
            return { left: a.x, top: a.y, right: z.x, bottom: z.y };
          });
        const labels = [
          ...document.querySelectorAll('.phaser-map-labels .phaser-map-label'),
        ].filter((e) => e.checkVisibility());
        return {
          zoom: camera.zoom,
          scroll: [camera.scrollX, camera.scrollY],
          island: [
            project(100, 350),
            project(900, 350),
            project(500, 120),
            project(500, 608),
          ],
          canvas: canvas.toJSON(),
          buffer: [game.canvas.width, game.canvas.height],
          clippedModels: obstacles.filter(
            (b) =>
              b.left < canvas.left - 1 ||
              b.right > canvas.right + 1 ||
              b.top < canvas.top - 1 ||
              b.bottom > canvas.bottom + 1,
          ),
          overlaps: labels
            .filter((e) => {
              const b = e.getBoundingClientRect();
              return obstacles.some(
                (o) =>
                  b.left < o.right &&
                  b.right > o.left &&
                  b.top < o.bottom &&
                  b.bottom > o.top,
              );
            })
            .map((e) => e.textContent),
          selected: document.querySelector('.phaser-map-label-focused')
            ?.textContent,
          fontSizes: labels.map((e) => getComputedStyle(e).fontSize),
          filters: scene.children.list
            .filter((x) => x.type === 'Sprite')
            .map((x) => x.texture.source[0].scaleMode),
        };
      });
    const initial = await measure();
    assert.equal(
      initial.clippedModels.length,
      0,
      'default framing contains models and pawns',
    );
    assert.deepEqual(
      initial.overlaps,
      [],
      'selected label avoids models and pawns',
    );
    assert.equal(initial.filters.length, 4);
    assert.ok(
      initial.filters.every((x) => x === 1),
      'nearest sprite texture filtering retained',
    );
    assert.ok(initial.buffer[0] >= 1000);
    assert.ok(initial.fontSizes.every((x) => parseFloat(x) >= 14));
    const boardWidth = initial.island[1].x - initial.island[0].x;
    if (width < 400)
      assert.ok(boardWidth > 320, `mobile island width ${boardWidth}`);
    await page.getByRole('button', { name: '확대', exact: true }).click();
    await page.waitForTimeout(150);
    const zoomed = await measure();
    assert.ok(zoomed.zoom > initial.zoom);
    assert.deepEqual(zoomed.overlaps, []);
    const b = initial.canvas;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 10, {
      steps: 6,
    });
    await page.mouse.up();
    const panned = await measure();
    assert.notDeepEqual(panned.scroll, zoomed.scroll);
    await page.getByRole('button', { name: '전체 보기', exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal((await measure()).zoom, initial.zoom);
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(300);
    assert.deepEqual((await measure()).overlaps, []);
    report.push({ width, height, boardWidth, initial, zoomed });
    console.log('PASS camera', width, height, Math.round(boardWidth));
    await page.close();
  }
  await writeFile(
    'artifacts/mobile-framing/camera-report.json',
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
}
