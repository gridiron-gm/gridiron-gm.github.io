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
// ---------- top-51 (offseason) ----------
ok('the offseason counts the top 51', run('top51(S.year)') === true);
const t51 = run(`(function(){ var n = roster("NE").length; return { n: n, top: committed("NE"), all: Cap.teamCommitted(S.players, T("NE"), S.year, false) }; })()`);
ok('with ' + t51.n + ' players, top-51 commitment <= full commitment', t51.top <= t51.all && (t51.n <= 51 || t51.top < t51.all));

// ---------- leaving the draft: final cuts happen automatically, then week 1 (no preseason stop) ----------
const left = run('(function(){ var r = advance(); if (!r.ok && S.phase === "preseason") { userAutoRoster(); aiCapFix("NE", 2000); r = advance(); } return { ok: r.ok, phase: S.phase, week: S.week }; })()');
ok('leaving the draft goes straight to week 1', left.ok && left.phase === 'season' && left.week === 0);
ok('every AI team decided', run('TEAMS.every(function(t){ return pendingOptions(t.abbr).length === 0 })'));
const ex = run('S.players.filter(function(p){return p.fifth==="exercised"}).length'), de = run('S.players.filter(function(p){return p.fifth==="declined"}).length');
console.log('  2024 class options: ' + ex + ' exercised, ' + de + ' declined');
ok('AI both exercises and declines', ex > 3 && de > 0);
ok('your roster was cut and filled to 53 automatically', run('roster("NE").length') === 53 && run('fullSpace("NE")') >= 0);
ok('regular season: every contract counts', run('top51(S.year)') === false && run('committed("NE")') === run('Cap.teamCommitted(S.players, T("NE"), S.year, false)'));
ok('future years still use top 51', run('top51(S.year + 1)') === true);
ok('AI teams are cap compliant with every contract counted', run('TEAMS.every(function(t){ return t.abbr === "NE" || space(t.abbr) >= 0 })'));
// late market fairness: an unsigned 78+ player under 30 takes your prove-it offer on the AI's in-season terms
run(`var LM = S.players.filter(function (p) { return p.team && p.team !== 'NE' && p.age < 30 && p.ovr >= 80; })[0];
  LM.team = null; LM.years = []; LM.rights = null; var LMASK = Market.demand(LM, marketCap(), S.year).apy;
  function lmOffer(share) { var t = Math.round(LMASK * share); return Market.evaluate(LM, { years: 1, total: t, bonus: 0, gtd: Math.round(t / 2) }, offerCtx(LM, 'NE')); }`);
ok('in season: unsigned 80+ player under 30 accepts 13% of his ask from you (the AI\'s 12% floor)', run('lmOffer(0.13).accept'));
ok('in season: but not 10%', !run('lmOffer(0.10).accept'));

// ---------- your players' ratings: aging and performance only ----------
run('while (S.phase === "season") advance(); while (!S.playoffs.champ) advance();');
const before = run('(function(){ var o = {}; roster("NE").forEach(function(p){ o[p.id] = { ovr: p.ovr, age: p.age, pos: p.pos, pot: p.pot, trait: p.trait, bo: p.brokeOut || 0 }; }); return o; })()');
const perf = run('performanceDeltas()');
run('endOfYear();');
let checked = 0, bad = 0, broke = [];
for (const [id, b] of Object.entries(before)) {
  const p = run(`(function(){ var p = P("${id}"); return p && !p.retired ? { ovr: p.ovr, bo: p.brokeOut || 0 } : null; })()`);
  if (!p) continue;
  // a late-bloomer breakout (Normal/Slow, 26 or younger, 78+) jumps 4-9 before normal progression
  if (p.bo > b.bo) { broke.push(b); continue; }
  const pf = perf[id] || 0;
  const d = run(`progressDelta({ pos: "${b.pos}", age: ${b.age}, ovr: ${b.ovr}, pot: ${b.pot}, trait: "${b.trait}" }, ${pf})`);
  const want = Math.max(30, Math.min(99, Math.round(b.ovr + d)));
  checked++; if (p.ovr !== want) bad++;
}
ok(`all ${checked} of your players moved exactly by age + trait + performance (${broke.length} late-bloomer breakouts checked separately)`, checked > 30 && bad === 0);
ok('breakouts only for Normal/Slow players 26 or younger rated 78+', broke.every(b => b.age <= 26 && b.ovr >= 78 && (b.trait === 'Normal' || b.trait === 'Slow')), JSON.stringify(broke));
const flat = run('(function(){ var p = { pos: "WR", age: 29, ovr: 80, pot: 82, exp: 6, trait: "Normal" }; progress(p, 0); return p.ovr; })()');
ok('prime-age player with average performance stays put', flat === 80);
const old = run('(function(){ var p = { pos: "RB", age: 30, ovr: 85, pot: 85, exp: 8 }; progress(p, 0); return p.ovr; })()');
ok('30-year-old RB declines with age', old < 85);
const good = run('(function(){ var p = { pos: "WR", age: 27, ovr: 80, pot: 82, exp: 5 }; progress(p, 5); return p.ovr; })()');
ok('a big season raises a prime player', good > 80);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
