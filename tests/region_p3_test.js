// F1D4A P3 — 지역·기관 조건(의도적 변경 ①) 시험. 설계: r3.20 D-INSTITUTION §2·§3·§5·§6, D-REGION §2·§3·§5·§6, 00_INDEX E-2.
// 범위(구현): DI-1 조직 데이터, atSiteOf·inRecruitAreaOf, DI-4(career_choice[0]·[1] 선택지 조건, guild_counter·waitstaff_shift 사건 조건),
//   DR-3 ritual, §3.3·§3.4 clash·festival·sea, DR-5 conscript[1] 도주 성공 위치, F-B retire[1] 이주, F-D hero_sacrifice.
// 보류(이 시험은 "바뀌지 않았음"만 확인): DR-2 B(conscript 사건 조건), DR-2 A, tavern(DR-4/W1), lost_child·city_disaster 문안, F-F, F-C, HS-1(P4).
// 모두 각 시험마다 새 vm 컨텍스트. 출생지·거주지·위치는 합성 상태 주입(placeAt)이며, 사건 경로는 실제 EVENTS 데이터와 실제 showEvent/choose 를 쓴다.
// 사용: node tests/region_p3_test.js — 실패 1건 이상이면 종료 코드 1.
const { makeCtx, makeReporter, setAge, snap } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;

// 합성 상태 주입: 출생지·거주지·위치를 각각 지정(서로 독립). 이력은 출생 1구간으로 둔다.
function placeAt(T, { origin, residence, location, age = 20, job } = {}) {
  T.G('startLife()'); const s = T.S(); setAge(s, age); s.hp = 100; s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''");
  if (origin) s.origin = T.G('gachaData').origins.find(o => o.id === origin);
  const res = residence || s.origin.id, loc = location || res;
  s.residence = { regionId: res, since: 0 }; s.residenceHistory = [{ seq: 1, regionId: res, from: 0, to: null, reason: 'birth', eventId: null }];
  s.location = { regionId: loc, since: 0 }; s.locationHistory = [{ seq: 1, regionId: loc, from: 0, to: null, reason: 'birth', eventId: null }];
  if (job) s.job = job;
  return s;
}
const E = (T, id) => T.G('EVENTS').find(e => e.id === id);
const cond = (T, id) => T.G(`match(EVENTS.find(e => e.id === ${JSON.stringify(id)}).cond)`);
const visLabels = (T, id) => T.G(`visibleChoices(EVENTS.find(e => e.id === ${JSON.stringify(id)})).map(c => c.label)`);
const withRandom = (T, v, fn) => { T.G(`var __mr = Math.random; Math.random = () => ${v}`); try { return fn(); } finally { T.G('Math.random = __mr'); } };
const REGIONS = ['orario', 'rakia', 'melen', 'far_east', 'telskyura', 'elven_forest', 'unknown'];

// ── DI-1 조직 데이터 ───────────────────────────────────────────────────────────────
test('DI-1 조직 데이터: recruitArea(조직 단위) · sites[](지점 단위, scope 는 지점) · 외부 지부 미등록(DI-2)', () => {
  const T = makeCtx(); const orgs = T.G('gachaData.organizations');
  const g = orgs.find(o => o.id === 'guild'), h = orgs.find(o => o.id === 'hostess');
  check('DI-1a guild', JSON.stringify(g.recruitArea) === '["orario"]' && g.sites.length === 1 && g.sites[0].siteId === 'guild_hq' && g.sites[0].region === 'orario' && g.sites[0].kind === 'hq'
    && JSON.stringify(g.sites[0].scope) === '["adventurer_registration","magic_stone_exchange","quest_board"]', g);
  check('DI-1b hostess', JSON.stringify(h.recruitArea) === '["orario"]' && h.sites.length === 1 && h.sites[0].siteId === 'hostess_orario' && h.sites[0].region === 'orario' && h.sites[0].kind === 'shop'
    && JSON.stringify(h.sites[0].scope) === '["tavern_service"]', h);
  check('DI-1c 조직은 2개 그대로 · scope 는 조직 단위에 없음 · 외부 지부(region ≠ orario) 0', orgs.length === 2 && orgs.every(o => !('scope' in o)) && orgs.every(o => o.sites.every(st => st.region === 'orario')));
});

// ── atSiteOf · inRecruitAreaOf 판정 ──────────────────────────────────────────────────
test('E-2 atSiteOf·inRecruitAreaOf: 현재 위치만 봄(거주지·출생지 무관) · 지역별 판정', () => {
  for (const loc of REGIONS) {
    const T = makeCtx(); placeAt(T, { origin: 'orario', residence: 'orario', location: loc });
    const want = loc === 'orario';
    check('AS-1 위치 ' + loc + ' (출생·거주 orario) → ' + want, ['guild', 'hostess'].every(o => T.G(`match({ atSiteOf: '${o}' })`) === want && T.G(`match({ inRecruitAreaOf: '${o}' })`) === want));
  }
  const T = makeCtx(); placeAt(T, { origin: 'melen', residence: 'rakia', location: 'orario' });
  check('AS-2 출생 melen · 거주 rakia · 위치 orario → 참(위치 기준)', T.G("match({ atSiteOf: 'guild' })") === true && T.G("match({ inRecruitAreaOf: 'hostess' })") === true);
});
test('E-2 fail-closed: 알 수 없는 조직 · 문자열이 아닌 값 · 위치 없음 → 거짓', () => {
  const T = makeCtx(); const s = placeAt(T, { location: 'orario' });
  for (const v of ["'__nope__'", "['guild']", '1', 'true', '{}']) check('AS-3 값 ' + v + ' → false', T.G(`match({ atSiteOf: ${v} })`) === false && T.G(`match({ inRecruitAreaOf: ${v} })`) === false);
  s.location = null; check('AS-4 위치 없음 → false', T.G("match({ atSiteOf: 'guild' })") === false && T.G("match({ inRecruitAreaOf: 'guild' })") === false);
});
// P3 보완(ChatGPT 1차 검수 REJECT): 키가 있으면 값과 무관하게 검사 — falsy 값('' · null · false · 0 · undefined)도 거짓(우회 차단).
const FALSY = ["''", 'null', 'false', '0', 'undefined'];
test('E-2 falsy 값 우회 차단: match · choiceMatch · 사건 조건 · 선택지 조건(visibleChoices · chooseBody) 모두 거짓', () => {
  for (const key of ['atSiteOf', 'inRecruitAreaOf']) for (const v of FALSY) {
    const T = makeCtx(); const s = placeAt(T, { location: 'orario', age: 30 });   // 위치 orario: 정상 값이면 참이 되는 상태에서 확인
    check(`FS-1 ${key}: ${v} → match 거짓`, T.G(`match({ ${key}: ${v} })`) === false);
    check(`FS-2 ${key}: ${v} → choiceMatch 거짓(형식 오류)`, T.G(`choiceMatch({ ${key}: ${v} })`) === false && T.G(`choiceCondValid({ ${key}: ${v} })`) === false);
    T.G(`EVENTS.push({ id: '__fs_ev', w: 0, text: 't', cond: { ${key}: ${v} }, choices: [{ label: 'a', text: 'aa', fx: {} }] })`);
    check(`FS-3 ${key}: ${v} → 사건 조건 후보 아님`, T.G("match(EVENTS.find(e => e.id === '__fs_ev').cond)") === false);
    T.G(`EVENTS.push({ id: '__fs_ch', w: 0, text: 't', cond: {}, choices: [{ label: '보임', text: 'ok', fx: {} }, { label: 'X', cond: { ${key}: ${v} }, text: 'xx', fx: { valis: 777 } }] })`);
    check(`FS-4 ${key}: ${v} → 선택지 숨김`, JSON.stringify(T.G("visibleChoices(EVENTS.find(e => e.id === '__fs_ch')).map(c => c.label)")) === '["보임"]');
    T.G("showEvent(EVENTS.find(e => e.id === '__fs_ch'))"); const b = snap(s), c0 = T.calls();
    T.G("chooseBody(EVENTS.find(e => e.id === '__fs_ch').choices[1])");
    const d = T.G("followupDiagLog.filter(d => d.event === 'hidden_choice_rejected')");
    check(`FS-5 ${key}: ${v} → chooseBody 거부(cond_malformed) · S·난수 불변`, snap(s) === b && T.calls() === c0 && d.length === 1 && d[0].reason === 'cond_malformed', d);
  }
  const T = makeCtx(); placeAt(T, { location: 'orario' });
  check('FS-6 대조: 정상 문자열은 참(위치 orario)', T.G("match({ atSiteOf: 'guild' })") === true && T.G("match({ inRecruitAreaOf: 'hostess' })") === true && T.G("choiceMatch({ atSiteOf: 'guild' })") === true);
  check('FS-7 키가 없으면 검사하지 않음(다른 조건만)', T.G('match({})') === true && T.G("match({ job: [S.job] })") === true);
});
test('E-2 순수성: 판정이 S·난수·연표·진단을 바꾸지 않음', () => {
  const T = makeCtx(); const s = placeAt(T, { location: 'orario' }); const b = snap(s), c0 = T.calls(), d0 = T.G('followupDiagLog.length');
  T.G("for (let i = 0; i < 20; i++) { match({ atSiteOf: 'guild' }); match({ inRecruitAreaOf: 'hostess' }); choiceMatch({ inRecruitAreaOf: 'guild' }); }");
  check('AS-5', snap(s) === b && T.calls() === c0 && T.G('followupDiagLog.length') === d0);
});
// D-INSTITUTION §6: recruitArea ≠ sites.region 인 합성 조직 · 합성 지부 추가
test('D-INSTITUTION §6: recruitArea 와 sites 는 따로 판정(합성 조직) · 합성 지부 추가 시 atSiteOf 만 참', () => {
  const T = makeCtx(); placeAt(T, { location: 'melen' });
  T.G("gachaData.organizations.push({ id: '__synth', label: 's', recruitArea: ['rakia'], sites: [{ siteId: 's1', region: 'melen', kind: 'shop', scope: [] }] })");
  check('DI-6a 위치 melen: atSiteOf 참 · inRecruitAreaOf 거짓(모집 지역 rakia)', T.G("match({ atSiteOf: '__synth' })") === true && T.G("match({ inRecruitAreaOf: '__synth' })") === false);
  T.S().location = { regionId: 'rakia', since: 0 };
  check('DI-6b 위치 rakia: atSiteOf 거짓 · inRecruitAreaOf 참', T.G("match({ atSiteOf: '__synth' })") === false && T.G("match({ inRecruitAreaOf: '__synth' })") === true);
  const U = makeCtx(); placeAt(U, { location: 'melen' });
  U.G("gachaData.organizations.find(o => o.id === 'guild').sites.push({ siteId: '__melen_branch', region: 'melen', kind: 'branch', scope: [] })");
  check('DI-6c 합성 지부(melen) 추가 → atSiteOf guild 참, recruitArea 는 그대로라 inRecruitAreaOf guild 거짓', U.G("match({ atSiteOf: 'guild' })") === true && U.G("match({ inRecruitAreaOf: 'guild' })") === false
    && JSON.stringify(U.G("gachaData.organizations.find(o => o.id === 'guild').recruitArea")) === '["orario"]');
});

// ── DI-4 career_choice ───────────────────────────────────────────────────────────
test('DI-4 career_choice: 오라리오 8개, 그 밖 6개(길드·풍요의 여주인 숨김), 데이터 인덱스·순서 불변', () => {
  const T0 = makeCtx(); const cc = E(T0, 'career_choice');
  check('CC-0 데이터: [0] inRecruitAreaOf guild, [1] inRecruitAreaOf hostess, [2]~[7] 조건 없음, 8개',
    cc.choices.length === 8 && JSON.stringify(cc.choices[0].cond) === '{"inRecruitAreaOf":"guild"}' && JSON.stringify(cc.choices[1].cond) === '{"inRecruitAreaOf":"hostess"}' && cc.choices.slice(2).every(c => !('cond' in c))
    && cc.choices[0].fx.job === 'guild_staff' && cc.choices[1].fx.job === 'waitstaff');
  for (const loc of REGIONS) {
    const T = makeCtx(); placeAt(T, { location: loc, age: 15, job: 'child' });
    const v = visLabels(T, 'career_choice'), want = loc === 'orario' ? 8 : 6;
    check('CC-1 위치 ' + loc + ' → 보이는 선택지 ' + want, v.length === want && (loc === 'orario' || (!v.includes('길드의 견습 직원이 된다') && !v.includes('주점 ‘풍요의 여주인’에서 일한다'))), v);
  }
  const T = makeCtx(); placeAt(T, { origin: 'orario', residence: 'orario', location: 'melen', age: 15, job: 'child' });
  check('CC-2 출생·거주 orario 라도 위치 melen 이면 6개(위치 기준)', visLabels(T, 'career_choice').length === 6);
});
test('DI-4 career_choice 직접 클릭·자동 진행(EN-6): 오라리오 밖 6개 버튼에서 R2 1회, 숨긴 선택지는 고를 수 없음', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const T = makeCtx({ seed, timers: 'queue' }); const s = placeAt(T, { location: 'rakia', age: 15, job: 'child' }); T.el('auto').checked = true;
    T.G("showEvent(EVENTS.find(e => e.id === 'career_choice'))");
    const nb = T.buttons().length, c0 = T.calls(); T.runTimer();
    check('CC-3 seed ' + seed + ' 버튼 6 · 자동 진행 후 guild_staff/waitstaff 아님 · 고용처 없음', nb === 6 && T.calls() - c0 >= 1 && !['guild_staff', 'waitstaff'].includes(s.job) && !s.employer, { nb, job: s.job });
  }
  const T = makeCtx(); const s = placeAt(T, { location: 'melen', age: 15, job: 'child' }); T.G("showEvent(EVENTS.find(e => e.id === 'career_choice'))");
  const b = snap(s), c0 = T.calls(); T.G("chooseBody(EVENTS.find(e => e.id === 'career_choice').choices[0])");
  check('CC-4 숨긴 [0](길드) 직접 호출 거부 · 상태·난수 불변 · 진단 cond_unmet', snap(s) === b && T.calls() === c0 && T.G("followupDiagLog.filter(d => d.event === 'hidden_choice_rejected').map(d => d.reason).join()") === 'cond_unmet');
  const U = makeCtx(); const u = placeAt(U, { location: 'orario', age: 15, job: 'child' }); U.G("showEvent(EVENTS.find(e => e.id === 'career_choice'))"); U.buttons()[0].click();
  check('CC-5 오라리오에서 [0] 클릭 → guild_staff · 고용처 guild', u.job === 'guild_staff' && u.employer && u.employer.id === 'guild');
});

// ── DI-4 근무 사건 ───────────────────────────────────────────────────────────────
test('DI-4 guild_counter·waitstaff_shift: 직업 + 실제 고용처 + 현재 시설 위치 모두 필요', () => {
  for (const [id, job, org] of [['guild_counter', 'guild_staff', 'guild'], ['waitstaff_shift', 'waitstaff', 'hostess']]) {
    const T0 = makeCtx(); const c = E(T0, id).cond;
    check('WK-0 ' + id + ' 조건 데이터', JSON.stringify(c.job) === JSON.stringify([job]) && JSON.stringify(c.employerIn) === JSON.stringify([org]) && c.atSiteOf === org && Array.isArray(c.age), c);
    const mk = (loc, withEmp, j = job) => { const T = makeCtx(); const s = placeAt(T, { location: loc, age: 30, job: j }); if (withEmp) T.G(`joinOrganization('${org}')`); s.job = j; return T; };
    check('WK-1 ' + id + ' 오라리오 · 고용처 있음 → 후보', cond(mk('orario', true), id) === true);
    check('WK-2 ' + id + ' 오라리오 · 고용처 없음 → 아님', cond(mk('orario', false), id) === false);
    check('WK-3 ' + id + ' 위치 melen · 고용처 있음 → 아님(시설 없음)', cond(mk('melen', true), id) === false);
    check('WK-4 ' + id + ' 다른 직업 · 고용처 있음 · 오라리오 → 아님', cond(mk('orario', true, 'merchant'), id) === false);
  }
});
test('DI-3 이주 뒤 고용처·직업 유지, 근무 사건만 멈춤', () => {
  const T = makeCtx(); const s = placeAt(T, { location: 'orario', age: 30, job: 'child' }); T.G("joinOrganization('hostess')");
  check('MV-0 준비: waitstaff · hostess · 후보', s.job === 'waitstaff' && s.employer.id === 'hostess' && cond(T, 'waitstaff_shift') === true);
  T.G("moveResidence('melen', 'event'); moveLocation('melen', 'event')");
  check('MV-1 이주 뒤 직업·고용처 그대로, 근무 사건 후보 아님', s.job === 'waitstaff' && s.employer && s.employer.id === 'hostess' && cond(T, 'waitstaff_shift') === false);
  T.G("moveLocation('orario', 'event')");
  check('MV-2 위치만 오라리오로 돌아오면 다시 후보(거주지 melen 이어도)', s.residence.regionId === 'melen' && cond(T, 'waitstaff_shift') === true);
});

// ── DR-3 ritual ──────────────────────────────────────────────────────────────────
test('DR-3 ritual: 출생지와 거주지가 모두 텔스큐라', () => {
  const T0 = makeCtx(); check('RT-0 조건 데이터', JSON.stringify(E(T0, 'ritual').cond) === '{"cage":[14,22],"origin":["telskyura"],"residenceIn":["telskyura"]}');
  const cases = [[{ origin: 'telskyura', residence: 'telskyura' }, true], [{ origin: 'telskyura', residence: 'orario' }, false], [{ origin: 'orario', residence: 'telskyura' }, false],
    [{ origin: 'telskyura', residence: 'telskyura', location: 'orario' }, true]];
  for (const [p, want] of cases) { const T = makeCtx(); placeAt(T, { ...p, age: 16 }); check('RT-1 ' + JSON.stringify(p) + ' → ' + want, cond(T, 'ritual') === want); }
});

// ── §3.3 · §3.4 clash · festival · sea ───────────────────────────────────────────
test('§3.3·§3.4 clash·festival = 위치 orario, sea = 위치 melen (출생지 무관)', () => {
  const T0 = makeCtx();
  check('LC-0 조건 데이터: origin 키 없음, locationIn', ['clash', 'festival'].every(id => JSON.stringify(E(T0, id).cond.locationIn) === '["orario"]' && !('origin' in E(T0, id).cond))
    && JSON.stringify(E(T0, 'sea').cond.locationIn) === '["melen"]' && !('origin' in E(T0, 'sea').cond));
  for (const loc of REGIONS) for (const origin of ['orario', 'melen', 'rakia']) {
    const T = makeCtx(); placeAt(T, { origin, residence: origin, location: loc, age: 30 });
    check(`LC-1 출생 ${origin} · 위치 ${loc}`, cond(T, 'clash') === (loc === 'orario') && cond(T, 'festival') === (loc === 'orario') && cond(T, 'sea') === (loc === 'melen'));
  }
});

// ── DR-5 conscript[1] 도주 성공 ──────────────────────────────────────────────────
test('DR-5 conscript[1] 도주 성공: 거주지·위치 둘 다 orario(이유 fled), 출생지·다른 상태 불변', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'rakia', residence: 'rakia', age: 20 });
  const before = { job: s.job, familia: s.familia && s.familia.id, falna: s.falnaState, flags: JSON.stringify(s.flags), rel: JSON.stringify(s.relations), items: JSON.stringify(s.items), employer: JSON.stringify(s.employer || null) };
  T.G("showEvent(EVENTS.find(e => e.id === 'conscript'))");
  withRandom(T, 0.0, () => T.G("choose(EVENTS.find(e => e.id === 'conscript').choices[1])"));
  const RH = s.residenceHistory, LH = s.locationHistory;
  check('DR5-a 거주 orario · 이력 2구간 · 이유 fled · 사건 conscript', s.residence.regionId === 'orario' && RH.length === 2 && RH[1].reason === 'fled' && RH[1].eventId === 'conscript', RH);
  check('DR5-b 위치 orario · 이력 2구간 · 이유 fled · 사건 conscript', s.location.regionId === 'orario' && LH.length === 2 && LH[1].reason === 'fled' && LH[1].eventId === 'conscript' && LH[0].to === LH[1].from, LH);
  check('DR5-c 출생지 rakia 유지 · 직업·소속·팔나·플래그·가족·아이템·고용처 불변', s.origin.id === 'rakia' && s.job === before.job && (s.familia && s.familia.id) === before.familia && s.falnaState === before.falna
    && JSON.stringify(s.flags) === before.flags && JSON.stringify(s.relations) === before.rel && JSON.stringify(s.items) === before.items && JSON.stringify(s.employer || null) === before.employer);
  const U = makeCtx(); const u = placeAt(U, { origin: 'rakia', residence: 'rakia', age: 20 }); U.G("showEvent(EVENTS.find(e => e.id === 'conscript'))");
  withRandom(U, 0.999, () => U.G("choose(EVENTS.find(e => e.id === 'conscript').choices[1])"));
  check('DR5-d 도주 실패: 거주·위치 rakia 그대로, 이력 1구간', u.residence.regionId === 'rakia' && u.location.regionId === 'rakia' && u.residenceHistory.length === 1 && u.locationHistory.length === 1);
});
// F1D4A P4(의도적 시험 변경, 사용자 결정 2026-11-27 "규칙 D만 적용"): D-REGION §3.1 규칙 D(다른 지역 거주 라키아 출생자는 징집 대상 아님, 게임 고유)만 적용한다.
//   원래 단언: cond === {"cage":[17,28],"origin":["rakia"]}. DR-2 A(아레스 병사 동원)·B(무소속 조건)·C(종속 파밀리아)는 여전히 보류(미구현).
test('DR-2 규칙 D만 적용: conscript 사건 조건 = origin rakia + residenceIn rakia(달력 17~28). A·B·C 보류', () => {
  const T = makeCtx(); check('HOLD-1', JSON.stringify(E(T, 'conscript').cond) === '{"cage":[17,28],"origin":["rakia"],"residenceIn":["rakia"]}');
  for (const res of REGIONS) { const U = makeCtx(); placeAt(U, { origin: 'rakia', residence: res, location: res, age: 20 });
    check('HOLD-1d 라키아 출생 · 거주 ' + res + ' → 징집 후보 ' + (res === 'rakia'), cond(U, 'conscript') === (res === 'rakia')); }
});

// ── F-B retire[1] ────────────────────────────────────────────────────────────────
test('F-B retire[1] 메렌 이주: 거주지·위치 melen(이유 retirement), 출생지 유지, 직업 retired', () => {
  const T0 = makeCtx(); const fx = E(T0, 'retire').choices[1].fx;
  check('FB-0 효과 데이터', fx.residence === 'melen' && fx.location === 'melen' && fx.residenceReason === 'retirement' && fx.locationReason === 'retirement' && fx.job === 'retired' && fx.hp === 12 && JSON.stringify(fx.flags) === '["fisher"]');
  const T = makeCtx(); const s = placeAt(T, { origin: 'orario', residence: 'orario', age: 50, job: 'merchant' });
  const fam = s.familia && s.familia.id, emp = JSON.stringify(s.employer || null);
  T.G("showEvent(EVENTS.find(e => e.id === 'retire'))"); T.buttons()[1].click();
  check('FB-1 거주·위치 melen · 이유 retirement · 사건 retire', s.residence.regionId === 'melen' && s.location.regionId === 'melen' && s.residenceHistory[1].reason === 'retirement' && s.locationHistory[1].reason === 'retirement'
    && s.residenceHistory[1].eventId === 'retire' && s.locationHistory[1].eventId === 'retire', [s.residenceHistory, s.locationHistory]);
  check('FB-2 출생지 orario · 직업 retired · 소속·고용처 불변', s.origin.id === 'orario' && s.job === 'retired' && (s.familia && s.familia.id) === fam && JSON.stringify(s.employer || null) === emp);
  const U = makeCtx(); const u = placeAt(U, { origin: 'melen', residence: 'melen', age: 50 }); U.G("showEvent(EVENTS.find(e => e.id === 'retire'))"); U.buttons()[1].click();
  check('FB-3 이미 melen 거주·위치 → 이력 추가 없음(같은 지역 이동 없음)', u.residenceHistory.length === 1 && u.locationHistory.length === 1 && u.job === 'retired');
  const V = makeCtx(); const v = placeAt(V, { origin: 'orario', residence: 'orario', age: 50 }); V.G("showEvent(EVENTS.find(e => e.id === 'retire'))"); V.buttons()[0].click();
  check('FB-4 retire[0](후배 교육)은 이주 없음', v.residence.regionId === 'orario' && v.location.regionId === 'orario' && v.residenceHistory.length === 1);
});

// ── F-D hero_sacrifice ───────────────────────────────────────────────────────────
test('F-D hero_sacrifice: 위치 orario 일 때만(게임 고유 규칙), 레벨 관문 유지', () => {
  const T0 = makeCtx(); check('FD-0 조건 데이터', JSON.stringify(E(T0, 'hero_sacrifice').cond) === '{"age":[20,60],"min":{"level":6},"locationIn":["orario"]}');
  for (const loc of REGIONS) {
    const T = makeCtx(); const s = placeAt(T, { origin: 'orario', residence: 'orario', location: loc, age: 35, job: 'adventurer' }); s.level = 6;
    check('FD-1 Lv6 · 위치 ' + loc + ' → ' + (loc === 'orario'), cond(T, 'hero_sacrifice') === (loc === 'orario'));
  }
  const T = makeCtx(); const s = placeAt(T, { location: 'orario', age: 35 }); s.level = 5;
  check('FD-2 Lv5 · 위치 orario → 아님(레벨 관문)', cond(T, 'hero_sacrifice') === false);
});

// ── 보류 항목·다른 사건 불변 ───────────────────────────────────────────────────────
test('보류 항목은 바뀌지 않음: tavern · lost_child · city_disaster · healer_shift · join_hard · 방문 사건 5종', () => {
  const T = makeCtx();
  // F1D4A P4(의도적 시험 변경): healer_shift 는 HS-1(D-REGION §8.0.1)로 locationIn:['orario'] 를 받으므로 보류 목록에서 빼고 아래 HS-1 단언으로 옮긴다.
  check('HS-1 healer_shift 조건 = 기존 + locationIn orario 만', JSON.stringify(E(T, 'healer_shift').cond) === '{"age":[18,80],"job":["healer"],"locationIn":["orario"]}' && (E(T, 'healer_shift').choices || []).every(c => !c.cond));
  for (const id of ['tavern', 'lost_child', 'city_disaster', 'join_hard', 'buy_dual_potion', 'craft_drop_weapon', 'buy_pyonkichi', 'magic_sword_crozzo', 'buy_elemental_cloth']) {
    const e = E(T, id); if (!e) { check('HOLD-2 ' + id + ' (데이터에 없음)', true); continue; }
    const keys = JSON.stringify([e.cond || {}].concat((e.choices || []).map(c => c.cond || null)));
    check('HOLD-2 ' + id + ' 에 지역·시설 조건 키 없음', !/locationIn|residenceIn|atSiteOf|inRecruitAreaOf|dungeonReach/.test(keys), keys);
  }
});
test('EN-5 독립성: P3 사건 조건은 위치·거주지·출생지를 서로 바꾸지 않음(판정만)', () => {
  const T = makeCtx(); const s = placeAt(T, { origin: 'telskyura', residence: 'melen', location: 'orario', age: 16 }); const b = snap(s), c0 = T.calls();
  T.G("EVENTS.forEach(e => { match(e.cond, e); visibleChoices(e); })");
  check('EN-5', snap(s) === b && T.calls() === c0 && s.origin.id === 'telskyura' && s.residence.regionId === 'melen' && s.location.regionId === 'orario');
});

R.finish('region_p3_test');
