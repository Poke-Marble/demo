/* global document, window, getComputedStyle, setTimeout, console */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ||
        'artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const origin = process.env.LEGENDARY_ORIGIN || 'http://127.0.0.1:5175';
const dir = process.env.LEGENDARY_QA_DIR || 'artifacts/legendary-qa';
await mkdir(dir, { recursive: true });
// Same isolated fixture with bde04c3 presenter/CSS: no changes to the baseline worktree.
if (!process.env.LEGENDARY_SKIP_BEFORE) {
  const old = (path) =>
    execFileSync('git', ['show', `bde04c3:${path}`], { encoding: 'utf8' });
  await writeFile(
    `${dir}/before.ts`,
    old('src/ui/game/events/presenter.ts')
      .replace("'./queue'", "'/src/ui/game/events/queue'")
      .replace("'./special-events.css'", "'./before.css'"),
  );
  await writeFile(
    `${dir}/before.css`,
    old('src/ui/game/events/special-events.css'),
  );
  const entry = await readFile(
    'src/ui/game/events/legendary-visual-preview.ts',
    'utf8',
  );
  await writeFile(
    `${dir}/entry.ts`,
    entry
      .replace("'./presenter'", "'./before'")
      .replace("'../../../assets/sprites'", "'/src/assets/sprites'"),
  );
  await writeFile(
    `${dir}/before.html`,
    (await readFile('legendary-visual-preview.html', 'utf8')).replace(
      '/src/ui/game/events/legendary-visual-preview.ts',
      '/artifacts/legendary-qa/entry.ts',
    ),
  );
}
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const reports = [];
try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (!process.env.LEGENDARY_SKIP_BEFORE && width !== 844) {
      await page.goto(`${origin}/artifacts/legendary-qa/before.html`);
      await page.evaluate(() => window.legendaryPreview.play('lugia'));
      await page.waitForTimeout(3200);
      await page.screenshot({ path: `${dir}/before-${width}.png` });
    }
    await page.goto(`${origin}/legendary-visual-preview.html`);
    for (const bird of ['lugia', 'ho-oh']) {
      await page.evaluate((b) => window.legendaryPreview.play(b), bird);
      await page.locator('.pm-legendary-sprite[data-state="ready"]').waitFor();
      assert.equal(
        await page
          .locator(
            '.pm-event-wing,.pm-event-body,.pm-event-feathers,.pm-event-shadow',
          )
          .count(),
        0,
      );
      const sample = await page.locator('canvas').evaluate((c) => {
        const rect = c.getBoundingClientRect(),
          dialog = c.closest('dialog').getBoundingClientRect();
        const alpha = c
          .getContext('2d')
          .getImageData(0, 0, 120, 128)
          .data.filter((_, i) => i % 4 === 3);
        return {
          width: rect.width,
          height: rect.height,
          inside:
            rect.left >= dialog.left &&
            rect.right <= dialog.right &&
            rect.bottom <= dialog.bottom,
          visible: getComputedStyle(c.closest('.pm-event-graphic')).opacity,
          opaque: alpha.filter((a) => a === 255).length,
          transparent: alpha.filter((a) => a === 0).length,
        };
      });
      assert.ok(sample.inside);
      assert.equal(sample.visible, '1');
      assert.equal(sample.width / 120, sample.height / 128);
      assert.ok(Number.isInteger(sample.width / 120));
      assert.ok(sample.opaque > 100 && sample.transparent > 1000);
      const title = await page.locator('.pm-event-eyebrow').boundingBox();
      assert.ok(title.y >= 0 && title.y + title.height <= height);
      await page.screenshot({
        path: `${dir}/after-${bird}-${width}x${height}.png`,
      });
      await page.waitForTimeout(3100);
      assert.equal(
        await page
          .locator('.pm-legendary-sprite')
          .getAttribute('data-animation'),
        'Attack',
      );
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog').count(), 0);
      reports.push({
        viewportWidth: width,
        viewportHeight: height,
        bird,
        ...sample,
      });
    }
    // Real Chrome rendering: one original bird crosses horizontally once.
    await page.locator('#flight').click();
    await page.locator('.pm-event-fly [data-state="ready"]').waitFor();
    assert.equal(
      await page
        .locator(
          '.pm-event-wing,.pm-event-body,.pm-event-feathers,.pm-event-shadow',
        )
        .count(),
      0,
    );
    await page.waitForTimeout(2400);
    const beforeFlight = await page
      .locator('.pm-event-fly canvas')
      .boundingBox();
    await page.waitForTimeout(1800);
    const afterFlight = await page
      .locator('.pm-event-fly canvas')
      .boundingBox();
    assert.ok(afterFlight.x > beforeFlight.x + 40);
    assert.equal(afterFlight.y, beforeFlight.y);
    assert.equal(
      await page.locator('.pm-event-fly [data-animation="Hover"]').count(),
      1,
    );
    await page.screenshot({ path: `${dir}/flight-${width}x${height}.png` });
    await page.locator('.pm-event-fly[data-phase="3"]').waitFor();
    assert.match(
      await page.locator('.pm-event-caption').textContent(),
      /\uBC29\uC6B8\uD0D1 \uB3C4\uCC29/,
    );
    await page.locator('.pm-event-fly').waitFor({ state: 'detached' });
    reports.push({
      viewportWidth: width,
      flight: { beforeFlight, afterFlight, arrival: true, completed: true },
    });
    // Cancel, restart (same tick), unmount, and no resurrection.
    await page.evaluate(() => {
      const q = window.legendaryPreview;
      q.play('lugia');
      q.presenter.reset();
      q.play('ho-oh');
    });
    await page.locator('.pm-event-ho-oh').waitFor();
    await page.evaluate(() => window.legendaryPreview.presenter.skip());
    assert.equal(await page.locator('dialog').count(), 0);
    await page.evaluate(() => window.legendaryPreview.play('lugia'));
    await page.evaluate(() => window.legendaryPreview.presenter.destroy());
    await page.waitForTimeout(150);
    assert.equal(await page.locator('dialog').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Failed selected images cannot fall back to a fabricated bird.
  const failed = await browser.newPage();
  await failed.route('**/*.png', (route) => route.abort());
  await failed.goto(`${origin}/legendary-visual-preview.html`);
  await failed.evaluate(() => window.legendaryPreview.play('lugia'));
  await failed.locator('[data-state="failed"]').waitFor();
  assert.equal(await failed.locator('canvas').isVisible(), false);
  assert.equal(
    await failed
      .locator(
        '.pm-event-wing,.pm-event-body,.pm-event-feathers,.pm-event-shadow',
      )
      .count(),
    0,
  );
  await failed.screenshot({ path: `${dir}/fallback.png` });
  await failed.close();
  // Images arriving after restart/destroy must never mutate a replacement modal.
  const late = await browser.newPage();
  await late.route('**/*.png', async (route) => {
    await new Promise((r) => setTimeout(r, 450));
    await route.continue();
  });
  await late.goto(`${origin}/legendary-visual-preview.html`);
  await late.evaluate(() => window.legendaryPreview.play('lugia'));
  await late.evaluate(() => {
    window.legendaryPreview.presenter.reset();
    window.legendaryPreview.play('ho-oh');
  });
  await late.locator('.pm-event-ho-oh [data-state="ready"]').waitFor();
  assert.equal(await late.locator('.pm-event-lugia').count(), 0);
  await late.evaluate(() => window.legendaryPreview.presenter.destroy());
  await late.waitForTimeout(600);
  assert.equal(await late.locator('dialog').count(), 0);
  await late.close();
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(`${origin}/legendary-visual-preview.html`);
  const summary = await reduced.evaluate(async () => {
    window.legendaryPreview.play('lugia');
    await Promise.resolve();
    await Promise.resolve();
    const d = document.querySelector('dialog');
    return {
      phase: d?.getAttribute('data-phase'),
      reduced: d?.classList.contains('pm-event-reduced'),
      text: d?.textContent,
    };
  });
  assert.equal(summary.phase, '3');
  assert.equal(summary.reduced, true);
  await reduced.waitForTimeout(200);
  assert.equal(await reduced.locator('dialog').count(), 0);
  await reduced.close();
  // Flight reduced-motion summary stays static and releases at 120ms.
  const reducedFlight = await browser.newPage({ reducedMotion: 'reduce' });
  await reducedFlight.goto(`${origin}/legendary-visual-preview.html`);
  const flightSummary = await reducedFlight.evaluate(async () => {
    document.querySelector('#flight').click();
    await Promise.resolve();
    await Promise.resolve();
    const dialog = document.querySelector('dialog');
    const graphic = document.querySelector('.pm-event-graphic');
    return {
      phase: dialog.dataset.phase,
      text: dialog.textContent,
      animation: getComputedStyle(graphic).animationName,
      position: getComputedStyle(graphic).position,
    };
  });
  assert.equal(flightSummary.phase, '3');
  assert.equal(flightSummary.animation, 'none');
  assert.equal(flightSummary.position, 'static');
  assert.match(flightSummary.text, /\uBC29\uC6B8\uD0D1 \uB3C4\uCC29/);
  await reducedFlight.waitForTimeout(200);
  assert.equal(await reducedFlight.locator('dialog').count(), 0);
  await reducedFlight.emulateMedia({ reducedMotion: 'no-preference' });
  await reducedFlight.locator('#flight').click();
  await reducedFlight.keyboard.press('Enter');
  assert.equal(await reducedFlight.locator('dialog').count(), 0);
  await reducedFlight.close();
  await writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        origin,
        reports,
        summary,
        flightSummary,
        lifecycle:
          'skip/cancel/reset/restart/destroy/late-load/failure/reduced/flight passed',
      },
      null,
      2,
    ),
  );
  console.log(
    `Chrome passed: ${reports.length} sprite/viewport samples and lifecycle scenarios. ${dir}/report.json`,
  );
} finally {
  await browser.close();
}
