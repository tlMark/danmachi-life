// F1D4A P2 — 공통 엔진 E-1~E-3 시험(EN-2·2b·2c(a·b·d)·3·4·5·6·8·9·10·12, E-3 위치 기록).
// 설계: F1D4A r3.20 00_INDEX §E-1·E-2·E-3·§4.2. 각 시험은 새 vm 컨텍스트에서 게임 소스를 그대로 읽어 실행한다(게임 코드에 시험 훅 없음).
// 합성 사건(EVENTS 에 넣는 시험용 사건)·합성 상태 주입은 "합성"으로 표기한다. 실제 생애 결과(lifeDigest·RNG 순서열 = EN-1)는
// p1_verify.sh 의 04_digest10_vs_F1·06_digest10_strict·40~42 cmp 로 확인한다(이 파일 밖).
// EN-2c (c)·(e)~(n)(하네스 계측 큐)는 P1 시험(rng_sites_test.js 의 큐·EN-2c(n) 시험)이 담당한다.
// 사용: node tests/engine_p2_test.js  — 실패 1건 이상이면 종료 코드 1.
const { makeCtx, makeReporter, setAge, snap } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;

// startLife 가 첫 해 사건까지 진행하므로, 시험 전에 그 사건의 버튼·표시 중 사건을 비운다(합성 상태 주입).
const life = (T, age = 20) => { T.G('startLife()'); const s = T.S(); setAge(s, age); s.hp = 100; s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''"); return s; };
const push = (T, ev) => T.G('EVENTS.push(' + JSON.stringify(ev) + ')');
const diags = (T, kind) => T.G('followupDiagLog').filter(d => d.event === kind);
const ZERO = (extra = {}) => ({ id: '__en_zero', w: 1e7, text: '합성: 보이는 선택지 0개', cond: {}, maxTimes: 99, cool: 0,
  choices: [{ label: '숨김 A', cond: { flags: ['__en_open'] }, text: 'a', fx: {} }, { label: '숨김 B', cond: { job: ['__nobody__'] }, text: 'b', fx: {} }], ...extra });
const wrapShow = T => T.G('var __shown = []; var __origShow = showEvent; showEvent = function (e) { __shown.push(e.id); return __origShow(e); };');

// ── E-3 위치 기록 ───────────────────────────────────────────────────────────────
test('E-3 출생: location = 출생지, 이력 1구간, 거주지와 별개 객체', () => {
  for (const seed of [1, 777, 20261104]) {
    const T = makeCtx({ seed }); T.G('startLife()'); const s = T.S();
    check('E3-1 seed ' + seed, s.location && s.location.regionId === s.origin.id && s.location.since === 0 && s.locationHistory.length === 1
      && JSON.stringify(s.locationHistory[0]) === JSON.stringify({ seq: 1, regionId: s.origin.id, from: 0, to: null, reason: 'birth', eventId: null })
      && s.location !== s.residence && s.locationHistory !== s.residenceHistory, s.location);
  }
});
test('E-3 startLife 의 난수 호출 수는 위치 필드와 무관(같은 시드 두 번 = 같은 호출 수)', () => {
  const A = makeCtx({ seed: 5 }), B = makeCtx({ seed: 5 }); A.G('startLife()'); B.G('startLife()');
  check('E3-2', A.calls() === B.calls() && snap(A.S()) === snap(B.S()));
});
test('E-3 moveLocation: 위치·이력만 변경, 거주지·출생지 불변, 난수 0', () => {
  const T = makeCtx(); const s = life(T, 23); s.currentEventId = 'evx';
  const res = JSON.stringify([s.residence, s.residenceHistory]), org = s.origin.id, c0 = T.calls(), log0 = s.logHistory.length;
  const to = T.G('REGION_IDS').find(r => r !== s.location.regionId);
  const r = T.G(`moveLocation(${JSON.stringify(to)}, 'trip')`);
  check('E3-3 반환 true·위치 변경', r === true && s.location.regionId === to && s.location.since === 23);
  check('E3-3b 이력 반열린 구간', s.locationHistory.length === 2 && s.locationHistory[0].to === 23 && JSON.stringify(s.locationHistory[1]) === JSON.stringify({ seq: 2, regionId: to, from: 23, to: null, reason: 'trip', eventId: 'evx' }));
  check('E3-3c 거주지·출생지·연표·난수 불변', JSON.stringify([s.residence, s.residenceHistory]) === res && s.origin.id === org && s.logHistory.length === log0 && T.calls() === c0);
});
test('E-3 moveLocation: 같은 지역·알 수 없는 지역·상태 없음', () => {
  const T = makeCtx(); const s = life(T); const h = JSON.stringify([s.location, s.locationHistory]), n = T.G('syncInvariantLog.length');
  check('E3-4 같은 지역 → false, 무변화', T.G(`moveLocation(${JSON.stringify(s.location.regionId)}, 'x')`) === false && JSON.stringify([s.location, s.locationHistory]) === h);
  check('E3-5 알 수 없는 지역 → false, 진단 1, 무변화', T.G("moveLocation('__nowhere__', 'x')") === false && T.G('syncInvariantLog.length') === n + 1
    && T.G('syncInvariantLog[syncInvariantLog.length - 1].kind') === 'location_unknown_region' && JSON.stringify([s.location, s.locationHistory]) === h);
  s.locationHistory = [];
  check('E3-6 이력 없음 → false, 진단 location_missing_state', T.G(`moveLocation(${JSON.stringify(T.G('REGION_IDS').find(r => r !== s.location.regionId))}, 'x')`) === false
    && T.G('syncInvariantLog[syncInvariantLog.length - 1].kind') === 'location_missing_state');
});
test('E-3 moveLocation 정지 가드', () => {
  const T = makeCtx(); const s = life(T); const h = JSON.stringify([s.location, s.locationHistory]); T.G('progressHalted = true');
  check('E3-7 정지 중 → undefined, 무변화, 진단 halted_entry', T.G("moveLocation('rakia', 'x')") === undefined && JSON.stringify([s.location, s.locationHistory]) === h
    && diags(T, 'halted_entry').some(d => d.fn === 'moveLocation'));
});
test('E-3 fx.location / fx.residence 는 서로를 바꾸지 않음(자동 동기화 금지)', () => {
  const T = makeCtx(); const s = life(T, 30); const others = T.G('REGION_IDS').filter(r => r !== s.origin.id);
  const res0 = JSON.stringify([s.residence, s.residenceHistory]);
  T.G(`apply({ location: ${JSON.stringify(others[0])}, locationReason: 'trip' })`);
  check('E3-8 fx.location → 위치만 변경(이유 기록)', s.location.regionId === others[0] && s.locationHistory[1].reason === 'trip' && JSON.stringify([s.residence, s.residenceHistory]) === res0);
  const loc1 = JSON.stringify([s.location, s.locationHistory]);
  T.G(`apply({ residence: ${JSON.stringify(others[1])} })`);
  check('E3-9 fx.residence → 거주지만 변경', s.residence.regionId === others[1] && JSON.stringify([s.location, s.locationHistory]) === loc1);
  T.G(`apply({ location: ${JSON.stringify(others[2])} })`);
  check('E3-10 fx.location 기본 이유 event', s.locationHistory[2].reason === 'event');
});
test('E-3 롤백 값 필드에 location 포함(이력 복원은 P4)', () => {
  const T = makeCtx(); check('E3-11', T.G("ROLLBACK_VALUE_FIELDS.includes('location') && ROLLBACK_VALUE_FIELDS.slice(0, 14).join(',') === 'job,jobSince,valis,hp,bond,feat,potential,excelia,level,hidden,maxLevel,power,alias,nextRelationId'"));
});

// ── E-2 조건 키 ────────────────────────────────────────────────────────────────
test('EN-4 familia 와 familiaIn 의 판정이 같음', () => {
  const T = makeCtx(); const s = life(T); let same = true, n = 0;
  for (const fam of [null, { id: 'loki', label: 'L' }, { id: 'hestia', label: 'H' }]) for (const want of [['loki'], ['hestia', 'loki'], ['ares'], []]) {
    s.familia = fam; n++;
    if (T.G(`match({ familia: ${JSON.stringify(want)} })`) !== T.G(`match({ familiaIn: ${JSON.stringify(want)} })`)) same = false;
  }
  check('EN-4 (' + n + '가지 상태·목록)', same);
});
test('EN-5 위치·거주지·출생지 독립(locationIn 은 위치만, residenceIn 은 거주지만, origin 은 출생지만)', () => {
  const T = makeCtx(); const s = life(T);
  s.origin = T.G('gachaData').origins.find(o => o.id === 'orario') || s.origin; const org = s.origin.id;
  s.residence = { regionId: 'rakia', since: 1 }; s.location = { regionId: 'melen', since: 2 };
  const m = c => T.G('match(' + JSON.stringify(c) + ')');
  check('EN-5a locationIn', m({ locationIn: ['melen'] }) === true && m({ locationIn: ['rakia'] }) === false && m({ locationIn: [org] }) === (org === 'melen'));
  check('EN-5b residenceIn', m({ residenceIn: ['rakia'] }) === true && m({ residenceIn: ['melen'] }) === false);
  check('EN-5c origin(기존 키) 은 출생지만', m({ origin: [org] }) === true && (org === 'rakia' || m({ origin: ['rakia'] }) === false));
  delete s.location; check('EN-5d 위치 필드 없음 → locationIn 거짓(fail-closed)', m({ locationIn: ['melen'] }) === false);
});
test('E-2 employerIn·hasEmployer', () => {
  const T = makeCtx(); const s = life(T); const m = c => T.G('match(' + JSON.stringify(c) + ')');
  s.employer = null;
  check('E2-1 고용처 없음', m({ hasEmployer: false }) === true && m({ hasEmployer: true }) === false && m({ employerIn: ['guild'] }) === false);
  s.employer = { id: 'guild', label: 'G', kind: 'guild', since: 20 };
  check('E2-2 고용처 guild', m({ hasEmployer: true }) === true && m({ hasEmployer: false }) === false && m({ employerIn: ['guild'] }) === true && m({ employerIn: ['hostess'] }) === false);
});
test('E-2 match 두 번째 인자: 지금은 판정에 쓰지 않음(인자 1개 호출과 같음)', () => {
  const T = makeCtx(); life(T, 25); let same = true;
  for (const e of T.G('EVENTS')) { T.G('__e = EVENTS.find(x => x.id === ' + JSON.stringify(e.id) + ')'); if (T.G('match(__e.cond)') !== T.G('match(__e.cond, __e)')) same = false; }
  check('E2-3 81개 사건 모두 같음', same && T.G('EVENTS').length === 81);
});

// ── E-1.1 choiceMatch · visibleChoices ─────────────────────────────────────────
test('EN-10 choiceMatch 의 min/max: 값이 유한수가 아니면 숨김', () => {
  const T = makeCtx(); const s = life(T);
  for (const [v, want] of [[NaN, false], [Infinity, false], [-Infinity, false], [undefined, false], ['50', false], [50, true]]) {
    s.hp = v; check('EN-10 hp=' + String(v) + ' min', T.G('choiceMatch({ min: { hp: 1 } })') === want);
    check('EN-10 hp=' + String(v) + ' max', T.G('choiceMatch({ max: { hp: 1000 } })') === want);
  }
  s.hp = NaN; check('EN-10b 사건 조건 match 는 기존 판정 유지(NaN 통과 — 현행 동작, 선택지 조건에만 규칙 추가)', T.G('match({ min: { hp: 1 } })') === true);
});
test('E-1.1 허용 키: 관계 키·목록 밖 키·아직 판정하지 않는 키는 숨김', () => {
  const T = makeCtx(); life(T);
  for (const k of ['hasPartner', 'relative', 'noRelative', '__unknown', 'atSiteOf', 'inRecruitAreaOf'])
    check('E1-1 ' + k + ' → 숨김', T.G(`choiceMatch({ ${JSON.stringify(k)}: ${k === 'hasPartner' ? 'false' : "['x']"} })`) === false);
  check('E1-2 빈 조건 → match 와 같음(보임)', T.G('choiceMatch({})') === true);
  check('E1-3 허용 키 목록 = 설계 E-1.1 표', T.G('CHOICE_COND_KEYS.join()') === 'job,age,cage,origin,race,notRace,flags,noFlags,falnaState,hasFamilia,familiaIn,familia,familiaRole,canEnterDungeon,noItem,min,max,residenceIn,locationIn,employerIn,hasEmployer,atSiteOf,inRecruitAreaOf');
});
test('EN-8 visibleChoices·choiceMatch 순수성: S 깊은 비교 동일, 난수 0, 연표 0, 진단 0', () => {
  for (const seed of [1, 777, 20261104]) {
    const T = makeCtx({ seed }); const s = life(T, 30); s.currentEventId = null;
    push(T, ZERO()); push(T, { id: '__en_mix', w: 0, text: 't', cond: {}, choices: [{ label: 'a', cond: { min: { hp: 1 }, flags: ['falna'] }, fx: {} }, { label: 'b', cond: { residenceIn: ['rakia'], locationIn: ['orario'], hasEmployer: false, familiaIn: ['loki'] }, fx: {} }, { label: 'c', fx: {} }] });
    const b = snap(s), c0 = T.calls(), d0 = T.G('followupDiagLog.length'), y0 = T.G('syncInvariantLog.length');
    T.G('EVENTS.forEach(e => visibleChoices(e))');
    check('EN-8 seed ' + seed, snap(s) === b && T.calls() === c0 && T.G('followupDiagLog.length') === d0 && T.G('syncInvariantLog.length') === y0);
  }
});
test('EN-9 데이터 정적 검사: 모든 choice.cond 키가 허용 목록 안(현재 데이터의 선택지 조건 0건)', () => {
  const T = makeCtx(); const keys = T.G('CHOICE_COND_KEYS'); const bad = [], n = { conds: 0 };
  for (const e of T.G('EVENTS')) for (const ch of e.choices || []) if (ch.cond) { n.conds++; for (const k of Object.keys(ch.cond)) if (!keys.includes(k)) bad.push(e.id + ':' + k); }
  check('EN-9 (선택지 조건 ' + n.conds + '건)', bad.length === 0, bad);
});
test('EN-12 조건 키·값 정적 검사', () => {
  const T = makeCtx(); const MK = T.G('MATCH_KEYS'); const src = T.G('match.toString()');
  check('EN-12 MATCH_KEYS 의 모든 키가 match 본문에서 c.<키> 로 판정됨', MK.every(k => src.includes('c.' + k)), MK.filter(k => !src.includes('c.' + k)));
  const strArr = v => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string');
  const range = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] <= v[1];
  const numObj = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.values(v).every(Number.isFinite);
  const SHAPE = { job: v => typeof v === 'string' || strArr(v), age: range, cage: range, min: numObj, max: numObj,
    hasFamilia: v => typeof v === 'boolean', hasPartner: v => typeof v === 'boolean', hasEmployer: v => typeof v === 'boolean', canEnterDungeon: v => v === true };
  for (const k of ['notRace', 'familia', 'familiaIn', 'residenceIn', 'locationIn', 'employerIn', 'origin', 'race', 'noItem', 'relative', 'noRelative', 'flags', 'noFlags', 'falnaState', 'familiaRole']) SHAPE[k] = strArr;
  SHAPE.atSiteOf = SHAPE.inRecruitAreaOf = v => typeof v === 'string' && v.length > 0;   // F1D4A P3(의도적 시험 변경): 조직 id 문자열 키 추가(D-INSTITUTION §3)
  check('EN-12 형식 표가 MATCH_KEYS 전체를 덮음', MK.every(k => SHAPE[k]) && Object.keys(SHAPE).length === MK.length);
  const badKey = [], badVal = []; let nEv = 0, nCh = 0;
  for (const e of T.G('EVENTS')) {
    const conds = [['event', e.cond || {}]].concat((e.choices || []).filter(ch => ch.cond).map((ch, i) => ['choice' + i, ch.cond]));
    for (const [where, c] of conds) { where === 'event' ? nEv++ : nCh++;
      for (const k of Object.keys(c)) { if (!MK.includes(k)) badKey.push(e.id + '.' + where + ':' + k); else if (!SHAPE[k](c[k])) badVal.push(e.id + '.' + where + ':' + k + '=' + JSON.stringify(c[k])); } }
  }
  check('EN-12a 모든 사건·선택지 조건 키가 match 판정 키(사건 ' + nEv + ', 선택지 ' + nCh + ')', badKey.length === 0, badKey);
  check('EN-12b 값 형식', badVal.length === 0, badVal);
  check('EN-12c dungeonReach: P2 미구현 키 — 데이터 사용 0건(설계의 17건 부착은 P4)', T.G('EVENTS').every(e => !('dungeonReach' in (e.cond || {}))) && !MK.includes('dungeonReach'));
});

// ── E-1.2 nextYear ⑩·⑫ ─────────────────────────────────────────────────────────
test('EN-2 선택지 0개 사건(합성): ⑩ 에서 제외 — 사건이 없는 빌드와 상태·난수·연표가 완전히 같음', () => {
  let allSame = true, never = true, years = 0;
  for (const seed of [1, 2, 3, 777, 20261104]) {
    const A = makeCtx({ seed }), B = makeCtx({ seed }); push(A, ZERO());
    A.G('startLife()'); B.G('startLife()');
    for (let i = 0; i < 40 && A.G('S.alive !== false') && !A.G('S.dead'); i++) {
      A.G('nextYear()'); B.G('nextYear()'); years++;
      const ab = A.buttons(), bb = B.buttons();
      if (A.G('S.currentEventId') === '__en_zero' || (A.S().eventCounts || {}).__en_zero || A.S().done.includes('__en_zero')) never = false;
      if (snap(A.S()) !== snap(B.S()) || A.calls() !== B.calls() || ab.length !== bb.length) { allSame = false; break; }
      if (!ab.length) break;
      ab[0].click(); bb[0].click();
    }
  }
  check('EN-2a 5시드 ' + years + '회 nextYear: S·난수 호출 수·버튼 수가 사건 없는 빌드와 같음', allSame);
  check('EN-2b 0개 사건은 표시·소비되지 않음(done·eventCounts·currentEventId)', never);
});
test('EN-2 이후 선택지가 보이게 되면 다시 후보가 됨(once·쿨다운 미소비)', () => {
  const T = makeCtx({ seed: 9 }); const s = life(T, 30); push(T, ZERO({ once: true })); wrapShow(T);
  T.G('nextYear()'); const first = T.G('__shown.slice()');
  s.pendingFollowup = null; T.G("$('choices').innerHTML = ''");
  s.flags.push('__en_open'); s.hp = 100; T.G('nextYear()');
  check('EN-2c 숨김 상태에서 미표시 → 플래그 뒤 표시(가중치 1e7)', !first.includes('__en_zero') && T.G('__shown').includes('__en_zero') && s.done.includes('__en_zero'), { first, after: T.G('__shown') });
  check('EN-2d 버튼은 보이는 선택지 1개만', T.buttons().length === 1 && T.buttons()[0].textContent === '숨김 A');
});
test('EN-2b ⑫ 방어(합성: ⑩ 을 우회한 사본) → 진단 event_recheck_failed 1, showEvent 미호출, 사건 없음과 같은 처리', () => {
  // F1D4A D-LUCK 엔진 경계(의도적 시험 변경): ⑩ 이 원본 대신 조건 스냅숏(cs.snap)으로 판정하게 되어 패치 대상 문자열만 바꿈. 기대값 불변.
  const T = makeCtx({ seed: 11, patch: [['script.js', 'return match(cs.snap, e) && visibleChoices(e).length > 0;', 'return match(cs.snap, e);']] });
  const s = life(T, 29); push(T, ZERO({ cond: { cage: [30, 30] } })); wrapShow(T);
  const before = s.age; T.G('nextYear()');
  const d = diags(T, 'event_recheck_failed');
  check('EN-2b 진단 1(where nextYear, part choices, 사건 id)', d.length === 1 && d[0].where === 'nextYear' && d[0].part === 'choices' && d[0].eventId === '__en_zero', d);
  check('EN-2b showEvent 에 0개 사건이 전달되지 않음·소비 없음', !T.G('__shown').includes('__en_zero') && !s.done.includes('__en_zero') && !(s.eventCounts || {}).__en_zero && s.age > before);
});
test('EN-2b 재검사의 사건 조건 실패(합성: ⑩ 의 사건 조건을 참으로 바꾼 사본) → part cond', () => {
  // F1D4A D-LUCK 엔진 경계(의도적 시험 변경): 패치 대상 문자열만 cs.snap 으로 바꿈. 기대값 불변(⑫ 는 ⑩ 의 같은 스냅숏으로 재검사).
  const T = makeCtx({ seed: 12, patch: [['script.js', 'return match(cs.snap, e) && visibleChoices(e).length > 0;', 'return e.id === "__en_cond" ? S.age === 30 : match(cs.snap, e) && visibleChoices(e).length > 0;']] });
  const s = life(T, 29); push(T, { id: '__en_cond', w: 1e7, text: 't', cond: { cage: [30, 30], job: ['__nobody__'] }, maxTimes: 99, cool: 0, choices: [{ label: 'a', fx: {} }] }); wrapShow(T);
  T.G('nextYear()'); const d = diags(T, 'event_recheck_failed');
  check('EN-2b-cond', d.length === 1 && d[0].part === 'cond' && !T.G('__shown').includes('__en_cond'), d);
});

// ── E-1.3 showEvent ────────────────────────────────────────────────────────────
test('EN-2c(a) showEvent 직접 호출 — 선택지 0개: false, 상태·버튼·타이머·난수 불변, 진단만', () => {
  const T = makeCtx({ timers: 'queue' }); const s = life(T); T.el('auto').checked = true; push(T, ZERO());
  const b = snap(s), c0 = T.calls(), dom0 = T.dom(), t0 = T.timers.length;
  const r = T.G("showEvent(EVENTS.find(e => e.id === '__en_zero'))");
  check('EN-2c(a)', r === false && snap(s) === b && T.calls() === c0 && T.dom() === dom0 && T.timers.length === t0 && T.buttons().length === 0
    && diags(T, 'event_no_visible_choice').length === 1 && diags(T, 'event_no_visible_choice')[0].where === 'showEvent');
});
test('EN-2c(a2) showEvent 는 사건 조건을 다시 보지 않음(조건 불일치 상태에서도 보이는 선택지가 있으면 true)', () => {
  const T = makeCtx(); life(T); push(T, { id: '__en_c', w: 0, text: 't', cond: { job: ['__nobody__'] }, choices: [{ label: 'a', fx: {} }] });
  check('EN-2c(a2)', T.G("showEvent(EVENTS.find(e => e.id === '__en_c'))") === true);
});
test('EN-2c(b) 정지 중: undefined, 진단 halted_entry, 상태 불변', () => {
  const T = makeCtx(); const s = life(T); const e = T.G('EVENTS')[0]; T.G('progressHalted = true'); const b = snap(s);
  check('EN-2c(b)', T.G('showEvent(EVENTS[0])') === undefined && snap(s) === b && diags(T, 'halted_entry').some(d => d.fn === 'showEvent') && diags(T, 'event_no_visible_choice').length === 0, e.id);
});
test('EN-2c(d) 정상 사건: true, 기존과 같은 기록(currentEventId·연표·횟수·버튼)', () => {
  const T = makeCtx(); const s = life(T); const e = T.G('EVENTS').find(x => x.choices && x.choices.length >= 2);
  const r = T.G(`showEvent(EVENTS.find(x => x.id === ${JSON.stringify(e.id)}))`);
  check('EN-2c(d)', r === true && s.currentEventId === e.id && s.eventCounts[e.id] === 1 && s.recentEvents[s.recentEvents.length - 1] === e.id && T.buttons().length === e.choices.length);
});
test('E-1.3 nextYear 는 showEvent 의 반환값을 그대로 돌려줌(정상 표시 true)', () => {
  const T = makeCtx({ seed: 3 }); life(T, 20); let r, n = 0;
  for (; n < 30; n++) { r = T.G('nextYear()'); if (r !== undefined || T.G('S.dead')) break; }
  check('E1-4', r === true || T.G('S.dead') === true, { r, n });
});

// ── E-1.4·EN-3·EN-6 숨긴 선택지와 RNG 정책(합성 데이터) ─────────────────────────
const MIX = { id: '__en_mix2', w: 0, text: 't', cond: {}, choices: [{ label: '보임', text: 'ok', fx: {} }, { label: '숨김', cond: { job: ['__nobody__'] }, text: 'hid', fx: { valis: 999 } }] };
test('EN-3 숨긴 선택지: 버튼 없음, 자동 선택 0, chooseBody 직접 호출 거부(상태·난수 불변)', () => {
  const T = makeCtx({ timers: 'queue' }); const s = life(T); push(T, MIX); T.el('auto').checked = true;
  check('EN-3a showEvent true·버튼 1(보이는 것만)', T.G("showEvent(EVENTS.find(e => e.id === '__en_mix2'))") === true && T.buttons().length === 1 && T.buttons()[0].textContent === '보임');
  const b = snap(s), c0 = T.calls();
  const r = T.G("chooseBody(EVENTS.find(e => e.id === '__en_mix2').choices[1])");
  check('EN-3b chooseBody(숨김) → 거부, 상태·난수 불변, 진단 hidden_choice_rejected', r === undefined && snap(s) === b && T.calls() === c0 && diags(T, 'hidden_choice_rejected').length === 1);
  check('EN-3c 거부 시 버튼을 지우지 않음(choices 비우기 전)', T.buttons().length === 1);
  const c1 = T.calls(); T.runTimer();
  check('EN-6a 자동 진행: 보이는 1개여도 R2 1회 — 보이는 선택지가 골라짐', T.calls() - c1 === 1 && s.valis !== 999 && s.logHistory.some(l => l.text === 'ok'));
});
test('EN-6 RNG 정책(합성)', () => {
  // (b) 보이는 2개 이상: R2 1
  { const T = makeCtx({ timers: 'queue' }); const s = life(T); T.el('auto').checked = true;
    push(T, { id: '__en_two', w: 0, text: 't', cond: {}, choices: [{ label: 'a', text: 'A', fx: {} }, { label: 'b', text: 'B', fx: {} }, { label: 'h', cond: { job: ['__nobody__'] }, text: 'H', fx: {} }] });
    T.G("showEvent(EVENTS.find(e => e.id === '__en_two'))"); const c0 = T.calls(); T.runTimer();
    check('EN-6b 보이는 2개: 버튼 2, R2 1', T.calls() - c0 === 1 && !s.logHistory.some(l => l.text === 'H')); }
  // (d) 직접 클릭: R2 0 / (f) chance 있으면 R3 1
  { const T = makeCtx(); life(T); push(T, { id: '__en_ch', w: 0, text: 't', cond: {}, choices: [{ label: 'c', chance: { p: 0.5, stat: 'hp', per: 0, ok: { text: 'o', fx: {} }, fail: { text: 'f', fx: {} } } }, { label: 'n', text: 'n', fx: {} }] });
    T.G("showEvent(EVENTS.find(e => e.id === '__en_ch'))"); const c0 = T.calls(); T.buttons()[1].click();
    check('EN-6d 직접 클릭(chance 없음): 난수 0', T.calls() === c0);
    T.G("$('choices').innerHTML = ''"); T.S().currentEventId = null;   // 앞 선택 뒤 생긴 '다음 해로' 버튼을 비운다(합성)
    T.G("showEvent(EVENTS.find(e => e.id === '__en_ch'))"); const c1 = T.calls(); T.buttons()[0].click();
    check('EN-6f 직접 클릭(chance 있음): R3 1', T.calls() - c1 === 1); }
  // (e) choiceMatch 난수 0
  { const T = makeCtx(); life(T); const c0 = T.calls(); T.G("for (let i = 0; i < 50; i++) choiceMatch({ min: { hp: 1 }, job: ['adventurer'], locationIn: ['orario'] })");
    check('EN-6e choiceMatch 난수 0', T.calls() === c0); }
});

// ── P2 보완(ChatGPT 1차 재검수): cond 속성 부재 vs 잘못된 조건값, min/max 형식, visibleChoices·chooseBody 같은 규칙 ──
// 모두 합성 사건·합성 상태 주입이다. 실제 사건 데이터(choice.cond 0건)는 바꾸지 않는다.
const CONDSRC = { '없음': null, '{}': '{}', 'min 유효': '{ min: { hp: 1 } }', 'max 유효': '{ max: { hp: 1000 } }', 'min·max 유효': '{ min: { hp: 1, mp: 0 }, max: { hp: 1000 } }',
  'null': 'null', 'false': 'false', '0': '0', "''": "''", '[]': '[]', 'undefined(속성 있음)': 'undefined', '[{}]': '[{}]', 'Date': 'new Date(0)', '"x"': '"x"', '1': '1', 'true': 'true',
  'min:null': '{ min: null }', 'min:false': '{ min: false }', 'min:0': '{ min: 0 }', 'min:5': '{ min: 5 }', 'min:[]': '{ min: [] }', 'min:{}': '{ min: {} }', 'min:[1]': '{ min: [1] }',
  'min:NaN': '{ min: { hp: NaN } }', 'min:+Inf': '{ min: { hp: Infinity } }', 'min:-Inf': '{ min: { hp: -Infinity } }', "min:'1'": "{ min: { hp: '1' } }", 'min:undefined': '{ min: { hp: undefined } }', 'min:null값': '{ min: { hp: null } }',
  'max:null': '{ max: null }', 'max:false': '{ max: false }', 'max:0': '{ max: 0 }', 'max:5': '{ max: 5 }', 'max:[]': '{ max: [] }', 'max:{}': '{ max: {} }',
  'max:NaN': '{ max: { hp: NaN } }', 'max:+Inf': '{ max: { hp: Infinity } }', 'max:-Inf': '{ max: { hp: -Infinity } }',
  'min 유효+max 잘못': '{ min: { hp: 1 }, max: {} }', 'min 둘 중 하나 NaN': '{ min: { hp: 1, mp: NaN } }' };
const CONDOK = new Set(['없음', '{}', 'min 유효', 'max 유효', 'min·max 유효']);
// P2 보완 2(44178ca 재검수): 프로토타입 우회·비일반 객체·접근자/비열거/심볼 속성. 기존 항목은 그대로 두고 추가만 한다.
Object.assign(CONDSRC, {
  'proto 상속 min NaN': 'Object.create({ min: { hp: NaN } })', 'proto 상속 max NaN': 'Object.create({ max: { hp: NaN } })',
  'proto 상속 min 유효': 'Object.create({ min: { hp: 1 } })',
  'min 상속 NaN': '{ min: Object.assign(Object.create({ mp: NaN }), { hp: 1 }) }', 'max 상속 NaN': '{ max: Object.assign(Object.create({ mp: NaN }), { hp: 1000 }) }',
  'class 인스턴스 cond': '(() => { class C { constructor() { this.min = { hp: 1 }; } } return new C(); })()', 'class 인스턴스(빈) cond': 'new (class X {})()',
  'min 사용자 프로토타입': '{ min: Object.assign(Object.create({}), { hp: 1 }) }', 'max 사용자 프로토타입': '{ max: Object.assign(Object.create({ q: 1 }), { hp: 1000 }) }',
  'min class 인스턴스': '{ min: new (class M { constructor() { this.hp = 1; } })() }',
  'Date+toStringTag Object': '(() => { const d = new Date(0); Object.defineProperty(d, Symbol.toStringTag, { value: "Object" }); return d; })()',
  'Array+toStringTag Object': '(() => { const a = []; Object.defineProperty(a, Symbol.toStringTag, { value: "Object" }); return a; })()',
  'min Date+toStringTag': '{ min: (() => { const d = new Date(0); Object.defineProperty(d, Symbol.toStringTag, { value: "Object" }); d.hp = 1; return d; })() }',
  'max Array+toStringTag': '{ max: (() => { const a = []; Object.defineProperty(a, Symbol.toStringTag, { value: "Object" }); a.hp = 1000; return a; })() }',
  '위조 Object.prototype(constructor=Object)': '(() => { const p = Object.create(null); p.constructor = Object; p.min = { hp: NaN }; return Object.create(p); })()',
  '위조 native 아님 생성자 Object': '(() => { const F = function Object() {}; const p = Object.create(null); F.prototype = p; p.constructor = F; p.min = { hp: NaN }; return Object.create(p); })()',
  'getter min': '{ get min() { return { hp: 1 }; } }', '비열거 자체 min NaN': 'Object.defineProperty({}, "min", { value: { hp: NaN }, enumerable: false })',
  '심볼 키 cond': '{ [Symbol("x")]: 1 }', 'min getter hp': '{ min: { get hp() { return 1; } } }',
  'null 프로토타입 cond(정상)': 'Object.assign(Object.create(null), { min: { hp: 1 } })', 'null 프로토타입 min(정상)': '{ min: Object.assign(Object.create(null), { hp: 1 }) }' });
CONDOK.add('null 프로토타입 cond(정상)'); CONDOK.add('null 프로토타입 min(정상)');
const mkEv = (T, name) => T.G(`(() => { const ch = { label: 'X', text: 'xx', fx: { valis: 777 } }; ${CONDSRC[name] === null ? '' : 'ch.cond = ' + CONDSRC[name] + ';'}
  const ev = { id: '__en_fc', w: 0, text: 't', cond: {}, choices: [{ label: '보임', text: 'ok', fx: {} }, ch] }; EVENTS.push(ev); return ev; })()`);
test('P2 보완 F-1: 조건 형식별 표시 여부(visibleChoices) = choiceMatch = 기대값', () => {
  for (const name of Object.keys(CONDSRC)) {
    const T = makeCtx(); const s = life(T); s.mp = 10; mkEv(T, name);
    const vis = T.G("visibleChoices(EVENTS.find(e => e.id === '__en_fc')).map(c => c.label).join()");
    const want = CONDOK.has(name);
    check('PF-1 ' + name + ' → ' + (want ? '보임' : '숨김'), vis === (want ? '보임,X' : '보임'), vis);
    if (CONDSRC[name] !== null) check('PF-1b ' + name + ' choiceMatch = ' + want, T.G('choiceMatch(' + CONDSRC[name] + ')') === want);
  }
});
test('P2 보완 F-2: 상태 값 S[k] 가 NaN·±Infinity·undefined·문자열·null 이면 유효한 min/max 조건도 계속 숨김', () => {
  for (const v of [NaN, Infinity, -Infinity, undefined, '50', null]) {
    const T = makeCtx(); const s = life(T); s.hp = v; mkEv(T, 'min·max 유효');
    check('PF-2 hp=' + String(v), T.G("visibleChoices(EVENTS.find(e => e.id === '__en_fc')).length") === 1
      && T.G('choiceMatch({ min: { hp: 1 } })') === false && T.G('choiceMatch({ max: { hp: 1000 } })') === false);
  }
  const T = makeCtx(); const s = life(T); s.hp = 50;
  check('PF-2b 대조: hp=50 이면 보임, 범위 밖이면 숨김', T.G('choiceMatch({ min: { hp: 1 }, max: { hp: 1000 } })') === true && T.G('choiceMatch({ min: { hp: 51 } })') === false && T.G('choiceMatch({ max: { hp: 49 } })') === false);
});
test('P2 보완 F-3: 잘못된 조건·숨긴 선택지 직접 호출(chooseBody·choose) → 거부, S·난수·연표·UI 불변, 진단(이유) 1건', () => {
  for (const name of Object.keys(CONDSRC).filter(n => !CONDOK.has(n)).concat(['조건 불충족'])) {
    const T = makeCtx(); const s = life(T); s.mp = 10;
    if (name === '조건 불충족') T.G("EVENTS.push({ id: '__en_fc', w: 0, text: 't', cond: {}, choices: [{ label: '보임', text: 'ok', fx: {} }, { label: 'X', cond: { job: ['__nobody__'] }, text: 'xx', fx: { valis: 777 } }] })");
    else mkEv(T, name);
    check('PF-3a ' + name + ' showEvent true·버튼 1', T.G("showEvent(EVENTS.find(e => e.id === '__en_fc'))") === true && T.buttons().length === 1 && T.buttons()[0].textContent === '보임');
    const b = snap(s), c0 = T.calls(), log0 = s.logHistory.length, d0 = diags(T, 'hidden_choice_rejected').length, ui0 = T.el('choices').innerHTML, ev0 = s.currentEventId;
    const r = T.G("chooseBody(EVENTS.find(e => e.id === '__en_fc').choices[1])");
    const d = diags(T, 'hidden_choice_rejected');
    check('PF-3b ' + name + ' chooseBody 거부: 반환 undefined, S 깊은 비교 동일, 난수 0, 연표 0, UI 동일', r === undefined && snap(s) === b && T.calls() === c0 && s.logHistory.length === log0
      && T.el('choices').innerHTML === ui0 && s.valis !== 777 && s.currentEventId === ev0);
    check('PF-3c ' + name + ' 진단 1건·이유 ' + (name === '조건 불충족' ? 'cond_unmet' : 'cond_malformed'), d.length === d0 + 1 && d[d.length - 1].eventId === '__en_fc'
      && d[d.length - 1].reason === (name === '조건 불충족' ? 'cond_unmet' : 'cond_malformed'), d[d.length - 1]);
    const c1 = T.calls(); T.G("choose(EVENTS.find(e => e.id === '__en_fc').choices[1])");
    check('PF-3d ' + name + ' choose(래퍼) 경유도 거부: 효과·난수 0, 진단 +1', s.valis !== 777 && T.calls() === c1 && diags(T, 'hidden_choice_rejected').length === d0 + 2);
  }
});
test('P2 보완 F-4: 정상 조건(cond 없음·{}·유효 min/max)은 chooseBody 직접 호출이 그대로 실행됨(거부 진단 0)', () => {
  for (const name of [...CONDOK]) {
    const T = makeCtx(); const s = life(T); s.mp = 10; mkEv(T, name);
    T.G("showEvent(EVENTS.find(e => e.id === '__en_fc'))");
    T.G("chooseBody(EVENTS.find(e => e.id === '__en_fc').choices[1])");
    check('PF-4 ' + name, s.logHistory.some(l => l.text === 'xx') && diags(T, 'hidden_choice_rejected').length === 0);
  }
});
test('P2 보완 F-5: 보이는 선택지가 0개가 되는 잘못된 조건만 있는 사건 → showEvent false, 버튼 0', () => {
  const T = makeCtx(); life(T);
  T.G("EVENTS.push({ id: '__en_fc0', w: 0, text: 't', cond: {}, choices: [{ label: 'a', cond: null, fx: {} }, { label: 'b', cond: [], fx: {} }, { label: 'c', cond: { min: {} }, fx: {} }] })");
  check('PF-5', T.G("showEvent(EVENTS.find(e => e.id === '__en_fc0'))") === false && T.buttons().length === 0 && diags(T, 'event_no_visible_choice').length === 1);
});
test('P2 보완 F-6: 판정 함수 순수성(잘못된 조건 포함) — S·난수·연표·진단 0', () => {
  const T = makeCtx(); const s = life(T); const b = snap(s), c0 = T.calls(), d0 = T.G('followupDiagLog.length'), y0 = T.G('syncInvariantLog.length');
  for (const name of Object.keys(CONDSRC)) if (CONDSRC[name] !== null) T.G('choiceMatch(' + CONDSRC[name] + '); choiceVisible({ cond: ' + CONDSRC[name] + ' })');
  check('PF-6', snap(s) === b && T.calls() === c0 && T.G('followupDiagLog.length') === d0 && T.G('syncInvariantLog.length') === y0);
});

test('P2 보완 2 F-7: 다른 실행 영역(realm)의 정상 일반 객체 조건은 허용, 다른 realm 의 프로토타입 우회는 거부', () => {
  const cases = [['외부 realm {min}', () => ({ min: { hp: 1 } }), true], ['외부 realm {}', () => ({}), true],
    ['외부 realm null 프로토타입', () => Object.assign(Object.create(null), { max: { hp: 1000 } }), true],
    ['외부 realm 형식 정상·조건 불충족(job)', () => ({ min: { hp: 1 }, job: ['__nobody__'] }), false, 'cond_unmet'],
    ['외부 realm 상속 min NaN', () => Object.create({ min: { hp: NaN } }), false], ['외부 realm min 상속 NaN', () => ({ min: Object.assign(Object.create({ mp: NaN }), { hp: 1 }) }), false],
    ['외부 realm class 인스턴스', () => new (class C { constructor() { this.min = { hp: 1 }; } })(), false]];
  for (const [name, mk, want, why = 'cond_malformed'] of cases) {
    const T = makeCtx(); const s = life(T); s.mp = 10; T.ctx.__outerCond = mk();
    check('PF-7a ' + name + ' 실제로 다른 realm', T.G('Object.getPrototypeOf(__outerCond) !== Object.prototype') === true);
    T.G("EVENTS.push({ id: '__en_fx', w: 0, text: 't', cond: {}, choices: [{ label: '보임', text: 'ok', fx: {} }, { label: 'X', cond: __outerCond, text: 'xx', fx: {} }] })");
    const vis = T.G("visibleChoices(EVENTS.find(e => e.id === '__en_fx')).map(c => c.label).join()");
    check('PF-7b ' + name + ' → ' + (want ? '보임' : '숨김') + ' · choiceMatch ' + want, vis === (want ? '보임,X' : '보임') && T.G('choiceMatch(__outerCond)') === want, vis);
    T.G("showEvent(EVENTS.find(e => e.id === '__en_fx'))"); const b = snap(s), c0 = T.calls(), ui0 = T.el('choices').innerHTML;
    T.G("chooseBody(EVENTS.find(e => e.id === '__en_fx').choices[1])"); const d = diags(T, 'hidden_choice_rejected');
    if (want) check('PF-7c ' + name + ' 직접 호출 실행됨', s.logHistory.some(l => l.text === 'xx') && d.length === 0);
    else check('PF-7c ' + name + ' 직접 호출 거부(S·난수·UI 불변, ' + why + ')', snap(s) === b && T.calls() === c0 && T.el('choices').innerHTML === ui0 && d.length === 1 && d[0].reason === why, d);
  }
});
test('P2 보완 2 F-8: match() 가 받는 조건 = 검증한 자체 속성 스냅숏(상속 속성은 match 에 닿지 않음), match 자체는 기존 판정 유지', () => {
  const T = makeCtx(); const s = life(T); s.hp = 50; s.mp = 10;
  T.G('var __seen = []; var __origMatch = match; match = function (c, e) { __seen.push([Object.getPrototypeOf(c) === null, Object.keys(c).join(), c.min ? Object.keys(c.min).join() : null]); return __origMatch(c, e); };');
  T.G('choiceMatch({ min: { hp: 1 }, job: [S.job] })');
  check('PF-8a match 에 넘어간 것은 프로토타입 null 스냅숏(자체 키만)', JSON.stringify(T.G('__seen')) === JSON.stringify([[true, 'min,job', 'hp']]), T.G('__seen'));
  T.G('__seen = []; choiceMatch(Object.create({ min: { hp: NaN } })); choiceMatch({ min: Object.assign(Object.create({ mp: NaN }), { hp: 1 }) })');
  check('PF-8b 프로토타입 우회 조건은 match 를 호출하지 않음', T.G('__seen.length') === 0);
  T.G('match = __origMatch');
  check('PF-8c 사건 match() 는 그대로(상속 min 을 읽는 기존 동작 — 사건 조건 경로는 변경 없음)', T.G('match(Object.create({ min: { hp: 999 } }))') === false && T.G('match(Object.create({ min: { hp: 1 } }))') === true);
});
test('P2 보완 2 F-9: 객체가 아닌 선택지 직접 호출(chooseBody) → choices 비우기 전 거부, S·난수·연표·UI 불변, 진단 choice_not_object', () => {
  for (const [name, src] of [['null', 'null'], ['undefined', 'undefined'], ['0', '0'], ["''", "''"], ['"x"', '"x"'], ['1', '1'], ['true', 'true']]) {
    const T = makeCtx(); const s = life(T); push(T, MIX);
    T.G("showEvent(EVENTS.find(e => e.id === '__en_mix2'))");
    const b = snap(s), c0 = T.calls(), log0 = s.logHistory.length, ui0 = T.el('choices').innerHTML, n0 = T.buttons().length; let threw = null, r;
    try { r = T.G('chooseBody(' + src + ')'); } catch (err) { threw = String(err); }
    const d = diags(T, 'hidden_choice_rejected');
    check('PF-9a ' + name + ' chooseBody: 예외 없음·반환 undefined·S·난수·연표·UI 불변', threw === null && r === undefined && snap(s) === b && T.calls() === c0 && s.logHistory.length === log0
      && T.el('choices').innerHTML === ui0 && T.buttons().length === n0, threw);
    check('PF-9b ' + name + ' 진단 1건 reason=choice_not_object', d.length === 1 && d[0].reason === 'choice_not_object' && d[0].eventId === '__en_mix2', d);
    let threw2 = null; const c1 = T.calls();
    try { T.G('choose(' + src + ')'); } catch (err) { threw2 = String(err); }
    check('PF-9c ' + name + ' choose(래퍼) 경유: 예외 없음·난수 0·UI 불변(래퍼의 currentEventId 초기화는 기존 동작)', threw2 === null && T.calls() === c1 && T.el('choices').innerHTML === ui0, threw2);
  }
});

// ── P2 보완 3(ed6e824 재검수): 선택지 객체 자체의 형식 · 상속/접근자/비열거 cond · 검증 중 예외 fail-closed ──────────
// 모두 합성 사건·합성 상태 주입. __gr 은 getter/setter 가 실행됐는지 기록하는 시험용 전역.
const BASECH = "label: 'X', text: 'xx', fx: { valis: 777 }";
const CHSRC = {   // [선택지 생성식, 기대: 'show' | 이유]
  '일반 선택지 cond 없음': [`({ ${BASECH} })`, 'show'],
  'null 프로토타입 선택지 cond 없음': [`Object.assign(Object.create(null), { ${BASECH} })`, 'show'],
  '자체 cond 데이터 {} ': [`({ ${BASECH}, cond: {} })`, 'show'],
  '자체 cond 데이터 충족': [`({ ${BASECH}, cond: { min: { hp: 1 } } })`, 'show'],
  '자체 cond 데이터 불충족': [`({ ${BASECH}, cond: { job: ['__nobody__'] } })`, 'cond_unmet'],
  'null 프로토타입 선택지 자체 cond 불충족': [`Object.assign(Object.create(null), { ${BASECH}, cond: { job: ['__nobody__'] } })`, 'cond_unmet'],
  '상속 cond(불충족 조건)': [`Object.assign(Object.create({ cond: { job: ['__nobody__'] } }), { ${BASECH} })`, 'cond_malformed'],
  '상속 cond(빈 조건 {})': [`Object.assign(Object.create({ cond: {} }), { ${BASECH} })`, 'cond_malformed'],
  '상속 cond(null 프로토타입 부모)': [`Object.assign(Object.create(Object.assign(Object.create(null), { cond: {} })), { ${BASECH} })`, 'cond_malformed'],
  '자체 getter cond': [`({ ${BASECH}, get cond() { __gr.push('get'); return {}; } })`, 'cond_malformed'],
  '자체 setter 전용 cond': [`({ ${BASECH}, set cond(v) { __gr.push('set'); } })`, 'cond_malformed'],
  '자체 getter·setter cond': [`({ ${BASECH}, get cond() { __gr.push('get'); return {}; }, set cond(v) { __gr.push('set'); } })`, 'cond_malformed'],
  '상속 getter cond': [`Object.assign(Object.create({ get cond() { __gr.push('get'); return {}; } }), { ${BASECH} })`, 'cond_malformed'],
  '비열거 자체 cond': [`Object.defineProperty({ ${BASECH} }, 'cond', { value: {}, enumerable: false })`, 'cond_malformed'],
  '배열 선택지': [`Object.assign([], { ${BASECH} })`, 'choice_not_object'],
  'Date 선택지': [`Object.assign(new Date(0), { ${BASECH} })`, 'choice_not_object'],
  '클래스 인스턴스 선택지': [`Object.assign(new (class Ch {})(), { ${BASECH} })`, 'choice_not_object'],
  '사용자 프로토타입 선택지(cond 없음)': [`Object.assign(Object.create({ z: 1 }), { ${BASECH} })`, 'choice_not_object'],
  '함수 선택지': [`Object.assign(function () {}, { ${BASECH} })`, 'choice_not_object'],
  '폐기된 Proxy 선택지': [`(() => { const r = Proxy.revocable({ ${BASECH} }, {}); r.revoke(); return r.proxy; })()`, 'cond_malformed'],
  'descriptor trap 예외 Proxy': [`new Proxy({ ${BASECH} }, { getOwnPropertyDescriptor() { throw new Error('trap-gopd'); } })`, 'cond_malformed'],
  'has trap 예외 Proxy': [`new Proxy({ ${BASECH} }, { has() { throw new Error('trap-has'); } })`, 'cond_malformed'],
  'getPrototypeOf trap 예외 Proxy': [`new Proxy({ ${BASECH} }, { getPrototypeOf() { throw new Error('trap-proto'); } })`, 'cond_malformed'],
  'cond 가 폐기된 Proxy': [`({ ${BASECH}, cond: (() => { const r = Proxy.revocable({}, {}); r.revoke(); return r.proxy; })() })`, 'cond_malformed'],
  'cond.min 의 ownKeys trap 예외': [`({ ${BASECH}, cond: { min: new Proxy({ hp: 1 }, { ownKeys() { throw new Error('trap-keys'); } }) } })`, 'cond_malformed'] };
const mkChEv = (T, src) => T.G(`var __gr = []; EVENTS.push({ id: '__en_c3', w: 0, text: 't', cond: {}, choices: [{ label: '보임', text: 'ok', fx: {} }, ${src}] }); EVENTS[EVENTS.length - 1]`);
test('P2 보완 3 F-10: 선택지 형식별 표시(visibleChoices) · 직접 호출(chooseBody) 판정이 같은 기준', () => {
  for (const [name, [src, want]] of Object.entries(CHSRC)) {
    const T = makeCtx(); const s = life(T); s.hp = 50; let threw = null, vis;
    mkChEv(T, src);
    try { vis = T.G("visibleChoices(EVENTS.find(e => e.id === '__en_c3')).length"); } catch (err) { threw = String(err); }
    check('PF-10a ' + name + ' visibleChoices 예외 없음 · ' + (want === 'show' ? '보임' : '숨김'), threw === null && vis === (want === 'show' ? 2 : 1), threw || vis);
    try { T.G("showEvent(EVENTS.find(e => e.id === '__en_c3'))"); } catch (err) { threw = String(err); }
    check('PF-10b ' + name + ' showEvent 예외 없음 · 버튼 ' + (want === 'show' ? 2 : 1), threw === null && T.buttons().length === (want === 'show' ? 2 : 1), threw);
    const b = snap(s), c0 = T.calls(), log0 = s.logHistory.length, ui0 = T.el('choices').innerHTML, d0 = diags(T, 'hidden_choice_rejected').length; let r;
    try { r = T.G("chooseBody(EVENTS.find(e => e.id === '__en_c3').choices[1])"); } catch (err) { threw = String(err); }
    const d = diags(T, 'hidden_choice_rejected');
    if (want === 'show') check('PF-10c ' + name + ' 직접 호출 실행됨(거부 진단 0)', threw === null && s.logHistory.some(l => l.text === 'xx') && d.length === d0, threw);
    else {
      check('PF-10c ' + name + ' 직접 호출 거부: 예외 없음 · S·난수·연표·UI 불변', threw === null && r === undefined && snap(s) === b && T.calls() === c0 && s.logHistory.length === log0 && T.el('choices').innerHTML === ui0 && s.valis !== 777, threw);
      check('PF-10d ' + name + ' 진단 1건 reason=' + want, d.length === d0 + 1 && d[d.length - 1].reason === want && d[d.length - 1].eventId === '__en_c3', d[d.length - 1]);
    }
    if (/getter|setter/.test(name)) check('PF-10e ' + name + ' getter/setter 미실행', T.G('__gr.length') === 0, T.G('__gr'));
  }
});
test('P2 보완 3 F-11: 검증 중 예외는 게임 루프로 전파되지 않음(nextYear 반복 · 후보 사건에 예외 Proxy 선택지)', () => {
  for (const name of ['폐기된 Proxy 선택지', 'descriptor trap 예외 Proxy', 'has trap 예외 Proxy', 'getPrototypeOf trap 예외 Proxy', 'cond 가 폐기된 Proxy']) {
    const T = makeCtx(); const s = life(T, 20); let threw = null; wrapShow(T);
    T.G(`EVENTS.push({ id: '__en_c3loop', w: 1e7, text: 't', cond: {}, maxTimes: 99, cool: 0, choices: [{ label: '보임', text: 'ok', fx: {} }, ${CHSRC[name][0]}] })`);
    try { for (let i = 0; i < 5; i++) { T.G("$('choices').innerHTML = ''; S.currentEventId = null; S.pendingFollowup = null"); T.G('nextYear()'); } } catch (err) { threw = String(err); }
    check('PF-11 ' + name + ' nextYear 5회 예외 없음 · 정지 없음 · 예외 Proxy 선택지를 가진 사건이 실제로 후보·표시됨', threw === null && T.G('progressHalted') !== true && T.G('__shown').includes('__en_c3loop'), threw || T.G('__shown'));
  }
});
test('P2 보완 3 F-12: 판정 함수(choiceVerdict·visibleChoices)는 잘못된 선택지에서도 S·난수·연표·진단 불변, getter 미실행', () => {
  const T = makeCtx(); const s = life(T); T.G('var __gr = []');
  const b = snap(s), c0 = T.calls(), d0 = T.G('followupDiagLog.length'), y0 = T.G('syncInvariantLog.length');
  for (const [, [src]] of Object.entries(CHSRC)) T.G('choiceVerdict(' + src + ', null); choiceVisible(' + src + ', null)');
  check('PF-12', snap(s) === b && T.calls() === c0 && T.G('followupDiagLog.length') === d0 && T.G('syncInvariantLog.length') === y0 && T.G('__gr.length') === 0, T.G('__gr'));
});

// ── P2 보완 4(신뢰 경계 A안): 사건 선택지 버튼의 클릭 경로 참조 재검증 ───────────────────────────────────────
// 보호 범위는 사용자 UI 의 버튼 클릭 경로뿐이다. choose()·chooseBody() 직접 호출(엔진·하네스 내부 API)은 이 시험의 대상이 아니다.
// 합성 사건(EVENTS 에 넣은 시험용 사건)과 실제 사건(sick) 둘 다 쓴다. nextYear 와 같은 얕은 복사본({ ...e, w }) 표시도 확인한다.
const CLK = { id: '__en_clk', w: 0, text: 't', cond: {}, choices: [{ label: 'A', text: 'aa', fx: { valis: 11 } }, { label: 'B', text: 'bb', fx: { valis: 22 } },
  { label: 'C', chance: { p: 0.5, stat: 'hp', per: 0, ok: { text: 'co', fx: {} }, fail: { text: 'cf', fx: {} } } }] };
const OTH = { id: '__en_oth', w: 0, text: 'o', cond: {}, choices: [{ label: 'O', text: 'oo', fx: { valis: 777 } }] };
const clkDiag = T => diags(T, 'choice_click_rejected');
// 거부 확인: 클릭(또는 clickEventChoice) 뒤 S·난수·연표·UI 불변, 진단 +1 · 이유 일치
const expectClickRejected = (T, label, fire, why) => {
  const s = T.S(), b = snap(s), c0 = T.calls(), log0 = s.logHistory.length, ui0 = T.el('choices').innerHTML, d0 = clkDiag(T).length; let threw = null;
  try { fire(); } catch (err) { threw = String(err); }
  const d = clkDiag(T);
  check(label + ' → 거부(' + why + '): 예외 없음 · choose 미호출(효과·확률 판정·난수 0) · S·연표·UI 불변', threw === null && snap(s) === b && T.calls() === c0 && s.logHistory.length === log0 && T.el('choices').innerHTML === ui0, threw);
  check(label + ' 진단 choice_click_rejected 1건 reason=' + why, d.length === d0 + 1 && d[d.length - 1].reason === why, d[d.length - 1]);
};
test('P2 보완 4 F-13a: 정상 선택지 버튼 클릭은 기존 choose() 결과와 같음(합성 사건 · 실제 사건 · nextYear 식 얕은 복사본)', () => {
  const cases = [['합성 __en_clk A', T => { push(T, CLK); return "EVENTS.find(e => e.id === '__en_clk')"; }, 0], ['합성 __en_clk C(chance)', T => { push(T, CLK); return "EVENTS.find(e => e.id === '__en_clk')"; }, 2],
    ['실제 sick 0', () => "EVENTS.find(e => e.id === 'sick')", 0], ['실제 sick 1(chance)', () => "EVENTS.find(e => e.id === 'sick')", 1],
    ['실제 sick 얕은 복사본(nextYear 와 같은 { ...e, w })', () => "(() => { const src = EVENTS.find(e => e.id === 'sick'); return { ...src, w: src.w * 0.12 }; })()", 1]];
  for (const [name, mk, idx] of cases) {
    const A = makeCtx({ seed: 9 }), B = makeCtx({ seed: 9 }); const sa = life(A, 30), sb = life(B, 30);
    const ea = mk(A), eb = mk(B);
    A.G('var __ev = ' + ea + '; showEvent(__ev)'); B.G('var __ev = ' + eb + '; showEvent(__ev)');
    const ca = A.calls(), cb = B.calls();
    A.buttons()[idx].click();                                   // 클릭 경로
    B.G('choose(__ev.choices[' + idx + '])');                   // 기존 직접 경로(같은 선택지 참조)
    check('PF-13a ' + name + ' 클릭 = 직접 choose: S 깊은 비교 · 난수 호출 수 · 연표 동일, 거부 진단 0',
      snap(sa) === snap(sb) && A.calls() - ca === B.calls() - cb && JSON.stringify(sa.logHistory) === JSON.stringify(sb.logHistory) && clkDiag(A).length === 0);
  }
});
test('P2 보완 4 F-13b: 현재 사건에 없는 객체 · 다른 사건의 선택지 · 다른 사건 객체 → 클릭 경로 거부', () => {
  const T = makeCtx(); life(T, 30); push(T, CLK); push(T, OTH);
  T.G("var __ev = EVENTS.find(e => e.id === '__en_clk'), __oth = EVENTS.find(e => e.id === '__en_oth'); showEvent(__ev)");
  expectClickRejected(T, 'PF-13b 현재 사건에 없는 새 객체', () => T.G("clickEventChoice(activeEventShow, __ev, { label: 'F', text: 'ff', fx: { valis: 777 } })"), 'choice_not_in_event');
  expectClickRejected(T, 'PF-13b 값이 같은 복제 선택지(참조 다름)', () => T.G("clickEventChoice(activeEventShow, __ev, { ...__ev.choices[0] })"), 'choice_not_in_event');
  expectClickRejected(T, 'PF-13b 다른 사건의 선택지 참조', () => T.G('clickEventChoice(activeEventShow, __ev, __oth.choices[0])'), 'choice_not_in_event');
  expectClickRejected(T, 'PF-13b 다른 사건 객체(활성 아님)', () => T.G('clickEventChoice(activeEventShow, __oth, __oth.choices[0])'), 'event_not_active');
  expectClickRejected(T, 'PF-13b 표시 기록 위조(같은 내용의 새 객체)', () => T.G('clickEventChoice({ seq: activeEventShow.seq, event: __ev }, __ev, __ev.choices[0])'), 'stale_button');
  check('PF-13b 거부 뒤에도 정상 버튼은 동작', (T.buttons()[0].click(), T.S().logHistory.some(l => l.text === 'aa')));
});
test('P2 보완 4 F-13c: 이전 사건의 stale 버튼 → 거부(같은 사건 재표시 · 다른 사건 표시 · 이미 해결된 사건)', () => {
  { const T = makeCtx(); life(T, 30); push(T, CLK);
    T.G("var __ev = EVENTS.find(e => e.id === '__en_clk'); showEvent(__ev)"); const old = T.buttons();
    T.G("$('choices').innerHTML = ''; S.currentEventId = null; showEvent(__ev)");        // 같은 사건 객체를 다시 표시(합성)
    expectClickRejected(T, 'PF-13c 같은 사건 재표시 뒤 이전 표시의 버튼', () => old[0].click(), 'stale_button');
    expectClickRejected(T, 'PF-13c 같은 사건 재표시 뒤 이전 표시의 chance 버튼(난수 0)', () => old[2].click(), 'stale_button'); }
  { const T = makeCtx(); life(T, 30); push(T, CLK); push(T, OTH);
    T.G("showEvent(EVENTS.find(e => e.id === '__en_clk'))"); const old = T.buttons();
    T.G("$('choices').innerHTML = ''; S.currentEventId = null; showEvent(EVENTS.find(e => e.id === '__en_oth'))");
    expectClickRejected(T, 'PF-13c 다른 사건 표시 뒤 이전 사건의 버튼', () => old[1].click(), 'stale_button'); }
  { const T = makeCtx(); life(T, 30); push(T, CLK);
    T.G("showEvent(EVENTS.find(e => e.id === '__en_clk'))"); const old = T.buttons();
    old[0].click();                                                                        // 정상 해결(currentEventId → null)
    const v1 = T.S().valis;
    expectClickRejected(T, 'PF-13c 이미 해결된 사건의 다른 버튼', () => old[1].click(), 'event_not_active');
    expectClickRejected(T, 'PF-13c 이미 해결된 사건의 같은 버튼 두 번째 클릭', () => old[0].click(), 'event_not_active');
    check('PF-13c 효과는 한 번만', T.S().valis === v1); }
});
test('P2 보완 4 F-13d: 실제 EVENTS 에 원본이 없는 사건의 버튼 → 거부(id 문자열만 같은 경우 포함)', () => {
  { const T = makeCtx(); life(T, 30);
    T.G("showEvent({ id: '__ghost', text: 'g', choices: [{ label: 'G', text: 'gg', fx: { valis: 777 } }] })");
    expectClickRejected(T, 'PF-13d EVENTS 에 없는 사건', () => T.buttons()[0].click(), 'event_not_in_events'); }
  { const T = makeCtx(); life(T, 30);
    T.G("(() => { const src = EVENTS.find(e => e.id === 'sick'); showEvent({ ...src, choices: src.choices.slice() }); })()");   // id 같음 · choices 배열 참조 다름
    expectClickRejected(T, 'PF-13d id 만 같은 사건(choices 배열 복제)', () => T.buttons()[0].click(), 'event_not_in_events'); }
  { const T = makeCtx(); life(T, 30);
    T.G("(() => { const src = EVENTS.find(e => e.id === 'sick'); showEvent({ ...src, id: '__sick_alias' }); })()");          // choices 참조 같음 · id 다름
    expectClickRejected(T, 'PF-13d choices 참조만 같고 id 다른 사건', () => T.buttons()[1].click(), 'event_not_in_events'); }
});
test('P2 보완 4 F-13e: 내부 API 는 그대로(합성 선택지 직접 choose 허용) · 자동 진행 경로 유지', () => {
  const T = makeCtx(); life(T, 30); push(T, CLK); T.G("showEvent(EVENTS.find(e => e.id === '__en_clk'))");
  T.G("choose({ label: 'syn', text: 'synthetic', fx: { valis: 5 } })");
  check('PF-13e 합성 선택지 직접 choose 는 실행됨(내부 API · 보호 범위 밖)', T.S().logHistory.some(l => l.text === 'synthetic') && clkDiag(T).length === 0);
  const U = makeCtx({ timers: 'queue' }); life(U, 30); push(U, CLK); U.el('auto').checked = true; U.G("showEvent(EVENTS.find(e => e.id === '__en_clk'))");
  const c0 = U.calls(); U.runTimer();
  check('PF-13e 자동 진행: 버튼 클릭 경로로 진행(R2 1 + 선택 결과), 거부 0', U.calls() - c0 >= 1 && U.S().logHistory.some(l => ['aa', 'bb', 'co', 'cf'].includes(l.text)) && clkDiag(U).length === 0);
});

// ── P2 보완 4: 실제 EVENTS 정적 데이터 무결성(Node util.types.isProxy 재귀 검사) ─────────────────────────────
// 규칙: 값마다 Proxy 여부를 가장 먼저 확인(그 전에는 속성 열거·접근 없음). 자체 속성 서술자의 데이터 값(value)만 재귀(getter/setter 미실행,
// 접근자는 기록). WeakSet 으로 순환 방지. 함수는 Proxy 여부만 확인하고 내부로 들어가지 않는다.
const nodeUtil = require('util');
function scanEvents(EV, objProto) {
  const out = { proxies: [], accessors: [], nonPlainChoices: [], nonArrayChoices: [], events: 0, choices: 0, nodes: 0 }, seen = new WeakSet();
  const walk = (v, path) => {
    if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return;
    if (nodeUtil.types.isProxy(v)) { out.proxies.push(path); return; }   // 첫 확인
    if (typeof v === 'function' || seen.has(v)) return; seen.add(v); out.nodes++;
    for (const k of Reflect.ownKeys(v)) {
      const d = Reflect.getOwnPropertyDescriptor(v, k);
      if (!('value' in d)) { out.accessors.push(path + '.' + String(k)); continue; }
      walk(d.value, path + '.' + String(k));
    }
  };
  const plain = v => { const p = Object.getPrototypeOf(v); return !Array.isArray(v) && (p === null || p === objProto); };
  if (nodeUtil.types.isProxy(EV)) { out.proxies.push('EVENTS'); return out; }
  walk(EV, 'EVENTS');
  if (!Array.isArray(EV)) return out;
  for (let i = 0; i < EV.length; i++) {
    const ed = Reflect.getOwnPropertyDescriptor(EV, i), e = ed && 'value' in ed ? ed.value : undefined;
    if (!e || typeof e !== 'object' || nodeUtil.types.isProxy(e)) continue; out.events++;
    const cd = Reflect.getOwnPropertyDescriptor(e, 'choices'), chs = cd && 'value' in cd ? cd.value : undefined;
    if (!chs || nodeUtil.types.isProxy(chs) || !Array.isArray(chs)) { out.nonArrayChoices.push(i); continue; }
    for (let j = 0; j < chs.length; j++) {
      const hd = Reflect.getOwnPropertyDescriptor(chs, j), ch = hd && 'value' in hd ? hd.value : undefined; out.choices++;
      if (!ch || typeof ch !== 'object' || nodeUtil.types.isProxy(ch) || !plain(ch)) out.nonPlainChoices.push(i + ':' + j);
    }
  }
  return out;
}
const scanOf = T => scanEvents(T.G('EVENTS'), T.G('Object.prototype'));
const scanOk = r => r.proxies.length === 0 && r.accessors.length === 0 && r.nonPlainChoices.length === 0 && r.nonArrayChoices.length === 0;
test('P2 보완 4 F-14a: 실제 로드된 EVENTS(events.js) 전체 — Proxy 0 · 접근자 0 · 모든 선택지가 일반 객체', () => {
  const T = makeCtx(); const r = scanOf(T);
  check('PF-14a 실제 EVENTS 81개 · 선택지 ' + r.choices + '개 · 검사 노드 ' + r.nodes + '개, 문제 0', r.events === 81 && T.G('EVENTS.length') === 81 && r.choices > 0 && scanOk(r), r);
});
test('P2 보완 4 F-14b: EVENTS 안에 Proxy 가 있으면 검사 실패 · 검사 중 trap 호출 0', () => {
  const inject = [['사건 cond 에 Proxy', "EVENTS[3].cond = new Proxy({}, __rec)"], ['선택지 cond 에 Proxy', "EVENTS[5].choices[0].cond = new Proxy({}, __rec)"],
    ['선택지 cond.min 에 Proxy', "EVENTS[6].choices[0].cond = { min: new Proxy({ hp: 1 }, __rec) }"], ['선택지 자체가 Proxy', "EVENTS[7].choices.push(new Proxy({ label: 'p' }, __rec))"],
    ['choices 배열이 Proxy', "EVENTS[8].choices = new Proxy(EVENTS[8].choices, __rec)"], ['사건 자체가 Proxy', "EVENTS.push(new Proxy({ id: '__px', choices: [] }, __rec))"],
    ['fx 깊은 곳에 Proxy', "EVENTS[9].choices[0].fx = { deep: [{ x: new Proxy({}, __rec) }] }"]];
  for (const [name, code] of inject) {
    const T = makeCtx();
    T.G("var __trap = 0; var __rec = new Proxy({}, { get(t, k) { return function () { __trap++; return Reflect[k].apply(null, arguments); }; } })");
    T.G(code); const r = scanOf(T);
    check('PF-14b ' + name + ' → Proxy 검출 · 검사 실패 · trap 0', r.proxies.length >= 1 && !scanOk(r) && T.G('__trap') === 0, { proxies: r.proxies, trap: T.G('__trap') });
  }
});
test('P2 보완 4 F-14c: 비일반 선택지 객체 · 접근자 · 순환 참조', () => {
  for (const [name, code, field] of [['사용자 프로토타입 선택지', "EVENTS[4].choices.push(Object.assign(Object.create({ z: 1 }), { label: 'u' }))", 'nonPlainChoices'],
    ['Date 선택지', "EVENTS[4].choices.push(new Date(0))", 'nonPlainChoices'], ['클래스 인스턴스 선택지', "EVENTS[4].choices.push(new (class K {})())", 'nonPlainChoices'],
    ['배열 선택지', "EVENTS[4].choices.push([1])", 'nonPlainChoices'], ['원시값 선택지', "EVENTS[4].choices.push('x')", 'nonPlainChoices'],
    ['choices 가 배열 아님', "EVENTS[4].choices = { 0: {} }", 'nonArrayChoices'],
    ['getter 속성', "var __g = 0; Object.defineProperty(EVENTS[4].choices[0], 'text', { get() { __g++; return 'x'; }, enumerable: true })", 'accessors']]) {
    const T = makeCtx(); T.G(code); const r = scanOf(T);
    check('PF-14c ' + name + ' → 검사 실패(' + field + ')', r[field].length >= 1 && !scanOk(r), r[field]);
    if (field === 'accessors') check('PF-14c getter 미실행', T.G('__g') === 0);
  }
  const T = makeCtx(); T.G('EVENTS[0].choices[0].__self = EVENTS[0]; EVENTS[1].cond.__loop = EVENTS'); let r, threw = null;
  try { r = scanOf(T); } catch (err) { threw = String(err); }
  check('PF-14c 순환 참조 → 검사 종료(예외 없음) · 순환 자체는 문제 아님', threw === null && scanOk(r), threw || r);
});

R.finish('engine_p2_test');
