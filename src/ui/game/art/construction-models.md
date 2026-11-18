# 공통 투영 건축 모형과 건설 상태 계약

2026-11-18, feat/board-art. 최신 사용자 확정 방향을 반영하며 이전 평면 시설/수목 렌더를 대체한다. 앞선 완료 커밋 9a2377e, 790b9bc는 보존했다. index/adapter/demo/contracts/실제맵/경제 규칙은 변경하지 않았다.

## 그래픽 채택 판단

외부 후보 [Kenney Isometric Tiles Buildings](https://kenney.nl/assets/isometric-tiles-buildings)는 검색 결과에 CC0로 표기되어 있었으나 원출처 페이지/파일 접근이 제한됐다(직접 요청 403 및 웹 도구 restricted URL). 패키지 내 파일별 조건·대표 시설 구성·투영 각도를 검증하지 못했으므로 다운로드/채택하지 않았다. 앞선 Foxowl 평면 PNG는 이번 빌드에서 import하지 않는다. 과거 크롭·권리·해시 기록은 `../assets/regional/`에 보존한다. 새 외부 에셋이나 AI 비트맵은 없다.

`buildings.ts`, `regional.ts`, `model-geometry.ts`의 코드 기반 모형을 사용한다. 같은 직교 투영 `x=50+u-v`, `y=85.575+(u+v)*(230/400)-z`로 바닥·벽·지붕·수목·특수 칸을 그린다. 230/400은 실제 보드 지면의 기울기다. 상면은 밝게, 왼쪽 벽은 중간, 오른쪽 벽은 어둡게 하고 윤곽선 굵기·팔레트·수직 높이 단위를 공유한다. 회전시킨 평면 스프라이트/서로 다른 원근 이미지는 사용하지 않는다.

조정 가능한 시각 가정: SVG 100×120 units, 바닥 42×36 local units, 전면 접점 y=108, 최대 화면 모형폭 64 scene units, 실제 타일 폭의 75% 이하. 모든 건물은 같은 크기의 부지 안에서 높이/주동/부속동만 달라진다. 소유색 깃발과 접지 그림자도 같은 투영을 쓴다. 최소 보드폭 640과 작은 화면 가로 스크롤은 유지한다. 이는 실제 원작 건축 도면이나 실제 층수의 축척 복원이 아니라 보드게임용 축소 모형이다.

## 최소 입력과 연결 예시

`construction.ts`의 타입:

```ts
type ConstructionStage = 'unowned' | 'camp' | 'shop' | 'center' | 'final';
interface ConstructionVisual {
  stage: ConstructionStage;
  ownerColor?: OwnerColor; // 제공된 네 소유색 중 하나
}
interface BuildingMetadata {
  finalFacility?: FinalFacility;
  visualScene?: RegionalScene; // 특수 칸 ID가 다를 때 장면 연결
}
```

독립 모형 API는 `createConstructionArt(tile, construction)`이다. DOM SVG를 반환하며 게임 상태나 입력 객체를 변경하지 않는다. `stage='unowned'`는 빈 SVG, `camp`는 소유 깃발과 접지 표시만 반환한다. `shop`은 숍, `center`는 센터 주동+숍 지원동, `final`은 도시 대표 주동+숍/센터 지원동과 깃발을 표시한다. 단계 상승에 따라 기존 시설 역할을 누적하지만 주동/지원동의 배치는 축소 모형으로 재구성한다. 실제 월드에서 동일 건물의 증축 공사를 그대로 재현하는 것은 아니다. 캠프 텐트나 무소유 건물은 표시하지 않는다.

보드 API에는 선택적 입력만 추가했다:

```ts
createProjectedBoard({
  ...existingOptions,
  construction: new Map([
    ['tile:kj:pallet', { stage: 'camp', ownerColor: '#e29860' }],
    ['tile:kj:saffron', { stage: 'final', ownerColor: '#69a6c8' }],
  ]),
  previousConstruction, // 이전 시각 상태. 단계 상승만 320ms 등장 연출
  visualMetadata: new Map([
    ['tile:kj:saffron', { finalFacility: 'silph' }],
    ['tile:new-trial-id', { visualScene: 'bell' }],
  ]),
});
```

`construction`이 해당 tile ID에 있으면 authoritative 시각 입력으로 우선한다. 기존 호출자가 아무것도 전달하지 않으면 `view.state.holdings`의 유무와 `facilityLevel`만 읽는 호환 매핑을 적용한다: 미소유→unowned, 소유한 0/1/2/3→camp/shop/center/final. 음수·비정상 수치는 캠프, 3 초과는 최종으로 시각적으로 제한한다. 이 숫자 대응은 **조정 가능한 연결 가정**이며 poke-economy의 비용/승급 규칙을 정의하거나 구현하지 않는다. 실제 규칙이 다른 필드를 쓰면 통합자가 명시적 construction Map을 전달하면 된다. 콜백 dispatch/잔액/매입비/통행료/AI 판단은 추가하지 않았다.

`previousConstruction` 미제공/동일 단계/철거에는 등장 연출이 없다. 상승 시 즉시 최종 확정 상태를 렌더하고 320ms opacity/수직 이동만 재생한다. 입력 잠금·경제 재계산 없음. reduced-motion이면 생략한다. 프리뷰의 ‘등장 연출 끝내기’는 장식 애니메이션만 끝낸다. 게임에서 연출하려면 통합자가 이전/현재 시각 상태를 전달해야 한다.

일반 도시(kind=city)는 위 construction을 따른다. START 및 별도 명소/시험/비행 장면은 별도 scenery 렌더다. `FinalFacility`에는 bell/whirl/trial 값이 없다. 시험 칸을 일반 도시로 가장하지 말고 실제 종류와 ID 또는 visualScene으로 전달해야 한다. 이 브랜치는 특수 칸 배치/법적 목적지/소유 규칙을 바꾸지 않는다. 실제 시험 kind 확장과 metadata는 poke-trials 측 연결 대상이다.

## 도시 정체성과 원작 표기 확인

명칭·도시 대응은 아래 게임 정보를 정리한 문헌에서 확인했다(2026-11-18). 게임 ROM/모든 한국어판 버전을 직접 실행해 대조한 것은 아니다. 이미지·문헌 텍스트는 복사하지 않았으며, 모형 형태는 새 코드의 시각 가정이다.

| 도시 slug | 최종 모형        | 확인 자료 및 구분                                                                                                                                                                                                           |
| --------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pallet    | lab              | [오박사 연구소](https://bulbapedia.bulbagarden.net/wiki/Professor_Oak%27s_Laboratory), [한국어 오박사의 연구소](https://pokemon.fandom.com/ko/wiki/오박사의_연구소). 태초마을의 Professor Oak’s Laboratory / オーキド研究所 |
| new-bark  | lab              | [New Bark Town](https://bulbapedia.bulbagarden.net/wiki/New_Bark_Town), [한국어 포켓몬 박사 목록](https://pokemon.fandom.com/ko/wiki/포켓몬_박사). 연두마을 공박사(Professor Elm)의 연구소                                  |
| celadon   | department-store | [Celadon Department Store](https://bulbapedia.bulbagarden.net/wiki/Celadon_Department_Store), [무지개 백화점](https://pokemon.fandom.com/ko/wiki/무지개_백화점)                                                             |
| saffron   | silph            | [Silph Co.](https://bulbapedia.bulbagarden.net/wiki/Silph_Co.), [실프주식회사](https://pokemon.fandom.com/ko/wiki/실프주식회사). 노랑시티의 본사 / シルフカンパニー                                                         |
| goldenrod | radio-tower      | [Goldenrod Radio Tower](https://bulbapedia.bulbagarden.net/wiki/Goldenrod_Radio_Tower), [금빛시티 라디오타워](https://pokemon.fandom.com/ko/wiki/금빛시티_라디오타워). コガネラジオとう                                     |
| olivine   | lighthouse       | [Olivine Lighthouse](https://bulbapedia.bulbagarden.net/wiki/Olivine_Lighthouse). 게임 간판의 Glitter Lighthouse / かがやきのとうだい, 한국어 빛남의 등대. 모형 UI에서는 ‘담청 · 등대’로 축약                               |

나머지는 조정 가능한 대표시설 선택이다. 회색→박물관, 갈색/무궁→항구, 인주/보라→문화회관, 황토→지역 회관(lodge), 연분홍/사파리/산·호수 POI→관리소, 석영→리그, 상록/블루/도라지/고동/진청/검은먹→체육관, 홍련→연구소로 정했다. 이 전체 목록을 원작의 확정 최종 건축/게임 규칙이라고 주장하지 않는다. 특히 인주 문화회관은 **시험 방울탑과 구별하기 위한 가정**, 호수/유적의 관리소·박물관도 보드용 가정이다. 데이터 소유자가 finalFacility를 넘기면 이 기본 매핑보다 우선한다. 숫자 ID만 있는 기존 UI fixture는 명시적 메타데이터가 없으면 lodge로 안전하게 대체하며 배열 index로 실제 지리를 추정하지 않는다.

## 프리뷰와 검증

`node src/ui/game/art/preview.mjs` → `/board-art-preview.html`. 무소유부터 다섯 버튼으로 모든 도시 상태를 전환한다. `?stage=final`, `?stage=final&corners=1&overlap=1`로 대표시설/모서리/말 중첩을 직접 열 수 있다. corners는 독립 프리뷰의 ID·종류만 바꾼 가상 배치이며 실제 맵을 수정하지 않는다. 아래 갤러리는 단계와 주요 도시 대표시설을 보여준다.

별도 번들: `node src/ui/game/art/preview.mjs --build`; 기존 `game-preview.html`도 읽기 전용 입력으로 함께 번들한다. `--serve-built`는 5195에서 제공한다. 하위 경로도 상대 hashed asset URL로 검증한다. 브라우저 테스트 재현 명령은 `browser-check.mjs`의 로컬 Playwright 설치 방식과 기존 `playtest-followup.md` 서버 명령을 따른다. 서버 5194(dev), 5195(bundle), 5196/board-art(subpath)를 사용한다.

검증 대상은 개발/번들/하위 경로 각각 1200px·390px의 다섯 상태, 무소유 빈 SVG/캠프 깃발만/지원동 누적, 320ms 등장·연출 끝내기·reduced-motion, 32칸 포인터 클릭과 Tab/Enter, 네 말 겹침·깊이, PNG 없는 모형 표시, 실제 기존 게임 데모의 시작 흐름 및 holdings 렌더다. Node 테스트는 소유/단계 매핑, 대표시설 구분, footprint의 타일 내부 포함, 보드와 같은 투영 기울기, 메타데이터 우선순위와 연출 조건을 검사한다.

검증 결과: typecheck/lint/build/독립 프리뷰 번들 및 Node 테스트 24개 통과(맵 내부 검증 9개 포함). 세 실행 경로×두 화면 크기의 단계 전환, 타일 클릭 총 192회, 키보드·reduced-motion 검증 통과. 기존 실제 데모도 세 경로×두 크기에서 타이틀→파트너→맵→게임 시작과 실제 holdings의 무소유/숍/센터/최종 렌더, 타일 정보 대화상자 클릭을 확인했다. 두 PNG 지면+네 CSS 포켓몬 배경 6종 디코딩 성공, 시설/수목 PNG 요청은 없다.

캡처/기계 판독 결과는 git 제외 `artifacts/construction-qa/`: `{dev,production,subpath}-{1200,390}-{unowned,camp,shop,center,final,overlap}.png`, `existing-demo-{dev,production,subpath}-{1200,390}.png`, `before-flat-{1200,390}.png`, `report.json`. 이전 캡처는 비교용이며 현재 코드 렌더와 혼동하지 않는다.

검증 한계: 격리 headless Chrome 기준이다. 이벤트·경제·새 실제맵 브랜치와 병합한 연속 플레이/건설 가능 조건은 미검증이며 이 작업 범위 밖이다. 기존 게임 데모의 32칸은 숫자 ID의 UI fixture라 실제 도시 대표시설 메타데이터 연결은 별도다. 원격 푸시·배포·main 병합은 하지 않는다.
