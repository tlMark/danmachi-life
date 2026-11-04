'use strict';

// Browser-compatible integration runner. It executes data.js, events.js, core/*.js and script.js.
// No npm packages (including uuid) are required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const RUNS = Number.isInteger(Number(process.env.SIM_RUNS)) ? Math.max(1, Number(process.env.SIM_RUNS)) : 3000;
const MAX_ACTIONS_PER_LIFE = 3000;
const SEED = Number.isInteger(Number(process.env.SIM_SEED)) ? Number(process.env.SIM_SEED) >>> 0 : 20261104;

function createRng(seed) {
    let state = seed >>> 0;
    return function random() {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function makeElement(tagName) {
    let html = '';
    let text = '';
    const element = {
        tagName: String(tagName || 'div').toUpperCase(),
        className: '',
        classList: { add() {}, remove() {}, contains() { return false; } },
        kids: [],
        parentNode: null,
        isConnected: true,
        checked: false,
        onclick: null,
        listeners: {},
        appendChild(child) {
            child.parentNode = this;
            child.isConnected = true;
            this.kids.push(child);
            return child;
        },
        removeChild(child) {
            this.kids = this.kids.filter(item => item !== child);
            child.parentNode = null;
            child.isConnected = false;
            return child;
        },
        querySelectorAll(selector) {
            if (selector === 'button') return this.kids.filter(child => child.tagName === 'BUTTON');
            return this.kids.slice();
        },
        addEventListener(type, callback) {
            (this.listeners[type] ||= []).push(callback);
        },
        click() {
            if (typeof this.onclick === 'function') this.onclick();
            (this.listeners.click || []).forEach(callback => callback({ target: this }));
        },
        scrollIntoView() {},
        set innerHTML(value) {
            html = String(value == null ? '' : value);
            if (html === '') this.kids = [];
        },
        get innerHTML() { return html; },
        set innerText(value) { text = String(value == null ? '' : value); },
        get innerText() { return text; },
        set textContent(value) { text = String(value == null ? '' : value); },
        get textContent() { return text; }
    };
    return element;
}

function makeDocument() {
    const elements = new Map();
    return {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement('div'));
            return elements.get(id);
        },
        createElement(tagName) { return makeElement(tagName); },
        querySelectorAll() { return []; },
        _elements: elements
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed');
}

const rng = createRng(SEED);
const math = Object.create(Math);
Object.defineProperty(math, 'random', { value: rng });
const document = makeDocument();
const sandbox = {
    console,
    assert,
    Math: math,
    document,
    window: { scrollTo() {} },
    setTimeout() { return 0; },
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
    Intl
};

const sourceFiles = [
    'data.js',
    'events.js',
    'core/aging.js',
    'core/growth.js',
    'core/relations.js',
    'script.js'
];
const source = sourceFiles.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n');

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
        totalPotential: 0, totalPostFalnaAbility: 0,
        nonFiniteValues: 0, negativeGrowthValues: 0,
        invalidPartnerStates: 0, childWithoutPartner: 0,
        averageChronologicalAge: 0, averagePhysicalAge: 0,
        minObservedAgingRate: Infinity, agingFloorUnitTest: false,
        relationshipUnitTests: {}, growthUnitTests: {},
        resultRenderingUnitTest: false, partnerFlagDependencyCount: 0,
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
    showEvent = function (event) {
        results.eventCount += 1;
        results.uniqueEvents[event.id] = (results.uniqueEvents[event.id] || 0) + 1;
        const job = S.job || '(unknown)';
        results.eventCountsByJob[job] = (results.eventCountsByJob[job] || 0) + 1;
        currentLifeEvents.push(event.id);
        if (job === 'adventurer') results.adventurerEvents += 1;
        if (job === 'supporter') results.supporterEvents += 1;
        if (job === 'retired') {
            results.retiredEvents += 1;
            if (event.id === 'retired_days') results.retiredDaysEvents += 1;
        }
        if (event.id === 'have_child' && !GameCore.Relations.hasPartner(S)) results.childWithoutPartner += 1;
        return originalShowEvent(event);
    };

    let chronologicalTotal = 0;
    let physicalTotal = 0;
    for (let run = 0; run < ${RUNS}; run++) {
        try {
            currentLifeEvents = [];
            startLife();
            let actions = 0;
            let wasRetired = false;
            while (!S.cause && actions < ${MAX_ACTIONS_PER_LIFE}) {
                const buttons = $('choices').kids || [];
                const usable = buttons.filter(button => typeof button.onclick === 'function');
                if (usable.length === 0) {
                    throw new Error('simulation stalled: no actionable choice at age ' + S.age + ', job=' + S.job);
                }
                usable[Math.floor(Math.random() * usable.length)].onclick();
                actions += 1;
                if (S.job === 'retired') wasRetired = true;

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

            results.completedRuns += 1;
            if (wasRetired) results.livesThatRetired += 1;
            if (S.flags.includes('falna')) results.falnaLives += 1;
            const finalLevel = Number.isFinite(S.level) ? S.level : 0;
            results.finalLevelDistribution[finalLevel] = (results.finalLevelDistribution[finalLevel] || 0) + 1;
            results.finalJobDistribution[S.job] = (results.finalJobDistribution[S.job] || 0) + 1;
            results.maxLevelReached = Math.max(results.maxLevelReached, finalLevel);
            if (S.potential > 0) results.preFalnaLivesWithPotential += 1;
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
        have_child: results.uniqueEvents.have_child || 0
    };
    results.allRunsCompleted = results.completedRuns === ${RUNS} && results.runtimeExceptions === 0 && results.guardTrips === 0;
    results.allInvariantsPassed = results.invariantFailures.length === 0
        && results.nonFiniteValues === 0
        && results.negativeGrowthValues === 0
        && results.invalidPartnerStates === 0
        && results.childWithoutPartner === 0;

    globalThis.__TEST_RESULTS__ = results;
})();
`;

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

const results = context.__TEST_RESULTS__;
if (!results) {
    console.error('테스트 결과가 생성되지 않았습니다.');
    process.exitCode = 1;
    process.exit();
}

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
    '\npartnerFlagDependencyCount:', results.partnerFlagDependencyCount,
    '\nresultRenderingUnitTest:', results.resultRenderingUnitTest,
    '\ngrowthUnitTests:', JSON.stringify(results.growthUnitTests),
    '\nallInvariantsPassed:', results.allInvariantsPassed,
    '\nuniqueEventTypes:', results.uniqueEventTypes,
    '\nneverFiredEvents:', results.neverFiredEvents.join(', ') || '(none)'
);
if (results.firstRuntimeError) console.error('firstRuntimeError:', JSON.stringify(results.firstRuntimeError, null, 2));
if (!results.allRunsCompleted || !results.allInvariantsPassed || !results.agingFloorUnitTest || !results.resultRenderingUnitTest || results.partnerFlagDependencyCount !== 0) process.exitCode = 1;
