# 보드 아트 — feat/board-art

`docs/parallel-workloads.md` 전체를 읽고 작업. 현재/상위 경로 및 저장소 내 AGENTS.md 없음. computer-use 스킬과 관련 안내 확인. 다른 워크트리/에이전트 접근·제어, main 병합, 원격 푸시, 배포 없음.

## 구현 및 가정

일반 SVG 집 반복을 Foxowl Gen 3 시트의 센터·체육관·항구·주택·수목 5종 실제 픽셀 크롭으로 교체했다. 실제 맵/규칙/adapter/index/demo/game.css는 수정하지 않았다. 사람 1명 + COMPUTER 3명 생성/턴 흐름도 그대로다. 기존 보드 투영, tile ID, 버튼 클릭 콜백, 말 접지점, depthOrder를 유지한다. 시설은 지면과 별개로 수직 배치하고 그림자와 pixelated 보간을 적용한다. 장식 SVG도 원래 타일 버튼으로 클릭을 전달한다.

조정 가능한 시각 가정: 팔레트는 Gen 3, 갈색/담청/진청/무궁은 항구, 상록/고동/사파리는 숲, 회색/블루/노랑/검은먹은 체육관, 홍련/금빛/무지개/석영은 센터, 인주/도라지/보라/알프는 전통 건축, 나머지는 주택/바위/수면으로 구분한다. 실제 각 도시 건축의 정확한 복원은 아니다. 시설 폭은 기존 최대 70 scene units, 업그레이드 표식 최대 3개. 기존 크기와 높이 계산은 유지하며 SVG 종횡비를 보존한다. 시설 수량/팔레트/배치/스케일은 조정 가능하다.

## 연결 계약

`art/places.ts`의 `regionalScene(tile)`은 `tile.id` 마지막 slug를 사용하며 배열 index로 시험을 추정하지 않는다. 선택적 렌더 메타데이터 `visualScene: RegionalScene`가 있으면 우선한다. 공통 Tile 타입에는 필드를 추가하지 않았다. 통합자가 타입을 확장한 객체를 넘기거나 이 모듈의 `ArtTile`을 사용할 수 있다. 기존 createFacility(kind, level, index) 호출도 호환되며 네 번째 tile 인자를 사용하면 장소별 시설이 나온다.

| 장면     | 지원 ID slug               | 비고                  |
| -------- | -------------------------- | --------------------- |
| 출발     | start                      | 게이트                |
| 루기아   | lugia-trial, whirl-islands | 섬·바위·소용돌이      |
| 칠색조   | ho-oh-trial                | 다층 방울탑·금빛 방울 |
| 공중날기 | fly, fly-corner            | 바람 표지·착지대      |

기존 `whirl`/`bell-tower` 구매 명소도 장소 장식을 사용하되 kind/이름/구매 여부를 바꾸지 않는다. 시각 장식은 시험/착지 효과를 실행하지 않는다. 새 규칙 ID가 다르면 `places.ts`에 별칭을 추가하거나 visualScene을 전달하면 된다. 0/8/16/24 특수 칸 배치는 규칙 브랜치 소유이며 이 브랜치에서는 미변경. 현재 실제 맵의 모서리를 임의로 덮어쓰지 않는다.

## 독립 프리뷰

```powershell
npm ci
node src/ui/game/art/preview.mjs
# http://127.0.0.1:5184/board-art-preview.html
# http://127.0.0.1:5184/board-art-preview.html?corners=1
node src/ui/game/art/preview.mjs --build
```

첫 화면은 실제 맵 읽기 전용. corners=1은 8/16/24의 ID/표시 이름만 로컬 fixture에서 바꿔 세 모서리 장식을 시연한다. 경제/규칙 시연이 아니다. 말은 프리뷰 전용 이모지이며 기존 게임 스프라이트는 변경하지 않았다. 갤러리는 12종을 한 번씩 보여준다. 별도 번들은 `artifacts/board-art-bundle/`에 생성되며 git 제외.

## 검증

- `npm ci` 완료. 기존 의존성 감사 결과 high 10건이 보고됨. 루트 설정/lockfile 및 버전은 변경하지 않음.
- `npm run typecheck`, `npm run lint`, `npm run build`, 독립 프리뷰 build 실행.
- `node --experimental-strip-types --test src/ui/game/art/regional.test.mjs src/ui/game/projection.test.mjs src/ui/game/presentation.test.mjs src/ui/game/demo/adapter.test.mjs src/game/core/core.test.mjs src/data/maps/kanto-johto.test.ts`: 장소 매핑/메타데이터 우선순위, 5개 PNG 해시·크롭 크기, 12종 렌더와 업그레이드 상한, 투영/히트영역/깊이, 사람+COMPUTER 회귀, 코어/실제맵 검증. Node 22.17에서는 코어/맵 테스트에 experimental-strip-types 필요.
- Chrome 약 1100px 넓은 창 스크린샷에서 실제 시설/수목/수면·수직 객체·지면 배치 확인. 브라우저 호스트가 없어서 네이티브 Chrome으로 확인했으나 이후 접근성 인덱스/창 캐시가 실제 스크린샷과 불일치했다. 따라서 클릭 결과·Tab/Enter·좁은 화면·모서리 fixture의 브라우저 검증은 **미완료**. 자동화 도구가 표시한 넓은 화면 캡처는 세션에 있으며 별도 이미지 파일은 저장하지 못함. 미완료 항목을 통과로 간주하지 않는다.

후속 통합: 규칙 브랜치의 특수 칸 ID/visualScene 확인 → 아트 매핑 → 실제 엔진/맵과 함께 클릭/키보드/작은 화면·말 이동 확인. 외부 에셋의 제작자·조건·다운로드 URL·SHA-256은 `src/ui/game/assets/regional/README.md`, `credits.json`, `crops.json`에 기록했다.
