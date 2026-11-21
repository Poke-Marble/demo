# 턴 진행 헤더

기준 `195dd6c`, 작업 브랜치 `feat/turn-progress-header`. main에 병합하지 않았다.

## 실제 연결 계약

rounds의 `c4dd6f4` + `d00d233`을 의존 커밋으로 가져왔다. `src/game/match/index.ts`의 `MatchProgress`와 실제 integration adapter가 제공하는 `GameView.matchProgress`를 그대로 소비한다. UI는 라운드, 남은 라운드, 전역 턴, 개인 주회, 기본 차례를 역산하거나 누적하지 않는다. 데이터가 없는 demo adapter는 미연결로 표시한다.

- `activePlayerId`, `players[].seat/bankrupt`: 현재 초상·색과 원래 네 좌석 순서. 파산 좌석은 남겨 두고 파산/건너뜀을 표시한다.
- `currentRound/roundLimit/remainingRounds`: 상단 숫자. 남은 라운드는 현재 미완료 라운드를 포함한다.
- `players[].completedBasicTurns/completedLaps/trial`: 정보 모달에서 기본 차례와 개인 주회를 분리한다. 현재 시험 체류는 헤더에도 표시한다.
- `extraRoll`: 추가 굴림 표시 분기. 현재 core 계약은 `false`; 더블 기능 구현/실행 검증을 완료했다는 뜻이 아니다.
- `criteria`, `players[].groups/sides/landmarksOwned`, `survivors`, `assetRanking`: 승리 조건 5종과 진척. 그룹/면별 숫자는 core 값이며 실제 이름과 구성은 `view.map`, 명소 소유 표시는 committed `state.holdings`에서 읽는다. 독점까지 1개 표시는 소유 수가 양수이고 실제 남은 수가 정확히 1인 경우에만 한다.
- `endReason`, 승자 및 final ranking: 종료 시 승자 초상으로 전환하고 기존 결과 모달/재시작 흐름을 유지한다.

## 소유 경계와 hook

`src/ui/game/turn-header.ts`는 `mountTurnHeader(openInfo)`와 `createTurnProgressInfo(view)`를 export한다. 전자는 `{element, update(view), destroy()}`를 제공한다. `turn-header.css`는 내부 배치 및 상단 헤더가 있는 경기의 중복 HUD TURN 숫자 숨김을 소유한다.

index 변경은 import, mount, render header append/update, destroy 및 중복 rail TURN/현재 차례 제목 제거다. `.pm-header.pm-header-with-turn` 내부 순서는 brand → `.pm-turn-header` → `.pm-header-tools`. rail 순서는 dice → player HUD → (skill 담당 compact slot) → controls. starter/skill 설계나 효과 수치는 수정하지 않았다.

모바일 담당 `81ad7cc` 및 후속 `97b79f6`를 가져왔다. fullscreen, 보드 카메라, 상위 header 높이 배정은 모바일 담당 구현이다. 전체 header 예산은 desktop 72px, mobile 80px, landscape 56px. 실제 내부 헤더는 이보다 작고, 모바일에는 별도 메뉴 행이 포함된다.

## 검증

`node scripts/check-turn-header.mjs`는 stub 대신 실제 `createIntegratedPreview`/`mountGameUI`를 사용한다. 1인+AI3 roster, seed42, quick20을 새로 만들고 경제/AI의 합법 명령만 진행한다. 테스트가 자동 AI 실행 시점을 제어하기 위해 mount 시 `runComputerTurn`만 비활성화하며, 명령 실행은 원래 adapter로 위임한다. 상태/주사위/잔액/소유권을 편집하지 않는다.

1280×720, 390×844, 375×812, 844×390 모두 확인:

- 외부 문서 크기=viewport, 헤더 가로 중앙 오차 2px 이내, 정보/메뉴/필수 턴 버튼 viewport 내.
- 실제 정보 모달의 5종 조건, 전역 턴/개인 주회/기본 차례, 실제 소유 진척.
- 실제 시험 체류와 독점 임박 상태 방문. core 그룹 소유 수와 committed holdings를 교차 확인.
- 각 화면에서 실제 237회 revision 진행 후 제한 라운드 자산 종료, 승자 헤더, 결과 모달, 재시작 시 헤더 제거.
- seed42 경기에서는 파산자가 나오지 않았다. 파산 skip 경계는 core의 `match.test.mjs` 검사로 확인했으며 실제 파산 경기 UI를 재현했다는 보고는 하지 않는다.

`GAME_URL=http://127.0.0.1:5207 node scripts/check-mobile-camera.mjs`도 네 화면에서 통과했다. 선택 라벨과 모델/폰 겹침 없음, nearest filtering, 확대/팬/전체보기/회전 후 배치를 검사한다. 기본 모바일 확대율에서는 출발/선택 라벨을 우선 표시하는 기존 정책을 유지한다.

`npm run build`, `npm run lint`, `node --experimental-strip-types --test src/game/match/match.test.mjs` (7/7) 통과. 결과 근거는 `docs/evidence/turn-header/`; 전체 원본은 ignored `artifacts/turn-header/`와 `artifacts/mobile-framing/`에 남긴다. 기술 UI 실제 구현 통합은 별도 담당 작업이며, 64/56px 공간 스트레스 검증과 실제 기술 동작 검증을 혼동하지 않는다.

빌드 후 5207을 production preview로 전환했다. 실제 진입점에서 NEW GAME → 스타터 → 맵 → standard30 시작 → 승리 정보 모달 열기/닫기 → 외부 문서 크기를 네 화면에서 재확인했고 모두 통과했다. 이 검사는 main 진입점을 가로채지 않는다 (`artifacts/check-turn-production.mjs`).
