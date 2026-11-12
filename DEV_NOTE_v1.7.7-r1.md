# v1.7.7-r1 — 재현성 보강 + protected 차단 작업 준비 (게임 코드 불변)

QA 전달 사항 1~5에 대한 처리입니다. **v1.7.7 구현은 되돌리거나 재작성하지 않았습니다.** `data.js`, `events.js`, `script.js`, `core/*`, `index.html`, `style.css`, `test_runner.js`는 v1.7.7과 바이트 단위로 동일합니다.

| # | 전달 사항 | 처리 |
|---|---|---|
| 1 | v1.7.7 구현 유지 | 게임 코드 변경 없음. 회귀 10/10 동일(`logs/regression_digest_v177.log` 재생성) |
| 2 | protected 차단 별도 준비 | `work/protected_gating.patch` + `work/WORKPLAN_protected_gating.md`. **미적용.** 스크래치 사본에 적용해 3,000생애·회귀 10/10 동일 확인. 추가 발견: `god_gone`에 팔나·소속 조건이 없는 빈틈(관찰 노출 0) — 별도 승인 항목으로 기록 |
| 3 | 3세 이후 아동기 이벤트 | 구현하지 않음 |
| 4 | 2b | 착수하지 않음 |
| 5 | QA 재현 수단 유지 | `REPRODUCE.md`(실측 시간과 분할 실행 명령). `tests/regression_digest.js`에 구성 필터(예: `physical`, `off`, `physical/777`, 잘못된 필터는 exit 1). `tests/browser_test.js`에 `BROWSER_LOAD=inline`(file:// 차단 환경용)과 `CHROMIUM_PATH` 옵션, ENV 줄에 로드 방식·실행 파일 기록 |

## 검증
- 브라우저: file:// 24생애 **16/16**, inline 24생애 **16/16**, `CHROMIUM_PATH` 지정 3생애 **16/16** (같은 Chromium 153 실행 파일로 경로 지정만 확인; `/usr/bin/chromium` 같은 시스템 Chromium은 이 환경에 없어 **미검증**).
- inline 모드는 처음에 수인 지정 검사와 자동 진행이 실패했습니다. 원인은 `setContent` 문서에 타이머 단축 스크립트가 적용되지 않아 60초 제한을 넘긴 것으로, 문서 앞에 같은 스크립트를 넣어 해결했습니다(게임 코드 불변).
- 다중 시드: 게임 코드가 v1.7.7과 같으므로 `logs/multi_seed_stats.log`(48,000생애, 16/16 PASS)를 유지합니다. 모드 하나(`off`, 4시드×3,000) 재실행: PASS, 약 86초.
- Python Playwright 전용 환경을 위한 포트는 만들지 않았습니다.
