# 플레이테스트 후속 그래픽 수정

2026-11-18 / feat/board-art. 이 문서가 이전 `docs/board-art.md`의 크기·크레딧·검증 한계 기록을 갱신한다. 허용된 board/isometric/art/assets 경로만 변경했다. index/adapter/game.css/demo/규칙/실제맵 및 다른 워크트리는 변경하지 않았다.

## 원인 조사와 판단

수정 전 격리 Chrome 개발 프리뷰 1200px/390px에서 지면·장식 PNG 7종 HTTP 200, SVG/image 사용처 41개 디코딩 성공, 요청 실패 0. 파일들은 투명 RGBA 실제 그림이며 출처 텍스트로 이미지를 대체한 부분은 없었다. 사용자가 실행한 통합 환경의 이미지 미표시 자체는 재현하지 못했으므로 그 환경의 근본 원인이 확정됐다고 주장하지 않는다.

확인한 렌더 문제는 건물마다 달랐던 원본→표시 배율, 탑다운 지붕의 과도한 면적, 시설 레벨/명소에 따른 전체 이미지 확대, 그림의 바닥과 SVG viewBox 끝이 달랐던 발밑 오차, 말 프레임의 투명 여백, 보드 중앙의 긴 크레딧이다. 작은 화면에서는 32칸 전체를 축소하면서 시설·레이블이 식별하기 어려웠다. CSS 배경은 말 4개, SVG image는 지면 패턴/꽃 및 시설·수목에서 사용한다. 지면에 빌딩 사진을 배경으로 대입한 코드는 없다.

## 수정과 연결

- 큰 탑다운 지붕·항구 보트는 제외하고 같은 시트의 정면부를 선택했다. 선택 좌표·권리·SHA-256은 `../assets/regional/README.md`, `crops.json`, `credits.json`에 기록했다. 새로운 외부 에셋은 추가하지 않았다.
- 공통 `billboard.ts`: 원본 픽셀 0.5 SVG units, 전체 빌보드 64×76.8 scene units, 발밑 (50,108). CSS translate(-50%,-90%)로 그림자와 발을 기준 좌표에 맞춘다. 회전/skew 없음. SVG 내부 preserveAspectRatio 유지. 레벨은 세 개까지 작은 표식으로 나타낸다.
- 수목도 같은 빌보드·픽셀 배율·발 위치 사용. 외곽 drop-shadow를 없애고 발밑 타원 그림자만 유지했다. 시설은 span과 pointer-events:none으로 원래 타일의 히트영역을 가리지 않는다. tile ID, depthOrder, 말 자리/규칙은 그대로다.
- `pawn-foot.ts`는 기존 sprite 콜백이 반환하는 CSS background의 첫 프레임을 같은 출처 이미지로 읽어 불투명 경계에서 발밑 여백과 중심을 보정한다. 결과를 URL/프레임 크기별로 캐시한다. 기존 프레임 애니메이션 계약은 그대로다. 방향별/모든 프레임별 정밀 보정까지 하지는 않는다. 이미지 디코딩 실패 시 작은 원형 마커가 된다.
- SVG image error 시 해당 image를 제거하고 작은 건물/나무 픽셀 그래픽을 표시한다. 깨진 이미지/출처 문구를 대체 그림으로 사용하지 않는다. 지면은 원래 코드 지형 색과 수면이 남는다.
- 크레딧은 중앙 장면에서 보드 아래쪽의 native details UI로 이동했다. 필수 제작자 전원과 원출처 링크를 유지했다. 제목/진입 설명 관련 다른 담당 파일은 건드리지 않았다.
- 최소 보드폭 640 scene px와 부모 가로 스크롤을 적용해 작은 화면에서 시설을 식별할 수 있게 했다. 독립 프리뷰도 동일 부모 구조로 감싼다. 배율/최소폭은 조정 가능한 가정이다.
- 독립 프리뷰는 기존 `findSprite`의 실제 포켓몬 CSS 배경을 사용한다. `?corners=1&overlap=1`로 모서리 장식과 같은 타일의 사람1+COMPUTER3 말을 확인한다. 경제/턴 조작을 제공하는 프리뷰는 아니다. 기존 게임 흐름은 회귀 테스트로 확인했다.

## 재현 및 검증

```powershell
# 각 서버는 별도 터미널
npx vite --host 127.0.0.1 --port 5194 --strictPort
node src/ui/game/art/preview.mjs --build
node src/ui/game/art/preview.mjs --serve-built
npx vite preview --host 127.0.0.1 --port 5196 --strictPort --outDir artifacts/board-art-bundle --base /board-art/

# 루트 package/lockfile 변경 없이 테스트 도구만 artifacts에 설치
npm install --prefix artifacts/browser-tools --no-package-lock playwright
node src/ui/game/art/browser-check.mjs
```

`browser-check.mjs`는 별도 headless Chrome을 시작한다. 사용자 Chrome/다른 에이전트 세션에 연결하지 않는다. Chrome 경로는 `CHROME_PATH`로 변경 가능하다.

개발 5194 / 프로덕션 5195 / 프로덕션 하위 경로 5196/board-art 각각 1200×1000, 390×1000에서 확인:

- SVG image 및 CSS background 고유 URL 11종 디코딩 성공. 초기 이미지 요청과 추가 디코딩 확인 요청 총 22건, HTTP 200/캐시 재검증 304. 네트워크 실패·페이지 JS 오류 0.
- 32칸 전체 실제 포인터 클릭, 출력 tile ID 확인: 각 화면 32회, 총 192회. Tab→Enter 다음 타일 선택, 크레딧 열기 성공.
- 네 말 동일 타일 중첩 및 좌표에 따른 depthOrder 확인. 실제 포켓몬 스프라이트 및 시설 표시를 캡처로 확인. 시설 크기가 종류/레벨과 관계없이 같고 pointer-events:none인 것도 검사.
- 390px에서도 문서 전체의 가로 넘침 없음. 보드 영역 안에서 가로 스크롤 후 모든 타일 클릭 가능.
- 개발/프로덕션에서 시설·수목·말 이미지 요청을 강제로 실패시킨 경우 SVG 34개는 작은 그래픽 대체물, 말 4개는 원형 마커로 표시. SVG image가 남지 않는 것과 fallback 표시 상태를 확인.
- 별도 번들은 `base:'./'`, 외부 hashed PNG로 생성해서 상대 경로와 실제 요청을 검사했다. 최초 버전은 작은 PNG가 data URL로 인라인됐으며 그것 자체는 로딩 실패 증거가 아니다. 배포나 main 병합은 하지 않았다.

`npm run typecheck`, `npm run lint`, `npm run build`, 독립 프리뷰 build 통과. 기존 보드/사람+COMPUTER/코어/실제맵 포함 Node 테스트 22개 통과(실제맵 내부 검증 9개 포함). 신규 테스트는 크롭 해시·크기, 장면 매핑, 공통 픽셀 배율/발 기준점, 그래픽 fallback 및 브라우저 포인터 상호작용을 검증한다.

## 전후 캡처와 한계

git 제외된 로컬 산출물:

- `artifacts/before-1200.png`, `before-390.png`: 수정 전 개발 프리뷰.
- `artifacts/before-network.json`: 수정 전 실제 요청과 디코딩.
- `artifacts/board-art-qa/{dev,production,subpath}-{1200,390}.png`: 수정 후 화면.
- 같은 이름의 `-overlap.png`, `-credits.png`: 말 겹침/모서리와 크레딧 펼침.
- `artifacts/board-art-qa/{dev,production}-request-failure-fallback.png`: 요청 실패 강제 주입.
- `artifacts/board-art-qa/report.json`: 요청 상태·이미지 치수·CSS 배경·시설 크기·클릭·깊이 기록.

네이티브 computer-use 캡처가 선택한 Chrome 대신 다른 전경 창을 반환하여 해당 경로는 중단했다. 위 캡처/포인터 검증은 실제 Chrome 엔진의 격리 headless 세션 결과다. 실제 사용자 OS 창에서의 터치/수동 시각 검증, 이벤트 브랜치와 병합된 전체 게임의 연속 턴/연출 중 가림, 사용자 환경에서만 나타나는 CSP/캐시/서버 경로 오류는 별도 확인이 필요하다. 재생 중 모든 방향/프레임의 발 보정까지 검증하지 않았다.
