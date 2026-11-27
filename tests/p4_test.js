// F1D4A P4 — F-A(던전 사건 17건 dungeonReach) · F-A2(오라리오 소재 파밀리아 입단 직후 이주 선택) · HS-1(healer_shift 위치) · 규칙 D(conscript 거주 라키아) 시험.
// 설계: D-REGION r3.16 §8.0.1·§8.5.1~§8.5.6, D-WORLD r3.16 §3.5, 사용자 결정 B1~B4(가)(2026-11-25 위임)·규칙 D(2026-11-27).
// 표기: "합성" = 시험이 상태를 직접 주입하거나 합성 사건·함수 대체를 쓴 경우. "실제 경로" = 실제 EVENTS 데이터와 실제 showEvent/chooseBody/chooseFollowup 경로.
//       이 파일의 결과는 단위 시험이며, 실제 생애 결과(3,000생애·48k)는 test_runner.js 와 48k 비교에서 따로 보고한다.
// 사용: node tests/p4_test.js — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeCtx, makeReporter, setAge, snap, GAME_ROOT } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;

const REGIONS = ['orario', 'rakia', 'melen', 'far_east', 'telskyura', 'elven_forest', 'unknown'];
const DUN17 = ['dive1', 'routine', 'minotaur', 'expedition', 'xenos', 'purple_moth', 'high_excelia', 'guild_advisor', 'encounter_goliath', 'find_grimoire',
  'daedalus_orb', 'floor_boss_upper', 'mid_floor_expedition', 'deep_floor_survey', 'floor_lord_hunt', 'legend_clash', 'supporter_route'];
const E = (T, id) => T.G('EVENTS').find(e => e.id === id);
const withRandom = (T, v, fn) => { T.G(`var __mr = Math.random; Math.random = () => ${v}`); try { return fn(); } finally { T.G('Math.random = __mr'); } };
// 합성 상태 주입: 출생지·거주지·위치를 각각 지정. 이력은 출생 1구간.
function placeAt(T, { origin, residence, location, age = 16, job } = {}) {
  T.G('startLife()'); const s = T.S(); setAge(s, age); s.hp = 100; s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''");
  if (origin) s.origin = T.G('gachaData').origins.find(o => o.id === origin);
  const res = residence || s.origin.id, loc = location || res;
  s.residence = { regionId: res, since: 0 }; s.residenceHistory = [{ seq: 1, regionId: res, from: 0, to: null, reason: 'birth', eventId: null }];
  s.location = { regionId: loc, since: 0 }; s.locationHistory = [{ seq: 1, regionId: loc, from: 0, to: null, reason: 'birth', eventId: null }];
  if (job) s.job = job;
  return s;
}
// 합성: pickFamiliaCandidate 를 대체해 지정 파밀리아를 고르게 하고, 합성 사건 __p4join 의 선택지(fx.familia 'roll' = P2 경로)를 실제 chooseBody 로 처리한다.
function joinVia(T, famId, extraFx = {}) {
  T.G(`if (!EVENTS.some(e => e.id === '__p4join')) EVENTS.push({ id: '__p4join', w: 0, cond: { age: [999, 999] }, text: '합성', choices: [] })`);
  T.G(`var __p4pick = pickFamiliaCandidate; pickFamiliaCandidate = () => gachaData.familias.find(f => f.id === ${JSON.stringify(famId)})`);
  try {
    T.G(`S.currentEventId = '__p4join'; $('choices').innerHTML = ''`);
    T.G(`chooseBody({ label: '합성', text: '합성 입단', fx: Object.assign({ familia: 'roll' }, ${JSON.stringify(extraFx)}) })`);
  } finally { T.G('pickFamiliaCandidate = __p4pick'); }
}
const labels = T => T.buttons().map(b => (b.dataset && b.dataset.followup) + ':' + b.textContent);
const histLens = s => [s.residenceHistory.length, s.locationHistory.length];
const other = s => JSON.stringify([s.origin.id, s.job, s.jobSince, s.familia && s.familia.id, s.familiaHistory, s.falnaState, s.falnaHolder, s.falnaHistory, s.flags, s.employer, s.relations, s.partnerId, s.level, s.abil, s.application]);

// ── FA-T2 / HS-1 / 규칙 D: 정적 데이터 ───────────────────────────────────────────────
test('FA-T2 정적: 던전 17건 dungeonReach === true, 17건에 locationIn 없음, 17건 밖 dungeonReach 없음, locationIn orario 는 승인 사건만', () => {
  const T = makeCtx(); const A = T.G('EVENT_AREA'); const EV = T.G('EVENTS');
  const dun = Object.keys(A).filter(id => A[id][0] === 'dungeon');
  check('FA-T2a EVENT_AREA dungeon = 설계 17건(순서 무관)', dun.length === 17 && DUN17.every(id => dun.includes(id)), dun);
  check('FA-T2b 17건 모두 cond.dungeonReach === true(own)', DUN17.every(id => { const c = E(T, id).cond; return Object.prototype.hasOwnProperty.call(c, 'dungeonReach') && c.dungeonReach === true; }));
  check('FA-T2c 17건 중 locationIn 0건', DUN17.every(id => !('locationIn' in E(T, id).cond)));
  check('FA-T2d 17건 밖 사건 조건·선택지 조건에 dungeonReach 0건', EV.filter(e => !DUN17.includes(e.id)).every(e => !('dungeonReach' in (e.cond || {})) && (e.choices || []).every(ch => !ch.cond || !('dungeonReach' in ch.cond))));
  const withO1 = EV.filter(e => e.cond && Array.isArray(e.cond.locationIn) && e.cond.locationIn.includes('orario')).map(e => e.id).sort();
  check('FA-T2e locationIn:[orario] 사건 = 승인 목록(healer_shift HS-1, hero_sacrifice F-D, clash·festival P3 §3.3)', JSON.stringify(withO1) === JSON.stringify(['clash', 'festival', 'healer_shift', 'hero_sacrifice']), withO1);
  check('HS-1 healer_shift 조건 = {age,job,locationIn:[orario]}', JSON.stringify(E(T, 'healer_shift').cond) === '{"age":[18,80],"job":["healer"],"locationIn":["orario"]}');
  check('RD-1 conscript 조건 = 출생 rakia + 거주 rakia(규칙 D)', JSON.stringify(E(T, 'conscript').cond) === '{"cage":[17,28],"origin":["rakia"],"residenceIn":["rakia"]}');
  check('FA-T2f MATCH_KEYS 에 dungeonReach, CHOICE_COND_KEYS 에는 없음', T.G('MATCH_KEYS').includes('dungeonReach') && !T.G('CHOICE_COND_KEYS').includes('dungeonReach'));
});

// ── FA-T1: O1 분기는 현재 위치만 ─────────────────────────────────────────────────────
test('FA-T1 dungeonReach O1: 현재 위치만 본다(거주지·출생지 무관, 비밀 접근 없음)', () => {
  for (const o of ['orario', 'rakia']) for (const r of ['orario', 'melen']) for (const l of REGIONS) {
    const T = makeCtx(); placeAt(T, { origin: o, residence: r, location: l });
    const got = T.G("DUNGEON17 = " + JSON.stringify(DUN17) + ".map(id => match({ dungeonReach: true }, EVENTS.find(e => e.id === id)))");
    check(`FA-T1 출생 ${o} · 거주 ${r} · 위치 ${l} → ${l === 'orario'}`, got.every(x => x === (l === 'orario')), got);
  }
  const T = makeCtx(); placeAt(T, { location: 'orario' }); T.G('S.location = null');
  check('FA-T1z 위치 필드 null → 거짓(fail-closed)', T.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))") === false);
});

// ── DR-T6 / DR-T7: 값 형식·사건 객체 없는 호출 ────────────────────────────────────────
test('DR-T6 dungeonReach 값 형식: true 만 인정', () => {
  const T = makeCtx(); placeAt(T, { location: 'orario' });
  for (const v of ["'true'", '1', 'false', 'null', '{}', 'undefined', '[]']) check('DR-T6 dungeonReach=' + v + ' → 거짓(위치 orario)', T.G(`match({ dungeonReach: ${v} }, EVENTS.find(e => e.id === 'dive1'))`) === false);
  check('DR-T6t dungeonReach=true → 참(위치 orario)', T.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))") === true);
  check('DR-T6p 상속 키는 판정하지 않음(own-key 규칙)', T.G("match(Object.create({ dungeonReach: 'x' }), EVENTS.find(e => e.id === 'dive1'))") === true);
});

// 합성: 유효 비밀 접근 객체와 세계 상태(S.world 는 미구현 모델 — 시험 전용 주입).
const VALID_ACCESS = "({ via: 'secret_route', routeId: 'melen_lake', grantedAge: 16, cyclesLeft: 2, scope: [{ eventId: 'dive1', minHp: 61 }, { eventId: 'routine', minHp: 21 }, { eventId: 'purple_moth', minHp: 31 }], inUse: null })";
const OPEN_WORLD = "({ routes: { melen_lake: { condition: 'open' } } })";
function secretCtx(opts = {}) { const T = makeCtx(opts); placeAt(T, { origin: 'melen', location: 'melen' }); T.G('S.world = ' + OPEN_WORLD + '; S.dungeonAccess = ' + VALID_ACCESS); return T; }
const reach17 = T => T.G(JSON.stringify(DUN17) + ".map(id => match({ dungeonReach: true }, EVENTS.find(e => e.id === id)))");

test('DR-T7 사건 객체 없는 호출: O1 은 판정, 비밀 분기는 거짓', () => {
  const T = makeCtx(); placeAt(T, { location: 'orario' });
  check('DR-T7a 위치 orario · match(c) 인자 1개 → 참', T.G('match({ dungeonReach: true })') === true);
  const U = secretCtx();
  check('DR-T7b 위치 melen · 유효 접근(합성) · 인자 1개 → 거짓', U.G('match({ dungeonReach: true })') === false);
});
test('DR-T1 통로 sealed/destroyed 여도 O1 은 그대로(합성 세계 상태)', () => {
  for (const c of ['sealed', 'destroyed']) {
    const T = makeCtx(); placeAt(T, { location: 'orario' }); T.G(`S.world = { routes: { melen_lake: { condition: '${c}' } } }`);
    check('DR-T1 ' + c + ' · 위치 orario → 17건 모두 참', reach17(T).every(x => x === true));
  }
});
test('DR-T2 위치 melen + 유효 접근(합성) → scope 3건만 참, 14건 거짓. 판정은 S·난수 불변', () => {
  const T = secretCtx(); const b = snap(T.S()), c0 = T.calls(); const got = reach17(T);
  check('DR-T2a 3건만 참', DUN17.every((id, i) => got[i] === ['dive1', 'routine', 'purple_moth'].includes(id)), got);
  check('DR-T2b 판정 중 S 불변·난수 0·진단 0', snap(T.S()) === b && T.calls() === c0 && T.G('dungeonAccessDiagLog.length') === 0);
  T.G('S.hp = 60'); check('DR-T2c hp 60 → dive1(61) 거짓 · routine(21) 참(상수 최소 hp)', T.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))") === false && T.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'routine'))") === true);
  const U = makeCtx(); placeAt(U, { origin: 'melen', location: 'melen' });
  check('DR-T2d 실제 생애 상태(dungeonAccess null, S.world 없음) → 17건 모두 거짓', U.G('S.dungeonAccess') === null && U.G('S.world') === undefined && reach17(U).every(x => x === false));
});
test('DR-T3 오염 접근 객체 → 거짓 · 진단 · 객체 불변', () => {
  const cases = [
    ['scope expedition minHp -1', "a.scope = [{ eventId: 'expedition', minHp: -1 }]"],
    ['minHp 상수와 다름(0)', "a.scope[0].minHp = 0"], ['minHp 음수', "a.scope[0].minHp = -61"], ['minHp NaN', "a.scope[0].minHp = NaN"],
    ['minHp Infinity', "a.scope[0].minHp = Infinity"], ['minHp 문자열', "a.scope[0].minHp = '61'"],
    ['eventId 중복', "a.scope = [{ eventId: 'dive1', minHp: 61 }, { eventId: 'dive1', minHp: 61 }]"],
    ['항목 여분 키', "a.scope[0].bonus = 1"], ['항목 배열', "a.scope[0] = ['dive1', 61]"], ['항목 null', "a.scope[0] = null"],
    ['cyclesLeft 0', 'a.cyclesLeft = 0'], ['cyclesLeft 3', 'a.cyclesLeft = 3'], ['cyclesLeft 1.5', 'a.cyclesLeft = 1.5'], ['cyclesLeft NaN', 'a.cyclesLeft = NaN'], ['cyclesLeft 문자열', "a.cyclesLeft = '2'"],
    ['routeId knossos', "a.routeId = 'knossos'"], ['모르는 경로', "a.routeId = 'x'"], ['via 다름', "a.via = 'guild'"],
    ['grantedAge > age', 'a.grantedAge = 99'], ['grantedAge 정수 아님', 'a.grantedAge = 1.5'], ['grantedAge -1', 'a.grantedAge = -1'],
    ['scope 빈 배열', 'a.scope = []'], ['scope 배열 아님', "a.scope = { 0: { eventId: 'dive1', minHp: 61 }, length: 1 }"], ['scope 4건', "a.scope = a.scope.concat([{ eventId: 'dive1', minHp: 61 }])"],
    ['통로 sealed', "S.world.routes.melen_lake.condition = 'sealed'"], ['통로 destroyed', "S.world.routes.melen_lake.condition = 'destroyed'"], ['세계 상태 없음', 'delete S.world'],
    ['inUse routine(판정 dive1)', "a.inUse = 'routine'"], ['inUse 범위 밖', "a.inUse = 'expedition'"], ['inUse 숫자', 'a.inUse = 1'], ['inUse 객체', 'a.inUse = {}'],
    ['항목 eventId toString', "a.scope[0] = { eventId: 'toString', minHp: 61 }"], ['항목 eventId __proto__', "a.scope[0] = JSON.parse('{\"eventId\":\"__proto__\",\"minHp\":61}')"],
    ['여분 바깥 키', 'a.bonus = true'], ['핵심 필드 getter', "Object.defineProperty(a, 'cyclesLeft', { get() { globalThis.__getterHit = (globalThis.__getterHit || 0) + 1; return 2; }, enumerable: true })"],
    ['항목 getter', "Object.defineProperty(a.scope[0], 'minHp', { get() { globalThis.__getterHit = (globalThis.__getterHit || 0) + 1; return 61; }, enumerable: true })"],
    ['scope 만 상속', "{ const sc = a.scope; delete a.scope; Object.setPrototypeOf(a, { scope: sc }); }"],
    ['클래스 인스턴스', "S.dungeonAccess = Object.assign(new (class X {})(), a)"],
  ];
  for (const [name, mut] of cases) {
    const T = secretCtx(); T.G(`{ const a = S.dungeonAccess; ${mut} }`); const b = snap(T.S()); T.G('globalThis.__getterHit = 0');
    const r = T.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))"); const hits = T.G('globalThis.__getterHit');   // snap 은 getter 를 부르므로 판정 직후에 센다
    check('DR-T3 ' + name + ' → 거짓·진단·S 불변·getter 호출 0', r === false && T.G('dungeonAccessDiagLog.length') >= 1 && snap(T.S()) === b && hits === 0, { r, hits, diag: T.G('dungeonAccessDiagLog.slice(-1)') });
  }
  for (const [name, v] of [['원시값', '5'], ['배열', '[]'], ['상속 필드만', 'Object.create(' + VALID_ACCESS + ')']]) {
    const T = secretCtx(); T.G('S.dungeonAccess = ' + v);
    check('DR-T3 접근 객체 대신 ' + name + ' → 거짓', T.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))") === false);
  }
  const N = secretCtx(); N.G('S.dungeonAccess = Object.assign(Object.create(null), ' + VALID_ACCESS + ')');
  check('DR-T3n Object.create(null) + 자기 데이터 속성 6개 → 참(기준 허용)', N.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))") === true);
  const P = secretCtx(); P.G("S.dungeonAccess.inUse = 'dive1'");
  check('DR-T3u inUse dive1 · 판정 dive1 → 참', P.G("match({ dungeonReach: true }, EVENTS.find(e => e.id === 'dive1'))") === true);
});
test('DR-T4 변이: match 의 dungeonReach 판정을 지우면 DR-T2 의 14건이 후보가 된다(검출)', () => {
  const line = "    if (Object.prototype.hasOwnProperty.call(c, 'dungeonReach')) { if (c.dungeonReach !== true) return false; if (!dungeonReach(event)) return false; }\n";
  const T = makeCtx({ patch: [['script.js', line, '']] }); placeAt(T, { origin: 'melen', location: 'melen' }); T.G('S.world = ' + OPEN_WORLD + '; S.dungeonAccess = ' + VALID_ACCESS);
  const got = reach17(T); check('DR-T4 변이 사본에서 17건 모두 참(= DR-T2a 실패로 검출됨)', got.every(x => x === true), got);
});

// ── FA2-T0: 입단 성공 지점 전수(정적) ─────────────────────────────────────────────────
test('FA2-T0 정적: S.familia 대입·입단 성공 지점과 noteFamiliaJoined 호출', () => {
  const src = fs.readFileSync(path.join(GAME_ROOT, 'script.js'), 'utf8');
  const assigns = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /S\.familia\s*=[^=]/.test(l));
  const kinds = assigns.map(([, l]) => /S\.familia = null/.test(l) ? 'null' : /S\.familia = cand;/.test(l) ? 'cand' : /S\.familia = fam;/.test(l) ? 'fam' : 'other');
  check('FA2-T0a S.familia 대입 = null 대입(탈퇴·송환) + rollFamiliaBody 2(무효 예외·성공) + completeConversion 1', kinds.filter(k => k === 'cand').length === 2 && kinds.filter(k => k === 'fam').length === 1 && kinds.filter(k => k === 'other').length === 0, assigns.map(a => a[0]));
  const calls = (src.match(/noteFamiliaJoined\(/g) || []).length;
  check('FA2-T0b noteFamiliaJoined: 정의 1 + 호출 2(rollFamiliaBody 끝·completeConversion 끝)', calls === 3);
  const T = makeCtx(); const body = T.G('rollFamiliaBody.toString()'), cc = T.G('completeConversion.toString()');
  check('FA2-T0c rollFamiliaBody 마지막 문장이 noteFamiliaJoined', /checkFalna\(\);\s*noteFamiliaJoined\(S\.familia\.id[^\n]*\n\}$/.test(body));
  check('FA2-T0d completeConversion 성공 return 직전 noteFamiliaJoined', /noteFamiliaJoined\(fam\.id[^\n]*\n\s*return true;\s*\}$/.test(cc));
  check('FA2-T0e 신생아 대조군은 newborn_control 로 호출되고 함수에서 제외', /rollFamilia\(pf\.id, 'newborn_control'\)/.test(src) && /if \(path === 'newborn_control'\) return false;/.test(T.G('noteFamiliaJoined.toString()')));
});

// ── FA2-T1~T4, T6, T7 (P2 경로: 합성 사건 + 실제 chooseBody/chooseFollowup) ───────────
for (const [id, res, loc, wantR, wantL] of [['FA2-T1', 'rakia', 'rakia', 1, 1], ['FA2-T2', 'melen', 'orario', 1, 0], ['FA2-T3', 'orario', 'melen', 0, 1]]) {
  test(id + ` 거주 ${res} · 위치 ${loc} + loki 입단 + 이주 선택`, () => {
    const T = makeCtx(); const s = placeAt(T, { origin: res, residence: res, location: loc }); joinVia(T, 'loki');
    check(id + 'a 입단 성공·이주 후속 선택 표시(awaiting_choice)·제안 표시 소비', s.familia && s.familia.id === 'loki' && s.pendingFollowup && s.pendingFollowup.kind === 'relocate' && s.pendingFollowup.phase === 'awaiting_choice' && s.pendingRelocationOffer === null, s.pendingFollowup);
    check(id + 'b 선택지 2개(문구 B2 가)', JSON.stringify(labels(T)) === JSON.stringify(['relocate:오라리오로 이주한다', 'stay:지금 지역에 머문다']), labels(T));
    check(id + 'c 프롬프트 문구', T.G("$('log').kids.slice(-1)[0].html") === '로키 파밀리아의 본거지는 오라리오에 있다. 거처를 옮길까?' || /의 본거지는 오라리오에 있다\. 거처를 옮길까\?$/.test(T.G("$('log').kids.slice(-1)[0].html")), T.G("$('log').kids.slice(-1)[0].html"));
    const h0 = histLens(s), o0 = other(s), c0 = T.calls();
    T.buttons()[0].click();
    check(id + 'd 거주·위치 모두 orario', s.residence.regionId === 'orario' && s.location.regionId === 'orario');
    check(id + `e 이력 증가 거주 +${wantR} · 위치 +${wantL}(필요한 쪽만, 이유 relocation)`, s.residenceHistory.length - h0[0] === wantR && s.locationHistory.length - h0[1] === wantL
      && (!wantR || s.residenceHistory.slice(-1)[0].reason === 'relocation') && (!wantL || s.locationHistory.slice(-1)[0].reason === 'relocation'), [s.residenceHistory, s.locationHistory]);
    check(id + 'f FA2-T7 origin·직업·소속·팔나·고용처·가족·연애 불변 · 수동 선택 난수 0', other(s) === o0 && T.calls() === c0);
    check(id + "g 보류 정리·'다음 해로' 1개", s.pendingFollowup === null && s.currentEventId === null && T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로');
  });
}
test('FA2-T4 거주·위치 모두 orario → 후속 선택 생성 0', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'rakia', residence: 'orario', location: 'orario' }); joinVia(T, 'loki');
  check('FA2-T4 입단 성공 · 보류 0 · 제안 0 · 다음 해로', s.familia.id === 'loki' && s.pendingFollowup === null && s.pendingRelocationOffer === null && T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로');
});
test('FA2-T4b 소재지가 orario 가 아닌 파밀리아(ares·kali·astraea) → 후속 선택 0', () => {
  for (const f of ['ares', 'kali', 'astraea']) { const T = makeCtx(); const s = placeAt(T, { origin: 'melen' }); joinVia(T, f);
    check('FA2-T4b ' + f, s.familia.id === f && s.pendingFollowup === null && s.pendingRelocationOffer === null); }
});
test('FA2-T6 머묾 선택: 상태 전부 불변(제안 정리 외)', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'rakia' }); joinVia(T, 'hestia');
  const before = snap(s, ['pendingFollowup', 'currentEventId']), c0 = T.calls();
  T.buttons()[1].click();
  check('FA2-T6 stay → S 불변(보류·문맥 필드 제외)·난수 0·보류 정리', snap(s, ['pendingFollowup', 'currentEventId']) === before && T.calls() === c0 && s.pendingFollowup === null);
});

// ── FA2-T5: 입단 실패 → 이주 선택 0 ───────────────────────────────────────────────────
test('FA2-T5 입단 실패(rollModeAllowed 거부·실제 join_hard 거절) → 제안 0', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'melen' }); joinVia(T, 'loki'); T.buttons()[1].click();
  const r = T.G("rollFamilia(undefined, 'initial_join')");
  check('FA2-T5a 이미 소속 상태에서 initial_join 거부 → false · 제안 0', r === false && s.pendingRelocationOffer === null);
  let rejected = 0, offered = 0;
  for (let seed = 1; seed <= 60 && rejected < 3; seed++) {
    const U = makeCtx({ seed }); const u = placeAt(U, { origin: 'melen', age: 18 });
    U.G("showEvent(EVENTS.find(e => e.id === 'join_hard'))"); const b = U.buttons().find(x => x.textContent && x.onclick); if (!b) continue;
    withRandom(U, 0.999, () => b.click());
    if (!u.familia) { rejected++; if (u.pendingRelocationOffer !== null || (u.pendingFollowup && u.pendingFollowup.kind === 'relocate')) offered++; }
  }
  check('FA2-T5b 실제 join_hard 거절(난수 0.999 강제) 관측 ' + rejected + '건(1건 이상 요구) · 이주 제안 0', rejected >= 1 && offered === 0, { rejected, offered });
});

// ── FA2-T8: P1·P2·P3 경로 모두 제안, P4 는 0 ─────────────────────────────────────────
test('FA2-T8 P1(실제 join 사건 수락) · P2(fx.familia) · P3(실제 god_gone 재수여) → 제안, P4(newborn_control) → 0', () => {
  // P1: 실제 join 사건, 난수 0 강제로 수락. 위치·거주는 합성 melen. 수락된 파밀리아의 소재지에 따라 기대값을 정한다.
  // 난수는 고정값 v 로 강제(후보 선택·심사 모두 v). v 를 바꿔 가며 오라리오 소재 파밀리아 수락 사례를 찾는다(실제 사건 데이터·실제 함수, 강제 난수만 합성).
  let p1 = null; const tried1 = [];
  for (let k = 0; k < 100 && !(p1 && p1.home === 'orario'); k++) {
    const v = k / 100, T = makeCtx(); const s = placeAt(T, { origin: 'melen', age: 16 }); s.race = T.G('gachaData').races.find(r => r.id === 'elf') || s.race;
    T.G("showEvent(EVENTS.find(e => e.id === 'join'))"); const b = T.buttons()[0]; if (!b) continue;
    withRandom(T, v, () => b.click()); tried1.push(s.familia ? s.familia.id : '-');
    if (s.familia) p1 = { v, fam: s.familia.id, home: T.G('FAMILIA_HOME')[s.familia.id], kind: s.pendingFollowup && s.pendingFollowup.kind, path: s.pendingFollowup && s.pendingFollowup.context.path, src: s.pendingFollowup && s.pendingFollowup.sourceEventId };
  }
  check('FA2-T8 P1 실제 join 수락(오라리오 소재 ' + (p1 && p1.fam) + ') → relocate(path initial_join, 출처 join)', p1 && p1.home === 'orario' && p1.kind === 'relocate' && p1.path === 'initial_join' && p1.src === 'join', { p1, tried1 });
  const T2 = makeCtx(); const s2 = placeAt(T2, { origin: 'melen' }); joinVia(T2, 'ganesha');
  check('FA2-T8 P2 fx.familia → relocate', s2.pendingFollowup && s2.pendingFollowup.kind === 'relocate' && s2.pendingFollowup.context.familiaId === 'ganesha');
  // P3: 모험자·팔나 active 상태(합성 준비: 소속·팔나 취득을 실제 함수로) → 실제 god_gone 사건 [0] 성공(난수 0 강제) → completeConversion → 제안
  let p3 = null;
  for (let k = 0; k < 100 && !(p3 && p3.home3 === 'orario'); k++) {
    const T3 = makeCtx(); const s3 = placeAt(T3, { origin: 'melen', residence: 'melen', location: 'melen', age: 20 });
    T3.G("rollFamilia('ares', 'initial_join'); S.pendingRelocationOffer = null; S.falnaAt = S.age; checkFalna(); setJob('adventurer')");
    const ok3 = s3.falnaState === 'active';
    T3.G("S.currentEventId = null; $('choices').innerHTML = ''; showEvent(EVENTS.find(e => e.id === 'god_gone'))");
    withRandom(T3, k / 100, () => T3.buttons()[0].click());
    const fam3 = s3.familia && s3.familia.id; if (!fam3 || fam3 === 'ares') continue;
    p3 = { ok3, fam3, home3: T3.G('FAMILIA_HOME')[fam3], kind: s3.pendingFollowup && s3.pendingFollowup.kind, path: s3.pendingFollowup && s3.pendingFollowup.context.path };
  }
  check('FA2-T8 P3 실제 god_gone 재수여(' + (p3 && p3.fam3) + ', 오라리오 소재) → relocate(path god_return_regrant)', p3 && p3.ok3 && p3.home3 === 'orario' && p3.kind === 'relocate' && p3.path === 'god_return_regrant', p3);
  const T4 = makeCtx(); placeAt(T4, { origin: 'melen' }); const r4 = T4.G("noteFamiliaJoined('loki', 'newborn_control')");
  check('FA2-T8 P4 newborn_control → 제안 0', r4 === false && T4.G('S.pendingRelocationOffer') === null);
});

// ── FA2-T9: 자동 진행(게임 R2-relocate · 드라이버 HARNESS-relocate) ───────────────────
test('FA2-T9 자동 진행', () => {
  // (a)(c) 게임 자동 진행: relocate 화면 → 타이머 정확히 1개, 실행 시 난수 1회, 머묾 타이머 0
  for (const [v, want] of [[0, 'relocate'], [0.999, 'stay']]) {
    const T = makeCtx({ timers: 'queue' }); const s = placeAt(T, { origin: 'melen' }); T.el('auto').checked = true; T.timers.length = 0;
    joinVia(T, 'loki');
    const n = T.timers.length, ms = n ? T.timers[0].ms : null;
    T.G(`var __mr2 = Math.random; var __rc = 0; Math.random = () => { __rc++; return ${v}; }`);
    try { T.runTimer(0); } finally { T.G('Math.random = __mr2'); }
    const rc = T.G('__rc');
    check(`FA2-T9a 게임 자동: 타이머 1개(800ms) · R2-relocate 난수 ${rc}회 · 난수 ${v} → ${want}`, n === 1 && ms === 800 && rc === 1 && (want === 'relocate' ? s.location.regionId === 'orario' : s.location.regionId === 'melen') && s.pendingFollowup === null, { n, ms, rc, loc: s.location.regionId });
    check('FA2-T9a2 선택 뒤 다음 해로 자동 타이머 1개(600ms)', T.timers.length === 1 && T.timers[0].ms === 600, T.timers.map(t => t.ms));
  }
  // (d) 다른 후속 종류: 머묾 타이머 1개 · 실행 난수 0
  { const T = makeCtx({ timers: 'queue' }); const s = placeAt(T, { origin: 'melen', age: 18 }); T.el('auto').checked = true; T.timers.length = 0;
    T.G("S.currentEventId = 'join_hard'; createFollowup('recruit_after_fail', { route: 'persistence', reason: 'rejected' }); S.pendingFollowup.phase = 'awaiting_choice'; renderFollowup()");
    const n = T.timers.length, c0 = T.calls(); T.runTimer(0);
    check('FA2-T9d 기존 후속 종류: 타이머 1개 · stay 실행 · 난수 0', n === 1 && T.calls() === c0 && s.pendingFollowup === null, { n }); }
  // (e) 수동: 자동 꺼짐 → 타이머 0, 클릭 난수 0
  { const T = makeCtx({ timers: 'queue' }); placeAt(T, { origin: 'melen' }); T.el('auto').checked = false; T.timers.length = 0; joinVia(T, 'loki');
    const c0 = T.calls(); T.buttons()[0].click(); check('FA2-T9e 수동: 타이머 0 · 난수 0', T.timers.filter(t => t.ms === 800).length === 0 && T.calls() === c0); }
  // (b)(c) 공통 드라이버: 같은 소스를 독립 vm 에서 평가
  const dsrc = fs.readFileSync(path.join(GAME_ROOT, 'tests/lib/driver_core.js'), 'utf8');
  const mk = v => { let rc = 0; const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => { rc++; return v; } }) }); vm.runInContext(dsrc, ctx); return { choose: ctx.driverChoose, rc: () => rc }; };
  const btn = id => ({ dataset: { followup: id }, onclick() {} });
  for (const [v, want] of [[0, 'relocate'], [0.999, 'stay']]) {
    const D = mk(v); const r = D.choose([btn('relocate'), btn('stay')], { kind: 'relocate' });
    check(`FA2-T9b 드라이버 relocate: HARNESS-relocate 1회 · 난수 ${v} → ${want}`, r.kind === 'followup_relocate' && r.button.dataset.followup === want && D.rc() === 1, { kind: r.kind, rc: D.rc() });
  }
  { const D = mk(0); const r = D.choose([btn('supporter'), btn('stay')], { kind: 'recruit_after_fail' });
    check('FA2-T9d 드라이버 기존 종류: stay 고정 · 난수 0', r.kind === 'followup_stay' && r.button.dataset.followup === 'stay' && D.rc() === 0); }
  { const D = mk(0); const r = D.choose([btn('stay')], { kind: 'relocate' }); check('FA2-T9f 드라이버 relocate 선택지 누락 → error', r.kind === 'error'); }
});

// ── FA2-RB: relocate resolve 예외 시 거주·위치·이력 원자 롤백 ─────────────────────────
test('FA2-RB relocate 처리 중 예외(합성 주입) → 거주·위치·이력(마지막 항목 to 포함) 스냅숏 시점으로 복원', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'rakia' }); joinVia(T, 'loki');
  const before = JSON.stringify([s.residence, s.location, s.residenceHistory, s.locationHistory]), rref = s.residence, lref = s.location, rh = s.residenceHistory;
  T.G("var __orig = FOLLOWUP_KINDS.relocate.resolve; FOLLOWUP_KINDS.relocate.resolve = function (S, id, p) { __orig.call(this, S, id, p); throw new Error('p4 injected'); }");
  let err = null; try { T.buttons()[0].click(); } catch (e) { err = String(e.message); }
  check('FA2-RB a 원래 예외 재전파 · 진행 정지', err === 'p4 injected' && T.G('progressHalted') === true, err);
  check('FA2-RB b 거주·위치·두 이력 깊은 동등(마지막 항목 to=null 복원)', JSON.stringify([s.residence, s.location, s.residenceHistory, s.locationHistory]) === before, [s.residenceHistory, s.locationHistory]);
  check('FA2-RB c 참조 복원(residence·location 원래 객체, 이력 배열 원래 참조)', s.residence === rref && s.location === lref && s.residenceHistory === rh);
  check('FA2-RB d 롤백 보고 ok', T.G('lastRollbackReport && lastRollbackReport.rollback') === 'ok', T.G('lastRollbackReport'));
});

// ── FA2-D1~D5: 생애 종료 정리 ─────────────────────────────────────────────────────────
test('FA2-D1a fx.die 경로: 입단 제안이 남은 같은 선택에서 사망 → relocate 생성 0 · endLife 정상 · 제안 null', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'melen' }); joinVia(T, 'loki', { die: true });
  check('FA2-D1a', s.cause && s.familia.id === 'loki' && s.pendingFollowup === null && s.pendingRelocationOffer === null && T.G("followupDiagLog.filter(x => x.event === 'relocation_offer_conflict').length") === 0, { cause: s.cause });
});
test('FA2-D1b hp ≤ 0 경로 → 같은 확인', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'melen' }); joinVia(T, 'loki', { hp: -1000 });
  check('FA2-D1b', s.cause && s.pendingFollowup === null && s.pendingRelocationOffer === null, { cause: s.cause, hp: s.hp });
});
test('FA2-D2 endLife 정상 종료 뒤 제안·접근 null / D2b 가드에 막히면 정리 보장 대상 아님(값 기록)', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'melen' }); T.G("S.pendingRelocationOffer = { familiaId: 'loki', path: 'initial_join', at: 16 }; S.dungeonAccess = " + VALID_ACCESS + "; S.cause = '합성'; endLife()");
  check('FA2-D2 정상 종료 → null · null', T.S().pendingRelocationOffer === null && T.S().dungeonAccess === null);
  const U = makeCtx(); placeAt(U, { origin: 'melen' }); U.G("S.pendingRelocationOffer = { familiaId: 'loki', path: 'initial_join', at: 16 }; S.pendingFollowup = { seq: 1, kind: 'relocate', phase: 'awaiting_choice', sourceEventId: null, context: {} }; endLife()");
  const d = U.G("followupDiagLog.filter(x => x.event === 'endlife_blocked').length"), v = U.G('JSON.stringify(S.pendingRelocationOffer)');
  check('FA2-D2b endlife_blocked · 생애 미종료 · 제안 값 그대로(기록: ' + v + ')', d === 1 && !U.S().cause && v === '{"familiaId":"loki","path":"initial_join","at":16}');
});
test('FA2-D3 다음 startLife 뒤에도 null · 이전 객체와 참조 공유 없음', () => {
  const T = makeCtx(); placeAt(T, { origin: 'melen' }); T.G("S.pendingRelocationOffer = { familiaId: 'loki', path: 'x', at: 1 }; var __prevS = S; S.cause = '합성'; endLife(); startLife()");
  check('FA2-D3', T.G('S !== __prevS && S.pendingRelocationOffer === null && S.dungeonAccess === null && Object.prototype.hasOwnProperty.call(S, "pendingRelocationOffer")') === true);
});
test('FA2-D4 정리 문장 직전·직후 비교: 가족·파밀리아·직업·팔나·연애·거주·위치 불변(관측 지점 = 시험용 패치)', () => {
  const stmt = '    S.pendingRelocationOffer = null; S.dungeonAccess = null;\n    // v1.7.8-2i(⑤)';
  const obs = "JSON.stringify([S.familia, S.familiaHistory, S.job, S.falnaState, S.falnaHolder, S.falnaHistory, S.flags, S.relations, S.partnerId, S.residence, S.residenceHistory, S.location, S.locationHistory])";
  const T = makeCtx({ patch: [['script.js', stmt, `    globalThis.__p4a = ${obs};\n    S.pendingRelocationOffer = null; S.dungeonAccess = null;\n    globalThis.__p4b = ${obs};\n    // v1.7.8-2i(⑤)`]] });
  placeAt(T, { origin: 'melen' }); joinVia(T, 'loki', { die: true });
  check('FA2-D4 기준(입단 효과 포함)과 정리 직후 동일', T.G('typeof __p4a') === 'string' && T.G('__p4a === __p4b') === true && T.G('__p4a').includes('"loki"'));
});
test('FA2-D5 변이: endLife 정리 문장을 지우면 FA2-D2 가 실패한다(검출)', () => {
  const T = makeCtx({ patch: [['script.js', '    S.pendingRelocationOffer = null; S.dungeonAccess = null;\n    // v1.7.8-2i(⑤)', '    // v1.7.8-2i(⑤)']] });
  placeAt(T, { origin: 'melen' }); T.G("S.pendingRelocationOffer = { familiaId: 'loki', path: 'initial_join', at: 16 }; S.cause = '합성'; endLife()");
  check('FA2-D5 변이 사본에서 제안이 남음(= FA2-D2 실패로 검출됨)', T.S().pendingRelocationOffer !== null);
});

// ── 충돌 규칙: 다른 후속 선택 보류 중 → 진단 후 제안 버림 ─────────────────────────────
test('FA2-C 다른 후속 선택이 이미 보류 중이면 relocation_offer_conflict · 제안 버림 · 기존 보류 유지(합성)', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'melen' });
  T.G("S.currentEventId = '__p4join'; EVENTS.push({ id: '__p4join', w: 0, cond: { age: [999, 999] }, text: '합성', choices: [] }); S.pendingRelocationOffer = { familiaId: 'loki', path: 'initial_join', at: 16 }; createFollowup('recruit_after_fail', { route: 'persistence', reason: 'rejected' })");
  T.G("chooseBody({ label: '합성', text: '합성', fx: {} })");
  check('FA2-C', s.pendingFollowup && s.pendingFollowup.kind === 'recruit_after_fail' && s.pendingRelocationOffer === null && T.G("followupDiagLog.filter(x => x.event === 'relocation_offer_conflict').length") === 1);
});

// ── FA-T3: 결합(비오라리오 출생 모험자는 이주 뒤에만 일반 던전 사건 후보) ─────────────
test('FA-T3 결합: 라키아 출생·거주 모험자(팔나 active, 합성 준비) — 이주 전 던전 17건 후보 0, 이주 뒤 후보 생김', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'rakia', age: 16 }); joinVia(T, 'loki');
  T.G("S.falnaAt = S.age; checkFalna(); setJob('adventurer')");   // 합성 준비: 팔나 취득·직업(실제 함수)
  const cand = () => T.G(JSON.stringify(DUN17) + ".filter(id => { const e = EVENTS.find(x => x.id === id); return match(e.cond, e); })");
  const pre = cand(); T.buttons()[0].click(); const post = cand();
  check('FA-T3 이주 전 0건 · 이주 뒤 1건 이상(dive1 포함)', s.falnaState === 'active' && pre.length === 0 && post.length >= 1 && post.includes('dive1'), { pre, post });
  const U = makeCtx(); const u = placeAt(U, { origin: 'rakia', age: 16 }); joinVia(U, 'loki'); U.G("S.falnaAt = S.age; checkFalna(); setJob('adventurer')"); U.buttons()[1].click();
  check('FA-T3b 머묾 선택 → 던전 후보 0 유지', U.G(JSON.stringify(DUN17) + ".filter(id => { const e = EVENTS.find(x => x.id === id); return match(e.cond, e); }).length") === 0 && u.location.regionId === 'rakia');
});

// ── 규칙 D: conscript ─────────────────────────────────────────────────────────────
test('RD-2 conscript 후보: 라키아 출생이라도 거주가 라키아일 때만', () => {
  for (const res of REGIONS) { const T = makeCtx(); placeAt(T, { origin: 'rakia', residence: res, age: 20 });
    check('RD-2 거주 ' + res + ' → ' + (res === 'rakia'), T.G("match(EVENTS.find(e => e.id === 'conscript').cond)") === (res === 'rakia')); }
  const T = makeCtx(); placeAt(T, { origin: 'melen', residence: 'rakia', age: 20 });
  check('RD-2b 라키아 거주라도 출생 melen → 거짓(출생 조건 유지)', T.G("match(EVENTS.find(e => e.id === 'conscript').cond)") === false);
});

R.finish('p4_test');
