import type { TileId } from '../../../game/contracts';
import type { EconomyState } from '../../../game/economy/types';
import { recommendedEconomyProfile } from '../../../game/economy/catalog';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import type { GameView, UIUpdate } from '../adapter';

export const ownerTypes = {
  'pokemon:0001': { type: 'grass', color: '#68d883', label: '풀' },
  'pokemon:0004': { type: 'fire', color: '#ff984f', label: '불' },
  'pokemon:0007': { type: 'water', color: '#63bbff', label: '물' },
  'pokemon:0025': { type: 'electric', color: '#ffe06b', label: '전기' },
} as const;
export type ConstructionType =
  (typeof ownerTypes)[keyof typeof ownerTypes]['type'];
export interface ConstructionCue {
  id: string;
  tileId: TileId;
  kind: 'purchase' | 'takeover' | 'build' | 'final';
  type: ConstructionType;
  color: string;
  ownerName: string;
  placeName: string;
  facilityName: string;
  defense: string;
}

/** Reads committed snapshots only. No estimates, RNG, or command dispatch. */
export function constructionCues(
  before: GameView,
  update: UIUpdate,
): ConstructionCue[] {
  if (!update.id || update.view.state.phase === 'setup') return [];
  const { state, map } = update.view;
  const economy = (state as Partial<EconomyState>).economy;
  if (!economy) return [];
  const result: ConstructionCue[] = [];
  const tiles = new Set(
    update.events.flatMap((e) =>
      e.type === 'city-acquired' || e.type === 'facility-upgraded'
        ? [e.tileId]
        : [],
    ),
  );
  for (const tileId of tiles) {
    const tile = map.tiles.find((t) => t.id === tileId);
    const holding = state.holdings.find((h) => h.tileId === tileId);
    const old = before.state.holdings.find((h) => h.tileId === tileId);
    if (!tile || !holding || (tile.kind !== 'city' && tile.kind !== 'landmark'))
      continue;
    const owner = state.players.find((p) => p.id === holding.ownerId);
    const style =
      owner && ownerTypes[owner.pokemonId as keyof typeof ownerTypes];
    if (!owner || !style) continue; // Never infer type from seat/color.
    const acquired =
      update.events.some(
        (e) =>
          e.type === 'city-acquired' &&
          e.tileId === tileId &&
          e.playerId === holding.ownerId,
      ) && old?.ownerId !== holding.ownerId;
    const development = economy.developmentByTileId[tileId];
    const actualLevel = holding.facilityLevel;
    const upgraded =
      tile.kind === 'city' &&
      update.events.some(
        (e) =>
          e.type === 'facility-upgraded' &&
          e.tileId === tileId &&
          e.level === actualLevel,
      ) &&
      actualLevel > (old?.facilityLevel ?? 0) &&
      development?.stage === actualLevel;
    if (!acquired && !upgraded) continue;
    const final =
      upgraded &&
      actualLevel === 3 &&
      development?.facilities.includes('final');
    const profile = recommendedEconomyProfile;
    const knownProfile =
      economy.profileId === profile.id &&
      economy.profileVersion === profile.version;
    const metadata =
      map.id === kantoJohtoMap.id
        ? kantoJohtoMap.tiles.find((t) => t.id === tileId)?.finalFacility
        : undefined;
    result.push({
      id: `${economy.sessionId}:${economy.revision}:${tileId}:${holding.ownerId}:${actualLevel}`,
      tileId,
      kind: final
        ? 'final'
        : acquired
          ? old
            ? 'takeover'
            : 'purchase'
          : 'build',
      type: style.type,
      color: style.color,
      ownerName: owner.name,
      placeName: tile.nameKo,
      facilityName: final ? (metadata?.nameKo ?? '최종시설') : '',
      defense: final
        ? knownProfile && profile.finalTakeoverImmune
          ? '최종 단계 · 현재 경제 프로필에서 상대 인수 불가'
          : '최종 단계 완성'
        : '',
    });
  }
  return result;
}

/** Session-lifetime dedup: update ID AND authoritative transaction revision. */
export function createConstructionGate() {
  const updates = new Set<string>();
  const transactions = new Set<string>();
  return {
    accept(before: GameView, update: UIUpdate) {
      if (!update.id || updates.has(update.id)) return [];
      updates.add(update.id);
      return constructionCues(before, update).filter((cue) => {
        if (transactions.has(cue.id)) return false;
        transactions.add(cue.id);
        return true;
      });
    },
    reset() {
      updates.clear();
      transactions.clear();
    },
  };
}
