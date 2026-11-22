import type { PlayerId, TileId } from '../contracts.ts';
import type { EconomyState, EconomyContext, Stage, Quote } from './types.ts';
import { quoteConstruction } from './quotes.ts';

/** Permission is independent of city visits: never synthesize a landing. */
export function startBuildReasons(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
  stage: Stage,
  opportunityId: string,
): string[] {
  const reasons: string[] = [];
  const opportunity = s.economy.pendingStartBuild;
  const landing = s.economy.landing;
  const player = s.players.find((p) => p.id === playerId);
  if (
    !opportunity ||
    opportunity.id !== opportunityId ||
    opportunity.playerId !== playerId ||
    opportunity.landingId !== landing?.id ||
    landing.playerId !== playerId ||
    c.map.tiles.find((t) => t.id === landing.tileId)?.kind !== 'start' ||
    player?.position !== landing.tileId ||
    s.activePlayerId !== playerId ||
    player.bankrupt ||
    s.phase !== 'playing' ||
    s.core.turnStage !== 'awaiting-end' ||
    s.economy.pendingDebt ||
    s.economy.pendingToll ||
    s.core.pendingDice ||
    s.legendary?.pendingFly
  )
    reasons.push('wrong-start-build');
  const holding = s.holdings.find((h) => h.tileId === tileId);
  if (
    !holding ||
    holding.ownerId !== playerId ||
    c.properties[tileId]?.kind !== 'city'
  )
    reasons.push('not-owner');
  if (
    !holding ||
    holding.facilityLevel >= 3 ||
    stage !== holding.facilityLevel + 1
  )
    reasons.push('next-stage-required');
  const development = s.economy.developmentByTileId[tileId];
  if (
    stage === 3 &&
    (!development ||
      development.stage !== 2 ||
      development.centerReadyVisitOrdinal === null ||
      !landing ||
      development.centerReadyVisitOrdinal >= landing.visitOrdinal)
  )
    reasons.push('final-revisit-required');
  return reasons;
}

export function quoteStartBuild(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
  opportunityId: string,
): Quote {
  const holding = s.holdings.find((h) => h.tileId === tileId);
  const stage = Math.min(3, (holding?.facilityLevel ?? 0) + 1) as Stage;
  const quote = quoteConstruction(s, c, playerId, tileId, stage, opportunityId);
  // Opaque selection handle; the authority recomputes it, never accepts a client price.
  let hash = 2166136261;
  for (const char of JSON.stringify([opportunityId, quote]))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { ...quote, quoteId: `sb-${(hash >>> 0).toString(36)}` };
}

export function startBuildCandidates(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
): Quote[] {
  const opportunity = s.economy.pendingStartBuild;
  if (!opportunity) return [];
  return s.holdings
    .filter(
      (h) =>
        h.ownerId === playerId &&
        h.facilityLevel < 3 &&
        c.properties[h.tileId]?.kind === 'city',
    )
    .map((h) => quoteStartBuild(s, c, playerId, h.tileId, opportunity.id))
    .filter((q) => q.eligible);
}
