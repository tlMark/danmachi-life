#!/bin/bash
# F1D4A — tests/lib/verify_run.sh 의 자체 시험(시험 전용). 임시 폴더에서만 동작한다.
# 병렬 항목의 강제 종료·비정상 종료·미실행·종료 상태 위조·동시 중복 실행·기록(I/O) 실패를 vr_finish 가 실패로 잡는지 확인한다.
# 각 경우는 "종료 코드"와 "실패 목록 전체"를 기대값과 **정확히** 대조한다(기대하지 않은 실패가 하나라도 더 있으면 시험 실패).
# 기록 실패는 /dev/full(쓰기 시 ENOSPC)로 모의한다. /dev/full 이 없는 환경에서는 해당 경우를 SKIP 으로 표시하고 종료 코드 4 로 끝난다(통과로 치지 않음).
# 사용: bash tests/verify_run_selftest.sh    (모든 경우가 기대대로면 종료 코드 0)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0; skip=0
ok()   { pass=$((pass + 1)); echo "PASS  $1"; }
bad()  { fail=$((fail + 1)); echo "FAIL  $1"; }
skp()  { skip=$((skip + 1)); echo "SKIP  $1 (미실행: $2)"; }
# 실패 목록 정확 대조: <기대 목록(줄 단위, 빈 문자열 = 실패 없음)> <failed_steps 파일> → 0 이면 정확히 같음
same_list() { diff <(printf '%s' "$1" | grep . | sort -u) <(grep . "$2" | sort -u) > /dev/null; }
check() {   # check <설명> <기대 종료 코드> <실제 종료 코드> <기대 실패 목록> <폴더>
    if [ "$2" = "$3" ] && same_list "$4" "$5/failed_steps.txt"; then ok "$1"
    else bad "$1  | 종료 코드 $3(기대 $2), 실제 실패 목록: $(tr '\n' ';' < "$5/failed_steps.txt" 2>/dev/null) / 기대: $(printf '%s' "$4" | tr '\n' ';')"; fi
}
# 작업 ID(<PID>_<순번>)는 실행마다 달라지므로, 정규화 대조에서는 양쪽 모두 "<ID>" 로 바꿔 비교한다(그 밖의 글자는 정확 대조)
same_list_n() { diff <(printf '%s' "$1" | grep . | sed -E 's/[0-9]+_[0-9]+/<ID>/g' | sort) <(grep . "$2" | sed -E 's/[0-9]+_[0-9]+/<ID>/g' | sort) > /dev/null; }
checkn() {   # check 와 같되 작업 ID 를 정규화해 대조(중복 줄 수까지 대조하도록 sort -u 대신 sort)
    if [ "$2" = "$3" ] && same_list_n "$4" "$5/failed_steps.txt"; then ok "$1"
    else bad "$1  | 종료 코드 $3(기대 $2), 실제 실패 목록: $(tr '\n' ';' < "$5/failed_steps.txt" 2>/dev/null) / 기대: $(printf '%s' "$4" | tr '\n' ';')"; fi
}
no_alldone() { ! grep -q '^ALL_DONE' "$1/logs/99_done.log" 2>/dev/null; }
scenario() {   # scenario <이름> <본문 함수> : 새 하위 셸에서 라이브러리를 읽고 본문을 실행한 뒤 vr_finish 의 종료 코드를 돌려준다
    local dir="$TMP/$1"
    ( . "$HERE/lib/verify_run.sh"; vr_init "$dir" || exit 99; $2; vr_finish > "$dir.finish_out" 2>&1 ); return $?
}
NL=$'\n'
HAVE_FULL=0; [ -c /dev/full ] && ! printf x > /dev/full 2>/dev/null && HAVE_FULL=1

# ── 기본 ────────────────────────────────────────────────────────────────────────────────
s_ok() { vr_expect a b c; run a true; vr_bg B run b true; vr_bg C run c sh -c 'echo hi'; vr_wait; }
scenario ok s_ok; check '정상: 순차 1개 + 백그라운드 2개 모두 성공 → 0, 실패 0' 0 $? '' "$TMP/ok"
grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (3 개 항목)' "$TMP/ok/logs/99_done.log" && ok '정상: 99_done.log 에 ALL_DONE' || bad '정상: 99_done.log'
[ "$(cut -d' ' -f1,3,4 "$TMP/ok/status/b.status")" = "v1 b 0" ] && ok '정상: 상태 기록 형식 "v1 <태그> <이름> <코드>"' || bad '정상: 상태 기록 형식'
[ "$(cat "$TMP/ok/step_status.txt")" = "a 0${NL}b 0${NL}c 0" ] && ok '정상: step_status.txt 에 항목별 검증된 코드' || bad '정상: step_status.txt'

s_exit3() { vr_expect a b; run a true; vr_bg B run b sh -c 'exit 3'; vr_wait; }
scenario exit3 s_exit3; check '백그라운드 항목의 종료 코드 3 → 항목 실패 + 그 코드를 반환한 작업의 실패(D-1)' 1 $? "b exit=3${NL}bg:B exit=3" "$TMP/exit3"

s_cmdkill() { vr_expect a b; run a true; vr_bg B run b sh -c 'kill -9 $$'; vr_wait; }
scenario cmdkill s_cmdkill 2>/dev/null; check '명령이 SIGKILL 로 죽음 → exit=137(항목) + 그 코드를 반환한 작업' 1 $? "b exit=137${NL}bg:B exit=137" "$TMP/cmdkill"

# ── 래퍼(하위 셸)의 강제 종료: 상태 기록 쪽과 백그라운드 종료 상태 쪽, 두 경로로 모두 잡힌다 ───────
s_shellkill_before() { body() { kill -9 $BASHPID; run b true; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario shellkill_before s_shellkill_before 2>/dev/null; check '백그라운드 하위 셸이 항목 시작 전에 강제 종료 → "시작되지 않음" + "bg:B exit=137"' 1 $? "b 시작되지 않음${NL}bg:B exit=137" "$TMP/shellkill_before"

s_shellkill_mid() { vr_expect a b; run a true; vr_bg B run b sh -c 'echo started; kill -9 $PPID; sleep 1'; vr_wait; sleep 2; }
scenario shellkill_mid s_shellkill_mid 2>/dev/null; check '명령 실행 도중 래퍼 셸이 강제 종료 → "시작했으나 상태 기록 없음" + "bg:B exit=137"' 1 $? "b 시작했으나 상태 기록 없음${NL}bg:B exit=137" "$TMP/shellkill_mid"

s_fake0() { vr_expect a b; run a true; vr_bg B run b sh -c 'printf "exit=0\n"; kill -9 "$PPID"'; vr_wait; }
scenario fake0 s_fake0 2>/dev/null; check 'VR-001: 명령이 "exit=0" 을 출력하고 래퍼를 SIGKILL → 성공으로 판정하지 않음' 1 $? "b 시작했으나 상태 기록 없음${NL}bg:B exit=137" "$TMP/fake0"
[ "$(tail -n 1 "$TMP/fake0/logs/b.log")" = "exit=0" ] && ok 'VR-001 확인: 그 로그의 마지막 줄은 실제로 "exit=0"(로그는 판정에 쓰이지 않음)' || bad 'VR-001 확인: 로그 마지막 줄'
s_fake137() { vr_expect a b; run a true; vr_bg B run b sh -c 'printf "exit=137\n"; kill -9 "$PPID"'; vr_wait; }
scenario fake137 s_fake137 2>/dev/null; check 'VR-001: 명령이 "exit=137" 을 출력하고 래퍼를 강제 종료 → 로그 글자에 좌우되지 않음' 1 $? "b 시작했으나 상태 기록 없음${NL}bg:B exit=137" "$TMP/fake137"
s_raw() { vr_expect a b; run a true; ( run b sh -c 'printf "exit=0\n"; kill -9 "$PPID"' ) & wait; }
scenario raw s_raw 2>/dev/null; check 'VR-001: vr_bg 를 쓰지 않은 하위 셸이어도 상태 기록만으로 실패를 잡음' 1 $? 'b 시작했으나 상태 기록 없음' "$TMP/raw"

s_forge() { vr_expect a b; run a true; vr_bg B run b sh -c 'printf "v1 0000 b 0\n" > "$1/b.status"; kill -9 "$PPID"' _ "$VR_ST"; vr_wait; }
scenario forge s_forge 2>/dev/null; check '위조: 명령이 상태 파일에 "v1 <가짜 태그> b 0" 을 쓰고 래퍼를 죽임 → "상태 기록 손상"' 1 $? "b 상태 기록 손상${NL}bg:B exit=137" "$TMP/forge"

s_before_status() { body() { vr_hook_before_status() { kill -9 $BASHPID; }; run b true; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario before_status s_before_status 2>/dev/null; check '명령은 성공했지만 상태 기록 직전에 래퍼가 강제 종료 → 성공 아님' 1 $? "b 시작했으나 상태 기록 없음${NL}bg:B exit=137" "$TMP/before_status"

s_before_commit() { body() { vr_hook_before_commit() { kill -9 $BASHPID; }; run b true; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario before_commit s_before_commit 2>/dev/null; check '임시 상태 파일을 쓴 뒤 rename 직전에 강제 종료 → "미완료 상태 기록" + "상태 기록 없음"' 1 $? "b 미완료 상태 기록${NL}b 시작했으나 상태 기록 없음${NL}bg:B exit=137" "$TMP/before_commit"

s_loopkill() { body() { local t; for t in b c d; do run $t true; [ $t = b ] && kill -9 $BASHPID; done; }; vr_expect a b c d; run a true; vr_bg L body; vr_wait; }
scenario loopkill s_loopkill 2>/dev/null; check '여러 항목을 도는 하위 셸이 중간에 강제 종료 → 끝난 b 는 성공, c · d 미실행, 작업 비정상 종료' 1 $? "c 시작되지 않음${NL}d 시작되지 않음${NL}bg:L exit=137" "$TMP/loopkill"

# ── 백그라운드 작업 종료 상태 수집(D 항목) ───────────────────────────────────────────────
s_bg_one() { cbody() { run c true; kill -9 $BASHPID; }; vr_expect a b c; vr_bg A run a true; vr_bg B run b true; vr_bg C cbody; vr_wait; }
scenario bg_one s_bg_one 2>/dev/null; check 'D: 백그라운드 작업 3개 중 하나만 비정상 종료(항목 상태는 모두 정상) → 그 작업 하나로 실패' 1 $? 'bg:C exit=137' "$TMP/bg_one"
s_bg_viol_lost() { body() { VR_NOTES=/dev/full; run zzz true; }; vr_expect a; run a true; vr_bg V body; vr_wait; }
if [ $HAVE_FULL -eq 1 ]; then scenario bg_viol_lost s_bg_viol_lost; check 'D: 백그라운드에서 _violations.txt 기록이 유실 → 작업 종료 코드 2 + 종료 기록으로 위반과 기록 실패가 각각 판정, 3' 3 $? "bg:V exit=2${NL}zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt" "$TMP/bg_viol_lost"
else skp 'D: 위반 기록 유실' '/dev/full 없음'; fi
s_bg_viol() { vr_expect a; run a true; vr_bg V run zzz true; vr_wait; }
scenario bg_viol s_bg_viol; check '백그라운드 위반(기록 정상) → 기록과 작업 종료 코드 두 경로 모두' 1 $? "zzz 등록되지 않은 항목${NL}bg:V exit=2" "$TMP/bg_viol"
# D-1(8d18369 재검수): 작업 함수의 반환 코드를 부모에 그대로 전달한다
s_bg_rc7() { body() { run b true; return 7; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bg_rc7 s_bg_rc7; check 'D-1: 항목 상태는 모두 0, 백그라운드 작업 함수만 return 7 → "bg:B exit=7", 종료 코드 1' 1 $? 'bg:B exit=7' "$TMP/bg_rc7"
[ "$(cat "$TMP/bg_rc7/step_status.txt")" = "a 0${NL}b 0" ] && ok 'D-1: 그 경우 항목 상태는 실제로 모두 0' || bad 'D-1: 항목 상태'
s_bg_rc0() { body() { run b true; return 0; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bg_rc0 s_bg_rc0; check 'D-1: 작업 함수가 0 을 반환 → 실패 없음, 종료 코드 0' 0 $? '' "$TMP/bg_rc0"
# D-1(f8d28f8 재검수): 작업 함수가 직접 exit 하는 경로도 종료 상태 정책을 통과한다
if [ $HAVE_FULL -eq 1 ]; then
    s_bx_lost() { body() { VR_NOTES=/dev/full; run zzz true; exit 0; }; vr_expect a; run a true; vr_bg V body; vr_wait; }
    scenario bx_lost s_bx_lost; rc=$?; check 'D-1: 백그라운드에서 _violations.txt 기록 실패 + 미등록 위반 + 직접 exit 0 → "bg:V exit=2", 위반·기록 실패 각각, 3' 3 $rc "bg:V exit=2${NL}zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt" "$TMP/bx_lost"
    no_alldone "$TMP/bx_lost" && ok 'D-1: 그 경우 ALL_DONE 없음' || bad 'D-1: ALL_DONE 있음'
    s_bx_trap() { body() { trap ': replaced' EXIT; VR_NOTES=/dev/full; run zzz true; exit 0; }; vr_expect a; run a true; vr_bg V body; vr_wait; }
    scenario bx_trap s_bx_trap; check 'D-1: 작업이 EXIT trap 을 바꾸고 exit 0 → exit 가로채기로 같은 판정' 3 $? "bg:V exit=2${NL}zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt" "$TMP/bx_trap"
    s_bx_builtin() { body() { VR_NOTES=/dev/full; run zzz true; builtin exit 0; }; vr_expect a; run a true; vr_bg V body; vr_wait; }
    scenario bx_builtin s_bx_builtin; check 'D-1: 작업이 builtin exit 0 → EXIT trap 으로 같은 판정' 3 $? "bg:V exit=2${NL}zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt" "$TMP/bx_builtin"
    s_bx_bypass() { body() { trap - EXIT; VR_NOTES=/dev/full; run zzz true; builtin exit 0; }; vr_expect a; run a true; vr_bg V body; vr_wait; }
    scenario bx_bypass s_bx_bypass; check 'D-1: 작업이 trap 으로 EXIT trap 을 지우고 builtin exit 0 → 검증기 trap 은 남아 위반·기록 실패 판정, 3' 3 $? "bg:V exit=2${NL}zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt" "$TMP/bx_bypass"
    s_bx_bypass2() { body() { builtin trap - EXIT; VR_NOTES=/dev/full; run zzz true; builtin exit 0; }; vr_expect a; run a true; vr_bg V body; vr_wait; }
    scenario bx_bypass2 s_bx_bypass2; check 'D-1: builtin trap 으로 지우고 builtin exit 0(의도적 우회) → 종료 코드 0 이어도 "종료 기록 없음"으로 실패' 1 $? 'bg:V 종료 기록 없음' "$TMP/bx_bypass2"
else for n in 'exit 0 + 기록 유실' 'ALL_DONE' 'trap 교체' 'builtin exit' '의도적 우회'; do skp "D-1: $n" '/dev/full 없음'; done; fi
s_bx_ok() { body() { run b true; exit 0; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx_ok s_bx_ok; check 'D-1: 위반 없이 직접 exit 0 → 실패 없음, 0' 0 $? '' "$TMP/bx_ok"
s_bx7() { body() { run b true; exit 7; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx7 s_bx7; check 'D-1: 위반 없이 직접 exit 7 → "bg:B exit=7", 1' 1 $? 'bg:B exit=7' "$TMP/bx7"
s_bx_noarg() { body() { run b true; false; exit; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx_noarg s_bx_noarg; check 'D-1: 인자 없는 exit(직전 코드 1) → "bg:B exit=1"' 1 $? 'bg:B exit=1' "$TMP/bx_noarg"
s_bx_badflag() { body() { run b true; VR_VIOLATED=abc; exit 0; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx_badflag s_bx_badflag; check 'D-1: 위반 플래그가 숫자가 아님(검사 오류) → 성공 쪽으로 빠지지 않고 2' 1 $? 'bg:B exit=2' "$TMP/bx_badflag"
s_bx_badcode() { body() { run b true; exit abc; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx_badcode s_bx_badcode 2>/dev/null; check 'D-1: 숫자가 아닌 exit 인자 → 2' 1 $? 'bg:B exit=2' "$TMP/bx_badcode"
s_bx_twice() { body() { run b true; trap 'exit 0' EXIT; exit 5; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx_twice s_bx_twice; check 'D-1: 작업의 EXIT trap 이 다시 exit 0 을 부름(재진입) → 처음 정한 코드 5 유지' 1 $? 'bg:B exit=5' "$TMP/bx_twice"
s_bx_norec() { body() { VR_BGREC=/nonexistent_vr_dir; run b true; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario bx_norec s_bx_norec; check 'D-1: 종료 기록을 쓰지 못함 → 2 + "종료 기록 없음"' 1 $? "bg:B exit=2${NL}bg:B 종료 기록 없음" "$TMP/bx_norec"
s_bx_forge() { body() { builtin trap - EXIT; printf 'v1 0000 x\n' > "$VR_BGREC/$vr__bg_id"; builtin exit 0; }; vr_expect a; run a true; vr_bg F body; vr_wait; }
scenario bx_forge s_bx_forge; check 'D-1: 작업이 가짜 종료 기록을 쓰고 우회 종료 → "종료 기록 손상"' 1 $? 'bg:F 종료 기록 손상' "$TMP/bx_forge"
s_nowait() { vr_expect a b; run a true; vr_bg B run b sh -c 'sleep 1'; }
scenario nowait s_nowait; check 'vr_wait 를 부르지 않아도 vr_finish 가 남은 작업을 기다려 판정' 0 $? '' "$TMP/nowait"

# ── 기록(I/O) 실패(D 항목). 종료 코드 3, ALL_DONE 없음 ──────────────────────────────────
if [ $HAVE_FULL -eq 1 ]; then
    s_fails_w() { vr_expect a b; run a true; run b sh -c 'exit 3'; VR_FAILS=/dev/full; }
    scenario fails_w s_fails_w; rc=$?
    { [ $rc -eq 3 ] && no_alldone "$TMP/fails_w" && grep -qx 'b exit=3' "$TMP/fails_w/logs/99_done.log" && grep -qx '기록 실패: failed_steps.txt' "$TMP/fails_w/logs/99_done.log"; } && ok 'D: failed_steps.txt 쓰기 실패(실제 실패 있음) → 종료 코드 3, 99_done.log 에 실패와 기록 실패' || bad "D: failed_steps.txt 쓰기 실패 (rc=$rc)"
    s_fails_w0() { vr_expect a; run a true; VR_FAILS=/dev/full; }
    scenario fails_w0 s_fails_w0; rc=$?
    { [ $rc -eq 3 ] && no_alldone "$TMP/fails_w0" && grep -qx '기록 실패: failed_steps.txt' "$TMP/fails_w0/logs/99_done.log"; } && ok 'D: failed_steps.txt 쓰기 실패(실제 실패 없음) → 성공 아님(3), ALL_DONE 없음' || bad "D: failed_steps.txt 쓰기 실패, 실패 없음 (rc=$rc)"
    s_notes_w() { vr_expect a; run a true; VR_NOTES=/dev/full; run zzz true; }
    scenario notes_w s_notes_w; check 'D: _violations.txt 쓰기 실패(앞 셸) → 위반은 메모리로 기록, 기록 실패로 종료 코드 3' 3 $? "zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt" "$TMP/notes_w"
    s_steps_w() { vr_expect a; run a true; VR_STEPS=/dev/full; }
    scenario steps_w s_steps_w; check 'D: step_status.txt 쓰기 실패 → 성공 아님(3)' 3 $? '기록 실패: step_status.txt' "$TMP/steps_w"
    s_done_w() { vr_expect a; run a true; VR_DONE=/dev/full; }
    scenario done_w s_done_w; rc=$?
    { [ $rc -eq 3 ] && [ ! -s "$TMP/done_w/failed_steps.txt" ] && grep -q '99_done.log' "$TMP/done_w.finish_out"; } && ok 'D: 99_done.log 에 ALL_DONE 을 쓰지 못함 → 성공 아님(3)' || bad "D: 99_done.log 쓰기 실패 (rc=$rc)"
    s_done_wf() { vr_expect a b; run a true; run b sh -c 'exit 3'; VR_DONE=/dev/full; }
    scenario done_wf s_done_wf; rc=$?; [ $rc -eq 3 ] && ok 'D: 실패가 있고 99_done.log 도 못 씀 → 3' || bad "D: 실패 + 99_done.log 쓰기 실패 (rc=$rc)"
    s_exp_w() { VR_EXPECTED=/dev/full; vr_expect a; run a true; }
    scenario exp_w s_exp_w; check 'D: expected_steps.txt 쓰기 실패 → 성공 아님(3)' 3 $? '기록 실패: expected_steps.txt' "$TMP/exp_w"
    s_status_w() { body() { VR_ST_SAVE=$VR_ST; vr_hook_before_status() { ln -sf /dev/full "$VR_ST_SAVE/b.status.tmp.$BASHPID"; }; run b true; }; vr_expect a b; run a true; vr_bg B body; vr_wait; rm -f "$VR_ST"/b.status.tmp.*; }
    scenario status_w s_status_w; check 'D: 상태 임시 파일 쓰기 실패 → 상태 없음 + 작업 종료 코드 2 + 하위 셸의 기록 실패, 3' 3 $? "b 시작했으나 상태 기록 없음${NL}bg:B exit=2${NL}기록 실패: b 상태 임시 파일" "$TMP/status_w"
else for n in failed_steps 'failed_steps(실패 없음)' _violations step_status 99_done '99_done(실패 있음)' expected_steps status_tmp; do skp "D: $n 쓰기 실패" '/dev/full 없음'; done; fi
s_sort() { vr_expect a b; run a true; run b sh -c 'exit 3'; sort() { return 1; }; }
scenario sort_fail s_sort; check 'D: sort 실패 → 정렬 없이 실패 목록을 쓰고 기록 실패로 3' 3 $? "b exit=3${NL}기록 실패: sort" "$TMP/sort_fail"
s_sort_empty() { vr_expect a b; run a true; run b sh -c 'exit 3'; sort() { cat > /dev/null; return 0; }; }
scenario sort_empty s_sort_empty; check 'D: sort 가 성공 코드로 빈 결과를 냄 → 결과 수 불일치로 3' 3 $? "b exit=3${NL}기록 실패: sort 결과 불일치" "$TMP/sort_empty"

# D-2(8d18369 재검수): sort 결과가 원래 실패 목록과 같은 집합인지(중복·누락·추가). 원래 목록 = "a exit=3", "b exit=3"
s_sort_base() { vr_expect a b c; run a sh -c 'exit 3'; run b sh -c 'exit 3'; run c true; }
s_sort_aa()   { s_sort_base; sort() { cat > /dev/null; printf '%s\n' 'a exit=3' 'a exit=3'; }; }
s_sort_ba()   { s_sort_base; sort() { cat > /dev/null; printf '%s\n' 'b exit=3' 'a exit=3'; }; }
s_sort_none() { s_sort_base; sort() { cat > /dev/null; }; }
s_sort_abc()  { s_sort_base; sort() { cat > /dev/null; printf '%s\n' 'a exit=3' 'b exit=3' 'c exit=9'; }; }
scenario sort_aa s_sort_aa;     check 'D-2: 원본 a,b / 출력 a,a(중복 + 누락, 개수는 같음) → 불일치, 3' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 결과 불일치" "$TMP/sort_aa"
scenario sort_ba s_sort_ba;     check 'D-2: 원본 a,b / 출력 b,a → 일치, 기록 실패 없음(1)' 1 $? "a exit=3${NL}b exit=3" "$TMP/sort_ba"
[ "$(cat "$TMP/sort_ba/failed_steps.txt")" = "b exit=3${NL}a exit=3" ] && ok 'D-2: 일치하면 sort 의 출력 순서를 그대로 씀' || bad 'D-2: sort 출력 순서'
scenario sort_none s_sort_none; check 'D-2: 원본 a,b / 출력 빈 결과 → 불일치, 3' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 결과 불일치" "$TMP/sort_none"
s_sort_ab()   { s_sort_base; }
s_sort_trail(){ s_sort_base; sort() { cat > /dev/null; printf '%s\n' 'a exit=3' 'b exit=3' ''; }; }
scenario sort_ab s_sort_ab;       check 'D-2: 원본 a,b / 실제 sort 결과 a,b → 일치(1)' 1 $? "a exit=3${NL}b exit=3" "$TMP/sort_ab"
scenario sort_trail s_sort_trail; check 'D-2: 원본 a,b / 출력 a,b 뒤에 빈 줄 → 불일치, 3' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 결과 불일치" "$TMP/sort_trail"
s_sort_tmpc() { s_sort_base; VR_SORT_TMP=/nonexistent_vr_dir/x; }
scenario sort_tmpc s_sort_tmpc; check 'D-2: sort 임시 파일 생성 실패 → 원래 목록 + 기록 실패, 3' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 임시 파일 생성" "$TMP/sort_tmpc"
s_sort_tmpr() { s_sort_base; vr_hook_sort_after_write() { rm -f "$1"; }; }
scenario sort_tmpr s_sort_tmpr; check 'D-2: sort 임시 파일 읽기 실패 → 원래 목록 + 기록 실패, 3' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 임시 파일 읽기" "$TMP/sort_tmpr"
s_sort_tmpx() { s_sort_base; vr_hook_sort_before_cleanup() { rm -f "$1"; mkdir "$1"; }; }
scenario sort_tmpx s_sort_tmpx; check 'D-2: sort 임시 파일 정리 실패 → 기록 실패, 3' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 임시 파일 정리" "$TMP/sort_tmpx"
[ -z "$(ls -A "$TMP/sort_ab" | grep '^\.sort_out')" ] && ok 'D-2: 정상 경우 sort 임시 파일이 남지 않음' || bad 'D-2: sort 임시 파일 잔존'
scenario sort_abc s_sort_abc;   check 'D-2: 원본 a,b / 출력 a,b,c(추가) → 불일치, 3(추가 항목은 쓰지 않음)' 3 $? "a exit=3${NL}b exit=3${NL}기록 실패: sort 결과 불일치" "$TMP/sort_abc"

# D-3(8d18369 재검수): vr__write_verified 의 읽기 실패. cat 을 함수로 바꿔 지정한 일반 파일의 읽기만 실패시킨다(모의).
wv() {   # wv <내용> <읽기 실패 주입 0|1> → vr__write_verified 의 반환 코드
    ( . "$HERE/lib/verify_run.sh"; f="$TMP/wv_file"; rm -f "$f"
      [ "$2" = 1 ] && cat() { [ "$1" = "$TMP/wv_file" ] && return 1; command cat "$@"; }
      vr__write_verified "$f" "$1" ); }
wv '' 0;        [ $? -eq 0 ] && ok 'D-3: 정상 빈 파일 쓰기·읽기 → 0' || bad 'D-3: 정상 빈 파일'
wv "abc${NL}" 0; [ $? -eq 0 ] && ok 'D-3: 정상 비어 있지 않은 파일 쓰기·읽기 → 0' || bad 'D-3: 정상 비어 있지 않은 파일'
wv '' 1;        [ $? -eq 1 ] && ok 'D-3: 빈 문자열을 쓴 뒤 읽기 실패 → 1(빈 내용으로 오인하지 않음)' || bad 'D-3: 빈 문자열 + 읽기 실패'
wv "abc${NL}" 1; [ $? -eq 1 ] && ok 'D-3: 비어 있지 않은 내용을 쓴 뒤 읽기 실패 → 1' || bad 'D-3: 비어 있지 않은 내용 + 읽기 실패'
[ -f "$TMP/wv_file" ] && ok 'D-3: 주입 대상은 실제 일반 파일(쓰기는 성공)' || bad 'D-3: 주입 대상 파일'
s_fails_r0() { vr_expect a; run a true; cat() { [ "$1" = "$VR_FAILS" ] && return 1; command cat "$@"; }; }
scenario fails_r0 s_fails_r0; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/fails_r0" && [ "$(cat "$TMP/fails_r0/logs/99_done.log" | tail -n +2)" = '기록 실패: failed_steps.txt' ]; } && ok 'D-3: 실패 없음(빈 failed_steps.txt)인데 그 파일 읽기 실패 → 3, ALL_DONE 없음, 사유는 기록 실패 1건' || bad "D-3: failed_steps.txt 읽기 실패 (rc=$rc)"
s_steps_r() { vr_expect a; run a true; cat() { [ "$1" = "$VR_STEPS" ] && return 1; command cat "$@"; }; }
scenario steps_r s_steps_r; check 'D-3: step_status.txt 읽기 실패 → 기록 실패, 3' 3 $? '기록 실패: step_status.txt' "$TMP/steps_r"
s_done_r() { vr_expect a; run a true; cat() { [ "$1" = "$VR_DONE" ] && return 1; command cat "$@"; }; }
scenario done_r s_done_r; rc=$?
{ [ $rc -eq 3 ] && [ ! -s "$TMP/done_r/failed_steps.txt" ] && grep -q '99_done.log' "$TMP/done_r.finish_out"; } && ok 'D-3: 99_done.log 에 ALL_DONE 을 썼지만 다시 읽지 못함 → 성공 아님(3)' || bad "D-3: 99_done.log 읽기 실패 (rc=$rc)"

# ── 중첩 vr_bg(NESTED-1·2) ─────────────────────────────────────────────────────────────
n_in6() { run b true; exit 6; }
s_n_wait6() { outer() { vr_bg IN n_in6; vr_wait; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario n_wait6 s_n_wait6; check 'NESTED: 바깥이 기다린 안쪽 작업이 exit 6 → 경로 이름으로 최상위까지 전달' 1 $? "bg:OUT/IN exit=6${NL}bg:OUT exit=2" "$TMP/n_wait6"
s_n_nowait6() { outer() { vr_bg IN n_in6; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario n_nowait6 s_n_nowait6; check 'NESTED: 바깥이 vr_wait 없이 반환 → 종료 처리에서 회수해 같은 판정' 1 $? "bg:OUT/IN exit=6${NL}bg:OUT exit=2" "$TMP/n_nowait6"
s_n_viol() { outer() { vr_bg IN run zzz true; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario n_viol s_n_viol; check 'NESTED: 안쪽 작업의 미등록 위반 → 위반 + 두 단계의 bg 실패' 1 $? "zzz 등록되지 않은 항목${NL}bg:OUT/IN exit=2${NL}bg:OUT exit=2" "$TMP/n_viol"
if [ $HAVE_FULL -eq 1 ]; then
    s_n_io() { inner() { VR_NOTES=/dev/full; run zzz true; }; outer() { vr_bg IN inner; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
    scenario n_io s_n_io; check 'NESTED: 안쪽 작업의 기록 실패 → 위반과 기록 실패를 구분해 최상위까지, 3' 3 $? "zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt${NL}bg:OUT/IN exit=2${NL}bg:OUT exit=2" "$TMP/n_io"
else skp 'NESTED: 안쪽 작업의 기록 실패' '/dev/full 없음'; fi
s_n3() { na() { vr_bg B nb; }; nb() { vr_bg C nc; }; nc() { run c true; exit 5; }; vr_expect a c; run a true; vr_bg A na; vr_wait; }
scenario n3 s_n3; check 'NESTED: 3단계(A/B/C), 가장 안쪽이 exit 5 → 세 단계 모두' 1 $? "bg:A/B/C exit=5${NL}bg:A/B exit=2${NL}bg:A exit=2" "$TMP/n3"
s_n_sib() { outer() { vr_bg IN1 run b sh -c 'exit 3'; vr_bg IN2 run zzz true; vr_bg IN3 run c true; }; four() { run d true; return 4; }
            vr_expect a b c d; run a true; vr_bg OUT outer; vr_bg OUT2 four; vr_wait; }
scenario n_sib s_n_sib; check 'NESTED: 형제 작업들의 서로 다른 실패(종료 코드 3 / 위반 / 정상) + 최상위 형제 return 4' 1 $? "b exit=3${NL}bg:OUT/IN1 exit=3${NL}zzz 등록되지 않은 항목${NL}bg:OUT/IN2 exit=2${NL}bg:OUT exit=2${NL}bg:OUT2 exit=4" "$TMP/n_sib"
s_n_kill() { inner() { run b true; kill -9 $BASHPID; }; outer() { vr_bg IN inner; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario n_kill s_n_kill 2>/dev/null; check 'NESTED: 안쪽 작업 강제 종료 → "bg:OUT/IN exit=137"(종료 기록 없음은 덧붙이지 않음)' 1 $? "bg:OUT/IN exit=137${NL}bg:OUT exit=2" "$TMP/n_kill"
s_n_rd() { outer() { vr_hook_bg_before_read() { rm -f "$1"; mkdir "$1"; }; vr_bg IN run b true; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario n_rd s_n_rd; checkn 'NESTED: 바깥 작업이 안쪽의 종료 기록을 읽지 못함(기록 자리에 디렉터리) → 기록 실패로 최상위까지 + 남은 디렉터리는 예상하지 못한 항목, 3' 3 $? "기록 실패: bg:OUT/IN 종료 기록 읽기${NL}기록 실패: bg:OUT/IN 회수 표시${NL}bg:OUT exit=2${NL}bg 폴더에 예상하지 못한 항목: <ID>" "$TMP/n_rd"
s_top_rd() { vr_hook_bg_before_read() { rm -f "$1"; mkdir "$1"; }; vr_expect a b; run a true; vr_bg B run b true; vr_wait; }
scenario top_rd s_top_rd; checkn 'NESTED: 최상위가 종료 기록을 읽지 못함(기록 자리에 디렉터리) → 기록 실패 + 예상하지 못한 항목, 3' 3 $? "기록 실패: bg:B 종료 기록 읽기${NL}기록 실패: bg:B 회수 표시${NL}bg 폴더에 예상하지 못한 항목: <ID>" "$TMP/top_rd"
s_n_ok() { na() { vr_bg B nb; vr_bg B2 run d true; }; nb() { vr_bg C run c true; }
           vr_expect a b c d; run a true; vr_bg A na; vr_bg T run b true; printf '%s\n' "${#VR_BG_PIDS[@]}" > "$TMP/n_ok_pids"; vr_wait; }
scenario n_ok s_n_ok; check 'NESTED: 2·3단계 중첩이 모두 정상 → 실패 없음, 0' 0 $? '' "$TMP/n_ok"
{ [ "$(cat "$TMP/n_ok_pids")" = 2 ] && [ "$(ls -A "$TMP/n_ok/bg" | grep -c '\.read$')" = 5 ] && [ "$(ls -A "$TMP/n_ok/bg" | grep -c '\.done$')" = 5 ] && [ "$(ls -A "$TMP/n_ok/bg" | grep -vc '\.\(read\|done\)$')" = 0 ]; } \
  && ok 'NESTED: 최상위 목록에는 직접 자식 2개만, 작업 5개의 종료 기록(.read)과 실행 표식(.done)이 모두 한 번씩 처리됨(중복 회수 없음)' || bad "NESTED: 회수 상태 (pids=$(cat "$TMP/n_ok_pids"), $(ls -A "$TMP/n_ok/bg" | tr '\n' ' '))"
s_n_stray() { vr_expect a; run a true; echo x > "$VR_BGREC/fake"; echo x > "$VR_BGREC/x.tmp"; }
scenario n_stray s_n_stray; check 'NESTED: 회수되지 않은 종료 기록·임시 파일 → "bg 종료 기록 미회수"' 1 $? "bg 종료 기록 미회수: fake${NL}bg 종료 기록 미회수: x.tmp" "$TMP/n_stray"
s_n_reent() { outer() { vr_bg IN run b true; trap 'exit 0' EXIT; exit 4; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario n_reent s_n_reent; check 'NESTED: 자식이 있는 작업이 trap 으로 다시 exit 0 → 처음 코드 4 유지, 자식은 한 번만 회수' 1 $? 'bg:OUT exit=4' "$TMP/n_reent"
s_n_reent2() { outer() { vr_hook_bg_before_read() { exit 9; }; vr_bg IN run b true; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario n_reent2 s_n_reent2; check 'NESTED: 자식 1개, 회수 도중 exit 로 재진입 → 남은 회수를 이어서 하고 "회수 중 재진입" + 2' 1 $? "bg:OUT/IN 회수 중 재진입${NL}bg:OUT exit=2" "$TMP/n_reent2"

# ── 회수 도중 재진입 + 늦게 끝나는 형제(RE-1), 판정 뒤에 생기는 후손 기록(RE-2), 회수 표시 충돌(RE-3) ─────────
# 공통: 바깥 OUT 이 형제 자식을 만들고, 첫 번째 자식의 기록을 읽기 직전 exit 0 으로 재진입한다.
re_hook() { vr_hook_bg_before_read() { exit 0; }; }
re_bg_dir_ok() { [ -z "$(ls -A "$1/bg" | grep -v '\.\(read\|done\)$')" ]; }   # 모든 기록·표식이 처리됨
for d in 0 3; do
    eval "s_re2_$d() { outer() { re_hook; vr_bg IN1 run b true; vr_bg IN2 bash -c 'sleep $d; exit 5'; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }"
    scenario re2_$d s_re2_$d; check "RE-1: 형제 2개, 첫 번째 회수 직전 exit 0 재진입, 두 번째는 ${d}초 뒤 exit 5 → 두 번째까지 회수, 부모 2" 1 $? "bg:OUT/IN1 회수 중 재진입${NL}bg:OUT/IN2 exit=5${NL}bg:OUT exit=2" "$TMP/re2_$d"
    re_bg_dir_ok "$TMP/re2_$d" && ok "RE-1: 지연 ${d}초 — 판정 시점에 모든 기록·표식 처리 완료(미회수 0)" || bad "RE-1: 지연 ${d}초 — bg: $(ls -A "$TMP/re2_$d/bg" | tr '\n' ' ')"
done
s_re3() { outer() { re_hook; vr_bg IN1 run b true; vr_bg IN2 run c sh -c 'exit 3'; vr_bg IN3 bash -c 'sleep 1; exit 4'; vr_bg IN4 run d true; }; vr_expect a b c d; run a true; vr_bg OUT outer; vr_wait; }
scenario re3 s_re3; check 'RE-1: 형제 4개, 첫 번째 회수 중 재진입 → 나머지 3개(종료 코드 3 / 지연 exit 4 / 정상) 모두 회수' 1 $? "bg:OUT/IN1 회수 중 재진입${NL}c exit=3${NL}bg:OUT/IN2 exit=3${NL}bg:OUT/IN3 exit=4${NL}bg:OUT exit=2" "$TMP/re3"
re_bg_dir_ok "$TMP/re3" && ok 'RE-1: 형제 4개 — 미회수 0' || bad "RE-1: 형제 4개 — bg: $(ls -A "$TMP/re3/bg" | tr '\n' ' ')"
s_re_viol() { outer() { re_hook; vr_bg IN1 run b true; vr_bg IN2 slow_viol; }; slow_viol() { sleep 1; run zzz true; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario re_viol s_re_viol; check 'RE-1: 늦게 끝나는 자식의 위반 → 위반 원문까지 전달' 1 $? "bg:OUT/IN1 회수 중 재진입${NL}zzz 등록되지 않은 항목${NL}bg:OUT/IN2 exit=2${NL}bg:OUT exit=2" "$TMP/re_viol"
if [ $HAVE_FULL -eq 1 ]; then
    s_re_io() { outer() { re_hook; vr_bg IN1 run b true; vr_bg IN2 slow_io; }; slow_io() { sleep 1; VR_NOTES=/dev/full; run zzz true; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
    scenario re_io s_re_io; check 'RE-1: 늦게 끝나는 자식의 기록 실패 → 위반과 기록 실패를 각각, 3' 3 $? "bg:OUT/IN1 회수 중 재진입${NL}zzz 등록되지 않은 항목${NL}기록 실패: _violations.txt${NL}bg:OUT/IN2 exit=2${NL}bg:OUT exit=2" "$TMP/re_io"
else skp 'RE-1: 늦게 끝나는 자식의 기록 실패' '/dev/full 없음'; fi
s_re_deep() { outer() { vr_bg IN1 run b true; vr_bg IN2 mid; re_hook; };   # 주입 함수는 자식을 만든 뒤 정의(손자 셸에 상속되지 않게)
              mid() { vr_bg X bash -c 'sleep 1; exit 6'; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
scenario re_deep s_re_deep; check 'RE-1: 늦게 끝나는 형제가 자기 자식(손자)을 가짐 → 손자 실패까지 전달' 1 $? "bg:OUT/IN1 회수 중 재진입${NL}bg:OUT/IN2/X exit=6${NL}bg:OUT/IN2 exit=2${NL}bg:OUT exit=2" "$TMP/re_deep"
# RE-2: 부모가 강제 종료돼 고아가 된 후손. 최상위 vr_finish 가 그 후손이 끝날 때까지 기다려 기록을 흡수해야 한다.
s_orph() { outer() { vr_bg IN bash -c 'sleep 2; exit 5'; kill -9 $BASHPID; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario orph s_orph 2>/dev/null; checkn 'RE-2: 부모가 죽은 뒤 2초 뒤에 끝나는 후손의 exit 5 → 최상위 판정에 반영 + 미회수' 1 $? "bg:OUT exit=137${NL}bg:OUT/IN exit=5${NL}bg 종료 기록 미회수: <ID>" "$TMP/orph"
re_bg_dir_ok "$TMP/orph" && ok 'RE-2: 판정 뒤에 늦게 생기는 기록 없음(판정 시점에 모두 처리)' || bad "RE-2: bg: $(ls -A "$TMP/orph/bg" | tr '\n' ' ')"
s_orph_v() { outer() { vr_bg IN slowv; kill -9 $BASHPID; }; slowv() { sleep 1; run zzz true; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario orph_v s_orph_v 2>/dev/null; checkn 'RE-2: 고아 후손의 위반 → 위반 원문까지 반영' 1 $? "bg:OUT exit=137${NL}zzz 등록되지 않은 항목${NL}bg:OUT/IN exit=2${NL}bg 종료 기록 미회수: <ID>" "$TMP/orph_v"
s_orph_k() { outer() { vr_bg IN selfkill; kill -9 $BASHPID; }; selfkill() { sleep 1; kill -9 $BASHPID; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario orph_k s_orph_k 2>/dev/null; checkn 'RE-2: 고아 후손이 기록 없이 강제 종료 → "종료 기록 없음(회수되지 않은 작업)"' 1 $? "bg:OUT exit=137${NL}bg 종료 기록 없음(회수되지 않은 작업): <ID>" "$TMP/orph_k"
# RE-3: 회수 표시(.read) 목적 경로가 이미 있음 — 일반 파일 / 디렉터리 / 중첩 디렉터리
for kind in file dir nested; do
    eval "s_rd_$kind() { local id=\"\${BASHPID}_\$((VR_BG_SEQ + 1))\" t; t=\"\$VR_BGREC/\$id.read\"
        case $kind in file) : > \"\$t\" ;; dir) mkdir \"\$t\" ;; nested) mkdir -p \"\$t/sub/deep\"; : > \"\$t/sub/deep/x\" ;; esac
        vr_expect a b; run a true; vr_bg B run b true; vr_wait; }"
done
scenario rd_file s_rd_file;     checkn 'RE-3: .read 목적 경로에 일반 파일이 이미 있음 → 회수 표시 실패 + 원래 기록은 미회수, 3' 3 $? "기록 실패: bg:B 회수 표시 대상이 이미 있음${NL}bg 종료 기록 미회수: <ID>" "$TMP/rd_file"
scenario rd_dir s_rd_dir;       checkn 'RE-3: .read 목적 경로에 디렉터리가 이미 있음 → 기록을 그 안으로 옮기지 않음 + 예상하지 못한 항목, 3' 3 $? "기록 실패: bg:B 회수 표시 대상이 이미 있음${NL}bg 종료 기록 미회수: <ID>${NL}bg 폴더에 예상하지 못한 항목: <ID>.read" "$TMP/rd_dir"
scenario rd_nested s_rd_nested; checkn 'RE-3: .read 목적 경로에 중첩 디렉터리가 이미 있음 → 같은 판정' 3 $? "기록 실패: bg:B 회수 표시 대상이 이미 있음${NL}bg 종료 기록 미회수: <ID>${NL}bg 폴더에 예상하지 못한 항목: <ID>.read" "$TMP/rd_nested"
s_rd_extra() { vr_expect a; run a true; mkdir -p "$VR_BGREC/zz.done/sub"; }
scenario rd_extra s_rd_extra; check 'RE-3: 이름이 .done 이어도 디렉터리면 예상하지 못한 항목(하위 경로를 성공으로 보지 않음)' 1 $? 'bg 폴더에 예상하지 못한 항목: zz.done' "$TMP/rd_extra"
s_rec_code() { body() { run b true; builtin trap - EXIT; local id=$vr__bg_id; printf 'v1 %s %s\nL B\nC 0\n' "$(vr_tag "bg:$id")" "$id" > "$VR_BGREC/$id"; builtin exit 4; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario rec_code s_rec_code; check 'RE: 종료 기록의 C(0)가 실제 종료 코드(4)와 다름 → 종료 기록 손상' 1 $? "bg:B exit=4${NL}bg:B 종료 기록 손상" "$TMP/rec_code"

# ── 종료 경로 전체(D-1 재반려: trap 'exit 0' EXIT; builtin exit 5 가 성공으로 바뀌던 결함) ──────────────────
# 모든 경우: vr_expect a b; run a true; 백그라운드 작업 B 가 run b true 뒤에 아래 방식으로 끝난다.
ex_case() {   # ex_case <이름> <설명> <기대 종료 코드> <기대 실패 목록> <작업 본문(run b true 뒤에 실행)>
    eval "s_ex_$1() { body() { run b true; $5; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }"
    scenario "ex_$1" "s_ex_$1" 2>/dev/null; local rc=$?
    check "EXIT: $2" "$3" "$rc" "$4" "$TMP/ex_$1"
    [ "$3" = 0 ] || { no_alldone "$TMP/ex_$1" && ok "EXIT: $2 — ALL_DONE 없음" || bad "EXIT: $2 — ALL_DONE 있음"; }
}
ex_case ret0     '일반 반환'                                         0 ''                          ':'
ex_case ret4     'return 4'                                         1 'bg:B exit=4'               'return 4'
ex_case fexit6   '함수 안의 exit 6'                                  1 'bg:B exit=6'               'f() { exit 6; }; f'
ex_case noarg    '인자 없는 exit(직전 1)'                             1 'bg:B exit=1'               'false; exit'
ex_case bexit6   'builtin exit 6'                                   1 'bg:B exit=6'               'builtin exit 6'
ex_case repl6    'EXIT trap 교체 후 builtin exit 6'                   1 'bg:B exit=6'               "trap ': x' EXIT; builtin exit 6"
ex_case rm6      'EXIT trap 제거(trap -) 후 builtin exit 6'           1 'bg:B exit=6'               'trap - EXIT; builtin exit 6'
ex_case brm6     'builtin trap 으로 제거 후 builtin exit 6'           1 "bg:B exit=6${NL}bg:B 종료 기록 없음" 'builtin trap - EXIT; builtin exit 6'
ex_case tx0e5    "처리기 안에서 exit 0, 작업은 exit 5"                1 'bg:B exit=5'               "trap 'exit 0' EXIT; exit 5"
ex_case tbx0e5   "처리기 안에서 builtin exit 0, 작업은 exit 5"        1 'bg:B exit=5'               "trap 'builtin exit 0' EXIT; exit 5"
ex_case tbx0b5   "처리기 안에서 builtin exit 0, 작업은 builtin exit 5(검증기 코드가 실행되지 못함)" 1 'bg:B 종료 기록 없음' "trap 'builtin exit 0' EXIT; builtin exit 5"
ex_case tx3e5    '최초 5 / 처리기 exit 3 → 최초 코드 5'               1 'bg:B exit=5'               "trap 'exit 3' EXIT; exit 5"
ex_case tx3e0    '최초 0 / 처리기 exit 3 → 처리기 코드 3'             1 'bg:B exit=3'               "trap 'exit 3' EXIT; exit 0"
ex_case tx3r0    '정상 반환 / 처리기 exit 3 → 3'                      1 'bg:B exit=3'               "trap 'exit 3' EXIT; return 0"
ex_case tx0r5    'return 5 / 처리기 exit 0 → 5'                       1 'bg:B exit=5'               "trap 'exit 0' EXIT; return 5"
ex_case codex    "재현 사례: trap 'exit 0' EXIT; builtin exit 5"     1 'bg:B exit=5'               "trap 'exit 0' EXIT; builtin exit 5"
ex_case bcodex   "builtin trap 'exit 0' EXIT; builtin exit 5"       1 "bg:B EXIT trap 변경${NL}bg:B exit=2" "builtin trap 'exit 0' EXIT; builtin exit 5"
ex_case reinst   '처리기 안에서 trap 을 다시 설치하고 exit 0'          1 'bg:B exit=5'               "trap 'trap \"exit 0\" EXIT; exit 0' EXIT; exit 5"
ex_case sigexit  'trap 의 신호 이름이 0 / SIGEXIT'                    1 'bg:B exit=5'               "trap 'exit 0' 0; trap 'exit 0' SIGEXIT; builtin exit 5"
ex_case tclean   '처리기가 정상 정리만 하고 끝남 → 최초 코드 0'         0 ''                          "trap ': cleanup' EXIT; exit 0"
s_ex_usr1() { body() { run b true; trap 'touch "$TMP/ex_usr1_hit"' USR1; kill -USR1 $BASHPID; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario ex_usr1 s_ex_usr1; check 'EXIT: EXIT 가 아닌 신호의 trap 은 그대로 동작' 0 $? '' "$TMP/ex_usr1"
[ -f "$TMP/ex_usr1_hit" ] && ok 'EXIT: USR1 처리기 실행됨' || bad 'EXIT: USR1 처리기 미실행'

# ── F-1: 작업 EXIT 처리기의 return(작업은 함수 안에서 실행되므로 bash 와 같게 return N = 종료 코드 N) ─────────
for r in 0 3 5; do
    for e in 'exit 0' 'exit 5' 'builtin exit 0' 'builtin exit 5' 'return 0'; do
        case $e in *5) exp=5 ;; *) exp=$r ;; esac            # 최초 코드가 0 이 아니면 최초 코드, 0 이면 처리기의 return 코드
        nm="r${r}_$(printf '%s' "$e" | tr ' ' '_')"
        if [ "$exp" = 0 ]; then ex_case "$nm" "처리기 return $r, 작업 $e" 0 '' "trap 'return $r' EXIT; $e"
        else ex_case "$nm" "처리기 return $r, 작업 $e → $exp" 1 "bg:B exit=$exp" "trap 'return $r' EXIT; $e"; fi
    done
done
ex_case natfalse '처리기가 return 없이 false 로 끝남 → 최초 코드 0 유지(bash 와 같음)' 0 '' "trap 'false' EXIT; exit 0"
ex_case retnoarg '처리기가 false 뒤 인자 없는 return → 1'                         1 'bg:B exit=1' "trap 'false; return' EXIT; exit 0"
ex_case retmid   '처리기 중간의 return 뒤 명령은 실행되지 않음'                      1 'bg:B exit=4' "trap 'return 4; exit 0' EXIT; exit 0"
s_ret_flag() { body() { vr_hook_bg_before_read() { printf '%s' "${vr__in_task_trap:-}" > "$TMP/ret_flag.val"; }; vr_bg C run b true; trap 'return 3' EXIT; exit 0; }
               vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario ret_flag s_ret_flag; check 'F-1: 처리기 return 뒤 종료 처리 중 자식 회수 → 3' 1 $? 'bg:B exit=3' "$TMP/ret_flag"
[ -f "$TMP/ret_flag.val" ] && [ ! -s "$TMP/ret_flag.val" ] && ok 'F-1: 처리기 return 뒤 "처리기 실행 중" 표시가 지워져 있음' || bad "F-1: 처리기 실행 중 표시 [$(cat "$TMP/ret_flag.val" 2>/dev/null)]"

# ── F-4: 생명주기 fd 를 200 번대로 옮기고, 덮어쓰기·닫기를 검출 ────────────────────────────────────────
s_lfd() { vr_expect a; run a true; printf '%s' "$VR_LIFE_W" > "$TMP/lfd_num"; }
scenario lfd s_lfd; check 'F-4: 생명주기 fd 사용 정상' 0 $? '' "$TMP/lfd"
n=$(cat "$TMP/lfd_num"); { [ "$n" -ge 200 ] && [ "$n" -le 249 ]; } && ok "F-4: 생명주기 fd 번호 $n(200~249)" || bad "F-4: 생명주기 fd 번호 $n"
s_col10() { outer() { exec 10>/dev/null; vr_bg IN bash -c 'sleep 1; exit 5'; kill -9 $BASHPID; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario col10 s_col10 2>/dev/null; checkn 'F-4: 작업이 fd 10 을 덮어쓰고 부모가 죽어도 후손을 기다려 흡수(이전에는 기다리지 못함)' 1 $? "bg:OUT exit=137${NL}bg:OUT/IN exit=5${NL}bg 종료 기록 미회수: <ID>" "$TMP/col10"
s_lfd_over() { body() { run b true; eval "exec $VR_LIFE_W>/dev/null"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario lfd_over s_lfd_over; check 'F-4: 작업이 생명주기 fd 번호를 덮어씀 → "생명주기 fd 변경" 위반' 1 $? "bg:B 생명주기 fd 변경${NL}bg:B exit=2" "$TMP/lfd_over"
s_lfd_close() { body() { run b true; exec {VR_LIFE_W}>&-; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario lfd_close s_lfd_close; check 'F-4: 작업이 생명주기 fd 를 닫음 → "생명주기 fd 변경" 위반' 1 $? "bg:B 생명주기 fd 변경${NL}bg:B exit=2" "$TMP/lfd_close"
s_lfd_top() { vr_expect a; run a true; eval "exec $VR_LIFE_W>/dev/null"; }
scenario lfd_top s_lfd_top; check 'F-4: 최상위 셸에서 생명주기 fd 가 덮어써짐 → 완료를 보장할 수 없으므로 기록 실패, 3' 3 $? '기록 실패: 후손 추적 fd 변경' "$TMP/lfd_top"

# ── F-4 fd 할당: 동적 할당 → fd 목록 검증 → 200~249 의 빈 번호로 복제. 기존 fd 를 덮어쓰지 않고, 실패하면 vr_init 이 실패 ──
fa_dir="$TMP/fa"; mkdir -p "$fa_dir"
( exec 200>"$fa_dir/f200" 201>"$fa_dir/f201"; . "$HERE/lib/verify_run.sh"; vr_init "$fa_dir/o" || exit 9
  [ "$VR_LIFE_W" = 202 ] && [ "$fa_dir/f200" -ef /dev/fd/200 ] && [ "$fa_dir/f201" -ef /dev/fd/201 ] && [ "$VR_LIFE" -ef "/dev/fd/$VR_LIFE_W" ] ) \
  && ok 'F-4: 200·201 이 이미 열려 있으면 202 를 쓰고 200·201 은 원래 파일 그대로(덮어쓰지 않음)' || bad 'F-4: 기존 fd 보존'
( . "$HERE/lib/verify_run.sh"; vr_init "$fa_dir/o2" || exit 9; c=0
  for f in /proc/$BASHPID/fd/*; do [ "$VR_LIFE" -ef "$f" ] && c=$((c + 1)); done; [ "$c" = 1 ] ) \
  && ok 'F-4: vr_init 뒤 FIFO 를 가리키는 fd 는 정확히 1개(임시 fd 를 닫음)' || bad 'F-4: 임시 fd 누수'
( for n in {200..249}; do eval "exec $n>/dev/null"; done; . "$HERE/lib/verify_run.sh"; vr_init "$fa_dir/o3"; rc=$?
  [ $rc -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ "$(readlink /proc/$BASHPID/fd/200)" = /dev/null ] ) \
  && ok 'F-4: 200~249 가 모두 차 있으면 vr_init 실패(2), 기존 fd 그대로' || bad 'F-4: 범위 가득 참'
( . "$HERE/lib/verify_run.sh"; VR__FD_DIR="$fa_dir/nofd"; vr_init "$fa_dir/o4"; [ $? -eq 2 ] ) \
  && ok 'F-4: fd 목록이 열린 fd 를 보여 주지 못하는 환경이면 vr_init 실패(2)' || bad 'F-4: fd 목록 검증'
( . "$HERE/lib/verify_run.sh"; mkdir -p "$fa_dir/fakefd"; VR__FD_DIR="$fa_dir/fakefd"; : > "$fa_dir/fakefd/0"; vr_init "$fa_dir/o5"; [ $? -eq 2 ] ) \
  && ok 'F-4: fd 목록이 방금 연 fd 를 보여 주지 않으면(가짜 목록) vr_init 실패(2)' || bad 'F-4: 가짜 fd 목록'
mkdir -p "$fa_dir/p1"; ( for n in {200..249}; do eval "exec $n>/dev/null"; done; bash "$HERE/p1_verify.sh" "$fa_dir/p1/out" > /dev/null 2>&1; [ $? -eq 2 ] ) \
  && ok 'F-4: fd 할당 실패 시 p1_verify.sh 는 준비 실패(2)로 끝남(진행하지 않음)' || bad 'F-4: p1_verify 준비 실패'

# ── F-1 경계: 처리기 전체의 return 과, 처리기 안에서 호출한 함수만의 return 구분 ──────────────────────────────
ex_case ufret      '처리기가 부른 함수의 return 7 뒤 처리기 계속 → 자연 종료(0)'      0 ''            "g() { return 7; }; trap 'g; :' EXIT; exit 0"
ex_case ufretlast  '처리기의 마지막 명령이 return 7 하는 함수 → 자연 종료(0, bash 와 같음)' 0 ''       "g() { return 7; }; trap 'g' EXIT; exit 0"
ex_case ufretex    '처리기가 부른 함수 안의 exit 7 → 7'                                1 'bg:B exit=7' "g() { exit 7; }; trap 'g; :' EXIT; exit 0"
ex_case ifret      '처리기 if 안의 return 4'                                           1 'bg:B exit=4' "trap 'if true; then return 4; fi; exit 0' EXIT; exit 0"
ex_case forret     '처리기 for 안의 return 6'                                          1 'bg:B exit=6' "trap 'for i in 1 2; do return 6; done; exit 0' EXIT; exit 0"
ex_case whileret   '처리기 while 안의 return 2'                                        1 'bg:B exit=2' "trap 'while :; do return 2; done' EXIT; exit 0"
ex_case caseret    '처리기 case 안의 return 8'                                         1 'bg:B exit=8' "trap 'case x in x) return 8 ;; esac' EXIT; exit 0"
ex_case subret     '처리기 안 하위 셸의 return 3 은 처리기 코드에 영향 없음'               0 ''            "trap '( return 3 ) 2>/dev/null; :' EXIT; exit 0"
ex_case subexit    '처리기 안 하위 셸의 exit 3 은 처리기 코드에 영향 없음'                0 ''            "trap '( exit 3 ); :' EXIT; exit 0"
ex_case csexit     '처리기 안 명령 치환의 exit 3 은 처리기 코드에 영향 없음'              0 ''            "trap 'x=\$(exit 3); :' EXIT; exit 0"
for init in 0 5; do for how in natural ret3 exit3; do
    case $how in natural) h=':' ;; ret3) h='return 3' ;; exit3) h='exit 3' ;; esac
    if [ $init = 5 ]; then exp=5; elif [ $how = natural ]; then exp=0; else exp=3; fi
    if [ $exp = 0 ]; then ex_case "m_${init}_$how" "조합: 최초 $init / 처리기 $how" 0 '' "trap '$h' EXIT; exit $init"
    else ex_case "m_${init}_$how" "조합: 최초 $init / 처리기 $how → $exp" 1 "bg:B exit=$exp" "trap '$h' EXIT; exit $init"; fi
done; done
# 처리기 안의 exit N 뒤 종료 기록·자식 회수가 한 번만(자식 C 가 있는 경우)
s_once() { body() { vr_bg C run c true; run b true; trap 'exit 4' EXIT; exit 0; }; vr_expect a b c; run a true; vr_bg B body; vr_wait; }
scenario once s_once; check 'F-1: 처리기 exit 4(자식 있음) → 4, 재진입·중복 회수 사유 없음' 1 $? 'bg:B exit=4' "$TMP/once"
{ [ "$(ls -A "$TMP/once/bg" | grep -c '\.read$')" = 2 ] && [ "$(ls -A "$TMP/once/bg" | grep -c '\.done$')" = 2 ] && [ "$(ls -A "$TMP/once/bg" | grep -vc '\.\(read\|done\)$')" = 0 ]; } \
  && ok 'F-1: 종료 기록 2개(B·C)와 실행 표식 2개가 각각 한 번씩 처리됨' || bad "F-1: 회수 상태 $(ls -A "$TMP/once/bg" | tr '\n' ' ')"

# ── SUB-1: 작업 안의 하위 셸·명령 치환에서의 exit·trap 은 bash 본래 동작(작업의 종료 처리를 대신 실행하지 않음) ─────────
sub_case() { eval "s_sub_$1() { body() { vr_bg C run c true; run b true; $4; }; vr_expect a b c; run a true; vr_bg B body; vr_wait; }"
             scenario "sub_$1" "s_sub_$1" 2>/dev/null; checkn "SUB-1: $2" "$3" $? "$5" "$TMP/sub_$1"; }   # 작업 ID 정규화 대조
sub_case subsh   '작업 안 하위 셸의 exit 3 → 작업은 정상(자식 표식을 대신 처리하지 않음)'  0 '( exit 3 ); :' ''
sub_case cmdsub  '작업 안 명령 치환의 exit 4 → 작업은 정상'                          0 'x=$(exit 4); :' ''
sub_case subtrap '하위 셸이 자기 EXIT trap 을 설치하고 exit 2 → 작업은 정상'           0 "( trap ': sub' EXIT; exit 2 ); :" ''
sub_case subcode '하위 셸 exit 3 의 코드는 작업이 받아 쓸 수 있음(작업이 그 코드로 종료)' 1 '( exit 3 ); exit $?' 'bg:B exit=3'
sub_case stale   '명령 치환이 종료 기록을 미리 쓰지 못하므로, 그 뒤 builtin 우회는 "종료 기록 없음"' 1 'x=$(exit 0); builtin trap - EXIT; builtin exit 0' 'bg:B 종료 기록 없음
bg 종료 기록 미회수: <ID>'

# ── 보완 A: vr_init 실패·재호출 시 상태 정리(임시 fd·생명주기 fd·FIFO 파일·VR_LIFE·VR_LIFE_W) ───────────────────
life_fds() { local f c=0; for f in /proc/$BASHPID/fd/*; do case "$(readlink "$f" 2>/dev/null)" in *.vr_life*) c=$((c + 1)) ;; esac; done; echo $c; }
ia_dir="$TMP/ia"; mkdir -p "$ia_dir"
for stage in fifo open list range dup; do
    ( . "$HERE/lib/verify_run.sh"; vr_hook_init_fail() { [ "$1" = "$stage" ]; }
      vr_init "$ia_dir/f_$stage"; rc=$?
      [ $rc -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ -z "$VR_LIFE" ] && [ ! -e "$ia_dir/f_$stage/.vr_life" ] && [ "$(life_fds)" = 0 ] || exit 1
      unset -f vr_hook_init_fail; vr_init "$ia_dir/f_${stage}_retry" || exit 2
      [ "$(life_fds)" = 1 ] && [ "$VR_LIFE_W" -ge 200 ] && [ "$VR_LIFE" -ef "/dev/fd/$VR_LIFE_W" ] || exit 3
      vr_expect a; run a true; vr_finish > /dev/null 2>&1 ) ; rc=$?
    [ $rc -eq 0 ] && ok "보완 A: '$stage' 단계 실패 → 2, fd·FIFO·변수 모두 정리, 재호출은 정상 초기화·정상 판정" || bad "보완 A: '$stage' 단계 실패 정리 (rc=$rc)"
done
( for n in {200..249}; do eval "exec $n>/dev/null"; done; . "$HERE/lib/verify_run.sh"; vr_init "$ia_dir/full"
  [ $? -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ -z "$VR_LIFE" ] && [ ! -e "$ia_dir/full/.vr_life" ] && [ "$(life_fds)" = 0 ] ) \
  && ok '보완 A: 실제 범위 포화(200~249 모두 열림) → 2, 임시 fd·FIFO 정리' || bad '보완 A: 실제 범위 포화 정리'
( . "$HERE/lib/verify_run.sh"; VR__FD_DIR="$ia_dir/none"; vr_init "$ia_dir/nolist"
  [ $? -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ ! -e "$ia_dir/nolist/.vr_life" ] && [ "$(life_fds)" = 0 ] ) \
  && ok '보완 A: 실제 fd 목록 검증 실패 → 2, 임시 fd·FIFO 정리' || bad '보완 A: 실제 fd 목록 실패 정리'
( . "$HERE/lib/verify_run.sh"; vr_init "$ia_dir/r1" || exit 1; first=$VR_LIFE; vr_init "$ia_dir/r2" || exit 2
  [ ! -e "$first" ] && [ "$(life_fds)" = 1 ] && [ "$VR_LIFE" = "$ia_dir/r2/.vr_life" ] && [ "$VR_LIFE" -ef "/dev/fd/$VR_LIFE_W" ] ) \
  && ok '보완 A: 성공한 뒤 재호출 → 이전 FIFO 삭제·이전 fd 닫힘, 새 FIFO 하나만' || bad '보완 A: 성공 뒤 재호출'
( . "$HERE/lib/verify_run.sh"; vr_init "$ia_dir/e1" || exit 1; first=$VR_LIFE; vr_init /dev/null/x 2>/dev/null; rc=$?
  [ $rc -eq 2 ] && [ ! -e "$first" ] && [ "$(life_fds)" = 0 ] && [ -z "$VR_LIFE_W" ] ) \
  && ok '보완 A: 성공한 뒤 재호출이 앞 단계(폴더 생성)에서 실패 → 이전 fd·FIFO 도 정리' || bad '보완 A: 앞 단계 실패 재호출'
( . "$HERE/lib/verify_run.sh"; vr_hook_init_fail() { [ "$1" = dup ]; }; vr_init "$ia_dir/fin"; vr_expect a; run a true; vr_finish > /dev/null 2>&1; [ $? -eq 3 ] ) \
  && ok '보완 A: 초기화 실패 상태에서 vr_finish → 성공 아님(3)' || bad '보완 A: 초기화 실패 뒤 vr_finish'

# ── 보완 B: SUB-1 가로채기 경계. 정상 완료 여부와 함께 상태 기록·bg 종료 기록이 한 번씩만 생기는지 확인 ─────────────
printf 'exit 7\n' > "$TMP/src_exit7.sh"
printf "trap 'exit 0' EXIT; exit 5\n" > "$TMP/src_trap5.sh"
rec_once() {   # rec_once <폴더> : 항목 a·b·c 의 상태 기록 3개, 작업 B·C 의 종료 기록(.read)·실행 표식(.done) 각 2개, 그 밖 0
    local d=$1
    [ "$(ls "$d/status" | grep -c '\.status$')" = 3 ] && [ "$(ls "$d/status" | grep -c 'tmp')" = 0 ] \
    && [ "$(ls -A "$d/bg" | grep -c '\.read$')" = 2 ] && [ "$(ls -A "$d/bg" | grep -c '\.done$')" = 2 ] \
    && [ "$(ls -A "$d/bg" | grep -vc '\.\(read\|done\)$')" = 0 ]
}
sb_case() {   # sb_case <이름> <설명> <기대 종료 코드> <기대 실패 목록> <작업 본문(자식 C 와 항목 b 뒤에 실행)>
    eval "s_sb_$1() { body() { vr_bg C run c true; run b true; $5; }; vr_expect a b c; run a true; vr_bg B body; vr_wait; }"
    scenario "sb_$1" "s_sb_$1" 2>/dev/null; local rc=$?
    check "보완 B: $2" "$3" "$rc" "$4" "$TMP/sb_$1"
    rec_once "$TMP/sb_$1" && ok "보완 B: $2 — 상태 기록·bg 기록 각 한 번" || bad "보완 B: $2 — 기록 수 $(ls "$TMP/sb_$1/status" | tr '\n' ' ') / $(ls -A "$TMP/sb_$1/bg" | tr '\n' ' ')"
}
sb_case fnexit   '작업 함수가 부른 함수 안의 함수에서 exit 6'                1 'bg:B exit=6' 'f2() { exit 6; }; f1() { f2; }; f1'
sb_case fntrap   '작업 함수가 부른 함수 안에서 trap 설치 후 builtin exit 5'   1 'bg:B exit=5' "f1() { trap 'exit 0' EXIT; }; f1; builtin exit 5"
sb_case ncs      '함수 안 중첩 명령 치환의 exit 3(값은 바깥이 받음)'          0 ''            'f() { x=$( y=$(exit 3); echo $? ); [ "$x" = 3 ] || exit 9; }; f'
sb_case npar     '함수 안 중첩 괄호 하위 셸의 exit 3·4(코드는 바깥이 받음)'   0 ''            'f() { ( ( exit 3 ); exit 4 ); [ $? = 4 ] || exit 9; }; f'
sb_case psub     '함수 안 프로세스 치환의 exit 5·6'                          0 ''            'f() { cat <( exit 5 ) > /dev/null; : > >(exit 6); sleep 0.2; }; f'
sb_case csfn     '명령 치환 안에서 부른 함수의 exit'                          0 ''            'g() { exit 2; }; v=$(g; echo no); [ -z "$v" ] || exit 9'
sb_case src7     'source 한 스크립트의 exit 7'                               1 'bg:B exit=7' ". \"\$TMP/src_exit7.sh\""
sb_case srctrap  "source 한 스크립트의 trap 'exit 0' EXIT; exit 5"           1 'bg:B exit=5' ". \"\$TMP/src_trap5.sh\""
sb_case srcsub   '하위 셸 안에서 source 한 스크립트의 exit 7 → 작업 정상'      0 ''            "( . \"\$TMP/src_exit7.sh\" ); [ \$? = 7 ] || exit 9"
sb_case csnoarg  '명령 치환(exit 3) 뒤 인자 없는 exit → 3'                    1 'bg:B exit=3' 'x=$(exit 3); exit'
sb_case parnoarg '괄호 하위 셸(exit 4) 뒤 인자 없는 exit → 4'                 1 'bg:B exit=4' '( exit 4 ); exit'
sb_case cs0noarg 'false 뒤 명령 치환(true) 뒤 인자 없는 exit → 0'             0 ''            'false; x=$(true); exit'
sb_case fnnoarg  '함수 안: 명령 치환(exit 3) 뒤 인자 없는 exit → 3'           1 'bg:B exit=3' 'f() { x=$(exit 3); exit; }; f'

# ── RE-2 남은 위험: 실행 표식을 쓰기 전에 부모가 강제 종료 ─────────────────────────────────────────────
s_win() { outer() { vr_hook_bg_before_mark() { kill -9 $BASHPID; }; vr_bg IN bash -c 'sleep 1; exit 5'; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario win s_win 2>/dev/null; checkn 'RE-2: 표식 전에 부모가 죽은 후손(1초 뒤 exit 5) → 생명주기 추적으로 기다려 흡수' 1 $? "bg:OUT exit=137${NL}bg:OUT/IN exit=5${NL}bg 종료 기록 미회수: <ID>" "$TMP/win"
re_bg_dir_ok "$TMP/win" && ok 'RE-2: 표식 없는 후손도 판정 시점에 처리 완료' || bad "RE-2: bg: $(ls -A "$TMP/win/bg" | tr '\n' ' ')"
s_win_k() { outer() { vr_hook_bg_before_mark() { kill -9 $BASHPID; }; vr_bg IN wk; }; wk() { sleep 1; : > "$TMP/win_k_done"; kill -9 $BASHPID; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario win_k s_win_k 2>/dev/null; check 'RE-2: 표식 전에 부모가 죽고 후손도 기록 없이 강제 종료 → 부모 실패' 1 $? 'bg:OUT exit=137' "$TMP/win_k"
[ -f "$TMP/win_k_done" ] && ok 'RE-2: 판정은 그 후손이 끝난 뒤에 이루어짐(판정 뒤에 실행 중인 후손 없음)' || bad 'RE-2: 판정이 후손 종료보다 먼저'
s_runbg() { vr_expect a; run a sh -c 'sleep 3 > /dev/null 2>&1 &'; }
t0=$SECONDS; scenario runbg s_runbg; rc=$?; dt=$((SECONDS - t0))
{ [ $rc -eq 0 ] && [ $dt -lt 3 ]; } && ok "RE-2: run 으로 실행한 명령이 남긴 프로세스는 기다리지 않음(${dt}초)" || bad "RE-2: run 명령의 잔여 프로세스 대기 (rc=$rc, ${dt}초)"

# ── 동시 중복 실행(VR-002) ───────────────────────────────────────────────────────────────
s_race() { vr_expect a b; run a true; local i; for i in 1 2 3 4 5 6; do vr_bg R run b sh -c 'echo x >> "$1"; sleep 1' _ "$TMP/race_counter"; done; vr_wait; }
scenario race s_race; check 'VR-002: 같은 이름의 run 을 6개 동시에 호출 → "중복 실행 시도" + 그 작업들의 종료 코드 2, b 자체는 성공' 1 $? "b 중복 실행 시도${NL}bg:R exit=2" "$TMP/race"
[ "$(wc -l < "$TMP/race_counter")" -eq 1 ] && ok 'VR-002: 명령은 정확히 한 번만 실행됨' || bad "VR-002: 명령 실행 횟수 $(wc -l < "$TMP/race_counter")"
[ "$(grep -c 'b 중복 실행 시도' "$TMP/race/status/_violations.txt")" -eq 5 ] && ok 'VR-002: 나머지 5번의 시도가 모두 기록됨' || bad "VR-002: 기록된 시도 $(grep -c 'b 중복 실행 시도' "$TMP/race/status/_violations.txt")"
s_twice() { vr_expect a; run a true; run a true; }
scenario twice s_twice; check '같은 항목을 순서대로 두 번 실행 → "중복 실행 시도"' 1 $? 'a 중복 실행 시도' "$TMP/twice"

# ── 상태 기록이 없거나 잘못된 경우 ───────────────────────────────────────────────────────
s_st_missing() { vr_expect a b; run a true; run b true; rm -f "$VR_ST/b.status"; }
scenario st_missing s_st_missing; check '상태 파일 삭제 → "시작했으나 상태 기록 없음"' 1 $? 'b 시작했으나 상태 기록 없음' "$TMP/st_missing"
s_st_badcode() { vr_expect a b; run a true; run b true; printf 'v1 %s b abc\n' "$(vr_tag b)" > "$VR_ST/b.status"; }
scenario st_badcode s_st_badcode; check '태그는 맞지만 코드가 숫자가 아님 → "상태 기록 손상"' 1 $? 'b 상태 기록 손상' "$TMP/st_badcode"
s_st_range() { vr_expect a b; run a true; run b true; printf 'v1 %s b 256\n' "$(vr_tag b)" > "$VR_ST/b.status"; }
scenario st_range s_st_range; check '코드가 0~255 밖 → "상태 기록 손상"' 1 $? 'b 상태 기록 손상' "$TMP/st_range"
s_st_name() { vr_expect a b; run a true; run b true; printf 'v1 %s a 0\n' "$(vr_tag b)" > "$VR_ST/b.status"; }
scenario st_name s_st_name; check '다른 항목 이름이 적힌 상태 기록 → "상태 기록 손상"' 1 $? 'b 상태 기록 손상' "$TMP/st_name"
s_st_copy() { vr_expect a b; run a true; run b sh -c 'exit 4'; cp "$VR_ST/a.status" "$VR_ST/b.status"; }
scenario st_copy s_st_copy; check '다른 항목의 정상 상태 기록을 복사해 덮어씀 → "상태 기록 손상"(태그가 이름에 묶임)' 1 $? 'b 상태 기록 손상' "$TMP/st_copy"
s_st_twoline() { vr_expect a b; run a true; run b true; printf 'v1 %s b 0\nv1 %s b 0\n' "$(vr_tag b)" "$(vr_tag b)" > "$VR_ST/b.status"; }
scenario st_twoline s_st_twoline; check '상태 기록이 두 줄 → "상태 기록 손상"' 1 $? 'b 상태 기록 손상' "$TMP/st_twoline"
s_st_empty() { vr_expect a b; run a true; run b true; : > "$VR_ST/b.status"; }
scenario st_empty s_st_empty; check '빈 상태 파일 → "상태 기록 손상"' 1 $? 'b 상태 기록 손상' "$TMP/st_empty"
s_st_noclaim() { vr_expect a b; run a true; printf 'v1 %s b 0\n' "$(vr_tag b)" > "$VR_ST/b.status"; }
scenario st_noclaim s_st_noclaim; check '실행(선점) 없이 상태 파일만 있음 → "상태 기록 손상" + "로그 없음"' 1 $? "b 상태 기록 손상${NL}b 로그 없음" "$TMP/st_noclaim"

# ── 그 밖의 기록 위반 ───────────────────────────────────────────────────────────────────
s_notcalled() { vr_expect a b; run a true; }
scenario notcalled s_notcalled; check '등록했지만 실행되지 않은 항목 → "시작되지 않음"' 1 $? 'b 시작되지 않음' "$TMP/notcalled"
s_unregistered() { vr_expect a; run a true; run zzz true; }
scenario unregistered s_unregistered; check '등록하지 않은 이름으로 run → "등록되지 않은 항목"' 1 $? 'zzz 등록되지 않은 항목' "$TMP/unregistered"
s_straylog() { vr_expect a; run a true; echo x > "$VR_L/stray.log"; }
scenario straylog s_straylog; check '등록하지 않은 로그 파일 → "등록되지 않은 로그"' 1 $? 'stray 등록되지 않은 로그' "$TMP/straylog"
s_straystatus() { vr_expect a; run a true; echo x > "$VR_ST/zz.status"; }
scenario straystatus s_straystatus; check '등록하지 않은 상태 파일 → "등록되지 않은 상태 기록"' 1 $? 'zz 등록되지 않은 상태 기록' "$TMP/straystatus"
s_nolog() { vr_expect a b; run a true; run b true; rm -f "$VR_L/b.log"; }
scenario nolog s_nolog; check '상태는 정상인데 로그 파일이 없음 → "로그 없음"' 1 $? 'b 로그 없음' "$TMP/nolog"
s_dupexpect() { vr_expect a a; run a true; }
scenario dupexpect s_dupexpect; check '같은 항목을 중복 등록 → "중복 등록"' 1 $? 'a 중복 등록' "$TMP/dupexpect"
s_empty() { :; }
scenario empty s_empty; check '등록 항목 0개 → "등록된 항목 없음"으로 실패' 1 $? '등록된 항목 없음' "$TMP/empty"
s_notrust() { vr_expect a b; run a true; run b sh -c 'exit 5'; : > "$VR_FAILS"; echo 'b exit=0' > "$VR_FAILS"; : > "$VR_STEPS"; }
scenario notrust s_notrust; check 'vr_finish 는 기존 보고 파일을 믿지 않음: 바꿔 두어도 상태 기록으로 "exit=5" 판정' 1 $? 'b exit=5' "$TMP/notrust"
s_multi() { vr_expect a b c d; run a sh -c 'exit 2'; vr_bg B run b sh -c 'printf "exit=0\n"; kill -9 "$PPID"'; vr_wait; }
scenario multi s_multi 2>/dev/null; check '실패가 여럿 → 다섯 건이 정확히 기록' 1 $? "a exit=2${NL}b 시작했으나 상태 기록 없음${NL}bg:B exit=137${NL}c 시작되지 않음${NL}d 시작되지 않음" "$TMP/multi"

# ── VR-003: 대조 자체의 엄격성 ─────────────────────────────────────────────────────────────
same_list "b exit=3${NL}bg:B exit=3" "$TMP/exit3/failed_steps.txt" && ok '대조: 정확히 같은 목록 → 일치' || bad '대조: 정확히 같은 목록'
! same_list '' "$TMP/exit3/failed_steps.txt" && ok '대조: 실제로는 실패가 있는데 기대가 "실패 없음" → 불일치' || bad '대조: 빈 기대'
! same_list "c 시작되지 않음" "$TMP/loopkill/failed_steps.txt" && ok '대조: 실제 실패 중 일부만 기대 → 불일치(기대하지 않은 추가 실패를 잡음)' || bad '대조: 부분 집합'
! same_list "b exit=3${NL}bg:B exit=3${NL}x 추가" "$TMP/exit3/failed_steps.txt" && ok '대조: 기대에 없는 실패가 기대 쪽에 더 있음 → 불일치' || bad '대조: 상위 집합'
( check_out=$(check '내부' 1 1 '' "$TMP/exit3" 2>&1); printf '%s' "$check_out" | grep -q '^FAIL' ) && ok '대조: check 는 기대하지 않은 실패가 있으면 FAIL 을 출력' || bad '대조: check 의 FAIL 출력'

total=$((pass + fail + skip))
if [ $fail -ne 0 ]; then echo "RESULT: FAIL $pass/$total (실패 $fail, 미실행 $skip) (verify_run_selftest)"; exit 1; fi
if [ $skip -ne 0 ]; then echo "RESULT: INCOMPLETE $pass/$total (미실행 $skip — 통과 아님) (verify_run_selftest)"; exit 4; fi
echo "RESULT: PASS $pass/$total (verify_run_selftest)"; exit 0
