/* Browser module: equipment / consumable rules for S.items (array of item ids from data.js gachaData.items).
   S.itemUses = { id: remainingUses } is kept for items that define maxUses. */
(function (root) {
    'use strict';
    const core = root.GameCore = root.GameCore || {};
    let catalog = [];
    const RESCUE_HP = 25;            // 임의 밸런스 값: 체력이 이 값 이하가 되면 회복 소모품을 자동 사용
    const BOOST_BELOW_P = 0.75;      // 임의 밸런스 값: 전투력 판정 성공률이 이 값 미만일 때만 전투 소모품을 사용

    function setCatalog(items) { catalog = Array.isArray(items) ? items : []; }
    function getDef(id) { return catalog.find(item => item && item.id === id) || null; }
    function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
    function ensure(S) {
        if (!Array.isArray(S.items)) S.items = [];
        if (!S.itemUses || typeof S.itemUses !== 'object') S.itemUses = {};
        if (!Array.isArray(S.itemsConsumed)) S.itemsConsumed = [];
        return S;
    }
    const isEquipment = def => !!def && (def.type === 'armor' || def.type === 'weapon');
    const isConsumable = def => !!def && def.type === 'consumable';
    const score = def => num(def.fx && def.fx.power) + num(def.fx && def.fx.hpMax);

    // One weapon and one armor are equipped at a time (the best owned one by power + hpMax).
    function getEquipped(S) {
        ensure(S);
        const best = { weapon: null, armor: null };
        S.items.forEach(id => {
            const def = getDef(id);
            if (!isEquipment(def)) return;
            if (!best[def.type] || score(def) > score(best[def.type])) best[def.type] = def;
        });
        return best;
    }

    function equipmentPower(S) {
        const eq = getEquipped(S);
        return ['weapon', 'armor'].reduce((sum, slot) => sum + num(eq[slot] && eq[slot].fx && eq[slot].fx.power), 0);
    }

    function hpCap(S) {
        const eq = getEquipped(S);
        return 100 + num(eq.armor && eq.armor.fx && eq.armor.fx.hpMax);
    }

    function usesLeft(S, id) {
        ensure(S);
        const def = getDef(id);
        if (!def || !Number.isFinite(Number(def.maxUses))) return null;
        return Number.isFinite(Number(S.itemUses[id])) ? S.itemUses[id] : def.maxUses;
    }

    // Returns { added:boolean, consumedOnAcquire:boolean, def }.
    // Consumables that grant a permanent effect on acquisition (feat / flags) are already applied by the
    // event that hands them out, so they are used up immediately and never enter the inventory.
    function acquire(S, id) {
        ensure(S);
        const def = getDef(id);
        if (S.items.includes(id)) return { added: false, consumedOnAcquire: false, def };
        if (isConsumable(def) && def.fx && (def.fx.feat || def.fx.flags)) {
            S.itemsConsumed.push(id);
            return { added: false, consumedOnAcquire: true, def };
        }
        S.items.push(id);
        if (def && Number.isFinite(Number(def.maxUses))) S.itemUses[id] = def.maxUses;
        return { added: true, consumedOnAcquire: false, def };
    }

    function spend(S, id) {
        const left = usesLeft(S, id);
        if (left == null) return null;
        const remaining = left - 1;
        S.itemUses[id] = remaining;
        if (remaining <= 0) {
            S.items = S.items.filter(item => item !== id);
            delete S.itemUses[id];
            S.itemsConsumed.push(id);
        }
        return remaining;
    }

    function remove(S, id) {
        ensure(S);
        S.items = S.items.filter(item => item !== id);
        delete S.itemUses[id];
    }

    // Combat consumable (fx.power): used before a power-based roll whose success chance is low.
    // Returns { id, label, bonus, remaining } or null.
    function takePowerBoost(S, baseProbability) {
        ensure(S);
        if (Number.isFinite(baseProbability) && baseProbability >= BOOST_BELOW_P) return null;
        const id = S.items.find(item => { const def = getDef(item); return isConsumable(def) && num(def.fx && def.fx.power) > 0 && (usesLeft(S, item) || 0) > 0; });
        if (!id) return null;
        const def = getDef(id);
        const remaining = spend(S, id);
        return { id, label: def.label, bonus: num(def.fx.power), remaining };
    }

    // Healing consumable (fx.hp): used when hp is at or below RESCUE_HP. Returns { id, label, heal, remaining } or null.
    function takeRescue(S) {
        ensure(S);
        if (!(S.hp <= RESCUE_HP)) return null;
        const id = S.items.find(item => { const def = getDef(item); return isConsumable(def) && num(def.fx && def.fx.hp) > 0 && (usesLeft(S, item) || 0) > 0; });
        if (!id) return null;
        const def = getDef(id);
        const remaining = spend(S, id);
        return { id, label: def.label, heal: num(def.fx.hp), remaining };
    }

    function label(S, id) {
        const def = getDef(id);
        const left = usesLeft(S, id);
        const name = def ? def.label : id;
        return left == null ? name : `${name} (${left}/${def.maxUses})`;
    }

    core.Items = {
        RESCUE_HP, BOOST_BELOW_P,
        setCatalog, getDef, getEquipped, equipmentPower, hpCap, usesLeft,
        acquire, spend, remove, takePowerBoost, takeRescue, label
    };
})(globalThis);
