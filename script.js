// 의존: data.js (gachaData), events.js (MODS, FAMILIA_BIAS, DEFAULT_FALNA, MAX_LEVEL, EVENTS)
const $ = id => document.getElementById(id);
const ABIL = [['str', '힘'], ['vit', '내구'], ['dex', '기교'], ['agi', '민첩'], ['mag', '마력']];
const RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];   // 100 단위
const rankOf = v => v >= 1200 ? 'SSS' : v >= 1000 ? 'SS' : RANKS[Math.min(9, Math.floor(v / 100))];   // 1000~1199 SS, 1200~ SSS
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const LEVELUP_ABIL = 500;    // 레벨업 조건: 능력치 하나가 D(500) 이상
let S;
// ── T1-F/F-1 공통 후속 선택 수명주기(결정 r9 C26·C27, 설계 r7 §N-1) ─────────────────────────────
// 보류 상태 = S.pendingFollowup(데이터만, 함수 저장 없음). 사건별 선택지·효과는 FOLLOWUP_KINDS[kind] 에 둔다.
const followupDiagLog = [];        // 진단 전용(S 밖). lifeDigest·RNG 에 관여하지 않는다.
function followupDiag(event, data) {
    const p = S && S.pendingFollowup ? S.pendingFollowup : null;
    followupDiagLog.push({ event, at: S ? S.age : null, seq: p ? p.seq : null, phase: p ? p.phase : null, ...(data || {}) });
}
const FOLLOWUP_KINDS = {};
// ── 예외 후 진행 정지(N1-6b)·생애 세대 토큰(N1-6c G1+G1+). 모두 S 밖의 모듈 변수 — lifeDigest·RNG 에 관여하지 않는다. ──
let progressHalted = false;        // 후속 선택 처리 중 예외가 나면 true. 해제는 startLife(새 게임)에서만 한다.
let lifeGen = 0;                   // startLife 마다 +1. 이전 생애에 예약된 자동 진행 타이머를 무효로 만든다.
const autoTimers = [];             // 예약된 자동 진행 타이머 id(취소용 보조 수단, G1+)
function haltedEntry(name) {       // 함수 진입 가드. 정지 중이면 진단만 남기고 true(호출자는 즉시 반환).
    if (!progressHalted) return false;
    followupDiag('halted_entry', { fn: name });
    return true;
}
// 자동 진행 타이머는 이 래퍼로만 예약한다. 콜백 첫 줄에서 정지·세대를 검사한 뒤에만 본문(난수·클릭)을 실행한다.
function scheduleAuto(fn, ms) {
    const gen = lifeGen; let id = null, fired = false;
    id = setTimeout(() => {
        fired = true;
        const i = autoTimers.indexOf(id); if (i >= 0) autoTimers.splice(i, 1);
        if (progressHalted || gen !== lifeGen) { followupDiag('stale_timer', { gen, lifeGen, halted: progressHalted }); return; }
        fn();
    }, ms);
    if (!fired) autoTimers.push(id);
    return id;
}
function clearAutoTimers() { while (autoTimers.length) clearTimeout(autoTimers.pop()); }
// R1 롤백(N1-6): 후속 선택 효과가 바꿀 수 있는 필드만 저장한다. 복사본은 원본 참조와 독립이다.
// 2-i 기록(falnaState·falnaHolder·falnaTransitions·conversionPending·syncBaseline)과 application·소속·관계 내용은 복원 대상이 아니다(효과가 건드리지 않으며 테스트로 직접 확인).
const ROLLBACK_VALUE_FIELDS = ['job', 'jobSince', 'valis', 'hp', 'bond', 'feat', 'potential', 'excelia', 'level', 'hidden', 'maxLevel', 'power', 'alias', 'nextRelationId'];
ROLLBACK_VALUE_FIELDS.push('location');   // F1D4A P2: E-3 현재 위치(값 필드). 이력(locationHistory) 복원은 P4 범위
const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];   // 존재 여부·교체 여부만 되돌린다(내용은 효과가 바꾸지 않음)
function takeRollbackSnapshot() {
    const has = k => Object.prototype.hasOwnProperty.call(S, k);
    const copy = v => Array.isArray(v) ? v.slice() : (v && typeof v === 'object') ? { ...v } : v;
    const rb = { values: {}, copies: {}, containers: {}, logLen: Array.isArray(S.logHistory) ? S.logHistory.length : null,
        levelHistory: { has: has('levelHistory'), ref: S.levelHistory, len: Array.isArray(S.levelHistory) ? S.levelHistory.length : null },
        // F1D4A D-DEVABIL(DEV-2·8·9): 배열 copy-on-write → 참조만, append-only 이력 → 참조·길이. 레벨·레벨 이력과 같은 복원 호출에서 함께 되돌린다.
        devAbilities: { has: has('devAbilities'), ref: S.devAbilities },
        devAbilityHistory: { has: has('devAbilityHistory'), ref: S.devAbilityHistory, len: Array.isArray(S.devAbilityHistory) ? S.devAbilityHistory.length : null } };
    ROLLBACK_VALUE_FIELDS.forEach(k => { rb.values[k] = { has: has(k), value: S[k] }; });
    ['flags', 'employer', 'abil'].forEach(k => { rb.copies[k] = { has: has(k), value: copy(S[k]) }; });
    ROLLBACK_CONTAINER_FIELDS.forEach(k => { rb.containers[k] = { has: has(k), ref: S[k] }; });
    try { rb.ext = takeRollbackSnapshotExt(); } catch (e) { rb.ext = null; }   // F1D4A N2-1: 확장 스냅숏(실패하면 복원 결과가 unverified 로 보고된다)
    return rb;
}
function restoreRollbackSnapshot(rb) {
    const put = (k, r) => { if (r.has) S[k] = r.value; else delete S[k]; };
    Object.keys(rb.values).forEach(k => put(k, rb.values[k]));
    Object.keys(rb.copies).forEach(k => put(k, rb.copies[k]));
    // 컨테이너: 원래 없던 필드는 지우고, 다른 객체로 교체된 필드(예: null → [])는 원래 값으로 되돌린다.
    Object.keys(rb.containers).forEach(k => { const r = rb.containers[k]; if (!r.has) delete S[k]; else if (S[k] !== r.ref) S[k] = r.ref; });
    if (rb.logLen != null && Array.isArray(S.logHistory) && S.logHistory.length > rb.logLen) S.logHistory.length = rb.logLen;
    const lh = rb.levelHistory;
    if (!lh.has) delete S.levelHistory;
    else if (S.levelHistory !== lh.ref) S.levelHistory = lh.ref;
    if (lh.has && lh.len != null && Array.isArray(S.levelHistory) && S.levelHistory.length > lh.len) S.levelHistory.length = lh.len;
    const da = rb.devAbilities, dh = rb.devAbilityHistory;
    if (da) { if (!da.has) delete S.devAbilities; else S.devAbilities = da.ref; }
    if (dh) { if (!dh.has) delete S.devAbilityHistory; else { S.devAbilityHistory = dh.ref; if (dh.len != null && Array.isArray(S.devAbilityHistory) && S.devAbilityHistory.length > dh.len) S.devAbilityHistory.length = dh.len; } }
}
// ── F1D4A N2-1: RB-1 (가) 원자 롤백 확장(REVIEW v27 §4.2k·§4.2m~§4.2u, 사용자 결정 RB-1a~RB-1g 2026-11-23) ──
// 후속 선택 resolve 안의 소속·팔나 전이와 컨테이너 변경을 스냅숏 시점으로 되돌린다. 정상 생애에서는 실행되지 않는다(예외 경로 전용).
// 스냅숏은 S 를 바꾸지 않고 난수를 쓰지 않는다. 결과 보고는 S 밖(lastRollbackReport·followupDiagLog)에만 남긴다.
const RBX_VALUE_FIELDS = ['familia', 'familiaAt', 'falnaAt', 'statusResumeAge', 'nextMembershipId', 'falnaState', 'falnaHolder',
    'conversionPending', 'residence', 'partnerId', 'patronAbsence', 'deepestFloor'];   // 값·참조(불변 교체 계약) 복원
// falnaHistory·falnaTransitions 는 push 만 하지만(RBT-1 계약) 원소 속성까지 되돌린다(QA RB-2C: 10종을 같은 L2·L3 계약으로 맞춤)
const RBX_ARRAYS = { familiaHistory: 'own', falnaHistory: 'own', falnaTransitions: 'own', aspirationHistory: 'own',
    residenceHistory: 'own', locationHistory: 'own', items: 'prim', itemsConsumed: 'prim', relations: 'own+', levelHistory: 'own' };
let lastRollbackReport = null;       // 최근 롤백 결과(S 밖, lifeDigest 비입력). startLife 에서 null
let lastRollbackFailure = null;      // 부분 복원 기록(S 밖). { gen, at, bundles }. startLife 에서 null(RB-1f)
let rollbackFailureUnrecorded = false;   // 위 기록 자체가 실패했는지(단순 불리언 대입 경로). startLife 에서 false
const rbxHas = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// 존재·참조(L1)는 기존 restoreRollbackSnapshot 이 맡는 필드. 확장은 이 필드들의 L1 을 고치지 않고 확인만 한다(복원 책임 단일화).
const RBX_BASE_L1 = new Set(['items', 'itemsConsumed', 'relations', 'itemUses', 'levelHistory']);
// L3 대상 원소 스키마 판정(REVIEW §4.2s R4·§4.2t R3): 문자열 키, 기본 데이터 descriptor, 원생 Object.prototype. 접근자는 호출하지 않는다.
function rbxOwnSnapshot(o, depth) {
    if (!choiceIsPlainObj(o)) return null;   // 어느 realm 이든 원생 Object.prototype 또는 null 프로토타입(기존 판정 재사용)
    const keys = Reflect.ownKeys(o), props = [];
    for (const k of keys) {
        if (typeof k !== 'string') return null;
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d || !('value' in d) || !d.writable || !d.enumerable || !d.configurable) return null;
        let nested = null;
        if (d.value && typeof d.value === 'object') {
            if (depth === 0 && k === 'familia') { nested = rbxOwnSnapshot(d.value, 1); if (!nested) return null; }   // L3+ (relations[*].familia)
            else if (depth > 0) return null;      // L3+ 아래의 객체 값은 지원하지 않는다
        }
        props.push({ k, v: d.value, nested });
    }
    return { proto: Object.getPrototypeOf(o), props };
}
function rbxDefine(o, k, v) { Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); }
// 원소 하나의 own 속성을 저장본으로 되돌린다. 반환: 'ok' | 'failed'
function rbxOwnRestore(o, snap) {
    if (!o || typeof o !== 'object' || Object.getPrototypeOf(o) !== snap.proto) return 'failed';
    const want = new Map(snap.props.map(p => [p.k, p]));
    for (const k of Reflect.ownKeys(o)) {
        if (typeof k === 'string' && want.has(k)) continue;
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d || !d.configurable || !Reflect.deleteProperty(o, k)) return 'failed';
    }
    for (const p of snap.props) {
        const d = Object.getOwnPropertyDescriptor(o, p.k);
        if (d && !('value' in d && d.writable && d.enumerable && d.configurable)) {
            if (!d.configurable || !Reflect.deleteProperty(o, p.k)) return 'failed';
        }
        if (p.nested) {
            const cur = Object.getOwnPropertyDescriptor(o, p.k);
            if (!cur || !Object.is(cur.value, p.v)) rbxDefine(o, p.k, p.v);
            if (rbxOwnRestore(p.v, p.nested) !== 'ok') return 'failed';
        } else rbxDefine(o, p.k, p.v);
    }
    const keys = Reflect.ownKeys(o);
    if (keys.length !== snap.props.length) return 'failed';
    for (const p of snap.props) { const d = Object.getOwnPropertyDescriptor(o, p.k); if (!d || !Object.is(d.value, p.v) || !d.writable || !d.enumerable || !d.configurable) return 'failed'; }   // NaN 등 비정상 값도 그대로 비교
    return 'ok';
}
// 배열 스냅숏(F1D4A N2 QA RB-1B): 원생 Array.prototype(어느 realm 이든)의 일반 배열만 지원한다. 원소는 descriptor 의 value 로만 읽는다(getter 호출 0).
// 지원 조건: own 키가 정수 인덱스(0..length-1, 빈 칸 없음)와 length 뿐, 인덱스는 기본 데이터 descriptor, length 는 writable. 아니면 null(지원하지 않는 스키마).
const RBX_NATIVE_ARRAY_SRC = /^function Array\(\) \{\s*\[native code\]\s*\}$/;
function rbxArrayList(arr) {
    if (!Array.isArray(arr)) return null;
    const p = Object.getPrototypeOf(arr); if (!p) return null;   // 프로토타입의 constructor 가 원생 Array 이고 그 prototype 이 p 일 때만(하위 클래스·바꾼 프로토타입 거부)
    const dc = Object.getOwnPropertyDescriptor(p, 'constructor'), C = dc && dc.value;
    if (typeof C !== 'function' || C.prototype !== p) return null;
    let src; try { src = Function.prototype.toString.call(C); } catch (e) { return null; }
    if (!RBX_NATIVE_ARRAY_SRC.test(src)) return null;
    const dl = Object.getOwnPropertyDescriptor(arr, 'length'); if (!dl || !('value' in dl) || !dl.writable) return null;
    const n = dl.value, keys = Reflect.ownKeys(arr); if (keys.length !== n + 1) return null;
    const list = new Array(n);
    for (let i = 0; i < n; i++) { const d = Object.getOwnPropertyDescriptor(arr, String(i)); if (!d || !('value' in d) || !d.writable || !d.enumerable || !d.configurable) return null; list[i] = d.value; }
    return list;
}
// 배열 내용을 저장본으로 되돌리고 descriptor 로 확인한다. 반환 'ok' | 'failed'
function rbxArrayRefill(arr, list) {
    try { arr.length = 0; for (const el of list) arr.push(el); } catch (e) { return 'failed'; }
    const now = rbxArrayList(arr);
    return now && now.length === list.length && list.every((el, i) => Object.is(now[i], el)) ? 'ok' : 'failed';
}
function rbxSnapArray(k, mode) {
    const has = rbxHas(S, k), ref = S[k];
    const out = { has, ref, isArray: Array.isArray(ref), list: null, own: null, unsupported: [] };
    if (out.isArray) {
        out.list = rbxArrayList(ref);
        if (!out.list) { out.arrayUnsupported = true; out.list = []; return out; }   // 배열 자체가 지원하지 않는 스키마: 내용 복원 근거 없음
        if (mode === 'own' || mode === 'own+') out.own = out.list.map((el, i) => { const sn = rbxOwnSnapshot(el, 0); if (!sn) out.unsupported.push(i); return sn; });
    }
    return out;
}
function rbxRestoreArray(k, r, mode) {
    const res = { V1: 'ok', V2: 'ok', V3: 'ok', V0: r.unsupported.length ? 'input_damaged(schema)' : 'input_ok' };
    if (!r.has) { if (!RBX_BASE_L1.has(k)) delete S[k]; res.V1 = rbxHas(S, k) ? 'failed' : 'ok'; res.V2 = res.V3 = res.V1; return res; }
    if (S[k] !== r.ref && !RBX_BASE_L1.has(k)) S[k] = r.ref;
    if (S[k] !== r.ref) { res.V1 = 'failed'; res.V2 = res.V3 = 'unverified'; return res; }
    if (!r.isArray) return res;                              // 원래 배열이 아니면 참조만 되돌린다(내용 계약 대상 아님)
    if (r.arrayUnsupported) { res.V0 = 'input_damaged(schema)'; res.V2 = res.V3 = 'unverified'; return res; }   // 저장 근거 없음 → 성공으로 보지 않는다
    res.V2 = rbxArrayRefill(r.ref, r.list);
    if (mode !== 'own' && mode !== 'own+') return res;
    if (res.V2 !== 'ok') { res.V3 = 'unverified'; return res; }
    for (let i = 0; i < r.list.length; i++) {
        const sn = r.own[i];
        if (!sn) { res.V3 = res.V3 === 'failed' ? 'failed' : 'unverified'; continue; }   // 스냅숏 근거 없음(경우 2) — 복원 성공으로 보지 않는다
        let st; try { st = rbxOwnRestore(r.list[i], sn); } catch (e) { st = 'failed'; }
        if (st !== 'ok') res.V3 = 'failed';
    }
    return res;
}
function takeRollbackSnapshotExt() {
    const x = { values: {}, arrays: {}, itemUses: null, application: null, syncBaseline: null, aspiration: null, logEl: null, logLast: null, syncDepth };
    RBX_VALUE_FIELDS.forEach(k => { x.values[k] = { has: rbxHas(S, k), value: S[k] }; });
    Object.keys(RBX_ARRAYS).forEach(k => { x.arrays[k] = rbxSnapArray(k, RBX_ARRAYS[k]); });
    { const has = rbxHas(S, 'itemUses'), ref = S.itemUses; x.itemUses = { has, ref, own: ref && typeof ref === 'object' ? rbxOwnSnapshot(ref, 1) : null }; }
    { // F1D4A N2 QA RB-1A·1B: application 은 최상위 own 데이터 속성(descriptor 기준, getter 호출 0)과 history·blocked 배열을 따로 스냅숏한다
      const a = S.application, has = rbxHas(S, 'application');
      const own = a && typeof a === 'object' ? rbxOwnSnapshot(a, 0) : null;
      const arr = k => { const p = own && own.props.find(q => q.k === k); if (!p) return { has: false }; const list = rbxArrayList(p.v); return { has: true, ref: p.v, isArray: Array.isArray(p.v), list, unsupported: Array.isArray(p.v) && !list }; };
      x.application = { has, ref: a, isObj: !!(a && typeof a === 'object'), own, history: arr('history'), blocked: arr('blocked') }; }
    { const b = S.syncBaseline; x.syncBaseline = { has: rbxHas(S, 'syncBaseline'), value: b && typeof b === 'object' ? { ...b } : b }; }
    { const a = S.aspiration; x.aspiration = { has: rbxHas(S, 'aspiration'), ref: a, own: a && typeof a === 'object' ? rbxOwnSnapshot(a, 1) : null }; }
    try { const log = typeof document !== 'undefined' && $('log'); x.logEl = log || null; x.logLast = log ? log.lastChild : null; } catch (e) { x.logEl = null; }   // DEV-18 과 같은 기준점 방식
    return x;
}
// QA RB-2A: 예외 처리 진입 직후(어떤 복원보다 먼저) application.history·blocked 를 관찰한다. descriptor 만 읽고 getter 를 부르지 않는다.
// 결과는 x.obs 에 두며 복원 단계는 이 값을 바꾸지 않는다. 관찰할 수 없으면(접근자·지원하지 않는 배열) null 로 둔다.
function observeRollbackState(x) {
    if (!x || !x.application) return;
    const r = x.application, obs = { application: null, history: null, blocked: null };
    let curA, appObservable = false;
    // QA r3 필수 1: S.application 자체가 접근자이거나 descriptor 를 얻지 못하면 자식 배열을 관찰하지 않는다(replaced·changed 는 null 로 둔다).
    try {
        const dA = Object.getOwnPropertyDescriptor(S, 'application');
        if (dA && !('value' in dA)) obs.application = { replaced: null, observable: false };
        else { curA = dA ? dA.value : undefined; appObservable = true; obs.application = { replaced: r.has ? curA !== r.ref : !!dA, observable: true }; }
    } catch (e) { obs.application = { replaced: null, observable: false }; }
    for (const k of ['history', 'blocked']) {
        if (!appObservable) { obs[k] = { replaced: null, changed: null }; continue; }
        const h = r[k] || { has: false }; let o = { replaced: null, changed: null };
        try {
            const d = curA && typeof curA === 'object' ? Object.getOwnPropertyDescriptor(curA, k) : undefined;
            if (!d || 'value' in d) {
                const cur = d ? d.value : undefined;
                o.replaced = h.has ? cur !== h.ref : !!d;
                if (h.has && h.isArray && h.list) {
                    if (Array.isArray(cur)) { const l = rbxArrayList(cur); o.changed = l ? (l.length !== h.list.length || h.list.some((e, i) => !Object.is(l[i], e))) : null; }
                    else o.changed = true;                        // 배열이 사라졌거나 배열이 아닌 값으로 바뀜
                } else if (!h.has) o.changed = !!d;               // 원래 없던 배열이 생김
            }
        } catch (e) { o = { replaced: null, changed: null }; }
        obs[k] = o;
    }
    x.obs = obs;
}
// 롤백 실패 기록(S 밖). chooseFollowup 의 'recordFailure' 단계에서만 부른다.
function writeRollbackFailureRecord(report) { lastRollbackFailure = { gen: lifeGen, at: S ? S.age : null, report }; }
// 묶음별로 격리해 되돌린다(FI-1). 결과: { rollback: 'ok'|'partial(failed)'|'partial(unverified)', input: 'normal'|'damaged(...)', bundles }
function restoreRollbackSnapshotExt(x) {
    const bundles = {}, damaged = [];
    const run = (name, fn) => { try { bundles[name] = fn(); } catch (e) { bundles[name] = { status: 'failed', error: String(e && e.message) }; } };
    if (!x) { lastRollbackReport = { rollback: 'partial(unverified)', input: 'normal', bundles: { snapshot: { status: 'unverified' } } }; return lastRollbackReport; }
    run('values', () => {
        RBX_VALUE_FIELDS.forEach(k => { const r = x.values[k]; if (r.has) S[k] = r.value; else delete S[k]; });
        const bad = RBX_VALUE_FIELDS.filter(k => { const r = x.values[k]; return r.has ? (!rbxHas(S, k) || S[k] !== r.value) : rbxHas(S, k); });
        return { status: bad.length ? 'failed' : 'ok', bad };
    });
    Object.keys(RBX_ARRAYS).forEach(k => run('array:' + k, () => {
        const res = rbxRestoreArray(k, x.arrays[k], RBX_ARRAYS[k]);
        if (res.V0 !== 'input_ok') damaged.push(res.V0 + ':' + k);
        const st = [res.V1, res.V2, res.V3];
        return { status: st.includes('failed') ? 'failed' : st.includes('unverified') ? 'unverified' : 'ok', ...res };
    }));
    run('itemUses', () => {
        const r = x.itemUses;
        if (!r.has) return { status: rbxHas(S, 'itemUses') ? 'failed' : 'ok' };   // L1 은 기존 복원이 맡는다(확인만)
        if (S.itemUses !== r.ref || !r.ref || typeof r.ref !== 'object') return { status: S.itemUses === r.ref ? 'ok' : 'failed' };
        if (!r.own) { damaged.push('input_damaged(schema):itemUses'); return { status: 'unverified' }; }
        return { status: rbxOwnRestore(r.ref, r.own) };
    });
    // application(RB-1b 정체성 유지): 최상위 속성(L1·L3) → history·blocked 각각(L2). 선행이 ok 가 아니면 뒤는 unverified(V 의존 규칙)
    run('application', () => {
        const r = x.application;
        if (!r.has) { delete S.application; return { status: rbxHas(S, 'application') ? 'failed' : 'ok' }; }
        // descriptor 로만 읽고 쓴다: 예외 시점에 S.application 이 접근자가 됐어도 getter·setter 를 부르지 않는다
        { const d = Object.getOwnPropertyDescriptor(S, 'application');
          if (!(d && 'value' in d && d.value === r.ref && d.writable && d.enumerable && d.configurable)) {
              if (d && !d.configurable) return { status: 'failed' };
              if (d) delete S.application;
              rbxDefine(S, 'application', r.ref);
          }
          const d2 = Object.getOwnPropertyDescriptor(S, 'application');
          if (!(d2 && 'value' in d2 && d2.value === r.ref)) return { status: 'failed' }; }
        if (!r.isObj) return { status: 'ok' };
        if (!r.own) { damaged.push('input_damaged(schema):application'); return { status: 'unverified' }; }   // 접근자·비표준 descriptor: 복원 근거 없음
        let st; try { st = rbxOwnRestore(r.ref, r.own); } catch (e) { st = 'failed'; }
        return { status: st };
    });
    for (const k of ['history', 'blocked']) run('application.' + k, () => {
        const top = bundles.application, r = x.application, h = r && r[k];
        const ob0 = (x.obs && x.obs[k]) || { replaced: null, changed: null };
        if (!r || !r.has || !r.isObj || !h || !h.has) {                    // 원래 없던 배열은 최상위 복원이 지운다
            let gone = null; try { gone = !(r && r.isObj && Object.getOwnPropertyDescriptor(r.ref, k)); } catch (e) { gone = null; }
            return { status: top && top.status === 'ok' ? 'ok' : 'unverified', replaced: ob0.replaced, changed: ob0.changed, refRestored: gone };
        }
        if (!top || top.status !== 'ok') return { status: top && top.status === 'failed' ? 'unverified' : 'unverified' };
        const d = Object.getOwnPropertyDescriptor(r.ref, k), cur = d && d.value;
        // 보고값 세 가지는 뜻이 다르다(QA RB-2A). replaced·changed 는 '예외 시점' 관찰값(복원 전, observeRollbackState)이고 복원 작업이 바꾸지 않는다.
        //   replaced    : 예외 시점에 application[k] 가 스냅숏 때와 다른 배열(또는 없음)이었는지. 관찰 못 하면 null
        //   changed     : 예외 시점 application[k] 의 내용이 스냅숏 내용과 달랐는지. 어느 쪽이든 지원하지 않는 배열이면 null
        //   refRestored : 복원 뒤 application[k] 가 스냅숏 때의 배열 참조인지
        const ob = (x.obs && x.obs[k]) || { replaced: null, changed: null };
        const replaced = ob.replaced, changed = ob.changed, refRestored = cur === h.ref;
        if (!refRestored) return { status: 'failed', replaced, changed, refRestored };
        if (!h.isArray) return { status: 'ok', replaced, changed, refRestored };
        if (h.unsupported) { damaged.push('input_damaged(schema):application.' + k); return { status: 'unverified', replaced, changed, refRestored }; }
        return { status: rbxArrayRefill(cur, h.list), replaced, changed, refRestored };
    });
    run('syncBaseline', () => {                               // RB-1a: 최상위 얕은 복사본으로 교체
        const r = x.syncBaseline;
        if (!r.has) delete S.syncBaseline; else S.syncBaseline = r.value && typeof r.value === 'object' ? { ...r.value } : r.value;
        return { status: 'ok' };
    });
    run('aspiration', () => {
        const r = x.aspiration;
        if (!r.has) { delete S.aspiration; return { status: rbxHas(S, 'aspiration') ? 'failed' : 'ok' }; }
        if (S.aspiration !== r.ref) S.aspiration = r.ref;
        if (r.ref && typeof r.ref === 'object') { if (!r.own) { damaged.push('input_damaged(schema):aspiration'); return { status: 'unverified' }; } return { status: rbxOwnRestore(r.ref, r.own) }; }
        return { status: S.aspiration === r.ref ? 'ok' : 'failed' };
    });
    // 판정(RB-1g (ㄱ)): relations_integrity 는 관계 배열 전체, partner_link 는 partnerId 와 같은 id 원소에 한정해 의존한다.
    run('relations_integrity', () => ({ status: (bundles['array:relations'] || {}).status || 'unverified' }));
    run('partner_link', () => {
        const pv = bundles.values, rel = bundles['array:relations'] || {};
        const pid = x.values.partnerId.value;
        if (!pv || pv.bad.includes('partnerId')) return { status: 'failed' };
        if (pid == null) return { status: 'ok' };
        if (rel.V1 !== 'ok' || rel.V2 !== 'ok') return { status: rel.V1 === 'failed' || rel.V2 === 'failed' ? 'failed' : 'unverified' };
        const ra = x.arrays.relations, list = ra.list || [];
        const firstIdx = list.findIndex(e => e && String(e.id) === String(pid));
        const same = list.map((e, i) => i).filter(i => list[i] && String(list[i].id) === String(pid));
        if (same.length > 1) damaged.push('damaged(dup):partnerId');
        const deps = new Set(same); for (let i = 0; i < (firstIdx < 0 ? list.length : firstIdx); i++) deps.add(i);
        for (const i of deps) { if (!ra.own[i]) return { status: 'unverified' }; }
        return { status: rel.V3 === 'ok' ? 'ok' : (rel.V3 === 'failed' ? 'failed' : 'unverified') };
    });
    const all = Object.values(bundles).map(b => b.status);
    const rollback = all.includes('failed') ? 'partial(failed)' : all.includes('unverified') ? 'partial(unverified)' : 'ok';
    lastRollbackReport = { rollback, input: damaged.length ? 'damaged(' + damaged.join(',') + ')' : 'normal', bundles };
    return lastRollbackReport;
}
// RB-1e X2b: 스냅숏 뒤에 추가된 연표 노드만 지운다(기존 노드는 바꾸지 않는다). 정지 안내(X5b)보다 먼저 실행한다.
function trimLogNodesAfterSnapshot(x) {
    if (!x || !x.logEl) return;
    const el = x.logEl;
    while (el.lastChild && el.lastChild !== x.logLast) el.removeChild(el.lastChild);
    // 스냅숏 뒤에 붙은 정지 안내(중첩 정지, DEV-19)도 함께 지워졌으므로 X5b 가 한 번 다시 붙이게 한다(안내는 정확히 1건).
    if (haltNoticeShownGen === lifeGen) haltNoticeShownGen = -1;
}
// R-E: 예외 경로 전용 렌더. renderStats 가 조회 중 만들 수 있는 컨테이너(관계·아이템)가 실제 S 에 생기지 않도록 복제본으로 그린다.
function cloneStateForRender(v) {
    if (Array.isArray(v)) return v.map(cloneStateForRender);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = cloneStateForRender(v[k]); }); return o; }
    return v;
}
function renderStatsFromClone() {
    const real = S;
    try { S = cloneStateForRender(real); renderStats(); }
    finally { S = real; }
}
let haltNoticeShownGen = -1;       // F1D4A DEV-19: 같은 생애에서 정지 안내 중복 방지(발전 어빌리티 커밋 실패가 후속 선택 안에서 나면 두 경로가 모두 안내를 부른다)
function showHaltNotice() {        // 화면 전용(logHistory 미기록)
    if (haltNoticeShownGen === lifeGen) return;
    const d = document.createElement('div');
    d.className = 'entry result bad';
    d.innerHTML = '선택을 처리하는 중 오류가 발생해 진행을 멈췄다. 처음부터 다시 시작해 주세요.';
    $('log').appendChild(d);
    haltNoticeShownGen = lifeGen;
    d.scrollIntoView({ block: 'nearest' });
}         // kind → { prompt, options(S, pending) → [{ id, label, stay }], resolve(S, optionId, pending) }
// v1.7.8-2i: 팔나 상태 기록(설계 r2k-4 §2.8). 기록 전용 — 난수·판정·성장 경로를 바꾸지 않는다.
let syncDepth = 0;                 // 동기화 범위 깊이. 모듈 로드 시 1회만 0 으로 둔다(startLife 는 대입하지 않음, U3).
const syncInvariantLog = [];       // 기록 전용 불변식 위반(테스트 러너가 읽어 간다). 값 자동 보정 없음.
// 직업 전투 분류(설계 §2.1, [게임 고유 규칙]). 2-i 는 정의·테스트만 한다.
const JOB_ROLE_CLASS = { adventurer:'combat', soldier:'combat', supporter:'support', blacksmith:'noncombat', healer:'noncombat', merchant:'noncombat', farmer:'noncombat', guild_staff:'noncombat', waitstaff:'noncombat', child:'none', retired:'none' };
const FALNA_STATES = ['none', 'active', 'unbound', 'sealed'];
// 금지 전이(설계 §2.3). 2-i 의 전이 함수는 정의만 하고 게임 흐름에서 호출하지 않는다.
const FALNA_FORBIDDEN = { none: ['unbound', 'sealed'], sealed: ['unbound'], unbound: ['sealed'] };
GameCore.Items.setCatalog(gachaData.items);
const relationCtx = () => ({ races: gachaData.races, mods: MODS });
const JOB_LABELS = { child:'유년기', adventurer:'모험자', supporter:'서포터', guild_staff:'길드 직원', blacksmith:'대장장이', merchant:'상인', farmer:'농부', healer:'치유사', soldier:'병사', waitstaff:'종업원', retired:'은퇴자' };
// 조직·고용처(파밀리아가 아님, 팔나 없음)의 기본 직업. child 일 때만 적용된다.
const JOB_ORG = { guild: 'guild_staff', hostess: 'waitstaff' };
const JOB_FAMILIA = { hephaestus:'blacksmith', demeter:'farmer', miach:'healer', ares:'soldier', kali:'soldier' };
function setAspiration(kind, source) {
    if (haltedEntry('setAspiration')) return;   // H3 정지 가드
    S.aspirationHistory ||= [];
    if (S.aspiration && S.aspiration.kind === kind) return;
    S.aspiration = { kind, since: S.age, source, fulfilledAt: null };
    S.aspirationHistory.push({ ...S.aspiration });
}

function setJob(job) {
    if (haltedEntry('setJob')) return;   // H3 정지 가드
    const previous = S.job;
    S.job = job;
    // T1-F F1-d4b J-3(승인 2026-11-09): 실제 직업 변경 시에만 근속 시작 달력 나이 갱신. 같은 직업 재설정은 유지.
    // S.employer.since(고용처 근무 시작)와 별개 의미. lifeDigest·RNG 에 관여하지 않음(기록 전용).
    if (previous !== job) S.jobSince = S.age;
    S.flags = S.flags.filter(f => !['adventurer','supporter','crafter','soldier'].includes(f));
    if (job === 'adventurer') { S.flags.push('adventurer'); setAspiration('adventurer', 'job_assigned'); }
    if (job === 'supporter') S.flags.push('supporter');
    if (job === 'blacksmith') S.flags.push('crafter');
    if (job === 'soldier') S.flags.push('soldier');
    if (previous !== job && S.logHistory) S.logHistory.push({ age:S.age, type:'job', text:`직업이 ${JOB_LABELS[job] || job}(으)로 바뀌었다.` });
}

function getRandomItemByWeight(items, key = 'weight') {
    const total = items.reduce((s, i) => s + i[key], 0);
    let r = Math.random() * total;
    for (const i of items) { if (r < i[key]) return i; r -= i[key]; }
    return items[items.length - 1];
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    $(id).classList.remove('hidden'); $(id).classList.add('active');
}

function getChoiceProbability(chance = {}, extraPower = 0) {
    let rawStat = chance.stat
        ? (ABIL.find(([key]) => key === chance.stat) ? S.abil[chance.stat] : S[chance.stat])
        : 0;
    if (chance.stat === 'power' && Number.isFinite(Number(extraPower))) rawStat = Number(rawStat) + Number(extraPower);
    const statValue = Number.isFinite(Number(rawStat)) ? Number(rawStat) : 0;
    const baseChance = Number.isFinite(Number(chance.p)) ? Number(chance.p) : 0.5;
    const perStat = Number.isFinite(Number(chance.per)) ? Number(chance.per) : 0.005;
    const computed = baseChance + statValue * perStat;
    return Math.min(0.95, Math.max(0.05, Number.isFinite(computed) ? computed : baseChance));
}

// F1D4A P2(E-1.1·E-2): match(c, event) — 두 번째 인자는 판정 중인 사건 객체. 지금은 어떤 키도 쓰지 않는다(dungeonReach 는 P4).
// P3 DI-1/DI-4: 조직 시설·모집 지역 판정. 값은 조직 id 문자열. 알 수 없는 조직·문자열이 아닌 값·위치 없음은 false(fail-closed).
//   둘 다 현재 위치 S.location.regionId 만 본다(거주지·출생지 무관). 상태 변경·난수 0.
function orgForCond(id) {
    if (typeof id !== 'string' || id.length === 0) return null;   // 비어 있지 않은 문자열만
    return (gachaData.organizations || []).find(o => o && o.id === id) || null;
}
function atSiteOfOrg(id) {
    const o = orgForCond(id), r = S.location && S.location.regionId;
    return !!(o && r && Array.isArray(o.sites) && o.sites.some(st => st && st.region === r));
}
function inRecruitAreaOfOrg(id) {
    const o = orgForCond(id), r = S.location && S.location.regionId;
    return !!(o && r && Array.isArray(o.recruitArea) && o.recruitArea.includes(r));
}
function match(c = {}, event) {
    if (c.job && !(Array.isArray(c.job) ? c.job : [c.job]).includes(S.job)) return false;
    if (c.age && (S.phase < c.age[0] || S.phase > c.age[1])) return false;      // 육체 나이
    if (c.cage && (S.age < c.cage[0] || S.age > c.cage[1])) return false;       // 달력 나이
    if (c.notRace && c.notRace.includes(S.race.id)) return false;
    if (c.familia && (!S.familia || !c.familia.includes(S.familia.id))) return false;
    if (c.familiaIn && (!S.familia || !c.familiaIn.includes(S.familia.id))) return false;              // E-2: familia 와 같은 뜻의 정식 키
    if (c.residenceIn && !(S.residence && c.residenceIn.includes(S.residence.regionId))) return false; // E-2: 거주지
    if (c.locationIn && !(S.location && c.locationIn.includes(S.location.regionId))) return false;     // E-2: 현재 위치만(거주지·출생지 무관)
    if (c.employerIn && !(S.employer && c.employerIn.includes(S.employer.id))) return false;           // E-2: 고용처
    // P3 DI-4: 값의 참·거짓이 아니라 키의 존재로 검사한다(P3 보완: '' · null · false · 0 · undefined 우회 차단 → 거짓).
    if (Object.prototype.hasOwnProperty.call(c, 'atSiteOf') && !atSiteOfOrg(c.atSiteOf)) return false;                  // 현재 위치에 그 조직의 시설·지점이 있음(D-INSTITUTION §2)
    if (Object.prototype.hasOwnProperty.call(c, 'inRecruitAreaOf') && !inRecruitAreaOfOrg(c.inRecruitAreaOf)) return false;   // 현재 위치가 그 조직의 모집 지역
    if (c.hasEmployer === true && !S.employer) return false;
    if (c.hasEmployer === false && S.employer) return false;
    if (c.origin && !c.origin.includes(S.origin.id)) return false;
    if (c.race && !c.race.includes(S.race.id)) return false;
    if (c.hasFamilia === true && !S.familia) return false;
    if (c.hasFamilia === false && S.familia) return false;
    if (c.hasPartner === true && !GameCore.Relations.hasPartner(S)) return false;
    if (c.hasPartner === false && GameCore.Relations.hasPartner(S)) return false;
    if (c.noItem && c.noItem.some(id => (S.items || []).includes(id))) return false;     // 이미 가진 물건을 또 사지 않는다
    if (c.relative && !GameCore.Relations.hasLivingRelative(S, c.relative)) return false;
    if (c.noRelative && GameCore.Relations.hasLivingRelative(S, c.noRelative)) return false;
    if (c.flags && !c.flags.every(f => S.flags.includes(f))) return false;
    if (c.noFlags && c.noFlags.some(f => S.flags.includes(f))) return false;
    if (c.falnaState && !c.falnaState.includes(S.falnaState)) return false;          // 2-i: 기록 상태(설계 §2.3.2)
    if (c.familiaRole && !c.familiaRole.includes(currentFamiliaRole())) return false;  // 2-i: 열린 소속 역할
    if (c.canEnterDungeon === true && !canEnterDungeon(S)) return false;             // 2-i 정의 = canUseFalna
    if (c.min) for (const k in c.min) if (S[k] < c.min[k]) return false;
    if (c.max) for (const k in c.max) if (S[k] > c.max[k]) return false;
    return true;
}
// match() 가 실제로 판정하는 키(EN-12 대조용). atSiteOf·inRecruitAreaOf 는 P3 에서 추가(아래 push), dungeonReach 는 P4 에서 추가한다.
const MATCH_KEYS = ['job', 'age', 'cage', 'notRace', 'familia', 'familiaIn', 'residenceIn', 'locationIn', 'employerIn', 'hasEmployer', 'origin', 'race', 'hasFamilia',
    'hasPartner', 'noItem', 'relative', 'noRelative', 'flags', 'noFlags', 'falnaState', 'familiaRole', 'canEnterDungeon', 'min', 'max'];
MATCH_KEYS.push('atSiteOf', 'inRecruitAreaOf');   // P3: 조직 시설·모집 지역 키(D-INSTITUTION §2). dungeonReach 는 P4
// E-1.1 선택지 조건 허용 키(설계 목록 그대로). 관계 키(hasPartner·relative·noRelative)는 보조 함수가 S 를 정규화(쓰기)할 수 있어 제외.
const CHOICE_COND_KEYS = ['job', 'age', 'cage', 'origin', 'race', 'notRace', 'flags', 'noFlags', 'falnaState', 'hasFamilia', 'familiaIn', 'familia', 'familiaRole',
    'canEnterDungeon', 'noItem', 'min', 'max', 'residenceIn', 'locationIn', 'employerIn', 'hasEmployer', 'atSiteOf', 'inRecruitAreaOf'];
// choiceMatch(c, e): 선택지 조건에만 쓰는 판정. match() 에 ① 형식 검사 ② 허용 키 ③ min/max 유한값 요구를 더한다. 상태 변경·난수·연표 0(EN-8).
//   허용 목록 안이지만 아직 match() 가 판정하지 않는 키는 판정할 수 없으므로 숨김(fail-closed). P3 부터 atSiteOf·inRecruitAreaOf 는 판정 키.
//   P2 보완(ChatGPT 1차 재검수): 조건은 배열이 아닌 일반 객체여야 한다. min/max 가 있으면 비어 있지 않은 일반 객체이고,
//   각 조건값과 비교 대상 S[k] 가 모두 유한수여야 한다. 형식이 틀리면 숨김.
//   P2 보완 2(44178ca 재검수): toString 태그만으로는 일반 객체가 아니다(사용자 프로토타입·클래스 인스턴스·toStringTag 위조 통과).
//   ① 일반 객체 = 프로토타입이 null 이거나, 어느 실행 영역(realm)의 기본 Object.prototype 인 객체.
//      Object.prototype 판정: 그 프로토타입의 프로토타입이 null 이고, 자체 constructor 가 이름 'Object' 인 기본(native) 함수이며
//      그 함수의 prototype 이 바로 그 객체(다른 realm 의 Object 도 성립, 위조 프로토타입은 성립하지 않음).
//   ② 자체 속성만 본다: 모든 자체 속성은 열거 가능한 데이터 속성이어야 하고(접근자·비열거·심볼 키 거부),
//      검증한 값을 프로토타입이 null 인 새 객체에 복사(스냅숏)한다. match() 에는 이 스냅숏만 넘기므로
//      match() 가 읽는 속성(c.min · for…in 포함) = 검증한 자체 속성이다(상속 속성은 스냅숏에 없음). match() 자체는 변경하지 않는다.
//   ③ cond · min · max 에 같은 규칙(①·②)을 쓴다.
const choiceHasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const CHOICE_NATIVE_OBJECT_SRC = /^function Object\(\) \{\s*\[native code\]\s*\}$/;
function choiceIsPlainObj(v) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    const p = Object.getPrototypeOf(v);
    if (p === null) return true;
    if (Object.getPrototypeOf(p) !== null) return false;
    const d = Object.getOwnPropertyDescriptor(p, 'constructor'), C = d && d.value;
    if (typeof C !== 'function' || C.prototype !== p) return false;
    let src; try { src = Function.prototype.toString.call(C); } catch (err) { return false; }
    return CHOICE_NATIVE_OBJECT_SRC.test(src);
}
// 일반 객체의 자체 속성 스냅숏(프로토타입 null). 형식이 틀리면 null.
function choiceSnapshot(v) {
    if (!choiceIsPlainObj(v) || Object.getOwnPropertySymbols(v).length) return null;
    const out = Object.create(null);
    for (const k of Object.getOwnPropertyNames(v)) {
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !d.enumerable || !('value' in d)) return null;
        out[k] = d.value;
    }
    return out;
}
// 선택지 조건을 검증해 match() 에 넘길 스냅숏을 만든다. 형식이 틀리면 null(숨김).
function choiceCondNormalize(c) {
    const n = choiceSnapshot(c);
    if (!n) return null;
    for (const k of Object.keys(n)) if (!CHOICE_COND_KEYS.includes(k) || !MATCH_KEYS.includes(k)) return null;
    for (const k of ['atSiteOf', 'inRecruitAreaOf']) if (k in n && !(typeof n[k] === 'string' && n[k].length > 0)) return null;   // P3 보완: 조직 id 는 비어 있지 않은 문자열(아니면 형식 오류)
    for (const lim of ['min', 'max']) {
        if (!(lim in n)) continue;
        const m = choiceSnapshot(n[lim]), ks = m ? Object.keys(m) : [];
        if (!ks.length) return null;   // null·false·0·scalar·배열·빈 객체·비일반 객체
        for (const k of ks) if (!Number.isFinite(m[k]) || !Number.isFinite(S[k])) return null;
        n[lim] = m;
    }
    return n;
}
function choiceCondValid(c) { return choiceCondNormalize(c) !== null; }
function choiceMatch(c, e) {   // P2 보완 3: 검증·판정 중 예외는 전파하지 않고 false(fail-closed)
    try { const n = choiceCondNormalize(c); return n !== null && match(n, e); } catch (err) { return false; }
}
// 선택지 표시 여부의 단일 규칙(visibleChoices·chooseBody 공용): cond 속성이 완전히 없을 때(자체·상속 모두)만 무조건 표시.
//   자체 cond 가 있으면(undefined·null·false·0·''·배열 포함) 형식 검사·match 로 판정한다(아래 choiceVerdict).
//   P2 보완 3(ed6e824 재검수): 선택지 객체 자체도 검증한다. choiceVerdict 가 표시(visibleChoices)·직접 호출(chooseBody)의 단일 판정이다.
//   ① 객체가 아님 → choice_not_object.
//   ② cond 는 자체 속성 서술자(descriptor)로만 읽는다(getter 를 실행하지 않음). 자체 cond 가 없는데 'cond' in ch(상속)이면,
//      또는 자체 cond 가 열거 불가·접근자(getter/setter)면 → cond_malformed.
//   ③ 선택지가 일반 객체(기본 Object.prototype 또는 null 프로토타입)가 아님(배열·Date·클래스 인스턴스·사용자 프로토타입) → choice_not_object.
//   ④ cond 가 없으면 표시. 있으면 서술자의 value 하나로 형식 검사(스냅숏)·match 판정 → cond_malformed / cond_unmet.
//   ⑤ 검증·판정 중 예외(Proxy trap·폐기된 Proxy 등)는 전파하지 않고 거부(cond_malformed). 투명 Proxy 자체를 식별하지 못하는 한계는 유지.
function choiceInspect(ch) {
    if (ch === null || typeof ch !== 'object') return { ok: false, reason: 'choice_not_object' };   // 원시값·함수 포함
    const d = Object.getOwnPropertyDescriptor(ch, 'cond');
    if (!d) { if ('cond' in ch) return { ok: false, reason: 'cond_malformed' }; }
    else if (!d.enumerable || !('value' in d)) return { ok: false, reason: 'cond_malformed' };
    if (!choiceIsPlainObj(ch)) return { ok: false, reason: 'choice_not_object' };
    return d ? { ok: true, hasCond: true, cond: d.value } : { ok: true, hasCond: false };
}
function choiceVerdict(ch, e) {
    try {
        const ins = choiceInspect(ch);
        if (!ins.ok || !ins.hasCond) return ins.ok ? { ok: true } : { ok: false, reason: ins.reason };
        const n = choiceCondNormalize(ins.cond);
        if (!n) return { ok: false, reason: 'cond_malformed' };
        return match(n, e) ? { ok: true } : { ok: false, reason: 'cond_unmet' };
    } catch (err) {
        return { ok: false, reason: 'cond_malformed' };
    }
}
function choiceVisible(ch, e) { return choiceVerdict(ch, e).ok; }
// 참조 대조: ch 가 사건 e 의 choices 배열에 실제로 들어 있는 같은 객체인가(값·id 비교 아님). 예외는 거부.
function choiceInEvent(ch, e) {
    try {
        if (!e || !Array.isArray(e.choices)) return false;
        for (let i = 0; i < e.choices.length; i++) if (e.choices[i] === ch) return true;
        return false;
    } catch (err) { return false; }
}
function visibleChoices(e) { return e.choices.filter(ch => choiceVisible(ch, e)); }

function say(text, cls = '', age) {
    const d = document.createElement('div');
    d.className = 'entry ' + cls;
    d.innerHTML = (age != null ? `<span class="age">${age}세</span>` : '') + text;
    $('log').appendChild(d);
    if (S && S.logHistory) S.logHistory.push({ age: age == null ? S.age : age, type: cls.includes('event') ? 'event' : (cls.includes('growth') ? 'growth' : 'note'), text: String(text).replace(/<[^>]*>/g, '') });
    d.scrollIntoView({ block: 'nearest' });
}

const hasFalna = () => S.flags.includes('falna');

// ── v1.7.8-2i 팔나 상태 판정 함수(설계 §2.2). 성장 경로에는 연결하지 않는다(2-ii). ──
function deriveFalnaState(s = S) {
    const flag = (s.flags || []).includes('falna');
    if (flag) return s.familia ? 'active' : 'unbound';
    return (s.falnaHistory || []).length ? 'sealed' : 'none';
}
function deriveFalnaHolder(s = S) { return (s.flags || []).includes('falna') && s.familia ? s.familia.id : null; }
function openMembershipOf(s = S) { return (s.familiaHistory || []).find(m => m.leftAt == null) || null; }
function currentFamiliaRole(s = S) { const open = s.familia ? openMembershipOf(s) : null; return open ? (open.role || null) : null; }
const falnaEmbedded = (s = S) => ['active', 'unbound', 'sealed'].includes(s.falnaState);
const canUseFalna = (s = S) => s.falnaState === 'active' || s.falnaState === 'unbound';
const canUpdateStatus = (s = S) => s.falnaState === 'active' && !!s.familia && s.falnaHolder === s.familia.id && s.age >= (s.statusResumeAge ?? 0);
const accumulatesExcelia = (s = S) => canUseFalna(s);
const accumulatesPotential = (s = S) => s.falnaState === 'none';
// ── F1D4A N2(2-ii, 사용자 결정 2026-11-23, REVIEW v27 §4.2v): 결과가 바뀌는 두 관문은 활성화 승인 전까지 끈다. 시험·48k 비교에서만 켠다. ──
const N2_GATES = { growth: false, dungeon: false };   // growth: N2-1 (나) 변환·레벨업 관문, dungeon: N2-2 (나) 던전 관문
const PATRON_ABSENCE_REASONS = Object.freeze([]);     // N2-6 A6 허용 사유. 값은 미결정(부재 사건 설계 때 사용자 결정) — 비어 있으면 부재가 시작되지 않는다
// N2-2 (나): 개인 기준 active + 현재 소속의 member(연합 원정 해석 N2-2a: 같은 파밀리아일 필요 없음, 원정 상태는 만들지 않는다)
const canEnterDungeon2ii = (s = S) => deriveFalnaState(s) === 'active' && !!s.familia && (openMembershipOf(s) || {}).role === 'member';
const canEnterDungeon = (s = S) => N2_GATES.dungeon ? canEnterDungeon2ii(s) : canUseFalna(s);   // 2-i 정의(= canUseFalna)는 관문을 켜기 전까지 그대로
// N2-6 A6 정상 객체 판정(own 데이터 속성 since·reason·familiaId 셋, 접근자 호출 없음)
function patronAbsenceValid(pa, s = S) {
    if (!choiceIsPlainObj(pa)) return false;
    const keys = Reflect.ownKeys(pa); if (keys.length !== 3) return false;
    const v = {};
    for (const k of ['since', 'reason', 'familiaId']) { const d = Object.getOwnPropertyDescriptor(pa, k); if (!d || !('value' in d)) return false; v[k] = d.value; }
    if (!Number.isSafeInteger(v.since) || v.since < 0 || !(Number.isSafeInteger(s.age) && v.since <= s.age)) return false;
    if (typeof v.reason !== 'string' || !v.reason || !PATRON_ABSENCE_REASONS.includes(v.reason)) return false;
    return typeof v.familiaId === 'string' && !!v.familiaId && gachaData.familias.some(f => f.id === v.familiaId);
}
// §4.2e ③ absenceOK(N2-6 (가)): null 이면 참. 정상 부재·holder 불일치·스키마 위반(undefined 포함)은 거짓(fail-closed), 진단은 S 밖
function absenceOK(s = S) {
    let pa; try { const d = Object.getOwnPropertyDescriptor(s, 'patronAbsence'); pa = d && 'value' in d ? d.value : undefined; } catch (e) { syncInvariantLog.push({ kind: 'absence_read_error' }); return false; }
    if (pa === null) return true;
    let valid; try { valid = patronAbsenceValid(pa, s); } catch (e) { valid = false; }
    if (!valid) { syncInvariantLog.push({ kind: 'absence_malformed', at: s.age }); return false; }
    if (pa.familiaId !== deriveFalnaHolder(s)) { syncInvariantLog.push({ kind: 'absence_holder_mismatch', at: s.age }); return false; }
    return false;   // 부재 중: 갱신하지 않는다(정상 동작)
}
// N2-1 (나) + N2-1b (가): 세 변환 경로가 같은 유도 상태 판정을 쓴다(§4.2c ②). resumeOK 는 넣지 않는다(유예 없음). canUpdateStatus 는 정의만 보존(N2-4)
const canConvertExcelia = (s = S) => (s.flags || []).includes('falna') && deriveFalnaState(s) === 'active' && !!s.familia && deriveFalnaHolder(s) === s.familia.id && absenceOK(s);
// N2-6 A3: 가드를 통과한 소속 전이에서 첫 소속 대입 직전에 부재를 끝낸다(S1~S5). 부재가 없으면 아무것도 하지 않는다(필드도 만들지 않음)
function endPatronAbsenceForTransition(site) {
    if (S.patronAbsence == null) return;
    const pa = S.patronAbsence, prev = S.familia ? S.familia.id : null;
    const fid = pa && typeof pa === 'object' ? pa.familiaId : undefined;
    if (fid !== prev) syncInvariantLog.push({ kind: 'absence_end_mismatch', site, at: S.age });   // A3-2 손상 상태: 종료하고 진단 1건(S 밖)
    S.patronAbsence = null;
}
// N2-6 A1(시작)·A4(귀환)·A5(중복 종료). 불변 객체로 교체한다(A2). 조건이 맞지 않으면 상태 불변 + 진단 1건(S 밖)
function applyPatronAbsence(mode, reason) {
    if (mode === 'begin') {
        const ok = deriveFalnaState() === 'active' && !!S.familia && deriveFalnaHolder() === S.familia.id && S.falnaHolder === S.familia.id && S.patronAbsence === null;
        const next = ok ? Object.freeze({ since: S.age, reason, familiaId: S.familia.id }) : null;
        if (!ok || !patronAbsenceValid(next)) { syncInvariantLog.push({ kind: 'absence_begin_rejected', at: S.age }); return false; }
        S.patronAbsence = next; return true;
    }
    if (mode === 'end') {
        if (S.patronAbsence === null) return false;   // A5: 아무것도 하지 않는다
        const pa = S.patronAbsence;
        if (patronAbsenceValid(pa) && S.familia && pa.familiaId === S.familia.id && deriveFalnaHolder() === S.familia.id) { S.patronAbsence = null; return true; }
        syncInvariantLog.push({ kind: 'absence_end_rejected', at: S.age }); return false;
    }
    syncInvariantLog.push({ kind: 'absence_unknown_mode', at: S.age }); return false;
}
const combatClassOf = (s = S) => JOB_ROLE_CLASS[s.job] || null;

// ── 동기화 범위(설계 §2.8 d-1). apply·checkFalna·rollFamilia 만 범위를 연다. ──
function pushFalnaTransition(rec) { S.falnaTransitions ||= []; S.falnaTransitions.push({ age: S.age, ...rec }); }
function updateConversionPending(from, to, dropped, eventId, fromFamiliaId) {
    if (to === 'active') S.conversionPending = null;
    else if (from === 'active' && to === 'unbound') S.conversionPending = { since: S.age, fromFamiliaId, reason: 'left' };
    else if (to === 'sealed' && from !== 'sealed' && dropped) S.conversionPending = { since: S.age, fromFamiliaId, reason: eventId === 'god_gone' ? 'god_returned' : 'sealed_other' };
}
function lastClosedFamiliaId() { const h = (S.familiaHistory || []).filter(m => m.leftAt != null); return h.length ? h[h.length - 1].familiaId : null; }
// 예외로 남은 기준값(또는 비정상 normal 기준값)과 지금 상태를 비교해 복구 전이를 남긴다.
function recoverFromBaseline(b, token, cause) {
    const to = deriveFalnaState(), holderTo = deriveFalnaHolder();
    if (to !== b.state || holderTo !== b.holder) {
        pushFalnaTransition({ from: b.state, to, holderFrom: b.holder, holderTo, cause, eventId: b.eventId, fromFamiliaId: b.openFamiliaId,
            originalEventId: b.eventId, originalScopeKind: b.scopeKind, originalFxKeys: b.fxKeys, originalAt: b.at, recoveredAt: S.age,
            recoveredAtScopeKind: token ? token.kind : 'endLife', recoveredAtEventId: S.currentEventId ?? null });
        updateConversionPending(b.state, to, (b.fxKeys || []).includes('dropFamilia'), b.eventId, b.openFamiliaId);
    }
    S.falnaState = to; S.falnaHolder = holderTo;
}
function openScopeBaseline(token, fx) {
    const b = S.syncBaseline;
    if (b && b.status === 'normal') { syncInvariantLog.push({ kind: 'stale_normal_baseline', at: S.age, scopeKind: token.kind }); recoverFromBaseline(b, token, 'recovered_after_exception'); }
    else if (b && b.status === 'pending_after_exception') recoverFromBaseline(b, token, 'recovered_after_exception');
    else if (S.falnaState !== deriveFalnaState() || (S.falnaHolder ?? null) !== deriveFalnaHolder()) syncInvariantLog.push({ kind: 'stored_state_mismatch', at: S.age, scopeKind: token.kind });
    S.syncBaseline = { status: 'normal', state: deriveFalnaState(), holder: deriveFalnaHolder(), openFamiliaId: S.familia ? S.familia.id : null,
        flag: S.flags.includes('falna'), scopeKind: token.kind, eventId: S.currentEventId ?? null, fxKeys: fx && typeof fx === 'object' ? Object.keys(fx) : [], at: S.age };
}
function classifyFalnaCause(b, to, kind, fx) {
    if (kind === 'checkFalna') return to === 'active' ? 'grant' : 'unclassified';
    if (b.state === 'none' && to === 'active') return 'grant';
    const f = fx && typeof fx === 'object' ? fx : {};
    const dropped = !!f.dropFamilia, clearsFalna = Array.isArray(f.clearFlags) && f.clearFlags.includes('falna');
    if (b.state === 'active' && to === 'unbound' && dropped && !clearsFalna) return 'drop_familia';
    if (to === 'sealed' && dropped && clearsFalna) return 'leave_and_seal';
    if (to === 'sealed' && !dropped && clearsFalna) return 'clear_falna_only';
    if (b.state === 'active' && to === 'active' && f.familia === 'rebind') return 'legacy_auto_convert';
    const joins = f.familia === 'roll' || f.familia === 'rebind' || !!f.recruit;   // 2b-b: fx.recruit 는 기존 fx.familia:'roll' 입단 경로를 대체(분류 동일)
    if (b.state === 'unbound' && to === 'active' && joins) return 'legacy_rejoin';
    if (b.state === 'sealed' && to === 'active' && joins) return 'legacy_sealed_join';
    return 'unclassified';
}
// 가장 바깥 범위의 정상 종료 지점(설계 §2.8 d-1 ③). 안쪽 범위·이미 동기화된 범위는 아무것도 하지 않는다.
function syncAtScopeEnd(token, fx) {
    if (!token.outermost || token.synced) return;
    token.synced = true;
    const b = S.syncBaseline;
    if (!b) { syncInvariantLog.push({ kind: 'missing_baseline_at_sync', at: S.age, scopeKind: token.kind }); return; }
    const to = deriveFalnaState(), holderTo = deriveFalnaHolder();
    if (to !== b.state || holderTo !== b.holder) {
        let cause = classifyFalnaCause(b, to, token.kind, fx);
        let fromFamiliaId = b.openFamiliaId;
        if (b.state === 'active' && fromFamiliaId == null) { fromFamiliaId = lastClosedFamiliaId(); cause += '_recovered'; }
        pushFalnaTransition({ from: b.state, to, holderFrom: b.holder, holderTo, cause, eventId: b.eventId, scopeKind: token.kind, fromFamiliaId });
        const f = fx && typeof fx === 'object' ? fx : {};
        updateConversionPending(b.state, to, !!f.dropFamilia, b.eventId, fromFamiliaId);
    }
    S.falnaState = to; S.falnaHolder = holderTo; S.syncBaseline = null;
}
function endScope(token) {
    syncDepth--;
    if (syncDepth < 0) syncInvariantLog.push({ kind: 'sync_depth_negative', value: syncDepth });
    if (token.outermost && !token.synced && S && S.syncBaseline) S.syncBaseline.status = 'pending_after_exception';
}
function withScope(kind, fx, body) {
    const token = { kind, outermost: syncDepth === 0, synced: false };
    syncDepth++;
    try {
        if (token.outermost) openScopeBaseline(token, fx);
        const r = body(token);
        if (token.outermost && !token.synced) syncAtScopeEnd(token, fx);
        return r;
    } finally { endScope(token); }
}

// ── 입단 호출 모드(설계 §2.3.2). 모드는 인자로만 쓰고 S·게임 데이터에 저장하지 않는다(Q18). ──
function rollModeAllowed(mode) {
    const st = deriveFalnaState(), cp = S.conversionPending ?? null;
    const noOpen = !S.familia && !openMembershipOf();   // legacy_rejoin 전용: 열린 소속 이력이 남은 오염 unbound 거부(M4)
    if (mode === 'initial_join') return st === 'none' && cp === null && !S.familia;   // 설계 §2.3.2 그대로(열린 이력 검사 없음 — r1 단위 테스트의 오염 상태 입단 보존)
    if (mode === 'legacy_rejoin') return st === 'unbound' && S.flags.includes('falna') && noOpen && !!cp && cp.reason === 'left';
    if (mode === 'legacy_rebind') return true;      // 2-i: 가드 없음(현행 'roll' 과 같은 동작). active-only 가드는 2-ii
    // 2-i 결과 보존(Q20 승인 D-2): 입단 3종의 sealed 차단(D-1)은 2-ii 로 이동했고, sealed 의 'roll' 은 현행처럼 가드 없이 처리한다. 2-ii 에서 거부로 전환.
    if (mode === 'legacy_sealed_join') return true;
    if (mode === 'newborn_control') return S.age === 0 && st === 'none' && !!NEWBORN_MEMBERSHIP;
    return false;
}
const rollModeFor = fxFamilia => {
    if (fxFamilia === 'rebind') return 'legacy_rebind';
    const st = deriveFalnaState();
    return st === 'unbound' ? 'legacy_rejoin' : st === 'sealed' ? 'legacy_sealed_join' : 'initial_join';
};

// ── 전이 함수(설계 §2.3·§2.3.1). 2-i 에서는 정의·단위 테스트만 하고 게임 흐름에서 호출하지 않는다. ──
function rejectFalnaTransition(to, why) { pushFalnaTransition({ from: S.falnaState, to, holderFrom: S.falnaHolder ?? null, holderTo: S.falnaHolder ?? null, cause: 'rejected', reason: why, eventId: S.currentEventId ?? null }); return false; }
function falnaTransitionAllowed(from, to) { return !(FALNA_FORBIDDEN[from] || []).includes(to); }
function leaveFamilia() {
    if (haltedEntry('leaveFamilia')) return;   // H3 정지 가드
     // 명시적 탈퇴: active → unbound (2-ii 에서 연결)
    if (!S.familia) return false;   // 무소속이면 무변화(T3b)
    const from = S.falnaState, fromFamiliaId = S.familia.id;
    if (from === 'active' && !falnaTransitionAllowed(from, 'unbound')) return rejectFalnaTransition('unbound', 'forbidden');
    endPatronAbsenceForTransition('leaveFamilia');   // A3 S5(게임 흐름 미연결, Q5)
    closeMembership('left'); S.familia = null; S.falnaAt = null; S.familiaAt = null;
    if (from === 'active') S.statusResumeAge = null;   // RA-3
    const to = deriveFalnaState();
    if (to !== from || S.falnaHolder != null) {
        pushFalnaTransition({ from, to, holderFrom: S.falnaHolder ?? null, holderTo: null, cause: 'leave', eventId: S.currentEventId ?? null, fromFamiliaId });
        if (to === 'unbound') S.conversionPending = { since: S.age, fromFamiliaId, reason: 'left' };
    }
    S.falnaState = to; S.falnaHolder = null;
    return true;
}
function sealByGodReturn() {
    if (haltedEntry('sealByGodReturn')) return;   // H3 정지 가드
     // 신의 송환: active → sealed, 레벨·능력치 보존, 직업 불변 (2-ii 에서 연결)
    if (S.falnaState !== 'active' || !S.familia) return rejectFalnaTransition('sealed', 'not_active_member');
    const fromFamiliaId = S.familia.id, holderFrom = S.falnaHolder;
    endPatronAbsenceForTransition('sealByGodReturn');   // A3 S2
    closeMembership('god_returned'); S.familia = null; S.falnaAt = null; S.familiaAt = null;
    S.flags = S.flags.filter(f => f !== 'falna');
    pushFalnaTransition({ from: 'active', to: 'sealed', holderFrom, holderTo: null, cause: 'god_returned', eventId: S.currentEventId ?? null, fromFamiliaId });
    S.falnaState = 'sealed'; S.falnaHolder = null; S.conversionPending = { since: S.age, fromFamiliaId, reason: 'god_returned' };
    S.statusResumeAge = null;   // RA-3: active 에서 나가는 전이
    return true;
}
// 후보 파밀리아 선택만(입단 기록·직업·falnaAt·checkFalna 없음). rollFamilia 와 같은 가중치·같은 난수 소비.
// 2b-a: opts.exclude(파밀리아 id 목록)는 후보에서 뺀다(송환된 주신의 파밀리아, 사용자 결정 2026-11-07). 기존 호출(인자 없음)은 동작 불변.
function pickFamiliaCandidate(forcedId, opts) {
    const exclude = (opts && Array.isArray(opts.exclude)) ? opts.exclude : [];
    const pool = gachaData.familias.filter(f => f.id !== 'civilian' && !exclude.includes(f.id)).map(f => {
        const bias = (FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1;
        const parentBias = (S.parentFamilia && S.parentFamilia.id === f.id) ? PARENT_FAMILIA_BIAS : 1;   // 부모 소속 파밀리아 추천(임의 가중치)
        return { ...f, w: f.weight * bias * parentBias };
    });
    return forcedId ? pool.find(f => f.id === forcedId) : getRandomItemByWeight(pool, 'w');
}
// ── 2b-b(v1.7.8-2bb): 일반 지원 → 심사 → 결과(accepted/rejected)·재지원 쿨다운·직접 스카웃 ─────────────────
// 난수: 후보 선택(pickFamiliaCandidate)·falnaAt 은 기존 주 RNG 그대로(U-2b-2 a). 심사는 파생 RNG(주 RNG 비소비).
// 합격 경로의 주 RNG 소비 = 기존 rollFamilia 와 같음(후보 1회 + falnaAt). 거절 시 falnaAt 소비만 빠진다.
function recruitRng(attempt) {
    return GameCore.Recruit.createDerivedRng(GameCore.Lineage.fnv(S.lineageSeed >>> 0, 'recruit:' + S.age + ':' + attempt));
}
function recruitExcludedFamilias() {   // 거절한 파밀리아는 sameFamiliaRetryYears 동안 후보에서 뺀다
    const T = GameCore.Recruit.RECRUIT_TUNING;
    return (S.application.history || []).filter(h => !h.direct && h.outcome === 'rejected' && S.age - h.at < T.sameFamiliaRetryYears).map(h => h.familiaId);
}
function recruitBlockReason() {
    const T = GameCore.Recruit.RECRUIT_TUNING, gen = (S.application.history || []).filter(h => !h.direct);
    if (gen.length >= T.lifetimeApplicationCap) return 'lifetime_cap';
    const lastRej = gen.filter(h => h.outcome === 'rejected').pop();
    if (lastRej && S.age - lastRej.at < T.rejectCooldownYears) return 'cooldown';
    return null;
}
function applyRecruit(spec) {
    if (haltedEntry('applyRecruit')) return;   // H3 정지 가드
    const R = GameCore.Recruit, route = spec && spec.route;
    if (!R.ROUTES.includes(route)) { syncInvariantLog.push({ kind: 'recruit_unknown_route', value: route, eventId: S.currentEventId ?? null }); return false; }
    S.application ||= R.newApplicationState();
    const mode = rollModeFor('roll');
    // 직접 경로(scout): 신청 상태를 만들지 않는다. 기존 rollFamilia 와 같은 동작·난수.
    if (R.DIRECT_ROUTES.includes(route)) {
        const before = (S.familiaHistory || []).length;
        rollFamilia(undefined, mode);
        if ((S.familiaHistory || []).length > before && S.familia) S.application.history.push({ route, at: S.age, attempt: null, familiaId: S.familia.id, outcome: 'accepted', direct: true });
        return true;
    }
    // 2-i 가드에 걸리는 상태면 기존 거부 기록 경로를 그대로 탄다(난수 0, 지원 기록 없음).
    if (!rollModeAllowed(mode)) return rollFamilia(undefined, mode);
    const blocked = recruitBlockReason();
    if (blocked) {
        (S.application.blocked ||= []).push({ route, at: S.age, reason: blocked });
        say(blocked === 'cooldown' ? '얼마 전 거절당한 기억 때문에 이번에는 지원하지 못했다.' : '더는 파밀리아의 문을 두드릴 기력이 남지 않았다.', 'result');
        if (spec.followup) createFollowup(spec.followup, { route, reason: blocked });   // F-1(C23·C27): 자동 대체 효과 없음. 생존 확인 뒤 후속 선택으로 이어진다
        return false;
    }
    const attempt = (S.application.attemptSeq || 0) + 1; S.application.attemptSeq = attempt;
    const cand = pickFamiliaCandidate(undefined, { exclude: recruitExcludedFamilias() });   // 주 RNG 1회(기존 후보 선택)
    if (!cand) throw new Error('recruit: empty candidate pool');
    S.application.current = { route, at: S.age, attempt, familiaId: cand.id };
    const ev = R.evaluateApplication({ route, raceId: S.race && S.race.id, talentId: S.talent && S.talent.id, power: S.power,
        familiaAdv: !!(MODS.familias[cand.id] || {}).adv, familiaWeight: cand.weight }, recruitRng(attempt));
    S.application.history.push({ route, at: S.age, attempt, familiaId: cand.id, outcome: ev.outcome, p: ev.p });
    S.application.current = null;
    if (ev.outcome === 'accepted') {
        if (spec.okText) say(spec.okText, 'result');
        rollFamilia(cand.id, mode);   // forcedId: 추가 후보 난수 없음 → falnaAt 주 RNG 는 기존과 같음
        return true;
    }
    // T-1: 거절 문구에 {familia} 치환자가 있으면 파밀리아 이름으로 바꾸고 접미사를 붙이지 않는다(이름 1회). 치환자가 없으면 기존 접미사를 유지한다.
    { const failText = spec.failText || '받아 주는 신을 찾지 못했다.';
      say(failText.includes('{familia}') ? failText.split('{familia}').join(cand.label) : failText + ` (${cand.label} 심사 탈락)`, 'result'); }
    if (spec.followup) createFollowup(spec.followup, { route, reason: 'rejected' });      // F-1(C23·C27)
    return false;
}
// F1-d4a 퇴직금 고정액(C31). **액수는 사용자 미결** — 숫자가 정해지기 전에는 null 로 두고 지급하지 않는다(임의 금액 금지).
const SEVERANCE_AMOUNT = null;
// ── F-1 후속 선택(일반 지원 거절·차단 뒤): 선택지 C25 + S-1. 자동 진행은 항상 stay(C21·C24). 선택지 노출은 C20(이미 서포터면 숨김). ──
FOLLOWUP_KINDS.recruit_after_fail = {
    prompt: '앞으로 어떻게 지낼까?',
    options(S) {
        const list = [];
        if (S.job !== 'supporter') {
            const label = S.employer ? '현재 고용처를 그만두고 서포터로 전직한다'
                : S.job === 'retired' ? '은퇴 생활을 접고 서포터 일을 시작한다'
                : S.job === 'child' ? '서포터 일을 시작한다'
                : '현재 직업을 그만두고 서포터로 전직한다';
            list.push({ id: 'supporter', label });
        }
        list.push({ id: 'stay', label: '지금 생활을 이어간다', stay: true });
        return list;
    },
    resolve(S, optionId) {
        if (optionId === 'stay') return;                 // C29: 아무 상태도 바꾸지 않는다
        if (optionId !== 'supporter') throw new Error('recruit_after_fail: 알 수 없는 선택 ' + optionId);
        // ① J-4 판정 스냅숏: 전직 전의 직업·근속으로 고정한다. 이후 단계에서 다시 계산하지 않는다(setJob 뒤에는 근속이 0 이 된다).
        const tenureYears = S.age - S.jobSince;
        const sev = Object.freeze({ job: S.job, jobSince: S.jobSince, age: S.age, tenureYears,
            eligible: S.job !== 'child' && S.job !== 'supporter' && S.job !== 'retired' && Number.isFinite(tenureYears) && tenureYears >= 5,
            employerId: S.employer ? S.employer.id : null, amount: SEVERANCE_AMOUNT });
        followupDiag('severance_snapshot', { sev });
        // ② 고용처 퇴직(C22 E-1): 연표 기록 1건 후 해제. setJob 은 고용처를 건드리지 않으므로 여기서만 처리한다.
        if (S.employer) {
            const text = `${S.employer.label}을(를) 그만두었다.`;
            S.logHistory.push({ age: S.age, type: 'job', kind: 'employer_quit', text });
            S.employer = null;
            sayDomOnly(text, 'result');
        }
        // ③ 주 직업 전환(C28) 후 성공 확인. 팔나·소속·application 은 건드리지 않는다(C30).
        setJob('supporter');
        if (!(S.job === 'supporter' && S.jobSince === S.age && S.flags.includes('supporter'))) throw new Error('recruit_after_fail: 서포터 전직 확인 실패');
        // ④ 퇴직금(C11·C13, 지급 방법 P2): 전직이 끝난 뒤, ①의 스냅숏으로만 판정한다. 자격이 없거나 액수가 0·미결이면 apply 를 부르지 않는다.
        if (sev.eligible) {
            if (Number.isFinite(sev.amount) && sev.amount > 0) {
                apply({ valis: sev.amount });
                const text = `${JOB_LABELS[sev.job] || sev.job}(으)로 ${sev.tenureYears}년 일한 끝에 퇴직금 ${sev.amount}발리스를 받았다.`;
                S.logHistory.push({ age: S.age, type: 'job', kind: 'severance', text });
                sayDomOnly(text, 'result');
            } else {
                followupDiag('severance_amount_undecided', { tenureYears: sev.tenureYears, job: sev.job });
            }
        }
    }
};
// 2b-a: 전이 함수가 범위 안에서 스스로 전이를 기록한 뒤, 범위 끝 동기화가 같은 변화를 다시 기록하지 않도록 기준값을 현재 상태로 맞춘다.
function rebaseSyncAfterTransition() {
    const b = S.syncBaseline;
    if (!b || b.status !== 'normal') return;
    b.state = deriveFalnaState(); b.holder = deriveFalnaHolder(); b.openFamiliaId = S.familia ? S.familia.id : null; b.flag = S.flags.includes('falna');
}
// 2b-a: god_gone 전용. mode = 'seal'(봉인만) | 'regrant'(봉인 후 재수여). 직업은 바꾸지 않는다(Q7). 난수: regrant 의 후보 선택 1회만.
function applyGodReturn(mode) {
    if (haltedEntry('applyGodReturn')) return;   // H3 정지 가드
    if (mode !== 'seal' && mode !== 'regrant') { syncInvariantLog.push({ kind: 'god_return_unknown_mode', value: mode, at: S.age }); return false; }
    if (!sealByGodReturn()) { syncInvariantLog.push({ kind: 'god_return_seal_rejected', at: S.age, eventId: S.currentEventId ?? null }); return false; }
    rebaseSyncAfterTransition();
    if (mode === 'seal') return true;
    const returned = (S.familiaHistory || []).filter(m => m.leftReason === 'god_returned').map(m => m.familiaId);
    const cand = pickFamiliaCandidate(undefined, { exclude: returned });
    if (!cand || !completeConversion(cand.id, 'god_returned')) { syncInvariantLog.push({ kind: 'god_return_regrant_failed', at: S.age, candidate: cand ? cand.id : null }); return false; }
    rebaseSyncAfterTransition();
    // 재수여 = 팔나 재취득: 기존 재취득 경로(checkFalna)와 같은 레벨 이력·로그를 남긴다(레벨·능력치 불변, 난수 0).
    recordLevel('falna_again', S.level, S.level);
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    say(`<b class="lv">팔나 재취득 · Lv.${S.level}</b>`, 'levelup', S.age);
    return true;
}
function completeConversion(familiaId, reason) {
    if (haltedEntry('completeConversion')) return;   // H3 정지 가드
     // 유일한 unbound/sealed → active 경로(2-ii 에서 연결)
    const from = S.falnaState;
    if (!(S.conversionPending != null && !S.familia && (from === 'unbound' || from === 'sealed'))) return rejectFalnaTransition('active', 'precondition');
    const fam = gachaData.familias.find(f => f.id === familiaId);
    if (!fam || fam.id === 'civilian') return rejectFalnaTransition('active', 'unknown_familia');
    endPatronAbsenceForTransition('completeConversion');   // A3 S3(사전 조건·목적지 검증 뒤)
    S.familia = fam; S.familiaAt = S.age;
    ensureHistory(); closeMembership('changed');
    S.nextMembershipId = (S.nextMembershipId || 1);
    S.familiaHistory.push({ id: S.nextMembershipId++, familiaId: fam.id, label: fam.label, joinedAt: S.age, leftAt: null, leftReason: null,
        falnaAt: S.age, falnaAlreadyHeld: true, viaParent: false, viaConversion: true, role: 'member' });
    if (from === 'sealed') { S.flags.push('falna'); S.falnaHistory.push({ familiaId: fam.id, at: S.age, membershipIndex: S.familiaHistory.length - 1, kind: 'regrant' }); }
    pushFalnaTransition({ from, to: 'active', holderFrom: null, holderTo: fam.id, cause: from === 'sealed' ? 'regrant' : 'convert', reason: reason || null, eventId: S.currentEventId ?? null });
    S.falnaState = 'active'; S.falnaHolder = fam.id; S.conversionPending = null; S.statusResumeAge = null;   // N2-1b (가)·변경 이력 #2: 유예 없음(이전 S.age + 1)
    if (from === 'sealed') GameCore.Growth.carryPotential(S);   // N2-3c (나): 즉시 재수여에도 이월(봉인 기간 잠재력)
    return true;
}

// S.power는 이벤트 판정용 종합 전투력입니다. 성장 계산은 core/growth.js가 담당합니다.
function recompute() {
    if (haltedEntry('recompute')) return;   // H3 정지 가드
    // 장착 중인 무기·방어구만 전투력에 반영한다. 소모품은 사용될 때만 효과가 난다(core/items.js).
    const itemPower = GameCore.Items.equipmentPower(S);

    if (hasFalna()) {
        const abilityTotal = GameCore.Growth.getAbilityTotal(S);
        const hidden = Number.isFinite(S.hidden) ? Math.max(0, S.hidden) : 0;
        const level = Number.isFinite(S.level) ? Math.max(1, S.level) : 1;
        S.power = Math.round((abilityTotal / 5 + hidden) / 8 + (level - 1) * 20) + itemPower;
    } else {
        const potential = Number.isFinite(S.potential) ? Math.max(0, S.potential) : 0;
        S.power = Math.round(potential * 0.6) + itemPower;
    }
    if (!Number.isFinite(S.power)) S.power = 0;
}

// 레벨 표시: 팔나 전 '팔나 없음', 팔나 보유 'Lv.N', 팔나가 봉인된 뒤에는 봉인 전 레벨을 함께 표시한다.
function levelLabel() {
    if (hasFalna()) return `Lv.${S.level}`;
    if ((S.levelHistory || []).length) return `봉인(Lv.${S.level})`;
    return '팔나 없음';
}

function recordLevel(kind, from, to) {
    if (haltedEntry('recordLevel')) return;   // H3 정지 가드
    S.levelHistory ||= [];
    S.levelHistory.push({ age: S.age, kind, from, to });
    S.maxLevel = Math.max(S.maxLevel || 0, to);
}

function recordChildhood(age) {
    const rec = GameCore.Lineage.childhoodRecord(S, age);
    if (!rec) return;
    say(`<b>${rec.stage}</b> · ${rec.text}`, 'growth', age);
}

function renderStats() {
    const ageLabel = S.phase + 2 <= S.age ? `${S.age}<small> (체감 ${S.phase})</small>` : S.age;
    $('stats').innerHTML = [['나이', ageLabel], ['체력', Math.round(S.hp)], ['레벨', levelLabel()], ['인연', S.bond], ['발리스', S.valis]]
        .map(([n, v]) => `<div>${n}<b>${v}</b></div>`).join('');
    $('abil').innerHTML = hasFalna() ? ABIL.map(([k, n]) => `<div>${n}<b>${S.abil[k]} ${rankOf(S.abil[k])}</b></div>`).join('') : '';
    $('familia').textContent = `종족: ${GameCore.Lineage.raceLabel(S)} · 직업: ${JOB_LABELS[S.job] || S.job}${(S.aspiration && S.aspiration.kind === 'adventurer' && !hasFalna()) ? '(모험자 지망 · 팔나 전)' : ''} · 소속: ${S.familia ? S.familia.label : '없음'}${S.employer ? ' · 고용처: ' + S.employer.label : ''}`;
    const invStr = (S.items || []).map(id => GameCore.Items.label(S, id)).join(', ');
    if($('inventory')) $('inventory').textContent = invStr ? `소지품: ${invStr}` : '소지품: 없음';
    if ($('relations')) $('relations').textContent = describeRelations();
}

function describeRelations() {
    const living = GameCore.Relations.getLiving(S);
    const count = sub => living.filter(r => r.subType === sub).length;
    const parts = [];
    if (count('parent')) parts.push(`부모 ${count('parent')}${S.parentFamilia ? '(' + S.parentFamilia.label + ')' : ''}`);
    if (count('sibling')) parts.push(`형제 ${count('sibling')}`);
    if (count('child')) parts.push(`자녀 ${count('child')}`);
    const partner = GameCore.Relations.getCurrentPartner(S);
    parts.push(partner ? `연인 ${partner.age}세` : '연인 없음');
    const gone = S.relations.filter(r => r && r.alive === false).length;
    if (gone) parts.push(`떠난 이 ${gone}`);
    return `가족·관계: ${parts.join(' · ')}`;
}

function convertExp() {
    if (haltedEntry('convertExp')) return;   // H3 정지 가드
    if (!hasFalna()) return false;
    if (N2_GATES.growth && !canConvertExcelia(S)) return false;   // N2-1 (나): 적립은 그대로, 변환·레벨업만 관문(활성화 승인 전 꺼짐)
    const converted = GameCore.Growth.convertExcelia(S, MODS);
    // A level-up can become available from a feat-only event after the D-rank
    // threshold was already reached. Re-check even when no new Excelia converted.
    const leveled = tryLevelUp();
    return converted || leveled;
}

// ── F1D4A D-DEVABIL 1단계(설계 r3) ────────────────────────────────────────────────────────────
// 발전 어빌리티 보유 상태는 S.devAbilities(배열 copy-on-write, 동결)·S.devAbilityHistory(append-only)에 둔다. 기본 능력치 S.abil 과 분리.
// 습득은 tryLevelUp 이 Lv.2 이상으로 올린 직후(statusUpdateAfterRankUp)에만. 최초 팔나·재취득·재수여·기록 전용 전이에서는 없음.
// 선택은 S.lineageSeed 기반 결정적 해시(메인 RNG 미사용). 진단은 전용 배열 devAbilityDiagLog(S 밖).
// U-D2(후보 자격·가중치) 미정 → 습득 비활성(devAbilityAcquisitionEnabled = false). 구조·계약만 준비하며 수치를 임의로 정하지 않는다.
// W-D1·W-D2(문안) 미승인 → DEVABIL_TEXT 는 null 이고, null 이면 연표·화면 문구를 남기지 않는다.
const devAbilityDiagLog = [];        // 발전 어빌리티 전용 진단(S 밖). lifeDigest·RNG 에 관여하지 않으며 복원 대상이 아니다.
let devAbilityAcquisitionEnabled = false;
const DEVABIL_TEXT = { acquire: null };
const DEVABIL_RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];
const DEVABIL_HASH_TAG = 'devability-select-v1';
function devAbilityDiag(kind, data) { devAbilityDiagLog.push({ kind, at: S ? S.age : null, level: S ? S.level : null, ...(data || {}) }); }
// 정의 데이터 동결(로드 시 1회). 실행 중 정의 수정 금지 계약.
(function freezeDevAbilityDefs() {
    const defs = gachaData.devAbilities;
    if (!Array.isArray(defs)) return;
    defs.forEach(d => { if (d && typeof d === 'object') { if (d.source && typeof d.source === 'object') Object.freeze(d.source); if (d.eligibility && typeof d.eligibility === 'object') Object.freeze(d.eligibility); Object.freeze(d); } });
    Object.freeze(defs);
})();
// DEV-15: 정의 데이터 검증. 정의 배열 참조 단위로 1회 검증하고 결과를 캐시한다(배열은 동결되어 있어 같은 참조면 내용이 같다).
let devAbilityDefsCache = { ref: undefined, result: null };
function validateDevAbilityDefs(defs) {
    if (devAbilityDefsCache.ref === defs && devAbilityDefsCache.result) return devAbilityDefsCache.result;
    const errors = [];
    try {
        if (!Array.isArray(defs)) errors.push('defs_not_array');
        else {
            const ids = new Set();
            defs.forEach((d, i) => {
                if (!choiceIsPlainObj(d)) { errors.push('def_not_plain:' + i); return; }
                if (typeof d.id !== 'string' || !d.id) errors.push('id:' + i);
                else if (ids.has(d.id)) errors.push('dup_id:' + d.id); else ids.add(d.id);
                if (!Number.isInteger(d.weight) || d.weight < 1) errors.push('weight:' + d.id);
                const e = d.eligibility;
                if (!choiceIsPlainObj(e) || Object.keys(e).join() !== 'minLevel' || !Number.isInteger(e.minLevel) || e.minLevel < 2) errors.push('eligibility:' + d.id);
            });
            const W = defs.reduce((a, d) => a + (d && Number.isInteger(d.weight) ? d.weight : 0), 0);
            if (!(W < 2 ** 31)) errors.push('weight_total');
        }
    } catch (err) { errors.push('exception:' + String(err && err.message)); }
    const result = Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
    devAbilityDefsCache = { ref: defs, result };
    return result;
}
// CT-13: S.lineageSeed 유효성. 대체값·강제 변환·재생성 없음.
function devAbilitySeedValid() {
    const d = Object.getOwnPropertyDescriptor(S, 'lineageSeed');
    return !!d && ('value' in d) && typeof d.value === 'number' && Number.isInteger(d.value) && d.value >= 0 && d.value <= 0xFFFFFFFF;
}
// ① 후보 생성(순수): 자격(eligibility.minLevel ≤ toLevel), 보유 id 제외. 결과는 id 정렬된 [{ id, weight }].
function devAbilityCandidates(defs, toLevel) {
    const held = new Set((Array.isArray(S.devAbilities) ? S.devAbilities : []).map(r => r && r.id));
    return defs.filter(d => !held.has(d.id) && d.eligibility.minLevel <= toLevel).map(d => ({ id: d.id, weight: d.weight }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
// ② 선택(순수, 결정적): fnv(입력) % W 누적 버킷. Math.random·S 쓰기·진단·연표 없음.
function selectDevAbility(sortedCands, seed, toLevel) {
    const W = sortedCands.reduce((a, c) => a + c.weight, 0);
    if (!sortedCands.length || W <= 0) return null;
    const h = GameCore.Lineage.fnv(2166136261, JSON.stringify([DEVABIL_HASH_TAG, seed, toLevel, sortedCands.map(c => [c.id, c.weight])])) >>> 0;
    const r = h % W; let cum = 0;
    for (const c of sortedCands) { cum += c.weight; if (r < cum) return c.id; }
    return null;
}
// ③ 커밋: 습득 하위 트랜잭션(devAbilities·devAbilityHistory·연표 한 줄과 그 화면 요소).
//    실패하면 이 항목들만 복원 → 정지(U-D10: 타이머 취소·정지 안내) → 진단 → 예외 재던짐. 레벨업은 되돌리지 않는다.
// DEV-17 복원 계약(보장 범위):
//  - devAbilities: 동결 배열 copy-on-write 이므로 이전 배열 참조로 되돌리면 내용까지 원래대로다.
//  - devAbilityHistory: **append-only** 계약(기존 항목 수정·삭제 금지, 항목은 동결). 복원은 배열 참조와 길이로 "이번 커밋이 덧붙인 항목"만 제거한다.
//    기존 항목의 값 변경·삭제까지 되돌리는 깊은 복원이 아니다(계약상 그런 변경은 일어나지 않으며 시험 DA-17·DEV-17 로 확인).
//  - logHistory: 길이로 이번 커밋이 덧붙인 항목만 제거(같은 append-only 전제).
//  - 화면(#log): say 가 덧붙인 요소를 커밋 전 마지막 자식 뒤로 모두 제거(DEV-18). 그 밖의 화면은 건드리지 않는다.
function commitDevAbilityChange(change) {
    const entry = Object.freeze({ kind: change.kind, id: change.id ?? null, from: change.from ?? null, to: change.to ?? null, level: S.level, age: S.age });
    let nextArr = null;
    if (change.kind === 'acquire') {
        const rec = Object.freeze({ id: change.id, rank: 'I', exp: 0, acquiredAtLevel: S.level, age: S.age });
        nextArr = Object.freeze((Array.isArray(S.devAbilities) ? S.devAbilities : []).slice().concat([rec]));
    }
    const has = k => Object.prototype.hasOwnProperty.call(S, k);
    const text = change.kind === 'acquire' ? DEVABIL_TEXT.acquire : null;       // W-D2 미승인: null 이면 연표·화면 문구 없음
    const willSay = typeof text === 'string' && !!text;
    const snap = { abHas: has('devAbilities'), abRef: S.devAbilities, hHas: has('devAbilityHistory'), hRef: S.devAbilityHistory,
        hLen: Array.isArray(S.devAbilityHistory) ? S.devAbilityHistory.length : null, logLen: Array.isArray(S.logHistory) ? S.logHistory.length : null,
        logEl: null, domLast: null };
    try {
        if (willSay) { snap.logEl = $('log'); snap.domLast = snap.logEl.lastChild; }   // DEV-18: 문구를 낼 때만 화면 복원 기준점(커밋 전 마지막 자식)
        if (nextArr) { S.devAbilities = nextArr; if (S.devAbilities !== nextArr) throw new Error('devAbilities assignment failed'); }   // 배열 교체(copy-on-write). 비엄격 모드의 조용한 대입 실패도 예외로
        if (!Array.isArray(S.devAbilityHistory)) S.devAbilityHistory = [];
        S.devAbilityHistory.push(entry);                                        // append-only(기존 항목 수정·삭제 금지)
        if (willSay) say(text, 'growth');                                       // 상태·이력 기록 뒤 마지막 단계. 실패하면 화면 요소까지 복원
    } catch (err) {
        progressHalted = true;                                                  // U-D10 첫 문장: 이후 정리 단계가 실패해도 정지는 유지(레벨업은 유지, 정상 진행 재개 금지)
        const errs = [];
        const step = (name, fn) => { try { fn(); } catch (e) { errs.push(name); } };
        step('clearTimers', clearAutoTimers);                                   // DEV-19: 예약된 자동 진행 취소
        step('devAbilities', () => { if (!snap.abHas) delete S.devAbilities; else S.devAbilities = snap.abRef; });
        step('devAbilityHistory', () => { if (!snap.hHas) delete S.devAbilityHistory; else { S.devAbilityHistory = snap.hRef; if (snap.hLen != null) S.devAbilityHistory.length = snap.hLen; } });
        step('logHistory', () => { if (snap.logLen != null && Array.isArray(S.logHistory) && S.logHistory.length > snap.logLen) S.logHistory.length = snap.logLen; });
        step('dom', () => {                                                     // DEV-18: say 가 덧붙인 화면 요소 제거(DOM 삽입 뒤 logHistory·스크롤 단계 실패 포함)
            const el = snap.logEl; if (!el) return;
            while (el.lastChild && el.lastChild !== snap.domLast) el.removeChild(el.lastChild);
        });
        step('notice', showHaltNotice);                                         // DEV-19: 정지 안내(화면 전용, 기존 문구 재사용). 화면 복원 뒤에 붙인다
        step('diag', () => devAbilityDiag('devability_commit_failed', { change: change.kind, id: change.id ?? null, message: String(err && err.message), restoreErrors: errs }));
        throw err;
    }
    return true;
}
// Lv.2 이상 실제 레벨업 직후의 스테이터스 갱신(습득). tryLevelUp 에서만 부른다.
function statusUpdateAfterRankUp(fromLevel, toLevel) {
    if (!(toLevel >= 2) || !devAbilityAcquisitionEnabled) return false;      // U-D2 미정 동안 비활성
    // DEV-21: 습득 단계의 모든 쓰기보다 먼저 팔나 상태를 확인한다. 기록 상태(S.falnaState, canUseFalna)와 판정 원천(deriveFalnaState: flag·소속·이력)이
    // **둘 다** active·unbound 여야 한다(U-D8). sealed·none 이거나 둘 중 하나라도 어긋나면 습득 0 + 진단만(fail-closed). 레벨업·팔나 상태는 바꾸지 않는다.
    // 범위 안에서 소속만 바뀐 경우(기록 active / 원천 unbound)는 둘 다 허용 상태이므로 통과한다.
    { const stored = S.falnaState, derived = deriveFalnaState();
      if (!canUseFalna() || (derived !== 'active' && derived !== 'unbound')) { devAbilityDiag('devability_falna_blocked', { stored: stored ?? null, derived }); return false; } }
    const defs = gachaData.devAbilities, v = validateDevAbilityDefs(defs);
    if (!v.ok) { devAbilityDiag('devability_definition_invalid', { errors: v.errors.slice() }); commitDevAbilityChange({ kind: 'definition_invalid' }); return false; }
    if (!devAbilitySeedValid()) { devAbilityDiag('devability_seed_invalid', {}); return false; }   // 습득 0 + 진단만
    const cands = devAbilityCandidates(defs, toLevel);
    const id = selectDevAbility(cands, S.lineageSeed, toLevel);
    if (!id) { commitDevAbilityChange({ kind: 'no_candidate' }); return false; }
    if ((S.devAbilities || []).some(r => r && r.id === id)) { devAbilityDiag('devability_duplicate_acquire', { id }); return false; }
    return commitDevAbilityChange({ kind: 'acquire', id, to: 'I' });
}

function tryLevelUp() {
    if (haltedEntry('tryLevelUp')) return;   // H3 정지 가드
    const level = Number.isFinite(S.level) ? Math.max(1, S.level) : 1;
    const feat = Number.isFinite(S.feat) ? Math.max(0, S.feat) : 0;
    const validStats = ABIL.map(([k]) => Number.isFinite(S.abil[k]) ? Math.max(0, S.abil[k]) : 0);
    if (level >= MAX_LEVEL || feat < level) return false;
    if (Math.max(...validStats) < LEVELUP_ABIL) return false;
    const sum = validStats.reduce((total, value) => total + value, 0);
    S.feat = Math.max(0, feat - level);
    S.level = level + 1;
    S.hidden = Math.max(0, Number.isFinite(S.hidden) ? S.hidden : 0) + sum / 5 * 0.5;
    ABIL.forEach(([k]) => { S.abil[k] = 0; });
    recordLevel('levelup', level, S.level);
    say(`위업을 인정받아 위계가 승화되었다. <b class="lv">Lv.${level} → Lv.${S.level}</b>`, 'event levelup');
    S.alias = pickAlias();
    if (S.level >= 2) say(`신회에서 이명이 정해졌다: ${S.alias.label}`, 'result');
    statusUpdateAfterRankUp(level, S.level);   // F1D4A D-DEVABIL: 레벨업 공식 뒤에만 덧붙임(레벨업은 되돌리지 않음)
    return true;
}

function apply(fx = {}) {
    if (haltedEntry('apply')) return;   // H3 정지 가드
    if (!fx || typeof fx !== 'object') fx = {};
    return withScope('apply', fx, token => applyEffects(fx, token));   // v1.7.8-2i: 동기화 범위(기록 전용)
}
function applyEffects(fx, token) {
    for (const k of ['hp', 'bond', 'valis', 'feat']) {
        const delta = Number(fx[k]);
        if (Number.isFinite(delta)) S[k] = (Number.isFinite(S[k]) ? S[k] : 0) + delta;
    }
    if (Number.isFinite(Number(fx.power))) GameCore.Growth.addExperience(S, Number(fx.power));
    S.hp = Math.min(GameCore.Items.hpCap(S), Number.isFinite(S.hp) ? S.hp : 0);
    for (const k of ['bond', 'valis', 'feat', 'potential', 'excelia']) {
        S[k] = Math.max(0, Number.isFinite(S[k]) ? S[k] : 0);
    }
    (Array.isArray(fx.flags) ? fx.flags : []).forEach(f => { if (typeof f === 'string' && !S.flags.includes(f)) S.flags.push(f); });

    if (fx.relationship === 'romance') {
        const partner = GameCore.Relations.createRomanticPartner(S, 'event', relationCtx());
        if (partner) say('새로운 인연과 연인 관계가 되었다.', 'result');
    }
    if (fx.relationship === 'child') {
        const child = GameCore.Relations.createChild(S, relationCtx());
        if (child) say('새로운 가족이 생겼다.', 'result');
    }
    if (fx.relationshipEnd === 'breakup' && S.partnerId != null) {
        GameCore.Relations.endRelationship(S, S.partnerId, 'breakup');
        say('서로 다른 길을 걷기로 했다.', 'result');
    }
    if (fx.partnerDeath === true && S.partnerId != null) {
        GameCore.Relations.endRelationship(S, S.partnerId, 'deceased');
        say('소중한 사람이 세상을 떠났다.', 'result');
    }
    
    if (fx.job) setJob(fx.job);
    else if ((fx.flags || []).includes('supporter') && S.job === 'child') setJob('supporter');
    else if ((fx.flags || []).includes('soldier') && S.job !== 'soldier') setJob('soldier');
    
    if (fx.getItem) {
        const got = GameCore.Items.acquire(S, fx.getItem);
        if (got.consumedOnAcquire && got.def) say(`[${got.def.label}]을(를) 사용해 효과를 얻었다. 물건은 사라졌다.`, 'result');
        else if (got.added && got.def) say(`아이템 획득: [${GameCore.Items.label(S, fx.getItem)}]`, 'result');
    }
    if (fx.loseItem) {
        GameCore.Items.remove(S, fx.loseItem);
        say(`아이템 상실: [${fx.loseItem}]`, 'result bad');
    }
    
    if (fx.milestone) {
        const id = fx.milestone;
        if (!S.milestones.some(m => m.id === id)) {
            const ending = gachaData.endings.find(e => e.id === id);
            S.milestones.push({ id, label: ending ? ending.label : id, age: S.age });
            say(`일생의 업적을 달성했다: ${ending ? ending.label : id}`, 'result', S.age);
        }
    }
    
    // ⑥a 2b-a(Q2 승인분): 신의 송환 = 봉인(sealByGodReturn), 'regrant' 면 송환된 파밀리아를 뺀 후보로 재수여(completeConversion).
    //     clearFlags·dropFamilia 보다 먼저 처리한다. 전이 함수가 스스로 전이를 기록하므로 범위 기준값을 갱신해 이중 기록을 막는다.
    if (fx.godReturn) applyGodReturn(fx.godReturn);
    if (Array.isArray(fx.clearFlags)) S.flags = S.flags.filter(f => !fx.clearFlags.includes(f));
    if (Array.isArray(fx.clearFlags) && fx.clearFlags.includes('adventurer') && S.job === 'adventurer') setJob('retired');
    if (fx.dropFamilia) { if (S.familia) { endPatronAbsenceForTransition('dropFamilia'); if (hasFalna()) S.statusResumeAge = null; }   // A3 S4·RA-3
        closeMembership('left'); S.familia = null; S.falnaAt = null; S.familiaAt = null; if (S.job === 'adventurer' || S.job === 'supporter') setJob('retired'); }
    // 신의 파밀리아 전용 추첨(조직 고용은 fx.organization). 2-i: 'roll' 은 호출 시점 상태로 모드 결정, 'rebind' 는 legacy_rebind(Q16).
    if (fx.familia === 'roll' || fx.familia === 'rebind') rollFamilia(undefined, rollModeFor(fx.familia));
    if (fx.recruit) applyRecruit(fx.recruit);   // 2b-b: 지원→심사→결과(일반) / 직접 스카웃
    if (fx.patronAbsence) applyPatronAbsence(fx.patronAbsence, fx.patronAbsenceReason);   // N2-6 A1·A4: 소속 전이 효과 뒤, convertExp 앞(A3-4)
    if (fx.organization) joinOrganization(fx.organization);
    // ⑩ R-i: 거주·복무 기록(난수 0, 팔나·직업·소속·가족·플래그·로그 불변 — I-R1~I-R4)
    if (fx.residence) moveResidence(fx.residence, fx.residenceReason || 'event');
    if (fx.location) moveLocation(fx.location, fx.locationReason || 'event');   // F1D4A P2(E-3): 현재 위치(거주지와 자동 동기화하지 않음)
    if (fx.service) recordService(fx.service);
    syncAtScopeEnd(token, fx);   // v1.7.8-2i 동기화 지점: ⑨ 직후·convertExp 직전(가장 바깥 범위만 기록)
    convertExp(); recompute(); renderStats();
}

// 파밀리아 소속 이력. 입단·탈퇴·변경을 항목별로 남기고, 팔나 취득은 falnaHistory 에 따로 기록한다.
function ensureHistory() {
    if (haltedEntry('ensureHistory')) return;   // H3 정지 가드
    S.familiaHistory ||= []; S.falnaHistory ||= []; }
function closeMembership(reason) {
    if (haltedEntry('closeMembership')) return;   // H3 정지 가드
    ensureHistory();
    const open = S.familiaHistory.find(m => m.leftAt == null);
    if (open) { open.leftAt = S.age; open.leftReason = reason; }
}
function openMembership() {
    if (haltedEntry('openMembership')) return;   // H3 정지 가드
    ensureHistory();
    closeMembership('changed');
    S.nextMembershipId = (S.nextMembershipId || 1);
    S.familiaHistory.push({ id: S.nextMembershipId++, familiaId: S.familia.id, label: S.familia.label, joinedAt: S.age, leftAt: null, leftReason: null,
        falnaAt: null, falnaAlreadyHeld: hasFalna(), viaParent: !!(S.parentFamilia && S.parentFamilia.id === S.familia.id) });
}

// 조직·고용처에 고용된다(팔나 없음). 파밀리아 추첨과 섞지 않으며, fx.organization 으로 명시된 이벤트 선택에서만 호출된다.
function joinOrganization(orgId) {
    if (haltedEntry('joinOrganization')) return;   // H3 정지 가드
    const org = (gachaData.organizations || []).find(o => o.id === orgId);
    if (!org) throw new Error('unknown organization: ' + orgId);
    S.employer = { id: org.id, label: org.label, kind: org.kind, since: S.age };
    if (S.job === 'child' && JOB_ORG[org.id]) setJob(JOB_ORG[org.id]);
    say(`${org.label}에 고용되었다 — ${org.desc} (신의 파밀리아가 아니므로 팔나는 받지 않는다)`, 'result');
    apply((MODS.organizations[org.id] || {}).fx);
}

// mode: v1.7.8-2i 입단 호출 모드(설계 §2.3.2). 가드는 난수 사용 전에 검사한다. mode 없이 부르면 기존 동작(가드 없음).
function rollFamilia(forcedId, mode) {
    if (haltedEntry('rollFamilia')) return;   // H3 정지 가드
    return withScope('rollFamilia', null, () => rollFamiliaBody(forcedId, mode));
}
function rollFamiliaBody(forcedId, mode) {
    if (mode !== undefined && !rollModeAllowed(mode)) {
        pushFalnaTransition({ from: deriveFalnaState(), to: deriveFalnaState(), holderFrom: deriveFalnaHolder(), holderTo: deriveFalnaHolder(), cause: 'rejected', mode, eventId: S.currentEventId ?? null });
        return false;
    }
    const cand = pickFamiliaCandidate(forcedId);   // 난수 소비는 이전과 같다
    if (!cand) { S.familia = cand; throw new Error('unknown familia: ' + forcedId); }   // 무효 후보: 이전과 같은 상태로 예외
    endPatronAbsenceForTransition('rollFamiliaBody');   // A3 S1(모드 가드·목적지 검증 뒤, 첫 대입 직전)
    S.familia = cand;
    if (hasFalna()) S.statusResumeAge = null;   // active 진입(H2 holder 변경·unbound 재입단): 이전 값을 물려받지 않는다
    S.familiaAt = S.age;   // 파밀리아 입단(소속 결정) 달력 나이 — 팔나 취득(falnaAt)과 별개로 기록
    openMembership();
    // Explicit occupational Familia mappings take precedence over the broad
    // 'adv' capability flag (e.g. Hephaestus -> blacksmith, Ares -> soldier).
    const chosenJob = JOB_FAMILIA[S.familia.id] || ((MODS.familias[S.familia.id] || {}).adv ? 'adventurer' : 'merchant');
    // Familia and occupation are independent. Choose a default only for a child
    // who has not selected an occupation; joining/rejoining must not overwrite it.
    if (S.job === 'child') setJob(chosenJob);
    const m = MODS.familias[S.familia.id] || {};
    if (m.adv && !hasFalna()) setAspiration('adventurer', 'familia_join');
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    S.falnaAt = (m.adv || Math.random() < 0.3) ? Math.max(S.age, rnd(m.falna || DEFAULT_FALNA)) : null;   // 팔나 수령은 달력 나이 기준
    // 2a-role(기록만): 팔나를 받을 예정이거나 이미 보유한 소속 = member(정식 팔나 단원), 팔나가 없는 소속 = protected(보호·거주 대상).
    // 판정 로직은 바꾸지 않았다. 조직 고용은 S.employer 로만 기록되며 소속 이력에 들어가지 않는다.
    { const mem = S.familiaHistory[S.familiaHistory.length - 1]; if (mem) mem.role = (S.falnaAt != null || hasFalna()) ? 'member' : 'protected'; }
    apply(m.fx);
    checkFalna();
}

function checkFalna() {
    if (haltedEntry('checkFalna')) return;   // H3 정지 가드
    return withScope('checkFalna', null, checkFalnaBody); }   // v1.7.8-2i: 동기화 범위(기록 전용)
function checkFalnaBody() {
    if (!S.familia || S.falnaAt == null || hasFalna() || S.age < S.falnaAt) return;
    const m = MODS.familias[S.familia.id] || {};
    if (!S.flags.includes('falna')) S.flags.push('falna');
    S.statusResumeAge = null;   // RA-2a: 최초 취득·봉인 뒤 재취득은 값을 명시적으로 쓴다(유예 없음)
    ensureHistory();
    S.falnaHistory.push({ familiaId: S.familia.id, at: S.age, membershipIndex: S.familiaHistory.length - 1 });
    if (S.aspiration && S.aspiration.kind === 'adventurer' && S.aspiration.fulfilledAt == null) { S.aspiration.fulfilledAt = S.age; const h = (S.aspirationHistory || []).filter(x => x.kind === 'adventurer').pop(); if (h) h.fulfilledAt = S.age; }
    const mem = S.familiaHistory[S.familiaHistory.length - 1]; if (mem && mem.leftAt == null) mem.falnaAt = S.age;
    // Familia membership/Falna does not itself define the member's occupation.
    // setJob() remains the only authority for the adventurer role flag.
    if (S.level < 1) { S.level = 1; recordLevel('falna', 0, 1); say(`<b class="lv">팔나 없음 → Lv.1</b>`, 'levelup', S.age); }
    else { recordLevel('falna_again', S.level, S.level); say(`<b class="lv">팔나 재취득 · Lv.${S.level}</b>`, 'levelup', S.age); }
    say(`${S.familia.label}의 신에게 팔나를 받았다. 등에 스테이터스가 새겨졌다.`, 'event', S.age);
    GameCore.Growth.carryPotential(S);     // 팔나 전 잠재력의 일부가 엑세리아로 이월된다
    convertExp(); recompute(); renderStats();
}

// ── R-i(v1.7.8-ri): 거주지 기록 전용 ─────────────────────────────────────────────
// 거주 필드·이력만 바꾼다. S.origin·직업·파밀리아·팔나·가족·연애·아이템·발리스·플래그·로그를 건드리지 않고 난수를 쓰지 않는다.
function moveResidence(toRegionId, reason) {
    if (haltedEntry('moveResidence')) return;   // H3 정지 가드
    if (!REGION_IDS.includes(toRegionId)) { syncInvariantLog.push({ kind: 'residence_unknown_region', value: toRegionId, eventId: S.currentEventId ?? null }); return false; }
    if (!S.residence || !Array.isArray(S.residenceHistory) || S.residenceHistory.length === 0) { syncInvariantLog.push({ kind: 'residence_missing_state', eventId: S.currentEventId ?? null }); return false; }
    if (S.residence.regionId === toRegionId) return false;   // 같은 지역 = 이력 무변화
    const cur = S.residenceHistory[S.residenceHistory.length - 1];
    cur.to = S.age;
    S.residenceHistory.push({ seq: cur.seq + 1, regionId: toRegionId, from: S.age, to: null, reason: reason || 'event', eventId: S.currentEventId ?? null });
    S.residence = { regionId: toRegionId, since: S.age };
    return true;
}
// ── F1D4A P2(E-3): 현재 위치 기록. moveResidence 와 같은 규칙. 거주지·출생지는 건드리지 않는다(자동 동기화 금지). 난수 0. ──
function moveLocation(toRegionId, reason) {
    if (haltedEntry('moveLocation')) return;   // 정지 가드
    if (!REGION_IDS.includes(toRegionId)) { syncInvariantLog.push({ kind: 'location_unknown_region', value: toRegionId, eventId: S.currentEventId ?? null }); return false; }
    if (!S.location || !Array.isArray(S.locationHistory) || S.locationHistory.length === 0) { syncInvariantLog.push({ kind: 'location_missing_state', eventId: S.currentEventId ?? null }); return false; }
    if (S.location.regionId === toRegionId) return false;   // 같은 지역 = 이력 무변화
    const cur = S.locationHistory[S.locationHistory.length - 1];
    cur.to = S.age;
    S.locationHistory.push({ seq: cur.seq + 1, regionId: toRegionId, from: S.age, to: null, reason: reason || 'event', eventId: S.currentEventId ?? null });
    S.location = { regionId: toRegionId, since: S.age };
    return true;
}
// 복무 기록(RES-2 §3.4). S.flags 와 분리. R-i 에서는 생성만 하고 해제·조건 판정에 쓰지 않는다.
function recordService(kind) {
    if (haltedEntry('recordService')) return;   // H3 정지 가드
    if (kind !== 'conscripted' && kind !== 'deserter') { syncInvariantLog.push({ kind: 'service_unknown_kind', value: kind, eventId: S.currentEventId ?? null }); return false; }
    if (!S.service) S.service = {};
    if (S.service[kind]) return false;
    S.service[kind] = kind === 'conscripted'
        ? { since: S.age, regionId: 'rakia', eventId: S.currentEventId ?? null }
        : { since: S.age, fromRegionId: 'rakia', eventId: S.currentEventId ?? null };
    return true;
}

function startLife() {
    progressHalted = false; lifeGen += 1; lastRollbackFailure = null; rollbackFailureUnrecorded = false; lastRollbackReport = null; clearAutoTimers();   // 새 게임: 정지 해제는 여기서만. 이전 생애의 자동 진행 타이머는 세대 불일치로 무효
    // v1.7.8-2i(U3): 깊이는 검사만 하고 바꾸지 않는다(모듈 로드 시 1회 0).
    if (syncDepth !== 0) syncInvariantLog.push({ kind: 'sync_depth_nonzero_at_life_start', value: syncDepth });
    const origin = getRandomItemByWeight(gachaData.origins);
    const race = getRandomItemByWeight(gachaData.races);
    const talent = getRandomItemByWeight(gachaData.talents);
    S = { age: 0, chronologicalAge: 0, physicalAge: 0, phase: 0, hp: 70, power: 0,
          potential: 0, excelia: 0, feat: 0, level: 0, hidden: 0, bond: 0, valis: 0,
          abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }, flags: [], done: [], familia: null, falnaAt: null, familiaAt: null, familiaHistory: [], falnaHistory: [], aspiration: null, aspirationHistory: [], employer: null, parentFamilia: null,
          alias: null, origin, race, talent, cause: '', job: 'child', jobSince: 0,
          pendingFollowup: null, followupSeq: 0,   // T1-F: 후속 선택 보류 상태(생애 시작 시 초기화)·생애 내 일련번호
          eventCounts: {}, lastEventPhase: {}, recentEvents: [], milestones: [], logHistory: [],
          items: [], itemUses: {}, itemsConsumed: [], relations: [], partnerId: null, nextRelationId: 1,
          application: GameCore.Recruit.newApplicationState(), nextMembershipId: 1, minorFamilias: [],
          raceSubtype: null, lineageSeed: 0, levelHistory: [], maxLevel: 0,
          // v1.7.8-2i 기록 필드(설계 §2.8 a): 생성과 동시에 none. 초기 상태는 전이 이력에 넣지 않는다.
          falnaState: 'none', falnaHolder: null, conversionPending: null, falnaTransitions: [], currentEventId: null, syncBaseline: null,
          // R-i(기록 전용): 출생 시 거주지 = 출생지. 이력 구간은 달력 나이 기준 반열린 구간 [from, to).
          residence: { regionId: origin.id, since: 0 }, residenceHistory: [{ seq: 1, regionId: origin.id, from: 0, to: null, reason: 'birth', eventId: null }], service: {},
          // F1D4A P2(E-3): 출생 시 현재 위치 = 출생지. 거주지와 따로 만든다. 난수 0. lifeDigest 입력 아님.
          location: { regionId: origin.id, since: 0 }, locationHistory: [{ seq: 1, regionId: origin.id, from: 0, to: null, reason: 'birth', eventId: null }] };   // 2a: 비활성 데이터 모델(동작 연결 없음)
    S.statusResumeAge = null; S.patronAbsence = null;   // F1D4A N2: RA-1 형식(null 또는 안전한 정수), N2-6 (가) 부재 없음
    S.devAbilities = Object.freeze([]); S.devAbilityHistory = [];   // F1D4A D-DEVABIL: 새 생애는 이전 생애의 습득 상태를 승계하지 않는다
    eventCondMalformedSeen.clear();   // F1D4A D-LUCK 엔진 경계: 생애당 1회 진단 집합 초기화(S 밖)
    $('log').innerHTML = ''; $('choices').innerHTML = '';
    switchScreen('screen-play');
    apply((MODS.origins[origin.id] || {}).fx);
    apply((MODS.races[race.id] || {}).fx);
    apply((MODS.talents[talent.id] || {}).fx);
    say(`<b>${origin.label}</b>에서 <b>${race.label}</b>으로 태어났다.<br>${origin.desc}<br>${race.desc}<br>타고난 재능: <b>${talent.label}</b> — ${talent.desc}`, 'event', 0);
    const family = GameCore.Relations.generateFamily(S, relationCtx());
    const parents = family.filter(r => r.subType === 'parent').length, elder = family.filter(r => r.subType === 'sibling').length;
    say(parents || elder ? `곁에는 ${[parents ? `부모 ${parents}명` : '', elder ? `손위 형제 ${elder}명` : ''].filter(Boolean).join('과 ')}이(가) 있었다.` : '의지할 가족 없이 홀로 태어났다.', 'result', 0);
    // 가족 생성 후의 상태로 파생 시드를 확정하고, 수인이면 하위 유형을 정한다(게임 난수열 미사용).
    S.lineageSeed = GameCore.Lineage.lifeSeed(S);
    if (S.race.id === 'beastman') {
        S.raceSubtype = GameCore.Lineage.pickBeastmanSubtype(S.lineageSeed);
        say(`수인 중에서도 <b>${S.raceSubtype.label}</b>의 특징을 지니고 태어났다.${S.raceSubtype.canon === 'unverified' ? ' <small>(비공식 게임 설정)</small>' : ''}`, 'result', 0);
    }
    recordChildhood(0);
    // 부모의 파밀리아 소속(15%, 임의 값). 부모 NPC 레코드에 소속을 기록하고, 자녀의 공식 입단은 별개 사건으로 둔다.
    const parentRecords = family.filter(r => r.subType === 'parent');
    if (parentRecords.length && Math.random() < 0.15) {
        const pool = gachaData.familias.filter(f => f.id !== 'civilian').map(f => ({ ...f, w: f.weight * ((FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1) }));
        const pf = getRandomItemByWeight(pool, 'w');
        S.parentFamilia = { id: pf.id, label: pf.label };
        parentRecords.forEach(r => { r.familia = { id: pf.id, label: pf.label }; });
        S.flags.push('parents_in_familia');
        if (NEWBORN_MEMBERSHIP) {
            say('부모가 파밀리아 소속 모험자여서, 태어나자마자 같은 파밀리아의 일원이 되었다.', 'result', 0);
            rollFamilia(pf.id, 'newborn_control');   // 대조군: 부모와 같은 파밀리아에 즉시 입단
            S.flags.push('born_in_familia');
        } else {
            say(`부모는 ${pf.label} 소속이었다. (자녀의 정식 입단은 성장한 뒤 따로 이루어진다)`, 'result', 0);
        }
    }
    nextYear();
}

// 직업별 연간 활동 엑세리아(팔나 전에는 잠재력). 수치는 events.js ANNUAL_ACTIVITY(임의 밸런스 값).
function yearlyActivity() {
    if (haltedEntry('yearlyActivity')) return;   // H3 정지 가드
    if (S.age < 6) return;
    const amount = GameCore.Growth.rollAnnualExcelia(S, ANNUAL_ACTIVITY);
    if (amount > 0) GameCore.Growth.addExperience(S, amount);
    if (hasFalna()) convertExp();
    recompute();
}

// 체력 회복 단위: 육체 나이 1년당 perYear. 달력 1년에 실제로 흐른 육체 나이(aging.rate)에 비례한다.
// (v1.7 은 달력 1년당 +1 이라 노화가 느린 엘프·고레벨이 과도하게 회복했다 — QA_AUDIT_v1.7 §3)
// HP_REGEN_MODE: 'physical'(기본) | 'calendar'(v1.7 방식, A/B 비교용) | 'off'
function recoverYearly(rate) {
    if (haltedEntry('recoverYearly')) return;   // H3 정지 가드
    if (HP_REGEN_MODE === 'off') return;
    const step = HP_REGEN.find(r => S.phase <= r.untilPhase);
    if (!step) return;
    const scale = HP_REGEN_MODE === 'calendar' ? 1 : Math.max(0, Number(rate) || 0);
    S.hp = Math.min(GameCore.Items.hpCap(S), S.hp + step.perYear * scale);
}

// 구조 소모품 사용. 체력이 RESCUE_HP 이하일 때 1회, 그래도 0 이하면 남은 포션을 이어서 사용한다.
function tryRescue() {
    if (haltedEntry('tryRescue')) return;   // H3 정지 가드
    let used = false;
    for (let guard = 0; guard < 8; guard++) {
        if (used && S.hp > 0) break;
        const rescue = GameCore.Items.takeRescue(S);
        if (!rescue) break;
        S.hp = Math.min(GameCore.Items.hpCap(S), Math.max(S.hp, 0) + rescue.heal);
        say(`[${rescue.label}]을(를) 사용해 간신히 버텨 냈다.`, 'result');
        used = true;
    }
    if (used) renderStats();
    return used;
}

const RELATION_LABEL = { parent: '부모', sibling: '형제자매', child: '자녀' };
function handleRelationEvents(events) {
    if (haltedEntry('handleRelationEvents')) return;   // H3 정지 가드
    (events || []).forEach(ev => {
        const r = ev.relation;
        if (ev.kind === 'birth') { say('어머니가 새 아이를 낳았다. 동생이 생겼다.', 'result', S.age); return; }
        if (ev.kind !== 'death') return;
        const isPartner = r.isPartner === true || r.type === 'partner' || r.subType === 'romance_candidate';
        const who = isPartner ? '연인' : (r.name || RELATION_LABEL[r.subType] || '가까운 이');
        const how = ev.cause === 'natural' ? '긴 생을 마치고 세상을 떠났다.' : '뜻밖의 사고와 병으로 세상을 떠났다.';
        say(`${who}이(가) ${how}`, 'result bad', S.age);
        S.flags.includes('bereaved') || S.flags.push('bereaved');
        S.bond = Math.max(0, S.bond - (isPartner ? 8 : r.subType === 'child' ? 10 : 4));
        S.hp = Math.max(1, S.hp - (isPartner || r.subType === 'child' ? 5 : 2));   // 상실감으로 체력이 줄지만 그 자체로 사망하지는 않는다
    });
}

// ── F1D4A D-LUCK 엔진 경계(설계 r5, LUCK-1·6~19) ────────────────────────────────────────────────
// 입력 범위: 정적 EVENTS 의 사건 조건만(같은 realm). 외부·실행 중 생성 조건 객체는 이 경계로 넘기지 않는다(LUCK-16).
// 형식 단계(구조·속성 종류)와 의미 단계(match 본문 그대로)를 분리한다. 형식 단계는 Math.random 을 부르지 않는다(메인 RNG 호출 수·지점 불변).
// 접근자 함수는 실행하지 않지만(서술자로만 읽음) 대상이 Proxy 면 trap 은 실행될 수 있다. trap 예외는 형식 위반으로 거부한다.
const eventCondSnapByCand = new WeakMap();   // ⑩ 후보 레코드 → 조건 스냅숏(S·사건 데이터 밖, 후보 레코드는 매년 새로 만든다)
const eventCondMalformedSeen = new Set();    // 생애당 사건 1회 진단용 키('EVENTS:' + id). startLife 에서 비운다(S 밖)
const ECOND_PRIM = v => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
// 같은 realm 의 기본 프로토타입은 전역 Array/Object 가 아니라 **리터럴에서** 얻는다. 시험 하네스가 vm 샌드박스에 호스트의 Array·Object 를
// 넣으면(test_runner.js sandbox) 전역 Array.prototype 은 호스트 것이지만, 같은 스크립트의 리터럴(events.js 데이터 포함)은 이 컨텍스트의
// 기본 프로토타입을 쓴다. 리터럴 기준이면 게임 코드와 사건 데이터가 같은 기본 프로토타입을 비교한다(LUCK-10).
const ECOND_ARRAY_PROTO = Object.getPrototypeOf([]), ECOND_OBJECT_PROTO = Object.getPrototypeOf({});
// LUCK-20: 입력 객체는 이 realm 의 Object.prototype 을 직접 상속한 리터럴 객체만 허용한다. null 프로토타입 원본은 realm 을 구별할 수 없으므로
// (다른 realm 의 Object.create(null) 도 같아 보임) 거부한다. 정적 EVENTS 의 조건은 모두 리터럴이라 영향 없음(LK-11e). 스냅숏 **출력**만 null 프로토타입이다.
function ecPlainObjProto(v) { return Object.getPrototypeOf(v) === ECOND_OBJECT_PROTO; }
function ecOwnDataValues(v) {   // 자체 키가 모두 열거 가능한 데이터 속성이고 Symbol 키가 없으면 [키, 값] 목록, 아니면 null
    if (Object.getOwnPropertySymbols(v).length) return null;
    const out = [];
    for (const k of Object.getOwnPropertyNames(v)) {
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !d.enumerable || !('value' in d)) return null;
        out.push([k, d.value]);
    }
    return out;
}
function ecSnapArray(v) {   // LUCK-15: length 는 유일하게 허용하는 비열거 자체 속성. 인덱스 0..n-1 연속 자체 데이터 속성, 원소는 원시값
    if (!Array.isArray(v) || Object.getPrototypeOf(v) !== ECOND_ARRAY_PROTO) return null;
    if (Object.getOwnPropertySymbols(v).length) return null;
    const ld = Object.getOwnPropertyDescriptor(v, 'length');
    if (!ld || !('value' in ld) || ld.enumerable || !Number.isInteger(ld.value) || ld.value < 0) return null;
    const n = ld.value, names = Object.getOwnPropertyNames(v);
    if (names.length !== n + 1) return null;   // 구멍·추가 키 거부
    const out = [];
    for (let i = 0; i < n; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !d.enumerable || !('value' in d) || !ECOND_PRIM(d.value)) return null;
        out.push(d.value);
    }
    return out;
}
function ecSnapObject(v) {   // min·max 등: 같은 realm 일반 객체, 값은 원시값
    if (v === null || typeof v !== 'object' || Array.isArray(v) || !ecPlainObjProto(v)) return null;
    const kv = ecOwnDataValues(v); if (!kv) return null;
    const out = Object.create(null);
    for (const [k, x] of kv) { if (!ECOND_PRIM(x)) return null; out[k] = x; }
    return out;
}
// 형식 단계: { ok:true, snap } | { ok:false, reason }. undefined → 빈 조건(Object.create(null)), null → 형식 위반(LUCK-11·18).
function eventCondSnapshot(c) {
    try {
        if (c === undefined) return { ok: true, snap: Object.create(null) };
        if (c === null || typeof c !== 'object' || Array.isArray(c) || !ecPlainObjProto(c)) return { ok: false, reason: 'cond_not_plain' };
        const kv = ecOwnDataValues(c); if (!kv) return { ok: false, reason: 'cond_props' };
        const snap = Object.create(null);
        for (const [k, v] of kv) {
            if (ECOND_PRIM(v)) snap[k] = v;
            else if (Array.isArray(v)) { const a = ecSnapArray(v); if (!a) return { ok: false, reason: 'array:' + k }; snap[k] = a; }
            else { const o = ecSnapObject(v); if (!o) return { ok: false, reason: 'value:' + k }; snap[k] = o; }
        }
        return { ok: true, snap };
    } catch (err) { return { ok: false, reason: 'exception' }; }
}
function noteEventCondMalformed(e, reason) {   // 진단은 S 밖(followupDiagLog), 생애·사건당 1회
    const key = 'EVENTS:' + (e && e.id);
    if (eventCondMalformedSeen.has(key)) return;
    eventCondMalformedSeen.add(key);
    followupDiag('event_cond_malformed', { eventId: e && e.id, reason });
}

function nextYear() {
    if (haltedEntry('nextYear')) return;   // H1 정지 가드
    // T1-F: 후속 선택이 남아 있으면 다음 해로 넘어가지 않는다(DOM·RNG·상태 변경보다 먼저 검사).
    if (S && S.pendingFollowup) { followupDiag('nextyear_blocked'); return; }
    $('choices').innerHTML = '';
    let skipped = 0;
    while (true) {
        const aging = GameCore.Aging.advanceYear(S, MODS);
        handleRelationEvents(GameCore.Relations.advanceYear(S, MODS));
        if (S.age <= 2) recordChildhood(S.age);   // 0~2세는 사건이 없어도 성장 기록을 남긴다(난수 소비 없음)
        checkFalna();
        yearlyActivity();
        if (S.phase > 60) S.hp -= aging.rate;
        else recoverYearly(aging.rate);
        tryRescue();   // 연간 피해 직후, 사망 판정 전에 구조 포션 사용
        if (S.hp <= 0) { S.cause = '몸이 더는 버티지 못했다.'; return endLife(); }
        const naturalDeathChance = GameCore.Aging.naturalDeathChance(S.phase, aging.rate);
        if (S.phase > 65 && Math.random() < naturalDeathChance) { S.cause = '긴 생을 마치고 조용히 눈을 감았다.'; return endLife(); }
        const yearCondSnaps = new Map();   // 이번 추첨에서만 쓰는 사건 → 조건 스냅숏(후보 레코드 연결용, 매년 새로 만든다)
        const pool = EVENTS.filter(e => {
            const count = S.eventCounts[e.id] || 0;
            const last = S.lastEventPhase[e.id];
            if (e.once && S.done.includes(e.id)) return false;
            if (!e.once && count >= (e.maxTimes || 2)) return false;
            if (last != null && S.phase - last < (e.cool || 2)) return false;
            // F1D4A D-LUCK 엔진 경계(LUCK-1·6~8·12): 사건 조건은 형식 검사를 통과한 스냅숏으로만 판정한다. 위반이면 후보에서 제외(fail-closed).
            const cs = eventCondSnapshot(e.cond);
            if (!cs.ok) { noteEventCondMalformed(e, cs.reason); return false; }
            yearCondSnaps.set(e, cs.snap);   // 후보가 되지 않은 사건의 스냅숏은 후보 레코드에 연결되지 않으므로 쓰이지 않는다
            return match(cs.snap, e) && visibleChoices(e).length > 0;   // E-1.2 ⑩: 보이는 선택지 0개 사건은 추첨 전에 제외
        }).map(e => { const rec = { ...e, w: e.w * (S.recentEvents.slice(-4).includes(e.id) ? 0.12 : 1) }; eventCondSnapByCand.set(rec, yearCondSnaps.get(e)); return rec; });
        const e = getRandomItemByWeight([...pool, { w: 5, none: true }], 'w');
        if (!e.none) {
            // E-1.2 ⑫: 표시 전 재검사(정상 흐름에서는 ⑩ 과 같은 결과). 실패하면 진단을 남기고 "사건 없음"과 똑같이 처리한다.
            const recSnap = eventCondSnapByCand.get(e);   // LUCK-12: ⑩ 에서 만든 같은 스냅숏을 다시 쓴다(원본 e.cond 를 다시 읽지 않음). 없으면 fail-closed
            const condOk = !!recSnap && match(recSnap, e), visOk = condOk && visibleChoices(e).length > 0;
            if (!condOk || !visOk) {
                followupDiag('event_recheck_failed', { where: 'nextYear', part: !condOk ? 'cond' : 'choices', eventId: e.id });
                if (S.age > 2) skipped++;
                continue;
            }
            renderStats();
            if (skipped) say(`평온하게 ${skipped}년이 흘렀다.`, 'result');
            return showEvent(e);
        }
        if (S.age > 2) skipped++;   // 0~2세는 성장 기록이 이미 남았으므로 '평온하게 N년' 집계에서 뺀다
    }
}

// ── P2 보완 4(신뢰 경계 A안): 사용자 입력 경계 = 사건 선택지 버튼의 클릭 경로 ─────────────────────────────
//   choose()·chooseBody() 는 UI 보안 경계가 아니라 엔진·시험 하네스 전용 내부 API다. 합성 선택지 직접 호출은 그대로 허용한다
//   (이 조치는 직접 호출의 임의 객체 입력을 막지 않는다). 실제 EVENTS 는 신뢰된 정적 사건 데이터로 취급하고(Node 시험에서 Proxy 0·
//   일반 객체 선택지를 강제), 콘솔·페이지 코드를 임의 실행할 수 있는 사용자는 위협 모델 밖이다.
//   showEvent 는 표시할 때마다 표시 기록 { seq, event } 를 만들고 버튼이 그 기록·사건·선택지 참조를 캡처한다.
//   클릭 시 ① 그 표시가 지금 활성 표시인가(stale_button) ② 캡처한 사건 객체의 원본이 실제 EVENTS 에 있는가(event_not_in_events, 아래 eventSourceInEvents)
//   ③ 활성 사건이 캡처한 사건과 같은 객체이고 아직 해결되지 않았는가(event_not_active) ④ 선택지가 그 사건 choices 의 실제 참조인가
//   (choice_not_in_event) 를 객체 참조로 확인한다. 실패하면 choose() 를 부르지 않는다(효과·확률 판정·난수 0). 표시 기록은 S 밖이다.
let eventShowSeq = 0, activeEventShow = null;
// 표시된 사건 e 의 원본을 실제 EVENTS 에서 객체 참조로 찾는다. nextYear 는 가중치를 조정한 얕은 복사본({ ...e, w })을 표시하므로
//   "원본 자체(src === e)" 또는 "같은 id 이고 choices 배열이 원본과 같은 참조(src.choices === e.choices)"인 경우만 인정한다(id 문자열만으로는 인정 안 함).
function eventSourceInEvents(e) {
    if (!e || typeof e !== 'object' || !Array.isArray(EVENTS)) return null;
    for (let i = 0; i < EVENTS.length; i++) {
        const src = EVENTS[i];
        if (src === e || (src && src.id === e.id && Array.isArray(src.choices) && src.choices === e.choices)) return src;
    }
    return null;
}
function eventChoiceClickCheck(show, e, ch) {
    try {
        if (!S) return 'no_state';
        if (!show || show !== activeEventShow) return 'stale_button';
        if (!eventSourceInEvents(e)) return 'event_not_in_events';
        if (show.event !== e || S.currentEventId !== e.id) return 'event_not_active';
        if (!choiceInEvent(ch, e)) return 'choice_not_in_event';
        return null;
    } catch (err) { return 'click_check_error'; }
}
function clickEventChoice(show, e, ch) {
    const why = eventChoiceClickCheck(show, e, ch);
    if (why) { followupDiag('choice_click_rejected', { eventId: S ? (S.currentEventId ?? null) : null, reason: why }); return; }
    return choose(ch);
}
function showEvent(e) {
    if (haltedEntry('showEvent')) return;   // H1 정지 가드(반환 undefined)
    // E-1.3: 보이는 선택지가 0개면 상태·연표·버튼·타이머·난수를 건드리기 전에 false. 사건 조건은 다시 보지 않는다(nextYear ⑫ 의 책임).
    const vis = visibleChoices(e);
    if (vis.length === 0) { followupDiag('event_no_visible_choice', { where: 'showEvent', eventId: e.id }); return false; }
    S.currentEventId = e.id;   // v1.7.8-2i: 기록 전용, choose() 의 finally 에서 null
    const show = activeEventShow = { seq: ++eventShowSeq, event: e };   // P2 보완 4: 이번 표시(버튼이 캡처)
    say(e.text, 'event', S.age);
    if (e.once) S.done.push(e.id);
    S.eventCounts[e.id] = (S.eventCounts[e.id] || 0) + 1;
    S.lastEventPhase[e.id] = S.phase;
    S.recentEvents.push(e.id);
    if (S.recentEvents.length > 8) S.recentEvents.shift();
    vis.forEach(ch => {   // E-1.4: 보이는 선택지만 버튼으로 만든다
        const b = document.createElement('button');
        b.className = 'choice'; b.textContent = ch.label;
        b.onclick = () => clickEventChoice(show, e, ch);   // P2 보완 4: 클릭 시 참조 재검증 후 choose()
        $('choices').appendChild(b);
    });
    if ($('auto').checked) scheduleAuto(() => {
        const bs = $('choices').querySelectorAll('button');
        if (bs.length) bs[Math.floor(Math.random() * bs.length)].click();
    }, 800);
    return true;   // E-1.3: 정상 표시
}

function choose(ch) {
    if (haltedEntry('choose')) return;   // H1 정지 가드
    try { return chooseBody(ch); }
    finally { if (S) S.currentEventId = null; }   // v1.7.8-2i(d-2): 조기 반환·예외에서도 초기화
}
function chooseBody(ch) {
    if (haltedEntry('chooseBody')) return;   // H1 정지 가드
    // E-1.4: 숨긴 선택지 직접 호출 거부(choices 비우기·확률 판정 전). 상태·난수 불변.
    //   P2 보완: visibleChoices 와 같은 규칙(choiceVisible). cond 가 falsy 이거나 형식이 틀려도 거부한다. 진단에 이유(cond_malformed / cond_unmet)를 남긴다.
    //   P2 보완 2·3: 선택지·cond 검증은 표시와 같은 choiceVerdict 한 번으로 한다(choices 비우기 전). 이유: choice_not_object / cond_malformed / cond_unmet.
    const verdict = choiceVerdict(ch, EVENTS.find(x => x.id === S.currentEventId));
    if (!verdict.ok) {
        followupDiag('hidden_choice_rejected', { eventId: S.currentEventId ?? null, reason: verdict.reason });
        return;
    }
    $('choices').innerHTML = '';
    let r = ch;
    if (ch.chance) {
        const c = ch.chance;
        let p = getChoiceProbability(c);
        if (c.stat === 'power') {
            const boost = GameCore.Items.takePowerBoost(S, p);
            if (boost) {
                p = getChoiceProbability(c, boost.bonus);
                say(`[${boost.label}]을(를) 사용했다.` + (boost.remaining > 0 ? ` (남은 횟수 ${boost.remaining})` : ' 더는 쓸 수 없게 되었다.'), 'result');
            }
        }
        r = Math.random() < p ? c.ok : c.fail;
    }
    const bad = r.fx && (r.fx.die || r.fx.hp < -30);
    say(r.text, 'result' + (bad ? ' bad' : ''));
    apply(r.fx);
    if (!(r.fx && r.fx.die)) tryRescue();
    
    if (r.fx && r.fx.die) {
        if (typeof r.fx.die === 'string') {
            const ending = gachaData.endings.find(e => e.id === r.fx.die);
            S.cause = ending ? ending.label : r.text;
        } else {
            S.cause = r.text;
        }
        return endLife();
    }
    
    if (S.hp <= 0) { 
        S.cause = (r.fx && r.fx.hp <= -20) ? r.text + ' 끝내 상처를 이겨 내지 못했다.' : '쌓인 피로와 세월 탓에 몸이 끝내 버티지 못했다.'; 
        return endLife(); 
    }
    
    // T1-F(C27): 사망·HP 0 판정을 지난 생존 경로에서만 후속 선택 화면을 띄운다. '다음 해로' 는 선택 처리 후에 만든다.
    if (S.pendingFollowup) {
        S.pendingFollowup.phase = 'awaiting_choice';
        if (renderFollowup()) return;
        followupDiag('followup_render_failed'); S.pendingFollowup = null;
    }
    renderNextYearButton();
}
function renderNextYearButton() {
    const b = document.createElement('button');
    b.textContent = '다음 해로'; b.onclick = nextYear;
    $('choices').appendChild(b);
    if ($('auto').checked) scheduleAuto(() => b.isConnected && b.click(), 600);
}

// ── 후속 선택 공통부. 사건 id 를 하드코딩하지 않는다(문맥은 pending.sourceEventId 로 복원). ──
// 보류 상태 생성: 난수 0, pending·followupSeq 외 게임 상태 변경 0. 이미 보류가 있으면 만들지 않는다(중첩 금지).
function createFollowup(kind, context) {
    if (haltedEntry('createFollowup')) return;   // H3 정지 가드
    if (!FOLLOWUP_KINDS[kind]) { followupDiag('followup_unknown_kind', { kind }); return false; }
    if (S.pendingFollowup) { followupDiag('followup_already_pending', { kind }); return false; }
    S.followupSeq = (S.followupSeq || 0) + 1;
    S.pendingFollowup = { seq: S.followupSeq, kind, phase: 'resolving_event', sourceEventId: S.currentEventId ?? null, context: { ...(context || {}) }, createdAt: S.age };
    return true;
}
// 화면 전용 출력(logHistory 에 남기지 않는다 — 후속 화면 표시만으로 게임 상태가 바뀌지 않게 한다, C29).
function sayDomOnly(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'entry ' + cls;
    d.innerHTML = text;
    $('log').appendChild(d);
    d.scrollIntoView({ block: 'nearest' });
}
function followupOptions(p) {
    const kind = p && FOLLOWUP_KINDS[p.kind];
    const list = kind ? kind.options(S, p) : [];
    return Array.isArray(list) ? list.filter(o => o && typeof o.id === 'string') : [];
}
function renderFollowup() {
    if (haltedEntry('renderFollowup')) return;   // H1 정지 가드
    const p = S.pendingFollowup, kind = p && FOLLOWUP_KINDS[p.kind];
    const options = followupOptions(p);
    if (!kind || !options.length) return false;
    $('choices').innerHTML = '';
    sayDomOnly(kind.prompt, 'event');
    let stayButton = null;
    options.forEach(o => {
        const b = document.createElement('button');
        b.className = 'choice'; b.textContent = o.label;
        (b.dataset || (b.dataset = {})).followup = o.id;      // 러너·자동 진행이 난수 없이 고를 수 있게 하는 표식
        b.onclick = () => chooseFollowup(o.id);
        $('choices').appendChild(b);
        if (o.stay && !stayButton) stayButton = b;
    });
    // 자동 진행(C21·C24): 무작위 클릭 대신 '지금 생활을 이어간다' 를 고정 선택한다(난수 호출 없음).
    if ($('auto').checked && stayButton) scheduleAuto(() => stayButton.isConnected && stayButton.click(), 800);
    return true;
}
function chooseFollowup(optionId) {
    if (haltedEntry('chooseFollowup')) return;   // H1 정지 가드
    const p = S.pendingFollowup;
    // a. 검증: 실패하면 상태·보류·화면을 바꾸지 않는다(중복 클릭·무효 선택 포함).
    if (!p || p.phase !== 'awaiting_choice' || !followupOptions(p).some(o => o.id === optionId)) { followupDiag('followup_invalid', { optionId }); return; }
    p.phase = 'resolving_choice'; $('choices').innerHTML = '';     // b. 확정
    S.currentEventId = p.sourceEventId;                             // c. 원래 사건 문맥 복원
    const rb = takeRollbackSnapshot();                              // d. 롤백 스냅숏
    try {
        withScope('followup', null, () => FOLLOWUP_KINDS[p.kind].resolve(S, optionId, p));   // e. 사건별 효과
    } catch (err) {
        progressHalted = true;                                      // X0 첫 문장: 이후 어떤 정리 단계가 실패해도 정지는 유지된다
        const cleanupErrors = [];
        const step = (name, fn) => { try { fn(); } catch (e) { try { cleanupErrors.push({ step: name, message: String(e && e.message) }); } catch (_) {} } };
        step('clearTimers', clearAutoTimers);                       // X0b
        step('observe', () => observeRollbackState(rb.ext));        // X1 직전(QA RB-2A): 예외 시점 관찰(복원 전, getter 호출 없음)
        step('rollback', () => restoreRollbackSnapshot(rb));        // X1
        let rbx = null;
        step('rollbackExt', () => { rbx = restoreRollbackSnapshotExt(rb.ext); });   // X1(확장, F1D4A N2-1 RB-1 (가)): 묶음별 격리·결과 보고
        step('verify', () => {                                      // X1-v: 범위 깊이는 finally 가 정리한다(E-1). 다르면 실패로 보고
            if (rb.ext && syncDepth !== rb.ext.syncDepth) { if (rbx && rbx.bundles) { rbx.bundles.syncDepth = { status: 'failed', value: syncDepth }; rbx.rollback = 'partial(failed)'; } }
        });
        // RB-1f·QA RB-1C: 롤백 실패 기록은 별도 단계다. 기록 자체가 실패하면 rollbackFailureUnrecorded 가 true 로 남고(성공으로 오인하지 않음),
        // cleanupErrors 에 'recordFailure' 로 따로 남는다. 롤백 결과(rbx)와 기록 성공 여부는 서로 다른 값이다. 정지·예외 재전파는 영향받지 않는다.
        const rollbackOk = !!rbx && rbx.rollback === 'ok';
        if (!rollbackOk) step('recordFailure', () => { rollbackFailureUnrecorded = true; writeRollbackFailureRecord(rbx); rollbackFailureUnrecorded = false; });
        step('render', renderStatsFromClone);                       // X2 (R-E)
        step('trimLog', () => trimLogNodesAfterSnapshot(rb.ext));   // X2b (RB-1e): 정지 안내보다 먼저
        step('notice', showHaltNotice);                             // X5b
        step('diag', () => followupDiag('followup_resolve_exception', { optionId, message: String(err && err.message), cleanupErrors: cleanupErrors.slice(), rollback: rbx ? { rollback: rbx.rollback, input: rbx.input } : null, failureRecorded: rollbackOk ? null : !rollbackFailureUnrecorded }));   // X3
        try { if (cleanupErrors.length) err.followupCleanupErrors = cleanupErrors; } catch (_) {}
        throw err;                                                  // X6 원래 예외를 그대로 다시 던진다('다음 해로' 는 만들지 않는다)
    } finally {
        S.pendingFollowup = null; S.currentEventId = null;         // f. 정리(단순 대입만)
    }
    if (S.hp <= 0) { S.cause = '쌓인 피로와 세월 탓에 몸이 끝내 버티지 못했다.'; return endLife(); }   // g. 방어 판정(후속 효과는 HP 를 바꾸지 않는다)
    renderStats();                                                  // 상태창 갱신(직업·고용처 표시). 지급이 없으면 apply 가 불리지 않아 갱신되지 않던 결함 수정(브라우저 검증에서 발견)
    renderNextYearButton();                                         // h.
}

function pickAlias() {
    const get = id => gachaData.aliases.find(a => a.id === id);
    if (S.level >= 7) return get('king');
    if (S.level >= 5) return get('braver');
    if (S.level >= 3) return get('chuuni');
    if (S.level >= 2) return get('rookie');
    return get('none');
}

function endLife() {
    if (haltedEntry('endLife')) return;   // H1 정지 가드
    // T1-F: 후속 선택 화면 표시 전(resolving_event)의 사망은 정상 처리하고 보류를 정리한다(C27).
    //       화면 표시 후(awaiting_choice)·선택 처리 중(resolving_choice)에는 생애를 끝내지 않는다. 기존 정리 작업보다 먼저 검사한다.
    { const p = S ? S.pendingFollowup : null;
      if (p && p.phase !== 'resolving_event') { followupDiag('endlife_blocked'); return; }
      if (p) { followupDiag('followup_discarded_on_death'); S.pendingFollowup = null; } }
    // v1.7.8-2i(⑤): 예외로 남은 기준값 정리. 정상 진행에서는 항상 null.
    if (S.syncBaseline) { recoverFromBaseline(S.syncBaseline, null, 'recovered_at_life_end'); S.syncBaseline = null; }
    S.currentEventId = null;
    $('choices').innerHTML = '';
    // 규칙: 사망 시 체력은 0 으로 고정한다(음수 체력 상태를 결과에 남기지 않는다).
    S.hp = Math.max(0, Number.isFinite(S.hp) ? S.hp : 0);
    const alias = S.alias || pickAlias();
    const notes = [];
    if (S.flags.includes('liaris')) notes.push('동경이 꺾이지 않는 한 성장을 멈추지 않았던 사람.');
    if (S.flags.includes('xenos_friend')) notes.push('몬스터와 비밀스러운 유대를 맺었던 사람.');
    if (S.flags.includes('scholar')) notes.push('신성문자를 읽어 낼 줄 알았던 학자.');
    if (S.flags.includes('fisher')) notes.push('말년을 메렌의 바닷가에서 보냈다.');
    if (GameCore.Relations.hasPartner(S)) notes.push('성인인 연인과 서로의 삶을 함께했다.');
    const lost = S.relations.filter(r => r && r.alive === false);
    if (lost.length) notes.push(`살아오며 ${lost.length}명의 가까운 이를 떠나보냈다.`);
    const kids = S.relations.filter(r => r && r.subType === 'child').length;
    if (kids) notes.push(`자녀 ${kids}명을 두었다.`);
    const milestones = S.milestones.length ? S.milestones.map(m => `- ${m.age}세: ${m.label}`).join('\n') : '없음';
    const timeline = S.logHistory.filter(x => x.type === 'event' || x.type === 'job').slice(-18).map(x => `${x.age}세: ${x.text}`).join('\n');
    const abilitySummary = S.level >= 1
        ? ABIL.map(([k, label]) => `${label} ${S.abil[k]}(${rankOf(S.abil[k])})`).join(' · ')
        : '';
    const lines = [
        `이명: ${alias.label}`,
        `- ${alias.desc}`,
        '',
        `${S.origin.label} 출신 ${GameCore.Lineage.raceLabel(S)}`,
        `소속: ${S.familia ? S.familia.label : '없음'}${S.employer ? ' (고용처: ' + S.employer.label + ')' : ''}`,
        `직업: ${JOB_LABELS[S.job] || S.job}`,
        `재능: ${S.talent.label}`,
        ''
    ];
    lines.push(`최고 레벨: ${(S.maxLevel || 0) >= 1 ? 'Lv.' + S.maxLevel : '팔나 없음'}${(S.maxLevel || 0) >= 1 && !hasFalna() ? ' (생애 말 팔나 봉인)' : ''}`);
    if ((S.levelHistory || []).length) lines.push('레벨 이력: ' + S.levelHistory.map(h => h.kind === 'falna' ? `${h.age}세 팔나 취득(Lv.1)` : h.kind === 'falna_again' ? `${h.age}세 팔나 재취득(Lv.${h.to})` : `${h.age}세 Lv.${h.from}→Lv.${h.to}`).join(' · '));
    if (S.level >= 1) lines.push(abilitySummary);
    lines.push('');
    lines.push(`향년 ${S.age}세${S.phase + 2 <= S.age ? ` (체감 ${S.phase}세)` : ''} — ${S.cause}`, `인연 ${S.bond} · 발리스 ${S.valis}`, '');
    lines.push(`소지품: ${S.items && S.items.length ? S.items.map(id => GameCore.Items.label(S, id)).join(', ') : '없음'}`, '', '일생의 업적', milestones);
    if (timeline) lines.push('', '주요 연표', timeline);
    if (S.raceSubtype && S.raceSubtype.canon === 'unverified') notes.push(`※ 수인 하위 유형 '${S.raceSubtype.label}'은 원작 근거가 확인되지 않은 비공식 게임 설정입니다.`);
    if (notes.length) lines.push('', ...notes);
    $('result-content').innerText = lines.join('\n');
    switchScreen('screen-result');
    window.scrollTo(0, 0);
}

$('btn-start').addEventListener('click', () => {
    switchScreen('screen-loading');
    setTimeout(startLife, 1500);
});
$('btn-retry').addEventListener('click', () => switchScreen('screen-start'));
