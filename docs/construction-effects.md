# 건설 확정 연출

기준: `a18c2c4`, 브랜치 `feat/construction-effects`. 게임 규칙과 Phaser producer를 변경하지 않는 프레젠테이션 모듈이다.

## 실제 연결

`src/ui/game/index.ts`에서 기존 `UIUpdate` 직렬 큐를 그대로 사용한다. 보드의 주사위·이동·특수 이벤트(VS 등) 작업이 끝난 뒤 건설 연출, 기존 특성 연출을 순서대로 기다린다. 기존 `finally → acknowledge`가 마지막에 `presentationComplete`를 한 번 호출한다. 연출 콜백은 금융·게임 명령을 발행하지 않는다.

수신 즉시 건설/특성 업데이트도 입력을 잠근다. 오버레이는 `pointer-events: none`이며, 루트의 기존 inert 정책과 외부 스킵 버튼을 사용한다. 별도 음소거 패널은 추가하지 않았다.

분류는 update ID가 있는 `city-acquired`/`facility-upgraded` 확정 이벤트, 이전/현재 holdings, 현재 소유자 `pokemonId`, 맵 kind, 권위 economy development를 함께 읽는다.

| 조건                                                                       | 연출                          |
| -------------------------------------------------------------------------- | ----------------------------- |
| 이전 소유자 없음 + 일치하는 취득 이벤트                                    | 사유지 확보                   |
| 이전 소유자 다름 + 일치하는 취득 이벤트                                    | 인수 완료                     |
| 도시, 이벤트 level = 실제 facilityLevel = development.stage, 이전보다 상승 | 일반건설                      |
| 위 건설 조건 + 실제 레벨 3 + development.facilities에 final                | 랜드마크 완성!                |
| 맵 kind=landmark의 취득                                                    | 관광명소 구매, 짧은 확보 연출 |

한 업데이트의 같은 칸 취득·건설 이벤트는 한 cue로 합친다. 최종완성이 우선한다. update ID와 `sessionId/revision/tileId/ownerId/actualLevel` 거래 키로 중복을 차단한다. 다른 ID로 원거래를 재전달해도 동일 revision은 재생하지 않는다. 이벤트 없는 로드/견적/실패/스킵/재렌더, ID 없는 수신, 실제 레벨과 불일치하는 건설 이벤트는 신규 건설을 발생시키지 않는다. 일치하는 취득 이벤트가 별도로 있으면 확보만 표시할 수 있다.

최종시설 방어 설명은 현재 state의 profileId/version이 기존 `recommendedEconomyProfile`과 일치할 때에만 그 프로필의 `finalTakeoverImmune`를 읽어 표시한다. 다른 프로필에는 방어 문구를 단정하지 않는다. 실제 대표시설 이름은 같은 맵 ID의 기존 `kantoJohtoMap.finalFacility.nameKo`를 읽는다. 새로운 면역·강화 제한·판정은 없다.

## 표현과 수명주기

소유자 이상해씨/파이리/꼬부기/피카츄 ID를 각각 풀 초록 잎, 불 주황 불꽃, 물 파랑 물결, 전기 노랑 번개로 표시한다. 좌석색을 읽지 않으며 미지원 소유자 ID는 추정 연출을 생략한다.

일반 연출 700ms, 도시 최종완성 1800ms. 자체 Canvas 문양·입자·소유색 링, 최종완성의 완만한 빛기둥·타입 문장·절차형 건물 등장과 한글 안내를 사용한다. 원작 이미지/효과/음원은 복제하지 않았다. 화면 전체 섬광이나 반복 점멸은 없다. 최대 입자 48개, DPR 최대 2, ResizeObserver와 window resize로 크기를 갱신한다.

음원은 기존 feedback audio의 선택적 `playConstruction(type, final)` 합성 메서드다. 저장된 `pm:sfx:v1` mute/volume과 기존 신뢰 입력 unlock, 기존 단일 AudioContext를 공유한다. 잠금 해제 전·백그라운드·음소거·볼륨 0·reduced motion에서는 건설음이 나지 않는다. voices는 최대 4이며 취소·설정 변경·destroy에서 노드를 해제한다.

스킵/Escape, visibility, reduced motion 변경, restart, 오류 정리, destroy는 rAF를 취소하고 대기 Promise를 해제한다. reduced motion에서는 입자/상승/음향 없이 180ms의 정적 안내만 표시한다. 오버레이·문구는 완료/취소 시 숨겨져 도시명/HUD/플레이어를 영구적으로 가리지 않는다. 보드 외부 플레이어 HUD는 오버레이 범위에 포함되지 않는다.

## 좌표 연결 한계와 요청

현재 Phaser 공개 API에는 카메라를 반영한 칸별 screen anchor가 없다. 담당 중인 `phaser/index.ts`는 수정하지 않았다. 실제 연결은 보드 host 중앙(x=50%, y=43%)의 확정 강조다. 특정 칸에 실제 건물이 솟는 것처럼 잘못된 좌표를 사용하지 않는다. Canvas 건물은 중앙 문장용 실루엣이며 실제 칸의 건물 모델은 기존 Phaser가 갱신한다.

`createConstructionPresenter`의 선택적 `anchor(tileId)`는 board host 기준 CSS pixel `{ x, y }`를 받는다. 향후 Phaser 담당자가 카메라 pan/zoom·viewport·DOM offset을 반영한 함수를 공개하면 이 콜백으로 주입할 수 있다. 좌표는 매 프레임 조회하며 비유한/화면 밖 값은 중앙으로 대체한다. caption은 보드 중앙에 유지한다. 특성 이벤트나 금융 처리 경로를 합칠 필요는 없다.

## 실행과 검증

이 워크트리에서 `npm ci` 후 다음으로 strict 개발 서버를 시작했다. 5191이 비어 있어 해당 포트에서 시작됐다.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort
```

- 실제 게임: http://127.0.0.1:5191/
- 독립 프리뷰: http://127.0.0.1:5191/src/ui/game/construction-effects/preview.html

```powershell
node --experimental-strip-types --test src/ui/game/construction-effects/model.test.mjs src/ui/game/construction-effects/presenter.test.mjs src/ui/game/feedback/audio.test.mjs src/ui/game/feedback/feedback.test.mjs src/ui/game/abilities/presenter.test.mjs src/ui/game/integration/adapter.test.mjs
node src/ui/game/construction-effects/browser-check.mjs
node src/ui/game/construction-effects/build-preview.mjs
npm run typecheck
npm run lint
npm run build
npm run format:check
```

Node 22.17은 기존 TS 직접 import 테스트에 `--experimental-strip-types`가 필요하다. 브라우저 테스트는 기존 인접 워크트리의 Playwright 설치를 읽기 전용으로 재사용한다(`PLAYWRIGHT_PATH`로 교체 가능). 그 워크트리의 파일을 수정하지 않는다. 테스트 코드는 모두 이 담당 디렉터리에 있다.

Chrome 증거는 `src/ui/game/construction-effects/evidence/`에 저장한다. `preview-1280.png`, `preview-390.png`는 독립 시연이며, `game-final-1280.png`는 합법적인 stage 2 재방문 fixture에서 수정 없는 `dispatchEconomy`로 최종건설을 확정하고 그 실제 이벤트를 mountGameUI에 전달한 최종완성/특성 순서 검증이다. 원명령 재전달도 실제 producer의 replay 결과(events=[])로 검증한다. `game-real-390.png`는 seed=1 실제 경제 어댑터에서 주사위와 합법 건설 선택을 실행한 확정 거래다. 최종시설 fixture는 UI 검증용이고 실제 게임의 자금/시드/판정에는 설치하지 않는다. 자동 검증 결과는 `browser-report.json`에 기록한다. 독립 프리뷰 빌드 산출물은 `artifacts/construction-effects-preview/`에 생성한다.

검증 결과: 신규·관련 회귀 테스트 총 34개 통과, typecheck/lint/format check/게임 build/독립 preview build 통과. Chrome 157의 1280×900·390×900, DPR 2에서 JavaScript 오류 0개. 실제 최종건설 이벤트, 거래 재전달, 건설→특성→ack 순서, 입력 잠금, pointer pass, 상시 음소거 패널 부재, 스킵/restart/감소모션 전환/destroy 후 ack 해제를 확인했다.

빌드에는 기존 Phaser 대형 청크 경고가 있다. 배포·푸시·main 병합은 하지 않는다.
