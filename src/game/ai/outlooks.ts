import {
  dispatchEconomy,
  getLegalActions,
  quoteToll,
  tollBase,
  type EconomyState,
  type EconomyContext,
  type EconomyIntent,
  type LegalActionSet,
} from '../economy/index.ts';
import { evaluateVictory } from '../victory/index.ts';
import type { PlayerId, TileId } from '../contracts.ts';
import {
  STANDARD,
  type Snapshot,
  type Candidate,
  type ActionKind,
} from './contracts.ts';
import { rankCandidates } from './planner.ts';

/** Projection inputs have no RNG, future dice, receipts or presentation state. */
export type PublicState = Pick<
  EconomyState,
  | 'schemaVersion'
  | 'mapId'
  | 'phase'
  | 'players'
  | 'activePlayerId'
  | 'turnNumber'
  | 'holdings'
  | 'victory'
  | 'legendary'
  | 'worldEvents'
  | 'match'
  | 'skills'
> & {
  readonly core: Pick<
    EconomyState['core'],
    'turnStage' | 'rules' | 'pendingDice'
  >;
  readonly economy: Omit<EconomyState['economy'], 'processedCommands'>;
};
type Legal = LegalActionSet['actions'][number];
const kinds: Partial<Record<EconomyIntent['type'], ActionKind>> = {
  'roll-dice': 'roll',
  'resolve-dice': 'resolve-dice',
  'pay-toll': 'pay-toll',
  'use-skill': 'pay-toll',
  'end-turn': 'end-turn',
  'construct-property': 'build',
  'start-build': 'build',
  'skip-start-build': 'pass',
  'buy-landmark': 'buy',
  'takeover-property': 'takeover',
  'sell-property': 'sell',
  'declare-bankruptcy': 'bankrupt',
  'pass-property': 'pass',
  'attempt-trial': 'trial',
  'use-escape-rope': 'rope',
  fly: 'fly',
};
const heuristic = (value: number) => ({ value, source: 'heuristic' as const });
const authority = (value: number) => ({ value, source: 'authority' as const });

/** Explicit allowlist: never spread/read the authority core or command history. */
function projection(s: PublicState): EconomyState {
  const e = s.economy;
  return {
    schemaVersion: s.schemaVersion,
    mapId: s.mapId,
    phase: s.phase,
    players: s.players,
    activePlayerId: s.activePlayerId,
    turnNumber: s.turnNumber,
    holdings: s.holdings,
    victory: s.victory,
    ...(s.legendary ? { legendary: s.legendary } : {}),
    ...(s.worldEvents ? { worldEvents: s.worldEvents } : {}),
    ...(s.match ? { match: s.match } : {}),
    ...(s.skills ? { skills: s.skills } : {}),
    // Required by the quote contract only. Never dispatch a random action here.
    core: {
      turnStage: s.core.turnStage,
      rules: s.core.rules,
      rngState: 0,
      ...(s.core.pendingDice ? { pendingDice: s.core.pendingDice } : {}),
    },
    economy: {
      schemaVersion: e.schemaVersion,
      sessionId: e.sessionId,
      revision: e.revision,
      profileId: e.profileId,
      profileVersion: e.profileVersion,
      catalogVersion: e.catalogVersion,
      configurationKey: e.configurationKey,
      completedLapsByPlayerId: e.completedLapsByPlayerId,
      visitOrdinalByPlayerId: e.visitOrdinalByPlayerId,
      developmentByTileId: e.developmentByTileId,
      landing: e.landing,
      pendingDebt: e.pendingDebt,
      ...(e.pendingStartBuild
        ? { pendingStartBuild: e.pendingStartBuild }
        : {}),
      ...(e.pendingToll ? { pendingToll: e.pendingToll } : {}),
      processedCommands: {},
    },
  };
}

function investment(a: Legal) {
  return (
    (a.intent.type === 'use-skill' && a.quote?.kind === 'takeover') ||
    [
      'construct-property',
      'start-build',
      'buy-landmark',
      'takeover-property',
    ].includes(a.intent.type)
  );
}

/** Deterministic commands only; neither roll nor trial is ever simulated. */
function apply(
  s: EconomyState,
  c: EconomyContext,
  a: Legal,
): EconomyState | null {
  if (
    !investment(a) &&
    !['fly', 'resolve-dice', 'pay-toll', 'use-skill'].includes(a.intent.type)
  )
    return null;
  const result = dispatchEconomy(s, c, {
    sessionId: s.economy.sessionId,
    expectedRevision: s.economy.revision,
    commandId: `outlook:${s.economy.revision}`,
    playerId: s.activePlayerId,
    intent: a.intent,
  });
  return result.ok ? result.state : null;
}

function wins(s: EconomyState, c: EconomyContext, id: PlayerId): boolean {
  const result = evaluateVictory(s, c.map, { actorId: id });
  return result.ok && result.victory?.winnerId === id;
}

/** An affordable one-property threat, explicitly not a forecast of rival movement. */
function threatens(
  s: EconomyState,
  c: EconomyContext,
  tileId: TileId,
): boolean {
  return s.players.some((p) => {
    if (p.id === s.activePlayerId || p.bankrupt) return false;
    const existing = s.holdings.find((h) => h.tileId === tileId);
    if (
      existing?.ownerId === p.id ||
      !wins(
        {
          ...s,
          holdings: [
            ...s.holdings.filter((h) => h.tileId !== tileId),
            {
              tileId,
              ownerId: p.id,
              facilityLevel: existing?.facilityLevel ?? 0,
            },
          ],
        },
        c,
        p.id,
      )
    )
      return false;
    const ordinal = s.economy.visitOrdinalByPlayerId[p.id]! + 1;
    const rival: EconomyState = {
      ...s,
      activePlayerId: p.id,
      players: s.players.map((n) =>
        n.id === p.id ? { ...n, position: tileId } : n,
      ),
      core: { ...s.core, turnStage: 'awaiting-end' },
      ...(s.legendary
        ? {
            legendary: {
              ...s.legendary,
              pendingFly: null,
              players: {
                ...s.legendary.players,
                [p.id]: { ...s.legendary.players[p.id]!, trial: null },
              },
            },
          }
        : {}),
      economy: {
        ...s.economy,
        pendingDebt: null,
        visitOrdinalByPlayerId: {
          ...s.economy.visitOrdinalByPlayerId,
          [p.id]: ordinal,
        },
        landing: {
          id: 'outlook:rival',
          playerId: p.id,
          tileId,
          visitOrdinal: ordinal,
          propertyDecisionUsed: false,
        },
      },
    };
    return getLegalActions(rival, c, p.id).actions.some((a) => {
      if (!investment(a)) return false;
      const next = apply(rival, c, a);
      return next !== null && wins(next, c, p.id);
    });
  });
}

export function publicSnapshot(
  input: PublicState,
  context: EconomyContext,
  controllers: readonly {
    readonly id: string;
    readonly controller: 'human' | 'computer';
  }[],
): Snapshot<EconomyIntent> {
  const s = projection(input);
  const id = s.activePlayerId;
  const base = (state: EconomyState): Snapshot<EconomyIntent> => ({
    session: state.economy.sessionId,
    turn: String(state.turnNumber),
    revision: String(state.economy.revision),
    phase: state.phase === 'playing' ? 'playing' : 'finished',
    activePlayerId: state.activePlayerId,
    players: state.players.map((p) => ({
      id: p.id,
      bankrupt: p.bankrupt,
      controller: controllers.find((n) => n.id === p.id)!.controller,
    })),
    cash: state.players.find((p) => p.id === state.activePlayerId)!.balance,
    debt: state.economy.pendingDebt?.amount ?? 0,
    expectedToll: authority(
      Math.max(
        0,
        ...state.holdings
          .filter((h) => h.ownerId !== state.activePlayerId)
          .map(
            (h) =>
              quoteToll(state, context, state.activePlayerId, h.tileId).total,
          ),
      ),
    ),
    properties: Object.keys(context.properties).map((tileId) => ({
      id: tileId,
      ownerId: state.holdings.find((h) => h.tileId === tileId)?.ownerId ?? null,
    })),
    collections: [
      ...context.map.cityGroups.map((g) => ({
        id: g.id,
        kind: 'group' as const,
        propertyIds: g.cityIds,
      })),
      ...(['south', 'west', 'north', 'east'] as const).map((side) => ({
        id: side,
        kind: 'line' as const,
        propertyIds: context.map.tiles
          .filter((t) => t.kind === 'city' && t.side === side)
          .map((t) => t.id),
      })),
      {
        id: 'landmarks',
        kind: 'four-landmarks',
        propertyIds: context.map.tiles
          .filter((t) => t.kind === 'landmark')
          .map((t) => t.id),
      },
    ],
    candidates: [],
    ...(state.core.pendingDice
      ? { diceResult: state.core.pendingDice.values }
      : {}),
  });
  const threats = new Map<string, boolean>();
  const candidate = (
    state: EconomyState,
    a: Legal,
  ): Candidate<EconomyIntent> => {
    const targetId = 'tileId' in a.intent ? a.intent.tileId : undefined;
    const next = investment(a) ? apply(state, context, a) : null;
    const visitor = state.players.find((p) => p.id !== id && !p.bankrupt);
    // Marginal income for upgrades; a full existing toll is not new income.
    const income =
      next && targetId && visitor
        ? Math.max(
            0,
            tollBase(next, context, visitor.id, targetId) -
              (state.holdings.some(
                (h) => h.tileId === targetId && h.ownerId === id,
              )
                ? tollBase(state, context, visitor.id, targetId)
                : 0),
          )
        : 0;
    if (next && targetId && !threats.has(targetId))
      threats.set(targetId, threatens(s, context, targetId));
    return {
      id: a.actionKey,
      kind:
        a.intent.type === 'use-skill' && investment(a)
          ? 'takeover'
          : a.intent.type === 'construct-property' &&
              a.quote?.fromStage === null
            ? 'buy'
            : kinds[a.intent.type]!,
      action: a.intent,
      ...(targetId ? { targetId } : {}),
      quote: {
        debit: a.quote && a.intent.type !== 'sell-property' ? a.quote.total : 0,
        credit: a.intent.type === 'sell-property' ? a.quote!.total : 0,
      },
      outlook: {
        // Scarce PP is held for meaningful savings or positional gains. This is
        // strategy utility, not a discount rate or an extra game resource rule.
        resourceCost: heuristic(
          a.intent.type === 'use-skill' ||
            (a.intent.type === 'resolve-dice' && a.intent.adjustment !== 0)
            ? 60 / Math.max(1, state.skills?.players[id]?.pp ?? 1)
            : 0,
        ),
        income: heuristic(income),
        immediateWin: next ? wins(next, context, id) : false,
        blocksMonopolyThreat:
          !!next &&
          !!targetId &&
          next.holdings.some(
            (h) => h.tileId === targetId && h.ownerId === id,
          ) &&
          !state.holdings.some(
            (h) => h.tileId === targetId && h.ownerId === id,
          ) &&
          threats.get(targetId) === true,
      },
    };
  };
  const snapshot = base(s);
  const special = s.legendary?.players[id];
  const trial = special?.trial;
  const probability =
    trial && s.legendary
      ? trial.attempts + 1 >= s.legendary.rules.guaranteedAttempt
        ? 1
        : s.legendary.rules.successChance
      : 0;
  // One visit/turn heuristic, without predicting a die roll. More alternatives raise the cost of staying.
  const movementValue =
    STANDARD.lostTurnCost +
    Object.values(context.properties).filter(
      (p) => !s.holdings.some((h) => h.tileId === p.tileId),
    ).length *
      4;
  return {
    ...snapshot,
    candidates: getLegalActions(s, context, id).actions.map((a) => {
      const result = candidate(s, a);
      if (
        a.intent.type === 'attempt-trial' ||
        a.intent.type === 'use-escape-rope'
      )
        return {
          ...result,
          outlook: {
            ...result.outlook,
            trialSuccessProbability: probability,
            trialReward: heuristic(STANDARD.trialReward),
            lostTurnCost: heuristic(movementValue),
            ropeValue: heuristic(
              STANDARD.ropeValue / Math.max(1, special?.ropes ?? 1),
            ),
          },
        };
      if (a.intent.type !== 'fly' && a.intent.type !== 'resolve-dice')
        return result;
      let landed = apply(s, context, a);
      if (!landed) return result;
      const to =
        a.intent.type === 'fly'
          ? a.intent.to
          : landed.players.find((p) => p.id === id)!.position;
      let toll = quoteToll(s, context, id, to).total;
      let resourceCost = result.outlook!.resourceCost!.value;
      const startCredit = Math.max(
        0,
        landed.players.find((p) => p.id === id)!.balance -
          snapshot.cash +
          (landed.economy.pendingToll ? 0 : toll),
      );
      // A revealed normal move may open a mandatory toll choice. Evaluate its
      // actual legal alternatives before the destination's property decision.
      if (landed.economy.pendingToll) {
        const payments = rankCandidates(
          {
            ...base(landed),
            players: snapshot.players.map((p) =>
              p.id === id ? { ...p, controller: 'computer' } : p,
            ),
            candidates: getLegalActions(landed, context, id).actions.map((n) =>
              candidate(landed!, n),
            ),
          },
          0,
        );
        const payment = payments[0];
        const legalPayment =
          payment &&
          getLegalActions(landed, context, id).actions.find(
            (n) => n.actionKey === payment.candidate.id,
          );
        const paid = legalPayment && apply(landed, context, legalPayment);
        if (paid) {
          landed = paid;
          toll = payment!.candidate.quote.debit;
          resourceCost += payment!.candidate.outlook?.resourceCost?.value ?? 0;
        }
      }
      // Debt liquidation is an emergency cost, never destination utility.
      if (
        landed.economy.pendingDebt ||
        landed.activePlayerId !== id ||
        landed.players.find((p) => p.id === id)!.bankrupt
      )
        return {
          ...result,
          targetId: to,
          outlook: {
            destinationValue: heuristic(0),
            tollExposure: authority(toll),
            resourceCost: heuristic(resourceCost),
          },
        };
      const followups = getLegalActions(landed, context, id).actions.map((n) =>
        candidate(landed, n),
      );
      // Force the local controller for evaluation; the returned flight remains the original legal action.
      const evaluated = rankCandidates(
        {
          ...base(landed),
          players: snapshot.players.map((p) =>
            p.id === id ? { ...p, controller: 'computer' } : p,
          ),
          candidates: followups,
        },
        0,
      );
      const best = evaluated[0];
      return {
        ...result,
        targetId: to,
        outlook: {
          destinationValue: heuristic(
            startCredit + Math.max(0, best?.score ?? 0),
          ),
          tollExposure: authority(toll),
          resourceCost: heuristic(resourceCost),
          immediateWin: best?.candidate.outlook?.immediateWin ?? false,
          // Follow-up score already contains the defense bonus; do not count it twice.
        },
      };
    }),
  };
}
