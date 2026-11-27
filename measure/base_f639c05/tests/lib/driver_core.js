// F1D4A P1 — 공통 드라이버(생애 주 루프의 버튼 선택). 시험 하네스 전용.
// 설계: F1D4A r3.20 00_INDEX §4.1.4. 이 한 소스를 Node 러너(VM)와 Chromium 페이지가 그대로 쓴다.
// 분기 순서는 F1 test_runner.js 주 루프와 같다: 후속 선택 화면이면 'stay' 표식 버튼 고정(난수 0), 그 밖에는 무작위 버튼(HARNESS 지점, Math.random 1회).
// (설계의 `relocate` 분기는 F-A2 구현 단계에서 추가한다. 지금은 그 후속 종류가 게임에 없다.)
function driverChoose(usable, pendingFollowup) {
    if (pendingFollowup) {
        const stay = usable.find(button => button.dataset && button.dataset.followup === 'stay');
        if (!stay) return { kind: 'error', button: null, message: 'followup screen without stay option' };
        return { kind: 'followup_stay', button: stay };
    }
    return { kind: 'event', button: usable[Math.floor(Math.random() * usable.length)] };
}
