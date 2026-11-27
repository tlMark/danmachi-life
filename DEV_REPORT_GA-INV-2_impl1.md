# 개발 보고서 — GA-INV-2 측정 사본 구현 판본 impl-1 (2026-11-27, 자율 개발 모드 첫 위임 범위)

- 근거: DECISION_LOG v21(2026-11-27 자율 개발 모드). ChatGPT 1차 "REVIEW v49" 반려 R1~R8 은 문서 재작성이 아니라 **구현과 시험**으로 해결하라는 지시에 따랐다.
- 상태 표기: 아래 결과는 전부 **작성자 실행**(Claude Code, 이 컨테이너)이다. ChatGPT 1차 검수·Codex 최종 QA 가 아니다. Codex 는 미요청이다.
- 바꾸지 않은 것
  - 게임 실행 파일(루트 `*.js`·`core/`·`test_runner.js`)에는 측정 코드를 넣지 않았다. 측정 사본은 `measure/` 폴더 안에만 있다.
  - 기준선(`logs/baseline_*`, `logs/v178_f1`)과 기능 활성화(N2 관문 OFF) 그대로다.
  - GA-INV-2f·GA-NI-1·GA-NI-2 의 **승인 상태**는 바꾸지 않았다. 이번 시험은 v21 이 위임한 "측정 사본 구현·고장 주입 시험"의 범위로 실행했다. 시험 이름이 설계의 25n·⑫ 번호를 따르더라도 GA-INV-2f·GA-NI-2 승인으로 기록하지 않는다.
- 실행 환경: Node v22.23.4, Ubuntu 24.04.5 LTS(Linux 6.18.44), vCPU 4. 파서 acorn 8.15.0(고정·벤더링).

## 1. 파일 목록(측정 사본, 신규)

| 파일 | 내용 |
|---|---|
| `measure/measure_module.js` | 측정 모듈(316줄) |
| `measure/measure_runner.js` | 측정 사본 러너(f639c05 `test_runner.js` + 80줄 차이, `logs/ga_inv2_impl1/measure_runner.diff`) |
| `measure/measure_src/*` | 측정 사본 소스 9개. `script.js` 만 다름(`logs/ga_inv2_impl1/measure_src_script.diff`, 27줄), 나머지 8개는 f639c05 와 바이트 동일 |
| `measure/base_f639c05/*` | f639c05 원본 17개(9개 소스·`test_runner.js`·`tests/lib/*` 7개). git 대조 결과 17/17 동일(`provenance_check.txt`) |
| `measure/ast_check.js`, `measure/ast_sites.js` | 정적 검사기 ⑫와 허용 사이트 표 |
| `measure/vendor/acorn-8.15.0/{acorn.js,LICENSE}` | 고정 파서(MIT) |
| `measure/tests/{ast_neg_test,meas_fault_test,meas_noninterf}.js` | ⑫-neg · 고장 주입 · 비간섭 |
| `measure/README.md` | 실행 방법, 설계와 다른 점 D1~D6 |

## 2. R1~R8 처리(코드와 시험으로)

| # | 지적 | 처리 | 증거(시험 ID) |
|---|---|---|---|
| R1 | `isData` 안의 `RD_gopd` 호출이 허용 표에 없음 | 표에 `T28 isData|CallExpression|RD_gopd(d,'value')` ×1 로 등록. `isData` 호출 17곳도 함수·인자 형태별로 모두 등록(markerGuard 3·provenClean 3·init 7·envCheck 4) | ⑫ 통과, N15(내부 호출 형태 변경)·N16(isData 호출 추가) 검출 |
| R2 | markerGuard 에 `'value' in d` 잔존 | 모듈 전체에서 `in` 연산자 0. `pre`·`b`·`mk` 모두 `isData` 판정 뒤에만 `.value` 를 읽는다. 검사기 P7a 가 `.value`·`.writable`·`.configurable` 읽기마다 같은 객체의 `isData` 판정이 앞서는지(`&&` 왼쪽·`!isData ||` 왼쪽·if 참 분기·앞 문장의 조기 반환) 구조로 확인한다. 서술자 판정 예외는 init 의 try 로 `inactive_unknown(guard_exception)` | N11·N12·N13 검출. 25n24g(접근자 표지: getter 미실행) |
| R3 | `RD_gopd` 횟수 재산정 | 모든 호출을 AST 위치로 열거: **함수별 isData 1 · markerGuard 3 · provenClean 3 · init 7 · envCheck 5, 합계 19**. T5 = `RD_gopd(globalThis,INIT_KEY)` 2, markerGuard 의 나머지 1 은 `RD_gopd(v,'brand')`(T33) | N14(markerGuard 에 1회 추가 → T5 횟수 3≠2) |
| R4 | 지역 함수 호출 허용 목록 불일치 | `captureReadApis`·`restoreOne` 은 없앴다(init 에 직접). 실제 지역 함수 호출 31곳(isData 17 · markerGuard 1 · makeWrapper 1 · provenClean 1 · sameFns 3 · envCheck 2 · seal 1 · safeInc 5 · endLifeBody 3 — 자세한 키는 `ast_check.log` ANCHOR 줄)을 위치·횟수·인자 형태(정규화 원문) 그대로 표에 둔다. 표 밖 호출은 P6-unlisted 실패 | N17(seal() 추가)·N50(함수 값 인자) 검출 |
| R5 | `PROC.on` 직접 읽기 | **직접 읽기를 없앴다.** 등록은 `RD_apply(WRAPPERS.on, PROC, ['exit', M])`(T14). process 속성 접근은 파일 전체에서 0이다. 검사기는 `PROC.x`·`process.x` 를 표 밖 위치로 실패시킨다. getter 실행 가능성은 접근 자체가 없어서 생기지 않는다. 같은 함수에 등록되는 근거: C5b(사슬에 가림 없음) + C5c(`EE.on === WRAPPERS.on`) | N18(PROC.on)·N19(process.env) 검출. C5b·C5c 고장 주입 |
| R6 | 검사기 실행 계약 | `ast_check.js` 머리말 P1~P8: 파서 acorn 8.15.0(파일 SHA-256·버전 확인, 다르면 종료 코드 2), ecmaVersion 2022·sourceType script, 전체 노드 일반 순회, 스코프(Program·함수·블록·for·catch, var 끌어올림), 참조→선언 연결, 출처 불명 식별자·전역 이름 가림·민감 이름 안쪽 재선언 실패, 앵커 키(함수·노드 형식·토큰 정규화 원문)와 정확한 횟수 비교, 동적 경로는 판단 없이 실패 | ⑫-neg 50종 전부 검출 |
| R7 | '고정 수' | 표의 모든 항목이 정수 `count` 를 가진다(192키, 위치 합계 220). 누락(P6-missing)·초과·미달(P6-count)·표 밖(P6-unlisted)이 모두 실패. 같은 키가 여러 T 에 걸치면 `parts` 로 원문 순서의 T 번호를 적는다(길이 = count 를 검사) | N20(미달)·N21(초과) 검출 |
| R8 | T1~T18/T19 불일치 | 범위를 **T1~T138** 로 하나로 정했다. T1~T19 는 v49 의 뜻 그대로, T20~T138 은 v49 표에 없던 위치다. 양성 검사는 138개 번호(192키) 전부를 대조하고, 음성 변이는 T5·T6·T10·T11·T14·T17·T18·T19 를 직접 건드린다 | ⑫ 양성 통과, N14·N46·N48·N21·N35·N33·N36·N29 |

## 3. 정적 검사 ⑫ — 실행 결과(`logs/ga_inv2_impl1/ast_check.log`, `ast_check_result.json`)

```
checker: acorn 8.15.0 (sha256 fdb08546776ec6228b03e8d02b40d4ab3255bae5f401adba7ff5dad927ac5c9c) opts {"ecmaVersion":2022,"sourceType":"script","allowHashBang":false,"locations":true,"ranges":true}
RESULT: PASS sites=192 anchorKeys=192 anchorTotal=220 fails=0   exit=0
```

주요 API 의 실제 호출 수(앵커 집계, 정수):

| API | 함수별 | 합계 |
|---|---|---|
| `RD_gopd` | isData 1 · markerGuard 3 · provenClean 3 · init 7 · envCheck 5 | 19 |
| `RD_gpo` | envCheck 1 | 1 |
| `RD_apply` | makeWrapper 2 · init 2 · envCheck 2 · finishMeasurement 2 · M 1 | 9 |
| `isData` | markerGuard 3 · provenClean 3 · init 7 · envCheck 4 | 17 |
| `safeInc` | wrapEndLife 5 | 5 |
| `Object.freeze` | 최상위 4 · init 5 | 9 |
| `Reflect.defineProperty` | markerGuard 1 | 1 |
| `require` | init 1(`'fs'`) + `require('events').EventEmitter.prototype` 1 | 2 |
| EE 쓰기 | init: 설치 `EE[name]=w` 1(T8) · 복원 `EE[name]=ORIG_OF[name]` 1(T9) | 2 |

⑫-neg(`ast_neg_test.log`): **PASS 51/51** — 양성 1(원문 통과) + 음성 50(v49 지정 10종 N01~N10, R1~R8 대응 N11~N36, 그 밖 금지 형태 N37~N50). 각 변이에서 검사기가 실패를 냈다.

## 4. 고장 주입(`logs/ga_inv2_impl1/meas_fault_test.log`): PASS 40/40

모두 **합성**이다. 자식 프로세스의 `-r` 사전 적재로 환경을 바꾸거나, 임시 사본에 변이를 넣었다. vm 생성 여부는 사전 적재 계측(`vm.createContext` 호출 시 표준 오류 표시)으로 판정했다.

| 묶음 | 항목 | 결과 |
|---|---|---|
| 러너 상태·실행 허용 | R0 정상(active·valid) · 25n16 SHA 미정(unavailable, 원본 실행) · 25n22/22b 로드 실패(inactive_unknown·**vm 생성 전 거부**) · 25n21a~c 비정상 init(거부) | 7/7 |
| markerGuard 선점·정의 실패·소유권 | 25n23 같은 형식 선점 · 25n24 값 true · 25n24g 접근자 표지(getter 미실행) · 25n25 globalThis 확장 불가(marker_define_failed) · 25n26 defineProperty 거짓 보고(marker_ownership_unconfirmed) · 25n27 brand 흉내(오추정, 판정 같음) | 6/6, 전부 inactive_unknown·vm 생성 전 거부 |
| 설치·복원 | 25n11(첫 대입 실패 → clean·원본 실행) · K1′(1단계 실패) · T4 읽기 API 접근자 · 25n10a(확인 예외 1회 → clean) · 25n10b(지속 → residual·거부) · 25n12(복원 실패 → residual·거부) · 25n13(복원 값 다름 → residual·거부) | 7/7 |
| 소스 확인 | 25n14a 중복 · 25n14b 순서 · 25n15 키 추가 · S4 SHA 불일치 | 4/4, 전부 vm 생성 전 중단 |
| 단회 호출 | 25n17 재호출 · 25n18 clean 뒤 재호출 · 25n19 두 번째 인스턴스 · G4 WATCH_ON 변이 · G0 참조 확보 실패 | 5/5 |
| 판정(C·항등식) | C0 정상 · C5a 훅 추가 · C5b 가림 · C5c 감시 함수 교체 · C5f 읽기 API 교체 · C3 봉인 뒤 등록 · C2p 읽기만(valid) · C2 래퍼 우회 등록 · ID-A 게임 예외(A=1, valid) · ID-U 결말 없는 반환(invalid:unmarked_return) · ID-E F 뒤 예외(E.F=1, valid) | 11/11 |

## 5. 비간섭 비교(`logs/ga_inv2_impl1/meas_noninterf_3000.log`): PASS

같은 시드·3,000생애로 원본 러너(`base_f639c05/test_runner.js`)와 측정 러너(active)를 실행하고 비교했다.

| 시드 | 표준 출력 | 생애별 기록 | RNG 지점 집계 | 측정 보고 |
|---|---|---|---|---|
| 20261104 | 바이트 동일(sha 18043778…) | 바이트 동일(sha 919ead02…) | 동일 | valid, C=3007 = F 3007, H·P·X·A 0 |
| 777 | 바이트 동일(sha 2e7e59d3…) | 바이트 동일(sha b047f50c…) | 동일 | valid, C=3007 = F 3007 |

- 생애별 기록 SHA(919ead02…·b047f50c…)는 P5 기준선의 `life_physical_20261104.json`·`life_physical_777.json` SHA 와도 같다(f639c05 는 관문 OFF 라 P5 와 결과가 같다).
- C=3007 = 실제 생애 3000 + 러너 안 단위 시험의 `endLife` 호출 7이다. 관문 OFF 상태이므로 H(정지)·P(후속 선택 보류) 0은 실제 생애 결과다. 관문 ON 측정은 하지 않았다(기능 활성화는 승인 대상).

## 6. 설계와 다른 점(구현 중 확인한 사실, 재검수 요청)

- **D1 C5a 정의 정정**: 설계는 `newListener`·`removeListener` 리스너 수 0 을 요구했다. Node v22.23.4 는 시작할 때 두 이벤트에 내장 리스너를 2개씩 등록한다(`startListeningIfSignal`·`stopListeningIfSignal` 등). 그래서 원안대로면 정상 실행도 항상 무효였다. 구현은 "init 시점 기준선과 목록이 같음(개수·함수 동일성)"으로 바꿨다. init **이후** 추가된 훅은 검출된다. **정정(r1, 1차 QA R1): 이 방식은 설계 원안과 동등하지 않다.** init **이전에** 선점된 외부 리스너는 기준선에 들어가 검출되지 않는다(실행 확인, `QA_RESPONSE_P4_GAINV2_r1.md` §1). 즉 현재 구현은 초기화 이전 환경을 신뢰하는 것으로 검증 범위를 줄였다. 이 설계 변경은 사용자 결정 대기다.
- **D2 T14**: `PROC.on` 대신 감시 래퍼를 PROC 에 직접 적용한다(R5).
- **D5 25n11**: Node 는 `EventEmitter.prototype` 전체를 동결하면 내부 스트림 적재 중에 스스로 멈춘다(설계의 합성 조건은 이 환경에서 실행할 수 없다). `EE.on` 만 쓰기 불가로 바꿔 같은 경로(첫 대입 실패 → 복원 쓰기 없음 → clean)를 확인했다.
- 그 밖 D3·D4·D6 은 `measure/README.md`.
- **r1 보강(1차 QA §3):** 검사기에 P6-parts(parts 의 각 T 번호를 원문 위치의 실제 문맥 — init 의 `stage = N` 구간·catch 복원 구간 — 과 대조) 추가. ⑫-neg 57/57(N51~N56 추가). 고장 주입 41/41 + LIMIT 4건(R1 관측).

## 7. 미실행·한계

| 항목 | 상태 |
|---|---|
| 관문 ON(N2 활성화) 상태의 측정 | 미실행(기능 활성화 승인 대상) |
| 25n6·25n10 등의 Chromium 환경 | 미실행(측정 장치는 Node 러너 전용 설계) |
| 다른 OS·Node 판(Windows 등) 재현 | 미실행. Codex 최종 QA 미요청 |
| C4a~C4e 의 개별 고장 주입 | 미실행(정상 경로에서 참임만 확인). C4 는 finishMeasurement 창 안의 동기 변경이 필요해 합성 방법을 아직 만들지 않았다 |
| seal 의 store_failed·counter_type | 미실행(계수 객체를 바꿀 경로가 모듈 밖에 없음 — ⑫ 로 정적 확인만) |
| 허용 사이트 `parts` 의 T 번호 배정 | 검사기는 길이와 첫 번호만 확인한다. 위치별 번호 배정의 의미 검토는 문서 검토 대상 |
| 가정 E(내장 객체 원래 구현) | 검사 범위 밖(설계 유지) |

## 8. r2 추가(2026-11-27, 사용자 결정 D-1 = (가)+(나))

- 측정 러너가 깨끗한 자식 프로세스에서 리스너 이름 기준을 얻고, init(ref) 가 init 시점 목록과 대조한다. 다르면 `hook_baseline_mismatch`, 기준 확보에 실패하면 `hook_reference_failed` 로 거부한다.
- 결과
  - ⑫ PASS(200키·229위치)
  - ⑫-neg 57/57
  - 고장 주입 51/51 + LIMIT 2(위장 선점 미검출, 원안 측정 불가)
  - 비간섭 3000×2 바이트 동일
- 자세한 내용은 `QA_RESPONSE_P4_GAINV2_r2.md` 와 `logs/ga_inv2_impl1/r2/` 에 있다.
- 가정 P(init 이전의 위장 선점 없음)는 `measure/README.md` "가정" 절에 있다.

