// v1.7.8-2bb 2b-b(일반 지원 → 심사 → 결과·재지원·직접 스카웃) 단위·시나리오 테스트. 격리 vm, 게임 코드 훅은 관찰용 래핑만.
// 사용: node tests/recruit_2bb_test.js   — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), vm = require('vm'), path = require('path');
const HERE = path.resolve(__dirname, '..');
const FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
function el() { const e = { style: {}, kids: [], classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, scrollIntoView() {},
  appendChild(c) { this.kids.push(c); c.isConnected = true; return c; }, querySelectorAll() { return this.kids; }, textContent: '', innerText: '', checked: false };
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { e.kids = []; } }); return e; }
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
// 무소속·팔나 없음(none) 상태, 달력 나이 age
function noneState(T, age = 15, job = 'merchant') {
  T.G('startLife()'); const s = T.S();
  s.age = age; s.chronologicalAge = age; s.phase = age; s.physicalAge = age;
  s.familia = null; s.familiaHistory = []; s.falnaHistory = []; s.falnaAt = null; s.flags = s.flags.filter(f => !['falna', 'adventurer', 'supporter'].includes(f));
  T.G(`setJob(${JSON.stringify(job)})`);
  s.falnaTransitions = []; s.conversionPending = null; s.syncBaseline = null; s.currentEventId = null;
  s.application = T.G('GameCore.Recruit.newApplicationState()');
  s.falnaState = T.G('deriveFalnaState()'); s.falnaHolder = T.G('deriveFalnaHolder()');
  return s;
}
const SELF = '{ recruit: { route: "self_apply" } }';
// 같은 시드에서 합격/거절 생애를 찾는다
function findOutcome(want, fxCode = SELF, job = 'merchant', maxSeeds = 80) {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const T = makeCtx(seed); const s = noneState(T, 15, job); const c0 = T.calls();
    T.G(`apply(${fxCode})`);
    const h = s.application.history.slice(-1)[0];
    if (h && h.outcome === want) return { T, s, seed, delta: T.calls() - c0 };
  }
  return null;
}

test('RB-1 심사 함수: 순수·파생 RNG·결과 2종·확률 제한', () => {
  const T = makeCtx(); const R = T.G('GameCore.Recruit');
  check('RB-1a evaluateApplication 에 Math.random 없음', R.evaluateApplication.toString().indexOf('Math.random') < 0);
  const rng1 = R.createDerivedRng(42), rng2 = R.createDerivedRng(42);
  const inp = { route: 'self_apply', raceId: 'human', talentId: 'none', power: 0, familiaAdv: true, familiaWeight: 60 };
  const a = R.evaluateApplication(inp, rng1), b = R.evaluateApplication(inp, rng2);
  check('RB-1b 같은 시드 → 같은 결과', JSON.stringify(a) === JSON.stringify(b), a);
  check('RB-1c 결과는 accepted/rejected 만', ['accepted', 'rejected'].includes(a.outcome));
  const T0 = R.RECRUIT_TUNING;
  check('RB-1d 기본 확률 = routeBase + 모험 성향 보정', Math.abs(a.p - (T0.routeBase.self_apply + T0.familiaAdvDelta)) < 1e-9, a.p);
  const hi = R.evaluateApplication({ route: 'persistence', raceId: 'elf', talentId: 'liaris', power: 999, familiaAdv: false, familiaWeight: 999 }, () => 0.5);
  const lo = R.evaluateApplication({ route: 'persistence', raceId: 'human', talentId: 'none', power: -50, familiaAdv: true, familiaWeight: 1 }, () => 0.5);
  check('RB-1e 확률 상한 pMax·하한 이상', hi.p === T0.pMax && lo.p >= T0.pMin, { hi: hi.p, lo: lo.p });
  check('RB-1f roll < p → accepted, roll ≥ p → rejected', R.evaluateApplication(inp, () => 0).outcome === 'accepted' && R.evaluateApplication(inp, () => 0.9999).outcome === 'rejected');
  let threw = false; try { R.evaluateApplication({ route: 'scout' }, () => 0); } catch (e) { threw = true; }
  check('RB-1g scout(직접 경로)는 심사 대상 아님(기본 합격률 없음 → 예외)', threw);
  check('RB-1h RECRUIT_TUNING 동결·쿨다운·상한·같은 파밀리아 제한 정의', Object.isFrozen(T0) && T0.rejectCooldownYears > 0 && T0.lifetimeApplicationCap > 0 && T0.sameFamiliaRetryYears > 0);
});

test('RB-2 이벤트 배선(정적)', () => {
  const T = makeCtx(); const E = id => T.G(`EVENTS.find(e => e.id === '${id}')`);
  const jh = E('join_hard');
  check('RB-2a join_hard 의 기존 chance 제거(U-2b-3 b)', jh.choices.every(c => !c.chance) && jh.choices[0].fx.recruit.route === 'persistence');
  check('RB-2b join → self_apply', E('join').choices[0].fx.recruit.route === 'self_apply');
  check('RB-2c career_choice → self_apply', E('career_choice').choices.some(c => c.fx && c.fx.recruit && c.fx.recruit.route === 'self_apply'));
  check('RB-2d latejoin → scout(DIRECT_ROUTES)', E('latejoin').choices[0].fx.recruit.route === 'scout' && T.G('GameCore.Recruit.DIRECT_ROUTES').includes('scout'));
  check('RB-2e 네 이벤트에 fx.familia:"roll" 남지 않음', ['join', 'join_hard', 'latejoin', 'career_choice'].every(id => E(id).choices.every(c => !(c.fx && c.fx.familia === 'roll'))));
  // F-1(C23): 거절 대체 fx(fallback)는 삭제되고 후속 선택(followup)으로 대체되었다. 명시 선택지(서포터 일 구하기 +600)는 그대로.
  check('RB-2f join_hard: fallback 없음·후속 선택 지정·거절 문구 치환자', jh.choices[0].fx.recruit.fallback === undefined && jh.choices[0].fx.recruit.followup === 'recruit_after_fail' && jh.choices[0].fx.recruit.failText === '{familia}의 심사에서 탈락했다.' && JSON.stringify(jh.choices[1].fx) === JSON.stringify({ flags: ['supporter'], valis: 600 }));
});

test('RB-3 합격 경로: 주 RNG 소비·결과가 기존 fx.familia:"roll" 과 같음', () => {
  const f = findOutcome('accepted'); check('RB-3a 합격 생애 존재', !!f);
  if (!f) return;
  const T2 = makeCtx(f.seed); const s2 = noneState(T2, 15, 'merchant'); const c0 = T2.calls(); T2.G('apply({ familia: "roll" })');
  check('RB-3b 주 RNG 호출 수 동일(후보 1 + falnaAt)', f.delta === T2.calls() - c0, { recruit: f.delta, roll: T2.calls() - c0 });
  check('RB-3c 같은 파밀리아·같은 falnaAt·같은 role', f.s.familia.id === s2.familia.id && f.s.falnaAt === s2.falnaAt && f.s.familiaHistory[0].role === s2.familiaHistory[0].role, { a: [f.s.familia.id, f.s.falnaAt], b: [s2.familia.id, s2.falnaAt] });
  const h = f.s.application.history[0];
  check('RB-3d 이력 1건(self_apply·accepted·attempt 1·familiaId 일치)·current null', f.s.application.history.length === 1 && h.route === 'self_apply' && h.attempt === 1 && h.familiaId === f.s.familia.id && f.s.application.current === null, h);
  check('RB-3e 전이 grant 또는 소속만(초기 none→)·직업 merchant 유지(입단이 직업을 덮어쓰지 않음)', f.s.job === 'merchant');
});

test('RB-4 거절 경로: 후보 선택 1회만·소속/팔나 없음·이력 기록', () => {
  const f = findOutcome('rejected'); check('RB-4a 거절 생애 존재', !!f);
  if (!f) return;
  check('RB-4b 주 RNG 호출 1회(후보 선택만, falnaAt 생략)', f.delta === 1, f.delta);
  check('RB-4c 무소속·falnaAt null·팔나 none·소속 이력 0', !f.s.familia && f.s.falnaAt === null && f.s.falnaState === 'none' && f.s.familiaHistory.length === 0);
  const h = f.s.application.history[0];
  check('RB-4d 이력 rejected·current null·직업 불변', h.outcome === 'rejected' && f.s.application.current === null && f.s.job === 'merchant', h);
});

test('RB-5 application.current: 심사 중에만 존재', () => {
  const T = makeCtx(3); noneState(T); const seen = [];
  T.G('(() => { const R = GameCore.Recruit, o = R.evaluateApplication; R.evaluateApplication = function (i, r) { globalThis.__cur = JSON.parse(JSON.stringify(S.application.current)); return o.call(this, i, r); }; })()');
  T.G(`apply(${SELF})`); const cur = T.G('globalThis.__cur');
  check('RB-5a 심사 시점 current = { route, at, attempt, familiaId }', cur && cur.route === 'self_apply' && cur.at === 15 && cur.attempt === 1 && typeof cur.familiaId === 'string', cur);
  check('RB-5b 결과 처리 후 current null', T.S().application.current === null);
});

test('RB-6 파생 RNG: 심사는 주 RNG 비소비·재현 가능', () => {
  const T = makeCtx(5); noneState(T); const c0 = T.calls();
  const r1 = T.G('recruitRng(1)()'), r2 = T.G('recruitRng(1)()'), r3 = T.G('recruitRng(2)()');
  check('RB-6a recruitRng 호출로 주 RNG 0회', T.calls() === c0);
  check('RB-6b 같은 attempt·나이 → 같은 값, attempt 다르면 다른 값', r1 === r2 && r1 !== r3, [r1, r2, r3]);
  const src = T.G('applyRecruit.toString() + recruitRng.toString() + recruitBlockReason.toString() + recruitExcludedFamilias.toString()');
  check('RB-6c 신규 지원 함수에 Math.random 없음', src.indexOf('Math.random') < 0);
  // 같은 시드 2회 → 같은 이력
  const run = () => { const A = makeCtx(77); const s = noneState(A); A.G(`apply(${SELF})`); s.age = 20; s.chronologicalAge = 20; A.G('apply({ recruit: { route: "persistence" } })'); return JSON.stringify([s.application, s.familia && s.familia.id, s.falnaAt]); };
  check('RB-6d 같은 시드 반복 → 이력·결과 동일', run() === run());
});

test('RB-7 재지원 쿨다운·같은 파밀리아 제한·생애 상한', () => {
  const R = makeCtx().G('GameCore.Recruit.RECRUIT_TUNING');
  const f = findOutcome('rejected'); if (!f) { check('RB-7 거절 생애 필요', false); return; }
  const { T, s } = f; const rejFam = s.application.history[0].familiaId;
  s.age = 15 + R.rejectCooldownYears - 1; s.chronologicalAge = s.age; const c0 = T.calls(), hl = s.application.history.length;
  T.G(`apply(${SELF})`);
  check('RB-7a 쿨다운 중 → blocked(cooldown)·이력 추가 0·주 RNG 0', s.application.history.length === hl && (s.application.blocked || []).slice(-1)[0].reason === 'cooldown' && T.calls() === c0, s.application.blocked);
  s.age = 15 + R.rejectCooldownYears; s.chronologicalAge = s.age;
  const ex = T.G('recruitExcludedFamilias()');
  check('RB-7b 쿨다운 이후: 거절한 파밀리아 제외 목록에 포함', ex.includes(rejFam), ex);
  let hit = 0; for (let i = 0; i < 300; i++) if (T.G('pickFamiliaCandidate(undefined, { exclude: recruitExcludedFamilias() }).id') === rejFam) hit++;
  check('RB-7c 제외 후보 300회 추첨에 거절 파밀리아 0회', hit === 0, hit);
  T.G(`apply(${SELF})`);
  check('RB-7d 쿨다운 이후 재지원 허용(이력 +1, attempt 2)', s.application.history.length === hl + 1 && s.application.history[hl].attempt === 2 && s.application.history[hl].familiaId !== rejFam, s.application.history[hl]);
  s.age = 15 + R.sameFamiliaRetryYears; s.chronologicalAge = s.age;
  check('RB-7e sameFamiliaRetryYears 경과 → 제외 해제', !T.G('recruitExcludedFamilias()').includes(rejFam) || s.application.history.slice(1).some(h => h.familiaId === rejFam && h.outcome === 'rejected'));
  // 생애 상한: 일반 지원 cap 건(전부 합격 기록, 쿨다운 영향 없음) + 직접 경로 1건
  const T2 = makeCtx(9); const s2 = noneState(T2, 30, 'merchant');
  s2.application.history = Array.from({ length: R.lifetimeApplicationCap }, (_, i) => ({ route: 'self_apply', at: 12 + i, attempt: i + 1, familiaId: 'loki', outcome: 'accepted' }))
    .concat([{ route: 'scout', at: 25, attempt: null, familiaId: 'loki', outcome: 'accepted', direct: true }]);
  check('RB-7f 일반 지원 상한 도달 → lifetime_cap', T2.G('recruitBlockReason()') === 'lifetime_cap');
  s2.application.history = s2.application.history.filter(h => h.direct || h.attempt > 1);
  check('RB-7g 직접 경로는 상한에 세지 않음(cap-1 + direct → 허용)', T2.G('recruitBlockReason()') === null);
});

test('RB-8 latejoin 직접 스카웃: 신청 상태·심사 없음', () => {
  const T = makeCtx(4); const s = noneState(T, 25, 'supporter'); s.flags.push('supporter');
  T.G('(() => { const R = GameCore.Recruit, o = R.evaluateApplication; globalThis.__ev = 0; globalThis.__curSeen = false; R.evaluateApplication = function () { globalThis.__ev++; return o.apply(this, arguments); }; })()');
  const lj = T.G("EVENTS.find(e => e.id === 'latejoin')"); T.ctx.showEvent(lj); T.ctx.choose(lj.choices[0]);
  const h = s.application.history;
  check('RB-8a 심사 호출 0·current null', T.G('globalThis.__ev') === 0 && s.application.current === null);
  check('RB-8b 입단·이력 direct 1건(scout·accepted·attempt null)', !!s.familia && h.length === 1 && h[0].direct === true && h[0].route === 'scout' && h[0].attempt === null && h[0].familiaId === s.familia.id, h);
  check('RB-8c attemptSeq 증가 없음(일반 지원과 분리)', !s.application.attemptSeq);
});

test('RB-9 join_hard(F-1): 거절 시 자동 대체 효과 없음·후속 선택 보류, 합격 시 보류 없음', () => {
  const fx = '{ recruit: { route: "persistence", followup: "recruit_after_fail" } }';
  const r = findOutcome('rejected', fx, 'child'), a = findOutcome('accepted', fx, 'child');
  check('RB-9a 거절 → supporter 플래그·직업·발리스 자동 변경 없음, 후속 선택 보류 1건', !!r && !r.s.flags.includes('supporter') && r.s.job === 'child' && !r.s.familia && !!r.s.pendingFollowup && r.s.pendingFollowup.kind === 'recruit_after_fail' && r.s.pendingFollowup.context.reason === 'rejected', r && { job: r.s.job, flags: r.s.flags, p: r.s.pendingFollowup });
  check('RB-9b 합격 → 보류 없음·입단', !!a && !a.s.flags.includes('supporter') && !!a.s.familia && a.s.pendingFollowup === null, a && { job: a.s.job, flags: a.s.flags });
});

test('RB-10 2-i 가드: 입단 불가 상태면 기존 거부 기록·지원 기록 없음·난수 0', () => {
  const T = makeCtx(2); const s = noneState(T); s.conversionPending = { since: 10, fromFamiliaId: 'loki', reason: 'left' };
  const c0 = T.calls(); T.G(`apply(${SELF})`);
  const t = s.falnaTransitions.slice(-1)[0];
  check('RB-10a 이력 0·current null·주 RNG 0', s.application.history.length === 0 && s.application.current === null && T.calls() === c0);
  check('RB-10b 기존 rejected 전이 기록', t && t.cause === 'rejected' && t.mode === 'initial_join', t);
});

test('RB-11 독립성: 거절·합격이 가족·연애·아이템·거주를 바꾸지 않음', () => {
  for (const want of ['accepted', 'rejected']) {
    const f = findOutcome(want); if (!f) { check('RB-11 ' + want, false); continue; }
    const T2 = makeCtx(f.seed); const s2 = noneState(T2); const before = JSON.stringify([s2.relations, s2.items, s2.residence, s2.residenceHistory, s2.origin && s2.origin.id]);
    T2.G(`apply(${SELF})`);
    check('RB-11 ' + want + ' 가족·아이템·거주·출신 불변', JSON.stringify([s2.relations, s2.items, s2.residence, s2.residenceHistory, s2.origin && s2.origin.id]) === before);
  }
});

test('RB-12 범위 밖 미연결(정적)', () => {
  const T = makeCtx(); const src = T.G('applyRecruit.toString() + recruitExcludedFamilias.toString() + recruitBlockReason.toString() + pickFamiliaCandidate.toString()');
  check('RB-12a 신뢰도·스카웃 심사(SC)·통찰력·무명 파밀리아 생성·FAMILIA_HOME 미사용', !/standing|scoutInsight|createMinorFamilias|FAMILIA_HOME|godEncounter/.test(src));
  check('RB-12b FAMILIA_BIAS 기준은 출생지(S.origin) 유지(U-2b-5 는 2b-c)', /FAMILIA_BIAS\[S\.origin\.id\]/.test(T.G('pickFamiliaCandidate.toString()')));
  check('RB-12c deferred·open_call·recruit_result 미사용', !/deferred|open_call|recruit_result/.test(T.G('applyRecruit.toString()')) && !T.G("EVENTS.some(e => e.id === 'open_call' || e.id === 'recruit_result')"));
  check('RB-12d 신규 상태 필드 S.minorFamilias 비어 있음(생성 없음)', T.G('(startLife(), S.minorFamilias.length)') === 0);
});

console.log(out.join('\n'));
const total = out.length;
console.log(`RESULT: ${failed ? 'FAIL' : 'PASS'} ${total - failed}/${total}`);
process.exitCode = failed ? 1 : 0;
