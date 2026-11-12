// 외부 도구: 48,000생애 전후 비교(js1 기준 vs F-1 구현). 출력 로그와 생애별 기록만 읽는다.
const fs = require('fs'), path = require('path');
const [A, B] = process.argv.slice(2).map(p => path.resolve(p));
const SEEDS = ['20261104', '777', '314159', '8675309'], MODES = ['physical', 'calendar', 'off', 'newborn_parent_familia'];
const line = (o, k) => { const m = o.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : null; };
const J = (o, k) => { const v = line(o, k); return v == null ? null : JSON.parse(v); };
const agg = () => ({ lives: 0, falna: 0, membership: 0, rejectionLives: 0, applied: 0, scout: 0, applications: 0, blockedCooldown: 0, blockedCap: 0, supporterJobEnd: 0, supporterFlagEnd: 0, pfLives: 0, ev: {}, jobs: {}, exc: 0, inv: 0, completed: 0, followups: 0, supOpt: 0, f1bad: 0 });
const EV = ['join_hard', 'join', 'career_choice', 'latejoin', 'supporter_scorn', 'free_supporter_route', 'buy_dual_potion'];
const res = { A: agg(), B: agg() }, per = [], digest = [];
for (const mode of MODES) for (const seed of SEEDS) {
  const k = mode + '_' + seed; const row = { key: mode + '/' + seed };
  for (const [tag, dir] of [['A', A], ['B', B]]) {
    const o = fs.readFileSync(path.join(dir, `tr_${k}.log`), 'utf8'), lifes = JSON.parse(fs.readFileSync(path.join(dir, `life_${k}.json`), 'utf8')), r = res[tag];
    const rb = J(o, 'recruit2bb'), f1 = J(o, 'f1Followup');
    r.lives += lifes.length; r.completed += +line(o, 'completed'); r.exc += +line(o, 'runtimeExceptions'); r.inv += line(o, 'allInvariantsPassed') === 'true' ? 1 : 0;
    r.falna += lifes.filter(x => x.falna).length; r.membership += lifes.filter(x => x.fam).length;
    r.applied += rb.livesApplied; r.rejectionLives += rb.livesWithRejection; r.scout += rb.direct; r.applications += rb.applications;
    r.blockedCooldown += (rb.blockedByReason || {}).cooldown || 0; r.blockedCap += (rb.blockedByReason || {}).lifetime_cap || 0;
    r.supporterJobEnd += lifes.filter(x => x.job === 'supporter').length; r.supporterFlagEnd += lifes.filter(x => x.sup).length; r.pfLives += lifes.filter(x => x.pf).length;
    for (const l of lifes) { r.jobs[l.job] = (r.jobs[l.job] || 0) + 1; for (const e of new Set(l.ev)) if (EV.includes(e)) r.ev[e] = (r.ev[e] || 0) + 1; }
    if (f1) { r.followups += f1.followups; r.supOpt += f1.supporterOptionShown; r.f1bad += ['badPhase', 'applicationChanged', 'stayStateChanged', 'rngDuringStay', 'notCleaned', 'jobChangedByFollowup', 'nextButtonBad', 'pendingLeftAtLifeEnd', 'fallbackSpecs'].reduce((s, x) => s + f1[x], 0); }
    row[tag] = { digest: line(o, 'lifeDigest'), lifes };
  }
  // 생애별: 첫 거절·차단 생애(기준) 이전 생애는 모두 같아야 한다. 첫 불일치 위치와 비교.
  const a = row.A.lifes, b = row.B.lifes; const firstPf = a.findIndex(x => x.pf); let firstDiff = a.findIndex((x, i) => !b[i] || x.d !== b[i].d);
  const samePrefix = a.slice(0, firstPf).every((x, i) => x.d === b[i].d);
  const sameAll = a.filter((x, i) => b[i] && x.d === b[i].d).length;
  // 같은 생애 순번에서 기준이 pf 가 아니고 구현도 pf 가 아닌데 다른 생애 = RNG 흐름 분기 결과(전역 연속 RNG)
  per.push({ key: row.key, digestA: row.A.digest, digestB: row.B.digest, firstPfLife: firstPf, firstDiffLife: firstDiff, prefixSame: samePrefix, firstDiffIsPf: firstDiff === firstPf, sameLives: sameAll, lives: a.length });
}
const pct = (n, d) => d ? (n / d * 100).toFixed(2) + '%' : '-';
const out = [];
out.push('# 48,000생애 전후 비교 — A = js1 기준(base_instr), B = F-1 구현(impl). 4시드(20261104, 777, 314159, 8675309) × 4모드(physical, calendar, off, newborn_parent_familia) × 3,000');
out.push('\n## 구성별 lifeDigest·생애별 대조');
out.push('구성 | A lifeDigest | B lifeDigest | 첫 거절·차단 생애(A) | 첫 불일치 생애 | 그 이전 전부 동일 | 첫 불일치 = 첫 거절·차단 | 순번 동일 생애 수');
for (const p of per) out.push(`${p.key} | ${p.digestA} | ${p.digestB} | ${p.firstPfLife} | ${p.firstDiffLife} | ${p.prefixSame} | ${p.firstDiffIsPf} | ${p.sameLives}/${p.lives}`);
const m = (k, f) => `${k} | ${f(res.A)} | ${f(res.B)}`;
out.push('\n## 통합 지표(§3.6)');
out.push('지표 | A(js1) | B(F-1)');
out.push(m('생애 수(완료)', r => `${r.lives} (${r.completed})`));
out.push(m('런타임 예외 / 불변식 통과 구성', r => `${r.exc} / ${r.inv}/16`));
out.push(m('소속 이력 생애', r => `${r.membership} (${pct(r.membership, r.lives)})`));
out.push(m('팔나 이력 생애', r => `${r.falna} (${pct(r.falna, r.lives)})`));
out.push(m('일반 지원 생애 / 거절 경험 생애', r => `${r.applied} / ${r.rejectionLives} (${pct(r.rejectionLives, r.applied)})`));
out.push(m('일반 지원 건수 / scout 직접 입단', r => `${r.applications} / ${r.scout}`));
out.push(m('차단 cooldown / lifetime_cap', r => `${r.blockedCooldown} / ${r.blockedCap}`));
out.push(m('join_hard 거절·차단 경험 생애', r => `${r.pfLives}`));
out.push(m('생애 말 supporter 직업 / supporter 플래그', r => `${r.supporterJobEnd} / ${r.supporterFlagEnd}`));
for (const e of EV) out.push(m(`사건 발생 생애: ${e}`, r => `${r.ev[e] || 0}`));
out.push(m('후속 선택 표시(러너는 stay 고정) / 서포터 선택지 노출', r => r.followups ? `${r.followups} / ${r.supOpt}` : '해당 없음'));
out.push(m('F-1 러너 불변식 위반 합계', r => r.followups ? String(r.f1bad) : '해당 없음'));
out.push('\n## 생애 말 직업 분포');
const jobs = [...new Set(Object.keys(res.A.jobs).concat(Object.keys(res.B.jobs)))].sort();
out.push('직업 | A | B | 차이'); for (const j of jobs) out.push(`${j} | ${res.A.jobs[j] || 0} | ${res.B.jobs[j] || 0} | ${(res.B.jobs[j] || 0) - (res.A.jobs[j] || 0)}`);
console.log(out.join('\n'));
fs.writeFileSync(path.join(B, '..', '48k_compare.json'), JSON.stringify({ per, A: res.A, B: res.B }, null, 1));
