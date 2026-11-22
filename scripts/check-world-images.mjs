/* global Image, document, getComputedStyle */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const reportPath = 'artifacts/world-events/report.json';
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(report.origin);
  const targets = await page.evaluate(async (audit) => {
    const results = [];
    for (const entry of audit) {
      const source = entry.contentType.includes('javascript')
        ? (await import(entry.url)).default
        : entry.url;
      const response = await fetch(source);
      const image = new Image();
      image.src = source;
      let decoded = false;
      try {
        await image.decode();
        decoded = image.naturalWidth > 0;
      } catch {
        /* Report every real failure below. */
      }
      results.push({
        module: entry.url,
        source,
        currentSrc: image.currentSrc,
        contentType: response.headers.get('content-type'),
        status: response.status,
        decoded,
      });
    }
    return results;
  }, report.imageAudit);
  report.imageTargets = targets;
  report.decodeObservationCount = targets.length;
  report.uniqueDecodedAssetCount = new Set(
    targets.map((t) => t.currentSrc),
  ).size;
  report.unsourcedPlaceholders = report.sprites.filter((s) => !s.src).length;
  await page.getByRole('button', { name: /NEW GAME/ }).click();
  await page.getByRole('button', { name: '꼬부기 선택', exact: true }).click();
  await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
  await page.getByRole('button', { name: /게임 시작/ }).click();
  await page.locator('.phaser-board canvas').waitFor();
  report.placeholderDOM = await page.evaluate(() =>
    [...document.images]
      .filter((img) => !img.currentSrc && !img.getAttribute('src'))
      .map((img) => ({
        element: img.outerHTML,
        role: img.parentElement.getAttribute('role'),
        parentClass: img.parentElement.className,
        parentHidden: img.parentElement.hidden,
        parentDisplay: getComputedStyle(img.parentElement).display,
        visibleRects: img.getClientRects().length,
      })),
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  assert.ok(targets.length > 0);
  assert.deepEqual(
    targets.filter(
      (t) =>
        t.status !== 200 ||
        !t.contentType?.startsWith('image/png') ||
        !t.decoded,
    ),
    [],
  );
  assert.deepEqual(
    report.sprites.filter((s) => s.src && !s.ok),
    [],
  );
  assert.ok(
    report.placeholderDOM.every(
      (p) =>
        p.parentHidden &&
        p.parentDisplay === 'none' &&
        p.visibleRects === 0 &&
        p.parentClass === 'ability-hud' &&
        p.role === 'status',
    ),
  );
  console.log(
    `PASS ${targets.length} PNG decode observations / ${report.uniqueDecodedAssetCount} unique assets; ${report.unsourcedPlaceholders} hidden reserved ability-HUD portrait confirmed`,
  );
} finally {
  await browser.close();
}
