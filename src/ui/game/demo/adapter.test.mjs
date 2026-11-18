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
const { createDemoAdapter } = await import(
  moduleURL(source.replaceAll('../../../data/sample-map', sampleURL))
);

test('demo publishes authoritative actions, movement, prompts, results and restart', () => {
  const adapter = createDemoAdapter();
  const updates = [];
  const unsubscribe = adapter.subscribe((update) => updates.push(update));
  adapter.start([
    { name: 'A', pokemonId: 'pokemon:0001' },
    { name: 'B', pokemonId: 'pokemon:0004' },
  ]);
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
