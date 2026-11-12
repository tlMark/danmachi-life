# 던만추 인생 시뮬레이터 — v1.7.8-2i (개발 기준점)

팬 게임입니다. 브라우저에서 `index.html`을 열면 실행되며 외부 패키지가 필요 없습니다.
현재 상태 요약은 `DEV_REPORT_v1.7.8-2i.md`, 모든 문서의 버전·유효성은 `DOCS_INDEX.md`를 보세요.

## 모듈 로드 순서 (`index.html`)

1. `data.js` · 2. `events.js` · 3. `core/aging.js` · 4. `core/growth.js` · 5. `core/relations.js` · 6. `core/items.js` · 7. `core/recruit.js`(2a 비활성 모집 데이터 모델) · 8. `core/lineage.js`(수인 하위 유형·0~2세 성장 기록) · 9. `script.js`

`core/*.js`는 브라우저 전역 `GameCore`에 등록되는 IIFE 모듈이며 `require`/`module.exports`에 의존하지 않습니다.

## 현재 기능 요약 (상세: `CHANGELOG.md`)

- 가족 NPC·연애·사별, 달력 나이/육체 나이 분리(`cond.age`=육체, `cond.cage`=달력), 엑세리아·레벨업(공식 불변), 아이템 장착·소모, HP 회복(육체 나이 비례)
- 이벤트 81개 전부 영역 분류(`EVENT_AREA`), 던전 이벤트는 팔나 필수, 프리 서포터 예외는 별도 이벤트
- 파밀리아와 조직(길드·주점) 분리, 소속 이력(`familiaHistory`, `role: member|protected`)과 팔나 이력(`falnaHistory`)
- v1.7.8-2i: 팔나 상태(`none`/`active`/`unbound`/`sealed`) **기록 전용** 동기화, 입단 호출 모드, 판정 함수 정의(성장 경로 미연결), 소속 역할 게이트 일부 — 게임 결과(digest 10/10)·난수 소비 불변
- v1.7.7: 수인 하위 유형(표시 전용, 일부 비공식 설정), 레벨 표기(`팔나 없음`/`Lv.N`/`봉인(Lv.N)`)와 레벨 변화 강조·이력, 0~2세 성장 기록

## 미구현 (설계만 있음)

모집 2b~2d(입단 판정·경로·명성), 상태 분리 3~4단계(팔나 전 모험자 직업 제거), 층수·지역·현재 위치·세계 연도. 설계: `DESIGN_PROPOSAL_status_separation.md`.

## 테스트

```bash
for f in *.js core/*.js tests/*.js; do node --check "$f"; done        # 문법
node test_runner.js                                                     # Mock DOM, 실제 소스, 3,000생애 + 단위 테스트 (SIM_SEED / SIM_RUNS / SIM_HP_REGEN_MODE / SIM_NEWBORN_MEMBERSHIP)
node tests/regression_digest.js                                         # 동작 회귀: 10개 구성 lifeDigest 기준 비교
node tests/sync_2i_test.js <v1.7.7-r1 폴더>                              # 2-i 단위·시나리오(격리 vm), r1 대조 포함
node tests/equivalence_2i.js <v1.7.7-r1 폴더> [필터]                     # r1 대비 digest·RNG 호출 해시·경로 횟수 동일성
node tests/d3_wiring_mutation.js                                        # D-3 계측 연결 제거 변이 4종이 모두 실패하는지(exit 1) 확인
node tests/multi_seed_stats.js 3000 20261104,777,314159,8675309 physical,newborn_parent_familia,calendar,off   # 다중 시드 (MAX_PARALLEL)
npm i playwright && npx playwright install chromium && node tests/browser_test.js 24   # 실제 Chromium, file://로 index.html 직접 열기
```

`test_runner.js`는 Mock DOM, `tests/browser_test.js`는 실제 Chromium입니다. 외부 QA 환경처럼 `file://`가 차단되는 곳에서는 브라우저 테스트가 실행되지 않으며, 그 경우 결과를 통과로 간주하지 않습니다.
