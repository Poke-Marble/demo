# Phaser 보드 렌더러 통합 계약

구현: `src/ui/game/phaser/index.ts`의 `createPhaserBoard`. 보드·지역 모형·캐릭터·이동·확정 결과의 강조는 Phaser, 카메라 버튼·접근성 목록·크레딧은 HTML이다. 메뉴·설정·구매창·HUD 및 기존 WebAudio 버스는 통합 담당 소유다. 기존 `src/ui/game/index.ts`, adapter, integration, board, art와 규칙 모듈은 수정하지 않았다.

## 공식 API 확인

2026-11-19 공식 릴리스와 npm dist-tag를 확인해 안정 버전 **Phaser 4.2.1**을 정확히 고정했다. 공식 API 사이트 표기는 4.1.0이므로, 실제 설치된 4.2.1의 TypeScript 선언과 소스 및 Chrome 실행도 함께 검증했다.

- [공식 릴리스 4.2.1](https://github.com/phaserjs/phaser/releases/tag/v4.2.1)
- [Game / 비동기 destroy](https://docs.phaser.io/api-documentation/class/game)
- [GameConfig / AUTO·CANVAS·noAudio](https://docs.phaser.io/api-documentation/typedef/types-core)
- [ScaleManager / FIT](https://docs.phaser.io/phaser/concepts/scale-manager)
- [Sprite 프레임 애니메이션](https://docs.phaser.io/phaser/concepts/animations)
- [Tween / stop은 complete를 호출하지 않음](https://docs.phaser.io/phaser/concepts/tweens)

Phaser 4의 프레임 `duration`은 해당 프레임의 실제 시간이다. 기존 AnimData에서 생성된 `durationsMs`를 그대로 전달하며 임의의 고정 FPS로 원본 타이밍을 대체하지 않는다.

## 기본 연결

```ts
import { createPhaserBoard } from './phaser';

const board = createPhaserBoard({
  view: adapter.getView(),
  onSelect(tileId) {
    // HTML 상세 패널 표시. 실제 선택/구매/비행의 합법성은 adapter가 판단.
    openTileDetails(tileId);
  },
  onLockChange(locked) {
    setBoardPresentationBusy(locked); // HTML HUD의 입력 잠금 이유 하나로 합산
  },
});
const boardElement: HTMLElement = board.mount(boardHost);
await board.ready;
const unsubscribe = adapter.subscribe((update) => {
  void board.present(update).catch(showPresentationError);
});

// 화면 종료 시
unsubscribe();
await board.destroy();
```

공유 권위 타입 `GameView`의 `map: MapDefinition`과 `state: GameState`, `UIUpdate`를 직접 사용한다. 별도의 게임 상태 스키마나 비용·소유권·경로·주사위·RNG·AI·승리 계산은 없다. 전달된 입력을 변경하지 않는다. `UIUpdate.movement.path`는 중간 칸과 도착 칸을 포함해야 한다. 누락된 경로를 주사위나 칸 번호에서 추론하지 않는다.

### 반환 객체

| 멤버                                                      | 계약                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `element: HTMLElement`                                    | HTML 셸. 내부에 캔버스 한 개, 카메라 버튼, 접힌 칸 선택 목록, 크레딧이 있다.                                                                           |
| `mount(parent): HTMLElement`                              | 셸을 부모에 붙인다. 양수 너비가 있는 컨테이너에서 사용한다. 같은 셸을 다시 붙일 수 있다.                                                               |
| `ready: Promise<void>`                                    | Scene, 초기 텍스처와 캐릭터 렌더 완료. 먼저 mount하고 await한다.                                                                                       |
| `update(view \| uiUpdate, visuals?): Promise<Completion>` | 스냅샷을 반영한다. `UIUpdate` 입력은 `present`와 같다. Game/Scene/canvas를 다시 만들지 않는다.                                                         |
| `move({playerId, path}, {signal}?)`                       | 이미 전달받은 경로만 한 칸씩 표시한다. 상태 확정은 별도 `update`/`present`로 전달한다.                                                                 |
| `present(uiUpdate, {signal}?)`                            | 직렬 큐에서 스냅샷 → 경로 이동 → 확정 건설 강조 → 순서 있는 effects → 최종 스냅샷을 표시한다.                                                          |
| `cancel(): void`                                          | 현재 작업과 이미 대기 중인 작업을 취소한다. 게임 액션은 발생하지 않는다. 최종 권위 위치로 즉시 맞추려면 `await skip()`을 사용한다.                     |
| `skip(): Promise<void>`                                   | 현재/대기 연출을 취소하고 호출 시점의 최신 권위 스냅샷으로 정렬한다. 이후 새 업데이트는 그 뒤에 직렬 실행된다.                                         |
| `setInputLocked(boolean)`                                 | HTML 모달/AI/외부 연출 등의 외부 잠금. 연출 중에는 내부 잠금도 자동 합산된다.                                                                          |
| `setZoom(number)`                                         | 1–2.5로 제한. HTML 확대/축소/전체 보기 버튼과 같은 카메라를 조절한다. 확대 상태에서는 포인터 드래그로 이동한다.                                        |
| `resize(): void`                                          | 부모 크기로 FIT 갱신. ResizeObserver가 자동 호출하므로 일반 resize는 별도 연결 불필요.                                                                 |
| `destroy(): Promise<void>`                                | 작업을 취소하고 실제 Phaser DESTROY까지 기다린다. 텍스처·Tween·Scene 입력·Game·ResizeObserver·미디어/DOM 리스너를 정리하고 셸을 제거한다. 재호출 가능. |

`Completion`은 `{status: 'completed' | 'cancelled' | 'destroyed'}`다. 정상 취소는 reject하지 않는다. 텍스처 디코딩이나 연결한 HTML presenter의 실제 오류는 reject하며 입력 잠금은 finally에서 해제한다. `present`의 같은 `update.id` 재전달은 같은 Promise를 반환하고 연출을 반복하지 않는다. 업데이트 ID 캐시는 최근 512개다. effects는 별도의 `request.id`로 세션 내 중복을 방지한다. 새 게임 세션에는 기존 보드를 destroy하고 새 factory를 생성한다. 매 업데이트마다 생성하지 않는다.

`onLockChange`는 합산된 현재 잠금 상태를 알리는 콜백이다. 그 값을 곧바로 같은 보드의 `setInputLocked`에 다시 넣으면 재귀가 되므로 HTML HUD 상태에만 반영한다. 외부 잠금 이유는 별도로 합산해 `setInputLocked`에 전달한다. 자동 잠금은 `aria-disabled`와 콜백 가드로 입력을 차단하여 키보드 포커스를 보존한다. 외부 잠금/파괴는 HTML 버튼의 native disabled도 적용한다.

### 건설·소유 타입과 대표시설

```ts
await board.update(view, {
  construction: new Map([
    [tileId, { stage: 'final', owner: authoritativeOwner }],
  ]),
  metadata: new Map([[tileId, { finalFacility: 'lighthouse' }]]),
});
```

선택적인 `BoardVisuals`는 기존 아트 타입 `ConstructionVisual`, `BuildingMetadata`를 사용한다. 생략하면 기존 `constructionFromHolding`과 `ownerFromInput`을 재사용해 표시한다. 이 변환은 기존 표시 규약이며 경제 계산이 아니다. 소유 타입 팔레트·문양은 기존 `ownership.ts`, 도시 대표시설과 지역 모형은 기존 `createFacility`를 사용한다. 실제 맵의 content 메타데이터가 더 풍부하면 기존 `presentationMap` 또는 별도 metadata map을 전달한다.

## 기존 VS / 비행 HTML presentation 연결

`presentEffect(request, signal): Promise<void>`를 옵션으로 제공하면 effects를 기존 HTML presenter에 위임한다. 기존 `createSpecialEventPresenter`의 `enqueue`/`skip`와 다음처럼 연결할 수 있다. 오디오는 기존 presenter/버스가 담당한다.

```ts
presentEffect: async (request, signal) => {
  if (signal.aborted) return;
  const abort = () => specialPresenter.skip();
  signal.addEventListener('abort', abort, { once: true });
  try {
    await specialPresenter.enqueue([request]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
};
```

보드가 effects를 위임받았으면 같은 effects를 HTML presenter에 다시 직접 enqueue하지 않는다. 실제 VS 도입부, 비행 대화상자, 사용자 선택은 기존 HTML presenter의 역할이다. 연결하지 않은 독립 프리뷰에서는 확정된 `fly.from/to`의 목적지까지 보드 캐릭터를 곡선 높이로 이동하고, `trial-intro.tileId`에는 보드 모형 강조만 표시한다. 전설 시험 결과나 비행 목적지의 적법성은 계산하지 않는다. 취소 시 AbortSignal로 HTML 연출을 정리해야 하며, 렌더러도 abort race를 통해 완료 Promise가 무한 대기하지 않게 한다.

`city-acquired`/`facility-upgraded`는 확정 결과의 모형 강조에 사용한다. 나머지 이벤트의 숫자/결과 UI는 HTML HUD가 `UIUpdate.events`와 권위 스냅샷에서 표시한다. 렌더러는 완료/스킵을 이유로 게임 액션을 dispatch하지 않는다.

## 투영·렌더·입력·접근성

- 원본 `boardCells`, `tileGeometry`, `modelPlacement`, `depthOrder`, `pawnFoot`를 재사용한다. 기존 230/400 지면 기울기와 직립 모형을 유지한다. SVG는 칸 면/개별 건물/나무 단위로 텍스처화한다. whole-board 캡처를 배경으로 사용하지 않는다. 지형은 Phaser Graphics다.
- 32칸의 face/model 이미지와 라벨을 독립 관리한다. 변경 없는 칸은 기존 GameObject/texture를 유지하고 변경된 칸의 이전 텍스처는 제거한다. special 칸은 보라색 바닥, 명소는 기존 지역 시설과 바닥으로 구별한다.
- 네 스타팅의 기존 Idle/Walk PNG와 AnimData 기반 manifest를 사용한다. 방향별 프레임을 Phaser Sprite 애니메이션으로 재생한다. 불투명 픽셀의 실제 발 위치에 origin을 맞춘다. 동일 칸 네 좌석은 공유 투영의 offset을 1.55배 벌려 구분하고, 이동 중 발의 y로 sprite/그림자 depth를 갱신한다.
- 기본 `Phaser.AUTO`는 WebGL을 우선 사용하고 기기 지원에 따라 Canvas로 대체한다. 명시적인 `renderer: 'canvas'` 옵션도 있다. Phaser는 `audio: { noAudio: true }`로 시작하며 AudioContext/버스를 만들지 않는다.
- 논리 화면은 1000×720, 화면은 FIT다. 1280·390에서 전체 보드가 보인다. 초기 detached 부모의 0px FIT 크기를 mount 이후 한 번 복구한다. 화면 resize는 같은 캔버스를 유지한다. 작은 화면의 라벨은 확대 또는 HTML 칸 목록으로 확인한다.
- 포인터는 카메라 역변환 후 diamond hit-test를 한다. 네이티브 HTML 버튼 목록은 실제 맵 순서대로 Tab/Enter/Space를 지원한다. Phaser keyboard capture는 비활성화하므로 HTML 입력을 가로채지 않는다. canvas는 aria-hidden이고 HTML 목록이 대체 수단이다.
- `prefers-reduced-motion`에서는 Idle 프레임을 정지하고 Tween 시간을 0으로 줄인다. 설정 변경 시 연출을 취소하고 권위 스냅샷을 정렬한다. 옵션 `reducedMotion`으로 명시 설정도 가능하다.
- HTML 글꼴은 `--pm-font-game`을 따른다. Phaser 라벨도 같은 토큰을 읽는다. 폰트 파일은 포함하지 않는다. 통합 화면은 게임 글꼴을 로드한 후 보드를 생성하고, 토큰 자체를 바꾸면 `update(view)`를 호출한다.
- 아트 크레딧과 기존 `gameCredits(view.credits)`를 보존한다. `requiredInline`인 추가 크레딧은 접지 않고 표시한다. 라이선스를 새로 추론하거나 일괄 변경하지 않는다.
