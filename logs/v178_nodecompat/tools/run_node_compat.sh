#!/bin/bash
# 외부 도구(게임 코드 아님): 지정한 Node 실행 파일로 게임 결과·단위 시험·Chromium·측정 사본 시험을 돌리고 G1 기준선(605fdf4)과 대조한다.
# 사용: bash run_node_compat.sh <node bin 폴더> <출력 폴더>   (저장소 루트에서 실행. PATH 맨 앞에 그 node 를 두어 하위 도구의 'node' 도 같은 판을 쓴다)
set -u
NB=$1; OUT=$2; ROOT=$(pwd); mkdir -p "$OUT"; export PATH="$NB:$PATH"
BL=logs/baseline_main_605fdf4
log() { echo "$*" | tee -a "$OUT/summary.txt"; }
: > "$OUT/summary.txt"
log "node $(node --version) ($(command -v node)) · $(uname -sr) · start $(date -u +%FT%TZ)"
step() { local name=$1; shift; "$@" > "$OUT/$name.log" 2>&1; local rc=$?; echo "exit=$rc" >> "$OUT/$name.log"; log "$name exit=$rc"; return $rc; }
# A. 게임 결과(실제 생애): 두 시드 × 3000 바이트 대조, 10구성 digest 엄격 대조
for s in 20261104 777; do
  env SIM_SEED=$s node test_runner.js > "$OUT/tr_$s.log" 2>&1; printf 'exit=%s\n' $? >> "$OUT/tr_$s.log"
  if cmp -s "$OUT/tr_$s.log" "$BL/tr_$s.log"; then log "A tr_$s: G1 기준선과 바이트 동일"; else log "A tr_$s: G1 기준선과 다름 ($(grep '^lifeDigest' "$OUT/tr_$s.log" | tr -s ' '))"; fi
done
step A_digest10 node logs/v178_f1/tools/digest10.js "$ROOT" "$OUT/digest10.json"
step A_digest10_strict node tests/digest10_strict.js "$OUT/digest10.json" "$BL/digest10.json" "G1 605fdf4 기준"
# B. 단위 시험(Mock DOM)
for t in p4_test fsr_g1_test engine_p2_test region_p3_test eventcond_test devabil_test n2_rollback_test followup_pf_test followup_halt_test f1_joinhard_test f1_transition_test god_gone_2ba_test residence_ri_test sync_2i_test jobsince_test recruit_2bb_test feat_p5_test rng_sites_test; do step "B_$t" node tests/$t.js; done
# C. Chromium(실제 브라우저, 같은 Playwright·Chromium; 호스트 node 만 바뀜)
step C_browser_file node tests/browser_test.js 24
step C_browser_inline env BROWSER_LOAD=inline node tests/browser_test.js 24
# D. 측정 사본(GA-INV-2): 정적 검사·음성 변이·고장 주입·비간섭(3000×2)
step D_ast_check node measure/ast_check.js
step D_ast_neg node measure/tests/ast_neg_test.js
step D_meas_fault node measure/tests/meas_fault_test.js "$OUT/meas_fault_work"
step D_meas_noninterf node measure/tests/meas_noninterf.js "$OUT/noninterf_work" 3000 20261104,777
rm -rf "$OUT/meas_fault_work"
log "end $(date -u +%FT%TZ)"
