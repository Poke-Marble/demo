# 전설 시험 실제 스프라이트

기준: main `bde04c3`. 담당 워크트리 `feat-legendary-visuals`의 events 디렉터리와 별도 프리뷰만 변경했다.
`index.ts`, adapter, board, gameplay feedback, 규칙, 루트 설정은 변경하지 않는다.
presenter 공개 옵션과 큐·lock·skip·reset·destroy 계약, 기본 2600ms/감소 모션 120ms를 유지한다.
독립 검토 프리뷰만 `durationMs: 10000`을 전달한다. 시험 결과·시드·경제는 프리뷰에서 생성하지 않는다.

## 출처와 조건

원본 저장소: https://github.com/PMDCollab/SpriteCollab

고정 revision: `6735193b9d6f499411171daf8d8b7adf1e2d8883`.
`src/ui/game/events/assets/manifest.json`에 14개 원본 각각의 URL과 SHA256을 기록했다.
`assets/`에는 PNG 6개, AnimData 2개, 개별 credits 2개와 README·LICENSE·credit_names·전체 tracker를 바이트 그대로 보존한다.

| 항목                  | 루기아 0249                            | 칠색조 0250                            |
| --------------------- | -------------------------------------- | -------------------------------------- |
| 개별 크레딧           | CHUNSOFT, 2023-05-04, CUR, Unspecified | CHUNSOFT, 2020-10-07, CUR, Unspecified |
| tracker sprite_credit | primary CHUNSOFT, secondary 없음       | primary CHUNSOFT, secondary 없음       |
| Idle 셀 / 프레임      | 72×96 / 2                              | 72×112 / 5                             |
| Attack 셀 / 프레임    | 104×112 / 10                           | 88×120 / 15                            |
| Hover 셀 / 프레임     | 80×96 / 12                             | 72×112 / 20                            |

`credit_names.txt`의 CHUNSOFT 연락처: https://www.spike-chunsoft.com/

해당 동작의 제작자 기록은 원작 CHUNSOFT다. 팬 신규작으로 표시하지 않는다.
README의 **SUBMISSION AND USE POLICY**는 제출물의 비상업 이용·적절한 출처표시 및 CC BY-NC 4.0을 안내한다.
**POLICY ON OFFICIAL SPRITES**는 기존 Chunsoft 원본과 alternate 팬 작업을 구분한다.
저장된 LICENSE도 권리자가 허가할 권한이 있는 권리만 부여한다고 명시한다.
따라서 이 원작 추출 파일 전체가 CC로 허가되었다고 단정하지 않으며 원작 권리자의 별도 이용 허가는 미확인이다.
Pokémon 원 권리: Nintendo / Creatures Inc. / GAME FREAK inc.; 원작 스프라이트 제작 크레딧: CHUNSOFT.
이번 범위는 요청된 비상업 로컬 검토이며 공개 배포·상업 이용 권리 검토 완료를 의미하지 않는다.
별도 팬 제작자 조건은 이 기본형 동작 기록에 없으며 다른 슬롯·초상화의 팬 크레딧을 전용하지 않는다.
초상화는 사용하지 않는다. tracker의 complete/파일 boolean은 이용 허가의 근거로 해석하지 않는다.

## 표시와 수명

Hover로 등장하고 2단계에서 Attack, 복귀 단계에서 Idle을 재생한다. 실제 AnimData의 개별 Duration을 60Hz tick으로 해석한다.
시트는 가로 프레임·세로 8방향이며 좌측 파트너를 보도록 W(6행)를 사용한다.
한 셀을 투명 120×128 canvas에 원본 픽셀로 복사하고 CSS에서 동일한 가로·세로 정수 배율을 적용한다.
canvas 배경은 투명하고 image smoothing을 끈다. 큰 창은 4배, 모바일은 2배, 매우 좁은 창은 1배다.
낮은 가로 창은 2배와 별도 제목 위치를 사용한다. 셀의 원본 투명 여백을 보존한다.
파트너·VS·전설 이름과 짧은 시험 제목을 표시하고 파도·깃털은 뒤의 낮은 불투명도 효과로 남긴다.
시험 DOM은 `.pm-event-wing`/`.pm-event-body`를 만들지 않는다. 기존 비행 DOM과 단계는 유지한다.

load 후 decode 성공 전에는 canvas를 숨긴다. error/decode 거부/1800ms 지연 시 작은 명시적 텍스트 대체를 사용한다.
라이브 상태에서 늦게 decode되면 실제 픽셀로 복구할 수 있지만 dispose 이후의 decode 완료는 무시한다.
종료 시 RAF·timeout·이미지 콜백을 해제한다. 모션 설정 변경은 기존처럼 연출을 종료한다.
감소 모션에서는 Idle을 한 번만 그리고 RAF를 예약하지 않는다. 기존 120ms 종료 정책 때문에 콜드 로딩이 늦으면 이름·로딩 문구만 보일 수 있다.
검증하지 않은 초상화 또는 가짜 새 도형을 실패 대체로 표시하지 않는다.

## 재현

```powershell
npm ci
python src/ui/game/events/collect-assets.py
python src/ui/game/events/collect-assets.py --verify
npm run typecheck
npm run lint
npm run build
node src/ui/game/events/build-preview.mjs
$tests = @(rg --files src scripts | Select-String '\.test\.mjs$' | ForEach-Object { $_.Line })
node --experimental-strip-types --test @tests
# 5175 LISTEN 미사용을 먼저 확인하고 이 워크트리에서 실행
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort
# 별도 터미널, 선택적 QA 도구는 gitignore된 artifacts에만 설치
npm install --prefix artifacts/browser-tools --no-package-lock playwright
node src/ui/game/events/browser-check.mjs
```

주소: http://127.0.0.1:5175/legendary-visual-preview.html

독립 번들: `artifacts/legendary-bundle/legendary-visual-preview.html`.
기본 build의 입력을 바꾸지 않고 Vite API로 별도 생성한다.
브라우저 검증은 설치된 실제 Google Chrome의 headless 모드이며 수동 Chrome 클릭 검증과 구별한다.
`browser-check.mjs`는 기준 커밋의 presenter/CSS를 `artifacts/legendary-qa/`에 읽기 추출하여 같은 프리뷰에서 전후 비교한다. 다른 워크트리를 조작하지 않는다.

## 검증 증거

실행 결과와 한계는 아래 최종 검증 기록을 따른다. 캡처·테스트 로그는 로컬 `artifacts/legendary-qa/`에 저장한다.
초기 화면검증에서 가로 844×390 제목 잘림이 발견되어 낮은 창의 제목·본문 배치를 수정했다.
전후 캡처는 같은 독립 fixture의 기준 presenter/CSS와 현재 구현 비교이며, 통합 게임의 특정 시드 실행 전후라고 주장하지 않는다.

### 최종 검증 기록 — 2026-11-19

- 전체 테스트 **75/75 통과**. `node --experimental-strip-types --test`로 실행. [로그](../artifacts/legendary-qa/unit-tests.txt).
  처음 옵션 없이 실행했을 때 기존 TS 직접 import 테스트 3개가 실패했으며, 필요한 옵션을 사용한 최종 실행은 모두 통과했다.
- `typecheck`, `lint`, 기본 `build`, 별도 `build-preview.mjs` 번들 생성 통과. 변경 코드·문서의 Prettier 검사 및 `git diff --check` 통과.
- 14개 원본 SHA256, AnimData 격자·프레임 수, tracker 크레딧 오프라인 검증 통과.
  원본 디렉터리의 `.gitattributes`로 Git 줄바꿈 변환을 막는다. 원본 파일에 포맷터를 적용하지 않는다.
- 개발 서버와 프로덕션 프리뷰 번들 모두 실제 Chrome headless에서 1280×900, 390×844, 320×568, 844×390 검증 통과.
  두 전설 각각 decode된 canvas의 불투명·투명 픽셀, 정수 배율·원비율, dialog 내 배치, 제목 위치와 Attack 전환을 검사했다.
  [개발 QA](../artifacts/legendary-qa/report.json), [프로덕션 QA](../artifacts/legendary-qa/production/report.json).
- skip/Enter/Esc, native cancel, reset/restart, destroy, 늦은 이미지 및 decode 완료, 실패·decode 거부·1800ms 타임아웃,
  감소 모션 Idle/120ms 종료, 실행 중 모션 변경을 브라우저 또는 단위 테스트로 확인했다.
  브라우저 오류 배열 검사는 정상 이미지의 4개 viewport 시나리오에 적용하며, 의도적으로 요청을 실패시킨 시나리오는 별도 fallback assertion으로 확인했다.
- 기존 `special-event-preview.html`에서도 루기아 실제 이미지 `ready`, 파트너 표시, Esc 후 모달 0개를 Chrome에서 확인했다.
  [기존 화면 연결 캡처](../artifacts/legendary-qa/integrated-lugia.png)는 최종 4배 확대 전의 3배 상태다.
  통합 데모의 시드별 전체 게임 플레이를 새로 완주한 것은 아니다. 기존 규칙·시드·경제 테스트 통과와 변경 파일 범위로 회귀를 확인했다.
- 최종 전후 화면: [이전 390](../artifacts/legendary-qa/before-390.png),
  [루기아 큰 창](../artifacts/legendary-qa/after-lugia-1280x900.png),
  [칠색조 작은 창](../artifacts/legendary-qa/after-ho-oh-390x844.png),
  [낮은 창 수정 후](../artifacts/legendary-qa/after-ho-oh-844x390.png),
  [이미지 실패 대체](../artifacts/legendary-qa/fallback.png).
  캡처를 직접 열어 픽셀 선명도·캐릭터·한글 가독성과 낮은 창 제목 잘림 수정을 확인했다.

프로덕션 번들 검증 시 기존 이 워크트리의 개발 서버를 종료하고 동일한 5175에
`vite preview --outDir artifacts/legendary-bundle --port 5175 --strictPort`로 실행했다.
QA는 `LEGENDARY_SKIP_BEFORE=1`, `LEGENDARY_QA_DIR=artifacts/legendary-qa/production`으로 기존 개발 캡처를 보존했다.
검증 후 개발 서버를 5175로 복구했다. 다른 pane/워크트리 서버를 제어하지 않았다.
원격 push·배포·main 병합은 하지 않는다.
