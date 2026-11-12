# QA 재현 방법 (v1.7.8-2i, v1.7.7 절차 포함)

측정 환경(개발자): 2 vCPU, Node v22.23.4. 시간은 이 환경 기준 실측입니다.

## 1. 문법
```bash
for f in *.js core/*.js tests/*.js; do node --check "$f" || echo "FAIL $f"; done
```

## 2. 단일 3,000생애 (약 40초)
```bash
node test_runner.js                      # 기본 시드 20261104
SIM_SEED=777 node test_runner.js
```
비교 대상: `logs/test_runner_seed20261104_3000.log`, `logs/test_runner_seed777_3000.log` (시간 줄 제외 동일해야 함).

## 3. 동작 회귀 10개 구성 (전체 약 400초 → 나눠 실행 권장)
```bash
node tests/regression_digest.js physical                       # 4개, 약 160초
node tests/regression_digest.js off                            # 4개, 약 160초
node tests/regression_digest.js calendar newborn_parent_familia  # 2개, 약 80초
# 한 개씩: node tests/regression_digest.js physical/777
```
기준값: `logs/baseline_lifeDigest_v174.json`. 전체 실행 결과: `logs/regression_digest_v177.log`.

## 4. 48,000생애 다중 시드 (모드별 약 90초, MAX_PARALLEL=2)
한 번에 16개를 돌리면 300초 제한 환경에서 끝나지 않으므로 **모드별로** 실행합니다.
```bash
for m in physical newborn_parent_familia calendar off; do
  MAX_PARALLEL=2 node tests/multi_seed_stats.js 3000 20261104,777,314159,8675309 $m > qa_multi_$m.log; echo "$m exit=$?"
done
```
각 로그의 `통합`·`시드별`·`소속 이력`·종족별 행은 `logs/multi_seed_stats.log`의 같은 모드 구간과 같아야 합니다. 시간이 더 짧아야 하면 시드를 하나씩(`... 3000 777 physical`) 실행하세요(약 40초).

## 5. 실제 Chromium 16항목
```bash
npm i playwright                    # 또는 NODE_PATH=$(npm root -g)
node tests/browser_test.js 24                                  # file:// 로 index.html 직접 열기(배포 경로)
BROWSER_LOAD=inline node tests/browser_test.js 24              # file:// 이 차단된 환경용: HTML·CSS·JS 한 문서 주입
CHROMIUM_PATH=/usr/bin/chromium node tests/browser_test.js 24  # 설치된 Chromium 사용
```
- 로그 첫 줄 `ENV`에 Chromium·Playwright·Node 버전, 로드 방식(`file://`/`inline`), 실행 파일을 기록합니다.
- `inline` 결과는 브라우저 엔진·DOM·이벤트 검증이며 **file:// 배포 경로 검증이 아닙니다.** 보고 시 구분해 주세요.
- 브라우저 쪽 난수는 실제 `Math.random`이라 생애 내용은 매번 다릅니다(판정 항목은 확률과 무관).
- 개발자 로그: `logs/browser_test_24lives.log`(file://), `logs/browser_test_24lives_inline.log`(inline), `logs/browser_test_chromium_path.log`(CHROMIUM_PATH 경로 확인용, 3생애).
- Python Playwright만 있는 환경용 포트는 제공하지 않습니다(미구현).

## 6. v1.7.8-2i 추가 검증 (기준 v1.7.7-r1 압축 해제 폴더 필요: `<r1>`)
```bash
node tests/sync_2i_test.js <r1>                      # 2-i 당시(v1.7.8-2i~r3) 130/130 — 이후 버전 항목 수: v1.7.8-ri·ri-r1 132/132, v1.7.8-2ba·2ba-t1 133/133(§8). 격리 vm, r1 대조(R1~R7·M3·M9) 포함, 약 20초
node tests/equivalence_2i.js <r1>                    # 10/10, 같은 계측 러너로 r1·2-i 실행 → digest·rngCallDigest·V4 경로 비교, 약 300초(나눠 실행: physical / off / calendar newborn_parent_familia)
node tests/equivalence_2i.js <r1> newborn_parent_familia/777 newborn_parent_familia/314159 newborn_parent_familia/8675309 calendar/777 calendar/314159 calendar/8675309   # 기준 json 밖 구성의 r1 직접 대조 6/6
```
- `node tests/d3_wiring_mutation.js` — D-3 계측 연결(① showEvent ② rollFamilia ③ endLife, helper) 제거 변이 4종 exit 1, 변이 없음 exit 0. 약 50초
- `<r1>` 의 script.js sha256 이 `53bdfbb1b69e439f2bbe4153101ec5dbb8ffe1b343359706da4562d69c42607f` 가 아니면 `equivalence_2i.js` 는 종료 코드 1.
- 개발자 실행 로그: `logs/v178/`. 2-i 실측 표: `DEV_REPORT_v1.7.8-2i.md` §3·§4.

## 7. v1.7.8-ri(R-i 거주지 기록 전용) 추가 검증
```bash
node tests/residence_ri_test.js                     # 35/35(v1.7.8-ri-r1 부터: RI-1~RI-10 30항목 + RI-11 빈 이력 5항목), 격리 vm
SIM_SEED=20261104 node test_runner.js | grep residenceRi   # 생애 단위 거주 검사(위반 시 allInvariantsPassed=false)
```
- r3 대비 동일성: 같은 시드의 test_runner 출력에서 `residenceRi:` 줄을 뺀 나머지가 r3 출력과 같아야 함(`logs/v178ri/ri_tr_*.log` 대 `base_tr_*.log`).
- 개발자 실행 로그: v1.7.8-ri `logs/v178ri/`(당시 30/30), v1.7.8-ri-r1 `logs/v178ri_r1/`(35/35·RI-11 결함 재현 `ri11_on_base.log`).

## 8. v1.7.8-2ba(2b-a god_gone 연결) 추가 검증
```bash
node tests/god_gone_2ba_test.js                     # 68/68(v1.7.8-2ba-t1: GG-2g ===1·GG-7 실제 chance 경유·GG-8 구조 검사; 2ba 당시 62/62)
node tests/sync_2i_test.js <v1.7.7-r1 폴더>         # 133/133 (레거시 픽스처 + r1 대조). r1 폴더 = Danmachi_v1.7.7r1_integrated.zip(SHA-256 51890b66…) 압축 해제본
node tests/sync_2i_test.js                          # 105/105(인수 없음)
node tests/d3_wiring_mutation.js                    # 5/5 — v1.7.8-2ba-t1 부터 FORCE_COLOR 환경에서도 판정 정상(하위 프로세스 색상 끔·ANSI 제거)
SIM_SEED=20261104 node test_runner.js; SIM_SEED=777 node test_runner.js   # 완주·불변식 통과, lifeDigest 2109524451 / 596465386
```
- lifeDigest 10구성은 기준과 **다름**(결과 변경 단계). 새 값은 `logs/v178_2ba/reg_*.log`.
- v1.7.8-2ba-t1(테스트·문서만) 실행 로그: `logs/v178_2ba_t1/`.


## 9. v1.7.8-2bb(2b-b 지원→심사→결과) 추가 검증
```bash
node tests/recruit_2bb_test.js                      # 49/49 — 심사 함수·이벤트 배선·합격/거절 경로 주 RNG·current 수명·파생 RNG·쿨다운·같은 파밀리아 제한·생애 상한·scout 직접 경로·join_hard 대체 fx·2-i 가드·독립성·범위 밖 미연결
node tests/recruit_2bb_mutation.js                  # 10/10 — 무변이 exit 0 + 변이 9종 각각 검출(exit 1)
node tests/sync_2i_test.js <v1.7.7-r1 폴더>         # 136/136(2bb: M10 거절 경로 3항목 추가, M1·M10 합격 생애 탐색 방식)
node tests/sync_2i_test.js                          # 108/108(인수 없음)
node tests/god_gone_2ba_test.js                     # 68/68
node tests/residence_ri_test.js                     # 35/35
node tests/d3_wiring_mutation.js                    # 5/5
SIM_SEED=20261104 node test_runner.js; SIM_SEED=777 node test_runner.js   # 완주·불변식 통과, lifeDigest 3527191366 / 1476379107, recruit2bb: 줄에 지원·거절 통계
```
- 목표(U-2b-1): `recruit2bb.membershipLivesPct` 50~60, `falnaRatePct` 45~55, `recruit2bb.rejectionAmongAppliedPct` 20~40.
- lifeDigest 10구성은 기준과 **다름**(결과 변경 단계, 기준 파일 미변경). 새 값 `logs/v178_2bb/regression_digest_10.log`, 2ba-t1 값 `regression_digest_10_base_2ba_t1.log`.
- `tests/equivalence_2i.js`(r1 대 2-i 결과 동등성)는 결과 변경 단계에 적용되지 않아 실행하지 않음.
- 실행 로그·전후 비교·튜닝 기록: `logs/v178_2bb/`(PROVENANCE.txt·compare_2ba_t1_vs_2bb.md·tuning_log.md).

## 10. v1.7.8-2bb-js1(근속 기록 `S.jobSince`, 기록 전용) 추가 검증
```bash
node tests/jobsince_test.js                         # 39/39 — 출생 0·직업 변경 갱신·같은 직업 유지·retired 갱신·비합산·joinOrganization 직업/고용처 구분·전 경로·정적 구조·RNG 0
node tests/jobsince_mutation.js                     # 7/7 — 원본 통과 + 변이 6종 검출(임시 사본에서만 변경)
node tests/sync_2i_test.js <v1.7.7-r1 폴더>         # 136/136(r1 대조 제외 목록에 jobSince 추가)
SIM_SEED=20261104 node test_runner.js; SIM_SEED=777 node test_runner.js   # 출력 전체가 logs/v178_2bb/tr_*.log 와 동일해야 함(lifeDigest 3527191366 / 1476379107, rngCallDigest 168120683 / 4205704456)
```
- lifeDigest 10구성은 v1.7.8-2bb 값(`logs/v178_2bb/regression_digest_10.log`)과 같아야 함(기록 전용 필드).
- 실행 로그: `logs/v178_jobsince/`(PROVENANCE.txt).

## 11. v1.7.8-2bb-js1-f1(T1-F/F-1 후속 선택·서포터 전직, 결과 변경) 추가 검증
```bash
node tests/followup_pf_test.js                      # 43/43 — 공통 수명주기(phase·가드·중복 클릭·문맥 복원·seq)
node tests/followup_halt_test.js                    # 155/155 — 예외 처리(RB-T10)·진행 정지(HT-1~6)·생애 세대 토큰(HT-7 T1·T2·T3 × 예외 유무)
node tests/f1_joinhard_test.js                      # 56/56 — fallback 제거·후속 화면·C25 문구·T-1 문구·V-1
node tests/f1_transition_test.js                    # 145/145 — 서포터 전직·퇴직금(null 차단·시험용 액수 주입)·R1 롤백·RB-M9·은퇴자 RT·RT-M
node tests/f1_mutation.js                           # 40/40 — 원본 4 + 변이 36(임시 사본, 약 3분)
SIM_SEED=20261104 node test_runner.js; SIM_SEED=777 node test_runner.js   # lifeDigest 1715334118 / 768019484, f1Followup: 줄 위반 0
```
- lifeDigest 10구성은 js1 과 **다름**(결과 변경 단계, 기준 파일 미변경). 값: `logs/v178_f1/digest10_vs_s3.log`.
- 48,000생애 전후 비교: `node logs/v178_f1/tools/run48k.js <게임폴더> <출력폴더>` 를 기준·구현에 각각 실행 후 `compare48k.js <기준출력> <구현출력>`. 결과 `logs/v178_f1/48k_compare.md`.
- 퇴직금 액수는 미결이라 `SEVERANCE_AMOUNT = null`(지급 0). 양수 지급 경로는 테스트가 격리 vm 사본 소스 치환으로만 검사합니다(시험용 값).

