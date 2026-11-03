// 의존: data.js (gachaData), events.js (MODS, FAMILIA_BIAS, DEFAULT_FALNA, MAX_LEVEL, EVENTS)
const $ = id => document.getElementById(id);
const ABIL = [['str', '힘'], ['vit', '내구'], ['dex', '기교'], ['agi', '민첩'], ['mag', '마력']];
const RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];
const rankOf = v => v >= 1200 ? 'SSS' : v >= 1000 ? 'SS' : RANKS[Math.min(9, Math.floor(v / 100))];
const rnd = (arr) => arr[0] + Math.floor(Math.random() * (arr[1] - arr[0] + 1));
const EXP_TO_ABIL = 50;
const ABIL_CAP_BREAK = 1499;
const LEVELUP_ABIL = 500;

let S;
const JOB_LABELS = { child:'유년기', adventurer:'모험자', supporter:'서포터', guild_staff:'길드 직원', blacksmith:'대장장이', merchant:'상인', farmer:'농부', healer:'치유사', soldier:'병사', waitstaff:'종업원', retired:'은퇴자' };
const REL_LABELS = { parent:'부모', sibling:'형제자매', friend:'친구', rival:'라이벌', mentor:'스승', student:'제자', party:'파티원', lover:'연인', spouse:'배우자', child:'자녀' };
const NAMES = ['루크', '아리아', '가레스', '리리', '벨', '레피야', '아이즈', '티오나', '베이트', '핀', '리베리아', '미아', '클로에', '시르', '류', '아냐', '레나', '오탈', '헤딘', '회그니', '아렌'];

const JOB_ECON = {
    child: { income: [0, 0], cost: 20 },
    adventurer: { income: [500, 3000], cost: 2000 },
    supporter: { income: [300, 1000], cost: 600 },
    guild_staff: { income: [1000, 1200], cost: 800 },
    blacksmith: { income: [1200, 2500], cost: 1000 },
    merchant: { income: [800, 4000], cost: 1200 },
    farmer: { income: [300, 800], cost: 300 },
    healer: { income: [800, 1800], cost: 600 },
    soldier: { income: [900, 1100], cost: 500 },
    waitstaff: { income: [500, 1000], cost: 500 },
    retired: { income: [100, 400], cost: 300 }
};

function getRandomName() { return NAMES[Math.floor(Math.random() * NAMES.length)]; }

function setJob(job) {
    const previous = S.job;
    S.job = job;
    S.flags = S.flags.filter(f => !['adventurer','supporter','crafter','soldier'].includes(f));
    if (job === 'adventurer') S.flags.push('adventurer');
    if (job === 'supporter') S.flags.push('supporter');
    if (job === 'blacksmith') S.flags.push('crafter');
    if (job === 'soldier') S.flags.push('soldier');
    if (previous !== job && S.logHistory) {
        say(`직업이 ${JOB_LABELS[job] || job}(으)로 바뀌었다.`, 'event', S.age);
    }
}

function getRandomItemByWeight(items, key = 'weight') {
    const total = items.reduce((s, i) => s + i[key], 0);
    let r = Math.random() * total;
    for (const i of items) { if (r < i[key]) return i; r -= i[key]; }
    return items[items.length - 1];
}

function switchScreen(id) {
    if(!document.getElementById(id)) return;
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    $(id).classList.remove('hidden'); $(id).classList.add('active');
}

function match(c = {}) {
    if (c.job && !(Array.isArray(c.job) ? c.job : [c.job]).includes(S.job)) return false;
    if (c.age && (S.phase < c.age[0] || S.phase > c.age[1])) return false;
    if (c.notRace && c.notRace.includes(S.race.id)) return false;
    if (c.familia && (!S.familia || !c.familia.includes(S.familia.id))) return false;
    if (c.origin && !c.origin.includes(S.origin.id)) return false;
    if (c.race && !c.race.includes(S.race.id)) return false;
    if (c.hasFamilia === true && !S.familia) return false;
    if (c.hasFamilia === false && S.familia) return false;
    if (c.flags && !c.flags.every(f => S.flags.includes(f))) return false;
    if (c.noFlags && c.noFlags.some(f => S.flags.includes(f))) return false;
    if (c.min) for (const k in c.min) if (S[k] < c.min[k]) return false;
    if (c.max) for (const k in c.max) if (S[k] > c.max[k]) return false;
    return true;
}

function say(text, cls = '', age) {
    if(!$('log')) return;
    const d = document.createElement('div');
    d.className = 'entry ' + cls;
    d.innerHTML = (age != null ? `<span class="age">${age}세</span>` : '') + text;
    $('log').appendChild(d);
    if (S && S.logHistory) S.logHistory.push({ age: age == null ? S.age : age, type: cls.includes('event') ? 'event' : 'note', text: String(text).replace(/<[^>]*>/g, '') });
    d.scrollIntoView({ block: 'nearest' });
}

const hasFalna = () => S.flags.includes('falna');

function recompute() {
    let itemPower = 0;
    let itemHpMax = 0;
    
    S.inventory.forEach(inv => {
        if (inv.equipped) {
            const it = gachaData.items.find(i => i.id === inv.id);
            if (it && it.fx) {
                if (it.fx.power) itemPower += it.fx.power;
                if (it.fx.hpMax) itemHpMax += it.fx.hpMax;
            }
        }
    });

    S.maxHp = 100 + itemHpMax;
    S.hp = Math.min(S.maxHp, Math.max(0, S.hp));

    if (hasFalna()) {
        const sum = ABIL.reduce((s, [k]) => s + S.abil[k], 0);
        S.power = Math.round((sum / 5 + S.hidden) / 8 + (S.level - 1) * 20) + itemPower;
    } else {
        S.power = Math.round(S.exp * 0.6) + itemPower;
    }
}

window.toggleEquip = function(idx) {
    if (!S || !S.inventory[idx]) return;
    const inv = S.inventory[idx];
    inv.equipped = !inv.equipped;
    say(`[장비] ${inv.equipped ? '장착' : '해제'}했습니다.`, 'note');
    recompute();
    renderStats();
};

window.useItem = function(idx) {
    if (!S || !S.inventory[idx]) return;
    const inv = S.inventory[idx];
    const it = gachaData.items.find(i => i.id === inv.id);
    if (it && it.fx) {
        apply(it.fx);
        say(`[아이템] ${it.label}을(를) 사용했습니다!`, 'note');
    }
    inv.uses = (inv.uses || 0) + 1;
    if (inv.uses >= (it.maxUses || 1)) {
        inv.count--;
        inv.uses = 0;
        if (inv.count <= 0) S.inventory.splice(idx, 1);
    }
    recompute();
    renderStats();
};

function renderStats() {
    if(!$('stats')) return;
    $('stats').innerHTML = [['나이', S.age], ['체력', Math.round(S.hp) + '/' + S.maxHp], ['레벨', hasFalna() ? S.level : '-'], ['발리스', S.valis]]
        .map(([n, v]) => `<div>${n}<b>${v}</b></div>`).join('');
    $('abil').innerHTML = hasFalna() ? ABIL.map(([k, n]) => `<div>${n}<b>${S.abil[k]} ${rankOf(S.abil[k])}</b></div>`).join('') : '';
    $('familia').textContent = `직업: ${JOB_LABELS[S.job] || S.job} · 소속: ${S.familia ? S.familia.label : '없음'}`;
    
    let invHtml = '';
    S.inventory.forEach((inv, idx) => {
        const it = gachaData.items.find(i => i.id === inv.id);
        if (!it) return;
        const isEq = it.type === 'weapon' || it.type === 'armor';
        const isCon = it.type === 'consumable';
        const btn = isEq ? `<button class="inv-btn" onclick="window.toggleEquip(${idx})">${inv.equipped ? '해제' : '장착'}</button>` 
                         : (isCon ? `<button class="inv-btn" onclick="window.useItem(${idx})">사용</button>` : '');
        invHtml += `<span class="inv-item" style="${inv.equipped ? 'color:#e5a822;font-weight:bold;' : ''}">${it.label} ${inv.count > 1 ? 'x'+inv.count : ''} ${btn}</span> `;
    });
    $('inventory').innerHTML = invHtml ? `가방: ${invHtml}` : '가방: 비어있음';
    
    let relHtml = S.relations.filter(r => r.alive).map(r => `${REL_LABELS[r.type]||r.type} ${r.name}(${Math.floor(r.intimacy)})`).join(', ');
    $('relations').innerHTML = relHtml ? `관계: ${relHtml}` : '관계: 없음';
}

function convertExp() {
    if (!hasFalna() || S.exp <= 0) return;
    const w = ABIL.map(([k]) => (((MODS.races[S.race.id] || {}).bias || {})[k] || 1) * (((MODS.talents[S.talent.id] || {}).bias || {})[k] || 1));
    const tot = w.reduce((a, b) => a + b, 0);
    const gain = S.exp * EXP_TO_ABIL * (S.flags.includes('liaris') ? 1.5 : 1);
    const cap = S.flags.includes('liaris') ? ABIL_CAP_BREAK : 999;
    ABIL.forEach(([k], i) => { S.abil[k] = Math.min(cap, Math.round(S.abil[k] + gain * w[i] / tot * (1 - S.abil[k] / (cap + 300)))); });
    S.exp = 0;
    tryLevelUp();
}

function tryLevelUp() {
    if (S.level >= MAX_LEVEL || S.feat < S.level) return;
    if (Math.max(...ABIL.map(([k]) => S.abil[k])) < LEVELUP_ABIL) return;
    const sum = ABIL.reduce((s, [k]) => s + S.abil[k], 0);
    S.feat -= S.level; S.level++; S.hidden += sum / 5 * 0.5;
    ABIL.forEach(([k]) => { S.abil[k] = 0; });
    say(`위업을 인정받아 위계가 승화되었다. 이제 Lv.${S.level}.`, 'event');
    S.alias = pickAlias();
    if (S.level >= 2) say(`신회에서 이명이 정해졌다: ${S.alias.label}`, 'result');
}

function apply(fx = {}) {
    for (const k of ['hp', 'bond', 'valis']) if (fx[k] !== undefined) S[k] += fx[k];
    if (fx.power) S.exp += fx.power;
    if (fx.feat) S.feat += fx.feat;
    
    (fx.flags || []).forEach(f => { if (!S.flags.includes(f)) S.flags.push(f); });
    
    if (fx.job) setJob(fx.job);
    else if ((fx.flags || []).includes('supporter') && S.job === 'child') setJob('supporter');
    else if ((fx.flags || []).includes('soldier') && S.job !== 'soldier') setJob('soldier');
    
    if (fx.getItem) {
        const exist = S.inventory.find(i => i.id === fx.getItem);
        if (exist) {
            exist.count++;
        } else {
            S.inventory.push({ id: fx.getItem, count: 1, equipped: false, uses: 0 });
        }
        const item = gachaData.items.find(i => i.id === fx.getItem);
        say(`아이템 획득: [${item ? item.label : fx.getItem}]`, 'result');
    }
    if (fx.loseItem) {
        const idx = S.inventory.findIndex(i => i.id === fx.loseItem);
        if (idx !== -1) {
            S.inventory[idx].count--;
            say(`아이템 상실: [${fx.loseItem}]`, 'result bad');
            if (S.inventory[idx].count <= 0) S.inventory.splice(idx, 1);
        }
    }
    
    if (fx.milestone) {
        const id = fx.milestone;
        if (!S.milestones.some(m => m.id === id)) {
            const ending = gachaData.endings.find(e => e.id === id);
            S.milestones.push({ id, label: ending ? ending.label : id, age: S.age });
            say(`일생의 업적을 달성했다: ${ending ? ending.label : id}`, 'result', S.age);
        }
    }
    
    if (fx.clearFlags) S.flags = S.flags.filter(f => !fx.clearFlags.includes(f));
    if (fx.clearFlags && fx.clearFlags.includes('adventurer') && S.job === 'adventurer') setJob('retired');
    if (fx.dropFamilia) { S.familia = null; S.falnaAt = null; if (S.job === 'adventurer' || S.job === 'supporter') setJob('retired'); }
    if (fx.familia === 'roll') rollFamilia();
    
    S.hp = Math.max(0, S.hp);
    for (const k of ['bond', 'valis', 'exp', 'feat']) S[k] = Math.max(0, S[k]);
    
    convertExp(); 
    recompute(); 
}

function rollFamilia() {
    const pool = gachaData.familias.filter(f => f.id !== 'civilian').map(f => {
        const bias = (FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1;
        return { ...f, w: f.weight * bias };
    });
    S.familia = getRandomItemByWeight(pool, 'w');
    const m = MODS.familias[S.familia.id] || {};
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    S.falnaAt = (m.adv || Math.random() < 0.3) ? Math.max(S.phase, rnd(m.falna || DEFAULT_FALNA)) : null;
    apply(m.fx);
    checkFalna();
}

function checkFalna() {
    if (!S.familia || S.falnaAt == null || hasFalna() || S.phase < S.falnaAt) return;
    S.flags.push('falna'); 
    if (S.level < 1) S.level = 1;
    say(`${S.familia.label}의 주신에게 팔나를 받았다. 등에 스테이터스가 새겨졌다.`, 'event', S.age);
    convertExp(); recompute(); 
}

function addNewRelation(type) {
    const types = type ? [type] : ['friend', 'rival', 'mentor', 'lover'];
    const t = types[Math.floor(Math.random() * types.length)];
    const rel = {
        id: 'rel_' + Date.now() + Math.floor(Math.random()*1000),
        name: getRandomName(),
        type: t,
        age: S.age + rnd([-5, 5]),
        intimacy: 10 + rnd([0, 10]),
        alive: true
    };
    S.relations.push(rel);
    say(`[인연] 새로운 ${REL_LABELS[t] || t} '${rel.name}'(을)를 만났다.`, 'note');
}

function startLife() {
    const origin = getRandomItemByWeight(gachaData.origins);
    const race = getRandomItemByWeight(gachaData.races);
    const talent = getRandomItemByWeight(gachaData.talents);
    S = { age: 0, phase: 0, hp: 70, maxHp: 100, power: 0, exp: 0, feat: 0, level: 0, hidden: 0, bond: 0, valis: 0,
          abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }, flags: [], done: [], familia: null, falnaAt: null,
          alias: null, origin, race, talent, cause: '', job: 'child',
          eventCounts: {}, lastEventPhase: {}, recentEvents: [], milestones: [], logHistory: [], inventory: [], relations: [] };
    
    if($('log')) $('log').innerHTML = ''; 
    if($('choices')) $('choices').innerHTML = '';
    
    switchScreen('screen-play');
    apply((MODS.origins[origin.id] || {}).fx);
    apply((MODS.races[race.id] || {}).fx);
    apply((MODS.talents[talent.id] || {}).fx);
    
    addNewRelation('parent');
    if (Math.random() < 0.5) addNewRelation('sibling');

    say(`<b>${origin.label}</b>에서 <b>${race.label}</b>으로 태어났다.<br>${origin.desc}<br>${race.desc}<br>타고난 재능: <b>${talent.label}</b> — ${talent.desc}`, 'event', 0);
    if (Math.random() < 0.15) {
        say('부모가 파밀리아 소속이어서, 태어나자마자 같은 파밀리아의 일원이 되었다.', 'result', 0);
        rollFamilia();
        S.flags.push('born_in_familia');
    }
    
    nextYear();
}

function nextYear() {
    if($('choices')) $('choices').innerHTML = '';
    if (S.hp <= 0 || S.cause) return endLife();
    
    S.age++;
    const rate = (MODS.races[S.race.id] || {}).rate || 1;
    S.phase = S.age <= 20 ? S.age : Math.floor(20 + (S.age - 20) / rate);
    
    checkFalna();
    
    let incRange = (JOB_ECON[S.job] || JOB_ECON['child']).income;
    let cost = (JOB_ECON[S.job] || JOB_ECON['child']).cost;
    let income = rnd(incRange);
    
    if (S.job === 'adventurer') income += (S.level * 800) + (S.power * 10);
    else if (S.job === 'merchant') income += (S.power * 20);
    else if (S.job === 'blacksmith') income += (S.power * 15);
    
    if (S.phase < 13) { income = Math.floor(income * 0.2); cost = Math.floor(cost * 0.3); } 
    else if (S.phase < 20) { income = Math.floor(income * 0.7); cost = Math.floor(cost * 0.8); } 
    
    cost += Math.floor(S.age * 2); 
    
    S.valis += income;
    S.valis -= cost;
    
    let econMsg = `[경제] 한 해 동안 ${income}발리스를 벌고, 생활비로 ${cost}발리스를 지출했다.`;
    if (S.valis < 0) {
        S.valis = 0;
        S.hp -= 15;
        econMsg += ` 자금이 부족해 굶주렸고 체력이 떨어졌다.`;
    } else {
        S.hp += 5; 
    }
    if (S.age > 12) say(econMsg, 'note', S.age);
    
    S.relations.forEach(r => {
        if (r.alive) {
            r.age++;
            if (r.age > 65 && Math.random() < 0.03 + ((r.age-65)*0.01)) {
                r.alive = false;
                say(`[부고] ${REL_LABELS[r.type]||r.type} ${r.name}이(가) 세상을 떠났다...`, 'bad');
                S.hp -= 10;
            }
        }
    });

    if (S.phase > 60) S.hp -= Math.floor((S.phase - 60) / 2); 
    recompute();

    if (S.hp <= 0) {
        S.cause = '건강 악화와 누적된 피로로 쓰러졌다.';
        return endLife();
    }
    if (S.phase > 65 && Math.random() < (S.phase - 65) * 0.04) {
        S.cause = '긴 생을 마치고 조용히 눈을 감았다.';
        return endLife();
    }
    
    showAnnualActivity();
}

function showAnnualActivity() {
    renderStats();
    say(`--- ${S.age}세. 올해는 어떤 활동에 집중할까? ---`, 'note');
    if(!$('choices')) {
        const acts = ['train', 'work', 'rest', 'social'];
        return doActivity(acts[Math.floor(Math.random()*acts.length)]);
    }
    
    const activities = [
        { label: '전투 및 기술 훈련', type: 'train' },
        { label: '직업 활동 (돈 벌기)', type: 'work' },
        { label: '휴식과 건강 관리', type: 'rest' },
        { label: '인간관계 형성', type: 'social' }
    ];
    
    activities.forEach(act => {
        const b = document.createElement('button');
        b.className = 'choice activity-btn'; 
        b.textContent = act.label;
        b.onclick = () => doActivity(act.type);
        $('choices').appendChild(b);
    });

    if ($('auto').checked) setTimeout(() => {
        const bs = $('choices').querySelectorAll('button.activity-btn');
        if (bs.length) bs[Math.floor(Math.random() * bs.length)].click();
    }, 400);
}

function doActivity(type) {
    if($('choices')) $('choices').innerHTML = '';
    let msg = '';
    if (type === 'train') {
        msg = '피나는 훈련을 통해 성장을 이뤘다.';
        S.exp += 15 + (hasFalna() ? 10 : 0);
        S.hp -= 10;
    } else if (type === 'work') {
        msg = '일에 매진하여 추가 수입을 얻었다.';
        S.valis += rnd([200, 1500]);
        S.hp -= 5;
    } else if (type === 'rest') {
        msg = '충분한 휴식을 취하며 심신을 달랬다.';
        S.hp += 25;
        S.valis -= 100;
    } else if (type === 'social') {
        msg = '주변 사람들과 교류하며 인연을 쌓았다.';
        S.bond += 5;
        S.valis -= 200;
        
        const aliveRels = S.relations.filter(r => r.alive);
        if (aliveRels.length > 0) {
            const rel = aliveRels[Math.floor(Math.random() * aliveRels.length)];
            rel.intimacy += 5;
            msg += ` (${rel.name}와의 친밀도 상승)`;
        }
        if (Math.random() < 0.25) addNewRelation();
    }
    
    say(msg, 'result');
    recompute();
    
    if (S.hp <= 0) {
        S.cause = '무리한 활동으로 쓰러졌다.';
        return endLife();
    }
    
    triggerRandomEvent();
}

function triggerRandomEvent() {
    const pool = EVENTS.filter(e => {
        const count = S.eventCounts[e.id] || 0;
        const last = S.lastEventPhase[e.id];
        if (e.once && S.done.includes(e.id)) return false;
        if (!e.once && count >= (e.maxTimes || 2)) return false;
        if (last != null && S.phase - last < (e.cool || 2)) return false;
        return match(e.cond);
    }).map(e => ({ ...e, w: e.w * (S.recentEvents.slice(-4).includes(e.id) ? 0.12 : 1) }));
    
    const e = getRandomItemByWeight([...pool, { w: 40, none: true }], 'w');
    
    if (!e.none) {
        showEvent(e);
    } else {
        say('특별한 사건 없이 무탈하게 한 해가 저물었다.', 'note');
        finishYear();
    }
}

function showEvent(e) {
    say(e.text, 'event', S.age);
    if (e.once) S.done.push(e.id);
    S.eventCounts[e.id] = (S.eventCounts[e.id] || 0) + 1;
    S.lastEventPhase[e.id] = S.phase;
    S.recentEvents.push(e.id);
    if (S.recentEvents.length > 8) S.recentEvents.shift();
    
    if(!$('choices')) {
        return choose(e.choices[Math.floor(Math.random()*e.choices.length)]);
    }

    e.choices.forEach(ch => {
        const b = document.createElement('button');
        b.className = 'choice'; b.textContent = ch.label;
        b.onclick = () => choose(ch);
        $('choices').appendChild(b);
    });
    if ($('auto').checked) setTimeout(() => {
        const bs = $('choices').querySelectorAll('button.choice');
        if (bs.length) bs[Math.floor(Math.random() * bs.length)].click();
    }, 800);
}

function choose(ch) {
    if($('choices')) $('choices').innerHTML = '';
    let r = ch;
    if (ch.chance) {
        const c = ch.chance;
        const statVal = c.stat ? (ABIL.find(([k]) => k === c.stat) ? S.abil[c.stat] : S[c.stat]) : 0;
        const p = Math.min(.95, Math.max(.05, c.p + (statVal * (c.per || .005))));
        r = Math.random() < p ? c.ok : c.fail;
    }
    const bad = r.fx && (r.fx.die || r.fx.hp < -30);
    say(r.text, 'result' + (bad ? ' bad' : ''));
    apply(r.fx);
    
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
        S.cause = (r.fx && r.fx.hp <= -20) ? r.text + ' 끝내 상처를 이겨 내지 못했다.' : '누적된 피해로 몸이 끝내 버티지 못했다.'; 
        return endLife(); 
    }
    
    finishYear();
}

function finishYear() {
    if(!$('choices')) return nextYear();
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
    if($('choices')) $('choices').innerHTML = '';
    const alias = S.alias || pickAlias();
    const notes = [];
    if (S.flags.includes('liaris')) notes.push('동경이 꺾이지 않는 한 성장을 멈추지 않았던 사람.');
    if (S.flags.includes('xenos_friend')) notes.push('몬스터와 비밀스러운 유대를 맺었던 사람.');
    if (S.flags.includes('scholar')) notes.push('신성문자를 읽어 낼 줄 알았던 학자.');
    if (S.flags.includes('fisher')) notes.push('말년을 메렌의 바닷가에서 보냈다.');
    if (S.flags.includes('partner')) notes.push('곁에 함께한 사람이 있었다.');
    
    const milestones = S.milestones.length ? S.milestones.map(m => `- ${m.age}세: ${m.label}`).join('\n') : '없음';
    const timeline = S.logHistory.filter(x => x.type === 'event' || x.type === 'job').slice(-18).map(x => `${x.age}세: ${x.text}`).join('\n');
    const abil = S.level >= 1 ? '\n' + ABIL.map(([k, n]) => `${n} ${S.abil[k]}(${rankOf(S.abil[k])})`).join(' · ') : '';
    
    const content = `이명: ${alias.label}\n- ${alias.desc}\n\n` +
        `${S.origin.label} 출신 ${S.race.label}\n소속: ${S.familia ? S.familia.label : '없음'}\n직업: ${JOB_LABELS[S.job] || S.job}\n재능: ${S.talent.label}\n\n` +
        `${S.level >= 1 ? '도달 레벨: Lv.' + S.level + abil + '\n' : ''}향년 ${S.age}세 — ${S.cause}\n인연 ${S.bond} · 발리스 ${S.valis}` +
        `\n\n소지품: ${S.inventory && S.inventory.length ? S.inventory.map(inv => { const it = gachaData.items.find(i=>i.id===inv.id); return it ? it.label + (inv.equipped ? '[장착]' : '') : inv.id; }).join(', ') : '없음'}` +
        `\n\n관계: ${S.relations.filter(r=>r.alive).map(r=>`${REL_LABELS[r.type]||r.type} ${r.name}`).join(', ') || '없음'}` +
        `\n\n일생의 업적\n${milestones}` +
        (timeline ? `\n\n주요 연표\n${timeline}` : '') +
        (notes.length ? '\n\n' + notes.join('\n') : '');

    if($('result-content')) {
        $('result-content').innerText = content;
        switchScreen('screen-result');
        window.scrollTo(0, 0);
    }
}

if($('btn-start')) $('btn-start').addEventListener('click', () => { switchScreen('screen-loading'); setTimeout(startLife, 1500); });
if($('btn-retry')) $('btn-retry').addEventListener('click', () => switchScreen('screen-start'));
