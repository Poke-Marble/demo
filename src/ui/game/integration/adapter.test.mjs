/* global AbortController, setImmediate, setTimeout, console */
import test from 'node:test';
import assert from 'node:assert/strict';
import { URLSearchParams } from 'node:url';
import { createIntegratedPreview } from './adapter.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import { createInitialRoster } from '../setup.ts';
import { plan } from '../../../game/ai/planner.ts';
import { seedFromQuery } from './seed.ts';

const start = (p) =>
  p.adapter.start({
    mapId: kantoJohtoMap.id,
    participants: createInitialRoster('pokemon:0007'),
  });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function keepRevealedDice(p) {
  if (!p.getState().core.pendingDice) return;
  const keep = p
    .snapshot()
    .candidates.find(
      (candidate) =>
        candidate.action.type === 'resolve-dice' &&
        candidate.action.adjustment === 0,
    );
  assert.ok(keep, 'authoritative free keep choice');
  const view = p.adapter.getView();
  p.adapter.choose(
    view.actions.find((a) => a.id === keep.id).selectionId,
    keep.id,
  );
}

test('new games select isolated standard/quick profiles and invalid setup preserves session', () => {
  const p = createIntegratedPreview({ computerDelayMs: 0, seed: 1 });
  const setup = {
    mapId: kantoJohtoMap.id,
    participants: createInitialRoster('pokemon:0001'),
  };
  p.adapter.start(setup);
  const standard = p.getState();
  assert.equal(standard.economy.profileId, 'standard-cumulative');
  assert.equal(standard.phase, 'playing');
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  assert.equal(p.getState().economy.revision, 1);
  keepRevealedDice(p);
  assert.match(
    p.adapter.getView().prompt.description,
    /개인 1주회 완료 필요 \(현재 0주회\)/,
  );
  assert.match(p.adapter.getView().prompt.description, /개인 2주회 완료 필요/);
  assert.match(
    p.adapter.getView().prompt.description,
    /센터 건설 후 이 도시에 다시 도착/,
  );
  const before = p.getState();
  assert.throws(
    () => p.adapter.start({ ...setup, rulesPreset: 'invalid' }),
    /invalid-rules-preset/,
  );
  assert.equal(p.getState(), before);
  const quickSetup = { ...setup, rulesPreset: 'quick' };
  p.adapter.start(quickSetup);
  const quick = p.getState();
  quickSetup.rulesPreset = 'standard';
  assert.equal(quick.economy.profileId, 'quick-cumulative');
  assert.notEqual(quick.economy.sessionId, standard.economy.sessionId);
  assert.notEqual(
    quick.economy.configurationKey,
    standard.economy.configurationKey,
  );
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  keepRevealedDice(p);
  assert.match(p.adapter.getView().prompt.description, /개인 1주회 완료 필요/);
  assert.doesNotMatch(p.adapter.getView().prompt.description, /개인 2주회/);
  p.adapter.restart();
  p.adapter.start(setup);
  assert.equal(p.getState().economy.profileId, 'standard-cumulative');
});

function humanStep(p) {
  const snap = p.snapshot();
  const decision = plan(
    {
      ...snap,
      players: snap.players.map((n) => ({ ...n, controller: 'computer' })),
    },
    42,
  );
  assert.ok(decision, 'legal planner decision');
  const a = decision.candidate.action;
  const v = p.adapter.getView();
  if (a.type === 'fly')
    p.adapter.selectFlightDestination(v.flightSelection.id, a.to);
  else if (v.prompt) p.adapter.choose(v.prompt.id, decision.candidate.id);
  else p.adapter.dispatch(a);
}

test('only accepted NEW GAME consumes one crypto uint32; previews and restart consume none', (t) => {
  const seeds = [0, 0xffffffff, 123456];
  const random = t.mock.method(
    globalThis.crypto,
    'getRandomValues',
    (values) => {
      assert.ok(values instanceof Uint32Array);
      assert.equal(values.length, 1);
      assert.ok(seeds.length, 'no extra entropy requests');
      values[0] = seeds.shift();
      return values;
    },
  );
  const p = createIntegratedPreview();
  assert.equal(random.mock.callCount(), 0);
  assert.equal(p.getState().phase, 'setup');
  assert.throws(() => p.adapter.start({ mapId: 'invalid', participants: [] }));
  assert.equal(random.mock.callCount(), 0);
  start(p);
  assert.equal(p.getState().core.rngState, 0);
  const firstSession = p.getState().economy.sessionId;
  start(p);
  assert.equal(p.getState().core.rngState, 0xffffffff);
  assert.notEqual(p.getState().economy.sessionId, firstSession);
  p.adapter.restart();
  assert.equal(p.getState().phase, 'setup');
  assert.equal(random.mock.callCount(), 2);
  start(p);
  assert.equal(p.getState().core.rngState, 123456);
  assert.equal(random.mock.callCount(), 3);
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  assert.notEqual(p.getState().core.rngState, 123456);
  assert.equal(random.mock.callCount(), 3, 'rolls still use core RNG');
});

test('query seed accepts uint32 including zero; missing/invalid values use fresh games', () => {
  for (const [query, expected] of [
    ['', undefined],
    ['seed=', undefined],
    ['seed=+', undefined],
    ['seed=oops', undefined],
    ['seed=-1', undefined],
    ['seed=1.5', undefined],
    ['seed=4294967296', undefined],
    ['seed=NaN', undefined],
    ['seed=Infinity', undefined],
    ['seed=0', 0],
    ['seed=42', 42],
    ['seed=4294967295', 0xffffffff],
  ])
    assert.equal(seedFromQuery(new URLSearchParams(query)), expected, query);
  for (const seed of [-1, 0x100000000, NaN, Infinity, 1.5, null])
    assert.throws(() => createIntegratedPreview({ seed }), RangeError);
});

for (const rulesPreset of ['standard', 'quick'])
  test(`explicit zero replays human and all AI legal sequences after restart: ${rulesPreset}`, async (t) => {
    t.mock.method(globalThis.crypto, 'getRandomValues', () => {
      assert.fail('explicit seed must never request entropy');
    });
    const p = createIntegratedPreview({ seed: 0, computerDelayMs: 0 });
    const play = async () => {
      p.adapter.start({
        mapId: kantoJohtoMap.id,
        participants: createInitialRoster('pokemon:0007'),
        rulesPreset,
      });
      assert.equal(p.getState().core.rngState, 0);
      const trace = [];
      const computers = new Set();
      while (p.getState().turnNumber < 9) {
        const before = p.getState();
        if (before.activePlayerId === 'player:1') humanStep(p);
        else {
          computers.add(before.activePlayerId);
          await p.adapter.runComputerTurn(
            before.activePlayerId,
            new AbortController().signal,
          );
        }
        const after = p.getState();
        assert.ok(
          after.economy.revision > before.economy.revision,
          'legal progress',
        );
        trace.push({
          turn: after.turnNumber,
          actor: after.activePlayerId,
          rng: after.core.rngState,
          dice: after.core.pendingDice,
          players: after.players,
          holdings: after.holdings,
          revision: after.economy.revision,
        });
      }
      assert.equal(computers.size, 3);
      return trace;
    };
    const first = await play();
    p.adapter.restart();
    assert.deepEqual(await play(), first);
  });

test('32 real tiles, legal quotes, presentation ack blocks finance and restart rejects stale choice', async () => {
  const p = createIntegratedPreview({ computerDelayMs: 0 });
  let update;
  const unsubscribe = p.adapter.subscribe((u) => {
    update = u;
  });
  start(p);
  assert.equal(p.adapter.getView().map.tiles.length, 32);
  const before = p.getState();
  humanStep(p);
  assert.equal(p.getState(), before);
  update.presentationComplete();
  await tick();
  humanStep(p);
  if (p.getState().core.pendingDice) {
    assert.ok(update.events.some((e) => e.type === 'dice-revealed'));
    assert.equal(update.movement, undefined);
    assert.match(update.view.activeSkill.statusLabel, /공개된 눈/);
    update.presentationComplete();
    await tick();
    humanStep(p);
  }
  assert.ok(update.events.some((e) => e.type === 'dice-rolled'));
  assert.equal(
    update.movement.path.length,
    update.events.find((e) => e.type === 'dice-rolled').distance,
  );
  const pending = update;
  const stale = p.adapter.getView().prompt;
  p.adapter.restart();
  pending.presentationComplete();
  update.presentationComplete();
  await tick();
  start(p);
  update.presentationComplete();
  await tick();
  const fresh = p.getState();
  if (stale) p.adapter.choose(stale.id, stale.choices[0].id);
  assert.equal(p.getState(), fresh);
  unsubscribe();
});

for (const seed of [1, 42, 2026])
  test(
    `real engine + human legal planner + AI3, seed ${seed}`,
    { timeout: 120000 },
    async () => {
      const p = createIntegratedPreview({ seed, computerDelayMs: 0 });
      start(p);
      const computers = new Set();
      let commands = 0,
        changed = false,
        abilities = false;
      while (
        p.getState().phase === 'playing' &&
        p.getState().turnNumber < 240
      ) {
        const before = p.getState();
        const actor = before.activePlayerId;
        if (actor === 'player:1') humanStep(p);
        else {
          computers.add(actor);
          await p.adapter.runComputerTurn(actor, new AbortController().signal);
        }
        commands += p.getState().economy.revision - before.economy.revision;
        assert.notEqual(
          p.getState().economy.revision,
          before.economy.revision,
          'progress',
        );
        changed ||= p.getState().holdings.length > 0;
        abilities ||= p.getState().abilityLedger.revision > 0;
        assert.ok(
          p
            .getState()
            .players.every(
              (n) =>
                !n.bankrupt ||
                (n.balance === 0 &&
                  !p.getState().holdings.some((h) => h.ownerId === n.id)),
            ),
        );
        await tick();
      }
      // Strategy changes can change the winning seed/turn. Require legal progress
      // through the horizon, and a recorded winner whenever the authority ends.
      if (p.getState().phase === 'finished') {
        assert.ok(p.getState().victory);
      } else {
        assert.ok(p.getState().turnNumber >= 240);
        assert.equal(p.getState().victory, null);
      }
      assert.equal(computers.size, 3);
      assert.ok(commands > 100);
      assert.ok(changed);
      assert.equal(abilities, false);
      assert.ok(
        p
          .getState()
          .players.some((n) => p.getState().skills.players[n.id].pp < 3),
      );
      console.log(
        JSON.stringify({
          seed,
          turns: p.getState().turnNumber,
          commands,
          holdings: p.getState().holdings.length,
          bankrupt: p.getState().players.filter((n) => n.bankrupt).length,
          victory: p.getState().victory,
        }),
      );
      const old = p.getState();
      const abort = new AbortController();
      abort.abort();
      await p.adapter.runComputerTurn(old.activePlayerId, abort.signal);
      assert.equal(p.getState(), old);
      p.adapter.restart();
      assert.equal(p.getState().abilityLedger.revision, 0);
    },
  );

test('diagnostic unsubscribe and synchronous reentry cannot release the visual ack', async () => {
  const p = createIntegratedPreview({ computerDelayMs: 0 });
  let visual;
  const releaseVisual = p.adapter.subscribe((u) => {
    visual = u;
    p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  });
  const diagnostic = p.adapter.subscribe(() => {});
  start(p);
  const before = p.getState();
  assert.equal(before.economy.revision, 0);
  diagnostic();
  await tick();
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  assert.equal(p.getState(), before);
  visual.presentationComplete();
  await tick();
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  assert.equal(p.getState().economy.revision, 1);
  releaseVisual();
});

test('AI waits on actual ack; abort and restart cancel old generation without duplicate money', async () => {
  const p = createIntegratedPreview({ computerDelayMs: 0 });
  let latest;
  const release = p.adapter.subscribe((u) => {
    latest = u;
  });
  start(p);
  latest.presentationComplete();
  await tick();
  for (let i = 0; i < 5 && p.getState().activePlayerId === 'player:1'; i++) {
    humanStep(p);
    latest.presentationComplete();
    await tick();
  }
  assert.equal(p.getState().activePlayerId, 'player:2');
  const abort = new AbortController();
  const run = p.adapter.runComputerTurn('player:2', abort.signal);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const held = p.getState();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(p.getState(), held);
  abort.abort();
  await run;
  latest.presentationComplete();
  await tick();
  p.adapter.restart();
  latest.presentationComplete();
  await tick();
  assert.equal(p.getState().economy.revision, 0);
  assert.equal(p.getState().abilityOutbox.length, 0);
  release();
});
