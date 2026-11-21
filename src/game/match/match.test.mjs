import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from '../core/index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  propertyCapital,
  validateEconomyState,
} from '../economy/index.ts';
import { finalizeMatch, rankAssets, roundStatus } from './index.ts';
import { evaluateVictory, defaultVictoryConfig } from '../victory/index.ts';
const c = createEconomyContext(kantoJohtoMap),
  map = c.map;
const roster = Array.from({ length: 4 }, (_, i) => ({
  id: `player:${i}`,
  name: `P${i}`,
  pokemonId: 'pokemon:0001',
}));
const fresh = (preset = 'standard') =>
  initializeEconomy(
    createGame(map, roster, { rulesPreset: preset, legendary: {} }),
    c,
    'test',
  );
const end = (s) =>
  dispatch({ ...s, core: { ...s.core, turnStage: 'awaiting-end' } }, map, {
    type: 'end-turn',
    playerId: s.activePlayerId,
  });
const expired = (s) => ({
  ...s,
  match: { ...s.match, completedRounds: s.match.roundLimit },
});

for (const [preset, limit] of [
  ['standard', 30],
  ['quick', 20],
])
  test(`${preset}: exact final basic turn, no premature finish, one event only`, () => {
    let s = fresh(preset);
    for (let i = 0; i < limit * 4; i++) {
      const next = end(s);
      assert.equal(next.ok, true);
      s = next.state;
      assert.equal(s.match.completedRounds, Math.floor((i + 1) / 4));
      const final = finalizeMatch(s, c);
      assert.equal(
        final.state.phase,
        i === limit * 4 - 1 ? 'finished' : 'playing',
      );
      s = final.state;
    }
    assert.equal(s.victory.reason, 'round-limit-assets');
    assert.equal(s.victory.winnerId, roster[0].id);
    assert.equal(s.match.completedBasicTurnsByPlayerId[roster[0].id], limit);
    assert.match(roundStatus(s), /남은 0 ROUND/);
    assert.equal(finalizeMatch(s, c).state, s);
    assert.deepEqual(finalizeMatch(s, c).events, []);
  });

test('bankrupt leading/trailing seats skip without shortening cycles; rolls never increment rounds or basic turns', () => {
  let s = fresh();
  s = {
    ...s,
    activePlayerId: roster[1].id,
    players: s.players.map((p, i) =>
      i === 0 || i === 3 ? { ...p, balance: 0, bankrupt: true } : p,
    ),
  };
  let rolled = dispatch(s, map, {
    type: 'roll-dice',
    playerId: s.activePlayerId,
  });
  assert.equal(rolled.ok, true);
  assert.deepEqual(rolled.state.match, s.match);
  s = end(s).state;
  assert.equal(s.match.completedRounds, 0);
  s = end(s).state;
  assert.equal(s.match.completedRounds, 1);
  assert.equal(s.match.completedBasicTurnsByPlayerId[roster[0].id], 0);
  assert.equal(s.match.completedBasicTurnsByPlayerId[roster[1].id], 1);
});

test('failed trial stay is a full basic turn while attempt consumes no round', () => {
  let s = fresh();
  const tile = map.tiles.find(
    (t) => t.kind === 'special' && t.special === 'lugia-trial',
  );
  s = {
    ...s,
    players: s.players.map((p, i) => (i ? p : { ...p, position: tile.id })),
    legendary: {
      ...s.legendary,
      rules: { ...s.legendary.rules, successChance: 0 },
      players: {
        ...s.legendary.players,
        [roster[0].id]: {
          ...s.legendary.players[roster[0].id],
          trial: {
            legendary: 'lugia',
            tileId: tile.id,
            attempts: 0,
            lastAttemptTurn: 0,
          },
        },
      },
    },
  };
  const attempt = dispatch(s, map, {
    type: 'attempt-trial',
    playerId: s.activePlayerId,
  });
  assert.equal(attempt.ok, true);
  assert.deepEqual(attempt.state.match, s.match);
  s = dispatch(attempt.state, map, {
    type: 'end-turn',
    playerId: s.activePlayerId,
  }).state;
  assert.equal(s.match.completedBasicTurnsByPlayerId[roster[0].id], 1);
  assert.ok(s.legendary.players[roster[0].id].trial);
});

test('full capital valuation, cash tie breaker then original seat, bankrupt ranks last', () => {
  let s = fresh();
  const tile = map.tiles.find((t) => t.kind === 'city').id;
  s = {
    ...s,
    holdings: [{ tileId: tile, ownerId: roster[1].id, facilityLevel: 3 }],
    economy: {
      ...s.economy,
      developmentByTileId: {
        [tile]: {
          stage: 3,
          facilities: ['shop', 'center', 'final'],
          centerReadyVisitOrdinal: 0,
        },
      },
    },
  };
  const capital = propertyCapital(s, c, tile);
  s = {
    ...s,
    players: s.players.map((p, i) => ({
      ...p,
      balance: i === 1 ? 100 : i === 3 ? 0 : 100 + capital,
      bankrupt: i === 3,
    })),
  };
  const ranked = rankAssets(s, c);
  assert.deepEqual(
    ranked.map((p) => p.seat),
    [0, 2, 1, 3],
  );
  assert.equal(ranked[2].propertyCost, capital);
  assert.equal(ranked[2].total, 100 + capital);
});

test('pending debt defers all judgment; immediate monopoly and last survivor override expiration', () => {
  let s = expired(fresh());
  // The finalization boundary defers to the economy validator for genuine debt invariants.
  const tile = map.tiles.find((t) => t.kind === 'city').id;
  const debtor = roster[0].id,
    creditor = roster[1].id;
  s = {
    ...s,
    core: { ...s.core, turnStage: 'awaiting-end' },
    holdings: [{ tileId: tile, ownerId: creditor, facilityLevel: 0 }],
    players: s.players.map((p) =>
      p.id === debtor ? { ...p, position: tile, balance: 0 } : p,
    ),
    economy: {
      ...s.economy,
      developmentByTileId: {
        [tile]: { stage: 0, facilities: [], centerReadyVisitOrdinal: null },
      },
      visitOrdinalByPlayerId: {
        ...s.economy.visitOrdinalByPlayerId,
        [debtor]: 1,
      },
      landing: {
        id: 'land',
        playerId: debtor,
        tileId: tile,
        visitOrdinal: 1,
        propertyDecisionUsed: false,
      },
      pendingDebt: {
        id: 'debt',
        landingId: 'land',
        debtorId: debtor,
        creditorId: creditor,
        tileId: tile,
        gross: 100,
        amount: 100,
        consumesBlessing: false,
      },
    },
  };
  s.economy.pendingDebt.gross = c.properties[tile].tolls[0];
  s.economy.pendingDebt.amount = c.properties[tile].tolls[0];
  assert.equal(finalizeMatch(s, c).state, s);
  assert.throws(() => rankAssets(s, c), /Settle debt/);
  let survivor = expired(fresh());
  survivor = {
    ...survivor,
    players: survivor.players.map((p, i) =>
      i ? { ...p, bankrupt: true, balance: 0 } : p,
    ),
  };
  assert.equal(
    finalizeMatch(survivor, c).state.victory.reason,
    'last-player-standing',
  );
  let monopoly = expired(fresh());
  monopoly = {
    ...monopoly,
    holdings: map.tiles
      .filter((t) => t.kind === 'landmark')
      .map((t) => ({ tileId: t.id, ownerId: roster[2].id, facilityLevel: 0 })),
  };
  assert.equal(
    finalizeMatch(monopoly, c).state.victory.reason,
    'four-landmarks',
  );
});

test('four/five-reason configs remain compatible and malformed counters reject atomically', () => {
  const s = fresh();
  for (const config of [
    defaultVictoryConfig,
    {
      ...defaultVictoryConfig,
      reasonPriority: [
        'round-limit-assets',
        ...defaultVictoryConfig.reasonPriority,
      ],
    },
  ])
    assert.equal(evaluateVictory(s, map, { config }).ok, true);
  for (const n of [-1, 0.5, 31, NaN]) {
    const bad = { ...s, match: { ...s.match, completedRounds: n } };
    const rejected = dispatch(bad, map, {
      type: 'roll-dice',
      playerId: s.activePlayerId,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.state, bad);
    assert.throws(() => validateEconomyState(bad, c));
  }
  const finished = finalizeMatch(expired(s), c).state;
  const result = dispatchEconomy(finished, c, {
    sessionId: 'test',
    commandId: 'late',
    expectedRevision: 0,
    playerId: s.activePlayerId,
    intent: { type: 'roll-dice', playerId: s.activePlayerId },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, finished);
});
