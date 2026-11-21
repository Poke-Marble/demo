import type { PlayerId, PokemonId, TileId } from '../contracts.ts';
import type { CoreState } from '../core/index.ts';

/** Poke validation-start rules, not effects or numbers from the Pokémon games. */
export type SkillType = 'grass' | 'water' | 'fire' | 'electric';
export type SkillMode = 'signature' | 'breakthrough';
export interface SkillDefinition {
  readonly id: 'vine-whip' | 'water-gun' | 'ember' | 'thunder-shock';
  readonly pokemonId: PokemonId;
  readonly type: SkillType;
  readonly name: string;
  readonly summary: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly detail: string;
}
const detail =
  '초기 3PP · 자동 충전 없음 · 본인 기본차례당 1회. 공통 기술돌파: 통행료 15% 감면, 최대 60. 상성 우위 시 경제 기술만 +10%p·상한 +25. 가호와 함께 써도 기술의 추가 절약은 상한 이내입니다.';
export const skillCatalog: readonly SkillDefinition[] = [
  {
    id: 'vine-whip',
    pokemonId: 'pokemon:0001',
    type: 'grass',
    name: '덩굴채찍',
    summary: '눈 공개 후 이동 전 합계 유지 또는 -1 (최소 2)',
    pros: ['공개된 눈으로 착지 조정', '원래 합계 유지는 PP 무료'],
    cons: ['합계를 늘릴 수 없음', '조정 시 1PP'],
    detail,
  },
  {
    id: 'water-gun',
    pokemonId: 'pokemon:0007',
    type: 'water',
    name: '물대포',
    summary: '눈 공개 후 이동 전 합계 유지 또는 +1 (최대 12)',
    pros: ['공개된 눈으로 착지 조정', '원래 합계 유지는 PP 무료'],
    cons: ['합계를 줄일 수 없음', '조정 시 1PP'],
    detail,
  },
  {
    id: 'ember',
    pokemonId: 'pokemon:0004',
    type: 'fire',
    name: '불꽃세례',
    summary: '착지 의무 통행료 25% 감면 · 최대 100',
    pros: ['착지 후 실제 견적으로 선택', '상성 우위 시 35% · 최대 125'],
    cons: ['인수비에는 적용 안 됨', '가호 중첩 후 순절약도 상한 적용'],
    detail,
  },
  {
    id: 'thunder-shock',
    pokemonId: 'pokemon:0025',
    type: 'electric',
    name: '전기쇼크',
    summary: '합법 일반도시 인수비 20% 감면 · 최대 100',
    pros: ['실제 인수 견적으로 선택', '상성 우위 시 30% · 최대 125'],
    cons: ['최종시설·명소 인수 면역 유지', '통행료에는 고유 효과 적용 안 됨'],
    detail,
  },
];
export const skillForPokemon = (id: string) =>
  skillCatalog.find((s) => s.pokemonId === id);
export interface PreparedSkill {
  readonly mode: SkillMode;
  readonly tileId: TileId;
  readonly kind: 'toll' | 'takeover';
}
export interface SkillPlayerState {
  readonly pp: number;
  readonly usedThisBasicTurn: boolean;
  readonly prepared: PreparedSkill | null;
}
export interface SkillsState {
  readonly schemaVersion: 1;
  readonly rulesVersion: 'validation-start-1';
  readonly players: Readonly<Record<PlayerId, SkillPlayerState>>;
  /** Idempotent basic-turn lifecycle, independent of extra dice rolls. */
  readonly lastEndedTurn: number;
}
export interface SkillActivation {
  readonly playerId: PlayerId;
  readonly mode: SkillMode;
  readonly skillSavings: number;
  readonly id: string;
  readonly pokemonId: PokemonId;
  readonly type: SkillType;
  readonly name: string;
  readonly description: string;
}
export const createSkillsState = (ids: readonly PlayerId[]): SkillsState => ({
  schemaVersion: 1,
  rulesVersion: 'validation-start-1',
  lastEndedTurn: 0,
  players: Object.fromEntries(
    ids.map((id) => [id, { pp: 3, usedThisBasicTurn: false, prepared: null }]),
  ),
});
export function validateSkills(s: CoreState): boolean {
  const x = s.skills;
  return (
    !x ||
    (x.schemaVersion === 1 &&
      x.rulesVersion === 'validation-start-1' &&
      Number.isSafeInteger(x.lastEndedTurn) &&
      x.lastEndedTurn >= 0 &&
      x.lastEndedTurn <= s.turnNumber &&
      Object.keys(x.players).length === s.players.length &&
      s.players.every((p) => {
        const a = x.players[p.id];
        return (
          a &&
          Number.isInteger(a.pp) &&
          a.pp >= 0 &&
          a.pp <= 3 &&
          typeof a.usedThisBasicTurn === 'boolean' &&
          (!a.prepared ||
            (a.usedThisBasicTurn &&
              ['signature', 'breakthrough'].includes(a.prepared.mode) &&
              ['toll', 'takeover'].includes(a.prepared.kind) &&
              typeof a.prepared.tileId === 'string'))
        );
      }))
  );
}
export function skillUnavailableReason(
  s: CoreState,
  id: PlayerId,
): string | undefined {
  const p = s.players.find((p) => p.id === id);
  if (s.phase !== 'playing') return '경기 진행 중에만 사용 가능';
  if (s.activePlayerId !== id || !p || p.bankrupt)
    return '본인 차례에만 사용 가능';
  if (!skillForPokemon(p.pokemonId) || !s.skills?.players[id])
    return '기술 정보 없음';
  if (s.legendary?.players[id]?.trial || s.legendary?.pendingFly)
    return '시험·비행 중 사용 불가';
  if (s.skills.players[id]!.pp === 0) return 'PP 소진';
  if (s.skills.players[id]!.usedThisBasicTurn)
    return '이번 기본차례에 이미 사용';
  return undefined;
}
export function spendSkill<S extends CoreState>(
  s: S,
  id: PlayerId,
  prepared: PreparedSkill | null,
): S {
  if (skillUnavailableReason(s, id)) throw new RangeError('skill-unavailable');
  const a = s.skills!.players[id]!;
  return {
    ...s,
    skills: {
      ...s.skills!,
      players: {
        ...s.skills!.players,
        [id]: { pp: a.pp - 1, usedThisBasicTurn: true, prepared },
      },
    },
  };
}
export function clearPreparedSkill<S extends CoreState>(s: S, id: PlayerId): S {
  if (!s.skills?.players[id]?.prepared) return s;
  return {
    ...s,
    skills: {
      ...s.skills,
      players: {
        ...s.skills.players,
        [id]: { ...s.skills.players[id]!, prepared: null },
      },
    },
  };
}
/** Call only on successful basic turn-ended, never on an extra roll. */
export function completeSkillBasicTurn<S extends CoreState>(
  s: S,
  id: PlayerId,
  endedTurn: number,
): S {
  if (!s.skills || endedTurn <= s.skills.lastEndedTurn) return s;
  return {
    ...s,
    skills: {
      ...s.skills,
      lastEndedTurn: endedTurn,
      players: {
        ...s.skills.players,
        [id]: {
          ...s.skills.players[id]!,
          usedThisBasicTurn: false,
          prepared: null,
        },
      },
    },
  };
}
export function clearFinishedSkills<S extends CoreState>(s: S): S {
  if (s.phase !== 'finished' || !s.skills) return s;
  return {
    ...s,
    skills: {
      ...s.skills,
      players: Object.fromEntries(
        Object.entries(s.skills.players).map(([id, p]) => [
          id,
          { ...p, prepared: null },
        ]),
      ),
    },
  };
}
export function movementAdjustment(s: CoreState, id: PlayerId): -1 | 1 | null {
  if (skillUnavailableReason(s, id)) return null;
  const type = skillForPokemon(
    s.players.find((p) => p.id === id)!.pokemonId,
  )?.type;
  return type === 'grass' ? -1 : type === 'water' ? 1 : null;
}
export function hasAdvantage(attacker: string, defender: string): boolean {
  return ['fire:grass', 'water:fire', 'grass:water', 'electric:water'].includes(
    `${attacker}:${defender}`,
  );
}
export function economicSkillRule(
  s: CoreState,
  id: PlayerId,
  tileId: TileId,
  kind: 'toll' | 'takeover',
) {
  const prepared = s.skills?.players[id]?.prepared;
  if (!prepared || prepared.tileId !== tileId || prepared.kind !== kind)
    return null;
  const p = s.players.find((p) => p.id === id)!;
  const h = s.holdings.find((h) => h.tileId === tileId && h.ownerId !== id);
  const owner = s.players.find((p) => p.id === h?.ownerId);
  const attacker = skillForPokemon(p.pokemonId);
  const defender = owner && skillForPokemon(owner.pokemonId);
  if (!h || !attacker) return null;
  if (
    kind === 'takeover' &&
    (prepared.mode !== 'signature' ||
      attacker.type !== 'electric' ||
      h.facilityLevel >= 3)
  )
    return null;
  if (
    kind === 'toll' &&
    prepared.mode === 'signature' &&
    attacker.type !== 'fire'
  )
    return null;
  const bonus = defender && hasAdvantage(attacker.type, defender.type) ? 1 : 0;
  return {
    rateBps:
      (prepared.mode === 'breakthrough'
        ? 1500
        : kind === 'toll'
          ? 2500
          : 2000) +
      bonus * 1000,
    cap: (prepared.mode === 'breakthrough' ? 60 : 100) + bonus * 25,
  };
}
/** Exact rational composition; skill savings measured against the same blessed baseline. */
export function skillDiscountedAmount(
  gross: number,
  blessingRate: number,
  rule: { rateBps: number; cap: number },
): number {
  const blessingBps = Math.round(blessingRate * 10000);
  const numerator = BigInt(gross) * BigInt(10000 - blessingBps);
  const baseline = Number((numerator + 9999n) / 10000n);
  const composed = Number(
    (numerator * BigInt(10000 - rule.rateBps)) / 100000000n,
  );
  return Math.max(gross > 0 ? 1 : 0, baseline - rule.cap, composed);
}
