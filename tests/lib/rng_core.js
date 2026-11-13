// F1D4A P1 — 시험용 난수 생성기(rng_core). 시험 하네스 전용.
// F1 test_runner.js 의 createRng 를 그대로 옮긴 것이다(내용 변경 없음). Node 러너와 Chromium 측정이 이 한 소스를 쓴다(설계 r3.20 00_INDEX §4.1.4).
function createRng(seed) {
    let state = seed >>> 0;
    let calls = 0;   // v1.7.8-2i(V1·Q19): 호출 카운터. 테스트 러너 전용 계측, 게임 코드에는 없음.
    const random = function random() {
        calls += 1;
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    // 단위 테스트가 본 시뮬레이션의 난수열을 소비하지 않도록 상태를 저장/복원할 수 있다.
    random.getState = () => ({ state, calls });
    random.setState = value => { state = value.state; calls = value.calls; };
    random.calls = () => calls;
    return random;
}
if (typeof module === 'object' && module && module.exports) module.exports = { createRng };
