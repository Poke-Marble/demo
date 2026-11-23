# 건설 규칙 프리셋

| 새 경기 선택 | 개인 완료 주회 해금 (camp/shop/center/final) | 최종시설 조건                      |
| ------------ | -------------------------------------------- | ---------------------------------- |
| 표준 (기본)  | `[0,0,1,2]`                                  | 센터 보유 후 해당 도시에 새로 도착 |
| 짧은 경기    | `[0,0,1,1]`                                  | 센터 보유 후 해당 도시에 새로 도착 |

`src/game/rulesets.ts`의 `RulesPreset`, `normalizeRulesPreset`, `rulesPresets`가 공통 계약이다. 정의와 내부 배열은 동결된다. 라운드 담당은 같은 정의의 `roundLimit` (표준 30 / 짧은 경기 20)을 소비한다. 이 브랜치는 core 라운드 로직을 수정하지 않는다. integration adapter는 `createGame` 옵션에 `rulesPreset`을 전달하며 라운드 브랜치 통합 시 적용된다.

`GameSetup.rulesPreset?`는 `standard | quick`. 생략하면 항상 표준이고 유효하지 않은 값은 기존 세션을 교체하기 전에 거부한다. `start`는 선택한 프로필로 새 context와 session을 만든다. UI가 setup 객체를 나중에 바꾸어도 진행 중 context는 바뀌지 않는다. profile id/version/catalog/configurationKey 검증은 그대로 적용되어 다른 프리셋이나 변경된 설정으로 기존 세션을 정산할 수 없다.

가격·누적 건설·통행료·가호·인수·매각·최종 인수면역은 기존 권위 API를 그대로 사용한다. 실제 24개 도시의 `finalFacility.key`와 이름을 유지한다. 구매창은 시설별 개인 필요/현재 주회 및 센터 이후 재방문을 설명한다. 주회는 전역 turn이나 라운드로 대체하지 않는다.

UI 선택기는 `src/ui/game/rules-preset.ts`에 분리되어 있다. index.ts 변경은 map 설정 화면의 append, 선택값, start 전달뿐이며 starter 카드·header·skill hook·CSS에는 손대지 않는다.
