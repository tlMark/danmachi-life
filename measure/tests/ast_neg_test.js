'use strict';
// GA-NI-2 ⑫-neg — 정적 검사기 음성 변이 시험(검사기 자체의 시험). 측정 모듈 원문에 금지 형태를 하나씩 넣은 변이 문자열마다 검사기가 실패(ok=false)를 내야 한다.
// 양성 대조: 변이 없는 원문은 통과해야 한다. 변이는 메모리 안에서만 만들고 파일을 바꾸지 않는다.
// 사용: node measure/tests/ast_neg_test.js — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), path = require('path');
const { check, loadAcorn } = require('../ast_check.js');
const acorn = loadAcorn();
const SRC = fs.readFileSync(path.join(__dirname, '..', 'measure_module.js'), 'utf8');
const out = []; let failed = 0;
const rec = (id, ok, d) => { if (!ok) failed++; out.push((ok ? 'PASS ' : 'FAIL ') + id + (d ? ' — ' + d : '')); };
const once = (src, from, to) => { const n = src.split(from).length - 1; if (n !== 1) throw new Error('변이 기준 문자열 일치 ' + n + '회: ' + from.slice(0, 50)); return src.replace(from, () => to); };
const IN_SAMEFNS = '    if (a === null || b === null || a.length !== b.length) return false;';
const IN_INIT = "        PROC = process;\n";
const IN_ENV = '    if (o !== EE) chainClean = false;';
const TOP_END = 'let HOOK_NEW0 = null, HOOK_RM0 = null;';
const MUT = [
  // v49 ⑫-neg 지정 10종
  ['N01 별칭 const d = Object.defineProperty', IN_SAMEFNS, s => 'const dp = Object.defineProperty;\n' + s],
  ['N02 구조 분해 const { defineProperty } = Object', IN_SAMEFNS, s => 'const { defineProperty } = Object;\n' + s],
  ['N03 Reflect[k] 계산된 접근', IN_SAMEFNS, s => "const k = 'set'; Reflect[k](a, 'x', 1);\n" + s],
  ["N04 globalThis['ev'+'al']", IN_SAMEFNS, s => "globalThis['ev' + 'al']('1');\n" + s],
  ['N05 ({}).constructor', IN_SAMEFNS, s => 'const C = ({}).constructor;\n' + s],
  ['N06 EE.on = f(점 접근 쓰기)', IN_INIT, s => s + '        EE.on = function () {};\n'],
  ['N07 o.__proto__', IN_ENV, s => 'const pp = o.__proto__;\n' + s],
  ['N08 최상위 foo()', TOP_END, s => s + '\nsameFns([], []);'],
  ['N09 최상위 Object.freeze(x) 비리터럴 인자', TOP_END, s => s + '\nconst FZ = Object.freeze(WATCH);'],
  ['N10 최상위 Symbol.for(v) 비문자열 인자', TOP_END, s => s + '\nconst SY = Symbol.for(MARK_BRAND);'],
  // R1~R8 대응
  ["N11 R2 'value' in d", "            if (isData(pre)) {", s => "            if ('value' in pre) {"],
  ['N12 R2 isData 판정 없이 pre.value 읽기', "            if (isData(pre)) {\n                const v = pre.value;", s => "            {\n                const v = pre.value;"],
  ['N13 R2 mk.value 를 isData 앞에서 읽기', "    if (!isData(mk)) return 'marker_ownership_unconfirmed';", s => "    if (mk.value === null) return 'x';\n" + s],
  ['N14 R3 markerGuard 에 RD_gopd 1회 추가', "    let defined = false;", s => "    const extra = RD_gopd(globalThis, INIT_KEY);\n" + s],
  ['N15 R1 isData 내부 호출 형태 변경', "return d !== undefined && RD_gopd(d, 'value') !== undefined;", s => "return d !== undefined && RD_gopd(d, 'get') === undefined;"],
  ['N16 R1·R4 isData 호출 추가', IN_ENV, s => s + '\n    isData(RD_gopd(EE, "on"));'],
  ['N17 R4 표 밖 지역 함수 호출', IN_ENV, s => s + '\n    seal();'],
  ['N18 R5 PROC.on 직접 읽기', "        try { RD_apply(WRAPPERS.on, PROC, ['exit', M]); }", s => "        try { PROC.on('exit', M); }"],
  ['N19 R5 process 속성 읽기', IN_INIT, s => s + '        const ev = process.env;\n'],
  ['N20 R7 RD_gopd(EE,name) 1회 제거(미달)', "    for (const name of WATCH) { const d = RD_gopd(EE, name); if (!isData(d) || d.value !== WRAPPERS[name]) watchIntact = false; }", s => '    watchIntact = true;'],
  ['N21 R7 T11 RD_apply 1회 추가(초과)', "        if (!WATCH_ON) return RD_apply(orig, this, args);", s => s + '\n        RD_apply(orig, this, args);'],
  ['N22 P7b EE 계산된 키가 반복 변수 아님', IN_INIT, s => s + "        const kk = 'on'; EE[kk] = null;\n"],
  ['N23 P5 전역 이름 가림 const Object', IN_SAMEFNS, s => 'const Object = null;\n' + s],
  ['N24 P5 민감 이름 안쪽 재선언 let EE', IN_SAMEFNS, s => 'let EE = null;\n' + s],
  ['N25 P5 출처 불명 식별자 setTimeout', IN_SAMEFNS, s => "setTimeout('1');\n" + s],
  ['N26 접근자 정의 get', IN_SAMEFNS, s => 'const gg = { get x() { return 1; } };\n' + s],
  ['N27 스프레드 인자', IN_SAMEFNS, s => 'Math.max(...a);\n' + s],
  ['N28 선택적 호출 ?.()', IN_SAMEFNS, s => 'a.f?.();\n' + s],
  ['N29 T19 ORIG_OF 를 일반 객체로', '    const ORIG_OF = Object.create(null);', s => '    const ORIG_OF = {};'],
  ['N30 require 추가(vm)', IN_INIT, s => s + "        const vmx = require('vm');\n"],
  ['N31 태그된 템플릿', IN_SAMEFNS, s => 'String.raw`x`;\n' + s],
  ['N32 new Function', IN_SAMEFNS, s => "const nf = new Function('return 1');\n" + s],
  ['N33 T17 화살표를 function 식으로', 'new Set(WATCH.map(n => WRAPPERS[n]))', s => 'new Set(WATCH.map(function (n) { return WRAPPERS[n]; }))'],
  ['N34 RD_apply.call 경유', IN_ENV, s => s + '\n    RD_apply.call(null, RD_gpo, null, [o]);'],
  ['N35 T14 인자 형태 변경', "RD_apply(WRAPPERS.on, PROC, ['exit', M])", s => "RD_apply(WRAPPERS.on, PROC, ['exit', M, M])"],
  ['N36 T18 safeInc 대상 객체 변경', "        safeInc(M_, 'C');", s => "        safeInc({}, 'C');"],
  ['N37 delete 연산자', IN_SAMEFNS, s => 'delete a.x;\n' + s],
  ['N38 with 문(엄격 모드 파싱 실패)', IN_SAMEFNS, s => 'with (a) {}\n' + s],
  ['N39 import()', IN_SAMEFNS, s => "import('fs');\n" + s],
  ['N40 최상위 IIFE', TOP_END, s => s + '\n(function () {})();'],
  ['N41 최상위 x.y = 대입', TOP_END, s => s + '\nM_.C = 1;'],
  ['N42 Reflect.set 참조(별칭)', IN_SAMEFNS, s => 'const rs = Reflect.set;\n' + s],
  ['N43 globalThis 점 접근', IN_SAMEFNS, s => 'const gx = globalThis.x;\n' + s],
  ['N44 Object.prototype 접근', IN_SAMEFNS, s => 'const op = Object.prototype;\n' + s],
  ['N45 EE 별칭 대입', IN_INIT, s => s + '        const EE2 = EE;\n'],
  ['N46 T10 RD_gopd(o, n) 의 o 를 다른 객체로', 'if (RD_gopd(o, n) !== undefined)', s => 'if (RD_gopd(PROC, n) !== undefined)'],
  ['N47 T8 설치 대입 키를 attempted 원소 대신 상수로', '            EE[name] = w;', s => "            EE['on'] = w;"],
  ['N48 T6 defineProperty 3번째 인자 변경', 'configurable: false }); }', s => 'configurable: true }); }'],
  ['N49 B: 서술자 속성 쓰기', IN_ENV, s => s + '\n    const dd = RD_gopd(EE, "on"); if (isData(dd)) dd.value = null;'],
  ['N50 함수 값 인자 전달(표 밖)', IN_SAMEFNS, s => 'a.forEach(sameFns);\n' + s],
];
rec('POS 원문 통과', check(SRC, { acorn }).ok, JSON.stringify(check(SRC, { acorn }).fails.slice(0, 3)));
for (const [id, from, f] of MUT) {
  let src; try { src = once(SRC, from, f(from)); } catch (e) { rec(id, false, '변이 생성 실패 ' + e.message); continue; }
  const r = check(src, { acorn });
  rec(id + ' → 검사기 실패', !r.ok, r.ok ? '검사기가 통과시킴(검출 실패)' : r.fails.slice(0, 2).map(x => x.rule + ':' + x.msg.slice(0, 70)).join(' / '));
}
// ── R3 보강(parts 의미 대조)의 음성 시험: 표 변이·문맥 변이 ──
const SITES0 = require('../ast_sites.js');
const sitesWith = (key, f) => SITES0.map(x => (x.fn + '|' + x.type + '|' + x.text) === key ? f(JSON.parse(JSON.stringify(x))) : x);
const K7 = 'init|CallExpression|RD_gopd(EE,name)', K8 = 'init|MemberExpression|EE[name]';
const TMUT = [
  ['N51 parts 순서 뒤바꿈(T7,T9,T10,T10)', sitesWith(K7, x => { x.parts = ['T7', 'T9', 'T10', 'T10']; return x; })],
  ['N52 parts 의 T8·T9 뒤바꿈(설치↔복원)', sitesWith(K8, x => { x.parts = ['T9', 'T8']; x.id = 'T9'; return x; })],
  ['N53 parts 삭제(의미표 있는 키)', sitesWith(K7, x => { delete x.parts; return x; })],
  ['N54 의미표 없는 키에 parts 추가', sitesWith('init|AssignmentExpression|EE[name]=w', x => { x.parts = ['T8']; return x; })],
];
for (const [id, sites] of TMUT) { const r = check(SRC, { acorn, sites }); rec(id + ' → 검사기 실패', !r.ok, r.ok ? '검사기가 통과시킴' : r.fails.slice(0, 2).map(x => x.rule + ':' + x.msg.slice(0, 80)).join(' / ')); }
for (const [id, from, to] of [
  ['N55 3단계 표지를 stage = 1 로(같은 개수, 문맥만 바뀜)', '        stage = 3;', '        stage = 1;'],
  ['N56 복원 루프의 RD_gopd 를 3단계로 옮김(개수 같음)', "                const d0 = RD_gopd(EE, name);\n                if (isData(d0) && d0.value !== ORIG_OF[name]) EE[name] = ORIG_OF[name];", "                const d0 = undefined;\n                if (isData(d0) && d0.value !== ORIG_OF[name]) EE[name] = ORIG_OF[name];"],
]) {
  let src; try { src = once(SRC, from, to); if (id.startsWith('N56')) src = once(src, '        if (!allOk) throw \'verify_failed\';', "        for (const name of WATCH) RD_gopd(EE, name);\n        if (!allOk) throw 'verify_failed';"); } catch (e) { rec(id, false, '변이 생성 실패 ' + e.message); continue; }
  const r = check(src, { acorn }); rec(id + ' → 검사기 실패', !r.ok && r.fails.some(f => f.rule === 'P6-parts'), r.ok ? '검사기가 통과시킴' : r.fails.slice(0, 3).map(x => x.rule + ':' + x.msg.slice(0, 80)).join(' / '));
}
console.log(out.join('\n'));
console.log(`RESULT: ${failed ? 'FAIL' : 'PASS'} ${out.length - failed}/${out.length} (ast_neg_test, acorn ${acorn.version})`);
process.exitCode = failed ? 1 : 0;
