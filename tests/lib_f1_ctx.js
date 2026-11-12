// T1-F/F-1 테스트 공용 격리 컨텍스트. 각 테스트는 새 vm 컨텍스트에서 게임 소스를 그대로 읽어 실행한다(게임 코드에 테스트 훅 없음).
// opts.patch = [[파일, 원문, 대체문], ...]  — 격리된 사본 소스에만 적용하는 치환(변이 시험·시험용 값 주입). 디스크의 게임 파일은 바꾸지 않는다.
// opts.timers = 'drop'(기본, 예약만 무시) | 'queue'(예약을 큐에 쌓고 runTimer 로 수동 실행) | 'sync'(즉시 실행)
const fs = require('fs'), vm = require('vm'), path = require('path');
// 게임 폴더: opts.root > 환경 변수 F1_GAME_ROOT(변이 시험이 임시 사본을 가리킬 때) > 이 저장소.
const GAME_ROOT = path.resolve(process.env.F1_GAME_ROOT || path.join(__dirname, '..'));
const FILES = ['data.js', 'events.js', 'core/aging.js', 'core/growth.js', 'core/relations.js', 'core/items.js', 'core/recruit.js', 'core/lineage.js', 'script.js'];

function makeElement(counter) {
  const e = { style: {}, kids: [], html: '', className: '', textContent: '', innerText: '', checked: false, isConnected: false, onclick: null, dataset: {},
    classList: { _s: new Set(), add(...n) { n.forEach(x => this._s.add(x)); }, remove(...n) { n.forEach(x => this._s.delete(x)); }, contains(x) { return this._s.has(x); } },
    addEventListener(type, fn) { (this.listeners ||= {})[type] = fn; }, scrollIntoView() {},
    appendChild(c) { this.kids.push(c); c.isConnected = true; counter.dom++; return c; },
    querySelectorAll() { return this.kids; },
    click() { counter.clicks++; if (typeof this.onclick === 'function') return this.onclick(); if (this.listeners && this.listeners.click) return this.listeners.click(); } };
  Object.defineProperty(e, 'innerHTML', { get() { return e.html; }, set(v) { e.kids.forEach(k => { k.isConnected = false; }); e.kids = []; e.html = String(v); counter.dom++; } });
  return e;
}

function makeCtx(opts = {}) {
  const seed = opts.seed === undefined ? 20261104 : opts.seed, root = path.resolve(opts.root || GAME_ROOT);
  const counter = { dom: 0, clicks: 0 }, els = {};
  const document = { getElementById: id => (els[id] ||= makeElement(counter)), createElement: () => makeElement(counter), querySelectorAll: () => [] };
  let state = seed >>> 0, calls = 0; const M = Object.create(Math);
  M.random = () => { calls++; state += 0x6D2B79F5; let v = state; v = Math.imul(v ^ (v >>> 15), v | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
  const timers = [], cleared = []; let timerId = 0; const mode = opts.timers || 'drop';
  const setTimeoutMock = (fn, ms) => { const id = ++timerId; if (mode === 'sync') { if (typeof fn === 'function') fn(); } else if (mode === 'queue') timers.push({ id, fn, ms }); return id; };
  const clearTimeoutMock = id => { cleared.push(id); if (opts.clearRemoves !== false) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); } };
  const sandbox = { document, window: { scrollTo() {} }, setTimeout: setTimeoutMock, clearTimeout: clearTimeoutMock, console, Math: M };
  const ctx = vm.createContext(sandbox);
  const patches = opts.patch || [], applied = [];
  const src = FILES.map(f => { let s = fs.readFileSync(path.join(root, f), 'utf8');
    patches.forEach(([file, from, to], i) => { if (file !== f) return; const n = s.split(from).length - 1; if (n !== 1) throw new Error(`patch #${i} (${file}) 일치 ${n}회: ${String(from).slice(0, 60)}`); s = s.replace(from, () => to); applied.push(i); });
    return s; }).join('\n;\n');
  if (applied.length !== patches.length) throw new Error('적용되지 않은 patch 가 있음');
  vm.runInContext(src, ctx, { filename: 'game.js' });
  const G = code => vm.runInContext(code, ctx);
  return { ctx, G, S: () => G('S'), calls: () => calls, rng: () => ({ state, calls }), counter, els, el: id => document.getElementById(id), timers, cleared,
    runTimer: i => { const t = timers.splice(i === undefined ? 0 : i, 1)[0]; if (!t) throw new Error('타이머 없음'); return t.fn(); },
    buttons: () => document.getElementById('choices').kids.slice(),
    dom: () => JSON.stringify(['choices', 'log', 'stats', 'abil', 'familia', 'inventory', 'relations'].map(id => { const e = document.getElementById(id); return [id, e.html, e.textContent, e.kids.map(k => [k.textContent, k.html, k.className])]; })) };
}

function makeReporter() {
  const out = []; let failed = 0, total = 0;
  const check = (id, c, d) => { total++; if (!c) failed++; out.push((c ? 'PASS ' : 'FAIL ') + id + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); return !!c; };
  const test = (id, fn) => { try { fn(); } catch (e) { total++; failed++; out.push('FAIL ' + id + ' — 예외 ' + String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
  const finish = name => { console.log(out.join('\n')); console.log(`RESULT: ${failed ? 'FAIL' : 'PASS'} ${total - failed}/${total}` + (name ? ' (' + name + ')' : '')); process.exitCode = failed ? 1 : 0; };
  return { check, test, finish, stats: () => ({ failed, total }) };
}
const setAge = (s, a) => { s.age = a; s.chronologicalAge = a; s.phase = a; s.physicalAge = a; };
// S 전체 비교용 직렬화. exclude 의 최상위 필드는 뺀다. 키 순서는 고정(정렬)해서 필드 존재 여부·값을 모두 비교한다.
function snap(s, exclude = []) {
  const norm = v => v === undefined ? '__undefined__' : (typeof v === 'number' && !Number.isFinite(v)) ? '__' + String(v) + '__' : v;
  const walk = v => Array.isArray(v) ? v.map(walk) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => { o[k] = walk(v[k]); return o; }, {}) : norm(v);
  const top = {}; Object.keys(s).sort().forEach(k => { if (!exclude.includes(k)) top[k] = walk(s[k]); });
  return JSON.stringify(top);
}
module.exports = { makeCtx, makeReporter, setAge, snap, FILES, GAME_ROOT };
