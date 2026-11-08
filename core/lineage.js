// v1.7.7: 수인 하위 유형과 0~2세 성장 기록. 표시·기록 전용이며 게임 수치(능력치·팔나·레벨·확률)에 영향을 주지 않는다.
// 이 모듈은 Math.random 을 사용하지 않는다. 생애별 파생 시드(출생 직후 상태의 해시)와 자체 RNG만 쓴다.
(function (root) {
    'use strict';
    const core = root.GameCore = root.GameCore || {};

    // canon: 'secondary_source' = 2차 자료(영문 위키백과 등장인물 목록)에서 작중 존재가 확인됨, 'unverified' = 원작 근거 미확인 → 비공식 게임 설정.
    // 여우형은 게임에 별도 종족 '르나르'가 있으므로 수인 하위 유형에서 제외한다. 가중치는 균등(임의값).
    const BEASTMAN_SUBTYPES = [
        { id: 'cat', label: '고양이', canon: 'secondary_source', note: '작중 cat people 존재(2차 자료)' },
        { id: 'dog', label: '개', canon: 'secondary_source', note: '작중 chienthrope(견인) 존재(2차 자료)' },
        { id: 'wolf', label: '늑대', canon: 'unverified', note: '원작 근거 미확인 — 비공식 게임 설정' },
        { id: 'boar', label: '멧돼지', canon: 'unverified', note: '원작 근거 미확인 — 비공식 게임 설정' },
        { id: 'tiger', label: '호랑이', canon: 'unverified', note: '원작 근거 미확인 — 비공식 게임 설정' },
        { id: 'rabbit', label: '토끼', canon: 'unverified', note: '원작 근거 미확인 — 비공식 게임 설정' }
    ];

    function fnv(h, str) { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
    function rngFrom(seed) {
        let state = (seed >>> 0) || 0x9E3779B9;
        return function () {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 출생 직후 상태(출신·종족·재능·가족 구성)에서 파생 시드를 만든다. 게임 난수열을 소비하지 않는다.
    function lifeSeed(S) {
        const rel = (S.relations || []).map(r => [r.subType, r.age, Math.round((Number(r.physicalAge) || 0) * 1000), r.race && r.race.id || r.race, r.falna ? 1 : 0, r.level || 0]);
        return fnv(2166136261, JSON.stringify([S.origin && S.origin.id, S.race && S.race.id, S.talent && S.talent.id, rel]));
    }

    function pickBeastmanSubtype(seed) {
        const rng = rngFrom(fnv(seed >>> 0, 'beastman_subtype'));
        const s = BEASTMAN_SUBTYPES[Math.floor(rng() * BEASTMAN_SUBTYPES.length)];
        return { id: s.id, label: s.label, canon: s.canon, note: s.note };
    }

    // 종족 표시명: 수인만 하위 유형을 붙인다. 원작 근거 미확인 유형은 '비공식 설정'을 표시한다.
    function raceLabel(S) {
        const base = S.race ? S.race.label : '';
        const sub = S.raceSubtype;
        if (!sub) return base;
        return `${base}(${sub.label}${sub.canon === 'unverified' ? '·비공식 설정' : ''})`;
    }

    // 0~2세 성장 기록(게임 규칙상의 단계명, 원작 정설 아님). 문구 변형은 파생 RNG로 고른다.
    const STAGE = { 0: '신생아', 1: '영아기', 2: '유아 초기' };
    const TEXT = {
        0: { family: ['작은 울음소리와 함께 가족의 품에 안겼다.', '처음 맞는 밤, 곁의 온기에 금세 잠들었다.'], alone: ['보살펴 주는 이의 손에서 첫 밤을 넘겼다.'] },
        1: { family: ['기어 다니며 집 안 구석구석을 살폈다.', '처음으로 가족을 부르는 듯한 소리를 냈다.', '붙잡고 일어서려다 엉덩방아를 찧었다.'], alone: ['돌보는 이의 목소리에 고개를 돌리게 되었다.', '기어 다니며 주변을 살피기 시작했다.'] },
        2: { family: ['아장아장 걸어 다니며 무엇이든 손에 쥐려 했다.', '짧은 말로 하고 싶은 것을 고집하기 시작했다.', '가족의 손을 잡고 처음으로 동네를 걸었다.'], alone: ['혼자 걷기 시작했고, 짧은 말을 따라 하게 되었다.'] }
    };
    const BEAST_EXTRA = { 1: '귀가 소리 나는 쪽으로 쫑긋 움직였다.', 2: '꼬리로 균형을 잡는 법을 익혀 갔다.' };

    function childhoodRecord(S, age) {
        if (!(age >= 0 && age <= 2)) return null;
        const hasFamily = (S.relations || []).some(r => r && r.isFamily && r.alive !== false);
        const list = TEXT[age][hasFamily ? 'family' : 'alone'];
        const rng = rngFrom(fnv(S.lineageSeed >>> 0, 'childhood:' + age));
        let text = list[Math.floor(rng() * list.length)];
        if (S.race && S.race.id === 'beastman' && BEAST_EXTRA[age]) text += ' ' + BEAST_EXTRA[age];
        return { age, stage: STAGE[age], text };
    }

    core.Lineage = { BEASTMAN_SUBTYPES, CHILDHOOD_STAGES: STAGE, lifeSeed, pickBeastmanSubtype, raceLabel, childhoodRecord, fnv };   // 2b-b: fnv 공개(recruit 파생 시드)
})(globalThis);
