# F1D4A — 검증 스크립트 공통 부품(시험 전용). tests/p1_verify.sh 가 source 해서 쓴다. 게임 코드·F1 기준 파일을 바꾸지 않는다.
# 목적: 항목별 종료 상태를 모으고, 종료 상태를 남기지 못한 항목·비정상 종료한 백그라운드 작업·기록 실패를 모두 실패로 잡는다.
# 지원 대상: Linux + GNU coreutils + Bash 4.4 이상(개발자 실행 확인은 Linux x86_64, GNU bash 5.2.21, GNU coreutils 9.4 뿐).
#   필요한 것: procfs(/proc/self/fd)와 /dev/fd(→ /proc/self/fd), GNU coreutils 의 timeout·mv(-n = RENAME_NOREPLACE, -T)·stat(-L -c %h)·ln(-T)·
#   mktemp(-d TEMPLATE)·mkfifo·od(-An -v -tx1)·tr·ln(-T -L /proc/self/fd/N = linkat(AT_SYMLINK_FOLLOW), fd 의 객체를 덮어쓰지 않고 놓기),
#   같은 파일시스템 안의 rename·link.
#   vr_init 은 (1) 시작할 때(출력 폴더를 만들기 전) bash 버전·Linux·procfs·/dev/fd·위 명령이 GNU coreutils 인지 확인하고,
#   (2) 출력 폴더를 만든 직후 그 파일시스템에서 실제로 쓰는 옵션·동작(vr__platform_probe)을 직접 해 본다.
#   어느 하나라도 맞지 않으면 사유를 표준 오류(VR__INIT_ERR)에 쓰고 2 로 끝난다(성공으로 진행하지 않음).
#   macOS·BSD·Windows(Git Bash·Cygwin) 등은 지원하지 않으며(미실행), 그 결과를 Linux 결과와 섞지 않는다. sh 로 실행하지 않는다.
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
#   3. 상태 기록은 원자적이다: 임시 파일에 다 쓴 뒤 그 fd 의 객체를 link(2)(vr__link_place)로 한 번에 놓는다. 쓰는 도중이나 직전에 래퍼가
#      죽으면 상태 파일이 없다.
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

VR_OUT=""; VR_L=""; VR_ST=""; VR_TOKEN=""; VR_RUN_ID=""; VR_LIFE=""; VR_LIFE_W=""; VR_LDONE=""; VR_LDONE_R=""; VR_MSGS=""; VR_LIFE_RD=""; VR_MSGS_R=""; VR_LIFE_R=""; VR__READER_STATE=""; VR__INIT_ERR=""; VR__INIT_PID=""; VR__WV_LEFT=""; VR__INIT_OK=0; VR__INIT_CLEANUP_FAIL=0; VR__HELD_OUT=""; VR__LOCK=""; VR__LOCK_ID=""; VR__LOCK_FD=""; VR__NOTES_FD=""; VR__NOTES_AT=""; VR__EXP_FD=""; VR__EXP_AT=""; VR__FAILS_FD=""; VR__FAILS_AT=""; VR__PREV_FAILS_FD=""; VR__PREV_NOTES_FD=""; VR__PREV_EXP_FD=""; VR__PREV_FAILS_AT=""; VR__PREV_NOTES_AT=""; VR__PREV_EXP_AT=""; VR__WV_KEEP=""; VR__WV_FD=""
VR_FAILS=""; VR_EXPECTED=""; VR_NOTES=""; VR_STEPS=""; VR_DONE=""
VR_EXP=(); declare -A VR_EXPN=()
VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=()
VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=(); VR_BG_SEQ=0; VR_BGREC=""; VR_BG_PATH=""

# 생명주기 상태 정리(실패·재호출 공통): 이 라이브러리가 만든 세 객체(생명주기 FIFO·완료 FIFO·알림 파일)를 **소유가 입증될 때만**
# 지우고, fd 를 모두 닫고, 변수를 비운다. 소유 입증 = 그 객체를 만든 직후 연 fd 가 아직 열려 있고 경로의 객체가 그 fd 와 같은 객체.
# 경로만 보고 지우지 않는다. fd 가 없어 입증할 수 없거나 남의 것으로 바뀐 객체는 지우지 않고 잔여물로 남긴다(다음 vr_init 은 그 자리에
# 무엇이 있으면 거부한다). 반환: 0 = 모두 정리, 1 = 남긴 것이 있음(VR__INIT_ERR 에 기록, 표준 오류에 출력).
vr__life_reset() {   # 읽기 프로세스는 생명주기 쓰기 fd 가 모두 닫히면 EOF 로 스스로 끝난다(남은 후손이 없을 때)
    local v r bad="" left=""
    local lfd=${VR_LIFE_R:-${vr__r_lr:-${VR_LIFE_W:-${vr__tmpfd:-}}}}
    local dfd=${VR_LDONE_R:-${vr__dtmp:-${vr__r_dw:-}}}
    local mfd=${vr__r_mw:-${VR_MSGS_R:-}}     # 알림 파일은 우리가 만든 파일에 연 쓰기 fd 를 먼저 쓴다(읽기 fd 는 바뀐 경로를 열었을 수 있음)
    if [ -n "${VR_LIFE:-}" ]; then vr__rm_owned "$VR_LIFE" "$lfd"; r=$?; case $r in 0|2) ;; *) bad=1; left+=" $VR_LIFE" ;; esac; fi
    if [ -n "${VR_LDONE:-}" ]; then vr__rm_owned "$VR_LDONE" "$dfd"; r=$?; case $r in 0|2) ;; *) bad=1; left+=" $VR_LDONE" ;; esac; fi
    if [ -n "${VR_MSGS:-}" ]; then vr__rm_owned "$VR_MSGS" "$mfd"; r=$?; case $r in 0|2) ;; *) bad=1; left+=" $VR_MSGS" ;; esac; fi
    for v in VR_LIFE_W VR_LDONE_R VR_MSGS_R VR_LIFE_R vr__dtmp vr__r_dw vr__r_lr vr__r_mw vr__tmpfd; do
        if [ -n "${!v:-}" ]; then eval "exec {$v}>&-" 2>/dev/null; fi
    done
    VR_LIFE_W=""; VR_LIFE=""; VR_LDONE_R=""; VR_LDONE=""; VR_MSGS=""; VR_LIFE_RD=""; VR_MSGS_R=""; VR_LIFE_R=""
    vr__dtmp=""; vr__r_dw=""; vr__r_lr=""; vr__r_mw=""; vr__tmpfd=""
    if [ -n "$bad" ]; then
        VR__INIT_ERR="정리 실패(소유를 입증할 수 없거나 남의 것으로 바뀌어 남김):$left"
        printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2
        return 1
    fi
    return 0
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
    local rv; for rv in VR__FAILS_FD VR__NOTES_FD VR__EXP_FD VR__LOCK_FD VR__PREV_FAILS_FD VR__PREV_NOTES_FD VR__PREV_EXP_FD; do   # 보고·잠금 fd 는 갖지 않는다
        if [ -n "${!rv:-}" ]; then eval "exec ${!rv}>&-" 2>/dev/null; fi; eval "$rv=''"
    done
    declare -F vr_hook_reader > /dev/null && vr_hook_reader start          # 시험용 주입 지점(평소에는 정의되지 않음)
    printf 'S %s\n' "$BASHPID" >&"$vr__r_dw" || exit 1
    declare -F vr_hook_reader > /dev/null && vr_hook_reader after_s
    # NUL 보존: bash 의 read 는 NUL 바이트를 말없이 지운다(NUL 만 있는 조각은 통째로 사라짐). 그래서 생명주기 FIFO 는 tr 로 NUL 을
    # \001 로 바꿔 읽는다 → NUL 이 섞인 줄은 알림 형식에 맞지 않거나(알 수 없는 내용, 3) 비어 있지 않은 줄로 남는다(사라지지 않음).
    # tr 이 끝까지(= 생명주기 FIFO EOF) 정상 종료했다는 표시로, 이 프로세스만 아는 난수를 넣은 끝 표시 한 줄을 받는다. 끝 표시가 없거나
    # 마지막 줄이 아니면 R 1(기록 실패) — 그리고 자기 fd 로 EOF 까지 마저 기다린 뒤에 R 을 쓴다(후손이 남은 채로 R 을 쓰지 않음).
    local tok="" in="" end="" rc
    tok=$(head -c 8 /dev/urandom 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n')
    [[ "$tok" =~ ^[0-9a-f]{16}$ ]] || { failed=1; tok=""; }
    declare -F vr_hook_reader > /dev/null && vr_hook_reader tok "$tok"     # 시험용(끝 표시 위조 시험이 난수를 알아야 할 때만)
    if [ -n "$tok" ]; then
        exec {in}< <(exec {vr__r_dw}>&- {vr__r_mw}>&-; tr '\000' '\001' <&"$vr__r_lr"; rc=$?; printf '\002VR_END %s %s\n' "$tok" "$rc") || { failed=1; in=""; }
    fi
    if [ -n "$in" ]; then
        while IFS= read -r -u "$in" line || [ -n "$line" ]; do     # -u: fd 를 0 번으로 잠시 복제하지 않고 바로 읽는다
            if [ -z "$end" ] && [ "$line" = $'\002'"VR_END $tok 0" ]; then end=1; line=""; continue; fi
            [ -z "$end" ] || failed=1                               # 끝 표시 뒤에 무엇이 더 옴(있을 수 없음) → R 1
            case "$line" in $'\002'VR_END*) failed=1 ;; esac      # 끝 표시 형식인데 난수·종료 코드가 맞지 않음(tr 실패 포함) → R 1
            n=$((n + 1)); declare -F vr_hook_reader > /dev/null && vr_hook_reader line "$n"
            if vr__inject msgwrite || ! printf '%s\n' "$line" >&"$vr__r_mw"; then failed=1; fi
            line=""
        done
        exec {in}<&-
    fi
    # 완료 조건(R 을 쓰는 조건) = 끝 표시(tr 이 생명주기 FIFO 의 EOF 를 읽고 종료 코드 0 으로 끝남) **그리고** 이 프로세스가 가진
    # 생명주기 FIFO 읽기 fd(vr__r_lr)에서도 EOF 를 확인함. 그래서 tr 이 일찍 죽었든(끝 표시 없음·종료 코드 ≠ 0) 아니든, 쓰기 끝을 가진
    # 후손이 남아 있는 동안에는 R 을 쓰지 않는다. 이 fd 에서 읽힌 데이터는 tr 을 거치지 않은 것이므로(tr 이 끝난 뒤의 데이터) R 1.
    [ -n "$end" ] || failed=1
    while IFS= read -r -u "$vr__r_lr" line || [ -n "$line" ]; do failed=1; line=""; done
    declare -F vr_hook_reader > /dev/null && vr_hook_reader end
    printf 'R %s\n' "$failed" >&"$vr__r_dw"
    declare -F vr_hook_reader > /dev/null && vr_hook_reader after_r      # 시험용(R 뒤에 바이트를 덧붙이는 경우)
}
# 소유 확인 삭제: vr__rm_owned <경로> <그 객체를 가리키는 fd>.
# 반환: 0 = 우리 객체를 지웠음을 확인, 1 = 지우지 않음(남의 것·확인 불가 — 보존), 2 = 경로에 아무것도 없음,
#       3 = 삭제를 시도했으나 결과를 확인하지 못함(실패로 다룬다).
#  1. 같은 폴더에 예측할 수 없는 이름의 빈 폴더(mktemp -d, 권한 0700)를 만들고, 경로를 그 안으로 **덮어쓰지 않는 이동**
#     (mv -n -T = RENAME_NOREPLACE)한다. 그 안에 이미 무엇이 생겼으면 이동하지 않는다(원래 경로·그 안의 것 모두 보존).
#  2. 옮긴 객체가 링크가 아니고 fd 와 같은 객체인지 확인한다. 아니면(남의 것) 덮어쓰지 않는 이동으로 원래 자리에 되돌리고 1.
#  3. 지우기 직전에 다시 확인한다: 링크가 아니고, fd 와 같은 객체이고, 그 객체의 링크 수가 정확히 1(임시 이름 하나뿐)이어야 한다.
#     아니면 원래 자리에 되돌리고 1. 확인 뒤 rm 하고, fd 가 가리키는 우리 객체의 링크 수가 0 이고 임시 폴더가 비어 지워져야 0.
# 0 의 의미(보장): (a) 마지막 확인 때 임시 이름이 우리 객체였고 링크가 하나뿐이었다, (b) 지금 우리 객체의 링크 수가 0 이다(fd 로
#   확인 — 우리 객체는 어떤 이름으로도 남아 있지 않다), (c) 임시 폴더가 비어 있어 지워졌다. 삭제 시도 뒤 (b)·(c) 중 하나라도
#   확인되지 않으면 성공으로 보지 않는다(3).
# 위협 모델(선택: 제외): 마지막 확인과 rm 사이에, 같은 사용자 권한의 다른 프로세스가 **의도적으로** 이 함수의 임시 폴더(난수 이름,
#   0700, 그 순간에만 존재) 안의 이름을 바꿔치기하는 공격은 위협 모델에서 제외한다. 그 경우 rm 은 바꿔 넣은 객체를 지울 수 있고,
#   공격자가 우리 객체의 이름을 먼저 지웠다면 (b)·(c) 가 성립해 0 을 돌려줄 수 있다 — 링크 수 0 은 "우리 객체의 이름이 더는 없음"을
#   뜻할 뿐, 직전 rm 이 지운 것이 우리 객체였다는 증명이 아니다. 이 구간은 막지도 검출하지도 못한다.
#   제외 근거: Linux 에는 "이 inode 일 때만 이 이름을 지움" 같은 조건부 삭제가 없다(unlink·unlinkat 은 이름 기준). 이름을 지우는
#   마지막 한 단계는 사용자 공간에서 원자적으로 확인할 수 없으므로 구조를 바꿔도 이 구간을 없앨 수 없다. 또 그 공격자는 같은 권한이라
#   이 함수 없이도 그 객체를 직접 지울 수 있으므로 권한 상승은 없다. 그 밖의 경우 — 원래 경로가 원래 자리·임시 폴더 생성·이동 직후·
#   첫 확인 직후(마지막 확인 전)에 바뀌는 경우, 그리고 우연한 이름 충돌(임시 폴더는 mktemp 가 배타적으로 만든 난수 이름) — 에는
#   남의 것을 지우지 않는다.
vr__rm_owned() {
    local p=$1 fd=$2 d q n want=${3:-1} hk=${4:-}      # want = 지우기 직전 우리 객체의 기대 링크 수(기본 1, 이미 다른 이름에 놓은 임시 이름을 지울 때 2)
    # hk=nohook: 내부 임시 이름 정리(vr__link_place·vr__mv_excl)에서는 시험용 주입 지점을 부르지 않는다(그 주입 지점은 이 함수를 직접 쓰는 정리용)
    if [ ! -e "$p" ] && [ ! -L "$p" ]; then return 2; fi
    [ -n "$fd" ] || return 1
    [ -z "$hk" ] && declare -F vr_hook_rm_owned > /dev/null && vr_hook_rm_owned "$p"      # 시험용 주입 지점(원래 경로 교체)
    d=$(mktemp -d "${p%/*}/.vr.del.XXXXXXXXXX" 2>/dev/null) || return 1
    q="$d/obj"
    [ -z "$hk" ] && declare -F vr_hook_rm_stage > /dev/null && vr_hook_rm_stage dir "$q"   # 시험용(임시 목적 경로가 생기는 시점)
    if ! mv -n -T -- "$p" "$q" 2>/dev/null; then rmdir -- "$d" 2>/dev/null; return 1; fi
    [ -z "$hk" ] && declare -F vr_hook_rm_stage > /dev/null && vr_hook_rm_stage moved "$q"
    if [ -L "$q" ] || ! [ "$q" -ef "/dev/fd/$fd" ]; then
        mv -n -T -- "$q" "$p" 2>/dev/null && rmdir -- "$d" 2>/dev/null; return 1
    fi
    [ -z "$hk" ] && declare -F vr_hook_rm_stage > /dev/null && vr_hook_rm_stage verified "$q"
    if [ -L "$q" ] || ! [ "$q" -ef "/dev/fd/$fd" ] || [ "$(stat -L -c %h "/dev/fd/$fd" 2>/dev/null)" != "$want" ]; then   # 삭제 직전 재확인
        mv -n -T -- "$q" "$p" 2>/dev/null && rmdir -- "$d" 2>/dev/null; return 1
    fi
    rm -f -- "$q" 2>/dev/null
    n=$(stat -L -c %h "/dev/fd/$fd" 2>/dev/null)
    if ! rmdir -- "$d" 2>/dev/null; then return 3; fi
    [ "$n" = "$((want - 1))" ] || return 3
    return 0
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
        VR__READER_STATE=""
        vr__life_reset; return $?           # 정리 실패(남긴 것)는 그대로 전파
    fi
    VR__READER_STATE=stuck; VR__INIT_ERR="알림 읽기 프로세스 종료 확인 실패: ${VR__HELD_OUT:-${VR_OUT:-?}}(읽기 프로세스 PID ${VR_LIFE_RD:-?})"
    printf 'vr_init: %s — 자원을 남겨 두며, 종료가 확인될 때까지 다시 초기화하지 않음\n' "$VR__INIT_ERR" >&2
    return 1
}
vr__inject() {   # 시험용 실패 주입(평소에는 정의되지 않음): vr_hook_fail <지점> 이 0 을 돌려주면 그 지점을 실패로 본다
    declare -F vr_hook_fail > /dev/null && vr_hook_fail "$1"
}
# 배타 이동: 목적 경로가 이미 있으면(무엇이든) 실패하고 아무것도 덮어쓰지 않는다. 옮긴 뒤 목적 경로가 일반 파일이고 원본이 없어야 성공.
# vr__mv_excl <원본> <목적> [원본 fd] : 원본 **fd 의 객체**를 link(2)(ln -T -L /proc/self/fd/N — 원본 경로를 다시 해석하지 않음, 목적에
# 무엇이든 있으면 EEXIST, 대체·추종 없음)로 목적에 놓은 뒤, 원본 이름은 여전히 그 객체일 때만 소유 확인 삭제(vr__rm_owned, 기대 링크 수 2)로
# 지운다 — 원본 이름이 그 사이 남의 것으로 바뀌면 지우지도 옮기지도 않는다(실패).
# 원본 fd 가 없으면 원본을 읽기·쓰기로 열어 증거를 얻는다(<> 는 FIFO 에서도 멈추지 않음). 증거 조건: 일반 파일, 원본 경로가 링크 아니고 그
# fd 와 같은 객체. 놓기 직전 그 객체의 링크 수가 정확히 1(원본 이름 하나뿐)이어야 한다 — 남의 파일을 하드 링크해 원본 자리에 넣은 경우
# (링크 수 2 이상)에는 놓지 않는다. fd 를 얻은 뒤 원본 경로가 바뀌어도 놓이는 것은 fd 의 객체다(RACE-1 과 같은 유형 차단).
# 반환: 0 = 목적이 그 객체이고 원본 이름이 없어짐, 1 = 그 밖(놓지 못했거나, 놓았지만 원본 이름을 정리하지 못함 — 남의 것은 건드리지 않음).
vr__mv_excl() {
    local src=$1 dst=$2 fd=${3:-} own="" r
    [ -f "$src" ] && [ ! -L "$src" ] || return 1
    if [ -e "$dst" ] || [ -L "$dst" ]; then return 1; fi
    if [ -z "$fd" ]; then
        { exec {fd}<>"$src"; } 2>/dev/null || return 1; own=1
        if [ ! -f "/dev/fd/$fd" ] || [ -L "$src" ] || ! [ "$src" -ef "/dev/fd/$fd" ]; then eval "exec $fd>&-"; return 1; fi
    fi
    if [[ ! "$fd" =~ ^[0-9]+$ ]] || [ ! -f "/dev/fd/$fd" ] || [ "$(stat -L -c %h "/dev/fd/$fd" 2>/dev/null)" != 1 ]; then
        [ -n "$own" ] && eval "exec $fd>&-"; return 1
    fi
    declare -F vr_hook_mv_excl_before > /dev/null && vr_hook_mv_excl_before "$src" "$dst"        # 시험용 주입 지점(확인 뒤·놓기 직전)
    if ! ln -T -L -- "/proc/self/fd/$fd" "$dst" 2>/dev/null || [ -L "$dst" ] || ! [ "$dst" -ef "/dev/fd/$fd" ]; then [ -n "$own" ] && eval "exec $fd>&-"; return 1; fi
    r=1
    if [ ! -L "$src" ] && [ "$src" -ef "/dev/fd/$fd" ]; then vr__rm_owned "$src" "$fd" 2 nohook > /dev/null 2>&1; r=$?; fi   # 남의 것이면 건드리지 않음
    [ -n "$own" ] && eval "exec $fd>&-"
    [ $r -eq 0 ] && [ -f "$dst" ] && [ ! -L "$dst" ] && [ ! -e "$src" ] && [ ! -L "$src" ]
}
vr__init_fail() {   # 시험용 실패 주입(평소에는 정의되지 않음): vr_hook_init_fail <단계> 가 0 을 돌려주면 그 단계를 실패로 본다
    declare -F vr_hook_init_fail > /dev/null && vr_hook_init_fail "$1"
}
# 계약: vr_init 은 다시 호출할 수 있다. 호출할 때마다 이전 생명주기 상태(fd·FIFO)를 먼저 정리하고 새로 만든다.
# 실패하면(반환 2) 임시 fd·생명주기 fd·FIFO 파일·VR_LIFE·VR_LIFE_W 를 모두 정리한 상태로 돌아온다(이후 vr_finish 는
# "후손 추적 준비 안 됨"으로 실패). 이전에 실행한 vr_bg 작업이 남아 있는 상태에서의 재호출은 지원하지 않는다.
# 지원 환경 확인(머리말의 지원 대상). 맞지 않으면 사유를 VR__INIT_ERR·표준 오류에 남기고 1.
vr__platform_check() {
    local why=""
    if [ "${BASH_VERSINFO[0]}" -lt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -lt 4 ]; }; then why+=" bash 4.4 이상 필요(현재 $BASH_VERSION)"; fi
    [ "$(uname -s 2>/dev/null)" = Linux ] || why+=" Linux 전용(현재 $(uname -s 2>/dev/null))"
    { [ -d /proc/self/fd ] && [ -e /dev/fd/0 ] && [ /dev/fd/0 -ef /proc/self/fd/0 ]; } || why+=" procfs(/proc/self/fd)와 /dev/fd 필요"
    local c; for c in timeout mv stat mktemp mkfifo od tr ln; do
        command -v "$c" > /dev/null 2>&1 || { why+=" $c 없음"; continue; }
        "$c" --version 2>/dev/null | head -1 | grep -q 'GNU coreutils' || why+=" GNU coreutils 의 $c 필요"
    done
    if [ -n "$why" ]; then VR__INIT_ERR="지원하지 않는 환경:$why"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 1; fi
    return 0
}
# 기능 확인: 버전 글자가 아니라 이 라이브러리가 실제로 쓰는 옵션·동작을, 출력 폴더와 같은 파일시스템에서 직접 해 본다.
#   mktemp -d TEMPLATE(난수 자리 치환·디렉터리 생성), mkfifo, mv -n -T(있으면 덮어쓰지 않음·디렉터리를 대상 폴더로 보지 않음·없으면 이동),
#   /dev/fd/N 과 /proc/self/fd/N 이 같은 객체, stat -L -c %h(링크 수 1 → 2 → 지운 뒤 fd 로 0), od -An -v -tx1(NUL 보존), tr(NUL → \001),
#   ln -T(목적에 무엇이 있으면 실패), ln -T -L /proc/self/fd/N(원래 이름이 남의 파일·링크로 바뀌어도 fd 의 객체를 놓음, 링크 수 0 이면 실패).
# 확인용 폴더는 방금 mktemp 로 만든 것이며, 그 안의 확인용 파일만 지운다. 하나라도 맞지 않으면 사유를 남기고 1.
vr__platform_probe() {
    local base=$1 p why="" x="" n1="" n2="" n0="" o=""
    p=$(mktemp -d "$base/.vr.plat.XXXXXXXXXX" 2>/dev/null)
    if [ -z "$p" ] || [ ! -d "$p" ] || [ -L "$p" ] || [ "${p%/*}" != "$base" ] || [[ ! "${p##*/}" =~ ^\.vr\.plat\.[A-Za-z0-9]{10}$ ]] || [ "${p##*.}" = XXXXXXXXXX ]; then
        why=" mktemp -d TEMPLATE 동작 이상"; [ -n "$p" ] && [ -d "$p" ] && [ ! -L "$p" ] && rmdir -- "$p" 2>/dev/null
    else
        { mkfifo "$p/f" 2>/dev/null && [ -p "$p/f" ] && [ ! -L "$p/f" ]; } || why+=" mkfifo 동작 이상"
        printf A > "$p/a"; printf B > "$p/b"; mkdir "$p/d"
        mv -n -T -- "$p/a" "$p/b" 2>/dev/null
        { [ "$(cat "$p/b" 2>/dev/null)" = B ] && [ "$(cat "$p/a" 2>/dev/null)" = A ]; } || why+=" mv -n(있으면 덮어쓰지 않음) 동작 이상"
        mv -n -T -- "$p/a" "$p/d" 2>/dev/null
        { [ -f "$p/a" ] && [ -d "$p/d" ] && [ -z "$(ls -A "$p/d" 2>/dev/null)" ]; } || why+=" mv -T(대상을 폴더로 보지 않음) 동작 이상"
        mv -n -T -- "$p/a" "$p/c" 2>/dev/null
        { [ "$(cat "$p/c" 2>/dev/null)" = A ] && [ ! -e "$p/a" ]; } || why+=" mv -n -T(없으면 이동) 동작 이상"
        if { exec {x}<"$p/c"; } 2>/dev/null; then
            { [ "$p/c" -ef "/dev/fd/$x" ] && [ "/dev/fd/$x" -ef "/proc/self/fd/$x" ]; } || why+=" /dev/fd 와 /proc/self/fd 동일성 확인 실패"
            n1=$(stat -L -c %h "/dev/fd/$x" 2>/dev/null); ln -- "$p/c" "$p/e" 2>/dev/null; n2=$(stat -L -c %h "/dev/fd/$x" 2>/dev/null)
            rm -f -- "$p/c" "$p/e"; n0=$(stat -L -c %h "/dev/fd/$x" 2>/dev/null)
            [ "$n1/$n2/$n0" = 1/2/0 ] || why+=" stat -L -c %h(링크 수 ${n1:-?}/${n2:-?}/${n0:-?}, 기대 1/2/0) 동작 이상"
            exec {x}<&-
        else why+=" 확인용 파일 열기 실패"; fi
        # 보고 파일 쓰기가 기대는 두 동작: noclobber 열기가 링크(대상 없음·일반 파일 대상)를 따라가지 않고 실패,
        # ln -T(link(2))가 목적에 무엇이 있으면 대체하지 않고 실패(아래)
        local hc=0 y=""; printf T > "$p/t"; ln -s "$p/t" "$p/l1"; ln -s "$p/nx" "$p/l2"; [[ $- == *C* ]] && hc=1; set -C
        if { exec {y}>"$p/l1"; } 2>/dev/null; then exec {y}>&-; why+=" noclobber 가 링크를 열었음(일반 파일 대상)"; fi
        y=""; if { exec {y}>"$p/l2"; } 2>/dev/null; then exec {y}>&-; why+=" noclobber 가 링크를 열었음(대상 없음)"; fi
        [ $hc -eq 1 ] || set +C
        { [ "$(cat "$p/t" 2>/dev/null)" = T ] && [ ! -e "$p/nx" ]; } || why+=" noclobber 열기가 링크 대상을 바꿈"
        # 덮어쓰지 않는 놓기(ln -T = link(2)): 목적에 일반 파일·링크·대상 없는 링크·폴더·FIFO 가 있으면 모두 실패하고 그대로 둠, 없으면 놓음
        printf N > "$p/n"; mkdir "$p/dd"; mkfifo "$p/ff"; local lt lk=""
        for lt in t l1 l2 dd ff; do
            local li0; li0=$(stat -c '%i:%F' "$p/$lt" 2>/dev/null)
            if ln -T -- "$p/n" "$p/$lt" 2>/dev/null || [ "$(stat -c '%i:%F' "$p/$lt" 2>/dev/null)" != "$li0" ]; then lk+=" $lt"; fi
        done
        [ "$(cat "$p/t" 2>/dev/null)" = T ] && [ ! -e "$p/nx" ] || lk+=" 대상"
        ln -T -- "$p/n" "$p/nn" 2>/dev/null && [ "$p/nn" -ef "$p/n" ] || lk+=" 없음"
        [ -z "$lk" ] || why+=" ln -T(덮어쓰지 않는 놓기) 동작 이상:$lk"
        # fd 기반 놓기(ln -T -L /proc/self/fd/N): 원래 이름(n)을 다른 곳으로 옮기고 그 자리에 남의 파일(t 의 하드 링크)·링크를 넣어도 fd 의
        # 객체가 놓여야 하고(남의 파일에 링크가 늘지 않음), 링크 수 0 인 fd 는 놓지 못해야 한다.
        local q="" lf=""
        if { exec {q}<"$p/n"; } 2>/dev/null; then
            mv -n -T -- "$p/n" "$p/nm" 2>/dev/null; ln -T -- "$p/t" "$p/n" 2>/dev/null
            { ln -T -L -- "/proc/self/fd/$q" "$p/fa" 2>/dev/null && [ "$p/fa" -ef "/dev/fd/$q" ] && ! [ "$p/fa" -ef "$p/t" ] && [ "$(stat -c %h "$p/t" 2>/dev/null)" = 2 ]; } || lf+=" 하드 링크 교체"
            rm -f -- "$p/n"; ln -s "$p/t" "$p/n"
            { ln -T -L -- "/proc/self/fd/$q" "$p/fb" 2>/dev/null && [ "$p/fb" -ef "/dev/fd/$q" ] && ! [ "$p/fb" -ef "$p/t" ]; } || lf+=" 링크 교체"
            ln -T -L -- "/proc/self/fd/$q" "$p/t" 2>/dev/null && lf+=" 목적 있음"
            rm -f -- "$p/n" "$p/nm" "$p/nn" "$p/fa" "$p/fb"
            [ "$(stat -L -c %h "/dev/fd/$q" 2>/dev/null)" = 0 ] && ! ln -T -L -- "/proc/self/fd/$q" "$p/fc" 2>/dev/null && [ ! -e "$p/fc" ] || lf+=" 링크 수 0"
            exec {q}<&-; rm -f -- "$p/fc"
        else lf+=" 확인용 파일 열기 실패"; fi
        [ -z "$lf" ] || why+=" ln -T -L /proc/self/fd(fd 기반 놓기) 동작 이상:$lf"
        rm -f -- "$p/nn"; rmdir -- "$p/dd" 2>/dev/null; rm -f -- "$p/ff"
        rm -f -- "$p/t" "$p/l1" "$p/l2" "$p/n" "$p/nx" 2>/dev/null
        o=$(printf 'a\000\n' | od -An -v -tx1 2>/dev/null | tr -d ' \n')
        [ "$o" = 61000a ] || why+=" od -An -v -tx1 동작 이상"
        o=$(printf 'a\000b' | tr '\000' '\001' 2>/dev/null | od -An -v -tx1 2>/dev/null | tr -d ' \n')
        [ "$o" = 610162 ] || why+=" tr(NUL 변환) 동작 이상"
        # 정리: 확인용 이름만 지운다(동작이 틀린 명령이 폴더 d 안으로 옮겼을 수 있는 이름 포함). 남으면 사유에 더한다.
        rm -f -- "$p/f" "$p/a" "$p/b" "$p/c" "$p/e" "$p/d/a" "$p/d/b" "$p/d/c" 2>/dev/null; rmdir -- "$p/d" "$p" 2>/dev/null || why+=" 확인용 폴더 정리 실패($p)"
    fi
    if [ -n "$why" ]; then VR__INIT_ERR="지원하지 않는 환경(기능 확인):$why"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 1; fi
    return 0
}
vr_init() {
    # 이전 초기화의 읽기 프로세스가 남아 있으면(running: 판정 없이 다시 부름, stuck: 이전에 종료를 확인하지 못함) 먼저 끝내고 확인한다.
    # 확인하지 못하면 새 초기화를 하지 않는다(이전 실행의 자원을 가진 프로세스가 남은 상태에서 성공하지 않음).
    # 초기화 성공 표시(VR__INIT_OK)는 맨 먼저 내린다 — 이후 어느 단계에서 실패해도 vr_finish 는 아무것도 쓰지 않고 3(이전 실행의 출력 폴더를 쓰지 않음)
    # vr__state_clear 는 일반 실행 변수만 지운다. 이전 실행이 가진 자원(읽기 프로세스 fd·PID·상태, 생명주기 객체, 추가 기록 fd, 잠금 fd)과
    # 그 자원을 가진 출력 폴더 이름(VR__HELD_OUT — 진단용, 성공한 초기화 때 기록)은 남겨 두고, 아래 정리가 모두 성공한 뒤에만 비운다.
    # 정리 중 하나라도 실패하면(예: 읽기 프로세스 종료를 확인하지 못함 = stuck) 그 자원과 잠금은 그대로 두고 2 — 새 출력 폴더에는 손대지 않는다.
    # 반환 규약: vr_init 은 0(성공) 또는 2(초기화 실패)만 돌려준다. 초기화 실패 뒤 정리(이번에 만든 파일의 소유 확인 삭제)까지 실패하면
    # 반환은 그대로 2 이고, 그 사실은 VR__INIT_CLEANUP_FAIL=1 · VR__INIT_ERR · 표준 오류로 따로 남긴다(판정 기록 실패 3 은 vr_finish 의 규약).
    VR__INIT_OK=0; VR__INIT_CLEANUP_FAIL=0; VR__INIT_ERR=""; VR__INIT_PID=$BASHPID
    vr__state_clear      # 이전 실행의 경로·실행 ID·토큰·배열·플래그 무효화(정리에 필요한 생명주기·잠금 변수는 아래 정리 함수가 다룸)
    if [ -n "${VR__READER_STATE:-}" ]; then vr__reader_stop || return 2; fi
    vr__life_reset || return 2
    vr__app_to_prev      # 이전 보고·추가 기록 fd 는 "이전 우리 객체" 로 넘긴다(같은 경로 재초기화 때 소유 확인 뒤 교체 가능, 끝나면 닫음)
    vr__lock_release || { VR__INIT_ERR="이전 출력 폴더 잠금 해제 실패: $VR__LOCK"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 2; }
    VR__HELD_OUT=""      # 이전 자원 정리 완료
    vr__platform_check || { vr__prev_close; return 2; }
    vr__init_body "$1"; local rc=$?
    if [ $rc -ne 0 ]; then
        if [ "${VR__READER_STATE:-}" = stuck ]; then
            # 초기화 도중 읽기 프로세스를 띄웠고 그 종료를 확인하지 못함: 그 출력 폴더의 잠금·생명주기 객체·fd·VR__HELD_OUT 을 모두 그대로 둔다
            # (읽기 프로세스가 끝났음을 확인하기 전에는 해제·정리하지 않음). 다음 vr_init 이 다시 확인한다. 일반 실행 변수만 무효화.
            vr__prev_close; vr__state_clear
            return $rc
        fi
        local drc=0
        vr__app_drop_new || drc=$?    # 이번 초기화가 만든 보고·추가 기록 파일을 소유 확인 삭제(같은 경로 재시도가 가능하게), fd 닫기
        [ $drc -eq 0 ] || VR__INIT_CLEANUP_FAIL=1     # 남긴 경로는 vr__app_drop_new 가 VR__INIT_ERR·표준 오류에 이미 남김
        vr__prev_close
        if [ -n "$VR__LOCK" ]; then
            if vr__lock_release; then VR__HELD_OUT=""; else printf 'vr_init: 출력 폴더 잠금 해제 실패(그대로 둠): %s\n' "$VR__LOCK" >&2; fi
        else VR__HELD_OUT=""; fi
        vr__state_clear
        return $rc
    fi
    vr__prev_close
    VR__INIT_OK=1; VR__HELD_OUT=$VR_OUT
    return 0
}
vr__app_to_prev() {   # 지금의 보고·추가 기록 fd 를 "이전" 으로 옮긴다(남아 있던 이전 fd 는 닫음)
    vr__prev_close
    # fd 와 함께 그 fd 의 객체를 놓은 경로도 옮긴다 — 교체 예외는 "같은 경로 + 같은 객체(-ef)" 일 때만(다른 폴더의 파일에는 쓰이지 않음)
    VR__PREV_FAILS_FD=$VR__FAILS_FD; VR__PREV_NOTES_FD=$VR__NOTES_FD; VR__PREV_EXP_FD=$VR__EXP_FD
    VR__PREV_FAILS_AT=$VR__FAILS_AT; VR__PREV_NOTES_AT=$VR__NOTES_AT; VR__PREV_EXP_AT=$VR__EXP_AT
    VR__FAILS_FD=""; VR__NOTES_FD=""; VR__EXP_FD=""; VR__FAILS_AT=""; VR__NOTES_AT=""; VR__EXP_AT=""
}
vr__prev_close() {
    local v
    for v in VR__PREV_FAILS_FD VR__PREV_NOTES_FD VR__PREV_EXP_FD; do if [ -n "${!v:-}" ]; then eval "exec ${!v}>&-" 2>/dev/null; fi; eval "$v=''"; done
    VR__PREV_FAILS_AT=""; VR__PREV_NOTES_AT=""; VR__PREV_EXP_AT=""
}
# 초기화 실패: 이번에 만든 보고·추가 기록 파일만(만든 경로 + 그 fd 의 같은 객체) 소유 확인 삭제하고 fd 를 닫는다. 소유를 입증 못 하거나 삭제를
# 확인하지 못한 것은 지우지 않고 남기며, 그 경로를 VR__INIT_ERR·표준 오류에 남기고 1(호출자는 잠금을 놓더라도 그 객체는 남아 다음 vr_init 이
# 그 경로의 기존 객체로 보고 거부한다 — 우리 것이라는 증거(fd)는 닫히므로 다시 대체되지 않음).
vr__app_drop_new() {
    local bad="" fd at k
    for k in FAILS EXP NOTES; do
        fd=VR__${k}_FD; at=VR__${k}_AT; fd=${!fd:-}; at=${!at:-}
        [ -n "$fd" ] && [ -n "$at" ] || continue
        vr__drop_own "$at" "$fd" || bad+=" $at"
    done
    vr__app_close
    if [ -n "$bad" ]; then
        VR__INIT_ERR="${VR__INIT_ERR:+$VR__INIT_ERR; }초기화 실패 뒤 정리 실패(소유 확인 삭제를 하지 못해 남김):$bad"
        printf 'vr_init: 기록 실패: %s\n' "초기화 실패 뒤 정리 실패(소유 확인 삭제를 하지 못해 남김):$bad" >&2
        return 1
    fi
    return 0
}
vr__state_clear() {   # 실행 상태 무효화: 경로·토큰·실행 ID·등록 목록·실패 목록·bg 상태. 생명주기 fd·잠금·추가 기록 fd 는 각자의 정리 함수가 닫는다
    VR_OUT=""; VR_L=""; VR_ST=""; VR_FAILS=""; VR_EXPECTED=""; VR_STEPS=""; VR_NOTES=""; VR_DONE=""; VR_BGREC=""; VR_TOKEN=""; VR_RUN_ID=""
    VR_EXP=(); VR_EXPN=(); VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=(); VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=(); VR_BG_SEQ=0; VR_BG_PATH=""
    VR__WV_LEFT=""; VR__WV_KEEP=""; VR__WV_FD=""
}
vr__app_close() {   # 보고·추가 기록 fd 를 닫는다
    local v
    for v in VR__NOTES_FD VR__EXP_FD VR__FAILS_FD; do if [ -n "${!v:-}" ]; then eval "exec ${!v}>&-" 2>/dev/null; fi; eval "$v=''"; done
    VR__NOTES_AT=""; VR__EXP_AT=""; VR__FAILS_AT=""
}
# 순서(파일·하위 폴더 접근은 모두 잠금 뒤): 출력 폴더(링크 거부) → 잠금 → 하위 폴더(링크 거부, -p 없이) → 기능 확인 → 보고·추가 파일 → 생명주기 객체
vr__init_body() {
    VR_OUT=$1
    if [ -L "$VR_OUT" ]; then VR__INIT_ERR="출력 폴더가 링크임: $VR_OUT"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 2; fi
    mkdir -p -- "$VR_OUT" 2>/dev/null || return 2
    { [ ! -L "$VR_OUT" ] && [ -d "$VR_OUT" ]; } || return 2
    vr__lock_take "$VR_OUT" || return 2
    VR__HELD_OUT=$VR_OUT        # 이 시점부터 이 출력 폴더의 자원(잠금 등)을 가짐 — 초기화가 끝나기 전 실패에서도 진단·보존에 쓴다
    VR_L="$VR_OUT/logs"; VR_ST="$VR_OUT/status"
    VR_FAILS="$VR_OUT/failed_steps.txt"; VR_EXPECTED="$VR_OUT/expected_steps.txt"; VR_STEPS="$VR_OUT/step_status.txt"
    VR_NOTES="$VR_ST/_violations.txt"; VR_DONE="$VR_L/99_done.log"
    VR_EXP=(); VR_EXPN=(); VR_VIOLATED=0; VR_IOERR=0; VR_RUN_ERRS=(); VR_BG_PIDS=(); VR_BG_LABELS=(); VR_BG_FAILS=(); VR_BG_IDS=(); VR_BG_ST=(); VR_BG_RC=(); VR_BG_SEQ=0; VR_BG_PATH=""
    VR_BGREC="$VR_OUT/bg"
    local sub
    for sub in "$VR_L" "$VR_ST" "$VR_BGREC"; do        # 링크면 거부(따라가서 만들지 않음). -p 없이 한 단계만
        if [ -L "$sub" ]; then VR__INIT_ERR="하위 폴더가 링크임: $sub"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 2; fi
        if [ ! -e "$sub" ]; then mkdir -- "$sub" 2>/dev/null || return 2; fi
        { [ ! -L "$sub" ] && [ -d "$sub" ]; } || return 2
    done
    vr__platform_probe "$VR_OUT" || return 2      # 실제 동작 확인은 출력 폴더와 같은 파일시스템에서(출력 폴더를 만든 직후)
    local ar
    vr__new_placed "$VR_FAILS" VR__FAILS_FD "" "$VR__PREV_FAILS_FD" "$VR__PREV_FAILS_AT"; ar=$?      # 덮어쓰지 않는 생성(A) — fd 는 vr_finish 의 교체에 씀
    if [ $ar -ne 0 ]; then VR__INIT_ERR="failed_steps.txt 생성 실패($ar)${VR__WV_LEFT:+: $VR__WV_LEFT}"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 2; fi
    VR__FAILS_AT=$VR_FAILS
    vr__new_placed "$VR_EXPECTED" VR__EXP_FD append "$VR__PREV_EXP_FD" "$VR__PREV_EXP_AT"; ar=$?      # 추가 기록(B)
    if [ $ar -ne 0 ]; then VR__INIT_ERR="expected_steps.txt 생성 실패($ar)${VR__WV_LEFT:+: $VR__WV_LEFT}"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 2; fi
    VR__EXP_AT=$VR_EXPECTED
    vr__new_placed "$VR_NOTES" VR__NOTES_FD append "$VR__PREV_NOTES_FD" "$VR__PREV_NOTES_AT"; ar=$?
    if [ $ar -ne 0 ]; then VR__INIT_ERR="_violations.txt 생성 실패($ar)${VR__WV_LEFT:+: $VR__WV_LEFT}"; printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 2; fi
    VR__NOTES_AT=$VR_NOTES
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
    if ! mkfifo "$VR_LIFE"; then VR_LIFE=""; return 2; fi
    # 만든 직후 연다(이 fd 가 소유의 증거). 열기 전에 실패하면 소유를 입증할 수 없으므로 그 FIFO 는 잔여물로 남는다.
    vr__tmpfd=""
    if vr__init_fail open || ! exec {vr__tmpfd}<>"$VR_LIFE"; then vr__tmpfd=""; vr__life_reset; return 2; fi
    # 연 것이 FIFO 이고 경로가 링크 아니며 같은 객체인지(링크→일반 파일·장치로 바뀐 경우 거부). 같은 종류의 남의 FIFO 로 바뀌는 경합은
    # 구분할 수 없다(위협 모델 경계 — 잠금으로 다른 vr_init 실행은 배제).
    if [ ! -p "/dev/fd/$vr__tmpfd" ] || [ -L "$VR_LIFE" ] || ! [ "$VR_LIFE" -ef "/dev/fd/$vr__tmpfd" ]; then vr__life_reset; return 2; fi
    if vr__init_fail fifo; then vr__life_reset; return 2; fi
    # fd 할당. 목표: 이미 열린 fd 를 덮어쓰지 않으면서, 작업 코드가 번호를 직접 쓰는 fd(보통 3~10)와 겹치지 않는 높은 번호(200~249).
    #  (1) 먼저 bash 동적 할당({var})으로 연다 — 커널이 비어 있는 번호를 골라 주므로 기존 fd 를 덮어쓰지 않는다.
    #  (2) fd 목록(VR__FD_DIR, 기본 /dev/fd = 이 셸의 fd 표)이 열린 fd 를 실제로 보여 주는지, 방금 연 fd 와 0 으로 확인한다.
    #      보여 주지 못하는 환경이면 "비어 있음" 판단을 믿을 수 없으므로 실패(2)한다.
    #  (3) 200~249 중 목록에 없는 번호로 복제한다. fd 표는 이 프로세스 전용이고 bash 는 단일 스레드라, 확인과 복제 사이에
    #      다른 주체가 그 번호를 열 수 없다(이 사이에 이 셸이 실행하는 명령이 없다).
    #  (4) 복제한 번호가 FIFO 를 가리키는지 확인하고 임시 fd 를 닫는다.
    # 어느 단계든 실패하면 임시 fd 를 닫고 vr__life_reset(생명주기 fd·FIFO·변수 정리) 후 2.
    local n d=${VR__FD_DIR:-/dev/fd}
    if vr__init_fail list || ! [ -e "$d/$vr__tmpfd" ] || ! [ -e "$d/0" ] || ! [ "$VR_LIFE" -ef "$d/$vr__tmpfd" ]; then vr__life_reset; return 2; fi
    if ! vr__init_fail range; then
        for n in {200..249}; do
            if ! [ -e "$d/$n" ] && ! [ -L "$d/$n" ]; then VR_LIFE_W=$n; break; fi
        done
    fi
    if [ -z "$VR_LIFE_W" ]; then vr__life_reset; return 2; fi
    if vr__init_fail dup || ! eval "exec $VR_LIFE_W>&$vr__tmpfd" 2>/dev/null || ! [ "/dev/fd/$VR_LIFE_W" -ef "/dev/fd/$vr__tmpfd" ]; then
        if [ -n "$VR_LIFE_W" ] && ! [ "/dev/fd/$VR_LIFE_W" -ef "/dev/fd/$vr__tmpfd" ]; then VR_LIFE_W=""; fi
        vr__life_reset; return 2
    fi
    exec {vr__tmpfd}>&-; vr__tmpfd=""
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
    # 각 객체는 만든 직후 연다(그 fd 가 소유의 증거). 그 뒤 경로로 다시 여는 fd 는 모두 그 fd 와 같은 객체인지 확인한다.
    if ! mkfifo "$VR_LDONE"; then VR_LDONE=""; VR_MSGS=""; vr__life_reset; return 2; fi
    if vr__init_fail done_created || ! exec {vr__dtmp}<>"$VR_LDONE"; then vr__dtmp=""; VR_MSGS=""; vr__life_reset; return 2; fi
    if [ ! -p "/dev/fd/$vr__dtmp" ] || [ -L "$VR_LDONE" ] || ! [ "$VR_LDONE" -ef "/dev/fd/$vr__dtmp" ]; then VR_MSGS=""; vr__life_reset; return 2; fi
    # 알림 파일: 경로를 다시 열지 않는다 — vr__new_obj(append)가 만든 fd(O_APPEND)를 그대로 쓴다
    local mrc; vr__new_obj "$VR_MSGS" vr__r_mw append; mrc=$?
    if [ $mrc -ne 0 ]; then vr__r_mw=""; [ $mrc -eq 2 ] && VR_MSGS=""; vr__life_reset; return 2; fi
    if vr__init_fail msgs_created; then eval "exec $vr__r_mw>&-"; vr__r_mw=""; vr__life_reset; return 2; fi    # 시험용: 만든 뒤 fd 없이 실패(소유 입증 불가 재현)
    if [ -L "$VR_MSGS" ] || [ ! -f "$VR_MSGS" ] || ! [ "$VR_MSGS" -ef "/dev/fd/$vr__r_mw" ] || vr__init_fail reader \
       || ! exec {vr__r_dw}>"$VR_LDONE" || ! [ "/dev/fd/$vr__r_dw" -ef "/dev/fd/$vr__dtmp" ] \
       || ! exec {VR_LDONE_R}<"$VR_LDONE" || ! [ "/dev/fd/$VR_LDONE_R" -ef "/dev/fd/$vr__dtmp" ] \
       || ! exec {vr__r_lr}<"$VR_LIFE" || ! [ "/dev/fd/$vr__r_lr" -ef "/dev/fd/$VR_LIFE_W" ]; then vr__life_reset; return 2; fi
    exec {vr__dtmp}>&-; vr__dtmp=""
    ( ( vr__life_reader ) & )
    VR__READER_STATE=started
    exec {vr__r_dw}>&-; vr__r_dw=""
    if ! IFS= read -r -t "${VR__READER_START_TIMEOUT:-10}" hs <&"$VR_LDONE_R" || ! [[ "$hs" =~ ^S\ [1-9][0-9]*$ ]] \
       || vr__init_fail ldone || [ -L "$VR_LDONE" ] || ! [ "$VR_LDONE" -ef "/dev/fd/$VR_LDONE_R" ] \
       || vr__init_fail msgsr || ! exec {VR_MSGS_R}<"$VR_MSGS" \
       || vr__init_fail msgsid || [ -L "$VR_MSGS" ] || [ ! -f "$VR_MSGS" ] || ! [ "$VR_MSGS" -ef "/dev/fd/$VR_MSGS_R" ] \
       || ! [ "/dev/fd/$VR_MSGS_R" -ef "/dev/fd/$vr__r_mw" ]; then      # 경로가 링크 아닌 일반 파일이고, 최상위가 읽을 파일 = 읽기 프로세스가 쓰는 파일
        [[ "$hs" =~ ^S\ [1-9][0-9]*$ ]] && VR_LIFE_RD=${hs#S }     # 진단용(이 뒤 종료 확인이 실패하면 남은 읽기 프로세스 PID 를 알림)
        vr__reader_stop; return 2
    fi
    VR_LIFE_RD=${hs#S }; VR_LIFE_R=$vr__r_lr; vr__r_lr=""
    exec {vr__r_mw}>&-; vr__r_mw=""
    VR__READER_STATE=running
}

vr__ioerr() { VR_IOERR=1; VR_RUN_ERRS+=("기록 실패: $1"); }
vr_note_ioerr() { vr__ioerr "$1"; }     # 호출 스크립트용: 판정에 필요한 준비(I/O)가 실패했음을 기록(vr_finish 가 3 으로 판정)
# 바이트 보존 읽기(NUL 포함). bash 의 명령 치환·read 는 NUL 바이트를 지우므로, 판정에 쓰는 기록의 내용을 그대로 셸 변수에 담아
# 비교하지 않는다. od 로 16진 표기(NUL 이 없는 글자열)를 받아 바이트마다 검사한다: NUL 이 하나라도 있으면 4, 없으면 원래 바이트를
# 하나도 빠짐없이(끝의 개행 포함) 변수에 되돌린다. 반환: 0 = 정상, 1 = 읽기 실패(cat·od 중 하나라도 실패), 4 = NUL 포함,
# 5 = od 출력 표기 이상(2자리 16진 바이트 목록이 아님). 0 이 아니면 변수는 빈 값.
# 복원: printf 는 인자가 형식보다 많으면 형식을 되풀이해 적용한다(-v 도 같음) → '\\x%s' 하나로 모든 바이트가 각각 \xHH 로 이어진다
# (예: 61 62 63 → \x61\x62\x63). 그 뒤 %b 로 바이트를 만든다. 단위 시험 14·17 이 모든 입력을 원본과 cmp -s 로 대조한다.
vr__hex_to_var() {   # vr__hex_to_var <변수> <od -An -v -tx1 출력>
    local __h=${2//$'\n'/ } __f __re='^( [0-9a-f]{2})+ $'; local -a __b=()
    printf -v "$1" '%s' ''
    IFS=' ' read -r -a __b <<< "$__h"
    [ ${#__b[@]} -gt 0 ] || return 0
    [[ " ${__b[*]} " =~ $__re ]] || return 5
    case " ${__b[*]} " in *" 00 "*) return 4 ;; esac
    printf -v __f '\\x%s' "${__b[@]}"
    [ ${#__f} -eq $(( 4 * ${#__b[@]} )) ] || return 5          # 바이트마다 정확히 \xHH 4글자
    LC_ALL=C printf -v "$1" '%b' "$__f"
}
vr__read_path_bytes() {   # vr__read_path_bytes <변수> <경로> : 한 번만 읽는다(cat | od — cat 은 시험의 읽기 실패 모의와 같은 방식으로 부른다)
    local __r
    printf -v "$1" '%s' ''                  # 실패해도 변수는 빈 값(정의됨)
    # 파이프의 두 종료 코드를 파이프 직후 한 번에 배열로 복사한다(다음 명령이 PIPESTATUS 를 덮어쓰기 전). 둘 다 0 일 때만 읽기 성공.
    __r=$(cat "$2" 2>/dev/null | command od -An -v -tx1 2>/dev/null; __s=("${PIPESTATUS[@]}"); [ "${#__s[@]}" -eq 2 ] && [ "${__s[0]}" = 0 ] && [ "${__s[1]}" = 0 ]) || return 1
    vr__hex_to_var "$1" "$__r"
}
vr__read_fd_bytes() {   # vr__read_fd_bytes <변수> <fd> : 그 fd 에서 EOF 까지 한 번 읽는다
    local __r
    printf -v "$1" '%s' ''                  # 실패해도 변수는 빈 값(정의됨)
    __r=$(command od -An -v -tx1 <&"$2" 2>/dev/null) || return 1
    vr__hex_to_var "$1" "$__r"
}
# 보고 파일을 쓰고 확인한다: vr__write_verified <경로> <내용> [철회 내용].
# 반환: 0 = 기록·확인 성공, 1 = 실패(우리 임시 객체는 남지 않음), 2 = 실패 + 철회 실패,
#       3 = 실패 + 임시 객체 정리 실패(우리 객체가 남았거나 남았는지 확인 못 함 — 남은 경로는 VR__WV_LEFT. 소유를 입증하지 못한 것은 지우지 않음).
# 단일 작성자 전제: 이 함수는 vr_finish 안에서만, 같은 셸에서 차례로 불린다(vr_finish 는 vr_init 을 부른 셸에서만 동작 — 아래 vr_finish 참고).
# **보고 파일 경로는 쓰기용으로 열지 않는다**(열기는 심볼릭 링크를 따라가므로, 검사와 열기 사이에 경로가 링크로 바뀌면 남의 파일을
# 자를 수 있다 — bash 리다이렉션에는 O_NOFOLLOW 가 없다). 대신:
#  1. 경로의 현재 객체를 lstat(링크를 따라가지 않음)으로 기록한다. 없거나 링크 아닌 일반 파일일 때만 진행(링크·장치·FIFO·폴더면 1).
#  2. 같은 폴더에 예측할 수 없는 새 이름(.vr.rep.<mktemp -u 난수 16자리>)을 noclobber 로 만든다. 그 이름에 무엇이든 이미 있으면 열지
#     않는다(noclobber 는 없는 이름만 O_CREAT|O_EXCL 로 열고, 이미 있는 FIFO·장치·그 링크는 O_TRUNC 없이 열 수 있다 — vr__new_obj 주석).
#     연 fd 가 링크 수 1·크기 0 인 일반 파일이고 그 이름과 같은 객체인지 확인한다. 아니면 쓰지 않고 닫는다(아무것도 자르거나 쓰지 않음).
#  3. 내용은 그 fd(우리가 방금 만든 객체)에만 쓴다.
#  4. 경로의 객체가 1 과 같은지 lstat 으로 다시 확인한 뒤(1 에 이전 우리 객체가 있었으면 그것만 소유 확인 삭제), 2 의 fd 객체를
#     vr__link_place 로 경로에 놓는다: ln -T -L /proc/self/fd/N(= linkat(AT_SYMLINK_FOLLOW) 한 번) — 원본은 임시 경로가 아니라 fd 이고,
#     경로에 무엇이든 있으면 커널이 EEXIST 로 거부한다. **덮어쓰기(rename·mv -T)는 쓰지 않는다**: 그 자리에 있던 것(링크라면 링크 자체)을
#     대체하지도, 그 대상·내용을 열거나 바꾸지도 않는다. 놓은 뒤 임시 이름은 여전히 우리 객체일 때만 소유 확인 삭제한다.
#  5. 놓은 뒤 경로가 링크 아닌 일반 파일이고 fd 와 같은 객체인지, 경로로 다시 읽은 바이트가 쓴 내용과 같은지 확인한다.
# 어느 단계에서든 쓰기·자르기·철회 쓰기의 대상은 2 에서 만든 우리 객체뿐이다(fd 또는 /dev/fd/N — 경로를 다시 해석하지 않음).
# 1~4 에서 실패하면 만든 임시 이름을 소유 확인 삭제(vr__rm_owned)로 지운다. 철회 내용이 있고 5 에서 실패하면 우리 객체를 철회한다.
# 위협 모델 경계: 보고 파일이 들어 있는 폴더 자체가 바뀌는 경우(폴더를 링크로 교체)는 다루지 않는다(출력 폴더 구조는 vr_init 이 만든
#   그대로라고 본다). 4 의 확인과 놓기 사이에 경로에 무엇이 생기면 놓기가 EEXIST 로 실패하고 그것은 그대로 남는다(대체 없음 — 우리 임시
#   객체는 정리). 4 직전에 임시 이름이 남의 파일·링크로 바뀌어도 놓이는 것은 fd 의 우리 객체다(남의 파일이 경로에 하드 링크되지 않음 —
#   vr__link_place 반환 3, 임시 이름 자리의 것은 건드리지 않음). 2 의 이름을 미리 알아내 링크 아닌 FIFO·장치를 먼저 만들어 두는 경우(난수 64비트 예측)에는
#   bash noclobber 가 그것을 자르지 않고 열 수 있으나, 일반 파일 확인에서 걸려 쓰지 않는다(FIFO 열기에서 멈출 수는 있음).
vr__lid() { stat -c '%d:%i:%F' -- "$1" 2>/dev/null || echo none; }      # lstat 식별자(링크를 따라가지 않음). 없으면 none
# ── 안전 생성·배치 도우미 ────────────────────────────────────────────────────────────────────────────────────────────
# bash noclobber(set -C)의 실제 동작(bash 5.2.21 실측): 없는 이름 → O_CREAT|O_EXCL 생성. 일반 파일·일반 파일을 가리키는 링크·대상 없는
# 링크·폴더 → 거부. **이미 있는 비일반 파일(FIFO·장치) 또는 그것을 가리키는 링크 → O_TRUNC 만 빼고 O_EXCL 없이 연다**(FIFO 는 읽는
# 쪽이 없으면 열기에서 멈추고, 장치는 열려 이후 쓰기가 장치로 간다). 그래서 vr__new_obj 는 (1) 열기 전에 경로에 무엇이든 있으면 열지
# 않고, (2) 연 fd 가 일반 파일이 아니면 쓰지도 지우지도 않는다. (1) 과 열기 사이(수 μs)에 FIFO·장치를 끼워 넣는 경합은 남는다
# (이름을 미리 알아야 함 — 고정 이름은 예측 가능: 위협 모델 경계).
# vr__new_obj <경로> <fd 변수> [append] : 경로에 새 일반 파일을 만들고 그 fd 를 변수에 넣는다. 반환:
#   0 = 성공(소유 증명됨), 1 = 실패·우리 것이 남지 않음, 2 = 선점됨·만들지 못함(그 자리의 것은 남의 것 — 쓰지도 지우지도 않음),
#   3 = 실패 + 우리 객체 정리 실패(VR__WV_LEFT).
# 소유 증명 = fd 가 일반 파일(noclobber 는 일반 파일을 O_EXCL 로만 연다 — 이미 있는 일반 파일은 거부, stat 과 open 사이에 일반 파일로
#   바뀌면 bash 가 닫고 실패) 그리고 경로가 링크 아니고 그 fd 와 같은 객체 그리고 링크 수 1·크기 0. 증명 전에는 아무것도 쓰지 않는다.
# append: 증명 뒤 /dev/fd/N 을 >> 로 다시 열어(경로 해석 없이 같은 inode) O_APPEND fd 로 바꾸고 원래 fd 는 닫는다(섞어 쓰면 원래 fd 가
#   덮어써 유실됨). 재열기 fd 의 접근 모드(쓰기 전용)·O_APPEND·inode 동일성을 확인한다.
vr__fd_flags() { awk '/^flags:/{print $2}' "/proc/$BASHPID/fdinfo/$1" 2>/dev/null; }
vr__fd_is_append() { local fl; fl=$(vr__fd_flags "$1"); [[ "$fl" =~ ^[0-7]+$ ]] || return 1; (( (8#$fl & 3) == 1 && (8#$fl & 02000) != 0 )); }
vr__new_obj() {
    local vno_p=$1 vno_v=$2 vno_ap=${3:-} vno_hc=0 vno_r vno_w="" vno_a="" vno_h
    printf -v "$vno_v" '%s' ''; VR__WV_LEFT=""
    if [ -e "$vno_p" ] || [ -L "$vno_p" ]; then return 2; fi
    declare -F vr_hook_new_obj_preopen > /dev/null && vr_hook_new_obj_preopen "$vno_p"     # 시험용 주입 지점(확인 뒤·열기 직전)
    [[ $- == *C* ]] && vno_hc=1
    set -C; { exec {vno_w}>"$vno_p"; } 2>/dev/null; vno_r=$?; [ $vno_hc -eq 1 ] || set +C
    if [ $vno_r -ne 0 ] || [ -z "$vno_w" ]; then return 2; fi
    declare -F vr_hook_new_obj_opened > /dev/null && vr_hook_new_obj_opened "$vno_p" "$vno_w"   # 시험용 주입 지점(만든 직후·증명 전)
    if [ ! -f "/dev/fd/$vno_w" ]; then eval "exec $vno_w>&-" 2>/dev/null; return 2; fi        # 남의 비일반 파일: 쓰기·삭제 금지
    if [ -L "$vno_p" ] || ! [ "$vno_p" -ef "/dev/fd/$vno_w" ]; then                           # 그 이름은 남의 것: 쓰기·삭제 금지
        vno_h=$(stat -L -c %h "/dev/fd/$vno_w" 2>/dev/null); eval "exec $vno_w>&-" 2>/dev/null
        [ "$vno_h" = 0 ] && return 1
        VR__WV_LEFT="$vno_p(우리 객체가 다른 이름으로 남음 — 위치 미확인)"; return 3
    fi
    if [ "$(stat -L -c '%h:%s' "/dev/fd/$vno_w" 2>/dev/null)" != 1:0 ]; then vr__wv_drop "$vno_p" "$vno_w"; return $?; fi
    if [ -n "$vno_ap" ]; then
        if ! { exec {vno_a}>>"/dev/fd/$vno_w"; } 2>/dev/null || ! [ "/dev/fd/$vno_a" -ef "/dev/fd/$vno_w" ] || ! vr__fd_is_append "$vno_a"; then
            [ -n "$vno_a" ] && eval "exec $vno_a>&-" 2>/dev/null
            vr__wv_drop "$vno_p" "$vno_w"; return $?
        fi
        eval "exec $vno_w>&-" 2>/dev/null; vno_w=$vno_a
    fi
    printf -v "$vno_v" '%s' "$vno_w"; return 0
}
# vr__link_place <임시 경로> <최종 경로> <fd> : fd 가 가리키는 우리 객체를 최종 경로에 **덮어쓰지 않고** 놓는다.
#   놓기 = ln -T -L -- /proc/self/fd/<fd> <최종>(= linkat(AT_FDCWD, "/proc/self/fd/N", ..., AT_SYMLINK_FOLLOW) 한 번, 실측 strace).
#   - 원본은 **임시 경로가 아니라 fd** 다: /proc/self/fd/N 은 열린 파일 자체를 가리키는 procfs 링크라, 임시 경로를 다시 해석하지 않는다.
#     임시 경로가 확인 뒤·놓기 직전에 남의 파일(하드 링크·복사본)이나 심볼릭 링크로 바뀌어도 놓이는 것은 fd 의 우리 객체다 —
#     남의 파일이 최종 경로에 하드 링크되는 경로가 없다(RACE-1). 우리 객체의 링크 수가 0 이면(임시 이름이 지워짐) 커널이 ENOENT 로 거부
#     (vfs_link) → 놓지 않음(1).
#   - 최종 경로에 무엇이든(파일·링크·대상 없는 링크·폴더·FIFO) 있으면 커널이 EEXIST 로 거부 — 확인과 놓기 사이의 경쟁 구간이 없고,
#     그 자리의 객체를 대체하거나 링크를 따라가지 않는다. (일반 mv -T 는 RENAME_NOREPLACE 가 EEXIST 면 renameat 로 다시 시도해 대체하므로
#     쓰지 않는다.)
#   - 놓은 뒤 임시 이름은 그것이 여전히 우리 객체(링크 아님·fd 와 같은 객체)일 때만 소유 확인 삭제(vr__rm_owned, 기대 링크 수 2)로
#     지운다. 임시 이름이 남의 것으로 바뀌었으면 건드리지 않는다(옮기지도 않음).
# 반환(호출자: vr__new_placed·vr__write_verified·run 의 상태 기록):
#   0 = 놓았고, 최종 경로가 우리 객체이며, 우리 객체의 이름은 최종 경로 하나뿐(임시 이름은 지웠거나 이미 없었음 — fd 로 링크 수 1 확인).
#   1 = 놓지 못함(최종 경로에 무엇이 있음, fd 가 일반 파일이 아님, 우리 객체의 링크 수 0) — 최종 경로는 건드리지 않음.
#       임시 경로도 건드리지 않았으므로 호출자가 vr__wv_drop 으로 정리한다(남의 것이면 그쪽이 지우지 않고 3).
#   4 = 놓은 직후 최종 경로가 남의 것으로 바뀜 + 우리 객체는 어떤 이름으로도 남지 않음(임시 이름까지 소유 확인 삭제, 링크 수 0).
#   3 = 정리 실패: 우리 객체가 다른 이름으로 남았거나(위치 미확인), 임시 이름 자리에 남의 객체가 있어 건드리지 않음 — VR__WV_LEFT.
#       최종 경로에 우리 객체를 놓은 경우에도 3 이면 호출자는 실패로 처리한다(외부 개입의 흔적).
vr__link_place() {
    local t=$1 f=$2 fd=$3 r h
    [[ "$fd" =~ ^[0-9]+$ ]] && [ -f "/dev/fd/$fd" ] || return 1
    if [ -e "$f" ] || [ -L "$f" ]; then return 1; fi
    declare -F vr_hook_place_before > /dev/null && vr_hook_place_before "$f" "$t"              # 시험용 주입 지점(확인 뒤·놓기 직전)
    ln -T -L -- "/proc/self/fd/$fd" "$f" 2>/dev/null || return 1
    declare -F vr_hook_place_after > /dev/null && vr_hook_place_after "$f" "$t"                # 시험용 주입 지점(놓은 직후·확인 전)
    if [ -L "$f" ] || [ ! -f "$f" ] || ! [ "$f" -ef "/dev/fd/$fd" ]; then
        # 최종 경로의 것은 남의 것 — 건드리지 않는다. 우리 객체에 남은 이름이 우리 임시 이름 하나뿐이면 그것을 지우고 4, 아니면 3.
        h=$(stat -L -c %h "/dev/fd/$fd" 2>/dev/null)
        if [[ "$h" =~ ^[1-9][0-9]*$ ]] && [ ! -L "$t" ] && [ "$t" -ef "/dev/fd/$fd" ]; then
            vr__rm_owned "$t" "$fd" "$h" nohook > /dev/null 2>&1 && h=$((h - 1))   # 임시 이름은 지운다(소유 확인)
        fi
        if [ "$h" = 0 ]; then return 4; fi
        VR__WV_LEFT="$f(놓은 뒤 최종 경로가 바뀜 — 우리 객체가 다른 이름으로 남음: 링크 수 ${h:-?}, 위치 미확인)"; return 3
    fi
    if [ ! -L "$t" ] && [ "$t" -ef "/dev/fd/$fd" ]; then
        vr__rm_owned "$t" "$fd" 2 nohook > /dev/null 2>&1; r=$?
        [ $r -eq 0 ] && return 0
        VR__WV_LEFT="$t(놓은 뒤 임시 이름 정리 실패: vr__rm_owned=$r)"; return 3
    fi
    # 임시 이름이 우리 객체가 아님(없거나, 남의 파일·링크로 바뀜). 그 자리의 것은 건드리지 않는다.
    h=$(stat -L -c %h "/dev/fd/$fd" 2>/dev/null)
    if [ -e "$t" ] || [ -L "$t" ]; then
        VR__WV_LEFT="$t(임시 이름 자리가 남의 객체로 바뀜 — 건드리지 않음. 최종 경로의 우리 객체 링크 수 ${h:-?})"; return 3
    fi
    [ "$h" = 1 ] && return 0                     # 임시 이름은 이미 없고 우리 객체의 이름은 최종 경로 하나뿐
    VR__WV_LEFT="$t(임시 이름이 사라짐 — 우리 객체가 다른 이름으로 남음: 링크 수 ${h:-?}, 위치 미확인)"; return 3
}
# vr__drop_own <경로> <fd> : 경로의 객체가 그 fd 의 우리 객체일 때만 소유 확인 삭제(0). 아니면 건드리지 않고 1.
# 경로에 아무것도 없으면: fd 로 본 우리 객체의 링크 수가 0 일 때만 0(다른 이름으로 남았으면 1).
#   근거: Linux 는 링크 수 0 인 inode 에 새 링크를 만들지 못하게 한다(vfs_link: i_nlink == 0 이면 ENOENT — O_TMPFILE 로 만든 것만 예외이며
#   이 라이브러리는 쓰지 않음). /proc/self/fd/N 을 통한 linkat(AT_SYMLINK_FOLLOW)도 같다(실측 ENOENT, 자체 시험이 고정). 그래서 0 은 "우리
#   객체가 어떤 이름으로도 남지 않았고 앞으로도 생길 수 없음" 으로 영구적이다. 경로 부재 확인과 링크 수 확인 사이에 다른 이름이 생기면 그
#   이름이 있는 동안 링크 수가 1 이상이라 실패(1)로 판정된다(우리 객체가 남았다고 보고, 지우지 않음). 링크 수 0 을 읽은 뒤에는 새 이름을
#   만들 수 없다. 위협 모델: 같은 권한의 프로세스가 우리 객체에 다른 이름을 붙이는 것 자체는 막지 않으며(막을 수 없음), 그 경우 "남음"(1)으로
#   드러난다 — 남의 이름을 지우거나 "남지 않음" 으로 오판하는 경로는 없다.
vr__drop_own() {
    [ -n "$2" ] || return 1
    if [ ! -e "$1" ] && [ ! -L "$1" ]; then [ "$(stat -L -c %h "/dev/fd/$2" 2>/dev/null)" = 0 ]; return; fi
    [ ! -L "$1" ] && [ "$1" -ef "/dev/fd/$2" ] || return 1
    vr__rm_owned "$1" "$2" 1 > /dev/null 2>&1
}
# vr__new_placed <최종 경로> <fd 변수> [append] [이전 fd] [이전 경로] : 같은 폴더의 무작위 임시 이름에 새 객체를 만들어 최종 경로에 덮어쓰지
# 않고 놓는다(내용 비어 있음). 최종 경로에 이미 무엇이 있으면 실패한다. 단, 최종 경로가 [이전 경로]와 같고 그 자리의 것이 [이전 fd] 의 같은
# 객체(같은 셸의 이전 vr_init 이 그 경로에 만든 것)이면 소유 확인 삭제 뒤 놓는다 — 다른 폴더의 fd·같은 inode 의 다른 이름에는 쓰이지 않는다.
# 반환: 0 = 성공(fd 변수), 1 = 실패·우리 것 남지 않음, 3 = 정리 실패(우리 객체가 남았거나 위치 미확인 — VR__WV_LEFT),
#       4 = 놓았으나 최종 경로가 바뀜(그 자리의 남의 것은 건드리지 않음) + 우리 객체는 어떤 이름으로도 남지 않음(fd 로 링크 수 0 확인).
# 실패 시 fd 는 닫힌다. 놓은 뒤 최종 경로가 바뀌었는데 우리 객체의 링크 수가 0 이 아니면(다른 이름으로 옮겨짐) 위치를 알 수 없으므로 3.
vr__new_placed() {
    local np_f=$1 np_v=$2 np_ap=${3:-} np_old=${4:-} np_oldat=${5:-} np_t np_fd np_r
    printf -v "$np_v" '%s' ''
    case "$np_f" in */*) ;; *) return 1 ;; esac
    np_t=$(mktemp -u "${np_f%/*}/.vr.new.XXXXXXXXXXXXXXXX" 2>/dev/null) || return 1
    [ "${np_t%/*}" = "${np_f%/*}" ] && [[ "${np_t##*/}" =~ ^\.vr\.new\.[A-Za-z0-9]{16}$ ]] && [ "${np_t##*.}" != XXXXXXXXXXXXXXXX ] || return 1
    if [ -e "$np_f" ] || [ -L "$np_f" ]; then
        [ -n "$np_old" ] && [ "$np_f" = "$np_oldat" ] && vr__drop_own "$np_f" "$np_old" || return 1     # 같은 경로의 이전 우리 객체만 지움 — 그 밖의 것이면 실패(건드리지 않음)
    fi
    vr__new_obj "$np_t" np_fd "$np_ap"; np_r=$?
    [ $np_r -eq 0 ] || { [ $np_r -eq 2 ] && return 1; return $np_r; }
    vr__link_place "$np_t" "$np_f" "$np_fd"; np_r=$?
    if [ $np_r -eq 1 ]; then vr__wv_drop "$np_t" "$np_fd"; return $?; fi
    if [ $np_r -ne 0 ]; then eval "exec $np_fd>&-" 2>/dev/null; return $np_r; fi      # 4 또는 3(VR__WV_LEFT) — 남의 것은 지우지 않음
    printf -v "$np_v" '%s' "$np_fd"; return 0
}
# ── 출력 폴더 잠금 ── vr_init 이 출력 폴더의 파일·하위 폴더에 손대기 전에 mkdir "<출력>/.vr_lock"(원자적, 링크를 따라가지 않음)으로 얻고,
# vr_finish 가 마지막 보고 파일을 쓴 뒤 놓는다. 소유 증거 = 만든 직후 연 폴더 fd(VR__LOCK_FD — 열려 있는 동안 그 inode 는 해제·재사용되지
# 않으므로 rmdir+mkdir 로 같은 inode 번호가 다시 쓰여 속는 일이 없음). 경로가 링크 아닌 폴더이고 그 fd 와 같은 객체일 때만 rmdir(빈 폴더만).
# 남아 있는 잠금(다른 실행 중이거나 이전 실행이 비정상 종료)은 자동으로 지우지 않는다 — 다음 vr_init 은 거부.
vr__lock_take() {
    local l="$1/.vr_lock"
    if ! mkdir -- "$l" 2>/dev/null; then
        VR__INIT_ERR="출력 폴더 잠금 실패: $l 이(가) 이미 있음 — 다른 실행이 이 폴더를 쓰는 중이거나 이전 실행이 비정상 종료함(자동으로 지우지 않음)"
        printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 1
    fi
    # 만든 직후 폴더 fd 를 연다(소유 증거). 열기 실패·확인 실패면 그 잠금이 우리 것임을 입증할 수 없다 → 안전 우선: 잠금을 그대로 남기고
    # 실패한다(자동 복구·자동 삭제 없음 — 사람이 확인해 지워야 함). 폴더 fd 방식은 Linux(procfs /dev/fd)에서만 확인했다(지원 대상도 Linux 한정).
    local lfd=""
    declare -F vr_hook_lock_made > /dev/null && vr_hook_lock_made "$l"                          # 시험용 주입 지점(만든 직후·fd 열기 전)
    if vr__inject lock_open || ! { exec {lfd}<"$l"; } 2>/dev/null || [ -L "$l" ] || [ ! -d "/dev/fd/$lfd" ] || ! [ "$l" -ef "/dev/fd/$lfd" ]; then
        [ -n "$lfd" ] && eval "exec $lfd<&-"
        VR__INIT_ERR="출력 폴더 잠금 확인 실패: $l 를 만든 뒤 소유를 입증하지 못함(폴더 fd 열기 실패 또는 바뀜) — 잠금을 남김. 자동으로 복구·삭제하지 않음: 다른 실행이 없음을 확인한 뒤 직접 지울 것"
        printf 'vr_init: %s\n' "$VR__INIT_ERR" >&2; return 1
    fi
    VR__LOCK=$l; VR__LOCK_ID=$(vr__lid "$l"); VR__LOCK_FD=$lfd
    return 0
}
vr__lock_owned() { [ -n "$VR__LOCK" ] && [ -n "$VR__LOCK_FD" ] && [ ! -L "$VR__LOCK" ] && [ -d "$VR__LOCK" ] && [ "$VR__LOCK" -ef "/dev/fd/$VR__LOCK_FD" ] && [ "$(vr__lid "$VR__LOCK")" = "$VR__LOCK_ID" ]; }
vr__lock_release() {   # 0 = 놓음(또는 가진 잠금 없음), 1 = 소유 확인 실패 또는 rmdir 실패(잠금은 그대로)
    [ -n "$VR__LOCK" ] || return 0
    declare -F vr_hook_lock_release > /dev/null && vr_hook_lock_release "$VR__LOCK"         # 시험용 주입 지점(해제 직전)
    vr__lock_owned || return 1
    rmdir -- "$VR__LOCK" 2>/dev/null || return 1
    eval "exec $VR__LOCK_FD<&-" 2>/dev/null
    VR__LOCK=""; VR__LOCK_ID=""; VR__LOCK_FD=""
    return 0
}
# ── 추가 기록 파일(expected_steps.txt·_violations.txt) ── vr_init 에서 vr__new_placed(append)로 만들고 O_APPEND fd 를 끝까지 가진다.
# 매번 경로를 다시 열지 않는다. 경로 변수가 vr_init 때와 다르면 쓰지 않고 실패(기록 실패로 기억). 하위 셸은 fd 를 물려받고, run 이 실행하는
# 외부 명령에는 닫아서 넘긴다. O_APPEND 라 여러 프로세스의 한 줄 쓰기가 서로 덮어쓰지 않는다(쓰는 순서대로).
vr__append() {   # vr__append <notes|exp> <줄>
    local fd at cur
    case $1 in notes) fd=$VR__NOTES_FD; at=$VR__NOTES_AT; cur=$VR_NOTES ;; exp) fd=$VR__EXP_FD; at=$VR__EXP_AT; cur=$VR_EXPECTED ;; *) return 1 ;; esac
    [ -n "$fd" ] && [ -n "$at" ] && [ "$cur" = "$at" ] || return 1
    printf '%s\n' "$2" 2>/dev/null >&"$fd"
}
vr__write_verified() {   # vr__write_verified <경로> <내용> [철회 내용] [이전 우리 객체 fd]
    local f=$1 content=$2 retract=${3-} old=${4-} back w="" id0 id1 tmp hc=0 r hs
    VR__WV_LEFT=""
    case "$f" in */*) ;; *) return 1 ;; esac
    if [ -L "$f" ]; then return 1; fi
    # 최종 경로에 이미 무엇이 있으면 대체하지 않는다. 예외: 그것이 [이전 우리 객체 fd] 의 객체(vr_init 이 만든 빈 failed_steps.txt 등)이면
    # 놓기 직전에 소유 확인 삭제한 뒤 덮어쓰지 않는 link(2)로 놓는다.
    id0=$(vr__lid "$f")
    case "$id0" in
        none) ;;
        *":regular file"|*":regular empty file") [ -n "$old" ] && [ "$f" -ef "/dev/fd/$old" ] || return 1 ;;
        *) return 1 ;;
    esac
    # 이름만 만든다(mktemp -u: 파일을 만들지 않음, 난수 16자리). 안전성은 이름이 아니라 아래 O_EXCL 생성에서 나온다.
    tmp=$(mktemp -u "${f%/*}/.vr.rep.XXXXXXXXXXXXXXXX" 2>/dev/null) || return 1      # 이름 생성 실패: 만든 것이 없으므로 1
    [ "${tmp%/*}" = "${f%/*}" ] && [[ "${tmp##*/}" =~ ^\.vr\.rep\.[A-Za-z0-9]{16}$ ]] && [ "${tmp##*.}" != XXXXXXXXXXXXXXXX ] || return 1
    declare -F vr_hook_report_preopen > /dev/null && vr_hook_report_preopen "$f" "$tmp"     # 시험용 주입 지점(첫 확인 뒤·열기 직전)
    if [ -e "$tmp" ] || [ -L "$tmp" ]; then return 1; fi      # 선점(무엇이든) — 열지 않는다(FIFO·장치에서 멈추거나 쓰지 않게)
    [[ $- == *C* ]] && hc=1
    set -C; { exec {w}>"$tmp"; } 2>/dev/null; r=$?; [ $hc -eq 1 ] || set +C
    # 열기 실패(O_EXCL: 그 이름에 무엇이든 이미 있음) — 아무것도 만들지 않았으므로 지울 것도 없다(선점된 것은 남의 것으로 보고 그대로 둔다).
    if [ $r -ne 0 ] || [ -z "$w" ]; then return 1; fi
    declare -F vr_hook_report_opened > /dev/null && vr_hook_report_opened "$tmp" "$w" "$f"   # 시험용 주입 지점(만든 직후·확인 전)
    # 만든 객체 확인. bash noclobber 는 일반 파일을 O_EXCL 로만 연다(이미 있는 일반 파일은 거부, 열기 사이에 일반 파일로 바뀌면 닫고 실패)
    # → fd 가 일반 파일이면 우리가 만든 객체다. fd 가 일반 파일이 아니면 미리 있던 남의 FIFO·장치를 연 것 → 쓰지도 지우지도 않는다(1).
    if [ ! -f "/dev/fd/$w" ]; then eval "exec $w>&-" 2>/dev/null; return 1; fi
    if [ -L "$tmp" ] || ! [ "$tmp" -ef "/dev/fd/$w" ]; then
        # 우리 객체인데 그 이름에 다른 것이 있음(이름이 바뀜) — 그 이름의 것은 지우지 않는다. 우리 객체가 아직 어딘가 남았는지는 fd 로 본다.
        hs=$(stat -L -c %h "/dev/fd/$w" 2>/dev/null); eval "exec $w>&-" 2>/dev/null
        if [ "$hs" = 0 ]; then return 1; fi
        VR__WV_LEFT="$tmp(우리 임시 객체가 다른 이름으로 남음 — 위치 미확인)"; return 3
    fi
    if [ "$(stat -L -c '%h:%s' "/dev/fd/$w" 2>/dev/null)" != 1:0 ]; then vr__wv_drop "$tmp" "$w"; return $?; fi   # 우리 객체가 변조됨
    declare -F vr_hook_report_write > /dev/null && vr_hook_report_write "$f"     # 시험용 주입 지점(쓰기 전 경로 교체)
    if vr__inject report_content || ! printf '%s' "$content" 2>/dev/null >&"$w"; then vr__wv_drop "$tmp" "$w"; return $?; fi
    id1=$(vr__lid "$f")
    if [ "$id1" != "$id0" ] || [ -L "$f" ]; then vr__wv_drop "$tmp" "$w"; return $?; fi      # 시작 뒤 경로가 바뀜 — 그 자리를 건드리지 않음
    declare -F vr_hook_report_prerename > /dev/null && vr_hook_report_prerename "$f"   # 시험용 주입 지점(마지막 확인 뒤·놓기 직전)
    if [ -e "$f" ] || [ -L "$f" ]; then        # 이전 우리 객체만 지운다(소유 확인). 그 밖의 것이면 건드리지 않고 실패
        if [ -z "$old" ] || ! vr__drop_own "$f" "$old"; then vr__wv_drop "$tmp" "$w"; return $?; fi
    fi
    vr__link_place "$tmp" "$f" "$w"; r=$?       # 덮어쓰지 않는 놓기(link(2)) — 그 사이 무엇이 생겼으면 그것을 보존하고 실패
    case $r in
        0) ;;
        1) vr__wv_drop "$tmp" "$w"; return $? ;;
        4) eval "exec $w>&-" 2>/dev/null; return 1 ;;        # 놓은 직후 남의 것으로 바뀜, 우리 것은 남지 않음
        *) eval "exec $w>&-" 2>/dev/null; return 3 ;;        # VR__WV_LEFT
    esac
    declare -F vr_hook_report_written > /dev/null && vr_hook_report_written "$f"   # 시험용 주입 지점(놓은 뒤 같은 파일에 바이트 추가 등)
    # 읽기 실패는 "빈 내용"으로 오인하지 않는다. 바이트 보존 읽기(NUL 이 있으면 불일치)로 다시 읽고, 성공한 뒤에만 비교한다.
    if [ -L "$f" ] || [ ! -f "$f" ] || ! [ "$f" -ef "/dev/fd/$w" ] || ! vr__read_path_bytes back "$f" || [ -L "$f" ] || ! [ "$f" -ef "/dev/fd/$w" ] || [ "$back" != "$content" ]; then
        vr__wv_fail "$w" "$retract"; return $?
    fi
    if [ -n "$VR__WV_KEEP" ]; then VR__WV_FD=$w; return 0; fi     # 호출자가 fd 를 닫는다(vr_finish 의 99_done.log — 잠금 해제 실패 시 철회용)
    eval "exec $w>&-"
    return 0
}
vr__wv_drop() {   # vr__wv_drop <임시 이름> <fd> : 경로에 놓기 전 실패 — 우리 임시 객체를 소유 확인 삭제하고 fd 를 닫는다
    # 반환(= vr__write_verified 의 반환): 1 = 정리됨(우리 객체의 링크 수 0 을 fd 로 확인), 3 = 정리 실패(VR__WV_LEFT 에 경로·사유).
    #  vr__rm_owned 0(지움) → 링크 수 0 확인 → 1 / 2(이름 없음) → 링크 수가 0 이면 1, 아니면 다른 이름으로 남음 → 3
    #  1(보존: 남의 것이거나 링크가 여럿 — 소유를 입증 못 함) → 지우지 않고 3 / 3(삭제 결과 미확인) → 3 / fd 닫기 실패 → 3
    local t=$1 fd=$2 r h c=0
    [[ "$fd" =~ ^[0-9]+$ ]] || { VR__WV_LEFT="$t(fd 없음)"; return 3; }
    if { [ -e "$t" ] || [ -L "$t" ]; } && { [ -L "$t" ] || ! [ "$t" -ef "/dev/fd/$fd" ]; }; then
        r=1                                        # 임시 이름 자리가 남의 것 — 옮기지도 지우지도 않는다(vr__rm_owned 를 부르지 않음)
    else
        vr__rm_owned "$t" "$fd" > /dev/null 2>&1; r=$?
    fi
    h=$(stat -L -c %h "/dev/fd/$fd" 2>/dev/null)
    eval "exec $fd>&-" 2>/dev/null || c=1
    [ -e "/dev/fd/$fd" ] && c=1                    # 닫히지 않음
    case $r in
        0|2) if [ "$h" != 0 ]; then VR__WV_LEFT="$t(우리 임시 객체가 남음: 링크 수 ${h:-?}, vr__rm_owned=$r)"; return 3; fi ;;
        1)   VR__WV_LEFT="$t(소유를 입증하지 못해 지우지 않음: vr__rm_owned=1)"; return 3 ;;
        *)   VR__WV_LEFT="$t(삭제 결과 미확인: vr__rm_owned=$r)"; return 3 ;;
    esac
    [ $c -eq 0 ] || { VR__WV_LEFT="$t(fd $fd 닫기 실패)"; return 3; }
    return 1
}
# 확인 실패 처리: vr__wv_fail <fd> <철회 내용>. 반환(= vr__write_verified 의 반환): 1 = 확인 실패(철회 내용이 없거나, 철회해서 그
# 객체의 내용이 철회 내용과 바이트 단위로 같음을 다시 읽어 확인함), 2 = 확인 실패 + 철회 실패(쓰기 실패 또는 다시 읽은 내용 불일치).
# 철회는 경로가 아니라 fd 의 객체(/dev/fd/N 을 비우며 다시 엶)에만 한다 — 경로가 남의 것으로 바뀌었으면 그쪽은 건드리지 않는다.
vr__wv_fail() {
    local fd=$1 retract=$2 r=1 chk=""
    [[ "$fd" =~ ^[0-9]+$ ]] || return 2
    if [ -n "$retract" ]; then
        if declare -F vr_hook_report_retract > /dev/null && vr_hook_report_retract; then r=2      # 시험용 주입 지점(철회 쓰기 실패)
        elif ! { printf '%s' "$retract" > "/dev/fd/$fd"; } 2>/dev/null; then r=2
        elif ! vr__read_path_bytes chk "/dev/fd/$fd" || [ "$chk" != "$retract" ]; then r=2; fi
    fi
    eval "exec $fd>&-" 2>/dev/null
    return $r
}
vr__violation() {   # 위반은 메모리에 먼저 기억하고, 파일 기록은 보조다. 파일 기록이 실패하면 기록 실패로도 기억한다
    VR_VIOLATED=1; VR_RUN_ERRS+=("$1")
    vr__append notes "$1" || vr__ioerr "_violations.txt"
}

vr_expect() {
    local n
    for n in "$@"; do
        VR_EXP+=("$n"); VR_EXPN[$n]=$(( ${VR_EXPN[$n]:-0} + 1 ))
        vr__append exp "$n" || vr__ioerr "expected_steps.txt"
    done
}

vr_tag() { printf '%s' "$VR_TOKEN:$1" | sha256sum | cut -d' ' -f1; }

run() {
    local name=$1; shift
    if [ -z "${VR_EXPN[$name]+x}" ]; then vr__violation "$name 등록되지 않은 항목"; return 2; fi
    # 선점: mkdir 는 원자적이라 같은 이름을 동시에 불러도 한쪽만 성공한다
    if ! mkdir "$VR_ST/$name.claim" 2>/dev/null; then vr__violation "$name 중복 실행 시도"; return 2; fi
    local code
    local rd="" v lfd="" lr
    for v in VR_LIFE_W VR_LDONE_R VR_MSGS_R VR_LIFE_R VR__NOTES_FD VR__EXP_FD VR__LOCK_FD VR__FAILS_FD; do [ -n "${!v:-}" ] && rd+=" {$v}>&-"; done
    # 로그(C): 실행 전에 빈 로그를 안전하게 만들어 최종 경로에 놓고, 그 fd 로 스트리밍한다(경로를 열지 않음). 로그가 있어도 상태 기록이
    # 없거나 손상이면 그 항목은 실패다(판정은 상태 기록만 쓴다). 놓지 못하면 명령을 실행하지 않는다(상태 없음 → 실패).
    vr__new_placed "$VR_L/$name.log" lfd; lr=$?
    if [ $lr -ne 0 ]; then vr__ioerr "$name.log 생성"; [ $lr -eq 3 ] && vr__ioerr "임시 파일 정리 $VR__WV_LEFT"; return 2; fi
    eval '"$@"'"$rd"' >&'"$lfd"' 2>&1 '"$lfd"'>&-'; code=$?
    # 여기까지 왔다는 것은 래퍼가 명령의 종료를 실제로 확인했다는 뜻이다. 그때에만 상태를 기록한다.
    # 로그 끝의 "exit=N" 줄은 사람이 읽기 위한 표시이며 판정에 쓰지 않는다(이전 출력 형식과 F1 기록 로그 비교의 호환을 위해 유지).
    printf 'exit=%s\n' "$code" 2>/dev/null >&"$lfd" || vr__ioerr "$name.log 표시 줄"
    { [ ! -L "$VR_L/$name.log" ] && [ "$VR_L/$name.log" -ef "/dev/fd/$lfd" ]; } || vr__ioerr "$name.log 경로 변경"
    eval "exec $lfd>&-"
    declare -F vr_hook_before_status > /dev/null && vr_hook_before_status "$name"     # 시험용 주입 지점(평소에는 정의되지 않음)
    # 상태(D): 임시 이름은 그대로(미완료 판정·시험 호환) 두되 vr__new_obj 로 만들어 그 fd 로만 쓰고, 그 fd 의 객체를 vr__link_place(link(2),
    # 덮어쓰지 않음)로 놓은 뒤 같은 객체인지 확인
    local tag tmp="$VR_ST/$name.status.tmp.$BASHPID" sfd="" sr
    tag=$(vr_tag "$name") && [ ${#tag} -eq 64 ] || { vr__ioerr "$name 상태 태그 계산"; return 2; }
    vr__new_obj "$tmp" sfd; sr=$?
    if [ $sr -ne 0 ]; then vr__ioerr "$name 상태 임시 파일"; [ $sr -eq 3 ] && vr__ioerr "임시 파일 정리 $VR__WV_LEFT"; return 2; fi
    if ! printf 'v1 %s %s %s\n' "$tag" "$name" "$code" 2>/dev/null >&"$sfd"; then
        vr__wv_drop "$tmp" "$sfd" || { :; }; [ -n "$VR__WV_LEFT" ] && vr__ioerr "임시 파일 정리 $VR__WV_LEFT"
        vr__ioerr "$name 상태 임시 파일"; return 2
    fi
    declare -F vr_hook_before_commit > /dev/null && vr_hook_before_commit "$name"     # 시험용 주입 지점
    # 놓기: 덮어쓰지 않는 link(2) — 상태 파일이 이미 있으면(무엇이든) 그것을 보존하고 실패. 놓은 뒤 임시 이름은 소유 확인 삭제.
    if [ -L "$tmp" ] || ! [ "$tmp" -ef "/dev/fd/$sfd" ]; then eval "exec $sfd>&-"; vr__ioerr "$name 상태 파일 놓기"; return 2; fi
    vr__link_place "$tmp" "$VR_ST/$name.status" "$sfd"; sr=$?
    case $sr in
        0) ;;
        1) vr__wv_drop "$tmp" "$sfd"; [ $? -eq 3 ] && vr__ioerr "임시 파일 정리 $VR__WV_LEFT"; vr__ioerr "$name 상태 파일 놓기"; return 2 ;;
        *) eval "exec $sfd>&-"; [ $sr -eq 3 ] && vr__ioerr "임시 파일 정리 $VR__WV_LEFT"; vr__ioerr "$name 상태 파일 놓기"; return 2 ;;
    esac
    eval "exec $sfd>&-"
    return $code
}

# 백그라운드 작업(vr_bg / vr_wait).
# 파일($VR_BGREC = <출력>/bg):
#   <id>.run   실행 표식. 부모가 작업을 만든 직후 그 PID 를 적는다. 부모가 회수를 마치면 <id>.done 으로 바꾼다.
#   <id>       종료 기록. 하위 셸이 끝나기 직전에 쓴다(tmp → vr__mv_excl: fd 의 객체를 덮어쓰지 않고 놓음). 첫 줄 "v1 <태그> <id>", 이후 줄 "<종류> <내용>":
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
    local f=$1 id=$2 label=$3 tag l body rc; local -a lines=() pv=() pi=() pb=()
    vr__rec_code=""; vr__rec_label=""
    # 한 번만 바이트 보존으로 읽는다: NUL 이 하나라도 있으면 손상(명령 치환·mapfile 이 NUL 을 지워 정상 기록으로 보이지 않게)
    if [ ! -f "$f" ] || [ -L "$f" ]; then vr__ioerr "bg:${label:-$id} 종료 기록 읽기"; return 1; fi
    vr__read_path_bytes body "$f"; rc=$?
    if [ $rc -eq 4 ]; then VR_BG_FAILS+=("bg:${label:-$id} 종료 기록 손상"); return 2; fi
    if [ $rc -ne 0 ]; then vr__ioerr "bg:${label:-$id} 종료 기록 읽기"; return 1; fi
    mapfile -t lines < <(printf '%s' "$body")
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
    # 기록 임시 파일(D): vr__new_obj 로 만든 fd 로만 쓰고, 경로가 그 객체인지 확인한 뒤 배타 이동
    local rfd=""
    if ! vr__inject recwrite && tag=$(vr_tag "bg:$vr__bg_id") && [ ${#tag} -eq 64 ] \
       && vr__new_obj "$f.tmp" rfd \
       && { printf 'v1 %s %s\n' "$tag" "$vr__bg_id"; vr__bg_record_lines "$code"; } 2>/dev/null >&"$rfd" \
       && [ ! -L "$f.tmp" ] && [ "$f.tmp" -ef "/dev/fd/$rfd" ] \
       && vr__mv_excl "$f.tmp" "$f" "$rfd" && [ "$f" -ef "/dev/fd/$rfd" ]; then eval "exec $rfd>&-"
    else
        [ -n "$rfd" ] && eval "exec $rfd>&-" 2>/dev/null
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
    local id pid tries=0 x clash rfd=""
    while :; do
        VR_BG_SEQ=$((VR_BG_SEQ + 1)); id="${VR_RUN_ID}_${BASHPID}_${VR_BG_SEQ}"; clash=""
        for x in "" .run .read .done .tmp; do if [ -e "$VR_BGREC/$id$x" ] || [ -L "$VR_BGREC/$id$x" ]; then clash=1; fi; done
        if [ -z "$clash" ] && ! vr__inject reserve && vr__new_obj "$VR_BGREC/$id.run" rfd; then break; fi      # 예약(D): 만든 fd 를 PID 기록 때까지 가짐
        [ -n "$clash" ] && VR_BG_FAILS+=("bg:$label 작업 ID 충돌: $id")
        tries=$((tries + 1))
        if [ "$tries" -ge 5 ]; then vr__ioerr "bg:$label 작업 ID 확보"; return 1; fi
    done
    ( # 최상위 전용 fd(완료 FIFO 읽기·알림 파일 읽기·생명주기 FIFO 읽기)는 작업에 넘기지 않는다(R 줄 가로채기·읽기 위치 변경 방지)
      eval "exec $rfd>&-"      # 실행 표식 fd 는 부모만 쓴다
      for vr__v in VR__FAILS_FD VR__LOCK_FD VR__PREV_FAILS_FD VR__PREV_NOTES_FD VR__PREV_EXP_FD; do if [ -n "${!vr__v:-}" ]; then eval "exec ${!vr__v}>&-" 2>/dev/null; fi; eval "$vr__v=''"; done   # 최상위 전용(보고·잠금)
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
    # 예약한 자기 표식에 PID 를 적는다(만든 fd 로 — 경로를 열지 않음). 그 뒤 경로가 여전히 그 객체인지 확인
    if ! printf '%s\n' "$pid" 2>/dev/null >&"$rfd" || [ -L "$VR_BGREC/$id.run" ] || ! [ "$VR_BGREC/$id.run" -ef "/dev/fd/$rfd" ]; then vr__ioerr "bg:$label 실행 표식"; fi
    eval "exec $rfd>&-"
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
    local done_out msgs extra="" line fallback="" rc raw
    # 바이트 단위로 대조한다(바이트 보존 읽기 — 끝의 개행·NUL 도 그대로): 정확히 "R 0\n" 또는 "R 1\n" 만 허용. 그 밖의 바이트가 하나라도
    # 있으면(NUL 포함) 내용 이상.
    vr__read_fd_bytes done_out "$VR_LDONE_R"; rc=$?
    if [ $rc -eq 1 ] || [ $rc -eq 5 ]; then vr__ioerr "후손 추적 완료 읽기"; fallback=1      # 읽기 실패·od 표기 이상
    elif [ $rc -ne 0 ]; then vr__ioerr "후손 추적 완료 FIFO 내용 이상"; fallback=1        # NUL 포함(4)
    else
        case "$done_out" in
            $'R 0\n') ;;
            $'R 1\n') vr__ioerr "후손 추적 알림 기록" ;;
            "") vr__ioerr "후손 추적 알림 읽기(읽기 프로세스 비정상 종료)"; fallback=1 ;;
            *) vr__ioerr "후손 추적 완료 FIFO 내용 이상"; fallback=1 ;;
        esac
    fi
    # (2) 대체 대기: 읽기 프로세스를 믿을 수 없으면, 최상위가 가진 생명주기 FIFO 읽기 fd 로 남은 알림을 마저 읽으며 EOF(남은 후손 종료)를
    #     기다린다. 제한 시간(VR__FALLBACK_WAIT, 기본 30초) 안에 끝나지 않으면 "후손 종료 확인 시간 초과"(무한 대기 없음).
    #     fd 를 리다이렉션으로 넘기므로 FIFO 를 새로 여는 일(쓰는 쪽이 없으면 열기에서 막힘)이 없다.
    if [ -n "$fallback" ]; then
        raw=$(timeout "${VR__FALLBACK_WAIT:-30}" od -An -v -tx1 <&"$VR_LIFE_R" 2>/dev/null); rc=$?
        if [ $rc -eq 124 ]; then vr__ioerr "후손 종료 확인 시간 초과"; elif [ $rc -ne 0 ]; then vr__ioerr "후손 추적 대체 읽기"
        else vr__hex_to_var extra "$raw"; rc=$?
            if [ $rc -eq 4 ]; then extra=""; vr__ioerr "후손 추적 FIFO 에 알 수 없는 내용"
            elif [ $rc -ne 0 ]; then extra=""; vr__ioerr "후손 추적 대체 읽기"; fi          # od 표기 이상(5)
        fi
    fi
    VR__READER_STATE=""        # 완료 FIFO 가 EOF = 읽기 프로세스는 끝났다
    # (3) 알림 파일: 읽기는 vr_init 이 연 fd 로 한다(/dev/fd/N 을 다시 열어 처음부터 — 경로가 지워지거나 바뀌어도 원래 파일).
    #     경로가 여전히 그 파일(링크 아닌 일반 파일, 같은 파일)인지 확인한다. 아니면(삭제·교체·링크·다른 종류) 기록 실패(3).
    local msgs_same=1
    if [ ! -f "$VR_MSGS" ] || [ -L "$VR_MSGS" ] || ! [ "$VR_MSGS" -ef "/dev/fd/$VR_MSGS_R" ]; then vr__ioerr "후손 추적 알림 파일 변경"; msgs_same=""; fi
    # 바이트 보존 읽기: NUL 이 하나라도 있으면 알 수 없는 내용(3) — 명령 치환으로 NUL 이 사라져 정상 줄로 보이지 않게
    msgs=""
    if ! raw=$(command od -An -v -tx1 < "/dev/fd/$VR_MSGS_R" 2>/dev/null); then vr__ioerr "후손 추적 알림 파일 읽기"
    else vr__hex_to_var msgs "$raw"; rc=$?
        if [ $rc -eq 4 ]; then msgs=""; vr__ioerr "후손 추적 FIFO 에 알 수 없는 내용"
        elif [ $rc -ne 0 ]; then msgs=""; vr__ioerr "후손 추적 알림 파일 읽기"; fi      # od 표기 이상(5)
    fi
    # 알림: "E <작업 ID> <작업 경로>" = 그 작업이 종료 기록을 쓰지 못함. 그 밖의 내용은 신뢰할 수 없으므로 기록 실패로 본다.
    # 각 줄은 정확히 "E <작업 ID> <경로>" 이고 개행으로 끝나야 한다. 빈 줄·끝이 잘린 줄·그 밖의 내용은 알 수 없는 내용(3).
    local all="$msgs$extra" one
    local -a mlines=()
    if [ -n "$all" ]; then
        [ "${all: -1}" = $'\n' ] || vr__ioerr "후손 추적 FIFO 에 알 수 없는 내용"
        mapfile -t mlines <<< "${all%$'\n'}"
        for one in "${mlines[@]}"; do      # 경로에 제어 문자(NUL 을 바꾼 \001 포함)가 있으면 알 수 없는 내용
            if [[ "$one" =~ ^E\ ([0-9a-f]{12}_[0-9]+_[0-9]+)\ ([^[:cntrl:]]+)$ ]]; then vr__ioerr "bg:${BASH_REMATCH[2]} 종료 기록 쓰기"
            else vr__ioerr "후손 추적 FIFO 에 알 수 없는 내용"; fi
        done
    fi
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
    VR_LIFE=""; VR_LDONE=""; VR_MSGS=""; VR_LIFE_RD=""     # 남은 것은 이미 기록 실패로 보고함 — 다음 vr_init 이 경로로 다시 손대지 않게
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
vr_status_code() {   # 상태 기록은 바이트 단위로 정확히 "v1 <태그> <이름> <코드>\n" 한 줄이어야 한다(빈 줄·추가 데이터·공백 차이 모두 손상)
    local name=$1 f="$VR_ST/$1.status" content tag pre rest re
    if [ ! -e "$f" ] && [ ! -L "$f" ]; then return 1; fi
    if [ -L "$f" ] || [ ! -f "$f" ]; then return 2; fi
    vr__read_path_bytes content "$f" || return 2      # 한 번만 읽고 NUL 이 하나라도 있으면 손상(바이트 보존 — 명령 치환으로 NUL 이 사라지지 않음)
    tag=$(vr_tag "$name") || return 2
    pre="v1 $tag $name "
    [[ "$content" == "$pre"* ]] || return 2
    rest=${content#"$pre"}
    re=$'^(0|[1-9][0-9]{0,2})\n$'
    [[ "$rest" =~ $re ]] || return 2
    [ "${BASH_REMATCH[1]}" -le 255 ] || return 2
    printf '%s\n' "${BASH_REMATCH[1]}"
}

vr__wv_note() {   # vr__wv_note <vr__write_verified 반환> <보고 파일 이름> : vr_finish 의 지역 배열 ioerrs 에 기록 실패를 더한다(동적 범위)
    [ "$1" -eq 0 ] && return 0
    ioerrs+=("기록 실패: $2")
    [ "$1" -eq 3 ] && ioerrs+=("기록 실패: 임시 파일 정리 $VR__WV_LEFT")
    return 0
}
# 단일 작성자: 보고 파일은 vr_finish 만 쓰고, vr_finish 는 vr_init 을 부른 셸(VR__INIT_PID)에서만 동작한다. 백그라운드 작업(vr_bg 하위 셸)이나
# 명령 치환 같은 다른 셸에서 부르면 보고 파일을 쓰지 않고 3. 같은 출력 폴더에 동시에 두 번째 vr_init 이 성공하지 못하는 것은
# 생명주기 FIFO 의 배타적 생성(mkfifo — 이미 있으면 실패)이 보장한다.
vr_finish() {
    if [ "${VR__INIT_OK:-0}" != 1 ] || [ -z "$VR_OUT" ]; then     # 초기화가 성공한 상태가 아님 — 어떤 경로에도 쓰지 않는다
        echo "vr_finish: 초기화가 성공한 상태가 아님(${VR__INIT_ERR:-vr_init 실패 또는 미호출}) — 보고 파일을 쓰지 않음, 성공으로 판정하지 않음" >&2
        return 3
    fi
    if [ -z "${VR__INIT_PID:-}" ] || [ "$BASHPID" != "$VR__INIT_PID" ]; then
        echo "vr_finish: vr_init 을 부른 셸(${VR__INIT_PID:-없음})이 아닌 셸($BASHPID)에서 불림 — 보고 파일을 쓰지 않음, 성공으로 판정하지 않음" >&2
        return 3
    fi
    vr_wait                                    # 남은 백그라운드 작업이 있으면 여기서 수집한다
    [ -d "$VR_BGREC" ] && vr__bg_collect_orphans   # 모든 후손이 끝날 때까지 기다리고, 부모가 회수하지 못한 기록을 흡수한다(판정 뒤에 늦게 생기는 기록이 없도록)
    declare -F vr_hook_after_drain > /dev/null && vr_hook_after_drain      # 시험용 주입 지점(생명주기 FIFO 정리 직후 — 잠금은 아직 유지)
    local -a fails=() ioerrs=()
    local e name code rc base f l notes steps="" r
    local total=${#VR_EXP[@]}
    # (1) 실행 중 메모리에 기억한 위반·기록 실패, 백그라운드 작업 실패
    for e in "${VR_RUN_ERRS[@]}"; do case "$e" in "기록 실패: "*) ioerrs+=("$e") ;; *) fails+=("$e") ;; esac; done
    fails+=("${VR_BG_FAILS[@]}")
    # (2) 다른 하위 셸이 남긴 위반 기록(보조. 유실되어도 그 하위 셸의 종료 코드로 이미 실패가 잡힌다)
    # 위반 기록은 우리 객체(fd)로 읽는다 — 경로가 남의 것으로 바뀌었어도 남의 내용을 읽지 않음(경로 변경은 (5b)에서 기록 실패)
    local nsrc=$VR_NOTES
    [ -n "$VR__NOTES_FD" ] && [ "$VR_NOTES" = "$VR__NOTES_AT" ] && nsrc="/dev/fd/$VR__NOTES_FD"
    if [ -f "$nsrc" ]; then
        if notes=$(cat "$nsrc" 2>/dev/null); then
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
    vr__write_verified "$VR_STEPS" "$steps"; vr__wv_note $? step_status.txt
    # 정렬 결과는 명령 치환이 아니라 임시 파일로 받는다(명령 치환은 끝의 빈 줄을 지우므로). 임시 파일의 생성·읽기·정리 실패도 기록 실패.
    local -a sorted_list=(); local stmp="${VR_SORT_TMP:-$VR_OUT/.sort_out.$BASHPID}" sort_ok=0
    if [ ${#list[@]} -gt 0 ]; then
        # 임시 파일: 그 자리에 아무것도 없을 때 noclobber 로 만들고 곧바로 연 fd(sfd)로 쓴다. 읽기는 경로로 하되 그 fd 와 같은 객체인지
        # 확인하고, 지우기는 소유 확인 삭제(vr__rm_owned)로 한다(경로가 바뀌어도 남의 것에 쓰거나 지우지 않음).
        local sfd="" r
        # 정렬 임시(E): vr__new_obj 의 fd 로 쓰고, 경로로 다시 열지 않고 /dev/fd/N 으로 읽는다
        if ! vr__new_obj "$stmp" sfd; then
            [ -n "$VR__WV_LEFT" ] && ioerrs+=("기록 실패: 임시 파일 정리 $VR__WV_LEFT")
            ioerrs+=("기록 실패: sort 임시 파일 생성"); sfd=""
        elif ! (set -o pipefail; printf '%s\n' "${list[@]}" | sort -u 2>/dev/null >&"$sfd"); then ioerrs+=("기록 실패: sort")
        else
            declare -F vr_hook_sort_after_write > /dev/null && vr_hook_sort_after_write "$stmp"     # 시험용 주입 지점
            if [ -L "$stmp" ] || [ ! -f "$stmp" ] || ! [ "$stmp" -ef "/dev/fd/$sfd" ] || ! mapfile -t sorted_list < "/dev/fd/$sfd" 2>/dev/null; then
                ioerrs+=("기록 실패: sort 임시 파일 읽기"); sorted_list=()
            else sort_ok=1; fi
        fi
        declare -F vr_hook_sort_before_cleanup > /dev/null && vr_hook_sort_before_cleanup "$stmp"   # 시험용 주입 지점
        if [ -n "$sfd" ]; then
            vr__rm_owned "$stmp" "$sfd"; r=$?; exec {sfd}>&-
            case $r in 0) ;; 2) [ $sort_ok -eq 1 ] && ioerrs+=("기록 실패: sort 임시 파일 정리") ;; *) ioerrs+=("기록 실패: sort 임시 파일 정리") ;; esac
        fi
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
    # (5b) 추가 기록 파일이 여전히 그 fd 의 객체인지(경로 변수를 바꾸지 않은 경우에만 — 바꾼 경우는 쓰기 때 이미 기록 실패),
    #      출력 폴더 잠금을 아직 소유하는지(마지막 보고 전에 확인 — 아니면 성공으로 가지 않음)
    if [ -n "$VR__NOTES_FD" ] && [ "$VR_NOTES" = "$VR__NOTES_AT" ] && { [ -L "$VR_NOTES" ] || ! [ "$VR_NOTES" -ef "/dev/fd/$VR__NOTES_FD" ]; }; then ioerrs+=("기록 실패: _violations.txt 경로 변경"); fi
    if [ -n "$VR__EXP_FD" ] && [ "$VR_EXPECTED" = "$VR__EXP_AT" ] && { [ -L "$VR_EXPECTED" ] || ! [ "$VR_EXPECTED" -ef "/dev/fd/$VR__EXP_FD" ]; }; then ioerrs+=("기록 실패: expected_steps.txt 경로 변경"); fi
    if [ -n "$VR__LOCK" ] && ! vr__lock_owned; then ioerrs+=("기록 실패: 출력 폴더 잠금 확인"); fi
    local body=""
    [ ${#sorted_list[@]} -gt 0 ] && body=$(printf '%s\n' "${sorted_list[@]}")$'\n'
    [ ${#ioerrs[@]} -gt 0 ] && body+=$(printf '%s\n' "${ioerrs[@]}")$'\n'
    local ffd=""; [ "$VR_FAILS" = "$VR__FAILS_AT" ] && ffd=$VR__FAILS_FD      # vr_init 이 그 경로에 만든 우리 객체만 교체(경로 변수가 바뀌었으면 교체 권한 없음)
    vr__write_verified "$VR_FAILS" "$body" "" "$ffd"; vr__wv_note $? failed_steps.txt
    local -a report=("${sorted_list[@]}" "${ioerrs[@]}")      # 99_done.log 와 표준 출력에는 failed_steps.txt 기록 실패까지 포함
    # (6) 최종 판정
    if [ ${#list[@]} -eq 0 ] && [ ${#ioerrs[@]} -eq 0 ]; then
        local msg="ALL_DONE: 모든 항목 종료 코드 0 ($total 개 항목)" nd="NOT_DONE: 99_done.log 에 ALL_DONE 을 기록하거나 확인하지 못함 — 성공으로 판정하지 않음"$'\n'
        # 순서: 99_done.log 기록(fd 를 열어 둠) → 잠금 해제 → fd 닫기. 해제 뒤에는 어떤 보고 파일도 쓰지 않는다.
        # 해제 실패 = 잠금이 아직 그대로 → 열어 둔 fd 로 ALL_DONE 을 철회하고 3.
        VR__WV_KEEP=1; VR__WV_FD=""
        vr__write_verified "$VR_DONE" "$msg"$'\n' "$nd"; r=$?
        VR__WV_KEEP=""
        if [ $r -eq 0 ]; then
            if vr__lock_release; then eval "exec $VR__WV_FD>&-"; VR__WV_FD=""; vr__app_close; echo "$msg"; return 0; fi
            vr__wv_fail "$VR__WV_FD" "$nd"; r=$?; VR__WV_FD=""
            echo "기록 실패: 출력 폴더 잠금 해제(${VR__LOCK:-?}) — 성공으로 판정하지 않음. $([ $r -eq 1 ] && echo '99_done.log 의 ALL_DONE 은 철회함(NOT_DONE)' || echo 'ALL_DONE 철회도 실패')" >&2
            vr__app_close; return 3
        fi
        vr__lock_release || echo "기록 실패: 출력 폴더 잠금 해제(${VR__LOCK:-?})" >&2
        vr__app_close
        case $r in
            3) echo "기록 실패: 99_done.log (ALL_DONE 을 기록하거나 확인하지 못함 — 성공으로 판정하지 않음. 임시 파일 정리 실패: $VR__WV_LEFT)" >&2 ;;
            1) echo "기록 실패: 99_done.log (ALL_DONE 을 기록하거나 확인하지 못함 — 성공으로 판정하지 않음. 그 파일의 ALL_DONE 은 철회함(NOT_DONE))" >&2 ;;
            *) echo "기록 실패: 99_done.log (ALL_DONE 을 기록하거나 확인하지 못함 — 성공으로 판정하지 않음. ALL_DONE 철회도 실패 — 그 파일에 ALL_DONE 이 남았을 수 있음)" >&2 ;;
        esac
        return 3
    fi
    local head="FAILED_STEPS: ${#list[@]} (등록 항목 $total 개, 기록 실패 ${#ioerrs[@]} 건)"
    vr__write_verified "$VR_DONE" "$head"$'\n'"$(printf '%s\n' "${report[@]}")"$'\n'; r=$?
    if [ $r -ne 0 ]; then ioerrs+=("기록 실패: 99_done.log"); report+=("기록 실패: 99_done.log"); fi
    if [ $r -eq 3 ]; then ioerrs+=("기록 실패: 임시 파일 정리 $VR__WV_LEFT"); report+=("기록 실패: 임시 파일 정리 $VR__WV_LEFT"); fi
    echo "$head"; printf '%s\n' "${report[@]}"
    local unl=0; vr__lock_release || { unl=1; echo "기록 실패: 출력 폴더 잠금 해제(${VR__LOCK:-?})" >&2; }      # 마지막 보고 뒤 — 이후 보고 파일 쓰기 없음
    vr__app_close
    [ ${#ioerrs[@]} -eq 0 ] && [ $unl -eq 0 ] && return 1
    return 3
}
