# Regional pixel assets

현재 렌더에서는 아래 평면 PNG를 사용하지 않는다. 후속 공통 투영 건축 세트로 교체했으며, 이전 커밋의 출처·조건·해시 기록 보존을 위해 파일을 유지한다. 현재 건설 상태 API와 채택 판단은 `../../art/construction-models.md`를 참고한다. 새 건축·수목은 외부 비트맵이 아닌 repo-native SVG 코드다.

2026-11-18 원문 확인: https://eeveeexpo.com/resources/565/ — Foxowl, “Public Gen 3 Tiles!” (2021-02-28).

원문 사용 조건: “Enjoy, they're free to use (with credit to me and the people I specified).”
다운로드: https://i.imgur.com/eL2B8ix.png (TailwindTiles, 256 × 3904 RGBA).
원본 시트 전체는 배포하지 않고 아래 5개 무변형 사각 크롭만 보관한다. PNG 재인코딩 외 색상/리터칭 없음. 좌표는 `crops.json`의 left/top/right/bottom (right/bottom 제외), 원본/출력 SHA-256은 `credits.json`.

| 파일          | 원문 크레딧 적용                                                              |
| ------------- | ----------------------------------------------------------------------------- |
| center.png    | 전체: Foxowl, TheDeadHeroAlistair, Game Freak. 센터 하단: TheDeadHeroAlistair |
| gym.png       | 전체 크레딧 + 녹색/청색 체육관: TheDeadHeroAlistair                           |
| port.png      | 전체 크레딧 + 항구: Vurtax, Acanthite Team, Palladium Forums                  |
| tree.png      | 전체: Foxowl, TheDeadHeroAlistair, Game Freak (개별 제작자 별도 명시 없음)    |
| townhouse.png | 전체: Foxowl, TheDeadHeroAlistair, Game Freak (개별 제작자 별도 명시 없음)    |

이는 CC0/오픈소스 재라이선스가 아니다. 팬 제작·편집 기여 사용 조건과 Game Freak 등 원저작권은 별개다. 원문이 공식 권리자의 상업 이용 허가까지 제공한다고 주장하지 않는다. 모든 사용 화면에 전체 크레딧을 유지하고 배포 조건 검토 시 이 기록을 함께 전달한다.

후보 684(https://eeveeexpo.com/resources/684/)도 원문 확인: Mezz8118/ST1107, TheDeadHeroAlistair, Rejuvenation Team, 크레딧 필수·상업 사용 금지. 스타일/부분별 구분 및 최소 다운로드 원칙으로 미사용. PMDCollab/RawAsset은 폴더 구조까지만 확인했으며 개별 파일 권한이 확인되지 않아 미사용. 루기아 동상·물고기 가게도 미사용.

방울탑, 전통 처마, 출발 게이트, 비행 표지, 바위/소용돌이는 `art/regional.ts`에서 만든 작은 코드 픽셀 장식이다. 공식 게임의 해당 건물 스프라이트나 AI 생성 이미지가 아니다.

## 플레이테스트 후 정면부 선별 (2026-11-18)

체육관의 큰 청색 지붕과 항구의 주황색 지붕·보트는 탑다운 면적이 커서 수직 빌보드에 어울리지 않아 제외했다. 같은 원본의 체육관 정면 입구(원본 32,3152–192,3232), 항구의 중앙 PORT 표지·정면부(96,720–192,800)만 유지한다. 항구는 작은 코드 잔교로 보완한다. 주택은 상단 투명 2px만 제거(0,1106–160,1280)했다. 이미지 회전·원근 왜곡·색상 변경은 없다. 변경 크롭 좌표와 SHA-256을 갱신했다. 원저작자 및 재사용 조건은 동일하며, 모든 장면의 ‘아트 크레딧’을 열어 확인할 수 있다.

모든 원본 픽셀은 SVG 내부에서 0.5배로 표시하고, 발밑 (50,108)에 맞춘다. 2.5D 지면 위의 동일한 64×76.8 scene-unit 빌보드이며, 시설 강화가 이미지 배율을 바꾸지 않는다. 배율·최소 보드폭 640은 조정 가능한 시각 가정이다.
