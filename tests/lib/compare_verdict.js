// F1D4A P1 — 세 환경 비교의 합격 판정(tests/rng_sites_compare.js 가 쓴다). 시험 하네스 전용.
// 한 환경의 결과 요약(row)을 받아 실패 사유 목록을 돌려준다. 빈 배열이어야 합격이다. 값이 없거나 형식이 다르면 실패로 본다(빠진 것을 통과시키지 않는다).
'use strict';
const isUint32 = n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xFFFFFFFF;
const isPlainObject = o => !!o && typeof o === 'object' && !Array.isArray(o);
const nonNegInt = n => typeof n === 'number' && Number.isInteger(n) && n >= 0;
// 분류별 집계(byCls) 검사. 배열이 아닌 객체, 모든 값이 0 이상의 정수, 합계 = expectedSum.
// UNKNOWN 은 항목이 없으면 0 으로 보지만, 항목이 있는데 형식이 잘못됐으면(null · NaN · 문자열 등) 실패다.
// 반환: { problems: [...], unknown: 숫자 | null }
function checkByCls(byCls, expectedSum, label, requireNonEmpty) {
    const problems = [];
    if (!isPlainObject(byCls)) return { problems: [label + '-missing'], unknown: null };
    const keys = Object.keys(byCls);
    if (requireNonEmpty && keys.length === 0) problems.push(label + '-empty');
    let sum = 0, valuesOk = true;
    for (const k of keys) { if (!nonNegInt(byCls[k])) { valuesOk = false; break; } sum += byCls[k]; }
    if (!valuesOk) problems.push(label + '-value-invalid');
    else if (!nonNegInt(expectedSum) || sum !== expectedSum) problems.push(label + '-sum!=calls:' + sum + '/' + expectedSum);
    let unknown = 0;
    if (Object.prototype.hasOwnProperty.call(byCls, 'UNKNOWN')) { unknown = nonNegInt(byCls.UNKNOWN) ? byCls.UNKNOWN : null; if (unknown === null) problems.push(label + '-UNKNOWN-invalid'); }
    return { problems, unknown };
}
function envFailures(env, row, runs) {
    const bad = [];
    if (!row || typeof row !== 'object') return ['no-result'];
    if (row.notRun) return ['not-run'];
    if (row.failed) return ['failed:' + String(row.error || '').slice(0, 80)];
    const x = row.extra;
    if (!x || typeof x !== 'object') bad.push('extra-missing');
    if (!(Number.isInteger(row.lives) && row.lives === runs)) bad.push('lives:' + row.lives);
    if (!isUint32(row.lifeDigest)) bad.push('lifeDigest-invalid:' + row.lifeDigest);
    if (!isUint32(row.rngCallDigest)) bad.push('rngCallDigest-invalid:' + row.rngCallDigest);
    if (!isUint32(row.seqDigest)) bad.push('seqDigest-invalid:' + row.seqDigest);
    if (!(Number.isInteger(row.rngCallsTotal) && row.rngCallsTotal > 0)) bad.push('rngCallsTotal-invalid:' + row.rngCallsTotal);
    if (!(Number.isInteger(row.siteCalls) && row.siteCalls === row.rngCallsTotal)) bad.push('siteCalls!=rngCallsTotal:' + row.siteCalls + '/' + row.rngCallsTotal);
    // 분류별 집계: 생애 구간(byCls, 합계 = siteCalls)과 생애 밖 구간(unitByCls, 합계 = unitCalls). 세 환경 공통.
    const lifeCls = checkByCls(row.byCls, row.siteCalls, 'byCls', true);
    for (const p of lifeCls.problems) bad.push(p);
    if (lifeCls.unknown !== 0) bad.push('unknown-lives:' + lifeCls.unknown);                      // 생애 구간 UNKNOWN(집계에서 직접 읽는다)
    if (!nonNegInt(row.unitCalls)) bad.push('unitCalls-invalid:' + row.unitCalls);
    const unitCls = checkByCls(row.unitByCls, row.unitCalls, 'unitByCls', nonNegInt(row.unitCalls) && row.unitCalls > 0);
    for (const p of unitCls.problems) bad.push(p);
    if (unitCls.unknown !== 0) bad.push('unknown-unit:' + unitCls.unknown);                       // 생애 밖(단위 시험·설정 단계) 구간 UNKNOWN
    // 요약에 적힌 UNKNOWN 수는 집계에서 읽은 값과 같아야 한다(요약 단계의 값 변환으로 가려지지 않게)
    if (row.unknownLives !== lifeCls.unknown) bad.push('unknownLives-mismatch:' + row.unknownLives);
    if (row.unknownUnit !== unitCls.unknown) bad.push('unknownUnit-mismatch:' + row.unknownUnit);
    // 지점 id 별 호출 수: 객체여야 하고, 비어 있지 않고, 값은 모두 양의 정수이며, 합계가 siteCalls 와 같아야 한다
    if (!row.byId || typeof row.byId !== 'object' || Array.isArray(row.byId) || Object.keys(row.byId).length === 0) bad.push('byId-missing');
    else {
        let sum = 0, okValues = true;
        for (const k of Object.keys(row.byId)) { const v = row.byId[k]; if (!(typeof v === 'number' && Number.isInteger(v) && v > 0)) { okValues = false; break; } sum += v; }
        if (!okValues) bad.push('byId-value-invalid');
        else if (sum !== row.siteCalls) bad.push('byId-sum!=siteCalls:' + sum + '/' + row.siteCalls);
    }
    const it = row.integrity;
    if (!it || typeof it !== 'object') bad.push('integrity-missing');
    else {
        if (it.broken !== false) bad.push('integrity-broken');
        // 세 계수 모두 0 이상의 정수
        if (!(nonNegInt(it.issued) && nonNegInt(it.committed) && nonNegInt(it.discarded) && it.issued > 0 && it.issued === it.committed + it.discarded)) bad.push('integrity-count:' + it.issued + '/' + it.committed + '/' + it.discarded);
    }
    if (x && typeof x === 'object') {
        if (env === 'node') {
            if (x.spawnError) bad.push('spawn-error:' + x.spawnError);
            if (x.exit === null || x.exit === undefined) bad.push('exit-missing');
            else if (x.exit !== 0) bad.push('exit:' + x.exit);
        } else {
            if (x.error) bad.push('run-error:' + String(x.error).slice(0, 80));
            if (!Array.isArray(x.pageErrors)) bad.push('pageErrors-missing');
            else if (x.pageErrors.length !== 0) bad.push('page-errors:' + x.pageErrors.length);
            if (!x.pageSha || x.pageSha.same !== true) bad.push('page-source-hash');
            if (x.mathRandomIsRecorder !== true) bad.push('math-random-not-recorder');
            if (x.preConfigCalls !== 0) bad.push('pre-config-calls:' + x.preConfigCalls);
            if (x.progressHalted !== false) bad.push('progress-halted');
        }
    }
    return bad;
}
const sortKeys = o => { const r = {}; for (const k of Object.keys(o || {}).sort()) r[k] = o[k]; return r; };
// 두 환경의 결과가 같은지: lifeDigest · rngCallDigest · 지점 순서열 해시 · 지점 id 별 호출 수
function pairSame(a, b) {
    return !!a && !!b && a.lifeDigest === b.lifeDigest && a.rngCallDigest === b.rngCallDigest && a.seqDigest === b.seqDigest && JSON.stringify(sortKeys(a.byId)) === JSON.stringify(sortKeys(b.byId));
}
// ── 구성 하나의 최종 판정 ────────────────────────────────────────────────────────────────
// 완전 검수의 필수 환경. 셋 모두 실행되고, 각각 실패 사유가 없고, 세 쌍이 모두 일치해야 PASS 다.
const REQUIRED_ENVS = ['node', 'file', 'inline'];
// 반환: { status: 'PASS' | 'PARTIAL' | 'FAIL', missing: [...], failures: { env: [...] }, pairSame: { 'a=b': bool } }
//   PASS    — 필수 환경 3개가 모두 실행됐고 실패 사유 0, 세 쌍(node=file, node=inline, file=inline) 모두 일치
//   PARTIAL — 필수 환경 일부가 미실행(notRun)이지만, 실행한 환경에는 실패 사유가 없고 실행한 쌍은 일치. **합격이 아니다**(진단용 부분 실행)
//   FAIL    — 그 밖의 모든 경우(실행 실패, 실패 사유 있음, 불일치, 결과 객체 누락, 실행한 환경 0개)
function configVerdict(row, runs) {
    const out = { status: 'FAIL', missing: [], failures: {}, pairSame: {} };
    if (!isPlainObject(row)) { out.failures._row = ['row-missing']; return out; }
    const ran = [];
    let objectMissing = false;
    for (const e of REQUIRED_ENVS) {
        const r = row[e];
        if (!isPlainObject(r)) { out.missing.push(e); out.failures[e] = ['no-result']; objectMissing = true; continue; }   // 결과 객체 자체가 없으면 미실행이 아니라 실패
        if (r.notRun === true) { out.missing.push(e); out.failures[e] = ['not-run']; continue; }
        ran.push(e);
        out.failures[e] = envFailures(e, r, runs);
    }
    for (let i = 0; i < ran.length; i++) for (let k = i + 1; k < ran.length; k++) out.pairSame[ran[i] + '=' + ran[k]] = pairSame(row[ran[i]], row[ran[k]]);
    const ranOk = ran.length > 0 && ran.every(e => out.failures[e].length === 0) && Object.values(out.pairSame).every(v => v === true);
    if (objectMissing || !ranOk) return out;                                   // FAIL
    if (out.missing.length > 0) { out.status = 'PARTIAL'; return out; }        // 일부 환경만 실행 — 합격 아님
    const pairs = Object.keys(out.pairSame);
    if (ran.length === REQUIRED_ENVS.length && pairs.length === 3 && pairs.every(k => out.pairSame[k] === true)) out.status = 'PASS';
    return out;
}
// 전체 실행의 종료 코드: 모든 구성이 PASS 일 때만 0. FAIL 이 하나라도 있으면 1, FAIL 은 없지만 PARTIAL 이 있으면 3(부분 실행 — 합격 아님).
function overallExitCode(statuses) {
    if (!Array.isArray(statuses) || statuses.length === 0) return 1;
    if (statuses.some(s => s !== 'PASS' && s !== 'PARTIAL')) return 1;
    return statuses.some(s => s === 'PARTIAL') ? 3 : 0;
}
// ── 러너 표준 출력 파서 ──────────────────────────────────────────────────────────────────
// 필드가 없거나 형식이 다르면 null 을 돌려준다(Number(null) === 0 같은 변환으로 누락이 0 이 되지 않게). 실제 값 0 은 0 으로 돌려준다.
function parseUintField(text, re, max) {
    const m = typeof text === 'string' ? text.match(re) : null;
    if (!m || typeof m[1] !== 'string' || !/^\d+$/.test(m[1])) return null;
    const n = Number(m[1]);
    return Number.isSafeInteger(n) && n <= max ? n : null;
}
function parseRunnerOutput(stdout) {
    return {
        lives: parseUintField(stdout, /^completed:[ \t]*(\d+)[ \t]*$/m, Number.MAX_SAFE_INTEGER),
        lifeDigest: parseUintField(stdout, /^lifeDigest:[ \t]*(\d+)[ \t]*$/m, 0xFFFFFFFF),
        rngCallDigest: parseUintField(stdout, /"rngCallDigest":(\d+)[,}]/, 0xFFFFFFFF),
        rngCallsTotal: parseUintField(stdout, /"rngCallsTotal":(\d+)[,}]/, Number.MAX_SAFE_INTEGER)
    };
}
module.exports = { envFailures, pairSame, sortKeys, checkByCls, isPlainObject, REQUIRED_ENVS, configVerdict, overallExitCode, parseUintField, parseRunnerOutput };
