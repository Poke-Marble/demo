import {
  normalizeRulesPreset,
  rulesPresets,
  type RulesPreset,
} from '../rulesets.ts';
import type { BoardDefinition } from '../../data/maps/types.ts';
import { validMatch } from '../match/rounds.ts';
import { toMapDefinition } from '../../data/maps/types.ts';
import type { CoreState } from '../core/index.ts';
import { quoteBlessing } from '../legendary.ts';
import type { PlayerId, TileId } from '../contracts.ts';
import type {
  EconomyContext,
  EconomyModifier,
  EconomyProfile,
  EconomyState,
  Property,
} from './types.ts';

const sharedEconomyRules = {
  requireFinalRevisit: true,
  groupTollMultiplier: 2,
  takeoverMultiplier: 2,
  saleRate: 0.5,
  finalTakeoverImmune: true,
  landmarkTakeoverAllowed: false,
} as const;
export const standardEconomyProfile: EconomyProfile = Object.freeze({
  ...sharedEconomyRules,
  id: 'standard-cumulative',
  version: '1',
  unlockLaps: rulesPresets.standard.unlockLaps,
});
export const quickEconomyProfile: EconomyProfile = Object.freeze({
  ...sharedEconomyRules,
  id: 'quick-cumulative',
  version: '1',
  unlockLaps: rulesPresets.quick.unlockLaps,
});
export const recommendedEconomyProfile = standardEconomyProfile;

export function economyProfileForPreset(preset?: RulesPreset): EconomyProfile {
  return normalizeRulesPreset(preset) === 'quick'
    ? quickEconomyProfile
    : standardEconomyProfile;
}
export function money(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('invalid-state');
  return value;
}
export function check(
  condition: unknown,
  error = 'invalid-state',
): asserts condition {
  if (!condition) throw new RangeError(error);
}
/** Full canonical value binds save data to exact rules, prices and modifier input. */
export function configurationKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(configurationKey).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${configurationKey(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
export function modifiedAmount(
  c: EconomyContext,
  kind: 'upgrade' | 'toll',
  playerId: PlayerId,
  tileId: TileId,
  amount: number,
): { amount: number; ids: string[] } {
  const mods = c.modifiers
    .filter(
      (m) =>
        m.kind === kind &&
        m.playerId === playerId &&
        (!m.tileId || m.tileId === tileId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const m of mods)
    amount = money(Math.floor(money(amount * m.multiplierBps) / 10000));
  return { amount, ids: mods.map((m) => m.id) };
}
/** Before ability modifiers and payer blessing; independent of a visit. */
export function tollBase(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
  tileId: TileId,
): number {
  const prop = c.properties[tileId];
  const holding = s.holdings.find((h) => h.tileId === tileId);
  if (!prop || !holding || holding.ownerId === playerId) return 0;
  const amount =
    prop.kind === 'city' ? prop.tolls[holding.facilityLevel]! : prop.baseToll;
  const tile = c.map.tiles.find((t) => t.id === tileId)!;
  if (tile.kind !== 'city') return amount;
  const group = c.map.cityGroups.find((g) => g.id === tile.groupId)!;
  const complete = group.cityIds.every((id) =>
    s.holdings.some((h) => h.tileId === id && h.ownerId === holding.ownerId),
  );
  return money(amount * (complete ? c.profile.groupTollMultiplier : 1));
}
export function validateContext(c: EconomyContext): void {
  const { map, profile: p } = c;
  check(
    map.tiles.length > 1 &&
      new Set(map.tiles.map((t) => t.id)).size === map.tiles.length,
  );
  check(map.tiles.filter((t) => t.kind === 'start').length === 1);
  check(p.id && p.version && c.catalogVersion);
  check(p.unlockLaps.length === 4);
  p.unlockLaps.forEach(money);
  check(
    p.unlockLaps[0] === 0 &&
      p.unlockLaps.every((n, i) => i === 0 || n >= p.unlockLaps[i - 1]!),
  );
  money(p.groupTollMultiplier);
  money(p.takeoverMultiplier);
  check(p.groupTollMultiplier >= 1 && p.takeoverMultiplier >= 1);
  check(Number.isFinite(p.saleRate) && p.saleRate >= 0 && p.saleRate <= 1);
  check(
    [
      p.requireFinalRevisit,
      p.finalTakeoverImmune,
      p.landmarkTakeoverAllowed,
    ].every((v) => typeof v === 'boolean'),
  );
  check(
    new Set(map.cityGroups.map((g) => g.id)).size === map.cityGroups.length,
  );
  for (const g of map.cityGroups) {
    check(g.cityIds.length > 0 && new Set(g.cityIds).size === g.cityIds.length);
    check(
      g.cityIds.every((id) =>
        map.tiles.some(
          (t) => t.id === id && t.kind === 'city' && t.groupId === g.id,
        ),
      ),
    );
  }
  for (const tile of map.tiles) {
    const prop = c.properties[tile.id];
    if (tile.kind !== 'city' && tile.kind !== 'landmark') {
      check(!prop);
      continue;
    }
    check(prop && prop.kind === tile.kind && prop.tileId === tile.id);
    money(prop.landCost);
    if (prop.kind === 'city') {
      check(
        prop.buildCosts.length === 3 &&
          prop.tolls.length === 4 &&
          prop.finalFacilityKey.length > 0,
        'missing-facility-metadata',
      );
      prop.buildCosts.forEach(money);
      prop.tolls.forEach(money);
      money(prop.landCost + prop.buildCosts.reduce((a, b) => money(a + b), 0));
      check(
        tile.kind === 'city' &&
          map.cityGroups.some(
            (g) => g.id === tile.groupId && g.cityIds.includes(tile.id),
          ),
      );
    } else money(prop.baseToll);
  }
  check(
    Object.keys(c.properties).every((id) =>
      map.tiles.some(
        (t) => t.id === id && (t.kind === 'city' || t.kind === 'landmark'),
      ),
    ),
  );
  check(new Set(c.modifiers.map((m) => m.id)).size === c.modifiers.length);
  for (const m of c.modifiers) {
    check(
      m.id &&
        (m.kind === 'upgrade' || m.kind === 'toll') &&
        m.playerId.startsWith('player:'),
    );
    check(m.tileId === undefined || !!c.properties[m.tileId]);
    money(m.multiplierBps);
    check(m.multiplierBps <= 100000);
  }
}
export function createEconomyContext(
  board: BoardDefinition,
  profile: EconomyProfile = recommendedEconomyProfile,
  modifiers: readonly EconomyModifier[] = [],
): EconomyContext {
  const properties: Record<TileId, Property> = {};
  for (const tile of board.tiles) {
    if (tile.kind !== 'city' && tile.kind !== 'landmark') continue;
    check(tile.economy, 'missing-price');
    const seed = tile.economy;
    if (tile.kind === 'city') {
      check(tile.finalFacility?.key, 'missing-facility-metadata');
      properties[tile.id] = {
        kind: 'city',
        tileId: tile.id,
        landCost: seed.purchasePrice,
        buildCosts: [...seed.upgradeCosts],
        tolls: [...seed.tollByLevel],
        finalFacilityKey: tile.finalFacility.key,
      };
    } else {
      check(seed.upgradeCosts.length === 0 && seed.tollByLevel.length === 1);
      properties[tile.id] = {
        kind: 'landmark',
        tileId: tile.id,
        landCost: seed.purchasePrice,
        baseToll: seed.tollByLevel[0]!,
      };
    }
  }
  const c = {
    map: toMapDefinition(board),
    properties,
    catalogVersion: `${board.id}:seed-v1`,
    profile: {
      ...profile,
      unlockLaps: [...profile.unlockLaps] as typeof profile.unlockLaps,
    },
    modifiers: modifiers.map((m) => ({ ...m })),
  };
  validateContext(c);
  return c;
}
export function initializeEconomy<S extends CoreState>(
  state: S,
  c: EconomyContext,
  sessionId: string,
): S & EconomyState {
  validateContext(c);
  check(
    sessionId && state.holdings.length === 0 && !('economy' in state),
    'new-game-required',
  );
  const result = {
    ...state,
    economy: {
      schemaVersion: 1 as const,
      sessionId,
      revision: 0,
      profileId: c.profile.id,
      profileVersion: c.profile.version,
      catalogVersion: c.catalogVersion,
      configurationKey: configurationKey(c),
      completedLapsByPlayerId: Object.fromEntries(
        state.players.map((p) => [p.id, 0]),
      ),
      visitOrdinalByPlayerId: Object.fromEntries(
        state.players.map((p) => [p.id, 0]),
      ),
      developmentByTileId: {},
      landing: null,
      pendingDebt: null,
      processedCommands: {},
    },
  };
  validateEconomyState(result, c);
  return result;
}
export const facilities = ['shop', 'center', 'final'] as const;
export function validateEconomyState(s: EconomyState, c: EconomyContext): void {
  check(validMatch(s), 'invalid-match-rounds');
  validateContext(c);
  const e = s.economy;
  check(
    s.schemaVersion === 1 &&
      s.mapId === c.map.id &&
      ['setup', 'playing', 'finished'].includes(s.phase),
  );
  check(
    e.schemaVersion === 1 &&
      e.sessionId &&
      e.profileId === c.profile.id &&
      e.profileVersion === c.profile.version &&
      e.catalogVersion === c.catalogVersion,
  );
  check(e.configurationKey === configurationKey(c), 'configuration-mismatch');
  money(e.revision);
  money(s.turnNumber);
  check(
    s.players.length >= 2 &&
      s.players.length <= 4 &&
      new Set(s.players.map((p) => p.id)).size === s.players.length,
  );
  check(s.players.some((p) => p.id === s.activePlayerId));
  check(['awaiting-roll', 'awaiting-end'].includes(s.core.turnStage));
  for (const p of s.players) {
    money(p.balance);
    money(e.completedLapsByPlayerId[p.id]!);
    money(e.visitOrdinalByPlayerId[p.id]!);
    check(
      typeof p.bankrupt === 'boolean' &&
        c.map.tiles.some((t) => t.id === p.position),
    );
    if (p.bankrupt)
      check(p.balance === 0 && !s.holdings.some((h) => h.ownerId === p.id));
  }
  check(new Set(s.holdings.map((h) => h.tileId)).size === s.holdings.length);
  for (const h of s.holdings) {
    const prop = c.properties[h.tileId];
    check(prop && s.players.some((p) => p.id === h.ownerId && !p.bankrupt));
    money(h.facilityLevel);
    check(h.facilityLevel <= 3);
    const d = e.developmentByTileId[h.tileId];
    if (prop.kind === 'landmark') check(h.facilityLevel === 0 && !d);
    else {
      check(
        d &&
          d.stage === h.facilityLevel &&
          JSON.stringify(d.facilities) ===
            JSON.stringify(facilities.slice(0, d.stage)),
      );
      if (d.stage >= 2) {
        money(d.centerReadyVisitOrdinal!);
        check(
          d.centerReadyVisitOrdinal !== null &&
            d.centerReadyVisitOrdinal <= e.visitOrdinalByPlayerId[h.ownerId]!,
        );
      } else check(d.centerReadyVisitOrdinal === null);
    }
  }
  check(
    Object.keys(e.developmentByTileId).every((id) =>
      s.holdings.some((h) => h.tileId === id),
    ),
  );
  if (e.landing) {
    const l = e.landing;
    check(
      l.id &&
        l.playerId === s.activePlayerId &&
        s.players.some((p) => p.id === l.playerId && p.position === l.tileId),
    );
    check(
      l.visitOrdinal === e.visitOrdinalByPlayerId[l.playerId] &&
        l.visitOrdinal > 0 &&
        typeof l.propertyDecisionUsed === 'boolean',
    );
  }
  if (e.pendingDebt) {
    const d = e.pendingDebt;
    money(d.gross);
    money(d.amount);
    check(
      d.id &&
        e.landing?.id === d.landingId &&
        d.debtorId === s.activePlayerId &&
        d.tileId === e.landing.tileId &&
        !e.landing.propertyDecisionUsed,
    );
    check(
      d.amount <= d.gross &&
        s.players.some(
          (p) => p.id === d.debtorId && p.balance < d.amount && !p.bankrupt,
        ),
    );
    check(
      s.holdings.some(
        (h) =>
          h.tileId === d.tileId &&
          h.ownerId === d.creditorId &&
          h.ownerId !== d.debtorId,
      ),
    );
    check(typeof d.consumesBlessing === 'boolean');
    check(
      d.gross ===
        modifiedAmount(
          c,
          'toll',
          d.debtorId,
          d.tileId,
          tollBase(s, c, d.debtorId, d.tileId),
        ).amount,
    );
    const blessed = quoteBlessing(s, d.debtorId, 'toll', d.gross);
    check(
      blessed.amount === d.amount && blessed.consumed === d.consumesBlessing,
    );
  }
  if (s.legendary) {
    const r = s.legendary.rules;
    check(
      [r.tollDiscount, r.upgradeDiscount].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 1,
      ),
    );
    check(
      s.players.every((p) => {
        const x = s.legendary!.players[p.id];
        return x && typeof x.lugia === 'boolean' && typeof x.hoOh === 'boolean';
      }),
    );
  }
  check(e.processedCommands && typeof e.processedCommands === 'object');
  for (const [id, record] of Object.entries(e.processedCommands)) {
    check(
      id &&
        record.fingerprint &&
        record.receipt.sessionId === e.sessionId &&
        record.receipt.commandId === id &&
        record.receipt.revision <= e.revision,
    );
    money(record.receipt.revision);
    check(
      record.receipt.revision > 0 &&
        s.players.some((p) => p.id === record.receipt.playerId),
    );
    check(
      typeof record.receipt.ownershipChanged === 'boolean' &&
        typeof record.receipt.debtPending === 'boolean',
    );
  }
}
