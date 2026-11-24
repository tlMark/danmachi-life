# N2-0 기준 검증 요약 (main 406a03b, git archive 사본, 저장소 밖)

실행: bash tests/p1_verify.sh (Node v22.23.4, Chromium 153.0.8010.12, Playwright 1.63.0)

- 01_syntax: exit=0
- 02_tr_20261104: exit=0
- 03_tr_777: exit=0
- 04_digest10_vs_F1: exit=0
- 05_f1_byte_compare: exit=1
- 05m_main_byte_compare: exit=1
- 05p_p5_byte_compare: exit=0
- 06_digest10_strict: exit=1
- 06m_digest10_strict_main: exit=1
- 06p_digest10_strict_p5: exit=0
- 07_verify_run_selftest: exit=0
- 10_f1_joinhard_test: exit=0
- 10_f1_transition_test: exit=0
- 10_feat_p5_test: exit=0
- 10_followup_halt_test: exit=0
- 10_followup_pf_test: exit=0
- 10_god_gone_2ba_test: exit=0
- 10_jobsince_test: exit=0
- 10_recruit_2bb_test: exit=0
- 10_residence_ri_test: exit=0
- 10_sync_2i_test: exit=0
- 11_f1_mutation: exit=0
- 12_jobsince_mutation: exit=0
- 13_recruit_2bb_mutation: exit=0
- 14_d3_wiring_mutation: exit=0
- 20_browser_file: exit=0
- 21_browser_inline: exit=0
- 30_rng_sites_test: exit=0
- 31_rng_timer_test: exit=1
- 40_cmp_physical: exit=0
- 41_cmp_off: exit=0
- 42_cmp_cal_newborn: exit=0
- 99_done: bg:rngtests exit=1

## 실패 항목 해석
- 05·06(F1 역사적 기준), 05m·06m(f63c851 기준): P5 의도적 변경(3859123) 이후 결과가 달라 기대된 불일치. 현재 기준인 05p·06p(baseline_main_3859123)는 통과.
- 31_rng_timer_test: TM-2b 하나만 실패. 원인은 git archive 사본에 .git이 없어 'git show'가 실패한 실행 환경 문제(로그: fatal: not a git repository).
  - 같은 시험을 git 체크아웃(/home/user/danmachi-life, 406a03b, 작업 트리 변경 0)에서 lives=20으로 다시 실행: PASS 22/22, exit=0 (rng_timer_in_repo_l20.log).
- 이후 실행은 .git이 있는 사본(git worktree/clone)에서 한다.
