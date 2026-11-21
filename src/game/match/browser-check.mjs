/* global window */
import process from 'node:process';
import console from 'node:console';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_PATH ??
        '../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs',
    ),
  ).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  reducedMotion: 'reduce',
});
const errors = [],
  failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => failed.push(r.url()));
const folder = 'artifacts/match-evidence';
await mkdir(folder, { recursive: true });
try {
  await page.goto('http://127.0.0.1:5204/src/game/match/preview.html');
  await page.evaluate(() => window.matchHarness.ready);
  assert.equal(
    await page.evaluate(
      () =>
        window.matchHarness.runtime.adapter.getView().matchProgress
          .currentRound,
    ),
    20,
  );
  await page.screenshot({ path: `${folder}/last-round.png` });
  const before = await page.evaluate(() => {
    const s = window.matchHarness.runtime.getState();
    return {
      session: s.economy.sessionId,
      rounds: s.match.completedRounds,
      turn: s.turnNumber,
      commands: window.matchHarness.commands,
    };
  });
  assert.equal(before.rounds, 19);
  const final = await page.evaluate(() => window.matchHarness.finish());
  assert.equal(final.phase, 'finished');
  assert.equal(final.victory.reason, 'round-limit-assets');
  assert.equal(final.match.completedRounds, 20);
  assert.equal(final.match.finalRanking.length, 4);
  await page.getByRole('button', { name: /새 여행 시작/ }).waitFor();
  const resultText = await page.locator('.pm-dialog').innerText();
  assert.match(resultText, /라운드 제한 · 최종 자산/);
  assert.match(resultText, /최종 자산 순위/);
  assert.match(resultText, /동점: 현금 우선/);
  await page.screenshot({ path: `${folder}/result.png` });
  // Finished financial input cannot execute, even if an old roll is submitted.
  const blocked = await page.evaluate(() => {
    const p = window.matchHarness.runtime,
      before = p.getState();
    p.adapter.dispatch({ type: 'roll-dice', playerId: before.activePlayerId });
    return p.getState() === before;
  });
  assert.equal(blocked, true);
  await page.getByRole('button', { name: /새 여행 시작/ }).click();
  await page.getByRole('button', { name: /NEW GAME/ }).waitFor();
  const restarted = await page.evaluate(() => {
    const s = window.matchHarness.runtime.getState();
    return {
      phase: s.phase,
      rounds: s.match.completedRounds,
      ranking: s.match.finalRanking,
      turn: s.turnNumber,
      session: s.economy.sessionId,
    };
  });
  assert.equal(restarted.phase, 'setup');
  assert.equal(restarted.rounds, 0);
  assert.equal(restarted.ranking, null);
  assert.equal(restarted.turn, 1);
  assert.notEqual(restarted.session, before.session);
  await page.screenshot({ path: `${folder}/restart.png` });
  await page.getByRole('button', { name: /NEW GAME/ }).click();
  await page.getByRole('button', { name: /꼬부기 선택/ }).click();
  await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
  await page.getByRole('button', { name: /게임 시작/ }).click();
  const newGame = await page.evaluate(() => {
    const s = window.matchHarness.runtime.getState();
    return {
      phase: s.phase,
      rounds: s.match.completedRounds,
      limit: s.match.roundLimit,
      ranking: s.match.finalRanking,
      turn: s.turnNumber,
      session: s.economy.sessionId,
      revision: s.economy.revision,
    };
  });
  assert.equal(newGame.phase, 'playing');
  assert.equal(newGame.rounds, 0);
  assert.equal(newGame.ranking, null);
  assert.equal(newGame.turn, 1);
  assert.equal(newGame.revision, 0);
  assert.equal(newGame.limit, 30);
  assert.notEqual(newGame.session, restarted.session);
  await page.screenshot({ path: `${folder}/new-game.png` });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  const report = {
    browser: await browser.version(),
    cleanHarness: true,
    seed: 42,
    preset: 'quick',
    before,
    victory: final.victory,
    match: final.match,
    restarted,
    newGame,
    blocked,
    resultText,
    errors,
    failed,
  };
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: `${folder}/failure.png` });
  console.log(
    JSON.stringify({
      errors,
      failed,
      text: await page.locator('body').innerText(),
    }),
  );
  throw error;
} finally {
  await browser.close();
}
