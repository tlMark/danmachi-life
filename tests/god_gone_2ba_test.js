// v1.7.8-2ba 2b-a(god_gone ↔ sealByGodReturn·completeConversion 연결) 단위·시나리오 테스트. 격리 vm, 게임 코드 훅 없음.
// 사용: node tests/god_gone_2ba_test.js   — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), vm = require('vm'), path = require('path');
const HERE = path.resolve(__dirname, '..');
const FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
function el() { const e = { style: {}, kids: [], classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, scrollIntoView() {},
  appendChild(c) { this.kids.push(c); c.isConnected = true; return c; }, querySelectorAll() { return this.kids; }, textContent: '', innerText: '', checked: false };
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { e.kids = []; } }); return e; }
function makeCtx(seed = 20261104) {
  const els = {}; const document = { getElementById: id => (els[id] ||= el()), createElement: () => el(), querySelectorAll: () => [] };
  let state = seed >>> 0, calls = 0, forced = null; const M = Object.create(Math);
  M.random = () => { calls++; if (forced !== null) return forced; state += 0x6D2B79F5; let v = state; v = Math.imul(v ^ (v >>> 15), v | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
  const ctx = vm.createContext({ document, window: { scrollTo() {} }, setTimeout() {}, console, Math: M });
  vm.runInContext(FILES.map(f => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n;\n'), ctx, { filename: 'game.js' });
  const G = code => vm.runInContext(code, ctx);
  return { ctx, G, S: () => G('S'), calls: () => calls, force: v => { forced = v; } };
}
const out = []; let failed = 0;
const check = (id, c, d) => { if (!c) failed++; out.push((c ? 'PASS ' : 'FAIL ') + id + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); };
const test = (id, fn) => { try { fn(); } catch (e) { failed++; out.push('FAIL ' + id + ' — 예외 ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const fam = (T, id) => T.G('gachaData').familias.find(f => f.id === id);
function activeMember(T, familiaId = 'loki', job = 'adventurer') {
  T.G('startLife()'); const s = T.S();
  s.age = 30; s.chronologicalAge = 30; s.phase = 30; s.physicalAge = 30;
  s.familia = fam(T, familiaId); s.familiaHistory = [{ id: 1, familiaId, label: s.familia.label, joinedAt: 15, leftAt: null, leftReason: null, role: 'member', falnaAt: 15 }]; s.nextMembershipId = 2;
  s.flags = s.flags.filter(f => !['falna', 'adventurer', 'supporter'].includes(f)).concat(['falna', 'adventurer']);
  T.G(`setJob(${JSON.stringify(job)})`);
  s.falnaHistory = [{ familiaId, at: 15, membershipIndex: 0 }]; s.level = 2; s.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }, { age: 25, kind: 'levelup', from: 1, to: 2 }];
  s.abil = { str: 120, vit: 80, dex: 60, agi: 40, mag: 10 };
  s.falnaTransitions = []; s.conversionPending = null; s.syncBaseline = null; s.currentEventId = null;
  s.falnaState = T.G('deriveFalnaState()'); s.falnaHolder = T.G('deriveFalnaHolder()');
  return s;
}
const gg = T => T.G("EVENTS.find(e => e.id === 'god_gone')");
const run = (T, ch) => { const e = gg(T); T.ctx.showEvent(e); T.ctx.choose(ch(e)); };
const causes = s => s.falnaTransitions.map(t => t.cause);
const syncLogAfter = (T, n) => T.G('syncInvariantLog').slice(n).map(x => x.kind);

test('GG-1 조건: active 만 후보(사용자 결정 — 팔나 조건 추가)', () => {
  const T = makeCtx(); const s = activeMember(T);
  check('GG-1a active 모험자 → match true', T.G("match(EVENTS.find(e => e.id === 'god_gone').cond)") === true);
  s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = []; s.falnaState = 'none'; s.falnaHolder = null;
  check('GG-1b 팔나 없는 소속 모험자(none) → match false', T.G("match(EVENTS.find(e => e.id === 'god_gone').cond)") === false);
  const T2 = makeCtx(); const s2 = activeMember(T2); s2.flags = s2.flags.filter(f => f !== 'falna'); s2.falnaState = 'sealed'; s2.falnaHolder = null;
  check('GG-1c sealed → match false', T2.G("match(EVENTS.find(e => e.id === 'god_gone').cond)") === false);
});
test('GG-2 성공: 봉인 → 송환 파밀리아 제외 재수여, 직업·레벨·능력치 보존', () => {
  for (const seed of [1, 11, 777, 20261104, 5]) {
    const T = makeCtx(seed); const s = activeMember(T, 'loki');
    // 의도적 시험 변경(F1D4A N2-3c (나), 사용자 결정 2026-11-23): 재수여에도 carryPotential 을 호출한다. 실제 생애의 active 단원은 팔나 취득 때 잠재력이 이월돼 0 이므로
    // 합성 사전 상태도 그와 맞춘다(이전 fixture 는 팔나 플래그가 있는데 잠재력이 남은 불일치 상태였다). 잠재력이 남은 경우의 이월은 tests/n2_link_test.js 에서 따로 본다.
    s.potential = 0;
    const abil = JSON.stringify(s.abil), lv = s.level, lh = s.levelHistory.length;
    const n = T.G('syncInvariantLog.length'); const c0 = T.calls();
    run(T, e => e.choices[0].chance.ok);
    const H = s.familiaHistory;
    check('GG-2a seed ' + seed + ' 전이 = god_returned → regrant(2건, 이중 기록 없음)', causes(s).join() === 'god_returned,regrant', causes(s));
    check('GG-2b seed ' + seed + ' 상태 active·새 holder ≠ loki', s.falnaState === 'active' && s.falnaHolder && s.falnaHolder !== 'loki' && s.familia && s.familia.id === s.falnaHolder && s.flags.includes('falna'), { st: s.falnaState, h: s.falnaHolder });
    check('GG-2c seed ' + seed + ' 소속 이력: loki 종료(god_returned) + 새 소속(viaConversion)', H.length === 2 && H[0].leftReason === 'god_returned' && H[0].leftAt === 30 && H[1].viaConversion === true && H[1].leftAt === null && H[1].familiaId === s.familia.id, H);
    check('GG-2d seed ' + seed + ' 직업 adventurer 유지(Q7)·레벨·능력치 보존', s.job === 'adventurer' && s.level === lv && JSON.stringify(s.abil) === abil);
    // 의도적 시험 변경(F1D4A N2-1b (가)·변경 이력 #2, 2026-11-23): 이전 기대 statusResumeAge = 31(나이+1) → null(유예 없음)
    check('GG-2e seed ' + seed + ' falnaHistory regrant 1건 추가·conversionPending null·statusResumeAge = null', s.falnaHistory.length === 2 && s.falnaHistory[1].kind === 'regrant' && s.conversionPending === null && s.statusResumeAge === null);
    check('GG-2f seed ' + seed + ' 동기화 불변식 기록 0', syncLogAfter(T, n).length === 0, syncLogAfter(T, n));
    const lhNew = s.levelHistory.slice(lh);
    check('GG-2h seed ' + seed + ' 레벨 이력 falna_again 1건(Lv 불변)·비 levelup 항목 수 = falnaHistory 수', lhNew.length === 1 && lhNew[0].kind === 'falna_again' && lhNew[0].from === lv && lhNew[0].to === lv && s.levelHistory.filter(h => h.kind !== 'levelup').length === s.falnaHistory.length, lhNew);
    check('GG-2g seed ' + seed + ' 난수: ok 분기 직접 적용(chance 판정 생략) → 후보 선택 정확히 1회', T.calls() - c0 === 1, T.calls() - c0);
  }
});
test('GG-3 실패·포기: 봉인 유지, 소속 종료 1회(dropFamilia 중복 없음), 명시 clearFlags 로만 직업 retired', () => {
  for (const [name, pick] of [['fail', e => e.choices[0].chance.fail], ['giveup', e => e.choices[1]]]) {
    const T = makeCtx(); const s = activeMember(T, 'ganesha'); const n = T.G('syncInvariantLog.length'); const c0 = T.calls();
    run(T, pick);
    check('GG-3a ' + name + ' 전이 god_returned 1건', causes(s).join() === 'god_returned', causes(s));
    check('GG-3b ' + name + ' sealed·소속 없음·팔나 플래그 없음', s.falnaState === 'sealed' && !s.familia && !s.flags.includes('falna'));
    check('GG-3c ' + name + ' 소속 이력 종료 1회(god_returned), left 없음', s.familiaHistory.length === 1 && s.familiaHistory[0].leftReason === 'god_returned');
    check('GG-3d ' + name + ' conversionPending god_returned·ganesha', s.conversionPending && s.conversionPending.reason === 'god_returned' && s.conversionPending.fromFamiliaId === 'ganesha');
    check('GG-3e ' + name + ' 직업 retired(선택지에 명시된 clearFlags adventurer)·레벨 보존', s.job === 'retired' && s.level === 2);
    check('GG-3f ' + name + ' 난수 0(봉인 경로)', T.calls() === c0, T.calls() - c0);
    check('GG-3g ' + name + ' 동기화 불변식 기록 0', syncLogAfter(T, n).length === 0, syncLogAfter(T, n));
  }
});
test('GG-4 재수여 후보에서 송환된 파밀리아 제외(사용자 결정)', () => {
  let hits = 0, n = 0;
  for (let seed = 1; seed <= 400; seed++) { const T = makeCtx(seed); const s = activeMember(T, 'ares'); run(T, e => e.choices[0].chance.ok); n++; if (s.familia && s.familia.id === 'ares') hits++; }
  check('GG-4a 400시드 재수여 결과에 ares 0건', hits === 0, { hits, n });
  const T = makeCtx(); activeMember(T); const c0 = T.calls();
  const r = T.G("pickFamiliaCandidate(undefined, { exclude: ['ares','ganesha','hephaestus','loki','freya','kali','hermes','demeter','miach','takemikazuchi','soma','astraea'] })");
  check('GG-4b exclude 적용 후 남은 후보만(hestia)', r && r.id === 'hestia' && T.calls() - c0 === 1, r && r.id);
  const T2 = makeCtx(7), T3 = makeCtx(7); T2.G('startLife()'); T3.G('startLife()');
  check('GG-4c 인자 없는 기존 호출은 동작·난수 동일', T2.G('pickFamiliaCandidate().id') === T3.G('pickFamiliaCandidate(undefined, {}).id') && T2.calls() === T3.calls());
});
test('GG-7 실제 choose() 의 chance 판정 경유(주 RNG 강제값으로 성공·실패 분기)', () => {
  // GG-2·GG-3 은 ok/fail 분기 객체를 직접 choose 에 넘겨 chance 판정을 생략한다. 여기서는 choices[0] 을 넘겨 실제 chance 판정을 거친다.
  { const T = makeCtx(11); const s = activeMember(T, 'loki'); const e = gg(T); T.ctx.showEvent(e); const c0 = T.calls(); T.force(0.0); T.ctx.choose(e.choices[0]); T.force(null);
    check('GG-7a chance 성공(난수 0.0) → god_returned·regrant, 난수 = 판정 1 + 후보 1', causes(s).join() === 'god_returned,regrant' && T.calls() - c0 === 2 && s.falnaState === 'active' && s.familia && s.familia.id !== 'loki', { tr: causes(s), d: T.calls() - c0, fam: s.familia && s.familia.id }); }
  { const T = makeCtx(11); const s = activeMember(T, 'loki'); const e = gg(T); T.ctx.showEvent(e); const c0 = T.calls(); T.force(0.999); T.ctx.choose(e.choices[0]); T.force(null);
    check('GG-7b chance 실패(난수 0.999) → god_returned 만·sealed·retired, 난수 = 판정 1', causes(s).join() === 'god_returned' && T.calls() - c0 === 1 && s.falnaState === 'sealed' && s.job === 'retired', { tr: causes(s), d: T.calls() - c0 }); }
});
test('GG-8 구조: 실패·포기 fx 에 dropFamilia 없음, clearFlags 는 정확히 [adventurer], 성공 fx 는 godReturn 만', () => {
  // 변이 dropBack(포기 fx 에 dropFamilia:true 재삽입)은 봉인 뒤 소속이 이미 없어 상태가 바뀌지 않으므로 행동 검사로는 검출되지 않는다 → 데이터 구조로 검출.
  const T = makeCtx(); const e = gg(T); const fail = e.choices[0].chance.fail.fx, give = e.choices[1].fx, ok = e.choices[0].chance.ok.fx;
  for (const [n, fx] of [['fail', fail], ['giveup', give]]) {
    check('GG-8 ' + n + ' dropFamilia 없음·godReturn seal·clearFlags=[adventurer]', !('dropFamilia' in fx) && fx.godReturn === 'seal' && JSON.stringify(fx.clearFlags) === '["adventurer"]', fx);
  }
  check('GG-8 ok fx = { godReturn: regrant } 만', JSON.stringify(ok) === '{"godReturn":"regrant"}', ok);
  check('GG-8 cond.falnaState = [active]', JSON.stringify(e.cond.falnaState) === '["active"]', e.cond);
});
test('GG-5 거주·출생지 불변(2b-a 는 이주 없음)', () => {
  const T = makeCtx(); const s = activeMember(T); const r = JSON.stringify([s.residence, s.residenceHistory]), o = s.origin.id;
  run(T, e => e.choices[0].chance.ok);
  check('GG-5', JSON.stringify([s.residence, s.residenceHistory]) === r && s.origin.id === o);
});
test('GG-6 방어: active 가 아닌 상태에서 직접 호출하면 거부·계측', () => {
  const T = makeCtx(); const s = activeMember(T); s.flags = s.flags.filter(f => f !== 'falna'); s.falnaState = 'none'; s.falnaHolder = null; s.falnaHistory = [];
  const n = T.G('syncInvariantLog.length'); const r = T.G("apply({ godReturn: 'seal' })");
  check('GG-6', syncLogAfter(T, n).includes('god_return_seal_rejected') && s.falnaState === 'none', syncLogAfter(T, n));
});
out.forEach(l => console.log(l));
console.log('RESULT: ' + (failed ? 'FAIL ' + failed : 'PASS') + ' ' + (out.length - failed) + '/' + out.length);
process.exit(failed ? 1 : 0);
