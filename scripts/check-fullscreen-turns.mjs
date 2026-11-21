/* global document, innerWidth, innerHeight, getComputedStyle */
import process from 'node:process';
import console from 'node:console';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/fullscreen', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.HEADED !== '1',
});
const report = [];
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [844, 390],
    [390, 667],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5194/?fast');
    for (let i = 0; i < 3; i++)
      await page.locator('.pm-primary').click({ force: true });
    await page.waitForSelector('.phaser-board-surface canvas');
    await page.screenshot({ path: 'artifacts/fullscreen/initializing.png' });
    await page.waitForTimeout(1500);
    await page
      .getByRole('button', { name: '도시 목록', exact: true })
      .click({ force: true });
    assert.equal(
      await page.locator('.pm-dialog .phaser-board-tiles button').count(),
      32,
    );
    await page
      .locator('.pm-dialog .phaser-board-tiles button')
      .last()
      .click({ force: true });
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page
      .getByRole('button', { name: '닫기', exact: true })
      .click({ force: true });
    await page
      .getByRole('button', { name: '소리', exact: true })
      .click({ force: true });
    await page.getByRole('slider', { name: '효과음 볼륨' }).fill('25');
    await page.keyboard.press('Escape');
    await page.locator('.pm-action-roll').click({ force: true });
    await page.waitForFunction(
      () => !document.querySelector('.pm-game').inert,
      undefined,
      { polling: 100 },
    );
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      document: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      viewport: [innerWidth, innerHeight],
      canvas: document
        .querySelector('.phaser-board-surface canvas')
        .getBoundingClientRect()
        .toJSON(),
      portraits: [...document.querySelectorAll('.pm-hud-portrait')].map(
        (e) => e.getBoundingClientRect().width,
      ),
      dice: document.querySelector('.pm-dice-result').textContent,
      buttons: [...document.querySelectorAll('.pm-rail button')]
        .filter((e) => e.checkVisibility())
        .map((e) => ({
          text: e.textContent,
          bottom: e.getBoundingClientRect().bottom,
        })),
      dialogs: [...document.querySelectorAll('dialog[open]')].map(
        (e) => e.textContent,
      ),
      bodyOverflow: getComputedStyle(document.body).overflow,
    }));
    assert.deepEqual(state.document, [width, height]);
    assert.ok(state.canvas.height > 140);
    assert.deepEqual(state.portraits, [44, 44, 44, 44]);
    assert.notEqual(state.bodyOverflow, 'hidden');
    assert.ok(state.buttons.every((e) => e.bottom <= height));
    assert.deepEqual(errors, []);
    assert.match(state.dice, /7/);
    await page.screenshot({
      path: `artifacts/fullscreen/turn-${width}x${height}.png`,
    });
    report.push({ width, height, state, errors });
    if (width === 1280) {
      await page
        .locator('.pm-dialog button[data-choice-id]')
        .first()
        .click({ force: true });
      await page.waitForFunction(
        () =>
          !document.querySelector('.pm-game').inert &&
          [...document.querySelectorAll('.pm-controls button')].some(
            (button) =>
              !button.disabled && button.textContent.includes('턴 마치기'),
          ),
        undefined,
        { polling: 100 },
      );
      await page
        .locator('.pm-controls button[data-choice-id]')
        .filter({ hasText: '턴 마치기' })
        .click({ force: true });
      await page
        .waitForFunction(
          () => {
            const roll = document.querySelector('.pm-action-roll');
            const turn = document.querySelector(
              '.pm-rail > .pm-eyebrow',
            )?.textContent;
            return (
              roll &&
              !roll.disabled &&
              !document.querySelector('.pm-game').inert &&
              turn === 'TURN 5'
            );
          },
          undefined,
          { polling: 100, timeout: 60000 },
        )
        .catch(async (error) => {
          console.log(await page.locator('body').innerText());
          await page.screenshot({ path: 'artifacts/fullscreen/ai-stall.png' });
          throw error;
        });
      report.at(-1).humanAndThreeComputerTurns = true;
      await page.screenshot({
        path: 'artifacts/fullscreen/after-ai-round.png',
      });
    }
    console.log('PASS', width, height, state.dice);
    await page.close();
  }
  await writeFile(
    'artifacts/fullscreen/turn-report.json',
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
}
