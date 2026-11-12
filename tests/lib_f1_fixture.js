// T1-F/F-1 테스트 공용 fixture. 모두 [합성 상태 주입]: 실제 생애를 재현하지 않고, 격리 vm 컨텍스트의 S 를 직접 구성한다.
const { makeCtx, setAge } = require('./lib_f1_ctx');

// join_hard 를 받을 수 있는 기본 상태: 인간·무소속·팔나 없음, 지정 나이. job 은 setJob 으로 지정해 jobSince 를 실제 규칙대로 만든다.
function prep(opts = {}) {
  const T = makeCtx(opts.ctx || {}); T.G('startLife()');
  T.G(`document.getElementById('choices').innerHTML = ''; S.currentEventId = null; S.cause = '';
       S.race = gachaData.races.find(r => r.id === 'human'); S.raceSubtype = null;
       S.familia = null; S.falnaAt = null; S.familiaAt = null; S.familiaHistory = []; S.falnaHistory = []; S.parentFamilia = null;
       S.flags = S.flags.filter(f => !['falna', 'adventurer', 'supporter', 'crafter', 'soldier', 'parents_in_familia', 'born_in_familia'].includes(f));
       S.falnaState = 'none'; S.falnaHolder = null; S.conversionPending = null; S.falnaTransitions = []; S.syncBaseline = null;
       S.employer = null; S.hp = 70; S.valis = 1000; S.done = []; S.eventCounts = {}; S.lastEventPhase = {}; S.recentEvents = [];
       S.application = GameCore.Recruit.newApplicationState(); S.pendingFollowup = null; S.followupSeq = 0; S.job = 'child'; S.jobSince = 0;`);
  const s = T.S(); const age = opts.age === undefined ? 20 : opts.age;
  if (opts.job && opts.job !== 'child') { setAge(s, age - (opts.tenure === undefined ? 5 : opts.tenure)); T.G(`setJob(${JSON.stringify(opts.job)})`); }
  setAge(s, age);
  if (opts.employer) { const org = T.G(`gachaData.organizations.find(o => o.id === ${JSON.stringify(opts.employer)})`); s.employer = { id: org.id, label: org.label, kind: org.kind, since: s.jobSince }; }
  if (opts.valis !== undefined) s.valis = opts.valis;
  T.G('recompute(); followupDiagLog.length = 0;');
  return { T, s };
}
// 심사 결과를 고정한다(합성). 실제 심사 함수 대신 지정 결과를 돌려준다 — 후보 선택(주 RNG 1회)·기록 경로는 실제 코드 그대로.
const forceOutcome = (T, outcome) => T.G(`GameCore.Recruit.evaluateApplication = () => ({ outcome: ${JSON.stringify(outcome)}, p: ${outcome === 'accepted' ? 1 : 0} })`);
// 차단 상태 주입: cooldown = 직전 해 일반 지원 거절 1건 / lifetime_cap = 일반 지원 이력 4건(상한)
function injectBlock(T, s, reason) {
  if (reason === 'cooldown') s.application.history.push({ route: 'self_apply', at: s.age - 1, attempt: 1, familiaId: 'loki', outcome: 'rejected', p: 0.1 }), s.application.attemptSeq = 1;
  else if (reason === 'lifetime_cap') { const n = T.G('GameCore.Recruit.RECRUIT_TUNING.lifetimeApplicationCap'); s.application.history = Array.from({ length: n }, (_, i) => ({ route: 'self_apply', at: s.age - 12 + i, attempt: i + 1, familiaId: 'loki', outcome: 'accepted', p: 1 })); s.application.attemptSeq = n; }
  else throw new Error('unknown reason ' + reason);
}
// join_hard 의 "끈질기게 문을 두드린다" 선택을 실제 사건 경로(showEvent → choose)로 실행한다.
function knock(T) { T.G("globalThis.__jh = EVENTS.find(e => e.id === 'join_hard'); showEvent(globalThis.__jh);"); T.G('choose(globalThis.__jh.choices[0])'); }
// 거절·차단 뒤 후속 화면까지 연다. how = 'rejected'(심사 결과 고정) | 'cooldown' | 'lifetime_cap'
function openFollowup(opts = {}, how = 'rejected') {
  const f = prep(opts);
  if (how === 'rejected') forceOutcome(f.T, 'rejected'); else injectBlock(f.T, f.s, how);
  if (opts.before) opts.before(f.T, f.s);
  knock(f.T);
  return f;
}
const pick = (T, id) => { const b = T.buttons().find(x => x.dataset.followup === id); if (!b) throw new Error('선택지 없음: ' + id + ' / ' + T.buttons().map(x => x.dataset.followup + ':' + x.textContent).join(', ')); return b.click(); };
const diagCount = (T, ev) => T.G('followupDiagLog').filter(x => x.event === ev).length;
const appJson = s => JSON.stringify(s.application);
module.exports = { prep, forceOutcome, injectBlock, knock, openFollowup, pick, diagCount, appJson };
