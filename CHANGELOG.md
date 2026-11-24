# 검토 반영 내역

## v1.7.8-n2 - 2026-11-24 (F1D4A N2 2-ii 팔나 연결 + RB-1 (가) 원자 롤백, **관문 비활성 — 결과 불변**)

- 승인: 사용자 결정 2026-11-23(RB-1a~RB-1g 권장안 전부, N2 세부 결정, N2 구현 착수). 설계 정본 `docs/f1d4a/REVIEW_v27.md`·`DECISION_LOG_v19.md`. ChatGPT 1차 r4·r4v·r4v2 통과, Codex 2차(r4) 조건부 통과.
- `script.js`: RB-1 (가) 확장 롤백(descriptor 기준 스냅숏·예외 시점 관찰·묶음별 격리·`rollback`/`input` 보고·S 밖 실패 기록), `canConvertExcelia`, N2-2 관문, `N2_GATES { growth: false, dungeon: false }`, `statusResumeAge` null, N2-3c, `patronAbsence`(A1~A7, 사유 목록 비어 있음), A3 S1~S5(`leaveFamilia` 미연결, Q5).
- 테스트: 신규 `n2_rollback_test`(191)·`n2_link_test`(72)·`n2_array_realm_browser_test`(12 ×2)·`n2_browser_rollback_test`(23 ×2). 의도적 시험 변경 6건(RB-T3, PF-9d, GG-2e, GG-2 fixture, T7, rng_sites 표).
- 결과: 관문 꺼짐에서 두 시드 P5 기준선 바이트 동일, lifeDigest·rng 10/10, 48k 32/32 SHA 동일. 기준선 미갱신. 관문 켬(측정 사본) 결과·일괄 변환 측정은 보고서 §4.
- 미완료·미실행: Codex 독립 재현, Windows file://, 관문 켬 Chromium·48k. 상세 `DEV_REPORT_v1.7.8-n2.md`, 로그 `logs/v178_n2/`.

## v1.7.8-2bb-js1-f1 - 2026-11-10 (T1-F/F-1: join_hard 거절·차단 후속 선택·서포터 전직, **결과 변경**)

- 승인: 결정 `DECISION_T1F_F1_r9.md`, 설계 r1~r7·`F1D4A_DECISIONS_after_r7.md`, ChatGPT r7 최종 QA(N1-6·N1-6b 승인, 구현 착수 지시), 사용자 결정 P2·O2·A안·N6-5·N6-6·N1-6c·N2-4·N6-3·Q-P·N3-1.
- `events.js`: join_hard "끈질기게" 의 `fallback` 삭제(C23), 거절 문구 `{familia}의 심사에서 탈락했다.`, `followup: 'recruit_after_fail'`.
- `script.js`: 공통 후속 선택 수명주기(`pendingFollowup`·`followupSeq`·`FOLLOWUP_KINDS`·`chooseFollowup`·`nextYear`/`endLife` 가드), 진행 정지(`progressHalted`, H1 7·H3 25 가드), 생애 세대 토큰(`lifeGen`·`scheduleAuto`·`clearAutoTimers`), R1 롤백·R-E 복제본 렌더, 서포터 전직(O2·E-1 L-1·J-4 스냅숏·P2 지급), `SEVERANCE_AMOUNT = null`(액수 미결 → 지급 차단), T-1 치환자 규칙, 전직 후 상태창 갱신.
- 테스트: 신규 `followup_pf_test`(43)·`followup_halt_test`(155)·`f1_joinhard_test`(56)·`f1_transition_test`(145)·`f1_mutation`(40)·`lib_f1_ctx`·`lib_f1_fixture`. 수정 `test_runner.js`(후속 화면 stay 고정 선택·F-1 불변식·`SIM_LIFE_DUMP`), `browser_test.js`(F-1 3항목), `recruit_2bb_test.js`(RB-2f·RB-9 를 F-1 기준으로), `sync_2i_test.js`(r1 대조 제외 필드에 `pendingFollowup`·`followupSeq`).
- 결과: lifeDigest 10구성 js1 대비 DIFF(의도적), 기준 파일 미갱신. 3,000생애 2시드 lifeDigest 1715334118 / 777: 768019484 = 하네스 stay 예측값과 일치. 48,000생애 소속 54.50%·팔나 50.41%·거절 경험 23.74%. Chromium file:// 19/19·inline 19/19.
- 미완성: 퇴직금 액수 미결(지급 0). 상세 `DEV_REPORT_v1.7.8-f1.md`, 로그 `logs/v178_f1/`.

## v1.7.8-2bb-js1 - 2026-11-09 (T1-F F1-d4b 근속 기록 `S.jobSince`, 기록 전용·결과 불변)

- 승인: 사용자 2026-11-09 13:49 "근속 기록 구현 승인 — T1-F F1-d4b / J-1~J-6"(설계 `DECISION_T1F_F1_r5.md` §3.4a). T1-F 전체(fallback 제거·후속 선택·퇴직금 지급)는 미승인·미포함.
- `script.js`: `startLife()` 의 S 리터럴에 `jobSince: 0`(J-2), `setJob()` 에 `if (previous !== job) S.jobSince = S.age;`(J-1·J-3, 같은 직업 재설정은 유지, retired 전환도 갱신 J-6). `S.job` 대입은 `setJob` 한 곳뿐이라 모든 직업 변경 경로(fx.job·supporter/soldier 플래그·clearFlags·dropFamilia·joinOrganization·rollFamilia)가 같은 지점을 지남. `S.employer.since`·`joinOrganization` 무변경(J-5). 퇴직금 판정 함수·지급 없음(J-4 는 기록 데이터만 제공, 액수 F1-d4a 미결).
- 테스트: `tests/jobsince_test.js`(39) 신규, `tests/jobsince_mutation.js`(7: 원본 + 변이 6종) 신규, `tests/sync_2i_test.js` r1 대조의 새 필드 제외 목록에 최상위 `jobSince` 추가(R-i 필드와 같은 방식, 136/136).
- 결과: lifeDigest 10구성·3,000생애 2시드(lifeDigest 3527191366 / 1476379107, rngCallDigest 168120683 / 4205704456) 모두 v1.7.8-2bb 와 동일, test_runner 출력 전체 동일. 로그 `logs/v178_jobsince/`.

## v1.7.8-2bb - 2026-11-08 (2b-b: 일반 지원 → 심사 → 결과·재지원, **결과 변경**)

- 승인: 사용자 "2b-b 구현 진행"(2026-11-08), 결정 U-2b-1(목표 소속 50~60%·팔나 45~55%·거절 경험 20~40%), U-2b-2 a(기존 후보 선택·falnaAt 주 RNG 유지, 심사·재지원만 파생 RNG), U-2b-3 b(join_hard chance → 심사).
- `core/recruit.js`: `RECRUIT_TUNING` 수치 정의(경로 기본 합격률·종족·재능·전투력·파밀리아 모험 성향·규모·확률 제한·쿨다운 2년·같은 파밀리아 10년·생애 상한 4), `evaluateApplication`(순수 함수, 파생 RNG, accepted/rejected).
- `core/lineage.js`: `fnv` 공개(파생 시드).
- `script.js`: `applyRecruit`(일반: 가드 → 쿨다운·상한 → 후보 선택(주 RNG, 거절 파밀리아 제외) → `application.current` → 심사(파생 RNG `fnv(lineageSeed,'recruit:'+age+':'+attempt)`) → 이력 → current 종료 → 합격 시 `rollFamilia(forcedId)`·거절 시 대체 fx / 직접 `scout`: 기존 rollFamilia 그대로, 신청 상태 없음), `recruitRng`·`recruitExcludedFamilias`·`recruitBlockReason`, `applyEffects` 에 `fx.recruit`, `classifyFalnaCause` 가 `fx.recruit` 를 기존 `fx.familia:'roll'` 과 같은 입단 경로로 분류.
- `events.js`: join·career_choice → `self_apply`, join_hard → `persistence`(chance 제거, 실패 fx 를 거절 대체 fx 로 유지), latejoin → `scout`. 선택지 결과 문구를 합격/거절로 분리.
- 테스트: `tests/recruit_2bb_test.js`(49) 신규, `tests/recruit_2bb_mutation.js`(10) 신규, `tests/sync_2i_test.js` M1·M10 수정(136/136), `test_runner.js` 에 `recruit2bb` 통계·불변식, recruit 모델 검사 `tuningEmpty` → `tuningDefined2bb`·`evaluateNoGameRng`.
- 결과: 3,000생애 20261104 소속 52.10%·팔나 46.73%·거절 경험 23.71%, 777 소속 53.43%·팔나 47.37%·거절 경험 24.70%. lifeDigest 10/10 기준과 다름(결과 변경, 기준 미변경). 로그 `logs/v178_2bb/`.
- 미포함: deferred·open_call·recruit_result(U-2b-6), FAMILIA_HOME 후보 지역·입단 이주·무명 파밀리아·SC·신뢰도(2b-c), FAMILIA_BIAS 거주지 기준(U-2b-5), 비모험 팔나 확률(U-2b-7), 2-ii 나머지·R-ii·R-iii.

## v1.7.8-2ba-t1 - 2026-11-08 (테스트·문서 보완, 게임 코드 무변경)

- QA(2026-11-08 01:56) 요청: GG-2g `=== 1`, 실제 chance 경유 테스트(GG-7), dropBack 변이 검출(GG-8 구조 검사), sync_2i_test 픽스처 단일 생성, d3_wiring_mutation 의 FORCE_COLOR 오판정 수정, REPRODUCE 수치(35/35·68/68)·로그 경로, CHANGED_FILES·DOCS_INDEX 이력.
- dropBack 변이 정의: god_gone "모험을 접고" fx 에 `dropFamilia: true` 를 다시 넣는 것(2ba 의 `gg_mutation.log`). 봉인(`sealByGodReturn`)이 이미 소속을 닫아 `dropFamilia` 가 열린 소속 없이 실행되므로 상태·전이·난수 변화가 없어 행동 검사로는 검출 불가 → GG-8 데이터 구조 검사로 검출(실패 분기 변형 포함 7/7).

## v1.7.8-2ba - 2026-11-07 (2b-a: god_gone ↔ 송환·재수여 전이 함수 연결, **결과 변경**)

- 승인: 사용자 "2b 설계 승인, 2b-a부터"(DES-2b-1 §8 2b-a, IMPL-P0a Q2). 결정: god_gone 발생 조건에 팔나(active) 추가, 재수여 후보에서 송환된 파밀리아 제외(2026-11-07).
- `events.js` god_gone: `cond.falnaState:['active']` 추가, 성공 `godReturn:'regrant'`, 실패·포기 `godReturn:'seal'` + 명시 `clearFlags:['adventurer']`(기존 `dropFamilia`·`clearFlags falna` 제거 — 봉인이 소속 종료·팔나 제거를 수행).
- `script.js`: `applyGodReturn`(sealByGodReturn → [regrant: pickFamiliaCandidate(exclude 송환 파밀리아) → completeConversion → 레벨 이력 falna_again·로그]), `rebaseSyncAfterTransition`(전이 함수가 기록한 변화를 범위 끝 동기화가 다시 기록하지 않게 기준값 갱신), `pickFamiliaCandidate(forcedId, opts.exclude)`(인자 없는 기존 호출 불변).
- 테스트: `tests/god_gone_2ba_test.js` 62항목(변이 5종 중 4종 검출 — 기록 참조), `tests/sync_2i_test.js` 의 god_gone 기반 2-i 레거시 검사를 r3 god_gone 데이터 고정 픽스처(`legacyGG`)로 전환 + 실제 god_gone 새 동작 검사 추가(133/133, r1 대조 포함).
- 결과: lifeDigest 10/10 기준과 다름(설계상 결과 변경, 기준 digest 미변경). 로그 `logs/v178_2ba/`.

## v1.7.8-ri-r1 - 2026-11-07 (R-i 방어 보완, 게임 결과 불변)

- 사용자 승인(2026-11-07): QA 지적 `moveResidence` 빈 이력 배열 예외(TypeError) 최소 수정.
- `script.js`: `moveResidence` 의 기존 `residence_missing_state` 방어 조건에 `S.residenceHistory.length === 0` 추가 → 예외 없이 `false`, 거주·이력 무변화, 난수 0, 계측 1건.
- `tests/residence_ri_test.js`: RI-11(빈 배열 5항목) 추가 → 35/35. 수정 전 코드에서는 RI-11a·b·e 3건 실패(결함 재현).
- 검증: lifeDigest 10/10, 3,000생애×2 출력이 v1.7.8-ri 와 완전 동일(residenceRi 포함), sync_2i r1 대조 132/132·인수 없음 104/104, d3 5/5, 브라우저 file:// 16/16·inline 16/16(Claude 환경 제출 증거). 로그 `logs/v178ri_r1/`.

## v1.7.8-ri - 2026-11-07 (R-i 거주지 기록 전용, 게임 결과 불변)

- 사용자 승인(2026-11-07): R-i 를 R-ii 선행 작업으로 승인(IMPL-P0a Q1). 이벤트 조건·판정 변경 없음(R-iii 미승인).
- `script.js`: `S.residence`·`S.residenceHistory`(달력 나이 반열린 구간)·`S.service` 신설(출생 = 출생지), `moveResidence(to, reason)`·`recordService(kind)`(난수 0, 거주·복무 필드만 변경), `applyEffects` ⑩ `fx.residence`·`fx.service`(⑨ 조직 뒤·동기화 앞).
- `events.js`: `REGION_IDS`(= 출생지 7개), `FAMILIA_HOME`(사용자 건별 지정 표, astraea = null — 판정 미사용), `conscript` 수락 `service:'conscripted'`, 도주 성공 `residence:'orario'`·`service:'deserter'`.
- 테스트: `test_runner.js` 생애 단위 거주 검사(`residenceRi`, 위반은 invariantFailures), `tests/residence_ri_test.js`(30항목, 변이 7종 검출), `tests/sync_2i_test.js` 의 r1 대조에서 R-i 최상위 3필드 제외.
- 검증: lifeDigest 10/10 기준 동일, 시드 20261104·777 3,000생애 출력이 r3 와 `residenceRi` 줄 외 동일(rngCallDigest 포함), sync_2i 132/132, d3 변이 5/5, 브라우저 file:// 16/16·inline 16/16. 로그 `logs/v178ri/`.

## v1.7.8-2i-r3 - 2026-11-06 (QA P2, 테스트 러너·변이 도구만)

- D-3 합성 테스트가 실제 래퍼(rollFamilia·showEvent·endLife)를 경유(교체 가능한 측정 sink), `tests/d3_wiring_mutation.js` 로 연결 제거 변이 4종 exit 1 확인

## v1.7.8-2i-r2 - 2026-11-06 (QA P2, 테스트 러너만)

- D-3 계측: legacy_sealed_join 소속 id 추적, 이벤트 표시·endLife 두 시점 측정(`pollutedSealed` tracked/untracked), 합성 양성·음성 테스트(`d3SyntheticTest`)

## v1.7.8-2i-r1 - 2026-11-06 (QA 보완, 게임 동작 불변)

- Q20 승인(D-1·D-2·D-3) 반영: 주석·문서. `tests/sync_2i_test.js` N8j-2 false 명시 검증(D-7). `test_runner.js` 단위 테스트 단계 `stored_state_mismatch` 4건 예상 목록 assertion(`unitPhaseLogAsExpected`)

## v1.7.8-2i - 2026-11-06 (설계 r2k-4 의 2-i 단계, Q9 사용자 승인)

- `script.js`: 팔나 상태 기록 필드(`falnaState`·`falnaHolder`·`conversionPending`·`falnaTransitions`·`currentEventId`·`syncBaseline`), 동기화 범위(`apply`·`checkFalna`·`rollFamilia` 를 `withScope` 로 감쌈, `syncDepth` 모듈 1회 초기화·생애 시작 검사만), 판정 함수(성장 경로 미연결), 입단 호출 모드 가드(`initial_join`·`legacy_rejoin`·`legacy_rebind`·`newborn_control`), 전이 함수(`leaveFamilia`·`sealByGodReturn`·`completeConversion`, 게임 흐름에서 호출하지 않음), `pickFamiliaCandidate` 분리, `match()` 조건 키 `falnaState`·`familiaRole`·`canEnterDungeon`
- `events.js`: `god_gone` 성공 fx `'roll'→'rebind'`(Q16), `wargame`·`neglect`·`supporter_route` 에 `familiaRole:['member']`, 던전 16종에 `canEnterDungeon:true`. **입단 3종의 `falnaState:['none','unbound']` 는 digest 불일치(newborn)로 2-ii 로 이동**
- `test_runner.js`: RNG 호출 카운터·`{state, calls}` 저장/복원(Q19), `v178` 계측(모드·전이·불변식·V4 경로), `syncInvariantLog` 이관
- `tests/sync_2i_test.js`·`tests/equivalence_2i.js` 신규
- 상세: `DEV_REPORT_v1.7.8-2i.md`

## v1.7 - 2026-11-04 (주 개발자 통합 빌드, 기준 v1.2.1 chatgpt_reviewed)

- `core/relations.js`: 가족 NPC 생성(`generateFamily`), 자녀(`createChild`), NPC 육체 나이·자연사·사고사(`advanceYear(S, mods)`), 파트너 종족·팔나·레벨 메타데이터, `endRelationship` 사망 사유 세분화(`deceased_natural`/`deceased_event`)
- `core/aging.js`: `advanceEntity`, `naturalDeathChance`, `physicalFromCalendar` 추가(주인공과 NPC가 같은 노화 규칙 사용)
- `core/growth.js`: `carryPotential`(팔나 시 잠재력 50% 이월), `rollAnnualExcelia`
- `core/items.js` 신규, `index.html`에 연결: 장착(무기 1·방어구 1), 사용 횟수, 체력 위기 시 회복 소모품, 낮은 성공률 판정 시 전투 소모품, 체력 상한(hpMax)
- `script.js`: `cond.cage`/`relative`/`noRelative`/`noItem`, 연간 활동·체력 회복, 가족/사별 알림과 결과 요약, `#relations` 표시, 체감 나이 표기, 팔나 수령 기준을 달력 나이로
- `events.js`: `ANNUAL_ACTIVITY`/`HP_REGEN`, 가족 이벤트 6개, 위업 이벤트 5개, 입단·징집·진로·의식 이벤트를 달력 나이 조건으로, `have_child`가 자녀 NPC 생성, 구매 이벤트 중복 구매 방지
- `test_runner.js`: 실제 소스 기반 단위 테스트(직업 매핑, 나이 조건, 가족, 사별, 아이템, 이월)와 신규 통계·불변식
- `tests/browser_test.js` 신규: 실제 Chromium 테스트
- 미해결 사항과 승인 필요 항목은 `DEV_REPORT_v1.7.md` 참고

## v1.2 - 2026-11-04

- `script.js` 결과 화면의 문자열 줄바꿈 문법 오류 수정
- 브라우저 호환 `core/aging.js`, `core/growth.js`, `core/relations.js` 신규 작성 및 `index.html` 연결
- 최종 노화율 하한, `S.race.id` 기반 종족 조회 적용
- 팔나 전 잠재력 / 팔나 후 엑세리아 분리, 능력치 상한·NaN·음수 방어
- 연애/혼인 양쪽 만 18세, 최대 10년 나이 차이, 가족·친족/사망자/중복 관계 차단
- `love`, `amazon_duel`, `have_child`의 `partner` 플래그 의존 제거
- 확률 판정의 비정상 스탯 및 `Number.isFinite` 방어
- 은퇴 후에도 생애 종료까지 진행하는 실제 게임 흐름 기반 `test_runner.js` 작성
- 대장장이 직업 이벤트가 팔나 조건 때문에 도달 불가였던 조건 수정
- 3,000판 통합 시뮬레이션 및 JS 문법 검사 수행

## v1.2.1 ChatGPT 최종 통합 검토 — 2026-11-04

- 관계 ID 충돌 시 기존 관계 레코드 보존 및 고유 ID 재할당
- `marry()`가 기존 관계 `type`/`subType`을 덮어쓰지 않고 연애 상태를 별도 관리
- 명시적 이별/사망 종료 처리 훅 추가, `relationship_crisis`에서 실제 이별 연결
- 엑세리아 변환이 없어도 위업만으로 레벨업 조건을 만족하면 재검사
- 파밀리아 직업 매핑 우선순위 수정, 기존 직업 보존, 팔나만으로 모험자 플래그 자동 부여하지 않도록 수정
- 모의 DOM 테스트에 직업·관계·레벨업·화면 전환·자동 진행 회귀 테스트 추가
- 3,000판 재검증: 예외/NaN/불변식 위반 0, 이별 798회, 파트너 사망 0회
- 미해결: 가족 NPC 자동 생성 없음, 파트너 자연 사망 없음, 레벨업 능력치 500 병목, `hero_sacrifice` 미발생, `cond.age`의 육체 나이 의존, 아이템 사용 시스템 불완전, 실제 브라우저 테스트 미실행

## v1.7.1 — QA_AUDIT_v1.7 재작업

- HP 회복 단위를 육체 나이 1년당으로 변경(`HP_REGEN_MODE='physical'`): 달력 1년에 흐른 육체 나이(노화율)에 비례해 회복. 엘프·고레벨 과회복 제거
- 연간 체력 감소 직후, 사망 판정 전에 구조 포션 사용(`tryRescue`). 사건 선택 경로와 공용, 0 이하이면 남은 포션 연속 사용
- 사망 시 체력은 0으로 고정(`endLife`). 음수 체력 불변식·포션 잔존 HP 사망 불변식 추가
- 던전 탐색·몬스터 조우 이벤트(`dive1`, `routine`, `minotaur`, `purple_moth`, `guild_advisor`, `xenos`)에 `dungeon: true` + 팔나 보유 조건 추가
- 파밀리아 입단 시점 `S.familiaAt` 기록(팔나 취득 `falnaAt`과 별개)
- 테스트: 다중 시드 통합 통계(`tests/multi_seed_stats.js`), HP 회복 A/B, 종족별 레벨 통계, 입단-팔나 연표 집계, 브라우저 24생애

## v1.7.2 — QA_AUDIT_v1.7.1 대응 (테스트 도구 결함 + 데이터 구조)

- `tests/multi_seed_stats.js`: 실제 출력 키(`completed`)로 완료 판수 파싱, 모든 하위 실행에 exit 0 / `allRunsCompleted` / `completed===RUNS` / `allInvariantsPassed` 단언, 실패 시 exit 1, 시드×모드 병렬 실행
- `events.js` `EVENT_AREA`: 80개 이벤트 전수 명시 분류(dungeon 16 / supporter_accompany 1 / surface 56 / surface_ref 7). 정규식·예외 목록·`min.level` 가정 폐지. 던전 이벤트는 `job:adventurer`와 `flags:falna` 명시 필수. `expedition`, `encounter_goliath`, `find_grimoire`, `daedalus_orb`에 명시적 팔나 조건 추가
- `S.familiaHistory[]`, `S.falnaHistory[]`: 입단·탈퇴·변경, 팔나 취득을 항목별 기록(음수 gap 제거)
- 부모 NPC에 `familia` 소속 기록(`S.parentFamilia`). 출생 직후 자녀 자동 입단 폐지(기본). 부모 소속 파밀리아는 이후 입단 추첨 가중치(`PARENT_FAMILIA_BIAS=6`, 임의값)로만 작용. `NEWBORN_MEMBERSHIP`로 v1.7.1 방식 A/B 가능
- `data.js`: `hostess`, `guild`를 `familias`에서 `organizations`로 분리(팔나 없음, `S.employer`). 기본 직업은 `JOB_ORG`
- `DESIGN_PROPOSAL_status_separation.md`: 자녀·직업·지망·파밀리아·팔나 분리 설계안(미구현, 승인 요청)

## v1.7.3 — QA_AUDIT_v1.7.2 대응

- `fx.familia:'roll'`은 `rollFamilia()` 전용으로 분리, `rollAffiliation()` 삭제. 조직 고용은 `fx.organization:<id>` 이벤트 선택(`career_choice`의 길드·주점)에서만 발생
- `NEWBORN_MEMBERSHIP` 대조군: 부모의 파밀리아에 실제 입단(`rollFamilia(parentId)`), 동일 소속·0세·`viaParent`를 assert. 모드 이름 `newborn_parent_familia`(v1.7.1 동작의 복제가 아닌 반사실 대조군)
- `tests/multi_seed_stats.js`: 허용 모드 외 입력은 시작 전 exit 1
- `wargame`에 `hasFamilia:true` 추가, 런타임 게이트 검사에 `hasFamilia`/`flags`/`noFlags`/`max` 일반화
- 서포터 분리: `supporter_route`(팔나·소속 필요, dungeon) / `free_supporter_route`(팔나·소속 없음, 발리스 3,000 이하, 평생 1회, w=3, 사망 가능)
- 설계안 1단계: `S.aspiration`, `S.aspirationHistory`, 팔나 전 모험자 직업 표시(직업 부여 규칙 변경 없음)
- 보고서 정정: v1.7.2의 `legacy_newborn` 표 무효 처리

## v1.7.4 — QA_AUDIT_v1.7.3 대응

- `tests/multi_seed_stats.js`: 동시 실행 수 제한(`MAX_PARALLEL`, 기본 min(CPU,4))
- `events.js`: `EVENT_AREA.wargame` 오래된 주석 정정(동작 변화 없음)
- `DESIGN_PROPOSAL_status_separation.md` §7: 2단계 상세 설계(입단 절차, 무명 파밀리아, 개인/파밀리아 명성). 코드·확률 없음

## v1.7.5 — QA_AUDIT_v1.7.4 대응: 설계 오류 정리 + 2a(비활성 데이터 모델)

- 설계안 정리: 명성 enum 통일(`unknown|local|orario|major`), 목표 규칙 vs 단계별 임시 규칙 분리(§8.1), 명성의 소속 이력(membershipId)별 보존, 신의 직접 선택 경로 `admitDirect`, 업적 귀속 스키마(공개 여부·당시 소속·공개 소속·귀속 대상·소급 금지)
- 2a 구현(동작 연결 없음): `core/recruit.js`(명성 단계·경로·결과·INITIATORS, 빈 `RECRUIT_TUNING`, 파생 RNG, 비공식 minor 파밀리아 생성기 — 게임에서 호출하지 않음), `data.js` 파밀리아에 `kind:'canon'`/`official:true`, `S.application`, `S.minorFamilias`, `S.nextMembershipId`, 소속 이력 `id`
- 회귀: `lifeDigest`(생애 요약 해시)를 러너에 추가, `tests/regression_digest.js` + `logs/baseline_lifeDigest_v174.json`으로 v1.7.4와 동일 동작 증명. 단위 테스트의 난수 상태는 저장·복원해 본 시뮬레이션 난수열을 소비하지 않음

## v1.7.6 — QA_AUDIT_v1.7.5 대응

- `data.js`: `civilian`은 신의 파밀리아가 아니므로 `kind:"none"`(canon/official 태그 제거). 테스트 분리(`canonFamiliasTagged`는 실제 파밀리아만, `civilianIsNotAFamilia` 별도)
- `core/recruit.js`: 명성 표시명을 개인(`FAME_LABELS_PERSONAL`)과 파밀리아(`FAME_LABELS_FAMILIA`)로 분리. 개인용에는 '파밀리아' 미사용(테스트 강제)
- 회귀 기준 확대: `off` 4시드 해시를 `logs/baseline_lifeDigest_v174.json`/`tests/regression_digest.js`에 편입(총 10개 구성, 전부 동일)
- 설계안 §9: 소속 유형 모델(member / protected / 조직 고용), 유형별 권한표, 명성 표시명, `accepted` 의미(targetRole), 30% 규칙 처리 방침. 코드 미구현

## v1.7.7 — 생애 체감 개선 + 2a-role (게임 결과 불변)

- 수인 하위 유형 `S.raceSubtype`(`core/lineage.js`, 파생 RNG, 표시 전용, 미확인 유형은 비공식 설정 표기). 상태창·출생 기록·결과 화면 일관 표시
- 레벨 표기 `팔나 없음`/`Lv.N`/`봉인(Lv.N)`, 레벨 변화 강조(`Lv.A → Lv.B`), `S.levelHistory`·`S.maxLevel`, 결과 화면 최고 레벨·레벨 이력. 레벨업 공식 불변
- 0~2세 성장 기록(신생아·영아기·유아 초기, 난수 소비 없음), 0~2세는 '평온하게 N년' 집계 제외
- 2a-role: `familiaHistory[].role` = member | protected 기록만
- 테스트: 러너 `v177` 단위·생애 검사, 브라우저 16항목(ENV 기록 포함)
- 문서: README 재작성, `DOCS_INDEX.md`, 구 문서 `archive/`로 이동(유효성 공지)

## v1.7.7-r1 — 재현성 보강 (게임 코드 불변)

- `REPRODUCE.md`: QA 재현 명령과 실측 시간, 300초 제한 환경용 분할 실행
- `tests/regression_digest.js`: 구성 필터 인자(잘못된 필터 exit 1)
- `tests/browser_test.js`: `BROWSER_LOAD=inline`, `CHROMIUM_PATH`, ENV 줄에 로드 방식·실행 파일
- `work/`: protected 차단 패치와 작업 준비안(미적용)
