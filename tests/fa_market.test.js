// Year-1 asks vs real 2026 free agency (held out: no 2026 deal is an input to market value).
// Targets: median ask/real in [0.85, 1.15], at least 45% within +-30%; top 25 deals by APY: median in [0.8, 1.2].
// The market model is frozen: these deals are a test set, not something to tune against. Run: node tests/fa_market.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|10|20|30|40|50)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx);
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
ctx.HOLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fa_holdout_2026.json'), 'utf8'));
const res = vm.runInContext(`newGame(DATA, 'NE', 1); reindex();
  HOLD.map(function (h) { var p = P(h.id), d = Market.demand(p, marketCap(), S.year);
    return { h: h, p: { name: p.name, pos: p.pos, ovr: p.ovr }, d: { years: d.years, apy: d.apy, gtd: d.gtd }, ratio: (d.apy / capOf(S.year)) / h.share }; })`, ctx);
const cap = vm.runInContext('capOf(S.year)', ctx);
const r = res.map(x => x.ratio).sort((a, b) => a - b);
const median = r[Math.floor(r.length / 2)], w30 = r.filter(x => x >= 0.7 && x <= 1.3).length / r.length;
const M = k => '$' + (k / 1000).toFixed(1) + 'M';
const show = ['Jaelan Phillips', 'Tyler Linderbaum', 'Malik Willis', 'Romeo Doubs', 'Kenneth Walker III'];
console.table(res.filter(x => show.includes(x.p.name)).map(x => ({ player: x.p.name, pos: x.p.pos, ovr: x.p.ovr,
  real: `${x.h.years}y $${x.h.total}M ($${x.h.gtd}M gtd)`, realShare: (x.h.share * 100).toFixed(1) + '%',
  ask: `${x.d.years}y ${M(x.d.apy * x.d.years)} (${M(x.d.gtd)} gtd)`, askShare: (x.d.apy / cap * 100).toFixed(1) + '%',
  diff: Math.round((x.ratio - 1) * 100) + '%' })));
console.log(`${r.length} held-out 2026 UFA deals: median ask/real ${median.toFixed(2)} (target 0.85-1.15), within +-30%: ${r.filter(x => x >= 0.7 && x <= 1.3).length}/${r.length} = ${Math.round(w30 * 100)}% (target >= 45%)`);
const top = res.slice().sort((a, b) => b.h.share - a.h.share).slice(0, 25);
console.table(top.map(x => ({ player: x.p.name, pos: x.p.pos, ovr: x.p.ovr, realAPY: '$' + (x.h.total / x.h.years).toFixed(1) + 'M', realShare: (x.h.share * 100).toFixed(1) + '%',
  askShare: (x.d.apy / cap * 100).toFixed(1) + '%', diff: Math.round((x.ratio - 1) * 100) + '%' })));
const tr = top.map(x => x.ratio).sort((a, b) => a - b), tmed = (tr[12]);
console.log(`top 25 by APY: median ask/real ${tmed.toFixed(2)} (target 0.8-1.2), within +-30%: ${tr.filter(x => x >= 0.7 && x <= 1.3).length}/25`);
let fail = 0;
if (!(median >= 0.85 && median <= 1.15)) { fail++; console.log('  FAIL median'); }
if (!(w30 >= 0.45)) { fail++; console.log('  FAIL within 30%'); }
if (!(tmed >= 0.8 && tmed <= 1.2)) { fail++; console.log('  FAIL top-25 median'); }
process.exit(fail ? 1 : 0);
