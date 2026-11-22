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
const folder = 'artifacts/skill-ui';
await mkdir(folder, { recursive: true });
const report = [];
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/main.ts*', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5211');
    await page.evaluate(async () => {
      await import('/src/ui/game/integration/preview.css');
      const { createIntegratedPreview } =
        await import('/src/ui/game/integration/adapter.ts');
      const { mountGameUI } = await import('/src/ui/game/index.ts');
      const { createInitialRoster } = await import('/src/ui/game/setup.ts');
      const runtime = createIntegratedPreview({ seed: 1, computerDelayMs: 0 });
      const receipts = [];
      const adapter = {
        ...runtime.adapter,
        runComputerTurn: undefined,
        subscribe(listener) {
          return runtime.adapter.subscribe((update) => {
            const receipt = {
              id: update.id,
              calls: 0,
              skills: update.skillActivations?.length ?? 0,
            };
            receipts.push(receipt);
            const wrapped = {
              ...update,
              presentationComplete() {
                receipt.calls++;
                update.presentationComplete?.();
              },
            };
            listener(wrapped);
            if (receipt.skills) listener(wrapped); // Replayed delivery must not duplicate animation or ack.
          });
        },
      };
      const ui = mountGameUI(document.querySelector('#app'), adapter);
      window.skillQA = {
        runtime,
        ui,
        receipts,
        start() {
          runtime.adapter.start({
            mapId: runtime.adapter.getView().map.id,
            participants: createInitialRoster('pokemon:0001'),
            rulesPreset: 'quick',
          });
        },
      };
      window.skillQA.start();
    });
    const idle = () =>
      page.waitForFunction(() => !document.querySelector('.pm-game').inert);
    await idle();
    await page
      .getByRole('button', { name: '승리·진척 ⓘ', exact: true })
      .click();
    assert.match(
      await page.locator('.pm-turn-details').innerText(),
      /승리 조건 5종/,
    );
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '기술 정보', exact: true }).click();
    assert.match(await page.locator('dialog').innerText(), /3PP/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /주사위 굴리기/ }).click();
    await idle();
    assert.match(
      await page.locator('.pm-dice-result').innerText(),
      /이동 선택/,
    );
    const revealed = await page.evaluate(() => {
      const state = window.skillQA.runtime.getState();
      return {
        position: state.players[0].position,
        values: state.core.pendingDice.values,
        pp: state.skills.players['player:1'].pp,
      };
    });
    assert.equal(revealed.pp, 3);
    await page.screenshot({ path: `${folder}/revealed-${width}.png` });
    // Use the exact opaque candidate rendered by the adapter, with no driver-side rule math.
    const id = await page.evaluate(
      () =>
        window.skillQA.runtime
          .snapshot()
          .candidates.find(
            (c) =>
              c.action.type === 'resolve-dice' && c.action.adjustment === -1,
          ).id,
    );
    const choices = page.locator('button[data-choice-id]');
    const choiceIndex = await choices.evaluateAll(
      (nodes, key) => nodes.findIndex((n) => n.dataset.choiceId === key),
      id,
    );
    assert.ok(choiceIndex >= 0);
    await choices.nth(choiceIndex).click();
    await page.waitForFunction(
      () => !document.querySelector('.pm-skill-presentation').hidden,
    );
    await page
      .getByRole('button', { name: '연출 스킵 · Esc', exact: true })
      .click();
    await idle();
    const after = await page.evaluate(() => ({
      pp: window.skillQA.runtime.getState().skills.players['player:1'].pp,
      receipts: window.skillQA.receipts,
      text: document.querySelector('.pm-dice-result').textContent,
      canvas: document
        .querySelector('.phaser-board canvas')
        .getBoundingClientRect()
        .toJSON(),
      skill: document
        .querySelector('.pm-skill-hud')
        .getBoundingClientRect()
        .toJSON(),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    assert.equal(after.pp, 2);
    assert.match(after.text, /실제 이동/);
    assert.equal(after.receipts.filter((r) => r.skills).length, 1);
    assert.ok(after.receipts.every((r) => r.calls === 1));
    assert.equal(after.overflow, false);
    assert.ok(after.canvas.width > 0 && after.canvas.height > 0);
    if (width === 390)
      assert.ok(
        after.canvas.bottom <= after.skill.top,
        'skill HUD stays below board',
      );
    await page.screenshot({ path: `${folder}/adjusted-${width}.png` });
    await page.getByRole('button', { name: /캠프 구매/ }).click();
    await idle();
    const beforeSale = await page.evaluate(() => ({
      cash: window.skillQA.runtime.getState().players[0].balance,
      revision: window.skillQA.runtime.getState().economy.revision,
    }));
    await page.getByRole('button', { name: '매각 선택', exact: true }).click();
    await page
      .locator('dialog[open] button[data-choice-id]')
      .first()
      .evaluate((node) => {
        node.click();
        node.click();
      });
    await idle();
    const sale = await page.evaluate(() => ({
      cash: window.skillQA.runtime.getState().players[0].balance,
      revision: window.skillQA.runtime.getState().economy.revision,
    }));
    assert.equal(sale.revision, beforeSale.revision + 1);
    assert.ok(sale.cash > beforeSale.cash);
    // A reset during the next real activation must settle its original receipt.
    await page.evaluate(() => {
      window.skillQA.runtime.adapter.restart();
      window.skillQA.start();
    });
    await idle();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: /주사위 굴리기/ }).click();
    await idle();
    await page.evaluate(() => {
      const { runtime } = window.skillQA;
      const candidate = runtime
        .snapshot()
        .candidates.find(
          (c) => c.action.type === 'resolve-dice' && c.action.adjustment === -1,
        );
      const choice = runtime.adapter
        .getView()
        .actions.find((a) => a.id === candidate.id);
      runtime.adapter.choose(choice.selectionId, choice.id);
      runtime.adapter.restart();
    });
    await idle();
    await page.evaluate(() => window.skillQA.start());
    await idle();
    await page.getByRole('button', { name: /주사위 굴리기/ }).click();
    await idle();
    await page.evaluate(() => {
      const { runtime } = window.skillQA;
      const candidate = runtime
        .snapshot()
        .candidates.find(
          (c) => c.action.type === 'resolve-dice' && c.action.adjustment === -1,
        );
      const choice = runtime.adapter
        .getView()
        .actions.find((a) => a.id === candidate.id);
      runtime.adapter.choose(choice.selectionId, choice.id);
    });
    await page.evaluate(() => window.skillQA.ui.destroy());
    const receipts = await page.evaluate(() => window.skillQA.receipts);
    assert.ok(
      receipts.every((r) => r.calls === 1),
      'reset/destroy settles once',
    );
    assert.deepEqual(errors, []);
    report.push({ width, revealed, after, sale, errors, resetDestroy: true });
    await page.close();
  }
  // Reach each economic skill through the actual engine and AI, then commit
  // its opaque candidate through the visible UI. No fixture ownership/cash.
  for (const pokemonId of ['pokemon:0004', 'pokemon:0025']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.route('**/src/main.ts*', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5211');
    const target = await page.evaluate(async (pokemonId) => {
      await import('/src/ui/game/integration/preview.css');
      const { createIntegratedPreview } =
        await import('/src/ui/game/integration/adapter.ts');
      const { mountGameUI } = await import('/src/ui/game/index.ts');
      const { createInitialRoster } = await import('/src/ui/game/setup.ts');
      const { plan } = await import('/src/game/ai/planner.ts');
      const runtime = createIntegratedPreview({ seed: 42, computerDelayMs: 0 });
      const a = runtime.adapter;
      a.start({
        mapId: a.getView().map.id,
        participants: createInitialRoster(pokemonId),
        rulesPreset: 'standard',
      });
      for (
        let count = 0;
        count < 600 && runtime.getState().phase === 'playing';
        count++
      ) {
        const snapshot = runtime.snapshot();
        if (snapshot.activePlayerId !== 'player:1') {
          await a.runComputerTurn(
            snapshot.activePlayerId,
            new AbortController().signal,
          );
          continue;
        }
        const candidate = snapshot.candidates.find(
          (c) =>
            c.action.type === 'use-skill' &&
            c.action.mode === 'signature' &&
            c.quote.debit <= snapshot.cash,
        );
        if (candidate) {
          const ui = mountGameUI(document.querySelector('#app'), {
            ...a,
            runComputerTurn: undefined,
          });
          window.economicSkillQA = { runtime, ui };
          return {
            id: candidate.id,
            debit: candidate.quote.debit,
            before: snapshot.cash,
            beforePP: runtime.getState().skills.players['player:1'].pp,
            turn: snapshot.turn,
          };
        }
        const choice = plan(
          {
            ...snapshot,
            players: snapshot.players.map((p) => ({
              ...p,
              controller: 'computer',
            })),
          },
          42,
        )?.candidate;
        if (!choice) throw Error('Missing legal step');
        const view = a.getView();
        if (choice.action.type === 'fly')
          a.selectFlightDestination(view.flightSelection.id, choice.action.to);
        else
          a.choose(
            view.prompt?.id ??
              view.actions.find((c) => c.id === choice.id).selectionId,
            choice.id,
          );
      }
      throw Error(`No signature opportunity for ${pokemonId}`);
    }, pokemonId);
    await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
    const buttons = page.locator('button[data-choice-id]');
    const index = await buttons.evaluateAll(
      (nodes, id) => nodes.findIndex((n) => n.dataset.choiceId === id),
      target.id,
    );
    assert.ok(index >= 0);
    await buttons.nth(index).click();
    await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
    const settled = await page.evaluate(() => ({
      cash: window.economicSkillQA.runtime.getState().players[0].balance,
      pp: window.economicSkillQA.runtime.getState().skills.players['player:1']
        .pp,
    }));
    assert.equal(settled.cash, target.before - target.debit);
    assert.equal(settled.pp, target.beforePP - 1);
    await page.screenshot({
      path: `${folder}/economic-${pokemonId.slice(-4)}.png`,
    });
    report.push({ pokemonId, target, settled });
    await page.evaluate(() => window.economicSkillQA.ui.destroy());
    await page.close();
  }
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
