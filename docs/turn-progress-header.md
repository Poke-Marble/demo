# 턴 진행 헤더

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
