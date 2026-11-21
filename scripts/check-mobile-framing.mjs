/* global document, innerWidth, innerHeight */
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
const folder = 'artifacts/mobile-framing';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { browser: browser.version(), screens: [] };
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
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5201/?fast');
    for (let i = 0; i < 3; i++) await page.locator('.pm-primary').click();
    await page.waitForSelector('.phaser-board[data-locked="false"] canvas');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.phaser-board-surface canvas')
          ?.getBoundingClientRect().width > 0,
    );
    await page.waitForTimeout(1200);
    // Allocation fixture only: actual header rendering is owned by turn UI.
    if (process.env.HEADER_BUDGET === '1') {
      await page
        .locator('.pm-header')
        .evaluate((e) => e.classList.add('pm-header-with-turn'));
      await page.waitForTimeout(200);
    }
    if (process.env.SKILL_BUDGET === '1') {
      await page.locator('.pm-rail').evaluate((e) => {
        const skill = document.createElement('div');
        skill.className = 'pm-skill-hud';
        skill.style.height = innerHeight <= 500 ? '56px' : '64px';
        e.insertBefore(skill, e.querySelector('.pm-controls'));
      });
      await page.waitForTimeout(200);
    }
    const measure = () =>
      page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          viewport: [innerWidth, innerHeight],
          document: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
          surface: rect('.phaser-board-surface'),
          canvas: rect('.phaser-board-surface canvas'),
          hud: rect('.pm-integrated-hud'),
          portraits: [...document.querySelectorAll('.pm-hud-portrait')].map(
            (e) => e.getBoundingClientRect().toJSON(),
          ),
          actions: [...document.querySelectorAll('.pm-rail button')]
            .filter(
              (e) => e.checkVisibility() && !e.closest('.pm-integrated-hud'),
            )
            .map((e) => ({
              text: e.textContent,
              ...e.getBoundingClientRect().toJSON(),
            })),
        };
      });
    const state = await measure();
    await page.screenshot({
      path: `${folder}/${process.env.CAPTURE_PREFIX ?? 'after'}-${width}x${height}.png`,
    });
    console.log(width, height, JSON.stringify(state));
    if (process.env.CAPTURE_PREFIX !== 'before') {
      assert.deepEqual(state.document, state.viewport);
      assert.equal(state.portraits.length, 4);
      assert.ok(
        state.portraits.every(
          (r) => r.width === 44 && r.top >= 0 && r.bottom <= height,
        ),
      );
      assert.ok(
        state.portraits.every(
          (r) => r.top >= state.hud.top && r.bottom <= state.hud.bottom,
        ),
        'all portraits visible inside HUD',
      );
      assert.ok(state.actions.every((r) => r.top >= 0 && r.bottom <= height));
      assert.ok(
        state.canvas.width >= state.surface.width - 1 &&
          state.canvas.height >= state.surface.height - 1,
        'canvas fills allocated surface',
      );
    }
    report.screens.push({ width, height, state, errors });
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(
    `${folder}/${process.env.CAPTURE_PREFIX ?? 'after'}-report.json`,
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
}
