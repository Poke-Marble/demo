# Poke Marble 경제 구현 인계

2026-11-18. [규칙 상세](economy-rules.md)의 **권장안에 대한 데이터/API 제안**이다. 여기의 함수·확장 필드·이벤트는 명시적으로 ‘현재’라고 표시한 것 외에는 아직 존재하지 않는다. 이번 변경은 두 문서만이며 엔진/UI/공통 타입/루트 설정을 수정하지 않는다.

## 1. 읽은 기준과 작업 경계

| 읽기 기준                         | 확인 결과                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 현재 main `8a5222a`               | 이 작업 브랜치 시작 HEAD와 같음. `docs/parallel-workloads.md`, contracts/core/maps/UI adapter/demo 확인       |
| 적용 AGENTS                       | 현재 작업트리 및 상위 디렉터리에서 `AGENTS.md`를 발견하지 못함. main 파일 목록에도 없음                       |
| `feat/legendary-trials` `46210ff` | `docs/legendary-trials.md`, `src/game/legendary.ts`, core/contracts, maps types/실제 v2 데이터 읽기 전용 확인 |
| `feat/board-art` `790b9bc`        | `docs/board-art.md`, `art/places.ts`, `art/regional.ts`, `board.ts`, `isometric.ts` 읽기 전용 확인            |

다른 워크트리 파일·에이전트를 수정/제어하지 않는다. 아래 상대 소스 경로는 **해당 브랜치 내부의 경로**다. 다른 워크트리의 미통합 파일로 깨지는 저장소 링크를 만들지 않는다. 참고 커밋 이후 변경은 통합 시 다시 대조한다. 이 작업에 적용할 전용 skill은 없으며, 문서 안의 API 예시는 실행 가능한 신규 코드로 간주하지 않는다.

## 2. 현재 코드와 제안 계약의 차이

| 영역        | 현재 확인한 계약                                                                                                              | 필요한 후속 연결                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| main 코어   | `src/game/core/index.ts`의 `dispatch`는 roll/end만 처리. buy/upgrade는 `unsupported-action`                                   | 경제 dispatcher가 선택적 행동 처리 및 이동 결과와 경제를 하나의 확정 단위로 조합            |
| 공통 상태   | `CityHolding { tileId, ownerId, facilityLevel }`, `Player.balance`, `GameState.turnNumber`                                    | 0..3 단계는 재사용 가능. 개인 바퀴·방문·채무·revision·중복기록은 없음                       |
| 훅          | `HookEffect`는 players/holdings/victory/events만 반환. 위치·차례 메타 변경 금지                                               | 가호·경제 확장을 담지 못함. 훅에서 금액만 할인해 가호 반환 상태를 버리는 구현 금지          |
| 맵 seed     | `PropertySeed { purchasePrice, upgradeCosts, tollByLevel }`; `toMapDefinition`이 economy와 로컬 메타 제거                     | 원본 BoardDefinition에서 가격 카탈로그를 별도 전달. 축소 MapDefinition만으로 경제 계산 불가 |
| main 맵     | `map:kanto-johto:v1`, 일반 목적지27, 모서리 시험/비행 없음                                                                    | trials v2는 도시24+관광4+출발1+special3=32. v1 저장을 v2로 이름만 바꾸지 않음               |
| trials      | v2, `special` 분기, 선택 `CoreState.legendary`, `GameAction \| LegendaryAction`, `legalFlyDestinations`, `quoteBlessing`      | 경제 합성 경계에서 전체 CoreState 보존. main에는 아직 없는 API임                            |
| trials 착지 | 일반 도시/관광/출발에 onLand 한 번. special에는 경제 훅 없음. 비행은 start 보상 없음                                          | `tile-landed` 구독과 onLand 양쪽에서 통행료를 정산하지 않음                                 |
| trials 가호 | `quoteBlessing(state,id,'toll'\|'upgrade',amount)` → `{amount,consumed,state}`. 할인액 내림, 양수면 rate0도 소비              | 견적용 반환 상태는 폐기. 성공 거래의 전체 상태에 가호 패치를 병합·확정                      |
| UI          | `src/ui/game/adapter.ts`의 `GameView.actions/prompt`, `choose`, `runComputerTurn` hook. 데모에 하드코딩 변화 있음             | demo는 실제 경제/AI 아님. 실제 연결 adapter에서 제안 합법 API를 소비                        |
| 아트        | `createFacility(kind, level, index, tile?)` → `createRegionalFacility(tile, level)`, `ArtTile.visualScene?` 우선 후 slug 매핑 | 소유 유무나 시설 집합을 입력받지 못함. 단계별 캠프/숍/센터/final 지원 API는 아직 없음       |

main의 `src/data/maps/types.ts`는 레벨 0..3을 허용하는 seed 계약이고 모형 표식도 최대 3개다. 수치 레벨이 맞는 것만으로 의미가 같다고 보면 안 된다. 현재 아트는 미소유에도 `holding?.facilityLevel ?? 0`으로 장소 건물을 그리므로 **미소유 장식과 캠프 깃발을 구분할 입력이 필요**하다. `visualScene`의 `center/gym`은 배경 장면 분류이며 구매된 센터/최종시설이라는 상태가 아니다. 예를 들어 saffron의 현재 gym, goldenrod의 center는 실프/라디오타워 최종시설을 보장하지 않는다.

## 3. 제안 데이터 키와 소유자

공통 식별자 `MapId/TileId/PlayerId/CityGroupId`는 기존 타입을 import한다. 표시명·index로 키를 새로 만들지 않는다. 맵·가격·아트는 아래 세 레이어로 분리하되 실제 파일/타입 배치는 담당자가 합의한다.

| 레이어 / 제안 키                                                                                         | 의미·검증                                                                                            | 소유/소비                                                 |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 지도 `finalFacilityKey`                                                                                  | 예: `facility:pallet:oak-lab`. 최종시설 의미 식별자, 도시만 참조                                     | poke-trials 발행; 경제는 존재/일치 검사, 아트는 모형 조회 |
| 시설 카탈로그 `key, nameKo, category`                                                                    | category 후보 lab/department-store/company/radio-tower/lighthouse/gym/other. 이름과 키 분리          | poke-trials. 종별 경제 효과 없음                          |
| 지도 `routeStoryKey?`                                                                                    | 라인/그룹의 이야기 근거 식별자. 소유 판정용 그룹 키와 별개                                           | poke-trials. 경제는 그룹/side만 소비                      |
| 시각 `visualScene?`                                                                                      | 기존 `RegionalScene` 값만 전달                                                                       | poke-art. 경제가 임의 새 enum 값을 주입하지 않음          |
| 경제 카탈로그 `mapId, catalogVersion, propertiesByTileId`                                                | 현재 mapId와 정확히 일치. 가격 누락 시 fail-closed                                                   | feat/economy가 원본 맵 seed를 명시 변환                   |
| 도시 항목 `kind:'city', landCost, incrementalBuildCosts, tollByStage, finalFacilityKey`                  | build `[shop,center,final]` 길이3, toll `[camp,shop,center,final]` 길이4. 모두 안전한 음이 아닌 정수 | 경제. 별도 누적시설/레벨안 모두 동일 금액 표현            |
| 관광 항목 `kind:'landmark', purchaseCost, baseToll`                                                      | build 필드 없음. 기존 명소4 ID와 정확히 일치                                                         | 경제. 최종시설과 구분                                     |
| 프로필 `id, version, facilityModel, unlockLaps, requireFinalRevisit`                                     | 예시 `facilityModel:'cumulative-prefix'`, unlock shop0/center1/final1                                | feat/economy. 승인 전 recommended-draft 표시              |
| 프로필 `groupTollMultiplier, takeoverMultiplier, saleRate, finalTakeoverImmune, landmarkTakeoverAllowed` | 초안 2/2/0.5/true/false. 확정 수치처럼 하드코딩 금지                                                 | 경제, UI는 표시만                                         |
| 가호율                                                                                                   | 별도 economy 50% 설정을 만들지 않고 trials `legendary.rules` 읽음                                    | poke-trials 소유. 경제 quote 입력                         |

예시 키들은 새로 발행된 공식 키가 아니다. `finalFacilityKey`와 `visualScene`을 맵 타입에 실제 추가하는 일은 poke-trials/poke-art의 통합 작업이다. 가격 어댑터는 `purchasePrice→landCost`, `upgradeCosts→incrementalBuildCosts`, `tollByLevel→tollByStage`를 의미 검증 후 복사한다. 기존 관광 seed의 `upgradeCosts:[]`와 `tollByLevel:[50]`는 관광 항목으로 분기한다. `special/start`는 카탈로그에서 제외한다.

### 런타임 상태 확장 제안

`EconomyState extends CoreState` 형태로 확장하고 `schemaVersion:1` 공통 의미를 임의 변경하지 않는다. 자체 `economy.schemaVersion:1`과 프로필/가격 버전을 둔다. 아래는 권장 A 누적안 기준이다.

| `economy` 필드                                                      | 제안 의미                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `revision, sessionId, rulesProfileId, rulesVersion, catalogVersion` | 성공한 전체 전이마다 revision +1. 새 게임은 sessionId 교체. 저장 시 전체 CoreState 포함                     |
| `completedLapsByPlayerId`                                           | 개인 출발 통과 횟수. initial 0, 음이 아닌 안전한 정수                                                       |
| `visitOrdinalByPlayerId`                                            | 실제 착지마다 +1, 다른 칸 착지를 포함한 플레이어 누적 순번                                                  |
| `developmentByTileId`                                               | 도시별 `stage, facilities, centerReadyVisitOrdinal`. holdings와 1:1 검증. owner는 holdings 단일 원천        |
| `landing`                                                           | `{id, rootCommandId, step, playerId, tileId, visitOrdinal, phase, propertyDecisionUsed}` 또는 null          |
| `pendingDebt`                                                       | `{id, landingId, debtorId, creditorId, gross, discount, amount, blessingConsumption}` 또는 null             |
| `processedCommands` / `landingReceipts`                             | 저장 가능한 idempotency 영수증. 같은 세션 중 재시도 범위 전체를 보존; 임의 TTL로 중복처리를 재허용하지 않음 |

단일 진실은 `development.stage/facilities`이며 `holdings.facilityLevel`은 호환용 projection으로 같은 커밋에서 갱신한다. 예: stage2면 prefix `[shop,center]`와 level2가 일치해야 한다. 양방향 임의 편집을 허용하지 않는다. B 순차안 선택 시 facilities는 현재 하나의 모형 정보로 바뀌며 모델 구분자가 없는 저장을 추정 변환하지 않는다. 관광 소유는 기존 holdings에 level0으로 표현하되 development는 생성하지 않는다. 미소유는 holdings 없음이며 도시 camp(level0)와 구별한다.

기존 저장에 개인 바퀴수·센터 생성 시점이 없으면 turnNumber/잔액으로 역산하지 않는다. MVP는 경제 활성 새 게임만 지원하거나 별도 마이그레이션 결정을 받아야 한다. JSON 입출력 경계는 키 참조·동일 소유 중복·단계·시설 prefix·금액·생존 소유자·맵 버전·채무 일관성을 런타임 검증한다.

## 4. 사람·AI 공통 합법행동과 거래 API 제안

다음 시그니처는 **신규 제안**이며 현재 `GameAction`에 이미 들어있지 않다. 실제 선언은 feat/economy가 기존 타입을 재사용하는 확장 유니온으로 구현한다. 코어에 경제 입력을 그대로 보내면 현재는 unsupported-action이다.

```text
getLegalActions(state, map, catalog, actorId) -> LegalActionSet
quoteConstruction(state, context, {tileId, targetStage}) -> QuoteResult
quoteTakeover(state, context, {tileId}) -> QuoteResult
quoteSale(state, context, {tileId}) -> QuoteResult
dispatchEconomy(state, context, command) -> EconomyTransition
resolveLanding(state, context, landingContext) -> EconomyTransition
evaluateVictory(state, map) -> VictoryEvaluation     // feat/victory 소유
```

`context`는 map/catalog/profile 및 승리 판정 함수처럼 게임 세션에 고정된 의존성이다. 견적은 순수 함수로 state/RNG/가호를 바꾸지 않는다. 선택적 거래를 할 때마다 같은 검증·가격 산식을 쓰고 AI 전용 할인/건설 예외를 만들지 않는다.

| 메시지                                                 | 제안 필드                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 명령 공통 envelope                                     | `sessionId, commandId, expectedRevision, playerId, intent`. 바퀴수·금액·주사위 결과는 입력받지 않음                                                                                                                    |
| `construct-property` intent                            | `tileId, targetStage, landingId`. 미소유일 때 부지 포함 여부는 엔진이 판정                                                                                                                                             |
| `buy-landmark` / `takeover-property` / `pass-property` | `tileId, landingId`                                                                                                                                                                                                    |
| `sell-property`                                        | `tileId`, 채무 중이면 `debtId`도 바인딩                                                                                                                                                                                |
| `declare-bankruptcy`                                   | `debtId`                                                                                                                                                                                                               |
| 코어·시험 intent                                       | 기존 roll/end와 `LegendaryAction`을 공통 envelope로 감쌈. 별도 판정기를 중복 작성하지 않음                                                                                                                             |
| `LegalActionSet`                                       | `revision, playerId, phase, actions[]`; 각 선택에 actionKey/intent/quote 또는 disabledReason. 타인 actor는 빈 집합                                                                                                     |
| 성공 Quote                                             | `quoteId, revision, landingId?, profileVersion, catalogVersion, tileId, fromStage?, toStage?, lineItems[], landSubtotal, upgradeSubtotal, gross, discount, total, balanceAfter, consumesBlessing, eligible, reasons[]` |
| 실패 Quote                                             | invalid target/데이터 오류의 판별 가능한 error. 부적격 건설을 0원 견적으로 표현하지 않음                                                                                                                               |
| 견적 항목                                              | `land/shop/center/final/takeover/sale`, `amount`, `alreadyOwned`, 표시명 키. 이미 결제 항목은 0원 참고 행이며 청구 합계에서 제외                                                                                       |
| 성공 Transition                                        | `ok:true, state, events, presentations, receipt` (원자적으로 확정된 전체 스냅샷)                                                                                                                                       |
| 실패 Transition                                        | `ok:false, state:원본, events:[], presentations:[], error`                                                                                                                                                             |

잔액 부족은 `eligible:false`와 할인 후 부족액을 견적에 보여준다. locked 단계도 UI에 잠금 이유를 보여줄 수 있지만 합법 액션에는 넣지 않는다. dispatch는 선택 목록을 신뢰하지 않고 다시 검증한다. 주요 오류 코드는 `stale-revision`, `duplicate-command-conflict`, `wrong-player`, `wrong-landing`, `not-purchasable`, `not-owner`, `already-built`, `stage-locked`, `final-revisit-required`, `missing-facility-metadata`, `insufficient-funds`, `takeover-immune`, `debt-pending`, `property-decision-used`, `invalid-state`, `game-not-playing`를 제안한다.

동일 commandId 영수증 조회는 revision 비교보다 먼저 한다. 정확한 재시도에는 원래 receipt를 반환하고 상태/이벤트 재발행은 하지 않는다. 새로운 명령이 낡은 revision이면 재견적하게 한다. quoteId만으로 거래를 승인하지 않으며 actor·tile·landing·버전을 모두 묶는다. RNG는 경제 견적/선택에서 소비하지 않는다.

기존 `buy-city`는 원한다면 target0 도시 구매로, `upgrade-facility`는 다음 단계 한 칸으로 변환하는 **호환 어댑터**를 제안한다. 기존 액션으로 목표2 동시건설을 암묵 추정하지 않는다. 관광명소는 이름이 buy-city라고 해서 도시 건설 경로로 보내지 않는다. 기존 `UIChoice.action?: GameAction`은 새 유니온을 표현하지 못하므로 후속 UI 담당자가 타입 확장 또는 `choose`의 서버/로컬 선택키 매핑으로 연결해야 한다.

`getLegalActions`는 컨트롤러 종류에 따라 결과를 바꾸지 않는다. 잘못된 actor/파산자/종료 상태는 빈 목록이며 필수 채무 중에는 채무자의 정리 행동만 반환한다. 파산 후 내부 end-turn은 coordinator 책임이고 플레이어 합법 목록에 다시 노출하지 않는다. trials의 성공 후 종료만 가능, 실패 후 종료/로프 가능, 최초 미도전 중 종료 불가 규칙은 기존 판정 결과를 그대로 소비한다.

### 가호 포함 단일 확정 경계

1. 원본 전체 상태로 코어/trials 이동을 **임시 계산**한다. onLand는 착지 컨텍스트 수집에만 쓰거나 경제 합성기가 직접 한 번 처리한다. 외부 상태를 훅 안에서 변경하지 않는다.
2. 임시 상태에서 경제 견적 및 `quoteBlessing`을 계산한다. 금융 패치와 반환된 legendary 패치를 같은 원본에서 합성한다. `quoteBlessing.state` 전체로 덮어써 금융 변경을 잃지 않도록 주의한다.
3. 필수 청산 선택은 pendingDebt 스냅샷으로 확정하고 입력을 기다린다. 선택적 건설 실패는 이미 확정된 이동/통행료를 되돌리지 않는다. 반면 이동 계산 자체/필수 착지 상태 생성의 구조 오류는 이동 전체를 거부한다.
4. 각 거래의 잔액/소유/개발/가호/독점/승리/이벤트/영수증을 검증해 한 번 저장하고 그 뒤 구독자에게 알린다. 도중 예외 시 이번 명령 전 원본으로 돌아간다.

최소한 경제 합성 dispatcher가 전체 `CoreState`를 반환해야 한다. HookEffect에 근거 없이 `legendary`를 끼워 넣어도 현재 코어가 적용하지 않는다. 공통 타입/코어 확장이 필요하면 후속 담당자가 합의한 별도 변경으로 수행한다. UI의 `subscribe` 콜백이나 연출 완료 콜백에서 정산하지 않는다.

## 5. 건설 UI 견적과 아트 상태 연결

UI는 읽기 조회와 실제 착지 결정을 구별한다. 어느 타일이나 가격/통행료는 조회 가능하지만 건설 선택은 규칙이 내보낸 현재 방문 액션으로만 제공한다. 사람 차례에만 모달을 조작하고 AI는 같은 `LegalActionSet`에서 선택한다.

건설 패널은 현재 단계·소유자, 개인 바퀴수와 잠긴 이유, 도시별 최종시설명, 새로 구매할 부지/시설별 가격, 기존 보유(재결제0), 동시건설 합계, 칠색조 적용 전후, 소비 예정 가호, 결제 후 잔액을 표시한다. A/B 시설 모델을 표시 데이터에 포함한다. 목표를 바꾸면 quote를 다시 받고 ‘부지 제외’ 체크로 소유 전제를 우회할 수 없게 한다. 취소는 가호 미소비다. revision 변경 시 이전 확정 버튼을 잠그고 새 견적을 받는다. 통행료 정보는 기본값·그룹 배율·방문자 할인 후 예상액을 분리하며 타인의 가호까지 공개할지는 향후 UI 정책으로 남긴다.

기존 `GamePrompt.kind:'purchase'|'upgrade'|'liquidate'`는 재사용 가능하다. 인수는 purchase 설명과 선택키로 연결하거나 UI 담당자가 별도 kind를 합의한다. 채무 prompt는 해소 전 dismissible=false이고 UI 닫기/턴 종료로 건너뛰지 못한다. 숫자 포맷과 통화 기호는 표시층 책임이다.

아트에 제안할 렌더 입력은 아래와 같다. **현 poke-art 코드에 이 인터페이스가 구현되었다고 가정하면 안 된다.** 경제 담당이 모형 제작이나 `createFacility`를 수정하지 않는다.

```text
PropertyRenderState {
  tileId, ownership: 'unowned' | 'owned' | 'not-purchasable',
  ownerId?, stage?: 'camp' | 'shop' | 'center' | 'final',
  facilityModel?, facilities?: ['shop', ...], finalFacilityKey?,
  isTouristLandmark: boolean
}
```

장면 메타(tile의 visualScene)와 이 상태를 함께 아트 어댑터로 넘긴다. camp는 소유 깃발, shop/center는 선택 모델에 맞는 보유 표식, final은 finalFacilityKey에 맞는 대표시설을 요청한다. 관광명소는 고정 장식+소유 표식이며 단계 배지 없음, special은 고정 장식만이다. 미소유 장식 건물은 구매 상태로 읽히지 않게 표시한다. 경제 확정 전 quote/hover는 렌더 상태를 올리지 않는다.

임시로 기존 `createFacility(kind,level,index,tile)`에 level0..3을 넘기면 숫자 표식까지만 호환되며 캠프·숍·센터·대표시설 모형의 완전한 구현은 아니다. visualScene에 아직 없는 `lab/silph/radio` 문자열을 억지 캐스팅하지 않는다. poke-art가 새로운 모형 키와 fallback을 정의한 뒤 연결한다. fallback은 이름/단계 텍스트와 명시적 임시 모형이며 모든 final을 gym으로 오인시키지 않는다. 접지·depthOrder·클릭 타일 ID·말 위치는 아트 계약을 유지한다.

## 6. 후속 브랜치 구현 순서와 검증

이 문서 작업에서는 코드/테스트를 추가하지 않는다. 아래는 후속 구현의 수용 조건이다. main merge/원격 push/배포는 별도 권한 범위다.

1. **poke-trials/poke-art 계약 정리**: v2 ID/배치와 대표시설 카탈로그, render 입력 계약을 합의한다. 경제는 원본 맵 seed를 읽는 카탈로그 어댑터를 준비한다. 담당 브랜치 파일은 각 담당자만 수정한다.
2. **feat/economy**: 프로필/카탈로그 검증 → 바퀴/방문/영수증 확장 → 건설·통행료 순수 견적 → 구매·강화 원자 처리 → 인수·매각 → 채무/파산 → 코어·trials 합성 dispatcher. 초기부터 승리 평가 호출 경계를 두되 판정기 미연결을 완료 게임으로 표기하지 않는다.
3. **feat/victory**: 공유 소유 predicate로 그룹/라인/관광/최후 생존 판정. 경제 커밋 경계에 연결하여 즉시 종료·다중 사유 우선순위를 검증한다. onEndTurn은 보조 안전 검사이며 유일한 판정 시점이 아니다.
4. **feat/computer-ai**: 완성된 공통 합법 API를 소비. trial/pendingFly/채무/건설/인수/패스/종료 우선순위를 처리한다. 전략보다 진행 가능성·중복 방지가 먼저다. 예산 부족이면 선택적 거래를 패스하고 필수 채무는 합법 매각/파산으로 해소한다.
5. **실제 adapter/UI/아트 통합**: demo 하드코딩을 교체하고 CoreState 전체·합법 액션·견적·PropertyRenderState를 전달한다. 사람1+AI3 실제 게임으로 모든 단계·승리를 확인한다.

| 후속 검증 묶음 | 필수 사례                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| 데이터         | v2 32칸/도시24/8그룹/관광4/special3/start1, 가격 길이·정수·누락 키, 최종시설 메타 전수 대응                     |
| 해금·방문      | 개인 바퀴와 전역 턴 구별, 정확 출발/다중 통과/보상0, 시험 체류/비행0, 센터 당일 final 금지, 인수 후 재방문      |
| 건설           | 부지 필수, 기존 항목0, 합산 후 할인, 두 모델 일치, 정확 잔액/부족/목표 이하/안전정수 초과 원복                  |
| 가호           | payer 가호·독점 선적용·101→51·65+65 할인65, 0금액/0%/100%, 취소/실패 미소비, 정산 확정 1회                      |
| 거래·청산      | 인수 전 통행료, 면역, 인수 잔액 양측 검증, 매각 내림, 청산으로 충분/부족/조기파산, 독점 상실                    |
| 승리           | 3그룹·한변·관광4·최후생존, 동시 조건 우선순위, 청산 중 미판정, finished 이후 전체 행동 거부                     |
| 중복·연쇄      | command 재시도/payload 충돌/stale quote, 비행 목적지1회, 로프 후 이동, 연출 skip/재구독/재시작 시 중복0         |
| 공통 AI 경계   | 같은 상태에서 사람/AI 동일 합법 목록, AI가 필수 선택을 해소하고 턴 종료, signal 취소·이전 session 입력 거부     |
| 렌더·저장      | 미소유와 캠프 구별, 누적/순차 표현, final 명칭·키 일치, 관광/시험 구별, JSON 왕복 후 가호·바퀴·채무·영수증 보존 |

논리 핵심을 검증하는 단위/통합 테스트를 후속 브랜치에서 만들고 당시 AGENTS와 담당 포맷을 따른다. 현재 문서-only 변경에는 프로젝트 타입체크/빌드나 게임 테스트를 추가하지 않는다. 문서 검증은 링크·코드 대응·계산 재검토, 담당 Markdown만 Prettier, `git diff --check`로 수행한다.

## 7. 결정 필요사항과 인수 체크리스트

| 결정                  | 권장 초안                                              | 승인 전 상태                                   |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| 숍·센터 의미          | A 별도 누적시설, prefix 전제                           | B 순차레벨도 선택 가능. 사용자 미확정          |
| 4단계 해금            | B 압축형: shop0/center1/final1바퀴 + final 새 방문     | A 보수형 final2바퀴와 비교 후 결정 필요        |
| final 재방문 범위     | 센터 완성/인수 이후 새 착지, 비행 인정                 | 사용자 확정 조건 아님                          |
| 가격·기본 통행료·독점 | 기존 seed 표, 그룹2배                                  | 밸런스 플레이 필요                             |
| 가호                  | trials 기본 50%, 할인액 내림·최소0, 신규시설 합산 대상 | 비율 승인 필요. 최소1원 변경은 helper 계약부터 |
| 인수·면역             | 원가2배 소유자 지급, final 인수 면역, 관광 인수 불가   | 원작 참고/자체 제안을 구분하여 승인 필요       |
| 매각·파산             | 원가50% 은행 매각, 전자산 은행청산, 회수액만 지급      | 조기파산 잔여금 은행 귀속 포함 승인 필요       |
| 승리 우선순위         | 생존→관광→라인→3그룹                                   | 기존 타입은 순서를 정하지 않음                 |

- [ ] 사용자 미결 선택을 승인 값과 구분한 프로필로 기록한다.
- [ ] poke-trials가 도시 배치/여행 연결과 대표시설 키를 최종 발행한다.
- [ ] poke-art가 실제 construction render API와 미소유/캠프 구별을 제공한다.
- [ ] feat/economy는 HookEffect 한계를 해결하고 가호와 금액을 한 번에 확정한다.
- [ ] feat/victory는 모든 소유 변경·파산 경계에서 즉시 판정한다.
- [ ] feat/computer-ai와 사람 UI가 동일 LegalActionSet 및 command 경계를 쓴다.
- [ ] 실제 맵+코어+시험+경제+승리+UI/아트를 연결한 뒤 구현 완료라고 보고한다.

문서 준비 상태: 위 미결 결정에 대한 비교·권장안과 구현 계약은 제시했다. 경제 기능, 신규 대표시설 모형, AI 전략은 아직 구현하지 않았다.

## 8. 이번 문서 검토 기록

- 넷마블 공식 원문 URL을 직접 열어 출발 통과 해금·건설·독점·인수·종료 조건을 대조했다. 원작에서 확인한 범위와 자체 추천을 구분했다.
- 위 기준 커밋들의 코어 지원 액션, HookEffect, 가호 반환 상태/내림 계산, v2 타일 ID/개수, 아트 함수 인자·visualScene·표식 상한을 대조했다. 다른 워크트리는 읽기만 했다.
- 두 문서의 로컬 링크/앵커 3개와 UTF-8을 검사했다. 8개 가격 등급의 정수성과 합산 할인·홀수 통행료·인수·매각·채무 회수 예제 계산을 일회성 검산했다. 저장소에 검산 코드/테스트를 추가하지 않았다.
- 잠금 조건과 신규 방문, 매각 후 동일 방문 재매입 방지, 파산자의 내부 차례 종료, 채무 중 승리 유보를 교차 검토했다.
- 담당 Markdown 두 파일만 Prettier로 정리하고 `prettier --check` 및 `git diff --check`를 확인한다. 코드 변경이 없으므로 게임 실행 테스트·타입체크·빌드는 수행하지 않으며 기능 구현 검증으로 보고하지 않는다.
