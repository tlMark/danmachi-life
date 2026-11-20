// F1D4A P1 — 10구성 digest 엄격 대조(시험 전용). F1 의 logs/v178_f1/tools/digest10.js 는 lifeDigest 만 비교하고 불일치를 종료 코드에 반영하지 않는다.
// 이 스크립트는 그 도구가 쓴 결과 JSON 을 F1 기록(logs/v178_f1/digest10_vs_s3.json)과 대조한다:
//   구성이 정확히 10개이고 기대 키가 각각 정확히 한 번씩 나오며(누락·중복·알 수 없는 키 없음), 구성마다 lifeDigest · rngCallDigest 가 숫자 문자열이며 F1 기록과 같고, 종료 코드 0 · 3000생애 완주 · 불변식 통과.
// 사용: node tests/digest10_strict.js <이번 실행 json> [F1 기록 json] [기준 이름]   (하나라도 어긋나면 종료 코드 1)
// F1D4A 기준선 정리: 세 번째 인수(기준 이름)는 출력 문구의 기준 표기만 바꾼다(기본값 'F1 기록' — 기존 출력과 같음). 판정 규칙은 같다.
'use strict';
const fs = require('fs'), path = require('path');
const EXPECTED_KEYS = ['physical/777', 'physical/314159', 'physical/8675309', 'physical/20261104', 'calendar/20261104', 'newborn_parent_familia/20261104', 'off/777', 'off/314159', 'off/8675309', 'off/20261104'];
const isDigits = v => typeof v === 'string' && /^\d+$/.test(v) && Number(v) <= 0xFFFFFFFF;
// 한 목록의 구성 키 구조 검사: 항목 수가 정확히 10, 기대 키가 각각 정확히 1번, 알 수 없는 키 없음.
// 반환: { missing: [...], duplicate: [...], unknown: [...], countOk: bool, problems: [사람이 읽는 문장...] }
function keyStructure(list, label) {
    const out = { missing: [], duplicate: [], unknown: [], countOk: false, problems: [] };
    if (!Array.isArray(list)) { out.problems.push(label + ': 배열이 아님'); out.missing = EXPECTED_KEYS.slice(); return out; }
    const seen = {};
    for (const item of list) {
        const key = item && typeof item === 'object' && typeof item.key === 'string' ? item.key : null;
        if (key === null || EXPECTED_KEYS.indexOf(key) < 0) { out.unknown.push(key === null ? '(키 없음)' : key); continue; }
        seen[key] = (seen[key] || 0) + 1;
    }
    for (const key of EXPECTED_KEYS) { if (!seen[key]) out.missing.push(key); else if (seen[key] > 1) out.duplicate.push(key + ' ×' + seen[key]); }
    out.countOk = list.length === EXPECTED_KEYS.length;
    if (!out.countOk) out.problems.push(label + ': 구성 수 ' + list.length + '(' + EXPECTED_KEYS.length + ' 이어야 함)');
    if (out.missing.length) out.problems.push(label + ': 누락된 구성 ' + out.missing.join(', '));
    if (out.duplicate.length) out.problems.push(label + ': 중복된 구성 ' + out.duplicate.join(', '));
    if (out.unknown.length) out.problems.push(label + ': 알 수 없는 구성 ' + out.unknown.join(', '));
    return out;
}
// 반환: { lines: [...], bad: 문제 수(0 이어야 합격), structure: { now, ref } }
// 구조 문제(구성 수·누락·중복·알 수 없는 키)는 값 비교와 별개로 각각 실패다. 중복된 키는 값이 같아도 실패하며, 중복 항목은 모두 값 검사를 받는다.
function strictCompare(now, ref, refLabel = 'F1 기록') {
    const lines = []; let bad = 0;
    const refShort = refLabel === 'F1 기록' ? 'F1' : refLabel;
    const sNow = keyStructure(now, '이번 실행'), sRef = keyStructure(ref, refLabel);
    for (const p of sNow.problems.concat(sRef.problems)) { lines.push('DIFF ' + p); bad++; }
    if (!Array.isArray(now) || !Array.isArray(ref)) return { lines, bad: Math.max(bad, EXPECTED_KEYS.length), structure: { now: sNow, ref: sRef } };
    for (const key of EXPECTED_KEYS) {
        const rs = now.filter(x => x && x.key === key), xs = ref.filter(y => y && y.key === key);
        if (rs.length === 0 || xs.length !== 1) {   // 누락·기준 쪽 중복은 위 구조 문제로 이미 실패 처리됨. 값 비교는 할 수 없다
            lines.push('DIFF ' + key + ' | ' + (rs.length === 0 ? '이번 실행에 구성 없음' : refLabel + '의 구성이 ' + xs.length + '개라 대조 불가'));
            if (rs.length !== 0 && xs.length !== 1 && sRef.problems.length === 0) bad++;
            continue;
        }
        const x = xs[0];
        rs.forEach((r, i) => {   // 중복이 있으면 모든 항목을 검사한다(첫 항목만 보고 지나가지 않는다)
            const why = [];
            if (!isDigits(r.lifeDigest)) why.push('lifeDigest 형식:' + r.lifeDigest); else if (r.lifeDigest !== x.lifeDigest) why.push('lifeDigest 다름');
            if (!isDigits(r.rngCallDigest)) why.push('rngCallDigest 형식:' + r.rngCallDigest); else if (r.rngCallDigest !== x.rngCallDigest) why.push('rngCallDigest 다름');
            if (r.exit !== 0) why.push('exit:' + r.exit);
            if (r.completed !== '3000') why.push('completed:' + r.completed);
            if (r.allInv !== 'true') why.push('불변식:' + r.allInv);
            if (r.exc !== '0') why.push('예외:' + r.exc);
            if (rs.length > 1) why.push('중복 항목 ' + (i + 1) + '/' + rs.length);
            if (why.some(w => !w.startsWith('중복 항목'))) bad++;   // 중복 자체는 구조 문제로 이미 1회 실패 처리됨
            lines.push((why.length ? 'DIFF ' : 'SAME ') + key + ' lifeDigest=' + r.lifeDigest + ' rng=' + r.rngCallDigest + ' exit=' + r.exit + ' completed=' + r.completed + ' inv=' + r.allInv + ' exc=' + r.exc + ' | ' + refShort + ' ' + x.lifeDigest + '/' + x.rngCallDigest + (why.length ? ' | ' + why.join(', ') : ''));
        });
    }
    return { lines, bad, structure: { now: sNow, ref: sRef } };
}
module.exports = { strictCompare, keyStructure, EXPECTED_KEYS };
if (require.main === module) {
    const nowPath = process.argv[2], refPath = process.argv[3] || path.join(__dirname, '..', 'logs', 'v178_f1', 'digest10_vs_s3.json'), refLabel = process.argv[4] || 'F1 기록';
    if (!nowPath) { console.error('usage: node tests/digest10_strict.js <now json> [ref json] [ref label]'); process.exit(2); }
    let res;
    try { res = strictCompare(JSON.parse(fs.readFileSync(nowPath, 'utf8')), JSON.parse(fs.readFileSync(refPath, 'utf8')), refLabel); }
    catch (e) { console.log('입력을 읽지 못함: ' + (e && e.message)); process.exit(1); }
    res.lines.forEach(l => console.log(l));
    const same = res.lines.filter(l => l.startsWith('SAME ')).length;
    console.log('STRICT: ' + (res.bad ? 'FAIL' : 'PASS') + ' — 동일 ' + same + '/' + EXPECTED_KEYS.length + ', 문제 ' + res.bad + '건');
    process.exit(res.bad ? 1 : 0);
}
