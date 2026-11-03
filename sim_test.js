const fs = require('fs');
const mk = () => ({ classList: { add() {}, remove() {} }, appendChild(c) { this.kids = (this.kids || []); this.kids.push(c); }, scrollIntoView() {},
    set innerHTML(v) { this.kids = []; }, get innerHTML() { return ''; }, querySelectorAll() { return this.kids || []; }, addEventListener() {}, click() {},
    checked: true, isConnected: false, set innerText(v) {}, set textContent(v) {} });
const els = {};
global.document = { getElementById: id => els[id] || (els[id] = mk()), createElement: () => mk(), querySelectorAll: () => [] };
global.window = { scrollTo() {}, toggleEquip: () => {}, useItem: () => {} }; global.setTimeout = (f, t) => { if(t===400 || t===600 || t===800) {} else f(); };
const code = ['data.js', 'events.js', 'script.js'].map(f => fs.readFileSync('danmachi_sim_workspace/' + f, 'utf8')).join('\n');
new Function(code + `
const N = 3000; let cur, errs = 0, nan = 0, nat = 0, debt = 0; const seen = {}, lv = {}, evLife = [], uniq = [], rep = [], ages = [];
let jobMismatch = 0, itemUsed = 0, relationsCreated = 0, relDied = 0, falnaBeforeDungeon = 0;

// Override match to intercept and check conditions
const origMatch = match;
match = function(c) {
    if (!c) return origMatch(c);
    // test for dungeon event without falna
    if (c.job && (Array.isArray(c.job) ? c.job : [c.job]).includes('adventurer')) {
        if (!S.flags.includes('falna') && !c.hasFamilia && c.flags && !c.flags.includes('falna')) {
             // Wait, the events are now required to have flags: ['falna']
        }
    }
    return origMatch(c);
};

const orig = showEvent; showEvent = function (e) {
  cur.push(e.id);
  if (e.cond && e.cond.job && !(Array.isArray(e.cond.job) ? e.cond.job : [e.cond.job]).includes(S.job)) jobMismatch++;
  if (e.cond && e.cond.job && (Array.isArray(e.cond.job) ? e.cond.job : [e.cond.job]).includes('adventurer')) {
      if (!S.flags.includes('falna')) falnaBeforeDungeon++;
  }
  return orig(e);
};
let completedLives = 0;
for (let i = 0; i < N; i++) {
  try {
    cur = []; startLife(); let g = 0;
    while (!S.cause && g++ < 1500) { 
      const bs = $('choices').kids || []; 
      if (bs.length > 0 && bs[0].onclick) {
          bs[Math.floor(Math.random() * bs.length)].onclick(); 
      } else {
          break; 
      }
      
      if (S.inventory && S.inventory.length > 0 && Math.random() < 0.1) {
          const idx = Math.floor(Math.random() * S.inventory.length);
          const inv = S.inventory[idx];
          if (inv) {
              const it = gachaData.items.find(x => x.id === inv.id);
              if (it && (it.type === 'weapon' || it.type === 'armor')) window.toggleEquip(idx);
              else if (it && it.type === 'consumable') { window.useItem(idx); itemUsed++; }
          }
      }
    }
    if (!S.cause) {
       S.cause = 'infinite loop'; 
    } else {
       completedLives++;
    }
    if (S.cause && S.cause.includes('긴 생')) nat++;
    if (Number.isNaN(S.power) || Number.isNaN(S.hp) || Number.isNaN(S.valis)) nan++;
    if (S.valis === 0) debt++;
    if (S.flags.includes('adventurer')) lv[S.level] = (lv[S.level] || 0) + 1;
    relationsCreated += S.relations.length;
    relDied += S.relations.filter(r => !r.alive).length;

    const c = {}; cur.forEach(x => { c[x] = (c[x] || 0) + 1; seen[x] = (seen[x] || 0) + 1; });
    evLife.push(cur.length); uniq.push(Object.keys(c).length); rep.push(Object.keys(c).length ? Math.max(...Object.values(c)) : 0); ages.push(S.age);
  } catch (e) { errs++; console.log('ERR at life ' + i + ':', e.message, e.stack); if (errs > 3) break; }
}
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
console.log('lives completed', completedLives, '/', N, '| errors', errs, '| NaN', nan);
console.log('avg events/life', avg(evLife), '| avg unique events/life', avg(uniq), '| avg max repeat of one event', avg(rep));
console.log('avg death age', avg(ages), '| natural-death %', (nat / N * 100).toFixed(0));
console.log('adventurer levels', JSON.stringify(lv));
console.log('job/event mismatches:', jobMismatch, '| dungeon events without falna:', falnaBeforeDungeon);
console.log('Relations created:', relationsCreated, '| Relations died:', relDied);
console.log('Items used:', itemUsed, '| Zero valis (debt/starvation):', debt);
if (errs > 0 || nan > 0 || jobMismatch > 0 || falnaBeforeDungeon > 0) {
    console.error("TEST FAILED");
    process.exit(1);
} else {
    console.log("TEST PASSED");
}
`)();