# 주사위·걸음 피드백

기준은 `main bde04c3`의 통합 데모다. 변경 범위는 `src/ui/game/feedback/**`, `src/ui/game/index.ts`, 이 문서, `feedback-preview.html`이다. core 상태, 시드/RNG, 주사위 결과, 경제·승리·시험 판정, 특수 이벤트 presenter/CSS, 전설 에셋은 수정하지 않았다. 워크트리 및 상위 경로와 내부에서 적용할 AGENTS.md는 발견되지 않았다.

`../feat-starter-abilities/src/ui/game/abilities/audio.ts`는 읽기 전용으로 참고했다. 해당 모듈을 import/복사/수정하지 않는다. 외부 음원, 공식 효과음, 유료 API, 진동은 사용하지 않는다.

## 표현 순서와 수명

- 구독 콜백에서 즉시 입력을 잠근다. Promise 큐 진입 전 `host.inert`와 `animating`을 설정하며, 대기 중인 피드백 수를 따로 유지해 연속된 컴퓨터 update 사이에도 잠금이 풀리지 않는다. 행동 버튼·invoke·자동 컴퓨터 실행·프롬프트도 잠금을 확인한다. 음소거·볼륨은 별도 형제 노드이므로 연출 중에도 조절할 수 있다.
- `dice-rolled.values`를 그대로 받아 Canvas2D로 **640ms** 흔들림·회전·통통 튀기를 표현한다. 마지막 약 115ms는 확정된 눈으로 정지한다. 중간 눈은 경과시간에서만 산출한다. 게임 RNG와 `Math.random`은 호출하지 않는다.
- 굴리는 동안 보드/HUD는 `굴리는 중…`을 표시한다. 주사위 기록과 확정 숫자는 연출 후 공개한다. 이동 토큰은 연출 전에 기존 위치로 고정하고 이후 기존 230ms 칸별 이동을 실행한다. 상태를 롤백하거나 결과를 다시 계산하지 않는다. 다른 상태 정보까지 과거 스냅샷으로 숨기는 기능은 아니다.
- `walkingPath`는 보드 순서상 다음 칸인 유효 waypoint만 허용한다. 시작칸·연속 중복·제자리를 제외하고 한 이동 단계에 1회 소리를 낸다. 비인접 순간이동 및 `fly` 효과에는 발소리를 내지 않는다. 이동 거리를 주사위 합으로 다시 만들지 않는다.
- 사람·컴퓨터 모두 같은 update 경로다. 세션 내 update ID를 수신 시점에 차단하므로 복제 객체 재전송도 기록/Canvas/발소리를 반복하지 않는다. ID가 없으면 동일 update/event 객체만 중복 제거할 수 있다. **ID 없는 복제 재전송을 구별할 수 없으므로 어댑터는 안정적인 고유 ID를 제공해야 한다.** setup에서 이전 세션 기록을 비우고 해당 setup의 ID는 보존한다.
- Canvas와 오디오 UI는 `host.replaceChildren()` 밖에서 유지한다. 활성 Canvas에만 rAF를 예약하며, 종료하면 예약과 음성 노드를 정리한다. reset/destroy는 진행 중 Promise도 해제한다. destroy는 제스처/미디어쿼리/visibility 리스너와 AudioContext까지 정리한다.
- reduced motion이면 주사위 연출·칸별 이동·발소리를 생략하고 확정 상태를 즉시 표시한다. 실행 중 reduced motion 전환이나 숨겨진 탭은 Canvas와 SFX를 취소하고 남은 이동음을 재생하지 않는다. 이미 대기 중인 이동 타이머는 최대 230ms 뒤 끝난다. 프리뷰의 스킵/초기화도 대기 타이머를 해제한다.

## 공개 SFX 버스와 특성 연결 계약

`feedback/audio.ts`는 `SfxBus`, `SfxSettings`, `createFeedbackAudio()`를 공개한다. `mountGameUI(root, adapter, { sfx })` 또는 `createGameplayFeedback(root, sfx)`로 주입할 수 있다. 생략하면 자체 버스를 만든다. **주입한 버스의 수명 소유권은 마운트된 게임 UI에 넘긴다.** 한 게임당 하나를 만들고, 하위 특성 어댑터는 빌려 사용하며 직접 destroy하지 않는다.

| API                                       | 계약                                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unlock(): Promise<boolean>`              | 최초 실제 pointerdown/keydown 캡처에서 직접 호출한다. await 이전에 AudioContext 생성·resume을 시작한다. 실패는 false이며 게임 진행을 막지 않는다. 후속 실제 제스처에서 재시도할 수 있다. |
| `getSettings()`                           | `{ muted, volume }` 복사본. volume은 0~1, 기본 0.35다.                                                                                                                                   |
| `setMuted(boolean)` / `setVolume(number)` | 즉시 활성 음성을 중지하고 설정을 저장·구독자에게 전달한다. volume은 0~1로 제한하고 비유한 값은 0으로 처리한다.                                                                           |
| `subscribe(listener)`                     | 현재 설정을 즉시 전달하고 이후 변경마다 전달한다. 반환 함수로 구독을 해제한다.                                                                                                           |
| `play('dice' \| 'step')`                  | running 상태에서만 자체 합성한다. 음소거/볼륨 0/탭 숨김/해제 실패면 조용히 생략한다.                                                                                                     |
| `stop()`                                  | 모든 활성 주사위·걸음 음성과 연결을 즉시 정리한다. 설정은 보존한다.                                                                                                                      |
| `destroy()`                               | stop, 구독 해제, 버퍼 해제, AudioContext.close. 이후 재생/해제는 무시한다.                                                                                                               |

설정은 같은 origin의 localStorage `pm:sfx:v1`에 저장한다. 저장소 오류는 무시하고 메모리 설정으로 동작한다. 다른 포트는 다른 origin이므로 설정을 공유하지 않는다. 여러 열린 탭의 실시간 설정 동기화는 제공하지 않는다.

권장 특성 연결 방식은 **주입 + 설정 구독**이다. 다음은 계약 예시이며 미병합 특성 파일을 런타임에 import하는 코드가 아니다.

```ts
// 상위 조립부에서 한 번만 생성하고 게임 UI에 수명을 맡긴다.
const sfx = createFeedbackAudio();
const release = sfx.subscribe(({ muted, volume }) => {
  abilityAudio.setMuted(muted);
  abilityAudio.setVolume(volume * 0.35); // 참고 모듈의 상한에 맞춘 변환
});
// 아래 핸들러는 실제 사용자 제스처 안에서 호출되어야 한다.
const unlockBoth = () => {
  void sfx.unlock();
  void abilityAudio.unlock();
};
// 상위 stop/reset은 sfx.stop()과 abilityAudio.stop()을 함께 호출한다.
// 하위 해제: release(), 제스처 리스너 제거, abilityAudio.destroy().
// 게임 UI destroy만 sfx.destroy()를 담당한다.
```

향후 특성 음성까지 같은 AudioContext/동시음 상한에 포함하려면 특성 합성기를 버스의 주입 가능한 voice 공급자로 확장하는 별도 변경이 필요하다. 현재 버스의 `play`에는 특성/전설시험 cue를 임의로 추가하지 않았다. 위 어댑터는 공용 음소거·볼륨을 공유하되 별도 특성 컨텍스트까지 자동으로 소유하거나 종료하지 않는다.

주사위는 저역 필터를 거친 절차적 noise와 sine/envelope로 5회의 감쇠 타격을 합성한다. 걸음은 75ms의 작은 sine/noise 타격이며 좌우 느낌을 위해 두 주파수를 번갈아 쓴다. noise는 자체 고정 수열로 한 번 생성해 재사용한다. 최대 4음성/8 source이며 초과 시 가장 오래된 음성을 중지한다. 최대 사용자 볼륨에서도 envelope peak는 주사위 0.085, 걸음 0.045로 제한한다. 실제 기기의 청감상 크기까지 보장하는 수치는 아니다.

## 실행 및 검증

5176 미사용을 `Get-NetTCPConnection`으로 먼저 확인했다. 현재 이 워크트리의 Vite를 다음 명령으로 실행한다. 기존 5173 통합 데모나 다른 pane/워크트리는 수정·제어하지 않는다.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort
```

- 독립 프리뷰: <http://127.0.0.1:5176/feedback-preview.html> — 굴리기/7칸 이동, 두 소리 직접 듣기, 음소거/볼륨, 스킵/초기화.
- 같은 소스의 실제 통합 데모: <http://127.0.0.1:5176/>.
- 프리뷰 번들: `node src/ui/game/feedback/build-preview.mjs` → `dist/feedback-preview/feedback-preview.html`.

검증 환경은 Windows, Node v22.17.0, 로컬 Google Chrome headless다. 자동 검증 코드와 작은 단위 테스트 더블을 구분해 저장했다.

```powershell
npm run typecheck
npm run lint
npm run build
node src/ui/game/feedback/build-preview.mjs
$tests = @(rg --files src -g '*.test.mjs' -g '*.test.ts')
node --experimental-strip-types --test @tests
npx prettier --check src/ui/game/index.ts src/ui/game/feedback feedback-preview.html docs/gameplay-feedback.md
# 선택적 브라우저 도구는 ignored artifacts 안에 설치한다.
npm install --prefix artifacts/browser-tools --no-package-lock --no-save playwright
node src/ui/game/feedback/browser-check.mjs
```

2026-11-19 검증 결과:

- typecheck, lint, 통합 build, 독립 프리뷰 build 통과. 전체 Node 테스트 **72/72 통과**, 그중 새 피드백 테스트 3개. 처음 `--experimental-strip-types` 없이 실행한 전체 검증은 기존 .ts import를 로드하지 못했고, 올바른 옵션으로 재실행해 통과했다.
- 실제 Chrome의 dev 통합 데모에서 시작 → 주사위 → 7칸 이동을 확인했다. dev 독립 프리뷰와 **두 프로덕션 번들**도 각각 주사위 1회/걸음 7회가 관측되었다. 프로덕션 화면 검증용 서버는 테스트가 임시 로컬 포트에서 생성하고 종료한다.
- 통합 UI에 제어된 update를 전달하는 fixture에서 동기 입력 잠금, 확정 텍스트/로그 지연, 시작/중복 waypoint 제외, 동일 Canvas 객체 유지, 복제 update ID 차단, 사람·컴퓨터 처리, 제자리·비인접 이동의 걸음 0회, reset/destroy를 확인했다. 컴퓨터 전체 AI 전략을 검증한 것은 아니다.
- reduced motion의 즉시 확정/무음, 390px 화면 가로 넘침 없음, 음소거와 볼륨의 새로고침 유지, 스킵 후 추가 걸음 없음, AudioContext 생성 실패 후 게임 입력 잠금 해제를 확인했다.
- 숨김 정리는 Chrome 안에서 `document.hidden`과 visibilitychange를 **모사**해 연출 중 취소를 검사했다. 실제 OS 탭 전환·백그라운드 절전 동작은 직접 검증하지 않았다.
- 브라우저 오류 0건. AudioContext **running**, 합성 source 생성, analyser에서 **0이 아닌 PCM peak**를 확인했다. 직접 스피커/헤드폰으로 청취하지 않았으므로 청감·장치 출력 성공은 미검증이다.

실행 증거는 ignored 로컬 `artifacts/gameplay-feedback/`에 있다. [브라우저 보고서](../artifacts/gameplay-feedback/browser-report.json), [전체 테스트 로그](../artifacts/gameplay-feedback/tests.log), [실제 통합 굴림 화면](../artifacts/gameplay-feedback/real-integrated-roll.png), [도착 화면](../artifacts/gameplay-feedback/real-integrated-arrival.png), [독립 프리뷰](../artifacts/gameplay-feedback/preview-rolling.png), [390px/reduced 화면](../artifacts/gameplay-feedback/integrated-mobile-reduced.png), 두 `production-*.png`를 생성했다. PNG를 열어 주사위 가독성·위치, 기존 보드 보존, 모바일 배치를 시각 확인했다. 이 증거는 로컬에 보존하며 커밋에는 재현 스크립트를 포함한다.
