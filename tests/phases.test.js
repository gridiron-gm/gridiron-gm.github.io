// Phase gating: each part of the NFL year shows only the screens usable then, in the nav and in player-card actions.
// Plays a real Patriots season (seed 42) through every phase and checks the navigation the UI actually renders.
// Run: node tests/phases.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|10|20|30|40|50|55|60)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const run = c => vm.runInContext(c, ctx);
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const strip = h => String(h).replace(/<[^>]+>/g, ' ');

const ALWAYS = ['hub', 'roster', 'depth', 'cap', 'league'];
const EXPECT = {
  resign: ['resign', 'trade', 'prospects'],
  fa: ['fa', 'trade', 'prospects'],
  draft: ['draft', 'trade'],
  preseason: ['fa', 'cuts', 'trade'],
  'season:0': ['trade', 'fa'], 'season:9': ['trade', 'fa'], 'season:10': ['fa'], 'season:12': ['fa', 'prospects'], 'season:17': ['fa', 'prospects'],
  playoffs: ['bracket', 'prospects'],
};

// 1. the rules table
for (const [k, want] of Object.entries(EXPECT)) {
  const [ph, wk] = k.split(':');
  const got = run(`screensFor("${ph}", ${wk || 0})`);
  ok(`${k}: screens are ${ALWAYS.concat(want).join(', ')}`, JSON.stringify(got) === JSON.stringify(ALWAYS.concat(want)), JSON.stringify(got));
}

// 2. a real season: the nav the UI renders, every open screen renders, locked screens are unreachable
run('newGame(DATA, "NE", 42); reindex();');
const navOf = () => {
  const tabs = run('tabsHtml()'), bar = run('tabbarHtml()'), more = run('moreHtml()');
  const vs = h => [...h.matchAll(/data-v="([a-z]+)"/g)].map(m => m[1]);
  return { tabs: vs(tabs), phone: [...new Set(vs(bar).concat(vs(more)))] };
};
const ALL_SCREENS = ['hub', 'roster', 'depth', 'cap', 'league', 'resign', 'fa', 'draft', 'prospects', 'cuts', 'trade', 'bracket'];
const LEAGUE = ['standings', 'schedule', 'leaders', 'news', 'history'];
function check(label, key) {
  const want = ALWAYS.concat(EXPECT[key]);
  const nav = navOf();
  ok(`${label}: desktop tabs show exactly its screens`, JSON.stringify(nav.tabs) === JSON.stringify(want), JSON.stringify(nav.tabs));
  ok(`${label}: phone tab bar + More show exactly its screens`, JSON.stringify(nav.phone.slice().sort()) === JSON.stringify(want.slice().sort()), JSON.stringify(nav.phone));
  for (const v of ALL_SCREENS) ok(`${label}: ${v} is ${want.includes(v) ? 'open' : 'locked'}`, run(`screenOpen("${v}")`) === want.includes(v));
  for (const v of want.filter(v => v !== 'league').concat(LEAGUE)) {
    let html = '', err = null;
    try { html = run(`VIEWS["${v}"]()`); } catch (e) { err = e.message; }
    ok(`${label}: ${v} screen renders`, !err && html.length > 50, err);
    ok(`${label}: ${v} has no keyboard hints`, !/\b(press|keyboard|shortcut|esc key|hotkey)\b/i.test(strip(html)));
  }
  ok(`${label}: hub renders`, run('VIEWS.hub()').length > 500);
  // player-card actions follow the same gates
  const other = run('S.players.filter(function(p){return p.team && p.team !== "NE"})[0].id');
  const card = strip(run(`playerModal("${other}")()`));
  ok(`${label}: "Trade for him" only while trades are open`, /Trade for him/.test(card) === want.includes('trade'));
  const mine = run('roster("NE")[0].id');
  ok(`${label}: "Shop in a trade" only while trades are open`, /Shop in a trade/.test(strip(run(`playerModal("${mine}")()`))) === want.includes('trade'));
  const fa = run('(function(){ var f = freeAgents().filter(function(p){ return S.phase !== "resign" || p.rights !== "NE"; })[0]; return f ? f.id : null; })()');
  if (fa) ok(`${label}: "Make an offer" to other free agents only while free agency is open`, /Make an offer/.test(strip(run(`playerModal("${fa}")()`))) === want.includes('fa'));
}

check('re-sign window', 'resign');
const exp = run('S.players.filter(function(p){return p.rights === "NE" && !p.team})[0].id');
ok('re-sign window: your expiring players can be re-signed', /Re-sign/.test(strip(run(`playerModal("${exp}")()`))));
ok('re-sign window: prospects board previews the real class', run('previewClass().length') > 300);
const previewNames = run('previewClass().slice(0, 5).map(function(p){return p.name + " " + p.pos})');
run('advance();');
check('free agency', 'fa');
run('while (S.phase === "fa") advance();');
const draftNames = run('draftPool().slice(0, 5).map(function(p){return p.name + " " + p.pos})');
ok('draft class = the class the prospects board showed (same names, same order)', JSON.stringify(previewNames) === JSON.stringify(draftNames), JSON.stringify([previewNames, draftNames]));
check('draft', 'draft');
run('draftUntilUser(true); pendingOptions("NE").forEach(function(p){ decideFifthYear(p, true); }); advance();');
ok('in preseason', run('S.phase') === 'preseason');
check('preseason', 'preseason');
ok('preseason: Make room is a screen, with restructures and cut options', /Restructures/.test(strip(run('VIEWS.cuts()'))) && /Cut options/.test(strip(run('VIEWS.cuts()'))));
run('userAutoRoster(); advance();');
ok('in the regular season', run('S.phase') === 'season');
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
ok('playoffs: bracket shows both conferences and the Super Bowl', /Wild card/.test(strip(run('VIEWS.bracket()'))) && /Super Bowl/.test(strip(run('VIEWS.bracket()'))));
run('while (!S.playoffs.champ) advance();');
ok('playoffs: bracket names the champion', /Super Bowl champions/.test(strip(run('VIEWS.bracket()'))));
run('advance();');
ok('next offseason: back to the re-sign window', run('S.phase') === 'resign');
check('next re-sign window', 'resign');

// 3. timeline: current phase and what opens next
const tl = run('timeline("resign", 0)');
ok('timeline: re-sign is now, free agency is next and says when it opens', tl[0].state === 'now' && tl[1].state === 'next' && /after the re-sign window/.test(tl[1].sub));
const tlp = run('timeline("playoffs", 17)');
ok('timeline in the playoffs: the re-sign window opens after the Super Bowl', tlp[0].state === 'next' && /after the Super Bowl/.test(tlp[0].sub));
const tls = run('timeline("season", 4)');
ok('timeline in season: shows the week and the trade deadline', /Week 5/.test(tls[4].sub) && /deadline/.test(tls[4].sub));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
