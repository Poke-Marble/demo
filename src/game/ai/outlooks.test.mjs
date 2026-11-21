import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../core/index.ts';
import {
  facilities,
  createEconomyContext,
  initializeEconomy,
  getLegalActions,
  dispatchEconomy,
  quoteToll,
} from '../economy/index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import { createInitialRoster } from '../../ui/game/setup.ts';
import { publicSnapshot } from './outlooks.ts';
import { plan } from './planner.ts';

const context = createEconomyContext(kantoJohtoMap);
const roster = createInitialRoster('pokemon:0001').map((p) => ({
  ...p,
  controller: 'computer',
}));
const id = roster[0].id;
const rival = roster[1].id;
const fresh = () =>
  initializeEconomy(
    createGame(context.map, roster, { seed: 42, legendary: {} }),
    context,
    'outlooks',
  );
const snapshot = (s) => publicSnapshot(s, context, roster);
const side = context.map.tiles
  .filter((t) => t.kind === 'city' && t.side === 'south')
  .map((t) => t.id);
const target = side[0];
const hold = (s, ids, ownerId, stage = 0) => ({
  ...s,
  holdings: [
    ...s.holdings,
    ...ids.map((tileId) => ({ tileId, ownerId, facilityLevel: stage })),
  ],
  economy: {
    ...s.economy,
    developmentByTileId: {
      ...s.economy.developmentByTileId,
      ...Object.fromEntries(
        ids
          .filter((tileId) => context.properties[tileId].kind === 'city')
          .map((tileId) => [
            tileId,
            {
              stage,
              facilities: facilities.slice(0, stage),
              centerReadyVisitOrdinal: stage >= 2 ? 1 : null,
            },
          ]),
      ),
    },
  },
});
const fly = (s) => ({
  ...s,
  players: s.players.map((p) =>
    p.id === id
      ? {
          ...p,
          balance: 10000,
          position: context.map.tiles.find(
            (t) => t.kind === 'special' && t.special === 'fly',
          ).id,
        }
      : p,
  ),
  core: { ...s.core, turnStage: 'awaiting-end' },
  legendary: {
    ...s.legendary,
    pendingFly: { playerId: id, turn: s.turnNumber },
  },
});

test('next trial chance uses guarantee boundary and configured probability; no chance leaks to other actions', () => {
  for (const guaranteedAttempt of [1, 3, 5])
    for (let attempts = 0; attempts < guaranteedAttempt; attempts++) {
      let s = fresh();
      const tile = context.map.tiles.find(
        (t) => t.kind === 'special' && t.special === 'lugia-trial',
      );
      s = {
        ...s,
        turnNumber: 9,
        players: s.players.map((p) =>
          p.id === id ? { ...p, position: tile.id } : p,
        ),
        legendary: {
          ...s.legendary,
          rules: {
            ...s.legendary.rules,
            guaranteedAttempt,
            successChance: 0.17,
          },
          players: {
            ...s.legendary.players,
            [id]: {
              ...s.legendary.players[id],
              trial: {
                legendary: 'lugia',
                tileId: tile.id,
                attempts,
                lastAttemptTurn: attempts ? 8 : 0,
              },
            },
          },
        },
      };
      const snap = snapshot(s);
      assert.equal(
        snap.candidates.find((c) => c.kind === 'trial').outlook
          .trialSuccessProbability,
        attempts + 1 >= guaranteedAttempt ? 1 : 0.17,
      );
      assert.ok(
        snap.candidates.find((c) => c.kind === 'rope').outlook.ropeValue.value >
          0,
      );
      if (attempts + 1 === guaranteedAttempt)
        assert.equal(plan(snap, 42).candidate.kind, 'trial');
      const attempted = {
        ...s,
        core: { ...s.core, turnStage: 'awaiting-end' },
        legendary: {
          ...s.legendary,
          players: {
            ...s.legendary.players,
            [id]: {
              ...s.legendary.players[id],
              trial: {
                ...s.legendary.players[id].trial,
                attempts: Math.max(1, attempts),
                lastAttemptTurn: 9,
              },
            },
          },
        },
      };
      assert.ok(
        !snapshot(attempted).candidates.some((c) => c.kind === 'trial'),
      );
    }
  assert.equal(
    snapshot(fresh()).candidates.find((c) => c.kind === 'roll').outlook
      .trialSuccessProbability,
    undefined,
  );
});

test('public projection cannot read RNG, previous dice, or processed commands; it is pure and seed independent', () => {
  const s = fly(fresh());
  const expected = snapshot(s);
  const guarded = {
    ...s,
    core: {
      turnStage: s.core.turnStage,
      rules: s.core.rules,
      get rngState() {
        throw new Error('hidden RNG read');
      },
      get diceResult() {
        throw new Error('dice read');
      },
    },
    economy: {
      ...s.economy,
      get processedCommands() {
        throw new Error('receipt read');
      },
    },
  };
  assert.deepEqual(snapshot(guarded), expected);
  const before = JSON.stringify(s);
  assert.deepEqual(
    snapshot({ ...s, core: { ...s.core, rngState: 123456 } }),
    expected,
  );
  assert.equal(JSON.stringify(s), before);
});

test('flight chooses an affordable immediate side victory and executes original legal flight then purchase', () => {
  const s = fly(hold(fresh(), side.slice(1), id));
  const snap = snapshot(s);
  const chosen = plan(snap, 42).candidate;
  assert.equal(chosen.action.to, target);
  assert.equal(chosen.outlook.immediateWin, true);
  assert.deepEqual(
    snap.candidates.map((c) => c.action),
    getLegalActions(s, context, id).actions.map((a) => a.intent),
  );
  const landed = dispatchEconomy(s, context, {
    sessionId: s.economy.sessionId,
    commandId: 'flight',
    expectedRevision: 0,
    playerId: id,
    intent: chosen.action,
  });
  assert.ok(landed.ok);
  const purchase = plan(snapshot(landed.state), 42).candidate;
  assert.equal(purchase.targetId, target);
  assert.equal(purchase.outlook.immediateWin, true);
  const bought = dispatchEconomy(landed.state, context, {
    sessionId: s.economy.sessionId,
    commandId: 'purchase',
    expectedRevision: 1,
    playerId: id,
    intent: purchase.action,
  });
  assert.ok(bought.ok);
  assert.ok(
    bought.state.holdings.some((h) => h.tileId === target && h.ownerId === id),
  );
});

test('flight evaluates public affordable rival victory threat and tolls with blessing', () => {
  const s = fly(hold(fresh(), side.slice(1), rival));
  const chosen = plan(snapshot(s), 42).candidate;
  assert.equal(chosen.action.to, target);
  const empty = snapshot(fly(fresh())).candidates.find(
    (c) => c.action.to === target,
  );
  assert.ok(
    chosen.outlook.destinationValue.value >
      empty.outlook.destinationValue.value,
  );
  const unaffordable = {
    ...s,
    players: s.players.map((p) => (p.id === rival ? { ...p, balance: 0 } : p)),
  };
  assert.equal(
    snapshot(unaffordable).candidates.find((c) => c.action.to === target)
      .outlook.destinationValue.value,
    empty.outlook.destinationValue.value,
  );
  const occupied = side[1];
  const charged = snapshot(s).candidates.find((c) => c.action.to === occupied);
  assert.equal(
    charged.outlook.tollExposure.value,
    quoteToll(s, context, id, occupied).total,
  );
  const blessed = {
    ...s,
    legendary: {
      ...s.legendary,
      players: {
        ...s.legendary.players,
        [id]: { ...s.legendary.players[id], lugia: true },
      },
    },
  };
  assert.ok(
    snapshot(blessed).candidates.find((c) => c.action.to === occupied).outlook
      .tollExposure.value < charged.outlook.tollExposure.value,
  );
});

test('upgrades and revisit locks are quoted after flight; no unlocked stage is invented', () => {
  let s = fly(hold(fresh(), [target], id));
  s = {
    ...s,
    economy: {
      ...s.economy,
      completedLapsByPlayerId: {
        ...s.economy.completedLapsByPlayerId,
        [id]: 5,
      },
    },
  };
  const candidate = snapshot(s).candidates.find((c) => c.action.to === target);
  assert.ok(candidate.outlook.destinationValue.value > 0);
  const landing = dispatchEconomy(s, context, {
    sessionId: s.economy.sessionId,
    commandId: 'visit',
    expectedRevision: 0,
    playerId: id,
    intent: candidate.action,
  });
  assert.ok(landing.ok);
  const upgrades = snapshot(landing.state).candidates.filter(
    (c) => c.kind === 'build',
  );
  assert.ok(upgrades.length > 0);
  assert.ok(upgrades.every((c) => c.action.targetStage < 3));
  assert.ok(upgrades.every((c) => c.outlook.income.value >= 0));
});

test('authority immediate win beats reserve and arbitrarily large unrelated heuristic score', () => {
  const s = snapshot(fresh());
  const winning = {
    id: 'win',
    kind: 'buy',
    action: {},
    quote: { debit: s.cash, credit: 0 },
    outlook: { immediateWin: true },
  };
  const other = {
    ...winning,
    id: 'other',
    quote: { debit: 0, credit: 0 },
    outlook: { income: { value: 1e9, source: 'heuristic' } },
  };
  assert.equal(
    plan({ ...s, candidates: [other, winning] }, 42).candidate,
    winning,
  );
});

test('flight never treats emergency debt liquidation as a profitable destination', () => {
  let s = fly(fresh());
  s = {
    ...s,
    economy: {
      ...s.economy,
      visitOrdinalByPlayerId: {
        ...s.economy.visitOrdinalByPlayerId,
        [rival]: 1,
      },
    },
  };
  s = hold(s, [target], rival, 3);
  s = {
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, balance: 0 } : p)),
  };
  const snap = snapshot(s);
  const dangerous = snap.candidates.find((c) => c.action.to === target);
  assert.ok(dangerous.outlook.tollExposure.value > 0);
  assert.equal(dangerous.outlook.destinationValue.value, 0);
  assert.notEqual(plan(snap, 42).candidate.action.to, target);
});
