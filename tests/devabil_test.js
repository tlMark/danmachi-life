// F1D4A D-DEVABIL 1단계 시험(설계 r3 §9 DA-1~DA-20, U-D10). 각 시험은 새 vm 컨텍스트(게임 코드에 시험 훅 없음).
// 실제 데이터의 발전 어빌리티 정의는 weight·eligibility 가 null(U-D2 미정)이고 습득은 비활성이다. 습득 경로 시험은
// **합성 정의(시험용 가중치·자격)와 합성 활성화**로만 한다 — 실제 생애 결과(48k·digest)와 구분해 보고한다.
// 사용: node tests/devabil_test.js — 실패 1건 이상이면 종료 코드 1.
const { makeCtx, makeReporter, setAge, snap } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;

// 합성 상태: 팔나 보유 Lv.N, 레벨업 조건(위업 ≥ 레벨, 능력치 하나 ≥ 500)을 만족시킨다.
function falnaAt(T, level = 1, age = 20) {
  T.G('startLife()'); const s = T.S(); setAge(s, age); s.hp = 100; s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''");
  if (!s.flags.includes('falna')) s.flags.push('falna');
  s.falnaState = 'active'; s.level = level; s.feat = 50; s.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 };
  return s;
}
// 합성 정의(시험 전용 가중치·자격). 실제 수치가 아님.
const DEFS = JSON.stringify([
  { id: 'hunter', weight: 3, eligibility: { minLevel: 2 } }, { id: 'blacksmith', weight: 2, eligibility: { minLevel: 2 } },
  { id: 'mixing', weight: 2, eligibility: { minLevel: 2 } }, { id: 'mystery', weight: 1, eligibility: { minLevel: 3 } }, { id: 'luck', weight: 1, eligibility: { minLevel: 2 } }]);
const enable = (T, defs = DEFS) => T.G(`devAbilityAcquisitionEnabled = true; gachaData.devAbilities = Object.freeze(JSON.parse(${JSON.stringify(defs)}).map(d => Object.freeze(Object.assign(d, { eligibility: Object.freeze(d.eligibility) }))))`);
const diagKinds = T => T.G('devAbilityDiagLog.map(d => d.kind)');

// ── 기본 상태·비활성 ───────────────────────────────────────────────────────────────
test('DA-0 생애 시작: devAbilities 동결 빈 배열, devAbilityHistory 빈 배열, 이전 생애 승계 없음', () => {
  const T = makeCtx(); T.G('startLife()'); const s = T.S();
  check('DA-0a 빈 배열·동결', Array.isArray(s.devAbilities) && s.devAbilities.length === 0 && Object.isFrozen(s.devAbilities) && Array.isArray(s.devAbilityHistory) && s.devAbilityHistory.length === 0);
  enable(T); const t = falnaAt(T, 1); T.G('tryLevelUp()'); const had = t.devAbilities.length;
  T.G('startLife()'); const u = T.S();
  check('DA-0b 새 생애는 초기화(습득 상태 승계 없음)', had === 1 && u.devAbilities.length === 0 && u.devAbilityHistory.length === 0);
});
test('DA-1·비활성: 실제 데이터(U-D2 미정)에서는 레벨업해도 습득·이력·진단 0(보유자 0명 구성)', () => {
  const T = makeCtx(); const s = falnaAt(T, 1); const c0 = T.calls();
  check('DA-1a 기본 비활성', T.G('devAbilityAcquisitionEnabled') === false);
  const r = T.G('tryLevelUp()');
  check('DA-1b 레벨업은 그대로(Lv.2) · 습득 0 · 이력 0 · 진단 0 · 난수 0', r === true && s.level === 2 && s.devAbilities.length === 0 && s.devAbilityHistory.length === 0 && T.G('devAbilityDiagLog.length') === 0 && T.calls() === c0);
  check('DA-1c 실제 정의 데이터는 수치 미정이라 검증 실패(활성화해도 fail-closed 될 상태)', T.G('validateDevAbilityDefs(gachaData.devAbilities).ok') === false);
});
test('DA-1d 실제 정의 데이터: 5종 이름·한자 분리 표기, 동결, 수치 null', () => {
  const T = makeCtx(); const d = T.G('gachaData.devAbilities');
  check('DA-1d', d.map(x => x.id).join() === 'hunter,blacksmith,mixing,mystery,luck' && d.map(x => x.kanji).join() === '狩人,鍛冶,調合,神秘,幸運'
    && d.every(x => x.weight === null && x.eligibility === null) && T.G('Object.isFrozen(gachaData.devAbilities) && gachaData.devAbilities.every(Object.isFrozen)'));
  check('DA-1e 포괄적 craft 없음', !d.some(x => x.id === 'craft'));
});

// ── 습득 경로(합성 활성화) ──────────────────────────────────────────────────────────
test('DA-2 Lv.1→2 레벨업 직후 1개 습득(rank I, exp 0, acquiredAtLevel 2, age = 달력 나이), Lv.2→3 에서 다른 id 추가', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1, 21); s.phase = 17; s.physicalAge = 17;   // 육체 나이와 다르게(DA-14)
  T.G('tryLevelUp()');
  const r0 = s.devAbilities[0];
  check('DA-2a 1개·형식', s.level === 2 && s.devAbilities.length === 1 && r0.rank === 'I' && r0.exp === 0 && r0.acquiredAtLevel === 2 && r0.age === 21 && Object.isFrozen(r0) && Object.isFrozen(s.devAbilities), s.devAbilities);
  check('DA-14 age 는 달력 나이(S.age), 육체 나이와 다름', r0.age === s.age && r0.age !== s.phase);
  check('DA-2b 이력 acquire 1', s.devAbilityHistory.length === 1 && s.devAbilityHistory[0].kind === 'acquire' && s.devAbilityHistory[0].id === r0.id && s.devAbilityHistory[0].level === 2);
  s.feat = 50; s.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 }; T.G('tryLevelUp()');
  check('DA-2c Lv.3 에서 추가 습득, 중복 id 없음', s.level === 3 && s.devAbilities.length === 2 && new Set(s.devAbilities.map(x => x.id)).size === 2);
});
test('DA-3 최초 팔나(Lv.0→1)·팔나 재취득(레벨 유지)에서는 습득 0', () => {
  const T = makeCtx(); enable(T); T.G('startLife()'); const s = T.S(); setAge(s, 15);
  s.familia = T.G('gachaData.familias').find(f => f.id === 'loki'); s.falnaAt = 15; s.feat = 0;
  T.G('checkFalna()');
  check('DA-3a 최초 팔나 → Lv.1, 습득 0', s.level === 1 && s.devAbilities.length === 0 && s.devAbilityHistory.length === 0);
  const U = makeCtx(); enable(U); U.G('startLife()'); const u = U.S(); setAge(u, 30); u.level = 3; u.feat = 0; u.flags = u.flags.filter(f => f !== 'falna');
  u.familia = U.G('gachaData.familias').find(f => f.id === 'loki'); u.falnaAt = 30; U.G('checkFalna()');
  check('DA-3b 팔나 재취득(Lv.3 유지) → 습득 0', u.level === 3 && u.devAbilities.length === 0 && u.devAbilityHistory.length === 0, { level: u.level });
});
test('DA-3d 정적: 습득 함수는 tryLevelUp 에서만 호출되고 checkFalnaBody·completeConversion 에는 없음', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'script.js'), 'utf8');
  const calls = src.split('\n').filter(l => /statusUpdateAfterRankUp\(/.test(l) && !/^\s*function /.test(l) && !/^\s*\/\//.test(l));
  check('DA-3d 호출 1곳(tryLevelUp)', calls.length === 1 && /statusUpdateAfterRankUp\(level, S\.level\)/.test(calls[0]), calls);
  const fb = src.slice(src.indexOf('function checkFalnaBody'), src.indexOf('function moveResidence'));
  const cc = src.slice(src.indexOf('function completeConversion'), src.indexOf('function completeConversion') + 2500);
  check('DA-3e checkFalnaBody·completeConversion 본문에 습득 호출 없음', !fb.includes('statusUpdateAfterRankUp') && !cc.includes('statusUpdateAfterRankUp'));
  const block = src.slice(src.indexOf('F1D4A D-DEVABIL 1단계'), src.indexOf('function tryLevelUp')).split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  check('DA-3f 메인 RNG 지점 없음: 발전 어빌리티 블록(주석 제외)에 Math.random 없음', block.length > 1000 && !block.includes('Math.random'));
});
test('DA-4 후보 생성 순수성·보유 제외·자격(minLevel)', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 2); const b = snap(s), c0 = T.calls(), d0 = T.G('devAbilityDiagLog.length');
  const c2 = T.G('devAbilityCandidates(gachaData.devAbilities, 2).map(c => c.id).join()');
  check('DA-4a Lv.2 후보(정렬, minLevel 3 제외)', c2 === 'blacksmith,hunter,luck,mixing', c2);
  check('DA-4b 순수: S·난수·진단 불변', snap(s) === b && T.calls() === c0 && T.G('devAbilityDiagLog.length') === d0);
  T.G("S.devAbilities = Object.freeze([Object.freeze({ id: 'hunter', rank: 'I', exp: 0, acquiredAtLevel: 2, age: 20 })])");
  check('DA-4c 보유 id 제외', T.G('devAbilityCandidates(gachaData.devAbilities, 3).map(c => c.id).join()') === 'blacksmith,luck,mixing,mystery');
});
test('DA-4d 후보 0개(정의 정상) → no_candidate 이력, 습득 0', () => {
  const T = makeCtx(); enable(T, JSON.stringify([{ id: 'mystery', weight: 1, eligibility: { minLevel: 5 } }])); const s = falnaAt(T, 1);
  T.G('tryLevelUp()');
  check('DA-4d', s.devAbilities.length === 0 && s.devAbilityHistory.length === 1 && s.devAbilityHistory[0].kind === 'no_candidate' && !diagKinds(T).includes('devability_definition_invalid'));
});
test('DA-5·DA-10 결정적 선택: 정의 순서 무관, 같은 입력 같은 결과, h % W 누적 버킷, Math.random 0', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1);
  const cands = T.G('devAbilityCandidates(gachaData.devAbilities, 2)');
  const fnv = T.G('GameCore.Lineage.fnv');
  const manual = (cs, seed, lv) => { const W = cs.reduce((a, c) => a + c.weight, 0); const h = fnv(2166136261, JSON.stringify(['devability-select-v1', seed, lv, cs.map(c => [c.id, c.weight])])) >>> 0; let r = h % W, cum = 0; for (const c of cs) { cum += c.weight; if (r < cum) return c.id; } return null; };
  let same = true, permSame = true, rngOk = true;
  for (let seed = 0; seed < 300; seed++) {
    const c0 = T.calls(); const got = T.G(`selectDevAbility(devAbilityCandidates(gachaData.devAbilities, 2), ${seed}, 2)`); if (T.calls() !== c0) rngOk = false;
    if (got !== manual(cands, seed, 2)) same = false;
  }
  check('DA-10a 수작업 버킷 계산과 300 시드 일치', same);
  check('DA-5 Math.random 호출 0', rngOk);
  const U = makeCtx(); enable(U, JSON.stringify(JSON.parse(DEFS).reverse())); falnaAt(U, 1);
  for (let seed = 0; seed < 300; seed++) if (U.G(`selectDevAbility(devAbilityCandidates(gachaData.devAbilities, 2), ${seed}, 2)`) !== T.G(`selectDevAbility(devAbilityCandidates(gachaData.devAbilities, 2), ${seed}, 2)`)) permSame = false;
  check('DA-10b 정의 데이터 순서를 뒤집어도 결과 동일', permSame);
  const dist = {}; for (let seed = 0; seed < 2000; seed++) { const id = T.G(`selectDevAbility(devAbilityCandidates(gachaData.devAbilities, 2), ${seed}, 2)`); dist[id] = (dist[id] || 0) + 1; }
  check('DA-10c 모든 후보가 선택될 수 있음(합성 가중치)', Object.keys(dist).length === 4, dist);
  check('DA-10d 후보 0 → null', T.G('selectDevAbility([], 1, 2)') === null);
});
test('DA-6 레벨업 시 rank·exp 유지, 기본 능력치 초기화와 무관(R-3·R-4)', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 2);
  T.G("S.devAbilities = Object.freeze([Object.freeze({ id: 'hunter', rank: 'E', exp: 7, acquiredAtLevel: 2, age: 18 })])");
  const ref = s.devAbilities; T.G('tryLevelUp()');
  check('DA-6', s.level === 3 && s.abil.str === 0 && s.devAbilities[0] === ref[0] && s.devAbilities[0].rank === 'E' && s.devAbilities[0].exp === 7 && s.devAbilities.length === 2);
});
test('DA-12 배열 copy-on-write: 이전 배열·레코드 불변, 새 배열 교체, 동결로 쓰기 차단', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1); T.G('tryLevelUp()');
  const a1 = s.devAbilities, r1 = a1[0], j1 = JSON.stringify(a1);
  s.feat = 50; s.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 }; T.G('tryLevelUp()');
  check('DA-12a 새 배열, 이전 배열 길이·내용·레코드 불변', s.devAbilities !== a1 && JSON.stringify(a1) === j1 && a1.length === 1 && s.devAbilities[0] === r1);
  let threw = 0; try { T.G('S.devAbilities.push({})'); } catch (e) { threw++; } try { T.G("'use strict'; S.devAbilities[0].rank = 'S'"); } catch (e) { threw++; }
  check('DA-12b 동결 배열 push·레코드 대입 차단', threw === 2 && s.devAbilities[0].rank === 'I');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'script.js'), 'utf8');
  check('DA-12c 정적: devAbilities 에 push·원소 대입·length 대입 없음', !/devAbilities\.push\(|devAbilities\[[^\]]+\]\s*=[^=]|devAbilities\.length\s*=[^=]/.test(src));
});
test('DA-15 쓰기 대상 전수: 습득 단계는 devAbilities·devAbilityHistory(·문구가 있으면 logHistory)만 바꿈', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 2); const b = snap(s, ['devAbilities', 'devAbilityHistory', 'logHistory']);
  T.G('statusUpdateAfterRankUp(1, 2)');
  check('DA-15', s.devAbilities.length === 1 && snap(s, ['devAbilities', 'devAbilityHistory', 'logHistory']) === b && s.logHistory.length === T.G('S.logHistory.length'));
});
test('DA-16 시드 유효성: 손상 시 습득 0·진단만·대체값 없음', () => {
  const cases = [['없음', 'delete S.lineageSeed'], ['접근자', "Object.defineProperty(S, 'lineageSeed', { get() { return 5; }, configurable: true, enumerable: true })"], ['비정수', 'S.lineageSeed = 1.5'],
    ['NaN', 'S.lineageSeed = NaN'], ['음수', 'S.lineageSeed = -1'], ['2^32', 'S.lineageSeed = 4294967296'], ['문자열', "S.lineageSeed = '5'"]];
  for (const [name, code] of cases) {
    const T = makeCtx(); enable(T); const s = falnaAt(T, 2); T.G(code); const hl = s.devAbilityHistory.length;
    T.G('statusUpdateAfterRankUp(1, 2)');
    check('DA-16 ' + name + ' → 습득 0, 이력 불변, 진단 seed_invalid', s.devAbilities.length === 0 && s.devAbilityHistory.length === hl && diagKinds(T).join() === 'devability_seed_invalid');
  }
  const T = makeCtx(); enable(T); const s = falnaAt(T, 2); s.lineageSeed = 0; T.G('statusUpdateAfterRankUp(1, 2)');
  check('DA-16b 시드 0 은 유효(정상 습득)', s.devAbilities.length === 1);
});
test('DA-20 정의 데이터 오류 → definition_invalid(no_candidate 와 구분), 습득 0, 단계 전체 fail-closed', () => {
  const bad = [['가중치 비정수', [{ id: 'a', weight: 1.5, eligibility: { minLevel: 2 } }]], ['가중치 0', [{ id: 'a', weight: 0, eligibility: { minLevel: 2 } }]], ['가중치 음수', [{ id: 'a', weight: -1, eligibility: { minLevel: 2 } }]],
    ['가중치 null', [{ id: 'a', weight: null, eligibility: { minLevel: 2 } }]], ['id 중복', [{ id: 'a', weight: 1, eligibility: { minLevel: 2 } }, { id: 'a', weight: 1, eligibility: { minLevel: 2 } }]],
    ['id 없음', [{ weight: 1, eligibility: { minLevel: 2 } }]], ['자격 없음', [{ id: 'a', weight: 1 }]], ['자격 minLevel 1', [{ id: 'a', weight: 1, eligibility: { minLevel: 1 } }]],
    ['일부만 오류(유효 후보 있음)', [{ id: 'a', weight: 1, eligibility: { minLevel: 2 } }, { id: 'b', weight: 'x', eligibility: { minLevel: 2 } }]], ['W 초과', [{ id: 'a', weight: 2 ** 31, eligibility: { minLevel: 2 } }]]];
  for (const [name, defs] of bad) {
    const T = makeCtx(); enable(T, JSON.stringify(defs)); const s = falnaAt(T, 1); T.G('tryLevelUp()');
    check('DA-20 ' + name, s.level === 2 && s.devAbilities.length === 0 && s.devAbilityHistory.length === 1 && s.devAbilityHistory[0].kind === 'definition_invalid' && diagKinds(T).includes('devability_definition_invalid'));
  }
});
test('DEV-15 정의 검증 캐시: 같은 정의 배열 참조면 같은 결과 객체(1회 검증), 새 참조면 다시 검증', () => {
  const T = makeCtx(); enable(T);
  check('DEV-15a 같은 참조 → 같은 결과 객체', T.G('validateDevAbilityDefs(gachaData.devAbilities) === validateDevAbilityDefs(gachaData.devAbilities)'));
  const first = T.G('validateDevAbilityDefs(gachaData.devAbilities)'); enable(T, JSON.stringify([{ id: 'a', weight: 0, eligibility: { minLevel: 2 } }]));
  check('DEV-15b 새 참조 → 다시 검증', first.ok === true && T.G('validateDevAbilityDefs(gachaData.devAbilities).ok') === false);
});

// ── 원자성·정지(U-D10)·롤백 ───────────────────────────────────────────────────────────
function failCase(name, inject, path) {
  test('DA-11·18 ' + name + ' (' + path + ')', () => {
    const T = makeCtx(); enable(T); const s = falnaAt(T, 1); T.G("DEVABIL_TEXT.acquire = '시험 문구'");   // 합성 문구(연표 단계까지 시험)
    const hist0 = s.devAbilityHistory, ab0 = s.devAbilities, log0 = s.logHistory.length, oldEntries = JSON.stringify(s.logHistory);
    T.G(inject);
    let threw = null;
    try {
      if (path === '가 사건 효과') T.G('apply({ feat: 0 })');
      else if (path === '다 연간 활동') { s.excelia = 0; T.G('convertExp()'); }
      else T.G('tryLevelUp()');
    } catch (e) { threw = String(e && e.message); }
    const lv = s.level;
    check(name + ' 예외 재던짐 · 레벨업 유지(Lv.2) · 정지', threw !== null && lv === 2 && T.G('progressHalted') === true, { threw, lv });
    check(name + ' 하위 트랜잭션 복원(devAbilities 참조·이력 참조/길이·연표 길이와 기존 항목)', s.devAbilities === ab0 && s.devAbilityHistory === hist0 && hist0.length === 0
      && s.logHistory.length >= log0 && JSON.stringify(s.logHistory.slice(0, log0)) === JSON.stringify(JSON.parse(oldEntries)) && !s.logHistory.some(l => l.text === '시험 문구'));
    check(name + ' 진단 commit_failed 1(전용 배열), 다른 진단 배열 무변화', diagKinds(T).filter(k => k === 'devability_commit_failed').length === 1);
    const lvBefore = s.level; T.G('nextYear()'); T.G('tryLevelUp()');
    check(name + ' 정지 후 진행 재개·자동 재시도 없음', T.G('progressHalted') === true && s.level === lvBefore && s.devAbilities === ab0 && diagKinds(T).filter(k => k === 'devability_commit_failed').length === 1);
    T.G('startLife()');
    check(name + ' 새 생애는 정지 해제·습득 상태 승계 없음', T.G('progressHalted') === false && T.S().devAbilities.length === 0 && T.S().devAbilityHistory.length === 0);
  });
}
failCase('이력 push 실패(동결 이력)', 'Object.freeze(S.devAbilityHistory)', 'tryLevelUp');
failCase('연표 기록 실패(say 예외)', "var __say = say; say = function (t) { if (t === '시험 문구') { S.logHistory.push({ age: S.age, type: 'note', text: '시험 문구' }); throw new Error('say fail'); } return __say.apply(this, arguments); }", 'tryLevelUp');
failCase('보유 배열 대입 실패(쓰기 불가 속성)', "Object.defineProperty(S, 'devAbilities', { value: S.devAbilities, writable: false, configurable: true, enumerable: true })", 'tryLevelUp');
failCase('이력 push 실패', 'Object.freeze(S.devAbilityHistory)', '가 사건 효과');
failCase('이력 push 실패', 'Object.freeze(S.devAbilityHistory)', '다 연간 활동');
test('RB-DA 롤백 스냅숏(후속 선택 경로 (가′)): 레벨업·습득 뒤 복원하면 level·levelHistory·devAbilities·devAbilityHistory·연표가 함께 원래대로', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1);
  const lh0 = s.levelHistory, lhLen = lh0.length, lhJson = JSON.stringify(lh0), ab0 = s.devAbilities, h0 = s.devAbilityHistory, log0 = s.logHistory.length;
  T.G('var __rb = takeRollbackSnapshot()'); T.G('tryLevelUp()');
  check('RB-DA 준비: 레벨업·습득 발생', s.level === 2 && s.devAbilities.length === 1 && s.devAbilityHistory.length === 1);
  T.G('restoreRollbackSnapshot(__rb)');
  check('RB-DA 복원: 모두 함께 원래대로(한쪽만 복원 0)', s.level === 1 && s.levelHistory === lh0 && s.levelHistory.length === lhLen && JSON.stringify(s.levelHistory) === lhJson
    && s.devAbilities === ab0 && s.devAbilities.length === 0 && s.devAbilityHistory === h0 && h0.length === 0 && s.logHistory.length === log0);
});
test('DA-17 append-only: 습득·롤백 전후로 기존 이력 항목의 참조·내용 불변', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1); T.G('tryLevelUp()');
  const e0 = s.devAbilityHistory[0], j0 = JSON.stringify(e0), lv0 = s.levelHistory.slice(), lj = JSON.stringify(s.levelHistory);
  T.G('var __rb = takeRollbackSnapshot()'); s.feat = 50; s.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 }; T.G('tryLevelUp()'); T.G('restoreRollbackSnapshot(__rb)');
  check('DA-17', s.devAbilityHistory[0] === e0 && JSON.stringify(e0) === j0 && Object.isFrozen(e0) && s.levelHistory.every((x, i) => x === lv0[i]) && JSON.stringify(s.levelHistory) === lj);
});
test('DA-19 진단 배열 분리: 발전 어빌리티 진단은 devAbilityDiagLog 에만', () => {
  const T = makeCtx(); enable(T, JSON.stringify([{ id: 'a', weight: 0, eligibility: { minLevel: 2 } }])); const s = falnaAt(T, 1);
  const sy = T.G('syncInvariantLog.length'), fu = T.G('followupDiagLog.length'); T.G('tryLevelUp()');
  check('DA-19', T.G('devAbilityDiagLog.length') >= 1 && T.G('syncInvariantLog.length') === sy && T.G('followupDiagLog.length') === fu);
});
test('DA-dup 이미 보유한 id 를 선택하는 경로는 진단만(중복 기록 0)', () => {
  const T = makeCtx(); enable(T, JSON.stringify([{ id: 'hunter', weight: 1, eligibility: { minLevel: 2 } }])); const s = falnaAt(T, 2);
  T.G('devAbilityCandidates = function () { return [{ id: "hunter", weight: 1 }]; }');   // 합성: 후보 생성이 보유 id 를 돌려준다고 가정
  T.G("S.devAbilities = Object.freeze([Object.freeze({ id: 'hunter', rank: 'I', exp: 0, acquiredAtLevel: 2, age: 20 })])");
  T.G('statusUpdateAfterRankUp(2, 3)');
  check('DA-dup', s.devAbilities.length === 1 && diagKinds(T).includes('devability_duplicate_acquire') && s.devAbilityHistory.length === 0);
});

// ── cec18a9 ChatGPT 1차 반려 보완(DEV-17·18·19·21) ──────────────────────────────────────────────
// 아래 시험의 습득 경로도 모두 합성 정의·합성 활성화·합성 문구('시험 문구')다. 실제 생애에서는 습득·문구가 없다.
test('DEV-17 append-only 복원 계약: 성공·실패 커밋 모두 기존 이력 항목의 참조·내용·동결 불변, 복원은 덧붙인 항목만 제거', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1); T.G('tryLevelUp()');
  const h = s.devAbilityHistory, e0 = h[0], j0 = JSON.stringify(e0);
  check('DEV-17a 이력 항목 동결(수정 차단)', Object.isFrozen(e0) && (() => { try { T.G('"use strict"; S.devAbilityHistory[0].id = "x"'); return false; } catch (_) { return true; } })() && e0.id !== 'x');
  // 실패 커밋: 이력 push 는 성공한 뒤 문구 단계에서 실패 → 덧붙인 항목만 제거, 기존 항목은 같은 참조·내용
  T.G("DEVABIL_TEXT.acquire = '시험 문구'"); s.feat = 50; s.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 };
  T.G("S.logHistory.push = function (x) { if (x && x.text === '시험 문구') throw new Error('log push fail'); return Array.prototype.push.call(this, x); }");
  let threw = false; try { T.G('tryLevelUp()'); } catch (_) { threw = true; }
  check('DEV-17b 실패 뒤 이력 = 같은 배열·길이 1·첫 항목 같은 참조·같은 내용', threw && s.devAbilityHistory === h && h.length === 1 && h[0] === e0 && JSON.stringify(h[0]) === j0);
  check('DEV-17c 정적: 커밋 함수는 이력에 push 외의 쓰기(원소 대입·splice·shift·unshift·pop) 없음', (() => {
    const src = T.G('commitDevAbilityChange.toString()').replace(/\/\/[^\n]*/g, '');
    return !/devAbilityHistory\s*\[[^\]]*\]\s*=(?!=)|devAbilityHistory\.(splice|shift|unshift|pop|sort|reverse|fill|copyWithin)\(/.test(src);
  })());
});
function domTexts(T) { return T.el('log').kids.map(k => k.html); }
function sayFailCase(name, inject) {
  test('DEV-18 실제 say: ' + name + ' → 화면 요소·logHistory·습득 상태 함께 복원(레벨업 유지·정지·안내)', () => {
    const T = makeCtx({ timers: 'queue' }); enable(T); const s = falnaAt(T, 1); T.G("DEVABIL_TEXT.acquire = '시험 문구'");
    const ab0 = s.devAbilities, h0 = s.devAbilityHistory, log0 = s.logHistory.length;
    T.G(inject);
    let threw = null; try { T.G('tryLevelUp()'); } catch (e) { threw = String(e && e.message); }
    const texts = domTexts(T);
    check(name + ' 예외 재던짐 · 레벨업 유지(Lv.2) · 정지', threw !== null && s.level === 2 && T.G('progressHalted') === true, { threw });
    check(name + ' 화면에 습득 문구 요소 없음(삽입 뒤 제거)', !texts.some(t => t.includes('시험 문구')), texts.slice(-3));
    check(name + ' 레벨업 문구는 화면·연표에 그대로(레벨업 미복원)', texts.some(t => t.includes('위계가 승화')) && s.logHistory.some(l => l.text.includes('위계가 승화')));
    check(name + ' logHistory 에 습득 문구 없음·레벨업 뒤 길이', !s.logHistory.some(l => l.text === '시험 문구') && s.logHistory.length >= log0);
    check(name + ' 습득 상태·이력 복원', s.devAbilities === ab0 && ab0.length === 0 && s.devAbilityHistory === h0 && h0.length === 0);
    check(name + ' 정지 안내 화면 1건(logHistory 미기록)', texts.filter(t => /오류가 발생해 진행을 멈췄다/.test(t)).length === 1 && !s.logHistory.some(l => /진행을 멈췄다/.test(l.text)));
    check(name + ' 진단 commit_failed 1', diagKinds(T).filter(k => k === 'devability_commit_failed').length === 1 && T.G('devAbilityDiagLog[devAbilityDiagLog.length-1].restoreErrors.length') === 0);
  });
}
// DOM 삽입(appendChild) 뒤 S.logHistory.push 단계에서 실패 — say 를 대체하지 않고 실제 say 를 통과시킨다.
sayFailCase('DOM 삽입 뒤 logHistory.push 실패', "S.logHistory.push = function (x) { if (x && x.text === '시험 문구') throw new Error('log push fail'); return Array.prototype.push.call(this, x); }");
// DOM 삽입·logHistory 기록 뒤 scrollIntoView 단계에서 실패.
sayFailCase('DOM 삽입·logHistory 기록 뒤 스크롤 실패', "var __ce = document.createElement; document.createElement = function () { var e = __ce.apply(this, arguments); e.scrollIntoView = function () { if (String(e.innerHTML).indexOf('시험 문구') >= 0) throw new Error('scroll fail'); }; return e; }");
test('DEV-18 대조: 실패가 없으면 습득 문구가 화면·연표에 1건씩 남음(합성 문구)', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1); T.G("DEVABIL_TEXT.acquire = '시험 문구'"); T.G('tryLevelUp()');
  check('DEV-18c', domTexts(T).filter(t => t.includes('시험 문구')).length === 1 && s.logHistory.filter(l => l.text === '시험 문구').length === 1 && s.devAbilities.length === 1 && T.G('progressHalted') === false);
});
test('DEV-19 커밋 실패 시 자동 진행 타이머 취소 + 정지 안내 + 재개·자동 재시도 없음', () => {
  const T = makeCtx({ timers: 'queue' }); enable(T); const s = falnaAt(T, 1);
  T.G('var __fired = 0; scheduleAuto(function () { __fired++; }, 10); scheduleAuto(function () { __fired++; }, 20);');
  const pending = T.G('autoTimers.slice()');
  T.G('Object.freeze(S.devAbilityHistory)');
  let threw = false; try { T.G('tryLevelUp()'); } catch (_) { threw = true; }
  check('DEV-19a 예약 타이머 모두 취소(autoTimers 비움, clearTimeout 호출)', threw && pending.length === 2 && T.G('autoTimers.length') === 0 && pending.every(id => T.cleared.includes(id)) && T.timers.length === 0);
  check('DEV-19b 정지 안내 1건', domTexts(T).filter(t => /오류가 발생해 진행을 멈췄다/.test(t)).length === 1);
  check('DEV-19c 레벨업 유지·정지', s.level === 2 && T.G('progressHalted') === true);
  const lv = s.level; T.G('nextYear()'); T.G('tryLevelUp()'); T.G('convertExp()');
  check('DEV-19d 정지 뒤 진행·재시도 없음(타이머 미실행, 레벨·습득·진단 불변)', T.G('__fired') === 0 && s.level === lv && s.devAbilities.length === 0 && diagKinds(T).filter(k => k === 'devability_commit_failed').length === 1);
  T.G('showHaltNotice()');
  check('DEV-19e 같은 생애의 중복 안내 없음(후속 선택 안 중첩 정지 대비)', domTexts(T).filter(t => /진행을 멈췄다/.test(t)).length === 1);
  T.G('startLife()');
  check('DEV-19f 새 생애: 정지 해제·승계 없음', T.G('progressHalted') === false && T.S().devAbilities.length === 0);
});
test('DEV-19g 후속 선택 안에서 습득 커밋 실패(중첩 정지): 기존 X0~X6 처리 유지, 안내 1건, 전체 롤백', () => {
  const T = makeCtx(); enable(T); const s = falnaAt(T, 1);
  T.G("FOLLOWUP_KINDS.__t = { prompt: 'p', options: () => [{ id: 'a', label: 'a' }], resolve: () => { Object.freeze(S.devAbilityHistory); tryLevelUp(); } }");
  T.G("S.pendingFollowup = { kind: '__t', phase: 'awaiting_choice', sourceEventId: 'x' }");
  let threw = false; try { T.G("chooseFollowup('a')"); } catch (_) { threw = true; }
  check('DEV-19g', threw && T.G('progressHalted') === true && s.level === 1 && s.devAbilities.length === 0 && domTexts(T).filter(t => /진행을 멈췄다/.test(t)).length === 1
    && diagKinds(T).includes('devability_commit_failed') && T.G("followupDiagLog.some(d => d.event === 'followup_resolve_exception')"));
});
function falnaCase(name, setup, allowed) {
  test('DEV-21 ' + name + (allowed ? ' → 습득 허용' : ' → 습득 차단(진단만)'), () => {
    const T = makeCtx(); enable(T); const s = falnaAt(T, 1); setup(s, T);
    const fs0 = s.falnaState, fl0 = s.flags.slice(), c0 = T.calls(); let threw = false;
    try { T.G('tryLevelUp()'); } catch (_) { threw = true; }
    check(name + ' 레벨업은 그대로(Lv.2)·예외 없음·정지 없음·난수 0', !threw && s.level === 2 && T.G('progressHalted') === false && T.calls() === c0);
    check(name + ' 팔나 기록·flag 불변(독립성)', s.falnaState === fs0 && JSON.stringify(s.flags) === JSON.stringify(fl0));
    if (allowed) check(name + ' 습득 1', s.devAbilities.length === 1 && !diagKinds(T).includes('devability_falna_blocked'));
    else check(name + ' 습득 0·이력 0·진단 falna_blocked 1', s.devAbilities.length === 0 && s.devAbilityHistory.length === 0 && diagKinds(T).filter(k => k === 'devability_falna_blocked').length === 1, T.G('devAbilityDiagLog'));
  });
}
const fam = (s, T) => { s.familia = T.G('gachaData.familias').find(f => f.id === 'loki'); };
falnaCase('active(flag·소속·기록 일치)', (s, T) => { fam(s, T); s.falnaState = 'active'; s.falnaHolder = 'loki'; }, true);
falnaCase('unbound(flag·무소속·기록 일치)', s => { s.familia = null; s.falnaState = 'unbound'; }, true);
falnaCase('범위 안 소속 변경 지연(기록 active / 원천 unbound)', s => { s.familia = null; s.falnaState = 'active'; }, true);
falnaCase('기록 sealed / flag 있음(불일치)', s => { s.falnaState = 'sealed'; }, false);
falnaCase('기록 none / flag 있음(불일치)', s => { s.falnaState = 'none'; }, false);
falnaCase('기록 active / flag 없음(불일치, 원천 none)', s => { s.flags = s.flags.filter(f => f !== 'falna'); s.falnaState = 'active'; }, false);
falnaCase('기록 unbound / flag 없음·팔나 이력 있음(불일치, 원천 sealed)', s => { s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = [{ familiaId: 'loki' }]; s.falnaState = 'unbound'; }, false);
falnaCase('sealed 일치(flag 없음·이력 있음)', s => { s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = [{ familiaId: 'loki' }]; s.falnaState = 'sealed'; }, false);
falnaCase('none 일치(flag 없음·이력 없음)', s => { s.flags = s.flags.filter(f => f !== 'falna'); s.falnaHistory = []; s.falnaState = 'none'; }, false);
test('DEV-21 비활성(실제 구성)에서는 팔나 판정·진단도 하지 않음(결과 중립)', () => {
  const T = makeCtx(); const s = falnaAt(T, 1); s.falnaState = 'sealed'; T.G('tryLevelUp()');
  check('DEV-21z', s.level === 2 && T.G('devAbilityDiagLog.length') === 0);
});

R.finish('devabil_test');
