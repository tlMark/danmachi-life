// T1-F 공통 후속 선택 수명주기(PF) 단위 테스트 — 설계 r7 N-1(r9 C26·C27·C29, F1-T10·T14).
// 사용: node tests/followup_pf_test.js   (실패 1건 이상이면 종료 코드 1)
// 모든 사례는 [합성 상태 주입]: 시험용 kind 와 시험용 사건을 격리 vm 컨텍스트에 직접 등록한다. 실제 생애 결과가 아니다.
const { makeCtx, makeReporter, snap } = require('./lib_f1_ctx');
const { check, test, finish } = makeReporter();
const EXC = ['pendingFollowup', 'currentEventId'];

function setup(opts) {
  const T = makeCtx(opts); T.G('startLife()');
  T.G(`document.getElementById('choices').innerHTML = ''; S.currentEventId = null;
    globalThis.__res = 0; globalThis.__seen = []; globalThis.__hook = null; globalThis.__opts = null;
    FOLLOWUP_KINDS.t_kind = { prompt: '시험 안내',
      options: (S, p) => globalThis.__opts ? globalThis.__opts(S, p) : [{ id: 'go', label: '간다' }, { id: 'stay', label: '머문다', stay: true }],
      resolve: (S, id, p) => { globalThis.__res += 1; globalThis.__seen.push({ id, ev: S.currentEventId, phase: p.phase, kind: p.kind, ctx: JSON.stringify(p.context), src: p.sourceEventId });
        if (globalThis.__hook) globalThis.__hook(); if (id === 'go') S.bond += 3; } };
    globalThis.__applyOrig = apply;
    apply = function (fx) { const r = globalThis.__applyOrig(fx); if (fx && fx.__followup) globalThis.__created = createFollowup(fx.__followup, { tag: 'x' }); return r; };
    globalThis.__ev = { id: 't_ev', text: '시험 사건', choices: [{ label: 'a', text: '결과', fx: { bond: 0, __followup: 't_kind' } }, { label: 'die', text: '쓰러졌다', fx: { hp: -999, __followup: 't_kind' } }] };`);
  return T;
}
const open = (T, i = 0) => { T.G('showEvent(globalThis.__ev)'); T.G(`choose(globalThis.__ev.choices[${i}])`); };
const diag = (T, ev) => T.G('followupDiagLog').filter(x => x.event === ev).length;

test('PF-1 생애 시작 시 초기화', () => {
  const T = makeCtx(); T.G('startLife()'); const s = T.S();
  check('PF-1a pendingFollowup === null', s.pendingFollowup === null);
  check('PF-1b followupSeq === 0', s.followupSeq === 0);
});

test('PF-2 보류 생성: resolving_event·문맥·데이터만 저장', () => {
  const T = setup(); const s = T.S(); const before = snap(s, ['pendingFollowup', 'followupSeq', 'currentEventId']), c0 = T.calls();
  T.G("S.currentEventId = 't_ev'"); const ok = T.G("createFollowup('t_kind', { route: 'r', reason: 'x' })"); const p = s.pendingFollowup;
  check('PF-2a 생성 성공·phase resolving_event', ok === true && p && p.phase === 'resolving_event', p);
  check('PF-2b seq 1·kind·sourceEventId·context·createdAt', p.seq === 1 && s.followupSeq === 1 && p.kind === 't_kind' && p.sourceEventId === 't_ev' && p.context.route === 'r' && p.context.reason === 'x' && p.createdAt === s.age, p);
  check('PF-2c 함수 저장 없음(데이터만)', JSON.stringify(p) === JSON.stringify(JSON.parse(JSON.stringify(p))) && !Object.values(p).some(v => typeof v === 'function') && !Object.values(p.context).some(v => typeof v === 'function'));
  check('PF-2d 생성으로 다른 게임 상태 변경 0·난수 0', snap(s, ['pendingFollowup', 'followupSeq', 'currentEventId']) === before && T.calls() === c0);
  check('PF-2e 알 수 없는 kind 거부', (() => { const T2 = setup(); return T2.G("createFollowup('nope', {})") === false && T2.S().pendingFollowup === null && T2.S().followupSeq === 0 && diag(T2, 'followup_unknown_kind') === 1; })());
});

test('PF-3 생존 시 awaiting_choice·후속 화면', () => {
  const T = setup(); open(T); const s = T.S(), bs = T.buttons();
  check('PF-3a phase awaiting_choice', s.pendingFollowup && s.pendingFollowup.phase === 'awaiting_choice', s.pendingFollowup);
  check('PF-3b 버튼 = options 2개, 표식 go·stay', bs.length === 2 && bs[0].dataset.followup === 'go' && bs[1].dataset.followup === 'stay', bs.map(b => [b.textContent, b.dataset]));
  check("PF-3c '다음 해로' 없음", !bs.some(b => b.textContent === '다음 해로'));
  check('PF-3d 선택 전 currentEventId null(choose finally)·sourceEventId 보존', s.currentEventId === null && s.pendingFollowup.sourceEventId === 't_ev');
  check('PF-3e 안내는 화면 전용(logHistory 미기록)', !s.logHistory.some(x => x.text === '시험 안내') && T.el('log').kids.some(k => k.html === '시험 안내'));
});

test('PF-4 화면 표시 전 사망: 정상 종료·보류 정리', () => {
  const T = setup(); open(T, 1); const s = T.S();
  check('PF-4a 사망 처리 완료', !!s.cause && s.hp === 0, { cause: s.cause, hp: s.hp });
  check('PF-4b 보류 정리', s.pendingFollowup === null);
  check('PF-4c 후속 화면 미표시·resolve 0', T.G('globalThis.__res') === 0 && T.buttons().length === 0);
  check('PF-4d 진단 1건', diag(T, 'followup_discarded_on_death') === 1 && diag(T, 'endlife_blocked') === 0);
});

test('PF-5 선택 대기 중 nextYear·endLife 차단(DOM·상태·난수 변경 0)', () => {
  const T = setup(); open(T); const s = T.S();
  const b0 = snap(s), d0 = T.dom(), c0 = T.calls(), sync0 = JSON.stringify(s.syncBaseline);
  T.G('nextYear()');
  check('PF-5a nextYear 차단', snap(s) === b0 && T.dom() === d0 && T.calls() === c0 && diag(T, 'nextyear_blocked') === 1);
  T.G('endLife()');
  check('PF-5b endLife 차단', snap(s) === b0 && T.dom() === d0 && T.calls() === c0 && !s.cause && JSON.stringify(s.syncBaseline) === sync0 && diag(T, 'endlife_blocked') === 1);
  // 선택 처리 중(resolving_choice)에도 차단
  T.G(`globalThis.__hook = () => { const a = S.age; nextYear(); endLife(); globalThis.__mid = { age: S.age === a, cause: S.cause, phase: S.pendingFollowup && S.pendingFollowup.phase }; }`);
  T.buttons()[1].click(); const mid = T.G('globalThis.__mid');
  check('PF-5c resolving_choice 중 nextYear·endLife 차단', mid.age === true && !mid.cause && mid.phase === 'resolving_choice' && diag(T, 'nextyear_blocked') === 2 && diag(T, 'endlife_blocked') === 2, mid);
});

test('PF-6 무효 선택: 상태·보류·화면 불변', () => {
  const T = setup(); open(T); const s = T.S(); const b0 = snap(s), d0 = T.dom();
  T.G("chooseFollowup('zzz')");
  check('PF-6a 목록에 없는 id 거부', snap(s) === b0 && T.dom() === d0 && s.pendingFollowup.phase === 'awaiting_choice' && T.G('globalThis.__res') === 0 && diag(T, 'followup_invalid') === 1);
  T.G('globalThis.__opts = () => [{ id: "stay", label: "머문다", stay: true }]');   // 노출 조건이 바뀌어 go 가 더는 유효하지 않은 경우
  T.G("chooseFollowup('go')");
  check('PF-6b 현재 노출되지 않는 선택 거부', s.pendingFollowup && s.pendingFollowup.phase === 'awaiting_choice' && T.G('globalThis.__res') === 0 && diag(T, 'followup_invalid') === 2);
  T.G("chooseFollowup('stay')");
  check('PF-6c 이후 유효 선택은 정상 처리', s.pendingFollowup === null && T.G('globalThis.__res') === 1);
  const T2 = setup(); T2.G("chooseFollowup('stay')");
  check('PF-6d 보류 없음 상태의 선택 거부', T2.G('globalThis.__res') === 0 && diag(T2, 'followup_invalid') === 1);
});

test('PF-7 중복 클릭: 효과 1회', () => {
  const T = setup(); open(T); const s = T.S(); const bond0 = s.bond, go = T.buttons()[0];
  go.click(); go.click(); T.G("chooseFollowup('go')");
  check('PF-7a resolve 1회·효과 1회', T.G('globalThis.__res') === 1 && s.bond === bond0 + 3, { res: T.G('globalThis.__res'), bond: s.bond - bond0 });
  check('PF-7b 이후 입력은 검증에서 거부', diag(T, 'followup_invalid') === 2);
  check("PF-7c '다음 해로' 정확히 1개", T.buttons().filter(b => b.textContent === '다음 해로').length === 1 && T.buttons().length === 1);
});

test('PF-10 중첩 생성 금지', () => {
  const T = setup(); open(T); const s = T.S();
  const r = T.G("createFollowup('t_kind', {})");
  check('PF-10 이미 보류가 있으면 거부·seq 불변', r === false && s.followupSeq === 1 && s.pendingFollowup.seq === 1 && diag(T, 'followup_already_pending') === 1);
});

test('PF-11 문맥 복원과 정리', () => {
  const T = setup(); open(T); const s = T.S(); T.buttons()[1].click(); const seen = T.G('globalThis.__seen')[0];
  check('PF-11a resolve 중 currentEventId = sourceEventId', seen.ev === 't_ev' && seen.src === 't_ev' && seen.phase === 'resolving_choice' && seen.kind === 't_kind' && seen.ctx === '{"tag":"x"}', seen);
  check('PF-11b 처리 후 pending·currentEventId null', s.pendingFollowup === null && s.currentEventId === null);
  check("PF-11c '다음 해로' 생성", T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로');
  const age = s.age; T.buttons()[0].click();
  check('PF-11d 이후 다음 해 진행 가능', s.age > age || !!s.cause, { age: s.age });
});

test('PF-12 followup 범위: syncDepth·동기화 기록·팔나 전이 불변', () => {
  const T = setup(); open(T); const s = T.S(); const n0 = T.G('syncInvariantLog.length'), t0 = JSON.stringify(s.falnaTransitions), st0 = s.falnaState;
  T.buttons()[0].click();
  check('PF-12a syncDepth 0', T.G('syncDepth') === 0);
  check('PF-12b syncInvariantLog 추가 0', T.G('syncInvariantLog.length') === n0);
  check('PF-12c 팔나 전이 0·상태 불변·기준값 정리', JSON.stringify(s.falnaTransitions) === t0 && s.falnaState === st0 && s.syncBaseline === null);
});

test('PF-13 followupSeq 규칙', () => {
  const T = setup(); open(T); const s = T.S(); T.buttons()[1].click();
  T.G("document.getElementById('choices').innerHTML = ''"); open(T);
  check('PF-13a 생성마다 +1', s.followupSeq === 2 && s.pendingFollowup.seq === 2);
  T.G("createFollowup('t_kind', {})");
  check('PF-13b 거부 시 불변', s.followupSeq === 2);
  T.buttons()[1].click(); T.G('startLife()');
  check('PF-13c 새 생애에서 0', T.S().followupSeq === 0 && T.S().pendingFollowup === null && T.S() !== s);
});

test('PF-15 stay 선택: 선택 직전 상태 대비 전체 불변(C29)', () => {
  const T = setup(); open(T); const s = T.S(); const b0 = snap(s, EXC), c0 = T.calls();
  T.buttons()[1].click();
  check('PF-15a S 전체 불변(pending·currentEventId 제외)', snap(s, EXC) === b0);
  check('PF-15b 주 RNG 0', T.calls() === c0);
});

test('PF-16 자동 진행: stay 고정 클릭·난수 0', () => {
  // 사건 표시가 예약한 자동 선택 타이머(T1)는 이 사례의 대상이 아니므로 비우고, 선택은 직접 호출한다(후속 화면 타이머만 남긴다).
  const T = setup({ timers: 'queue' }); T.el('auto').checked = true; T.G('showEvent(globalThis.__ev)'); T.timers.length = 0; T.G('choose(globalThis.__ev.choices[0])');
  check('PF-16a 후속 화면 타이머 1개 예약', T.timers.length === 1);
  const c0 = T.calls(); T.runTimer(0);
  const seen = T.G('globalThis.__seen');
  check('PF-16b stay 선택 1회·Math.random 0', seen.length === 1 && seen[0].id === 'stay' && T.calls() === c0, seen);
  check("PF-16c 이어서 '다음 해로' 자동 클릭 타이머 1개", T.timers.length === 1 && T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로');
});

test('PF-17 선택지 0개: 정지 없이 다음 해 버튼', () => {
  const T = setup(); T.G('globalThis.__opts = () => []'); open(T); const s = T.S();
  check('PF-17 보류 정리·다음 해 버튼·진단', s.pendingFollowup === null && T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로' && diag(T, 'followup_render_failed') === 1);
});

finish('followup_pf_test');
