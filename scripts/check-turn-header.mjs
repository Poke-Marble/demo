/* global window, document, innerWidth, innerHeight */
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
const folder = 'artifacts/turn-header';
await mkdir(folder, { recursive: true });
const report = [];
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [375, 812],
    [844, 390],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Run the real integration with diagnostics, retaining complete control of legal commands.
    await page.route('**/src/main.ts*', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5207');
    await page.evaluate(async () => {
      await import('/src/ui/game/integration/preview.css');
      const { createIntegratedPreview } =
        await import('/src/ui/game/integration/adapter.ts');
      const { mountGameUI } = await import('/src/ui/game/index.ts');
      const { createInitialRoster } = await import('/src/ui/game/setup.ts');
      const { plan } = await import('/src/game/ai/planner.ts');
      const r = createIntegratedPreview({ seed: 42, computerDelayMs: 0 });
      r.adapter.start({
        mapId: r.adapter.getView().map.id,
        participants: createInitialRoster('pokemon:0007'),
        rulesPreset: 'quick',
      });
      window.turnQA = {
        r,
        plan,
        mount() {
          this.ui = mountGameUI(document.querySelector('#app'), {
            ...r.adapter,
            runComputerTurn: undefined,
          });
        },
        unmount() {
          this.ui?.destroy();
        },
      };
      window.turnQA.mount();
    });
    await page.locator('.phaser-board-surface canvas').waitFor();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.pm-turn-seat').count(), 4);
    assert.equal(
      await page.locator('.pm-turn-seat[aria-current="step"]').count(),
      1,
    );
    assert.match(
      await page.locator('.pm-turn-header').innerText(),
      /라운드 1 \/ 20/,
    );
    const geometry = await page.evaluate(() => {
      const rect = (e) => e.getBoundingClientRect().toJSON();
      return {
        document: [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ],
        viewport: [innerWidth, innerHeight],
        header: rect(document.querySelector('.pm-turn-header')),
        buttons: [
          ...document.querySelectorAll('.pm-header button,.pm-controls button'),
        ]
          .filter((e) => e.checkVisibility())
          .map((e) => ({ text: e.textContent, ...rect(e) })),
        board: rect(document.querySelector('.phaser-board-surface')),
      };
    });
    assert.deepEqual(geometry.document, geometry.viewport);
    assert.ok(
      Math.abs(geometry.header.x + geometry.header.width / 2 - width / 2) < 2,
      'header centered',
    );
    assert.ok(
      geometry.buttons.every(
        (b) => b.x >= 0 && b.y >= 0 && b.right <= width && b.bottom <= height,
      ),
      'required buttons inside viewport',
    );
    await page.screenshot({ path: `${folder}/normal-${width}.png` });
    await page
      .getByRole('button', { name: '승리·진척 ⓘ', exact: true })
      .click();
    const details = await page.locator('.pm-turn-details').innerText();
    for (const term of [
      '승리 조건 5종',
      '파산:',
      '그룹:',
      '한 면:',
      '명소:',
      '제한 라운드:',
      '개인 주회',
      '전역 턴',
      '명소 목록',
    ])
      assert.ok(details.includes(term), term);
    await page.screenshot({ path: `${folder}/info-${width}.png` });
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.locator('.pm-controls button').first().click();
    await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
    await page.waitForTimeout(200);
    const actual = await page.evaluate(() => ({
      progress: window.turnQA.r.adapter.getView().matchProgress,
      header: document.querySelector('.pm-turn-header').textContent,
    }));
    assert.ok(
      actual.header.includes(
        `${actual.progress.currentRound} / ${actual.progress.roundLimit}`,
      ),
    );
    assert.ok(
      actual.header.includes(`남은 ${actual.progress.remainingRounds}`),
    );
    await page.evaluate(() => window.turnQA.unmount());
    {
      const seen = await page.evaluate(async () => {
        const q = window.turnQA,
          r = q.r,
          a = r.adapter;
        const checks = {
          trial: false,
          near: false,
          bankruptcy: false,
          final: false,
          commands: 0,
        };
        while (r.getState().phase === 'playing' && checks.commands < 2200) {
          const v = a.getView(),
            p = v.matchProgress;
          if (!checks.trial && p.players.some((x) => x.trial)) {
            q.mount();
            checks.trial = document
              .querySelector('.pm-turn-header')
              .textContent.includes('시험 체류');
            if (checks.trial) {
              const d = document.querySelector('dialog[open]');
              checks.trialDialog = d
                ? {
                    top: d.getBoundingClientRect().top,
                    bottom: d.getBoundingClientRect().bottom,
                  }
                : null;
            }
            q.unmount();
          }
          if (
            !checks.near &&
            p.players.some((x) =>
              x.groups.some((g) => g.owned > 0 && g.total - g.owned === 1),
            )
          ) {
            const { createTurnProgressInfo } =
              await import('/src/ui/game/turn-header.ts');
            const info = createTurnProgressInfo(v);
            checks.near = !!info.querySelector('.is-near');
            // Verify every projected group count against committed ownership.
            for (const x of p.players)
              for (const g of x.groups) {
                const group = v.map.cityGroups.find((z) => z.id === g.groupId);
                const owned = group.cityIds.filter((id) =>
                  v.state.holdings.some(
                    (h) => h.tileId === id && h.ownerId === x.playerId,
                  ),
                ).length;
                if (owned !== g.owned)
                  throw Error('Ownership projection mismatch');
              }
          }
          checks.bankruptcy ||= p.players.some((x) => x.bankrupt);
          const before = r.getState().economy.revision;
          if (r.getState().activePlayerId === 'player:1') {
            const snap = r.snapshot();
            const decision = q.plan(
              {
                ...snap,
                players: snap.players.map((x) => ({
                  ...x,
                  controller: 'computer',
                })),
              },
              42,
            );
            if (!decision) throw Error('Missing legal action');
            if (decision.candidate.action.type === 'fly')
              a.selectFlightDestination(
                v.flightSelection.id,
                decision.candidate.action.to,
              );
            else
              a.choose(
                v.prompt?.id ?? v.actions[0].selectionId,
                decision.candidate.id,
              );
          } else
            await a.runComputerTurn(
              r.getState().activePlayerId,
              new AbortController().signal,
            );
          const delta = r.getState().economy.revision - before;
          if (!delta) throw Error('No legal command progress');
          checks.commands += delta;
        }
        q.mount();
        checks.final = r.getState().phase === 'finished';
        checks.endReason = a.getView().matchProgress.endReason;
        return checks;
      });
      assert.ok(seen.trial, 'actual trial state visited');
      assert.ok(seen.near, 'actual ownership near monopoly visited');
      assert.ok(seen.final, 'actual match finished');
      if (seen.trialDialog)
        assert.ok(
          seen.trialDialog.top >= 0 && seen.trialDialog.bottom <= height,
        );
      await page
        .locator('.pm-dialog button')
        .filter({ hasText: '새 여행 시작' })
        .waitFor();
      assert.match(await page.locator('.pm-turn-header').innerText(), /승리/);
      await page.screenshot({ path: `${folder}/result-${width}.png` });
      await page
        .locator('.pm-dialog button')
        .filter({ hasText: '새 여행 시작' })
        .click();
      assert.equal(await page.locator('.pm-turn-header').count(), 0);
      report.push({ width, height, geometry, seen, errors });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    report.map(({ width, height, seen }) => ({ width, height, seen })),
  );
} finally {
  await browser.close();
}
