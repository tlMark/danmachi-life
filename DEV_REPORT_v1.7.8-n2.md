# 개발 보고서 v1.7.8-n2 — F1D4A N2(2-ii) 팔나 연결 + RB-1 (가) 원자 롤백

이 문서는 제출·재제출 보고서 여섯 개를 순서대로 묶은 것이다(내용 수정 없음). 로그는 `logs/v178_n2/`(r1·r2·r3·r4·r4v·r4v2), 설계 정본은 `docs/f1d4a/`(REVIEW v27, DECISION_LOG v19, DECISION_SHEET v14, 정본 판별기).

| 판 | 내용 | 1차 QA |
|---|---|---|
| r1 | 첫 구현 | 반려(RB-1A·1B·1C) |
| r2 | application descriptor·배열 원자 복원·실패 기록 격리 | 반려(RB-2A·2B·2C) |
| r3 | 예외 시점 관찰·realm 판별 시험·S 배열 10종 | 조건부 반려(부모 접근자·realm 문구) |
| r4 | S.application 접근자 경로·realm 범위 명시 | 통과, Codex 2차 조건부 통과 |
| r4v | 실제 Chromium 후속 선택 예외 롤백 시험 | 통과 |
| r4v2 | 브라우저 시험 pathToFileURL | 통과 |

**미완료·미실행(2026-11-24 기준):** Codex 독립 재현(Node v22·Playwright), Windows Node file:// 실행, 관문 켬 Chromium·48k. 기존 `tests/browser_test.js`의 file URL 패턴은 Windows 실행 전 별도 확인.

---

## 개발 보고서 — F1D4A N2(2-ii) 팔나 연결 + RB-1 (가) 원자 롤백

- 작성: Claude Code, 2026-11-23
- 기준 커밋: main `406a03b`(406a03bc069890c71df13976d21b3fdb92999786)
- 설계 정본: REVIEW v27, DECISION_LOG v19, DECISION_SHEET v14
- 승인 근거: 사용자 결정(2026-11-23) — RB-1a~RB-1g 권장안 전부 채택, N2 세부 결정, N2 구현 착수 승인
- **Git: 커밋하지 않았다.** 사용자 지시대로 ChatGPT 1차·Codex 2차 검수를 통과한 뒤에 커밋한다.
- **활성화·기준선:** 결과가 바뀌는 N2-1·N2-2 관문은 `N2_GATES`로 **꺼 둔 채** 제출한다. 기준선(`logs/baseline_main_3859123`)은 바꾸지 않았다.

## 1. 변경 요약

변경 파일(`git diff --stat`): `script.js` +259/−7, 시험 5개 수정(의도적 시험 변경 표 참고), 시험 2개 신설. 전체 diff: `logs/v178_n2/r1/N2_vs_406a03b.diff`.

| 구분 | 내용 | 결과 영향 |
|---|---|---|
| RB-1 (가) 확장 (`script.js` `takeRollbackSnapshotExt`·`restoreRollbackSnapshotExt`·`trimLogNodesAfterSnapshot`, `chooseFollowup` catch) | RB-1a 기준값 얕은 복사로 교체 / RB-1b 객체 정체성 유지 복원 / RB-1c (ㄴ) 컨테이너 L1·L2·L3·L3+ / RB-1d (ㄱ) 현행 거부 유지 / RB-1e 연표 추가분 제거(X2b, 정지 안내 전) / RB-1f 묶음별 격리·보고(`rollback`·`input`)·S 밖 실패 기록·생애 경계 초기화 / RB-1g `partner_link`·`relations_integrity` 분리 | 예외 경로만. 정상 생애 불변(실측 아래 §3) |
| N2-1 (나) 성장 관문 | `canConvertExcelia`(유도 상태, `resumeOK` 없음 — N2-1b (가)), `convertExp`에 `N2_GATES.growth` 관문 | **꺼짐 제출.** 켜면 결과 변경(§4) |
| N2-2 (나) 던전 관문 | `canEnterDungeon2ii`(개인 기준 active + 현재 소속 `member`, N2-2a) | **꺼짐 제출.** 켜도 현재 데이터에서 결과 불변(§4) |
| `statusResumeAge` | 모든 active 진입 경로에서 `null` 명시(재수여·개종 606의 `S.age + 1` 제거, 최초 취득·재취득, 재입단·holder 변경), RA-3(active 이탈 시 `null`), `startLife` 초기화 | 결과 불변(관문 식이 이 필드를 읽지 않음) |
| N2-3c (나) | 즉시 재수여에도 `carryPotential` 호출 | 실제 생애에서는 이월 대상 0으로 결과 불변(실측). 합성 상태에서만 차이 |
| N2-6 (가) | `patronAbsence`(`startLife` null), `absenceOK`, A6 판정, A1·A4·A5(`fx.patronAbsence`, 전이 효과 뒤·902 앞), A3 S1~S5(`endPatronAbsenceForTransition`) | 결과 불변. `PATRON_ABSENCE_REASONS`는 빈 목록(값 미결정) → 실제 게임에서 부재가 시작되지 않음 |
| S1 후보 선검증 | `rollFamiliaBody`: 후보를 지역 변수로 받고, 무효면 이전과 같은 대입 뒤 예외, 유효할 때만 A3 후 대입 | 결과·난수·예외 동일(시험 S1) |
| Q5 `leaveFamilia` | A3만 방어적으로 넣음(S5). **게임 흐름에는 연결하지 않음** | 없음 |
| Q4-a·Q4-b | 바꾸지 않음(현행 유지) | 없음 |
| N2-4 | `canUpdateStatus`·`accumulatesExcelia`·`accumulatesPotential`·`falnaEmbedded` 정의 보존, 호출하지 않음. 변환 판정은 새 `canConvertExcelia`가 맡음 | 없음 |

### 의도적 시험 변경(기존 기대값 변경, 각 줄에 주석 표시)

| 파일·항목 | 이전 기대 | 새 기대 | 근거 |
|---|---|---|---|
| `tests/f1_transition_test.js` RB-T3 (a~e) | 예외 뒤 `syncBaseline.status === 'pending_after_exception'` | `syncBaseline` = 스냅숏 시점 값 | RB-1a |
| `tests/followup_halt_test.js` PF-9d | 같음 | 같음 | RB-1a |
| `tests/god_gone_2ba_test.js` GG-2e | `statusResumeAge === 31` | `=== null` | N2-1b (가), 변경 이력 #2 |
| `tests/god_gone_2ba_test.js` GG-2 사전 상태 | (없음) | `s.potential = 0` 추가 | N2-3c: 이전 fixture 는 팔나 플래그가 있는데 잠재력이 남은 불일치 상태. 잠재력이 남은 경우의 이월은 `n2_link_test` N2-3c 에서 따로 확인 |
| `tests/sync_2i_test.js` T7 | `statusResumeAge === 26` | `=== null` | N2-1b (가) |
| `tests/rng_sites_test.js` 지점 표 | 406a03b 줄 번호 | 새 줄 번호(분류·개수 불변, 새 난수 지점 없음) | 기존 관례(줄 이동 기록 주석) |

기대값을 약화한 항목은 없다. 모두 승인된 결정의 새 계약으로 바꿨다.

## 2. 새 시험

| 파일 | 결과 | 비고 |
|---|---|---|
| `tests/n2_rollback_test.js` | **PASS 74/74** | RBT-5a~e(입단·탈퇴·재수여·봉인·팔나 취득), RBT-10a·10b·10c-1~3·5·11(dup)·12·13-1·13-3·13-4, RBT-13(연표 DOM, Mock DOM), RBT-14a. [합성 상태 주입·예외 주입] |
| `tests/n2_link_test.js <406a03b 사본>` | **PASS 72/72** | N2-G0, G-2·G-2b, CV-1~CV-7, CV-5a~5d, N2-3c, EX-1, A1·A4·A5, AB-2(S1~S5)·AB-3·AB-4·AB-5·AB-6·AB-7·AB-8·AB-9·AB-10, S1(정상·강제·무효 후보, 406a03b 와 결과·S·난수 호출 수 동일). [합성 상태 주입, 관문은 시험 안에서만 켬] |
| `tests/n2_link_test.js`(사본 없이) | 65/67 | CV-7·S1 은 기준 사본이 필요해 **미실행**으로 FAIL 표시(통과로 세지 않음) |

## 3. 회귀(관문 꺼짐 = 제출 상태)

| 항목 | 결과 |
|---|---|
| 두 시드 3,000생애(20261104·777) | P5 기준선 로그와 **바이트 동일**(N2-1 단계, N2-2 단계 각각) |
| lifeDigest·rngCallDigest 10구성(`digest10_strict` vs P5 기준선) | **10/10 동일**(N2-1 단계, N2-2 단계 각각) |
| 48,000생애(4시드×4모드×3,000), 관문 꺼짐 | P5 기준 산출물 **32/32 SHA 동일** |
| 48,000생애, 406a03b 재실행 | P5 기준 산출물 32/32 SHA 동일(실행 환경 재현 확인) |
| `p1_verify` 전체(구현 사본, `.git` 포함) | 아래 표 |

### `p1_verify` 대조(406a03b 기준 실행 vs 구현)

| 항목 | 406a03b | 구현 | 해석 |
|---|---|---|---|
| 01 문법, 02·03 두 시드, 04, 05p·06p(P5 기준선), 07, 10 기존 시험 10종, 11~14 변이 4종, 20 Chromium file://, 21 Chromium inline, 40~42 | exit 0 | exit 0 | 같음 |
| 05·06(F1 기준), 05m·06m(f63c851 기준) | exit 1 | exit 1 | 과거 기준선 대조. P5 이후 예상된 불일치(구현과 무관) |
| 30 `rng_sites_test` | exit 0 | exit 1 → 표 갱신 뒤 **139/139** | 줄 번호 이동만(위 의도적 시험 변경) |
| 31 `rng_timer_test` | exit 1 | exit 0 | 406a03b 쪽 실패는 `.git` 없는 사본의 TM-2b 환경 문제. 구현 사본은 `.git` 포함 |

- `n2_rollback_test`·`n2_link_test`는 `p1_verify` 등록 목록에 넣지 않았다(검증 정책 변경은 승인 사항). 따로 실행해 위 §2에 적었다.
- Chromium 시험(20·21)은 기존 16항목 24생애이며 관문 꺼짐 상태다. 관문을 켠 상태의 Chromium 시험은 **미실행**이다.

## 4. 48,000생애 전후 비교(A = 406a03b, 관문 켬은 측정 사본에서만)

측정 사본 패치는 `logs/v178_n2/r1/48k/measurement_copy_patches/`에 있다. 게임 저장소의 파일은 바꾸지 않았다.

### N2-2 던전 관문 켬

- 16구성 모두 생애별 digest **3000/3000 일치**. 통합 지표 전부 같다. → 현재 데이터에서는 결과가 바뀌지 않는다.
- 이유(추론, 실측과 일치): 탈퇴(`applyEffects`의 `fx.dropFamilia` 블록)가 모험자·서포터를 은퇴 직업으로 바꾸므로 unbound 생애는 던전 사건의 직업 조건을 통과하지 못한다. `protected` 소속은 팔나 플래그가 없어 원래 던전 사건을 받지 않는다.

### N2-1 성장 관문 켬(의도적 결과 변경 후보)

| 지표 | A(406a03b) | B(성장 관문 켬) |
|---|---|---|
| 구성 / exit 0 / 불변식 통과 | 16 / 16 / 16 | 16 / 16 / 16 |
| 완료 생애 / 런타임 예외 | 48000 / 0 | 48000 / 0 |
| 팔나 이력 생애 | 23,984 (49.97%) | 24,058 (50.12%) |
| 던전 사건 경험 생애 / 총 발생 | 10,246 / 58,022 | 10,421 / 59,355 |
| 최종 레벨 분포 | 0:24016, 1:16225, 2:4946, 3:1190, 4:771, 5:400, 6:289, 7:124, 8:28, 9:11 | 0:23942, 1:16344, 2:4840, 3:1288, 4:697, 5:428, 6:301, 7:123, 8:28, 9:9 |
| 최고 레벨 / Lv6 도달 생애 | 9 / 452 | 9 / 461 |
| 평균 팔나 후 능력치 합(구성 평균) | 934.21 | **899.74** |
| 평균 달력 나이 | 86.00 | 85.81 |
| 사망 원인 | natural 42371 / hp 3645 / event 1984 | natural 42303 / hp 3755 / event 1942 |

- 공유 난수 흐름이 처음 막힌 생애부터 갈라지므로 같은 순번 생애의 일치는 구성마다 45~349/3000이다. 판정은 통합 지표로 한다.

### N2-1e 일괄 변환 측정(계측 사본, 16구성)

- 계측 사본의 통합 지표가 성장 관문 켬 실행과 **완전히 같아** 계측이 결과를 바꾸지 않음을 확인했다.
- 관문에 막힌 `convertExp` 호출 484,081회, 막힘을 겪은 생애 5,808.
- **일괄 변환**(막힌 뒤 첫 변환): 16회, 엑세리아 192.0, 능력치 증가 9,056, 이론값(엑세리아×50) 대비 반영률 **94.33%**, 같은 호출의 레벨업 0.
- 일반 변환: 861,161회, 반영률 79.42%(레벨업이 일어난 호출은 능력치 초기화 때문에 제외), 레벨업 13,750.
- 해석: 현재 데이터에서 unbound 기간 뒤 재입단은 드물어 일괄 변환이 16회뿐이다. 성장 관문의 주된 효과는 일괄 변환 손실이 아니라 **unbound 기간에 쌓인 엑세리아가 재입단 없이 끝까지 변환되지 않는 것**이다(평균 능력치 합 감소의 주 원인으로 추론). 이 "생애 말 미변환 엑세리아" 양은 이번에 따로 재지 않았다(미측정).

## 5. 관문 활성화 시 함께 필요한 시험 변경(사용자 결정 대상, 이번에 하지 않음)

성장 관문을 게임 코드에서 켜면 `test_runner.js`의 다음 두 곳이 실패한다(측정 사본에서 확인, 측정 사본에만 패치).
1. `levelUpFeatOnlyUnitTest`: 합성 상태가 무소속(unbound)이라 N2-1 (나)에서 레벨업하지 않는다.
2. 사전 단위 단계의 진단 기대 목록: 합성 상태에 `patronAbsence`가 없어 `absenceOK`가 fail-closed 진단을 남긴다.

둘 다 실제 생애가 아니라 러너 단위 단계의 합성 상태 문제다. 활성화를 승인하면 의도적 시험 변경으로 함께 처리한다.

## 6. 미실행·한계

- 관문을 켠 상태의 Chromium file://·inline 시험: 미실행.
- 관문 켬 상태의 lifeDigest 10구성 새 기준: 만들지 않음(기준선 갱신은 승인 사항).
- 생애 말 미변환 엑세리아 양: 미측정.
- `n2_rollback_test`의 RBT-13(연표 DOM)은 Mock DOM 결과다. 실제 브라우저에서 예외 경로를 일으키는 시험은 미실행.
- Codex 2차 실행 검수: 미실행(요청 전).

## 7. 사용자 결정이 필요한 사항

1. N2-1 성장 관문 활성화 여부(§4 결과 변경). 켜면 §5 시험 변경과 새 기준선이 필요하다.
2. N2-2 던전 관문 활성화 여부(현재 데이터에서는 결과 불변).
3. 기존 미결정: Q4-a, Q4-b, Q5, `PATRON_ABSENCE_REASONS`, N2-2b. 결정 내용 미수령: P4 B1~B4, N3-1·N3-2.

---

## 개발 보고서 r2 — N2 1차 QA 반려(RB-1A·1B·1C) 보완

- 작성: Claude Code, 2026-11-23
- 기준 커밋: main `406a03b`. **커밋하지 않았다**(QA 지시·사용자 결정: 검수 통과 뒤 커밋).
- 유지한 것: `N2_GATES.growth = false`, `N2_GATES.dungeon = false`, P5 기준선, `p1_verify` 등록 정책, Q4-a·Q4-b·Q5 등 미결정 항목.
- 첫 제출 보고서 `DEV_REPORT_N2.md`의 내용은 그대로 유효하다. 이 문서는 바뀐 부분만 적는다.

## 1. 수정 내용과 사유

| 지시 | 수정 [script.js] | 사유 |
|---|---|---|
| RB-1A application descriptor 보존 | `application` 스냅숏을 `Reflect.ownKeys` + `a[k]` 읽기에서 **`rbxOwnSnapshot`(descriptor 기준)**으로 바꿨다. 복원은 `rbxOwnRestore`를 쓴다. 이렇게 하면 접근자는 호출하지 않고, 비표준 descriptor·접근자는 지원하지 않는 스키마로 본다 | 다른 L3 대상과 같은 정책으로 맞춤. 스냅숏 때 지원하지 않는 스키마였다면 `unverified`, 예외 뒤 non-configurable 등으로 복원할 수 없으면 `failed`로 보고한다 |
| RB-1B history·blocked 원자 복원 | 배열 스냅숏 함수 `rbxArrayList`를 새로 만들었다. 원생 `Array.prototype`(어느 realm이든), 인덱스와 `length`만 있는 배열, 기본 데이터 descriptor, 빈 칸 없음을 요구하고, 원소는 descriptor 값으로만 읽는다. 내용은 `rbxArrayRefill`로 다시 채우고 descriptor로 확인한다. `application` 묶음을 `application`(최상위)·`application.history`·`application.blocked` 셋으로 나눴다. 각 묶음은 `replaced`(예외 시점 교체 여부), `refRestored`, `changed`(원소 변경 여부)를 보고한다 | 선행(최상위)이 `ok`가 아니면 배열 묶음은 `unverified`. 참조를 되돌리지 못하면 `failed`. 동결 등으로 내용을 되돌리지 못하면 `failed`. 스냅숏 때 배열 스키마가 지원되지 않으면 `unverified` |
| (같은 정책 확대) S 배열 컨테이너 | `rbxSnapArray`도 `slice()` 대신 `rbxArrayList`를 쓴다. 지원하지 않는 배열이면 내용을 복원하지 않고 V2·V3를 `unverified`로 둔다 | `slice()`는 접근자 원소의 getter를 부른다. 같은 결함을 막는다 |
| RB-1C 실패 기록 격리 | 실패 기록을 `verify` 단계에서 떼어 별도 단계 `recordFailure`로 옮겼다. 쓰기는 `writeRollbackFailureRecord`가 맡는다. 순서는 `rollbackFailureUnrecorded = true` → 기록 → `false`다. 진단에 `failureRecorded`(정상 복원이면 `null`, 기록 성공 `true`, 실패 `false`)를 넣었다 | 기록이 실패해도 플래그가 `true`로 남아 성공으로 오인하지 않는다. `cleanupErrors`에 `recordFailure`가 따로 남는다. 롤백 결과(`rollback`)와 기록 성공 여부는 서로 다른 값이다. `progressHalted`는 X0에서 이미 `true`이고 원래 예외는 X6에서 다시 던진다 |

## 2. 변경 시험

| 파일 | 변경 | 결과 |
|---|---|---|
| `tests/n2_rollback_test.js` | 시험 9개 추가: RB-1A-1, RB-1A-2(a~c), RB-1B-1~4, RB-1C(실패), RB-1C(정상) | **PASS 108/108**(이전 74 + 34) |
| `tests/rng_sites_test.js` | 지점 표 줄 번호를 최종 위치로 다시 갱신(분류·개수 불변, 새 난수 지점 없음). 주석의 매핑은 406a03b → 최종으로 적었다 | **PASS 139/139** |

## 3. QA 재검수 요청 항목 대응

| # | 항목 | 확인 시험 | 결과 |
|---|---|---|---|
| 1 | application getter 호출 0회 | RB-1A-1(최상위 접근자), RB-1B-3(history 원소 접근자). 확장 스냅숏·복원 함수를 직접 불러 계수 | 0회 |
| 2 | descriptor 보존·비지원 descriptor 미검증 판정 | RB-1A-1(접근자 → `unverified`), RB-1A-2a(non-enumerable → `unverified`), RB-1A-2b(non-configurable 추가 → `failed`), RB-1A-2c(예외 뒤 접근자 → 저장본 데이터 속성으로 복원, `ok`) | 통과 |
| 3 | history·blocked 각각의 참조·내용 복원 | RB-1B-1(history 교체 `replaced: true` → 원래 참조·내용, blocked 원소 변경 `changed: true` → 원래 내용), RB-1B-4(원래 없던 blocked 제거) | 통과 |
| 4 | 복원 실패 시 부분 복원 보고 | RB-1B-2(동결된 history → `failed`·`partial(failed)`·실패 기록) | 통과 |
| 5 | 원래 예외 재전파·정지 유지 | RB-1B-2, RB-1C(기록 실패에서도 같은 예외 객체·`progressHalted`) | 통과 |
| 6 | 기존 RB-1a~RB-1g 계약 유지 | `n2_rollback_test` 기존 74건, `followup_halt_test` 155/155, `f1_transition_test` 145/145, `devabil_test` 133/133 | 통과 |
| 7 | L1 기존 책임과 확장 L2·L3 책임의 중복 방지 | `RBX_BASE_L1`(items·itemsConsumed·relations·itemUses·levelHistory)은 변경 없음. 확장은 L1을 확인만 한다 | 유지 |
| 8 | RB-M9 변이 검출 유지 | `f1_transition_test` RB-M9-mut1~mut5(`p1_verify` 10번 항목) | 통과 |

## 4. 회귀(관문 꺼짐)

| 항목 | 결과 |
|---|---|
| `p1_verify` 전체(새 사본, `.git` 포함) | 01·02·03·04·05p·06p·07·10 기존 시험 10종·11~14 변이 4종·20 Chromium file://·21 Chromium inline·31·40~42 **exit 0**. 05·06·05m·06m은 과거 기준선 대조라 예상된 불일치(406a03b도 같음). 30 `rng_sites_test`는 이 실행에서 줄 번호 때문에 실패했고, 표를 갱신한 뒤 **139/139** |
| 두 시드(02·03)와 P5 기준선 바이트 비교(05p) | 동일 |
| lifeDigest·rngCallDigest 10구성(06p, P5 기준선) | 10/10 동일 |
| 48,000생애(관문 꺼짐) | P5 기준 산출물 **32/32 SHA 동일** |
| `p1_verify` 밖 시험 | `devabil_test` 133/133, `engine_p2_test` 639/639, `eventcond_test` 56/56, `region_p3_test` 160/160, `n2_link_test`(406a03b 사본 지정) 72/72 |

## 5. 미실행

- 관문을 켠 상태의 Chromium 시험: 미실행.
- 실제 브라우저에서 후속 선택 예외를 일으키는 롤백 시험: 미실행(RBT-13·RB-1 시험은 Mock DOM·vm).
- 관문 켬 48k 재실행: 미실행. 이번 수정은 예외 경로에만 해당한다. 관문 켬 결과(`DEV_REPORT_N2.md` §4)는 첫 제출 코드로 측정한 값이다.
- `p1_verify` 30번을 표 갱신 뒤 `p1_verify` 안에서 다시 돌리지는 않았다. 저장소에서 단독으로 실행했다(139/139).
- Codex 2차 검수: QA 지시대로 요청하지 않았다.

---

## 개발 보고서 r3 — N2 1차 재검수(RB-2A·2B·2C) 보완

- 작성: Claude Code, 2026-11-23
- 기준 커밋: main `406a03b`. 작업 트리에서만 수정했고 **커밋하지 않았다**(QA 지시·사용자 결정).
- 유지한 것: `N2_GATES` 두 관문 꺼짐, P5 기준선, `p1_verify` 등록 정책, 미결정 항목(Q4-a·Q4-b·Q5·`PATRON_ABSENCE_REASONS`·N2-2b 등)
- 앞선 보고서 `DEV_REPORT_N2.md`(첫 제출)와 `DEV_REPORT_N2_r2.md`는 그대로 유효하다. 이 문서는 r2 → r3에서 바뀐 부분만 적는다.
- 수정분 diff: `logs/v178_n2/r3/N2_r2_to_r3_fix.diff`. 406a03b 대비 전체 diff: `logs/v178_n2/r3/N2_vs_406a03b_r3.diff`(6개 파일 +348/−19, 새 시험 파일 3개 별도)

## 1. 수정 내용과 사유

| 지시 | 수정 [script.js] | 사유 |
|---|---|---|
| RB-2A `changed` 측정 시점 | 새 함수 `observeRollbackState(x)`. `chooseFollowup` catch에서 **어떤 복원보다 먼저** 새 단계 `observe`로 실행한다(X0b 뒤, X1 앞). descriptor만 읽어 예외 시점의 `application`·`history`·`blocked`를 관찰하고 `x.obs`에 남긴다. 배열 묶음은 이 관찰값을 그대로 보고하며, 복원 단계는 관찰값을 바꾸지 않는다 | r2는 최상위 복원 **뒤에** `changed`를 계산해서 예외 시점 값과 복원 뒤 값이 섞일 수 있었다 |
| (의미 구분) | `replaced`: 예외 시점에 배열이 스냅숏 때와 다른 배열(또는 없음)이었는지. 관찰할 수 없으면 `null`<br>`changed`: 예외 시점 배열 내용이 스냅숏 내용과 달랐는지. 어느 쪽이든 지원하지 않는 배열이면 `null`<br>`refRestored`: 복원 **뒤** 원래 배열 참조인지. 원래 없던 배열은 키가 지워졌는지 | QA 요구 |
| (보고 누락 정정) | 원래 없던 `blocked`가 생긴 경우의 이른 반환에도 `replaced`·`changed`·`refRestored`를 넣었다 | 시험 RB-2A-3에서 발견 |
| RB-2C(같은 계약으로 맞춤) | `falnaHistory`·`falnaTransitions`의 확장 모드를 `ref`에서 `own`(원소 속성 L3 포함)으로 바꿨다 | 두 배열은 push만 한다는 계약(RBT-1)이지만, 10종 시험에서 원소 속성 변경이 되돌려지지 않는 것을 확인했다. 10종을 같은 L2·L3 계약으로 맞췄다. 원소는 동결 객체가 아니어서(`pushFalnaTransition` 일반 객체) 정상 생애에서 지원하지 않는 스키마가 되지 않는다 |
| RB-2B 판별 방식 | **바꾸지 않았다.** `rbxArrayList`의 판별(프로토타입의 own `constructor`가 원생 `function Array() { [native code] }`이고 그 `prototype`이 프로토타입 자신)은 Node v22와 Chromium 153(file://·inline) 모두에서 같은 결과였다(§2) | QA 조건: 결과가 일관되지 않을 때만 방식 변경 |

## 2. 추가 시험

| 파일 | 추가 | 결과 |
|---|---|---|
| `tests/n2_rollback_test.js` | RB-2A-1~6, RB-2B(Node: 게임 realm·시험 host realm·세 번째 vm realm), RB-2C-1~4 | **PASS 184/184**(r2 108 + 76) |
| `tests/n2_array_realm_browser_test.js`(신규) | RB-2B를 실제 Chromium에서 확인. 다른 realm은 같은 출처 iframe | **file:// PASS 10/10**, **inline PASS 10/10** |
| `tests/rng_sites_test.js` | 지점 표 줄 번호를 최종 위치로 다시 갱신(분류·개수 불변, 새 난수 지점 없음) | **PASS 139/139** |

### RB-2A 시험

| ID | 상황 | 기대·결과 |
|---|---|---|
| 2A-1 | history 제자리 push | `replaced:false, changed:true, refRestored:true`. blocked는 `false/false` |
| 2A-2 | 같은 내용의 새 배열로 교체 | `replaced:true, changed:false` |
| 2A-3 | 원래 없던 blocked 생성 | `replaced:true, changed:true`, 복원 뒤 키 없음 |
| 2A-4 | 예외 시점 배열에 접근자 원소 | `changed:null`, getter 호출 0 |
| 2A-5 | 예외 시점 `application.history`가 접근자 | `replaced:null, changed:null`, getter 호출 0, 복원 뒤 원래 참조 |
| 2A-6 | 복원 함수 전후의 관찰값 | 같음, 보고값과도 같음 |

### RB-2B 판별 결과(Node·Chromium file·inline 모두 같음)

| 대상 | 판정 |
|---|---|
| 1 현재 realm 일반 배열 | 지원 |
| 2 다른 realm 일반 배열(Node: 시험 host·별도 vm / Chromium: iframe) | 지원 |
| 3 사용자 정의 하위 클래스(두 realm) | 거부 |
| 4 프로토타입 교체(`Object.create(Array.prototype)`)·null | 거부 |
| 5 생성자 교체: 이름만 Array인 함수 / bind된 Array / Proxy(Array) / 인스턴스 own `constructor` | 모두 거부 |
| 추가: 빈 칸·동결·접근자 원소 | 거부 |
| 추가(Node): 전역 `Array.prototype.constructor`를 바꾼 환경 | 모든 배열 거부(fail-closed. 이 환경에서는 롤백이 `partial(unverified)`로 보고된다) |

### RB-2C 시험(S 배열 10종)

| ID | 내용 | 결과 |
|---|---|---|
| 2C-1 | 10종 각각: 원소 추가·삭제·원소 속성 변경 뒤 예외 → 원래 참조·내용, 묶음 `ok` | 통과 |
| 2C-2 | 확장이 L1을 맡는 6종(familiaHistory·falnaHistory·falnaTransitions·aspirationHistory·residenceHistory·locationHistory): 기존 스냅숏·복원 함수 소스에 해당 키가 없음(정적). 필드 삭제·교체 뒤 예외 → 확장이 원래 참조로 되돌림 | 통과 |
| 2C-3 | 기존 복원이 L1을 맡는 4종(items·itemsConsumed·relations·levelHistory): 원본은 기존 복원이 되돌림. **기존 복원에서 해당 필드를 뺀 변이**에서는 확장이 L1을 고치지 않고 `V1: failed`, 전체 `partial(failed)`로 보고(책임 중복 없음) | 통과 |
| 2C-4 | 10종 각각: 스냅숏 때 지원하지 않는 배열 → 내용 복원 안 함, `unverified`·schema 표시 | 통과 |
| RB-M9 | `f1_transition_test` RB-M9 / RB-M9-mut1~5(`p1_verify` 10번 항목) | 145/145 |

## 3. 회귀(관문 꺼짐)

| 항목 | 결과 |
|---|---|
| `p1_verify` 전체(r3 사본, `.git` 포함) | 01·02·03·04·05p·06p·07, 10 기존 시험 10종, 11~14 변이 4종, 20 Chromium file://, 21 Chromium inline, **30 rng_sites**, 31, 40~42 **모두 exit 0**. 실패는 05·06·05m·06m 넷뿐이며 과거 기준선 대조라 예상된 불일치다(406a03b도 같음) |
| 두 시드와 P5 기준선 바이트 비교(05p) | 동일 |
| lifeDigest·rngCallDigest 10구성(06p) | 10/10 동일 |
| 48,000생애(관문 꺼짐) | P5 기준 산출물 **32/32 SHA 동일** |
| `p1_verify` 밖 시험 | devabil 133/133, engine_p2 639/639, eventcond 56/56, region_p3 160/160, n2_link(406a03b 사본 지정) 72/72, n2_rollback 184/184 |

## 4. 미실행

- **실제 브라우저에서 후속 선택 예외를 일으키는 롤백 검증: 미실행.** RB-1·RB-2 시험은 Node vm과 Mock DOM 결과다. Chromium에서 실행한 것은 원생 Array 판별(RB-2B)뿐이다.
- 관문을 켠 상태의 Chromium 시험: 미실행.
- 관문 켬 48k 재실행: 미실행. r2·r3 수정은 예외 경로에만 해당한다. 관문 켬 결과는 첫 제출 코드로 측정한 값이다.
- 새 시험 3개는 `p1_verify`에 등록하지 않았다(등록 정책 유지). 따로 실행했다.
- Codex 2차 검수: QA 지시대로 요청하지 않았다.

---

## 개발 보고서 r4 — N2 r3 1차 재검수(필수 1·2) 보완

- 작성: Claude Code, 2026-11-24
- 기준 커밋: main `406a03b`. 작업 트리에서만 수정했고 **커밋하지 않았다**.
- 유지한 것: `N2_GATES` 두 관문 꺼짐, P5 기준선, `p1_verify` 등록 정책, 미결정 항목. RB-2C(`falnaHistory`·`falnaTransitions` `own` 모드)는 QA 수용 사항대로 그대로 두었다.
- 앞선 보고서(`DEV_REPORT_N2.md`, `_r2.md`, `_r3.md`)는 그대로 유효하다. 이 문서는 r3 → r4에서 바뀐 부분만 적는다.
- 수정분 diff: `logs/v178_n2/r4/N2_r3_to_r4_fix.diff`. 406a03b 대비 전체 diff: `logs/v178_n2/r4/N2_vs_406a03b_r4.diff`(6개 파일 +361/−19, 새 시험 파일 3개 별도)

## 1. 수정 내용

| 지시 | 수정 [script.js] |
|---|---|
| 필수 1 — `S.application` 접근자 | `observeRollbackState`: `S.application`의 descriptor가 접근자이거나 descriptor를 얻다가 예외가 나면 `appObservable = false`로 두고 자식 배열 관찰을 멈춘다. `history`·`blocked`의 `replaced`·`changed`는 `null`, `application.replaced`도 `null`(`observable:false`)이다. r3에서는 이 경우 `curA`가 `undefined`가 되어 자식 배열이 사라진 것으로 오판할 수 있었다 |
| (같은 경로의 복원) | `application` 묶음의 최상위 복원도 descriptor로만 읽고 쓰게 바꿨다. 예외 시점에 `S.application`이 접근자가 됐어도 getter·setter를 부르지 않는다. configurable이면 지우고 원래 객체를 기본 데이터 속성으로 다시 정의하고, 그렇지 않으면 `failed`로 보고한다. r3는 `S.application !== r.ref` 비교와 대입 과정에서 getter·setter를 호출했다 |
| 필수 2 — RB-2B 범위 문구 | 정책은 **바꾸지 않았다.** `rbxArrayList`는 **배열이 속한 realm의** 원생 Array를 검사한다. 정책을 시험 이름과 이 문서에 다음과 같이 명시했다. **constructor가 바뀐 realm의 배열은 거부(fail-closed), 정상인 다른 realm의 배열은 지원.** 거부된 배열이 롤백 대상이면 결과는 `partial(unverified)`이다(성공으로 보지 않음) |

## 2. 추가·변경 시험

| 파일 | 내용 | 결과 |
|---|---|---|
| `tests/n2_rollback_test.js` | RB-2A-7(최상위 `S.application` 접근자: 자식 `replaced`·`changed` null, **롤백 전체 getter·setter 호출 0**, 원래 객체가 데이터 속성으로 복원, 묶음 ok). RB-2A-8(`S.application` descriptor 획득 예외: 자식 null, 원래 예외·정지 유지). RB-2B-7을 7a·7b·7c로 나눔(아래) | **PASS 191/191** |
| `tests/n2_array_realm_browser_test.js` | RB-2B-7a·7b 추가: iframe 하나의 `Array.prototype.constructor`만 바꾸고 그 realm 배열은 거부, 페이지와 다른 iframe 배열은 지원. 시험 뒤 원래 constructor를 되돌린다 | **file:// PASS 12/12, inline PASS 12/12** |
| `tests/rng_sites_test.js` | 줄 번호만 최종 위치로 갱신(분류·개수 불변, 새 난수 지점 없음) | PASS 139/139 |

### RB-2B 판정 범위(Node·Chromium 같음)

| ID | 상황 | 판정 |
|---|---|---|
| 7a | constructor가 바뀐 realm(Node: 게임 vm realm, Chromium: iframe)의 배열 | 거부(fail-closed) |
| 7b | 같은 상황에서 정상인 다른 realm(Node: 시험 host·별도 vm, Chromium: 페이지·다른 iframe)의 배열 | 지원(정책) |
| 7c(Node) | constructor가 바뀐 게임 realm에서 롤백 | `partial(unverified)`·schema 표시 |

## 3. 회귀(관문 꺼짐)

| 항목 | 결과 |
|---|---|
| `p1_verify` 전체(r4 사본, `.git` 포함) | 실패는 05·06·05m·06m 넷뿐이다(과거 기준선 대조, 406a03b도 같음). 나머지는 모두 exit 0이다: 02·03 두 시드, 05p·06p(P5 기준선), 10 기존 시험, 11~14 변이(RB-M9 포함), 20·21 Chromium file://·inline, 30 rng_sites, 31, 40~42 |
| 48,000생애(관문 꺼짐) | P5 기준 산출물 **32/32 SHA 동일** |
| `p1_verify` 밖 시험 | devabil 133/133, engine_p2 639/639, eventcond 56/56, region_p3 160/160, n2_link(406a03b 사본) 72/72, n2_rollback 191/191, rng_sites 139/139 |

## 4. 미실행

- **실제 브라우저에서 후속 선택 예외를 일으키는 롤백 검증: 미실행.** RB-1·RB-2 롤백 시험은 Node vm과 Mock DOM 결과다. Chromium에서 실행한 것은 원생 Array 판별(RB-2B)뿐이다.
- 관문을 켠 상태의 Chromium 시험, 관문 켬 48k 재실행: 미실행(r2~r4 수정은 예외 경로에만 해당).
- 새 시험 3개는 `p1_verify`에 등록하지 않았다(정책 유지).
- Codex 2차 검수: 요청하지 않았다(QA 지시).

---

## 개발 보고서 r4v — Codex 2차 조건부 통과 뒤 다음 조치(검증 보완, 게임 코드 변경 없음)

- 작성: Claude Code, 2026-11-24
- 기준: r4(`Danmachi_N2_impl_406a03b_r4.zip`, SHA-256 `f22e781f…11d59e7`). **게임 코드는 r4와 바이트 동일하다**(script.js·data.js·events.js·index.html·core/*.js 대조).
- 바뀐 것: 새 시험 파일 하나 `tests/n2_browser_rollback_test.js`. 커밋하지 않았다.
- 유지: `N2_GATES` 두 관문 꺼짐, P5 기준선, `p1_verify` 등록 정책(새 시험은 등록하지 않음), 미결정 항목.

## 1. 다음 조치 3 — 실제 브라우저 후속 선택 예외 롤백(이번에 신설·실행)

`tests/n2_browser_rollback_test.js`: Chromium에서 `index.html`을 연다. 시험용 후속 선택 kind를 페이지에 등록하고 `S.pendingFollowup`을 만든 뒤 실제 `chooseFollowup('go')`를 부른다. resolve 안에서 상태를 바꾸고 연표에 문구를 낸 다음 예외를 던진다. [합성 상태 주입·예외 주입]

| 사례 | resolve 안의 변경 | 확인 |
|---|---|---|
| A | 입단(`apply({familia:'roll', valis})`) → 팔나 취득(`checkFalna`) → 연표 `say` → 아이템 획득 → 관계 연간 갱신 → `application.attemptSeq` | (전제) 예외 직전 S가 실제로 바뀌고 연표 노드가 늘고 소속이 생김 / 원래 예외가 같은 객체로 전파되고 정지 / S 전체 = 스냅숏 / 보고 `ok`·`normal` / 주요 컨테이너·이력 원래 참조 / 연표: 스냅숏 뒤 노드 = 정지 안내 1건(롤백된 문구 제거) / `pendingFollowup` 정리, 실패 기록 없음 / 상태창이 복원된 발리스 표시 |
| B | 활성 단원(loki)에서 신의 송환 재수여 → 탈퇴 → 연표 `say` | A와 같은 항목 + (전제) 예외 직전 소속 없음, 복원 뒤 loki |
| C | 복원할 수 없는 변경(`familiaHistory`에 non-configurable 속성) | 원래 예외·정지 / `partial(failed)`(성공으로 보지 않음) / 실패 기록 남음 / 정지 안내 1건 |

| 실행 | 결과 |
|---|---|
| Chromium 153.0.8010.12 · Node v22.23.4 · **file://** | **PASS 23/23** |
| 같은 환경 · **inline**(file:// 배포 경로 검증이 아님) | **PASS 23/23** |
| 변이 확인: 확장 롤백(`restoreRollbackSnapshotExt`)을 뺀 사본, file:// | **FAIL 17/23**(S 불일치 A·B, 소속 미복원 A·B, C의 부분 복원 미보고·실패 기록 없음) → 시험이 롤백 결함을 검출함 |

## 2. 다음 조치 1·2·4·5 — 작성자 실행 기록(독립 재현 아님)

Codex 환경(Windows, Node v24.22.3, Playwright 미설치)에서 실행하지 못한 항목을 작성자 환경(Linux, Node v22.23.4, Playwright 1.63.0, Chromium 153)에서 r4 코드로 실행한 기록이다. **이것은 작성자 실행이며 Codex 독립 재현을 대신하지 않는다.**

| 조치 | 작성자 실행 결과 | 위치 |
|---|---|---|
| 1 Node v22에서 롤백·링크 시험 | n2_rollback 191/191, n2_link(406a03b 사본) 72/72 | `logs/v178_n2/r4/` |
| 2 Chromium file://·inline 배열 시험 | 각 12/12 | `logs/v178_n2/r4/n2_array_realm_browser_*.log` |
| 4 `p1_verify.sh` 전체 | 실패는 05·06·05m·06m뿐(과거 기준선 대조). 나머지 exit 0. Chromium file://·inline(20·21) 포함 | `logs/v178_n2/r4/p1_verify_impl4/` |
| 5 48,000생애(관문 꺼짐) | P5 기준 산출물 32/32 SHA 동일 | `logs/v178_n2/r4/48k_off4_vs_P5_sha.txt` |
| 3 브라우저 예외 롤백 | §1(이번에 신설) | `logs/v178_n2/r4v/` |

## 3. 남은 검증 경계(미실행 유지)

- 관문을 켠 상태의 Chromium 시험: 미실행.
- 관문 켬 48k 재실행: 미실행(r2~r4 수정은 예외 경로에만 해당. 관문 켬 수치는 첫 제출 코드로 측정).
- Node v22·Playwright 환경의 **독립**(Codex) 재현: 미실행. Codex 환경에 Node v22와 Playwright가 필요하다.
- 실제 게임 진행 중에 자연스럽게 일어나는 후속 선택 예외: 해당 없음. 현재 데이터의 유일한 후속 선택(`recruit_after_fail`)에서 예외가 나는 경로는 확인되지 않았다. 그래서 이번 시험은 예외를 주입했다.

---

## 개발 보고서 r4v2 — 브라우저 시험 file URL 보완 + 작성자 환경 재실행

- 작성: Claude Code, 2026-11-24
- 기준: r4v(`Danmachi_N2_impl_406a03b_r4v.zip`). **게임 코드는 r4·r4v와 바이트 동일**(script.js·data.js·events.js·index.html·core/*.js 대조).
- 바뀐 것: 새 브라우저 시험 파일 **2개의 file URL 생성 한 줄씩**(+ `require('url')` 한 줄씩). diff: `logs/v178_n2/r4v2/N2_r4v_to_r4v2_test_fix.diff`. 커밋하지 않았다.
- 유지: `N2_GATES` 두 관문 꺼짐, P5 기준선, `p1_verify` 등록 정책, 미결정 항목.

## 1. QA 정적 지적 반영 — `pathToFileURL`

| 파일 | 이전 | 이후 |
|---|---|---|
| `tests/n2_browser_rollback_test.js`(지적 대상) | `page.goto('file://' + root + '/index.html')` | `page.goto(pathToFileURL(path.join(root, 'index.html')).href)` |
| `tests/n2_array_realm_browser_test.js`(같은 결함) | 같음 | 같음 |

- 같은 패턴이 기존 파일 `tests/browser_test.js` 23행에도 있다. 이 파일은 이번 범위(새 시험 파일)가 아니므로 **바꾸지 않았다.** 지금까지 Linux에서만 실행됐다. Windows에서 실행하려면 같은 수정이 필요할 수 있다(별도 결정 사항).
- Windows 경로 변환 확인(Node v22 `pathToFileURL(…, { windows: true })`, Linux에서 실행):
  - `C:\Users\<사용자>\danmachi-life\index.html` → `file:///C:/Users/<사용자>/danmachi-life/index.html`
  - 공백·한글 경로도 올바르게 인코딩된다.
- **Windows Node에서의 실제 file:// 실행: 미실행**(이 환경은 Linux).

## 2. 대상 4종 재실행 — 작성자 환경(독립 재현 아님)

**이 실행은 작성자(Claude Code)가 한 것이며 Codex 독립 재현을 대신하지 않는다.** Codex 독립 재현은 미완료로 남는다.

- 환경: Linux 6.18.44 x86_64, **Node v22.23.4**, Playwright 1.63.0, Chromium 153.0.8010.12
- 대상: 현재 작업 트리의 깨끗한 사본(`.git` 제외 복사)
- 원시 로그와 종료 코드: `logs/v178_n2/r4v2/`(`ENV.txt`와 시험별 `.log`, 각 로그 끝줄 `exit=N`)

| 시험 | 모드 | 결과 | 종료 코드 |
|---|---|---|---|
| `n2_browser_rollback_test` | file:// | PASS 23/23 | 0 |
| `n2_browser_rollback_test` | inline(file:// 배포 경로 검증 아님) | PASS 23/23 | 0 |
| `n2_array_realm_browser_test` | file:// | PASS 12/12 | 0 |
| `n2_array_realm_browser_test` | inline | PASS 12/12 | 0 |
| `n2_rollback_test` | — | PASS 191/191 | 0 |
| `n2_link_test`(406a03b 사본 지정) | — | PASS 72/72 | 0 |

- 브라우저 시험 2개는 file URL을 바꿨으므로 이번에 다시 실행했다. 나머지 둘(`n2_rollback`, `n2_link`)은 r4와 같은 코드이므로 이전 PASS 기록이 있지만, 같은 사본에서 확인을 위해 함께 실행했다(각 수십 초).

## 3. 상태 구분

| 항목 | 상태 |
|---|---|
| 대상 4종(작성자 환경, Linux·Node v22) | 통과(위 표) |
| Windows Node file:// 실행 | **미실행** |
| Codex 독립 재현 | **미완료**(Codex 사용량 미회복) |
| 관문 켬 Chromium·관문 켬 48k | 미실행 |
| 자연 발생 후속 선택 예외 | 해당 없음(합성 예외 주입만 검증) |

## 4. 작업 종료 후 Git 상태

`git status --short`(`logs/v178_n2/r4v2/git_status_after.txt`): 수정 6개(`script.js`, 시험 5개 — 의도적 시험 변경), 미추적 4개(새 시험 `n2_array_realm_browser_test.js`·`n2_browser_rollback_test.js`·`n2_link_test.js`·`n2_rollback_test.js`). r4v 대비 바뀐 것은 새 브라우저 시험 2개뿐이다. 커밋 0건.
