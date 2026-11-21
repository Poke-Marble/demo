# 전설시험 결과 전달 수정

브랜치: `fix/special-mechanic-feedback`. core/economy 규칙, RNG, AI/public outlook은 변경하지 않았다.
작업트리와 상위 경로, 원본 저장소에서 적용 가능한 AGENTS.md를 찾지 못했다.

## 변경 계약

- `GameView.hudMeta`: 실제 legendary 재고·시험 상태를 HUD에 전달한다. 가호/시험이 없으면 칩을 생략한다. 시험 칩은 이름·대기 상태·시도 수만 표시하고, 재도전 횟수와 보장 회차는 접근성 설명/시험 선택창에 표시한다.
- `UIUpdate.specialEvents`: core의 `trial-resolved`/`rope-used` 원본을 보존한다. 기존 base `GameEvent` 소비자는 그대로 둔다.
- `UIUpdate.results`: 성공/실패/로프/가호 소비/비행 도착 결과를 session+command 기반 ID와 함께 전달한다. 가호 소비는 실제 재고 true→false 변화와 committed quote/settlement가 모두 있어야 표시한다. 재전달은 재소비나 재알림을 만들지 않는다.
- 독립 `result-notice`는 6.5초짜리 비모달 알림이다. native trial dialog보다 위에 그리도록 manual popover를 사용하며, focus와 ack를 기다리지 않는다.
- UI index 수정은 import/mount, update 최종 render 후 show, setup reset, destroy의 5개 hook뿐이다. events presenter/CSS, 전체 layout, Phaser 표식·라벨은 수정하지 않았다. HUD 내부에서 view 메타데이터를 읽어 별도 index 매핑 hook은 필요 없다.

## 검증

전체 Node 테스트 **184/184 통과**:

```powershell
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test
```

관련 기존 adapter/HUD 검사 7개, 전설·경제·결과 매핑·알림 생명주기 검사 34개도 통과했다. 마지막 알림 표시 순서 수정 후 새 매핑/알림 검사 5개를 다시 통과했다. 타입 검사, 변경 파일 ESLint, `git diff --check`, Vite production build 통과.

매핑 단위 검사의 합성 결과는 계약 검사용이며 실제게임 증거로 사용하지 않았다. 3회차 보장은 기존 core 규칙 검사와 전달 계약 검사로 확인했다. 아래 Chrome 회차에서는 3회차 성공을 새로 발생시켰다고 주장하지 않는다.

## 실제 Chrome 증거

`http://127.0.0.1:5196/?qa&fast&seed=1`, 실제 Chrome(channel chrome), 1280×900 / 390×844. 기본 규칙 그대로 합법 버튼 입력만 사용했다. 첫 비행은 칠색조 시험, 다음 비행은 상대 도시를 선택했다. 이는 이전 QA의 TURN5/9 경로와 다른 실제 플레이 경로다.

- TURN13: 비행으로 시험에 진입한 뒤 칠색조 1회차 성공. 가호 HUD/알림 일치.
- TURN17: 비행 도착 통행료 95. 실제 현금 1,250→1,155. 목적지 확정 연속 입력에도 revision은 1회 증가하고 통행료도 1회 차감.
- TURN21: 칠색조 가호 소비. authoritative 건설 견적 195→163, 실제 현금 585→422. 가호 칩 제거와 소비 알림 1회 확인.
- TURN33: 루기아 1회차 실패. 실패 대기·다음 내 차례 재도전·3회차 보장 표시. 로프 1개 사용 후 잔량 0, 같은 TURN33에서 다시 주사위 굴림. 연속 입력에도 소비 1회.
- 인간 입력 27회에서 동일 버튼 연속 입력 시 revision 1회 증가를 검증했다. 기존 adapter 검사는 presentation ack를 받기 전 finance 진행 차단과 stale/restart/AI ack 처리를 검증한다.
- 성공/실패/소비/로프/비행 알림의 양 해상도 화면을 저장하고 확인했다. 가로 overflow 없음. 실패 선택창 위에서 알림이 흐려지지 않는 것도 확인했다. 모바일 HUD는 별도 스크롤 화면으로 확인했다. 전체 화면 높이/배치는 다른 layout 작업의 통합 검증 대상이다.
- 브라우저 pageerror 0.

재현 스크립트: `src/ui/game/integration/special-feedback.browser-check.mjs`.
로컬 증거: `artifacts/special-feedback/report.json`, `node-tests.txt`, `{success,failed,consumed,rope,flight}-{1280,390}.png`, `*-hud-390.png` (artifacts는 gitignore 대상).

통합/main 병합은 수행하지 않았다.
