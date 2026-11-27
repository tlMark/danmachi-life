'use strict';
// GA-INV-2 측정 사본 — 비간섭 비교(위임 범위: 측정 사본 시험). 같은 시드·생애 수로 ① 원본 러너(measure/base_f639c05/test_runner.js, f639c05 바이트 동일 사본)
// ② 측정 사본 러너(measure/measure_runner.js, 계측 모드 active)를 실행하고, 표준 출력 전체·생애별 기록(SIM_LIFE_DUMP)·RNG 지점 집계(SIM_RNG_SITES 의 tally)를 바이트 단위로 비교한다.
// 측정 러너의 측정 상태 줄은 표준 오류에만 나오므로 표준 출력 비교 대상이 아니다. 계측 보고(SIM_MEAS_REPORT)는 따로 기록한다.
// 사용: node measure/tests/meas_noninterf.js <작업 폴더> [생애 수=3000] [시드=20261104,777]
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const MDIR = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || '.'); fs.mkdirSync(WORK, { recursive: true });
const RUNS = process.argv[3] || '3000', SEEDS = (process.argv[4] || '20261104,777').split(',');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const run = (tag, runner, seed) => new Promise(res => {
  const f = n => path.join(WORK, `${tag}_${seed}.${n}`);
  const env = { ...process.env, SIM_RUNS: RUNS, SIM_SEED: seed, SIM_LIFE_DUMP: f('life.json'), SIM_RNG_SITES: f('sites.json'), SIM_MEAS_REPORT: f('meas.json') };
  const p = spawn(process.execPath, [runner], { env }); let so = '', se = '';
  p.stdout.on('data', d => so += d); p.stderr.on('data', d => se += d);
  p.on('close', code => { fs.writeFileSync(f('stdout.txt'), so); fs.writeFileSync(f('stderr.txt'), se); res({ code, so, se }); });
});
(async () => {
  const lines = []; let bad = 0;
  for (const seed of SEEDS) {
    const [a, b] = await Promise.all([run('base', path.join(MDIR, 'base_f639c05', 'test_runner.js'), seed), run('meas', path.join(MDIR, 'measure_runner.js'), seed)]);
    const rd = (t, n) => fs.readFileSync(path.join(WORK, `${t}_${seed}.${n}`));
    const tally = t => JSON.stringify(JSON.parse(rd(t, 'sites.json')).tally);
    const st = /measurement: state=(\S+)/.exec(b.se);
    let meas = null; try { meas = JSON.parse(rd('meas', 'meas.json')); } catch (_) {}
    const rows = [
      ['종료 코드', a.code === 0 && b.code === 0, `${a.code}/${b.code}`],
      ['측정 상태 active', !!st && st[1] === 'active', st && st[1]],
      ['표준 출력 바이트 동일', a.so === b.so, `${sha(a.so)} / ${sha(b.so)}`],
      ['생애별 기록 바이트 동일', rd('base', 'life.json').equals(rd('meas', 'life.json')), `${sha(rd('base', 'life.json'))} / ${sha(rd('meas', 'life.json'))}`],
      ['RNG 지점 집계(tally) 동일', tally('base') === tally('meas'), `${sha(tally('base'))} / ${sha(tally('meas'))}`],
      ['원본 러너 계측 보고 없음', !fs.existsSync(path.join(WORK, `base_${seed}.meas.json`)), ''],
      ['측정 보고 valid', !!meas && meas.verdict === 'valid', meas ? meas.verdict : '보고 없음'],
    ];
    const ld = /lifeDigest:\s*(\S+)/.exec(a.so);
    lines.push(`seed ${seed} runs ${RUNS} lifeDigest ${ld ? ld[1] : '?'}`);
    for (const [k, ok, d] of rows) { if (!ok) bad++; lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${k}${d ? ' — ' + d : ''}`); }
    if (meas) lines.push('  계측 보고: ' + JSON.stringify({ counters: meas.counters, postSeal: meas.postSeal, mutTotal: meas.mutTotal, maxDepth: meas.maxDepth, faultCount: meas.faultCount }));
  }
  console.log(lines.join('\n'));
  console.log(`RESULT: ${bad ? 'FAIL' : 'PASS'} (meas_noninterf, fails=${bad})`);
  process.exitCode = bad ? 1 : 0;
})();
