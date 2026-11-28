'use strict';
// Windows CRLF 진단 도구(게임·시험 코드 아님). 저장소 사본 하나를 받아, CRLF 영향으로 분류한 정적 검사 3건의
// 중간값을 그 시험과 같은 식으로 계산해 출력한다. 같은 값을 줄 끝 CR 을 지운 텍스트로도 계산해 나란히 보인다.
// 사용: node crlf_diag.js <저장소 사본 폴더>
const fs = require('fs'), path = require('path');
const D = path.resolve(process.argv[2] || '.');
const rd = f => fs.readFileSync(path.join(D, f), 'utf8');
const lf = t => t.replace(/\r\n/g, '\n');
const out = {};
// (1) rng_sites_test 독립 정적 검색(시험 118~120줄과 같은 식): 주석을 뺀 줄의 Math.random 수
const SRC = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
const count = texts => { let n = 0; const stray = []; texts.forEach(([f, t]) => t.split('\n').forEach((l, i) => { const code = l.replace(/\/\/.*$/, ''); const k = (code.match(/Math\.random/g) || []).length; n += k; if (k && /\/\/.*Math\.random/.test(l)) stray.push(f + ':' + (i + 1)); })); return { n, commentLinesCounted: stray }; };
const T = SRC.map(f => [f, rd(f)]);
out.rng_sites_grep = { asIs: count(T), crStripped: count(T.map(([f, t]) => [f, lf(t)])), crCount: Object.fromEntries(T.map(([f, t]) => [f, (t.match(/\r/g) || []).length])) };
// (2) devabil_test DA-3f(시험 71~72줄과 같은 식): 블록에서 주석을 뺀 뒤 Math.random 포함 여부
const blk = s => s.slice(s.indexOf('F1D4A D-DEVABIL 1단계'), s.indexOf('function tryLevelUp')).split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
const sjs = rd('script.js');
out.devabil_DA3f = { asIs: { len: blk(sjs).length, hasMathRandom: blk(sjs).includes('Math.random') }, crStripped: { len: blk(lf(sjs)).length, hasMathRandom: blk(lf(sjs)).includes('Math.random') } };
// (3) sync_2i_test applyGodReturn 본문 추출(시험 407줄과 같은 정규식)
const body = s => (s.match(/function applyGodReturn\([\s\S]*?\n}\n/) || [''])[0].length;
out.sync_2i_body = { asIsLen: body(sjs), crStrippedLen: body(lf(sjs)) };
console.log(JSON.stringify(out, null, 1));
