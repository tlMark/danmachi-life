# 개발 보고서 — v1.7.8-2bb-js1-f1 (T1-F/F-1: join_hard 거절·차단 후속 선택, 서포터 전직, 퇴직금 지급 경로)

- 작성: Claude Code, 2026-11-10
- 기준: `Danmachi_v1.7.8-2bb-js1_integrated.zip` (SHA-256 `66fe8c3c…1cea`)
- 근거 문서: 결정 `DECISION_T1F_F1_r9.md`, 설계 `F1D4A_DESIGN_N1-N6_claude_r1~r7`, `F1D4A_DECISIONS_after_r7.md`, ChatGPT r7 최종 QA(구현 착수 지시)
- 성격: **결과가 바뀌는 의도적 변경**입니다(C8). 기준 digest 파일은 갱신하지 않았습니다.
- 모든 규칙은 게임 고유 규칙이며 원작 근거가 아닙니다.

---

## 0. 요약

| 항목 | 결과 |
|---|---|
| 구현 단계 | S1 공통 수명주기 → S2 진행 정지·세대 토큰·R-E 렌더 → S3 join_hard 연결 → S4 전직·퇴직금 경로 → S5 전체 QA |
| 단계별 회귀 | S1·S2: lifeDigest 10/10 js1 과 **동일**(결과 불변). S3·S4: 10/10 DIFF(의도적 변경), S4 = S3 동일 |
| 신규 테스트 | PF 43 · 정지/롤백 155 · join_hard 56 · 전직/롤백/은퇴 145 · 변이 40(원본 4 + 변이 36) — 전부 통과 |
| 기존 테스트 | jobsince 39, recruit_2bb 49, god_gone 68, residence 35, sync_2i 108, 변이 7·10·5 — 전부 통과 |
| 3,000생애 × 2시드 | 완주, 예외 0, guard 0, 불변식 통과. lifeDigest 1715334118 / 768019484 |
| stay 예측값(r3 §5.3) | **일치**: 하네스 stay 1,715,334,118 / 768,019,484 = 구현 값. rngCallDigest 3460114558 / 2683922449 도 일치 |
| 48,000생애 전후 | 완주 48,000/48,000, 예외 0. 소속 55.00→54.50%, 팔나 50.74→50.41%, 거절 경험 23.75→23.74% (U-2b-1 범위 유지) |
| 생애별 digest(F1-R) | 16구성 전부: 첫 불일치 생애 = 첫 join_hard 거절·차단 생애, 그 이전 생애 전부 동일 |
| Chromium | file:// 19/19, inline 19/19 (후속 화면 실제 클릭·자동 진행 stay 포함) |
| 발견·수정한 결함 | 1건 — 서포터 전직 후 상태창 미갱신(브라우저 검증에서 발견, §5) |
| **미완성 항목** | **퇴직금 액수 미결.** `SEVERANCE_AMOUNT = null` → 적격 전직이어도 지급 0(직접 플레이에서 퇴직금 없이 전직됨) |

## 1. 변경 파일과 해시

| 파일 | 변경 | SHA-256 전 → 후 |
|---|---|---|
| (해시표는 제출 보고서·`logs/v178_f1/HASHES.txt`) | | |

- 게임 코드: `script.js`, `events.js`
- 테스트 코드: `test_runner.js`, `tests/browser_test.js`, `tests/recruit_2bb_test.js`, `tests/sync_2i_test.js`(수정) / `tests/followup_pf_test.js`, `tests/followup_halt_test.js`, `tests/f1_joinhard_test.js`, `tests/f1_transition_test.js`, `tests/f1_mutation.js`, `tests/lib_f1_ctx.js`, `tests/lib_f1_fixture.js`(신규)
- 문서·로그: `DEV_REPORT_v1.7.8-f1.md`(신규), `CHANGELOG.md`·`REPRODUCE.md`(항목 추가), `logs/v178_f1/`(신규)
- 기존 파일 삭제 0. `tests/regression_digest.js`·`logs/baseline_lifeDigest_v174.json` 무변경.
- 전체 diff: `logs/v178_f1/f1_full.diff`

## 2. 구현 내용

### 2.1 공통 후속 선택 수명주기(C26·C27, N1-1~N1-5·N1-7)
- `S.pendingFollowup`(데이터만: seq·kind·phase·sourceEventId·context·createdAt), `S.followupSeq` — `startLife` 에서 null/0.
- phase: `resolving_event`(생성) → `awaiting_choice`(생존 확인 후 화면) → `resolving_choice`(유효 선택 처리 중) → null.
- `nextYear`: 보류가 있으면 **DOM 변경보다 먼저** 반환. `endLife`: `resolving_event` 는 정상 사망 처리(보류 정리·진단), `awaiting_choice`·`resolving_choice` 는 차단(기존 정리 작업보다 먼저).
- `chooseFollowup`: 검증 실패 시 상태·보류·화면 불변 → phase 확정·DOM 비움(중복 클릭 이중 방지) → 문맥 복원 → `withScope('followup')` 안에서 kind 별 resolve → `finally` 정리 → 방어 사망 판정 → 상태창 갱신 → '다음 해로'.
- 공통부는 사건 id 를 하드코딩하지 않음. 등록 kind 는 `recruit_after_fail` 하나(U-2b-9 선택지 미추가).
- 진단은 S 밖 `followupDiagLog`(digest 무관).

### 2.2 진행 정지·생애 세대 토큰·R-E(N1-6·N1-6b·N1-6c)
- `progressHalted`: 후속 처리 예외 시 catch **첫 문장**에서 true. 해제는 `startLife` 뿐. 게임 코드에 공개 해제 API 없음.
- 가드: H1 7개(nextYear, choose, chooseBody, showEvent, endLife, chooseFollowup, renderFollowup), H3 25개(r7 §2.1 목록) — 함수 진입 첫 줄.
- 자동 진행 타이머 3종(T1 사건 자동 선택, T2 '다음 해로', T3 후속 stay)은 `scheduleAuto` 로만 예약: 콜백 첫 줄에서 정지·세대(`lifeGen`) 검사 후에만 `Math.random`·클릭. `clearAutoTimers` 로 취소(G1+). T4(시작 버튼 `setTimeout(startLife)`)는 범위 밖(O-2 미해결).
- catch 구조: 정지 → `cleanupErrors` → 5단계 개별 격리(타이머 취소, R1 롤백, R-E 렌더, 안내 L-3, 진단) → 원래 예외 재전파. '다음 해로' 미생성.
- R1 롤백: 값 14필드, 복사 3필드(flags·employer·abil), 컨테이너 4종(items·itemUses·itemsConsumed·relations: 존재·교체 복구), logHistory 길이 절단, levelHistory 존재·교체·길이 복구. 2-i 기준값은 건드리지 않음(기존 복구 체계).
- R-E: 예외 경로 렌더는 S 복제본으로 그려 실제 S 에 컨테이너가 생기지 않음.

### 2.3 join_hard 연결(C1~C3·C23·C25·T-1)
- `events.js` join_hard "끈질기게": `fallback` 삭제, `failText: '{familia}의 심사에서 탈락했다.'`, `followup: 'recruit_after_fail'`.
- `applyRecruit`: 거절·차단 자동 대체 분기 삭제. `spec.followup` 이 있으면 보류 생성. 거절 문구에 `{familia}` 가 있으면 치환·접미사 생략, 없으면 기존 접미사 유지.
- 선택지(C25 + S-1, 마침표 없음): child `서포터 일을 시작한다` / retired `은퇴 생활을 접고 서포터 일을 시작한다` / 고용처 없는 직업 `현재 직업을 그만두고 서포터로 전직한다` / 고용 중 `현재 고용처를 그만두고 서포터로 전직한다`(retired 포함 우선) / `지금 생활을 이어간다`. 이미 supporter 면 서포터 선택지 숨김.
- 안내 `앞으로 어떻게 지낼까?` 는 화면 전용(logHistory 미기록).
- 기존 명시 선택지 "길드 주변에서 서포터 일을 구한다"(+600)는 그대로.

### 2.4 서포터 전직(O2·P2, E-1, J-4)
1. J-4 스냅숏 고정(job·jobSince·age·tenureYears·eligible·employerId·amount).
2. 고용처가 있으면 연표 L-1 `{고용처}을(를) 그만두었다.`(kind employer_quit) 후 해제.
3. `setJob('supporter')` 후 성공 확인(실패 시 예외 → 롤백·정지).
4. 스냅숏 기준으로만 지급: `eligible && Number.isFinite(amount) && amount > 0` 이면 `apply({valis})` + L-2. 그 외 apply 호출 0.
- **`SEVERANCE_AMOUNT = null`(미결)** → 적격이어도 지급 0, 진단 `severance_amount_undecided` 1건. 숫자 기본값 없음.

### 2.5 러너(C21·C24·V-2)
- 후속 화면에서는 `dataset.followup === 'stay'` 버튼을 난수 없이 클릭. 그 밖의 화면은 기존 무작위 클릭.
- 러너 불변식(위반 시 invariantFailures): phase, application 변경(C-10), stay 상태 변경, stay 중 RNG, 정리 누락, 직업 변경, '다음 해로' 개수, 생애 말 보류 잔존, fallback spec, 진단 발생.
- `SIM_LIFE_DUMP` 환경 변수: 생애별 기록 파일(읽기 전용 계측, 지정하지 않으면 동작 0).

## 3. 회귀·검증 결과

### 3.1 lifeDigest 10구성
| 비교 | 결과 | 로그 |
|---|---|---|
| S1·S2 vs js1 | 10/10 SAME | `stages/s1|s2/digest10.log` |
| S3 vs js1 | 10/10 DIFF(의도적) | `stages/s3/digest10.log` |
| S4 vs S3, 최종 vs S3 | 10/10 SAME | `stages/s4/digest10.log`, `digest10_vs_s3.log` |
| 최종 vs 승인 기준 v1.7.4 (`tests/regression_digest.js`) | 10/10 DIFF(의도적 변경, 기준 미갱신) | `regression_digest_v174.log` |
| 최종 vs js1 재현값 | 10/10 DIFF | `digest10_vs_js1.log` |

### 3.2 3,000생애 × 2시드
| 시드 | 완주 | 예외 | guard | 불변식 | lifeDigest | rngCallDigest | 후속 선택(rejected/cooldown) |
|---|---|---|---|---|---|---|---|
| 20261104 | 3000 | 0 | 0 | 통과 | 1715334118 | 3460114558 | 207 (205/2) |
| 777 | 3000 | 0 | 0 | 통과 | 768019484 | 2683922449 | 223 (222/1) |
- **stay 예측값 일치**: 외부 하네스(QA 실행, Node v22.16.0)의 stay 군 lifeDigest·rngCallDigest·rngCallsTotal 과 구현 값이 같음. 하네스 J-4 적격 수(5/5)도 일치하는지는 구현 러너가 기록하지 않아 미확인.

### 3.3 48,000생애 전후(`48k_compare.md`)
- 생애별: 16구성 모두 "첫 불일치 생애 = 첫 join_hard 거절·차단 생애", 그 이전 생애 전부 동일. 이후 생애는 전역 연속 RNG 흐름 분기로 순번 대조 불가(설계 r6 F-2).
- 의도한 결과 변화(r9 §3.6): career_choice 발생 생애 13,117→15,840(거절 생애가 child 로 남음), latejoin 13,514→11,969·supporter_scorn 16,317→14,229·free_supporter_route 5,124→4,229(자동 서포터 플래그·직업 제거), 생애 말 supporter 1,501→1,275, cooldown 차단 152→290, lifetime_cap 0→0.
- U-2b-1 범위: 소속 54.50%(50~60), 팔나 50.41%(45~55), 거절 경험 23.74%(20~40) 유지.
- 비의도 변화로 분류할 항목: 없음 [추론 — 위 변화는 모두 fallback 제거와 child 유지에서 직접 따라 나옴. 같은 RNG 위치 이후 생애는 분기 효과라 개별 원인 분리는 하지 않음].

### 3.4 단위·변이 테스트(최종 코드)
| 파일 | 결과 |
|---|---|
| followup_pf_test | 43/43 |
| followup_halt_test (RB-T10-0~7, PF-9, PF-14, HT-1~8, HT-7×6) | 155/155 |
| f1_joinhard_test (F1-T1·T2·T2b·T3·T7·T9·T10·T11·T13·T14, V-1, C25) | 56/56 |
| f1_transition_test (F1-T4~T6·T4b~T4g, SV·SV-U1, RB-T1~T6, RB-M1~M8·M10c fixture, RB-M9a~e + mut1~5, RT-1~10, RT-M1~M5, RT-MI1~3) | 145/145 |
| f1_mutation (원본 4 + SV-M·RB-M·F1-M·PF-M·HT-M·UI-M 36) | 40/40 |
| 기존: jobsince 39, recruit_2bb 49, god_gone 68, residence 35, sync_2i(인수 없음) 108, jobsince_mutation 7, recruit_2bb_mutation 10, d3_wiring_mutation 5 | 전부 통과 |
| 문법 30파일 | 오류 0 |
| sync_2i_test r1 대조 | **미실행**(r1 ZIP 없음) |
| equivalence_2i | 해당 없음(결과 변경 단계) |

### 3.5 RB-M7·M8 실측(설계 r5 §5 확인 의무)
fixture 실행에서 level 1→2, maxLevel 1→2, hidden 0→60, alias none→rookie, power 15→28 을 실제로 확인(RB-M7 b·RB-M8 b PASS). logHistory 는 레벨업·이명 2건 + 직업 변경 1건 + L-2 1건 = +4 (설계 문서의 "+2"는 레벨업 경로만 센 값).

### 3.6 Chromium
| 모드 | 결과 | 비고 |
|---|---|---|
| file:// | 19/19 | 기존 16 + F-1 3(후속 화면 실제 클릭, 서포터 전직 실제 클릭, 자동 진행 stay) |
| inline | 19/19 | file:// 배포 경로 검증 아님 |
- F-1 브라우저 항목은 [합성 상태 주입](심사 결과 거절 고정, 고용 중 인물).

## 4. 실제 생애 결과와 합성 상태의 구분
- 실제 생애(러너·48,000생애): 자동 진행은 항상 stay → 서포터 전직·퇴직금·고용처 해제 0(F1-T12, 러너 불변식). 전직 경로는 실제 생애에서 실행되지 않음.
- 전직·퇴직금·롤백·은퇴자·lifetime_cap·사망 경로 테스트는 모두 [합성 상태 주입]. 양수 퇴직금(1234)은 격리 vm 사본 소스 치환으로 넣은 **시험용 값**이며 실제 액수가 아님.

## 5. 발견·수정·정정 기록
1. **게임 결함(수정)**: 서포터 전직 후 상태창(`#familia`)이 이전 직업·고용처를 계속 표시. 원인: 지급이 없으면 `apply` → `renderStats` 가 불리지 않음. 수정: `chooseFollowup` 정상 경로 끝에 `renderStats()`. 회귀 방지: SV-U1e 단위 검사(수정 전 코드에서 실패 확인 — `statusfix_premutation.log`), 변이 UI-M1. 발견 경위: Chromium file:// 1차 실행 18/19(`browser_file_run1_defect_status_not_refreshed.log`).
2. **테스트 예상 정정**: RB-M9-mut1·mut3 의 예상 실패 목록이 실제와 달랐음 → 경로 분석 결과 예상 쪽 오류(mut1: b2·e 도 렌더가 재생성, mut3: b2 fixture 도 itemUses 삭제). 정정 후 통과. 1차 실행 로그 보존.
3. **테스트 fixture 정정**: RB-M9 컨테이너 주입 시점을 후속 화면 표시 후로 옮김(사건 처리 단계 렌더가 먼저 재생성하던 문제).
4. **r9/r7 와의 차이**: 없음. 단, r7 §8 의 "사용자 확인 대기" 5건(N1-6c, N2-4, N6-3, Q-P, N3-1)은 사용자 승인 완료로 정정.

## 6. 미완성·미실행·범위 밖
- **퇴직금 액수 미결(F1-d4a)** — 지급 차단 상태. 액수 결정 시 상수 1곳 변경 + SV-U1 기대값 전환 + 48,000생애 재비교 필요.
- sync_2i_test r1 대조 미실행(r1 폴더 없음).
- 하네스 재실행 생략(N3-1 결정) — V-1(단위)·V-2/V-3(러너 불변식, 3,000생애 × 2시드 + 48,000생애)로 대체, 위반 0.
- O-1(같은 생애 수동·자동 클릭 중첩), O-2(시작 버튼 연타), O-3(탈퇴→은퇴 결합)은 기존 문제로 변경하지 않음.
- 기준 digest 파일 갱신 안 함(사용자 승인 대상).
