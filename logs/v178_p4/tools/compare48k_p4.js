// 외부 도구(게임 코드 아님): P4 48,000생애 전후 비교. A = 변경 전(819f8e8), B = 변경 후(P4 작업 트리). run48k.js 산출물(출력 로그·생애별 기록)만 읽는다.
// 생애별 기록에 o(출생지)·rf·lf(생애 끝 거주지·위치)·adv(모험자 직업 경험)·dun(던전 사건 수) 필드가 있으면(분석 사본) 지역별 표도 만든다.
// 사용: node compare48k_p4.js <A 폴더> <B 폴더> [출력 md]
const fs = require('fs'), path = require('path');
const [A, B, OUT] = process.argv.slice(2);
const SEEDS = ['20261104', '777', '314159', '8675309'], MODES = ['physical', 'calendar', 'off', 'newborn_parent_familia'];
const DUN = ['dive1', 'routine', 'minotaur', 'expedition', 'xenos', 'purple_moth', 'high_excelia', 'guild_advisor', 'encounter_goliath', 'find_grimoire', 'daedalus_orb', 'floor_boss_upper', 'mid_floor_expedition', 'deep_floor_survey', 'floor_lord_hunt', 'legend_clash', 'supporter_route'];
const WATCH_EV = DUN.concat(['healer_shift', 'conscript', 'hero_sacrifice', 'join', 'join_hard', 'latejoin', 'god_gone', 'retire']);
const line = (o, k) => { const m = o.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : null; };
const J = (o, k) => { const v = line(o, k); return v == null ? null : JSON.parse(v); };
const pct = (a, b) => b ? (a / b * 100).toFixed(2) + '%' : '-';
const agg = () => ({ cfg: 0, exit0: 0, inv: 0, lives: 0, completed: 0, exc: 0, falna: 0, deaths: {}, ev: {}, evLives: {}, dunLives: 0, dunTotal: 0, moves: {}, finalRes: {}, p4: { shown: 0, relocate: 0, stay: 0, conflict: 0, access: 0, fail: 0 }, region: {}, hasRegion: false, digests: {} });
const R = { A: agg(), B: agg() };
for (const mode of MODES) for (const seed of SEEDS) for (const [tag, dir] of [['A', A], ['B', B]]) {
  const k = mode + '_' + seed, r = R[tag];
  const o = fs.readFileSync(path.join(dir, `tr_${k}.log`), 'utf8'), lives = JSON.parse(fs.readFileSync(path.join(dir, `life_${k}.json`), 'utf8'));
  r.cfg++; if (/\nexit=0\s*$/.test(o)) r.exit0++; if (line(o, 'allInvariantsPassed') === 'true') r.inv++;
  r.lives += lives.length; r.completed += +line(o, 'completed'); r.exc += +(line(o, 'runtimeExceptions') || 0);
  r.digests[mode + '/' + seed] = line(o, 'lifeDigest');
  r.falna += lives.filter(x => x.falna).length;
  const dc = J(o, 'deathCauses') || {}; for (const [c, n] of Object.entries(dc)) r.deaths[c] = (r.deaths[c] || 0) + n;
  const ri = J(o, 'residenceRi'); if (ri) { for (const [c, n] of Object.entries(ri.movesByReason || {})) r.moves[c] = (r.moves[c] || 0) + n; for (const [c, n] of Object.entries(ri.finalResidence || {})) r.finalRes[c] = (r.finalRes[c] || 0) + n; }
  const p4 = J(o, 'p4Relocate'); if (p4) { r.p4.shown += p4.shown; r.p4.relocate += (p4.byChoice.relocate || 0); r.p4.stay += (p4.byChoice.stay || 0); r.p4.conflict += p4.conflictDiag; r.p4.access += p4.accessDiag; r.p4.fail += Object.values(p4.failures).reduce((a, b) => a + b, 0); }
  for (const l of lives) {
    let d = 0; for (const e of l.ev) { if (WATCH_EV.includes(e)) r.ev[e] = (r.ev[e] || 0) + 1; if (DUN.includes(e)) d++; }
    for (const e of new Set(l.ev)) if (WATCH_EV.includes(e)) r.evLives[e] = (r.evLives[e] || 0) + 1;
    if (d) r.dunLives++; r.dunTotal += d;
    if (l.o !== undefined) { r.hasRegion = true;
      const key = (l.adv ? 'adv' : 'nonadv') + '|' + (l.o === 'orario' ? 'orario 출생' : '비오라리오 출생') + '|' + (l.lf === 'orario' ? '끝 위치 orario' : '끝 위치 비오라리오');
      const g = r.region[key] || (r.region[key] = { lives: 0, dun: 0, dunLives: 0, relo: 0 }); g.lives++; g.dun += l.dun; if (l.dun) g.dunLives++; if (l.relo) g.relo++; }
  }
}
const md = [];
md.push('# P4 48,000생애 전후 비교 — A = 819f8e8(변경 전), B = P4 작업 트리(변경 후)', '', `A: ${path.resolve(A)}`, `B: ${path.resolve(B)}`, '');
md.push('## 통합 지표', '지표 | A | B', '---|---|---');
for (const t of ['A', 'B']) {}
md.push(`구성 / exit 0 / 불변식 통과 | ${R.A.cfg} / ${R.A.exit0} / ${R.A.inv} | ${R.B.cfg} / ${R.B.exit0} / ${R.B.inv}`);
md.push(`완료 생애 / 런타임 예외 | ${R.A.completed} / ${R.A.exc} | ${R.B.completed} / ${R.B.exc}`);
md.push(`팔나 이력 생애 | ${R.A.falna} (${pct(R.A.falna, R.A.lives)}) | ${R.B.falna} (${pct(R.B.falna, R.B.lives)})`);
md.push(`던전 사건 1건 이상 생애 | ${R.A.dunLives} (${pct(R.A.dunLives, R.A.lives)}) | ${R.B.dunLives} (${pct(R.B.dunLives, R.B.lives)})`);
md.push(`던전 사건 총 발생 | ${R.A.dunTotal} | ${R.B.dunTotal}`);
md.push(`이주 선택 표시 / 이주 / 머묾 | - | ${R.B.p4.shown} / ${R.B.p4.relocate} / ${R.B.p4.stay}`);
md.push(`relocation_offer_conflict / dungeon_access_invalid 진단 / p4 검사 실패 | - | ${R.B.p4.conflict} / ${R.B.p4.access} / ${R.B.p4.fail}`);
md.push('', '## 이동 이유(거주 이력, 48k 합계)', '이유 | A | B', '---|---|---');
for (const k of [...new Set(Object.keys(R.A.moves).concat(Object.keys(R.B.moves)))].sort()) md.push(`${k} | ${R.A.moves[k] || 0} | ${R.B.moves[k] || 0}`);
md.push('', '## 생애 끝 거주지', '지역 | A | B', '---|---|---');
for (const k of [...new Set(Object.keys(R.A.finalRes).concat(Object.keys(R.B.finalRes)))].sort()) md.push(`${k} | ${R.A.finalRes[k] || 0} | ${R.B.finalRes[k] || 0}`);
md.push('', '## 사건별 발생 수(총 발생 / 1회 이상 생애)', '사건 | A 발생 | B 발생 | A 생애 | B 생애', '---|---|---|---|---');
for (const e of WATCH_EV) md.push(`${e}${DUN.includes(e) ? ' (던전)' : ''} | ${R.A.ev[e] || 0} | ${R.B.ev[e] || 0} | ${R.A.evLives[e] || 0} | ${R.B.evLives[e] || 0}`);
md.push('', '## 사망 원인(48k 합계)', '원인 | A | B', '---|---|---');
for (const k of [...new Set(Object.keys(R.A.deaths).concat(Object.keys(R.B.deaths)))].sort()) md.push(`${k} | ${R.A.deaths[k] || 0} | ${R.B.deaths[k] || 0}`);
if (R.A.hasRegion && R.B.hasRegion) {
  md.push('', '## 지역별(분석 사본 필드: 모험자 직업 경험 × 출생지 × 생애 끝 위치)', '구분 | A 생애 | A 던전 사건(생애당) | A 던전 1건+ 생애 | B 생애 | B 던전 사건(생애당) | B 던전 1건+ 생애 | B 이주 생애', '---|---|---|---|---|---|---|---');
  for (const k of [...new Set(Object.keys(R.A.region).concat(Object.keys(R.B.region)))].sort()) { const a = R.A.region[k] || { lives: 0, dun: 0, dunLives: 0 }, b = R.B.region[k] || { lives: 0, dun: 0, dunLives: 0, relo: 0 };
    md.push(`${k} | ${a.lives} | ${a.dun} (${a.lives ? (a.dun / a.lives).toFixed(2) : '-'}) | ${a.dunLives} | ${b.lives} | ${b.dun} (${b.lives ? (b.dun / b.lives).toFixed(2) : '-'}) | ${b.dunLives} | ${b.relo}`); }
}
md.push('', '## 구성별 lifeDigest', '구성 | A | B', '---|---|---');
for (const k of Object.keys(R.A.digests)) md.push(`${k} | ${R.A.digests[k]} | ${R.B.digests[k]}`);
const text = md.join('\n') + '\n';
if (OUT) fs.writeFileSync(OUT, text); console.log(text);
