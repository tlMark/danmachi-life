// v1.7.8-2i 결과 불변 검증(테스트 계획 §3e V1·V2·V4, §3d B2·B3).
// 같은 계측 러너(이 빌드의 test_runner.js)를 v1.7.7-r1 게임 코드와 2-i 게임 코드에 각각 붙여 같은 시드·모드로 실행하고
//   lifeDigest(기준값과도 대조) · rngCallDigest(생애별 Math.random 호출 수 해시) · rngCallsTotal · V4 경로 횟수 를 비교한다.
// 사용: node tests/equivalence_2i.js <v1.7.7-r1 압축 해제 폴더> [필터...]   필터 예: physical  off  calendar  newborn_parent_familia  physical/777
// 불일치·기준 해시 불일치·실행 오류 시 종료 코드 1. r1 폴더는 읽기만 하고 임시 폴더에 복사해 실행한다.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');
const R1_SCRIPT_SHA256 = '53bdfbb1b69e439f2bbe4153101ec5dbb8ffe1b343359706da4562d69c42607f';
const here = path.resolve(__dirname, '..');
const r1 = process.argv[2];
if (!r1) { console.error('사용: node tests/equivalence_2i.js <v1.7.7-r1 폴더> [필터...]'); process.exit(1); }
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(r1, 'script.js'))).digest('hex');
if (sha !== R1_SCRIPT_SHA256) { console.error('FAIL: r1 script.js sha256 불일치 ' + sha); process.exit(1); }
const base = JSON.parse(fs.readFileSync(path.join(here, 'logs', 'baseline_lifeDigest_v174.json'), 'utf8'));
const all = []; for (const [mode, seeds] of Object.entries(base.digests)) for (const [seed, expected] of Object.entries(seeds)) all.push([mode, seed, expected]);
const filters = process.argv.slice(3);
// 기준 json 에 없는 시드도 r1↔2-i 대조만 할 수 있다(예: newborn_parent_familia/777). 이 경우 기준값 대조는 생략.
const extra = filters.filter(f => /^(physical|calendar|off|newborn_parent_familia)\/\d+$/.test(f) && !all.some(([m, s]) => f === m + '/' + s)).map(f => [f.split('/')[0], f.split('/')[1], null]);
const unknown = filters.filter(f => !all.some(([m, s]) => f === m || f === m + '/' + s) && !extra.some(([m, s]) => f === m + '/' + s));
if (unknown.length) { console.error('FAIL: 알 수 없는 필터 ' + unknown.join(', ')); process.exit(1); }
const selected = (filters.length ? all.filter(([m, s]) => filters.some(f => f === m || f === m + '/' + s)) : all).concat(extra);

// r1 게임 코드 + 이 빌드의 계측 러너
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r1instr-'));
for (const f of ['data.js', 'events.js', 'script.js']) fs.copyFileSync(path.join(r1, f), path.join(tmp, f));
fs.mkdirSync(path.join(tmp, 'core'));
for (const f of fs.readdirSync(path.join(r1, 'core'))) fs.copyFileSync(path.join(r1, 'core', f), path.join(tmp, 'core', f));
fs.copyFileSync(path.join(here, 'test_runner.js'), path.join(tmp, 'test_runner.js'));
fs.mkdirSync(path.join(tmp, 'tests', 'lib'), { recursive: true });   // F1D4A P1: 러너가 쓰는 하네스 라이브러리도 함께 복사
for (const f of fs.readdirSync(path.join(here, 'tests', 'lib'))) fs.copyFileSync(path.join(here, 'tests', 'lib', f), path.join(tmp, 'tests', 'lib', f));

const run = (dir, mode, seed) => new Promise(resolve => {
  const env = { ...process.env, SIM_RUNS: String(base.runs), SIM_SEED: seed, SIM_HP_REGEN_MODE: mode === 'newborn_parent_familia' ? 'physical' : mode };
  delete env.SIM_NEWBORN_MEMBERSHIP; if (mode === 'newborn_parent_familia') env.SIM_NEWBORN_MEMBERSHIP = '1';
  const p = spawn('node', [path.join(dir, 'test_runner.js')], { env }); let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', () => {});
  p.on('close', code => {
    const dg = (out.match(/^lifeDigest:\s*(\d+)/m) || [])[1];
    const v8 = (out.match(/^v178:\s*(\{.*\})\s*$/m) || [])[1];
    resolve({ code, digest: dg ? Number(dg) : null, v178: v8 ? JSON.parse(v8) : null });
  });
});
const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
(async () => {
  let bad = 0;
  for (const [mode, seed, expected] of selected) {
    const [a, b] = await Promise.all([run(tmp, mode, seed), run(here, mode, seed)]);
    const checks = {
      exit0: a.code === 0 && b.code === 0,
      r1DigestBaseline: expected === null || a.digest === expected,
      digest2iBaseline: expected === null ? (a.digest !== null && a.digest === b.digest) : b.digest === expected,
      r1Has2iFalse: !!a.v178 && a.v178.has2i === false,
      build2iHas2iTrue: !!b.v178 && b.v178.has2i === true,
      rngCallDigest: !!a.v178 && !!b.v178 && a.v178.rngCallDigest === b.v178.rngCallDigest,
      rngCallsTotal: !!a.v178 && !!b.v178 && a.v178.rngCallsTotal === b.v178.rngCallsTotal,
      v4Paths: !!a.v178 && !!b.v178 && canon(a.v178.v4) === canon(b.v178.v4)
    };
    const ok = Object.values(checks).every(Boolean); if (!ok) bad += 1;
    console.log(`${ok ? 'SAME' : 'DIFF'} ${mode}/${seed}: digest r1=${a.digest} 2i=${b.digest} base=${expected} | rngCallDigest r1=${a.v178 && a.v178.rngCallDigest} 2i=${b.v178 && b.v178.rngCallDigest} | calls ${a.v178 && a.v178.rngCallsTotal}/${b.v178 && b.v178.rngCallsTotal} | godGoneShown ${b.v178 && b.v178.v4.godGoneShown}` + (ok ? '' : ' | FAIL ' + Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(',')));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `RESULT: FAIL ${bad}/${selected.length}` : `RESULT: PASS ${selected.length}/${selected.length}`);
  process.exitCode = bad ? 1 : 0;
})();
