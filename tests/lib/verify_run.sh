# F1D4A — 검증 스크립트 공통 부품(시험 전용). tests/p1_verify.sh 가 source 해서 쓴다. 게임 코드·F1 기준 파일을 바꾸지 않는다.
# 목적: 항목별 종료 상태를 모으고, **종료 상태를 남기지 못한 항목**(병렬 하위 셸의 강제 종료·비정상 종료, 실행되지 않은 항목)도 실패로 잡는다.
#
#   vr_init <출력 폴더>          로그 폴더·상태 폴더·실행 토큰을 준비한다
#   vr_expect <이름>...          이번 실행에서 반드시 끝나야 하는 항목을 등록한다(실행 전에 전부 등록)
#   run <이름> <명령...>         명령을 실행한다. 출력은 logs/<이름>.log, 종료 상태는 status/<이름>.status 에 따로 남긴다
#   vr_status_code <이름>        검증된 종료 코드를 출력한다(상태 기록이 없거나 손상이면 실패)
#   vr_finish                    등록한 모든 항목의 상태 기록을 직접 대조하고 최종 종료 코드를 돌려준다(0 = 전부 성공)
#
# 설계 원칙
#   - **명령 출력(logs/)은 판정에 쓰지 않는다.** 명령이 "exit=0" 같은 글자를 출력해도, 자식 프로세스가 뒤늦게 로그에 써도 판정과 무관하다.
#   - 종료 상태는 래퍼(run)만 쓰는 전용 파일에 있다. 형식은 정확히 한 줄: "v1 <태그> <이름> <종료 코드>".
#     <태그> = sha256(실행 토큰 ":" 이름). 실행 토큰은 vr_init 이 만들어 셸 변수로만 갖고(내보내지 않음, 파일에 쓰지 않음),
#     명령은 이 값을 알 수 없으므로 상태 기록을 흉내 낼 수 없다.
#   - 상태 기록은 원자적이다: 임시 파일에 다 쓴 뒤 mv(rename)로 한 번에 놓는다. 쓰는 도중이나 직전에 래퍼가 죽으면 status 파일이 없다 → 실패.
#   - 같은 이름의 중복 실행은 mkdir(원자적)로 만든 선점 표식(status/<이름>.claim)으로 막는다. 먼저 만든 쪽만 실행한다.
#   - vr_finish 는 실행 중에 적힌 실패 목록을 믿지 않고, 등록한 모든 항목의 상태 기록을 처음부터 다시 읽어 판정한다.
#
# 실패로 보는 경우(문구는 failed_steps.txt 에 그대로 적힌다)
#   "<이름> exit=N"                             종료 코드가 0 이 아님(신호로 죽은 명령은 128 + 신호 번호)
#   "<이름> 시작되지 않음"                      선점 표식이 없음(호출이 빠졌거나, 앞 항목에서 하위 셸이 죽음)
#   "<이름> 시작했으나 상태 기록 없음"          선점 표식은 있는데 status 가 없음(실행 도중 또는 기록 직전에 래퍼가 죽음)
#   "<이름> 상태 기록 손상"                     status 의 형식·태그·이름·코드가 맞지 않음(위조·잘림 포함)
#   "<이름> 미완료 상태 기록"                   쓰다 만 임시 파일이 남아 있음
#   "<이름> 로그 없음"                          상태는 있는데 로그 파일이 없음
#   "<이름> 등록되지 않은 항목" / "<이름> 중복 실행 시도" / "<이름> 중복 등록" / "<이름> 등록되지 않은 상태 기록" / "<이름> 등록되지 않은 로그"
VR_OUT=""; VR_L=""; VR_ST=""; VR_FAILS=""; VR_EXPECTED=""; VR_TOKEN=""; VR_NOTES=""

vr_init() {
    VR_OUT=$1
    mkdir -p "$VR_OUT/logs" "$VR_OUT/status" || return 2
    VR_L="$VR_OUT/logs"; VR_ST="$VR_OUT/status"; VR_FAILS="$VR_OUT/failed_steps.txt"; VR_EXPECTED="$VR_OUT/expected_steps.txt"; VR_NOTES="$VR_ST/_violations.txt"
    : > "$VR_FAILS" || return 2
    : > "$VR_EXPECTED" || return 2
    : > "$VR_NOTES" || return 2
    VR_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
    [ "${#VR_TOKEN}" -eq 48 ] || return 2
}

vr_expect() { local n; for n in "$@"; do echo "$n" >> "$VR_EXPECTED"; done; }

vr_tag() { printf '%s' "$VR_TOKEN:$1" | sha256sum | cut -d' ' -f1; }

run() {
    local name=$1; shift
    if ! grep -qxF -- "$name" "$VR_EXPECTED"; then echo "$name 등록되지 않은 항목" >> "$VR_NOTES"; return 2; fi
    # 선점: mkdir 는 원자적이라 같은 이름을 동시에 불러도 한쪽만 성공한다
    if ! mkdir "$VR_ST/$name.claim" 2>/dev/null; then echo "$name 중복 실행 시도" >> "$VR_NOTES"; return 2; fi
    "$@" > "$VR_L/$name.log" 2>&1; local code=$?
    # 여기까지 왔다는 것은 래퍼가 명령의 종료를 실제로 확인했다는 뜻이다. 그때에만 상태를 기록한다.
    # 로그 끝의 "exit=N" 줄은 사람이 읽기 위한 표시이며 판정에 쓰지 않는다(이전 출력 형식과 F1 기록 로그 비교의 호환을 위해 유지).
    echo "exit=$code" >> "$VR_L/$name.log"
    declare -F vr_hook_before_status > /dev/null && vr_hook_before_status "$name"     # 시험용 주입 지점(평소에는 정의되지 않음)
    local tmp="$VR_ST/$name.status.tmp.$BASHPID"
    printf 'v1 %s %s %s\n' "$(vr_tag "$name")" "$name" "$code" > "$tmp" || return 2
    declare -F vr_hook_before_commit > /dev/null && vr_hook_before_commit "$name"     # 시험용 주입 지점
    mv -f "$tmp" "$VR_ST/$name.status" || return 2                                    # rename: 한 번에 놓인다
    return $code
}

# 상태 기록을 검증해 종료 코드를 출력한다. 반환: 0 = 유효(코드를 출력), 1 = 없음, 2 = 손상
vr_status_code() {
    local name=$1 f="$VR_ST/$1.status" line
    [ -f "$f" ] || return 1
    [ "$(wc -l < "$f")" -eq 1 ] || return 2
    line=$(cat "$f")
    case "$line" in "v1 $(vr_tag "$name") $name "*) ;; *) return 2 ;; esac
    local code=${line##* }
    printf '%s' "$code" | grep -qE '^(0|[1-9][0-9]{0,2})$' || return 2
    [ "$code" -le 255 ] || return 2
    [ "$line" = "v1 $(vr_tag "$name") $name $code" ] || return 2
    printf '%s\n' "$code"
}

vr_finish() {
    local name code rc f base n total
    : > "$VR_FAILS"                      # 실행 중에 적힌 내용을 믿지 않고 처음부터 다시 만든다
    : > "$VR_OUT/step_status.txt"
    while IFS= read -r name; do
        [ -n "$name" ] || continue
        if [ "$(grep -cxF -- "$name" "$VR_EXPECTED")" -ne 1 ]; then echo "$name 중복 등록" >> "$VR_FAILS"; fi
        if ls "$VR_ST/$name.status.tmp."* > /dev/null 2>&1; then echo "$name 미완료 상태 기록" >> "$VR_FAILS"; fi
        code=$(vr_status_code "$name"); rc=$?
        if [ $rc -eq 1 ]; then
            if [ -d "$VR_ST/$name.claim" ]; then echo "$name 시작했으나 상태 기록 없음" >> "$VR_FAILS"; else echo "$name 시작되지 않음" >> "$VR_FAILS"; fi
            echo "$name -" >> "$VR_OUT/step_status.txt"; continue
        fi
        if [ $rc -ne 0 ]; then echo "$name 상태 기록 손상" >> "$VR_FAILS"; echo "$name ?" >> "$VR_OUT/step_status.txt"; continue; fi
        echo "$name $code" >> "$VR_OUT/step_status.txt"
        [ -d "$VR_ST/$name.claim" ] || echo "$name 상태 기록 손상" >> "$VR_FAILS"     # 선점 없이 상태만 있음
        [ -f "$VR_L/$name.log" ] || echo "$name 로그 없음" >> "$VR_FAILS"
        [ "$code" -eq 0 ] || echo "$name exit=$code" >> "$VR_FAILS"
    done < "$VR_EXPECTED"
    for f in "$VR_ST"/*.status "$VR_ST"/*.claim "$VR_ST"/*.status.tmp.*; do
        [ -e "$f" ] || continue
        base=$(basename "$f"); base=${base%%.status*}; base=${base%.claim}
        grep -qxF -- "$base" "$VR_EXPECTED" || echo "$base 등록되지 않은 상태 기록" >> "$VR_FAILS"
    done
    for f in "$VR_L"/*.log; do
        [ -e "$f" ] || continue
        base=$(basename "$f" .log)
        [ "$base" = "99_done" ] && continue
        grep -qxF -- "$base" "$VR_EXPECTED" || echo "$base 등록되지 않은 로그" >> "$VR_FAILS"
    done
    cat "$VR_NOTES" >> "$VR_FAILS"       # 실행 중 위반(등록 밖 이름, 중복 실행 시도)
    sort -u "$VR_FAILS" -o "$VR_FAILS"
    n=$(wc -l < "$VR_FAILS"); total=$(grep -c . "$VR_EXPECTED")
    if [ "$n" -eq 0 ] && [ "$total" -gt 0 ]; then echo "ALL_DONE: 모든 항목 종료 코드 0 ($total 개 항목)" > "$VR_L/99_done.log"; return 0; fi
    { echo "FAILED_STEPS: $n (등록 항목 $total 개)"; cat "$VR_FAILS"; } > "$VR_L/99_done.log"
    cat "$VR_L/99_done.log"
    return 1
}
