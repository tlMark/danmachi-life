# F1D4A — 검증 스크립트 공통 부품(시험 전용). tests/p1_verify.sh 가 source 해서 쓴다. 게임 코드·F1 기준 파일을 바꾸지 않는다.
# 목적: 항목별 종료 코드를 모으고, **기록을 남기지 못한 항목**(병렬 하위 셸의 강제 종료·비정상 종료, 실행되지 않은 항목)도 실패로 잡는다.
#
#   vr_init <출력 폴더>          로그 폴더와 기록 파일을 준비한다
#   vr_expect <이름>...          이번 실행에서 반드시 끝나야 하는 항목을 등록한다(실행 전에 전부 등록)
#   run <이름> <명령...>         명령을 실행해 <출력 폴더>/logs/<이름>.log 에 출력과 "exit=N" 을 남긴다
#   vr_finish                    등록한 모든 항목의 기록을 대조하고 최종 종료 코드를 돌려준다(0 = 전부 성공)
#
# 실패로 보는 경우
#   (1) 명령의 종료 코드가 0 이 아님(신호로 죽은 명령은 128 + 신호 번호로 기록된다)
#   (2) 등록한 항목의 로그 파일이 없음            — 항목이 시작되지 못했다(앞 항목에서 하위 셸이 죽었거나 호출이 빠짐)
#   (3) 로그의 마지막 줄이 "exit=N" 이 아님        — 항목이 도중에 끊겼다(run 을 돌리던 셸이 강제 종료됨)
#   (4) 등록하지 않은 이름으로 run 을 부름, 같은 항목을 두 번 실행함, 등록하지 않은 로그가 있음
VR_OUT=""; VR_L=""; VR_FAILS=""; VR_EXPECTED=""

vr_init() {
    VR_OUT=$1
    mkdir -p "$VR_OUT/logs" || return 2
    VR_L="$VR_OUT/logs"; VR_FAILS="$VR_OUT/failed_steps.txt"; VR_EXPECTED="$VR_OUT/expected_steps.txt"
    : > "$VR_FAILS" || return 2
    : > "$VR_EXPECTED" || return 2
}

vr_expect() { local n; for n in "$@"; do echo "$n" >> "$VR_EXPECTED"; done; }

run() {
    local name=$1; shift
    if ! grep -qxF -- "$name" "$VR_EXPECTED"; then echo "$name 등록되지 않은 항목" >> "$VR_FAILS"; return 2; fi
    if [ -e "$VR_L/$name.log" ]; then echo "$name 같은 항목을 두 번 실행" >> "$VR_FAILS"; return 2; fi
    "$@" > "$VR_L/$name.log" 2>&1; local code=$?
    echo "exit=$code" >> "$VR_L/$name.log"
    if [ "$code" -ne 0 ]; then echo "$name exit=$code" >> "$VR_FAILS"; fi
    return $code
}

vr_finish() {
    local name last f base
    while IFS= read -r name; do
        [ -n "$name" ] || continue
        if [ "$(grep -cxF -- "$name" "$VR_EXPECTED")" -ne 1 ]; then echo "$name 항목이 중복 등록됨" >> "$VR_FAILS"; fi
        if [ ! -f "$VR_L/$name.log" ]; then echo "$name 기록 없음(시작되지 않았거나 그 전에 중단됨)" >> "$VR_FAILS"; continue; fi
        last=$(tail -n 1 "$VR_L/$name.log")
        if ! printf '%s\n' "$last" | grep -qE '^exit=[0-9]+$'; then echo "$name 종료 코드 없음(도중에 중단됨)" >> "$VR_FAILS"; fi
    done < "$VR_EXPECTED"
    for f in "$VR_L"/*.log; do
        [ -e "$f" ] || continue
        base=$(basename "$f" .log)
        [ "$base" = "99_done" ] && continue
        grep -qxF -- "$base" "$VR_EXPECTED" || echo "$base 등록되지 않은 로그" >> "$VR_FAILS"
    done
    sort -u "$VR_FAILS" -o "$VR_FAILS"
    local n total
    n=$(wc -l < "$VR_FAILS"); total=$(grep -c . "$VR_EXPECTED")
    if [ "$n" -eq 0 ] && [ "$total" -gt 0 ]; then echo "ALL_DONE: 모든 항목 종료 코드 0 ($total 개 항목)" > "$VR_L/99_done.log"; return 0; fi
    { echo "FAILED_STEPS: $n (등록 항목 $total 개)"; cat "$VR_FAILS"; } > "$VR_L/99_done.log"
    cat "$VR_L/99_done.log"
    return 1
}
