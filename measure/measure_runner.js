'use strict';

// GA-INV-2 측정 사본 러너(측정 전용 사본). 원본: f639c05 test_runner.js(measure/base_f639c05/test_runner.js, 바이트 동일 사본).
// 바뀐 곳: ① 측정 모듈 상태 결정과 실행 허용 판단(vm 생성 전) ② 소스 확인 S1~S5·단일 TEXTS ③ 계측 모드에서만 endLife 래퍼 연결·finishMeasurement 호출
//          ④ 하네스 라이브러리·소스 경로를 measure/base_f639c05 로 고정. 측정 상태는 표준 오류에만 쓰고 표준 출력은 원본과 같게 둔다.
// Browser-compatible integration runner. It executes data.js, events.js, core/*.js and script.js.
// No npm packages (including uuid) are required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, 'base_f639c05');   // ORIGINAL_SRC_ROOT(f639c05 작업 트리의 9개 소스 + tests/lib)

// ===== GA-INV-2 측정 모듈 상태 결정(§4.2zr R2) — 러너의 첫 실행 문장들. 이 블록 앞에서는 process 리스너를 등록하지 않는다 =====
const crypto = require('crypto');
const HEX64 = /^[0-9a-f]{64}$/;
const shaHex = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const ORIGINAL_SRC_ROOT = ROOT;
const MEASURE_SRC_ROOT = path.join(__dirname, 'measure_src');
const MEASURE_MODULE_PATH = process.env.SIM_MEAS_MODULE ? path.resolve(process.env.SIM_MEAS_MODULE) : path.join(__dirname, 'measure_module.js');   // 시험(고장 주입)만 바꾼다
const FIXED_SOURCE_FILES = Object.freeze(['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js']);
const ORIGINAL_SHA = Object.freeze({
    'data.js': '4c856e75ad9060b7b73dd089cb64198b960df16672a925258e3dbfe6471cebf7',
    'events.js': 'e5c1b042eaed234ef6bfc529ac8a776c58942aa580227b4874636e2f54abe520',
    'core/aging.js': '4544c8be1bf76c74536c062818c6e075a22926e502bba7f16a4be2bfb6f34881',
    'core/growth.js': '35d782a73f14feffd69c246826d399591f94e9acb65774a90ee2107344bb747b',
    'core/relations.js': '7aad574bded11fe03ed09c6c51036dc686d5d4c004049b849cb67e5caed990f6',
    'core/items.js': '42ebf1d29c2b678675f17ac34db0529b024d6b5ecb7bc611182ef808f11a99f0',
    'core/recruit.js': 'b897fb3a2488d6f40dc4b661d8ca39a1987ddc0f4ac9bc24e950413ba663485a',
    'core/lineage.js': '729f3796b6c3150c08262870e52e34650e987ede3d8e599631192c8dea85a7c8',
    'script.js': 'bdfb603b9b2467b39ff6f222e8f5915a7b332e081b2964869bf835a48ea446b1' });
const MEASURE_SCRIPT_SHA = process.env.SIM_MEAS_SHA_UNDEFINED === '1' ? undefined : 'f5ab42d6fed93e5223545522f48b11ece37decc9db51dce8e0baa93bee26f56c';   // 측정 사본 script.js 의 SHA-256(시험 25n16 만 미정으로 둔다)
const MEASURE_SHA = Object.freeze(Object.assign({}, ORIGINAL_SHA, { 'script.js': MEASURE_SCRIPT_SHA }));
let MEAS_STATE = null, MEAS_REASON = null, MEAS = null;
if (typeof MEASURE_SCRIPT_SHA !== 'string' || !HEX64.test(MEASURE_SCRIPT_SHA)) {
    MEAS_STATE = 'unavailable'; MEAS_REASON = 'measure_sha_undefined';    // 모듈을 require 하지 않는다(코드 미실행)
} else {
    let loaded = false;
    try { MEAS = require(MEASURE_MODULE_PATH); loaded = true; }
    catch (_) { MEAS_STATE = 'inactive_unknown'; MEAS_REASON = 'module_load_failed'; }
    if (loaded) {
        try {
            const r = MEAS.init();                                           // 러너의 유일한 init 호출 위치(⑭)
            const s = (r !== null && typeof r === 'object') ? r.state : undefined;
            MEAS_STATE = (s === 'active' || s === 'inactive_clean' || s === 'inactive_residual' || s === 'inactive_unknown') ? s : 'inactive_unknown';
            MEAS_REASON = (r !== null && typeof r === 'object' && typeof r.reason === 'string') ? r.reason : (MEAS_STATE === s ? null : 'bad_init_result');
        } catch (_) { MEAS_STATE = 'inactive_unknown'; MEAS_REASON = 'init_threw'; }
    }
}
console.error('measurement: state=' + MEAS_STATE + ' reason=' + MEAS_REASON);
const RUN_ALLOWED_STATES = Object.freeze(['active', 'inactive_clean', 'unavailable']);
if (!RUN_ALLOWED_STATES.includes(MEAS_STATE)) {
    console.error('측정 모듈 상태 ' + MEAS_STATE + (MEAS_REASON ? '(' + MEAS_REASON + ')' : '') + ': 게임 실행을 거부합니다(vm 생성 전).');
    process.exitCode = 1;
    process.exit();
}
const ACTIVE = (MEAS_STATE === 'active');
const SRC_ROOT = ACTIVE ? MEASURE_SRC_ROOT : ORIGINAL_SRC_ROOT;
const EXPECT_SHA = ACTIVE ? MEASURE_SHA : ORIGINAL_SHA;
const RUNS = Number.isInteger(Number(process.env.SIM_RUNS)) ? Math.max(1, Number(process.env.SIM_RUNS)) : 3000;
const MAX_ACTIONS_PER_LIFE = 3000;
const SEED = Number.isInteger(Number(process.env.SIM_SEED)) ? Number(process.env.SIM_SEED) >>> 0 : 20261104;

const { createRng } = require(path.join(ROOT, 'tests', 'lib', 'rng_core.js'));   // F1D4A P1: 같은 함수를 공통 소스로 옮김(Chromium 측정과 공유). 내용은 F1 과 같다

const { makeElement, makeDocument } = require(path.join(ROOT, 'tests', 'lib', 'mock_dom.js'));   // F1D4A P1: 모의 DOM 을 공통 소스로 옮김. 내용은 F1 과 같다

function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed');
}

const rng = createRng(SEED);
// F1D4A P1: RNG 지점 기록(SIM_RNG_SITES=<출력 파일> 일 때만 켬). 호출마다 스택을 분류해 적을 뿐, 난수열·호출 수는 바꾸지 않는다.
const SITE_OUT = process.env.SIM_RNG_SITES || null;
let siteRecorder = null;   // 조립 문자열이 만들어진 뒤(아래) 채운다
const recordedRandom = function recordedRandom() { siteRecorder.note(new Error().stack); return rng(); };
const math = Object.create(Math);
Object.defineProperty(math, 'random', { value: SITE_OUT ? recordedRandom : rng });
const document = makeDocument();
const sandbox = {
    console,
    assert,
    Math: math,
    document,
    window: { scrollTo() {} },
    setTimeout(callback) { if (typeof callback === 'function') callback(); return 0; },
    clearTimeout() {},
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Date,
    JSON,
    Intl,
    __rngState: () => rng.getState(),
    __rngRestore: value => rng.setState(value),
    __rngCalls: () => rng.calls(),
    __lifeDump: process.env.SIM_LIFE_DUMP ? [] : undefined,
    __NEWBORN_MEMBERSHIP: process.env.SIM_NEWBORN_MEMBERSHIP === '1' ? true : undefined,   // A/B: 1 = v1.7.1 방식(출생 즉시 입단)
    __HP_REGEN_MODE: process.env.SIM_HP_REGEN_MODE || undefined   // A/B 비교용(physical|calendar|off). 기본: 게임 기본값(physical)
};

// F1D4A P1: 하네스 라이브러리(시험 전용). 아래 두 소스는 integrationScript 안에 그대로 넣는다(공통 드라이버는 Chromium 측정에서도 같은 소스를 쓴다).
const COMMIT_QUEUE_SRC = fs.readFileSync(path.join(ROOT, 'tests', 'lib', 'commit_queue.js'), 'utf8').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');   // 끝의 module.exports 줄만 뺀다
const DRIVER_CORE_SRC = fs.readFileSync(path.join(ROOT, 'tests', 'lib', 'driver_core.js'), 'utf8');

const sourceFiles = [
    'data.js',
    'events.js',
    'core/aging.js',
    'core/growth.js',
    'core/relations.js',
    'core/items.js',
    'core/recruit.js',
    'core/lineage.js',
    'script.js'
];
// ===== 소스 확인 S1~S5(§4.2zp R3): 실패하면 vm 생성 전 중단 =====
let TEXTS = null;
try {
    const sameList = Array.isArray(sourceFiles) && sourceFiles.length === FIXED_SOURCE_FILES.length && FIXED_SOURCE_FILES.every((f, i) => sourceFiles[i] === f);   // S1
    if (!sameList) throw new Error('sourceFiles differs from fixed list');
    const keys = Object.keys(EXPECT_SHA);
    if (!(keys.length === FIXED_SOURCE_FILES.length && FIXED_SOURCE_FILES.every(f => keys.includes(f)))) throw new Error('EXPECT_SHA keys differ');   // S2
    if (!FIXED_SOURCE_FILES.every(f => typeof EXPECT_SHA[f] === 'string' && HEX64.test(EXPECT_SHA[f]))) throw new Error('EXPECT_SHA value format');     // S3
    TEXTS = FIXED_SOURCE_FILES.map(file => fs.readFileSync(path.join(SRC_ROOT, file), 'utf8'));                                                        // S5 고정 순서
    const bad = FIXED_SOURCE_FILES.filter((file, i) => shaHex(TEXTS[i]) !== EXPECT_SHA[file]);                                                         // S4
    if (bad.length > 0) throw new Error('source sha mismatch: ' + bad.join(', '));
} catch (error) {
    console.error('측정 사본 소스 확인 실패(vm 생성 전 중단):', error && error.message);
    process.exitCode = 1;
    process.exit();
}
const source = TEXTS.join('\n;\n');   // 기존 71 과 같은 순서·구분자

const integrationScript = `
(function runIntegrationTests() {
    const results = {
        seed: ${SEED}, requestedRuns: ${RUNS}, completedRuns: 0,
        runtimeExceptions: 0, guardTrips: 0, invariantFailures: [],
        eventCount: 0, uniqueEvents: {}, eventCountsByJob: {},
        adventurerEvents: 0, supporterEvents: 0, retiredEvents: 0,
        retiredDaysEvents: 0, livesThatRetired: 0,
        finalLevelDistribution: {}, finalJobDistribution: {}, maxLevelReached: 0,
        falnaLives: 0, preFalnaLivesWithPotential: 0,
        recruit2bb: { livesApplied: 0, livesWithRejection: 0, livesAppliedNeverAccepted: 0, applications: 0, direct: 0, blocked: 0, blockedByReason: {}, byRouteOutcome: {}, maxGeneralPerLife: 0, currentLeftAtLifeEnd: 0, badOutcome: 0, acceptedWithoutMembership: 0, rejectedButJoined: 0, badDirect: 0, cooldownViolations: 0, sameFamiliaViolations: 0, capViolations: 0, membershipLivesPct: 0, rejectionAmongAppliedPct: 0 },
        totalPotential: 0, totalPostFalnaAbility: 0,
        nonFiniteValues: 0, negativeGrowthValues: 0,
        invalidPartnerStates: 0, childWithoutPartner: 0,
        partnerBreakups: 0, partnerDeaths: 0, familyRelationsGenerated: 0,
        partnerDeathsNatural: 0, partnerDeathsEvent: 0, livesWithPartner: 0, livesWithMultiplePartners: 0,
        familyDeaths: 0, familyDeathsNatural: 0, childrenBorn: 0, youngerSiblingsBorn: 0, livesWithBereavement: 0,
        livesWithParentsAtBirth: 0, livesWithoutAnyFamily: 0, familyPartnerOverlap: 0,
        livesReachedLv6: 0, livesReachedLv6InWindow: 0, heroSacrificeFired: 0, heroSacrificeWon: 0,
        itemPurchases: 0, itemsConsumedTotal: 0, livesWithConsumedItem: 0, rescueUses: 0, powerBoostUses: 0,
        familiaJoins: {}, familiaJoinJobOverwrites: 0, calendarVsPhysicalGapLives: 0, maxAgeGap: 0,
        deathCauseCounts: { natural: 0, hp: 0, event: 0 },
        v17UnitTests: {}, v177: { beastmanLives: 0, subtypeDist: {}, subtypeErrors: 0, nonBeastWithSubtype: 0, childhoodMissing: 0, childhoodDup: 0, livesPast2: 0, levelHistoryErrors: 0, maxLevelErrors: 0, levelUps: 0, livesWithFalnaRecord: 0, roleCounts: {}, roleErrors: 0, protectedNeverFalnaViolations: 0, memberNeverReceivedFalna: 0, protectedDungeon: 0, protectedWargame: 0, protectedHasFamiliaEvents: {}, protectedFameCredits: 0, fameSystemPresent: false }, organizationJoins: {}, preFalnaAdventurerEvents: {}, timeline: { lives: 0, livesWithMembership: 0, livesWithMultipleMemberships: 0, livesWithEmployer: 0, memberships: 0, viaParent: 0, joinedWithFalnaAlreadyHeld: 0, membershipsWithoutFalna: 0, gapSum: 0, gapN: 0, gapMax: 0, gapHist: {}, negativeGaps: 0, overlappingMemberships: 0, falnaGrants: 0, falnaWithoutMembership: 0, falnaFlagWithoutHistory: 0, adventurerBeforeFalna: 0, adventurerLives: 0, joinAges: {} }, dungeonEventAudit: {}, negativeHpWhileAlive: 0, negativeHpAtDeath: 0, hpDeathsWithRescueLeft: 0, minHpSeenAlive: Infinity,
        raceStats: {},
        eventGateViolations: 0, eventGateViolationSamples: [],
        averageChronologicalAge: 0, averagePhysicalAge: 0, partnerAge100StillActiveUnitTest: false,
        familiaOccupationUnitTests: {},
        minObservedAgingRate: Infinity, agingFloorUnitTest: false,
        relationshipUnitTests: {}, growthUnitTests: {},
        resultRenderingUnitTest: false, partnerFlagDependencyCount: 0,
        screenSwitchUnitTest: false, autoProgressUnitTest: false,
        levelUpFeatOnlyUnitTest: false, relationTerminationUnitTests: {},
        firstRuntimeError: null, neverFiredEvents: []
    };
    const invariant = (condition, message) => {
        if (!condition) results.invariantFailures.push(message);
    };

    // Unit tests: final aging floor and the real race object shape (S.race.id).
    {
        const testState = {
            age: 20, chronologicalAge: 20, physicalAge: 20, phase: 20,
            race: { id: 'elf', label: '엘프' }, flags: ['falna'], level: 12
        };
        const before = testState.physicalAge;
        const aging = GameCore.Aging.advanceYear(testState, MODS);
        results.agingFloorUnitTest = aging.rate >= GameCore.Aging.MIN_FINAL_AGING_RATE
            && Math.abs((testState.physicalAge - before) - 0.1) < 1e-9
            && testState.phase === 20;
        assert(results.agingFloorUnitTest, 'aging floor / S.race.id unit test failed');
    }

    // Unit tests: age >= 18 for both people, <= 10-year gap, no family/deceased/second partner.
    {
        const S = {
            age: 25, partnerId: null, nextRelationId: 1,
            relations: [
                { id: 'family', type: 'family', subType: 'sibling', age: 23, alive: true },
                { id: 'dead', type: 'friend', age: 25, alive: false },
                { id: 'young', type: 'friend', age: 17, alive: true },
                { id: 'gap', type: 'friend', age: 36, alive: true },
                { id: 'adult', type: 'friend', age: 33, alive: true },
                { id: 'edge10', type: 'friend', age: 35, alive: true },
                { id: 'cousin', type: 'relative', subType: 'cousin', age: 24, alive: true }
            ]
        };
        const eligible = GameCore.Relations.getEligiblePartners(S).map(item => item.id);
        assert(eligible.length === 2 && eligible.includes('adult') && eligible.includes('edge10'), 'eligible partner / inclusive age-gap boundary filtering failed');
        const teen = { age: 17, partnerId: null, relations: [{ id: 'adult', type: 'friend', age: 20, alive: true }] };
        assert(GameCore.Relations.getEligiblePartners(teen).length === 0, 'protagonist under 18 passed partner filter');
        const adultTarget = { age: 25, partnerId: null, relations: [{ id: 'minor', type: 'friend', age: 17, alive: true }] };
        const adultAtBoundary = { age: 18, partnerId: null, relations: [{ id: 'adult18', type: 'friend', age: 18, alive: true }] };
        assert(GameCore.Relations.getEligiblePartners(adultAtBoundary).length === 1, 'age 18 adult boundary was rejected');
        assert(GameCore.Relations.marry(adultTarget, 'minor') === false, 'minor partner was accepted');
        assert(GameCore.Relations.marry(S, 'adult') === true, 'valid adult partner was rejected');
        assert(GameCore.Relations.marry(S, 'gap') === false, 'second concurrent partner was accepted');
        S.relations.find(item => item.id === 'adult').alive = false;
        assert(GameCore.Relations.hasPartner(S) === false, 'deceased partner remained active');
        assert(GameCore.Relations.marry(S, 'gap') === false, 'age-gap partner was accepted after partner death');
        S.relations.push({ id: 'valid2', type: 'friend', age: 27, alive: true });
        assert(GameCore.Relations.marry(S, 'valid2') === true, 'valid partner after prior partner death was rejected');
        results.relationshipUnitTests = {
            eligibleIds: eligible,
            underageProtagonistBlocked: true,
            underageTargetBlocked: true,
            age18BoundaryAccepted: true,
            exactlyTenYearGapAccepted: true,
            familyAndDeceasedBlocked: true,
            ageGapOverTenBlocked: true,
            duplicatePartnerBlocked: true,
            deceasedCurrentPartnerCanBeReplaced: true
        };
    }
    // Regression tests: collision-proof IDs, preservation of social subtype, explicit breakup/death hooks.
    {
        const relState = { age: 30, partnerId: null, nextRelationId: 1, relations: [] };
        const first = GameCore.Relations.createRomanticPartner(relState, 'test');
        assert(!!first, 'initial romantic relation creation failed');
        first.relationshipStatus = 'ended';
        relState.partnerId = null;
        relState.nextRelationId = 1; // Simulate a stale/restored counter.
        const second = GameCore.Relations.createRomanticPartner(relState, 'test');
        assert(!!second && second.id !== first.id, 'relation ID collision was not avoided');
        assert(relState.relations.length === 2 && relState.relations.includes(first), 'failed creation removed an older record');

        const friendState = { age: 30, partnerId: null, relations: [{ id: 'friend-1', type: 'friend', subType: 'rival', age: 30, alive: true }] };
        assert(GameCore.Relations.marry(friendState, 'friend-1') === true, 'valid friend could not become partner');
        assert(friendState.relations[0].type === 'friend' && friendState.relations[0].subType === 'rival', 'romance overwrote existing social relationship');

        const breakupState = { age: 30, partnerId: null, relations: [{ id: 'breakup-1', type: 'friend', age: 30, alive: true }] };
        assert(GameCore.Relations.marry(breakupState, 'breakup-1') === true, 'breakup test partner setup failed');
        assert(GameCore.Relations.endRelationship(breakupState, 'breakup-1', 'breakup') === true, 'breakup end hook failed');
        assert(breakupState.partnerId === null && breakupState.relations[0].alive === true && breakupState.relations[0].relationshipStatus === 'ended', 'breakup state is invalid');

        const deathState = { age: 30, partnerId: null, relations: [{ id: 'death-1', type: 'friend', age: 30, alive: true }] };
        assert(GameCore.Relations.marry(deathState, 'death-1') === true, 'death test partner setup failed');
        assert(GameCore.Relations.endRelationship(deathState, 'death-1', 'deceased') === true, 'partner-death end hook failed');
        assert(deathState.partnerId === null && deathState.relations[0].alive === false && deathState.relations[0].relationshipStatus === 'ended', 'partner-death state is invalid');
        results.relationTerminationUnitTests = { collisionSafe: true, subtypePreserved: true, breakupHook: true, deathHook: true };
    }

    // Unit tests: incompatible/missing/negative amounts and per-stat cap are guarded.
    {
        const S = {
            race: { id: 'human' }, talent: { id: 'none' }, flags: [],
            potential: 0, excelia: 0,
            abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }
        };
        GameCore.Growth.addExperience(S, -50);
        GameCore.Growth.addExperience(S, NaN);
        GameCore.Growth.addExperience(S, 25);
        assert(S.potential === 25 && S.excelia === 0, 'pre-Falna potential growth failed');
        S.flags.push('falna');
        GameCore.Growth.addExperience(S, undefined);
        GameCore.Growth.addExperience(S, 20);
        GameCore.Growth.convertExcelia(S, MODS);
        assert(S.excelia === 0 && GameCore.Growth.getAbilityTotal(S) > 0, 'post-Falna excelia conversion failed');
        S.excelia = 1e12;
        S.flags.push('liaris');
        GameCore.Growth.convertExcelia(S, MODS);
        assert(Object.values(S.abil).every(value => Number.isFinite(value) && value >= 0 && value <= GameCore.Growth.LIARIS_CAP), 'ability cap/finite guard failed');
        results.growthUnitTests = {
            preFalnaNegativeAndNaNIgnored: true,
            postFalnaExceliaConverted: true,
            liarisCap: GameCore.Growth.LIARIS_CAP,
            allAbilitiesFiniteAndNonNegative: true
        };
    }

    // Regression test: gaining a feat alone must re-check an already-qualified ability threshold.
    {
        S = {
            age: 30, chronologicalAge: 30, physicalAge: 30, phase: 30,
            hp: 70, power: 0, potential: 0, excelia: 0, feat: 0, level: 1, hidden: 0,
            bond: 0, valis: 0, abil: { str: 500, vit: 0, dex: 0, agi: 0, mag: 0 },
            flags: ['falna'], items: [], relations: [], partnerId: null, nextRelationId: 1,
            race: { id: 'human' }, origin: { id: 'orario' }, talent: { id: 'none' },
            familia: null, job: 'adventurer', eventCounts: {}, lastEventPhase: {}, recentEvents: [],
            milestones: [], logHistory: [], cause: ''
        };
        apply({ feat: 1 });
        results.levelUpFeatOnlyUnitTest = S.level === 2 && S.feat === 0;
        assert(results.levelUpFeatOnlyUnitTest, 'feat-only level-up recheck failed');
    }

    // UI state and auto-progress path: use synchronous mock timers to exercise the real handlers.
    {
        switchScreen('screen-play');
        results.screenSwitchUnitTest = $('screen-play').classList.contains('active')
            && !$('screen-start').classList.contains('active');
        assert(results.screenSwitchUnitTest, 'screen transition failed');
        switchScreen('screen-start');
        $('auto').checked = true;
        $('btn-start').click();
        results.autoProgressUnitTest = !!S.cause && $('screen-result').classList.contains('active');
        assert(results.autoProgressUnitTest, 'auto-progress did not reach result screen');
        $('btn-retry').click();
        assert($('screen-start').classList.contains('active'), 'retry did not return to start screen');
        $('auto').checked = false;
    }

    // Familia defaults must not overwrite an already selected occupation.
    {
        const previousState = S;
        const previousFamilias = gachaData.familias;
        const makeJobState = (job) => ({
            age: 20, chronologicalAge: 20, physicalAge: 20, phase: 20, hp: 70, power: 0,
            potential: 0, excelia: 0, feat: 0, level: 0, hidden: 0, bond: 0, valis: 0,
            abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }, flags: job === 'supporter' ? ['supporter'] : [],
            items: [], relations: [], partnerId: null, nextRelationId: 1, logHistory: [],
            origin: { id: 'orario' }, race: { id: 'human' }, talent: { id: 'none' },
            familia: null, falnaAt: null, job, eventCounts: {}, lastEventPhase: {}, recentEvents: [],
            milestones: [], cause: ''
        });
        try {
            gachaData.familias = [{ id: 'hephaestus', label: '헤파이스토스 파밀리아', desc: 'test', weight: 1 }];
            S = makeJobState('child');
            rollFamilia();
            const hephaestusMapsToBlacksmith = S.job === 'blacksmith' && S.flags.includes('crafter') && !S.flags.includes('adventurer');
            assert(hephaestusMapsToBlacksmith, 'Hephaestus Familia did not select blacksmith as its child default');

            gachaData.familias = [{ id: 'hestia', label: '헤스티아 파밀리아', desc: 'test', weight: 1 }];
            S = makeJobState('supporter');
            rollFamilia();
            const supporterJobPreserved = S.job === 'supporter' && S.flags.includes('supporter') && !S.flags.includes('adventurer');
            assert(supporterJobPreserved, 'joining a Familia overwrote the existing supporter occupation');
            results.familiaOccupationUnitTests = { hephaestusDefaultsToBlacksmith: true, existingSupporterPreserved: true };
        } finally {
            gachaData.familias = previousFamilias;
            S = previousState;
        }
    }

    // The current relation model has no natural lifespan system for NPC partners.
    {
        const state = { age: 45, partnerId: null, relations: [{ id: 'long-lived', type: 'friend', age: 55, alive: true }] };
        assert(GameCore.Relations.marry(state, 'long-lived') === true, 'long-lived partner fixture setup failed');
        for (let year = 0; year < 45; year++) { state.age += 1; GameCore.Relations.advanceYear(state); }
        results.partnerAge100StillActiveUnitTest = state.relations[0].age === 100 && GameCore.Relations.hasPartner(state);
        assert(results.partnerAge100StillActiveUnitTest, 'expected current no-NPC-mortality behavior did not reproduce');
    }

    // ===== v1.7 unit tests (use the real functions; fixtures only set up the scenario) =====
    {
        const fresh = (over) => {
            startLife();
            Object.assign(S, over || {});
            return S;
        };
        const T = results.v17UnitTests;

        // (a) Familia -> default occupation mapping, driven through the real rollFamilia().
        {
            const previous = gachaData.familias;
            const joinJob = (familiaId, startJob) => {
                gachaData.familias = [{ id: familiaId, label: familiaId, desc: 't', weight: 1 }];
                fresh({ job: 'child', flags: [], familia: null, falnaAt: null });
                if (startJob !== 'child') setJob(startJob);
                rollFamilia();
                return S.job;
            };
            try {
                const map = { ares: 'soldier', kali: 'soldier', hephaestus: 'blacksmith', demeter: 'farmer', miach: 'healer', loki: 'adventurer', freya: 'adventurer', hestia: 'adventurer' };
                const wrong = Object.keys(map).filter(id => joinJob(id, 'child') !== map[id]);
                T.familiaDefaultJobMapping = wrong.length === 0;
                assert(T.familiaDefaultJobMapping, 'familia default job mapping mismatch: ' + wrong.join(','));
                const keep = ['merchant', 'supporter', 'healer', 'guild_staff', 'retired', 'farmer'];
                const overwritten = [];
                ['ares', 'kali', 'loki', 'hephaestus'].forEach(id => keep.forEach(job => { if (joinJob(id, job) !== job) overwritten.push(id + ':' + job); }));
                T.familiaNeverOverwritesExistingJob = overwritten.length === 0;
                assert(T.familiaNeverOverwritesExistingJob, 'familia join overwrote an existing job: ' + overwritten.join(','));
                T.familiaIndependentOfJob = (() => { gachaData.familias = [{ id: 'ares', label: 'a', desc: 't', weight: 1 }]; fresh(); setJob('merchant'); rollFamilia(); return !!S.familia && S.familia.id === 'ares' && S.job === 'merchant'; })();
                assert(T.familiaIndependentOfJob, 'familia and job are not independent');
            } finally { gachaData.familias = previous; }
        }

        // (b) cond.age (physical) vs cond.cage (calendar) with a real long-lived elf.
        {
            fresh({ race: gachaData.races.find(r => r.id === 'elf'), flags: ['falna'], level: 3 });
            S.age = 0; S.physicalAge = 0; S.phase = 0;
            for (let year = 0; year < 80; year++) GameCore.Aging.advanceYear(S, MODS);
            const gap = S.age - S.phase;
            T.ageSplitGap = gap;
            T.condAgeVsCage = gap >= 20
                && match({ cage: [S.age - 1, S.age + 1] }) === true && match({ age: [S.age - 1, S.age + 1] }) === false
                && match({ age: [S.phase, S.phase] }) === true && match({ cage: [S.phase, S.phase] }) === false
                && match({ age: [S.phase - 1, S.phase + 1], cage: [S.age - 1, S.age + 1] }) === true;
            assert(T.condAgeVsCage, 'cond.age / cond.cage did not use physical / calendar ages respectively');
            const cageEvents = EVENTS.filter(e => e.cond && e.cond.cage).map(e => e.id);
            T.calendarAgeEvents = cageEvents;
            const joinEvent = EVENTS.find(e => e.id === 'join');
            T.joinUsesCalendarAge = !!(joinEvent.cond.cage && !joinEvent.cond.age);
            assert(T.joinUsesCalendarAge, 'join event is not on the calendar-age condition');
        }

        // (c) Family generation: real S.relations, family never a romance candidate, race rules.
        {
            let withParents = 0, none = 0, wrongRace = 0, romance = 0, parentsOlder = 0, count = 0;
            for (let i = 0; i < 400; i++) {
                fresh();
                const fam = S.relations.filter(r => r.isFamily === true);
                count += fam.length;
                if (S.race.id === 'xenos' && fam.length) wrongRace += 1;
                if (S.race.id === 'amazon' && fam.some(r => r.name === '아버지')) wrongRace += 1;
                if (fam.some(r => r.subType === 'parent')) withParents += 1;
                if (fam.length === 0) none += 1;
                if (fam.some(r => r.subType === 'parent' && !(r.age > S.age))) parentsOlder += 1;
                if (GameCore.Relations.getEligiblePartners(Object.assign({}, S, { age: 25 })).some(r => r.isFamily)) romance += 1;
                if (fam.some(r => !r.id || (r.alive === false && !r.endReason) || !r.race || r.physicalAge == null)) wrongRace += 1;
            }
            T.familyGeneration = { sampled: 400, recordsTotal: count, withParents, withoutAnyFamily: none, raceRuleViolations: wrongRace, familyInPartnerPool: romance, parentNotOlder: parentsOlder };
            assert(count > 400 && withParents > 300 && wrongRace === 0 && romance === 0 && parentsOlder === 0, 'family generation invariants failed: ' + JSON.stringify(T.familyGeneration));
        }

        // (d) Partner mortality through the real advanceYear(): natural / accident death, never overwritten.
        {
            let allDied = 0, trials = 120, overwritten = 0, partnerCleared = 0, causes = { deceased_natural: 0, deceased_event: 0 };
            for (let i = 0; i < trials; i++) {
                fresh({ age: 30, physicalAge: 30, phase: 30, relations: [], partnerId: null, nextRelationId: 1 });
                const partner = GameCore.Relations.createRomanticPartner(S, 'unit', { races: gachaData.races, mods: MODS });
                assert(partner && partner.physicalAge != null && partner.race, 'partner metadata missing');
                let firstReason = null;
                for (let year = 0; year < 400 && partner.alive !== false; year++) { S.age += 1; GameCore.Relations.advanceYear(S, MODS); }
                if (partner.alive === false) {
                    allDied += 1; firstReason = partner.endReason;
                    if (causes[firstReason] !== undefined) causes[firstReason] += 1;
                    if (S.partnerId === null) partnerCleared += 1;
                    for (let year = 0; year < 30; year++) { S.age += 1; GameCore.Relations.advanceYear(S, MODS); }
                    if (partner.endReason !== firstReason) overwritten += 1;
                }
            }
            T.partnerMortality = { trials, died: allDied, partnerLinkCleared: partnerCleared, endReasonOverwritten: overwritten, causes };
            assert(allDied === trials && partnerCleared === trials && overwritten === 0 && causes.deceased_natural > 0, 'partner mortality failed: ' + JSON.stringify(T.partnerMortality));
        }

        // (e) Breakup keeps the person alive, and a finished relationship is not revived by later years.
        {
            fresh({ age: 30, physicalAge: 30, phase: 30, relations: [], partnerId: null, nextRelationId: 1 });
            const partner = GameCore.Relations.createRomanticPartner(S, 'unit', { races: gachaData.races, mods: MODS });
            GameCore.Relations.endRelationship(S, partner.id, 'breakup');
            for (let year = 0; year < 10; year++) { S.age += 1; GameCore.Relations.advanceYear(S, MODS); if (!partner.alive) break; }
            const breakupOk = partner.endReason === 'breakup' && partner.relationshipStatus === 'ended' && S.partnerId === null && GameCore.Relations.hasPartner(S) === false;
            // 10년 안에 파트너가 먼저 사망했다면(자연사 규칙) 이별 상태 검사는 해당 없음 — 실패(false)로 기록하지 않는다.
            T.breakupKeepsAliveAndEnded = breakupOk ? true : (partner.alive === false ? 'not_applicable_partner_died_first' : false);
            assert(T.breakupKeepsAliveAndEnded !== false, 'breakup state lost');
        }

        // (f) Items: consumed via the real choose()/apply() paths.
        {
            fresh({ hp: 60 });
            apply({ getItem: 'dual_potion' });
            const hadPotion = S.items.includes('dual_potion') && S.itemUses.dual_potion === 1;
            choose({ label: 'x', text: '큰 부상을 입었다.', fx: { hp: -50 } });
            const rescued = hadPotion && !S.items.includes('dual_potion') && S.hp >= 40 && !S.cause && S.itemsConsumed.includes('dual_potion');
            fresh();
            recompute();
            const powerWithout = S.power;
            apply({ getItem: 'magic_sword' });
            recompute();
            const swordKept = S.items.includes('magic_sword') && S.itemUses.magic_sword === 3;
            const noPassivePower = S.power === powerWithout;            // 소모품은 소지만으로 전투력을 올리지 않는다
            S.level = 1; S.flags.push('falna');
            let boosted = 0;
            for (let i = 0; i < 6 && S.items.includes('magic_sword'); i++) {
                const before = S.itemUses.magic_sword;
                choose({ label: 'x', chance: { p: 0.1, stat: 'power', per: 0, ok: { text: 'ok', fx: {} }, fail: { text: 'fail', fx: {} } } });
                if (S.itemUses.magic_sword < before || !S.items.includes('magic_sword')) boosted += 1;
                if ($('choices').kids && S.cause) break;
            }
            const swordSpent = boosted === 3 && !S.items.includes('magic_sword');
            fresh();
            apply({ getItem: 'pyonkichi' });
            const capRaised = GameCore.Items.hpCap(S) === 115;
            S.hp = 100; apply({ hp: 30 });
            const hpAboveBase = S.hp === 115;
            fresh();
            apply({ getItem: 'custom_weapon' }); apply({ getItem: 'custom_weapon' });
            recompute();
            const weaponCounted = S.items.filter(i => i === 'custom_weapon').length === 1 && GameCore.Items.equipmentPower(S) === 40;
            fresh();
            apply({ getItem: 'grimoire', feat: 5, flags: ['magic_user'] });
            const grimoireConsumed = !S.items.includes('grimoire') && S.itemsConsumed.includes('grimoire') && S.feat >= 5;
            T.items = { potionStoredWithUses: hadPotion, potionRescuedAndConsumed: rescued, swordStoredWithThreeUses: swordKept, consumableGivesNoPassivePower: noPassivePower, swordSpentOverThreeChecks: swordSpent, armorRaisesHpCap: capRaised, hpCapApplied: hpAboveBase, equipmentNotStacked: weaponCounted, instantConsumableUsedOnAcquire: grimoireConsumed };
            assert(Object.values(T.items).every(Boolean), 'item unit tests failed: ' + JSON.stringify(T.items));
        }

        // (f2) v1.7.1: HP 회복 단위, 연간 피해 직후 구조 포션, 음수 HP 규칙.
        {
            const human = gachaData.races.find(r => r.id === 'human');
            fresh({ race: human, job: 'adventurer', age: 60, chronologicalAge: 60, physicalAge: 60, phase: 60, hp: 0.5, items: [], itemUses: {}, itemsConsumed: [], relations: [] });
            apply({ getItem: 'dual_potion' });
            S.hp = 0.5;
            nextYear();
            const potionSavedAnnualDeath = !S.cause && S.itemsConsumed.includes('dual_potion') && S.hp > 0;
            fresh({ race: human, job: 'adventurer', age: 60, chronologicalAge: 60, physicalAge: 60, phase: 60, hp: 0.5, items: [], itemUses: {}, itemsConsumed: [], relations: [] });
            nextYear();
            const diesWithoutPotion = !!S.cause && S.hp === 0;
            fresh({ race: human, age: 30, chronologicalAge: 30, physicalAge: 30, phase: 30, hp: 50 });
            recoverYearly(0.25);
            const elfRate = Math.abs(S.hp - 50.25) < 1e-9;
            S.hp = 50; recoverYearly(1);
            const humanRate = Math.abs(S.hp - 51) < 1e-9;
            fresh({ hp: -56 }); S.cause = 'test'; endLife();
            const clampedAtDeath = S.hp === 0;
            T.hpRules = { annualDamagePotionRescue: potionSavedAnnualDeath, annualDamageDeathWithoutPotion: diesWithoutPotion, regenScalesWithPhysicalRate: HP_REGEN_MODE !== 'physical' || (elfRate && humanRate), deathClampsNegativeHp: clampedAtDeath };
            assert(Object.values(T.hpRules).every(Boolean), 'v1.7.1 hp rule tests failed: ' + JSON.stringify(T.hpRules));
        }

        // (h) v1.7.2: 이벤트 영역 카탈로그 전수 감사 — 정규식/예외 목록/min.level 가정 없이 모든 이벤트가 명시 분류되어야 한다.
        {
            const ids = EVENTS.map(ev => ev.id);
            const unclassified = ids.filter(id => !EVENT_AREA[id]);
            const stale = Object.keys(EVENT_AREA).filter(id => !ids.includes(id));
            const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
            const badKind = ids.filter(id => EVENT_AREA[id] && !['dungeon', 'supporter_accompany', 'surface', 'surface_ref'].includes(EVENT_AREA[id][0]));
            const refNoReason = ids.filter(id => EVENT_AREA[id] && EVENT_AREA[id][0] === 'surface_ref' && !(typeof EVENT_AREA[id][1] === 'string' && EVENT_AREA[id][1].length >= 8));
            const dungeon = ids.filter(id => EVENT_AREA[id] && EVENT_AREA[id][0] === 'dungeon');
            const dungeonMissingGate = dungeon.filter(id => { const c = EVENTS.find(ev => ev.id === id).cond || {}; const jobs = c.job || []; const okJob = jobs.includes('adventurer') || (jobs.includes('supporter') && jobs.length === 1 && c.hasFamilia === true); return !((c.flags || []).includes('falna') && okJob); });
            const accompanyBad = ids.filter(id => EVENT_AREA[id] && EVENT_AREA[id][0] === 'supporter_accompany').filter(id => { const ev = EVENTS.find(x => x.id === id), c = ev.cond || {}; return !((c.job || []).length === 1 && c.job[0] === 'supporter' && (c.noFlags || []).includes('falna') && c.hasFamilia === false && ev.once === true && ev.w <= 5 && c.max && Number.isFinite(c.max.valis)); });
            const wargameGate = (EVENTS.find(ev => ev.id === 'wargame').cond || {}).hasFamilia === true;
            T.dungeonEventAudit = { total: ids.length, dungeon: dungeon.length, byKind: ids.reduce((m, id) => { const k = (EVENT_AREA[id] || ['?'])[0]; m[k] = (m[k] || 0) + 1; return m; }, {}), unclassified, stale, dup, badKind, refNoReason, dungeonMissingGate, accompanyBad,
                wargameGate, ok: wargameGate && !unclassified.length && !stale.length && !dup.length && !badKind.length && !refNoReason.length && !dungeonMissingGate.length && !accompanyBad.length };
            results.dungeonEventAudit = T.dungeonEventAudit;
            assert(T.dungeonEventAudit.ok, 'event area catalog audit failed: ' + JSON.stringify(T.dungeonEventAudit));
        }

        // (i) v1.7.2: 파밀리아/조직 분리, 소속 이력, 부모 소속 분리.
        {
            const famIds = gachaData.familias.map(f => f.id), orgIds = (gachaData.organizations || []).map(o => o.id);
            T.orgSeparation = { familiaListHasNoOrgs: !famIds.includes('hostess') && !famIds.includes('guild'), orgsDefined: orgIds.includes('hostess') && orgIds.includes('guild') };
            const prevOrg = gachaData.organizations;
            const orgResults = {};
            ['guild', 'hostess'].forEach(id => {
                gachaData.organizations = [{ id, label: id, desc: 't', weight: 1, kind: 'x' }];
                fresh({ job: 'child', flags: [], familia: null, falnaAt: null });
                joinOrganization(id);
                orgResults[id] = { job: S.job, employer: S.employer && S.employer.id, noFamilia: S.familia === null, noFalnaAt: S.falnaAt === null, noFalna: !S.flags.includes('falna') };
            });
            fresh({ job: 'child', flags: [], familia: null, falnaAt: null }); setJob('merchant'); gachaData.organizations = [{ id: 'guild', label: 'g', desc: 't', weight: 1, kind: 'x' }]; joinOrganization('guild');
            orgResults.keepsExistingJob = S.job === 'merchant';
            gachaData.organizations = prevOrg;
            // fx.familia:'roll' 은 파밀리아만 추첨한다(조직 고용이 섞이지 않음). fx.organization 은 지정 조직에만 고용.
            let rollEmployer = 0, rollNoFamilia = 0;
            for (let i = 0; i < 400; i++) { fresh({ job: 'child', flags: [], familia: null, falnaAt: null, employer: null }); apply({ familia: 'roll' }); if (S.employer) rollEmployer += 1; if (!S.familia) rollNoFamilia += 1; }
            fresh({ job: 'child', flags: [], familia: null, employer: null }); apply({ organization: 'hostess' });
            const explicitOrg = S.employer && S.employer.id === 'hostess' && S.familia === null;
            let unknownThrows = false; try { joinOrganization('nope'); } catch (err) { unknownThrows = true; }
            T.rollIsFamiliaOnly = { rollEmployer, rollNoFamilia, explicitOrg: !!explicitOrg, unknownThrows };
            assert(rollEmployer === 0 && rollNoFamilia === 0 && explicitOrg && unknownThrows, 'familia roll path mixed with organizations: ' + JSON.stringify(T.rollIsFamiliaOnly));
            T.orgSeparation.joinOutcome = orgResults;
            T.orgSeparation.ok = T.orgSeparation.familiaListHasNoOrgs && T.orgSeparation.orgsDefined && orgResults.guild.job === 'guild_staff' && orgResults.hostess.job === 'waitstaff' && orgResults.guild.noFamilia && orgResults.hostess.noFalna && orgResults.guild.noFalnaAt && orgResults.keepsExistingJob;
            assert(T.orgSeparation.ok, 'organization separation failed: ' + JSON.stringify(T.orgSeparation));

            // 소속 이력: 가입 → 팔나 → 탈퇴 → 다른 파밀리아 재가입. 음수/겹침 없이 항목별로 남아야 한다.
            const prevF = gachaData.familias;
            gachaData.familias = [{ id: 'ares', label: 'a', desc: 't', weight: 1 }];
            fresh({ age: 14, chronologicalAge: 14, job: 'child', flags: [], familia: null, falnaAt: null, familiaHistory: [], falnaHistory: [], parentFamilia: null });
            rollFamilia(); S.falnaAt = S.age; checkFalna();
            const firstHistory = JSON.parse(JSON.stringify({ h: S.familiaHistory, f: S.falnaHistory }));
            S.age = 20; apply({ dropFamilia: true });
            gachaData.familias = [{ id: 'loki', label: 'l', desc: 't', weight: 1 }];
            S.age = 23; rollFamilia();
            const h = S.familiaHistory, fh = S.falnaHistory;
            T.familiaHistory = { first: firstHistory.h.length === 1 && firstHistory.f.length === 1 && firstHistory.h[0].falnaAt === 14, afterRejoin: h.length === 2 && h[0].leftAt === 20 && h[0].leftReason === 'left' && h[1].joinedAt === 23 && h[1].leftAt === null && h[1].falnaAlreadyHeld === true, falnaHistoryKept: fh.length === 1 && fh[0].familiaId === 'ares' && fh[0].at === 14, noNegativeGap: h.every(m => m.falnaAt == null || m.falnaAt >= m.joinedAt) };
            assert(Object.values(T.familiaHistory).every(Boolean), 'familiaHistory failed: ' + JSON.stringify(T.familiaHistory));
            gachaData.familias = prevF;

            // 부모 소속 ≠ 자녀 소속: 모든 부모 레코드에 같은 소속, 자녀(S.familia)는 입단 전 null, 정식 입단 시에만 familiaHistory.
            let parentsOk = 0, parentsTotal = 0, childAutoJoined = 0, mismatch = 0, noParentsWithFlag = 0;
            for (let i = 0; i < 600; i++) {
                startLife();
                if (S.flags.includes('parents_in_familia')) {
                    parentsTotal += 1;
                    const parents = S.relations.filter(r => r.subType === 'parent');
                    if (!parents.length) noParentsWithFlag += 1;
                    if (parents.every(r => r.familia && S.parentFamilia && r.familia.id === S.parentFamilia.id)) parentsOk += 1; else mismatch += 1;
                    if (!NEWBORN_MEMBERSHIP && S.familiaHistory.some(m => m.joinedAt === 0)) childAutoJoined += 1;
                    if (NEWBORN_MEMBERSHIP) { const m0 = S.familiaHistory[0]; if (!(S.familia && S.familia.id === S.parentFamilia.id && m0 && m0.joinedAt === 0 && m0.viaParent === true && !S.employer && S.flags.includes('born_in_familia'))) mismatch += 1; }
                } else if (S.relations.some(r => r.subType === 'parent' && r.familia)) mismatch += 1;
                if (S.cause) continue;
            }
            T.parentFamilia = { newbornControlChecked: NEWBORN_MEMBERSHIP, parentsTotal, parentsOk, mismatch, noParentsWithFlag, childAutoJoined, mode: NEWBORN_MEMBERSHIP ? 'newborn_parent_familia' : 'parent_and_child_separated' };
            assert(parentsTotal > 20 && parentsOk === parentsTotal && mismatch === 0 && noParentsWithFlag === 0 && childAutoJoined === 0, 'parent familia separation failed: ' + JSON.stringify(T.parentFamilia));
        }

        // (j) v1.7.5 2a: 입단/무명 파밀리아/명성 데이터 모델(비활성) 검증. 난수열은 저장·복원해 본 시뮬레이션에 영향을 주지 않는다.
        {
            const rngSnapshot = __rngState();
            const R = GameCore.Recruit;
            const a1 = R.createMinorFamilias({ seed: 12345, count: 6 }), a2 = R.createMinorFamilias({ seed: 12345, count: 6 }), b1 = R.createMinorFamilias({ seed: 54321, count: 6 });
            const canonLabels = gachaData.familias.map(f => f.label).concat((gachaData.organizations || []).map(o => o.label));
            const all = a1.concat(b1);
            const src = R.createMinorFamilias.toString() + R.createDerivedRng.toString();
            fresh();
            T.recruitModel = {
                fameEnumUnified: JSON.stringify(R.FAME_STAGES) === JSON.stringify(['unknown', 'local', 'orario', 'major']) && R.FAME_STAGES.every(s => R.FAME_LABELS_PERSONAL[s] && R.FAME_LABELS_FAMILIA[s]) && !Object.values(R.FAME_LABELS_PERSONAL).some(l => l.indexOf('파밀리아') >= 0) && R.FAME_LABELS_FAMILIA.major.indexOf('파밀리아') >= 0,
                tuningDefined2bb: Object.isFrozen(R.RECRUIT_TUNING) && Object.isFrozen(R.RECRUIT_TUNING.routeBase) && R.RECRUIT_TUNING.routeBase.scout === undefined && R.RECRUIT_TUNING.lifetimeApplicationCap > 0 && R.RECRUIT_TUNING.rejectCooldownYears > 0,   // 2b-b: 승인 후 수치 정의(이전: tuningEmpty)
                evaluateNoGameRng: R.evaluateApplication.toString().indexOf('Math.random') < 0,
                deterministic: JSON.stringify(a1) === JSON.stringify(a2) && JSON.stringify(a1) !== JSON.stringify(b1),
                notUsingGameRng: src.indexOf('Math.random') < 0 && R.createMinorFamilias.toString().indexOf('Math.random') < 0,
                allUnofficialMinor: all.length === 12 && all.every(f => f.kind === 'minor' && f.official === false && f.fame === 'unknown' && /^minor_[0-9]+$/.test(f.id)),
                noCanonOrReservedNames: all.every(f => !canonLabels.includes(f.label) && !R.RESERVED_NAMES.some(n => f.label.indexOf(n) >= 0)),
                uniqueNamesPerSet: new Set(a1.map(f => f.label)).size === a1.length,
                canonFamiliasTagged: gachaData.familias.filter(f => f.id !== 'civilian').every(f => f.kind === 'canon' && f.official === true),
                civilianIsNotAFamilia: (() => { const c = gachaData.familias.find(f => f.id === 'civilian'); return !!c && c.kind === 'none' && c.official === undefined; })(),
                dormant: S.minorFamilias.length === 0 && S.application.current === null && S.application.history.length === 0,
                routesDefined: R.DIRECT_ROUTES.every(r => R.ROUTES.includes(r)) && R.OUTCOMES.length === 5
            };
            // 멤버십 id: 순차·유일.
            fresh({ age: 14, chronologicalAge: 14, job: 'child', flags: [], familia: null, falnaAt: null, familiaHistory: [], falnaHistory: [], parentFamilia: null, nextMembershipId: 1 });
            const g1 = gachaData.familias; gachaData.familias = [{ id: 'ares', label: 'a', desc: 't', weight: 1 }]; rollFamilia();
            gachaData.familias = [{ id: 'loki', label: 'l', desc: 't', weight: 1 }]; S.age = 20; rollFamilia(); gachaData.familias = g1;
            T.recruitModel.membershipIdsSequential = S.familiaHistory.map(m => m.id).join(',') === '1,2';
            __rngRestore(rngSnapshot);
            assert(Object.values(T.recruitModel).every(Boolean), 'recruit model tests failed: ' + JSON.stringify(T.recruitModel));
        }

        // (k) v1.7.7 단위 테스트(난수 상태 저장·복원).
        {
            const snap = __rngState();
            const L = GameCore.Lineage;
            const src = Object.values(L).filter(v => typeof v === 'function').map(f => f.toString()).join(' ');
            fresh({ race: gachaData.races.find(r => r.id === 'beastman') });
            const st = { origin: { id: 'orario' }, race: { id: 'beastman' }, talent: { id: 'none' }, relations: [] };
            const a = L.pickBeastmanSubtype(L.lifeSeed(st)), b = L.pickBeastmanSubtype(L.lifeSeed(st));
            let varied = new Set(); for (let i = 0; i < 200; i++) varied.add(L.pickBeastmanSubtype(i * 7919 + 1).id);
            const human = { race: { label: '휴먼', id: 'human' }, raceSubtype: null };
            const beastU = { race: { label: '수인', id: 'beastman' }, raceSubtype: { label: '늑대', canon: 'unverified' } };
            const beastC = { race: { label: '수인', id: 'beastman' }, raceSubtype: { label: '고양이', canon: 'secondary_source' } };
            fresh(); S.flags = S.flags.filter(f => f !== 'falna'); S.levelHistory = []; S.level = 0;
            const l0 = levelLabel();
            S.flags.push('falna'); S.level = 3; S.levelHistory = [{ kind: 'falna' }];
            const l3 = levelLabel();
            S.flags = S.flags.filter(f => f !== 'falna');
            const lSeal = levelLabel();
            const rec = [0, 1, 2, 3].map(age => L.childhoodRecord({ lineageSeed: 5, relations: [], race: { id: 'human' } }, age));
            T.v177 = {
                lineageNoGameRng: src.indexOf('Math.random') < 0,
                subtypeDeterministic: JSON.stringify(a) === JSON.stringify(b),
                subtypeVaries: varied.size === L.BEASTMAN_SUBTYPES.length,
                noFoxSubtype: !L.BEASTMAN_SUBTYPES.some(x => x.id === 'fox'),
                unverifiedMarked: L.BEASTMAN_SUBTYPES.filter(x => x.canon === 'unverified').every(x => /비공식/.test(x.note)),
                raceLabelHuman: L.raceLabel(human) === '휴먼',
                raceLabelUnverified: L.raceLabel(beastU) === '수인(늑대·비공식 설정)',
                raceLabelSecondary: L.raceLabel(beastC) === '수인(고양이)',
                levelLabels: l0 === '팔나 없음' && l3 === 'Lv.3' && lSeal === '봉인(Lv.3)',
                childhoodStages: rec[0].stage === '신생아' && rec[1].stage === '영아기' && rec[2].stage === '유아 초기' && rec[3] === null
            };
            __rngRestore(snap);
            // v1.7.8-2i(V1a·Q19): 복원 후 {state, calls} 가 저장 시점과 같아야 한다(단위 테스트 소비분이 카운터에 남지 않음).
            results.v1aRngRestore = JSON.stringify(__rngState()) === JSON.stringify(snap) && typeof snap.calls === 'number';
            assert(results.v1aRngRestore, 'V1a rng state+calls restore failed');
            assert(Object.values(T.v177).every(Boolean), 'v1.7.7 unit tests failed: ' + JSON.stringify(T.v177));
        }

        // (g) Pre-Falna potential carries into Excelia instead of vanishing.
        {
            fresh({ race: gachaData.races.find(r => r.id === 'human'), talent: gachaData.talents.find(t => t.id === 'none') });
            S.potential = 20; S.excelia = 0; S.familia = gachaData.familias.find(f => f.id === 'loki'); S.falnaAt = S.age; S.age = Math.max(S.age, 12);
            const powerBefore = (recompute(), S.power);
            checkFalna();
            const sum = GameCore.Growth.getAbilityTotal(S);
            T.potentialCarry = { powerBefore, powerAfter: S.power, abilityTotal: sum, potentialAfter: S.potential };
            assert(S.flags.includes('falna') && S.potential === 0 && sum > 0 && S.power >= Math.floor(powerBefore / 2), 'potential carry-over failed: ' + JSON.stringify(T.potentialCarry));
        }

        // (h) Event reachability preconditions: Lv6 qualifies hero_sacrifice by the real match().
        {
            fresh({ flags: ['falna'], level: 6, job: 'adventurer' });
            S.age = 35; S.physicalAge = 35; S.phase = 35;
            if (S.location) S.location = { regionId: 'orario', since: S.location.since };   // F1D4A P3 F-E(의도적 시험 변경): F-D 로 hero_sacrifice 에 locationIn:['orario'] 이 붙어 고정 상태에 위치를 명시(레벨 관문 판정 의도 유지)
            const hero = EVENTS.find(e => e.id === 'hero_sacrifice');
            T.heroSacrificeEligibleAtLv6 = match(hero.cond) === true;
            S.level = 5;
            T.heroSacrificeBlockedBelowLv6 = match(hero.cond) === false;
            assert(T.heroSacrificeEligibleAtLv6 && T.heroSacrificeBlockedBelowLv6, 'hero_sacrifice level gate wrong');
        }
        startLife();
    }

    // The three romance-related events must use relationship state, not a bare partner flag.
    const eventReferencesPartnerFlag = (event) => {
        const condition = event.cond || {};
        if ((condition.flags || []).includes('partner') || (condition.noFlags || []).includes('partner')) return true;
        let found = false;
        const inspect = (fx) => { if (fx && Array.isArray(fx.flags) && fx.flags.includes('partner')) found = true; };
        event.choices.forEach(choice => { inspect(choice.fx); if (choice.chance) { inspect(choice.chance.ok && choice.chance.ok.fx); inspect(choice.chance.fail && choice.chance.fail.fx); } });
        return found;
    };
    results.partnerFlagDependencyCount = EVENTS.filter(eventReferencesPartnerFlag).length;
    assert(results.partnerFlagDependencyCount === 0, 'partner flag dependency remains in event data');

    // Probability guard: unknown stat names and undefined S values must not yield NaN.
    startLife();
    S.combat = undefined;
    const guardedChance = getChoiceProbability({ p: 0.6, stat: 'combat', per: 0.01 });
    assert(Number.isFinite(guardedChance) && guardedChance === 0.6, 'chance Number.isFinite guard failed');
    S.cause = '결과 문구 렌더링 테스트';
    endLife();
    const renderedResult = $('result-content').innerText;
    results.resultRenderingUnitTest = renderedResult.includes('\\n') && !renderedResult.includes('\\\\n');
    assert(results.resultRenderingUnitTest, 'result screen newline rendering failed');

    const originalShowEvent = showEvent;
    let currentLifeEvents = [];
    // ── v1.7.8-2i 계측(설계 r2k-4 §2.8, 테스트 계획 §3a·§3e·§6). 2-i 함수가 없는 빌드(v1.7.7-r1)에서도 V1·V4 계측은 동작한다. ──
    const HAS_2I = typeof deriveFalnaState === 'function' && typeof syncInvariantLog !== 'undefined';
    // R-i(v1.7.8-ri) 거주지 기록 검사 — 기록 전용이므로 lifeDigest·RNG 에는 관여하지 않는다(읽기만).
    const HAS_RI = typeof moveResidence === 'function' && typeof REGION_IDS !== 'undefined';
    const RI = { enabled: HAS_RI, lives: 0, livesMoved: 0, moves: 0, movesByReason: {}, finalResidence: {}, conscripted: 0, deserter: 0, nonRakiaWithService: 0, failures: {} };
    const riFail = k => { RI.failures[k] = (RI.failures[k] || 0) + 1; results.invariantFailures.push('residence:' + k); };
    const rDerive = s => (s.flags || []).includes('falna') ? (s.familia ? 'active' : 'unbound') : ((s.falnaHistory || []).length ? 'sealed' : 'none');
    const tally = (m, k) => { m[k] = (m[k] || 0) + 1; };
    const V8 = results.v178 = { has2i: HAS_2I,
        rngCallDigest: 2166136261, rngCallsTotal: 0,
        v4: { joinShownByState: {}, rollCalls: {}, godGoneShown: 0 },
        rollModes: {}, rollModeByEvent: {}, rejectedRolls: 0,
        transitionsByCause: {}, transitionsByPath: {}, recoveredTransitions: 0, unclassifiedTransitions: 0,
        staleStoredAtEvent: 0, depthNonZeroAtEvent: 0, baselineLeftAtLifeEnd: 0, depthNonZeroAtLifeEnd: 0, eventIdLeftAtLifeEnd: 0,
        invHasFalnaVsUse: 0, invNoneWithHistory: 0, gate2iViolations: 0, gate2iSamples: [],
        measure: { activeShapeFail: 0, unboundShapeFail: 0, normalSealedShapeFail: 0, sealedAtJoinEvent: 0, protectedShown: {} },
        syncLogUnitPhase: 0, syncLogSim: {} };
    let lastShownEventId = null;
    let instrumentPaused = false;   // 2i-r2: 합성 테스트 중 본 계측(V4·모드 집계)에 기록하지 않음
    // D-3(Q20 승인) 계측 — 2i-r2: legacy_sealed_join 으로 생긴 소속 id 를 생애 단위로 추적하고, 그 소속이 실제로 열린 채 sealed 인지
    // 이벤트 표시 시점과 endLife 시점 모두 측정한다. 추적된 소속 = 측정(2-ii 대상), 추적되지 않은 오염 sealed = 실패. 게임 상태·난수 무관(읽기만).
    // 2i-r3: 측정 대상(sink)을 바꿔 끼울 수 있게 해, 합성 테스트도 실제 래퍼 3개(rollFamilia·showEvent·endLife)를 경유하게 한다.
    V8.pollutedSealed = { 'tracked:event': 0, 'tracked:endLife': 0, 'untracked:event': 0, 'untracked:endLife': 0 };
    let d3Sink = { ids: new Set(), out: V8.pollutedSealed };
    V8.livesWithLegacySealedJoin = 0;
    const trackSealedJoin = (mode, result, ids) => {
        if (mode !== 'legacy_sealed_join' || result === false) return;
        const open = (S.familiaHistory || []).filter(m => m.leftAt == null);
        const last = open[open.length - 1]; if (last) ids.add(last.id);
    };
    const measurePolluted = (where, ids, out) => {
        if (!HAS_2I || rDerive(S) !== 'sealed') return;
        for (const m of (S.familiaHistory || []).filter(x => x.leftAt == null)) {
            const tracked = ids.has(m.id) && !!S.familia && S.familia.id === m.familiaId;
            out[(tracked ? 'tracked:' : 'untracked:') + where] = (out[(tracked ? 'tracked:' : 'untracked:') + where] || 0) + 1;
        }
    };
    // ── F1D4A P1: showEvent 계측을 "캡처 → 원래 함수 호출 → 반영/폐기" 로 바꾼다(설계 r3.20 00_INDEX §E-1.3 하네스 계측 규칙). ──
    // 호출 전에는 지역 객체에만 캡처하고, 원래 함수가 끝난 뒤 발급 순번(seq) 순서로 반영한다. 게임 상태·난수는 읽기만 한다.
    // 반영 대상: D-3 임시 출력(일시 정지와 무관) → 그 밖의 계측(일시 정지 중이 아니었을 때만). 순서와 내용은 F1 의 "호출 전 기록"과 같다.
    ${COMMIT_QUEUE_SRC}
    const captureShowEvent = function (event) {
        const ops = [], d3 = {};
        const sinkOut = d3Sink.out, paused = instrumentPaused;   // 호출 시작 시점의 sink 와 일시 정지 여부를 잡아 둔다(늦게 반영돼도 원래 sink 로 간다)
        const haltedAtCall = typeof progressHalted !== 'undefined' && progressHalted === true;
        const inc = (obj, key) => ops.push(() => { obj[key] = (obj[key] || 0) + 1; });
        const push = (arr, value) => ops.push(() => { arr.push(value); });
        const pushCap = (arr, value, cap) => ops.push(() => { if (arr.length < cap) arr.push(value); });
        const setLastShown = id => ops.push(() => { lastShownEventId = id; });
        measurePolluted('event', d3Sink.ids, d3);   // D-3 연결 ①: 이벤트 표시 시점(일시 정지와 무관한 단일 호출 지점). 임시 출력에 잰다
        if (paused) return { ops, d3, sinkOut, paused, haltedAtCall };   // 2i-r2: 합성 테스트 중 그 밖의 집계 제외
        inc(results, 'eventCount');
        inc(results.uniqueEvents, event.id);
        const job = S.job || '(unknown)';
        inc(results.eventCountsByJob, job);
        push(currentLifeEvents, event.id);
        if (job === 'adventurer') inc(results, 'adventurerEvents');
        if (job === 'adventurer' && !S.flags.includes('falna')) inc(results.preFalnaAdventurerEvents, event.id);
        if (job === 'supporter') inc(results, 'supporterEvents');
        if (job === 'retired') {
            inc(results, 'retiredEvents');
            if (event.id === 'retired_days') inc(results, 'retiredDaysEvents');
        }
        if (event.id === 'have_child' && !GameCore.Relations.hasPartner(S)) inc(results, 'childWithoutPartner');
        {   // Every shown event must satisfy its own gate at the moment it is shown (job / ages / relatives / items).
            const c = event.cond || {};
            const bad = [];
            if (c.job && !c.job.includes(S.job)) bad.push('job');
            if (c.age && (S.phase < c.age[0] || S.phase > c.age[1])) bad.push('physical-age');
            if (c.cage && (S.age < c.cage[0] || S.age > c.cage[1])) bad.push('calendar-age');
            if (c.relative && !GameCore.Relations.hasLivingRelative(S, c.relative)) bad.push('relative');
            if (c.noRelative && GameCore.Relations.hasLivingRelative(S, c.noRelative)) bad.push('noRelative');
            if (c.noItem && c.noItem.some(id => S.items.includes(id))) bad.push('noItem');
            if (c.min && Object.keys(c.min).some(k => S[k] < c.min[k])) bad.push('min');
            { const area = (EVENT_AREA[event.id] || [])[0]; if (!area) bad.push('unclassified-event');
                if (area === 'dungeon' && !(S.flags.includes('falna') && (S.job === 'adventurer' || S.job === 'supporter'))) bad.push('dungeon-without-falna-or-job');
                if (area === 'dungeon' && S.job === 'supporter' && !S.familia) bad.push('dungeon-supporter-without-familia');
                if (area === 'supporter_accompany' && !(S.job === 'supporter' && !S.flags.includes('falna') && !S.familia)) bad.push('free-supporter-conditions'); }
            if (c.hasFamilia === true && !S.familia) bad.push('hasFamilia');
            if (c.hasFamilia === false && S.familia) bad.push('noFamiliaRequired');
            if (c.flags && !c.flags.every(f => S.flags.includes(f))) bad.push('flags');
            if (c.noFlags && c.noFlags.some(f => S.flags.includes(f))) bad.push('noFlags');
            if (c.max && Object.keys(c.max).some(k => S[k] > c.max[k])) bad.push('max');
            if (bad.length) { inc(results, 'eventGateViolations'); pushCap(results.eventGateViolationSamples, event.id + ':' + bad.join('+'), 5); }
        }
        {   // v1.7.7: protected(비팔나 보호·거주) 소속 상태에서 노출된 이벤트 집계
            const open = (S.familiaHistory || []).find(m => m.leftAt == null);
            if (open && open.role === 'protected' && S.familia) {
                const area = (EVENT_AREA[event.id] || [])[0];
                if (area === 'dungeon') inc(results.v177, 'protectedDungeon');
                if (event.id === 'wargame') inc(results.v177, 'protectedWargame');
                if ((event.cond || {}).hasFamilia === true) inc(results.v177.protectedHasFamiliaEvents, event.id);
            }
        }
        {   // v1.7.8-2i: 이벤트 표시 시점 검사
            setLastShown(event.id);
            const st = rDerive(S);
            if (event.id === 'god_gone') inc(V8.v4, 'godGoneShown');
            if (['join', 'join_hard', 'latejoin'].includes(event.id)) inc(V8.v4.joinShownByState, event.id + ':' + st);
            if (HAS_2I) {
                const c = event.cond || {};
                if (S.syncBaseline === null && (S.falnaState !== deriveFalnaState() || (S.falnaHolder ?? null) !== deriveFalnaHolder())) inc(V8, 'staleStoredAtEvent');   // N8m
                if (syncDepth !== 0) inc(V8, 'depthNonZeroAtEvent');
                const bad = [];
                if (c.falnaState && !c.falnaState.includes(S.falnaState)) bad.push('falnaState');
                if (c.familiaRole && !c.familiaRole.includes(currentFamiliaRole())) bad.push('familiaRole');
                if (c.canEnterDungeon === true && !canEnterDungeon(S)) bad.push('canEnterDungeon');
                if (bad.length) { inc(V8, 'gate2iViolations'); pushCap(V8.gate2iSamples, event.id + ':' + bad.join('+'), 5); }
                if (S.flags.includes('falna') !== canUseFalna(S)) inc(V8, 'invHasFalnaVsUse');
                if (S.falnaState === 'none' && ((S.falnaHistory || []).length || (S.levelHistory || []).length)) inc(V8, 'invNoneWithHistory');
                const open = (S.familiaHistory || []).filter(m => m.leftAt == null);
                if (S.falnaState === 'active' && !(S.familia && S.falnaHolder === S.familia.id && open.length === 1 && open[0].role === 'member')) inc(V8.measure, 'activeShapeFail');
                if (S.falnaState === 'unbound' && (S.familia || open.length)) inc(V8.measure, 'unboundShapeFail');
                if (S.falnaState === 'sealed') { const last = (S.familiaHistory || [])[S.familiaHistory.length - 1]; if (S.familia || open.length || !last || last.leftReason !== 'god_returned') inc(V8.measure, 'normalSealedShapeFail'); }
                if (['join', 'join_hard', 'latejoin'].includes(event.id) && S.falnaState === 'sealed') inc(V8.measure, 'sealedAtJoinEvent');
                if (currentFamiliaRole() === 'protected') inc(V8.measure.protectedShown, event.id);
            }
        }
        return { ops, d3, sinkOut, paused, haltedAtCall };
    };
    const applyShowEventCommit = function (x) {
        for (const key of Object.keys(x.d3)) x.sinkOut[key] = (x.sinkOut[key] || 0) + x.d3[key];   // (a) D-3 — instrumentPaused 와 무관(F1 동작 보존)
        if (!x.paused) for (const op of x.ops) op();                                               // (b) 일반 계측
    };
    // 반환값 분류: true = 정상 표시(반영) / false = 보이는 선택지 0개(폐기) / undefined = 정지 중(폐기).
    // F1 의 showEvent 는 정상 표시에도 반환값이 없다(undefined). 그 경우는 호출 시작 시 정지 상태가 아니었으면 정상 표시로 본다(엔진 단계에서 true 로 바뀌면 이 분기는 쓰이지 않는다).
    const classifyShowEvent = function (r, cap) {
        const disposition = showEventDisposition(r, cap.haltedAtCall);   // 공통 규칙(tests/lib/commit_queue.js)
        if (disposition === 'discard') return { kind: 'discard', reason: String(r) };
        // F1D4A P2(D1): 엔진 단계에서 정상 표시는 true 를 반환한다. 정지 아님 + undefined 는 더 이상 정상 경로가 아니므로
        // 반영하지 않고 하네스 무결성 오류로 표시한다(legacy 분기 비활성화. 결과는 무효 처리).
        if (disposition === 'commit-legacy' && typeof visibleChoices === 'function') { showEventQueue.markHarnessBroken('legacy_undefined_return', null, new Error('showEvent returned undefined while not halted')); return { kind: 'discard', reason: 'legacy-undefined' }; }
        return { kind: 'commit', legacyUndefined: disposition === 'commit-legacy', d3: cap.d3, sinkOut: cap.sinkOut, ops: cap.ops, paused: cap.paused };
    };
    const showEventQueue = createCommitQueue(applyShowEventCommit);
    ${DRIVER_CORE_SRC}
    // 지금 원래 showEvent 가 실행 중인 사건 id 의 스택(하네스 전용, S 밖). 자동 진행을 켠 동기 중첩에서는 원래 함수가 끝나기 전에
    // 자동 클릭 → 다음 처리 → rollFamilia 까지 실행된다. 그때 rollFamilia 계측이 "지금 표시 중인 사건"에 귀속되도록 한다.
    // lastShownEventId 는 큐 반영 시점에 바뀌므로(호출 전 전역 변경 없음) 중첩 안에서는 아직 이전 사건을 가리킨다.
    const activeShowEventContext = [];
    const callOriginalShowEvent = function (event) {
        activeShowEventContext.push(event.id);
        try { return originalShowEvent(event); } finally { activeShowEventContext.pop(); }
    };
    showEvent = function (event) {
        return showEventQueue.run(() => captureShowEvent(event), () => callOriginalShowEvent(event), classifyShowEvent);
    };

    const originalRollFamilia = rollFamilia;
    const rollFamiliaInstrumented = function () {
        const before = S.job;
        const stBefore = rDerive(S), famBefore = S.familia ? S.familia.id : null;
        const mode = arguments.length > 1 ? String(arguments[1]) : '(none)';
        const result = originalRollFamilia.apply(this, arguments);
        {   // v1.7.8-2i(Q18): 모드는 러너 호출 계측으로만 판정. V4: 이벤트·상태별 호출과 이동 결과(두 빌드 공통 계측)
            const ev = (activeShowEventContext.length ? activeShowEventContext[activeShowEventContext.length - 1] : lastShownEventId) || '(no-event)';   // 활성 사건이 있으면 그것을 우선
            tally(V8.v4.rollCalls, ev + ':' + stBefore + '->' + rDerive(S) + ':' + (famBefore !== (S.familia ? S.familia.id : null) ? 'moved' : 'same'));
            tally(V8.rollModes, mode); tally(V8.rollModeByEvent, ev + ':' + mode);
            if (result === false) V8.rejectedRolls += 1;
            if (mode === 'legacy_sealed_join' && result !== false && d3Sink.ids.size === 0) V8.livesWithLegacySealedJoin += 1;
        }
        const id = S.familia ? S.familia.id : '(none)';
        const key = id + ':' + before + '->' + S.job;
        results.familiaJoins[key] = (results.familiaJoins[key] || 0) + 1;
        if (before !== 'child' && S.job !== before) results.familiaJoinJobOverwrites += 1;
        return result;
    };
    rollFamilia = function () {
        const mode = arguments.length > 1 ? String(arguments[1]) : '(none)';
        const result = instrumentPaused ? originalRollFamilia.apply(this, arguments) : rollFamiliaInstrumented.apply(this, arguments);   // 2i-r2: 합성 테스트 중 그 밖의 집계 제외
        trackSealedJoin(mode, result, d3Sink.ids);   // D-3 연결 ②: legacy_sealed_join 소속 id 추적(단일 호출 지점)
        return result;
    };

    const originalJoinOrg = joinOrganization;
    joinOrganization = function () { if (instrumentPaused) return originalJoinOrg.apply(this, arguments); const before = S.job; const r = originalJoinOrg.apply(this, arguments); const key = (S.employer ? S.employer.id : '(none)') + ':' + before + '->' + S.job; results.organizationJoins[key] = (results.organizationJoins[key] || 0) + 1; if (S.familia && S.familiaHistory.length === 0) results.invariantFailures.push('organization created familia'); return r; };

    // 회귀 비교용 생애 요약 해시(게임 상태·이벤트열이 같으면 같다). 신규 필드는 포함하지 않는다.
    const fnv = (h, str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    // D-3: endLife 시점 측정(생애가 이벤트 표시 없이 끝나도 빠지지 않도록 endLife 를 감싼다. 읽기만 함)
    const originalEndLife = endLife;
    endLife = function () {
        measurePolluted('endLife', d3Sink.ids, d3Sink.out);   // D-3 연결 ③: endLife 시점(단일 호출 지점)
        return originalEndLife.apply(this, arguments);
    };
    // D-3 합성 양성·음성 테스트(2-i 빌드만, 2i-r3: 실제 래퍼 경유). 측정 sink 를 전용 객체로 바꿔 끼우고, 난수 {state, calls}·파밀리아 목록·본 계측을 보존한다.
    if (HAS_2I) {
        const snap = __rngState(), logLen = syncInvariantLog.length, famSaved = gachaData.familias, mainSink = d3Sink;
        const mainBefore = JSON.stringify([V8.v4, V8.rollModes, V8.rollModeByEvent, V8.rejectedRolls, V8.pollutedSealed, V8.livesWithLegacySealedJoin, results.familiaJoins, results.familiaJoinJobOverwrites, results.eventCount, results.uniqueEvents, currentLifeEvents]);
        const pos = {}, neg = {}, mixed = {};
        const synthEvent = { id: 'd3_synthetic', text: 't', choices: [{ label: 'x', text: 'x', fx: {} }] };
        instrumentPaused = true;
        d3Sink = { ids: new Set(), out: {} };   // startLife 중 측정은 버림
        startLife();
        gachaData.familias = famSaved.filter(f => f.id === 'loki');   // 수여 나이 [12,18] → 10세 입단 시 즉시 수여 없음 = 오염 sealed 확정
        S.age = 10; S.chronologicalAge = 10; S.familia = null; S.flags = S.flags.filter(f => f !== 'falna');
        S.familiaHistory = [{ id: 1, familiaId: 'loki', label: 'l', joinedAt: 5, leftAt: 8, leftReason: 'left', role: 'member', falnaAt: 6 }]; S.nextMembershipId = 2;
        S.falnaHistory = [{ familiaId: 'loki', at: 6, membershipIndex: 0 }]; S.falnaState = deriveFalnaState(); S.falnaHolder = deriveFalnaHolder();
        S.conversionPending = { since: 8, fromFamiliaId: 'loki', reason: 'god_returned' };
        // 양성: 실제 래퍼 rollFamilia → showEvent → endLife
        d3Sink = { ids: new Set(), out: pos };
        const r = rollFamilia(undefined, 'legacy_sealed_join');
        const posIds = d3Sink.ids;
        showEvent(synthEvent);
        endLife();
        const sealedWithOpen = rDerive(S) === 'sealed' && S.familiaHistory.some(m => m.leftAt == null);
        // 음성: 같은 오염 sealed 를 추적 없이(sink 의 id 집합 비움) 실제 래퍼로 측정 → untracked
        d3Sink = { ids: new Set(), out: neg };
        showEvent(synthEvent); endLife();
        // 혼합: 추적된 소속 + 추적되지 않은 열린 소속
        const before = S.familiaHistory.length;
        S.familiaHistory.push({ id: 99, familiaId: 'hestia', joinedAt: 10, leftAt: null, role: 'member' });
        d3Sink = { ids: posIds, out: mixed };
        endLife();
        S.familiaHistory.length = before;
        d3Sink = mainSink; gachaData.familias = famSaved; __rngRestore(snap); instrumentPaused = false;
        V8.d3SyntheticTest = { viaRealWrappers: true, joined: r !== false && !!S.familia && S.familia.id === 'loki', sealedWithOpen,
            trackedIdViaRollFamiliaWrapper: posIds.has(2) && posIds.size === 1,
            trackedEventViaShowEventWrapper: pos['tracked:event'] === 1, trackedEndLifeViaEndLifeWrapper: pos['tracked:endLife'] === 1,
            noUntrackedInPositive: !pos['untracked:event'] && !pos['untracked:endLife'],
            untrackedDetectedEvent: neg['untracked:event'] === 1, untrackedDetectedEndLife: neg['untracked:endLife'] === 1, noTrackedInNegative: !neg['tracked:event'] && !neg['tracked:endLife'],
            mixedSplit: mixed['tracked:endLife'] === 1 && mixed['untracked:endLife'] === 1, noSyncLog: syncInvariantLog.length === logLen,
            mainSinkRestored: d3Sink === mainSink && d3Sink.out === V8.pollutedSealed };
        V8.d3SyntheticTest.mainCountersUntouched = JSON.stringify([V8.v4, V8.rollModes, V8.rollModeByEvent, V8.rejectedRolls, V8.pollutedSealed, V8.livesWithLegacySealedJoin, results.familiaJoins, results.familiaJoinJobOverwrites, results.eventCount, results.uniqueEvents, currentLifeEvents]) === mainBefore;
        V8.d3SyntheticTest.rngRestored = JSON.stringify(__rngState()) === JSON.stringify(snap);
        assert(Object.values(V8.d3SyntheticTest).every(Boolean), 'D-3 synthetic polluted-sealed test failed: ' + JSON.stringify(V8.d3SyntheticTest));
        assert(showEventQueue.checkBoundary('d3_synthetic'), 'harness commit queue not drained after D-3 synthetic test: ' + JSON.stringify(showEventQueue.integrity()));   // F1D4A P1: 합성 시험 블록 끝 경계 검사
    }
    // T1-F/F-1 후속 선택 계측(읽기 전용). 러너는 후속 화면에서 항상 '지금 생활을 이어간다' 를 난수 없이 고른다(C21·C24).
    const HAS_F1 = typeof FOLLOWUP_KINDS !== 'undefined' && typeof followupDiagLog !== 'undefined';
    const F1 = results.f1Followup = { hasF1: HAS_F1, followups: 0, byReason: {}, byKind: {}, supporterOptionShown: 0, badPhase: 0, applicationChanged: 0, stayStateChanged: 0, rngDuringStay: 0, notCleaned: 0, jobChangedByFollowup: 0, nextButtonBad: 0, pendingLeftAtLifeEnd: 0, livesWithFollowup: 0, fallbackSpecs: 0, diagByEvent: {}, diagUnitPhase: HAS_F1 ? followupDiagLog.length : 0 };
    if (HAS_F1) F1.fallbackSpecs = EVENTS.filter(event => JSON.stringify(event.choices).indexOf('"fallback"') >= 0).length;
    const f1Strip = (key, value) => (key === 'pendingFollowup' || key === 'currentEventId') ? undefined : value;
    let lifeDigest = 2166136261;
    let syncSeen = HAS_2I ? syncInvariantLog.length : 0;   // 단위 테스트 단계의 기록은 본 실행 판정에서 제외(별도 보고)
    V8.syncLogUnitPhase = syncSeen;
    // 단위 테스트 단계 기록의 예상값(QA r2-i 보완 2). 아래 4개 합성 fixture 는 새 기록 필드 없이 S 를 직접 만들거나 팔나 플래그를 직접 넣어
    // 동기화 범위를 우회하므로, 첫 범위 진입에서 stored_state_mismatch 가 정확히 1건씩 남는 것이 예상 결과다(게임 동작·본 시뮬레이션 무관).
    //   ① levelUpFeatOnly: S 리터럴(30세) → apply  ② 직업 매핑: makeJobState('child') → rollFamilia(20세)
    //   ③ 직업 보존: makeJobState('supporter') → rollFamilia(20세)  ④ 아이템: fresh() 후 S.flags.push('falna') → choose → apply(4세)
    // ①~③ 는 fixture 가 나이를 고정(30·20·20)하므로 나이까지, ④ 는 fresh() 의 시드별 생애에 따라 나이가 달라 종류·범위만 비교한다.
    const EXPECTED_UNIT_PHASE_LOG = ['stored_state_mismatch:apply:30', 'stored_state_mismatch:rollFamilia:20', 'stored_state_mismatch:rollFamilia:20', 'stored_state_mismatch:apply:*'];
    V8.unitPhaseLog = HAS_2I ? syncInvariantLog.map((x, i) => x.kind + ':' + x.scopeKind + ':' + (i === 3 ? '*' : x.at)) : [];
    V8.unitPhaseLogRaw = HAS_2I ? syncInvariantLog.map(x => x.kind + ':' + x.scopeKind + ':' + x.at) : [];
    V8.unitPhaseLogAsExpected = !HAS_2I || JSON.stringify(V8.unitPhaseLog) === JSON.stringify(EXPECTED_UNIT_PHASE_LOG);
    let chronologicalTotal = 0;
    let physicalTotal = 0;
    for (let run = 0; run < ${RUNS}; run++) {
        try {
            currentLifeEvents = [];
            lastShownEventId = null; d3Sink.ids = new Set();
            const rngCallsAtLifeStart = __rngCalls();
            if (typeof __siteLifeStart === 'function') __siteLifeStart(run);   // F1D4A P1: RNG 지점 기록의 생애 경계(SIM_RNG_SITES 지정 시에만 존재)
            if (activeShowEventContext.length !== 0) throw new Error('harness: activeShowEventContext not empty at life start');
            startLife();
            let actions = 0;
            let firstAdventurerAge = null, firstFalnaAge = null; let wasRetired = false, reachedLv6 = false, reachedLv6InWindow = false;
            while (!S.cause && actions < ${MAX_ACTIONS_PER_LIFE}) {
                const buttons = $('choices').kids || [];
                const usable = buttons.filter(button => typeof button.onclick === 'function');
                if (usable.length === 0) {
                    throw new Error('simulation stalled: no actionable choice at age ' + S.age + ', job=' + S.job);
                }
                const pick = driverChoose(usable, S.pendingFollowup);   // F1D4A P1: 버튼 선택은 공통 드라이버 한 곳(분기·난수 사용은 F1 과 같음)
                if (pick.kind === 'error') throw new Error(pick.message + ' at age ' + S.age + ', job=' + S.job);
                if (pick.kind === 'followup_stay') {
                    const stay = pick.button;
                    const f1p = S.pendingFollowup, f1App = JSON.stringify(S.application), f1Rng = __rngCalls(), f1Job = S.job, f1State = JSON.stringify(S, f1Strip);
                    F1.followups += 1; if (f1p.seq === 1) F1.livesWithFollowup += 1;
                    tally(F1.byReason, String(f1p.context && f1p.context.reason)); tally(F1.byKind, f1p.kind);
                    if (f1p.phase !== 'awaiting_choice') F1.badPhase += 1;
                    if (usable.some(button => button.dataset && button.dataset.followup === 'supporter')) F1.supporterOptionShown += 1;
                    stay.onclick();
                    if (JSON.stringify(S.application) !== f1App) F1.applicationChanged += 1;      // V-2(C-10): 후속 선택으로 application 추가 변경 0
                    if (JSON.stringify(S, f1Strip) !== f1State) F1.stayStateChanged += 1;         // C29: stay 는 상태를 바꾸지 않는다
                    if (__rngCalls() !== f1Rng) F1.rngDuringStay += 1;                            // C24: 주 RNG 0
                    if (S.pendingFollowup !== null || S.currentEventId !== null) F1.notCleaned += 1;
                    if (S.job !== f1Job) F1.jobChangedByFollowup += 1;                            // F1-T12
                    const f1After = ($('choices').kids || []).filter(button => typeof button.onclick === 'function');
                    if (f1After.length !== 1 || f1After[0].textContent !== '다음 해로') F1.nextButtonBad += 1;
                } else {
                    pick.button.onclick();
                }
                actions += 1;
                if (S.job === 'retired') wasRetired = true;
                if (firstAdventurerAge == null && S.job === 'adventurer') firstAdventurerAge = S.age;
                if (firstFalnaAge == null && S.flags.includes('falna')) firstFalnaAge = S.age;
                if (S.level >= 6) reachedLv6 = true;
                if (S.level >= 6 && S.phase >= 20 && S.phase <= 60) reachedLv6InWindow = true;
                if (Math.abs((S.age - S.phase)) > results.maxAgeGap) results.maxAgeGap = Math.abs(S.age - S.phase);
                if (S.items && S.items.some(id => !GameCore.Items.getDef(id))) results.invariantFailures.push('unknown item id in inventory');
                if (S.itemUses && Object.values(S.itemUses).some(v => !(v > 0))) results.invariantFailures.push('non-positive item uses left in inventory');
                if (S.hp > GameCore.Items.hpCap(S) + 1e-9) results.invariantFailures.push('hp above cap');
                if (S.job === 'adventurer' && !(S.aspiration && S.aspiration.kind === 'adventurer')) results.invariantFailures.push('adventurer job without aspiration record');
                if (S.aspiration && S.aspiration.fulfilledAt != null && !(S.falnaHistory || []).length) results.invariantFailures.push('aspiration fulfilled without any falna record');
                if (!S.cause) { results.minHpSeenAlive = Math.min(results.minHpSeenAlive, S.hp); if (S.hp <= 0) results.negativeHpWhileAlive += 1; }
                if (S.cause && S.hp < 0) results.negativeHpAtDeath += 1;

                for (const key of ['hp', 'power', 'bond', 'valis', 'potential', 'excelia', 'physicalAge', 'chronologicalAge']) {
                    if (!Number.isFinite(S[key])) results.nonFiniteValues += 1;
                }
                if (S.valis < 0 || S.bond < 0 || S.potential < 0 || S.excelia < 0) results.negativeGrowthValues += 1;
                if (S.abil && Object.values(S.abil).some(value => !Number.isFinite(value) || value < 0)) results.nonFiniteValues += 1;
                if (S.partnerId != null) {
                    const partner = GameCore.Relations.getCurrentPartner(S);
                    if (!partner || S.age < 18 || partner.age < 18 || Math.abs(S.age - partner.age) > GameCore.Relations.MAX_AGE_GAP || GameCore.Relations.isFamilyRelation(partner) || partner.alive === false) {
                        results.invalidPartnerStates += 1;
                    }
                }
            }
            if (!S.cause) {
                results.guardTrips += 1;
                throw new Error('life exceeded action guard (' + ${MAX_ACTIONS_PER_LIFE} + ')');
            }

            if (typeof __siteLifeEnd === 'function') __siteLifeEnd(run);
            showEventQueue.checkBoundary('life');   // F1D4A P1: 생애 경계 검사. 위반하면 하네스 무결성 오류(실행 전체 무효)
            results.completedRuns += 1;
            {   // v1.7.8-2i 생애 단위 계측
                const lifeCalls = __rngCalls() - rngCallsAtLifeStart;
                V8.rngCallDigest = fnv(V8.rngCallDigest, String(lifeCalls)); V8.rngCallsTotal += lifeCalls;
                if (HAS_2I) {
                    if (S.syncBaseline !== null) V8.baselineLeftAtLifeEnd += 1;
                    if (syncDepth !== 0) V8.depthNonZeroAtLifeEnd += 1;
                    if (S.currentEventId !== null) V8.eventIdLeftAtLifeEnd += 1;
                    for (const t of (S.falnaTransitions || [])) {
                        tally(V8.transitionsByCause, t.cause); tally(V8.transitionsByPath, t.from + '->' + t.to + ':' + t.cause);
                        if (/^recovered_/.test(t.cause)) V8.recoveredTransitions += 1;
                        if (/unclassified|_recovered$/.test(t.cause)) V8.unclassifiedTransitions += 1;
                    }
                    for (; syncSeen < syncInvariantLog.length; syncSeen++) { const k = syncInvariantLog[syncSeen].kind; tally(V8.syncLogSim, k); results.invariantFailures.push('sync:' + k); }
                }
            }
            lifeDigest = fnv(lifeDigest, JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause, currentLifeEvents.join(',')]));
            if (typeof __lifeDump !== 'undefined' && __lifeDump) {   // 생애별 기록(읽기 전용, SIM_LIFE_DUMP 지정 시에만)
                const app = S.application || {};
                const persistenceFail = (app.history || []).some(h => h.route === 'persistence' && h.outcome === 'rejected') || (app.blocked || []).some(b => b.route === 'persistence');
                __lifeDump.push({ i: run, d: fnv(2166136261, JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause, currentLifeEvents.join(',')])), pf: persistenceFail, job: S.job, sup: S.flags.includes('supporter'), fam: !!(S.familiaHistory || []).length, falna: (S.falnaHistory || []).length > 0, ev: currentLifeEvents.slice() });
            }
            if (S.pendingFollowup) F1.pendingLeftAtLifeEnd += 1;
            if (HAS_RI) {   // R-i 생애 단위 검사(읽기 전용)
                RI.lives += 1;
                const H = S.residenceHistory, R = S.residence, O = S.origin && S.origin.id;
                if (!Array.isArray(H) || !H.length || !R) riFail('missing_state');
                else {
                    if (H[0].seq !== 1 || H[0].from !== 0 || H[0].reason !== 'birth' || H[0].regionId !== O) riFail('bad_birth_interval');
                    for (let i = 0; i < H.length; i++) {
                        const h = H[i];
                        if (!REGION_IDS.includes(h.regionId)) riFail('unknown_region');
                        if (h.seq !== i + 1) riFail('seq_gap');
                        if (i < H.length - 1) { if (h.to !== H[i + 1].from) riFail('interval_not_contiguous'); if (h.to == null || h.to < h.from) riFail('bad_interval_end'); if (h.regionId === H[i + 1].regionId) riFail('same_region_move'); }
                        else if (h.to !== null) riFail('last_interval_closed');
                        if (i > 0) { RI.moves += 1; tally(RI.movesByReason, h.reason); if (h.reason !== 'fled' && !(h.reason === 'retirement' && h.eventId === 'retire')) riFail('unapproved_move_reason'); }   // F1D4A P3 F-B(의도적 시험 변경): retire[1] 메렌 이주(이유 retirement, 사건 retire)만 추가 승인
                    }
                    const last = H[H.length - 1];
                    if (R.regionId !== last.regionId || R.since !== last.from) riFail('residence_history_mismatch');
                    if (H.length > 1) RI.livesMoved += 1;
                    tally(RI.finalResidence, R.regionId);
                    const sv = S.service || {};
                    if (sv.conscripted) RI.conscripted += 1;
                    if (sv.deserter) RI.deserter += 1;
                    if (sv.conscripted && sv.deserter) riFail('service_both');
                    if (O !== 'rakia' && (sv.conscripted || sv.deserter)) { RI.nonRakiaWithService += 1; riFail('service_non_rakia'); }
                    const fled = H.filter(h => h.reason === 'fled');
                    if (!!sv.deserter !== (fled.length === 1)) riFail('deserter_move_mismatch');
                    if (fled.length > 1) riFail('fled_twice');
                    for (const h of fled) if (h.regionId !== 'orario' || H[h.seq - 2].regionId !== 'rakia') riFail('fled_wrong_regions');
                    if (sv.deserter && sv.deserter.since !== fled[0].from) riFail('deserter_age_mismatch');
                }
            }
            {   // v1.7.7 생애 단위 검사
                const V = results.v177;
                const subIds = GameCore.Lineage.BEASTMAN_SUBTYPES.map(x => x.id);
                if (S.race.id === 'beastman') {
                    V.beastmanLives += 1;
                    if (!S.raceSubtype || !subIds.includes(S.raceSubtype.id)) V.subtypeErrors += 1; else V.subtypeDist[S.raceSubtype.id] = (V.subtypeDist[S.raceSubtype.id] || 0) + 1;
                } else if (S.raceSubtype) V.nonBeastWithSubtype += 1;
                const growth = S.logHistory.filter(x => x.type === 'growth');
                for (const a of [0, 1, 2]) {
                    if (S.age < a) continue;
                    const n = growth.filter(x => x.age === a).length;
                    if (n === 0) V.childhoodMissing += 1; if (n > 1) V.childhoodDup += 1;
                }
                if (S.age >= 2) V.livesPast2 += 1;
                const lh = S.levelHistory || [];
                let prev = 0, bad = false;
                for (const h of lh) {
                    if (h.kind === 'levelup') { V.levelUps += 1; if (h.to !== h.from + 1 || h.from !== prev) bad = true; }
                    if (h.kind === 'falna' && !(h.from === 0 && h.to === 1 && prev === 0)) bad = true;
                    if (h.kind === 'falna_again' && h.to !== prev) bad = true;
                    prev = h.to;
                }
                if (bad) V.levelHistoryErrors += 1;
                if (lh.length) V.livesWithFalnaRecord += 1;
                const expectedMax = lh.length ? S.level : 0;
                if ((S.maxLevel || 0) !== expectedMax) V.maxLevelErrors += 1;
                if (lh.filter(h => h.kind !== 'levelup').length !== (S.falnaHistory || []).length) V.levelHistoryErrors += 1;
                for (const m of (S.familiaHistory || [])) {
                    V.roleCounts[m.role] = (V.roleCounts[m.role] || 0) + 1;
                    if (m.role !== 'member' && m.role !== 'protected') V.roleErrors += 1;
                    if (m.role === 'protected' && (m.falnaAt != null || m.falnaAlreadyHeld)) V.protectedNeverFalnaViolations += 1;
                    if (m.role === 'member' && m.falnaAt == null && !m.falnaAlreadyHeld) V.memberNeverReceivedFalna += 1;
                }
                if (S.fame !== undefined || S.familiaFame !== undefined) { V.fameSystemPresent = true; V.protectedFameCredits += 0; }
            }
            if (wasRetired) results.livesThatRetired += 1;
            if (S.flags.includes('falna')) results.falnaLives += 1;
            const finalLevel = Number.isFinite(S.level) ? S.level : 0;
            results.finalLevelDistribution[finalLevel] = (results.finalLevelDistribution[finalLevel] || 0) + 1;
            results.finalJobDistribution[S.job] = (results.finalJobDistribution[S.job] || 0) + 1;
            results.maxLevelReached = Math.max(results.maxLevelReached, finalLevel);
            if (S.potential > 0) results.preFalnaLivesWithPotential += 1;
            results.familyRelationsGenerated += (S.relations || []).filter(GameCore.Relations.isFamilyRelation).length;
            {
                const rels = S.relations || [];
                const fam = rels.filter(r => r.isFamily === true);
                if (fam.length === 0) results.livesWithoutAnyFamily += 1;
                if (fam.some(r => r.subType === 'parent' && r.source === 'birth')) results.livesWithParentsAtBirth += 1;
                results.childrenBorn += fam.filter(r => r.subType === 'child').length;
                results.youngerSiblingsBorn += fam.filter(r => r.source === 'sibling_birth').length;
                results.familyDeaths += fam.filter(r => r.alive === false).length;
                results.familyDeathsNatural += fam.filter(r => r.endReason === 'deceased_natural').length;
                const partners = rels.filter(r => r.isPartner === true);
                if (partners.length) results.livesWithPartner += 1;
                if (partners.length > 1) results.livesWithMultiplePartners += 1;
                results.partnerDeathsNatural += partners.filter(r => r.endReason === 'deceased_natural').length;
                results.partnerDeathsEvent += partners.filter(r => r.endReason === 'deceased_event').length;
                results.partnerDeaths += partners.filter(r => String(r.endReason || '').indexOf('deceased') === 0).length;
                results.partnerBreakups += partners.filter(r => r.endReason === 'breakup').length;
                if (rels.some(r => r.alive === false)) results.livesWithBereavement += 1;
                if (fam.some(r => r.isPartner === true || r.relationshipStatus === 'partnered')) results.familyPartnerOverlap += 1;
                if (rels.some(r => r.relationshipStatus === 'ended' && !r.endReason)) results.invariantFailures.push('ended relationship without endReason');
                if (rels.some(r => r.alive === false && r.endReason && r.endReason.indexOf('deceased') !== 0)) results.invariantFailures.push('dead relation with non-death endReason');
                if (S.partnerId != null && !GameCore.Relations.hasPartner(S)) results.invalidPartnerStates += 1;
                results.itemsConsumedTotal += (S.itemsConsumed || []).length;
                if ((S.itemsConsumed || []).length) results.livesWithConsumedItem += 1;
                if (reachedLv6) results.livesReachedLv6 += 1;
                if (reachedLv6InWindow) results.livesReachedLv6InWindow += 1;
                if (S.eventCounts.hero_sacrifice) results.heroSacrificeFired += 1;
                if (S.milestones.some(m => m.id === 'hero')) results.heroSacrificeWon += 1;
                if (S.age - S.phase >= 5) results.calendarVsPhysicalGapLives += 1;
                {
                    const tl = results.timeline; tl.lives += 1;
                    const hist = S.familiaHistory || [], fh = S.falnaHistory || [];
                    if (hist.length) tl.livesWithMembership += 1;
                    if (hist.length > 1) tl.livesWithMultipleMemberships += 1;
                    if (S.employer) tl.livesWithEmployer += 1;
                    hist.forEach((m, idx) => {
                        tl.memberships += 1; tl.joinAges[m.joinedAt] = (tl.joinAges[m.joinedAt] || 0) + 1;
                        if (m.viaParent) tl.viaParent += 1;
                        if (m.falnaAlreadyHeld) tl.joinedWithFalnaAlreadyHeld += 1;
                        else if (m.falnaAt == null) tl.membershipsWithoutFalna += 1;
                        else { const g = m.falnaAt - m.joinedAt; if (g < 0) tl.negativeGaps += 1; tl.gapSum += g; tl.gapN += 1; tl.gapMax = Math.max(tl.gapMax, g); tl.gapHist[Math.min(g, 10)] = (tl.gapHist[Math.min(g, 10)] || 0) + 1; }
                        if (m.leftAt != null && m.leftAt < m.joinedAt) tl.negativeGaps += 1;
                        const prev = hist[idx - 1]; if (prev && (prev.leftAt == null || prev.leftAt > m.joinedAt)) tl.overlappingMemberships += 1;
                    });
                    tl.falnaGrants += fh.length;
                    if (fh.some(f => f.membershipIndex == null || !hist[f.membershipIndex])) tl.falnaWithoutMembership += 1;
                    if (S.flags.includes('falna') && !fh.length) tl.falnaFlagWithoutHistory += 1;
                    {   // 2b-b 지원·심사 통계(읽기만)
                        const RB = results.recruit2bb, app = S.application || { current: null, history: [] }, hh = app.history || [];
                        const gen = hh.filter(h => !h.direct), dir = hh.filter(h => h.direct);
                        if (app.current !== null) { RB.currentLeftAtLifeEnd += 1; results.invariantFailures.push('recruit: application.current left at life end'); }
                        if (gen.length) RB.livesApplied += 1;
                        if (gen.some(h => h.outcome === 'rejected')) RB.livesWithRejection += 1;
                        if (gen.length && !gen.some(h => h.outcome === 'accepted')) RB.livesAppliedNeverAccepted += 1;
                        RB.applications += gen.length; RB.direct += dir.length; RB.blocked += (app.blocked || []).length;
                        (app.blocked || []).forEach(b => { RB.blockedByReason[b.reason] = (RB.blockedByReason[b.reason] || 0) + 1; });
                        RB.maxGeneralPerLife = Math.max(RB.maxGeneralPerLife, gen.length);
                        gen.forEach(h => { const k = h.route + ':' + h.outcome; RB.byRouteOutcome[k] = (RB.byRouteOutcome[k] || 0) + 1;
                            if (!['accepted', 'rejected'].includes(h.outcome)) { RB.badOutcome += 1; results.invariantFailures.push('recruit: outcome ' + h.outcome); }
                            if (h.outcome === 'accepted' && !hist.some(m => m.familiaId === h.familiaId && m.joinedAt === h.at)) { RB.acceptedWithoutMembership += 1; results.invariantFailures.push('recruit: accepted without membership'); }
                            if (h.outcome === 'rejected' && hist.some(m => m.familiaId === h.familiaId && m.joinedAt === h.at)) { RB.rejectedButJoined += 1; results.invariantFailures.push('recruit: rejected but joined'); } });
                        dir.forEach(h => { if (h.route !== 'scout' || h.outcome !== 'accepted' || h.attempt !== null) { RB.badDirect += 1; results.invariantFailures.push('recruit: bad direct entry'); } });
                        for (let i = 1; i < gen.length; i++) { const pr = gen.slice(0, i).filter(h => h.outcome === 'rejected').pop(); if (pr && gen[i].at - pr.at < GameCore.Recruit.RECRUIT_TUNING.rejectCooldownYears) { RB.cooldownViolations += 1; results.invariantFailures.push('recruit: cooldown violated'); }
                            if (gen.slice(0, i).some(h => h.outcome === 'rejected' && h.familiaId === gen[i].familiaId && gen[i].at - h.at < GameCore.Recruit.RECRUIT_TUNING.sameFamiliaRetryYears)) { RB.sameFamiliaViolations += 1; results.invariantFailures.push('recruit: same familia retry'); } }
                        if (gen.length > GameCore.Recruit.RECRUIT_TUNING.lifetimeApplicationCap) { RB.capViolations += 1; results.invariantFailures.push('recruit: lifetime cap'); }
                    }
                    if (firstAdventurerAge != null) {
                        tl.adventurerLives += 1;
                        if (firstFalnaAge == null || firstFalnaAge > firstAdventurerAge) tl.adventurerBeforeFalna += 1;
                    }
                }
                const cause = String(S.cause);
                if (cause.indexOf('긴 생을 마치고') >= 0) results.deathCauseCounts.natural += 1;
                else if (cause.indexOf('버티지') >= 0 || cause.indexOf('견디지') >= 0 || cause.indexOf('상처를 이겨') >= 0) results.deathCauseCounts.hp += 1;
                else results.deathCauseCounts.event += 1;
                if (cause.indexOf('버티지') >= 0 || cause.indexOf('견디지') >= 0 || cause.indexOf('상처를 이겨') >= 0) {
                    const left = GameCore.Items.takeRescue(S);   // 사망 상태(hp<=RESCUE_HP)에서 구조 소모품이 남아 있었는가
                    if (left) results.hpDeathsWithRescueLeft += 1;
                }
                {
                    const rid = S.race.id, rs = (results.raceStats[rid] ||= { lives: 0, lv: {}, lv6: 0, lv7: 0, heroFired: 0, heroWon: 0, calSum: 0, physSum: 0 });
                    rs.lives += 1; rs.lv[S.level] = (rs.lv[S.level] || 0) + 1;
                    if (reachedLv6) rs.lv6 += 1;
                    if (S.level >= 7 || (S.maxLevel || 0) >= 7) rs.lv7 += 1;
                    if (S.eventCounts.hero_sacrifice) rs.heroFired += 1;
                    if (S.milestones.some(m => m.id === 'hero')) rs.heroWon += 1;
                    rs.calSum += S.age; rs.physSum += S.physicalAge;
                }
            }
            results.totalPotential += S.potential;
            results.totalPostFalnaAbility += GameCore.Growth.getAbilityTotal(S);
            chronologicalTotal += S.age;
            physicalTotal += S.physicalAge;
            results.minObservedAgingRate = Math.min(results.minObservedAgingRate, GameCore.Aging.getFinalAgingRate(S, MODS));
        } catch (error) {
            results.runtimeExceptions += 1;
            results.firstRuntimeError = { run: run + 1, message: String(error && error.message || error), stack: String(error && error.stack || '').split('\\n').slice(0, 8) };
            break; // Fail fast: an interrupted run must never be reported as 3,000 successful simulations.
        }
    }

    results.lifeDigest = lifeDigest;
    showEventQueue.checkBoundary('run_end');
    results.harnessIntegrity = showEventQueue.integrity();   // F1D4A P1: broken 이면 이 실행의 계측 결과(lifeDigest 포함)는 무효
    { const RB = results.recruit2bb; RB.membershipLivesPct = results.completedRuns ? +(results.timeline.livesWithMembership / results.completedRuns * 100).toFixed(2) : 0; RB.rejectionAmongAppliedPct = RB.livesApplied ? +(RB.livesWithRejection / RB.livesApplied * 100).toFixed(2) : 0; }
    results.residenceRi = RI;
    if (HAS_F1) {
        followupDiagLog.slice(F1.diagUnitPhase).forEach(entry => tally(F1.diagByEvent, entry.event));
        ['badPhase', 'applicationChanged', 'stayStateChanged', 'rngDuringStay', 'notCleaned', 'jobChangedByFollowup', 'nextButtonBad', 'pendingLeftAtLifeEnd', 'fallbackSpecs'].forEach(key => { if (F1[key]) results.invariantFailures.push('f1:' + key + '=' + F1[key]); });
        Object.keys(F1.diagByEvent).forEach(event => results.invariantFailures.push('f1:diag:' + event + '=' + F1.diagByEvent[event]));
    }
    results.averageChronologicalAge = results.completedRuns ? +(chronologicalTotal / results.completedRuns).toFixed(2) : 0;
    results.averagePhysicalAge = results.completedRuns ? +(physicalTotal / results.completedRuns).toFixed(2) : 0;
    results.averagePotential = results.completedRuns ? +(results.totalPotential / results.completedRuns).toFixed(2) : 0;
    results.averagePostFalnaAbilityTotal = results.completedRuns ? +(results.totalPostFalnaAbility / results.completedRuns).toFixed(2) : 0;
    results.falnaRatePct = results.completedRuns ? +(results.falnaLives / results.completedRuns * 100).toFixed(2) : 0;
    results.potentialRecordedRatePct = results.completedRuns ? +(results.preFalnaLivesWithPotential / results.completedRuns * 100).toFixed(2) : 0;
    results.retiredLifeRatePct = results.completedRuns ? +(results.livesThatRetired / results.completedRuns * 100).toFixed(2) : 0;
    results.uniqueEventTypes = Object.keys(results.uniqueEvents).length;
    results.neverFiredEvents = EVENTS.map(event => event.id).filter(id => !results.uniqueEvents[id]);
    results.partnerEvents = {
        love: results.uniqueEvents.love || 0,
        amazon_duel: results.uniqueEvents.amazon_duel || 0,
        have_child: results.uniqueEvents.have_child || 0,
        relationship_crisis: results.uniqueEvents.relationship_crisis || 0
    };
    results.allRunsCompleted = results.completedRuns === ${RUNS} && results.runtimeExceptions === 0 && results.guardTrips === 0;
    results.allInvariantsPassed = results.invariantFailures.length === 0
        && V8.unitPhaseLogAsExpected
        && (!HAS_2I || (V8.staleStoredAtEvent === 0 && V8.depthNonZeroAtEvent === 0 && V8.baselineLeftAtLifeEnd === 0 && V8.depthNonZeroAtLifeEnd === 0 && V8.eventIdLeftAtLifeEnd === 0
            && V8.invHasFalnaVsUse === 0 && V8.invNoneWithHistory === 0 && V8.pollutedSealed['untracked:event'] === 0 && V8.pollutedSealed['untracked:endLife'] === 0 && V8.gate2iViolations === 0 && V8.recoveredTransitions === 0))
        && results.nonFiniteValues === 0
        && results.negativeGrowthValues === 0
        && results.negativeHpWhileAlive === 0
        && results.negativeHpAtDeath === 0
        && results.hpDeathsWithRescueLeft === 0
        && results.v177.subtypeErrors === 0 && results.v177.nonBeastWithSubtype === 0 && results.v177.childhoodMissing === 0 && results.v177.childhoodDup === 0
        && results.v177.levelHistoryErrors === 0 && results.v177.maxLevelErrors === 0 && results.v177.roleErrors === 0 && results.v177.protectedNeverFalnaViolations === 0 && results.v177.protectedDungeon === 0
        && results.timeline.negativeGaps === 0 && results.timeline.overlappingMemberships === 0
        && results.timeline.falnaWithoutMembership === 0 && results.timeline.falnaFlagWithoutHistory === 0
        && results.invalidPartnerStates === 0
        && results.childWithoutPartner === 0
        && results.eventGateViolations === 0
        && results.familyPartnerOverlap === 0
        && results.familiaJoinJobOverwrites === 0;

    globalThis.__TEST_RESULTS__ = results;
})();
`;

if (SITE_OUT) {   // F1D4A P1: 실제로 실행하는 조립 문자열에서 조각 표와 지점 표를 만든다(설계 §4.1.5 · §4.1.3 B 규칙)
    const RngSites = require(path.join(ROOT, 'tests', 'lib', 'rng_sites.js'));
    const VM_FILE = 'danmachi-integration-test.js';
    const texts = TEXTS;   // 다시 읽지 않는다(단일 TEXTS)
    const asm = RngSites.buildAssembly(RngSites.buildNodeVmParts(sourceFiles, texts, '\n;\n', '\n', integrationScript, 'test_runner.js(integrationScript)'));
    if (asm.text !== source + '\n' + integrationScript) throw new Error('RNG site recorder: assembly text differs from the executed script');
    const rowProblems = RngSites.checkRows(asm.rows, asm.text.length);
    if (rowProblems.length) throw new Error('RNG site recorder: bad segment table: ' + rowProblems.join('; '));
    const sites = RngSites.buildSiteTable(sourceFiles.map((file, i) => ({ area: 'source', file, text: texts[i] })).concat([{ area: 'harness', file: 'harness', text: integrationScript }]));
    const classify = RngSites.makeClassifier({ sites, dropFrames: 1,
        locate: fr => (fr && fr.file === VM_FILE) ? (m => m.area === 'harness' ? { area: 'harness', file: 'harness', line: m.line, col: m.col } : m)(RngSites.mapPosition(asm, fr.line, fr.col)) : { area: 'unknown', reason: 'not-vm-file' } });
    const tallyRec = RngSites.makeTally();
    Error.stackTraceLimit = 50;
    siteRecorder = { note(stack) { tallyRec.note(classify(stack), stack); } };
    let firstLifeRngState = null;
    sandbox.__siteLifeStart = () => { if (firstLifeRngState === null) firstLifeRngState = rng.getState(); tallyRec.lifeStart(); };
    sandbox.__siteLifeEnd = () => { tallyRec.lifeEnd(); };
    const sha = text => require('crypto').createHash('sha256').update(text, 'utf8').digest('hex');
    if (process.env.SIM_RNG_ASSEMBLY === '1') fs.writeFileSync(SITE_OUT + '.assembly.txt', asm.text);   // 시험용: 실제로 실행하는 조립 문자열(위치 역변환 시험의 입력)
    process.on('exit', () => {
        try {
            fs.writeFileSync(SITE_OUT, JSON.stringify({ env: 'node-vm', seed: SEED, runs: RUNS, hpRegenMode: process.env.SIM_HP_REGEN_MODE || '(default)', newbornMembership: process.env.SIM_NEWBORN_MEMBERSHIP === '1',
                stackTraceLimit: Error.stackTraceLimit, vmFile: VM_FILE, assemblyLength: asm.text.length,
                rows: asm.rows.map(r => ({ kind: r.kind, file: r.file, startOffset: r.startOffset, endOffsetExclusive: r.endOffsetExclusive, vmStartLine: r.vmStartLine, vmStartCol: r.vmStartCol, vmEndLine: r.vmEndLine, vmEndColExclusive: r.vmEndColExclusive })),
                specialChars: Object.fromEntries(sourceFiles.map((file, i) => [file, RngSites.countSpecialChars(texts[i])]).concat([['integrationScript', RngSites.countSpecialChars(integrationScript)]])),
                sourceSha256: Object.fromEntries(sourceFiles.map((file, i) => [file, sha(texts[i])])), driverCoreSha256: sha(DRIVER_CORE_SRC), commitQueueSha256: sha(COMMIT_QUEUE_SRC),
                firstLifeRngState, sites, tally: tallyRec.report() }));
        } catch (e) { console.error('RNG site output failed:', e && e.message); process.exitCode = 1; }
    });
}

if (ACTIVE) sandbox.__MEAS_WRAP_ENDLIFE = MEAS.wrapEndLife;   // 계측 모드에서만 연결(측정 사본 script.js 가 첫 endLife 에서 감싼다)
let context;
try {
    context = vm.createContext(sandbox);
    const script = new vm.Script(source + '\n' + integrationScript, { filename: 'danmachi-integration-test.js' });
    script.runInContext(context, { timeout: 10 * 60 * 1000 });
} catch (error) {
    console.error('테스트 러너 자체 실행 오류:', error && error.stack || error);
    process.exitCode = 1;
    process.exit();
}

if (ACTIVE) MEAS.finishMeasurement(process.env.SIM_MEAS_REPORT || path.join(process.cwd(), 'meas_report.json'));   // vm 실행 직후·결과 출력 전 1회(F0~F4, M 등록)
const results = context.__TEST_RESULTS__;
if (!results) {
    console.error('테스트 결과가 생성되지 않았습니다.');
    process.exitCode = 1;
    process.exit();
}

// F1D4A P1: 하네스 무결성 오류가 있으면 이 실행의 계측 결과는 무효다. lifeDigest 를 숫자로 내지 않고(집계 도구가 받지 못하게) 종료 코드를 0 이 아니게 한다.
const harnessBroken = !!(results.harnessIntegrity && results.harnessIntegrity.broken);
if (harnessBroken) {
    console.error('harnessIntegrity: BROKEN', JSON.stringify(results.harnessIntegrity));
    results.lifeDigest = 'INVALID(harness integrity error)';
    process.exitCode = 1;
}
if (process.env.SIM_HARNESS_JSON) fs.writeFileSync(process.env.SIM_HARNESS_JSON, JSON.stringify({ harnessIntegrity: results.harnessIntegrity || null }));
console.log('==== DanMachi Life Simulation Test ====',
    '\nseed:', results.seed,
    '\nrequested:', results.requestedRuns,
    '\ncompleted:', results.completedRuns,
    '\nallRunsCompleted:', results.allRunsCompleted,
    '\nruntimeExceptions:', results.runtimeExceptions,
    '\nguardTrips:', results.guardTrips,
    '\naverageChronologicalAge:', results.averageChronologicalAge,
    '\naveragePhysicalAge:', results.averagePhysicalAge,
    '\nfalnaRatePct:', results.falnaRatePct,
    '\nrecruit2bb:', JSON.stringify(results.recruit2bb),
    '\naveragePotential:', results.averagePotential,
    '\naveragePostFalnaAbilityTotal:', results.averagePostFalnaAbilityTotal,
    '\nretiredLifeRatePct:', results.retiredLifeRatePct,
    '\nretiredEvents:', results.retiredEvents,
    '\nretiredDaysEvents:', results.retiredDaysEvents,
    '\nfinalLevelDistribution:', JSON.stringify(results.finalLevelDistribution),
    '\nmaxLevelReached:', results.maxLevelReached,
    '\nfinalJobDistribution:', JSON.stringify(results.finalJobDistribution),
    '\nrelationshipEvents:', JSON.stringify(results.partnerEvents),
    '\ninvalidPartnerStates:', results.invalidPartnerStates,
    '\nchildWithoutPartner:', results.childWithoutPartner,
    '\nnonFiniteValues:', results.nonFiniteValues,
    '\nnegativeGrowthValues:', results.negativeGrowthValues,
    '\nminObservedAgingRate:', results.minObservedAgingRate,
    '\nagingFloorUnitTest:', results.agingFloorUnitTest,
    '\nrelationshipUnitTests:', JSON.stringify(results.relationshipUnitTests),
    '\nrelationTerminationUnitTests:', JSON.stringify(results.relationTerminationUnitTests),
    '\nfamiliaOccupationUnitTests:', JSON.stringify(results.familiaOccupationUnitTests),
    '\nfamilyRelationsGenerated:', results.familyRelationsGenerated,
    '\npartnerAge100StillActiveUnitTest:', results.partnerAge100StillActiveUnitTest,
    '\npartnerBreakups:', results.partnerBreakups,
    '\npartnerDeaths:', results.partnerDeaths,
    '\nlevelUpFeatOnlyUnitTest:', results.levelUpFeatOnlyUnitTest,
    '\nscreenSwitchUnitTest:', results.screenSwitchUnitTest,
    '\nautoProgressUnitTest:', results.autoProgressUnitTest,
    '\npartnerFlagDependencyCount:', results.partnerFlagDependencyCount,
    '\nresultRenderingUnitTest:', results.resultRenderingUnitTest,
    '\ngrowthUnitTests:', JSON.stringify(results.growthUnitTests),
    '\nallInvariantsPassed:', results.allInvariantsPassed,
    '\nfamilyLives:', JSON.stringify({ withParentsAtBirth: results.livesWithParentsAtBirth, withoutAnyFamily: results.livesWithoutAnyFamily, familyRecords: results.familyRelationsGenerated, familyDeaths: results.familyDeaths, familyDeathsNatural: results.familyDeathsNatural, youngerSiblingsBorn: results.youngerSiblingsBorn, childrenBorn: results.childrenBorn, livesWithBereavement: results.livesWithBereavement, familyPartnerOverlap: results.familyPartnerOverlap }),
    '\npartnerLives:', JSON.stringify({ livesWithPartner: results.livesWithPartner, multiplePartners: results.livesWithMultiplePartners, deathsNatural: results.partnerDeathsNatural, deathsEvent: results.partnerDeathsEvent, breakups: results.partnerBreakups }),
    '\nlevelReach:', JSON.stringify({ livesReachedLv6: results.livesReachedLv6, livesReachedLv6InPhysicalWindow20to60: results.livesReachedLv6InWindow, heroSacrificeFired: results.heroSacrificeFired, heroSacrificeWon: results.heroSacrificeWon }),
    '\ndeathCauses:', JSON.stringify(results.deathCauseCounts),
    '\nitems:', JSON.stringify({ livesWithConsumedItem: results.livesWithConsumedItem, itemsConsumedTotal: results.itemsConsumedTotal }),
    '\nagesplit:', JSON.stringify({ maxCalendarMinusPhysical: results.maxAgeGap, livesWithGap5plus: results.calendarVsPhysicalGapLives }),
    '\nfamiliaJoins(adventurer/soldier families):', JSON.stringify(Object.fromEntries(Object.entries(results.familiaJoins).filter(([k]) => /^(ares|kali|loki|freya|hephaestus|hestia|ganesha):/.test(k)))),
    '\nfamiliaJoinJobOverwrites:', results.familiaJoinJobOverwrites,
    '\neventGateViolations:', results.eventGateViolations, JSON.stringify(results.eventGateViolationSamples),
    '\ninvariantFailures:', JSON.stringify(Object.entries(results.invariantFailures.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})).slice(0, 8)),
    '\nlifeDigest:', results.lifeDigest,
    '\nv177:', JSON.stringify(results.v177),
    '\nv178:', JSON.stringify(results.v178),
    '\nresidenceRi:', JSON.stringify(results.residenceRi),
    '\nf1Followup:', JSON.stringify(results.f1Followup),
    '\nv1aRngRestore:', results.v1aRngRestore,
    '\nhpInvariants:', JSON.stringify({ regenMode: process.env.SIM_HP_REGEN_MODE || 'physical', negativeHpWhileAlive: results.negativeHpWhileAlive, negativeHpAtDeath: results.negativeHpAtDeath, hpDeathsWithRescueLeft: results.hpDeathsWithRescueLeft, minHpSeenAlive: results.minHpSeenAlive }),
    '\ndungeonEventAudit:', JSON.stringify(results.dungeonEventAudit),
    '\npreFalnaAdventurerEvents:', JSON.stringify(results.preFalnaAdventurerEvents),
    '\norganizationJoins:', JSON.stringify(results.organizationJoins),
    '\nfamiliaFalnaTimeline:', JSON.stringify(results.timeline),
    '\nraceStats:', JSON.stringify(results.raceStats),
    '\nv17UnitTests:', JSON.stringify(results.v17UnitTests),
    '\nuniqueEventTypes:', results.uniqueEventTypes,
    '\nneverFiredEvents:', results.neverFiredEvents.join(', ') || '(none)'
);
if (results.firstRuntimeError) console.error('firstRuntimeError:', JSON.stringify(results.firstRuntimeError, null, 2));
if (!results.allRunsCompleted || !results.allInvariantsPassed || !results.agingFloorUnitTest || !results.resultRenderingUnitTest || results.partnerFlagDependencyCount !== 0 || !results.levelUpFeatOnlyUnitTest || !results.screenSwitchUnitTest || !results.autoProgressUnitTest || !results.partnerAge100StillActiveUnitTest || !results.familiaOccupationUnitTests.hephaestusDefaultsToBlacksmith || !results.familiaOccupationUnitTests.existingSupporterPreserved || Object.values(results.v17UnitTests).some(v => v === false)) process.exitCode = 1;
if (process.env.SIM_LIFE_DUMP && context.__lifeDump) fs.writeFileSync(process.env.SIM_LIFE_DUMP, JSON.stringify(context.__lifeDump));
