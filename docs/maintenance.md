# 개발과 유지보수

플레이·설치·현행 규칙은 [README](../README.md), 권리 검토는
[rights.md](rights.md)를 참고한다. 개별 API 문서는 모듈 계약을 설명하며,
과거 독립 미리보기·완료 인계·캡처 보고서는 저장소에서 제거했다.

## 진입점과 회귀 검사

Vite의 기본 입력은 `index.html`이다. `src/main.ts`가
`src/ui/game/integration/main.ts`를 통해 실제 게임을 마운트한다.
이름에 preview가 남아 있는 integration 함수와 `integration/preview.css`도
실제 게임에서 사용하므로 유지한다. Phaser는 게임 UI에서 dynamic import한다.

```powershell
npm ci
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run assets:verify
$tests = @(rg --files src -g '*.test.mjs' -g '*.test.ts')
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test @tests
```

단위 회귀, demo 어댑터·construction fixture, AI harness, 시험·능력 호환 경로는
런타임 도달 여부와 별개로 테스트와 공개 계약을 위해 유지한다.
`src/game/ai/skill-seat-check.mjs`는 별도 엔진·AI smoke 검사다.

## 브라우저 검사와 로컬 출력

`scripts/check-*.mjs`와 integration·Phaser·flight-picker의 브라우저 검사는
실제 게임을 대상으로 한다. 필요한 Chrome/Playwright와 origin 환경 변수는
각 스크립트에서 확인한다. 다른 작업의 서버·포트·프로필은 재사용하거나 종료하지 않는다.
독립 HTML과 그 fixture에 의존하던 과거 브라우저 드라이버는 함께 제거했다.

캡처·JSON·로그는 ignored `artifacts/` 아래에만 생성한다. flight-picker의 기본
출력은 `artifacts/flight-picker/`, 보드 비행은 `artifacts/board-flight/`이다.
`FLIGHT_EVIDENCE`로 변경할 때도 `artifacts/` 아래를 지정한다.

`scripts/check-board-polish.mjs --combined`는 로컬 기준 보고서를 필요로 한다.
비교할 버전에서 생성한 보고서를 `artifacts/board-polish-baseline/report.json`에
준비하거나 `BOARD_POLISH_BASELINE`으로 지정한다. 기본 검사와 `--resume` 출력은
`artifacts/board-polish/`이다. 과거 커밋의 캡처나 보고서를 최신 결과로 사용하지 않는다.

## 데이터와 에셋

`data:generate`는 저장된 응답에서 한국어 데이터를 재생성한다.
`data:fetch`, `assets:sync`, `scripts/verify-mounted-assets.mjs`,
`src/ui/game/events/collect-assets.py`, `src/ui/game/portraits/collect.mjs`는
수집·출처 확인용으로 유지한다. 네트워크 수집은 필요할 때만 실행한다.

`src/ui/game/events/assets/tracker.json`은 수집기가 manifest의 제작자·조건을
검증할 때 읽는 원본 근거다. 초상화 `evidence/` 역시 수집기가 읽는
원본 tracker·directory·credits·license 자료이며 QA 출력이 아니다.
원본 manifest, license history, 사용 이미지·글꼴·데이터와 함께 보존한다.
일반적인 evidence 디렉터리 정리나 ignore 규칙을 이 자료에 적용하지 않는다.
