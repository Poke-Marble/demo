/* global window, document */
import { chromium } from '../../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
const folder = 'artifacts/combined-mounted';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 720 },
    });
    const errors = [];
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.log('PAGEERROR', e.message);
    });
    await page.goto(
      (process.env.GAME_URL ?? 'http://127.0.0.1:5228') +
        '/actual-flight-preview.html',
    );
    await page.locator('body[data-actual-ready]').waitFor({ timeout: 10000 });
    await page.locator('.phaser-board[data-flight-selection=true]').waitFor();
    const before = await page.evaluate(() => ({
      revision: window.actualFlightQA.state.economy.revision,
      destination: window.actualFlightQA.view.flightSelection.destinations.find(
        (d) => d.metadata?.kind === 'city',
      ).tileId,
    }));
    await page.locator('.pm-board-flight details summary').click();
    await page
      .locator(
        `.pm-board-flight-list button[data-tile-id="${before.destination}"]`,
      )
      .click();
    await page
      .getByRole('button', { name: '목적지 확정', exact: true })
      .evaluate((b) => {
        b.click();
        b.click();
      });
    await page
      .locator('.pm-mounted-flight[data-state=ready][data-phase=cross]')
      .waitFor();
    const cross = await page.evaluate(() => {
      const canvas = document.querySelector('.pm-mounted-sprite');
      const r = canvas.getBoundingClientRect();
      const data = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width,
        top = canvas.height,
        right = 0,
        bottom = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (data[(y * canvas.width + x) * 4 + 3]) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
          }
      return {
        mounted: document.querySelector('.phaser-board').dataset.mountedPlayer,
        pokemon: document.querySelector('.pm-mounted-flight').dataset.pokemonId,
        rect: document
          .querySelector('.pm-mounted-sprite')
          .getBoundingClientRect()
          .toJSON(),
        board: document
          .querySelector('.phaser-board canvas')
          .getBoundingClientRect()
          .toJSON(),
        opaque: {
          x: r.x + (left * r.width) / canvas.width,
          y: r.y + (top * r.height) / canvas.height,
          right: r.x + (right * r.width) / canvas.width,
          bottom: r.y + (bottom * r.height) / canvas.height,
        },
      };
    });
    await page.screenshot({ path: `${folder}/cross-${width}.png` });
    assert.ok(
      cross.opaque.x >= 0 && cross.opaque.right <= width,
      'mounted sprite inside viewport ' + JSON.stringify({ width, ...cross }),
    );
    assert.ok(
      cross.opaque.y >= 0 && cross.opaque.bottom <= (width === 390 ? 844 : 720),
    );
    assert.equal(cross.mounted, 'player:1');
    assert.equal(cross.pokemon, 'pokemon:0007');
    await page.screenshot({ path: `${folder}/cross-${width}.png` });
    await page.locator('.pm-mounted-flight[data-phase=land]').waitFor();
    await page.screenshot({ path: `${folder}/land-${width}.png` });
    await page.waitForFunction(
      () => window.actualFlightQA.receipts[0]?.ack === 1,
    );
    const receipt = await page.evaluate(
      () => window.actualFlightQA.receipts[0],
    );
    assert.equal(receipt.revision, before.revision + 1);
    assert.equal(receipt.to, before.destination);
    assert.equal(receipt.actualPosition, receipt.to);
    assert.equal(receipt.ack, 1);
    assert.deepEqual(errors, []);
    report.push({ width, cross, receipt, errors });
    await page.close();
  }
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
