// F1D4A P1 — Chromium 페이지 어댑터(공통 드라이버를 실제 페이지에서 돌린다). 시험 하네스 전용.
// 설계: F1D4A r3.20 00_INDEX §4.1.4. 이 파일 앞에 rng_core.js · rng_sites.js · commit_queue.js · driver_core.js 를 이어 붙여 한 스크립트로 주입한다.
// 게임 스크립트보다 먼저 실행되어 Math.random 을 기록기로 바꾼다. 게임 코드는 건드리지 않는다. Playwright 쪽 난수는 쓰지 않는다.
(function () {
    const H = window.__F1D4A = { preConfigCalls: 0 };
    const nativeRandom = Math.random;
    let rng = null, tally = null, classify = null, cfg = null, queue = null;
    let events = [], lifeDigest = 2166136261, rngCallDigest = 2166136261, rngCallsTotal = 0, lives = 0;
    const recordedRandom = function recordedRandom() {
        if (!rng) { H.preConfigCalls += 1; return nativeRandom.call(Math); }   // 설정 전 호출(있으면 안 됨. 실행 전에 0 인지 확인한다)
        const stack = new Error().stack;
        tally.note(classify(stack), stack);
        return rng();
    };
    Math.random = recordedRandom;
    H.configure = function (c) {
        cfg = c;
        Error.stackTraceLimit = c.stackTraceLimit;
        rng = createRng(c.seed);
        if (c.startState) rng.setState(c.startState);   // Node 러너의 주 루프 시작 시점과 같은 난수 상태에서 시작한다(F1 러너는 단위 시험 단계 뒤에 주 루프를 돈다)
        tally = RngSites.makeTally();
        tally.keepIds = !!c.keepIds;
        const locate = function (fr) {
            if (!fr || typeof fr.file !== 'string') return { area: 'unknown', reason: 'no-file' };
            if (c.load === 'file') {   // 파일별 주소가 스택에 그대로 나온다(역변환 불필요)
                if (fr.file === c.harnessUrl) return { area: 'harness', file: 'harness', line: fr.line, col: fr.col };
                if (fr.file.indexOf(c.baseUrl) === 0) { const rel = fr.file.slice(c.baseUrl.length); if (c.sourceFiles.indexOf(rel) >= 0) return { area: 'source', file: rel, line: fr.line, col: fr.col }; }
                return { area: 'unknown', reason: 'other-file' };
            }
            if (fr.file !== c.docUrl) return { area: 'unknown', reason: 'other-file' };   // 'inline'(한 문서) · 'vm'(Node 조립 문자열): 조각 표로 역변환
            const m = RngSites.mapPosition(c.asm, fr.line, fr.col);
            return m.area === 'harness' ? { area: 'harness', file: 'harness', line: m.line, col: m.col } : m;
        };
        classify = RngSites.makeClassifier({ sites: c.sites, dropFrames: 1, locate });
        queue = createCommitQueue(function (x) { x.events.push(x.id); });
        const originalShowEvent = showEvent;
        showEvent = function (event) {
            return queue.run(
                () => ({ id: event.id, events, halted: typeof progressHalted !== 'undefined' && progressHalted === true }),
                () => originalShowEvent(event),
                (r, cap) => showEventDisposition(r, cap.halted) === 'discard' ? { kind: 'discard', reason: String(r) } : { kind: 'commit', id: cap.id, events: cap.events });
        };
        return { mathRandomIsRecorder: Math.random === recordedRandom, preConfigCalls: H.preConfigCalls, rngState: rng.getState(),
            sources: { driverChoose: String(driverChoose), createRng: String(createRng) } };   // 실제로 페이지에서 실행되는 공통 소스(해시 비교용)
    };
    // n 생애를 돌린다. 주 루프는 Node 러너와 같다: 버튼 수집 → driverChoose → onclick → 행동 상한 검사. 자동 진행은 켜지 않는다(타이머 미사용).
    H.runLives = function (n) {
        for (let i = 0; i < n; i++) {
            events = [];
            const callsAtStart = rng.calls();
            tally.lifeStart();
            startLife();
            let actions = 0;
            while (!S.cause && actions < cfg.maxActions) {
                const usable = Array.from(document.getElementById('choices').children).filter(button => typeof button.onclick === 'function');
                if (usable.length === 0) throw new Error('simulation stalled: no actionable choice at age ' + S.age + ', job=' + S.job);
                const pick = driverChoose(usable, S.pendingFollowup);
                if (pick.kind === 'error') throw new Error(pick.message + ' at age ' + S.age + ', job=' + S.job);
                pick.button.onclick();
                actions += 1;
            }
            if (!S.cause) throw new Error('life exceeded action guard (' + cfg.maxActions + ')');
            tally.lifeEnd();
            queue.checkBoundary('life');
            const lifeCalls = rng.calls() - callsAtStart;
            rngCallDigest = RngSites.fnv(rngCallDigest, String(lifeCalls)); rngCallsTotal += lifeCalls;
            lifeDigest = RngSites.fnv(lifeDigest, JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause, events.join(',')]));
            lives += 1;
        }
        return lives;
    };
    // 타이머 차이 시험(TM)용: 생애 하나를 바깥에서 시작·종료한다(자동 진행을 켠 경우 게임이 스스로 진행한다).
    H.beginLife = function () { events = []; tally.lifeStart(); H.callsAtStart = rng.calls(); };
    H.finishLife = function () {
        const done = tally.lifeEnd();
        const boundaryOk = queue.checkBoundary('life');
        return { events: events.slice(), siteIds: done && done.ids ? done.ids.slice() : null, calls: rng.calls() - H.callsAtStart, boundaryOk,
            summary: JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause]) };
    };
    H.rngCalls = function () { return rng.calls(); };
    H.report = function () {
        return { lives, lifeDigest, rngCallDigest, rngCallsTotal, rngCalls: rng ? rng.calls() : null, tally: tally ? tally.report() : null, integrity: queue ? queue.integrity() : null,
            mathRandomIsRecorder: Math.random === recordedRandom, preConfigCalls: H.preConfigCalls,
            progressHalted: typeof progressHalted !== 'undefined' ? progressHalted : null, autoChecked: !!(document.getElementById('auto') && document.getElementById('auto').checked) };
    };
})();
