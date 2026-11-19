import type { ConstructionVisual } from './construction';
/** Authoritative owner identity supplied by the engine/integration. No seat or controller colors. */
export type OwnerType = 'grass' | 'fire' | 'water' | 'electric';
export interface OwnerVisual {
  readonly id: string;
  readonly name: string;
  readonly pokemonId?: string;
  readonly type?: OwnerType;
}
export const starterTypes: Readonly<Record<string, OwnerType>> = {
  'pokemon:0001': 'grass',
  'pokemon:0004': 'fire',
  'pokemon:0007': 'water',
  'pokemon:0025': 'electric',
};
export const ownerThemes = {
  grass: {
    key: 'grass',
    label: '풀',
    symbol: '잎사귀',
    color: '#26834b',
    light: '#acd598',
    dark: '#164b34',
  },
  fire: {
    key: 'fire',
    label: '불',
    symbol: '불꽃',
    color: '#df5735',
    light: '#f6b68b',
    dark: '#792e25',
  },
  water: {
    key: 'water',
    label: '물',
    symbol: '물방울',
    color: '#267fb9',
    light: '#a7d5e7',
    dark: '#183e65',
  },
  electric: {
    key: 'electric',
    label: '전기',
    symbol: '번개',
    color: '#edca37',
    light: '#ffeb9e',
    dark: '#59480e',
  },
  neutral: {
    key: 'neutral',
    label: '타입 미지정',
    symbol: '중립 표식',
    color: '#98a59c',
    light: '#d9ddcb',
    dark: '#4f625d',
  },
} as const;
export function ownerTheme(owner?: OwnerVisual | null) {
  const type =
    owner?.type ??
    (owner?.pokemonId ? starterTypes[owner.pokemonId] : undefined);
  return type && Object.hasOwn(ownerThemes, type)
    ? ownerThemes[type]
    : ownerThemes.neutral;
}
export function ownerDescription(owner?: OwnerVisual | null) {
  if (!owner) return '미소유';
  const theme = ownerTheme(owner);
  return `소유자 ${owner.name} · ${theme.label} · ${theme.symbol}`;
}
/** Resolve only supplied identity/holding ownerId; no balance, turn, position, seat or AI rules. */
export function ownerFromInput(
  explicit: OwnerVisual | null | undefined,
  holdingOwnerId: string | undefined,
  players: readonly OwnerVisual[],
) {
  if (explicit !== undefined) return explicit;
  if (!holdingOwnerId) return null;
  return (
    players.find((p) => p.id === holdingOwnerId) ?? {
      id: holdingOwnerId,
      name: holdingOwnerId,
    }
  );
}
/** null explicitly releases a lot; undefined preserves legacy owner-unspecified construction. */
export function applyConstructionOwner(
  state: ConstructionVisual,
  input?: OwnerVisual | null,
): ConstructionVisual {
  const owner = input === undefined ? state.owner : input;
  if (state.stage === 'unowned' || owner === null)
    return { stage: 'unowned', owner: null };
  return owner === undefined ? state : { ...state, owner };
}
/** Small code-native pictograms. Dark backing also separates electric yellow from bright terrain. */
export function ownerMark(
  owner: OwnerVisual | null | undefined,
  x: number,
  y: number,
  size = 16,
) {
  if (!owner) return '';
  const t = ownerTheme(owner);
  const glyph =
    t.key === 'grass'
      ? '<path d="M3 13C1 5 7 2 14 2c0 8-3 13-11 11zm0 0 8-8"/>'
      : t.key === 'fire'
        ? '<path d="M8 1c2 5 6 6 5 10-1 6-11 6-11 0 0-3 3-5 4-7l1 5c2-2 2-5 1-8z"/>'
        : t.key === 'water'
          ? '<path d="M8 1C6 5 2 8 2 11a6 6 0 0 0 12 0C14 8 10 5 8 1z"/>'
          : t.key === 'electric'
            ? '<path d="m9 1-7 9h5l-1 5 8-10H9z"/>'
            : '<path d="M4 4h8v8H4z"/>';
  return `<g data-owner-mark="${t.key}" transform="translate(${x} ${y}) scale(${size / 18})"><rect x=".5" y=".5" width="17" height="17" rx="4" fill="${t.dark}" stroke="${t.color}" stroke-width="1.5"/><g transform="translate(1 1)" fill="${t.light}" stroke="${t.light}" stroke-width=".7" stroke-linejoin="round">${glyph}</g></g>`;
}
