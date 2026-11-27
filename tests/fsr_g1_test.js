// F1D4A G1-가 — free_supporter_route 지상 일자리 재설계 시험(D-FSR r3.16 §4 FSR-T1~T4). FSR-T5(48k)는 별도 비교 로그.
// 사용자 결정: D-3 = G1-가(2026-11-27). 합성 = 강제 난수·상태 주입. 실제 경로 = 실제 EVENTS 데이터와 showEvent/chooseBody.
// 사용: node tests/fsr_g1_test.js — 실패 1건 이상이면 종료 코드 1.
const { spawnSync } = require('child_process');
const path = require('path');
const { makeCtx, makeReporter, setAge } = require('./lib_f1_ctx.js');
const R = makeReporter(); const { check, test } = R;
const ROOT = path.join(__dirname, '..');
const E = (T, id) => T.G('EVENTS').find(e => e.id === id);
const FORBIDDEN_FX = ['die', 'job', 'familia', 'recruit', 'godReturn', 'dropFamilia', 'residence', 'location', 'feat', 'flags', 'clearFlags', 'excelia', 'level', 'service'];
const VOCAB = ['던전', '계층', '층', '몬스터', '고블린', '동행', '팔나', '미궁', '원정'];
const branches = ch => ch.chance ? [['ok', ch.chance.ok], ['fail', ch.chance.fail]] : [['plain', ch]];

test('FSR-T1 정적: die·음수 hp·금지 효과 0, 지문·문구에 던전·층·몬스터 어휘 0', () => {
  const T = makeCtx(); const e = E(T, 'free_supporter_route');
  check('FSR-T1a 선택지 3개(G1-가)', e.choices.length === 3, e.choices.length);
  const bad = [];
  for (const [i, ch] of e.choices.entries()) for (const [k, b] of branches(ch)) {
    const fx = b.fx || {};
    for (const f of FORBIDDEN_FX) if (Object.prototype.hasOwnProperty.call(fx, f)) bad.push(i + k + ':' + f);
    if (typeof fx.hp === 'number' && fx.hp < 0) bad.push(i + k + ':hp<0');
  }
  check('FSR-T1b 금지 효과·음수 hp 0', bad.length === 0, bad);
  const texts = [e.text].concat(...e.choices.map(ch => [ch.label].concat(branches(ch).map(([, b]) => b.text))));
  const hits = texts.filter(t => VOCAB.some(v => t.includes(v)));
  check('FSR-T1c 어휘 목록(' + VOCAB.join('·') + ') 0건', hits.length === 0, hits);
  check('FSR-T1d 수치 = 결정 요청서 G1-가: [0] valis 600 · [1] p .7 agi per .002 ok 1000 / fail 200 · [2] bond 1',
    JSON.stringify(e.choices[0].fx) === '{"valis":600}' && e.choices[1].chance.p === 0.7 && e.choices[1].chance.stat === 'agi' && e.choices[1].chance.per === 0.002
    && JSON.stringify(e.choices[1].chance.ok.fx) === '{"valis":1000}' && JSON.stringify(e.choices[1].chance.fail.fx) === '{"valis":200}' && JSON.stringify(e.choices[2].fx) === '{"bond":1}');
});

test('FSR-T2 정적: 조건 원문이 F1 과 같음(RT-6~8 유지)', () => {
  const F1_COMMIT = '61f5d63f99315d99a3ffd1f9ca37bf4d23b9ba2b';
  const g = spawnSync('git', ['-C', ROOT, 'show', F1_COMMIT + ':events.js'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (g.status !== 0) { check('FSR-T2 F1 events.js 를 git 에서 꺼냄(못 꺼내면 미실행 — 통과로 치지 않음)', false, String(g.stderr).slice(0, 120)); return; }
  const pick = src => { const m = src.match(/\{ id: 'free_supporter_route', w: 3, once: true, (cond: \{[^}]*\{[^}]*\} \})/); return m ? m[1] : null; };
  const now = pick(require('fs').readFileSync(path.join(ROOT, 'events.js'), 'utf8')), f1 = pick(g.stdout);
  check('FSR-T2 w·once·조건 원문 바이트 동일', now !== null && now === f1, { now, f1 });
});

test('FSR-T3 정적: EVENT_AREA surface, supporter_accompany 소속 0', () => {
  const T = makeCtx(); const A = T.G('EVENT_AREA');
  check('FSR-T3a free_supporter_route = surface', A.free_supporter_route[0] === 'surface');
  check('FSR-T3b supporter_accompany 소속 사건 0', Object.keys(A).filter(id => A[id][0] === 'supporter_accompany').length === 0);
});

test('FSR-T4 실행(실제 사건 데이터·합성 상태·강제 난수): 세 선택지 모두 생존·직업·소속·팔나·거주·위치 불변', () => {
  for (const [idx, rnd, want] of [[0, null, 600], [1, 0, 1000], [1, 0.999, 200], [2, null, 0]]) {
    const T = makeCtx(); T.G('startLife()'); const s = T.S(); setAge(s, 20); s.hp = 50; s.valis = 100; s.job = 'supporter'; s.flags = s.flags.filter(f => f !== 'falna'); s.familia = null;
    s.pendingFollowup = null; s.currentEventId = null; T.G("$('choices').innerHTML = ''");
    const before = JSON.stringify([s.job, s.familia, s.falnaState, s.flags, s.residence, s.location, s.hp, s.level]);
    T.G("showEvent(EVENTS.find(e => e.id === 'free_supporter_route'))");
    if (rnd !== null) T.G(`var __mr = Math.random; Math.random = () => ${rnd}`);
    try { T.buttons()[idx].click(); } finally { if (rnd !== null) T.G('Math.random = __mr'); }
    check(`FSR-T4 선택 [${idx}]${rnd === null ? '' : ' 난수 ' + rnd} → valis +${want} · 생존 · 상태 불변`, !s.cause && s.valis === 100 + want && JSON.stringify([s.job, s.familia, s.falnaState, s.flags, s.residence, s.location, s.hp, s.level]) === before, { valis: s.valis, cause: s.cause });
  }
});

R.finish('fsr_g1_test');
