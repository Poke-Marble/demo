# 컴퓨터 전략 planner / executor 인계

planner·executor와 검증용 fixture의 공개 계약이다. 실제 게임 연결은
`src/ui/game/integration/adapter.ts`를 참고하고, 검사 명령은
[개발 안내](maintenance.md)를 따른다.

## 1. 공개 진입점과 책임

| 파일                       | 공개 함수 / 타입                                                              | 책임                                                         |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/game/ai/contracts.ts` | `Snapshot<Action>`, `Candidate<Action>`, `Estimate`, `Collection`, `STANDARD` | AI 자체의 작은 입출력 계약. 기존 공통 contracts와 별개       |
| `src/game/ai/planner.ts`   | `rankCandidates(snapshot, seed)`, `plan(snapshot, seed)`                      | 순수 평가. 순위·점수·이유 반환, 후보 없으면 `null`           |
| `src/game/ai/executor.ts`  | `createExecutor(host, options)`, `shouldBlockHumanInput(...)`                 | 비동기 대기·명령 전달·실행 경계 관리                         |
| `src/game/ai/adapter.ts`   | `AuthorityPort<Action>`, `createCandidateAdapter(port)`                       | 미래 경제 권위의 후보/견적을 매핑하는 예제 bridge            |
| `src/game/ai/harness.ts`   | `runSimulation(seed = 42)`                                                    | 사람 1명은 건드리지 않고 컴퓨터 3명의 스크립트 시나리오 실행 |

의존성은 이 폴더 내부뿐이며 런타임 외부 패키지는 없다. `Action`은 외부가 발행한 opaque payload이다. planner는 입력 후보와 action의 **원래 객체**를 반환하며 새 게임 명령을 합성하거나 잔액·소유권·주사위·RNG를 변경하지 않는다. `diceResult`는 이미 공개된 결과를 기록하는 선택 필드이며 점수 계산에도 사용하지 않는다. seed는 동점 정렬에만 쓰이고 core RNG seed와 독립이다.

## 2. 입력과 금액의 출처

`Snapshot`은 세션 세대 `session`, 차례 식별자 `turn`, 매 명령 후 바뀌는 `revision`, 활성 플레이어, 공개 controller/파산 상태, 활성 플레이어의 정확한 `cash`와 미납 `debt`, 공개 부동산 소유 현황, 그룹/라인/4명소 집합, 합법 후보를 받는다. `turn`은 같은 플레이어의 다음 차례에도 반드시 바뀌어야 한다. 재시작에는 재사용하지 않는 session을 발행한다. 스냅샷은 불변이며 후보와 같은 revision에서 원자적으로 투영해야 한다.

`Candidate`의 필수 필드는 `id`, `kind`, `action`, `quote: { debit, credit }`이다. 후보 ID는 같은 revision 내 유일하고 입력 배열 순서와 무관하게 안정적이어야 한다. `targetId`는 공개 부동산 ID이다. kind는 `roll / buy / build / takeover / sell / pay-debt / bankrupt / end-turn / pass / trial / rope / fly`이다. pay-debt는 **남은 미납금 전체 납부**를 뜻한다. 분할 상환은 이 버전의 계약에 없다.

금액과 판단 출처를 다음처럼 구분한다.

| 필드                                         | 출처 / 의미                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash`, `debt`, `quote.debit/credit`         | 외부 경제 권위의 정확한 현재 잔액·미납금·실제 견적. AI 추정 금지                                                                               |
| `expectedToll`                               | 외부가 제공한 향후 위험 금액. `{value, source:'authority'\|'heuristic'}`로 출처 표시                                                           |
| `outlook.income`                             | 향후 통행료 등 수익의 추정 효용. 시간 범위는 adapter가 모든 후보에 일관되게 적용                                                               |
| `outlook.tollExposure`                       | 해당 후보의 추가 예상 지출/위험 금액                                                                                                           |
| `outlook.assetLoss`                          | 매각 시 포기하는 장기 자산 효용. 없으면 매각 credit을 손실 대용치로 사용                                                                       |
| `outlook.destinationValue`                   | 비행 도착 후 구매 기회·안전·진척 등을 외부가 평가한 효용. 도착 시 구매 명령을 자동 생성하지 않음                                               |
| `outlook.trialSuccessProbability`            | 외부가 제공한 공개 시험 성공 확률 0..1. 숨겨진 다음 주사위 값 금지                                                                             |
| `outlook.trialReward/lostTurnCost/ropeValue` | 시험 보상·기회비용·로프 보존 효용. 없으면 아래 전략 기본치 사용                                                                                |
| `outlook.blocksImmediateMonopoly`            | 공개 상태와 현재 합법 기회로 상대의 즉시 독점/승리를 막는다고 adapter가 판단한 불리언. 부동산 하나만 남았다는 이유로 즉시 완성을 추정하지 않음 |

Estimate의 source는 출처를 표시한다. 값의 신뢰도를 자동 보정하지 않으며 수익 누락=0, 추가 위험 누락=0이다. 따라서 adapter가 누락을 무위험으로 오해하지 않도록 견적/위험을 채워야 한다. 성공확률 누락=0(보수적). 음수/NaN/무한 견적·추정, 중복 후보/부동산/플레이어 ID, 잘못된 집합과 확률은 예외로 거부하며 executor는 `failed`로 종료한다. cash는 음수 공개 잔액도 받아 채무 입력을 표현할 수 있다.

**합법성은 항상 외부 권위가 최종 판단한다.** planner의 안전여유 필터는 전략 선택일 뿐 구매·건설 잠금, 인수 면역, 로프 개수, 시도 횟수, 비행 가능 타일, 파산 가능성, 채무 시 행동 제한, 승리 판정의 구현이 아니다. 외부는 동일한 후보 생성기를 사람과 컴퓨터에 사용해야 한다. 모든 합법 선택적 투자가 안전여유 필터에서 빠지고 pass/end도 없다면 `no-candidate`로 멈춘다. 이때 임의의 종료·매각·파산 명령을 만들지 않는다.

## 3. 구현된 전략 수치와 미확정 기획

시작 난이도는 `STANDARD.difficulty = 'standard'` 하나로 고정했다. 아래는 **신규 코드에 구현된 AI 휴리스틱**이며 게임 경제 가격이나 확정 기획 규칙이 아니다. 금액 효용은 현재 프로젝트의 화폐 단위를 따른다. 최종 경제 스케일에 맞춘 재조정은 통합 후 필요하다.

| 항목                    | 구현값 / 평가                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------- |
| 구매/건설/인수 안전여유 | 결제 후 잔액 ≥ `max(150, expectedToll × 1.5)`; 채무 중 투자 제외                      |
| 투자 기본점수           | `20 + income × 2 − debit × 0.25`                                                      |
| 그룹                    | 획득 후 소유 비율 × 100, 완성 +450                                                    |
| 라인                    | 획득 후 소유 비율 × 120, 완성 +650                                                    |
| 4명소                   | 획득 후 소유 비율 × 140, 완성 +900. 정확히 4개의 공개 ID 필요                         |
| 상대 즉시 독점 방어     | 외부 확인 플래그가 있는 buy/takeover/fly에 +500. 안전여유를 무시하지 않음             |
| 매각                    | 완성 집합 파괴/기존 진척/자산 손실/과도한 초과 현금 확보에 감점; 자발적 매각은 -10000 |
| 채무                    | 전체 납부 > 매각 > 파산의 별도 우선순위. 큰 화폐 단위로도 파산 우선 역전 방지         |
| 시험                    | `공개확률 × 보상(기본180) − 잃는 턴 비용(기본80) − debit`                             |
| 로프                    | `−로프 보존가치(기본100) − debit`                                                     |
| 비행                    | `destinationValue + income × 2 − debit`; 모든 후보의 tollExposure만큼 추가 감점       |
| 일반 진행               | roll 10, pass/end-turn 0. 현재 합법 후보에 있는 경우만 고려                           |

집합 점수는 buy/takeover/sell에만 적용한다. build는 수익 전망과 비용으로 평가한다. 여러 집합에 속한 타일은 각 점수를 더한다. 그룹 완성 개수 3개라는 실제 승리 조건은 이 planner가 판정하지 않는다. 비행은 외부가 제공한 목적지 효용을 비교하고 도착 후 **새 합법 후보**로 다시 판단한다. 상대 자금이나 다음 주사위를 추측하여 불법 인수를 만들어내지 않는다.

채무 매각 점수는 `10000 + min(매각대금, max(0, debt−cash)) − assetLoss − max(0, 매각후cash−debt)×0.1`에 집합 파괴 감점을 더한다. 다단계 최적 청산 탐색은 아니며 매각할 때마다 외부가 갱신한 후보로 다시 계획한다.

동점은 `FNV-1a(JSON.stringify([seed, turn, activePlayerId, candidateId]))`의 uint32 오름차순, 해시 충돌이면 ID의 코드 단위 사전순이다. locale/배열순서/현재시간/Math.random에 의존하지 않는다. 동일 공개 입력·seed면 재현되며 다른 seed는 동점에서만 영향을 준다.

**미구현 기획 제안:** 최종 경제 단위별 안전여유 조정, 상대별 전략 성향, 여러 턴의 확률 탐색, 실제 승리 평가기와의 시너지, 로프 비축 정책, 실제 보드 승률/파산율 튜닝. 현재 기능이나 통합 완료로 간주하지 않는다.

## 5. 연결 예제 (기존 UI 수정 없이 제공하는 조립 방법)

아래 `port`, `ui`는 통합 담당이 제공할 변수다. 새 경제 API 이름을 가정하거나 미존재 모듈을 import하지 않는다. 구체적인 bridge는 `adapter.ts`, 실행 가능한 대역은 `harness.ts`에 있다.

```ts
import { createCandidateAdapter } from '../game/ai/adapter.ts';
import { createExecutor, shouldBlockHumanInput } from '../game/ai/executor.ts';
import type { AuthorityPort } from '../game/ai/adapter.ts';

// Action은 최종 경제/시험 dispatcher의 실제 합법 payload 타입.
function connect<Action>(
  port: AuthorityPort<Action>,
  ui: {
    waitUntilUnlocked(signal: AbortSignal): Promise<void>;
    present(payload: unknown, signal: AbortSignal): Promise<void>;
    thinkingDelay(signal: AbortSignal): Promise<void>;
    presentationBusy(): boolean;
  },
) {
  const adapter = createCandidateAdapter(port);
  const executor = createExecutor(
    {
      ...adapter,
      delay: (signal) => ui.thinkingDelay(signal),
      awaitPresentation: async ({ receipt }, signal) => {
        if (receipt) await ui.present(receipt.presentation, signal);
        await ui.waitUntilUnlocked(signal);
      },
    },
    { seed: 42, maxActions: 32 },
  );
  return {
    runComputerTurn: (signal: AbortSignal) => executor.run(signal),
    cancel: executor.cancel,
    humanInputBlocked: () =>
      shouldBlockHumanInput(
        adapter.read(),
        executor.busy,
        ui.presentationBusy(),
      ),
  };
}
```

경제 adapter 매핑 예: 외부 legal `buy-city` → kind `buy`, `upgrade-facility` → `build`, 외부 인수/매각/전체채무정산/파산 → 각 kind, 기존 `attempt-trial/use-escape-rope/fly` → `trial/rope/fly`. 이는 이름 대응 설명이며 현재 core에 해당 경제 명령을 보내는 구현이 아니다. 시험 실패 후 이미 이번 턴 시도했다면 외부는 재시도 후보를 주지 않고 현재 합법 rope/end만 준다. fly 후보는 `legalFlyDestinations` 결과에 대해서만 외부가 발행한다. 투자 quote는 할인 반영 후 확정 금액으로 보내며 할인 소비 상태는 authority에서 같은 거래로 확정한다.

`publicSnapshot()`과 `legalQuotedCandidates()`는 동일한 동기 읽기 트랜잭션이어야 한다. 비동기 조회가 필요하면 authority가 원자적 DTO를 먼저 저장하고 이 포트에서 그 DTO만 반환한다. 후보 객체/행동 payload는 발행 후 변경하지 않는다. 프레임워크 구독/재렌더는 이 모듈 밖의 책임이며 시뮬레이션의 즉시 완료 callback을 실제 UI에 복사하면 안 된다.
