# 시험칸 플레이어 가림 수정

기준 `a18c2c4`, 담당 `fix/trial-pawn-occlusion`. 루기아/칠색조 시험칸에서 플레이어가 큰 모형 뒤로 사라지는 현상을 실제 Phaser + HTML HUD로 재현하고 수정했다. 적용 대상은 Phaser의 정지 발 위치와 sprite/shadow depth 계산뿐이다. label 생성·폰트·render 설정, 원본 에셋, 경제·AI·승리·특성·시드·RNG·권위 타일 position·이동 횟수는 변경하지 않았다. 저장소 및 상위 경로에서 적용할 `AGENTS.md`는 발견되지 않았다.

## 실제 원인과 시각적 범위

기존 `pawnFoot`의 네 좌석을 1.55배 펼치면 가장 뒤쪽 첫 좌석은 칸 중심보다 약 15.05px 위에 선다. 반면 `modelPlacement`의 모형 정렬 기준은 중심보다 1.92px 위다. 둘 다 발/기준점의 y로 depth를 계산하므로 첫 좌석이 모형보다 먼저 그려진다. 나머지 좌석은 같은 정도로 가려지지 않는다.

실제 칠색조 시험칸의 첫 좌석은 발 `(498.62, 130.50)`, sprite depth `2306`, 탑 depth `2436`이었다. 기준 캡처에서 이상해씨가 탑 뒤로 완전히 사라졌다. 루기아 칸도 첫 좌석 depth `4350`이 모형 `4481`보다 낮아 바위/수면에 가려졌다. 모형은 두 장면 모두 64 × 76.8의 독립 이미지다. 방울탑은 네 층의 지붕과 꼭대기 장식(원본 z=63)을 포함하므로 단순한 타일 중심점만으로 캐릭터 가림을 판단할 수 없다. 루기아 장면은 낮지만 넓은 수면·바위 범위가 문제였다. 원본 그림과 모형 배치는 유지했다.

## 수정 방식

`occlusion.ts`의 `standingFoot`는 `kind=special`이며 공개 `special` 값이 `lugia-trial` 또는 `ho-oh-trial`인 칸만 처리한다. 네 자리를 앞쪽 부채꼴로 놓는다. 현재 맵 기준 중심 상대 좌표는 바깥 두 자리 `(±25.6, +7.85)`, 안쪽 두 자리 `(±8.96, +17.17)`이다. 네 발은 모두 원래 다이아몬드 안에 있고, 좌우 최소 간격은 16.64px다. 모형 양옆과 앞에서 각 캐릭터를 읽을 수 있다.

`foot()`을 공유하므로 초기/권위 스냅샷 재정렬, 시험 연출 복귀, 걷기 경유·도착, 비행 착지, 감소 모션 재정렬이 같은 자리를 사용한다. 권위의 칸 ID나 경로를 옮기지 않는다. `pawnDepth`는 기존 공용 `depthOrder`를 사용해 지면 발의 depth에 그림자, 그 바로 다음에 sprite를 둔다. 비행 고도는 sprite의 화면 y만 올리고 정렬은 그림자의 지면 접점을 따른다.

모형 depth는 그대로다. 수정 후 칠색조의 sprite depth는 `2535/2628`, 루기아는 `4580/4673`이다. 다음 앞쪽 인접칸의 모형 depth는 이들보다 높게 유지된다. 전체 캐릭터를 도시 위의 고정 최상단으로 올리거나 모형을 반투명하게 만들지 않았다. 일반 도시·명소·출발·비행칸은 기존 좌표를 그대로 반환한다.

## 재현과 증거

5189 포트가 비어 있음을 확인한 후 `--strictPort`로 실행했다. 실제 게임 주소는 <http://127.0.0.1:5189/>다.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --strictPort
$env:OCCLUSION_PHASE = 'after'
node src/ui/game/phaser/occlusion-browser-check.mjs
```

브라우저는 설치된 Chrome **157.0.8103.80**, viewport는 **1280 × 1100 / 390 × 1100**이다. 1280/390은 화면 폭이며 Chrome 버전 128이라는 의미가 아니다. Playwright는 기존 도구 설치를 읽기 전용으로 재사용하며 `PLAYWRIGHT_PATH`로 경로를 지정할 수 있다.

전후는 같은 카메라·원본 모형·Idle 0번 프레임·공개 스냅샷을 사용했다. before는 이 워크트리의 `index.ts`만 기준 커밋 내용으로 일시 복원해 캡처했고 즉시 수정본으로 복구했다. 기본 `?before` CSS 프리뷰 비교가 아니라 **실제 Phaser끼리** 비교했다.

다음 증거는 이 워크트리의 무시된 `artifacts/trial-pawn-occlusion/`에 로컬 보존하며, 커밋에는 재생성 가능한 fixture와 문서를 포함한다.

| 장면/폭           | 수정 전                                                                            | 수정 후                                                                     |
| ----------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 칠색조 1명 / 1280 | [탑 뒤 완전 가림](../artifacts/trial-pawn-occlusion/before-ho-oh-trial-1-1280.png) | [앞쪽 자리](../artifacts/trial-pawn-occlusion/after-ho-oh-trial-1-1280.png) |
| 칠색조 4명 / 1280 | [전](../artifacts/trial-pawn-occlusion/before-ho-oh-trial-4-1280.png)              | [후](../artifacts/trial-pawn-occlusion/after-ho-oh-trial-4-1280.png)        |
| 루기아 4명 / 1280 | [전](../artifacts/trial-pawn-occlusion/before-lugia-trial-4-1280.png)              | [후](../artifacts/trial-pawn-occlusion/after-lugia-trial-4-1280.png)        |
| 칠색조 4명 / 390  | [전](../artifacts/trial-pawn-occlusion/before-ho-oh-trial-4-390.png)               | [후](../artifacts/trial-pawn-occlusion/after-ho-oh-trial-4-390.png)         |
| 루기아 4명 / 390  | [전](../artifacts/trial-pawn-occlusion/before-lugia-trial-4-390.png)               | [후](../artifacts/trial-pawn-occlusion/after-lugia-trial-4-390.png)         |

[전체 후 검증/좌표 보고서](../artifacts/trial-pawn-occlusion/after-report.json), [전 좌표 보고서](../artifacts/trial-pawn-occlusion/before-report.json). 각 시험·폭에 zoom 및 reduced 캡처도 있다. 1280/390에서 전체 도시 배치와 HUD를 유지하고 네 캐릭터의 위치를 확인했다.

## 검증과 한계

- 전용/인접 회귀 21개 통과. 두 시험에 대해 모든 변·모서리의 다이아몬드 내부 발, 네 좌석 간격, 자기 모형보다 앞/인접 전경 모형보다 뒤, 일반 칸 좌표 불변, 지면 depth 보간을 검사한다.
- 전체 `node --experimental-strip-types --test`: 166/166 통과. 경제·AI·승리·특성·전설·시드 테스트 포함. 처음 옵션 없이 실행한 검사는 기존 `.ts` import를 로드하지 못했으며 올바른 Node 22 옵션으로 재실행했다.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run format:check` 통과. 빌드에는 기존 Phaser 500KB 초과 chunk 경고가 남는다.
- 실제 Phaser + HUD에서 두 시험 × 두 폭 × 1명/4명 고정 캡처. 인트로 종료 복귀, 실패 체류, 로프 뒤 같은 칸 정지, 이탈·걷기 경유, 비행 착지, 확대/전체 보기, 감소 모션에서 연출·이동·4명 재정렬을 확인했다. 이동 중 각 프레임의 sprite/shadow 정렬도 검사했고 비행은 약 75px 고도를 실제 관측했다.
- fixture는 공개 통합 adapter의 seed 42 초기 `GameView`를 받아, 테스트용 위치·전설 체류 상태를 복제하고 공개 `subscribe`의 `UIUpdate` 경계로 전달한다. 실제 경제 명령을 실행하거나 시험 성공률을 해결하지 않는다. 잔액·보유물·경제 상태·core RNG·차례가 변하지 않는지 별도 확인한다. 시험 실패/로프 이벤트와 위치는 합성된 시각 fixture이며 실제 거래·보상·실경제 플레이 성공 증거가 아니다. Chrome scene 접근은 좌표 측정과 고정 프레임 캡처에만 사용한다.
- 390 전체 보기의 캐릭터는 원래 FIT 축척 때문에 작다. 확대 기능과 함께 사용해야 세부 스프라이트가 읽힌다. 네 실루엣의 일부 겹침과 자연스러운 이동 중 전경 가림은 남지만, 같은 시험칸에 정지한 플레이어 전체가 모형 뒤로 사라지지 않는다. 원본 모형/스프라이트 크기가 크게 바뀌면 앞쪽 자리 간격을 다시 검증해야 한다.

main 병합·푸시·배포는 수행하지 않았다.
