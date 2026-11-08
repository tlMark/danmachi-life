// 의존: data.js (gachaData), events.js (MODS, FAMILIA_BIAS, DEFAULT_FALNA, MAX_LEVEL, EVENTS)
const $ = id => document.getElementById(id);
const ABIL = [['str', '힘'], ['vit', '내구'], ['dex', '기교'], ['agi', '민첩'], ['mag', '마력']];
const RANKS = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];   // 100 단위
const rankOf = v => v >= 1200 ? 'SSS' : v >= 1000 ? 'SS' : RANKS[Math.min(9, Math.floor(v / 100))];   // 1000~1199 SS, 1200~ SSS
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const LEVELUP_ABIL = 500;    // 레벨업 조건: 능력치 하나가 D(500) 이상
let S;
// v1.7.8-2i: 팔나 상태 기록(설계 r2k-4 §2.8). 기록 전용 — 난수·판정·성장 경로를 바꾸지 않는다.
let syncDepth = 0;                 // 동기화 범위 깊이. 모듈 로드 시 1회만 0 으로 둔다(startLife 는 대입하지 않음, U3).
const syncInvariantLog = [];       // 기록 전용 불변식 위반(테스트 러너가 읽어 간다). 값 자동 보정 없음.
// 직업 전투 분류(설계 §2.1, [게임 고유 규칙]). 2-i 는 정의·테스트만 한다.
const JOB_ROLE_CLASS = { adventurer:'combat', soldier:'combat', supporter:'support', blacksmith:'noncombat', healer:'noncombat', merchant:'noncombat', farmer:'noncombat', guild_staff:'noncombat', waitstaff:'noncombat', child:'none', retired:'none' };
const FALNA_STATES = ['none', 'active', 'unbound', 'sealed'];
// 금지 전이(설계 §2.3). 2-i 의 전이 함수는 정의만 하고 게임 흐름에서 호출하지 않는다.
const FALNA_FORBIDDEN = { none: ['unbound', 'sealed'], sealed: ['unbound'], unbound: ['sealed'] };
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
    if (c.falnaState && !c.falnaState.includes(S.falnaState)) return false;          // 2-i: 기록 상태(설계 §2.3.2)
    if (c.familiaRole && !c.familiaRole.includes(currentFamiliaRole())) return false;  // 2-i: 열린 소속 역할
    if (c.canEnterDungeon === true && !canEnterDungeon(S)) return false;             // 2-i 정의 = canUseFalna
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

// ── v1.7.8-2i 팔나 상태 판정 함수(설계 §2.2). 성장 경로에는 연결하지 않는다(2-ii). ──
function deriveFalnaState(s = S) {
    const flag = (s.flags || []).includes('falna');
    if (flag) return s.familia ? 'active' : 'unbound';
    return (s.falnaHistory || []).length ? 'sealed' : 'none';
}
function deriveFalnaHolder(s = S) { return (s.flags || []).includes('falna') && s.familia ? s.familia.id : null; }
function openMembershipOf(s = S) { return (s.familiaHistory || []).find(m => m.leftAt == null) || null; }
function currentFamiliaRole(s = S) { const open = s.familia ? openMembershipOf(s) : null; return open ? (open.role || null) : null; }
const falnaEmbedded = (s = S) => ['active', 'unbound', 'sealed'].includes(s.falnaState);
const canUseFalna = (s = S) => s.falnaState === 'active' || s.falnaState === 'unbound';
const canUpdateStatus = (s = S) => s.falnaState === 'active' && !!s.familia && s.falnaHolder === s.familia.id && s.age >= (s.statusResumeAge ?? 0);
const accumulatesExcelia = (s = S) => canUseFalna(s);
const accumulatesPotential = (s = S) => s.falnaState === 'none';
const canEnterDungeon = (s = S) => canUseFalna(s);   // 2-i 정의(= canUseFalna). 2-ii: active + member
const combatClassOf = (s = S) => JOB_ROLE_CLASS[s.job] || null;

// ── 동기화 범위(설계 §2.8 d-1). apply·checkFalna·rollFamilia 만 범위를 연다. ──
function pushFalnaTransition(rec) { S.falnaTransitions ||= []; S.falnaTransitions.push({ age: S.age, ...rec }); }
function updateConversionPending(from, to, dropped, eventId, fromFamiliaId) {
    if (to === 'active') S.conversionPending = null;
    else if (from === 'active' && to === 'unbound') S.conversionPending = { since: S.age, fromFamiliaId, reason: 'left' };
    else if (to === 'sealed' && from !== 'sealed' && dropped) S.conversionPending = { since: S.age, fromFamiliaId, reason: eventId === 'god_gone' ? 'god_returned' : 'sealed_other' };
}
function lastClosedFamiliaId() { const h = (S.familiaHistory || []).filter(m => m.leftAt != null); return h.length ? h[h.length - 1].familiaId : null; }
// 예외로 남은 기준값(또는 비정상 normal 기준값)과 지금 상태를 비교해 복구 전이를 남긴다.
function recoverFromBaseline(b, token, cause) {
    const to = deriveFalnaState(), holderTo = deriveFalnaHolder();
    if (to !== b.state || holderTo !== b.holder) {
        pushFalnaTransition({ from: b.state, to, holderFrom: b.holder, holderTo, cause, eventId: b.eventId, fromFamiliaId: b.openFamiliaId,
            originalEventId: b.eventId, originalScopeKind: b.scopeKind, originalFxKeys: b.fxKeys, originalAt: b.at, recoveredAt: S.age,
            recoveredAtScopeKind: token ? token.kind : 'endLife', recoveredAtEventId: S.currentEventId ?? null });
        updateConversionPending(b.state, to, (b.fxKeys || []).includes('dropFamilia'), b.eventId, b.openFamiliaId);
    }
    S.falnaState = to; S.falnaHolder = holderTo;
}
function openScopeBaseline(token, fx) {
    const b = S.syncBaseline;
    if (b && b.status === 'normal') { syncInvariantLog.push({ kind: 'stale_normal_baseline', at: S.age, scopeKind: token.kind }); recoverFromBaseline(b, token, 'recovered_after_exception'); }
    else if (b && b.status === 'pending_after_exception') recoverFromBaseline(b, token, 'recovered_after_exception');
    else if (S.falnaState !== deriveFalnaState() || (S.falnaHolder ?? null) !== deriveFalnaHolder()) syncInvariantLog.push({ kind: 'stored_state_mismatch', at: S.age, scopeKind: token.kind });
    S.syncBaseline = { status: 'normal', state: deriveFalnaState(), holder: deriveFalnaHolder(), openFamiliaId: S.familia ? S.familia.id : null,
        flag: S.flags.includes('falna'), scopeKind: token.kind, eventId: S.currentEventId ?? null, fxKeys: fx && typeof fx === 'object' ? Object.keys(fx) : [], at: S.age };
}
function classifyFalnaCause(b, to, kind, fx) {
    if (kind === 'checkFalna') return to === 'active' ? 'grant' : 'unclassified';
    if (b.state === 'none' && to === 'active') return 'grant';
    const f = fx && typeof fx === 'object' ? fx : {};
    const dropped = !!f.dropFamilia, clearsFalna = Array.isArray(f.clearFlags) && f.clearFlags.includes('falna');
    if (b.state === 'active' && to === 'unbound' && dropped && !clearsFalna) return 'drop_familia';
    if (to === 'sealed' && dropped && clearsFalna) return 'leave_and_seal';
    if (to === 'sealed' && !dropped && clearsFalna) return 'clear_falna_only';
    if (b.state === 'active' && to === 'active' && f.familia === 'rebind') return 'legacy_auto_convert';
    const joins = f.familia === 'roll' || f.familia === 'rebind' || !!f.recruit;   // 2b-b: fx.recruit 는 기존 fx.familia:'roll' 입단 경로를 대체(분류 동일)
    if (b.state === 'unbound' && to === 'active' && joins) return 'legacy_rejoin';
    if (b.state === 'sealed' && to === 'active' && joins) return 'legacy_sealed_join';
    return 'unclassified';
}
// 가장 바깥 범위의 정상 종료 지점(설계 §2.8 d-1 ③). 안쪽 범위·이미 동기화된 범위는 아무것도 하지 않는다.
function syncAtScopeEnd(token, fx) {
    if (!token.outermost || token.synced) return;
    token.synced = true;
    const b = S.syncBaseline;
    if (!b) { syncInvariantLog.push({ kind: 'missing_baseline_at_sync', at: S.age, scopeKind: token.kind }); return; }
    const to = deriveFalnaState(), holderTo = deriveFalnaHolder();
    if (to !== b.state || holderTo !== b.holder) {
        let cause = classifyFalnaCause(b, to, token.kind, fx);
        let fromFamiliaId = b.openFamiliaId;
        if (b.state === 'active' && fromFamiliaId == null) { fromFamiliaId = lastClosedFamiliaId(); cause += '_recovered'; }
        pushFalnaTransition({ from: b.state, to, holderFrom: b.holder, holderTo, cause, eventId: b.eventId, scopeKind: token.kind, fromFamiliaId });
        const f = fx && typeof fx === 'object' ? fx : {};
        updateConversionPending(b.state, to, !!f.dropFamilia, b.eventId, fromFamiliaId);
    }
    S.falnaState = to; S.falnaHolder = holderTo; S.syncBaseline = null;
}
function endScope(token) {
    syncDepth--;
    if (syncDepth < 0) syncInvariantLog.push({ kind: 'sync_depth_negative', value: syncDepth });
    if (token.outermost && !token.synced && S && S.syncBaseline) S.syncBaseline.status = 'pending_after_exception';
}
function withScope(kind, fx, body) {
    const token = { kind, outermost: syncDepth === 0, synced: false };
    syncDepth++;
    try {
        if (token.outermost) openScopeBaseline(token, fx);
        const r = body(token);
        if (token.outermost && !token.synced) syncAtScopeEnd(token, fx);
        return r;
    } finally { endScope(token); }
}

// ── 입단 호출 모드(설계 §2.3.2). 모드는 인자로만 쓰고 S·게임 데이터에 저장하지 않는다(Q18). ──
function rollModeAllowed(mode) {
    const st = deriveFalnaState(), cp = S.conversionPending ?? null;
    const noOpen = !S.familia && !openMembershipOf();   // legacy_rejoin 전용: 열린 소속 이력이 남은 오염 unbound 거부(M4)
    if (mode === 'initial_join') return st === 'none' && cp === null && !S.familia;   // 설계 §2.3.2 그대로(열린 이력 검사 없음 — r1 단위 테스트의 오염 상태 입단 보존)
    if (mode === 'legacy_rejoin') return st === 'unbound' && S.flags.includes('falna') && noOpen && !!cp && cp.reason === 'left';
    if (mode === 'legacy_rebind') return true;      // 2-i: 가드 없음(현행 'roll' 과 같은 동작). active-only 가드는 2-ii
    // 2-i 결과 보존(Q20 승인 D-2): 입단 3종의 sealed 차단(D-1)은 2-ii 로 이동했고, sealed 의 'roll' 은 현행처럼 가드 없이 처리한다. 2-ii 에서 거부로 전환.
    if (mode === 'legacy_sealed_join') return true;
    if (mode === 'newborn_control') return S.age === 0 && st === 'none' && !!NEWBORN_MEMBERSHIP;
    return false;
}
const rollModeFor = fxFamilia => {
    if (fxFamilia === 'rebind') return 'legacy_rebind';
    const st = deriveFalnaState();
    return st === 'unbound' ? 'legacy_rejoin' : st === 'sealed' ? 'legacy_sealed_join' : 'initial_join';
};

// ── 전이 함수(설계 §2.3·§2.3.1). 2-i 에서는 정의·단위 테스트만 하고 게임 흐름에서 호출하지 않는다. ──
function rejectFalnaTransition(to, why) { pushFalnaTransition({ from: S.falnaState, to, holderFrom: S.falnaHolder ?? null, holderTo: S.falnaHolder ?? null, cause: 'rejected', reason: why, eventId: S.currentEventId ?? null }); return false; }
function falnaTransitionAllowed(from, to) { return !(FALNA_FORBIDDEN[from] || []).includes(to); }
function leaveFamilia() {   // 명시적 탈퇴: active → unbound (2-ii 에서 연결)
    if (!S.familia) return false;   // 무소속이면 무변화(T3b)
    const from = S.falnaState, fromFamiliaId = S.familia.id;
    if (from === 'active' && !falnaTransitionAllowed(from, 'unbound')) return rejectFalnaTransition('unbound', 'forbidden');
    closeMembership('left'); S.familia = null; S.falnaAt = null; S.familiaAt = null;
    const to = deriveFalnaState();
    if (to !== from || S.falnaHolder != null) {
        pushFalnaTransition({ from, to, holderFrom: S.falnaHolder ?? null, holderTo: null, cause: 'leave', eventId: S.currentEventId ?? null, fromFamiliaId });
        if (to === 'unbound') S.conversionPending = { since: S.age, fromFamiliaId, reason: 'left' };
    }
    S.falnaState = to; S.falnaHolder = null;
    return true;
}
function sealByGodReturn() {   // 신의 송환: active → sealed, 레벨·능력치 보존, 직업 불변 (2-ii 에서 연결)
    if (S.falnaState !== 'active' || !S.familia) return rejectFalnaTransition('sealed', 'not_active_member');
    const fromFamiliaId = S.familia.id, holderFrom = S.falnaHolder;
    closeMembership('god_returned'); S.familia = null; S.falnaAt = null; S.familiaAt = null;
    S.flags = S.flags.filter(f => f !== 'falna');
    pushFalnaTransition({ from: 'active', to: 'sealed', holderFrom, holderTo: null, cause: 'god_returned', eventId: S.currentEventId ?? null, fromFamiliaId });
    S.falnaState = 'sealed'; S.falnaHolder = null; S.conversionPending = { since: S.age, fromFamiliaId, reason: 'god_returned' };
    return true;
}
// 후보 파밀리아 선택만(입단 기록·직업·falnaAt·checkFalna 없음). rollFamilia 와 같은 가중치·같은 난수 소비.
// 2b-a: opts.exclude(파밀리아 id 목록)는 후보에서 뺀다(송환된 주신의 파밀리아, 사용자 결정 2026-11-07). 기존 호출(인자 없음)은 동작 불변.
function pickFamiliaCandidate(forcedId, opts) {
    const exclude = (opts && Array.isArray(opts.exclude)) ? opts.exclude : [];
    const pool = gachaData.familias.filter(f => f.id !== 'civilian' && !exclude.includes(f.id)).map(f => {
        const bias = (FAMILIA_BIAS[S.origin.id] || {})[f.id] || 1;
        const parentBias = (S.parentFamilia && S.parentFamilia.id === f.id) ? PARENT_FAMILIA_BIAS : 1;   // 부모 소속 파밀리아 추천(임의 가중치)
        return { ...f, w: f.weight * bias * parentBias };
    });
    return forcedId ? pool.find(f => f.id === forcedId) : getRandomItemByWeight(pool, 'w');
}
// ── 2b-b(v1.7.8-2bb): 일반 지원 → 심사 → 결과(accepted/rejected)·재지원 쿨다운·직접 스카웃 ─────────────────
// 난수: 후보 선택(pickFamiliaCandidate)·falnaAt 은 기존 주 RNG 그대로(U-2b-2 a). 심사는 파생 RNG(주 RNG 비소비).
// 합격 경로의 주 RNG 소비 = 기존 rollFamilia 와 같음(후보 1회 + falnaAt). 거절 시 falnaAt 소비만 빠진다.
function recruitRng(attempt) {
    return GameCore.Recruit.createDerivedRng(GameCore.Lineage.fnv(S.lineageSeed >>> 0, 'recruit:' + S.age + ':' + attempt));
}
function recruitExcludedFamilias() {   // 거절한 파밀리아는 sameFamiliaRetryYears 동안 후보에서 뺀다
    const T = GameCore.Recruit.RECRUIT_TUNING;
    return (S.application.history || []).filter(h => !h.direct && h.outcome === 'rejected' && S.age - h.at < T.sameFamiliaRetryYears).map(h => h.familiaId);
}
function recruitBlockReason() {
    const T = GameCore.Recruit.RECRUIT_TUNING, gen = (S.application.history || []).filter(h => !h.direct);
    if (gen.length >= T.lifetimeApplicationCap) return 'lifetime_cap';
    const lastRej = gen.filter(h => h.outcome === 'rejected').pop();
    if (lastRej && S.age - lastRej.at < T.rejectCooldownYears) return 'cooldown';
    return null;
}
function applyRecruit(spec) {
    const R = GameCore.Recruit, route = spec && spec.route;
    if (!R.ROUTES.includes(route)) { syncInvariantLog.push({ kind: 'recruit_unknown_route', value: route, eventId: S.currentEventId ?? null }); return false; }
    S.application ||= R.newApplicationState();
    const mode = rollModeFor('roll');
    // 직접 경로(scout): 신청 상태를 만들지 않는다. 기존 rollFamilia 와 같은 동작·난수.
    if (R.DIRECT_ROUTES.includes(route)) {
        const before = (S.familiaHistory || []).length;
        rollFamilia(undefined, mode);
        if ((S.familiaHistory || []).length > before && S.familia) S.application.history.push({ route, at: S.age, attempt: null, familiaId: S.familia.id, outcome: 'accepted', direct: true });
        return true;
    }
    // 2-i 가드에 걸리는 상태면 기존 거부 기록 경로를 그대로 탄다(난수 0, 지원 기록 없음).
    if (!rollModeAllowed(mode)) return rollFamilia(undefined, mode);
    const blocked = recruitBlockReason();
    if (blocked) {
        (S.application.blocked ||= []).push({ route, at: S.age, reason: blocked });
        say(blocked === 'cooldown' ? '얼마 전 거절당한 기억 때문에 이번에는 지원하지 못했다.' : '더는 파밀리아의 문을 두드릴 기력이 남지 않았다.', 'result');
        if (spec.fallback) apply(spec.fallback);
        return false;
    }
    const attempt = (S.application.attemptSeq || 0) + 1; S.application.attemptSeq = attempt;
    const cand = pickFamiliaCandidate(undefined, { exclude: recruitExcludedFamilias() });   // 주 RNG 1회(기존 후보 선택)
    if (!cand) throw new Error('recruit: empty candidate pool');
    S.application.current = { route, at: S.age, attempt, familiaId: cand.id };
    const ev = R.evaluateApplication({ route, raceId: S.race && S.race.id, talentId: S.talent && S.talent.id, power: S.power,
        familiaAdv: !!(MODS.familias[cand.id] || {}).adv, familiaWeight: cand.weight }, recruitRng(attempt));
    S.application.history.push({ route, at: S.age, attempt, familiaId: cand.id, outcome: ev.outcome, p: ev.p });
    S.application.current = null;
    if (ev.outcome === 'accepted') {
        if (spec.okText) say(spec.okText, 'result');
        rollFamilia(cand.id, mode);   // forcedId: 추가 후보 난수 없음 → falnaAt 주 RNG 는 기존과 같음
        return true;
    }
    say((spec.failText || '받아 주는 신을 찾지 못했다.') + ` (${cand.label} 심사 탈락)`, 'result');
    if (spec.fallback) apply(spec.fallback);
    return false;
}
// 2b-a: 전이 함수가 범위 안에서 스스로 전이를 기록한 뒤, 범위 끝 동기화가 같은 변화를 다시 기록하지 않도록 기준값을 현재 상태로 맞춘다.
function rebaseSyncAfterTransition() {
    const b = S.syncBaseline;
    if (!b || b.status !== 'normal') return;
    b.state = deriveFalnaState(); b.holder = deriveFalnaHolder(); b.openFamiliaId = S.familia ? S.familia.id : null; b.flag = S.flags.includes('falna');
}
// 2b-a: god_gone 전용. mode = 'seal'(봉인만) | 'regrant'(봉인 후 재수여). 직업은 바꾸지 않는다(Q7). 난수: regrant 의 후보 선택 1회만.
function applyGodReturn(mode) {
    if (mode !== 'seal' && mode !== 'regrant') { syncInvariantLog.push({ kind: 'god_return_unknown_mode', value: mode, at: S.age }); return false; }
    if (!sealByGodReturn()) { syncInvariantLog.push({ kind: 'god_return_seal_rejected', at: S.age, eventId: S.currentEventId ?? null }); return false; }
    rebaseSyncAfterTransition();
    if (mode === 'seal') return true;
    const returned = (S.familiaHistory || []).filter(m => m.leftReason === 'god_returned').map(m => m.familiaId);
    const cand = pickFamiliaCandidate(undefined, { exclude: returned });
    if (!cand || !completeConversion(cand.id, 'god_returned')) { syncInvariantLog.push({ kind: 'god_return_regrant_failed', at: S.age, candidate: cand ? cand.id : null }); return false; }
    rebaseSyncAfterTransition();
    // 재수여 = 팔나 재취득: 기존 재취득 경로(checkFalna)와 같은 레벨 이력·로그를 남긴다(레벨·능력치 불변, 난수 0).
    recordLevel('falna_again', S.level, S.level);
    say(`소속이 정해졌다: ${S.familia.label} — ${S.familia.desc}`, 'result');
    say(`<b class="lv">팔나 재취득 · Lv.${S.level}</b>`, 'levelup', S.age);
    return true;
}
function completeConversion(familiaId, reason) {   // 유일한 unbound/sealed → active 경로(2-ii 에서 연결)
    const from = S.falnaState;
    if (!(S.conversionPending != null && !S.familia && (from === 'unbound' || from === 'sealed'))) return rejectFalnaTransition('active', 'precondition');
    const fam = gachaData.familias.find(f => f.id === familiaId);
    if (!fam || fam.id === 'civilian') return rejectFalnaTransition('active', 'unknown_familia');
    S.familia = fam; S.familiaAt = S.age;
    ensureHistory(); closeMembership('changed');
    S.nextMembershipId = (S.nextMembershipId || 1);
    S.familiaHistory.push({ id: S.nextMembershipId++, familiaId: fam.id, label: fam.label, joinedAt: S.age, leftAt: null, leftReason: null,
        falnaAt: S.age, falnaAlreadyHeld: true, viaParent: false, viaConversion: true, role: 'member' });
    if (from === 'sealed') { S.flags.push('falna'); S.falnaHistory.push({ familiaId: fam.id, at: S.age, membershipIndex: S.familiaHistory.length - 1, kind: 'regrant' }); }
    pushFalnaTransition({ from, to: 'active', holderFrom: null, holderTo: fam.id, cause: from === 'sealed' ? 'regrant' : 'convert', reason: reason || null, eventId: S.currentEventId ?? null });
    S.falnaState = 'active'; S.falnaHolder = fam.id; S.conversionPending = null; S.statusResumeAge = S.age + 1;
    return true;
}

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
    return withScope('apply', fx, token => applyEffects(fx, token));   // v1.7.8-2i: 동기화 범위(기록 전용)
}
function applyEffects(fx, token) {
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
    
    // ⑥a 2b-a(Q2 승인분): 신의 송환 = 봉인(sealByGodReturn), 'regrant' 면 송환된 파밀리아를 뺀 후보로 재수여(completeConversion).
    //     clearFlags·dropFamilia 보다 먼저 처리한다. 전이 함수가 스스로 전이를 기록하므로 범위 기준값을 갱신해 이중 기록을 막는다.
    if (fx.godReturn) applyGodReturn(fx.godReturn);
    if (Array.isArray(fx.clearFlags)) S.flags = S.flags.filter(f => !fx.clearFlags.includes(f));
    if (Array.isArray(fx.clearFlags) && fx.clearFlags.includes('adventurer') && S.job === 'adventurer') setJob('retired');
    if (fx.dropFamilia) { closeMembership('left'); S.familia = null; S.falnaAt = null; S.familiaAt = null; if (S.job === 'adventurer' || S.job === 'supporter') setJob('retired'); }
    // 신의 파밀리아 전용 추첨(조직 고용은 fx.organization). 2-i: 'roll' 은 호출 시점 상태로 모드 결정, 'rebind' 는 legacy_rebind(Q16).
    if (fx.familia === 'roll' || fx.familia === 'rebind') rollFamilia(undefined, rollModeFor(fx.familia));
    if (fx.recruit) applyRecruit(fx.recruit);   // 2b-b: 지원→심사→결과(일반) / 직접 스카웃
    if (fx.organization) joinOrganization(fx.organization);
    // ⑩ R-i: 거주·복무 기록(난수 0, 팔나·직업·소속·가족·플래그·로그 불변 — I-R1~I-R4)
    if (fx.residence) moveResidence(fx.residence, fx.residenceReason || 'event');
    if (fx.service) recordService(fx.service);
    syncAtScopeEnd(token, fx);   // v1.7.8-2i 동기화 지점: ⑨ 직후·convertExp 직전(가장 바깥 범위만 기록)
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

// mode: v1.7.8-2i 입단 호출 모드(설계 §2.3.2). 가드는 난수 사용 전에 검사한다. mode 없이 부르면 기존 동작(가드 없음).
function rollFamilia(forcedId, mode) {
    return withScope('rollFamilia', null, () => rollFamiliaBody(forcedId, mode));
}
function rollFamiliaBody(forcedId, mode) {
    if (mode !== undefined && !rollModeAllowed(mode)) {
        pushFalnaTransition({ from: deriveFalnaState(), to: deriveFalnaState(), holderFrom: deriveFalnaHolder(), holderTo: deriveFalnaHolder(), cause: 'rejected', mode, eventId: S.currentEventId ?? null });
        return false;
    }
    S.familia = pickFamiliaCandidate(forcedId);
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

function checkFalna() { return withScope('checkFalna', null, checkFalnaBody); }   // v1.7.8-2i: 동기화 범위(기록 전용)
function checkFalnaBody() {
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

// ── R-i(v1.7.8-ri): 거주지 기록 전용 ─────────────────────────────────────────────
// 거주 필드·이력만 바꾼다. S.origin·직업·파밀리아·팔나·가족·연애·아이템·발리스·플래그·로그를 건드리지 않고 난수를 쓰지 않는다.
function moveResidence(toRegionId, reason) {
    if (!REGION_IDS.includes(toRegionId)) { syncInvariantLog.push({ kind: 'residence_unknown_region', value: toRegionId, eventId: S.currentEventId ?? null }); return false; }
    if (!S.residence || !Array.isArray(S.residenceHistory) || S.residenceHistory.length === 0) { syncInvariantLog.push({ kind: 'residence_missing_state', eventId: S.currentEventId ?? null }); return false; }
    if (S.residence.regionId === toRegionId) return false;   // 같은 지역 = 이력 무변화
    const cur = S.residenceHistory[S.residenceHistory.length - 1];
    cur.to = S.age;
    S.residenceHistory.push({ seq: cur.seq + 1, regionId: toRegionId, from: S.age, to: null, reason: reason || 'event', eventId: S.currentEventId ?? null });
    S.residence = { regionId: toRegionId, since: S.age };
    return true;
}
// 복무 기록(RES-2 §3.4). S.flags 와 분리. R-i 에서는 생성만 하고 해제·조건 판정에 쓰지 않는다.
function recordService(kind) {
    if (kind !== 'conscripted' && kind !== 'deserter') { syncInvariantLog.push({ kind: 'service_unknown_kind', value: kind, eventId: S.currentEventId ?? null }); return false; }
    if (!S.service) S.service = {};
    if (S.service[kind]) return false;
    S.service[kind] = kind === 'conscripted'
        ? { since: S.age, regionId: 'rakia', eventId: S.currentEventId ?? null }
        : { since: S.age, fromRegionId: 'rakia', eventId: S.currentEventId ?? null };
    return true;
}

function startLife() {
    // v1.7.8-2i(U3): 깊이는 검사만 하고 바꾸지 않는다(모듈 로드 시 1회 0).
    if (syncDepth !== 0) syncInvariantLog.push({ kind: 'sync_depth_nonzero_at_life_start', value: syncDepth });
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
          raceSubtype: null, lineageSeed: 0, levelHistory: [], maxLevel: 0,
          // v1.7.8-2i 기록 필드(설계 §2.8 a): 생성과 동시에 none. 초기 상태는 전이 이력에 넣지 않는다.
          falnaState: 'none', falnaHolder: null, conversionPending: null, falnaTransitions: [], currentEventId: null, syncBaseline: null,
          // R-i(기록 전용): 출생 시 거주지 = 출생지. 이력 구간은 달력 나이 기준 반열린 구간 [from, to).
          residence: { regionId: origin.id, since: 0 }, residenceHistory: [{ seq: 1, regionId: origin.id, from: 0, to: null, reason: 'birth', eventId: null }], service: {} };   // 2a: 비활성 데이터 모델(동작 연결 없음)
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
            rollFamilia(pf.id, 'newborn_control');   // 대조군: 부모와 같은 파밀리아에 즉시 입단
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
    S.currentEventId = e.id;   // v1.7.8-2i: 기록 전용, choose() 의 finally 에서 null
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
    try { return chooseBody(ch); }
    finally { if (S) S.currentEventId = null; }   // v1.7.8-2i(d-2): 조기 반환·예외에서도 초기화
}
function chooseBody(ch) {
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
    // v1.7.8-2i(⑤): 예외로 남은 기준값 정리. 정상 진행에서는 항상 null.
    if (S.syncBaseline) { recoverFromBaseline(S.syncBaseline, null, 'recovered_at_life_end'); S.syncBaseline = null; }
    S.currentEventId = null;
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
