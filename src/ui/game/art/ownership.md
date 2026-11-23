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
