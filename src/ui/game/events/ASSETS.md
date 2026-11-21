# 특수 연출 시각 자료

루기아 0249·칠색조 0250의 기본형 Idle/Attack/Hover 실제 시트를 사용한다.
원본, AnimData, 개별 credits, tracker, 제작자 목록, README, LICENSE는 `assets/`에 보존했다.
revision, 파일별 원본 URL·SHA256·프레임 치수는 `assets/manifest.json`이 기준이다.

두 기본형의 해당 동작은 개별 `credits.txt`와 tracker 모두 **CHUNSOFT**를 가리킨다.
개별 기록의 조건 필드는 **Unspecified**다. 팬 제작 스프라이트 또는 CC로 허가된 원작이라고 표시하지 않는다.
저장소 README는 제출물의 비상업 사용과 적절한 크레딧, CC BY-NC 4.0을 안내하지만,
원작 추출물에 대한 CHUNSOFT 및 Pokémon 권리자의 별도 이용 허가를 입증하지 않는다.
원작 권리는 Nintendo / Creatures Inc. / GAME FREAK inc. 및 관련 원작 제작자에게 있다.
이 작업은 요청된 비상업 로컬 검토를 위한 도입이며 상업 이용·공개 재배포 권리 확인을 완료했다는 뜻이 아니다.

파일 변형: PNG 원본 바이트는 그대로 저장. 런타임에서 XML 셀을 크롭해 정수 픽셀 배율로 표시한다.
색상 변경·AI 생성·덧그림·시트 전체 노출 없음. 별도 초상화는 수집·사용하지 않는다.
실패 대체는 작은 “이미지 없음 · 이름으로 표시” 문구이며 캐릭터 이름을 함께 유지한다.

파트너는 기존 `findSprite`/`partnerVisual` 에셋과 크레딧을 따른다. 독립 프리뷰는 기존 피카츄 Idle을 참조한다.
파도·깃털·광선·CSS 새 몸통과 날개는 제거했다. 시험은 단색 무대와 기존 큰 스프라이트만 사용한다.
공중날기는 기존 칠색조 Hover의 동쪽 행(0부터 2번)을 재사용해 화면을 수평으로 한 번 가로지른다.
이는 표시 전용 새이며 칠색조 가호나 소유 여부를 뜻하지 않는다.

비행 적합성 조사: 고정 revision의 [0250 AnimData.xml](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/6735193b9d6f499411171daf8d8b7adf1e2d8883/sprite/0250/AnimData.xml)을 확인했다.
해당 기본형에는 Fly라는 이름의 동작이 없고 Hover가 있다. 기존 Hover PNG의 8방향·20프레임을 직접 열어
옆을 향한 날갯짓을 확인했으므로 새 다운로드 없이 이 동작을 선택했다. 셀은 72×112, 시트는 1440×896이며
원본 duration 목록을 60Hz로 재생한다. 시험은 서쪽 행과 Hover/Attack/Idle 전환을 유지한다.
감소 모션에서는 수평 이동·RAF 없이 Hover 첫 셀과 도착 요약을 120ms 표시한다.
출처·개별 CHUNSOFT 크레딧·Unspecified 조건·원작 CC 허가 미확인 상태는 위와 동일하다.

재수집: `python src/ui/game/events/collect-assets.py`

오프라인 검증: `python src/ui/game/events/collect-assets.py --verify`

구현·QA·제한은 [legendary-visuals.md](../../../../docs/legendary-visuals.md)에 기록한다.
