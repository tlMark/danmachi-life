// 의존: data.js (gachaData), events.js (MODS, FAMILIA_BIAS, DEFAULT_FALNA, MAX_LEVEL, EVENTS)
const $ = id => document.getElementById(id);
const ABIL = [['str', '힘'], ['vit', '내구'], ['dex', '기교'], ['agi', '민첩'], ['mag', '마력']];
const RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];   // 100 단위
const rankOf = v => v >= 1200 ? 'SSS' : v >= 1000 ? 'SS' : RANKS[Math.min(9, Math.floor(v / 100))];   // 1000~1199 SS, 1200~ SSS
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const LEVELUP_ABIL = 500;    // 레벨업 조건: 능력치 하나가 D(500) 이상
let S;
const JOB_LABELS = { child:'유년기', adventurer:'모험자', supporter:'서포터', guild_staff:'길드 직원', blacksmith:'대장장이', merchant:'상인', farmer:'농부', healer:'치유사', soldier:'병사', waitstaff:'종업원', retired:'은퇴자' };
const JOB_FAMILIA = { guild:'guild_staff', hephaestus:'blacksmith', hostess:'waitstaff', demeter:'farmer', miach:'healer', ares:'soldier', kali:'soldier' };
function setJob(job) {
    const previous = S.job;
    S.job = job;
    S.flags = S.flags.filter(f => !['adventurer','supporter','crafter','soldier'].includes(f));
    if (job === 'adventurer') S.flags.push('adventurer');
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

function getChoiceProbability(chance = {}) {
    const rawStat = chance.stat
        ? (ABIL.find(([key]) => key === chance.stat) ? S.abil[chance.stat] : S[chance.stat])
        : 0;
    const statValue = Number.isFinite(Number(rawStat)) ? Number(rawStat) : 0;
    const baseChance = Number.isFinite(Number(chance.p)) ? Number(chance.p) : 0.5;
    const perStat = Number.isFinite(Number(chance.per)) ? Number(chance.per) : 0.005;
    const computed = baseChance + statValue * perStat;
    return Math.min(0.95, Math.max(0.05, Number.isFinite(computed) ? computed : baseChance));
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
    if (c.hasPartner === true && !GameCore.Relations.hasPartner(S)) return false;
    if (c.hasPartner === false && GameCore.Relations.hasPartner(S)) return false;
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
    if (S && S.logHistory) S.logHistory.push({ age: age == null ? S.age : age, type: cls.includes('event') ? 'event' : 'note', text: String(text).replace(/<[^>]*>/g, '') });
    d.scrollIntoView({ block: 'nearest' });
}

const hasFalna = () => S.flags.includes('falna');

// S.power는 이벤트 판정용 종합 전투력입니다. 성장 계산은 core/growth.js가 담당합니다.
function recompute() {
    let itemPower = 0;
    if (Array.isArray(S.items)) {
        S.items.forEach(id => {
            const it = gachaData.items.find(i => i.id === id);
            const bonus = it && it.fx ? Number(it.fx.power) : 0;
            if (Number.isFinite(bonus)) itemPower += bonus;
        });
    }

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

function renderStats() {
    $('stats').innerHTML = [['나이', S.age], ['체력', Math.round(S.hp)], ['레벨', hasFalna() ? S.level : '-'], ['인연', S.bond], ['발리스', S.valis]]
        .map(([n, v]) => `<div>${n}<b>${v}</b></div>`).join('');
    $('abil').innerHTML = hasFalna() ? ABIL.map(([k, n]) => `<div>${n}<b>${S.abil[k]} ${rankOf(S.abil[k])}</b></div>`).join('') : '';
    $('familia').textContent = `직업: ${JOB_LABELS[S.job] || S.job} · 소속: ${S.familia ? S.familia.label : '없음'}`;
    const invStr = (S.items || []).map(id => {
        const it = gachaData.items.find(i => i.id === id);
        return it ? it.label : id;
    }).join(', ');
    if($('inventory')) $('inventory').textContent = invStr ? `소지품: ${invStr}` : '소지품: 없음';
}

function convertExp() {
    if (!hasFalna()) return false;
    const converted = GameCore.Growth.convertExcelia(S, MODS);
    if (converted) tryLevelUp();
    return converted;
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
    say(`위업을 인정받아 위계가 승화되었다. 이제 Lv.${S.level}.`, 'event');
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
    S.hp = Math.min(100, Number.isFinite(S.hp) ? S.hp : 0);
    for (const k of ['bond', 'valis', 'feat', 'potential', 'excelia']) {
        S[k] = Math.max(0, Number.isFinite(S[k]) ? S[k] : 0);
    }
    (Array.isArray(fx.flags) ? fx.flags : []).forEach(f => { if (typeof f === 'string' && !S.flags.includes(f)) S.flags.push(f); });

    if (fx.relationship === 'romance') {
        const partner = GameCore.Relations.createRomanticPartner(S, 'event');
        if (partner) say('새로운 인연과 연인 관계가 되었다.', 'result');
    }
    
    if (fx.job) setJob(fx.job);
    else if ((fx.flags || []).includes('supporter') && S.job === 'child') setJob('supporter');
    else if ((fx.flags || []).includes('soldier') && S.job !== 'soldier') setJob('soldier');
    
    if (fx.getItem) {
        if (!S.items.includes(fx.getItem)) {
            S.items.push(fx.getItem);
            const item = gachaData.items.find(i => i.id === fx.getItem);
            if (item) {
                say(`아이템 획득: [${item.label}]`, 'result');
                if (item.fx && item.fx.hp) S.hp = Math.min(100, S.hp + item.fx.hp);
            }
        }
    }
    if (fx.loseItem) {
        S.items = S.items.filter(i => i !== fx.loseItem);
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
    if (fx.dropFamilia) { S.familia = null; S.falnaAt = null; if (S.job === 'adventurer' || S.job === 'supporter') setJob('retired'); }
    if (fx.familia === 'roll') rollFamilia();
    convertExp(); recompute(); renderStats();
}

function rollFamilia() {
    const pool = gachaData.familias.filter(f => f.id !== 'civilian').map(f => {
        const bias = (FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1;
        return { ...f, w: f.weight * bias };
    });
    S.familia = getRandomItemByWeight(pool, 'w');
    const chosenJob = (MODS.familias[S.familia.id] || {}).adv ? 'adventurer' : (JOB_FAMILIA[S.familia.id] || 'merchant');
    setJob(chosenJob);
    const m = MODS.familias[S.familia.id] || {};
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    S.falnaAt = (m.adv || Math.random() < 0.3) ? Math.max(S.phase, rnd(m.falna || DEFAULT_FALNA)) : null;
    apply(m.fx);
    checkFalna();
}

function checkFalna() {
    if (!S.familia || S.falnaAt == null || hasFalna() || S.phase < S.falnaAt) return;
    const m = MODS.familias[S.familia.id] || {};
    S.flags.push('falna'); if (m.adv) S.flags.push('adventurer');
    if (S.level < 1) S.level = 1;
    say(`${S.familia.label}의 신에게 팔나를 받았다. 등에 스테이터스가 새겨졌다.`, 'event', S.age);
    convertExp(); recompute(); renderStats();
}

function startLife() {
    const origin = getRandomItemByWeight(gachaData.origins);
    const race = getRandomItemByWeight(gachaData.races);
    const talent = getRandomItemByWeight(gachaData.talents);
    S = { age: 0, chronologicalAge: 0, physicalAge: 0, phase: 0, hp: 70, power: 0,
          potential: 0, excelia: 0, feat: 0, level: 0, hidden: 0, bond: 0, valis: 0,
          abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }, flags: [], done: [], familia: null, falnaAt: null,
          alias: null, origin, race, talent, cause: '', job: 'child',
          eventCounts: {}, lastEventPhase: {}, recentEvents: [], milestones: [], logHistory: [],
          items: [], relations: [], partnerId: null, nextRelationId: 1 };
    $('log').innerHTML = ''; $('choices').innerHTML = '';
    switchScreen('screen-play');
    apply((MODS.origins[origin.id] || {}).fx);
    apply((MODS.races[race.id] || {}).fx);
    apply((MODS.talents[talent.id] || {}).fx);
    say(`<b>${origin.label}</b>에서 <b>${race.label}</b>으로 태어났다.<br>${origin.desc}<br>${race.desc}<br>타고난 재능: <b>${talent.label}</b> — ${talent.desc}`, 'event', 0);
    if (Math.random() < 0.15) {
        say('부모가 파밀리아 소속 모험자여서, 태어나자마자 같은 파밀리아의 일원이 되었다.', 'result', 0);
        rollFamilia();
        S.flags.push('born_in_familia');
    }
    nextYear();
}

function nextYear() {
    $('choices').innerHTML = '';
    let skipped = 0;
    while (true) {
        const aging = GameCore.Aging.advanceYear(S, MODS);
        GameCore.Relations.advanceYear(S);
        checkFalna();
        if (S.phase > 60) S.hp -= aging.rate;
        if (S.hp <= 0) { S.cause = '몸이 더는 버티지 못했다.'; return endLife(); }
        const naturalDeathChance = Math.min(1, Math.max(0, (S.phase - 65) * 0.04 * aging.rate));
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
        skipped++;
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
        const p = getChoiceProbability(c);
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
    const alias = S.alias || pickAlias();
    const notes = [];
    if (S.flags.includes('liaris')) notes.push('동경이 꺾이지 않는 한 성장을 멈추지 않았던 사람.');
    if (S.flags.includes('xenos_friend')) notes.push('몬스터와 비밀스러운 유대를 맺었던 사람.');
    if (S.flags.includes('scholar')) notes.push('신성문자를 읽어 낼 줄 알았던 학자.');
    if (S.flags.includes('fisher')) notes.push('말년을 메렌의 바닷가에서 보냈다.');
    if (GameCore.Relations.hasPartner(S)) notes.push('성인인 연인과 서로의 삶을 함께했다.');
    const milestones = S.milestones.length ? S.milestones.map(m => `- ${m.age}세: ${m.label}`).join('\n') : '없음';
    const timeline = S.logHistory.filter(x => x.type === 'event' || x.type === 'job').slice(-18).map(x => `${x.age}세: ${x.text}`).join('\n');
    const abilitySummary = S.level >= 1
        ? ABIL.map(([k, label]) => `${label} ${S.abil[k]}(${rankOf(S.abil[k])})`).join(' · ')
        : '';
    const lines = [
        `이명: ${alias.label}`,
        `- ${alias.desc}`,
        '',
        `${S.origin.label} 출신 ${S.race.label}`,
        `소속: ${S.familia ? S.familia.label : '없음'}`,
        `직업: ${JOB_LABELS[S.job] || S.job}`,
        `재능: ${S.talent.label}`,
        ''
    ];
    if (S.level >= 1) lines.push(`도달 레벨: Lv.${S.level}`, abilitySummary, '');
    lines.push(`향년 ${S.age}세 — ${S.cause}`, `인연 ${S.bond} · 발리스 ${S.valis}`, '');
    lines.push(`소지품: ${S.items && S.items.length ? S.items.map(id => { const it = gachaData.items.find(i => i.id === id); return it ? it.label : id; }).join(', ') : '없음'}`, '', '일생의 업적', milestones);
    if (timeline) lines.push('', '주요 연표', timeline);
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
