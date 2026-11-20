/* global AbortController, setImmediate, setTimeout, console */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegratedPreview } from './adapter.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import { createInitialRoster } from '../setup.ts';
import { plan } from '../../../game/ai/planner.ts';

const start = (p) =>
  p.adapter.start({
    mapId: kantoJohtoMap.id,
    participants: createInitialRoster('pokemon:0007'),
  });
const tick = () => new Promise((resolve) => setImmediate(resolve));
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
  assert.ok(update.events.some((e) => e.type === 'dice-rolled'));
  assert.equal(
    update.movement.path.length,
    update.events
      .find((e) => e.type === 'dice-rolled')
      .values.reduce((a, b) => a + b, 0),
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
      if (seed === 1) {
        assert.equal(p.getState().phase, 'finished');
        assert.ok(p.getState().victory);
      }
      assert.equal(computers.size, 3);
      assert.ok(commands > 100);
      assert.ok(changed);
      assert.ok(abilities);
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
