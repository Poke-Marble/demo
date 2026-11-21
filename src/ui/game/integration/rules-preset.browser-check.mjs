/* global window, document */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const base = process.env.PRESENTATION_URL ?? 'http://127.0.0.1:5203';
const folder = 'artifacts/rules-presets';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const report = [];
try {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    for (const preset of ['standard', 'quick']) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/rules-preset-check', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="app"></main></body></html>',
        }),
      );
      await page.goto(`${base}/rules-preset-check`);
      await page.evaluate(async () => {
        const { createIntegratedPreview } =
          await import('/src/ui/game/integration/adapter.ts');
        const { mountGameUI } = await import('/src/ui/game/index.ts');
        window.rulesRuntime = createIntegratedPreview({
          seed: 1,
          computerDelayMs: 0,
        });
        window.rulesPresentations = 0;
        const subscribe = window.rulesRuntime.adapter.subscribe;
        window.rulesRuntime.adapter.subscribe = (listener) =>
          subscribe((update) => {
            window.rulesPresentations++;
            listener({
              ...update,
              presentationComplete: () => {
                update.presentationComplete?.();
                window.rulesPresentations--;
              },
            });
          });
        mountGameUI(
          document.querySelector('#app'),
          window.rulesRuntime.adapter,
        );
      });
      await page.locator('.pm-setup-title .pm-primary').click();
      await page.locator('.pm-setup-starter .pm-primary').click();
      assert.equal(await page.getByLabel('경기 규칙').inputValue(), 'standard');
      await page.getByLabel('경기 규칙').selectOption(preset);
      await page.getByRole('button', { name: '파트너 다시 선택' }).click();
      await page.locator('.pm-setup-starter .pm-primary').click();
      assert.equal(await page.getByLabel('경기 규칙').inputValue(), preset);
      await page.screenshot({
        path: `${folder}/${preset}-${viewport.width}-setup.png`,
      });
      await writeFile(
        `${folder}/setup-dom.txt`,
        await page.locator('body').innerText(),
      );
      const start = page.locator('[data-focus="setup-start"]');
      const bounds = await start.boundingBox();
      assert.ok(
        bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      );
      await page.screenshot({
        path: `${folder}/${preset}-${viewport.width}-setup.png`,
      });
      await start.click();
      await page.waitForFunction(() => window.rulesPresentations === 0);
      const state = await page.evaluate(() => window.rulesRuntime.getState());
      assert.equal(state.phase, 'playing');
      assert.equal(state.economy.profileId, `${preset}-cumulative`);
      assert.deepEqual(
        JSON.parse(state.economy.configurationKey).profile.unlockLaps,
        preset === 'standard' ? [0, 0, 1, 2] : [0, 0, 1, 1],
      );
      await page.getByRole('button', { name: /주사위 굴리기/ }).click();
      try {
        await page.getByRole('dialog').waitFor();
      } catch (error) {
        await page.screenshot({ path: `${folder}/failure.png` });
        await writeFile(
          `${folder}/failure.json`,
          JSON.stringify(
            {
              errors,
              text: await page.locator('body').innerText(),
              state: await page.evaluate(() => window.rulesRuntime.getState()),
              view: await page.evaluate(() =>
                window.rulesRuntime.adapter.getView(),
              ),
            },
            null,
            2,
          ),
        );
        throw error;
      }
      const description = await page.getByRole('dialog').innerText();
      assert.match(description, /개인 1주회 완료 필요 \(현재 0주회\)/);
      assert.match(description, /센터 건설 후 이 도시에 다시 도착/);
      if (preset === 'standard')
        assert.match(description, /개인 2주회 완료 필요/);
      else assert.doesNotMatch(description, /개인 2주회/);
      await page.screenshot({
        path: `${folder}/${preset}-${viewport.width}-purchase.png`,
      });
      assert.deepEqual(errors, []);
      report.push({
        preset,
        viewport,
        profileId: state.economy.profileId,
        description,
        errors,
      });
      await page.close();
    }
  }
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
