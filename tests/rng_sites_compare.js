// F1D4A P1 — RNG 지점 기록 세 환경 비교(Node VM / Chromium file:// / Chromium inline). 시험 하네스 전용, 게임 코드 변경 없음.
// 설계: F1D4A r3.20 00_INDEX §4.1.3(B 규칙) · §4.1.4(공통 드라이버) · §4.1.5(위치 역변환)
// 사용: node tests/rng_sites_compare.js <출력 폴더> [env=node,file,inline] [configs=physical/20261104,...] [runs=3000]
//   - Node: test_runner.js 를 SIM_RNG_SITES 로 실행(같은 driver_core 소스가 주 루프에서 버튼을 고른다)
//   - Chromium: 같은 rng_core · driver_core 소스를 페이지에 주입한다. Playwright 쪽 난수는 쓰지 않는다.
//   - 기존 tests/browser_test.js(스모크 시험)는 이 비교와 별개다. 대체하지 않는다.
// 실행하지 않은 환경은 결과에 "미실행"으로 남는다. 이 스크립트는 기준 파일·로그를 갱신하지 않는다.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const RngSites = require('./lib/rng_sites.js');
const { checkByCls, isPlainObject, REQUIRED_ENVS, configVerdict, overallExitCode, parseRunnerOutput } = require('./lib/compare_verdict.js');
const ROOT = path.join(__dirname, '..');
const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const SOURCE_FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
const ALL_CONFIGS = ['physical/20261104', 'physical/777', 'physical/314159', 'physical/8675309', 'off/20261104', 'off/777', 'off/314159', 'off/8675309', 'calendar/20261104', 'newborn_parent_familia/20261104'];
const arg = (name, dflt) => { const a = process.argv.slice(3).find(x => x.startsWith(name + '=')); return a ? a.slice(name.length + 1) : dflt; };
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tests/rng_sites_compare.js <out dir> [env=..] [configs=..] [runs=..]'); process.exit(2); }
const ENVS = arg('env', 'node,file,inline').split(',');
const CONFIGS = arg('configs', ALL_CONFIGS.join(',')).split(',');
const RUNS = Number(arg('runs', '3000'));
const STACK_LIMIT = 50, MAX_ACTIONS = 3000, CHUNK = 100;
fs.mkdirSync(OUT, { recursive: true });
for (const c of CONFIGS) if (ALL_CONFIGS.indexOf(c) < 0) { console.error('unknown config ' + c); process.exit(2); }

const modeEnv = mode => mode === 'newborn_parent_familia' ? { SIM_NEWBORN_MEMBERSHIP: '1' } : { SIM_HP_REGEN_MODE: mode };   // tests/regression_digest.js 와 같은 방식
const modeGlobals = mode => mode === 'newborn_parent_familia' ? { __NEWBORN_MEMBERSHIP: true } : { __HP_REGEN_MODE: mode };

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const texts = SOURCE_FILES.map(read);
const LIB = { rng_core: read('tests/lib/rng_core.js'), rng_sites: read('tests/lib/rng_sites.js'), commit_queue: read('tests/lib/commit_queue.js'), driver_core: read('tests/lib/driver_core.js'), page_driver: read('tests/lib/page_driver.js') };
const HARNESS_URL = 'f1d4a-harness.js';
// 페이지에 주입하는 하네스 한 덩어리. 줄·열은 이 문자열 기준이다(sourceURL 로 스택에 이 이름이 나온다).
const harnessBody = [LIB.rng_core, LIB.rng_sites, LIB.commit_queue, LIB.driver_core, LIB.page_driver].join('\n');
const sourceSites = () => SOURCE_FILES.map((file, i) => ({ area: 'source', file, text: texts[i] }));

function summarize(tag, r) {
    // 집계를 값 변환 없이 그대로 넘긴다(없는 것을 0 이나 빈 객체로 채우지 않는다). 형식·합계·UNKNOWN 검사는 compare_verdict.js 가 한다.
    const lives = isPlainObject(r.tally) && isPlainObject(r.tally.lives) ? r.tally.lives : {};
    const unit = isPlainObject(r.tally) && isPlainObject(r.tally.unit) ? r.tally.unit : {};
    return { tag, lives: r.lives, lifeDigest: r.lifeDigest, rngCallDigest: r.rngCallDigest, rngCallsTotal: r.rngCallsTotal,
        unknownLives: checkByCls(lives.byCls, lives.calls, 'byCls', true).unknown, unknownUnit: checkByCls(unit.byCls, unit.calls, 'unitByCls', false).unknown,   // 표시용. 판정은 집계에서 다시 읽는다
        siteCalls: lives.calls, byCls: lives.byCls, byId: lives.byId, unitCalls: unit.calls, unitByCls: unit.byCls,
        seqDigest: lives.seqDigest, perLifeCallDigest: lives.perLifeCallDigest, integrity: r.integrity || null, extra: r.extra || null, unknownSamples: (r.tally || {}).unknownSamples || [] };
}

function runNode(config) {
    const [mode, seed] = config.split('/');
    const out = path.join(OUT, 'node_' + config.replace('/', '_') + '.sites.json');
    const hj = path.join(OUT, 'node_' + config.replace('/', '_') + '.harness.json');
    const env = Object.assign({}, process.env, { SIM_SEED: seed, SIM_RUNS: String(RUNS), SIM_RNG_SITES: out, SIM_HARNESS_JSON: hj }, modeEnv(mode));
    const r = spawnSync('node', [path.join(ROOT, 'test_runner.js')], { env, encoding: 'utf8', maxBuffer: 1 << 26 });
    fs.writeFileSync(path.join(OUT, 'node_' + config.replace('/', '_') + '.stdout.log'), (r.stdout || '') + (r.stderr || '') + 'exit=' + r.status + '\n');
    const parsed = parseRunnerOutput(r.stdout);   // 필드가 없거나 형식이 다르면 null(0 으로 바뀌지 않는다)
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    const hi = fs.existsSync(hj) ? JSON.parse(fs.readFileSync(hj, 'utf8')).harnessIntegrity : null;
    nodeStartState[config] = j.firstLifeRngState;
    return summarize('node', { lives: parsed.lives, lifeDigest: parsed.lifeDigest, rngCallDigest: parsed.rngCallDigest, rngCallsTotal: parsed.rngCallsTotal,
        tally: j.tally, integrity: hi, extra: { exit: r.status, spawnError: r.error ? String(r.error.message || r.error) : null, firstLifeRngState: j.firstLifeRngState, stackTraceLimit: j.stackTraceLimit, rows: j.rows.length, driverCoreSha256: j.driverCoreSha256, rngCoreSha256: sha(LIB.rng_core), sourceSha256: j.sourceSha256, siteCount: j.sites.length, unitCalls: j.tally.unit.calls, unitByCls: j.tally.unit.byCls } });
}

// F1 러너는 단위 시험 단계를 거친 뒤 주 루프를 돈다. 그래서 주 루프 시작 시점의 난수 상태는 시드만으로 정해지지 않는다.
// Chromium 측정은 같은 구성의 Node 실행이 기록한 "첫 생애 시작 시점의 난수 상태"에서 시작한다(값은 결과에 기록).
// 즉 이 비교는 "같은 시드"가 아니라 "같은 첫 생애 RNG 상태"에서 출발한 비교다.
const nodeStartState = {};
function startStateFor(config) {
    if (nodeStartState[config]) return nodeStartState[config];
    const [mode, seed] = config.split('/');
    const out = path.join(OUT, 'node_' + config.replace('/', '_') + '.startstate.json');
    const env = Object.assign({}, process.env, { SIM_SEED: seed, SIM_RUNS: '1', SIM_RNG_SITES: out }, modeEnv(mode));
    spawnSync('node', [path.join(ROOT, 'test_runner.js')], { env, encoding: 'utf8', maxBuffer: 1 << 26 });
    return (nodeStartState[config] = JSON.parse(fs.readFileSync(out, 'utf8')).firstLifeRngState);
}

function inlineParts(mode) {
    // index.html 의 <script src="X"></script> 를 같은 파일 내용의 인라인 스크립트로 바꾼다. 하네스와 모드 설정은 <head> 의 첫 스크립트로 넣는다.
    const html = read('index.html');
    const parts = [];
    let rest = html;
    const headAt = rest.indexOf('<head>');
    if (headAt < 0) throw new Error('index.html: <head> not found');
    parts.push({ kind: 'other', text: rest.slice(0, headAt + 6) + '\n<script>' });
    parts.push({ kind: 'other', text: Object.entries(modeGlobals(mode)).map(([k, v]) => 'window.' + k + ' = ' + JSON.stringify(v) + ';').join('') + '</script>\n<script>' });
    parts.push({ kind: 'harness', file: 'harness', text: harnessBody });
    parts.push({ kind: 'other', text: '</script>' });
    rest = rest.slice(headAt + 6);
    for (let i = 0; i < SOURCE_FILES.length; i++) {
        const tag = '<script src="' + SOURCE_FILES[i] + '"></script>';
        const at = rest.indexOf(tag);
        if (at < 0) throw new Error('index.html: script tag not found for ' + SOURCE_FILES[i]);
        parts.push({ kind: 'other', text: rest.slice(0, at) + '<script>' });
        parts.push({ kind: 'source', file: SOURCE_FILES[i], text: texts[i] });
        parts.push({ kind: 'other', text: '</script>' });
        rest = rest.slice(at + tag.length);
    }
    if (/<script\s+src=/.test(rest)) throw new Error('index.html: unexpected extra <script src>');
    parts.push({ kind: 'other', text: rest });
    return parts;
}

async function runChromium(load, config, browser) {
    const [mode, seed] = config.split('/');
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    const harnessSites = RngSites.buildSiteTable([{ area: 'harness', file: 'harness', text: harnessBody }]);
    const sites = RngSites.buildSiteTable(sourceSites()).concat(harnessSites);
    const cfg = { load, seed: Number(seed) >>> 0, startState: startStateFor(config), stackTraceLimit: STACK_LIMIT, maxActions: MAX_ACTIONS, sites, sourceFiles: SOURCE_FILES };
    let injected = harnessBody, asmInfo = null;
    if (load === 'file') {
        injected = harnessBody + '\n//# sourceURL=' + HARNESS_URL;
        // Playwright 의 addInitScript 는 소스를 함수로 감싸 줄 번호가 밀린다. 그래서 CDP 로 소스를 그대로 등록한다(줄·열이 주입 문자열과 정확히 같다. 보정 없음).
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Page.enable');
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: Object.entries(modeGlobals(mode)).map(([k, v]) => 'window.' + k + ' = ' + JSON.stringify(v) + ';').join('') });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: injected });
        await page.goto('file://' + ROOT + '/index.html');
        cfg.baseUrl = 'file://' + ROOT + '/'; cfg.harnessUrl = HARNESS_URL;
    } else {
        const asm = RngSites.buildAssembly(inlineParts(mode));
        const bad = RngSites.checkRows(asm.rows, asm.length);
        if (bad.length) throw new Error('inline segment table: ' + bad.join('; '));
        // setContent 로 넣으면 인라인 스크립트가 모두 <anonymous> 로 보여 어느 스크립트인지 구분할 수 없다.
        // 그래서 한 문서(HTML·JS)를 가짜 주소로 응답해 일반 문서로 읽힌다(네트워크 사용 없음). 스택에는 문서 주소와 문서 기준 줄·열이 나온다.
        const INLINE_URL = 'http://f1d4a.invalid/inline.html';
        await page.route('**/*', route => route.request().url() === INLINE_URL ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: asm.text }) : route.abort());
        await page.goto(INLINE_URL, { waitUntil: 'load' });
        cfg.docUrl = await page.evaluate(() => document.URL);
        cfg.asm = { length: asm.length, starts: asm.starts, rows: asm.rows };
        asmInfo = { rows: asm.rows.length, sourceRows: asm.rows.filter(r => r.kind === 'source').length, harnessRows: asm.rows.filter(r => r.kind === 'harness').length, documentSha256: sha(asm.text) };
    }
    const conf = await page.evaluate(c => window.__F1D4A.configure(c), cfg);
    if (!conf.mathRandomIsRecorder) throw new Error('Math.random is not the recorder');
    if (conf.preConfigCalls !== 0) throw new Error('Math.random was called before configuration: ' + conf.preConfigCalls);
    const pageSha = { driverChoose: sha(conf.sources.driverChoose), createRng: sha(conf.sources.createRng), expectDriver: sha(fnText(LIB.driver_core, 'driverChoose')), expectRng: sha(fnText(LIB.rng_core, 'createRng')) };
    pageSha.same = pageSha.driverChoose === pageSha.expectDriver && pageSha.createRng === pageSha.expectRng;   // 페이지에서 실제로 실행되는 함수 소스 = 공통 소스 파일의 함수 소스
    if (JSON.stringify(conf.rngState) !== JSON.stringify(cfg.startState)) throw new Error('rng start state mismatch');
    let done = 0, error = null;
    try { while (done < RUNS) { done = await page.evaluate(n => window.__F1D4A.runLives(n), Math.min(CHUNK, RUNS - done)); } } catch (e) { error = String(e && e.message || e).split('\n')[0]; }
    const rep = await page.evaluate(() => window.__F1D4A.report());
    await page.close();
    return summarize(load, Object.assign(rep, { extra: { error, pageErrors, asmInfo, pageSha, driverCoreSha256: sha(LIB.driver_core), rngCoreSha256: sha(LIB.rng_core), harnessSha256: sha(injected), siteCount: sites.length,
        startState: cfg.startState, mathRandomIsRecorder: rep.mathRandomIsRecorder, preConfigCalls: rep.preConfigCalls, progressHalted: rep.progressHalted, autoChecked: rep.autoChecked, sourceSha256: Object.fromEntries(SOURCE_FILES.map((f, i) => [f, sha(texts[i])])) } }));
}
// 소스 파일에서 함수 선언 본문을 그대로 잘라 낸다(페이지의 Function.prototype.toString 결과와 비교하기 위함)
function fnText(src, name) {
    const at = src.indexOf('function ' + name + '(');
    let depth = 0, i = src.indexOf('{', at);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
    return src.slice(at, i + 1);
}

(async () => {
    const result = { runs: RUNS, configs: CONFIGS, envs: ENVS, stackTraceLimit: STACK_LIMIT, node: process.version, rows: {} };
    let browser = null;
    if (ENVS.some(e => e !== 'node')) {
        const { chromium } = require('playwright');
        browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
        result.chromium = browser.version();
        try { result.playwright = require('playwright/package.json').version; } catch (e) { result.playwright = '?'; }
    }
    const statuses = [];
    for (const config of CONFIGS) {
        const row = result.rows[config] = {};
        for (const env of ['node', 'file', 'inline']) {
            if (ENVS.indexOf(env) < 0) { row[env] = { notRun: true }; continue; }   // 선택하지 않은 환경: 미실행으로 남는다(→ 그 구성은 PASS 가 될 수 없다)
            try { row[env] = env === 'node' ? runNode(config) : await runChromium(env, config, browser); }
            catch (e) { row[env] = { failed: true, error: String(e && e.stack || e).split('\n').slice(0, 4).join(' | ') }; }
        }
        row.verdict = configVerdict(row, RUNS);   // 최종 판정은 tests/lib/compare_verdict.js 한 곳. 필수 환경(node · file · inline)이 모두 실행돼야 PASS
        statuses.push(row.verdict.status);
        const label = row.verdict.status === 'PASS' ? 'OK      ' : row.verdict.status === 'PARTIAL' ? 'PARTIAL ' : 'FAIL    ';
        console.log(label + config + ': ' + REQUIRED_ENVS.map(e => e + '=' + (row[e].notRun ? '미실행' : row[e].failed ? '실패' : 'lives ' + row[e].lives + ' digest ' + row[e].lifeDigest + ' rng ' + row[e].rngCallDigest + ' UNKNOWN ' + row[e].unknownLives + ' seq ' + row[e].seqDigest)).join(' | ') + ' | 일치 ' + JSON.stringify(row.verdict.pairSame) + (row.verdict.status === 'PASS' ? '' : ' | 사유 ' + JSON.stringify(row.verdict.failures)));
        fs.writeFileSync(path.join(OUT, 'compare_' + ENVS.join('-') + '.json'), JSON.stringify(result, null, 1));
    }
    if (browser) await browser.close();
    const count = s => statuses.filter(x => x === s).length;
    const code = overallExitCode(statuses);
    result.overall = { pass: count('PASS'), partial: count('PARTIAL'), fail: count('FAIL'), exitCode: code, requiredEnvs: REQUIRED_ENVS, notRunEnvs: REQUIRED_ENVS.filter(e => ENVS.indexOf(e) < 0) };
    fs.writeFileSync(path.join(OUT, 'compare_' + ENVS.join('-') + '.json'), JSON.stringify(result, null, 1));
    // PASS 는 필수 환경 3개를 모두 실행한 구성만 센다. 일부 환경만 실행한 구성은 PARTIAL 이며 합격이 아니다(종료 코드 3).
    console.log('SUMMARY: PASS ' + count('PASS') + '/' + CONFIGS.length + ' · PARTIAL(부분 실행, 합격 아님) ' + count('PARTIAL') + ' · FAIL ' + count('FAIL') + ' (실행 환경: ' + ENVS.join(', ') + '; 미실행 환경: ' + (result.overall.notRunEnvs.join(', ') || '없음') + ') → ' + (code === 0 ? '완전 검수 통과' : code === 3 ? '부분 실행 — 완전 검수 아님' : '실패'));
    process.exitCode = code;
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
