// v1.7.8-2i-r3: D-3 계측 연결 변이 검사. 러너의 실제 래퍼 연결 3곳(① showEvent ② rollFamilia ③ endLife)과
// 추적 helper 내부를 각각 하나씩 제거한 사본을 임시 폴더에 만들어 실행하고, 모두 D-3 합성 테스트 실패·종료 코드 1 인지 확인한다.
// 변이 없는 사본은 종료 코드 0 이어야 한다. 원본 파일은 읽기만 한다.
// 사용: node tests/d3_wiring_mutation.js    (각 실행 SIM_RUNS=1, 약 10초씩)
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const stripAnsi = t => String(t).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'test_runner.js'), 'utf8');
const MUTATIONS = {
  none: null,
  // F1D4A P1: showEvent 래퍼가 "캡처 → 호출 → 반영" 으로 바뀌어 ① 은 캡처(임시 출력에 측정)와 반영(임시 출력을 sink 에 더함) 두 문장이 됐다. 둘 다 변이 대상이다.
  'remove ① showEvent 래퍼의 measurePolluted': "        measurePolluted('event', d3Sink.ids, d3);   // D-3 연결 ①",
  'remove ①b showEvent 반영 단계의 D-3 반영': "        for (const key of Object.keys(x.d3)) x.sinkOut[key] = (x.sinkOut[key] || 0) + x.d3[key];   // (a) D-3",
  'remove ② rollFamilia 래퍼의 trackSealedJoin': "        trackSealedJoin(mode, result, d3Sink.ids);   // D-3 연결 ②",
  'remove ③ endLife 래퍼의 measurePolluted': "        measurePolluted('endLife', d3Sink.ids, d3Sink.out);   // D-3 연결 ③",
  'remove helper 내부 id 추가': "        const last = open[open.length - 1]; if (last) ids.add(last.id);"
};
const copyDir = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { if (['logs', 'archive', 'node_modules'].includes(e.name)) continue; const s = path.join(a, e.name), d = path.join(b, e.name); e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); } };
let bad = 0;
for (const [name, needle] of Object.entries(MUTATIONS)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3mut-')); copyDir(root, dir);
  if (needle) {
    const n = src.split(needle).length - 1;
    if (n !== 1) { console.log(`FAIL ${name}: 변이 대상 문장 ${n}개(1개여야 함)`); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    const line = src.split('\n').find(l => l.includes(needle));
    fs.writeFileSync(path.join(dir, 'test_runner.js'), src.replace(line, '        /* MUTATION: ' + name + ' */'));
  }
  // 2ba-t1: 하위 프로세스 색상 출력 끔(FORCE_COLOR=0, NO_COLOR=1). 판정 전 ANSI 코드도 제거(아래 stripAnsi).
  const r = spawnSync('node', [path.join(dir, 'test_runner.js')], { env: { ...process.env, SIM_RUNS: '1', FORCE_COLOR: '0', NO_COLOR: '1' }, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (typeof r.stdout === 'string') r.stdout = stripAnsi(r.stdout); if (typeof r.stderr === 'string') r.stderr = stripAnsi(r.stderr);
  const out = (r.stdout || '') + (r.stderr || '');
  const d3fail = /D-3 synthetic polluted-sealed test failed: (\{[^}]*\})/.exec(out);
  const ok = needle ? (r.status === 1 && !!d3fail) : (r.status === 0 && /allInvariantsPassed: true/.test(out));
  if (!ok) bad++;
  const falseKeys = d3fail ? Object.entries(JSON.parse(d3fail[1])).filter(([, v]) => !v).map(([k]) => k).join(',') : '';
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: exit=${r.status}${needle ? ' 실패 항목=' + (falseKeys || '(없음)') : ''}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(bad ? `RESULT: FAIL ${bad}/${Object.keys(MUTATIONS).length}` : `RESULT: PASS ${Object.keys(MUTATIONS).length}/${Object.keys(MUTATIONS).length}`);
process.exitCode = bad ? 1 : 0;
