# 전설 맵 이벤트·START·비행·화면 통합

2026-11-22, 기준 `098d23d`. 구현 담당들의 완료·clean 상태를 확인한 뒤 `feat/presentation-integration`에 순차 병합했다. main 병합·원격 push·웹 배포는 관리자가 담당하며 이 작업에서는 수행하지 않았다.

| 작업                             | 완료 브랜치 HEAD                             |
| -------------------------------- | -------------------------------------------- |
| Poké Marble 표시명·공개용 README | `cfa4123` (`f793128` 포함)                   |
| 정확 START 건설                  | `77abb2d`                                    |
| 재산·공용 선택창 bounds          | `99a32af`                                    |
| Phaser 보드 비행 선택            | `c0c017f`                                    |
| 집계형 전설 맵 이벤트            | `14a7594`                                    |
| 아머까오 탑승·공유 소리          | `acd841f`                                    |
| 시작 화면 스크롤·기술 설명       | `2112420` (작은 세로·가로 및 대비 후속 포함) |

## 경계와 충돌 해결

경제 quotes의 충돌은 START 선택 권한과 world의 `quotePreBlessingAmount` 구현을 함께 유지했다. 자동 병합이 만든 중복 import/함수도 제거했다. 일반·START 건설 견적과 결제는 같은 함수로 world → modifier → 기존 가호/기술 합성을 적용한다. 새 통합 회귀에서 world 유무 × modifier 50%/0% × legacy 가호의 실제 견적·결제·가호 소비·재전송을 검증했다. 0원에서는 가호를 소비하지 않는다.

`pendingDice`, `pendingToll`, `pendingDebt`, `pendingStartBuild` 중 하나라도 있으면 승리·자산 순위를 보류한다. START 해결 자체는 기본차례를 끝내지 않으며 이후 end-turn만 라운드를 진행한다. AI public projection에는 worldEvents, match와 START 기회를 함께 유지했다. 비용·시드·3PP·상성·기존 승리 규칙은 새로 작성하지 않았다.

Phaser의 보드 목적지 선택·drag 판정·별도 확정과 탑승 재생을 함께 유지했다. fly는 HTML 탑승 presenter 한 곳에서 재생하고 해당 pawn/shadow는 숨겼다가 도착 상태로 복원한다. 동일 효과를 별도 walk로 중복 재생하지 않는다. world-event union/PMD 연출과 fly early return도 함께 유지했다. 기존 공유 WebAudio mute/volume/unlock/cancel/destroy와 선택/hover/날갯짓/바람/착지 연결을 보존했다.

공용 modal의 제목·내용 scroller·고정 close footer, 검색 가능한 자산 상세, START 선택창, setup 독립 정보창이 공존한다. setup의 긴 기술 설명은 정보창에서 읽으며 첫 화면·파트너·맵 로비는 스크롤하지 않는다. 짧은 가로 화면에서는 장식 초상화/타입 chip을 줄이고 이름·효과·시점·횟수·정보 버튼을 유지한다. 최종 밝은 배경의 설명 대비도 보정했다.

## 최종 결합 검사

- typecheck, lint, format:check, build, diff --check 통과. 빌드의 기존 Phaser 큰 청크 경고는 남는다.
- 관련 Node 회귀 **40개** 통과. 별도 adapter **3개**(seed1 전체 경기, 진단 구독 ACK, AI abort/restart) 통과. 기존 담당의 전체 검사 수를 더해 최종 HEAD의 실행 수로 주장하지 않는다.
- 통합 adapter seed1 실제 엔진: **T121 / 375commands**, round-limit-assets, holdings22, 파산0, 사람 승리. world 단독 담당의 121turn/373revision 브라우저 완주는 별도 기존 증거로 재사용했다. 이미지 분류 수정 때문에 그 경기를 반복하지 않았다.
- Chrome 1280×720 / 390×844 / 375×812 / 844×390: title, 4파트너 각각, map의 **24개 화면 측정**, 정보창 **16개**의 마지막 설명 접근·제목·close 접근 확인. document와 lobby의 가로·세로 overflow 없음. 실제 `Poké Marble` 문자열과 로컬 글꼴을 캡처에서 확인했다.
- START × world × 공용 modal: 1280/390에서 skip/build **4사례**. seed3의 실제 합법 이동으로 T17 START에 도착, 515→515(skip) / 515→435(센터80). revision+1, stale/이중 클릭 추가 결제 없음, 실제 START 착지·월급·주회 유지, 부채 없음.
- 보드 비행: 1280/390, 31개 목적지, drag 오선택 방지, 정보 카드·경로·키보드·확정 1회·무효화/reset/skip/destroy 통과. 실제 상대 도시 도착의 견적/지불/회수 **100/100/100** 일치. 다른 실제 비행은 전설 칸에 도착하고 old trial-intro는 0개, 연출 정산 후 **AI 3명 진행→사람 복귀** 확인.
- 보드 선택 × 탑승: 1280/390에서 원본 아머까오와 꼬부기 승객의 횡단·착지 캡처, pawn 숨김, 실제 도착 및 ACK **각1회**, revision+1, 페이지 오류0. 이륙 단계는 담당의 기존 증거를 재사용했다. 투명 canvas 전체 사각형 대신 실제 알파 픽셀 경계를 측정해 sprite 잘림을 확인했다.
- world PMD: 두 전설 × 1280/390, 실제 픽셀·잘림 없음·기간·quiet stage·감소 모션/reset 및 실제모드의 ropes0/trialsnull 확인.
- 재산 UI 담당의 32 geometry/20 거래/4 dice/4 긴 설명 증거를 재사용하고, 결합된 공용 modal에서는 긴 설명 **4해상도**를 다시 확인했다. 28개 최대 소유 같은 stress fixture는 정상 경기 도중 생긴 상태라고 주장하지 않는다.
- 기존 외부 파일20개와 신규 탑승 원본10개 SHA-256 검증 통과. 대상 이미지는 HTTP MIME과 module default/currentSrc로 구분해 **66회 관측 / 54개 고유 자산** PNG decode 성공. src 없는 숨겨진 예약 초상화1개는 rect0/display:none으로 확인했다.

선택한 원본 결과·캡처는 [결합 증거](evidence/world-flight-integration/)에 보존한다. 각 담당의 독립 검증은 [world](world-events.md), [START](start-build-choice.md), [property](property-panel-overflow.md), [mounted](mounted-flight.md), [branding](poke-marble-branding.md)에서 구분한다.

최종 주소는 **http://127.0.0.1:5218/** 이다. world 담당이 자기 소유 session68824를 정상 종료하고 포트 해제를 확인한 뒤, 통합 워크트리에서 production preview를 strict5218로 시작했다(session15153). 미확인 PID를 종료하지 않았으며 다른 서버는 유지했다. 사전 production5229에서 setup 4해상도 검사를 통과했고, 이관 뒤 같은5218에서 Chrome1280/390의 실제 시작·물대포+1·PP3→2·실제6칸 이동·단일 canvas·오류0을 재확인했다. 제공 중인 HTML SHA-256은 `7e308879bb8ea66bb0cb1cf4d32ea9b2d5ac74fdf5d8343e3606255a85ba836f`이다.

서버 cwd는 `C:/Users/hyun/.herdr/worktrees/demo/feat-presentation-integration`, 명령은 `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5218 --strictPort --outDir artifacts/final-world-start-flight`다. 로컬 preview이며 웹 배포가 아니다. 최종 통합의 전체 경기는 adapter에서 검증했고, 새 production 빌드에서 동일 전체 경기를 다시 완주했다고 주장하지 않는다.

## 검증 도구 호환 수정

world module이 추가돼 data URL 기반 presenter 단위검사의 상대 import가 실패하던 부분은 해당 순수 module URL을 연결해 해결했다. UI/경제 규칙 오류가 아니었다.

START 브라우저 검사의 과거 seed3/T45·도시 이름 가정은 world 변경 뒤 맞지 않았다. `START_GENERAL=1`은 실제 합법 선택으로 START 착지를 선택하고 현재 opaque 후보/단계/견적으로 검증한다. 기본의 기존 final시설 시나리오는 유지한다. 기존 최종시설 정책은 단위검사와 담당의 실제 UI 증거를 재사용했다.

탑승 QA 전용 entry의 과거 seed1은 새 world 경기에서 비행 전에 승리해 warmup을 마치지 못했다. QA entry만 이미 보드 검증에서 도달한 seed42/꼬부기와 동일 합법 planner로 조정했다. 제품 entry의 시드·룰·선택은 변경하지 않았다. 비행 진단 구독도 자기 ACK를 반환하게 해 실제 UI ACK와 AI 재개 검증을 막지 않도록 했다.

브라우저 검사는 순차 실행했다. 원본 파일을 임시 baseline.ts로 교체하지 않았다. 자동 컴퓨터 사용이 URL 신뢰도 문제로 중단된 branding 담당의 증거는 cmap 확인으로만 기록돼 있었으며, 최종 결합은 명시 localhost의 기존 Playwright/Chrome으로 실제 표시와 캡처를 확인했다.

## 실행과 한계

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build -- --outDir artifacts/final-world-start-flight
node scripts/verify-mounted-assets.mjs
npm.cmd run assets:verify
```

`scripts/check-setup-integration.mjs`, `scripts/check-mounted-integration.mjs`는 `GAME_URL`을 받는다. START 검사에는 `GAME_URL`과 `START_GENERAL=1`, 보드 검사에는 `FLIGHT_URL`/`FLIGHT_EVIDENCE`, world 검사에는 `WORLD_ORIGIN`을 사용한다. Node UI 검사는 `--experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test`로 실행한다. Playwright는 기존 board-art 워크트리의 읽기 전용 설치를 재사용한다.

모든 시드·좌석·브라우저를 전수 검사하거나 밸런스를 확정하지 않았다. 합성음 설정·생성·취소 경로는 검사했으며 실제 스피커 청취 평가는 하지 않았다. 더블 연속 굴림·저장·다른 지방 등 새로운 기능은 착수하지 않았다. README는 개발 로그 대신 현재 게임 소개·실행·개별 권리/크레딧을 설명하며 원작 허락이나 운영 연락처가 확인된 것처럼 꾸미지 않았다.
