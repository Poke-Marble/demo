# 전설 시험·공중날기 규칙과 32칸 실제 맵

## 실제 동작과 조정 가능한 가정

`createGame(map, roster, { legendary: {} })`로 명시적으로 활성화한다. 설정 생략 시 `legendary` 상태도 생성하지 않으며 기존 주사위 RNG·이동·출발 보상·차례 순환 계약을 유지한다. 기존 `GameAction` 대신 코어 dispatch가 `GameAction | LegendaryAction`을 받는다. 인원과 순서는 기존 2~4명 계약 그대로다. UI의 사람 1명 + COMPUTER 3명 배정과 제어권은 변경하지 않는다.

| 항목        | 현재 구현 및 조정 가능한 기획 가정                                                         |
| ----------- | ------------------------------------------------------------------------------------------ |
| 시험 과제   | 일반 배틀 없이 전설의 인정을 받는 단일 확률 판정. 과제별 입력이나 능력치 대결은 아직 없음  |
| 성공률      | `successChance: 0.5`, 두 전설에 공통 적용                                                  |
| 보장 성공   | `guaranteedAttempt: 3`, 해당 체류의 세 번째 도전은 확률과 관계없이 성공                    |
| 초기 로프   | `initialRopes: 1`, 플레이어마다 1개. 구매·획득 경제는 미구현                               |
| 루기아 가호 | 다음 양수 통행료 1회 `tollDiscount: 0.5` 할인                                              |
| 칠색조 가호 | 다음 양수 강화비 1회 `upgradeDiscount: 0.5` 할인                                           |
| 정수 처리   | 할인액을 내림. 예: 101의 50% 할인 후 지불액 51                                             |
| 가호 중복   | 두 종류는 독립 보유, 같은 종류는 누적하지 않고 1회권 유지                                  |
| 비행 범위   | 공중날기 칸 착지 후 출발·도시·특별명소·시험 칸 중 선택. 현재 칸 및 모든 공중날기 칸은 제외 |

확률/할인율은 유한한 0~1, 보장 횟수는 양의 안전한 정수, 로프 수는 음이 아닌 안전한 정수로 검증한다. 상태는 JSON 직렬화 가능하며 시드 리플레이를 지원한다. 매 도전마다 보장 성공을 포함하여 RNG를 정확히 1회 소비한다. 로프·비행·거부 입력은 RNG를 소비하지 않는다.

## 시험 체류와 차례

1. 일반 이동이나 비행으로 시험 칸에 착지하면 해당 플레이어에 `trial`을 생성하고 `trial-intro` 연출 요청을 반환한다. `attempts: 0`에서 시작하며 시험 칸은 구매·강화·독점 대상이 아니다.
2. 착지한 현재 차례에 `attempt-trial` 또는 `use-escape-rope`를 선택한다. 선택 전 주사위·비행·차례 종료는 거부한다.
3. 실패하면 위치를 유지하고 해당 차례에 재도전할 수 없다. `end-turn` 후 다른 세 플레이어가 정상 진행하고, 자기 다음 차례에는 이동 대신 재도전한다. 재도전은 체류 횟수를 누적한다.
4. 성공하면 체류를 종료하고 해당 가호를 부여한다. 현재 차례는 종료만 가능하고, 자기 다음 차례부터 정상 주사위 이동한다.
5. 로프는 시험 중 자기 차례에만 사용한다. 실패 직후에도 사용 가능하다. 재고 1개를 소비하고 시험을 보상 없이 종료하며 **현재 차례에 주사위를 굴릴 수 있다**. 기존에 보유하던 가호를 제거하지 않는다. 체류가 종료되므로 중복 로프 입력은 거부한다. 이후 재입장은 새 체류다.

잘못된 차례·종료된 게임·다른 맵·중복 도전·없는 로프는 원본 상태와 RNG를 그대로 반환한다. 저장된 체류 위치/전설/시도 횟수, 플레이어별 상태, 비행 대기 차례의 일관성도 검사한다. 외부 JSON 전체를 파싱하는 범용 스키마 검증기는 아니다.

## 공중날기와 착지 연결

공중날기 칸에 일반 이동으로 착지하면 `legendary.pendingFly`가 생성된다. `legalFlyDestinations(state, map)`이 합법 목적지 ID를 반환한다. 해당 차례의 소유자만 `{ type: 'fly', playerId, to }`를 보낼 수 있다. 목적지 선택 전 차례 종료/재굴림은 거부한다.

비행은 `player-moved`, `tile-landed`를 한 번씩 발생시키고 비행 대기를 소비한다. 출발을 지나거나 출발에 착지해도 코어의 출발 보상을 발생시키지 않는다. 별도 주사위도 굴리지 않는다. 모든 공중날기 칸을 목적지에서 제외하고 대기를 소모하므로 같은 행동에서 재귀 비행이나 중복 비행이 불가능하다. 시험 체류 중 비행은 거부한다.

일반 목적지·특별명소·출발의 착지는 기존 `onLand`를 정확히 한 번 적용한다. 해당 훅의 플레이어 잔액/파산/소유권/승리를 기존 방식으로 반영한다. 훅 결과가 유효하지 않으면 비행 전체를 원복한다. 특수 칸은 경제 훅 `onLand`를 호출하지 않고 전용 진입 규칙으로 처리한다. `tile-landed` 이벤트 자체는 특수 칸에도 존재한다. 출발 보상은 `start-rewarded`만을 근거로 연결해야 하며 외부 훅에서 출발 착지 보상을 재지급하지 않아야 한다.

## 맵 재구성

현재 실제 맵 ID는 `map:kanto-johto:v3`다. v2는 전설 시험 도입 배치, v3는 여행 동선 및 대표시설 후속 기획 배치다. 이동 순서와 도시그룹 구성이 달라져 이전 저장 상태를 같은 맵으로 오인하지 않게 버전을 올렸다. v1/v2 저장 마이그레이션은 제공하지 않는다. 기존 `docs/kanto-johto-map.md`는 v1 설계 기록이며 현재 배치는 이 문서와 데이터를 기준으로 한다. 규칙 완료 커밋 `46210ff`와 `src/game/**`의 시험·가호·로프·비행 코드는 이번 후속 작업에서 변경하지 않는다.

32칸에서 모서리 4개 + 구매 특별명소 4개를 유지하면 일반 목적지는 24개여야 한다. 기존 27개 중 4개짜리 그룹에서 각각 돌산터널·진청시티·분노의 호수를 제외해 모든 그룹을 3개로 맞췄다. 그룹 ID 8개와 유지되는 장소의 tile ID, 특별명소 4곳은 유지했다. 도시/마을은 20→19곳, 일반 명소는 7→5곳이며 양 지방 대표 목적지를 분산해 보존하는 게임용 배치다. 지리적 경로 재현이 아니다.

| 인덱스 | 칸 / 그룹                | 구성                              |
| ------ | ------------------------ | --------------------------------- |
| 0      | 출발                     | `tile:kj:start`                   |
| 1~3    | 관동 시작                | 태초마을·상록시티·회색시티        |
| 4~6    | 관동 달맞이산·항구 여행  | 달맞이산·블루시티·갈색시티        |
| 7      | 구매 특별명소            | 무인발전소                        |
| 8      | 루기아 시험              | `tile:kj:lugia-trial`, 소용돌이섬 |
| 9~11   | 관동 대도시 사건         | 보라타운·무지개시티·노랑시티      |
| 12~14  | 관동 사파리·남부 해안    | 연분홍시티·관동 사파리존·홍련마을 |
| 15     | 구매 특별명소            | 쌍둥이섬                          |
| 16     | 칠색조 시험              | `tile:kj:ho-oh-trial`, 방울탑     |
| 17~19  | 성도 시작                | 연두마을·무궁시티·도라지시티      |
| 20~22  | 성도 유적·로켓단 단서    | 알프의 유적·고동마을·금빛시티     |
| 23     | 구매 특별명소            | 소용돌이섬 (`tile:kj:whirl`)      |
| 24     | 공중날기                 | `tile:kj:fly`                     |
| 25~27  | 성도 전설·등대·황토 사건 | 인주시티·담청시티·황토마을        |
| 28~30  | 성도·관동 정상           | 검은먹시티·석영고원·은빛산        |
| 31     | 구매 특별명소            | 방울탑 (`tile:kj:bell-tower`)     |

소용돌이섬/방울탑 구매 특별명소는 기존 ID와 경제 초깃값을 보존한 별도 칸이다. 같은 장소를 배경으로 하는 시험 칸은 다른 ID 및 이름의 `kind: 'special'`이며 경제 데이터가 없다. 전설 시험과 특별명소 독점 조건을 혼동하지 않는다. UI 아트는 index 대신 위 ID 또는 `special` 메타데이터를 우선 사용한다.

남/서/북/동 각 8칸에 일반 목적지 6개와 특별명소 1개, 모서리 1개를 배치했다. 도시그룹 독점은 3개 그룹의 9곳, 한 변 독점은 일반 목적지 6곳, 특별명소 독점은 기존 4곳이다. 검증기는 정확한 모서리 종류·그룹별 3개·특수 칸 구매 불가·전체 개수와 기존 데이터 무결성을 검사한다. 8개 중 3개 그룹을 고르는 56개 독립 조합을 전부 테스트한다. 정적 독점 대상 검증이며 경제와 승리 판정 전체 구현은 아니다.

공통 Tile에는 `kind: 'special', special: 'lugia-trial' | 'ho-oh-trial' | 'fly'` 분기만 추가했다. 기존 분기와 필수 속성은 변경하지 않았다. `toMapDefinition`은 구매가 등 로컬 메타데이터를 제거하면서 특수 칸의 규칙 식별자는 보존한다.

## v3 여행 동선의 원작 근거와 각색

가격 순서로 그룹을 만들지 않는다. 다음 연결을 우선한 **순환 보드의 이야기 각색**이며 원작 지도의 방위·거리·필수 진행 순서나 한 작품의 시대를 그대로 재현하지 않는다. 모서리 시험은 보드 규칙상 고정이므로 원작에서 전설을 만나는 시점과도 다르다.

- 남쪽: 태초→상록→회색은 시작마을·인접도시·초기 체육관 도시 연결이다. 회색→달맞이산→블루→갈색은 산길·물의 도시·항구 여행을 압축했다. 상록체육관은 초반 방문 당시 잠겨 있는 원작과 달리 최종 건축 후보로만 쓰며 초반 체육관 도전으로 해석하지 않는다. 무인발전소는 블루 동쪽 수계의 특별명소를 남쪽 여행 장 끝에 배치한 우회 목적지다. [관동 공략의 장소 순서](https://bulbapedia.bulbagarden.net/wiki/Walkthrough%3APok%C3%A9mon_Red_and_Blue), [원작 도로 연결](https://bulbapedia.bulbagarden.net/wiki/List_of_routes)을 참고했다.
- 서쪽: 보라·무지개·노랑은 포켓몬타워, 로켓단 아지트/실프스코프, 실프 본사 사건이라는 도시 이야기 연결이다. 이후 연분홍→사파리→홍련→쌍둥이섬으로 남부 탐험·바다를 묶었다. 원작의 보라 재방문·수로 왕복·사파리에서 얻는 이동 기술은 반복하지 않는다. [실프 본사와 노랑시티](https://bulbapedia.bulbagarden.net/wiki/Silph_Co.), [관동 공략](https://bulbapedia.bulbagarden.net/wiki/Walkthrough%3APok%C3%A9mon_Red_and_Blue).
- 북쪽: 연두→무궁→도라지 뒤에 알프 유적→고동→금빛을 연결한다. 초반 수련·유적 탐색·야돈우물 사건·대도시 방송 시설을 한 변에 담는다. 금빛 라디오타워의 점거 및 전설 단서는 초반 방문 뒤 일어나는 후반 사건도 함께 요약한다. 소용돌이섬 명소를 장 끝에 둔 것은 전설 이야기로 넘어가는 편집이며 금빛 바로 옆 섬이라는 뜻이 아니다. [HGSS 공략의 Part 1~11](https://bulbapedia.bulbagarden.net/wiki/Walkthrough%3APok%C3%A9mon_HeartGold_and_SoulSilver), [라디오타워의 버전별 전설 단서](https://bulbapedia.bulbagarden.net/wiki/Goldenrod_Radio_Tower).
- 동쪽: 인주 무도장→담청 등대 항해→황토 사건은 인주를 기준으로 서해안에 갔다가 동쪽으로 돌아가는 분기 여행이다. 진청·분노의 호수 등 제외된 목적지와 재방문은 생략한다. 검은먹→석영고원→은빛산은 체육관 여행·리그·후반 탐험을 잇고 방울탑 별도명소로 순환을 닫는다. 은빛산을 리그보다 앞에 놓았던 v2 순서를 고쳤지만 원작의 관동 체육관 전체 방문 조건까지 재현하지 않는다. [성도 공략](https://bulbapedia.bulbagarden.net/wiki/Walkthrough%3APok%C3%A9mon_HeartGold_and_SoulSilver), [인주의 무도장](https://bulbapedia.bulbagarden.net/wiki/Ecruteak_City), [담청 등대](https://bulbapedia.bulbagarden.net/wiki/Olivine_Lighthouse).

8개 그룹 ID는 보존하되 구성과 표시명은 변경했다. 기존 `johto-west` ID는 호환 식별자로 남겼고 새 이름은 ‘성도 유적·로켓단 단서’이므로 현재 그룹의 지리적 서부라는 주장이 아니다. 각 변에는 완전한 그룹 2개, 구매 일반 목적지 6개가 있다. 3그룹 독점 56개 조합은 모두 9곳으로 성립하고 라인독점은 어느 변에서도 6곳으로 성립한다.

## 도시별 대표 최종시설 메타데이터

건설 표시 단계는 **캠프(깃발=확보) → 숍 → 센터 → 도시별 대표 최종시설**이다. `types.ts`의 `constructionStages`는 표시용 제안으로 기존 `facilityLevel` 0/1/2/3에 각각 대응한다. 레벨 0이라도 보유 기록이 있어야 확보 깃발을 표시한다. 미소유 타일의 기본값 0만으로 확보 표시를 하면 안 된다. 숍/센터를 원작에 없는 장소에도 건설하는 것은 보드 기획상의 공통 단계다. 최종시설로 교체하는지 누적하는지, 건설 권한·비용·수익은 economy-rules 담당이 확정할 별도 규칙이다.

`BoardTile.finalFacility?`는 선택 속성이며 `{ key, nameKo, basis, sourceUrl, noteKo }`를 제공한다. `basis: canonical`은 시설/장소의 존재 근거를 뜻하고, 플레이어가 실제로 그 건물을 짓거나 소유한다는 원작 사실을 뜻하지 않는다. `board-adaptation`은 원작의 장소·이야기를 바탕으로 만든 건물/명칭임을 명시한다. 모든 건축 형태·층수·시각 디자인은 아트 담당의 보드용 해석이다. 한국어 표시는 이해를 돕는 설명명도 포함하며 모든 명칭을 공식 현지화 원문과 대조한 것은 아니다.

| 인덱스 | 일반 목적지   | 최종시설 key / 표시명                         | 근거                                                                                                  |
| ------ | ------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1      | 태초마을      | `oak-lab` / 오박사 연구소                     | [원작 연구소](https://bulbapedia.bulbagarden.net/wiki/Professor_Oak%27s_Laboratory)                   |
| 2      | 상록시티      | `viridian-gym` / 상록체육관                   | [원작 체육관](https://bulbapedia.bulbagarden.net/wiki/Viridian_Gym)                                   |
| 3      | 회색시티      | `pewter-museum` / 회색 과학박물관             | [원작 박물관](https://bulbapedia.bulbagarden.net/wiki/Pewter_Museum_of_Science)                       |
| 4      | 달맞이산      | `moon-fossil-station` / 달맞이산 화석조사소   | **각색**: [화석 발견 장소](https://bulbapedia.bulbagarden.net/wiki/Mt._Moon)를 조사 건물로 표현       |
| 5      | 블루시티      | `cerulean-gym` / 블루체육관                   | [원작 체육관](https://bulbapedia.bulbagarden.net/wiki/Cerulean_Gym)                                   |
| 6      | 갈색시티      | `vermilion-port-terminal` / 갈색항 여객터미널 | **각색**: [상트앙느호 항구](https://bulbapedia.bulbagarden.net/wiki/Vermilion_City)의 건축모형        |
| 9      | 보라타운      | `pokemon-tower` / 포켓몬타워                  | [관동 초기 시대 타워](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Tower)                     |
| 10     | 무지개시티    | `celadon-department-store` / 무지개 백화점    | [원작 백화점](https://bulbapedia.bulbagarden.net/wiki/Celadon_Department_Store)                       |
| 11     | 노랑시티      | `silph-head-office` / 실프주식회사 본사       | [원작 본사](https://bulbapedia.bulbagarden.net/wiki/Silph_Co.)                                        |
| 12     | 연분홍시티    | `warden-house` / 사파리 원장 집               | [원작 원장 거주지](https://bulbapedia.bulbagarden.net/wiki/Fuchsia_City)                              |
| 13     | 관동 사파리존 | `safari-visitor-lodge` / 사파리 방문자 안내소 | **각색**: [사파리 탐험](https://bulbapedia.bulbagarden.net/wiki/Kanto_Safari_Zone)의 안내 건물        |
| 14     | 홍련마을      | `cinnabar-pokemon-lab` / 홍련 포켓몬연구소    | [원작 화석 복원 연구소](https://bulbapedia.bulbagarden.net/wiki/Cinnabar_Lab)                         |
| 17     | 연두마을      | `elm-lab` / 공박사 연구소                     | [원작 연구소](https://bulbapedia.bulbagarden.net/wiki/Professor_Elm%27s_Laboratory)                   |
| 18     | 무궁시티      | `guide-gent-house` / 무궁 안내할아버지 집     | [원작 안내 NPC와 집](https://bulbapedia.bulbagarden.net/wiki/Cherrygrove_City)                        |
| 19     | 도라지시티    | `sprout-tower` / 모다피의 탑                  | [원작 수련 장소](https://bulbapedia.bulbagarden.net/wiki/Sprout_Tower)                                |
| 20     | 알프의 유적   | `alph-research-center` / 알프 유적 연구소     | [원작 유적 연구시설](https://bulbapedia.bulbagarden.net/wiki/Ruins_of_Alph)                           |
| 21     | 고동마을      | `kurt-house` / 강집의 집                      | [원작 볼 장인의 집](https://bulbapedia.bulbagarden.net/wiki/Kurt)                                     |
| 22     | 금빛시티      | `goldenrod-radio-tower` / 금빛 라디오타워     | [원작 방송 시설](https://bulbapedia.bulbagarden.net/wiki/Goldenrod_Radio_Tower)                       |
| 25     | 인주시티      | `ecruteak-dance-theater` / 인주 무도장        | [원작 무도장](https://bulbapedia.bulbagarden.net/wiki/Ecruteak_City)                                  |
| 26     | 담청시티      | `olivine-lighthouse` / 담청 등대              | [원작 등대](https://bulbapedia.bulbagarden.net/wiki/Olivine_Lighthouse)                               |
| 27     | 황토마을      | `mahogany-souvenir-shop` / 황토 기념품점      | [원작 아지트 입구 상점](https://bulbapedia.bulbagarden.net/wiki/Mahogany_Town)                        |
| 28     | 검은먹시티    | `dragon-shrine` / 용의굴 사당                 | [크리스탈/HGSS 사당](https://bulbapedia.bulbagarden.net/wiki/Dragon%27s_Den), 도시 인근 권역으로 묶음 |
| 29     | 석영고원      | `league-reception-hall` / 포켓몬리그 접견관   | **각색**: [리그 시설](https://bulbapedia.bulbagarden.net/wiki/Indigo_Plateau)을 단일 건물로 요약      |
| 30     | 은빛산        | `silver-expedition-lodge` / 은빛산 탐사산장   | **각색**: [후반 탐험](https://bulbapedia.bulbagarden.net/wiki/Mt._Silver)을 대표하는 창작 산장        |

조사일 2026-11-18. 위 링크와 데이터의 `sourceUrl`은 원작 사실을 정리한 팬 위키의 참고 근거이며 공식 원본 게임 전체의 직접 검증을 뜻하지 않는다. 핵심 후보 6곳·인주 무도장·알프 연구시설은 본문 또는 검색 색인에서 확인했고 나머지는 개별 장소 및 공략 자료를 참고했다. 위키 설명·이미지·원작 건축 도면은 복제하지 않았다. 관동은 초기 세대의 포켓몬타워·사파리·분화 전 홍련, 성도는 GSC/HGSS의 요소를 함께 쓰는 혼합 시대다.

대표시설은 일반 목적지 24개에만 제공한다. 출발·시험·공중날기·별도 구매명소에는 붙이지 않는다. 체육관은 상록/블루 두 곳만 선택했다. 인주에 방울탑을, 담청에 소용돌이섬을 최종시설로 중복 사용하지 않는다. 검증기는 잘못된 종류·빈 식별자/이름/근거·중복 key·출처 누락·시험 장소 재사용을 거부하지만, 속성 자체가 없는 기존 맵은 허용한다.

### 아트 및 경제 담당 연결

아트는 `kantoJohtoMap.tiles`를 tile ID로 조회하고 `finalFacility.key`를 2.5D 건축모형 선택에, `nameKo`를 표시에 사용할 수 있다. 시설 메타데이터는 `BoardTile`의 선택 확장이며 `toMapDefinition`은 기존처럼 이를 제거한다. 따라서 코어 상태나 공통 UI 계약에 새 필수 필드를 요구하지 않는다. 아트 어댑터가 원본 맵의 ID→메타데이터 조회표를 별도로 유지해야 한다. key 미지원/속성 없음은 아트의 일반 시설 대체모형으로 처리할 수 있다.

경제 초깃값은 **장소별 v2 값 그대로** 보존했다. 이전 `100 + 그룹 순번×30` 계산을 배치와 분리했으므로 새 그룹 안에서 가격이 다르고, 남쪽의 달맞이산 190→블루/갈색 160처럼 내려가기도 한다. 이는 여행 배치가 가격순에 종속되지 않았다는 뜻이다. 기존 `upgradeCosts` 3개는 0→1/1→2/2→3 비용 후보이며 새 최종시설을 위한 네 번째 비용을 추가하지 않았다. 캠프 확보 비용·시설별 실제 비용·통행료·최종시설 효과는 확정하지 않는다. economy-rules 담당이 후속 문서/규칙으로 확정할 때 이 초깃값을 조정하면 된다.

## 통합 방법과 연출 계약

```ts
import { kantoJohtoMap } from '../data/maps/kanto-johto';
import { assertValidMap } from '../data/maps/validate';
import { toMapDefinition } from '../data/maps/types';
import { createGame, dispatch } from '../game/core';
import { legalFlyDestinations, quoteBlessing } from '../game/legendary';

assertValidMap(kantoJohtoMap);
const map = toMapDefinition(kantoJohtoMap);
// 기존 사람 1명 + COMPUTER 3명 roster 및 controller 정보는 어댑터가 유지한다.
let state = createGame(map, roster, { seed: 1, legendary: {} });
const result = dispatch(state, map, action, hooks);
if (result.ok) {
  state = result.state; // 상태를 먼저 한 번 확정한다.
  // result.events는 로그/효과에, result.presentations ?? []는 연출 큐에 전달한다.
}
```

성공 결과의 선택 속성 `presentations`는 엔진과 분리된 요청 배열이다.

- `{ type: 'trial-intro', legendary: 'lugia' | 'ho-oh', playerId, tileId }`
- `{ type: 'fly', playerId, from, to }`

비행으로 시험 칸에 도착하면 배열 순서가 `[fly, trial-intro]`다. 연출의 스킵/취소/종료 콜백에서 동일 규칙 액션을 다시 dispatch하지 않는다. 어댑터가 수락한 transition마다 별도의 전달 ID를 만들어 중복 재생을 막으면 된다. 이 데이터에는 DOM, 타이머, 애니메이션 상태가 없다.

어댑터는 기존 `GameAction` 입력 경로를 `GameAction | LegendaryAction`으로 확장하고 `Transition`/`CoreEvent`를 받아야 한다. `GameState`로 축소해 저장하면 선택 상태를 잃으므로 `CoreState` 전체를 유지한다. 시험 입력 버튼은 trial 유무와 `lastAttemptTurn`으로, 비행 선택지는 `legalFlyDestinations`로 구성한다. COMPUTER도 자기 차례에 같은 액션을 제출한다. 예: 체류 중에는 도전, 비행 대기에는 합법 목적지 선택, 그 외에는 기존 주사위/종료 흐름. AI 전략은 이 브랜치가 구현하지 않는다.

가호 경제 연결은 `quoteBlessing(state, playerId, 'toll' | 'upgrade', grossAmount)` 순수 함수로 제공한다. `{ amount, consumed, state }`를 반환하며 잔액이나 소유권을 바꾸지 않는다. 지급 대상자의 루기아 가호가 아니라 **통행료를 내는 플레이어**의 가호를 견적에 사용한다. 0원 거래는 소비하지 않는다. 견적만 보고 취소할 때는 반환 상태를 버리고, 경제 거래가 실제로 성공할 때만 할인액으로 정산한 상태와 반환된 가호 상태를 원자적으로 함께 확정한다. 기존 HookEffect에는 가호 패치가 없으므로 `onLand` 안에서 이 함수의 반환 상태를 버리고 금액만 적용하면 안 된다. 후속 경제 어댑터가 dispatch 결과를 포함한 단일 트랜잭션으로 조합해야 한다.
