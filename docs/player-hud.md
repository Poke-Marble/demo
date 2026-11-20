# 플레이어 HUD

`feat/player-hud`의 독립 HTML/CSS 컴포넌트다. 구현 소유 범위는 `src/ui/game/hud/**`, `hud-preview.html`, 이 문서다. 기존 게임 진입점·어댑터·공통 CSS·integration·portraits·루트 설정은 수정하지 않는다. 실제 게임 화면에 꽂는 작업은 부모 통합 담당이 수행한다. Phaser·UI 프레임워크·폰트 의존성을 추가하지 않았다.

## 실행

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5182 --strictPort
```

프리뷰: <http://127.0.0.1:5182/hud-preview.html>. 포트가 사용 중이면 실패하며 다른 포트로 우회하지 않는다. Windows npm 래퍼의 인수 전달 영향을 피하려고 Vite 실행 파일을 직접 사용한다.

실제 `kantoJohtoMap`, `createInitialRoster('pokemon:0025')`, `createGame`의 초기 현금 1,500을 사용한다. 좌석 1이 전기인 구성으로 좌석 색과 타입 색을 구별할 수 있다. 도시·명소 소유권과 특성·가호·시험·컴퓨터 상태는 프리뷰에 명시된 표시용 스냅샷이다. 버튼으로 차례 전환, 확정 통행료, 표정, 파산, 긴 이름·큰 금액, 좌석 순서 변경, 동일 상태 갱신, 초기화를 시연한다. 보드는 별도 렌더러를 띄우지 않는 자리 표시자다.

## 컴포넌트 API

```ts
import {
  mountPlayerHud,
  cashEventsFromGameEvents,
  type DisplayMeta,
} from './src/ui/game/hud';

const hud = mountPlayerHud(hudHost, adapter.getView(), {
  meta: displayMeta,
  onAssetDetails({ playerId, view, assets, trigger }) {
    // 부모의 자산 창을 연다. assets.cities / assets.landmarks는 이 view의 소유권이다.
    openAssets({ playerId, view, assets, returnFocusTo: trigger });
  },
});

const unsubscribe = adapter.subscribe((update) => {
  hud.update(update.view, {
    // 안정적인 확정 update ID가 없으면 증감 연출은 생략한다.
    cashEvents: update.id
      ? cashEventsFromGameEvents(update.id, update.events)
      : [],
    emotionCues: update.emotionCues ?? [],
    meta: displayMetaFor(update.view),
  });
});

// 화면 해제 / 새 게임 세션: 먼저 구독을 해제하고 HUD를 새로 마운트한다.
unsubscribe();
hud.destroy();
```

`mountPlayerHud(root, view, options?)`는 자신의 subtree만 추가한다. 반환값은 `element`, `update(view, input?)`, `refreshEmotions(playerId?)`, `destroy()`다. `GameView`를 직접 받으므로 기존 `state.players`, `participants`, `state.holdings`, `state.activePlayerId`, `map.tiles` 계약을 바꿀 필요가 없다. 원본 데이터와 게임 규칙을 변경하지 않는다.

플레이어 `id`별 행·버튼·초상화를 유지한다. 동일 상태 갱신과 현금/메타 변경은 초상화 노드나 로더를 새로 만들지 않는다. 포켓몬 ID가 바뀔 때만 해당 초상화를 교체하며, 플레이어 제거 시 로더와 타이머를 해제한다. 이름이 바뀌어도 초상화 접근성 이름은 타입 파트너를 가리키고 실제 플레이어 이름은 별도 제목에서 갱신된다. 긴 이름은 생략하지 않고 줄바꿈한다. `destroy()`는 반복 호출 가능하며 이후 `update()`는 무시한다. 새 게임에서는 이벤트 중복 기록과 지속 표정을 함께 초기화하기 위해 재마운트한다.

`onAssetDetails`가 없으면 자체 네이티브 `dialog`에 현재 소유 도시·특별 명소 목록을 표시한다. 버튼은 Tab/Enter/Space로 조작할 수 있고 Escape/닫기 후 버튼으로 포커스를 돌려준다. 기본 상세 창은 다음 `update()` 때 닫아 이전 소유권이 남지 않도록 한다. 부모 콜백을 쓰면 부모가 상세 창 갱신과 포커스 복귀를 관리한다.

## 기존 emotion controller 공유

기본 모드는 HUD가 기존 `createEmotionController`를 내부 생성한다. `update(..., { emotionCues })`를 적용하고, 권위 상태의 파산·승리를 동기화한다. 기존 `eventEmotionCues(events, state, updateId)` 결과도 전달할 수 있다. 잔액 차이로 표정을 추측하지 않는다.

부모가 이미 controller를 사용한다면 같은 인스턴스를 빌려준다. HUD는 빌린 controller를 초기화하거나 파괴하지 않는다. 빌린 모드에서는 `input.emotionCues`를 적용하지 않으므로 부모가 이벤트와 지속 상태를 한 번만 처리한다.

```ts
import {
  createEmotionController,
  eventEmotionCues,
} from './src/ui/game/portraits/emotions';
import { mountPlayerHud, cashEventsFromGameEvents } from './src/ui/game/hud';

let hud: ReturnType<typeof mountPlayerHud> | undefined;
const emotions = createEmotionController((id) => hud?.refreshEmotions(id));
const initial = adapter.getView();
emotions.syncState(initial.state);
hud = mountPlayerHud(hudHost, initial, { emotions });

const unsubscribe = adapter.subscribe((u) => {
  emotions.syncState(u.view.state);
  if (u.id) {
    for (const cue of eventEmotionCues(u.events, u.view.state, u.id))
      emotions.apply(cue);
  }
  for (const cue of u.emotionCues ?? []) emotions.apply(cue);
  hud?.update(u.view, {
    cashEvents: u.id ? cashEventsFromGameEvents(u.id, u.events) : [],
  });
});

function destroyScreen() {
  unsubscribe();
  hud?.destroy();
  emotions.destroy(); // 생성한 부모가 정리한다.
}
```

기존 `createPortrait`와 수록 PMD 파일을 그대로 사용한다. 이미지는 40×40이며 CSS 확대/크롭/보간을 추가하지 않는다. 동일 reaction의 재설정은 기존 로더에서 생략된다. 실제 reaction 전환에서는 기존 비동기 이미지 로더의 세대 검사·실패 fallback을 사용한다. 파일별 출처·제작자·조건은 기존 `portraits/catalog.ts`의 `portraitCredits`를 프리뷰의 접힌 크레딧에 재사용한다.

## 표시 데이터와 이벤트

| 표시                            | 권위 입력 / 동작                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 이름·현금·파산                  | `state.players[].name / balance / bankrupt`                                                                       |
| 사람·컴퓨터                     | 동일 ID의 `participants[].controller`. 없으면 중립적인 참가자 표시                                                |
| 현재 차례                       | `phase === 'playing'`, `activePlayerId`, 비파산 플레이어. 삼각형·문구·이중 외곽선·`aria-current="step"`           |
| 타입 색·문양                    | 기존 `ownerTheme / ownerMark`의 포켓몬 ID 매핑. 풀 잎사귀 / 불 불꽃 / 물 물방울 / 전기 번개. 알 수 없는 종은 중립 |
| 도시·특별 명소 수               | `holdings.ownerId`와 `map.tiles.kind === 'city' / 'landmark'`. 시설 레벨·이름·좌석으로 추측하지 않음              |
| 특성·가호·시험 체류·컴퓨터 상태 | 외부의 플레이어별 optional display meta만 작은 chip으로 표시                                                      |
| 총자산·예상 수입·쿨다운·미납    | 외부가 명시한 필드만 표시. 0도 유효. 미제공 값은 계산하거나 표시하지 않음                                         |

```ts
const displayMeta: DisplayMeta = {
  'player:1': {
    abilityName: '정전기',
    blessing: '칠색조',
    trialStay: '루기아 · 도전 대기',
    // 아래 필드는 실제 권위 데이터가 있을 때만 전달한다.
    // totalAssets, expectedIncome, unpaidAmount: number
    // abilityCooldown, computerStatus: string
  },
};
```

`update`에서 meta를 생략하면 이전 메타를 유지한다. 전달하면 전체 교체하며 `{}`로 모두 비울 수 있다. 컴퓨터 상태는 컴퓨터 참가자에서만 표시한다. 전역 `view.computer.status`를 모든 컴퓨터의 개별 상태로 복제하지 않는다.

현금은 이름과 다른 `dl > dd.pm-balance[data-testid="pm-balance"]`에 단위와 함께 표시한다. P1/COMPUTER 1 숫자를 현금에 붙이지 않는다. 짧은 증감 문구는 `ConfirmedCashEvent { id, playerId, amount }`로만 표시한다. 현재 기본 GameEvent에서 확정 금액을 가진 `toll-paid`만 helper가 변환한다. 시작 보상·매입·매각 등 확장 경제 이벤트는 통합 계층이 실제 확정 금액과 안정적인 이벤트 ID를 전달해야 한다. 잔액 두 개를 빼서 이벤트를 만들지 않는다.

같은 세션의 동일 이벤트 ID는 다시 읽거나 타이머를 재시작하지 않는다. 한 update의 플레이어별 증감은 합쳐 1.8초 표시한다. 0/비정상 금액/없는 플레이어 입력은 무시한다. 현금 수치 자체는 항상 최신 `view`에서 표시하며 증감 이벤트로 변경하지 않는다.

단 하나의 `polite` live region에 차례 변경과 확정 금액만 180ms 동안 모아 전달한다. 최초 마운트·동일 갱신·초상화 표정·타이머 만료는 읽지 않는다. 행 전체를 live region으로 만들지 않았고 증감 시각 문구는 `aria-hidden`이다. 이동/깜빡임 애니메이션은 없으며 reduced motion 규칙도 제공한다. 실제 스크린리더 음성 청취 검증은 별도로 남아 있다.

## Phaser 보드 및 폰트 연결

```html
<div class="pm-hud-layout">
  <section class="pm-hud-board-slot game-board-host" id="board-host"></section>
  <aside class="pm-hud-slot" id="hud-host"></aside>
</div>
```

```css
.game-board-host {
  height: clamp(320px, 65vw, 740px);
}
/* ui-polish가 폰트를 로드한 뒤 부모 범위에서 지정한다. */
.game-screen {
  --pm-font-game: '부모가 로드한 게임 폰트', sans-serif;
}
```

```ts
// boardScene은 부모가 이미 만든 Phaser Scene이다. HUD는 Phaser를 import하지 않는다.
const observer = new ResizeObserver(([entry]) => {
  if (!entry) return;
  const { width, height } = entry.contentRect;
  if (width > 0 && height > 0) boardScene.scale.resize(width, height);
});
observer.observe(boardHost);
// 화면 해제 시 observer.disconnect()와 부모의 board destroy도 호출한다.
```

`hud.css`의 선택적 `.pm-hud-layout`은 `minmax(0, 1fr) 290px`의 두 영역을 예약한다. 보드 폭은 viewport 전체가 아닌 **boardHost의 실제 content box**로 계산한다. HUD는 canvas 위에 absolute overlay를 만들지 않으므로 입력 영역과 겹치지 않는다. 760px 이하는 보드 다음에 2×2 HUD, 340px 이하는 한 열 목록이다. HUD만 마운트해도 되며 이때 부모가 열 배치를 관리한다. 프리뷰의 시연 제어부는 모바일 HUD 다음에 배치한다.

본문과 현금·버튼은 `--pm-font-game` 또는 부모의 글꼴을 상속한다. 폰트 파일 다운로드와 전역 폰트 설정은 `feat/ui-polish` 담당이다. 음소거 패널과 주사위 결과 역시 이 브랜치에서 수정하지 않는다.

## 검증과 산출물

```powershell
node --test src/ui/game/hud/model.test.mjs
npm run typecheck
npm run lint
npm run build
node src/ui/game/hud/build-preview.mjs
node src/ui/game/hud/browser-check.mjs
npx prettier --check src/ui/game/hud hud-preview.html docs/player-hud.md
```

단위 테스트는 맵 kind와 소유권, 좌석 재배치와 타입, 권위 차례, optional 메타, 확정 현금 이벤트만 변환하는 동작을 검사한다. 브라우저 스크립트는 기존 `../feat-gameplay-feedback/artifacts/browser-tools/node_modules/playwright/index.mjs`를 읽기 전용 재사용한다. 다른 위치라면 `HUD_PLAYWRIGHT_PATH` 환경변수로 지정한다. 시스템 Chrome 경로는 `C:/Program Files/Google/Chrome/Application/chrome.exe`다. 새 패키지를 설치하지 않는다.

전용 번들은 `dist/player-hud/hud-preview.html`이다. 일반 `npm run build`의 기본 진입점은 변경하지 않았다. 일반 빌드는 `dist`를 비우므로 **일반 빌드 → 전용 빌드 → 브라우저 검사** 순서를 사용한다.

Chrome 157 검증: 1280×1000, 390×844(reduced motion) 및 전용 production bundle. DOM 측정으로 보드/행/초상화/이름/금액/버튼의 겹침과 가로 overflow를 검사한다. 일반 갱신과 좌석 재배치의 이미지 노드 재사용, 포커스 보존, Enter로 상세 열기·Escape 복귀, 확정 증감·중복 이벤트·live region 중복 방지, 외부 controller 공유·해제, 파산·표정·큰 금액·긴 이름을 확인한다.

로컬 검증 결과는 Git 제외 경로 `artifacts/player-hud/`에 저장한다.

- `desktop-1280.png`, `mobile-390.png`: 기본 배치
- `desktop-stress-1280.png`, `mobile-stress-390.png`: 긴 이름·큰 금액·파산
- `cash-emotion.png`, `assets-keyboard.png`: 확정 통행료·표정 / 키보드 상세
- `production-1280.png`: 전용 번들 실행
- `browser-report.json`: 검사 결과 및 페이지 오류 목록

main 머지·원격 push·배포는 수행하지 않는다.
