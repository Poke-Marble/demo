import { mountGameUI } from '../../index';
import { createIntegratedPreview } from '../../integration/adapter';
import { createInitialRoster } from '../../setup';
import { plan } from '../../../../game/ai/planner';
import type { GameAction } from '../../../../game/contracts';
import type { GameUIAdapter } from '../../adapter';
const runtime = createIntegratedPreview({ seed: 42, computerDelayMs: 0 });
const base = runtime.adapter;
base.start({
  mapId: base.getView().map.id,
  participants: createInitialRoster('pokemon:0007'),
});
// Advance only through legal production commands; no subscriber exists during warmup.
let steps = 0;
while (steps++ < 500 && !base.getView().flightSelection) {
  const s = runtime.snapshot(),
    v = base.getView();
  if (
    s.players.find((p) => p.id === s.activePlayerId)?.controller === 'computer'
  ) {
    await base.runComputerTurn!(
      v.state.activePlayerId,
      new AbortController().signal,
    );
  } else {
    const c = plan(
      {
        ...s,
        players: s.players.map((p) => ({
          ...p,
          controller: 'computer' as const,
        })),
      },
      42,
    )?.candidate;
    if (!c)
      throw new Error(
        'No legal warmup action ' +
          JSON.stringify({ phase: s.phase, turn: s.turn, steps }),
      );
    if (v.prompt) base.choose(v.prompt.id, c.id);
    else base.dispatch(c.action as GameAction);
  }
  await Promise.resolve();
}
if (!base.getView().flightSelection)
  throw new Error('No legal flight within warmup limit');
const selection = base.getView().flightSelection!;
const destination = selection.destinations.find(
  (d) => d.metadata?.kind === 'city',
)!.tileId;
const receipts: {
  id: string;
  from: string;
  to: string;
  ack: number;
  revision: number;
  actualPosition: string;
}[] = [];
const adapter: GameUIAdapter = {
  ...base,
  subscribe(listener) {
    return base.subscribe((update) => {
      const fly = update.effects?.find((e) => e.type === 'fly');
      if (fly?.type === 'fly') {
        const record = {
          id: fly.id,
          from: fly.from,
          to: fly.to,
          ack: 0,
          revision: runtime.getState().economy.revision,
          actualPosition: runtime
            .getState()
            .players.find((p) => p.id === fly.playerId)!.position,
        };
        receipts.push(record);
        const done = update.presentationComplete;
        listener({
          ...update,
          presentationComplete: () => {
            record.ack++;
            done?.();
          },
        });
      } else listener(update);
    });
  },
};
const game = mountGameUI(document.querySelector<HTMLElement>('#app')!, adapter);
Object.assign(window, {
  actualFlightQA: {
    receipts,
    steps,
    get view() {
      return base.getView();
    },
    get state() {
      return runtime.getState();
    },
    choose() {
      base.selectFlightDestination!(selection.id, destination);
    },
    destroy: () => game.destroy(),
  },
});
document.body.dataset.actualReady = 'true';
