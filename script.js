// 의존: data.js (gachaData), events.js (MODS, FAMILIA_BIAS, DEFAULT_FALNA, MAX_LEVEL, EVENTS)
const $ = id => document.getElementById(id);
const ABIL = [['str', '힘'], ['vit', '내구'], ['dex', '기교'], ['agi', '민첩'], ['mag', '마력']];
const RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];   // 100 단위
const rankOf = v => v >= 1200 ? 'SSS' : v >= 1000 ? 'SS' : RANKS[Math.min(9, Math.floor(v / 100))];   // 1000~1199 SS, 1200~ SSS
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const EXP_TO_ABIL = 50;      // 경험 1이 능력치로 바뀌는 비율(조정용)
const ABIL_CAP_BREAK = 1499;  // 성장 스킬 보유자의 능력치 상한
const LEVELUP_ABIL = 500;    // 레벨업 조건: 능력치 하나가 D(500) 이상
let S;

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

function match(c = {}) {
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
    const d = document.createElement('div');
    d.className = 'entry ' + cls;
    d.innerHTML = (age != null ? `<span class="age">${age}세</span>` : '') + text;
    $('log').appendChild(d);
    d.scrollIntoView({ block: 'nearest' });
}

const hasFalna = () => S.flags.includes('falna');

// S.power = 이벤트 판정에 쓰는 종합 전투력. 팔나가 있으면 능력치 평균 + 히든 + 레벨 보정(임의 공식)
function recompute() {
    if (hasFalna()) {
        const sum = ABIL.reduce((s, [k]) => s + S.abil[k], 0);
        S.power = Math.round((sum / 5 + S.hidden) / 8 + (S.level - 1) * 20);
    } else S.power = Math.round(S.exp * 0.6);
}

function renderStats() {
    $('stats').innerHTML = [['나이', S.age], ['체력', Math.round(S.hp)], ['레벨', hasFalna() ? S.level : '-'], ['인연', S.bond], ['발리스', S.valis]]
        .map(([n, v]) => `<div>${n}<b>${v}</b></div>`).join('');
    $('abil').innerHTML = hasFalna() ? ABIL.map(([k, n]) => `<div>${n}<b>${S.abil[k]} ${rankOf(S.abil[k])}</b></div>`).join('') : '';
    $('familia').textContent = S.familia ? '소속: ' + S.familia.label : '소속 없음';
}

// 경험(엑세리아) -> 능력치. 종족/재능 편향 적용, 높을수록 성장이 느려짐
function convertExp() {
    if (!hasFalna() || S.exp <= 0) return;
    const w = ABIL.map(([k]) => (((MODS.races[S.race.id] || {}).bias || {})[k] || 1) * (((MODS.talents[S.talent.id] || {}).bias || {})[k] || 1));
    const tot = w.reduce((a, b) => a + b, 0);
    const gain = S.exp * EXP_TO_ABIL * (S.flags.includes('liaris') ? 1.5 : 1);
    // 일반 모험자의 한계는 999(S). 성장 스킬(동경일도)이 있으면 1499(SSS)까지 성장 가능
    const cap = S.flags.includes('liaris') ? ABIL_CAP_BREAK : 999;
    ABIL.forEach(([k], i) => { S.abil[k] = Math.min(cap, Math.round(S.abil[k] + gain * w[i] / tot * (1 - S.abil[k] / (cap + 300)))); });
    S.exp = 0;
    tryLevelUp();
}

// 레벨업(위계승화): 능력치 하나 D 이상 + 위업. 능력치는 0으로 돌아가고 일부가 히든 능력치로 남음
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
    for (const k of ['hp', 'bond', 'valis']) if (fx[k]) S[k] += fx[k];
    if (fx.power) S.exp += fx.power;
    if (fx.feat) S.feat += fx.feat;
    S.hp = Math.min(100, S.hp);
    for (const k of ['bond', 'valis', 'exp']) S[k] = Math.max(0, S[k]);
    (fx.flags || []).forEach(f => { if (!S.flags.includes(f)) S.flags.push(f); });
    if (fx.clearFlags) S.flags = S.flags.filter(f => !fx.clearFlags.includes(f));
    if (fx.dropFamilia) { S.familia = null; S.falnaAt = null; }
    if (fx.familia === 'roll') rollFamilia();
    convertExp(); recompute(); renderStats();
}

function rollFamilia() {
    const pool = gachaData.familias.filter(f => f.id !== 'civilian').map(f => {
        const bias = (FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1;
        return { ...f, w: f.weight * bias };
    });
    S.familia = getRandomItemByWeight(pool, 'w');
    const m = MODS.familias[S.familia.id] || {};
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    // 모험자 파밀리아는 파밀리아별 나이대에 팔나를 받음. 그 외는 일부만 받음(비전투 구성원은 소속만 두기도 함)
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
    S = { age: 0, phase: 0, hp: 70, power: 0, exp: 0, feat: 0, level: 0, hidden: 0, bond: 0, valis: 0,
          abil: { str: 0, vit: 0, dex: 0, agi: 0, mag: 0 }, flags: [], done: [], familia: null, falnaAt: null,
          alias: null, origin, race, talent, cause: '' };
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
    const rate = (MODS.races[S.race.id] || {}).rate || 1;
    while (true) {
        S.age++;
        S.phase = S.age <= 20 ? S.age : Math.floor(20 + (S.age - 20) / rate);
        checkFalna();
        if (S.phase > 50) S.hp -= 2;
        if (S.hp <= 0) { S.cause = '몸이 더는 버티지 못했다.'; return endLife(); }
        if (S.phase > 55 && Math.random() < (S.phase - 55) * 0.06) { S.cause = '긴 생을 마치고 조용히 눈을 감았다.'; return endLife(); }
        const pool = EVENTS.filter(e => (!e.once || !S.done.includes(e.id)) && match(e.cond));
        const e = getRandomItemByWeight([...pool, { w: 45, none: true }], 'w');
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
        // 능력치를 참조할 때 S.abil 객체 내부 값을 가져오도록 수정
        const statVal = c.stat ? (ABIL.find(([k]) => k === c.stat) ? S.abil[c.stat] : S[c.stat]) : 0;
        const p = Math.min(.95, Math.max(.05, c.p + (statVal * (c.per || .005))));
        r = Math.random() < p ? c.ok : c.fail;
    }
    const bad = r.fx && (r.fx.die || r.fx.hp < -30);
    say(r.text, 'result' + (bad ? ' bad' : ''));
    apply(r.fx);
    
    // 희귀 엔딩 처리 로직
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

// 이명은 신회에서 레벨업할 때 정해짐. 레벨 1은 미부여
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
    if (S.flags.includes('partner')) notes.push('곁에 함께한 사람이 있었다.');
    const abil = S.level >= 1 ? '\n' + ABIL.map(([k, n]) => `${n} ${S.abil[k]}(${rankOf(S.abil[k])})`).join(' · ') : '';
    $('result-content').innerText =
        `이명: ${alias.label}\n- ${alias.desc}\n\n` +
        `${S.origin.label} 출신 ${S.race.label}\n소속: ${S.familia ? S.familia.label : '없음'}\n재능: ${S.talent.label}\n\n` +
        `${S.level >= 1 ? '도달 레벨: Lv.' + S.level + abil + '\n' : ''}향년 ${S.age}세 — ${S.cause}\n인연 ${S.bond} · 발리스 ${S.valis}` +
        (notes.length ? '\n\n' + notes.join('\n') : '');
    switchScreen('screen-result');
    window.scrollTo(0, 0);
}

$('btn-start').addEventListener('click', () => {
    switchScreen('screen-loading');
    setTimeout(startLife, 1500);
});
$('btn-retry').addEventListener('click', () => switchScreen('screen-start'));
