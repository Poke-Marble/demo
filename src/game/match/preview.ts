import { createIntegratedPreview } from '../../ui/game/integration/adapter';
import { mountGameUI } from '../../ui/game/index';
import { createInitialRoster } from '../../ui/game/setup';
import { plan } from '../ai/planner';

/** Clean deterministic harness: real legal commands from a fresh session, no state/RNG edits.
 * Fast-forward presentation-free, then mount the actual HUD before the final basic turn. */
const runtime = createIntegratedPreview({ seed: 42, computerDelayMs: 0 });
const adapter = runtime.adapter;
const root = document.querySelector<HTMLElement>('#app')!;
let commands = 0;
const ready = (async () => {
  adapter.start({
    mapId: adapter.getView().map.id,
    participants: createInitialRoster('pokemon:0007'),
    rulesPreset: 'quick',
  });
  while (runtime.getState().phase === 'playing') {
    const s = runtime.getState();
    if (s.match?.completedRounds === 19 && s.activePlayerId === 'player:4')
      break;
    const revision = s.economy.revision;
    if (s.activePlayerId === 'player:1') {
      const snapshot = runtime.snapshot();
      const decision = plan(
        {
          ...snapshot,
          players: snapshot.players.map((p) => ({
            ...p,
            controller: 'computer',
          })),
        },
        42,
      );
      if (!decision) throw new Error('Missing legal human action');
      const v = adapter.getView(),
        action = decision.candidate.action;
      if (action.type === 'fly')
        adapter.selectFlightDestination!(v.flightSelection!.id, action.to);
      else if (v.prompt) adapter.choose(v.prompt.id, decision.candidate.id);
      else adapter.choose(v.actions[0]!.selectionId!, decision.candidate.id);
    } else
      await adapter.runComputerTurn!(
        s.activePlayerId,
        new AbortController().signal,
      );
    commands += runtime.getState().economy.revision - revision;
    if (runtime.getState().economy.revision === revision || commands > 2000)
      throw new Error('No progress');
  }
  if (runtime.getState().phase !== 'playing')
    throw new Error('Unexpected early victory');
  mountGameUI(root, {
    ...adapter,
    runComputerTurn: undefined,
  } as unknown as typeof adapter);
})();
Object.assign(window, {
  matchHarness: {
    runtime,
    ready,
    get commands() {
      return commands;
    },
    async finish() {
      await ready;
      await adapter.runComputerTurn!(
        runtime.getState().activePlayerId,
        new AbortController().signal,
      );
      return runtime.getState();
    },
  },
});
