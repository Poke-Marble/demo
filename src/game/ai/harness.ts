import type { ActionKind, Candidate, Snapshot } from './contracts.ts';
import { createExecutor } from './executor.ts';
import { createCandidateAdapter } from './adapter.ts';

type FixtureAction = { readonly kind: ActionKind; readonly target?: string };
const candidate = (
  id: string,
  kind: ActionKind,
  debit = 0,
  credit = 0,
  target?: string,
): Candidate<FixtureAction> => ({
  id,
  kind,
  action: { kind, ...(target ? { target } : {}) },
  quote: { debit, credit },
  ...(target ? { targetId: target } : {}),
});

/** Scripted test authority, not an implementation of economy/trial/victory rules. */
export async function runSimulation(seed = 42) {
  const players = ['human', 'cpu-1', 'cpu-2', 'cpu-3'].map((id, index) => ({
    id,
    controller: index === 0 ? ('human' as const) : ('computer' as const),
    bankrupt: false,
  }));
  const trace: { playerId: string; kind: ActionKind; cash: number }[] = [];
  const stops: string[] = [];
  // Each computer gets a full scripted decision sequence. Only external fixture
  // authority changes balances, resolves dice, and supplies subsequent candidates.
  for (const player of players) {
    let step = 0;
    let revision = 0;
    let cash = 1600;
    let debt = 0;
    let properties: Snapshot<FixtureAction>['properties'] = [
      { id: 'a', ownerId: null },
      { id: 'b', ownerId: 'rival' },
    ];
    const frames: readonly (readonly Candidate<FixtureAction>[])[] = [
      [candidate('roll', 'roll')],
      [
        {
          ...candidate('buy', 'buy', 180, 0, 'a'),
          outlook: { income: { value: 80, source: 'heuristic' } },
        },
        candidate('skip', 'pass'),
      ],
      [
        {
          ...candidate('build', 'build', 100, 0, 'a'),
          outlook: { income: { value: 120, source: 'heuristic' } },
        },
        candidate('skip', 'pass'),
      ],
      [
        candidate('takeover', 'takeover', 180, 0, 'b'),
        candidate('skip', 'pass'),
      ],
      [
        {
          ...candidate('fly-a', 'fly', 0, 0, 'a'),
          outlook: { destinationValue: { value: 20, source: 'heuristic' } },
        },
        {
          ...candidate('fly-b', 'fly', 0, 0, 'b'),
          outlook: { destinationValue: { value: 80, source: 'heuristic' } },
        },
      ],
      [
        {
          ...candidate('trial', 'trial'),
          outlook: { trialSuccessProbability: 0.5 },
        },
        candidate('rope', 'rope'),
      ],
      [
        candidate('sell', 'sell', 0, 300, 'a'),
        candidate('bankrupt', 'bankrupt'),
      ],
      [candidate('pay', 'pay-debt', 1300)],
      [candidate('end', 'end-turn')],
    ];
    const read = (): Snapshot<FixtureAction> => ({
      session: 'fixture-only',
      turn: player.id,
      revision: String(revision),
      phase: 'playing',
      activePlayerId: step >= frames.length ? 'human' : player.id,
      players,
      cash,
      debt,
      expectedToll: { value: 60, source: 'heuristic' },
      properties,
      collections: [{ id: 'pair', kind: 'group', propertyIds: ['a', 'b'] }],
      ...(step > 0 ? { diceResult: [2, 3] } : {}),
      candidates: frames[step] ?? [],
    });
    const adapter = createCandidateAdapter<FixtureAction>({
      publicSnapshot: read,
      legalQuotedCandidates: () => read().candidates,
      commit: async (command, signal) => {
        const s = read();
        const selected = s.candidates.find((c) => c.id === command.candidateId);
        if (
          signal.aborted ||
          command.session !== s.session ||
          command.turn !== s.turn ||
          command.revision !== s.revision ||
          !selected ||
          command.action !== selected.action
        ) {
          return { accepted: false };
        }
        cash += selected.quote.credit - selected.quote.debit;
        if (['buy', 'takeover', 'sell'].includes(selected.kind)) {
          properties = properties.map((p) =>
            p.id === selected.targetId
              ? { ...p, ownerId: selected.kind === 'sell' ? null : player.id }
              : p,
          );
        }
        if (selected.kind === 'pay-debt') debt = 0;
        trace.push({ playerId: player.id, kind: selected.kind, cash });
        step++;
        revision++;
        if (step === 6) debt = 1300;
        return { accepted: true };
      },
    });
    const executor = createExecutor(
      { ...adapter, awaitPresentation: async () => {} },
      { seed },
    );
    stops.push((await executor.run()).reason);
  }
  return {
    label: 'SCRIPTED AUTHORITY FIXTURE — NOT INTEGRATED GAME',
    seed,
    trace,
    stops,
  };
}
