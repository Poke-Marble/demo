# Poke Marble 게임 UI

담당 범위는 `src/ui/game/**`, 이 문서, `game-preview.html`이다. 공통 설정과 `contracts.ts`, 기존 엔트리는 수정하지 않는다. AGENTS.md는 작업 폴더 및 상위 경로에서 발견되지 않았다. Sites 로컬 개발 지침과 computer-use 검증 지침을 확인했다.

## 엔트리 연결

초기 기반을 이 브랜치에 반영한 뒤 `npm ci`, `npm run dev`를 실행하고 Chrome에서 `http://127.0.0.1:5173/game-preview.html`을 연다. 별도 HTML은 Vite 개발 서버용이며 기본 `vite build`의 index.html 엔트리에 자동 포함되지 않는다. 배포용 공통 빌드 설정은 이 작업에서 변경하지 않는다.

기존 `/`는 init의 개발 베이스캠프다. 이 UI의 게임 화면은 반드시 `/game-preview.html`로 접속한다. 독립 포트가 필요하면 `node src/ui/game/demo/preview.mjs` 실행 후 `http://127.0.0.1:5183/game-preview.html`을 연다. 기반 반영 전에는 실행기 마지막 인자로 init 워크트리 경로를 전달할 수 있다. 이 경우 명시된 스프라이트 로더·샘플맵만 읽기 전용 참조하며 캐시는 담당 demo/.cache에 저장한다.

실제 엔트리 담당자는 다음과 같이 연결한다. 게임 규칙 구현체를 UI 어댑터로 변환하는 책임은 호출자에 있다.

```ts
import { mountGameUI } from './ui/game';
import type { GameUIAdapter } from './ui/game';

const adapter: GameUIAdapter = /* 규칙 엔진을 연결하는 구현체 */;
const mounted = mountGameUI(document.querySelector<HTMLElement>('#app')!, adapter);
// 다른 화면으로 전환할 때
mounted.destroy();
```

`mountGameUI`는 루트의 기존 형제 노드를 건드리지 않는다. `destroy()`는 구독·다이얼로그·대기 타이머와 마운트 노드를 정리한다. 전역 CSS는 `.pm-*` 및 `.pm-game` 범위만 사용한다.

## 어댑터 경계

`adapter.ts`는 UI 전용 타입이며 공통 계약을 복제하지 않는다. GameState, GameAction, GameEvent, MapDefinition은 init의 공통 계약을 가져온다.

| 메서드/데이터       | 책임                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| getView / subscribe | 최초 상태 / 변경된 불변 스냅샷과 신규 이벤트 제공                             |
| actions             | 현재 허용된 버튼과 GameAction 제공. UI가 잔액이나 위치로 액션을 추론하지 않음 |
| dispatch            | 공통 GameAction만 전달. 주사위 결과 등 계산값을 보내지 않음                   |
| start               | 2~4명 이름·파트너 선택 전달. 초기 자금과 시작점은 어댑터가 설정               |
| prompt / choose     | 구매·강화·자산정리의 제목·금액·선택지 제공과 선택 ID 전달                     |
| movement.path       | 중간 칸과 도착 칸 제공. UI는 순서대로 재생하며 주사위 합산·경로 추론하지 않음 |
| restart             | 새 로비 스냅샷 제공. UI 내부에서 게임 상태 초기화하지 않음                    |

액션 처리 메서드는 동기 또는 Promise를 반환할 수 있다. 상태 변경은 반드시 subscribe로 발행한다. 구독 이벤트는 누적 재전송이 아닌 이번 변경의 신규 이벤트만 제공해야 한다. 에러는 throw/reject하면 화면 상태 영역에 안내한다. `choose`는 stale prompt ID를 검증해야 한다. disabled 선택지는 UI와 어댑터 양쪽에서 거부한다. 액션 중복 클릭은 UI에서 잠근다.

로비 start/restart/자산정리 액션은 공통 계약에 아직 없어 UI 어댑터 메서드로 격리했다. 향후 계약 확정 시 엔진 연결부만 변환한다. 가격·통행료·자산 가치·강화 상한·턴 진행·파산·승리 판정은 UI에서 계산하지 않는다.

## 표시·가정

- 로비: 2~4명, 이름 20자, 서로 다른 파트너. 파트너 4종은 init에 스프라이트가 있는 이상해씨·파이리·꼬부기·피카츄다. 중복 파트너 금지는 **UI 가정**이며 규칙 확정 시 변경 가능하다.
- 화면: 포켓몬 팬게임 방향으로 픽셀 테두리, 타이틀·파트너 선택창, 타일 지형, 전투형 HUD, 하단 대화창을 적용했다. 지형과 건물은 CSS 장식이며 새로운 에셋을 수집하지 않는다.
- 보드: map.tiles 배열 순서를 정사각 테두리에 균등 배치한다. 시작은 오른쪽 아래, 이후 왼쪽 방향이다. 최소 3×3 격자로 4칸 샘플도 중앙 지형이 보인다. 빈 공간은 임의 도시로 채우지 않는다. BoardSide에 따른 규칙 판정은 하지 않는다.
- 말: init findSprite의 Idle/Walk 시트와 durationsMs를 재사용해 프레임을 재생한다. 이동은 제공 경로의 칸 단위 180ms 연출이다. 움직임 줄이기 설정에서는 프레임을 멈추고 즉시 도착한다. destroy 시 프레임 루프도 해제한다.
- 통화: 어댑터 숫자를 ko-KR 형식과 ₽로 표시한다. 통화 단위는 임시 표시 가정이다.
- 모달: native dialog로 키보드 포커스 제한, Enter/Space 버튼 조작, 허용된 모달만 Escape 닫기. 필수 선택·결과 모달은 Escape를 막는다.
- 기록: 이번 마운트의 최근 이벤트 30개 표시. 영구 저장·리플레이는 범위 밖이다.
- 결과: victory의 승자·이유 표시. 재시작 시 어댑터가 setup 상태를 발행해야 기록을 비운다.

## 데모 격리

`demo/adapter.ts`는 init의 4칸 sampleMap/sampleState만 쓰는 **UI fixture**다. 관동·성도 전체 맵이나 완성 규칙을 표방하지 않는다. 상단 DEMO, 샘플 보드 제목, 고정 주사위·모의 규칙 안내를 항상 표시한다. 별도 에셋 수집·복사는 없다.

시작 → 주사위 → 구매 → 주사위 → 강화 → 주사위 → 자산정리 → 주사위 → 결과 → 새 여행 순서로 모든 화면을 볼 수 있다. 각 선택은 시연용 금액만 반영한다. 턴 마치기로 순서를 넘길 수 있다. 실제 게임 연결 시 demo 파일을 가져오지 않는다.

## 검증

- `node --test src/ui/game/presentation.test.mjs src/ui/game/demo/adapter.test.mjs`: Node 내장 TypeScript 타입 제거 사용(공통 설정·추가 의존성 없음). 1~80칸의 테두리 유일성, 2~4인 허용, 인원 범위·공백 이름·중복 파트너 거부, 데모 액션/이동/모달/결과/재시작/구독 해제 검증.
- 기반 반영 후 `npm run typecheck`, `npm run lint`, `npm run build` 실행 대상.
- Chrome 확인 대상: 로비 2/3/4인, 이름/캐릭터 선택, 정사각 보드와 잔액/턴, 이동 중 입력 잠금, 구매·강화·정리 모달, 기록/결과/재시작, Tab/Enter/Escape, 좁은 화면에서 세로 배치.
- 최종 실제 실행 결과와 기반 미준비 한계는 아래 검증 기록에 기재한다.

### 검증 기록

- UI 기능 커밋 `953fc2d` 이후 init 커밋 `4eb5532`와 깨끗한 init 작업 트리를 확인하고 자기 브랜치에만 merge했다(`3cc1d2c`).
- 기반 반영 후 `npm ci` 완료. 팬게임 스타일 수정 후 `npm run typecheck`, `npm run lint`, `npm run build`와 테스트 3건 통과.
- 별도 게임 엔트리도 Vite의 프로그램 API로 input을 `game-preview.html`, outDir을 `dist/game-preview`로 지정하여 번들 검증 통과. 공통 빌드 설정은 수정하지 않았다. 산출물은 로컬 검증용이며 배포하지 않았다.
- 독립 미리보기 HTTP 200 확인. Chrome 자동화는 현재 URL을 신뢰할 수 있게 식별하지 못해 도구가 중단했다. 이후 브라우저 입력을 멈췄다. 따라서 실제 Chrome 레이아웃·키보드 검증은 미완료이며 수동 확인이 필요하다.
- 완성 관동·성도 맵과 실제 규칙 엔진은 이 브랜치에 없으므로 실제 엔진 연결 플레이 검증은 미완료다. 4칸 샘플 데모를 통한 UI 연결만 제공한다.
