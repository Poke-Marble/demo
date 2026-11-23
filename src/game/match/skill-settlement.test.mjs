import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from '../core/index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import {
  createEconomyContext,
  economyProfileForPreset,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
  quoteToll,
} from '../economy/index.ts';
import { finalizeMatch, matchProgress, rankAssets } from './index.ts';

const context = createEconomyContext(
  kantoJohtoMap,
  economyProfileForPreset('quick'),
);
const map = context.map;
const roster = ['0001', '0004', '0007', '0025'].map((n, i) => ({
  id: `player:${i}`,
  name: `P${i}`,
  pokemonId: `pokemon:${n}`,
}));
const fresh = () =>
  initializeEconomy(
    createGame(map, roster, {
      seed: 42,
      skills: true,
      legendary: {},
      rulesPreset: 'quick',
    }),
    context,
    'combined-settlement',
  );
const envelope = (s, intent) => ({
  sessionId: s.economy.sessionId,
  commandId: `combined:${s.economy.revision}`,
  expectedRevision: s.economy.revision,
  playerId: s.activePlayerId,
  intent,
});
function act(s, intent) {
  const result = dispatchEconomy(s, context, envelope(s, intent));
  assert.equal(result.ok, true, result.error?.message);
  return result.state;
}
// Synthetic expiration boundary; movement/payment below use real dispatcher commands.
const atLimit = (s) => ({
  ...s,
  match: { ...s.match, completedRounds: s.match.roundLimit },
});
function deferred(s) {
  const result = finalizeMatch(s, context);
  assert.equal(result.state, s);
  assert.deepEqual(result.events, []);
  const progress = matchProgress(s, context);
  assert.equal(progress.settlementPending, true);
  assert.equal(progress.assetRanking, null);
  assert.throws(() => rankAssets(s, context), /pending/);
}

test('revealed dice cannot end a basic turn, advance a round, or publish final assets', () => {
  const before = fresh();
  const revealed = {
    ...before,
    core: { ...before.core, pendingDice: { values: [3, 4] } },
  };
  assert.ok(revealed.core.pendingDice);
  assert.deepEqual(revealed.match, before.match);
  const ended = dispatch(revealed, map, {
    type: 'end-turn',
    playerId: revealed.activePlayerId,
  });
  assert.equal(ended.ok, false);
  assert.deepEqual(revealed.match, before.match);
  deferred(atLimit(revealed));
});

test('unpaid mandatory toll defers victory/ranking until exactly-once payment', () => {
  const tileId = 'tile:kj:blackthorn';
  const before = fresh();
  const index = map.tiles.findIndex((t) => t.id === tileId);
  const positioned = {
    ...before,
    players: before.players.map((p, i) =>
      i
        ? p
        : {
            ...p,
            position:
              map.tiles[(index - 7 + map.tiles.length) % map.tiles.length].id,
          },
    ),
    holdings: [{ tileId, ownerId: roster[1].id, facilityLevel: 1 }],
    economy: {
      ...before.economy,
      developmentByTileId: {
        [tileId]: {
          stage: 1,
          facilities: ['shop'],
          centerReadyVisitOrdinal: null,
        },
      },
    },
  };
  const water = {
    ...positioned,
    players: positioned.players.map((p, i) =>
      i ? p : { ...p, pokemonId: 'pokemon:0007' },
    ),
  };
  const landed = act(water, {
    type: 'roll-dice',
    playerId: before.activePlayerId,
  });
  assert.ok(landed.economy.pendingToll);
  assert.equal(landed.players[0].balance, before.players[0].balance);
  assert.equal(landed.skills.players[before.activePlayerId].pp, 3);
  const pending = atLimit(landed);
  deferred(pending);
  const illegal = dispatchEconomy(
    pending,
    context,
    envelope(pending, { type: 'end-turn', playerId: pending.activePlayerId }),
  );
  assert.equal(illegal.ok, false);
  const quote = quoteToll(pending, context, pending.activePlayerId, tileId);
  assert.ok(quote.total > 0);
  const pay = getLegalActions(
    pending,
    context,
    pending.activePlayerId,
  ).actions.find((a) => a.intent.type === 'pay-toll');
  assert.ok(pay);
  const command = envelope(pending, pay.intent);
  const payment = dispatchEconomy(pending, context, command);
  assert.equal(payment.ok, true, JSON.stringify(payment.error));
  assert.equal(payment.state.economy.pendingToll, null);
  assert.equal(
    payment.state.players[0].balance,
    before.players[0].balance - quote.total,
  );
  assert.equal(
    payment.state.players[1].balance,
    before.players[1].balance + quote.total,
  );
  const replay = dispatchEconomy(payment.state, context, command);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.state.players, payment.state.players);
  const final = finalizeMatch(payment.state, context);
  assert.equal(final.state.victory.reason, 'round-limit-assets');
  assert.equal(
    final.state.match.finalRanking.find((p) => p.playerId === roster[0].id)
      .cash,
    before.players[0].balance - quote.total,
  );
  assert.equal(matchProgress(final.state, context).settlementPending, false);
});
