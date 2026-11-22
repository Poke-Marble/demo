# START 특별 건설 계약

기준: `098d23d`, 브랜치 `feat/start-build-choice`. 기존 월급·주회 정산을 바꾸지 않는다.

## 기회와 기본 차례

`EconomyExtension.pendingStartBuild?: { id: string; playerId: PlayerId; landingId: string } | null`.
누락과 null은 기회 없음이다. `roll-dice` 또는 `resolve-dice`가 실제 `dice-rolled` 이동을 완료하고 START에 정확히 도착한 경우에만 발급한다. 기술 ±1은 실제 이동 거리를 따른다. 최초 배치, 통과, 비행, 시험 및 다른 강제 이동은 발급하지 않는다. 월급과 주회는 기존 `start-rewarded` 이벤트로 각 1회 처리한다.

다음 시설을 건설할 수 있는 소유 일반 도시가 하나라도 있을 때 `choosing-start-build`를 반환한다. 금액 부족·해금·최종 시설 조건까지 통과한 후보만 반환하며 후보가 없으면 즉시 기회를 비우고 기존 턴 진행을 허용한다. 강제 부채는 만들지 않는다.

기회가 남아 있으면 `start-build` 또는 `skip-start-build`만 허용한다. 둘 다 원래 기회 ID를 요구하며 성공 시 기회를 null로 만든다. 이 선택 자체는 기본 차례를 끝내지 않는다. 이후 기존 `end-turn`이 기본 차례와 라운드를 정상 증가시킨다. 중복 command는 기존 ledger receipt를 재생하고 돈·기회를 다시 소비하지 않는다. 다른 command ID의 stale revision이나 이미 사용한 기회는 거절한다.

## 건설과 견적

`start-build { opportunityId, tileId, quoteId }`, `skip-start-build { opportunityId }`를 사용한다. UI는 금액이나 단계를 보내지 않는다. 권위 경계에서 소유권·현재 시설·기회·revision을 확인하고 `quoteStartBuild`를 재계산한 뒤 opaque `quoteId`를 검증한다. 한 도시의 다음 1단계만 허용하고 토지 구매, 명소, 완성 도시는 제외한다.

`quoteConstruction(..., opportunityId?)`의 선택적 기회 문맥은 착지 권한 검사만 바꾼다. 가격은 기존 `makeQuote` 경로를 사용한다. `quotePreBlessingAmount(s,c,playerId,tileId,kind,base)`는 견적과 commit에서 함께 사용한다. 이 브랜치의 helper는 기존 modifier를 적용한다. world-events 브랜치 통합 시 **그 브랜치의 helper 구현을 유지**하여 event → modifier → blessing 순서와 0원 가호 판정을 일치시킨다.

단계 해금은 유지한다. 최종 시설은 모든 프리셋에서 센터가 완료되어 있어야 하고 `centerReadyVisitOrdinal < 현재 START 착지 visitOrdinal`이어야 한다. START 기회가 도시 재방문 요건을 대체한다. 원격 건설로 도시 착지 이력이나 위치를 생성하지 않으며, 새 센터의 준비 ordinal만 실제 START 착지 ordinal로 기록한다.

## 승리·AI·UI 경계

`hasPendingSettlement`가 새 기회를 포함한다. 따라서 pending 동안 `rankAssets`는 거절하고 `finalizeMatch`와 최종 순위 공개는 보류한다. 해결 후에는 기존 승리·라운드 제한 처리가 적용된다. AI public projection은 기회를 포함하며 사람과 동일 `getLegalActions` 후보를 사용한다.

UI는 기존 공용 `modal()`과 adapter prompt를 사용한다. 소유 재산 목록과 공용 dialog overflow 구조는 property UI 브랜치 소유이며 이 브랜치에서 수정하지 않는다. 해당 브랜치의 `.pm-dialog-body` 스크롤과 고정 footer가 통합 시 그대로 적용된다.

## 검증·프리뷰

로컬 dev 프리뷰: <http://127.0.0.1:5221/>. 요청 포트 5212는 통합 담당의 기존 preview가 사용 중이므로 종료·교체하지 않았다. 5192도 유지했다.

경제 경계 테스트: `node --experimental-strip-types --test src/game/economy/start-build.test.mjs`.
Chrome 검증: `node scripts/check-start-build.mjs` (기본 5221). seed 3 quick 실제 경기의 45번째 턴까지 합법 명령으로 진행한 뒤 실제 START 기회를 UI에 마운트한다. 테스트용 위치·소유권·잔액 주입은 없다. 1280×844 및 390×844에서 스킵, 유료 센터 건설, 최종 시설, 이중 클릭·stale 콜백을 확인한다. 결과와 PNG는 `artifacts/start-build/`에 생성한다.

2026-11-22 검증 결과:

- 경제·매치·AI·integration 관련 기존 및 초기 START 테스트 95개 통과. canonical helper와 추가 경계 확인 후 START 테스트 7개 통과.
- `npm run lint`, `npm run build`, `git diff --check` 통과. 빌드는 기존 Phaser 청크 크기 경고만 발생.
- 실제 Chrome 142, 1280×844 / 390×844 각 스킵·센터·최종 시설 총 6사례 통과. START 3주회, 45턴에서 잔액 318₽ 기준 스킵 318₽, 센터 238₽(80₽ 지불), 최종 시설 268₽(50₽ 지불). 각 사례 revision 증가 1회, stale 입력 후 상태 동일, 실제 START 착지 이력 보존, 부채 없음, 페이지 오류 없음.
- 데스크톱 dialog x=335..945, 모바일 x=18..372. 양쪽 document scrollWidth가 viewport와 같고 모든 버튼이 화면 안에 표시됨.
- AI가 실제 `plan`으로 합법 건설/스킵을 선택하고 권위 dispatch에서 기회를 해결함. 마지막 라운드의 pending 기회는 자산 평가·승리를 보류하고 스킵 해결 후 정상 자산 승리로 마무리함.

선택한 화면과 전체 수치 증거는 [evidence/start-build-choice](evidence/start-build-choice)에 보관한다. 임시 탐색 스크립트와 테스트 원시 로그는 커밋하지 않았다. world-events 통합 뒤 이벤트별 금액 검증은 그 브랜치의 canonical helper를 유지한 통합본에서 재확인해야 한다.
