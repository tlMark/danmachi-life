/* Browser module: growth compatible with S.abil (str/vit/dex/agi/mag). */
(function (root) {
    'use strict';
    const core = root.GameCore = root.GameCore || {};
    const ABILITY_KEYS = ['str', 'vit', 'dex', 'agi', 'mag'];
    const NORMAL_CAP = 999;
    const LIARIS_CAP = 1499;
    const EXP_TO_ABILITY = 50;
    const MAX_STORED_GROWTH = 1_000_000_000;

    function finiteNonNegative(value) {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function getRaceBonus(raceId) {
        const bonuses = { human: 1, beastman: 1.15, pallum: 1.05, dwarf: 1.2, elf: 1.1, half_elf: 1.05, amazon: 1.15, renard: 1.1, xenos: 1.1 };
        return bonuses[raceId] || 1;
    }

    function addExperience(S, amount) {
        if (!S || typeof S !== 'object') return 0;
        const gain = finiteNonNegative(amount);
        if (gain <= 0) return 0;
        if (!Array.isArray(S.flags)) S.flags = [];
        if (S.flags.includes('falna')) {
            S.excelia = Math.min(MAX_STORED_GROWTH, finiteNonNegative(S.excelia) + gain);
        } else {
            const raceId = S.race && typeof S.race === 'object' ? S.race.id : S.race;
            S.potential = Math.min(MAX_STORED_GROWTH, finiteNonNegative(S.potential) + gain * getRaceBonus(raceId));
        }
        return gain;
    }

    function getBias(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.min(10, Math.max(0.1, n)) : 1;
    }

    function convertExcelia(S, mods) {
        if (!S || !Array.isArray(S.flags) || !S.flags.includes('falna')) return false;
        const excelia = finiteNonNegative(S.excelia);
        if (excelia <= 0) {
            S.excelia = 0;
            return false;
        }

        const raceId = S.race && typeof S.race === 'object' ? S.race.id : S.race;
        const talentId = S.talent && typeof S.talent === 'object' ? S.talent.id : S.talent;
        const raceBias = (mods && mods.races && mods.races[raceId] && mods.races[raceId].bias) || {};
        const talentBias = (mods && mods.talents && mods.talents[talentId] && mods.talents[talentId].bias) || {};
        const weights = ABILITY_KEYS.map(key => getBias(raceBias[key]) * getBias(talentBias[key]));
        const weightTotal = weights.reduce((sum, value) => sum + value, 0);
        if (!Number.isFinite(weightTotal) || weightTotal <= 0) {
            S.excelia = 0;
            return false;
        }

        if (!S.abil || typeof S.abil !== 'object') S.abil = {};
        const liaris = S.flags.includes('liaris');
        const cap = liaris ? LIARIS_CAP : NORMAL_CAP;
        const multiplier = liaris ? 1.5 : 1;
        const totalGain = Math.min(MAX_STORED_GROWTH, excelia * EXP_TO_ABILITY * multiplier);

        ABILITY_KEYS.forEach((key, index) => {
            const current = Math.min(cap, finiteNonNegative(S.abil[key]));
            const share = weights[index] / weightTotal;
            const diminishing = Math.max(0, 1 - current / (cap + 300));
            const rawGain = totalGain * share * diminishing;
            const safeGain = Number.isFinite(rawGain) ? Math.max(0, rawGain) : 0;
            S.abil[key] = Math.min(cap, Math.max(0, Math.round(current + safeGain)));
        });

        S.excelia = 0;
        return true;
    }

    function getAbilityTotal(S) {
        if (!S || !S.abil) return 0;
        return ABILITY_KEYS.reduce((sum, key) => sum + finiteNonNegative(S.abil[key]), 0);
    }

    core.Growth = {
        ABILITY_KEYS,
        NORMAL_CAP,
        LIARIS_CAP,
        EXP_TO_ABILITY,
        finiteNonNegative,
        getRaceBonus,
        addExperience,
        convertExcelia,
        getAbilityTotal
    };
})(globalThis);
