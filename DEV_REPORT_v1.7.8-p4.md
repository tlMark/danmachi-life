# 개발 보고서 — F1D4A P4 (F-A 던전 접근 O1 · F-A2 입단 이주 선택 · HS-1 · 규칙 D) (2026-11-27)

- 근거: DECISION_LOG v21(자율 개발 모드, 첫 위임 범위 P4 · B1~B4 (가) 2026-11-25 위임), 설계 D-REGION r3.16 §8.0.1·§8.5, D-WORLD r3.16 §3.5.
- 추가 사용자 결정(2026-11-27, 구현 중 질의): conscript 에 **규칙 D만 적용**(`residenceIn:['rakia']`). DR-2 A·B·C 는 미구현.
- 기준 커밋: `819f8e8`(작업 트리 변경, 커밋하지 않음 — Git 작업은 사용자 담당).
- 상태 표기: 아래 결과는 전부 **작성자 실행**이다. ChatGPT 1차·Codex 최종 QA 아님. Codex 는 미요청이다.
- **결과가 바뀌는 의도적 변경**이다. 기준선(F1·f63c851·P5 3859123)은 갱신하지 않았다. 그래서 p1_verify 의 기준선 비교 6항목은 설계대로 실패로 남는다(§3).
- 실행 환경: Node v22.23.4, Ubuntu 24.04.5 LTS(Linux 6.18.44), vCPU 4, Chromium 153.0.8010.12(Playwright 1.63.0 번들).

## 1. 변경 내용

### 1.1 게임 코드

| 파일 | 변경 | 근거 |
|---|---|---|
| `events.js` | 던전 사건 17건(`EVENT_AREA` 'dungeon')의 사건 조건에 `dungeonReach: true` | F-A, §8.0.1 |
| `events.js` | `healer_shift` 에 `locationIn:['orario']` | HS-1 |
| `events.js` | `conscript` 에 `residenceIn:['rakia']`(출생 조건 유지) | 규칙 D(사용자 결정 2026-11-27, 게임 고유) |
| `script.js` `match()` | `dungeonReach` 키를 own-key 로 검사하고, 값은 정확히 `true` 만 인정한다. `dungeonReach(event)` 가 거짓이면 거짓. `MATCH_KEYS` 에 추가했고 선택지 조건 허용 목록에는 넣지 않았다 | D-WORLD §3.5 |
| `script.js` | `dungeonReach(e) = reachO1() \|\| reachSecret(e)`. O1 은 현재 위치만 본다. 비밀 분기 `validAccess` 는 D-WORLD §3.5 의 검사 전부(일반 객체, 6개 own 데이터 속성, 경로·주기·부여 시점·범위 항목·중복·inUse·통로 상태, getter 미호출)를 한다. 오염은 진단 `dungeon_access_invalid`(S 밖)만 남긴다. **`S.dungeonAccess` 를 만드는 경로는 없다**(메렌 통로 행동 미구현). 그래서 실제 생애에서 비밀 분기는 항상 거짓이다 | D-WORLD §3.5, B3 (가) |
| `script.js` | `noteFamiliaJoined(famId, path)`: `rollFamiliaBody` 성공 끝(P1·P2)과 `completeConversion` 성공 끝(P3)에서 부른다. `FAMILIA_HOME === 'orario'` 이고 위치·거주지 중 하나라도 오라리오가 아니면 `S.pendingRelocationOffer` 를 남긴다. `newborn_control` 은 제외 | §8.5.2·§8.5.3 |
| `script.js` `chooseBody` | 사망 판정 뒤 후속 선택 단계에서 제안을 `createFollowup('relocate')` 로 바꾼다. 다른 후속 선택이 보류 중이면 진단 `relocation_offer_conflict` 만 남기고 제안을 버린다 | §8.5.3 |
| `script.js` | `FOLLOWUP_KINDS.relocate`: 문구 "{파밀리아}의 본거지는 오라리오에 있다. 거처를 옮길까?" / "오라리오로 이주한다" · "지금 지역에 머문다". 이주를 고르면 필요한 쪽만 `moveResidence`·`moveLocation('orario','relocation')` 으로 옮긴다 | B2 (가) |
| `script.js` `renderFollowup` | `relocate` 는 머묾 고정 처리보다 먼저 분기한다. 자동 진행이면 **R2-relocate** 콜백 1개만 예약하고, 콜백은 버튼 수 기준 1:1 무작위로 고른다(`Math.random` 1회). 수동 진행은 난수 0 | B1 (가), §8.5.4 |
| `script.js` `endLife`·`startLife` | 실제 종료 경로(가드 통과 뒤)와 새 생애 시작에서 `pendingRelocationOffer`·`dungeonAccess` 를 `null` 로 만든다 | §8.5.3 r3.13 |
| `script.js` | `RBX_VALUE_FIELDS` 에 `pendingRelocationOffer`·`dungeonAccess` 추가. 거주·위치 이력은 N2 의 RB-1 원자 롤백(own 모드)이 이미 덮는다 | §8.5.6 |

### 1.2 시험 하네스(의도적 시험 변경은 각 줄에 원래 단언을 주석으로 남김)

| 파일 | 변경 |
|---|---|
| `tests/lib/driver_core.js` | `relocate` 후속 선택이면 stay 고정보다 먼저 `driverChooseRelocate` 로 간다. **HARNESS-relocate**: 두 표식 버튼 중 무작위 1개(`Math.random` 1회). 그 밖의 종류는 stay 고정·난수 0 그대로 |
| `test_runner.js` | P4 집계·검사 `p4Relocate`(표시·선택·경로·파밀리아·이동량, 제안·접근 상태의 생애 끝 잔존, 비위치 상태 불변, 머묾 무변화, 이주 이력 증가량). 이동 이유 검사에 `relocation`(목적지 orario)만 추가 허용 |
| `tests/lib/rng_sites.js` | 지점 표에 `renderFollowup`(R2-relocate)·`driverChooseRelocate`(HARNESS-relocate) 추가 |
| `tests/engine_p2_test.js` | EN-12 형식 표에 `dungeonReach`(=== true), EN-12c 를 P4 계약으로 |
| `tests/region_p3_test.js` | HOLD-1(conscript 규칙 D), HOLD-2 에서 healer_shift 를 빼고 HS-1 단언 |
| `tests/n2_link_test.js` | S1 비교에서 P4 새 필드 2개를 빼고 S1-P4 로 따로 검사 |
| `tests/f1_joinhard_test.js` | 합격 경로(조건부 relocate), F1-T14e(등록 종류 2개) |
| `tests/rng_sites_test.js` | 줄 번호 이동 + 새 지점 2곳(지점 합계 31 → 33) |
| `tests/rng_timer_test.js` | TM-2b 어댑터를 현재 러너의 이동 이유 줄로, 출력 비교에서 `p4Relocate:` 한 줄만 제외 |
| `tests/p1_verify.sh` | `10_p4_test` 항목 추가(기존 항목 불변) |
| `tests/p4_test.js`(신규) | FA-T1·FA-T2·FA2-T0~T9·FA2-RB·FA2-D1a/D1b/D2/D2b/D3/D4/D5·FA2-C·FA-T3·DR-T1~T4·DR-T6·DR-T7·HS-1·RD-1·RD-2 |

## 2. 시험 결과

### 2.1 단위 시험(Mock DOM)

| 시험 | 결과 | 로그 |
|---|---|---|
| `tests/p4_test.js` | PASS 167/167 | `logs/v178_p4/unit/p4_test.log` |
| engine_p2 · region_p3 · eventcond · devabil · n2_rollback · n2_link(406a03b 사본) · rng_sites | 639/639 · 167/167 · 56/56 · 133/133 · 191/191 · 75/75 · 139/139 | `logs/v178_p4/unit/` |
| Chromium: n2_browser_rollback · n2_array_realm(file://) | 23/23 · 12/12 | `logs/v178_p4/unit/` |

- p4_test 의 실제 경로와 합성의 구분
  - 실제 경로: FA2-T8 P1(실제 join 사건)·P3(실제 god_gone 재수여), FA2-T5b(실제 join_hard 거절).
  - 합성: 위 경로들의 강제 난수, 위치·거주 주입, `pickFamiliaCandidate` 대체(합성 사건 `__p4join`), 비밀 접근 객체·`S.world`(미구현 모델을 시험에서만 주입), 예외 주입(FA2-RB), 변이 사본(DR-T4·FA2-D5).

### 2.2 p1_verify 전체(`logs/v178_p4/p1_verify/`, 2026-11-27T09:28:51Z 종료)

- 등록 항목 33개 중 **27개 통과**. 실패 6개는 모두 기준선 대비 결과 비교다(아래). 기록 실패 0.
- 통과에는 다음이 들어 있다.
  - 01 문법
  - 02·03 두 시드 × 3,000생애
  - 04
  - 07 verify_run 자체 시험
  - 10_* 회귀 11종(10_p4_test 포함)
  - 11~14 변이 시험
  - 20·21 Chromium file:// · inline
  - 30·31 RNG 지점·타이머
  - 40~42 Node·file·inline 3환경 10구성 대조

| 항목 | 결과 | 사유 |
|---|---|---|
| 05_f1 / 05m / 05p 바이트 비교 | 실패(의도) | 결과가 바뀌는 변경이므로 기준 로그와 다르다. 기준선은 승인 전이라 갱신하지 않았다 |
| 06 / 06m / 06p digest10 엄격 대조 | 실패(의도) | 10구성 모두 `exit=0 · completed=3000 · inv=true · exc=0`. lifeDigest·rngCallDigest 만 다르다 |

두 시드 × 3,000생애(02·03):

| 시드 | completed | 불변식 | lifeDigest | 이주 선택 표시 / 이주 / 머묾 | 경로 |
|---|---|---|---|---|---|
| 20261104 | 3000 | true(실패 0) | 2307408390 | 628 / 304 / 324 | initial_join 619 · god_return_regrant 9 |
| 777 | 3000 | true(실패 0) | 2620807690 | 645 / 329 / 316 | initial_join 634 · god_return_regrant 11 |

Node·Chromium 일치(40~42): 10구성 모두 Node = file:// = inline(같은 lifeDigest·rngCallDigest·RNG 순서열). **UNKNOWN 지점 0**.
- 이 대조의 Chromium 쪽은 실제 브라우저(headless Chromium)에서 실행했다. 20·21 은 file:// 과 inline 을 따로 기록했다.

### 2.3 48,000생애 전후 비교(4시드 × 4모드 × 3,000, `logs/v178_p4/48k/cmp48k_p4.md`)

- A = 819f8e8. A 의 32개 산출물은 **P5 기준선 48k 산출물과 32/32 SHA 동일**이다(재현 확인).
- B = 이 작업 트리.
- 지역별 표는 생애별 기록에 출생지·끝 위치·모험자 여부 필드만 더한 **분석 사본**으로 냈다. 분석 사본의 출력 로그는 일반 실행과 16/16 바이트 동일이다(A·B 모두).

| 지표 | A | B |
|---|---|---|
| 16구성 exit 0 / 불변식 통과 / 런타임 예외 | 16 / 16 / 0 | 16 / 16 / 0 |
| 던전 사건 1건 이상 생애 | 10,246 (21.35%) | 6,974 (14.53%) |
| 던전 사건 총 발생 | 58,022 | 41,779 (−28.0%) |
| 이주 선택 표시 / 이주 / 머묾 | — | 9,711 / 4,910 / 4,801 |
| relocation_offer_conflict · dungeon_access_invalid · p4 검사 실패 | — | 0 · 0 · 0 |
| 생애 끝 거주지 orario | 10,429 | 13,336 |
| Lv.6 도달 생애 | 452 | 317 |
| hero_sacrifice 발생 / 승리 | 136 / 19 | 253 / 37 |
| healer_shift 발생 | 4,810 | 2,680 |
| conscript 발생 | 9,210 | 8,639 |
| 사망 원인 event · hp · natural | 1,984 · 3,645 · 42,371 | 1,836 · 3,481 · 42,683 |

모험자 직업 경험 생애의 지역별(§8.0.1 요구: "모험자 + 위치 ≠ orario" 따로 보고):

| 구분 | A 생애 | A 던전 사건/생애 | B 생애 | B 던전 사건/생애 | B 이주 생애 |
|---|---|---|---|---|---|
| 오라리오 출생 · 끝 위치 orario | 1,838 | 7.20 | 1,939 | 7.46 | 0 |
| 오라리오 출생 · 끝 위치 비오라리오(은퇴 이주 등) | 699 | 9.24 | 728 | 9.38 | 0 |
| 비오라리오 출생 · 끝 위치 orario | 127 | 8.21 | 1,534 | 7.35 | 1,442 |
| 비오라리오 출생 · 끝 위치 비오라리오 | 4,075 | 7.75 | 2,818 | **2.12** | 618 |

- 비오라리오 출생 모험자가 머묾을 고르면 던전 사건 후보가 0이 된다(설계 §8.3의 막힘이 실제로 생긴다).
  - 마지막 행 B 2,818생애 가운데 던전 사건이 1건 이상인 생애는 664뿐이다.
  - 그 대부분은 이주한 뒤 은퇴 등으로 다시 오라리오를 떠난 생애(618)다.
- ~~모험자가 아닌 생애에서 나온 던전 사건은 A·B 모두 `supporter_route`(팔나 서포터, 기존 승인 설계)뿐이다. 비모험자 노출 금지 불변식은 유지된다.~~ **정정(r1, 1차 QA R2):** 이 문장은 틀렸다. 집계 목록이 `EVENT_AREA` 'dungeon' 17건뿐이라 `free_supporter_route`(분류 'supporter_accompany', 팔나 없는 서포터의 던전 동행)를 빠뜨렸고, `supporter_route` 를 승인된 예외로 쓴 근거도 확인하지 않았다. 확인 결과는 `QA_RESPONSE_P4_GAINV2_r1.md` §2.
- 결과 변화의 해석(판정은 사용자 몫)
  - 던전 사건 −28%, Lv.6 도달 −30%는 O1 제한(F-A)의 직접 효과다.
  - 자동 진행 1:1 가중치(B1 (가))는 "초기 제안값"이다.
  - 균형 조정이 필요하면 가중치와 메렌 비밀 통로 구현이 선택지다(둘 다 별도 승인).

## 3. 불변식 점검

| 불변식 | 확인 |
|---|---|
| 은퇴·도피·부상·흑룡 격퇴·영웅 달성은 사망 아님 | 변경 없음. hero_sacrifice 승리 37건은 생애가 계속된다(사망 원인 집계에 영웅 항목 없음 — 기존 판정 그대로) |
| 파밀리아·직업·가족·연애·팔나 독립 | 이주 선택이 origin·직업·소속·팔나·고용처·가족·연애를 바꾸지 않는다: FA2-T7, 러너 `non_location_state_changed` 48k 0건 |
| 실제/육체 나이 · 종족 수명 | 변경 없음 |
| 팔나·능력치 5종·레벨업 공식 | 변경 없음 |
| 비모험자 던전 노출 금지 | **통과로 처리하지 않음(정정 r1).** P4 는 이 불변식에 걸리는 사건을 바꾸지 않았다. 다만 실제 생애에서 `supporter_route`(팔나·소속 서포터, 예외 승인 기록 미확인)와 `free_supporter_route`(팔나 없음, 기록상 불변식과 충돌하는 기존 예외, G1 미결정)가 발생한다 — `QA_RESPONSE_P4_GAINV2_r1.md` §2 |
| 근거 등급 | 17건 O1·HS-1·규칙 D·자동 진행 1:1 = 게임 고유 규칙(사용자 결정). 원작 확정으로 표기하지 않음 |

## 4. 원작 조사가 필요한 사항(사용자 지적 2026-11-27, 미확인 — 설계 근거로 쓰지 않음)

| # | 질문 | 상태 |
|---|---|---|
| RK-1 | 라키아 출생 시민이 오라리오로 이주해 파밀리아에 입단하는 것이 원작에서 사실상 탈주(예: 벨프 크로조처럼 중간 이탈)로 취급되는가 | 미확인 |
| RK-2 | 라키아 징집이 몇 세에 이루어지는가 | 미확인 |
| RK-3 | 라키아 병사의 팔나를 아레스만 주는가, 휘하 신들도 주는가(신정 체제 내 종속 파밀리아 구조) | 미확인 |

- 지금 구현은 "라키아 거주가 아니면 징집 대상 아님"(규칙 D)까지만 한다.
- 이주를 탈주로 보는 규칙, 징집 나이, 종속 파밀리아(DR-2 A·C)는 조사와 승인 뒤의 별도 설계다.

## 5. 미실행·한계

| 항목 | 상태 |
|---|---|
| equivalence_2i | 미실행(v1.7.7-r1 폴더가 필요하고 저장소·태그에 없음) |
| DR-T5 의 EN-12 합성 미지 키 | engine_p2 EN-12a 로 정적 검사(별도 합성 변이는 미작성) |
| FA2-RB 의 RB-1~RB-8·RB-S0 개별 시험 | N2 의 n2_rollback_test(191/191)로 거주·위치 이력 own 복원을 확인. P4 전용은 FA2-RB 1건 |
| Windows·다른 Node 판 재현 | 미실행. Codex 최종 QA 미요청 |
| 메렌 비밀 통로 행동(`S.dungeonAccess` 생성) | 미구현(설계상 별도 단계) |
