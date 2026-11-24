// F1D4A N2 — 실제 Chromium 에서 후속 선택 예외를 일으켜 RB-1 (가) 원자 롤백을 확인한다(Codex 2차 다음 조치 3).
// 사용: node tests/n2_browser_rollback_test.js                       (file:// 로 index.html)
//       BROWSER_LOAD=inline node tests/n2_browser_rollback_test.js    (HTML·CSS·JS 한 문서 주입 — file:// 배포 경로 검증이 아님)
// [합성 상태 주입·예외 주입] 시험용 후속 선택 kind 를 페이지에 등록하고, resolve 안에서 전이·변경·연표 출력을 한 뒤 예외를 던진다. 게임 코드는 바꾸지 않는다.
// 실패 1건 이상이면 종료 코드 1.
'use strict';
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');   // Windows 경로(C:\…)도 올바른 file:// URL 로 바꾼다(QA r4v 정적 지적)
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const LOAD = process.env.BROWSER_LOAD === 'inline' ? 'inline' : 'file';
function inlineHtml() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => '<style>' + fs.readFileSync(path.join(root, href), 'utf8') + '</style>');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>' + fs.readFileSync(path.join(root, src), 'utf8') + '\n</script>');
  return html;
}
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage(); const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  if (LOAD === 'inline') await page.setContent(inlineHtml(), { waitUntil: 'load' }); else await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  console.log(`ENV  chromium=${browser.version()} node=${process.version} load=${LOAD === 'inline' ? 'inline (file:// 배포 경로 검증 아님)' : 'file://'}`);
  const res = await page.evaluate(() => {
    // 결정적 직렬화(키 정렬, undefined·비유한수 표시). 접근자는 이 시험의 상태에 없다.
    const ser = v => JSON.stringify(v, function (k, x) { if (x === undefined) return '__u__'; if (typeof x === 'number' && !Number.isFinite(x)) return '__' + x + '__';
      if (x && typeof x === 'object' && !Array.isArray(x)) return Object.keys(x).sort().reduce((o, q) => (o[q] = x[q], o), {}); return x; });
    const snapS = () => { const o = {}; Object.keys(S).sort().forEach(k => { if (k !== 'pendingFollowup' && k !== 'currentEventId') o[k] = S[k]; }); return ser(o); };
    const log = () => document.getElementById('log');
    const runCase = (name, prep, body) => {
      clearAutoTimers(); startLife(); clearAutoTimers();
      if (prep) prep();
      document.getElementById('choices').innerHTML = '';
      const err = new Error('boom-' + name);
      let mid = null, midFam = null, midLog = null;
      FOLLOWUP_KINDS.t_browser = { prompt: '시험', options: () => [{ id: 'go', label: '간다' }], resolve: (St) => { body(St); mid = snapS(); midFam = St.familia ? St.familia.id : null; midLog = log().children.length; throw err; } };
      S.pendingFollowup = { kind: 't_browser', phase: 'awaiting_choice', sourceEventId: 'x', seq: 1 };
      const pre = snapS(), ids = { fh: S.familiaHistory, rel: S.relations, items: S.items, lh: S.levelHistory, app: S.application };
      const logLast = log().lastChild, logCount = log().children.length;
      let caught = null; try { chooseFollowup('go'); } catch (e) { caught = e; }
      const after = []; for (let n = logLast ? logLast.nextSibling : log().firstChild; n; n = n.nextSibling) after.push(n.textContent || '');
      return { name, sameS: snapS() === pre, sameErr: caught === err, halted: progressHalted === true, report: lastRollbackReport && { rollback: lastRollbackReport.rollback, input: lastRollbackReport.input },
        failure: !!lastRollbackFailure, unrecorded: rollbackFailureUnrecorded,
        ids: S.familiaHistory === ids.fh && S.relations === ids.rel && S.items === ids.items && S.levelHistory === ids.lh && S.application === ids.app,
        changedBeforeThrow: mid !== null && mid !== pre, midFam, famNow: S.familia ? S.familia.id : null, midLogDelta: midLog == null ? null : midLog - logCount,
        logAdded: after, logCountDelta: log().children.length - logCount, pending: S.pendingFollowup, statsHasValis: (document.getElementById('stats').textContent || '').includes(String(S.valis)) };
    };
    const out = [];
    // A: 입단(rollFamilia)·팔나 취득·연표 출력·관계·아이템 변경 뒤 예외
    out.push(runCase('A', () => { S.age = 16; }, St => {
      apply({ familia: 'roll', valis: 500 }); St.falnaAt = St.age; checkFalna();
      say('롤백될 문구', 'event'); GameCore.Items.acquire(St, 'pyonkichi');
      GameCore.Relations.advanceYear(St, MODS); St.application.attemptSeq = 9; }));
    // B: 활성 단원에서 신의 송환 재수여·탈퇴 뒤 예외
    out.push(runCase('B', () => { S.age = 16; rollFamilia('loki', 'initial_join'); S.falnaAt = S.age; checkFalna(); S.age = 25; }, St => {
      apply({ godReturn: 'regrant' }); apply({ dropFamilia: true }); say('롤백될 문구 2', 'event'); }));
    // C: 복원할 수 없는 변경(non-configurable 속성) → 부분 복원 보고, 정지·원래 예외 유지
    out.push(runCase('C', null, St => { Object.defineProperty(St.familiaHistory, 'z', { value: 1, configurable: false, enumerable: false, writable: false }); St.bond += 1; }));
    return out;
  });
  await browser.close();
  const checks = [];
  const [A, B, C] = res;
  for (const r of [A, B]) {
    checks.push([`${r.name} (전제) 예외 직전 S 가 실제로 바뀌었고 연표 노드가 추가됨`, r.changedBeforeThrow && r.midLogDelta >= 1, { mid: r.changedBeforeThrow, d: r.midLogDelta }]);
    checks.push([`${r.name} 원래 예외 같은 객체로 전파·정지`, r.sameErr && r.halted]);
    checks.push([`${r.name} S 전체 = 스냅숏(pendingFollowup·currentEventId 제외)`, r.sameS]);
    checks.push([`${r.name} 롤백 보고 ok·input normal`, r.report && r.report.rollback === 'ok' && r.report.input === 'normal', r.report]);
    checks.push([`${r.name} 주요 컨테이너·이력 원래 참조`, r.ids]);
    checks.push([`${r.name} 연표: 스냅숏 뒤 노드 = 정지 안내 1건(롤백될 문구 제거)`, r.logAdded.length === 1 && /진행을 멈췄다/.test(r.logAdded[0]), r.logAdded]);
    checks.push([`${r.name} pendingFollowup 정리·실패 기록 없음`, r.pending === null && r.failure === false]);
    checks.push([`${r.name} 상태창이 복원된 발리스를 표시`, r.statsHasValis]);
  }
  checks.push(['A (전제) 예외 직전 입단으로 소속이 생김·복원 뒤 소속 없음', A.midFam !== null && A.famNow === null, { mid: A.midFam, now: A.famNow }]);
  checks.push(['B (전제) 예외 직전 탈퇴로 소속 없음·복원 뒤 loki', B.midFam === null && B.famNow === 'loki', { mid: B.midFam, now: B.famNow }]);
  checks.push(['C 원래 예외 같은 객체로 전파·정지', C.sameErr && C.halted]);
  checks.push(['C 부분 복원 보고(partial(failed)), 성공으로 보지 않음', C.report && C.report.rollback === 'partial(failed)', C.report]);
  checks.push(['C 실패 기록 남음(rollbackFailureUnrecorded false)', C.failure === true && C.unrecorded === false]);
  checks.push(['C 연표: 정지 안내 1건', C.logAdded.length === 1 && /진행을 멈췄다/.test(C.logAdded[0]), C.logAdded]);
  checks.push(['페이지 오류 0(의도한 예외는 시험 코드가 잡음)', pageErrors.length === 0, pageErrors]);
  let bad = 0; for (const [id, ok, d] of checks) { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + id + (ok || d === undefined ? '' : ' — ' + JSON.stringify(d))); }
  console.log(`RESULT: ${bad ? 'FAIL' : 'PASS'} ${checks.length - bad}/${checks.length} (n2_browser_rollback_test, ${LOAD})`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL 실행 오류: ' + (e && e.stack || e)); process.exit(1); });
