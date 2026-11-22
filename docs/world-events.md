# 집계형 전설 맵 이벤트 인계

Base: `098d23d`, branch: `feat/legendary-map-events`. 실제 게임의 `createIntegratedPreview().fresh()`는 `worldEvents: {}`와 `legendary: { initialRopes: 0 }`를 사용한다. `GameView.worldEvents`를 전달하고 legacy 시험/로프/개인 가호 HUD는 숨긴다. 맵 표기에서도 시험 문구를 제거했다. `worldEvents` 없는 기존 시험 fixture와 API는 호환용으로 남는다.

## 도착·카운터

- 중앙 데이터 `src/game/world-events/index.ts`의 `worldEventRules`: 정확한 도착 보상 50, 서로 다른 ID 3명, 기간 2라운드, 두 할인율 25%.
- 일반 이동의 최종 도착과 공중날기 도착만 같은 `enterSpecial` 경로로 지급한다. 중간 통과는 호출하지 않는다. 시험 감금, 확률, 재도전, 로프 소비는 실제 모드에 없다.
- 도착 키는 `turnNumber:playerId:tileId`. 같은 도착 재전달은 상태를 그대로 반환한다. 경제 command replay/stale 보호도 함께 작동한다. 다른 차례의 재방문은 50을 다시 받지만 현재 카운터에서 ID는 한 번만 센다.
- 카운터는 **칸별 독립**. 세 번째 서로 다른 방문자가 오면 해당 칸만 빈 배열로 초기화하고 전역 이벤트를 발동한다. 파산한 과거 방문자를 삭제하지 않는다. 생존자 수에 따라 임계값을 낮추지 않으므로 2명만으로는 새 발동이 불가능하다.
- 일반 도착은 짧은 보상/`n/3명` 결과 안내. 세 번째 도착만 `world-event` 요청으로 기존 대형 실제 PMD sprite를 표시한다. 입자 효과는 추가하지 않았다.

## 기간과 권위 견적

현재 라운드는 `match.completedRounds + 1`. R라운드에 발동하면 `expiresAfterRound = R + 1`; R+1의 마지막 기본 차례가 끝나 R+2로 넘어갈 때 제거한다. 동종 재발동은 만료 라운드만 새로 설정하며 배율은 중첩하지 않는다. 두 종류는 동시에 독립적으로 유효하다. 종료·승리 시 전체 world 상태를 초기화하고 재시작은 fresh 상태를 만든다. 정리는 금액 변동이나 반복 금융 명령을 발생시키지 않는다.

루기아는 모든 **도시 통행료**, 칠색조는 모든 **도시 시설 건설비 합계**만 25% 할인한다. 토지, 인수, 명소 통행료/구매, 매각 원가는 제외한다. 정수 금액에서 `amount - floor(amount * .25)`를 사용한다. 가령 101은 76이다.

권위 경로는 `tollBase`의 그룹 배율 → `quotePreBlessingAmount`의 world 할인 → 신뢰된 economy modifiers → 기존 skill/개인 가호 합성이다. 시설은 토지를 분리한 upgrade subtotal에 한 번 적용한다. 기존 skill의 정확한 유리수 합성·최소액·상한 계산을 보존한다. 가령 그룹 반영 200 → world 150 → legacy 50% 가호 기준액 75 → 25% skill(상한 미도달)이면 최종 56이다. 실게임은 개인 가호를 새로 지급하지 않지만 fixture/호환 데이터의 가호는 기존 규칙대로 한 번 소비한다.

`makeQuote`와 construction commit은 **동일한 `quotePreBlessingAmount` helper**를 사용한다. 통행료는 견적의 확정 `gross`와 `consumesBlessing`을 debt/payment에 보존한다. 결제 때 world 할인이나 skill을 다시 적용하지 않는다. AI explicit public projection에는 `worldEvents`와 `match`를 함께 추가해 실제 견적의 기간/금액과 일치시켰다.

## 병렬 브랜치 통합 계약

- START 담당(`77abb2d`): `economy/types/index`, START opportunity와 quoteConstruction 권한 부분은 START 구현 보존. 양쪽 quotes helper가 겹치면 **이 브랜치의 world 적용 helper 본문을 유지**한다. START quote와 두 construction commit 경로 모두 helper를 사용해야 한다. START의 `pendingStartBuild` AI projection 및 `hasPendingSettlement` 추가도 보존한다.
- `pendingDice`/`pendingToll`/`pendingDebt`가 있을 때 기존 승리·순위 defer를 유지했다. START 미정산 defer는 START 브랜치의 변경과 결합한다. 이 브랜치가 별도 금융/승리 판정 경로를 만들지 않는다.
- board flight 담당: `GameView.worldEvents`, fresh 옵션, 최소 notice 투영을 보존하며 비행 목적지 선택 계약은 유지한다.
- mounted flight 담당: presenter의 **fly 진입 early return**을 보존하고 이 브랜치의 `world-event` union/PMD 표시 hunk와 결합한다. `trial-intro`는 fixture 호환용이다.
- property UI의 fullscreen/modal, turn header에는 변경하지 않았다.

## 검증 및 preview

최종 preview: **http://127.0.0.1:5218**. cwd는 `C:\Users\hyun\.herdr\worktrees\demo\feat-legendary-map-events`, 명령은 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5218 --strictPort`, 소유 exec session은 `68824`. 통합 담당의 이관 요청 전까지 유지하며 요청 시 소유자가 정상 종료한다. 5211의 미확인 PID와 branding의 5216은 종료하지 않았다.

5218의 실제 HTTP 응답에서 world module `arrivalReward: 50`, adapter `worldEvents: {}` / `initialRopes: 0`을 확인했다. 브라우저 runtime도 world 활성, ropes `[0,0,0,0]`, trial 모두 null, GameView projection 활성이다. 실제 시작 화면 1280/390에서 시험·로프·성공확률·재도전 문구가 없다.

검증 증거: `src/ui/game/integration/evidence/world-events/`의 report 및 PNG. 실제 Chrome **157.0.8103.80**에서 1280/390 두 전설의 원본 PMD canvas 픽셀, 잘림 없음, 기간/25% 문구, reduced motion 및 dismiss를 확인했다. 대형 sprite 영역은 desktop 480px, mobile 312px이다.

집중 테스트 62개 통과(경제/legacy 전설 32, core/AI/판정/feedback/world 경계 30). 새 world 테스트는 정확 도착/통과/비행, 보상 재전송, 재방문, 독립 카운터, 파산 방문자 유지, 3인 발동/reset, 만료/갱신, 토지·인수 제외, 개인 가호 합성, 경제 replay/stale, 승리 정리를 확인한다. typecheck/build/lint도 확인한다. 기존 시드 전체 검사는 반복하지 않았다.

이 브랜치의 실제 경기 seed 1은 임시 전용 5227에서 **121turn / 373revision**, 30라운드 최종 자산 승리까지 완료했다. old trial/rope UI는 없었다. 기존 `production-check.mjs`는 경기 완료 후 마지막 이미지 전수 검사에서 실패했으므로 전체 PASS로 주장하지 않는다. 원인은 Vite `.png?import&url` **JavaScript module 응답을 PNG로 디코딩**한 분류 오류와 빈 src 예약 이미지였다. 같은 full seed는 다시 돌리지 않았다.

후속 targeted `scripts/check-world-images.mjs`는 module default로 실제 정적 URL을 얻고 `Image.currentSrc`와 HTTP MIME/status, PNG decode를 확인했다. **64회 디코딩 관측 / 52개 고유 자산** 모두 200·image/png·decode 성공이다. 빈 src 1개는 `.ability-hud`의 예약 portrait로, 부모 role=status/hidden=true/display:none, 이미지 표시 rect 0을 DOM에서 확인했다. 실제 URL이 있는 이미지 실패는 없다. `report.json`에 모든 관측과 DOM 근거를 기록했다.

재현 명령:

```powershell
node --experimental-strip-types --test src/game/world-events/world-events.test.mjs
node --experimental-strip-types scripts/check-world-events.mjs
node scripts/check-world-images.mjs
npm run typecheck
npm run lint
npm run build
```

main merge와 push는 수행하지 않는다.
