# GA-INV-2 측정 사본 (구현 판본 GA-INV-2-impl-1)

- 위임 근거: DECISION_LOG v21(2026-11-27 자율 개발 모드, 첫 위임 범위 "GA-INV-2 측정 장치를 측정 사본에 구현하고 고장 주입 시험").
- 이 폴더는 **측정 전용 사본**이다. 게임 저장소의 실행 파일(루트 `*.js`, `core/`, `test_runner.js`)을 바꾸지 않는다. 기준선·기능 활성화·N2 관문 상태도 바꾸지 않는다(N2 관문 OFF 그대로).
- 기준 코드: 커밋 `f639c05b8865d177f80d5b4fd0af0c778878482d`. `base_f639c05/`의 파일은 그 커밋에서 꺼낸 바이트 동일 사본이다.
- 상태 표기: 이 폴더의 시험 결과는 모두 **작성자 실행**이다. ChatGPT 1차 검수나 Codex 최종 QA가 아니다.

## 파일

| 경로 | 내용 |
|---|---|
| `measure_module.js` | 측정 모듈. 감시 래퍼(9개 이름), init 의 G1·G2′·G3a·G3b·G4, 1~3단계 설치, attempted 복원, provenClean K1′·K2·K3, envCheck C5a·C5b·C5c·C5f, wrapEndLife(C·H·P·F·X·A·E), seal, finishMeasurement(F0~F4), exit 리스너 M |
| `measure_runner.js` | 측정 사본 러너. f639c05 `test_runner.js` 사본에 상태 결정·실행 허용 판단(vm 생성 전)·S1~S5·단일 TEXTS·계측 연결을 더했다. 측정 상태는 표준 오류에만 쓴다 |
| `measure_src/` | 측정 사본 소스 9개. `script.js` 만 다르다(endLife 본문을 endLifeBody(call)로 옮기고 결말 필드만 기록). 나머지 8개는 f639c05 와 바이트 동일 |
| `base_f639c05/` | 원본 소스 9개 + `test_runner.js` + `tests/lib/*`(f639c05 바이트 동일). 비간섭 비교의 원본 러너이자 비계측 실행의 `ORIGINAL_SRC_ROOT` |
| `ast_check.js` | 정적 검사기 ⑫(실행 계약 P1~P8은 파일 머리말) |
| `ast_sites.js` | 허용 사이트 표(T1~T138, 192개 키, 220개 위치, 정확한 정수 횟수) |
| `vendor/acorn-8.15.0/` | 고정 파서(acorn 8.15.0, MIT). `acorn.js` SHA-256 `fdb08546776ec6228b03e8d02b40d4ab3255bae5f401adba7ff5dad927ac5c9c`. npm tarball 무결성 sha512 `NZyJarBfL7nWwIq+FDL6Zp/yHEhePMNnnJ0y3qfieCrmNvYct8uvtiV41UvlSe6apAfk0fY1FbWx+NwfmpvtTg==` 와 대조해 일치 |
| `tests/ast_neg_test.js` | ⑫-neg: 양성 1 + 음성 변이 50 |
| `tests/meas_fault_test.js` | 고장 주입(러너 단계·markerGuard·설치·복원·S1~S4·G1·G4·C5·C1~C4·항등식) |
| `tests/meas_noninterf.js` | 원본 러너와 측정 러너(active)의 표준 출력·생애별 기록·RNG 지점 집계 바이트 비교 |

## 실행

```
node measure/ast_check.js                       # ⑫ 정적 검사(통과 = 종료 코드 0)
node measure/tests/ast_neg_test.js              # ⑫-neg
node measure/tests/meas_fault_test.js <작업 폴더>
node measure/tests/meas_noninterf.js <작업 폴더> 3000 20261104,777
SIM_MEAS_REPORT=<보고 경로> node measure/measure_runner.js   # 계측 실행(기본 3000생애)
```

## 설계(REVIEW v42~v49)와 다른 점 — 구현 중 확인한 사실에 따른 정정

| # | 설계 | 구현 | 근거 |
|---|---|---|---|
| D1 | C5a: `process` 의 `newListener`·`removeListener` 리스너 수가 0 | init 시점 기준선과 두 리스너 목록이 같다(개수·함수 동일성) | Node v22.23.4 는 시작할 때 두 이벤트에 내장 리스너를 2개씩 등록한다(`startListeningIfSignal` 등). 설계 원안대로면 정상 실행도 항상 `invalid:hook_present` 가 된다. **동등하지 않음(r1):** init 이전에 선점된 외부 리스너는 검출하지 못한다(초기화 이전 환경을 신뢰). **r2: 사용자 결정 D-1 = (가)+(나)(2026-11-27).** (가) 아래 "가정" 절에 명시. (나) 러너가 깨끗한 자식 프로세스(같은 실행 파일, NODE_OPTIONS·사전 적재 인자 제거)에서 얻은 리스너 이름 목록과 init 시점 목록을 대조해, 다르면 `inactive_unknown(hook_baseline_mismatch)`(기준을 못 얻으면 `hook_reference_failed`)로 거부. 같은 개수·이름으로 위장한 선점은 여전히 잡지 못함(LIMIT C5a-disguise) |
| D2 | T14 `PROC.on('exit', M)` | `RD_apply(WRAPPERS.on, PROC, ['exit', M])` | v49 R5: process 속성 직접 읽기를 없앤다. C5b(사슬 가림 없음)·C5c(EE.on === WRAPPERS.on)가 참이면 `PROC.on` 이 가리키는 함수와 같다 |
| D3 | `captureReadApis`·`restoreOne` 보조 함수 | init 안에 직접 둔다(보조 함수 없음). `sameFns` 보조 함수를 새로 둔다 | R4: 호출 지점을 줄이고 표에 모두 등록 |
| D4 | C5a 용 `RD_count` 호출 | 쓰지 않음. `RD_count` 는 C5f(읽기 API 무결성) 비교에만 쓴다 | D1 |
| D5 | 25n11 "동결된 EE" | `EE.on` 만 쓰기 불가로 만든다(스트림 내장 모듈을 먼저 적재) | Node 는 `EventEmitter.prototype` 전체를 동결하면 내부 스트림 초기화에서 스스로 멈춘다(시험 작성 중 확인). 측정 모듈이 지나는 경로(첫 대입 실패 → 복원 쓰기 없음)는 같다 |
| D6 | 허용 사이트 T1~T19 | T1~T19 의 뜻은 유지하고 v49 표에 없던 위치를 T20~T138 로 등록. r2 에서 D-1 (나) 위치를 T139~T146 으로 추가 | R1·R3·R4·R7·R8, D-1 |

## 가정(D-1 (가), 사용자 결정 2026-11-27)

- **가정 E**: 내장 객체(`Reflect`·`Object`·`Symbol`·배열 메서드, Node 내장 모듈 `fs`·`events`)는 원래 구현이다(설계 유지).
- **가정 P(init 이전 환경)**: 측정 모듈의 init 보다 먼저 실행된 코드는 `process` 의 `newListener`·`removeListener` 리스너를 **깨끗한 Node 와 개수·이름이 같은 형태로 위장해** 바꾸지 않았다.
  - (나) 대조는 위장 없는 선점(리스너 추가, 다른 이름으로 교체, `-r`·`NODE_OPTIONS` 사전 적재)을 잡는다.
  - 같은 개수·같은 이름의 대리 함수로 바꿔치기한 경우는 잡지 못한다(실행 확인: LIMIT C5a-disguise).
  - 따라서 측정 보고의 `valid` 는 이 가정 아래에서만 성립한다.
- 기준 자식 프로세스는 러너가 띄운다. 러너 자체와 Node 실행 파일은 신뢰 대상이다(측정 사본의 전제).
