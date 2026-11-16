// League-level rules: fifth-year option flow, top-51 in the offseason, rating changes for your players.
// Run: node tests/league.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON };
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|10|20|30|40|50)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const run = code => vm.runInContext(code, ctx);
let pass = 0, fail = 0;
const ok = (l, c) => { if (c) pass++; else { fail++; console.log('  FAIL', l); } };

run('newGame(DATA, "NE"); reindex();');

// ---------- fifth-year option ----------
const maye = run('(function(){ var p = S.players.filter(function(p){return p.name==="Drake Maye"})[0]; return { id: p.id, info: fifthYearInfo(p) }; })()');
ok('Maye has an open option decision in the 2027 re-sign window', maye.info && maye.info.open && maye.info.year === 2028);
ok('Maye tier: 1 original-ballot Pro Bowl (override: 2024 was as an alternate)', maye.info.tier === 1);
console.log('  Maye 2028 option:', run(`fmtM(${maye.info.amount})`), '-', maye.info.label);
run('advance(); for (var i = 0; i < 6; i++) advance();');               // through free agency to the draft
ok('in the draft phase', run('S.phase') === 'draft');
run('draftUntilUser(true);');
ok('cannot leave the draft with the option undecided', /fifth-year option/.test(run('canAdvance()') || ''));
const others = run('TEAMS.filter(function(t){return t.abbr!=="NE"}).reduce(function(n,t){return n + pendingOptions(t.abbr).length;}, 0)');
ok('other teams have 2024 first-rounders to decide on', others > 10);
run(`decideFifthYear(P("${maye.id}"), true);`);
ok('exercised: 2028 row, fully guaranteed', run(`(function(){ var r = Cap.row(P("${maye.id}"), 2028); return !!r && r.gtd === r.cap && r.cap > 0; })()`));
ok('window closes for him after deciding', !run(`fifthYearInfo(P("${maye.id}"))`));
run('advance();');                                                       // leave the draft: AI decides
ok('moved to preseason', run('S.phase') === 'preseason');
ok('every AI team decided', run('TEAMS.every(function(t){ return pendingOptions(t.abbr).length === 0 })'));
const ex = run('S.players.filter(function(p){return p.fifth==="exercised"}).length'), de = run('S.players.filter(function(p){return p.fifth==="declined"}).length');
console.log('  2024 class options: ' + ex + ' exercised, ' + de + ' declined');
ok('AI both exercises and declines', ex > 3 && de > 0);

// ---------- top-51 ----------
ok('preseason counts the top 51', run('top51(S.year)') === true);
const t51 = run(`(function(){ userAutoRoster(); var n = roster("NE").length; return { n: n, top: committed("NE"), all: Cap.teamCommitted(S.players, T("NE"), S.year, false) }; })()`);
ok('with ' + t51.n + ' players, top-51 commitment <= full commitment', t51.top <= t51.all && (t51.n <= 51 || t51.top < t51.all));
run('userAutoRoster(); advance();');
ok('regular season: every contract counts', run('S.phase') === 'season' && run('top51(S.year)') === false && run('committed("NE")') === run('Cap.teamCommitted(S.players, T("NE"), S.year, false)'));
ok('future years still use top 51', run('top51(S.year + 1)') === true);
ok('AI teams are cap compliant with every contract counted', run('TEAMS.every(function(t){ return t.abbr === "NE" || space(t.abbr) >= 0 })'));

// ---------- your players' ratings: aging and performance only ----------
run('while (S.phase === "season") advance(); while (!S.playoffs.champ) advance();');
const before = run('(function(){ var o = {}; roster("NE").forEach(function(p){ o[p.id] = { ovr: p.ovr, age: p.age, pos: p.pos, pot: p.pot, trait: p.trait }; }); return o; })()');
const perf = run('performanceDeltas()');
run('endOfYear();');
let checked = 0, bad = 0;
for (const [id, b] of Object.entries(before)) {
  const p = run(`(function(){ var p = P("${id}"); return p && !p.retired ? { ovr: p.ovr } : null; })()`);
  if (!p) continue;
  const pf = perf[id] || 0;
  const d = run(`progressDelta({ pos: "${b.pos}", age: ${b.age}, ovr: ${b.ovr}, pot: ${b.pot}, trait: "${b.trait}" }, ${pf})`);
  const want = Math.max(30, Math.min(99, Math.round(b.ovr + d)));
  checked++; if (p.ovr !== want) bad++;
}
ok(`all ${checked} of your players moved exactly by age + trait + performance`, checked > 30 && bad === 0);
const flat = run('(function(){ var p = { pos: "WR", age: 29, ovr: 80, pot: 82, exp: 6, trait: "Normal" }; progress(p, 0); return p.ovr; })()');
ok('prime-age player with average performance stays put', flat === 80);
const old = run('(function(){ var p = { pos: "RB", age: 30, ovr: 85, pot: 85, exp: 8 }; progress(p, 0); return p.ovr; })()');
ok('30-year-old RB declines with age', old < 85);
const good = run('(function(){ var p = { pos: "WR", age: 27, ovr: 80, pot: 82, exp: 5 }; progress(p, 5); return p.ovr; })()');
ok('a big season raises a prime player', good > 80);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
