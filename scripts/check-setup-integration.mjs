/* global document, getComputedStyle, innerWidth, innerHeight */
import { chromium } from '../../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
const directory = 'artifacts/combined-setup';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [375, 812],
    [844, 390],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5228');
    await page.evaluate(() => document.fonts.ready);
    async function measure(stage) {
      const geometry = await page.evaluate(() => {
        const lobby = document.querySelector('.pm-lobby');
        const rect = (n) => n.getBoundingClientRect().toJSON();
        return {
          viewport: [innerWidth, innerHeight],
          document: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
          lobby: {
            client: [lobby.clientWidth, lobby.clientHeight],
            scroll: [lobby.scrollWidth, lobby.scrollHeight],
            rect: rect(lobby),
          },
          buttons: [...lobby.querySelectorAll('button')]
            .filter((n) => n.checkVisibility())
            .map((n) => ({ text: n.textContent, ...rect(n) })),
          font: getComputedStyle(document.querySelector('.pm-game')).fontFamily,
        };
      });
      assert.deepEqual(
        geometry.document,
        [width, height],
        stage + ' outer scroll',
      );
      assert.ok(
        geometry.lobby.scroll[0] <= geometry.lobby.client[0] + 1,
        stage + ' lobby horizontal scroll',
      );
      assert.ok(
        geometry.lobby.scroll[1] <= geometry.lobby.client[1] + 1,
        `${width}x${height} ${stage} lobby vertical scroll: ${JSON.stringify(geometry.lobby)}`,
      );
      assert.ok(
        geometry.buttons.every(
          (b) =>
            b.x >= 0 &&
            b.y >= 0 &&
            b.right <= width + 1 &&
            b.bottom <= height + 1,
        ),
        stage + ' button bounds',
      );
      report.push({ width, height, stage, geometry });
    }
    assert.equal(await page.locator('.pm-title').innerText(), 'Poké Marble');
    await measure('title');
    await page.screenshot({ path: `${directory}/title-${width}.png` });
    await page.getByRole('button', { name: /NEW GAME/ }).click();
    for (const name of ['이상해씨', '파이리', '꼬부기', '피카츄']) {
      await page
        .getByRole('button', { name: name + ' 선택', exact: true })
        .click();
      await measure('starter-' + name);
      await page
        .getByRole('button', { name: '기술 정보', exact: true })
        .click();
      const dialog = page.locator('.pm-setup-info-dialog');
      assert.match(await dialog.innerText(), /경기당 3회/);
      const details = await dialog.evaluate((d) => {
        const body = d.querySelector('.pm-dialog-body'),
          close = d.querySelector('.pm-dialog-footer button'),
          title = d.querySelector('h2');
        body.scrollTop = body.scrollHeight;
        const content = body.querySelector('.pm-setup-info-content');
        content.scrollTop = content.scrollHeight;
        return {
          title: title.getBoundingClientRect().toJSON(),
          body: content.getBoundingClientRect().toJSON(),
          close: close.getBoundingClientRect().toJSON(),
          last: body
            .querySelector('section:last-child p:last-child')
            .getBoundingClientRect()
            .toJSON(),
        };
      });
      assert.ok(
        details.title.bottom <= details.body.top + 1,
        'title above scroller',
      );
      assert.ok(
        details.close.bottom <= height && details.close.top >= 0,
        'fixed close accessible',
      );
      assert.ok(
        details.last.bottom <= details.body.bottom + 1,
        'full last detail reachable',
      );
      await page.getByRole('button', { name: '닫기', exact: true }).click();
    }
    await page.screenshot({ path: `${directory}/starter-${width}.png` });
    await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
    await measure('map');
    await page.screenshot({ path: `${directory}/map-${width}.png` });
    await page.getByRole('button', { name: /게임 시작/ }).click();
    await page.locator('.phaser-board canvas').waitFor();
    await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
    assert.equal(await page.locator('.phaser-board canvas').count(), 1);
    assert.equal(await page.locator('.pm-hud-portrait').count(), 4);
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.log('PASS setup title/map/4 starters + full details, 4 viewports');
} finally {
  await browser.close();
}
