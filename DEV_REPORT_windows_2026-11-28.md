# 검증 보고서 — Windows 호환성 (2026-11-28)

- 근거: 사용자 결정 "Node 판 검증 후에 윈도우스 검증도 합시다!", "둘 중 되는 곳으로 진행하죠?"(2026-11-28)
- 대상: 작업 브랜치 `dec2af5`. 게임 코드는 main `e9cd6d7`(= G1 기준선 `605fdf4` 의 게임 코드)와 같다.
- 실행 환경: GitHub Actions `windows-latest`(MINGW64_NT-10.0-26100, Git Bash), Node v22.23.4, Playwright 1.63.0(Chromium)
- 워크플로: `.github/workflows/windows-verify.yml`. 행렬은 `core.autocrlf` false · true 두 가지다.
- 실행 기록: run `46150350131`(2회차)
  - job `140995410823`: crlf=false
  - job `140995411031`: crlf=true
- 상태 표기
  - 작성자 실행이다. Codex 는 사용자 결정에 따라 요청하지 않았다.
  - 로그는 job 로그(get_job_logs)로 읽었다. artifact zip 은 이 컨테이너 프록시가 blob 호스트를 막아(403) 내려받지 못했다.

## 1. 결과 요약

| 검사 | crlf=false | crlf=true |
|---|---|---|
| A 두 시드 × 3000생애 출력, G1 기준선과 바이트 비교 | 동일 · 동일 | 다름 · 다름 (lifeDigest 780928835 · 3640313501 = 기준선과 같은 값) |
| A 10구성 digest 엄격 대조 | exit 0 | exit 0 |
| B 단위 시험 18종(Mock DOM) | 전부 exit 0 | 11종 exit 0 · 7종 exit 1 |
| C Chromium file:// | exit 0 | exit 0 |
| C Chromium inline | exit 0 | exit 0 |
| D ⑫ ast_check · ⑫-neg | exit 0 · exit 0 | exit 2 · exit 2 |
| D 고장 주입 · 비간섭 3000 × 2 | exit 0 · exit 0 | exit 1 · exit 1 |

결론
- **crlf=false(LF 체크아웃)에서는 Windows 의 게임 결과가 Linux 기준선과 바이트 단위로 같고, 시험이 전부 통과한다.**
- Windows 경로와 file:// URL 문제는 일어나지 않았다(C 두 방식 exit 0).
- crlf=true 의 실패는 모두 **CRLF 로 체크아웃된 파일을 원문 그대로 읽는 시험·검사 쪽**에서 났다. 게임 결과 자체는 두 lifeDigest 와 10구성 digest 엄격 대조로 같다고 확인된다.

## 2. crlf=true 실패 분류

| 항목 | 실패 내용(로그) | 분류 | 근거 등급 |
|---|---|---|---|
| A tr 바이트 비교 | 다름. lifeDigest 는 기준선과 같다 | CRLF: 기준선 `tr_*.log` 가 CRLF 로 바뀌어 체크아웃됨 | 추론. 저장소의 기준선 파일은 CR 0개(확인)이고, 비교 대상 파일의 바이트는 미확인 |
| p4_test 164/167 | 시험용 패치 #0 "일치 0회"(여러 줄 앵커) | CRLF: 앵커는 `\n` 기준, 소스는 `\r\n` | 로그로 확인 |
| n2_rollback_test 190/191 | 같은 유형(`if (!lh.has) delete S.levelHistory;` 앵커) | CRLF | 로그로 확인 |
| f1_transition_test 142/143 | 같은 유형(`setJob('supporter');` 앵커) | CRLF | 로그로 확인 |
| feat_p5_test 206/207 | 같은 유형(events.js 앵커) | CRLF | 로그로 확인 |
| devabil_test 132/133 | DA-3f 블록 정적 검사(주석 제외) 실패 | CRLF: 소스 원문 정규식 검사 | 추론 |
| sync_2i_test 1/108 실패 | 호출자 정적 분석 `inside:false` | CRLF: 소스 원문 정규식 검사 | 추론 |
| rng_sites_test 137/139 | ① 소스 CR 개수 0 검사(설계상 LF 요구) ② 독립 grep 28 ≠ 21 | ① CRLF(검사가 의도대로 검출) ② CRLF 영향으로 추정 | ① 로그로 확인 ② 추론 |
| ast_check · ast_neg | 실행 전 검사 실패: "acorn SHA-256 불일치" | CRLF: 고정한 vendor 파일의 바이트가 바뀜 | 로그로 확인 |
| meas_fault 41/51 | source sha mismatch, runner edit 일치 실패 | CRLF: 측정 사본 SHA 확인·편집 앵커 | 로그로 확인 |
| meas_noninterf | 측정 결과 파일 ENOENT | 연쇄: 측정 실행이 SHA 불일치로 중단돼 결과 파일이 없음 | 추론 |

- 실제 결함으로 분류한 항목: **0**
- 환경(경로 · file:// · Node) 문제로 분류한 항목: **0**
- 측정 장치는 SHA 가 바뀐 소스에서 실행을 거부했다(vm 생성 전 중단). 이는 설계대로의 안전한 실패다.

## 3. 대응 선택지(제안, 미승인)

| 안 | 내용 | 영향 |
|---|---|---|
| W-1 | `.gitattributes` 에 `* text eol=lf` 를 추가한다(바이너리 예외 포함) | 저장소 정책 파일을 새로 만든다. autocrlf 설정과 상관없이 LF 로 체크아웃된다. 게임·시험 코드는 그대로다 |
| W-2 | 시험·검사가 CRLF 를 허용하도록 고친다 | 시험 여러 곳을 바꾼다. SHA 고정 검사(acorn, 측정 사본)는 원리상 허용할 수 없어 W-1 이 따로 필요하다 |
| W-3 | 현 상태를 유지하고 "LF 체크아웃 필수"를 문서에만 적는다 | 변경 없음 |

- 작성자 권고: W-1. 이유는 두 가지다.
  - 실패는 체크아웃 방식에서만 생긴다.
  - SHA 고정 검사는 바이트 동일성이 목적이므로, 시험 쪽에서 CRLF 를 허용하면 검사 의미가 약해진다.

## 4. 미실행

| 항목 | 상태 |
|---|---|
| 실제 Windows PC(사용자 컴퓨터) 수동 플레이 | 미실행 |
| crlf=true 의 비교 대상 파일 바이트 직접 확인(artifact) | 미실행(프록시 403) |
| Windows 의 RNG 3환경 대조(p1_verify 40~42) · 변이 시험(11~14) · 48k | 미실행 |
| macOS · ARM | 미실행 |
