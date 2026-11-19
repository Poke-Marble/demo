import type { GameEvent, GameState, PlayerId } from '../../../game/contracts';

export type PortraitReaction =
  | 'normal'
  | 'joy'
  | 'distress'
  | 'pain'
  | 'bankrupt'
  | 'victory'
  | 'acting'
  | 'angry'
  | 'surprise';
export interface EmotionCue {
  id: string;
  playerId: PlayerId;
  reaction: PortraitReaction;
}
export const reactions = {
  normal: { emotion: 'Normal', label: '평온한 표정', priority: 0 },
  joy: { emotion: 'Happy', label: '기쁜 표정', priority: 50 },
  distress: { emotion: 'Worried', label: '곤란한 표정', priority: 60 },
  pain: { emotion: 'Pain', label: '아픈 표정', priority: 65 },
  bankrupt: { emotion: 'Sad', label: '파산으로 슬픈 표정', priority: 90 },
  victory: { emotion: 'Joyous', label: '승리로 환호하는 표정', priority: 100 },
  acting: { emotion: 'Determined', label: '결의에 찬 표정', priority: 20 },
  angry: { emotion: 'Angry', label: '화난 표정', priority: 40 },
  surprise: { emotion: 'Surprised', label: '놀란 표정', priority: 40 },
} as const;

/** Uses named authoritative events/holding owners, never balance deltas. */
export function eventEmotionCues(
  events: readonly GameEvent[],
  state: GameState,
  updateId: string,
): EmotionCue[] {
  return events.flatMap((event, index): EmotionCue[] => {
    const cue = (
      playerId: PlayerId,
      reaction: PortraitReaction,
      suffix = '',
    ) => ({ id: `${updateId}:event:${index}:${suffix}`, playerId, reaction });
    switch (event.type) {
      case 'dice-rolled':
        return [cue(event.playerId, 'acting')];
      case 'city-acquired':
        return [cue(event.playerId, 'joy')];
      case 'facility-upgraded': {
        const owner = state.holdings.find(
          (holding) => holding.tileId === event.tileId,
        )?.ownerId;
        return owner ? [cue(owner, 'joy')] : [];
      }
      case 'toll-paid':
        return [
          cue(event.fromPlayerId, 'distress', 'payer'),
          cue(event.toPlayerId, 'joy', 'receiver'),
        ];
      case 'player-bankrupt':
        return [cue(event.playerId, 'bankrupt')];
      case 'game-won':
        return [cue(event.playerId, 'victory')];
      default:
        return [];
    }
  });
}

export function createEmotionController(
  changed: (playerId: PlayerId) => void,
  durationMs = 1600,
) {
  const states = new Map<
    PlayerId,
    { reaction: PortraitReaction; timer?: ReturnType<typeof setTimeout> }
  >();
  const seen = new Set<string>();
  let disposed = false;
  function apply(cue: EmotionCue) {
    if (disposed || seen.has(cue.id)) return;
    seen.add(cue.id);
    const old = states.get(cue.playerId);
    if (
      old &&
      !(
        cue.reaction === 'normal' &&
        old.reaction !== 'victory' &&
        old.reaction !== 'bankrupt'
      ) &&
      reactions[old.reaction].priority > reactions[cue.reaction].priority
    )
      return;
    if (old?.timer) clearTimeout(old.timer);
    const next: {
      reaction: PortraitReaction;
      timer?: ReturnType<typeof setTimeout>;
    } = { reaction: cue.reaction };
    states.set(cue.playerId, next);
    if (
      cue.reaction !== 'victory' &&
      cue.reaction !== 'bankrupt' &&
      cue.reaction !== 'normal'
    ) {
      next.timer = setTimeout(() => {
        if (disposed || states.get(cue.playerId) !== next) return;
        states.delete(cue.playerId);
        changed(cue.playerId);
      }, durationMs);
    }
    changed(cue.playerId);
  }
  function reset() {
    for (const state of states.values())
      if (state.timer) clearTimeout(state.timer);
    const players = [...states.keys()];
    states.clear();
    seen.clear();
    if (!disposed) players.forEach(changed);
  }
  return {
    apply,
    get: (playerId: PlayerId): PortraitReaction =>
      states.get(playerId)?.reaction ?? 'normal',
    syncState(state: GameState) {
      for (const player of state.players) {
        if (state.victory?.winnerId === player.id)
          apply({
            id: `state:winner:${player.id}`,
            playerId: player.id,
            reaction: 'victory',
          });
        else if (player.bankrupt)
          apply({
            id: `state:bankrupt:${player.id}`,
            playerId: player.id,
            reaction: 'bankrupt',
          });
      }
    },
    reset,
    destroy() {
      disposed = true;
      reset();
    },
  };
}
