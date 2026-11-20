import {
  verifyCommittedReceipt,
  type EconomyContext,
  type EconomyTransition,
} from '../../../game/economy/index.ts';
import {
  abilities,
  quoteAbility,
  commitAbility,
  type AbilityActivation,
  type SettledTransaction,
  type AbilityId,
} from '../../../game/abilities/activation.ts';
import type { IntegratedState } from './adapter.ts';

/** Only validated base receipts may fund abilities. Returns a single atomic snapshot. */
export function settleAbilities(
  before: IntegratedState,
  context: EconomyContext,
  result: Extract<EconomyTransition<IntegratedState>, { ok: true }>,
) {
  if (result.replayed) return { next: result.state, activations: [] };
  if (!verifyCommittedReceipt(result.state, context, result.receipt))
    throw new Error('영수증 검증 실패');
  let next = result.state;
  const txs: SettledTransaction[] = [];
  const q = result.receipt.quote;
  if (q?.kind === 'construction' && q.total > 0 && q.upgradeSubtotal > 0) {
    // Land is not a construction refund basis. Discounts apply to upgrade first.
    const paid = Math.min(q.total, Math.max(0, q.total - q.landSubtotal));
    txs.push({
      id: `${result.receipt.sessionId}:${result.receipt.commandId}:construction`,
      turn: before.turnNumber,
      status: 'settled',
      origin: 'base',
      kind: 'construction',
      payerId: result.receipt.playerId,
      payeeId: 'bank',
      paid,
      netCost: paid,
    });
  }
  for (const e of result.events)
    if (e.type === 'toll-settled' && e.recovered > 0)
      txs.push({
        id: `${result.receipt.sessionId}:${result.receipt.commandId}:toll`,
        turn: before.turnNumber,
        status: 'settled',
        origin: 'base',
        kind: 'toll',
        payerId: e.debtorId,
        payeeId: e.creditorId,
        paid: e.recovered,
        netCost: e.recovered,
      });
  const activations: AbilityActivation[] = [];
  for (const tx of txs)
    for (const p of before.players) {
      if (next.players.find((n) => n.id === p.id)!.bankrupt) continue;
      const abilityId = (Object.keys(abilities) as AbilityId[]).find(
        (id) => abilities[id].pokemonId === p.pokemonId,
      );
      if (!abilityId) continue;
      // Settlement is the last base money step: includes START and liquidation proceeds.
      // Use the base result, never the evolving ability bonus snapshot.
      const settledBalance = result.state.players.find(
        (n) => n.id === p.id,
      )!.balance;
      const balanceBefore =
        settledBalance +
        (tx.payerId === p.id
          ? tx.kind === 'construction'
            ? q!.total
            : tx.paid
          : 0) -
        (tx.payeeId === p.id ? tx.paid : 0);
      const request = {
        abilityId,
        playerId: p.id,
        pokemonId: p.pokemonId,
        balanceBefore,
        transaction: tx,
      };
      const quote = quoteAbility(next.abilityLedger, request);
      const committed =
        quote && commitAbility(next.abilityLedger, request, quote);
      if (!committed) continue;
      const amount = committed.activation.amount;
      const balance = next.players.find((n) => n.id === p.id)!.balance + amount;
      if (!Number.isSafeInteger(balance))
        throw new Error('특성 잔액 범위 오류');
      next = {
        ...next,
        abilityLedger: committed.ledger,
        players: next.players.map((n) =>
          n.id === p.id ? { ...n, balance } : n,
        ),
      };
      activations.push(committed.activation);
    }
  next = {
    ...next,
    abilityReceipts: [...next.abilityReceipts, ...txs],
    abilityOutbox: [...next.abilityOutbox, ...activations],
  };
  return { next, activations };
}
