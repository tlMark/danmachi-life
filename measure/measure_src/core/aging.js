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

    // Natural-death chance used by the protagonist (script.js) and by NPC relations (core/relations.js).
    // 임의 밸런스 값: phase 65 초과부터 해마다 4%p씩 증가, 노화율이 낮을수록 완화된다.
    function naturalDeathChance(phase, rate) {
        const p = Number(phase), r = finite(Number(rate), 1);
        if (!Number.isFinite(p) || p <= 65) return 0;
        return Math.min(1, Math.max(0, (p - 65) * 0.04 * r));
    }

    // NPC (family / partner) aging. Entity shape: { age, physicalAge, race:{id}|id, falna:boolean, level }.
    // Uses exactly the same race/Falna/level rules as the protagonist via getFinalAgingRate.
    function advanceEntity(entity, mods) {
        if (!entity || typeof entity !== 'object') return null;
        entity.age = Math.max(0, finite(Number(entity.age), 0)) + 1;
        const view = {
            age: entity.age,
            race: entity.race,
            level: finite(Number(entity.level), 0),
            flags: entity.falna ? ['falna'] : []
        };
        const rate = getFinalAgingRate(view, mods);
        entity.physicalAge = Math.max(0, finite(Number(entity.physicalAge), entity.age - 1)) + rate;
        entity.phase = Math.floor(entity.physicalAge + 1e-9);
        return { rate, phase: entity.phase };
    }

    // Convert a calendar age to the body age of a person who has never held Falna (used when an NPC is created).
    function physicalFromCalendar(calendarAge, raceId, mods) {
        const age = Math.max(0, finite(Number(calendarAge), 0));
        const scale = getRaceBaseRate({ race: raceId }, mods);
        return age <= 20 ? age : 20 + (age - 20) * scale;
    }

    core.Aging = {
        MIN_FINAL_AGING_RATE,
        getRaceBaseRate,
        getFinalAgingRate,
        advanceYear,
        naturalDeathChance,
        advanceEntity,
        physicalFromCalendar
    };
})(globalThis);
