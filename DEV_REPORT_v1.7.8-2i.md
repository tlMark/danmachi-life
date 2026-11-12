# 개발 보고서 — v1.7.8-2i (설계 r2k-4a 의 2-i 단계, QA 보완 2i-r1 반영)

## 0b. 2i-r3 보완 (2026-11-06, QA P2 — 실제 래퍼 연결 검증, test_runner.js 와 신규 변이 도구만, 게임 코드 무변경)
| 요청 | 처리 |
|---|---|
| 문제 | 2i-r2 합성 테스트는 helper(`trackSealedJoin`·`measurePolluted`)를 직접 호출 → 래퍼에서 호출을 지워도 통과(QA 재현) |
| 1~3. 실제 래퍼 경유 | 측정 대상(sink: 추적 id 집합 + 카운터)을 바꿔 끼울 수 있게 하고(`d3Sink`), 합성 테스트는 전용 sink 로 바꾼 뒤 **실제 전역 래퍼** `rollFamilia(_, 'legacy_sealed_join')` → `showEvent(합성 이벤트)` → `endLife()` 를 호출. 각 래퍼의 D-3 연결은 일시 정지 여부와 무관한 **단일 호출 지점**(① showEvent·② rollFamilia·③ endLife) |
| 판정 항목 | `trackedIdViaRollFamiliaWrapper`·`trackedEventViaShowEventWrapper`·`trackedEndLifeViaEndLifeWrapper`·음성(`untrackedDetectedEvent`·`untrackedDetectedEndLife`·`noTrackedInNegative`)·혼합 분리·`syncInvariantLog` 추가 0·`mainSinkRestored` |
| 4. 본 계측·RNG 보존 | `mainCountersUntouched`(V4·모드·rejected·pollutedSealed·livesWithLegacySealedJoin·familiaJoins·eventCount·uniqueEvents·currentLifeEvents), `rngRestored` 유지 |
| 5. 연결 제거 변이 | 신규 `tests/d3_wiring_mutation.js`: 변이 없음 exit 0, ①·②·③ 각 연결 제거와 helper 내부 제거 4개 모두 **exit 1**(`logs/v178/d3_wiring_mutation.log`) |

## 0a. 2i-r2 보완 (2026-11-06, QA P2 — D-3 계측, 테스트 러너만 변경, 게임 코드 무변경)
| 권고 | 처리 |
|---|---|
| 1. legacy_sealed_join 으로 생긴 소속 id 추적 | 러너 `rollFamilia` 래퍼가 모드 `legacy_sealed_join` 성공 시 열린 소속의 `id` 를 생애 단위 집합(`sealedJoinIds`)에 기록, 생애 시작 시 초기화 |
| 2. 그 소속이 실제로 열린 상태이고 sealed 인지 | `measurePolluted`: 러너 자체 유도 상태가 `sealed` 이고, 열린 소속 각각에 대해 `id` 가 추적 집합에 있고 `S.familia.id` 와 일치하면 `tracked`, 아니면 `untracked` |
| 3. 이벤트 표시·endLife 두 시점 | `showEvent` 래퍼와 신규 `endLife` 래퍼에서 측정 → `pollutedSealed{tracked:event, tracked:endLife, untracked:event, untracked:endLife}`. `untracked` 는 실패(`allInvariantsPassed`), `tracked` 는 측정(Q20 D-3). 기존 `invPollutedSealed`·`pollutedSealedAfterLegacySealedJoin` 은 이것으로 대체 |
| 4. 합성 양성 테스트 | 러너 `d3SyntheticTest`: 정상 sealed(10세, 파밀리아 목록 loki 만) → `legacy_sealed_join` 실제 호출 → 오염 sealed 생성 확인, `tracked:event`·`tracked:endLife` 각 1, 추적 없이 보면 `untracked` 1(음성 분류), 추적 안 된 열린 소속을 추가하면 `tracked`·`untracked` 분리. 난수 `{state, calls}`·파밀리아 목록 복원, `syncInvariantLog` 추가 0. 실패 시 assert |
| 변이 확인 | 소속 id 추적을 비활성화한 사본 → `d3SyntheticTest` 실패, 종료 코드 1 |
| 작업 중 발견·수정 | 합성 테스트의 `startLife()` 가 newborn 모드에서 러너 래퍼(`rollFamilia`·`showEvent`)를 거쳐 본 계측(V4 경로·이벤트 통계)을 1건씩 오염 → `newborn_parent_familia/8675309` 의 V4 대조 1건 실패(digest·RNG 는 동일). 합성 테스트 동안 `instrumentPaused` 로 러너 래퍼 4개(`showEvent`·`rollFamilia`·`joinOrganization`·`endLife`)의 집계를 모두 건너뛰고, 전후 본 계측값 동일(`mainCountersUntouched`)을 assert |
| 추가 대조 | r1 원래 러너와 2i-r2 러너의 **기존 출력 항목 전체**(v178·v1a·시간 줄 제외)를 3개 구성에서 비교 → `logs/v178/runner_output_vs_r1_runner.log` |
| 결과 불변 | 게임 코드 무변경. 러너만 바뀌었으므로 digest·RNG 호출은 아래 재실행으로 재확인 |

## 0. 2i-r1 보완 (2026-11-06, ChatGPT 독립 QA·사용자 Q20 승인 반영 — 게임 동작 변경 없음)
| 항목 | 처리 |
|---|---|
| Q20 승인 | D-1·D-2·D-3 을 승인된 설계 결정으로 확정. 설계·테스트 계획을 r2k-4a 정오표로 갱신, script.js·test_runner.js 주석만 "승인" 으로 수정 |
| D-7 | 테스트 계획 N8j-2 기대값 정정. `sync_2i_test.js` 가 `latejoinMatch===false`·`supporterFlag===false`·`job==='retired'` 를 각각 assert, 복구가 후보 판정(`match`)보다 먼저인지 검사 유지 → 132/132 |
| 단위 테스트 단계 `stored_state_mismatch` 4건 | 원인: 합성 fixture 4곳이 새 기록 필드 없이 S 를 만들거나 팔나 플래그를 직접 넣음(① levelUpFeatOnly S 리터럴→apply 30세 ② `makeJobState('child')`→rollFamilia 20세 ③ `makeJobState('supporter')`→rollFamilia 20세 ④ `fresh()` 후 `S.flags.push('falna')`→choose→apply — 나이는 시드별 `fresh()` 생애에 따라 다름(20261104: 4세, 777·314159·8675309: 3세)). fixture 는 바꾸지 않고 **정확한 예상 목록 assertion**(`unitPhaseLogAsExpected`: ①~③ 종류·범위·나이, ④ 종류·범위) 추가. 처음 제출안은 ④ 나이까지 고정해 시드 777 등에서 거짓 실패 → 수정 후 전체 재실행, `allInvariantsPassed` 판정에 포함. 변이 확인: 예상 목록 1개를 바꾼 사본에서 `allInvariantsPassed:false`·종료 코드 1 |
| 브라우저 | 개발 환경 file://·inline 16/16. ChatGPT 환경 독립 미검증(유지) |


작성: Claude (주 개발자) · 기준: `Danmachi_v1.7.7r1_integrated.zip`(sha256 `51890b66e77dd7822d6cc04a68b2881586c1bd1267a1272c1feaebb21a6fdef7`, script.js `53bdfbb1…607f`) · 착수 근거: 2026-11-06 사용자 지시 "Q9 및 2-i 개발을 착수하세요"
범위: 2-i 만. 2-ii·2b·D2 미구현. 팔나·능력치·레벨업 공식, 30% 규칙, 기준 digest·벤치마크 변경 없음. Git 작업 없음.

## 1. 구현 내용
| 항목 | 위치 | 설계 |
|---|---|---|
| 기록 필드 `falnaState`·`falnaHolder`·`conversionPending`·`falnaTransitions`·`currentEventId`·`syncBaseline` | `startLife()` 의 `S = {…}` 리터럴 | §2.8(a) |
| `syncDepth` 모듈 로드 시 1회 0, `syncInvariantLog` | script.js 10~11행 | §2.8(a-1) |
| 생애 시작 깊이 검사(값 불변, 기록만) | `startLife()` 첫 줄 | §2.8(a-1), U3 |
| 동기화 범위 `withScope` — `apply`·`checkFalna`·`rollFamilia` | 함수 본문을 `applyEffects`·`checkFalnaBody`·`rollFamiliaBody` 로 분리하고 래퍼로 감쌈 | §2.8(d-1) ①~⑦ |
| 동기화 지점: apply ⑨ 직후·`convertExp()` 직전 | `applyEffects` 끝 | §2.8(d-1) ③ |
| 예외 기준값 `pending_after_exception`·복구 전이·`stale_normal_baseline`·생애 종료 정리 | `openScopeBaseline`·`recoverFromBaseline`·`endScope`·`endLife()` | §2.8(d-1) ②④⑤⑧ |
| `currentEventId` | `showEvent()` 기록, `choose()` try/finally·`endLife()` 해제 | §2.8(d-2) |
| 판정 함수(성장 경로 미연결) | `falnaEmbedded`·`canUseFalna`·`canUpdateStatus`·`accumulatesExcelia`·`accumulatesPotential`·`canEnterDungeon`(2-i=canUseFalna)·`JOB_ROLE_CLASS` | §2.1·§2.2 |
| 입단 호출 모드 | `rollFamilia(forcedId, mode)`, 난수 사용 전 가드, 거부 시 `rejected` 1건 | §2.3.2 |
| 전이 함수(게임 흐름에서 호출하지 않음) | `leaveFamilia`·`sealByGodReturn`·`completeConversion`·`falnaTransitionAllowed`·`pickFamiliaCandidate` | §2.3·§2.3.1 |
| `match()` 조건 키 | `falnaState`·`familiaRole`·`canEnterDungeon` | §3 |
| 이벤트 데이터 | `god_gone` 성공 fx `'rebind'`(Q16), `wargame`·`neglect`·`supporter_route` 에 `familiaRole:['member']`, 던전 16종에 `canEnterDungeon:true`(기존 `flags:['falna']` 유지) | §2.3.3·§3 |
| 테스트 러너 계측 | RNG 호출 카운터·`{state, calls}` 저장/복원(Q19), 모드 호출 계측(Q18), `v178` 불변식·경로 횟수, `syncInvariantLog` 이관(본 실행분만) | §3e·§6 |

## 2. 설계와 다르게 처리한 항목 (D-1·D-2·D-3: **Q20 승인됨**, D-7: 테스트 계획 정정 완료)
| # | 내용 | 근거(실측) | 처리 |
|---|---|---|---|
| D-1 | 입단 3종 `falnaState:['none','unbound']`(sealed 차단) **미적용 → 2-ii 이동** | 적용 시 `newborn_parent_familia/20261104` digest 3932767934 → 1874385123. 게이트별 제거 실험에서 이 조건만 원인 | **승인(Q20)**. 설계 §3 규칙 |
| D-2 | `fx.familia:'roll'` 의 sealed 상태를 거부하지 않고 **신규 모드 `legacy_sealed_join`**(가드 없음, 현행 동작)으로 처리 — 설계 M3 이탈 | D-1 이후 sealed 가 입단 이벤트에 도달 가능. 거부 가드 유지 시 `newborn_parent_familia/777` 에서 거부 1건 → digest 391171683 → 1951106710 | **승인(Q20)**. 2-ii 에서 거부로 전환 |
| D-3 | D-2 경로로 생긴 오염 sealed(열린 소속 + 팔나 없음)는 불변식 실패가 아니라 측정(`pollutedSealedAfterLegacySealedJoin`)으로 분리 | 현행 동작 그대로의 상태 | **승인(Q20)**. 엄격 차단은 2-ii |
| D-4 | `legacy_rejoin` 가드에 "열린 소속 이력 없음" 추가(설계 M4 기대 충족용). `initial_join` 은 설계 문구 그대로(`!S.familia`) | `initial_join` 에도 넣으면 러너 기존 단위 테스트(newborn 모드 `fresh()` 후 `familia:null` 덮어쓰기 = 열린 이력 잔존)가 실패 | 기록 |
| D-5 | cause 보조값 `unclassified`·`legacy_sealed_join`, 로그 종류 `stored_state_mismatch`·`missing_baseline_at_sync` 추가 | 분류 누락을 숨기지 않기 위한 기록 전용 값 | 본 실행 실측 0건(§4) |
| D-6 | 전이 함수는 스스로 전이를 기록(cause `leave`·`god_returned`·`convert`·`regrant`) | 2-i 에서는 호출되지 않음 | 2-ii 연결 시 바깥 범위 동기화와 이중 기록되지 않도록 조정 필요 |
| D-7 | 설계 §3c-1 의 가정 오류: `dropFamilia` 가 supporter→retired 로 바꿀 때 `setJob` 이 `'supporter'` **플래그도 지움** → N8j-2 의 `match(latejoin.cond)` 는 거짓 | `sync_2i_test` N8j-2 기록: `latejoinMatch:false, supporterFlag:false, job:'retired'` | 테스트 계획 r2k-4a 정정, false 명시 검증(2i-r1) |
| D-8 | `tools/injection_feasibility.js`(r1 전용)의 MFX 스택 assertion(`apply < rollFamilia < startLife`)은 2-i 래퍼로 스택 모양이 바뀌어 2-i 빌드에는 맞지 않음 | 도구 목적이 r1 주입 가능성 확인 | 2-i 주입 검증은 `tests/sync_2i_test.js` N8·N8a·N8g·N8i 로 대체 |

## 3. 결과 불변 검증 (실행 결과 — 로그 `logs/v178/`)
| 검증 | 명령 | 결과 |
|---|---|---|
| 문법 | `node --check` 전 JS | 오류 0 |
| V3 시드 20261104·777 각 3,000생애 | `node test_runner.js`, `SIM_SEED=777 …` | 둘 다 완주, `allInvariantsPassed: true`, lifeDigest 1438657387 / 2529723506 |
| V2 회귀 10개 구성 | `node tests/regression_digest.js` | **10/10 동일** |
| V1·V4·B2·B3 r1 대조(같은 계측 러너) | `node tests/equivalence_2i.js <r1>` | **10/10 동일** — lifeDigest·`rngCallDigest`(생애별 난수 호출 수 해시)·호출 총수·V4 경로 횟수(입단 이벤트 상태별 노출, 이벤트·상태별 `rollFamilia` 호출·이동, `god_gone` 노출) |
| 추가 시드 r1 대조 | `… newborn_parent_familia/777 /314159 /8675309 calendar/777 /314159 /8675309` | **6/6 동일**(기준 json 에 없는 구성 — r1↔2-i 직접 대조) |
| 다중 시드 48,000생애 | `MAX_PARALLEL=2 node tests/multi_seed_stats.js 3000 … <mode>` ×4 | 4모드 모두 `logs/multi_seed_stats.log` 의 시드별·통합·소속 이력·종족별 행과 **동일** |
| V1a | 러너 (k) 단위 테스트 | `v1aRngRestore: true`({state, calls} 복원) |
| 2-i 단위·시나리오 | `node tests/sync_2i_test.js <r1>` | **132/132 PASS**(S1~S9, M1~M10, N1~N9·N8a~N8n-3, T3~T12, 판정 함수, §6 protected 전수, §8 완전성, R1~R8, M9·M3 r1 대조) |
| 브라우저 V6 | `node tests/browser_test.js 24`, `BROWSER_LOAD=inline …` | file:// **16/16**, inline **16/16** (Chromium 153.0.8010.12, Playwright 1.63.0, 이 개발 환경) |
- digest 기준값(`logs/baseline_lifeDigest_v174.json`)·계산식 변경 없음.

## 4. 2-i 기록·불변식 실측 (10개 구성, 각 3,000생애)
| 구성 | 모드 호출 | 전이(cause) | rejected | 복구 | unclassified | N8m stale | 2-i 게이트 위반 | 오염 sealed | 입단 이벤트 sealed 노출 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| physical:777 | initial_join 1702, legacy_rebind 47 | grant 1576, drop_familia 393, leave_and_seal 58, legacy_auto_convert 42 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| physical:314159 | initial_join 1632, legacy_rebind 38 | grant 1527, leave_and_seal 50, drop_familia 366, legacy_auto_convert 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| physical:8675309 | initial_join 1682, legacy_rebind 25 | grant 1556, drop_familia 406, leave_and_seal 59, legacy_auto_convert 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| physical:20261104 | initial_join 1647, legacy_rebind 31 | grant 1535, drop_familia 384, leave_and_seal 55, legacy_auto_convert 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| calendar:20261104 | initial_join 1648, legacy_rebind 34 | grant 1525, drop_familia 391, leave_and_seal 49, legacy_auto_convert 27 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| newborn:20261104 | initial_join 1448, newborn_control 471, legacy_rebind 39 | grant 1780, drop_familia 464, leave_and_seal 63, legacy_auto_convert 31 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| off:777 | initial_join 1660, legacy_rebind 40 | grant 1525, drop_familia 394, leave_and_seal 35, legacy_auto_convert 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| off:314159 | initial_join 1659, legacy_rebind 29 | grant 1544, leave_and_seal 34, drop_familia 344, legacy_auto_convert 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| off:8675309 | initial_join 1680, legacy_rebind 35 | grant 1544, drop_familia 376, legacy_auto_convert 34, leave_and_seal 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| off:20261104 | initial_join 1699, legacy_rebind 36 | grant 1561, leave_and_seal 40, drop_familia 376, legacy_auto_convert 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
- 모든 구성 `allInvariantsPassed: true`, `syncInvariantLog` 본 실행 기록 0건, 생애 종료 시 `syncBaseline` 잔존·`syncDepth≠0`·`currentEventId` 잔존 0.
- 측정만(2-ii 대상): `active` 모양 불일치 0, `unbound` 모양 불일치 0, 정상 sealed 모양 불일치는 송환 종료 사유가 `left` 이므로 sealed 표시 시점 전부(로그 `normalSealedShapeFail`).
- `newborn_parent_familia/777`(10개 구성 밖): `legacy_sealed_join` 1건·`legacy_rejoin` 1건 — r1 과 digest·난수 동일(추가 시드 대조).

## 5. 미실행·미검증
- 2-ii 대상(측정만): 정상 sealed 모양(`leftReason==='god_returned'`) 불일치 — 현행 송환 종료 사유가 `left` 이므로 전부 불일치(설계 §6, 2-i 측정만).
- protected 전수: 기대 노출 0 집합 위반 0. `god_gone` 은 protected+adventurer 에 노출(알려진 2-ii 대상).
- 브라우저: 이 개발 환경의 Playwright 1.63.0 + 번들 Chromium 으로 file://·inline 각각 실행(§3). ChatGPT QA 환경 재현은 미실행.

## 6. 미결 질문
- Q20: **승인됨**(D-1·D-2·D-3).
- 2-ii·2b·D2: 미승인 유지. Q12: 보류 유지.
