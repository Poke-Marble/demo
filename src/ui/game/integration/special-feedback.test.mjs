/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../../game/core/index.ts';
import {
  createEconomyContext,
  initializeEconomy,
} from '../../../game/economy/index.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import { createInitialRoster } from '../setup.ts';
import { specialFeedback, specialHudMeta } from './special-feedback.ts';

// Contract units only. Synthetic outcomes below are not real-game evidence.
const context = createEconomyContext(kantoJohtoMap);
const fresh = () =>
  initializeEconomy(
    createGame(context.map, createInitialRoster('pokemon:0007'), {
      seed: 1,
      legendary: {},
    }),
    context,
    'unit',
  );
const withPlayer = (state, patch) => ({
  ...state,
  legendary: {
    ...state.legendary,
    players: {
      ...state.legendary.players,
      'player:1': { ...state.legendary.players['player:1'], ...patch },
    },
  },
});
const result = (state, events = [], patch = {}) => ({
  ok: true,
  state,
  events,
  replayed: false,
  presentations: [],
  receipt: {
    sessionId: 'unit',
    commandId: 'c1',
    playerId: 'player:1',
    quote: null,
    intentType: 'attempt-trial',
    ...patch,
  },
});

test('compact HUD omits empty statuses, keeps zero ropes and exposes core trial counters', () => {
  const state = fresh();
  assert.equal(specialHudMeta(state)['player:1'].blessing, undefined);
  assert.equal(specialHudMeta(state)['player:1'].trialStay, undefined);
  const waiting = withPlayer(state, {
    ropes: 0,
    trial: {
      legendary: 'lugia',
      tileId: 'tile:trial',
      attempts: 2,
      lastAttemptTurn: 1,
    },
  });
  const meta = specialHudMeta(waiting)['player:1'];
  assert.equal(meta.ropes, '0개');
  assert.match(meta.trialStay, /루기아 · 실패 대기 · 2\/3회/);
  assert.match(meta.trialDetails, /재도전 1회 · 다음 3회차 · 3회차 성공 보장/);
  const nextTurn = { ...waiting, turnNumber: 5 };
  assert.match(specialHudMeta(nextTurn)['player:1'].trialStay, /재도전/);
  assert.match(
    specialHudMeta({ ...nextTurn, activePlayerId: 'player:2' })['player:1']
      .trialStay,
    /실패 대기/,
  );
  assert.deepEqual(specialHudMeta({ ...state, legendary: undefined }), {});
});

test('trial and rope events survive projection without changing outcomes; IDs are repeatable', () => {
  const before = fresh();
  const after = withPlayer(before, { lugia: true, ropes: 0 });
  for (const event of [
    {
      type: 'trial-resolved',
      playerId: 'player:1',
      legendary: 'lugia',
      attempt: 3,
      success: true,
    },
    {
      type: 'trial-resolved',
      playerId: 'player:1',
      legendary: 'lugia',
      attempt: 2,
      success: false,
    },
    { type: 'rope-used', playerId: 'player:1' },
  ]) {
    const receipt = result(after, [event]);
    const projected = specialFeedback(before, receipt);
    assert.equal(projected.specialEvents[0], event);
    assert.deepEqual(
      specialFeedback(before, structuredClone(receipt)),
      projected,
    );
    assert.match(
      projected.results[0].text,
      event.type === 'rope-used'
        ? /남은 로프 0개.*주사위/
        : event.success
          ? /3회차 성공 \(보장\).*가호 보유/
          : /실패.*3회차 재도전.*3회차 성공 보장/,
    );
    assert.deepEqual(specialFeedback(before, { ...receipt, replayed: true }), {
      specialEvents: [],
      results: [],
    });
  }
});

test('blessing consumption requires committed inventory change and exact charge evidence', () => {
  const before = withPlayer(fresh(), { hoOh: true, lugia: true });
  const quote = { consumesBlessing: true, gross: 375, total: 313 };
  const after = withPlayer(before, { hoOh: false });
  assert.equal(
    specialFeedback(before, result(before, [], { quote })).results.length,
    0,
  );
  assert.equal(specialFeedback(before, result(after)).results.length, 0);
  assert.match(
    specialFeedback(before, result(after, [], { quote })).results[0].text,
    /칠색조.*375 → 313 ₽.*잔여 없음/,
  );
  const toll = {
    type: 'toll-settled',
    debtorId: 'player:1',
    amount: 40,
    recovered: 30,
    forgiven: 10,
  };
  assert.match(
    specialFeedback(
      before,
      result(withPlayer(before, { lugia: false }), [toll]),
    ).results[0].text,
    /루기아.*통행료 40 ₽.*지불 30 ₽.*미회수 10 ₽/,
  );
});

test('flight arrival summarizes actual economy landing settlement or pending debt', () => {
  const state = fresh();
  const landed = {
    type: 'tile-landed',
    playerId: 'player:1',
    tileId: 'tile:city',
  };
  const toll = {
    type: 'toll-settled',
    debtorId: 'player:1',
    amount: 80,
    recovered: 80,
    forgiven: 0,
  };
  assert.match(
    specialFeedback(state, result(state, [landed, toll], { intentType: 'fly' }))
      .results[0].text,
    /비행 도착 · 통행료 80 ₽ 정산/,
  );
  assert.match(
    specialFeedback(
      state,
      result(state, [landed, { type: 'debt-opened', debt: { amount: 80 } }], {
        intentType: 'fly',
      }),
    ).results[0].text,
    /미납 80 ₽/,
  );
});
