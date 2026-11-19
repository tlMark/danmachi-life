// F1D4A D-LUCK 엔진 경계 시험(설계 r5 LK-8·LK-11·LK-12·LK-S8, LUCK-10·15~19). 각 시험은 새 vm 컨텍스트.
// 구분: (가-1) LK-11 정적 대조(실제 EVENTS + 합성 상태) / (나) LK-8 형식 위반 fail-closed(합성 주입) / LK-12 ⑩·⑫ 일관성(합성 패치).
// 실제 생애 결과 불변(LK-R0)은 이 파일 밖(P1·48k)에서 따로 측정한다.
// 사용: node tests/eventcond_test.js — 실패 1건 이상이면 종료 코드 1.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeCtx, makeReporter, setAge, snap } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const life = (T, age = 20) => { T.G('startLife()'); const s = T.S(); setAge(s, age); s.hp = 100; s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''"); return s; };
const fdiag = (T, kind) => T.G('followupDiagLog').filter(d => d.event === kind);

// ── LK-11 정상 데이터 의미 보존(정적 대조) ──────────────────────────────────────────
test('LK-11a 실제 EVENTS 81개 전부 형식 통과(제외 0) · 구조 동일 · 같은 realm · null 조건 0 · id 유일', () => {
  const T = makeCtx(); const n = T.G('EVENTS.length');
  const res = T.G('EVENTS.map(e => { const r = eventCondSnapshot(e.cond); return { id: e.id, ok: r.ok, reason: r.reason || null, und: e.cond === undefined, nul: e.cond === null }; })');
  check('LK-11a 81개 · 전부 ok', n === 81 && res.every(r => r.ok), res.filter(r => !r.ok));
  check('LK-11b null 조건 0', res.filter(r => r.nul).length === 0);
  check('LK-11c 사건 id 전역 유일(진단 키 EVENTS:id 와 1:1)', new Set(res.map(r => r.id)).size === 81);
  const same = T.G(`EVENTS.every(e => { const c = e.cond, sn = eventCondSnapshot(c).snap; if (c === undefined) return Object.keys(sn).length === 0 && Object.getPrototypeOf(sn) === null;
    const ks = Object.keys(c); if (Object.getPrototypeOf(sn) !== null || Object.keys(sn).join() !== ks.join()) return false;
    return ks.every(k => { const a = c[k], b = sn[k]; if (Array.isArray(a)) return Array.isArray(b) && b !== a && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
      if (a && typeof a === 'object') return b !== a && Object.getPrototypeOf(b) === null && Object.keys(a).join() === Object.keys(b).join() && Object.keys(a).every(x => Object.is(a[x], b[x]));
      return Object.is(a, b); }); })`);
  check('LK-11d 스냅숏 구조·값 동일(배열·객체는 새 객체, 객체는 null 프로토타입)', same);
  check('LK-11e 같은 realm: 실제 데이터의 배열·객체 프로토타입이 리터럴 기준 기본 프로토타입', T.G('EVENTS.every(e => !e.cond || Object.values(e.cond).every(v => v === null || typeof v !== "object" || Object.getPrototypeOf(v) === (Array.isArray(v) ? ECOND_ARRAY_PROTO : ECOND_OBJECT_PROTO)))'));
});
test('LK-11f 판정 동치: 실제 생애 진행 중 매년 모든 사건에 대해 match(원본) === match(스냅숏) (+ 합성 극단 상태)', () => {
  let cmp = 0, bad = [];
  for (const seed of [1, 2, 3, 777, 20261104]) {
    const T = makeCtx({ seed }); T.G('startLife()');
    for (let y = 0; y < 90 && !T.S().cause; y++) {
      const r = T.G('EVENTS.map(e => [e.id, match(e.cond, e), match(eventCondSnapshot(e.cond).snap, e)])');
      for (const [id, a, b] of r) { cmp++; if (a !== b) bad.push([seed, y, id, a, b]); }
      T.G("S.pendingFollowup = null; S.currentEventId = null; $('choices').innerHTML = ''"); T.G('nextYear()');
    }
  }
  const T = makeCtx(); life(T, 30);
  const extreme = ["S.abil.str = NaN", "S.valis = Infinity", "S.level = 6; S.location.regionId = 'melen'", "S.job = 'guild_staff'", "S.flags.push('falna'); S.falnaState = 'active'", "S.age = 0; S.phase = 0", "S.age = 120; S.phase = 120"];
  for (const code of extreme) { T.G(code); const r = T.G('EVENTS.map(e => [e.id, match(e.cond, e), match(eventCondSnapshot(e.cond).snap, e)])'); for (const [id, a, b] of r) { cmp++; if (a !== b) bad.push(['extreme', code, id, a, b]); } }
  check('LK-11f 판정 ' + cmp + '회 비교, 불일치 0', bad.length === 0 && cmp > 10000, bad.slice(0, 5));
});
test('LK-11g/LUCK-18 undefined → 빈 null 프로토타입 스냅숏(기본 인자와 동치), null → 형식 위반(원본 match(null) 은 예외)', () => {
  const T = makeCtx(); life(T);
  check('LK-11g undefined', T.G('(() => { const r = eventCondSnapshot(undefined); return r.ok && Object.getPrototypeOf(r.snap) === null && Object.keys(r.snap).length === 0 && match(r.snap) === match(undefined); })()'));
  let threw = false; try { T.G('match(null)'); } catch (e) { threw = true; }
  check('LK-11h null → 형식 위반, 원본 match(null) 은 예외(의도적 불일치)', T.G('eventCondSnapshot(null).ok') === false && threw);
});

// ── LK-8 형식 위반 fail-closed(합성 주입) ──────────────────────────────────────────
const BADS = {
  'getter 최상위': "({ get cage() { __g++; return [0, 99]; } })",
  'getter 배열 원소': "({ cage: (() => { const a = [0, 99]; Object.defineProperty(a, 1, { get() { __g++; return 99; }, enumerable: true }); return a; })() })",
  'getter min 값': "({ min: (() => { const o = {}; Object.defineProperty(o, 'hp', { get() { __g++; return 1; }, enumerable: true }); return o; })() })",
  'Symbol 최상위': "({ cage: [0, 99], [Symbol('x')]: 1 })", 'Symbol 배열': "({ job: Object.assign(['x'], { [Symbol('s')]: 1 }) })",
  '상속 키(사용자 프로토타입)': "Object.create({ cage: [0, 99] })", '상속 min': "({ min: Object.create({ hp: 1 }) })",
  '비열거 최상위': "Object.defineProperty({ cage: [0, 99] }, 'job', { value: ['x'], enumerable: false })",
  '배열 구멍': "({ job: [, 'x'] })", '배열 추가 키': "({ job: Object.assign(['x'], { extra: 1 }) })", '배열 안 객체': "({ job: [{}] })", '배열 안 배열': "({ age: [[1], 2] })",
  '객체 안 객체': "({ min: { hp: {} } })", '객체 안 배열': "({ min: { hp: [1] } })", 'null 조건': 'null', '배열 조건': '[1]', '원시 조건': '5',
  '값 undefined': "({ job: undefined })", '값 함수': "({ job: function () {} })",
  '사용자 프로토타입 배열': "({ job: Object.setPrototypeOf(['x'], Object.create(Array.prototype)) })",
  'Proxy trap 예외': "new Proxy({ cage: [0, 99] }, { ownKeys() { throw new Error('trap'); } })",
  'Proxy 배열 trap 예외': "({ job: new Proxy(['x'], { getOwnPropertyDescriptor() { throw new Error('trap'); } }) })" };
test('LK-8a 형식 위반 사례 각각: eventCondSnapshot 거부 · getter 실행 0 · S·난수 불변', () => {
  for (const [name, code] of Object.entries(BADS)) {
    const T = makeCtx(); const s = life(T); T.G('var __g = 0'); const b = snap(s), c0 = T.calls();
    const r = T.G(`eventCondSnapshot(${code})`);
    check('LK-8a ' + name, r.ok === false && T.G('__g') === 0 && snap(s) === b && T.calls() === c0, r);
  }
});
test('LK-8b 다른 realm 의 배열·객체는 거부(LUCK-10, 지원 범위 = 같은 realm 정적 EVENTS)', () => {
  const T = makeCtx(); life(T); T.ctx.__outer = { cage: [0, 99] }; T.ctx.__outerArr = { job: vm.runInNewContext("['x']") };
  check('LK-8b', T.G('eventCondSnapshot(__outer).ok') === false && T.G('eventCondSnapshot(__outerArr).ok') === false);
});
test('LK-8c/LUCK-15 정상 배열(length 비열거)은 통과, 접근자 인덱스·length 이상은 거부', () => {
  const T = makeCtx(); life(T);
  check('LK-8c 정상 배열', T.G("eventCondSnapshot({ job: ['a', 'b'], age: [1, 2], flags: [] }).ok") === true);
  check('LK-8d 빈 배열 통과·스냅숏도 빈 새 배열', T.G("(() => { const a = []; const r = eventCondSnapshot({ flags: a }); return r.ok && Array.isArray(r.snap.flags) && r.snap.flags.length === 0 && r.snap.flags !== a; })()"));
  check('LK-8e 접근자 인덱스 거부', T.G("eventCondSnapshot({ job: (() => { const a = ['x']; Object.defineProperty(a, 0, { get() { return 'x'; } }); return a; })() }).ok") === false);
});
test('LK-8f 형식 위반 사건은 nextYear 후보가 되지 않고, 진단은 생애·사건당 1회(S 밖), 다음 생애에 다시 1회', () => {
  const T = makeCtx({ seed: 5 }); const s = life(T, 30); T.G('var __g = 0');
  T.G("EVENTS.push({ id: '__ec_bad', w: 1e9, text: 't', cond: { get cage() { __g++; return [0, 200]; } }, maxTimes: 999, cool: 0, choices: [{ label: 'a', text: 'aa', fx: {} }] })");
  T.G('var __shown = []; var __os = showEvent; showEvent = function (e) { __shown.push(e.id); return __os(e); }');
  for (let i = 0; i < 6 && !s.cause; i++) { T.G("S.pendingFollowup = null; S.currentEventId = null; $('choices').innerHTML = ''"); T.G('nextYear()'); }
  const d = fdiag(T, 'event_cond_malformed').filter(x => x.eventId === '__ec_bad');
  check('LK-8f 표시 0 · getter 0 · 진단 1(여러 해)', !T.G('__shown').includes('__ec_bad') && T.G('__g') === 0 && d.length === 1, { d: d.length });
  check('LK-8g 진단은 S·연표에 없음', !JSON.stringify(s).includes('event_cond_malformed'));
  T.G('startLife()'); for (let i = 0; i < 2; i++) { T.G("S.pendingFollowup = null; S.currentEventId = null; $('choices').innerHTML = ''"); T.G('nextYear()'); }
  check('LK-8h 새 생애에서 다시 1회', fdiag(T, 'event_cond_malformed').filter(x => x.eventId === '__ec_bad').length === 2);
});
test('LK-8i 형식 단계 자체는 메인 RNG 를 쓰지 않음(81개 × 100회 호출, 난수 0)', () => {
  const T = makeCtx(); life(T); const c0 = T.calls(); T.G('for (let i = 0; i < 100; i++) EVENTS.forEach(e => eventCondSnapshot(e.cond))');
  check('LK-8i', T.calls() === c0);
});

// ── LK-12 ⑩·⑫ 스냅숏 일관성(합성 패치: ⑩ 과 ⑫ 사이에 개입 지점을 둔다) ────────────────────
const BETWEEN = [['script.js', "const e = getRandomItemByWeight([...pool, { w: 5, none: true }], 'w');", "const e = getRandomItemByWeight([...pool, { w: 5, none: true }], 'w'); if (globalThis.__between) globalThis.__between(e);"]];
test('LK-12a ⑫ 는 ⑩ 의 같은 스냅숏을 씀: 사이에 원본 조건을 바꿔도 결과는 스냅숏 기준', () => {
  const T = makeCtx({ seed: 7, patch: BETWEEN }); const s = life(T, 30);
  T.G("EVENTS.push({ id: '__ec_ok', w: 1e9, text: 't', cond: { cage: [0, 200] }, maxTimes: 99, cool: 0, choices: [{ label: 'a', text: 'aa', fx: {} }] })");
  T.G("var __shown = []; var __os = showEvent; showEvent = function (e) { __shown.push(e.id); return __os(e); }; globalThis.__between = e => { if (e.id === '__ec_ok') EVENTS.find(x => x.id === '__ec_ok').cond.cage = [999, 999]; }");
  T.G('nextYear()');
  check('LK-12a 원본을 바꿔도 표시됨(⑫ 가 원본을 다시 읽지 않음)', T.G('__shown').includes('__ec_ok') && fdiag(T, 'event_recheck_failed').length === 0);
});
test('LK-12b 스냅숏 연결 누락 → ⑫ 재검사 실패(fail-closed), 표시 0', () => {
  const T = makeCtx({ seed: 7, patch: BETWEEN }); const s = life(T, 30);
  T.G("EVENTS.push({ id: '__ec_ok', w: 1e9, text: 't', cond: { cage: [0, 200] }, maxTimes: 99, cool: 0, choices: [{ label: 'a', text: 'aa', fx: {} }] })");
  T.G("var __shown = []; var __os = showEvent; showEvent = function (e) { __shown.push(e.id); return __os(e); }; globalThis.__between = e => { if (e.id === '__ec_ok') eventCondSnapByCand.delete(e); }");
  T.G('nextYear()');
  const d = fdiag(T, 'event_recheck_failed').filter(x => x.eventId === '__ec_ok');
  check('LK-12b', !T.G('__shown').includes('__ec_ok') && d.length >= 1 && d[0].part === 'cond', d);
});
test('LK-12c 후보 레코드는 매년 새 객체, 이전 해 스냅숏 재사용 없음, ⑩ 이후 상태 변화는 ⑫ 에 반영', () => {
  const T = makeCtx({ seed: 9, patch: BETWEEN }); const s = life(T, 30);
  // 합성 사건: cool 0 은 게임이 기본 2년으로 해석하고, 노화가 느린 종족은 1년에 육체 나이가 오르지 않을 수 있어 cool -1 로 쿨다운을 끈다.
  T.G("EVENTS.push({ id: '__ec_ok', w: 1e9, text: 't', cond: { cage: [0, 200], job: [S.job] }, maxTimes: 99, cool: -1, choices: [{ label: 'a', text: 'aa', fx: {} }] })");
  T.G("var __recs = []; globalThis.__between = e => { if (e.id === '__ec_ok') __recs.push([e, eventCondSnapByCand.get(e)]); }");
  for (let i = 0; i < 2; i++) { T.G("S.pendingFollowup = null; S.currentEventId = null; $('choices').innerHTML = ''"); T.G('nextYear()'); }
  const recs = T.G('__recs');
  check('LK-12c 해마다 다른 후보 레코드·다른 스냅숏 객체', recs.length === 2 && recs[0][0] !== recs[1][0] && recs[0][1] && recs[1][1] && recs[0][1] !== recs[1][1]);
  T.G("var __shown = []; var __os = showEvent; showEvent = function (e) { __shown.push(e.id); return __os(e); }; globalThis.__between = e => { if (e.id === '__ec_ok') S.job = '__changed__'; }");
  T.G("S.pendingFollowup = null; S.currentEventId = null; $('choices').innerHTML = ''"); T.G('nextYear()');
  check('LK-12d ⑩ 이후 상태 변화(직업)는 ⑫ 에서 반영 → 재검사 실패', !T.G('__shown').includes('__ec_ok') && fdiag(T, 'event_recheck_failed').some(x => x.eventId === '__ec_ok' && x.part === 'cond'));
  check('LK-12e 스냅숏은 S·사건 데이터에 저장되지 않음', !Object.keys(s).some(k => /snap/i.test(k)) && T.G("Object.keys(EVENTS.find(e => e.id === '__ec_ok')).join()") === 'id,w,text,cond,maxTimes,cool,choices');
});

// ── LK-S8·LUCK-16·LUCK-19 정적 검사 ───────────────────────────────────────────────
test('LK-S8/LUCK-16/LUCK-19 정적 검사', () => {
  const code = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  check('LK-S8a 게임 코드에 EVENTS 수정(대입·push·splice) 없음', !/EVENTS\s*=[^=]|EVENTS\.(push|splice|pop|shift|unshift)\(|EVENTS\[[^\]]+\]\s*=[^=]|\.cond\s*=[^=]/.test(code));
  const snapCalls = code.split('\n').filter(l => /eventCondSnapshot\(/.test(l) && !/function eventCondSnapshot/.test(l));
  check('LUCK-16 eventCondSnapshot 호출은 nextYear ⑩ 의 EVENTS 조건 1곳뿐', snapCalls.length === 1 && /eventCondSnapshot\(e\.cond\)/.test(snapCalls[0]), snapCalls);
  const showCalls = code.split('\n').filter(l => /\bshowEvent\(/.test(l) && !/function showEvent/.test(l));
  check('LUCK-19a showEvent 호출은 nextYear 의 후보 경로 1곳뿐', showCalls.length === 1 && /return showEvent\(e\)/.test(showCalls[0]), showCalls);
  const ny = code.slice(code.indexOf('function nextYear'), code.indexOf('function nextYear') + 6000);
  const iPick = ny.indexOf('getRandomItemByWeight([...pool'), iRe = ny.indexOf('eventCondSnapByCand.get(e)'), iShow = ny.indexOf('return showEvent(e)');
  check('LUCK-19b 순서: ⑩ 후보 추첨 → ⑫ 스냅숏 재검사 → showEvent', iPick > 0 && iRe > iPick && iShow > iRe);
  check('LUCK-19c ⑫ 재검사는 원본 e.cond 를 읽지 않음', !/match\(e\.cond/.test(ny));
});

R.finish('eventcond_test');
