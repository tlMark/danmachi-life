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

---

# r1 추가 (ChatGPT 1차 QA "조건부 통과" 반영, W-1 승인 2026-11-28)

- 위 §1~§4 는 2회차 시점 기록으로 그대로 둔다. 아래 §5 가 §2 의 분류를 보완·정정한다.
- 이번 변경 범위
  - `.gitattributes` 신규: 저장소 줄바꿈 정책(W-1 승인 범위)
  - 검증 도구(게임·시험 코드 아님): `logs/v178_windows/tools/crlf_diag.js`, `logs/v178_windows/tools/mf_diag.sh`
  - Windows 워크플로: 읽기 전용 확인 E·F 단계 추가
  - 게임 코드·시험 코드(`tests/`, `measure/tests/`)·기준선·digest: 변경 0
- QA 요청 "별도 시험 추가"와 W-1 지시 "시험 코드 변경 금지"가 겹친다. 그래서 최소 재현은 시험 폴더 밖의 진단 도구로 만들었다. 시험 묶음에 넣을지는 별도 승인 사항이다.

## 5. CRLF 실패 원인 재확인 — 로컬 재현(Linux, Node v22.23.4)

재현 방법
- 이 컨테이너에서 `git -c core.autocrlf=true clone` 으로 받으면 Windows 와 같은 CRLF 작업 트리가 된다.
  - script.js CR 1,981개, 소스별 CR 수가 Windows 로그와 같다.
- 같은 시험을 실행하면 Windows crlf=true 의 실패가 그대로 재현된다.
  - meas_fault 41/51, FAIL 10건 목록이 같다.
  - 기록: `logs/v178_windows/local_linux_repro/before_W1_crlf/`
- 따라서 이 실패들은 **Windows Node 의 동작 차이가 아니라 CRLF 작업 트리에서 생긴다**. 근거는 운영체제를 바꿔도 같은 실패가 나는 실행 결과다.

### 5.1 정적 검사 3건 — 기제 확인(`crlf_diag.js`, 시험과 같은 식으로 중간값 계산)

| 항목 | LF 사본 | CRLF 사본 | CRLF 사본에서 CR 만 지운 텍스트 | 기제 |
|---|---|---|---|---|
| rng_sites 독립 grep | 21 | **28**: 주석 줄 7개가 셈에 들어감(recruit.js 4·33·50, lineage.js 2, script.js 1166·1576·1864) | 21 | 주석 제거식 `/\/\/.*$/` 에서 `.` 은 `\r` 과 맞지 않는다. 그래서 `$`(입력 끝)에 닿지 못해 주석이 지워지지 않는다 |
| devabil DA-3f 블록 | 7,219자, Math.random 없음 | 9,491자, **있음** | 7,219자, 없음 | 위와 같은 주석 제거식. 블록 안 주석의 `Math.random` 이 남는다 |
| sync_2i applyGodReturn 본문 | 1,164자 | **0자** | 1,164자 | 본문 추출식 `/…\n}\n/` 이 `}\r\n` 과 맞지 않아 빈 본문이 된다. 그래서 `inside:false` 가 나온다 |

- 등급: §2 에서 "추론"으로 둔 세 항목은 위 실행으로 **기제 확인**이다.
- rng_sites 의 CR 0 검사(①)와 grep 28≠21(②)은 서로 다른 검사다. ②의 원인은 주석 제거식으로 따로 확인했다.
- 기록: `logs/v178_windows/local_linux_repro/crlf_diag_*.json`

### 5.2 meas_fault R0·25n11·K1′·T4·25n10a — 동작 판정 분리(`mf_diag.sh`)

세 사본에서 같은 사전 적재로 측정 러너를 직접 실행했다.

| 사례 | LF 사본 | CRLF 사본 | CRLF 사본 + 고정 소스 9개만 LF |
|---|---|---|---|
| R0 | active · exit 0 · 게임 y · vm y | active · **exit 1 · 게임 n · vm n** | active · exit 0 · y · y |
| 25n11 | inactive_clean / exception_at_stage_2 · exit 0 · y · y | 같은 상태·이유 · **exit 1 · n · n** | 같은 상태·이유 · exit 0 · y · y |
| K1′ | inactive_clean / orig_invalid:on · exit 0 · y · y | 같은 상태·이유 · **exit 1 · n · n** | 같은 상태·이유 · exit 0 · y · y |
| T4 | inactive_clean / read_api_not_data · exit 0 · y · y | 같은 상태·이유 · **exit 1 · n · n** | 같은 상태·이유 · exit 0 · y · y |
| 25n10a | inactive_clean / exception_at_stage_2 · exit 0 · y · y | 같은 상태·이유 · **exit 1 · n · n** | 같은 상태·이유 · exit 0 · y · y |

- 세 번째 열의 고정 소스는 `measure/base_f639c05/`·`measure/measure_src/` 의 9개다. 그 밖의 러너·모듈·시험·하네스는 CRLF 그대로 두었다.
- 판정
  1. **상태·이유 판정은 세 사본에서 모두 같다.** CRLF 에서 달라진 것은 실행 허용 여부뿐이다.
  2. CRLF 사본의 표준 오류는 다섯 사례 모두 `source sha mismatch`(vm 생성 전 중단)다. 러너는 활성·비활성 모두 고정 소스 SHA 를 확인하므로 원본 실행도 거부된다. 설계대로의 안전한 실패다.
  3. 고정 소스만 LF 로 바꾸면 다섯 사례 모두 LF 사본과 같다. 그 밖의 CRLF 파일은 이 판정에 영향이 없다.
  4. 고장 주입 사전 적재 파일은 시험이 실행 중에 LF 로 새로 쓴다. 따라서 체크아웃의 영향을 받지 않는다.
- 그 사본의 meas_fault 전체 결과는 48/51 이다. 남은 3건은 시험 안의 러너 편집 앵커 불일치다(`runner edit 일치 실패`: 25n14a·25n14b·C5a-ref-fail). 여러 줄 앵커가 CRLF 러너와 맞지 않아 **fixture 구성이 실패**한 것이다.
- Windows 에서 같은 판정이 같은지는 2회차 crlf=false job(51/51)과 3회차 F 단계로 확인한다(§7).
- 기록: `logs/v178_windows/local_linux_repro/mf_diag/`(사례별 stderr·전체 로그)

### 5.3 §2 분류 정정

| 항목 | §2 | r1 |
|---|---|---|
| devabil · sync_2i | 추론 | 기제 확인(§5.1) |
| rng_sites ② grep | 추론 | 기제 확인(§5.1), ①과 분리 |
| meas_fault | "SHA·편집 앵커" 한 묶음 | 셋으로 나눔(§5.2) |
| meas_noninterf | 연쇄 | 연쇄(선행 측정 실행이 SHA 불일치로 중단) — 그대로 |
| A tr 바이트 비교 | 추론 | 추론 그대로(파일 바이트 직접 확인 미실행). W-1 뒤 3회차 결과로 대신 확인(§7) |

meas_fault 세 갈래
- (가) 고정 SHA 확인: 25n16, S4
- (나) 동작 판정은 같고 실행만 거부: R0, 25n11, K1′, T4, 25n10a
- (다) fixture 앵커: 25n14a, 25n14b, C5a-ref-fail

## 6. W-1 구현과 확인

### 6.1 `.gitattributes` 전체 diff(신규 파일, 커밋 `29edc5c`)

```diff
+# 저장소 줄바꿈 정책(W-1, 사용자 승인 2026-11-28)
+# - 텍스트 파일은 core.autocrlf 설정과 상관없이 LF 로 체크아웃한다.
+#   이유: 측정 사본의 SHA-256 고정 검사(acorn·고정 소스 9개)와 기준선 바이트 비교는 LF 바이트를 전제로 한다.
+# - 저장소 색인의 텍스트 파일은 이미 모두 LF 다(이 파일 추가 시 재정규화 변경 0건 확인).
+* text=auto eol=lf
+
+# 바이너리: 줄바꿈 변환·diff 제외. 2026-11-28 기준 저장소에 이 유형의 파일은 없다(git ls-files --eol 에서 -text 0건).
+# 앞으로 추가될 때를 위해 흔한 유형을 명시한다.
+*.png  binary
+*.jpg  binary
+*.jpeg binary
+*.gif  binary
+*.webp binary
+*.ico  binary
+*.bmp  binary
+*.mp3  binary
+*.ogg  binary
+*.wav  binary
+*.mp4  binary
+*.webm binary
+*.woff binary
+*.woff2 binary
+*.ttf  binary
+*.otf  binary
+*.zip  binary
+*.gz   binary
+*.tgz  binary
+*.7z   binary
+*.pdf  binary
```

- `text=auto` 를 쓴 이유
  - `* text` 는 git 이 바이너리로 판정한 파일까지 강제로 텍스트로 취급한다.
  - `text=auto` 는 git 의 바이너리 판정을 따르면서, 텍스트는 `eol=lf` 로 체크아웃한다.
- 저장소 파일 유형 조사
  - 추적 파일 1,160개: log 744 · status 103 · js 91 · json 70 · md 57 · txt 51 · diff 26 · 그 밖 소수
  - 색인 상태: `i/lf` 1,108, `i/none`(줄바꿈 없는 한 줄 파일) 52
  - git 이 바이너리로 판정한 파일(`-text`): 0개

### 6.2 확인 결과(로컬 Linux, 커밋 `29edc5c`)

| 확인 | autocrlf=false | autocrlf=true |
|---|---|---|
| 작업 트리 줄바꿈(`ls-files --eol`) | w/lf 1,109 · w/none 52 | w/lf 1,109 · w/none 52 |
| CR 포함 추적 파일 | 0 | 0 |
| 추적 파일 전체 SHA-256 묶음 | f3a71d366797bc0f | f3a71d366797bc0f(원 작업 트리와 같음) |
| `git status` 변경 | 0 | 0 |

- 재정규화(`git add --renormalize .`): `.gitattributes` 밖의 변경은 0건이다. 커밋 `29edc5c` 의 변경 파일은 `.gitattributes` 1개뿐이다.
- 바이너리 손상: 해당 유형 파일이 없다. 모든 추적 파일의 SHA 묶음이 두 설정에서 같다.
- autocrlf=true 사본에서 2회차 실패 시험을 다시 돌렸다.
  - 결과: devabil 133/133, sync_2i 108/108, p4 167/167, n2_rollback 191/191, f1_transition 145/145, feat_p5 222/222, rng_sites 139/139, ast_check exit 0, ast_neg 57/57, meas_fault 51/51
  - mf_diag 다섯 사례: LF 사본과 같은 상태·이유, exit 0
  - 기록: `logs/v178_windows/local_linux_repro/after_W1_crlf/`, `checkout_autocrlf_*.log`
- 이 결과는 Linux 에서 재현한 것이다. Windows 에서의 확인은 §7 이다.

### 6.3 변경 파일 SHA-256

| 파일 | SHA-256 |
|---|---|
| `.gitattributes` | 8cf4908490ea9576dfcf983d054c3366671a90a7df7fd259cb49b8b735394f18 |
| `logs/v178_windows/tools/crlf_diag.js` | 999c51a8366e6063c7735369cb61df2ef56227f2218d832f8bd6feec78cbe62e |
| `logs/v178_windows/tools/mf_diag.sh` | 1335afe02427dfb9071271bb74a13752aafab03fff1b5acfab5eae44f631038e |

- 커밋 `3ce68ce` 의 Linux 추적 파일 SHA 묶음: a9cb8244e094ff55. 3회차 E 단계 값과 대조한다.

## 7. Windows 3회차(커밋 3ce68ce)

- run: https://github.com/tlMark/danmachi-life/actions/runs/46157304267
  - job `141016686521`: crlf=false, run checks 종료 코드 1
  - job `141016686745`: crlf=true, run checks 종료 코드 1
- 두 job 모두 실패 원인은 **E_crlf_zero 1건뿐**이다(§7.2). A~D 와 F 는 두 설정 모두 통과다.

### 7.1 항목별 결과

| 검사 | crlf=false | crlf=true(2회차 실패 항목) |
|---|---|---|
| A 두 시드 출력, G1 기준선과 바이트 비교 | 동일 · 동일 | **동일 · 동일**(2회차: 다름) |
| A 10구성 digest 엄격 대조 | exit 0 | exit 0 |
| B 단위 시험 18종 | 전부 exit 0 | **전부 exit 0**(2회차: p4·devabil·n2_rollback·f1_transition·sync_2i·feat_p5·rng_sites 실패) |
| C Chromium file:// · inline | exit 0 · 0 | exit 0 · 0 |
| D ⑫ · ⑫-neg | exit 0 · 0 | **exit 0 · 0**(2회차: 2 · 2) |
| D 고장 주입 · 비간섭 3000 × 2 | exit 0 · 0 | **exit 0 · 0**(2회차: 1 · 1) |
| E 작업 트리 줄바꿈(`ls-files --eol`) | w/lf 1,111 · w/none 52 | w/lf 1,111 · w/none 52 |
| E CR 포함 추적 파일 수 | 1,155 → E_crlf_zero exit 1 | 1,155 → exit 1 |
| E 추적 파일 SHA 묶음 · status 변경 수 | 4120034f38172b2e · 1 | 4120034f38172b2e · 1 |
| F crlf_diag | grep 21 · 블록 Math.random 없음 · 소스 9개 CR 0 | 같음 |
| F mf_diag(기록 전용) | meas_fault 51/51. R0 active, 25n11·K1′·T4·25n10a 는 LF 와 같은 상태·이유. 다섯 사례 모두 exit 0 · 게임 y · vm y | 같음 |

- meas_fault R0·25n11·K1′·T4·25n10a: QA 지시대로 SHA 불일치 해소만으로 통과 처리하지 않았다.
  - F 단계에서 다섯 사례 각각의 상태·이유·종료 코드·실행 여부를 따로 기록했다.
  - Windows 두 설정 모두 Linux LF 기준(§5.2 첫 열)과 같다.

### 7.2 E_crlf_zero 실패 — 검사 단계 결함(저장소 상태 아님)

결론: E 의 CR 계수와 SHA 묶음은 Windows Git Bash 에서 의도와 다르게 계산됐다. 저장소 파일에는 CR 이 없다.

| 값 | 기제 | 근거 |
|---|---|---|
| CR 포함 파일 1,155 | `grep -l $'\r'` 의 패턴이 Windows Git Bash 에서 빈 패턴처럼 동작했다. 빈 패턴은 비어 있지 않은 모든 파일과 맞는다 | 3ce68ce 의 비어 있지 않은 추적 파일 수 = 1,155, 빈 패턴 일치 파일 수 = 1,155(Linux 실행으로 확인). CR 이 빈 패턴으로 바뀐 경로(셸·인자 처리)는 **추론** |
| SHA 묶음 4120034f… | Windows 의 `sha256sum` 은 바이너리 모드 표시(`해시 *경로`)로 출력한다 | Linux 에서 `sha256sum -b` 로 같은 묶음을 만들면 **4120034f38172b2e** 로 일치한다(확인). 파일별 내용 해시는 Linux 3ce68ce 와 같다 |
| status 변경 수 1 | 워크플로가 설치한 `node_modules/`(추적 안 됨)로 보인다 | **추론**(목록 미출력) |

저장소에 CR 이 없다는 독립 근거
- `ls-files --eol` 작업 트리가 전부 w/lf · w/none 이다.
- crlf_diag(Node 로 읽음): 고정 소스 9개 CR 0.
- 바이트 고정 검사 통과: acorn SHA, 측정 사본 소스 SHA, 기준선 바이트 비교.

대응 제안(미승인 — 사용자 결정 "E·F 그대로 둔다"와 관련)
- E-fix: CR 계수를 Node 로 바꾸고, SHA 묶음은 `*` 표시를 정규화한 뒤 계산한다.
- 고치지 않으면 E_crlf_zero 가 매 실행마다 거짓 실패를 내서 job 이 항상 실패한다.

### 7.3 결론

- W-1 적용 뒤 Windows 에서 autocrlf false · true 모두 다음이 같다: 게임 결과(바이트), 단위 시험, Chromium, 측정 사본 시험.
- 2회차 crlf=true 실패 항목은 전부 해소됐다.
- 남은 실패는 3회차에 추가한 E 검사 단계 자체의 Windows 셸 결함 1건이다.

## 8. 사용자 결정(2026-11-28)과 정정

- 진단 도구(`logs/v178_windows/tools/`)는 권고대로 시험 묶음에 넣지 않는다. 원인 분석 기록으로 둔다.
  - 작은 `eol_policy_test` 는 별도 승인 전 만들지 않는다.
- 워크플로 E·F 단계는 그대로 둔다.
- 정정: r1 에서 E·F 를 "읽기 전용 확인"이라고 했다.
  - 저장소를 바꾸지 않는다는 뜻으로는 맞다.
  - 그러나 E_crlf_zero 는 job 을 실패시키는 **판정 단계**다.
  - F 는 판정하지 않는다. F_mf_diag 의 exit=0 은 "실행됨"이지 "통과"가 아니다. 다섯 사례의 판정은 위 표처럼 출력 값을 읽어서 했다.

## 9. 미실행·남은 제한

| 항목 | 상태 |
|---|---|
| E-fix(검사 단계 수정) · 재실행 | 미실행(승인 대기) |
| artifact 직접 확인 | 미실행(프록시 403). job 로그로 대신함 |
| 실제 Windows PC 수동 플레이 | 미실행 |
| Windows 의 RNG 3환경 대조 · 변이 시험 · 48k | 미실행 |
| macOS · ARM | 미실행 |

## 10. Windows 4회차 — E-fix(사용자 승인 2026-11-28, 커밋 11bac47)

### 10.1 변경

| 대상 | 변경 |
|---|---|
| `logs/v178_windows/tools/e_check.js` | 신규. SHA-256 780398d74ad925ee118f4c917f4f8fa296c11eccc5811ce0602c218b7a018aa2 |
| `.github/workflows/windows-verify.yml` | E 의 CR 계수 · SHA 묶음 줄만 바꿨다(3줄 삭제, 4줄 추가). diff: `logs/v178_windows/efix_linux_precheck/workflow_E_only.diff` |
| 변경 없음 | E 밖 단계 · F 단계 · 기존 진단 도구 2개 · 게임 · 시험 코드 · 기준선 · digest |

계산 규칙(도구 머리 주석에 고정)
- 입력 집합: `git ls-files -z --eol` 의 경로 전체. NUL 로 구분하므로 공백·특수문자 경로가 안전하다. 작업 트리 파일은 바이트 그대로 읽는다.
- 텍스트·바이너리: git 판정(`i/-text`·`attr/-text`)을 따른다.
- CR 판정: 텍스트 파일만 판정한다. 바이너리는 0x0D 바이트 수만 따로 센다.
- 정렬: 경로의 UTF-8 바이트 순서(`Buffer.compare`)
- SHA 묶음: 정렬 순서대로 `"<sha256>\t<경로>\n"` 줄을 이은 텍스트의 SHA-256. 그 텍스트 자체를 manifest(`wout/E_manifest.tsv`)로 남긴다.
- 양성 자기 확인(`--selftest`): 임시 git 저장소로 ST-1~ST-8 을 확인한다. 1건이라도 실패하면 exit 1.

### 10.2 Linux 사전 확인(`logs/v178_windows/efix_linux_precheck/`)

| 확인 | 결과 |
|---|---|
| 자기 확인 ST-1~ST-8 | 8/8 |
| 자기 확인 세부 | CRLF 텍스트 검출 · 바이너리 판정 제외(0x0D 2바이트 따로 셈) · 공백·한글·특수문자 경로 포함 · 역순 입력에도 같은 묶음 · 바이트 순 정렬 · 독립 계산값과 일치 · CR 없으면 0 · 내용이 바뀌면 묶음 변경 |
| 저장소 5d4702e, autocrlf false · true | 둘 다 CR 0. manifest 바이트 동일 |
| 양성 실제 사례: W-1 이전 CRLF 사본 | CR 포함 1,108개, exit 1. 당시 i/lf 파일 수와 같다 |
| 대조용 Linux 묶음(11bac47) | 214ad9070b9366bc85554a2c5343d5e653b758648effe2e2980c2395665503cd, 추적 파일 1,215개 |

### 10.3 Windows 결과

- run: https://github.com/tlMark/danmachi-life/actions/runs/46166286320 — conclusion **success**
- 환경: windows-latest(MINGW64_NT-10.0-26100), Git 2.56.1.windows.1, Node v22.23.4, Playwright 1.63.0

| 검사 | crlf=false(job 141044432689) | crlf=true(job 141044432453) |
|---|---|---|
| run checks 종료 코드 | 0 | 0 |
| A 두 시드 출력, G1 기준선과 바이트 비교 | 동일 · 동일 | 동일 · 동일 |
| A digest10 · 엄격 대조 | exit 0 · 0 | exit 0 · 0 |
| B 단위 시험 18종 | 전부 exit 0 | 전부 exit 0 |
| C Chromium file:// · inline | exit 0 · 0 | exit 0 · 0 |
| D ⑫ · ⑫-neg · 고장 주입 · 비간섭 | 전부 exit 0 | 전부 exit 0 |
| E 작업 트리 줄바꿈 | w/lf 1,163 · w/none 52 | w/lf 1,163 · w/none 52 |
| E_check_selftest | exit 0(ST 8건 중 실패가 있으면 1) | exit 0 |
| E_check | CR 포함 0 · 추적 1,215(텍스트 1,215 · 바이너리 0) | 같음 |
| E SHA 묶음 | 214ad907…65503cd | 214ad907…65503cd |
| E git status | 1건: `?? node_modules/` | 같음 |
| F mf_diag | meas_fault 51/51. R0 active, 25n11 · K1′ · T4 · 25n10a 는 LF 기준과 같은 상태·이유. 다섯 사례 exit 0 · 게임 y · vm y | 같음 |

- **SHA 묶음이 Windows 두 설정과 Linux 11bac47 에서 64자 전부 같다.** 즉 추적 파일 1,215개의 바이트 내용이 세 환경에서 같다.
- 3회차에서 추론으로 둔 status 변경 1건은 `?? node_modules/`(워크플로가 설치한 Playwright)로 **확인**했다.
- CR 이 빈 패턴으로 바뀐 3회차 grep 의 정확한 셸 인자 처리 경로는 계속 **추론**이다.

### 10.4 결론

- Windows(GitHub Actions)에서 autocrlf false · true 모두 전체 워크플로가 성공했다.
  - 게임 결과: G1 기준선과 바이트 동일
  - 단위 시험 · Chromium · 측정 사본 시험: 통과
  - 체크아웃 LF(CR 0) · 추적 파일 바이트: Linux 와 동일
- 범위: Node v22.23.4 · windows-latest 한 조합이다. Windows 전반의 호환성으로 확대 해석하지 않는다.

### 10.5 미실행 · 제한

| 항목 | 상태 |
|---|---|
| artifact 직접 확인(manifest 파일 등) | 미실행(프록시 403). job 로그로 대신함 |
| 실제 바이너리 파일 처리 | 저장소에 해당 파일이 0개라 자기 확인의 합성 파일로만 확인 |
| 실제 Windows PC 수동 플레이 | 미실행 |
| Windows 의 RNG 3환경 대조 · 변이 시험 · 48k · 다른 Node 판 | 미실행 |
| macOS · ARM | 미실행 |
