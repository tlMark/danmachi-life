// F1D4A N2-1 — RB-1 (가) 원자 롤백 확장 시험(REVIEW v27 §4.2k·§4.2m~§4.2u, 사용자 결정 RB-1a~RB-1g 2026-11-23).
// 사용: node tests/n2_rollback_test.js   (실패 1건 이상이면 종료 코드 1)
// 모든 사례는 [합성 상태 주입·예외 주입]이다. 시험용 후속 선택 kind 의 resolve 안에서 전이·변경을 한 뒤 예외를 던진다. 실제 생애 결과가 아니다.
// 판정은 "롤백 뒤 S 전체 = 스냅숏(난수 소비·S 밖 진단 제외, E-3·E-4)"과 롤백 보고(lastRollbackReport)를 따로 본다.
'use strict';
const { makeCtx, makeReporter, snap } = require('./lib_f1_ctx');
const { check, test, finish } = makeReporter();
const EXC = ['pendingFollowup', 'currentEventId'];   // 이 두 필드는 chooseFollowup 의 finally 가 정리한다(RB-1d·기존 계약)

function setup(patch) {
  const T = makeCtx(patch ? { patch } : {}); T.G('startLife()');
  T.G(`document.getElementById('choices').innerHTML = ''; S.currentEventId = null; globalThis.__hook = null;
    FOLLOWUP_KINDS.t_kind = { prompt: '시험', options: () => [{ id: 'go', label: '간다' }, { id: 'stay', label: '머문다', stay: true }],
      resolve: (S, id) => { if (globalThis.__hook) globalThis.__hook(S); throw new Error('boom'); } };
    globalThis.__applyOrig = apply;
    apply = function (fx) { const r = globalThis.__applyOrig(fx); if (fx && fx.__followup) createFollowup(fx.__followup, { tag: 'x' }); return r; };
    globalThis.__ev = { id: 't_ev', text: '시험 사건', choices: [{ label: 'a', text: '결과', fx: { bond: 0, __followup: 't_kind' } }] };`);
  return T;
}
const fam = (T, id) => T.G('gachaData').familias.find(f => f.id === id);
function activeMember(T, familiaId = 'loki') {
  const s = T.S();
  s.age = 25; s.chronologicalAge = 25; s.phase = 25; s.physicalAge = 25;
  s.familia = fam(T, familiaId);
  s.familiaHistory = [{ id: 1, familiaId, label: s.familia.label, joinedAt: 15, leftAt: null, leftReason: null, role: 'member', falnaAt: 15 }];
  s.nextMembershipId = 2;
  s.flags = s.flags.filter(f => !['falna', 'adventurer', 'supporter'].includes(f)).concat(['falna']);
  T.G("setJob('adventurer')");
  s.falnaHistory = [{ familiaId, at: 15, membershipIndex: 0 }]; s.level = Math.max(1, s.level); s.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }];
  s.falnaTransitions = []; s.conversionPending = null; s.syncBaseline = null; s.currentEventId = null;
  s.falnaState = T.G('deriveFalnaState()'); s.falnaHolder = T.G('deriveFalnaHolder()');
  return s;
}
const open = T => { T.G('showEvent(globalThis.__ev)'); T.G('choose(globalThis.__ev.choices[0])'); };
// hook 을 실행하고 예외를 받는다. 반환: { s, pre, err, report, ids } — ids 는 스냅숏 시점 객체 참조(정체성 검사용)
function runCase(T, hookSrc, prep, preChoose) {
  open(T); const s = T.S(); if (prep) prep(T, s);
  const pre = snap(s, EXC);
  const ids = { familiaHistory: s.familiaHistory, fh0: s.familiaHistory && s.familiaHistory[0], relations: s.relations, items: s.items, itemUses: s.itemUses,
    application: s.application, levelHistory: s.levelHistory, falnaTransitions: s.falnaTransitions, logLast: T.G("document.getElementById('log').lastChild") };
  T.G(`globalThis.__hook = ${hookSrc};`);
  if (preChoose) preChoose(T, s);   // 스냅숏 비교값(pre)을 만든 뒤에 실행(시험 쪽 snap 의 getter 호출과 분리)
  let err = null; try { T.G("chooseFollowup('go')"); } catch (e) { err = e; }
  return { s, pre, err, report: T.G('lastRollbackReport'), failure: T.G('lastRollbackFailure'), ids };
}
const okAll = (T, r, label) => {
  check(label + ' 예외 전파·정지', !!r.err && String(r.err.message) === 'boom' && T.G('progressHalted') === true, String(r.err));
  check(label + ' S 전체 = 스냅숏(EXC 제외)', snap(r.s, EXC) === r.pre);
  check(label + ' 롤백 보고 ok·input normal', r.report && r.report.rollback === 'ok' && r.report.input === 'normal', r.report && { rollback: r.report.rollback, input: r.report.input, bad: Object.entries(r.report.bundles).filter(([, b]) => b.status !== 'ok').map(([k]) => k) });
  check(label + ' lastRollbackFailure 없음(정상 복원)', r.failure === null);
  check(label + ' syncDepth 0', T.G('syncDepth') === 0);
};

// RBT-5: 전이별 원자 롤백 (합성 상태 주입·예외 주입)
test('RBT-5a 입단(rollFamilia) 뒤 예외', () => {
  const T = setup(); const r = runCase(T, "S => { S.age = Math.max(S.age, 16); apply({ familia: 'roll' }); }", (T, s) => { s.age = 16; });
  okAll(T, r, 'RBT-5a');
  check('RBT-5a familiaHistory 참조 유지', r.s.familiaHistory === r.ids.familiaHistory);
});
test('RBT-5b 탈퇴(dropFamilia) 뒤 예외', () => {
  const T = setup(); open(T); activeMember(T); T.G("document.getElementById('choices').innerHTML=''; S.pendingFollowup=null;");
  const r = runCase(T, "S => { apply({ dropFamilia: true }); }");
  okAll(T, r, 'RBT-5b');
  check('RBT-5b 기존 소속 항목 정체성·leftAt 원복', r.s.familiaHistory[0] === r.ids.fh0 && r.s.familiaHistory[0].leftAt === null && r.s.familiaHistory[0].leftReason === null);
});
test('RBT-5c 신의 송환·재수여(godReturn regrant) 뒤 예외', () => {
  const T = setup(); open(T); activeMember(T); T.G("document.getElementById('choices').innerHTML=''; S.pendingFollowup=null;");
  const r = runCase(T, "S => { apply({ godReturn: 'regrant' }); }");
  okAll(T, r, 'RBT-5c');
  check('RBT-5c falnaTransitions 참조·길이 원복', r.s.falnaTransitions === r.ids.falnaTransitions && r.s.falnaTransitions.length === 0);
});
test('RBT-5d 신의 송환(seal) 뒤 예외', () => {
  const T = setup(); open(T); activeMember(T); T.G("document.getElementById('choices').innerHTML=''; S.pendingFollowup=null;");
  const r = runCase(T, "S => { apply({ godReturn: 'seal' }); }");
  okAll(T, r, 'RBT-5d');
  check('RBT-5d 팔나 플래그·falnaState 원복', r.s.flags.includes('falna') && r.s.falnaState === 'active');
});
test('RBT-5e 팔나 취득(checkFalna) 뒤 예외', () => {
  const T = setup();
  const r = runCase(T, "S => { S.familia = gachaData.familias.find(f => f.id === 'loki'); openMembership(); S.falnaAt = S.age; checkFalna(); }", (T, s) => { s.age = 16; });
  okAll(T, r, 'RBT-5e');
  check('RBT-5e levelHistory 참조 유지', r.s.levelHistory === r.ids.levelHistory);
});
// RBT-10b: application 정체성
test('RBT-10b application 속성·배열 정체성 복원', () => {
  const T = setup();
  const r = runCase(T, "S => { S.application ||= GameCore.Recruit.newApplicationState(); S.application.attemptSeq = 99; S.application.current = { x: 1 }; S.application.history.push({ route: 't' }); (S.application.blocked ||= []).push({ r: 1 }); }",
    (T, s) => { s.application = T.G('GameCore.Recruit.newApplicationState()'); });
  okAll(T, r, 'RBT-10b');
  check('RBT-10b 객체 정체성 유지·attemptSeq·blocked 키 없음', r.s.application === r.ids.application && !('attemptSeq' in r.s.application) && !('blocked' in r.s.application));
});
// RBT-10c: 컨테이너 3계층
test('RBT-10c-1·2 items push·교체(spend/remove) 뒤 예외', () => {
  const T = setup();
  const r = runCase(T, "S => { GameCore.Items.acquire(S, 'pyonkichi'); S.items = S.items.filter(x => x !== 'nothing'); S.items.push('zz'); }", (T, s) => { s.items = []; s.itemsConsumed = []; s.itemUses = {}; });
  okAll(T, r, 'RBT-10c-1·2');
  check('RBT-10c items 원래 배열 참조', r.s.items === r.ids.items && r.s.items.length === 0);
});
test('RBT-10c-3 itemUses 비정상 값 그대로 복원', () => {
  const T = setup();
  const r = runCase(T, "S => { S.itemUses.a = 5; delete S.itemUses.b; S.itemUses.c = 'x'; }", (T, s) => { s.itemUses = { a: NaN, b: 'str' }; });
  check('RBT-10c-3 S 전체 = 스냅숏', snap(r.s, EXC) === r.pre);
  check('RBT-10c-3 NaN·문자열 원래 값, 추가 키 없음', Number.isNaN(r.s.itemUses.a) && r.s.itemUses.b === 'str' && !('c' in r.s.itemUses) && r.s.itemUses === r.ids.itemUses);
  check('RBT-10c-3 보고 ok', r.report.rollback === 'ok', r.report.rollback);
});
test('RBT-10c-5 relations: marry·endRelationship·advanceYear 뒤 예외(L2·L3·L3+)', () => {
  const T = setup();
  const r = runCase(T, "S => { const rel = GameCore.Relations.createRomanticPartner(S, 'event', relationCtx()); if (rel) GameCore.Relations.endRelationship(S, rel.id, 'deceased_event'); GameCore.Relations.advanceYear(S, MODS); const p = S.relations.find(x => x.familia); if (p) p.familia.label = 'X'; }",
    (T, s) => { s.age = 25; const par = s.relations.find(x => x.subType === 'parent'); if (par) par.familia = { id: 'loki', label: '로키 파밀리아' }; });
  okAll(T, r, 'RBT-10c-5');
  check('RBT-10c-5 relations 배열 참조 유지', r.s.relations === r.ids.relations);
});
test('RBT-10c-12 familia(L3+) 교체·키 추가 뒤 예외', () => {
  const T = setup(); let famRef;
  const r = runCase(T, "S => { const p = S.relations.find(x => x.familia); p.familia.extra = 1; p.familia = { id: 'z', label: 'z' }; }",
    (T, s) => { const par = s.relations.find(x => x.subType === 'parent'); famRef = par.familia = { id: 'loki', label: '로키' }; });
  okAll(T, r, 'RBT-10c-12');
  const par = r.s.relations.find(x => x.subType === 'parent');
  check('RBT-10c-12 familia 원래 참조·추가 키 없음', par.familia === famRef && !('extra' in par.familia));
});
// RBT-10a: syncBaseline 스냅숏 값으로 교체(RB-1a)
test('RBT-10a syncBaseline 스냅숏 시점 값', () => {
  const T = setup(); const r = runCase(T, "S => { apply({ bond: 1 }); }");
  check('RBT-10a 기준값 = 스냅숏 시점(null)', r.s.syncBaseline === null, r.s.syncBaseline);
});
// 스키마 정책(§4.2t R3 경우 2·3)
test('RBT-10c-13-1 스냅숏 때 접근자 원소 → getter 호출 0, unverified', () => {
  const T = setup(); let calls = 0;
  const r = runCase(T, "S => { S.bond += 1; }", (T, s) => { const o = {}; Object.defineProperty(o, 'g', { get() { T.G('globalThis.__calls++'); return 1; }, enumerable: true, configurable: true }); s.familiaHistory = [o]; },
    T => T.G('globalThis.__calls = 0'));
  calls = T.G('globalThis.__calls');
  // 스냅숏·복원 함수만 따로 호출해 getter 호출 수를 잰다. 예외 경로의 기존 X2 렌더(renderStatsFromClone 의 복제)는 S 를 읽으므로 getter 를 부른다(기존 동작, 이 계약의 대상 아님).
  T.G('globalThis.__calls = 0; globalThis.__x = takeRollbackSnapshotExt(); restoreRollbackSnapshotExt(globalThis.__x);');
  calls = T.G('globalThis.__calls');
  check('RBT-10c-13-1 확장 스냅숏·복원의 getter 호출 0', calls === 0, calls);
  check('RBT-10c-13-1 보고 partial(unverified)·input damaged(schema)', r.report.rollback === 'partial(unverified)' && /schema/.test(r.report.input), r.report && { rollback: r.report.rollback, input: r.report.input });
  check('RBT-10c-13-1 lastRollbackFailure 기록(gen 일치)', r.failure && r.failure.gen === T.G('lifeGen'));
});
test('RBT-10c-13-4 예외 뒤 non-configurable 속성 → failed', () => {
  const T = setup();
  const r = runCase(T, "S => { Object.defineProperty(S.familiaHistory[0], 'z', { value: 1, configurable: false, enumerable: true, writable: true }); }",
    (T, s) => { s.familiaHistory = [{ id: 1, familiaId: 'loki', label: 'l', joinedAt: 1, leftAt: null, leftReason: null }]; });
  check('RBT-10c-13-4 보고 partial(failed)', r.report.rollback === 'partial(failed)', r.report.rollback);
});
test('RBT-10c-13-3 예외 뒤 접근자 생김(configurable) → 기본 데이터 속성으로 복원, ok', () => {
  const T = setup();
  const r = runCase(T, "S => { Object.defineProperty(S.familiaHistory[0], 'leftAt', { get() { return 9; }, configurable: true, enumerable: true }); }",
    (T, s) => { s.familiaHistory = [{ id: 1, familiaId: 'loki', label: 'l', joinedAt: 1, leftAt: null, leftReason: null }]; });
  okAll(T, r, 'RBT-10c-13-3');
});
// RBT-11-dup: partner_link·중복 id(RB-1g (ㄱ))
test('RBT-10c-11 dup: 같은 id 두 원소 → input damaged(dup), 복원은 ok', () => {
  const T = setup();
  const r = runCase(T, "S => { S.relations[0].alive = false; }", (T, s) => {
    s.relations = [{ id: 7, type: 'friend', subType: 'romance_candidate', name: 'a', age: 25, alive: true }, { id: 7, type: 'friend', subType: 'romance_candidate', name: 'b', age: 25, alive: true }];
    s.partnerId = 7; });
  check('RBT-10c-11 S 전체 = 스냅숏', snap(r.s, EXC) === r.pre);
  check('RBT-10c-11 rollback ok, input damaged(dup)', r.report.rollback === 'ok' && /dup/.test(r.report.input), r.report && { rollback: r.report.rollback, input: r.report.input });
  check('RBT-10c-11 partner_link ok', r.report.bundles.partner_link.status === 'ok');
});
// RBT-14: 생애 경계
test('RBT-14a 롤백 실패 기록 뒤 startLife → 초기화', () => {
  const T = setup();
  runCase(T, "S => { Object.defineProperty(S.familiaHistory[0], 'z', { value: 1, configurable: false, enumerable: true, writable: true }); }",
    (T, s) => { s.familiaHistory = [{ id: 1, familiaId: 'loki', label: 'l', joinedAt: 1, leftAt: null, leftReason: null }]; });
  const before = T.G('lastRollbackFailure');
  T.G('startLife()');
  check('RBT-14a 이전 생애에 기록 있음', !!before);
  check('RBT-14a 새 생애: lastRollbackFailure null·rollbackFailureUnrecorded false·progressHalted false',
    T.G('lastRollbackFailure') === null && T.G('rollbackFailureUnrecorded') === false && T.G('progressHalted') === false);
});
// RBT-13: DOM 정리(Mock DOM) — 실제 브라우저 시험이 아니다
test('RBT-13 연표 DOM: 스냅숏 뒤 추가 노드 제거, 정지 안내 1건만 남음 [Mock DOM]', () => {
  const T = setup();
  const r = runCase(T, "S => { say('롤백될 문구 1', 'event'); say('롤백될 문구 2', 'event'); }");
  const kids = T.G("document.getElementById('log').kids");
  const idx = r.ids.logLast ? kids.indexOf(r.ids.logLast) : -1;
  const after = kids.slice(idx + 1);
  check('RBT-13 스냅숏 뒤 노드 = 정지 안내 1건', after.length === 1 && /오류가 발생해 진행을 멈췄다/.test(after[0].html), after.map(k => k.html));
  check('RBT-13 logHistory 원복(S 전체 = 스냅숏)', snap(r.s, EXC) === r.pre);
});
// ── QA 1차 반려(RB-1A·1B·1C) 보완 시험 ──
const appPrep = (T, s) => { s.application = T.G('GameCore.Recruit.newApplicationState()'); s.application.blocked = [{ route: 'b0' }]; s.application.history.push({ route: 'h0' }); };
test('RB-1A-1 application 접근자: 스냅숏·복원 getter 호출 0, partial(unverified)·input damaged(schema)', () => {
  const T = setup();
  const r = runCase(T, "S => { S.application.attemptSeq = 5; }", (T, s) => { appPrep(T, s); Object.defineProperty(s.application, 'g', { get() { T.G('globalThis.__ga++'); return 1; }, enumerable: true, configurable: true }); },
    T => T.G('globalThis.__ga = 0'));
  check('RB-1A-1 보고 partial(unverified)·schema:application', r.report.rollback === 'partial(unverified)' && /schema\):application/.test(r.report.input) && r.report.bundles.application.status === 'unverified', r.report && { rb: r.report.rollback, in: r.report.input });
  check('RB-1A-1 history·blocked 는 선행 미검증이라 unverified', r.report.bundles['application.history'].status === 'unverified' && r.report.bundles['application.blocked'].status === 'unverified');
  T.G('globalThis.__ga = 0; globalThis.__x = takeRollbackSnapshotExt(); restoreRollbackSnapshotExt(globalThis.__x);');
  check('RB-1A-1 확장 스냅숏·복원의 application getter 호출 0', T.G('globalThis.__ga') === 0, T.G('globalThis.__ga'));
});
test('RB-1A-2 application 비표준 descriptor(non-enumerable) → unverified, 예외 뒤 non-configurable 추가 → failed', () => {
  { const T = setup();
    const r = runCase(T, "S => { S.application.attemptSeq = 5; }", (T, s) => { appPrep(T, s); Object.defineProperty(s.application, 'hid', { value: 1, enumerable: false, writable: true, configurable: true }); });
    check('RB-1A-2a non-enumerable 키 → partial(unverified)', r.report.rollback === 'partial(unverified)' && r.report.bundles.application.status === 'unverified'); }
  { const T = setup();
    const r = runCase(T, "S => { Object.defineProperty(S.application, 'nc', { value: 1, enumerable: true, writable: true, configurable: false }); }", appPrep);
    check('RB-1A-2b 예외 뒤 non-configurable 속성 → application failed·전체 partial(failed)', r.report.bundles.application.status === 'failed' && r.report.rollback === 'partial(failed)', r.report.bundles.application); }
  { const T = setup();
    const r = runCase(T, "S => { Object.defineProperty(S.application, 'attemptSeq', { get() { return 7; }, enumerable: true, configurable: true }); }", (T, s) => { appPrep(T, s); s.application.attemptSeq = 2; });
    okAll(T, r, 'RB-1A-2c 예외 뒤 접근자(configurable) → 저장본 데이터 속성으로 복원');
    check('RB-1A-2c attemptSeq 데이터 속성·값 2', Object.getOwnPropertyDescriptor(r.s.application, 'attemptSeq').value === 2); }
});
test('RB-1B-1 history·blocked 각각 참조·내용 복원(교체·추가·삭제)', () => {
  const T = setup(); let h0, b0;
  const r = runCase(T, "S => { S.application.history = [{ route: 'new' }]; S.application.blocked.push({ route: 'b1' }); S.application.blocked.shift(); }",
    (T, s) => { appPrep(T, s); h0 = s.application.history; b0 = s.application.blocked; });
  okAll(T, r, 'RB-1B-1');
  check('RB-1B-1 history 원래 참조·내용, blocked 원래 참조·내용', r.s.application.history === h0 && r.s.application.history.length === 1 && r.s.application.history[0].route === 'h0'
    && r.s.application.blocked === b0 && r.s.application.blocked.length === 1 && r.s.application.blocked[0].route === 'b0');
  check('RB-1B-1 보고: history 교체 감지(replaced)·원래 참조 복원, blocked 원소 변경 감지(changed)', r.report.bundles['application.history'].status === 'ok' && r.report.bundles['application.history'].replaced === true && r.report.bundles['application.history'].refRestored === true && r.report.bundles['application.blocked'].replaced === false && r.report.bundles['application.blocked'].changed === true, [r.report.bundles['application.history'], r.report.bundles['application.blocked']]);
});
test('RB-1B-2 history 가 예외 뒤 동결(내용 복원 불가) → failed, 부분 복원 보고', () => {
  const T = setup();
  const r = runCase(T, "S => { S.application.history.push({ route: 'x' }); Object.freeze(S.application.history); }", appPrep);
  check('RB-1B-2 application.history failed·전체 partial(failed)·실패 기록', r.report.bundles['application.history'].status === 'failed' && r.report.rollback === 'partial(failed)' && r.failure && r.failure.gen === T.G('lifeGen'));
  check('RB-1B-2 정지·원래 예외', T.G('progressHalted') === true && r.err && r.err.message === 'boom');
});
test('RB-1B-3 history 원소에 접근자(스냅숏 시점) → unverified, getter 호출 0', () => {
  const T = setup();
  const r = runCase(T, "S => { S.bond += 1; }", (T, s) => { appPrep(T, s); Object.defineProperty(s.application.history, '0', { get() { T.G('globalThis.__ge++'); return 1; }, enumerable: true, configurable: true }); }, T => T.G('globalThis.__ge = 0'));
  check('RB-1B-3 application.history unverified·schema 표시', r.report.bundles['application.history'].status === 'unverified' && /application\.history/.test(r.report.input));
  T.G('globalThis.__ge = 0; globalThis.__x = takeRollbackSnapshotExt(); restoreRollbackSnapshotExt(globalThis.__x);');
  check('RB-1B-3 확장 스냅숏·복원 getter 호출 0', T.G('globalThis.__ge') === 0);
});
test('RB-1B-4 원래 없던 blocked 가 생김 → 최상위 복원이 지움(ok)', () => {
  const T = setup();
  const r = runCase(T, "S => { (S.application.blocked ||= []).push({ r: 1 }); }", (T, s) => { s.application = T.G('GameCore.Recruit.newApplicationState()'); });
  okAll(T, r, 'RB-1B-4');
  check('RB-1B-4 blocked 키 없음', !('blocked' in r.s.application));
});
test('RB-1C 실패 기록 자체가 실패: 정지·원래 예외 유지, 기록 실패를 성공으로 보지 않음, 생애 경계 초기화', () => {
  const T = setup();
  T.G("writeRollbackFailureRecord = function () { throw new Error('record-fail'); };");
  const r = runCase(T, "S => { Object.defineProperty(S.familiaHistory[0], 'z', { value: 1, configurable: false, enumerable: true, writable: true }); }",
    (T, s) => { s.familiaHistory = [{ id: 1, familiaId: 'loki', label: 'l', joinedAt: 1, leftAt: null, leftReason: null }]; });
  check('RB-1C 롤백 결과 partial(failed)(기록 실패와 별개)', r.report.rollback === 'partial(failed)');
  check('RB-1C 기록 실패: lastRollbackFailure null·rollbackFailureUnrecorded true', r.failure === null && T.G('rollbackFailureUnrecorded') === true);
  check('RB-1C cleanupErrors 에 recordFailure 1건·원래 예외 같은 객체 재전파·정지', r.err && r.err.message === 'boom' && (r.err.followupCleanupErrors || []).filter(e => e.step === 'recordFailure').length === 1 && T.G('progressHalted') === true);
  const d = T.G("followupDiagLog.filter(x => x.event === 'followup_resolve_exception')").pop();
  check('RB-1C 진단: failureRecorded false(성공으로 오인하지 않음)', d && d.failureRecorded === false && d.rollback.rollback === 'partial(failed)', d);
  T.G('startLife()');
  check('RB-1C 새 생애: rollbackFailureUnrecorded false·lastRollbackFailure null·정지 해제', T.G('rollbackFailureUnrecorded') === false && T.G('lastRollbackFailure') === null && T.G('progressHalted') === false);
});
test('RB-1C 정상 복원이면 recordFailure 단계 없음·failureRecorded null', () => {
  const T = setup(); const r = runCase(T, "S => { S.bond += 1; }");
  const d = T.G("followupDiagLog.filter(x => x.event === 'followup_resolve_exception')").pop();
  check('RB-1C ok: cleanupErrors 없음·failureRecorded null', !r.err.followupCleanupErrors && d.failureRecorded === null);
});
// ── QA 1차 재검수(RB-2A·2B·2C) 보완 시험 ──
// RB-2A: replaced·changed 는 예외 시점 관찰값(복원 전), refRestored 는 복원 뒤 값
const appBundles = r => [r.report.bundles['application.history'], r.report.bundles['application.blocked']];
test('RB-2A-1 제자리 변경: replaced false·changed true·refRestored true', () => {
  const T = setup(); const r = runCase(T, "S => { S.application.history.push({ route: 'x' }); }", appPrep);
  const [h, b] = appBundles(r);
  check('RB-2A-1 history', h.replaced === false && h.changed === true && h.refRestored === true && h.status === 'ok', h);
  check('RB-2A-1 blocked 무변경: replaced false·changed false', b.replaced === false && b.changed === false && b.status === 'ok', b);
});
test('RB-2A-2 같은 내용의 새 배열로 교체: replaced true·changed false', () => {
  const T = setup(); const r = runCase(T, "S => { S.application.history = S.application.history.slice(); }", appPrep);
  const [h] = appBundles(r);
  check('RB-2A-2', h.replaced === true && h.changed === false && h.refRestored === true && h.status === 'ok', h);
});
test('RB-2A-3 원래 없던 blocked 생성: replaced true·changed true', () => {
  const T = setup(); const r = runCase(T, "S => { S.application.blocked = [{ r: 1 }]; }", (T, s) => { s.application = T.G('GameCore.Recruit.newApplicationState()'); });
  const [, b] = appBundles(r);
  check('RB-2A-3', b.replaced === true && b.changed === true && b.status === 'ok' && !('blocked' in r.s.application), b);
});
test('RB-2A-4 예외 시점 배열이 지원하지 않는 형태: changed null, getter 호출 0', () => {
  const T = setup();
  const r = runCase(T, "S => { Object.defineProperty(S.application.history, '0', { get() { globalThis.__gx++; return 1; }, enumerable: true, configurable: true }); }", appPrep, T => T.G('globalThis.__gx = 0'));
  const [h] = appBundles(r);
  check('RB-2A-4 changed null·replaced false', h.changed === null && h.replaced === false, h);
  check('RB-2A-4 관찰·복원 중 getter 호출 0', T.G('globalThis.__gx') === 0, T.G('globalThis.__gx'));
});
test('RB-2A-5 예외 시점 application.history 가 접근자: replaced·changed null, getter 호출 0', () => {
  const T = setup();
  const r = runCase(T, "S => { const a = S.application.history; Object.defineProperty(S.application, 'history', { get() { globalThis.__gy++; return a; }, enumerable: true, configurable: true }); }", appPrep, T => T.G('globalThis.__gy = 0'));
  const [h] = appBundles(r);
  check('RB-2A-5 replaced null·changed null', h.replaced === null && h.changed === null, h);
  check('RB-2A-5 getter 호출 0·복원 뒤 원래 참조(데이터 속성)', T.G('globalThis.__gy') === 0 && h.refRestored === true, { calls: T.G('globalThis.__gy'), h });
});
test('RB-2A-6 복원 작업이 관찰값을 바꾸지 않음', () => {
  const T = setup();
  T.G("{ const o = restoreRollbackSnapshotExt; restoreRollbackSnapshotExt = function (x) { globalThis.__obsBefore = JSON.stringify(x && x.obs); const r = o.apply(this, arguments); globalThis.__obsAfter = JSON.stringify(x && x.obs); return r; }; }");
  const r = runCase(T, "S => { S.application.history = []; S.application.blocked.push({ r: 2 }); }", appPrep);
  check('RB-2A-6 관찰값 = 복원 전후 동일·보고값과 일치', T.G('globalThis.__obsBefore') === T.G('globalThis.__obsAfter')
    && JSON.parse(T.G('globalThis.__obsAfter')).history.replaced === appBundles(r)[0].replaced && JSON.parse(T.G('globalThis.__obsAfter')).blocked.changed === appBundles(r)[1].changed);
});
// RB-2B: 원생 Array 판별(Node vm — 게임 realm, 시험 host realm, 세 번째 realm)
test('RB-2B 원생 Array 판별 [Node]', () => {
  const vm = require('vm'); const T = setup(); const L = a => T.G('rbxArrayList')(a);
  const third = vm.runInNewContext('[5, 6]');
  check('RB-2B-1 현재 realm 일반 배열 → 지원', JSON.stringify(T.G('rbxArrayList([1, 2])')) === '[1,2]');
  check('RB-2B-2 다른 realm(시험 host·세 번째 vm) 일반 배열 → 지원', JSON.stringify(L([3, 4])) === '[3,4]' && JSON.stringify(L(third)) === '[5,6]');
  check('RB-2B-3 사용자 정의 하위 클래스 → 거부', T.G('(() => { class Sub extends Array {} return rbxArrayList(Sub.from([1])); })()') === null && L((() => { class Sub2 extends Array {} return Sub2.from([1]); })()) === null);
  check('RB-2B-4 프로토타입 교체(Object.create(Array.prototype)) → 거부', T.G('(() => { const a = [1]; Object.setPrototypeOf(a, Object.create(Array.prototype)); return rbxArrayList(a); })()') === null);
  check('RB-2B-4b 프로토타입 null → 거부', T.G('(() => { const a = [1]; Object.setPrototypeOf(a, null); return rbxArrayList(a); })()') === null);
  check('RB-2B-5a 생성자 교체: 이름만 Array 인 함수 → 거부', T.G('(() => { const p = Object.create(Array.prototype); const F = function Array() {}; F.prototype = p; p.constructor = F; const a = [1]; Object.setPrototypeOf(a, p); return rbxArrayList(a); })()') === null);
  check('RB-2B-5b 생성자 교체: bind 된 Array → 거부', T.G('(() => { const p = Object.create(Array.prototype); p.constructor = Array.bind(null); const a = [1]; Object.setPrototypeOf(a, p); return rbxArrayList(a); })()') === null);
  check('RB-2B-5c 생성자 교체: Proxy(Array) → 거부', T.G('(() => { const p = Object.create(Array.prototype); const P = new Proxy(Array, {}); p.constructor = P; const a = [1]; Object.setPrototypeOf(a, p); return rbxArrayList(a); })()') === null);
  check('RB-2B-5d 인스턴스 own constructor 추가 → 거부', T.G('(() => { const a = [1]; a.constructor = Object; return rbxArrayList(a); })()') === null);
  check('RB-2B-6 빈 칸·접근자 원소·length 고정 → 거부', T.G('rbxArrayList([1, , 3])') === null && T.G("(() => { const a = [1]; Object.defineProperty(a, '0', { get() { return 1; }, enumerable: true, configurable: true }); return rbxArrayList(a); })()") === null && T.G('rbxArrayList(Object.freeze([1]))') === null);
  // 판정 범위(QA r3 필수 2): rbxArrayList 는 '배열이 속한 realm 의' 원생 Array 를 검사한다.
  //   → constructor 가 바뀐 realm 의 배열은 거부(fail-closed), 정상인 별도 realm 의 배열은 지원한다. 모든 realm 을 거부한다는 뜻이 아니다.
  const T2 = setup(); T2.G('Array.prototype.constructor = function Array() {}');
  check('RB-2B-7a constructor 가 바뀐 게임 realm 의 배열 → 거부(fail-closed)', T2.G('rbxArrayList([1])') === null);
  check('RB-2B-7b 같은 상황에서 정상인 별도 realm(시험 host·별도 vm)의 배열 → 지원(정책)', JSON.stringify(T2.G('rbxArrayList')([7])) === '[7]' && JSON.stringify(T2.G('rbxArrayList')(vm.runInNewContext('[8]'))) === '[8]');
  { const T3 = setup(); const r = runCase(T3, "S => { S.bond += 1; }", (T, s) => { appPrep(T, s); T.G('Array.prototype.constructor = function Array() {}'); });
    check('RB-2B-7c constructor 가 바뀐 게임 realm 에서 롤백 → partial(unverified)·schema(성공으로 보지 않음)', r.report.rollback === 'partial(unverified)' && /schema/.test(r.report.input), r.report && { rb: r.report.rollback, input: r.report.input }); }
});
// RB-2C: S 배열 10종의 L1·L2·L3 책임
const KEYS10 = ['items', 'itemsConsumed', 'relations', 'familiaHistory', 'falnaHistory', 'falnaTransitions', 'aspirationHistory', 'residenceHistory', 'locationHistory', 'levelHistory'];
const BASE_L1 = ['items', 'itemsConsumed', 'relations', 'levelHistory'];
const ensureArr = (s, k) => { if (!Array.isArray(s[k])) s[k] = []; if (!s[k].length) s[k].push(k === 'items' || k === 'itemsConsumed' ? 'x_item' : { id: 900, tag: k }); };
test('RB-2C-1 10종 각각: 원소 추가·삭제·원소 속성 변경 뒤 예외 → 참조·내용 복원, 묶음 ok', () => {
  for (const k of KEYS10) {
    const T = setup(); let ref;
    const prim = k === 'items' || k === 'itemsConsumed';
    const hook = prim ? `S => { S.${k}.push('zz'); S.${k}.shift(); }` : `S => { S.${k}[0].tag2 = 1; S.${k}.push({ id: 901 }); }`;
    const r = runCase(T, hook, (T, s) => { ensureArr(s, k); ref = s[k]; });
    check('RB-2C-1 ' + k + ' S 전체 = 스냅숏·원래 참조', snap(r.s, EXC) === r.pre && r.s[k] === ref);
    check('RB-2C-1 ' + k + ' 묶음 array:' + k + ' ok', r.report.bundles['array:' + k].status === 'ok', r.report.bundles['array:' + k]);
  }
});
test('RB-2C-2 확장 전담 L1(6종): 필드 삭제·교체 뒤 예외 → 확장이 되돌림, 기존 복원은 이 필드를 다루지 않음', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'script.js'), 'utf8');
  const fnSrc = name => { const i = src.indexOf('function ' + name + '('); let d = 0; const j = src.indexOf('{', i); for (let q = j; q < src.length; q++) { if (src[q] === '{') d++; else if (src[q] === '}' && --d === 0) return src.slice(i, q + 1); } return ''; };
  const base = fnSrc('takeRollbackSnapshot') + fnSrc('restoreRollbackSnapshot');
  for (const k of KEYS10.filter(k => !BASE_L1.includes(k))) {
    check('RB-2C-2 ' + k + ' 기존 스냅숏·복원에 없음', !new RegExp('\\b' + k + '\\b').test(base));
    for (const [how, hook] of [['삭제', `S => { delete S.${k}; }`], ['교체', `S => { S.${k} = []; }`]]) {
      const T = setup(); let ref; const r = runCase(T, hook, (T, s) => { ensureArr(s, k); ref = s[k]; });
      check('RB-2C-2 ' + k + ' ' + how + ' → 원래 참조', r.s[k] === ref && r.report.bundles['array:' + k].V1 === 'ok');
    }
  }
});
test('RB-2C-3 기존 전담 L1(4종): 기존 복원을 빼는 변이에서 확장이 L1 을 고치지 않고 V1 failed 로 보고(중복 없음)', () => {
  const MUT = {
    items: ['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['itemUses', 'itemsConsumed', 'relations'];"],
    itemsConsumed: ['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'relations'];"],
    relations: ['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed'];"],
    levelHistory: ['script.js', "    if (!lh.has) delete S.levelHistory;\n    else if (S.levelHistory !== lh.ref) S.levelHistory = lh.ref;", "    void lh;"] };
  for (const k of BASE_L1) {
    { const T = setup(); let ref; const r = runCase(T, `S => { S.${k} = []; }`, (T, s) => { ensureArr(s, k); ref = s[k]; });
      check('RB-2C-3 ' + k + ' 원본: 기존 복원이 원래 참조로 되돌림·V1 ok', r.s[k] === ref && r.report.bundles['array:' + k].V1 === 'ok'); }
    { const T = setup([MUT[k]]); let ref; const r = runCase(T, `S => { S.${k} = []; }`, (T, s) => { ensureArr(s, k); ref = s[k]; });
      check('RB-2C-3 ' + k + ' 변이: 확장이 L1 을 고치지 않음(참조 그대로 다름)·V1 failed·전체 partial(failed)', r.s[k] !== ref && r.report.bundles['array:' + k].V1 === 'failed' && r.report.rollback === 'partial(failed)', r.report.bundles['array:' + k]); }
  }
});
test('RB-2C-4 10종 각각: 스냅숏 때 지원하지 않는 배열(접근자 원소) → 내용 복원 안 함·unverified', () => {
  for (const k of KEYS10) {
    const T = setup();
    const r = runCase(T, `S => { S.bond += 1; }`, (T, s) => { ensureArr(s, k); Object.defineProperty(s[k], '0', { get() { return 'g'; }, enumerable: true, configurable: true }); });
    check('RB-2C-4 ' + k + ' unverified·schema', r.report.bundles['array:' + k].status === 'unverified' && new RegExp('schema\\):' + k).test(r.report.input), r.report.bundles['array:' + k]);
  }
});
// QA r3 필수 1: 최상위 S.application 자체가 접근자(RB-2A-5 의 S.application.history 접근자와 구분)
test('RB-2A-7 예외 시점 S.application 이 접근자: 자식 관찰 중단(replaced·changed null), getter 호출 0, 원래 참조 데이터 속성으로 복원', () => {
  const T = setup();
  const r = runCase(T, "S => { const a = S.application; Object.defineProperty(S, 'application', { get() { globalThis.__gz++; return a; }, set(v) { globalThis.__gz++; }, enumerable: true, configurable: true }); }", appPrep, T => T.G('globalThis.__gz = 0'));
  const [h, b] = appBundles(r);
  check('RB-2A-7 history·blocked replaced null·changed null', h.replaced === null && h.changed === null && b.replaced === null && b.changed === null, [h, b]);
  check('RB-2A-7 롤백 전체 getter·setter 호출 0', T.G('globalThis.__gz') === 0, T.G('globalThis.__gz'));
  const d = Object.getOwnPropertyDescriptor(r.s, 'application');
  check('RB-2A-7 복원 뒤 S.application 은 원래 객체의 데이터 속성·묶음 ok', d && 'value' in d && d.value === r.ids.application && r.report.bundles.application.status === 'ok' && h.refRestored === true, r.report.bundles.application);
});
test('RB-2A-8 S.application descriptor 획득 자체가 실패: 자식 관찰 중단(null)', () => {
  const T = setup();
  const r = runCase(T, "S => { globalThis.__gopd = Object.getOwnPropertyDescriptor; let once = true; Object.getOwnPropertyDescriptor = function (o, k) { if (once && o === S && k === 'application') { once = false; throw new Error('gopd'); } return globalThis.__gopd(o, k); }; }", appPrep);
  T.G('Object.getOwnPropertyDescriptor = globalThis.__gopd');
  const [h, b] = appBundles(r);
  check('RB-2A-8 history·blocked replaced null·changed null', h.replaced === null && h.changed === null && b.replaced === null && b.changed === null, [h, b]);
  check('RB-2A-8 원래 예외 전파·정지', r.err && r.err.message === 'boom' && T.G('progressHalted') === true);
});
finish('n2_rollback_test');
