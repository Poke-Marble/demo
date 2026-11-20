# 공중날기 목적지 카드 선택창

기준: `a18c2c4`, 담당 브랜치 `feat/flight-destination-picker`.

## 재현 원인과 변경

기존 실제 게임은 `flightSelection.destinations`에 도시 ID와 한글 이름만 매핑했다. 선택창도 이름 버튼을 데스크톱 2열로 배치하므로 소유자·시설·가격을 비교할 수 없었다. 또한 presenter가 같은 선택 ID를 받으면 바로 반환하여 같은 revision의 표시 정보 갱신도 무시했다.

전용 `events/flight-picker/card.ts`와 `picker.css`를 실제 presenter에 연결했다. 기본은 **세로 스크롤 + 가로로 긴 행 카드**다. `FlightSelection.layout`을 `horizontal`로 제공하면 같은 카드와 선택 로직으로 가로 스크롤을 사용한다. 방향 확정 후 이 옵션과 CSS만 조정할 수 있다.

카드는 한글 이름, 일반도시/관광명소/시험/출발, 무소유/내 땅/상대 소유, 소유자 이름과 파트너 타입, 타입 색·문양, 현재 시설 단계·대표 시설명을 표시한다. 도시 시설은 캠프/숍/포켓몬센터/콘텐츠의 최종시설명으로 매핑한다. 관광명소에는 도시 시설 단계를 붙이지 않는다. 원본 에셋은 사용 변경 없이 보존했다.

## 권위와 선택 수명

- 목적지 목록과 현 도시 제외는 기존 `getLegalActions`의 `fly` 결과를 그대로 소비한다. UI에서 목적지를 추가하거나 합법성을 재계산하지 않는다.
- 통행료는 기존 `quoteToll(state, context, playerId, tileId).total`을 읽는다. 표시 통화는 기존 게임과 같은 `₽`다. UI의 가격 산식은 없다.
- 매입은 비행 대기 중 `wrong-landing`/`special-pending` 등 조건 때문에 현재 합법 거래 견적이라고 보장할 수 없다. 따라서 실제 매핑에서 매입비를 생략한다. 선택적 `purchase` 필드는 미래에 권위 견적이 제공될 때만 사용할 수 있다. 가격 정보가 없으면 “가격 미리보기 정보 없음”을 표시한다. 조회는 상태·가호·RNG를 바꾸지 않는다. 착지 후 실제 정산은 기존 파이프라인의 책임이다.
- ID와 표시 정보가 모두 같으면 선택을 유지한다. 정보나 revision이 바뀌면 창을 갱신하고 선택을 초기화한다. 닫힌 창의 핸들러와 이전 비동기 완료는 새 창을 제출하거나 닫지 못한다. revision 검증은 기존 adapter의 `id === identity()` 검증을 유지한다.
- 카드 선택과 별도 확정을 유지하며 제출 중 모든 버튼을 잠근다. 기존 `cancellable` 정책과 Esc 취소를 유지한다. 실제 통합 게임의 `cancellable: false`도 그대로다.
- 화살표/Home/End는 포커스와 스크롤만 이동한다. Enter/Space는 카드를 선택하고 Tab으로 확정 버튼에 이동한다. 네이티브 dialog의 포커스 제한과 터치 버튼을 사용한다.
- 경제/AI/승리/특성/시드/RNG/Phaser/HUD/index 및 이벤트 queue·비행 암전/횡단/착지/시험 연쇄·ack 로직은 수정하지 않았다.

## 검증

Windows Node 22.17.0, 의존성은 잠금 파일의 `npm ci`로 설치했다. Node 22에서 `.ts` 직접 테스트에는 `--experimental-strip-types`가 필요하다. 기존 presenter 테스트의 data URL 로더가 신규 상대 import를 처리하도록 담당 디렉터리에 작은 테스트 로더를 추가했다. 기존 테스트 파일은 수정하지 않았다.

```powershell
node --experimental-strip-types --test src/ui/game/integration/adapter.test.mjs src/game/economy/economy.test.mjs
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test src/ui/game/events/presenter.test.mjs src/ui/game/events/queue.test.mjs src/ui/game/events/flight-picker/picker.test.mjs
npm run typecheck
npm run lint
npm run build
npm run format:check
```

경제·통합 28개, 기존 presenter·queue 12개, 신규 카드 회귀 3개 통과. 신규 회귀는 같은 revision의 갱신, 이전 핸들러 무효화, revision 변경, 방향키 탐색과 별도 선택, 관광명소와 시설 구분, 미제공 가격을 검증한다. 기존 테스트는 중복 확정·취소·거절 후 재시도·비행→시험 순서·reset·ack를 포함한다. 빌드는 기존 Phaser 청크 크기 경고가 있으나 성공했다.

## Chrome 실제 게임 증거

포트 5190의 미사용을 확인한 뒤 다음 명령으로 전용 Vite를 실행했다. npm의 Windows 인자 전달이 포트를 누락한 첫 실행은 종료하고, Vite CLI를 직접 사용했다.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 --strictPort
node src/ui/game/events/flight-picker/browser-check.mjs
```

브라우저 검사는 다른 창에 연결하지 않는 임시 프로필의 headless Chrome을 사용한다. 기본 seed 42, 실제 adapter·planner·AI 합법 명령만으로 19단계 진행하여 13턴의 공중날기 선택 상태를 만들었다. 저장 상태나 위치·돈·소유권을 주입하지 않았다. 해당 runtime을 실제 `mountGameUI`에 연결했고 Phaser canvas와 HUD를 확인했다. 목적지는 31개이며 현 도시는 제외되었다. 무소유·내 땅·상대 소유가 모두 포함되었다. 모든 표시 통행료를 authority quote와 대조했고 조회 전후 상태 직렬화가 같았다.

같은 권위 snapshot에 기준 커밋의 원래 presenter를 겹쳐 전 화면을 캡처하고, 현재 실제 게임 선택창의 후 화면과 비교했다. 기준 presenter의 상대 import 경로만 임시로 바꾸었으며 파일은 검사 종료 시 제거한다.

| 증거    | 1280×900                                                                        | 390×900                                                                       |
| ------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 변경 전 | [before-1280.png](../src/ui/game/events/flight-picker/evidence/before-1280.png) | [before-390.png](../src/ui/game/events/flight-picker/evidence/before-390.png) |
| 변경 후 | [after-1280.png](../src/ui/game/events/flight-picker/evidence/after-1280.png)   | [after-390.png](../src/ui/game/events/flight-picker/evidence/after-390.png)   |

[자동 검사 결과](../src/ui/game/events/flight-picker/evidence/results.json): dialog 너비 760px/352px, 화면 내 수용, 목록 스크롤, 카드 31개, 조회·선택 중 상태 불변, 모바일 터치 선택, End로 마지막 카드 노출, Enter 선택, Tab으로 확정 포커스, 연속 확정 후 기존 `fly` 이벤트 발생을 확인했다.

한계: 390px 검증은 Chrome 모바일/터치 에뮬레이션이며 실제 휴대기기 검증은 아니다. 전후 캡처는 같은 실제 게임 snapshot의 비교이며 수동으로 처음부터 플레이한 영상은 아니다. 스크롤 방향의 최종 사용자 답변은 아직 전달되지 않았다. 표시 견적은 조회 시점 정보이며 착지 후 실제 경제 판정을 미리 확정하지 않는다.
