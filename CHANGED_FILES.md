# 변경 파일 목록 (기준: Danmachi_Base_v1_2_1_approved_retry)

## v1.7.8-2bb-js1 — v1.7.8-2bb 대비 (근속 기록 `S.jobSince`, 결과 불변)

| 파일 | 내용 |
|---|---|
| script.js | `setJob` 근속 시작 갱신 1줄(+주석 2줄), `startLife` S 리터럴 `jobSince: 0` |
| tests/jobsince_test.js, tests/jobsince_mutation.js | 신규 |
| tests/sync_2i_test.js | r1 대조 제외 목록에 최상위 `jobSince`(+주석) |
| REPRODUCE.md(§10), CHANGELOG.md, CHANGED_FILES.md, logs/v178_jobsince/ | 기록·로그 |

## v1.7.8-2bb — v1.7.8-2ba-t1 대비 (2b-b, **결과 변경**)

| 파일 | 내용 |
|---|---|
| core/recruit.js | `RECRUIT_TUNING` 수치, `evaluateApplication` |
| core/lineage.js | `fnv` 공개(1줄) |
| script.js | `applyRecruit`·`recruitRng`·`recruitExcludedFamilias`·`recruitBlockReason`, `applyEffects` 의 `fx.recruit`, `classifyFalnaCause` 입단 경로에 `fx.recruit` 포함 |
| events.js | join·join_hard·latejoin·career_choice 입단 선택지 → `fx.recruit`(join_hard chance 제거) |
| test_runner.js | `recruit2bb` 통계·불변식, recruit 모델 검사 갱신 |
| tests/recruit_2bb_test.js, tests/recruit_2bb_mutation.js | 신규 |
| tests/sync_2i_test.js | M1·M10 을 심사 경로에 맞게 수정(+3항목) |
| REPRODUCE.md(문서판 bed12a99… + §9), CHANGELOG.md, CHANGED_FILES.md, DOCS_INDEX.md, logs/v178_2bb/ | 기록·로그 |

변경 없음: data.js, index.html, style.css, core/aging·growth·items·relations.js, 나머지 tests/*

---

## v1.7.8-2ba-t1 — v1.7.8-2ba 대비 (게임 코드 무변경, 테스트·문서만)

| 파일 | 내용 |
|---|---|
| tests/god_gone_2ba_test.js | GG-2g 난수 단언 `=== 1`, GG-7(실제 `choose()` chance 경유 성공·실패), GG-8(실패·포기 fx 구조: dropFamilia 없음·clearFlags=[adventurer]) → 68/68, 변이 7/7 검출 |
| tests/sync_2i_test.js | 레거시 픽스처 `legacyGG()` 를 한 번 생성해 같은 객체의 choice 전달(2곳) |
| tests/d3_wiring_mutation.js | 하위 프로세스 `FORCE_COLOR=0`·`NO_COLOR=1`, 판정 전 ANSI 제거 |
| REPRODUCE.md, CHANGELOG.md, CHANGED_FILES.md, DOCS_INDEX.md, logs/v178_2ba_t1/ | 수치 정정(35/35·68/68)·로그 경로·이력 |

변경 없음: script.js, events.js, data.js, core/*, index.html, test_runner.js

---

## v1.7.8-2ba — v1.7.8-ri-r1 대비 (2b-a, **결과 변경**)

| 파일 | 내용 |
|---|---|
| events.js | god_gone: `cond.falnaState:['active']`, 성공 `godReturn:'regrant'`, 실패·포기 `godReturn:'seal'`+`clearFlags:['adventurer']` |
| script.js | `applyGodReturn`·`rebaseSyncAfterTransition`, `applyEffects` ⑥a, `pickFamiliaCandidate(forcedId, opts.exclude)`, 재수여 시 `falna_again` 레벨 이력 |
| tests/god_gone_2ba_test.js | 신규(62항목) |
| tests/sync_2i_test.js | god_gone 기반 2-i 레거시 검사를 고정 픽스처 `legacyGG` 로 전환, 새 god_gone 검사 추가 |
| CHANGELOG.md, REPRODUCE.md, logs/v178_2ba/ | 기록·로그 |

---

## v1.7.8-ri-r1 — v1.7.8-ri 대비 (게임 결과 불변)

| 파일 | 내용 |
|---|---|
| script.js | `moveResidence` 방어 조건에 빈 이력 배열(`length === 0`) 추가 |
| tests/residence_ri_test.js | RI-11(빈 이력 5항목) → 35/35 |
| CHANGELOG.md, logs/v178ri_r1/ | 기록·로그 |

---

## v1.7.8-ri — v1.7.8-2i-r3 대비 (R-i 거주지 기록 전용, 게임 결과 불변)

| 파일 | 내용 |
|---|---|
| script.js | `S.residence`·`residenceHistory`·`service`, `moveResidence`·`recordService`, `applyEffects` ⑩ |
| events.js | `REGION_IDS`, `FAMILIA_HOME`(판정 미사용), conscript 수락·도주 성공 fx |
| test_runner.js | 생애 단위 거주 검사(`residenceRi`) |
| tests/residence_ri_test.js | 신규(30항목) |
| tests/sync_2i_test.js | r1 대조에서 R-i 최상위 3필드 제외 |
| CHANGELOG.md, REPRODUCE.md, logs/v178ri/ | 기록·로그 |

---

## v1.7.8-2i-r3 — v1.7.8-2i-r2 대비 (게임 코드 무변경)

| 파일 | 내용 |
|---|---|
| test_runner.js | D-3 측정 sink 교체 구조, 래퍼별 단일 연결 지점, 합성 테스트 실제 래퍼 경유 |
| tests/d3_wiring_mutation.js | 신규(연결 제거 변이 검사) |
| DEV_REPORT_v1.7.8-2i.md, README.md, REPRODUCE.md, CHANGELOG.md, CHANGED_FILES.md, logs/v178/ | 갱신·재실행 |

변경 없음: script.js, events.js, data.js, core/*, 기존 tests/*

---

## v1.7.8-2i-r2 — v1.7.8-2i-r1 대비 (게임 코드 무변경)

| 파일 | 내용 |
|---|---|
| test_runner.js | D-3 계측(소속 id 추적, showEvent·endLife 측정, 합성 테스트) |
| DEV_REPORT_v1.7.8-2i.md, CHANGELOG.md, CHANGED_FILES.md, logs/v178/ | 갱신·재실행 |

변경 없음: script.js, events.js, data.js, core/*, tests/*

---

## v1.7.8-2i-r1 — v1.7.8-2i 대비 (게임 동작 불변)

| 파일 | 내용 |
|---|---|
| script.js | 주석만(Q20 승인 표기) |
| test_runner.js | 단위 테스트 단계 예상 로그 assertion(`unitPhaseLogAsExpected`), 주석 |
| tests/sync_2i_test.js | N8j-2 false 3항목 명시 검증(130→132) |
| DEV_REPORT_v1.7.8-2i.md, CHANGELOG.md, CHANGED_FILES.md, logs/v178/ | 갱신·재실행 |

---

## v1.7.8-2i — v1.7.7-r1 대비

| 파일 | 내용 |
|---|---|
| script.js | 2-i 기록 필드·동기화 범위·판정 함수·모드 가드·전이 함수(미호출)·match 조건 키 |
| events.js | god_gone 성공 'rebind', familiaRole 3곳, canEnterDungeon 16곳 |
| test_runner.js | RNG 카운터·V1a·v178 계측(digest 계산식 불변) |
| tests/sync_2i_test.js, tests/equivalence_2i.js | 신규 |
| DEV_REPORT_v1.7.8-2i.md, README.md, REPRODUCE.md, DOCS_INDEX.md, CHANGELOG.md, CHANGED_FILES.md | 신규·갱신 |
| work/protected_gating.patch, work/WORKPLAN_protected_gating.md | D5 폐기 → archive/v1.7.7-r1/work_discarded_D5/ 로 이동 |
| logs/ | v1.7.8-2i 실행 로그 추가(logs/v178/) |

변경 없음: data.js, core/*, index.html, style.css, tests/regression_digest.js, tests/multi_seed_stats.js, tests/browser_test.js, sim_test.js, logs/baseline_lifeDigest_v174.json

---

## v1.7.7-r1 — v1.7.7 대비 (게임 코드 불변)

| 파일 | 내용 |
|---|---|
| tests/regression_digest.js | 구성 필터 |
| tests/browser_test.js | inline 로드·CHROMIUM_PATH·ENV 확장 |
| REPRODUCE.md, DEV_NOTE_v1.7.7-r1.md | 신규 |
| work/protected_gating.patch, work/WORKPLAN_protected_gating.md | 신규(미적용 준비안) |
| DOCS_INDEX.md, CHANGELOG.md, CHANGED_FILES.md | 갱신 |
| logs/ | 브라우저 로그 3종(file·inline·CHROMIUM_PATH), 회귀·3,000판 로그 재생성, ZIP 재실행 로그 |

변경 없음(v1.7.7과 동일): data.js, events.js, script.js, core/*, index.html, style.css, test_runner.js, tests/multi_seed_stats.js, sim_test.js

---

## v1.7.7 — v1.7.6 대비

| 파일 | 내용 |
|---|---|
| core/lineage.js | **신규.** 수인 하위 유형, 생애 파생 시드, 종족 표시명, 0~2세 성장 문구 |
| script.js | `levelLabel`/`recordLevel`/`recordChildhood`, 레벨 강조·이력, 종족 표시, 0~2세 기록, `familiaHistory[].role`, 결과 화면 |
| index.html | `core/lineage.js` 로드 |
| style.css | `.entry.levelup`, `.lv`, `.entry.growth` |
| test_runner.js | `v177` 단위 테스트·생애 검사·protected 이벤트 집계, `core/lineage.js` 로드 |
| tests/browser_test.js | 신규 검사 7항목, ENV 기록 |
| README.md, DOCS_INDEX.md, DEV_REPORT_v1.7.7.md | 재작성/신규 |
| archive/ | 구 문서·로그 이동(+유효성 공지) — `CHATGPT_REVIEW.md`, 구 README, `simulation_test_log.txt`, `test_seed_777.log`, `review_evidence/`, `DEV_REPORT_v1.7~v1.7.6.md`, 당시 로그 |
| logs/ | v1.7.7 로그 재생성, `regression_digest_v177.log` |

변경 없음: data.js, events.js, core/aging.js, core/growth.js, core/relations.js, core/items.js, core/recruit.js, tests/multi_seed_stats.js, tests/regression_digest.js, sim_test.js

---

## v1.7.6 (QA_AUDIT_v1.7.5 대응) — v1.7.5 대비 추가 변경

| 파일 | 내용 |
|---|---|
| data.js | `civilian` 레코드를 `kind:"none"`으로(canon/official 제거). 동작 불변 |
| core/recruit.js | `FAME_LABELS` → `FAME_LABELS_PERSONAL` / `FAME_LABELS_FAMILIA` |
| test_runner.js | civilian 분리 검사, 개인/파밀리아 라벨 검사 |
| logs/baseline_lifeDigest_v174.json | `off` 4시드 편입 |
| logs/regression_digest_v176.log | **신규**(v175 로그 대체) |
| DESIGN_PROPOSAL_status_separation.md | §9 소속 역할 모델 설계 추가 |
| DEV_REPORT_v1.7.6.md | 신규 |
| logs/ | 3,000판·다중 시드·브라우저 로그 재생성 |

게임 동작은 v1.7.5와 동일(회귀 10개 구성 일치).

---

## v1.7.5 (QA_AUDIT_v1.7.4 대응) — v1.7.4 대비 추가 변경

| 파일 | 내용 |
|---|---|
| core/recruit.js | **신규.** 2a 데이터 모델(비활성), 파생 RNG, minor 파밀리아 생성기 |
| data.js | 파밀리아 14개에 `kind:'canon'`, `official:true` (organizations 불변) |
| script.js | `S.application`, `S.minorFamilias`, `S.nextMembershipId`, 소속 이력 `id` (RNG 소비 없음) |
| index.html | `core/recruit.js` 로드 |
| test_runner.js | `lifeDigest`, 난수 상태 저장/복원, 2a 데이터 모델 단위 테스트 |
| tests/regression_digest.js | **신규.** v1.7.4 기준 동작 회귀 비교 |
| logs/baseline_lifeDigest_v174.json, logs/regression_digest_v175.log | **신규** |
| DESIGN_PROPOSAL_status_separation.md | §7 정정 + §8 신설 |
| DEV_REPORT_v1.7.5.md | 신규 |
| logs/ | 3,000판·다중 시드·브라우저 로그 재생성 |

---

## v1.7.4 (QA_AUDIT_v1.7.3 대응) — v1.7.3 대비 추가 변경

| 파일 | 내용 |
|---|---|
| tests/multi_seed_stats.js | 동시 실행 수 제한(`MAX_PARALLEL`) |
| events.js | `wargame` 주석 정정(동작 불변) |
| DESIGN_PROPOSAL_status_separation.md | §7 2단계 상세 설계 추가 |
| DEV_REPORT_v1.7.4.md, CHANGELOG.md, CHANGED_FILES.md | 갱신 |

게임 동작 코드(`script.js`, `core/*`, `data.js`)는 v1.7.3과 동일. 3,000판 로그는 재실행해 저장본과 동일함을 확인.

---

## v1.7.3 (QA_AUDIT_v1.7.2 대응)에서 v1.7.2 대비 추가 변경

| 파일 | 내용 |
|---|---|
| script.js | `rollAffiliation` 삭제, `apply`의 `fx.organization`, `joinOrganization(id)`, `rollFamilia(forcedId)`, `setAspiration`/`aspiration` 기록과 표시 |
| events.js | `wargame` 소속 조건, `career_choice` 주점 선택지·조직 고용, 서포터 2종 분리(`free_supporter_route` 신규), `EVENT_AREA` 갱신(81개) |
| test_runner.js | 일반화된 게이트 검사, 서포터 규칙, `rollIsFamiliaOnly`·부모 소속 대조군·aspiration 불변식, `invariantFailures` 출력 |
| tests/multi_seed_stats.js | 허용 모드 검증, 모드명 `newborn_parent_familia` |
| DEV_REPORT_v1.7.3.md | 신규. DEV_REPORT_v1.7.1/1.7.2에는 정정 공지 추가 |
| DESIGN_PROPOSAL_status_separation.md | QA 권고 반영 메모 |
| logs/ | 전부 재생성 |

---

## v1.7.2 (QA_AUDIT_v1.7.1 대응)에서 v1.7.1 대비 추가 변경

| 파일 | 내용 |
|---|---|
| data.js | `familias`에서 `hostess`·`guild` 제거, `organizations` 신설 |
| events.js | `EVENT_AREA` 전수 분류, `MODS.organizations`, `PARENT_FAMILIA_BIAS`, `NEWBORN_MEMBERSHIP`, 던전 4개 이벤트 명시적 팔나 조건, `dungeon:true` 속성 제거 |
| script.js | `familiaHistory`/`falnaHistory`/`employer`/`parentFamilia`, `rollAffiliation`/`joinOrganization`/`openMembership`/`closeMembership`, 부모 소속 기록, `JOB_ORG` |
| test_runner.js | 카탈로그 감사, 조직 분리·이력·부모 소속 단위 테스트, 이력 기반 입단-팔나 집계, `SIM_NEWBORN_MEMBERSHIP` A/B |
| tests/multi_seed_stats.js | 재작성(단언·exit code·병렬) |
| DESIGN_PROPOSAL_status_separation.md, DEV_REPORT_v1.7.2.md | 신규 |
| logs/ | 전부 재생성(`multi_seed_stats.log`은 4시드 × physical/legacy_newborn/calendar/off) |

---

## v1.7.1 (QA_AUDIT_v1.7 재작업)에서 v1.7 대비 추가 변경

| 파일 | 내용 |
|---|---|
| script.js | `recoverYearly(rate)` 육체 나이 비례 회복, `tryRescue()`(연간 피해 후·선택 후 공용), `endLife` 체력 0 고정, `familiaAt` 기록 |
| events.js | `HP_REGEN_MODE`, 던전 이벤트 6개 `dungeon:true` + `flags:['falna']` |
| test_runner.js | HP 불변식, 포션·회복 단위 테스트, 던전 게이트 전수 점검, 종족별 통계, 입단-팔나 연표, A/B 스위치(`SIM_HP_REGEN_MODE`) |
| tests/multi_seed_stats.js | 신규. 4시드×3방식 통합 통계 |
| logs/ | `multi_seed_stats.log`, `ab/*.log`, `browser_test_24lives.log`, 시드 2종 3,000판 로그 재생성 |
| DEV_REPORT_v1.7.1.md | 신규. 재작업 보고서 (v1.7 보고서는 `DEV_REPORT_v1.7.md`로 보존) |

## v1.7 전체 변경 (기준 대비)

| 파일 | 구분 | 내용 |
|---|---|---|
| core/relations.js | 수정 | 가족 NPC, 자녀, NPC 노화·사망, 파트너 종족/팔나/레벨 |
| core/aging.js | 수정 | NPC 노화, 공용 자연사 확률 |
| core/growth.js | 수정 | 팔나 시 잠재력 이월, 연간 엑세리아 |
| core/items.js | 신규 | 장착·사용 횟수·소모·체력 상한 |
| script.js, events.js | 수정 | 위 항목 및 v1.7 전체 |
| index.html, style.css | 수정 | `core/items.js` 로드, 관계/소지품 표시 |
| tests/browser_test.js | 신규 | 실제 Chromium 테스트 |

변경 없음: data.js, sim_test.js, CHATGPT_REVIEW.md, review_evidence/, simulation_test_log.txt, test_seed_777.log
