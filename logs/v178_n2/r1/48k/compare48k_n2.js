// 외부 도구(게임 코드 아님): N2 48,000생애 전후 비교. run48k.js 산출물(tr_*.log, life_*.json)만 읽는다.
// 사용: node compare48k_n2.js <A 폴더> <B 폴더> <A 이름> <B 이름> <events.js 경로>
'use strict';
const fs = require('fs'), path = require('path');
const [A, B, NA, NB, EVJS] = process.argv.slice(2);
const SEEDS = ['20261104', '777', '314159', '8675309'], MODES = ['physical', 'calendar', 'off', 'newborn_parent_familia'];
const evSrc = fs.readFileSync(EVJS, 'utf8');
const DUNGEON = new Set([...evSrc.matchAll(/([a-z_0-9]+): \['dungeon'\]/g)].map(m => m[1]));
const line = (o, k) => { const m = o.match(new RegExp('^' + k.replace(/[()]/g, '\\$&') + ':\\s*(.*?)\\s*$', 'm')); return m ? m[1] : null; };
const J = (o, k) => { const v = line(o, k); try { return v == null ? null : JSON.parse(v); } catch (e) { return null; } };
const add = (a, b) => { for (const [k, v] of Object.entries(b || {})) a[k] = (a[k] || 0) + v; return a; };
function agg(dir) {
  const r = { configs: 0, completed: 0, exc: 0, invOk: 0, exit0: 0, falnaPctSum: 0, ablSum: 0, chronoSum: 0, lv: {}, death: {}, maxLv: 0, lv6: 0, dungeonLives: 0, dungeonEvents: 0, lives: 0, falnaLives: 0, digest: {}, dump: {} };
  for (const m of MODES) for (const s of SEEDS) {
    const k = m + '_' + s, o = fs.readFileSync(path.join(dir, 'tr_' + k + '.log'), 'utf8');
    r.configs++; r.completed += Number(line(o, 'completed')); r.exc += Number(line(o, 'runtimeExceptions'));
    if (line(o, 'allInvariantsPassed') === 'true') r.invOk++; if (/\nexit=0\s*$/.test(o)) r.exit0++;
    r.falnaPctSum += Number(line(o, 'falnaRatePct')); r.ablSum += Number(line(o, 'averagePostFalnaAbilityTotal')); r.chronoSum += Number(line(o, 'averageChronologicalAge'));
    add(r.lv, J(o, 'finalLevelDistribution')); add(r.death, J(o, 'deathCauses')); r.maxLv = Math.max(r.maxLv, Number(line(o, 'maxLevelReached')));
    const lr = J(o, 'levelReach'); r.lv6 += lr ? lr.livesReachedLv6 : 0;
    const v178 = J(o, 'v178'); r.digest[k] = [line(o, 'lifeDigest'), v178 ? String(v178.rngCallDigest) : null];
    const n2 = J(o, 'n2bulk'); if (n2) r.n2bulk = r.n2bulk || []; if (n2) r.n2bulk.push([k, n2]);
    const L = JSON.parse(fs.readFileSync(path.join(dir, 'life_' + k + '.json'), 'utf8'));
    r.dump[k] = L.map(x => x.d);
    for (const x of L) { r.lives++; if (x.falna) r.falnaLives++; const d = (x.ev || []).filter(e => DUNGEON.has(e)).length; if (d) r.dungeonLives++; r.dungeonEvents += d; }
  }
  return r;
}
const a = agg(path.resolve(A)), b = agg(path.resolve(B));
const pct = (x, n) => (100 * x / n).toFixed(2) + '%';
const out = [];
out.push(`# 48,000생애 비교 — A = ${NA}, B = ${NB}`, '', `던전 사건 id(${DUNGEON.size}개, events.js 분류 'dungeon'): ${[...DUNGEON].join(', ')}`, '');
out.push('## 구성별 lifeDigest·rngCallDigest·생애별 일치', '구성 | A lifeDigest/rng | B lifeDigest/rng | 같은 순번 생애 digest 일치 수 | 첫 불일치 생애', '---|---|---|---|---');
for (const m of MODES) for (const s of SEEDS) { const k = m + '_' + s, da = a.dump[k], db = b.dump[k]; let same = 0, first = -1;
  for (let i = 0; i < Math.min(da.length, db.length); i++) { if (da[i] === db[i]) same++; else if (first < 0) first = i; }
  out.push(`${m}/${s} | ${a.digest[k].join('/')} | ${b.digest[k].join('/')} | ${same}/${da.length} | ${first < 0 ? '없음' : first}`); }
out.push('', '## 통합 지표', `지표 | A | B`, '---|---|---');
const row = (n, x, y) => out.push(`${n} | ${x} | ${y}`);
row('구성 수 / exit 0 / 불변식 통과', `${a.configs} / ${a.exit0} / ${a.invOk}`, `${b.configs} / ${b.exit0} / ${b.invOk}`);
row('완료 생애 / 런타임 예외', `${a.completed} / ${a.exc}`, `${b.completed} / ${b.exc}`);
row('팔나 이력 생애', `${a.falnaLives} (${pct(a.falnaLives, a.lives)})`, `${b.falnaLives} (${pct(b.falnaLives, b.lives)})`);
row('던전 사건 경험 생애', `${a.dungeonLives} (${pct(a.dungeonLives, a.lives)})`, `${b.dungeonLives} (${pct(b.dungeonLives, b.lives)})`);
row('던전 사건 총 발생 수', a.dungeonEvents, b.dungeonEvents);
row('최종 레벨 분포', JSON.stringify(a.lv), JSON.stringify(b.lv));
row('최고 도달 레벨 / Lv6 도달 생애', `${a.maxLv} / ${a.lv6}`, `${b.maxLv} / ${b.lv6}`);
row('평균 팔나 후 능력치 합(구성 평균)', (a.ablSum / a.configs).toFixed(2), (b.ablSum / b.configs).toFixed(2));
row('평균 달력 나이(구성 평균)', (a.chronoSum / a.configs).toFixed(2), (b.chronoSum / b.configs).toFixed(2));
row('사망 원인', JSON.stringify(a.death), JSON.stringify(b.death));
const lvSum = d => Object.entries(d).reduce((t, [k, v]) => t + Number(k) * v, 0);
row('최종 레벨 합(생애 합계)', lvSum(a.lv), lvSum(b.lv));
for (const [tag, r] of [['A', a], ['B', b]]) if (r.n2bulk) {
  const T = { blockedCalls: 0, livesWithBlock: 0, bulk: { n: 0, ex: 0, gain: 0, exMeasured: 0, lvUp: 0 }, normal: { n: 0, ex: 0, gain: 0, exMeasured: 0, lvUp: 0 } };
  for (const [, x] of r.n2bulk) { T.blockedCalls += x.blockedCalls; T.livesWithBlock += x.livesWithBlock; for (const g of ['bulk', 'normal']) for (const f of ['n', 'ex', 'gain', 'exMeasured', 'lvUp']) T[g][f] += x[g][f] || 0; }
  out.push('', `## N2-1e 일괄 변환 측정(${tag}, 계측 사본, 구성 ${r.n2bulk.length}개)`,
    `- 관문에 막힌 convertExp 호출 ${T.blockedCalls}회, 막힘을 겪은 생애 ${T.livesWithBlock}`,
    `- 일괄 변환(막힘 뒤 첫 변환): ${T.bulk.n}회, 엑세리아 ${T.bulk.ex.toFixed(1)}, 능력치 증가 ${T.bulk.gain}(레벨업 없는 호출만, 해당 엑세리아 ${T.bulk.exMeasured.toFixed(1)}), 이론값 대비 반영률 ${T.bulk.exMeasured ? (100 * T.bulk.gain / (T.bulk.exMeasured * 50)).toFixed(2) + '%' : 'n/a'}, 같은 호출의 레벨업 ${T.bulk.lvUp}`,
    `- 일반 변환: ${T.normal.n}회, 엑세리아 ${T.normal.ex.toFixed(1)}, 능력치 증가 ${T.normal.gain}(해당 엑세리아 ${T.normal.exMeasured.toFixed(1)}), 반영률 ${T.normal.exMeasured ? (100 * T.normal.gain / (T.normal.exMeasured * 50)).toFixed(2) + '%' : 'n/a'}, 레벨업 ${T.normal.lvUp}`);
}
console.log(out.join('\n'));
