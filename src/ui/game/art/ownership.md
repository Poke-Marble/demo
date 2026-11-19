# 타입별 소유색·문양 렌더 계약

2026-11-19 / feat/board-art. `ff6cbf0`의 공통 투영 건축·캠프→숍→센터→대표시설을 유지하고 소유자 표현만 추가한다. index/adapter/demo/contracts/실제맵/경제 규칙은 수정하지 않았다. 기존 건축 모형과 과거 캡처·완료 커밋은 보존한다.

## 권위 있는 입력

```ts
type OwnerType = 'grass' | 'fire' | 'water' | 'electric';
interface OwnerVisual {
  readonly id: string;
  readonly name: string;
  readonly pokemonId?: string;
  readonly type?: OwnerType;
}
interface ConstructionVisual {
  stage: ConstructionStage;
  owner?: OwnerVisual | null;
}
```

`ownership.ts`의 `ownerTheme(owner)`는 명시적 `type`을 우선하고, 없으면 입력된 pokemonId의 네 스타팅 매핑을 사용한다. ID도 타입도 알 수 없으면 중립이며 좌석/턴/잔액/플레이어 이름/사람·COMPUTER 여부로 색을 추정하지 않는다. 명시적 타입과 pokemonId가 충돌하면 통합자가 제공한 타입을 우선하므로 올바른 메타데이터를 전달해야 한다.

| pokemonId             | 타입·문양            | 주 소유색 | 어두운 외곽·문양 배경 |
| --------------------- | -------------------- | --------- | --------------------- |
| pokemon:0001 이상해씨 | grass / 풀·잎사귀    | #26834b   | #164b34               |
| pokemon:0004 파이리   | fire / 불·불꽃       | #df5735   | #792e25               |
| pokemon:0007 꼬부기   | water / 물·물방울    | #267fb9   | #183e65               |
| pokemon:0025 피카츄   | electric / 전기·번개 | #edca37   | #59480e               |

다른 포켓몬도 통합자가 위 네 타입 중 하나를 명시적으로 전달할 수 있다. 타입을 제공하지 않은 알 수 없는 pokemonId는 중립색/중립 표식이며, 알려진 소유자명은 접근성 표기에 남긴다.

독립 모형 API는 `createConstructionArt(tile, { stage, owner })`. 보드는 다음 추가 입력을 지원한다:

```ts
createProjectedBoard({
  ...existingOptions,
  construction: new Map([
    [
      'tile:kj:pallet',
      {
        stage: 'center',
        owner: { id: 'player:1', name: '나', pokemonId: 'pokemon:0025' },
      },
    ],
  ]),
  // 선택적. 이 Map에 존재하는 항목은 construction.owner/기존 holding보다 우선한다.
  ownership: new Map([
    [
      'tile:kj:pallet',
      {
        id: 'player:2',
        name: 'COMPUTER 1',
        type: 'fire',
      },
    ],
  ]),
});
```

소유자 선택 우선순위는 `ownership.has(tileId)`의 값 → 명시된 `construction.owner` → 입력 GameView의 `holding.ownerId`와 일치하는 player다. 마지막 호환 경로도 이미 입력된 소유 ID와 pokemonId만 읽는다. 실제 게임 초기 파트너가 바뀌거나 player 배열 순서가 달라도 해당 포켓몬의 타입을 따른다. 소유자 정보를 읽을 수 없는 holding은 그 ID를 이름으로 남기고 중립 타입으로 표시한다. 소유자를 새로 결정하거나 경제/인수 규칙을 실행하지 않는다.

`owner:null`은 명시적인 미소유 입력이다. 보드와 독립 모형 모두 남아 있는 이전 건설 단계를 시각적으로 unowned로 정규화해 옛 깃발/시설/소유색을 지운다. 반대로 `stage:'unowned'`에는 소유자 객체가 남아 있어도 빈 모형/중립 타일을 표시한다. 정상 입력은 미소유+unowned, 소유자+camp/shop/center/final의 일관된 쌍이다. 과거 소유자 미지정 construction 호출은 하위 호환을 위해 중립 모형을 허용한다. 이전 `ownerColor` 필드는 deprecated이며 무시한다. **좌석별 임의색 배열은 제거했다.**

소유권 변경 시 새 객체/Map으로 다시 렌더하면 타일 테두리·측면·문양·모형 받침·띠·깃발·소유자 접근성 이름이 즉시 다시 계산된다. 소유색 캐시는 없고, 건설 단계가 같으면 건설 등장 연출도 재생하지 않는다. 이 API는 인수 비용이나 매입 가능 여부를 계산하지 않는다.

## 시각·접근성 원칙

- 타일은 중립 상면을 유지하면서 선명한 소유색 내곽선, 어두운 외곽선과 측면, 앞쪽 타입 문장을 표시한다. 히트영역/투영 좌표는 그대로다.
- 캠프는 소유색 깃발+타입 문양이다. 숍/센터/최종 모형은 소유 받침과 정면 띠·간판·깃발을 추가한다. 건축 본체를 감싼 `pm-architecture-core`는 소유자 교체에 영향을 받지 않는다. 센터의 빨간 지붕, 라디오 안테나·등대·백화점·실프 등 특징은 보존한다.
- 네 문양은 자체 코드로 그린 잎·불꽃·물방울·번개다. SVG 외부 이미지 요청/AI 비트맵은 없다. 전기 노랑은 밝은 지면에 묻히지 않도록 짙은 갈색 외곽/문양 배경을 함께 사용한다. 네 문양의 밝은 전경과 어두운 배경 대비, 노랑과 어두운 외곽 대비를 단위 테스트에서 4.5:1 이상으로 확인했다. 실제 색각 사용자 연구/전체 화면 WCAG 인증을 의미하지 않는다.
- 타일의 aria-label/title에는 도시명·건설 단계·소유자명·타입·문양명·그룹명이 포함된다. 사람/COMPUTER 모두 같은 표현이다. 장식 SVG는 aria-hidden으로 중복 낭독을 막는다. 독립 SVG를 다른 UI에 붙이면 `ownerDescription(owner)`로 해당 UI의 접근성 이름을 제공해야 한다.
- 도시 그룹은 소유색과 관계없는 작은 회색 `G1`…`G8` 표식과 그룹명으로 분리한다. 이 표식은 입력 map.cityGroups의 식별 정보이며 그룹 독점 여부를 계산하거나 독점색을 만들어내지 않는다.

## 독립 프리뷰와 검증

재부팅 후 5184 리스너가 없음을 확인하고 로컬 서버 한 개를 복구했다. 기본 화면은 무소유이며 색상 모형을 바로 보려면 다음 주소를 사용한다:

`http://127.0.0.1:5184/board-art-preview.html?stage=final`

건설 단계 다섯 버튼, 네 타입 혼합/각 타입/미소유 버튼, 대상 도시 및 새 소유자 선택 후 ‘선택도시 소유권 교체’로 재현한다. 교체 시연은 먼저 캠프 이상 건설 단계를 선택한다. 이 UI는 명시적 fixture 입력을 만드는 독립 시연이며 실제 게임 경제/소유권 변경을 실행하지 않는다. `?stage=final&owner=electric` 같은 주소로도 열 수 있다.

`node src/ui/game/art/preview.mjs --build`는 기존 게임 데모까지 읽기 전용으로 별도 번들한다. `--serve-built`의 5195 및 5196/board-art 하위 경로 검증 방식은 `construction-models.md`를 따른다. `browser-check.mjs`는 현재 개발 서버로 5184를 사용하며, 별도 headless Chrome을 띄워 사용자 Chrome 세션을 건드리지 않는다. Node 테스트는 `node --test src/ui/game/art/regional.test.mjs`로 실행한다.

브라우저 검증: 개발/프로덕션/하위 경로×1200px/390px에서 다섯 단계, 네 타입 필터, 대상 도시의 네 소유자로 교체 및 미소유 반환, 다른 도시의 상태 불변, 그룹 표식 불변, 문양/접근성 이름/본체 보존/소유자 변경 즉시 반영, 32칸 클릭과 키보드 선택·말 깊이·reduced-motion을 확인했다. 타입 변경만으로 건설 등장 연출이 재시작하지 않는 것도 검사했다. 타일 클릭 192회, 타입 필터 24개 화면 조합, 소유권 교체 24회와 미소유 반환 6회가 통과했다.

기존 게임 데모에서도 여섯 화면 조합의 시작 흐름을 진행하되 사람 파트너를 피카츄로 골랐다. 입력 holdings의 사람 소유지는 electric, COMPUTER 소유지는 각자의 grass/fire/water로 표시되며 실제 타일 정보 대화상자가 열리는 것을 확인했다. 그림 디코딩 6종과 별도 프로덕션/하위 경로 표시도 정상이다.

기존 캡처는 그대로 두고 새 산출물만 git 제외 `artifacts/ownership-qa/`에 저장한다: `report.json`, `{dev,production,subpath}-{1200,390}-final.png`, `-owner-{grass,fire,water,electric}.png`, `-transfer-electric.png`, `-transfer-unowned.png`, `existing-demo-{dev,production,subpath}-{1200,390}.png`. `before-neutral-model-*.png`는 ff6cbf0 상태 비교용 복사본이다.

한계: 검증은 격리 headless Chrome과 기존 시연 어댑터 기준이다. 실제 경제/새 맵/이벤트 브랜치 병합 후 인수의 합법성·잔액·새 데이터 필드 연결은 범위 밖이며 별도 통합 검증이 필요하다. 알 수 없는 pokemonId의 타입 자동 조회는 하지 않는다. main 병합·원격 푸시·배포 없음.

최종 검사: typecheck/lint/build와 별도 프리뷰 번들 통과. 소유 타입·명시적 해제와 메타데이터 부재 구분·비변이·색상 대비·본체 보존 등 관련 단위 테스트 11개 및 기존 보드/사람1+COMPUTER3/코어/실제맵 회귀 검사 통과. 명시적 owner:null과 owner 미제공을 구분하는 호환성 보정을 마지막으로 확인했다. 5184는 127.0.0.1에 단일 프로세스로 리슨한다.
