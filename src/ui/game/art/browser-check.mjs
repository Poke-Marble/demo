/* global document, getComputedStyle, Image, innerWidth */
// Isolated Chrome regression. Optional local Playwright installation stays in artifacts/.
import assert from 'node:assert/strict';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
const { chromium } = await import(
  pathToFileURL(
    resolve('artifacts/browser-tools/node_modules/playwright/index.mjs'),
  ).href
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const folder = 'artifacts/construction-qa';
await mkdir(folder, { recursive: true });
await Promise.all(
  [1200, 390].map((width) =>
    copyFile(
      `artifacts/board-art-qa/dev-${width}.png`,
      `${folder}/before-flat-${width}.png`,
    ).catch(() => {}),
  ),
);
const reports = [];
try {
  for (const [mode, origin] of [
    ['dev', 'http://127.0.0.1:5194'],
    ['production', 'http://127.0.0.1:5195'],
    ['subpath', 'http://127.0.0.1:5196/board-art'],
  ]) {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }),
        errors = [],
        failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('requestfailed', (r) => failed.push(r.url()));
      await page.goto(`${origin}/board-art-preview.html`, {
        waitUntil: 'networkidle',
      });
      assert.equal(await page.locator('.pm-iso-tile').count(), 32);
      const cityModels = page.locator('.pm-iso-facility [data-stage]');
      assert.equal(await cityModels.count(), 27);
      assert.ok(
        (
          await cityModels.evaluateAll((nodes) => nodes.map((n) => n.innerHTML))
        ).every((x) => x === ''),
      );
      const transitions = [];
      for (const stage of ['unowned', 'camp', 'shop', 'center', 'final']) {
        await page
          .locator(`.art-controls button[data-stage="${stage}"]`)
          .click();
        assert.ok(
          (
            await cityModels.evaluateAll((nodes) =>
              nodes.map((n) => n.dataset.stage),
            )
          ).every((x) => x === stage),
        );
        const animated = await page
          .locator('.pm-board')
          .evaluate((n) => n.getAnimations({ subtree: true }).length);
        if (stage !== 'unowned') assert.ok(animated > 0);
        await page.locator('.art-controls button').last().click();
        assert.equal(
          await page
            .locator('.pm-board')
            .evaluate(
              (n) =>
                n
                  .getAnimations({ subtree: true })
                  .filter((a) => a.playState === 'running').length,
            ),
          0,
        );
        const components = await cityModels
          .first()
          .getAttribute('data-components');
        assert.equal(
          components,
          {
            unowned: '',
            camp: 'flag',
            shop: 'flag shop',
            center: 'flag shop center',
            final: 'flag shop center signature',
          }[stage],
        );
        await page.screenshot({
          path: `${folder}/${mode}-${width}-${stage}.png`,
          fullPage: true,
        });
        transitions.push({ stage, animated, components });
      }
      assert.equal(
        await page.locator('.pm-board image[href*="regional"]').count(),
        0,
      );
      const decoded = await page.evaluate(async () => {
        const urls = [...document.querySelectorAll('image')].map((n) =>
          n.getAttribute('href'),
        );
        for (const n of document.querySelectorAll('.pm-pawn-figure')) {
          const bg = getComputedStyle(n).backgroundImage;
          if (bg.startsWith('url(')) urls.push(bg.slice(5, -2));
        }
        return Promise.all(
          [...new Set(urls)].map(async (url) => {
            const im = new Image();
            im.src = url;
            try {
              await im.decode();
              return { url, ok: true };
            } catch {
              return { url, ok: false };
            }
          }),
        );
      });
      assert.ok(decoded.every((x) => x.ok));
      assert.equal(decoded.length, 6);
      const tiles = page.locator('.pm-iso-tile');
      for (let i = 0; i < 32; i++) {
        const tile = tiles.nth(i),
          id = await tile.getAttribute('data-tile-id');
        await tile.click();
        assert.ok(
          (await page.locator('output').first().textContent()).includes(id),
        );
      }
      await tiles.nth(0).focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.ok(
        (await page.locator('output').first().textContent()).includes(
          await tiles.nth(1).getAttribute('data-tile-id'),
        ),
      );
      await page.locator('.pm-art-credits summary').click();
      assert.equal(
        await page.locator('.pm-art-credits').getAttribute('open'),
        '',
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false);
      await page.goto(
        `${origin}/board-art-preview.html?stage=final&corners=1&overlap=1`,
        { waitUntil: 'networkidle' },
      );
      const feet = await page.locator('.pm-iso-pawn').evaluateAll((nodes) =>
        nodes.map((n) => ({
          y: parseFloat(n.style.top),
          depth: Number(n.style.zIndex),
        })),
      );
      assert.equal(feet.length, 4);
      for (const a of feet)
        for (const b of feet) if (a.y < b.y) assert.ok(a.depth <= b.depth);
      assert.equal(
        await page.locator('.pm-iso-facility [data-scene="bell"]').count(),
        2,
      );
      assert.equal(
        await page
          .locator('.pm-iso-facility [data-model="cultural-hall"]')
          .count(),
        1,
      );
      await page.screenshot({
        path: `${folder}/${mode}-${width}-overlap.png`,
        fullPage: true,
      });
      assert.equal(errors.length, 0);
      assert.equal(failed.length, 0);
      reports.push({
        mode,
        width,
        transitions,
        decoded,
        clicks: 32,
        keyboard: true,
        overflow,
        feet,
        errors,
        failed,
      });
      await page.close();
    }
  }
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto('http://127.0.0.1:5194/board-art-preview.html', {
    waitUntil: 'networkidle',
  });
  await reduced.locator('button[data-stage="shop"]').click();
  assert.equal(
    await reduced
      .locator('.pm-board')
      .evaluate((n) => n.getAnimations({ subtree: true }).length),
    0,
  );
  await reduced.close();
  // Read-only existing game demo, with existing setup and holdings fixture.
  for (const [mode, origin] of [
    ['dev', 'http://127.0.0.1:5194'],
    ['production', 'http://127.0.0.1:5195'],
    ['subpath', 'http://127.0.0.1:5196/board-art'],
  ]) {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(`${origin}/game-preview.html?board=32&showcase=1`, {
        waitUntil: 'networkidle',
      });
      await page.locator('.pm-setup-title .pm-primary').click();
      await page.locator('.pm-setup-starter .pm-primary').click();
      await page.locator('.pm-setup-map .pm-primary').click();
      await page.locator('.pm-board-iso').waitFor();
      const stages = await page
        .locator('.pm-iso-facility [data-stage]')
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.stage));
      assert.ok(
        stages.includes('unowned') &&
          stages.includes('shop') &&
          stages.includes('center') &&
          stages.includes('final'),
      );
      await page.screenshot({
        path: `${folder}/existing-demo-${mode}-${width}.png`,
        fullPage: true,
      });
      await page.locator('.pm-iso-tile.pm-city').first().click();
      assert.equal(await page.locator('dialog[open]').count(), 1);
      await page.keyboard.press('Escape');
      reports.push({
        existingDemo: true,
        mode,
        width,
        stages,
        tileDialog: true,
      });
      await page.close();
    }
  }
  await writeFile(`${folder}/report.json`, JSON.stringify(reports, null, 2));
  process.stdout.write(
    JSON.stringify(
      reports.map((r) => ({
        mode: r.mode,
        width: r.width,
        stages: r.transitions?.length,
        decoded: r.decoded?.length,
        clicks: r.clicks,
        existingDemo: r.existingDemo,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
