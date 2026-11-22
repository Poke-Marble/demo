import { startBuildCandidates, quoteStartBuild } from './start-build.ts';
import {
  clearFinishedSkills,
  completeSkillBasicTurn,
  clearPreparedSkill,
  movementAdjustment,
  skillForPokemon,
  skillUnavailableReason,
  spendSkill,
  type SkillMode,
} from '../skills/index.ts';
import type { PlayerId, TileId } from '../contracts.ts';
import { dispatch as dispatchCore } from '../core/index.ts';
import { quoteBlessing, legalFlyDestinations } from '../legendary.ts';
import { check, facilities, money, validateEconomyState } from './catalog.ts';
import {
  decisionReasons,
  quotePreBlessingAmount,
  propertyCapital,
  quoteConstruction,
  quoteLandmark,
  quoteSale,
  quoteTakeover,
  quoteToll,
  quoteSkillUse,
} from './quotes.ts';
import type {
  Debt,
  EconomyCommand,
  EconomyContext,
  EconomyEvent,
  EconomyIntent,
  EconomyState,
  EconomyTransition,
  LegalActionSet,
  Quote,
  Receipt,
  Stage,
} from './types.ts';
export * from './types.ts';
export * from './catalog.ts';
export * from './quotes.ts';
export * from './start-build.ts';

function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${fingerprint(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
function patch<S extends EconomyState>(
  s: S,
  economy: Partial<EconomyState['economy']>,
): S {
  return { ...s, economy: { ...s.economy, ...economy } };
}
function transfer<S extends EconomyState>(
  s: S,
  from: PlayerId,
  to: PlayerId | null,
  amount: number,
): S {
  money(amount);
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === from
        ? { ...p, balance: money(p.balance - amount) }
        : p.id === to
          ? { ...p, balance: money(p.balance + amount) }
          : p,
    ),
  };
}
function consume<S extends EconomyState>(
  s: S,
  playerId: PlayerId,
  kind: 'toll' | 'upgrade',
  amount: number,
  expected: boolean,
): S {
  const result = quoteBlessing(s, playerId, kind, amount);
  check(result.consumed === expected, 'blessing-conflict');
  // Merge only the legendary patch, never replace a newer money/ownership snapshot.
  return result.state.legendary
    ? { ...s, legendary: result.state.legendary }
    : s;
}
function dropProperty<S extends EconomyState>(s: S, tileId: TileId): S {
  const development = { ...s.economy.developmentByTileId };
  delete development[tileId];
  return patch(
    { ...s, holdings: s.holdings.filter((h) => h.tileId !== tileId) },
    { developmentByTileId: development },
  );
}
function settlement<S extends EconomyState>(
  s: S,
  c: EconomyContext,
  d: Debt,
  bankrupt: boolean,
  events: EconomyEvent[],
): S {
  if (bankrupt) {
    for (const h of s.holdings.filter((h) => h.ownerId === d.debtorId)) {
      const amount = money(
        Math.floor(propertyCapital(s, c, h.tileId) * c.profile.saleRate),
      );
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === d.debtorId
            ? { ...p, balance: money(p.balance + amount) }
            : p,
        ),
      };
      s = dropProperty(s, h.tileId);
      events.push({
        type: 'property-sold',
        playerId: d.debtorId,
        tileId: h.tileId,
        amount,
      });
    }
  }
  const balance = s.players.find((p) => p.id === d.debtorId)!.balance;
  const recovered = bankrupt ? Math.min(balance, d.amount) : d.amount;
  s = consume(s, d.debtorId, 'toll', d.gross, d.consumesBlessing);
  s = clearPreparedSkill(s, d.debtorId);
  s = transfer(s, d.debtorId, d.creditorId, recovered);
  if (bankrupt) {
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === d.debtorId ? { ...p, balance: 0, bankrupt: true } : p,
      ),
    };
  }
  s = patch(s, {
    pendingDebt: null,
    landing: s.economy.landing
      ? { ...s.economy.landing, propertyDecisionUsed: bankrupt }
      : null,
  });
  events.push({
    type: 'toll-settled',
    debtorId: d.debtorId,
    creditorId: d.creditorId,
    amount: d.amount,
    recovered,
    forgiven: d.amount - recovered,
  });
  if (bankrupt) events.push({ type: 'player-bankrupt', playerId: d.debtorId });
  return s;
}
function land<S extends EconomyState>(
  s: S,
  c: EconomyContext,
  commandId: string,
  tileId: TileId,
  events: EconomyEvent[],
  allowSkill = false,
): S {
  const id = s.activePlayerId;
  const ordinal = money(s.economy.visitOrdinalByPlayerId[id]! + 1);
  const tile = c.map.tiles.find((t) => t.id === tileId)!;
  s = patch(s, {
    visitOrdinalByPlayerId: {
      ...s.economy.visitOrdinalByPlayerId,
      [id]: ordinal,
    },
    landing: {
      id: `${commandId}:landing:${ordinal}`,
      playerId: id,
      tileId,
      visitOrdinal: ordinal,
      propertyDecisionUsed: tile.kind === 'special' || tile.kind === 'start',
      skillEligible: allowSkill,
    },
  });
  const quote = quoteToll(s, c, id, tileId);
  const saving =
    allowSkill &&
    !skillUnavailableReason(s, id) &&
    !s.legendary?.pendingFly &&
    quote.total > 1 &&
    quoteSkillUse(s, c, id, tileId, 'breakthrough', 'toll').total < quote.total;
  if (saving)
    return patch(s, {
      pendingToll: { tileId, landingId: s.economy.landing!.id },
    });
  return settleLandingToll(s, c, events);
}
function settleLandingToll<S extends EconomyState>(
  s: S,
  c: EconomyContext,
  events: EconomyEvent[],
): S {
  const id = s.activePlayerId;
  const tileId = s.economy.landing!.tileId;
  s = patch(s, { pendingToll: null });
  const quote = quoteToll(s, c, id, tileId);
  const holding = s.holdings.find((h) => h.tileId === tileId);
  if (!holding || holding.ownerId === id || quote.gross === 0) return s;
  const debt: Debt = {
    id: `${s.economy.landing!.id}:debt`,
    landingId: s.economy.landing!.id,
    debtorId: id,
    creditorId: holding.ownerId,
    tileId,
    gross: quote.gross,
    amount: quote.total,
    consumesBlessing: quote.consumesBlessing,
  };
  if (s.players.find((p) => p.id === id)!.balance >= debt.amount)
    return settlement(s, c, debt, false, events);
  s = patch(s, { pendingDebt: debt });
  events.push({ type: 'debt-opened', debt });
  const assets = s.holdings
    .filter((h) => h.ownerId === id)
    .reduce(
      (a, h) =>
        money(
          a + Math.floor(propertyCapital(s, c, h.tileId) * c.profile.saleRate),
        ),
      0,
    );
  if (money(assets + s.players.find((p) => p.id === id)!.balance) < debt.amount)
    return settlement(s, c, debt, true, events);
  return s;
}
function ensureQuote(q: Quote): void {
  check(q.eligible, q.reasons[0] ?? 'ineligible');
}

/** Sole commit boundary. No UI callbacks or hooks can perform economic transactions. */
export function dispatchEconomy<S extends EconomyState>(
  original: S,
  c: EconomyContext,
  command: EconomyCommand,
): EconomyTransition<S> {
  const reject = (error: string): EconomyTransition<S> => ({
    ok: false,
    state: original,
    events: [],
    presentations: [],
    error,
  });
  try {
    validateEconomyState(original, c);
    check(command.sessionId === original.economy.sessionId, 'wrong-session');
    check(
      typeof command.commandId === 'string' &&
        command.commandId.length > 0 &&
        command.commandId.length <= 200,
      'invalid-command',
    );
    const payload = fingerprint(command);
    const previous = Object.hasOwn(
      original.economy.processedCommands,
      command.commandId,
    )
      ? original.economy.processedCommands[command.commandId]
      : undefined;
    if (previous) {
      check(previous.fingerprint === payload, 'duplicate-command-conflict');
      return {
        ok: true,
        state: original,
        events: [],
        presentations: [],
        receipt: previous.receipt,
        replayed: true,
      };
    }
    check(
      command.expectedRevision === original.economy.revision,
      'stale-revision',
    );
    check(original.phase === 'playing', 'game-not-playing');
    check(
      !original.match ||
        original.match.completedRounds < original.match.roundLimit ||
        !!original.economy.pendingDebt ||
        !!original.economy.pendingToll ||
        !!original.economy.pendingStartBuild ||
        !!original.core.pendingDice,
      'round-limit-reached',
    );
    const actor = original.players.find((p) => p.id === command.playerId);
    check(
      actor && !actor.bankrupt && actor.id === original.activePlayerId,
      'wrong-player',
    );
    let intent = command.intent;
    check(intent && typeof intent.type === 'string', 'invalid-command');
    let s = original;
    const events: EconomyEvent[] = [];
    let presentations: NonNullable<
      Extract<EconomyTransition, { ok: true }>['presentations']
    > = [];
    let quote: Quote | null = null;
    const pending = s.economy.pendingDebt;
    if (pending) {
      check(
        intent.type === 'sell-property' || intent.type === 'declare-bankruptcy',
        'debt-pending',
      );
      check(intent.debtId === pending.id, 'wrong-debt');
    } else
      check(
        intent.type !== 'declare-bankruptcy' &&
          !(intent.type === 'sell-property' && intent.debtId),
        'wrong-debt',
      );
    if (s.economy.pendingToll) {
      check(
        (intent.type === 'pay-toll' || intent.type === 'use-skill') &&
          intent.landingId === s.economy.pendingToll.landingId,
        'toll-decision-required',
      );
    }
    const startBuild = s.economy.pendingStartBuild;
    if (startBuild) {
      check(
        (intent.type === 'start-build' || intent.type === 'skip-start-build') &&
          intent.opportunityId === startBuild.id,
        'start-build-decision-required',
      );
    }
    if (intent.type === 'use-skill') {
      check(
        !pending &&
          !skillUnavailableReason(s, actor.id) &&
          s.economy.landing?.skillEligible !== false,
        'skill-unavailable',
      );
      check(
        intent.landingId === s.economy.landing?.id &&
          intent.tileId === s.economy.landing.tileId,
        'wrong-landing',
      );
      check(
        intent.mode === 'signature' || intent.mode === 'breakthrough',
        'invalid-skill-mode',
      );
      const kind = s.economy.pendingToll ? 'toll' : 'takeover';
      check(
        kind === 'toll'
          ? intent.mode === 'breakthrough' ||
              skillForPokemon(actor.pokemonId)?.type === 'fire'
          : intent.mode === 'signature' &&
              skillForPokemon(actor.pokemonId)?.type === 'electric',
        'invalid-skill-mode',
      );
      const q = quoteSkillUse(s, c, actor.id, intent.tileId, intent.mode, kind);
      const base =
        kind === 'toll'
          ? quoteToll(s, c, actor.id, intent.tileId)
          : quoteTakeover(s, c, actor.id, intent.tileId);
      check(
        q.eligible && q.total < base.total,
        q.reasons[0] ?? 'no-skill-saving',
      );
      s = spendSkill(s, actor.id, {
        mode: intent.mode,
        tileId: intent.tileId,
        kind,
      });
      const definition = skillForPokemon(actor.pokemonId)!;
      events.push({
        type: 'skill-activated',
        activation: {
          id: `${command.sessionId}:${command.commandId}:skill`,
          pokemonId: actor.pokemonId,
          type: definition.type,
          name: intent.mode === 'breakthrough' ? '기술돌파' : definition.name,
          description: `1PP · ${base.total - q.total} ₽ 절약`,
          playerId: actor.id,
          mode: intent.mode,
          skillSavings: base.total - q.total,
        },
      });
      if (kind === 'takeover')
        intent = {
          type: 'takeover-property',
          tileId: intent.tileId,
          landingId: intent.landingId,
        };
    }
    if (
      [
        'construct-property',
        'buy-landmark',
        'takeover-property',
        'pass-property',
      ].includes(intent.type)
    ) {
      check(
        'landingId' in intent && typeof intent.landingId === 'string',
        'wrong-landing',
      );
      check(intent.landingId === s.economy.landing?.id, 'wrong-landing');
      check('tileId' in intent, 'wrong-landing');
      const reasons = decisionReasons(s, actor.id, intent.tileId);
      check(reasons.length === 0, reasons[0]);
    }
    if (
      intent.type === 'construct-property' ||
      intent.type === 'buy-landmark' ||
      intent.type === 'takeover-property'
    ) {
      quote =
        intent.type === 'construct-property'
          ? quoteConstruction(s, c, actor.id, intent.tileId, intent.targetStage)
          : intent.type === 'buy-landmark'
            ? quoteLandmark(s, c, actor.id, intent.tileId)
            : quoteTakeover(s, c, actor.id, intent.tileId);
      ensureQuote(quote);
      const old = s.holdings.find((h) => h.tileId === intent.tileId);
      if (intent.type === 'construct-property') {
        const amount = quotePreBlessingAmount(
          s,
          c,
          actor.id,
          intent.tileId,
          'upgrade',
          quote.upgradeSubtotal,
        ).amount;
        s = consume(s, actor.id, 'upgrade', amount, quote.consumesBlessing);
      }
      s = transfer(
        s,
        actor.id,
        intent.type === 'takeover-property' ? old!.ownerId : null,
        quote.total,
      );
      const stage =
        intent.type === 'construct-property'
          ? intent.targetStage
          : (old?.facilityLevel ?? 0);
      s = {
        ...s,
        holdings: [
          ...s.holdings.filter((h) => h.tileId !== intent.tileId),
          { tileId: intent.tileId, ownerId: actor.id, facilityLevel: stage },
        ],
      };
      if (c.properties[intent.tileId]!.kind === 'city') {
        const oldDevelopment = s.economy.developmentByTileId[intent.tileId];
        s = patch(s, {
          developmentByTileId: {
            ...s.economy.developmentByTileId,
            [intent.tileId]: {
              stage: stage as Stage,
              facilities: facilities.slice(0, stage),
              centerReadyVisitOrdinal:
                stage < 2
                  ? null
                  : intent.type === 'takeover-property' ||
                      !oldDevelopment ||
                      oldDevelopment.stage < 2
                    ? s.economy.landing!.visitOrdinal
                    : oldDevelopment.centerReadyVisitOrdinal,
            },
          },
        });
      }
      s = patch(s, {
        landing: { ...s.economy.landing!, propertyDecisionUsed: true },
      });
      if (!old || old.ownerId !== actor.id)
        events.push({
          type: 'city-acquired',
          playerId: actor.id,
          tileId: intent.tileId,
        });
      if (stage > (old?.facilityLevel ?? 0))
        events.push({
          type: 'facility-upgraded',
          tileId: intent.tileId,
          level: stage,
        });
      s = clearPreparedSkill(s, actor.id);
    } else if (intent.type === 'start-build') {
      check(
        startBuild && intent.opportunityId === startBuild.id,
        'wrong-start-build',
      );
      quote = quoteStartBuild(
        s,
        c,
        actor.id,
        intent.tileId,
        intent.opportunityId,
      );
      check(intent.quoteId === quote.quoteId, 'wrong-quote');
      ensureQuote(quote);
      const stage = quote.toStage!;
      const oldDevelopment = s.economy.developmentByTileId[intent.tileId]!;
      const amount = quotePreBlessingAmount(
        s,
        c,
        actor.id,
        intent.tileId,
        'upgrade',
        quote.upgradeSubtotal,
      ).amount;
      s = consume(s, actor.id, 'upgrade', amount, quote.consumesBlessing);
      s = transfer(s, actor.id, null, quote.total);
      s = patch(
        {
          ...s,
          holdings: s.holdings.map((h) =>
            h.tileId === intent.tileId ? { ...h, facilityLevel: stage } : h,
          ),
        },
        {
          pendingStartBuild: null,
          developmentByTileId: {
            ...s.economy.developmentByTileId,
            [intent.tileId]: {
              stage,
              facilities: facilities.slice(0, stage),
              centerReadyVisitOrdinal:
                stage === 2
                  ? s.economy.landing!.visitOrdinal
                  : oldDevelopment.centerReadyVisitOrdinal,
            },
          },
        },
      );
      events.push({
        type: 'facility-upgraded',
        tileId: intent.tileId,
        level: stage,
      });
    } else if (intent.type === 'skip-start-build') {
      check(
        startBuild && intent.opportunityId === startBuild.id,
        'wrong-start-build',
      );
      s = patch(s, { pendingStartBuild: null });
    } else if (intent.type === 'pay-toll' || intent.type === 'use-skill') {
      check(
        s.economy.pendingToll &&
          intent.landingId === s.economy.pendingToll.landingId,
        'wrong-toll',
      );
      quote = quoteToll(s, c, actor.id, s.economy.pendingToll.tileId);
      s = settleLandingToll(s, c, events);
    } else if (intent.type === 'pass-property') {
      s = patch(s, {
        landing: { ...s.economy.landing!, propertyDecisionUsed: true },
      });
    } else if (intent.type === 'sell-property') {
      quote = quoteSale(s, c, actor.id, intent.tileId);
      ensureQuote(quote);
      s = dropProperty(s, intent.tileId);
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === actor.id
            ? { ...p, balance: money(p.balance + quote!.total) }
            : p,
        ),
      };
      if (s.economy.landing?.tileId === intent.tileId)
        s = patch(s, {
          landing: { ...s.economy.landing, propertyDecisionUsed: true },
        });
      events.push({
        type: 'property-sold',
        playerId: actor.id,
        tileId: intent.tileId,
        amount: quote.total,
      });
      if (
        pending &&
        s.players.find((p) => p.id === actor.id)!.balance >= pending.amount
      )
        s = settlement(s, c, pending, false, events);
    } else if (intent.type === 'declare-bankruptcy') {
      check(pending, 'wrong-debt');
      s = settlement(s, c, pending, true, events);
    } else {
      // Legacy economic actions must use an explicit target and landing token.
      check(
        intent.type !== 'buy-city' && intent.type !== 'upgrade-facility',
        'explicit-economy-intent-required',
      );
      check(
        'playerId' in intent && intent.playerId === actor.id,
        'wrong-player',
      );
      if (intent.type === 'end-turn')
        check(
          !s.economy.landing || s.economy.landing.propertyDecisionUsed,
          'property-decision-required',
        );
      if (intent.type === 'resolve-dice' && intent.adjustment !== 0) {
        check(
          !skillUnavailableReason(s, actor.id) &&
            intent.adjustment === movementAdjustment(s, actor.id),
          'skill-unavailable',
        );
      }
      const result = dispatchCore(s, c.map, intent);
      check(result.ok, result.ok ? undefined : result.error);
      s = { ...s, ...result.state, economy: s.economy };
      if (intent.type === 'resolve-dice' && intent.adjustment !== 0) {
        const definition = skillForPokemon(actor.pokemonId)!;
        events.push({
          type: 'skill-activated',
          activation: {
            id: `${command.sessionId}:${command.commandId}:skill`,
            pokemonId: actor.pokemonId,
            type: definition.type,
            name: definition.name,
            description: `1PP · 이동 합계 ${intent.adjustment > 0 ? '+1' : '-1'}`,
            playerId: actor.id,
            mode: 'signature',
            skillSavings: 0,
          },
        });
      }
      events.push(...result.events);
      presentations = result.presentations ?? [];
      if (intent.type === 'end-turn') s = patch(s, { landing: null });
      for (const event of result.events) {
        if (event.type === 'start-rewarded')
          s = patch(s, {
            completedLapsByPlayerId: {
              ...s.economy.completedLapsByPlayerId,
              [event.playerId]: money(
                s.economy.completedLapsByPlayerId[event.playerId]! +
                  event.passes,
              ),
            },
          });
        if (event.type === 'tile-landed')
          s = land(
            s,
            c,
            command.commandId,
            event.tileId,
            events,
            intent.type === 'roll-dice' || intent.type === 'resolve-dice',
          );
      }
      if (
        (intent.type === 'roll-dice' || intent.type === 'resolve-dice') &&
        result.events.some((e) => e.type === 'dice-rolled') &&
        s.economy.landing &&
        c.map.tiles.find((t) => t.id === s.economy.landing!.tileId)?.kind ===
          'start'
      ) {
        s = patch(s, {
          pendingStartBuild: {
            id: `${command.commandId}:start-build`,
            playerId: actor.id,
            landingId: s.economy.landing.id,
          },
        });
        if (!startBuildCandidates(s, c, actor.id).length)
          s = patch(s, { pendingStartBuild: null });
      }
    }
    // A bankrupt actor cannot supply another action; core advances to the next survivor.
    if (s.players.find((p) => p.id === s.activePlayerId)!.bankrupt) {
      const ended = dispatchCore(s, c.map, {
        type: 'end-turn',
        playerId: s.activePlayerId,
      });
      check(ended.ok, 'bankruptcy-turn-failed');
      s = patch(
        { ...s, ...ended.state, economy: s.economy },
        { landing: null },
      );
      events.push(...ended.events);
    }
    for (const event of events)
      if (event.type === 'turn-ended')
        s = completeSkillBasicTurn(s, event.playerId, original.turnNumber);
    s = clearFinishedSkills(s);
    const revision = money(s.economy.revision + 1);
    const ownership = (state: EconomyState) =>
      fingerprint(
        Object.fromEntries(state.holdings.map((h) => [h.tileId, h.ownerId])),
      );
    const ownershipChanged = ownership(s) !== ownership(original);
    const receipt: Receipt = {
      sessionId: s.economy.sessionId,
      commandId: command.commandId,
      revision,
      playerId: actor.id,
      intentType: command.intent.type,
      quote,
      ownershipChanged,
      debtPending: !!s.economy.pendingDebt,
    };
    s = patch(s, {
      revision,
      processedCommands: {
        ...s.economy.processedCommands,
        [command.commandId]: { fingerprint: payload, receipt },
      },
    });
    validateEconomyState(s, c);
    events.push({ type: 'economy-committed', receipt });
    return {
      ok: true,
      state: s,
      events,
      presentations,
      receipt,
      replayed: false,
    };
  } catch (error) {
    return reject(
      error instanceof RangeError ? error.message : 'invalid-state',
    );
  }
}

/** Validate a supplied receipt against the committed session ledger before ability follow-up. */
export function verifyCommittedReceipt(
  s: EconomyState,
  c: EconomyContext,
  receipt: Receipt,
): boolean {
  try {
    validateEconomyState(s, c);
    const record = Object.hasOwn(s.economy.processedCommands, receipt.commandId)
      ? s.economy.processedCommands[receipt.commandId]
      : undefined;
    return !!record && fingerprint(record.receipt) === fingerprint(receipt);
  } catch {
    return false;
  }
}

/** Catalog valuation, not a victory criterion. */
export function assetValue(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
): number {
  validateEconomyState(s, c);
  const player = s.players.find((p) => p.id === playerId);
  check(player, 'wrong-player');
  return s.holdings
    .filter((h) => h.ownerId === playerId)
    .reduce(
      (total, h) =>
        money(
          total +
            Math.floor(propertyCapital(s, c, h.tileId) * c.profile.saleRate),
        ),
      player.balance,
    );
}

export function getLegalActions(
  s: EconomyState,
  c: EconomyContext,
  playerId: PlayerId,
): LegalActionSet {
  const actions: { actionKey: string; intent: EconomyIntent; quote?: Quote }[] =
    [];
  const inactive: LegalActionSet = {
    revision: s.economy.revision,
    playerId,
    phase: 'inactive',
    actions: [],
  };
  try {
    validateEconomyState(s, c);
    const actor = s.players.find((p) => p.id === playerId);
    if (
      s.phase !== 'playing' ||
      s.activePlayerId !== playerId ||
      !actor ||
      actor.bankrupt
    )
      return inactive;
    const add = (intent: EconomyIntent, quote?: Quote) => {
      if (!quote || quote.eligible)
        actions.push({
          actionKey: fingerprint(intent),
          intent,
          ...(quote ? { quote } : {}),
        });
    };
    const startBuild = s.economy.pendingStartBuild;
    if (startBuild) {
      for (const q of startBuildCandidates(s, c, playerId))
        add(
          {
            type: 'start-build',
            opportunityId: startBuild.id,
            tileId: q.tileId,
            quoteId: q.quoteId,
          },
          q,
        );
      add({ type: 'skip-start-build', opportunityId: startBuild.id });
      return {
        revision: s.economy.revision,
        playerId,
        phase: 'choosing-start-build',
        actions,
      };
    }
    const toll = s.economy.pendingToll;
    if (toll) {
      add(
        { type: 'pay-toll', landingId: toll.landingId },
        quoteToll(s, c, playerId, toll.tileId),
      );
      if (!skillUnavailableReason(s, playerId)) {
        const modes: SkillMode[] =
          skillForPokemon(actor.pokemonId)?.type === 'fire'
            ? ['signature', 'breakthrough']
            : ['breakthrough'];
        for (const mode of modes) {
          const q = quoteSkillUse(s, c, playerId, toll.tileId, mode, 'toll');
          if (q.total < quoteToll(s, c, playerId, toll.tileId).total)
            add(
              {
                type: 'use-skill',
                mode,
                tileId: toll.tileId,
                landingId: toll.landingId,
              },
              q,
            );
        }
      }
      return { revision: s.economy.revision, playerId, phase: 'core', actions };
    }
    if (s.core.pendingDice) {
      add({ type: 'resolve-dice', playerId, adjustment: 0 });
      const adjustment = movementAdjustment(s, playerId);
      const sum = s.core.pendingDice.values[0] + s.core.pendingDice.values[1];
      if (
        adjustment !== null &&
        sum + adjustment >= 2 &&
        sum + adjustment <= 12
      )
        add({ type: 'resolve-dice', playerId, adjustment });
      return { revision: s.economy.revision, playerId, phase: 'core', actions };
    }
    const debt = s.economy.pendingDebt;
    if (debt) add({ type: 'declare-bankruptcy', debtId: debt.id });
    for (const h of s.holdings.filter((h) => h.ownerId === playerId))
      add(
        {
          type: 'sell-property',
          tileId: h.tileId,
          ...(debt ? { debtId: debt.id } : {}),
        },
        quoteSale(s, c, playerId, h.tileId),
      );
    if (debt)
      return {
        revision: s.economy.revision,
        playerId,
        phase: 'liquidating',
        actions,
      };
    const trial = s.legendary?.players[playerId]?.trial;
    if (trial) {
      if (trial.lastAttemptTurn !== s.turnNumber)
        add({ type: 'attempt-trial', playerId });
      if (s.legendary!.players[playerId]!.ropes > 0)
        add({ type: 'use-escape-rope', playerId });
      if (trial.lastAttemptTurn === s.turnNumber)
        add({ type: 'end-turn', playerId });
      return { revision: s.economy.revision, playerId, phase: 'core', actions };
    }
    if (s.legendary?.pendingFly) {
      legalFlyDestinations(s, c.map).forEach((to) =>
        add({ type: 'fly', playerId, to }),
      );
      return { revision: s.economy.revision, playerId, phase: 'core', actions };
    }
    if (s.core.turnStage === 'awaiting-roll')
      add({ type: 'roll-dice', playerId });
    else {
      const l = s.economy.landing;
      if (l && !l.propertyDecisionUsed) {
        const prop = c.properties[l.tileId]!;
        const h = s.holdings.find((h) => h.tileId === l.tileId);
        if (!h || h.ownerId === playerId) {
          if (prop.kind === 'city')
            for (const stage of [0, 1, 2, 3] as const)
              add(
                {
                  type: 'construct-property',
                  tileId: l.tileId,
                  targetStage: stage,
                  landingId: l.id,
                },
                quoteConstruction(s, c, playerId, l.tileId, stage),
              );
          else if (!h)
            add(
              { type: 'buy-landmark', tileId: l.tileId, landingId: l.id },
              quoteLandmark(s, c, playerId, l.tileId),
            );
        } else
          add(
            { type: 'takeover-property', tileId: l.tileId, landingId: l.id },
            quoteTakeover(s, c, playerId, l.tileId),
          );
        if (
          l.skillEligible !== false &&
          !skillUnavailableReason(s, playerId) &&
          skillForPokemon(actor.pokemonId)?.type === 'electric' &&
          h &&
          h.ownerId !== playerId &&
          prop.kind === 'city' &&
          h.facilityLevel < 3
        ) {
          const q = quoteSkillUse(
            s,
            c,
            playerId,
            l.tileId,
            'signature',
            'takeover',
          );
          if (q.total < quoteTakeover(s, c, playerId, l.tileId).total)
            add(
              {
                type: 'use-skill',
                mode: 'signature',
                tileId: l.tileId,
                landingId: l.id,
              },
              q,
            );
        }
        add({ type: 'pass-property', tileId: l.tileId, landingId: l.id });
        return {
          revision: s.economy.revision,
          playerId,
          phase: 'choosing-property',
          actions,
        };
      }
      add({ type: 'end-turn', playerId });
    }
    return { revision: s.economy.revision, playerId, phase: 'core', actions };
  } catch {
    return inactive;
  }
}
