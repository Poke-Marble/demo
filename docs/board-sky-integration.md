# 보드 표시 정리와 Sky 배경 결합

2026-11-23, 기준 `e07aa30`. tested clean `35ecea6`(board polish), `dc1eac6`(Sky)만 통합했다. 취소된 HUD 브랜치는 병합하지 않았다. HUD/fullscreen·경제/core/data·`vite.config.ts`·배포 workflow는 기준과 diff 0이다. 사용자 README는 기존 내용을 유지하며 Sky 출처 안내 2줄만 추가됐다.

충돌은 surface 생성부 한 곳이었다. Sky CSS 변수만 추가하고 삭제된 nav를 복원하지 않았다. 큰 ground ellipse 제거, 말 그림자4개, 단일 Phaser renderer, surface의 relative/overflow, FX z9, 카메라 fit과 입력/비행을 모두 보존했다. UI 구조·팔레트·규칙은 재설계하지 않았다.

## 결합 검사

- TypeScript 포함 production build, lint, format:check, diff 검사 통과. 기존 Phaser 큰 청크 안내만 남는다.
- Chrome157, 1280×720 / 390×844 / 844×390 / 1920×1080에서 원본 Sky 320×240, HTTP200/image/png/decode와 renderer transparency를 확인했다.
- 네 크기의 주사위와 보드 중심 차이는 `(0,0)` 또는 `(0,-0.0078125)`px. camera 중심, 단일 renderer, pawn shadow4, 큰 ellipse0, 상시 camera nav0, dice의 surface 포함을 확인했다.
- 실제 seed1 roll → 합법 -1 → 이동 → AI3 진행 후 player1의 turn5 복귀. PP3→2, 원래 눈 보존, 이동 길이=권위 거리, 각 receipt ACK1 확인.
- 실제 기존 비행 상태 하나로 네 크기에서 drag 오선택 방지·보드 tap·후보/route·Escape·도시 목록 선택·명시 확정1 확인. resize/modal/target 교체/skip/reset/destroy/reduced motion/mute도 통과했다.
- 완료된 board 단독 관련11검사 및 BG의 실패 fallback·비행 착지 증거는 재사용했다. 전체 seed 경기와 기존 자산 해시 검사는 반복하지 않았다.

`scripts/check-board-polish.mjs --combined`는 기준 `e07aa30`의 이미 커밋된 before 수치를 재사용한다. `BOARD_POLISH_ORIGIN`, `BOARD_POLISH_PRODUCTION`, `BOARD_POLISH_EVIDENCE`로 검사 대상만 바꿀 수 있다. `/demo/`는 제품 설정에서 유지하고 테스트가 base를 되돌리지 않는다. 최종 결합은 dev5248과 production5249에서 순차 검증했다.

## 고정 preview

**http://127.0.0.1:5218/demo/**

기존 소유 session51986을 Ctrl+C로 종료하고 5218 해제를 확인한 뒤, 같은 워크트리에서 strict5218 production session93646으로 교체했다. 미확인 PID 및 다른 서버는 종료하지 않았다. outDir은 `artifacts/board-sky-final`이다.

이 주소에서 Chrome1280/390으로 Sky의 `/demo/assets/` PNG200/decode, 주사위 중앙, 실제 물대포+1·PP3→2·실제6칸 이동·renderer1·오류0을 확인했다. HTTP HTML과 후보 파일의 SHA-256은 모두 `cbbaa8584a68ec9c4015b0c019eb4797b7402b4f393c937dbb342526e53ea574`다. main/push/Actions/저장소 설정 변경은 수행하지 않았다.

## 증거와 범위

[최종 수치와 캡처](evidence/board-sky-integration/), [보드 정리의 전후](fix-board-presentation-polish.md), [BG 출처·전후·fallback](pmd-board-background.md)를 구분해 보존한다. 결합 후 사진은 Sky와 제거된 ellipse/nav, 변경하지 않은 HUD를 함께 보여준다.

RawAsset의 원본 PNG bytes와 manifest를 유지했다. 작가 unknown, 개별 license Unspecified, permissionVerified=false이며 정확한 원작 게임/추출 경로도 확인됐다고 주장하지 않는다. SpriteCollab의 CC 조건을 이 배경의 허가로 확대하지 않았다. 원작 권리 고지와 원본 픽셀을 보존했으며 생성·blur·픽셀 편집은 없다. 렌더 시 cover/crop과 옅은 단색 배경 오버레이만 적용한다.

검사는 headless Chrome이며 모든 브라우저·화면·시드를 전수 검사하거나 음향을 스피커로 청취한 결과는 아니다. 기존 게임 규칙을 다시 구현하거나 HUD·새 기능·다른 지방·대규모 아트를 추가하지 않았다.
