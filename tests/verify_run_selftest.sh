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
same_list_n() { diff <(printf '%s' "$1" | grep . | sed -E 's/[0-9a-f]{12}_[0-9]+_[0-9]+/<ID>/g' | sort) <(grep . "$2" | sed -E 's/[0-9a-f]{12}_[0-9]+_[0-9]+/<ID>/g' | sort) > /dev/null; }
checkn() {   # check 와 같되 작업 ID 를 정규화해 대조(중복 줄 수까지 대조하도록 sort -u 대신 sort)
    if [ "$2" = "$3" ] && same_list_n "$4" "$5/failed_steps.txt"; then ok "$1"
    else bad "$1  | 종료 코드 $3(기대 $2), 실제 실패 목록: $(tr '\n' ';' < "$5/failed_steps.txt" 2>/dev/null) / 기대: $(printf '%s' "$4" | tr '\n' ';')"; fi
}
life_fds() { local f c=0; for f in /proc/$BASHPID/fd/*; do case "$(readlink "$f" 2>/dev/null)" in *.vr_life*) c=$((c + 1)) ;; esac; done; echo $c; }
# 생명주기 FIFO 를 가리키는 fd 중 쓰기 가능한 것(접근 모드가 읽기 전용이 아닌 것)의 수
life_wfds() { local f n c=0 fl; for f in /proc/$BASHPID/fd/*; do case "$(readlink "$f" 2>/dev/null)" in *.vr_life*) n=${f##*/}
    fl=$(awk '/^flags:/{print $2}' "/proc/$BASHPID/fdinfo/$n" 2>/dev/null); [ $(( 8#$fl & 3 )) -ne 0 ] && c=$((c + 1)) ;; esac; done; echo $c; }
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
scenario bx_norec s_bx_norec; check 'D-1: 종료 기록을 쓰지 못함 → 2 + "종료 기록 없음" + FIFO 로 전달된 기록 실패(3)' 3 $? "bg:B exit=2${NL}bg:B 종료 기록 없음${NL}기록 실패: bg:B 종료 기록 쓰기" "$TMP/bx_norec"
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
    # 목적 경로는 ID 예약 뒤, 회수 직전에 만든다(예약 전에 만들면 ID 예약 단계의 충돌로 먼저 잡힌다 — 그 경우는 ID 충돌 시험에서 따로 확인)
    eval "s_rd_$kind() { vr_hook_bg_before_read() { local t=\"\$1.read\"
            case $kind in file) : > \"\$t\" ;; dir) mkdir \"\$t\" ;; nested) mkdir -p \"\$t/sub/deep\"; : > \"\$t/sub/deep/x\" ;; esac; }
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
  for f in /proc/$BASHPID/fd/*; do [ "$VR_LIFE" -ef "$f" ] && c=$((c + 1)); done; [ "$c" = 2 ] && [ "$(life_wfds)" = 1 ] ) \
  && ok 'F-4: vr_init 뒤 FIFO 를 가리키는 fd 는 쓰기 가능 1개(생명주기)·읽기 전용 1개(대체 대기용)뿐(임시 fd 를 닫음)' || bad 'F-4: 임시 fd 누수'
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
ia_dir="$TMP/ia"; mkdir -p "$ia_dir"
for stage in fifo open list range dup; do
    ( . "$HERE/lib/verify_run.sh"; vr_hook_init_fail() { [ "$1" = "$stage" ]; }
      vr_init "$ia_dir/f_$stage" 2>/dev/null; rc=$?
      [ $rc -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ -z "$VR_LIFE" ] && [ "$(life_fds)" = 0 ] || exit 1
      if [ "$stage" = open ]; then   # FIFO 를 만들었으나 fd 를 열기 전에 실패: 소유를 입증할 수 없으므로 잔여물로 남기고, 같은 경로 재호출은 거부
          [ -p "$ia_dir/f_$stage/.vr_life" ] && [ -n "$VR__INIT_ERR" ] || exit 4
          unset -f vr_hook_init_fail; vr_init "$ia_dir/f_$stage" 2>/dev/null; [ $? -eq 2 ] && [ -p "$ia_dir/f_$stage/.vr_life" ] || exit 5
      else [ ! -e "$ia_dir/f_$stage/.vr_life" ] || exit 6; fi
      unset -f vr_hook_init_fail; vr_init "$ia_dir/f_${stage}_retry" || exit 2
      [ "$(life_fds)" = 2 ] && [ "$(life_wfds)" = 1 ] && [ "$VR_LIFE_W" -ge 200 ] && [ "$VR_LIFE" -ef "/dev/fd/$VR_LIFE_W" ] || exit 3
      vr_expect a; run a true; vr_finish > /dev/null 2>&1 ) ; rc=$?
    if [ "$stage" = open ]; then nm="보완 A: 'open' 단계(FIFO 를 만든 뒤 fd 를 열기 전) 실패 → 2, 소유를 입증할 수 없는 FIFO 는 지우지 않고 잔여물로 보존, 같은 경로 재호출 거부, 다른 경로 재호출은 정상"
    else nm="보완 A: '$stage' 단계 실패 → 2, fd·FIFO·변수 모두 정리, 재호출은 정상 초기화·정상 판정"; fi
    [ $rc -eq 0 ] && ok "$nm" || bad "$nm (rc=$rc)"
done
( for n in {200..249}; do eval "exec $n>/dev/null"; done; . "$HERE/lib/verify_run.sh"; vr_init "$ia_dir/full"
  [ $? -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ -z "$VR_LIFE" ] && [ ! -e "$ia_dir/full/.vr_life" ] && [ "$(life_fds)" = 0 ] ) \
  && ok '보완 A: 실제 범위 포화(200~249 모두 열림) → 2, 임시 fd·FIFO 정리' || bad '보완 A: 실제 범위 포화 정리'
( . "$HERE/lib/verify_run.sh"; VR__FD_DIR="$ia_dir/none"; vr_init "$ia_dir/nolist"
  [ $? -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ ! -e "$ia_dir/nolist/.vr_life" ] && [ "$(life_fds)" = 0 ] ) \
  && ok '보완 A: 실제 fd 목록 검증 실패 → 2, 임시 fd·FIFO 정리' || bad '보완 A: 실제 fd 목록 실패 정리'
( . "$HERE/lib/verify_run.sh"; vr_init "$ia_dir/r1" || exit 1; first=$VR_LIFE; vr_init "$ia_dir/r2" || exit 2
  [ ! -e "$first" ] && [ "$(life_fds)" = 2 ] && [ "$(life_wfds)" = 1 ] && [ "$VR_LIFE" = "$ia_dir/r2/.vr_life" ] && [ "$VR_LIFE" -ef "/dev/fd/$VR_LIFE_W" ] ) \
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

# ── 결함 1(Codex): 작업 ID 충돌 — 다음 작업 ID 를 미리 계산해 그 이름의 파일을 먼저 만들어 둔다(비정상 종료 뒤 PID 재사용 모의) ──
# 다음 작업 ID 를 미리 계산(명령 치환을 쓰면 $BASHPID 가 그 하위 셸의 것이 되므로, 같은 셸에서 변수로 받는다)
nextid() { NEXTID="${VR_RUN_ID}_${BASHPID}_$((VR_BG_SEQ + ${1:-1}))"; }
for kind in rec read done tmp run; do
    eval "s_idc_$kind() { local id t; nextid; id=\$NEXTID; t=\"\$VR_BGREC/\$id\"
        case $kind in rec) printf 'v1 %s %s\nL B\nC 0\n' \"\$(vr_tag bg:\$id)\" \"\$id\" > \"\$t\" ;; read) printf 'old\n' > \"\$t.read\" ;;
                       done) printf 'old\n' > \"\$t.done\" ;; tmp) printf 'old\n' > \"\$t.tmp\" ;; run) printf '99999\n' > \"\$t.run\" ;; esac
        printf '%s' \"\$id\" > \"\$TMP/idc_$kind.id\"; cp \"\$VR_BGREC/\$(ls \"\$VR_BGREC\")\" \"\$TMP/idc_$kind.orig\"
        vr_expect a b; run a true; vr_bg B run b true; vr_wait; }"
done
scenario idc_rec s_idc_rec;   checkn '결함 1: 같은 ID 의 유효한(태그 일치) 이전 종료 기록이 있음 → 덮어쓰지 않고 "작업 ID 충돌", 다음 ID 로 실행, 이전 기록은 미회수로 흡수' 1 $? "bg:B 작업 ID 충돌: <ID>${NL}bg 종료 기록 미회수: <ID>" "$TMP/idc_rec"
cmp -s "$TMP/idc_rec.orig" "$TMP/idc_rec/bg/$(cat "$TMP/idc_rec.id").read" && ok '결함 1: 이전 종료 기록의 내용이 그대로 보존됨(.read 로 이름만 바뀜)' || bad '결함 1: 이전 종료 기록 보존'
scenario idc_read s_idc_read; checkn '결함 1: 같은 ID 의 .read 가 있음 → "작업 ID 충돌"' 1 $? 'bg:B 작업 ID 충돌: <ID>' "$TMP/idc_read"
cmp -s "$TMP/idc_read.orig" "$TMP/idc_read/bg/$(cat "$TMP/idc_read.id").read" && ok '결함 1: 이전 .read 보존' || bad '결함 1: 이전 .read 보존'
scenario idc_done s_idc_done; checkn '결함 1: 같은 ID 의 .done 이 있음 → "작업 ID 충돌"' 1 $? 'bg:B 작업 ID 충돌: <ID>' "$TMP/idc_done"
cmp -s "$TMP/idc_done.orig" "$TMP/idc_done/bg/$(cat "$TMP/idc_done.id").done" && ok '결함 1: 이전 .done 보존' || bad '결함 1: 이전 .done 보존'
scenario idc_tmp s_idc_tmp;   checkn '결함 1: 같은 ID 의 .tmp 가 있음 → "작업 ID 충돌" + 남은 임시 파일은 미회수' 1 $? "bg:B 작업 ID 충돌: <ID>${NL}bg 종료 기록 미회수: <ID>.tmp" "$TMP/idc_tmp"
cmp -s "$TMP/idc_tmp.orig" "$TMP/idc_tmp/bg/$(cat "$TMP/idc_tmp.id").tmp" && ok '결함 1: 이전 .tmp 보존' || bad '결함 1: 이전 .tmp 보존'
scenario idc_run s_idc_run;   checkn '결함 1: 같은 ID 의 .run(이전 작업이 남긴 실행 표식) 이 있음 → "작업 ID 충돌" + 그 표식은 "종료 기록 없음"' 1 $? "bg:B 작업 ID 충돌: <ID>${NL}bg 종료 기록 없음(회수되지 않은 작업): <ID>" "$TMP/idc_run"
cmp -s "$TMP/idc_run.orig" "$TMP/idc_run/bg/$(cat "$TMP/idc_run.id").done" && ok '결함 1: 이전 .run 의 내용 보존(.done 으로 이름만 바뀜)' || bad '결함 1: 이전 .run 보존'
s_idc_all() { local k; for k in 1 2 3 4 5; do nextid $k; printf 'old\n' > "$VR_BGREC/$NEXTID.done"; done; vr_expect a b; run a true; vr_bg B run b true; vr_wait; }
scenario idc_all s_idc_all; checkn '결함 1: 5번 연속 충돌 → 작업을 시작하지 않고 "작업 ID 확보" 기록 실패, 3' 3 $? "bg:B 작업 ID 충돌: <ID>${NL}bg:B 작업 ID 충돌: <ID>${NL}bg:B 작업 ID 충돌: <ID>${NL}bg:B 작업 ID 충돌: <ID>${NL}bg:B 작업 ID 충돌: <ID>${NL}기록 실패: bg:B 작업 ID 확보${NL}b 시작되지 않음" "$TMP/idc_all"
s_idc_inj() { vr_hook_fail() { [ "$1" = reserve ]; }; vr_expect a b; run a true; vr_bg B run b true; vr_wait; }
scenario idc_inj s_idc_inj; check '결함 1: 실행 표식 예약 실패(주입) → 작업 시작 안 함, 기록 실패, 3' 3 $? "기록 실패: bg:B 작업 ID 확보${NL}b 시작되지 않음" "$TMP/idc_inj"
( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/restart" || exit 1; vr_expect a; vr_bg A run a true; vr_wait; vr_finish > /dev/null 2>&1 || exit 2
  vr_init "$TMP/restart"; [ $? -eq 2 ] ) && ok '결함 1: 이전 실행의 bg 기록이 남은 출력 폴더로 재시작 → vr_init 실패(2)' || bad '결함 1: 같은 폴더 재시작'
( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/runid1" || exit 1; a=$VR_RUN_ID; vr_init "$TMP/runid2" || exit 1; [ "$a" != "$VR_RUN_ID" ] && [[ "$VR_RUN_ID" =~ ^[0-9a-f]{12}$ ]] ) \
  && ok '결함 1: 실행 ID 는 vr_init 마다 새 12자리 16진' || bad '결함 1: 실행 ID'

# ── 결함 2(Codex): 종료 기록 I/O 실패는 원인과 함께 최종 3 으로 ─────────────────────────────────────────────────
if [ $HAVE_FULL -eq 1 ]; then
    s_rw_full() { body() { run b true; ln -s /dev/full "$VR_BGREC/$vr__bg_id.tmp"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
    scenario rw_full s_rw_full; checkn '결함 2: 종료 기록 쓰기 실패(실제 ENOSPC) → 부모 "종료 기록 없음" + FIFO 로 전달된 기록 실패, 3' 3 $? "bg:B exit=2${NL}bg:B 종료 기록 없음${NL}기록 실패: bg:B 종료 기록 쓰기${NL}bg 폴더에 예상하지 못한 항목: <ID>.tmp" "$TMP/rw_full"
    no_alldone "$TMP/rw_full" && ok '결함 2: 그 경우 ALL_DONE 없음' || bad '결함 2: ALL_DONE 있음'
    s_rw_nested() { inner() { run b true; ln -s /dev/full "$VR_BGREC/$vr__bg_id.tmp"; }; outer() { vr_bg IN inner; }; vr_expect a b; run a true; vr_bg OUT outer; vr_wait; }
    scenario rw_nested s_rw_nested; checkn '결함 2: 중첩 작업의 종료 기록 쓰기 실패 → 최상위까지 기록 실패, 3' 3 $? "bg:OUT/IN exit=2${NL}bg:OUT/IN 종료 기록 없음${NL}bg:OUT exit=2${NL}기록 실패: bg:OUT/IN 종료 기록 쓰기${NL}bg 폴더에 예상하지 못한 항목: <ID>.tmp" "$TMP/rw_nested"
    s_rw_lost() { body() { run b true; ln -s /dev/full "$VR_BGREC/$vr__bg_id.tmp"; eval "exec $VR_LIFE_W>/dev/null"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
    scenario rw_lost s_rw_lost; checkn '결함 2: 기록 쓰기 실패 + 전달 경로(FIFO fd)도 끊김 → 원인은 잃지만 성공은 아님(1)' 1 $? "bg:B exit=2${NL}bg:B 종료 기록 없음${NL}bg 폴더에 예상하지 못한 항목: <ID>.tmp" "$TMP/rw_lost"
else for n in ENOSPC 'ALL_DONE' 중첩 전달경로유실; do skp "결함 2: $n" '/dev/full 없음'; done; fi
s_rw_inj() { body() { run b true; vr_hook_fail() { [ "$1" = recwrite ]; }; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario rw_inj s_rw_inj; check '결함 2: 종료 기록 쓰기 실패(주입) → 3' 3 $? "bg:B exit=2${NL}bg:B 종료 기록 없음${NL}기록 실패: bg:B 종료 기록 쓰기" "$TMP/rw_inj"
s_rw_clash() { body() { run b true; printf 'x\n' > "$VR_BGREC/$vr__bg_id"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario rw_clash s_rw_clash; checkn '결함 2: 최종 기록 자리에 이미 파일이 있음 → 덮어쓰지 않음, 손상 + 기록 실패, 3' 3 $? "bg:B exit=2${NL}bg:B 종료 기록 손상${NL}기록 실패: bg:B 종료 기록 쓰기${NL}bg 종료 기록 미회수: <ID>.tmp" "$TMP/rw_clash"
[ "$(cat "$TMP/rw_clash/bg/"*[0-9].read 2>/dev/null)" = x ] && ok '결함 2: 먼저 있던 기록 내용 보존' || bad '결함 2: 먼저 있던 기록 보존'
s_rw_junk() { body() { run b true; printf 'junk\n' >&"$VR_LIFE_W"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario rw_junk s_rw_junk; check '결함 2: 생명주기 FIFO 에 알 수 없는 내용 → 기록 실패, 3' 3 $? '기록 실패: 후손 추적 FIFO 에 알 수 없는 내용' "$TMP/rw_junk"

# ── 결함 3(Codex): FIFO 삭제 실패 ──────────────────────────────────────────────────────────────────────────
s_rmf() { vr_hook_fail() { [ "$1" = rmfifo ]; }; vr_expect a; run a true; }
scenario rmf s_rmf; check '결함 3: FIFO 삭제 실패(주입) → 기록 실패, 3' 3 $? '기록 실패: 후손 추적 FIFO 삭제' "$TMP/rmf"
no_alldone "$TMP/rmf" && ok '결함 3: 그 경우 ALL_DONE 없음' || bad '결함 3: ALL_DONE 있음'
( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/rmf2" || exit 1; vr_hook_fail() { [ "$1" = rmfifo ]; }; vr_expect a; run a true; vr_finish > /dev/null 2>&1; [ $? -eq 3 ] || exit 2
  old="$TMP/rmf2/.vr_life"; [ -z "$VR_LIFE_W" ] && [ -z "$VR_LIFE" ] && [ -p "$old" ] || exit 3   # 실패 뒤 상태: fd 닫힘, 변수 비움, FIFO 남음
  unset -f vr_hook_fail; vr_init "$TMP/rmf3" || exit 4; [ -p "$old" ] || exit 5      # 다른 경로 재호출은 정상, 이전 FIFO 는 경로만 보고 지우지 않음(잔여물 보존)
  vr_init "$TMP/rmf2" 2>/dev/null; [ $? -eq 2 ] && [ -p "$old" ] || exit 6            # 같은 경로 재호출은 그 잔여물 때문에 거부
  vr_init "$TMP/rmf4" || exit 7; vr_expect a; run a true; vr_finish > /dev/null 2>&1 ) \
  && ok '결함 3: 삭제 실패 뒤 상태(fd 닫힘·FIFO 남음), 다른 경로 재호출은 정상 판정, 이전 FIFO 는 소유를 입증할 수 없으므로 보존, 같은 경로 재호출은 거부' || bad '결함 3: 삭제 실패 뒤 재호출'
s_rmf_ok() { vr_expect a; run a true; }
scenario rmf_ok s_rmf_ok; { [ $? -eq 0 ] && [ ! -e "$TMP/rmf_ok/.vr_life" ]; } && ok '결함 3: 정상 경우 FIFO 삭제됨' || bad '결함 3: 정상 경우 FIFO 잔존'

# ── FIFO 알림 경로의 버퍼 포화·교착(0555ede 추가 반려) ─────────────────────────────────────────────────────────
recfail() { vr_hook_fail() { [ "$1" = recwrite ]; }; }        # 이 작업의 종료 기록 쓰기를 실패시킨다(주입)
LONGP=$(printf 'p%.0s' $(seq 1 420))                          # 긴 작업 경로(알림 한 줄 약 460바이트)
cnt_io() { grep -c '^기록 실패: bg:.* 종료 기록 쓰기$' "$1/failed_steps.txt"; }
s_flood() { local k; vr_expect a; run a true; for k in $(seq 1 200); do vr_bg "${LONGP}_$k" recfail; done; vr_wait; }
t0=$(date +%s%N); scenario flood s_flood; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
fbytes=$(( 200 * (${#LONGP} + 46) ))
{ [ $rc -eq 3 ] && [ "$(cnt_io "$TMP/flood")" = 200 ] && ! grep -q '알 수 없는 내용\|알림 읽기\|알림 기록' "$TMP/flood/failed_steps.txt" && [ $dt -lt 60000 ]; } \
  && ok "FIFO 포화: 실패 작업 200개 동시(알림 약 ${fbytes}바이트 > FIFO 64KiB) → 알림 200개 모두 전달, 교착 없음(${dt}ms), 3" \
  || bad "FIFO 포화: rc=$rc 전달=$(cnt_io "$TMP/flood") ${dt}ms $(grep -c . "$TMP/flood/failed_steps.txt")줄"
[ "$(grep -c ' exit=2$' "$TMP/flood/failed_steps.txt")" = 200 ] && [ "$(grep -c ' 종료 기록 없음$' "$TMP/flood/failed_steps.txt")" = 200 ] \
  && ok 'FIFO 포화: 부모 쪽 실패(exit=2·종료 기록 없음)도 200개씩' || bad 'FIFO 포화: 부모 쪽 실패 수'
s_mix() { local k; outer() { local j; for j in $(seq 1 80); do vr_bg "N${LONGP}_$j" recfail; done; }
          vr_expect a; run a true; vr_bg OUT outer; for k in $(seq 1 80); do vr_bg "T${LONGP}_$k" recfail; done; vr_wait; }
scenario mix s_mix; rc=$?
okmix=1; for k in $(seq 1 80); do
    [ "$(grep -cx "기록 실패: bg:T${LONGP}_$k 종료 기록 쓰기" "$TMP/mix/failed_steps.txt")" = 1 ] || okmix=0
    [ "$(grep -cx "기록 실패: bg:OUT/N${LONGP}_$k 종료 기록 쓰기" "$TMP/mix/failed_steps.txt")" = 1 ] || okmix=0
done
{ [ $rc -eq 3 ] && [ $okmix = 1 ] && [ "$(cnt_io "$TMP/mix")" = 160 ] && ! grep -q '알 수 없는 내용' "$TMP/mix/failed_steps.txt"; } \
  && ok 'FIFO 포화: 최상위 80 + 중첩 80 동시 실패 → 160개 알림이 각각 정확히 한 번 최상위까지 전달(줄 섞임 없음), 3' || bad "FIFO 포화: 중첩·동시 (rc=$rc, $(cnt_io "$TMP/mix"))"
s_longp() { inner() { recfail; }; vr_expect a; run a true; VR_BG_PATH=$(printf 'q%.0s' $(seq 1 3000)); vr_bg IN inner; VR_BG_PATH=""; vr_wait; }
scenario longp s_longp; rc=$?
{ [ $rc -eq 3 ] && [ "$(grep -c '^기록 실패: bg:q*\.\.\.(생략) 종료 기록 쓰기$' "$TMP/longp/failed_steps.txt")" = 1 ] && ! grep -q '알 수 없는 내용' "$TMP/longp/failed_steps.txt"; } \
  && ok 'FIFO 알림: 작업 경로 3000자 → 알림 한 줄을 500바이트 이하로 잘라 전달("...(생략)"), 3' || bad "FIFO 알림: 긴 경로 (rc=$rc)"
s_rdead() { vr_expect a b; run a true; kill -9 "$VR_LIFE_RD"; sleep 0.2; vr_bg B recfail; run b true; vr_wait; }
t0=$(date +%s%N); scenario rdead s_rdead; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
{ [ $rc -eq 3 ] && grep -qx '기록 실패: 후손 추적 알림 읽기(읽기 프로세스 비정상 종료)' "$TMP/rdead/failed_steps.txt" && no_alldone "$TMP/rdead"; } \
  && ok "FIFO 알림: 읽기 프로세스가 죽음 → 멈추지 않고(${dt}ms) 기록 실패, 3, ALL_DONE 없음" || bad "FIFO 알림: 읽기 프로세스 사망 (rc=$rc ${dt}ms)"
s_rdeadflood() { local k; VR__MSG_TIMEOUT=2; vr_expect a; run a true; kill -9 "$VR_LIFE_RD"; sleep 0.2; for k in $(seq 1 200); do vr_bg "${LONGP}_$k" recfail; done; vr_wait; }
t0=$(date +%s%N); scenario rdeadflood s_rdeadflood; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
{ [ $rc -eq 3 ] && grep -qx '기록 실패: 후손 추적 알림 읽기(읽기 프로세스 비정상 종료)' "$TMP/rdeadflood/failed_steps.txt" && [ $dt -lt 90000 ]; } \
  && ok "FIFO 포화: 읽기 프로세스가 죽은 채 200개 알림(버퍼 초과) → 쓰기 시간 제한으로 교착 없이 끝남(${dt}ms), 성공 아님(3)" || bad "FIFO 포화: 읽기 프로세스 사망 + 포화 (rc=$rc ${dt}ms)"
( . "$HERE/lib/verify_run.sh"; vr_hook_fail() { [ "$1" = msgwrite ]; }; vr_init "$TMP/msgw" || exit 1; vr_expect a b; run a true; vr_bg B bash -c 'exit 0'; unset -f vr_hook_fail
  body2() { recfail; run b true; }; vr_bg B2 body2; vr_wait; vr_finish > /dev/null 2>&1; [ $? -eq 3 ] && grep -qx '기록 실패: 후손 추적 알림 기록' "$TMP/msgw/failed_steps.txt" ) \
  && ok 'FIFO 알림: 읽기 프로세스가 알림을 파일에 옮기지 못함 → 기록 실패, 3' || bad 'FIFO 알림: 알림 파일 기록 실패'
( . "$HERE/lib/verify_run.sh"; vr_hook_init_fail() { [ "$1" = reader ]; }; vr_init "$TMP/rdr"; rc=$?
  [ $rc -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ -z "$VR_LDONE_R" ] && [ ! -e "$TMP/rdr/.vr_life" ] && [ ! -e "$TMP/rdr/.vr_done" ] && [ ! -e "$TMP/rdr/.vr_msgs" ] && [ "$(life_fds)" = 0 ] ) \
  && ok 'FIFO 알림: 읽기 프로세스 준비 단계 실패 → vr_init 2, FIFO 두 개·알림 파일·fd 정리' || bad 'FIFO 알림: 읽기 프로세스 준비 실패 정리'
s_ok_files() { vr_expect a; vr_bg A run a true; vr_wait; }
scenario ok_files s_ok_files; { [ $? -eq 0 ] && [ ! -e "$TMP/ok_files/.vr_life" ] && [ ! -e "$TMP/ok_files/.vr_done" ] && [ ! -e "$TMP/ok_files/.vr_msgs" ]; } \
  && ok 'FIFO 알림: 정상 경우 FIFO 두 개와 알림 파일이 모두 삭제됨' || bad 'FIFO 알림: 정상 경우 잔존'

# ── 알림 읽기 프로세스 생명주기·완료 FIFO·알림 파일 무결성(bb19f6a 반려) ──────────────────────────────────────────
# fdn <PID> <이름 패턴> <any|ro|w> : 그 프로세스에서 패턴에 맞는 대상을 가리키는 fd 수(ro = 읽기 전용, w = 쓰기 가능)
fdn() { local f n c=0 fl m; for f in /proc/$1/fd/*; do case "$(readlink "$f" 2>/dev/null)" in *$2*) n=${f##*/}
        fl=$(awk '/^flags:/{print $2}' "/proc/$1/fdinfo/$n" 2>/dev/null); m=$(( 8#${fl:-0} & 3 ))
        case $3 in any) c=$((c + 1)) ;; ro) [ $m -eq 0 ] && c=$((c + 1)) ;; w) [ $m -ne 0 ] && c=$((c + 1)) ;; esac ;; esac; done; echo $c; }
lc_fail() {   # lc_fail <이름> <설명> <기대 사유(정확한 한 줄)> : 종료 코드 3, 그 사유 있음, ALL_DONE 없음
    local rc=$4
    { [ "$rc" -eq 3 ] && grep -qxF "$3" "$TMP/$1/failed_steps.txt" && no_alldone "$TMP/$1"; } && ok "$2" || bad "$2 (rc=$rc, $(tr '\n' ';' < "$TMP/$1/failed_steps.txt" | cut -c1-200))"
}
DEAD='기록 실패: 후손 추적 알림 읽기(읽기 프로세스 비정상 종료)'
# 1. 시작 전(S 전) 사망·지연 → vr_init 실패(2)·정리
( . "$HERE/lib/verify_run.sh"; vr_hook_reader() { [ "$1" = start ] && kill -9 $BASHPID; }; VR__READER_START_TIMEOUT=2; vr_init "$TMP/lc_pre"; rc=$?
  [ $rc -eq 2 ] && [ -z "$VR_LIFE_W" ] && [ -z "$VR_LDONE_R" ] && [ -z "$VR_MSGS_R" ] && [ -z "$VR_LIFE_R" ] && [ "$(life_fds)" = 0 ] \
  && [ "$(fdn $BASHPID .vr_done any)" = 0 ] && [ "$(fdn $BASHPID .vr_msgs any)" = 0 ] && [ ! -e "$TMP/lc_pre/.vr_life" ] && [ ! -e "$TMP/lc_pre/.vr_done" ] && [ ! -e "$TMP/lc_pre/.vr_msgs" ] ) \
  && ok '읽기 프로세스: "S" 전에 사망 → vr_init 2(시작 제한 시간 안에), fd·FIFO·알림 파일 정리' || bad '읽기 프로세스: S 전 사망'
( . "$HERE/lib/verify_run.sh"; vr_hook_reader() { [ "$1" = start ] && sleep 3; }; VR__READER_START_TIMEOUT=1; VR__READER_STOP_TIMEOUT=5; t0=$SECONDS; vr_init "$TMP/lc_slow"; rc=$?
  [ $rc -eq 2 ] && [ $((SECONDS - t0)) -le 7 ] && [ "$(life_fds)" = 0 ] && [ -z "$VR__READER_STATE" ] && [ ! -e "$TMP/lc_slow/.vr_done" ] && [ ! -e "$TMP/lc_slow/.vr_msgs" ] ) \
  && ok '읽기 프로세스: "S" 가 시작 제한 시간 안에 오지 않음 → 그 프로세스의 종료를 확인한 뒤(종료 확인 제한 안) vr_init 2, 자원 정리, 무한 대기 없음' || bad '읽기 프로세스: S 지연'
# 2. S 직후 사망(작업은 모두 정상이어도 성공 아님)
s_lc_post() { kill -9 "$VR_LIFE_RD"; sleep 0.2; vr_expect a; vr_bg A run a true; vr_wait; }
scenario lc_post s_lc_post; lc_fail lc_post '읽기 프로세스: "S" 직후 사망(작업은 모두 정상) → 비정상 종료로 기록 실패, 3, ALL_DONE 없음' "$DEAD" $?
# 3. 알림 처리 도중 사망(실패 작업 200개, 50번째 알림에서) → 교착 없이 대체 대기로 남은 알림 수거
mid_hook() { vr_hook_reader() { [ "$1" = line ] && [ "$2" = 50 ] && kill -9 $BASHPID; }; }
( . "$HERE/lib/verify_run.sh"; mid_hook; vr_init "$TMP/lc_mid" || exit 9; unset -f vr_hook_reader; vr_expect a; run a true
  for k in $(seq 1 200); do vr_bg "${LONGP}_$k" recfail; done; vr_wait; t0=$SECONDS; vr_finish > "$TMP/lc_mid.finish_out" 2>&1; rc=$?
  n=$(cnt_io "$TMP/lc_mid"); echo "$rc $n $((SECONDS - t0))" > "$TMP/lc_mid.res"; [ $rc -eq 3 ] && grep -qxF "$DEAD" "$TMP/lc_mid/failed_steps.txt" && [ "$n" -ge 49 ] && no_alldone "$TMP/lc_mid" )
# 사망 전에 옮긴 49개 + 대체 대기가 FIFO 버퍼(64KiB)에서 읽은 것. 사망 뒤 vr_wait 동안 버퍼를 넘은 알림은 쓰기 시간 제한 뒤 버려진다(판정은 3).
ok_mid=$?; [ $ok_mid -eq 0 ] && ok "읽기 프로세스: 알림 200개 처리 중 50번째에서 사망 → 교착 없음, 대체 대기로 버퍼에 남은 알림 수거(전달 $(cut -d' ' -f2 "$TMP/lc_mid.res")/200 — 사망 뒤 버퍼 초과분은 시간 제한 뒤 유실), 3" || bad "읽기 프로세스: 처리 중 사망 ($(cat "$TMP/lc_mid.res" 2>/dev/null))"
# 4. R 직전 사망
( . "$HERE/lib/verify_run.sh"; vr_hook_reader() { [ "$1" = end ] && kill -9 $BASHPID; }; vr_init "$TMP/lc_end" || exit 9; unset -f vr_hook_reader
  vr_expect a; vr_bg A run a true; vr_wait; vr_finish > /dev/null 2>&1; rc=$?; [ $rc -eq 3 ] && grep -qxF "$DEAD" "$TMP/lc_end/failed_steps.txt" && no_alldone "$TMP/lc_end" ) \
  && ok '읽기 프로세스: "R" 을 쓰기 직전 사망 → R 없이 EOF, 기록 실패, 3' || bad '읽기 프로세스: R 직전 사망'
# 5. 완료 FIFO 의 잘못된 내용·중복 R·엉뚱한 S
for kind in dupR junk lateS; do
    case $kind in dupR) w='R 0' ;; junk) w='XYZ' ;; lateS) w='S 1' ;; esac
    eval "s_lc_$kind() { body() { run b true; printf '%s\n' '$w' > \"\$VR_LDONE\"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }"
    scenario "lc_$kind" "s_lc_$kind"; lc_fail "lc_$kind" "완료 FIFO: 작업이 '$w' 를 써 넣음 → 내용 이상(정확히 R 0/R 1 한 줄만 허용), 3" '기록 실패: 후손 추적 완료 FIFO 내용 이상' $?
done
# 6. 읽기 프로세스가 죽고, 생명주기 fd 를 가진 후손이 남아 있음 → 제한된 대체 대기
s_lc_hold() { VR__FALLBACK_WAIT=1; kill -9 "$VR_LIFE_RD"; sleep 0.2; holder() { ( sleep 4; : ) & }; vr_expect a; vr_bg A run a true; vr_bg H holder; vr_wait; }
t0=$(date +%s%N); scenario lc_hold s_lc_hold; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
{ [ $rc -eq 3 ] && grep -qxF '기록 실패: 후손 종료 확인 시간 초과' "$TMP/lc_hold/failed_steps.txt" && grep -qxF "$DEAD" "$TMP/lc_hold/failed_steps.txt" && [ $dt -lt 3500 ]; } \
  && ok "읽기 프로세스 사망 + 생명주기 fd 를 가진 후손이 남음, 대체 대기 1초 → 시간 초과로 끝남(${dt}ms, 무한 대기 없음), 3" || bad "읽기 프로세스 사망 + 남은 후손 (rc=$rc ${dt}ms)"
sleep 4
s_lc_hold2() { VR__FALLBACK_WAIT=10; kill -9 "$VR_LIFE_RD"; sleep 0.2; holder() { ( sleep 2; : ) & }; vr_expect a; vr_bg A run a true; vr_bg H holder; vr_wait; }
t0=$(date +%s%N); scenario lc_hold2 s_lc_hold2; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
{ [ $rc -eq 3 ] && ! grep -q '시간 초과' "$TMP/lc_hold2/failed_steps.txt" && grep -qxF "$DEAD" "$TMP/lc_hold2/failed_steps.txt" && [ $dt -ge 1500 ]; } \
  && ok "읽기 프로세스 사망 + 2초 뒤 끝나는 후손, 대체 대기 10초 → 후손 종료까지 기다려 끝남(${dt}ms), 3" || bad "읽기 프로세스 사망 + 남은 후손 대기 (rc=$rc ${dt}ms)"
# 7. 알림 파일 삭제·교체·링크·다른 종류 — 알림은 fd 로 읽혀 보존되고, 바뀐 대상은 지우지 않으며, 기록 실패(3)
for kind in del repl link dir fifo; do
    case $kind in
        del)  t='rm -f "$VR_MSGS"' ;;
        repl) t='rm -f "$VR_MSGS"; printf "E 000000000000_1_1 fake\n" > "$VR_MSGS"' ;;
        link) t='rm -f "$VR_MSGS"; ln -s "$TMP/lc_target_link" "$VR_MSGS"' ;;
        dir)  t='rm -f "$VR_MSGS"; mkdir "$VR_MSGS"' ;;
        fifo) t='rm -f "$VR_MSGS"; mkfifo "$VR_MSGS"' ;;
    esac
    eval "s_lm_$kind() { : > \"\$TMP/lc_target_link\"; tam() { run b true; $t; }; vr_expect a b; run a true; vr_bg F recfail; vr_wait; vr_bg T tam; vr_wait; }"
    scenario "lm_$kind" "s_lm_$kind"; rc=$?
    { [ $rc -eq 3 ] && grep -qxF '기록 실패: 후손 추적 알림 파일 변경' "$TMP/lm_$kind/failed_steps.txt" && grep -qxF '기록 실패: bg:F 종료 기록 쓰기' "$TMP/lm_$kind/failed_steps.txt" \
      && ! grep -q 'bg:fake' "$TMP/lm_$kind/failed_steps.txt" && no_alldone "$TMP/lm_$kind" \
      && { [ $kind = del ] || [ -e "$TMP/lm_$kind/.vr_msgs" ] || [ -L "$TMP/lm_$kind/.vr_msgs" ]; }; } \
      && ok "알림 파일: $kind → 변경 검출, 원래 알림은 fd 로 읽어 보존(가짜 알림 무시), 바뀐 대상은 지우지 않음, 3" || bad "알림 파일: $kind (rc=$rc, $(tr '\n' ';' < "$TMP/lm_$kind/failed_steps.txt" | cut -c1-160))"
done
# 8. 알림 일부만 기록되고 파일 쓰기 실패(두 번째 알림부터 실패)
( . "$HERE/lib/verify_run.sh"; vr_hook_fail() { [ "$1" = msgwrite ] && [ -s "$VR_MSGS" ]; }; vr_init "$TMP/lc_part" || exit 9
  vr_expect a; run a true; vr_bg F1 recfail; vr_wait; vr_bg F2 recfail; vr_wait; vr_finish > /dev/null 2>&1; rc=$?
  [ $rc -eq 3 ] && grep -qxF '기록 실패: 후손 추적 알림 기록' "$TMP/lc_part/failed_steps.txt" && grep -qxF '기록 실패: bg:F1 종료 기록 쓰기' "$TMP/lc_part/failed_steps.txt" ) \
  && ok '알림 파일: 첫 알림만 기록되고 이후 쓰기 실패 → 기록된 알림은 판정에 들어가고 "알림 기록" 실패, 3' || bad '알림 파일: 일부만 기록'
# 9. fd 위생: 최상위·읽기 프로세스·vr_bg 자식·run 외부 명령이 가진 fd
( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/lc_fd" || exit 9; me=$BASHPID; rd=$VR_LIFE_RD
  [ "$(fdn $me .vr_done any)" = 1 ] && [ "$(fdn $me .vr_done ro)" = 1 ] && [ "$(fdn $me .vr_msgs any)" = 1 ] && [ "$(fdn $me .vr_msgs ro)" = 1 ] \
  && [ "$(fdn $me .vr_life w)" = 1 ] && [ "$(fdn $me .vr_life ro)" = 1 ] || exit 1
  [ "$(fdn $rd .vr_done any)" = 1 ] && [ "$(fdn $rd .vr_done w)" = 1 ] && [ "$(fdn $rd .vr_msgs any)" = 1 ] && [ "$(fdn $rd .vr_msgs w)" = 1 ] \
  && [ "$(fdn $rd .vr_life any)" = 1 ] && [ "$(fdn $rd .vr_life ro)" = 1 ] || exit 2
  chk() { local p=$BASHPID; echo "$(fdn $p .vr_done any) $(fdn $p .vr_msgs any) $(fdn $p .vr_life w) $(fdn $p .vr_life ro)" > "$TMP/lc_fd.child"; }
  vr_expect a b; vr_bg C chk; vr_wait
  run a sh -c 'c=0; for f in /proc/$$/fd/*; do case "$(readlink "$f")" in *.vr_*) c=$((c+1));; esac; done; echo $c > "$0"' "$TMP/lc_fd.ext"
  run b true; vr_finish > /dev/null 2>&1 || exit 3
  [ "$(cat "$TMP/lc_fd.child")" = "0 0 1 0" ] && [ "$(cat "$TMP/lc_fd.ext")" = 0 ] || exit 4
  k=0; while kill -0 "$rd" 2>/dev/null && [ $k -lt 20 ]; do sleep 0.1; k=$((k + 1)); done   # EOF(fd 닫힘) 직후 프로세스가 사라지기까지의 짧은 틈
  ! kill -0 "$rd" 2>/dev/null || exit 5 ) ; rc=$?
[ $rc -eq 0 ] && ok 'fd 위생: 최상위(완료 FIFO 읽기 1·알림 읽기 1·생명주기 쓰기 1·읽기 1), 읽기 프로세스(완료 FIFO 쓰기 1·알림 쓰기 1·생명주기 읽기 1, 쓰기 0), vr_bg 자식(생명주기 쓰기 1만), run 외부 명령(0), 판정 뒤 읽기 프로세스 종료' || bad "fd 위생 (단계 $rc)"
# 10. 읽기 프로세스 PID 값은 판단에 쓰지 않음(재사용돼도 무관)
s_lc_pid() { VR_LIFE_RD=1; vr_expect a; vr_bg A run a true; vr_wait; }
scenario lc_pid s_lc_pid; check '읽기 프로세스: 기록된 PID 값을 바꿔도 판정 무관(상태는 완료 FIFO 로만 판단), 0' 0 $? '' "$TMP/lc_pid"

# ── 초기화 실패 뒤 읽기 프로세스 종료·회수와 재호출(eebeeec 반려) ────────────────────────────────────────────
# holders <폴더> : 그 폴더의 .vr_* (생명주기 FIFO·완료 FIFO·알림 파일)를 가리키는 fd 를 가진 프로세스 수(/proc 직접 확인)
holders() { local p c=0; for p in /proc/[0-9]*; do ls -l "$p/fd" 2>/dev/null | grep -qF "$1/.vr_" && c=$((c + 1)); done; echo $c; }
gone() { local k=0; while kill -0 "$1" 2>/dev/null && [ $k -lt 30 ]; do sleep 0.1; k=$((k + 1)); done; ! kill -0 "$1" 2>/dev/null; }
novr() { [ -z "$(ls -A "$1" 2>/dev/null | grep '^\.vr_')" ]; }
# 같은 출력 경로로 즉시 재호출: 새 읽기 프로세스가 이전 FIFO·알림 파일을 참조하지 않고(지워진 대상 없음, 현재 경로와 같은 파일), 정상 완료·정리
recall_ok() {   # recall_ok <폴더>   (vr_init 직후에 부른다)
    local d=$1 rd=$VR_LIFE_RD f t
    for f in /proc/$rd/fd/*; do t=$(readlink "$f"); case "$t" in *"(deleted)"*) return 11 ;; "$d"/.vr_*) [ "$t" -ef "$f" ] || return 12 ;; esac; done
    [ "$(fdn $rd "$d/.vr_life" ro)" = 1 ] && [ "$(fdn $rd "$d/.vr_done" w)" = 1 ] && [ "$(fdn $rd "$d/.vr_msgs" w)" = 1 ] || return 13
    vr_expect a; run a true; vr_finish > /dev/null 2>&1 || return 14
    gone "$rd" && novr "$d" && [ "$(holders "$d")" = 0 ] || return 15
}
for st in ldone msgsr msgsid; do
    ( . "$HERE/lib/verify_run.sh"; vr_hook_reader() { [ "$1" = after_s ] && printf '%s' "$BASHPID" > "$TMP/if_$st.rpid"; }
      vr_hook_init_fail() { [ "$1" = "$st" ]; }; d="$TMP/if_$st"
      vr_init "$d"; rc=$?; rp=$(cat "$TMP/if_$st.rpid")
      [ $rc -eq 2 ] && [ -n "$rp" ] && gone "$rp" && [ "$(holders "$d")" = 0 ] && novr "$d" && [ -z "$VR__READER_STATE" ] \
        && [ -z "$VR_LIFE_W$VR_LDONE_R$VR_MSGS_R$VR_LIFE_R" ] || exit 1
      unset -f vr_hook_init_fail vr_hook_reader
      vr_init "$d" || exit 2; recall_ok "$d" || exit $? ); rc=$?
    case $st in ldone) nm='A: S 수신 뒤 완료 FIFO 수신 준비(동일성 확인) 실패' ;; msgsr) nm='B: S 수신 뒤 알림 읽기 fd 열기 실패' ;; msgsid) nm='C: S 수신 뒤 알림 파일 동일성 검증 실패' ;; esac
    [ $rc -eq 0 ] && ok "초기화 실패 $nm → vr_init 2, 읽기 프로세스 종료 확인(PID·/proc), fd·FIFO·알림 파일 정리 / D: 같은 경로 즉시 재호출 성공·정상 완료·정리" || bad "초기화 실패 $nm (단계 $rc)"
done
# C′: 동일성 검증 시점에 알림 파일이 실제로 남의 파일로 바뀜 → 그 파일은 지우지 않음, 재호출은 그 자리를 비울 때까지 거부
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_repl"
  vr_hook_init_fail() { [ "$1" = msgsid ] && { rm -f "$VR_MSGS"; printf 'foreign\n' > "$VR_MSGS"; }; return 1; }
  vr_init "$d" 2> "$d.err"; rc=$?; grep -q "정리 실패.*\.vr_msgs" "$d.err" || exit 7; [ $rc -eq 2 ] && [ "$(cat "$d/.vr_msgs")" = foreign ] && [ ! -e "$d/.vr_life" ] && [ ! -e "$d/.vr_done" ] && [ "$(holders "$d")" = 0 ] || exit 1
  [ -z "$(ls -A "$d" | grep '\.del\.')" ] || exit 2
  unset -f vr_hook_init_fail; vr_init "$d"; [ $? -eq 2 ] && [ "$(cat "$d/.vr_msgs")" = foreign ] || exit 3
  rm -f "$d/.vr_msgs"; vr_init "$d" || exit 4; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok '초기화 실패 C′: 알림 파일이 남의 파일로 바뀜 → 남의 파일은 지우지 않고 보존, 나머지 정리, 재호출은 그 자리가 빌 때까지 거부(2), 비운 뒤 성공' || bad "초기화 실패 C′ (단계 $rc)"
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_del"
  vr_hook_init_fail() { [ "$1" = msgsid ] && rm -f "$VR_MSGS"; return 1; }
  vr_init "$d"; rc=$?; [ $rc -eq 2 ] && novr "$d" && [ "$(holders "$d")" = 0 ] || exit 1
  unset -f vr_hook_init_fail; vr_init "$d" || exit 2; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok '초기화 실패 C″: 동일성 검증 시점에 알림 파일이 지워짐 → vr_init 2, 정리, 같은 경로 재호출 성공' || bad "초기화 실패 C″ (단계 $rc)"
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_dir"
  vr_hook_reader() { case $1 in after_s) printf '%s' "$BASHPID" > "$TMP/if_dir.rpid" ;; start) rm -f "$VR_MSGS"; mkdir "$VR_MSGS" ;; end) sleep 2 ;; esac; }
  vr_init "$d" 2> "$d.err"; rc=$?; rp=$(cat "$TMP/if_dir.rpid"); grep -q "정리 실패.*\.vr_msgs" "$d.err" || exit 7
  [ $rc -eq 2 ] && gone "$rp" && [ -d "$d/.vr_msgs" ] && [ ! -e "$d/.vr_life" ] && [ ! -e "$d/.vr_done" ] && [ "$(holders "$d")" = 0 ] \
    && [ -z "$(ls -A "$d" | grep '\.del\.')" ] || exit 1
  unset -f vr_hook_reader; vr_init "$d"; [ $? -eq 2 ] || exit 2; rmdir "$d/.vr_msgs"; vr_init "$d" || exit 3; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok '초기화 실패 C‴: S 전에 알림 파일 자리가 디렉터리로 바뀜 → 일반 파일·쓰기 fd 와 같은 파일 확인으로 거부(2), 읽기 프로세스가 EOF 뒤 2초 더 살아도 종료 확인 뒤 반환, 남의 디렉터리는 원래 자리에 보존, 비운 뒤 재호출 성공' || bad "초기화 실패 C‴ (단계 $rc)"
# S 전 사망 / S 직후 사망 + 후속 실패 — 각각의 정리 경로
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_pre"; vr_hook_reader() { [ "$1" = start ] && kill -9 $BASHPID; }
  t0=$(date +%s%N); vr_init "$d"; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
  [ $rc -eq 2 ] && [ $dt -lt 3000 ] && [ "$(holders "$d")" = 0 ] && novr "$d" || exit 1
  unset -f vr_hook_reader; vr_init "$d" || exit 2; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok '초기화 실패: S 전 사망 → 완료 FIFO 가 곧바로 EOF(시작 제한 시간을 기다리지 않음), 정리, 같은 경로 재호출 성공' || bad "초기화 실패: S 전 사망 (단계 $rc)"
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_post"; vr_hook_reader() { [ "$1" = after_s ] && kill -9 $BASHPID; }; vr_hook_init_fail() { [ "$1" = ldone ]; }
  vr_init "$d"; rc=$?; [ $rc -eq 2 ] && [ "$(holders "$d")" = 0 ] && novr "$d" || exit 1
  unset -f vr_hook_reader vr_hook_init_fail; vr_init "$d" || exit 2; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok '초기화 실패: S 직후 사망 + 후속 단계 실패 → 정리, 같은 경로 재호출 성공' || bad "초기화 실패: S 직후 사망 (단계 $rc)"
# E: 종료 확인 실패 — 읽기 프로세스가 EOF 뒤 끝나지 않음 / 생명주기 쓰기 fd 를 가진 프로세스 때문에 EOF 를 받지 못함
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_stuck"; VR__READER_STOP_TIMEOUT=1
  vr_hook_reader() { [ "$1" = after_s ] && printf '%s' "$BASHPID" > "$TMP/if_stuck.rpid"; [ "$1" = end ] && sleep 4; }; vr_hook_init_fail() { [ "$1" = ldone ]; }
  t0=$SECONDS; vr_init "$d" 2> "$TMP/if_stuck.err"; rc=$?; rp=$(cat "$TMP/if_stuck.rpid")
  [ $rc -eq 2 ] && [ $((SECONDS - t0)) -le 3 ] && [ "$VR__READER_STATE" = stuck ] && kill -0 "$rp" && grep -q '종료 확인 실패' "$TMP/if_stuck.err" \
    && [ -p "$d/.vr_life" ] && [ -p "$d/.vr_done" ] && [ -f "$d/.vr_msgs" ] || exit 1          # 종료 확인 전에는 자원을 지우지 않음
  unset -f vr_hook_init_fail vr_hook_reader
  vr_init "$d" 2>/dev/null; [ $? -eq 2 ] && [ "$VR__READER_STATE" = stuck ] || exit 2     # 남아 있는 동안 재호출 거부
  vr_init "$TMP/if_stuck_other" 2>/dev/null; [ $? -eq 2 ] || exit 3                       # 다른 경로로도 거부
  gone "$rp" || sleep 3; gone "$rp" || exit 4
  vr_init "$d" || exit 5; [ -z "$(ls -A "$d" | grep '\.del\.')" ] || exit 6; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok 'E: 읽기 프로세스가 EOF 뒤 끝나지 않음, 종료 확인 1초 → 무한 대기 없이 2, stuck 기록, 자원 보존, 남아 있는 동안 재호출 거부, 끝난 뒤 재호출 성공·정리' || bad "E: 종료 확인 실패 (단계 $rc)"
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_hold"; VR__READER_STOP_TIMEOUT=1
  vr_hook_init_fail() { if [ "$1" = ldone ]; then ( sleep 3; : ) & return 0; fi; return 1; }
  vr_init "$d" 2>/dev/null; rc=$?; [ $rc -eq 2 ] && [ "$VR__READER_STATE" = stuck ] && [ "$(holders "$d")" -ge 2 ] || exit 1
  unset -f vr_hook_init_fail; vr_init "$d" 2>/dev/null; [ $? -eq 2 ] || exit 2
  sleep 3; VR__READER_STOP_TIMEOUT=5; vr_init "$d" || exit 3; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok 'E′: 생명주기 쓰기 fd 를 가진 프로세스가 남아 읽기 프로세스가 EOF 를 받지 못함 → 2, stuck, 재호출 거부, 그 프로세스가 끝난 뒤 재호출 성공' || bad "E′: EOF 를 받지 못함 (단계 $rc)"
# 성공한 초기화 뒤 판정 없이 같은 경로로 재호출 → 이전 읽기 프로세스 종료 확인 뒤 새 초기화
( . "$HERE/lib/verify_run.sh"; d="$TMP/if_run"; vr_init "$d" || exit 1; rp=$VR_LIFE_RD
  vr_init "$d" || exit 2; gone "$rp" || exit 3; recall_ok "$d" || exit $? ); rc=$?
[ $rc -eq 0 ] && ok '재호출: 성공한 초기화 뒤 판정 없이 같은 경로로 다시 부름 → 이전 읽기 프로세스 종료 확인, 새 초기화 정상 완료' || bad "재호출: 실행 중 재호출 (단계 $rc)"
# 소유 확인 삭제: 확인과 삭제 사이 경로 교체(경쟁 조건)
( . "$HERE/lib/verify_run.sh"; d="$TMP/rmo"; mkdir -p "$d"; VR_RUN_ID=abcabcabcabc
  printf a > "$d/mine"; exec {fd}<"$d/mine"; vr__rm_owned "$d/mine" "$fd"; [ $? -eq 0 ] && [ ! -e "$d/mine" ] || exit 1
  printf a > "$d/x"; exec {fd2}<"$d/x"; rm -f "$d/x"; printf other > "$d/x"; vr__rm_owned "$d/x" "$fd2"; [ $? -eq 1 ] && [ "$(cat "$d/x")" = other ] || exit 2
  vr__rm_owned "$d/none" "$fd"; [ $? -eq 2 ] || exit 3
  printf b > "$d/nofd"; vr__rm_owned "$d/nofd" ""; [ $? -eq 1 ] && [ -e "$d/nofd" ] || exit 4
  printf c > "$d/race"; exec {fd3}<"$d/race"; vr_hook_rm_owned() { rm -f "$1"; printf swapped > "$1"; }
  vr__rm_owned "$d/race" "$fd3"; [ $? -eq 1 ] && [ "$(cat "$d/race")" = swapped ] && [ -z "$(ls "$d" | grep '\.del\.')" ] || exit 5 ); rc=$?
[ $rc -eq 0 ] && ok '소유 확인 삭제: 내 파일 삭제 / 남의 파일 보존 / 없음 / fd 없음 보존 / 확인 직후 경로 교체(경쟁) → 교체된 남의 파일 보존·원래 자리' || bad "소유 확인 삭제 (단계 $rc)"
for which in msgs done; do
    eval "s_rmr_$which() { vr_hook_rm_owned() { case \"\$1\" in *.vr_$which) rm -f \"\$1\"; if [ $which = msgs ]; then printf foreign > \"\$1\"; else mkfifo \"\$1\"; fi ;; esac; }; vr_expect a; vr_bg A run a true; vr_wait; }"
    scenario "rmr_$which" "s_rmr_$which"; rc=$?
    { [ $rc -eq 3 ] && grep -qxF '기록 실패: 후손 추적 FIFO 삭제' "$TMP/rmr_$which/failed_steps.txt" && { [ -f "$TMP/rmr_$which/.vr_$which" ] || [ -p "$TMP/rmr_$which/.vr_$which" ]; } \
      && [ -z "$(ls -A "$TMP/rmr_$which" | grep '\.del\.')" ] && no_alldone "$TMP/rmr_$which"; } \
      && ok "판정 뒤 삭제: .vr_$which 를 확인 직후 남의 것으로 교체(경쟁) → 지우지 않고 원래 자리에 보존, 삭제 실패로 3" || bad "판정 뒤 삭제 경쟁: $which (rc=$rc)"
done

# ── df59ff0 Codex 반려: 초기화 실패 경로의 소유권, 삭제 경쟁, 엄격한 형식, 보고 파일, 플랫폼 ─────────────────────────────
ino() { stat -c '%i' "$1" 2>/dev/null; }
# 1. Codex 재현: .vr_life 를 남의 FIFO 로 바꾼 뒤 초기화 실패 → 그 FIFO 를 지우지 않음(단계별)
for st in list reader ldone; do
    ( . "$HERE/lib/verify_run.sh"; d="$TMP/own_life_$st"
      # 주입 함수 안에서는 시험의 지역 변수 d 를 쓰지 않는다(vr_init 의 local d 가 동적 스코프로 가려짐) — 라이브러리 변수로 경로를 만든다
      vr_hook_init_fail() { if [ "$1" = "$st" ]; then rm -f "$VR_LIFE"; mkfifo "$VR_LIFE"; ino "$VR_LIFE" > "$VR_OUT.ino"; return 0; fi; return 1; }
      vr_init "$d" 2> "$d.err"; rc=$?
      [ $rc -eq 2 ] && [ -p "$d/.vr_life" ] && [ "$(ino "$d/.vr_life")" = "$(cat "$d.ino")" ] && grep -q "정리 실패.*\.vr_life" "$d.err" \
        && [ -n "$VR__INIT_ERR" ] && [ -z "$(ls -A "$d" | grep '\.del\.')" ] && [ "$(holders "$d")" = 0 ] || exit 1
      unset -f vr_hook_init_fail; vr_init "$d" 2>/dev/null; [ $? -eq 2 ] && [ "$(ino "$d/.vr_life")" = "$(cat "$d.ino")" ] || exit 2 ); rc=$?
    [ $rc -eq 0 ] && ok "소유권: '$st' 단계에서 .vr_life 가 남의 FIFO 로 바뀐 뒤 초기화 실패 → 그 FIFO(같은 inode)를 지우지 않음, 정리 실패를 보고, 같은 경로 재호출 거부" || bad "소유권: .vr_life 교체 '$st' (단계 $rc)"
done
# 2. Codex 재현: .vr_msgs 를 'foreign' 일반 파일로 바꾼 뒤 초기화 실패(단계별)
for st in reader ldone; do
    ( . "$HERE/lib/verify_run.sh"; d="$TMP/own_msgs_$st"
      vr_hook_init_fail() { if [ "$1" = "$st" ]; then rm -f "$VR_MSGS"; printf foreign > "$VR_MSGS"; return 0; fi; return 1; }
      vr_init "$d" 2> "$d.err"; rc=$?
      [ $rc -eq 2 ] && [ "$(cat "$d/.vr_msgs")" = foreign ] && grep -q "정리 실패.*\.vr_msgs" "$d.err" && [ ! -e "$d/.vr_life" ] && [ ! -e "$d/.vr_done" ] || exit 1
      unset -f vr_hook_init_fail; vr_init "$d" 2>/dev/null; [ $? -eq 2 ] && [ "$(cat "$d/.vr_msgs")" = foreign ] || exit 2 ); rc=$?
    [ $rc -eq 0 ] && ok "소유권: '$st' 단계에서 .vr_msgs 가 남의 파일로 바뀐 뒤 초기화 실패 → 그 파일(내용 foreign)을 지우지 않음, 우리 FIFO 는 정리, 같은 경로 재호출 거부" || bad "소유권: .vr_msgs 교체 '$st' (단계 $rc)"
done
# 3. 만든 직후 fd 를 열기 전에 실패(소유 입증 불가) → 잔여물 보존, 정리 실패 보고, 같은 경로 재호출 거부
for st in done_created msgs_created; do
    ( . "$HERE/lib/verify_run.sh"; d="$TMP/own_nofd_$st"; vr_hook_init_fail() { [ "$1" = "$st" ]; }
      vr_init "$d" 2> "$d.err"; rc=$?
      case $st in done_created) obj="$d/.vr_done"; t=p ;; msgs_created) obj="$d/.vr_msgs"; t=f ;; esac
      [ $rc -eq 2 ] && [ -$t "$obj" ] && grep -q "정리 실패" "$d.err" && [ "$(holders "$d")" = 0 ] || exit 1
      unset -f vr_hook_init_fail; vr_init "$d" 2>/dev/null; [ $? -eq 2 ] && [ -$t "$obj" ] || exit 2
      vr_init "$d.other" || exit 3; vr_expect a; run a true; vr_finish > /dev/null 2>&1 ) ; rc=$?
    [ $rc -eq 0 ] && ok "소유권: '$st'(만든 직후 fd 열기 전) 실패 → 소유를 입증할 수 없는 객체는 잔여물로 보존, 정리 실패 보고, 같은 경로 거부, 다른 경로는 정상" || bad "소유권: $st (단계 $rc)"
done
# 4. 삭제 경쟁: 임시 목적 경로 생성 시점 / 이동 직후 / 삭제 직전 확인 시점에 남의 것이 들어옴
for stg in dir moved verified; do
    ( . "$HERE/lib/verify_run.sh"; d="$TMP/rmrace_$stg"; mkdir -p "$d"; VR_RUN_ID=abcabcabcabc
      printf mine > "$d/obj"; exec {fd}<"$d/obj"
      case $stg in
        dir)      vr_hook_rm_stage() { [ "$1" = dir ] && printf foreign > "$2"; } ;;
        moved)    vr_hook_rm_stage() { [ "$1" = moved ] && { printf foreign > "$2.x"; mv -f "$2.x" "$2"; }; } ;;
        verified) vr_hook_rm_stage() { [ "$1" = verified ] && { mkfifo "$2.x"; mv -f "$2.x" "$2"; }; } ;;
      esac
      vr__rm_owned "$d/obj" "$fd"; r=$?; [ $r -eq 1 ] || exit 1
      case $stg in
        dir)      [ "$(cat "$d/obj")" = mine ] && [ "$(cat "$d"/.vr.del.*/obj)" = foreign ] || exit 2 ;;      # 원래 것·남의 것 모두 보존(덮어쓰지 않는 이동)
        moved)    [ -f "$d/obj" ] && [ "$(cat "$d/obj")" = foreign ] && [ -z "$(ls -A "$d" | grep '\.del\.')" ] || exit 3 ;;   # 남의 것을 원래 자리로
        verified) [ -p "$d/obj" ] && [ -z "$(ls -A "$d" | grep '\.del\.')" ] || exit 4 ;;                                   # 종류(FIFO)까지 보존
      esac ); rc=$?
    [ $rc -eq 0 ] && ok "삭제 경쟁: '$stg' 시점에 남의 것이 들어옴 → 지우지 않고 내용·종류 보존(1)" || bad "삭제 경쟁: $stg (단계 $rc)"
done
for stg in moved verified; do
    eval "s_rmst_$stg() { vr_hook_rm_stage() { case \"\$2\" in *.vr.del.*) [ \"\$1\" = $stg ] && case \"\$2\" in */obj) :;; esac ;; esac; [ \"\$1\" = $stg ] && [ ! -e \"$TMP/rmst_$stg.done\" ] && { : > \"$TMP/rmst_$stg.done\"; printf foreign > \"\$2.x\"; mv -f \"\$2.x\" \"\$2\"; }; return 0; }; vr_expect a; vr_bg A run a true; vr_wait; }"
    scenario "rmst_$stg" "s_rmst_$stg"; rc=$?
    { [ $rc -eq 3 ] && grep -qxF '기록 실패: 후손 추적 FIFO 삭제' "$TMP/rmst_$stg/failed_steps.txt" && no_alldone "$TMP/rmst_$stg" \
      && [ "$(cat "$TMP/rmst_$stg/.vr_life" 2>/dev/null)" = foreign ]; } \
      && ok "판정 뒤 삭제 경쟁: 임시 목적 경로가 '$stg' 시점에 남의 파일로 바뀜 → 그 파일을 원래 자리로 보존, 삭제 실패 3, ALL_DONE 없음" || bad "판정 뒤 삭제 경쟁: $stg (rc=$rc)"
done
# 5. 상태 기록의 엄격한 형식
for kind in nl1 nl3 junk sp sym; do
    case $kind in
        nl1)  m='printf "\n" >> "$VR_ST/b.status"' ;;
        nl3)  m='printf "\n\n\n" >> "$VR_ST/b.status"' ;;
        junk) m='printf "extra" >> "$VR_ST/b.status"' ;;
        sp)   m='c=$(cat "$VR_ST/b.status"); printf "%s \n" "${c%$'"'"'\n'"'"'}" > "$VR_ST/b.status"' ;;
        sym)  m='cp "$VR_ST/b.status" "$VR_ST/b.real"; rm -f "$VR_ST/b.status"; ln -s b.real "$VR_ST/b.status"' ;;
    esac
    eval "s_stx_$kind() { vr_expect a b; run a true; run b true; $m; }"
    scenario "stx_$kind" "s_stx_$kind"; rc=$?
    exp='b 상태 기록 손상'      # sym 의 b.real 은 .status 가 아니므로 상태 폴더 검사 대상이 아님
    check "엄격한 형식: 정상 상태 기록 + '$kind' → 손상, 성공 아님" 1 $rc "$exp" "$TMP/stx_$kind"
done
# 6. 완료 FIFO: R 0 뒤 빈 줄 / 추가 레코드
for kind in nl rec; do
    case $kind in nl) w='\n' ;; rec) w='R 0\n' ;; esac
    eval "s_dnx_$kind() { body() { run b true; printf '$w' > \"\$VR_LDONE\"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }"
    scenario "dnx_$kind" "s_dnx_$kind"; lc_fail "dnx_$kind" "엄격한 형식: 완료 FIFO 에 R 0 과 함께 '$kind'(빈 줄·추가 레코드) → 내용 이상, 3" '기록 실패: 후손 추적 완료 FIFO 내용 이상' $?
done
s_mnl() { body() { run b true; printf '\n' >&"$VR_LIFE_W"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario mnl s_mnl; lc_fail mnl '엄격한 형식: 생명주기 FIFO 에 빈 줄만 씀 → 알 수 없는 내용, 3' '기록 실패: 후손 추적 FIFO 에 알 수 없는 내용' $?
# 7. 보고 파일: 심볼릭 링크로 바뀜 / 검증 도중 경로 교체
s_rp_sym() { vr_expect a; run a true; : > "$TMP/rp_sym.target"; rm -f "$VR_FAILS"; ln -s "$TMP/rp_sym.target" "$VR_FAILS"; vr_expect_sym=1; }
scenario rp_sym s_rp_sym; rc=$?
{ [ $rc -eq 3 ] && [ ! -s "$TMP/rp_sym.target" ] && [ -L "$TMP/rp_sym/failed_steps.txt" ]; } && ok '보고 파일: failed_steps.txt 가 심볼릭 링크 → 쓰지 않음(링크 대상 그대로), 기록 실패 3' || bad "보고 파일: 심볼릭 링크 (rc=$rc)"
s_rp_swap() { vr_hook_report_write() { case "$1" in */99_done.log) rm -f "$1"; printf other > "$1" ;; esac; }; vr_expect a; run a true; }
scenario rp_swap s_rp_swap; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/rp_swap" && [ "$(cat "$TMP/rp_swap/logs/99_done.log")" = other ]; } && ok '보고 파일: 99_done.log 를 쓰는 도중 경로가 바뀜 → 검증 실패, ALL_DONE 없음, 3(바뀐 파일은 그대로)' || bad "보고 파일: 검증 중 교체 (rc=$rc)"
s_rp_swap2() { vr_hook_report_write() { case "$1" in */step_status.txt) rm -f "$1"; ln -s /dev/null "$1" ;; esac; }; vr_expect a; run a true; }
scenario rp_swap2 s_rp_swap2; check '보고 파일: step_status.txt 를 쓰는 도중 심볼릭 링크로 바뀜 → 기록 실패 3' 3 $? '기록 실패: step_status.txt' "$TMP/rp_swap2"
# 8. 플랫폼 확인
( . "$HERE/lib/verify_run.sh"; uname() { echo Darwin; }; vr_init "$TMP/plat1" 2> "$TMP/plat1.err"; [ $? -eq 2 ] && grep -q '지원하지 않는 환경:.*Linux 전용' "$TMP/plat1.err" && [ ! -e "$TMP/plat1" ] ) \
  && ok '플랫폼: Linux 가 아니면 vr_init 2, 사유 출력, 출력 폴더를 만들지 않음' || bad '플랫폼: 비 Linux'
mkdir -p "$TMP/fakebin"; printf '#!/bin/sh\necho "timeout (BusyBox) 1.0"\n' > "$TMP/fakebin/timeout"; chmod +x "$TMP/fakebin/timeout"
( PATH="$TMP/fakebin:$PATH"; . "$HERE/lib/verify_run.sh"; vr_init "$TMP/plat2" 2> "$TMP/plat2.err"; [ $? -eq 2 ] && grep -q 'GNU coreutils 의 timeout 필요' "$TMP/plat2.err" ) \
  && ok '플랫폼: GNU 가 아닌 timeout → vr_init 2, 사유 출력' || bad '플랫폼: 비 GNU timeout'

# ── 97c37c9 1차 재검수 반영 ─────────────────────────────────────────────────────────────────────────────────────────
# 아래는 모두 합성 상태 주입(파일·FIFO 에 바이트를 직접 넣거나 시험용 주입 지점·함수 대체)이며, 실제 P1 실행에서 생긴 결과가 아니다.
# 9. NUL 바이트: 상태 기록(끝·중간·NUL 뒤 데이터)
for kind in nul1 nulmid nuljunk; do
    case $kind in
        nul1)    m='printf "\0" >> "$VR_ST/b.status"' ;;
        nulmid)  m='c=$(cat "$VR_ST/b.status"); printf "%s\0%s\n" "${c:0:8}" "${c:8}" > "$VR_ST/b.status"' ;;
        nuljunk) m='printf "\0junk\n" >> "$VR_ST/b.status"' ;;
    esac
    eval "s_snul_$kind() { vr_expect a b; run a true; run b true; $m; }"
    scenario "snul_$kind" "s_snul_$kind"; rc=$?
    { [ $rc -eq 1 ] && same_list 'b 상태 기록 손상' "$TMP/snul_$kind/failed_steps.txt" && no_alldone "$TMP/snul_$kind" \
      && [ "$(tr -cd '\000' < "$TMP/snul_$kind/status/b.status" | wc -c)" -ge 1 ]; } \
      && ok "NUL: 정상 상태 기록 + '$kind' → 손상, 1, ALL_DONE 없음(파일에 NUL 이 실제로 있음)" || bad "NUL: 상태 기록 $kind (rc=$rc, $(tr '\n' ';' < "$TMP/snul_$kind/failed_steps.txt" 2>/dev/null))"
done
# 10. NUL 바이트: 완료 FIFO 의 R 0 / R 1 뒤 NUL(읽기 프로세스가 R 을 쓴 직후의 주입 지점 after_r 에서 같은 쓰기 끝으로 덧붙임 — 순서 결정적)
dnul() {   # dnul <이름> <R 1 유도(1/0)> <NUL 덧붙임(1/0)>
    ( . "$HERE/lib/verify_run.sh"; R1=$2; NULX=$3
      vr_hook_reader() { case $1 in end) [ "$R1" = 1 ] && failed=1 ;; after_r) [ "$NULX" = 1 ] && printf '\0' >&"$vr__r_dw" ;; esac; return 0; }
      vr_init "$TMP/$1" || exit 9; vr_expect a b; run a true; vr_bg B run b true; vr_wait; vr_finish > "$TMP/$1.finish_out" 2>&1 ); return $?
}
dnul dnul_r0c 0 0; check "대조: 주입 지점만 정의(바이트 추가 없음) → 정상 0" 0 $? '' "$TMP/dnul_r0c"
dnul dnul_r0 0 1; lc_fail dnul_r0 "NUL: 완료 FIFO 'R 0\\n' 뒤 NUL → 내용 이상, 3, ALL_DONE 없음" '기록 실패: 후손 추적 완료 FIFO 내용 이상' $?
dnul dnul_r1c 1 0; lc_fail dnul_r1c "대조: 완료 FIFO 'R 1\\n'(NUL 없음) → 알림 기록 실패, 3(R 1 유도 확인)" '기록 실패: 후손 추적 알림 기록' $?
dnul dnul_r1 1 1; lc_fail dnul_r1 "NUL: 완료 FIFO 'R 1\\n' 뒤 NUL → 내용 이상, 3, ALL_DONE 없음" '기록 실패: 후손 추적 완료 FIFO 내용 이상' $?
# 11. NUL 바이트: 알림 파일(.vr_msgs) — NUL 만 / 정상 알림 줄 중간 / 정상 알림 줄 끝 뒤
for kind in only mid end; do
    case $kind in
        only) m='printf "\0" >> "$VR_MSGS"' ;;
        mid)  m='printf "E %s_1_1 /x\0y\n" "$VR_RUN_ID" >> "$VR_MSGS"' ;;
        end)  m='printf "E %s_1_1 /x\n\0" "$VR_RUN_ID" >> "$VR_MSGS"' ;;
    esac
    eval "s_mnul_$kind() { vr_expect a; run a true; $m; }"
    scenario "mnul_$kind" "s_mnul_$kind"; lc_fail "mnul_$kind" "NUL: .vr_msgs 에 NUL('$kind') → 알 수 없는 내용, 3, ALL_DONE 없음" '기록 실패: 후손 추적 FIFO 에 알 수 없는 내용' $?
done
# 12. NUL 바이트: 생명주기 FIFO(읽기 프로세스의 read 가 NUL 을 지우지 않게 tr 로 \001 변환) — NUL 1바이트만(개행 없음) / 알림 줄 안의 NUL
s_lnul1() { body() { run b true; printf '\0' >&"$VR_LIFE_W"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario lnul1 s_lnul1; lc_fail lnul1 'NUL: 생명주기 FIFO 에 NUL 1바이트만(개행 없음) → 사라지지 않고 알 수 없는 내용, 3' '기록 실패: 후손 추적 FIFO 에 알 수 없는 내용' $?
s_lnul2() { body() { run b true; printf 'E %s_1_1 /x\0\n' "$VR_RUN_ID" >&"$VR_LIFE_W"; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario lnul2 s_lnul2; lc_fail lnul2 'NUL: 생명주기 FIFO 의 알림 줄 안에 NUL → 알 수 없는 내용, 3' '기록 실패: 후손 추적 FIFO 에 알 수 없는 내용' $?
# 13. NUL 바이트: 보고 파일 — 쓴 뒤 다시 읽기 전에 같은 파일에 NUL 이 붙음
s_rpnul() { vr_hook_report_written() { case "$1" in */99_done.log) printf '\0' >> "$1" ;; esac; }; vr_expect a; run a true; }
scenario rpnul s_rpnul; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/rpnul" && grep -q '^NOT_DONE' "$TMP/rpnul/logs/99_done.log" && [ "$(tr -cd '\000' < "$TMP/rpnul/logs/99_done.log" | wc -c)" -eq 0 ]; } \
  && ok 'NUL: 99_done.log 를 다시 읽을 때 NUL 이 붙어 있음 → 불일치, 3, ALL_DONE 을 철회(그 파일에 ALL_DONE 이 남지 않음)' || bad "NUL: 99_done.log (rc=$rc)"
s_rpnul2() { vr_hook_report_written() { case "$1" in */step_status.txt) printf '\0' >> "$1" ;; esac; }; vr_expect a; run a true; }
scenario rpnul2 s_rpnul2; check 'NUL: step_status.txt 를 다시 읽을 때 NUL 이 붙어 있음 → 기록 실패 3' 3 $? '기록 실패: step_status.txt' "$TMP/rpnul2"
s_rpnulc() { vr_hook_report_written() { :; }; vr_expect a; run a true; }
scenario rpnulc s_rpnulc; { [ $? -eq 0 ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (1 개 항목)' "$TMP/rpnulc/logs/99_done.log"; } && ok '대조: 보고 파일 주입 지점만 정의(바이트 추가 없음) → 정상 0, ALL_DONE' || bad '대조: 보고 파일 주입 지점'
# 14. 바이트 보존 읽기 단위 시험: NUL 이 없으면 끝 개행·제어 문자·0x80 이상 바이트까지 그대로, NUL 이 있으면 4
( . "$HERE/lib/verify_run.sh"; printf 'a\n\n\\x\001\200\n\n' > "$TMP/hb1"; printf 'a\0b' > "$TMP/hb2"; : > "$TMP/hb3"
  vr__read_path_bytes v "$TMP/hb1" || exit 1; printf '%s' "$v" | cmp -s - "$TMP/hb1" || exit 2
  vr__read_path_bytes v "$TMP/hb2"; [ $? -eq 4 ] && [ -z "$v" ] || exit 3
  vr__read_path_bytes v "$TMP/hb3" && [ -z "$v" ] || exit 4
  vr__read_path_bytes v "$TMP/hb_none"; [ $? -eq 1 ] || exit 5 ); rc=$?
[ $rc -eq 0 ] && ok '바이트 보존 읽기: 끝 개행·빈 줄·백슬래시·제어 문자·0x80 그대로 / NUL → 4 / 빈 파일 → 빈 값 / 없음 → 1' || bad "바이트 보존 읽기 (단계 $rc)"
# 15. 삭제 직전 링크 수 확인: 확인 시점에 우리 객체에 다른 이름(하드 링크)이 생김 → 지우지 않고 보존(1)
( . "$HERE/lib/verify_run.sh"; RL="$TMP/rmlink"; mkdir -p "$RL"; printf mine > "$RL/obj"; exec {fd}<"$RL/obj"
  vr_hook_rm_stage() { [ "$1" = verified ] && ln "$2" "$RL/extra"; return 0; }     # 주입 함수에서는 d 를 쓰지 않는다(vr__rm_owned 의 local d)
  vr__rm_owned "$RL/obj" "$fd"; [ $? -eq 1 ] && [ "$(cat "$RL/obj")" = mine ] && [ -z "$(ls -A "$RL" | grep '\.del\.')" ] ); rc=$?
[ $rc -eq 0 ] && ok '삭제 경쟁: 삭제 직전 우리 객체의 링크 수가 1 이 아님 → 지우지 않고 원래 자리에 보존(1)' || bad "삭제 경쟁: 링크 수 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; d="$TMP/rmok"; mkdir -p "$d"; printf mine > "$d/obj"; exec {fd}<"$d/obj"
  vr__rm_owned "$d/obj" "$fd"; [ $? -eq 0 ] && [ ! -e "$d/obj" ] && [ "$(stat -L -c %h "/dev/fd/$fd")" = 0 ] && [ -z "$(ls -A "$d")" ] ); rc=$?
[ $rc -eq 0 ] && ok '소유 확인 삭제 0 의 조건: 경로 없음, fd 의 객체 링크 수 0, 임시 폴더 없음' || bad "소유 확인 삭제 0 (rc=$rc)"
# 16. 플랫폼 기능 확인(실제 옵션·동작을 직접 해 봄): 함수로 대체한 명령이 필요한 동작을 하지 않으면 vr_init 2 + 사유, 확인용 폴더를 남기지 않음
plat_t() {   # plat_t <이름> <대체 정의> <기대 사유 글자> <설명>
    ( . "$HERE/lib/verify_run.sh"; eval "$2"; vr_init "$TMP/$1" 2> "$TMP/$1.err"; [ $? -eq 2 ] && grep -qF "$3" "$TMP/$1.err" \
      && [ -z "$(ls -A "$TMP/$1" 2>/dev/null | grep 'vr\.plat')" ] ) && ok "$4" || bad "$4 ($(head -c 300 "$TMP/$1.err" 2>/dev/null))"
}
plat_t plat3 'mv() { local a=() x; for x in "$@"; do [ "$x" = -n ] || a+=("$x"); done; command mv "${a[@]}"; }' 'mv -n(있으면 덮어쓰지 않음) 동작 이상' '플랫폼 기능: mv 가 -n 을 지키지 않음(덮어씀) → vr_init 2, 사유 출력'
plat_t plat4 'mv() { local a=() x; for x in "$@"; do [ "$x" = -T ] || a+=("$x"); done; command mv "${a[@]}"; }' 'mv -T(대상을 폴더로 보지 않음) 동작 이상' '플랫폼 기능: mv 가 -T 를 지키지 않음(폴더 안으로 옮김) → vr_init 2, 사유 출력'
plat_t plat5 'stat() { case "$*" in *%h*) echo 1 ;; *) command stat "$@" ;; esac; }' 'stat -L -c %h(링크 수 1/1/1' '플랫폼 기능: stat -L -c %h 가 실제 링크 수를 주지 않음 → vr_init 2, 사유 출력'
plat_t plat6 'mktemp() { if [ "$1" = -d ]; then mkdir -p "$2" && printf "%s\n" "$2"; else command mktemp "$@"; fi; }' 'mktemp -d TEMPLATE 동작 이상' '플랫폼 기능: mktemp -d 가 TEMPLATE 의 X 를 바꾸지 않음 → vr_init 2, 사유 출력'
plat_t plat7 'mkfifo() { if [ "$1" = --version ]; then command mkfifo --version; else : > "$1"; fi; }' 'mkfifo 동작 이상' '플랫폼 기능: mkfifo 가 FIFO 를 만들지 않음 → vr_init 2, 사유 출력'
plat_t plat8 'od() { if [ "$1" = --version ]; then command od --version; else tr -d "\000" | command od "$@"; fi; }' 'od -An -v -tx1 동작 이상' '플랫폼 기능: od 가 NUL 을 보존하지 않음 → vr_init 2, 사유 출력'
[ -z "$(ls -A "$TMP/ok" | grep 'vr\.plat')" ] && ok '플랫폼 기능: 정상 초기화 뒤 확인용 폴더를 남기지 않음' || bad '플랫폼 기능: 확인용 폴더 잔존'

# ── 44ba8f9 1차 재검수 반영(합성 상태 주입·단위 시험. 실제 P1 결과 아님) ──────────────────────────────────────────────
# 17. 16진 표기 복원 단위 시험: 모든 입력을 원본 파일과 cmp -s 로 바이트 대조
( . "$HERE/lib/verify_run.sh"; H="$TMP/hx"; mkdir -p "$H"; e=0
  rt() {   # rt <이름> <printf 형식> <기대 반환>
      printf "$2" > "$H/$1"; vr__read_path_bytes v "$H/$1"; local rc=$?
      [ $rc -eq "$3" ] || { echo "  $1: 반환 $rc(기대 $3)"; return 1; }
      if [ "$3" -eq 0 ]; then printf '%s' "$v" | cmp -s - "$H/$1" || { echo "  $1: 복원 불일치"; return 1; }; else [ -z "$v" ] || { echo "  $1: 실패인데 값 남음"; return 1; }; fi
  }
  rt one 'a' 0 || e=1
  rt two 'ab' 0 || e=1
  printf -v long '%s' "$(head -c 6000 /dev/zero | tr '\000' 'x')abcdefghijklmnopqrstuvwxyz0123456789"; rt long "$long" 0 || e=1
  rt nls 'a\n\nb\n\n\n' 0 || e=1
  rt nlonly '\n' 0 || e=1
  rt ctl 'a\\b\\\\x41\001\t\r\033%%\200\377\376z' 0 || e=1
  rt nulmid 'ab\000cd' 4 || e=1
  rt nulend 'abcd\n\000' 4 || e=1
  rt empty '' 0 || e=1
  vr__hex_to_var v ' 61'; [ $? -eq 0 ] && [ "$v" = a ] || { echo '  hex 61'; e=1; }
  vr__hex_to_var v ' 61 62'; [ $? -eq 0 ] && [ "$v" = ab ] || { echo '  hex 6162'; e=1; }
  vr__hex_to_var v $' 61 62 63\n 0a'; [ $? -eq 0 ] && [ "$v" = $'abc\n' ] || { echo '  hex 여러 줄'; e=1; }
  vr__hex_to_var v ' 6'; [ $? -eq 5 ] && [ -z "$v" ] || { echo '  hex 형식 1자리'; e=1; }
  vr__hex_to_var v ' zz'; [ $? -eq 5 ] || { echo '  hex 형식 zz'; e=1; }
  exit $e ) > "$TMP/hx.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '16진 복원: 61→a, 6162→ab, 긴 ASCII(6036바이트), 여러 개행·마지막 개행, 백슬래시·제어 문자·0x80 이상 → 원본과 cmp -s 동일 / NUL 중간·끝 → 4 / 빈 파일 → 빈 값 0 / 형식 이상 → 5' || bad "16진 복원 $(tr '\n' ';' < "$TMP/hx.out")"
s_recok() { vr_expect a b; run a true; vr_bg B run b true; vr_wait
    local f id; f=$(ls "$VR_BGREC"/*.read | head -1); id=${f##*/}; id=${id%.read}
    vr__bg_read_record "$f" "$id" B && [ "$vr__rec_code" = 0 ] && [ "$vr__rec_label" = B ] && [ "$(vr_status_code b)" = 0 ] && : > "$TMP/recok.ok"; }
scenario recok s_recok; { [ $? -eq 0 ] && [ -e "$TMP/recok.ok" ]; } && ok '16진 복원 회귀: 정상 상태 기록(코드 0)·정상 bg 종료 기록(L B, C 0)을 복원 오류 없이 읽음, 판정 0' || bad '16진 복원 회귀: 정상 기록'
# 18. 파이프 종료 코드 보존(vr__read_path_bytes): cat 실패 / od 실패 / 둘 다 / 빈 파일 / od 표기 이상
mkdir -p "$TMP/odfail" "$TMP/odbad"; printf '#!/bin/sh\ncat > /dev/null\nexit 1\n' > "$TMP/odfail/od"; printf '#!/bin/sh\ncat > /dev/null\necho " zz"\n' > "$TMP/odbad/od"; chmod +x "$TMP/odfail/od" "$TMP/odbad/od"
( . "$HERE/lib/verify_run.sh"; printf 'x\n' > "$TMP/ps_f"; : > "$TMP/ps_e"; e=0
  ( cat() { return 1; }; vr__read_path_bytes v "$TMP/ps_f"; [ $? -eq 1 ] && [ -z "$v" ] ) || { echo '  cat 실패+od 성공'; e=1; }
  ( PATH="$TMP/odfail:$PATH"; vr__read_path_bytes v "$TMP/ps_f"; [ $? -eq 1 ] && [ -z "$v" ] ) || { echo '  cat 성공+od 실패'; e=1; }
  ( PATH="$TMP/odfail:$PATH"; cat() { return 1; }; vr__read_path_bytes v "$TMP/ps_f"; [ $? -eq 1 ] ) || { echo '  둘 다 실패'; e=1; }
  ( vr__read_path_bytes v "$TMP/ps_e"; [ $? -eq 0 ] && [ -z "$v" ] ) || { echo '  빈 파일'; e=1; }
  ( PATH="$TMP/odbad:$PATH"; vr__read_path_bytes v "$TMP/ps_f"; [ $? -eq 5 ] ) || { echo '  od 표기 이상'; e=1; }
  ( vr__read_path_bytes v "$TMP/ps_none"; [ $? -eq 1 ] ) || { echo '  없는 파일'; e=1; }
  ( vr__read_path_bytes v "$TMP/ps_f"; [ $? -eq 0 ] && [ "$v" = $'x\n' ] ) || { echo '  정상'; e=1; }
  exit $e ) > "$TMP/ps.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '파이프 종료 코드: cat 실패+od 성공 → 1 / cat 성공+od 실패 → 1 / 둘 다 실패 → 1 / 없는 파일 → 1 / 빈 파일 → 0·빈 값 / od 표기 이상 → 5(읽기 실패와 구분) / 정상 → 0' || bad "파이프 종료 코드 $(tr '\n' ';' < "$TMP/ps.out")"
s_psst() { vr_expect a; run a true; PATH="$TMP/odbad:$PATH"; }
scenario psst s_psst; lc_fail psst '파이프 종료 코드: 판정 중 od 가 표기 이상(5)을 냄 → 상태 기록을 유효로 보지 않음(손상), 다른 읽기도 실패, 3, ALL_DONE 없음' 'a 상태 기록 손상' $?
# 19. 읽기 프로세스의 끝 표시·EOF 분기. 주입 지점 end 에서 읽기 프로세스 안의 failed(R 의 값)·end(끝 표시 받음)와, R 을 쓰기 직전에
#     후손의 종료 표시 파일이 이미 있는지(j)를 기록한다.
rdr() {   # rdr <이름> <after_s 에서 실행할 코드> <작업 본문>
    ( . "$HERE/lib/verify_run.sh"; RN=$1; RA=$2
      vr_hook_reader() { case $1 in after_s) eval "$RA" ;; tok) printf '%s' "$2" > "$TMP/$RN.tok" ;;
          end) printf 'f=%s e=%s j=%s\n' "$failed" "${end:-0}" "$([ -e "$TMP/$RN.jobdone" ] && echo 1 || echo 0)" > "$TMP/$RN.state" ;; esac; return 0; }
      vr_init "$TMP/$1" || exit 9; eval "body() { $3; }"; vr_expect a b; run a true; vr_bg B body; vr_wait; vr_finish > "$TMP/$1.finish_out" 2>&1 ); return $?
}
rstate() { [ "$(cat "$TMP/$1.state" 2>/dev/null)" = "$2" ]; }
rdr rd_ok ':' 'run b true'; rc=$?
{ [ $rc -eq 0 ] && rstate rd_ok 'f=0 e=1 j=0'; } && ok '읽기 프로세스: tr 정상 종료 + 정상 끝 표시 + 자기 fd EOF → R 0, 판정 0' || bad "읽기 프로세스: 정상 (rc=$rc, $(cat "$TMP/rd_ok.state" 2>/dev/null))"
rdr rd_trfail 'tr() { return 3; }' 'run b true'; rc=$?
{ rstate rd_trfail 'f=1 e=0 j=0'; } && lc_fail rd_trfail '읽기 프로세스: tr 비정상 종료(종료 코드 3, 끝 표시 불일치) → R 1, 3, ALL_DONE 없음' '기록 실패: 후손 추적 알림 기록' $rc || bad "읽기 프로세스: tr 실패 (rc=$rc, $(cat "$TMP/rd_trfail.state" 2>/dev/null))"
rdr rd_badmark ':' 'run b true; printf "\002VR_END 0000000000000000 0\n" >&"$VR_LIFE_W"'; rc=$?
{ rstate rd_badmark 'f=1 e=1 j=0'; } && lc_fail rd_badmark '읽기 프로세스: 난수가 틀린 끝 표시가 들어옴 → R 1, 3' '기록 실패: 후손 추적 알림 기록' $rc || bad "읽기 프로세스: 잘못된 표식 (rc=$rc, $(cat "$TMP/rd_badmark.state" 2>/dev/null))"
rdr rd_after ':' 'run b true; local i; for i in $(seq 50); do [ -s "$TMP/rd_after.tok" ] && break; sleep 0.1; done; printf "\002VR_END %s 0\nextra\n" "$(cat "$TMP/rd_after.tok")" >&"$VR_LIFE_W"'; rc=$?
{ rstate rd_after 'f=1 e=1 j=0'; } && lc_fail rd_after '읽기 프로세스: (난수를 알아낸 가정의 위조) 끝 표시 뒤에 추가 데이터 → R 1, 3' '기록 실패: 후손 추적 알림 기록' $rc || bad "읽기 프로세스: 끝 표시 뒤 데이터 (rc=$rc, $(cat "$TMP/rd_after.state" 2>/dev/null))"
rdr rd_nul ':' 'run b true; printf "\0" >&"$VR_LIFE_W"'; rc=$?
{ rstate rd_nul 'f=1 e=0 j=0' && grep -qxF '기록 실패: 후손 추적 FIFO 에 알 수 없는 내용' "$TMP/rd_nul/failed_steps.txt"; } && lc_fail rd_nul '읽기 프로세스: 생명주기 FIFO 에 NUL 만(개행 없음) → NUL 을 잃지 않음(\001 로 남아 끝 표시와 한 줄이 됨), R 1, 알 수 없는 내용, 3' '기록 실패: 후손 추적 알림 기록' $rc || bad "읽기 프로세스: NUL 만 (rc=$rc, $(cat "$TMP/rd_nul.state" 2>/dev/null))"
rdr rd_hold ':' 'run b true; sleep 2; : > "$TMP/rd_hold.jobdone"'; rc=$?
{ [ $rc -eq 0 ] && rstate rd_hold 'f=0 e=1 j=1'; } && ok '읽기 프로세스: 후손이 생명주기 쓰기 fd 를 2초 더 가짐 → 그 후손이 끝난 뒤에야 R(0) 을 씀' || bad "읽기 프로세스: 후손 보유 (rc=$rc, $(cat "$TMP/rd_hold.state" 2>/dev/null))"
rdr rd_trhold 'tr() { return 3; }' 'run b true; sleep 2; : > "$TMP/rd_trhold.jobdone"'; rc=$?
{ rstate rd_trhold 'f=1 e=0 j=1'; } && lc_fail rd_trhold '읽기 프로세스: tr 이 곧바로 실패하고 후손이 쓰기 fd 를 2초 더 가짐 → 원래 FIFO 의 EOF(후손 종료) 뒤에야 R(1) 을 씀, 3' '기록 실패: 후손 추적 알림 기록' $rc || bad "읽기 프로세스: tr 실패 + 후손 보유 (rc=$rc, $(cat "$TMP/rd_trhold.state" 2>/dev/null))"
# 20. ALL_DONE 철회 결과 전파: 철회 성공 / 철회 실패 / 쓴 뒤 경로가 남의 파일로 바뀜(남의 파일은 그대로, 우리 객체만 철회)
{ grep -q 'ALL_DONE 은 철회함(NOT_DONE)' "$TMP/rpnul.finish_out" && grep -q '^NOT_DONE' "$TMP/rpnul/logs/99_done.log"; } && ok 'ALL_DONE 철회: 확인 실패 + 철회 성공(다시 읽어 확인) → 3, "철회함" 진단, 파일은 NOT_DONE' || bad 'ALL_DONE 철회: 성공 진단'
s_rtf() { vr_hook_report_written() { case "$1" in */99_done.log) printf '\0' >> "$1" ;; esac; }; vr_hook_report_retract() { return 0; }; vr_expect a; run a true; }
scenario rtf s_rtf; rc=$?
{ [ $rc -eq 3 ] && grep -q 'ALL_DONE 철회도 실패' "$TMP/rtf.finish_out" && ! grep -q '철회함(NOT_DONE)' "$TMP/rtf.finish_out"; } && ok 'ALL_DONE 철회: 확인 실패 + 철회 실패(주입) → 3(성공 아님), "철회도 실패" 진단을 따로 출력' || bad "ALL_DONE 철회: 실패 진단 (rc=$rc)"
s_rtsw() { vr_hook_report_written() { case "$1" in */99_done.log) rm -f "$1"; printf other2 > "$1" ;; esac; }; vr_expect a; run a true; }
scenario rtsw s_rtsw; rc=$?
{ [ $rc -eq 3 ] && [ "$(cat "$TMP/rtsw/logs/99_done.log")" = other2 ] && grep -q '철회함(NOT_DONE)' "$TMP/rtsw.finish_out"; } && ok 'ALL_DONE 철회: 쓴 뒤 경로가 남의 파일로 바뀜 → 3, 남의 파일(other2)은 그대로, 철회는 우리 객체에만' || bad "ALL_DONE 철회: 경로 교체 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; f="$TMP/wvf"; printf 'ALL_DONE\n' > "$f"; exec {w}>>"$f"; vr__wv_fail "$w" $'NOT_DONE\n'; r1=$?; [ "$(cat "$f")" = NOT_DONE ] || exit 1
  printf 'X\n' > "$f"; exec {w}>>"$f"; vr__wv_fail "$w" ""; r2=$?; [ "$(cat "$f")" = X ] || exit 2
  exec {w}>>"$f"; vr_hook_report_retract() { return 0; }; vr__wv_fail "$w" $'NOT_DONE\n'; r3=$?
  [ "$r1/$r2/$r3" = 1/1/2 ] || exit 3 ); rc=$?
[ $rc -eq 0 ] && ok 'ALL_DONE 철회 단위: 철회 성공 → 1(내용 NOT_DONE) / 철회 내용 없음 → 1(파일 그대로) / 철회 실패 → 2' || bad "ALL_DONE 철회 단위 (단계 $rc)"

# ── VR-REPORT-PREOPEN-TOCTOU(909cd75 반려) — 합성 상태 주입. 외부 대상 파일은 시험 전후 sha256 과 cmp 로 바이트 대조 ─────────────
# 21. 보고 파일 쓰기: 경로를 쓰기용으로 열지 않음(새 이름 O_EXCL 생성 → fd 로 쓰기 → lstat 재확인 → rename)
mkext() { printf 'EXTERNAL-ORIGINAL\nline2\n' > "$1"; cp "$1" "$1.orig"; }
extsame() { cmp -s "$1" "$1.orig" && [ "$(sha256sum < "$1")" = "$(sha256sum < "$1.orig")" ]; }
norep() { [ -z "$(ls -A "$1" 2>/dev/null | grep '\.vr\.rep\.')" ]; }
( . "$HERE/lib/verify_run.sh"; W="$TMP/wv21"; mkdir -p "$W"; e=0
  vr__write_verified "$W/new.txt" $'abc\n'; [ $? -eq 0 ] && [ "$(cat "$W/new.txt")" = abc ] && [ ! -L "$W/new.txt" ] || { echo '  새 파일'; e=1; }
  printf old > "$W/ex.txt"; vr__write_verified "$W/ex.txt" $'x\ny\n'; [ $? -eq 0 ] && printf 'x\ny\n' | cmp -s - "$W/ex.txt" || { echo '  기존 일반 파일'; e=1; }
  vr__write_verified "$W/empty.txt" ''; [ $? -eq 0 ] && [ -f "$W/empty.txt" ] && [ ! -s "$W/empty.txt" ] || { echo '  빈 내용'; e=1; }
  norep "$W" || { echo '  임시 이름 잔존'; e=1; }
  exit $e ) > "$TMP/wv21.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '보고 파일 쓰기: 새 파일·기존 일반 파일·빈 내용 → 0, 내용 바이트 일치, 임시 이름 남지 않음' || bad "보고 파일 쓰기: 정상 $(tr '\n' ';' < "$TMP/wv21.out")"
# 21-2/3: 첫 확인 직후·열기 직전(주입 지점 preopen)에 경로를 외부 파일을 가리키는 링크로 교체
for kind in reg new; do
  ( . "$HERE/lib/verify_run.sh"; W="$TMP/wvpre_$kind"; mkdir -p "$W"; X="$TMP/wvpre_$kind.ext"; mkext "$X"
    [ $kind = reg ] && printf old > "$W/r.txt"
    vr_hook_report_preopen() { rm -f "$1"; ln -s "$X" "$1"; }
    vr__write_verified "$W/r.txt" $'ALL_DONE: x\n' $'NOT_DONE\n'; r=$?
    [ $r -ne 0 ] && extsame "$X" && [ -L "$W/r.txt" ] && norep "$W" ); rc=$?
  [ $rc -eq 0 ] && ok "보고 파일 열기 전 경합($kind): 열기 직전 경로가 외부 파일 링크로 바뀜 → 실패, 외부 파일 바이트 그대로(sha256·cmp), 링크도 그대로, 임시 이름 없음" || bad "보고 파일 열기 전 경합 $kind"
done
# 21-3b: 임시 이름을 미리 알아내 외부 파일 링크를 만들어 둠 → O_EXCL 열기 실패(링크를 따라가지 않음)
( . "$HERE/lib/verify_run.sh"; W="$TMP/wvtmp"; mkdir -p "$W"; X="$TMP/wvtmp.ext"; mkext "$X"; printf old > "$W/r.txt"
  vr_hook_report_preopen() { ln -s "$X" "$2"; }
  vr__write_verified "$W/r.txt" $'new\n'; r=$?
  [ $r -eq 1 ] && extsame "$X" && [ "$(cat "$W/r.txt")" = old ] ); rc=$?
[ $rc -eq 0 ] && ok '보고 파일 열기 전 경합: 임시 이름에 외부 파일 링크가 먼저 있음 → O_EXCL 열기 실패 1, 외부 파일·원래 파일 바이트 그대로' || bad '보고 파일 열기 전 경합: 임시 이름 링크'
# 21-3c: 마지막 확인 뒤·rename 직전(주입 지점 prerename)에 링크로 교체 → rename 은 링크 이름을 대체할 뿐 외부 파일은 그대로
( . "$HERE/lib/verify_run.sh"; W="$TMP/wvren"; mkdir -p "$W"; X="$TMP/wvren.ext"; mkext "$X"; printf old > "$W/r.txt"
  vr_hook_report_prerename() { rm -f "$1"; ln -s "$X" "$1"; }
  vr__write_verified "$W/r.txt" $'new\n'; r=$?
  [ $r -eq 0 ] && extsame "$X" && [ ! -L "$W/r.txt" ] && [ "$(cat "$W/r.txt")" = new ] && norep "$W" ); rc=$?
[ $rc -eq 0 ] && ok '보고 파일 rename 직전 경합: 경로가 외부 파일 링크로 바뀜 → rename 이 링크 자리를 우리 파일로 대체, 외부 파일 바이트 그대로' || bad '보고 파일 rename 직전 경합'
# 21-4/5: vr_finish — ALL_DONE(철회 내용 있음)·failed_steps·step_status 에서 열기 직전 링크 교체 → 외부 파일 그대로, 성공 아님
for tgt in 99_done.log failed_steps.txt step_status.txt; do
  eval "s_pre_${tgt%%.*}() { vr_hook_report_preopen() { case \"\$1\" in */$tgt) rm -f \"\$1\"; ln -s \"$TMP/pre_${tgt%%.*}.ext\" \"\$1\" ;; esac; }; vr_expect a; run a true; }"
  mkext "$TMP/pre_${tgt%%.*}.ext"
  scenario "pre_${tgt%%.*}" "s_pre_${tgt%%.*}"; rc=$?
  { [ $rc -eq 3 ] && extsame "$TMP/pre_${tgt%%.*}.ext" && ! grep -aq 'ALL_DONE' "$TMP/pre_${tgt%%.*}.ext" && norep "$TMP/pre_${tgt%%.*}" && norep "$TMP/pre_${tgt%%.*}/logs"; } \
    && ok "vr_finish 열기 전 경합($tgt): 열기 직전 외부 파일 링크로 교체 → 3(성공 아님), 외부 파일 바이트 그대로, 임시 이름 없음" || bad "vr_finish 열기 전 경합 $tgt (rc=$rc)"
done
# 21-4b: ALL_DONE 을 놓은 뒤 확인 실패 + 경로가 외부 파일 링크로 바뀜 → 철회는 우리 객체에만, 외부 파일 그대로
s_post_ext() { vr_hook_report_written() { case "$1" in */99_done.log) rm -f "$1"; ln -s "$TMP/post_ext.ext" "$1" ;; esac; }; vr_expect a; run a true; }
mkext "$TMP/post_ext.ext"; scenario post_ext s_post_ext; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/post_ext.ext" && grep -q '철회함(NOT_DONE)' "$TMP/post_ext.finish_out"; } && ok 'ALL_DONE 철회: 놓은 뒤 경로가 외부 파일 링크로 바뀜 → 3, 철회는 우리 객체에만(외부 파일 바이트 그대로)' || bad "ALL_DONE 철회: 놓은 뒤 링크 (rc=$rc)"
# 21-6: 장치 파일 경로(/dev/full)는 일반 파일이 아니므로 열지도·rename 하지도 않음(장치 노드 보존)
( . "$HERE/lib/verify_run.sh"; vr__write_verified /dev/full x; [ $? -eq 1 ] && [ -c /dev/full ] && [ -z "$(ls -A /dev | grep '\.vr\.rep\.')" ] ); rc=$?
[ $rc -eq 0 ] && ok '보고 파일 쓰기: 장치 파일 경로 → 1, 장치 노드 그대로, /dev 에 임시 이름 없음' || bad '보고 파일 쓰기: 장치 파일'

# ── eab4a3c 보완(임시 객체 정리 실패 전파·분기·단일 작성자) — 합성 주입. 외부 파일은 사전 사본과 cmp·sha256 대조 ──────────────
# 22. vr__wv_drop 단위: 정상 정리 → 1 / 소유 입증 실패(삭제 직전 링크 수 2) → 3·경로 진단·파일 보존 / vr__rm_owned 3 → 3 / 2 인데 남음 → 3
( . "$HERE/lib/verify_run.sh"; D="$TMP/wd22"; mkdir -p "$D"; e=0
  printf '' > "$D/a"; exec {fa}<"$D/a"; vr__wv_drop "$D/a" "$fa"; [ $? -eq 1 ] && [ ! -e "$D/a" ] || { echo '  정상 정리'; e=1; }
  printf '' > "$D/b"; exec {fb}<"$D/b"; vr_hook_rm_stage() { [ "$1" = verified ] && ln "$2" "$D/b.extra"; return 0; }
  vr__wv_drop "$D/b" "$fb"; r=$?; unset -f vr_hook_rm_stage
  [ $r -eq 3 ] && [ -e "$D/b" ] && [[ "$VR__WV_LEFT" == "$D/b("*"vr__rm_owned=1"* ]] || { echo "  소유 입증 실패 r=$r [$VR__WV_LEFT]"; e=1; }
  printf '' > "$D/c"; exec {fc}<"$D/c"; ( vr__rm_owned() { return 3; }; vr__wv_drop "$D/c" "$fc"; [ $? -eq 3 ] && [[ "$VR__WV_LEFT" == *"vr__rm_owned=3"* ]] ) || { echo '  rm_owned 3'; e=1; }
  printf '' > "$D/d"; exec {fd2}<"$D/d"; ( vr__rm_owned() { return 2; }; vr__wv_drop "$D/d" "$fd2"; [ $? -eq 3 ] && [ -e "$D/d" ] && [[ "$VR__WV_LEFT" == *"링크 수 1"* ]] ) || { echo '  rm_owned 2 인데 남음'; e=1; }
  vr__wv_drop "$D/x" ""; [ $? -eq 3 ] || { echo '  fd 없음'; e=1; }
  exit $e ) > "$TMP/wd22.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '임시 객체 정리(vr__wv_drop): 정상 → 1 / 삭제 직전 링크 수 2(소유 입증 실패) → 3·경로 진단·보존 / vr__rm_owned 3 → 3 / 2 인데 남음 → 3 / fd 없음 → 3' || bad "임시 객체 정리 $(tr '\n' ';' < "$TMP/wd22.out")"
# 23. vr__write_verified 분기별: 외부 파일 불변, 우리 객체만 소유 확인 정리, 정리 실패는 3, 성공으로 가지 않음
wvb() {   # wvb <이름> <준비·주입 코드> <기대 반환> <추가 확인 코드>
  ( . "$HERE/lib/verify_run.sh"; W="$TMP/wvb_$1"; mkdir -p "$W"; X="$TMP/wvb_$1.ext"; mkext "$X"; printf old > "$W/r.txt"; cp "$W/r.txt" "$W/r.orig"
    eval "$2"; vr__write_verified "$W/r.txt" $'NEW\n' $'NOT_DONE\n'; r=$?
    [ $r -eq "$3" ] || { echo "반환 $r(기대 $3) [$VR__WV_LEFT]"; exit 1; }
    extsame "$X" || { echo '외부 파일 바뀜'; exit 2; }
    eval "$4" || { echo "추가 확인 실패 [$VR__WV_LEFT]"; exit 3; } ) > "$TMP/wvb_$1.out" 2>&1
}
wvb mkfail 'mktemp() { return 1; }; vr_hook_report_preopen() { rm -f "$1"; ln -s "$X" "$1"; }' 1 'cmp -s "$W/r.txt" "$W/r.orig" && norep "$W"' \
  && ok '분기 mktemp -u 실패 → 1, 원래 파일·외부 파일 그대로, 만든 것 없음' || bad "분기 mktemp 실패 $(cat "$TMP/wvb_mkfail.out")"
wvb badname 'mktemp() { echo "$W/bad name"; }' 1 'cmp -s "$W/r.txt" "$W/r.orig" && [ ! -e "$W/bad name" ]' \
  && ok '분기 임시 이름 형식 이상 → 1, 그 이름으로 아무것도 만들지 않음' || bad "분기 이름 형식 $(cat "$TMP/wvb_badname.out")"
wvb prelink 'vr_hook_report_preopen() { ln -s "$X" "$2"; rm -f "$1"; ln -s "$X" "$1"; PRE=$2; }' 1 '[ -L "$PRE" ] && [ "$(readlink "$PRE")" = "$X" ]' \
  && ok '분기 임시 이름을 외부 파일 링크가 선점(경로도 링크로) → O_EXCL 실패 1, 선점 링크를 지우지 않음, 외부 파일 그대로' || bad "분기 선점 링크 $(cat "$TMP/wvb_prelink.out")"
wvb prereg 'vr_hook_report_preopen() { printf PRE > "$2"; PRE=$2; }' 1 '[ "$(cat "$PRE")" = PRE ] && cmp -s "$W/r.txt" "$W/r.orig"' \
  && ok '분기 임시 이름을 남의 일반 파일이 선점 → O_EXCL 실패 1, 선점 파일(내용 PRE)을 지우지도 쓰지도 않음' || bad "분기 선점 일반 파일 $(cat "$TMP/wvb_prereg.out")"
wvb opensize 'vr_hook_report_opened() { printf z >> "$1"; rm -f "$3"; ln -s "$X" "$3"; }' 1 'norep "$W" && [ -L "$W/r.txt" ]' \
  && ok '분기 fd 확인 실패(만든 객체에 1바이트 — 크기 ≠ 0, 경로도 외부 링크로) → 우리 객체를 소유 확인 정리 1, 외부 파일 그대로' || bad "분기 크기 변조 $(cat "$TMP/wvb_opensize.out")"
wvb openlink 'vr_hook_report_opened() { ln "$1" "$W/keep"; TMPN=$1; }' 3 '[ -e "$TMPN" ] && [[ "$VR__WV_LEFT" == "$TMPN("* ]] && cmp -s "$W/r.txt" "$W/r.orig"' \
  && ok '분기 fd 확인 실패(만든 객체에 하드 링크 — 링크 수 2) → 소유 입증 실패로 지우지 않음, 3, 남은 경로를 진단에 남김' || bad "분기 링크 수 변조 $(cat "$TMP/wvb_openlink.out")"
wvb openswap 'vr_hook_report_opened() { rm -f "$1"; printf FOREIGN > "$1"; TMPN=$1; }' 1 '[ "$(cat "$TMPN")" = FOREIGN ]' \
  && ok '분기 만든 직후 임시 이름이 남의 파일로 바뀜(우리 객체 링크 수 0) → 남의 파일을 지우지 않음, 1' || bad "분기 이름 교체 $(cat "$TMP/wvb_openswap.out")"
wvb openmove 'vr_hook_report_opened() { mv "$1" "$W/moved"; printf FOREIGN > "$1"; TMPN=$1; }' 3 '[ "$(cat "$TMPN")" = FOREIGN ] && [ -e "$W/moved" ] && [[ "$VR__WV_LEFT" == "$TMPN("* ]]' \
  && ok '분기 만든 직후 우리 객체가 다른 이름으로 옮겨지고 그 자리에 남의 파일 → 남의 파일을 지우지 않음, 우리 객체가 남았으므로 3·진단' || bad "분기 이름 이동 $(cat "$TMP/wvb_openmove.out")"
wvb content 'vr_hook_fail() { [ "$1" = report_content ]; }' 1 'norep "$W" && cmp -s "$W/r.txt" "$W/r.orig"' \
  && ok '분기 내용 쓰기 실패 → 우리 객체 정리 1, 원래 파일 그대로' || bad "분기 내용 쓰기 $(cat "$TMP/wvb_content.out")"
wvb contentleft 'vr_hook_fail() { [ "$1" = report_content ]; }; vr_hook_rm_stage() { [ "$1" = verified ] && ln "$2" "$W/keep2"; return 0; }' 3 '[ -n "$VR__WV_LEFT" ] && [ -e "${VR__WV_LEFT%%(*}" ] && cmp -s "$W/r.txt" "$W/r.orig"' \
  && ok '분기 내용 쓰기 실패 + 정리 실패(삭제 직전 링크 수 2) → 3, 남은 임시 경로가 실제로 있고 진단에 포함' || bad "분기 내용 쓰기+정리 실패 $(cat "$TMP/wvb_contentleft.out")"
wvb idchg 'vr_hook_report_write() { rm -f "$1"; ln -s "$X" "$1"; }' 1 'norep "$W" && [ -L "$W/r.txt" ]' \
  && ok '분기 쓰는 동안 출력 경로 식별자 변경(외부 링크로) → 우리 객체 정리 1, 링크·외부 파일 그대로' || bad "분기 식별자 변경 $(cat "$TMP/wvb_idchg.out")"
wvb renfail 'vr_hook_report_prerename() { rm -f "$1"; mkdir "$1"; }' 1 'norep "$W" && [ -d "$W/r.txt" ] && [ -z "$(ls -A "$W/r.txt")" ]' \
  && ok '분기 rename 실패(경로가 폴더로 바뀜) → 우리 객체 정리 1, 폴더 그대로(비어 있음)' || bad "분기 rename 실패 $(cat "$TMP/wvb_renfail.out")"
# 24. vr_finish 까지 전파: 정리 실패 → 기록 실패(3), 남은 경로가 보고에, ALL_DONE 없음
fin_left() {   # fin_left <이름> <보고 파일 이름>
  eval "s_fl_$1() { vr_hook_report_opened() { case \"\$3\" in */$2) ln \"\$1\" \"\$1.keep\" ;; esac; }; vr_expect a; run a true; }"
  scenario "fl_$1" "s_fl_$1"
}
fin_left done 99_done.log; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/fl_done" && grep -q '임시 파일 정리 실패: .*\.vr\.rep\.' "$TMP/fl_done.finish_out" && [ -n "$(ls -A "$TMP/fl_done/logs" | grep '\.vr\.rep\.')" ]; } \
  && ok 'vr_finish 전파(99_done.log·ALL_DONE): 임시 객체 정리 실패 → 3, ALL_DONE 없음, 진단에 남은 .vr.rep 경로, 그 파일은 보존' || bad "vr_finish 전파 99_done (rc=$rc)"
fin_left fails failed_steps.txt; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/fl_fails" && grep -q '^기록 실패: 임시 파일 정리 .*\.vr\.rep\.' "$TMP/fl_fails/logs/99_done.log" && grep -qx '기록 실패: failed_steps.txt' "$TMP/fl_fails/logs/99_done.log"; } \
  && ok 'vr_finish 전파(failed_steps.txt): 정리 실패 → 3, 99_done.log 에 "기록 실패: failed_steps.txt"와 남은 경로' || bad "vr_finish 전파 failed_steps (rc=$rc)"
fin_left steps step_status.txt; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/fl_steps" && grep -q '^기록 실패: 임시 파일 정리 .*\.vr\.rep\.' "$TMP/fl_steps/failed_steps.txt"; } \
  && ok 'vr_finish 전파(step_status.txt): 정리 실패 → 3, failed_steps.txt 에 남은 경로' || bad "vr_finish 전파 step_status (rc=$rc)"
s_fl_mk() { mktemp() { [ "$1" = -u ] && return 1; command mktemp "$@"; }; vr_expect a; run a true; }
scenario fl_mk s_fl_mk; rc=$?
{ [ $rc -ne 0 ] && no_alldone "$TMP/fl_mk"; } && ok 'vr_finish 전파: 임시 이름 생성(mktemp -u) 실패 → 성공 아님, ALL_DONE 없음' || bad "vr_finish 전파 mktemp (rc=$rc)"
s_fl_ct() { vr_hook_fail() { [ "$1" = report_content ]; }; vr_expect a; run a true; }
scenario fl_ct s_fl_ct; rc=$?
{ [ $rc -ne 0 ] && no_alldone "$TMP/fl_ct"; } && ok 'vr_finish 전파: 보고 내용 쓰기 실패 → 성공 아님, ALL_DONE 없음' || bad "vr_finish 전파 내용 쓰기 (rc=$rc)"
# 25. 단일 작성자: vr_finish 는 vr_init 을 부른 셸에서만 — 백그라운드 작업·명령 치환에서 부르면 3, 보고 파일을 쓰지 않음
s_cc_bg() { body() { run b true; vr_finish > "$TMP/cc_bg.out" 2>&1; echo $? > "$TMP/cc_bg.rc"; [ -e "$VR_DONE" ] && : > "$TMP/cc_bg.wrote"; return 0; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }
scenario cc_bg s_cc_bg; rc=$?
{ [ $rc -eq 0 ] && [ "$(cat "$TMP/cc_bg.rc")" = 3 ] && grep -q 'vr_init 을 부른 셸' "$TMP/cc_bg.out" && [ ! -e "$TMP/cc_bg.wrote" ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (2 개 항목)' "$TMP/cc_bg/logs/99_done.log"; } \
  && ok '단일 작성자: 백그라운드 작업 안에서 vr_finish → 3·보고 파일 쓰지 않음, 최상위 vr_finish 는 정상(보고 유실 없음)' || bad "단일 작성자: 백그라운드 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/cc_cs" || exit 9; vr_expect a; run a true; out=$(vr_finish 2>&1); r=$?; [ $r -eq 3 ] && [ ! -e "$TMP/cc_cs/logs/99_done.log" ] || exit 1
  vr_finish > /dev/null 2>&1 ) ; rc=$?
{ [ $rc -eq 0 ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (1 개 항목)' "$TMP/cc_cs/logs/99_done.log"; } && ok '단일 작성자: 명령 치환 안의 vr_finish → 3·보고 파일 없음, 이어서 최상위 vr_finish 는 정상' || bad "단일 작성자: 명령 치환 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/cc_two" || exit 9; vr_expect a; run a true
  ( . "$HERE/lib/verify_run.sh"; vr_init "$TMP/cc_two" 2>/dev/null; echo $? > "$TMP/cc_two.second" )
  vr_finish > /dev/null 2>&1 ); rc=$?
{ [ $rc -eq 0 ] && [ "$(cat "$TMP/cc_two.second")" = 2 ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (1 개 항목)' "$TMP/cc_two/logs/99_done.log" && [ -s "$TMP/cc_two/step_status.txt" ]; } \
  && ok '단일 작성자: 실행 중인 출력 폴더에 다른 프로세스의 두 번째 vr_init → 2(생명주기 FIFO 배타 생성), 첫 실행의 보고는 그대로' || bad "단일 작성자: 두 번째 vr_init (rc=$rc)"

# ── 재현성: 처리기 return 3 + builtin exit 5 를 10번 반복(매번 5) ──────────────────────────────────────────────
rep_ok=0; for k in 1 2 3 4 5 6 7 8 9 10; do
    eval "s_rep_$k() { body() { trap 'return 3' EXIT; builtin exit 5; }; vr_expect a; run a true; vr_bg B body; vr_wait; }"
    scenario "rep_$k" "s_rep_$k"; [ $? -eq 1 ] && same_list 'bg:B exit=5' "$TMP/rep_$k/failed_steps.txt" && rep_ok=$((rep_ok + 1))
done
[ $rep_ok -eq 10 ] && ok '재현성: 처리기 return 3 + builtin exit 5 를 10번 반복, 10번 모두 bg:B exit=5' || bad "재현성: return 3 + builtin exit 5 반복 ${rep_ok}/10"

# ── RE-2 남은 위험: 실행 표식을 쓰기 전에 부모가 강제 종료 ─────────────────────────────────────────────
s_win() { outer() { vr_hook_bg_before_mark() { kill -9 $BASHPID; }; vr_bg IN bash -c 'sleep 1; exit 5'; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario win s_win 2>/dev/null; checkn 'RE-2: 표식 전에 부모가 죽은 후손(1초 뒤 exit 5) → 생명주기 추적으로 기다려 흡수' 1 $? "bg:OUT exit=137${NL}bg:OUT/IN exit=5${NL}bg 종료 기록 미회수: <ID>" "$TMP/win"
re_bg_dir_ok "$TMP/win" && ok 'RE-2: 표식 없는 후손도 판정 시점에 처리 완료' || bad "RE-2: bg: $(ls -A "$TMP/win/bg" | tr '\n' ' ')"
s_win_k() { outer() { vr_hook_bg_before_mark() { kill -9 $BASHPID; }; vr_bg IN wk; }; wk() { sleep 1; : > "$TMP/win_k_done"; kill -9 $BASHPID; }; vr_expect a; run a true; vr_bg OUT outer; vr_wait; }
scenario win_k s_win_k 2>/dev/null; checkn 'RE-2: PID 를 적기 전에 부모가 죽고 후손도 기록 없이 강제 종료 → 부모 실패 + 예약 표식으로 "종료 기록 없음"' 1 $? "bg:OUT exit=137${NL}bg 종료 기록 없음(회수되지 않은 작업): <ID>" "$TMP/win_k"
[ -f "$TMP/win_k_done" ] && ok 'RE-2: 판정은 그 후손이 끝난 뒤에 이루어짐(판정 뒤에 실행 중인 후손 없음)' || bad 'RE-2: 판정이 후손 종료보다 먼저'
s_runbg() { vr_expect a; run a sh -c 'sleep 3 > /dev/null 2>&1 &'; }
t0=$(date +%s%N); scenario runbg s_runbg; rc=$?; dt=$(( ($(date +%s%N) - t0) / 1000000 ))   # 밀리초(초 단위 $SECONDS 는 경계에서 1초 오차)
{ [ $rc -eq 0 ] && [ $dt -lt 2500 ]; } && ok "RE-2: run 으로 실행한 명령이 남긴 프로세스(sleep 3)는 기다리지 않음(${dt}ms < 2500ms)" || bad "RE-2: run 명령의 잔여 프로세스 대기 (rc=$rc, ${dt}ms)"

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
