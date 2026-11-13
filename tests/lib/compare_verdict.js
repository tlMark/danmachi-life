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
module.exports = { envFailures, pairSame, sortKeys, checkByCls, isPlainObject };
