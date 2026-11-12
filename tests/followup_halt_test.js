// T1-F 예외 처리·진행 정지·생애 세대 토큰 테스트 — 설계 r7 §1(RB-T10)·§5(HT-7), r6 §3~§5(HT-1~6, CT-7), PF-9·PF-14.
// 사용: node tests/followup_halt_test.js   (실패 1건 이상이면 종료 코드 1)
// 모든 사례는 [합성 상태 주입·예외 주입]: 시험용 kind·사건을 격리 vm 컨텍스트에 등록하고 예외를 강제로 낸다. 실제 생애 결과가 아니다.
// 정지 플래그는 컨텍스트마다 격리된다(T-A). 게임 코드에는 해제 API 가 없으며, 해제는 startLife 뿐이다.
const { makeCtx, makeReporter, snap } = require('./lib_f1_ctx');
const { check, test, finish } = makeReporter();
const EXC = ['pendingFollowup', 'currentEventId', 'syncBaseline'];

function setup(opts) {
  const T = makeCtx(opts); T.G('startLife()');
  T.G(`document.getElementById('choices').innerHTML = ''; S.currentEventId = null;
    globalThis.__res = 0; globalThis.__hook = null;
    FOLLOWUP_KINDS.t_kind = { prompt: '시험 안내',
      options: () => [{ id: 'go', label: '간다' }, { id: 'stay', label: '머문다', stay: true }],
      resolve: (S, id, p) => { globalThis.__res += 1; if (id === 'go') { S.bond += 3; S.valis += 100; setJob('merchant'); } if (globalThis.__hook) globalThis.__hook(); } };
    globalThis.__applyOrig = apply;
    apply = function (fx) { const r = globalThis.__applyOrig(fx); if (fx && fx.__followup) createFollowup(fx.__followup, { tag: 'x' }); return r; };
    globalThis.__ev = { id: 't_ev', text: '시험 사건', choices: [{ label: 'a', text: '결과', fx: { bond: 0, __followup: 't_kind' } }, { label: 'b', text: '평범한 결과', fx: { bond: 1 } }] };
    globalThis.__err = new Error('boom');
    globalThis.__spy = { clearTimers: 0, rollback: 0, render: 0, notice: 0, diag: 0 }; globalThis.__fail = {};
    { const o = clearAutoTimers; clearAutoTimers = function () { __spy.clearTimers++; if (__fail.clearTimers) throw new Error('f-clearTimers'); return o.apply(this, arguments); }; }
    { const o = restoreRollbackSnapshot; restoreRollbackSnapshot = function () { __spy.rollback++; if (__fail.rollback) throw new Error('f-rollback'); return o.apply(this, arguments); }; }
    { const o = renderStatsFromClone; renderStatsFromClone = function () { __spy.render++; if (__fail.render) throw new Error('f-render'); return o.apply(this, arguments); }; }
    { const o = showHaltNotice; showHaltNotice = function () { __spy.notice++; if (__fail.notice) throw new Error('f-notice'); return o.apply(this, arguments); }; }
    { const o = followupDiag; followupDiag = function (ev) { if (ev === 'followup_resolve_exception') { __spy.diag++; if (__fail.diag) throw new Error('f-diag'); } return o.apply(this, arguments); }; }
    globalThis.__spy.clearTimers = 0;`);
  return T;
}
const open = (T, i = 0) => { T.G('showEvent(globalThis.__ev)'); T.G(`choose(globalThis.__ev.choices[${i}])`); };
const diag = (T, ev) => T.G('followupDiagLog').filter(x => x.event === ev).length;
const throwingGo = (T, fails = [], thrown = 'globalThis.__err') => {
  T.G(`globalThis.__hook = () => { throw ${thrown}; }; globalThis.__fail = ${JSON.stringify(Object.fromEntries(fails.map(f => [f, true])))};`);
  let caught; try { T.G("chooseFollowup('go')"); } catch (e) { caught = e; } return caught;
};

// ── RB-T10: catch 구조 — 정지 플래그 우선·단계별 격리·원래 예외 보존 ──
const STEPS = ['clearTimers', 'rollback', 'render', 'notice', 'diag'];
const rbCase = (id, fails, expectState) => test(id, () => {
  const T = setup(); open(T); const s = T.S(); const b0 = snap(s, EXC), nBtn = T.buttons().length;
  const caught = throwingGo(T, fails), spy = T.G('globalThis.__spy'), ce = caught && caught.followupCleanupErrors;
  check(id + ' a 원래 예외 객체 그대로 전파', caught === T.G('globalThis.__err'), String(caught));
  check(id + ' b progressHalted true', T.G('progressHalted') === true);
  check(id + ' c 다섯 정리 단계 모두 실행(각 1회)', STEPS.every(k => spy[k] === 1), spy);
  check(id + ' d cleanupErrors = 실패 단계(순서 고정)', fails.length ? JSON.stringify((ce || []).map(x => x.step)) === JSON.stringify(STEPS.filter(k => fails.includes(k))) : ce === undefined, ce);
  check(id + ' e pending·currentEventId 정리', s.pendingFollowup === null && s.currentEventId === null);
  check(id + ' f 상태 ' + (expectState ? '원복(S 전체 = 스냅숏)' : '롤백 실패로 불일치(정지로 진행 차단)'), (snap(s, EXC) === b0) === expectState);
  check(id + " g '다음 해로' 0개·resolve 1회", T.buttons().filter(b => b.textContent === '다음 해로').length === 0 && T.G('globalThis.__res') === 1, { n: T.buttons().length, nBtn });
  const b1 = snap(s), c1 = T.calls(); T.G('nextYear()');
  check(id + ' h 정지 후 nextYear 진행 0', snap(s) === b1 && T.calls() === c1);
});
rbCase('RB-T10-0 resolve 단독 예외', [], true);
rbCase('RB-T10-1 + clearAutoTimers 실패', ['clearTimers'], true);
rbCase('RB-T10-2 + 롤백 실패', ['rollback'], false);
rbCase('RB-T10-3 + 렌더 실패', ['render'], true);
rbCase('RB-T10-4 + 안내 실패', ['notice'], true);
rbCase('RB-T10-5 + 진단 실패', ['diag'], true);
rbCase('RB-T10-6 + 다섯 단계 모두 실패', STEPS, false);
test('RB-T10-7 원시값 예외', () => {
  const T = setup(); open(T); const s = T.S(); const b0 = snap(s, EXC);
  const caught = throwingGo(T, ['render'], "'x'");
  check('RB-T10-7 a 원시값 그대로 전파', caught === 'x', String(caught));
  check('RB-T10-7 b 정지·정리·원복', T.G('progressHalted') === true && s.pendingFollowup === null && s.currentEventId === null && snap(s, EXC) === b0);
});

test('PF-9 예외 시 R1 복원 내용(기록 길이·내용·2-i)', () => {
  const T = setup(); open(T); const s = T.S();
  const log0 = JSON.stringify(s.logHistory), job0 = s.job, js0 = s.jobSince, flags0 = JSON.stringify(s.flags), st0 = s.falnaState, tr0 = JSON.stringify(s.falnaTransitions), cp0 = JSON.stringify(s.conversionPending), n0 = T.G('syncInvariantLog.length');
  throwingGo(T);
  check('PF-9a job·jobSince·flags·bond·valis 원복', s.job === job0 && s.jobSince === js0 && JSON.stringify(s.flags) === flags0);
  check('PF-9b logHistory 길이·기존 항목 내용 동일', JSON.stringify(s.logHistory) === log0);
  check('PF-9c 2-i: falnaState·전이·conversionPending 불변, syncDepth 0', s.falnaState === st0 && JSON.stringify(s.falnaTransitions) === tr0 && JSON.stringify(s.conversionPending) === cp0 && T.G('syncDepth') === 0);
  check('PF-9d 2-i 기준값은 pending_after_exception 으로 남고(초기화하지 않음) 새 생애에서 정리', s.syncBaseline && s.syncBaseline.status === 'pending_after_exception', s.syncBaseline);
  check('PF-9e 화면에 오류 안내 1건(logHistory 미기록)', T.el('log').kids.filter(k => /오류가 발생해 진행을 멈췄다/.test(k.html)).length === 1 && !s.logHistory.some(x => /오류가 발생해/.test(x.text)));
  check('PF-9f syncInvariantLog 추가 0', T.G('syncInvariantLog.length') === n0);
});

test('PF-14 예외 뒤 자동 진행 금지', () => {
  const T = setup({ timers: 'queue', clearRemoves: false }); T.el('auto').checked = true; T.G('showEvent(globalThis.__ev)'); T.timers.length = 0; T.G('choose(globalThis.__ev.choices[0])');
  const nTimers = T.timers.length; throwingGo(T);
  check("PF-14a '다음 해로' 버튼 0·새 타이머 예약 0", T.buttons().length === 0 && T.timers.length === nTimers, { btn: T.buttons().length, timers: T.timers.length });
  check('PF-14b 남은 자동 타이머 취소 시도(G1+)', T.cleared.length >= 1);
  const s = T.S(), b0 = snap(s), c0 = T.calls(), k0 = T.counter.clicks; T.timers.slice().forEach(t => t.fn());
  check('PF-14c 남은 타이머가 실행돼도 진행 0', snap(s) === b0 && T.calls() === c0 && T.counter.clicks === k0);
});

// ── HT-1~6: 진행 정지 가드 ──
const H1 = [['nextYear', 'nextYear()'], ['choose', 'choose(globalThis.__ev.choices[1])'], ['chooseBody', 'chooseBody(globalThis.__ev.choices[1])'], ['showEvent', 'showEvent(globalThis.__ev)'], ['endLife', 'endLife()'], ['chooseFollowup', "chooseFollowup('stay')"], ['renderFollowup', 'renderFollowup()']];
const H3 = [['setAspiration', "setAspiration('adventurer', 't')"], ['setJob', "setJob('merchant')"], ['leaveFamilia', 'leaveFamilia()'], ['sealByGodReturn', 'sealByGodReturn()'], ['applyGodReturn', "applyGodReturn('seal')"],
  ['applyRecruit', "applyRecruit({ route: 'self_apply' })"], ['completeConversion', 'completeConversion()'], ['recompute', 'S.potential = 500; recompute()'], ['recordLevel', "recordLevel('levelup', 1, 2)"], ['tryLevelUp', 'tryLevelUp()'],
  ['convertExp', 'convertExp()'], ['apply', 'globalThis.__applyOrig({ valis: 100, hp: -5, bond: 2 })'], ['ensureHistory', 'ensureHistory()'], ['openMembership', 'openMembership()'], ['closeMembership', "closeMembership('left')"],
  ['joinOrganization', "joinOrganization('guild')"], ['rollFamilia', 'rollFamilia()'], ['checkFalna', 'checkFalna()'], ['moveResidence', "moveResidence('orario', 't')"], ['recordService', 'recordService({ a: 1 })'],
  ['yearlyActivity', 'S.age = 20; yearlyActivity()'], ['recoverYearly', 'recoverYearly(1)'], ['tryRescue', 'tryRescue()'], ['handleRelationEvents', "handleRelationEvents([{ kind: 'birth', relation: {} }])"], ['createFollowup', "createFollowup('t_kind', {})"]];
test('HT-1 정지 상태에서 H1 진입점 호출: 상태·난수·화면 불변', () => {
  for (const [name, code] of H1) {
    const T = setup(); open(T); const s = T.S(); T.G('progressHalted = true');
    const b0 = snap(s), c0 = T.calls(), d0 = T.dom(), h0 = diag(T, 'halted_entry');
    let threw = null; try { T.G(code); } catch (e) { threw = e; }
    check('HT-1 ' + name, !threw && snap(s) === b0 && T.calls() === c0 && T.dom() === d0 && diag(T, 'halted_entry') === h0 + 1, { threw: String(threw), halted: diag(T, 'halted_entry') - h0 });
  }
});
test('HT-4 정지 상태에서 H3 내부 상태 변경 함수 호출: 상태·난수 불변', () => {
  for (const [name, code] of H3) {
    const T = setup(); const s = T.S(); T.G('S.age = 20; S.chronologicalAge = 20; S.phase = 20; S.physicalAge = 20;');
    const pre = code.includes(';') ? code.slice(0, code.lastIndexOf(';') + 1) : '', call = code.slice(pre.length);
    if (pre) T.G(pre);
    T.G('progressHalted = true'); const b0 = snap(s), c0 = T.calls(), h0 = diag(T, 'halted_entry');
    let threw = null; try { T.G(call); } catch (e) { threw = e; }
    check('HT-4 ' + name, !threw && snap(s) === b0 && T.calls() === c0 && diag(T, 'halted_entry') >= h0 + 1, { threw: String(threw) });
  }
});
test('HT-2 정지 직전에 만든 선택 버튼을 정지 후 클릭', () => {
  const T = setup(); T.G('showEvent(globalThis.__ev)'); const stale = T.buttons(); const s = T.S();
  T.G('progressHalted = true'); const b0 = snap(s), c0 = T.calls(), d0 = T.dom();
  stale.forEach(b => b.click());
  check('HT-2 사건 선택 버튼', snap(s) === b0 && T.calls() === c0 && T.dom() === d0);
  const T2 = setup(); open(T2, 1); const next = T2.buttons()[0], s2 = T2.S(); T2.G('progressHalted = true'); const b2 = snap(s2), c2 = T2.calls();
  next.click();
  check("HT-2b '다음 해로' 버튼", next.textContent === '다음 해로' && snap(s2) === b2 && T2.calls() === c2);
});
test('HT-3 정지 직전에 예약된 자동 타이머 3종을 정지 후 실행', () => {
  const mk = () => { const T = setup({ timers: 'queue', clearRemoves: false }); T.el('auto').checked = true; return T; };
  const run = (id, T) => { const t = T.timers[T.timers.length - 1], s = T.S(); T.G('progressHalted = true'); const b0 = snap(s), c0 = T.calls(), d0 = T.dom(), k0 = T.counter.clicks; t.fn();
    check(id, snap(s) === b0 && T.calls() === c0 && T.dom() === d0 && T.counter.clicks === k0, { calls: T.calls() - c0, clicks: T.counter.clicks - k0 }); };
  { const T = mk(); T.G('showEvent(globalThis.__ev)'); run('HT-3 T1 사건 자동 선택(Math.random 호출 전 차단)', T); }
  { const T = mk(); T.G('showEvent(globalThis.__ev)'); T.G('choose(globalThis.__ev.choices[1])'); run("HT-3 T2 자동 '다음 해로'", T); }
  { const T = mk(); T.G('showEvent(globalThis.__ev)'); T.G('choose(globalThis.__ev.choices[0])'); run('HT-3 T3 후속 화면 stay 자동 클릭', T); }
});
test('HT-5 정지 해제는 startLife 뿐', () => {
  const T = setup(); open(T); throwingGo(T);
  check('HT-5a 예외 후 정지', T.G('progressHalted') === true);
  T.G('nextYear()'); T.G("chooseFollowup('stay')"); T.G('showEvent(globalThis.__ev)');
  check('HT-5b 진행 함수 호출로는 해제되지 않음', T.G('progressHalted') === true);
  const old = T.S(), g0 = T.G('lifeGen'), h0 = diag(T, 'halted_entry'); T.G('startLife()');
  check('HT-5c startLife 로 해제·세대 +1·새 생애 정상 시작', T.G('progressHalted') === false && T.G('lifeGen') === g0 + 1 && T.S() !== old && T.S().pendingFollowup === null && (T.buttons().length > 0 || !!T.S().cause));
  check('HT-5d(CT-7) 새 생애 시작 과정에서 halted_entry 진단 0', diag(T, 'halted_entry') === h0);
});
test('HT-6 예외 직후 화면에 진행 수단 없음', () => {
  const T = setup(); open(T); throwingGo(T); const s = T.S(), b0 = snap(s), c0 = T.calls();
  T.buttons().forEach(b => b.click());
  check("HT-6 '다음 해로' 0개·남은 버튼 클릭해도 진행 0", T.buttons().filter(b => b.textContent === '다음 해로').length === 0 && snap(s) === b0 && T.calls() === c0);
});

// ── HT-7: 새 생애 시작 후 이전 생애 콜백(T1·T2·T3 × 예외 있음/없음) ──
// clearRemoves:false = 타이머 취소(G1+)가 누락됐다고 가정하고 세대 토큰(G1)만으로 막히는지 본다. 진단은 followupDiagLog 에 stale_timer 1건만 추가되어야 한다.
const ht7 = (id, arm, withException) => test(id, () => {
  const T = setup({ timers: 'queue', clearRemoves: false }); T.el('auto').checked = true;
  arm(T); const target = T.timers[T.timers.length - 1];           // 생애 A 에서 예약만 되고 실행되지 않은 대상 타이머
  if (withException) { T.G('showEvent(globalThis.__ev)'); T.G('choose(globalThis.__ev.choices[0])'); throwingGo(T); }
  if (withException) check(id + ' 0 생애 A 예외로 정지', T.G('progressHalted') === true);
  T.G('startLife()'); const s = T.S();                             // 생애 B
  const b0 = snap(s), r0 = JSON.stringify(T.rng()), d0 = T.dom(), k0 = T.counter.clicks, ev0 = JSON.stringify([s.eventCounts, s.done, s.recentEvents, s.lastEventPhase]), n0 = T.G('followupDiagLog.length'), q0 = T.timers.length;
  target.fn();                                                     // 생애 A 의 콜백 실행
  const added = T.G('followupDiagLog').slice(n0);
  check(id + ' a S 변경 0', snap(s) === b0 && T.S() === s);
  check(id + ' b RNG 소비 0', JSON.stringify(T.rng()) === r0);
  check(id + ' c 버튼 클릭 0', T.counter.clicks === k0);
  check(id + ' d 사건 기록 변경 0', JSON.stringify([s.eventCounts, s.done, s.recentEvents, s.lastEventPhase]) === ev0);
  check(id + ' e DOM 변경 0·새 타이머 0', T.dom() === d0 && T.timers.length === q0);
  check(id + ' f 진단 = stale_timer 1건뿐(followupDiagLog)', added.length === 1 && added[0].event === 'stale_timer' && added[0].halted === false, added);
  check(id + ' g 생애 B 는 정지 아님', T.G('progressHalted') === false);
});
const armT1 = T => { T.G('showEvent(globalThis.__ev)'); };
const armT2 = T => { T.G('showEvent(globalThis.__ev)'); T.G('choose(globalThis.__ev.choices[1])'); };
const armT3 = T => { T.G('showEvent(globalThis.__ev)'); T.G('choose(globalThis.__ev.choices[0])'); };
ht7('HT-7-T1 사건 자동 선택 / 예외 있음', armT1, true);
ht7('HT-7-T1b 사건 자동 선택 / 예외 없음', armT1, false);
ht7("HT-7-T2 자동 '다음 해로' / 예외 있음", T => { armT2(T); }, true);
ht7("HT-7-T2b 자동 '다음 해로' / 예외 없음", armT2, false);
ht7('HT-7-T3 후속 화면 stay / 예외 있음', T => { armT3(T); T.G("chooseFollowup('stay')"); const t = T.timers.find(x => x.ms === 800 && x !== T.timers[0]); if (t) { T.timers.push(T.timers.splice(T.timers.indexOf(t), 1)[0]); } }, true);
ht7('HT-7-T3b 후속 화면 stay / 예외 없음', armT3, false);

test('HT-8 G1+ 타이머 취소: startLife·예외에서 clearTimeout 호출', () => {
  const T = setup({ timers: 'queue' }); T.el('auto').checked = true; T.G('showEvent(globalThis.__ev)'); const id = T.timers[T.timers.length - 1].id;
  T.G('startLife()');
  check('HT-8 startLife 가 이전 타이머를 취소', T.cleared.includes(id) && !T.timers.some(t => t.id === id));
});

finish('followup_halt_test');
