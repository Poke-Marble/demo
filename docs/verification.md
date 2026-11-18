# 초기 기반 검증 및 인계

검증일: 2026-11-18. Windows / Node.js 22.17.0 / Chrome 로컬 화면에서 확인했습니다.

| 항목                    | 결과                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `npm run typecheck`     | 통과, 엄격 모드 및 미사용 검사                               |
| `npm run lint`          | 통과, 경고 0                                                 |
| `npm run format:check`  | 통과                                                         |
| `npm run build`         | 통과, CSS 경고 제거 후 최종 빌드 성공                        |
| `npm run data:generate` | 통과, 네트워크 없이 4종 생성                                 |
| 한국어 JSON 재현성      | 재생성 전후 SHA-256 동일                                     |
| 샘플 데이터 연결        | 이상해씨·파이리·꼬부기·피카츄 4종과 8개 애니메이션의 ID 일치 |
| `npm run assets:verify` | 20개 원본 에셋·크레딧·정책 파일 해시 일치                    |
| 기본 Chrome 화면        | 한국어 이름·분류와 네 포켓몬 Idle 이미지 표시 확인           |
| 선택 상태               | 4인 슬롯과 포켓몬 교환 결과 확인                             |
| 실패 대체·복구          | 네 포켓몬 `?` 및 한국어 대체 상태, 해제 후 Idle 복구 확인    |
| 버전 관리 제외          | `node_modules/`, `dist/` ignore 확인                         |

브라우저 확장 연결이 불가해 Windows 앱 제어로 확인했습니다. 드롭다운 조작 도구가 불안정하여 **Walk·8방향 전체 조합, 참가 인원 변경의 모든 경로와 반응형 크기는 브라우저에서 전수 검증하지 않았습니다.** 코드의 시트 크기·8방향 행·프레임 타이밍 입력은 수집 단계에서 검증합니다. 자동 브라우저 테스트 환경은 추가하지 않았습니다.

오프라인 가공 JSON SHA-256:

```text
b4e855e7f4a79bd775cb10ed7dae0e1cf9e6e49f99cc3ca757d65f4eb90929fd
```

## 병행 개발 인계

- `feat/game-core`는 `src/game/core`, `feat/kanto-johto-map`은 `src/data/maps`, `feat/game-ui`는 `src/ui/game`를 담당합니다. 초기 세팅에서는 이 경로를 생성·수정하지 않았습니다.
- 공통 타입은 `src/game/contracts.ts`, 샘플은 `src/data/sample-map.ts`입니다. `schemaVersion: 1`은 초안이며 게임 규칙을 보장하지 않습니다. [ID 및 참조 규칙](contracts.md)을 함께 확인하세요.
- 포켓몬 카탈로그는 `src/data/pokemon.ts`, 스프라이트 조회는 `src/assets/sprites.ts`, 기본 재생 컴포넌트는 `src/ui/sprite.ts`를 재사용할 수 있습니다.
- 앱 진입점은 `src/main.ts`에서 `src/ui/app.ts`의 기반 화면을 마운트합니다. 후속 게임 UI 통합 시 이 연결을 조율해야 합니다. 준비 화면 선택은 영속화하거나 GameState에 반영하지 않습니다.
- 전체 지도·경제·규칙·승리 판정·온라인·AI·전설 기믹은 초기 기반에 구현하지 않았습니다.
- 자체 코드 라이선스, 원작 스프라이트 별도 허락, 삭제 요청 수신 창구는 미정입니다. 특히 기본 4종의 `CHUNSOFT / Unspecified` 기록을 일반 팬 제출물의 CC BY-NC 허락으로 바꾸지 마세요.
- 로컬 기반 커밋만 생성합니다. 원격 푸시·공개 배포·main 머지는 수행하지 않습니다.
