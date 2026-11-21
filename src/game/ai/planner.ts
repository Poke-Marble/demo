import {
  STANDARD,
  type Candidate,
  type Ranked,
  type Snapshot,
} from './contracts.ts';

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  return result >>> 0;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function valid<Action>(s: Snapshot<Action>): void {
  const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
  if (
    !Number.isFinite(s.cash) ||
    !nonnegative(s.debt) ||
    !nonnegative(s.expectedToll.value)
  ) {
    throw new RangeError('Invalid cash, debt or expected toll');
  }
  if (
    new Set(s.candidates.map((c) => c.id)).size !== s.candidates.length ||
    new Set(s.properties.map((p) => p.id)).size !== s.properties.length ||
    new Set(s.players.map((p) => p.id)).size !== s.players.length
  ) {
    throw new RangeError('Duplicate candidate, property or player ID');
  }
  for (const set of s.collections) {
    if (
      !set.propertyIds.length ||
      new Set(set.propertyIds).size !== set.propertyIds.length ||
      set.propertyIds.some((id) => !s.properties.some((p) => p.id === id)) ||
      (set.kind === 'four-landmarks' && set.propertyIds.length !== 4)
    ) {
      throw new RangeError('Invalid public collection');
    }
  }
  for (const c of s.candidates) {
    if (!c.id || !nonnegative(c.quote.debit) || !nonnegative(c.quote.credit)) {
      throw new RangeError('Invalid candidate quote');
    }
    for (const value of Object.values(c.outlook ?? {})) {
      if (typeof value === 'object' && !nonnegative(value.value)) {
        throw new RangeError('Invalid estimate');
      }
    }
    const chance = c.outlook?.trialSuccessProbability;
    if (chance !== undefined && (!nonnegative(chance) || chance > 1)) {
      throw new RangeError('Invalid trial probability');
    }
  }
}

/** Public ownership progress only; this is not a victory predicate. */
function collectionValue<Action>(
  s: Snapshot<Action>,
  c: Candidate<Action>,
): number {
  let score = 0;
  for (const set of s.collections.filter((set) =>
    set.propertyIds.includes(c.targetId ?? ''),
  )) {
    const own = set.propertyIds.filter((id) =>
      s.properties.some((p) => p.id === id && p.ownerId === s.activePlayerId),
    ).length;
    const progress =
      set.kind === 'group'
        ? STANDARD.groupProgress
        : set.kind === 'line'
          ? STANDARD.lineProgress
          : STANDARD.landmarkProgress;
    const completion =
      set.kind === 'group'
        ? STANDARD.groupCompletion
        : set.kind === 'line'
          ? STANDARD.lineCompletion
          : STANDARD.landmarkCompletion;
    const selling = c.kind === 'sell';
    score += selling
      ? -(
          (progress * own) / set.propertyIds.length +
          (own === set.propertyIds.length ? completion : 0)
        )
      : (progress * (own + 1)) / set.propertyIds.length +
        (own + 1 === set.propertyIds.length ? completion : 0);
  }
  return score;
}

/** Pure deterministic ranking. Returned candidates/actions retain input identity. */
export function rankCandidates<Action>(
  s: Snapshot<Action>,
  seed: number,
): readonly Ranked<Action>[] {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Seed must be uint32');
  valid(s);
  const player = s.players.find((p) => p.id === s.activePlayerId);
  if (
    s.phase !== 'playing' ||
    !player ||
    player.bankrupt ||
    player.controller !== 'computer'
  )
    return [];
  const reserve = Math.max(
    STANDARD.minimumReserve,
    s.expectedToll.value * STANDARD.tollReserveMultiplier,
  );
  const ranked: Ranked<Action>[] = [];
  for (const c of s.candidates) {
    const after = s.cash - c.quote.debit + c.quote.credit;
    const investment = ['buy', 'build', 'takeover'].includes(c.kind);
    if (
      investment &&
      (s.debt > 0 || (after < reserve && !c.outlook?.immediateWin))
    )
      continue;
    // The authority should supply only debt-resolution candidates during debt.
    if (s.debt > 0 && !['sell', 'pay-debt', 'bankrupt'].includes(c.kind))
      continue;
    const o = c.outlook;
    let score = 0;
    const reasons: string[] = [];
    if (investment) {
      score =
        20 +
        STANDARD.incomeWeight * (o?.income?.value ?? 0) -
        c.quote.debit * 0.25;
      reasons.push('reserve-preserved', 'quoted-investment');
    }
    if (['buy', 'takeover', 'sell'].includes(c.kind)) {
      score += collectionValue(s, c);
      reasons.push('public-collection-progress');
    }
    if (
      (o?.blocksImmediateMonopoly || o?.blocksMonopolyThreat) &&
      ['buy', 'takeover', 'fly'].includes(c.kind)
    ) {
      score += STANDARD.immediateDefense;
      reasons.push(
        o.blocksImmediateMonopoly
          ? 'supplied-immediate-defense'
          : 'public-monopoly-threat',
      );
    }
    if (c.kind === 'sell') {
      score +=
        s.debt > 0
          ? 10000 + Math.min(c.quote.credit, Math.max(0, s.debt - s.cash))
          : -10000;
      score -=
        (o?.assetLoss?.value ?? c.quote.credit) +
        Math.max(0, after - s.debt) * 0.1;
      reasons.push(s.debt > 0 ? 'debt-liquidation' : 'avoid-voluntary-sale');
    }
    if (c.kind === 'pay-debt') score = 100000;
    if (c.kind === 'bankrupt') score = -1000000000;
    if (c.kind === 'roll') score = 10;
    if (c.kind === 'end-turn' || c.kind === 'pass') score = 0;
    if (c.kind === 'fly') {
      score +=
        (o?.destinationValue?.value ?? 0) +
        STANDARD.incomeWeight * (o?.income?.value ?? 0) -
        c.quote.debit;
      reasons.push('supplied-flight-outlook');
    }
    if (c.kind === 'trial') {
      // Missing probability is pessimistic, never inferred from a hidden roll.
      score =
        (o?.trialSuccessProbability ?? 0) *
          (o?.trialReward?.value ?? STANDARD.trialReward) -
        (o?.lostTurnCost?.value ?? STANDARD.lostTurnCost) -
        c.quote.debit;
      reasons.push('trial-expected-utility');
    }
    if (c.kind === 'rope') {
      score = -(o?.ropeValue?.value ?? STANDARD.ropeValue) - c.quote.debit;
      reasons.push('preserve-rope');
    }
    score -= o?.tollExposure?.value ?? 0;
    if (o?.immediateWin) reasons.push('authority-immediate-win');
    if (!Number.isFinite(score)) throw new RangeError('Score overflow');
    ranked.push({ candidate: c, score, reasons });
  }
  const tie = (id: string) =>
    hash(JSON.stringify([seed, s.turn, s.activePlayerId, id]));
  // Mandatory debt ordering must not be overturned by large currency values.
  const priority = (c: Candidate<Action>) =>
    c.kind === 'bankrupt'
      ? -1
      : s.debt > 0 && c.kind === 'pay-debt'
        ? 2
        : s.debt > 0 && c.kind === 'sell'
          ? 1
          : c.outlook?.immediateWin
            ? 1
            : 0;
  return ranked.sort(
    (a, b) =>
      priority(b.candidate) - priority(a.candidate) ||
      b.score - a.score ||
      tie(a.candidate.id) - tie(b.candidate.id) ||
      compare(a.candidate.id, b.candidate.id),
  );
}

export function plan<Action>(
  s: Snapshot<Action>,
  seed: number,
): Ranked<Action> | null {
  return rankCandidates(s, seed)[0] ?? null;
}
