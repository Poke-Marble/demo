# Phaser 보드와 HTML HUD 실제 게임 연결

2026-11-20, `feat/presentation-integration`. 재부팅 전 변경인 `index.ts`와 `integration/presentation.css`를 `c09facf`에 먼저 보존했다. Phaser `2dd924b`는 `151c8ce`로 충돌 없이 반영했다. 경제·시드·승리·특성·AI 규칙, 원본 이미지와 라이선스 문서는 수정하지 않았다.

## 연결 경계

- 게임 세션마다 Phaser Game/Scene/canvas 하나를 생성하고 HTML 갱신 때 같은 호스트를 다시 붙인다. 로컬 Galmuri 로드 후 dynamic import하며, 새 세션은 이전 Game의 destroy 완료 뒤 생성한다. 390px FIT 초기 크기 복구 코드는 유지한다.
- 실제 32칸 맵과 권위 holdings/players를 전달한다. 칸별 이동, 방향 스프라이트, 건설 강조, 타입별 소유색, 깊이와 카메라는 기존 Phaser 구현을 사용한다. 칸 선택은 HTML 상세 창으로 연결한다.
- `presentEffect`로 기존 HTML VS/비행 대화상자를 한 번만 실행한다. Phaser는 비행 대화상자 뒤 확정 목적지까지 비행하며, 같은 이동을 걷기로 중복 표시하지 않는다. `onStep`은 기존 feedback WebAudio 버스에 발소리만 요청한다. Phaser 자체 오디오는 꺼져 있다.
- HTML HUD는 권위 view의 현금·타입·현재 차례·보유 자산을 표시하고 기존 emotion controller를 공유한다. 현금 증감은 안정적인 update ID가 있는 확정 이벤트만 사용한다. 자산 상세는 HUD의 기존 dialog를 사용한다.
- 주사위 → Phaser 이동/건설/HTML effects → 특성의 직렬 완료 후 `finally`에서 ack한다. 같은 완료 콜백 재전달은 조기에 ack하거나 두 번 호출하지 않는다. 서로 다른 구독 receipt는 각각 해제한다. 스킵·감소 모션·세대 교체·destroy도 대기를 정산한다.
- 감소 모션으로 Phaser effects 진입이 생략되었을 때 선행 HTML 입력 잠금이 남는 문제를 통합 검증에서 발견해 완료 경계에서 해제했다. 상시 왼쪽 음소거 패널은 붙이지 않는다. 기존 mute/volume 저장·unlock/cancel/destroy와 특성 오디오 구독은 유지한다. 중앙/오른쪽 모두 `이동 9칸` 합계를 표시한다.

## 실행과 고정 후보

개발 주소: <http://127.0.0.1:5185/>. 최종 production preview: <http://127.0.0.1:5186/>. 두 포트 모두 비어 있음을 확인한 뒤 자기 워크트리에서 strictPort로 시작했다. 다른 프로세스나 pane은 제어하지 않았다.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort
npm run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5186 --strictPort
node src/ui/game/integration/browser-check.mjs
node --experimental-strip-types src/ui/game/integration/production-check.mjs
```

브라우저 검사는 `../feat-board-art/artifacts/browser-tools/node_modules/playwright`를 읽기 전용으로 사용한다. `PLAYWRIGHT_PATH`, `PRESENTATION_URL`, `PRODUCTION_URL`로 명시 변경할 수 있다. production 검사는 빌드 파일만 요청하며 소스 import나 상태 주입 없이 실제 UI 선택으로 진행한다. 공개 QA snapshot을 읽고 기존 planner로 사람 선택 후보를 정할 뿐 게임 RNG/규칙은 바꾸지 않는다.

고정 번들 파일은 `index-CmfLPeOC.js`, `phaser-DPIr99fQ.js`, `index-TJvKyFhj.css`다. `dist/index.html` SHA-256은 `a07419f04bd6edba16a8e60a7a4e2bbcdc7b8e3a3c84295275889f5c3a674262`다. 동결 후 다시 build하지 않고 동일 5186 주소로 QA한다.

## 검증 결과

- typecheck/lint/build/format:check 및 diff 공백 검사 통과. 전체 Node 테스트 **163/163** 통과. 에셋/출처 파일 **20개 SHA-256** 통과. Galmuri 파일은 기존 provenance의 `8bad9322…eebed31`과 일치한다.
- 실제 production 경기: seed 1, 꼬부기와 AI 3명, **156턴 / revision 466 / 명소 4개 승리**. 실제 구매·건설·통행료·VS·AI3 후 사람 복귀·승리 후 새 여행 시작을 통과했다. 주사위 버튼 연속 입력도 한 번만 확정됐다. PNG 15개 decode 성공, pageerror/requestfailed 0건.
- source 통합 브라우저: 1280에서 실제 canvas 약 **868×625**, 390에서 **362×261**, 모두 양수 크기. 32칸 선택 목록, 같은 canvas 재사용, 로컬 한글 폰트 loaded, 가로 넘침 없음. 9칸 걷기와 발소리 9회, Esc/버튼 스킵, 저장 mute/volume, 감소 모션, 완료 후 입력 해제와 destroy 정리를 통과했다.
- 별도 presentation fixture는 규칙 검증과 구분한다. 비행 HTML 한 번 + Phaser 비행 완료 ack, 중복 receipt, 억제된 VS 잠금 해제, 특성 완료 전 ack 보류/합성 source 생성, 세대 교체와 destroy 취소 정산을 1280/390에서 검증한다.

재현 코드: `integration/browser-check.mjs`, `integration/production-check.mjs`. 로컬 증거는 ignored `artifacts/presentation-integration/`의 `browser-report.json`, `production-report.json`, `production-*.png`, `after-board-{1280,390}.png`에 보존한다. 전체 Node 결과는 워크트리 루트 `integration-tests.log`에 있다. 캡처는 실제로 열어 모바일 보드/HUD와 최종 승리 화면을 확인했다.

커밋에 포함한 증거: [통합 브라우저 결과](../src/ui/game/integration/evidence/browser-report.json), [production 경기 결과](../src/ui/game/integration/evidence/production-report.json), [390px 보드/HUD](../src/ui/game/integration/evidence/board-390.png), [실제 전설 등장](../src/ui/game/integration/evidence/legendary-1280.png), [실제 최종 승리](../src/ui/game/integration/evidence/victory-1280.png). Production 결과의 `hudAuthority`는 최종 현금과 도시/명소 수가 공개 권위 snapshot과 일치했음을 뜻한다.

## 한계와 인계

Chrome headless와 WebAudio 합성 source 생성까지 확인했으며 물리 스피커 청취·실제 OS 백그라운드 전환·장시간 메모리 누수 측정은 하지 않았다. 비행은 presentation fixture의 확정 입력으로 확인했고 실제 완주 경기에서의 비행 사용 여부와 구분한다. Phaser 청크는 약 1.41 MB / gzip 381 KB라 Vite 크기 경고가 있으나 메뉴와 분리되어 있다.

독립 QA 담당 기존 스레드에 5185/5186 주소와 상태를 전달했다. 별도 QA 결과를 이 문서의 자체 검증으로 대신 주장하지 않는다. main 변경·병합, 원격 push, 배포는 수행하지 않았다.
