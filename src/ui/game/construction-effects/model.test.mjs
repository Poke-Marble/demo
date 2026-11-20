/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'vite';

// A single virtual module keeps test imports self-contained, no disk bundle.
const combined = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: 'src/ui/game/construction-effects/fixture.ts',
      formats: ['es'],
    },
  },
});
const output = (Array.isArray(combined) ? combined[0] : combined).output.find(
  (x) => x.type === 'chunk',
).code;
const {
  constructionCues,
  createConstructionGate,
  constructionFixture,
  committedFinalFixture,
} = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
);

test('confirmed acquisition + city final merge; owner pokemon, actual level and development are authoritative', () => {
  for (const [id, type] of [
    ['0001', 'grass'],
    ['0004', 'fire'],
    ['0007', 'water'],
    ['0025', 'electric'],
  ]) {
    const { before, update } = constructionFixture(`pokemon:${id}`);
    const cues = constructionCues(before, update);
    assert.equal(cues.length, 1);
    assert.equal(cues[0].kind, 'final');
    assert.equal(cues[0].type, type);
    assert.match(cues[0].facilityName, /등대/);
    assert.match(cues[0].defense, /인수 불가/);
    const mismatch = structuredClone(update);
    mismatch.view.state.economy.developmentByTileId[cues[0].tileId].stage = 2;
    assert.equal(constructionCues(before, mismatch)[0].kind, 'purchase');
    const noFinal = structuredClone(update);
    noFinal.view.state.economy.developmentByTileId[cues[0].tileId].facilities =
      ['shop', 'center'];
    assert.notEqual(constructionCues(before, noFinal)[0].kind, 'final');
  }
});
test('purchase, takeover, build and tourist landmark remain distinct; no seat type inference', () => {
  const { before, update } = constructionFixture('pokemon:0007', 2);
  assert.equal(constructionCues(before, update)[0].kind, 'purchase');
  const owned = structuredClone(before);
  owned.state.holdings = [
    { ...update.view.state.holdings[0], facilityLevel: 1 },
  ];
  assert.equal(constructionCues(owned, update)[0].kind, 'build');
  owned.state.holdings[0].ownerId = 'player:other';
  assert.equal(constructionCues(owned, update)[0].kind, 'takeover');
  const tourist = constructionFixture('pokemon:0025', 0, true);
  assert.equal(
    constructionCues(tourist.before, tourist.update)[0].kind,
    'purchase',
  );
  update.view.state.players[0].pokemonId = 'pokemon:9999';
  assert.deepEqual(constructionCues(before, update), []);
});
test('load, estimate, failed/skip/no-event, stale levels, repeated update and original command redelivery do not replay', () => {
  const { before, update } = constructionFixture();
  const gate = createConstructionGate();
  assert.deepEqual(gate.accept(before, { ...update, id: undefined }), []);
  assert.deepEqual(
    gate.accept(before, { ...update, id: 'load', events: [] }),
    [],
  );
  assert.equal(gate.accept(before, update).length, 1);
  assert.deepEqual(gate.accept(before, structuredClone(update)), []);
  assert.deepEqual(
    gate.accept(before, { ...update, id: 'redelivered-command' }),
    [],
  );
  assert.deepEqual(
    constructionCues(update.view, { ...update, id: 'rerender' }),
    [],
  );
  const stale = structuredClone(update);
  stale.events = [
    {
      type: 'facility-upgraded',
      tileId: stale.view.state.holdings[0].tileId,
      level: 2,
    },
  ];
  assert.deepEqual(constructionCues(before, stale), []);
  gate.reset();
  assert.equal(gate.accept(before, update).length, 1);
});
test('defense is explained only for matching existing economy profile', () => {
  const { before, update } = constructionFixture();
  update.view.state.economy.profileVersion = 'unknown';
  assert.equal(constructionCues(before, update)[0].defense, '최종 단계 완성');
});

test('actual economy final commit classifies once and original command replay emits no events', () => {
  const { before, update, replay } = committedFinalFixture();
  assert.equal(update.events[0].type, 'facility-upgraded');
  assert.equal(constructionCues(before, update)[0].kind, 'final');
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.events, []);
});
