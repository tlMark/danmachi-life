# 1차 QA 보완 응답 r1 — P4 / GA-INV-2 (2026-11-27)

- 대상 QA: "P4 / GA-INV-2 1차 QA 결과 및 보완 요청"
  - P4 게임 코드: 1차 통과
  - GA-INV-2 측정 사본: 수정 후 재검수
  - 전체: 최종 승인 보류
- 범위: 쟁점(R1·R2·§3 검사기)만 국소적으로 확인했다. 게임 코드(`events.js`·`script.js`·`test_runner.js`), 측정 모듈 `measure/measure_module.js`(SHA-256 `bc0f5464…0572f`, 변경 없음), P4 48k 결과는 그대로다.
- 하지 않은 것
  - 롤백, 기준선 갱신, Git 커밋·푸시·병합
  - 1:1 비율 변경, 메렌 통로 구현, 라키아 규칙 추가
  - GA-INV-2f·GA-NI-1/2 상태 변경, Codex 요청
- 바꾼 파일
  - `measure/ast_check.js`: P6-parts 추가
  - `measure/tests/ast_neg_test.js`: N51~N56 추가
  - `measure/tests/meas_fault_test.js`: R1 시험 추가
  - 보고서 정정: `DEV_REPORT_v1.7.8-p4.md`, `DEV_REPORT_GA-INV-2_impl1.md`, `measure/README.md`
  - 이 문서
- 상태 표기: 전부 작성자 실행이다(독립 검수 아님).

## 1. R1 — C5a 기준선 정정의 검증 범위

### 1.1 실행 결과(`logs/ga_inv2_impl1/r1/meas_fault_test.log`, 합성 고장 주입)

| ID | 조건(합성) | 관측 | 해석 |
|---|---|---|---|
| C5a-pre-newListener | `-r` 사전 적재로 init **이전에** `process.on('newListener', preHook)` | state active, 보고 **valid**. 종료 시점 리스너 수 newListener 3·removeListener 2(깨끗한 Node: 2·2) | **검출하지 못함** |
| C5a-pre-removeListener | 같은 방식으로 removeListener 에 선점 | active, **valid**(2·3) | **검출하지 못함** |
| C5a-pre-runner | 측정 러너 실행 전 사전 적재 선점 | active, **valid** | **검출하지 못함**(러너 경로도 같음) |
| C5a-post(대조) | init **이후** 리스너 추가 | `invalid:hook_present` | 검출함 |
| C5a-design0 | 합성 사본에서 C5a 를 설계 원안("두 이벤트 리스너 수 0")으로 되돌림 | 선점이 없어도 `invalid:hook_present`. 선점이 있어도 같음 | 원안은 이 Node 판에서 항상 무효(측정 불가) |

- 고장 주입 전체는 PASS 41/41(C5a-post 추가)이다.
- LIMIT 4건은 위의 "미검출" 관측 기록이다. PASS 집계에 넣지 않았다. 관측이 기록과 다르면 FAIL 로 세도록 했다.

### 1.2 이유와 보안상 의미

- 현재 구현은 init 시점의 두 리스너 목록을 기준선(`HOOK_NEW0`·`HOOK_RM0`)으로 저장하고, 이후 목록이 그 기준선과 같은지만 본다. 그래서 init 전에 이미 등록된 리스너는 정상으로 취급된다.
- 의미: **현재 C5a 는 "init 이전 환경은 신뢰한다"는 가정 위에서만 성립한다.**
  - 측정 모듈보다 먼저 실행된 코드(`-r` 사전 적재, 러너가 그보다 앞서 부른 모듈, 실행 환경 변수로 주입된 코드 등)가 `newListener` 로 이후의 리스너 등록을 가로채거나 바꿔도 C5a 는 무효를 내지 않는다.
  - C2·C3·C5c 등 다른 조건이 일부를 잡을 수는 있지만, 그 범위는 이번에 따로 검증하지 않았다.
- **설계 원안과 동등하지 않다.** 앞선 보고서 D1 의 "C5a 고장 주입은 여전히 검출된다"는 init 이후 추가에만 맞는 말이었다. 해당 문장을 정정했다.

### 1.3 원안(0개)과 현재(기준선 동일)의 차이

| 경우 | 원안: 리스너 수 0 | 현재: init 기준선과 동일 |
|---|---|---|
| 깨끗한 Node v22.23.4(내장 리스너 2·2) | 항상 무효(측정 불가) | 유효 |
| init 이전 외부 선점 | 무효(다만 깨끗한 경우와 구별 불가) | **유효(미검출)** |
| init 이후 외부 추가 | 무효 | 무효(검출) |
| init 이후 리스너 교체·제거 | 무효(수가 0 이 아니게 되면) | 무효(동일성 비교) |

### 1.4 사용자 결정이 필요한 것(§5 D-1)

이 판에서는 현재 구현을 유지하고, 검증 범위가 "init 이전 환경 신뢰"로 줄었음을 명시만 했다. 선택지는 §5 에 적었다.

## 2. R2 — supporter_route 와 비모험자 던전 노출 불변식

### 2.1 실제 코드 조건(`events.js`, 정적 확인)

| 사건 | 분류(`EVENT_AREA`) | 사건 조건 | 비고 |
|---|---|---|---|
| `supporter_route`(313행) | `dungeon` | `dungeonReach:true, age:[16,60], job:['supporter'], flags:['falna'], hasFamilia:true, familiaRole:['member']` | 팔나·소속(member)·서포터 직업 필요. `canEnterDungeon` 없음. P4 로 `dungeonReach` 가 붙었다 |
| `free_supporter_route`(319행) | `supporter_accompany` | `age:[16,50], job:['supporter'], noFlags:['falna'], hasFamilia:false, max:{valis:3000}`, `once` | **팔나 없는** 무소속 서포터의 던전 동행. 선택지 [2] 실패 시 `die:true`. `dungeonReach` 없음(17건 밖) |

### 2.2 실제 생애에서의 발생(48k 분석 사본, 실제 실행)

| 지표 | A(819f8e8) | B(P4) |
|---|---|---|
| `supporter_route` 가 나온 생애 중 모험자 직업 경험이 없는 생애 | 3,681 | 2,116 |
| `supporter_route` 가 나온 생애 중 팔나 이력이 없는 생애 | 0 | 0 |
| `free_supporter_route` 가 나온 생애 | 4,517 | 4,436 |
| `free_supporter_route` 중층 동행 실패 사망 | 869 | 814 |

### 2.3 승인 근거 확인 결과

| 항목 | 찾은 기록 | 판단 |
|---|---|---|
| `supporter_route` | v1.7.3 재작업 보고서 §1 #7(QA_AUDIT_v1.7.2 P1 요청으로 "서포터 분리": `job supporter + flags falna + hasFamilia`, dungeon 분류)<br>`EVENT_AREA` 주석(dungeon 은 "cond.job 에 adventurer 또는 supporter")<br>REVIEW_v27 §4.3 "서포터 던전 사건은 `supporter_route`(팔나 + 소속 member)만 허용한다"(설계 문서의 유지 항목) | QA 요청으로 구현된 기존 설계이고 설계 문서에 허용으로 적혀 있다. 그러나 **사용자가 "비모험자 던전 노출 금지"의 예외로 승인했다는 결정 기록(DECISION_LOG v21 포함)은 찾지 못했다.** 불변식 문구("비모험자")가 팔나 서포터를 포함하는지도 정해진 기록이 없다 |
| `free_supporter_route` | DECISION_SHEET_v14 §1: "명시적으로 분류된 기존 예외"이지만 "현재 불변식과 충돌". "D-FSR §1 은 현행 사건을 예외로 유지하지 않는다고 결정"<br>REVIEW_v27: "현재 불변식과 충돌하는 기존 예외, 재설계(G1) 대기"<br>DECISION_LOG v21: G1 W5 "→ G 묶음", 미결정 | **승인된 예외가 아니다.** 기록상 불변식과 충돌하는 미해결 사건이다 |

### 2.4 정정

- 앞선 P4 보고서의 문장은 틀렸다: "비모험자 던전 사건은 `supporter_route` 뿐, 불변식 유지".
  - 집계 목록이 dungeon 17건뿐이라 `free_supporter_route` 를 빠뜨렸다.
  - `supporter_route` 를 근거 확인 없이 "승인 설계"로 적었다.
  - 해당 줄을 취소선과 정정 주석으로 고쳤다(삭제하지 않음).
- 불변식 판정: **통과로 처리하지 않는다.**
  - P4 는 두 사건의 조건을 바꾸지 않았다. `supporter_route` 에 설계대로 `dungeonReach` 만 더했다.
  - 이 충돌은 P4 이전부터 있던 상태다(A 에서도 발생).
- 사건 삭제·조건 변경은 하지 않았다. 결정 사항은 §5 D-2·D-3.

## 3. 검사기 보강 — parts 의미 대조(정적 검사)

- 추가 규칙 P6-parts(`measure/ast_check.js`)
  - `parts` 가 있는 항목마다 각 위치의 실제 문맥을 AST 로 계산한다.
  - 문맥은 init 의 바깥 try 블록 안에서 그 위치 앞의 마지막 `stage = N;` 으로 정한 `stageN`, 또는 catch 절 안이면 `catch` 다.
  - 그 문맥을 검사기에 고정한 의미표 `PARTS_SEMANTICS` 와 원문 순서대로 대조한다.
    - `RD_gopd(EE,name)`: stage1→T7 · stage2→T10 · stage3→T10 · catch→T9
    - `EE[name]`: stage2→T8 · catch→T9
  - 의미표가 있는 키에 parts 가 없을 때, 의미표가 없는 키에 parts 가 있을 때, 의미표 밖 문맥일 때도 실패한다.
- 결과(`logs/ga_inv2_impl1/r1/ast_check.log`): PASS. 6개 위치 모두 OK(L127 stage1=T7, L137 stage2=T10, L143 stage3=T10, L152 catch=T9, L136 stage2=T8, L153 catch=T9).
  - 현재 배정은 수작업 대조와 같다.
- ⑫-neg(`logs/ga_inv2_impl1/r1/ast_neg_test.log`): **PASS 57/57**(기존 51 + 신규 6)

| ID | 변이 | 결과 |
|---|---|---|
| N51 | parts 순서를 T7,T9,T10,T10 으로(표 변이) | P6-parts 실패 검출 |
| N52 | EE[name] 의 T8·T9 뒤바꿈(표 변이) | 검출 |
| N53 | 의미표 있는 키의 parts 삭제(표 변이) | 검출 |
| N54 | 의미표 없는 키에 parts 추가(표 변이) | 검출 |
| N55 | `stage = 3;` → `stage = 1;`(개수 같고 문맥만 바뀜) | 검출 |
| N56 | 복원 루프의 RD_gopd 를 3단계로 옮김(개수 같음) | P6-parts 포함 검출 |

- 한계: 의미표 자체는 사람이 정한 대응(검사기 판본과 함께 고정)이다. 문맥 판정은 init 의 `stage` 표지와 catch 구조에 기댄다. 다른 함수의 parts 가 생기면 의미표와 문맥 규칙을 새로 정해야 한다(없으면 실패).

## 4. 결과 구분(요청 §5)

| 구분 | 항목 |
|---|---|
| 1. 실제 실행한 시험 | 48k 분석 사본 재집계(supporter_route·free_supporter_route 발생·사망, §2.2 — 기존 산출물 재분석이며 새 시뮬레이션 없음). 깨끗한 Node 의 리스너 수(2·2) 관측 |
| 2. 합성 고장 주입 시험 | C5a-pre-newListener · C5a-pre-removeListener · C5a-pre-runner · C5a-design0(LIMIT 4건, 미검출·측정 불가 관측) · C5a-post(PASS). 기존 40건 포함 PASS 41/41 |
| 3. 정적 검사 | ⑫ PASS(192키·220위치, P6-parts 6위치 OK) · ⑫-neg PASS 57/57 · `events.js` 두 사건 조건 확인 · 결정 기록 검색(§2.3) |
| 4. 미실행 시험 | init 이전 선점 상황에서 C2·C3·C5c 가 대신 잡는 범위 · 선점 리스너가 실제로 등록을 가로채는 공격의 재현 · 관문 ON 측정 · C4a~C4e 개별 고장 주입 · Windows 등 다른 환경 · Codex 최종 QA(요청 금지에 따라 미요청) |
| 5. 사용자 결정이 필요한 설계 변경 | 아래 §5 |

## 5. 사용자 결정 요청

| # | 쟁점 | 선택지(제안) | 비고 |
|---|---|---|---|
| D-1 | C5a 검증 범위 | (가) 현재 구현 유지 + "init 이전 환경 신뢰"를 가정 목록(가정 E 옆)에 명시<br>(나) 기준선을 같은 Node 판의 깨끗한 자식 프로세스와 비교(리스너 수·함수 이름. 이름은 흉내 낼 수 있어 단순 선점만 잡는 보조 검사)<br>(다) 설계 원안(0개) 유지 — 이 Node 판에서는 측정이 항상 무효 | 권장은 (가)+(나) 병행. (나)는 측정 모듈 변경이라 승인 뒤 구현 |
| D-2 | "비모험자 던전 노출 금지"에 팔나·소속 서포터(`supporter_route`)가 포함되는가 | (가) 팔나를 받은 소속 서포터는 예외(현행 설계를 승인으로 기록)<br>(나) 예외 아님 → 사건 재설계 필요 | 현재 결정 기록 없음 |
| D-3 | `free_supporter_route`(팔나 없는 던전 동행, 48k 에서 814 사망) | 기존 G1(W5 지상 일자리 재설계) 결정 진행 | DECISION_SHEET_v14 에 이미 "예외로 유지하지 않음" 방향 기록. G 묶음 미결정 |
