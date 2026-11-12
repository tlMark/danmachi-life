// 외부 도구(게임 폴더 밖): 지정 폴더의 test_runner.js 를 10구성으로 실행해 lifeDigest·rngCallDigest 를 수집·비교한다.
// 사용: node digest10.js <게임폴더> <출력 json> [비교 json]
const { spawn } = require('child_process'); const path = require('path'), fs = require('fs');
const root = path.resolve(process.argv[2]), out = process.argv[3], cmp = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
const cfg = [['physical','777'],['physical','314159'],['physical','8675309'],['physical','20261104'],['calendar','20261104'],['newborn_parent_familia','20261104'],['off','777'],['off','314159'],['off','8675309'],['off','20261104']];
const PAR = Number(process.env.MAX_PARALLEL || 3);
function run([mode, seed]) { return new Promise(res => {
  const env = { ...process.env, SIM_RUNS: '3000', SIM_SEED: seed, SIM_HP_REGEN_MODE: mode === 'newborn_parent_familia' ? 'physical' : mode, FORCE_COLOR: '0' };
  if (mode === 'newborn_parent_familia') env.SIM_NEWBORN_MEMBERSHIP = '1';
  const p = spawn('node', [path.join(root, 'test_runner.js')], { env }); let so = '';
  p.stdout.on('data', d => so += d); p.stderr.on('data', d => so += d);
  p.on('close', code => { const g = re => { const m = so.match(re); return m ? m[1] : null; };
    res({ key: mode + '/' + seed, exit: code, lifeDigest: g(/^lifeDigest:\s*(\d+)/m), rngCallDigest: g(/rngCallDigest[":\s]*(\d+)/), completed: g(/^completed:\s*(\d+)/m), allInv: g(/^allInvariantsPassed:\s*(true|false)/m), exc: g(/^runtimeExceptions:\s*(\d+)/m) }); }); }); }
(async () => { const q = cfg.slice(), res = [];
  await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) res.push(await run(q.shift())); }));
  res.sort((a, b) => cfg.findIndex(c => c.join('/') === a.key) - cfg.findIndex(c => c.join('/') === b.key));
  let same = 0; for (const r of res) { const b = cmp && cmp.find(x => x.key === r.key); r.vsRef = b ? (b.lifeDigest === r.lifeDigest ? 'SAME' : 'DIFF') : 'n/a'; if (r.vsRef === 'SAME') same++;
    console.log(`${r.vsRef.padEnd(4)} ${r.key}: lifeDigest=${r.lifeDigest} rng=${r.rngCallDigest} exit=${r.exit} completed=${r.completed} inv=${r.allInv} exc=${r.exc}${b ? ' ref=' + b.lifeDigest : ''}`); }
  if (cmp) console.log(`SUMMARY: ${same}/${res.length} SAME vs ref`);
  fs.writeFileSync(out, JSON.stringify(res, null, 1)); })();
