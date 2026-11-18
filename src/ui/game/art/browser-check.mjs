/* global document, getComputedStyle, Image, innerWidth */
// Isolated headless UI regression; never connects to a user's Chrome session.
// npm install --prefix artifacts/browser-tools --no-package-lock playwright
// node src/ui/game/art/browser-check.mjs
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
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
await mkdir('artifacts/board-art-qa', { recursive: true });
const reports = [];
try {
  for (const [mode, origin] of [
    ['dev', 'http://127.0.0.1:5194'],
    ['production', 'http://127.0.0.1:5195'],
    ['subpath', 'http://127.0.0.1:5196/board-art'],
  ]) {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        deviceScaleFactor: 1,
      });
      const failed = [],
        responses = [],
        errors = [];
      page.on('requestfailed', (r) =>
        failed.push({ url: r.url(), error: r.failure() }),
      );
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.request().resourceType() === 'image')
          responses.push({ url: r.url(), status: r.status() });
      });
      await page.goto(`${origin}/board-art-preview.html`, {
        waitUntil: 'networkidle',
      });
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[data-foot-aligned="true"]').length === 4,
      );
      const diagnostic = await page.evaluate(async () => {
        const elements = [...document.querySelectorAll('image,img')];
        const urls = elements.map(
          (el) => el.getAttribute('href') || el.getAttribute('src'),
        );
        const backgrounds = [...document.querySelectorAll('*')]
          .map((el) => getComputedStyle(el).backgroundImage)
          .filter((x) => x.startsWith('url('));
        urls.push(...backgrounds.map((x) => x.slice(5, -2)));
        const images = await Promise.all(
          [...new Set(urls)].map(async (url) => {
            const im = new Image();
            im.src = url;
            try {
              await im.decode();
              return {
                url,
                ok: true,
                width: im.naturalWidth,
                height: im.naturalHeight,
              };
            } catch {
              return { url, ok: false };
            }
          }),
        );
        return {
          images,
          svgImages: elements.length,
          backgrounds: backgrounds.length,
          boardBackground: getComputedStyle(document.querySelector('.pm-board'))
            .backgroundImage,
          facilities: [...document.querySelectorAll('.pm-iso-facility')].map(
            (el) => ({
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
              transform: getComputedStyle(el).transform,
              pointerEvents: getComputedStyle(el).pointerEvents,
            }),
          ),
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(errors.length, 0);
      assert.equal(failed.length, 0);
      assert.ok(responses.every((r) => r.status === 200 || r.status === 304));
      assert.ok(responses.length >= 11);
      assert.ok(diagnostic.images.every((i) => i.ok));
      assert.equal(diagnostic.backgrounds, 4);
      assert.equal(diagnostic.pageOverflow, false);
      assert.equal(
        new Set(
          diagnostic.facilities.map(
            (f) => `${f.width.toFixed(2)}/${f.height.toFixed(2)}`,
          ),
        ).size,
        1,
      );
      assert.ok(diagnostic.facilities.every((f) => f.pointerEvents === 'none'));
      await page.screenshot({
        path: `artifacts/board-art-qa/${mode}-${width}.png`,
        fullPage: true,
      });
      const tiles = page.locator('.pm-iso-tile');
      for (let i = 0; i < 32; i++) {
        const tile = tiles.nth(i);
        const id = await tile.getAttribute('data-tile-id');
        await tile.click();
        assert.ok((await page.locator('output').textContent()).includes(id));
      }
      await tiles.nth(0).focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.ok(
        (await page.locator('output').textContent()).includes(
          await tiles.nth(1).getAttribute('data-tile-id'),
        ),
      );
      await page.locator('.pm-art-credits summary').click();
      assert.equal(
        await page.locator('.pm-art-credits').getAttribute('open'),
        '',
      );
      await page.screenshot({
        path: `artifacts/board-art-qa/${mode}-${width}-credits.png`,
        fullPage: true,
      });
      await page.goto(`${origin}/board-art-preview.html?corners=1&overlap=1`, {
        waitUntil: 'networkidle',
      });
      assert.equal(await page.locator('.pm-iso-pawn').count(), 4);
      const feet = await page.locator('.pm-iso-pawn').evaluateAll((nodes) =>
        nodes.map((n) => ({
          top: parseFloat(n.style.top),
          z: Number(n.style.zIndex),
        })),
      );
      for (const a of feet)
        for (const b of feet) if (a.top < b.top) assert.ok(a.z <= b.z);
      await page.screenshot({
        path: `artifacts/board-art-qa/${mode}-${width}-overlap.png`,
        fullPage: true,
      });
      reports.push({
        mode,
        width,
        failed,
        responses,
        errors,
        diagnostic,
        clicks: 32,
        keyboard: 'Tab/Enter passed',
        feet,
      });
      await page.close();
    }
  }
  for (const [mode, origin] of [
    ['dev', 'http://127.0.0.1:5194'],
    ['production', 'http://127.0.0.1:5195'],
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
    });
    await page.route(
      (url) =>
        /\/(center|gym|port|tree|townhouse|Idle-Anim)(-[\w-]+)?\.png$/.test(
          url.pathname,
        ),
      (route) =>
        route.request().resourceType() === 'image'
          ? route.abort()
          : route.continue(),
    );
    await page.goto(`${origin}/board-art-preview.html`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.pm-regional-sprite image').length === 0 &&
        document.querySelectorAll(
          '.pm-pawn-figure[data-asset-status="fallback"]',
        ).length === 4,
    );
    const fallback = await page
      .locator('.pm-regional-sprite[data-asset-status="fallback"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          images: n.querySelectorAll('image').length,
          display: n
            .querySelector('.pm-asset-fallback')
            .getAttribute('display'),
        })),
      );
    assert.equal(fallback.length, 34);
    assert.ok(fallback.every((f) => f.images === 0 && f.display === null));
    await page.screenshot({
      path: `artifacts/board-art-qa/${mode}-request-failure-fallback.png`,
      fullPage: true,
    });
    reports.push({
      mode,
      failureInjection: true,
      fallbackCount: fallback.length,
      pawnFallback: 4,
    });
    await page.close();
  }
  await writeFile(
    'artifacts/board-art-qa/report.json',
    JSON.stringify(reports, null, 2),
  );
  process.stdout.write(
    JSON.stringify(
      reports.map((r) => ({
        mode: r.mode,
        width: r.width,
        images: r.responses?.length,
        decoded: r.diagnostic?.images.length,
        clicks: r.clicks,
        errors: r.errors,
        fallbackCount: r.fallbackCount,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
