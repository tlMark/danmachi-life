// F1D4A P1 — 공통 드라이버(생애 주 루프의 버튼 선택). 시험 하네스 전용.
// 설계: F1D4A r3.20 00_INDEX §4.1.4. 이 한 소스를 Node 러너(VM)와 Chromium 페이지가 그대로 쓴다.
// 분기 순서는 F1 test_runner.js 주 루프와 같다: 후속 선택 화면이면 'stay' 표식 버튼 고정(난수 0), 그 밖에는 무작위 버튼(HARNESS 지점, Math.random 1회).
// F1D4A P4(F-A2-b, D-REGION §8.5.4): 후속 종류가 'relocate' 이면 stay 고정보다 **먼저** 분기해 표식 버튼 중 하나를 무작위로 고른다(HARNESS-relocate, Math.random 1회).
//   그 밖의 후속 종류는 기존대로 stay 고정·난수 0(C21·C24).
//   RNG 지점 표(tests/lib/rng_sites.js)는 함수 단위 허용 목록이라, 이주 분기의 난수 지점은 별도 함수 driverChooseRelocate 에 둔다(HARNESS-relocate 1곳).
function driverChooseRelocate(usable) {
    const opts = usable.filter(button => button.dataset && (button.dataset.followup === 'relocate' || button.dataset.followup === 'stay'));
    if (opts.length !== 2) return { kind: 'error', button: null, message: 'relocate screen without both options' };
    return { kind: 'followup_relocate', button: opts[Math.floor(Math.random() * opts.length)] };
}
function driverChoose(usable, pendingFollowup) {
    if (pendingFollowup && pendingFollowup.kind === 'relocate') return driverChooseRelocate(usable);
    if (pendingFollowup) {
        const stay = usable.find(button => button.dataset && button.dataset.followup === 'stay');
        if (!stay) return { kind: 'error', button: null, message: 'followup screen without stay option' };
        return { kind: 'followup_stay', button: stay };
    }
    return { kind: 'event', button: usable[Math.floor(Math.random() * usable.length)] };
}
