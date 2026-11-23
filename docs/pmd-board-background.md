# PMD Sky 배경 적용 검증

기준 `main e07aa30`, 작업 브랜치 `feat/pmd-board-background`. 보드 뒤 단색에만 PMDCollab/RawAsset의 Sky를 적용했다. Phaser의 `backgroundColor: '#e8f0e4'`가 같은 색의 CSS surface를 가리던 중복 원인이었다. `transparent: true`와 surface CSS 배경으로 바꾸고, Vite PNG import URL을 CSS 변수로 전달한다. 새 DOM 레이어나 pointer 대상은 없다.

원본 320×240 PNG는 bytes/SHA-256/Git blob SHA가 원격과 동일하다. 비율을 유지하는 `cover`와 중앙 crop, `#e8f0e4` 72% 단색 오버레이만 렌더 단계에서 적용한다. blur·픽셀 편집·이미지 생성은 없다. [파일별 출처와 조사 근거](../src/ui/game/phaser/background/README.md), [manifest](../src/ui/game/phaser/background/manifest.json)의 `author: unknown`, `license: Unspecified`, `permissionVerified: false`를 유지한다.

## 검증 결과

2026-11-23, 실제 설치된 **Google Chrome 157.0.8103.80**을 Playwright `channel: chrome`으로 실행했다. `5242`가 비어 있는 것을 확인한 후 Vite build preview를 `--port 5242 --strictPort`로 실행했다. `/demo/`와 배포 workflow는 변경하지 않았다.

- `npm run build`, `npm run lint`, 변경 텍스트의 Prettier 검사와 `git diff --check` 통과. 기존 Phaser 번들 크기 안내 외 빌드 오류 없음.
- production `/demo/`: 1280×720, 390×844, 844×390, 390×667에서 로컬 Sky 요청 200, 한국어 Galmuri 로드, 도시 선택·목록, 드래그 후 오선택 억제, 주사위 클릭 통과. 문서 가로·세로 scroll 크기는 viewport와 동일하다.
- 네 viewport 모두 surface와 canvas 크기가 전후 동일하다. PC 우측 HUD와 모바일 보드 아래 HUD 영역의 전후 캡처는 픽셀 단위로 동일하다. 도시 글씨·포켓몬 말과 소유색을 시각 확인했다.
- 자연스러운 기존 규칙/AI 명령으로 첫 비행 선택에 도달한 한 세션을 재사용했다. dev `/demo/actual-flight-preview.html`에서 1280×720, 390×844, 844×390, 1920×1080 resize 및 선택 중 드래그 통과. canvas는 surface를 채우며 배경이 빈 여백을 남기거나 pointer를 가로채지 않는다. 탑승 비행의 횡단 레이어를 시각 확인하고 정상 착지·ack 1회를 확인했다.
- production에서 Sky 요청만 차단한 1280/390 화면: 단색 fallback의 실제 캡처 픽셀은 `(232, 240, 228)`, 주사위 조작 가능, page error 없음. 정상 production 응답 PNG의 SHA-256도 원본과 동일하다.

[검증 수치](evidence/pmd-background/results.json). 전체 네 viewport의 전후·주사위·비행·fallback 캡처와 실행 스크립트는 작업 폴더의 `artifacts/pmd-background/`에 보존했다. 아래 주요 캡처는 저장소에도 보존한다.

| 화면     | 전                                                | 후                                               |
| -------- | ------------------------------------------------- | ------------------------------------------------ |
| 1280×720 | [전](evidence/pmd-background/before-1280x720.png) | [후](evidence/pmd-background/after-1280x720.png) |
| 390×844  | [전](evidence/pmd-background/before-390x844.png)  | [후](evidence/pmd-background/after-390x844.png)  |

[소유색과 탑승 비행 레이어](evidence/pmd-background/flight-cross.png).

## 작업 경계

HUD·게임 규칙·연출·카메라 fit·도시·말의 스타일과 좌표는 변경하지 않았다. 이 브랜치 기준 캡처의 큰 ground ellipse와 줌 버튼은 기준 커밋에 있던 것으로, 별도 `fix/board-presentation-polish` 담당의 제거 및 주사위 앵커 변경을 침범하지 않았다. 두 브랜치 조합 시 해당 제거를 유지하고 surface의 `position: relative`와 overflow를 보존해야 한다. 주사위 중앙 앵커의 최종 조합 검증은 통합 담당에게 인계한다.
