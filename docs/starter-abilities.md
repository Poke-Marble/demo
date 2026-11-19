# 스타팅 특성: 독립 발동 모듈과 연출 프리뷰

담당 `feat/starter-abilities`, 공통 기준 `main bde04c3`. 구현은 `src/game/abilities/**`, `src/ui/game/abilities/**`, `ability-preview.html`, 본 문서 안에만 있다. 조상 경로와 저장소에서 AGENTS.md를 검색했으며 발견되지 않았다. 기존 contracts/core/index/events/adapter/integration, 설정, lockfile은 수정하지 않는다. 새 에이전트, 다른 작업 pane 제어, 병합, push, 배포를 수행하지 않는다.

## 원작 사실과 자체 각색

아래 이름은 **기술(move)이 아니라 특성(Ability)** 이다. 한국 공식 도감에서 종과 특성 이름을 확인했다(2026-11-19). 잎·불꽃·물결·번개는 자체 생성 연출이며 공식 기술을 재현하거나 공식 음원을 사용하지 않는다.

| 종       | 원작 특성       | 검증 출처                                                    |
| -------- | --------------- | ------------------------------------------------------------ |
| 이상해씨 | 심록 / Overgrow | [한국 공식 도감](https://pokemonkorea.co.kr/pokedex/view/1)  |
| 파이리   | 맹화 / Blaze    | [한국 공식 도감](https://pokemonkorea.co.kr/pokedex/view/6)  |
| 꼬부기   | 급류 / Torrent  | [한국 공식 도감](https://pokemonkorea.co.kr/pokedex/view/12) |
| 피카츄   | 정전기 / Static | [한국 공식 도감](https://pokemonkorea.co.kr/pokedex/view/37) |

종별 영문 특성 대조: [Bulbapedia 종별 특성 목록](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_Ability). 원작에서 HP·기술·접촉 등에 관계하는 특성을 이 보드게임의 돈과 연결한 것은 **Poke Marble 자체 각색**이다. 건설 할인·통행료·보너스는 원작 사실이 아니다.

## 구현된 초안 수치와 기획 비교

아래는 `draftConfig`의 실행 가능한 초기값이다. 확정 밸런스가 아니며 `AbilityConfig`를 호출마다 주입한다. 금액은 경제 모듈이 정할 최소 정수 화폐단위이다.

| 특성   | 실행되는 보드효과                   | 조건               | 배율 / 상한 / 턴 제한 | 확정거래 200 예 |
| ------ | ----------------------------------- | ------------------ | --------------------- | --------------- |
| 심록   | 지불 건설비 사후 환급               | 거래 전 잔액 ≤ 500 | 15% / 60 / 1회        | +30             |
| 맹화   | 실제 받은 통행료의 추가 수입        | 거래 전 잔액 ≤ 500 | 15% / 60 / 1회        | +30             |
| 급류   | 실제 지불한 통행료의 사후 환급      | 거래 전 잔액 ≤ 500 | 20% / 60 / 1회        | +40             |
| 정전기 | 실제 받은 통행료에 따른 소액 보너스 | 잔액 조건 없음     | 5% / 20 / 1회         | +10             |

공개 설정은 `rateBps`(10000=100%), `cap`, `perTurn`, `balanceAtMost`(포함 경계, null이면 제한 없음). rateBps는 0~10000 정수, 나머지 수치도 안전한 비음수 정수만 허용한다. 환급은 다른 혜택 이후 `netCost`를 기준으로 하며 최소 1단위 실소모가 남는다. 실제 입력에서 netCost가 200보다 작으면 표의 환급 예와 달라진다.

**기획 가정/제안:** 심록은 저자본의 건설 선택을, 맹화는 소유지 수입을, 급류는 위험한 이동의 생존을, 정전기는 잔액과 무관한 작은 수입을 강조한다. 맹화와 정전기는 같은 거래에 대한 보상 크기와 발동 조건이 다르다. 통행료 발생 빈도가 낮으면 정전기가 약해지고, 건설 기회가 많으면 심록이 우세해질 수 있다. 500 임계값과 기본 투자금의 비율, 전체 라운드의 건설/통행료 기회 수, 파산률·게임 길이·승률을 경제/전략 모듈 연결 후 비교해야 한다. 3종 저잔액 조건을 원작 HP 1/3에서 직접 환산한 것으로 해석하면 안 된다.

건설 전 견적으로 즉시 할인해 지불 가능성을 바꾸는 방식은 아직 구현하지 않았다. 현재 모듈은 외부 **확정거래에만** 반응하므로 돈이 모자란 건설을 가능하게 하지 않는다. 건설비 절감을 안전한 사후 환급으로 시연한다.

## 공개 입력·출력 계약

코드 진입점: `src/game/abilities/activation.ts`. 아직 없는 경제 모듈을 import하지 않는다. 문자열 ID를 사용하므로 기존 계약의 문자열 ID와 연결 가능하며 공통 GameEvent 유니언은 변경하지 않았다.

```ts
interface AbilityActivation {
  readonly id: string; // 원거래 ID + playerId + abilityId의 안정적인 식별자
  readonly playerId: string;
  readonly pokemonId: string;
  readonly abilityId: 'overgrow' | 'blaze' | 'torrent' | 'static';
  readonly type: 'grass' | 'fire' | 'water' | 'electric'; // 연출 타입
  readonly amount: number; // 양수 보너스/환급 제안, 실제 지급 아님
  readonly description: string;
}
```

- `emptyLedger()` → 게임 세션별 새 ledger. `revision`, `latestTurn`, `consumed`, `usage`를 저장한다.
- `quoteAbility(ledger, request, config?)` → `AbilityQuote | null`. 입력·원장을 변경하거나 사용 횟수를 소비하지 않는다.
- `commitAbility(ledger, request, quote, config?)` → `{ ledger, activation } | null`. 최신 입력과 규칙으로 재견적하고 견적 전체를 비교한다. 함수 자체는 원장/경제 상태를 바꾸지 않는다.
- `request`: `abilityId`, `playerId`, `pokemonId`, `balanceBefore`, `transaction`.
- `transaction`: 고유 `id`, 전체 게임에서 단조 증가하는 `turn`, `status`, `origin`, `kind`, `payerId`, `payeeId`, 실제 정산된 `paid`, 다른 할인/환급 후 남은 `netCost`.
- `status`: settled/pending/reversed. settled만 허용. `origin`: base/ability. base만 허용. `kind`: construction/toll.
- 영수증 전체와 적용 규칙은 `requestKey`에 결합된다. 객체 프로퍼티 순서까지 같은 요청을 재사용하는 보수적인 계약이며 네트워크용 서명은 아니다. 신뢰 경계에서 정규화한 동일 request를 quote와 commit에 전달한다.

## 경제 담당 연결 요구사항

외부 경제 모듈이 영수증, 종/소유자, 잔액, 현재 턴과 장부를 검증해야 한다. 이 모듈은 브라우저 입력의 진위나 거래 권한을 인증하지 않는다.

1. 기본 투자금·기본 건설비·기본 통행료를 경제 모듈에서 계산한다. 기본 투자금 자체는 특성 거래가 아니다.
2. 가호/다른 할인/면제/미수금/파산 정산을 먼저 적용하고, **수취인이 실제 받은 기본 화폐**를 paid로 확정한다. 표시 금액이나 미납 청구 금액을 넣지 않는다. 건설은 은행 같은 별도 payeeId를 쓴다.
3. payer가 다른 보상까지 받은 뒤 남는 순소모를 netCost로 제공한다. `0 < netCost ≤ paid`가 필요하며 수입 특성도 순소모 0 거래를 거절한다. 추후 매각/취소에서 환급할 원금은 이미 받은 특성 환급만큼 줄여야 한다. 재판매·순환거래·공모까지 포괄하는 경제 차익 방지는 경제 담당 책임이다.
4. 잔액 임계는 기본 거래 **직전** 플레이어 잔액 기준이다. 기본 투자금 대비 임계 비율, 가호와의 순서, 이중 환급 가능 여부는 연결 전에 합의해야 한다. 현재 초안은 기본 거래→가호 정산→특성 환급/보너스 순서다.
5. 특성 계산은 `floor(basis × rateBps / 10000)` → cap → 환급이면 `netCost - 1` 상한. 중간 곱은 BigInt로 정확하게 계산한다. 전체 경제의 반올림과 원 단위를 맞추고 특성 뒤에 다시 배율을 곱하지 않는다.
6. 견적 시엔 소비하지 않는다. commit 성공 후 **ledger의 revision 비교·교체, 보너스 지급, activation outbox 저장을 하나의 원자적 트랜잭션으로** 반영한다. 실패 시 모두 미반영한다. 같은 옛 ledger를 두 번 commit하고 양쪽 결과를 지급하는 사용법은 금지한다.
7. 파생 지급은 `origin: 'ability'`로 표시하고 base 영수증으로 재입력하지 않는다. 세션에서 원거래 ID를 재사용하지 않는다. 취소/역정산은 이 모듈이 수행하지 않으며, 최종 확정 이후의 취소는 경제 모듈의 원장 보상 처리가 필요하다.
8. 전역 턴을 순서대로 처리한다. 같은 턴의 다른 플레이어 발동은 허용하되 이미 커밋한 턴보다 과거인 입력은 거절한다. 턴을 마음대로 올려 한도를 재설정하지 않는다.

동일 원거래/플레이어/특성은 세션 전체에서 한 번만 소비된다. 다른 거래도 플레이어/특성/턴별 perTurn을 넘을 수 없다. 0금액, 순소모 0, 자기송금, 다른 종, 틀린 수입/지출 역할, 파생 지급, 과거 턴은 거절한다. 동일 통행료에서 지급자의 급류와 수취인의 맹화가 각각 발동하는 것은 의도된 별개 효과다. 그 경우에도 양측 계산 기준은 동일한 특성 이전 영수증이어야 한다.

원장은 직렬화 가능하다. 게임 저장/불러오기 시 원장을 같이 저장하고 consumed를 임의 삭제하지 않는다. 원장과 프레젠터의 ID 집합은 세션 중 누적되므로 장시간 서비스에는 영구 거래 로그와 안전한 보존 정책이 필요하다.

### 연결 예시 (의사 코드)

아래 `economy`, `saveAtomic`, `activationOutbox`는 **필요한 연결의 예시**이며 존재하는 모듈을 가정한 import가 아니다. 실제 API가 정해지면 관리자/경제 담당이 어댑터에서 연결한다.

```ts
import { quoteAbility, commitAbility } from './src/game/abilities/activation';
import { createAbilityPresenter } from './src/ui/game/abilities/presenter';

// 상대 위치 컨테이너 위의 독립 Canvas + DOM HUD
const presenter = createAbilityPresenter(boardHost, {
  portraitUrl: (pokemonId) => existingPortraitLookup(pokemonId),
});
soundButton.addEventListener('click', () => void presenter.audio.unlock());
presenter.audio.setVolume(0.18);
presenter.audio.setMuted(false);

// 단일 게임의 직렬 reducer/원자적 저장 경계 내부
const request = mapTrustedFinalReceiptAndRoster(economy.finalReceipt);
const quote = quoteAbility(savedLedger, request, agreedConfig);
if (quote) {
  const result = commitAbility(savedLedger, request, quote, agreedConfig);
  if (result) {
    saveAtomic({
      expectedRevision: savedLedger.revision,
      ledger: result.ledger,
      money: economy.creditAbilityOnce(result.activation),
      activationOutbox: result.activation,
    });
    // 저장 성공 이후에만 outbox 소비; 연출 실패는 경제 지급을 재시도하지 않음
    presenter.enqueue(result.activation);
  }
}

// 화면 종료 시 호출
presenter.destroy();
```

## 독립 프레젠터와 사운드

`createAbilityPresenter(host, { portraitUrl?, onEnd? })`는 `element`, `enqueue`, `cancel`, `restart`, `destroy`, `audio`를 반환한다. host는 `position: relative`와 실제 크기가 필요하다. 외부 경제·이벤트 어댑터에 의존하지 않으며 Canvas는 투명 레이어다. HUD, 특성 이름, 설명, 초상화는 DOM으로 유지한다.

- 1.1초짜리 잎/불꽃/물결/번개, 타입색과 초상화 테두리 강조. 번개는 고정된 꺾은 선을 부드럽게 페이드하고 화면 전체 섬광은 사용하지 않는다.
- FIFO로 최대 16개(재생 중 포함), 같은 ID는 mount 수명 동안 중복 표시하지 않는다. enqueue가 false이면 outbox 전달 정책에 따라 재시도/생략한다. 금융 재커밋을 하지 않는다.
- `cancel()`은 현재와 대기를 모두 취소하고 ID 소비는 유지한다. `restart(activation)`은 큐를 비우고 해당 **연출만** 재시작한다. `onEnd` 이유는 finished/cancelled. 콜백은 예외를 던지지 않는 경량 관찰자로 제공한다.
- DPR 최대 3, ResizeObserver/창 resize, 첫 rAF에서 크기 재계산. reduced-motion은 입자·이동 없이 정적인 링의 완만한 페이드로 바꾼다.
- 첫 rAF에서 오디오 시작과 시각 타이머를 함께 시작한다. 소리 활성화를 기다리느라 렌더를 멈추지 않는다. 백그라운드 탭·시스템 오디오 지연에 대한 샘플 단위 동기화는 보장하지 않는다.
- 클릭/키보드 버튼 이벤트에서 AudioContext를 생성/resume한다. oscillator + 자체 noise buffer + lowpass + envelope만 쓴다. 기본 사용자 음량 0.18, 상한 0.35, 합성 gain에 추가 0.35 배율을 적용한다. 실제 출력 크기는 기기 음량에 따라 달라진다.
- 음소거/음량 변경은 현재 노드를 즉시 정리한다. AudioContext 미지원/resume 실패/재생 실패는 무음 처리한다. 오디오 재생은 경제 로직에 영향을 주지 않는다.
- 취소·교체·완료 시 노드 stop/disconnect, destroy 시 rAF 취소·큐 비우기·ResizeObserver 해제·resize listener 해제·이미지 콜백 해제·AudioContext close. 프리뷰는 pagehide/HMR에서도 정리한다.

## 프리뷰와 재현

개발 주소: **http://127.0.0.1:5174/ability-preview.html**. 시작 전 해당 포트의 listener가 없음을 확인했고 strictPort로 서버를 실행했다. 기존 5173 서버는 제어하지 않았다.

```powershell
npm ci
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort
```

프리뷰는 기존 관동·성도 32칸 실제맵의 이름을 읽기 전용으로 사용한 보드 배경이다. 기존 통합 UI 자체는 수정/복제하지 않았다. 4종 버튼, 음소거, 음량, 4종 동시 입력, 동일 거래 10회, 큐 취소, 마지막 연출 재시작, 언마운트/재생성이 있다. 각 새 거래는 테스트 전역 턴을 올린다. 실제 잔액·승리·컴퓨터전략은 연결하지 않았으며 모든 효과는 테스트 확정영수증에서 시연한다.

루트 기본 build에 새 HTML 엔트리를 추가하지 않으므로 독립 번들은 별도 생성한다.

```powershell
node src/ui/game/abilities/build-preview.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort --outDir src/ui/game/abilities/preview-bundle
```

두 서버를 같은 포트에 동시에 실행하지 않는다. bundle 출력 폴더는 검증 후 정리하며 로컬 소스에서 재생성 가능하다.

## 검증 결과와 한계

- npm ci: 성공, 취약점 0. 루트 package/lockfile 변경 없음.
- `node --experimental-strip-types --test src/game/abilities/activation.test.mjs src/ui/game/abilities/audio.test.mjs src/ui/game/abilities/presenter.test.mjs`: 12개 테스트 통과. 4종 견적, 중복 1000회, 직렬화 복구, 턴 한도, stale revision, 위조 견적, 입력·규칙 변경, 0소모/재귀 차단, 소수/비정상 화폐, 정확한 내림·상한, WebAudio unlock 실패 및 노드 정리를 검사한다. 프레젠터는 Vite 메모리 번들 + 모의 DOM으로 FIFO, 16개 큐 상한, 중복 억제, 취소/재시작, reduced-motion 링, resize, 언마운트/재생성의 rAF·관찰자·리스너 정리를 검증한다. 실제 브라우저 검증을 대체하지 않는다.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run format:check`: 전체 저장소 검사. 기본 앱 build와 독립 프리뷰 build 모두 성공.
- 개발 서버의 프리뷰 HTML 및 Vite 변환 preview.ts 요청은 각각 HTTP 200. 독립 번들 산출물은 HTML 0.45 kB, CSS 4.63 kB, JS 126.98 kB(초상화와 맵 포함)로 생성 성공 후 정리했다. 생성 스크립트는 소스와 함께 보존한다.
- 브라우저 시도: in-app browser는 `The browser access host is unavailable`, 네이티브 CUA는 최소화 창 상태 오류. computer-use 스킬의 Windows 대체 경로는 창 상태 조회 후 새 탭 입력에서 현재 URL 확신 부족으로 도구가 중단했다. 이후 UI 조작을 중단했다. **화면 렌더·실제 청취·모바일/DPR/reduced-motion·큐의 실브라우저 검증은 미완료**이다. 타입/번들/단위 테스트를 시각·청취 검증으로 간주하지 않는다.
- 금융 원자성은 외부 적용 전제다. 원장 롤백/리셋, 위조 영수증, 임의 턴 진행, 취소된 거래의 사후 보상, 매각 차익까지 이 모듈만으로 방지할 수 없다. 연결 담당은 위 경계를 반드시 지켜야 한다.

## 이용 조건

이 작업에서 새로 작성한 Canvas 절차형 시각효과와 Web Audio 합성효과는 유료 API·외부 음원·공식 게임 음원을 사용하지 않은 자체 생성 효과다. 이 효과 코드와 생성 결과물은 무료·비상업 프로젝트에서 사용·수정·재배포를 허용한다. 포켓몬 이름·브랜드와 기존 초상화의 권리까지 허여하는 것은 아니다.

프리뷰의 초상화는 기존 자산을 읽기 전용으로 재사용한다. 별도 권리/크레딧은 [기존 초상화 README](../src/ui/game/portraits/README.md), [라이선스 증빙](../src/ui/game/portraits/evidence/LICENSE.md)을 따른다. 전체 저장소의 다른 자산/소스 라이선스를 변경하지 않는다.
