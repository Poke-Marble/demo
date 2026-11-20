# 도시 이름 가독성 수정 — fix/map-label-clarity

기준은 `a18c2c4d6bfbeca0f4c6b7785bc8fa10a03c4522`이다. 실제 `mountGameUI` + `createIntegratedPreview` + 기존 단일 Phaser 보드에서 원인을 재현했다. 상위/작업 디렉터리와 src/docs에서 적용할 AGENTS.md는 발견되지 않았다. 구현은 라벨 전용 모듈/CSS/검사/증거와 index.ts의 라벨 생성·동기화·해제 연결에 한정한다. 경제·AI·승리·특성·시드·RNG·원본 이미지/폰트·pawn/model depth는 변경하지 않았다.

## 실제 원인과 비교

Chrome 157.0.8103.80(headless), 1280×1000 / 390×1000, DPR 1·2에서 줌 `1 → 1.25 → 2.5 → 1`을 검사했다. 브라우저 DPR도 실제 `devicePixelRatio`로 확인했다. 원본 소스를 git에서 읽어 같은 Vite 서버의 테스트 fixture로 공급했으므로 기존 CSS 보드와의 비교가 아닌 **실제 Phaser 수정 전/후 비교**다.

| 측정 항목                            | 1280 화면       | 390 화면                   |
| ------------------------------------ | --------------- | -------------------------- |
| canvas 논리/버퍼 크기 (DPR 1·2 동일) | 1000×720        | 1000×720                   |
| canvas CSS 표시 크기                 | 867.984×624.953 | 361.969×260.625            |
| 10px 원본 라벨의 화면상 크기, 줌 1   | 8.680px         | 3.620px                    |
| 줌 1.25                              | 10.850px        | 4.525px                    |
| 줌 2.5                               | 21.700px        | 9.049px                    |
| 원본 Text resolution                 | 1               | 1                          |
| 수정 후 기본 이름 / 포커스 이름      | 14px / 18px     | 14px 목록 / 18px 지도 강조 |

- 기본 FIT 축소가 작은 글씨를 더 줄인다. DPR 2에서도 버퍼와 Text resolution이 늘지 않았다. Text texture 확대·축소와 소수 좌표가 재샘플링되는 조건을 확인했다. 예: 출발 라벨 `(500, 594.9777778)`, 다음 타일 x=`455.5555556`.
- 실제 HUD는 이미 `document.fonts.load('14px "PM Galmuri"')` 이후 보드를 생성한다. 재현 당시 Galmuri 로딩은 완료되어 있었다. 따라서 이 경로의 흐림을 폰트 로딩 탓으로 단정하지 않았다.
- resolution만 4로 높이는 별도 대조군도 같은 화면/DPR/줌에서 캡처했다. 출발 Text texture는 26×18 → 104×72로 커지지만, 화면상 글씨 크기 3.620px(모바일 기본 줌)는 그대로다. 고해상도 texture만으로 최소 읽기 크기를 해결할 수 없었다.
- 전역 `antialias: true`, `pixelArt: false`, FIT, canvas 크기 및 sprite NEAREST 설정을 보존했다. 전체 canvas에 image-rendering을 추가하지 않았다.

[원본·resolution4·수정 후 전체 측정](../src/ui/game/phaser/labels-evidence/resolution-matrix.json), [최종 화면 검사 및 폰트 지연 검사](../src/ui/game/phaser/labels-evidence/final-report.json).

## 선택한 라벨 정책

`labels.ts`는 HTML 글씨를 브라우저의 DPR로 직접 렌더링한다. 이름은 canvas texture나 FIT 배율을 거치지 않는다. 동일한 로컬 Galmuri11을 사용하고, 전용 CSS에서 기존 폰트 선언을 가져와 독립 renderer에서도 로딩한다. DOM 글씨는 폰트 도착 시 다시 그려져 fallback 글씨가 texture에 고정되지 않는다. 폰트 응답을 의도적으로 지연한 독립 renderer 검사도 통과했다.

지도 표시 폭이 560px 이상이면 모든 화면 내 라벨을 최소 14px로 표시한다. 불투명한 `#fffdef` 배경과 일반 이름 `#163640`(대비 약 12.56:1), 특별 이름 `#513064`(약 10.50:1)을 사용한다. 겹침은 화면 좌표의 후보 위치 중 겹침 면적과 이동거리를 비교하여 줄이고, 원래 타일 아래 앵커와 연결선을 표시한다. 이름을 자르거나 말줄임하지 않는다. 키보드 포커스는 18px와 외곽선으로 강조하며 hover/포커스 이름은 다른 라벨 위에 표시한다.

560px 미만에서는 32개 이름을 지도 위에 동시에 크게 놓으면 보드가 가려지므로, 이름 전체를 맵 순서의 2열 스크롤 목록으로 표시한다. 목록 글씨는 14px, 버튼 높이는 최소 40px이며 긴 이름은 줄바꿈한다. 목록 높이는 204px로 제한하여 HUD가 지나치게 밀리지 않게 했다. 포커스·선택한 이름만 지도에 18px로 연결한다. 기본 강조는 출발이다. 모든 이름을 스크롤/Tab으로 탐색할 수 있고 기존 키보드 대체 목록도 유지된다. 선택은 기존 onSelect와 잠금 검사로 전달한다.

Phaser 4의 `camera.matrixCombined`는 이미 scroll을 포함한다. 이 행렬로 월드 앵커를 변환한 뒤 실제 canvas 표시 크기/offset을 적용한다. `POST_RENDER` 이후 동기화하여 그 프레임의 카메라 행렬을 사용하고, 좌표를 DPR 픽셀에 맞춘다. 카메라·표시 크기·DPR·포커스·잠금·라벨 데이터가 바뀔 때만 배치/DOM을 갱신한다. 새 Game이나 canvas를 만들지 않는다. 데이터 제거 및 보드 destroy 때 라벨/연결선/목록도 해제한다.

## 캡처 증거

아래 기본 줌 이미지는 DPR 2다. DPR 1 및 줌 1.25/2.5의 측정은 JSON과 재실행 가능한 검사에 포함된다.

| 화면 | 수정 전                                                         | resolution 4만 적용                                                              | 최종 수정                                                                |
| ---- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1280 | [전](../src/ui/game/phaser/labels-evidence/before-1280-2-1.png) | [texture 대조군](../src/ui/game/phaser/labels-evidence/resolution4-1280-2-1.png) | [후](../src/ui/game/phaser/labels-evidence/after-1280-2-1.png)           |
| 390  | [전](../src/ui/game/phaser/labels-evidence/before-390-2-1.png)  | [texture 대조군](../src/ui/game/phaser/labels-evidence/resolution4-390-2-1.png)  | [후: 지도 강조](../src/ui/game/phaser/labels-evidence/after-390-2-1.png) |

실제 HUD 포함: [1280](../src/ui/game/phaser/labels-evidence/after-hud-1280-2.png), [390: 전체 이름 목록과 HUD](../src/ui/game/phaser/labels-evidence/after-hud-390-2.png).

확대/이동: [1280 줌2.5](../src/ui/game/phaser/labels-evidence/after-1280-2-2.5.png), [390 줌2.5](../src/ui/game/phaser/labels-evidence/after-390-2-2.5.png), [1280 pan](../src/ui/game/phaser/labels-evidence/after-pan-1280-2.png), [390 pan](../src/ui/game/phaser/labels-evidence/after-pan-390-2.png). [폰트 지연 후 긴 이름 포커스](../src/ui/game/phaser/labels-evidence/after-delayed-font-390-2.png)도 확인했다.

## 검증 및 재실행

5188 포트 미사용을 확인하고 이 작업트리에서만 Vite strict port 서버를 시작했다. 다른 프로세스/pane/작업트리를 제어하거나 수정하지 않았다. 기존 다른 작업트리의 Playwright 설치는 읽기 전용 라이브러리로만 사용하며, `PLAYWRIGHT_PATH`로 독립 설치 경로를 지정할 수 있다.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort
# 다른 터미널, 같은 작업트리
node src/ui/game/phaser/labels.browser-check.mjs
# UI 최종 정책만 빠르게 재검사
node src/ui/game/phaser/labels.browser-check.mjs --after-only
$tests = rg --files src -g '*.test.mjs' -g '*.test.ts'
node --experimental-strip-types --test $tests
npm run typecheck
npm run lint
npm run build
npm run format:check
git diff --check
```

- 전체 회귀 **165/165 통과**. 새 레이아웃 검사는 혼잡한 이름들의 비겹침/화면 경계/결정성/이름 ID 보존과 모바일 긴 포커스 라벨 경계를 확인한다. 첫 전체 실행에서 strip-types 옵션 누락으로 기존 TS import 11개가 로드 실패했고, 위의 올바른 옵션으로 재실행해 전부 통과했다.
- typecheck, lint, build, format:check 통과. 빌드의 Phaser 청크 500KB 경고는 남는다.
- Chrome 대조군 포함 48개 측정, 최종 정책 16개 재측정 및 지연 폰트 검사 통과. 화면별 DPR 1·2에서 이름 32개/순서/최소 글자 크기, 실제 Phaser canvas 1개, 가로 넘침 없음, 포커스 유지/18px 강조, 카메라 역변환 정합, pan 캡처, 390↔1280 resize, destroy 후 라벨/목록 제거를 확인했다. HUD의 기존 효과/dice canvas는 Phaser canvas 수와 별개다. 페이지 오류 0건.
- PNG를 직접 열어 기존 건물·캐릭터 실루엣 보존, 글씨 크기/배경, 모바일 긴 이름, 연결선과 화면 경계를 비교했다. 자동 캡처/레이아웃 수치가 장시간 수동 게임 플레이를 대체하지는 않는다.

## 한계 및 담당 경계

모바일에서는 32개 전체 이름이 지도 위에 동시에 표시되는 대신 목록 탐색과 한 개 지도 강조를 사용한다. 줌으로 카메라 밖으로 나간 타일의 지도 라벨도 함께 숨겨지며, 모바일 이름 목록과 기존 키보드 목록에는 이름이 유지된다. 화면 밖 이름 선택이 카메라를 자동 이동시키지는 않는다. 전체 보기 버튼으로 돌아갈 수 있다. 데스크톱 배치는 겹침을 최소화하는 휴리스틱이므로 임의의 더 긴 지도 이름이나 극단적으로 많은 타일에서 무겹침을 보장하지 않으며, 포커스 강조와 대체 목록이 남는다. 폰트 래스터화의 최종 외관은 브라우저/OS에 따라 차이가 있다.

pawn/model 정렬 영역은 `poke-depth-fix` 담당 그대로다. 경계 변경이 필요하지 않아 해당 코드는 수정하지 않았다. 화면 중앙의 기존 HUD 이동 표시 등 라벨 외 UI의 위치/깊이도 본 작업에서 바꾸지 않았다. main 병합·푸시·배포는 수행하지 않는다.
