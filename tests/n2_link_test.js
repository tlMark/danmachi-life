// F1D4A N2(2-ii) — 팔나 연결 시험(REVIEW v27 §4.2c~§4.2e·§4.2v ③~⑨, 사용자 결정 2026-11-23).
// 사용: node tests/n2_link_test.js [기준 사본 폴더(406a03b, 선택)]   (실패 1건 이상이면 종료 코드 1)
// 모든 사례는 [합성 상태 주입]이다. 관문을 켠 사례(N2_GATES.*=true)는 시험 전용 설정이며 게임 기본값은 꺼짐이다(활성화 승인 전).
// PATRON_ABSENCE_REASONS 는 게임에서 비어 있다(값 미결정). 정상 부재 객체가 필요한 사례만 격리 사본에 시험용 값 'test_reason' 을 주입한다.
'use strict';
const fs = require('fs'), path = require('path');
const { makeCtx, makeReporter, snap } = require('./lib_f1_ctx');
const { check, test, finish } = makeReporter();
const BASE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const REASON_PATCH = ['script.js', 'const PATRON_ABSENCE_REASONS = Object.freeze([]);', "const PATRON_ABSENCE_REASONS = Object.freeze(['test_reason']);"];
const ctx = (o = {}) => { const T = makeCtx({ seed: o.seed, root: o.root, patch: o.reasons ? [REASON_PATCH] : [] }); T.G('startLife()'); return T; };
const fam = (T, id) => T.G('gachaData').familias.find(f => f.id === id);
function activeMember(T, familiaId = 'loki') {
  const s = T.S();
  s.age = 25; s.chronologicalAge = 25; s.phase = 25; s.physicalAge = 25;
  s.familia = fam(T, familiaId);
  s.familiaHistory = [{ id: 1, familiaId, label: s.familia.label, joinedAt: 15, leftAt: null, leftReason: null, role: 'member', falnaAt: 15 }];
  s.nextMembershipId = 2;
  s.flags = s.flags.filter(f => !['falna', 'adventurer', 'supporter'].includes(f)).concat(['falna']);
  T.G("setJob('adventurer')");
  s.falnaHistory = [{ familiaId, at: 15, membershipIndex: 0 }]; s.level = Math.max(1, s.level); s.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }];
  s.falnaTransitions = []; s.conversionPending = null; s.syncBaseline = null; s.currentEventId = null; s.potential = 0;
  s.falnaState = T.G('deriveFalnaState()'); s.falnaHolder = T.G('deriveFalnaHolder()');
  return s;
}
const toUnbound = (T, s) => { T.G('apply({ dropFamilia: true })'); return s; };
const abilSum = s => Object.values(s.abil).reduce((a, b) => a + b, 0);
// convertExp 호출 기록(CV-1·CV-5): 호출 시점의 상태를 남긴다
const spyConvert = T => T.G(`globalThis.__cv = []; { const o = convertExp; convertExp = function () {
  __cv.push({ resume: S.statusResumeAge, state: deriveFalnaState(), fam: S.familia ? S.familia.id : null, holder: deriveFalnaHolder(), absence: S.patronAbsence, ex0: S.excelia, lv0: S.level, feat0: S.feat, abil0: JSON.stringify(S.abil), lh0: (S.levelHistory || []).length });
  const r = o.apply(this, arguments); const e = __cv[__cv.length - 1]; e.ex1 = S.excelia; e.lv1 = S.level; e.feat1 = S.feat; e.abil1 = JSON.stringify(S.abil); e.lh1 = (S.levelHistory || []).length; return r; }; }`);

// ── 관문 기본값과 결과 보존 ──
test('N2-G0 관문 기본값 꺼짐(활성화 승인 전)', () => {
  const T = ctx();
  check('N2-G0 N2_GATES.growth === false·dungeon === false', T.G('N2_GATES.growth') === false && T.G('N2_GATES.dungeon') === false);
  check('N2-G0 PATRON_ABSENCE_REASONS 빈 목록(값 미결정)', T.G('PATRON_ABSENCE_REASONS.length') === 0);
  check('N2-G0 startLife: statusResumeAge·patronAbsence = null', T.S().statusResumeAge === null && T.S().patronAbsence === null);
});
// ── N2-1 (나): 적립 유지, 변환·레벨업 관문(G-2) ──
test('G-2 unbound: 관문 꺼짐이면 현행 변환, 켜면 적립만', () => {
  for (const on of [false, true]) {
    const T = ctx(); const s = activeMember(T); toUnbound(T, s); T.G(`N2_GATES.growth = ${on}`);
    s.excelia = 400; const a0 = abilSum(s);
    const r = T.G('convertExp()');
    if (on) check('G-2 켬: unbound 변환 0·엑세리아 유지', r === false && s.excelia === 400 && abilSum(s) === a0, { ex: s.excelia });
    else check('G-2 꺼짐: unbound 도 현행대로 변환(결과 불변)', s.excelia === 0 && abilSum(s) > a0);
    T.G('GameCore.Growth.addExperience(S, 50)');
    check('G-2 ' + (on ? '켬' : '꺼짐') + ': 적립(addExperience)은 유지', s.excelia >= 50);
  }
});
test('G-2b 세 변환 경로의 판정이 같다(canConvertExcelia 단일)', () => {
  const T = ctx(); const s = activeMember(T); T.G('N2_GATES.growth = true');
  check('G-2b active 정상 → 참', T.G('canConvertExcelia()') === true);
  toUnbound(T, s); check('G-2b unbound → 거짓', T.G('canConvertExcelia()') === false);
});
test('CV-6 유효하지 않은 상태에서 변환 안 함', () => {
  const T = ctx({ reasons: true }); const s = activeMember(T); T.G('N2_GATES.growth = true'); s.excelia = 300;
  s.patronAbsence = Object.freeze({ since: 20, reason: 'test_reason', familiaId: 'loki' });
  check('CV-6a 정상 부재 중 → 변환 안 함(진단 없음)', T.G('convertExp()') === false && s.excelia === 300);
  s.patronAbsence = { since: 20, reason: 'test_reason', familiaId: 'hestia' };
  const n = T.G('syncInvariantLog.length');
  check('CV-6b holder 불일치 부재 → 변환 안 함 + absence_holder_mismatch', T.G('convertExp()') === false && T.G('syncInvariantLog').slice(n).some(x => x.kind === 'absence_holder_mismatch'));
  delete s.patronAbsence;
  check('CV-6c 필드 없음(undefined) → fail-closed', T.G('convertExp()') === false && s.excelia === 300);
});
// ── CV-1·CV-3·CV-4: 컨버젼 직후 순서와 유예 없음 ──
test('CV-1·CV-3 즉시 재수여: 첫 convertExp 시점에 새 소속·active·statusResumeAge null', () => {
  const T = ctx({ seed: 11 }); const s = activeMember(T, 'loki'); T.G('N2_GATES.growth = true');
  s.statusResumeAge = 99; s.excelia = 600; spyConvert(T);
  T.G("apply({ godReturn: 'regrant' })");
  const cv = T.G('__cv'); const first = cv[0];
  check('CV-1 첫 호출: 새 소속(≠loki)·active·holder 일치·resume null', first && first.fam && first.fam !== 'loki' && first.state === 'active' && first.holder === first.fam && first.resume === null, first);
  check('CV-1 첫 호출 전 엑세리아 600 → 직후 0(변환됨)', first.ex0 === 600 && first.ex1 === 0, first);
  check('CV-3 즉시 재수여 뒤 statusResumeAge null(유예 없음)', s.statusResumeAge === null);
});
test('CV-4 active → active holder 변경(H2): 이전 유예값을 물려받지 않음', () => {
  const T = ctx(); const s = activeMember(T, 'loki'); s.statusResumeAge = 99; spyConvert(T);
  T.G("apply({ familia: 'rebind' })");
  const first = T.G('__cv')[0];
  check('CV-4 첫 convertExp(962 안쪽) 시점 resume null·새 소속', first && first.resume === null && first.fam === s.familia.id, first);
  check('CV-4 끝난 뒤 statusResumeAge null', s.statusResumeAge === null);
});
test('CV-2 컨버젼 직후 추가 엑세리아도 적립·반영', () => {
  const T = ctx({ seed: 11 }); const s = activeMember(T); T.G('N2_GATES.growth = true');
  T.G("apply({ godReturn: 'regrant' })"); const a0 = abilSum(s);
  T.G('GameCore.Growth.addExperience(S, 200)'); T.G('convertExp()');
  check('CV-2 추가분 변환', s.excelia === 0 && abilSum(s) > a0);
});
// ── CV-5a~5d: 반복 호출 ──
test('CV-5a~5d 반복 호출: 같은 엑세리아 중복 변환 없음, 레벨업은 현행 규칙', () => {
  const LV = n => 'x';
  const mk = () => { const T = ctx(); const s = activeMember(T); s.level = 1; s.feat = 0; s.abil = { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }; spyConvert(T); return { T, s }; };
  const L = 500;   // LEVELUP_ABIL
  { const { T, s } = mk(); s.excelia = 10; T.G('convertExp()'); T.G('convertExp()'); const [a, b] = T.G('__cv');
    check('CV-5a 첫 호출 레벨업 없음, 둘째 변환량 0·레벨업 없음', a.lv1 === a.lv0 && b.ex0 === 0 && b.abil1 === b.abil0 && b.lv1 === b.lv0, [a, b]); }
  { const { T, s } = mk(); s.feat = 5; s.abil = { str: L, vit: 0, dex: 0, agi: 0, mag: 0 }; s.excelia = 0; T.G('convertExp()'); T.G('convertExp()'); const [a, b] = T.G('__cv');
    check('CV-5b 첫 호출 1레벨 상승(능력치 초기화), 둘째 레벨업 없음', a.lv1 === a.lv0 + 1 && a.lh1 === a.lh0 + 1 && b.ex0 === 0 && b.lv1 === b.lv0, [a, b]); }
  { const { T, s } = mk(); s.feat = 0; s.abil = { str: L, vit: 0, dex: 0, agi: 0, mag: 0 }; s.excelia = 0; T.G('convertExp()'); s.feat = 5; T.G('convertExp()'); const [a, b] = T.G('__cv');
    check('CV-5c 능력치 조건 선충족·feat 만 증가: 둘째 직전 엑세리아 0, 둘째 레벨업 1회(정상 후속)', a.lv1 === a.lv0 && b.ex0 === 0 && b.lv1 === b.lv0 + 1 && b.lh1 === b.lh0 + 1, [a, b]); }
  { const { T, s } = mk(); s.feat = 5; s.abil = { str: L - 1, vit: 0, dex: 0, agi: 0, mag: 0 }; s.excelia = 0; T.G('convertExp()'); s.abil.str = L; T.G('convertExp()'); const [a, b] = T.G('__cv');
    check('CV-5d feat 조건 선충족·능력치만 변경: 둘째 직전 엑세리아 0, 둘째 레벨업 1회(정상 후속)', a.lv1 === a.lv0 && b.ex0 === 0 && b.lv1 === b.lv0 + 1, [a, b]); }
});
test('CV-7 공식 코드 불변(convertExcelia·tryLevelUp·addExperience·carryPotential 소스 = 406a03b)', () => {
  if (!BASE) { check('CV-7 기준 사본 미지정 — 미실행(통과로 세지 않음)', false, '사용: node tests/n2_link_test.js <406a03b 사본>'); return; }
  const fn = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return null; let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return null; };
  const rd = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
  for (const [f, n] of [['core/growth.js', 'convertExcelia'], ['core/growth.js', 'addExperience'], ['core/growth.js', 'carryPotential'], ['script.js', 'tryLevelUp']]) {
    const a = fn(rd(BASE, f), n), b = fn(rd(path.join(__dirname, '..'), f), n);
    check('CV-7 ' + n + ' 소스 동일', a && a === b);
  }
});
// ── N2-3c: 즉시 재수여 이월 ──
test('N2-3c 즉시 재수여에도 carryPotential(합성: 잠재력이 남은 경우)', () => {
  const T = ctx({ seed: 11 }); const s = activeMember(T); s.potential = 100; s.excelia = 0;
  T.G('S.__ex = []; { const o = GameCore.Growth.carryPotential; GameCore.Growth.carryPotential = function (S) { const r = o(S); S.__ex.push(r); return r; }; }');
  T.G("apply({ godReturn: 'regrant' })");
  check('N2-3c 재수여 경로에서 이월 1회·잠재력 0', s.__ex.length === 1 && s.__ex[0] > 0 && s.potential === 0, s.__ex);
});
// ── N2-2 (나): 던전 관문(EX-1) ──
test('EX-1 던전 관문: 개인 기준 active + member, 같은 파밀리아 요구 없음, 상태 불변', () => {
  const T = ctx(); const s = activeMember(T, 'hestia'); T.G('N2_GATES.dungeon = true');
  const pre = snap(s, []);
  check('EX-1a 다른 파밀리아(hestia) member active → 참', T.G('canEnterDungeon()') === true);
  check('EX-1b 판정이 S 를 바꾸지 않음', snap(s, []) === pre);
  s.familiaHistory[0].role = 'protected';
  check('EX-1c protected 소속 → 거짓', T.G('canEnterDungeon()') === false);
  s.familiaHistory[0].role = 'member'; toUnbound(T, s);
  check('EX-1d unbound → 거짓(관문 켬)', T.G('canEnterDungeon()') === false);
  T.G('N2_GATES.dungeon = false');
  check('EX-1e 관문 꺼짐: unbound 도 현행(2-i)대로 참', T.G('canEnterDungeon()') === true);
});
// ── N2-6 A1~A7·A3 S1~S5 ──
const absence = (fid = 'loki') => Object.freeze({ since: 20, reason: 'test_reason', familiaId: fid });
test('A1·A4·A5 시작·귀환·중복 종료(시험용 사유 주입)', () => {
  const T = ctx({ reasons: true }); const s = activeMember(T);
  T.G("apply({ patronAbsence: 'begin', patronAbsenceReason: 'test_reason' })");
  check('A1 시작: 불변 객체·세 키', s.patronAbsence && Object.isFrozen(s.patronAbsence) && s.patronAbsence.familiaId === 'loki' && Object.keys(s.patronAbsence).length === 3);
  const n = T.G('syncInvariantLog.length');
  T.G("apply({ patronAbsence: 'begin', patronAbsenceReason: 'test_reason' })");
  check('A1 중복 시작 거부 + 진단', T.G('syncInvariantLog').slice(n).some(x => x.kind === 'absence_begin_rejected'));
  T.G("apply({ patronAbsence: 'end' })"); check('A4 귀환: null', s.patronAbsence === null);
  const n2 = T.G('syncInvariantLog.length'); T.G("apply({ patronAbsence: 'end' })");
  check('A5 중복 종료: 아무것도 하지 않음(진단 없음)', s.patronAbsence === null && T.G('syncInvariantLog').length === n2);
});
test('A1 게임 기본(사유 목록 비어 있음): 부재 시작 불가', () => {
  const T = ctx(); const s = activeMember(T);
  T.G("apply({ patronAbsence: 'begin', patronAbsenceReason: 'anything' })");
  check('A1 기본: 시작 거부·patronAbsence null 유지', s.patronAbsence === null);
});
test('AB-2 부재 중 전이: 첫 소속 대입 전에 종료, 첫 convertExp 시점 absenceOK 참', () => {
  const cases = {
    'S1 rebind': (T, s) => T.G("apply({ familia: 'rebind' })"),
    'S2+S3 재수여(P2\')': (T, s) => T.G("apply({ godReturn: 'regrant' })"),
    'S2 봉인': (T, s) => T.G("apply({ godReturn: 'seal' })"),
    'S4 dropFamilia': (T, s) => T.G('apply({ dropFamilia: true })'),
    'S5 leaveFamilia(직접 호출, 게임 흐름 미연결)': (T, s) => T.G('leaveFamilia()') };
  for (const [name, go] of Object.entries(cases)) {
    const T = ctx({ seed: 11, reasons: true }); const s = activeMember(T); s.patronAbsence = absence('loki');
    T.G(`globalThis.__a3 = []; { const o = endPatronAbsenceForTransition; endPatronAbsenceForTransition = function (site) { __a3.push({ site, fam: S.familia ? S.familia.id : null, had: S.patronAbsence != null }); return o.apply(this, arguments); }; }`);
    spyConvert(T); go(T, s);
    const a3 = T.G('__a3').filter(x => x.had), cv = T.G('__cv');
    check('AB-2 ' + name + ': 종료 1회(전이 전 소속 loki 에서)', a3.length === 1 && a3[0].fam === 'loki', T.G('__a3'));
    check('AB-2 ' + name + ': patronAbsence null', s.patronAbsence === null);
    if (cv.length && /S1|S3/.test(name)) check('AB-2 ' + name + ': 첫 convertExp 시점 부재 없음', cv[0].absence === null, cv[0]);
  }
});
test('AB-3 가드 거부·무소속·정지: 부재 보존, 진단 0', () => {
  { const T = ctx({ reasons: true }); const s = activeMember(T); s.patronAbsence = absence(); const n = T.G('syncInvariantLog.length');
    T.G("rollFamilia(undefined, 'initial_join')");   // active 상태에서 최초 입단 모드는 가드가 거부한다
    check('AB-3 모드 가드 거부 → 부재 보존·진단 0', s.patronAbsence && s.patronAbsence.familiaId === 'loki' && !T.G('syncInvariantLog').slice(n).some(x => /absence/.test(x.kind))); }
  { const T = ctx({ reasons: true }); const s = T.S(); s.patronAbsence = absence();
    check('AB-3s5 무소속 leaveFamilia → false·부재 보존', T.G('leaveFamilia()') === false && s.patronAbsence !== null); }
  { const T = ctx({ reasons: true }); const s = activeMember(T); s.patronAbsence = absence(); s.conversionPending = null;
    T.G("S.familia = null; S.falnaState = 'unbound';");
    const r = T.G("completeConversion('hestia')");
    check('AB-5b 596 거부(conversionPending 없음) → 부재 보존', s.patronAbsence !== null && s.familia === null, r); }
  { const T = ctx({ reasons: true }); const s = activeMember(T); s.patronAbsence = absence(); T.G('progressHalted = true');
    T.G('leaveFamilia()'); check('AB-3s5 정지 상태 → 부재 보존', s.patronAbsence !== null); }
});
test('AB-4·AB-5 손상 상태(holder 불일치): 전이 밖에서는 보존, 전이 때 종료 + 진단 1건', () => {
  const T = ctx({ reasons: true }); const s = activeMember(T); s.patronAbsence = absence('hestia');
  T.G('N2_GATES.growth = true'); T.G('convertExp()');
  check('AB-4 전이 밖: 보존', s.patronAbsence && s.patronAbsence.familiaId === 'hestia');
  const n = T.G('syncInvariantLog.length'); T.G('apply({ dropFamilia: true })');
  const k = T.G('syncInvariantLog').slice(n).filter(x => x.kind === 'absence_end_mismatch');
  check('AB-4 전이 때 종료 + absence_end_mismatch 정확히 1건', s.patronAbsence === null && k.length === 1, k);
  const T2 = ctx({ seed: 11, reasons: true }); const s2 = activeMember(T2); T2.G('apply({ dropFamilia: true })');
  s2.patronAbsence = absence('loki');   // unbound 인데 부재가 남은 합성 손상 상태(P2'')
  const n2 = T2.G('syncInvariantLog.length');
  const r = T2.G("completeConversion('hestia', 'test')");
  const k2 = T2.G('syncInvariantLog').slice(n2).filter(x => x.kind === 'absence_end_mismatch');
  check('AB-5a P2\'\' 통과 → 종료 + 진단 1건', r === true && s2.patronAbsence === null && k2.length === 1, { r, k2 });
});
test('AB-10 전이 1회당 실제 종료 최대 1회(S2→S3 연쇄에서 S3 무영향)', () => {
  const T = ctx({ seed: 11, reasons: true }); const s = activeMember(T); s.patronAbsence = absence();
  T.G(`globalThis.__a3 = []; { const o = endPatronAbsenceForTransition; endPatronAbsenceForTransition = function (site) { __a3.push({ site, had: S.patronAbsence != null }); return o.apply(this, arguments); }; }`);
  T.G("apply({ godReturn: 'regrant' })"); const a = T.G('__a3');
  check('AB-10 호출 S2·S3 두 번, 실제 종료는 S2 한 번', a.map(x => x.site).join() === 'sealByGodReturn,completeConversion' && a.filter(x => x.had).length === 1 && a[0].had === true, a);
});
// ── 정적 검사 AB-7·AB-8·AB-9 ──
test('AB-7·AB-9 데이터 정적 검사', () => {
  const T = ctx(); const TR = ['godReturn', 'dropFamilia', 'familia', 'recruit'];
  const fxs = []; T.G('EVENTS').forEach(e => (e.choices || []).forEach(c => { if (c.fx) fxs.push(['event ' + e.id, c.fx]); if (c.chance) Object.values(c.chance).forEach(v => v && v.fx && fxs.push(['chance ' + e.id, v.fx])); }));
  const mods = []; const M = T.G('MODS'); for (const grp of ['familias', 'organizations']) Object.entries(M[grp] || {}).forEach(([id, m]) => m && m.fx && mods.push([grp + ' ' + id, m.fx]));
  const both = fxs.concat(mods).filter(([, fx]) => fx.patronAbsence !== undefined && TR.some(k => fx[k] !== undefined));
  check('AB-7 patronAbsence 와 소속 전이 키 공존 0건', both.length === 0, both.map(x => x[0]));
  const modTr = mods.filter(([, fx]) => TR.some(k => fx[k] !== undefined));
  check('AB-9 MODS.familias·organizations fx 에 소속 전이 키 0건', modTr.length === 0, modTr.map(x => x[0]));
  check('AB-7 현재 데이터에 fx.patronAbsence 0건(부재 사건 미설계)', fxs.filter(([, fx]) => fx.patronAbsence !== undefined).length === 0);
});
test('AB-8 A3 호출 위치·순서(제어 흐름 정적 검사)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const body = name => { const i = src.indexOf('function ' + name + '('); let d = 0; const j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return ''; };
  const calls = [...src.matchAll(/endPatronAbsenceForTransition\('([A-Za-z]+)'\)/g)].map(m => m[1]);
  check('AB-8 호출 위치 정확히 S1~S5 각 1회', JSON.stringify(calls.slice().sort()) === JSON.stringify(['completeConversion', 'dropFamilia', 'leaveFamilia', 'rollFamiliaBody', 'sealByGodReturn'].sort()), calls);
  const order = (name, assignRe) => {
    const b = body(name), c = b.indexOf("endPatronAbsenceForTransition('" + (name === 'applyEffects' ? 'dropFamilia' : name) + "')");
    const firstAssign = b.slice(c).search(assignRe);
    const lastRejectBefore = Math.max(b.lastIndexOf('return', c), b.lastIndexOf('throw', c));
    const between = b.slice(c, c + firstAssign);
    return c > 0 && firstAssign > 0 && !/\breturn\b|\bthrow\b/.test(between) && lastRejectBefore < c;
  };
  check('AB-8 S1 rollFamiliaBody: 가드·목적지 검증 뒤, 첫 S.familia 대입 전', order('rollFamiliaBody', /S\.familia\s*=/));
  check('AB-8 S2 sealByGodReturn: 443 검사 뒤, closeMembership·S.familia 전', order('sealByGodReturn', /closeMembership\(|S\.familia\s*=/));
  check('AB-8 S3 completeConversion: 596·598 거부 뒤, S.familia 대입 전', order('completeConversion', /S\.familia\s*=/));
  check('AB-8 S5 leaveFamilia: 무소속·거부 반환 뒤, closeMembership 전', order('leaveFamilia', /closeMembership\(|S\.familia\s*=/));
  const ae = body('applyEffects'); const dropIdx = ae.indexOf('if (fx.dropFamilia)');
  check('AB-8 S4 dropFamilia 블록 안, closeMembership 전·applyEffects 공통 위치에 다른 A3 없음',
    ae.indexOf("endPatronAbsenceForTransition('dropFamilia')") > dropIdx && ae.indexOf("endPatronAbsenceForTransition('dropFamilia')") < ae.indexOf("closeMembership('left')", dropIdx) && (ae.match(/endPatronAbsenceForTransition\(/g) || []).length === 1);
  check('AB-8 Q5: leaveFamilia 는 게임 코드에서 호출되지 않음', !/\bleaveFamilia\(\)/.test(src.replace(/function leaveFamilia\(\)/, '')));
});
test('AB-6 후속 선택 안의 A3 종료 뒤 예외 → patronAbsence 스냅숏 복원(RB-2)', () => {
  const T = ctx({ seed: 11, reasons: true }); const s = activeMember(T); const pa = absence(); s.patronAbsence = pa;
  T.G(`document.getElementById('choices').innerHTML = '';
    FOLLOWUP_KINDS.t_ab = { prompt: 'p', options: () => [{ id: 'go', label: 'g' }], resolve: () => { apply({ dropFamilia: true }); throw new Error('boom'); } };
    S.pendingFollowup = { kind: 't_ab', phase: 'awaiting_choice', sourceEventId: 'x' };`);
  const n = T.G('syncInvariantLog.length');
  let err = null; try { T.G("chooseFollowup('go')"); } catch (e) { err = e; }
  check('AB-6 예외 전파·patronAbsence 원래 참조', !!err && s.patronAbsence === pa && s.familia && s.familia.id === 'loki');
  check('AB-6 진단 배열은 롤백하지 않음(S 밖)', T.G('syncInvariantLog').length >= n);
});
// ── S1 후보 선검증: 기존 동작 보존(정상·무효·강제 후보) ──
test('S1 rollFamiliaBody 후보 선검증: 406a03b 와 상태·난수·예외 동일', () => {
  if (!BASE) { check('S1 기준 사본 미지정 — 미실행(통과로 세지 않음)', false); return; }
  const scen = {
    '정상(추첨)': T => T.G("rollFamilia(undefined, 'initial_join')"),
    '강제 후보': T => T.G("rollFamilia('hestia', 'initial_join')"),
    '무효 후보(예외)': T => { try { T.G("rollFamiliaBody('no_such_familia')"); return 'none'; } catch (e) { return String(e.message); } } };
  const EXC = ['statusResumeAge', 'patronAbsence'];   // N2 가 새로 두는 두 필드(startLife 초기화)는 비교에서 뺀다
  // F1D4A P4(의도적 시험 변경): P4 가 새로 두는 두 필드(pendingRelocationOffer·dungeonAccess)도 비교에서 빼고, 아래 S1-P4 로 따로 검사한다.
  EXC.push('pendingRelocationOffer', 'dungeonAccess');
  for (const [name, go] of Object.entries(scen)) {
    let p4 = null;
    const out = [BASE, null].map(root => { const T = makeCtx({ seed: 7, root: root || undefined }); T.G('startLife()'); T.S().age = 16; const c0 = T.calls(); const r = go(T); const S = T.S();
      if (!root) p4 = { offer: S.pendingRelocationOffer, access: S.dungeonAccess, fam: S.familia && S.familia.id, home: S.familia ? T.G('FAMILIA_HOME')[S.familia.id] : null, loc: S.location.regionId, res: S.residence.regionId };
      return { r, s: snap(S, EXC), calls: T.calls() - c0 }; });
    check('S1 ' + name + ': 결과·S·난수 호출 수 동일', out[0].r === out[1].r && out[0].s === out[1].s && out[0].calls === out[1].calls, { r: [out[0].r, out[1].r], calls: [out[0].calls, out[1].calls] });
    const want = p4.home === 'orario' && !(p4.loc === 'orario' && p4.res === 'orario') && out[1].r !== 'unknown familia: no_such_familia';
    check('S1-P4 ' + name + ': dungeonAccess null · 이주 제안은 §8.5.2 조건일 때만(난수 0)', p4.access === null && (want ? (p4.offer && p4.offer.familiaId === p4.fam && p4.offer.path === 'initial_join' && p4.offer.at === 16) : p4.offer === null), p4);
  }
});
finish('n2_link_test');
