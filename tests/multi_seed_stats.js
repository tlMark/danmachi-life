// 다중 시드 통합 통계 + A/B. 모든 하위 실행이 실패하면 이 스크립트도 실패(exit 1)한다.
// 사용: node tests/multi_seed_stats.js [runsPerSeed=3000] [seeds=20261104,777,314159,8675309] [modes=physical]
//   modes: physical | calendar | off | newborn_parent_familia(=physical + 부모와 같은 파밀리아에 출생 즉시 입단; v1.7.1 동작의 복제가 아닌 반사실 대조군) 쉼표 구분. 그 외 값은 exit 1. 시드×모드 실행은 동시 실행 수를 제한해 병렬로 돌린다(MAX_PARALLEL).
// 각 하위 실행은 test_runner.js(실제 게임 소스, Mock DOM)이며 출력 줄을 파싱한다. 값 하드코딩 없음.
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const runner = path.resolve(__dirname, '..', 'test_runner.js');
const RUNS = Number(process.argv[2] || 3000);
const SEEDS = (process.argv[3] || '20261104,777,314159,8675309').split(',');
const ALLOWED_MODES = ['physical', 'calendar', 'off', 'newborn_parent_familia'];
const MODES = (process.argv[4] || 'physical').split(',');
const badModes = MODES.filter(m => !ALLOWED_MODES.includes(m));
if (badModes.length || !MODES.length) { console.error(`FAIL: 지원하지 않는 모드 [${badModes.join(', ')}]. 허용: ${ALLOWED_MODES.join(', ')}`); process.exit(1); }
if (!Number.isInteger(RUNS) || RUNS < 1 || SEEDS.some(s => !/^\d+$/.test(s))) { console.error('FAIL: runs/seeds 인자가 올바르지 않음'); process.exit(1); }
const line = (out, key) => { const m = out.match(new RegExp('^' + key + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : null; };
const run = (seed, mode) => new Promise(resolve => {
  const env = { ...process.env, SIM_RUNS: String(RUNS), SIM_SEED: seed, SIM_HP_REGEN_MODE: mode === 'newborn_parent_familia' ? 'physical' : mode };
  if (mode === 'newborn_parent_familia') env.SIM_NEWBORN_MEMBERSHIP = '1';
  const p = spawn('node', [runner], { env }); let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', status => resolve({ seed, mode, status, out }));
});
const parse = r => {
  const j = k => { const v = line(r.out, k); if (v == null) throw new Error(`${r.seed}/${r.mode}: 출력에 '${k}' 없음`); return JSON.parse(v); };
  return { ...r, race: j('raceStats'), reach: j('levelReach'), deaths: j('deathCauses'), hp: j('hpInvariants'), timeline: j('familiaFalnaTimeline'),
    invariants: line(r.out, 'allInvariantsPassed'), allRunsCompleted: line(r.out, 'allRunsCompleted'), completed: Number(line(r.out, 'completed')), avgCal: Number(line(r.out, 'averageChronologicalAge')) };
};
const pct = (a, b) => b ? (a / b * 100).toFixed(2) + '%' : '-';
const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
(async () => {
  // 동시 실행 수 제한(기본 min(CPU 수, 4), 환경변수 MAX_PARALLEL 로 조정). 모든 시드×모드를 한꺼번에 띄우지 않는다.
  const os = require('os');
  const LIMIT = Math.max(1, Number(process.env.MAX_PARALLEL) || Math.min(4, os.cpus().length));
  const queue = []; for (const mode of MODES) for (const seed of SEEDS) queue.push([seed, mode]);
  const jobs = queue.slice(); const raw = [];
  await Promise.all(Array.from({ length: Math.min(LIMIT, queue.length) }, async () => { while (queue.length) { const [seed, mode] = queue.shift(); raw.push(await run(seed, mode)); } }));
  const failures = [];
  const parsed = raw.map(r => { try { return parse(r); } catch (e) { failures.push(e.message); return null; } }).filter(Boolean);
  for (const r of parsed) {
    const tag = `${r.seed}/${r.mode}`;
    try {
      assert.strictEqual(r.status, 0, `${tag}: 종료 코드 ${r.status}`);
      assert.strictEqual(r.allRunsCompleted, 'true', `${tag}: allRunsCompleted=${r.allRunsCompleted}`);
      assert.strictEqual(r.completed, RUNS, `${tag}: completed=${r.completed} != ${RUNS}`);
      assert.strictEqual(r.invariants, 'true', `${tag}: allInvariantsPassed=${r.invariants}`);
    } catch (e) { failures.push(e.message); }
  }
  if (parsed.length !== jobs.length) failures.push(`파싱 성공 ${parsed.length}/${jobs.length}`);
  console.log(`# 다중 시드 통계 — 시드 ${SEEDS.join(', ')} × ${RUNS}판 × 모드 ${MODES.join(', ')}`);
  for (const mode of MODES) {
    const rs = parsed.filter(r => r.mode === mode).sort((a, b) => SEEDS.indexOf(a.seed) - SEEDS.indexOf(b.seed));
    if (!rs.length) continue;
    const total = sum(rs, r => Object.values(r.race).reduce((a, x) => a + x.lives, 0));
    console.log(`\n## 모드=${mode}  (exit=${rs.map(r => r.status).join(',')}, 완료=${rs.map(r => r.completed).join(',')}, 불변식=${rs.map(r => r.invariants).join(',')})`);
    console.log('시드별: ' + rs.map(r => `${r.seed}[평균달력나이 ${r.avgCal}, HP사망 ${r.deaths.hp}, Lv6+ ${r.reach.livesReachedLv6}, 영웅발생 ${r.reach.heroSacrificeFired}, 달성 ${r.reach.heroSacrificeWon}]`).join(' / '));
    const fired = sum(rs, r => r.reach.heroSacrificeFired), won = sum(rs, r => r.reach.heroSacrificeWon), lv6 = sum(rs, r => r.reach.livesReachedLv6);
    console.log(`통합: 생애 ${total}, HP사망 ${sum(rs, r => r.deaths.hp)} (${pct(sum(rs, r => r.deaths.hp), total)}), Lv6+ ${lv6} (${pct(lv6, total)}), 영웅 발생 ${fired}, 달성 ${won} (생애당 ${pct(won, total)}, 발생 후 ${pct(won, fired)}, Lv6+ 대비 ${pct(won, lv6)})`);
    console.log('시드별 발생 후 성공률: ' + rs.map(r => r.reach.heroSacrificeFired ? (r.reach.heroSacrificeWon / r.reach.heroSacrificeFired * 100).toFixed(1) + '%' : '-').join(', '));
    const T = rs.map(r => r.timeline);
    console.log(`소속 이력: 입단 ${sum(T, t => t.memberships)}건(생애 ${sum(T, t => t.livesWithMembership)}), 부모 소속 경유 ${sum(T, t => t.viaParent)}, 입단-팔나 간격 평균 ${(sum(T, t => t.gapSum) / Math.max(1, sum(T, t => t.gapN))).toFixed(2)}년 최대 ${Math.max(...T.map(t => t.gapMax))}, 음수 간격 ${sum(T, t => t.negativeGaps)}, 겹침 ${sum(T, t => t.overlappingMemberships)}, 팔나 미취득 입단 ${sum(T, t => t.membershipsWithoutFalna)}`);
    if (mode !== 'physical') continue;
    const agg = {};
    for (const r of rs) for (const [id, s] of Object.entries(r.race)) {
      const a = (agg[id] ||= { lives: 0, lv: {}, lv6: 0, lv7: 0, heroFired: 0, heroWon: 0, calSum: 0, physSum: 0 });
      a.lives += s.lives; a.lv6 += s.lv6; a.lv7 += s.lv7; a.heroFired += s.heroFired; a.heroWon += s.heroWon; a.calSum += s.calSum; a.physSum += s.physSum;
      for (const [l, n] of Object.entries(s.lv)) a.lv[l] = (a.lv[l] || 0) + n;
    }
    console.log('\n### 종족별 (physical 통합)');
    console.log('종족 | 생애 | 평균 달력/육체 나이 | 최고 Lv | Lv6+ | Lv7+ | 영웅 발생 | 달성 | 최종 레벨 분포');
    for (const [id, a] of Object.entries(agg).sort((x, y) => y[1].lives - x[1].lives)) {
      const maxLv = Math.max(...Object.keys(a.lv).map(Number));
      console.log(`${id} | ${a.lives} | ${(a.calSum / a.lives).toFixed(1)} / ${(a.physSum / a.lives).toFixed(1)} | ${maxLv} | ${a.lv6} (${pct(a.lv6, a.lives)}) | ${a.lv7} (${pct(a.lv7, a.lives)}) | ${a.heroFired} | ${a.heroWon} | ${JSON.stringify(a.lv)}`);
    }
  }
  console.log(failures.length ? '\nFAIL\n' + failures.join('\n') : `\nPASS: ${jobs.length}개 하위 실행 전부 exit 0 / allRunsCompleted / completed=${RUNS} / allInvariantsPassed`);
  process.exitCode = failures.length ? 1 : 0;
})();
