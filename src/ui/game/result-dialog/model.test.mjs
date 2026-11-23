import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultRows, victoryLabels } from './model.ts';

const players = [0, 1, 2, 3].map((seat) => ({
  id: `player:${seat}`,
  name: `Trainer ${seat}`,
  pokemonId: 'pokemon:0001',
  balance: 100,
  bankrupt: seat === 3,
}));
const ranking = [1, 2, 0, 3].map((seat) => ({
  playerId: players[seat].id,
  seat,
  cash: 100,
  propertyCost: 200,
  total: 300,
  bankrupt: seat === 3,
}));
function view(reason, finalRanking = ranking) {
  return {
    state: {
      players,
      victory: { winnerId: players[0].id, reason },
      match: { finalRanking },
    },
    matchProgress: { assetRanking: ranking },
  };
}
test('every victory promotes actual winner and preserves authoritative other order and amounts', () => {
  for (const reason of Object.keys(victoryLabels)) {
    const input = view(reason);
    const before = JSON.stringify(input);
    const rows = resultRows(input);
    assert.deepEqual(
      rows.map((r) => r.player.id),
      [0, 1, 2, 3].map((i) => players[i].id),
    );
    assert.equal(rows[3].bankrupt, true);
    assert.ok(rows.every((row) => row.total === 300));
    assert.equal(JSON.stringify(input), before);
  }
});
test('finalRanking is authoritative over live asset projection, including tie order', () => {
  const input = view('round-limit-assets', [
    ranking[2],
    ranking[1],
    ranking[0],
    ranking[3],
  ]);
  assert.deepEqual(
    resultRows(input).map((r) => r.player.id),
    [0, 2, 1, 3].map((i) => players[i].id),
  );
});
test('instant victory without finalRanking reuses existing asset projection without mutation', () => {
  const input = view('one-side-cities', null);
  const before = JSON.stringify(input);
  assert.deepEqual(
    resultRows(input).map((r) => r.total),
    [300, 300, 300, 300],
  );
  assert.equal(JSON.stringify(input), before);
});
test('missing valuation never invents property values or uses cash as total', () => {
  const input = view('last-player-standing', null);
  delete input.matchProgress;
  assert.ok(resultRows(input).every((r) => r.total === null));
  assert.equal(resultRows(input).at(-1).bankrupt, true);
});
