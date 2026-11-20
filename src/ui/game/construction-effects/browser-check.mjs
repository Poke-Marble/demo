/* global window, document, getComputedStyle, structuredClone */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { format } from 'prettier';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const folder = 'src/ui/game/construction-effects/evidence';
await mkdir(folder, { recursive: true });
const base = 'http://127.0.0.1:5191';
const report = {
  browser: await browser.version(),
  viewports: [1280, 390],
  deviceScaleFactor: 2,
  errors: [],
  checks: [],
};
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
page.on('pageerror', (error) => report.errors.push(error.message));
try {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/src/ui/game/construction-effects/preview.html`);
    await page
      .getByRole('button', { name: '전기 · 최종완성', exact: true })
      .click();
    await page.locator('.pm-construction-effects:not([hidden])').waitFor();
    await page.waitForTimeout(450);
    await page.screenshot({
      path: `${folder}/preview-${width}.png`,
      scale: 'css',
    });
    assert.match(
      await page.locator('.pm-construction-caption').innerText(),
      /랜드마크 완성![\s\S]*등대/,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.keyboard.press('Escape');
    await page
      .locator('.pm-construction-effects[hidden]')
      .waitFor({ state: 'attached' });
  }
  report.checks.push(
    '1280/390 independent preview, Korean final facility, no overflow, Escape',
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base);
  await page.evaluate(async () => {
    const { committedFinalFixture } =
      await import('/src/ui/game/construction-effects/fixture.ts');
    const { mountGameUI } = await import('/src/ui/game/index.ts');
    const { before, update } = committedFinalFixture();
    before.computer.connected = false;
    update.view.computer.connected = false;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    let receive;
    const qa = (window.qa = { ack: 0, commands: 0, update, before });
    qa.game = mountGameUI(root, {
      getView: () => before,
      subscribe(fn) {
        receive = fn;
        return () => {};
      },
      dispatch() {
        qa.commands++;
      },
      choose() {
        qa.commands++;
      },
      start() {},
      restart() {},
    });
    qa.send = (u, duplicate = false) => {
      const receipt = { ...u, presentationComplete: () => qa.ack++ };
      receive(receipt);
      if (duplicate)
        receive({ ...receipt, events: structuredClone(receipt.events) });
    };
    qa.send(
      {
        ...update,
        abilityActivations: [
          {
            id: 'ability:construction',
            playerId: update.view.state.players[0].id,
            pokemonId: 'pokemon:0001',
            abilityId: 'overgrow',
            type: 'grass',
            amount: 10,
            description: '기존 특성은 별도 연출',
          },
        ],
      },
      true,
    );
  });
  await page.locator('.pm-construction-effects:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.qa.ack), 0);
  assert.equal(await page.locator('.ability-hud:not([hidden])').count(), 0);
  assert.equal(
    await page.evaluate(() => document.querySelector('.pm-game').inert),
    true,
  );
  assert.equal(
    await page
      .locator('.pm-construction-effects')
      .evaluate((node) => getComputedStyle(node).pointerEvents),
    'none',
  );
  assert.equal(await page.locator('.pm-sfx-controls').count(), 0);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${folder}/game-final-1280.png`,
    scale: 'css',
  });
  await page.locator('.ability-hud:not([hidden])').waitFor();
  assert.equal(
    await page.locator('.pm-construction-effects:not([hidden])').count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.qa.ack), 0);
  await page.waitForFunction(() => window.qa.ack === 1);
  assert.equal(await page.evaluate(() => window.qa.commands), 0);
  await page.evaluate(() =>
    window.qa.send({ ...window.qa.update, id: 'original-command-redelivery' }),
  );
  await page.waitForFunction(() => window.qa.ack === 2);
  assert.equal(
    await page.locator('.pm-construction-effects:not([hidden])').count(),
    0,
  );
  report.checks.push(
    'real mountGameUI: movement/board -> construction -> ability -> once-only ack; duplicate receipt; command redelivery; input inert; pointer pass; no mute panel; zero finance commands',
  );

  // New transactions to exercise cancel, restart, destroy, motion and mobile layout.
  for (const [index, action] of [
    'skip',
    'restart',
    'motion',
    'destroy',
  ].entries()) {
    const expectedAck =
      (await page.evaluate(() => window.qa.ack)) +
      (action === 'restart' ? 3 : 2);
    await page.evaluate(
      ({ action, index }) => {
        const q = window.qa;
        const next = structuredClone(q.update);
        next.id = `cancel:${index}`;
        next.view.state.economy.revision += index + 1;
        q.send({
          ...next,
          id: `${next.id}:baseline`,
          view: { ...next.view, state: { ...next.view.state, holdings: [] } },
          events: [],
        });
        q.send(next);
        q.cancelAction = action;
      },
      { action, index },
    );
    await page.locator('.pm-construction-effects:not([hidden])').waitFor();
    if (action === 'skip') await page.keyboard.press('Escape');
    if (action === 'restart')
      await page.evaluate(() =>
        window.qa.send({
          id: 'restart',
          view: {
            ...window.qa.before,
            state: { ...window.qa.before.state, phase: 'setup' },
          },
          events: [],
        }),
      );
    if (action === 'destroy')
      await page.evaluate(() => window.qa.game.destroy());
    if (action === 'motion')
      await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(
      () => !document.querySelector('.pm-construction-effects:not([hidden])'),
    );
    await page.waitForFunction(
      (expected) => window.qa.ack === expected,
      expectedAck,
    );
    if (action !== 'destroy')
      assert.equal(
        await page.locator('.pm-game').evaluate((node) => node.inert),
        false,
      );
    if (action === 'motion')
      await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  report.checks.push(
    'skip/restart/live reduced-motion/destroy clear construction, release each ack and unlock input',
  );

  // Actual unmodified economic producer: seeded roll and legal purchase selection.
  await page.goto(base);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(async () => {
    const { mountGameUI } = await import('/src/ui/game/index.ts');
    const { createIntegratedPreview } =
      await import('/src/ui/game/integration/adapter.ts');
    const { createInitialRoster } = await import('/src/ui/game/setup.ts');
    const { createEconomyContext, getLegalActions } =
      await import('/src/game/economy/index.ts');
    const { kantoJohtoMap } = await import('/src/data/maps/kanto-johto.ts');
    const runtime = createIntegratedPreview({ seed: 1 });
    runtime.adapter.start({
      mapId: runtime.adapter.getView().map.id,
      participants: createInitialRoster('pokemon:0001'),
    });
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const events = [];
    const view = (v) => ({ ...v, computer: { connected: false, status: '' } });
    const adapter = {
      ...runtime.adapter,
      getView: () => view(runtime.adapter.getView()),
      subscribe(fn) {
        return runtime.adapter.subscribe((u) => {
          events.push(...u.events);
          fn({ ...u, view: view(u.view) });
        });
      },
      runComputerTurn: undefined,
    };
    const game = mountGameUI(root, adapter);
    window.real = {
      runtime,
      game,
      events,
      legal: () =>
        getLegalActions(
          runtime.getState(),
          createEconomyContext(kantoJohtoMap),
          runtime.getState().activePlayerId,
        ).actions,
    };
    runtime.adapter.dispatch({
      type: 'roll-dice',
      playerId: runtime.getState().activePlayerId,
    });
  });
  await page.waitForFunction(() =>
    window.real.events.some((e) => e.type === 'dice-rolled'),
  );
  await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
  const legal = await page.evaluate(() =>
    window.real.legal().map((a) => a.intent.type),
  );
  assert.ok(legal.includes('construct-property'), JSON.stringify(legal));
  await page.evaluate(() => {
    const q = window.real;
    const choice = q
      .legal()
      .filter((a) => a.intent.type === 'construct-property')
      .sort((a, b) => b.intent.targetStage - a.intent.targetStage)[0];
    const prompt = q.runtime.adapter.getView().prompt;
    q.runtime.adapter.choose(prompt.id, choice.actionKey);
  });
  await page.locator('.pm-construction-effects:not([hidden])').waitFor();
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${folder}/game-real-390.png`, scale: 'css' });
  assert.equal(
    await page.evaluate(() =>
      window.real.events.some((e) => e.type === 'city-acquired'),
    ),
    true,
  );
  await page.waitForFunction(() => !document.querySelector('.pm-game').inert);
  report.checks.push(
    '390 actual seed=1 integrated adapter roll -> legal construct -> committed city-acquired/facility-upgraded -> Canvas -> ability -> release',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/src/ui/game/construction-effects/preview.html`);
  await page
    .getByRole('button', { name: '불 · 최종완성', exact: true })
    .click();
  await page.waitForTimeout(400);
  assert.equal(
    await page.locator('.pm-construction-effects:not([hidden])').count(),
    0,
  );
  report.checks.push(
    'Chrome reduced motion completes immediately with short static notice',
  );
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${folder}/browser-report.json`,
    await format(JSON.stringify(report), { parser: 'json' }),
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
