// 2a: 파밀리아 입단 절차·무명(minor) 파밀리아·명성의 데이터 모델.
// 2b-b(v1.7.8-2bb, 사용자 승인): 일반 지원 심사(evaluateApplication)와 RECRUIT_TUNING 수치를 연결한다. 결과는 accepted/rejected 만(deferred·open_call·recruit_result 는 U-2b-6 미결).
// 무명 파밀리아 생성·명성 효과·스카웃 심사(SC-1~5)는 2b-c 이며 연결하지 않는다.
// 이 모듈은 Math.random 을 사용하지 않는다: 기존 게임 난수열을 바꾸지 않도록 자체 파생 RNG(createDerivedRng)만 쓴다.
(function (root) {
    'use strict';
    const core = root.GameCore = root.GameCore || {};

    // 명성 서사 단계(통일 enum). 문턱값은 미정이며 RECRUIT_TUNING 에서 밸런스 단계에 정한다.
    const FAME_STAGES = ['unknown', 'local', 'orario', 'major'];
    // 표시명은 대상별로 분리한다(같은 enum 값, 다른 문구): 개인에게 '유력 파밀리아'라고 표시하지 않는다.
    const FAME_LABELS_PERSONAL = { unknown: '무명', local: '지역에서 알려진 인물', orario: '오라리오에서 알려진 인물', major: '이름난 인물' };
    const FAME_LABELS_FAMILIA = { unknown: '무명 파밀리아', local: '지역에서 알려진 파밀리아', orario: '오라리오에서 알려진 파밀리아', major: '유력 파밀리아' };
    const ROUTES = ['open_call', 'self_apply', 'referral', 'scout', 'exam', 'persistence', 'god_whim'];
    const DIRECT_ROUTES = ['scout', 'god_whim'];                 // 신청 상태(application.current)를 거치지 않는 신의 직접 선택
    const OUTCOMES = ['accepted', 'rejected', 'withdrawn', 'ignored', 'deferred'];
    const INITIATORS = ['applicant', 'familia', 'god', 'referrer'];

    // 2b-b 확률·쿨다운·상한 — 수치는 모두 이 객체에만 둔다(게임 고유 밸런스 값, 원작 근거 없음). 목표: U-2b-1 승인 범위(소속 50~60%, 팔나 45~55%, 지원자 중 거절 경험 20~40%).
    const RECRUIT_TUNING = Object.freeze({
        routeBase: Object.freeze({ self_apply: 0.68, persistence: 0.65 }),   // 경로 기본 합격률(scout 는 DIRECT_ROUTES — 심사 없음)
        raceBonus: Object.freeze({ notHumanPallum: 0.10 }),                     // 현행 join 서술(인간·팔룸 외 종족을 신들이 먼저 눈여겨봄)과 일치
        talentBonus: Object.freeze({ basic_magic: 0.08, chantless: 0.15, rare_skill: 0.20, liaris: 0.20 }),
        powerPer: 0.01, powerBonusMax: 0.20,                                   // 현재 S.power 가점(상한)
        familiaAdvDelta: -0.05, familiaNonAdvDelta: 0.10,                      // 파밀리아 모험 성향(MODS.familias[id].adv)
        familiaLargeWeight: 100, familiaLargeDelta: 0.05,                      // 파밀리아 규모(추첨 가중치 기준)
        pMin: 0.05, pMax: 0.95,
        rejectCooldownYears: 2,                                                // 거절 후 일반 재지원 쿨다운(년, 달력 나이)
        sameFamiliaRetryYears: 10,                                             // 거절한 파밀리아 재지원 제한(년) — 후보에서 제외
        lifetimeApplicationCap: 4                                              // 생애 일반 지원 상한(직접 경로 scout 제외)
    });

    // 2b-b 심사: 순수 함수. rng 는 파생 RNG(createDerivedRng) — Math.random 을 쓰지 않는다. 결과 accepted/rejected.
    function evaluateApplication(input, rng) {
        const T = RECRUIT_TUNING, i = input || {};
        if (!Object.prototype.hasOwnProperty.call(T.routeBase, i.route)) throw new Error('evaluateApplication: route without base rate: ' + i.route);
        let p = T.routeBase[i.route];
        if (i.raceId && i.raceId !== 'human' && i.raceId !== 'pallum') p += T.raceBonus.notHumanPallum;
        p += T.talentBonus[i.talentId] || 0;
        p += Math.min(T.powerBonusMax, Math.max(0, Number(i.power) || 0) * T.powerPer);
        p += i.familiaAdv ? T.familiaAdvDelta : T.familiaNonAdvDelta;
        if ((Number(i.familiaWeight) || 0) >= T.familiaLargeWeight) p += T.familiaLargeDelta;
        p = Math.min(T.pMax, Math.max(T.pMin, p));
        const roll = rng();
        return { p: +p.toFixed(4), roll, outcome: roll < p ? 'accepted' : 'rejected' };
    }

    function newApplicationState() { return { current: null, history: [] }; }

    // 자체 RNG(mulberry32). 게임의 Math.random 스트림을 소비하지 않는다.
    function createDerivedRng(seed) {
        let state = (Number(seed) >>> 0) || 0x9E3779B9;
        return function () {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 원작 고유명·기존 신 이름과 겹치면 안 되는 예약어(확정 목록은 원작 조사 후 확장). 게임 데이터의 파밀리아 라벨도 함께 검사한다.
    const RESERVED_NAMES = ['헤스티아', '로키', '프레야', '프레이야', '아레스', '칼리', '헤파이스토스', '가네샤', '헤르메스', '데메테르', '미아흐',
        '타케미카즈치', '소마', '아스트레아', '아폴론', '디오니소스', '이슈타르', '제우스', '헤라', '우라노스', '아르테미스', '아프로디테', '니아드', '풍요의 여주인', '길드'];

    // 이름 생성용 음절(비공식 창작). 목록·성향·목적은 임시 중립 단어이며 원작 조사 후 확정한다.
    const SYLLABLES = ['벨', '카', '리', '노', '세', '무', '타', '라', '오', '피', '넬', '도', '마', '유', '르', '시'];
    const TRAITS = ['방임', '엄격', '호기심', '보은 중시', '느긋함', '고집'];
    const PURPOSES = ['탐색', '생산', '구호', '학구', '지역 봉사'];

    function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

    // 시드로 재현 가능한 minor 파밀리아 목록. 게임 시작 시 한 번 캐시하는 용도(2a 에서는 호출하지 않는다).
    function createMinorFamilias(opts) {
        const o = opts || {};
        const rng = createDerivedRng(o.seed);
        const count = Math.max(0, Math.min(12, Number(o.count) | 0));
        const reserved = RESERVED_NAMES.concat(Array.isArray(o.reservedNames) ? o.reservedNames : []);
        const used = new Set();
        const out = [];
        for (let guard = 0; out.length < count && guard < 500; guard++) {
            const name = pick(rng, SYLLABLES) + pick(rng, SYLLABLES) + (rng() < 0.5 ? pick(rng, SYLLABLES) : '');
            const label = `${name} 파밀리아`;
            if (used.has(name) || reserved.some(r => name.indexOf(r) >= 0 || label.indexOf(r) >= 0)) continue;
            used.add(name);
            out.push({
                id: `minor_${out.length + 1}`, label, kind: 'minor', official: false,
                note: '비공식 창작(원작에 없는 파밀리아)',
                god: { trait: [pick(rng, TRAITS)] }, purpose: pick(rng, PURPOSES),
                needs: {}, recruitment: { routes: [], openCall: false },
                fame: 'unknown'
            });
        }
        return out;
    }

    core.Recruit = { FAME_STAGES, FAME_LABELS_PERSONAL, FAME_LABELS_FAMILIA, ROUTES, DIRECT_ROUTES, OUTCOMES, INITIATORS, RECRUIT_TUNING, RESERVED_NAMES,
        newApplicationState, createDerivedRng, createMinorFamilias, evaluateApplication };
})(globalThis);
