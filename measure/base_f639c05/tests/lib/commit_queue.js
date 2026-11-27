// F1D4A P1 — 순서 보장 반영 큐. 시험 하네스 전용.
// 설계: F1D4A r3.20 00_INDEX §E-1.3 "하네스 계측 규칙"(캡처 → 호출 → 반영/폐기, wrapperSeq · nextCommitSeq · done · drainSafe · harnessBroken).
// 규칙 1: seq 가 발급되면 정상 반영 또는 폐기 중 하나로 반드시 완료 등록한다(finally).
// 규칙 2: 캡처·분류 단계의 예외는 하네스 무결성 오류다. 원래 함수의 예외는 게임 쪽 예외이므로 그대로 다시 던지고 seq 는 폐기 등록한다.
// 규칙 3: 반영(applyCommit) 중 예외가 나면 그 seq 를 완료로 기록하지 않고 harnessBroken 으로 표시한다. 이후에는 아무것도 반영하지 않는다(완료 등록만 계속).
function createCommitQueue(applyCommit) {
    const q = { wrapperSeq: 0, nextCommitSeq: 1, done: new Map(), harnessBroken: false, firstError: null, committed: 0, discarded: 0 };
    q.markHarnessBroken = function (reason, seq, error) {
        if (q.harnessBroken) return;
        q.harnessBroken = true;
        q.firstError = { reason, seq, message: String(error && error.message || error) };
    };
    q.drainSafe = function () {
        if (q.harnessBroken) return;                       // 무효가 된 실행은 더 반영하지 않는다
        while (q.done.has(q.nextCommitSeq)) {
            const seq = q.nextCommitSeq, x = q.done.get(seq);
            if (x.kind === 'commit') {
                try { applyCommit(x); } catch (e) { q.markHarnessBroken('commit_failed', seq, e); return; }   // nextCommitSeq 를 올리지 않는다
                q.committed += 1;
            } else q.discarded += 1;
            q.done.delete(seq);
            q.nextCommitSeq = seq + 1;
        }
    };
    // capture(): 호출 전 캡처(지역 객체만 만든다) / call(): 원래 함수 / classify(r, cap): { kind: 'commit', ... } 또는 { kind: 'discard', reason }
    q.run = function (capture, call, classify) {
        const seq = ++q.wrapperSeq;                        // 이 문장 이후 어떤 예외도 seq 를 미완료로 남기지 않는다
        let rec = null, phase = 'capture';
        try {
            const cap = capture();
            phase = 'call';
            const r = call();
            phase = 'classify';
            rec = classify(r, cap);
            return r;
        } catch (e) {
            rec = { kind: 'discard', reason: 'error:' + phase, error: true };
            if (phase !== 'call') q.markHarnessBroken('wrapper_' + phase + '_failed', seq, e);   // 하네스 자체 결함
            throw e;
        } finally {
            if (!rec) rec = { kind: 'discard', reason: 'incomplete' };   // 방어(정상 흐름에서는 없음)
            q.done.set(seq, rec);                          // 반드시 완료 등록
            q.drainSafe();                                 // 순서 보장 반영
        }
    };
    // 생애 경계·합성 시험 블록 끝에서 부른다. 큐가 비지 않았으면 하네스 오류로 표시한다.
    q.checkBoundary = function (where) {
        if (q.harnessBroken) return false;
        if (q.done.size !== 0 || q.nextCommitSeq !== q.wrapperSeq + 1) { q.markHarnessBroken('commit_queue_not_drained:' + where, q.nextCommitSeq, new Error('pending=' + q.done.size)); return false; }
        return true;
    };
    q.integrity = function () { return { broken: q.harnessBroken, firstError: q.firstError, seq: q.firstError ? q.firstError.seq : null, issued: q.wrapperSeq, committed: q.committed, discarded: q.discarded }; };
    return q;
}
// showEvent 반환값 분류(러너와 Chromium 페이지 어댑터가 함께 쓴다).
//   true      → 'commit'        정상 표시
//   false     → 'discard'       보이는 선택지 0개(엔진 단계에서 생기는 반환값)
//   undefined → 'discard'       호출 시작 시 정지 상태였을 때
//   undefined → 'commit-legacy' 정지 상태가 아니었을 때. F1 의 showEvent 는 정상 표시에도 반환값이 없기 때문이다(엔진 단계에서 true 로 바뀌면 쓰이지 않는다).
function showEventDisposition(r, haltedAtCall) {
    if (r === true) return 'commit';
    if (r === undefined && !haltedAtCall) return 'commit-legacy';
    return 'discard';
}
if (typeof module === 'object' && module && module.exports) module.exports = { createCommitQueue, showEventDisposition };
