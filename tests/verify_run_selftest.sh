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
# (bed4eb4 반려 P2 뒤 보강) 위 시험은 이제 기존 보고 파일 때문에 먼저 거부되므로, bg 기록 검사 자체를 따로 확인: 보고 파일을 치우고 bg 기록만 남김
( . "$HERE/lib/verify_run.sh"; O="$TMP/restart2"; vr_init "$O" || exit 1; vr_expect a; vr_bg A run a true; vr_wait; vr_finish > /dev/null 2>&1 || exit 2
  rm -rf "$O/status" "$O/logs"; rm -f "$O/failed_steps.txt" "$O/expected_steps.txt" "$O/step_status.txt"; [ -n "$(ls -A "$O/bg")" ] || exit 3
  b0=$(ls -A "$O/bg" | sort); vr_init "$O" 2>/dev/null; [ $? -eq 2 ] && [ "$(ls -A "$O/bg" | sort)" = "$b0" ] && [ ! -e "$O/.vr_lock" ] && [ ! -e "$O/failed_steps.txt" ] ); rc=$?
[ $rc -eq 0 ] && ok '결함 1(보강): 보고 파일은 없고 이전 실행의 bg 기록만 남은 폴더 → bg 기록 검사로 vr_init 2, bg 기록 그대로, 이번에 만든 파일·잠금 정리' || bad "결함 1(보강) bg 기록 검사 (rc=$rc)"
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
  # [기대값 변경 — 9ea9696 이후 bed4eb4 반려 P2: 최종 경로의 기존 객체를 대체하지 않음] 우리 것이 아닌 기존 일반 파일 → 1·그대로 /
  # 우리 객체(만든 fd 를 가진 것)는 소유 확인 뒤 교체 → 0
  printf old > "$W/ex.txt"; vr__write_verified "$W/ex.txt" $'x\ny\n'; [ $? -eq 1 ] && [ "$(cat "$W/ex.txt")" = old ] || { echo '  기존 일반 파일(남의 것)'; e=1; }
  exec {OWN}>"$W/own.txt"; printf old >&$OWN; vr__write_verified "$W/own.txt" $'x\ny\n' "" "$OWN"; [ $? -eq 0 ] && printf 'x\ny\n' | cmp -s - "$W/own.txt" || { echo '  기존 일반 파일(우리 것)'; e=1; }; exec {OWN}>&-
  vr__write_verified "$W/empty.txt" ''; [ $? -eq 0 ] && [ -f "$W/empty.txt" ] && [ ! -s "$W/empty.txt" ] || { echo '  빈 내용'; e=1; }
  norep "$W" || { echo '  임시 이름 잔존'; e=1; }
  exit $e ) > "$TMP/wv21.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '보고 파일 쓰기: 새 파일·기존 일반 파일·빈 내용 → 0, 내용 바이트 일치, 임시 이름 남지 않음' || bad "보고 파일 쓰기: 정상 $(tr '\n' ';' < "$TMP/wv21.out")"
# 21-2/3: 첫 확인 직후·열기 직전(주입 지점 preopen)에 경로를 외부 파일을 가리키는 링크로 교체
for kind in reg new; do
  ( . "$HERE/lib/verify_run.sh"; W="$TMP/wvpre_$kind"; mkdir -p "$W"; X="$TMP/wvpre_$kind.ext"; mkext "$X"
    OWN=""; [ $kind = reg ] && { exec {OWN}>"$W/r.txt"; printf old >&$OWN; }      # [준비 변경] 기존 파일은 우리 객체(fd)로 — 열기 직전 경합까지 가게
    vr_hook_report_preopen() { rm -f "$1"; ln -s "$X" "$1"; }
    vr__write_verified "$W/r.txt" $'ALL_DONE: x\n' $'NOT_DONE\n' "$OWN"; r=$?
    [ $r -ne 0 ] && extsame "$X" && [ -L "$W/r.txt" ] && norep "$W" ); rc=$?
  [ $rc -eq 0 ] && ok "보고 파일 열기 전 경합($kind): 열기 직전 경로가 외부 파일 링크로 바뀜 → 실패, 외부 파일 바이트 그대로(sha256·cmp), 링크도 그대로, 임시 이름 없음" || bad "보고 파일 열기 전 경합 $kind"
done
# 21-3b: 임시 이름을 미리 알아내 외부 파일 링크를 만들어 둠 → O_EXCL 열기 실패(링크를 따라가지 않음)
( . "$HERE/lib/verify_run.sh"; W="$TMP/wvtmp"; mkdir -p "$W"; X="$TMP/wvtmp.ext"; mkext "$X"; printf old > "$W/r.txt"
  vr_hook_report_preopen() { ln -s "$X" "$2"; }
  vr__write_verified "$W/r.txt" $'new\n'; r=$?
  [ $r -eq 1 ] && extsame "$X" && [ "$(cat "$W/r.txt")" = old ] ); rc=$?
[ $rc -eq 0 ] && ok '보고 파일 열기 전 경합: 임시 이름에 외부 파일 링크가 먼저 있음 → O_EXCL 열기 실패 1, 외부 파일·원래 파일 바이트 그대로' || bad '보고 파일 열기 전 경합: 임시 이름 링크'
# 21-3c: 마지막 확인 뒤·놓기 직전(주입 지점 prerename)에 경로를 외부 링크로 교체
# [기대값 변경 — bed4eb4 반려 P2: 이전에는 "rename 이 링크 자리를 대체 → 0" 을 기대했으나, 덮어쓰지 않는 놓기로 바뀌어 링크를 보존하고 실패]
( . "$HERE/lib/verify_run.sh"; W="$TMP/wvren"; mkdir -p "$W"; X="$TMP/wvren.ext"; mkext "$X"; exec {OWN}>"$W/r.txt"; printf old >&$OWN
  vr_hook_report_prerename() { rm -f "$1"; ln -s "$X" "$1"; }
  i0=$(stat -c %i "$W/r.txt" 2>/dev/null)
  vr__write_verified "$W/r.txt" $'new\n' "" "$OWN"; r=$?
  [ $r -eq 1 ] && extsame "$X" && [ -L "$W/r.txt" ] && [ "$(readlink "$W/r.txt")" = "$X" ] && norep "$W" ); rc=$?
[ $rc -eq 0 ] && ok '보고 파일 놓기 직전 경합: 경로가 외부 파일 링크로 바뀜 → 그 링크를 대체하지 않고 실패 1, 링크·외부 파일 바이트 그대로, 임시 이름 없음' || bad '보고 파일 rename 직전 경합'
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
  # [준비 변경 — bed4eb4 반려 P2] 기존 r.txt 는 우리 객체(fd)로 만든다(남의 기존 파일은 이제 처음부터 대체하지 않으므로 분기까지 가지 않음)
  ( . "$HERE/lib/verify_run.sh"; W="$TMP/wvb_$1"; mkdir -p "$W"; X="$TMP/wvb_$1.ext"; mkext "$X"; exec {OWN}>"$W/r.txt"; printf old >&$OWN; cp "$W/r.txt" "$W/r.orig"
    eval "$2"; vr__write_verified "$W/r.txt" $'NEW\n' $'NOT_DONE\n' "$OWN"; r=$?
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

# ── 파일 쓰기 경로 전체 안전성(설계 v2) — 합성 주입. 외부 파일은 사전 사본과 cmp·sha256. 멈춤 위험이 있는 경우는 timeout 으로 감쌈 ─────────
TO=20   # 시험 하나의 시간 제한(초). 멈추면 124 → 실패로 표시
# 26-0. bash noclobber 동작표 고정(설계 9-1): FIFO·FIFO 링크는 멈춤, 장치·장치 링크는 열림, 나머지는 거부
( D="$TMP/nc"; mkdir -p "$D"; cd "$D"; printf R > reg; ln -s reg l_reg; ln -s nx l_dang; mkfifo fifo; ln -s fifo l_fifo; ln -s /dev/null l_dev; mkdir dir
  out=""; for t in new reg l_reg l_dang fifo l_fifo /dev/null l_dev dir; do r=$(timeout 2 bash -c 'set -C; exec 3>"$1" 2>/dev/null && echo O || echo R' _ "$t" 2>/dev/null); [ $? -eq 124 ] && r=B; out+="$t=$r "; done
  [ "$out" = "new=O reg=R l_reg=R l_dang=R fifo=B l_fifo=B /dev/null=O l_dev=O dir=R " ] && [ "$(cat reg)" = R ] && [ ! -e nx ] || { echo "$out"; exit 1; } ) > "$TMP/nc.out" 2>&1
[ $? -eq 0 ] && ok 'noclobber 동작표(실측 고정): 없음 생성 / 일반·링크·대상 없는 링크·폴더 거부 / FIFO·FIFO 링크 멈춤 / 장치·장치 링크 열림' || bad "noclobber 동작표 $(cat "$TMP/nc.out")"
# 26-1. vr__new_obj: 선점(일반·링크→외부·대상 없는 링크·FIFO·FIFO 링크·장치 링크) → 2, 멈추지 않음, 선점된 것·외부 파일 그대로
for kind in reg lext dang fifo lfifo ldev; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/no_$kind"; mkdir -p "$D"; X="$TMP/no_$kind.ext"; mkext "$X"; mkfifo "$D/f0"
    case $kind in reg) printf PRE > "$D/t" ;; lext) ln -s "$X" "$D/t" ;; dang) ln -s "$D/nx" "$D/t" ;; fifo) mkfifo "$D/t" ;; lfifo) ln -s "$D/f0" "$D/t" ;; ldev) ln -s /dev/null "$D/t" ;; esac
    before=$(stat -c '%i:%F' "$D/t")
    vr__new_obj "$D/t" fd; r=$?
    [ $r -eq 2 ] && [ -z "$fd" ] && extsame "$X" && [ "$(stat -c '%i:%F' "$D/t")" = "$before" ] && [ ! -e "$D/nx" ] ) & wp=$!
  ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
  [ $rc -eq 0 ] && ok "안전 생성 선점($kind): 열지 않고 2, 멈추지 않음, 선점된 것·외부 파일 그대로" || bad "안전 생성 선점 $kind (rc=$rc)"
done
# 26-2. vr__new_obj 확인~열기 경합(주입 지점 preopen): 링크→외부 / FIFO 링크 → 열기 실패(외부 그대로) 또는 멈춤 위험(문서화된 경계: 시간 제한 안에 끝나는지만 확인하지 않고, 경계로 기록)
( . "$HERE/lib/verify_run.sh"; D="$TMP/nopre"; mkdir -p "$D"; X="$TMP/nopre.ext"; mkext "$X"
  vr_hook_new_obj_preopen() { ln -s "$X" "$1"; }
  vr__new_obj "$D/t" fd; r=$?; [ $r -eq 2 ] && extsame "$X" && [ -L "$D/t" ] ); rc=$?
[ $rc -eq 0 ] && ok '안전 생성 확인~열기 경합: 그 사이 외부 파일 링크가 생김 → O_EXCL 거부 2, 외부 파일 그대로' || bad "안전 생성 확인~열기 경합 (rc=$rc)"
# 26-3. vr__new_obj 소유 증명 실패 → 쓰기·삭제 금지
( . "$HERE/lib/verify_run.sh"; D="$TMP/noown"; mkdir -p "$D"; e=0
  vr_hook_new_obj_opened() { rm -f "$1"; printf FOREIGN > "$1"; }; vr__new_obj "$D/a" fd; r=$?; unset -f vr_hook_new_obj_opened
  [ $r -eq 1 ] && [ "$(cat "$D/a")" = FOREIGN ] || { echo "  이름 교체 r=$r"; e=1; }
  vr_hook_new_obj_opened() { ln "$1" "$D/b.keep"; }; vr__new_obj "$D/b" fd; r=$?; unset -f vr_hook_new_obj_opened
  { [ $r -eq 3 ] && [ -e "$D/b" ] && [ "$D/b" -ef "$D/b.keep" ] && [[ "$VR__WV_LEFT" == "$D/b("* ]]; } || { echo "  링크 수 r=$r"; e=1; }
  vr_hook_new_obj_opened() { printf z >> "$1"; }; vr__new_obj "$D/c" fd; r=$?; unset -f vr_hook_new_obj_opened
  [ $r -eq 1 ] && [ ! -e "$D/c" ] || { echo "  크기 r=$r"; e=1; }
  exit $e ) > "$TMP/noown.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '안전 생성 소유 증명 실패: 이름이 남의 파일로 바뀜 → 1·남의 파일 그대로 / 링크 수 2 → 3·보존 / 크기 변조(우리 객체) → 소유 확인 정리 1' || bad "안전 생성 소유 증명 $(tr '\n' ';' < "$TMP/noown.out")"
# 26-4. /dev/fd/N O_APPEND 재열기: 접근 모드 쓰기 전용·O_APPEND·inode 같음·원래 fd 닫힘 / 여러 프로세스 추가가 빠짐없이
( . "$HERE/lib/verify_run.sh"; D="$TMP/app"; mkdir -p "$D"; e=0
  vr__new_placed "$D/f.txt" fd append || exit 1
  fl=$(vr__fd_flags "$fd"); (( (8#$fl & 3) == 1 && (8#$fl & 02000) != 0 )) || { echo "  flags $fl"; e=1; }
  [ "$D/f.txt" -ef "/dev/fd/$fd" ] || { echo '  inode'; e=1; }
  # [확인 방식 변경 — bed4eb4 반려 P2: link(2) 로 놓은 뒤 임시 이름을 지우므로 fd 의 이름 표시가 임시 이름 "(deleted)" 가 된다. 이름 대신 같은 객체(-ef)로 센다]
  n=0; for x in /proc/$BASHPID/fd/*; do [ "$x" -ef "$D/f.txt" ] && n=$((n + 1)); done; [ $n -eq 1 ] || { echo "  열린 fd 수 $n"; e=1; }
  ls -A "$D" | grep -q '\.vr\.new\.' && { echo '  임시 이름 남음'; e=1; }
  for k in 1 2 3 4 5 6 7 8; do ( for j in $(seq 1 50); do printf 'w%s-%s\n' "$k" "$j" >&"$fd"; done ) & done; wait
  [ "$(wc -l < "$D/f.txt")" -eq 400 ] || { echo "  줄 수 $(wc -l < "$D/f.txt")"; e=1; }
  for k in 1 2 3 4 5 6 7 8; do [ "$(grep -c "^w$k-" "$D/f.txt")" -eq 50 ] || { echo "  작성자 $k 누락"; e=1; }; done
  [ "$(grep -cvE '^w[1-8]-[0-9]+$' "$D/f.txt")" -eq 0 ] || { echo '  깨진 줄'; e=1; }
  exit $e ) > "$TMP/app.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok 'O_APPEND 재열기: 쓰기 전용+O_APPEND, inode 같음, 원래 fd 닫힘(열린 fd 1개), 하위 셸 8개 × 50줄 추가가 빠짐없이·줄 단위로' || bad "O_APPEND 재열기 $(tr '\n' ';' < "$TMP/app.out")"
# 26-5. 초기화 3개 경로에 미리 놓인 외부 파일 링크 → vr_init 2, 외부 그대로, 잠금 해제됨
for tgt in failed_steps.txt expected_steps.txt status/_violations.txt; do
  k=${tgt##*/}; k=${k%%.*}
  ( . "$HERE/lib/verify_run.sh"; O="$TMP/ipre_$k"; X="$TMP/ipre_$k.ext"; mkext "$X"; mkdir -p "$O/status"; ln -s "$X" "$O/$tgt"
    vr_init "$O" 2>/dev/null; r=$?; [ $r -eq 2 ] && extsame "$X" && [ -L "$O/$tgt" ] && [ ! -e "$O/.vr_lock" ] ); rc=$?
  [ $rc -eq 0 ] && ok "초기화 경로 선점($tgt → 외부 링크): vr_init 2, 외부 파일 그대로, 링크 그대로, 잠금 해제" || bad "초기화 경로 선점 $tgt (rc=$rc)"
done
# 26-6. 추가 기록 파일 경로를 실행 중 외부 링크로 교체 → 쓰기는 우리 객체로, 외부 그대로, vr_finish 3(경로 변경)
s_apsw_n() { vr_expect a; rm -f "$VR_NOTES"; ln -s "$TMP/apsw_n.ext" "$VR_NOTES"; run a true; run zzz true; }
mkext "$TMP/apsw_n.ext"; scenario apsw_n s_apsw_n; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/apsw_n.ext" && grep -qxF '기록 실패: _violations.txt 경로 변경' "$TMP/apsw_n/failed_steps.txt" && grep -qxF 'zzz 등록되지 않은 항목' "$TMP/apsw_n/failed_steps.txt" && ! grep -q 'EXTERNAL' "$TMP/apsw_n/failed_steps.txt"; } \
  && ok '추가 기록 경로 교체(_violations.txt → 외부 링크): 위반은 우리 객체에 기록·판정에 반영, 외부 파일 그대로·읽지 않음, 3' || bad "추가 기록 경로 교체 notes (rc=$rc)"
s_apsw_e() { vr_expect a; rm -f "$VR_EXPECTED"; ln -s "$TMP/apsw_e.ext" "$VR_EXPECTED"; vr_expect b; run a true; run b true; }
mkext "$TMP/apsw_e.ext"; scenario apsw_e s_apsw_e; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/apsw_e.ext" && grep -qxF '기록 실패: expected_steps.txt 경로 변경' "$TMP/apsw_e/failed_steps.txt"; } \
  && ok '추가 기록 경로 교체(expected_steps.txt → 외부 링크): 외부 파일 그대로, 3' || bad "추가 기록 경로 교체 exp (rc=$rc)"
# 26-7. 로그 경로: 미리 외부 링크 → 명령을 실행하지 않고 실패 / 실행 중 명령이 경로를 외부 링크로 바꿈 → 출력은 우리 객체로, 3
s_logpre() { vr_expect a; ln -s "$TMP/logpre.ext" "$VR_L/a.log"; run a sh -c ": > '$TMP/logpre.ran'"; }
mkext "$TMP/logpre.ext"; scenario logpre s_logpre; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/logpre.ext" && [ ! -e "$TMP/logpre.ran" ] && grep -qxF '기록 실패: a.log 생성' "$TMP/logpre/failed_steps.txt" && grep -qxF 'a 시작했으나 상태 기록 없음' "$TMP/logpre/failed_steps.txt"; } \
  && ok '로그 경로 선점(외부 링크): 명령을 실행하지 않음, 외부 파일 그대로, 상태 없음 → 실패 3' || bad "로그 경로 선점 (rc=$rc)"
s_logsw() { vr_expect a; run a sh -c "echo before; rm -f '$TMP/logsw/logs/a.log'; ln -s '$TMP/logsw.ext' '$TMP/logsw/logs/a.log'; echo after"; }
mkext "$TMP/logsw.ext"; scenario logsw s_logsw; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/logsw.ext" && grep -qxF '기록 실패: a.log 경로 변경' "$TMP/logsw/failed_steps.txt"; } \
  && ok '로그 경로 실행 중 교체(외부 링크): 출력·exit 줄은 우리 객체로, 외부 파일 그대로, 3' || bad "로그 경로 실행 중 교체 (rc=$rc)"
# 26-8. 상태 임시 이름 선점(일반·외부 링크·FIFO·FIFO 링크·장치 링크) / 놓기 직전 교체 → 기록 실패, 멈추지 않음, 외부 그대로
for kind in reg lext fifo lfifo ldev; do
  eval "s_stpre_$kind() { vr_hook_before_status() { local t=\"\$VR_ST/\$1.status.tmp.\$BASHPID\"; case $kind in reg) printf PRE > \"\$t\" ;; lext) ln -s \"$TMP/stpre_$kind.ext\" \"\$t\" ;; fifo) mkfifo \"\$t\" ;; lfifo) mkfifo \"$TMP/stpre_$kind.f\"; ln -s \"$TMP/stpre_$kind.f\" \"\$t\" ;; ldev) ln -s /dev/null \"\$t\" ;; esac; }; vr_expect a; run a true; unset -f vr_hook_before_status; rm -f \"\$VR_ST\"/a.status.tmp.*; }"
  mkext "$TMP/stpre_$kind.ext"
  ( scenario "stpre_$kind" "s_stpre_$kind" ) & wp=$!; ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
  { [ $rc -eq 3 ] && extsame "$TMP/stpre_$kind.ext" && grep -qxF '기록 실패: a 상태 임시 파일' "$TMP/stpre_$kind/failed_steps.txt" && no_alldone "$TMP/stpre_$kind"; } \
    && ok "상태 임시 이름 선점($kind): 열지 않고 기록 실패 3, 멈추지 않음, 외부 파일 그대로" || bad "상태 임시 이름 선점 $kind (rc=$rc)"
done
s_stsw() { vr_hook_before_commit() { local t="$VR_ST/$1.status.tmp.$BASHPID"; rm -f "$t"; ln -s "$TMP/stsw.ext" "$t"; }; vr_expect a; run a true; unset -f vr_hook_before_commit; rm -f "$VR_ST"/a.status.tmp.*; }
mkext "$TMP/stsw.ext"; scenario stsw s_stsw; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/stsw.ext" && grep -qxF '기록 실패: a 상태 파일 놓기' "$TMP/stsw/failed_steps.txt"; } && ok '상태 임시 파일 놓기 직전 외부 링크로 교체: 놓지 않음, 외부 파일 그대로, 3' || bad "상태 임시 교체 (rc=$rc)"
# 26-9. bg .run 선점(외부 링크·FIFO) → 작업 ID 충돌로 다음 순번, 멈추지 않음 / .run 을 PID 기록 전 외부 링크로 교체 / .tmp 선점(FIFO·외부 링크)
for kind in lext fifo; do
  eval "s_runpre_$kind() { vr_expect a; local nid=\"\${VR_RUN_ID}_\${BASHPID}_\$((VR_BG_SEQ + 1))\"; case $kind in lext) ln -s \"$TMP/runpre_$kind.ext\" \"\$VR_BGREC/\$nid.run\" ;; fifo) mkfifo \"\$VR_BGREC/\$nid.run\" ;; esac; vr_bg A run a true; vr_wait; }"
  mkext "$TMP/runpre_$kind.ext"
  ( scenario "runpre_$kind" "s_runpre_$kind" ) & wp=$!; ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
  { [ $rc -ne 0 ] && [ $rc -ne 137 ] && extsame "$TMP/runpre_$kind.ext" && grep -q '^bg:A 작업 ID 충돌: ' "$TMP/runpre_$kind/failed_steps.txt" && no_alldone "$TMP/runpre_$kind"; } \
    && ok "bg 실행 표식 선점($kind): 그 이름을 건드리지 않고 다음 순번, 멈추지 않음, 외부 파일 그대로, 성공 아님" || bad "bg 실행 표식 선점 $kind (rc=$rc)"
done
s_runsw() { vr_hook_bg_before_mark() { local m; for m in "$VR_BGREC"/*.run; do rm -f "$m"; ln -s "$TMP/runsw.ext" "$m"; done; }; vr_expect a; vr_bg A run a true; vr_wait; unset -f vr_hook_bg_before_mark; }
mkext "$TMP/runsw.ext"; scenario runsw s_runsw; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/runsw.ext" && grep -qxF '기록 실패: bg:A 실행 표식' "$TMP/runsw/failed_steps.txt"; } && ok 'bg 실행 표식을 PID 기록 전 외부 링크로 교체: PID 는 우리 객체로, 외부 파일 그대로, 3' || bad "bg 실행 표식 교체 (rc=$rc)"
for kind in fifo lext; do
  eval "s_tmppre_$kind() { body() { run b true; case $kind in fifo) mkfifo \"\$VR_BGREC/\$vr__bg_id.tmp\" ;; lext) ln -s \"$TMP/tmppre_$kind.ext\" \"\$VR_BGREC/\$vr__bg_id.tmp\" ;; esac; }; vr_expect a b; run a true; vr_bg B body; vr_wait; }"
  mkext "$TMP/tmppre_$kind.ext"
  ( scenario "tmppre_$kind" "s_tmppre_$kind" ) & wp=$!; ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
  { [ $rc -eq 3 ] && extsame "$TMP/tmppre_$kind.ext" && grep -q '^기록 실패: bg:B 종료 기록 쓰기' "$TMP/tmppre_$kind/failed_steps.txt" && no_alldone "$TMP/tmppre_$kind"; } \
    && ok "bg 종료 기록 임시 이름 선점($kind): 열지 않고 기록 실패 3, 멈추지 않음, 외부 파일 그대로" || bad "bg 종료 기록 임시 선점 $kind (rc=$rc, $(tr '\n' ';' < "$TMP/tmppre_$kind/failed_steps.txt" | cut -c1-200))"
done
# 26-10. 정렬 임시 경로: 선점(FIFO·FIFO 링크·외부 링크) → 생성 실패, 멈추지 않음 / 쓴 뒤 외부 링크로 교체 → 읽지 않음, 지우지 않음
for kind in fifo lfifo lext; do
  eval "s_sopre_$kind() { s_sort_base; VR_SORT_TMP=\"$TMP/sopre_$kind.tmp\"; case $kind in fifo) mkfifo \"\$VR_SORT_TMP\" ;; lfifo) mkfifo \"$TMP/sopre_$kind.f\"; ln -s \"$TMP/sopre_$kind.f\" \"\$VR_SORT_TMP\" ;; lext) ln -s \"$TMP/sopre_$kind.ext\" \"\$VR_SORT_TMP\" ;; esac; }"
  mkext "$TMP/sopre_$kind.ext"
  ( scenario "sopre_$kind" "s_sopre_$kind" ) & wp=$!; ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
  { [ $rc -eq 3 ] && extsame "$TMP/sopre_$kind.ext" && grep -qxF '기록 실패: sort 임시 파일 생성' "$TMP/sopre_$kind/failed_steps.txt"; } \
    && ok "정렬 임시 경로 선점($kind): 생성 실패 3, 멈추지 않음, 외부 파일 그대로" || bad "정렬 임시 선점 $kind (rc=$rc)"
done
s_sosw() { s_sort_base; vr_hook_sort_after_write() { rm -f "$1"; ln -s "$TMP/sosw.ext" "$1"; }; }
mkext "$TMP/sosw.ext"; scenario sosw s_sosw; rc=$?
{ [ $rc -eq 3 ] && extsame "$TMP/sosw.ext" && grep -qxF '기록 실패: sort 임시 파일 읽기' "$TMP/sosw/failed_steps.txt" && [ -n "$(find "$TMP/sosw" -maxdepth 1 -name '.sort_out.*' -type l)" ]; } \
  && ok '정렬 임시 파일을 쓴 뒤 외부 링크로 교체: 읽지 않음(읽기 실패 3), 외부 파일 그대로, 그 링크를 지우지 않음' || bad "정렬 임시 교체 (rc=$rc)"
# 26-11. 보고 임시 이름 FIFO 선점(주입 지점 preopen) → 멈추지 않고 실패
s_repfifo() { vr_hook_report_preopen() { case "$1" in */99_done.log) mkfifo "$2" ;; esac; }; vr_expect a; run a true; }
( scenario repfifo s_repfifo ) & wp=$!; ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
{ [ $rc -eq 3 ] && no_alldone "$TMP/repfifo" && [ -n "$(find "$TMP/repfifo/logs" -name '.vr.rep.*' -type p)" ]; } && ok '보고 임시 이름 FIFO 선점: 열지 않음(멈추지 않음), 3, ALL_DONE 없음, FIFO 그대로' || bad "보고 임시 FIFO 선점 (rc=$rc)"
# 26-12. 출력 폴더 잠금
s_lk() { vr_expect a; run a true; [ -d "$VR_OUT/.vr_lock" ] && [ ! -L "$VR_OUT/.vr_lock" ] && : > "$TMP/lk.held"; }
scenario lk s_lk; rc=$?
{ [ $rc -eq 0 ] && [ -e "$TMP/lk.held" ] && [ ! -e "$TMP/lk/.vr_lock" ]; } && ok '잠금: 실행 중 .vr_lock 있음, vr_finish 뒤 없음' || bad "잠금 획득·해제 (rc=$rc)"
# [기대값 변경 — bed4eb4 반려 P2: 끝난 실행의 보고 파일(우리 것이라는 증거가 없음)을 대체하지 않으므로 같은 폴더 재사용은 거부된다.
#  이 시험의 목적(잠금이 해제되어 잠금 때문에 막히지 않음)은 유지: 거부 사유가 잠금이 아니라 기존 보고 파일이고, 잠금·보고 파일이 그대로인지 확인]
( . "$HERE/lib/verify_run.sh"; s0=$(sha256sum "$TMP/lk/failed_steps.txt" "$TMP/lk/logs/99_done.log"); vr_init "$TMP/lk" 2> "$TMP/lk.again.err"; r=$?
  [ $r -eq 2 ] && [ ! -e "$TMP/lk/.vr_lock" ] && [ "$(sha256sum "$TMP/lk/failed_steps.txt" "$TMP/lk/logs/99_done.log")" = "$s0" ] ); rc=$?
{ [ $rc -eq 0 ] && grep -q 'failed_steps.txt 생성 실패' "$TMP/lk.again.err" && ! grep -q '잠금' "$TMP/lk.again.err"; } && ok '잠금: 정상 종료(해제) 뒤 같은 폴더 재사용 → 잠금이 아니라 기존 보고 파일 때문에 2, 잠금 남지 않음, 이전 보고 파일 그대로' || bad "잠금: 정상 종료 뒤 재실행 (rc=$rc, $(cat "$TMP/lk.again.err"))"
# [준비 변경 — bed4eb4 반려 P2: 끝난 실행의 보고 파일은 대체하지 않으므로, 이 잠금 재획득 시험은 이전 보고 파일을 시험이 직접 치운 뒤 재획득한다]
( . "$HERE/lib/verify_run.sh"; O="$TMP/lkre"; vr_init "$O" || exit 1; vr_expect a; run a true; vr_finish > /dev/null 2>&1 || exit 2; rm -rf "$O/bg"/* "$O/status" "$O/logs"; rm -f "$O/failed_steps.txt" "$O/expected_steps.txt" "$O/step_status.txt"; vr_init "$O" || exit 3; [ -d "$O/.vr_lock" ] || exit 4; vr_expect a; vr__app_close; vr__life_reset; vr__lock_release; [ ! -e "$O/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '잠금: 정상 종료(해제) 뒤 같은 폴더에서 다시 잠금 획득 가능' || bad "잠금: 해제 뒤 재획득 (단계 $rc)"
( mkdir -p "$TMP/lkstale/.vr_lock"; i0=$(stat -c %i "$TMP/lkstale/.vr_lock"); . "$HERE/lib/verify_run.sh"; vr_init "$TMP/lkstale" 2> "$TMP/lkstale.err"; r=$?
  [ $r -eq 2 ] && grep -q '잠금 실패' "$TMP/lkstale.err" && [ "$(stat -c %i "$TMP/lkstale/.vr_lock")" = "$i0" ] && [ ! -e "$TMP/lkstale/logs" ] ); rc=$?
[ $rc -eq 0 ] && ok '잠금: 비정상 종료로 남은 잠금 → vr_init 2·사유, 잠금을 지우지 않음, 하위 폴더를 만들지 않음' || bad "잠금: 남은 잠금 (rc=$rc)"
s_lkrf() { vr_hook_lock_release() { : > "$1/blocker"; }; vr_expect a; run a true; }
scenario lkrf s_lkrf; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/lkrf" && grep -q '^NOT_DONE' "$TMP/lkrf/logs/99_done.log" && grep -q '출력 폴더 잠금 해제' "$TMP/lkrf.finish_out" && [ -d "$TMP/lkrf/.vr_lock" ]; } \
  && ok '잠금 해제 실패(rmdir 실패): 3, ALL_DONE 철회(NOT_DONE), 진단, 잠금 그대로' || bad "잠금 해제 실패 (rc=$rc)"
s_lkfo() { vr_hook_lock_release() { rmdir "$1"; mkdir "$1"; }; vr_expect a; run a true; }
scenario lkfo s_lkfo; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/lkfo" && [ -d "$TMP/lkfo/.vr_lock" ]; } && ok '잠금 해제 직전 남의 폴더로 교체: 소유 확인 실패로 지우지 않음, 3, ALL_DONE 철회' || bad "잠금 교체 (rc=$rc)"
s_lkpre() { vr_expect a; run a true; rmdir "$VR_OUT/.vr_lock"; mkdir "$VR_OUT/.vr_lock"; }
scenario lkpre s_lkpre; rc=$?
{ [ $rc -eq 3 ] && grep -qxF '기록 실패: 출력 폴더 잠금 확인' "$TMP/lkpre/failed_steps.txt" && [ -d "$TMP/lkpre/.vr_lock" ]; } && ok '잠금이 vr_finish 전에 남의 것으로 바뀜: 사전 확인에서 기록 실패 3, 남의 폴더 그대로' || bad "잠금 사전 확인 (rc=$rc)"
s_lkdr() { vr_hook_after_drain() { ( . "$HERE/lib/verify_run.sh"; vr_init "$VR_OUT" 2>/dev/null; echo $? > "$TMP/lkdr.second" ); }; vr_expect a; run a true; }
scenario lkdr s_lkdr; rc=$?
{ [ $rc -eq 0 ] && [ "$(cat "$TMP/lkdr.second")" = 2 ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (1 개 항목)' "$TMP/lkdr/logs/99_done.log" && [ ! -e "$TMP/lkdr/.vr_lock" ]; } \
  && ok '잠금: 생명주기 FIFO 정리 직후 다른 프로세스의 vr_init → 2(잠금), 첫 실행 보고 그대로·정상 해제' || bad "잠금 FIFO 정리 직후 경합 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; vr_hook_init_fail() { [ "$1" = list ]; }; vr_init "$TMP/lkif" 2>/dev/null; [ $? -eq 2 ] && [ ! -e "$TMP/lkif/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '잠금: vr_init 이 잠금 뒤 실패 → 잠금 해제' || bad "잠금: 초기화 실패 해제 (rc=$rc)"
# 26-13. 하위 폴더·출력 폴더가 링크 → 따라가 만들지 않음
( D="$TMP/sublnk"; mkdir -p "$D" "$TMP/sublnk.ext"; ln -s "$TMP/sublnk.ext" "$D/logs"; . "$HERE/lib/verify_run.sh"; vr_init "$D" 2>/dev/null; r=$?
  [ $r -eq 2 ] && [ -z "$(ls -A "$TMP/sublnk.ext")" ] && [ ! -e "$D/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '하위 폴더가 미리 링크(logs → 외부 폴더): vr_init 2, 외부 폴더에 아무것도 만들지 않음, 잠금 해제' || bad "하위 폴더 링크 (rc=$rc)"
( mkdir -p "$TMP/outlnk.ext"; ln -s "$TMP/outlnk.ext" "$TMP/outlnk"; . "$HERE/lib/verify_run.sh"; vr_init "$TMP/outlnk" 2>/dev/null; [ $? -eq 2 ] && [ -z "$(ls -A "$TMP/outlnk.ext")" ] ); rc=$?
[ $rc -eq 0 ] && ok '출력 폴더가 링크: vr_init 2, 링크 대상에 아무것도 만들지 않음' || bad "출력 폴더 링크 (rc=$rc)"
# 26-14. 정상 실행 출력 형식: expected_steps·_violations·로그·step_status 바이트 고정
s_fmt() { vr_expect a b c; run a sh -c 'echo out; echo err >&2; exit 0'; vr_bg B run b printf 'x\ny'; vr_wait; run zzz true; run c true; }
scenario fmt s_fmt; rc=$?
{ [ $rc -eq 1 ] && [ "$(od -An -c "$TMP/fmt/expected_steps.txt" | tr -s ' ')" = "$(printf 'a\nb\nc\n' | od -An -c | tr -s ' ')" ] \
  && cmp -s "$TMP/fmt/status/_violations.txt" <(printf 'zzz 등록되지 않은 항목\n') \
  && cmp -s "$TMP/fmt/logs/a.log" <(printf 'out\nerr\nexit=0\n') && cmp -s "$TMP/fmt/logs/b.log" <(printf 'x\nyexit=0\n') \
  && cmp -s "$TMP/fmt/step_status.txt" <(printf 'a 0\nb 0\nc 0\n') && cmp -s "$TMP/fmt/failed_steps.txt" <(printf 'zzz 등록되지 않은 항목\n') \
  && [ -z "$(ls -A "$TMP/fmt" "$TMP/fmt/logs" "$TMP/fmt/status" | grep '\.vr\.new\.\|\.vr\.rep\.\|\.vr_lock')" ]; } \
  && ok '정상 실행 출력 형식: expected_steps·_violations·로그(stdout·stderr·exit 줄)·step_status·failed_steps 바이트 고정, 임시 이름·잠금 남지 않음' || bad "정상 실행 출력 형식 (rc=$rc)"

# ── e10123b 1차 재검수 반영(합성 주입) ───────────────────────────────────────────────────────────────────────────────
# 27-1. 같은 셸에서 성공한 vr_init 뒤 다른 폴더로 vr_init 이 실패(잠금 선점·플랫폼 실패·하위 폴더 링크·파일 선점) → vr_finish 3,
#       이전 폴더에 새 보고 파일·상태 변경 없음(이전 실행의 생명주기 객체·잠금 정리는 재호출 계약대로 — 대조에서 제외)
snap() { ( cd "$1" && { find . \( -name .vr_life -o -name .vr_done -o -name .vr_msgs -o -name .vr_lock \) -prune -o -print | sort; find . -type f ! -name '.vr_*' -exec sha256sum {} + | sort; } ); }
for kind in lock plat sub file; do
  ( . "$HERE/lib/verify_run.sh"; A="$TMP/ri_${kind}_A"; B="$TMP/ri_${kind}_B"; X="$TMP/ri_$kind.ext"; mkext "$X"; mkdir -p "$TMP/ri_$kind.dir"
    vr_init "$A" || exit 9; vr_expect a; run a true
    case $kind in lock) mkdir -p "$B/.vr_lock" ;; plat) uname() { echo Darwin; } ;; sub) mkdir -p "$B"; ln -s "$TMP/ri_$kind.dir" "$B/logs" ;; file) mkdir -p "$B"; ln -s "$X" "$B/failed_steps.txt" ;; esac
    s0=$(snap "$A")
    vr_init "$B" 2>/dev/null; r=$?; [ $r -eq 2 ] || exit 1
    unset -f uname
    vr_finish > "$TMP/ri_$kind.fin" 2>&1; r=$?; [ $r -eq 3 ] || exit 2
    grep -q '초기화가 성공한 상태가 아님' "$TMP/ri_$kind.fin" || exit 3
    [ "$(snap "$A")" = "$s0" ] && [ ! -e "$A/logs/99_done.log" ] && [ ! -e "$A/step_status.txt" ] || exit 4
    extsame "$X" && [ -z "$(ls -A "$TMP/ri_$kind.dir")" ] || exit 5
    case $kind in lock) [ "$(ls -A "$B")" = .vr_lock ] || exit 6 ;; esac ); rc=$?
  [ $rc -eq 0 ] && ok "재초기화 실패($kind): 두 번째 vr_init 2 → vr_finish 3(아무것도 쓰지 않음), 이전 폴더의 보고·상태 그대로, 외부 객체 그대로" || bad "재초기화 실패 $kind (단계 $rc)"
done
( . "$HERE/lib/verify_run.sh"; vr_finish > "$TMP/ri_none.fin" 2>&1; [ $? -eq 3 ] && grep -q '초기화가 성공한 상태가 아님' "$TMP/ri_none.fin" ); rc=$?
[ $rc -eq 0 ] && ok '초기화 없이 vr_finish → 3, 아무것도 쓰지 않음' || bad "초기화 없이 vr_finish (rc=$rc)"
# 27-2. vr__new_placed 배치 직후(주입 지점 place_after) 최종 경로 교체·링크 교체·이름 이동 → 4/4/3, 남의 것 삭제 없음
for kind in reg lnk mov; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/np_$kind"; mkdir -p "$D"; X="$TMP/np_$kind.ext"; mkext "$X"
    case $kind in
      reg) vr_hook_place_after() { rm -f "$1"; printf FOREIGN > "$1"; } ;;
      lnk) vr_hook_place_after() { rm -f "$1"; ln -s "$X" "$1"; } ;;
      mov) vr_hook_place_after() { mv "$1" "$1.moved"; printf FOREIGN > "$1"; } ;;
    esac
    vr__new_placed "$D/f.txt" fd append; r=$?
    extsame "$X" && [ -z "$fd" ] && [ -z "$(ls -A "$D" | grep '\.vr\.new\.')" ] || exit 1
    case $kind in
      reg) [ $r -eq 4 ] && [ "$(cat "$D/f.txt")" = FOREIGN ] ;;
      lnk) [ $r -eq 4 ] && [ -L "$D/f.txt" ] && [ "$(readlink "$D/f.txt")" = "$X" ] ;;
      mov) [ $r -eq 3 ] && [ "$(cat "$D/f.txt")" = FOREIGN ] && [ -e "$D/f.txt.moved" ] && [[ "$VR__WV_LEFT" == "$D/f.txt("*"위치 미확인"* ]] ;;
    esac ); rc=$?
  case $kind in reg) d='남의 일반 파일로 교체 → 4(우리 객체 남지 않음), 남의 파일 그대로' ;; lnk) d='외부 링크로 교체 → 4, 링크·외부 파일 그대로' ;; mov) d='우리 파일을 다른 이름으로 옮기고 남의 파일을 놓음 → 3·위치 미확인 진단, 옮겨진 우리 파일·남의 파일 모두 지우지 않음' ;; esac
  [ $rc -eq 0 ] && ok "배치 직후 경합($kind): $d" || bad "배치 직후 경합 $kind (rc=$rc)"
done
s_npl() { vr_hook_place_after() { case "$1" in */a.log) mv "$1" "$1.moved"; printf FOREIGN > "$1" ;; esac; }; vr_expect a; run a sh -c ": > '$TMP/npl.ran'"; unset -f vr_hook_place_after; }
scenario npl s_npl; rc=$?
{ [ $rc -eq 3 ] && [ ! -e "$TMP/npl.ran" ] && grep -qxF '기록 실패: a.log 생성' "$TMP/npl/failed_steps.txt" && grep -q '^기록 실패: 임시 파일 정리 .*a\.log(.*위치 미확인' "$TMP/npl/failed_steps.txt" && [ "$(cat "$TMP/npl/logs/a.log")" = FOREIGN ]; } \
  && ok '배치 직후 경합(로그): 명령 미실행, "a.log 생성"·"임시 파일 정리(위치 미확인)" 기록 실패 3, 남의 파일 그대로' || bad "배치 직후 경합 로그 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; X="$TMP/npi.ext"; mkext "$X"; vr_hook_place_after() { case "$1" in */expected_steps.txt) rm -f "$1"; ln -s "$X" "$1" ;; esac; }
  vr_init "$TMP/npi" 2> "$TMP/npi.err"; r=$?; [ $r -eq 2 ] && extsame "$X" && grep -q 'expected_steps.txt 생성 실패(4)' "$TMP/npi.err" && [ ! -e "$TMP/npi/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '배치 직후 경합(초기화 expected_steps → 외부 링크): vr_init 2·반환 4 진단, 외부 파일 그대로, 잠금 해제' || bad "배치 직후 경합 초기화 (rc=$rc)"
# 27-3. 잠금 생성 직후 fd 열기 실패·확인 실패 → 잠금을 남김(자동 복구·삭제 없음), 다음 vr_init 도 거부
( . "$HERE/lib/verify_run.sh"; vr_hook_fail() { [ "$1" = lock_open ]; }; vr_init "$TMP/lko" 2> "$TMP/lko.err"; r=$?; unset -f vr_hook_fail
  [ $r -eq 2 ] && grep -q '자동으로 복구·삭제하지 않음' "$TMP/lko.err" && [ -d "$TMP/lko/.vr_lock" ] && [ ! -e "$TMP/lko/logs" ] || exit 1
  vr_init "$TMP/lko" 2>/dev/null; [ $? -eq 2 ] && [ -d "$TMP/lko/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '잠금 생성 직후 fd 열기 실패: vr_init 2·"자동으로 복구·삭제하지 않음", 잠금 남김·하위 폴더 안 만듦, 다음 vr_init 도 거부' || bad "잠금 fd 열기 실패 (rc=$rc)"
for kind in lnk reg; do
  ( . "$HERE/lib/verify_run.sh"; L="$TMP/lkv_$kind"; mkdir -p "$TMP/lkv_$kind.dir"
    case $kind in lnk) vr_hook_lock_made() { rmdir "$1"; ln -s "$TMP/lkv_$kind.dir" "$1"; } ;; reg) vr_hook_lock_made() { rmdir "$1"; printf FOREIGN > "$1"; } ;; esac
    vr_init "$L" 2> "$L.err"; r=$?; unset -f vr_hook_lock_made
    [ $r -eq 2 ] && grep -q '소유를 입증하지 못함' "$L.err" && [ -z "$(ls -A "$TMP/lkv_$kind.dir")" ] || exit 1
    case $kind in lnk) [ -L "$L/.vr_lock" ] ;; reg) [ "$(cat "$L/.vr_lock")" = FOREIGN ] ;; esac ); rc=$?
  [ $rc -eq 0 ] && ok "잠금 생성 직후 확인 실패($kind 로 바뀜): vr_init 2, 그 객체를 지우지 않음(외부 소유로 간주), 링크 대상에 아무것도 만들지 않음" || bad "잠금 확인 실패 $kind (rc=$rc)"
done

# ── a928959 재검수: 읽기 프로세스 stuck 과 상태 무효화의 결합(합성: 읽기 프로세스가 R 을 쓰기 전 주입 지점 end 에서 잠듦) ──────────────────
# A: 성공한 vr_init(A) → 읽기 프로세스 stuck. B: vr_init(B) 2, 자원·잠금 보존, B 에 아무것도 없음, vr_finish 3·어디에도 쓰지 않음.
# C: vr_init(C) 도 다시 확인하고 2, 다른 프로세스는 A 의 잠금을 얻지 못함. D: 읽기 프로세스가 실제로 끝난 뒤 vr_init(D) 성공·정리.
( . "$HERE/lib/verify_run.sh"; R="$TMP/rs"; mkdir -p "$R"; A="$R/A"; B="$R/B"; C="$R/C"; D="$R/D"; RS_SLEEP=8; VR__READER_STOP_TIMEOUT=1
  vr_hook_reader() { [ "$1" = end ] && sleep "$RS_SLEEP"; return 0; }
  snapA() { ( cd "$A" && { find . | sort; find . -type f ! -name '.vr_*' -exec sha256sum {} + | sort; } ); }
  vr_init "$A" || exit 9; vr_expect a; run a true
  li=$(stat -c %i "$A/.vr_lock"); lfd=$VR__LOCK_FD; rpid=$VR_LIFE_RD; s0=$(snapA)
  # B
  vr_init "$B" 2> "$R/B.err"; r=$?
  [ $r -eq 2 ] && [ "$VR__INIT_OK" = 0 ] && [ "$VR__READER_STATE" = stuck ] || { echo "B: r=$r ok=$VR__INIT_OK st=$VR__READER_STATE"; exit 1; }
  grep -qF "알림 읽기 프로세스 종료 확인 실패: $A(읽기 프로세스 PID $rpid)" "$R/B.err" || { echo "B: 진단 $(cat "$R/B.err")"; exit 2; }
  [ ! -e "$B" ] || { echo 'B: B 가 만들어짐'; exit 3; }
  [ "$(stat -c %i "$A/.vr_lock")" = "$li" ] && [ "$VR__LOCK_FD" = "$lfd" ] && [ "$A/.vr_lock" -ef "/dev/fd/$lfd" ] && vr__lock_owned || { echo 'B: 잠금 보존'; exit 4; }
  [ -p "$A/.vr_life" ] && [ -p "$A/.vr_done" ] && [ -n "$VR_LDONE_R" ] && [ -n "$VR_LIFE_R" ] && kill -0 "$rpid" 2>/dev/null || { echo 'B: 읽기 자원 보존'; exit 5; }
  vr_finish > "$R/B.fin" 2>&1; r=$?
  [ $r -eq 3 ] && grep -q '초기화가 성공한 상태가 아님' "$R/B.fin" && [ ! -e "$B" ] && [ "$(snapA)" = "$s0" ] || { echo "B: vr_finish r=$r"; exit 6; }
  # C
  vr_init "$C" 2> "$R/C.err"; r=$?
  [ $r -eq 2 ] && [ "$VR__READER_STATE" = stuck ] && grep -qF "$A(읽기 프로세스 PID $rpid)" "$R/C.err" && [ ! -e "$C" ] && [ "$(snapA)" = "$s0" ] || { echo "C: r=$r"; exit 7; }
  ( unset -f vr_hook_reader; . "$HERE/lib/verify_run.sh"; vr_init "$A" 2> "$R/other.err"; echo $? > "$R/other.rc" )
  [ "$(cat "$R/other.rc")" = 2 ] && grep -q '잠금 실패' "$R/other.err" && [ "$(stat -c %i "$A/.vr_lock")" = "$li" ] && [ "$(snapA)" = "$s0" ] || { echo "C: 다른 프로세스 $(cat "$R/other.rc")"; exit 8; }
  vr_finish > /dev/null 2>&1; [ $? -eq 3 ] && [ ! -e "$B" ] && [ ! -e "$C" ] && [ ! -e "$A/logs/99_done.log" ] || { echo 'C: vr_finish'; exit 9; }
  # D: 읽기 프로세스가 실제로 끝날 때까지 기다린 뒤(최대 15초)
  for k in $(seq 1 150); do kill -0 "$rpid" 2>/dev/null || break; sleep 0.1; done
  kill -0 "$rpid" 2>/dev/null && { echo 'D: 읽기 프로세스가 끝나지 않음'; exit 10; }
  RS_SLEEP=0
  vr_init "$D" 2> "$R/D.err"; r=$?
  [ $r -eq 0 ] && [ "$VR__INIT_OK" = 1 ] && [ -z "$VR__READER_STATE" -o "$VR__READER_STATE" = running ] || { echo "D: r=$r $(cat "$R/D.err")"; exit 11; }
  [ ! -e "$A/.vr_lock" ] && [ ! -e "$A/.vr_life" ] && [ ! -e "$A/.vr_done" ] && [ ! -e "$A/.vr_msgs" ] || { echo 'D: A 정리'; exit 12; }
  [ ! -e "$A/logs/99_done.log" ] && [ ! -e "$B" ] && [ ! -e "$C" ] || { echo 'D: 잘못된 보고'; exit 13; }
  vr_expect d; run d true; vr_finish > /dev/null 2>&1; r=$?
  [ $r -eq 0 ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (1 개 항목)' "$D/logs/99_done.log" && [ ! -e "$D/.vr_lock" ] && [ ! -e "$A/logs/99_done.log" ] || { echo "D: vr_finish r=$r"; exit 14; } ) > "$TMP/rs.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '읽기 프로세스 stuck: B·C 초기화 2(진단에 A 와 PID), A 의 잠금·읽기 자원 보존, B·C 를 만들지 않음, vr_finish 3·어디에도 쓰지 않음, 다른 프로세스는 A 잠금 못 얻음, 종료 확인 뒤 D 정상(A 정리)' || bad "읽기 프로세스 stuck (단계 $rc: $(tr '\n' ';' < "$TMP/rs.out"))"
# D': 읽기 프로세스는 끝났지만 이전 잠금의 소유를 입증하지 못함 → 자동 삭제 없이 2(기존 정책 유지)
( . "$HERE/lib/verify_run.sh"; A="$TMP/rs2_A"; vr_init "$A" || exit 9; vr_expect a; run a true
  rmdir "$A/.vr_lock"; mkdir "$A/.vr_lock"; i2=$(stat -c %i "$A/.vr_lock")
  vr_init "$TMP/rs2_D" 2> "$TMP/rs2.err"; r=$?
  [ $r -eq 2 ] && grep -q '이전 출력 폴더 잠금 해제 실패' "$TMP/rs2.err" && [ "$(stat -c %i "$A/.vr_lock")" = "$i2" ] && [ ! -e "$TMP/rs2_D" ] && [ "$VR__INIT_OK" = 0 ] || exit 1
  vr_finish > /dev/null 2>&1; [ $? -eq 3 ] && [ ! -e "$A/logs/99_done.log" ] ); rc=$?
[ $rc -eq 0 ] && ok '읽기 프로세스 정상 종료 + 이전 잠금 소유 입증 실패: vr_init 2, 남의 잠금 지우지 않음, 새 폴더 만들지 않음, vr_finish 3' || bad "이전 잠금 소유 입증 실패 (rc=$rc)"

# ── bed4eb4 반려(P1~P3) 회귀 시험 — 합성 주입. 남의 객체는 inode·종류·내용(sha256)을 사전·사후 대조 ──────────────────────────────────────────
oid() { stat -c '%i:%F' "$1" 2>/dev/null; [ -f "$1" ] && [ ! -L "$1" ] && sha256sum < "$1"; [ -L "$1" ] && readlink "$1"; }
# 29-1. p1_verify.sh: 출력 폴더가 링크 → 링크 대상에 compare(그 밖의 무엇도) 만들지 않음, 2
( mkdir -p "$TMP/p1o_lnk.ext"; ln -s "$TMP/p1o_lnk.ext" "$TMP/p1o_lnk"; bash "$HERE/p1_verify.sh" "$TMP/p1o_lnk" > "$TMP/p1o_lnk.out" 2>&1; r=$?
  [ $r -eq 2 ] && [ -z "$(ls -A "$TMP/p1o_lnk.ext")" ] && [ -L "$TMP/p1o_lnk" ] ); rc=$?
[ $rc -eq 0 ] && ok 'p1_verify: 출력 폴더가 링크 → 2, 링크 대상에 compare·그 밖의 것을 만들지 않음(잠금 전 접근 없음)' || bad "p1_verify 출력 폴더 링크 (rc=$rc)"
# 29-2. p1_verify.sh: OUT/compare 가 링크 → 외부 대상에 아무것도 쓰지 않음, 3, 잠금 해제
( mkdir -p "$TMP/p1o_c" "$TMP/p1o_c.ext"; ln -s "$TMP/p1o_c.ext" "$TMP/p1o_c/compare"; bash "$HERE/p1_verify.sh" "$TMP/p1o_c" > "$TMP/p1o_c.out" 2>&1; r=$?
  [ $r -eq 3 ] && [ -z "$(ls -A "$TMP/p1o_c.ext")" ] && [ -L "$TMP/p1o_c/compare" ] && [ ! -e "$TMP/p1o_c/.vr_lock" ] \
    && grep -q '^기록 실패: compare 폴더 준비' "$TMP/p1o_c/failed_steps.txt" && no_alldone "$TMP/p1o_c" ); rc=$?
[ $rc -eq 0 ] && ok 'p1_verify: OUT/compare 가 외부 폴더 링크 → 3·"compare 폴더 준비" 기록 실패, 외부 폴더에 아무것도 쓰지 않음, 링크 그대로, 잠금 해제' || bad "p1_verify compare 링크 (rc=$rc)"
# 29-3. vr__new_placed(=vr__link_place): 마지막 확인 직후 목적 경로를 파일·링크·FIFO·폴더로 만듦 → 그 객체 보존(inode·내용), 1, 임시 이름 없음
for kind in reg lnk fifo dir; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/lp_$kind"; mkdir -p "$D"; X="$TMP/lp_$kind.ext"; mkext "$X"
    vr_hook_place_before() { case $kind in reg) printf FOREIGN > "$1" ;; lnk) ln -s "$X" "$1" ;; fifo) mkfifo "$1" ;; dir) mkdir "$1" ;; esac; oid "$1" > "$D.before"; }
    vr__new_placed "$D/f.txt" fd append; r=$?
    [ $r -eq 1 ] && [ -z "$fd" ] && [ "$(oid "$D/f.txt")" = "$(cat "$D.before")" ] && extsame "$X" && [ -z "$(ls -A "$D" | grep '\.vr\.new\.')" ] ); rc=$?
  [ $rc -eq 0 ] && ok "덮어쓰지 않는 놓기(새 파일, 목적이 $kind 로 생김): 1, 그 객체 inode·종류·내용 보존, 외부 파일 그대로, 임시 이름 없음" || bad "덮어쓰지 않는 놓기 $kind (rc=$rc)"
done
# 29-4. vr__write_verified: 놓기 직전(주입 지점 place_before) 목적 경로를 파일·링크·FIFO·폴더로 만듦 → 보존, 1 / 우리 이전 객체가 남의 것으로 바뀜 → 보존, 1
for kind in reg lnk fifo dir; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/wp_$kind"; mkdir -p "$D"; X="$TMP/wp_$kind.ext"; mkext "$X"
    vr_hook_place_before() { case $kind in reg) printf FOREIGN > "$1" ;; lnk) ln -s "$X" "$1" ;; fifo) mkfifo "$1" ;; dir) mkdir "$1" ;; esac; oid "$1" > "$D.before"; }
    vr__write_verified "$D/r.txt" $'ALL_DONE: x\n' $'NOT_DONE\n'; r=$?
    [ $r -eq 1 ] && [ "$(oid "$D/r.txt")" = "$(cat "$D.before")" ] && extsame "$X" && norep "$D" ); rc=$?
  [ $rc -eq 0 ] && ok "보고 파일 놓기 직전 목적이 $kind 로 생김: 1, 그 객체 inode·종류·내용 보존, 외부 파일 그대로, 임시 이름 없음" || bad "보고 파일 놓기 직전 $kind (rc=$rc)"
done
( . "$HERE/lib/verify_run.sh"; D="$TMP/wp_own"; mkdir -p "$D"; exec {OWN}>"$D/r.txt"; printf old >&$OWN
  vr_hook_report_prerename() { rm -f "$1"; printf FOREIGN > "$1"; oid "$1" > "$D.before"; }
  vr__write_verified "$D/r.txt" $'new\n' "" "$OWN"; r=$?
  [ $r -eq 1 ] && [ "$(oid "$D/r.txt")" = "$(cat "$D.before")" ] && norep "$D" ); rc=$?
[ $rc -eq 0 ] && ok '보고 파일: 교체하려던 우리 이전 객체가 놓기 직전 남의 파일로 바뀜 → 그 파일을 지우지도 대체하지도 않음, 1' || bad "보고 파일 이전 객체 교체 (rc=$rc)"
# 29-4b. 놓기 실패 + 임시 객체 정리 실패 → vr__wv_note → vr_finish 3(남은 경로 기록)
s_wpleft() { vr_hook_place_before() { case "$1" in */step_status.txt) printf FOREIGN > "$1" ;; esac; }; vr_expect a; run a true; }
scenario wpleft s_wpleft; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/wpleft" && grep -qxF '기록 실패: step_status.txt' "$TMP/wpleft/failed_steps.txt" && [ "$(cat "$TMP/wpleft/step_status.txt")" = FOREIGN ]; } \
  && ok '보고 파일 놓기 실패(목적에 남의 파일) → 남의 파일 그대로, 기록 실패 3, ALL_DONE 없음' || bad "보고 파일 놓기 실패 전파 (rc=$rc)"
s_wpleft2() { vr_hook_report_write() { case "$1" in */step_status.txt) local t; for t in "${1%/*}"/.vr.rep.*; do ln "$t" "$t.keep"; done ;; esac; }; vr_hook_place_before() { case "$1" in */step_status.txt) printf FOREIGN > "$1" ;; esac; }; vr_expect a; run a true; }
scenario wpleft2 s_wpleft2; rc=$?
{ [ $rc -eq 3 ] && no_alldone "$TMP/wpleft2" && grep -qxF '기록 실패: step_status.txt' "$TMP/wpleft2/failed_steps.txt" && grep -q '^기록 실패: 임시 파일 정리 .*\.vr\.rep\.' "$TMP/wpleft2/failed_steps.txt" && [ "$(cat "$TMP/wpleft2/step_status.txt")" = FOREIGN ]; } \
  && ok '보고 파일 놓기 실패 + 임시 객체 정리 실패(링크 수 2) → vr__wv_note 로 "임시 파일 정리" 기록 실패, vr_finish 3' || bad "보고 파일 놓기·정리 실패 전파 (rc=$rc)"
# 29-5. 상태 기록 대상이 이미 있음(파일·링크·FIFO) → 덮어쓰지 않고 실패, 그 객체 보존 / + 임시 정리 실패 전파
for kind in reg lnk fifo; do
  eval "s_stex_$kind() { vr_hook_before_commit() { local t=\"\$VR_ST/\$1.status\"; case $kind in reg) printf FOREIGN > \"\$t\" ;; lnk) ln -s \"$TMP/stex_$kind.ext\" \"\$t\" ;; fifo) mkfifo \"\$t\" ;; esac; oid \"\$t\" > \"$TMP/stex_$kind.before\"; }; vr_expect a; run a true; unset -f vr_hook_before_commit; }"
  mkext "$TMP/stex_$kind.ext"
  ( scenario "stex_$kind" "s_stex_$kind" ) & wp=$!; ( sleep $TO; kill -9 $wp 2>/dev/null ) & kp=$!; wait $wp; rc=$?; kill $kp 2>/dev/null; wait $kp 2>/dev/null
  { [ $rc -ne 0 ] && [ $rc -ne 137 ] && no_alldone "$TMP/stex_$kind" && grep -qxF '기록 실패: a 상태 파일 놓기' "$TMP/stex_$kind/failed_steps.txt" \
    && [ "$(oid "$TMP/stex_$kind/status/a.status")" = "$(cat "$TMP/stex_$kind.before")" ] && extsame "$TMP/stex_$kind.ext" \
    && [ -z "$(ls -A "$TMP/stex_$kind/status" | grep 'status\.tmp\.')" ]; } \
    && ok "상태 기록 대상이 이미 $kind: 덮어쓰지 않고 \"상태 파일 놓기\" 기록 실패, 그 객체 inode·종류·내용 보존, 임시 파일 정리됨, 멈추지 않음" || bad "상태 기록 대상 선점 $kind (rc=$rc)"
done
s_stexl() { vr_hook_before_commit() { local t="$VR_ST/$1.status" tmp="$VR_ST/$1.status.tmp.$BASHPID"; printf FOREIGN > "$t"; ln "$tmp" "$tmp.keep"; }; vr_expect a; run a true; unset -f vr_hook_before_commit; }
scenario stexl s_stexl; rc=$?
{ [ $rc -eq 3 ] && grep -qxF '기록 실패: a 상태 파일 놓기' "$TMP/stexl/failed_steps.txt" && grep -q '^기록 실패: 임시 파일 정리 .*status\.tmp\.' "$TMP/stexl/failed_steps.txt" && [ "$(cat "$TMP/stexl/status/a.status")" = FOREIGN ]; } \
  && ok '상태 기록 대상 선점 + 임시 정리 실패(링크 수 2) → "임시 파일 정리" 기록 실패 전파, 3, 남의 상태 파일 그대로' || bad "상태 기록 대상 선점·정리 실패 (rc=$rc)"
# 29-6~8. 첫 vr_init 도중 읽기 프로세스를 띄운 뒤 다음 단계가 실패(주입 msgsid)하고 읽기 프로세스 종료 확인도 실패(stuck)
( . "$HERE/lib/verify_run.sh"; R="$TMP/fs"; mkdir -p "$R"; A="$R/A"; B="$R/B"; D="$R/D"; RS_SLEEP=8; VR__READER_STOP_TIMEOUT=1
  vr_hook_reader() { case $1 in after_s) printf '%s' "$BASHPID" > "$R/rpid" ;; end) sleep "$RS_SLEEP" ;; esac; return 0; }
  vr_hook_init_fail() { [ "$1" = msgsid ]; }
  snapA() { ( cd "$A" && { find . | sort; find . -type f ! -name '.vr_*' -exec sha256sum {} + | sort; } ); }
  vr_init "$A" 2> "$R/A.err"; r=$?; unset -f vr_hook_init_fail; rpid=$(cat "$R/rpid")
  # 6: 주입 결과 — 초기화 2, stuck, 잠금·생명주기 객체·읽기 프로세스 보존, 진단에 A·PID
  [ $r -eq 2 ] && [ "$VR__INIT_OK" = 0 ] && [ "$VR__READER_STATE" = stuck ] || { echo "6: r=$r st=$VR__READER_STATE"; exit 1; }
  grep -qF "알림 읽기 프로세스 종료 확인 실패: $A(읽기 프로세스 PID $rpid)" "$R/A.err" || { echo "6: 진단 $(cat "$R/A.err")"; exit 2; }
  li=$(stat -c %i "$A/.vr_lock"); [ "$VR__HELD_OUT" = "$A" ] && vr__lock_owned && [ -p "$A/.vr_life" ] && [ -p "$A/.vr_done" ] && kill -0 "$rpid" 2>/dev/null || { echo '6: 보존'; exit 3; }
  s0=$(snapA)
  vr_finish > "$R/fin1" 2>&1; [ $? -eq 3 ] && grep -q '초기화가 성공한 상태가 아님' "$R/fin1" && [ "$(snapA)" = "$s0" ] && [ ! -e "$A/logs/99_done.log" ] || { echo '6: vr_finish'; exit 4; }
  # 7: 재초기화 거부, 원래 잠금·읽기 자원 보존, 진단에 A·PID, B 만들지 않음, 다른 프로세스는 A 잠금 못 얻음
  vr_init "$B" 2> "$R/B.err"; r=$?
  [ $r -eq 2 ] && [ "$VR__READER_STATE" = stuck ] && grep -qF "$A(읽기 프로세스 PID $rpid)" "$R/B.err" && [ ! -e "$B" ] || { echo "7: r=$r $(cat "$R/B.err")"; exit 5; }
  [ "$(stat -c %i "$A/.vr_lock")" = "$li" ] && vr__lock_owned && kill -0 "$rpid" 2>/dev/null && [ "$(snapA)" = "$s0" ] || { echo '7: 보존'; exit 6; }
  ( unset -f vr_hook_reader; . "$HERE/lib/verify_run.sh"; vr_init "$A" 2>/dev/null; echo $? > "$R/other.rc" )
  [ "$(cat "$R/other.rc")" = 2 ] && [ "$(stat -c %i "$A/.vr_lock")" = "$li" ] || { echo '7: 다른 프로세스'; exit 7; }
  # 8: 읽기 프로세스가 실제로 끝난 뒤에만 정리·새 초기화 성공
  for k in $(seq 1 150); do kill -0 "$rpid" 2>/dev/null || break; sleep 0.1; done; kill -0 "$rpid" 2>/dev/null && { echo '8: 안 끝남'; exit 8; }
  [ -e "$A/.vr_lock" ] || { echo '8: 종료 확인 전 잠금이 풀림'; exit 9; }
  RS_SLEEP=0; vr_init "$D" 2> "$R/D.err"; r=$?
  [ $r -eq 0 ] && [ "$VR__INIT_OK" = 1 ] && [ ! -e "$A/.vr_lock" ] && [ ! -e "$A/.vr_life" ] && [ ! -e "$A/.vr_done" ] && [ ! -e "$A/.vr_msgs" ] || { echo "8: r=$r $(cat "$R/D.err")"; exit 10; }
  vr_expect d; run d true; vr_finish > /dev/null 2>&1; [ $? -eq 0 ] && grep -qx 'ALL_DONE: 모든 항목 종료 코드 0 (1 개 항목)' "$D/logs/99_done.log" && [ ! -e "$A/logs/99_done.log" ] || { echo '8: D 판정'; exit 11; } ) > "$TMP/fs.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '첫 초기화 중 읽기 프로세스 stuck: 2·진단에 A·PID, A 잠금·생명주기 객체·읽기 프로세스 보존, vr_finish 3·무기록 / 재초기화 거부·B 미생성·다른 프로세스 잠금 불가 / 종료 확인 전 잠금 유지, 확인 뒤 정리·새 초기화 성공' || bad "첫 초기화 중 stuck (단계 $rc: $(tr '\n' ';' < "$TMP/fs.out"))"

# ── 5edf4a4 재검수: 이전 fd 교체 예외의 범위, 초기화 실패 정리 실패 전파, ln 확인(합성 주입) ─────────────────────────────────────────────
rsnap() { ( cd "$1" && { find . \( -name .vr_life -o -name .vr_done -o -name .vr_msgs -o -name .vr_lock \) -prune -o -print | sort; find . -type f ! -name '.vr_*' -exec stat -c '%n %i' {} + | sort; find . -type f ! -name '.vr_*' -exec sha256sum {} + | sort; } ); }
# 30-1. A → B → A: A 의 이전 fd 는 B 의 파일(같은 inode 의 다른 이름 포함) 교체에 쓰이지 않음, B 뒤에는 A 의 이전 fd 가 닫혀 A 재사용도 거부
( . "$HERE/lib/verify_run.sh"; R="$TMP/xab"; A="$R/A"; B="$R/B"; B2="$R/B2"; mkdir -p "$R"
  vr_init "$A" || exit 9; vr_expect a; run a true; s0=$(rsnap "$A")
  mkdir -p "$B"; ln "$A/failed_steps.txt" "$B/failed_steps.txt"; ib=$(stat -c %i "$B/failed_steps.txt")
  vr_init "$B" 2> "$R/B.err"; r=$?
  [ $r -eq 2 ] && grep -q 'failed_steps.txt 생성 실패' "$R/B.err" && [ "$(stat -c %i "$B/failed_steps.txt")" = "$ib" ] && [ "$B/failed_steps.txt" -ef "$A/failed_steps.txt" ] || { echo "B: r=$r"; exit 1; }
  [ "$(rsnap "$A")" = "$s0" ] || { echo 'B 뒤 A 변경'; exit 2; }
  vr_init "$B2" || { echo 'B2 실패'; exit 3; }; [ "$(rsnap "$A")" = "$s0" ] || { echo 'B2 뒤 A 변경'; exit 4; }
  vr_init "$A" 2> "$R/A2.err"; r=$?
  [ $r -eq 2 ] && grep -q 'failed_steps.txt 생성 실패' "$R/A2.err" && [ "$(rsnap "$A")" = "$s0" ] || { echo "A 재사용 r=$r"; exit 5; } ) > "$TMP/xab.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok '이전 fd 범위(A→B→A): B 의 failed_steps 가 A 의 같은 inode 하드 링크여도 경로가 달라 교체하지 않음(2·그대로), B2 성공 뒤 A 재사용은 이전 fd 가 닫혀 거부, A 의 보고·상태 무변경' || bad "이전 fd 범위 A→B→A (단계 $rc: $(tr '\n' ';' < "$TMP/xab.out"))"
# 30-1b. A 의 failed_steps.txt 를 B 의 같은 이름으로 옮김(같은 inode, 링크 수 1) → A 의 이전 fd 로 B 경로의 객체를 지우지 않음(경로가 다름)
( . "$HERE/lib/verify_run.sh"; A="$TMP/xmv_A"; B="$TMP/xmv_B"; vr_init "$A" || exit 9; vr_expect a; run a true
  mkdir -p "$B"; mv "$A/failed_steps.txt" "$B/failed_steps.txt"; i0=$(stat -c %i "$B/failed_steps.txt")
  vr_init "$B" 2>/dev/null; r=$?; [ $r -eq 2 ] && [ "$(stat -c %i "$B/failed_steps.txt")" = "$i0" ] && [ ! -e "$B/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '이전 fd 범위: A 의 보고 객체가 B 의 경로로 옮겨져 있어도(같은 inode) 경로가 달라 교체하지 않음 — 2, 그 객체 보존' || bad "이전 fd 범위 경로 결속 (rc=$rc)"
# 30-2. A → A: 같은 경로의 이전 우리 객체만 교체(새 inode·빈 내용)
( . "$HERE/lib/verify_run.sh"; A="$TMP/xaa"; vr_init "$A" || exit 9; vr_expect a; run a true
  i1=$(stat -c %i "$A/failed_steps.txt"); i2=$(stat -c %i "$A/expected_steps.txt"); i3=$(stat -c %i "$A/status/_violations.txt"); [ -s "$A/expected_steps.txt" ] || exit 1
  vr_init "$A" || exit 2
  [ "$(stat -c %i "$A/expected_steps.txt")" != "$i2" ] && [ ! -s "$A/expected_steps.txt" ] && [ "$(stat -c %i "$A/failed_steps.txt")" != "$i1" ] && [ "$(stat -c %i "$A/status/_violations.txt")" != "$i3" ] || exit 3
  [ -z "$(ls -A "$A" "$A/status" | grep '\.vr\.new\.')" ] ); rc=$?
[ $rc -eq 0 ] && ok '이전 fd 범위(A→A): 같은 경로의 이전 우리 객체 3개를 소유 확인 뒤 교체(새 inode·빈 내용), 임시 이름 없음' || bad "이전 fd 범위 A→A (단계 $rc)"
# 30-3. A 실패 → A 재시도: 이번에 만든 파일을 지우고 잠금 해제 → 재시도 성공
( . "$HERE/lib/verify_run.sh"; A="$TMP/xaf"; vr_hook_init_fail() { [ "$1" = list ]; }; vr_init "$A" 2>/dev/null; r=$?; unset -f vr_hook_init_fail
  [ $r -eq 2 ] && [ ! -e "$A/failed_steps.txt" ] && [ ! -e "$A/expected_steps.txt" ] && [ ! -e "$A/status/_violations.txt" ] && [ ! -e "$A/.vr_lock" ] || exit 1
  vr_init "$A" || exit 2; vr_expect a; run a true; vr_finish > /dev/null 2>&1 ); rc=$?
[ $rc -eq 0 ] && ok '이전 fd 범위(A 실패→A 재시도): 실패한 초기화가 만든 보고·추가 기록 파일을 소유 확인 삭제·잠금 해제, 재시도 성공·판정 0' || bad "A 실패→A 재시도 (단계 $rc)"
# 30-4. 소유 증거 없는 기존 보고 파일 → 덮어쓰지 않고 거부, 이번에 만든 것만 정리
( . "$HERE/lib/verify_run.sh"; A="$TMP/xnp"; mkdir -p "$A"; printf FOREIGN > "$A/expected_steps.txt"; i0=$(stat -c %i "$A/expected_steps.txt")
  vr_init "$A" 2>/dev/null; r=$?
  [ $r -eq 2 ] && [ "$(stat -c %i "$A/expected_steps.txt")" = "$i0" ] && [ "$(cat "$A/expected_steps.txt")" = FOREIGN ] && [ ! -e "$A/failed_steps.txt" ] && [ ! -e "$A/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok '소유 증거 없는 기존 보고 파일(expected_steps.txt): 대체하지 않고 2, 그 파일 inode·내용 그대로, 이번에 먼저 만든 failed_steps.txt 는 정리, 잠금 해제' || bad "소유 증거 없는 기존 보고 파일 (rc=$rc)"
# 30-5. (주입 함수 안에서는 n·d 를 쓰지 않는다 — vr__rm_owned 의 local 이 동적 범위로 가림) 초기화 실패 시 보고 파일 삭제 실패 조합(1~3개, 모든 부분집합): 실패한 것은 남기고 경로를 진단에, 나머지는 삭제, 잠금 해제, fd 없음, 다음 vr_init 거부
XN=0
for combo in "failed_steps.txt" "expected_steps.txt" "_violations.txt" "failed_steps.txt expected_steps.txt" "failed_steps.txt _violations.txt" "expected_steps.txt _violations.txt" "failed_steps.txt expected_steps.txt _violations.txt"; do
  XN=$((XN + 1))
  ( . "$HERE/lib/verify_run.sh"; A="$TMP/xdf_$XN"; KEEP=" $combo "; CUR=""
    vr_hook_init_fail() { [ "$1" = list ]; }
    vr_hook_rm_owned() { CUR=$1; }
    vr_hook_rm_stage() { [ "$1" = verified ] && case "$KEEP" in *" ${CUR##*/} "*) ln "$2" "$TMP/xdf_$XN.keep.${CUR##*/}" ;; esac; return 0; }
    vr_init "$A" 2> "$TMP/xdf_$XN.err"; r=$?
    unset -f vr_hook_init_fail vr_hook_rm_owned vr_hook_rm_stage
    [ $r -eq 2 ] && grep -q '초기화 실패 뒤 정리 실패' "$TMP/xdf_$XN.err" && [[ "$VR__INIT_ERR" == *"정리 실패"* ]] || { echo "r=$r"; exit 1; }
    for f in failed_steps.txt expected_steps.txt status/_violations.txt; do
      b=${f##*/}
      case "$KEEP" in
        *" $b "*) [ -f "$A/$f" ] && grep -qF "$A/$f" "$TMP/xdf_$XN.err" || { echo "남김 $f"; exit 2; }
                  for x in /proc/$BASHPID/fd/*; do [ "$x" -ef "$A/$f" ] && { echo "fd 남음 $f"; exit 3; }; done ;;
        *) [ ! -e "$A/$f" ] && ! grep -qF "$A/$f" "$TMP/xdf_$XN.err" || { echo "삭제 $f"; exit 4; } ;;
      esac
    done
    [ ! -e "$A/.vr_lock" ] || exit 5
    s1=$(rsnap "$A"); vr_init "$A" 2>/dev/null; [ $? -eq 2 ] && [ "$(rsnap "$A")" = "$s1" ] || exit 6 ) > "$TMP/xdf_$XN.out" 2>&1; rc=$?
  [ $rc -eq 0 ] && ok "초기화 실패 정리 실패 조합($combo): 2·VR__INIT_ERR·진단에 남긴 경로, 그 파일만 남김·나머지 삭제, 잠금 해제, 남긴 파일을 가리키는 fd 없음, 다음 vr_init 거부·무변경" || bad "초기화 실패 정리 실패 조합 $combo (단계 $rc: $(tr '\n' ';' < "$TMP/xdf_$XN.out"))"
done
# 30-6. ln 확인: GNU 아님 / 없음 / -T 미지원 / -T 를 무시 → vr_init 2(사유), 성공으로 진행하지 않음 / 기능 확인 정리 실패도 2
( . "$HERE/lib/verify_run.sh"; ln() { if [ "$1" = --version ]; then echo 'ln (BusyBox) 1.0'; else command ln "$@"; fi; }
  vr_init "$TMP/xln1" 2> "$TMP/xln1.err"; [ $? -eq 2 ] && grep -q 'GNU coreutils 의 ln 필요' "$TMP/xln1.err" && [ ! -e "$TMP/xln1" ] ); rc=$?
[ $rc -eq 0 ] && ok 'ln 확인: GNU coreutils 가 아닌 ln → vr_init 2·사유, 출력 폴더를 만들지 않음' || bad "ln 비 GNU (rc=$rc)"
mkdir -p "$TMP/noln"; for f in /usr/bin/* /bin/*; do b=${f##*/}; [ "$b" = ln ] && continue; [ -e "$TMP/noln/$b" ] || ln -s "$f" "$TMP/noln/$b" 2>/dev/null; done
( PATH="$TMP/noln"; . "$HERE/lib/verify_run.sh"; vr_init "$TMP/xln2" 2> "$TMP/xln2.err"; [ $? -eq 2 ] && grep -q 'ln 없음' "$TMP/xln2.err" && [ ! -e "$TMP/xln2" ] ); rc=$?
[ $rc -eq 0 ] && ok 'ln 확인: ln 이 없음 → vr_init 2·"ln 없음", 출력 폴더를 만들지 않음' || bad "ln 없음 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; ln() { local a; for a in "$@"; do [ "$a" = -T ] && { echo "ln: invalid option -- 'T'" >&2; return 1; }; done; command ln "$@"; }
  vr_init "$TMP/xln3" 2> "$TMP/xln3.err"; [ $? -eq 2 ] && grep -q 'ln -T(덮어쓰지 않는 놓기) 동작 이상' "$TMP/xln3.err" && [ ! -e "$TMP/xln3/.vr_lock" ] && [ -z "$(ls -A "$TMP/xln3" | grep 'vr\.plat')" ] ); rc=$?
[ $rc -eq 0 ] && ok 'ln 확인: -T 미지원 → 기능 확인 실패로 vr_init 2·사유, 잠금·확인용 폴더 남지 않음' || bad "ln -T 미지원 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; ln() { local a b=(); for a in "$@"; do [ "$a" = -T ] || b+=("$a"); done; command ln "${b[@]}"; }
  vr_init "$TMP/xln4" 2> "$TMP/xln4.err"; [ $? -eq 2 ] && grep -q 'ln -T(덮어쓰지 않는 놓기) 동작 이상' "$TMP/xln4.err" && [ ! -e "$TMP/xln4/.vr_lock" ] ); rc=$?
[ $rc -eq 0 ] && ok 'ln 확인: -T 를 무시하는 ln(폴더 안으로 링크) → 기능 확인 실패로 vr_init 2' || bad "ln -T 무시 (rc=$rc)"
( . "$HERE/lib/verify_run.sh"; rmdir() { case "$*" in *.vr.plat.*) return 1 ;; esac; command rmdir "$@"; }
  vr_init "$TMP/xln5" 2> "$TMP/xln5.err"; [ $? -eq 2 ] && grep -q '확인용 폴더 정리 실패' "$TMP/xln5.err" && [ ! -e "$TMP/xln5/.vr_lock" ] && [ "$VR__INIT_OK" = 0 ] ); rc=$?
[ $rc -eq 0 ] && ok '기능 확인 정리 실패(확인용 폴더를 지우지 못함) → 성공으로 보지 않고 vr_init 2·사유, 잠금 해제' || bad "기능 확인 정리 실패 (rc=$rc)"

# ── 876c5f2 추가 확인(R1·R2) 경계 시험 ───────────────────────────────────────────────────────────────────────────────
# 31-1. 전제(커널 동작 고정): 링크 수 0 인 inode 에는 /proc/self/fd 를 통한 linkat(AT_SYMLINK_FOLLOW, ln -L)로도 새 링크를 만들 수 없음(대조: 링크 1 이면 가능)
( D="$TMP/nl0"; mkdir -p "$D"; printf X > "$D/a"; exec {f}<"$D/a"
  ln -L "/proc/$BASHPID/fd/$f" "$D/ctl" 2>/dev/null && [ "$(stat -L -c %h "/dev/fd/$f")" = 2 ] || exit 1
  rm -f "$D/a" "$D/ctl"; [ "$(stat -L -c %h "/dev/fd/$f")" = 0 ] || exit 2
  ! ln -L "/proc/$BASHPID/fd/$f" "$D/b" 2>/dev/null && [ ! -e "$D/b" ] && [ "$(stat -L -c %h "/dev/fd/$f")" = 0 ] ); rc=$?
[ $rc -eq 0 ] && ok '전제: 링크 수 0 인 inode 는 /proc/self/fd 경유 linkat 으로도 다시 이름을 얻지 못함(ENOENT, 링크 수 0 유지) — 링크 1 일 때는 가능(대조)' || bad "전제: 링크 수 0 재링크 (단계 $rc)"
# 31-2. vr__drop_own 경로 부재 판정: 완전히 사라짐 → 0(이후 재링크 불가) / 다른 이름으로 옮겨짐 → 1·그 객체 보존 / 부재 확인 뒤 다른 이름이 생김 → 1
( . "$HERE/lib/verify_run.sh"; D="$TMP/dop"; mkdir -p "$D"; e=0
  printf A > "$D/a"; exec {fa}<"$D/a"; rm -f "$D/a"
  vr__drop_own "$D/a" "$fa"; [ $? -eq 0 ] && ! ln -L "/proc/$BASHPID/fd/$fa" "$D/a2" 2>/dev/null || { echo '  사라짐'; e=1; }
  printf B > "$D/b"; exec {fb}<"$D/b"; mv "$D/b" "$D/b.moved"
  vr__drop_own "$D/b" "$fb"; [ $? -eq 1 ] && [ "$(cat "$D/b.moved")" = B ] && [ "$D/b.moved" -ef "/dev/fd/$fb" ] || { echo '  옮겨짐'; e=1; }
  printf C > "$D/c"; exec {fc}<"$D/c"; ln "$D/c" "$D/c.other"; rm -f "$D/c"
  stat() { if [ "$*" = "-L -c %h /dev/fd/$fc" ]; then ln -f "$D/c.other" "$D/c.third"; fi; command stat "$@"; }   # 부재 확인 직후·링크 수 확인 직전에 이름이 더 생김
  vr__drop_own "$D/c" "$fc"; r=$?; unset -f stat
  [ $r -eq 1 ] && [ -e "$D/c.other" ] && [ -e "$D/c.third" ] || { echo "  부재 뒤 링크 생성 r=$r"; e=1; }
  exit $e ) > "$TMP/dop.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok 'vr__drop_own 경로 부재: 완전히 사라짐 → 0(재링크 불가) / 다른 이름으로 옮겨짐 → 1·보존 / 부재 확인 뒤 다른 이름이 생김 → 1(남음으로 판정, 지우지 않음)' || bad "vr__drop_own 경로 부재 $(tr '\n' ';' < "$TMP/dop.out")"
# 31-3. vr_init 반환 규약과 정리 실패 표시: 반환은 실패면 항상 2, 정리 실패는 VR__INIT_CLEANUP_FAIL=1 로 따로 — 정리 성공 실패면 0, 다음 vr_init 에서 초기화
( . "$HERE/lib/verify_run.sh"; e=0
  vr_hook_init_fail() { [ "$1" = list ]; }
  vr_init "$TMP/icf_a" 2>/dev/null; r=$?; [ $r -eq 2 ] && [ "$VR__INIT_CLEANUP_FAIL" = 0 ] || { echo "  정리 성공 r=$r f=$VR__INIT_CLEANUP_FAIL"; e=1; }
  CUR=""; vr_hook_rm_owned() { CUR=$1; }
  vr_hook_rm_stage() { [ "$1" = verified ] && case "$CUR" in */expected_steps.txt) ln "$2" "$TMP/icf_b.keep" ;; esac; return 0; }
  vr_init "$TMP/icf_b" 2> "$TMP/icf_b.err"; r=$?
  [ $r -eq 2 ] && [ "$VR__INIT_CLEANUP_FAIL" = 1 ] && [[ "$VR__INIT_ERR" == *"정리 실패"*"icf_b/expected_steps.txt"* ]] && grep -q '정리 실패' "$TMP/icf_b.err" || { echo "  정리 실패 r=$r f=$VR__INIT_CLEANUP_FAIL"; e=1; }
  unset -f vr_hook_init_fail vr_hook_rm_owned vr_hook_rm_stage
  vr_init "$TMP/icf_c" || { echo '  성공'; e=1; }; [ "$VR__INIT_CLEANUP_FAIL" = 0 ] || { echo '  표시 초기화'; e=1; }
  exit $e ) > "$TMP/icf.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok 'vr_init 반환 규약: 초기화 실패는 정리 성공·실패와 관계없이 2, 정리 실패는 VR__INIT_CLEANUP_FAIL=1·VR__INIT_ERR(남긴 경로)·표준 오류로 따로, 다음 vr_init 에서 0 으로 초기화' || bad "vr_init 반환 규약 $(tr '\n' ';' < "$TMP/icf.out")"


# ── 6e1d082 Codex 반려(RACE-1): 임시 원본 경로 교체 — fd 기반 놓기(합성 주입) ────────────────────────────────────────────────
# 공통 확인: 외부 파일(X)의 inode·내용·링크 수가 주입 직후와 같고, 목적 경로가 X 의 하드 링크가 아님(목적이 있으면 fd 의 우리 객체).
xstate() { stat -c '%i:%h' "$1" 2>/dev/null; sha256sum < "$1"; }
# 32-1. vr__link_place: 확인 뒤·놓기 직전에 임시 경로를 바꿈
#   hl   = 우리 임시 이름을 옆으로 옮기고 그 자리에 외부 일반 파일의 하드 링크를 넣음 → 놓이는 것은 우리 객체, 3(임시 이름 자리의 남의 것은 건드리지 않음)
#   copy = 옆으로 옮기고 외부 내용의 다른 일반 파일을 넣음 → 우리 객체, 3
#   sym  = 옆으로 옮기고 외부 파일을 가리키는 심볼릭 링크를 넣음 → 우리 객체, 3
#   gone = 우리 임시 이름을 지우고(링크 수 0) 외부 하드 링크를 넣음 → 놓지 않음(ENOENT), 1, 목적 경로 없음
for kind in hl copy sym gone; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/rc1_$kind"; mkdir -p "$D"; X="$TMP/rc1_$kind.ext"; mkext "$X"; T="$D/.vr.new.TESTTESTTESTTEST"
    vr__new_obj "$T" fd || exit 1; printf OURS >&$fd
    vr_hook_place_before() { case $kind in
        hl)   mv "$T" "$T.moved"; ln "$X" "$T" ;;
        copy) mv "$T" "$T.moved"; cp "$X" "$T" ;;
        sym)  mv "$T" "$T.moved"; ln -s "$X" "$T" ;;
        gone) rm -f "$T"; ln "$X" "$T" ;;
      esac; xstate "$X" > "$D.xs"; oid "$T" > "$D.ts"; }
    vr__link_place "$T" "$D/f.txt" "$fd"; r=$?
    [ "$(xstate "$X")" = "$(cat "$D.xs")" ] && extsame "$X" && [ "$(oid "$T")" = "$(cat "$D.ts")" ] || exit 2      # 외부 파일·임시 자리의 남의 것 보존
    ! [ "$D/f.txt" -ef "$X" ] || exit 3                                                                      # 외부 파일의 하드 링크가 목적에 없음
    if [ $kind = gone ]; then [ $r -eq 1 ] && [ ! -e "$D/f.txt" ] && [ ! -L "$D/f.txt" ] || exit 4; exit 0; fi
    [ $r -eq 3 ] && [ ! -L "$D/f.txt" ] && [ "$D/f.txt" -ef "/dev/fd/$fd" ] && [ "$(cat "$D/f.txt")" = OURS ] || exit 5
    [[ "$VR__WV_LEFT" == "$T("*"남의 객체"* ]] || exit 6                                                       # 정확한 진단(임시 이름 자리)
    [ "$T.moved" -ef "/dev/fd/$fd" ] && [ "$(stat -L -c %h "/dev/fd/$fd")" = 2 ] || exit 7 ); rc=$?          # 우리 객체 = 목적 + 옮겨진 이름(주입이 만든 것)
  [ $rc -eq 0 ] && ok "RACE-1 vr__link_place: 놓기 직전 임시 경로 교체($kind) → 외부 파일 inode·내용·링크 수 보존, 목적에 외부 하드 링크 없음, $([ $kind = gone ] && echo '놓지 않음(1)' || echo '목적 = fd 의 우리 객체·3·임시 자리 진단')" || bad "RACE-1 vr__link_place $kind (단계 $rc)"
done
# 32-2. vr__link_place: 임시 이름만 사라지고 우리 객체가 다른 이름으로 남음 → 3(위치 미확인 진단) / 임시 이름만 사라짐(다른 이름 없음) → 0(우리 객체 = 목적 하나)
( . "$HERE/lib/verify_run.sh"; D="$TMP/rc2"; mkdir -p "$D"; T="$D/.vr.new.TESTTESTTESTTEST"; e=0
  vr__new_obj "$T" fd || exit 9
  vr_hook_place_after() { mv "$T" "$T.away"; }
  vr__link_place "$T" "$D/a" "$fd"; r=$?; [ $r -eq 3 ] && [ "$D/a" -ef "/dev/fd/$fd" ] && [[ "$VR__WV_LEFT" == "$T("*"다른 이름으로 남음"* ]] || { echo "  옮겨짐 r=$r"; e=1; }
  exec {fd}>&-; vr__new_obj "$T" fd || exit 9
  vr_hook_place_after() { rm -f "$T"; }
  vr__link_place "$T" "$D/b" "$fd"; r=$?; [ $r -eq 0 ] && [ "$D/b" -ef "/dev/fd/$fd" ] && [ "$(stat -L -c %h "/dev/fd/$fd")" = 1 ] || { echo "  사라짐 r=$r"; e=1; }
  exit $e ) > "$TMP/rc2.out" 2>&1; rc=$?
[ $rc -eq 0 ] && ok 'RACE-1 vr__link_place: 놓은 뒤 임시 이름이 옮겨짐 → 3·"다른 이름으로 남음" 진단 / 임시 이름이 지워짐 → 0(우리 객체의 이름은 목적 하나)' || bad "RACE-1 임시 이름 사라짐 $(tr '\n' ';' < "$TMP/rc2.out")"
# 32-3. 호출 경로: vr__write_verified(보고 파일)·vr__new_placed(로그·추가 기록)에서 놓기 직전 임시 이름(.vr.rep.*·.vr.new.*)을 외부 하드 링크로 교체
for via in report placed; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/rc3_$via"; mkdir -p "$D"; X="$TMP/rc3_$via.ext"; mkext "$X"
    vr_hook_place_before() { local t; for t in "$D"/.vr.rep.* "$D"/.vr.new.*; do [ -f "$t" ] || continue; mv "$t" "$D/kept"; ln "$X" "$t"; echo "$t" > "$D.tn"; done; xstate "$X" > "$D.xs"; }
    if [ $via = report ]; then vr__write_verified "$D/r.txt" $'ALL_DONE: x\n' $'NOT_DONE\n'; r=$?; f="$D/r.txt"
    else vr__new_placed "$D/r.txt" nfd append; r=$?; f="$D/r.txt"; fi
    T=$(cat "$D.tn")
    [ "$(xstate "$X")" = "$(cat "$D.xs")" ] && extsame "$X" && ! [ "$f" -ef "$X" ] || exit 2
    [ $r -eq 3 ] && [ "$T" -ef "$X" ] && [ -f "$f" ] && ! [ -L "$f" ] && [ "$f" -ef "$D/kept" ] || exit 3
    [[ "$VR__WV_LEFT" == "$T("* ]] || exit 4 ); rc=$?
  [ $rc -eq 0 ] && ok "RACE-1 호출 경로($via): 놓기 직전 임시 이름을 외부 하드 링크로 교체 → 3(실패로 전파), 목적은 우리 객체, 외부 파일·그 이름 보존, 임시 자리 진단" || bad "RACE-1 호출 경로 $via (단계 $rc)"
done
# 32-4. vr_finish 까지: step_status.txt 놓기 직전 임시 이름 교체 → 종료 코드 3, 외부 파일 보존, 보고 파일 어디에도 외부 하드 링크 없음
s_rc4() { vr_hook_place_before() { case "$1" in */step_status.txt) local t; for t in "${1%/*}"/.vr.rep.*; do mv "$t" "$t.kept"; ln "$RC4X" "$t"; done ;; esac; }; vr_expect a; run a true; }
RC4X="$TMP/rc4.ext"; mkext "$RC4X"; scenario rc4 s_rc4; rc=$?
{ [ $rc -eq 3 ] && extsame "$RC4X" && [ "$(stat -c %h "$RC4X")" = 2 ] && ! find "$TMP/rc4" -samefile "$RC4X" ! -name '.vr.rep.*' | grep -q .; } \
  && ok 'RACE-1 vr_finish: step_status.txt 놓기 직전 임시 이름을 외부 하드 링크로 교체 → 3, 외부 파일 내용·링크 수 보존, 출력 폴더의 보고 파일 중 외부 하드 링크 없음' || bad "RACE-1 vr_finish (rc=$rc, nlink=$(stat -c %h "$RC4X"))"
# 32-5. vr__mv_excl: fd 확인 뒤·놓기 직전에 원본 경로를 바꿈(fd 있음·없음) / 원본이 처음부터 외부 파일의 하드 링크(링크 수 2) → 놓지 않음
for kind in fd_hl fd_sym nofd_hl nofd_copy pre_hl; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/rc5_$kind"; mkdir -p "$D"; X="$TMP/rc5_$kind.ext"; mkext "$X"; S="$D/rec"
    if [ $kind = pre_hl ]; then ln "$X" "$S"; else printf OURS > "$S"; fi
    xstate "$X" > "$D.xs0"; fd=""; case $kind in fd_*) exec {fd}<>"$S" ;; esac
    vr_hook_mv_excl_before() { case $kind in
        *_hl)      mv "$S" "$S.moved"; ln "$X" "$S" ;;
        fd_sym)    mv "$S" "$S.moved"; ln -s "$X" "$S" ;;
        nofd_copy) mv "$S" "$S.moved"; cp "$X" "$S" ;;
      esac; xstate "$X" > "$D.xs"; oid "$S" > "$D.ss"; }
    vr__mv_excl "$S" "$D/rec.done" $fd; r=$?
    [ $r -eq 1 ] && extsame "$X" && ! [ "$D/rec.done" -ef "$X" ] || exit 2
    if [ $kind = pre_hl ]; then [ "$(xstate "$X")" = "$(cat "$D.xs0")" ] && [ ! -e "$D/rec.done" ] && [ ! -e "$D.xs" ] && [ "$S" -ef "$X" ] || exit 3; exit 0; fi
    [ "$(xstate "$X")" = "$(cat "$D.xs")" ] && [ "$(oid "$S")" = "$(cat "$D.ss")" ] || exit 4                   # 외부 파일·원본 자리의 남의 것 보존
    [ "$D/rec.done" -ef "$D/rec.moved" ] && [ "$(cat "$D/rec.done")" = OURS ] || exit 5 ); rc=$?               # 놓인 것은 처음 확인한 우리 객체
  [ $rc -eq 0 ] && ok "RACE-1 vr__mv_excl($kind): $([ $kind = pre_hl ] && echo '원본이 외부 파일의 하드 링크 → 놓지 않음·1' || echo '놓기 직전 원본 교체 → 놓이는 것은 확인한 우리 객체, 원본 자리의 남의 것은 건드리지 않음·1'), 외부 파일 inode·내용·링크 수 보존, 목적에 외부 하드 링크 없음" || bad "RACE-1 vr__mv_excl $kind (단계 $rc)"
done
# 32-7. 호출자 정리(vr__wv_drop): 놓기 직전 우리 임시 이름을 지우고(링크 수 0) 외부 하드 링크를 넣음 → 놓지 않음, 3(임시 자리 진단),
#        외부 파일은 옮겨지지도 않음(rename 이면 바뀌는 ctime 까지 같음), 목적 경로 없음
( . "$HERE/lib/verify_run.sh"; D="$TMP/rc7"; mkdir -p "$D"; X="$TMP/rc7.ext"; mkext "$X"
  vr_hook_place_before() { local t; for t in "$D"/.vr.rep.*; do [ -f "$t" ] || continue; rm -f "$t"; ln "$X" "$t"; echo "$t" > "$D.tn"; done; sleep 0.05; stat -c '%i:%h:%z' "$X" > "$D.xs"; }
  vr__write_verified "$D/r.txt" $'ALL_DONE: x\n' $'NOT_DONE\n'; r=$?; T=$(cat "$D.tn")
  [ $r -eq 3 ] && [ ! -e "$D/r.txt" ] && [ ! -L "$D/r.txt" ] && [ "$T" -ef "$X" ] && extsame "$X" && [ "$(stat -c '%i:%h:%z' "$X")" = "$(cat "$D.xs")" ] \
    && [[ "$VR__WV_LEFT" == "$T("*"소유를 입증하지 못해"* ]] && [ -z "$(ls -A "$D" | grep '\.vr\.del\.')" ] ); rc=$?
[ $rc -eq 0 ] && ok 'RACE-1 정리: 우리 임시 이름이 지워지고 외부 하드 링크로 바뀜 → 놓지 않음·3·진단, 외부 파일은 옮기지도 않음(inode·링크 수·ctime 그대로), 목적 경로 없음' || bad "RACE-1 정리 vr__wv_drop (rc=$rc)"
# 32-6. 기능 확인: fd 기반 놓기를 하지 못하는 ln(-L 무시 = 경로 기준 링크) → vr_init 2·사유
( . "$HERE/lib/verify_run.sh"; ln() { local a b=(); for a in "$@"; do [ "$a" = -L ] || b+=("$a"); done; command ln "${b[@]}"; }
  vr_init "$TMP/xln6" 2> "$TMP/xln6.err"; [ $? -eq 2 ] && grep -q 'fd 기반 놓기) 동작 이상' "$TMP/xln6.err" && [ ! -e "$TMP/xln6/.vr_lock" ] && [ -z "$(ls -A "$TMP/xln6" | grep 'vr\.plat')" ] ); rc=$?
[ $rc -eq 0 ] && ok 'ln 확인: -L 을 무시하는 ln(/proc/self/fd 를 따라가지 않음) → 기능 확인 실패로 vr_init 2·사유, 잠금·확인용 폴더 남지 않음' || bad "ln -L 무시 (rc=$rc)"
# ── a8e3c0f ChatGPT 재검수 A·B: 반환 0 직전 최종 확인(vr__link_place)·놓은 뒤 원본 교체(vr__mv_excl)와 호출자 판정(합성 주입) ──────
# 33-1. vr__link_place 최종 확인: 임시 이름 정리 뒤·반환 직전에 최종 경로를 바꿈(시험용 주입 지점 vr_hook_place_final)
#   p1_move  = 정리 경로(임시 이름이 우리 것 → 소유 확인 삭제) 뒤 최종 경로를 옆으로 옮김 → 3·최종 확인 진단, 옮겨진 이름이 우리 객체
#   p1_ext   = 옮기고 그 자리에 외부 파일의 하드 링크 → 3, 그 자리의 외부 파일은 건드리지 않음, 우리 객체는 외부와 다른 객체
#   p1_gone  = 최종 경로를 지움(우리 객체의 이름이 하나도 남지 않음) → 4
#   p1_extra = 최종 경로는 그대로 두고 우리 객체에 다른 이름을 붙임 → 3·"다른 이름이 생김"
#   p2_move  = 임시 이름이 놓은 직후 사라진 경로(정리 없이 링크 수 1 확인) 뒤 최종 경로를 옮김 → 3
#   none     = 주입 지점은 있으나 아무것도 하지 않음 → 0·링크 수 1(정상 경로가 깨지지 않음)
for kind in p1_move p1_ext p1_gone p1_extra p2_move none; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/fc1_$kind"; mkdir -p "$D"; X="$TMP/fc1_$kind.ext"; mkext "$X"; T="$D/.vr.new.TESTTESTTESTTEST"; F="$D/f.txt"
    vr__new_obj "$T" fd || exit 1; printf OURS >&$fd
    [ $kind = p2_move ] && vr_hook_place_after() { rm -f "$T"; }
    vr_hook_place_final() { case $kind in
        p1_move|p2_move) mv "$F" "$F.away" ;;
        p1_ext)   mv "$F" "$F.away"; ln "$X" "$F" ;;
        p1_gone)  rm -f "$F" ;;
        p1_extra) ln "$F" "$F.extra" ;;
      esac; xstate "$X" > "$D.xs"; }
    vr__link_place "$T" "$F" "$fd"; r=$?
    [ "$(xstate "$X")" = "$(cat "$D.xs")" ] && extsame "$X" && ! [ "/dev/fd/$fd" -ef "$X" ] || exit 2       # 외부 파일 보존, 우리 객체 ≠ 외부
    [ ! -e "$T" ] && [ ! -L "$T" ] || exit 3                                                                # 임시 이름은 남지 않음
    case $kind in
      none)     [ $r -eq 0 ] && [ "$F" -ef "/dev/fd/$fd" ] && [ "$(stat -L -c %h "/dev/fd/$fd")" = 1 ] || exit 4 ;;
      p1_gone)  [ $r -eq 4 ] && [ "$(stat -L -c %h "/dev/fd/$fd")" = 0 ] && [ ! -e "$F" ] || exit 4 ;;
      p1_extra) [ $r -eq 3 ] && [ "$F" -ef "/dev/fd/$fd" ] && [ "$F.extra" -ef "/dev/fd/$fd" ] && [[ "$VR__WV_LEFT" == "$F(최종 확인"*"다른 이름이 생김"* ]] || exit 4 ;;
      p1_ext)   [ $r -eq 3 ] && [ "$F" -ef "$X" ] && [ "$F.away" -ef "/dev/fd/$fd" ] && [ "$(cat "$F.away")" = OURS ] && [[ "$VR__WV_LEFT" == "$F(최종 확인"*"바뀜"* ]] || exit 4 ;;
      *)        [ $r -eq 3 ] && [ ! -e "$F" ] && [ "$F.away" -ef "/dev/fd/$fd" ] && [ "$(stat -L -c %h "/dev/fd/$fd")" = 1 ] && [[ "$VR__WV_LEFT" == "$F(최종 확인"*"바뀜"* ]] || exit 4 ;;
    esac ); rc=$?
  case $kind in none) want='0·링크 수 1(정상 경로 유지)' ;; p1_gone) want='4(우리 객체 남지 않음)' ;; p1_extra) want='3·"다른 이름이 생김" 진단' ;; p1_ext) want='3·최종 경로의 외부 파일은 건드리지 않음·우리 객체는 옮겨진 이름' ;; *) want='3·최종 확인 진단·우리 객체는 옮겨진 이름' ;; esac
  [ $rc -eq 0 ] && ok "A 최종 확인 vr__link_place($kind): 정리 뒤·반환 직전 최종 경로 변경 → $want, 외부 파일 inode·내용·링크 수 보존, 임시 이름 남지 않음" || bad "A 최종 확인 vr__link_place $kind (단계 $rc)"
done
# 33-2. 호출 경로: vr__write_verified(보고 파일) — 최종 확인 직전 최종 경로를 외부 하드 링크로 바꿈 → 3(실패), 그 자리의 외부 파일은 그대로,
#        vr__new_placed(로그·추가 기록) — 같은 주입 → 3(실패로 전파)
for via in report placed; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/fc2_$via"; mkdir -p "$D"; X="$TMP/fc2_$via.ext"; mkext "$X"; F="$D/r.txt"
    vr_hook_place_final() { mv "$F" "$D/kept"; ln "$X" "$F"; xstate "$X" > "$D.xs"; }
    if [ $via = report ]; then vr__write_verified "$F" $'ALL_DONE: x\n' $'NOT_DONE\n'; r=$?; else vr__new_placed "$F" nfd append; r=$?; fi
    [ "$(xstate "$X")" = "$(cat "$D.xs")" ] && extsame "$X" && [ "$F" -ef "$X" ] || exit 2
    [ $r -eq 3 ] && ! [ "$D/kept" -ef "$X" ] && [[ "$VR__WV_LEFT" == "$F(최종 확인"* ]] || exit 3
    [ -z "$(ls -A "$D" | grep -E '^\.vr\.(rep|new)\.')" ] || exit 4 ); rc=$?
  [ $rc -eq 0 ] && ok "A 최종 확인 호출 경로($via): 반환 직전 최종 경로를 외부 하드 링크로 교체 → 3(실패로 전파)·진단, 외부 파일 보존, 임시 이름 남지 않음" || bad "A 최종 확인 호출 경로 $via (단계 $rc)"
done
# 33-3. vr_finish 까지(run 상태 기록): a.status 최종 확인 직전 최종 경로를 외부 하드 링크로 교체 → 3, "a 상태 파일 놓기"·진단, 외부 파일 보존
s_fc3() { vr_hook_place_final() { case "$1" in */a.status) mv "$1" "$1.kept"; ln "$FC3X" "$1" ;; esac; }; vr_expect a; run a true; }
FC3X="$TMP/fc3.ext"; mkext "$FC3X"; scenario fc3 s_fc3; rc=$?
{ [ $rc -eq 3 ] && extsame "$FC3X" && [ "$(stat -c %h "$FC3X")" = 2 ] && grep -q '^기록 실패: a 상태 파일 놓기$' "$TMP/fc3/failed_steps.txt" \
  && grep -q '최종 확인' "$TMP/fc3/failed_steps.txt" && ! find "$TMP/fc3" -samefile "$FC3X" ! -path "$TMP/fc3/status/a.status" | grep -q .; } \
  && ok 'A 최종 확인 vr_finish: 상태 기록 반환 직전 최종 경로를 외부 하드 링크로 교체 → 3, "a 상태 파일 놓기"·최종 확인 진단, 외부 파일 보존(주입한 이름 말고 외부 하드 링크 없음)' \
  || bad "A 최종 확인 vr_finish (rc=$rc, $(tr '\n' ';' < "$TMP/fc3/failed_steps.txt" 2>/dev/null))"
# 33-4. vr__mv_excl: 놓은 뒤·원본 정리 전에 원본 이름을 바꿈(시험용 주입 지점 vr_hook_mv_excl_after) → 1, 목적은 삭제하지 않음(이 주입 조건에서는 목적이 우리 객체로 남아 있음을 inode·내용으로 확인 — 모든 반환 1 에서의 보장은 아님)
#   fd_hl / nofd_hl = 원본 이름을 지우고 외부 파일의 하드 링크를 넣음 → 원본 자리의 외부 파일은 건드리지 않음, 우리 객체의 이름은 목적 하나(링크 수 1)
#   fd_move         = 원본 이름을 다른 이름으로 옮김 → 우리 객체의 이름은 목적 + 옮겨진 이름(링크 수 2), 둘 다 건드리지 않음
for kind in fd_hl nofd_hl fd_move; do
  ( . "$HERE/lib/verify_run.sh"; D="$TMP/fc4_$kind"; mkdir -p "$D"; X="$TMP/fc4_$kind.ext"; mkext "$X"; S="$D/rec"; printf OURS > "$S"; ino=$(stat -c %i "$S")
    fd=""; case $kind in fd_*) exec {fd}<>"$S" ;; esac
    vr_hook_mv_excl_after() { case $kind in *_hl) rm -f "$S"; ln "$X" "$S" ;; fd_move) mv "$S" "$S.moved" ;; esac; xstate "$X" > "$D.xs"; }
    vr__mv_excl "$S" "$D/rec.done" $fd; r=$?
    [ $r -eq 1 ] && [ "$(xstate "$X")" = "$(cat "$D.xs")" ] && extsame "$X" && ! [ "$D/rec.done" -ef "$X" ] || exit 2
    [ -f "$D/rec.done" ] && [ ! -L "$D/rec.done" ] && [ "$(stat -c %i "$D/rec.done")" = "$ino" ] && [ "$(cat "$D/rec.done")" = OURS ] || exit 3     # 목적 = 처음의 우리 객체
    case $kind in
      *_hl)    [ "$S" -ef "$X" ] && [ "$(stat -c %h "$D/rec.done")" = 1 ] || exit 4 ;;
      fd_move) [ ! -e "$S" ] && [ "$S.moved" -ef "$D/rec.done" ] && [ "$(stat -c %h "$D/rec.done")" = 2 ] || exit 4 ;;
    esac ); rc=$?
  [ $rc -eq 0 ] && ok "B vr__mv_excl($kind): 놓은 뒤 원본 이름 변경 → 1, 목적 = 처음의 우리 객체(inode·내용·링크 수 확인, 지우지 않음), 원본 자리의 것은 건드리지 않음, 외부 파일 inode·내용·링크 수 보존" || bad "B vr__mv_excl $kind (단계 $rc)"
done
# 33-5. 호출자 판정(vr_finish 까지): 놓은 뒤 원본 이름을 외부 하드 링크로 바꿈 — 종료 기록(<ID>.tmp → <ID>) / 회수 표시(<ID> → <ID>.read) / 실행 표식 정리(<ID>.run → <ID>.done)
#   모두 3. 목적에 남은 우리 객체는 외부 파일이 아님(종료 기록은 부모가 읽어 "손상"으로 판정한 뒤 <ID>.read 로 회수 표시). 외부 파일 내용 보존, 출력 폴더에서 외부 하드 링크는 주입한 이름 하나뿐.
for kind in rec read done; do
  eval "s_fc5_$kind() { vr_hook_mv_excl_after() { case \"\$2\" in
      *.read) [ $kind = read ] || return 0 ;; *.done) [ $kind = done ] || return 0 ;; *) [ $kind = rec ] || return 0 ;; esac
      rm -f \"\$1\"; ln \"$TMP/fc5_$kind.ext\" \"\$1\"; printf '%s\n%s\n' \"\$1\" \"\$2\" > \"$TMP/fc5_$kind.names\"; }; vr_expect a; run a true; vr_bg B true; vr_wait; }"
  mkext "$TMP/fc5_$kind.ext"; scenario "fc5_$kind" "s_fc5_$kind"; rc=$?; X="$TMP/fc5_$kind.ext"
  src=$(sed -n 1p "$TMP/fc5_$kind.names" 2>/dev/null); dst=$(sed -n 2p "$TMP/fc5_$kind.names" 2>/dev/null)
  [ $kind = rec ] && [ -n "$dst" ] && dst="$dst.read"      # 종료 기록은 부모가 읽고(C 불일치 → 손상) 회수 표시로 <ID>.read 가 됨 — 그것이 놓인 우리 객체
  case $kind in rec) need='기록 실패: bg:B 종료 기록 쓰기' ;; read) need='기록 실패: bg:B 회수 표시' ;; done) need='기록 실패: bg:B 실행 표식 정리' ;; esac
  if [ $rc -eq 3 ] && grep -qxF "$need" "$TMP/fc5_$kind/failed_steps.txt" && extsame "$X" && [ -n "$src" ] && [ "$src" -ef "$X" ] && [ -f "$dst" ] && ! [ "$dst" -ef "$X" ] \
     && [ "$(find "$TMP/fc5_$kind" -samefile "$X" | wc -l)" = 1 ]; then
    ok "B 호출자 판정($kind): 놓은 뒤 원본 이름을 외부 하드 링크로 교체 → vr_finish 3·\"$need\", 목적에 남은 것은 우리 객체(외부 아님), 외부 파일 보존 — 실패 목록: $(sed -E 's/[0-9a-f]{12}_[0-9]+_[0-9]+/<ID>/g' "$TMP/fc5_$kind/failed_steps.txt" | sort | tr '\n' ';')"
  else bad "B 호출자 판정 $kind (rc=$rc, src=$src, dst=$dst, $(tr '\n' ';' < "$TMP/fc5_$kind/failed_steps.txt" 2>/dev/null))"; fi
done
# 33-6. 기능 확인 → vr_init 반환: fd 기반 놓기의 각 하위 확인이 실패하면 2·사유(가짜 ln 으로 하위 확인 하나씩 깨뜨림), 잠금·확인용 폴더 남지 않음
#   symlink = /proc/self/fd 대상이 아니라 경로를 따라가는 ln(-L 무시·경로 기준) — 32-6 과 다른 방식: 원래 이름(n)을 해석해 링크
#   exists  = 목적이 있어도 성공을 돌려주는 ln(-L 일 때만)
#   zero    = 링크 수 0 인 fd 도 성공으로 보고하고 목적에 빈 파일을 만드는 ln(-L 일 때만)
for kind in symlink exists zero; do
  ( . "$HERE/lib/verify_run.sh"
    ln() { local a L="" b=(); for a in "$@"; do if [ "$a" = -L ]; then L=1; else b+=("$a"); fi; done
      if [ -z "$L" ]; then command ln "$@"; return; fi
      local dst=${b[-1]} src=${b[-2]}
      case $kind in
        symlink) [ -e "$dst" ] && return 1; command ln -T -- "$(dirname "$dst")/n" "$dst" 2>/dev/null || command ln "$@" ;;
        exists)  [ -e "$dst" ] && return 0; command ln "$@" ;;
        zero)    command ln "$@" 2>/dev/null && return 0; [ -e "$dst" ] || : > "$dst"; return 0 ;;
      esac; }
    vr_init "$TMP/fc6_$kind" 2> "$TMP/fc6_$kind.err"; r=$?
    [ $r -eq 2 ] && [ "${VR__INIT_OK:-0}" != 1 ] && grep -q 'fd 기반 놓기) 동작 이상' "$TMP/fc6_$kind.err" && [ ! -e "$TMP/fc6_$kind/.vr_lock" ] && [ -z "$(ls -A "$TMP/fc6_$kind" | grep 'vr\.plat')" ] || exit 1
    vr_finish > /dev/null 2>&1; [ $? -eq 3 ] || exit 2 ); rc=$?
  [ $rc -eq 0 ] && ok "C 기능 확인($kind): fd 기반 놓기 하위 확인 실패 → vr_init 2·사유(성공 표시 없음), 잠금·확인용 폴더 남지 않음, 이후 vr_finish 3(보고 파일 쓰지 않음)" || bad "C 기능 확인 $kind (단계 $rc, $(tr '\n' ' ' < "$TMP/fc6_$kind.err" 2>/dev/null))"
done
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
# [기대값 변경 — bed4eb4 반려 P2: 시험이 새로 만든 step_status.txt(우리 것이 아님)를 대체하지 않으므로 기록 실패가 더해져 1 → 3. 판정 "b exit=5" 는 그대로]
scenario notrust s_notrust; check 'vr_finish 는 기존 보고 파일을 믿지 않음: 바꿔 두어도 상태 기록으로 "exit=5" 판정, 남이 만든 step_status.txt 는 대체하지 않음(3)' 3 $? "b exit=5${NL}기록 실패: step_status.txt" "$TMP/notrust"
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
