// jobsince_test.js 변이 검사: 근속 기록 결함을 넣은 임시 사본에서 jobsince_test 가 실패(exit 1)하는지 확인한다.
// 사용: node tests/jobsince_mutation.js   — 변이 전부 검출 + 원본 통과일 때만 exit 0. 원본 파일은 수정하지 않는다(임시 폴더 사본만 변경).
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const HERE = path.resolve(__dirname, '..');
const TEST = path.join(__dirname, 'jobsince_test.js');
const GAME = ['data.js', 'events.js', 'script.js', 'core'];
const MUTANTS = [
  ['M1 같은 직업 재설정에도 갱신(조건 제거)', "if (previous !== job) S.jobSince = S.age;", "S.jobSince = S.age;"],
  ['M2 출생 초기화 누락', "job: 'child', jobSince: 0,", "job: 'child',"],
  ['M3 setJob 갱신 누락', "if (previous !== job) S.jobSince = S.age;", ""],
  ['M4 고용처 설정 시 jobSince 갱신(J-5 위반)', "S.employer = { id: org.id, label: org.label, kind: org.kind, since: S.age };", "S.employer = { id: org.id, label: org.label, kind: org.kind, since: S.age }; S.jobSince = S.age;"],
  ['M5 retired 전환 시 미갱신(J-6 위반)', "if (previous !== job) S.jobSince = S.age;", "if (previous !== job && job !== 'retired') S.jobSince = S.age;"],
  ['M6 갱신 기준을 육체 나이로', "if (previous !== job) S.jobSince = S.age;", "if (previous !== job) S.jobSince = Math.floor(S.physicalAge) + 1;"],
];
const copy = (src, dst) => { fs.mkdirSync(dst, { recursive: true }); for (const n of GAME) fs.cpSync(path.join(src, n), path.join(dst, n), { recursive: true }); };
const run = dir => spawnSync(process.execPath, [TEST, dir], { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
const lines = []; let bad = 0;
const base = run(HERE);
lines.push(`${base.status === 0 ? 'PASS' : 'FAIL'} M0 원본 통과 exit=${base.status}`); if (base.status !== 0) bad++;
for (const [name, from, to] of MUTANTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobsince-mut-')); copy(HERE, dir);
  const f = path.join(dir, 'script.js'); const src = fs.readFileSync(f, 'utf8');
  if (src.split(from).length !== 2) { bad++; lines.push(`FAIL ${name} — 변이 대상 문자열 1회 아님`); fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(f, src.replace(from, to));
  const r = run(dir); const fails = (r.stdout.match(/^FAIL .*/mg) || []).slice(0, 3);
  const caught = r.status === 1 && fails.length > 0;
  if (!caught) bad++;
  lines.push(`${caught ? 'PASS' : 'FAIL'} ${name} — exit=${r.status}, 검출 ${fails.length ? fails.map(x => x.slice(5, 60)).join(' / ') : '없음'}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(lines.join('\n'));
console.log(`결과: ${lines.length - bad}/${lines.length} 통과`);
process.exitCode = bad ? 1 : 0;
