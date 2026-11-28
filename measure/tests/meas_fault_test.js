'use strict';
// GA-INV-2 측정 사본 — 고장 주입 시험(위임 범위: 측정 사본 구현·고장 주입 시험, DECISION_LOG v21). 게임 저장소의 파일을 바꾸지 않는다.
// 모든 고장은 합성이다: ① 자식 프로세스의 -r 사전 적재 스크립트로 환경을 바꾸거나 ② 임시 폴더의 측정 모듈·러너 사본에 변이를 넣는다.
// 러너 단계 시험은 measure/measure_runner.js 를 SIM_RUNS=3 으로 실행하고, 표준 오류의 상태 줄·종료 코드·게임 결과 출력 여부·vm 생성 여부(사전 적재로 계측)·보고 파일을 본다.
// 사용: node measure/tests/meas_fault_test.js [작업 폴더] — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const MDIR = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'meas_fault_')));
fs.mkdirSync(WORK, { recursive: true });
const out = []; let failed = 0;
const rec = (id, ok, d) => { if (!ok) failed++; out.push((ok ? 'PASS ' : 'FAIL ') + id + (d !== undefined ? ' — ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); };
const W = (name, text) => { const p = path.join(WORK, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };

// vm 생성 계측(사전 적재): vm.createContext 호출 시 표준 오류에 VM_CREATED 를 남긴다(게임·측정 동작에는 관여하지 않는 관측).
const VMSPY = W('pre_vmspy.js', "const vm = require('vm'); const c = vm.createContext; vm.createContext = function () { process.stderr.write('VM_CREATED\\n'); return c.apply(this, arguments); };\n");
const EE_EXPR = "require('events').EventEmitter.prototype";
const PRE = {
  marker_brand: W('pre_marker_brand.js', "Object.defineProperty(globalThis, Symbol.for('danmachi.measure.init'), { value: Object.freeze({ brand: 'danmachi.measure.v1' }), writable: false, configurable: false });\n"),
  marker_true: W('pre_marker_true.js', "Object.defineProperty(globalThis, Symbol.for('danmachi.measure.init'), { value: true, writable: false, configurable: false });\n"),
  marker_brand_getter: W('pre_marker_getter.js', "Object.defineProperty(globalThis, Symbol.for('danmachi.measure.init'), { get() { process.stderr.write('GETTER_RAN\\n'); return 1; }, configurable: false });\n"),
  global_nonext: W('pre_global_nonext.js', "Object.preventExtensions(globalThis);\n"),
  define_lies: W('pre_define_lies.js', "Reflect.defineProperty = function () { return true; };\n"),
  // 25n11: Node 는 EventEmitter.prototype 전체를 동결하면 내부 스트림 초기화에서 멈춘다(실행 환경 제약, 시험 작성 중 확인). 그래서 첫 이름 'on' 만 쓰기 불가로 만든다(같은 경로: 첫 대입 실패).
  //   'on' 을 바로 쓰기 불가로 만들어도 Node 내부 스트림이 적재될 때 Readable.prototype.on 대입이 실패하므로, 스트림 계열 내장 모듈을 먼저 적재한 뒤 바꾼다.
  ee_frozen: W('pre_ee_frozen.js', `require('stream'); require('fs'); require('crypto'); require('vm'); require('child_process'); { const EE = ${EE_EXPR}; Object.defineProperty(EE, 'on', { writable: false }); }\n`),
  orig_on_capture: W('pre_orig_on.js', `globalThis.__origOn = ${EE_EXPR}.on;\n`),
  ee_on_accessor: W('pre_ee_on_accessor.js', `{ const EE = ${EE_EXPR}; const f = EE.on; Object.defineProperty(EE, 'on', { get() { return f; }, set(v) {}, configurable: true }); }\n`),
  ee_emit_accessor: W('pre_ee_emit_accessor.js', `{ const EE = ${EE_EXPR}; const f = EE.emit; Object.defineProperty(EE, 'emit', { get() { return f; }, configurable: true }); }\n`),
  // 25n10: 5번째 이름(prependOnceListener)의 설치 확인 서술자 읽기가 예외. once=1 이면 한 번만(복원 성공 → clean), always 이면 계속(→ residual)
  gopd_throw_once: W('pre_gopd_once.js', gopdThrow("'prependOnceListener'", 'once')),
  gopd_throw_always: W('pre_gopd_always.js', gopdThrow("'prependOnceListener'", 'always')),
  // 25n12: 3번째 이름(addListener) 확인에서 예외 + 그 순간 EE 동결 → 복원 대입 실패 → 래퍼 잔존
  restore_blocked: W('pre_restore_blocked.js', gopdThrow("'addListener'", 'once', `for (const n of ['on', 'once', 'addListener']) Object.defineProperty(EE, n, { writable: false });`)),
  // 25n13: 3번째 확인 예외 + 그 순간 'on' 을 다른 함수(쓰기 불가)로 바꿈 → 복원 뒤 값이 원본과 다름
  alias_broken: W('pre_alias_broken.js', gopdThrow("'addListener'", 'once', `Object.defineProperty(EE, 'on', { value: function other() {}, writable: false, configurable: true });`)),
};
function gopdThrow(nameLit, mode, onThrow = '') {
  return `{ const EE = ${EE_EXPR}; const orig = Object.create(null); for (const n of ['on','once','addListener','prependListener','prependOnceListener','off','removeListener','removeAllListeners','setMaxListeners']) orig[n] = EE[n];
  const g = Reflect.getOwnPropertyDescriptor; let thrown = 0;
  Reflect.getOwnPropertyDescriptor = function (o, k) { if (o === EE && k === ${nameLit} && EE[k] !== orig[k] && (${mode === 'once' ? 'thrown === 0' : 'true'})) { thrown += 1; ${onThrow} throw new Error('injected gopd'); } return g(o, k); }; }\n`;
}
const BAD = {
  load_throw: W('bad_load_throw.js', "throw new Error('module top-level failure');\n"),
  init_number: W('bad_init_number.js', 'module.exports = { init() { return 5; } };\n'),
  init_weird: W('bad_init_weird.js', "module.exports = { init() { return { state: 'weird' }; } };\n"),
  init_throws: W('bad_init_throws.js', "module.exports = { init() { throw new Error('x'); } };\n"),
};
function runRunner(id, { pre = [], env = {}, runner = path.join(MDIR, 'measure_runner.js') } = {}) {
  const report = path.join(WORK, 'rep_' + id + '.json'); try { fs.unlinkSync(report); } catch (_) {}
  const args = [].concat(...[VMSPY].concat(pre).map(p => ['-r', p]), [runner]);
  const r = spawnSync(process.execPath, args, { env: { ...process.env, SIM_RUNS: '3', SIM_SEED: '777', SIM_MEAS_REPORT: report, ...env }, encoding: 'utf8', timeout: 300000 });
  const m = /measurement: state=(\S+) reason=(\S+)/.exec(r.stderr || '');
  let rep = null; try { rep = JSON.parse(fs.readFileSync(report, 'utf8')); } catch (_) {}
  return { code: r.status, state: m ? m[1] : null, reason: m ? m[2] : null, game: /==== DanMachi Life Simulation Test ====/.test(r.stdout || ''), vm: /VM_CREATED/.test(r.stderr || ''), rep, stderr: r.stderr, getter: /GETTER_RAN/.test(r.stderr || '') };
}
const refused = r => r.code === 1 && !r.game && !r.vm && r.rep === null;
const ranOriginal = r => r.code === 0 && r.game && r.vm && r.rep === null;

// ── 러너 단계: 상태 결정·실행 허용 ──
{ const r = runRunner('R0'); rec('R0 정상: active · 실행 · 보고 valid', r.state === 'active' && r.code === 0 && r.game && r.vm && r.rep && r.rep.verdict === 'valid', { state: r.state, code: r.code, verdict: r.rep && r.rep.verdict }); }
{ const r = runRunner('25n16', { env: { SIM_MEAS_SHA_UNDEFINED: '1' } }); rec('25n16 SHA 미정 → unavailable(measure_sha_undefined) · 원본 소스 비계측 실행 · 보고 없음', r.state === 'unavailable' && r.reason === 'measure_sha_undefined' && ranOriginal(r), r); }
{ const r = runRunner('25n22', { env: { SIM_MEAS_MODULE: BAD.load_throw } }); rec('25n22 모듈 최상위 예외 → inactive_unknown(module_load_failed) · vm 생성 전 거부', r.state === 'inactive_unknown' && r.reason === 'module_load_failed' && refused(r), { state: r.state, reason: r.reason, code: r.code, vm: r.vm }); }
{ const r = runRunner('25n22b', { env: { SIM_MEAS_MODULE: path.join(WORK, 'no_such_module.js') } }); rec('25n22b 모듈 파일 없음 → module_load_failed · 거부', r.state === 'inactive_unknown' && r.reason === 'module_load_failed' && refused(r)); }
for (const [id, mod, why] of [['25n21a', BAD.init_number, 'bad_init_result'], ['25n21b', BAD.init_weird, 'bad_init_result'], ['25n21c', BAD.init_throws, 'init_threw']]) {
  const r = runRunner(id, { env: { SIM_MEAS_MODULE: mod } }); rec(id + ' 비정상 init → inactive_unknown(' + why + ') · 거부', r.state === 'inactive_unknown' && r.reason === why && refused(r), { state: r.state, reason: r.reason, code: r.code });
}
// ── markerGuard(G2′·G3a·G3b) 고장 주입 ──
{ const r = runRunner('25n23', { pre: [PRE.marker_brand] }); rec('25n23 같은 형식 표지 선점 → other_instance_likely · 거부', r.state === 'inactive_unknown' && r.reason === 'other_instance_likely' && refused(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n24', { pre: [PRE.marker_true] }); rec('25n24 값 true 표지 선점 → foreign_marker_unknown · 거부', r.state === 'inactive_unknown' && r.reason === 'foreign_marker_unknown' && refused(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n24g', { pre: [PRE.marker_brand_getter] }); rec('25n24g 접근자 표지 선점 → foreign_marker_unknown · getter 미실행 · 거부', r.state === 'inactive_unknown' && r.reason === 'foreign_marker_unknown' && !r.getter && refused(r), { state: r.state, reason: r.reason, getter: r.getter }); }
{ const r = runRunner('25n25', { pre: [PRE.global_nonext] }); rec('25n25 globalThis 확장 불가 → marker_define_failed · 거부', r.state === 'inactive_unknown' && r.reason === 'marker_define_failed' && refused(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n26', { pre: [PRE.define_lies] }); rec('25n26 defineProperty 가 true 를 반환하나 정의 안 됨 → marker_ownership_unconfirmed · 거부', r.state === 'inactive_unknown' && r.reason === 'marker_ownership_unconfirmed' && refused(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n27', { pre: [PRE.marker_brand] });   // 외부 코드가 brand 를 흉내 낸 표지(사전 적재 내용은 25n23 과 같다 — 외부 흉내와 다른 인스턴스는 구별할 수 없다는 한계 사례)
  rec('25n27 외부의 brand 흉내 표지 → other_instance_likely(오추정)이지만 판정은 inactive_unknown·거부(진단 사유가 판정을 바꾸지 않음)', r.state === 'inactive_unknown' && r.reason === 'other_instance_likely' && refused(r), { state: r.state, reason: r.reason }); }
// ── 설치·복원(attempted·K1′·K2·K3) 고장 주입 ──
{ const r = runRunner('25n11', { pre: [PRE.ee_frozen] }); rec('25n11 EE.on 쓰기 불가(동결 대용) → 첫 대입 실패 · 복원 쓰기 없음 · inactive_clean · 원본 실행 허용', r.state === 'inactive_clean' && /install_failed:on|exception_at_stage_2/.test(r.reason) && ranOriginal(r), { state: r.state, reason: r.reason, code: r.code }); }
{ const r = runRunner('K1p', { pre: [PRE.ee_on_accessor] }); rec('K1′ 1단계 실패(on 접근자) → orig_invalid:on · attempted 0 · inactive_clean · 원본 실행', r.state === 'inactive_clean' && r.reason === 'orig_invalid:on' && ranOriginal(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('T4f', { pre: [PRE.ee_emit_accessor] }); rec('T4 읽기 API 접근자(emit) → read_api_not_data · inactive_clean · 원본 실행', r.state === 'inactive_clean' && r.reason === 'read_api_not_data' && ranOriginal(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n10a', { pre: [PRE.gopd_throw_once] }); rec('25n10a 5번째 설치 확인 예외 1회 → 5번째까지 복원 · K2·K3 참 · inactive_clean · 원본 실행', r.state === 'inactive_clean' && ranOriginal(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n10b', { pre: [PRE.gopd_throw_always] }); rec('25n10b 확인 예외 지속 → provenClean 거짓 · inactive_residual · 거부', r.state === 'inactive_residual' && refused(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n12', { pre: [PRE.restore_blocked] }); rec('25n12 복원 대입 실패로 래퍼 잔존 → inactive_residual · 거부(25n6)', r.state === 'inactive_residual' && refused(r), { state: r.state, reason: r.reason }); }
{ const r = runRunner('25n13', { pre: [PRE.alias_broken] }); rec('25n13 복원 뒤 on 이 원본과 다름 → K2 거짓 · inactive_residual · 거부', r.state === 'inactive_residual' && refused(r), { state: r.state, reason: r.reason }); }

// ── 소스 확인 S1~S4: 임시 사본 러너(측정 폴더 전체 복사 후 변이) ──
function copyMeasure(tag, edit) {
  const dst = path.join(WORK, 'copy_' + tag); fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(MDIR, dst, { recursive: true, filter: s => !s.includes(path.sep + 'tests' + path.sep + '_') });
  edit(dst); return path.join(dst, 'measure_runner.js'); }
const editRunner = (from, to) => d => { const p = path.join(d, 'measure_runner.js'); const s = fs.readFileSync(p, 'utf8'); if (s.split(from).length !== 2) throw new Error('runner edit 일치 실패 ' + from); fs.writeFileSync(p, s.replace(from, to)); };
for (const [id, edit, why] of [
  ['25n14a', editRunner("    'core/lineage.js',\n    'script.js'\n];", "    'core/lineage.js',\n    'script.js',\n    'script.js'\n];"), 'sourceFiles differs'],
  ['25n14b', editRunner("    'data.js',\n    'events.js',\n", "    'events.js',\n    'data.js',\n"), 'sourceFiles differs'],
  ['25n15', editRunner("const MEASURE_SHA = Object.freeze(Object.assign({}, ORIGINAL_SHA, { 'script.js': MEASURE_SCRIPT_SHA }));", "const MEASURE_SHA = Object.freeze(Object.assign({}, ORIGINAL_SHA, { 'script.js': MEASURE_SCRIPT_SHA, 'extra.js': MEASURE_SCRIPT_SHA }));"), 'EXPECT_SHA keys differ'],
  ['S4', d => fs.appendFileSync(path.join(d, 'measure_src', 'events.js'), '\n// tampered\n'), 'source sha mismatch: events.js'],
]) {
  let runner; try { runner = copyMeasure(id, edit); } catch (e) { rec(id, false, '사본 준비 실패 ' + e.message); continue; }
  const r = runRunner(id, { runner }); rec(id + ' 소스 확인 위반 → ' + why + ' · vm 생성 전 중단', r.code === 1 && !r.game && !r.vm && r.rep === null && r.stderr.includes(why), { code: r.code, vm: r.vm, err: (r.stderr || '').split('\n').filter(l => l.includes('소스 확인')).join(' ') });
}

// ── 모듈 단위(같은 프로세스): G1 재호출 · 다른 인스턴스 · G4 · C5·C1~C4 고장 · 항등식 ──
// D-1 (나): 단위 하네스도 러너와 같은 방법으로 깨끗한 Node 의 리스너 이름 기준을 만들어 init(ref) 에 넘긴다.
const REF = (() => { const env = { ...process.env }; delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify({ n: process.listeners('newListener').map(f => f.name), r: process.listeners('removeListener').map(f => f.name) }))"], { env, encoding: 'utf8' });
  return JSON.parse(r.stdout); })();
function child(id, code, pre = []) {
  const f = W('unit_' + id + '.js', code); const report = path.join(WORK, 'urep_' + id + '.json'); try { fs.unlinkSync(report); } catch (_) {}
  const r = spawnSync(process.execPath, [].concat(...pre.map(p => ['-r', p]), [f]), { env: { ...process.env, MOD: path.join(MDIR, 'measure_module.js'), REP: report, REF: JSON.stringify(REF) }, encoding: 'utf8', timeout: 120000 });
  let rep = null; try { rep = JSON.parse(fs.readFileSync(report, 'utf8')); } catch (_) {}
  let res = null; try { res = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) {}
  return { code: r.status, rep, res, stderr: r.stderr };
}
{ const r = child('25n17', "const M = require(process.env.MOD); const a = M.init(JSON.parse(process.env.REF)), b = M.init(JSON.parse(process.env.REF)); const EE = require('events').EventEmitter.prototype; console.log(JSON.stringify({ a, b, still: typeof EE.on === 'function' && EE.on.name === '' }));");
  rec('25n17 같은 인스턴스 두 번째 init → reinit_rejected · 첫 호출 active 유지', r.res && r.res.a.state === 'active' && r.res.b.state === 'inactive_unknown' && r.res.b.reason === 'reinit_rejected', r.res); }
{ const r = child('25n18', "const M = require(process.env.MOD); const a = M.init(JSON.parse(process.env.REF)), b = M.init(JSON.parse(process.env.REF)); console.log(JSON.stringify({ a, b }));", [PRE.ee_on_accessor]);
  rec('25n18 첫 호출 1단계 실패(clean) 뒤 두 번째 → reinit_rejected', r.res && r.res.a.state === 'inactive_clean' && r.res.b.reason === 'reinit_rejected', r.res); }
{ const r = child('25n19', "const p = process.env.MOD; const M1 = require(p); const a = M1.init(JSON.parse(process.env.REF)); delete require.cache[require.resolve(p)]; const M2 = require(p); const b = M2.init(JSON.parse(process.env.REF)); console.log(JSON.stringify({ a, b, diff: M1 !== M2 }));");
  rec('25n19 require 캐시 제거 → 두 번째 인스턴스 init → other_instance_likely', r.res && r.res.a.state === 'active' && r.res.diff && r.res.b.state === 'inactive_unknown' && r.res.b.reason === 'other_instance_likely', r.res); }
{ const mut = W('mod_g4.js', fs.readFileSync(path.join(MDIR, 'measure_module.js'), 'utf8').replace('let WATCH_ON = false;', 'let WATCH_ON = true;'));
  const r = child('G4', `const M = require(${JSON.stringify(mut)}); console.log(JSON.stringify(M.init(JSON.parse(process.env.REF))));`);
  rec('G4 WATCH_ON 초기값 변이(합성 사본) → watch_on_unexpected · 설치 없음', r.res && r.res.state === 'inactive_unknown' && r.res.reason === 'watch_on_unexpected', r.res); }
{ const mut = W('mod_g0.js', fs.readFileSync(path.join(MDIR, 'measure_module.js'), 'utf8').replace('        RD_apply = Reflect.apply;', '        RD_apply = null;'));
  const r = child('G0', `const M = require(${JSON.stringify(mut)}); console.log(JSON.stringify(M.init(JSON.parse(process.env.REF))));`);
  rec('G0 참조 확보 실패(합성 사본) → inactive_unknown(ref_capture_failed)', r.res && r.res.state === 'inactive_unknown' && r.res.reason === 'ref_capture_failed', r.res); }
const HARN = (tamper, after = '') => `const M = require(process.env.MOD); const st = M.init(JSON.parse(process.env.REF)); const EE = require('events').EventEmitter.prototype;
  let body = c => { c.outcome = 'F'; }; const end = M.wrapEndLife(c => body(c)); end(); end();
  ${tamper}
  M.finishMeasurement(process.env.REP); ${after} console.log(JSON.stringify(st));`;
for (const [id, tamper, after, want] of [
  ['C0', '', '', 'valid'],
  ['C5a', "process.on('newListener', function hook() {});", '', 'invalid:hook_present'],
  ['C5b', "Object.defineProperty(process, 'emit', { value: process.emit, writable: true, configurable: true });", '', 'invalid:shadowed_method'],
  ['C5c', "EE.once = function () {};", '', 'invalid:watch_tampered'],
  ['C5f', "{ const e = EE.emit; EE.emit = function () { return e.apply(this, arguments); }; }", '', 'invalid:read_api_tampered'],
  ['C3', '', "process.on('exit', function late() {});", 'invalid:post_seal_mutation'],
  ['C2p', '', "process.listeners('exit'); process.listenerCount('exit');", 'valid'],   // 읽기만: 판정 불변(양성 대조)
  ['C2', '', "globalThis.__origOn.call(process, 'exit', function bypass() {});", 'invalid:exit_listeners'],   // 감시 래퍼를 우회한 등록(사전 적재로 원본 확보): C3 은 못 보고 C2 가 잡는다
  ['ID-A', "body = c => { throw new Error('game'); }; try { end(); } catch (e) {}", '', 'valid'],
  ['ID-U', "body = c => {}; end();", '', 'invalid:unmarked_return'],
  ['ID-E', "body = c => { c.outcome = 'F'; throw new Error('after F'); }; try { end(); } catch (e) {}", '', 'valid'],
]) {
  const r = child('h_' + id, HARN(tamper, after), id === 'C2' ? [PRE.orig_on_capture] : []);
  const ok = r.res && r.res.state === 'active' && r.rep && r.rep.verdict === want;
  rec(id + ' 고장 → 보고 판정 ' + want, ok, { verdict: r.rep && r.rep.verdict, counters: r.rep && r.rep.counters && [r.rep.counters.C, r.rep.counters.F, r.rep.counters.A, r.rep.counters.Acode, r.rep.counters.E], err: r.stderr && r.stderr.slice(0, 200) });
}
// ── R1(1차 QA 2026-11-27): init 이전에 선점된 newListener·removeListener 리스너 — 현재 C5a 의 검증 범위 확인 ──
// LIMIT 줄은 보안 통과가 아니라 "현재 구현이 이 경우를 검출하지 못한다"는 관측 기록이다. 관측이 기대(미검출)와 다르면 FAIL 로 센다. PASS 집계에 넣지 않는다.
const lim = []; const limRec = (id, matches, d) => { if (!matches) { failed++; out.push('FAIL ' + id + ' — 관측이 기록한 한계와 다름 ' + JSON.stringify(d)); } else lim.push('LIMIT ' + id + ' — ' + JSON.stringify(d)); };
const clean = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify({ n: process.listenerCount('newListener'), r: process.listenerCount('removeListener'), names: process.listeners('newListener').map(f => f.name) }))"], { encoding: 'utf8' });
const cleanCounts = JSON.parse(clean.stdout.trim());
const PRE_HOOK = {
  newL: W('pre_hook_new.js', "process.on('newListener', function preHook() {});\n"),
  rmL: W('pre_hook_rm.js', "process.on('removeListener', function preHookRm() {});\n"),
};
const HARN_PRE = `const M = require(process.env.MOD); const st = M.init(JSON.parse(process.env.REF)); const end = M.wrapEndLife(c => { c.outcome = 'F'; }); end();
  const counts = { n: process.listenerCount('newListener'), r: process.listenerCount('removeListener') }; M.finishMeasurement(process.env.REP); console.log(JSON.stringify({ st, counts }));`;
// r2(D-1 (나) 구현 뒤): init 이전 선점은 깨끗한 Node 기준과 이름 목록이 달라져 init 이 inactive_unknown(hook_baseline_mismatch) 을 낸다. 설치 0.
for (const [id, pre] of [['C5a-pre-newListener', PRE_HOOK.newL], ['C5a-pre-removeListener', PRE_HOOK.rmL]]) {
  const r = child('pre_' + id, HARN_PRE, [pre]);
  rec(id + ': init 이전 외부 리스너 선점 → init 이 hook_baseline_mismatch(inactive_unknown) · 설치 없음', r.res && r.res.st.state === 'inactive_unknown' && r.res.st.reason === 'hook_baseline_mismatch' && r.rep === null,
    { st: r.res && r.res.st, countsAtFinish: r.res && r.res.counts, ref: REF });
}
{ const r = runRunner('pre_runner', { pre: [PRE_HOOK.newL] });
  rec('C5a-pre-runner: -r 사전 적재 선점 → hook_baseline_mismatch · vm 생성 전 거부', r.state === 'inactive_unknown' && r.reason === 'hook_baseline_mismatch' && refused(r), { state: r.state, reason: r.reason, code: r.code }); }
{ const r = runRunner('pre_nodeopts', { env: { NODE_OPTIONS: '--require ' + PRE_HOOK.newL } });   // 러너의 기준 자식 프로세스는 NODE_OPTIONS 를 지운다
  rec('C5a-pre-NODE_OPTIONS: NODE_OPTIONS 사전 적재 선점 → 기준 자식에는 없음 → hook_baseline_mismatch · 거부', r.state === 'inactive_unknown' && r.reason === 'hook_baseline_mismatch' && refused(r), { state: r.state, reason: r.reason, code: r.code }); }
for (const [id, refExpr, why] of [['ref-undefined', 'undefined', '기준 미전달'], ['ref-null', 'null', 'null'], ['ref-short', JSON.stringify({ n: [''], r: REF.r }), '이름 수 다름'], ['ref-name', JSON.stringify({ n: REF.n.map((x, i) => i === 0 ? 'other' : x), r: REF.r }), '이름 다름'], ['ref-shape', JSON.stringify({ n: 'x', r: REF.r }), '형식 다름']]) {
  const r = child('ref_' + id, `const M = require(process.env.MOD); console.log(JSON.stringify(M.init(${refExpr})));`);
  rec('C5a-' + id + ': init 기준 ' + why + ' → hook_baseline_mismatch', r.res && r.res.state === 'inactive_unknown' && r.res.reason === 'hook_baseline_mismatch', r.res);
}
{ let runner; try { runner = copyMeasure('reffail', editRunner("function cleanHookReference() {\n    try {", "function cleanHookReference() {\n    return null;   // 합성: 기준 확보 실패\n    try {")); } catch (e) { rec('C5a-ref-fail 사본', false, e.message); }
  if (runner) { const r = runRunner('reffail', { runner }); rec('C5a-ref-fail: 러너가 깨끗한 기준을 얻지 못함(합성 사본) → hook_reference_failed · 모듈 미적재 · 거부', r.state === 'inactive_unknown' && r.reason === 'hook_reference_failed' && refused(r), { state: r.state, reason: r.reason }); } }
// 남는 한계(D-1 (가) 가정): 같은 개수·같은 이름으로 위장한 선점은 잡지 못한다
// r3(Node 판 검증에서 발견): 내장 리스너 구성이 판마다 다르다(v20·v22·v24 = ['', 'startListeningIfSignal'], v26 = ['startListeningIfSignal']).
//   위장은 바꿔치기하는 원래 리스너의 이름을 그대로 복사해야 판과 무관하게 "같은 개수·같은 이름"이 된다(원래 사본은 익명 대리 함수라 v26 에서 이름이 달라졌음).
const PRE_DISGUISE = W('pre_hook_disguise.js', "{ const ls = process.listeners('newListener'); const first = ls[0]; process.removeListener('newListener', first); const proxy = function () { return first.apply(this, arguments); }; Object.defineProperty(proxy, 'name', { value: first.name }); process.prependListener('newListener', proxy); }\n");
{ const r = child('lim_disguise', HARN_PRE, [PRE_DISGUISE]);
  limRec('C5a-disguise: 내장 리스너(첫 번째)를 같은 이름의 대리 함수로 바꿔치기 → 개수·이름 같음 → 미검출(보고 valid)', r.res && r.res.st.state === 'active' && r.rep && r.rep.verdict === 'valid', { st: r.res && r.res.st, verdict: r.rep && r.rep.verdict }); }
{ const r = child('lim_post', HARN_PRE.replace('const end =', "process.on('newListener', function postHook() {}); const end ="));   // 대조: init 뒤 추가는 검출
  rec('C5a-post 대조: init 이후 추가된 리스너는 검출(invalid:hook_present)', r.rep && r.rep.verdict === 'invalid:hook_present', { verdict: r.rep && r.rep.verdict }); }
// 설계 원안(개수 0) 재현: 합성 사본에서 C5a 를 "두 이벤트 리스너 수 0" 으로 되돌렸을 때의 판정
{ const src = fs.readFileSync(path.join(MDIR, 'measure_module.js'), 'utf8');
  const from = "    const hookFree = sameFns(RD_apply(RD_listeners, PROC, ['newListener']), HOOK_NEW0) && sameFns(RD_apply(RD_listeners, PROC, ['removeListener']), HOOK_RM0);";
  if (src.split(from).length !== 2) rec('C5a-design0 사본 준비', false, '치환 대상 1곳 아님');
  else { const mod0 = W('mod_design0.js', src.replace(from, "    const hookFree = RD_apply(RD_listeners, PROC, ['newListener']).length === 0 && RD_apply(RD_listeners, PROC, ['removeListener']).length === 0;   // 설계 원안(합성 사본)"));
    const a = child('lim_design0_clean', HARN_PRE.replace('process.env.MOD', JSON.stringify(mod0)));
    const b = child('lim_design0_pre', HARN_PRE.replace('process.env.MOD', JSON.stringify(mod0)), [PRE_HOOK.newL]);
    // r2: 선점이 있는 경우는 이제 D-1 (나) 대조가 init 에서 먼저 거부한다(보고 없음). 원안 관측은 깨끗한 경우의 판정만 기록한다.
    limRec('C5a-design0: 설계 원안(개수 0)은 외부 선점이 없어도 Node 내장 리스너 때문에 항상 invalid:hook_present(측정 불가). 선점이 있으면 (나) 대조가 init 에서 먼저 거부', a.rep && a.rep.verdict === 'invalid:hook_present' && b.res && b.res.st.reason === 'hook_baseline_mismatch' && b.rep === null, { clean: a.rep && a.rep.verdict, withPreHook: b.res && b.res.st }); } }
console.log(out.join('\n'));
if (lim.length) console.log(lim.join('\n'));
console.log(`RESULT: ${failed ? 'FAIL' : 'PASS'} ${out.length - failed}/${out.length} (meas_fault_test, work=${WORK}) · LIMIT ${lim.length}건(미검출 관측, PASS 집계 제외)`);
process.exitCode = failed ? 1 : 0;
