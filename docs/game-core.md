# 게임 코어 / UI 연결 계약

## 범위와 의존성

`src/game/core/index.ts`는 Chrome에서 사용하는 순수 TypeScript 규칙엔진이다.
DOM, 타이머, 전역 난수, 에셋, 저장소에 의존하지 않는다. 공통 타입은
`../contracts`에서 타입으로만 가져오며 공통 파일을 생성하거나 수정하지 않는다.
맵 배열 순서대로 이동하므로 관동·성도 최종 맵과 초기 4칸 sampleMap 모두 연결 가능하다.
지도/포켓몬/스프라이트 데이터 생성 및 경제·승리 판정 자체는 담당 범위 밖이다.

## 공개 API

- `createGame(map, players, { seed?, rules? }?) → CoreState`: 입력 순서의 2~4인으로
  즉시 playing 상태를 만든다. 첫 플레이어, turnNumber=1, awaiting-roll로 시작한다.
  중복 ID, 빈 이름, 잘못된 맵/시드/금액은 `RangeError`다.
- `dispatch(state, map, action, hooks?) → Transition`: 공통 `GameAction`을 받아
  roll-dice/end-turn을 처리한다. buy-city/upgrade-facility는 unsupported-action이다.
- `defaultRules`: initialBalance=1500, startReward=200. 게임별 부분 덮어쓰기 가능.
- `nextRandom(uint32)` (`random.ts`): `{ state, value }`를 반환하는 Mulberry32.
  value는 [0, 1)이며 고정 seed=1의 첫 값은 0.6270739405881613이다.
- `CoreState`, `CoreRules`, `PlayerSetup`, `CoreEvent`, `CoreHooks`, `HookEffect`,
  `CoreError`, `Transition` 타입을 index에서 export한다.

CoreState는 공통 GameState를 확장한다. 추가 필드 `core`는 rngState,
turnStage(`awaiting-roll` | `awaiting-end`), rules다. UI/저장은 이를 포함한
전체 상태를 유지해야 한다. sampleState는 setup 데모이므로 dispatch에 바로 넣지 말고
createGame으로 초기화한다. JSON 왕복으로 시드와 중복굴림 방지 상태를 복원할 수 있다.
동일한 맵·설정·훅·행동열은 동일한 결과를 만든다. 맵 정의는 게임 도중 바꾸지 않는다.

```ts
import { createGame, dispatch } from './game/core';
import { sampleMap } from './data/sample-map';

let state = createGame(
  sampleMap,
  [
    { id: 'player:1', name: '지우', pokemonId: 'pokemon:0001' },
    { id: 'player:2', name: '이슬', pokemonId: 'pokemon:0004' },
  ],
  { seed: 42 },
);

const result = dispatch(state, sampleMap, {
  type: 'roll-dice',
  playerId: state.activePlayerId,
});
if (result.ok) {
  state = result.state;
  // result.events 순서로 애니메이션을 재생하고 최종 state로 화면을 렌더한다.
} else {
  // result.error를 표시한다. state와 RNG는 그대로다.
}
```

awaiting-roll에서는 굴리기, awaiting-end에서는 턴 종료를 활성화한다.
playing이 아니면 모든 행동을 막는다. UI가 보내는 것은 의도뿐이며 주사위 값,
이동 거리, 보상 금액을 행동 입력으로 받지 않는다. UI 애니메이션 완료를 기다려야 하는
동안의 버튼 잠금은 UI 책임이다. dispatch는 동기적으로 한 행동 전체를 처리한다.

## 규칙과 임시 가정

- 주사위는 독립적인 1~6 값 2개다. 합만큼 순환 이동한다.
- 더블 추가턴은 없다. 한 턴에 반드시 한 번 굴리고 종료한다.
- 유일한 start 타일에서 시작하며, start는 배열 첫 칸일 필요가 없다.
- 출발 통과와 정확한 착지 모두 보상을 지급한다. 초기 배치에는 지급하지 않는다.
  짧은 테스트 맵에서 여러 바퀴 돌면 횟수별 지급한다. 금액 단위는 정수이며 임시값이다.
- 턴 순서는 입력 배열 순서다. bankrupt 플레이어는 건너뛴다. turnNumber는 실제
  다음 턴 시작마다 1씩 증가한다. 라운드 번호가 아니다.
- 생존 1인은 계속 진행한다. 승리는 외부 판정 책임이다. 전원 파산 시 다음 차례가
  없으므로 finished/victory=null로 정지한다. 이는 승리 규칙이 아닌 교착 방지 정책이다.
- 지급/잔액은 안전한 정수 범위여야 한다. 보상으로 범위를 넘으면 행동을 거부한다.
- 입력과 출력은 readonly 계약이며 엔진은 입력을 변경하지 않는다. 구조 공유가 있으므로
  호출자도 직접 변경하지 않아야 한다. 런타임 deep freeze는 수행하지 않는다.

## 이벤트 및 실패

굴림 성공 이벤트 순서: dice-rolled → player-moved → start-rewarded(통과 시)
→ tile-landed → 착지 훅 이벤트. player-moved는 시작/종료 타일만 담는다.
애니메이션은 dice-rolled 합과 맵 배열로 중간 경로를 계산한다.
start-rewarded.amount는 모든 통과 보상의 합이다.

종료 성공 이벤트 순서: 종료 훅 이벤트 → turn-ended → turn-started(다음 턴 존재 시).
초기화에는 이벤트가 없으며 초기 state를 렌더한다. CoreEvent는 공통 GameEvent의
상위 유니온이다. UI가 공통 이벤트만 받을 경우 추가 3종을 처리하거나 걸러야 한다.

실패는 `{ ok: false, state: 원본, events: [], error }`다. 오류 코드는
game-not-playing, invalid-state, wrong-player, already-rolled, roll-required,
unsupported-action, invalid-hook-effect다. 거부 시 시드도 소비하지 않는다.
검사 순서는 게임 진행 여부 → 상태/맵 → 플레이어 → 행동별 조건이다.
TypeScript 계약을 따르는 호출을 전제하며 임의의 외부 JSON에 대한 완전한 스키마 검증기는 아니다.

## 착지·턴 종료 확장점

`onLand(state, tile)`는 보상·이동 완료 후 호출한다.
`onEndTurn(state)`는 다음 플레이어 선택 전에 호출한다.
각 훅은 동기적이고 결정적인 순수 함수여야 하며 전달받은 state/map 및 중첩 객체를
수정하면 안 된다. 훅 예외는 호출자에게 전파되므로 UI 통합 계층에서 처리한다.

훅 결과는 `HookEffect`이며 players/holdings/victory/events 중 필요한 필드만 돌려준다.
players는 원래 ID·순서·위치를 유지해야 하며 잔액/파산 여부를 바꿀 수 있다.
보유 자산과 승리 사유의 도메인 유효성은 경제·승리 모듈 책임이다.
victory를 반환하면 즉시 finished가 된다. game-won/player-bankrupt 등 도메인 이벤트는
훅이 직접 반환한다. 엔진이 중복 생성하지 않는다.
잘못된 플레이어 목록/위치/승자는 전체 행동을 invalid-hook-effect로 거부한다.
착지 시 현재 플레이어가 파산해도 end-turn은 허용하여 다음 생존자로 넘어간다.

```ts
const hooks = {
  onLand: (state, tile) => economy.resolveLanding(state, tile),
  onEndTurn: (state) => victory.evaluate(state),
};
// 각 모듈은 HookEffect를 반환하도록 어댑터를 둔다.
```

## 검증 및 기반 반영

독립 규칙 테스트(추가 패키지 불필요, Node >=22.17):

```powershell
node --experimental-strip-types --test src/game/core/core.test.mjs
```

초기화/입력 거부, 100턴 시드 재현·불변 입력, 정확한 출발 착지/다중 통과/
중간 start 위치, 더블 무보너스, 순서·파산 건너뛰기, 훅 효과·승리·종료 이후
거부·잘못된 훅의 원자적 취소를 검증한다. 테스트는 src/game/core에만 둔다.

feat/init이 커밋되고 그 작업트리가 깨끗해질 때까지 공통 파일을 복제하지 않는다.
준비되면 자신의 변경을 먼저 커밋하고 자신의 브랜치에서만
`git merge feat/init --no-edit` 후 규칙 테스트 및 npm run typecheck/lint/build를 수행한다.
미준비 상태의 검증 범위와 최종 커밋 정보는 완료보고에 명시한다.

2026-11-18 독립 검증: 규칙 테스트 7개, 담당 경로 ESLint 및 Prettier,
초기 계약을 메모리로 읽어 적용한 strict TypeScript 검사가 통과했다.
이 독립 타입 검사는 계약 파일을 현재 작업트리에 복제하지 않는다.
기반 커밋 전에는 전체 프로젝트 npm typecheck/lint/build의 통합 성공을 주장하지 않는다.
