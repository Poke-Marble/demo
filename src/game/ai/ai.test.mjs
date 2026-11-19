import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers';
import { plan, rankCandidates } from './planner.ts';
import { createExecutor, shouldBlockHumanInput } from './executor.ts';
import { runSimulation } from './harness.ts';

const estimate = (value) => ({ value, source: 'heuristic' });
const c = (id, kind = id, debit = 0, credit = 0, extra = {}) => ({
  id,
  kind,
  quote: { debit, credit },
  action: Object.freeze({ id }),
  ...extra,
});
const snapshot = (changes = {}) => ({
  session: 's1',
  turn: 't1',
  revision: 'r1',
  phase: 'playing',
  activePlayerId: 'cpu1',
  players: [
    { id: 'human', controller: 'human', bankrupt: false },
    ...['cpu1', 'cpu2', 'cpu3'].map((id) => ({
      id,
      controller: 'computer',
      bankrupt: false,
    })),
  ],
  cash: 1000,
  debt: 0,
  expectedToll: estimate(100),
  properties: [],
  collections: [],
  candidates: [c('end-turn')],
  ...changes,
});
const choose = (s) => plan(s, 42)?.candidate.id;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const fixture = (extra = {}, options = {}) => {
  let s = snapshot();
  const commands = [];
  const host = {
    read: () => s,
    dispatch: async (command) => {
      commands.push(command);
      s = { ...s, revision: s.revision + '+', turn: 't2' };
      return { accepted: true };
    },
    awaitPresentation: async () => {},
    ...extra,
  };
  return {
    executor: createExecutor(host, { seed: 42, ...options }),
    commands,
    host,
    set: (value) => {
      s = value;
    },
    get: () => s,
  };
};

test('investment respects exact quote, toll safety and reserve; pass instead of illegal fabrication', () => {
  const candidates = [c('buy', 'buy', 851), c('pass')];
  assert.equal(choose(snapshot({ candidates })), 'pass');
  assert.equal(
    choose(
      snapshot({
        candidates: [
          c('buy', 'buy', 100, 0, { outlook: { income: estimate(80) } }),
          c('pass'),
        ],
      }),
    ),
    'buy',
  );
  assert.equal(
    choose(
      snapshot({
        candidates: [c('buy', 'buy', 500), c('pass')],
        expectedToll: estimate(400),
      }),
    ),
    'pass',
  );
  assert.equal(choose(snapshot({ candidates: [] })), undefined);
});

test('build, takeover, income and supplied immediate rival defense affect decisions', () => {
  const buy = c('buy', 'buy', 100, 0, { outlook: { income: estimate(80) } });
  const build = c('build', 'build', 100, 0, {
    outlook: { income: estimate(120) },
  });
  const takeover = c('takeover', 'takeover', 200, 0, {
    outlook: { blocksImmediateMonopoly: true },
  });
  assert.equal(choose(snapshot({ candidates: [buy, build] })), 'build');
  assert.equal(
    choose(snapshot({ candidates: [buy, build, takeover] })),
    'takeover',
  );
});

for (const kind of ['group', 'line', 'four-landmarks']) {
  test(`${kind}: completing a public set beats unrelated acquisition and protects liquidation`, () => {
    const ids = kind === 'four-landmarks' ? ['a', 'b', 'c', 'd'] : ['a', 'b'];
    const properties = ids.map((id) => ({
      id,
      ownerId: id === 'a' ? null : 'cpu1',
    }));
    const collections = [{ id: 'set', kind, propertyIds: ids }];
    const completing = c('complete', 'buy', 100, 0, { targetId: 'a' });
    const other = c('other', 'buy', 100, 0, { targetId: 'z' });
    assert.equal(
      choose(
        snapshot({ properties, collections, candidates: [other, completing] }),
      ),
      'complete',
    );
    const owned = properties.map((p) => ({ ...p, ownerId: 'cpu1' }));
    assert.equal(
      choose(
        snapshot({
          cash: 0,
          debt: 100,
          properties: owned,
          collections,
          candidates: [
            c('break', 'sell', 0, 100, { targetId: 'a' }),
            c('spare', 'sell', 0, 100, { targetId: 'z' }),
          ],
        }),
      ),
      'spare',
    );
  });
}

test('debt pays first, otherwise liquidates with minimal loss before bankruptcy', () => {
  assert.equal(
    choose(
      snapshot({
        debt: 1200,
        candidates: [
          c('end-turn'),
          c('buy', 'buy'),
          c('bankrupt'),
          c('sell', 'sell', 0, 300),
        ],
      }),
    ),
    'sell',
  );
  assert.equal(
    choose(
      snapshot({
        debt: 100,
        candidates: [c('sell', 'sell', 0, 300), c('pay-debt', 'pay-debt', 100)],
      }),
    ),
    'pay-debt',
  );
  assert.equal(
    choose(snapshot({ debt: 1200, candidates: [c('bankrupt')] })),
    'bankrupt',
  );
  assert.equal(
    choose(
      snapshot({ candidates: [c('sell', 'sell', 0, 300), c('end-turn')] }),
    ),
    'end-turn',
  );
});

test('trial versus rope uses supplied chance and explicit opportunity costs', () => {
  const trial = c('trial', 'trial', 0, 0, {
    outlook: { trialSuccessProbability: 0.5 },
  });
  assert.equal(choose(snapshot({ candidates: [trial, c('rope')] })), 'trial');
  assert.equal(
    choose(
      snapshot({
        candidates: [
          {
            ...trial,
            outlook: {
              trialSuccessProbability: 0.1,
              lostTurnCost: estimate(400),
            },
          },
          c('rope'),
        ],
      }),
    ),
    'rope',
  );
});

test('flight evaluates supplied toll risk against destination utility', () => {
  assert.equal(
    choose(
      snapshot({
        candidates: [
          c('risky', 'fly', 0, 0, {
            outlook: {
              destinationValue: estimate(500),
              tollExposure: estimate(600),
            },
          }),
          c('safe', 'fly', 0, 0, {
            outlook: { destinationValue: estimate(50) },
          }),
        ],
      }),
    ),
    'safe',
  );
});

test('seed and stable IDs reproduce ties irrespective of candidate order; inputs remain immutable', () => {
  const candidates = Array.from({ length: 20 }, (_, i) => c(String(i), 'fly'));
  const s = snapshot({ candidates });
  const before = JSON.stringify(s);
  const a = rankCandidates(s, 42);
  assert.deepEqual(
    a.map((x) => x.candidate.id),
    rankCandidates({ ...s, candidates: [...candidates].reverse() }, 42).map(
      (x) => x.candidate.id,
    ),
  );
  assert.notDeepEqual(
    a.map((x) => x.candidate.id),
    rankCandidates(s, 43).map((x) => x.candidate.id),
  );
  assert.equal(JSON.stringify(s), before);
  assert.ok(candidates.includes(a[0].candidate));
  assert.equal(
    a[0].candidate.action,
    candidates.find((x) => x.id === a[0].candidate.id).action,
  );
  assert.deepEqual(a, rankCandidates({ ...s, diceResult: [6, 6] }, 42));
});

test('invalid numerical projections fail closed; human/bankrupt/finished players do not plan', () => {
  for (const bad of [NaN, Infinity, -1]) {
    assert.throws(
      () => choose(snapshot({ candidates: [c('buy', 'buy', bad)] })),
      RangeError,
    );
    assert.throws(
      () => choose(snapshot({ expectedToll: estimate(bad) })),
      RangeError,
    );
  }
  assert.throws(
    () =>
      choose(
        snapshot({
          candidates: [
            c('trial', 'trial', 0, 0, {
              outlook: { trialSuccessProbability: 2 },
            }),
          ],
        }),
      ),
    RangeError,
  );
  assert.throws(
    () => choose(snapshot({ candidates: [c('x'), c('x')] })),
    RangeError,
  );
  assert.equal(choose(snapshot({ activePlayerId: 'human' })), undefined);
  assert.equal(choose(snapshot({ phase: 'finished' })), undefined);
  assert.equal(
    choose(
      snapshot({
        players: [{ id: 'cpu1', controller: 'computer', bankrupt: true }],
      }),
    ),
    undefined,
  );
});

test('executor waits for initial and post-action presentation, preventing next action under UI lock', async () => {
  const initial = deferred();
  const after = deferred();
  let count = 0;
  const f = fixture({
    awaitPresentation: async ({ receipt }) => {
      count++;
      await (receipt ? after.promise : initial.promise);
    },
  });
  const running = f.executor.run();
  await tick();
  assert.equal(f.commands.length, 0);
  initial.resolve();
  await tick();
  assert.equal(f.commands.length, 1);
  assert.equal(f.executor.busy, true);
  after.resolve();
  assert.equal((await running).reason, 'turn-changed');
  assert.equal(count, 2);
  assert.equal(f.executor.busy, false);
});

test('duplicate simultaneous runs are refused and commands include revision/session tokens', async () => {
  const gate = deferred();
  const f = fixture({ delay: () => gate.promise });
  const first = f.executor.run();
  assert.equal((await f.executor.run()).reason, 'busy');
  gate.resolve();
  await first;
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].revision, 'r1');
  assert.equal(f.commands[0].session, 's1');
});

for (const [change, expected] of [
  [{ session: 'new' }, 'session-changed'],
  [{ turn: 'new' }, 'turn-changed'],
  [{ activePlayerId: 'cpu2' }, 'turn-changed'],
  [{ phase: 'finished' }, 'finished'],
]) {
  test(`executor stops on ${expected} after async wait`, async () => {
    const gate = deferred();
    const f = fixture({ delay: () => gate.promise });
    const running = f.executor.run();
    await tick();
    f.set({ ...f.get(), ...change });
    gate.resolve();
    assert.equal((await running).reason, expected);
    assert.equal(f.commands.length, 0);
  });
}

test('abort terminates the run and keeps busy while an uncooperative callback remains', async () => {
  const gate = deferred();
  const f = fixture({ delay: () => gate.promise });
  const controller = new globalThis.AbortController();
  const running = f.executor.run(controller.signal);
  await tick();
  controller.abort();
  assert.equal((await running).reason, 'aborted');
  assert.equal(f.executor.busy, true);
  assert.equal((await f.executor.run()).reason, 'busy');
  gate.resolve();
  await tick();
  assert.equal(f.executor.busy, false);
  assert.equal(f.commands.length, 0);
});

test('dispatch failure is recoverable from new authority revision without repeating uncertain command', async () => {
  let fail = true;
  let calls = 0;
  const f = fixture({
    dispatch: async () => {
      calls++;
      if (fail) throw new Error('network outcome unknown');
      f.set({ ...f.get(), turn: 't2' });
      return { accepted: true };
    },
  });
  assert.equal((await f.executor.run()).reason, 'failed');
  assert.equal((await f.executor.run()).reason, 'duplicate');
  assert.equal(calls, 1);
  f.set({ ...f.get(), revision: 'reconciled' });
  fail = false;
  assert.equal((await f.executor.run()).reason, 'turn-changed');
  assert.equal(calls, 2);
});

test('timeout is bounded and late rejection cannot dispatch another action', async () => {
  const gate = deferred();
  const f = fixture(
    { dispatch: () => gate.promise },
    { callbackTimeoutMs: 15 },
  );
  assert.equal((await f.executor.run()).reason, 'timeout');
  assert.equal(f.executor.busy, true);
  gate.reject(new Error('late'));
  await tick();
  assert.equal(f.executor.busy, false);
  assert.equal((await f.executor.run()).reason, 'duplicate');
});

test('rejection, no-progress and maximum actions stop loops', async () => {
  const rejected = fixture({ dispatch: async () => ({ accepted: false }) });
  assert.equal((await rejected.executor.run()).reason, 'rejected');
  const stuck = fixture({ dispatch: async () => ({ accepted: true }) });
  assert.equal((await stuck.executor.run()).reason, 'no-progress');
  const f = fixture(
    {
      dispatch: async () => {
        f.set({ ...f.get(), revision: f.get().revision + '+' });
        return { accepted: true };
      },
    },
    { maxActions: 3 },
  );
  assert.deepEqual(await f.executor.run(), {
    reason: 'max-actions',
    actions: 3,
  });
});

test('no-candidate/human runs terminate and input guard includes presentation and execution', async () => {
  const f = fixture();
  f.set(snapshot({ candidates: [] }));
  assert.equal((await f.executor.run()).reason, 'no-candidate');
  f.set(snapshot({ activePlayerId: 'human' }));
  assert.equal((await f.executor.run()).reason, 'not-computer');
  assert.equal(shouldBlockHumanInput(f.get(), false, false), false);
  assert.equal(shouldBlockHumanInput(f.get(), true, false), true);
  assert.equal(shouldBlockHumanInput(f.get(), false, true), true);
  assert.equal(shouldBlockHumanInput(snapshot(), false, false), true);
  assert.equal(
    shouldBlockHumanInput(snapshot({ phase: 'finished' }), false, false),
    true,
  );
});

test('1 human + 3 computers fixture reproduces strategic choices and monetary transitions', async () => {
  const a = await runSimulation(42);
  assert.deepEqual(a, await runSimulation(42));
  assert.equal(a.trace.length, 27);
  assert.equal(
    a.trace.some((x) => x.playerId === 'human'),
    false,
  );
  assert.deepEqual(a.stops, [
    'not-computer',
    'turn-changed',
    'turn-changed',
    'turn-changed',
  ]);
  for (const id of ['cpu-1', 'cpu-2', 'cpu-3']) {
    assert.deepEqual(
      a.trace.filter((x) => x.playerId === id).map((x) => x.kind),
      [
        'roll',
        'buy',
        'build',
        'takeover',
        'fly',
        'trial',
        'sell',
        'pay-debt',
        'end-turn',
      ],
    );
    assert.equal(a.trace.filter((x) => x.playerId === id).at(-1).cash, 140);
  }
});

test('debt ordering stays mandatory with very large loss estimates', () => {
  const sale = c('sale', 'sell', 0, 300, {
    outlook: { assetLoss: estimate(1e12) },
  });
  assert.equal(
    choose(snapshot({ debt: 1200, candidates: [c('bankrupt'), sale] })),
    'sale',
  );
  assert.equal(
    choose(
      snapshot({
        cash: 1500,
        debt: 1200,
        candidates: [sale, c('pay', 'pay-debt', 1200)],
      }),
    ),
    'pay',
  );
});

test('session replacement during dispatch cannot start stale receipt presentation', async () => {
  let effects = 0;
  const f = fixture({
    dispatch: async () => {
      f.set({ ...f.get(), session: 'new-game' });
      return { accepted: true };
    },
    awaitPresentation: async ({ receipt }) => {
      if (receipt) effects++;
    },
  });
  assert.equal((await f.executor.run()).reason, 'session-changed');
  assert.equal(effects, 0);
});

test('presentation failure after commit stops; fresh authority state can recover safely', async () => {
  let fail = true;
  let calls = 0;
  const f = fixture(
    {
      dispatch: async () => {
        calls++;
        f.set({ ...f.get(), revision: f.get().revision + '+' });
        return { accepted: true };
      },
      awaitPresentation: async ({ receipt }) => {
        if (receipt && fail) throw new Error('effect failed');
      },
    },
    { maxActions: 1 },
  );
  assert.equal((await f.executor.run()).reason, 'failed');
  fail = false;
  assert.equal((await f.executor.run()).reason, 'max-actions');
  assert.equal(calls, 2);
});

test('pre-abort, cancel, read failure, delay failure, invalid bounds terminate safely', async () => {
  const abort = new globalThis.AbortController();
  abort.abort();
  const pre = fixture();
  assert.equal((await pre.executor.run(abort.signal)).reason, 'aborted');
  assert.equal(pre.commands.length, 0);
  const gate = deferred();
  const cancelled = fixture({ delay: () => gate.promise });
  const running = cancelled.executor.run();
  await tick();
  cancelled.executor.cancel();
  assert.equal((await running).reason, 'aborted');
  gate.resolve();
  const read = fixture({
    read: () => {
      throw new Error('snapshot failed');
    },
  });
  assert.equal((await read.executor.run()).reason, 'failed');
  const delay = fixture({
    delay: async () => {
      throw new Error('delay failed');
    },
  });
  assert.equal((await delay.executor.run()).reason, 'failed');
  assert.equal(delay.commands.length, 0);
  assert.throws(() => fixture({}, { maxActions: 0 }), RangeError);
  assert.throws(() => fixture({}, { callbackTimeoutMs: Infinity }), RangeError);
  assert.throws(() => rankCandidates(snapshot(), -1), RangeError);
});

test('planner never mutates deeply frozen public snapshots', () => {
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const s = freeze(
    snapshot({ candidates: [c('end-turn'), c('buy', 'buy', 100)] }),
  );
  assert.ok(plan(s, 42));
});

test('thinking delay finishes before the final UI unlock barrier', async () => {
  const order = [];
  const f = fixture({
    delay: async () => {
      order.push('delay');
    },
    awaitPresentation: async ({ receipt }) => {
      order.push(receipt ? 'effects' : 'unlocked');
    },
    dispatch: async () => {
      order.push('dispatch');
      f.set({ ...f.get(), turn: 't2' });
      return { accepted: true };
    },
  });
  await f.executor.run();
  assert.deepEqual(order, ['delay', 'unlocked', 'dispatch', 'effects']);
});
