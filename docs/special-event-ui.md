# 특수 이벤트 UI 연결 및 검증

## 최신 UI 피드백 반영

- 타이틀은 `Poke Marble`과 `NEW GAME` 중심으로 구성했다. 스타팅/맵 선택은 짧은 제목·단계·선택 상태만 유지한다. 사람 1 + COMPUTER 3 배정은 그대로다.
- 플레이 화면의 지방 제목은 제거했다. 맵 식별 이름은 보드의 접근성 라벨과 맵 선택에 남긴다. 상시 데모 소개·장황한 설명을 없애고 행동 상태/결과/오류만 짧게 표시한다.
- 개발 프리뷰의 데모 식별은 `adapter.demo`인 경우의 작은 배지 한 곳으로 모았다. 특수 프리뷰 장면/QA 도구는 접힌 `데모 장면 선택` 메뉴에 있다.
- 헤더의 `크레딧` 버튼은 기존 스프라이트와 Tiny Town 파일별 출처·제작자·기록된 조건을 별도 모달로 보여준다. 그림이나 보드를 크레딧 글로 대체하지 않는다. 허가 미확인 기록은 허가된 것처럼 바꾸지 않았다.
- 아트 통합에서 추가할 출처는 선택적 `GameView.credits: UICredit[]`로 전달한다. `label`, `attribution`, 선택적 `sourceUrl`을 크레딧 모달에 표시한다. 개별 조건상 상시 표시가 명시적으로 필요하면 `requiredInline: true`로 전달하면 attribution을 화면에도 유지한다. 실제 문구/링크 표시 조건은 통합 시 각 자료의 조건에 맞게 설정해야 한다.
- `events/shell.css`의 `.pm-game.pm-shell` 및 개발 도구 전용 스코프만 사용했다. board/isometric/art/assets/game.css는 수정하지 않았다. 전설/비행 연출과 데이터 계약은 유지한다.

이번 변경 후 typecheck/lint/build, 별도 프리뷰 번들과 회귀 테스트 31개를 다시 통과했다. 브라우저 연결 호스트는 여전히 unavailable이고 유일한 Chrome 창은 다른 보드 아트 작업 화면이므로 조작하지 않았다. 실제 넓은/좁은 화면과 크레딧 모달 시각 확인은 미완료다.

담당: `feat/special-event-ui`. 보드/맵/공통 게임 계약/규칙 파일은 수정하지 않는다. 기존 사람 1명 + COMPUTER 3명 설정과 컴퓨터 실행 위임을 유지한다. 이 브랜치는 게임 규칙·경제·성공 확률·AI를 구현하지 않는다.

## 선택적 어댑터 확장

`src/ui/game/events/contracts.ts`가 UI 연출 계약이다. 규칙 계층에서 반환하는 요청에 통합 어댑터가 **안정적인 id**를 부여하여 `UIUpdate.effects`에 순서대로 넣는다. id는 같은 세션에서 유일하고 재전달할 때 동일해야 한다. 배열 index/매번 새 UUID로 재전달하면 중복 방지가 무효가 된다.

```ts
effects: [
  { id: 'session-1:action-7:fly', type: 'fly', playerId, from, to },
  {
    id: 'session-1:action-7:trial',
    type: 'trial-intro',
    legendary: 'ho-oh',
    playerId,
    tileId: to,
  },
];
```

- `trial-intro`: `legendary: 'lugia' | 'ho-oh'`, `playerId`, `tileId`.
- `fly`: `playerId`, `from`, `to`. UI에서 출발 통과 보상/합법 목적지/착지 효과를 계산하지 않는다.
- `view`는 **규칙 처리가 끝난 확정 상태**다. 성공/실패/로프의 확정 설명은 `view.notice`나 기존 prompt로 전달한다. intro는 실제 전투가 아니다.
- 비행 경로에 일반 `movement`를 함께 보내지 않는다. UI는 `movement`를 먼저 재생하고 effects를 재생하므로 두 필드를 중복 사용하면 도보+비행으로 보인다.
- 비행 후 시험은 동일 업데이트에서 `[fly, trial-intro]` 순서로 전달한다. 비행 스킵은 현재 비행만 끝내며 뒤의 시험 요청은 유지한다. 완료/스킵은 게임 액션을 dispatch하지 않는다.

비행 목적지 선택은 `GameView.flightSelection`과 `GameUIAdapter.selectFlightDestination`을 모두 제공한다.

```ts
flightSelection: {
  id: 'session-1:flight-prompt-7', playerId, cancellable: true,
  destinations: [{ tileId: to, label: '방울탑', description: '칠색조의 시험' }],
}
// 확정: selectFlightDestination(promptId, tileId)
// 취소: selectFlightDestination(promptId, null)
```

통합 어댑터/규칙 계층이 목적지와 prompt ID, 차례, 취소 가능 여부, 재입력 및 재귀 비행 금지를 검증한다. UI는 전달받은 목록만 표시하고 선택 후 별도 확정을 요구한다. 확정/취소 콜백 진행 중에는 모든 선택 버튼을 잠그며 오류 시 재시도 가능하다. 성공 후 새 view에서 해당 flightSelection을 제거해야 한다. prompt id는 내용이 바뀌면 새로 발급한다. 컴퓨터의 목적지 선택은 통합 계층에서 처리하며 사람용 selection을 게시하지 않는다.

기존 adapter에는 모든 확장이 선택적이므로 기존 데모와 실제 코어 연결은 영향을 받지 않는다. `mountGameUI`가 presenter를 자동 연결한다. 보드 파일 수정이나 DOM 내부 선택자는 필요 없다. 외부 형제 dialog 오버레이와 `host.inert`로 보드·기존 입력을 잠근다. 향후 실제 타일 위치에 그림자를 정렬하려면 보드 담당자가 tileId별 화면 좌표를 읽는 선택적 훅을 제공해야 한다. 현재 그림자는 화면 중앙의 연출용이며 실제 맵 좌표를 추론하지 않는다.

## 조정 가능한 연출 가정

- 각 요청 기본 길이 2,600ms. presenter의 `durationMs`로 조정한다. 비행+시험은 두 요청으로 총 약 5.2초다.
- 0–13% 암전, 13–30% 파도/깃털·빛 또는 이륙, 30–76% VS 또는 화면 횡단, 76–100% 복귀 또는 그림자 착지.
- 클릭 또는 Enter/Space/Esc는 현재 연출만 스킵한다. 선택 화면은 Tab/Enter로 목적지를 고른 뒤 확정, 취소 가능한 경우 Esc로 취소한다. native dialog가 포커스를 가둔다.
- reduced-motion은 움직임 없이 정적인 최종 장면을 120ms 표시한다. 확정 결과는 보드 notice에 유지한다. 실행 중 해당 미디어 설정이 바뀌면 현재 연출을 종료한다.
- 재시작은 adapter가 `phase: 'setup'` 업데이트를 먼저 게시한다. UI가 즉시 기존 세션 요청, 타이머, 모달, 이동 오프셋을 정리하며 새 세션은 id를 재사용해도 된다. `destroy()`는 구독, 연출, AI abort, 타이머, 모달을 정리한다. 페이지 전환 전 반드시 호출한다.
- 전설 이미지는 자체 CSS 임시 실루엣이며 에셋 근거는 `events/ASSETS.md` 참고. 사운드 없음.

## 격리 프리뷰

```powershell
npm ci
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5193 --strictPort
# http://127.0.0.1:5193/special-event-preview.html
node src/ui/game/demo/build-special.mjs
# dist/special-event-preview/special-event-preview.html 및 assets
```

시험 성공/실패/로프/비행/비행 후 시험 버튼을 제공한다. 마지막 요청 재전달로 중복 억제, 강제 재시작 QA로 1초 뒤 선택창 또는 진행 중 연출 정리를 확인할 수 있다. 전부 고정 데모 상태이며 실제 규칙/경제/AI를 실행한 결과로 표현하지 않는다. 32칸 데모 맵을 사용하며 실제 특수 칸 배치는 규칙 병합 뒤 별도 검증한다.

## 검증 결과와 남은 작업

검증 명령:

```powershell
npm run typecheck
npm run lint
npm run build
node src/ui/game/demo/build-special.mjs
node --experimental-strip-types --test src/game/core/core.test.mjs src/ui/game/projection.test.mjs src/ui/game/presentation.test.mjs src/ui/game/demo/adapter.test.mjs src/ui/game/demo/special-adapter.test.mjs src/ui/game/events/queue.test.mjs src/ui/game/events/presenter.test.mjs
```

전용 테스트 14개: 순서/중복/입력 잠금/스킵/재시작 세대 격리/언마운트, 고정 결과 및 사람1+COMPUTER3, 목적지 유효성·취소·중복 확인, 2.6초 타이밍, reduced-motion 120ms, 확정 연타, 취소 불가, 비동기 실패 재시도와 오래된 응답 정리. presenter 테스트는 작은 DOM 대역으로 핸들러/수명주기를 검사하며 브라우저 렌더링이나 native dialog 접근성을 증명하지 않는다.

기존 코어/투영/표현/데모 테스트와 합해 31개. Node 22.17에서는 기존 코어 TS import에 `--experimental-strip-types`가 필요하다. 타입 검사/lint/기본 및 별도 번들은 통과했다.

브라우저 연결 호스트가 unavailable이며 별도 Chrome 창 실행은 자동 승인 검토에서 `blocked by policy`로 거부되었다. 기존 Chrome 창은 다른 병렬 작업 화면이므로 조작하지 않았다. 넓은/좁은 화면, 실제 키보드 포커스/스킵, reduced-motion 브라우저 확인과 캡처는 미완료다.

남은 통합은 규칙 요청에 안정적 id 부여, 실제 엔진의 목적지 콜백 연결, 실제 32칸 맵 특수 칸/착지 후 시험 순서 검증, 브라우저 시각 QA 및 허가 확인된 전설 아트 교체다. main 병합/원격 푸시/배포는 하지 않는다. `npm ci`는 기존 의존성에서 high 10건을 보고했으며 담당 밖인 lockfile/의존성은 변경하지 않았다.
