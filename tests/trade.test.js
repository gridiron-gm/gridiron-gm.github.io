// AI trade valuation: quality beats quantity. Run: node tests/trade.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|10|20|30|40|50)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const run = c => vm.runInContext(c, ctx);
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };

run(`newGame(DATA, "NE", 42); reindex();
  var STARS = S.players.filter(function (p) { return p.team && p.team !== 'NE' && p.ovr >= 90; }).sort(byKey(function (p) { return p.ovr; }, true)).slice(0, 20);
  var DEPTH = roster('NE').filter(function (p) { return p.ovr < 80; }).sort(byKey(function (p) { return assetValue('NE', [p], []); }, true));
  var LATE = picksOf('NE').filter(function (k) { return k.round >= 4; }).map(function (k) { return k.id; });
  var FIRSTS = picksOf('NE').filter(function (k) { return k.round === 1; }).map(function (k) { return k.id; });
  var SECOND = picksOf('NE').filter(function (k) { return k.round === 2 && k.year === S.year; }).map(function (k) { return k.id; });
  var MAYE = S.players.filter(function (p) { return p.name === 'Drake Maye'; })[0];`);
ok('20 AI players rated 90+ to test against', run('STARS.length') === 20);

// 1. piles of sub-80 players plus late picks never buy a star (rejected on value, not just cap)
const piles = run(`STARS.map(function (st, i) {
  var n = 3 + (i % 3);
  var give = { players: DEPTH.slice(0, n).map(function (p) { return p.id; }), picks: LATE.slice(0, 4) };
  var ev = aiTradeEval(st.team, give, { players: [st.id], picks: [] });
  return { star: st.name + ' ' + st.ovr, n: n, accept: ev.accept, ratio: ev.ratio, get: Math.round(ev.get), need: Math.round(ev.give) };
})`);
piles.forEach(x => ok(`${x.n} sub-80 players + 4 late picks for ${x.star} rejected (value or quality, not just cap)`, !x.accept && x.ratio < 1, JSON.stringify(x)));
console.log('  example rejected: ' + piles[1].n + ' players under 80 + 4 late picks for ' + piles[1].star + ': AI values the package at ' + run(`fmtM(${piles[1].get})`) + ' vs ' + run(`fmtM(${piles[1].need})`) + ' for what it gives up');

// 2. consolidation and star premium
ok('star premium: one 95 is worth more than two 82s', run(`Market.starValue('CB', 95, 326900) > 2 * Market.starValue('CB', 82, 326900)`));
ok('many late picks never add up to a first', run(`(function () {
  var st = STARS[10]; var late = aiTradeEval(st.team, { players: [], picks: LATE }, { players: [st.id], picks: [] });
  var one = aiTradeEval(st.team, { players: [], picks: FIRSTS.slice(0, 1) }, { players: [st.id], picks: [] });
  return late.get < one.get; })()`));
ok('adding backups to a package lowers its value (roster spots, near-zero depth)', run(`(function () {
  var st = STARS[3], top3 = DEPTH.slice(0, 3).map(function (p) { return p.id; });
  var scrubs = roster('NE').filter(function (p) { return p.ovr < 70 && top3.indexOf(p.id) < 0; }).slice(0, 2).map(function (p) { return p.id; });
  var a = aiTradeEval(st.team, { players: top3, picks: [] }, { players: [st.id], picks: [] });
  var b = aiTradeEval(st.team, { players: top3.concat(scrubs), picks: [] }, { players: [st.id], picks: [] });
  return b.get < a.get; })()`));
ok('quality gate: a star is only traded for a comparable player or a first-round pick', run(`(function () {
  var st = STARS[0]; var e = aiTradeEval(st.team, { players: DEPTH.slice(0, 5).map(function (p) { return p.id; }), picks: LATE }, { players: [st.id], picks: [] });
  return e.gate === false; })()`));

// 3. fair deals still work
const starForStar = run(`STARS.filter(function (st) { return aiTradeEval(st.team, { players: [MAYE.id], picks: [] }, { players: [st.id], picks: [] }).accept; }).map(function (p) { return p.name + ' (' + p.pos + ' ' + p.ovr + ')'; })`);
ok('star for star: Drake Maye can be traded for a 90+ star', starForStar.length > 0);
console.log('  example accepted: Drake Maye for ' + starForStar[0]);
const forPicks = run(`S.players.filter(function (p) { return p.team && p.team !== 'NE' && p.ovr >= 88 && p.pos !== 'QB'; }).filter(function (st) {
  return aiTradeEval(st.team, { players: [], picks: FIRSTS.slice(0, 2).concat(SECOND) }, { players: [st.id], picks: [] }).accept; }).length`);
ok(`star for first-round picks: two 1sts + a 2nd buys some 88+ players (${forPicks})`, forPicks > 5);

// 4. "What would it take?" never proposes backups
const wwit = run(`STARS.map(function (st) { var w = whatWouldItTake(st.team, { players: DEPTH.slice(0, 4).map(function (p) { return p.id; }), picks: [] }, { players: [st.id], picks: [] }); return w.options || []; })`);
const badSuggestions = wwit.flat().filter(o => o.kind === 'player' && run(`(function(){ var p = P("${o.id}"); return p.ovr < 70; })()`));
ok('"What would it take?" never suggests a player under 70', badSuggestions.length === 0, JSON.stringify(badSuggestions));
ok('"What would it take?" suggests one asset at a time (never a pile)', wwit.every(opts => opts.every(o => o.kind === 'player' || o.kind === 'pick')));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
