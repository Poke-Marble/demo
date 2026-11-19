# 승리 판정 구현 및 연결 계약

기준: `main bde04c3`, 실제 `kantoJohtoMap` (`map:kanto-johto:v3`). 변경 범위는 `src/game/victory/**`와 이 문서뿐이다. 상위 경로와 담당 경로에서 적용할 AGENTS.md는 발견되지 않았으며, 이번 순수 TypeScript 도메인 작업에 해당하는 제공 skill은 없다. core/contracts/hooks/UI/integration 및 경제 모듈은 수정하거나 연결하지 않았다.

## 공개 API

```ts
import {
  evaluateVictory,
  finalizeVictory,
  defaultVictoryConfig,
} from './src/game/victory/index.ts';
import type {
  VictoryOptions,
  VictoryEvaluation,
  VictoryFinalization,
  VictoryConfig,
  VictoryErrorCode,
} from './src/game/victory/index.ts';
```

- `evaluateVictory(state: GameState, map: MapDefinition, options?: VictoryOptions): VictoryEvaluation`: 순수 판정. 성공 시 `ok: true`, `status`, `victory`(미충족이면 null), `candidates`를 반환한다. 모든 충족자의 `playerId`, 우선순위순 `reasons`, 완성 `completedGroupIds`/`completedSides`, 소유 `landmarkIds`를 제공한다. 후보 배열 순서는 플레이어 배열 순서다.
- `finalizeVictory<S extends GameState>(state: S, map, options?): VictoryFinalization<S>`: 같은 판정 후 승리라면 `{ ...state, phase: 'finished', victory }`와 `game-won` 이벤트 1개를 반환한다. core 확장 필드도 보존한다. 성공 시 `evaluation`을 함께 반환한다. 실패 시 `ok: false`, `error: { code, message }`, 원본 `state`, 빈 `events`를 반환한다.
- `options.actorId?: PlayerId`: 이번 정산을 일으킨 행위자. 생략 시 `activePlayerId`를 자동 사용하지 않는다.
- `options.config?: VictoryConfig`: 생략 시 `defaultVictoryConfig`. 부분 설정이 아니라 완전한 설정 객체를 받는다. 변경 시 `{ ...defaultVictoryConfig, ...변경값 }`을 사용한다.

입력은 기존 타입을 준수하는 도메인 객체라는 전제다. 임의 JSON에 대한 런타임 파서가 아니므로 외부 저장 데이터를 읽을 때 스키마 검증은 호출자가 수행해야 한다. 배열/객체를 수정하지 않으며 랜덤·시드·UI·시간·외부 상태에 의존하지 않는다. `facilityLevel`은 읽거나 검증하지 않는다. 잔액/시설 가격/통행료/경제적 유효성도 판정하지 않는다.

## 구현된 승리 조건

| 조건 / reason                           | 기준                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| 마지막 생존자 / `last-player-standing`  | `bankrupt === false`인 플레이어가 정확히 1명. 재산 불필요              |
| 도시그룹 3개 / `three-city-groups`      | 완성된 서로 다른 `cityGroups`가 3개 이상. 각 그룹의 모든 일반도시 소유 |
| 한 변 모든 일반도시 / `one-side-cities` | south/west/north/east 중 한 변의 `kind: 'city'` 전부 소유              |
| 별도 관광명소 4개 / `four-landmarks`    | 서로 다른 `kind: 'landmark'` 4개 이상 소유                             |

모든 조건은 건물 0단계 소유만으로 충족한다. `start`/`special`은 어느 소유 목표에도 포함하지 않으며 소유 레코드 자체를 거부한다. 실제맵은 일반도시 24개, 그룹 8개(각 3도시), 변별 일반도시 6개, 별도 관광명소 4개다. 달맞이산·관동 사파리존·알프의유적·석영고원·은빛산처럼 `placeKind: 'point-of-interest'`라도 `kind: 'city'`인 장소는 일반도시다. 별도 관광명소 무인발전소·쌍둥이섬·소용돌이섬·방울탑은 그룹/라인 계산에 넣지 않는다.

소유가 없는 칸은 미소유다. 소유 이전 도중의 중간 상태를 허용하지 않으며 같은 칸 레코드는 동일 소유자끼리 중복이어도 오류다. 중복을 제거하거나 마지막 레코드를 채택하지 않는다. 파산자의 소유도 무시하지 않고 정리 누락 오류로 반환한다. 음수/0 잔액을 근거로 파산을 추정하지 않는다.

## 동시 충족 및 설정

1. 모든 살아 있는 플레이어를 판정한다.
2. 후보 중 명시된 `actorId`가 있으면 그 플레이어가 승자다.
3. 행위자가 미충족/파산자이거나 생략되면 후보 중 `state.players` 배열에서 가장 앞선 플레이어가 승자다. ID 정렬이나 현재 턴 순환 정렬을 하지 않는다. 존재하지 않는 행위자는 오류다.
4. 선택된 승자의 여러 조건 중 `reasonPriority`에서 가장 앞선 이유를 기록한다. 다른 플레이어의 조건 우선순위와 비교하지 않는다.

기본 이유 순서는 마지막 생존자 → 3그룹 → 한 변 → 4관광명소다. 예를 들어 A의 한 변과 B의 4명소가 동시 완성되면 행위자 B 지정 시 B가 승리하고, 행위자 생략 시 배열상 먼저인 후보가 승리한다. 한 명이 모든 조건을 충족하면 기본 이유는 마지막 생존자이고 나머지 조건도 `candidates[].reasons`에 남는다.

`config.ts`에 `groupsToWin: 3`, `landmarksToWin: 4`, `reasonPriority`를 분리했다. 임계값은 양의 안전한 정수이며 맵 목표 수 이하여야 한다. 이유 순서는 기존 네 reason을 중복 없이 정확히 한 번씩 포함해야 한다. 임계값을 바꿔도 기존 contracts의 reason 문자열은 유지된다(예: 2명소 설정에도 `four-landmarks`). 커스텀 설정 사용 시 UI 표시는 설정과 함께 해석해야 한다. `BoardDefinition.assumptions`에서 자동으로 수치를 가져오지 않는다.

요청된 **3그룹/4명소/소유만 필요**는 구현된 확정 요구다. **이유 기본 순서, 행위자 다음 플레이어 배열 순서, 오류의 선검증 순서, 아래 종료 레코드 신뢰 정책**은 이번 구현이 채택한 결정 규칙이며 별도의 기존 기획 확정으로 주장하지 않는다. 새 경제 수치나 밸런스 수치는 추가하지 않았다.

## 오류 및 종료 상태 규칙

첫 오류 하나를 `{ code, message }`로 반환한다. message는 진단용 영문이며 UI 분기는 code를 사용한다. 여러 문제가 있으면 아래 순서로 검사한다.

| 순서 | code                | 발생 조건                                                                                                                                                |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `incomplete-map`    | `completeness !== 'complete'`. sample에서는 마지막 생존자도 판정하지 않음                                                                                |
| 2    | `map-mismatch`      | state.mapId와 전달 맵 ID 불일치                                                                                                                          |
| 3    | `invalid-config`    | 임계값/이유 순서 잘못됨                                                                                                                                  |
| 4    | `invalid-map`       | 중복 tile/group ID, start 수가 1이 아님, 빈 그룹, 중복/누락/불일치 도시 소속, 그룹에 landmark/special/start/없는 칸 포함, 도시 side 잘못됨, 비어 있는 변 |
| 5    | `invalid-config`    | 임계값이 맵의 그룹/명소 수를 초과함                                                                                                                      |
| 6    | `invalid-players`   | 플레이어 2~4명 조건 위반, ID 중복, 없는 activePlayerId                                                                                                   |
| 7    | `invalid-phase`     | playing/finished 이외(setup 포함)                                                                                                                        |
| 8    | `invalid-victory`   | playing인데 victory 존재, finished인데 victory 없음/없는 승자/파산 승자/알 수 없는 reason                                                                |
| 9    | `duplicate-holding` | 이미 본 tileId가 다시 나타남                                                                                                                             |
| 9    | `invalid-property`  | 없는 칸 또는 start/special 소유                                                                                                                          |
| 9    | `unknown-owner`     | 소유자의 player ID가 없음                                                                                                                                |
| 9    | `bankrupt-owner`    | 파산 플레이어의 잔여 소유                                                                                                                                |
| 10   | `no-survivors`      | 생존자가 0명. 무승부/임의 승자로 처리하지 않음                                                                                                           |
| 11   | `invalid-actor`     | playing에서 명시한 actorId가 플레이어에 없음                                                                                                             |

9단계는 holdings 입력 순서대로 각 레코드에 대해 중복 → 칸 종류 → owner 존재 → 파산 여부를 검사한다. 유효한 도메인 범위에서 last-survivor가 있더라도 잘못된 소유 데이터는 먼저 거부한다. 파산한 activePlayerId가 배열에 남아 있는 것은 허용한다. 호출 시점이 턴 이동 전일 수 있기 때문이다.

유효한 `finished`는 10단계까지 검증한 뒤 기존 victory를 권위 있는 종료 기록으로 반환한다(`status: 'already-finished'`, `candidates: []`). 소유 충족 증명을 다시 계산하거나 설정 변경으로 승자를 뒤집지 않는다. 종료 후 actorId는 무시한다. `finalizeVictory`는 전달받은 state 객체를 그대로 반환하고 이벤트를 추가하지 않는다. JSON 저장/복원 뒤에도 동일하다. 다만 훼손된 종료 레코드/미완성 맵/잘못된 소유/잘못된 설정까지 성공으로 위장하지는 않는다.

승리 없음/오류도 원본 state를 반환하고 events는 빈 배열이다. 첫 확정만 새 최상위 state를 만들며 중첩 불변 필드는 공유한다. 중복 이벤트 방지는 **반환 state를 저장하고 다음 호출에 사용하는 순차 처리**가 전제다. 과거 playing 상태에 병렬로 두 번 호출하면 둘 다 같은 승리 이벤트를 산출한다. 저장소 동시성/트랜잭션/이벤트 ID 중복 방지는 외부 책임이다.

## 연결 예제: 외부 정산 완료 후

```ts
import type { GameState, PlayerId } from '../contracts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import { finalizeVictory } from './index.ts';

// 이 함수에 들어오기 전에 경제 거래, 통행료, 매각, 파산 확정,
// 파산자 소유 해제/이전 및 모든 소유 중복 정리가 완료되어야 한다.
function afterSettlement<S extends GameState>(settled: S, actorId: PlayerId) {
  const result = finalizeVictory(settled, kantoJohtoMap, { actorId });
  if (!result.ok) {
    // 정산 트랜잭션을 오류 처리한다. 승리 오류를 정상 무승리로 삼키지 않는다.
    return result;
  }
  // 호출자는 result.state를 저장하고 result.events를 기존 정산 이벤트 뒤에
  // 한 번만 붙인다. phase가 finished면 다음 턴/추가 행동을 진행하지 않는다.
  return result;
}
```

경로는 위 코드를 `src/game/victory/adapter.ts`에 두는 경우다. adapter 파일 자체는 추가하지 않았다. 아직 존재하지 않는 경제 모듈을 import하지 않는다. 실제 호출자는 정산 트랜잭션 경계를 소유하는 계층이어야 한다. core의 기존 hook에 바로 꽂으면 그 hook 이후에 정산이 남는지 확인할 수 없으므로 여기서는 연결하지 않는다. 반환 state에는 core 필드와 기존 전설 상태를 보존하며, 승리 확정 자체는 전설시험·잔액·파산·건물·턴 번호를 변경하지 않는다.

## 검증 및 한계

재현 명령(Node 22.17.0):

```powershell
npm ci
node --experimental-strip-types --test src/game/victory/victory.test.mjs
$testFiles = rg --files src -g '*.test.mjs' -g '*.test.ts'
node --experimental-strip-types --test $testFiles
npm run typecheck
npm run lint
npm run build
npm run format:check
```

승리 전용 테스트는 시드/UI 없이 실제 v3 데이터를 직접 사용한다. 8개 그룹의 개별 미충족, 8C3=56개 조합과 도시 누락, 네 변의 6도시/명소 구분, 4명소/3명소 경계, POI 일반도시 구분, 시설 0/3 동등성, 마지막 생존자/0명/파산자 재산, 여러 후보/조건/행위자/설정 우선순위, sample 및 손상된 맵/소유/종료 레코드, 불변성/확장 상태 보존/이벤트 1회/JSON 재호출을 검증한다.

실행 결과: `npm ci` 성공(취약점 0), 승리 테스트 11개 통과, 전체 Node 테스트 80개 통과(별도 맵 검증 파일 내부 13항목도 통과), typecheck/lint/build/format:check 통과. Node 22의 타입 제거 기능은 experimental 경고를 출력하지만 테스트는 정상 종료한다. lint 최초 실행에서 테스트의 `structuredClone` 전역 선언 문제를 발견해 담당 테스트 안에서 JSON 복사로 바꾼 뒤 다시 통과시켰다.

독립 규칙 모듈이라 화면 변경과 전용 프리뷰 번들은 없다. 기존 UI에 연결되지 않아 브라우저 화면만으로 이 모듈을 검증할 수 없다. 실제 연결 후 거래 직후·파산 정리 직후 승리 화면과 입력 차단의 브라우저 검증은 통합 담당 범위에 남는다. npm build는 기존 앱의 회귀 검증이며, 미연결 승리 모듈 자체는 전체 TypeScript 검사 및 직접 실행 테스트로 검증한다. 서버 저장/동시 실행/경제 정산 완료 여부와 임의 JSON 스키마 검증은 이 모듈의 책임이 아니다.
