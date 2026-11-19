import type { PlayerId, TileId } from '../contracts.ts';
import { quoteBlessing } from '../legendary.ts';
import {
  check,
  money,
  validateEconomyState,
  facilities,
  modifiedAmount,
  tollBase,
} from './catalog.ts';
import type { EconomyState, EconomyContext, Quote, Stage } from './types.ts';

export function propertyCapital(
  s: EconomyState,
  c: EconomyContext,
  tileId: TileId,
): number {
  const prop = c.properties[tileId];
  check(prop, 'not-purchasable');
  const stage = s.holdings.find((h) => h.tileId === tileId)?.facilityLevel ?? 0;
  return money(
    prop.landCost +
      (prop.kind === 'city'
        ? prop.buildCosts.slice(0, stage).reduce((a, b) => money(a + b), 0)
        : 0),
  );
}
export function decisionReasons(
  s: EconomyState,
  playerId: PlayerId,
  tileId: TileId,
): string[] {
  const reasons: string[] = [];
  if (s.phase !== 'playing') reasons.push('game-not-playing');
  const p = s.players.find((p) => p.id === playerId);
  if (!p || p.bankrupt || s.activePlayerId !== playerId)
    reasons.push('wrong-player');
  if (s.core.turnStage !== 'awaiting-end') reasons.push('roll-required');
  const l = s.economy.landing;
  if (
    !l ||
    l.playerId !== playerId ||
    l.tileId !== tileId ||
    p?.position !== tileId
  )
    reasons.push('wrong-landing');
  if (l?.propertyDecisionUsed) reasons.push('property-decision-used');
  if (s.economy.pendingDebt) reasons.push('debt-pending');
  if (s.legendary?.players[playerId]?.trial || s.legendary?.pendingFly)
    reasons.push('special-pending');
  return reasons;
}
function makeQuote(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
  kind: Quote['kind'],
  land: number,
  upgrade: number,
  reasons: string[],
  lineItems: Quote['lineItems'] = [],
  blessingKind?: 'upgrade' | 'toll',
): Quote {
  const p = s.players.find((p) => p.id === playerId);
  check(p, 'wrong-player');
  const base = blessingKind === 'upgrade' ? upgrade : land;
  const modified = blessingKind
    ? modifiedAmount(c, blessingKind, playerId, tileId, base)
    : { amount: base, ids: [] };
  const blessed = blessingKind
    ? quoteBlessing(s, playerId, blessingKind, modified.amount)
    : { amount: modified.amount, consumed: false };
  const gross = money(
    blessingKind === 'upgrade' ? land + modified.amount : modified.amount,
  );
  const total = money(
    blessingKind === 'upgrade' ? land + blessed.amount : blessed.amount,
  );
  const revenue = kind === 'sale' ? total : 0;
  const cost = kind === 'sale' ? 0 : total;
  const shortfall = Math.max(0, cost - p.balance);
  if (shortfall && kind !== 'toll') reasons.push('insufficient-funds');
  if (!Number.isSafeInteger(p.balance + revenue)) reasons.push('invalid-state');
  return {
    quoteId: `${s.economy.sessionId}:${s.economy.revision}:${playerId}:${tileId}:${kind}:${lineItems.map((i) => i.key).join(',')}`,
    revision: s.economy.revision,
    profileVersion: c.profile.version,
    catalogVersion: c.catalogVersion,
    tileId,
    landingId: s.economy.landing?.id ?? null,
    fromStage: null,
    toStage: null,
    kind,
    lineItems,
    landSubtotal: land,
    upgradeSubtotal: upgrade,
    gross,
    discount: gross - total,
    total,
    expectedCost: cost,
    expectedRevenue: revenue,
    balanceAfter: p.balance + revenue - cost,
    shortfall,
    consumesBlessing: blessed.consumed,
    modifierIds: modified.ids,
    eligible: reasons.length === 0,
    reasons,
  };
}
export function quoteConstruction(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
  targetStage: Stage,
): Quote {
  validateEconomyState(s, c);
  check(
    Number.isInteger(targetStage) && targetStage >= 0 && targetStage <= 3,
    'invalid-target',
  );
  const prop = c.properties[tileId];
  check(prop?.kind === 'city', 'not-purchasable');
  const h = s.holdings.find((h) => h.tileId === tileId);
  const reasons = decisionReasons(s, playerId, tileId);
  if (h && h.ownerId !== playerId) reasons.push('not-owner');
  if (h && targetStage <= h.facilityLevel) reasons.push('already-built');
  if (
    s.economy.completedLapsByPlayerId[playerId]! <
    c.profile.unlockLaps[targetStage]
  )
    reasons.push('stage-locked');
  const d = s.economy.developmentByTileId[tileId];
  if (
    targetStage === 3 &&
    c.profile.requireFinalRevisit &&
    (!d ||
      d.stage < 2 ||
      d.centerReadyVisitOrdinal === null ||
      !s.economy.landing ||
      s.economy.landing.visitOrdinal <= d.centerReadyVisitOrdinal)
  )
    reasons.push('final-revisit-required');
  const from = h?.facilityLevel ?? 0;
  const land = h ? 0 : prop.landCost;
  const upgrade = prop.buildCosts
    .slice(from, targetStage)
    .reduce((a, b) => money(a + b), 0);
  const items = [
    { key: 'land', amount: land, alreadyOwned: !!h },
    ...facilities.slice(0, targetStage).map((key, i) => ({
      key,
      amount: i < from ? 0 : prop.buildCosts[i]!,
      alreadyOwned: i < from,
    })),
  ];
  return {
    ...makeQuote(
      s,
      c,
      playerId,
      tileId,
      'construction',
      land,
      upgrade,
      reasons,
      items,
      'upgrade',
    ),
    fromStage: h ? (h.facilityLevel as Stage) : null,
    toStage: targetStage,
  };
}
export function quoteLandmark(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
): Quote {
  validateEconomyState(s, c);
  const p = c.properties[tileId];
  check(p?.kind === 'landmark', 'not-purchasable');
  const reasons = decisionReasons(s, playerId, tileId);
  if (s.holdings.some((h) => h.tileId === tileId))
    reasons.push('already-owned');
  return makeQuote(s, c, playerId, tileId, 'landmark', p.landCost, 0, reasons, [
    { key: 'landmark', amount: p.landCost, alreadyOwned: false },
  ]);
}
export function quoteTakeover(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
): Quote {
  validateEconomyState(s, c);
  const prop = c.properties[tileId];
  check(prop, 'not-purchasable');
  const h = s.holdings.find((h) => h.tileId === tileId);
  const reasons = decisionReasons(s, playerId, tileId);
  if (!h || h.ownerId === playerId) reasons.push('not-opponent-owned');
  if (
    (prop.kind === 'landmark' && !c.profile.landmarkTakeoverAllowed) ||
    (h?.facilityLevel === 3 && c.profile.finalTakeoverImmune)
  )
    reasons.push('takeover-immune');
  const amount = money(
    propertyCapital(s, c, tileId) * c.profile.takeoverMultiplier,
  );
  if (
    h &&
    !Number.isSafeInteger(
      s.players.find((p) => p.id === h.ownerId)!.balance + amount,
    )
  )
    reasons.push('invalid-state');
  return makeQuote(s, c, playerId, tileId, 'takeover', amount, 0, reasons, [
    { key: 'takeover', amount, alreadyOwned: false },
  ]);
}
export function quoteSale(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
): Quote {
  validateEconomyState(s, c);
  const reasons: string[] = [];
  if (s.phase !== 'playing') reasons.push('game-not-playing');
  if (
    s.activePlayerId !== playerId ||
    !s.players.some((p) => p.id === playerId && !p.bankrupt)
  )
    reasons.push('wrong-player');
  if (!s.holdings.some((h) => h.tileId === tileId && h.ownerId === playerId))
    reasons.push('not-owner');
  if (s.legendary?.players[playerId]?.trial || s.legendary?.pendingFly)
    reasons.push('special-pending');
  const amount = money(
    Math.floor(propertyCapital(s, c, tileId) * c.profile.saleRate),
  );
  return makeQuote(s, c, playerId, tileId, 'sale', amount, 0, reasons, [
    { key: 'sale', amount, alreadyOwned: true },
  ]);
}
/** Projected cost for any payer/tile; eligibility is economic, not a landing permission. */
export function quoteToll(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
): Quote {
  validateEconomyState(s, c);
  const amount = tollBase(s, c, playerId, tileId);
  return makeQuote(
    s,
    c,
    playerId,
    tileId,
    'toll',
    amount,
    0,
    [],
    [{ key: 'toll', amount, alreadyOwned: false }],
    'toll',
  );
}
