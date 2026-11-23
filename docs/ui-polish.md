# UI polish: 설정 패널·이동 합계·한글 픽셀폰트

브랜치 `feat/ui-polish`, 시작 기준 `bb863ae`. 이 변경은 `src/ui/game/index.ts`와 `src/ui/game/theme/**`에만 적용한다. 게임 규칙, 경제, AI, Phaser, 별도 HUD 모듈 및 다른 워크트리는 수정하지 않았다.

## 동작

- 게임 왼쪽 하단의 상시 음소거/볼륨 패널을 마운트하지 않는다. `createGameplayFeedback()`와 `SfxBus`의 생성·저장 설정·실제 pointerdown/keydown unlock·음성 정리 수명은 그대로 유지한다. 강제 음소거 해제나 볼륨 변경은 하지 않는다.
- 주사위/걸음 연출 동안만 오른쪽 위에 `연출 스킵 · Esc` 버튼을 표시한다. 게임 host의 inert 바깥에 있어 입력 잠금 중에도 동작한다. Esc 또는 버튼은 `feedback.skip()`과 현재 이동 대기 타이머 해제를 호출한다. 확정 상태/기록은 정상 처리하고 기존 큐가 입력 잠금을 해제한다. 특수 이벤트 presenter의 자체 스킵/ack를 대체하지 않는다. 종료 시 버튼과 키 리스너를 제거한다.
- 보드 중앙과 오른쪽 결과는 `이동 —` → `굴리는 중…` → `이동 9칸 · 이동 중…` → `이동 9칸 · 완료` 순으로 표시한다. 컴퓨터 상태 표시에도 합계를 유지한다. `theme/dice.ts`는 전달받은 실제 배열 전체를 합산하는 표현 함수다. Canvas에는 원본 배열을 계속 전달하며 RNG·이동 경로·주사위 기록의 개별 눈은 바꾸지 않는다. 합계로 이동 거리를 다시 만들지 않는다.

기존 설정 화면에서 오디오를 연결할 때는 버스를 만들어 `mountGameUI(root, adapter, { sfx })`에 주입한다. `sfx.getSettings()`, `sfx.subscribe(listener)`, `sfx.setMuted(boolean)`, `sfx.setVolume(0..1)`을 사용한다. 저장 key는 기존 `pm:sfx:v1`이며, 주입한 버스는 게임 UI가 destroy한다. UI에 설정 패널을 붙여야만 unlock/저장/재생이 동작하는 구조가 아니다. 특성 합성음은 기존 별도 presenter와 오디오 계약을 유지하며, 연결 제약은 [gameplay-feedback.md](gameplay-feedback.md)의 SFX 버스 계약을 따른다.

## 폰트 출처와 재사용

[Galmuri 공식 저장소](https://github.com/quiple/galmuri)와 [공식 웹사이트](https://galmuri.quiple.dev/)의 Galmuri11을 사용한다. 공식 포켓몬 게임에서 추출한 파일은 사용하지 않았다. 저작자는 Lee Minseo (`quiple@quiple.dev`), 저작권 표기는 `Copyright © 2019–2025 Lee Minseo`이다. 라이선스는 SIL OFL 1.1이며 원문을 `theme/fonts/LICENSE.txt`에 수정 없이 보존했다.

- 확인일: 2026-11-20. 고정 revision: `71e1cacf1437a11220307120e63e30bc275312d4`.
- [폰트 원본](https://raw.githubusercontent.com/quiple/galmuri/71e1cacf1437a11220307120e63e30bc275312d4/dist/Galmuri11.woff2): SHA-256 `8bad9322b3340bfb5cb26cb00f4752bf4c8e7d1b526bb07205f4af458eebed31`.
- [라이선스 원문](https://raw.githubusercontent.com/quiple/galmuri/71e1cacf1437a11220307120e63e30bc275312d4/ofl.md): SHA-256 `9a9e5a342c430c3fcf01a408b680f4405d5bf4ac659c931be35f8a1b27ea69c9`.
- 기계 판독 메타데이터: `theme/fonts/provenance.json`. FontTools cmap 검사에서 현대 한글 완성형 11,172자 및 ASCII U+0020–U+007E 전체를 확인했다. 원본 파일과 라이선스를 다시 받아 보존 파일과 hash가 일치하는지도 검사했다.

`theme/theme.css`를 import하면 `--pm-font-game`, `--pm-font-body-size`, `--pm-font-body-line`, `--pm-font-number-spacing` 토큰을 사용할 수 있다. 로컬 WOFF2에 `font-display: swap`을 적용하고 맑은 고딕·Segoe UI·sans-serif로 fallback한다. 본문/핵심 버튼은 14px, 본문 줄높이는 1.65, 숫자는 tabular-nums 요청을 사용한다. 글꼴은 regular 한 파일이며 기존 굵은 글씨는 브라우저 합성 굵기다. tabular-nums 미지원 시 글꼴 기본 숫자 폭을 사용한다. 작은 보드 지명은 기존 축척/말줄임을 유지한다.

Phaser/HUD 담당자는 이 CSS와 `--pm-font-game` 토큰을 재사용할 수 있다. Canvas/Phaser 텍스트는 `document.fonts.load('14px "PM Galmuri"')`가 완료된 뒤 생성/재측정해야 한다. 이 브랜치에서는 병렬 모듈을 직접 변경하지 않는다.

## 병합 지점

MVP의 정산/ack 변경과 병합할 때 `index.ts`에서 다음 작은 변경만 유지한다.

1. 기존 스타일 뒤 `theme/theme.css`, `diceLabel` import.
2. `root.append(feedback.controls)`를 제거하고 연출 스킵 형제 버튼·Esc 리스너 생성. render에서 visibility 갱신, destroy에서 해제.
3. `dice` 초기/리셋·굴림 전/후·이동 종료 텍스트와 오른쪽 결과 텍스트 변경. 컴퓨터 progress에는 합계 span 유지.

기존 `adapter` 호출, update 큐, 구독, 연출 ack, pendingFeedback, inert 잠금 및 효과 presenter 흐름은 유지해야 한다. 스킵은 기존 타이머 map을 해제하며 update 처리나 ack를 직접 실행하지 않는다. 아직 main에 없는 MVP 코드를 가져오거나 병합하지 않았다.
