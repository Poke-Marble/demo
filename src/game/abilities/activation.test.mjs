import test from 'node:test';
import assert from 'node:assert/strict';
import {
  abilities,
  draftConfig,
  emptyLedger,
  quoteAbility,
  commitAbility,
} from './activation.ts';

const input = (abilityId = 'overgrow', overrides = {}) => ({
  abilityId,
  playerId: 'player:a',
  pokemonId: abilities[abilityId].pokemonId,
  balanceBefore: 500,
  transaction: {
    id: 'tx:1',
    turn: 1,
    status: 'settled',
    origin: 'base',
    kind: abilityId === 'overgrow' ? 'construction' : 'toll',
    payerId: ['blaze', 'static'].includes(abilityId) ? 'player:b' : 'player:a',
    payeeId: ['blaze', 'static'].includes(abilityId) ? 'player:a' : 'bank',
    paid: 200,
    netCost: 200,
    ...overrides,
  },
});
test('all four adaptations quote purely, produce declarative activations, and commit once', () => {
  for (const [id, expected] of [
    ['overgrow', 30],
    ['blaze', 30],
    ['torrent', 40],
    ['static', 10],
  ]) {
    const ledger = emptyLedger();
    const req = input(id);
    const snapshot = JSON.stringify({ ledger, req, draftConfig });
    const q = quoteAbility(ledger, req);
    assert.deepEqual(quoteAbility(ledger, req), q);
    assert.equal(q.activation.amount, expected);
    assert.equal(q.activation.type, abilities[id].type);
    const result = commitAbility(ledger, req, q);
    assert.equal(JSON.stringify({ ledger, req, draftConfig }), snapshot);
    assert.equal(result.ledger.revision, 1);
    assert.equal(quoteAbility(result.ledger, req), null);
    assert.equal(commitAbility(result.ledger, req, q), null);
    assert.deepEqual(
      quoteAbility(JSON.parse(JSON.stringify(result.ledger)), req),
      null,
    );
  }
});
test('rejects unsettled, zero, recursive, self-transfers and malformed currency', () => {
  for (const patch of [
    { status: 'pending' },
    { status: 'reversed' },
    { paid: 0, netCost: 0 },
    { origin: 'ability' },
    { payeeId: 'player:a' },
    { paid: -1 },
    { paid: NaN },
    { paid: Infinity },
    { paid: 2.5 },
    { paid: Number.MAX_SAFE_INTEGER + 1 },
    { netCost: 201 },
    { turn: -1 },
    { id: '' },
  ]) {
    assert.equal(quoteAbility(emptyLedger(), input('overgrow', patch)), null);
  }
});
test('one-unit cost remains even with 100% refund and zero-cost farming yields nothing', () => {
  const config = {
    ...draftConfig,
    overgrow: { ...draftConfig.overgrow, rateBps: 10000, cap: 1000 },
  };
  for (const cost of [0, 1])
    assert.equal(
      quoteAbility(
        emptyLedger(),
        input('overgrow', { paid: 200, netCost: cost }),
        config,
      ),
      null,
    );
  assert.equal(
    quoteAbility(emptyLedger(), input('overgrow', { netCost: 10 }), config)
      .activation.amount,
    9,
  );
});
test('threshold inclusive, species, payer/payee and transaction kind enforced', () => {
  const req = input();
  assert.ok(quoteAbility(emptyLedger(), req));
  for (const patch of [
    { balanceBefore: 501 },
    { balanceBefore: -1 },
    { pokemonId: 'pokemon:0025' },
    { playerId: 'player:other' },
  ]) {
    assert.equal(quoteAbility(emptyLedger(), { ...req, ...patch }), null);
  }
  assert.equal(
    quoteAbility(emptyLedger(), input('overgrow', { kind: 'toll' })),
    null,
  );
  assert.equal(
    quoteAbility(emptyLedger(), input('static', { kind: 'construction' })),
    null,
  );
  assert.ok(
    quoteAbility(emptyLedger(), { ...input('static'), balanceBefore: 99999 }),
  );
});
test('per-turn quota, old turns, and stale concurrent quotes cannot replay', () => {
  const ledger = emptyLedger();
  const req = input();
  const q = quoteAbility(ledger, req);
  const concurrent = input('static');
  const cq = quoteAbility(ledger, concurrent);
  const result = commitAbility(ledger, req, q);
  assert.equal(commitAbility(result.ledger, concurrent, cq), null);
  assert.equal(
    quoteAbility(result.ledger, input('overgrow', { id: 'tx:2' })),
    null,
  );
  const next = input('overgrow', { id: 'tx:2', turn: 2 });
  const committed = commitAbility(
    result.ledger,
    next,
    quoteAbility(result.ledger, next),
  );
  assert.equal(
    quoteAbility(committed.ledger, input('overgrow', { id: 'old', turn: 1 })),
    null,
  );
});
test('forged quote, changed receipt, and changed draft rules fail at commit', () => {
  const ledger = emptyLedger();
  const req = input();
  const q = quoteAbility(ledger, req);
  assert.equal(
    commitAbility(ledger, req, {
      ...q,
      activation: { ...q.activation, amount: 999 },
    }),
    null,
  );
  assert.equal(
    commitAbility(ledger, input('overgrow', { paid: 100, netCost: 100 }), q),
    null,
  );
  assert.equal(
    commitAbility(ledger, req, q, {
      ...draftConfig,
      overgrow: { ...draftConfig.overgrow, rateBps: 1000 },
    }),
    null,
  );
});
test('exact floor, caps, invalid draft rules, and configurable limits', () => {
  assert.equal(
    quoteAbility(emptyLedger(), input('static', { paid: 39, netCost: 39 }))
      .activation.amount,
    1,
  );
  assert.equal(
    quoteAbility(emptyLedger(), input('static', { paid: 19, netCost: 19 })),
    null,
  );
  assert.equal(
    quoteAbility(emptyLedger(), input('blaze', { paid: 9999, netCost: 9999 }))
      .activation.amount,
    60,
  );
  for (const patch of [
    { rateBps: 10001 },
    { rateBps: -1 },
    { cap: NaN },
    { perTurn: 0 },
    { balanceAtMost: -1 },
  ]) {
    assert.equal(
      quoteAbility(emptyLedger(), input(), {
        ...draftConfig,
        overgrow: { ...draftConfig.overgrow, ...patch },
      }),
      null,
    );
  }
  const config = {
    ...draftConfig,
    overgrow: { ...draftConfig.overgrow, perTurn: 2 },
  };
  const req = input();
  const ledger = commitAbility(
    emptyLedger(),
    req,
    quoteAbility(emptyLedger(), req, config),
    config,
  ).ledger;
  assert.ok(quoteAbility(ledger, input('overgrow', { id: 'tx:2' }), config));
  const huge = {
    ...config,
    static: { ...config.static, cap: Number.MAX_SAFE_INTEGER },
  };
  assert.equal(
    quoteAbility(
      emptyLedger(),
      input('static', {
        paid: Number.MAX_SAFE_INTEGER,
        netCost: Number.MAX_SAFE_INTEGER,
      }),
      huge,
    ).activation.amount,
    Number((BigInt(Number.MAX_SAFE_INTEGER) * 500n) / 10000n),
  );
});
test('bulk repeated events never create a second financial activation', () => {
  let ledger = emptyLedger();
  let count = 0;
  for (let i = 0; i < 1000; i++) {
    const req = input('static');
    const q = quoteAbility(ledger, req);
    if (q) {
      const result = commitAbility(ledger, req, q);
      ledger = result.ledger;
      count++;
    }
  }
  assert.equal(count, 1);
});

test('income also rejects zero net consumption; even same-rounded receipt changes invalidate quote', () => {
  for (const id of ['static', 'blaze']) {
    assert.equal(quoteAbility(emptyLedger(), input(id, { netCost: 0 })), null);
  }
  const ledger = emptyLedger();
  const req = input('static');
  const quote = quoteAbility(ledger, req);
  assert.equal(
    commitAbility(ledger, input('static', { paid: 201, netCost: 201 }), quote),
    null,
  );
});
