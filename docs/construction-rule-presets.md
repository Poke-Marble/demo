# 건설 규칙 프리셋

기준 `195dd6c`, 브랜치 `feat/construction-rule-presets`. 출발지 건설은 이번 범위에 포함하지 않는다.

| 새 경기 선택 | 개인 완료 주회 해금 (camp/shop/center/final) | 최종시설 조건                      |
| ------------ | -------------------------------------------- | ---------------------------------- |
| 표준 (기본)  | `[0,0,1,2]`                                  | 센터 보유 후 해당 도시에 새로 도착 |
| 짧은 경기    | `[0,0,1,1]`                                  | 센터 보유 후 해당 도시에 새로 도착 |

`src/game/rulesets.ts`의 `RulesPreset`, `normalizeRulesPreset`, `rulesPresets`가 공통 계약이다. 정의와 내부 배열은 동결된다. 라운드 담당은 같은 정의의 `roundLimit` (표준 30 / 짧은 경기 20)을 소비한다. 이 브랜치는 core 라운드 로직을 수정하지 않는다. integration adapter는 `createGame` 옵션에 `rulesPreset`을 전달하며 라운드 브랜치 통합 시 적용된다.

`GameSetup.rulesPreset?`는 `standard | quick`. 생략하면 항상 표준이고 유효하지 않은 값은 기존 세션을 교체하기 전에 거부한다. `start`는 선택한 프로필로 새 context와 session을 만든다. UI가 setup 객체를 나중에 바꾸어도 진행 중 context는 바뀌지 않는다. profile id/version/catalog/configurationKey 검증은 그대로 적용되어 다른 프리셋이나 변경된 설정으로 기존 세션을 정산할 수 없다.

가격·누적 건설·통행료·가호·인수·매각·최종 인수면역은 기존 권위 API를 그대로 사용한다. 실제 24개 도시의 `finalFacility.key`와 이름을 유지한다. 구매창은 시설별 개인 필요/현재 주회 및 센터 이후 재방문을 설명한다. 주회는 전역 turn이나 라운드로 대체하지 않는다.

UI 선택기는 `src/ui/game/rules-preset.ts`에 분리되어 있다. index.ts 변경은 map 설정 화면의 append, 선택값, start 전달뿐이며 starter 카드·header·skill hook·CSS에는 손대지 않는다.

검증 명령:

```powershell
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test src/game/economy/economy.test.mjs src/ui/game/integration/settlement.test.mjs src/ui/game/construction-effects/model.test.mjs src/ui/game/integration/adapter.test.mjs
node src/ui/game/integration/rules-preset.browser-check.mjs
npm run build
npm run lint
```

브라우저 검사는 기본 `http://127.0.0.1:5203`에서 Chrome을 사용한다. 1280×720 및 390×844의 두 선택·시작·구매창과 설정 화면을 벗어났다 돌아왔을 때 선택 보존을 검증한다. 결과와 스크린샷은 `artifacts/rules-presets/`에 저장한다.

전체 검사의 정규 명령은 `$tests = rg --files -g '*.test.mjs' src` 후 `node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test @tests`이다. hook 없이 실행하면 `events/presenter.test.mjs`의 data URL 상대 import 및 `result-notice/notice.test.mjs`의 CSS import가 실패한다. 이는 정규 명령과 다른 테스트 드라이버에 의한 오류다. 같은 정규 hook을 적용한 기준 `195dd6c`와 수정본에서 해당 두 파일의 9개 검사는 모두 통과했다. 로더 수정은 포함하지 않는다.

검증 결과: build/lint 통과, 경제·정산·최종연출 35개 통과, adapter 검사와 seed 1/42/2026 실제 AI 진행 통과. Chrome 네 조합(두 모드 × 두 화면 크기) 모두 정상 시작·동일 가격(블루시티 camp 160 / shop 누적 240)·서로 다른 최종 해금 문구·선택 보존·오류 없음 확인. 전체 정규 명령의 최종 통합 실행은 통합 담당이 수행한다. 최종시설 연출 fixture는 표준의 2주회 조건으로 갱신했다.
