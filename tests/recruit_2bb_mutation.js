// v1.7.8-2bb 변이 검사: 2b-b 핵심 규칙을 하나씩 깨뜨린 사본에서 tests/recruit_2bb_test.js 가 실패(exit 1)하는지 확인한다.
// 사용: node tests/recruit_2bb_mutation.js   — 변이 미검출 또는 무변이 실패가 있으면 exit 1. 원본 파일은 수정하지 않는다(임시 사본).
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const COPY = ['data.js', 'events.js', 'script.js', 'core', 'tests/recruit_2bb_test.js'];
const MUTANTS = [
  ['M-RB1 심사에 주 RNG 사용', 'core/recruit.js', 'const roll = rng();', 'const roll = Math.random();'],
  ['M-RB2 쿨다운 제거', 'script.js', "if (lastRej && S.age - lastRej.at < T.rejectCooldownYears) return 'cooldown';", ''],
  ['M-RB3 application.current 미종료', 'script.js', '    S.application.current = null;\n    if (ev.outcome', '    if (ev.outcome'],
  ['M-RB4 거절 파밀리아 제외 제거', 'script.js', 'pickFamiliaCandidate(undefined, { exclude: recruitExcludedFamilias() })', 'pickFamiliaCandidate(undefined)'],
  ['M-RB5 거절해도 입단', 'script.js', "if (ev.outcome === 'accepted') {", 'if (true) {'],
  ['M-RB6 scout 도 신청 상태 생성', 'script.js', '        const before = (S.familiaHistory || []).length;', '        S.application.current = { route }; const before = (S.familiaHistory || []).length;'],
  ['M-RB7 join_hard chance 복원', 'events.js', "{ label: '끈질기게 문을 두드린다', text: '끈질기게 문을 두드렸다.', fx:", "{ label: '끈질기게 문을 두드린다', chance: { p: .55, stat: 'power', per: .01, ok: { fx: { familia: 'roll' } }, fail: { fx: {} } }, text: '끈질기게 문을 두드렸다.', fx:"],
  ['M-RB8 생애 상한 제거', 'script.js', "if (gen.length >= T.lifetimeApplicationCap) return 'lifetime_cap';", ''],
  ['M-RB9 합격 시 후보 재추첨(주 RNG +1)', 'script.js', 'rollFamilia(cand.id, mode);   // forcedId', 'rollFamilia(undefined, mode);   // forcedId']
];
function copyTree(dst) {
  for (const rel of COPY) {
    const src = path.join(ROOT, rel), to = path.join(dst, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(src, to, { recursive: true });
  }
}
function runTest(dir) { return spawnSync('node', [path.join(dir, 'tests/recruit_2bb_test.js')], { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } }); }
let bad = 0; const lines = [];
{ const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rb2bb-')); copyTree(d); const r = runTest(d); const ok = r.status === 0; if (!ok) bad++;
  lines.push((ok ? 'PASS ' : 'FAIL ') + 'M-RB0 무변이 사본 exit 0 — ' + (r.stdout.trim().split('\n').pop() || '')); fs.rmSync(d, { recursive: true, force: true }); }
for (const [id, file, from, to] of MUTANTS) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rb2bb-')); copyTree(d);
  const f = path.join(d, file), src = fs.readFileSync(f, 'utf8');
  if (src.split(from).length !== 2) { bad++; lines.push('FAIL ' + id + ' — 변이 대상 문자열이 1회가 아님'); fs.rmSync(d, { recursive: true, force: true }); continue; }
  fs.writeFileSync(f, src.replace(from, to));
  const r = runTest(d); const detected = r.status === 1;
  const fails = (r.stdout.match(/^FAIL .*$/mg) || []).map(s => s.slice(5, 40));
  if (!detected) bad++;
  lines.push((detected ? 'PASS ' : 'FAIL ') + id + ' 검출(exit ' + r.status + ') — ' + JSON.stringify(fails.slice(0, 4)));
  fs.rmSync(d, { recursive: true, force: true });
}
console.log(lines.join('\n'));
console.log(`RESULT: ${bad ? 'FAIL' : 'PASS'} ${lines.length - bad}/${lines.length}`);
process.exitCode = bad ? 1 : 0;
