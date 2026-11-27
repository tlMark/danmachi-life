// F-1 join_hard 연결 테스트 — 결정 r9 F1-T1·T2·T2b·T3·T7·T9·T10·T11·T13·T14, 설계 r7(V-1, LC-1·2·7·9, CD-1·4, C24·C25·S-1).
// 사용: node tests/f1_joinhard_test.js   (실패 1건 이상이면 종료 코드 1)
// [합성 상태 주입] 표기 사례는 S 를 직접 구성하거나 심사 결과를 고정한다. F1-T1 은 실제 심사 함수로 거절이 나오는 시드를 찾아 쓴다.
const fs = require('fs'), path = require('path');
const { makeReporter, snap, GAME_ROOT } = require('./lib_f1_ctx');
const { prep, forceOutcome, injectBlock, knock, openFollowup, pick, diagCount, appJson } = require('./lib_f1_fixture');
const { check, test, finish } = makeReporter();
const EXC = ['pendingFollowup', 'currentEventId'];
const core = s => JSON.stringify({ job: s.job, jobSince: s.jobSince, employer: s.employer, flags: s.flags, valis: s.valis, familia: s.familia, falnaState: s.falnaState, falnaHolder: s.falnaHolder, falnaHistory: s.falnaHistory, familiaHistory: s.familiaHistory });
const labels = T => T.buttons().map(b => b.dataset.followup + ':' + b.textContent);

test('F1-T13 fallback 제거(C23)', () => {
  const root = GAME_ROOT, ev = fs.readFileSync(path.join(root, 'events.js'), 'utf8'), sc = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  check('F1-T13a events.js 에 fallback 속성 0', !/fallback\s*:/.test(ev));
  const body = sc.slice(sc.indexOf('function applyRecruit('), sc.indexOf('// ── F-1 후속 선택(일반 지원 거절·차단 뒤)'));
  check('F1-T13b applyRecruit 에 fallback 분기 0', body.length > 200 && !/fallback/.test(body));
  const { T } = prep(); const specs = T.G("EVENTS.flatMap(e => e.choices.map(c => ({ id: e.id, r: c.fx && c.fx.recruit })).filter(x => x.r))");
  check('F1-T13c 후속 선택 지정은 join_hard(persistence) 하나뿐', JSON.stringify(specs.filter(x => x.r.followup).map(x => [x.id, x.r.route, x.r.followup])) === JSON.stringify([['join_hard', 'persistence', 'recruit_after_fail']]), specs);
  check('F1-T13d 다른 recruit spec 불변(join·career_choice self_apply, latejoin scout)', JSON.stringify(specs.filter(x => !x.r.followup).map(x => [x.id, x.r.route])) === JSON.stringify([['join', 'self_apply'], ['latejoin', 'scout'], ['career_choice', 'self_apply']]), specs.map(x => [x.id, x.r.route]));
});

test('F1-T1 거절 직후(실제 심사): 지원 직전 대비 상태 불변·application 정상 기록만', () => {
  let found = null;
  for (let seed = 1; seed <= 200 && !found; seed++) {
    const { T, s } = prep({ ctx: { seed }, job: 'healer', tenure: 5, age: 20 }); const c0 = core(s), a0 = JSON.parse(appJson(s)), calls0 = T.calls();
    knock(T); const h = s.application.history.slice(-1)[0];
    if (h && h.outcome === 'rejected') found = { T, s, c0, a0, h, seed, delta: T.calls() - calls0 };
  }
  if (!check('F1-T1 0 실제 심사 거절 시드 존재', !!found)) return;
  const { T, s, c0, a0, h } = found;
  check('F1-T1a 직업·고용처·flags·valis·팔나·소속 동일', core(s) === c0);
  check('F1-T1b application: attemptSeq +1·history rejected 1건 추가·blocked 불변·current null', (s.application.attemptSeq || 0) === (a0.attemptSeq || 0) + 1 && s.application.history.length === a0.history.length + 1 && h.route === 'persistence' && JSON.stringify(s.application.blocked) === JSON.stringify(a0.blocked) && s.application.current === null, s.application);
  check('F1-T1c 후속 화면 표시(awaiting_choice)·다음 해 버튼 없음', s.pendingFollowup && s.pendingFollowup.phase === 'awaiting_choice' && !T.buttons().some(b => b.textContent === '다음 해로'), labels(T));
  check('F1-T1d 주 RNG = 후보 선택 1회', found.delta === 1, found.delta);
});

const blockedCase = (id, reason) => test(id, () => {
  const { T, s } = prep({ job: 'merchant', tenure: 3, age: 20 }); injectBlock(T, s, reason);
  const c0 = core(s), a0 = JSON.parse(appJson(s)), calls0 = T.calls(), p0 = appJson(s);
  knock(T); const a1 = s.application, b = a1.blocked.slice(-1)[0], p1 = appJson(s);
  check(id + ' a 차단 사유 ' + reason, b && b.reason === reason && b.route === 'persistence' && b.at === s.age, b);
  check(id + ' b 직업·고용처·flags·valis·팔나·소속 동일(자동 대체 효과 0)', core(s) === c0);
  check(id + ' c application: blocked +1 만, history·attemptSeq 불변', a1.blocked.length === (a0.blocked || []).length + 1 && JSON.stringify(a1.history) === JSON.stringify(a0.history) && a1.attemptSeq === a0.attemptSeq && a1.current === null);
  check(id + ' d 주 RNG 0', T.calls() === calls0);
  check(id + ' e 후속 화면 표시·reason 보존', s.pendingFollowup && s.pendingFollowup.phase === 'awaiting_choice' && s.pendingFollowup.context.reason === reason && s.pendingFollowup.context.route === 'persistence' && s.pendingFollowup.sourceEventId === 'join_hard', s.pendingFollowup);
  // V-1: P1 → P2(stay) application 바이트 동일, stay 는 전체 상태 불변
  const st1 = snap(s, EXC), c1 = T.calls(); pick(T, 'stay');
  check(id + ' f(V-1) stay 후 application 바이트 동일', appJson(s) === p1 && p1 !== p0);
  check(id + ' g(F1-T3) stay: 후속 선택 직전 대비 S 전체 불변·주 RNG 0', snap(s, EXC) === st1 && T.calls() === c1);
  check(id + " h '다음 해로' 1개·보류 정리", T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로' && s.pendingFollowup === null && s.currentEventId === null);
});
blockedCase('F1-T2 / CD-1·CD-4 cooldown 차단 [합성 상태 주입]', 'cooldown');
blockedCase('F1-T2b / LC-1·LC-2 lifetime_cap 차단 [합성 상태 주입]', 'lifetime_cap');

test('V-1 거절 경로 P0→P1→P2(stay) application [합성: 심사 결과 고정]', () => {
  const { T, s } = prep({ job: 'child', age: 15 }); forceOutcome(T, 'rejected'); const p0 = JSON.parse(appJson(s)); knock(T); const p1 = appJson(s), a1 = s.application;
  check('V-1a P0→P1 허용 변경: history +1·attemptSeq +1·blocked 그대로·current null', a1.history.length === p0.history.length + 1 && a1.attemptSeq === (p0.attemptSeq || 0) + 1 && JSON.stringify(a1.blocked) === JSON.stringify(p0.blocked) && a1.current === null);
  pick(T, 'stay');
  check('V-1b P1→P2 바이트 동일', appJson(s) === p1);
});

test('F1-T3 stay(거절 경로): 전체 불변 [합성: 심사 결과 고정]', () => {
  const { T, s } = openFollowup({ job: 'guild_staff', tenure: 6, age: 21, employer: 'guild' });
  const st = snap(s, EXC), c0 = T.calls(), js = s.jobSince; pick(T, 'stay');
  check('F1-T3a S 전체 불변', snap(s, EXC) === st);
  check('F1-T3b(F1-T4e) 근속 6년이어도 지급 0·jobSince 불변·고용처 유지', s.jobSince === js && s.employer && s.employer.id === 'guild');
  check('F1-T3c(C24) 주 RNG 0', T.calls() === c0);
});

test('C25·S-1 선택지 문구와 노출(C20) [합성 상태 주입]', () => {
  const cases = [
    ['child', { job: 'child', age: 15 }, '서포터 일을 시작한다'],
    ['고용처 없는 기존 직업', { job: 'merchant', tenure: 2, age: 20 }, '현재 직업을 그만두고 서포터로 전직한다'],
    ['고용 중', { job: 'guild_staff', tenure: 4, age: 20, employer: 'guild' }, '현재 고용처를 그만두고 서포터로 전직한다'],
    ['retired', { job: 'retired', tenure: 1, age: 21 }, '은퇴 생활을 접고 서포터 일을 시작한다'],
    ['retired + 고용처(고용처 문구 우선)', { job: 'retired', tenure: 1, age: 21, employer: 'hostess' }, '현재 고용처를 그만두고 서포터로 전직한다']];
  for (const [name, o, label] of cases) {
    const { T } = openFollowup(o); const l = labels(T);
    check('C25 ' + name, JSON.stringify(l) === JSON.stringify(['supporter:' + label, 'stay:지금 생활을 이어간다']), l);
  }
  const { T, s } = openFollowup({ job: 'supporter', tenure: 2, age: 20 });
  check('F1-T7 / LC-7 이미 서포터: 서포터 선택지 비노출', JSON.stringify(labels(T)) === JSON.stringify(['stay:지금 생활을 이어간다']));
  let threw = false; try { T.G("chooseFollowup('supporter')"); } catch (e) { threw = true; }
  check('F1-T7b 비노출 선택지 직접 호출 거부(상태 불변)', !threw && s.job === 'supporter' && s.pendingFollowup && s.pendingFollowup.phase === 'awaiting_choice' && diagCount(T, 'followup_invalid') === 1);
  const all = cases.map(c => c[2]).concat(['지금 생활을 이어간다']);
  check('Q-P 선택지에 마침표 없음', all.every(x => !/[.。]$/.test(x)));
  check('안내 문구(화면 전용)', (() => { const f = openFollowup({ job: 'child', age: 15 }); return f.T.el('log').kids.some(k => k.html === '앞으로 어떻게 지낼까?') && !f.s.logHistory.some(x => x.text === '앞으로 어떻게 지낼까?'); })());
});

test('F1-T9 기존 명시 선택지 "길드 주변에서 서포터 일을 구한다" 유지', () => {
  const { T, s } = prep({ job: 'child', age: 15, valis: 1000 }); T.G("globalThis.__jh = EVENTS.find(e => e.id === 'join_hard'); showEvent(globalThis.__jh); choose(globalThis.__jh.choices[1]);");
  check('F1-T9a child: supporter 플래그·직업 supporter·+600', s.flags.includes('supporter') && s.job === 'supporter' && s.valis === 1600);
  check('F1-T9b 후속 선택 없음', s.pendingFollowup === null && T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로');
  const f = prep({ job: 'healer', tenure: 5, age: 20, valis: 1000 }); f.T.G("globalThis.__jh = EVENTS.find(e => e.id === 'join_hard'); showEvent(globalThis.__jh); choose(globalThis.__jh.choices[1]);");
  check('F1-T9c 기존 직업 보유자: 플래그만 추가·직업 유지·+600(기존 동작 그대로)', f.s.flags.includes('supporter') && f.s.job === 'healer' && f.s.valis === 1600);
});

test('F1-T10 / LC-9 화면 표시 전 사망: 후속 화면 없음 [합성 상태 주입: hp 0]', () => {
  const { T, s } = prep({ job: 'child', age: 15 }); forceOutcome(T, 'rejected'); s.hp = 0; s.items = []; knock(T);
  check('F1-T10a 사망 처리·보류 정리', !!s.cause && s.pendingFollowup === null && diagCount(T, 'followup_discarded_on_death') === 1);
  check('F1-T10b 후속 화면 미표시', !T.buttons().some(b => b.dataset.followup));
  const f = prep({ job: 'child', age: 15 });
  check('F1-T10c 생애 시작 시 초기화', (() => { f.T.G('startLife()'); return f.T.S().pendingFollowup === null && f.T.S().followupSeq === 0; })());
});

test('F1-T11 T-1 거절 문구: 치환자·접미사 규칙', () => {
  const { T, s } = openFollowup({ job: 'child', age: 15 }); const h = s.application.history.slice(-1)[0], name = T.G(`gachaData.familias.find(f => f.id === ${JSON.stringify(h.familiaId)}).label`);
  const line = s.logHistory.map(x => x.text).find(x => x.includes('심사에서 탈락했다'));
  check('F1-T11a join_hard 거절 문구 = {familia}의 심사에서 탈락했다.', line === name + '의 심사에서 탈락했다.', line);
  check('F1-T11b 접미사 생략·이름 1회·서포터 서술 없음', !!line && !line.includes('심사 탈락)') && line.split(name).length === 2 && !s.logHistory.some(x => x.text.includes('서포터 일부터 시작했다')));
  const g = prep({ job: 'child', age: 15 }); forceOutcome(g.T, 'rejected'); g.T.G("apply({ recruit: { route: 'persistence', failText: '합성 문구' } })");
  const l2 = g.s.logHistory.map(x => x.text).find(x => x.startsWith('합성 문구'));
  check('F1-T11c 치환자 없는 failText(합성): 접미사 유지', /^합성 문구 \(.+ 심사 탈락\)$/.test(l2 || ''), l2);
  check('F1-T11d followup 미지정 spec 은 보류를 만들지 않음', g.s.pendingFollowup === null);
  const j = prep({ job: 'child', age: 15 }); forceOutcome(j.T, 'rejected'); j.T.G("globalThis.__j = EVENTS.find(e => e.id === 'join'); showEvent(globalThis.__j); choose(globalThis.__j.choices[0]);");
  const l3 = j.s.logHistory.map(x => x.text).find(x => x.includes('심사 탈락)'));
  check('F1-T11e join(self_apply) 거절: 기존 문구·접미사 그대로, 후속 선택 없음(범위 고정)', /^끝내 받아 주는 신을 찾지 못했다\. \(.+ 심사 탈락\)$/.test(l3 || '') && j.s.pendingFollowup === null && j.T.buttons()[0].textContent === '다음 해로', l3);
});

test('합격 경로: 후속 선택 없음 [합성: 심사 결과 고정]', () => {
  const { T, s } = prep({ job: 'child', age: 15 }); forceOutcome(T, 'accepted'); knock(T);
  // F1D4A P4(의도적 시험 변경): 합격 뒤에도 recruit_after_fail 은 없다. 다만 오라리오 소재 파밀리아 입단이고 위치·거주지가 둘 다 오라리오가 아니면
  //   P4 이주 후속 선택(relocate)이 뜬다(D-REGION §8.5.2). 원래 단언: 보류 없음 · followupSeq 0 · '다음 해로' 1개.
  const home = s.familia ? T.G('FAMILIA_HOME')[s.familia.id] : null, needOffer = home === 'orario' && !(s.location.regionId === 'orario' && s.residence.regionId === 'orario');
  check('합격 → 입단·recruit_after_fail 없음·(조건부) 이주 선택 또는 다음 해 버튼', !!s.familia && (needOffer
    ? (s.pendingFollowup && s.pendingFollowup.kind === 'relocate' && s.followupSeq === 1 && T.buttons().map(b => b.dataset && b.dataset.followup).join(',') === 'relocate,stay')
    : (s.pendingFollowup === null && s.followupSeq === 0 && T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로')), { fam: s.familia && s.familia.id, home, loc: s.location.regionId, res: s.residence.regionId, pf: s.pendingFollowup && s.pendingFollowup.kind });
});

test('F1-T14 공통 수명주기: 문맥 복원·차단·정리', () => {
  const { T, s } = openFollowup({ job: 'merchant', tenure: 2, age: 20 }, 'cooldown');
  T.G("{ const k = FOLLOWUP_KINDS.recruit_after_fail, o = k.resolve; k.resolve = function (S, id, p) { globalThis.__seen = { ev: S.currentEventId, src: p.sourceEventId, ctx: JSON.stringify(p.context), phase: p.phase }; return o.apply(this, arguments); }; }");
  const age = s.age; T.G('nextYear()'); T.G('endLife()');
  check('F1-T14a 선택 전 nextYear·endLife 진입 불가', s.age === age && !s.cause && diagCount(T, 'nextyear_blocked') === 1 && diagCount(T, 'endlife_blocked') === 1);
  T.G("chooseFollowup('nope')");
  check('F1-T14b 유효하지 않은 선택 거부', s.pendingFollowup && s.pendingFollowup.phase === 'awaiting_choice');
  pick(T, 'stay'); const seen = T.G('globalThis.__seen');
  check('F1-T14c sourceEventId·route·reason·currentEventId 복원', seen.ev === 'join_hard' && seen.src === 'join_hard' && seen.ctx === '{"route":"persistence","reason":"cooldown"}' && seen.phase === 'resolving_choice', seen);
  check('F1-T14d 처리 후 정리·다음 해 버튼', s.pendingFollowup === null && s.currentEventId === null && T.buttons().length === 1);
  // F1D4A P4(의도적 시험 변경): P4 가 relocate 종류를 더한다. 원래 단언: ["recruit_after_fail"]. U-2b-9 선택지 미추가(recruit_after_fail 선택지 불변)는 그대로.
  check('F1-T14e 등록된 kind 는 recruit_after_fail · relocate(P4) 둘(U-2b-9 선택지 미추가)', JSON.stringify(T.G('Object.keys(FOLLOWUP_KINDS)').slice().sort()) === '["recruit_after_fail","relocate"]');
});

finish('f1_joinhard_test');
