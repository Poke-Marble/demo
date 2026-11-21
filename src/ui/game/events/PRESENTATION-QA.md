# 간결한 PMD 연출 변경 검증

브랜치: `fix/legendary-sprite-presentation`, 2026-11-20.

events presenter, sprite renderer, 관련 CSS·크레딧·테스트·문서만 변경한다.
adapter/index/HUD, 일반 보드 레이아웃, 게임 규칙과 권위 정산은 변경하지 않는다.
시험 결과·가호·탈출로프 알림 연결은 `fix/special-mechanic-feedback`의 통합 확인 대상이다.
AGENTS.md는 현재 워크트리, 상위 경로 및 원본 저장소 `C:/Projects/demo`에서 찾지 못했다.

## 표시

- 루기아·칠색조: 단색 무대, 기존 큰 PMD 셀, 파트너와 VS, 상태 문구.
- 공중날기: 기존 칠색조 Hover 동쪽 행의 단순 수평 횡단 1회. 마지막 단계는 목적지 도착 요약.
- 파도·깃털·광선·추상 새 도형·파티클 제거. AI 이미지·신규 외부 에셋 없음.
- 기본 2600ms, 감소 모션 120ms, Enter/Space/Esc·클릭 스킵, 큐 순서·중복 방지,
  abort/reset/destroy, 포커스 복원 및 연출 완료 Promise 계약 유지.
- 이미지 실패 시 텍스트 대체와 정상 종료 유지. 이미지 로드가 정산을 막지 않는다.

에셋 조사·원본·크레딧·권리 제한은 [ASSETS.md](./ASSETS.md) 참조.

## 자동 검증

```powershell
npm run build
npm run lint
python src/ui/game/events/collect-assets.py --verify
node --experimental-strip-types --loader ./src/ui/game/events/flight-picker/test-loader.mjs --test src/ui/game/events/presenter.test.mjs src/ui/game/events/legendary-sprite.test.mjs src/ui/game/events/queue.test.mjs src/ui/game/events/flight-picker/picker.test.mjs src/game/legendary.test.mjs src/ui/game/presentation.test.mjs
node --experimental-strip-types --loader ./src/ui/game/events/flight-picker/test-loader.mjs --test src/ui/game/integration/adapter.test.mjs src/ui/game/integration/settlement.test.mjs
```

첫 관련 테스트 묶음: 34개 성공. 비행의 동쪽 셀·Hover 유지·감소 모션 정지 화면,
destroy 시 완료 1회와 타이머 취소, 자연 종료 시 도착 문구를 추가 검증했다.
빌드·lint·원본 14개 SHA256/XML/개별 크레딧 검증 성공. 빌드는 기존 Phaser 대형 청크 경고가 있다.

## 실제 Chrome 확인 한계

1280/390 화면 검증은 **미완료**이며 새 화면 캡처를 증거로 제출하지 않는다.
브라우저 연결 호스트가 unavailable이어서 실제 Chrome의 별도 창을 열고 5195 프리뷰로 이동을 시도했다.
Computer Use가 Windows의 현재 URL을 확신할 수 없어 정책 적용이 불가능하다는 사유로 중단했다.
이후 브라우저 UI 조작은 중단했다. 기존 evidence PNG는 이번 변경 검증 결과가 아니다.
최종 통합 때 1280/390에서 시험 2종·비행 횡단·목적지 도착·스킵·감소 모션을 실제 Chrome에서 확인해야 한다.

개발 프리뷰: http://127.0.0.1:5195/legendary-visual-preview.html

전체 게임: http://127.0.0.1:5195/

별도 프리뷰는 검토를 위해 기존 10000ms를 사용한다. 게임 기본 시간은 2600ms다.
5195 서버는 이 워크트리에서 실행하며 main 병합은 하지 않는다.

## 실제 Chrome 결과 (2026-11-21)

로컬 기존 Playwright 모듈과 Chrome 경로를 지정해 `node src/ui/game/events/browser-check.mjs` 실행.
실행 전 `npm run dev -- --port 5195 --strictPort`로 프리뷰 제공.
검사 범위는 변경된 연출의 1280×900, 390×844 두 뷰포트다.
두 크기에서 루기아·칠색조 실스프라이트 셀의 로딩·픽셀 투명도·모달 내부 배치·정수 배율,
기존 조형 요소 0개, Escape 종료와 오류 0건을 확인했다. 비행은 두 크기에서 x 좌표가 증가하고
수직 좌표를 유지하며 목적지 도착 문구 후 완료되는 것을 검사했다.
감소 모션 비행은 정지 배치·애니메이션 없음·도착 요약·120ms 종료를 검사했다.
이미지 로딩 실패·지연 로딩·재시작·스킵·destroy도 통과했다.

JSON 결과와 화면은 `artifacts/sprite-presentation-qa/`에 생성했다.
확인 파일: `report.json`, `after-lugia-1280x900.png`, `after-ho-oh-1280x900.png`,
`after-lugia-390x844.png`, `after-ho-oh-390x844.png`, `flight-1280x900.png`, `flight-390x844.png`.

재실행 PowerShell 예시:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/hyun/.herdr/worktrees/demo/feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs'
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:LEGENDARY_ORIGIN = 'http://127.0.0.1:5195'
$env:LEGENDARY_SKIP_BEFORE = '1'
$env:LEGENDARY_QA_DIR = 'artifacts/sprite-presentation-qa'
node src/ui/game/events/browser-check.mjs
```

또는 `node_modules` 설치 뒤 `npm run dev -- --port 5195 --strictPort` 후 위 커맨드 실행.
전체 엔진 멀티 시드 재검사는 이번 시각 변경 QA에 포함하지 않았다. 별도 통합 담당이 실제 게임 연결을 검증한다.
