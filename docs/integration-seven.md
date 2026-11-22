# 관동·성도 7개 작업 통합

2026-11-22. 코드 후보 `f33b7b8`, `feat/presentation-integration` 기준입니다. main 변경·원격 push·웹 배포는 수행하지 않았습니다. 원격 반영은 관리자가 담당합니다.

## 반영 범위

| 작업                           | 원본 완료 커밋               | 반영                        |
| ------------------------------ | ---------------------------- | --------------------------- |
| 모바일 보드 프레이밍           | `81ad7cc`                    | `efaab1d`                   |
| AI 공개 정보 및 능동 기술 후보 | `36ced2f`, AI 전용 `b67fbf5` | `ba632d9`, `7817b12`        |
| 건설 프리셋                    | `e3629ab`                    | `9f1d196`                   |
| 제한 라운드                    | `5fab321`                    | `e07a8c2`                   |
| 턴 헤더·승리 진척              | 헤더 전용 `d7b51ed`          | `a49cdb4`                   |
| 능동 기술 core                 | `e3ef4dc`                    | `529c9e3`                   |
| 능동 기술 UI                   | UI 전용 checkpoint `9d60d9f` | `09a3cae`, 마무리 `f33b7b8` |

중복된 prerequisite를 다시 가져오지 않도록 UI·AI·헤더는 해당 작업 전용 커밋을 cherry-pick했습니다. 프리셋의 start/context 선택과 라운드 finalizeMatch/matchProgress를 함께 보존했습니다. 비용·시드·기존 승리·전설 규칙을 새로 설계하지 않았습니다. 더블 연속 굴림·START 추가 건설·저장/이어하기는 착수하지 않았습니다.

## 통합 수정

- `pendingDice`, `pendingToll`, `pendingDebt` 중 하나라도 있으면 종료·자산 순위를 보류합니다. 미확정 눈으로 기본차례를 끝내거나 미납 통행료를 제한 승리로 회피할 수 없습니다. 마지막 통행료 정산은 제한 경계에서도 허용하고 재전송은 한 번만 반영합니다.
- `dice-revealed`를 UI에 전달합니다. 원래 눈을 공개한 뒤 합법 후보로 유지/조정을 선택하며, 조정 후에는 재굴림 연출 없이 실제 이동 거리를 표시합니다.
- 기술 선택 설명, 활성 플레이어 PP, 사용 조건, 정보창, 발동 sprite/색상/로컬 합성음과 완료 대기열을 연결했습니다. 숫자·가격·소비·합법성은 core/economy에서 결정합니다. 상성 4관계와 시험·비행·강제이동 제한도 설명합니다.
- 중복 전달·스킵·감소 모션·세대 교체·reset·destroy에서도 presentationComplete를 한 번 정산합니다. 기존 소리 설정의 mute/volume/unlock/cancel/destroy 연결을 유지하며 왼쪽 상시 패널은 없습니다.
- 기술 선택과 구매창에 같은 후보 버튼이 중복되지 않도록 했습니다. 자발적 매각 후보는 `매각 선택` 대화상자로 묶어 HUD가 밀리지 않게 했으며, 기존 opaque 선택·견적을 그대로 사용합니다. 채무 청산창은 유지합니다.

## 검증

이번 검증은 실제 Chrome headless에서 수행했습니다. 기존 여섯 작업의 완료 증거를 재사용하고, UI 연결과 정산 경계에 영향을 받는 검사를 실행했습니다.

core 담당 53개, AI 담당 영향 46개, 프리셋 담당 35개 검사는 해당 완료 커밋의 증거를 재사용했습니다. 이 수를 최종 HEAD에서 전부 다시 실행한 수로 합산하지 않습니다.

| 검사                                               | 결과                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| typecheck / lint / format:check / diff --check     | 통과                                                                                                                                 |
| `npm run build`의 typecheck + Vite production 빌드 | 통과, 기존 Phaser 크기 경고만 있음                                                                                                   |
| 외부 에셋 SHA-256                                  | 20개 통과, 원본 에셋·라이선스 변경 없음                                                                                              |
| 제한 경기 및 미정산 보호                           | match 7 + skill-settlement 2 = 9 통과                                                                                                |
| 영향 adapter 검사                                  | 프리셋·주사위 공개·ACK·취소/재시작·AI 대기 통과                                                                                      |
| 통합 엔진 seed 1/42/2026                           | 각각 T121/114/121에서 종료, commands 393/383/379, 모두 round-limit-assets                                                            |
| production 실제 UI seed 1                          | 30라운드 → T121/revision393, 최종 4순위와 재시작 통과, errors/requestfailed 0                                                        |
| PC 1280 / 모바일 390 기술 UI                       | 원래 4+1 공개 후 -1 → 실제 4칸, PP3→2, 구매/매각 실제 현금 및 중복 입력 1회 반영, 오류 0                                             |
| 경제 기술 실제 UI                                  | 파이리 T37: 512→437(견적75), PP3→2. 피카츄 T21: 562→282(견적280), PP2→1                                                              |
| 전설·가호·로프·비행                                | 실제 UI 경로: T13 비행→칠색조 성공, T21 가호 시설 결제195→163, T33 루기아 실패→로프0→같은 차례 굴리기 복귀. 반복 입력 37회 검사 통과 |

일반·시험 상태와 결과 notice를 1280×720 / 390×844에서 모두 측정했습니다. 네 초상화가 보이고 HUD/보드 겹침, notice/HUD 겹침, notice/필수 버튼 겹침은 모두 0입니다. 문서 외곽 스크롤도 없습니다. PC 보드 표면 840×530, 모바일은 상태에 따라 370×163.3~268.4이며 긴 시험 메타데이터 때 보드가 작아집니다. 별도 기술 조정 화면의 실제 canvas는 839.5×654 / 370×317.1, 기술 HUD 높이는 64px입니다. Phaser canvas는 하나를 재사용합니다.

초기 통합 검사에서 프리셋 runner가 공개된 눈을 선택하지 않고 구매창을 기대한 실패를 수정했습니다. 기존 전설 runner도 능동 이동으로 경로가 달라져 목표를 놓쳤으므로 그 검사는 무료 원래 합계 유지 후보를 선택하도록 수정했습니다. 권위 거래 오류로 간주하거나 기존 버그로 닫지 않았습니다. 기술 조정·소비는 별도 실제 UI 검사로 확인했습니다.

원본 결과와 선택 캡처는 [증거 폴더](evidence/integration-seven/)에 있습니다. 전설 보고서에는 일반·시험·가호·로프 상태의 geometry와 두 해상도의 시험 sprite 로딩 결과가 포함됩니다. 기술 보고서에는 동일 update 재전달 시 ACK 1회, 스킵·reset·destroy 정산 결과가 포함됩니다. production 전체 경기는 감소 모션을 사용하므로 발동 overlay 관측 배열은 비어 있을 수 있으며 사용 횟수로 해석하지 않습니다.

검증한 최종 production 파일을 **http://127.0.0.1:5192/** 에 반영하고 같은 주소에서 Chrome 1280/390 시작·물대포 +1·PP 소비·canvas 1개·오류 0을 확인했습니다. 서버 프로세스는 유지하며 기존 hashed assets도 남겨 이미 열린 세션을 보호했습니다. 최종 `dist/index.html` SHA-256은 `8d7488eb12e5adee3f2cbd17321bd6aa2764dc64d0aed226512a3dccc2ba79a7`입니다. 로컬 확인 주소이며 외부 배포가 아닙니다.

## 재현

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build -- --outDir artifacts/final-seven-candidate
npm.cmd run assets:verify
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test src/game/match/match.test.mjs src/game/match/skill-settlement.test.mjs
```

브라우저 검사는 순차 실행합니다. `scripts/check-skill-ui.mjs`는 개발 서버의 실제 모듈을 사용하며 `GAME_URL`을 받습니다. `src/ui/game/integration/production-check.mjs`는 `PRODUCTION_URL`, `special-feedback.browser-check.mjs`는 `SPECIAL_ORIGIN`을 받습니다. Playwright는 기존 board-art 워크트리의 읽기 전용 설치를 재사용하며 `channel: 'chrome'`입니다. 전체경기 검증기는 비행 카드를 선택한 후 `목적지 확정`까지 누릅니다. CSS/dataURL을 포함한 Node 검사는 위 register.mjs를 사용합니다.

## 표본과 한계

기존 AI 담당의 seed42 좌석 순환 4경기 표본에서는 16명 모두 3PP(총48)를 소비했습니다. 권위 `activation.skillSavings` 합계는 풀0/불636/물55/전기639, 총1330입니다. 이는 가호 적용 후 추가 의무액 절약이며 이동의 전략 가치나 회수한 현금이 아닙니다. 풀·물 각1승, 나머지2경기는 240turn 관측 상한으로 중단했습니다. 이 도구는 finalizeMatch를 사용하지 않았으므로 현재 30/20라운드 경기의 승리 분포로 해석할 수 없습니다. 작은 기존 표본을 균형 확정으로 주장하지 않습니다.

최종 후보의 신규 모든 좌석·시드 조합을 전수 검사하지 않았습니다. 원작 허락·배포 권리·운영 연락처는 확인된 것으로 꾸미지 않았고 README의 권리·크레딧·삭제 요청 안내를 보존했습니다. 오디오는 Chrome에서 생성/설정/취소 경로를 실행했지만 실제 스피커 청취 평가는 하지 않았습니다. 원격 업로드와 웹 배포는 이 검증과 별개입니다.
