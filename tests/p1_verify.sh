#!/bin/bash
# F1D4A P1 — 전체 검증 실행 스크립트(시험 전용). 게임 코드·F1 기준 파일을 바꾸지 않는다. 로그는 지정한 폴더에만 쓴다.
# 사용: bash tests/p1_verify.sh <출력 폴더>
# 각 항목의 종료 코드를 <출력 폴더>/logs/*.log 끝에 "exit=N" 으로 적고, 하나라도 0 이 아니면 이 스크립트도 0 이 아닌 코드로 끝난다.
# 실행할 항목을 미리 등록해 두고 끝에서 대조한다(tests/lib/verify_run.sh). 판정은 래퍼만 쓰는 상태 기록(<출력 폴더>/status/)으로 하며
# 명령 출력(logs/)은 판정에 쓰지 않는다. 강제 종료되어 상태를 남기지 못한 항목, 시작되지 못한 항목, 상태 기록이 손상된 항목은 실패다.
# 결과를 읽을 때는 스크립트 종료 코드와 logs/99_done.log 의 ALL_DONE 줄을 함께 확인한다(이 스크립트 자체가 강제 종료되면 99_done.log 가 없다).
# 종료 코드: 0 = 전부 성공, 1 = 검증 실패, 3 = 판정에 필요한 기록(I/O) 실패, 2 = 준비 실패. 백그라운드 작업은 vr_bg / vr_wait 로 PID 마다 종료 상태를 모은다.
set -u
OUT=${1:?usage: bash tests/p1_verify.sh <out dir>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 2
. "$ROOT/tests/lib/verify_run.sh"
vr_init "$OUT" || exit 2        # 출력 폴더 검증·잠금 확보. 그 전에는 출력 폴더 아래 어떤 경로도 만들거나 열지 않는다
L="$VR_L"; C="$OUT/compare"
# 비교 결과 폴더는 잠금 확보 뒤에 준비한다: 링크면 거부, 없으면 한 단계만 만든다(-p 없음 — 링크를 따라 만들지 않음), 있으면 링크 아닌 폴더여야 한다.
# 실패하면 기록 실패로 남기고 vr_finish 로 끝낸다(잠금 해제·보고는 기존 종료 계약대로, 종료 코드 3).
if [ -L "$C" ] || { [ ! -e "$C" ] && ! mkdir -- "$C" 2>/dev/null; } || [ -L "$C" ] || [ ! -d "$C" ]; then
    vr_note_ioerr "compare 폴더 준비($C: 링크이거나 폴더가 아니거나 만들지 못함)"
    vr_finish; exit $?
fi
# 이번 실행에서 반드시 끝나야 하는 항목(아래 run 호출과 1:1). 여기 없는 이름으로는 run 할 수 없고, 여기 있는데 기록이 없으면 실패다.
# 10_feat_p5_test = P5 D-FEAT 시험(FD-1·3·5·6). BLOCKED 항목은 통과로 세지 않고 로그에 따로 남는다.
# 10_p4_test = F1D4A P4 시험(F-A dungeonReach · F-A2 이주 선택 · HS-1 · 규칙 D, D-REGION §8.5.5). 추가 항목이며 기존 항목은 바꾸지 않는다.
# 05·06 = F1 역사적 기준(logs/v178_f1, 보존·불변) 대조. 05m·06m = 현재 main 기준선(logs/baseline_main_f63c851) 대조. 서로 섞지 않고 각각 판정한다.
# 05p·06p = P5 기준선(logs/baseline_main_3859123) 대조. 05·06·05m·06m 은 재정의하지 않으며 05p·06p 는 별도 비교 대상으로 독립 판정한다.
vr_expect 01_syntax 02_tr_20261104 03_tr_777 04_digest10_vs_F1 05_f1_byte_compare 05m_main_byte_compare 05p_p5_byte_compare 06_digest10_strict 06m_digest10_strict_main 06p_digest10_strict_p5 07_verify_run_selftest \
    10_followup_pf_test 10_followup_halt_test 10_f1_joinhard_test 10_f1_transition_test 10_god_gone_2ba_test 10_residence_ri_test 10_sync_2i_test 10_jobsince_test 10_recruit_2bb_test 10_feat_p5_test 10_p4_test \
    11_f1_mutation 12_jobsince_mutation 13_recruit_2bb_mutation 14_d3_wiring_mutation \
    20_browser_file 21_browser_inline 30_rng_sites_test 31_rng_timer_test 40_cmp_physical 41_cmp_off 42_cmp_cal_newborn
syntax() { local bad=0; for f in *.js core/*.js tests/*.js tests/lib/*.js; do node --check "$f" || { echo "FAIL $f"; bad=1; }; done; return $bad; }
f1cmp() {   # F1 기록 로그와의 바이트 비교(증빙: 양쪽 SHA-256 과 cmp 결과)
    local bad=0
    for s in 20261104 777; do
        local n=02; [ "$s" = 777 ] && n=03
        echo "seed $s"
        echo "  이번 실행  $(sha256sum < "$L/${n}_tr_$s.log" | cut -d' ' -f1)  logs/${n}_tr_$s.log"
        echo "  F1 기록    $(sha256sum < "logs/v178_f1/tr_$s.log" | cut -d' ' -f1)  (저장소) logs/v178_f1/tr_$s.log"
        if cmp "$L/${n}_tr_$s.log" "logs/v178_f1/tr_$s.log"; then echo "  cmp: 바이트 단위 동일"; else echo "  cmp: 다름"; bad=1; fi
    done
    return $bad
}
MAINB=logs/baseline_main_f63c851
maincmp() {   # 현재 main 기준선(f63c851) 로그와의 바이트 비교(증빙: 양쪽 SHA-256 과 cmp 결과). F1 기록 비교(f1cmp)와 별개
    local bad=0
    for s in 20261104 777; do
        local n=02; [ "$s" = 777 ] && n=03
        echo "seed $s"
        echo "  이번 실행  $(sha256sum < "$L/${n}_tr_$s.log" | cut -d' ' -f1)  logs/${n}_tr_$s.log"
        echo "  main 기준  $(sha256sum < "$MAINB/tr_$s.log" | cut -d' ' -f1)  (저장소) $MAINB/tr_$s.log"
        if cmp "$L/${n}_tr_$s.log" "$MAINB/tr_$s.log"; then echo "  cmp: 바이트 단위 동일"; else echo "  cmp: 다름"; bad=1; fi
    done
    return $bad
}
P5B=logs/baseline_main_3859123
p5cmp() {   # P5 기준선(3859123) 로그와의 바이트 비교(증빙: 양쪽 SHA-256 과 cmp 결과). f1cmp·maincmp 와 별개
    local bad=0
    for s in 20261104 777; do
        local n=02; [ "$s" = 777 ] && n=03
        echo "seed $s"
        echo "  이번 실행  $(sha256sum < "$L/${n}_tr_$s.log" | cut -d' ' -f1)  logs/${n}_tr_$s.log"
        echo "  P5 기준    $(sha256sum < "$P5B/tr_$s.log" | cut -d' ' -f1)  (저장소) $P5B/tr_$s.log"
        if cmp "$L/${n}_tr_$s.log" "$P5B/tr_$s.log"; then echo "  cmp: 바이트 단위 동일"; else echo "  cmp: 다름"; bad=1; fi
    done
    return $bad
}
regress9() { local t; for t in followup_pf_test followup_halt_test f1_joinhard_test f1_transition_test god_gone_2ba_test residence_ri_test sync_2i_test jobsince_test recruit_2bb_test feat_p5_test p4_test; do run 10_$t node tests/$t.js; done; }
mut3() { run 12_jobsince_mutation node tests/jobsince_mutation.js; run 13_recruit_2bb_mutation node tests/recruit_2bb_mutation.js; run 14_d3_wiring_mutation node tests/d3_wiring_mutation.js; }
rngtests() { run 30_rng_sites_test node tests/rng_sites_test.js; run 31_rng_timer_test node tests/rng_timer_test.js lives=20; }
run 01_syntax syntax
run 07_verify_run_selftest bash tests/verify_run_selftest.sh
vr_bg cmp_physical run 40_cmp_physical node tests/rng_sites_compare.js "$C/physical" configs=physical/20261104,physical/777,physical/314159,physical/8675309
vr_bg cmp_off run 41_cmp_off node tests/rng_sites_compare.js "$C/off" configs=off/20261104,off/777,off/314159,off/8675309
vr_bg cmp_cal_newborn run 42_cmp_cal_newborn node tests/rng_sites_compare.js "$C/cal_newborn" configs=calendar/20261104,newborn_parent_familia/20261104
vr_wait
vr_bg tr_20261104 run 02_tr_20261104 env SIM_SEED=20261104 node test_runner.js
vr_bg tr_777 run 03_tr_777 env SIM_SEED=777 node test_runner.js
vr_bg digest10 run 04_digest10_vs_F1 node logs/v178_f1/tools/digest10.js "$ROOT" "$L/04_digest10.json" logs/v178_f1/digest10_vs_s3.json
vr_wait
run 05_f1_byte_compare f1cmp
run 05m_main_byte_compare maincmp
run 05p_p5_byte_compare p5cmp
vr_bg regress9 regress9
vr_bg f1_mutation run 11_f1_mutation node tests/f1_mutation.js
vr_bg mut3 mut3
vr_bg rngtests rngtests
vr_wait
run 20_browser_file node tests/browser_test.js 24
run 21_browser_inline env BROWSER_LOAD=inline node tests/browser_test.js 24
# digest10 도구는 lifeDigest 만 비교하고 종료 코드에 반영하지 않으므로, lifeDigest · rngCallDigest · 종료 코드 · 완주 수 · 불변식을 F1 기록과 직접 대조한다
run 06_digest10_strict node tests/digest10_strict.js "$L/04_digest10.json" logs/v178_f1/digest10_vs_s3.json
# 같은 04 실행 결과를 현재 main 기준선(f63c851)과 엄격 대조(판정 규칙은 06 과 같고 기준 파일만 다름)
run 06m_digest10_strict_main node tests/digest10_strict.js "$L/04_digest10.json" "$MAINB/digest10.json" 'main f63c851 기준'
# 같은 04 실행 결과를 P5 기준선(3859123)과 엄격 대조(판정 규칙은 06·06m 과 같고 기준 파일만 다름)
run 06p_digest10_strict_p5 node tests/digest10_strict.js "$L/04_digest10.json" "$P5B/digest10.json" 'P5 3859123 기준'
vr_finish
exit $?
