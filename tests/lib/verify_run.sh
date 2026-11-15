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

VR_OUT=""; VR_L=""; VR_ST=""; VR_TOKEN=""; VR_RUN_ID=""; VR_LIFE=""; VR_LIFE_W=""; VR_LDONE=""; VR_LDONE_R=""; VR_MSGS=""; VR_LIFE_RD=""; VR_MSGS_R=""; VR_LIFE_R=""; VR__READER_STATE=""; VR__INIT_ERR=""
VR_FAILS=""; VR_EXPECTED=""; VR_NOTES=""; VR_STEPS=""; VR_DONE=""
VR_EXP=(); declare -A VR_EXPN=()
VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=()
VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=(); VR_BG_SEQ=0; VR_BGREC=""; VR_BG_PATH=""

# 생명주기 FIFO 상태 정리: 열린 fd 를 닫고, 이 라이브러리가 만든 FIFO·알림 파일을 지우고, 변수를 비운다(실패·재호출 공통).
# 지우는 것은 그 종류(FIFO 는 FIFO, 알림 파일은 링크가 아닌 일반 파일)일 때뿐이다.
vr__life_reset() {   # 읽기 프로세스는 생명주기 쓰기 fd 가 모두 닫히면 EOF 로 스스로 끝난다(남은 후손이 없을 때)
    local v
    for v in VR_LIFE_W VR_LDONE_R VR_MSGS_R VR_LIFE_R vr__dtmp vr__r_dw vr__r_lr vr__r_mw; do
        if [ -n "${!v:-}" ]; then eval "exec {$v}>&-" 2>/dev/null; fi
    done
    if [ -n "${VR_LIFE:-}" ] && [ -p "$VR_LIFE" ]; then rm -f "$VR_LIFE" 2>/dev/null; fi
    if [ -n "${VR_LDONE:-}" ] && [ -p "$VR_LDONE" ]; then rm -f "$VR_LDONE" 2>/dev/null; fi
    if [ -n "${VR_MSGS:-}" ] && [ -f "$VR_MSGS" ] && [ ! -L "$VR_MSGS" ]; then rm -f "$VR_MSGS" 2>/dev/null; fi
    VR_LIFE_W=""; VR_LIFE=""; VR_LDONE_R=""; VR_LDONE=""; VR_MSGS=""; VR_LIFE_RD=""; VR_MSGS_R=""; VR_LIFE_R=""
    vr__dtmp=""; vr__r_dw=""; vr__r_lr=""; vr__r_mw=""
}
# 알림 읽기 프로세스(vr_init 이 이중 fork 로 띄움 — 최상위의 직접 자식이 아니므로 인자 없는 wait 에 걸리지 않는다).
# 경로를 다시 열지 않는다: vr_init 이 미리 연 fd 세 개만 쓴다 — vr__r_lr(생명주기 FIFO 읽기), vr__r_dw(완료 FIFO 쓰기),
# vr__r_mw(알림 파일 추가 쓰기). 그래서 열 때와 쓸 때 사이에 경로가 바뀌어도 대상이 바뀌지 않는다.
# 실행 내내 생명주기 FIFO 를 읽어 알림 줄을 알림 파일에 옮긴다 → 알림이 아무리 많아도 FIFO 버퍼가 차서 쓰는 쪽이 막히지 않는다.
# 생명주기 쓰기 fd 는 닫으므로, 최상위와 모든 후손이 쓰기 fd 를 닫으면(= 모두 끝나면) EOF 를 받는다.
# 완료 FIFO 상태 전이(쓰기 끝은 이 프로세스만 가진다): 시작 → "S <PID>" 한 줄 → (EOF 까지 알림 옮김) → "R 0" 또는 "R 1" 한 줄 → 끝.
#   R 1 = 알림을 파일에 옮기지 못한 적 있음. 최상위는 시작 때 정확히 "S <PID>", 끝에 정확히 "R 0"/"R 1" 만 받아들인다.
vr__life_reader() {
    local line failed=0 n=0
    exec {VR_LIFE_W}>&- < /dev/null > /dev/null 2>&1
    if [ -n "${VR_LDONE_R:-}" ]; then exec {VR_LDONE_R}<&-; fi        # 최상위의 완료 FIFO 읽기 끝은 갖지 않는다
    declare -F vr_hook_reader > /dev/null && vr_hook_reader start          # 시험용 주입 지점(평소에는 정의되지 않음)
    printf 'S %s\n' "$BASHPID" >&"$vr__r_dw" || exit 1
    declare -F vr_hook_reader > /dev/null && vr_hook_reader after_s
    while IFS= read -r -u "$vr__r_lr" line || [ -n "$line" ]; do     # -u: fd 를 0 번으로 잠시 복제하지 않고 바로 읽는다
        n=$((n + 1)); declare -F vr_hook_reader > /dev/null && vr_hook_reader line "$n"
        if vr__inject msgwrite || ! printf '%s\n' "$line" >&"$vr__r_mw"; then failed=1; fi
        line=""
    done
    declare -F vr_hook_reader > /dev/null && vr_hook_reader end
    printf 'R %s\n' "$failed" >&"$vr__r_dw"
}
# 소유 확인 삭제: vr__rm_owned <경로> <그 파일을 가리키는 fd>. 경로를 실행 ID 가 든 고유 이름으로 원자적으로 옮긴 뒤,
# 옮긴 대상이 그 fd 와 같은 파일(링크 아님)일 때만 지운다. 아니면(확인과 삭제 사이에 경로가 바뀜) 원래 자리로 되돌리고 1.
# 경로에 아무것도 없으면 2(이미 없어짐 — 호출부가 판단). fd 가 없으면 1(소유를 확인할 수 없으므로 지우지 않음).
vr__rm_owned() {
    local p=$1 fd=$2 q
    [ -n "$fd" ] || return 1
    if [ ! -e "$p" ] && [ ! -L "$p" ]; then return 2; fi
    q="$p.del.${VR_RUN_ID:-x}.$BASHPID"
    if [ -e "$q" ] || [ -L "$q" ]; then return 1; fi
    declare -F vr_hook_rm_owned > /dev/null && vr_hook_rm_owned "$p"      # 시험용 주입 지점(평소에는 정의되지 않음)
    mv -T -- "$p" "$q" 2>/dev/null || return 1
    if [ ! -L "$q" ] && [ "$q" -ef "/dev/fd/$fd" ]; then
        rm -f -- "$q" 2>/dev/null; if [ -e "$q" ] || [ -L "$q" ]; then return 1; fi; return 0
    fi
    if [ ! -e "$p" ] && [ ! -L "$p" ]; then mv -T -- "$q" "$p" 2>/dev/null; fi     # 남의 것: 되돌린다(그 사이 또 바뀌었으면 고유 이름에 남김)
    return 1
}
# 읽기 프로세스가 끝난 것을 확인한 뒤의 정리: 세 파일을 각자의 fd 로 소유 확인해 지우고, fd 를 모두 닫고, 변수를 비운다.
# 반환: 0 = 모두 정리, 1 = 남은 것(남의 것으로 바뀌었거나 지우지 못함)이 있음.
vr__life_cleanup_owned() {
    local bad="" lfd dfd mfd r
    # 알림 파일의 소유 판정은 우리가 만든 파일에 연 쓰기 fd(vr__r_mw)를 먼저 쓴다 — VR_MSGS_R 은 초기화 중 바뀐 경로를 열었을 수 있다
    lfd=${VR_LIFE_R:-${vr__r_lr:-}}; dfd=${VR_LDONE_R:-}; mfd=${vr__r_mw:-${VR_MSGS_R:-}}
    if [ -n "${VR_LIFE:-}" ]; then vr__rm_owned "$VR_LIFE" "$lfd"; r=$?; [ $r -eq 1 ] && bad=1; fi
    if [ -n "${VR_LDONE:-}" ]; then vr__rm_owned "$VR_LDONE" "$dfd"; r=$?; [ $r -eq 1 ] && bad=1; fi
    if [ -n "${VR_MSGS:-}" ]; then vr__rm_owned "$VR_MSGS" "$mfd"; r=$?; [ $r -eq 1 ] && bad=1; fi
    VR_LIFE=""; VR_LDONE=""; VR_MSGS=""          # 이미 소유 확인으로 처리함 — vr__life_reset 이 경로로 다시 지우지 않게
    vr__life_reset
    [ -z "$bad" ]
}
# 읽기 프로세스가 시작된 뒤 그 생명주기를 끝낸다(초기화 실패·재호출 공통).
#  1. 최상위의 생명주기 쓰기 끝과 완료 FIFO 쓰기 끝을 닫는다 → 후손이 없으면 읽기 프로세스가 EOF 를 받아 R 을 쓰고 끝난다.
#  2. 종료 확인: 완료 FIFO 의 쓰기 끝은 읽기 프로세스만 가지므로, 최상위의 완료 FIFO 읽기 fd 가 EOF = 그 프로세스 종료.
#     제한 시간 VR__READER_STOP_TIMEOUT(기본 10초). PID 로 판단하지 않는다.
#  3. 종료가 확인된 뒤에만 FIFO·알림 파일·fd 를 정리한다.
#  4. 확인하지 못하면 자원을 그대로 두고 VR__READER_STATE=stuck, VR__INIT_ERR 에 기록하고 1 — 다음 vr_init 은 종료가 확인될 때까지 실패한다.
vr__reader_stop() {
    local v
    for v in VR_LIFE_W vr__r_dw vr__dtmp; do if [ -n "${!v:-}" ]; then eval "exec {$v}>&-" 2>/dev/null; fi; eval "$v=''"; done
    if [ -n "${VR_LDONE_R:-}" ] && timeout "${VR__READER_STOP_TIMEOUT:-10}" cat <&"$VR_LDONE_R" > /dev/null 2>&1; then
        vr__life_cleanup_owned; VR__READER_STATE=""; return 0
    fi
    VR__READER_STATE=stuck; VR__INIT_ERR="알림 읽기 프로세스 종료 확인 실패: ${VR_OUT:-?}"
    printf 'vr_init: %s — 자원을 남겨 두며, 종료가 확인될 때까지 다시 초기화하지 않음\n' "$VR__INIT_ERR" >&2
    return 1
}
vr__inject() {   # 시험용 실패 주입(평소에는 정의되지 않음): vr_hook_fail <지점> 이 0 을 돌려주면 그 지점을 실패로 본다
    declare -F vr_hook_fail > /dev/null && vr_hook_fail "$1"
}
# 배타 이동: 목적 경로가 이미 있으면(무엇이든) 실패하고 아무것도 덮어쓰지 않는다. ln 은 목적 경로가 있으면 실패하는 원자적 생성.
# 옮긴 뒤 목적 경로가 일반 파일이고 원본이 없어야 성공.
vr__mv_excl() {
    local src=$1 dst=$2
    [ -f "$src" ] && [ ! -L "$src" ] || return 1
    if [ -e "$dst" ] || [ -L "$dst" ]; then return 1; fi
    ln -- "$src" "$dst" 2>/dev/null || return 1
    rm -f -- "$src" 2>/dev/null
    [ -f "$dst" ] && [ ! -L "$dst" ] && [ ! -e "$src" ] && [ ! -L "$src" ]
}
vr__init_fail() {   # 시험용 실패 주입(평소에는 정의되지 않음): vr_hook_init_fail <단계> 가 0 을 돌려주면 그 단계를 실패로 본다
    declare -F vr_hook_init_fail > /dev/null && vr_hook_init_fail "$1"
}
# 계약: vr_init 은 다시 호출할 수 있다. 호출할 때마다 이전 생명주기 상태(fd·FIFO)를 먼저 정리하고 새로 만든다.
# 실패하면(반환 2) 임시 fd·생명주기 fd·FIFO 파일·VR_LIFE·VR_LIFE_W 를 모두 정리한 상태로 돌아온다(이후 vr_finish 는
# "후손 추적 준비 안 됨"으로 실패). 이전에 실행한 vr_bg 작업이 남아 있는 상태에서의 재호출은 지원하지 않는다.
vr_init() {
    # 이전 초기화의 읽기 프로세스가 남아 있으면(running: 판정 없이 다시 부름, stuck: 이전에 종료를 확인하지 못함) 먼저 끝내고 확인한다.
    # 확인하지 못하면 새 초기화를 하지 않는다(이전 실행의 자원을 가진 프로세스가 남은 상태에서 성공하지 않음).
    if [ -n "${VR__READER_STATE:-}" ]; then vr__reader_stop || return 2; fi
    vr__life_reset
    VR_OUT=$1
    VR_L="$VR_OUT/logs"; VR_ST="$VR_OUT/status"
    VR_FAILS="$VR_OUT/failed_steps.txt"; VR_EXPECTED="$VR_OUT/expected_steps.txt"; VR_STEPS="$VR_OUT/step_status.txt"
    VR_NOTES="$VR_ST/_violations.txt"; VR_DONE="$VR_L/99_done.log"
    VR_EXP=(); VR_EXPN=(); VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=(); VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=(); VR_BG_SEQ=0; VR_BG_PATH=""
    VR_BGREC="$VR_OUT/bg"
    mkdir -p "$VR_L" "$VR_ST" "$VR_BGREC" || return 2
    : > "$VR_FAILS" || return 2
    : > "$VR_EXPECTED" || return 2
    : > "$VR_NOTES" || return 2
    VR_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n') || return 2
    [ "${#VR_TOKEN}" -eq 48 ] || return 2
    # 실행 ID: 작업 ID 에 넣는 비밀이 아닌 실행별 난수(토큰은 파일 이름에 넣지 않는다). 이전 실행의 bg 기록이 남은 출력 폴더는 받지 않는다.
    VR_RUN_ID=$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n') || return 2
    [[ "$VR_RUN_ID" =~ ^[0-9a-f]{12}$ ]] || return 2
    if [ -n "$(ls -A "$VR_BGREC" 2>/dev/null)" ] || [ ! -d "$VR_BGREC" ]; then return 2; fi
    # 후손 생명주기 추적: FIFO 를 읽기·쓰기로 열어 두면, 그 fd 는 이후 만들어지는 모든 하위 셸에 커널이 자동으로 상속한다.
    # vr_finish 는 자기 fd 를 닫고 EOF 를 기다린다 = 그 fd 를 가진 후손이 모두 끝났다(실행 표식을 쓰기 전에 부모가 죽어도 빠지지 않음).
    # run 으로 실행하는 명령에는 이 fd 를 닫고 넘긴다(검사 대상 명령이 남긴 프로세스 때문에 기다리지 않도록).
    VR_LIFE="$VR_OUT/.vr_life"; VR_LIFE_W=""
    # 그 자리에 이미 무엇이 있으면(이전 실행의 잔재·남의 파일) 지우지 않고 실패한다
    if [ -e "$VR_LIFE" ] || [ -L "$VR_LIFE" ]; then VR_LIFE=""; return 2; fi
    if ! mkfifo "$VR_LIFE" || vr__init_fail fifo; then vr__life_reset; return 2; fi
    # fd 할당. 목표: 이미 열린 fd 를 덮어쓰지 않으면서, 작업 코드가 번호를 직접 쓰는 fd(보통 3~10)와 겹치지 않는 높은 번호(200~249).
    #  (1) 먼저 bash 동적 할당({var})으로 연다 — 커널이 비어 있는 번호를 골라 주므로 기존 fd 를 덮어쓰지 않는다.
    #  (2) fd 목록(VR__FD_DIR, 기본 /dev/fd = 이 셸의 fd 표)이 열린 fd 를 실제로 보여 주는지, 방금 연 fd 와 0 으로 확인한다.
    #      보여 주지 못하는 환경이면 "비어 있음" 판단을 믿을 수 없으므로 실패(2)한다.
    #  (3) 200~249 중 목록에 없는 번호로 복제한다. fd 표는 이 프로세스 전용이고 bash 는 단일 스레드라, 확인과 복제 사이에
    #      다른 주체가 그 번호를 열 수 없다(이 사이에 이 셸이 실행하는 명령이 없다).
    #  (4) 복제한 번호가 FIFO 를 가리키는지 확인하고 임시 fd 를 닫는다.
    # 어느 단계든 실패하면 임시 fd 를 닫고 vr__life_reset(생명주기 fd·FIFO·변수 정리) 후 2.
    local tmpfd="" n d=${VR__FD_DIR:-/dev/fd}
    vr__init_cleanup() { if [ -n "$tmpfd" ]; then exec {tmpfd}>&- 2>/dev/null; fi; vr__life_reset; }
    if vr__init_fail open || ! exec {tmpfd}<>"$VR_LIFE"; then tmpfd=""; vr__init_cleanup; return 2; fi
    if vr__init_fail list || ! [ -e "$d/$tmpfd" ] || ! [ -e "$d/0" ] || ! [ "$VR_LIFE" -ef "$d/$tmpfd" ]; then vr__init_cleanup; return 2; fi
    if ! vr__init_fail range; then
        for n in {200..249}; do
            if ! [ -e "$d/$n" ] && ! [ -L "$d/$n" ]; then VR_LIFE_W=$n; break; fi
        done
    fi
    if [ -z "$VR_LIFE_W" ]; then vr__init_cleanup; return 2; fi
    if vr__init_fail dup || ! eval "exec $VR_LIFE_W>&$tmpfd" 2>/dev/null || ! [ "$VR_LIFE" -ef "$d/$VR_LIFE_W" ]; then
        vr__init_cleanup; return 2
    fi
    exec {tmpfd}>&-
    # 알림 읽기 프로세스 준비·시작·확인. fd 는 모두 여기서, 읽기 프로세스를 띄우기 전에 연다(읽기 프로세스는 물려받은 fd 만 쓴다).
    #  - 완료 FIFO: 읽기·쓰기(vr__dtmp, 막히지 않음)로 연 상태에서 쓰기 전용(vr__r_dw, 읽기 프로세스용)과 읽기 전용(VR_LDONE_R, 최상위)을
    #    열고 vr__dtmp 는 바로 닫는다. 읽기 프로세스를 띄운 직후 최상위의 vr__r_dw 를 닫으므로, 그 뒤 완료 FIFO 의 쓰기 끝은 읽기
    #    프로세스만 가진다 → VR_LDONE_R 의 EOF = 읽기 프로세스 종료(시작 전에 죽어도 시작 대기가 곧바로 EOF 로 끝남).
    #  - 생명주기 FIFO 읽기(vr__r_lr): 최상위가 쓰기 끝을 가지므로 막히지 않음. 성공하면 최상위가 VR_LIFE_R 로 계속 가진다.
    #  - 알림 파일: 그 자리에 아무것도 없을 때 noclobber 로 새로 만들고, 링크가 아닌 일반 파일인지 확인한 뒤 추가 쓰기(vr__r_mw)로 연다.
    # 읽기 프로세스를 띄운 뒤(VR__READER_STATE=started) 실패하면 vr__reader_stop 으로 종료를 확인하고 정리한다.
    VR_LDONE="$VR_OUT/.vr_done"; VR_MSGS="$VR_OUT/.vr_msgs"; vr__dtmp=""; vr__r_dw=""; vr__r_lr=""; vr__r_mw=""; VR_LDONE_R=""; VR_MSGS_R=""
    if [ -e "$VR_LDONE" ] || [ -L "$VR_LDONE" ] || [ -e "$VR_MSGS" ] || [ -L "$VR_MSGS" ]; then VR_LDONE=""; VR_MSGS=""; vr__life_reset; return 2; fi
    local hs=""
    if ! mkfifo "$VR_LDONE" || ! ( set -C; : > "$VR_MSGS" ) 2>/dev/null || [ ! -f "$VR_MSGS" ] || [ -L "$VR_MSGS" ] || vr__init_fail reader \
       || ! exec {vr__dtmp}<>"$VR_LDONE" || ! exec {vr__r_dw}>"$VR_LDONE" || ! exec {VR_LDONE_R}<"$VR_LDONE" \
       || ! exec {vr__r_lr}<"$VR_LIFE" || ! exec {vr__r_mw}>>"$VR_MSGS"; then vr__life_reset; return 2; fi
    exec {vr__dtmp}>&-; vr__dtmp=""
    ( ( vr__life_reader ) & )
    VR__READER_STATE=started
    exec {vr__r_dw}>&-; vr__r_dw=""
    if ! IFS= read -r -t "${VR__READER_START_TIMEOUT:-10}" hs <&"$VR_LDONE_R" || ! [[ "$hs" =~ ^S\ [1-9][0-9]*$ ]] \
       || vr__init_fail ldone || ! [ "$VR_LDONE" -ef "/dev/fd/$VR_LDONE_R" ] \
       || vr__init_fail msgsr || ! exec {VR_MSGS_R}<"$VR_MSGS" \
       || vr__init_fail msgsid || [ -L "$VR_MSGS" ] || [ ! -f "$VR_MSGS" ] || ! [ "$VR_MSGS" -ef "/dev/fd/$VR_MSGS_R" ] \
       || ! [ "/dev/fd/$VR_MSGS_R" -ef "/dev/fd/$vr__r_mw" ]; then      # 경로가 링크 아닌 일반 파일이고, 최상위가 읽을 파일 = 읽기 프로세스가 쓰는 파일
        vr__reader_stop; return 2
    fi
    VR_LIFE_RD=${hs#S }; VR_LIFE_R=$vr__r_lr; vr__r_lr=""
    exec {vr__r_mw}>&-; vr__r_mw=""
    VR__READER_STATE=running
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
    local code
    local rd="" v
    for v in VR_LIFE_W VR_LDONE_R VR_MSGS_R VR_LIFE_R; do [ -n "${!v:-}" ] && rd+=" {$v}>&-"; done
    eval '"$@"'"$rd"' > "$VR_L/$name.log" 2>&1'; code=$?
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

# 백그라운드 작업(vr_bg / vr_wait).
# 파일($VR_BGREC = <출력>/bg):
#   <id>.run   실행 표식. 부모가 작업을 만든 직후 그 PID 를 적는다. 부모가 회수를 마치면 <id>.done 으로 바꾼다.
#   <id>       종료 기록. 하위 셸이 끝나기 직전에 쓴다(tmp → mv). 첫 줄 "v1 <태그> <id>", 이후 줄 "<종류> <내용>":
#              L = 작업 이름(경로), C = 하위 셸이 끝낸 종료 코드, V = 위반, I = 기록 실패, B = 그 하위 셸이 회수한 자식 작업의 실패.
#   <id>.read  회수한 종료 기록(부모가 읽고 반영한 뒤 이름을 바꾼다. 목적 경로가 이미 있으면 실패).
# 부모(vr_wait)는 자기가 만든 작업만 PID 마다 wait 하고(PID 목록은 셸마다 따로이며 하위 셸은 빈 목록으로 시작), 종료 기록을 검증해
# V·I 는 자기 위반·기록 실패로, B 는 자기 bg 실패로 옮긴다. 기록의 C 가 실제 종료 코드와 다르면(신호 종료 제외) 손상으로 본다.
# 작업마다 회수 상태(0 대기 전 / 1 처리 중 / 2 완료)를 두어, 회수 도중 재진입해도 이미 끝난 작업은 다시 처리하지 않고 남은 작업을 이어서 회수한다.
# 중첩: 하위 셸 안에서 만든 작업의 이름은 "<부모 경로>/<이름>"(최상위는 이름 그대로). 하위 셸은 끝날 때(vr__bg_finish) 먼저 자기 자식을
# 모두 회수한다. 회수 중 재진입하면 남은 자식을 한 번 더 이어서 회수하고 "회수 중 재진입"을 실패로 남긴다. 그래도 남은 자식이 있으면
# "자식 회수 미완료". 어느 경우든 그 하위 셸은 2 로 끝난다.
# 최상위 vr_finish 는 직접 자식을 회수한 뒤, 처리되지 않은 실행 표식(.run)이 남아 있으면(부모가 먼저 죽어 고아가 된 후손 등) 그 프로세스가
# 끝날 때까지 기다리고 종료 기록을 흡수해 판정에 넣는다(그 후손의 실패 + "미회수"). 그다음 bg 폴더에 예상하지 못한 항목이 없는지 본다.
# 하위 셸의 종료 코드(종료 상태 정책): 위반·기록 실패·자식 작업 실패가 있었거나 종료 기록을 쓰지 못했으면 2, 그 밖에는 작업 함수의
# 반환 코드 또는 작업 함수가 직접 exit 한 코드. 모두 정상일 때만 0. 0 이 아니면 부모가 "bg:<경로> exit=N" 으로 실패 처리.
# 정책은 모든 종료 경로에 적용된다: (1) 작업 함수가 반환, (2) 작업 함수가 exit 호출(하위 셸 안에서만 exit 를 함수로 가로챔),
# (3) 그 밖의 종료(builtin exit 등) — EXIT trap. 작업이 trap 을 바꾸고 builtin exit 로 끝내 정책을 건너뛰면 종료 기록이 없으므로,
# 부모는 "종료 기록 없음"으로 실패 처리한다(종료 코드가 0 이어도). 신호로 죽은 경우(코드 128 이상)는 종료 코드만으로 이미 실패다.
vr__bg_policy_code() {   # vr__bg_policy_code <작업 종료 코드> → 출력: 하위 셸이 끝낼 코드
    local rc=$1
    # 플래그가 정확히 "0" 이 아니면(비었거나 숫자가 아니어도) 위반·기록 실패로 본다: 검사 자체의 오류로 성공 쪽으로 빠지지 않게
    if [ "${VR_VIOLATED:-0}" != 0 ] || [ "${VR_IOERR:-0}" != 0 ] || [ ${#VR_BG_FAILS[@]} -ne 0 ]; then printf '2'; return; fi
    case "$rc" in ''|*[!0-9]*) printf '2'; return;; esac      # 숫자가 아닌 종료 코드는 2
    printf '%s' "$(( 10#$rc % 256 ))"
}
vr__bg_record_lines() {   # 종료 기록의 본문 줄(종류 표시 포함). $1 = 종료 코드
    local e
    printf 'L %s\nC %s\n' "$VR_BG_PATH" "$1"
    for e in "${VR_RUN_ERRS[@]}"; do case "$e" in "기록 실패: "*) printf 'I %s\n' "$e" ;; *) printf 'V %s\n' "$e" ;; esac; done
    for e in "${VR_BG_FAILS[@]}"; do printf 'B %s\n' "$e"; done
}
# 종료 기록을 읽어 검증하고, 유효하면 V·I·B 를 메모리에 반영한다. vr__bg_read_record <파일> <id> <이름(빈 값이면 기록의 L 을 씀)>
# 반환: 0 = 유효(vr__rec_code, vr__rec_label 설정), 1 = 읽기 실패(기록 실패로 기억), 2 = 손상(bg 실패로 기억, 내용은 반영하지 않음)
vr__bg_read_record() {
    local f=$1 id=$2 label=$3 tag l; local -a lines=() pv=() pi=() pb=()
    vr__rec_code=""; vr__rec_label=""
    if [ ! -f "$f" ] || [ -L "$f" ] || ! mapfile -t lines < "$f" 2>/dev/null; then vr__ioerr "bg:${label:-$id} 종료 기록 읽기"; return 1; fi
    tag=$(vr_tag "bg:$id") && [ ${#tag} -eq 64 ] || { vr__ioerr "bg:${label:-$id} 종료 기록 태그 계산"; return 1; }
    if [ "${lines[0]:-}" != "v1 $tag $id" ]; then VR_BG_FAILS+=("bg:${label:-$id} 종료 기록 손상"); return 2; fi
    for l in "${lines[@]:1}"; do
        case "$l" in
            "L "?*) [ -z "$vr__rec_label" ] || { VR_BG_FAILS+=("bg:${label:-$id} 종료 기록 손상"); return 2; }; vr__rec_label=${l#L } ;;
            "C "?*) [ -z "$vr__rec_code" ] && [[ "${l#C }" =~ ^(0|[1-9][0-9]{0,2})$ ]] || { VR_BG_FAILS+=("bg:${label:-$id} 종료 기록 손상"); return 2; }
                    vr__rec_code=${l#C } ;;
            "V "?*) pv+=("${l#V }") ;;
            "I "?*) pi+=("${l#I }") ;;
            "B "?*) pb+=("${l#B }") ;;
            *) VR_BG_FAILS+=("bg:${label:-$id} 종료 기록 손상"); return 2 ;;
        esac
    done
    if [ -z "$vr__rec_code" ] || [ -z "$vr__rec_label" ] || { [ -n "$label" ] && [ "$vr__rec_label" != "$label" ]; }; then
        VR_BG_FAILS+=("bg:${label:-$id} 종료 기록 손상"); return 2
    fi
    if [ ${#pv[@]} -gt 0 ]; then VR_VIOLATED=1; VR_RUN_ERRS+=("${pv[@]}"); fi
    if [ ${#pi[@]} -gt 0 ]; then VR_IOERR=1; VR_RUN_ERRS+=("${pi[@]}"); fi
    if [ ${#pb[@]} -gt 0 ]; then VR_BG_FAILS+=("${pb[@]}"); fi
    return 0
}
# 회수 표시: <파일> → <파일>.read. 목적 경로가 이미 있으면(파일·디렉터리·링크 무엇이든) 실패. 옮긴 뒤 목적 경로가 일반 파일이고 원본이 없어야 한다.
vr__bg_mark_read() {
    local f=$1 label=$2 t="$1.read"
    if [ ! -f "$f" ] || [ -L "$f" ]; then vr__ioerr "bg:$label 회수 표시"; return 1; fi      # 일반 파일이 아닌 것은 옮기지 않는다(최종 검사에서 예상하지 못한 항목)
    if [ -e "$t" ] || [ -L "$t" ]; then vr__ioerr "bg:$label 회수 표시 대상이 이미 있음"; return 1; fi
    vr__mv_excl "$f" "$t" && return 0
    vr__ioerr "bg:$label 회수 표시"; return 1
}
# ── 종료 경로 ───────────────────────────────────────────────────────────────────────────
# 하위 셸 안에서 검증기는 세 가지를 가로챈다.
#   exit  : 함수로 가로챈다(작업 코드가 부르는 exit 와, 작업의 EXIT 처리기 안에서 부르는 exit).
#   trap  : 함수로 가로챈다. 작업이 EXIT 처리기를 설치·교체·제거하면 그 처리기는 vr__task_trap 에 보관만 하고,
#           실제 EXIT trap 은 늘 검증기 것(vr__bg_on_exit)으로 남는다. 다른 신호의 trap 은 그대로 넘긴다.
#   EXIT  : 실제 EXIT trap 은 검증기 것. builtin exit 나 셸 오류로 끝나도 여기로 온다.
# 종료 순서: (1) 최초 종료 코드를 vr__bg_pend 에 고정 → (2) 작업의 EXIT 처리기를 한 번 실행(bash 와 같은 순서) →
#           (3) vr__bg_finish. 최종 판정에 쓰는 코드는 "최초 종료 코드가 0 이 아니면 그 코드, 0 이면 처리기가 정한 코드".
#           따라서 처리기가 exit 0 을 불러도 0 이 아닌 최초 코드는 0 으로 바뀌지 않는다.
# 작업이 builtin trap 으로 실제 EXIT trap 을 바꾸면: vr__bg_finish 가 실제 trap 이 검증기 것인지 확인해 "EXIT trap 변경" 위반(2).
# 바꾼 trap 안에서 builtin exit 로 끝내면 검증기 코드가 전혀 실행되지 않아 종료 기록이 없다 → 부모가 "종료 기록 없음"으로 실패.
VR__BG_TRAP_P="trap -- 'vr__bg_on_exit \$?' EXIT"
vr__setrc() { return "$1"; }
# 생명주기 fd 가 아직 그 FIFO 를 가리키는가. 보장 범위: 그 번호를 다른 파일로 덮어쓰거나 닫은 경우를 검출한다.
# 같은 FIFO 를 다른 fd 로 다시 열어 그 번호에 두거나 복제 fd 를 넘기는 등 의도적 fd 재구성은 검출하지 못한다(범위 밖).
vr__life_fd_ok() {
    [ -n "${VR_LIFE_W:-}" ] && [ -p "$VR_LIFE" ] && [ "$VR_LIFE" -ef "/dev/fd/$VR_LIFE_W" ]
}
vr__bg_trap_shadow() {   # 하위 셸 안의 trap 함수 본체
    case "${1:-}" in -p|-l|-P) builtin trap "$@"; return ;; esac
    [ "${1:-}" = "--" ] && shift
    if [ $# -eq 0 ]; then builtin trap; return; fi
    if [ $# -eq 1 ]; then set -- - "$1"; fi
    local act=$1 sig; shift; local -a others=()
    for sig in "$@"; do
        case "${sig^^}" in
            EXIT|SIGEXIT|0) if [ "$act" = - ]; then vr__task_trap=""; else vr__task_trap=$act; fi ;;
            *) others+=("$sig") ;;
        esac
    done
    if [ ${#others[@]} -gt 0 ]; then builtin trap -- "$act" "${others[@]}"; fi
}
vr__bg_task_trap_body() {   # 작업의 처리기를 함수 안에서 실행: 처리기의 return 은 이 함수만 끝낸다
    eval "$vr__task_trap"
    vr__trap_natural=1          # return 없이 끝까지 실행됨(return 이면 이 줄에 오지 않는다)
}
vr__bg_run_task_trap() {   # 작업의 EXIT 처리기를 한 번만, bash 처럼 $? = 종료 코드 상태로 실행
    [ -z "${vr__task_trap_ran:-}" ] && [ -n "${vr__task_trap:-}" ] || return 0
    local trc
    vr__task_trap_ran=1; vr__in_task_trap=1; vr__trap_natural=""
    case "${vr__bg_pend:-}" in ''|*[!0-9]*) vr__setrc 2 ;; *) vr__setrc $(( 10#$vr__bg_pend % 256 )) ;; esac
    vr__bg_task_trap_body; trc=$?
    vr__in_task_trap=""
    # 작업은 늘 함수 안에서 실행되므로 bash 와 같게: 처리기가 return N 으로 끝나면 N 이 종료 코드(처리기 안의 exit N 과 같은 취급).
    # 끝까지 실행되면 종료 코드는 바뀌지 않는다.
    [ -n "$vr__trap_natural" ] || vr__bg_trap_code=$trc
}
vr__bg_exit_req() {   # 가로챈 exit
    local c=$1
    # 이미 종료 처리 중(재진입)이거나 작업의 EXIT 처리기 안이면 바로 종료 처리로(최초 코드는 이미 고정됨)
    if [ -n "${vr__in_task_trap:-}" ] || [ "${vr__bg_depth:-0}" -gt 0 ]; then vr__bg_finish "$c"; fi
    [ -n "${vr__bg_pend:-}" ] || vr__bg_pend=$c
    vr__bg_run_task_trap
    vr__bg_finish "$c"
}
vr__bg_on_exit() {   # 실제 EXIT trap 과 작업 함수의 정상 반환
    local rc=$1
    if [ -n "${vr__in_task_trap:-}" ] || [ "${vr__bg_depth:-0}" -gt 0 ]; then vr__bg_finish "$rc"; fi
    [ -n "${vr__bg_pend:-}" ] || vr__bg_pend=$rc
    vr__bg_run_task_trap
    vr__bg_finish "$rc"
}
# 종료 기록 쓰기 실패 알림: 한 줄 "E <작업 ID> <작업 경로>". 경로가 길어도 줄 전체를 500바이트 이하로 자른다(POSIX PIPE_BUF 최소값 512
# 이하 → 여러 작업이 동시에 써도 줄이 섞이지 않음). 읽기 프로세스가 늘 비워 두므로 보통 즉시 쓰인다. 그래도 읽기 프로세스가 죽는 등으로
# 막히면 VR__MSG_TIMEOUT 초(기본 10) 뒤 포기한다(무한 대기 없음). 포기·실패해도 부모의 "exit=2"·"종료 기록 없음"으로 판정은 실패.
vr__bg_notify_recfail() {
    vr__life_fd_ok || return 1
    local LC_ALL=C msg="E $vr__bg_id $VR_BG_PATH"
    if [ ${#msg} -gt 500 ]; then msg="${msg:0:488}...(생략)"; msg="${msg:0:500}"; fi
    timeout "${VR__MSG_TIMEOUT:-10}" bash -c 'printf "%s\n" "$1" >&"$2"' _ "$msg" "$VR_LIFE_W" 2>/dev/null
}
vr__bg_finish() {   # vr__bg_finish <코드> : 자식을 회수하고, 종료 기록을 한 번만 쓰고, 정책 코드로 하위 셸을 끝낸다
    local rc=$1 eff code tag f i
    if [ -n "${vr__bg_code:-}" ]; then builtin trap - EXIT; builtin exit "$vr__bg_code"; fi
    if [ -z "${vr__bg_trapchk:-}" ]; then   # 실제 EXIT trap 이 검증기 것인지(작업이 builtin trap 으로 바꾸거나 지웠는지) 한 번 확인
        vr__bg_trapchk=1
        if [ "$(builtin trap -p EXIT)" != "$VR__BG_TRAP_P" ]; then VR_VIOLATED=1; VR_RUN_ERRS+=("bg:$VR_BG_PATH EXIT trap 변경"); fi
    fi
    builtin trap - EXIT
    # 최초 종료 코드가 0 이 아니면 그것을 쓴다(처리기·재진입이 0 으로 바꾸지 못함). 0 이면 처리기의 return 코드, 없으면 받은 코드.
    if [ -n "${vr__bg_pend:-}" ] && [ "$vr__bg_pend" != 0 ]; then eff=$vr__bg_pend
    elif [ -n "${vr__bg_trap_code:-}" ]; then eff=$vr__bg_trap_code
    else eff=$rc; fi
    if [ -z "${vr__bg_lifechk:-}" ]; then   # 생명주기 fd 확인(한 번)
        vr__bg_lifechk=1
        vr__life_fd_ok || { VR_VIOLATED=1; VR_RUN_ERRS+=("bg:$VR_BG_PATH 생명주기 fd 변경"); }
    fi
    vr__bg_depth=$(( ${vr__bg_depth:-0} + 1 ))
    if [ "$vr__bg_depth" -eq 1 ]; then vr_wait
    elif [ "$vr__bg_depth" -eq 2 ]; then vr__bg_reentered=1; vr_wait     # 회수 도중 재진입: 남은 자식을 이어서 회수(주입 지점은 부르지 않음)
    fi
    for i in "${!VR_BG_PIDS[@]}"; do
        [ "${VR_BG_ST[$i]:-0}" = 2 ] || { VR_BG_FAILS+=("bg:$VR_BG_PATH 자식 회수 미완료"); break; }
    done
    code=$(vr__bg_policy_code "$eff") || code=2
    code=${code:-2}
    f="$VR_BGREC/$vr__bg_id"
    # 종료 기록 놓기: tmp 에 쓰고 배타 이동(같은 이름의 기록이 이미 있으면 덮어쓰지 않고 실패).
    # 실패하면 2 로 끝나고(부모: "종료 기록 없음"), 원인을 기록 폴더와 무관한 경로 — 생명주기 FIFO — 로 최상위에 알린다:
    # 한 줄 "E <작업 경로>"(PIPE_BUF 보다 작아 원자적으로 쓰임). 최상위는 이를 "기록 실패: bg:<경로> 종료 기록 쓰기"(3)로 판정한다.
    if ! vr__inject recwrite && tag=$(vr_tag "bg:$vr__bg_id") && [ ${#tag} -eq 64 ] \
       && { printf 'v1 %s %s\n' "$tag" "$vr__bg_id"; vr__bg_record_lines "$code"; } 2>/dev/null > "$f.tmp" \
       && vr__mv_excl "$f.tmp" "$f"; then :
    else
        code=2
        vr__bg_notify_recfail
    fi
    vr__bg_code=$code
    builtin exit "$vr__bg_code"
}
vr_bg() {
    local label=${VR_BG_PATH:+$VR_BG_PATH/}$1; shift
    # 작업 ID = <실행 ID>_<만든 셸 PID>_<순번>. 자식을 만들기 전에 실행 표식 <id>.run 을 배타 생성(noclobber)해 ID 를 예약한다.
    # 그 ID 의 기록·.read·.done·.tmp 가 이미 있으면(비정상 종료 뒤 PID 재사용 등) 그 파일은 건드리지 않고 "작업 ID 충돌"로
    # 실패를 남긴 뒤 다음 순번으로 다시 시도한다. 5번 안에 예약하지 못하면 작업을 시작하지 않고 기록 실패.
    local id pid tries=0 x clash
    while :; do
        VR_BG_SEQ=$((VR_BG_SEQ + 1)); id="${VR_RUN_ID}_${BASHPID}_${VR_BG_SEQ}"; clash=""
        for x in "" .run .read .done .tmp; do if [ -e "$VR_BGREC/$id$x" ] || [ -L "$VR_BGREC/$id$x" ]; then clash=1; fi; done
        if [ -z "$clash" ] && ! vr__inject reserve && ( set -C; printf 'reserved\n' > "$VR_BGREC/$id.run" ) 2>/dev/null; then break; fi
        [ -n "$clash" ] && VR_BG_FAILS+=("bg:$label 작업 ID 충돌: $id")
        tries=$((tries + 1))
        if [ "$tries" -ge 5 ]; then vr__ioerr "bg:$label 작업 ID 확보"; return 1; fi
    done
    ( # 최상위 전용 fd(완료 FIFO 읽기·알림 파일 읽기·생명주기 FIFO 읽기)는 작업에 넘기지 않는다(R 줄 가로채기·읽기 위치 변경 방지)
      for vr__v in VR_LDONE_R VR_MSGS_R VR_LIFE_R; do if [ -n "${!vr__v:-}" ]; then eval "exec {$vr__v}<&-"; fi; eval "$vr__v=''"; done
      VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=(); VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=(); VR_BG_FAILS=()
      VR_BG_PATH=$label; vr__bg_id=$id; vr__bg_code=""; vr__bg_depth=0; vr__bg_reentered=""; vr__bg_self=$BASHPID
      vr__bg_pend=""; vr__task_trap=""; vr__task_trap_ran=""; vr__in_task_trap=""; vr__bg_trapchk=""
      vr__bg_trap_code=""; vr__trap_natural=""; vr__bg_lifechk=""
      builtin trap 'vr__bg_on_exit $?' EXIT
      # 가로채기는 이 하위 셸 자신에만 적용한다. 그 안의 하위 셸·명령 치환(함수는 상속된다)에서는 bash 본래 동작
      # (그러지 않으면 x=$(exit 1) 같은 구문이 이 작업의 종료 처리를 대신 실행해 자식 표식을 처리하고 종료 기록을 미리 써 버린다)
      exit() { local vr__xrc=$?    # 인자 없는 exit 는 직전 명령의 코드 — 비교 명령보다 먼저 저장
               if [ "$BASHPID" = "$vr__bg_self" ]; then vr__bg_exit_req "${1-$vr__xrc}"; else builtin exit "${1-$vr__xrc}"; fi; }
      trap() { if [ "$BASHPID" = "$vr__bg_self" ]; then vr__bg_trap_shadow "$@"; else builtin trap "$@"; fi; }
      "$@"
      vr__bg_on_exit $? ) &
    pid=$!
    declare -F vr_hook_bg_before_mark > /dev/null && vr_hook_bg_before_mark "$pid"     # 시험용 주입 지점(평소에는 정의되지 않음)
    VR_BG_PIDS+=("$pid"); VR_BG_LABELS+=("$label"); VR_BG_IDS+=("$id")
    { printf '%s\n' "$pid" > "$VR_BGREC/$id.run"; } 2>/dev/null || vr__ioerr "bg:$label 실행 표식"   # 예약한 자기 표식에 PID 를 적는다
}
vr_wait() {
    local i rc f id label
    for i in "${!VR_BG_PIDS[@]}"; do
        [ "${VR_BG_ST[$i]:-0}" = 2 ] && continue
        label=${VR_BG_LABELS[$i]}; id=${VR_BG_IDS[$i]}; f="$VR_BGREC/$id"
        [ "${VR_BG_ST[$i]:-0}" = 1 ] && VR_BG_FAILS+=("bg:$label 회수 중 재진입")    # 앞선 회수가 이 작업을 처리하다 끊겼다
        VR_BG_ST[$i]=1
        if [ -z "${VR_BG_RC[$i]:-}" ]; then wait "${VR_BG_PIDS[$i]}"; VR_BG_RC[$i]=$?; fi
        rc=${VR_BG_RC[$i]}
        [ "$rc" -eq 0 ] || VR_BG_FAILS+=("bg:$label exit=$rc")
        if [ -z "${vr__bg_reentered:-}" ] && declare -F vr_hook_bg_before_read > /dev/null; then vr_hook_bg_before_read "$f"; fi   # 시험용 주입 지점
        if [ -e "$f" ] || [ -L "$f" ]; then
            if vr__bg_read_record "$f" "$id" "$label"; then
                [ "$rc" -ge 128 ] || [ "$vr__rec_code" = "$rc" ] || VR_BG_FAILS+=("bg:$label 종료 기록 손상")
            fi
            vr__bg_mark_read "$f" "$label"
        elif [ "$rc" -lt 128 ]; then VR_BG_FAILS+=("bg:$label 종료 기록 없음")
        fi
        vr__mv_excl "$VR_BGREC/$id.run" "$VR_BGREC/$id.done" || vr__ioerr "bg:$label 실행 표식 정리"
        VR_BG_ST[$i]=2
    done
    VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=()
}
# 최상위 전용. (1) 후손 생명주기 FIFO 의 EOF 를 기다린다 = 모든 후손 하위 셸이 끝났다(PID 로 기다리지 않으므로 PID 재사용 영향 없음).
# (2) 처리되지 않은 실행 표식(.run)과, 표식 없이 남은 종료 기록(부모가 표식을 쓰기 전에 죽은 경우)을 흡수한다.
vr__bg_drain_descendants() {
    if [ -z "${VR_LIFE_W:-}" ] || [ ! -p "$VR_LIFE" ] || [ -z "${VR_LDONE_R:-}" ] || [ -z "${VR_MSGS_R:-}" ] || [ -z "${VR_LIFE_R:-}" ]; then
        vr__ioerr "후손 추적 준비 안 됨"; return
    fi
    vr__life_fd_ok || { vr__ioerr "후손 추적 fd 변경"; return; }      # 최상위 셸에서 fd 가 덮어써지거나 닫혔으면 EOF 로 완료를 보장할 수 없다
    exec {VR_LIFE_W}>&-; VR_LIFE_W=""
    # (1) 읽기 프로세스가 끝날 때까지(= 생명주기 쓰기 fd 를 가진 후손이 모두 끝날 때까지) 완료 FIFO 를 끝까지 읽는다.
    #     정확히 "R 0" = 정상, 정확히 "R 1" = 알림 파일 기록 실패(3). R 없이 EOF(읽기 프로세스 비정상 종료) 또는 그 밖의 내용
    #     (중복 R, S, 손상) = 기록 실패(3) + 대체 대기.
    local done_out msgs extra="" line fallback="" rc
    if ! done_out=$(command cat <&"$VR_LDONE_R" 2>/dev/null); then vr__ioerr "후손 추적 완료 읽기"; fallback=1; fi
    case "$done_out" in
        "R 0") ;;
        "R 1") vr__ioerr "후손 추적 알림 기록" ;;
        "") vr__ioerr "후손 추적 알림 읽기(읽기 프로세스 비정상 종료)"; fallback=1 ;;
        *) vr__ioerr "후손 추적 완료 FIFO 내용 이상"; fallback=1 ;;
    esac
    # (2) 대체 대기: 읽기 프로세스를 믿을 수 없으면, 최상위가 가진 생명주기 FIFO 읽기 fd 로 남은 알림을 마저 읽으며 EOF(남은 후손 종료)를
    #     기다린다. 제한 시간(VR__FALLBACK_WAIT, 기본 30초) 안에 끝나지 않으면 "후손 종료 확인 시간 초과"(무한 대기 없음).
    #     fd 를 리다이렉션으로 넘기므로 FIFO 를 새로 여는 일(쓰는 쪽이 없으면 열기에서 막힘)이 없다.
    if [ -n "$fallback" ]; then
        extra=$(timeout "${VR__FALLBACK_WAIT:-30}" cat <&"$VR_LIFE_R" 2>/dev/null); rc=$?
        if [ $rc -eq 124 ]; then vr__ioerr "후손 종료 확인 시간 초과"; elif [ $rc -ne 0 ]; then vr__ioerr "후손 추적 대체 읽기"; fi
    fi
    VR__READER_STATE=""        # 완료 FIFO 가 EOF = 읽기 프로세스는 끝났다
    # (3) 알림 파일: 읽기는 vr_init 이 연 fd 로 한다(/dev/fd/N 을 다시 열어 처음부터 — 경로가 지워지거나 바뀌어도 원래 파일).
    #     경로가 여전히 그 파일(링크 아닌 일반 파일, 같은 파일)인지 확인한다. 아니면(삭제·교체·링크·다른 종류) 기록 실패(3).
    local msgs_same=1
    if [ ! -f "$VR_MSGS" ] || [ -L "$VR_MSGS" ] || ! [ "$VR_MSGS" -ef "/dev/fd/$VR_MSGS_R" ]; then vr__ioerr "후손 추적 알림 파일 변경"; msgs_same=""; fi
    if ! msgs=$(command cat "/dev/fd/$VR_MSGS_R" 2>/dev/null); then vr__ioerr "후손 추적 알림 파일 읽기"; fi
    # 알림: "E <작업 ID> <작업 경로>" = 그 작업이 종료 기록을 쓰지 못함. 그 밖의 내용은 신뢰할 수 없으므로 기록 실패로 본다.
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        if [[ "$line" =~ ^E\ ([0-9a-f]{12}_[0-9]+_[0-9]+)\ (.+)$ ]]; then vr__ioerr "bg:${BASH_REMATCH[2]} 종료 기록 쓰기"
        else vr__ioerr "후손 추적 FIFO 에 알 수 없는 내용"; fi
    done <<< "$msgs"$'\n'"$extra"
    # (4) 삭제: 세 파일을 각자의 fd 로 소유 확인해 지운다(vr__rm_owned — 확인과 삭제 사이에 경로가 바뀌어도 남의 것은 지우지 않음).
    #     알림 파일이 바뀌었으면(위에서 이미 실패) 그 자리의 것은 건드리지 않는다.
    local bad="" r
    vr__inject rmfifo && bad=1
    if [ -z "$bad" ]; then
        vr__rm_owned "$VR_LIFE" "$VR_LIFE_R"; r=$?; [ $r -eq 0 ] || bad=1
        vr__rm_owned "$VR_LDONE" "$VR_LDONE_R"; r=$?; [ $r -eq 0 ] || bad=1
        if [ -n "$msgs_same" ]; then vr__rm_owned "$VR_MSGS" "$VR_MSGS_R"; r=$?; [ $r -eq 0 ] || bad=1; fi
    fi
    exec {VR_LDONE_R}<&- {VR_LIFE_R}<&- {VR_MSGS_R}<&-; VR_LDONE_R=""; VR_LIFE_R=""; VR_MSGS_R=""
    [ -z "$bad" ] || vr__ioerr "후손 추적 FIFO 삭제"
}
vr__bg_absorb() {   # vr__bg_absorb <id> : 부모가 회수하지 못한 종료 기록을 흡수
    local id=$1 f="$VR_BGREC/$1"
    if vr__bg_read_record "$f" "$id" ""; then
        [ "$vr__rec_code" = 0 ] || VR_BG_FAILS+=("bg:$vr__rec_label exit=$vr__rec_code")
    fi
    VR_BG_FAILS+=("bg 종료 기록 미회수: $id")
    vr__bg_mark_read "$f" "$id"
}
vr__bg_collect_orphans() {
    local m id f
    vr__bg_drain_descendants
    for m in "$VR_BGREC"/*.run; do
        [ -e "$m" ] || [ -L "$m" ] || continue
        id=${m##*/}; id=${id%.run}; f="$VR_BGREC/$id"
        if [ -e "$f" ] || [ -L "$f" ]; then vr__bg_absorb "$id"
        else VR_BG_FAILS+=("bg 종료 기록 없음(회수되지 않은 작업): $id"); fi
        vr__mv_excl "$m" "$VR_BGREC/$id.done" || vr__ioerr "bg 실행 표식 정리: $id"
    done
    for f in "$VR_BGREC"/*; do       # 실행 표식 없이 남은 종료 기록(작업 ID 형식의 일반 파일)
        [ -f "$f" ] && [ ! -L "$f" ] || continue
        id=${f##*/}
        [[ "$id" =~ ^[0-9a-f]{12}_[0-9]+_[0-9]+$ ]] || continue
        [ -e "$VR_BGREC/$id.done" ] || [ -e "$VR_BGREC/$id.run" ] || vr__bg_absorb "$id"   # 부모가 처리한 작업(.done)은 최종 검사에서 "미회수"로
    done
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
    [ -d "$VR_BGREC" ] && vr__bg_collect_orphans   # 모든 후손이 끝날 때까지 기다리고, 부모가 회수하지 못한 기록을 흡수한다(판정 뒤에 늦게 생기는 기록이 없도록)
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
    # (3b) bg 폴더에는 회수한 기록(.read)과 처리한 실행 표식(.done) 일반 파일만 있어야 한다.
    #      그 밖의 파일은 회수되지 않은 종료 기록·임시 파일, 디렉터리·링크 등은 예상하지 못한 항목(하위 경로를 성공으로 보지 않는다).
    if [ -d "$VR_BGREC" ]; then
        for f in "$VR_BGREC"/* "$VR_BGREC"/.[!.]*; do
            [ -e "$f" ] || [ -L "$f" ] || continue
            if [ ! -f "$f" ] || [ -L "$f" ]; then fails+=("bg 폴더에 예상하지 못한 항목: ${f##*/}"); continue; fi
            case "$f" in *.read|*.done) ;; *.run) fails+=("bg 실행 표식 미처리: ${f##*/}") ;; *) fails+=("bg 종료 기록 미회수: ${f##*/}") ;; esac
        done
    else ioerrs+=("기록 실패: bg 기록 폴더 없음"); fi
    # (4) 메모리에서 중복을 없앤 실패 목록(판정은 이 목록과 ioerrs 로 한다)
    local -A uniq=(); local -a list=()
    for e in "${fails[@]}"; do [ -n "$e" ] || continue; [ -n "${uniq[$e]+x}" ] && continue; uniq[$e]=1; list+=("$e"); done
    # (5) 보고 파일 쓰기. 쓴 뒤 일반 파일인지·내용이 같은지 다시 읽어 확인한다(0바이트 쓰기는 장치가 가득 차도 실패하지 않으므로).
    vr__write_verified "$VR_STEPS" "$steps" || ioerrs+=("기록 실패: step_status.txt")
    # 정렬 결과는 명령 치환이 아니라 임시 파일로 받는다(명령 치환은 끝의 빈 줄을 지우므로). 임시 파일의 생성·읽기·정리 실패도 기록 실패.
    local -a sorted_list=(); local stmp="${VR_SORT_TMP:-$VR_OUT/.sort_out.$BASHPID}" sort_ok=0
    if [ ${#list[@]} -gt 0 ]; then
        if ! : > "$stmp" 2>/dev/null || [ ! -f "$stmp" ]; then ioerrs+=("기록 실패: sort 임시 파일 생성")
        elif ! (set -o pipefail; printf '%s\n' "${list[@]}" | sort -u > "$stmp") 2>/dev/null; then ioerrs+=("기록 실패: sort")
        else
            declare -F vr_hook_sort_after_write > /dev/null && vr_hook_sort_after_write "$stmp"     # 시험용 주입 지점
            if [ ! -f "$stmp" ] || ! mapfile -t sorted_list < "$stmp" 2>/dev/null; then ioerrs+=("기록 실패: sort 임시 파일 읽기"); sorted_list=()
            else sort_ok=1; fi
        fi
        declare -F vr_hook_sort_before_cleanup > /dev/null && vr_hook_sort_before_cleanup "$stmp"   # 시험용 주입 지점
        { rm -f -- "$stmp" 2>/dev/null && [ ! -e "$stmp" ]; } || ioerrs+=("기록 실패: sort 임시 파일 정리")
        if [ $sort_ok -eq 1 ]; then
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
        else sorted_list=("${list[@]}"); fi      # 정렬하지 못했으면 원래 목록을 그대로 쓴다(사유는 위에서 기록)
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
