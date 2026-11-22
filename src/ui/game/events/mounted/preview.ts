import { mountGameUI } from '../../index';
import { createDemoAdapter } from '../../demo/adapter';
import { createInitialRoster } from '../../setup';
import type { GameUIAdapter, UIUpdate } from '../../adapter';
import type { PokemonId } from '../../../../game/contracts';
import { createFeedbackAudio } from '../../feedback/audio';
const base = createDemoAdapter({ boardSize: 32, showcase: true });
const selected =
  new URLSearchParams(location.search).get('pokemon') ?? 'pokemon:0001';
base.start({
  mapId: base.getView().map.id,
  participants: createInitialRoster(selected as PokemonId),
});
let view = {
  ...base.getView(),
  actions: [],
  computer: { connected: false, status: 'QA' },
};
const listeners = new Set<(u: UIUpdate) => void>();
let serial = 0,
  ack = 0,
  last: UIUpdate | undefined;
const adapter: GameUIAdapter = {
  ...base,
  getView: () => view,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  dispatch() {},
  restart() {},
};
const audio = createFeedbackAudio();
const mounted = mountGameUI(
  document.querySelector<HTMLElement>('#app')!,
  adapter,
  { sfx: audio },
);
function fly(playerIndex = 0, toIndex = 14) {
  const player = view.state.players[playerIndex]!;
  const from = player.position,
    to = view.map.tiles[toIndex]!.id;
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p) =>
        p.id === player.id ? { ...p, position: to } : p,
      ),
    },
  };
  const id = `mounted:qa:${++serial}`;
  last = {
    id,
    view,
    events: [],
    effects: [{ id, type: 'fly', playerId: player.id, from, to }],
    presentationComplete: () => {
      ack++;
    },
  };
  listeners.forEach((listener) => listener(last!));
}
for (const [label, run] of [
  [
    'Fly',
    () => {
      void audio.unlock();
      fly();
    },
  ],
  [
    'Replay',
    () => {
      if (last) listeners.forEach((l) => l(last!));
    },
  ],
  ['Destroy', () => mounted.destroy()],
] as const) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = run;
  document.querySelector('#tools')!.append(b);
}
Object.assign(window, {
  mountedQA: {
    fly,
    audio,
    mounted,
    get ack() {
      return ack;
    },
    get view() {
      return view;
    },
  },
});
