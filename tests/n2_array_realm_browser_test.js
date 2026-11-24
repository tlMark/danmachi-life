// F1D4A N2 QA RB-2B — 원생 Array 판별(rbxArrayList)의 실제 Chromium 검증. 게임 코드는 바꾸지 않고 페이지에서 함수만 호출한다.
// 사용: node tests/n2_array_realm_browser_test.js            (file:// 로 index.html 을 연다)
//       BROWSER_LOAD=inline node tests/n2_array_realm_browser_test.js   (HTML·CSS·JS 한 문서 주입 — file:// 배포 경로 검증이 아님)
// 다른 realm 은 같은 출처의 iframe(about:blank)으로 만든다. 실패 1건 이상이면 종료 코드 1.
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
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  if (LOAD === 'inline') await page.setContent(inlineHtml(), { waitUntil: 'load' }); else await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  console.log(`ENV  chromium=${browser.version()} node=${process.version} load=${LOAD === 'inline' ? 'inline (file:// 배포 경로 검증 아님)' : 'file://'}`);
  const r = await page.evaluate(() => {
    const L = a => rbxArrayList(a);
    const f = document.createElement('iframe'); document.body.appendChild(f); const W = f.contentWindow;
    const other = new W.Array(3, 4); const other2 = W.eval('[5, 6]');
    const out = {};
    out.cur = JSON.stringify(L([1, 2]));
    out.other = JSON.stringify(L(other)) + '|' + JSON.stringify(L(other2));
    out.sub = L((() => { class Sub extends Array {} return Sub.from([1]); })()) === null && L(W.eval('(() => { class S2 extends Array {} return S2.from([1]); })()')) === null;
    out.proto = L((() => { const a = [1]; Object.setPrototypeOf(a, Object.create(Array.prototype)); return a; })()) === null
      && L((() => { const a = [1]; Object.setPrototypeOf(a, null); return a; })()) === null;
    const withCtor = C => { const p = Object.create(Array.prototype); p.constructor = C; if (typeof C === 'function') { try { C.prototype = p; } catch (e) {} } const a = [1]; Object.setPrototypeOf(a, p); return L(a); };
    out.ctorFake = withCtor(function Array() {}) === null;
    out.ctorBound = withCtor(Array.bind(null)) === null;
    out.ctorProxy = withCtor(new Proxy(Array, {})) === null;
    out.ownCtor = L((() => { const a = [1]; a.constructor = Object; return a; })()) === null;
    out.holesEtc = L([1, , 3]) === null && L(Object.freeze([1])) === null && L((() => { const a = [1]; Object.defineProperty(a, '0', { get() { return 1; }, enumerable: true, configurable: true }); return a; })()) === null;
    // 판정 범위(QA r3 필수 2): constructor 가 바뀐 realm 의 배열만 거부하고, 정상인 다른 realm 의 배열은 지원한다
    const f2 = document.createElement('iframe'); document.body.appendChild(f2); const W2 = f2.contentWindow;
    const keep = W2.Array.prototype.constructor; W2.Array.prototype.constructor = W2.eval('(function Array() {})');
    out.scopeChanged = L(W2.eval('[1]')) === null;
    out.scopeOthers = JSON.stringify(L([2])) === '[2]' && JSON.stringify(L(W.eval('[3]'))) === '[3]';
    W2.Array.prototype.constructor = keep;
    out.nativeSrc = Function.prototype.toString.call(Array) + ' || ' + Function.prototype.toString.call(W.Array);
    return out;
  });
  await browser.close();
  const checks = [
    ['RB-2B-1 현재 realm 일반 배열 → 지원', r.cur === '[1,2]'],
    ['RB-2B-2 다른 realm(iframe) 일반 배열 → 지원', r.other === '[3,4]|[5,6]'],
    ['RB-2B-3 사용자 정의 하위 클래스(두 realm) → 거부', r.sub],
    ['RB-2B-4 프로토타입 교체·null → 거부', r.proto],
    ['RB-2B-5a 생성자 교체: 이름만 Array 인 함수 → 거부', r.ctorFake],
    ['RB-2B-5b 생성자 교체: bind 된 Array → 거부', r.ctorBound],
    ['RB-2B-5c 생성자 교체: Proxy(Array) → 거부', r.ctorProxy],
    ['RB-2B-5d 인스턴스 own constructor → 거부', r.ownCtor],
    ['RB-2B-6 빈 칸·동결·접근자 원소 → 거부', r.holesEtc],
    ['RB-2B-7a constructor 가 바뀐 realm(iframe)의 배열 → 거부(fail-closed)', r.scopeChanged],
    ['RB-2B-7b 같은 상황에서 정상인 다른 realm(페이지·다른 iframe)의 배열 → 지원(정책)', r.scopeOthers],
    ['페이지 오류 0', errors.length === 0]];
  let bad = 0; for (const [id, ok] of checks) { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + id); }
  console.log('INFO 원생 Array 소스 문자열: ' + r.nativeSrc);
  console.log(`RESULT: ${bad ? 'FAIL' : 'PASS'} ${checks.length - bad}/${checks.length} (n2_array_realm_browser_test, ${LOAD})`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL 실행 오류: ' + (e && e.stack || e)); process.exit(1); });
