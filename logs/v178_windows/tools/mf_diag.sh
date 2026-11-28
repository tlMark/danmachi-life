#!/usr/bin/env bash
# meas_fault_test 의 R0·25n11·K1′·T4·25n10a 최소 재현(게임·시험 코드 아님).
# 사용: mf_diag.sh <저장소 사본 폴더> <작업 폴더> [lfsrc]
#   lfsrc 를 주면 측정 러너가 SHA 를 확인하는 고정 소스 9개(measure/base_f639c05/ 와 measure/measure_src/ 의 같은 9개)만 LF 로 바꾼
#   별도 사본을 만들어 같은 실행을 한다. 나머지(러너·모듈·시험·하네스)는 CRLF 그대로다. 고장 주입 사전 적재 파일은 시험이 LF 로 새로 쓴다.
# 출력: 사례마다 종료 코드·상태 줄·게임 출력 여부·vm 생성 여부·소스 확인 오류 줄.
set -u
REPO=$(cd "$1" && pwd); WORK=$2; mkdir -p "$WORK"
if [ "${3:-}" = lfsrc ]; then
  rm -rf "$WORK/repo_lfsrc"; cp -r "$REPO" "$WORK/repo_lfsrc"; REPO="$WORK/repo_lfsrc"
  for f in data.js events.js core/aging.js core/growth.js core/relations.js core/items.js core/recruit.js core/lineage.js script.js; do for d in measure/base_f639c05 measure/measure_src; do sed -i 's/\r$//' "$REPO/$d/$f"; done; done
fi
# 시험 본체를 한 번 실행해 사전 적재 파일(pre_*.js)을 작업 폴더에 만들고, 전체 결과도 남긴다
node "$REPO/measure/tests/meas_fault_test.js" "$WORK/mf" > "$WORK/meas_fault_full.log" 2>&1; echo "meas_fault_test exit=$? $(grep '^RESULT' "$WORK/meas_fault_full.log")"
P=$WORK/mf
run() { id=$1; shift; pre=(-r "$P/pre_vmspy.js"); for p in "$@"; do pre+=(-r "$P/$p"); done
  SIM_RUNS=3 SIM_SEED=777 SIM_MEAS_REPORT="$WORK/rep_$id.json" node "${pre[@]}" "$REPO/measure/measure_runner.js" > "$WORK/$id.out" 2> "$WORK/$id.err"; rc=$?
  printf '%s exit=%s | %s | game=%s vm=%s | %s\n' "$id" "$rc" "$(grep -a -m1 '^measurement:' "$WORK/$id.err")" \
    "$(grep -q '==== DanMachi Life Simulation Test ====' "$WORK/$id.out" && echo y || echo n)" "$(grep -q VM_CREATED "$WORK/$id.err" && echo y || echo n)" \
    "$(grep -a -m1 'source sha mismatch' "$WORK/$id.err" | cut -c1-90)"; }
rm -f "$WORK"/rep_*.json
run R0; run 25n11 pre_ee_frozen.js; run K1p pre_ee_on_accessor.js; run T4f pre_ee_emit_accessor.js; run 25n10a pre_gopd_once.js
