// Headless league sim: several seasons with the user team on autopilot. Run: node tests/sim.test.js [seasons]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON };
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort()) {
  if (/^(00|10|20|30|40|50)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
}
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const seasons = +process.argv[2] || 3;
let fail = 0;
const check = (l, c) => { if (!c) { fail++; console.log('  FAIL', l); } };
vm.runInContext("newGame(DATA, \"NE\"); reindex(); S.autopilot = true; S.freezePay = FREEZE;", Object.assign(ctx, { DATA: data, FREEZE: process.argv[3] === "freeze" }));
const t0 = Date.now();
for (let s = 0; s < seasons; s++) {
  const out = vm.runInContext(`(function(){
    var log = [];
    var y = S.year, guard = 0;
    while (S.year === y && guard++ < 200) {
      if (S.phase === 'preseason') userAutoRoster();
      if (S.phase === 'draft') draftUntilUser(true);
      var r = advance();
      if (!r.ok) { log.push('blocked: ' + r.msg); userAutoRoster(); aiCapFix(S.user, 6000); if (space(S.user) < 0) { var c = roster(S.user).sort(byKey(function(p){return -Cap.capHit(p,S.year)}))[0]; release(c,true);} }
      if (S.phase === 'season' && S.week === 1) {
        log.push('rosters ' + TEAMS.map(function(t){return roster(t.abbr).length}).join(','));
        var over = TEAMS.filter(function(t){return space(t.abbr) < 0}).map(function(t){return t.abbr + ' ' + fmtM(space(t.abbr))});
        log.push('over cap: ' + (over.join('; ') || 'none'));
        log.push('payScale ' + S.payScale.toFixed(2) + ' week 1 avg space ' + fmtM(sumBy(TEAMS,function(t){return space(t.abbr)})/32) + ', 80+ rostered ' + S.players.filter(function(p){return p.team && p.ovr>=80}).length + ', 80+ unsigned ' + freeAgents().filter(function(p){return p.ovr>=80}).length + ', 80+ total ' + S.players.filter(function(p){return !p.retired && !p.prospect && p.ovr>=80}).length + ' (start ' + sumBy(POSITIONS,function(q){return S.target80[q]}) + ')');
      }
    }
    var h = S.history[S.history.length-1];
    var top = TEAMS.map(function(t){return [t.abbr, teamRating(t.abbr).ovr]}).sort(function(a,b){return b[1]-a[1]}).slice(0,3);
    return { log: log, h: h, players: S.players.length, fa: freeAgents().length, top: top, neSpace: fmtM(space('NE')), year: S.year,
             nan: S.players.some(function(p){return isNaN(p.ovr) || p.years.some(function(r){return isNaN(r.cap)})}),
             rosterBad: TEAMS.filter(function(t){var n = roster(t.abbr).length; return n > 90}).length,
             saveKB: Math.round(JSON.stringify(S).length/1024), avgSpace: fmtM(sumBy(TEAMS,function(t){return space(t.abbr)})/32), avgOvr: Math.round(sumBy(TEAMS,function(t){return teamRating(t.abbr).ovr})/32), n80: S.players.filter(function(p){return p.team && p.ovr>=80}).length, gen: S.players.filter(function(p){return p.team && p.gen}).length };
  })()`, ctx);
  console.log(`Season ${out.h.year}: champ ${out.h.champ}, NE ${out.h.rec} (${out.h.userFinish}), MVP ${out.h.mvp}`);
  out.log.forEach(l => console.log('   ', l));
  console.log(`    avg space ${out.avgSpace}, avg team ovr ${out.avgOvr}, rostered 80+ ${out.n80}, generated rostered ${out.gen}`);
  console.log(`    players ${out.players}, FAs ${out.fa}, top teams ${JSON.stringify(out.top)}, NE space ${out.neSpace}, save ${out.saveKB} KB`);
  check('no NaN', !out.nan);
  check('rosters <= 90', out.rosterBad === 0);
  check('champion crowned', !!out.h.champ);
}
console.log(`${seasons} seasons in ${Date.now() - t0} ms; ${fail} failures`);
process.exit(fail ? 1 : 0);
