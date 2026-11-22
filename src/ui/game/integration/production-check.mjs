/* global document, innerWidth, Image, performance, window, MutationObserver */
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
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { plan } from '../../../game/ai/planner.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await fs.mkdir('artifacts/presentation-integration', { recursive: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [],
  failed = [],
  receipts = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('ERROR', e.message);
});
page.on('requestfailed', (r) => failed.push(r.url()));
try {
  await page.goto(
    `${process.env.PRODUCTION_URL ?? 'http://127.0.0.1:5186'}/?qa&fast&seed=1`,
  );
  assert.equal(await page.locator('.pm-sfx-controls').count(), 0);
  await page.getByRole('button', { name: /NEW GAME/ }).click();
  await page.getByRole('button', { name: '꼬부기 선택', exact: true }).click();
  await page.screenshot({
    path: 'artifacts/presentation-integration/production-starter-1280.png',
  });
  await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
  await page.getByRole('button', { name: /게임 시작/ }).click();
  await page.locator('.phaser-board canvas').waitFor();
  assert.equal(await page.locator('.phaser-board canvas').count(), 1);
  await page.evaluate(() => {
    window.qaSkills = [];
    const node = document.querySelector('.pm-skill-presentation');
    if (node)
      new MutationObserver(() => {
        if (!node.hidden)
          window.qaSkills.push({
            type: node.dataset.type,
            text: node.textContent,
          });
      }).observe(node, { attributes: true, attributeFilter: ['hidden'] });
  });
  const roll = page.getByRole('button', { name: /주사위 굴리기/ });
  await roll.waitFor();
  await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
  await roll.evaluate((button) => {
    button.click();
    button.click();
  });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#app').dataset.qaSnapshot).revision ===
      '1',
  );
  let lastRevision = -1,
    lastProgress = Date.now(),
    ended = false,
    trial = false,
    dice = false,
    bought = false,
    mobile = false;
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const snap = await page
      .locator('#app')
      .getAttribute('data-qa-snapshot')
      .then((s) => s && JSON.parse(s));
    if (!snap) {
      await page.waitForTimeout(30);
      continue;
    }
    if (snap.revision !== lastRevision) {
      lastRevision = snap.revision;
      lastProgress = Date.now();
      receipts.push({
        turn: snap.turn,
        revision: snap.revision,
        cash: snap.cash,
        phase: snap.phase,
      });
    }
    assert.ok(
      Date.now() - lastProgress < 15000,
      'presentation or turn stalled',
    );
    const event = page.locator('.pm-legendary-sprite[data-state="ready"]');
    if (!trial && (await event.count())) {
      await page.screenshot({
        path: 'artifacts/presentation-integration/production-legendary-1280.png',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: 'artifacts/presentation-integration/production-legendary-390.png',
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      trial = true;
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    if (
      !dice &&
      (await page.locator('.pm-feedback-overlay:not([hidden])').count())
    ) {
      await page.screenshot({
        path: 'artifacts/presentation-integration/production-dice-1280.png',
      });
      dice = true;
    }
    if (snap.phase === 'finished') {
      const row = page.locator(
        `.pm-hud-player[data-player-id="${snap.activePlayerId}"]`,
      );
      assert.ok(
        (await row.locator('[data-testid="pm-balance"]').innerText()).includes(
          new Intl.NumberFormat('ko-KR').format(snap.cash),
        ),
      );
      const owned = snap.properties.filter(
        (p) => p.ownerId === snap.activePlayerId,
      );
      const cities = owned.filter(
        (p) => kantoJohtoMap.tiles.find((t) => t.id === p.id)?.kind === 'city',
      ).length;
      const landmarks = owned.filter(
        (p) =>
          kantoJohtoMap.tiles.find((t) => t.id === p.id)?.kind === 'landmark',
      ).length;
      assert.ok(
        (await row.locator('.pm-hud-assets').innerText()).includes(
          `도시 ${cities} · 특별 명소 ${landmarks}`,
        ),
      );
      await page
        .getByRole('button', { name: /새 여행 시작/ })
        .waitFor({ timeout: 10000 });
      await page.screenshot({
        path: 'artifacts/presentation-integration/production-victory-1280.png',
      });
      console.log(
        'FINISHED',
        snap.turn,
        snap.revision,
        await page.locator('dialog').innerText(),
      );
      ended = true;
      break;
    }
    if (
      snap.players.find((p) => p.id === snap.activePlayerId)?.controller ===
      'human'
    ) {
      const choice = plan(
        {
          ...snap,
          players: snap.players.map((p) => ({ ...p, controller: 'computer' })),
        },
        42,
      )?.candidate;
      if (choice) {
        if (choice.action.type === 'fly') {
          const name = kantoJohtoMap.tiles.find(
            (t) => t.id === choice.action.to,
          ).nameKo;
          const destination = page
            .locator('.pm-flight-picker .pm-flight-card')
            .filter({ has: page.getByText(name, { exact: true }) });
          if ((await destination.count()) && (await destination.isEnabled())) {
            await destination.click();
            await page
              .getByRole('button', { name: '목적지 확정', exact: true })
              .click();
          }
        } else {
          if (
            choice.action.type === 'sell-property' &&
            !(await page.locator('dialog[open]').count())
          ) {
            const sales = page.getByRole('button', {
              name: '매각 선택',
              exact: true,
            });
            if (await sales.count()) await sales.click();
          }
          const nodes = page.locator('button[data-choice-id]');
          const index = await nodes.evaluateAll(
            (ns, id) => ns.findIndex((n) => n.dataset.choiceId === id),
            choice.id,
          );
          if (index >= 0 && (await nodes.nth(index).isEnabled())) {
            if (
              !bought &&
              ['construct-property', 'buy-landmark'].includes(
                choice.action.type,
              )
            ) {
              await page.screenshot({
                path: 'artifacts/presentation-integration/production-quote-1280.png',
              });
              bought = true;
            }
            await nodes.nth(index).click();
          }
        }
      }
    }
    if (!mobile && Number(snap.turn) >= 5) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: 'artifacts/presentation-integration/production-game-390.png',
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      mobile = true;
    }
    if (!trial && Number(snap.turn) > 24)
      await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(25);
  }
  assert.ok(ended, 'real game did not finish within 240 seconds');
  const images = await page.evaluate(async () => {
    const urls = new Set([
      ...performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((s) => /\.png(?:$|\?)/.test(s)),
      ...Array.from(document.images)
        .map((i) => i.src)
        .filter(Boolean),
    ]);
    return Promise.all(
      [...urls].map(async (src) => {
        const img = new Image();
        img.src = src;
        try {
          await img.decode();
          return { src, ok: true, width: img.naturalWidth };
        } catch {
          return { src, ok: false };
        }
      }),
    );
  });
  assert.ok(images.every((i) => i.ok));
  await page.getByRole('button', { name: /새 여행 시작/ }).click();
  await page.getByRole('button', { name: /NEW GAME/ }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'artifacts/presentation-integration/production-restart-390.png',
  });
  await fs.writeFile(
    'artifacts/presentation-integration/production-report.json',
    JSON.stringify(
      {
        skillPresentations: await page.evaluate(() => window.qaSkills),
        errors,
        failed,
        ended,
        trial,
        dice,
        bought,
        mobile,
        duplicateInput: true,
        hudAuthority: true,
        receipts,
        images,
      },
      null,
      2,
    ),
  );
  assert.equal(errors.length, 0);
  assert.equal(failed.length, 0);
  console.log('PASS', {
    ended,
    trial,
    dice,
    bought,
    mobile,
    images: images.length,
  });
} catch (error) {
  await page.screenshot({
    path: 'artifacts/presentation-integration/stall.png',
    fullPage: true,
  });
  console.log(await page.locator('#app').getAttribute('data-qa-snapshot'));
  console.log(await page.locator('body').innerText());
  console.log(
    await page.locator('button[data-choice-id]').evaluateAll((ns) =>
      ns.map((n) => ({
        id: n.dataset.choiceId,
        disabled: n.disabled,
        inert: n.closest('.pm-game').inert,
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
