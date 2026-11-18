import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source)).replaceAll("'", '%27')}`;
const sampleURL = moduleURL(
  await readFile(
    new URL('../../../data/sample-map.ts', import.meta.url),
    'utf8',
  ),
);
const source = await readFile(new URL('./adapter.ts', import.meta.url), 'utf8');
const setupURL = moduleURL(
  await readFile(new URL('../setup.ts', import.meta.url), 'utf8'),
);
const { createInitialRoster } = await import(setupURL);
const { createDemoAdapter } = await import(
  moduleURL(
    source
      .replaceAll('../../../data/sample-map', sampleURL)
      .replaceAll('../setup', setupURL),
  )
);

test('demo publishes setup, three computer turns, prompts, movement, results and restart', async () => {
  const adapter = createDemoAdapter({ computerDelayMs: 0 });
  const updates = [];
  const unsubscribe = adapter.subscribe((update) => updates.push(update));
  adapter.start({
    mapId: adapter.getView().map.id,
    participants: createInitialRoster('pokemon:0025'),
  });
  assert.equal(adapter.getView().state.players.length, 4);
  assert.equal(adapter.getView().state.players[0].pokemonId, 'pokemon:0025');
  const playerId = adapter.getView().state.activePlayerId;
  for (const kind of ['purchase', 'upgrade', 'liquidate']) {
    adapter.dispatch({ type: 'roll-dice', playerId });
    const view = adapter.getView();
    assert.equal(view.prompt.kind, kind);
    assert.equal(view.actions.length, 0);
    const movement = updates.at(-1).movement;
    assert.equal(movement.path.at(-1), view.state.players[0].position);
    adapter.choose('stale-prompt-id', 'confirm');
    assert.equal(adapter.getView().prompt.id, view.prompt.id);
    adapter.choose(view.prompt.id, 'confirm');
    assert.equal(adapter.getView().prompt, undefined);
    adapter.dispatch({ type: 'end-turn', playerId });
    for (const computer of adapter.getView().participants.slice(1)) {
      assert.equal(adapter.getView().state.activePlayerId, computer.id);
      const before = adapter.getView().state;
      adapter.dispatch({ type: 'roll-dice', playerId: computer.id });
      assert.equal(
        adapter.getView().state,
        before,
        'human dispatch cannot control computer players',
      );
      await adapter.runComputerTurn(
        computer.id,
        new globalThis.AbortController().signal,
      );
    }
    assert.equal(adapter.getView().state.activePlayerId, playerId);
  }
  adapter.dispatch({ type: 'roll-dice', playerId });
  assert.equal(adapter.getView().state.phase, 'finished');
  assert.equal(adapter.getView().state.victory.winnerId, playerId);
  adapter.restart();
  assert.equal(adapter.getView().state.phase, 'setup');
  const count = updates.length;
  unsubscribe();
  adapter.restart();
  assert.equal(updates.length, count);
});

test('computer execution honours abort and rejects stale player IDs', async () => {
  const adapter = createDemoAdapter({ computerDelayMs: 0 });
  adapter.start({
    mapId: adapter.getView().map.id,
    participants: createInitialRoster('pokemon:0007'),
  });
  const human = adapter.getView().state.activePlayerId;
  adapter.dispatch({ type: 'roll-dice', playerId: human });
  adapter.choose(adapter.getView().prompt.id, 'skip');
  adapter.dispatch({ type: 'end-turn', playerId: human });
  const before = adapter.getView().state;
  await adapter.runComputerTurn(human, new globalThis.AbortController().signal);
  assert.equal(adapter.getView().state, before);
  const controller = new globalThis.AbortController();
  const pending = adapter.runComputerTurn(
    before.activePlayerId,
    controller.signal,
  );
  controller.abort();
  await pending;
  assert.equal(
    adapter.getView().state,
    before,
    'aborted execution must not move or end turn',
  );
});
