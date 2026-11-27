# 1차 QA 재검수 후속 r2 — D-1 (가)+(나) 구현 (2026-11-27)

- 근거: 1차 QA 재검수(P4 1차 통과 유지, P6-parts 통과, GA-INV-2 사용자 결정 전 최종 통과 보류)
  - 그 안에 사용자 결정: "D-1은 가+나로 승인합니다"
  - 진행 지시: "진행하쇼!"
- 범위: D-1 승인 범위만 다뤘다(측정 모듈·측정 러너·측정 시험·문서).
- 바꾸지 않은 것
  - 게임 코드(`events.js`·`script.js`·`test_runner.js`), P4 48k 결과, 기준선
  - D-2·D-3(결정 전이라 통과로 표시하지 않음, 사건 조건 불변)
  - GA-INV-2f·GA-NI-1/2 상태, Codex 요청
- Git: 사용자가 허용한 작업 브랜치 커밋·푸시만 한다(main 병합·PR 없음). QA 지시의 "커밋·푸시 금지"보다 사용자 결정을 우선했다.
- 상태 표기: 작성자 실행(독립 검수 아님).

## 1. (가)+(나)를 고른 이유(사용자 질문에 대한 답)

| 안 | 혼자 썼을 때의 문제 |
|---|---|
| (가) 가정 명시만 | 사전 적재나 먼저 실행된 모듈이 리스너를 하나 더 붙이는 흔한 경우에도 보고가 조용히 `valid` 로 나온다 |
| (나) 깨끗한 Node 대조만 | 이름·개수는 흉내 낼 수 있다(위장 선점 미검출). 이것만으로 "안전"을 주장하면 과장이다 |
| (다) 원안(0개) | Node v22.23.4 에서는 깨끗한 상태도 항상 무효라 측정할 수 없다 |

- (나)는 흔한 선점을 실제로 잡는다. 앞선 LIMIT 4건 중 선점 3건이 이제 "검출·거부"로 바뀌었다.
- (가)는 남는 위장 사례를 가정으로 정직하게 기록한다.
- 둘을 합치면 과장 없이 탐지 범위를 넓힐 수 있다.

## 2. 변경(`logs/ga_inv2_impl1/r2/*.diff`)

| 파일 | 변경 |
|---|---|
| `measure/measure_runner.js` | `cleanHookReference()` 를 추가했다. 같은 `process.execPath` 로 자식 프로세스를 띄워 리스너 이름 목록을 얻는다. 자식은 사전 적재 인자(`execArgv`)를 받지 않고, `NODE_OPTIONS` 는 지운다. 실패하면 모듈을 불러오지 않고 `inactive_unknown(hook_reference_failed)` → vm 생성 전 거부. `MEAS.init(HOOK_REF)` 로 넘긴다 |
| `measure/measure_module.js` | `init(ref)`: 읽기 API 확보 직후, 1단계(설치) 전에 init 시점 `newListener`·`removeListener` 리스너 이름 목록을 `ref` 와 대조한다. 다르거나 `ref` 형식이 틀리면 `inactive_unknown(hook_baseline_mismatch)`(EE 쓰기 0). 리스너 이름은 서술자로만 읽는다(getter 미실행). `hookNamesMatch` 보조 함수를 추가했다. 머리말에 가정(가) 명시 |
| `measure/ast_sites.js` | 새 위치 T139~T146(8키). 기존 T1~T138 번호 그대로, 합계 200키·229위치 |
| `measure/tests/meas_fault_test.js` | 하네스가 init 에 기준을 넘긴다. R1 선점 사례를 검출 기대로 바꿨다. 새 사례를 추가했다 |
| `measure/README.md` | D1 갱신, "가정" 절 추가(가정 P: init 이전 환경의 위장 선점 없음) |

## 3. 결과(`logs/ga_inv2_impl1/r2/`)

| 구분 | 항목 | 결과 |
|---|---|---|
| 정적 검사 | ⑫ | PASS(200키·229위치, P6-parts 6곳 OK) |
| 정적 검사 | ⑫-neg | PASS 57/57 |
| 합성 고장 주입 | 전체 | PASS 51/51 + LIMIT 2 |
| 합성 고장 주입 | 선점 검출(신규 PASS) | C5a-pre-newListener · C5a-pre-removeListener → `hook_baseline_mismatch`, 설치 없음<br>C5a-pre-runner(`-r`) · C5a-pre-NODE_OPTIONS → vm 생성 전 거부 |
| 합성 고장 주입 | 기준 형식(신규 PASS) | init 기준 미전달 · null · 이름 수 다름 · 이름 다름 · 형식 다름 → 모두 `hook_baseline_mismatch` |
| 합성 고장 주입 | 기준 확보 실패(신규 PASS) | 합성 사본에서 `cleanHookReference` 가 null → `hook_reference_failed`, 모듈 미적재, 거부 |
| 합성 고장 주입 | 대조(유지 PASS) | C5a-post(init 이후 추가 → `invalid:hook_present`) |
| 합성 고장 주입 | **LIMIT** C5a-disguise | 내장 익명 리스너를 같은 이름(익명)의 대리 함수로 바꿔치기 → 개수·이름 같음 → **미검출**(보고 valid). 가정 P 의 범위 |
| 합성 고장 주입 | **LIMIT** C5a-design0 | 원안(0개)은 깨끗한 상태도 `invalid:hook_present`. 선점이 있으면 (나) 대조가 init 에서 먼저 거부 |
| 실제 실행 | 비간섭 3000생애 × 2시드 | PASS. 표준 출력·생애별 기록·RNG 집계가 원본 러너와 바이트 동일(해시는 r1 과 같음). 측정 보고 valid |
| 미실행 | — | Windows·다른 Node 판에서 기준 자식 프로세스 방식이 같은 결과를 내는지, 이름 외 속성(함수 원문 등) 비교, C4 개별 고장 주입, 관문 ON 측정 |

## 4. 남은 사용자 결정

| # | 상태 |
|---|---|
| D-1 | (가)+(나) 승인·구현 완료. 위장 선점(LIMIT C5a-disguise)은 가정 P 로 남는다 |
| D-2 | `supporter_route` 의 불변식 예외 여부 — 미결정. 통과로 표시하지 않는다 |
| D-3 | `free_supporter_route` — 기존 G1 절차에 남김. 미결정 |
