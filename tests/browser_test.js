// 실제 Chromium 브라우저 테스트 (Playwright). Mock DOM 이 아니라 index.html 을 그대로 연다.
// 사용: NODE_PATH=$(npm root -g) node tests/browser_test.js [lives=6]
// 환경 변수: BROWSER_LOAD=file(기본, index.html 을 file:// 로 직접 염) | inline(HTML·CSS·JS를 한 문서로 주입 — file:// 이 차단된 환경용, 배포 경로 검증은 아님)
//            CHROMIUM_PATH=/usr/bin/chromium (Playwright 번들 대신 설치된 Chromium 사용)
// 필요: playwright (npm i -D playwright && npx playwright install chromium)
const { chromium } = require('playwright');
const path = require('path');
const root = path.resolve(__dirname, '..');
const LIVES = Number(process.argv[2]) || 6;
const LOAD = process.env.BROWSER_LOAD === 'inline' ? 'inline' : 'file';
const fs = require('fs');
// inline 모드: index.html 의 <link>/<script src> 를 같은 파일 내용으로 바꿔 한 문서로 만든다(게임 코드는 그대로).
function inlineHtml() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => '<style>' + fs.readFileSync(path.join(root, href), 'utf8') + '</style>');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>' + fs.readFileSync(path.join(root, src), 'utf8') + '\n</script>');
  // setContent 문서에는 addInitScript 가 적용되지 않을 수 있어, file 모드와 같은 타이머 단축 스크립트를 문서 맨 앞에 넣는다(테스트 속도용, 게임 코드 불변).
  html = html.replace('<head>', '<head><script>{ const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, Math.min(ms || 0, 4), ...a); }</script>');
  return html;
}
async function openGame(page) {
  if (LOAD === 'inline') await page.setContent(inlineHtml(), { waitUntil: 'load' });
  else await page.goto('file://' + root + '/index.html');
}
const results = [];
const check = (name, ok, note = '') => { results.push({ name, ok: !!ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`); };

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  let pwVersion = '?'; try { pwVersion = require('playwright/package.json').version; } catch (e) {}
  console.log(`ENV  chromium=${browser.version()} playwright=${pwVersion} node=${process.version} load=${LOAD === 'inline' ? 'inline (HTML·CSS·JS 한 문서 주입, file:// 배포 경로 검증 아님)' : 'file:// (index.html 직접 열기)'} executable=${process.env.CHROMIUM_PATH || 'playwright-bundled'}`);
  const errors = [];
  const watch = (page) => { page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); }); };
  const fast = async (page) => page.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, Math.min(ms || 0, 4), ...a); });
  const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id).join(','));

  // 1) 데스크톱: 수동 클릭으로 생애 끝까지
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  watch(page); await fast(page);
  await openGame(page);
  check('초기 화면은 screen-start', await screens(page) === 'screen-start');
  const globals = await page.evaluate(() => ({ startLife: typeof startLife, EVENTS: Array.isArray(EVENTS), items: typeof GameCore.Items, rel: typeof GameCore.Relations.generateFamily, aging: typeof GameCore.Aging.advanceEntity }));
  check('핵심 전역/모듈 로드', globals.startLife === 'function' && globals.EVENTS && globals.items === 'object' && globals.rel === 'function' && globals.aging === 'function', JSON.stringify(globals));

  let levelLabelOk = 0, raceStatusOk = 0, growthOk = 0, levelupDomOk = 0, resultLevelOk = 0, raceResultOk = 0, beastSeen = 0, levelupLives = 0;
  let sawRelations = 0, sawInventory = 0, sawFamilyLog = 0, finished = 0, steps = 0, ageSplitSeen = 0, deathNoticeSeen = 0;
  for (let life = 0; life < LIVES; life++) {
    if (life > 0) { await page.click('#btn-retry'); }
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.active', { timeout: 5000 });
    const early = await page.evaluate(() => ({ stats: document.getElementById('stats').innerText, fam: document.getElementById('familia').textContent, race: S.race.id, raceLabel: S.race.label, sub: S.raceSubtype && S.raceSubtype.label }));
    if (/(팔나 없음|Lv\.\d+|봉인\(Lv\.\d+\))/.test(early.stats) && !/레벨\s*-\s*$/m.test(early.stats)) levelLabelOk++;
    if (early.race === 'beastman' ? early.fam.includes('종족: 수인(' + early.sub) : (early.sub == null && early.fam.includes('종족: ' + early.raceLabel + ' · '))) raceStatusOk++;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (await page.evaluate(() => document.getElementById('screen-result').classList.contains('active'))) break;
      const n = await page.locator('#choices button').count();
      if (!n) { await page.waitForTimeout(3); continue; }
      await page.locator('#choices button').nth(Math.floor(Math.random() * n)).click({ timeout: 3000 }).catch(e => errors.push('click: ' + e.message.split('\n')[0]));
      steps++;
    }
    const snap = await page.evaluate(() => ({
      result: document.getElementById('result-content').innerText,
      relations: document.getElementById('relations').textContent,
      inventory: document.getElementById('inventory').textContent,
      log: document.getElementById('log').innerText,
      stats: document.getElementById('stats').innerText,
      st: { race: S.race.id, raceLabel: S.race.label, sub: S.raceSubtype ? S.raceSubtype.label : null, lh: (S.levelHistory || []).length, ups: (S.levelHistory || []).filter(h => h.kind === 'levelup').length, maxLevel: S.maxLevel || 0, lvDom: document.querySelectorAll('#log .entry.levelup').length, growthDom: [...document.querySelectorAll('#log .entry.growth')].map(e => e.innerText).join('|') },
      active: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id).join(',')
    }));
    if (snap.active === 'screen-result' && /향년 \d+세/.test(snap.result)) finished++;
    if (/가족·관계:/.test(snap.relations)) sawRelations++;
    if (/소지품:/.test(snap.inventory)) sawInventory++;
    if (/곁에는|홀로 태어났다/.test(snap.log)) sawFamilyLog++;
    if (/체감 \d+/.test(snap.result) || /체감/.test(snap.stats)) ageSplitSeen++;
    if (/세상을 떠났다/.test(snap.log)) deathNoticeSeen++;
    if (['신생아', '영아기', '유아 초기'].every(w => snap.st.growthDom.includes(w))) growthOk++;
    if (snap.st.lvDom === snap.st.lh) levelupDomOk++;
    if (snap.st.ups) levelupLives++;
    if (/최고 레벨: /.test(snap.result) && snap.result.includes(snap.st.maxLevel ? 'Lv.' + snap.st.maxLevel : '최고 레벨: 팔나 없음') && (!snap.st.lh || /레벨 이력: /.test(snap.result))) resultLevelOk++;
    if (snap.st.race === 'beastman') { beastSeen++; if (snap.result.includes('수인(' + snap.st.sub)) raceResultOk++; } else if (snap.st.sub == null && snap.result.includes(' 출신 ' + snap.st.raceLabel + '\n')) raceResultOk++;
  }
  check(`실제 클릭으로 ${LIVES}번의 생애가 결과 화면까지 진행`, finished === LIVES, `finished=${finished}, clicks=${steps}`);
  check('#relations 에 가족·관계 요약 표시', sawRelations === LIVES);
  check('#inventory 소지품 표시', sawInventory === LIVES);
  check('출생 시 가족 문구가 로그에 표시', sawFamilyLog === LIVES);
  check('상태창 레벨 표기(팔나 없음 / Lv.N / 봉인) — 생애 시작 직후', levelLabelOk === LIVES, `${levelLabelOk}/${LIVES}`);
  check('상태창 종족 표기(수인만 하위 유형)', raceStatusOk === LIVES, `${raceStatusOk}/${LIVES}`);
  check('0~2세 성장 기록(신생아·영아기·유아 초기)이 로그에 표시', growthOk === LIVES, `${growthOk}/${LIVES}`);
  check('레벨 변화 강조 항목 수 = 레벨 이력 수', levelupDomOk === LIVES, `${levelupDomOk}/${LIVES}`);
  check('결과 화면에 최고 레벨·레벨 이력', resultLevelOk === LIVES, `${resultLevelOk}/${LIVES}`);
  check('결과 화면 종족 표기(수인만 하위 유형)', raceResultOk === LIVES, `${raceResultOk}/${LIVES}`);
  console.log(`INFO  수인 생애 ${beastSeen}/${LIVES}, 레벨업이 있었던 생애 ${levelupLives}/${LIVES} (확률적, 판정 대상 아님)`);
  console.log(`INFO  체감 나이 표기 노출 ${ageSplitSeen}/${LIVES}, 가족 사망 알림 노출 ${deathNoticeSeen}/${LIVES} (확률적, 판정 대상 아님)`);

  // 1-b) 수인 생애를 반드시 하나 확인: 실제 startLife()로 다시 굴려 수인이 나올 때까지(최대 200회) 시도 후 자동 진행으로 끝까지.
  {
    const bp = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    watch(bp); await fast(bp);
    await openGame(bp);
    await bp.click('#btn-start'); await bp.waitForSelector('#screen-play.active');
    let tries = 0, info = null;
    for (; tries < 200; tries++) {
      info = await bp.evaluate(() => ({ race: S.race.id, sub: S.raceSubtype && S.raceSubtype.label, canon: S.raceSubtype && S.raceSubtype.canon, fam: document.getElementById('familia').textContent, log: document.getElementById('log').innerText }));
      if (info.race === 'beastman') break;
      await bp.evaluate(() => startLife());
    }
    const statusOk = info && info.race === 'beastman' && info.fam.includes('수인(' + info.sub) && info.log.includes(info.sub + '</b>') === false && info.log.includes(info.sub);
    await bp.check('#auto'); const firstBtn = bp.locator('#choices button').first(); if (await firstBtn.count()) await firstBtn.click();
    const done = await bp.waitForSelector('#screen-result.active', { timeout: 60000 }).then(() => true).catch(() => false);
    const res = done ? await bp.evaluate(() => document.getElementById('result-content').innerText) : '';
    const marker = info && info.canon === 'unverified' ? res.includes('비공식 게임 설정') : true;
    check('수인 생애: 상태창·출생 기록·결과 화면의 하위 유형 일치', statusOk && done && res.includes('수인(' + info.sub) && marker, `tries=${tries + 1}, subtype=${info && info.sub}, canon=${info && info.canon}`);
  }

  // 2) 자동 진행 모드
  const auto = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  watch(auto); await fast(auto);
  await openGame(auto);
  await auto.click('#btn-start'); await auto.waitForSelector('#screen-play.active');
  await auto.check('#auto'); await auto.locator('#choices button').first().click();
  const reached = await auto.waitForSelector('#screen-result.active', { timeout: 60000 }).then(() => true).catch(() => false);
  check('자동 진행 모드가 결과 화면에 도달', reached);

  // 3) 모바일 폭: 가로 스크롤 없음
  const mobile = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true });
  watch(mobile); await fast(mobile);
  await openGame(mobile);
  await mobile.click('#btn-start'); await mobile.waitForSelector('#screen-play.active');
  for (let i = 0; i < 12; i++) { const n = await mobile.locator('#choices button').count(); if (!n) break; await mobile.locator('#choices button').first().click().catch(() => {}); await mobile.waitForTimeout(5); }
  const overflow = await mobile.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('모바일(375px) 가로 스크롤 없음', overflow.sw <= overflow.cw, JSON.stringify(overflow));

  // 4) T1-F/F-1 후속 선택 화면: 실제 브라우저 DOM·실제 클릭. [합성 상태 주입] join_hard 심사 결과를 거절로 고정하고 고용 중인 인물로 만든다(실제 생애 결과 아님).
  {
    const setup = `S.race = gachaData.races.find(r => r.id === 'human'); S.familia = null; S.flags = S.flags.filter(f => f !== 'falna' && f !== 'supporter');
      S.falnaState = 'none'; S.falnaHistory = []; S.familiaHistory = []; S.pendingFollowup = null; S.application = GameCore.Recruit.newApplicationState();
      S.age = 20; S.chronologicalAge = 20; S.phase = 20; S.physicalAge = 20; S.hp = 70; setJob('guild_staff'); S.jobSince = 14;
      S.employer = { id: 'guild', label: '길드', kind: 'administration', since: 14 };
      GameCore.Recruit.evaluateApplication = () => ({ outcome: 'rejected', p: 0 });
      document.getElementById('choices').innerHTML = ''; showEvent(EVENTS.find(e => e.id === 'join_hard'));`;
    const fp = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    watch(fp); await fast(fp); await openGame(fp);
    await fp.click('#btn-start'); await fp.waitForSelector('#screen-play.active');
    await fp.evaluate(setup);
    await fp.locator('#choices button', { hasText: '끈질기게 문을 두드린다' }).click();
    const screen1 = await fp.evaluate(() => ({ labels: [...document.querySelectorAll('#choices button')].map(b => b.dataset.followup + ':' + b.textContent), prompt: document.getElementById('log').innerText.includes('앞으로 어떻게 지낼까?'), phase: S.pendingFollowup && S.pendingFollowup.phase, rejectLine: /의 심사에서 탈락했다\./.test(document.getElementById('log').innerText) }));
    check('F-1 후속 화면 표시(실제 클릭): 안내·C25 선택지 2개·다음 해 버튼 없음', screen1.prompt && screen1.phase === 'awaiting_choice' && screen1.rejectLine && JSON.stringify(screen1.labels) === JSON.stringify(['supporter:현재 고용처를 그만두고 서포터로 전직한다', 'stay:지금 생활을 이어간다']), JSON.stringify(screen1));
    await fp.locator('#choices button[data-followup="supporter"]').click();
    const after = await fp.evaluate(() => ({ job: S.job, employer: S.employer, pending: S.pendingFollowup, next: [...document.querySelectorAll('#choices button')].map(b => b.textContent), quit: S.logHistory.filter(x => x.kind === 'employer_quit').map(x => x.text), sev: S.logHistory.filter(x => x.kind === 'severance').length, status: document.getElementById('familia').textContent }));
    check("F-1 서포터 전직(실제 클릭): job supporter·고용처 해제·L-1 1건·퇴직금 0(액수 미결)·'다음 해로'", after.job === 'supporter' && after.employer === null && after.pending === null && JSON.stringify(after.next) === JSON.stringify(['다음 해로']) && JSON.stringify(after.quit) === JSON.stringify(['길드을(를) 그만두었다.']) && after.sev === 0 && !after.status.includes('고용처'), JSON.stringify(after));
    // 자동 진행: 후속 화면에서 stay 고정 선택 후 계속 진행
    const ap = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    watch(ap); await fast(ap); await openGame(ap);
    await ap.click('#btn-start'); await ap.waitForSelector('#screen-play.active');
    await ap.evaluate(setup + " globalThis.__f1 = { stayChosen: 0 }; { const o = chooseFollowup; chooseFollowup = function (id) { if (id === 'stay') globalThis.__f1.stayChosen++; else globalThis.__f1.other = id; return o.apply(this, arguments); }; }");
    await ap.check('#auto'); await ap.locator('#choices button', { hasText: '끈질기게 문을 두드린다' }).click();
    const autoDone = await ap.waitForSelector('#screen-result.active', { timeout: 60000 }).then(() => true).catch(() => false);
    const af = await ap.evaluate(() => ({ f1: globalThis.__f1, pending: S.pendingFollowup }));
    check('F-1 자동 진행: 후속 화면에서 stay 고정 선택 → 결과 화면 도달', autoDone && af.f1.stayChosen === 1 && !af.f1.other && af.pending === null, JSON.stringify(af));
  }

  check('페이지 오류/콘솔 오류 없음', errors.length === 0, errors.slice(0, 3).join(' || '));
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
