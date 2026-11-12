# 문서 색인 — 버전과 유효성 (v1.7.8-2bb 기준, 아래 v1.7.8-2i 표는 이력)

## v1.7.8-ri ~ v1.7.8-2ba-t1 추가 문서·로그
| 파일 | 대상 버전 | 상태 | 비고 |
|---|---|---|---|
| `logs/v178ri/*` | v1.7.8-ri | 이력 | R-i 검증 로그(residence 30/30 당시) |
| `logs/v178ri_r1/*` | v1.7.8-ri-r1 | **현행**(R-i) | 빈 이력 방어, residence 35/35, `ri11_on_base.log` 결함 재현 |
| `logs/v178_2ba/*` | v1.7.8-2ba | **현행**(2b-a 결과) | god_gone 62/62 당시, lifeDigest 10구성 새 값(`reg_*.log`), 이벤트 전후 표, 변이 4/5 기록 |
| `logs/v178_2bb/*` | v1.7.8-2bb | **현행**(2b-b 결과) | recruit 49/49, 변이 10/10, sync 136/136·108/108, 3,000생애×2, lifeDigest 10구성 새 값, 2ba-t1 대비 비교·튜닝 기록, 브라우저 file://·inline |
| `tests/recruit_2bb_test.js`·`tests/recruit_2bb_mutation.js` | v1.7.8-2bb | **현행** | 49항목·변이 9종 |
| `logs/v178_2ba_t1/*` | v1.7.8-2ba-t1 | **현행**(테스트) | god_gone 68/68, 변이 7/7, d3 FORCE_COLOR=1 실행, 3,000생애 출력 2ba 와 동일 |
| `tests/residence_ri_test.js` | v1.7.8-ri-r1 | **현행** | 35항목 |
| `tests/god_gone_2ba_test.js` | v1.7.8-2ba-t1 | **현행** | 68항목 |
| `CHANGED_FILES.md`·`CHANGELOG.md`·`REPRODUCE.md` | ~ v1.7.8-2bb | **현행**(누적) | REPRODUCE §7(R-i)·§8(2b-a)·§9(2b-b) |

## v1.7.8-2i 기준 색인(이력)

| 파일 | 대상 버전 | 상태 | 비고 |
|---|---|---|---|
| `README.md` | v1.7.8-2i | **현행** | 실행·테스트 방법, 기능 요약 |
| `DEV_REPORT_v1.7.8-2i.md` | v1.7.8-2i | **현행** | 2-i 구현·설계 이탈(D-1~D-8)·검증 결과·Q20 |
| `logs/v178/*` | v1.7.8-2i | **현행** | 2-i 전체 검증 로그(문법·3,000판×2·회귀 10·r1 대조 10+6·48,000판·단위 130·브라우저 2종·구성별 실측) |
| `DEV_REPORT_v1.7.7.md` | v1.7.7 | 이전 기준 | 기능 작업 보고서 |
| `DEV_NOTE_v1.7.7-r1.md` | v1.7.7-r1 | **현행** | 재현성 보강·protected 차단 준비(게임 코드 불변) |
| `REPRODUCE.md` | v1.7.8-2i | **현행** | QA 재현 명령·실측 시간·분할 실행(§6 2-i 추가) |
| `archive/v1.7.7-r1/work_discarded_D5/*` | v1.7.7 기준 | **폐기(D5 승인)** | 적용 금지. 기록 보관 |
| `CHANGELOG.md` | v1.2.1 ~ v1.7.8-2i | **현행**(누적) | 버전별 변경 |
| `CHANGED_FILES.md` | v1.7 ~ v1.7.8-2i | **현행**(누적) | 버전별 변경 파일 |
| `DESIGN_PROPOSAL_status_separation.md` | §1~§9 | **현행 설계안**(미구현 부분 포함) | 2a·2a-role만 구현됨 |
| `logs/test_runner_seed20261104_3000.log`, `logs/test_runner_seed777_3000.log` | v1.7.7 | 기준본 기록(2-i 결과는 `logs/v178/`) | Mock DOM 3,000생애 |
| `logs/regression_digest_v177.log`, `logs/baseline_lifeDigest_v174.json` | v1.7.7 / 기준 v1.7.4 | **현행** | 동작 회귀 10개 구성 |
| `logs/multi_seed_stats.log` | v1.7.7 | **현행** | 4시드×4모드×3,000 |
| `logs/browser_test_24lives.log` | v1.7.7-r1 | **현행** | 실제 Chromium, file:// (개발자 환경), ENV 줄에 버전·로드 방식 |
| `logs/browser_test_24lives_inline.log` | v1.7.7-r1 | **현행** | inline 주입 방식(배포 경로 검증 아님) |
| `logs/browser_test_chromium_path.log` | v1.7.7-r1 | **현행** | `CHROMIUM_PATH` 옵션 동작 확인(3생애) |
| `logs/zip_rerun_*_v177r1.log` | v1.7.7-r1 | **현행** | 제출 ZIP 압축 해제 후 재실행 |
| `archive/v1.7.x/DEV_REPORT_v1.7*.md` (v1.7 ~ v1.7.6) | 각 버전 | 보관 | 당시 제출 기록. v1.7.1·v1.7.2의 일부 수치는 이후 정정됨(문서 내 공지) |
| `archive/v1.7.x/logs/*` | v1.7 ~ v1.7.6 | 보관 | 당시 로그 |
| `archive/v1.2.1/README_v1.2.1.md`, `CHATGPT_REVIEW.md`, `simulation_test_log.txt`, `test_seed_777.log` | v1.2.1 | 보관 · **현재 유효하지 않음** | "가족 NPC 없음·최고 Lv4·브라우저 미실행" 등은 당시 상태 |
| `archive/v1.2.1/review_evidence/*` | v1.2.1 | 보관 · **현재 유효하지 않음** | `browser_test_limitation.txt`에 현재와의 차이 설명 추가 |
| `sim_test.js` | — | 현행(호환용) | `test_runner.js`를 호출하는 하위 호환 진입점 |

## 브라우저 테스트 기록의 불일치 정리

- v1.2.1 기록(`archive/v1.2.1/review_evidence/browser_test_limitation.txt`): 당시 검수 환경에 Playwright가 없어 **미실행**. → 현재 유효하지 않음.
- v1.7 이후 개발자 환경: `tests/browser_test.js`가 실제 Chromium으로 `file://…/index.html`을 직접 엽니다. 로그 첫 줄에 Chromium·Playwright·Node 버전과 로드 방식을 기록합니다.
- ChatGPT QA 환경: `file://`·localhost가 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단되어 HTML/CSS/JS를 인라인 주입하는 방식으로만 재현했습니다. 일반 파일 경로 배포 검증은 QA 환경에서는 미완료입니다. v1.7.7-r1부터 같은 16항목을 `BROWSER_LOAD=inline`으로 돌릴 수 있습니다(`REPRODUCE.md`).
- 세 기록은 **실행 환경이 다른 결과**이며, 어느 환경에서 무엇을 검증했는지 위와 같이 구분합니다.
