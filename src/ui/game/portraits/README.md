# 플레이어 HUD portrait

`feat/special-event-ui`의 사람 1명 + COMPUTER 3명 HUD에 적용한다. 보드 이동말, 스타팅 선택 그림, 전설 VS 연출 파트너는 기존 이동/대기 스프라이트를 유지한다. 규칙·경제·실제 맵은 변경하지 않는다.

## 수집한 실제 파일과 출처

- 원본 안내: https://sprites.pmdcollab.org/
- 저장소: https://github.com/PMDCollab/SpriteCollab
- revision: `scripts/samples.json`의 기존 `1a294bec85e309d023c0b074617462c6c6b44a31`.
- `portrait/0001`, `0004`, `0007`, `0025`의 **개별 디렉터리 목록**, `credits.txt`, `tracker.json`의 `portrait_files`/`portrait_credit`를 대조했다. 전체 재귀 tree는 GitHub 응답이 truncated이므로 수집 근거로 사용하지 않는다.
- 각 종에 실제 존재하고 tracker가 확인한 `Normal.png`, `Happy.png`, `Joyous.png`, `Worried.png`, `Pain.png`, `Sad.png`, `Determined.png`, `Angry.png`, `Surprised.png`를 수집했다. 현재 네 종 모두 선택한 9개 감정의 누락은 없다. PNG IHDR 검사 결과 모두 **40×40** 단일 이미지다. 포맷이나 감정 파일명을 추측해서 렌더링하지 않는다.
- `manifest.json`: 36개 이미지별 원본 URL, SHA-256, 크기, 해당 감정을 담당하는 **CUR 크레딧만**, 개별 license 상태, 원작/팬 기여 분류 및 변경 내용을 기록한다. OLD 이력과 다른 감정의 크레딧은 사용 파일의 허가로 전용하지 않는다.
- `evidence/`: 네 종의 전체 portrait 크레딧·디렉터리 목록, 제작자 이름 목록, 정책 원문과 종별 tracker 발췌를 보존한다. tracker 발췌에는 원문 URL과 **전체 원문**의 SHA-256을 별도 `sourceSha256`에 기록했다. manifest의 해당 evidence 해시는 저장한 **발췌 파일**의 해시다.
- 이 폴더의 `.gitattributes`는 출처 파일의 줄바꿈 자동 변환을 막는다. 원본의 탭/후행 공백도 해시 근거이므로 포맷팅하지 않는다. 루트 Git 설정은 바꾸지 않는다.

선택한 36개 파일의 현재 제작자는 모두 **CHUNSOFT**, license 열은 **Unspecified**다. 원작 추출 자료로 분류했으며, SpriteCollab의 일반 CC BY-NC 정책을 원작 이미지의 개별 허가로 단정하지 않는다. 포켓몬 원 권리와 팬 기여 권리는 구분하며 원 권리자 이용 허락은 확인되지 않았다. 파이리 tracker의 secondary 팬 기여와 Special 감정의 CC 기록은 원문에 보존하되, 이번 Normal 등 9개 감정의 크레딧으로 섞지 않았다. 재배포/배포 허가 확인은 여전히 별도 작업이다.

원본 PNG는 수정하지 않았다. 화면의 `크레딧` 버튼에서 **파일별** 제작자·조건·출처를 볼 수 있다. 권리 안내가 초상화를 대신하거나 HUD 위에 상시 겹치지 않는다. 별도 자료가 상시 개별 표시를 요구하면 기존 `GameView.credits[].requiredInline` 계약을 유지한다.

## 표정 초안 매핑

아래 매핑과 기본 1,600ms 반응 시간은 조정 가능한 UI 가정이다. 금액 차이, 잔액 증감, notice 문자열로 원인을 추측하지 않는다.

| UI reaction | 실제 감정  | 연결 상황                                   | 우선순위 / 유지  |
| ----------- | ---------- | ------------------------------------------- | ---------------- |
| `normal`    | Normal     | 기본                                        | 0 / 기본         |
| `acting`    | Determined | dice-rolled, fly/trial-intro 시작           | 20 / 1.6초       |
| `surprise`  | Surprised  | 명시적 cue, 데모                            | 40 / 1.6초       |
| `angry`     | Angry      | 명시적 cue, 데모                            | 40 / 1.6초       |
| `joy`       | Happy      | 통행료 수입, 도시 매입·건설 성공, 시험 성공 | 50 / 1.6초       |
| `distress`  | Worried    | 통행료 지불, 시험 실패                      | 60 / 1.6초       |
| `pain`      | Pain       | 명시적 통증 cue, 데모                       | 65 / 1.6초       |
| `bankrupt`  | Sad        | 파산                                        | 90 / 재시작까지  |
| `victory`   | Joyous     | 승리                                        | 100 / 재시작까지 |

Angry는 화남, Sad는 슬픔이다. 두 의미를 동일시하지 않으며 파산에 Angry를 쓰지 않는다. 지불/시험 실패를 곧바로 통증이라고 가정하지 않고 Worried를 선택했다. 더 높은 우선순위가 현재 표정을 대체하고, 낮은 우선순위 반응은 뒤늦게 재생하지 않고 버린다. 같은 우선순위는 최신 요청으로 바꾼다. 명시적 normal은 일시 반응을 해제할 수 있지만 승리/파산은 해제하지 않는다.

## 어댑터 연결

공통 `GameEvent` 타입은 수정하지 않았다. 기존 이벤트로 가능한 것만 매핑한다.

- `toll-paid`: `fromPlayerId` → distress, `toPlayerId` → joy. amount로 원인을 판정하지 않는다.
- `city-acquired`: playerId → joy.
- `facility-upgraded`: 확정 view의 해당 tileId holding.ownerId → joy. 소유자 정보가 없으면 임의로 activePlayerId에 반응시키지 않는다.
- `dice-rolled`: playerId → acting.
- `player-bankrupt`, `game-won`: 해당 playerId에 지속 표정.
- 이미 종료된 게임에 마운트해도 authoritative `players[].bankrupt`, `victory.winnerId`로 지속 표정을 복원한다.

시험 성공/실패 등 기존 어휘로 표현되지 않는 결과는 UI 전용 선택적 필드로 전달한다.

```ts
const update: UIUpdate = {
  id: 'session-2:action-8', // 직렬화 재전달에도 같은 ID
  view,
  events,
  emotionCues: [{ id: 'session-2:trial-8:result', playerId, reaction: 'joy' }],
};
```

cue id는 해당 세션 전체에서 유일하고 재전달할 때 동일해야 한다. `UIUpdate.id`가 있으면 표준 이벤트 cue ID를 이 값과 이벤트 순서로 안정적으로 만든다. id가 없는 구형 어댑터는 **동일 이벤트 객체** 재전달만 WeakSet으로 억제한다. 직렬화로 새 객체를 만드는 통합에서는 반드시 update id를 제공해야 한다. 중복 cue는 타이머를 연장하지 않는다. 스킵/완료로 규칙 액션을 dispatch하지 않는다.

행동 표정은 이동/특수 연출 전에 적용한다. 결과 표정은 해당 업데이트의 이동/특수 연출이 끝나거나 스킵된 뒤 적용하여 모달 뒤에서 반응 시간이 소진되지 않게 한다. 시험 결과/경제가 실제 미연결인 현재 상태에서는 **격리 demo만** 명시적 시험 결과 cue와 고정 통행료 이벤트를 게시한다. 실제 엔진 연결은 후속 통합이다.

## 로드·정리와 대체

- 40×40 이미지와 48×48 HUD 프레임을 고정하고 pixelated/비율 1:1로 표시한다. 원본 1배 크기이며 로딩·표정 변경으로 레이아웃 크기가 바뀌지 않는다.
- HUD를 다시 그릴 때 같은 플레이어/종의 portrait 인스턴스를 재사용한다. 보드 이동 갱신마다 재다운로드/교체하지 않는다.
- 이미지가 로드되기 전에는 작은 공 모양 CSS 아이콘 또는 기존에 로드된 표정을 유지한다. 깨진 img는 DOM에 붙이지 않는다.
- 종별 감정이 없으면 해당 종의 Normal. 감정 이미지 로드 실패도 Normal 1회 재시도. Normal까지 실패하거나 종 자체가 없으면 고정 공 아이콘. 긴 실패 문구를 화면에 출력하지 않는다.
- role=img와 한국어 aria-label은 실제 표시한 표정/Normal 대체/아이콘 상태를 설명한다.
- 새게임/재시작의 `phase: setup` 업데이트에서 표정 타이머·중복 ID·기존 portrait 로더를 즉시 정리한다. 일반 재렌더에서도 종/플레이어가 바뀌면 이전 로더를 정리한다. `mountGameUI().destroy()`는 모든 portrait와 타이머를 해제한다.
- 요청 generation과 해제한 load/error 핸들러로 이전 감정/이전 세션의 늦은 이미지가 현재 그림을 덮지 못한다.

## 수집·검증

루트 설정/lockfile이나 공통 에셋 수집기를 수정하지 않는 독립 스크립트다.

```powershell
# 이미 수집되어 있음. 다시 받는 경우에만 네트워크 수집 실행
node src/ui/game/portraits/collect.mjs
# 오프라인 해시/PNG 크기/디렉터리·tracker 감정/Normal 검증
node src/ui/game/portraits/collect.mjs --verify
node --experimental-strip-types --test src/ui/game/portraits/emotions.test.mjs src/ui/game/portraits/portrait.test.mjs
npm run typecheck
npm run lint
npm run build
```

현재 게임 실행과 전체 회귀 검사는 [개발 안내](../../../../docs/maintenance.md)를 참고한다.
