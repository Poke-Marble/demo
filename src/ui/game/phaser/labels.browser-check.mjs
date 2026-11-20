/* global fetch, window, document, devicePixelRatio, getComputedStyle, innerWidth */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ||
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const origin = process.env.LABEL_ORIGIN || 'http://127.0.0.1:5188';
const folder = 'artifacts/label-clarity';
await mkdir(folder, { recursive: true });
const baseline = execFileSync(
  'git',
  ['show', 'a18c2c4:src/ui/game/phaser/index.ts'],
  { encoding: 'utf8' },
).replace(
  /(from\s+|import\s+)('|")(\.[^'"]+)\2/g,
  (_, prefix, quote, path) =>
    `${prefix}${quote}${posix.resolve('/src/ui/game/phaser', path)}${quote}`,
);
for (const resolution of [1, 4])
  await writeFile(
    `${folder}/baseline-${resolution}.ts`,
    baseline.replace(
      "fontSize: '10px',",
      `fontSize: '10px', resolution: ${resolution},`,
    ),
  );
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  browser: browser.version(),
  errors: [],
  checks: [],
  measurements: [],
};
async function fixture(page, resolution) {
  await page.route('**/src/main.ts', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  if (resolution)
    await page.route('**/src/ui/game/phaser/index.ts*', async (r) =>
      r.fulfill({
        response: await page.request.get(
          `${origin}/${folder}/baseline-${resolution}.ts`,
        ),
      }),
    );
  await page.goto(origin);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/ui/game/phaser/index.ts')).text();
    const url = source.match(/import Phaser from ["']([^"']+)/)[1];
    const { default: Phaser } = await import(url);
    const boot = Phaser.Game.prototype.boot;
    Phaser.Game.prototype.boot = function () {
      window.labelGame = this;
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
    const view = preview.adapter.getView();
    view.computer.connected = false;
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    window.labelUI = mountGameUI(root, {
      getView: () => view,
      subscribe: () => () => {},
      dispatch() {},
      start() {},
      choose() {},
      restart() {},
    });
  });
  await page.waitForFunction(
    () =>
      window.labelGame &&
      document.querySelector('.phaser-board')?.dataset.tiles === '32' &&
      document.querySelector('.phaser-board')?.dataset.locked === 'false',
  );
  await page.evaluate(() => document.fonts.ready);
}
async function measure(page) {
  return page.evaluate(() => {
    const game = window.labelGame,
      scene = game.scene.scenes[0],
      canvas = game.canvas,
      b = canvas.getBoundingClientRect();
    const text = scene.children.list.find((x) => x.type === 'Text');
    const labels = [...document.querySelectorAll('button.phaser-map-label')];
    return {
      dpr: devicePixelRatio,
      zoom: scene.cameras.main.zoom,
      canvas: {
        width: canvas.width,
        height: canvas.height,
        displayWidth: b.width,
        displayHeight: b.height,
      },
      fontLoaded: document.fonts.check('14px "PM Galmuri"'),
      text: text && {
        size: text.style.fontSize,
        resolution: text.style.resolution,
        texture: [text.canvas.width, text.canvas.height],
        x: text.x,
        y: text.y,
        effectiveFont: ((10 * b.width) / 1000) * scene.cameras.main.zoom,
      },
      names: labels.map((x) => x.textContent),
      fontSizes: [
        ...new Set(
          labels
            .filter((x) => !x.hidden)
            .map((x) => getComputedStyle(x).fontSize),
        ),
      ],
      canvases: document.querySelectorAll('.phaser-board-surface > canvas')
        .length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
try {
  for (const phase of process.argv.includes('--after-only')
    ? ['after']
    : ['before', 'resolution4', 'after'])
    for (const width of [1280, 390])
      for (const dpr of [1, 2]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          deviceScaleFactor: dpr,
        });
        page.on('pageerror', (e) => report.errors.push(e.message));
        await fixture(
          page,
          phase === 'before' ? 1 : phase === 'resolution4' ? 4 : undefined,
        );
        for (const zoom of [1, 1.25, 2.5, 1]) {
          await page.evaluate(
            (z) => window.labelGame.scene.scenes[0].cameras.main.setZoom(z),
            zoom,
          );
          await page.waitForTimeout(120);
          const metrics = await measure(page);
          assert.equal(metrics.dpr, dpr);
          assert.equal(
            metrics.canvases,
            1,
            await page
              .locator('canvas')
              .evaluateAll((xs) => xs.map((x) => x.outerHTML).join('\n')),
          );
          assert.equal(metrics.fontLoaded, true);
          assert.equal(metrics.overflow, false);
          if (phase === 'after') {
            assert.equal(metrics.names.length, 32);
            assert.equal(new Set(metrics.names).size, 32);
            assert.ok(
              metrics.fontSizes.every((size) => Number.parseFloat(size) >= 14),
            );
            if (zoom === 1) {
              assert.equal(
                await page.locator('button.phaser-map-label:visible').count(),
                32,
              );
              const names = await page
                .locator('.phaser-board-tiles button')
                .allTextContents();
              assert.ok(
                metrics.names.every((name, i) => names[i].includes(name)),
                'map order and complete names',
              );
            }
          } else
            assert.equal(metrics.text.resolution, phase === 'before' ? 1 : 4);
          report.measurements.push({ phase, width, ...metrics });
          await page.locator('.phaser-board-surface').screenshot({
            path: `${folder}/${phase}-${width}-${dpr}-${zoom}.png`,
          });
        }
        if (phase === 'after') {
          const first = page.locator('button.phaser-map-label').first();
          await first.focus();
          await page.waitForTimeout(120);
          assert.equal(
            await first.evaluate((el) => document.activeElement === el),
            true,
            'focus survives layout',
          );
          const focusedSize = await page
            .locator(
              width === 390
                ? '.phaser-map-label-focused'
                : 'button.phaser-map-label:focus',
            )
            .evaluate((el) => getComputedStyle(el).fontSize);
          assert.equal(focusedSize, '18px');
          // The SVG endpoint is the projected tile-label anchor. Invert through Phaser.
          const alignment = await page.evaluate(() => {
            const scene = window.labelGame.scene.scenes[0];
            const line = [
              ...document.querySelectorAll('.phaser-map-labels line'),
            ].find((x) => x.style.display !== 'none');
            const b = window.labelGame.canvas.getBoundingClientRect(),
              p = document
                .querySelector('.phaser-board-surface')
                .getBoundingClientRect();
            const point = scene.cameras.main.getWorldPoint(
              ((Number(line.getAttribute('x1')) - b.left + p.left) * 1000) /
                b.width,
              ((Number(line.getAttribute('y1')) - b.top + p.top) * 720) /
                b.height,
            );
            return { x: point.x, y: point.y };
          });
          assert.ok(
            Math.abs(alignment.x - 500) < 0.01 &&
              Math.abs(alignment.y - 594.9777777777778) < 0.1,
            JSON.stringify(alignment),
          );
          await page.screenshot({
            path: `${folder}/after-hud-${width}-${dpr}.png`,
            fullPage: true,
          });
          await page.evaluate(() => {
            const c = window.labelGame.scene.scenes[0].cameras.main;
            c.setZoom(1.25);
            c.scrollX += 31.25;
            c.scrollY -= 17.75;
          });
          await page.waitForTimeout(120);
          await page
            .locator('.phaser-board-surface')
            .screenshot({ path: `${folder}/after-pan-${width}-${dpr}.png` });
          await page.evaluate(() => {
            window.labelGame.scene.scenes[0].cameras.main
              .setZoom(1)
              .centerOn(500, 360);
          });
          await page.waitForTimeout(120);
          await page.setViewportSize({
            width: width === 390 ? 1280 : 390,
            height: 1000,
          });
          await page.waitForTimeout(200);
          assert.equal(
            await page.locator('button.phaser-map-label:visible').count(),
            32,
            'responsive transition retains all names',
          );
          assert.equal((await measure(page)).canvases, 1);
          await page.evaluate(() => window.labelUI.destroy());
          await page.waitForTimeout(150);
          assert.equal(
            await page
              .locator('.phaser-map-labels, .phaser-map-label-directory')
              .count(),
            0,
          );
          report.checks.push(
            `${width}/DPR${dpr}: full names, CSS size, focus, camera alignment, pan, resize, destroy`,
          );
        }
        await page.close();
      }
  // A direct renderer does not use HUD's font gate. Its DOM labels must repaint
  // after a deliberately delayed local face, rather than baking fallback glyphs.
  const fontPage = await browser.newPage({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
  });
  fontPage.on('pageerror', (e) => report.errors.push(e.message));
  let releaseFont;
  const fontGate = new Promise((resolve) => {
    releaseFont = resolve;
  });
  await fontPage.route('**/*Galmuri*.woff2', async (route) => {
    await fontGate;
    await route.continue();
  });
  await fontPage.goto(`${origin}/phaser-preview.html`, {
    waitUntil: 'domcontentloaded',
  });
  await fontPage.waitForFunction(
    () => document.querySelector('.phaser-board')?.dataset.tiles === '32',
  );
  assert.equal(
    await fontPage.evaluate(() => document.fonts.check('14px "PM Galmuri"')),
    false,
  );
  releaseFont();
  await fontPage.waitForFunction(() =>
    document.fonts.check('14px "PM Galmuri"'),
  );
  await fontPage.waitForTimeout(120);
  assert.equal(await fontPage.locator('button.phaser-map-label').count(), 32);
  await fontPage.locator('button.phaser-map-label').nth(8).focus();
  await fontPage.waitForTimeout(120);
  await fontPage
    .locator('.phaser-board')
    .screenshot({ path: `${folder}/after-delayed-font-390-2.png` });
  report.checks.push(
    'direct renderer: delayed Galmuri face loads and repaints all 32 labels',
  );
  await fontPage.close();
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify({
    checks: report.checks,
    errors: report.errors,
    measurements: report.measurements.length,
  }),
);
