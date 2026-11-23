# 보드 뒤 Sky 배경

원본: [PMDCollab/RawAsset · BG/Sky.1.png](https://github.com/PMDCollab/RawAsset/blob/0b88bbd7dec6f3373d5ec2b0f40bbdc3f44ce90c/BG/Sky.1.png). 고정 커밋은 `0b88bbd7dec6f3373d5ec2b0f40bbdc3f44ce90c`이며 원본 URL·SHA-256·Git blob SHA는 [manifest.json](manifest.json)에 기록한다. 로컬 PNG는 원본 11,356 bytes와 동일하다.

**작가: unknown / 개별 라이선스: Unspecified / 이용 허락: 미확인.** 2026-11-23 조사에서 고정 커밋의 누락 없는 비재귀 root/BG tree(`truncated: false`)를 각각 확인했다. root에는 README·LICENSE·LICENCE·COPYING이 없고 BG에는 PNG 25개만 있어 개별 크레딧이 없다. 전체 재귀 tree는 잘려 있으므로 저장소 전체에 대한 부재 근거로 사용하지 않는다. root의 `spritebot_credits.txt`는 기여자 목록이며 BG/Sky 대응이 없고, `transfer.json`·`custom_transfer.json`은 portrait/sprite 대상 매핑, `added_nodes.txt`는 포켓몬 형태 목록이라 Sky의 개별 근거가 되지 않는다. 저장소 메타데이터도 `license: null`이다. [파일 이력](https://github.com/PMDCollab/RawAsset/commits/0b88bbd7dec6f3373d5ec2b0f40bbdc3f44ce90c/BG/Sky.1.png)은 2021-03-02의 [Initial Commit](https://github.com/PMDCollab/RawAsset/commit/cc038f90d899bfa5ccc316e208d2fbbd2c6908f1)만 확인되며, 커밋 작성자를 그림 작가로 간주하지 않는다. 원작 게임/추출 경로도 개별 근거를 찾지 못했다. 동일 조직의 SpriteCollab 정책과 Sprite/Portrait 크레딧을 이 BG의 허가로 전용하지 않는다. MIT·CC·자유 이용을 선언하지 않는다.

기존 비공식·비상업 PMD 팬게임 범위에서 사용하는 자료이며, 출처 표시와 비상업 안내가 허가를 확보한다는 뜻은 아니다. Pokémon 관련 권리는 Nintendo / Creatures Inc. / GAME FREAK inc. 등 원 권리자에게, Pokémon Mystery Dungeon 원작 자료의 권리는 Chunsoft / Spike Chunsoft 등 관련 제작자·권리자에게 있다. [프로젝트 권리 고지](../../../../../README.md#라이선스와-크레딧)와 사용 중지/제거 방침을 유지한다.

원본 픽셀은 편집하지 않았다. Vite PNG import로 로컬 URL을 만들고 보드 surface의 CSS `cover`로 비율을 보존해 확대·중앙 crop한다. 옅은 단색 오버레이가 배경에만 적용되며 blur·이미지 생성·재그림은 사용하지 않는다. Phaser canvas는 투명하고, 이미지 로드 실패 시 기존 `#e8f0e4` 단색으로 돌아간다. 배경은 CSS 페인팅이므로 pointer 대상이나 별도 스크롤 영역을 만들지 않는다.

다른 후보 `BG/Cloudy_Sky.1.png`(720×152)는 가로로 긴 구름 띠라 다양한 보드 비율에서 더 많이 잘린다. Sky(320×240) 한 파일만 채택하고 다른 후보는 배포하지 않는다.
