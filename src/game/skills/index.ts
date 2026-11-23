import type { PlayerId, PokemonId, TileId } from '../contracts.ts';
import type { CoreState } from '../core/index.ts';

/** Poke validation-start rules, not effects or numbers from the Pokémon games. */
export type SkillType = 'grass' | 'water' | 'fire' | 'electric';
export type SkillMode = 'signature';
export interface SkillDefinition {
  readonly id: 'vine-whip' | 'water-gun' | 'ember' | 'thunder-wave';
  readonly pokemonId: PokemonId;
  readonly type: SkillType;
  readonly name: string;
  readonly summary: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly detail: string;
}
const detail =
  '각 기술은 경기당 3PP, 회복 없음. 사용 시 1PP를 소비하며 더블 추가 굴림을 포함한 기본차례당 1회만 사용할 수 있습니다. 원작 공격 상성은 표현이며 추가 수치 보너스는 없습니다.';
export const skillCatalog: readonly SkillDefinition[] = [
  {
    id: 'vine-whip',
    pokemonId: 'pokemon:0001',
    type: 'grass',
    name: '덩굴채찍',
    summary: '굴리기 전 사용: 다음 주사위 1회 더블 보장',
    pros: ['무작위 1d6의 눈을 복제하여 더블'],
    cons: ['자동 이동 아님', '다음 굴림에만 적용'],
    detail,
  },
  {
    id: 'water-gun',
    pokemonId: 'pokemon:0007',
    type: 'water',
    name: '물대포',
    summary: '상대 사유지 착지 시 이번 통행료 면제와 전기 함정 해제',
    pros: ['마비 적용 전에 사용 여부 선택', '이번 착지 통행료 전액 면제'],
    cons: ['다음 착지에는 적용되지 않음'],
    detail,
  },
  {
    id: 'ember',
    pokemonId: 'pokemon:0004',
    type: 'fire',
    name: '불꽃세례',
    summary: '상대 일반도시 착지 시 최상위 시설 1단계 파괴',
    pros: ['파괴 후 통행료를 다시 정산', '땅 소유권 유지'],
    cons: ['빈 캠프·명소에는 사용 불가', '최종시설이 있으면 완전 보호'],
    detail,
  },
  {
    id: 'thunder-wave',
    pokemonId: 'pokemon:0025',
    type: 'electric',
    name: '전기자석파',
    summary: '내 도시 1곳에 상대 착지 시 다음 기본차례를 마비시키는 함정',
    pros: ['밟기 전까지 유지', '비행 착지에도 발동'],
    cons: [
      '같은 도시에 중복 설치 불가',
      '자기 착지·통과에는 발동하지 않음',
      '소유권 변경·파산 시 제거',
    ],
    detail,
  },
];
export const skillForPokemon = (id: string) =>
  skillCatalog.find((s) => s.pokemonId === id);
export interface PreparedSkill {
  readonly mode: SkillMode;
  readonly tileId: TileId;
  readonly kind: 'toll';
  readonly landingId?: string;
}
export interface SkillPlayerState {
  readonly pp: number;
  readonly usedThisBasicTurn: boolean;
  readonly prepared: PreparedSkill | null;
  readonly forceDoubleNextRoll: boolean;
  readonly paralyzed: boolean;
}
export interface SkillsState {
  readonly schemaVersion: 1;
  readonly rulesVersion: 'validation-start-1';
  readonly players: Readonly<Record<PlayerId, SkillPlayerState>>;
  /** Idempotent basic-turn lifecycle, independent of extra dice rolls. */
  readonly lastEndedTurn: number;
  readonly traps: Readonly<Partial<Record<TileId, PlayerId>>>;
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
  traps: {},
  players: Object.fromEntries(
    ids.map((id) => [
      id,
      {
        pp: 3,
        usedThisBasicTurn: false,
        prepared: null,
        forceDoubleNextRoll: false,
        paralyzed: false,
      },
    ]),
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
      !!x.traps &&
      Object.entries(x.traps).every(
        ([tileId, ownerId]) =>
          s.holdings.some(
            (h) => h.tileId === tileId && h.ownerId === ownerId,
          ) && s.players.some((p) => p.id === ownerId && !p.bankrupt),
      ) &&
      Object.keys(x.players).length === s.players.length &&
      s.players.every((p) => {
        const a = x.players[p.id];
        return (
          a &&
          Number.isInteger(a.pp) &&
          a.pp >= 0 &&
          a.pp <= 3 &&
          typeof a.usedThisBasicTurn === 'boolean' &&
          typeof a.forceDoubleNextRoll === 'boolean' &&
          typeof a.paralyzed === 'boolean' &&
          (!a.prepared ||
            (a.usedThisBasicTurn &&
              a.prepared.mode === 'signature' &&
              a.prepared.kind === 'toll' &&
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
        [id]: { ...a, pp: a.pp - 1, usedThisBasicTurn: true, prepared },
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
      traps: {},
      players: Object.fromEntries(
        Object.entries(s.skills.players).map(([id, p]) => [
          id,
          {
            ...p,
            prepared: null,
            forceDoubleNextRoll: false,
            paralyzed: false,
          },
        ]),
      ),
    },
  };
}
export function hasAdvantage(attacker: string, defender: string): boolean {
  return ['fire:grass', 'water:fire', 'grass:water', 'electric:water'].includes(
    `${attacker}:${defender}`,
  );
}
/** Remove traps when their installing owner no longer owns the property. */
export function cleanSkillTraps<S extends CoreState>(s: S): S {
  if (!s.skills) return s;
  const traps = Object.fromEntries(
    Object.entries(s.skills.traps).filter(
      ([tileId, ownerId]) =>
        s.holdings.some((h) => h.tileId === tileId && h.ownerId === ownerId) &&
        s.players.some((p) => p.id === ownerId && !p.bankrupt),
    ),
  );
  return { ...s, skills: { ...s.skills, traps } };
}
/** Arrival only. The economy calls this after the Water Gun reaction window. */
export function resolveSkillTrap<S extends CoreState>(
  s: S,
  id: PlayerId,
  tileId: TileId,
  disarm = false,
): S {
  const ownerId = s.skills?.traps[tileId];
  if (!ownerId || ownerId === id) return s;
  const traps = { ...s.skills!.traps };
  delete traps[tileId];
  return {
    ...s,
    skills: {
      ...s.skills!,
      traps,
      players: {
        ...s.skills!.players,
        [id]: {
          ...s.skills!.players[id]!,
          paralyzed: disarm ? s.skills!.players[id]!.paralyzed : true,
        },
      },
    },
  };
}
/** Core owns seeded dice generation; this hook consumes only the one-roll flag. */
export function consumeForcedDoubleRoll<S extends CoreState>(
  s: S,
  id: PlayerId,
): { state: S; forceDouble: boolean } {
  const a = s.skills?.players[id];
  if (!a?.forceDoubleNextRoll) return { state: s, forceDouble: false };
  return {
    state: {
      ...s,
      skills: {
        ...s.skills!,
        players: {
          ...s.skills!.players,
          [id]: { ...a, forceDoubleNextRoll: false },
        },
      },
    },
    forceDouble: true,
  };
}
/** Core calls once when the next basic turn starts, never for an extra roll. */
export function consumeParalyzedBasicTurn<S extends CoreState>(
  s: S,
  id: PlayerId,
): { state: S; skip: boolean } {
  const a = s.skills?.players[id];
  if (!a?.paralyzed) return { state: s, skip: false };
  return {
    state: {
      ...s,
      skills: {
        ...s.skills!,
        players: { ...s.skills!.players, [id]: { ...a, paralyzed: false } },
      },
    },
    skip: true,
  };
}
