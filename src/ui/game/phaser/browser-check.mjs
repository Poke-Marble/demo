/* global window, document, innerWidth, AudioContext, setTimeout, AbortController, performance, console */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { preview } from 'vite';

const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ||
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const folder = 'src/ui/game/phaser/evidence';
await mkdir(folder, { recursive: true });
const report = { checks: [], errors: [], requests: [], screenshots: [] };
const origin = process.env.PHASER_ORIGIN || 'http://127.0.0.1:5181';
let production;
async function newPage(width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 1100 } });
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('requestfailed', (request) => report.requests.push(request.url()));
  await page.addInitScript(() => {
    window.audioContexts = 0;
    if (window.AudioContext)
      window.AudioContext = new Proxy(AudioContext, {
        construct(target, args) {
          window.audioContexts++;
          return Reflect.construct(target, args);
        },
      });
  });
  return page;
}
async function idle(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('.phaser-board')?.dataset.tiles === '32' &&
      document.querySelector('.phaser-board')?.dataset.locked === 'false',
  );
}
async function capture(page, name) {
  await page.screenshot({ path: `${folder}/${name}`, fullPage: true });
  report.screenshots.push(name);
}
try {
  for (const width of [1280, 390]) {
    for (const before of [true, false]) {
      const page = await newPage(width);
      await page.goto(
        `${origin}/phaser-preview.html${before ? '?before' : ''}`,
        { waitUntil: 'networkidle' },
      );
      if (!before) await idle(page);
      else await page.waitForSelector('.pm-iso-tile');
      await page.getByRole('button', { name: 'final', exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('output')?.textContent === '건설 단계: final',
      );
      await capture(page, `${before ? 'before' : 'after'}-${width}.png`);
      if (!before) {
        assert.equal(await page.locator('canvas').count(), 1);
        const bounds = await page.locator('canvas').boundingBox();
        assert.ok(
          bounds.width > width * 0.7 && bounds.width <= width,
          'canvas has a real fitted display size',
        );
        await page.mouse.click(
          bounds.x + bounds.width * 0.5,
          bounds.y + (bounds.height * (120 + (17 * 230) / 9)) / 720,
        );
        await page.waitForFunction(() =>
          document
            .querySelector('output')
            ?.textContent?.startsWith('선택: 출발'),
        );
        assert.equal(
          await page.locator('.phaser-board-tiles button').count(),
          32,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        assert.equal(await page.evaluate(() => window.audioContexts), 0);
        await page.locator('.phaser-board > details > summary').click();
        const first = page.locator('.phaser-board-tiles button').first();
        await first.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() =>
          document.querySelector('output')?.textContent?.startsWith('선택:'),
        );
        const chosen = await page.locator('output').textContent();
        await page
          .getByRole('button', { name: '입력 잠금', exact: true })
          .click();
        assert.equal(await first.isDisabled(), true);
        const lockedStatus = await page.locator('output').textContent();
        await page.mouse.click(
          bounds.x + bounds.width * 0.5,
          bounds.y + (bounds.height * (120 + (17 * 230) / 9)) / 720,
        );
        assert.equal(await page.locator('output').textContent(), lockedStatus);
        await page
          .getByRole('button', { name: '입력 잠금', exact: true })
          .click();
        assert.equal(await first.isDisabled(), false);
        assert.ok(chosen.includes('출발'));
        await page.locator('.phaser-board > details > summary').click();
        const canvas = await page.locator('canvas').elementHandle();
        await page
          .getByRole('button', { name: '소유 교체', exact: true })
          .click();
        await idle(page);
        assert.equal(
          await canvas.evaluate(
            (node) => node === document.querySelector('canvas'),
          ),
          true,
        );
        await page
          .getByRole('button', { name: '8칸 이동', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('.phaser-board')?.dataset.locked === 'true',
        );
        await page.getByRole('button', { name: '스킵', exact: true }).click();
        await idle(page);
        await page
          .getByRole('button', { name: '네 마리 겹침', exact: true })
          .click();
        await idle(page);
        if (width === 1280) await capture(page, 'overlap-1280.png');
        await page.getByRole('button', { name: '비행', exact: true }).click();
        await idle(page);
        await page.getByRole('button', { name: '확대', exact: true }).click();
        await page
          .getByRole('button', { name: '전체 보기', exact: true })
          .click();
        if (width === 1280) {
          await page
            .getByRole('button', { name: '390 / 전체', exact: true })
            .click();
          await page.waitForFunction(
            () =>
              document.querySelector('canvas')?.getBoundingClientRect().width <
              390,
          );
          assert.ok((await page.locator('canvas').boundingBox()).width > 300);
          assert.equal(
            await canvas.evaluate(
              (node) => node === document.querySelector('canvas'),
            ),
            true,
          );
          await page
            .getByRole('button', { name: '390 / 전체', exact: true })
            .click();
        }
        await page.getByRole('button', { name: '파괴', exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector('output')?.textContent?.includes('정리 완료'),
        );
        assert.equal(await page.locator('canvas').count(), 0);
      }
      report.checks.push(
        `Chrome ${before ? 'CSS before' : 'Phaser after'} ${width}: map, stage, capture${before ? '' : ', keyboard, lock, transfer, single canvas, skip, overlap, flight, zoom, destroy, noAudio'}`,
      );
      await page.close();
    }
  }
  // Exercise the public API with a captured Game reference; no product debug hooks.
  const api = await newPage();
  await api.goto(`${origin}/phaser-preview.html`, { waitUntil: 'networkidle' });
  await idle(api);
  const contracts = await api.evaluate(async () => {
    const [
      { createPhaserBoard },
      { presentationMap },
      { sampleState },
      { createInitialRoster },
      { default: Phaser },
    ] = await Promise.all([
      import('/src/ui/game/phaser/index.ts'),
      import('/src/ui/game/integration/map.ts'),
      import('/src/data/sample-map.ts'),
      import('/src/ui/game/setup.ts'),
      import(
        performance
          .getEntriesByType('resource')
          .find((entry) => /\/phaser\.js\?/.test(entry.name)).name
      ),
    ]);
    const participants = createInitialRoster('pokemon:0001');
    const view = {
      map: presentationMap,
      mapName: 'test',
      participants,
      computer: { connected: false, status: 'test' },
      actions: [],
      state: {
        ...sampleState,
        mapId: presentationMap.id,
        phase: 'playing',
        players: participants.map((p) => ({
          ...p,
          position: presentationMap.tiles[0].id,
          balance: 1000,
          bankrupt: false,
        })),
        holdings: [],
      },
    };
    const freeze = (value) => {
      if (value && typeof value === 'object') {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
      return value;
    };
    freeze(view);
    const results = [];
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
      results.push(message);
    };
    const boot = Phaser.Game.prototype.boot;
    const games = [];
    Phaser.Game.prototype.boot = function () {
      games.push(this);
      return boot.call(this);
    };
    const host = document.createElement('div');
    host.style.width = '900px';
    document.body.append(host);
    const locks = [],
      selected = [],
      delegations = [];
    const renderer = createPhaserBoard({
      view,
      onSelect: (id) => selected.push(id),
      onLockChange: (lock) => locks.push(lock),
      presentEffect: (request, signal) =>
        new Promise((resolve) => {
          delegations.push(request.id);
          signal.addEventListener('abort', resolve, { once: true });
        }),
    });
    Phaser.Game.prototype.boot = boot;
    // DOMContentLoaded invokes boot synchronously when document is ready.
    renderer.mount(host);
    await renderer.ready;
    const game = games[0];
    check(!!game, 'captured one Phaser Game');
    const scene = game.scene.getScene('board');
    const sprites = () =>
      scene.children.list.filter((node) => node.type === 'Sprite');
    check(game.renderer.type === Phaser.WEBGL, 'WebGL default');
    check(
      game.sound.constructor.name.includes('NoAudio'),
      'Phaser NoAudio manager',
    );
    check(sprites().length === 4, 'four real sprites');
    const first = sprites()[0],
      oldCanvas = game.canvas;
    const textureCount = game.textures.getTextureKeys().length;
    const originals = [...scene.children.list];
    for (let i = 0; i < 6; i++) await renderer.update(view);
    check(
      game.canvas === oldCanvas &&
        originals.every((node) => scene.children.list.includes(node)),
      'incremental update preserves GameObjects and canvas',
    );
    check(
      game.textures.getTextureKeys().length === textureCount,
      'unchanged update does not allocate textures',
    );
    const { animation } = await import('/src/assets/sprites.ts').then((m) =>
      m.findSprite('pokemon:0001', 'Idle'),
    );
    check(
      scene.anims
        .get('pokemon:0001:Idle:0')
        .frames.every(
          (frame, i) => frame.duration === animation.durationsMs[i],
        ),
      'exact AnimData frame durations',
    );
    check(
      new Set(sprites().map((s) => `${s.x},${s.y}`)).size === 4,
      'same tile has four separate feet',
    );
    check(
      sprites().every((s) => s.originY > 0 && s.originY <= 1),
      'opaque sprite foot anchors',
    );
    const list = Array.from(
      renderer.element.querySelectorAll('[data-tile-id]'),
    );
    check(
      list.every((b, i) => b.dataset.tileId === view.map.tiles[i].id),
      'HTML list follows authoritative map order',
    );
    renderer.element.querySelector('details').open = true;
    list[0].focus();
    await renderer.update(view);
    check(
      document.activeElement === list[0],
      'incremental update preserves keyboard focus',
    );
    renderer.setInputLocked(true);
    list[0].click();
    check(selected.length === 0, 'HTML alternative respects external lock');
    renderer.setInputLocked(false);
    const target = view.map.tiles[8].id;
    const next = {
      ...view,
      state: {
        ...view.state,
        players: view.state.players.map((p, i) =>
          i === 0 ? { ...p, position: target } : p,
        ),
      },
    };
    const path = view.map.tiles.slice(1, 9).map((t) => t.id);
    const update = {
      id: 'move-1',
      view: next,
      events: [],
      movement: { playerId: participants[0].id, path },
    };
    const visited = [];
    const tweenAdd = scene.tweens.add.bind(scene.tweens);
    scene.tweens.add = (config) => {
      if (config.targets?.t === 0) visited.push([config.x, config.y]);
      return tweenAdd(config);
    };
    const moving = renderer.present(update);
    const duplicate = renderer.present(update);
    check(moving === duplicate, 'redelivery shares completion Promise');
    await new Promise((resolve) => setTimeout(resolve, 90));
    check(
      first.anims.currentAnim.key.includes('Walk'),
      'actual Walk frames during movement',
    );
    await moving;
    check(
      visited.length === 8 &&
        new Set(visited.map((p) => p.join(','))).size === 8,
      'eight authoritative path segments',
    );
    check(
      first.depth === 1000 + Math.round(first.y * 10) + 1,
      'pawn depth follows feet',
    );
    check(
      !renderer.element.querySelector('button[data-tile-id]').disabled,
      'automatic input unlock',
    );
    const abort = new AbortController();
    const cancelled = renderer.move(
      { playerId: participants[0].id, path: view.map.tiles.map((t) => t.id) },
      { signal: abort.signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    abort.abort();
    check(
      (await cancelled).status === 'cancelled',
      'AbortSignal settles movement',
    );
    const fly = {
      id: 'fly-only',
      view,
      events: [],
      effects: [
        {
          id: 'external-fly',
          type: 'fly',
          playerId: participants[0].id,
          from: target,
          to: view.map.tiles[0].id,
        },
      ],
    };
    const presenting = renderer.present(fly);
    await new Promise((resolve) => setTimeout(resolve, 40));
    renderer.cancel();
    check(
      (await presenting).status === 'cancelled' && delegations.length === 1,
      'HTML VS/flight bridge shares abort and await contract',
    );
    const queued1 = renderer.present({ ...update, id: 'q1' });
    const queued2 = renderer.present({ ...fly, id: 'q2', effects: [] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await renderer.skip();
    check(
      (await queued1).status === 'cancelled' &&
        (await queued2).status === 'cancelled',
      'skip settles active and queued work',
    );
    check(
      first.x !== visited.at(-1)[0] || first.y !== visited.at(-1)[1],
      'skip reconciles latest snapshot',
    );
    // Repeated changed tiles remove superseded textures instead of accumulating them.
    for (let i = 0; i < 8; i++)
      await renderer.update({
        ...view,
        state: {
          ...view.state,
          holdings: [
            {
              tileId: view.map.tiles[1].id,
              ownerId: participants[i % 4].id,
              facilityLevel: i % 4,
            },
          ],
        },
      });
    check(
      game.textures.getTextureKeys().length === textureCount,
      'ownership/stage replacement releases old textures',
    );
    const final = renderer.move({ playerId: participants[0].id, path });
    await renderer.destroy();
    check((await final).status === 'destroyed', 'destroy settles queued work');
    check(
      !game.canvas.isConnected && game.pendingDestroy === false,
      'Game destroy completes',
    );
    check(host.querySelector('canvas') === null, 'destroy removes canvas');
    check(
      game.textures.list && Object.keys(game.textures.list).length === 0,
      'destroy frees textures',
    );
    await renderer.destroy();
    host.remove();
    check(
      locks.includes(true) && locks.at(-1) === true,
      'destroy keeps board input disabled',
    );
    const reducedHost = document.createElement('div');
    document.body.append(reducedHost);
    Phaser.Game.prototype.boot = function () {
      games.push(this);
      return boot.call(this);
    };
    const reducedRenderer = createPhaserBoard({
      view,
      onSelect() {},
      renderer: 'canvas',
      reducedMotion: true,
    });
    Phaser.Game.prototype.boot = boot;
    reducedRenderer.mount(reducedHost);
    await reducedRenderer.ready;
    const reducedGame = games.at(-1),
      reducedScene = reducedGame.scene.getScene('board');
    check(
      reducedGame.renderer.type === Phaser.CANVAS,
      'explicit Canvas fallback uses Canvas renderer',
    );
    check(
      reducedScene.children.list
        .filter((n) => n.type === 'Sprite')
        .every((n) => !n.anims.isPlaying),
      'reduced motion freezes Idle frames',
    );
    const start = performance.now();
    await reducedRenderer.move({ playerId: participants[0].id, path });
    check(
      performance.now() - start < 900,
      'reduced motion shortens eight-step movement',
    );
    await reducedRenderer.destroy();
    reducedHost.remove();
    return results;
  });
  report.checks.push(...contracts);
  await api.close();
  const fallback = await newPage(390);
  await fallback.emulateMedia({ reducedMotion: 'reduce' });
  await fallback.goto(`${origin}/phaser-preview.html?canvas`, {
    waitUntil: 'networkidle',
  });
  await idle(fallback);
  await fallback.getByRole('button', { name: '8칸 이동', exact: true }).click();
  await idle(fallback);
  assert.equal(await fallback.evaluate(() => window.audioContexts), 0);
  assert.ok((await fallback.locator('canvas').boundingBox()).width > 350);
  await capture(fallback, 'canvas-reduced-390.png');
  report.checks.push('Canvas fallback + reduced motion + 390 fit + noAudio');
  await fallback.close();
  production = await preview({
    configFile: false,
    build: { outDir: 'dist/phaser-preview' },
    preview: { host: '127.0.0.1', port: 5191, strictPort: true },
  });
  const prod = await newPage();
  await prod.goto('http://127.0.0.1:5191/phaser-preview.html', {
    waitUntil: 'networkidle',
  });
  await idle(prod);
  await prod.getByRole('button', { name: 'final', exact: true }).click();
  await idle(prod);
  assert.equal(await prod.locator('canvas').count(), 1);
  await capture(prod, 'production-1280.png');
  report.checks.push('dedicated production bundle Chrome smoke');
  await prod.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.requests, []);
  await writeFile(
    `${folder}/report.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await production?.httpServer.close();
}
