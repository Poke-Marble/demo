/** 직렬화 가능한 초안 계약. 규칙 처리, 경제 수치, 승리 판정은 후속 작업에서 구현한다. */
export type MapId = `map:${string}`;
export type TileId = `tile:${string}`;
export type CityGroupId = `group:${string}`;
export type PlayerId = `player:${string}`;
export type PokemonId = `pokemon:${string}`;
export type AssetId = `pmd:${string}:base:${'idle' | 'walk'}`;
export type BoardSide = 'north' | 'east' | 'south' | 'west';

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly pokemonId: PokemonId;
  readonly position: TileId;
  readonly balance: number;
  readonly bankrupt: boolean;
}

interface TileBase {
  readonly id: TileId;
  readonly nameKo: string;
}

export type Tile =
  | (TileBase & { readonly kind: 'start' })
  | (TileBase & {
      readonly kind: 'city';
      readonly groupId: CityGroupId;
      readonly side: BoardSide;
    })
  | (TileBase & { readonly kind: 'landmark' });

export interface CityGroup {
  readonly id: CityGroupId;
  readonly nameKo: string;
  readonly cityIds: readonly TileId[];
}

export interface MapDefinition {
  readonly id: MapId;
  readonly completeness: 'sample' | 'complete';
  /** 이동 순서는 배열 순서로 결정하며 ID의 숫자나 정렬 순서에서 추론하지 않는다. */
  readonly tiles: readonly Tile[];
  readonly cityGroups: readonly CityGroup[];
}

export interface CityHolding {
  readonly tileId: TileId;
  readonly ownerId: PlayerId;
  readonly facilityLevel: number;
}

export type VictoryReason =
  | 'last-player-standing'
  | 'three-city-groups'
  | 'one-side-cities'
  | 'four-landmarks';

export interface GameState {
  readonly schemaVersion: 1;
  readonly mapId: MapId;
  readonly phase: 'setup' | 'playing' | 'finished';
  /** 2~4명, 배열 순서가 한 기기의 차례 순서다. 런타임 입력 검증은 후속 구현. */
  readonly players: readonly Player[];
  readonly activePlayerId: PlayerId;
  readonly turnNumber: number;
  readonly holdings: readonly CityHolding[];
  readonly victory: {
    readonly winnerId: PlayerId;
    readonly reason: VictoryReason;
  } | null;
}

/** 플레이어의 의도. 주사위 결과와 통행료 등 규칙 계산값은 입력받지 않는다. */
export type GameAction =
  | { readonly type: 'roll-dice'; readonly playerId: PlayerId }
  | {
      readonly type: 'buy-city';
      readonly playerId: PlayerId;
      readonly tileId: TileId;
    }
  | {
      readonly type: 'upgrade-facility';
      readonly playerId: PlayerId;
      readonly tileId: TileId;
    }
  | { readonly type: 'end-turn'; readonly playerId: PlayerId };

/** 처리 결과의 최소 어휘만 선언한다. 이벤트 로그·리플레이 프로토콜은 아직 미정. */
export type GameEvent =
  | {
      readonly type: 'dice-rolled';
      readonly playerId: PlayerId;
      readonly values: readonly number[];
    }
  | {
      readonly type: 'player-moved';
      readonly playerId: PlayerId;
      readonly from: TileId;
      readonly to: TileId;
    }
  | {
      readonly type: 'city-acquired';
      readonly playerId: PlayerId;
      readonly tileId: TileId;
    }
  | {
      readonly type: 'facility-upgraded';
      readonly tileId: TileId;
      readonly level: number;
    }
  | {
      readonly type: 'toll-paid';
      readonly fromPlayerId: PlayerId;
      readonly toPlayerId: PlayerId;
      readonly amount: number;
    }
  | { readonly type: 'player-bankrupt'; readonly playerId: PlayerId }
  | { readonly type: 'turn-ended'; readonly playerId: PlayerId }
  | {
      readonly type: 'game-won';
      readonly playerId: PlayerId;
      readonly reason: VictoryReason;
    };
