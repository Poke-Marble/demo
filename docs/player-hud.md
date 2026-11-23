# 플레이어 HUD

`src/ui/game/hud/`의 HTML/CSS 컴포넌트이며 실제 게임 UI에서 사용한다.

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
