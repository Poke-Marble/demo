/* global window, document, innerWidth, innerHeight, getComputedStyle, MutationObserver, Image */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_PATH ??
      'C:/Users/hyun/.herdr/worktrees/demo/feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
  ).href
);
const folder = process.env.BOARD_POLISH_EVIDENCE ?? 'artifacts/board-polish';
const sourceOrigin = process.env.BOARD_POLISH_ORIGIN ?? 'http://127.0.0.1:5233';
const productionOrigin =
  process.env.BOARD_POLISH_PRODUCTION ?? 'http://127.0.0.1:5232';
const combined = process.argv.includes('--combined');
const baselineReport = combined
  ? JSON.parse(
      await readFile(
        new URL(
          '../src/ui/game/phaser/polish-evidence/report.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  : undefined;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const resume = process.argv.includes('--resume');
const report = resume
  ? JSON.parse(await readFile(`${folder}/report.json`, 'utf8'))
  : {
      chrome: browser.version(),
      errors: [],
      views: [],
      lifecycle: {},
      gameplay: {},
      flight: {},
    };
if (resume) {
  assert.ok(
    report.errors.every(
      (error) => error === "Cannot read properties of null (reading 'hidden')",
    ),
  );
  report.driverCorrection =
    'Guard the test-only skill observer after fixture UI.destroy(); targeted cleanup rechecked without replaying passed gameplay.';
  report.errors = [];
}
const sizes = [
  [1280, 720],
  [390, 844],
  [844, 390],
  [1920, 1080],
];
const idle = (page) =>
  page.waitForFunction(() => !document.querySelector('.pm-game')?.inert);
async function fixture(page, origin, seed = 1, partner = 'pokemon:0001') {
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.route('**/src/main.ts*', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto(`${origin}/demo/`);
  await page.evaluate(
    async ({ seed, partner }) => {
      await import('/demo/src/ui/game/integration/preview.css');
      const source = await (
        await fetch('/demo/src/ui/game/phaser/index.ts')
      ).text();
      const { default: Phaser } = await import(
        source.match(/import Phaser from ["']([^"']+)/)[1]
      );
      const boot = Phaser.Game.prototype.boot;
      window.ellipses = [];
      const ellipse = Phaser.GameObjects.Graphics.prototype.fillEllipse;
      Phaser.GameObjects.Graphics.prototype.fillEllipse = function (...args) {
        window.ellipses.push(args);
        return ellipse.apply(this, args);
      };
      Phaser.Game.prototype.boot = function () {
        window.boardGame = this;
        return boot.call(this);
      };
      const { createIntegratedPreview } =
        await import('/demo/src/ui/game/integration/adapter.ts');
      const { mountGameUI } = await import('/demo/src/ui/game/index.ts');
      const { createInitialRoster } =
        await import('/demo/src/ui/game/setup.ts');
      const runtime = createIntegratedPreview({ seed, computerDelayMs: 0 });
      window.q = {
        runtime,
        receipts: [],
        events: [],
        movements: [],
        skillShown: 0,
      };
      const adapter = {
        ...runtime.adapter,
        subscribe(listener) {
          return runtime.adapter.subscribe((u) => {
            const receipt = { id: u.id, calls: 0 };
            window.q.receipts.push(receipt);
            window.q.events.push(...u.events);
            if (u.movement) window.q.movements.push(u.movement);
            listener({
              ...u,
              presentationComplete() {
                receipt.calls++;
                u.presentationComplete?.();
              },
            });
          });
        },
      };
      window.q.ui = mountGameUI(document.querySelector('#app'), adapter);
      new MutationObserver(() => {
        const node = document.querySelector('.pm-skill-presentation');
        if (node && !node.hidden) window.q.skillShown++;
      }).observe(document.querySelector('.pm-skill-presentation'), {
        attributes: true,
        attributeFilter: ['hidden'],
      });
      window.q.start = () =>
        runtime.adapter.start({
          mapId: runtime.adapter.getView().map.id,
          participants: createInitialRoster(partner),
          rulesPreset: 'quick',
        });
      window.q.start();
    },
    { seed, partner },
  );
  await page.locator('.phaser-board-surface > canvas').waitFor();
  await idle(page);
  await page.waitForTimeout(300);
}
async function metrics(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('.phaser-board-surface');
    const b = surface.getBoundingClientRect();
    const overlay = document.querySelector('.pm-feedback-overlay');
    const c = overlay.querySelector('canvas').getBoundingClientRect();
    const g = window.boardGame,
      scene = g.scene.scenes[0];
    const center = scene.cameras.main.matrixCombined.transformPoint(500, 340);
    const actualX = b.left + (center.x * b.width) / scene.scale.width;
    const actualY = b.top + (center.y * b.height) / scene.scale.height;
    return {
      board: b.toJSON(),
      dice: c.toJSON(),
      diceDelta: [
        c.left + c.width / 2 - (b.left + b.width / 2),
        c.top + c.height / 2 - (b.top + b.height / 2),
      ],
      cameraDelta: [
        actualX - (b.left + b.width / 2),
        actualY - (b.top + b.height / 2),
      ],
      pageDelta: [
        b.left + b.width / 2 - innerWidth / 2,
        b.top + b.height / 2 - innerHeight / 2,
      ],
      inside:
        c.left >= b.left - 1 &&
        c.right <= b.right + 1 &&
        c.top >= b.top - 1 &&
        c.bottom <= b.bottom + 1,
      relative: getComputedStyle(surface).position,
      controls: document.querySelectorAll('.phaser-board-controls').length,
      renderers: surface.querySelectorAll(':scope > canvas').length,
      bigEllipses: window.ellipses.filter((a) => a[2] >= 600).length,
      pawnShadows: scene.children.list.filter(
        (o) => o.type === 'Ellipse' && o.width === 22 && o.height === 9,
      ).length,
      overlayParent: overlay.parentElement === surface,
    };
  });
}
function centered(m) {
  assert.ok(
    m.diceDelta.every((x) => Math.abs(x) < 1),
    JSON.stringify(m),
  );
  assert.ok(m.cameraDelta.every((x) => Math.abs(x) < 1));
  assert.equal(m.inside, true);
  assert.equal(m.overlayParent, true);
  assert.equal(m.controls, 0);
  assert.equal(m.bigEllipses, 0);
  assert.equal(m.renderers, 1);
  assert.equal(m.pawnShadows, 4);
}
try {
  if (!resume)
    for (const [width, height] of sizes) {
      let before = baselineReport?.views.find(
        (v) => v.width === width && v.height === height,
      )?.before;
      if (!combined) {
        const page = await browser.newPage({
          viewport: { width, height },
          deviceScaleFactor: 1,
        });
        // Baseline uses the untouched e07aa30 source extracted inside ignored artifacts.
        await fixture(page, 'http://127.0.0.1:5234');
        await page.screenshot({
          path: `${folder}/before-${width}x${height}.png`,
        });
        await page.getByRole('button', { name: /주사위 굴리기/ }).click();
        await page.locator('.pm-feedback-overlay:not([hidden])').waitFor();
        before = await metrics(page);
        await page.screenshot({
          path: `${folder}/before-dice-${width}x${height}.png`,
        });
        await page.close();
      }
      const after = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      await fixture(after, sourceOrigin);
      const background = combined
        ? await after.evaluate(async () => {
            const surface = document.querySelector('.phaser-board-surface');
            const source = surface.style
              .getPropertyValue('--pm-board-sky')
              .trim()
              .slice(4, -1)
              .replaceAll('"', '');
            const image = new Image();
            image.src = source;
            await image.decode();
            const response = await fetch(image.currentSrc);
            return {
              source: image.currentSrc,
              width: image.naturalWidth,
              height: image.naturalHeight,
              status: response.status,
              mime: response.headers.get('content-type'),
              transparent: window.boardGame.config.transparent,
            };
          })
        : undefined;
      if (combined) {
        assert.deepEqual([background.width, background.height], [320, 240]);
        assert.equal(background.status, 200);
        assert.ok(background.mime.startsWith('image/png'));
        assert.equal(background.transparent, true);
      }
      await after.screenshot({
        path: `${folder}/after-${width}x${height}.png`,
      });
      await after.getByRole('button', { name: /주사위 굴리기/ }).click();
      await after.locator('.pm-feedback-overlay:not([hidden])').waitFor();
      const measured = await metrics(after);
      centered(measured);
      await after.screenshot({
        path: `${folder}/after-dice-${width}x${height}.png`,
      });
      await idle(after);
      assert.match(
        await after.locator('.pm-dice-result').innerText(),
        /이동 선택/,
      );
      report.views.push({ width, height, before, after: measured, background });
      console.log(
        'VIEW',
        width,
        height,
        measured.diceDelta,
        measured.pageDelta,
      );
      if (width === 1280) {
        const revealed = await after.evaluate(() => ({
          values: window.q.runtime.getState().core.pendingDice.values,
          position: window.q.runtime.getState().players[0].position,
        }));
        const id = await after.evaluate(
          () =>
            window.q.runtime
              .snapshot()
              .candidates.find(
                (c) =>
                  c.action.type === 'resolve-dice' &&
                  c.action.adjustment === -1,
              ).id,
        );
        await after
          .locator(`button[data-choice-id=${JSON.stringify(id)}]`)
          .click();
        await idle(after);
        const moved = await after.evaluate(() => ({
          pp: window.q.runtime.getState().skills.players['player:1'].pp,
          position: window.q.runtime.getState().players[0].position,
          events: window.q.events,
          movements: window.q.movements,
          skillShown: window.q.skillShown,
          text: document.querySelector('.pm-dice-result').textContent,
        }));
        assert.equal(moved.pp, 2);
        assert.notEqual(moved.position, revealed.position);
        assert.ok(moved.skillShown > 0);
        assert.match(moved.text, /실제 이동/);
        const rolled = moved.events.find((e) => e.type === 'dice-rolled');
        assert.deepEqual(rolled.values, revealed.values);
        assert.equal(
          rolled.distance,
          revealed.values.reduce((a, b) => a + b, 0) - 1,
        );
        assert.equal(moved.movements[0].path.length, rolled.distance);
        await after.screenshot({ path: `${folder}/resolved-move-1280.png` });
        for (let i = 0; i < 20; i++) {
          if (
            await after.evaluate(
              () =>
                window.q.runtime.snapshot().turn > 1 &&
                window.q.runtime.snapshot().activePlayerId === 'player:1',
            )
          )
            break;
          const decision = await after.evaluate(async () => {
            const { plan } = await import('/demo/src/game/ai/planner.ts');
            const snap = window.q.runtime.snapshot();
            if (snap.activePlayerId !== 'player:1') return null;
            return plan(
              {
                ...snap,
                players: snap.players.map((p) => ({
                  ...p,
                  controller: 'computer',
                })),
              },
              42,
            )?.candidate.id;
          });
          if (decision) {
            const button = after.locator(
              `button[data-choice-id=${JSON.stringify(decision)}]`,
            );
            if (await button.count()) await button.first().click();
          }
          await after.waitForTimeout(100);
          await idle(after);
        }
        report.gameplay = await after.evaluate(() => ({
          ...window.q.runtime.snapshot(),
          receipts: window.q.receipts,
          events: window.q.events.map((e) => e.type),
          skillShown: window.q.skillShown,
        }));
        assert.equal(report.gameplay.activePlayerId, 'player:1');
        assert.ok(Number(report.gameplay.turn) > 1);
        assert.ok(report.gameplay.receipts.every((r) => r.calls === 1));
        await after.screenshot({ path: `${folder}/ai-return-1280.png` });
      }
      await after.close();
    }
  if (!resume) {
    // Isolated real controller lifecycle: dynamic target replacement, resize, modal, skip/reset/destroy.
    const life = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await fixture(life, sourceOrigin);
    report.lifecycle = await life.evaluate(async () => {
      const { createGameplayFeedback } =
        await import('/demo/src/ui/game/feedback/controller.ts');
      let target = document.querySelector('.phaser-board-surface');
      const f = createGameplayFeedback(
        document.querySelector('#app'),
        undefined,
        () => target,
      );
      const check = () => {
        const a = target.getBoundingClientRect(),
          c = target
            .querySelector('.pm-feedback-overlay canvas')
            .getBoundingClientRect();
        return (
          Math.abs(a.x + a.width / 2 - c.x - c.width / 2) < 1 &&
          Math.abs(a.y + a.height / 2 - c.y - c.height / 2) < 1 &&
          c.width <= a.width + 1 &&
          c.height <= a.height + 1
        );
      };
      const frame = () =>
        new Promise((r) =>
          window.requestAnimationFrame(() => window.requestAnimationFrame(r)),
        );
      f.begin();
      const roll = f.roll([2, 5]);
      await frame();
      const initial = check();
      const dialog = document.createElement('dialog');
      document.body.append(dialog);
      dialog.showModal();
      target.style.width = '260px';
      target.style.height = '100px';
      target.style.flex = 'none';
      await frame();
      const resizedWithModal = check();
      dialog.close();
      dialog.remove();
      const replacement = document.createElement('div');
      replacement.style.cssText = 'position:relative;width:300px;height:120px';
      target.replaceWith(replacement);
      target = replacement;
      await frame();
      const replaced = check();
      f.skip();
      await roll;
      const skipped =
        f.suppressed && target.querySelector('.pm-feedback-overlay').hidden;
      f.begin();
      const resetRoll = f.roll([1, 3]);
      f.reset();
      await resetRoll;
      const reset = f.suppressed;
      f.begin();
      const destroyedRoll = f.roll([3, 4]);
      f.destroy();
      await destroyedRoll;
      return {
        initial,
        resizedWithModal,
        replaced,
        skipped,
        reset,
        destroyed: !target.querySelector('.pm-feedback-overlay'),
      };
    });
    assert.ok(Object.values(report.lifecycle).every(Boolean));
    await life.close();
    // Natural flight state via the existing authority/planner; stop immediately at first selection.
    const flight = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await fixture(flight, sourceOrigin, 42, 'pokemon:0007');
    await flight.evaluate(async () => {
      window.q.ui.destroy();
      const { createIntegratedPreview } =
        await import('/demo/src/ui/game/integration/adapter.ts');
      const { createInitialRoster } =
        await import('/demo/src/ui/game/setup.ts');
      const { plan } = await import('/demo/src/game/ai/planner.ts');
      const { mountGameUI } = await import('/demo/src/ui/game/index.ts');
      const r = createIntegratedPreview({ seed: 42, computerDelayMs: 0 }),
        a = r.adapter;
      a.start({
        mapId: a.getView().map.id,
        participants: createInitialRoster('pokemon:0007'),
      });
      let steps = 0;
      for (; steps < 1000 && !a.getView().flightSelection; steps++) {
        const s = r.snapshot(),
          v = a.getView();
        if (
          s.players.find((p) => p.id === s.activePlayerId).controller ===
          'computer'
        )
          await a.runComputerTurn(
            s.activePlayerId,
            new AbortController().signal,
          );
        else {
          const c = plan(
            {
              ...s,
              players: s.players.map((p) => ({ ...p, controller: 'computer' })),
            },
            42,
          ).candidate;
          if (v.prompt) a.choose(v.prompt.id, c.id);
          else a.dispatch(c.action);
        }
      }
      if (!a.getView().flightSelection) throw Error('no natural flight');
      window.q = {
        runtime: r,
        before: JSON.stringify(r.getState()),
        submissions: 0,
        steps,
      };
      const original = a.selectFlightDestination.bind(a);
      a.selectFlightDestination = (...args) => {
        window.q.submissions++;
        return original(...args);
      };
      window.q.ui = mountGameUI(document.querySelector('#app'), {
        ...a,
        runComputerTurn: undefined,
      });
    });
    await flight
      .locator('.phaser-board[data-flight-selection="true"]')
      .waitFor();
    await idle(flight);
    report.flight.views = [];
    for (const [width, height] of sizes) {
      await flight.setViewportSize({ width, height });
      await flight.waitForTimeout(150);
      const points = await flight.evaluate(async () => {
        const { boardCells } =
          await import('/demo/src/ui/game/presentation.ts');
        const { tileGeometry } =
          await import('/demo/src/ui/game/projection.ts');
        const v = window.q.runtime.adapter.getView(),
          { cells, side } = boardCells(v.map.tiles.length);
        const s = window.boardGame.scene.scenes[0],
          b = window.boardGame.canvas.getBoundingClientRect();
        return v.flightSelection.destinations
          .map((d) => {
            const g = tileGeometry(
              cells[v.map.tiles.findIndex((t) => t.id === d.tileId)],
              side,
            );
            const p = s.cameras.main.matrixCombined.transformPoint(g.x, g.y);
            return {
              id: d.tileId,
              x: b.left + (p.x * b.width) / s.scale.width,
              y: b.top + (p.y * b.height) / s.scale.height,
            };
          })
          .filter(
            (p) =>
              p.x > b.left + 20 &&
              p.x < b.right - 20 &&
              p.y > b.top + 30 &&
              p.y < b.bottom - 20,
          );
      });
      assert.ok(points.length > 0);
      const p = points[0];
      await flight.mouse.move(p.x, p.y);
      await flight.mouse.down();
      await flight.mouse.move(p.x + 35, p.y + 20);
      await flight.mouse.move(p.x, p.y);
      await flight.mouse.up();
      assert.equal(
        await flight
          .locator('.phaser-board')
          .getAttribute('data-flight-candidate'),
        '',
      );
      await flight.mouse.click(p.x, p.y);
      await flight.waitForTimeout(50);
      assert.equal(
        await flight
          .locator('.phaser-board')
          .getAttribute('data-flight-candidate'),
        p.id,
      );
      assert.equal(await flight.evaluate(() => window.q.submissions), 0);
      assert.equal(
        await flight.evaluate(
          () => JSON.stringify(window.q.runtime.getState()) === window.q.before,
        ),
        true,
      );
      await flight.screenshot({
        path: `${folder}/flight-${width}x${height}.png`,
      });
      report.flight.views.push({
        width,
        height,
        candidate: p.id,
        dragSuppressed: true,
        noPrematureSubmit: true,
      });
      await flight.keyboard.press('Escape');
    }
    await flight.locator('.pm-board-flight details').evaluate((d) => {
      d.open = true;
    });
    await flight.locator('.pm-board-flight-list button').last().click();
    await flight.locator('.pm-board-flight-actions button').first().click();
    await idle(flight);
    report.flight.submissions = await flight.evaluate(
      () => window.q.submissions,
    );
    assert.equal(report.flight.submissions, 1);
    await flight.close();
  }
  // Regression that caused a driver-only error: fixture observation after UI destroy.
  const cleanup = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await fixture(cleanup, sourceOrigin);
  await cleanup.evaluate(() => window.q.ui.destroy());
  await cleanup.waitForTimeout(50);
  assert.equal(await cleanup.locator('.pm-feedback-overlay').count(), 0);
  await cleanup.close();
  report.observerCleanup = true;
  // Production bundle keeps /demo/ assets and real interaction at strictPort 5232.
  const production = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  production.on('pageerror', (e) => report.errors.push(e.message));
  await production.goto(`${productionOrigin}/demo/?fast&seed=1`);
  if (!report.production) {
    await production.getByRole('button', { name: /NEW GAME/ }).click();
    await production
      .getByRole('button', { name: '이상해씨 선택', exact: true })
      .click();
    await production.getByRole('button', { name: /다음.*맵 선택/ }).click();
    await production.getByRole('button', { name: /게임 시작/ }).click();
    await production.locator('.phaser-board-surface > canvas').waitFor();
    await idle(production);
    await production.getByRole('button', { name: /주사위 굴리기/ }).click();
    await production.locator('.pm-feedback-overlay:not([hidden])').waitFor();
    report.production = await production.evaluate(() => {
      const b = document
        .querySelector('.phaser-board-surface')
        .getBoundingClientRect();
      const d = document
        .querySelector('.pm-feedback-overlay canvas')
        .getBoundingClientRect();
      return {
        url: window.location.href,
        delta: [
          d.x + d.width / 2 - b.x - b.width / 2,
          d.y + d.height / 2 - b.y - b.height / 2,
        ],
        controls: document.querySelectorAll('.phaser-board-controls').length,
      };
    });
    assert.ok(report.production.delta.every((x) => Math.abs(x) < 1));
    assert.equal(report.production.controls, 0);
    await production.screenshot({ path: `${folder}/production-5232-dice.png` });
    await idle(production);
  }
  await production.getByRole('button', { name: '소리', exact: true }).click();
  await production.getByRole('button', { name: '음소거', exact: true }).click();
  assert.equal(
    await production
      .getByRole('button', { name: '소리 켜기', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await production.keyboard.press('Escape');
  report.production.mutePreserved = true;
  await production.close();
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  reduced.on('pageerror', (e) => report.errors.push(e.message));
  await reduced.route('**/src/main.ts*', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await reduced.goto(`${sourceOrigin}/demo/`);
  report.reducedMotion = await reduced.evaluate(async () => {
    const { createGameplayFeedback } =
      await import('/demo/src/ui/game/feedback/controller.ts');
    const target = document.createElement('div');
    target.style.cssText = 'position:relative;width:220px;height:80px';
    document.body.append(target);
    const f = createGameplayFeedback(target);
    f.begin();
    await f.roll([2, 5]);
    const suppressed =
      f.suppressed && target.querySelector('.pm-feedback-overlay').hidden;
    f.destroy();
    return suppressed && !target.querySelector('canvas');
  });
  assert.equal(report.reducedMotion, true);
  await reduced.close();
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  'PASS board polish: four viewports, natural gameplay, lifecycle, flight',
);
