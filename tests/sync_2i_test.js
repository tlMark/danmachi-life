// v1.7.8-2i 단위·시나리오 테스트(테스트 계획 r2k-4 §3·§3a·§3b·§3c·§3f·§6·§8).
// 각 테스트는 새 vm 컨텍스트에서 실행하고 끝나면 버린다(§3c-3 격리 규칙). 게임 코드에 테스트 훅을 넣지 않는다.
// 사용: node tests/sync_2i_test.js [v1.7.7-r1 폴더]   — r1 폴더를 주면 §3f R1~R7·M9(기준본 대조)도 실행. 실패가 하나라도 있으면 종료 코드 1.
const fs = require('fs'), vm = require('vm'), path = require('path');
const HERE = path.resolve(__dirname, '..');
const R1 = process.argv[2] || null;
const FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
const NEW_FIELDS = ['falnaState', 'falnaHolder', 'conversionPending', 'falnaTransitions', 'currentEventId', 'syncBaseline', 'statusResumeAge'];
// v1.7.8-ri: R-i 기록 전용 최상위 필드(r1·2-i 에 없음). 최상위에서만 제외한다(같은 이름의 하위 키는 비교 유지).
const RI_TOP_FIELDS = ['residence', 'residenceHistory', 'service', 'location', 'locationHistory'];   // F1D4A P2(WD-4·EN-7): E-3 위치 필드도 비교에서 제외(2-i 기준 빌드에는 없는 최상위 필드)
// T1-F F1-d4b(2026-11-09): 근속 기록 전용 최상위 필드 jobSince(r1·2-i 에 없음, lifeDigest·RNG 무관). 최상위에서만 제외.
// T1-F(2026-11-10): 후속 선택 수명주기용 최상위 필드 pendingFollowup·followupSeq(r1·2-i 에 없음, lifeDigest·RNG 무관). 최상위에서만 제외.
const JOB_TOP_FIELDS = ['jobSince', 'pendingFollowup', 'followupSeq'];
const stripNew = s => JSON.stringify(s, function (k, v) { if (NEW_FIELDS.includes(k)) return undefined; if (this === s && (RI_TOP_FIELDS.includes(k) || JOB_TOP_FIELDS.includes(k))) return undefined; return v; });

function el() {
  const e = { style: {}, kids: [], classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, scrollIntoView() {},
    appendChild(c) { this.kids.push(c); c.isConnected = true; return c; }, querySelectorAll() { return this.kids; }, textContent: '', innerText: '', checked: false };
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { e.kids = []; } });
  return e;
}
function makeCtx(dir, { seed = 20261104, newborn = false } = {}) {
  const els = {};
  const document = { getElementById: id => (els[id] ||= el()), createElement: () => el(), querySelectorAll: () => [] };
  let state = seed >>> 0, calls = 0;
  const M = Object.create(Math);
  M.random = () => { calls++; state += 0x6D2B79F5; let v = state; v = Math.imul(v ^ (v >>> 15), v | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
  const ctx = vm.createContext({ document, window: { scrollTo() {} }, setTimeout() {}, console, Math: M, __NEWBORN_MEMBERSHIP: newborn ? true : undefined });
  vm.runInContext(FILES.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n'), ctx, { filename: 'game.js' });
  const G = code => vm.runInContext(code, ctx);
  return { ctx, G, S: () => G('S'), rngCalls: () => calls, rngState: () => ({ state, calls }) };
}
const results = []; let failed = 0;
function check(id, cond, detail) { const ok = !!cond; if (!ok) failed++; results.push((ok ? 'PASS ' : 'FAIL ') + id + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); return ok; }
function test(id, fn) { try { fn(); } catch (e) { failed++; results.push('FAIL ' + id + ' — 예외 ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } }
const fam = (T, id) => T.G('gachaData').familias.find(f => f.id === id);
const syncStored = T => { if (T.G('typeof deriveFalnaState') !== 'function') return; const s = T.S(); s.falnaState = T.G('deriveFalnaState()'); s.falnaHolder = T.G('deriveFalnaHolder()'); };
// 공통 사전 상태: member + active, 나이 25
function setActiveMember(T, familiaId = 'loki', { job = 'adventurer', extraFlags = [] } = {}) {
  T.G('startLife()'); const s = T.S();
  s.age = 25; s.chronologicalAge = 25; s.phase = 25; s.physicalAge = 25;
  s.familia = fam(T, familiaId);
  s.familiaHistory = [{ id: 1, familiaId, label: s.familia.label, joinedAt: 15, leftAt: null, leftReason: null, role: 'member', falnaAt: 15 }];
  s.nextMembershipId = 2;
  s.flags = s.flags.filter(f => !['falna', 'adventurer', 'supporter'].includes(f)).concat(['falna'], extraFlags);
  T.G(`setJob(${JSON.stringify(job)})`);
  s.falnaHistory = [{ familiaId, at: 15, membershipIndex: 0 }]; s.level = Math.max(1, s.level); s.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }];
  s.falnaTransitions = []; s.conversionPending = null; s.syncBaseline = null; s.currentEventId = null;
  syncStored(T); return s;
}
const synthEvent = (id, fx) => ({ id, text: 't', choices: [{ label: 'x', text: 'x', fx }] });
// v1.7.8-2ba: 실제 god_gone 은 2b-a 에서 송환=봉인·재수여(godReturn)로 바뀌었다. 2-i 레거시 메커니즘(rebind·dropFamilia+clearFlags falna)의
// 검사는 r3 의 god_gone 데이터를 그대로 복제한 고정 픽스처로 계속한다(같은 id → updateConversionPending 의 god_returned 사유 경로 유지).
const legacyGG = () => ({ id: 'god_gone', w: 3, once: true, cond: { age: [20, 60], job: ['adventurer'] }, text: '주신이 규칙을 어겨 천계로 송환되었고, 새겨진 팔나가 봉인되었다.', choices: [
  { label: '새 주신을 찾아 나선다', chance: { p: .6, stat: 'bond', per: .004, ok: { text: '받아 주는 신을 만나 힘을 되찾았다.', fx: { familia: 'rebind' } }, fail: { text: '받아 줄 신을 찾지 못해 평범한 사람으로 돌아갔다.', fx: { dropFamilia: true, clearFlags: ['adventurer', 'falna'], bond: -3 } } } },
  { label: '모험을 접고 일상으로 돌아간다', text: '힘을 잃은 채 평범한 생활을 택했다.', fx: { dropFamilia: true, clearFlags: ['adventurer', 'falna'], hp: 5 } }] });
const runChoice = (T, ev, ch) => { T.ctx.showEvent(ev); return T.ctx.choose(ch || ev.choices[0]); };
const throwing = (obj, key, msg) => { Object.defineProperty(obj, key, { get() { throw new Error(msg); }, enumerable: true }); return obj; };
const captureModes = T => { const modes = []; const orig = T.ctx.rollFamilia; T.ctx.rollFamilia = function () { modes.push(arguments[1]); return orig.apply(this, arguments); }; return modes; };
const lastT = s => s.falnaTransitions[s.falnaTransitions.length - 1];

// ───────── §3a S1~S9 ─────────
test('S1', () => {
  const T = makeCtx(HERE); T.G('startLife()'); const s = T.S();
  check('S1 초기 필드', s.falnaState === 'none' && s.falnaHolder === null && s.conversionPending === null && Array.isArray(s.falnaTransitions) && 'currentEventId' in s && 'syncBaseline' in s && s.syncBaseline === null, { falnaState: s.falnaState, falnaHolder: s.falnaHolder, cp: s.conversionPending });
  check('S1 출신·종족·재능 apply 후 전이 0, 동기화 로그 0', (s.falnaTransitions || []).length === 0 && T.G('syncInvariantLog.length') === 0, { transitions: s.falnaTransitions.length, log: T.G('syncInvariantLog') });
});
test('S2/N5/N8f', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  runChoice(T, synthEvent('prev_event', { bond: 1 }));                       // 직전 이벤트 id 가 새지 않는지(N5)
  s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = []; s.levelHistory = []; s.level = 0; s.falnaAt = 25; syncStored(T);
  T.G('checkFalna()');                                                     // 깊이 0 수여
  const t = lastT(s);
  check('S2 none→active grant 1건', s.falnaTransitions.length === 1 && t.from === 'none' && t.to === 'active' && t.cause === 'grant' && t.holderTo === 'loki', t);
  check('S2 falnaHistory 1건(기존 경로)', s.falnaHistory.length === 1);
  check('N5 eventId null', t.eventId === null, t.eventId);
  check('N8f 기준값 null·scopeKind checkFalna', s.syncBaseline === null && t.scopeKind === 'checkFalna');
});
test('S3', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  T.G('apply({}); checkFalna(); apply({ bond: 1 }); checkFalna();');
  check('S3 같은 상태 반복 동기화 전이 0', s.falnaTransitions.length === 0 && s.syncBaseline === null);
});
test('S3b/S6/N3/M6/T11b', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T); const modes = captureModes(T);
  T.G('gachaData').familias = [fam(T, 'ganesha')];
  const gg = legacyGG();
  const eventIds = []; const origApply = T.ctx.apply; T.ctx.apply = function () { eventIds.push(T.S().currentEventId); return origApply.apply(this, arguments); };
  runChoice(T, gg, gg.choices[0].chance.ok);
  const t = lastT(s);
  check('S6 이동 성공(가드 없음)', s.familia && s.familia.id === 'ganesha' && s.flags.includes('falna'));
  check('S3b/N3 active→active holder 변경 1건 legacy_auto_convert', s.falnaTransitions.length === 1 && t.from === 'active' && t.to === 'active' && t.holderFrom === 'loki' && t.holderTo === 'ganesha' && t.cause === 'legacy_auto_convert', t);
  check('N3 eventId god_gone', t.eventId === 'god_gone');
  check('M6 모드 legacy_rebind', modes.join() === 'legacy_rebind', modes);
  check('N4 안쪽 apply 에서 currentEventId 불변', eventIds.length >= 2 && eventIds.every(x => x === 'god_gone'), eventIds);
  check('god_gone 성공 fx: 레거시 픽스처 rebind / 실제 데이터 godReturn regrant(2b-a)', gg.choices[0].chance.ok.fx.familia === 'rebind' && T.G("EVENTS.find(e => e.id === 'god_gone')").choices[0].chance.ok.fx.godReturn === 'regrant');
});
test('S4', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  runChoice(T, synthEvent('have_child_like', { dropFamilia: true }));
  const t = lastT(s);
  check('S4 active→unbound drop_familia', s.falnaTransitions.length === 1 && t.from === 'active' && t.to === 'unbound' && t.cause === 'drop_familia', t);
  check('S4 conversionPending left·fromFamiliaId 복원', s.conversionPending && s.conversionPending.reason === 'left' && s.conversionPending.fromFamiliaId === 'loki', s.conversionPending);
});
test('S5', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  const gg = legacyGG();
  runChoice(T, gg, gg.choices[1]);   // 실패·포기 선택(dropFamilia + clearFlags falna) — 레거시 픽스처
  const t = lastT(s);
  check('S5 active→sealed leave_and_seal', t && t.from === 'active' && t.to === 'sealed' && t.cause === 'leave_and_seal', t);
  check('S5 reason god_returned·fromFamiliaId', s.conversionPending && s.conversionPending.reason === 'god_returned' && s.conversionPending.fromFamiliaId === 'loki', s.conversionPending);
  check('S5 소속 이력 종료 사유는 기존 left 그대로', s.familiaHistory[0].leftReason === 'left');
});
test('S5b', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  runChoice(T, synthEvent('other_seal', { dropFamilia: true, clearFlags: ['adventurer', 'falna'] }));
  check('S5b reason sealed_other', s.conversionPending && s.conversionPending.reason === 'sealed_other' && lastT(s).cause === 'leave_and_seal', s.conversionPending);
});
test('S5c', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  const fx = { dropFamilia: true }; Object.defineProperty(fx, 'hp', { get() { const b = T.S().syncBaseline; if (b) b.openFamiliaId = null; return 0; }, enumerable: true });   // choose() 의 선 판정에서도 읽히므로 범위 안에서만 주입
  runChoice(T, synthEvent('s5c', fx));
  const t = lastT(s);
  check('S5c fromFamiliaId 마지막 종료 이력에서 복원·cause _recovered', t && t.cause === 'drop_familia_recovered' && t.fromFamiliaId === 'loki' && s.conversionPending.fromFamiliaId === 'loki', t);
});
test('S7/M2', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T, 'loki', { job: 'supporter', extraFlags: [] });
  runChoice(T, synthEvent('drop', { dropFamilia: true }));
  const modes = captureModes(T); T.G('gachaData').familias = [fam(T, 'hestia')];
  const lj = T.G("EVENTS.find(e => e.id === 'latejoin')");
  runChoice(T, lj, lj.choices[0]);
  const t = lastT(s);
  check('M2 모드 legacy_rejoin', modes.join() === 'legacy_rejoin', modes);
  check('S7 unbound→active legacy_rejoin·pending null', t.from === 'unbound' && t.to === 'active' && t.cause === 'legacy_rejoin' && t.holderTo === 'hestia' && s.conversionPending === null, t);
});
test('S9', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  const before = JSON.stringify([s.falnaHistory, s.familiaHistory, s.flags]);
  T.G('apply({ bond: 1 })');
  check('S9 동기화가 falnaHistory·familiaHistory·flags 를 쓰지 않음', JSON.stringify([s.falnaHistory, s.familiaHistory, s.flags]) === before);
});

// ───────── §3b M1~M10 ─────────
function setNone(T, age = 15, job = 'merchant') { T.G('startLife()'); const s = T.S(); s.age = age; s.chronologicalAge = age; s.phase = age; s.familia = null; s.familiaHistory = []; s.falnaHistory = []; s.flags = s.flags.filter(f => f !== 'falna'); T.G(`setJob(${JSON.stringify(job)})`); s.falnaTransitions = []; syncStored(T); return s; }
// 2b-b: join 은 심사(파생 RNG)를 거치므로 합격한 생애를 찾아 검사한다(거절이면 rollFamilia 미호출).
function recruitTrial(id, pick, setup, maxSeeds = 60) {
  let acc = null, rej = null, n = 0;
  for (let seed = 1; seed <= maxSeeds && !(acc && rej); seed++, n++) {
    const T = makeCtx(HERE, { seed }); setup(T); const modes = captureModes(T);
    const e = T.G(`EVENTS.find(e => e.id === '${id}')`); runChoice(T, e, pick(e));
    const s = T.S(), h = (s.application.history || []).slice(-1)[0];
    const r = { seed, modes: modes.slice(), joined: !!s.familia, outcome: h ? h.outcome : null, direct: h ? !!h.direct : null };
    if (h && h.outcome === 'accepted' && !acc) acc = r; else if (h && h.outcome === 'rejected' && !rej) rej = r;
    if (h && h.direct) break;
  }
  return { acc, rej, n };
}
test('M1', () => {
  const { acc } = recruitTrial('join', e => e.choices[0], T => setNone(T));
  check('M1 initial_join 입단(합격 생애)', !!acc && acc.modes.join() === 'initial_join' && acc.joined, acc);
});
test('M3(2-i 이탈)/M8/T11', () => {
  // 설계 M3 는 'sealed 의 roll 거부' 이나, 입단 3종 sealed 차단 조건이 digest 를 바꿔 2-ii 로 이동했고, 거부 자체도 결과를 바꿈(newborn/777 실측 1건) → 2-i 는 legacy_sealed_join(가드 없음, Q20).
  const T = makeCtx(HERE); const s = setActiveMember(T);
  const gg = legacyGG(); runChoice(T, gg, gg.choices[1]);   // 정상 sealed(레거시 픽스처)
  const modes = captureModes(T);
  T.G('apply({ familia: "roll" })');
  check('M3(2-i) sealed 의 roll → legacy_sealed_join·입단(현행 보존)', modes.join() === 'legacy_sealed_join' && !!s.familia && !s.falnaTransitions.some(t => t.cause === 'rejected'), modes);
  // M8·T11: 거부 경로(initial_join 에 sealed 투입)는 직접 호출로 확인
  const T2 = makeCtx(HERE); const s2 = setActiveMember(T2); { const lg = legacyGG(); runChoice(T2, lg, lg.choices[1]); }
  const n0 = s2.falnaTransitions.length, hist = JSON.stringify(s2.familiaHistory), c0 = T2.rngCalls();
  const ret = T2.G('rollFamilia(undefined, "initial_join")'); const t = lastT(s2);
  check('T11 initial_join 에 sealed 투입 → 거부·rejected 1건', ret === false && !s2.familia && s2.falnaTransitions.length === n0 + 1 && t.cause === 'rejected' && t.mode === 'initial_join', t);
  check('M8 거부 경로 난수 0', T2.rngCalls() - c0 === 0, T2.rngCalls() - c0);
  check('T11 이력 무변화', JSON.stringify(s2.familiaHistory) === hist);
});
if (R1) test('M3 r1 대조', () => {   // sealed 'roll': r1 과 2-i 의 결과·난수 동일
  for (const seed of [5, 777, 20261104]) {
    const A = makeCtx(R1, { seed }), B = makeCtx(HERE, { seed }); const strip = stripNew;
    for (const T of [A, B]) { setActiveMember(T); const g = legacyGG(); runChoice(T, g, g.choices[1]); }   // r1 데이터와 같은 레거시 픽스처
    const a0 = A.rngCalls(), b0 = B.rngCalls(); A.G('apply({ familia: "roll" })'); B.G('apply({ familia: "roll" })');
    check('M3 r1 대조 seed ' + seed, strip(A.S()) === strip(B.S()) && A.rngCalls() - a0 === B.rngCalls() - b0 && a0 === b0, { r1: A.S().familia && A.S().familia.id, i2: B.S().familia && B.S().familia.id });
  }
});
test('M4', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T, 'loki', { job: 'supporter' });
  runChoice(T, synthEvent('drop', { dropFamilia: true }));
  s.familiaHistory.push({ id: 9, familiaId: 'loki', joinedAt: 25, leftAt: null, role: 'member' });   // 오염: 열린 소속 이력
  const c0 = T.rngCalls(); const ret = T.G('rollFamilia(undefined, "legacy_rejoin")');
  check('M4 unbound + 열린 소속 → 거부·난수 0', ret === false && !s.familia && T.rngCalls() === c0 && lastT(s).cause === 'rejected');
});
test('M5', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T, 'loki', { job: 'supporter' });
  runChoice(T, synthEvent('drop', { dropFamilia: true }));
  s.conversionPending = { since: 25, fromFamiliaId: 'loki', reason: 'god_returned' };
  const ret = T.G('rollFamilia(undefined, "legacy_rejoin")');
  check('M5 사유가 left 가 아니면 거부', ret === false && !s.familia && lastT(s).cause === 'rejected');
});
test('M7', () => {
  const T = makeCtx(HERE); const s = setNone(T, 25, 'adventurer'); const modes = captureModes(T);
  T.G('apply({ familia: "rebind" })');
  check('M7 none·무소속 rebind 거부 안 함(2-i)', modes.join() === 'legacy_rebind' && !!s.familia, modes);
});
test('M10', () => {
  // 2b-b: join·join_hard·career_choice = 일반 지원(심사), latejoin = 직접 스카웃(심사 없음). join_hard 의 chance 는 제거됨(U-2b-3 b).
  const sites = [['join', c => c.choices[0]], ['latejoin', c => c.choices[0]], ['join_hard', c => c.choices[0]], ['career_choice', c => c.choices.find(x => x.fx && x.fx.recruit)]];
  for (const [id, pick] of sites) {
    const { acc, rej, n } = recruitTrial(id, pick, T => setNone(T, id === 'latejoin' ? 25 : 15, id === 'career_choice' ? 'child' : (id === 'latejoin' ? 'supporter' : 'merchant')));
    check('M10 ' + id + ' → initial_join(합격)', !!acc && acc.modes.join() === 'initial_join' && acc.joined && acc.direct === (id === 'latejoin'), { acc, n });
    if (id !== 'latejoin') check('M10 ' + id + ' 거절 → rollFamilia 미호출·무소속(2b-b)', !!rej && rej.modes.length === 0 && !rej.joined, { rej, n });
  }
  { const T = makeCtx(HERE); setActiveMember(T); const modes = captureModes(T); const e = T.G("EVENTS.find(e => e.id === 'god_gone')"); runChoice(T, e, e.choices[0].chance.ok);
    const tr = T.S().falnaTransitions.map(t => t.cause);
    check('M10 god_gone 성공 → rollFamilia 미호출·god_returned→regrant(2b-a)', modes.length === 0 && tr.join() === 'god_returned,regrant', { modes, tr }); }
  { const T = makeCtx(HERE); setActiveMember(T); const modes = captureModes(T); const lg = legacyGG(); runChoice(T, lg, lg.choices[0].chance.ok);
    check('M10 레거시 rebind 픽스처 → legacy_rebind(메커니즘 유지)', modes.join() === 'legacy_rebind', modes); }
  { const T = makeCtx(HERE, { newborn: true }); const modes = captureModes(T); let n = 0;
    for (; n < 300 && !modes.length; n++) T.G('startLife()');
    check('M10 startLife 출생 대조군 → newborn_control', modes.length === 1 && modes[0] === 'newborn_control' && T.S().familiaHistory[0].joinedAt === 0, { modes, lives: n }); }
});
if (R1) test('M9', () => {   // 허용 경로 난수 소비: r1 의 rollFamilia() 와 2-i 의 rollFamilia(_, 'initial_join') 비교
  for (const seed of [1, 777, 20261104]) {
    const A = makeCtx(R1, { seed }), B = makeCtx(HERE, { seed });
    for (const T of [A, B]) { setNone(T, 15); }
    const a0 = A.rngCalls(), b0 = B.rngCalls();
    A.G('rollFamilia()'); B.G('rollFamilia(undefined, "initial_join")');
    check('M9 seed ' + seed + ' 호출 수·결과 동일', A.rngCalls() - a0 === B.rngCalls() - b0 && a0 === b0 && A.S().familia.id === B.S().familia.id && A.S().falnaAt === B.S().falnaAt,
      { r1: [a0, A.rngCalls() - a0, A.S().familia.id], i2: [b0, B.rngCalls() - b0, B.S().familia.id] });
  }
});

// ───────── §3c N1~N9 ─────────
test('N1', () => {
  const T = makeCtx(HERE); const s = setNone(T, 18); T.G('gachaData').familias = [fam(T, 'loki')];
  const order = []; const oc = T.ctx.convertExp; T.ctx.convertExp = function () { order.push('convertExp:' + T.G('syncDepth')); return oc.apply(this, arguments); };
  const os = T.ctx.syncAtScopeEnd; T.ctx.syncAtScopeEnd = function (tok) { order.push('sync:' + tok.kind + ':' + tok.outermost); return os.apply(this, arguments); };
  runChoice(T, synthEvent('n1', { familia: 'roll' }));
  const t = lastT(s);
  check('N1 전이 정확히 1건 none→active grant', s.falnaTransitions.length === 1 && t.from === 'none' && t.to === 'active' && t.cause === 'grant' && t.scopeKind === 'apply', s.falnaTransitions);
  const outerSyncIdx = order.indexOf('sync:apply:true');
  check('N1 바깥 동기화 1회, 바깥 convertExp 직전', order.filter(x => x === 'sync:apply:true').length === 1 && order[outerSyncIdx + 1] === 'convertExp:1', order);
});
test('N2', () => {
  const T = makeCtx(HERE); const s = setNone(T, 5); T.G('gachaData').familias = [fam(T, 'loki')];
  runChoice(T, synthEvent('n2', { familia: 'roll' }));
  check('N2 수여 전 입단 → 전이 0', !!s.familia && !s.flags.includes('falna') && s.falnaTransitions.length === 0);
});
test('N6/N7', () => {
  { const T = makeCtx(HERE); setNone(T, 30); runChoice(T, synthEvent('die', { die: true })); check('N6 명시적 사망 후 currentEventId null', T.S().currentEventId === null && !!T.S().cause); }
  { const T = makeCtx(HERE); setNone(T, 30); runChoice(T, synthEvent('hp0', { hp: -9999 })); check('N7 체력 0 사망 후 currentEventId null', T.S().currentEventId === null && !!T.S().cause); }
});
function injectOrgAfterDrop(T) {
  const fx = throwing({ dropFamilia: true }, 'organization', 'INJECT_ORG'); let err = null;
  try { runChoice(T, synthEvent('inj_org', fx)); } catch (e) { err = e.message; } return err;
}
test('N8', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  const before = { familia: s.familia.id, flags: [...s.flags], n: s.falnaTransitions.length }; const r0 = T.rngState();
  let err = null; try { runChoice(T, synthEvent('inj_job', throwing({ bond: 1 }, 'job', 'INJECT_JOB'))); } catch (e) { err = e.message; }
  const r1 = T.rngState();
  check('N8 예외 전파', err === 'INJECT_JOB');
  check('N8 소속·팔나 불변·전이 0', s.familia.id === before.familia && s.flags.includes('falna') && s.falnaTransitions.length === before.n);
  check('N8 RNG {state, calls} 변화 0', r0.state === r1.state && r0.calls === r1.calls, { r0, r1 });
  check('N8 syncDepth 0·currentEventId null', T.G('syncDepth') === 0 && s.currentEventId === null);
  check('N8 기준값 pending = 예외 전 상태', s.syncBaseline && s.syncBaseline.status === 'pending_after_exception' && s.syncBaseline.state === 'active' && s.syncBaseline.holder === 'loki', s.syncBaseline);
  runChoice(T, synthEvent('normal', { bond: 1 }));
  check('N8d 다음 정상 이벤트: 복구 0·정상 0·기준값 null', s.falnaTransitions.length === before.n && s.syncBaseline === null);
});
test('N8a/N8b/N8k', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T); const r0 = T.rngState();
  const err = injectOrgAfterDrop(T); const r1 = T.rngState();
  check('N8a 예외·⑦까지 적용', err === 'INJECT_ORG' && s.familia === null && s.flags.includes('falna') && s.job === 'retired');
  check('N8a 전이 0·기준값 pending(active, loki)', s.falnaTransitions.length === 0 && s.syncBaseline.status === 'pending_after_exception' && s.syncBaseline.state === 'active' && s.syncBaseline.holder === 'loki' && s.syncBaseline.openFamiliaId === 'loki', s.syncBaseline);
  check('N8a RNG 변화(⑦까지 소비분, 기록용)', r1.calls >= r0.calls, { before: r0, after: r1 });
  const snap = JSON.stringify(s);
  runChoice(T, synthEvent('normal_after', { bond: 1 }));
  const t = s.falnaTransitions[0];
  check('N8b 복구 전이 정확히 1건', s.falnaTransitions.length === 1 && t.from === 'active' && t.to === 'unbound' && t.cause === 'recovered_after_exception' && t.fromFamiliaId === 'loki'
    && t.originalEventId === 'inj_org' && t.originalScopeKind === 'apply' && t.recoveredAtScopeKind === 'apply' && t.originalAt === 25 && t.recoveredAt === 25, t);
  check('N8b 이후 기준값 null·pending left', s.syncBaseline === null && s.conversionPending && s.conversionPending.reason === 'left');
  // N8k: 같은 예외 직후 상태에서 다음 범위 없이 endLife
  const T2 = makeCtx(HERE); const s2 = setActiveMember(T2); injectOrgAfterDrop(T2); T2.G('endLife()');
  const t2 = s2.falnaTransitions[0];
  check('N8k recovered_at_life_end 1건·기준값 null', s2.falnaTransitions.length === 1 && t2.cause === 'recovered_at_life_end' && t2.recoveredAtScopeKind === 'endLife' && s2.syncBaseline === null, t2);
  // N8c: 같은 fx 를 예외 없이 처리한 참조와 비교
  const T3 = makeCtx(HERE); const s3 = setActiveMember(T3); runChoice(T3, synthEvent('ref', { dropFamilia: true }));
  const k = x => JSON.stringify([x.from, x.to, x.holderFrom, x.holderTo, x.fromFamiliaId]);
  check('N8c 참조와 from/to/holder/fromFamiliaId 동일(cause 만 다름)', s3.falnaTransitions.length === 1 && k(s3.falnaTransitions[0]) === k(t) && s3.falnaState === s.falnaState && JSON.stringify(s3.conversionPending) === JSON.stringify(s.conversionPending), { ref: s3.falnaTransitions[0], rec: t });
  void snap;
});
test('N8g', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  s.flags = s.flags.filter(f => f !== 'falna'); s.falnaAt = 25; s.level = 0; s.levelHistory = [];
  const arr = []; Object.defineProperty(arr, 'push', { value() { throw new Error('INJECT_PUSH'); } }); s.falnaHistory = arr; syncStored(T);
  let err = null; try { T.G('checkFalna()'); } catch (e) { err = e.message; }
  check('N8g 예외 직후 전이 0·pending(none, checkFalna, eventId null)·깊이 0', err === 'INJECT_PUSH' && s.falnaTransitions.length === 0 && s.syncBaseline.status === 'pending_after_exception' && s.syncBaseline.state === 'none' && s.syncBaseline.scopeKind === 'checkFalna' && s.syncBaseline.eventId === null && T.G('syncDepth') === 0, s.syncBaseline);
  s.falnaHistory = [];
  T.G('checkFalna()');   // 다음 가장 바깥 범위(다음 해 checkFalna 에 해당)
  const t = s.falnaTransitions[0];
  check('N8g 복구 전이 1건 none→active', s.falnaTransitions.length === 1 && t.from === 'none' && t.to === 'active' && t.cause === 'recovered_after_exception' && t.originalScopeKind === 'checkFalna' && s.syncBaseline === null, t);
});
test('N8h/N8i', () => {
  { const T = makeCtx(HERE, { newborn: true }); const modes = captureModes(T); let n = 0;
    for (; n < 300 && !modes.length; n++) T.G('startLife()');
    const s = T.S(); const at0 = s.falnaTransitions.filter(t => t.age === 0);
    check('N8h 출생 입단 정상 경로: 0세 전이는 grant 뿐, 기준값 null', at0.every(t => t.cause === 'grant' && t.scopeKind === 'rollFamilia') && s.syncBaseline === null && T.G('syncDepth') === 0, at0); }
  { const T = makeCtx(HERE, { newborn: true }); const mods = T.G('MODS'); const saved = {};
    for (const [k, v] of Object.entries(mods.familias)) { saved[k] = v.fx; v.fx = throwing({}, 'power', 'INJECT_MFX'); }
    let err = null, n = 0; for (; n < 300 && !err; n++) { try { T.G('startLife()'); } catch (e) { err = e.message; } }
    for (const [k, v] of Object.entries(mods.familias)) v.fx = saved[k];
    const s = T.S();
    check('N8i 예외 전파·깊이 0·pending(rollFamilia)', err === 'INJECT_MFX' && T.G('syncDepth') === 0 && s.syncBaseline && s.syncBaseline.status === 'pending_after_exception' && s.syncBaseline.scopeKind === 'rollFamilia', { err, depth: T.G('syncDepth'), b: s.syncBaseline });
    const n0 = s.falnaTransitions.length; T.G('apply({})');
    check('N8i 다음 범위: 상태 그대로면 복구 0·기준값 null', s.falnaTransitions.length === n0 && s.syncBaseline === null);
    check('N8i 재시도 중 생애 시작 깊이 기록 0', !T.G('syncInvariantLog').some(x => x.kind === 'sync_depth_nonzero_at_life_start')); }
});
test('N8j-1', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T, 'loki', { job: 'supporter' });
  check('N8j 사전 상태', s.flags.includes('supporter') && s.job === 'supporter' && s.falnaState === 'active' && s.falnaHolder === 'loki');
  injectOrgAfterDrop(T);
  check('N8j-1 1단계 pending(active, loki)', s.syncBaseline.status === 'pending_after_exception' && s.syncBaseline.state === 'active' && s.falnaTransitions.length === 0);
  const modes = captureModes(T); T.G('gachaData').familias = [fam(T, 'hestia')];
  const lj = T.G("EVENTS.find(e => e.id === 'latejoin')"); runChoice(T, lj, lj.choices[0]);
  const [a, b] = s.falnaTransitions;
  check('N8j-1 전이 정확히 2건', s.falnaTransitions.length === 2, s.falnaTransitions);
  check('N8j-1 ① 복구 active→unbound', a && a.cause === 'recovered_after_exception' && a.from === 'active' && a.to === 'unbound' && a.fromFamiliaId === 'loki' && a.originalAt === 25 && a.recoveredAt === 25, a);
  check('N8j-1 ② legacy_rejoin unbound→active', b && b.cause === 'legacy_rejoin' && b.from === 'unbound' && b.to === 'active' && b.holderTo === 'hestia', b);
  check('N8j-1 모드 legacy_rejoin', modes.join() === 'legacy_rejoin', modes);
});
test('N8j-2/N8m', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T, 'loki', { job: 'supporter' });
  injectOrgAfterDrop(T);
  const order = []; const oc = T.ctx.checkFalna; T.ctx.checkFalna = function () { const r = oc.apply(this, arguments); order.push('checkFalna:transitions=' + T.S().falnaTransitions.length); return r; };
  const om = T.ctx.match; let latejoinMatch = null; T.ctx.match = function (c) { const r = om.apply(this, arguments); if (!order.includes('match')) order.push('match'); if (c && c.cage && c.cage[0] === 20 && c.flags && c.flags[0] === 'supporter') latejoinMatch = r; return r; };
  T.G('nextYear()');
  check('N8m 복구(413행 checkFalna 범위)가 후보 판정(match)보다 먼저', order[0] === 'checkFalna:transitions=1' && order.indexOf('match') > 0, order.slice(0, 3));
  const t = s.falnaTransitions[0];
  check('N8j-2 복구 1건(recoveredAt 다음 해, originalAt 25, checkFalna)', t && t.cause === 'recovered_after_exception' && t.originalAt === 25 && t.recoveredAt === 26 && t.recoveredAtScopeKind === 'checkFalna', t);
  // D-7(테스트 계획 r2k-4a 정정): dropFamilia 가 supporter→retired 로 바꾸면서 setJob 이 'supporter' 플래그를 지우므로 latejoin 조건은 거짓이다.
  check('N8j-2 latejoinMatch === false', latejoinMatch === false, latejoinMatch);
  check('N8j-2 supporterFlag === false', s.flags.includes('supporter') === false, s.flags);
  check('N8j-2 job === retired', s.job === 'retired', s.job);
});
test('N8l', () => {
  const T = makeCtx(HERE); const s = setActiveMember(T);
  s.syncBaseline = { status: 'normal', state: 'active', holder: 'loki', openFamiliaId: 'loki', flag: true, scopeKind: 'apply', eventId: null, fxKeys: [], at: 25 };
  T.G('apply({})');
  const log = T.G('syncInvariantLog');
  const n8l = { syncInvariantLog: log.map(x => x.kind), verdict: log.some(x => x.kind === 'stale_normal_baseline') ? 'detected(실패 판정)' : 'missed' };
  check('N8l stale_normal_baseline 기록 → 해당 실행 실패 판정', n8l.verdict.startsWith('detected') && s.syncBaseline === null, n8l);
});
const n8nResults = {};   // §3c-3: 전용 결과 객체. 본 실행 results.invariantFailures 로 이관하지 않는다.
for (const [id, depth] of [['N8n-1', 2], ['N8n-2', -1]]) test(id, () => {
  const T = makeCtx(HERE);                                  // 전용 컨텍스트
  vm.runInContext(`syncDepth = ${depth}`, T.ctx);            // 주입(lexical binding)
  T.G('startLife()');
  const s = T.S(); const log = vm.runInContext('syncInvariantLog.slice()', T.ctx);
  const r = n8nResults[id] = { syncInvariantLog: log.map(x => x.kind + ':' + x.value), depthAfter: vm.runInContext('syncDepth', T.ctx), ctxPropertyUntouched: T.ctx.syncDepth === undefined,
    transitions: s.falnaTransitions.length, syncBaseline: s.syncBaseline };
  r.verdict = log.filter(x => x.kind === 'sync_depth_nonzero_at_life_start').length === 1 ? 'detected(실패 판정)' : 'missed';
  check(id + ' 생애 시작 깊이 오류 기록 1건', r.verdict.startsWith('detected') && log.find(x => x.kind === 'sync_depth_nonzero_at_life_start').value === depth, r);
  check(id + ' 깊이 자동 보정 없음', r.depthAfter === depth, r.depthAfter);
  check(id + ' 가장 바깥으로 인식 안 됨 → 전이 0·기준값 null', r.transitions === 0 && r.syncBaseline === null);
});   // 각 컨텍스트는 이 함수가 끝나면 참조가 사라져 폐기된다.
test('N8n-3', () => {
  const T = makeCtx(HERE, { newborn: true });                // N8n-1·2 와 다른 새 컨텍스트, 깊이 주입 없음
  setActiveMember(T); injectOrgAfterDrop(T);
  const s = T.S(); s.flags = s.flags.filter(f => f !== 'falna');
  const mods = T.G('MODS'); const saved = {}; for (const [k, v] of Object.entries(mods.familias)) { saved[k] = v.fx; v.fx = throwing({}, 'power', 'INJECT_MFX'); }
  for (let n = 0, err = null; n < 300 && !err; n++) { try { T.G('startLife()'); } catch (e) { err = e; } }
  for (const [k, v] of Object.entries(mods.familias)) v.fx = saved[k];
  T.G('startLife()');
  check('N8n-3 예외 주입 연속 후 생애 시작 깊이 기록 0·깊이 0', !T.G('syncInvariantLog').some(x => x.kind === 'sync_depth_nonzero_at_life_start') && T.G('syncDepth') === 0, T.G('syncInvariantLog').map(x => x.kind));
});
test('N9', () => {
  const T = makeCtx(HERE); const s = setNone(T, 15, 'child');
  runChoice(T, synthEvent('org', { organization: 'guild' }));
  check('N9 조직 고용 안쪽 apply → 전이 0', !!s.employer && s.falnaTransitions.length === 0);
});

// ───────── §3 T3·T3b·T4·T7~T12 (2-i 전이 함수: 정의만, 게임 흐름에서 호출되지 않음) ─────────
test('T-series', () => {
  { const T = makeCtx(HERE); const s = setActiveMember(T); T.G('leaveFamilia()'); const t = lastT(s);
    check('T3 leaveFamilia active→unbound', s.familiaHistory[0].leftReason === 'left' && !s.familia && s.flags.includes('falna') && s.falnaState === 'unbound' && s.falnaHolder === null && s.conversionPending.reason === 'left' && t.cause === 'leave', t); }
  { const T = makeCtx(HERE); const s = setNone(T, 20); const before = JSON.stringify(s.familiaHistory); const r = T.G('leaveFamilia()');
    check('T3b 무소속 leaveFamilia 무변화', r === false && JSON.stringify(s.familiaHistory) === before && s.falnaTransitions.length === 0); }
  { const T = makeCtx(HERE); const s = setActiveMember(T); s.abil.str = 321; s.feat = 4; s.hidden = 7; const keep = JSON.stringify([s.level, s.abil, s.feat, s.hidden, s.levelHistory, s.job]);
    T.G('sealByGodReturn()');
    check('T4 송환 active→sealed·보존·god_returned', s.falnaState === 'sealed' && !s.flags.includes('falna') && s.familiaHistory[0].leftReason === 'god_returned' && s.conversionPending.reason === 'god_returned' && JSON.stringify([s.level, s.abil, s.feat, s.hidden, s.levelHistory, s.job]) === keep && !s.familia); }
  { const T = makeCtx(HERE); const s = setActiveMember(T); T.G('leaveFamilia()'); const keep = JSON.stringify([s.level, s.abil, s.job, s.falnaHistory]);
    T.G('completeConversion("hestia", "test")'); const m = s.familiaHistory[s.familiaHistory.length - 1];
    check('T7 completeConversion(unbound)', s.falnaState === 'active' && s.falnaHolder === 'hestia' && m.falnaAlreadyHeld === true && m.viaConversion === true && s.conversionPending === null && s.statusResumeAge === null /* 의도적 시험 변경(N2-1b (가), 2026-11-23): 이전 26 */ && JSON.stringify([s.level, s.abil, s.job, s.falnaHistory]) === keep && lastT(s).cause === 'convert'); }
  { const T = makeCtx(HERE); const s = setActiveMember(T); T.G('sealByGodReturn()'); T.G('completeConversion("hestia")');
    check('T8 completeConversion(sealed) regrant', s.falnaState === 'active' && s.flags.includes('falna') && s.falnaHistory[s.falnaHistory.length - 1].kind === 'regrant' && lastT(s).cause === 'regrant'); }
  { const cases = { 소속있음: T => setActiveMember(T), 대기없음: T => { const s = setActiveMember(T); T.G('leaveFamilia()'); s.conversionPending = null; }, none: T => setNone(T), active: T => setActiveMember(T) };
    for (const [k, prep] of Object.entries(cases)) { const T = makeCtx(HERE); prep(T); const s = T.S(); const st = s.falnaState; const r = T.G('completeConversion("hestia")');
      check('T9 전제 위반 거부: ' + k, r === false && s.falnaState === st && lastT(s).cause === 'rejected'); } }
  { const T = makeCtx(HERE); setNone(T);
    const forb = [['none', 'unbound'], ['none', 'sealed'], ['sealed', 'unbound'], ['unbound', 'sealed']].every(([a, b]) => T.G(`falnaTransitionAllowed('${a}', '${b}')`) === false);
    const allow = [['none', 'active'], ['active', 'unbound'], ['active', 'sealed'], ['unbound', 'active'], ['sealed', 'active']].every(([a, b]) => T.G(`falnaTransitionAllowed('${a}', '${b}')`) === true);
    check('T10 금지 전이 표', forb && allow); }
  { const T = makeCtx(HERE, { newborn: true }); setNone(T, 0, 'child'); const r = T.G('rollFamilia("loki", "newborn_control")');
    check('T11c newborn_control 0세 none 입단', r !== false && T.S().familia.id === 'loki'); }
  { const T = makeCtx(HERE); const s = setNone(T); const before = JSON.stringify(s); const c = T.G('pickFamiliaCandidate()');
    check('T12 pickFamiliaCandidate 상태 무변화', !!c && JSON.stringify(s) === before); }
  { const src = fs.readFileSync(path.join(HERE, 'script.js'), 'utf8'), ev = fs.readFileSync(path.join(HERE, 'events.js'), 'utf8');
    // 2b-a: sealByGodReturn·completeConversion 은 applyGodReturn 안에서만 1회씩 호출(Q2 승인). leaveFamilia 는 여전히 미연결.
    const body = (src.match(/function applyGodReturn\([\s\S]*?\n}\n/) || [''])[0];
    const outside = src.replace(body, '');
    const callers = ['leaveFamilia', 'sealByGodReturn', 'completeConversion'].filter(f => (outside.match(new RegExp('\\b' + f + '\\(', 'g')) || []).length > 1 || ev.includes(f));
    const inside = ['sealByGodReturn', 'completeConversion'].every(f => (body.match(new RegExp('\\b' + f + '\\(', 'g')) || []).length === 1);
    check('2-i 전이 함수: applyGodReturn 밖 게임 흐름 호출 0, 안에서 각 1회(2b-a)', callers.length === 0 && inside && body.length > 0, { callers, inside }); }
});

// ───────── §2.2 판정 함수 ─────────
test('judgement', () => {
  const T = makeCtx(HERE); setNone(T);
  const f = st => T.G(`(() => { const s = { falnaState: '${st}', falnaHolder: '${st === 'active' ? 'loki' : ''}' || null, familia: ${st === 'active' ? "{ id: 'loki' }" : 'null'}, age: 20 }; return [falnaEmbedded(s), canUseFalna(s), canUpdateStatus(s), accumulatesExcelia(s), accumulatesPotential(s), canEnterDungeon(s)]; })()`);
  const exp = { none: [false, false, false, false, true, false], active: [true, true, true, true, false, true], unbound: [true, true, false, true, false, true], sealed: [true, false, false, false, false, false] };
  for (const st of Object.keys(exp)) check('판정 함수 ' + st, JSON.stringify(f(st)) === JSON.stringify(exp[st]), f(st));
});

// ───────── §6 protected 전수 · §8 완전성 ─────────
test('§6 protected 전수', () => {
  const T = makeCtx(HERE); const expectZero = ['wargame', 'neglect', 'supporter_route', 'dive1', 'routine', 'minotaur', 'expedition', 'xenos', 'purple_moth', 'high_excelia', 'guild_advisor', 'encounter_goliath', 'find_grimoire', 'daedalus_orb', 'floor_boss_upper', 'mid_floor_expedition', 'deep_floor_survey', 'floor_lord_hunt', 'legend_clash'];
  const shown = new Set(), bad = new Set();
  for (const fid of ['soma', 'demeter']) for (const job of ['adventurer', 'supporter', 'farmer']) {
    setNone(T, 25, job); const s = T.S(); s.familia = fam(T, fid); s.familiaHistory = [{ id: 1, familiaId: fid, joinedAt: 20, leftAt: null, role: 'protected' }]; s.level = 3; s.power = 50; syncStored(T);
    for (const e of T.G('EVENTS')) if (T.ctx.match(e.cond)) { shown.add(e.id); if (expectZero.includes(e.id)) bad.add(e.id); }
  }
  check('§6 protected 기대 노출 0 집합(던전16+wargame+neglect+supporter_route)', bad.size === 0, [...bad]);
  check('§6 protected 허용 목록(출력만)', true, [...shown].sort().join(','));
  check('§6 god_gone 은 2-i 기대 집합 밖(알려진 2-ii 대상)', true, { god_gone_shown_to_protected_adventurer: shown.has('god_gone') });
});
test('§8 완전성', () => {
  const T = makeCtx(HERE);
  const jobs = new Set([...Object.keys(T.G('JOB_LABELS')), ...Object.values(T.G('JOB_FAMILIA')), ...Object.values(T.G('JOB_ORG')), ...Object.keys(T.G('ANNUAL_ACTIVITY'))]);
  for (const e of T.G('EVENTS')) { for (const j of ((e.cond || {}).job || [])) jobs.add(j); for (const c of e.choices) for (const r of [c, c.chance && c.chance.ok, c.chance && c.chance.fail]) if (r && r.fx && r.fx.job) jobs.add(r.fx.job); }
  const missing = [...jobs].filter(j => !(j in T.G('JOB_ROLE_CLASS')));
  check('§8 JOB_ROLE_CLASS 완전성', missing.length === 0, { missing, jobs: jobs.size });
  const src = T.G('match.toString()'); const keys = new Set(); for (const e of T.G('EVENTS')) Object.keys(e.cond || {}).forEach(k => keys.add(k));
  const unimpl = [...keys].filter(k => !src.includes('c.' + k));
  check('§8 이벤트 조건 키가 match() 에 구현됨', unimpl.length === 0, unimpl);
  check('§8 EVENT_AREA 81개 전수', T.G('EVENTS').every(e => T.G('EVENT_AREA')[e.id]) && T.G('EVENTS').length === 81, T.G('EVENTS').length);
});

// ───────── §3f R1~R7 (r1 'roll' ↔ 2-i 'rebind') ─────────
if (R1) test('R1~R7', () => {
  const setups = {
    R1: (T) => setActiveMember(T, 'loki'),
    R2: (T) => { const s = setActiveMember(T, 'loki'); s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = []; s.levelHistory = []; s.level = 0; s.falnaAt = 30; },
    R3: (T) => { const s = setActiveMember(T, 'demeter'); s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = []; s.levelHistory = []; s.level = 0; s.falnaAt = null; s.familiaHistory[0].role = 'protected'; },
    R4: (T) => { const s = setActiveMember(T, 'loki'); s.familiaHistory[0].leftAt = 24; s.familiaHistory[0].leftReason = 'left'; s.familia = null; s.conversionPending = { since: 24, fromFamiliaId: 'loki', reason: 'left' }; },
    R5: (T) => { const s = setActiveMember(T, 'loki'); s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = []; s.levelHistory = []; s.level = 0; s.familiaHistory = []; s.familia = null; },
    R6: (T) => { const s = setActiveMember(T, 'loki'); s.flags = s.flags.filter(f => f !== 'falna'); },
    R7: (T) => { const s = setActiveMember(T, 'loki'); s.flags = s.flags.filter(f => f !== 'falna'); s.familiaHistory[0].leftAt = 24; s.familiaHistory[0].leftReason = 'left'; s.familia = null; s.conversionPending = { since: 24, fromFamiliaId: 'loki', reason: 'god_returned' }; }
  };
  const strip = stripNew;
  const summary = {};
  for (const [rid, setup] of Object.entries(setups)) for (const seed of [11, 777, 20261104]) {
    const A = makeCtx(R1, { seed }), B = makeCtx(HERE, { seed });
    setup(A); setup(B); if (B.S()) syncStored(B);
    const a0 = A.rngCalls(), b0 = B.rngCalls();
    const ga = A.G("EVENTS.find(e => e.id === 'god_gone')"), gb = legacyGG();   // r1 실제 god_gone ↔ 2-i 레거시 rebind 픽스처(2b-a 이후 실제 데이터는 godReturn)
    runChoice(A, ga, ga.choices[0].chance.ok); runChoice(B, gb, gb.choices[0].chance.ok);
    const same = strip(A.S()) === strip(B.S()), callsSame = (A.rngCalls() - a0) === (B.rngCalls() - b0) && a0 === b0;
    const nextSame = A.G('Math.random()') === B.G('Math.random()');
    const tr = B.S().falnaTransitions;
    let extra = true;
    if (rid === 'R1') extra = (A.S().familia.id !== 'loki') ? (tr.length === 1 && tr[0].cause === 'legacy_auto_convert') : tr.length === 0;
    check(`${rid} seed ${seed}: 새 필드 제외 S 동일·RNG 호출 수·이후 값 동일`, same && callsSame && nextSame && extra, { same, callsSame, nextSame, moved: A.S().familia && A.S().familia.id, transitions: tr.map(t => t.cause) });
    summary[rid] = (summary[rid] || 0) + (same && callsSame && nextSame && extra ? 1 : 0);
  }
  check('R8 범주별 요약(A: R1, C: R2~R7)', true, { A_R1: summary.R1 + '/3', C: Object.fromEntries(Object.entries(summary).filter(([k]) => k !== 'R1').map(([k, v]) => [k, v + '/3'])) });
});

console.log(results.join('\n'));
console.log('n8nResults(전용 결과 객체, 본 실행에 이관하지 않음): ' + JSON.stringify(n8nResults));
console.log(failed ? `RESULT: FAIL ${failed}/${results.length}` : `RESULT: PASS ${results.length}/${results.length}`);
process.exitCode = failed ? 1 : 0;
