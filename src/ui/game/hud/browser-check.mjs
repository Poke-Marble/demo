/* global window, document, getComputedStyle, innerWidth, MutationObserver, structuredClone */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { preview } from 'vite';

// Reuse the existing browser tool installation without changing project dependencies.
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.HUD_PLAYWRIGHT_PATH ??
        '../feat-gameplay-feedback/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const folder = 'artifacts/player-hud';
await mkdir(folder, { recursive: true });
const report = { browser: await browser.version(), errors: [], checks: [] };
const url = 'http://127.0.0.1:5182/hud-preview.html';
async function page(options = {}) {
  const p = await browser.newPage(options);
  p.on('pageerror', (error) => report.errors.push(error.message));
  await p.goto(url);
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll('.pm-player-hud .pm-portrait img')]
        .length === 4 &&
      [...document.querySelectorAll('.pm-player-hud .pm-portrait img')].every(
        (img) => img.complete && img.naturalWidth === 40,
      ),
  );
  return p;
}
async function geometry(p) {
  return p.evaluate(() => {
    const problems = [];
    const intersect = (a, b) =>
      a.left < b.right - 1 &&
      a.right > b.left + 1 &&
      a.top < b.bottom - 1 &&
      a.bottom > b.top + 1;
    for (const row of document.querySelectorAll('.pm-hud-player')) {
      const bounds = row.getBoundingClientRect();
      const parts = [
        '.pm-hud-name',
        '.pm-hud-portrait',
        '.pm-balance',
        '.pm-hud-assets',
      ].map((s) => row.querySelector(s).getBoundingClientRect());
      for (const box of parts) {
        if (
          box.left < bounds.left ||
          box.right > bounds.right + 1 ||
          box.bottom > bounds.bottom + 1
        )
          problems.push('content outside row');
      }
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++)
          if (intersect(parts[i], parts[j])) problems.push('content overlaps');
    }
    const board = document
      .querySelector('.pm-hud-board-slot')
      .getBoundingClientRect();
    const hud = document.querySelector('.pm-hud-slot').getBoundingClientRect();
    if (intersect(board, hud)) problems.push('board overlaps HUD');
    if (document.documentElement.scrollWidth > innerWidth)
      problems.push('horizontal page overflow');
    return problems;
  });
}
async function fixture(p, external = false) {
  await p.evaluate(async (external) => {
    const { mountPlayerHud } = await import('/src/ui/game/hud/index.ts');
    const { createEmotionController } =
      await import('/src/ui/game/portraits/emotions.ts');
    const { createGame } = await import('/src/game/core/index.ts');
    const { createInitialRoster } = await import('/src/ui/game/setup.ts');
    const { kantoJohtoMap: map } =
      await import('/src/data/maps/kanto-johto.ts');
    const participants = createInitialRoster('pokemon:0025');
    const view = {
      state: createGame(map, participants),
      map,
      mapName: '관동 · 성도',
      participants,
      computer: { connected: true, status: '대기' },
      actions: [],
    };
    const root = document.querySelector('#hud-slot');
    root.replaceChildren();
    let ui;
    const emotions = external
      ? createEmotionController((id) => ui?.refreshEmotions(id), 80)
      : undefined;
    const callbacks = [];
    ui = mountPlayerHud(root, view, {
      ...(emotions ? { emotions } : {}),
      onAssetDetails: (request) => callbacks.push(request),
    });
    window.fixture = { ui, view, emotions, callbacks };
  }, external);
  await p.waitForFunction(
    () =>
      document.querySelectorAll('.pm-player-hud .pm-portrait img').length === 4,
  );
}
try {
  const desktop = await page({ viewport: { width: 1280, height: 1000 } });
  assert.equal(await desktop.locator('.pm-hud-player').count(), 4);
  assert.equal(await desktop.locator('[aria-current="step"]').count(), 1);
  assert.equal(
    await desktop.locator('.pm-hud-controller').first().textContent(),
    '사람 · 직접 플레이',
  );
  assert.equal(
    await desktop.locator('.pm-hud-assets').nth(2).textContent(),
    '도시 0 · 특별 명소 1  ›',
  );
  assert.deepEqual(await geometry(desktop), []);
  assert.deepEqual(
    await desktop
      .locator('.pm-hud-player')
      .evaluateAll((rows) => rows.map((r) => r.dataset.type)),
    ['electric', 'grass', 'fire', 'water'],
  );
  await desktop.screenshot({
    path: `${folder}/desktop-1280.png`,
    fullPage: true,
  });
  const images = await desktop.locator('.pm-portrait img').elementHandles();
  await desktop
    .getByRole('button', { name: '동일 상태 갱신', exact: true })
    .click();
  assert.ok(
    (
      await Promise.all(
        images.map((img) => img.evaluate((node) => node.isConnected)),
      )
    ).every(Boolean),
  );
  await desktop
    .getByRole('button', { name: '좌석 순서 변경', exact: true })
    .click();
  assert.deepEqual(
    await desktop
      .locator('.pm-hud-player')
      .evaluateAll((rows) => rows.map((r) => r.dataset.type)),
    ['grass', 'fire', 'water', 'electric'],
  );
  assert.ok(
    (
      await Promise.all(
        images.map((img) => img.evaluate((node) => node.isConnected)),
      )
    ).every(Boolean),
  );
  await desktop.getByRole('button', { name: '초기화', exact: true }).click();
  const details = desktop.locator('.pm-hud-assets').first();
  await details.focus();
  await desktop.keyboard.press('Enter');
  await desktop.getByRole('dialog').waitFor();
  assert.equal(await desktop.getByRole('dialog').locator('li').count(), 3);
  await desktop.screenshot({ path: `${folder}/assets-keyboard.png` });
  await desktop.keyboard.press('Escape');
  assert.equal(
    await details.evaluate((node) => document.activeElement === node),
    true,
  );
  await desktop
    .getByRole('button', { name: '통행료 확정 −120 / +120', exact: true })
    .click();
  assert.equal(
    await desktop.getByTestId('pm-balance').first().textContent(),
    '1,380 ₽',
  );
  assert.equal(
    await desktop.getByTestId('pm-balance').nth(1).textContent(),
    '1,620 ₽',
  );
  await desktop.waitForFunction(
    () =>
      document.querySelector('.pm-hud-player .pm-portrait').dataset.emotion ===
      'Worried',
  );
  await desktop.screenshot({
    path: `${folder}/cash-emotion.png`,
    fullPage: true,
  });
  await desktop.getByRole('button', { name: '차례 전환', exact: true }).click();
  assert.equal(
    await desktop
      .locator('[aria-current="step"]')
      .getAttribute('data-player-id'),
    'player:2',
  );
  await desktop
    .getByRole('button', { name: '긴 이름 / 큰 금액', exact: true })
    .click();
  await desktop.getByRole('button', { name: '파산 상태', exact: true }).click();
  await desktop.waitForFunction(
    () =>
      document.querySelector('[data-bankrupt="true"] .pm-portrait').dataset
        .emotion === 'Sad',
  );
  assert.deepEqual(await geometry(desktop), []);
  await desktop.screenshot({
    path: `${folder}/desktop-stress-1280.png`,
    fullPage: true,
  });
  report.checks.push(
    '1280: four types, authoritative city/landmark counts, stable portrait nodes, reordered seats, keyboard details + focus return, turn, confirmed cash, emotions, bankruptcy, long name/large balance, no overlap',
  );

  const mobile = await page({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  assert.deepEqual(await geometry(mobile), []);
  const columns = await mobile
    .locator('.pm-hud-list')
    .evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length,
    );
  assert.equal(columns, 2);
  await mobile.screenshot({ path: `${folder}/mobile-390.png`, fullPage: true });
  await mobile
    .getByRole('button', { name: '긴 이름 / 큰 금액', exact: true })
    .click();
  await mobile.getByRole('button', { name: '파산 상태', exact: true }).click();
  await mobile.waitForFunction(
    () =>
      document.querySelector('[data-bankrupt="true"] .pm-portrait').dataset
        .emotion === 'Sad',
  );
  assert.deepEqual(await geometry(mobile), []);
  await mobile.screenshot({
    path: `${folder}/mobile-stress-390.png`,
    fullPage: true,
  });
  assert.equal(
    await mobile
      .locator('.pm-hud-player')
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
    'none',
  );
  report.checks.push(
    '390 reduced motion: 2×2, full long name + large balance, bankrupt, no horizontal overflow or text/portrait/balance/board overlap',
  );

  const api = await page();
  await fixture(api);
  const result = await api.evaluate(async () => {
    const { ui, view, callbacks } = window.fixture;
    const first = view.state.players[0];
    const row = () =>
      ui.element.querySelector(`[data-player-id="${first.id}"]`);
    const images = [...ui.element.querySelectorAll('.pm-portrait img')];
    const mutations = [];
    const observer = new MutationObserver((records) =>
      mutations.push(...records),
    );
    observer.observe(ui.element.querySelector('[role="status"]'), {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const button = row().querySelector('button');
    button.focus();
    for (let i = 0; i < 5; i++) ui.update(structuredClone(view));
    const focusPreserved = document.activeElement === button;
    const portraitsPreserved = images.every((img) => img.isConnected);
    button.click();
    const callbackAuthoritative =
      callbacks.length === 1 &&
      callbacks[0].view !== view &&
      callbacks[0].view.state.players[0].balance === first.balance &&
      callbacks[0].playerId === first.id &&
      callbacks[0].trigger === button;
    const snapshot = structuredClone(view);
    snapshot.state.players[0].balance = 999;
    ui.update(snapshot);
    const noGuessedDelta =
      row().querySelector('.pm-hud-delta').textContent === '';
    const noGuessedStats =
      row().querySelector('.pm-hud-supplied').textContent === '';
    const cashEvents = [{ id: 'stable:one', playerId: first.id, amount: -501 }];
    ui.update(snapshot, {
      cashEvents,
      meta: {
        [first.id]: {
          totalAssets: 0,
          expectedIncome: 0,
          unpaidAmount: 0,
          abilityCooldown: '2턴',
        },
      },
    });
    const explicitStats = row().querySelector('.pm-hud-supplied').textContent;
    await new Promise((done) => window.setTimeout(done, 250));
    const announcementsBeforeRedelivery = mutations.length;
    ui.update(structuredClone(snapshot), {
      cashEvents: structuredClone(cashEvents),
    });
    await new Promise((done) => window.setTimeout(done, 250));
    const noRepeatedAnnouncement =
      mutations.length === announcementsBeforeRedelivery;
    await new Promise((done) => window.setTimeout(done, 1400));
    const duplicateDidNotRestartTimer =
      row().querySelector('.pm-hud-delta').textContent === '';
    const liveBeforeNoop = mutations.length;
    ui.update(snapshot, { meta: {} });
    await new Promise((done) => window.setTimeout(done, 250));
    const noReadOnNoop = liveBeforeNoop === mutations.length;
    const clearedMeta =
      row().querySelector('.pm-hud-supplied').textContent === '';
    ui.element.style.setProperty('--pm-font-game', 'monospace');
    const fontToken =
      getComputedStyle(row().querySelector('.pm-balance')).fontFamily ===
      'monospace';
    const noNameInBalance =
      row().querySelector('.pm-balance').textContent === '999 ₽';
    ui.update(snapshot, {
      emotionCues: [{ id: 'joy', playerId: first.id, reaction: 'joy' }],
    });
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    observer.disconnect();
    ui.destroy();
    ui.destroy();
    ui.update(view);
    return {
      focusPreserved,
      portraitsPreserved,
      callbackAuthoritative,
      noGuessedDelta,
      noGuessedStats,
      explicitStats,
      noRepeatedAnnouncement,
      duplicateDidNotRestartTimer,
      noReadOnNoop,
      clearedMeta,
      fontToken,
      noNameInBalance,
      destroyed: !ui.element.isConnected,
      reduced,
    };
  });
  for (const key of [
    'focusPreserved',
    'portraitsPreserved',
    'callbackAuthoritative',
    'noGuessedDelta',
    'noGuessedStats',
    'noRepeatedAnnouncement',
    'duplicateDidNotRestartTimer',
    'noReadOnNoop',
    'clearedMeta',
    'fontToken',
    'noNameInBalance',
    'destroyed',
  ])
    assert.equal(result[key], true, key);
  assert.ok(result.explicitStats.includes('총자산0 ₽'));
  report.checks.push({ lifecycleAndEvents: result });
  await fixture(api, true);
  const borrowed = await api.evaluate(async () => {
    const { ui, view, emotions } = window.fixture;
    const id = view.state.activePlayerId;
    emotions.apply({ id: 'borrowed-joy', playerId: id, reaction: 'joy' });
    await new Promise((done) => window.setTimeout(done, 30));
    const usesBorrowed =
      ui.element.querySelector('.pm-portrait').dataset.emotion === 'Happy';
    await new Promise((done) => window.setTimeout(done, 180));
    const expired = emotions.get(id) === 'normal';
    ui.destroy();
    emotions.apply({ id: 'after-destroy', playerId: id, reaction: 'pain' });
    const notDestroyedByHud = emotions.get(id) === 'pain';
    emotions.destroy();
    return { usesBorrowed, expired, notDestroyedByHud };
  });
  assert.deepEqual(borrowed, {
    usesBorrowed: true,
    expired: true,
    notDestroyedByHud: true,
  });
  report.checks.push({ borrowedController: borrowed });

  const server = await preview({
    configFile: false,
    build: { outDir: 'dist/player-hud' },
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  try {
    const address = server.httpServer.address();
    const production = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    production.on('pageerror', (error) => report.errors.push(error.message));
    await production.goto(`http://127.0.0.1:${address.port}/hud-preview.html`);
    await production.waitForFunction(
      () => document.querySelectorAll('.pm-portrait img').length === 4,
    );
    await production
      .getByRole('button', { name: '차례 전환', exact: true })
      .click();
    assert.equal(
      await production
        .locator('[aria-current="step"]')
        .getAttribute('data-player-id'),
      'player:2',
    );
    await production.screenshot({
      path: `${folder}/production-1280.png`,
      fullPage: true,
    });
    report.checks.push(
      'dedicated production bundle: loads real portraits and updates turn without source imports',
    );
    await production.close();
  } finally {
    await new Promise((done) => server.httpServer.close(done));
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${folder}/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
globalThis.console.log(JSON.stringify(report, null, 2));
