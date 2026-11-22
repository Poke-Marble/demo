/* global window, document, innerWidth, innerHeight, getComputedStyle */
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
const phase = process.env.QA_PHASE ?? 'after';
const folder = `artifacts/property-overflow/${phase}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [375, 844],
    [844, 390],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/main.ts*', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5213');
    await page.evaluate(async () => {
      await import('/src/ui/game/integration/preview.css');
      const { createIntegratedPreview } =
        await import('/src/ui/game/integration/adapter.ts');
      const { mountGameUI } = await import('/src/ui/game/index.ts');
      const { createInitialRoster } = await import('/src/ui/game/setup.ts');
      const { createEconomyContext, economyProfileForPreset, quoteToll } =
        await import('/src/game/economy/index.ts');
      const { kantoJohtoMap } = await import('/src/data/maps/kanto-johto.ts');
      window.propertyQA = {
        mountGameUI,
        createIntegratedPreview,
        createInitialRoster,
      };
      window.propertyQA.load = (count, level = 0, visit = null) => {
        const qa = window.propertyQA;
        qa.ui?.destroy();
        const runtime = createIntegratedPreview({
          seed: 1,
          computerDelayMs: 0,
        });
        runtime.adapter.start({
          mapId: runtime.adapter.getView().map.id,
          participants: createInitialRoster('pokemon:0001'),
          rulesPreset: 'standard',
        });
        const state = runtime.getState();
        const tiles = runtime.adapter
          .getView()
          .map.tiles.filter((t) => t.kind === 'city' || t.kind === 'landmark');
        state.holdings = tiles.slice(0, count).map((t) => ({
          tileId: t.id,
          ownerId: 'player:1',
          facilityLevel: t.kind === 'city' ? level : 0,
        }));
        state.economy.developmentByTileId = Object.fromEntries(
          tiles
            .slice(0, count)
            .filter((t) => t.kind === 'city')
            .map((t) => [
              t.id,
              {
                stage: level,
                facilities: ['shop', 'center', 'final'].slice(0, level),
                centerReadyVisitOrdinal: level >= 2 ? 0 : null,
              },
            ]),
        );
        state.players = state.players.map((p) => ({ ...p, balance: 100000 }));
        if (visit) {
          const tile =
            visit === 'landmark'
              ? tiles.find((t) => t.kind === 'landmark')
              : tiles.find((t) => t.kind === 'city');
          if (visit === 'landmark')
            state.holdings = tiles
              .filter((t) => t.id !== tile.id)
              .map((t) => ({
                tileId: t.id,
                ownerId: 'player:1',
                facilityLevel: 0,
              }));
          state.core = { ...state.core, turnStage: 'awaiting-end' };
          state.players = state.players.map((p) =>
            p.id === 'player:1' ? { ...p, position: tile.id } : p,
          );
          state.economy.completedLapsByPlayerId['player:1'] = 4;
          state.economy.visitOrdinalByPlayerId['player:1'] = 3;
          state.economy.landing = {
            id: 'qa:visit',
            playerId: 'player:1',
            tileId: tile.id,
            visitOrdinal: 3,
            propertyDecisionUsed: false,
          };
          if (visit === 'takeover' || visit === 'debt')
            state.holdings = state.holdings.map((h) =>
              h.tileId === tile.id ? { ...h, ownerId: 'player:2' } : h,
            );
          if (visit === 'debt') {
            state.players = state.players.map((p) =>
              p.id === 'player:1' ? { ...p, balance: 0 } : p,
            );
            const quote = quoteToll(
              state,
              createEconomyContext(
                kantoJohtoMap,
                economyProfileForPreset('standard'),
              ),
              'player:1',
              tile.id,
            );
            state.economy.pendingDebt = {
              id: 'qa:debt',
              landingId: 'qa:visit',
              debtorId: 'player:1',
              creditorId: 'player:2',
              tileId: tile.id,
              gross: quote.gross,
              amount: quote.total,
              consumesBlessing: quote.consumesBlessing,
            };
          }
        }
        qa.runtime = runtime;
        qa.ui = mountGameUI(document.querySelector('#app'), {
          ...runtime.adapter,
          runComputerTurn: undefined,
        });
      };
    });
    const geometry = () =>
      page.evaluate(() => {
        const rect = (e) => e.getBoundingClientRect().toJSON();
        return {
          viewport: [innerWidth, innerHeight],
          document: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
          bodyOverflow: getComputedStyle(document.body).overflow,
          portraits: [...document.querySelectorAll('.pm-hud-portrait')].map(
            rect,
          ),
          rail: rect(document.querySelector('.pm-rail')),
          board: rect(document.querySelector('.phaser-board-surface')),
          header: rect(document.querySelector('.pm-header')),
          skills: rect(document.querySelector('.pm-skill-hud')),
          buttons: [...document.querySelectorAll('.pm-rail button')]
            .filter((e) => e.checkVisibility())
            .map((e) => ({
              text: e.textContent,
              disabled: e.disabled,
              ...rect(e),
            })),
          dialogs: [...document.querySelectorAll('dialog[open]')].map((e) => ({
            text: e.textContent,
            scrollHeight: e.scrollHeight,
            clientHeight: e.clientHeight,
            body: e.querySelector('.pm-dialog-body')
              ? {
                  scrollHeight: e.querySelector('.pm-dialog-body').scrollHeight,
                  clientHeight: e.querySelector('.pm-dialog-body').clientHeight,
                }
              : null,
            close: [...e.querySelectorAll('button')]
              .filter((b) => b.textContent === '닫기')
              .map(rect),
            ...rect(e),
          })),
        };
      });
    for (const [name, count, level, visit] of process.env.QA_CONTINUATION_ONLY
      ? []
      : [
          ['zero', 0, 0],
          ['many', 12, 1],
          ['maximum', 28, 0],
          ['final', 28, 3],
          ['purchase', 27, 0, 'landmark'],
          ['construction', 28, 2, 'city'],
          ['takeover', 28, 0, 'takeover'],
          ['debt', 28, 0, 'debt'],
        ]) {
      await page.evaluate(
        ([count, level, visit]) => window.propertyQA.load(count, level, visit),
        [count, level, visit],
      );
      await page.waitForSelector('.phaser-board-surface canvas');
      await page.waitForTimeout(150);
      const state = await geometry();
      const item = { width, height, name, state };
      await page.screenshot({
        path: `${folder}/screen-${name}-${width}x${height}.png`,
      });
      if (!visit) {
        await page
          .getByRole('button', { name: '자산 현황', exact: true })
          .click();
        item.assets = await geometry();
        if (phase === 'after' && count) {
          await page
            .getByRole('searchbox', { name: '소유 자산 검색' })
            .fill('찾을수없는도시');
          assert.equal(
            await page.locator('.pm-holdings-list li:visible').count(),
            0,
          );
          await page
            .getByRole('searchbox', { name: '소유 자산 검색' })
            .fill('');
          assert.equal(
            await page.locator('.pm-holdings-list li:visible').count(),
            count,
          );
        }
        await page.screenshot({
          path: `${folder}/${name}-${width}x${height}.png`,
        });
        await page.keyboard.press('Escape');
        if (count) {
          await page
            .getByRole('button', { name: '매각 선택', exact: true })
            .click();
          item.sales = await geometry();
          await page.keyboard.press('Escape');
        }
      }
      if (phase === 'after') {
        assert.ok(state.header.y >= 0 && state.header.bottom <= height);
        assert.ok(state.skills.y >= 0 && state.skills.bottom <= height);
        assert.match(await page.locator('.pm-skill-hud').innerText(), /PP/);
        if (!visit)
          assert.ok(
            state.buttons.some(
              (b) => b.text.includes('주사위 굴리기') && !b.disabled,
            ),
          );
        assert.deepEqual(
          state.document,
          [width, height],
          `${width} ${name} page geometry`,
        );
        assert.equal(state.portraits.length, 4);
        assert.ok(
          state.portraits.every((p) => p.width === 44 && p.height === 44),
        );
        assert.ok(
          state.buttons.every((b) => b.y >= 0 && b.bottom <= height),
          `${width} ${name} buttons`,
        );
        assert.notEqual(state.bodyOverflow, 'hidden');
        for (const snapshot of [state, item.assets, item.sales].filter(Boolean))
          for (const d of snapshot.dialogs) {
            assert.ok(
              d.y >= 0 && d.bottom <= height,
              `${width} ${name} dialog`,
            );
            assert.ok(
              d.close.every((b) => b.y >= d.y && b.bottom <= d.bottom),
              `${width} ${name} fixed close`,
            );
            assert.ok(
              d.scrollHeight <= d.clientHeight + 1,
              `${width} ${name} only body scrolls`,
            );
          }
        // Activate original opaque choices through real buttons, including the
        // last sale below the fold. Verify authoritative committed receipts.
        if (visit || name === 'maximum') {
          if (!visit)
            await page
              .getByRole('button', { name: '매각 선택', exact: true })
              .click();
          const pattern =
            name === 'purchase'
              ? '명소 구매'
              : name === 'construction'
                ? '대표 시설 완성'
                : name === 'takeover'
                  ? '인수'
                  : '매각';
          const expected = await page.evaluate((pattern) => {
            const view = window.propertyQA.runtime.adapter.getView();
            const choices = view.prompt?.choices ?? view.actions;
            const choice = choices
              .filter((c) => c.label.startsWith(pattern))
              .at(-1);
            return {
              choice,
              before: window.propertyQA.runtime.getState().economy.revision,
            };
          }, pattern);
          assert.ok(expected.choice, `${name} legal choice exists`);
          await page
            .locator('dialog[open] button[data-choice-id]')
            .filter({ hasText: expected.choice.label })
            .click();
          await page.waitForFunction(
            (revision) =>
              window.propertyQA.runtime.getState().economy.revision > revision,
            expected.before,
          );
          item.committed = await page.evaluate(() => {
            const state = window.propertyQA.runtime.getState();
            return {
              receipts: Object.values(state.economy.processedCommands).map(
                (c) => c.receipt,
              ),
              pendingDebt: state.economy.pendingDebt,
              holdings: state.holdings,
            };
          });
          const receipt = item.committed.receipts.at(-1);
          assert.equal(
            receipt.intentType,
            name === 'purchase'
              ? 'buy-landmark'
              : name === 'construction'
                ? 'construct-property'
                : name === 'takeover'
                  ? 'takeover-property'
                  : 'sell-property',
          );
          assert.ok(expected.choice.label.includes(`${receipt.quote.total} ₽`));
          if (name === 'debt') assert.equal(item.committed.pendingDebt, null);
        }
      }
      report.push(item);
      console.log(
        phase,
        width,
        height,
        name,
        state.document,
        state.buttons.at(-1)?.bottom,
      );
    }
    if (phase === 'after' && !process.env.QA_LONG_ONLY) {
      await page.evaluate(() => window.propertyQA.load(28));
      const details = page.locator('.pm-hud-assets').first();
      await details.click();
      assert.equal(await page.locator('.pm-holdings-list li').count(), 28);
      await page.getByRole('button', { name: '닫기', exact: true }).click();
      assert.equal(
        await details.evaluate((e) => document.activeElement === e),
        true,
      );
      // All properties is a geometry stress fixture beyond normal victory.
      // Use a fresh game for the ordinary roll/dice continuation.
      await page.evaluate(() => window.propertyQA.load(0));
      await page.waitForSelector('.phaser-board-surface canvas');
      await page.locator('.pm-action-roll').click();
      await page.waitForFunction(
        () => !document.querySelector('.pm-game').inert,
      );
      await page
        .locator('.pm-controls button[data-choice-id]')
        .filter({ hasText: '원래 합계로 이동' })
        .click();
      await page.waitForFunction(
        () => !document.querySelector('.pm-game').inert,
      );
      const receipts = await page.evaluate(() =>
        Object.values(
          window.propertyQA.runtime.getState().economy.processedCommands,
        ).map((c) => c.receipt.intentType),
      );
      assert.ok(
        receipts.includes('roll-dice') && receipts.includes('resolve-dice'),
      );
      report.push({ width, height, rollAndDiceChoices: receipts });
    }
    if (phase === 'after') {
      await page.evaluate(() => {
        const qa = window.propertyQA;
        qa.load(28, 2, 'city');
        qa.ui.destroy();
        const adapter = qa.runtime.adapter;
        qa.ui = qa.mountGameUI(document.querySelector('#app'), {
          ...adapter,
          runComputerTurn: undefined,
          getView() {
            const view = adapter.getView();
            return {
              ...view,
              prompt: {
                ...view.prompt,
                description: (
                  view.prompt.description +
                  ' 긴 시설 설명을 모두 확인할 수 있습니다. '
                ).repeat(50),
              },
            };
          },
        });
      });
      await page.waitForSelector('.phaser-board-surface canvas');
      const long = await geometry();
      assert.deepEqual(long.document, [width, height]);
      assert.ok(
        long.dialogs[0].body.scrollHeight > long.dialogs[0].body.clientHeight,
      );
      assert.ok(
        long.dialogs[0].scrollHeight <= long.dialogs[0].clientHeight + 1,
      );
      const last = page.locator('dialog[open] button[data-choice-id]').last();
      await last.scrollIntoViewIfNeeded();
      const bounds = await last.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height);
      await page.screenshot({
        path: `${folder}/long-description-${width}x${height}.png`,
      });
      report.push({ width, height, longDescription: long });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await writeFile(
    `${folder}/${process.env.QA_LONG_ONLY ? 'long-description' : process.env.QA_CONTINUATION_ONLY ? 'continuation' : 'report'}.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
