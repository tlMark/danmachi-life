'use strict';
// GA-NI-2 ⑫ 정적 검사기(측정 사본 전용). 대상: measure/measure_module.js(기본) 또는 인자로 준 파일.
// 사용: node measure/ast_check.js [대상 파일] [--dump] [--json <출력>]
//   종료 코드 0 = 통과, 1 = 검사 실패, 2 = 준비 실패(파서 SHA 불일치·파일 읽기 실패).
//
// ── 실행 계약(REVIEW v49 R6 대응, 구현 판본 GA-INV-2-impl-1) ──────────────────────────────────────────────
// P1 파서: acorn 8.15.0(measure/vendor/acorn-8.15.0/acorn.js, npm tarball sha512 = NZyJarBf…pvtTg==, dist/acorn.js SHA-256 = 아래 ACORN_SHA256).
//    시작할 때 파일 SHA-256 과 acorn.version 을 확인하고 다르면 준비 실패(2).
// P2 파싱 모드: ecmaVersion 2022, sourceType 'script'(CommonJS 파일), allowHashBang false, locations·ranges 켬. 파싱 실패 = 검사 실패.
// P3 순회 범위: Program 아래 모든 노드(함수 본문·중첩 함수·화살표 함수·catch 절 포함). acorn 노드의 모든 자식 필드를 일반 순회한다(키 목록을 하드코딩하지 않음).
// P4 스코프: Program·함수(매개변수 + 본문)·블록·for/for-of/for-in 머리·catch 절마다 스코프를 만든다. var 는 함수 스코프, let/const/function 은 블록 스코프.
//    선언을 먼저 모은 뒤(끌어올림) 참조를 안쪽 스코프부터 바깥으로 찾아 선언과 연결한다.
// P5 식별자 연결: 참조가 파일 안 선언에 연결되지 않으면 ALLOWED_GLOBALS 에 있어야 한다. 없으면 실패(출처 불명 식별자).
//    GLOBAL_NAMES(Object·Reflect·Symbol·globalThis·process·require·module·Number·JSON·Set·undefined 와 금지 전역)를 선언하면 실패(이름 가림).
//    MODULE_SENSITIVE(EE·PROC·RD_* 등)는 최상위에 정확히 1번 선언되고, 안쪽 스코프에서 같은 이름을 선언하면 실패. 모든 참조가 그 최상위 선언에 연결돼야 한다.
// P6 사이트 일치: 민감 표지(아래 목록)가 나온 모든 노드를 "앵커"(가장 가까운 사이트 형태 조상 또는 자기 자신)로 올린다.
//    앵커 키 = (최상위 함수 이름, 노드 형식, 토큰 정규화 원문). 실제 앵커 키 집합·횟수가 SITES 표와 정확히 같아야 한다(누락·초과·미달·표 밖 키 = 실패).
// P7 추가 의미 검사: (a) 서술자 .value·.writable·.configurable 읽기는 같은 객체의 isData 판정이 앞서 통과한 경로에서만(R2)
//    (b) EE·WRAPPERS·ORIG_OF 의 계산된 키는 WATCH·attempted 를 도는 for-of 반복 변수 또는 WATCH[i](i 는 수 반복 변수)만 (c) 최상위 문장·초기화식 형태(R1·R3)
//    (d) 사이트 노드 안에 함수 노드가 들어 있으면 실패(T17 화살표만 예외).
// P8 동적 경로: 계산된 멤버·호출·new·태그 템플릿·선택적 연쇄·import()·with·접근자 정의·스프레드·구조 분해·delete·in 연산자는 모두 민감 표지다.
//    표에 없는 위치에 나오면 실패한다(판단하지 않고 실패).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ACORN_PATH = path.join(__dirname, 'vendor', 'acorn-8.15.0', 'acorn.js');
const ACORN_SHA256 = 'fdb08546776ec6228b03e8d02b40d4ab3255bae5f401adba7ff5dad927ac5c9c';
const ACORN_VERSION = '8.15.0';
const PARSE_OPTS = Object.freeze({ ecmaVersion: 2022, sourceType: 'script', allowHashBang: false, locations: true, ranges: true });

const ALLOWED_GLOBALS = ['Object', 'Reflect', 'Symbol', 'globalThis', 'process', 'require', 'module', 'Number', 'JSON', 'Set', 'undefined'];
const BANNED_GLOBALS = ['eval', 'Function', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'Proxy', 'WeakRef', 'FinalizationRegistry', 'Atomics', 'SharedArrayBuffer', 'import'];
const GLOBAL_NAMES = ALLOWED_GLOBALS.concat(BANNED_GLOBALS);
const MODULE_SENSITIVE = ['EE', 'PROC', 'fs', 'RD_apply', 'RD_gopd', 'RD_gpo', 'RD_listeners', 'RD_count', 'RD_emit', 'WRAPPERS', 'WATCH_ON', 'HOOK_NEW0', 'HOOK_RM0', 'M', 'OWN_TOKEN', 'INIT_KEY', 'M_', 'isData'];
const SENS_IDS = new Set(GLOBAL_NAMES.concat(MODULE_SENSITIVE, ['ORIG_OF', 'EventEmitter']));
const SENS_PROPS = new Set(['prototype', 'constructor', '__proto__', 'defineProperty', 'defineProperties', 'assign', 'setPrototypeOf', 'getPrototypeOf',
    'getOwnPropertyDescriptor', 'set', 'deleteProperty', 'apply', 'call', 'bind', 'freeze', 'create', 'EventEmitter', 'exports', 'value', 'writable', 'configurable',
    'on', 'once', 'addListener', 'prependListener', 'prependOnceListener', 'off', 'removeListener', 'removeAllListeners', 'setMaxListeners', 'emit', 'listeners', 'listenerCount']);
const ANCHOR_TYPES = new Set(['CallExpression', 'NewExpression', 'AssignmentExpression', 'MemberExpression', 'VariableDeclarator', 'UpdateExpression', 'RestElement', 'SpreadElement']);
// 항상 그 노드 자체가 앵커인 표지(동적 경로·금지 형태)
const SELF_MARK_TYPES = new Set(['CallExpression', 'NewExpression', 'TaggedTemplateExpression', 'ChainExpression', 'ImportExpression', 'WithStatement', 'SpreadElement',
    'ObjectPattern', 'ArrayPattern', 'ClassDeclaration', 'ClassExpression', 'MethodDefinition', 'MetaProperty', 'Super', 'YieldExpression', 'AwaitExpression', 'LabeledStatement',
    'ThisExpression', 'RestElement']);

// ── 허용 사이트 표(같은 판본: measure/measure_module.js GA-INV-2-impl-1). 키 = 최상위 함수|노드 형식|정규화 원문 → 정확한 횟수 ──
// T1~T19 는 REVIEW v49 §4.2zs 의 번호를 그대로 쓰고, v49 표에 없던 위치(R1·R3·R4 지적)는 T20 이후에 둔다. 범위는 T1~T63.
const SITES_DEFAULT = require('./ast_sites.js');
// parts 의미표(R3 보강, 검사기 판본과 함께 고정): 같은 키가 여러 T 에 걸칠 때, 각 위치의 실제 문맥 → 그 위치가 속해야 할 T 번호.
//   문맥은 init 안에서 계산한다: catch 절 안 = 'catch', 바깥 try 블록 안 = 그 위치 앞의 마지막 `stage = N;` 문장으로 'stageN'(없으면 'stage0').
const PARTS_SEMANTICS = Object.freeze({
    'init|CallExpression|RD_gopd(EE,name)': { stage1: 'T7', stage2: 'T10', stage3: 'T10', catch: 'T9' },   // 1단계 원본 읽기 · 2단계 설치 확인 · 3단계 전수 확인 · 복원 직전 서술자
    'init|MemberExpression|EE[name]': { stage2: 'T8', catch: 'T9' }                                         // 설치 대입 · 복원 대입
});

function die(code, msg) { console.error(msg); process.exit(code); }
function loadAcorn() {
    let buf;
    try { buf = fs.readFileSync(ACORN_PATH); } catch (e) { die(2, 'PREP FAIL: acorn 읽기 실패 ' + e.message); }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== ACORN_SHA256) die(2, 'PREP FAIL: acorn SHA-256 불일치 ' + sha);
    const acorn = require(ACORN_PATH);
    if (acorn.version !== ACORN_VERSION) die(2, 'PREP FAIL: acorn.version ' + acorn.version);
    return acorn;
}

function check(src, opts = {}) {
    const acorn = opts.acorn || loadAcorn();
    const SITES = opts.sites || SITES_DEFAULT;   // 시험(⑫-neg)에서만 표 변이를 넘긴다
    const fails = [];
    const fail = (rule, node, msg) => fails.push({ rule, line: node && node.loc ? node.loc.start.line : null, msg });
    let ast;
    try { ast = acorn.parse(src, PARSE_OPTS); } catch (e) { return { ok: false, fails: [{ rule: 'A1', line: null, msg: '파싱 실패: ' + e.message }], anchors: {}, parser: acorn.version }; }
    const norm = node => { const t = src.slice(node.start, node.end); const out = []; for (const tok of acorn.tokenizer(t, { ecmaVersion: 2022 })) out.push(t.slice(tok.start, tok.end)); return out.join(''); };

    // 자식 순회(키 하드코딩 없음)
    const children = node => { const out = []; for (const k of Object.keys(node)) { if (k === 'loc' || k === 'range' || k === 'start' || k === 'end' || k === 'type') continue; const v = node[k];
        if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push([k, x]); } else if (v && typeof v.type === 'string') out.push([k, v]); } return out; };
    const parent = new Map(), parentKey = new Map();
    const all = [];
    (function walk(n) { all.push(n); for (const [k, c] of children(n)) { parent.set(c, n); parentKey.set(c, k); walk(c); } })(ast);
    const ancestors = n => { const a = []; let p = parent.get(n); while (p) { a.push(p); p = parent.get(p); } return a; };
    const isFn = n => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
    const topFn = n => { const a = [n].concat(ancestors(n)); for (let i = a.length - 1; i >= 0; i--) if (a[i].type === 'FunctionDeclaration' && parent.get(a[i]) === ast) return a[i].id.name; return '<top>'; };

    // ── P4·P5 스코프와 식별자 연결 ──
    const scopes = new Map();   // 노드 → { parent, decls: Map(name → [{ node, kind, scopeNode }]) }
    const mkScope = (node, par) => { const s = { node, parent: par, decls: new Map() }; scopes.set(node, s); return s; };
    const declare = (s, name, node, kind) => { if (!s.decls.has(name)) s.decls.set(name, []); s.decls.get(name).push({ node, kind, scope: s }); };
    const fnScopeOf = s => { while (s && !(s.node.type === 'Program' || isFn(s.node))) s = s.parent; return s; };
    const patternNames = (p, out = []) => { if (!p) return out; if (p.type === 'Identifier') out.push(p); else if (p.type === 'RestElement') patternNames(p.argument, out);
        else if (p.type === 'AssignmentPattern') patternNames(p.left, out); else if (p.type === 'ArrayPattern') p.elements.forEach(e => patternNames(e, out)); else if (p.type === 'ObjectPattern') p.properties.forEach(pr => patternNames(pr.type === 'RestElement' ? pr : pr.value, out)); return out; };
    const declIds = new Set();
    const scopeOf = new Map();
    (function build(n, s) {
        let cur = s;
        if (n.type === 'Program') cur = mkScope(n, null);
        else if (isFn(n)) { cur = mkScope(n, s); if (n.type === 'FunctionExpression' && n.id) { declare(cur, n.id.name, n.id, 'fname'); declIds.add(n.id); }
            n.params.forEach(p => patternNames(p).forEach(id => { declare(cur, id.name, id, 'param'); declIds.add(id); })); }
        else if (n.type === 'BlockStatement' && !isFn(parent.get(n))) cur = mkScope(n, s);
        else if (n.type === 'ForStatement' || n.type === 'ForOfStatement' || n.type === 'ForInStatement' || n.type === 'SwitchStatement') cur = mkScope(n, s);
        else if (n.type === 'CatchClause') { cur = mkScope(n, s); if (n.param) patternNames(n.param).forEach(id => { declare(cur, id.name, id, 'catch'); declIds.add(id); }); }
        if (n.type === 'FunctionDeclaration') { declare(s, n.id.name, n.id, 'function'); declIds.add(n.id); }
        if (n.type === 'VariableDeclaration') { const target = n.kind === 'var' ? fnScopeOf(s) : s; n.declarations.forEach(d => patternNames(d.id).forEach(id => { declare(target, id.name, id, n.kind); declIds.add(id); })); }
        scopeOf.set(n, cur);
        for (const [, c] of children(n)) build(c, (isFn(n) && c === n.body) ? cur : cur);
    })(ast, null);
    const isRef = id => { const p = parent.get(id), k = parentKey.get(id);
        if (declIds.has(id)) return false;
        if (p.type === 'MemberExpression' && k === 'property' && !p.computed) return false;
        if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && k === 'key' && !p.computed) return p.shorthand === true;
        if ((p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') && k === 'label') return false;
        return true; };
    const resolve = id => { let s = scopeOf.get(id); while (s) { const d = s.decls.get(id.name); if (d) return d[0]; s = s.parent; } return null; };
    const refs = all.filter(n => n.type === 'Identifier' && isRef(n));
    const resolved = new Map();
    for (const id of refs) { const d = resolve(id); resolved.set(id, d);
        if (!d && !ALLOWED_GLOBALS.includes(id.name)) fail('P5', id, '출처 불명 식별자 ' + id.name); }
    for (const [, s] of scopes) for (const [name, ds] of s.decls) {
        if (GLOBAL_NAMES.includes(name)) ds.forEach(d => fail('P5-shadow', d.node, '전역 이름 가림 ' + name));
        if (ds.length > 1) ds.forEach(d => fail('P5-dup', d.node, '같은 스코프 중복 선언 ' + name));
        if (MODULE_SENSITIVE.includes(name) && s.node !== ast) ds.forEach(d => fail('P5-inner', d.node, '민감 모듈 이름의 안쪽 선언 ' + name));
    }
    const rootScope = scopes.get(ast);
    for (const name of MODULE_SENSITIVE) if (!rootScope.decls.has(name)) fail('P5-missing', null, '민감 모듈 이름 최상위 선언 없음 ' + name);
    for (const id of refs) if (MODULE_SENSITIVE.includes(id.name)) { const d = resolved.get(id); if (!d || d.scope !== rootScope) fail('P5-bind', id, id.name + ' 가 최상위 선언에 연결되지 않음'); }

    // ── P7(c) 최상위 형태(R1·R3) ──
    const okInit = e => { if (!e) return true;
        if (e.type === 'Literal') return e.regex === undefined && e.bigint === undefined;
        if (e.type === 'UnaryExpression') return e.operator === '-' && e.argument.type === 'Literal' && typeof e.argument.value === 'number';
        if (e.type === 'TemplateLiteral') return e.expressions.length === 0;
        if (e.type === 'ArrayExpression') return e.elements.every(x => x && x.type !== 'SpreadElement' && okInit(x));
        if (e.type === 'ObjectExpression') return e.properties.every(p => p.type === 'Property' && p.kind === 'init' && !p.computed && !p.method && !p.shorthand && (p.key.type === 'Identifier' || (p.key.type === 'Literal' && typeof p.key.value === 'string')) && okInit(p.value));
        if (e.type === 'CallExpression') { const c = e.callee;
            if (c.type !== 'MemberExpression' || c.computed || c.object.type !== 'Identifier' || e.arguments.length !== 1) return false;
            const a = e.arguments[0], who = c.object.name + '.' + c.property.name;
            if (who === 'Object.freeze') return (a.type === 'ObjectExpression' || a.type === 'ArrayExpression') && okInit(a);
            if (who === 'Symbol.for') return a.type === 'Literal' && typeof a.value === 'string';
            if (who === 'Object.create') return a.type === 'Literal' && a.value === null;
            return false; }
        return false; };
    ast.body.forEach((st, i) => {
        if (i === 0) { if (!(st.type === 'ExpressionStatement' && st.directive === 'use strict')) fail('R1-top', st, "첫 문장이 'use strict' 지시문이 아님"); return; }
        if (st.type === 'FunctionDeclaration') return;
        if (st.type === 'VariableDeclaration' && (st.kind === 'const' || st.kind === 'let')) { st.declarations.forEach(d => { if (d.id.type !== 'Identifier') fail('R1-top', d, '최상위 구조 분해'); if (!okInit(d.init)) fail('R1-top', d, '허용되지 않은 최상위 초기화식 ' + norm(d)); }); return; }
        if (i === ast.body.length - 1 && st.type === 'ExpressionStatement' && norm(st) === 'module.exports=Object.freeze({init:init,wrapEndLife:wrapEndLife,finishMeasurement:finishMeasurement});') return;   // T63 내보내기 1곳
        fail('R1-top', st, '허용되지 않은 최상위 문장 ' + st.type);
    });

    // ── P6 표지 → 앵커 ──
    const marks = [];
    for (const n of all) {
        if (n.type === 'Identifier' && isRef(n) && SENS_IDS.has(n.name)) marks.push(n);
        else if (n.type === 'MemberExpression' && (n.computed || SENS_PROPS.has(n.property.name))) marks.push(n);
        else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') marks.push(n);
        else if (n.type === 'UpdateExpression' && n.argument.type === 'MemberExpression') marks.push(n);
        else if (n.type === 'UnaryExpression' && n.operator === 'delete') marks.push(n);
        else if (n.type === 'BinaryExpression' && n.operator === 'in') marks.push(n);
        else if (n.type === 'Property' && (n.kind === 'get' || n.kind === 'set')) marks.push(n);
        else if (n.type === 'Literal' && typeof n.value === 'string' && (n.value === '__proto__' || n.value === 'constructor' || n.value === 'prototype')) marks.push(n);
        else if (SELF_MARK_TYPES.has(n.type)) marks.push(n);
    }
    // 앵커: 표지 자신(사이트 형태이면) 또는 함수 경계 안의 가장 가까운 사이트 형태 조상. 그 뒤 멤버 사슬의 바깥쪽·호출의 콜리 위치는 그 호출로 올린다.
    const lift = a => { for (;;) { const p = parent.get(a); if (!p) return a;
        if (p.type === 'MemberExpression' && p.object === a) { a = p; continue; }
        if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.callee === a) { a = p; continue; }
        return a; } };
    const anchorOf = n => { if (n.type === 'UnaryExpression' || n.type === 'BinaryExpression' || n.type === 'Property' || n.type === 'Literal' || n.type === 'ThisExpression') return n;
        if (ANCHOR_TYPES.has(n.type) || SELF_MARK_TYPES.has(n.type)) return lift(n);
        for (const a of ancestors(n)) { if (isFn(a)) break; if (ANCHOR_TYPES.has(a.type)) return lift(a); } return n; };
    const anchors = new Map();   // key → { count, lines }
    const anchorNodes = new Map();   // key → 앵커 노드 목록(보고 JSON 에는 넣지 않음)
    const seen = new Set();
    for (const m of marks) { const a = anchorOf(m); if (seen.has(a)) continue; seen.add(a);
        const key = topFn(a) + '|' + a.type + '|' + norm(a);
        if (!anchors.has(key)) { anchors.set(key, { count: 0, lines: [] }); anchorNodes.set(key, []); }
        const r = anchors.get(key); r.count += 1; r.lines.push(a.loc.start.line); anchorNodes.get(key).push(a); }
    const table = new Map(SITES.map(s => [s.fn + '|' + s.type + '|' + s.text, s]));
    if (table.size !== SITES.length) fail('P6-table', null, '사이트 표에 중복 키');
    for (const s of SITES) { if (!Number.isInteger(s.count) || s.count < 1) fail('P6-table', null, s.id + ' 횟수가 1 이상의 정수가 아님');
        if (s.parts !== undefined && !(Array.isArray(s.parts) && s.parts.length === s.count && s.parts[0] === s.id)) fail('P6-table', null, s.id + ' parts 길이·첫 번호가 count·id 와 다름'); }
    for (const [key, r] of anchors) { const s = table.get(key);
        if (!s) fails.push({ rule: 'P6-unlisted', line: r.lines[0], msg: '허용 사이트 표 밖의 위치 ' + key + ' ×' + r.count });
        else if (s.count !== r.count) fails.push({ rule: 'P6-count', line: r.lines[0], msg: s.id + ' 횟수 ' + r.count + ' ≠ 표 ' + s.count + ' (' + key + ')' }); }
    // P6-parts(R3 보강): parts 의 각 T 번호가 원문 순서대로 그 위치의 실제 문맥과 맞는가(PARTS_SEMANTICS 대조)
    const inside = (inner, outer) => outer.start <= inner.start && inner.end <= outer.end;
    const initFn = ast.body.find(st => st.type === 'FunctionDeclaration' && st.id.name === 'init');
    const outerTry = initFn ? initFn.body.body.find(st => st.type === 'TryStatement') : null;
    const ctxOf = n => {
        if (!outerTry || !inside(n, outerTry)) return 'none';
        if (outerTry.handler && inside(n, outerTry.handler)) return 'catch';
        if (!inside(n, outerTry.block)) return 'none';
        const body = outerTry.block.body, idx = body.findIndex(st => inside(n, st)); let ctx = 'stage0';
        for (let i = 0; i < idx; i++) { const e = body[i].type === 'ExpressionStatement' ? body[i].expression : null;
            if (e && e.type === 'AssignmentExpression' && e.operator === '=' && e.left.type === 'Identifier' && e.left.name === 'stage' && e.right.type === 'Literal' && Number.isInteger(e.right.value)) ctx = 'stage' + e.right.value; }
        return ctx; };
    const partsReport = [];
    for (const s of SITES) { const key = s.fn + '|' + s.type + '|' + s.text, sem = PARTS_SEMANTICS[key];
        if (s.parts === undefined) { if (sem) fail('P6-parts', null, s.id + ' 의미표가 있는 키인데 parts 가 없음 ' + key); continue; }
        if (!sem) { fail('P6-parts', null, s.id + ' parts 의 의미표가 검사기에 없음 ' + key); continue; }
        const nodes = (anchorNodes.get(key) || []).slice().sort((x, y) => x.start - y.start);
        nodes.forEach((n, i) => { const ctx = ctxOf(n), want = sem[ctx];
            partsReport.push({ key, i, line: n.loc.start.line, ctx, part: s.parts[i], want: want || null });
            if (want === undefined) fail('P6-parts', n, s.id + ' 위치 ' + (i + 1) + ' 의 문맥 ' + ctx + ' 이 의미표 밖 (' + key + ')');
            else if (s.parts[i] !== want) fail('P6-parts', n, s.id + ' 위치 ' + (i + 1) + ' parts=' + s.parts[i] + ' ≠ 문맥 ' + ctx + ' 의 ' + want + ' (' + key + ')'); }); }
    for (const key of Object.keys(PARTS_SEMANTICS)) if (!table.has(key)) fail('P6-parts', null, '의미표 키가 사이트 표에 없음 ' + key);
    for (const s of SITES) if (!anchors.has(s.fn + '|' + s.type + '|' + s.text)) fails.push({ rule: 'P6-missing', line: null, msg: s.id + ' 표 항목이 코드에 없음(0 ≠ ' + s.count + ') ' + s.fn + '|' + s.text });
    // P7(d) 사이트 노드 안의 함수
    for (const a of seen) { if (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') continue;
        const inner = []; (function w(n) { for (const [, c] of children(n)) { if (isFn(c)) inner.push(c); else w(c); } })(a);
        if (inner.length) { const key = topFn(a) + '|' + a.type + '|' + norm(a); const s = table.get(key); if (!(s && s.allowFn === inner.length)) fail('P7d', a, '사이트 노드 안의 함수 ' + key); } }

    // ── P7(a) 서술자 속성 읽기는 isData 판정 뒤에만(R2) ──
    const isDataCall = (e, obj, negated) => { if (negated) { if (!(e.type === 'UnaryExpression' && e.operator === '!')) return false; e = e.argument; }
        return e.type === 'CallExpression' && e.callee.type === 'Identifier' && e.callee.name === 'isData' && e.arguments.length === 1 && e.arguments[0].type === 'Identifier' && e.arguments[0].name === obj; };
    const andTerms = e => (e.type === 'LogicalExpression' && e.operator === '&&') ? andTerms(e.left).concat(andTerms(e.right)) : [e];
    const orTerms = e => (e.type === 'LogicalExpression' && e.operator === '||') ? orTerms(e.left).concat(orTerms(e.right)) : [e];
    const within = (inner, outer) => outer.start <= inner.start && inner.end <= outer.end;
    const guarded = (mem, obj) => { let child = mem;
        for (const a of ancestors(mem)) {
            if (isFn(a)) return false;
            if (a.type === 'LogicalExpression' && a.operator === '&&' && within(child, a.right) && andTerms(a.left).some(t => isDataCall(t, obj, false))) return true;
            if (a.type === 'LogicalExpression' && a.operator === '||' && within(child, a.right) && orTerms(a.left).some(t => isDataCall(t, obj, true))) return true;
            if (a.type === 'IfStatement' && within(child, a.consequent) && andTerms(a.test).some(t => isDataCall(t, obj, false))) return true;
            if (a.type === 'BlockStatement' || a.type === 'Program') {   // 같은 블록의 앞 문장: if (!isData(obj) …) return/throw
                const idx = a.body.findIndex(st => within(child, st));
                for (let i = 0; i < idx; i++) { const st = a.body[i];
                    if (st.type === 'IfStatement' && !st.alternate && orTerms(st.test).some(t => isDataCall(t, obj, true)) && (st.consequent.type === 'ReturnStatement' || st.consequent.type === 'ThrowStatement')) return true; }
            }
            child = a;
        }
        return false; };
    for (const n of all) if (n.type === 'MemberExpression' && !n.computed && (n.property.name === 'value' || n.property.name === 'writable' || n.property.name === 'configurable')) {
        if (n.object.type !== 'Identifier') { fail('P7a', n, '서술자 속성 읽기의 대상이 식별자가 아님 ' + norm(n)); continue; }
        const p = parent.get(n); if (p.type === 'AssignmentExpression' && p.left === n) { fail('P7a', n, '서술자 속성 쓰기 ' + norm(n)); continue; }
        if (!guarded(n, n.object.name)) fail('P7a', n, 'isData 판정 없이 서술자 속성 읽기 ' + norm(n));
    }
    // ── P7(b) 계산된 키의 출처 ──
    const loopVarOver = (id, overNames) => { const d = resolved.get(id); if (!d || d.kind !== 'const') return false;
        const decl = parent.get(d.node), vd = parent.get(decl), loop = parent.get(vd);
        return decl.type === 'VariableDeclarator' && vd.type === 'VariableDeclaration' && loop && loop.type === 'ForOfStatement' && loop.left === vd && loop.right.type === 'Identifier' && overNames.includes(loop.right.name); };
    const numLoopVar = id => { const d = resolved.get(id); if (!d || d.kind !== 'let') return false; const decl = parent.get(d.node), vd = parent.get(decl), loop = parent.get(vd); return loop && loop.type === 'ForStatement' && loop.init === vd; };
    for (const n of all) if (n.type === 'MemberExpression' && n.computed && n.object.type === 'Identifier' && ['EE', 'WRAPPERS', 'ORIG_OF'].includes(n.object.name)) {
        const k = n.property;
        const arrowOverWatch = id => { const d = resolved.get(id); if (!d || d.kind !== 'param') return false; const fnN = parent.get(d.node), call = parent.get(fnN);
            return fnN.type === 'ArrowFunctionExpression' && fnN.params.length === 1 && call && call.type === 'CallExpression' && call.arguments.length === 1 && call.arguments[0] === fnN && norm(call.callee) === 'WATCH.map'; };   // T17 화살표 매개변수
        const ok = (k.type === 'Identifier' && (loopVarOver(k, ['WATCH', 'attempted']) || arrowOverWatch(k))) || (k.type === 'MemberExpression' && k.computed && k.object.type === 'Identifier' && k.object.name === 'WATCH' && k.property.type === 'Identifier' && numLoopVar(k.property));
        if (!ok) fail('P7b', n, '계산된 키의 출처를 증명할 수 없음 ' + norm(n));
    }
    // ORIG_OF 는 init 지역 상수(Object.create(null)) 하나와 provenClean 매개변수 하나만
    for (const [, s] of scopes) { const ds = s.decls.get('ORIG_OF'); if (!ds) continue; for (const d of ds) {
        const fnName = topFn(d.node), dp = parent.get(d.node);
        const ok = (fnName === 'init' && d.kind === 'const' && dp.type === 'VariableDeclarator' && dp.init && norm(dp.init) === 'Object.create(null)') || (fnName === 'provenClean' && d.kind === 'param');
        if (!ok) fail('P7b', d.node, 'ORIG_OF 선언 위치·형태가 허용 밖'); } }

    return { ok: fails.length === 0, fails, anchors: Object.fromEntries([...anchors].map(([k, r]) => [k, r])), parser: acorn.version, siteCount: SITES.length, partsReport };
}

module.exports = { check, loadAcorn, PARSE_OPTS, ACORN_SHA256, ACORN_VERSION };

if (require.main === module) {
    const args = process.argv.slice(2);
    const target = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--json') || path.join(__dirname, 'measure_module.js');
    let src; try { src = fs.readFileSync(target, 'utf8'); } catch (e) { die(2, 'PREP FAIL: 대상 읽기 실패 ' + e.message); }
    const acorn = loadAcorn();
    const r = check(src, { acorn });
    console.log('checker: acorn ' + r.parser + ' (sha256 ' + ACORN_SHA256 + ') opts ' + JSON.stringify(PARSE_OPTS));
    console.log('target: ' + target + ' sha256 ' + crypto.createHash('sha256').update(src, 'utf8').digest('hex'));
    if (args.includes('--dump')) for (const [k, v] of Object.entries(r.anchors)) console.log('ANCHOR ' + v.count + ' ' + k + ' @' + v.lines.join(','));
    for (const p of r.partsReport) console.log('PARTS ' + p.key + ' #' + (p.i + 1) + ' L' + p.line + ' ctx=' + p.ctx + ' parts=' + p.part + ' 의미=' + p.want + (p.part === p.want ? ' OK' : ' MISMATCH'));
    const ji = args.indexOf('--json'); if (ji >= 0) fs.writeFileSync(args[ji + 1], JSON.stringify(r, null, 1));
    for (const f of r.fails) console.log('FAIL ' + f.rule + (f.line ? ' L' + f.line : '') + ' ' + f.msg);
    const total = Object.values(r.anchors).reduce((a, v) => a + v.count, 0);
    console.log('RESULT: ' + (r.ok ? 'PASS' : 'FAIL') + ' sites=' + r.siteCount + ' anchorKeys=' + Object.keys(r.anchors).length + ' anchorTotal=' + total + ' fails=' + r.fails.length);
    process.exitCode = r.ok ? 0 : 1;
}
