# Poké Marble 표시명 변경 확인

기준: `098d23d`. 사용자에게 보이는 게임 이름만 `Poké Marble`로 통일했다. `é`는 U+00E9다.

- 웹 title·description, 새 게임 시작 화면, 보드 헤더, 결과창 제목 및 독립 UI 프리뷰의 게임 이름을 변경했다.
- `src/ui/game/index.ts`는 세 문자열만 변경했다. 저장소 slug, 파일명, ID, package 이름, PokeAPI 및 외부 원문은 유지했다.
- README는 별도 커밋으로 공개 프로젝트 소개·현재 규칙·실행·접근성·권리 안내 중심으로 작성했다. 기존 개발 기록은 docs에 유지한다.

## 검사

- `npm ci`: 성공, package/lockfile 변경 없음.
- 변경 파일 Prettier 검사, `git diff --check`, `npm run lint`, `npm run build`: 성공.
- Vite의 기존 큰 번들 안내는 남아 있다.
- README 상대 링크 17개는 모두 존재하며 외부 링크 5개는 HTTP 200을 확인했다.
- fontTools로 로컬 `Galmuri11.woff2`의 cmap에서 U+00E9 → `eacute`를 확인했다. 글꼴 파일이나 라이선스는 수정하지 않았다.
- 5216은 이 작업 폴더의 Vite 개발 프리뷰다: http://127.0.0.1:5216/ .

## 실제 Chrome 검사 한계

Windows의 실제 Chrome 창을 열어 프리뷰로 이동하려 했으나 컴퓨터 사용 도구가 현재 브라우저 URL을 충분히 신뢰할 수 없다고 판단해 자동 중단했다. 이후 UI 자동화를 재시도하지 않았다. **PC/mobile 실제 렌더링과 결과창 시각 검증은 미완료**다. cmap 확인은 시각 검증을 대신하지 않는다. 통합 담당자가 최종 후보에서 확인해야 한다.

## 통합 후 README 검토 경계

현재 진행 중인 누적 3인 전설 맵 이벤트·도착 보상, START 원격 유료 건설, 보드 직접 비행 선택·탑승 연출, 소유지 패널 개선은 완료로 서술하지 않았다. 통합 담당자가 최종 검증한 기능만 README에 반영한다.

탑승 담당의 조사 결과(실제 QA 미완료): SpriteCollab `948c79de39e3fe3067f1fd26294e19d864325cc9`의 [0823 원본](https://github.com/PMDCollab/SpriteCollab/tree/948c79de39e3fe3067f1fd26294e19d864325cc9/sprite/0823), Idle/Hover 사용 계획. 현재 기여자는 Soulja, 개별 기록은 `CC_BY-NC_4`, 팬 제작 PMD 스타일로 보고받았다. 최종 `src/ui/game/events/mounted/assets/manifest.json`과 개별 credits·원문 정책을 통합 후 대조하고 그때 README에 사용 자료로 추가해야 한다. 기존 CHUNSOFT 원작 추출물의 `Unspecified`와 섞지 않는다. 이 조사 결과는 Pokémon 원 권리자의 별도 허가 확인을 뜻하지 않는다.
