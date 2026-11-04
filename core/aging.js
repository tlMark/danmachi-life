/* Browser module: age progression compatible with the actual game state. */
(function (root) {
    'use strict';
    const core = root.GameCore = root.GameCore || {};
    const MIN_FINAL_AGING_RATE = 0.1;

    function finite(value, fallback) {
        return Number.isFinite(value) ? value : fallback;
    }

    function getRaceBaseRate(S, mods) {
        const raceId = S && S.race && typeof S.race === 'object' ? S.race.id : S && S.race;
        const raceConfig = (mods && mods.races && mods.races[raceId]) || {};
        // MODS.races[elf].rate is a lifespan scale (4 means one physical year per four calendar years).
        const lifespanScale = finite(raceConfig.rate, 1);
        if (lifespanScale <= 0) return 1;
        return 1 / lifespanScale;
    }

    function getFinalAgingRate(S, mods) {
        const chronologicalAge = Math.max(0, finite(S && S.age, 0));
        // Keep childhood progression unchanged; racial/Falna slowing applies after age 20.
        const raceRate = chronologicalAge <= 20 ? 1 : getRaceBaseRate(S, mods);
        const hasFalna = !!(S && Array.isArray(S.flags) && S.flags.includes('falna'));
        const level = Math.max(0, finite(S && S.level, 0));
        const falnaRate = hasFalna ? Math.max(MIN_FINAL_AGING_RATE, 1 - level * 0.15) : 1;
        // The lower bound is applied after both race and Falna modifiers.
        return Math.max(MIN_FINAL_AGING_RATE, raceRate * falnaRate);
    }

    function advanceYear(S, mods) {
        if (!S || typeof S !== 'object') throw new TypeError('Aging.advanceYear requires a game state');
        S.age = Math.max(0, finite(S.age, 0)) + 1;
        S.chronologicalAge = S.age;
        const rate = getFinalAgingRate(S, mods);
        S.physicalAge = Math.max(0, finite(S.physicalAge, S.age - 1)) + rate;
        S.phase = Math.max(0, Math.floor(S.physicalAge + 1e-9));
        return { chronologicalAge: S.age, physicalAge: S.physicalAge, phase: S.phase, rate };
    }

    core.Aging = {
        MIN_FINAL_AGING_RATE,
        getRaceBaseRate,
        getFinalAgingRate,
        advanceYear
    };
})(globalThis);
