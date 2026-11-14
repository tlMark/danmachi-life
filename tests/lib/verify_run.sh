# F1D4A — 검증 스크립트 공통 부품(시험 전용). tests/p1_verify.sh 가 source 해서 쓴다. 게임 코드·F1 기준 파일을 바꾸지 않는다.
# 목적: 항목별 종료 상태를 모으고, 종료 상태를 남기지 못한 항목·비정상 종료한 백그라운드 작업·기록 실패를 모두 실패로 잡는다.
# Bash 4.4 이상 전용(연관 배열, $BASHPID, declare -F 사용). sh 로 실행하지 않는다.
#
#   vr_init <출력 폴더>          로그 폴더·상태 폴더·실행 토큰을 준비한다
#   vr_expect <이름>...          이번 실행에서 반드시 끝나야 하는 항목을 등록한다(실행 전에 전부 등록. 백그라운드 작업 시작 전)
#   run <이름> <명령...>         명령을 실행한다. 출력은 logs/<이름>.log, 종료 상태는 status/<이름>.status 에 따로 남긴다
#   vr_bg <표시 이름> <명령...>  명령(보통 run 을 부르는 함수)을 백그라운드 하위 셸에서 실행하고 PID 를 기억한다
#   vr_wait                      vr_bg 로 시작한 작업을 PID 별로 기다려 종료 상태를 수집한다(하나라도 0 이 아니면 실패로 기억)
#   vr_status_code <이름>        검증된 종료 코드를 출력한다(상태 기록이 없거나 손상이면 실패)
#   vr_finish                    최종 판정. 0 = 전부 성공, 1 = 검증 실패, 3 = 판정에 필요한 기록(I/O) 실패
#
# 설계 원칙
#   1. 명령 출력(logs/)은 판정에 쓰지 않는다. 명령이 "exit=0" 같은 글자를 출력해도, 자식 프로세스가 뒤늦게 로그에 써도 판정과 무관하다.
#   2. 종료 상태는 래퍼(run)만 쓰는 전용 파일에 있다. 형식은 정확히 한 줄: "v1 <태그> <이름> <종료 코드>".
#      <태그> = sha256(실행 토큰 ":" 이름). 실행 토큰은 내보내지 않는 셸 변수라 명령이 알 수 없어 상태 기록을 흉내 낼 수 없다.
#   3. 상태 기록은 원자적이다: 임시 파일에 다 쓴 뒤 mv(rename)로 한 번에 놓는다. 쓰는 도중이나 직전에 래퍼가 죽으면 상태 파일이 없다.
#   4. 같은 이름의 중복 실행은 mkdir(원자적)로 만든 선점 표식(status/<이름>.claim)으로 막는다.
#   5. **판정은 메모리에서 한다.** 등록 목록·실행 중 위반·기록 실패·백그라운드 작업의 종료 상태를 셸 변수로 갖고,
#      vr_finish 가 등록한 모든 항목의 상태 기록을 다시 읽어 실패 목록을 메모리에서 만든다.
#      failed_steps.txt · step_status.txt · 99_done.log 는 **보고용 출력**이다. 그 파일의 줄 수로 성공을 정하지 않는다.
#   6. **기록 실패는 따로 추적한다(VR_IOERR).** 판정에 필요한 파일 쓰기·읽기·정렬이 하나라도 실패하면 결과는 성공이 될 수 없다(종료 코드 3).
#      성공(0)은 실패 목록이 비어 있고, 기록 실패가 없고, 99_done.log 에 ALL_DONE 을 쓰고 다시 읽어 같음을 확인했을 때만이다.
#   7. 백그라운드 하위 셸의 메모리(위반·기록 실패)는 부모가 볼 수 없으므로, 하위 셸은 위반·기록 실패가 있으면 종료 코드 2 로 끝난다.
#      부모는 vr_wait 로 PID 마다 종료 상태를 모으며, 0 이 아니면(위반, 기록 실패, 강제 종료 137 등) 실패로 기억한다.
#      그래서 _violations.txt 기록이 유실돼도 위반이 판정에서 빠지지 않는다.
#
# 실패로 보는 경우(문구는 failed_steps.txt 에 그대로 적힌다)
#   "<이름> exit=N"                             종료 코드가 0 이 아님(신호로 죽은 명령은 128 + 신호 번호)
#   "<이름> 시작되지 않음"                      선점 표식이 없음(호출이 빠졌거나, 앞 항목에서 하위 셸이 죽음)
#   "<이름> 시작했으나 상태 기록 없음"          선점 표식은 있는데 status 가 없음(실행 도중 또는 기록 직전에 래퍼가 죽음)
#   "<이름> 상태 기록 손상"                     status 의 형식·태그·이름·코드가 맞지 않음(위조·잘림 포함)
#   "<이름> 미완료 상태 기록"                   쓰다 만 임시 파일이 남아 있음
#   "<이름> 로그 없음"                          상태는 있는데 로그 파일이 없음
#   "<이름> 등록되지 않은 항목" / "<이름> 중복 실행 시도" / "<이름> 중복 등록" / "<이름> 등록되지 않은 상태 기록" / "<이름> 등록되지 않은 로그"
#   "bg:<표시 이름> exit=N"                     백그라운드 작업이 0 이 아닌 상태로 끝남(위반·기록 실패 2, 강제 종료 137 등)
#   "등록된 항목 없음"                          vr_expect 로 등록한 항목이 0개
#   "기록 실패: <대상>"                         판정에 필요한 I/O 가 실패함(이 경우 종료 코드는 3)

VR_OUT=""; VR_L=""; VR_ST=""; VR_TOKEN=""
VR_FAILS=""; VR_EXPECTED=""; VR_NOTES=""; VR_STEPS=""; VR_DONE=""
VR_EXP=(); declare -A VR_EXPN=()
VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=()
VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=()

vr_init() {
    VR_OUT=$1
    VR_L="$VR_OUT/logs"; VR_ST="$VR_OUT/status"
    VR_FAILS="$VR_OUT/failed_steps.txt"; VR_EXPECTED="$VR_OUT/expected_steps.txt"; VR_STEPS="$VR_OUT/step_status.txt"
    VR_NOTES="$VR_ST/_violations.txt"; VR_DONE="$VR_L/99_done.log"
    VR_EXP=(); VR_EXPN=(); VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=(); VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=()
    mkdir -p "$VR_L" "$VR_ST" || return 2
    : > "$VR_FAILS" || return 2
    : > "$VR_EXPECTED" || return 2
    : > "$VR_NOTES" || return 2
    VR_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n') || return 2
    [ "${#VR_TOKEN}" -eq 48 ] || return 2
}

vr__ioerr() { VR_IOERR=1; VR_RUN_ERRS+=("기록 실패: $1"); }
# 보고 파일을 쓰고 확인한다: 쓰기 성공, 일반 파일, 다시 읽은 내용이 쓴 내용과 같음. 하나라도 아니면 1.
vr__write_verified() {
    local f=$1 content=$2 back
    printf '%s' "$content" > "$f" 2>/dev/null || return 1
    [ -f "$f" ] || return 1
    # cat 의 종료 코드를 따로 확인한다: 읽기에 실패하면 printf x 를 실행하지 않으므로 명령 치환 전체가 실패한다
    # (빈 파일에서 읽기 실패가 "빈 내용"으로 오인되지 않게). 읽기에 성공한 뒤에만 내용을 비교한다.
    back=$(cat "$f" 2>/dev/null && printf x) || return 1
    [ "${back%x}" = "$content" ] || return 1
}
vr__violation() {   # 위반은 메모리에 먼저 기억하고, 파일 기록은 보조다. 파일 기록이 실패하면 기록 실패로도 기억한다
    VR_VIOLATED=1; VR_RUN_ERRS+=("$1")
    printf '%s\n' "$1" >> "$VR_NOTES" 2>/dev/null || vr__ioerr "_violations.txt"
}

vr_expect() {
    local n
    for n in "$@"; do
        VR_EXP+=("$n"); VR_EXPN[$n]=$(( ${VR_EXPN[$n]:-0} + 1 ))
        printf '%s\n' "$n" >> "$VR_EXPECTED" 2>/dev/null || vr__ioerr "expected_steps.txt"
    done
}

vr_tag() { printf '%s' "$VR_TOKEN:$1" | sha256sum | cut -d' ' -f1; }

run() {
    local name=$1; shift
    if [ -z "${VR_EXPN[$name]+x}" ]; then vr__violation "$name 등록되지 않은 항목"; return 2; fi
    # 선점: mkdir 는 원자적이라 같은 이름을 동시에 불러도 한쪽만 성공한다
    if ! mkdir "$VR_ST/$name.claim" 2>/dev/null; then vr__violation "$name 중복 실행 시도"; return 2; fi
    "$@" > "$VR_L/$name.log" 2>&1; local code=$?
    # 여기까지 왔다는 것은 래퍼가 명령의 종료를 실제로 확인했다는 뜻이다. 그때에만 상태를 기록한다.
    # 로그 끝의 "exit=N" 줄은 사람이 읽기 위한 표시이며 판정에 쓰지 않는다(이전 출력 형식과 F1 기록 로그 비교의 호환을 위해 유지).
    echo "exit=$code" >> "$VR_L/$name.log" 2>/dev/null || vr__ioerr "$name.log 표시 줄"
    declare -F vr_hook_before_status > /dev/null && vr_hook_before_status "$name"     # 시험용 주입 지점(평소에는 정의되지 않음)
    local tag tmp="$VR_ST/$name.status.tmp.$BASHPID"
    tag=$(vr_tag "$name") && [ ${#tag} -eq 64 ] || { vr__ioerr "$name 상태 태그 계산"; return 2; }
    printf 'v1 %s %s %s\n' "$tag" "$name" "$code" > "$tmp" 2>/dev/null || { vr__ioerr "$name 상태 임시 파일"; return 2; }
    declare -F vr_hook_before_commit > /dev/null && vr_hook_before_commit "$name"     # 시험용 주입 지점
    mv -f "$tmp" "$VR_ST/$name.status" 2>/dev/null || { vr__ioerr "$name 상태 파일 놓기"; return 2; }   # rename: 한 번에 놓인다
    return $code
}

# 백그라운드 작업. 하위 셸의 종료 코드: 위반·기록 실패가 있었으면 2(부모는 하위 셸의 메모리를 볼 수 없으므로),
# 그 밖에는 작업 함수의 반환 코드를 그대로 전달한다(0 이 아니면 부모가 "bg:<이름> exit=N" 으로 실패 처리). 모두 정상일 때만 0.
# 작업 안의 run 이 항목 실패를 상태 기록으로 남기고 작업도 0 이 아닌 코드로 끝나면, 항목 실패와 bg 실패가 함께 기록된다(서로 다른 사유).
vr_bg() {
    local label=$1; shift
    ( VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=()
      "$@"; vr__task_rc=$?
      if [ "$VR_VIOLATED" -ne 0 ] || [ "$VR_IOERR" -ne 0 ]; then exit 2; fi
      exit "$vr__task_rc" ) &
    VR_BG_PIDS+=("$!"); VR_BG_LABELS+=("$label")
}
vr_wait() {
    local i rc
    for i in "${!VR_BG_PIDS[@]}"; do
        wait "${VR_BG_PIDS[$i]}"; rc=$?
        [ "$rc" -eq 0 ] || VR_BG_FAILS+=("bg:${VR_BG_LABELS[$i]} exit=$rc")
    done
    VR_BG_PIDS=(); VR_BG_LABELS=()
}

# 상태 기록을 검증해 종료 코드를 출력한다. 반환: 0 = 유효(코드를 출력), 1 = 없음, 2 = 손상 또는 읽기 실패
vr_status_code() {
    local name=$1 f="$VR_ST/$1.status" line tag code
    [ -f "$f" ] || return 1
    line=$(cat "$f" 2>/dev/null) || return 2
    [ -n "$line" ] || return 2
    case "$line" in *$'\n'*) return 2 ;; esac
    tag=$(vr_tag "$name") || return 2
    code=${line##* }
    [[ "$code" =~ ^(0|[1-9][0-9]{0,2})$ ]] || return 2
    [ "$code" -le 255 ] || return 2
    [ "$line" = "v1 $tag $name $code" ] || return 2
    printf '%s\n' "$code"
}

vr_finish() {
    vr_wait                                    # 남은 백그라운드 작업이 있으면 여기서 수집한다
    local -a fails=() ioerrs=()
    local e name code rc base f l notes steps=""
    local total=${#VR_EXP[@]}
    # (1) 실행 중 메모리에 기억한 위반·기록 실패, 백그라운드 작업 실패
    for e in "${VR_RUN_ERRS[@]}"; do case "$e" in "기록 실패: "*) ioerrs+=("$e") ;; *) fails+=("$e") ;; esac; done
    fails+=("${VR_BG_FAILS[@]}")
    # (2) 다른 하위 셸이 남긴 위반 기록(보조. 유실되어도 그 하위 셸의 종료 코드로 이미 실패가 잡힌다)
    if [ -f "$VR_NOTES" ]; then
        if notes=$(cat "$VR_NOTES" 2>/dev/null); then
            while IFS= read -r l; do [ -n "$l" ] && fails+=("$l"); done <<< "$notes"
        else ioerrs+=("기록 실패: _violations.txt 읽기"); fi
    fi
    # (3) 등록한 모든 항목의 상태 기록을 다시 읽어 판정
    local -A seen=()
    [ "$total" -gt 0 ] || fails+=("등록된 항목 없음")
    for name in "${VR_EXP[@]}"; do
        [ -n "${seen[$name]+x}" ] && continue; seen[$name]=1
        [ "${VR_EXPN[$name]}" -eq 1 ] || fails+=("$name 중복 등록")
        compgen -G "$VR_ST/$name.status.tmp.*" > /dev/null && fails+=("$name 미완료 상태 기록")
        code=$(vr_status_code "$name"); rc=$?
        if [ "$rc" -eq 1 ]; then
            if [ -d "$VR_ST/$name.claim" ]; then fails+=("$name 시작했으나 상태 기록 없음"); else fails+=("$name 시작되지 않음"); fi
            steps+="$name -"$'\n'; continue
        fi
        if [ "$rc" -ne 0 ]; then fails+=("$name 상태 기록 손상"); steps+="$name ?"$'\n'; continue; fi
        steps+="$name $code"$'\n'
        [ -d "$VR_ST/$name.claim" ] || fails+=("$name 상태 기록 손상")       # 선점 없이 상태만 있음
        [ -f "$VR_L/$name.log" ] || fails+=("$name 로그 없음")
        [ "$code" -eq 0 ] || fails+=("$name exit=$code")
    done
    for f in "$VR_ST"/*.status "$VR_ST"/*.claim "$VR_ST"/*.status.tmp.*; do
        [ -e "$f" ] || continue
        base=$(basename "$f"); base=${base%%.status*}; base=${base%.claim}
        [ -n "${VR_EXPN[$base]+x}" ] || fails+=("$base 등록되지 않은 상태 기록")
    done
    for f in "$VR_L"/*.log; do
        [ -e "$f" ] || continue
        base=$(basename "$f" .log)
        [ "$f" = "$VR_DONE" ] && continue
        [ -n "${VR_EXPN[$base]+x}" ] || fails+=("$base 등록되지 않은 로그")
    done
    # (4) 메모리에서 중복을 없앤 실패 목록(판정은 이 목록과 ioerrs 로 한다)
    local -A uniq=(); local -a list=()
    for e in "${fails[@]}"; do [ -n "$e" ] || continue; [ -n "${uniq[$e]+x}" ] && continue; uniq[$e]=1; list+=("$e"); done
    # (5) 보고 파일 쓰기. 쓴 뒤 일반 파일인지·내용이 같은지 다시 읽어 확인한다(0바이트 쓰기는 장치가 가득 차도 실패하지 않으므로).
    vr__write_verified "$VR_STEPS" "$steps" || ioerrs+=("기록 실패: step_status.txt")
    local sorted=""; local -a sorted_list=()
    if [ ${#list[@]} -gt 0 ]; then
        if sorted=$(set -o pipefail; printf '%s\n' "${list[@]}" | sort -u); then
            mapfile -t sorted_list <<< "$sorted"
            # 정렬 결과는 원래 목록과 같은 집합이어야 한다. list 는 (4)에서 중복을 없앴으므로, 다음 네 조건이 모두 맞으면 집합이 같다:
            # 원소 수가 같음, 결과에 빈 줄·중복이 없음, 결과의 모든 원소가 원래 목록에 있음(추가 없음), 원래 목록의 모든 원소가 결과에 있음(누락 없음).
            local okset=1; local -A inl=() ins=()
            for e in "${list[@]}"; do inl[$e]=1; done
            [ "${#sorted_list[@]}" -eq "${#list[@]}" ] || okset=0
            for e in "${sorted_list[@]}"; do
                [ -n "$e" ] || { okset=0; continue; }
                [ -n "${ins[$e]+x}" ] && okset=0          # 중복 출력
                ins[$e]=1
                [ -n "${inl[$e]+x}" ] || okset=0          # 추가 항목
            done
            for e in "${list[@]}"; do [ -n "${ins[$e]+x}" ] || okset=0; done   # 누락 항목
            [ $okset -eq 1 ] || { ioerrs+=("기록 실패: sort 결과 불일치"); sorted_list=("${list[@]}"); }
        else ioerrs+=("기록 실패: sort"); sorted_list=("${list[@]}"); fi
    fi
    local body=""
    [ ${#sorted_list[@]} -gt 0 ] && body=$(printf '%s\n' "${sorted_list[@]}")$'\n'
    [ ${#ioerrs[@]} -gt 0 ] && body+=$(printf '%s\n' "${ioerrs[@]}")$'\n'
    vr__write_verified "$VR_FAILS" "$body" || ioerrs+=("기록 실패: failed_steps.txt")
    local -a report=("${sorted_list[@]}" "${ioerrs[@]}")      # 99_done.log 와 표준 출력에는 failed_steps.txt 기록 실패까지 포함
    # (6) 최종 판정
    if [ ${#list[@]} -eq 0 ] && [ ${#ioerrs[@]} -eq 0 ]; then
        local msg="ALL_DONE: 모든 항목 종료 코드 0 ($total 개 항목)"
        if vr__write_verified "$VR_DONE" "$msg"$'\n'; then
            echo "$msg"; return 0
        fi
        echo "기록 실패: 99_done.log (ALL_DONE 을 기록하거나 확인하지 못함 — 성공으로 판정하지 않음)" >&2
        return 3
    fi
    local head="FAILED_STEPS: ${#list[@]} (등록 항목 $total 개, 기록 실패 ${#ioerrs[@]} 건)"
    vr__write_verified "$VR_DONE" "$head"$'\n'"$(printf '%s\n' "${report[@]}")"$'\n' || { ioerrs+=("기록 실패: 99_done.log"); report+=("기록 실패: 99_done.log"); }
    echo "$head"; printf '%s\n' "${report[@]}"
    [ ${#ioerrs[@]} -eq 0 ] && return 1
    return 3
}
