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
