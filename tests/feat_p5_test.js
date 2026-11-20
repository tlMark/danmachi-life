// F1D4A P5 D-FEAT(의도적 변경 ③) 시험. 설계: r3.20 D-FEAT §3·§4·§5, 사용자 승인 "P5 D-FEAT 구현 착수 승인 및 FD-1 범위 확정".
// 구현 범위(가능분): DF-1, DF-2[0], DF-3, DF-5, DF-6(ritual), DF-6b(soldier_patrol). events.js 데이터만 바뀐다.
// 보류(이 시험은 "추가되지 않았음"만 확인): city_disaster[2](U10·W4), DF-K1 daedalus_orb[0], DF-4 legend_clash[1] 문구.
// 시험 구분
//   FD-1 (정적) 원래 범위 전부 유지. 검사기 자체는 합성 픽스처로 검증하고(합성), 실제 데이터 대상(city_disaster[2]·복제본)은
//        EVENTS 에 없으므로 BLOCKED 로 기록한다(통과로 세지 않음).
//   FD-3 팔나 상태 4종(none/active/unbound/sealed)은 플래그·소속·이력으로 직접 구성한 합성 상태이며, 표시·선택은 실제 EVENTS·showEvent·choose 를 쓴다.
//   FD-5 같은 난수에서 원본(f63c851 의 ritual·soldier_patrol 선택지)과 같은 라벨·같은 결과가 나오는지. 원본은 현재 events.js 에
//        되돌림 패치를 적용한 별도 컨텍스트이며, 자동 진행 R2(scheduleAuto 타이머)를 실제로 실행한다.
//   FD-6 (정적) 위업 지급 표 전후 대조(f63c851 23갈래/20사건 → 16갈래).
//   FD-2·FD-4 는 r3.20 계획대로 city_disaster[2] 확정 뒤 진행(이 파일에서 실행하지 않음 → 보고서에 NOT RUN).
//   FD-7(48k 전후 비교)은 이 파일 밖(run48k)에서 한다.
// 사용: node tests/feat_p5_test.js — FAIL 1건 이상이면 종료 코드 1. BLOCKED 는 실패도 통과도 아니며 따로 센다.
const { makeCtx, makeReporter, setAge, snap } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;
const blocked = [];
const block = (id, why) => { blocked.push('BLOCKED ' + id + ' — ' + why); };

const ORIG_LABELS = { ritual: ['정면으로 싸운다', '몰래 빠져나간다'], soldier_patrol: ['정찰을 보내 상황을 확인한다', '부대를 이끌고 길목을 지킨다'] };
const PAIR_AT = { ritual: 0, soldier_patrol: 1 };      // 복제 쌍의 팔나판 데이터 인덱스(비팔나판은 +1)
const ORIG_OK_FX = { ritual: { power: 15, flags: ['warrior'], feat: 1 }, soldier_patrol: { power: 4, feat: 1 } };
const STATES = ['none', 'active', 'unbound', 'sealed'];
const E = (T, id) => T.G('EVENTS').find(e => e.id === id);
const J = v => JSON.stringify(v);

// 합성 상태 주입: 팔나 상태를 플래그·소속·이력으로 직접 구성(D-FEAT §4.4 표). 실제 생애에서 도달한 상태가 아님.
function life(T, st, { age = 20, job } = {}) {
  T.G('startLife()'); const s = T.S(); setAge(s, age); s.hp = 100; s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''");
  s.flags = s.flags.filter(f => f !== 'falna'); s.familia = null; s.falnaHistory = []; s.falnaHolder = null;
  const fam = T.G('gachaData.familias[0]');
  if (st === 'active') { s.flags.push('falna'); s.familia = fam; s.falnaHistory.push({ familiaId: fam.id, at: 15, membershipIndex: 0 }); s.falnaHolder = fam.id; }
  if (st === 'unbound') { s.flags.push('falna'); s.falnaHistory.push({ familiaId: fam.id, at: 15, membershipIndex: 0 }); }
  if (st === 'sealed') { s.falnaHistory.push({ familiaId: fam.id, at: 15, membershipIndex: 0 }); }
  s.falnaState = st;
  if (job) s.job = job;
  return s;
}

// ── FD-1 정적 검사기(D-FEAT §3.3 그대로) ─────────────────────────────────────────────
// 대상: 위험 구조 선택지([2] 와 그 팔나·비팔나 복제본). 반환 { ok, reasons, D }.
function fd1Check(ch) {
  const reasons = [];
  if (!ch || typeof ch !== 'object') return { ok: false, reasons: ['choice_not_object'], D: null };
  const c = ch.chance;
  if (!c || typeof c !== 'object' || !c.ok || !c.fail) return { ok: false, reasons: ['no_chance_branches'], D: null };
  const losses = [];
  for (const [name, br] of [['ok', c.ok], ['fail', c.fail]]) {
    const fx = (br && br.fx) || {};
    if (typeof fx !== 'object') { reasons.push(name + ':fx_not_object'); continue; }
    if (Object.prototype.hasOwnProperty.call(fx, 'die')) reasons.push(name + ':die_present');
    if (Object.prototype.hasOwnProperty.call(fx, 'getItem')) reasons.push(name + ':getItem_present');   // hpCap 에 영향을 줄 수 있음
    if (!Object.prototype.hasOwnProperty.call(fx, 'hp')) { losses.push(0); continue; }               // 키 없음 = 감소량 0(키가 없을 때만)
    const v = fx.hp;
    if (typeof v !== 'number' || !Number.isFinite(v)) { reasons.push(name + ':hp_not_finite_number'); continue; }   // 숫자 문자열·NaN·±Infinity·null·undefined·객체·배열 거부
    losses.push(Math.max(0, -v));   // 현재 hp 를 바꾸는 키는 hp 하나뿐이라 누적 = 이 값
  }
  if (reasons.length) return { ok: false, reasons, D: null };
  const D = Math.max(...losses);
  if (!(Number.isFinite(D) && Number.isInteger(D) && D >= 0)) reasons.push('D_not_nonneg_integer');
  if (!Number.isSafeInteger(D + 1)) reasons.push('D_plus_1_not_safe_integer');
  const cond = Object.prototype.hasOwnProperty.call(ch, 'cond') ? ch.cond : undefined;
  const mh = cond && cond.min && typeof cond.min === 'object' && Object.prototype.hasOwnProperty.call(cond.min, 'hp') ? cond.min.hp : undefined;
  if (typeof mh !== 'number' || !Number.isFinite(mh)) reasons.push('min_hp_not_finite_number');
  else if (mh !== D + 1) reasons.push('min_hp_not_D_plus_1');
  return { ok: reasons.length === 0, reasons, D };
}

test('FD-1 검사기 자체 — 합성 픽스처(실제 데이터 아님)', () => {
  const mk = (failFx, okFx = { feat: 1 }, cond = { min: { hp: 16 } }) => ({ label: 'x', cond, chance: { p: .5, ok: { text: 'o', fx: okFx }, fail: { text: 'f', fx: failFx } } });
  let r = fd1Check(mk({ hp: -15 }));
  check('FD-1s-01 정상(D=15, min.hp 16) → 통과', r.ok && r.D === 15, r);
  r = fd1Check(mk({}, { feat: 1 }, { min: { hp: 1 } }));
  check('FD-1s-02 피해 없음(D=0, min.hp 1) → 통과', r.ok && r.D === 0, r);
  r = fd1Check(mk({ hp: -15 }, { hp: 5, feat: 1 }));
  check('FD-1s-03 ok 회복(+5)·fail −15 → D=15 통과', r.ok && r.D === 15, r);
  r = fd1Check(mk({ hp: -15 }, { hp: -20 }, { min: { hp: 21 } }));
  check('FD-1s-04 두 갈래 중 최댓값(D=20, min.hp 21) → 통과', r.ok && r.D === 20, r);
  const bad = [
    ['05 fail.hp 숫자 문자열 "-50"', mk({ hp: '-50' }, { feat: 1 }, { min: { hp: 51 } }), 'fail:hp_not_finite_number'],
    ['06 fail.hp NaN', mk({ hp: NaN }), 'fail:hp_not_finite_number'],
    ['07 fail.hp Infinity', mk({ hp: Infinity }), 'fail:hp_not_finite_number'],
    ['08 fail.hp -Infinity', mk({ hp: -Infinity }), 'fail:hp_not_finite_number'],
    ['09 fail.hp null', mk({ hp: null }), 'fail:hp_not_finite_number'],
    ['10 fail.hp 키 있음·값 undefined', mk({ hp: undefined }), 'fail:hp_not_finite_number'],
    ['11 fail.hp 객체', mk({ hp: {} }), 'fail:hp_not_finite_number'],
    ['12 fail.hp 배열', mk({ hp: [-15] }), 'fail:hp_not_finite_number'],
    ['13 ok.hp 문자열', mk({ hp: -15 }, { hp: '5' }), 'ok:hp_not_finite_number'],
    ['14 D 비정수(−7.5)', mk({ hp: -7.5 }, { feat: 1 }, { min: { hp: 8.5 } }), 'D_not_nonneg_integer'],
    ['15 D+1 비안전 정수', mk({ hp: -Number.MAX_SAFE_INTEGER }, { feat: 1 }, { min: { hp: Number.MAX_SAFE_INTEGER + 1 } }), 'D_plus_1_not_safe_integer'],
    ['16 min.hp ≠ D+1(15)', mk({ hp: -15 }, { feat: 1 }, { min: { hp: 15 } }), 'min_hp_not_D_plus_1'],
    ['17 min.hp 문자열 "16"', mk({ hp: -15 }, { feat: 1 }, { min: { hp: '16' } }), 'min_hp_not_finite_number'],
    ['18 min.hp NaN', mk({ hp: -15 }, { feat: 1 }, { min: { hp: NaN } }), 'min_hp_not_finite_number'],
    ['19 min.hp Infinity', mk({ hp: -15 }, { feat: 1 }, { min: { hp: Infinity } }), 'min_hp_not_finite_number'],
    ['20 cond 없음', (() => { const c = mk({ hp: -15 }); delete c.cond; return c; })(), 'min_hp_not_finite_number'],
    ['21 min 없음', mk({ hp: -15 }, { feat: 1 }, { flags: ['falna'] }), 'min_hp_not_finite_number'],
    ['22 fail 에 die', mk({ hp: -15, die: true }), 'fail:die_present'],
    ['23 ok 에 die(false 값이라도 키 존재)', mk({ hp: -15 }, { die: false }), 'ok:die_present'],
    ['24 ok 에 getItem', mk({ hp: -15 }, { getItem: 'potion' }), 'ok:getItem_present'],
    ['25 chance 없음', { label: 'x', cond: { min: { hp: 1 } }, fx: { hp: 0 } }, 'no_chance_branches'],
  ];
  for (const [name, ch, want] of bad) { const x = fd1Check(ch); check('FD-1s-' + name + ' → 실패(' + want + ')', !x.ok && x.reasons.includes(want), x); }
});

test('FD-1 실제 데이터 대상 — city_disaster[2]·팔나/비팔나 복제본', () => {
  const T = makeCtx(); const cd = E(T, 'city_disaster');
  check('FD-1r-01 city_disaster 선택지는 기존 2개 그대로([2] 임의 추가 없음, U10·W4 미결)', cd.choices.length === 2 && cd.choices[0].label === '이웃을 대피시키는 일을 돕는다' && cd.choices[1].label === '안전한 곳으로 피신한다');
  const targets = cd.choices.slice(2);
  if (targets.length === 0) {
    block('FD-1r-02 city_disaster[2]·[3] 형식(fx.hp 숫자형·유한)', '대상 선택지가 EVENTS 에 없음(U10·W4 보류). 검사기는 FD-1s 로 준비됨');
    block('FD-1r-03 city_disaster[2]·[3] D·D+1 유한 정수', '같은 이유');
    block('FD-1r-04 city_disaster[2]·[3] cond.min.hp 숫자형·유한·= D+1', '같은 이유');
    block('FD-1r-05 city_disaster[2]·[3] die·getItem 없음', '같은 이유');
    block('FD-1r-06 팔나판·비팔나판 두 복제본의 D·min.hp 동일', '같은 이유');
  } else {
    targets.forEach((ch, i) => { const x = fd1Check(ch); check('FD-1r-' + (i + 2) + ' city_disaster[' + (i + 2) + ']', x.ok, x); });
  }
});

// ── FD-3 복제 쌍: 배타·전체 덮음·상태별 정확히 1개 ─────────────────────────────────────
test('FD-3 정적: 복제 쌍 구조(조건 배타·라벨·확률·실패 같음·비팔나판 ok 에서 feat 만 뺌)', () => {
  const T = makeCtx();
  for (const id of ['ritual', 'soldier_patrol']) {
    const e = E(T, id), i = PAIR_AT[id], a = e.choices[i], b = e.choices[i + 1];
    check(`FD-3s ${id} 선택지 수 = 원본 + 1`, e.choices.length === ORIG_LABELS[id].length + 1);
    check(`FD-3s ${id} 팔나판 cond = {flags:['falna']} · 비팔나판 cond = {noFlags:['falna']}(그 밖의 키 없음)`, J(a.cond) === '{"flags":["falna"]}' && J(b.cond) === '{"noFlags":["falna"]}');
    check(`FD-3s ${id} 라벨 같음`, a.label === b.label && a.label === ORIG_LABELS[id][PAIR_AT[id]]);
    const pa = { ...a.chance }, pb = { ...b.chance }; delete pa.ok; delete pa.fail; delete pb.ok; delete pb.fail;
    check(`FD-3s ${id} 확률(p·stat·per) 같음`, J(pa) === J(pb), [pa, pb]);
    check(`FD-3s ${id} 실패 갈래 같음`, J(a.chance.fail) === J(b.chance.fail));
    check(`FD-3s ${id} 성공 문구 같음`, a.chance.ok.text === b.chance.ok.text);
    check(`FD-3s ${id} 팔나판 ok.fx = 원본 그대로`, J(a.chance.ok.fx) === J(ORIG_OK_FX[id]), a.chance.ok.fx);
    const noFeat = { ...ORIG_OK_FX[id] }; delete noFeat.feat;
    check(`FD-3s ${id} 비팔나판 ok.fx = 원본 − feat`, J(b.chance.ok.fx) === J(noFeat) && !('feat' in b.chance.ok.fx), b.chance.ok.fx);
    check(`FD-3s ${id} 조건 형식 검사 통과(choiceCondValid)`, T.G(`choiceCondValid(${J(a.cond)})`) === true && T.G(`choiceCondValid(${J(b.cond)})`) === true);
    // 배타·전체 덮음: falna 플래그 있음/없음 두 경우가 전부
    const s = life(T, 'none');
    for (const has of [false, true]) {
      s.flags = s.flags.filter(f => f !== 'falna'); if (has) s.flags.push('falna');
      const va = T.G(`choiceMatch(${J(a.cond)})`), vb = T.G(`choiceMatch(${J(b.cond)})`);
      check(`FD-3s ${id} falna=${has} → 정확히 하나만 참(팔나판=${has})`, va !== vb && va === has);
    }
  }
  const cd = E(T, 'city_disaster');
  check('FD-3s city_disaster 선택지에 복제 조건 없음(보류 [2] 미추가)', cd.choices.every(c => !('cond' in c)));
  block('FD-3 city_disaster [2]·[3] 복제 쌍', '[2] 가 보류(U10·W4)라 복제 대상이 없음');
});

test('FD-3 동적: 4 상태 × ritual·soldier_patrol — 보이는 복제본 정확히 1개, deriveFalnaState·hasFalna 일치, 버튼 순서 = 원본', () => {
  for (const st of STATES) for (const id of ['ritual', 'soldier_patrol']) {
    const T = makeCtx(); const s = life(T, st, { job: id === 'soldier_patrol' ? 'soldier' : undefined });
    const derived = T.G('deriveFalnaState()'), hf = T.G('hasFalna()');
    check(`FD-3d ${st}/${id} 합성 상태의 deriveFalnaState = ${st}`, derived === st, derived);
    const e = E(T, id), i = PAIR_AT[id];
    const vis = T.G(`visibleChoices(EVENTS.find(e => e.id === '${id}'))`);
    const hasA = vis.includes(e.choices[i]), hasB = vis.includes(e.choices[i + 1]);
    check(`FD-3d ${st}/${id} 복제본 중 정확히 1개 표시`, hasA !== hasB, { hasA, hasB });
    check(`FD-3d ${st}/${id} 보이는 쪽 = ${hf ? '팔나판' : '비팔나판'}(hasFalna=${hf}, §4.4 표: ${st === 'active' || st === 'unbound' ? '팔나판' : '비팔나판'})`, hasA === hf && hf === (st === 'active' || st === 'unbound'));
    check(`FD-3d ${st}/${id} 보이는 라벨 배열 = 원본`, J(vis.map(c => c.label)) === J(ORIG_LABELS[id]), vis.map(c => c.label));
    T.G(`showEvent(EVENTS.find(e => e.id === '${id}'))`);
    check(`FD-3d ${st}/${id} showEvent 버튼 = 원본 라벨·순서`, J(T.buttons().map(b => b.textContent)) === J(ORIG_LABELS[id]));
    // 숨은 복제본 직접 호출 거부(상태·난수 불변)
    const hidden = hasA ? i + 1 : i;
    const b0 = snap(s, ['currentEventId']), c0 = T.calls(), d0 = T.G("followupDiagLog.filter(d => d.event === 'hidden_choice_rejected').length");
    T.G(`S.currentEventId = '${id}'; choose(EVENTS.find(e => e.id === '${id}').choices[${hidden}])`);
    check(`FD-3d ${st}/${id} 숨은 복제본 [${hidden}] 직접 호출 → hidden_choice_rejected, 상태·난수 불변`,
      T.G("followupDiagLog.filter(d => d.event === 'hidden_choice_rejected').length") === d0 + 1 && snap(s, ['currentEventId']) === b0 && T.calls() === c0);
  }
});

// ── FD-5 R2 매핑: 같은 난수 → 원본과 같은 라벨·같은 결과 ─────────────────────────────────
// 원본 = 현재 events.js 에 되돌림 패치(복제 쌍 → f63c851 의 단일 선택지). 패치 문자열이 맞지 않으면 makeCtx 가 예외를 던져 시험이 실패한다.
const RITUAL_NEW = `        // P5 DF-6(P-1): 팔나판(앞)·비팔나판 복제. 라벨·확률·실패 같음, 비팔나판 ok 에서 feat 만 뺌. 데이터 인덱스: 몰래 빠져나간다 [1]→[2]
        { label: '정면으로 싸운다', cond: { flags: ['falna'] }, chance: { p: .5, stat: 'power', per: .005, ok: { text: '살아남아 전사로 인정받았다.', fx: { power: 15, flags: ['warrior'], feat: 1 } }, fail: { text: '싸움에서 목숨을 잃었다.', fx: { die: true } } } },
        { label: '정면으로 싸운다', cond: { noFlags: ['falna'] }, chance: { p: .5, stat: 'power', per: .005, ok: { text: '살아남아 전사로 인정받았다.', fx: { power: 15, flags: ['warrior'] } }, fail: { text: '싸움에서 목숨을 잃었다.', fx: { die: true } } } },
`;
const RITUAL_ORIG = `        { label: '정면으로 싸운다', chance: { p: .5, stat: 'power', per: .005, ok: { text: '살아남아 전사로 인정받았다.', fx: { power: 15, flags: ['warrior'], feat: 1 } }, fail: { text: '싸움에서 목숨을 잃었다.', fx: { die: true } } } },
`;
const PATROL_NEW = `        // P5 DF-6b(P-1): 팔나판(앞)·비팔나판 복제. 데이터 인덱스: 길목을 지킨다 [1]→[1](팔나)·[2](비팔나)
        { label: '부대를 이끌고 길목을 지킨다', cond: { flags: ['falna'] }, chance: { p: 0.6, stat: 'power', per: 0.002, ok: { text: '침착한 지휘로 경계를 마쳤다.', fx: { power: 4, feat: 1 } }, fail: { text: '작은 교전에서 부상을 입었다.', fx: { hp: -18 } } } },
        { label: '부대를 이끌고 길목을 지킨다', cond: { noFlags: ['falna'] }, chance: { p: 0.6, stat: 'power', per: 0.002, ok: { text: '침착한 지휘로 경계를 마쳤다.', fx: { power: 4 } }, fail: { text: '작은 교전에서 부상을 입었다.', fx: { hp: -18 } } } }
`;
const PATROL_ORIG = `        { label: '부대를 이끌고 길목을 지킨다', chance: { p: 0.6, stat: 'power', per: 0.002, ok: { text: '침착한 지휘로 경계를 마쳤다.', fx: { power: 4, feat: 1 } }, fail: { text: '작은 교전에서 부상을 입었다.', fx: { hp: -18 } } } }
`;
const ORIG_PATCH = [['events.js', RITUAL_NEW, RITUAL_ORIG], ['events.js', PATROL_NEW, PATROL_ORIG]];

function r2Run(orig, st, id, v) {
  const T = makeCtx({ timers: 'queue', patch: orig ? ORIG_PATCH : [] });
  const s = life(T, st, { job: id === 'soldier_patrol' ? 'soldier' : undefined });
  T.G("$('auto').checked = true; $('log').kids.length = 0");
  T.timers.length = 0;
  T.G(`showEvent(EVENTS.find(e => e.id === '${id}'))`);
  const labels = T.buttons().map(b => b.textContent);
  const ti = T.timers.findIndex(t => t.ms === 800);
  if (ti < 0) throw new Error('R2 자동 진행 타이머 없음');
  T.G(`var __rn = 0, __mr = Math.random; Math.random = () => { __rn++; return ${v}; }`);
  try { T.runTimer(ti); } finally { T.G('Math.random = __mr'); }
  const log = T.el('log').kids.map(k => k.html + '|' + k.textContent + '|' + k.className);
  return { labels, picked: labels[Math.floor(v * labels.length)], rn: T.G('__rn'), log, feat: s.feat, snapNoFeat: snap(s, ['feat']), choicesLeft: T.buttons().length };
}

test('FD-5 R2 매핑(자동 진행 실제 실행): 4 상태 × 2 사건 × 난수 21개 — 원본과 같은 라벨·결과 문구·난수 호출 수·상태(feat 제외)', () => {
  const VS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.4999, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.9999];
  for (const st of STATES) for (const id of ['ritual', 'soldier_patrol']) {
    let same = 0, featOk = 0; const bad = [];
    for (const v of VS) {
      const a = r2Run(true, st, id, v), b = r2Run(false, st, id, v);
      const okEq = J(a.labels) === J(b.labels) && a.picked === b.picked && a.rn === b.rn && J(a.log) === J(b.log) && a.snapNoFeat === b.snapNoFeat;
      if (okEq && a.log.length >= 2) same++; else bad.push({ v, a: [a.labels, a.picked, a.rn, a.log.slice(-2)], b: [b.labels, b.picked, b.rn, b.log.slice(-2)] });
      // feat 차이: 팔나 상태(active·unbound)는 0, 비팔나 상태(none·sealed)는 복제 쌍의 성공 갈래를 탔을 때만 원본보다 1 작다
      const fal = st === 'active' || st === 'unbound';
      const tookPairOk = a.picked === ORIG_LABELS[id][PAIR_AT[id]] && a.log.some(t => String(t).includes(id === 'ritual' ? '살아남아 전사로 인정받았다.' : '침착한 지휘로 경계를 마쳤다.'));
      const want = fal ? 0 : (tookPairOk ? 1 : 0);
      if (a.feat - b.feat === want) featOk++; else bad.push({ v, featDiff: a.feat - b.feat, want });
    }
    check(`FD-5 ${st}/${id} 같은 결과 ${same}/${VS.length}`, same === VS.length, bad.slice(0, 2));
    check(`FD-5 ${st}/${id} feat 차이 = 의도(팔나 0 / 비팔나 성공 시 1) ${featOk}/${VS.length}`, featOk === VS.length, bad.slice(0, 2));
  }
});

// ── FD-6 위업 지급 표 전후 대조(정적) ─────────────────────────────────────────────────
const FEAT_BEFORE = ['dive1[1].ok=1', 'minotaur[1].ok=2', 'expedition[0].ok=2', 'ritual[0].ok=1', 'wargame[0].ok=1', 'high_excelia[0].ok=3', 'guild_advisor[1].ok=1',
  'encounter_goliath[0].ok=3', 'encounter_goliath[1].fx=-2', 'find_grimoire[0].fx=5', 'daedalus_orb[0].ok=4', 'daedalus_orb[1].fx=1', 'city_disaster[0].fx=1', 'mentor[0].fx=1',
  'soldier_patrol[1].ok=1', 'lost_child[0].fx=1', 'community_role[0].fx=1', 'floor_boss_upper[0].ok=1', 'mid_floor_expedition[0].ok=2', 'deep_floor_survey[0].ok=3',
  'floor_lord_hunt[0].ok=4', 'legend_clash[0].ok=5', 'legend_clash[1].fx=1'];   // f63c851: 23갈래·20사건
const FEAT_AFTER = ['dive1[1].ok=1', 'minotaur[1].ok=2', 'expedition[0].ok=2', 'ritual[0].ok{falna}=1', 'wargame[0].ok=1', 'high_excelia[0].ok=3', 'guild_advisor[1].ok=1',
  'encounter_goliath[0].ok=3', 'daedalus_orb[0].ok=4', 'soldier_patrol[1].ok{falna}=1', 'floor_boss_upper[0].ok=1', 'mid_floor_expedition[0].ok=2', 'deep_floor_survey[0].ok=3',
  'floor_lord_hunt[0].ok=4', 'legend_clash[0].ok=5', 'legend_clash[1].fx=1'];
// 바뀐 7개 선택지의 f63c851 효과(feat 제외 나머지가 그대로인지 확인)
const CHANGED_BEFORE = {
  'lost_child[0]': { bond: 5, feat: 1 }, 'mentor[0]': { power: 5, bond: 4, feat: 1 }, 'community_role[0]': { bond: 5, valis: 500, feat: 1 },
  'city_disaster[0]': { hp: -8, bond: 5, feat: 1 }, 'find_grimoire[0]': { feat: 5, flags: ['magic_user'], getItem: 'grimoire' },
  'daedalus_orb[1]': { valis: 15000, feat: 1 }, 'encounter_goliath[1]': { hp: -10, feat: -2 } };

test('FD-6 위업 지급 표 정적 전후 대조', () => {
  const T = makeCtx(); const ev = T.G('EVENTS'); const now = [];
  ev.forEach(e => e.choices.forEach((c, i) => {
    const br = [['fx', c.fx]]; if (c.chance) br.push(['ok', c.chance.ok && c.chance.ok.fx], ['fail', c.chance.fail && c.chance.fail.fx]);
    br.forEach(([b, fx]) => { if (fx && 'feat' in fx) now.push(`${e.id}[${i}].${b}${c.cond && c.cond.flags ? '{' + c.cond.flags.join() + '}' : ''}=${fx.feat}`); });
  }));
  check('FD-6a 현재 위업 지급 표 = 승인안(16갈래)', J(now) === J(FEAT_AFTER), now);
  const removed = FEAT_BEFORE.filter(x => !FEAT_AFTER.includes(x.replace('ritual[0].ok', 'ritual[0].ok{falna}').replace('soldier_patrol[1].ok', 'soldier_patrol[1].ok{falna}')));
  check('FD-6b 전→후 제거 7갈래 = DF-1·DF-2[0]·DF-3·DF-5', J(removed) === J(['encounter_goliath[1].fx=-2', 'find_grimoire[0].fx=5', 'daedalus_orb[1].fx=1', 'city_disaster[0].fx=1', 'mentor[0].fx=1', 'lost_child[0].fx=1', 'community_role[0].fx=1']), removed);
  check('FD-6c 증가·값 변경 0건(새 feat 지급 없음)', now.every(x => FEAT_BEFORE.includes(x.replace('{falna}', ''))));
  for (const [k, fx] of Object.entries(CHANGED_BEFORE)) {
    const [, id, i] = k.match(/^(\w+)\[(\d+)\]$/); const cur = ev.find(e => e.id === id).choices[+i];
    const want = { ...fx }; delete want.feat;
    check(`FD-6d ${k} feat 외 효과 그대로·feat 키 없음·라벨 그대로·cond 없음`, J(cur.fx) === J(want) && !('feat' in cur.fx) && !('cond' in cur), cur.fx);
  }
  // DF-3: 아이템 정의(data.js)는 바꾸지 않음 — grimoire 의 fx.feat 는 획득 즉시 소비 표지(core/items.js acquire)이며 적용되지 않는다
  check('FD-6e grimoire 아이템 정의 그대로(data.js 무변경)', J(T.G("gachaData.items.find(x => x.id === 'grimoire')")) === J({ id: 'grimoire', label: '그리므와르', type: 'consumable', desc: '읽는 것만으로 마법을 각성시켜 주는 초희귀 마도서.', fx: { feat: 5, flags: ['magic_user'] }, maxUses: 1 }));
  // 보류 항목 무변경
  const dor = ev.find(e => e.id === 'daedalus_orb').choices[0], lc = ev.find(e => e.id === 'legend_clash').choices[1];
  check('FD-6f 보류 DF-K1 daedalus_orb[0] ok feat 4 그대로', dor.chance.ok.fx.feat === 4 && J(dor.chance.ok.fx) === '{"valis":50000,"feat":4}');
  check('FD-6g 보류 DF-4 legend_clash[1] 효과 그대로', J(lc.fx) === '{"power":6,"feat":1,"bond":6}', lc.fx);
});

// ── 실제 경로 확인: 바뀐 선택지를 실제 choose 로 고르면 feat 가 오르지 않음(합성 상태, 실제 데이터·실제 apply) ──────
test('DF 적용 경로: 바뀐 선택지 선택 시 feat 증가 0·그 밖의 효과는 적용', () => {
  const cases = [['lost_child', 0, { bond: 5 }], ['mentor', 0, { bond: 4 }], ['community_role', 0, { bond: 5, valis: 500 }], ['city_disaster', 0, { bond: 5, hp: -8 }],
    ['daedalus_orb', 1, { valis: 15000 }], ['encounter_goliath', 1, { hp: -10 }], ['find_grimoire', 0, {}]];
  for (const [id, i, d] of cases) {
    const T = makeCtx(); const s = life(T, 'active', { age: 30, job: 'adventurer' }); s.feat = 3; s.bond = 20; s.valis = 1000; s.hp = 90;
    const b = { feat: s.feat, bond: s.bond, valis: s.valis, hp: s.hp };
    T.G(`S.currentEventId = '${id}'; choose(EVENTS.find(e => e.id === '${id}').choices[${i}])`);
    const ok = s.feat === b.feat && Object.entries(d).every(([k, v]) => s[k] === b[k] + v);
    check(`DF ${id}[${i}] feat ${b.feat}→${s.feat}(불변), 나머지 효과 적용`, ok, { before: b, after: { feat: s.feat, bond: s.bond, valis: s.valis, hp: s.hp } });
    if (id === 'find_grimoire') check('DF find_grimoire[0] magic_user 플래그·grimoire 소비 기록 유지', s.flags.includes('magic_user') && s.itemsConsumed.includes('grimoire') && !s.items.includes('grimoire'));
  }
});

R.finish('feat_p5_test');
console.log(blocked.join('\n'));
console.log(`BLOCKED: ${blocked.length} (통과로 세지 않음)`);
