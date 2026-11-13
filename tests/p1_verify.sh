#!/bin/bash
# F1D4A P1 — 전체 검증 실행 스크립트(시험 전용). 게임 코드·F1 기준 파일을 바꾸지 않는다. 로그는 지정한 폴더에만 쓴다.
# 사용: bash tests/p1_verify.sh <출력 폴더>
# 각 항목의 종료 코드를 <출력 폴더>/logs/*.log 끝에 "exit=N" 으로 적고, 하나라도 0 이 아니면 이 스크립트도 0 이 아닌 코드로 끝난다.
set -u
OUT=${1:?usage: bash tests/p1_verify.sh <out dir>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 2
mkdir -p "$OUT/logs" "$OUT/compare" || exit 2
L="$OUT/logs"; C="$OUT/compare"; FAILS="$OUT/failed_steps.txt"; : > "$FAILS"
run() {   # run <이름> <명령...> : 로그에 출력과 종료 코드를 남기고, 실패하면 FAILS 에 적는다
    local name=$1; shift
    "$@" > "$L/$name.log" 2>&1; local code=$?
    echo "exit=$code" >> "$L/$name.log"
    if [ "$code" -ne 0 ]; then echo "$name exit=$code" >> "$FAILS"; fi
    return $code
}
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
run 01_syntax syntax
( run 40_cmp_physical node tests/rng_sites_compare.js "$C/physical" configs=physical/20261104,physical/777,physical/314159,physical/8675309 ) &
( run 41_cmp_off node tests/rng_sites_compare.js "$C/off" configs=off/20261104,off/777,off/314159,off/8675309 ) &
( run 42_cmp_cal_newborn node tests/rng_sites_compare.js "$C/cal_newborn" configs=calendar/20261104,newborn_parent_familia/20261104 ) &
wait
( run 02_tr_20261104 env SIM_SEED=20261104 node test_runner.js ) &
( run 03_tr_777 env SIM_SEED=777 node test_runner.js ) &
( run 04_digest10_vs_F1 node logs/v178_f1/tools/digest10.js "$ROOT" "$L/04_digest10.json" logs/v178_f1/digest10_vs_s3.json ) &
wait
run 05_f1_byte_compare f1cmp
( for t in followup_pf_test followup_halt_test f1_joinhard_test f1_transition_test god_gone_2ba_test residence_ri_test sync_2i_test jobsince_test recruit_2bb_test; do run 10_$t node tests/$t.js; done ) &
( run 11_f1_mutation node tests/f1_mutation.js ) &
( run 12_jobsince_mutation node tests/jobsince_mutation.js; run 13_recruit_2bb_mutation node tests/recruit_2bb_mutation.js; run 14_d3_wiring_mutation node tests/d3_wiring_mutation.js ) &
( run 30_rng_sites_test node tests/rng_sites_test.js; run 31_rng_timer_test node tests/rng_timer_test.js lives=20 ) &
wait
run 20_browser_file node tests/browser_test.js 24
run 21_browser_inline env BROWSER_LOAD=inline node tests/browser_test.js 24
# digest10 도구는 lifeDigest 만 비교하고 종료 코드에 반영하지 않으므로, lifeDigest · rngCallDigest · 종료 코드 · 완주 수 · 불변식을 F1 기록과 직접 대조한다
run 06_digest10_strict node tests/digest10_strict.js "$L/04_digest10.json" logs/v178_f1/digest10_vs_s3.json
N=$(wc -l < "$FAILS")
if [ "$N" -eq 0 ]; then echo "ALL_DONE: 모든 항목 종료 코드 0" > "$L/99_done.log"; exit 0; fi
{ echo "FAILED_STEPS: $N"; cat "$FAILS"; } > "$L/99_done.log"; cat "$L/99_done.log"; exit 1
