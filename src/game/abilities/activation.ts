/** Draft board adaptations, not effects from the Pokémon video games. */
export const abilities = {
  overgrow: {
    pokemonId: 'pokemon:0001',
    name: '심록',
    type: 'grass',
    effect: '건설비 환급',
    color: '#73dc94',
  },
  blaze: {
    pokemonId: 'pokemon:0004',
    name: '맹화',
    type: 'fire',
    effect: '통행료 수입 강화',
    color: '#ff9868',
  },
  torrent: {
    pokemonId: 'pokemon:0007',
    name: '급류',
    type: 'water',
    effect: '지불 통행료 환급',
    color: '#78cfff',
  },
  static: {
    pokemonId: 'pokemon:0025',
    name: '정전기',
    type: 'electric',
    effect: '실수입 추가 보너스',
    color: '#ffe277',
  },
} as const;
export type AbilityId = keyof typeof abilities;
export interface AbilityActivation {
  readonly id: string;
  readonly playerId: string;
  readonly pokemonId: string;
  readonly abilityId: AbilityId;
  readonly type: 'grass' | 'fire' | 'water' | 'electric';
  readonly amount: number;
  readonly description: string;
}
export interface DraftRule {
  readonly rateBps: number;
  readonly cap: number;
  readonly perTurn: number;
  /** Inclusive pre-transaction cash threshold; null means always eligible. */
  readonly balanceAtMost: number | null;
}
export type AbilityConfig = Readonly<Record<AbilityId, DraftRule>>;
export const draftConfig: AbilityConfig = {
  overgrow: { rateBps: 1500, cap: 60, perTurn: 1, balanceAtMost: 500 },
  blaze: { rateBps: 1500, cap: 60, perTurn: 1, balanceAtMost: 500 },
  torrent: { rateBps: 2000, cap: 60, perTurn: 1, balanceAtMost: 500 },
  static: { rateBps: 500, cap: 20, perTurn: 1, balanceAtMost: null },
};
/** Trusted receipt from the external economy, after settlement, before ability money. */
export interface SettledTransaction {
  readonly id: string;
  readonly turn: number;
  readonly status: 'settled' | 'pending' | 'reversed';
  readonly origin: 'base' | 'ability';
  readonly kind: 'construction' | 'toll';
  readonly payerId: string;
  readonly payeeId: string;
  readonly paid: number;
  /** Irrecoverable cost remaining after other discounts/refunds, supplied by economy. */
  readonly netCost: number;
}
export interface AbilityRequest {
  readonly abilityId: AbilityId;
  readonly playerId: string;
  readonly pokemonId: string;
  readonly balanceBefore: number;
  readonly transaction: SettledTransaction;
}
export interface AbilityLedger {
  readonly revision: number;
  readonly latestTurn: number;
  readonly consumed: readonly string[];
  readonly usage: Readonly<Record<string, number>>;
}
export const emptyLedger = (): AbilityLedger => ({
  revision: 0,
  latestTurn: -1,
  consumed: [],
  usage: {},
});
export interface AbilityQuote {
  readonly revision: number;
  readonly requestKey: string;
  readonly key: string;
  readonly usageKey: string;
  readonly activation: AbilityActivation;
}
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
/** No mutations, randomness, time, money transfers, or consumption during quote. */
export function quoteAbility(
  ledger: AbilityLedger,
  request: AbilityRequest,
  config: AbilityConfig = draftConfig,
): AbilityQuote | null {
  const {
    transaction: tx,
    abilityId,
    playerId,
    pokemonId,
    balanceBefore,
  } = request;
  const definition = abilities[abilityId];
  const rule = config[abilityId];
  if (
    !definition ||
    !rule ||
    !tx.id ||
    !playerId ||
    !tx.payerId ||
    !tx.payeeId ||
    pokemonId !== definition.pokemonId ||
    !integer(balanceBefore) ||
    !integer(tx.turn) ||
    tx.turn < ledger.latestTurn ||
    !integer(tx.paid) ||
    !integer(tx.netCost) ||
    tx.paid === 0 ||
    tx.netCost === 0 ||
    tx.netCost > tx.paid ||
    tx.status !== 'settled' ||
    tx.origin !== 'base' ||
    tx.payerId === tx.payeeId ||
    !integer(rule.rateBps) ||
    rule.rateBps > 10000 ||
    !integer(rule.cap) ||
    !integer(rule.perTurn) ||
    (rule.balanceAtMost !== null &&
      (!integer(rule.balanceAtMost) || balanceBefore > rule.balanceAtMost))
  )
    return null;
  const incoming = abilityId === 'blaze' || abilityId === 'static';
  if (
    (incoming ? tx.payeeId : tx.payerId) !== playerId ||
    tx.kind !== (abilityId === 'overgrow' ? 'construction' : 'toll')
  )
    return null;
  const key = JSON.stringify([tx.id, playerId, abilityId]);
  const usageKey = JSON.stringify([tx.turn, playerId, abilityId]);
  if (
    ledger.consumed.includes(key) ||
    (ledger.usage[usageKey] ?? 0) >= rule.perTurn
  )
    return null;
  // BigInt keeps flooring exact even at safe-integer currency boundaries.
  const basis = incoming ? tx.paid : tx.netCost;
  const amount = Math.min(
    Number((BigInt(basis) * BigInt(rule.rateBps)) / 10000n),
    rule.cap,
  );
  // A refund must retain at least one currency unit of real cost: no free farming.
  const bounded = incoming
    ? amount
    : Math.min(amount, Math.max(0, tx.netCost - 1));
  if (!bounded) return null;
  return {
    revision: ledger.revision,
    requestKey: JSON.stringify([request, rule]),
    key,
    usageKey,
    activation: {
      id: `ability:${key}`,
      playerId,
      pokemonId,
      abilityId,
      type: definition.type,
      amount: bounded,
      description: `${definition.name} · ${definition.effect} +${bounded} (각색 초안)`,
    },
  };
}
/** Revalidates against current receipt/rules. Caller atomically persists ledger + money. */
export function commitAbility(
  ledger: AbilityLedger,
  request: AbilityRequest,
  quote: AbilityQuote,
  config: AbilityConfig = draftConfig,
): { ledger: AbilityLedger; activation: AbilityActivation } | null {
  const fresh = quoteAbility(ledger, request, config);
  if (!fresh || JSON.stringify(fresh) !== JSON.stringify(quote)) return null;
  return {
    activation: fresh.activation,
    ledger: {
      revision: ledger.revision + 1,
      latestTurn: request.transaction.turn,
      consumed: [...ledger.consumed, fresh.key],
      usage: {
        ...ledger.usage,
        [fresh.usageKey]: (ledger.usage[fresh.usageKey] ?? 0) + 1,
      },
    },
  };
}
