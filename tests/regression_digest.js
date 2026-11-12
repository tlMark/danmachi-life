// 동작 회귀 비교: 같은 시드·모드에서 생애 요약 해시(lifeDigest)가 기준(logs/baseline_lifeDigest_v174.json)과 같은지 확인한다.
// 사용: node tests/regression_digest.js [필터...]   (일치하지 않으면 exit 1)
//   필터 없음 = 10개 구성 전부(약 40초×10). 시간 제한이 있는 환경은 나눠 실행: 예) physical  /  off  /  calendar newborn_parent_familia  /  physical/777
//   알 수 없는 필터나 일치하는 구성이 없으면 exit 1.
const { spawnSync } = require('child_process');
const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'logs', 'baseline_lifeDigest_v174.json'), 'utf8'));
const filters = process.argv.slice(2);
const all = []; for (const [mode, seeds] of Object.entries(base.digests)) for (const [seed, expected] of Object.entries(seeds)) all.push([mode, seed, expected]);
const unknown = filters.filter(f => !all.some(([m, s]) => f === m || f === m + '/' + s));
if (unknown.length) { console.error('FAIL: 알 수 없는 필터 ' + unknown.join(', ')); process.exit(1); }
const selected = filters.length ? all.filter(([m, s]) => filters.some(f => f === m || f === m + '/' + s)) : all;
let bad = 0, n = 0;
for (const [mode, seed, expected] of selected) {
  const env = { ...process.env, SIM_RUNS: String(base.runs), SIM_SEED: seed, SIM_HP_REGEN_MODE: mode === 'newborn_parent_familia' ? 'physical' : mode };
  if (mode === 'newborn_parent_familia') env.SIM_NEWBORN_MEMBERSHIP = '1';
  const r = spawnSync('node', [path.join(root, 'test_runner.js')], { env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = (r.stdout || '').match(/^lifeDigest:\s*(\d+)/m);
  const got = m ? Number(m[1]) : null; n += 1;
  const ok = r.status === 0 && got === expected;
  if (!ok) bad += 1;
  console.log(`${ok ? 'SAME ' : 'DIFF '} ${mode}/${seed}: baseline=${expected} now=${got} exit=${r.status}`);
}
console.log(bad ? `FAIL: ${bad}/${n} 불일치` : `PASS: ${n}개 구성 모두 기준과 동일${filters.length ? ' (필터: ' + filters.join(' ') + ', 전체 ' + all.length + '개 중)' : ''}`);
process.exitCode = bad ? 1 : 0;
