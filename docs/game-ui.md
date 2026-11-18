# Poke Marble 게임 UI

## 확정 기획 · 2026-11-18

사람 **1명 + COMPUTER 3명**만 플레이한다. 기존 로컬 2~4인 교대 가정은 폐기했다. 참가 인원 선택·다른 플레이어 이름 입력·플레이어별 수동 파트너 지정 기능은 없다.

진입은 **게임 타이틀 → NEW GAME → 내 스타팅 1마리 선택 → 맵 선택 → 게임 시작** 순서다. 이상해씨·파이리·꼬부기·피카츄 중 하나를 선택하면 나머지 세 마리를 COMPUTER 1/2/3에 각각 자동 배정한다. `setup.ts`의 `createInitialRoster`는 ID·이름·제어 주체·파트너만 생성하며 자금·시작 위치·턴·AI 판단은 계산하지 않는다. 컴퓨터 배정 순서는 스타팅 표시 순서에서 내 선택을 제외한 순서로 고정했다.

맵 테마는 관동·성도 / 호연 / 신오다. MVP에서는 관동·성도만 선택 가능하며 나머지는 `준비중` native disabled 버튼으로 표시한다. 실제 관동·성도 mapId는 어댑터가 제공한 `view.map.id`를 사용한다. 현재 demo는 기반의 4칸 sampleMap만 제공하므로 완성 맵으로 표시하지 않는다.

## 작업 경계

담당 범위는 `src/ui/game/**`, 이 문서, `game-preview.html`이다. 공통 설정·`contracts.ts`·game-core·기존 main/app/styles 파일은 수정하지 않았다. AGENTS.md는 작업 폴더 및 상위 경로에서 발견되지 않았다. Sites 로컬 개발 지침과 computer-use 지침을 확인했다.

이 브랜치의 초기 UI 커밋 `953fc2d` 이후 init 커밋 `4eb5532`와 깨끗한 init 작업 트리를 확인해 자기 브랜치에만 merge했다(`3cc1d2c`). 다른 워크트리 변경·다른 에이전트 제어·main 머지·원격 푸시·배포는 하지 않는다.

## 독립 미리보기 · 실제 엔트리 연결

```sh
npm ci
node src/ui/game/demo/preview.mjs
```

Chrome에서 `http://127.0.0.1:5183/game-preview.html`을 연다. 일반 `npm run dev`에서는 `http://127.0.0.1:5173/game-preview.html`로 접속한다. 기존 `/`는 init의 개발 베이스캠프이며 이 게임 UI와 다르다.

별도 HTML은 기본 `vite build`의 index.html 엔트리에 자동 포함되지 않는다. 별도 번들 검증은 공통 설정을 수정하지 않고 다음 명령으로 실행한다.

```sh
node --input-type=module -e "import { build } from 'vite'; await build({configFile:false,base:'./',build:{outDir:'dist/game-preview',rollupOptions:{input:'game-preview.html'}}});"
```

실제 엔트리 담당자가 규칙 엔진·AI 연결 어댑터를 준비한 뒤 연결한다.

```ts
import { mountGameUI } from './ui/game';
import type { GameUIAdapter } from './ui/game';

declare const adapter: GameUIAdapter;
const mounted = mountGameUI(
  document.querySelector<HTMLElement>('#app')!,
  adapter,
);
// 화면 전환 또는 엔진 교체 시
mounted.destroy();
```

루트의 기존 형제 노드를 변경하지 않는다. destroy는 구독·다이얼로그·이동 타이머·스프라이트 프레임 루프를 해제하고 컴퓨터 실행의 AbortSignal을 취소한다. 초기화 화면의 Esc는 이전 단계로 돌아가며 선택한 스타팅을 유지한다.

## 어댑터와 후속 game-core / computer-ai 연결 요구

`adapter.ts`는 UI 전용 계약이며 공통 GameState/GameAction/GameEvent/MapDefinition을 import한다. 공통 Player에 controller 필드를 추가하지 않는다.

| 연결점                              | 호출자/어댑터 책임                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(GameSetup)`                  | 선택한 mapId와 4명 participants를 받는다. 첫 사람이 나, 나머지 3명은 computer다. 엔진 초기화와 자금·시작 위치는 연결부가 처리한다.                                        |
| `view.participants`                 | GameState와 별개로 PlayerId에 대응하는 human/computer 메타데이터를 유지한다. UI는 이름 문자열로 사람 여부를 추정하지 않는다.                                              |
| `getView / subscribe`               | 최초 상태와 변경된 불변 스냅샷, 이번 변경의 신규 이벤트를 제공한다. 상태 변경 후 반드시 발행한다.                                                                         |
| `view.actions / dispatch`           | 규칙 엔진이 허용 액션·disabled를 정한다. UI는 사람 차례이며 playerId가 현재 사람과 일치할 때만 전달한다.                                                                  |
| `view.prompt / choose`              | 구매·강화·정리 선택지와 가격은 엔진이 제공한다. 사람 차례만 모달을 열며 stale prompt ID와 choice ID는 연결부가 검증한다.                                                  |
| `movement.path`                     | 엔진에서 경유 칸·도착 칸을 전달한다. UI는 제공 경로를 연출할 뿐 주사위 합계·경로를 추론하지 않는다.                                                                       |
| `view.computer`                     | connected 여부와 현재 진행 상태 문자열을 제공한다. 미연결 시 UI에 연결 대기 상태를 표시한다.                                                                              |
| `runComputerTurn(playerId, signal)` | 현재 컴퓨터의 **전체 턴**을 실제 computer-ai 서비스에 위임하는 선택적 hook. AI가 엔진의 허용 액션으로 판단·실행·필수 선택·턴 종료를 수행하며 변경을 subscribe로 발행한다. |
| `restart`                           | 새 setup 스냅샷을 발행한다. UI는 타이틀로 돌아가고 기록을 비운다.                                                                                                         |

UI는 사람 행동을 컴퓨터 대신 dispatch하지 않는다. 컴퓨터 차례에는 주사위·턴 종료·필수 선택 버튼을 비활성화하고 HUD에 진행 상태를 표시한다. 읽기 전용 보드 정보·자산 조회는 가능하다. AI hook과 connected가 모두 있을 때만 자동 실행한다. hook이 없거나 connected=false면 진행 대기를 표시하며 재시도 루프를 돌리지 않는다.

실행은 `turnNumber:activePlayerId`마다 한 번으로 제한하며 앞선 이동 연출이 끝난 뒤 시작한다. hook의 Promise는 해당 컴퓨터 턴 처리가 끝나면 resolve해야 한다. 엔진은 턴 번호와 현재 플레이어를 일관되게 발행해야 한다. hook은 signal 취소 및 stale playerId를 확인해야 하며, 재시작/화면 파괴 이후에는 이전 세션 상태를 변경하면 안 된다. 실패 시 UI가 오류·명시적 재시도 버튼을 보여준다. 판단 알고리즘·가격·강화 상한·파산·승리 판정·AI 스케줄러의 게임 규칙은 이번 UI 범위에 포함하지 않는다.

실제 연결부는 GameSetup participants에서 엔진 Player를 만들고, 별도로 controller 메타데이터를 보존해야 한다. computer-ai는 사람과 동일한 규칙 엔진의 합법 액션 경계를 사용해야 한다. 엔진이 자동으로 AI를 실행하는 구조라면 hook 중복 호출을 방지하는 연결부를 제공하거나 connected=false로 UI 실행을 끈 상태에서 진행 상태만 발행해야 한다.

## 팬게임 스타일 · 표시 가정

- [Pokémon Uranium 전투 화면](https://blog.retinadesgastada.com.br/2017/11/nao-jogando-pokemon-uranium.html?m=1)의 장면/명령 메뉴 분리와 [Insurgence 파티 화면](https://www.rebornevo.com/forums/topic/28420-pokemon-insurgence-help/)의 원형 캐릭터·길쭉한 상태창을 시각 참고했다. 스크린샷을 제품 에셋으로 넣거나 원본 UI 리소스를 수집하지 않았다.
- 두꺼운 사각 테두리 반복을 줄이고, 둥근 파트너 받침·비대칭 HUD·입체 명령 버튼·하단 대화창으로 역할을 구분한다. init의 픽셀 스프라이트를 그대로 재사용한다.
- `scenery.ts`는 직접 작성한 장식 SVG다. 관동·성도의 실제 지리·도시 위치·이동 경로를 의미하지 않는다. 외부 에셋을 추가하지 않았다.
- map.tiles 순서를 정사각 테두리에 균등 배치한다. 최소 5×5로 중앙 장면 공간을 확보하고, 빈 곳에 임의 도시를 만들지 않는다. 출발은 오른쪽 아래, 이후 왼쪽 방향이다. BoardSide 규칙 계산은 하지 않는다.
- 같은 칸의 말은 2×2로 축소 배치해 4마리가 모두 보이게 한다. Idle/Walk 시트와 durationsMs는 init findSprite에서 받으며 프레임 재생·경로 이동 연출만 담당한다.
- 움직임 줄이기 설정에서는 스프라이트 프레임과 이동 연출을 멈춘다. 통화 ₽는 임시 표시 가정이다.
- native dialog는 포커스를 제한한다. 필수 선택·결과 모달은 Esc 닫기를 막고 정보 모달만 Esc로 닫는다. 키보드 포커스 표시를 유지한다.
- 여행 기록은 최근 30개를 유지한다. 기본 접힘이며 펼친 상태를 갱신 간 보존한다. 영구 저장·리플레이는 범위 밖이다.

## 데모의 한계

`demo/adapter.ts`에만 컴퓨터 고정 행동·고정 주사위 1·임시 자금과 가격을 둔다. **실제 AI 판단 로직 및 실제 game-core는 미연결**이다. 상단 DEMO와 고정 시연 안내를 항상 표시한다. 실제 연결에서 demo를 import하지 않는다.

내 주사위 → 구매 → 턴 마치기 → COMPUTER 1/2/3 자동 이동 → 내 차례로 복귀한다. 다음 내 턴에는 강화, 그다음에는 자산정리, 네 번째 주사위에는 시연 결과가 나온다. 재시작은 타이틀로 돌아간다. 컴퓨터는 도시 구매 판단이나 최적화 없이 이동·턴 종료만 시연한다.

## 검증

```sh
node --test src/ui/game/presentation.test.mjs src/ui/game/demo/adapter.test.mjs
npm run typecheck
npm run lint
npm run build
```

Node 내장 TypeScript 타입 제거로 테스트하므로 공통 설정 변경·추가 의존성이 없다. 5개 테스트는 다음을 검증한다.

- 1~80개 타일이 정사각 테두리의 서로 다른 칸을 차지함.
- 네 스타팅 각각에서 사람 1명·컴퓨터 3명과 중복 없는 파트너가 배정됨.
- 사람의 playing 차례만 행동 가능하며 setup/finished/컴퓨터 차례는 불가.
- 데모의 자동 컴퓨터 세 턴, 구매·강화·정리·결과·재시작·구독 해제.
- 컴퓨터 hook의 stale player ID와 AbortSignal 취소가 상태 진행을 막음.

기반 반영 후 typecheck/lint/build, 테스트 5건, 별도 게임 엔트리 번들 검증 통과. 완성 맵·실제 엔진·실제 AI 통합 플레이는 별도 연결 작업이 필요하다.

### Chrome 실제 검증 기록

이전 URL 식별 오류 이후 이번 작업에서 Chrome 창을 직접 복원하고 동일한 로컬 미리보기로 다시 검증했다. 창 기준 약 1118×900과 590×900 두 크기에서 확인했다. 이전의 Chrome 미검증 한계는 아래 확인 범위에 대해 해소했다.

- 타이틀 → NEW GAME → 스타팅 네 마리 → 맵 선택 → 게임 진입. 참가 인원/다른 사람 이름 입력이 없음.
- Tab/Enter로 파이리 선택 시 사람 파이리와 컴퓨터의 나머지 세 마리가 재배정됨. Esc로 맵에서 이전 단계로 돌아가도 선택 보존.
- 관동·성도 선택 상태, 호연·신오 native disabled 및 준비중 표시.
- 보드·중앙 지형·HUD·말 4마리 표시, 사람/COMPUTER 1/2/3 구분. 겹친 말 잘림과 지도 제목 겹침을 발견해 수정 후 재확인.
- 사람 주사위 후 구매 → 잔액 800 → 턴 종료 → 컴퓨터 세 턴 → 사람 복귀(TURN 5).
- 강화 → 잔액 700 → 컴퓨터 순환 → 자산정리 → 잔액 850 → 컴퓨터 순환 → 결과 모달의 사람 승리 확인.
- 필수 구매 모달 Esc 차단, Enter 구매/강화/매각 결정, 결과에서 Enter로 타이틀 재시작.
- 컴퓨터 차례의 사람 행동 버튼 비활성 및 진행 상태, 사람 복귀 후 주사위 버튼 활성 확인.
- 좁은 창에서 보드/HUD 세로 배치, HUD 2열, 스타팅 2×2, 맵 목록 세로 배치, 결과 모달과 버튼 사용 가능. 좁은 창은 세로 스크롤을 사용하며 가로 잘림은 없었음.
- 검증 후 Chrome 창 너비를 원래 크기로 복원했다. 실제 AI 미연결/실제 지리 미구현 한계는 그대로다.
