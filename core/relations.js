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
        // Preserve the pre-existing social relationship (friend, rival, colleague, etc.).
        // Romantic status is orthogonal to the relation's original type/subType.
        target.isPartner = true;
        target.relationshipStatus = 'partnered';
        return true;
    }

    function allocateRelationId(S) {
        const relations = ensureRelations(S);
        let id;
        do {
            id = 'relation-' + Number(S.age) + '-' + S.nextRelationId;
            S.nextRelationId += 1;
            if (!Number.isSafeInteger(S.nextRelationId)) S.nextRelationId = 1;
        } while (relations.some(item => item && String(item.id) === id));
        return id;
    }

    // ---- NPC metadata helpers (임의 밸런스 값은 각 상수 옆에 표시) ----
    const PARTNER_FALNA_RATE = 0.35;            // 임의 값: 파트너가 팔나를 가진 비율
    const PARTNER_LEVEL_WEIGHTS = [[1, 70], [2, 22], [3, 7], [4, 1]];   // 임의 값: 팔나 파트너의 레벨 분포
    const MAX_PARTNER_BODY_AGE = 60;            // 임의 값: 이 육체 나이를 넘는 종족 조합은 연인 후보에서 제외
    const ACCIDENT_HAZARD = 0.0025;             // 임의 값: NPC 연간 사고·병사 확률(성인)
    const INFANT_HAZARD = 0.004;                // 임의 값: NPC 5세 미만 연간 사망 확률
    const FALNA_PARTNER_HAZARD = 0.006;         // 임의 값: 팔나 보유 파트너의 추가 위험(던전 활동)
    const MAX_NEW_SIBLINGS = 3;
    const SIBLING_BIRTH_CHANCE = 0.03;          // 임의 값: 어머니가 40세 이하일 때 연간 동생 출산 확률

    function raceIdOf(S) {
        return S && S.race && typeof S.race === 'object' ? S.race.id : (S && S.race) || 'human';
    }

    function weightedPick(entries) {
        const total = entries.reduce((sum, item) => sum + item[1], 0);
        let roll = Math.random() * total;
        for (const [value, weight] of entries) { if (roll < weight) return value; roll -= weight; }
        return entries[entries.length - 1][0];
    }

    function physicalOf(calendarAge, raceId, ctx) {
        const aging = core.Aging;
        return aging && aging.physicalFromCalendar ? aging.physicalFromCalendar(calendarAge, raceId, ctx && ctx.mods) : calendarAge;
    }

    function calendarFromPhysical(physicalAge, raceId, ctx) {
        // inverse of physicalFromCalendar for a never-Falna body
        const aging = core.Aging;
        const scale = aging && aging.getRaceBaseRate ? aging.getRaceBaseRate({ race: raceId }, ctx && ctx.mods) : 1;
        const rate = scale > 0 ? scale : 1;
        return physicalAge <= 20 ? physicalAge : 20 + (physicalAge - 20) / rate;
    }

    function pickPartnerRace(S, targetAge, ctx) {
        const own = raceIdOf(S);
        const pool = ctx && Array.isArray(ctx.races) ? ctx.races.filter(r => r && r.id !== 'xenos') : [];
        // Amazons are a female-only race: an Amazon protagonist's partner is never Amazon; others may be.
        for (let attempt = 0; attempt < 8; attempt++) {
            let candidate = own;
            if (pool.length && Math.random() >= 0.6) {
                const candidates = pool.filter(r => !(own === 'amazon' && r.id === 'amazon'));
                if (candidates.length) candidate = weightedPick(candidates.map(r => [r.id, r.weight || 1]));
            }
            if (physicalOf(targetAge, candidate, ctx) <= MAX_PARTNER_BODY_AGE) return candidate;
        }
        return own;
    }

    function buildNpc(S, spec, ctx) {
        const raceId = spec.race || raceIdOf(S);
        const age = Math.max(0, Math.floor(spec.age));
        const npc = {
            id: allocateRelationId(S),
            type: spec.type,
            subType: spec.subType,
            name: spec.name,
            race: raceId,
            age,
            physicalAge: spec.physicalAge != null ? spec.physicalAge : physicalOf(age, raceId, ctx),
            falna: !!spec.falna,
            level: spec.level || 0,
            alive: true,
            metAtAge: Number(S.age) || 0,
            source: spec.source || 'generated'
        };
        npc.phase = Math.floor(npc.physicalAge + 1e-9);
        if (spec.isFamily) npc.isFamily = true;
        return npc;
    }

    function createRomanticPartner(S, source, ctx) {
        if (!S || Number(S.age) < ADULT_AGE || hasPartner(S)) return null;
        const age = Number(S.age);
        const minAge = Math.max(ADULT_AGE, age - MAX_AGE_GAP);
        const maxAge = age + MAX_AGE_GAP;
        if (minAge > maxAge) return null;
        const targetAge = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
        const relations = ensureRelations(S);
        const raceId = pickPartnerRace(S, targetAge, ctx);
        const hasFalna = Math.random() < PARTNER_FALNA_RATE;
        const level = hasFalna ? weightedPick(PARTNER_LEVEL_WEIGHTS) : 0;
        const relation = buildNpc(S, {
            type: 'friend', subType: 'romance_candidate', name: '연인', age: targetAge,
            race: raceId, falna: hasFalna, level, source: source || 'event'
        }, ctx);
        relations.push(relation);
        if (!marry(S, relation.id)) {
            // Remove only the object created here; duplicate IDs in a damaged save
            // must never delete an older relation record.
            const index = relations.indexOf(relation);
            if (index >= 0) relations.splice(index, 1);
            return null;
        }
        return relation;
    }

    // ---- family NPCs (parents / siblings / children). Never romance candidates (isFamily). ----
    function parentRaces(raceId) {
        if (raceId === 'xenos') return { mother: null, father: null };                // 던전에서 태어난 존재: 부모 없음
        if (raceId === 'amazon') return { mother: 'amazon', father: null };           // 여성 전용 종족: 아버지는 알려지지 않음
        if (raceId === 'half_elf') return Math.random() < 0.5 ? { mother: 'elf', father: 'human' } : { mother: 'human', father: 'elf' };
        return { mother: raceId, father: raceId };
    }

    function generateFamily(S, ctx) {
        const relations = ensureRelations(S);
        const created = [];
        if (relations.some(item => item && item.isFamily && item.source === 'birth')) return created;   // already generated
        if (raceIdOf(S) === 'xenos') return created;                                   // 던전에서 태어난 제노스: 혈연 가족 없음
        const races = parentRaces(raceIdOf(S));
        [['mother', '어머니'], ['father', '아버지']].forEach(([key, name]) => {
            const parentRace = races[key];
            if (!parentRace || Math.random() > 0.92) return;                        // 임의 값: 부모가 곁에 없을 확률 8%
            const physical = 20 + Math.floor(Math.random() * 19);                   // 임의 값: 출생 시 육체 나이 20~38
            const npc = buildNpc(S, {
                type: 'family', subType: 'parent', name, race: parentRace, isFamily: true, source: 'birth',
                age: Math.round(calendarFromPhysical(physical, parentRace, ctx)), physicalAge: physical
            }, ctx);
            relations.push(npc); created.push(npc);
        });
        const count = weightedPick([[0, 40], [1, 38], [2, 17], [3, 5]]);           // 임의 값: 손위 형제 수
        for (let i = 0; i < count; i++) {
            const gap = 1 + Math.floor(Math.random() * 9);
            const npc = buildNpc(S, { type: 'family', subType: 'sibling', name: '손위 형제', race: raceIdOf(S), isFamily: true, source: 'birth', age: gap }, ctx);
            relations.push(npc); created.push(npc);
        }
        return created;
    }

    function createChild(S, ctx) {
        if (!S) return null;
        const relations = ensureRelations(S);
        const partner = getCurrentPartner(S);
        const raceId = partner && partner.race && Math.random() < 0.5 ? partner.race : raceIdOf(S);
        const child = buildNpc(S, { type: 'family', subType: 'child', name: '자녀', race: raceId, isFamily: true, age: 0, source: 'child' }, ctx);
        relations.push(child);
        return child;
    }

    function getLiving(S, subTypes) {
        const list = Array.isArray(subTypes) ? subTypes : (subTypes ? [subTypes] : null);
        return ensureRelations(S).filter(item => item && item.alive !== false && item.isFamily === true && (!list || list.includes(item.subType)));
    }

    function hasLivingRelative(S, subTypes) {
        return getLiving(S, subTypes).length > 0;
    }

    function endRelationship(S, targetId, reason) {
        if (!S || targetId == null) return false;
        const relation = ensureRelations(S).find(item => String(item.id) === String(targetId));
        if (!relation) return false;
        const deceasedReason = typeof reason === 'string' && reason.indexOf('deceased') === 0;
        const endReason = deceasedReason ? reason : 'breakup';
        relation.relationshipStatus = 'ended';
        relation.endReason = endReason;
        if (deceasedReason) {
            relation.alive = false;
            relation.deathAge = Number.isFinite(Number(relation.age)) ? Number(relation.age) : null;
        }
        if (String(S.partnerId) === String(targetId)) S.partnerId = null;
        return true;
    }

    // Advances every relation by one year. Returns notable events: [{ kind:'death'|'birth', relation, cause }].
    function advanceYear(S, mods) {
        const events = [];
        const aging = core.Aging;
        const relations = ensureRelations(S);
        relations.slice().forEach(relation => {
            if (!relation || relation.alive === false) return;
            if (relation.physicalAge === undefined || !aging || !aging.advanceEntity) {
                // legacy record without NPC metadata: calendar age only
                if (Number.isFinite(Number(relation.age))) relation.age = Number(relation.age) + 1;
                return;
            }
            const result = aging.advanceEntity(relation, mods);
            if (!result) return;
            let cause = null;
            if (relation.phase > 65 && Math.random() < aging.naturalDeathChance(relation.phase, result.rate)) cause = 'natural';
            else {
                let hazard = relation.age < 5 ? INFANT_HAZARD : ACCIDENT_HAZARD;
                if (relation.type === 'partner' || relation.isPartner) hazard += relation.falna ? FALNA_PARTNER_HAZARD : 0;
                if (Math.random() < hazard) cause = 'event';
            }
            if (cause) {
                const reason = cause === 'natural' ? 'deceased_natural' : 'deceased_event';
                const isActivePartner = String(S.partnerId) === String(relation.id);
                if (isActivePartner) endRelationship(S, relation.id, reason);
                else { relation.alive = false; relation.deathAge = relation.age; relation.endReason = reason; }
                events.push({ kind: 'death', relation, cause });
            }
        });
        // A younger sibling may be born while the mother is alive and young enough.
        if (Number(S.age) <= 20) {
            const mother = getLiving(S, 'parent').find(item => item.name === '어머니' && item.phase <= 40);
            const siblings = relations.filter(item => item && item.isFamily && item.subType === 'sibling' && item.source === 'sibling_birth').length;
            if (mother && siblings < MAX_NEW_SIBLINGS && Math.random() < SIBLING_BIRTH_CHANCE) {
                const baby = buildNpc(S, { type: 'family', subType: 'sibling', name: '동생', race: mother.race, isFamily: true, source: 'sibling_birth', age: 0 }, mods ? { mods } : undefined);
                relations.push(baby);
                events.push({ kind: 'birth', relation: baby });
            }
        }
        // If a partner has died or ceased to satisfy the safety rules, clear the active link.
        if (S.partnerId != null && !getCurrentPartner(S)) S.partnerId = null;
        return events;
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
        generateFamily,
        createChild,
        getLiving,
        hasLivingRelative,
        endRelationship,
        advanceYear
    };
})(globalThis);
