// 외부 도구: 게임 폴더의 test_runner.js 를 4시드 × 4모드(48,000생애)로 실행하고, 출력 전체와 생애별 기록(SIM_LIFE_DUMP)을 저장한다.
// 사용: node run48k.js <게임폴더> <출력폴더>
const { spawn } = require('child_process'); const path = require('path'), fs = require('fs');
const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]); fs.mkdirSync(out, { recursive: true });
const SEEDS = ['20261104', '777', '314159', '8675309'], MODES = ['physical', 'calendar', 'off', 'newborn_parent_familia'];
const jobs = []; for (const m of MODES) for (const s of SEEDS) jobs.push([m, s]);
const PAR = Number(process.env.MAX_PARALLEL || 3);
const run = ([mode, seed]) => new Promise(res => {
  const env = { ...process.env, SIM_RUNS: '3000', SIM_SEED: seed, SIM_HP_REGEN_MODE: mode === 'newborn_parent_familia' ? 'physical' : mode, SIM_LIFE_DUMP: path.join(out, `life_${mode}_${seed}.json`), FORCE_COLOR: '0' };
  if (mode === 'newborn_parent_familia') env.SIM_NEWBORN_MEMBERSHIP = '1';
  const p = spawn('node', [path.join(root, 'test_runner.js')], { env }); let so = '';
  p.stdout.on('data', d => so += d); p.stderr.on('data', d => so += d);
  p.on('close', code => { fs.writeFileSync(path.join(out, `tr_${mode}_${seed}.log`), so + `\nexit=${code}\n`); res(code); });
});
(async () => { const q = jobs.slice(); const codes = [];
  await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const j = q.shift(); codes.push([j.join('/'), await run(j)]); } }));
  console.log(codes.map(c => c.join(' exit=')).join('\n')); })();
