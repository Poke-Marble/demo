/* global document, MutationObserver, innerWidth, window */
import { chromium } from '../../../../../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import console from 'node:console';
import assert from 'node:assert/strict';
import { plan } from '../../../game/ai/planner.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';

// Actual Chrome + seeded production adapter. Only legal UI inputs and timing skips.
const dir = 'artifacts/special-feedback';
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
});
const errors = [],
  receipts = [],
  captures = new Set();
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5196/?qa&fast&seed=1');
  await page.getByRole('button', { name: /NEW GAME/ }).click();
  await page.getByRole('button', { name: '꼬부기 선택', exact: true }).click();
  await page.getByRole('button', { name: /다음.*맵 선택/ }).click();
  await page.getByRole('button', { name: /게임 시작/ }).click();
  await page.locator('.phaser-board canvas').waitFor();
  await page.evaluate(() => {
    window.__resultEvidence = [];
    new MutationObserver(() => {
      const node = document.querySelector('.pm-result-notice');
      if (!node || node.hidden || !node.textContent) return;
      const text = node.textContent;
      if (window.__resultEvidence.at(-1)?.text === text) return;
      window.__resultEvidence.push({
        text,
        snapshot: JSON.parse(document.querySelector('#app').dataset.qaSnapshot),
        hud: [...document.querySelectorAll('.pm-hud-player')].map((row) => ({
          id: row.dataset.playerId,
          text: row.textContent,
          trialDetails: row.querySelector('.pm-hud-chip[title]')?.title,
        })),
      });
    }).observe(document.querySelector('#app'), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  let previousRevision,
    duplicateChecks = 0,
    flights = 0,
    ropeUsed = false,
    lastProgress = Date.now();
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const snap = JSON.parse(
      await page.locator('#app').getAttribute('data-qa-snapshot'),
    );
    if (snap.revision !== previousRevision) {
      previousRevision = snap.revision;
      lastProgress = Date.now();
    }
    assert.ok(Date.now() - lastProgress < 20000, 'turn/ack stalled');
    const text = await page
      .locator('.pm-result-notice')
      .innerText()
      .catch(() => '');
    const kind = /가호 1회 소비/.test(text)
      ? 'consumed'
      : /시험 \d+회차 성공/.test(text)
        ? 'success'
        : /시험.*실패/.test(text)
          ? 'failed'
          : /탈출로프 1개 사용/.test(text)
            ? 'rope'
            : /비행 도착/.test(text)
              ? 'flight'
              : undefined;
    if (
      kind &&
      text.startsWith('나 ·') &&
      !captures.has(kind) &&
      (await page.locator('.pm-result-notice').isVisible())
    ) {
      assert.equal(
        await page
          .locator('.pm-result-notice')
          .evaluate((n) => n.matches(':popover-open')),
        true,
        'results remain in top layer above native trial dialog',
      );
      captures.add(kind);
      for (const width of [1280, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 900,
        });
        await page.screenshot({ path: `${dir}/${kind}-${width}.png` });
        if (width === 390 && kind !== 'failed') {
          await page
            .locator('.pm-hud-player[data-player-id="player:1"]')
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${dir}/${kind}-hud-390.png` });
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `horizontal overflow ${kind} ${width}`,
        );
        const bounds = await page.locator('.pm-result-notice').boundingBox();
        assert.ok(
          bounds.x >= 0 && bounds.x + bounds.width <= width,
          'notice fits viewport',
        );
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      console.log('CAPTURE', kind, snap.turn, text);
    }
    const ropeReceipt = receipts.find((r) => r.action === 'use-escape-rope');
    if (
      captures.size === 5 &&
      ropeReceipt &&
      receipts.some(
        (r) =>
          r.action === 'roll-dice' &&
          r.turn === ropeReceipt.turn &&
          Number(r.before) >= Number(ropeReceipt.after),
      )
    )
      break;
    if (Number(snap.turn) > 105 || snap.phase === 'finished') break;
    const skip = page.locator('.pm-feedback-skip');
    if (await skip.isVisible())
      await skip.click({ timeout: 1000 }).catch(() => {});
    if (
      snap.players.find((p) => p.id === snap.activePlayerId)?.controller ===
      'human'
    ) {
      let candidate = plan(
        {
          ...snap,
          players: snap.players.map((p) => ({ ...p, controller: 'computer' })),
        },
        42,
      )?.candidate;
      if (Number(snap.turn) < 9)
        candidate = snap.candidates.find((c) => c.kind === 'pass') ?? candidate;
      if (!ropeUsed && !snap.candidates.some((c) => c.kind === 'trial'))
        candidate = snap.candidates.find((c) => c.kind === 'rope') ?? candidate;
      if (candidate?.action.type === 'fly') {
        let tile = kantoJohtoMap.tiles.find(
          (t) => t.id === candidate.action.to,
        );
        const opponent = page
          .locator('.pm-flight-card')
          .filter({ hasText: '상대 소유' })
          .first();
        if (flights === 0) {
          tile = kantoJohtoMap.tiles.find((t) => t.special === 'ho-oh-trial');
        } else if (await opponent.count()) {
          const name = await opponent.locator('strong').innerText();
          tile = kantoJohtoMap.tiles.find((t) => t.nameKo === name);
        }
        const destination = page
          .locator('.pm-flight-card')
          .filter({ has: page.locator('strong', { hasText: tile.nameKo }) });
        if ((await destination.count()) && (await destination.isEnabled())) {
          const price = await destination
            .locator('.pm-flight-price')
            .innerText();
          const toll = Number(
            price.match(/통행료 견적 ([\d,]+)/)?.[1].replaceAll(',', '') ?? 0,
          );
          await destination.click();
          const after = await page
            .getByRole('button', { name: '목적지 확정', exact: true })
            .evaluate((node) => {
              node.click();
              node.click();
              return JSON.parse(
                document.querySelector('#app').dataset.qaSnapshot,
              );
            });
          assert.equal(Number(after.revision), Number(snap.revision) + 1);
          assert.equal(
            snap.cash - after.cash,
            toll,
            'flight toll charged exactly once at authoritative displayed quote',
          );
          receipts.push({
            turn: snap.turn,
            before: snap.revision,
            after: after.revision,
            action: 'fly',
            toll,
            cashBefore: snap.cash,
            cashAfter: after.cash,
          });
          flights++;
        }
      } else if (candidate) {
        const button = page.locator('button[data-choice-id]');
        const index = await button.evaluateAll(
          (nodes, id) => nodes.findIndex((n) => n.dataset.choiceId === id),
          candidate.id,
        );
        if (
          index >= 0 &&
          (await button.nth(index).isEnabled()) &&
          !(await page.locator('.pm-game').evaluate((n) => n.inert))
        ) {
          const before = snap.revision;
          const after = await button.nth(index).evaluate((node) => {
            node.click();
            node.click();
            return JSON.parse(
              document.querySelector('#app').dataset.qaSnapshot,
            );
          });
          assert.equal(
            Number(after.revision),
            Number(before) + 1,
            'same revision input commits exactly once',
          );
          duplicateChecks++;
          if (candidate.kind === 'rope') ropeUsed = true;
          receipts.push({
            turn: snap.turn,
            before,
            after: after.revision,
            action: candidate.action.type,
            cashBefore: snap.cash,
            cashAfter: after.cash,
          });
          if (
            ['attempt-trial', 'use-escape-rope', 'construct-property'].includes(
              candidate.action.type,
            )
          )
            await page.waitForTimeout(200);
        }
      }
    }
    await page.waitForTimeout(20);
  }
  const evidence = await page.evaluate(() => window.__resultEvidence);
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      { errors, captures: [...captures], duplicateChecks, receipts, evidence },
      null,
      2,
    ),
  );
  assert.equal(errors.length, 0);
  assert.ok(duplicateChecks > 10);
  const acquired = evidence.find(
    (e) => e.text.startsWith('나 · 칠색조 시험') && /회차 성공/.test(e.text),
  );
  assert.match(acquired.hud[0].text, /가호 · 칠색조/);
  const consumed = evidence.filter((e) =>
    e.text.startsWith('나 · 칠색조 가호 1회 소비'),
  );
  assert.equal(
    consumed.length,
    1,
    'one committed blessing has one alert despite repeated inputs',
  );
  assert.doesNotMatch(consumed[0].hud[0].text, /가호 · 칠색조/);
  const charged = Number(consumed[0].text.match(/→ (\d+) ₽/)[1]);
  const purchase = receipts.find(
    (r) =>
      r.turn === consumed[0].snapshot.turn && r.action === 'construct-property',
  );
  assert.equal(
    purchase.cashBefore - purchase.cashAfter,
    charged,
    'receipt charge equals actual money debit',
  );
  const escaped = evidence.find((e) => e.text.startsWith('나 · 탈출로프'));
  assert.match(escaped.hud[0].text, /로프 · 0개/);
  assert.ok(
    receipts.some(
      (r) => r.turn === escaped.snapshot.turn && r.action === 'roll-dice',
    ),
    'rope restores same-turn rolling',
  );
  assert.ok(
    receipts.some((r) => r.action === 'fly' && r.toll > 0),
    'actual paid flight landing covered',
  );
  assert.ok(
    captures.has('success') &&
      captures.has('failed') &&
      captures.has('consumed') &&
      captures.has('flight') &&
      captures.has('rope'),
  );
  console.log('PASS', {
    captures: [...captures],
    duplicateChecks,
    outcomes: evidence.length,
  });
} catch (error) {
  await page.screenshot({ path: `${dir}/failure.png`, fullPage: true });
  console.log(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
