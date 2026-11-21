# 후속 네 UI 수정 통합

2026-11-21, `feat/presentation-integration`, 기준 `7ec487e`. 각 담당 작업의 완료 응답과 clean 상태를 확인한 뒤 아래 순서로 병합했다. 대기 중 미커밋 파일은 수정하거나 병합하지 않았다. 적용 가능한 AGENTS.md는 작업트리와 상위 경로에서 발견되지 않았다.

| 작업                       | 완료 커밋 | 병합 커밋 |
| -------------------------- | --------- | --------- |
| 명소 정체성·표식·라벨      | `7fb4a42` | `ab04994` |
| 한 화면 게임 배치          | `7870b3e` | `f5ba1d7` |
| 전설·비행 스프라이트       | `04c858c` | `0be0475` |
| 권위 시험·가호·로프 피드백 | `843cce7` | `4e4763a` |

텍스트 충돌은 없었다. UI index의 화면 배치·도시 목록·설정·크레딧과 결과 알림의 mount/show/reset/destroy hook을 함께 확인했다. 경제·AI·승리·특성 규칙 및 원본 이미지/폰트 파일은 변경하지 않았다. map의 기존 tile ID와 승리 대상은 유지된다. main 변경·병합·push·배포는 하지 않았다.

## 통합에서 보정한 부분

실제 모바일 결과 캡처에서 화면 오른쪽 위 알림이 도시 목록·소리·크레딧을 덮었다. 비모달/pointer-pass 동작은 유지하면서 CSS anchor로 알림을 현재 보드 surface 내부에 배치했다. viewport/동적 HUD 높이 변경도 따라가며, top-layer popover의 시험 선택창 위 표시와 기존 ack 비대기는 유지한다. 새 금융 처리나 규칙은 없다. Chrome에서 동작과 좌표를 직접 검증했다.

검사 스크립트에는 origin/증거 경로 설정, 일반·시험 중 실제 배치 측정, 실제 시험 진입 스프라이트 캡처를 추가했다. 새 보드 결합 검사는 실제 UI로 시작하고 Phaser를 렌더링 관찰 목적으로만 참조한다. 임의의 성공·잔액·위치 주입은 하지 않는다.

## 완료한 검사

- typecheck, lint, build, format:check, diff 공백 검사 통과. 전체 Node **188/188 통과**. 기존 import hook을 사용했다. 원본/출처 에셋 **20개 SHA-256** 검증 통과.
- Chrome 157, 실제 고정 production의 **1280×720 / 390×844**에서 일반 상태와 비행 도착·시험 성공·실패·가호 소비·로프 사용의 **12개 배치 측정** 통과. 문서 크기와 viewport가 같고, HUD/보드 겹침 0, 알림/HUD 겹침 0, 알림/외부 조작 및 시험 선택 버튼 겹침 0이다. 네 초상화가 HUD 안에 남는다.
- 평상시 ‘시험 없음·가호 없음’ 칩은 없으며 로프만 짧게 표시한다. 모바일 HUD는 일반 상태 304px 영역/311px 내용, 실패 상태 304px 영역/349px 내용으로 내부 스크롤한다. 상세 설명과 자산 버튼은 그 영역에서 접근하며, 바깥 페이지와 필수 턴 조작을 밀어내지 않는다. 캡처를 열어 확인했다.
- 실제 seed 1 합법 UI 진행: TURN13 비행→칠색조 첫 도전 성공, TURN17 상대 도시 비행 통행료 **95** 단일 차감, TURN21 칠색조 가호 소비 견적 **195→163**, 실제 현금 **585→422**, TURN33 루기아 첫 도전 실패→로프 **1→0**→같은 턴 주사위 복귀. 사람 입력 **27회**의 연속 클릭에도 revision과 소비가 한 번만 확정됐다. 결과 알림 14개, pageerror 0건. AI 3명 진행과 presentation ack 정체 없음.
- 첫 합법 비행은 감소 모션을 해제해 실제 비행 스프라이트→Phaser 비행→칠색조 시험 스프라이트까지 표시했다. 두 해상도의 실제 시험 sprite 범위가 viewport 안에 있고 원래 추상 날개/깃털 요소가 없으며 스킵 후 진행한다. 성공/실패를 강제하지 않았다.
- 독립 전설/비행 시각 회귀: 두 해상도의 루기아·칠색조·횡단 스프라이트 **6개 표본**, 스킵/종료/감소 모션/로딩 실패·지연/destroy 통과. 실제 게임 기록과 이 시각 fixture는 구분한다.
- 보드 결합 검사: 실제 UI의 1280×720 / 390×844, DPR 2, 기본/1.25 줌에서 라벨과 모델/폰 bounding box 겹침 0, 14px 이상 글자, 네 폰, 한 canvas 유지, 실제 확대/팬/전체 보기, 도시 modal 32개 및 분노의호수·용의굴 표시/선택 통과. fullscreen 정책에 따라 모바일의 상시 목록 대신 도시 modal을 검사했다.
- 두 시험칸 폰 시각 회귀 **48개**, 오류 0건. 등장/실패/로프 복귀·걷기·비행·감소 모션의 지면 depth 정렬을 검증한다. 이 부분은 공개 view/update 시각 fixture이며 경제 경기 증거로 쓰지 않는다.
- fullscreen 실제 턴 검사: 1280×720, 390×844, 844×390, 390×667에서 도시 목록·정보창·소리 설정·실제 굴림·조작 접근 통과. 데스크톱 실제 구매→AI 3명→사람 TURN5 복귀 통과.

[통합 결과 JSON](../src/ui/game/integration/evidence/followup-four/report.json), [일반 모바일](../src/ui/game/integration/evidence/followup-four/normal-390.png), [시험 실패·선택창·알림](../src/ui/game/integration/evidence/followup-four/trial-failed-390.png), [실제 시험 스프라이트](../src/ui/game/integration/evidence/followup-four/trial-sprite-390.png), [실제 가호 소비](../src/ui/game/integration/evidence/followup-four/blessing-consumed-1280.png), [보드·HUD](../src/ui/game/integration/evidence/followup-four/board-1280.png).

## 재현과 고정 preview

최종 **<http://127.0.0.1:5192/>**는 이 워크트리의 고정 production preview다. 재부팅으로 비어 있던 포트에서 복구했고 계속 유지한다. HTML SHA-256은 `72d62044aac4711da599cce99331136b651be7e0ac39d42e7ec3d614850f95a1`, 파일은 `index-C5bUNSh6.js`, `phaser-CjWBFzcN.js`, `index-BJjgmYry.css`다. 최종 캡처 이후 rebuild하지 않았다.

source 기반 시각 검사는 별도 dev 5197에서 **순차 실행**했고 완료 후 그 dev 프로세스만 종료했다. 기존 `baseline.ts` 비교 파일은 생성하지 않았으며, 다른 pane/작업트리는 읽기만 했다. 브라우저 라이브러리는 기존 feat-board-art Playwright를 읽기 전용 재사용했다.

```powershell
$tests = @(rg --files src scripts -g '*.test.mjs' -g '*.test.ts')
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test @tests
# Source tests: own dev server at 5197, sequential browser runs.
$env:BOARD_ORIGIN='http://127.0.0.1:5197'
node scripts/check-followup-board.mjs
$env:OCCLUSION_URL='http://127.0.0.1:5197/'
node src/ui/game/phaser/occlusion-browser-check.mjs
$env:PLAYWRIGHT_MODULE='C:/Users/hyun/.herdr/worktrees/demo/feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs'
$env:LEGENDARY_ORIGIN='http://127.0.0.1:5197'
$env:LEGENDARY_SKIP_BEFORE='1'
$env:LEGENDARY_QA_DIR='artifacts/followup-sprite'
node src/ui/game/events/browser-check.mjs
# Actual fixed production:
$env:GAME_URL='http://127.0.0.1:5192/?fast'
node scripts/check-fullscreen-turns.mjs
$env:SPECIAL_ORIGIN='http://127.0.0.1:5192'
$env:SPECIAL_QA_DIR='artifacts/followup-special-final'
node --experimental-strip-types src/ui/game/integration/special-feedback.browser-check.mjs
```

상세 원본은 `followup-integration-tests.log`, `artifacts/followup-board/`, `artifacts/followup-sprite/`, `artifacts/followup-special-final/`, `artifacts/fullscreen/`, `artifacts/trial-pawn-occlusion/`에 보존한다.

## 한계

모바일의 긴 HUD 상세는 제한된 영역 내부 스크롤이 필요하다. Chrome에서 알림 CSS anchor를 검증했으며 다른 브라우저/실기기·물리 스피커·장시간 메모리는 측정하지 않았다. 3회차 성공 보장은 기존 core/계약 테스트로 검증하고 이번 실제 경기에서 강제로 만들지 않았다. 관련 변경 검증에 집중해 기존 156턴 완주/재시작 검사를 불필요하게 반복하지 않았고, 이번 후보의 실제 경기는 TURN33까지다. Vite의 기존 Phaser 대형 청크 경고는 남는다.
