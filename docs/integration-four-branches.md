# 최초 네 UI 작업 통합 검증

대상은 `feat/presentation-integration`의 `a18c2c4` 위에 다음 네 작업만 순서대로 병합한 결과다. 후속 UI 브랜치와 main은 수정하거나 병합하지 않았다. 작업트리와 상위 경로에서 적용할 AGENTS.md는 발견되지 않았다.

| 순서 | 원본 커밋 | 병합 커밋 | 범위                    |
| ---- | --------- | --------- | ----------------------- |
| 1    | `99694ab` | `6210de1` | 지도 라벨 가독성        |
| 2    | `3396dd3` | `341a12a` | 두 시험칸 플레이어 가림 |
| 3    | `87347c2` | `f29de59` | 권위 비행 목적지 카드   |
| 4    | `31df12a` | `ac5a60e` | 건설·최종시설 확정 연출 |

충돌은 `phaser/index.ts`의 import 한 곳이었다. `createMapLabels`와 `pawnDepth/standingFoot`를 모두 보존했다. 별도의 신규 규칙이나 UI 기능은 구현하지 않았다. 검사 스크립트의 서버 주소/증거 경로만 환경변수로 받을 수 있게 했고, 기존 폰트 검사는 단일 face 개수 대신 로드된 모든 face의 상태를 검사하도록 보정했다. 실제 비행 검사는 선택뿐 아니라 권위 목적지 도착과 HTML/Phaser 입력 해제까지 확인한다.

새 작업 기준으로 먼저 전달한 clean HEAD는 `8a922ac00104cfbc0facb4bb091e9c0c81bef50d`다. 이후 변경은 검증 코드·결과 기록뿐이다. 관리자가 전달한 후속 작업 기준 `ac5a60e`와 런타임 소스는 동일하다.

## 검사

- `typecheck`, `lint`, `build`, `format:check`, `git diff --check` 통과. 전체 Node **178/178** 통과. 비행 presenter의 기존 data URL 테스트 호환을 위해 아래 loader를 사용했다.
- `data:generate` 오프라인 4종 재생성 통과, 생성 파일 diff 없음. `assets:verify` 원본/출처 20개 SHA-256 통과. 원본 파일을 다시 받는 `data:fetch`와 `assets:sync`는 실행하지 않고 보존된 스냅샷과 해시를 검증했다. dev와 preview 실행도 확인했다.
- Chrome 157, 1280/390, 라벨 DPR 1/2: 16개 줌 측정, 이름 32개·최소 글자 크기·포커스·카메라 pan/resize·destroy·지연 폰트 통과, pageerror 0건.
- 두 시험칸: 1280/390, 네 좌석 및 한 좌석, 등장/실패/로프 복귀, 출발/걷기/비행의 매 프레임 지면 depth, 감소 모션 등 **48개 확인**, 오류 0건. 경제 입력은 바꾸지 않는 시각 fixture로 실제 경기와 구분한다.
- 비행: seed 42 실제 합법 명령 19단계로 13턴 선택창 도달, 현 도시 제외 31개 카드, 권위 통행료 견적·조회 상태 불변·스크롤·키보드/터치·별도 확정·이중 확정 차단 통과. 최종 선택한 방울탑의 권위 position과 Phaser/HTML 연출 완료 후 입력 해제를 확인했다.
- 건설: 1280/390 독립 연출, 실제 최종건설 dispatcher 이벤트 fixture, 건설→특성→한 번의 ack, 재전달, 입력 잠금, skip/restart/감소 모션/destroy 통과. 390에서는 seed 1 실제 어댑터의 합법 구매/건설 거래까지 확인했다. 최종시설 fixture는 실제 게임 초기 상태나 규칙에 설치하지 않았다.
- 기존 통합 회귀: 1280/390 단일 canvas, 9칸/발소리, 로컬 폰트, 스킵, mute/volume 보존, 비행 bridge 한 번, 특성 소리/완료 ack, 세대 교체/destroy 정산 통과.

```powershell
$tests = @(rg --files src scripts -g '*.test.mjs' -g '*.test.ts')
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test @tests
$env:LABEL_ORIGIN='http://127.0.0.1:5192'
node src/ui/game/phaser/labels.browser-check.mjs --after-only
$env:OCCLUSION_URL='http://127.0.0.1:5192/'
node src/ui/game/phaser/occlusion-browser-check.mjs
$env:FLIGHT_URL='http://127.0.0.1:5192'
$env:FLIGHT_EVIDENCE='artifacts/merged-flight-picker'
node src/ui/game/events/flight-picker/browser-check.mjs
$env:CONSTRUCTION_URL='http://127.0.0.1:5192'
$env:CONSTRUCTION_EVIDENCE='artifacts/merged-construction-effects'
node src/ui/game/construction-effects/browser-check.mjs
```

위 source 기반 Chrome 검사는 dev 서버에서 **순차 실행**한다. 비행 비교 검사가 일시적으로 `baseline.ts`를 만들고 삭제하므로 동시에 다른 브라우저 검사나 tsc를 돌리면 Vite reload/임시 타입 오류가 발생한다. 최초 병렬 실행의 라벨·가림 전역 객체 소실과 임시 baseline 타입 오류는 단독 재실행으로 모두 해소되었다. 제품 코드 수정은 필요하지 않았다. 캡처를 직접 열어 두 시험칸 폰, 라벨, 비행 카드와 최종시설 표시를 확인했다.

전체 경기 runner의 최초 실행은 비행 카드의 새 접근성 이름 대신 같은 도시명의 지도 라벨을 찾으면서 dialog 뒤의 버튼 클릭을 시도해 멈췄다. 별도 확정 클릭은 원래 있었지만 카드 선택에 도달하지 못한 테스트 호환 문제였다. selector를 `.pm-flight-picker .pm-flight-card` 내부의 정확한 도시명으로 좁혔다. 게임의 권위 선택·정산 코드는 수정하지 않았다.

통합 증거: [검사 결과](../src/ui/game/integration/evidence/merged-four/report.json), [칠색조 390](../src/ui/game/integration/evidence/merged-four/ho-oh-390.png), [루기아 1280](../src/ui/game/integration/evidence/merged-four/lugia-1280.png), [최종건설](../src/ui/game/integration/evidence/merged-four/construction-final-1280.png), [비행 선택 390](../src/ui/game/integration/evidence/merged-four/flight-picker-390.png).

## 고정 production preview

최종 실제 게임 주소: **<http://127.0.0.1:5192/>**. 이 작업에서 시작한 dev 프로세스만 종료하고 같은 포트의 strict production preview로 전환했다. QA에게 전환을 알렸고 서버를 유지한다. 다른 프로세스/pane은 제어하지 않았다.

`dist/index.html` SHA-256: `b36327bf7bc585bbeee93e4d86d79800303f3b998256fe0d7f602ce3c4670973`. 번들은 `index-BddYMz20.js`, `phaser-CtmrlKzx.js`이며 이후 rebuild하지 않았다.

```powershell
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5192 --strictPort
$env:PRODUCTION_URL='http://127.0.0.1:5192'
node --experimental-strip-types src/ui/game/integration/production-check.mjs
```

고정 production 전체 경기 재실행은 **seed 1 / 156턴 / revision 466 / 사람의 명소 4개 승리 / 새 여행 시작**까지 통과했다. AI 3명 진행 후 사람 복귀, 실제 구매/건설, VS, 비행 카드 선택과 별도 확정, 이중 입력 단일 확정, 권위 현금/자산과 HUD 일치를 확인했다. PNG 15개 decode 성공, pageerror/requestfailed 0건이다. [전체 경기 결과](../src/ui/game/integration/evidence/merged-four/production-report.json)를 보존했다.

로컬 상세 결과는 `integration-merged-tests.log`, `artifacts/label-clarity/`, `artifacts/trial-pawn-occlusion/`, `artifacts/merged-flight-picker/`, `artifacts/merged-construction-effects/`, `artifacts/presentation-integration/`에 있다.

## 한계

Chrome 에뮬레이션이며 실제 휴대기기/물리 스피커 청취/장시간 누수 측정은 하지 않았다. 최종시설 강조는 기존 모듈의 보드 중앙 표시이며 칸별 카메라 anchor 확장은 이번 범위에 넣지 않았다. Phaser 대형 청크 경고가 남는다. 후속 UI 요청은 별도 작업이며 이번 통합에서 다루지 않는다.
