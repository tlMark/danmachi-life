// F1D4A P1 — 세 환경 비교의 합격 판정(tests/rng_sites_compare.js 가 쓴다). 시험 하네스 전용.
// 한 환경의 결과 요약(row)을 받아 실패 사유 목록을 돌려준다. 빈 배열이어야 합격이다. 값이 없거나 형식이 다르면 실패로 본다(빠진 것을 통과시키지 않는다).
'use strict';
const isUint32 = n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xFFFFFFFF;
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
    if (row.unknownLives !== 0) bad.push('unknown-lives:' + row.unknownLives);
    if (!row.byId || typeof row.byId !== 'object' || Object.keys(row.byId).length === 0) bad.push('byId-missing');
    const it = row.integrity;
    if (!it || typeof it !== 'object') bad.push('integrity-missing');
    else {
        if (it.broken !== false) bad.push('integrity-broken');
        if (!(Number.isInteger(it.issued) && Number.isInteger(it.committed) && Number.isInteger(it.discarded) && it.issued > 0 && it.issued === it.committed + it.discarded)) bad.push('integrity-count:' + it.issued + '/' + it.committed + '/' + it.discarded);
    }
    if (x && typeof x === 'object') {
        if (env === 'node') {
            if (x.spawnError) bad.push('spawn-error:' + x.spawnError);
            if (x.exit === null || x.exit === undefined) bad.push('exit-missing');
            else if (x.exit !== 0) bad.push('exit:' + x.exit);
            if (row.unknownUnit !== 0) bad.push('unknown-unit:' + row.unknownUnit);
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
module.exports = { envFailures, pairSame, sortKeys };
