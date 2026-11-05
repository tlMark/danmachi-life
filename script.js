// 의존: data.js (gachaData), events.js (MODS, FAMILIA_BIAS, DEFAULT_FALNA, MAX_LEVEL, EVENTS)
const $ = id => document.getElementById(id);
const ABIL = [['str', '힘'], ['vit', '내구'], ['dex', '기교'], ['agi', '민첩'], ['mag', '마력']];
const RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];   // 100 단위
const rankOf = v => v >= 1200 ? 'SSS' : v >= 1000 ? 'SS' : RANKS[Math.min(9, Math.floor(v / 100))];   // 1000~1199 SS, 1200~ SSS
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const LEVELUP_ABIL = 500;    // 레벨업 조건: 능력치 하나가 D(500) 이상
let S;
GameCore.Items.setCatalog(gachaData.items);
const relationCtx = () => ({ races: gachaData.races, mods: MODS });
const JOB_LABELS = { child:'유년기', adventurer:'모험자', supporter:'서포터', guild_staff:'길드 직원', blacksmith:'대장장이', merchant:'상인', farmer:'농부', healer:'치유사', soldier:'병사', waitstaff:'종업원', retired:'은퇴자' };
// 조직·고용처(파밀리아가 아님, 팔나 없음)의 기본 직업. child 일 때만 적용된다.
const JOB_ORG = { guild: 'guild_staff', hostess: 'waitstaff' };
const JOB_FAMILIA = { hephaestus:'blacksmith', demeter:'farmer', miach:'healer', ares:'soldier', kali:'soldier' };
function setAspiration(kind, source) {
    S.aspirationHistory ||= [];
    if (S.aspiration && S.aspiration.kind === kind) return;
    S.aspiration = { kind, since: S.age, source, fulfilledAt: null };
    S.aspirationHistory.push({ ...S.aspiration });
}

function setJob(job) {
    const previous = S.job;
    S.job = job;
    S.flags = S.flags.filter(f => !['adventurer','supporter','crafter','soldier'].includes(f));
    if (job === 'adventurer') { S.flags.push('adventurer'); setAspiration('adventurer', 'job_assigned'); }
    if (job === 'supporter') S.flags.push('supporter');
    if (job === 'blacksmith') S.flags.push('crafter');
    if (job === 'soldier') S.flags.push('soldier');
    if (previous !== job && S.logHistory) S.logHistory.push({ age:S.age, type:'job', text:`직업이 ${JOB_LABELS[job] || job}(으)로 바뀌었다.` });
}

function getRandomItemByWeight(items, key = 'weight') {
    const total = items.reduce((s, i) => s + i[key], 0);
    let r = Math.random() * total;
    for (const i of items) { if (r < i[key]) return i; r -= i[key]; }
    return items[items.length - 1];
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    $(id).classList.remove('hidden'); $(id).classList.add('active');
}

function getChoiceProbability(chance = {}, extraPower = 0) {
    let rawStat = chance.stat
        ? (ABIL.find(([key]) => key === chance.stat) ? S.abil[chance.stat] : S[chance.stat])
        : 0;
    if (chance.stat === 'power' && Number.isFinite(Number(extraPower))) rawStat = Number(rawStat) + Number(extraPower);
    const statValue = Number.isFinite(Number(rawStat)) ? Number(rawStat) : 0;
    const baseChance = Number.isFinite(Number(chance.p)) ? Number(chance.p) : 0.5;
    const perStat = Number.isFinite(Number(chance.per)) ? Number(chance.per) : 0.005;
    const computed = baseChance + statValue * perStat;
    return Math.min(0.95, Math.max(0.05, Number.isFinite(computed) ? computed : baseChance));
}

function match(c = {}) {
    if (c.job && !(Array.isArray(c.job) ? c.job : [c.job]).includes(S.job)) return false;
    if (c.age && (S.phase < c.age[0] || S.phase > c.age[1])) return false;      // 육체 나이
    if (c.cage && (S.age < c.cage[0] || S.age > c.cage[1])) return false;       // 달력 나이
    if (c.notRace && c.notRace.includes(S.race.id)) return false;
    if (c.familia && (!S.familia || !c.familia.includes(S.familia.id))) return false;
    if (c.origin && !c.origin.includes(S.origin.id)) return false;
    if (c.race && !c.race.includes(S.race.id)) return false;
    if (c.hasFamilia === true && !S.familia) return false;
    if (c.hasFamilia === false && S.familia) return false;
    if (c.hasPartner === true && !GameCore.Relations.hasPartner(S)) return false;
    if (c.hasPartner === false && GameCore.Relations.hasPartner(S)) return false;
    if (c.noItem && c.noItem.some(id => (S.items || []).includes(id))) return false;     // 이미 가진 물건을 또 사지 않는다
    if (c.relative && !GameCore.Relations.hasLivingRelative(S, c.relative)) return false;
    if (c.noRelative && GameCore.Relations.hasLivingRelative(S, c.noRelative)) return false;
    if (c.flags && !c.flags.every(f => S.flags.includes(f))) return false;
    if (c.noFlags && c.noFlags.some(f => S.flags.includes(f))) return false;
    if (c.min) for (const k in c.min) if (S[k] < c.min[k]) return false;
    if (c.max) for (const k in c.max) if (S[k] > c.max[k]) return false;
    return true;
}

function say(text, cls = '', age) {
    const d = document.createElement('div');
    d.className = 'entry ' + cls;
    d.innerHTML = (age != null ? `<span class="age">${age}세</span>` : '') + text;
    $('log').appendChild(d);
    if (S && S.logHistory) S.logHistory.push({ age: age == null ? S.age : age, type: cls.includes('event') ? 'event' : (cls.includes('growth') ? 'growth' : 'note'), text: String(text).replace(/<[^>]*>/g, '') });
    d.scrollIntoView({ block: 'nearest' });
}

const hasFalna = () => S.flags.includes('falna');

// S.power는 이벤트 판정용 종합 전투력입니다. 성장 계산은 core/growth.js가 담당합니다.
function recompute() {
    // 장착 중인 무기·방어구만 전투력에 반영한다. 소모품은 사용될 때만 효과가 난다(core/items.js).
    const itemPower = GameCore.Items.equipmentPower(S);

    if (hasFalna()) {
        const abilityTotal = GameCore.Growth.getAbilityTotal(S);
        const hidden = Number.isFinite(S.hidden) ? Math.max(0, S.hidden) : 0;
        const level = Number.isFinite(S.level) ? Math.max(1, S.level) : 1;
        S.power = Math.round((abilityTotal / 5 + hidden) / 8 + (level - 1) * 20) + itemPower;
    } else {
        const potential = Number.isFinite(S.potential) ? Math.max(0, S.potential) : 0;
        S.power = Math.round(potential * 0.6) + itemPower;
    }
    if (!Number.isFinite(S.power)) S.power = 0;
}

// 레벨 표시: 팔나 전 '팔나 없음', 팔나 보유 'Lv.N', 팔나가 봉인된 뒤에는 봉인 전 레벨을 함께 표시한다.
function levelLabel() {
    if (hasFalna()) return `Lv.${S.level}`;
    if ((S.levelHistory || []).length) return `봉인(Lv.${S.level})`;
    return '팔나 없음';
}

function recordLevel(kind, from, to) {
    S.levelHistory ||= [];
    S.levelHistory.push({ age: S.age, kind, from, to });
    S.maxLevel = Math.max(S.maxLevel || 0, to);
}

function recordChildhood(age) {
    const rec = GameCore.Lineage.childhoodRecord(S, age);
    if (!rec) return;
    say(`<b>${rec.stage}</b> · ${rec.text}`, 'growth', age);
}

function renderStats() {
    const ageLabel = S.phase + 2 <= S.age ? `${S.age}<small> (체감 ${S.phase})</small>` : S.age;
    $('stats').innerHTML = [['나이', ageLabel], ['체력', Math.round(S.hp)], ['레벨', levelLabel()], ['인연', S.bond], ['발리스', S.valis]]
        .map(([n, v]) => `<div>${n}<b>${v}</b></div>`).join('');
    $('abil').innerHTML = hasFalna() ? ABIL.map(([k, n]) => `<div>${n}<b>${S.abil[k]} ${rankOf(S.abil[k])}</b></div>`).join('') : '';
    $('familia').textContent = `종족: ${GameCore.Lineage.raceLabel(S)} · 직업: ${JOB_LABELS[S.job] || S.job}${(S.aspiration && S.aspiration.kind === 'adventurer' && !hasFalna()) ? '(모험자 지망 · 팔나 전)' : ''} · 소속: ${S.familia ? S.familia.label : '없음'}${S.employer ? ' · 고용처: ' + S.employer.label : ''}`;
    const invStr = (S.items || []).map(id => GameCore.Items.label(S, id)).join(', ');
    if($('inventory')) $('inventory').textContent = invStr ? `소지품: ${invStr}` : '소지품: 없음';
    if ($('relations')) $('relations').textContent = describeRelations();
}

function describeRelations() {
    const living = GameCore.Relations.getLiving(S);
    const count = sub => living.filter(r => r.subType === sub).length;
    const parts = [];
    if (count('parent')) parts.push(`부모 ${count('parent')}${S.parentFamilia ? '(' + S.parentFamilia.label + ')' : ''}`);
    if (count('sibling')) parts.push(`형제 ${count('sibling')}`);
    if (count('child')) parts.push(`자녀 ${count('child')}`);
    const partner = GameCore.Relations.getCurrentPartner(S);
    parts.push(partner ? `연인 ${partner.age}세` : '연인 없음');
    const gone = S.relations.filter(r => r && r.alive === false).length;
    if (gone) parts.push(`떠난 이 ${gone}`);
    return `가족·관계: ${parts.join(' · ')}`;
}

function convertExp() {
    if (!hasFalna()) return false;
    const converted = GameCore.Growth.convertExcelia(S, MODS);
    // A level-up can become available from a feat-only event after the D-rank
    // threshold was already reached. Re-check even when no new Excelia converted.
    const leveled = tryLevelUp();
    return converted || leveled;
}

function tryLevelUp() {
    const level = Number.isFinite(S.level) ? Math.max(1, S.level) : 1;
    const feat = Number.isFinite(S.feat) ? Math.max(0, S.feat) : 0;
    const validStats = ABIL.map(([k]) => Number.isFinite(S.abil[k]) ? Math.max(0, S.abil[k]) : 0);
    if (level >= MAX_LEVEL || feat < level) return false;
    if (Math.max(...validStats) < LEVELUP_ABIL) return false;
    const sum = validStats.reduce((total, value) => total + value, 0);
    S.feat = Math.max(0, feat - level);
    S.level = level + 1;
    S.hidden = Math.max(0, Number.isFinite(S.hidden) ? S.hidden : 0) + sum / 5 * 0.5;
    ABIL.forEach(([k]) => { S.abil[k] = 0; });
    recordLevel('levelup', level, S.level);
    say(`위업을 인정받아 위계가 승화되었다. <b class="lv">Lv.${level} → Lv.${S.level}</b>`, 'event levelup');
    S.alias = pickAlias();
    if (S.level >= 2) say(`신회에서 이명이 정해졌다: ${S.alias.label}`, 'result');
    return true;
}

function apply(fx = {}) {
    if (!fx || typeof fx !== 'object') fx = {};
    for (const k of ['hp', 'bond', 'valis', 'feat']) {
        const delta = Number(fx[k]);
        if (Number.isFinite(delta)) S[k] = (Number.isFinite(S[k]) ? S[k] : 0) + delta;
    }
    if (Number.isFinite(Number(fx.power))) GameCore.Growth.addExperience(S, Number(fx.power));
    S.hp = Math.min(GameCore.Items.hpCap(S), Number.isFinite(S.hp) ? S.hp : 0);
    for (const k of ['bond', 'valis', 'feat', 'potential', 'excelia']) {
        S[k] = Math.max(0, Number.isFinite(S[k]) ? S[k] : 0);
    }
    (Array.isArray(fx.flags) ? fx.flags : []).forEach(f => { if (typeof f === 'string' && !S.flags.includes(f)) S.flags.push(f); });

    if (fx.relationship === 'romance') {
        const partner = GameCore.Relations.createRomanticPartner(S, 'event', relationCtx());
        if (partner) say('새로운 인연과 연인 관계가 되었다.', 'result');
    }
    if (fx.relationship === 'child') {
        const child = GameCore.Relations.createChild(S, relationCtx());
        if (child) say('새로운 가족이 생겼다.', 'result');
    }
    if (fx.relationshipEnd === 'breakup' && S.partnerId != null) {
        GameCore.Relations.endRelationship(S, S.partnerId, 'breakup');
        say('서로 다른 길을 걷기로 했다.', 'result');
    }
    if (fx.partnerDeath === true && S.partnerId != null) {
        GameCore.Relations.endRelationship(S, S.partnerId, 'deceased');
        say('소중한 사람이 세상을 떠났다.', 'result');
    }
    
    if (fx.job) setJob(fx.job);
    else if ((fx.flags || []).includes('supporter') && S.job === 'child') setJob('supporter');
    else if ((fx.flags || []).includes('soldier') && S.job !== 'soldier') setJob('soldier');
    
    if (fx.getItem) {
        const got = GameCore.Items.acquire(S, fx.getItem);
        if (got.consumedOnAcquire && got.def) say(`[${got.def.label}]을(를) 사용해 효과를 얻었다. 물건은 사라졌다.`, 'result');
        else if (got.added && got.def) say(`아이템 획득: [${GameCore.Items.label(S, fx.getItem)}]`, 'result');
    }
    if (fx.loseItem) {
        GameCore.Items.remove(S, fx.loseItem);
        say(`아이템 상실: [${fx.loseItem}]`, 'result bad');
    }
    
    if (fx.milestone) {
        const id = fx.milestone;
        if (!S.milestones.some(m => m.id === id)) {
            const ending = gachaData.endings.find(e => e.id === id);
            S.milestones.push({ id, label: ending ? ending.label : id, age: S.age });
            say(`일생의 업적을 달성했다: ${ending ? ending.label : id}`, 'result', S.age);
        }
    }
    
    if (Array.isArray(fx.clearFlags)) S.flags = S.flags.filter(f => !fx.clearFlags.includes(f));
    if (Array.isArray(fx.clearFlags) && fx.clearFlags.includes('adventurer') && S.job === 'adventurer') setJob('retired');
    if (fx.dropFamilia) { closeMembership('left'); S.familia = null; S.falnaAt = null; S.familiaAt = null; if (S.job === 'adventurer' || S.job === 'supporter') setJob('retired'); }
    if (fx.familia === 'roll') rollFamilia();   // 신의 파밀리아 전용 추첨(조직 고용은 fx.organization)
    if (fx.organization) joinOrganization(fx.organization);
    convertExp(); recompute(); renderStats();
}

// 파밀리아 소속 이력. 입단·탈퇴·변경을 항목별로 남기고, 팔나 취득은 falnaHistory 에 따로 기록한다.
function ensureHistory() { S.familiaHistory ||= []; S.falnaHistory ||= []; }
function closeMembership(reason) {
    ensureHistory();
    const open = S.familiaHistory.find(m => m.leftAt == null);
    if (open) { open.leftAt = S.age; open.leftReason = reason; }
}
function openMembership() {
    ensureHistory();
    closeMembership('changed');
    S.nextMembershipId = (S.nextMembershipId || 1);
    S.familiaHistory.push({ id: S.nextMembershipId++, familiaId: S.familia.id, label: S.familia.label, joinedAt: S.age, leftAt: null, leftReason: null,
        falnaAt: null, falnaAlreadyHeld: hasFalna(), viaParent: !!(S.parentFamilia && S.parentFamilia.id === S.familia.id) });
}

// 조직·고용처에 고용된다(팔나 없음). 파밀리아 추첨과 섞지 않으며, fx.organization 으로 명시된 이벤트 선택에서만 호출된다.
function joinOrganization(orgId) {
    const org = (gachaData.organizations || []).find(o => o.id === orgId);
    if (!org) throw new Error('unknown organization: ' + orgId);
    S.employer = { id: org.id, label: org.label, kind: org.kind, since: S.age };
    if (S.job === 'child' && JOB_ORG[org.id]) setJob(JOB_ORG[org.id]);
    say(`${org.label}에 고용되었다 — ${org.desc} (신의 파밀리아가 아니므로 팔나는 받지 않는다)`, 'result');
    apply((MODS.organizations[org.id] || {}).fx);
}

function rollFamilia(forcedId) {
    const pool = gachaData.familias.filter(f => f.id !== 'civilian').map(f => {
        const bias = (FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1;
        const parentBias = (S.parentFamilia && S.parentFamilia.id === f.id) ? PARENT_FAMILIA_BIAS : 1;   // 부모 소속 파밀리아 추천(임의 가중치)
        return { ...f, w: f.weight * bias * parentBias };
    });
    S.familia = forcedId ? pool.find(f => f.id === forcedId) : getRandomItemByWeight(pool, 'w');
    if (!S.familia) throw new Error('unknown familia: ' + forcedId);
    S.familiaAt = S.age;   // 파밀리아 입단(소속 결정) 달력 나이 — 팔나 취득(falnaAt)과 별개로 기록
    openMembership();
    // Explicit occupational Familia mappings take precedence over the broad
    // 'adv' capability flag (e.g. Hephaestus -> blacksmith, Ares -> soldier).
    const chosenJob = JOB_FAMILIA[S.familia.id] || ((MODS.familias[S.familia.id] || {}).adv ? 'adventurer' : 'merchant');
    // Familia and occupation are independent. Choose a default only for a child
    // who has not selected an occupation; joining/rejoining must not overwrite it.
    if (S.job === 'child') setJob(chosenJob);
    const m = MODS.familias[S.familia.id] || {};
    if (m.adv && !hasFalna()) setAspiration('adventurer', 'familia_join');
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    S.falnaAt = (m.adv || Math.random() < 0.3) ? Math.max(S.age, rnd(m.falna || DEFAULT_FALNA)) : null;   // 팔나 수령은 달력 나이 기준
    // 2a-role(기록만): 팔나를 받을 예정이거나 이미 보유한 소속 = member(정식 팔나 단원), 팔나가 없는 소속 = protected(보호·거주 대상).
    // 판정 로직은 바꾸지 않았다. 조직 고용은 S.employer 로만 기록되며 소속 이력에 들어가지 않는다.
    { const mem = S.familiaHistory[S.familiaHistory.length - 1]; if (mem) mem.role = (S.falnaAt != null || hasFalna()) ? 'member' : 'protected'; }
    apply(m.fx);
    checkFalna();
}

function checkFalna() {
    if (!S.familia || S.falnaAt == null || hasFalna() || S.age < S.falnaAt) return;
    const m = MODS.familias[S.familia.id] || {};
    if (!S.flags.includes('falna')) S.flags.push('falna');
    ensureHistory();
    S.falnaHistory.push({ familiaId: S.familia.id, at: S.age, membershipIndex: S.familiaHistory.length - 1 });
    if (S.aspiration && S.aspiration.kind === 'adventurer' && S.aspiration.fulfilledAt == null) { S.aspiration.fulfilledAt = S.age; const h = (S.aspirationHistory || []).filter(x => x.kind === 'adventurer').pop(); if (h) h.fulfilledAt = S.age; }
    const mem = S.familiaHistory[S.familiaHistory.length - 1]; if (mem && mem.leftAt == null) mem.falnaAt = S.age;
    // Familia membership/Falna does not itself define the member's occupation.
    // setJob() remains the only authority for the adventurer role flag.
    if (S.level < 1) { S.level = 1; recordLevel('falna', 0, 1); say(`<b class="lv">팔나 없음 → Lv.1</b>`, 'levelup', S.age); }
    else { recordLevel('falna_again', S.level, S.level); say(`<b class="lv">팔나 재취득 · Lv.${S.level}</b>`, 'levelup', S.age); }
    say(`${S.familia.label}의 신에게 팔나를 받았다. 등에 스테이터스가 새겨졌다.`, 'event', S.age);
    GameCore.Growth.carryPotential(S);     // 팔나 전 잠재력의 일부가 엑세리아로 이월된다
    convertExp(); recompute(); renderStats();
}

function startLife() {
    const origin = getRandomItemByWeight(gachaData.origins);
    const race = getRandomItemByWeight(gachaData.races);
    const talent = getRandomItemByWeight(gachaData.talents);
    S = { age: 0, chronologicalAge: 0, physicalAge: 0, phase: 0, hp: 70, power: 0,
          potential: 0, excelia: 0, feat: 0, level: 0, hidden: 0, bond: 0, valis: 0,
          abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }, flags: [], done: [], familia: null, falnaAt: null, familiaAt: null, familiaHistory: [], falnaHistory: [], aspiration: null, aspirationHistory: [], employer: null, parentFamilia: null,
          alias: null, origin, race, talent, cause: '', job: 'child',
          eventCounts: {}, lastEventPhase: {}, recentEvents: [], milestones: [], logHistory: [],
          items: [], itemUses: {}, itemsConsumed: [], relations: [], partnerId: null, nextRelationId: 1,
          application: GameCore.Recruit.newApplicationState(), nextMembershipId: 1, minorFamilias: [],
          raceSubtype: null, lineageSeed: 0, levelHistory: [], maxLevel: 0 };   // 2a: 비활성 데이터 모델(동작 연결 없음)
    $('log').innerHTML = ''; $('choices').innerHTML = '';
    switchScreen('screen-play');
    apply((MODS.origins[origin.id] || {}).fx);
    apply((MODS.races[race.id] || {}).fx);
    apply((MODS.talents[talent.id] || {}).fx);
    say(`<b>${origin.label}</b>에서 <b>${race.label}</b>으로 태어났다.<br>${origin.desc}<br>${race.desc}<br>타고난 재능: <b>${talent.label}</b> — ${talent.desc}`, 'event', 0);
    const family = GameCore.Relations.generateFamily(S, relationCtx());
    const parents = family.filter(r => r.subType === 'parent').length, elder = family.filter(r => r.subType === 'sibling').length;
    say(parents || elder ? `곁에는 ${[parents ? `부모 ${parents}명` : '', elder ? `손위 형제 ${elder}명` : ''].filter(Boolean).join('과 ')}이(가) 있었다.` : '의지할 가족 없이 홀로 태어났다.', 'result', 0);
    // 가족 생성 후의 상태로 파생 시드를 확정하고, 수인이면 하위 유형을 정한다(게임 난수열 미사용).
    S.lineageSeed = GameCore.Lineage.lifeSeed(S);
    if (S.race.id === 'beastman') {
        S.raceSubtype = GameCore.Lineage.pickBeastmanSubtype(S.lineageSeed);
        say(`수인 중에서도 <b>${S.raceSubtype.label}</b>의 특징을 지니고 태어났다.${S.raceSubtype.canon === 'unverified' ? ' <small>(비공식 게임 설정)</small>' : ''}`, 'result', 0);
    }
    recordChildhood(0);
    // 부모의 파밀리아 소속(15%, 임의 값). 부모 NPC 레코드에 소속을 기록하고, 자녀의 공식 입단은 별개 사건으로 둔다.
    const parentRecords = family.filter(r => r.subType === 'parent');
    if (parentRecords.length && Math.random() < 0.15) {
        const pool = gachaData.familias.filter(f => f.id !== 'civilian').map(f => ({ ...f, w: f.weight * ((FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1) }));
        const pf = getRandomItemByWeight(pool, 'w');
        S.parentFamilia = { id: pf.id, label: pf.label };
        parentRecords.forEach(r => { r.familia = { id: pf.id, label: pf.label }; });
        S.flags.push('parents_in_familia');
        if (NEWBORN_MEMBERSHIP) {
            say('부모가 파밀리아 소속 모험자여서, 태어나자마자 같은 파밀리아의 일원이 되었다.', 'result', 0);
            rollFamilia(pf.id);   // 대조군: 부모와 같은 파밀리아에 즉시 입단
            S.flags.push('born_in_familia');
        } else {
            say(`부모는 ${pf.label} 소속이었다. (자녀의 정식 입단은 성장한 뒤 따로 이루어진다)`, 'result', 0);
        }
    }
    nextYear();
}

// 직업별 연간 활동 엑세리아(팔나 전에는 잠재력). 수치는 events.js ANNUAL_ACTIVITY(임의 밸런스 값).
function yearlyActivity() {
    if (S.age < 6) return;
    const amount = GameCore.Growth.rollAnnualExcelia(S, ANNUAL_ACTIVITY);
    if (amount > 0) GameCore.Growth.addExperience(S, amount);
    if (hasFalna()) convertExp();
    recompute();
}

// 체력 회복 단위: 육체 나이 1년당 perYear. 달력 1년에 실제로 흐른 육체 나이(aging.rate)에 비례한다.
// (v1.7 은 달력 1년당 +1 이라 노화가 느린 엘프·고레벨이 과도하게 회복했다 — QA_AUDIT_v1.7 §3)
// HP_REGEN_MODE: 'physical'(기본) | 'calendar'(v1.7 방식, A/B 비교용) | 'off'
function recoverYearly(rate) {
    if (HP_REGEN_MODE === 'off') return;
    const step = HP_REGEN.find(r => S.phase <= r.untilPhase);
    if (!step) return;
    const scale = HP_REGEN_MODE === 'calendar' ? 1 : Math.max(0, Number(rate) || 0);
    S.hp = Math.min(GameCore.Items.hpCap(S), S.hp + step.perYear * scale);
}

// 구조 소모품 사용. 체력이 RESCUE_HP 이하일 때 1회, 그래도 0 이하면 남은 포션을 이어서 사용한다.
function tryRescue() {
    let used = false;
    for (let guard = 0; guard < 8; guard++) {
        if (used && S.hp > 0) break;
        const rescue = GameCore.Items.takeRescue(S);
        if (!rescue) break;
        S.hp = Math.min(GameCore.Items.hpCap(S), Math.max(S.hp, 0) + rescue.heal);
        say(`[${rescue.label}]을(를) 사용해 간신히 버텨 냈다.`, 'result');
        used = true;
    }
    if (used) renderStats();
    return used;
}

const RELATION_LABEL = { parent: '부모', sibling: '형제자매', child: '자녀' };
function handleRelationEvents(events) {
    (events || []).forEach(ev => {
        const r = ev.relation;
        if (ev.kind === 'birth') { say('어머니가 새 아이를 낳았다. 동생이 생겼다.', 'result', S.age); return; }
        if (ev.kind !== 'death') return;
        const isPartner = r.isPartner === true || r.type === 'partner' || r.subType === 'romance_candidate';
        const who = isPartner ? '연인' : (r.name || RELATION_LABEL[r.subType] || '가까운 이');
        const how = ev.cause === 'natural' ? '긴 생을 마치고 세상을 떠났다.' : '뜻밖의 사고와 병으로 세상을 떠났다.';
        say(`${who}이(가) ${how}`, 'result bad', S.age);
        S.flags.includes('bereaved') || S.flags.push('bereaved');
        S.bond = Math.max(0, S.bond - (isPartner ? 8 : r.subType === 'child' ? 10 : 4));
        S.hp = Math.max(1, S.hp - (isPartner || r.subType === 'child' ? 5 : 2));   // 상실감으로 체력이 줄지만 그 자체로 사망하지는 않는다
    });
}

function nextYear() {
    $('choices').innerHTML = '';
    let skipped = 0;
    while (true) {
        const aging = GameCore.Aging.advanceYear(S, MODS);
        handleRelationEvents(GameCore.Relations.advanceYear(S, MODS));
        if (S.age <= 2) recordChildhood(S.age);   // 0~2세는 사건이 없어도 성장 기록을 남긴다(난수 소비 없음)
        checkFalna();
        yearlyActivity();
        if (S.phase > 60) S.hp -= aging.rate;
        else recoverYearly(aging.rate);
        tryRescue();   // 연간 피해 직후, 사망 판정 전에 구조 포션 사용
        if (S.hp <= 0) { S.cause = '몸이 더는 버티지 못했다.'; return endLife(); }
        const naturalDeathChance = GameCore.Aging.naturalDeathChance(S.phase, aging.rate);
        if (S.phase > 65 && Math.random() < naturalDeathChance) { S.cause = '긴 생을 마치고 조용히 눈을 감았다.'; return endLife(); }
        const pool = EVENTS.filter(e => {
            const count = S.eventCounts[e.id] || 0;
            const last = S.lastEventPhase[e.id];
            if (e.once && S.done.includes(e.id)) return false;
            if (!e.once && count >= (e.maxTimes || 2)) return false;
            if (last != null && S.phase - last < (e.cool || 2)) return false;
            return match(e.cond);
        }).map(e => ({ ...e, w: e.w * (S.recentEvents.slice(-4).includes(e.id) ? 0.12 : 1) }));
        const e = getRandomItemByWeight([...pool, { w: 5, none: true }], 'w');
        if (!e.none) {
            renderStats();
            if (skipped) say(`평온하게 ${skipped}년이 흘렀다.`, 'result');
            return showEvent(e);
        }
        if (S.age > 2) skipped++;   // 0~2세는 성장 기록이 이미 남았으므로 '평온하게 N년' 집계에서 뺀다
    }
}

function showEvent(e) {
    say(e.text, 'event', S.age);
    if (e.once) S.done.push(e.id);
    S.eventCounts[e.id] = (S.eventCounts[e.id] || 0) + 1;
    S.lastEventPhase[e.id] = S.phase;
    S.recentEvents.push(e.id);
    if (S.recentEvents.length > 8) S.recentEvents.shift();
    e.choices.forEach(ch => {
        const b = document.createElement('button');
        b.className = 'choice'; b.textContent = ch.label;
        b.onclick = () => choose(ch);
        $('choices').appendChild(b);
    });
    if ($('auto').checked) setTimeout(() => {
        const bs = $('choices').querySelectorAll('button');
        if (bs.length) bs[Math.floor(Math.random() * bs.length)].click();
    }, 800);
}

function choose(ch) {
    $('choices').innerHTML = '';
    let r = ch;
    if (ch.chance) {
        const c = ch.chance;
        let p = getChoiceProbability(c);
        if (c.stat === 'power') {
            const boost = GameCore.Items.takePowerBoost(S, p);
            if (boost) {
                p = getChoiceProbability(c, boost.bonus);
                say(`[${boost.label}]을(를) 사용했다.` + (boost.remaining > 0 ? ` (남은 횟수 ${boost.remaining})` : ' 더는 쓸 수 없게 되었다.'), 'result');
            }
        }
        r = Math.random() < p ? c.ok : c.fail;
    }
    const bad = r.fx && (r.fx.die || r.fx.hp < -30);
    say(r.text, 'result' + (bad ? ' bad' : ''));
    apply(r.fx);
    if (!(r.fx && r.fx.die)) tryRescue();
    
    if (r.fx && r.fx.die) {
        if (typeof r.fx.die === 'string') {
            const ending = gachaData.endings.find(e => e.id === r.fx.die);
            S.cause = ending ? ending.label : r.text;
        } else {
            S.cause = r.text;
        }
        return endLife();
    }
    
    if (S.hp <= 0) { 
        S.cause = (r.fx && r.fx.hp <= -20) ? r.text + ' 끝내 상처를 이겨 내지 못했다.' : '쌓인 피로와 세월 탓에 몸이 끝내 버티지 못했다.'; 
        return endLife(); 
    }
    
    const b = document.createElement('button');
    b.textContent = '다음 해로'; b.onclick = nextYear;
    $('choices').appendChild(b);
    if ($('auto').checked) setTimeout(() => b.isConnected && b.click(), 600);
}

function pickAlias() {
    const get = id => gachaData.aliases.find(a => a.id === id);
    if (S.level >= 7) return get('king');
    if (S.level >= 5) return get('braver');
    if (S.level >= 3) return get('chuuni');
    if (S.level >= 2) return get('rookie');
    return get('none');
}

function endLife() {
    $('choices').innerHTML = '';
    // 규칙: 사망 시 체력은 0 으로 고정한다(음수 체력 상태를 결과에 남기지 않는다).
    S.hp = Math.max(0, Number.isFinite(S.hp) ? S.hp : 0);
    const alias = S.alias || pickAlias();
    const notes = [];
    if (S.flags.includes('liaris')) notes.push('동경이 꺾이지 않는 한 성장을 멈추지 않았던 사람.');
    if (S.flags.includes('xenos_friend')) notes.push('몬스터와 비밀스러운 유대를 맺었던 사람.');
    if (S.flags.includes('scholar')) notes.push('신성문자를 읽어 낼 줄 알았던 학자.');
    if (S.flags.includes('fisher')) notes.push('말년을 메렌의 바닷가에서 보냈다.');
    if (GameCore.Relations.hasPartner(S)) notes.push('성인인 연인과 서로의 삶을 함께했다.');
    const lost = S.relations.filter(r => r && r.alive === false);
    if (lost.length) notes.push(`살아오며 ${lost.length}명의 가까운 이를 떠나보냈다.`);
    const kids = S.relations.filter(r => r && r.subType === 'child').length;
    if (kids) notes.push(`자녀 ${kids}명을 두었다.`);
    const milestones = S.milestones.length ? S.milestones.map(m => `- ${m.age}세: ${m.label}`).join('\n') : '없음';
    const timeline = S.logHistory.filter(x => x.type === 'event' || x.type === 'job').slice(-18).map(x => `${x.age}세: ${x.text}`).join('\n');
    const abilitySummary = S.level >= 1
        ? ABIL.map(([k, label]) => `${label} ${S.abil[k]}(${rankOf(S.abil[k])})`).join(' · ')
        : '';
    const lines = [
        `이명: ${alias.label}`,
        `- ${alias.desc}`,
        '',
        `${S.origin.label} 출신 ${GameCore.Lineage.raceLabel(S)}`,
        `소속: ${S.familia ? S.familia.label : '없음'}${S.employer ? ' (고용처: ' + S.employer.label + ')' : ''}`,
        `직업: ${JOB_LABELS[S.job] || S.job}`,
        `재능: ${S.talent.label}`,
        ''
    ];
    lines.push(`최고 레벨: ${(S.maxLevel || 0) >= 1 ? 'Lv.' + S.maxLevel : '팔나 없음'}${(S.maxLevel || 0) >= 1 && !hasFalna() ? ' (생애 말 팔나 봉인)' : ''}`);
    if ((S.levelHistory || []).length) lines.push('레벨 이력: ' + S.levelHistory.map(h => h.kind === 'falna' ? `${h.age}세 팔나 취득(Lv.1)` : h.kind === 'falna_again' ? `${h.age}세 팔나 재취득(Lv.${h.to})` : `${h.age}세 Lv.${h.from}→Lv.${h.to}`).join(' · '));
    if (S.level >= 1) lines.push(abilitySummary);
    lines.push('');
    lines.push(`향년 ${S.age}세${S.phase + 2 <= S.age ? ` (체감 ${S.phase}세)` : ''} — ${S.cause}`, `인연 ${S.bond} · 발리스 ${S.valis}`, '');
    lines.push(`소지품: ${S.items && S.items.length ? S.items.map(id => GameCore.Items.label(S, id)).join(', ') : '없음'}`, '', '일생의 업적', milestones);
    if (timeline) lines.push('', '주요 연표', timeline);
    if (S.raceSubtype && S.raceSubtype.canon === 'unverified') notes.push(`※ 수인 하위 유형 '${S.raceSubtype.label}'은 원작 근거가 확인되지 않은 비공식 게임 설정입니다.`);
    if (notes.length) lines.push('', ...notes);
    $('result-content').innerText = lines.join('\n');
    switchScreen('screen-result');
    window.scrollTo(0, 0);
}

$('btn-start').addEventListener('click', () => {
    switchScreen('screen-loading');
    setTimeout(startLife, 1500);
});
$('btn-retry').addEventListener('click', () => switchScreen('screen-start'));
