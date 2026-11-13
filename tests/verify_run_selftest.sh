#!/bin/bash
# F1D4A — tests/lib/verify_run.sh 의 자체 시험(시험 전용). 임시 폴더에서만 동작한다.
# 병렬 항목의 강제 종료·비정상 종료·미실행을 vr_finish 가 실패로 잡는지 확인한다.
# 사용: bash tests/verify_run_selftest.sh    (모든 경우가 기대대로면 종료 코드 0)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
check() {   # check <설명> <기대한 종료 코드> <실제 종료 코드> <failed_steps 에 있어야 할 문자열 또는 ''> <폴더>
    local ok=1
    [ "$2" = "$3" ] || ok=0
    if [ -n "$4" ]; then grep -qF -- "$4" "$5/failed_steps.txt" || ok=0; else [ ! -s "$5/failed_steps.txt" ] || ok=0; fi
    if [ $ok -eq 1 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1  | 종료 코드 $3(기대 $2), failed_steps: $(tr '\n' ';' < "$5/failed_steps.txt")"; fi
}
scenario() {   # scenario <이름> : 새 하위 셸에서 라이브러리를 읽고 본문 함수를 실행, vr_finish 의 종료 코드를 돌려준다
    local name=$1 body=$2 dir="$TMP/$1"
    ( . "$HERE/lib/verify_run.sh"; vr_init "$dir" || exit 99; $body; vr_finish > /dev/null ); return $?
}

s_ok() { vr_expect a b c; run a true; ( run b true ) & ( run c sh -c 'echo hi' ) & wait; }
scenario ok s_ok; check '정상: 순차 1개 + 병렬 2개 모두 성공 → 0' 0 $? '' "$TMP/ok"
grep -q 'ALL_DONE' "$TMP/ok/logs/99_done.log" && { pass=$((pass + 1)); echo "PASS  정상: 99_done.log 에 ALL_DONE 기록"; } || { fail=$((fail + 1)); echo "FAIL  정상: 99_done.log"; }

s_exit3() { vr_expect a b; run a true; ( run b sh -c 'exit 3' ) & wait; }
scenario exit3 s_exit3; check '병렬 항목의 종료 코드 3 → 실패' 1 $? 'b exit=3' "$TMP/exit3"

s_cmdkill() { vr_expect a b; run a true; ( run b sh -c 'kill -9 $$' ) & wait; }
scenario cmdkill s_cmdkill; check '병렬 항목의 명령이 SIGKILL 로 죽음 → exit=137 로 기록되어 실패' 1 $? 'b exit=137' "$TMP/cmdkill"

s_shellkill_before() { vr_expect a b; run a true; ( kill -9 $BASHPID; run b true ) & wait; }
scenario shellkill_before s_shellkill_before; check '병렬 하위 셸이 항목 시작 전에 강제 종료 → 기록 없음으로 실패' 1 $? 'b 기록 없음' "$TMP/shellkill_before"

s_shellkill_mid() { vr_expect a b; run a true; ( run b sh -c 'echo started; kill -9 $PPID; sleep 1' ) & wait; sleep 2; }
scenario shellkill_mid s_shellkill_mid; check '항목 실행 도중 run 을 돌리던 셸이 강제 종료 → 종료 코드 없음으로 실패' 1 $? 'b 종료 코드 없음' "$TMP/shellkill_mid"

s_loopkill() { vr_expect a b c d; run a true; ( for t in b c d; do run $t true; [ $t = b ] && kill -9 $BASHPID; done ) & wait; }
scenario loopkill s_loopkill; check '여러 항목을 도는 하위 셸이 중간에 강제 종료 → 뒤 항목(c, d)이 기록 없음으로 실패' 1 $? 'd 기록 없음' "$TMP/loopkill"
grep -qF 'c 기록 없음' "$TMP/loopkill/failed_steps.txt" && ! grep -q '^b ' "$TMP/loopkill/failed_steps.txt" && { pass=$((pass + 1)); echo "PASS  위 경우: 끝난 항목(b)은 실패가 아니고 c 도 실패로 기록"; } || { fail=$((fail + 1)); echo "FAIL  위 경우의 세부 기록"; }

s_notcalled() { vr_expect a b; run a true; }
scenario notcalled s_notcalled; check '등록했지만 실행되지 않은 항목 → 실패' 1 $? 'b 기록 없음' "$TMP/notcalled"

s_unregistered() { vr_expect a; run a true; run zzz true; }
scenario unregistered s_unregistered; check '등록하지 않은 이름으로 run → 실패' 1 $? 'zzz 등록되지 않은 항목' "$TMP/unregistered"

s_twice() { vr_expect a; run a true; run a true; }
scenario twice s_twice; check '같은 항목을 두 번 실행 → 실패' 1 $? 'a 같은 항목을 두 번 실행' "$TMP/twice"

s_straylog() { vr_expect a; run a true; echo x > "$VR_L/stray.log"; }
scenario straylog s_straylog; check '등록하지 않은 로그 파일이 있음 → 실패' 1 $? 'stray 등록되지 않은 로그' "$TMP/straylog"

s_truncated() { vr_expect a; run a true; sed -i '$d' "$VR_L/a.log"; }
scenario truncated s_truncated; check '로그의 마지막 exit= 줄이 없음(합성) → 실패' 1 $? 'a 종료 코드 없음' "$TMP/truncated"

s_empty() { :; }
scenario empty s_empty; rc=$?; [ $rc -eq 1 ] && { pass=$((pass + 1)); echo "PASS  등록한 항목이 0개 → 성공으로 치지 않음"; } || { fail=$((fail + 1)); echo "FAIL  등록 항목 0개 (종료 코드 $rc)"; }

s_dupexpect() { vr_expect a a; run a true; }
scenario dupexpect s_dupexpect; check '같은 항목을 중복 등록 → 실패' 1 $? 'a 항목이 중복 등록됨' "$TMP/dupexpect"

if [ $fail -eq 0 ]; then echo "RESULT: PASS $pass/$((pass + fail)) (verify_run_selftest)"; exit 0; fi
echo "RESULT: FAIL $pass/$((pass + fail)) (verify_run_selftest)"; exit 1
