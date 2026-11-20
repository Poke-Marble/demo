/* global window, document, structuredClone, performance */
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
const phase = process.env.OCCLUSION_PHASE ?? 'after';
const folder = 'artifacts/trial-pawn-occlusion';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  phase,
  browser: await browser.version(),
  fixture: 'Public GameView/UIUpdate visual fixture, no economic transactions',
  errors: [],
  checks: [],
  geometry: [],
};
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(process.env.OCCLUSION_URL ?? 'http://127.0.0.1:5189/');
    await page.evaluate(async () => {
      await import('/src/ui/game/phaser/index.ts');
      const phaserURL = performance
        .getEntriesByType('resource')
        .find((e) => /\/deps\/phaser\.js/.test(e.name)).name;
      const { default: Phaser } = await import(phaserURL);
      const original = Phaser.GameObjects.Sprite.prototype.preUpdate;
      Phaser.GameObjects.Sprite.prototype.preUpdate = function (...args) {
        window.occlusion.scene = this.scene;
        return original.apply(this, args);
      };
      const { mountGameUI } = await import('/src/ui/game/index.ts');
      const { createIntegratedPreview } =
        await import('/src/ui/game/integration/adapter.ts');
      const { createInitialRoster } = await import('/src/ui/game/setup.ts');
      const authority = createIntegratedPreview({ seed: 42 });
      await authority.adapter.start({
        mapId: authority.adapter.getView().map.id,
        participants: createInitialRoster('pokemon:0001'),
      });
      let view = structuredClone(authority.adapter.getView());
      view.computer.connected = false;
      view.actions = [];
      view.notice = '시각 검증 fixture · 위치/체류 합성 · 경제 거래 없음';
      let listener;
      let serial = 0;
      let completed = 0;
      const economy = () =>
        JSON.stringify({
          balances: view.state.players.map((p) => p.balance),
          holdings: view.state.holdings,
          core: view.state.core,
          economy: view.state.economy,
          turn: view.state.turnNumber,
        });
      const originalEconomy = economy();
      function publish(extra = {}) {
        listener({
          id: `occlusion:${++serial}`,
          view: structuredClone(view),
          events: [],
          ...extra,
          presentationComplete() {
            completed++;
          },
        });
      }
      document.body.replaceChildren();
      const root = document.createElement('div');
      document.body.append(root);
      const ui = mountGameUI(root, {
        getView: () => view,
        subscribe(fn) {
          listener = fn;
          return () => {};
        },
        dispatch() {},
        start() {},
        choose() {},
        restart() {},
      });
      window.occlusion = {
        ui,
        scene: undefined,
        get completed() {
          return completed;
        },
        send(special, count = 4, extra = {}) {
          const tile = view.map.tiles.find((t) => t.special === special);
          view = structuredClone(view);
          view.state.players = view.state.players.map((p, i) => ({
            ...p,
            position: i < count ? tile.id : view.map.tiles[0].id,
          }));
          publish(extra);
          return { tileId: tile.id, playerId: view.state.players[0].id };
        },
        trial(special, outcome) {
          const tile = view.map.tiles.find((t) => t.special === special);
          const playerId = view.state.players[0].id;
          const legendary = special === 'lugia-trial' ? 'lugia' : 'ho-oh';
          view = structuredClone(view);
          const data = view.state.legendary.players[playerId];
          data.trial =
            outcome === 'rope'
              ? null
              : {
                  legendary,
                  tileId: tile.id,
                  attempts: outcome === 'failure' ? 1 : 0,
                  lastAttemptTurn: 0,
                };
          if (outcome === 'rope') data.ropes = 0;
          publish(
            outcome === 'intro'
              ? {
                  effects: [
                    {
                      id: `intro:${serial}`,
                      type: 'trial-intro',
                      playerId,
                      legendary,
                      tileId: tile.id,
                    },
                  ],
                }
              : {
                  events:
                    outcome === 'rope'
                      ? [{ type: 'rope-used', playerId }]
                      : [
                          {
                            type: 'trial-resolved',
                            playerId,
                            legendary,
                            attempt: 1,
                            success: false,
                          },
                        ],
                },
          );
        },
        route(special, mode) {
          const i = view.map.tiles.findIndex((t) => t.special === special);
          const player = view.state.players[0];
          const from = player.position;
          const offsets =
            mode === 'depart' ? [-1] : mode === 'walk' ? [0, 1] : [0];
          const path = offsets.map(
            (offset) =>
              view.map.tiles[
                (i + offset + view.map.tiles.length) % view.map.tiles.length
              ].id,
          );
          player.position = path.at(-1);
          const effects =
            mode === 'fly'
              ? [
                  {
                    id: `flight:${serial}`,
                    type: 'fly',
                    playerId: player.id,
                    from,
                    to: player.position,
                  },
                ]
              : [];
          publish({ movement: { playerId: player.id, path }, effects });
        },
        async metrics(special) {
          const { boardCells } = await import('/src/ui/game/presentation.ts');
          const { tileGeometry } = await import('/src/ui/game/projection.ts');
          const i = view.map.tiles.findIndex((t) => t.special === special);
          const { side, cells } = boardCells(view.map.tiles.length);
          const g = tileGeometry(cells[i], side);
          const objects = this.geometry();
          return {
            g,
            model: objects.find(
              (o) => o.key?.startsWith('model:') && o.key.endsWith(`:${i}`),
            ),
            sprites: objects.filter((o) => o.type === 'Sprite'),
            shadows: objects.filter((o) => o.type === 'Ellipse'),
            economyUnchanged: economy() === originalEconomy,
          };
        },
        startSamples() {
          this.samples = [];
          this.sampleFrame = () => {
            const objects = this.geometry();
            const sprites = objects.filter((o) => o.type === 'Sprite');
            const shadows = objects.filter((o) => o.type === 'Ellipse');
            this.samples.push(
              sprites.map((s, i) => ({
                x: s.x,
                y: s.y,
                lift: shadows[i].y - 1 - s.y,
                correct:
                  s.depth === shadows[i].depth + 1 &&
                  shadows[i].depth ===
                    1000 + Math.round((shadows[i].y - 1) * 10),
              })),
            );
          };
          this.scene.events.on('postupdate', this.sampleFrame);
        },
        stopSamples() {
          this.scene.events.off('postupdate', this.sampleFrame);
          return this.samples;
        },
        geometry() {
          const children = this.scene.children.list;
          return children
            .filter(
              (o) =>
                o.type === 'Sprite' ||
                o.type === 'Ellipse' ||
                (o.type === 'Image' && o.texture.key.startsWith('model:')),
            )
            .map((o) => ({
              type: o.type,
              key: o.texture?.key,
              x: o.x,
              y: o.y,
              depth: o.depth,
              width: o.displayWidth,
              height: o.displayHeight,
            }));
        },
      };
    });
    await page.waitForFunction(
      () =>
        window.occlusion?.scene &&
        document.querySelector('.phaser-board')?.dataset.locked === 'false',
    );
    async function send(special, count, extra) {
      const n = await page.evaluate(() => window.occlusion.completed);
      const result = await page.evaluate(
        ([s, c, e]) => window.occlusion.send(s, c, e),
        [special, count, extra ?? {}],
      );
      await page.waitForFunction((n) => window.occlusion.completed > n, n);
      return result;
    }
    for (const special of ['lugia-trial', 'ho-oh-trial']) {
      for (const count of [1, 4]) {
        await send(special, count);
        await page.evaluate(() => {
          window.occlusion.scene.anims.pauseAll();
          window.occlusion.scene.children.list
            .filter((o) => o.type === 'Sprite')
            .forEach((o) => o.setFrame(0));
        });
        await page.waitForTimeout(80);
        await page.screenshot({
          path: `${folder}/${phase}-${special}-${count}-${width}.png`,
          fullPage: true,
        });
        report.geometry.push({
          width,
          special,
          count,
          objects: await page.evaluate(() => window.occlusion.geometry()),
        });
        if (phase === 'after') {
          const m = await page.evaluate(
            (s) => window.occlusion.metrics(s),
            special,
          );
          assert.equal(m.economyUnchanged, true);
          for (let i = 0; i < count; i++) {
            assert.ok(m.shadows[i].depth > m.model.depth);
            assert.equal(m.sprites[i].depth, m.shadows[i].depth + 1);
            assert.equal(m.sprites[i].x, m.shadows[i].x);
            assert.equal(m.sprites[i].y, m.shadows[i].y - 1);
          }
          report.checks.push(
            `${width}/${special}/${count}: feet in front of own model; sprite/shadow aligned`,
          );
        }
      }
      if (phase === 'after') {
        async function finish(action) {
          const n = await page.evaluate(() => window.occlusion.completed);
          await action();
          await page.waitForFunction((n) => window.occlusion.completed > n, n);
        }
        for (const outcome of ['intro', 'failure', 'rope']) {
          await finish(() =>
            page.evaluate(
              ([s, o]) => window.occlusion.trial(s, o),
              [special, outcome],
            ),
          );
          const m = await page.evaluate(
            (s) => window.occlusion.metrics(s),
            special,
          );
          assert.ok(m.sprites.every((p) => p.depth > m.model.depth));
          assert.equal(m.economyUnchanged, true);
          report.checks.push(
            `${width}/${special}/${outcome}: returned/stayed visible`,
          );
        }
        for (const mode of ['depart', 'walk', 'fly']) {
          await page.evaluate(() => window.occlusion.startSamples());
          await finish(() =>
            page.evaluate(
              ([s, mode]) => window.occlusion.route(s, mode),
              [special, mode],
            ),
          );
          const samples = await page.evaluate(() =>
            window.occlusion.stopSamples(),
          );
          assert.ok(samples.length > 2);
          assert.ok(
            samples.flat().every((s) => s.correct),
            'every moving frame sorts at shadow ground contact',
          );
          const maxLift = Math.max(...samples.flat().map((s) => s.lift));
          if (mode === 'fly')
            assert.ok(maxLift > 60, 'real flight arc sampled before landing');
          else assert.equal(maxLift, 0);
          report.checks.push(
            `${width}/${special}/${mode}: ${samples.length} moving frames; max lift ${maxLift.toFixed(1)}; no depth mismatch`,
          );
          const m = await page.evaluate(
            (s) => window.occlusion.metrics(s),
            special,
          );
          assert.equal(m.economyUnchanged, true);
          assert.equal(m.sprites[0].depth, m.shadows[0].depth + 1);
          report.checks.push(
            `${width}/${special}/${mode}: completed with grounded depth`,
          );
        }
        await page.getByRole('button', { name: '확대', exact: true }).click();
        await page.screenshot({
          path: `${folder}/after-${special}-zoom-${width}.png`,
          fullPage: true,
        });
        await page
          .getByRole('button', { name: '전체 보기', exact: true })
          .click();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await send(special, 4);
        for (const outcome of ['intro', 'failure', 'rope']) {
          await finish(() =>
            page.evaluate(
              ([s, o]) => window.occlusion.trial(s, o),
              [special, outcome],
            ),
          );
        }
        for (const mode of ['depart', 'walk', 'fly']) {
          await finish(() =>
            page.evaluate(
              ([s, mode]) => window.occlusion.route(s, mode),
              [special, mode],
            ),
          );
        }
        const reduced = await page.evaluate(
          (s) => window.occlusion.metrics(s),
          special,
        );
        assert.ok(reduced.sprites.every((p) => p.depth > reduced.model.depth));
        assert.equal(reduced.economyUnchanged, true);
        await page.screenshot({
          path: `${folder}/after-${special}-reduced-${width}.png`,
          fullPage: true,
        });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        report.checks.push(
          `${width}/${special}: zoom/reset/reduced motion four-player capture`,
        );
      }
    }
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${folder}/${phase}-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
