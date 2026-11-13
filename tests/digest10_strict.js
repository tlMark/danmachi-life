// F1D4A P1 — 10구성 digest 엄격 대조(시험 전용). F1 의 logs/v178_f1/tools/digest10.js 는 lifeDigest 만 비교하고 불일치를 종료 코드에 반영하지 않는다.
// 이 스크립트는 그 도구가 쓴 결과 JSON 을 F1 기록(logs/v178_f1/digest10_vs_s3.json)과 대조한다:
//   구성 10개가 모두 있고, 구성마다 lifeDigest · rngCallDigest 가 숫자 문자열이며 F1 기록과 같고, 종료 코드 0 · 3000생애 완주 · 불변식 통과.
// 사용: node tests/digest10_strict.js <이번 실행 json> [F1 기록 json]   (하나라도 어긋나면 종료 코드 1)
'use strict';
const fs = require('fs'), path = require('path');
const EXPECTED_KEYS = ['physical/777', 'physical/314159', 'physical/8675309', 'physical/20261104', 'calendar/20261104', 'newborn_parent_familia/20261104', 'off/777', 'off/314159', 'off/8675309', 'off/20261104'];
const isDigits = v => typeof v === 'string' && /^\d+$/.test(v) && Number(v) <= 0xFFFFFFFF;
// 반환: { lines: [...], bad: 실패한 구성 수(구성 누락 포함) }
function strictCompare(now, ref) {
    const lines = []; let bad = 0;
    if (!Array.isArray(now) || !Array.isArray(ref)) return { lines: ['입력이 배열이 아님'], bad: EXPECTED_KEYS.length };
    for (const key of EXPECTED_KEYS) {
        const r = now.find(x => x && x.key === key), x = ref.find(y => y && y.key === key);
        const why = [];
        if (!r) why.push('이번 실행에 구성 없음');
        if (!x) why.push('F1 기록에 구성 없음');
        if (r && x) {
            if (!isDigits(r.lifeDigest)) why.push('lifeDigest 형식:' + r.lifeDigest); else if (r.lifeDigest !== x.lifeDigest) why.push('lifeDigest 다름');
            if (!isDigits(r.rngCallDigest)) why.push('rngCallDigest 형식:' + r.rngCallDigest); else if (r.rngCallDigest !== x.rngCallDigest) why.push('rngCallDigest 다름');
            if (r.exit !== 0) why.push('exit:' + r.exit);
            if (r.completed !== '3000') why.push('completed:' + r.completed);
            if (r.allInv !== 'true') why.push('불변식:' + r.allInv);
            if (r.exc !== '0') why.push('예외:' + r.exc);
        }
        if (why.length) bad++;
        lines.push((why.length ? 'DIFF ' : 'SAME ') + key + (r ? ' lifeDigest=' + r.lifeDigest + ' rng=' + r.rngCallDigest + ' exit=' + r.exit + ' completed=' + r.completed + ' inv=' + r.allInv + ' exc=' + r.exc : '') + (x ? ' | F1 ' + x.lifeDigest + '/' + x.rngCallDigest : '') + (why.length ? ' | ' + why.join(', ') : ''));
    }
    const extra = now.filter(r => !r || EXPECTED_KEYS.indexOf(r.key) < 0).length;
    if (extra) { bad += extra; lines.push('DIFF 예상하지 않은 구성 ' + extra + '개'); }
    return { lines, bad };
}
module.exports = { strictCompare, EXPECTED_KEYS };
if (require.main === module) {
    const nowPath = process.argv[2], refPath = process.argv[3] || path.join(__dirname, '..', 'logs', 'v178_f1', 'digest10_vs_s3.json');
    if (!nowPath) { console.error('usage: node tests/digest10_strict.js <now json> [ref json]'); process.exit(2); }
    let res;
    try { res = strictCompare(JSON.parse(fs.readFileSync(nowPath, 'utf8')), JSON.parse(fs.readFileSync(refPath, 'utf8'))); }
    catch (e) { console.log('입력을 읽지 못함: ' + (e && e.message)); process.exit(1); }
    res.lines.forEach(l => console.log(l));
    console.log('STRICT: ' + (EXPECTED_KEYS.length - Math.min(res.bad, EXPECTED_KEYS.length)) + '/' + EXPECTED_KEYS.length + (res.bad ? ' (실패 ' + res.bad + ')' : ''));
    process.exit(res.bad ? 1 : 0);
}
