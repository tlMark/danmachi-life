/* Browser module: relationship rules compatible with the game's relation array. */
(function (root) {
    'use strict';
    const core = root.GameCore = root.GameCore || {};
    const ADULT_AGE = 18;
    const MAX_AGE_GAP = 10;
    const FAMILY_SUBTYPES = new Set([
        'parent', 'child', 'sibling', 'brother', 'sister', 'adopted_sibling',
        'step_sibling', 'grandparent', 'grandchild', 'cousin', 'relative'
    ]);

    function isFamilyRelation(relation) {
        if (!relation) return true;
        const type = String(relation.type || '').toLowerCase();
        const subType = String(relation.subType || '').toLowerCase();
        return relation.isFamily === true || type === 'family' || type === 'relative' || FAMILY_SUBTYPES.has(subType);
    }

    function ensureRelations(S) {
        if (!Array.isArray(S.relations)) S.relations = [];
        if (!Number.isSafeInteger(S.nextRelationId) || S.nextRelationId < 1) S.nextRelationId = 1;
        return S.relations;
    }

    function isEligiblePartner(S, relation) {
        if (!S || !relation || !Number.isFinite(Number(S.age)) || !Number.isFinite(Number(relation.age))) return false;
        if (Number(S.age) < ADULT_AGE || Number(relation.age) < ADULT_AGE) return false;
        if (Math.abs(Number(S.age) - Number(relation.age)) > MAX_AGE_GAP) return false;
        if (relation.alive === false || isFamilyRelation(relation) || relation.relationshipStatus === 'ended') return false;
        if (relation.id == null || relation.id === '') return false;
        return true;
    }

    function getCurrentPartner(S) {
        if (!S || S.partnerId == null) return null;
        const relations = ensureRelations(S);
        const partner = relations.find(item => String(item.id) === String(S.partnerId));
        return isEligiblePartner(S, partner) ? partner : null;
    }

    function hasPartner(S) {
        return !!getCurrentPartner(S);
    }

    function getEligiblePartners(S) {
        if (!S || hasPartner(S)) return [];
        return ensureRelations(S).filter(relation => isEligiblePartner(S, relation));
    }

    function marry(S, targetId) {
        if (!S || Number(S.age) < ADULT_AGE || hasPartner(S)) return false;
        const target = ensureRelations(S).find(relation => String(relation.id) === String(targetId));
        if (!isEligiblePartner(S, target)) return false;
        S.partnerId = target.id;
        target.type = 'partner';
        target.subType = 'romantic_partner';
        target.relationshipStatus = 'partnered';
        return true;
    }

    function createRomanticPartner(S, source) {
        if (!S || Number(S.age) < ADULT_AGE || hasPartner(S)) return null;
        const age = Number(S.age);
        const minAge = Math.max(ADULT_AGE, age - MAX_AGE_GAP);
        const maxAge = age + MAX_AGE_GAP;
        if (minAge > maxAge) return null;
        const targetAge = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
        const relation = {
            id: 'relation-' + S.age + '-' + S.nextRelationId,
            type: 'friend',
            subType: 'romance_candidate',
            name: '연인',
            age: targetAge,
            alive: true,
            metAtAge: age,
            source: source || 'event'
        };
        S.nextRelationId += 1;
        ensureRelations(S).push(relation);
        if (!marry(S, relation.id)) {
            S.relations = S.relations.filter(item => item.id !== relation.id);
            return null;
        }
        return relation;
    }

    function advanceYear(S) {
        ensureRelations(S).forEach(relation => {
            if (relation && relation.alive !== false && Number.isFinite(Number(relation.age))) {
                relation.age = Number(relation.age) + 1;
            }
        });
        // If a partner has died or ceased to satisfy the safety rules, clear the active link.
        if (S.partnerId != null && !getCurrentPartner(S)) S.partnerId = null;
    }

    core.Relations = {
        ADULT_AGE,
        MAX_AGE_GAP,
        isFamilyRelation,
        isEligiblePartner,
        getEligiblePartners,
        getCurrentPartner,
        hasPartner,
        marry,
        createRomanticPartner,
        advanceYear
    };
})(globalThis);
