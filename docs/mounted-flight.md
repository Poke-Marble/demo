# 아머까오 탑승 공중날기

기준 main `098d23d`, 작업 브랜치 `feat/mounted-flight-presentation`. main 병합·push 없음. 작업 경로 및 상위 경로에서 적용할 AGENTS.md는 발견되지 않았다.

## 자산 선택 근거

[PMDCollab/SpriteCollab 공식 저장소의 slot 0823](https://github.com/PMDCollab/SpriteCollab/tree/948c79de39e3fe3067f1fd26294e19d864325cc9/sprite/0823)를 직접 조회하고 원본 Idle/Hover PNG, AnimData.xml, credits.txt를 다운로드했다. 아머까오의 존재나 사용 허가를 종 이름으로 추정하지 않았다. 두 시트가 실제 존재하고, [개별 credits](https://github.com/PMDCollab/SpriteCollab/blob/948c79de39e3fe3067f1fd26294e19d864325cc9/sprite/0823/credits.txt)의 2024-10-07 Soulja 기여 항목이 Idle와 Hover를 모두 `CC_BY-NC_4`로 명시하므로 대체 새를 사용할 필요가 없었다.

- 팬 제작 PMD 스타일 자산이다. 해당 세대가 PMD 원작에 있다는 주장이나 CHUNSOFT 원작 추출이라는 주장을 하지 않는다.
- Hover: Soulja. Idle의 이전 기여 NATANIEL_SAMA, ◥θ┴θ◤, G〜도 원본 credits/credit_names와 함께 보존한다.
- [CC BY-NC 4.0 원문](https://github.com/PMDCollab/SpriteCollab/blob/948c79de39e3fe3067f1fd26294e19d864325cc9/license_history/LICENSE.CC_BY-NC_4.md): 비상업 이용, 제작자·출처·라이선스 표시와 기존 고지 보존. Pokémon 원작 권리와 팬 제작 기여의 권리는 별개다. 종전 PMDCollab_1/2 고지도 함께 보존한다.
- [원본 manifest](../src/ui/game/events/mounted/assets/manifest.json)에 고정 revision, 파일별 원출처 URL, SHA-256, XML 프레임 크기·60Hz duration, 변경 내역을 기록했다. 원본 픽셀·파일은 변경하지 않았다. `.gitattributes`와 `.prettierignore`로 원본 줄바꿈/고지도 보존한다.
- 기존 4스타팅 승객은 프로젝트의 기존 시트와 기존 개별 credits를 사용한다. 승객의 기존 CHUNSOFT / Unspecified 상태를 새 CC 허가로 바꾸지 않는다.

## 구현 및 병합 계약

`events/mounted/presenter.ts`가 fly 재생을 소유한다. `events/presenter.ts`에는 fly early return과 선택/hover 효과음 연결만 추가했다. trial-intro 본문은 변경하지 않았다. world-events `14a7594`를 통합할 때 이 early return과 mountedFlight 옵션을 보존한다.

`pokemonForPlayer(playerId)`는 현재 view의 해당 플레이어에서 pokemonId를 조회한다. Canvas는 원본 시트를 런타임에 프레임별로 읽고 아머까오 2배·승객 1배로 합성한다. 알파 경계는 정렬에만 사용하며 원본 PNG를 수정하거나 다시 저장하지 않는다. 이륙·횡단·착지에 Idle/Hover를 사용하고 과한 파티클·새 AI 이미지·추상 새 도형은 추가하지 않았다.

Phaser의 `flightAnchors(request)`가 기존 카메라·좌표·승객 seat를 CSS 화면 좌표로 변환한다. overlay 재생 중 해당 pawn과 shadow를 숨기고 finally에서 authoritative `to`에 복원한다. overlay 뒤에 별도 fly walk를 재생하지 않는다. presenter 없는 기존 보드 단독 사용은 walk fallback을 유지한다.

board-flight 담당자의 `c0c017f`와 합의한 API는 `PhaserBoardOptions.onFlightHover?()` / `onFlightSelect?()`이다. GameUI에서 각각 `feedback.audio.playFlight?.('hover'|'select')`로 연결했다. 두 브랜치를 통합할 때 같은 이름의 옵션 선언은 한 쌍만 남긴다. 보드 담당자의 `setFlightSelection` / `invalidateFlightSelection`, drag 판정 및 입력 구현은 이 브랜치에서 교체하지 않았다. 독립 브랜치의 HTML picker에도 같은 효과음을 연결했다.

합성 효과음은 기존 `SfxBus`의 AudioContext, 저장 mute/volume, unlock, voice cap 4, stop/destroy를 사용한다. 별도 게임 음원 파일은 없다. hover 140ms, select 100ms, wing/wind/land 160ms 제한을 적용했다. HTML hover는 버튼을 누른 drag와 touch를 무시하고, 이미 선택한 목적지를 재선택하면 tick을 반복하지 않는다.

감소 모션은 정적 도착 요약 160ms, 이미지/메타데이터 실패는 이름 fallback 후 완료한다. 로딩은 1800ms 후 fallback으로 전환하며 500ms 뒤 완료한다. skip/abort/동작 설정 변경/destroy에서 RAF·타이머·이미지 핸들러·효과음을 정리하고 완료 Promise를 한 번만 resolve한다. 게임 규칙/위치/거래는 연출이 결정하지 않는다.

## 검증

Chrome `157.0.8103.80`, 실제 설치 Chrome의 headless 렌더러. 1280×720 및 390×844에서 [18개 사례 결과](../src/ui/game/events/mounted/evidence/results.json)를 기록했다. 시각 검수에서 모바일 캡션을 하단으로 옮기고 승객이 상단에 잘리지 않도록 보정한 후 재검증했다.

- 4스타팅 각각 탑승, 이륙·횡단·착지, 실제 목적지, redelivery ack 1회.
- Enter/Space/Escape skip, 최초 감소 모션, 재생 중 감소 모션 전환, mount 로드 실패, destroy 2회와 canvas 제거.
- 공유 오디오의 제스처 전 무음, 기존 unlock 이후 재생, mute·volume 0, hover 100회 호출당 1회 재생, stop.
- [설정 UI](../src/ui/game/events/mounted/evidence/audio-settings.json): 실제 소리 설정에서 volume 25%, 음소거 반영.
- [playerId 검증](../src/ui/game/events/mounted/evidence/player-id.json): player:3 → pokemon:0007 → 목적지 10, ack 1. 첫 번째 플레이어를 고정 승객으로 쓰지 않는다.
- production adapter의 합법 명령으로만 seed 1을 126단계 진행해 공중날기 선택에 도달했다. DOM/게임 상태를 임의 주입하지 않았다. 실제 fly 요청 `game:1:human:1:253:0`, `tile:kj:fly` → `tile:kj:pallet`, revision 253→254. 목적지 확정을 중복 호출해도 거래 1회, 두 화면 크기에서 actualPosition 일치·ack 1회·입력 잠금 해제를 확인했다.

재현:

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5215 --strictPort
node src/ui/game/events/mounted/browser-check.mjs
node scripts/verify-mounted-assets.mjs
node --experimental-strip-types --test src/ui/game/events/presenter.test.mjs src/ui/game/events/queue.test.mjs src/ui/game/feedback/audio.test.mjs
npm run typecheck
npm run lint
npm run build
```

단위검사 15개, 원본 파일 해시 10개, typecheck/lint/build 통과. Vite의 기존 Phaser chunk 크기 경고는 유지된다. browser-check의 Playwright import 경로는 이 작업 환경의 기존 `feat-board-art/artifacts/browser-tools` 설치를 사용한다.

Preview: [선택 승객 4종 시연](http://127.0.0.1:5215/mounted-flight-preview.html), [실제 규칙 비행](http://127.0.0.1:5215/actual-flight-preview.html), [제품 화면](http://127.0.0.1:5215/). 시연 entry만 QA hook을 제공하며 제품 entry에는 새 hook을 노출하지 않는다.
