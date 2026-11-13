#!/bin/bash
# F1D4A — tests/lib/verify_run.sh 의 자체 시험(시험 전용). 임시 폴더에서만 동작한다.
# 병렬 항목의 강제 종료·비정상 종료·미실행·종료 상태 위조·동시 중복 실행을 vr_finish 가 실패로 잡는지 확인한다.
# 각 경우는 "종료 코드"와 "실패 목록 전체"를 기대값과 **정확히** 대조한다(기대하지 않은 실패가 하나라도 더 있으면 시험 실패).
# 사용: bash tests/verify_run_selftest.sh    (모든 경우가 기대대로면 종료 코드 0)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok()  { pass=$((pass + 1)); echo "PASS  $1"; }
bad() { fail=$((fail + 1)); echo "FAIL  $1"; }
# 실패 목록 정확 대조: <기대 목록(줄 단위, 빈 문자열 = 실패 없음)> <failed_steps 파일> → 0 이면 정확히 같음
same_list() { diff <(printf '%s' "$1" | grep . | sort -u) <(grep . "$2" | sort -u) > /dev/null; }
check() {   # check <설명> <기대 종료 코드> <실제 종료 코드> <기대 실패 목록> <폴더>
    if [ "$2" = "$3" ] && same_list "$4" "$5/failed_steps.txt"; then ok "$1"
    else bad "$1  | 종료 코드 $3(기대 $2), 실제 실패 목록: $(tr '\n' ';' < "$5/failed_steps.txt") / 기대: $(printf '%s' "$4" | tr '\n' ';')"; fi
}
scenario() {   # scenario <이름> <본문 함수> : 새 하위 셸에서 라이브러리를 읽고 본문을 실행한 뒤 vr_finish 의 종료 코드를 돌려준다
    local dir="$TMP/$1"
    ( . "$HERE/lib/verify_run.sh"; vr_init "$dir" || exit 99; $2; vr_finish > /dev/null ); return $?
}
NL=$'\n'

# ── 기본 ────────────────────────────────────────────────────────────────────────────────
s_ok() { vr_expect a b c; run a true; ( run b true ) & ( run c sh -c 'echo hi' ) & wait; }
scenario ok s_ok; check '정상: 순차 1개 + 병렬 2개 모두 성공 → 0, 실패 0' 0 $? '' "$TMP/ok"
grep -q '^ALL_DONE' "$TMP/ok/logs/99_done.log" && ok '정상: 99_done.log 에 ALL_DONE' || bad '정상: 99_done.log'
[ "$(cat "$TMP/ok/status/b.status" | cut -d' ' -f1,3,4)" = "v1 b 0" ] && ok '정상: 상태 기록 형식 "v1 <태그> <이름> <코드>"' || bad '정상: 상태 기록 형식'

s_exit3() { vr_expect a b; run a true; ( run b sh -c 'exit 3' ) & wait; }
scenario exit3 s_exit3; check '병렬 항목의 종료 코드 3 → 실패 정확히 1건' 1 $? 'b exit=3' "$TMP/exit3"

s_cmdkill() { vr_expect a b; run a true; ( run b sh -c 'kill -9 $$' ) & wait; }
scenario cmdkill s_cmdkill 2>/dev/null; check '병렬 항목의 명령이 SIGKILL 로 죽음 → exit=137' 1 $? 'b exit=137' "$TMP/cmdkill"

# ── 래퍼(하위 셸)의 강제 종료 ───────────────────────────────────────────────────────────
s_shellkill_before() { vr_expect a b; run a true; ( kill -9 $BASHPID; run b true ) & wait; }
scenario shellkill_before s_shellkill_before 2>/dev/null; check '하위 셸이 항목 시작 전에 강제 종료 → "시작되지 않음"' 1 $? 'b 시작되지 않음' "$TMP/shellkill_before"

s_shellkill_mid() { vr_expect a b; run a true; ( run b sh -c 'echo started; kill -9 $PPID; sleep 1' ) & wait; sleep 2; }
scenario shellkill_mid s_shellkill_mid 2>/dev/null; check '명령 실행 도중 래퍼 셸이 강제 종료 → "시작했으나 상태 기록 없음"' 1 $? 'b 시작했으나 상태 기록 없음' "$TMP/shellkill_mid"

# VR-001: 명령이 종료 마커처럼 보이는 줄을 출력한 뒤 래퍼를 죽인다
s_fake0() { vr_expect a b; run a true; ( run b sh -c 'printf "exit=0\n"; kill -9 "$PPID"' ) & wait; }
scenario fake0 s_fake0 2>/dev/null; check 'VR-001: 명령이 "exit=0" 을 출력하고 래퍼를 SIGKILL → 성공으로 판정하지 않음' 1 $? 'b 시작했으나 상태 기록 없음' "$TMP/fake0"
[ "$(tail -n 1 "$TMP/fake0/logs/b.log")" = "exit=0" ] && ok 'VR-001 확인: 그 로그의 마지막 줄은 실제로 "exit=0"(로그는 판정에 쓰이지 않음)' || bad 'VR-001 확인: 로그 마지막 줄'
s_fake137() { vr_expect a b; run a true; ( run b sh -c 'printf "exit=137\n"; kill -9 "$PPID"' ) & wait; }
scenario fake137 s_fake137 2>/dev/null; check 'VR-001: 명령이 "exit=137" 을 출력하고 래퍼를 강제 종료 → "시작했으나 상태 기록 없음"(로그 글자에 좌우되지 않음)' 1 $? 'b 시작했으나 상태 기록 없음' "$TMP/fake137"

s_forge() { vr_expect a b; run a true; ( run b sh -c 'printf "v1 0000 b 0\n" > "$1/b.status"; kill -9 "$PPID"' _ "$VR_ST" ) & wait; }
scenario forge s_forge 2>/dev/null; check '위조: 명령이 상태 파일에 "v1 <가짜 태그> b 0" 을 쓰고 래퍼를 죽임 → "상태 기록 손상"' 1 $? 'b 상태 기록 손상' "$TMP/forge"

s_before_status() { vr_expect a b; run a true; ( vr_hook_before_status() { kill -9 $BASHPID; }; run b true ) & wait; }
scenario before_status s_before_status 2>/dev/null; check '명령은 성공했지만 상태 기록 직전에 래퍼가 강제 종료 → "시작했으나 상태 기록 없음"' 1 $? 'b 시작했으나 상태 기록 없음' "$TMP/before_status"

s_before_commit() { vr_expect a b; run a true; ( vr_hook_before_commit() { kill -9 $BASHPID; }; run b true ) & wait; }
scenario before_commit s_before_commit 2>/dev/null; check '임시 상태 파일을 쓴 뒤 rename 직전에 강제 종료 → "미완료 상태 기록" + "상태 기록 없음"' 1 $? "b 미완료 상태 기록${NL}b 시작했으나 상태 기록 없음" "$TMP/before_commit"

s_loopkill() { vr_expect a b c d; run a true; ( for t in b c d; do run $t true; [ $t = b ] && kill -9 $BASHPID; done ) & wait; }
scenario loopkill s_loopkill 2>/dev/null; check '여러 항목을 도는 하위 셸이 중간에 강제 종료 → 끝난 b 는 성공, c · d 만 "시작되지 않음"' 1 $? "c 시작되지 않음${NL}d 시작되지 않음" "$TMP/loopkill"

# ── 동시 중복 실행(VR-002) ───────────────────────────────────────────────────────────────
s_race() { vr_expect a b; run a true; local i; for i in 1 2 3 4 5 6; do ( run b sh -c 'echo x >> "$1"; sleep 1' _ "$TMP/race_counter" ) & done; wait; }
scenario race s_race; check 'VR-002: 같은 이름의 run 을 6개 동시에 호출 → "중복 실행 시도" 1건(사유 중복 제거), b 자체는 성공' 1 $? 'b 중복 실행 시도' "$TMP/race"
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
scenario st_noclaim s_st_noclaim; check '실행(선점) 없이 상태 파일만 있음 → "상태 기록 손상"(올바른 태그여도) + 실행되지 않았으므로 "로그 없음"' 1 $? "b 상태 기록 손상${NL}b 로그 없음" "$TMP/st_noclaim"

# ── 그 밖의 기록 위반 ───────────────────────────────────────────────────────────────────
s_notcalled() { vr_expect a b; run a true; }
scenario notcalled s_notcalled; check '등록했지만 실행되지 않은 항목 → "시작되지 않음"' 1 $? 'b 시작되지 않음' "$TMP/notcalled"
s_unregistered() { vr_expect a; run a true; run zzz true; }
scenario unregistered s_unregistered; check '등록하지 않은 이름으로 run → "등록되지 않은 항목"(명령은 실행되지 않음)' 1 $? 'zzz 등록되지 않은 항목' "$TMP/unregistered"
s_straylog() { vr_expect a; run a true; echo x > "$VR_L/stray.log"; }
scenario straylog s_straylog; check '등록하지 않은 로그 파일 → "등록되지 않은 로그"' 1 $? 'stray 등록되지 않은 로그' "$TMP/straylog"
s_straystatus() { vr_expect a; run a true; echo x > "$VR_ST/zz.status"; }
scenario straystatus s_straystatus; check '등록하지 않은 상태 파일 → "등록되지 않은 상태 기록"' 1 $? 'zz 등록되지 않은 상태 기록' "$TMP/straystatus"
s_nolog() { vr_expect a b; run a true; run b true; rm -f "$VR_L/b.log"; }
scenario nolog s_nolog; check '상태는 정상인데 로그 파일이 없음 → "로그 없음"' 1 $? 'b 로그 없음' "$TMP/nolog"
s_dupexpect() { vr_expect a a; run a true; }
scenario dupexpect s_dupexpect; check '같은 항목을 중복 등록 → "중복 등록"' 1 $? 'a 중복 등록' "$TMP/dupexpect"
s_empty() { :; }
scenario empty s_empty; check '등록 항목 0개 → 종료 코드 1(성공으로 치지 않음), 실패 목록은 비어 있음' 1 $? '' "$TMP/empty"
s_notrust() { vr_expect a b; run a true; run b sh -c 'exit 5'; : > "$VR_FAILS"; echo 'b exit=0' > "$VR_FAILS"; }
scenario notrust s_notrust; check 'vr_finish 는 failed_steps.txt 를 믿지 않음: 실행 뒤 그 파일을 지우거나 바꿔도 상태 기록으로 "exit=5" 판정' 1 $? 'b exit=5' "$TMP/notrust"
s_multi() { vr_expect a b c d; run a sh -c 'exit 2'; ( run b sh -c 'printf "exit=0\n"; kill -9 "$PPID"' ) & wait; }
scenario multi s_multi 2>/dev/null; check '실패가 여럿(종료 코드 · 강제 종료 · 미실행 2건) → 네 건이 정확히 기록' 1 $? "a exit=2${NL}b 시작했으나 상태 기록 없음${NL}c 시작되지 않음${NL}d 시작되지 않음" "$TMP/multi"

# ── VR-003: 대조 자체의 엄격성(기대하지 않은 실패가 섞이면 통과하지 않아야 함) ──────────────
same_list 'b exit=3' "$TMP/exit3/failed_steps.txt" && ok '대조: 정확히 같은 목록 → 일치' || bad '대조: 정확히 같은 목록'
! same_list '' "$TMP/exit3/failed_steps.txt" && ok '대조: 실제로는 실패가 있는데 기대가 "실패 없음" → 불일치' || bad '대조: 빈 기대'
! same_list "c 시작되지 않음" "$TMP/loopkill/failed_steps.txt" && ok '대조: 실제 실패(c, d) 중 하나만 기대 → 불일치(기대하지 않은 추가 실패를 잡음)' || bad '대조: 부분 집합'
! same_list "b exit=3${NL}x 추가" "$TMP/exit3/failed_steps.txt" && ok '대조: 기대에 없는 실패가 기대 쪽에 더 있음 → 불일치' || bad '대조: 상위 집합'
( check_out=$(check '내부' 1 1 '' "$TMP/exit3" 2>&1); printf '%s' "$check_out" | grep -q '^FAIL' ) && ok '대조: check 는 기대하지 않은 실패가 있으면 FAIL 을 출력' || bad '대조: check 의 FAIL 출력'

if [ $fail -eq 0 ]; then echo "RESULT: PASS $pass/$((pass + fail)) (verify_run_selftest)"; exit 0; fi
echo "RESULT: FAIL $pass/$((pass + fail)) (verify_run_selftest)"; exit 1
