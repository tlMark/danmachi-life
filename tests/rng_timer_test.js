// F1D4A P1 — 타이머 차이 시험 TM-1 · TM-2 · TM-3 (설계 r3.20 00_INDEX §4.1.4). 시험 하네스 전용, 게임 코드 변경 없음.
//   TM-1: 주 루프(자동 진행 꺼짐)는 타이머를 쓰지 않는다 → Node(동기 모의 타이머)와 Chromium(실제 타이머)의 사건 순서·지점별 RNG 순서열이 같아야 한다.
//   TM-2: 자동 진행 켬. Node 는 동기 중첩, Chromium 은 비동기 순차. 두 환경의 사건 순서열·지점 순서열(R2 포함)을 비교한다.
//         이 동일성은 기대값이지 전제가 아니다. 다르면 차이를 기록한다(판정은 결과 표기만, 종료 코드에 넣지 않음).
//   TM-2b: 자동 진행을 켠 러너(동기 중첩)에서 rollFamilia 계측(V8.v4.rollCalls · rollModes · rollModeByEvent)의 사건별 귀속이
//          F1 러너(호출 전에 lastShownEventId 를 기록하던 원래 방식)와 같은지 비교한다. F1 러너는 git 의 P0 기준선 커밋에서 꺼낸다.
//   TM-3: 정지(progressHalted) 뒤 남은 자동 진행 타이머가 Chromium 비동기 환경에서도 진행하지 않는다(stale_timer 진단만).
// 사용: node tests/rng_timer_test.js [lives=20] [seed=20261104]
// 기존 tests/browser_test.js 스모크 시험과는 별개다(대체하지 않음). Playwright 쪽 난수는 쓰지 않는다.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), os = require('os');
const { spawnSync } = require('child_process');
const RngSites = require('./lib/rng_sites.js');
const { makeDocument } = require('./lib/mock_dom.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const arg = (name, dflt) => { const a = process.argv.slice(2).find(x => x.startsWith(name + '=')); return a ? a.slice(name.length + 1) : dflt; };
const LIVES = Number(arg('lives', '20')), SEED = Number(arg('seed', '20261104')) >>> 0;
const SOURCE_FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
const texts = SOURCE_FILES.map(read);
const harnessBody = ['tests/lib/rng_core.js', 'tests/lib/rng_sites.js', 'tests/lib/commit_queue.js', 'tests/lib/driver_core.js', 'tests/lib/page_driver.js'].map(read).join('\n');
const sites = RngSites.buildSiteTable(SOURCE_FILES.map((file, i) => ({ area: 'source', file, text: texts[i] })).concat([{ area: 'harness', file: 'harness', text: harnessBody }]));
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) pass++; else fail++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail && !cond ? '  | ' + detail : '')); };
const info = text => console.log('INFO  ' + text);
const baseCfg = { seed: SEED, stackTraceLimit: 50, maxActions: 3000, sites, sourceFiles: SOURCE_FILES, keepIds: true };

// ── Node 어댑터: 모의 DOM + 동기 setTimeout. 게임 소스 9개 + 같은 하네스 소스를 한 VM 스크립트로 실행한다(러너와 같은 조립 방식). ──
function nodeEnv() {
    const VM_FILE = 'f1d4a-timer-vm.js';
    const asm = RngSites.buildAssembly(RngSites.buildNodeVmParts(SOURCE_FILES, texts, '\n;\n', '\n', harnessBody, 'harness'));
    const document = makeDocument();
    const timers = { calls: 0 };
    const sandbox = { console, Math: Object.create(Math), document, window: { scrollTo() {} }, Error,
        setTimeout(callback) { timers.calls += 1; if (typeof callback === 'function') callback(); return 0; }, clearTimeout() {},
        Number, String, Boolean, Array, Object, Set, Map, Date, JSON, Intl };
    const context = vm.createContext(sandbox);
    new vm.Script(asm.text, { filename: VM_FILE }).runInContext(context);
    const H = sandbox.window.__F1D4A;
    const conf = H.configure(Object.assign({}, baseCfg, { load: 'vm', docUrl: VM_FILE, asm: { length: asm.length, starts: asm.starts, rows: asm.rows } }));
    return { H, context, document, timers, conf, run: code => vm.runInContext(code, context) };
}

async function chromiumPage(browser, timerCapMs) {
    const page = await browser.newPage();
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    // 시험 속도용 타이머 단축(게임 코드 변경 아님)과 타이머 호출 수 계수
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: '(function(){ const st = window.setTimeout; window.__timerCalls = 0; window.setTimeout = function (f, ms) { window.__timerCalls += 1; return st.apply(window, [f, Math.min(ms || 0, ' + timerCapMs + ')].concat([].slice.call(arguments, 2))); }; })();' });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: harnessBody + '\n//# sourceURL=f1d4a-harness.js' });
    await page.goto('file://' + ROOT + '/index.html');
    const conf = await page.evaluate(c => window.__F1D4A.configure(c), Object.assign({}, baseCfg, { load: 'file', baseUrl: 'file://' + ROOT + '/', harnessUrl: 'f1d4a-harness.js' }));
    return { page, conf, pageErrors };
}

(async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    let pw = '?'; try { pw = require('playwright/package.json').version; } catch (e) {}
    console.log('ENV  chromium=' + browser.version() + ' playwright=' + pw + ' node=' + process.version + ' load=file:// seed=' + SEED + ' lives=' + LIVES + ' harnessSha256=' + sha(harnessBody).slice(0, 16));

    // ── TM-1: 자동 진행 꺼짐 ─────────────────────────────────────────────────────────────
    {
        const n = nodeEnv();
        // Node 모의 DOM 은 children 대신 kids 를 쓴다. 공통 드라이버의 버튼 선택(driverChoose)은 같고, 버튼 수집만 어댑터가 한다.
        const nodeLives = [];
        for (let i = 0; i < LIVES; i++) {
            n.H.beginLife(); n.run('startLife()');
            let actions = 0;
            while (!n.run('S.cause') && actions < 3000) {
                n.context.__usable = (n.document.getElementById('choices').kids || []).filter(b => typeof b.onclick === 'function');
                n.run('(function () { const pick = driverChoose(__usable, S.pendingFollowup); if (pick.kind === "error") throw new Error(pick.message); pick.button.onclick(); })()');
                actions += 1;
            }
            nodeLives.push(n.H.finishLife());
        }
        const c = await chromiumPage(browser, 1);
        const chromeLives = await c.page.evaluate(lives => {
            const H = window.__F1D4A, out = [];
            for (let i = 0; i < lives; i++) {
                H.beginLife(); startLife();
                let actions = 0;
                while (!S.cause && actions < 3000) {
                    const usable = Array.from(document.getElementById('choices').children).filter(b => typeof b.onclick === 'function');
                    const pick = driverChoose(usable, S.pendingFollowup); if (pick.kind === 'error') throw new Error(pick.message);
                    pick.button.onclick(); actions += 1;
                }
                out.push(H.finishLife());
            }
            return { out, timerCalls: window.__timerCalls, report: H.report() };
        }, LIVES);
        const same = k => nodeLives.every((l, i) => JSON.stringify(l[k]) === JSON.stringify(chromeLives.out[i][k]));
        check('TM-1 주 루프(자동 진행 꺼짐)는 타이머를 쓰지 않음: setTimeout 호출 Node 0 · Chromium 0', n.timers.calls === 0 && chromeLives.timerCalls === 0, n.timers.calls + ' / ' + chromeLives.timerCalls);
        check('TM-1 생애별 사건 id 순서열이 Node 와 Chromium 에서 같음(' + LIVES + '생애)', same('events'));
        check('TM-1 생애별 지점 id 순서열(R1·R3·R4·R5·HARNESS)이 같음', same('siteIds') && nodeLives.every(l => l.siteIds && l.siteIds.length === l.calls));
        check('TM-1 생애별 최종 상태 요약·RNG 호출 수가 같음', same('summary') && same('calls'));
        check('TM-1 두 환경 모두 UNKNOWN 0, 반영 큐 경계 정상, 페이지 오류 0', !(n.H.report().tally.lives.byCls.UNKNOWN) && !(chromeLives.report.tally.lives.byCls.UNKNOWN) && nodeLives.every(l => l.boundaryOk) && chromeLives.out.every(l => l.boundaryOk) && c.pageErrors.length === 0, JSON.stringify(c.pageErrors));
        check('TM-1 두 환경에서 실행된 driverChoose · createRng 소스가 같음', JSON.stringify(n.conf.sources) === JSON.stringify(c.conf.sources));
        info('TM-1 호출 수 합계 ' + nodeLives.reduce((a, l) => a + l.calls, 0) + ', 사건 수 합계 ' + nodeLives.reduce((a, l) => a + l.events.length, 0));
        await c.page.close();
    }
    // ── TM-2: 자동 진행 켬 ───────────────────────────────────────────────────────────────
    {
        const n = nodeEnv();
        n.document.getElementById('auto').checked = true;
        const nodeLives = [];
        for (let i = 0; i < LIVES; i++) { n.H.beginLife(); n.run('startLife()'); if (!n.run('S.cause')) throw new Error('TM-2 Node: life did not finish synchronously'); nodeLives.push(n.H.finishLife()); }
        const c = await chromiumPage(browser, 0);
        await c.page.evaluate(() => { document.getElementById('auto').checked = true; });
        const chromeLives = [];
        for (let i = 0; i < LIVES; i++) {
            await c.page.evaluate(() => { window.__F1D4A.beginLife(); startLife(); });
            await c.page.waitForFunction(() => !!S.cause && autoTimers.length === 0, null, { timeout: 120000 });
            chromeLives.push(await c.page.evaluate(() => window.__F1D4A.finishLife()));
        }
        const rep = await c.page.evaluate(() => window.__F1D4A.report());
        const diffAt = k => nodeLives.findIndex((l, i) => JSON.stringify(l[k]) !== JSON.stringify(chromeLives[i][k]));
        const r2 = l => l.siteIds.filter(id => id === 'script.js:showEvent:random#1').length;
        check('TM-2 두 환경 모두 생애 ' + LIVES + '개가 끝까지 진행(Node 동기 중첩 / Chromium 비동기 순차), UNKNOWN 0, 반영 큐 경계 정상', nodeLives.length === LIVES && chromeLives.length === LIVES && !(n.H.report().tally.lives.byCls.UNKNOWN) && !(rep.tally.lives.byCls.UNKNOWN) && nodeLives.every(l => l.boundaryOk) && chromeLives.every(l => l.boundaryOk) && c.pageErrors.length === 0, JSON.stringify([rep.tally.lives.byCls, c.pageErrors]));
        check('TM-2 자동 진행의 버튼 선택은 R2(script.js showEvent 콜백)로 분류되고 HARNESS 는 0', nodeLives.every(l => r2(l) > 0 || l.events.length === 0) && !(n.H.report().tally.lives.byCls.HARNESS) && !(rep.tally.lives.byCls.HARNESS) && rep.tally.lives.byCls.R2 > 0);
        check('TM-2 Node: 동기 중첩에서도 사건 순서가 발급 순번대로 반영됨(사건 수 = 반영 수)', n.H.report().integrity.broken === false && n.H.report().integrity.committed === nodeLives.reduce((a, l) => a + l.events.length, 0));
        const dE = diffAt('events'), dS = diffAt('siteIds'), dF = diffAt('summary');
        info('TM-2 비교 결과(기대값이지 전제가 아님): 사건 id 순서열 ' + (dE < 0 ? '동일' : '다름(첫 차이 생애 ' + (dE + 1) + ')') + ' · 지점 id 순서열 ' + (dS < 0 ? '동일' : '다름(첫 차이 생애 ' + (dS + 1) + ')') + ' · 최종 상태 요약 ' + (dF < 0 ? '동일' : '다름(첫 차이 생애 ' + (dF + 1) + ')'));
        if (dS >= 0) { const a = nodeLives[dS].siteIds, b = chromeLives[dS].siteIds; let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; info('TM-2 첫 차이: 생애 ' + (dS + 1) + ' 의 ' + (k + 1) + '번째 호출 — Node ' + a[k] + ' / Chromium ' + b[k] + ' (길이 ' + a.length + ' / ' + b.length + ')'); }
        info('TM-2 R2 호출 수 Node ' + nodeLives.reduce((a, l) => a + r2(l), 0) + ' / Chromium ' + chromeLives.reduce((a, l) => a + r2(l), 0) + ', Chromium setTimeout 호출 ' + (await c.page.evaluate(() => window.__timerCalls)));
        await c.page.close();
    }
    // ── TM-2b: 중첩 자동 진행에서 rollFamilia 계측의 사건 귀속(러너, Node) ───────────────────
    {
        const F1_COMMIT = '61f5d63f99315d99a3ffd1f9ca37bf4d23b9ba2b';   // P0 기준선(F1 그대로)
        const g = spawnSync('git', ['-C', ROOT, 'show', F1_COMMIT + ':test_runner.js'], { encoding: 'utf8', maxBuffer: 1 << 26 });
        if (g.status !== 0 || !g.stdout) { check('TM-2b F1 러너를 git 에서 꺼냄(꺼내지 못하면 미실행 — 통과로 치지 않음)', false, 'git show 실패: ' + String(g.stderr || g.error).slice(0, 120)); }
        else {
            const NEEDLE = '            startLife();\n            let actions = 0;';
            const AUTO = "            $('auto').checked = true;   /* TM-2b: 자동 진행 켬(임시 사본에서만) */\n" + NEEDLE;
            const cur = read('test_runner.js');
            const mk = (runnerSrc, mutate) => {
                if (runnerSrc.split(NEEDLE).length !== 2) throw new Error('TM-2b: 주 루프 startLife 위치가 1곳이 아님');
                const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm2b-'));
                const cp = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { if (['logs', 'archive', 'node_modules', '.git'].includes(e.name)) continue; const s = path.join(a, e.name), d = path.join(b, e.name); e.isDirectory() ? cp(s, d) : fs.copyFileSync(s, d); } };
                cp(ROOT, dir);
                let src = runnerSrc.replace(NEEDLE, AUTO); if (mutate) src = mutate(src);
                fs.writeFileSync(path.join(dir, 'test_runner.js'), src);
                const r = spawnSync('node', [path.join(dir, 'test_runner.js')], { env: Object.assign({}, process.env, { SIM_RUNS: '400', SIM_SEED: String(SEED), FORCE_COLOR: '0', NO_COLOR: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 });
                fs.rmSync(dir, { recursive: true, force: true });
                const v = JSON.parse(((r.stdout || '').match(/^v178:\s*(\{.*\})\s*$/m) || [])[1] || 'null');
                return { status: r.status, out: r.stdout || '', v, lifeDigest: ((r.stdout || '').match(/^lifeDigest:\s*(\S+)/m) || [])[1], completed: ((r.stdout || '').match(/^completed:\s*(\d+)/m) || [])[1] };
            };
            const f1 = mk(g.stdout), now = mk(cur);
            const CTX = "            const ev = (activeShowEventContext.length ? activeShowEventContext[activeShowEventContext.length - 1] : lastShownEventId) || '(no-event)';";
            const mutant = mk(cur, src => { if (src.split(CTX).length !== 2) throw new Error('TM-2b: 변이 대상 문장이 1개가 아님'); return src.replace(CTX, "            const ev = lastShownEventId || '(no-event)';   /* MUTATION: 활성 사건 스택 미사용 */"); });
            // 세 러너(F1 · 현재 · 변이)에 같은 유효성 검사를 적용한다. 실행 실패·계측 자료 누락은 "변이 검출"이 아니라 시험 실패다.
            const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
            const tallyOk = o => plain(o) && Object.keys(o).length > 0 && Object.values(o).every(n => typeof n === 'number' && Number.isInteger(n) && n > 0);   // 배열 불가, 모든 카운트는 양의 정수
            const sumOf = o => Object.values(o).reduce((a, b) => a + b, 0);
            const parts = x => (x.v && plain(x.v.v4)) ? { rollCalls: x.v.v4.rollCalls, rollModes: x.v.rollModes, rollModeByEvent: x.v.rollModeByEvent } : { rollCalls: null, rollModes: null, rollModeByEvent: null };
            const rolls = x => tallyOk(parts(x).rollCalls) ? sumOf(parts(x).rollCalls) : null;   // rollFamilia 계측 호출 수(계측 1회마다 세 집계에 1씩 들어간다)
            const digestOk = x => typeof x.lifeDigest === 'string' && /^\d+$/.test(x.lifeDigest) && Number(x.lifeDigest) <= 0xFFFFFFFF;
            const why = x => { const p = parts(x), bad = [];
                if (x.status !== 0) bad.push('exit:' + x.status);
                if (x.completed !== '400') bad.push('completed:' + x.completed);
                if (!digestOk(x)) bad.push('lifeDigest:' + x.lifeDigest);
                for (const k of ['rollCalls', 'rollModes', 'rollModeByEvent']) if (!tallyOk(p[k])) bad.push(k + '-invalid');
                if (bad.length === 0) { const n = sumOf(p.rollCalls); if (!(n > 0)) bad.push('no-roll-calls'); if (sumOf(p.rollModes) !== n) bad.push('rollModes-sum:' + sumOf(p.rollModes) + '/' + n); if (sumOf(p.rollModeByEvent) !== n) bad.push('rollModeByEvent-sum:' + sumOf(p.rollModeByEvent) + '/' + n); }
                return bad; };
            const valid = x => why(x).length === 0;
            const J = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
            check('TM-2b 실행 유효성(F1 러너): 종료 코드 0 · 400생애 완주 · lifeDigest 유효 · 세 집계(rollCalls · rollModes · rollModeByEvent) 객체·양의 정수·합계 = rollFamilia 호출 수', valid(f1), JSON.stringify(why(f1)));
            check('TM-2b 실행 유효성(현재 러너): 같은 조건', valid(now), JSON.stringify(why(now)));
            check('TM-2b 실행 유효성(변이 러너): 같은 조건 — 실행 실패·자료 누락은 변이 검출로 인정하지 않음', valid(mutant), JSON.stringify(why(mutant)));
            const allValid = valid(f1) && valid(now) && valid(mutant);
            check('TM-2b 사건별 귀속: 현재 러너의 rollCalls · rollModes · rollModeByEvent 가 F1 러너와 같음', allValid && J(parts(f1).rollCalls) === J(parts(now).rollCalls) && J(parts(f1).rollModes) === J(parts(now).rollModes) && J(parts(f1).rollModeByEvent) === J(parts(now).rollModeByEvent));
            check('TM-2b 자동 진행 러너의 출력 전체(lifeDigest · 사건 집계 포함)가 F1 러너와 같음', allValid && f1.out === now.out && f1.lifeDigest === now.lifeDigest);
            check('TM-2b 변이 전제: 세 러너의 rollFamilia 호출 수 · lifeDigest · rollModes 가 같음(차이가 사건 귀속에서만 나야 함)', allValid && rolls(mutant) === rolls(f1) && rolls(now) === rolls(f1) && mutant.lifeDigest === f1.lifeDigest && J(parts(mutant).rollModes) === J(parts(f1).rollModes));
            check('TM-2b 변이: 활성 사건 스택을 쓰지 않으면 사건별 귀속(rollCalls 와 rollModeByEvent 둘 다)이 F1 과 달라짐 — 시험이 결함을 잡음', allValid && rolls(mutant) === rolls(f1) && mutant.lifeDigest === f1.lifeDigest && J(parts(mutant).rollModes) === J(parts(f1).rollModes) && J(parts(mutant).rollCalls) !== J(parts(f1).rollCalls) && J(parts(mutant).rollModeByEvent) !== J(parts(f1).rollModeByEvent));
            {   // 유효성 검사 자체의 변이: 자료가 빠지거나 형식이 틀린 결과는 유효하지 않다고 판정해야 한다
                const clone = () => JSON.parse(JSON.stringify({ status: f1.status, completed: f1.completed, lifeDigest: f1.lifeDigest, v: f1.v }));
                const broken = [x => { x.status = 1; }, x => { x.status = null; }, x => { x.completed = '399'; }, x => { x.lifeDigest = undefined; }, x => { x.lifeDigest = 'INVALID(harness integrity error)'; }, x => { x.v = null; },
                    x => { delete x.v.rollModeByEvent; }, x => { x.v.rollModeByEvent = []; }, x => { x.v.rollModes = {}; }, x => { x.v.v4.rollCalls = [1, 2]; }, x => { const k = Object.keys(x.v.rollModes)[0]; x.v.rollModes[k] = String(x.v.rollModes[k]); },
                    x => { const k = Object.keys(x.v.v4.rollCalls)[0]; x.v.v4.rollCalls[k] = 0; }, x => { const k = Object.keys(x.v.rollModeByEvent)[0]; x.v.rollModeByEvent[k] += 1; }, x => { const k = Object.keys(x.v.rollModes)[0]; x.v.rollModes[k] -= 1; x.v.rollModes.extra = -1; }];
                check('TM-2b 유효성 검사의 변이 ' + broken.length + '종(종료 코드 · 완주 수 · lifeDigest 누락/비숫자 · 계측 누락 · 배열 · 빈 객체 · 문자열/0/음수 카운트 · 합계 불일치)을 모두 무효로 판정', valid(clone()) && broken.every(f => { const x = clone(); f(x); return !valid(x); }));
            }
            info('TM-2b rollFamilia 계측 호출 수 F1 ' + rolls(f1) + ' / 현재 ' + rolls(now) + ' / 변이 ' + rolls(mutant) + ', lifeDigest(자동 진행 400생애) ' + f1.lifeDigest + ' / ' + now.lifeDigest + ' / ' + mutant.lifeDigest);
        }
    }
    // ── TM-3: 정지 뒤 남은 타이머 ────────────────────────────────────────────────────────
    {
        const c = await chromiumPage(browser, 30);
        await c.page.evaluate(() => { document.getElementById('auto').checked = true; });
        const before = await c.page.evaluate(() => {
            const H = window.__F1D4A; H.beginLife(); startLife();          // 첫 사건이 표시되고 자동 진행 타이머가 예약된 상태
            const snap = { pendingTimers: autoTimers.length, age: S.age, phase: S.phase, calls: H.rngCalls(), diag: followupDiagLog.length, cause: S.cause || null, state: JSON.stringify(S) };
            progressHalted = true;                                           // 합성 상태 주입: 예외 후 정지 상태와 같은 플래그
            return snap;
        });
        await c.page.waitForTimeout(400);                                    // 타이머 상한 30ms 의 10배 이상
        const after = await c.page.evaluate(() => ({ pendingTimers: autoTimers.length, age: S.age, phase: S.phase, calls: window.__F1D4A.rngCalls(), cause: S.cause || null, state: JSON.stringify(S), halted: progressHalted }));
        const newDiag = (await c.page.evaluate(n => followupDiagLog.slice(n).map(d => d.event), before.diag));
        check('TM-3 전제: 정지 시점에 자동 진행 타이머가 1개 이상 예약되어 있음(합성 상태 주입)', before.pendingTimers >= 1 && before.cause === null, JSON.stringify(before.pendingTimers));
        check('TM-3 정지 뒤 타이머가 실행돼도 진행 0: 나이·상태 전체·난수 호출 수 불변, 생애 미종료', after.age === before.age && after.state === before.state && after.calls === before.calls && after.cause === null && after.halted === true);
        check('TM-3 남은 타이머는 stale_timer 진단만 남김(다른 진단 없음), 예약 목록은 비워짐', newDiag.length >= 1 && newDiag.every(e => e === 'stale_timer') && after.pendingTimers === 0, JSON.stringify(newDiag));
        // 정지 해제는 새 게임(startLife)에서만: 새 생애가 정상적으로 끝까지 진행하는지 확인
        await c.page.evaluate(() => { window.__F1D4A.finishLife(); window.__F1D4A.beginLife(); startLife(); });
        await c.page.waitForFunction(() => !!S.cause && autoTimers.length === 0, null, { timeout: 120000 });
        const next = await c.page.evaluate(() => ({ halted: progressHalted, rec: window.__F1D4A.finishLife(), unknown: window.__F1D4A.report().tally.lives.byCls.UNKNOWN || 0 }));
        check('TM-3 새 게임(startLife) 뒤에는 정지가 풀리고 생애가 끝까지 진행(UNKNOWN 0), 페이지 오류 0', next.halted === false && next.rec.events.length > 0 && next.unknown === 0 && c.pageErrors.length === 0, JSON.stringify(c.pageErrors));
        await c.page.close();
    }
    await browser.close();
    console.log((fail ? 'RESULT: FAIL ' : 'RESULT: PASS ') + pass + '/' + (pass + fail) + ' (rng_timer_test)');
    process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
