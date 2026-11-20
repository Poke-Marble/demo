# 실제 경기 통합

통합 경계는 economy dispatcher → 검증된 확정 영수증의 특성 quote/commit → 채무가 없는 최종 스냅샷의 victory finalizer → 연출 outbox 순서다. CoreState.legendary, economy, abilityLedger를 함께 보존한다. 특성 API는 자체 지급을 하지 않으므로 연결 계층이 영수증을 검증하고 금액·ledger·outbox를 하나의 상태 교체로 확정한다. 애니메이션 콜백은 금융 처리를 하지 않는다.

producer 변경 필요 사유: subscribe는 void callback이므로 실제 연출이 끝났는지 AI가 알 수 없다. UIUpdate의 presentation ack를 추가하고 성공·취소·세대 교체·destroy 모두 대기를 해제한다. 기존 어댑터에는 선택 계약이므로 호환된다. 능력 프레젠터와 feedback은 별도 AudioContext 두 개를 사용하며, 같은 음소거/볼륨 구독과 unlock/cancel/destroy 수명으로 연결한다.

경제 가격 seed, 초기자금 1500, 출발 보상 200 및 특성 draftConfig는 기획 확정값이 아닌 현재 게임 기본값이다. 초기 이어하기 저장은 범위 밖이다.

events/assets의 원본 LICENSE.md, README.md, tracker.json, credit_names.txt와 수집 manifest.json은 SHA 근거자료다. 이 정확한 경로만 Prettier에서 제외하고 원본 바이트는 변경하지 않는다.

## 명령·정산·연출 계약

사람과 AI는 같은 `getLegalActions` 및 경제 견적을 사용한다. UI의 선택 ID는 세션/revision에 묶이며 비용·해금·합법성을 UI에서 계산하지 않는다. 명소와 특수칸을 구별하고, 개인 바퀴/최종 재방문/인수 면역/채무 선순위는 경제 엔진에 위임한다. 기존 무료 건설·임의 도착·소유권 변경 도구는 제거했다. `/`와 기존 `game-preview.html`은 같은 연결 함수를 사용한다.

`settlement.ts`는 `verifyCommittedReceipt`를 통과한 dispatcher 결과의 `toll-settled.recovered`를 사용한다. 건설은 부지를 제외한 할인 후 시설비만 심록의 대상이다. START 보상이나 마지막 매각이 선행한 경우 정산 후 기본 잔액에서 해당 이체를 역산하여 거래 직전 잔액을 구한다. 특성 금액을 더한 다음 상태를 역산에 사용하지 않는다. 파산으로 차례가 넘어가도 원명령의 전역 턴을 기록한다. 파산자에게는 환급하지 않고, 수취인의 실제 회수액만 보상 대상으로 삼는다. 특성 자체의 파생 지급은 기본 거래로 재입력하지 않는다. 현재 50% 매각률과 최대 15% 건설 환급에서는 즉시 재매각해도 원 지출이 남으며, 다른 매각률/환급률을 도입할 때 원금 추적 정책을 다시 검토해야 한다.

승리 우선순위는 승리 모듈의 기본 설정(생존 → 3그룹 → 한 면 → 4명소)을 그대로 사용한다. 채무가 남으면 판정을 유보한다. 소유권 변경 여부와 관계없이 정산 완료 시 확정하며, 최종 상태를 한 번 교체한 뒤에만 UI에 발행한다. 금융 처리는 연출 콜백에 없다.

AI는 executor 한 개를 공유한다. 실제 legal 후보의 원 payload를 planner에 전달하고, 미래 수익은 경제 `tollBase`에서 가져온 한 번의 상대 방문이라는 **휴리스틱**으로 표시한다. 명령 직전 세션/턴/revision/후보/연출 잠금을 다시 확인한다. 긴 executor commandId는 원본 ID → 짧은 경제 envelope의 세션 내 매핑으로 보존하며, 같은 envelope는 경제 영수증 재조회만 하고 특성을 재지급하지 않는다. 최대 64회 전송·콜백 60초 제한과 AbortSignal을 사용한다.

`presentationComplete`는 구독자별 ack다. 발행 전에 잠그고, 구독자 해제는 해당 구독자의 ack만 해제한다. 실제 UI는 주사위·이동·VS·특성을 모두 기다린 뒤 `finally`에서 ack한다. 중복/오류/취소/재시작/destroy도 대기를 정산한다. finished 입력은 즉시 막고 AI abort 대기는 해제하되, 최종 UI는 재생 또는 정리 후 자신의 ack를 완료한다. 두 AudioContext는 통합 믹서가 아니며, feedback 설정을 ability presenter.audio에 구독해 공유한다. 숨김·건너뛰기·재시작·destroy에서 특성 큐와 소리를 취소한다.

재현용 `?fast&seed=1&qa`는 초기 seed/생각 지연만 선택하고 공개 AI snapshot을 읽기 전용 dataset에 기록한다. 실제 금융·소유권·주사위 결과를 임의 변경하지 않는다. 기본 진입 `/`에는 진단 표시가 없다.

## 최종 검증 — 2026-11-19

- `npm ci`, 로컬 `npm run typecheck`, `lint`, `build`, `format:check`, `git diff --check` 통과. 전체 Node 테스트 **157/157** 통과 (`node --experimental-strip-types --test`, src/scripts 전체). 원본 14개 SHA256/XML/크레딧 검증도 통과했다.
- 실제 엔진 + 사람의 합법 선택 하네스 + 실제 AI3, 지연0: **seed 1은 156턴·466명령·소유21개·파산2명에서 player:1의 4명소 승리로 finished를 assert**했다. fixture 상태 주입 없이 처음부터 진행한 경기다. 매 단계 revision 진전과 테스트 timeout으로 정체를 실패 처리한다.
- seed 42는 240턴·712명령·소유27개·파산0명, seed 2026은 240턴·709명령·소유27개·파산1명까지 진행했다. 이 두 결과는 장기 진행 검증이며 **완주로 계산하지 않는다**. 이전 수익 전망 연결 전 seed 42의 159턴 결과는 최종 후보의 완주 근거로 사용하지 않는다.
- 4승리 경계는 별도 제어된 상태에서 **실제 합법 구매/파산 거래** 후 판정했다. 일반 경기 완주와 구분한다. START 정산 전 잔액 500/501, 마지막 매각 후 임계 초과, 채무 미정산 무발동, 부분 회수 파산/원거래 턴, 가호 할인 + 특성 영수증 멱등, stale 선택/restart, 실제 ack 정지·abort, 진단 구독 해제·동기 재진입 잠금도 테스트했다.
- 고정 root 프로덕션 번들 Chrome headless 검증: 1280/390에서 NEW GAME → 파트너 선택 → 32칸/4명 → 실제 견적·구매/건설 차감 → AI3 → 사람 복귀, 이미지 decode, 한글, 음소거/볼륨, 건너뛰기와 감소 모션. 큰 루기아 VS와 기존 보드/초상화를 직접 캡처 확인했다. 관리자 독립 QA에서도 두 폭의 실제 건설·중복 roll 잠금·AI3 복귀 및 예외/요청/콘솔 오류0을 보고받았다.
- 같은 고정 프로덕션 Chrome에서 seed 1을 실제 UI 선택으로 **156턴·466명령까지 완주**하여 `나 승리 · 명소 4개`를 확인하고, **승리 후 새 여행 시작 → 타이틀 복귀**도 통과했다. `production-report.json`의 ended/trial/dice/bought/mobile은 모두 true, errors/failed는 빈 배열이며 PNG 18개 decode가 성공했다. 중간 경기 재시작 UI 검증과 혼동하지 않는다.

P0 검토 대응: R1 원자적 합성/재전송, R2 채무·파산 후 승리, R3 실제 회수액/거래 시점/턴/특성 ledger, R4 실제 ack/취소 경계를 구현하고 위 테스트로 확인했다. DT-01/02/06은 UI 정상 ack, 구독자별 취소·재진입 잠금 및 실제 Chrome AI3 복귀로 확인했다. DT-03/04는 부분 회수·START·매각 경계 테스트, DT-05는 경제 영수증 재전송과 원본 AI ID 매핑으로 대응했다. 네트워크 응답 유실 자체는 메모리 내 로컬 dispatcher 환경에서 실제 발생시키지 않았다.

검증 산출물은 로컬 `artifacts/mvp-integration/`에 있다: `tests.log`, `browser-report.json`, `production-report.json`, `production-*.png` 및 재현용 브라우저 스크립트. `production-report.json`이 생성된 실행의 결과만 전체 Chrome 완주 증거로 사용한다.

한계: 초기 이어하기/영구 저장 없음. 중간 경기 재시작 UI는 제공하지 않으며 adapter 재시작/취소 테스트와 승리 후 새 여행을 구분한다. 물리 스피커 청취·실제 OS 백그라운드 전환·장기 밸런스/승률 튜닝은 미검증이다. 현재 두 개의 AudioContext를 한 믹서로 합치지 않았다. UI polish 및 Phaser/HUD 교체는 별도 작업 범위다.

안정 확인 주소: <http://127.0.0.1:5180/> — 이 워크트리의 `vite preview --host 127.0.0.1 --port 5180 --strictPort`. 5173은 제어하지 않았다. 로컬 커밋만 하며 main 병합/원격 push/배포는 하지 않는다.

## 후속 UI/HUD/Phaser 연결 충돌점

`src/ui/game/index.ts`를 병합하거나 renderer를 교체할 때 다음 계약을 보존해야 한다. 이번 변경은 renderer 교체나 별도 UI polish를 포함하지 않는다.

- `mountGameUI` 초기화/해제: 특성 presenter, feedback.audio 설정 구독, 두 audio unlock, visibility 취소, destroy 정리를 함께 옮긴다. 상시 음소거 패널을 바꾸더라도 같은 설정 구독이 유지되어야 한다.
- `choiceButton`: `selectionId`와 `data-choice-id`는 권위 세션/revision에 묶인 opaque 선택을 전달한다. `GameAction.playerId`만 검사하던 예전 guard로 되돌리면 매각 등 경제 선택이 막힌다.
- `update`와 subscribe Promise queue: 주사위·이동·VS·특성을 기다린 뒤 `finally`에서 `presentationComplete`를 호출해야 한다. renderer 시작이나 publish 직후에 ack하면 AI가 연출을 추월한다. 감소 모션/skip/오류/세대 교체/destroy에서도 대기를 정산한다.
- `UIUpdate.abilityActivations`는 이미 지급·원장 확정된 outbox다. 새 HUD나 Phaser 이펙트는 표시만 하며 금융 처리를 다시 호출하지 않는다. 승리 상태에서 입력 차단과 AI 취소도 유지한다.

최종 소스 동결 이후에는 문서만 보완했다. 추가 브라우저 실행이나 UI 범위 확장 없이 관리자 최종 리뷰를 기다린다.
