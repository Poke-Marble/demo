/* global window, document */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_PATH ??
      'C:/Users/hyun/.herdr/worktrees/demo/feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
  ).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const folder = 'artifacts/start-build';
await mkdir(folder, { recursive: true });
const report = [];
const general = process.env.START_GENERAL === '1';
try {
  for (const width of [1280, 390]) {
    for (const mode of general
      ? ['skip', 'build']
      : ['skip', 'build', 'final']) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/src/main.ts*', (r) =>
        r.fulfill({ contentType: 'text/javascript', body: '' }),
      );
      await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5221');
      await page.evaluate(async (general) => {
        await import('/src/ui/game/integration/preview.css');
        const { createIntegratedPreview } =
          await import('/src/ui/game/integration/adapter.ts');
        const { createInitialRoster } = await import('/src/ui/game/setup.ts');
        const { mountGameUI } = await import('/src/ui/game/index.ts');
        const runtime = createIntegratedPreview({
          seed: 3,
          computerDelayMs: 0,
        });
        runtime.adapter.start({
          mapId: runtime.adapter.getView().map.id,
          participants: createInitialRoster('pokemon:0001'),
          rulesPreset: 'quick',
        });
        // Reach the opportunity through real commands; no positions, holdings or balances are injected.
        for (
          let i = 0;
          i < (general ? 400 : 150) && runtime.getState().phase === 'playing';
          i++
        ) {
          const s = runtime.getState();
          if (s.activePlayerId !== 'player:1') {
            await runtime.adapter.runComputerTurn(
              s.activePlayerId,
              new AbortController().signal,
            );
            continue;
          }
          if (s.economy.pendingStartBuild) break;
          const v = runtime.adapter.getView(),
            candidates = runtime.snapshot().candidates;
          const startChoice =
            general &&
            s.core.pendingDice &&
            candidates.find((candidate) => {
              if (candidate.action.type !== 'resolve-dice') return false;
              const index = v.map.tiles.findIndex(
                (t) =>
                  t.id ===
                  s.players.find((p) => p.id === s.activePlayerId).position,
              );
              const distance =
                s.core.pendingDice.values.reduce((sum, n) => sum + n, 0) +
                candidate.action.adjustment;
              return (
                v.map.tiles[(index + distance) % v.map.tiles.length].kind ===
                'start'
              );
            });
          const a =
            (startChoice || undefined) ??
            candidates.find(
              (a) =>
                a.action.type === 'resolve-dice' && a.action.adjustment === 0,
            ) ??
            candidates.find(
              (a) =>
                a.action.type === 'construct-property' &&
                a.action.targetStage === 2,
            ) ??
            candidates.find(
              (a) =>
                a.action.type === 'construct-property' &&
                a.action.targetStage === 1,
            ) ??
            candidates.find((a) => a.action.type === 'construct-property') ??
            candidates.find((a) => a.action.type !== 'sell-property');
          if (!a) throw new Error('No legal command');
          if (a.action.type === 'fly')
            runtime.adapter.selectFlightDestination(
              v.flightSelection.id,
              a.action.to,
            );
          else if (v.prompt) runtime.adapter.choose(v.prompt.id, a.id);
          else runtime.adapter.dispatch(a.action);
        }
        if (!runtime.getState().economy.pendingStartBuild)
          throw new Error('No exact START opportunity');
        const before = structuredClone(runtime.getState());
        const stale = runtime.adapter.getView().prompt;
        const candidates = runtime.snapshot().candidates;
        const ui = mountGameUI(document.querySelector('#app'), {
          ...runtime.adapter,
          runComputerTurn: undefined,
        });
        window.startQA = { runtime, before, stale, candidates, ui };
      }, general);
      const dialog = page.locator('dialog[open]');
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /START 특별 건설/);
      assert.match(await dialog.innerText(), /건설비/);
      const geometry = await dialog.evaluate((d) => {
        const r = d.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      assert.ok(
        geometry.left >= 0 &&
          geometry.right <= width &&
          geometry.top >= 0 &&
          geometry.bottom <= 844,
      );
      assert.equal(geometry.scrollWidth, width);
      await page.screenshot({ path: `${folder}/${mode}-${width}.png` });
      const choice = await page.evaluate(
        ({ mode, general }) => {
          const { candidates, before, stale } = window.startQA;
          const c = candidates.find((c) =>
            mode === 'skip'
              ? c.action.type === 'skip-start-build'
              : c.action.type === 'start-build' &&
                (general ||
                  before.holdings.find((h) => h.tileId === c.action.tileId)
                    .facilityLevel === (mode === 'final' ? 2 : 1)),
          );
          return {
            id: c.id,
            cost: c.quote.debit,
            tileId: c.action.tileId,
            selection: stale.id,
            expectedStage: c.action.tileId
              ? before.holdings.find((h) => h.tileId === c.action.tileId)
                  .facilityLevel + 1
              : null,
          };
        },
        { mode, general },
      );
      const buttons = page.locator('button[data-choice-id]');
      const index = await buttons.evaluateAll(
        (nodes, id) => nodes.findIndex((n) => n.dataset.choiceId === id),
        choice.id,
      );
      assert.ok(index >= 0);
      const button = buttons.nth(index);
      await button.evaluate((b) => {
        b.click();
        b.click();
      });
      await page.waitForFunction(
        () => !window.startQA.runtime.getState().economy.pendingStartBuild,
      );
      await page.waitForFunction(
        () => !document.querySelector('.pm-game').inert,
      );
      const outcome = await page.evaluate(
        ({ choice, mode }) => {
          const { runtime, before, stale } = window.startQA;
          const s = runtime.getState();
          runtime.adapter.choose(stale.id, choice.id); // Repeat stale UI callback after presentation.
          const again = runtime.getState();
          return {
            balance: s.players[0].balance,
            beforeBalance: before.players[0].balance,
            revisionDelta: s.economy.revision - before.economy.revision,
            sameAfterStale: again === s,
            landingPreserved:
              JSON.stringify(s.economy.landing) ===
              JSON.stringify(before.economy.landing),
            stage: s.holdings.find((h) => h.tileId === choice.tileId)
              ?.facilityLevel,
            mode,
            cost: choice.cost,
            pendingDebt: s.economy.pendingDebt,
            laps: s.economy.completedLapsByPlayerId['player:1'],
            turn: s.turnNumber,
          };
        },
        { choice, mode },
      );
      assert.equal(outcome.balance, outcome.beforeBalance - choice.cost);
      assert.equal(outcome.revisionDelta, 1);
      assert.equal(outcome.sameAfterStale, true);
      assert.equal(outcome.landingPreserved, true);
      assert.equal(outcome.pendingDebt, null);
      if (mode !== 'skip') assert.equal(outcome.stage, choice.expectedStage);
      assert.deepEqual(errors, []);
      report.push({ width, mode, geometry, ...outcome, errors });
      console.log(JSON.stringify(report.at(-1)));
      await page.screenshot({ path: `${folder}/${mode}-done-${width}.png` });
      await page.close();
    }
  }
  await writeFile(
    `${folder}/report.json`,
    JSON.stringify(
      { browser: await browser.version(), cases: report },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
