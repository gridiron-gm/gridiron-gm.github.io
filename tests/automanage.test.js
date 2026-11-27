// Auto-manage offseason: your best expiring players are re-signed FIRST (starters and anyone 75+ under 31, at
// their asking price, keeping room to fill 53), then free agency, the draft and final cuts; you take over at
// week 1. Also checks league-wide re-signing: about half of good young players stay (real 2026 class: 51%),
// and at most ~10% are still unsigned after free agency.
// Run: node tests/automanage.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const stay = [], unsigned = [];
for (const [team, seed] of [['NE', 42], ['NE', 7], ['NE', 123], ['KC', 5]]) {
  const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
    if (/^(00|05|10|20|30|40|50|55)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
  ctx.DATA = data;
  const run = c => vm.runInContext(c, ctx);
  const label = `${team} seed ${seed}`;
  run(`newGame(DATA, "${team}", ${seed}, "current"); reindex(); var g = 0; while (S.phase !== "resign" && g++ < 80) advance();`);
  ok(`${label}: the 2027 offseason starts after the real-and-simulated 2026 season`, run('S.phase') === 'resign' && run('S.year') === 2027);
  // the players auto-manage should keep: starters at their position and anyone 75+ under 31
  const core = run(`(function(){ var U = S.user; return S.players.filter(function (p) { return p.rights === U && !p.team; }).filter(function (p) {
      return (p.ovr >= 75 && p.age < 31) || roster(U).filter(function (q) { return q.pos === p.pos && q.ovr > p.ovr; }).length < Market.STARTERS[p.pos]; })
      .map(function (p) { return { id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, age: p.age, young: p.ovr >= 75 && p.age < 31 }; }); })()`);
  // league-wide re-signing in this offseason (AI teams; your team is the auto-managed one)
  const goodYoung = run('S.players.filter(function (p) { return p.rights && p.rights !== S.user && !p.team && p.ovr >= 75 && p.age < 31; }).map(function (p) { return [p.id, p.rights]; })');
  run('var SUM = autoManageOffseason();');
  const st = run(`({ phase: S.phase, week: S.week, auto: !!S.autopilot, n: roster(S.user).length, room: fullSpace(S.user),
    sizes: TEAMS.map(function (t) { return roster(t.abbr).length; }), over: TEAMS.filter(function (t) { return fullSpace(t.abbr) < 0; }).map(function (t) { return t.abbr; }),
    kept: SUM.resigned, drafted: SUM.drafted.length })`);
  ok(`${label}: stops at week 1 and hands you the team`, st.phase === 'season' && st.week === 0 && !st.auto);
  ok(`${label}: your roster is at 53, under the cap with every contract counted`, st.n === 53 && st.room >= 0, st.n + ' players, room ' + st.room);
  ok(`${label}: every team is at 53 and under the cap`, st.sizes.every(n => n === 53) && st.over.length === 0, st.sizes.join(',') + ' ' + st.over.join(','));
  const young = core.filter(p => p.young), keptYoung = young.filter(p => st.kept.includes(p.id));
  ok(`${label}: keeps every good young starter (75+, under 31)`, keptYoung.length === young.length, young.filter(p => !st.kept.includes(p.id)).map(p => p.name).join(', '));
  console.log(`  ${label}: re-signed ${st.kept.filter(id => core.some(p => p.id === id)).length} of ${core.length} expiring starters / 75+ under 31 (the rest didn't fit with room to fill 53)`);
  ok(`${label}: still drafts`, st.drafted > 0);
  const stayed = run(`(function(){ var b = ${JSON.stringify(goodYoung)}; return { stay: b.filter(function (x) { return P(x[0]) && P(x[0]).team === x[1]; }).length, uns: b.filter(function (x) { return P(x[0]) && !P(x[0]).team && !P(x[0]).retired; }).length, n: b.length }; })()`);
  stay.push(stayed.stay / stayed.n); unsigned.push(stayed.uns / stayed.n);
  console.log(`  ${label}: kept ${run('SUM.resigned.map(function (id) { var p = P(id); return p.name + " (" + p.pos + " " + p.ovr + ", " + fmtM(Cap.capHit(p, S.year)) + ")"; }).join(", ")')}; ` +
    `league: ${stayed.stay}/${stayed.n} good young players stayed (${Math.round(stayed.stay / stayed.n * 100)}%), ${stayed.uns} unsigned`);
}
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
ok(`league: about half of good young expiring players stay (avg ${Math.round(avg(stay) * 100)}%, target 50-60%, real 2026 class 51%)`, avg(stay) >= 0.45 && avg(stay) <= 0.65);
ok(`league: at most ~10% are still unsigned after free agency (avg ${Math.round(avg(unsigned) * 100)}%)`, avg(unsigned) <= 0.10);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
