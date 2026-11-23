# 경제 구현 공개 계약

기준 main `bde04c3`. 소유 범위는 `src/game/economy/**`와 이 문서다. 적용 AGENTS 및 경제 전용 skill은 없다. 기존 contracts/core/UI와 다른 담당 코드는 수정하지 않는다.

## 첫 공개 계약 (구현 시작 시 기록)

진입점 `src/game/economy/index.ts`. 기존 `CoreState`에 `economy`를 추가하며 전체 상태를 반환한다.

- `createEconomyContext(board, profile?, modifiers?)`: 원본 BoardDefinition의 가격/최종시설 메타를 검증하는 고정 세션 의존성.
- `initializeEconomy(coreState, context, sessionId)`: 무소유 새 게임 전용. 바퀴/방문을 turnNumber로 추정하지 않는다.
- `quoteConstruction(state, context, playerId, tileId, targetStage)`, `quoteTakeover`, `quoteSale`, `quoteToll`: 순수 견적. 총액/부족액/가호/수익/잠금 사유 제공.
- `getLegalActions(state, context, actorId)`: 사람/AI 공통 intent와 견적. 경제 행동과 코어/전설 행동을 같은 envelope로 보낸다.
- `dispatchEconomy(state, context, command)`: `{sessionId, commandId, expectedRevision, playerId, intent}`. 성공은 전체 state/events/presentations/receipt, 실패는 원본 state와 빈 events/presentations. command 재전달은 receipt만 재사용한다.
- `resolveLanding`은 외부 이벤트 구독 API로 공개하지 않는다. dispatcher 내부에서 코어 결과의 실제 착지/출발 통과를 처리하여 두 번 정산할 경로를 없앤다.

intent는 construct-property(tileId,targetStage,landingId), buy-landmark/takeover-property/pass-property(tileId,landingId), sell-property(tileId,debtId?), declare-bankruptcy(debtId), 기존 코어/LegendaryAction이다. 단계는 camp0/shop1/center2/final3. 없는 다른 담당 모듈은 import하지 않는다. 승리판정은 담당외이며 최종 확정 스냅샷을 호출자가 평가한다.

기본 표준 프리셋은 누적 prefix, shop0/center1/final2 주회이고 짧은 경기는 shop0/center1/final1이다. 양쪽 모두 센터 보유 후 새 착지가 필요하다. 그룹2배/인수2배/매각50%/final 인수면역/관광 인수불가와 가호율은 유지한다. 현재 선택·연결 계약은 [건설 규칙 프리셋](construction-rule-presets.md)을 따른다.

## 구현 결과와 기본 가정

`types.ts`는 입력/출력 계약, `catalog.ts`는 맵/가격/저장 검증, `quotes.ts`는 견적, `index.ts`는 거래 및 코어/시험 합성 dispatcher, `economy.test.mjs`는 회귀 테스트다. 외부 능력/승리/AI 모듈 의존성은 없다.

| 항목     | 실제 구현                                                                                                                     | 기획 상태                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 시설     | 캠프는 부지 확보, 시설은 shop/center/final prefix, holdings level0..3 동시 갱신                                               | 사용자 확정 순서·누적                           |
| 최종시설 | 원본 `finalFacility.key`를 사용. lab/백화점/회사/라디오/등대/박물관 등을 gym으로 치환하지 않음                                | 기존 지도 콘텐츠 제안 소비                      |
| 가격     | 원본 seed의 purchasePrice/upgradeCosts/tollByLevel을 그대로 복사                                                              | 밸런스 미확정. 새 board/context로 교체          |
| 해금     | 표준 `[camp0,shop0,center1,final2]`, 짧은 경기 `[0,0,1,1]`. 센터 생성/인수 이후 새로운 착지에서 final 허용                    | 새 경기 프리셋 선택                             |
| 통행료   | 현재 단계 전체요금 × 완전소유 그룹 배율, 관광은 고정 별도 요금                                                                | 배율2는 권장값                                  |
| 인수     | 정가 누적원가 × 2를 소유자에게 지급. 통행료 먼저 확정. 인수 방문에는 추가건설 금지                                            | 배율2/final면역/관광금지는 교체 가능            |
| 매각     | 자산 전체를 은행에 정가 누적원가의 50%로 매각, 내림                                                                           | saleRate 교체 가능                              |
| 파산     | 매각 가능한 총액으로도 채무 충족 불가 시 자동청산. 자산은 은행으로 제거, 회수액만 채권자에 지급. 조기선언 시 초과금 은행 귀속 | 인계 문서 권장 정책. 현재 별도 정책 플래그 없음 |

모든 금액·합산·잔액은 음이 아닌 안전정수다. 견적의 `balanceAfter`는 부족분 표시를 위해 음수가 될 수 있으나 실제 상태 잔액은 음수가 되지 않는다. 가격 누락/잘못된 벡터/최종시설 메타 누락은 context 생성부터 거부한다. 불완전 데이터를 체육관이나 0원으로 대체하지 않는다.

## 사용 예시

아래 코드는 실제 존재하는 모듈만 참조한다. 프로젝트 루트 기준 경로이며, 기존 UI/integration에 자동 적용되지는 않는다.

```ts
import { kantoJohtoMap } from './src/data/maps/kanto-johto.ts';
import { createGame } from './src/game/core/index.ts';
import {
  createEconomyContext,
  initializeEconomy,
  getLegalActions,
  dispatchEconomy,
  verifyCommittedReceipt,
} from './src/game/economy/index.ts';
import type { EconomyIntent } from './src/game/economy/index.ts';

const context = createEconomyContext(kantoJohtoMap);
const roster = [
  {
    id: 'player:human' as const,
    name: '사람',
    pokemonId: 'pokemon:0025' as const,
  },
  { id: 'player:ai' as const, name: 'AI', pokemonId: 'pokemon:0001' as const },
];
let state = initializeEconomy(
  createGame(context.map, roster, { seed: 1, legendary: {} }),
  context,
  'unique-new-session-id',
);

function submit(intent: EconomyIntent, commandId: string) {
  const result = dispatchEconomy(state, context, {
    sessionId: state.economy.sessionId,
    expectedRevision: state.economy.revision,
    commandId,
    playerId: state.activePlayerId,
    intent,
  });
  if (result.ok) {
    state = result.state; // 전체 스냅샷을 한 번 저장
    // events/presentations는 최초 성공만 발행. 재시도에는 빈 배열.
    if (
      !result.replayed &&
      verifyCommittedReceipt(state, context, result.receipt)
    ) {
      // 외부 ability는 이 영수증을 근거로 후속 처리 가능.
      // 채무가 남으면 승리판정을 보류한다.
      // !result.receipt.debtPending이면 외부 승리 담당을 호출할 경계다.
    }
  }
  return result;
}

const available = getLegalActions(state, context, state.activePlayerId);
const choice = available.actions.find((a) => a.intent.type === 'roll-dice');
if (choice) submit(choice.intent, 'session-command-1');
// UI와 AI 모두 이후의 legalActions에서 선택한다.
// 건설 목표는 legalActions의 intent.targetStage로 명시 선택한다.
```

저장된 **동일 command envelope 전체**를 재시도해야 한다. 같은 ID에 expectedRevision/intent가 달라지면 duplicate-command-conflict다. 네트워크 재전달은 원래 envelope를 보관하고, 새 선택에는 새 ID와 최신 revision을 쓴다. 재시도 검사는 revision/현재 차례/게임종료 검사보다 먼저 실행한다. 다른 session은 먼저 거부한다.

### 견적과 AI 계약

- `Quote`는 quoteId/revision/profileVersion/catalogVersion/landingId/tileId/fromStage/toStage, lineItems, landSubtotal/upgradeSubtotal/gross/discount/total, balanceAfter/shortfall/consumesBlessing/modifierIds/eligible/reasons를 반환한다.
- 기존 부지·시설은 `alreadyOwned:true, amount:0` 참고 행으로 남긴다. 필수 prefix를 제외하는 입력 자체가 없다. 견적 금액/quoteId를 dispatch의 승인 증거로 받지 않고 매번 재산출한다.
- `expectedCost`는 그 행동의 현금 지출, `expectedRevenue`는 그 행동의 현금 유입(은행매각)이다. `quoteToll`은 지정 payer의 예상 지출이며 소유자의 수입은 해당 total이다. 확률·도착분포·전략효용을 추정하지 않는다. `assetValue`는 현금+보유자산 은행매각가다.
- 잘못된 tile/target/저장/context는 quote 함수가 RangeError를 던진다. 해금/위치/잔액 부족 등 합법성은 `eligible:false,reasons`로 표현한다. `dispatchEconomy`는 예외를 오류 전이로 바꾸며 원본 참조와 빈 이벤트/연출을 반환한다. `getLegalActions`는 잘못된 상태/비활성/타인/종료에 빈 목록을 반환한다.
- getLegalActions는 disabled 견적을 넣지 않는다. UI가 잠금 설명을 원하면 quoteConstruction을 직접 조회한다. legal 목록의 어떤 선택도 저장 상태나 RNG를 변경하지 않는다.

### 외부 ability 입력

`createEconomyContext(board, profile, modifiers)`의 `EconomyModifier`는 `{id,kind:'upgrade'|'toll',playerId,tileId?,multiplierBps}`다. 신뢰하는 세션 조정자가 입력하고 사용자 command에서 받지 않는다. 0..100000 basis points를 검증한다(10000=1배). id 순으로 적용하고 각 modifier 이후 내림한다. 그 뒤 전설 가호를 한 번 적용한다. 건설 modifier는 신규 시설 합계만 조정하며 부지/관광/인수/매각은 제외한다. 영수증의 quote에는 적용 id와 계산 결과가 남는다.

`verifyCommittedReceipt(state,context,receipt)`는 현재 세션 저장 ledger와 영수증 전체가 일치하는지 검사한다. 암호서명이나 외부 저장의 진위를 보장하는 기능은 아니다. ability 후속 처리도 sessionId+commandId로 중복방지해야 한다. 현재 modifiers는 세션 고정 계약이며, 진행 중 능력 발동으로 modifier 구성을 교체하는 시스템 명령/마이그레이션은 후속 합성이 필요하다. 구체 ability 구현에 의존하거나 부가효과를 임의 소비하지 않는다.

## 원자성·착지·채무 순서

1. 전체 저장/context 검증 → 세션과 중복 ID → revision/actor → intent 검증.
2. roll/시험/비행은 기존 dispatchCore를 훅 없이 임시 실행. `start-rewarded.passes`로 개인 바퀴를 먼저 늘리고 `tile-landed`로 방문 토큰을 생성한다. 글로벌 turnNumber는 해금에 쓰지 않는다. 보상0도 passes를 반영하고 비행/시험대기는 바퀴가 늘지 않는다.
3. 경제 착지는 dispatcher 내부에서 한 번 처리한다. START/special은 결정 완료, 관광/도시는 선택 가능. 비행 목적지도 실제 새 방문이다. 애니메이션 완료나 이벤트 구독에서 별도 정산하지 않는다.
4. 타인 소유면 통행료를 먼저 이체하거나 pendingDebt로 고정한다. 채무 중에는 부분이체가 없고 매각/파산만 가능하다. 충분해지는 마지막 매각과 채무 지급·가호소비를 한 전이로 확정한다. 자산 전체로도 부족하면 자동청산한다.
5. 새 가호 상태는 `quoteBlessing` 반환값의 legendary만 현재 거래 상태에 병합한다. 금액/소유/방문/다른 확장필드를 이전 전체 상태로 덮지 않는다. 실패·견적·취소에는 소비하지 않는다. rate0 양수는 소비, 원청구0은 미소비, 100%할인은 소비한다.
6. 모든 검증 후 revision+1/receipt/ledger/events를 함께 반환한다. 기존 `legendary`와 알 수 없는 최상위 확장정보도 spread로 보존한다. 새 session ID 없이 ledger를 잘라내면 중복방지가 깨지므로 전체 세션 이력을 저장한다.

현재 칸을 매각하면 같은 방문 재매입이 막힌다. 다른 칸 매각은 현재 방문 선택권을 유지한다. 건설·구매·인수·패스 중 하나를 쓰면 같은 방문의 추가 부동산 결정은 거부한다. 센터 인수는 새 소유자의 현재 방문 순번으로 재방문 기준을 초기화한다.

## 연결 경계와 한계

경제 dispatcher를 roll/end/trial/fly까지 **유일한 진입점**으로 사용한다. HookEffect는 가호 확장을 전달하지 못하므로 onLand와 병용하지 않는다. 외부 코드에서 core.dispatch를 먼저 확정하고 다시 경제 dispatcher를 호출하는 방식도 사용하지 않는다. 외부 이동 이벤트를 임의 주입하는 resolveLanding API는 제공하지 않는다.

경제가 활성화된 무소유 새 게임과 그 전체 JSON 저장만 지원한다. 기존 holdings 저장에서 바퀴수/방문/센터 시점을 역산하는 마이그레이션은 없다. configurationKey는 전체 맵/가격/프로필/modifiers 값에 바인딩되어 값이 바뀐 context를 거부한다. 정책 변경은 새 세션 또는 명시적 후속 마이그레이션이 필요하다.

승리 판정기·실제 AI 전략·UI/integration 연결은 구현하지 않았다. 확정 receipt의 ownershipChanged와 debtPending, 최종 players/holdings를 외부 승리 담당이 소비할 수 있다. 채무 도중에는 승리를 판정하지 않는다. 파산 시 경제 dispatcher는 현재 코어의 내부 end-turn을 호출해 다음 생존자로 넘긴다. 승리 담당은 반환된 확정 스냅샷에서 finished/victory를 설정하고 이후 추가 행동을 막아야 한다. 승리 판정을 내부 차례이동보다 앞에 넣는 최종 통합은 coordinator 담당 경계다.

관광 소유는 holdings level0, development 없음이다. 도시 소유는 holdings와 development의 1:1 대응을 검증한다. 아트 연결은 holdings 유무로 미소유/소유를 먼저 구분하고 development.stage/facilities와 context.properties의 finalFacilityKey를 전달한다. 기존 통합 UI를 바꾸지 않았으므로 이 브랜치만으로 완성 게임이 되지는 않는다.
