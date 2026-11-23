# 관동·성도 32칸 후보 맵

## 통합 계약

- `kanto-johto.ts`: `kantoJohtoMap: BoardDefinition`, ID `map:kanto-johto:v1`.
- `types.ts`: 공통 `MapDefinition`/`Tile`을 참조하는 담당 확장타입. 모든 칸에 변·지방·실제 장소 분류·출처 URL을 붙이며 구매 가능 칸에만 경제 초깃값을 둔다.
- `toMapDefinition(board)`: 배열 순서, ID, 이름, 도시 그룹과 도시의 변을 그대로 보존하고 담당 메타데이터를 제거하여 공통 계약으로 변환한다. 게임에서 사용할 때는 `assertValidMap` 후 변환한다. 모듈 import 자체는 검증이나 게임 상태 변경을 수행하지 않는다.
- `validateMap(board)`: 이미 타입이 확인된 정적 데이터의 무결성 검사. 외부 JSON의 스키마 파서가 아니다. 오류 목록과 정적 독점 대상 ID를 반환한다.

공통 계약의 `city`는 구매 가능한 일반 목적지를 의미한다고 가정했다. 실제 도시/마을은 `placeKind: settlement` 20곳, 일반 명소는 `point-of-interest` 7곳이다. 특별명소 4곳만 `kind: landmark`로 구분한다. 석영고원은 `region: shared`다.

현재 `GameAction`에는 명소 구매 액션이 없고 `CityHolding`은 명소 보유 의미가 확정되지 않았다. 후속 규칙 담당에게 `buy-property` 또는 `buy-landmark`와 `PropertyHolding` 도입을 제안한다. 현 계약에서 명소 구매를 지원하는 것으로 가정하여 실행 코드를 추가하지 않았다. 아래 검증은 **데이터상 독점 가능성**이며 실제 플레이의 명소 구매·승리 판정 완성을 뜻하지 않는다.

## 배치와 ID

이동은 아래 인덱스 순서의 순환이다(31 → 0). 지리적 이동 경로나 실제 방위 재현이 아니다. 변은 `south → west → north → east`, 8칸씩이며 경계 칸도 한 변에만 소속된다. 모서리를 양쪽 변으로 중복 계산하지 않는다. ID는 표의 slug 앞에 `tile:kj:`를 붙이며, 그룹 ID는 `group:kj:` + 그룹 slug다. ID 문자열 정렬로 이동 순서를 추론하지 않는다.

| 인덱스 | 변    | slug         | 한국어 이름   | 그룹 slug / 종류            |
| ------ | ----- | ------------ | ------------- | --------------------------- |
| 0      | south | start        | 출발          | 출발                        |
| 1      | south | pallet       | 태초마을      | kanto-origin                |
| 2      | south | viridian     | 상록시티      | kanto-origin                |
| 3      | south | pewter       | 회색시티      | kanto-origin                |
| 4      | south | fuchsia      | 연분홍시티    | kanto-coast                 |
| 5      | south | cinnabar     | 홍련마을      | kanto-coast                 |
| 6      | south | safari-kanto | 관동 사파리존 | kanto-coast / 일반 명소     |
| 7      | south | seafoam      | 쌍둥이섬      | 특별명소                    |
| 8      | west  | cerulean     | 블루시티      | kanto-east                  |
| 9      | west  | vermilion    | 갈색시티      | kanto-east                  |
| 10     | west  | lavender     | 보라타운      | kanto-east                  |
| 11     | west  | celadon      | 무지개시티    | kanto-central               |
| 12     | west  | saffron      | 노랑시티      | kanto-central               |
| 13     | west  | mt-moon      | 달맞이산      | kanto-central / 일반 명소   |
| 14     | west  | rock-tunnel  | 돌산터널      | kanto-central / 일반 명소   |
| 15     | west  | power-plant  | 무인발전소    | 특별명소                    |
| 16     | north | new-bark     | 연두마을      | johto-origin                |
| 17     | north | cherrygrove  | 무궁시티      | johto-origin                |
| 18     | north | violet       | 도라지시티    | johto-origin                |
| 19     | north | azalea       | 고동마을      | johto-west                  |
| 20     | north | goldenrod    | 금빛시티      | johto-west                  |
| 21     | north | olivine      | 담청시티      | johto-west                  |
| 22     | north | cianwood     | 진청시티      | johto-west                  |
| 23     | north | whirl        | 소용돌이섬    | 특별명소                    |
| 24     | east  | ecruteak     | 인주시티      | johto-tradition             |
| 25     | east  | mahogany     | 황토마을      | johto-tradition             |
| 26     | east  | ruins-alph   | 알프의 유적   | johto-tradition / 일반 명소 |
| 27     | east  | blackthorn   | 검은먹시티    | summit                      |
| 28     | east  | lake-rage    | 분노의 호수   | summit / 일반 명소          |
| 29     | east  | mt-silver    | 은빛산        | summit / 일반 명소          |
| 30     | east  | indigo       | 석영고원      | summit / 일반 명소          |
| 31     | east  | bell-tower   | 방울탑        | 특별명소                    |

## 경제 초깃값과 미정 규칙

수치는 전부 **밸런싱 전 후보**다. 임의 단위의 정수이며 실제 포켓몬 게임 가격을 인용하지 않았다. 계산 결과를 데이터로 제공할 뿐 통행료 징수·구매·강화 처리는 구현하지 않는다.

| 그룹 (배열 순서) | 칸 수 | 구매가 | 단계당 강화비 (1/2/3) | 통행료 (레벨 0/1/2/3) |
| ---------------- | ----- | ------ | --------------------- | --------------------- |
| kanto-origin     | 3     | 100    | 50 / 50 / 50          | 10 / 50 / 100 / 200   |
| kanto-coast      | 3     | 130    | 65 / 65 / 65          | 13 / 65 / 130 / 260   |
| kanto-east       | 3     | 160    | 80 / 80 / 80          | 16 / 80 / 160 / 320   |
| kanto-central    | 4     | 190    | 95 / 95 / 95          | 19 / 95 / 190 / 380   |
| johto-origin     | 3     | 220    | 110 / 110 / 110       | 22 / 110 / 220 / 440  |
| johto-west       | 4     | 250    | 125 / 125 / 125       | 25 / 125 / 250 / 500  |
| johto-tradition  | 3     | 280    | 140 / 140 / 140       | 28 / 140 / 280 / 560  |
| summit           | 4     | 310    | 155 / 155 / 155       | 31 / 155 / 310 / 620  |
| 특별명소 각각    | -     | 250    | 없음                  | 50 (레벨 0만)         |

| 항목        | 현재 가정 / 미정 사항                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 칸 구성     | 출발 1 + 일반 목적지 27 + 특별명소 4 = 32. 이벤트·감옥·세금 칸은 후보에 없음                                          |
| 도시 그룹   | 8개, 크기 3/3/3/4/3/4/3/4. 그룹명·배치는 게임용 창작                                                                  |
| 강화        | 일반 목적지 0~3레벨. `upgradeCosts[0]`은 0→1 비용, `tollByLevel[0]`은 미강화 통행료                                   |
| 독점        | 임의의 서로 다른 도시그룹 3개, 또는 어느 한 변의 모든 `city`, 또는 특별명소 4개 전부                                  |
| 일반 명소   | `city`이므로 도시그룹·한 변 독점에 포함. 특별명소는 두 도시 독점 조건에서 제외                                        |
| 독점 보너스 | 통행료 배수·강화 필수 여부·동시 승리 우선순위는 미정. 데이터에 포함하지 않음                                          |
| 경제        | 시작자금·출발 보상·매각·파산·지불 부족·인수 규칙은 경제 담당 결정                                                     |
| 시대        | 관동 사파리존과 무인발전소라는 익숙한 장소명을 함께 쓰는 혼합 시대. HGSS의 팔파크·가동 중 발전소 상태를 재현하지 않음 |
| 인원        | 이 데이터는 로컬 2~4인 공용. 인원별 가격 변경 없음. 플레이어 검증은 담당 범위 밖                                      |

## 한국어 지명 출처

확인일: 2026-11-18. 아래는 이름·지방 사실의 확인 출처이며 가격·그룹·배치의 출처가 아니다. 출발은 게임용 이름이라 URL이 없다. 각 실제 장소는 데이터의 `sourceUrl`에서 개별 한국어 문서로 연결된다.

- [포켓몬코리아 HGSS 소개](https://pokemonkorea.co.kr/game/view/5235?cate2=7&sword=): 공식 본문에서 성도지방·연두마을 확인.
- [관동지방](https://pokemon.fandom.com/ko/wiki/관동지방), [홍련마을](https://pokemon.fandom.com/ko/wiki/홍련마을), [태초마을](https://pokemon.fandom.com/ko/wiki/태초마을): 검색 결과의 지역 목록으로 관동 도시/마을 10곳 표기 확인.
- [성도지방](https://pokemon.fandom.com/ko/wiki/성도지방), [무궁시티](https://pokemon.fandom.com/ko/wiki/무궁시티), [리브레 위키 성도지방](https://librewiki.net/wiki/성도지방): 성도 도시/마을 10곳 표기 교차 확인.
- [쌍둥이섬](https://pokemon.fandom.com/ko/wiki/쌍둥이섬), [무인 발전소 (관동)](<https://pokemon.fandom.com/ko/wiki/무인_발전소_(관동)>), [소용돌이섬](https://pokemon.fandom.com/ko/wiki/소용돌이섬), [방울탑](https://pokemon.fandom.com/ko/wiki/방울탑): 특별명소 이름 확인. [Bulbapedia 발전소 한국어 이름](<https://bulbapedia.bulbagarden.net/wiki/Power_Plant_(Kanto)>)에서 붙여 쓴 `무인발전소`도 확인하여 사용자 후보 표기를 채택.
- [달맞이산](https://pokemon.fandom.com/ko/wiki/달맞이산), [돌산터널](https://pokemon.fandom.com/ko/wiki/돌산터널), [관동 사파리존](https://pokemon.fandom.com/ko/wiki/관동_사파리존): 일반 명소 표기 및 사파리존 시대 차이 확인.
- [알프의 유적](https://pokemon.fandom.com/ko/wiki/알프의_유적), [분노의 호수](https://pokemon.fandom.com/ko/wiki/분노의_호수), [은빛산](https://pokemon.fandom.com/ko/wiki/은빛산), [석영고원](https://pokemon.fandom.com/ko/wiki/석영고원): 일반 명소와 석영고원의 양 지방 공유 확인. `알프의 유적`과 `분노의 호수`는 출처의 띄어쓰기를 보존.

Fandom 직접 본문 열기는 접근 오류(402)가 발생하여 색인된 검색 결과로 이름을 확인했다. 공식 사이트 본문은 직접 열어 확인했다. 전체 지명에 대한 공식 한국어 원본 대조까지 완료했다는 의미는 아니다. 위키 설명·이미지·지도는 복제하지 않았다.
