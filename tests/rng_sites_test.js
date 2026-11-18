// F1D4A P1 — 하네스 계측 단위 시험. 게임 코드 변경 없음(원본은 읽기만, 변이는 임시 사본에서만).
// 설계: F1D4A r3.20 00_INDEX §4.1.1 · §4.1.3 · §4.1.5(VM-1~VM-12), §E-1.3(순서 보장 반영), §4.1.4(공통 드라이버)
// 사용: node tests/rng_sites_test.js    (러너를 SIM_RUNS 작은 값으로 몇 번 실행한다. 약 1분)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { spawnSync } = require('child_process');
const R = require('./lib/rng_sites.js');
const { createCommitQueue, showEventDisposition } = require('./lib/commit_queue.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) pass++; else fail++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail && !cond ? '  | ' + detail : '')); };
const sorted = v => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, k) => { o[k] = sorted(v[k]); return o; }, {}) : (Array.isArray(v) ? v.map(sorted) : v);
const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));   // 객체 키 순서와 무관하게 비교

// ── 준비: 러너가 실제로 실행하는 조립 문자열과 기록 결과 ─────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rngsites-'));
const siteOut = path.join(tmp, 'sites.json');
const run = spawnSync('node', [path.join(ROOT, 'test_runner.js')], { env: Object.assign({}, process.env, { SIM_RUNS: '120', SIM_RNG_SITES: siteOut, SIM_RNG_ASSEMBLY: '1', SIM_HARNESS_JSON: path.join(tmp, 'h.json') }), encoding: 'utf8', maxBuffer: 1 << 26 });
check('준비: 러너 실행(SIM_RUNS=120, 지점 기록 켬) 종료 코드 0', run.status === 0, (run.stderr || '').slice(0, 300));
const J = JSON.parse(fs.readFileSync(siteOut, 'utf8'));
const ASM_TEXT = fs.readFileSync(siteOut + '.assembly.txt', 'utf8');
const SOURCE_FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
const texts = SOURCE_FILES.map(read);
const joined = texts.join('\n;\n');
const harnessText = ASM_TEXT.slice(joined.length + 1);
check('준비: 조립 문자열 = 소스 9개를 "\\n;\\n" 로 이은 것 + "\\n" + 하네스', ASM_TEXT.startsWith(joined + '\n') && harnessText.length > 0);
const asm = R.buildAssembly(R.buildNodeVmParts(SOURCE_FILES, texts, '\n;\n', '\n', harnessText, 'harness'));
check('준비: 독립적으로 다시 만든 조립 문자열이 실행된 것과 같음', asm.text === ASM_TEXT);
// 조립 문자열 기준 (line, col) — 시험 입력을 만드는 독립 계산(라이브러리의 역변환을 쓰지 않는다)
const asmStarts = R.lineStarts(ASM_TEXT);
const vmPosOf = offset => R.posOfOffset(asmStarts, offset);
const fileOffset = SOURCE_FILES.map((f, i) => texts.slice(0, i).reduce((n, t) => n + t.length + 3, 0));
const origStarts = texts.map(R.lineStarts);
const offsetInFile = (i, line, col) => origStarts[i][line - 1] + (col - 1);

// ── VM-7 · VM-12: 조각 표 ────────────────────────────────────────────────────────────────
const rows = asm.rows, kinds = k => rows.filter(r => r.kind === k);
check('VM-7 조각 수 = source 9 + separator 8 + harness-boundary 1 + harness 1 = 19', rows.length === 19 && kinds('source').length === 9 && kinds('separator').length === 8 && kinds('harness-boundary').length === 1 && kinds('harness').length === 1);
check('VM-7 러너가 기록한 조각 표도 19개이고 같은 오프셋', J.rows.length === 19 && J.rows.every((r, i) => r.kind === rows[i].kind && r.startOffset === rows[i].startOffset && r.endOffsetExclusive === rows[i].endOffsetExclusive));
check('VM-12 연속 규칙(첫 시작 0, 인접 끝 = 다음 시작, 마지막 끝 = 전체 길이)', R.checkRows(rows, ASM_TEXT.length).length === 0);
check('VM-12 조각 길이: source = 원본 파일 길이, separator = 3, harness-boundary = 1, harness = 하네스 길이',
    kinds('source').every((r, i) => r.endOffsetExclusive - r.startOffset === texts[i].length) && kinds('separator').every(r => r.endOffsetExclusive - r.startOffset === 3) && kinds('harness-boundary')[0].endOffsetExclusive - kinds('harness-boundary')[0].startOffset === 1 && kinds('harness')[0].endOffsetExclusive - kinds('harness')[0].startOffset === harnessText.length);
check('VM-12 변이: 조각 하나를 뺀 표는 연속 규칙 위반으로 잡힘', R.checkRows(rows.filter((r, i) => i !== 3), ASM_TEXT.length).length > 0);
check('VM-7 변이: 파일이 하나 빠지면 조각 수가 19 가 아님', R.buildAssembly(R.buildNodeVmParts(SOURCE_FILES.slice(1), texts.slice(1), '\n;\n', '\n', harnessText)).rows.length === 17);
check('줄바꿈 문자 재계수: 소스 9개와 하네스에 CR·U+2028·U+2029·BOM·보충 평면 문자 0, 소스는 LF 로 끝남', Object.entries(J.specialChars).every(([k, v]) => v.cr === 0 && v.u2028 === 0 && v.u2029 === 0 && v.bom === 0 && v.astral === 0 && (k === 'integrationScript' || v.endsWithLf)), JSON.stringify(J.specialChars));

// ── VM-1 · VM-2 · VM-3 · VM-4: 역변환 ───────────────────────────────────────────────────
{
    let ok1 = true, ok2 = true, ok3 = true; const bad = [];
    SOURCE_FILES.forEach((f, i) => {
        const lastLine = origStarts[i].length - (texts[i].endsWith('\n') ? 1 : 0);   // 내용이 있는 마지막 줄
        for (const line of [1, lastLine]) {
            const p = vmPosOf(fileOffset[i] + offsetInFile(i, line, 1));
            const m = R.mapPosition(asm, p.line, p.col);
            if (!(m.area === 'source' && m.file === f && m.line === line && m.col === 1)) { ok1 = false; bad.push(f + ':' + line + '→' + JSON.stringify(m)); }
        }
        if (i < SOURCE_FILES.length - 1) {
            const sepStart = fileOffset[i] + texts[i].length;   // '\n;\n' 의 첫 글자
            const semi = vmPosOf(sepStart + 1);                  // ';'
            const ms = R.mapPosition(asm, semi.line, semi.col);
            if (!(ms.area === 'unknown' && ms.reason === 'separator')) ok2 = false;
            const lastP = vmPosOf(sepStart - 1), next = vmPosOf(sepStart + 3);
            const mn = R.mapPosition(asm, next.line, next.col);
            // 앞 파일은 LF 로 끝나므로: 앞 파일 마지막 줄바꿈 뒤의 VM 줄(빈 줄)과 ';' 줄은 구분자, 그다음 줄이 뒤 파일 1행
            if (!(semi.line === lastP.line + 2 && next.line === semi.line + 1 && mn.area === 'source' && mn.file === SOURCE_FILES[i + 1] && mn.line === 1 && mn.col === 1)) { ok3 = false; bad.push('경계 ' + f); }
        }
    });
    check('VM-1 9개 파일의 첫 줄·마지막 줄이 올바른 (파일, 줄)로 변환', ok1, bad.join(' ; '));
    check('VM-2 구분자 위치(";" 줄) 8곳이 separator 로 판정되어 UNKNOWN', ok2);
    check('VM-3 파일 경계: 앞 파일 마지막 줄 → 구분자 → 뒤 파일 1행 1열', ok3, bad.join(' ; '));
    const hb = vmPosOf(joined.length);   // 마지막 '\n' 1개
    check('VM-3 소스와 하네스 사이의 "\\n" 은 harness-boundary 로 UNKNOWN', R.mapPosition(asm, hb.line, hb.col).reason === 'harness-boundary');
    const hAt = harnessText.indexOf('function driverChoose(');
    const hp = vmPosOf(joined.length + 1 + hAt), hm = R.mapPosition(asm, hp.line, hp.col);
    const hExp = R.posOfOffset(R.lineStarts(harnessText), hAt);
    check('VM-4 하네스 영역 위치는 harness 로 판정되고 원본 파일 위치로 바뀌지 않음(하네스 안 상대 줄·열)', hm.area === 'harness' && hm.file === 'harness' && hm.line === hExp.line && hm.col === hExp.col, JSON.stringify(hm));
}
// ── VM-5: 형식 오류·범위 밖 ──────────────────────────────────────────────────────────────
check('VM-5 줄 0·음수·소수·NaN, 열 0, 범위 밖 줄, 줄 끝을 넘는 열 → UNKNOWN',
    [[0, 1], [-3, 1], [1.5, 1], [NaN, 1], [1, 0], [asmStarts.length + 5, 1], [1, 100000]].every(([l, c]) => R.mapPosition(asm, l, c).area === 'unknown'));
check('VM-5 스택 줄 형식이 다르면 파싱 실패(null)', R.parseFrameLine('    at foo (bar)') === null && R.parseFrameLine('garbage') === null && R.parseFrameLine('    at f (a.js:12:x)') === null);
check('VM-5 정상 형식 파싱(이름 있음 / 없음)', eq(R.parseFrameLine('    at nextYear (danmachi-integration-test.js:10:5)'), { fn: 'nextYear', file: 'danmachi-integration-test.js', line: 10, col: 5 }) && eq(R.parseFrameLine('    at file:///x/script.js:912:38'), { fn: null, file: 'file:///x/script.js', line: 912, col: 38 }));

// ── 지점 표(§4.1.1)와 정적 검색 대조 ─────────────────────────────────────────────────────
const sites = R.buildSiteTable(SOURCE_FILES.map((file, i) => ({ area: 'source', file, text: texts[i] })).concat([{ area: 'harness', file: 'harness', text: harnessText }]));
const src = sites.filter(s => s.area === 'source');
// F1D4A P2: script.js 에 엔진 코드(match 키·choiceMatch·visibleChoices·⑫ 재검사·moveLocation 등)가 들어가 줄 번호만 이동했다(분류·개수 불변).
//   F1 줄 → P2 줄: 122→123, 696→720, 787→825, 876→914, 912→960, 935→986 / 호출 327→350, 753~755→789~791, 789→827, 885→923
const EXPECT_DIRECT = { 'script.js': { 6: '(wrapper)', 123: '(shared)', 720: 'R4', 825: 'R4', 914: 'R5', 960: 'R2', 986: 'R3' }, 'core/growth.js': { 102: 'R4' },
    'core/relations.js': { 89: '(shared)', 113: 'R4', 150: 'R4', 153: 'R4', 174: 'R4', 186: 'R4', 187: 'R4', 196: 'R4', 207: 'R4', 253: 'R4', 257: 'R4', 271: 'R4' } };
const EXPECT_CALL = { 'script.js': { 350: 'R4', 720: 'R4', 789: 'R4', 790: 'R4', 791: 'R4', 827: 'R4', 923: 'R1' }, 'core/relations.js': { 115: 'R4', 154: 'R4', 194: 'R4' } };
const asTable = kind => { const o = {}; for (const s of src.filter(x => x.kind === kind)) { (o[s.file] = o[s.file] || {})[s.line] = s.cls; } return o; };
check('지점 표: Math.random 표현 20곳의 (파일, 줄, 분류)가 설계 §4.1.1 표와 같음', eq(asTable('direct'), EXPECT_DIRECT), JSON.stringify(asTable('direct')));
check('지점 표: 공유·래퍼 함수 호출 10곳의 (파일, 줄, 분류)가 설계 표와 같음(R1 은 nextYear 923 한 곳 — F1 885)', eq(asTable('call'), EXPECT_CALL), JSON.stringify(asTable('call')));
{   // 독립 정적 검색: 주석을 뺀 줄에서 Math.random 을 센다
    let n = 0; texts.forEach(t => t.split('\n').forEach(l => { const code = l.replace(/\/\/.*$/, ''); n += (code.match(/Math\.random/g) || []).length; }));
    check('지점 표: 항목 수 = 독립 정적 검색 결과 수(Math.random 20)', n === 20 && src.filter(s => s.kind === 'direct').length === 20, 'grep=' + n);
}
check('지점 표: 분류되지 않은 지점(UNKNOWN) 0, 지점 id 중복 0', sites.every(s => s.cls !== 'UNKNOWN') && new Set(sites.map(s => s.id)).size === sites.length);
const hs = sites.filter(s => s.area === 'harness');
check('지점 표: 하네스 영역의 Math.random 호출 지점은 driverChoose 한 곳(HARNESS)', hs.length === 1 && hs[0].fn === 'driverChoose' && hs[0].cls === 'HARNESS', JSON.stringify(hs.map(s => s.id + ':' + s.cls)));
check('지점 표: 러너가 기록한 표와 같음', eq(J.sites.map(s => [s.id, s.file, s.line, s.col, s.cls]), sites.map(s => [s.id, s.file, s.line, s.col, s.cls])));
check('지점 표: lineage.js · recruit.js 의 주석 속 "Math.random" 은 지점이 아님', sites.every(s => s.file !== 'core/lineage.js' && s.file !== 'core/recruit.js'));

// ── 호출식만 지점(대입·참조·주석·문자열 제외) ───────────────────────────────────────────────
{
    const fnSrc = (name, body) => 'function ' + name + '() {\n    ' + body + '\n}';
    const code = [
        fnSrc('a', 'return Math.random();'),                          // 호출 → 지점
        fnSrc('b', 'Math.random = function () { return 0; };'),       // 대입 → 아님
        fnSrc('c', 'return Math.random === x;'),                      // 참조 비교 → 아님
        fnSrc('d', 'const f = Math.random; return f;'),               // 참조 → 아님
        fnSrc('e', 'return Math.random  ();'),                        // 공백 뒤 호출 → 지점
        fnSrc('g', 'return "Math.random()"; // Math.random()'),       // 문자열·줄 주석 → 아님
        fnSrc('h', '/* Math.random() */ return `Math.random()`;'),    // 블록 주석·템플릿 본문 → 아님
        fnSrc('k', 'return obj.Math.random();'),                      // 다른 객체의 속성 → 아님
        fnSrc('m', 'return Math.randomize();')                        // 다른 이름 → 아님
    ].join('\n') + '\n';
    const rules = { shared: {}, wrapper: {}, groups: { 'x.js': { a: { random: { cls: 'R4', count: 1 } }, e: { random: { cls: 'R4', count: 1 } } } }, harness: {} };
    const st = R.buildSiteTable([{ area: 'source', file: 'x.js', text: code }], rules);
    check('지점 표: 호출식(뒤에 "(" — 공백 허용)만 지점. 대입·참조·비교·문자열·주석·템플릿 본문·다른 객체 속성·다른 이름은 제외', st.length === 2 && st[0].fn === 'a' && st[1].fn === 'e' && st.every(s => s.cls === 'R4'), JSON.stringify(st.map(s => s.id)));
    const pageHarness = ['tests/lib/rng_core.js', 'tests/lib/rng_sites.js', 'tests/lib/commit_queue.js', 'tests/lib/driver_core.js', 'tests/lib/page_driver.js'].map(read).join('\n');
    const ph = R.buildSiteTable([{ area: 'harness', file: 'harness', text: pageHarness }]);
    check('지점 표: Chromium 주입 하네스의 호출 지점도 driverChoose 한 곳(페이지 어댑터의 Math.random 대입·비교 참조는 지점이 아님)', ph.length === 1 && ph[0].id === 'harness:driverChoose:random#1' && ph[0].cls === 'HARNESS' && /Math\.random = recordedRandom/.test(pageHarness), JSON.stringify(ph.map(s => s.id)));
    check('지점 표: Node 와 Chromium 의 지점 수가 같음(게임 30 + 하네스 1 = 31)', sites.length === 31 && src.length + ph.length === 31);
}
// ── 명시적 허용 목록(와일드카드 없음)과 판정 불가 구조 ───────────────────────────────────────
{
    const tbl = name => R.buildSiteTable([{ area: 'source', file: name, text: read(name) }]);
    const withText = (name, text) => R.buildSiteTable([{ area: 'source', file: name, text }]);
    const rel = read('core/relations.js'), gro = read('core/growth.js'), scr = read('script.js');
    check('허용 목록: 규칙에 와일드카드("*")가 없음', JSON.stringify(R.RULES).indexOf('"*"') < 0);
    const relPlus = rel.replace('    function createChild(S, ctx) {', '    function createChild(S, ctx) {\n        if (Math.random() < 2) { /* 새 호출 */ }');
    const a = withText('core/relations.js', relPlus).filter(s => s.fn === 'createChild');
    check('허용 목록: 기존 함수에 Math.random() 호출이 하나 늘면 그 묶음 전체가 UNKNOWN(자동 R4 아님)', relPlus !== rel && a.length === 2 && a.every(s => s.cls === 'UNKNOWN' && s.unknownReason === 'count-mismatch'), JSON.stringify(a.map(s => s.cls)));
    const groPlus = gro.replace('    function getAbilityTotal(S) {', '    function getAbilityTotal(S) {\n        const z = Math.random();');
    const b = withText('core/growth.js', groPlus).filter(s => s.fn === 'getAbilityTotal');
    check('허용 목록: 기존 파일의 목록에 없는 함수에 생긴 호출은 UNKNOWN', groPlus !== gro && b.length === 1 && b[0].cls === 'UNKNOWN' && b[0].unknownReason === 'not-in-allowlist');
    const relCall = rel.replace('    function createChild(S, ctx) {', '    function createChild(S, ctx) {\n        weightedPick([[0, 1]]);');
    const c = withText('core/relations.js', relCall).filter(s => s.fn === 'createChild' && s.kind === 'call');
    check('허용 목록: 목록에 없는 호출자의 weightedPick 호출은 UNKNOWN(자동 R4 아님)', relCall !== rel && c.length === 1 && c[0].cls === 'UNKNOWN');
    const scrPlus = scr.replace('function chooseBody(ch) {', 'function chooseBody(ch) {\n    getRandomItemByWeight([]);');
    const d = withText('script.js', scrPlus).filter(s => s.fn === 'chooseBody' && s.kind === 'call');
    check('허용 목록: 목록에 없는 호출자의 getRandomItemByWeight 호출은 UNKNOWN', scrPlus !== scr && d.length === 1 && d[0].cls === 'UNKNOWN');
    const odd = ['const v = Math.random();', 'class K {', '    m() {', '        return Math.random();', '    }', '}', 'const obj = {', '    f: function () {', '        return Math.random();', '    }', '};', 'const multi =', '    () => Math.random();'].join('\n') + '\n';
    const o = withText('script.js', odd);
    check('판정 불가 구조(최상위 문장·클래스 메서드·객체 속성 함수·여러 줄 화살표 함수)는 둘러싼 함수 null → UNKNOWN(추정하지 않음)', o.length === 4 && o.every(s => s.fn === null && s.cls === 'UNKNOWN' && s.unknownReason === 'no-enclosing-function'), JSON.stringify(o.map(s => [s.fn, s.cls])));
    const cl = R.makeClassifier({ sites: withText('core/relations.js', relPlus), dropFrames: 1, locate: fr => ({ area: 'source', file: fr.file, line: fr.line, col: fr.col }) });
    const u = withText('core/relations.js', relPlus).find(s => s.fn === 'createChild');
    check('분류기: UNKNOWN 지점에서 난 호출은 UNKNOWN 으로 집계', cl('Error\n    at rec (x:1:1)\n    at createChild (core/relations.js:' + u.line + ':' + u.stackCol + ')').cls === 'UNKNOWN');
    const oneLine = withText('script.js', 'function chooseBody(ch) { return Math.random(); }\n');
    check('판정 불가 구조: 한 줄짜리 함수도 둘러싼 함수를 정하지 못해 UNKNOWN(휴리스틱의 한계를 추정으로 메우지 않음)', oneLine.length === 1 && oneLine[0].fn === null && oneLine[0].cls === 'UNKNOWN');
    void tbl;
}
// ── 세 환경 비교의 합격 판정(tests/lib/compare_verdict.js) ───────────────────────────────────
{
    const { envFailures, pairSame } = require('./lib/compare_verdict.js');
    const node = () => ({ lives: 3000, lifeDigest: 1715334118, rngCallDigest: 3460114558, seqDigest: 2717645230, rngCallsTotal: 1611555, siteCalls: 1611555, unknownLives: 0, unknownUnit: 0, byId: { a: 1611000, b: 555 }, byCls: { R4: 1611000, R1: 555 }, unitCalls: 12, unitByCls: { R4: 10, R2: 2 },
        integrity: { broken: false, issued: 10, committed: 9, discarded: 1 }, extra: { exit: 0, spawnError: null } });
    const page = () => Object.assign(node(), { extra: { error: null, pageErrors: [], pageSha: { same: true }, mathRandomIsRecorder: true, preConfigCalls: 0, progressHalted: false } });
    const mutN = f => { const r = node(); f(r); return envFailures('node', r, 3000); };
    const mutP = f => { const r = page(); f(r); return envFailures('file', r, 3000); };
    check('비교 판정: 정상 결과는 실패 사유 0(Node · Chromium)', envFailures('node', node(), 3000).length === 0 && envFailures('file', page(), 3000).length === 0 && envFailures('inline', page(), 3000).length === 0);
    check('비교 판정 변이: Node 종료 코드 ≠ 0 → 실패', mutN(r => { r.extra.exit = 1; }).some(x => x.startsWith('exit:')));
    check('비교 판정 변이: Node 종료 상태 null(신호 종료)·spawn 오류 → 실패', mutN(r => { r.extra.exit = null; }).indexOf('exit-missing') >= 0 && mutN(r => { r.extra.spawnError = 'ENOENT'; }).some(x => x.startsWith('spawn-error')));
    check('비교 판정 변이: integrity 누락 → 실패(Node · Chromium)', mutN(r => { r.integrity = null; }).indexOf('integrity-missing') >= 0 && mutP(r => { delete r.integrity; }).indexOf('integrity-missing') >= 0);
    check('비교 판정 변이: integrity.broken = true → 실패', mutN(r => { r.integrity.broken = true; }).indexOf('integrity-broken') >= 0 && mutP(r => { r.integrity.broken = true; }).indexOf('integrity-broken') >= 0);
    check('비교 판정 변이: issued ≠ committed + discarded → 실패', mutN(r => { r.integrity.committed = 8; }).some(x => x.startsWith('integrity-count')) && mutP(r => { r.integrity.issued = 0; r.integrity.committed = 0; r.integrity.discarded = 0; }).some(x => x.startsWith('integrity-count')));
    check('비교 판정 변이: Chromium pageErrors 존재·누락 → 실패', mutP(r => { r.extra.pageErrors = ['boom']; }).some(x => x.startsWith('page-errors')) && mutP(r => { delete r.extra.pageErrors; }).indexOf('pageErrors-missing') >= 0);
    check('비교 판정 변이: lifeDigest · rngCallDigest 가 숫자가 아님(NaN · null · 문자열) → 실패', mutN(r => { r.lifeDigest = NaN; }).some(x => x.startsWith('lifeDigest-invalid')) && mutN(r => { r.rngCallDigest = null; }).some(x => x.startsWith('rngCallDigest-invalid')) && mutP(r => { r.lifeDigest = '1715334118'; }).some(x => x.startsWith('lifeDigest-invalid')));
    check('비교 판정 변이: 생애 수 부족·NaN → 실패', mutN(r => { r.lives = 2999; }).some(x => x.startsWith('lives:')) && mutP(r => { r.lives = NaN; }).some(x => x.startsWith('lives:')));
    check('비교 판정 변이: UNKNOWN > 0, 지점 기록 수 ≠ RNG 호출 수, 페이지 소스 해시 불일치, 실행 오류 → 실패', mutN(r => { r.byCls = { R4: 1611000, R1: 554, UNKNOWN: 1 }; r.unknownLives = 1; }).some(x => x.startsWith('unknown-lives')) && mutN(r => { r.siteCalls -= 1; }).length > 0 && mutP(r => { r.extra.pageSha.same = false; }).length > 0 && mutP(r => { r.extra.error = 'x'; }).length > 0 && mutN(r => { r.unknownUnit = 2; }).length > 0 && mutN(r => { r.siteCalls -= 1; }).some(x => x.startsWith('byCls-sum') || x.startsWith('byId-sum') || x.startsWith('siteCalls')));
    const mutI = f => { const r = page(); f(r); return envFailures('inline', r, 3000); };
    check('비교 판정 변이: 생애 밖 구간 UNKNOWN(unknownUnit) > 0 → Node · file · inline 모두 실패', [mutN, mutP, mutI].every(m => m(r => { r.unitByCls = { R4: 10, R2: 1, UNKNOWN: 1 }; r.unknownUnit = 1; }).some(x => x.startsWith('unknown-unit'))));
    check('비교 판정 변이: unknownUnit · unknownLives 가 없거나 숫자가 아님 → 세 환경 모두 실패', [mutN, mutP, mutI].every(m => m(r => { delete r.unknownUnit; }).length > 0 && m(r => { r.unknownLives = null; }).length > 0 && m(r => { r.unknownUnit = '0'; }).length > 0));
    check('비교 판정 변이: integrity 계수 음수(issued = committed + discarded 는 성립) → 실패', [mutN, mutP].every(m => m(r => { r.integrity = { broken: false, issued: 10, committed: 11, discarded: -1 }; }).some(x => x.startsWith('integrity-count')) && m(r => { r.integrity = { broken: false, issued: 10, committed: -5, discarded: 15 }; }).some(x => x.startsWith('integrity-count'))));
    check('비교 판정 변이: integrity 계수가 소수·문자열·누락 → 실패', mutN(r => { r.integrity.discarded = 1.5; r.integrity.committed = 8.5; }).some(x => x.startsWith('integrity-count')) && mutP(r => { r.integrity.issued = '10'; }).some(x => x.startsWith('integrity-count')) && mutN(r => { delete r.integrity.discarded; }).some(x => x.startsWith('integrity-count')));
    check('비교 판정 변이: byId 값이 문자열 · null · 음수 · 0 · 소수 → 실패', [v => '5', v => null, v => -3, v => 0, v => 1.5].every(g => mutN(r => { r.byId = { a: g() }; }).indexOf('byId-value-invalid') >= 0 && mutP(r => { r.byId = { a: 5, b: g() }; }).indexOf('byId-value-invalid') >= 0));
    check('비교 판정 변이: byId 합계 ≠ siteCalls → 실패(Node · Chromium), 배열·빈 객체도 실패', mutN(r => { r.byId = { a: 1611554 }; }).some(x => x.startsWith('byId-sum')) && mutP(r => { r.byId = { a: 1611555, b: 1 }; }).some(x => x.startsWith('byId-sum')) && mutN(r => { r.byId = [1611555]; }).indexOf('byId-missing') >= 0 && mutN(r => { r.byId = {}; }).indexOf('byId-missing') >= 0);
    const all3 = [mutN, mutP, mutI];
    check('비교 판정 변이: byCls 누락 · 빈 객체 · 배열 → 세 환경 모두 실패', all3.every(m => m(r => { delete r.byCls; }).indexOf('byCls-missing') >= 0 && m(r => { r.byCls = {}; }).indexOf('byCls-empty') >= 0 && m(r => { r.byCls = [1611555]; }).indexOf('byCls-missing') >= 0 && m(r => { r.byCls = null; }).indexOf('byCls-missing') >= 0));
    check('비교 판정 변이: UNKNOWN = null · NaN · false · 문자열 · 음수(명시된 값의 형식 오류) → 실패(0 으로 바뀌지 않음)', [null, NaN, false, '0', -1, 0.5].every(v => all3.every(m => m(r => { r.byCls = { R4: 1611000, R1: 555, UNKNOWN: v }; }).some(x => x === 'byCls-UNKNOWN-invalid' || x === 'byCls-value-invalid'))));
    check('비교 판정: UNKNOWN 항목이 없으면 0 으로 보고, 명시된 UNKNOWN: 0 도 합격, UNKNOWN: 1 이상은 실패', mutN(r => { r.byCls = { R4: 1611000, R1: 555, UNKNOWN: 0 }; }).length === 0 && mutP(r => { r.byCls = { R4: 1611000, R1: 554, UNKNOWN: 1 }; r.unknownLives = 1; }).some(x => x.startsWith('unknown-lives')));
    check('비교 판정 변이: 분류 카운트가 문자열 · 음수 · 소수 → 실패', ['5', -1, 1.5, null].every(v => all3.every(m => m(r => { r.byCls = { R4: 1611555, R1: v }; }).indexOf('byCls-value-invalid') >= 0)));
    check('비교 판정 변이: 분류 카운트 합계 ≠ siteCalls → 실패', all3.every(m => m(r => { r.byCls = { R4: 1611000, R1: 554 }; }).some(x => x.startsWith('byCls-sum')) && m(r => { r.byCls = { R4: 1611000, R1: 556 }; }).some(x => x.startsWith('byCls-sum'))));
    check('비교 판정 변이: unit 집계 누락 · 배열 · unitCalls 누락/음수 · 호출이 있는데 빈 객체 · 합계 불일치 · UNKNOWN 형식 오류 → 실패', all3.every(m =>
        m(r => { delete r.unitByCls; }).indexOf('unitByCls-missing') >= 0 && m(r => { r.unitByCls = [12]; }).indexOf('unitByCls-missing') >= 0 && m(r => { delete r.unitCalls; }).some(x => x.startsWith('unitCalls-invalid')) && m(r => { r.unitCalls = -1; }).some(x => x.startsWith('unitCalls-invalid')) &&
        m(r => { r.unitByCls = {}; }).length > 0 && m(r => { r.unitByCls = { R4: 10, R2: 1 }; }).some(x => x.startsWith('unitByCls-sum')) && m(r => { r.unitByCls = { R4: 10, R2: 2, UNKNOWN: null }; }).length > 0 && m(r => { r.unitByCls = { R4: 10, R2: 1, UNKNOWN: 1 }; r.unknownUnit = 1; }).some(x => x.startsWith('unknown-unit'))));
    check('비교 판정: 생애 밖 호출이 0 이면 unitByCls 는 빈 객체여도 합격(Chromium 측정의 정상 형태)', mutP(r => { r.unitCalls = 0; r.unitByCls = {}; }).length === 0 && mutI(r => { r.unitCalls = 0; r.unitByCls = {}; }).length === 0);
    check('비교 판정 변이: 요약의 UNKNOWN 수가 집계와 다르면 실패(요약 단계에서 값이 바뀌어도 통과하지 못함)', all3.every(m => m(r => { r.unknownLives = null; }).some(x => x.startsWith('unknownLives-mismatch')) && m(r => { r.unknownUnit = 3; }).some(x => x.startsWith('unknownUnit-mismatch'))));
    check('비교 판정: 결과 없음·미실행·실패 표시·extra 누락은 합격이 아님', envFailures('node', null, 3000).length > 0 && envFailures('node', { notRun: true }, 3000).length > 0 && envFailures('file', { failed: true, error: 'x' }, 3000).length > 0 && mutN(r => { delete r.extra; }).indexOf('extra-missing') >= 0);
    const a = node(), b = node();
    check('비교 판정: 환경 쌍 일치는 lifeDigest · rngCallDigest · 지점 순서열 해시 · 지점별 호출 수가 모두 같을 때만', pairSame(a, b) && !pairSame(a, Object.assign(node(), { seqDigest: 1 })) && !pairSame(a, Object.assign(node(), { byId: { a: 1611001, b: 554 } })) && !pairSame(a, Object.assign(node(), { lifeDigest: 2 })) && !pairSame(a, null));
    // ── 최종 판정(configVerdict)까지 연결한 통합 변이: 필수 환경 node · file · inline 이 모두 있어야 PASS ──
    const { configVerdict, overallExitCode, parseRunnerOutput, parseUintField, REQUIRED_ENVS } = require('./lib/compare_verdict.js');
    const full = () => ({ node: node(), file: page(), inline: page() });
    const st = f => { const r = full(); f(r); return configVerdict(r, 3000).status; };
    check('최종 판정: 필수 환경은 node · file · inline, 셋 모두 정상이고 세 쌍이 일치할 때만 PASS', eq(REQUIRED_ENVS, ['node', 'file', 'inline']) && configVerdict(full(), 3000).status === 'PASS' && eq(Object.keys(configVerdict(full(), 3000).pairSame).sort(), ['file=inline', 'node=file', 'node=inline']));
    check('최종 판정 변이: Node 만 실행(file · inline 미실행) → PASS 아님(PARTIAL)', st(r => { r.file = { notRun: true }; r.inline = { notRun: true }; }) === 'PARTIAL');
    check('최종 판정 변이: Node + file 만 실행(inline 미실행) → PASS 아님(PARTIAL)', st(r => { r.inline = { notRun: true }; }) === 'PARTIAL');
    check('최종 판정 변이: Node 가 미실행(Chromium 둘만 실행) → PASS 아님', st(r => { r.node = { notRun: true }; }) === 'PARTIAL');
    check('최종 판정 변이: 결과 객체 누락(inline 없음 · null · 행 자체 없음) → FAIL', st(r => { delete r.inline; }) === 'FAIL' && st(r => { r.file = null; }) === 'FAIL' && configVerdict(null, 3000).status === 'FAIL' && configVerdict(undefined, 3000).status === 'FAIL');
    check('최종 판정 변이: 한 환경의 실행 실패(failed 표시) → FAIL', st(r => { r.file = { failed: true, error: 'boom' }; }) === 'FAIL' && st(r => { r.node = { failed: true, error: 'x' }; }) === 'FAIL');
    check('최종 판정 변이: 한 환경에 실패 사유(UNKNOWN · integrity · pageErrors · 종료 코드) → FAIL', st(r => { r.inline.byCls = { R4: 1611000, R1: 554, UNKNOWN: 1 }; r.inline.unknownLives = 1; }) === 'FAIL' && st(r => { r.node.integrity.broken = true; }) === 'FAIL' && st(r => { r.file.extra.pageErrors = ['e']; }) === 'FAIL' && st(r => { r.node.extra.exit = 1; }) === 'FAIL');
    check('최종 판정 변이: 환경 사이 불일치(한 환경만 lifeDigest · 지점 순서열 · 지점별 호출 수가 다름) → FAIL', st(r => { r.inline.lifeDigest = 5; }) === 'FAIL' && st(r => { r.file.seqDigest = 7; }) === 'FAIL' && st(r => { r.node.byId = { a: 1611001, b: 554 }; }) === 'FAIL');
    check('최종 판정 변이: 실행한 환경이 0개(셋 다 미실행) → PASS 아님(FAIL)', st(r => { r.node = { notRun: true }; r.file = { notRun: true }; r.inline = { notRun: true }; }) === 'FAIL');
    check('최종 판정 변이: 부분 실행이라도 실행한 환경에 결함이 있으면 PARTIAL 이 아니라 FAIL', st(r => { r.inline = { notRun: true }; r.file.extra.pageErrors = ['e']; }) === 'FAIL' && st(r => { r.inline = { notRun: true }; r.file.lifeDigest = 9; }) === 'FAIL');
    check('최종 판정 변이: digest 가 세 환경에서 똑같이 누락(null)이어도 합격할 수 없음', st(r => { for (const e of REQUIRED_ENVS) r[e].lifeDigest = null; }) === 'FAIL' && st(r => { for (const e of REQUIRED_ENVS) r[e].rngCallDigest = null; }) === 'FAIL' && st(r => { for (const e of REQUIRED_ENVS) { r[e].lifeDigest = undefined; r[e].rngCallDigest = undefined; } }) === 'FAIL');
    check('최종 판정: digest 의 실제 값이 0 인 것은 정상(세 환경 모두 0 → PASS)', st(r => { for (const e of REQUIRED_ENVS) r[e].lifeDigest = 0; }) === 'PASS' && st(r => { for (const e of REQUIRED_ENVS) r[e].rngCallDigest = 0; }) === 'PASS');
    check('종료 코드: 모두 PASS → 0, FAIL 포함 → 1, FAIL 없이 PARTIAL 포함 → 3, 구성 0개·알 수 없는 상태 → 1', overallExitCode(['PASS', 'PASS']) === 0 && overallExitCode(['PASS', 'FAIL']) === 1 && overallExitCode(['PARTIAL', 'FAIL']) === 1 && overallExitCode(['PASS', 'PARTIAL']) === 3 && overallExitCode(['PARTIAL']) === 3 && overallExitCode([]) === 1 && overallExitCode(['PASS', undefined]) === 1 && overallExitCode(null) === 1);
    // ── 러너 출력 파서: 누락이 0 으로 바뀌지 않는다 ──
    const sample = 'completed: 3000 \nlifeDigest: 1715334118 \nv178: {"has2i":true,"rngCallDigest":3460114558,"rngCallsTotal":1611555,"v4":{}}\n';
    const P = parseRunnerOutput;
    check('파서: 정상 출력에서 uint32 값과 생애 수를 읽음', eq(P(sample), { lives: 3000, lifeDigest: 1715334118, rngCallDigest: 3460114558, rngCallsTotal: 1611555 }));
    check('파서 변이: lifeDigest 줄 누락 → null(0 아님)', P(sample.replace(/^lifeDigest:.*\n/m, '')).lifeDigest === null && Number(null) === 0);
    check('파서 변이: rngCallDigest 누락 → null(0 아님)', P(sample.replace('"rngCallDigest":3460114558,', '')).rngCallDigest === null);
    check('파서 변이: 숫자가 아닌 텍스트(INVALID(...) · 음수 · 소수 · 16진수 · 빈 값) → null', ['INVALID(harness integrity error)', '-5', '1.5', '0x10', '', 'NaN'].every(v => P(sample.replace('lifeDigest: 1715334118', 'lifeDigest: ' + v)).lifeDigest === null) && P(sample.replace('"rngCallDigest":3460114558', '"rngCallDigest":"x"')).rngCallDigest === null);
    check('파서: 실제 값이 숫자 0 인 digest 는 0 으로 읽음(누락과 구분)', P(sample.replace('lifeDigest: 1715334118', 'lifeDigest: 0')).lifeDigest === 0 && P(sample.replace('"rngCallDigest":3460114558', '"rngCallDigest":0')).rngCallDigest === 0);
    check('파서: uint32 범위를 넘는 digest · 입력이 문자열이 아님 → null', P(sample.replace('lifeDigest: 1715334118', 'lifeDigest: 4294967296')).lifeDigest === null && P(sample.replace('lifeDigest: 1715334118', 'lifeDigest: 4294967295')).lifeDigest === 4294967295 && eq(P(null), { lives: null, lifeDigest: null, rngCallDigest: null, rngCallsTotal: null }) && eq(P(undefined), P('')));
    check('파서 → 판정 연결: 러너 출력에 lifeDigest 가 없으면 그 환경은 실패 사유가 생기고 구성은 FAIL', (() => { const r = full(); Object.assign(r.node, P(sample.replace(/^lifeDigest:.*\n/m, ''))); r.node.siteCalls = r.node.rngCallsTotal; return envFailures('node', r.node, 3000).some(x => x.startsWith('lifeDigest-invalid')) && configVerdict(r, 3000).status === 'FAIL'; })());
    void parseUintField;
    const cmpSrc = read('tests/rng_sites_compare.js');
    check('비교 도구가 이 판정·파서를 씀(자체 조건식·Number(g(...)) 변환 없음)', cmpSrc.indexOf('configVerdict(row, RUNS)') >= 0 && cmpSrc.indexOf('overallExitCode(statuses)') >= 0 && cmpSrc.indexOf('parseRunnerOutput(r.stdout)') >= 0 && cmpSrc.indexOf('Number(g(') < 0 && cmpSrc.indexOf('const good') < 0 && cmpSrc.indexOf('const ok = e =>') < 0);
}
// ── VM-9: 열 위치 ───────────────────────────────────────────────────────────────────────
{
    // V8 은 멤버 호출 Math.random() 의 위치를 속성 이름(random) 열로 보고한다(= M 의 열 + 5). 실제 실행 기록으로 확인한다.
    const siteAt = R.makeSiteIndex(sites);
    // 결정 규칙: V8 은 멤버 호출 Math.random() 의 위치를 속성 이름(random) 시작 열로 보고한다(= M 의 열 + 5). 일반 호출 f() 는 함수 이름 시작 열.
    // 지점은 그 열(stackCol)과 정확히 같을 때만 일치한다. 표현식 범위 안의 다른 열은 모두 불일치(UNKNOWN)여야 한다.
    let okM = true, okExact = true, okMiss = true, okCall = true; const bad = [];
    const atCol = (s, col) => { const i = SOURCE_FILES.indexOf(s.file); const p = vmPosOf(fileOffset[i] + offsetInFile(i, s.line, col)); return R.mapPosition(asm, p.line, p.col); };
    for (const s of src.filter(x => x.kind === 'direct')) {
        const i = SOURCE_FILES.indexOf(s.file);
        const lineText = texts[i].slice(origStarts[i][s.line - 1], origStarts[i][s.line]);
        if (lineText.substr(s.col - 1, 11) !== 'Math.random' || s.stackCol !== s.col + 5 || lineText.substr(s.stackCol - 1, 6) !== 'random') okM = false;   // 표의 열 = M 의 열(UTF-16), 기대 스택 열 = random 의 열
        const hit = atCol(s, s.stackCol);
        if (!(hit.area === 'source' && hit.file === s.file && hit.line === s.line && hit.col === s.stackCol && siteAt(hit) === s)) { okExact = false; bad.push('정확 일치 실패 ' + s.id); }
        for (const d of [-1, 0, 1, 2, 3, 4, 6, 7, 10, 11, 12]) {   // M 의 열(0)을 포함해 random 시작 열(5)이 아닌 모든 위치
            const col = s.col + d; if (col < 1 || col === s.stackCol) continue;
            const m = atCol(s, col);
            if (m.area === 'source' && siteAt(m) !== null && siteAt(m) === s) { okMiss = false; bad.push('불일치여야 하는 열이 일치 ' + s.id + ' +' + d); }
        }
    }
    for (const s of src.filter(x => x.kind === 'call')) {
        const i = SOURCE_FILES.indexOf(s.file);
        const lineText = texts[i].slice(origStarts[i][s.line - 1], origStarts[i][s.line]);
        const hit = atCol(s, s.stackCol);
        if (!(s.stackCol === s.col && lineText.substr(s.col - 1, s.callee.length) === s.callee && siteAt(hit) === s)) { okCall = false; bad.push('호출 지점 ' + s.id); }
        for (const d of [-1, 1, 2, s.callee.length - 1, s.callee.length]) { const m = atCol(s, s.col + d); if (m.area === 'source' && siteAt(m) === s) { okCall = false; bad.push('호출 지점 불일치여야 함 ' + s.id + ' +' + d); } }
    }
    check('VM-9 지점 표: col = 원본 줄에서 Math.random 의 M 열, stackCol = random 토큰 시작 열(M + 5) — 20곳 모두', okM);
    check('VM-9 직접 호출: 기대 스택 열(random 시작)과 정확히 같은 위치만 그 지점으로 분류(20곳)', okExact, bad.join(','));
    check('VM-9 직접 호출: M 의 열을 포함해 표현식 안팎의 다른 열은 모두 불일치(범위 일치 없음)', okMiss, bad.join(','));
    check('VM-9 공유·래퍼 함수 호출: 함수 이름 시작 열과 정확히 같을 때만 일치, 이름 안의 다른 열·바로 앞뒤는 불일치(10곳)', okCall, bad.join(','));
    {
        const VMF = 'danmachi-integration-test.js';
        const cl = R.makeClassifier({ sites, dropFrames: 1, locate: fr => (fr && fr.file === VMF) ? R.mapPosition(asm, fr.line, fr.col) : { area: 'unknown' } });
        const r5 = sites.find(s => s.id === 'script.js:nextYear:random#1'), i = SOURCE_FILES.indexOf('script.js');
        const stackAt = col => { const p = vmPosOf(fileOffset[i] + offsetInFile(i, r5.line, col)); return 'Error\n    at recordedRandom (/x/test_runner.js:1:1)\n    at nextYear (' + VMF + ':' + p.line + ':' + p.col + ')'; };
        check('VM-9 분류기: 기대 열이면 R5, M 의 열·한 칸 옆·표현식 끝이면 UNKNOWN(예상하지 못한 열은 반드시 UNKNOWN)', cl(stackAt(r5.stackCol)).cls === 'R5' && [r5.col, r5.stackCol - 1, r5.stackCol + 1, r5.col + 11].every(c => cl(stackAt(c)).cls === 'UNKNOWN'));
    }
    const k = J.tally.unknownSamples.length;
    check('VM-9 실제 실행: V8 이 보고한 열로 모든 호출이 지점에 정확히 맞음(UNKNOWN 표본 0)', k === 0);
    // 합성: 줄 앞에 한글(BMP, 1 단위)과 보충 평면 문자(2 단위)가 있는 소스
    const synth = 'const a = "가나다"; const b = "\u{1F600}"; const x = Math.random();\nfunction f() { return Math.random(); }\n';
    const sa = R.buildAssembly(R.buildNodeVmParts(['a.js', 'b.js'], ['// 한글 머리말\n', synth], '\n;\n', '\n', '/* h */'));
    const ss = R.buildSiteTable([{ area: 'source', file: 'b.js', text: synth }], { shared: {}, wrapper: {}, groups: {}, harness: {} });
    const col1 = synth.indexOf('Math.random') + 1;   // JS 문자열 인덱스 = UTF-16 코드 단위
    let captured = null;
    const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random() { captured = new Error().stack; return 0.5; } }), Error });
    new vm.Script(sa.text, { filename: 'synth.js' }).runInContext(ctx);
    const fr = R.parseStack(captured, 4)[1];
    const mm = R.mapPosition(sa, fr.line, fr.col);
    check('VM-9 합성(한글 + 보충 평면 문자 앞): 스택 열 → 원본 열이 UTF-16 기준으로 정확(바이트 기준 아님)', ss[0].col === col1 && mm.area === 'source' && mm.file === 'b.js' && mm.line === 1 && mm.col === col1 + 5 && Buffer.byteLength(synth.slice(0, col1 - 1), 'utf8') !== col1 - 1, JSON.stringify({ fr, mm, col1 }));
}
// ── VM-6 · VM-10: 실제 실행 집계 ────────────────────────────────────────────────────────
{
    const lives = J.tally.lives, sum = o => Object.values(o).reduce((a, b) => a + b, 0);
    const rngTotal = Number((run.stdout.match(/"rngCallsTotal":(\d+)/) || [])[1]);
    check('VM-6 모든 호출이 "분류됨" 또는 UNKNOWN 중 하나로 집계되고 합 = 총 호출 수(생애 구간, 러너의 rngCallsTotal 과 같음)', sum(lives.byId) === lives.calls && sum(lives.byCls) === lives.calls && lives.calls === rngTotal, lives.calls + ' vs ' + rngTotal);
    check('VM-6 생애 구간·단위 시험 구간 모두 UNKNOWN 0', !lives.byCls.UNKNOWN && !J.tally.unit.byCls.UNKNOWN, JSON.stringify([lives.byCls, J.tally.unit.byCls]));
    check('VM-6 생애 구간에 R1·R3·R4·R5·HARNESS 가 모두 관측됨(주 루프는 자동 진행을 끄므로 R2 는 0)', ['R1', 'R3', 'R4', 'R5', 'HARNESS'].every(c => lives.byCls[c] > 0) && !lives.byCls.R2, JSON.stringify(lives.byCls));
    check('VM-6 단위 시험 구간(자동 진행 단위 시험 포함)에 R2 가 관측됨', J.tally.unit.byCls.R2 > 0);
    const r1 = 'script.js:getRandomItemByWeight:random#1<-script.js:nextYear:call-getRandomItemByWeight#1';
    check('VM-10 공유 함수 호출: R1 은 (getRandomItemByWeight 123, nextYear 923 — F1 122·885) 쌍 하나로만 집계', lives.byId[r1] === lives.byCls.R1);
    check('VM-10 래퍼·공유 함수를 거친 호출은 호출자 지점과 쌍으로 기록(rnd ← rollFamiliaBody, weightedPick ← 관계 함수)', Object.keys(lives.byId).some(k => k.startsWith('script.js:rnd:random#1<-script.js:rollFamiliaBody:call-rnd#1')) && Object.keys(lives.byId).some(k => k.startsWith('core/relations.js:weightedPick:random#1<-core/relations.js:')));
    check('VM-10 공유·래퍼 함수의 Math.random 이 호출자 없이 단독으로 집계된 경우 0', !Object.keys(lives.byId).some(k => /^(script\.js:(rnd|getRandomItemByWeight)|core\/relations\.js:weightedPick):random#1$/.test(k)));
}
// ── VM-10(합성) · VM-8 · 분류기 실패 경로 ───────────────────────────────────────────────
{
    const VMF = 'danmachi-integration-test.js';
    const locate = a => fr => (fr && fr.file === VMF) ? R.mapPosition(a, fr.line, fr.col) : { area: 'unknown', reason: 'not-vm-file' };
    const frameOf = s => { const i = SOURCE_FILES.indexOf(s.file); const p = vmPosOf(fileOffset[i] + offsetInFile(i, s.line, s.stackCol)); return '    at x (' + VMF + ':' + p.line + ':' + p.col + ')'; };
    const byId = id => sites.find(s => s.id === id);
    const stackOf = (...frames) => ['Error', '    at recordedRandom (/x/test_runner.js:1:1)'].concat(frames).join('\n');
    const good = R.makeClassifier({ sites, dropFrames: 1, locate: locate(asm) });
    const shared = byId('script.js:getRandomItemByWeight:random#1'), callNY = byId('script.js:nextYear:call-getRandomItemByWeight#1'), r5 = byId('script.js:nextYear:random#1');
    check('B 규칙: 직접 호출(914, F1 876) → R5, 공유 함수(123, F1 122) ← nextYear(923, F1 885) → R1', good(stackOf(frameOf(r5))).cls === 'R5' && good(stackOf(frameOf(shared), frameOf(callNY))).cls === 'R1');
    check('VM-10 합성: 호출자 프레임이 변환되지 않으면 분류도 UNKNOWN(다음 프레임으로 추정하지 않음)', good(stackOf(frameOf(shared), '    at y (other.js:1:1)', frameOf(callNY))).cls === 'UNKNOWN' && good(stackOf(frameOf(shared), 'garbage line')).cls === 'UNKNOWN' && good(stackOf(frameOf(shared))).cls === 'UNKNOWN');
    check('B 규칙: 지점이 아닌 위치·맨 위가 호출 지점인 경우·기록기 프레임뿐인 경우 → UNKNOWN', good(stackOf('    at z (' + VMF + ':1:1)')).cls === 'UNKNOWN' && good(stackOf(frameOf(callNY))).cls === 'UNKNOWN' && good(stackOf()).cls === 'UNKNOWN');
    const order = [0, 1, 2, 4, 3, 5, 6, 7, 8];   // sourceFiles 순서를 바꾼 가짜 표(core/growth.js 와 core/relations.js 를 맞바꿈 → growth 의 조립 위치가 달라짐)
    const fake = R.buildAssembly(R.buildNodeVmParts(order.map(i => SOURCE_FILES[i]), order.map(i => texts[i]), '\n;\n', '\n', harnessText, 'harness'));
    const mis = R.makeClassifier({ sites, dropFrames: 1, locate: locate(fake) });
    const growth = byId('core/growth.js:rollAnnualExcelia:random#1');
    check('VM-8 변이: sourceFiles 순서를 바꾼 표로 변환하면 지점 표와 맞지 않아 UNKNOWN(가까운 줄로 보정하지 않음)', good(stackOf(frameOf(growth))).cls === 'R4' && mis(stackOf(frameOf(growth))).cls === 'UNKNOWN');
}
// ── VM-11: 줄을 공유하는 경계(합성) ─────────────────────────────────────────────────────
{
    const A = 'var a = 1;\nvar last = 2;', B = 'var first = 3;\n';   // A 는 마지막 LF 없이 끝남
    const s = R.buildAssembly(R.buildNodeVmParts(['A.js', 'B.js'], [A, B], '\n;\n', '\n', 'var h = 0;'));
    const st = R.lineStarts(s.text), at = off => { const p = R.posOfOffset(st, off); return R.mapPosition(s, p.line, p.col); };
    const lastCode = A.length - 1;   // A 의 마지막 글자(';')
    const m1 = at(lastCode), mNl = at(A.length), mSemi = at(A.length + 1), mNext = at(A.length + 3);
    check('VM-11 (1) 앞 파일의 마지막 코드 위치 → 앞 파일 마지막 줄·열', m1.area === 'source' && m1.file === 'A.js' && m1.line === 2 && m1.col === 'var last = 2;'.length);
    check('VM-11 (2) 구분자의 "\\n" 과 ";" → UNKNOWN(separator). 첫 "\\n" 은 앞 파일 마지막 줄과 같은 줄에 있음', mNl.reason === 'separator' && mSemi.reason === 'separator' && R.posOfOffset(st, A.length).line === R.posOfOffset(st, lastCode).line);
    check('VM-11 (3) 다음 파일의 첫 코드 위치 → 다음 파일 1행 1열', mNext.area === 'source' && mNext.file === 'B.js' && mNext.line === 1 && mNext.col === 1);
    check('VM-11 (4) 인접 조각 오프셋 누락·중복 0', R.checkRows(s.rows, s.text.length).length === 0);
    const crlf = R.lineStarts('a\r\nb\rc d e\nf');
    check('줄 종결자 5종(LF, CR, CRLF 는 1개, U+2028, U+2029)을 V8 과 같게 셈', eq(crlf, [0, 3, 5, 7, 9, 11]));
}
// ── 순서 보장 반영 큐(§E-1.3) ───────────────────────────────────────────────────────────
{
    const applied = []; let q = createCommitQueue(x => applied.push(x.id));
    q.run(() => 'c1', () => { q.run(() => 'c2', () => true, (r, c) => ({ kind: 'commit', id: 2 })); return true; }, (r, c) => ({ kind: 'commit', id: 1 }));   // 동기 중첩: 안쪽이 먼저 끝남
    check('큐: 동기 중첩에서 안쪽(seq 2)이 먼저 끝나도 seq 순서(1 → 2)로 반영', eq(applied, [1, 2]) && q.checkBoundary('t') && q.nextCommitSeq === 3 && q.done.size === 0);
    applied.length = 0; q = createCommitQueue(x => applied.push(x.id));
    q.run(() => 0, () => false, (r) => r === true ? { kind: 'commit', id: 1 } : { kind: 'discard', reason: String(r) });
    q.run(() => 0, () => undefined, () => ({ kind: 'discard', reason: 'undefined' }));
    q.run(() => 0, () => true, () => ({ kind: 'commit', id: 3 }));
    check('큐: 폐기(false · undefined)는 반영하지 않고 순번만 넘어감, 뒤의 반영은 정상', eq(applied, [3]) && q.checkBoundary('t') && q.integrity().discarded === 2 && q.integrity().committed === 1);
    applied.length = 0; q = createCommitQueue(x => applied.push(x.id));
    let thrown = null; try { q.run(() => 0, () => { throw new Error('game'); }, () => ({ kind: 'commit', id: 1 })); } catch (e) { thrown = e; }
    q.run(() => 0, () => true, () => ({ kind: 'commit', id: 2 }));
    check('큐: 원래 함수의 예외는 그대로 다시 던지고 seq 는 폐기 등록(하네스 오류 아님), 뒤의 seq 가 막히지 않음', thrown && thrown.message === 'game' && !q.harnessBroken && eq(applied, [2]) && q.checkBoundary('t'));
    applied.length = 0; q = createCommitQueue(x => applied.push(x.id));
    let called = false; thrown = null; try { q.run(() => { throw new Error('cap'); }, () => { called = true; return true; }, () => ({ kind: 'commit', id: 1 })); } catch (e) { thrown = e; }
    check('큐: 캡처 예외는 하네스 무결성 오류(wrapper_capture_failed), 원래 함수는 부르지 않음, seq 는 완료 등록', thrown && thrown.message === 'cap' && !called && q.harnessBroken && q.firstError.reason === 'wrapper_capture_failed' && q.wrapperSeq === 1 && q.done.size === 1);
    q = createCommitQueue(x => applied.push(x.id)); thrown = null; try { q.run(() => 0, () => true, () => { throw new Error('cls'); }); } catch (e) { thrown = e; }
    check('큐: 분류 예외도 하네스 무결성 오류(wrapper_classify_failed)', thrown && q.harnessBroken && q.firstError.reason === 'wrapper_classify_failed');
    applied.length = 0; q = createCommitQueue(x => { if (x.id === 2) throw new Error('apply'); applied.push(x.id); });
    q.run(() => 0, () => true, () => ({ kind: 'commit', id: 1 }));
    let leaked = null; try { q.run(() => 0, () => true, () => ({ kind: 'commit', id: 2 })); } catch (e) { leaked = e; }
    q.run(() => 0, () => true, () => ({ kind: 'commit', id: 3 }));
    check('큐: 반영 중 예외 → 그 seq 를 완료로 기록하지 않음(nextCommitSeq 유지), harnessBroken, 예외를 게임 흐름으로 던지지 않음', !leaked && q.harnessBroken && q.firstError.reason === 'commit_failed' && q.firstError.seq === 2 && q.nextCommitSeq === 2);
    check('큐: harnessBroken 뒤에는 아무것도 반영하지 않고 완료 등록만 계속', eq(applied, [1]) && q.done.has(2) && q.done.has(3) && q.checkBoundary('t') === false && q.integrity().broken === true);
    q = createCommitQueue(() => {}); q.wrapperSeq = 1;   // 완료되지 않은 seq 가 남은 상태(합성)
    check('큐: 경계에서 비지 않았으면 commit_queue_not_drained 로 하네스 오류', q.checkBoundary('life') === false && q.harnessBroken && /^commit_queue_not_drained/.test(q.firstError.reason));
    check('반환값 분류: true → 반영 / false → 폐기 / undefined(정지 중) → 폐기 / undefined(정지 아님, F1 계약) → 반영(legacy)',
        showEventDisposition(true, false) === 'commit' && showEventDisposition(true, true) === 'commit' && showEventDisposition(false, false) === 'discard' && showEventDisposition(undefined, true) === 'discard' && showEventDisposition(undefined, false) === 'commit-legacy' && showEventDisposition(null, false) === 'discard');
}
// ── 러너에 연결된 상태 확인과 변이(임시 사본) ────────────────────────────────────────────
{
    const H = JSON.parse(fs.readFileSync(path.join(tmp, 'h.json'), 'utf8')).harnessIntegrity;
    const events = Number((run.stdout.match(/^eventCount:\s*(\d+)/m) || [])[1]);
    check('러너: 정상 실행에서 harnessIntegrity.broken === false, 발급 = 반영 + 폐기', H && H.broken === false && H.issued === H.committed + H.discarded && H.issued > 0, JSON.stringify(H));
    const src0 = read('test_runner.js');
    const copy = (mutate) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1mut-')); const cp = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { if (['logs', 'archive', 'node_modules', '.git'].includes(e.name)) continue; const s = path.join(a, e.name), d = path.join(b, e.name); e.isDirectory() ? cp(s, d) : fs.copyFileSync(s, d); } }; cp(ROOT, dir); mutate(dir); return dir; };
    const runIn = (dir, env) => spawnSync('node', [path.join(dir, 'test_runner.js')], { env: Object.assign({}, process.env, { SIM_RUNS: '30', FORCE_COLOR: '0', NO_COLOR: '1' }, env || {}), encoding: 'utf8', maxBuffer: 1 << 26 });
    const mut = (needle, replacement) => copy(dir => { if (src0.split(needle).length !== 2) throw new Error('변이 대상 문장이 1개가 아님: ' + needle); fs.writeFileSync(path.join(dir, 'test_runner.js'), src0.replace(needle, replacement)); });
    // 변이 1: 반영 단계에서 예외(주 루프의 반영만. 합성 시험 단계는 통과시킨다)
    const d1 = mut("        if (!x.paused) for (const op of x.ops) op();", "        if (!x.paused) { if (results.completedRuns >= 3) throw new Error('synthetic commit failure'); for (const op of x.ops) op(); }");
    const r1 = runIn(d1, { SIM_HARNESS_JSON: path.join(d1, 'h.json') });
    const h1 = JSON.parse(fs.readFileSync(path.join(d1, 'h.json'), 'utf8')).harnessIntegrity;
    check('EN-2c(n) 변이: 반영 예외 → 종료 코드 ≠ 0, 결과에 broken · firstError · seq 기록', r1.status !== 0 && h1.broken === true && h1.firstError.reason === 'commit_failed' && h1.seq > 0, JSON.stringify(h1));
    check('EN-2c(n) 변이: lifeDigest 를 숫자로 내지 않음(집계 도구의 /^lifeDigest:\\s*(\\d+)/ 가 받지 못함) · 오류 표시 출력', !/^lifeDigest:\s*\d+/m.test(r1.stdout) && /harnessIntegrity: BROKEN/.test(r1.stderr));
    const dg = spawnSync('node', [path.join(d1, 'tests', 'regression_digest.js'), 'physical/20261104'], { env: Object.assign({}, process.env, { SIM_RUNS: '30' }), encoding: 'utf8', maxBuffer: 1 << 26 });
    check('EN-2c(n) 변이: 회귀 digest 도구가 그 결과를 일치로 받지 않고 실패로 끝남', dg.status !== 0 && !/SAME/.test(dg.stdout), (dg.stdout || '').slice(0, 200));
    // 변이 2: 완료 등록을 빼면(규칙 1 위반) 생애 경계 검사가 잡는다
    const libSrc = read('tests/lib/commit_queue.js');
    const d2 = copy(dir => { const n = "            q.done.set(seq, rec);                          // 반드시 완료 등록"; if (libSrc.split(n).length !== 2) throw new Error('변이 대상 없음'); fs.writeFileSync(path.join(dir, 'tests', 'lib', 'commit_queue.js'), libSrc.replace(n, '            /* MUTATION */')); });
    const r2 = runIn(d2);
    check('변이: 완료 등록(finally 의 done.set)을 빼면 경계 검사에 걸려 실행이 실패', r2.status !== 0, 'exit=' + r2.status);
    // 변이 3: 순서 보장 없이 완료 즉시 반영(정렬·순번 무시)하면 중첩 순서가 뒤집힌다 — 큐 단위에서 확인
    const naive = []; const nq = { run(cap, call, cls) { const c = cap(); const r = call(); const rec = cls(r, c); if (rec.kind === 'commit') naive.push(rec.id); return r; } };
    nq.run(() => 0, () => { nq.run(() => 0, () => true, () => ({ kind: 'commit', id: 2 })); return true; }, () => ({ kind: 'commit', id: 1 }));
    check('변이(대조): 순번 없이 완료 즉시 반영하면 중첩에서 2 → 1 로 뒤집힘(큐가 필요한 이유)', eq(naive, [2, 1]));
    for (const d of [d1, d2]) fs.rmSync(d, { recursive: true, force: true });
    void events;
}
// ── 10구성 digest 엄격 대조(tests/digest10_strict.js) ───────────────────────────────────────
{
    const { strictCompare, EXPECTED_KEYS } = require('./digest10_strict.js');
    const ref = JSON.parse(read('logs/v178_f1/digest10_vs_s3.json'));
    const clone = () => JSON.parse(JSON.stringify(ref));
    const badOf = f => { const now = clone(); f(now); return strictCompare(now, ref).bad; };
    check('digest 엄격 대조: F1 기록 자신과 대조하면 10/10 동일(구성 10개)', EXPECTED_KEYS.length === 10 && ref.length === 10 && strictCompare(clone(), ref).bad === 0 && strictCompare(clone(), ref).lines.every(l => l.startsWith('SAME ')));
    check('digest 엄격 대조 변이: lifeDigest 다름 · rngCallDigest 다름 · 누락(null) · 비숫자 → 실패', badOf(n => { n[0].lifeDigest = '1'; }) === 1 && badOf(n => { n[1].rngCallDigest = '2'; }) === 1 && badOf(n => { n[2].lifeDigest = null; }) === 1 && badOf(n => { n[3].rngCallDigest = null; }) === 1 && badOf(n => { n[4].lifeDigest = 'INVALID(harness integrity error)'; }) === 1);
    check('digest 엄격 대조 변이: 종료 코드 ≠ 0 · 완주 수 부족 · 불변식 실패 · 예외 > 0 → 실패', badOf(n => { n[0].exit = 1; }) === 1 && badOf(n => { n[0].exit = null; }) === 1 && badOf(n => { n[5].completed = '2999'; }) === 1 && badOf(n => { n[6].allInv = 'false'; }) === 1 && badOf(n => { n[7].exc = '1'; }) === 1);
    const res = f => { const now = clone(); f(now); return strictCompare(now, ref); };
    const S = f => res(f).structure.now;
    check('digest 엄격 대조: 정상 10개 구성은 PASS — 기대 키 10개가 각각 정확히 1회, 구성 수 10, 누락·중복·알 수 없는 키 0', (() => { const r = strictCompare(clone(), ref); return r.bad === 0 && r.structure.now.countOk && r.structure.now.missing.length === 0 && r.structure.now.duplicate.length === 0 && r.structure.now.unknown.length === 0 && r.lines.filter(l => l.startsWith('SAME ')).length === 10; })());
    check('digest 엄격 대조 변이: 기대 키 하나 중복, 두 값 동일 → FAIL(값이 같아도 중복은 실패)', (() => { const r = res(n => { n.push(JSON.parse(JSON.stringify(n[0]))); }); return r.bad > 0 && r.structure.now.duplicate.length === 1 && !r.structure.now.countOk && r.structure.now.missing.length === 0; })());
    check('digest 엄격 대조 변이: 기대 키 하나 중복, 두 번째 항목의 digest 가 잘못됨 → FAIL(두 번째 항목도 검사)', (() => { const r = res(n => { const d = JSON.parse(JSON.stringify(n[3])); d.lifeDigest = '1'; n.push(d); }); return r.bad >= 2 && r.structure.now.duplicate.length === 1 && r.lines.some(l => l.startsWith('DIFF ' + ref[3].key + ' ') && l.indexOf('lifeDigest 다름') >= 0 && l.indexOf('중복 항목 2/2') >= 0); })());
    check('digest 엄격 대조 변이: 잘못된 항목이 앞, 정상 항목이 뒤에 중복 → FAIL(순서와 무관)', res(n => { const d = JSON.parse(JSON.stringify(n[3])); d.rngCallDigest = '2'; n.splice(3, 0, d); }).bad >= 2);
    check('digest 엄격 대조 변이: 기대 키 중복으로 다른 기대 키가 누락(항목 수는 10 그대로) → FAIL, 중복과 누락을 각각 기록', (() => { const r = res(n => { n[9] = JSON.parse(JSON.stringify(n[0])); }); const s = r.structure.now; return r.bad >= 2 && s.countOk && s.duplicate.length === 1 && s.missing.length === 1 && s.missing[0] === ref[9].key && r.lines.some(l => l.indexOf('중복된 구성') >= 0) && r.lines.some(l => l.indexOf('누락된 구성') >= 0); })());
    check('digest 엄격 대조 변이: 알 수 없는 키 추가 → FAIL(알 수 없는 구성으로 기록)', (() => { const r = res(n => { n.push({ key: 'x/1', lifeDigest: '1', rngCallDigest: '1', exit: 0, completed: '3000', allInv: 'true', exc: '0' }); }); return r.bad > 0 && r.structure.now.unknown.length === 1 && r.structure.now.unknown[0] === 'x/1' && r.structure.now.missing.length === 0 && r.structure.now.duplicate.length === 0; })());
    check('digest 엄격 대조 변이: 구성 하나 누락 → FAIL(누락된 구성으로 기록)', (() => { const r = res(n => { n.pop(); }); return r.bad > 0 && r.structure.now.missing.length === 1 && !r.structure.now.countOk; })());
    check('digest 엄격 대조 변이: 키가 없는 항목 · null 항목 · 배열이 아님 · 빈 배열 → FAIL', res(n => { n.push({}); }).bad > 0 && res(n => { n.push(null); }).bad > 0 && strictCompare(null, ref).bad > 0 && strictCompare({}, ref).bad > 0 && strictCompare([], ref).bad > 0);
    check('digest 엄격 대조: 항목 순서만 바뀐 정상 10개는 PASS(정확히 1회 출현이 기준)', res(n => { n.reverse(); }).bad === 0);
    check('digest 엄격 대조 변이: F1 기준 쪽의 중복 · 누락 · 알 수 없는 키 · 구성 수 오류도 FAIL', (() => { const mk = f => { const r = clone(); f(r); return strictCompare(clone(), r); }; return mk(r => { r.push(JSON.parse(JSON.stringify(r[0]))); }).bad > 0 && mk(r => { r.pop(); }).bad > 0 && mk(r => { r.push({ key: 'y/2' }); }).bad > 0 && mk(r => { r[9] = JSON.parse(JSON.stringify(r[0])); }).bad > 0 && strictCompare(clone(), null).bad > 0; })());
    void S;
}
// ── 공통 드라이버(§4.1.4) ───────────────────────────────────────────────────────────────
{
    let calls = 0; const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random() { calls++; return 0.75; } }) });
    vm.runInContext(read('tests/lib/driver_core.js'), ctx);
    const b = (tag) => ({ dataset: tag ? { followup: tag } : undefined, tag });
    const ev = vm.runInContext('driverChoose', ctx)([b(), b(), b(), b()], null);
    check('드라이버: 일반 사건 화면은 Math.random 1회로 usable[floor(r × n)] 를 고름', ev.kind === 'event' && calls === 1 && ev.button !== undefined);
    calls = 0; const st = vm.runInContext('driverChoose', ctx)([b('supporter'), b('stay')], { kind: 'recruit_after_fail' });
    check('드라이버: 후속 선택 화면은 stay 표식 버튼을 난수 0회로 고름', st.kind === 'followup_stay' && st.button.tag === 'stay' && calls === 0);
    const er = vm.runInContext('driverChoose', ctx)([b('supporter')], { kind: 'x' });
    check('드라이버: 후속 선택 화면에 stay 가 없으면 오류(난수 0회)', er.kind === 'error' && calls === 0);
    const runnerSrc = read('test_runner.js');
    check('드라이버: 러너의 주 루프에 버튼 선택 난수 표현이 남아 있지 않음(선택은 driver_core 한 곳)', runnerSrc.indexOf('usable[Math.floor(Math.random() * usable.length)]') < 0 && runnerSrc.indexOf('driverChoose(usable, S.pendingFollowup)') >= 0);
    check('공통 소스: 러너가 rng_core · mock_dom · commit_queue · driver_core 를 tests/lib 에서 읽음', ['rng_core.js', 'mock_dom.js', 'commit_queue.js', 'driver_core.js'].every(f => runnerSrc.indexOf("'" + f + "'") >= 0 || runnerSrc.indexOf('/lib/' + f) >= 0));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log((fail ? 'RESULT: FAIL ' : 'RESULT: PASS ') + pass + '/' + (pass + fail) + ' (rng_sites_test)');
process.exitCode = fail ? 1 : 0;
