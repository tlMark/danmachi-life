# 검증 보고서 — 다른 Node 판 호환성 (2026-11-28)

- 근거: 사용자 결정 "Node 판 검증 후에 윈도우스 검증도 합시다!"(2026-11-28). 이 보고서는 Node 판 부분이다. Windows 는 별도로 진행한다.
- 대상: main `e9cd6d7`(= G1 기준선 `605fdf4` 의 게임 코드). 기준선 대조 대상은 `logs/baseline_main_605fdf4`.
- 실행: 이 컨테이너(Linux 6.18.44, Ubuntu 24.04.5 LTS, x64).
  - 각 Node 판의 공식 linux-x64 바이너리를 받아, nodejs.org `SHASUMS256.txt` 와 SHA-256 을 대조해 일치를 확인했다(`logs/v178_nodecompat/node_binaries_SHA256.txt`). `SHASUMS256.txt` 자체의 GPG 서명은 확인하지 않았다.
  - `PATH` 맨 앞에 그 판의 node 를 두고 실행했다. 그래서 하위 도구가 부르는 `node` 도 같은 판이다.
- 상태 표기: 작성자 실행. 독립 검수(Codex)는 사용자 결정에 따라 요청하지 않았다.
- 도구: `logs/v178_nodecompat/tools/run_node_compat.sh`(게임 코드 아님)

## 1. 결과

| 검사 | v20.20.2 | v22.23.4(기존 기준) | v24.22.3 | v26.13.1 |
|---|---|---|---|---|
| A 두 시드 × 3000생애 출력 — G1 기준선과 바이트 비교 | 동일 · 동일 | 동일(기준 생성 판) | 동일 · 동일 | 동일 · 동일 |
| A 10구성 digest 엄격 대조(G1 기준선) | 10/10 동일 | 10/10(06g) | 10/10 동일 | 10/10 동일 |
| B 단위 시험 18종(Mock DOM) | 전부 exit 0 | 전부 exit 0(p1_verify) | 전부 exit 0 | 전부 exit 0 |
| C Chromium file:// · inline(24생애) | exit 0 · 0 | exit 0 · 0 | exit 0 · 0 | exit 0 · 0 |
| D 측정 사본 ⑫ · ⑫-neg | 통과 · 57/57 | 통과 · 57/57 | 통과 · 57/57 | 통과 · 57/57 |
| D 측정 사본 고장 주입 | 51/51 | 51/51 | 51/51 | 1차 50/51 → 시험 수정 뒤 51/51(§2) |
| D 측정 사본 비간섭 3000 × 2 | PASS | PASS | PASS | PASS |

- 결론
  - **게임 결과(실제 생애)는 네 Node 판에서 바이트 단위로 같다.**
  - 단위 시험·Chromium·측정 사본 시험도 네 판에서 통과한다(v26 은 §2 의 시험 수정 뒤).
- C 의 Chromium 은 같은 Playwright 1.63.0·Chromium 153.0.8010.12 다. 바뀐 것은 Playwright 를 구동하는 Node 판뿐이다.

## 2. v26.13.1 에서 발견한 것 — Node 내장 리스너 구성 차이

| Node 판 | `newListener` 내장 리스너 이름 | `removeListener` |
|---|---|---|
| v20.20.2 · v22.23.4 · v24.22.3 | `['', 'startListeningIfSignal']` | `['', 'stopListeningIfSignal']` |
| v26.13.1 | `['startListeningIfSignal']` | `['stopListeningIfSignal']` |

- 측정 장치 영향: 없음.
  - D-1 (나)의 기준은 같은 판의 깨끗한 자식 프로세스에서 얻으므로, 판별 차이를 자연히 따라간다.
  - v26 에서도 정상 실행은 `active`·보고 `valid` 이고, 선점은 검출한다.
  - 설계 원안(리스너 0개)은 v26 에서도 무효다(내장 1개).
- 시험 결함과 수정:
  - LIMIT 사례 `C5a-disguise` 는 "첫 번째 내장 리스너는 익명"이라고 가정하고, 대리 함수를 익명으로 만들었다.
  - v26 에서는 첫 번째가 `startListeningIfSignal` 이라 이름이 달라져 검출됐다. 그래서 "미검출 관측"이 어긋나 FAIL 이 났다.
  - 대리 함수가 바꿔치기하는 원래 리스너의 이름을 그대로 갖도록 시험을 고쳤다(`measure/tests/meas_fault_test.js`, 측정 모듈 불변).
  - 수정 뒤 네 판 모두 51/51 이고, 위장 선점은 네 판 모두 똑같이 LIMIT(미검출)이다(`D_meas_fault_r3_after_test_fix.log`).
- 의미: 가정 P1(기준 자식과 측정 프로세스는 같은 실행 조건)이 왜 필요한지 보여 준다. 판이 달라지면 내장 구성도 달라진다.

## 3. 미실행

| 항목 | 상태 |
|---|---|
| Windows | 미실행(다음 단계) |
| macOS, ARM(linux-arm64 등) | 미실행 |
| 다른 판의 RNG 3환경 대조(p1_verify 40~42)·변이 시험(11~14)·48k | 미실행(A 의 digest10 10구성이 결과 동일성을 대신 확인) |
| `SHASUMS256.txt` GPG 서명 확인 | 미실행 |
