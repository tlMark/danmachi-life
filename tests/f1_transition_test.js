// F-1 서포터 전직 resolve 테스트 — 결정 r9 F1-T4~T6·T4b~T4g, 설계 r5~r7(SV·SV-U1·RB-T1~T6·RB-M9a~d·RT-1~10), 사용자 결정 N6-5·N6-6.
// 사용: node tests/f1_transition_test.js   (실패 1건 이상이면 종료 코드 1)
// 모든 사례는 [합성 상태 주입]. 양수 퇴직금은 격리 vm 사본 소스의 `const SEVERANCE_AMOUNT = null;` 을 치환해 주입한다(시험용 값, 실제 확정 액수 아님).
const { makeReporter, snap, setAge } = require('./lib_f1_ctx');
const { openFollowup, pick, diagCount, appJson } = require('./lib_f1_fixture');
const { check, test, finish } = makeReporter();
const TEST_AMOUNT = 1234;   // 시험용 값(실제 액수 아님)
const AMT = { patch: [['script.js', 'const SEVERANCE_AMOUNT = null;', `const SEVERANCE_AMOUNT = ${TEST_AMOUNT};`]] };
const EXC = ['pendingFollowup', 'currentEventId', 'followupSeq'];
const spyApply = T => T.G("globalThis.__applyCalls = []; { const o = apply; apply = function (fx) { globalThis.__applyCalls.push(JSON.stringify(fx)); return o.apply(this, arguments); }; }");
const sevSnap = T => { const e = T.G('followupDiagLog').filter(x => x.event === 'severance_snapshot').pop(); return e && e.sev; };
const logKinds = s => s.logHistory.map(x => x.kind || x.type);

test('F1-T4 child → 서포터: 지급 0·팔나·소속·application 불변', () => {
  const { T, s } = openFollowup({ job: 'child', age: 15, ctx: AMT }); spyApply(T);
  const a0 = appJson(s), v0 = s.valis, f0 = JSON.stringify([s.familia, s.falnaState, s.falnaHistory, s.familiaHistory]);
  pick(T, 'supporter');
  check('F1-T4a job supporter·플래그·jobSince = 나이', s.job === 'supporter' && s.flags.includes('supporter') && s.jobSince === s.age);
  check('F1-T4b 발리스 변화 0·apply 0(J-6)', s.valis === v0 && T.G('globalThis.__applyCalls').length === 0);
  check('F1-T4c 팔나·소속 불변, application 추가 변경 0', JSON.stringify([s.familia, s.falnaState, s.falnaHistory, s.familiaHistory]) === f0 && appJson(s) === a0);
  check("F1-T4d '다음 해로' 1개·보류 정리", T.buttons().length === 1 && T.buttons()[0].textContent === '다음 해로' && s.pendingFollowup === null);
});

test('F1-T4b / SV 근속 5년(경계) healer → 서포터: 퇴직금 1회 [시험용 액수 주입]', () => {
  const { T, s } = openFollowup({ job: 'healer', tenure: 5, age: 20, ctx: AMT }); spyApply(T); const v0 = s.valis, c0 = T.calls(), a0 = appJson(s);
  const pre = JSON.stringify([s.abil, s.level, s.hidden, s.feat, s.excelia, s.falnaState, s.falnaTransitions, s.familia, s.relations]);
  pick(T, 'supporter'); const sev = sevSnap(T);
  check('F1-T4b a 스냅숏 = 전직 전 값(job healer·근속 5·eligible)', sev && sev.job === 'healer' && sev.tenureYears === 5 && sev.eligible === true && sev.employerId === null && sev.amount === TEST_AMOUNT, sev);
  check('F1-T4b b 지급 = 시험 금액 1회(apply 1회, valis delta)', s.valis === v0 + TEST_AMOUNT && JSON.stringify(T.G('globalThis.__applyCalls')) === JSON.stringify([JSON.stringify({ valis: TEST_AMOUNT })]));
  check('F1-T4b c jobSince = 전직 나이', s.job === 'supporter' && s.jobSince === s.age);
  const L2 = s.logHistory.filter(x => x.kind === 'severance');
  check('F1-T4b d L-2 연표 1건·문구', L2.length === 1 && L2[0].type === 'job' && L2[0].text === `치유사(으)로 5년 일한 끝에 퇴직금 ${TEST_AMOUNT}발리스를 받았다.`, L2);
  check('SV RNG 0', T.calls() === c0);
  check('SV 팔나·능력치·레벨·소속·관계·application 불변', JSON.stringify([s.abil, s.level, s.hidden, s.feat, s.excelia, s.falnaState, s.falnaTransitions, s.familia, s.relations]) === pre && appJson(s) === a0);
  check('SV syncDepth 0·동기화 로그 추가 0', T.G('syncDepth') === 0 && T.G('syncInvariantLog.length') === 0);
});

test('SV-U1 액수 미결(null): 지급·apply·L-2 모두 0, 전직은 정상', () => {
  const { T, s } = openFollowup({ job: 'healer', tenure: 7, age: 21, employer: 'guild' }); spyApply(T); const v0 = s.valis;
  pick(T, 'supporter'); const sev = sevSnap(T);
  check('SV-U1a 실제 소스의 SEVERANCE_AMOUNT === null', T.G('SEVERANCE_AMOUNT') === null && sev.amount === null && sev.eligible === true);
  check('SV-U1b 지급 0·apply 0·L-2 0', s.valis === v0 && T.G('globalThis.__applyCalls').length === 0 && !s.logHistory.some(x => x.kind === 'severance'));
  check('SV-U1c 진단 severance_amount_undecided 1건', diagCount(T, 'severance_amount_undecided') === 1);
  check('SV-U1d E-1·전직 정상 완료', s.job === 'supporter' && s.employer === null && s.logHistory.filter(x => x.kind === 'employer_quit').length === 1);
  const st = T.el('familia').textContent;
  check('SV-U1e 상태창 갱신(직업 서포터·고용처 표시 없음)', st.includes('직업: 서포터') && !st.includes('고용처'), st);
});

test('F1-T4c 근속 4년: 지급 0 [시험용 액수 주입]', () => {
  const { T, s } = openFollowup({ job: 'blacksmith', tenure: 4, age: 20, ctx: AMT }); spyApply(T); const v0 = s.valis;
  pick(T, 'supporter');
  check('F1-T4c 4년 → eligible false·지급 0·apply 0·crafter 제거', sevSnap(T).eligible === false && s.valis === v0 && T.G('globalThis.__applyCalls').length === 0 && !s.flags.includes('crafter') && s.flags.includes('supporter'));
});

test('F1-T4d 직업 변경 직후 재계산(C15) [시험용 액수 주입]', () => {
  const { T, s } = openFollowup({ job: 'farmer', tenure: 10, age: 20, ctx: AMT, before: (T, s) => { setAge(s, 18); T.G("setJob('merchant')"); setAge(s, 20); } });
  const v0 = s.valis; pick(T, 'supporter');
  check('F1-T4d farmer 10년 → merchant 2년: 지급 0', sevSnap(T).job === 'merchant' && sevSnap(T).tenureYears === 2 && s.valis === v0);
});

test('F1-T4g retired: 근속 5년 이상이어도 지급 0 [시험용 액수 주입]', () => {
  const { T, s } = openFollowup({ job: 'retired', tenure: 6, age: 22, ctx: AMT }); spyApply(T); const v0 = s.valis;
  pick(T, 'supporter');
  check('F1-T4g retired 6년 → eligible false·지급 0·apply 0', sevSnap(T).eligible === false && s.valis === v0 && T.G('globalThis.__applyCalls').length === 0 && s.job === 'supporter');
});

test('F1-T5 고용처 없는 기존 직업 → 전직', () => {
  const { T, s } = openFollowup({ job: 'blacksmith', tenure: 2, age: 20 });
  pick(T, 'supporter');
  check('F1-T5 플래그 재설정(crafter 제거·supporter 추가)·jobSince·직업 변경 연표', s.job === 'supporter' && !s.flags.includes('crafter') && s.flags.includes('supporter') && s.jobSince === s.age && s.logHistory.some(x => x.type === 'job' && x.text === '직업이 서포터(으)로 바뀌었다.') && !s.logHistory.some(x => x.kind === 'employer_quit'));
});

test('F1-T6 고용 중 → 전직(E-1) [시험용 액수 주입]', () => {
  const { T, s } = openFollowup({ job: 'guild_staff', tenure: 6, age: 21, employer: 'guild', ctx: AMT }); const a0 = appJson(s), v0 = s.valis, n0 = s.logHistory.length;
  pick(T, 'supporter'); const sev = sevSnap(T), added = s.logHistory.slice(n0);
  check('F1-T6a 스냅숏 employerId = guild(SV-M2 검출 지점)', sev.employerId === 'guild', sev);
  check('F1-T6b employer null·employerHistory 미생성', s.employer === null && !('employerHistory' in s));
  check('F1-T6c 연표 순서: L-1 → 직업 변경 → L-2', JSON.stringify(added.map(x => x.kind || 'job_change')) === JSON.stringify(['employer_quit', 'job_change', 'severance']) && added[0].text === '길드을(를) 그만두었다.', added);
  check('F1-T6d 지급 1회·application 불변', s.valis === v0 + TEST_AMOUNT && appJson(s) === a0);
});

// ── RB-T: 예외 주입 롤백 ──
const injectAt = (T, where) => {
  const map = {
    a: "{ const o = setJob; setJob = function () { if (globalThis.__inj && S.employer === null) { globalThis.__inj = false; throw new Error('inj-a'); } return o.apply(this, arguments); }; }",
    b: "{ const o = setJob; setJob = function () { const r = o.apply(this, arguments); if (globalThis.__inj) { globalThis.__inj = false; throw new Error('inj-b'); } return r; }; }",
    c: "{ const o = setJob; setJob = function () { const r = o.apply(this, arguments); if (globalThis.__inj) { globalThis.__inj = false; S.flags = S.flags.filter(f => f !== 'supporter'); } return r; }; }",
    d: "{ const o = convertExp; convertExp = function () { const r = o.apply(this, arguments); if (globalThis.__inj) { globalThis.__inj = false; throw new Error('inj-d'); } return r; }; }",
    e: "{ const o = sayDomOnly; sayDomOnly = function (t) { const r = o.apply(this, arguments); if (globalThis.__inj && /퇴직금/.test(t)) { globalThis.__inj = false; throw new Error('inj-e'); } return r; }; }" };
  T.G('globalThis.__inj = true; ' + map[where]);
};
const RB_EXC = ['pendingFollowup', 'currentEventId', 'syncBaseline'];
const rbRun = (opts, where, afterOpen) => {
  const f = openFollowup(opts); if (afterOpen) afterOpen(f.T, f.s); injectAt(f.T, where);
  const pre = snap(f.s, RB_EXC), log0 = JSON.stringify(f.s.logHistory), lh0 = JSON.stringify(f.s.levelHistory), items0 = JSON.stringify([f.s.items, f.s.itemUses, f.s.itemsConsumed]);
  const tr0 = JSON.stringify([f.s.falnaState, f.s.falnaHolder, f.s.falnaTransitions, f.s.conversionPending]);
  const sb0 = JSON.stringify(['syncBaseline' in f.s, f.s.syncBaseline]);   // F1D4A N2-1(RB-1a, 사용자 결정 2026-11-23): 기준값도 스냅숏 값으로 되돌린다
  let err = null; try { f.T.G("chooseFollowup('supporter')"); } catch (e) { err = e; }
  return { ...f, pre, log0, lh0, items0, tr0, sb0, err };
};
for (const [where, name] of [['a', 'E-1 직후'], ['b', 'setJob 직후'], ['c', 'setJob 확인 실패'], ['d', 'apply 내부'], ['e', 'L-2 연표 직후']]) {
  test('RB-T1/T2 예외 지점 (' + where + ') ' + name + ' [예외 주입·시험용 액수]', () => {
    const r = rbRun({ job: 'guild_staff', tenure: 6, age: 21, employer: 'guild', ctx: AMT }, where);
    check('RB-T1 ' + where + ' 예외 발생·정지', !!r.err && r.T.G('progressHalted') === true, String(r.err));
    check('RB-T2 ' + where + ' S 전체 = 스냅숏(제외: pending·currentEventId·syncBaseline)', snap(r.s, RB_EXC) === r.pre);
    check('RB-T5 ' + where + ' logHistory·levelHistory 내용 동일', JSON.stringify(r.s.logHistory) === r.log0 && JSON.stringify(r.s.levelHistory) === r.lh0);
    check('RB-T6 ' + where + ' 아이템 컨테이너 내용 동일', JSON.stringify([r.s.items, r.s.itemUses, r.s.itemsConsumed]) === r.items0);
    // 의도적 시험 변경(F1D4A N2-1, RB-1a 사용자 결정 2026-11-23): 이전 기대 '기준값 pending_after_exception 으로 남음' → '기준값 = 스냅숏 시점 값'(원자 롤백)
    check('RB-T3 ' + where + ' 2-i 상태 불변·syncDepth 0·기준값 = 스냅숏 시점 값(RB-1a)', JSON.stringify([r.s.falnaState, r.s.falnaHolder, r.s.falnaTransitions, r.s.conversionPending]) === r.tr0 && r.T.G('syncDepth') === 0 && JSON.stringify(['syncBaseline' in r.s, r.s.syncBaseline]) === r.sb0, [r.s.syncBaseline, r.sb0]);
    const stats = r.T.el('stats').html;
    check('RB-T4 ' + where + ' 렌더된 발리스 = 원복된 S.valis', stats.includes('발리스<b>' + r.s.valis + '</b>'), stats);
  });
}
test('RB-T3b 예외 후 새 생애: 2-i 기준값 복구 전이 0', () => {
  const r = rbRun({ job: 'guild_staff', tenure: 6, age: 21, employer: 'guild', ctx: AMT }, 'b');
  r.T.G('startLife()'); const s2 = r.T.S();
  check('RB-T3b 새 생애 정상 시작·recovered 전이 0', r.T.G('progressHalted') === false && !s2.falnaTransitions.some(t => /^recovered_/.test(t.cause)) && r.T.G('syncDepth') === 0);
});

// ── RB-M1~M8·M10c: 롤백 필드별 fixture. 각 필드가 resolve 안에서 **실제로 바뀌는** 합성 상태를 만든다(정상 실행으로 변화 확인 → 예외 시 원복 확인).
const unbound = "S.flags.push('falna'); S.falnaState = 'unbound'; S.falnaHistory = [{ familiaId: 'loki', at: 15, membershipIndex: 0 }]; ";
const RBF = {
  M1: ['job·jobSince·flags', 'b', '', s => ['job', 'jobSince', 'flags']],
  M2: ['employer', 'a', '', s => ['employer'], { employer: 'guild', job: 'guild_staff', tenure: 6, age: 21 }],
  M3: ['valis', 'e', '', s => ['valis']],
  M4: ['hp(상한 보정)', 'e', 'S.items = []; S.hp = 150;', s => ['hp']],
  M5: ['bond·feat·potential·excelia(하한·정규화)', 'e', 'S.bond = -5; S.feat = -1; S.potential = NaN; S.excelia = -1;', s => ['bond', 'feat', 'potential', 'excelia']],
  M6: ['abil·excelia(convertExcelia)', 'e', unbound + 'S.excelia = 10; S.feat = 0; S.abil = { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 };', s => ['abil', 'excelia']],
  M7: ['level·hidden·maxLevel·alias·levelHistory·feat(tryLevelUp)', 'e', unbound + "S.level = 1; S.maxLevel = 1; S.feat = 1; S.excelia = 0; S.hidden = 0; S.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 }; S.alias = gachaData.aliases.find(a => a.id === 'none'); S.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }]; S.items = []; recompute();", s => ['level', 'hidden', 'maxLevel', 'alias', 'levelHistory', 'feat']],
  M8: ['power·logHistory 길이', 'e', unbound + "S.level = 1; S.maxLevel = 1; S.feat = 1; S.excelia = 0; S.hidden = 0; S.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 }; S.alias = gachaData.aliases.find(a => a.id === 'none'); S.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }]; S.items = []; recompute();", s => ['power']],
  M10c: ['levelHistory 원래 없음', 'e', unbound + "S.level = 1; S.maxLevel = 1; S.feat = 1; S.excelia = 0; S.hidden = 0; S.abil = { str: 600, vit: 0, dex: 0, agi: 0, mag: 0 }; S.alias = gachaData.aliases.find(a => a.id === 'none'); delete S.levelHistory; S.items = []; recompute();", s => ['levelHistory']] };
for (const [id, [name, where, inject, fields, o]] of Object.entries(RBF)) {
  test('RB-' + id + ' fixture: ' + name + ' [합성 상태 주입·시험용 액수]', () => {
    const opts = { job: 'healer', tenure: 5, age: 20, ctx: AMT, ...(o || {}) };
    const n = openFollowup(opts); if (inject) n.T.G(inject); const before = JSON.parse(JSON.stringify(n.s, (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? String(v) : v)), log0 = n.s.logHistory.length;
    n.T.G("chooseFollowup('supporter')");
    const changed = fields(n.s).filter(k => JSON.stringify(n.s[k], (kk, v) => (typeof v === 'number' && !Number.isFinite(v)) ? String(v) : v) !== JSON.stringify(before[k]));
    check('RB-' + id + ' a 정상 실행에서 대상 필드가 실제로 바뀜(' + fields(n.s).join(',') + ')', changed.length === fields(n.s).length, { changed });
    if (id === 'M7' || id === 'M8') {
      check('RB-' + id + ' b 실측: level 1→2, maxLevel 1→2, hidden 0→60, alias none→rookie, power 15→28, logHistory +2(레벨업·이명) + 전직 1 + L-2 1',
        before.level === 1 && n.s.level === 2 && before.maxLevel === 1 && n.s.maxLevel === 2 && before.hidden === 0 && n.s.hidden === 60 && before.alias.id === 'none' && n.s.alias.id === 'rookie' && before.power === 15 && n.s.power === 28 && n.s.logHistory.length - log0 === 4,
        { level: [before.level, n.s.level], maxLevel: [before.maxLevel, n.s.maxLevel], hidden: [before.hidden, n.s.hidden], alias: [before.alias && before.alias.id, n.s.alias && n.s.alias.id], power: [before.power, n.s.power], log: n.s.logHistory.length - log0, kinds: n.s.logHistory.slice(log0).map(x => x.type + ':' + x.text.slice(0, 20)) });
    }
    const r = rbRun(opts, where, (T) => { if (inject) T.G(inject); });
    check('RB-' + id + ' c 예외(' + where + ') 후 S 전체 = 스냅숏', !!r.err && snap(r.s, RB_EXC) === r.pre);
    check('RB-' + id + ' d 예외 후 logHistory·levelHistory 내용·존재 동일', JSON.stringify(r.s.logHistory) === r.log0 && JSON.stringify(r.s.levelHistory) === r.lh0 && ('levelHistory' in r.s) === (id !== 'M10c'));
  });
}

// ── RB-M9: 컨테이너 존재 여부 복구(렌더·apply 경유 ensure) ──
const M9 = {
  a: ['itemUses 없음 + 실제 아이템 보유', s => { s.items = ['pyonkichi']; s.itemsConsumed = []; delete s.itemUses; }, s => !('itemUses' in s)],
  b1: ['items 없음', s => { delete s.items; }, s => !('items' in s)],
  b2: ['itemsConsumed 없음 + 아이템 보유', s => { s.items = ['pyonkichi']; delete s.itemsConsumed; delete s.itemUses; }, s => !('itemsConsumed' in s) && !('itemUses' in s)],
  c: ['relations·nextRelationId 없음', s => { delete s.relations; delete s.nextRelationId; }, s => !('relations' in s) && !('nextRelationId' in s)],
  d: ['nextRelationId = 0', s => { s.nextRelationId = 0; }, s => s.nextRelationId === 0],
  e: ['relations = null(존재하지만 배열 아님)', s => { s.relations = null; }, s => 'relations' in s && s.relations === null] };
const m9run = (key, extraPatch = []) => {
  const [name, mut, ok] = M9[key];
  // 후속 화면이 열린 뒤(선택 직전)에 주입한다 — 사건 처리 단계의 렌더가 만든 컨테이너와 섞이지 않게 하기 위함.
  const r = rbRun({ job: 'healer', tenure: 5, age: 20, ctx: { patch: AMT.patch.concat(extraPatch) } }, 'e', (T, s) => mut(s));
  return { name, r, ok: ok(r.s) && snap(r.s, RB_EXC) === r.pre };
};
test('RB-M9 컨테이너 복구 [합성 상태 주입·예외 주입·시험용 액수]', () => {
  for (const key of Object.keys(M9)) { const { name, r, ok } = m9run(key); check('RB-M9' + key + ' ' + name + ': 최종적으로도 원래 상태·S 전체 = 스냅숏', ok && !!r.err); }
});
// 변이(검출 확인): 원본은 위 테스트가 통과, 변이 사본에서는 해당 사례가 실패해야 한다.
test('RB-M9-mut 변이 검출', () => {
  const MUT = {
    mut1: [['script.js', "step('render', renderStatsFromClone);", "step('render', renderStats);"]],
    mut2: [['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed'];"],
           ['script.js', "'maxLevel', 'power', 'alias', 'nextRelationId'];", "'maxLevel', 'power', 'alias'];"]],
    mut3: [['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemsConsumed', 'relations'];"]],
    mut4: [['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['itemUses', 'itemsConsumed', 'relations'];"]],
    mut5: [['script.js', "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'itemsConsumed', 'relations'];", "const ROLLBACK_CONTAINER_FIELDS = ['items', 'itemUses', 'relations'];"]] };
  // 예상 목록(2026-11-10 정정): 첫 실행에서 mut1·mut3 예상이 실제와 달랐다. 원인 분석 결과 예상 쪽 오류였다.
  //  - mut1(일반 renderStats): b2 는 아이템 보유 상태라 Items.label → usesLeft → ensure 가 itemUses·itemsConsumed 를 만들고, e 는 ensureRelations 가 null 을 [] 로 바꾼다.
  //    b1(items 없음)은 renderStats 가 (S.items || []) 로 읽어 ensure 를 부르지 않으므로 렌더로는 재생성되지 않는다(QA 지적과 일치).
  //  - mut3(itemUses 복구 제외): b2 fixture 도 itemUses 를 지우므로 함께 실패한다.
  const expect = { mut1: ['a', 'b2', 'c', 'd', 'e'], mut2: ['c', 'd', 'e'], mut3: ['a', 'b2'], mut4: ['b1'], mut5: ['b2'] };
  for (const [m, patch] of Object.entries(MUT)) {
    const failed = Object.keys(M9).filter(k => !m9run(k, patch).ok);
    check(`RB-M9-${m} 변이 실패 사례 = 예상(${expect[m].join(',')})`, JSON.stringify(failed) === JSON.stringify(expect[m]), failed);
  }
});

// ── RT: 은퇴자 → 서포터(A안, 상태 독립) ──
const retiredFixture = (T, s, falna) => {   // falna: 'sealed' | 'unbound' | 'none' | 'active'
  T.G(`S.abil = { str: 320, vit: 210, dex: 180, agi: 150, mag: 90 }; S.level = 3; S.maxLevel = 3; S.hidden = 40; S.feat = 2; S.excelia = 5; S.alias = gachaData.aliases.find(a => a.id === 'chuuni');
       S.milestones = [{ id: 'm1', label: '시험 위업', age: 18 }]; S.levelHistory = [{ age: 15, kind: 'falna', from: 0, to: 1 }, { age: 17, kind: 'levelup', from: 1, to: 2 }, { age: 19, kind: 'levelup', from: 2, to: 3 }];
       S.aspiration = { kind: 'adventurer', since: 12, source: 't', fulfilledAt: 15 }; S.aspirationHistory = [{ ...S.aspiration }];
       S.falnaHistory = [{ familiaId: 'loki', at: 15, membershipIndex: 0 }]; S.familiaHistory = [{ id: 1, familiaId: 'loki', label: '로키 파밀리아', joinedAt: 14, leftAt: 19, leftReason: 'god_returned', falnaAt: 15, role: 'member' }];
       S.falnaTransitions = [{ from: 'none', to: 'active', cause: 'grant', at: 15 }]; S.parentFamilia = { id: 'hermes', label: '헤르메스 파밀리아' };`);
  if (falna === 'sealed') T.G("S.falnaState = 'sealed'; S.conversionPending = { since: 19, fromFamiliaId: 'loki', reason: 'god_returned' }; S.falnaTransitions.push({ from: 'active', to: 'sealed', cause: 'god_returned', at: 19 });");
  if (falna === 'unbound') T.G("S.flags.push('falna'); S.falnaState = 'unbound'; S.familiaHistory[0].leftReason = 'left'; S.conversionPending = { since: 19, fromFamiliaId: 'loki', reason: 'left' };");
  if (falna === 'none') T.G("S.falnaHistory = []; S.familiaHistory = []; S.falnaTransitions = []; S.levelHistory = []; S.level = 0; S.maxLevel = 0; S.alias = null;");
  if (falna === 'active') T.G("S.flags.push('falna'); S.familia = gachaData.familias.find(f => f.id === 'loki'); S.familiaHistory[0].leftAt = null; S.familiaHistory[0].leftReason = null; S.falnaState = 'active'; S.falnaHolder = 'loki';");
  T.G('recompute()');
};
const KEEP = ['flags-falna', 'falnaState', 'falnaHolder', 'conversionPending', 'familia', 'familiaAt', 'abil', 'level', 'maxLevel', 'hidden', 'feat', 'excelia', 'power', 'relations', 'parentFamilia', 'partnerId', 'nextRelationId', 'falnaHistory', 'familiaHistory', 'falnaTransitions', 'levelHistory', 'milestones', 'aspiration', 'aspirationHistory', 'alias', 'application', 'valis'];
const pickKeep = s => JSON.stringify(KEEP.map(k => k === 'flags-falna' ? s.flags.includes('falna') : s[k]));
const rtTransition = (falna, extra = {}) => {
  const f = openFollowup({ job: 'retired', tenure: 2, age: 21, ctx: AMT, ...extra, before: (T, s) => { retiredFixture(T, s, falna); if (extra.before) extra.before(T, s); } });
  spyApply(f.T); const keep0 = pickKeep(f.s), log0 = JSON.stringify(f.s.logHistory), n0 = f.s.logHistory.length;
  const allowedBefore = snap(f.s, EXC.concat(['job', 'jobSince', 'flags', 'logHistory', 'employer']));
  pick(f.T, 'supporter');
  return { ...f, keep0, log0, n0, allowedBefore };
};
const rtCommon = (id, r) => {
  check(id + ' 전직·jobSince·지급 0·apply 0', r.s.job === 'supporter' && r.s.jobSince === r.s.age && r.T.G('globalThis.__applyCalls').length === 0 && sevSnap(r.T).eligible === false);
  check(id + ' 팔나·소속·능력치·레벨·관계·이력 전부 불변', pickKeep(r.s) === r.keep0, JSON.parse(pickKeep(r.s)).map((v, i) => JSON.stringify(v) === JSON.stringify(JSON.parse(r.keep0)[i]) ? null : KEEP[i]).filter(Boolean));
  check(id + ' 그 밖의 S 전체 불변(전체 비교)', snap(r.s, EXC.concat(['job', 'jobSince', 'flags', 'logHistory', 'employer'])) === r.allowedBefore);
  check(id + ' 기존 연표 항목 내용 동일', JSON.stringify(r.s.logHistory.slice(0, r.n0)) === r.log0);
};
test('RT-1 retired·sealed → 서포터 [합성 상태 주입]', () => { const r = rtTransition('sealed'); rtCommon('RT-1', r); check('RT-1 sealed 유지·falna 플래그 없음 유지(자동 복구 없음)', r.s.falnaState === 'sealed' && !r.s.flags.includes('falna')); });
test('RT-2 retired·unbound → 서포터 [합성 상태 주입]', () => { const r = rtTransition('unbound'); rtCommon('RT-2', r); check('RT-2 falna 플래그·unbound 유지', r.s.falnaState === 'unbound' && r.s.flags.includes('falna')); });
test('RT-3 retired·팔나 none → 서포터 [합성 상태 주입]', () => { const r = rtTransition('none'); rtCommon('RT-3', r); check('RT-3 falnaHistory 0 유지', r.s.falnaHistory.length === 0 && r.s.falnaState === 'none'); });
test('RT-4 retired + 고용처 → 서포터(E-1) [합성 상태 주입]', () => {
  const r = rtTransition('sealed', { employer: 'hostess' });
  check('RT-4 E-1 연표 1건·employer null·지급 0·고용처 문구 노출', r.s.employer === null && r.s.logHistory.filter(x => x.kind === 'employer_quit').length === 1 && r.T.G('globalThis.__applyCalls').length === 0);
  rtCommon('RT-4', r);
});
// RT-5: 소속·active 팔나 유지 retired. join_hard(hasFamilia:false)로는 도달 불가 → 공통 resolve 를 합성 pending 으로 직접 호출(방어 검증).
const rt5 = (patch = []) => {
  const { prep } = require('./lib_f1_fixture');
  const f = prep({ job: 'retired', tenure: 3, age: 30, ctx: { patch: AMT.patch.concat(patch) } }); retiredFixture(f.T, f.s, 'active');
  f.T.G("S.relations = [{ id: 1, type: 'family', subType: 'parent', isFamily: true, alive: true, age: 60 }, { id: 2, type: 'family', subType: 'sibling', isFamily: true, alive: true, age: 28 }]; S.nextRelationId = 3;");
  f.T.G("S.currentEventId = 'join_hard'; createFollowup('recruit_after_fail', { route: 'persistence', reason: 'rejected' }); S.currentEventId = null; S.pendingFollowup.phase = 'awaiting_choice';");
  const before = JSON.parse(JSON.stringify(f.s)), n0 = f.s.logHistory.length;
  f.T.G("chooseFollowup('supporter')");
  return { ...f, before, n0 };
};
const F = {
  F1: (s, b) => s.flags.includes('falna') && s.falnaState === 'active' && s.falnaHolder === 'loki' && JSON.stringify(s.conversionPending) === JSON.stringify(b.conversionPending),
  F2: (s, b) => s.familia && s.familia.id === 'loki' && JSON.stringify(s.familia) === JSON.stringify(b.familia) && s.familiaAt === b.familiaAt,
  F3: (s, b) => ['abil', 'level', 'maxLevel', 'hidden', 'feat', 'excelia', 'power'].every(k => JSON.stringify(s[k]) === JSON.stringify(b[k])),
  F4: (s, b) => ['relations', 'parentFamilia', 'partnerId', 'nextRelationId'].every(k => JSON.stringify(s[k]) === JSON.stringify(b[k])),
  F5: (s, b, n0) => ['falnaHistory', 'familiaHistory', 'falnaTransitions', 'levelHistory', 'milestones', 'aspirationHistory', 'alias'].every(k => JSON.stringify(s[k]) === JSON.stringify(b[k])) && JSON.stringify(s.logHistory.slice(0, n0)) === JSON.stringify(b.logHistory) };
const RT5F = (s, b, n0) => { const a = JSON.parse(JSON.stringify(s)); const x = JSON.parse(JSON.stringify(b));
  ['pendingFollowup', 'currentEventId', 'syncBaseline', 'followupSeq'].forEach(k => { delete a[k]; delete x[k]; });
  const okAllowed = a.job === 'supporter' && a.jobSince === s.age && JSON.stringify(a.flags) === JSON.stringify(x.flags.concat(['supporter'])) && a.logHistory.length === n0 + 1;
  ['job', 'jobSince', 'flags', 'logHistory'].forEach(k => { delete a[k]; delete x[k]; });
  return okAllowed && JSON.stringify(a) === JSON.stringify(x); };
const rtEval = r => Object.fromEntries(Object.entries(F).map(([k, fn]) => [k, !!fn(r.s, r.before, r.n0)]).concat([['RT5F', RT5F(r.s, r.before, r.n0)]]));
test('RT-5 소속·active 팔나 retired → 서포터: 금지 5항목 독립 검사 + 전체 비교 [합성 상태 주입, join_hard 도달 불가 경로의 방어 검증]', () => {
  const r = rt5(), e = rtEval(r);
  Object.keys(e).forEach(k => check('RT-5 ' + k, e[k] === true));
  check('RT-5 지급 0(retired)', sevSnap(r.T).eligible === false && r.s.valis === r.before.valis);
});
test('RT-M 단일 필드 변이(scope 종료 후 삽입) — 해당 assert 와 RT5F 만 실패', () => {
  const at = "        S.pendingFollowup = null; S.currentEventId = null;         // f. 정리(단순 대입만)";
  const M = { 'RT-M1': "S.flags = S.flags.filter(f => f !== 'falna');", 'RT-M2': 'S.familia = null;', 'RT-M3': 'S.abil.str = 0;', 'RT-M4': 'S.relations.pop();', 'RT-M5': 'S.milestones.pop();' };
  const want = { 'RT-M1': 'F1', 'RT-M2': 'F2', 'RT-M3': 'F3', 'RT-M4': 'F4', 'RT-M5': 'F5' };
  for (const [id, code] of Object.entries(M)) {
    const e = rtEval(rt5([['script.js', at, at + "\n        if (S.job === 'supporter' && S.familia !== undefined && globalThis.__rtm !== 1) { globalThis.__rtm = 1; " + code + ' }']]));
    const failed = Object.keys(e).filter(k => !e[k]);
    check(id + ' 실패 = [' + want[id] + ', RT5F]', JSON.stringify(failed) === JSON.stringify([want[id], 'RT5F']), failed);
  }
});
test('RT-MI 통합 변이(범위 안 실제 함수 호출) — 예상 실패 목록', () => {
  const at = "        setJob('supporter');\n        if (!(S.job === 'supporter'";
  const M = { 'RT-MI1 sealByGodReturn': ['sealByGodReturn();', ['F1', 'F2', 'F5', 'RT5F']], 'RT-MI2 leaveFamilia': ['leaveFamilia();', ['F1', 'F2', 'F5', 'RT5F']], 'RT-MI3 apply 오호출': ['apply({ valis: 1 });', ['F3', 'RT5F']] };
  for (const [id, [code, want]] of Object.entries(M)) {
    const e = rtEval(rt5([['script.js', at, '        ' + code + '\n' + at]]));
    const failed = Object.keys(e).filter(k => !e[k]);
    check(id + ' 실패 = [' + want.join(', ') + ']', JSON.stringify(failed) === JSON.stringify(want), failed);
  }
});
// RT-6~8: free_supporter_route 기존 조건 그대로(N6-5)
const fsr = (T) => T.G("match(EVENTS.find(e => e.id === 'free_supporter_route').cond)");
test('RT-6~8 free_supporter_route 노출 판정(조건 무변경) [합성 상태 주입]', () => {
  { const r = rtTransition('sealed', { before: (T, s) => { s.valis = 2000; } }); check('RT-6 sealed·무소속·valis≤3000 → true', fsr(r.T) === true && r.s.falnaState === 'sealed' && !r.s.flags.includes('falna'));
    r.s.valis = 3001; check('RT-6b valis 3001 → false', fsr(r.T) === false);
    r.s.valis = 2000; r.s.done.push('free_supporter_route'); check('RT-6c once 발생 후 사건 풀 제외', r.s.done.includes('free_supporter_route')); }
  { const r = rtTransition('unbound', { before: (T, s) => { s.valis = 2000; } }); check('RT-7 unbound(falna 플래그) → false', fsr(r.T) === false); }
  { const r = rt5(); r.s.valis = 2000; check('RT-8 소속 유지 → false', fsr(r.T) === false); }
  const T = rtTransition('sealed').T; check('조건 원문 무변경', JSON.stringify(T.G("EVENTS.find(e => e.id === 'free_supporter_route').cond")) === JSON.stringify({ age: [16, 50], job: ['supporter'], noFlags: ['falna'], hasFamilia: false, max: { valis: 3000 } }));
});
test('RT-9 retired 선택지 문구(S-1)', () => {
  const f = openFollowup({ job: 'retired', tenure: 1, age: 21 });
  check('RT-9', f.T.buttons()[0].textContent === '은퇴 생활을 접고 서포터 일을 시작한다');
});
test('RT-10 전직 후 연간 활동: 기존 supporter 규칙(N6-6) [합성 상태 주입]', () => {
  for (const falna of ['active', 'unbound', 'sealed', 'none']) {
    const r = falna === 'active' ? rt5() : rtTransition(falna);
    r.T.G('S.excelia = 0; S.potential = 0;'); const c0 = r.T.calls(), st0 = r.s.falnaState, fh0 = JSON.stringify(r.s.falnaHistory), fl0 = r.s.flags.includes('falna');
    r.T.G('yearlyActivity()');
    const grewAbil = JSON.stringify(r.s.abil) !== JSON.stringify(r.before ? r.before.abil : null);
    if (falna === 'active' || falna === 'unbound') check('RT-10 ' + falna + ': excelia→능력치 경로(potential 0 유지)', r.s.potential === 0 && (r.s.excelia === 0) && (falna === 'active' ? grewAbil : true));
    else check('RT-10 ' + falna + ': potential 증가·excelia 0', r.s.potential > 0 && r.s.excelia === 0);
    check('RT-10 ' + falna + ': Math.random 1회·팔나 상태·이력·플래그 불변', r.T.calls() === c0 + 1 && r.s.falnaState === st0 && JSON.stringify(r.s.falnaHistory) === fh0 && r.s.flags.includes('falna') === fl0);
  }
});

finish('f1_transition_test');
