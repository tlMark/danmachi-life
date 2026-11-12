// v1.7.8-ri R-i(거주지 기록 전용) 단위·시나리오 테스트. 각 테스트는 새 vm 컨텍스트(격리). 게임 코드에 테스트 훅 없음.
// 사용: node tests/residence_ri_test.js   — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), vm = require('vm'), path = require('path');
const HERE = path.resolve(__dirname, '..');
const FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];
const RI = ['residence', 'residenceHistory', 'service'];
function el() {
  const e = { style: {}, kids: [], classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, scrollIntoView() {},
    appendChild(c) { this.kids.push(c); c.isConnected = true; return c; }, querySelectorAll() { return this.kids; }, textContent: '', innerText: '', checked: false };
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { e.kids = []; } });
  return e;
}
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
const strip = s => JSON.stringify(s, function (k, v) { return this === s && RI.includes(k) ? undefined : v; });
const ev = (T, id) => T.G('EVENTS').find(e => e.id === id);
function startAt(T, origin, age = 20) {
  T.G('startLife()'); const s = T.S();
  s.origin = T.G('gachaData').origins.find(o => o.id === origin);
  s.age = age; s.chronologicalAge = age; s.phase = age; s.physicalAge = age;
  s.residence = { regionId: origin, since: 0 }; s.residenceHistory = [{ seq: 1, regionId: origin, from: 0, to: null, reason: 'birth', eventId: null }]; s.service = {};
  return s;
}
test('RI-1 출생: 거주 = 출생지, 이력 1구간', () => {
  for (const seed of [1, 777, 20261104]) { const T = makeCtx(seed); T.G('startLife()'); const s = T.S();
    check('RI-1 seed ' + seed, s.residence.regionId === s.origin.id && s.residence.since === 0 && s.residenceHistory.length >= 1 && s.residenceHistory[0].reason === 'birth' && s.residenceHistory[0].regionId === s.origin.id && s.residenceHistory[0].from === 0, { o: s.origin.id, r: s.residence, h: s.residenceHistory.slice(0, 1) }); }
});
test('RI-2 moveResidence: 거주·이력만 변경, 난수 0, 로그 0', () => {
  const T = makeCtx(); const s = startAt(T, 'rakia', 23);
  const before = strip(s), calls = T.calls(), logN = s.logHistory.length, syncN = T.G('syncInvariantLog.length');
  const r = T.G("moveResidence('orario', 'fled')");
  check('RI-2a 반환 true', r === true);
  check('RI-2b 난수 호출 0', T.calls() === calls, { d: T.calls() - calls });
  check('RI-2c 거주 외 S 동일(origin·직업·소속·팔나·가족·플래그·발리스 포함)', strip(s) === before);
  check('RI-2d 로그 무변화', s.logHistory.length === logN);
  check('RI-2e 이력 반열린 구간', s.residenceHistory.length === 2 && s.residenceHistory[0].to === 23 && s.residenceHistory[1].from === 23 && s.residenceHistory[1].to === null && s.residenceHistory[1].seq === 2 && s.residenceHistory[1].reason === 'fled', s.residenceHistory);
  check('RI-2f residence = 마지막 구간', s.residence.regionId === 'orario' && s.residence.since === 23);
  check('RI-2g origin 불변', s.origin.id === 'rakia');
  check('RI-2h 동기화 로그 추가 0', T.G('syncInvariantLog.length') === syncN);
});
test('RI-3 같은 지역 = 이력 무변화', () => {
  const T = makeCtx(); const s = startAt(T, 'melen'); const h = JSON.stringify(s.residenceHistory);
  check('RI-3', T.G("moveResidence('melen','x')") === false && JSON.stringify(s.residenceHistory) === h && s.residence.regionId === 'melen');
});
test('RI-4 알 수 없는 지역 = 거부 + 계측 기록', () => {
  const T = makeCtx(); const s = startAt(T, 'orario'); const h = JSON.stringify(s.residenceHistory), n = T.G('syncInvariantLog.length');
  const r = T.G("moveResidence('atlantis','x')");
  check('RI-4', r === false && JSON.stringify(s.residenceHistory) === h && T.G('syncInvariantLog.length') === n + 1 && T.G('syncInvariantLog[syncInvariantLog.length-1].kind') === 'residence_unknown_region');
});
test('RI-5 복무 기록', () => {
  const T = makeCtx(); const s = startAt(T, 'rakia', 19);
  check('RI-5a conscripted 생성', T.G("recordService('conscripted')") === true && s.service.conscripted && s.service.conscripted.since === 19 && s.service.conscripted.regionId === 'rakia');
  check('RI-5b 중복 무변화', T.G("recordService('conscripted')") === false);
  const n = T.G('syncInvariantLog.length');
  check('RI-5c 알 수 없는 종류 거부·계측', T.G("recordService('pirate')") === false && T.G('syncInvariantLog.length') === n + 1);
  check('RI-5d S.flags 에 넣지 않음', !s.flags.includes('conscripted') && !s.flags.includes('deserter'));
});
function runConscript(choiceIdx, roll) {
  const T = makeCtx(); const s = startAt(T, 'rakia', 20);
  const e = ev(T, 'conscript'); const before = { job: s.job, familia: s.familia && s.familia.id, falna: s.falnaState, flags: s.flags.slice(), rel: JSON.stringify(s.relations), items: JSON.stringify(s.items) };
  T.ctx.showEvent(e); if (roll !== undefined) T.force(roll); T.ctx.choose(e.choices[choiceIdx]); T.force(null);
  return { T, s, before };
}
test('RI-6 징집 도주 성공(실제 이벤트 경로): orario 이동·deserter, 다른 상태 불변', () => {
  const { T, s, before } = runConscript(1, 0.0);
  const H = s.residenceHistory;
  check('RI-6a 거주 orario, 이유 fled', s.residence.regionId === 'orario' && H.length === 2 && H[1].reason === 'fled' && H[1].eventId === 'conscript' && H[0].regionId === 'rakia', H);
  check('RI-6b deserter 생성, conscripted 없음', !!s.service.deserter && !s.service.conscripted && s.service.deserter.since === H[1].from);
  check('RI-6c 직업·소속·팔나·플래그·가족·아이템 불변', s.job === before.job && (s.familia && s.familia.id) === before.familia && s.falnaState === before.falna && JSON.stringify(s.flags) === JSON.stringify(before.flags) && JSON.stringify(s.relations) === before.rel && JSON.stringify(s.items) === before.items, { job: s.job, flags: s.flags });
  check('RI-6d origin rakia 유지', s.origin.id === 'rakia');
});
test('RI-7 징집 도주 실패: 거주 무변화·기록 없음', () => {
  const { s } = runConscript(1, 0.999);
  check('RI-7', s.residence.regionId === 'rakia' && s.residenceHistory.length === 1 && !s.service.deserter && !s.service.conscripted);
});
test('RI-8 징집 수락: 거주 무변화·conscripted', () => {
  const { s } = runConscript(0);
  check('RI-8', s.residence.regionId === 'rakia' && s.residenceHistory.length === 1 && !!s.service.conscripted && !s.service.deserter && s.flags.includes('soldier'));
});
test('RI-9 I-R3: residence 단독 fx 는 소속을 바꾸지 않고, dropFamilia 는 같은 fx 에 명시될 때만', () => {
  const T = makeCtx(); const s = startAt(T, 'orario', 25);
  T.G("rollFamilia('loki','initial_join')"); const fam = s.familia && s.familia.id;
  T.G("apply({ residence: 'melen', residenceReason: 'test' })");
  check('RI-9a 소속 유지', s.familia && s.familia.id === fam && s.residence.regionId === 'melen', { fam, now: s.familia && s.familia.id });
  T.G("apply({ residence: 'orario', residenceReason: 'test', dropFamilia: true })");
  check('RI-9b 명시된 dropFamilia 만 적용', s.familia === null && s.residence.regionId === 'orario' && s.residenceHistory.length === 3);
  check('RI-9c 동기화 불변식 위반 0(본 시나리오 기록 외)', T.G('syncInvariantLog').every(x => x.kind === 'stored_state_mismatch'), T.G('syncInvariantLog').map(x => x.kind));
});
test('RI-10 FAMILIA_HOME 표 정합', () => {
  const T = makeCtx(); const H = T.G('FAMILIA_HOME'), R = T.G('REGION_IDS'), fams = T.G('gachaData').familias.map(f => f.id).filter(id => id !== 'civilian');
  check('RI-10a 모든 파밀리아 등재(누락·잉여 0)', fams.every(id => id in H) && Object.keys(H).every(id => fams.includes(id)), { missing: fams.filter(id => !(id in H)), extra: Object.keys(H).filter(id => !fams.includes(id)) });
  check('RI-10b 값은 지역 id 또는 null', Object.values(H).every(v => v === null || R.includes(v)));
  check('RI-10c astraea = null(미지정)', H.astraea === null);
  check('RI-10d REGION_IDS = origins', JSON.stringify(R.slice().sort()) === JSON.stringify(T.G('gachaData').origins.map(o => o.id).sort()));
});
test('RI-11 빈 이력 배열 = 거부(false)·예외 없음·데이터 무변화·난수 0·계측 1건(ri-r1)', () => {
  const T = makeCtx(); const s = startAt(T, 'rakia', 30);
  s.residenceHistory = []; const resBefore = JSON.stringify(s.residence), calls = T.calls(), n = T.G('syncInvariantLog.length');
  let r, threw = null; try { r = T.G("moveResidence('orario', 'probe')"); } catch (e) { threw = String(e && e.message || e); }
  check('RI-11a 예외 없음', threw === null, threw);
  check('RI-11b false 반환', r === false);
  check('RI-11c 거주·이력 무변화', JSON.stringify(s.residence) === resBefore && Array.isArray(s.residenceHistory) && s.residenceHistory.length === 0);
  check('RI-11d 난수 0', T.calls() === calls);
  check('RI-11e 계측 정확히 1건 = residence_missing_state', T.G('syncInvariantLog.length') === n + 1 && T.G('syncInvariantLog[syncInvariantLog.length-1].kind') === 'residence_missing_state', T.G('syncInvariantLog.slice(-2)'));
});
out.forEach(l => console.log(l));
console.log('RESULT: ' + (failed ? 'FAIL ' + failed : 'PASS') + ' ' + (out.length - failed) + '/' + out.length);
process.exit(failed ? 1 : 0);
