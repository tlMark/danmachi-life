'use strict';
// GA-INV-2 측정 모듈(측정 사본 전용, 게임 코드 아님). 설계: REVIEW v42 §4.2zl · v46 §4.2zp · v47 §4.2zq · v48 §4.2zr · v49 §4.2zs, 구현 판본 GA-INV-2-impl-1.
// 이 파일은 measure/ast_check.js 의 허용 사이트 표(같은 판본)로 정적 검사한다. 코드를 바꾸면 표를 다시 맞춰야 검사를 통과한다(A5).
// 최상위: 선언과 허용 초기화식(리터럴 · Object.freeze(리터럴) · Symbol.for(문자열) · Object.create(null))만 둔다. EE 쓰기는 init 의 설치 1곳·복원 1곳뿐이다.
// process 속성은 직접 읽지 않는다. exit 리스너 등록은 감시 래퍼를 Reflect.apply 로 PROC 에 적용해 한다(R5 해결: PROC.on 직접 읽기 없음).
const WATCH = Object.freeze(['on', 'once', 'addListener', 'prependListener', 'prependOnceListener', 'off', 'removeListener', 'removeAllListeners', 'setMaxListeners']);
const SHADOW = Object.freeze(['on', 'once', 'addListener', 'prependListener', 'prependOnceListener', 'off', 'removeListener', 'removeAllListeners', 'setMaxListeners', 'emit', 'listeners', 'listenerCount']);
const INIT_KEY = Symbol.for('danmachi.measure.init');
const MARK_BRAND = 'danmachi.measure.v1';
const OWN_TOKEN = Object.freeze({ brand: 'danmachi.measure.v1' });
const WRAPPERS = Object.create(null);
const M_ = { C: 0, H: 0, P: 0, F: 0, X: 0, A: 0,
    Xcode: { screen_state_mismatch: 0, screen_state_check_exception: 0 },
    Acode: { origin: 0, nested_propagation: 0, unmarked_return: 0 },
    E: { F: 0, X: 0 } };
let INIT_CALLS = 0;
let WATCH_ON = false;
let RD_apply = null, RD_gopd = null, RD_gpo = null;
let fs = null, EE = null, PROC = null, RD_listeners = null, RD_count = null, RD_emit = null;
let mutTotal = 0, mutDone = 0, wDepth = 0, reentrantMut = 0;
let att = 0, okCount = 0, depth = 0, maxDepth = 0, postSeal = 0, faultCount = 0;
let phase = 'running';
let current = null;
let finishing = false, w1 = 0, FINISH_CALLS = 0;
let PRE = null, SEAL = null, REPORT_PATH = null;
let HOOK_NEW0 = null, HOOK_RM0 = null;   // C5a 기준선: init 시점의 newListener·removeListener 리스너 목록(Node 가 시작 시 등록한 내장 리스너 포함)

// 두 배열의 길이와 원소 동일성이 같은가.
function sameFns(a, b) {
    if (a === null || b === null || a.length !== b.length) return false;
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return false;
    return true;
}

// 서술자의 자기 속성으로 데이터 속성을 판정한다(R5: 'value' in d 를 쓰지 않는다).
function isData(d) {
    return d !== undefined && RD_gopd(d, 'value') !== undefined;
}

// 원본을 인자로 고정한 감시 래퍼(래퍼마다 별도 닫힘). 비활성이면 계수·깊이 변경 없이 위임만 한다.
function makeWrapper(orig) {
    return function (...args) {
        if (!WATCH_ON) return RD_apply(orig, this, args);
        const target = (this === PROC);
        if (target) { mutTotal += 1; if (wDepth > 0) reentrantMut += 1; }
        wDepth += 1;
        try { const r = RD_apply(orig, this, args); if (target) mutDone += 1; return r; }
        finally { wDepth -= 1; }
    };
}

// G2′ 선점 확인 · G3a 정의 성공 · G3b 소유권 확인. 반환: null(통과) 또는 inactive_unknown 사유.
function markerGuard() {
    const pre = RD_gopd(globalThis, INIT_KEY);
    if (pre !== undefined) {
        let likely = false;
        try {
            if (isData(pre)) {
                const v = pre.value;
                if (v !== null && typeof v === 'object') {
                    const b = RD_gopd(v, 'brand');
                    likely = isData(b) && b.value === MARK_BRAND;
                }
            }
        } catch (_) { likely = false; }
        return likely ? 'other_instance_likely' : 'foreign_marker_unknown';
    }
    let defined = false;
    try { defined = Reflect.defineProperty(globalThis, INIT_KEY, { value: OWN_TOKEN, writable: false, enumerable: false, configurable: false }); }
    catch (_) { defined = false; }
    if (defined !== true) return 'marker_define_failed';
    const mk = RD_gopd(globalThis, INIT_KEY);
    if (!isData(mk)) return 'marker_ownership_unconfirmed';
    if (mk.value !== OWN_TOKEN || mk.writable !== false || mk.configurable !== false) return 'marker_ownership_unconfirmed';
    return null;
}

// K1′ · K2 · K3 적극적 확인. 예외면 거짓.
function provenClean(attempted, ORIG_OF, guardPassed) {
    try {
        if (guardPassed !== true) return false;
        if (attempted.length === 0) return WATCH_ON === false;
        for (const name of WATCH) {
            if (typeof ORIG_OF[name] !== 'function') return false;
            const d = RD_gopd(EE, name);
            if (!isData(d) || d.value !== ORIG_OF[name]) return false;
        }
        for (let i = 0; i < WATCH.length; i++) {
            for (let j = i + 1; j < WATCH.length; j++) {
                const di = RD_gopd(EE, WATCH[i]), dj = RD_gopd(EE, WATCH[j]);
                if (!isData(di) || !isData(dj)) return false;
                if ((di.value === dj.value) !== (ORIG_OF[WATCH[i]] === ORIG_OF[WATCH[j]])) return false;
            }
        }
        return true;
    } catch (_) { return false; }
}

// init(): 한 프로세스에서 한 번. 예외를 내보내지 않는다. 반환 { state, reason }.
function init() {
    const ORIG_OF = Object.create(null);
    const attempted = [], installed = [];
    let reason = null, allVerified = false, stage = 0, guardPassed = false;
    try {
        INIT_CALLS += 1;                                                       // G1
        if (INIT_CALLS !== 1) return Object.freeze({ state: 'inactive_unknown', reason: 'reinit_rejected' });
        RD_apply = Reflect.apply;
        RD_gopd = Reflect.getOwnPropertyDescriptor;
        RD_gpo = Reflect.getPrototypeOf;
        if (typeof RD_apply !== 'function' || typeof RD_gopd !== 'function' || typeof RD_gpo !== 'function') throw 'ref_capture_failed';
        const g = markerGuard();                                               // G2′ · G3a · G3b
        if (g !== null) return Object.freeze({ state: 'inactive_unknown', reason: g });
        if (WATCH_ON !== false) return Object.freeze({ state: 'inactive_unknown', reason: 'watch_on_unexpected' });   // G4
        guardPassed = true;
        fs = require('fs');
        EE = require('events').EventEmitter.prototype;
        PROC = process;
        const dl = RD_gopd(EE, 'listeners'), dc = RD_gopd(EE, 'listenerCount'), de = RD_gopd(EE, 'emit');   // 읽기 API: 서술자 경유
        if (!isData(dl) || !isData(dc) || !isData(de)) throw 'read_api_not_data';
        RD_listeners = dl.value;
        RD_count = dc.value;
        RD_emit = de.value;
        HOOK_NEW0 = RD_apply(RD_listeners, PROC, ['newListener']);            // C5a 기준선(설치 전)
        HOOK_RM0 = RD_apply(RD_listeners, PROC, ['removeListener']);
        stage = 1;                                                             // 1단계: 원본 9개 모두 읽기·확인
        for (const name of WATCH) {
            const d = RD_gopd(EE, name);
            if (!isData(d) || typeof d.value !== 'function') throw 'orig_invalid:' + name;
            ORIG_OF[name] = d.value;
        }
        stage = 2;                                                             // 2단계: 이름별 설치(대입 직전에 attempted 등록)
        for (const name of WATCH) {
            const w = makeWrapper(ORIG_OF[name]);
            WRAPPERS[name] = w;
            attempted.push(name);
            EE[name] = w;
            const d = RD_gopd(EE, name);
            if (!isData(d) || d.value !== w) throw 'install_failed:' + name;
            installed.push(name);
        }
        stage = 3;                                                             // 3단계: 전수 재확인
        let allOk = installed.length === WATCH.length && new Set(WATCH.map(n => WRAPPERS[n])).size === WATCH.length;
        for (const name of WATCH) { const d = RD_gopd(EE, name); if (!isData(d) || d.value !== WRAPPERS[name]) allOk = false; }
        if (!allOk) throw 'verify_failed';
        allVerified = true;
        WATCH_ON = true;                                                       // 활성화: 유일한 참 대입
    } catch (e) {
        if (!guardPassed) return Object.freeze({ state: 'inactive_unknown', reason: (typeof e === 'string') ? e : 'guard_exception' });
        reason = (typeof e === 'string') ? e : ('exception_at_stage_' + stage);
        for (const name of attempted) {                                        // 시도한 이름 전부 복원 시도(이름별 try). 데이터 속성일 때만 쓴다
            try {
                const d0 = RD_gopd(EE, name);
                if (isData(d0) && d0.value !== ORIG_OF[name]) EE[name] = ORIG_OF[name];
            } catch (_) { faultCount += 1; }
        }
    }
    let state = 'inactive_residual';
    if (WATCH_ON === true && allVerified && installed.length === WATCH.length) state = 'active';
    else if (provenClean(attempted, ORIG_OF, guardPassed)) state = 'inactive_clean';
    return Object.freeze({ state: state, reason: reason });
}

// C5a · C5b · C5c · C5f. C5a(구현 판본 정정): init 시점 기준선과 newListener·removeListener 리스너 목록이 같다(개수·함수 동일성).
//   설계 원안의 "개수 0" 은 Node v22.23.4 가 시작 시 두 이벤트에 내장 리스너를 2개씩 등록하므로 실제 환경에서 성립하지 않는다(구현 중 확인).
function envCheck() {
    const hookFree = sameFns(RD_apply(RD_listeners, PROC, ['newListener']), HOOK_NEW0) && sameFns(RD_apply(RD_listeners, PROC, ['removeListener']), HOOK_RM0);
    let chainClean = true;
    let o = PROC;
    while (o !== null && o !== EE) {
        for (const n of SHADOW) if (RD_gopd(o, n) !== undefined) chainClean = false;
        o = RD_gpo(o);
    }
    if (o !== EE) chainClean = false;
    let watchIntact = true;
    for (const name of WATCH) { const d = RD_gopd(EE, name); if (!isData(d) || d.value !== WRAPPERS[name]) watchIntact = false; }
    const dl = RD_gopd(EE, 'listeners'), dc = RD_gopd(EE, 'listenerCount'), de = RD_gopd(EE, 'emit');
    const readIntact = isData(dl) && dl.value === RD_listeners && isData(dc) && dc.value === RD_count && isData(de) && de.value === RD_emit;
    return { hookFree: hookFree, chainClean: chainClean, watchIntact: watchIntact, readIntact: readIntact };
}

// 저장 1건, 쓰기 후 읽기 검증, 던지지 않는다. obj 는 M_ · M_.Xcode · M_.Acode · M_.E 중 하나(자기 데이터 속성만 있는 객체 리터럴).
function safeInc(obj, key) {
    if (phase !== 'running') { postSeal += 1; return; }
    att += 1;
    try {
        const before = obj[key];
        if (!Number.isSafeInteger(before)) throw 0;
        obj[key] = before + 1;
        if (obj[key] !== before + 1) throw 0;
        okCount += 1;
    } catch (_) { faultCount += 1; }
}

// endLife 래퍼. 게임 예외는 같은 객체로 다시 던지고 반환값을 그대로 돌려준다.
function wrapEndLife(endLifeBody) {
    if (WATCH_ON !== true) return function endLifePassthrough() { return endLifeBody({ outcome: null, xCode: null }); };
    return function endLife() {
        if (phase !== 'running') { postSeal += 1; return endLifeBody({ outcome: null, xCode: null }); }
        if (finishing) w1 += 1;
        const call = { outcome: null, xCode: null, aCode: null, returned: false, parent: current, inflight: null, inflightSet: false };
        if (call.parent !== null) { call.parent.inflight = null; call.parent.inflightSet = false; }
        current = call;
        depth += 1;
        if (depth > maxDepth) maxDepth = depth;
        safeInc(M_, 'C');
        try {
            const r = endLifeBody(call);
            call.returned = true;
            return r;
        } catch (e) {
            if (call.outcome === 'F' || call.outcome === 'X') safeInc(M_.E, call.outcome);
            else call.aCode = (call.inflightSet && e === call.inflight) ? 'nested_propagation' : 'origin';
            if (call.parent !== null) { call.parent.inflight = e; call.parent.inflightSet = true; }
            throw e;
        } finally {
            let k = 'A';
            if (call.outcome === 'H' || call.outcome === 'P' || call.outcome === 'F' || call.outcome === 'X') k = call.outcome;
            safeInc(M_, k);
            if (k === 'A') safeInc(M_.Acode, call.returned ? 'unmarked_return' : (call.aCode === 'nested_propagation' ? 'nested_propagation' : 'origin'));
            if (call.xCode === 'screen_state_mismatch' || call.xCode === 'screen_state_check_exception') safeInc(M_.Xcode, call.xCode);
            depth -= 1;
            current = call.parent;
        }
    };
}

// 계수 무결성 판정(소유 지점 1).
function seal() {
    if (phase !== 'running') return { verdict: 'invalid:resealed', snap: null };
    phase = 'sealing';
    let verdict = 'invalid:check_not_completed', snap = null;
    try {
        if (depth !== 0) verdict = 'invalid:sealed_while_active';
        else {
            const s = [M_.C, M_.H, M_.P, M_.F, M_.X, M_.A, M_.Acode.origin, M_.Acode.nested_propagation, M_.Acode.unmarked_return];
            snap = s.slice();
            let allInt = true;
            for (const v of s) if (!Number.isSafeInteger(v)) allInt = false;
            if (att !== okCount) verdict = 'invalid:store_failed';
            else if (!allInt) verdict = 'invalid:counter_type';
            else if (s[0] !== s[1] + s[2] + s[3] + s[4] + s[5]) verdict = 'invalid:identity';
            else if (s[5] !== s[6] + s[7] + s[8]) verdict = 'invalid:identity_acode';
            else if (s[8] !== 0) verdict = 'invalid:unmarked_return';
            else verdict = 'valid';
        }
    } catch (_) { verdict = 'invalid:check_exception'; }
    phase = 'sealed';
    return { verdict: verdict, snap: snap };
}

// 러너가 vm 실행 직후·게임 결과 출력 전에 1회 호출(F0~F4, 동기).
function finishMeasurement(reportPath) {
    FINISH_CALLS += 1;
    if (WATCH_ON !== true || FINISH_CALLS !== 1 || typeof reportPath !== 'string') return false;
    REPORT_PATH = reportPath;
    let env0 = null, a0 = -1, r0 = -1, d0 = -1, a1 = -1, r1 = -1, d1 = -1, regThrew = false, regOK = false, Lseal = null;
    finishing = true;
    w1 = 0;
    try {
        env0 = envCheck();                                                     // F0
        a0 = mutTotal; r0 = reentrantMut; d0 = mutDone;
        try { RD_apply(WRAPPERS.on, PROC, ['exit', M]); } catch (_) { regThrew = true; }   // F1: 감시 래퍼 경유 등록(process 속성 읽기 없음)
        a1 = mutTotal; r1 = reentrantMut; d1 = mutDone;
        const ls = RD_apply(RD_listeners, PROC, ['exit']);                     // F2
        const i = ls.indexOf(M);
        regOK = !regThrew && i >= 0 && i === ls.length - 1 && ls.lastIndexOf(M) === i;
        Lseal = ls.slice();
    } catch (_) { regOK = false; }
    const m1 = mutTotal;                                                       // F3
    const wv = w1;
    finishing = false;
    PRE = { env0: env0, a0: a0, r0: r0, d0: d0, a1: a1, r1: r1, d1: d1, m1: m1, w1: wv, regThrew: regThrew, regOK: regOK, Lseal: Lseal };
    SEAL = seal();                                                             // F4
    return true;
}

// exit 리스너(소유 지점 2, 동기 1회). process.exitCode · process.exit 에 손대지 않는다.
function M() {
    try {
        let verdict = 'invalid:finish_not_run';
        let conds = null;
        if (PRE !== null && SEAL !== null) {
            const p = PRE;
            const env = envCheck();
            const ls = RD_apply(RD_listeners, PROC, ['exit']);
            const sameList = sameFns(ls, p.Lseal);
            const checks = [
                { k: 'C5g', ok: WATCH_ON === true, r: 'invalid:init_incomplete' },
                { k: 'L2', ok: !p.regThrew, r: 'invalid:l2_register_failed' },
                { k: 'C1', ok: p.regOK && p.Lseal !== null && p.Lseal[p.Lseal.length - 1] === M, r: 'invalid:l2_not_last' },
                { k: 'C5a', ok: p.env0 !== null && p.env0.hookFree && env.hookFree, r: 'invalid:hook_present' },
                { k: 'C5b', ok: p.env0 !== null && p.env0.chainClean && env.chainClean, r: 'invalid:shadowed_method' },
                { k: 'C5c', ok: p.env0 !== null && p.env0.watchIntact && env.watchIntact, r: 'invalid:watch_tampered' },
                { k: 'C5f', ok: p.env0 !== null && p.env0.readIntact && env.readIntact, r: 'invalid:read_api_tampered' },
                { k: 'C4a', ok: p.a1 === p.a0 + 1, r: 'invalid:l2_reentry' },
                { k: 'C4b', ok: p.r1 === p.r0, r: 'invalid:l2_reentry' },
                { k: 'C4c', ok: p.d1 === p.d0 + 1, r: 'invalid:l2_reentry' },
                { k: 'C4d', ok: p.m1 === p.a1, r: 'invalid:window_mutation' },
                { k: 'C4e', ok: p.w1 === 0, r: 'invalid:window_endlife_call' },
                { k: 'C3', ok: mutTotal === p.m1, r: 'invalid:post_seal_mutation' },
                { k: 'C2', ok: sameList, r: 'invalid:exit_listeners' }];
            verdict = SEAL.verdict;
            conds = [];
            let failed = false;
            for (const c of checks) {
                conds.push({ k: c.k, ok: c.ok === true });
                if (!failed && c.ok !== true) { verdict = c.r; failed = true; }
            }
        }
        fs.writeFileSync(REPORT_PATH, JSON.stringify({ verdict: verdict, conditional: verdict === 'valid' ? 'unconfirmed assumptions A-F' : null, conds: conds,
            snap: SEAL !== null ? SEAL.snap : null, counters: { C: M_.C, H: M_.H, P: M_.P, F: M_.F, X: M_.X, A: M_.A, Xcode: M_.Xcode, Acode: M_.Acode, E: M_.E },
            postSeal: postSeal, mutTotal: mutTotal, maxDepth: maxDepth, faultCount: faultCount }));
    } catch (_) { faultCount += 1; }
}

module.exports = Object.freeze({ init: init, wrapEndLife: wrapEndLife, finishMeasurement: finishMeasurement });
