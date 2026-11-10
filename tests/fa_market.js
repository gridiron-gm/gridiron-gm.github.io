// Report (not pass/fail): game's year-1 asks vs five real 2026 free-agent signings (OverTheCap via nflverse).
// Run: node tests/fa_market.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|10|20|30|40|50)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx);
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
// [gsis, years, total $M, guaranteed $M, APY as share of the 2026 cap]
ctx.REAL = [['00-0036934', 4, 120.0, 60.0, 0.100], ['00-0037825', 3, 81.0, 60.0, 0.090], ['00-0038128', 3, 67.5, 45.0, 0.075],
            ['00-0037816', 4, 68.0, 35.0, 0.056], ['00-0038134', 3, 43.05, 28.7, 0.048]];
const rows = vm.runInContext(`newGame(DATA, 'NE'); reindex();
  REAL.map(function (r) { var p = P(r[0]), d = Market.demand(p, marketCap(), S.year);
    return { player: p.name, pos: p.pos, ovr: p.ovr, real: r[1] + 'y $' + r[2] + 'M ($' + r[3] + 'M gtd)', realShare: (r[4] * 100).toFixed(1) + '%',
             ask: d.years + 'y ' + fmtM(d.apy * d.years) + ' (' + fmtM(d.gtd) + ' gtd)', askShare: (d.apy / capOf(S.year) * 100).toFixed(1) + '%',
             diff: Math.round((d.apy / capOf(S.year) / r[4] - 1) * 100) + '%' }; })`, ctx);
console.table(rows);
console.log('pay multiplier at game start:', vm.runInContext('S.payScale.toFixed(2)', ctx));
