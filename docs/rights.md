# 원 출처 권리 검토 기록

확인일: **2026-11-18**. 아래는 확인한 출처의 기록이며 원 권리자의 별도 허락 또는 법률 판단을 대신하지 않습니다.

## PMD SpriteCollab

공식 사이트 <https://sprites.pmdcollab.org/>가 연결하는 원 저장소 `PMDCollab/SpriteCollab`에서 확인했습니다. 재현 버전은 `1a294bec85e309d023c0b074617462c6c6b44a31`입니다.

- [원 README](https://github.com/PMDCollab/SpriteCollab/blob/1a294bec85e309d023c0b074617462c6c6b44a31/README.md)의 `SUBMISSION AND USE POLICY`: 제출자는 비상업 목적과 적절한 크레딧 조건으로 복제·재배포·수정·2차 작업을 허용하며 CC BY-NC 4.0을 참조합니다. `POLICY ON OFFICIAL SPRITES`는 Chunsoft 원작 스프라이트가 따로 존재함을 명시합니다.
- [현재 LICENSE.md](https://github.com/PMDCollab/SpriteCollab/blob/1a294bec85e309d023c0b074617462c6c6b44a31/LICENSE.md): CC BY-NC 4.0 전문입니다. 이용 조건에는 비상업 사용, 제공된 제작자/저작권/출처/라이선스/면책 고지 유지, 변경 사항 표시 등이 있습니다. 허락은 라이선서가 허락할 권한이 있는 권리 범위에 한합니다. 상표권과 제3자 권리 전체의 허락을 의미하지 않습니다.
- `license_history/LICENSE.PMDCollab_1.md`: 이전 식별자에 대한 원문은 원 제작자 크레딧을 유지하는 조건으로 이용·복제·재배포·수정을 허용한다고 기록합니다. 이를 현재 모든 슬롯에 일괄 적용하지 않습니다.
- 샘플 4종의 기본 슬롯 `sprite/0001`, `0004`, `0007`, `0025`의 `credits.txt`는 모두 **`CHUNSOFT / CUR / Unspecified`**입니다. 해당 행의 애니메이션 목록에 Idle·Walk가 포함됩니다. `tracker.json`의 primary도 `CHUNSOFT`이며 추가 팬 제작자는 기록되지 않았습니다. `credit_names.txt`는 CHUNSOFT의 링크를 <https://www.spike-chunsoft.com/>로 제공합니다.

| 대상     | 슬롯   | 개별 제작자 | 개별 라이선스 | 이번 사용               |
| -------- | ------ | ----------- | ------------- | ----------------------- |
| 이상해씨 | `0001` | CHUNSOFT    | Unspecified   | Idle·Walk 원본 PNG, XML |
| 파이리   | `0004` | CHUNSOFT    | Unspecified   | Idle·Walk 원본 PNG, XML |
| 꼬부기   | `0007` | CHUNSOFT    | Unspecified   | Idle·Walk 원본 PNG, XML |
| 피카츄   | `0025` | CHUNSOFT    | Unspecified   | Idle·Walk 원본 PNG, XML |

따라서 이 네 원작 스프라이트에 대해 **CC BY-NC 허락이 검증되었다고 표시하지 않습니다**. 원 권리자의 별도 이용·재배포 허락은 확인되지 않았습니다. 로컬 기술 검증용으로 보관하고 있으며 공개·재배포 전에는 개별 권리 검토 또는 허락된 대체 에셋 확보가 필요합니다. 비상업·크레딧 표기가 이 미정 사항을 해소하지 않습니다.

PNG/XML은 변형하지 않았고 표시 단계에서만 자르기·확대·애니메이션을 적용합니다. 원본 정책·라이선스 전문·개별 credits는 `src/assets/vendor/`에 보관하며 `src/assets/generated/sprites.json`에 파일별 출처와 SHA-256을 기록합니다. `trackerCredit`와 제작자 레코드는 같은 고정 커밋의 tracker/names에서 추출했습니다. 일반 팬 제출물을 추가할 때는 해당 파일의 개별 조건을 다시 확인해야 합니다.

## PokéAPI

<https://pokeapi.co/docs/v2/>의 Information / Fair Use Policy / Pokémon / Pokémon Species를 확인했습니다.

- 공개 GET API이며 요청한 리소스의 로컬 캐시를 권고합니다. 스크립트는 명시한 4종의 `pokemon`과 `pokemon-species`만 순차 수집합니다.
- 한국어 명칭은 species의 `names`, 한국어 분류는 `genera`에서 언어 `ko`로 선택합니다. 한글 이름을 수동 추정하지 않습니다.
- 응답 원본·URL·수집 시각·해시를 보관하고, 실행 화면은 가공한 로컬 JSON만 import합니다.
- 문서의 API 사용 가능 안내와 API 서버 코드의 라이선스를 포켓몬 캐릭터·명칭·자료 전체의 권리 허락으로 확대하지 않습니다. 이 프로젝트 자체 코드의 라이선스도 외부 데이터에 적용하지 않습니다.

## 참고 README와 자체 코드

<https://github.com/pmd-fan-web/pmd-fan-web.github.io>는 문서의 항목 구성만 참고했습니다. 자체 구현에 참고 저장소 코드나 AGPL을 가져오지 않았습니다. 참고 문서의 라이선스 설명을 원 출처 검토 대신 사용하지 않았습니다. 자체 코드 라이선스는 미정이고 의존성은 각 패키지 라이선스를 유지합니다.

## 삭제 요청

원 권리자와 개별 제작자의 권리를 존중하며 요청이 접수되면 사용 중지, 파일·생성 데이터·관련 빌드 제거와 영향 범위 검토를 수행할 방침입니다. 실제 접수 연락처와 운영 담당자는 미정입니다. 가상의 이메일·주소·양식이나 다른 프로젝트의 접수 창구를 기재하지 않습니다. 공개 전 운영자가 실제 창구를 확정해야 합니다.
