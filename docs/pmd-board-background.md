# PMD Sky 배경 적용 검증

원본 320×240 PNG는 bytes/SHA-256/Git blob SHA가 원격과 동일하다. 비율을 유지하는 `cover`와 중앙 crop, `#e8f0e4` 72% 단색 오버레이만 렌더 단계에서 적용한다. blur·픽셀 편집·이미지 생성은 없다. [파일별 출처와 조사 근거](../src/ui/game/phaser/background/README.md), [manifest](../src/ui/game/phaser/background/manifest.json)의 `author: unknown`, `license: Unspecified`, `permissionVerified: false`를 유지한다.

## 작업 경계

HUD·게임 규칙·연출·카메라 fit·도시·말의 스타일과 좌표는 변경하지 않았다. 이 브랜치 기준 캡처의 큰 ground ellipse와 줌 버튼은 기준 커밋에 있던 것으로, 별도 `fix/board-presentation-polish` 담당의 제거 및 주사위 앵커 변경을 침범하지 않았다. 두 브랜치 조합 시 해당 제거를 유지하고 surface의 `position: relative`와 overflow를 보존해야 한다. 주사위 중앙 앵커의 최종 조합 검증은 통합 담당에게 인계한다.
