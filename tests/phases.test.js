// Phase gating with four destinations (Home, Team, Moves, League) and no preseason stop.
// Plays a real Patriots season (seed 42) through every phase and checks what the UI actually renders:
// the 4-item nav, the Moves and League toggles, every open screen, and player-card actions.
// Run: node tests/phases.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|05|10|20|30|40|50|55|6\d)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const run = c => vm.runInContext(c, ctx);
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const strip = h => String(h).replace(/<[^>]+>/g, ' ');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const LEAGUE = ['standings', 'schedule', 'leaders', 'news', 'history'];
const EXPECT = {   // key -> [moves, extra league screens]
  resign: [['resign', 'trade'], ['prospects']],
  fa: [['fa', 'trade'], ['prospects']],
  draft: [['trade', 'draft'], []],
  preseason: [['fa', 'trade', 'cuts'], []],          // only while final cuts are stuck
  'season:0': [['fa', 'trade'], []], 'season:9': [['fa', 'trade'], []], 'season:10': [['fa'], []], 'season:12': [['fa'], ['prospects']],
  playoffs: [[], ['bracket', 'prospects']],
};

// 1. the rules
for (const [k, [moves, extra]] of Object.entries(EXPECT)) {
  const [ph, wk] = k.split(':');
  ok(`${k}: Moves = ${moves.join(', ') || 'none'}`, eq(run(`movesFor("${ph}", ${wk || 0})`), moves), JSON.stringify(run(`movesFor("${ph}", ${wk || 0})`)));
  ok(`${k}: League = standings…history${extra.length ? ' + ' + extra.join(', ') : ''}`, eq(run(`leagueFor("${ph}", ${wk || 0})`), LEAGUE.concat(extra)));
}
ok('the timeline has five phases (no preseason)', eq(run('TIMELINE.map(function(t){return t[0]})'), ['resign', 'fa', 'draft', 'season', 'playoffs']));
ok('final cuts show as part of the draft step', run('timeline("preseason", 0)').filter(t => t.state === 'now')[0].key === 'draft');
ok('Make room exists only while final cuts are stuck', ['resign', 'fa', 'draft', 'season', 'playoffs'].every(ph => !run(`movesFor("${ph}", 0)`).includes('cuts')));

// 2. a real season
run('newGame(DATA, "NE", 42); reindex();');
const dests = h => [...h.matchAll(/data-act="dest" data-d="([a-z]+)"/g)].map(m => m[1]);
const segsOf = h => { const m = /<div class="segs"[^>]*>(.*?)<\/div>/.exec(h); return m ? [...m[1].matchAll(/data-v="([a-z]+)"/g)].map(x => x[1]) : []; };
function check(label, key) {
  const [moves, extra] = EXPECT[key];
  ok(`${label}: top bar has exactly Home, Team, Moves, League`, eq(dests(run('barHtml()')), ['home', 'team', 'moves', 'league']));
  ok(`${label}: phone bar has the same 4 plus Continue`, eq(dests(run('bbarHtml()')), ['home', 'team', 'moves', 'league']) && /data-act="continue"/.test(run('bbarHtml()')));
  ok(`${label}: Moves badge counts the open moves`, moves.length ? new RegExp('<span class="cnt">' + moves.length + '<').test(run('barHtml()')) : !/class="cnt"/.test(run('barHtml()')));
  ok(`${label}: Team toggle is Roster, Depth chart, Cap`, eq(segsOf(run('VIEWS.roster()')), ['roster', 'depth', 'cap']));
  ok(`${label}: League toggle shows exactly its views`, eq(segsOf(run('VIEWS.standings()')), LEAGUE.concat(extra)));
  for (const v of ['resign', 'fa', 'trade', 'draft', 'cuts']) ok(`${label}: ${v} is ${moves.includes(v) ? 'open' : 'locked'}`, run(`screenOpen("${v}")`) === moves.includes(v));
  for (const v of ['bracket', 'prospects']) ok(`${label}: ${v} is ${extra.includes(v) ? 'open' : 'locked'}`, run(`screenOpen("${v}")`) === extra.includes(v));
  if (moves.length > 1) ok(`${label}: each move screen toggles between exactly the open moves`, moves.every(v => eq(segsOf(run(`VIEWS.${v}()`)), moves)));
  if (moves.length === 1) ok(`${label}: one open move: no toggle, Moves opens it directly`, segsOf(run(`VIEWS.${moves[0]}()`)).length === 0);
  const screens = ['hub', 'roster', 'depth', 'cap', 'moves'].concat(moves, LEAGUE, extra);
  for (const v of screens) {
    let html = '', err = null;
    try { html = run(`VIEWS["${v}"]()`); } catch (e) { err = e.message; }
    ok(`${label}: ${v} renders`, !err && html.length > 50, err);
    ok(`${label}: ${v} has no keyboard hints`, !/\b(press (enter|esc|space)|keyboard|shortcut|hotkey)\b/i.test(strip(html)));
  }
  ok(`${label}: Continue says what it does`, run('continueInfo().sub').length > 3);
  const acts = id => run(`playerActions(P("${id}")).map(function(a){return a[1]})`);
  const other = run('S.players.filter(function(p){return p.team && p.team !== "NE"})[0].id');
  ok(`${label}: "Trade for him" only while trades are open`, acts(other).includes('trade-for') === moves.includes('trade'));
  const mine = run('roster("NE")[0].id');
  ok(`${label}: "Shop in a trade" only while trades are open`, acts(mine).includes('trade-with') === moves.includes('trade'));
  const fa = run('(function(){ var f = freeAgents().filter(function(p){ return S.phase !== "resign" || p.rights !== "NE"; })[0]; return f ? f.id : null; })()');
  if (fa) ok(`${label}: "Make an offer" to other free agents only while free agency is open`, acts(fa).includes('offer') === moves.includes('fa'));
  const card = run(`playerModal("${mine}")()`);
  ok(`${label}: player card renders with tabs and an avatar`, /minitabs/.test(card) && /<svg class="avatar"/.test(card));
}

check('re-sign window', 'resign');
ok('re-sign: Continue warns about unsigned expiring players', run('continueIssues().length') > 0 && /expiring/.test(strip(run('continueIssues()[0].html'))));
const exp = run('S.players.filter(function(p){return p.rights === "NE" && !p.team})[0].id');
ok('re-sign window: your expiring players can be re-signed', run(`playerActions(P("${exp}"))[0][1]`) === 'offer');
const previewNames = run('previewClass().slice(0, 5).map(function(p){return p.name + " " + p.pos})');
run('advance();');
check('free agency', 'fa');
run('while (S.phase === "fa") advance();');
ok('draft class = the class the prospects board showed', eq(previewNames, run('draftPool().slice(0, 5).map(function(p){return p.name + " " + p.pos})')));
check('draft', 'draft');
ok('draft: Continue sims to your pick while picks remain', /pick|draft/i.test(run('continueInfo().sub')));
run('draftUntilUser(true);');
ok('draft done: an undecided fifth-year option blocks Continue', run('continueIssues().some(function(x){return x.block && x.opt})'));
run('pendingOptions("NE").forEach(function(p){ decideFifthYear(p, true); });');
ok('draft done: Continue runs final cuts and starts week 1', /final cuts/i.test(run('continueInfo().sub')));
const r = run('(function(){ var r = advance(); return { ok: r.ok, msg: r.msg || "" }; })()');
ok('leaving the draft goes straight to week 1 (no preseason stop)', r.ok && run('S.phase') === 'season' && run('S.week') === 0, JSON.stringify(r));
ok('week 1: your roster is at 53 and under the cap', run('roster("NE").length') === 53 && run('fullSpace("NE")') >= 0);
check('week 1', 'season:0');
run('while (S.week < 9) advance();');
check('week 10 (last week before the deadline)', 'season:9');
run('advance();');
check('week 11 (after the deadline)', 'season:10');
ok('after the deadline the engine also refuses trades', /deadline/.test(run('(function(){ var ai = aiTeams().filter(function(a){return a!=="NE"})[0]; var mine = roster("NE").sort(byKey(function(p){return Cap.capHit(p,S.year)}))[0], theirs = roster(ai).sort(byKey(function(p){return Cap.capHit(p,S.year)}))[0]; return aiTradeEval(ai, { players: [mine.id], picks: [] }, { players: [theirs.id], picks: [] }).msg || ""; })()')));
run('while (S.week < 12) advance();');
check('week 13 (prospects board opens)', 'season:12');
ok('in-season prospects board shows next year\'s class', run('prospectsYear()') === run('S.year') + 1);
run('while (S.phase === "season") advance();');
check('playoffs', 'playoffs');
ok('playoffs: Moves says nothing is open', /No moves in the playoffs/.test(strip(run('VIEWS.moves()'))));
ok('playoffs: bracket shows both conferences and the Super Bowl', /Wild card/.test(strip(run('VIEWS.bracket()'))) && /Super Bowl/.test(strip(run('VIEWS.bracket()'))));
run('while (!S.playoffs.champ) advance();');
ok('playoffs: bracket names the champion', /Super Bowl champions/.test(strip(run('VIEWS.bracket()'))));
run('advance();');
ok('next offseason: back to the re-sign window', run('S.phase') === 'resign');
check('next re-sign window', 'resign');

// 3. timeline text
const tl = run('timeline("resign", 0)');
ok('timeline: re-sign is now, free agency is next and says when it opens', tl[0].state === 'now' && tl[1].state === 'next' && /after the re-sign window/.test(tl[1].sub));
const tlp = run('timeline("playoffs", 17)');
ok('timeline in the playoffs: the re-sign window opens after the Super Bowl', tlp[0].state === 'next' && /after the Super Bowl/.test(tlp[0].sub));
const tls = run('timeline("season", 4)');
ok('timeline in season: shows the week and the trade deadline', /Week 5/.test(tls[3].sub) && /deadline/.test(tls[3].sub));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
