// T1-F/F-1 변이 시험: 결함을 넣은 임시 사본(F1_GAME_ROOT)에서 지정 테스트가 실패(exit 1)하는지 확인한다.
// 사용: node tests/f1_mutation.js   — 원본 통과 + 변이 전부 검출일 때만 exit 0. 원본 파일은 바꾸지 않는다(임시 폴더 사본만 변경).
// 범위: SV-M1~M4·SV-M2b(지급), RB-M1~M8·M10a~c(롤백 필드), F1-M(r9 §3.8), PF/HT 핵심(가드·세대 토큰). RB-M9·RT-M·RT-MI 는 f1_transition_test 안에서 실행한다.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const HERE = path.resolve(__dirname, '..');
const GAME = ['data.js', 'events.js', 'script.js', 'core'];
const T = n => path.join(__dirname, n + '.js');
const TR = 'f1_transition_test', JH = 'f1_joinhard_test', PF = 'followup_pf_test', HT = 'followup_halt_test';
const SNAP_BLOCK = `        const tenureYears = S.age - S.jobSince;
        const sev = Object.freeze({ job: S.job, jobSince: S.jobSince, age: S.age, tenureYears,
            eligible: S.job !== 'child' && S.job !== 'supporter' && S.job !== 'retired' && Number.isFinite(tenureYears) && tenureYears >= 5,
            employerId: S.employer ? S.employer.id : null, amount: SEVERANCE_AMOUNT });
        followupDiag('severance_snapshot', { sev });
`;
const MUTANTS = [
  // [이름, 테스트, [[파일, 원문, 대체문], ...]]
  ['SV-M1 ④에서 J-4 를 S 기준으로 재계산', TR, [['script.js', '        if (sev.eligible) {\n            if (Number.isFinite(sev.amount)', "        if (S.job !== 'child' && S.job !== 'supporter' && S.job !== 'retired' && S.age - S.jobSince >= 5) {\n            if (Number.isFinite(sev.amount)"]]],
  ['SV-M2 스냅숏 생성을 E-1 해제 이후로 이동(지급액은 같음 → employerId assert 로 검출)', TR, [['script.js', SNAP_BLOCK, ''], ['script.js', '        // ③ 주 직업 전환(C28)', SNAP_BLOCK + '        // ③ 주 직업 전환(C28)']]],
  ['SV-M2b 스냅숏 생성을 setJob 이후로 이동', TR, [['script.js', SNAP_BLOCK, ''], ['script.js', '        // ④ 퇴직금(C11·C13', SNAP_BLOCK + '        // ④ 퇴직금(C11·C13']]],
  ['SV-M3 ③ 확인 실패에도 계속 진행(지급)', TR, [['script.js', "throw new Error('recruit_after_fail: 서포터 전직 확인 실패');", 'void 0;']]],
  ['SV-M4 대상 아님에도 apply({valis:0}) 호출', TR, [['script.js', "                followupDiag('severance_amount_undecided', { tenureYears: sev.tenureYears, job: sev.job });\n            }\n        }", "                followupDiag('severance_amount_undecided', { tenureYears: sev.tenureYears, job: sev.job });\n            }\n        } else apply({ valis: 0 });"]]],
  ['SV-M5 액수 미결(null)인데 기본값 400 지급', TR, [['script.js', 'if (Number.isFinite(sev.amount) && sev.amount > 0) {\n                apply({ valis: sev.amount });', 'if (true) {\n                apply({ valis: sev.amount ?? 400 });']]],
  ['RB-M1 job·jobSince·flags 복원 제외', TR, [['script.js', "const ROLLBACK_VALUE_FIELDS = ['job', 'jobSince', ", 'const ROLLBACK_VALUE_FIELDS = ['], ['script.js', "['flags', 'employer', 'abil'].forEach", "['employer', 'abil'].forEach"]]],
  ['RB-M2 employer 복원 제외', TR, [['script.js', "['flags', 'employer', 'abil'].forEach", "['flags', 'abil'].forEach"]]],
  ['RB-M3 valis 복원 제외', TR, [['script.js', "'jobSince', 'valis', 'hp',", "'jobSince', 'hp',"]]],
  ['RB-M4 hp 복원 제외', TR, [['script.js', "'valis', 'hp', 'bond',", "'valis', 'bond',"]]],
  ['RB-M5 bond·feat·potential 복원 제외', TR, [['script.js', "'hp', 'bond', 'feat', 'potential', 'excelia',", "'hp', 'excelia',"]]],
  ['RB-M6 abil 복원 제외', TR, [['script.js', "['flags', 'employer', 'abil'].forEach", "['flags', 'employer'].forEach"]]],
  ['RB-M7 level·hidden·maxLevel·alias 복원 제외', TR, [['script.js', "'excelia', 'level', 'hidden', 'maxLevel', 'power', 'alias',", "'excelia', 'power',"]]],
  ['RB-M8 power 복원 제외', TR, [['script.js', "'maxLevel', 'power', 'alias',", "'maxLevel', 'alias',"]]],
  ['RB-M10a logHistory 절단 누락', TR, [['script.js', 'if (rb.logLen != null && Array.isArray(S.logHistory) && S.logHistory.length > rb.logLen) S.logHistory.length = rb.logLen;', '']]],
  ['RB-M10b logHistory 절단 1 과다(원래 마지막 항목 삭제)', TR, [['script.js', 'S.logHistory.length > rb.logLen) S.logHistory.length = rb.logLen;', 'S.logHistory.length > rb.logLen) S.logHistory.length = rb.logLen - 1;']]],
  ['RB-M10c levelHistory 원래 없음 → [] 로 남김', TR, [['script.js', '    if (!lh.has) delete S.levelHistory;', '    if (!lh.has) S.levelHistory = [];']]],
  ['RB-X catch 첫 문장 정지 누락(롤백 실패 시 정지 안 됨)', HT, [['script.js', '        progressHalted = true;                                      // X0', '        // X0 제거']]],
  ['RB-X2 원래 예외 대신 정리 오류를 던짐', HT, [['script.js', "        throw err;                                                  // X6", "        throw cleanupErrors.length ? new Error('cleanup') : err;"]]],
  ['F1-M1 fallback 재삽입(자동 서포터·400)', JH, [['events.js', "failText: '{familia}의 심사에서 탈락했다.', followup: 'recruit_after_fail' }", "failText: '{familia}의 심사에서 탈락했다.', followup: 'recruit_after_fail', fallback: { flags: ['supporter'], valis: 400 } }"]]],
  ['F1-M2 stay 선택 시 상태 변경', JH, [['script.js', "        if (optionId === 'stay') return;", "        if (optionId === 'stay') { S.valis += 1; return; }"]]],
  ['F1-M3 stay 선택 시 기존 직업 덮어쓰기', JH, [['script.js', "        if (optionId === 'stay') return;", "        if (optionId === 'stay') { setJob('supporter'); return; }"]]],
  ['F1-M4 서포터 선택 시 팔나 부여', TR, [['script.js', "        setJob('supporter');\n        if (!(S.job", "        setJob('supporter'); if (!S.flags.includes('falna')) S.flags.push('falna');\n        if (!(S.job"]]],
  ['F1-M5 서포터 선택 시 소속 부여', TR, [['script.js', "        setJob('supporter');\n        if (!(S.job", "        setJob('supporter'); if (!S.familia) S.familia = gachaData.familias.find(f => f.id === 'loki');\n        if (!(S.job"]]],
  ['F1-M6 후속 선택 시 application 추가 기록', JH, [['script.js', "        if (optionId === 'stay') return;", "        (S.application.blocked ||= []).push({ route: 'followup', at: S.age, reason: 'x' }); if (optionId === 'stay') return;"]]],
  ['F1-M7 거절 경로 후속 선택 누락', JH, [['script.js', "    if (spec.followup) createFollowup(spec.followup, { route, reason: 'rejected' });", '']]],
  ['F1-M8 치환자 있어도 접미사 부착', JH, [['script.js', "failText.split('{familia}').join(cand.label) : failText", "failText.split('{familia}').join(cand.label) + ` (${cand.label} 심사 탈락)` : failText"]]],
  ['F1-M9 사망 판정 전 후속 화면(C27 위반)', JH, [['script.js', "    if (r.fx && r.fx.die) {\n        if (typeof r.fx.die === 'string') {", "    if (S.pendingFollowup) { S.pendingFollowup.phase = 'awaiting_choice'; renderFollowup(); return; }\n    if (r.fx && r.fx.die) {\n        if (typeof r.fx.die === 'string') {"]]],
  ['F1-M10 이미 서포터인데 서포터 선택지 노출', JH, [['script.js', "        if (S.job !== 'supporter') {\n            const label", "        if (true) {\n            const label"]]],
  ['PF-M1 nextYear 보류 가드 제거', PF, [['script.js', "    if (S && S.pendingFollowup) { followupDiag('nextyear_blocked'); return; }", '']]],
  ['PF-M2 endLife 대기 중 차단 제거', PF, [['script.js', "      if (p && p.phase !== 'resolving_event') { followupDiag('endlife_blocked'); return; }", '']]],
  ['PF-M3 중복 클릭 방지(phase 확정) 제거', PF, [['script.js', "    p.phase = 'resolving_choice'; $('choices').innerHTML = '';     // b. 확정", "    $('choices').innerHTML = '';"]]],
  ['HT-M1 생애 세대 토큰 검사 제거', HT, [['script.js', 'if (progressHalted || gen !== lifeGen) {', 'if (progressHalted) {']]],
  ['HT-M2 H1 가드(nextYear) 제거', HT, [['script.js', "    if (haltedEntry('nextYear')) return;   // H1 정지 가드\n", '']]],
  ['UI-M1 전직 후 상태창 갱신 누락(브라우저 검증에서 발견된 결함 재현)', TR, [['script.js', '    renderStats();                                                  // 상태창 갱신', '    // 상태창 갱신 제거']]],
  ['HT-M3 R-E 대신 일반 렌더', TR, [['script.js', "step('render', renderStatsFromClone);", "step('render', renderStats);"]]],
];
const copy = dst => { fs.mkdirSync(dst, { recursive: true }); for (const n of GAME) fs.cpSync(path.join(HERE, n), path.join(dst, n), { recursive: true }); };
const run = (dir, test) => spawnSync(process.execPath, [T(test)], { encoding: 'utf8', env: { ...process.env, F1_GAME_ROOT: dir, FORCE_COLOR: '0', NO_COLOR: '1' }, maxBuffer: 1 << 26 });
const lines = []; let bad = 0;
for (const t of [TR, JH, PF, HT]) { const r = run(HERE, t); const ok = r.status === 0; if (!ok) bad++; lines.push(`${ok ? 'PASS' : 'FAIL'} M0 원본 ${t} exit=${r.status} — ${(r.stdout.trim().split('\n').pop() || '')}`); }
for (const [name, test, edits] of MUTANTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-mut-')); copy(dir);
  let okEdit = true;
  for (const [file, from, to] of edits) { const f = path.join(dir, file), src = fs.readFileSync(f, 'utf8'); if (src.split(from).length !== 2) { okEdit = false; break; } fs.writeFileSync(f, src.replace(from, () => to)); }
  if (!okEdit) { bad++; lines.push(`FAIL ${name} — 변이 대상 문자열 1회 아님`); fs.rmSync(dir, { recursive: true, force: true }); continue; }
  const r = run(dir, test); const fails = (r.stdout.match(/^FAIL .*/mg) || []);
  const caught = r.status === 1 && fails.length > 0;
  if (!caught) bad++;
  lines.push(`${caught ? 'PASS' : 'FAIL'} ${name} [${test}] — exit=${r.status}, 검출 ${fails.length}건${fails.length ? ': ' + fails.slice(0, 2).map(x => x.slice(5, 70)).join(' / ') : ''}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(lines.join('\n'));
console.log(`RESULT: ${bad ? 'FAIL' : 'PASS'} ${lines.length - bad}/${lines.length}`);
process.exitCode = bad ? 1 : 0;
