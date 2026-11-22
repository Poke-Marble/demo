/* global window, document, innerWidth */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dir = 'artifacts/world-events';
await mkdir(dir, { recursive: true });
const report = [];
const origin = process.env.WORLD_ORIGIN ?? 'http://127.0.0.1:5218';
try {
  const worldSource = await (
    await page.request.get(`${origin}/src/game/world-events/index.ts`)
  ).text();
  const adapterSource = await (
    await page.request.get(`${origin}/src/ui/game/integration/adapter.ts`)
  ).text();
  assert.match(worldSource, /arrivalReward: 50/);
  assert.match(adapterSource, /worldEvents: \{\}/);
  assert.match(adapterSource, /initialRopes: 0/);
  await page.goto(`${origin}/legendary-visual-preview.html`);
  await page.waitForFunction(() => !!window.legendaryPreview);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const legendary of ['lugia', 'ho-oh']) {
      await page.evaluate(
        async ({ legendary, width }) => {
          const { createGame, dispatch } =
            await import('/src/game/core/index.ts');
          const { kantoJohtoMap } =
            await import('/src/data/maps/kanto-johto.ts');
          const { toMapDefinition } = await import('/src/data/maps/types.ts');
          const map = toMapDefinition(kantoJohtoMap);
          const tile = map.tiles.find(
            (t) => t.special === `${legendary}-trial`,
          );
          let state = createGame(
            map,
            Array.from({ length: 4 }, (_, i) => ({
              id: `player:${i}`,
              name: `P${i}`,
              pokemonId: 'pokemon:0001',
            })),
            { seed: 1, legendary: {}, worldEvents: {} },
          );
          let requests = [];
          for (let i = 0; i < 3; i++) {
            const id = `player:${i}`;
            state = {
              ...state,
              activePlayerId: id,
              turnNumber: i + 1,
              core: { ...state.core, rngState: 1, turnStage: 'awaiting-roll' },
              players: state.players.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      position:
                        map.tiles[
                          (map.tiles.indexOf(tile) - 5 + map.tiles.length) %
                            map.tiles.length
                        ].id,
                    }
                  : p,
              ),
            };
            const result = dispatch(state, map, {
              type: 'roll-dice',
              playerId: id,
            });
            if (!result.ok) throw new Error(result.error);
            state = result.state;
            requests = result.presentations;
          }
          window.legendaryPreview.presenter.reset();
          void window.legendaryPreview.presenter.enqueue(
            requests.map((r, i) => ({
              ...r,
              id: `world:${width}:${legendary}:${i}`,
            })),
          );
        },
        { legendary, width },
      );
      const dialog = page.locator('.pm-event-world-event');
      await dialog.waitFor();
      await dialog
        .locator('.pm-legendary-sprite[data-state="ready"]')
        .waitFor();
      assert.match(await dialog.innerText(), /전체 맵 이벤트/);
      assert.match(await dialog.innerText(), /25% 감소/);
      assert.match(await dialog.innerText(), /2라운드 종료까지/);
      assert.doesNotMatch(await dialog.innerText(), /시험|로프|성공|VS/);
      const geometry = await dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const sprite = el.querySelector('canvas');
        const rect = sprite.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          viewport: innerWidth,
          spriteWidth: rect.width,
          clipped: rect.left < box.left || rect.right > box.right,
          drawn: sprite
            .getContext('2d')
            .getImageData(0, 0, sprite.width, sprite.height)
            .data.some((v) => v !== 0),
        };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= width);
      assert.equal(geometry.clipped, false);
      assert.equal(geometry.drawn, true);
      await page.screenshot({ path: `${dir}/${legendary}-${width}.png` });
      report.push({ legendary, width, ...geometry });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    void window.legendaryPreview.presenter.enqueue([
      {
        id: 'reduced-world',
        type: 'world-event',
        legendary: 'lugia',
        playerId: 'player:0',
        tileId: 'tile:lugia-trial',
        expiresAfterRound: 2,
      },
    ]);
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.pm-event-world-event').count(), 0);
  const mode = await page.evaluate(async () => {
    const { createIntegratedPreview } =
      await import('/src/ui/game/integration/adapter.ts');
    const runtime = createIntegratedPreview();
    const s = runtime.getState();
    return {
      world: !!s.worldEvents,
      ropes: Object.values(s.legendary.players).map((p) => p.ropes),
      trials: Object.values(s.legendary.players).map((p) => p.trial),
      projected: !!runtime.adapter.getView().worldEvents,
    };
  });
  assert.equal(mode.world, true);
  assert.equal(mode.projected, true);
  assert.ok(mode.ropes.every((n) => n === 0));
  assert.ok(mode.trials.every((t) => t === null));
  await page.goto(`${origin}/?qa&fast&seed=1`);
  await page.getByRole('button', { name: /NEW GAME/ }).click();
  await page.getByRole('button', { name: '꼬부기 선택', exact: true }).click();
  await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
  await page.getByRole('button', { name: /게임 시작/ }).click();
  await page.locator('.phaser-board canvas').waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    assert.doesNotMatch(
      await page.locator('body').innerText(),
      /로프|시험|성공 확률|재도전/,
    );
    await page.screenshot({ path: `${dir}/actual-mode-${width}.png` });
  }
  const imageAudit = await page.evaluate(async () => {
    const urls = [
      ...new Set(
        performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .filter((s) => /\.png(?:$|\?)/.test(s)),
      ),
    ];
    return Promise.all(
      urls.map(async (url) => ({
        url,
        contentType: (await fetch(url)).headers.get('content-type'),
      })),
    );
  });
  // Vite's ?import PNG module responses are JavaScript, not failed sprite images.
  const sprites = await page.evaluate(async () =>
    Promise.all(
      [...document.images].map(async (img) => {
        const src = img.currentSrc || img.getAttribute('src') || '';
        try {
          await img.decode();
          return { src, ok: img.naturalWidth > 0 };
        } catch {
          return { src, ok: false };
        }
      }),
    ),
  );
  assert.deepEqual(
    sprites.filter((s) => s.src && !s.ok),
    [],
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        origin,
        browser: await browser.version(),
        mode,
        imageAudit,
        sprites,
        report,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS world event Chrome 1280/390, PMD pixels, quiet stage, reduced motion/reset',
    report,
  );
} finally {
  await browser.close();
}
