// T1-F F1-d4b 근속 기록(S.jobSince, J-1~J-6) 단위·경로 테스트. 각 테스트는 새 vm 컨텍스트(격리). 게임 코드에 테스트 훅 없음.
// 사용: node tests/jobsince_test.js [게임 폴더(기본: 이 저장소)]   — 실패 1건 이상이면 종료 코드 1.
// 범위: jobSince 초기화·갱신만. 퇴직금 지급·액수(F1-d4a)·fallback 제거·후속 선택은 미구현 범위이므로 검사하지 않는다.
const fs = require('fs'), vm = require('vm'), path = require('path');
const HERE = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
function el() {
  const e = { style: {}, kids: [], classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, scrollIntoView() {},
    appendChild(c) { this.kids.push(c); c.isConnected = true; return c; }, querySelectorAll() { return this.kids; }, textContent: '', innerText: '', checked: false };
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { e.kids = []; } });
  return e;
}
function makeCtx(seed = 20261104) {
  const els = {}; const document = { getElementById: id => (els[id] ||= el()), createElement: () => el(), querySelectorAll: () => [] };
  let state = seed >>> 0, calls = 0; const M = Object.create(Math);
  M.random = () => { calls++; state += 0x6D2B79F5; let v = state; v = Math.imul(v ^ (v >>> 15), v | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
  const ctx = vm.createContext({ document, window: { scrollTo() {} }, setTimeout() {}, console, Math: M });
  vm.runInContext(FILES.map(f => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n;\n'), ctx, { filename: 'game.js' });
  const G = code => vm.runInContext(code, ctx);
  return { ctx, G, S: () => G('S'), calls: () => calls };
}
const out = []; let failed = 0;
const check = (id, c, d) => { if (!c) failed++; out.push((c ? 'PASS ' : 'FAIL ') + id + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); };
const test = (id, fn) => { try { fn(); } catch (e) { failed++; out.push('FAIL ' + id + ' — 예외 ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const setAge = (s, a) => { s.age = a; s.chronologicalAge = a; s.phase = a; s.physicalAge = a; };
const fresh = (seed, age) => { const T = makeCtx(seed); T.G('startLife()'); const s = T.S(); if (age !== undefined) setAge(s, age); return { T, s }; };
// J-4 자격식(사양 대조용, 게임 코드에는 판정 함수 없음 — 이번 승인 범위는 기록 필드만).
const eligible = s => s.job !== 'child' && s.job !== 'supporter' && s.job !== 'retired' && s.age - s.jobSince >= 5;

test('JS-1 출생 jobSince === 0 (J-2)', () => {
  for (const seed of [1, 777, 20261104, 314159]) { const { s } = fresh(seed); check('JS-1 seed ' + seed, s.jobSince === 0 && s.job === 'child', { job: s.job, jobSince: s.jobSince }); }
  const { T, s } = fresh(5, 30); T.G("setJob('merchant')");
  T.G('startLife()'); const s2 = T.S();
  check('JS-1b 새 생애 시작 시 0 으로 초기화(이전 생애 값 미승계)', s.jobSince === 30 && s2 !== s && s2.jobSince === 0 && s2.job === 'child', { prev: s.jobSince, now: s2.jobSince });
});
test('JS-2 child → 실제 직업: 현재 S.age (J-1·J-3)', () => {
  const { T, s } = fresh(7, 17); T.G("setJob('merchant')");
  check('JS-2', s.job === 'merchant' && s.jobSince === 17, { job: s.job, jobSince: s.jobSince });
});
test('JS-3 같은 직업 재설정: 기존 jobSince 유지 (J-3)', () => {
  const { T, s } = fresh(7, 17); T.G("setJob('farmer')"); setAge(s, 25); T.G("setJob('farmer')");
  check('JS-3', s.job === 'farmer' && s.jobSince === 17, { jobSince: s.jobSince });
});
test('JS-4 다른 직업으로 변경: 현재 나이로 갱신 (J-3, C15)', () => {
  const { T, s } = fresh(7, 15); T.G("setJob('farmer')"); setAge(s, 24); T.G("setJob('healer')");
  check('JS-4', s.job === 'healer' && s.jobSince === 24, { jobSince: s.jobSince });
});
test('JS-5 retired 전환: 현재 나이로 갱신 (J-6) — 실제 경로 3종', () => {
  { const { T, s } = fresh(9, 14); T.G("setJob('adventurer')"); setAge(s, 31); T.G("apply({ clearFlags: ['adventurer'] })");
    check('JS-5a clearFlags 경로(490)', s.job === 'retired' && s.jobSince === 31, { job: s.job, jobSince: s.jobSince }); }
  { const { T, s } = fresh(9, 14); T.G("setJob('supporter')"); setAge(s, 29); T.G("apply({ dropFamilia: true })");
    check('JS-5b dropFamilia 경로(491)', s.job === 'retired' && s.jobSince === 29, { job: s.job, jobSince: s.jobSince }); }
  { const { T, s } = fresh(9, 14); T.G("setJob('guild_staff')"); setAge(s, 40); T.G("apply({ job: 'retired' })");
    check('JS-5c fx.job retired 경로(463)', s.job === 'retired' && s.jobSince === 40, { job: s.job, jobSince: s.jobSince }); }
});
test('JS-6 retired 상태: 이전 직업 근속 비합산 (J-4·J-6)', () => {
  const { T, s } = fresh(11, 10); T.G("setJob('merchant')"); setAge(s, 20);
  check('JS-6a merchant 10년 근속 시점 자격식 true', eligible(s) && s.age - s.jobSince === 10);
  T.G("apply({ job: 'retired' })"); setAge(s, 26);
  check('JS-6b retired 6년: 근속 = 6(retired 기간만, 이전 10년 미합산)', s.jobSince === 20 && s.age - s.jobSince === 6, { jobSince: s.jobSince });
  check('JS-6c retired 는 자격식 false', eligible(s) === false);
  const c = fresh(11, 3); setAge(c.s, 18);
  check('JS-6d child 18년(출생부터): 자격식 false', c.s.job === 'child' && c.s.age - c.s.jobSince === 18 && eligible(c.s) === false);
  const sp = fresh(11, 10); sp.T.G("setJob('supporter')"); setAge(sp.s, 20);
  check('JS-6e supporter 10년: 자격식 false(전직 대상과 같음)', eligible(sp.s) === false);
  const b = fresh(11, 10); b.T.G("setJob('blacksmith')"); setAge(b.s, 14);
  check('JS-6f 4년 false / 5년 경계 true', eligible(b.s) === false && (setAge(b.s, 15), eligible(b.s) === true));
});
test('JS-7 joinOrganization: 직업 변경 vs 고용처만 변경 (J-5)', () => {
  { const { T, s } = fresh(13, 16); T.G("apply({ organization: 'guild' })");
    check('JS-7a child → guild: job guild_staff, jobSince = 16, employer.since = 16', s.job === 'guild_staff' && s.jobSince === 16 && s.employer && s.employer.id === 'guild' && s.employer.since === 16, { job: s.job, jobSince: s.jobSince, employer: s.employer }); }
  { const { T, s } = fresh(13, 12); T.G("setJob('merchant')"); setAge(s, 19); T.G("apply({ organization: 'hostess' })");
    check('JS-7b merchant → hostess 고용: 직업 불변, jobSince 불변(12), employer.since = 19', s.job === 'merchant' && s.jobSince === 12 && s.employer && s.employer.id === 'hostess' && s.employer.since === 19, { job: s.job, jobSince: s.jobSince, employer: s.employer }); }
  { const { T, s } = fresh(13, 16); T.G("apply({ organization: 'guild' })"); setAge(s, 22); T.G("apply({ organization: 'hostess' })");
    check('JS-7c 고용처만 변경(guild → hostess, 직업 guild_staff 유지): jobSince 16 유지, employer.since 22', s.job === 'guild_staff' && s.jobSince === 16 && s.employer.id === 'hostess' && s.employer.since === 22, { job: s.job, jobSince: s.jobSince, employer: s.employer }); }
  { const { T, s } = fresh(13, 16); T.G("setJob('farmer')"); const e0 = s.employer; setAge(s, 30); T.G("setJob('healer')");
    check('JS-7d setJob 은 S.employer 를 건드리지 않음', s.employer === e0); }
});
test('JS-8 모든 직업 변경 경로: 변경 시 갱신, 미변경 시 유지 (누락·중복 없음)', () => {
  const cases = [
    ['fx.job(463)', s => {}, "apply({ job: 'merchant' })", 'merchant', true],
    ['supporter 플래그·child(464)', s => {}, "apply({ flags: ['supporter'] })", 'supporter', true],
    ['supporter 플래그·기존 직업(464 미진입)', T => T.G("setJob('farmer')"), "apply({ flags: ['supporter'] })", 'farmer', false],
    ['soldier 플래그(465)', s => {}, "apply({ flags: ['soldier'] })", 'soldier', true],
    ['soldier 플래그·이미 soldier(465 미진입)', T => T.G("setJob('soldier')"), "apply({ flags: ['soldier'] })", 'soldier', false],
    ['clearFlags·모험자(490)', T => T.G("setJob('adventurer')"), "apply({ clearFlags: ['adventurer'] })", 'retired', true],
    ['clearFlags·비모험자(490 미진입)', T => T.G("setJob('healer')"), "apply({ clearFlags: ['adventurer'] })", 'healer', false],
    ['dropFamilia·모험자(491)', T => T.G("setJob('adventurer')"), "apply({ dropFamilia: true })", 'retired', true],
    ['dropFamilia·상인(491 미진입)', T => T.G("setJob('merchant')"), "apply({ dropFamilia: true })", 'merchant', false],
    ['joinOrganization·child(523)', s => {}, "apply({ organization: 'guild' })", 'guild_staff', true],
    ['joinOrganization·기존 직업(523 미진입)', T => T.G("setJob('farmer')"), "apply({ organization: 'guild' })", 'farmer', false],
    ['rollFamilia·child·hephaestus(546)', s => {}, "rollFamilia('hephaestus')", 'blacksmith', true],
    ['rollFamilia·기존 직업(546 미진입)', T => T.G("setJob('farmer')"), "rollFamilia('hephaestus')", 'farmer', false],
  ];
  for (const [name, prep, code, expJob, changed] of cases) {
    const { T, s } = fresh(21, 14); prep(T); const since0 = s.jobSince; setAge(s, 23); T.G(code);
    const ok = s.job === expJob && (changed ? s.jobSince === 23 : s.jobSince === since0);
    check('JS-8 ' + name, ok, { job: s.job, jobSince: s.jobSince, since0 });
  }
});
test('JS-9 정적 구조: S.job 대입은 setJob 한 곳 + 출생 초기값, jobSince 쓰기는 2곳뿐', () => {
  const src = fs.readFileSync(path.join(HERE, 'script.js'), 'utf8');
  const jobAssign = (src.match(/\bS\.job\s*=(?!=)/g) || []).length;
  const sinceWrites = (src.match(/\bS\.jobSince\s*=(?!=)/g) || []).length;
  const initHas = /cause: '', job: 'child', jobSince: 0,/.test(src);
  const setJobBody = (src.match(/function setJob\(job\) \{[\s\S]*?\n\}/) || [''])[0];
  check('JS-9a S.job 대입 1곳(setJob)', jobAssign === 1 && /S\.job = job;/.test(setJobBody), { jobAssign });
  check('JS-9b jobSince 쓰기 = setJob 안 1곳 + 출생 리터럴', sinceWrites === 1 && /if \(previous !== job\) S\.jobSince = S\.age;/.test(setJobBody) && initHas, { sinceWrites, initHas });
  const other = fs.readdirSync(path.join(HERE, 'core')).map(f => fs.readFileSync(path.join(HERE, 'core', f), 'utf8')).concat(['data.js', 'events.js'].map(f => fs.readFileSync(path.join(HERE, f), 'utf8'))).join('\n');
  check('JS-9c core·data·events 에 S.job/jobSince 직접 대입 없음', !/\bS\.job\s*=(?!=)|jobSince\s*=(?!=)/.test(other));
});
test('JS-10 RNG·다른 상태 무관 (기록 전용)', () => {
  const { T, s } = fresh(31, 18); const c0 = T.calls(); T.G("setJob('merchant')"); T.G("setJob('merchant')"); T.G("setJob('farmer')");
  check('JS-10a setJob 난수 호출 0', T.calls() === c0, { d: T.calls() - c0 });
  const keys = Object.keys(s).filter(k => k !== 'jobSince');
  const A = fresh(31, 18), B = fresh(31, 18);
  A.T.G("setJob('merchant')"); B.T.G("setJob('merchant')"); B.s.jobSince = 999;
  const strip = x => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'jobSince')));
  check('JS-10b jobSince 값이 달라도 나머지 상태 동일(결합 없음)', strip(A.s) === strip(B.s) && keys.length > 10);
});

console.log(`jobsince_test target=${HERE}`);
console.log(out.join('\n'));
console.log(`결과: ${out.length - failed}/${out.length} 통과, 실패 ${failed}`);
process.exitCode = failed ? 1 : 0;
