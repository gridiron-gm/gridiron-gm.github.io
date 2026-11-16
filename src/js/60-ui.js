// Screens and interaction. Rendering is plain template strings; events are delegated via data-act.
var UI = { sheet: null, view: 'hub', posFilter: 'ALL', sort: 'pos', faPos: 'ALL', trade: null, modal: null, draftPos: 'ALL', leaders: 'pyd', msg: null };
var $app = function () { return document.getElementById('app'); };

function setView(v) { UI.view = v; UI.msg = null; render(); window.scrollTo(0, 0); }
function flash(msg, bad) { UI.msg = { text: msg, bad: !!bad }; }

// ---------- formatting ----------
// Rating badge, colored by tier: 90+ gold, 80s green, 70s blue, 60s gray, under 60 dim.
function ovrPill(o, big) { var t = o >= 90 ? 't90' : o >= 80 ? 't80' : o >= 70 ? 't70' : o >= 60 ? 't60' : 't50'; return '<span class="rt ' + t + (big ? ' big' : '') + '">' + o + '</span>'; }
// Potential as a letter grade + range. Young players' ranges are wide and narrow with each season played;
// the true value sits inside the range (offset by a fixed per-player amount, so the middle isn't a giveaway).
// Veterans (27+ or 4+ seasons) show the exact number. The trait is "Unknown" until he has played a season.
var POT_GRADES = [[95, 'A+'], [90, 'A'], [87, 'A-'], [84, 'B+'], [80, 'B'], [77, 'B-'], [74, 'C+'], [70, 'C'], [66, 'C-'], [0, 'D']];
function potGrade(x) { for (var i = 0; i < POT_GRADES.length; i++) if (x >= POT_GRADES[i][0]) return POT_GRADES[i][1]; return 'D'; }
function potInfo(p) {
  var exp = p.prospect ? 0 : (p.exp || 0), known = !p.prospect && exp >= 1;
  var u = p.age >= 27 || exp >= 4 ? 0 : [6, 4, 2, 1][Math.min(3, exp)];
  var c = p.pot + (u ? Market.noise(p.id, 'pot') * u / 2 : 0);
  var lo = Math.min(p.pot, Math.max(p.ovr, Math.round(c - u))), hi = Math.max(p.pot, Math.min(99, Math.round(c + u)));
  return { known: known, trait: known ? (p.trait || 'Normal') : 'Unknown', grade: potGrade(u ? (lo + hi) / 2 : p.pot), lo: lo, hi: hi, exact: lo === hi };
}
function potText(p) { var i = potInfo(p); return '<span class="potg">' + i.grade + '</span> ' + (i.exact ? i.lo : i.lo + '–' + i.hi); }
function devBadge(p) { var t = potInfo(p).trait; return '<span class="dev dev-' + t.toLowerCase() + '">' + t + '</span>'; }
function capLabel() { return fmtM(capOf(S.year)) + ' cap (projected)'; }
function teamLink(a) { return '<span class="tl">' + chip(a) + '<b>' + a + '</b></span>'; }
function recStr(r) { return r.w + '-' + r.l + (r.t ? '-' + r.t : ''); }
function yrsLeftStr(p) { var n = Cap.yearsLeft(p, S.year); return n ? n + ' yr' : '—'; }
function statusStr(p) { return p.inj ? '<span class="inj">' + esc(p.injNote || 'Injured') + '</span>' : ''; }

// ---------- navigation ----------
function navGroups() {
  return [['Team', [['hub', 'Hub'], ['roster', 'Roster'], ['depth', 'Depth chart'], ['cap', 'Cap']]],
          ['Moves', [['fa', S.phase === 'resign' ? 'Re-sign' : 'Free agency'], ['trade', 'Trade'], ['draft', 'Draft']]],
          ['League', [['schedule', 'Schedule'], ['standings', 'Standings'], ['leaders', 'Leaders'], ['news', 'News'], ['history', 'History']]]];
}
function viewTitle(v) {
  var t = null;
  navGroups().forEach(function (g) { g[1].forEach(function (n) { if (n[0] === v) t = n[1]; }); });
  return t || 'Hub';
}
function groupOf(v) { var g = null; navGroups().forEach(function (gr) { gr[1].forEach(function (n) { if (n[0] === v) g = gr[0]; }); }); return g; }

// ---------- top-level ----------
function render() {
  if (!S) return renderStart();
  var t = TEAM[S.user], r = teamRating(S.user), sp = space(S.user);
  var side = '<aside class="side"><div class="logo">NFL <b>GM</b></div>' + navGroups().map(function (g) {
    return '<div class="ngroup"><div class="nlabel">' + g[0] + '</div>' + g[1].map(function (n) {
      return '<button class="nitem' + (UI.view === n[0] ? ' on' : '') + '" data-act="view" data-v="' + n[0] + '">' + n[1] + (n[0] === 'draft' && S.phase === 'draft' ? ' <span class="dot"></span>' : '') + '</button>';
    }).join('') + '</div>';
  }).join('') + '<div class="side-foot"><button class="link" data-act="export">Export save</button><button class="link" data-act="import">Import save</button></div></aside>';
  var band = '<header class="band"><div class="band-team"><span class="abbr">' + S.user + '</span><div><div class="tname">' + esc(t.name) + '</div><div class="tsub">' + S.year + ' · ' + PHASE_LABEL[S.phase] + phaseDetail() + '</div></div></div>' +
    '<div class="band-stats"><div class="bs"><span>Team</span>' + ovrPill(r.ovr) + '</div>' +
    '<div class="bs"><span>Cap space <em>approx.</em></span><b class="' + (sp < 0 ? 'neg' : '') + '">' + fmtM(sp) + '</b></div>' +
    '<div class="bs"><span>Roster</span><b>' + roster(S.user).length + '<small>/' + rosterMax() + '</small></b></div></div>' + advanceButtons() + '</header>';
  var g = groupOf(UI.view);
  var tabs = '<nav class="tabbar">' + [['hub', 'Hub', 'view'], ['roster', 'Roster', 'view'], ['moves', 'Moves', 'sheet'], ['league', 'League', 'sheet'], ['more', 'More', 'sheet']].map(function (x) {
    var on = x[2] === 'view' ? UI.view === x[0] : (x[0] === 'moves' && g === 'Moves') || (x[0] === 'league' && g === 'League') || (x[0] === 'more' && (UI.view === 'depth' || UI.view === 'cap'));
    return '<button class="tab' + (on ? ' on' : '') + '" data-act="' + (x[2] === 'view' ? 'view" data-v="' : 'sheet" data-s="') + x[0] + '">' + icon(x[0]) + x[1] + '</button>';
  }).join('') + '</nav>';
  var html = '<div class="shell" style="' + teamVars(S.user) + '">' + side + '<div class="maincol">' + band;
  if (UI.msg) html += '<div class="msg ' + (UI.msg.bad ? 'bad' : '') + '">' + esc(UI.msg.text) + '</div>';
  html += '<main><h1 class="vtitle">' + viewTitle(UI.view) + '</h1>' + (VIEWS[UI.view] || VIEWS.hub)() + '</main></div>' + tabs;
  if (UI.sheet) html += sheetHtml(UI.sheet);
  if (UI.modal) html += '<div class="overlay" data-act="close-bg"><div class="modal">' + UI.modal() + '</div></div>';
  html += importInput() + '</div>';
  $app().innerHTML = html;
  // any change of screen (menu, tab bar, or a game action that switches screens) starts at the top
  if (UI._lastView !== UI.view) { UI._lastView = UI.view; window.scrollTo(0, 0); }
  scheduleSave();
}
var ICONS = { hub: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', roster: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  moves: 'M4 8h14l-4-4M20 16H6l4 4', league: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3', more: 'M5 12h.01M12 12h.01M19 12h.01' };
function icon(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg>'; }
function sheetHtml(which) {
  var items = which === 'moves' ? navGroups()[1][1] : which === 'league' ? navGroups()[2][1] : [['depth', 'Depth chart'], ['cap', 'Cap']];
  var extra = which === 'more' ? '<button class="sitem" data-act="export">Export save</button><button class="sitem" data-act="import">Import save</button>' : '';
  return '<div class="overlay sheetbg" data-act="close-bg"><div class="sheet"><div class="sheet-h">' + { moves: 'Moves', league: 'League', more: 'More' }[which] + '</div>' +
    items.map(function (n) { return '<button class="sitem' + (UI.view === n[0] ? ' on' : '') + '" data-act="view" data-v="' + n[0] + '">' + n[1] + '</button>'; }).join('') + extra + '</div></div>';
}
function phaseDetail() {
  if (S.phase === 'fa') return ' · day ' + (S.faDay + 1) + ' of ' + FA_DAYS;
  if (S.phase === 'season') return ' · week ' + (S.week + 1 > WEEKS ? WEEKS : S.week + 1);
  if (S.phase === 'playoffs' && S.playoffs) return S.playoffs.champ ? ' · complete' : ' · ' + ROUND_NAMES[S.playoffs.round];
  return '';
}
function advanceLabel() {
  return { resign: 'Open free agency', fa: S.faDay < FA_DAYS - 1 ? 'Next FA day' : 'Go to draft', draft: 'Finish draft',
           preseason: 'Start season', season: S.week < WEEKS ? 'Sim week ' + (S.week + 1) : 'Start playoffs',
           playoffs: S.playoffs && S.playoffs.champ ? 'Start ' + (S.year + 1) + ' offseason' : 'Sim ' + (S.playoffs ? ROUND_NAMES[S.playoffs.round].toLowerCase() : 'playoffs') }[S.phase];
}
function advanceButtons() {
  var extra = '';
  if (S.phase === 'season' && S.week < WEEKS) extra = '<button class="ghost" data-act="sim-season">Sim to playoffs</button>';
  if (S.phase === 'playoffs' && S.playoffs && !S.playoffs.champ) extra = '<button class="ghost" data-act="sim-playoffs">Sim all playoffs</button>';
  if (S.phase === 'fa') extra = '<button class="ghost" data-act="skip-fa">Skip to draft</button>';
  if (S.phase === 'preseason') extra = '<button class="ghost" data-act="auto-roster">Auto-fill and cut to ' + ROSTER_MAX + '</button>';
  return '<div class="adv">' + extra + '<button class="go" data-act="advance">' + advanceLabel() + ' ›</button></div>';
}

function renderStart() {
  var has = hasSave();
  $app().innerHTML = '<div class="start"><div class="start-h"><div class="logo big">NFL <b>GM</b></div><p class="muted">Real rosters and contracts (OverTheCap via nflverse). Ratings come from 2025–26 stats and snaps. You start in the ' + (window.DATA ? DATA.meta.startYear : 2027) + ' offseason.</p>' +
    '<div class="actions">' + (has ? '<button class="go" data-act="continue">Continue saved game</button>' : '') + '<button data-act="import">Import save</button></div>' + importInput() +
    '<p class="seedrow"><label>Seed <input id="seed" inputmode="numeric" placeholder="random" size="10"></label> <span class="muted small">Optional. The same seed and the same moves replay the same league.</span></p></div>' +
    '<h2>Pick a team</h2><div class="teamgrid">' + TEAMS.slice().sort(byKey(function (t) { return t.name; })).map(function (t) {
      return '<button class="teambtn' + (t.abbr === 'NE' ? ' pick' : '') + '" style="' + teamVars(t.abbr) + '" data-act="new" data-t="' + t.abbr + '"><span class="tstripe"></span><b>' + t.abbr + '</b><span>' + esc(t.name) + '</span></button>';
    }).join('') + '</div>' + (has ? '<p class="muted small">Starting a new game replaces your saved game.</p>' : '') + '</div>';
}

// ---------- views ----------
var VIEWS = {};

VIEWS.hub = function () {
  var r = teamRating(S.user), rec = S.teams[S.user].rec, needs = teamNeeds(S.user).slice(0, 4);
  var exp = S.players.filter(function (p) { return p.rights === S.user && !p.team; });
  var lastYear = roster(S.user).filter(function (p) { return Cap.yearsLeft(p, S.year) === 1; });
  var nextGame = S.phase === 'season' && S.week < WEEKS ? S.schedule[S.week].filter(function (g) { return g.h === S.user || g.a === S.user; })[0] : null;
  var ns = nextStep(exp, nextGame);
  var h = '<section class="next' + (ns.bad ? ' bad' : '') + '"><div><div class="next-k">Next step</div><div class="next-t">' + ns.title + '</div><div class="next-s">' + ns.sub + '</div></div>' + ns.btn + '</section>';
  h += '<div class="hubgrid">';
  h += '<section class="card capcard"><div class="card-h"><h3>Cap</h3><span class="muted small">' + capLabel() + '</span></div>' + capBar() + roomLine() +
    '<div class="kv"><span>' + (S.year + 1) + ' space, projected <em>approx.</em></span><b class="' + (space(S.user, S.year + 1) < 0 ? 'neg' : '') + '">' + fmtM(space(S.user, S.year + 1)) + '</b></div></section>';
  h += '<section class="card"><div class="card-h"><h3>Team</h3>' + ovrPill(r.ovr) + '</div><div class="kv"><span>Record</span><b>' + recStr(rec) + '</b></div><div class="kv"><span>Standing</span><b>' + (S.phase === 'season' || S.phase === 'playoffs' ? divRank() : 'Season not started') + '</b></div>' +
    '<div class="kv"><span>Offense</span>' + ovrPill(r.off) + '</div><div class="kv"><span>Defense</span>' + ovrPill(r.def) + '</div></section>';
  h += '<section class="card"><div class="card-h"><h3>Needs</h3></div>' + (needs.length ? needs.map(function (n) {
    var st = starters(S.user, n.pos); return '<div class="kv"><span><b>' + n.pos + '</b></span><span class="muted small">' + (st.length ? 'starters ' : 'no starter') + '</span><span class="rts">' + st.map(function (p) { return ovrPill(p.ovr); }).join('') + '</span></div>';
  }).join('') : '<p class="muted">No glaring holes.</p>') + '</section>';
  h += '<section class="card"><div class="card-h"><h3>To do</h3></div><ul class="todo">' + todo(exp, lastYear, nextGame).join('') + '</ul></section>';
  h += '<section class="card"><div class="card-h"><h3>Team news</h3><button class="link" data-act="view" data-v="news">All news</button></div>' + newsList(S.news.filter(function (n) { return !n.team || n.team === S.user; }).slice(0, 4)) + '</section>';
  h += '</div>' + saveSection();
  return h;
};
// The single most important thing to do now, as a card with one button.
function nextStep(exp, nextGame) {
  var btn = function (act, label, extra) { return '<button class="go" data-act="' + act + '"' + (extra || '') + '>' + label + '</button>'; };
  var opt = pendingOptions(S.user).filter(function (p) { return fifthYearInfo(p).open; })[0];
  if (opt) { var i = fifthYearInfo(opt); return { title: 'Decide ' + esc(opt.name) + '\'s fifth-year option', sub: fmtM(i.amount) + ' for ' + i.year + ', fully guaranteed if exercised. Due before the draft ends.', btn: btn('player', 'Open his card', ' data-id="' + opt.id + '"') }; }
  if (space(S.user) < 0) return { bad: true, title: 'Get under the cap', sub: 'You are ' + fmtM(-space(S.user)) + ' over. Restructure, cut or trade.', btn: btn('make-room', 'Make room') };
  var rf = rosterFill(S.user);
  if ((S.phase === 'preseason' || S.phase === 'season') && roster(S.user).length < ROSTER_MAX)
    return { bad: !!rf.short, title: 'Fill your roster to ' + ROSTER_MAX, sub: roster(S.user).length + ' players now.' + (rf.short ? ' You need ' + fmtM(rf.short) + ' more room.' : ''), btn: rf.short ? btn('make-room', 'Make room') : btn('auto-roster', 'Auto-fill') };
  if (S.phase === 'preseason' && roster(S.user).length > ROSTER_MAX) return { title: 'Cut down to ' + ROSTER_MAX, sub: roster(S.user).length + ' players on the roster.', btn: btn('auto-roster', 'Auto-cut') };
  switch (S.phase) {
    case 'resign': return { title: 'Re-sign your expiring players', sub: exp.length + ' contracts expired. Anyone you don\'t re-sign hits free agency.', btn: btn('view', 'Review', ' data-v="fa"') };
    case 'fa': return { title: 'Free agency, day ' + (S.faDay + 1) + ' of ' + FA_DAYS, sub: 'Asks drop each day, but other teams sign players too. ' + fmtM(space(S.user)) + ' of room.', btn: btn('view', 'Browse free agents', ' data-v="fa"') };
    case 'draft': var k = currentPick(); return k && k.owner === S.user ? { title: 'You\'re on the clock', sub: 'Pick ' + k.no + ', round ' + k.round + '.', btn: btn('view', 'Draft board', ' data-v="draft"') } : { title: 'The draft is on', sub: 'Sim to your next pick or auto-draft.', btn: btn('view', 'Draft board', ' data-v="draft"') };
    case 'preseason': return { title: 'Start the season', sub: 'Roster is at ' + ROSTER_MAX + '. Check the depth chart first if you like.', btn: btn('advance', 'Start season') };
    case 'season':
      if (nextGame) { var opp = nextGame.h === S.user ? nextGame.a : nextGame.h; return { title: 'Week ' + (S.week + 1) + ': ' + (nextGame.h === S.user ? 'vs ' : 'at ') + esc(TEAM[opp].name), sub: 'Their team rating ' + teamRating(opp).ovr + ', yours ' + teamRating(S.user).ovr + '.', btn: btn('advance', 'Sim week ' + (S.week + 1)) }; }
      return { title: 'Regular season over', sub: 'The playoff field is set.', btn: btn('advance', 'Start playoffs') };
    default: return { title: S.playoffs && S.playoffs.champ ? TEAM[S.playoffs.champ].name + ' won the Super Bowl' : 'Playoffs', sub: S.playoffs && S.playoffs.champ ? 'Start the next offseason when you\'re ready.' : 'Sim the next round.', btn: btn('advance', advanceLabel()) };
  }
}
// Used / dead / free, as a share of this year's team cap.
function capBar() {
  var team = T(S.user), capT = Cap.teamCap(team, S.year), used = committed(S.user), dead = Cap.teamDead(team, S.year), free = capT - used - dead;
  var pct = function (x) { return Math.max(0, Math.min(100, x / capT * 100)).toFixed(1) + '%'; };
  return '<div class="capbar"><span class="cb-used" style="width:' + pct(used) + '"></span><span class="cb-dead" style="width:' + pct(dead) + '"></span><span class="cb-free" style="width:' + pct(Math.max(0, free)) + '"></span></div>' +
    '<div class="cblegend"><span><i class="sw used"></i>Contracts ' + fmtM(used) + (top51(S.year) ? ' <em>top 51</em>' : '') + '</span><span><i class="sw dead"></i>Dead ' + fmtM(dead) + '</span><span><i class="sw free"></i>' + (free < 0 ? '<b class="neg">Over by ' + fmtM(-free) + '</b>' : 'Free ' + fmtM(free) + ' <em>approx.</em>') + '</span></div>';
}
function roomLine() {
  var rf = rosterFill(S.user);
  if (!rf.spots) return '';
  return '<div class="kv room"><span>Room needed to fill ' + ROSTER_MAX + '</span><b>' + fmtM(rf.need) + '</b></div><div class="muted small">' + (rf.picks ? rf.picks + ' draft picks + ' : '') + rf.open + ' spots at minimum' + (rf.short ? ' · <span class="neg">' + fmtM(rf.short) + ' short</span>' : '') + '</div>';
}
function divRank() {
  var d = divisionStandings().filter(function (d) { return d.teams.indexOf(S.user) >= 0; })[0];
  var i = d.teams.indexOf(S.user) + 1;
  return ['1st', '2nd', '3rd', '4th'][i - 1] + ' in ' + TEAM[S.user].conf + ' ' + d.div;
}
function todo(exp, lastYear, nextGame) {
  var out = [];
  pendingOptions(S.user).forEach(function (p) { var i = fifthYearInfo(p); if (i.open) out.push('<li>Fifth-year option decision: <button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button> (' + fmtM(i.amount) + ' for ' + i.year + ', due before the draft ends)</li>'); });
  if (S.phase === 'resign') out.push('<li>' + exp.length + ' expiring players can be re-signed before free agency. <button class="link" data-act="view" data-v="fa">Review</button></li>');
  if (S.phase === 'fa') out.push('<li>Free agency day ' + (S.faDay + 1) + ': other teams sign players each day. <button class="link" data-act="view" data-v="fa">Browse free agents</button></li>');
  if (S.phase === 'draft') out.push('<li>The draft is on. <button class="link" data-act="view" data-v="draft">Go to the draft board</button></li>');
  if (S.phase === 'preseason') out.push('<li>Get to ' + ROSTER_MAX + ' players (now ' + roster(S.user).length + '). <button class="link" data-act="auto-roster">Auto-fill and cut</button></li>');
  var rf = rosterFill(S.user);
  if ((S.phase === 'preseason' || S.phase === 'season') && roster(S.user).length < ROSTER_MAX)
    out.push('<li class="bad">Roster is under ' + ROSTER_MAX + ' (' + roster(S.user).length + ' players).' + (rf.short ? ' You need ' + fmtM(rf.short) + ' more room to fill it.' : '') + ' <button class="link" data-act="make-room">Make room</button></li>');
  else if (rf.short && S.phase !== 'playoffs') out.push('<li class="bad">Filling ' + ROSTER_MAX + ' needs ' + fmtM(rf.need) + ' but you have ' + fmtM(rf.room) + ' at week-1 counting: ' + fmtM(rf.short) + ' short. <button class="link" data-act="make-room">Make room</button></li>');
  if (nextGame) out.push('<li>Week ' + (S.week + 1) + ': ' + (nextGame.h === S.user ? 'vs ' : 'at ') + teamLink(nextGame.h === S.user ? nextGame.a : nextGame.h) + ' (' + teamRating(nextGame.h === S.user ? nextGame.a : nextGame.h).ovr + ' OVR)</li>');
  if (lastYear.length && S.phase !== 'playoffs') out.push('<li>' + lastYear.length + ' players are in the last year of their deal: ' + lastYear.sort(byKey(function (p) { return p.ovr; }, true)).slice(0, 4).map(function (p) { return '<button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button>'; }).join(', ') + '</li>');
  if (space(S.user) < 0) out.push('<li class="bad">You are over the cap. Release, trade or restructure players.</li>');
  return out;
}
function metric(label, val, sub) { return '<div class="metric"><p>' + label + '</p><b>' + val + '</b><span>' + sub + '</span></div>'; }
function newsList(items) { return items.length ? '<ul class="news">' + items.map(function (n) { return '<li><span class="muted">' + n.y + ' ' + PHASE_LABEL[n.ph].toLowerCase() + (n.ph === 'season' ? ' wk ' + n.w : '') + '</span> ' + esc(n.msg) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Nothing yet.</p>'; }

VIEWS.roster = function () {
  var ros = roster(S.user);
  if (UI.posFilter !== 'ALL') ros = ros.filter(function (p) { return p.pos === UI.posFilter; });
  var sorts = { ovr: function (p) { return -p.ovr; }, cap: function (p) { return -Cap.capHit(p, S.year); }, age: function (p) { return p.age; } };
  var h = '<div class="toolbar">' + filterBar('posFilter') + '<label class="sortsel">Sort <select data-act="roster-sort">' + [['pos', 'By position'], ['ovr', 'Rating'], ['cap', 'Cap hit'], ['age', 'Age']].map(function (o) { return '<option value="' + o[0] + '"' + (UI.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>';
  var head = '<tr><th>Player</th><th class="hide-sm">Pos</th><th class="r">Age</th><th>OVR</th><th class="hide-sm">Potential</th><th class="hide-sm">Dev</th><th class="r">' + S.year + ' cap</th><th class="r">Left</th><th class="r hide-sm">Gtd left</th><th class="r hide-sm">Dead if cut</th></tr>';
  var row = function (p, starter) {
    var pv = releasePreview(p, false);
    return '<tr class="click" data-act="player" data-id="' + p.id + '"><td><span class="pname">' + esc(p.name) + '</span>' + (starter ? '<span class="st">S</span>' : '') + statusStr(p) + '<span class="pos-sm">' + p.pos + '</span></td><td class="hide-sm">' + p.pos + '</td><td class="r">' + p.age + '</td><td>' + ovrPill(p.ovr) + '</td><td class="hide-sm">' + potText(p) + '</td><td class="hide-sm">' + devBadge(p) + '</td>' +
      '<td class="r">' + fmtM(Cap.capHit(p, S.year)) + '</td><td class="r">' + yrsLeftStr(p) + '</td><td class="r hide-sm">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td><td class="r hide-sm">' + fmtM(pv.now) + '</td></tr>';
  };
  h += '<div class="tablewrap"><table class="roster"><thead>' + head + '</thead><tbody>';
  if (UI.sort === 'pos' || !sorts[UI.sort]) {
    var depth = S.teams[S.user].depth;
    POSITIONS.forEach(function (pos) {
      var grp = ros.filter(function (p) { return p.pos === pos; });
      if (!grp.length) return;
      var order = (depth[pos] || []).filter(function (id) { return grp.some(function (p) { return p.id === id; }); });
      grp.sort(byKey(function (p) { var i = order.indexOf(p.id); return i < 0 ? 999 - p.ovr : i; }));
      var st = starters(S.user, pos).map(function (p) { return p.id; });
      h += '<tr class="grp"><td colspan="10">' + pos + ' <span>' + grp.length + ' · ' + Market.STARTERS[pos] + ' start</span></td></tr>';
      grp.forEach(function (p) { h += row(p, st.indexOf(p.id) >= 0); });
    });
  } else {
    ros.sort(byKey(sorts[UI.sort])).forEach(function (p) { h += row(p, starters(S.user, p.pos).indexOf(p) >= 0); });
  }
  return h + '</tbody></table></div><p class="muted small">S = starter on the depth chart. Click a player for his contract and moves.</p>';
};
function filterBar(key) {
  return '<div class="filters">' + ['ALL'].concat(POSITIONS).map(function (p) { return '<button class="' + (UI[key] === p ? 'on' : '') + '" data-act="filter" data-k="' + key + '" data-p="' + p + '">' + (p === 'ALL' ? 'All' : p) + '</button>'; }).join('') + '</div>';
}

VIEWS.depth = function () {
  var t = S.teams[S.user];
  var h = '<p class="muted">Starters are highlighted. Injured players are skipped automatically on game day.</p><div class="depthgrid">';
  POSITIONS.forEach(function (pos) {
    var ids = t.depth[pos] || [];
    h += '<section class="card"><h3>' + pos + ' <span class="muted">' + Market.STARTERS[pos] + ' start</span></h3>';
    if (!ids.length) h += '<p class="bad">Nobody at ' + pos + '.</p>';
    ids.forEach(function (id, i) {
      var p = P(id); if (!p) return;
      h += '<div class="drow' + (i < Market.STARTERS[pos] ? ' start' : '') + '"><span>' + (i + 1) + '. <button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button> ' + statusStr(p) + '</span><span>' + ovrPill(p.ovr) +
        '<button class="mini" data-act="depth" data-pos="' + pos + '" data-i="' + i + '" data-d="-1" aria-label="Move up">▲</button><button class="mini" data-act="depth" data-pos="' + pos + '" data-i="' + i + '" data-d="1" aria-label="Move down">▼</button></span></div>';
    });
    h += '</section>';
  });
  return h + '</div><p><button data-act="auto-depth">Reset to best available</button></p>';
};

VIEWS.cap = function () {
  var team = T(S.user), years = [0, 1, 2, 3, 4].map(function (i) { return S.year + i; });
  var note = '<p class="muted small">League cap ' + fmtM(capOf(S.year)) + ' for ' + S.year + ' is projected; later years assume ~7% growth. Cap space is approximate: it counts every contract on the roster, this game\'s dead money and rollover, but not dead money from cuts made before the game started. Until week 1 only the 51 largest cap numbers count (the top-51 rule); from week 1 every contract counts. Future years are shown under the top-51 rule.</p>';
  var h = '<section class="card capcard" style="margin-bottom:14px"><div class="card-h"><h3>' + S.year + ' cap</h3><span class="muted small">' + capLabel() + '</span></div>' + capBar() + '</section>';
  h += '<div class="tablewrap"><table><thead><tr><th></th>' + years.map(function (y) { return '<th class="r">' + y + '</th>'; }).join('') + '</tr></thead><tbody>';
  var row = function (label, f, cls) { return '<tr class="' + (cls || '') + '"><td>' + label + '</td>' + years.map(function (y) { return '<td class="r">' + f(y) + '</td>'; }).join('') + '</tr>'; };
  h += row('League cap (projected)', function (y) { return fmtM(capOf(y)); });
  h += row('Rollover', function (y) { return fmtM((team.rollover || {})[y] || 0); });
  h += row('Active contracts', function (y) { return fmtM(committed(S.user, y)) + (top51(y) ? ' <span class="muted small">top 51</span>' : ''); });
  h += row('Dead money', function (y) { return fmtM(Cap.teamDead(team, y)); });
  h += row('Cap space (approx.)', function (y) { var s = space(S.user, y); return '<b class="' + (s < 0 ? 'bad' : '') + '">' + fmtM(s) + '</b>'; }, 'total');
  var rf = rosterFill(S.user);
  h += row('Room needed to fill ' + ROSTER_MAX, function (y) { return y === S.year ? '<span class="' + (rf.short ? 'bad' : '') + '">' + fmtM(rf.need) + '</span>' : ''; });
  h += row('Players under contract', function (y) { return roster(S.user).filter(function (p) { var r = Cap.row(p, y); return r && !r.void; }).length; });
  h += '</tbody></table></div><h3 class="sec">Contracts</h3><div class="tablewrap"><table><thead><tr><th>Player</th><th>Pos</th>' + years.map(function (y) { return '<th class="r">' + y + '</th>'; }).join('') + '<th class="r">Gtd left</th></tr></thead><tbody>';
  roster(S.user).sort(byKey(function (p) { return Cap.capHit(p, S.year); }, true)).forEach(function (p) {
    h += '<tr><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button></td><td>' + p.pos + '</td>' + years.map(function (y) {
      var r = Cap.row(p, y); return '<td class="r' + (r && r.void ? ' muted' : '') + '">' + (r ? fmtM(r.cap) + (r.void ? ' void' : '') : '') + '</td>';
    }).join('') + '<td class="r">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td></tr>';
  });
  return h + '</tbody></table></div>' + note;
};

// ---------- player card ----------
function playerModal(id) {
  return function () {
    var p = P(id); if (!p) return '';
    var mine = p.team === S.user, Y = S.year;
    var who = p.team ? esc(TEAM[p.team].name) : p.rights ? 'Expiring · ' + p.rights + ' has rights' : p.retired ? 'Retired' : 'Free agent';
    var h = '<div class="pc-band" style="' + teamVars(p.team || p.rights || S.user) + '">' + ovrPill(p.ovr, true) + '<div class="pc-id"><h2>' + esc(p.name) + '</h2><div>' + p.pos + (p.opos && p.opos !== p.pos ? ' (' + p.opos + ')' : '') + ' · age ' + p.age + ' · ' + who +
      (p.draft && p.draft[1] ? ' · drafted ' + p.draft[0] + ' R' + p.draft[1] + ' #' + p.draft[2] : '') + '</div></div><button class="x" data-act="close" aria-label="Close">✕</button></div>';
    var SUB = { pass: 'Passing', acc: 'Accuracy', run: 'Rushing', prod: 'Production', tgt: 'Targets', rec: 'Receiving', rush: 'Pass rush', tkl: 'Tackling', play: 'Playmaking', cov: 'Coverage', pow: 'Leg', net: 'Net punting' };
    var pi = potInfo(p);
    var tiles = [['Potential', '<b>' + pi.grade + '</b><small class="muted">' + (pi.exact ? pi.lo : pi.lo + '–' + pi.hi) + '</small>'], ['Dev trait', devBadge(p)]].concat(Object.keys(p.sub || {}).slice(0, 2).map(function (k) { return [SUB[k] || k, ovrPill(p.sub[k])]; }));
    if (p.years && p.years.length) tiles.push(['This year', '<b>' + fmtM(Cap.capHit(p, Y)) + '</b>'], ['Years left', '<b>' + (Cap.yearsLeft(p, Y) || '—') + '</b>'], ['Gtd left', '<b>' + fmtM(Cap.gtdLeft(p, Y)) + '</b>']);
    else tiles.push(['Market value', '<b>' + fmtM(Market.demand(p, marketCap(), Y).apy) + '/yr</b>']);
    h += '<div class="pc-tiles">' + tiles.map(function (t) { return '<div class="tile"><span>' + t[0] + '</span>' + t[1] + '</div>'; }).join('') + '</div>';
    if (p.s && p.s.g) h += '<div class="pc-line"><b>' + Y + '</b> ' + statText(p.s, p.pos) + '</div>';
    if (p.line26) h += '<div class="pc-line muted"><b>2026 (real)</b> ' + esc(p.line26) + '</div>';
    if (p.years && p.years.length) {
      h += '<h3 class="sec">Contract</h3><div class="tablewrap"><table class="ctable"><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Bonus</th><th class="r hide-sm">Option</th><th class="r hide-sm">Roster/other</th><th class="r">Cap hit</th><th class="r hide-sm">Gtd</th><th class="r">Dead if cut</th></tr></thead><tbody>';
      Cap.remaining(p, Y).forEach(function (r) {
        var dc = Cap.releaseCost(p, r.y, false).dead[r.y] || 0;
        h += '<tr class="' + (r.void ? 'muted' : '') + '"><td>' + r.y + (r.void ? ' void' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r hide-sm">' + fmtM(r.opt || 0) + '</td><td class="r hide-sm">' + fmtM(r.roster + r.other) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r hide-sm">' + fmtM(r.gtd) + '</td><td class="r">' + fmtM(dc) + '</td></tr>';
      });
      h += '</tbody></table></div><p class="muted small">Bonus = prorated signing bonus. Dead if cut = pre-June 1 release in that year.</p>';
    }
    var fy = fifthYearInfo(p);
    if (fy) {
      h += '<div class="option"><h3>Fifth-year option: ' + fy.year + '</h3><p>' + fmtM(fy.amount) + ', fully guaranteed when exercised. <span class="muted">' + esc(fy.label) + ' (Pro Bowls: ' + (p.pb || 0) + '; playing time ' +
        Object.keys(p.pt || {}).sort().map(function (k) { return k + ' ' + Math.round(p.pt[k] * 100) + '%'; }).join(', ') + ').</span></p>';
      if (mine && fy.open) h += '<p class="muted small">Decide before the early-May deadline (before the draft ends). Declining makes him a free agent after ' + Y + '.</p><div class="actions"><button class="go" data-act="fifth" data-id="' + p.id + '" data-x="1">Exercise option</button><button data-act="fifth" data-id="' + p.id + '" data-x="0">Decline option</button></div>';
      h += '</div>';
    } else if (p.fifth) h += '<p class="small muted">Fifth-year option ' + p.fifth + '.</p>';
    var acts = '';
    if (mine) {
      var pre = releasePreview(p, false), post = Cap.releaseCost(p, Y, true);
      h += '<h3 class="sec">If released</h3><div class="relgrid">';
      if (!isPostJune()) {
        h += '<div class="rel"><b>Pre-June 1</b><span>' + fmtM(pre.now) + ' dead in ' + Y + '</span><span class="muted">Cap change ' + Y + ': ' + fmtM(pre.savings) + ' saved</span></div>';
        h += '<div class="rel"><b>Post-June 1 designation</b><span>' + fmtM(post.dead[Y] || 0) + ' in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '</span><span class="muted">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved · ' + (canJune1(S.user) ? (2 - (S.june1[S.year + S.user] || 0)) + ' designations left' : 'none left') + '</span></div>';
      } else {
        h += '<div class="rel"><b>After June 1</b><span>' + fmtM(post.dead[Y] || 0) + ' in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '</span><span class="muted">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved</span></div>';
      }
      h += '</div>';
      var rmax = Cap.restructureMax(p, Y, p.exp);
      if (rmax > 500) h += '<p class="muted small">Restructure converts ' + fmtM(rmax) + ' of ' + Y + ' salary into a bonus prorated over ' + Math.min(5, Cap.remaining(p, Y).length) + ' years. Future cap hits and dead money go up.</p>';
      if (canExtend(p)) acts += '<button class="go" data-act="offer" data-id="' + p.id + '" data-mode="extend">Extend</button>';
      if (rmax > 500) acts += '<button data-act="restructure" data-id="' + p.id + '">Restructure (save ' + fmtM(rmax - Math.floor(rmax / Math.min(5, Cap.remaining(p, Y).length))) + ')</button>';
      acts += '<button data-act="trade-with" data-id="' + p.id + '">Shop in a trade</button>';
      if (!isPostJune()) acts += '<button class="danger" data-act="release" data-id="' + p.id + '" data-j="0">Release pre-June 1</button><button class="danger" data-act="release" data-id="' + p.id + '" data-j="1">Designate post-June 1</button>';
      else acts += '<button class="danger" data-act="release" data-id="' + p.id + '" data-j="0">Release</button>';
    } else if (!p.team && !p.retired) {
      var canOffer = (S.phase === 'resign' && p.rights === S.user) || S.phase !== 'resign';
      acts = canOffer ? '<button class="go" data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (p.rights === S.user ? 'Re-sign' : 'Make an offer') + '</button>' : '<span class="muted">Free agency opens after the re-sign window.</span>';
    } else if (p.team) {
      acts = '<button class="go" data-act="trade-for" data-id="' + p.id + '">Trade for him</button>';
    }
    if (acts) h += '<div class="pc-actions">' + acts + '</div>';
    return h;
  };
}
function statText(s, pos) {
  var parts = [s.g + ' G'];
  if (s.pyd) parts.push(s.pyd + ' pass yds', (s.ptd || 0) + ' TD', (s.int || 0) + ' INT');
  if (s.ruyd) parts.push(s.ruyd + ' rush yds', (s.rutd || 0) + ' rush TD');
  if (s.ryd) parts.push((s.rec || 0) + ' rec', s.ryd + ' rec yds', (s.rtd || 0) + ' TD');
  if (s.sk) parts.push(s.sk + ' sacks');
  if (s.dint) parts.push(s.dint + ' INT');
  if (s.tk) parts.push(s.tk + ' tkl');
  if (s.fga) parts.push(s.fgm + '/' + s.fga + ' FG');
  return parts.join(' · ');
}

// ---------- contract offer ----------
function offerModal(id, mode) {
  var p = P(id);
  var d = Market.demand(p, marketCap(), S.year);
  if (!UI.offer || UI.offer.id !== id) UI.offer = { id: id, mode: mode, years: d.years, total: +(d.apy * d.years / 1000).toFixed(1), bonus: +(d.gtd * 0.5 / 1000).toFixed(1), gtd: +(d.gtd / 1000).toFixed(1) };
  return function () {
    var o = UI.offer, abbr = S.user;
    var offer = { years: o.years, total: Math.round(o.total * 1000), bonus: Math.round(o.bonus * 1000), gtd: Math.round(o.gtd * 1000) };
    var yrs = mode === 'extend' ? buildExtensionYears(p, offer) : Cap.buildContract(offer, S.year, p.exp);
    var ev = Market.evaluate(p, offer, offerCtx(p, abbr));
    var hitNow = (Cap.row({ years: yrs }, S.year) || { cap: 0 }).cap - (mode === 'extend' ? Cap.capHit(p, S.year) : 0);
    var mood = ev.mood >= 1 ? ['g', 'Likely to accept'] : ev.mood >= 0.93 ? ['w', 'Close'] : ['b', 'Not close'];
    var h = '<div class="mhead"><div><h2>' + (mode === 'extend' ? 'Extend ' : p.rights === S.user ? 'Re-sign ' : 'Offer: ') + esc(p.name) + '</h2><p class="muted">' + p.pos + ' · age ' + p.age + ' · OVR ' + p.ovr + ' · asking about ' + fmtM(d.apy) + '/yr for ' + d.years + ' yrs, ' + fmtM(d.gtd) + ' guaranteed</p></div><button class="x" data-act="close" aria-label="Close">✕</button></div>';
    h += '<div class="offergrid">' + field('years', 'Years', o.years, 1, 7, 1) + field('total', 'Total $M', o.total, 0.5, 600, 0.1) + field('bonus', 'Signing bonus $M', o.bonus, 0, 300, 0.1) + field('gtd', 'Guaranteed $M', o.gtd, 0, 600, 0.1) + '</div>';
    if (mode !== 'extend' && ev.lateFloor) h += '<p class="warn">Late market: he\'ll sign for ' + fmtM(ev.lateFloor) + ' a year or more (' + (S.phase === 'season' ? '12%' : '25%') + ' of his ask), the same prove-it terms AI teams get.</p>';
    if (mode === 'extend') h += '<p class="muted small">Extension starts ' + extensionStart() + '. Prorated bonus already on the books stays in its years.</p>';
    h += '<div class="tablewrap"><table><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Prorated bonus</th><th class="r">Cap hit</th><th class="r">Gtd</th><th class="r">Dead if cut that year</th></tr></thead><tbody>';
    var tmp = { years: yrs };
    yrs.filter(function (r) { return r.y >= S.year; }).forEach(function (r) {
      h += '<tr><td>' + r.y + (r.void ? ' (void)' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r">' + fmtM(r.gtd) + '</td><td class="r">' + fmtM(Cap.releaseCost(tmp, r.y, false).dead[r.y] || 0) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<p>Cap space after: <b class="' + (space(abbr) - hitNow < 0 ? 'bad' : '') + '">' + fmtM(space(abbr) - hitNow) + '</b> <span class="muted">approx.</span></p>';
    var fillShort = offerShortfall(p, mode, hitNow);
    if (fillShort > 0) h += '<p class="warn">This leaves you ' + fmtM(fillShort) + ' short of filling your roster (' + ROSTER_MAX + ' players at week 1).</p>';
    h += '<div class="moodrow"><span class="pill ' + mood[0] + '">' + mood[1] + '</span> <span class="muted">' + ev.notes.map(function (n) { return n.k + (n.good ? ' ✓' : ' ✗'); }).join(' · ') + '</span></div>';
    if (UI.offerErr) h += '<p class="bad">' + esc(UI.offerErr) + '</p>';
    h += '<div class="actions"><button data-act="offer-ask">Fill in asking price</button><button class="primary" data-act="offer-submit">Make offer</button></div>';
    return h;
  };
}
// Shortfall to fill 53 after this deal (0 if fine). Only matters before the season.
function offerShortfall(p, mode, hitNow) {
  if (S.phase === 'playoffs') return 0;
  return rosterFill(S.user, mode === 'extend' ? 0 : 1, hitNow, mode === 'extend' ? null : p.pos).short;
}
function roomMetric() {
  var rf = rosterFill(S.user);
  if (!rf.spots) return '';
  return metric('Room needed to fill ' + ROSTER_MAX, fmtM(rf.need), (rf.picks ? rf.picks + ' draft picks + ' : '') + rf.open + ' spots at minimum' + (rf.short ? ' · <span class="bad">' + fmtM(rf.short) + ' short</span>' : ''));
}
function makeRoomModal() {
  return function () {
    var o = makeRoomOptions(S.user), rf = rosterFill(S.user);
    var h = '<div class="mhead"><div><h2>Make room</h2><p class="muted">Filling ' + ROSTER_MAX + ' needs ' + fmtM(rf.need) + '; you have ' + fmtM(rf.room) + ' with every contract counted' + (rf.short ? ': <b class="bad">' + fmtM(rf.short) + ' short</b>' : '') + '.</p></div><button class="x" data-act="close" aria-label="Close">✕</button></div>';
    h += '<h3>Restructures</h3>' + (o.restructures.length ? '<table><tbody>' + o.restructures.map(function (x) {
      return '<tr><td>' + esc(x.p.name) + ' <span class="muted">' + x.p.pos + '</span></td><td class="r">saves ' + fmtM(x.saves) + ' now</td><td><button data-act="restructure" data-id="' + x.p.id + '" data-back="room">Restructure</button></td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">No contracts left to restructure.</p>');
    h += '<h3>Cut options</h3><p class="muted small">Net room = cap saved minus the ' + fmtM(Cap.minSalary(FILLER_PRICE_EXP, S.year)) + ' it costs to refill the spot at the minimum. Players rated 80+ and cuts netting under $250K are left out; starters come last.</p>';
    if (o.cuts.length && o.short > 0) h += '<p>' + (o.cutsNeeded ? 'You\'d need ' + o.cutsNeeded + ' of these cuts to cover the ' + fmtM(o.short) + ' shortfall.' : 'Even all ' + o.cuts.length + ' of these cuts net only ' + fmtM(o.cutsTotal) + ', short of ' + fmtM(o.short) + ': restructure first.') + '</p>';
    h += o.cuts.length ? '<table><tbody>' + o.cuts.map(function (x) {
      return '<tr><td>' + esc(x.p.name) + ' <span class="muted">' + x.p.pos + ' · ' + x.p.ovr + ' · ' + (x.starter ? 'starter' : 'backup') + '</span></td><td class="r">net ' + fmtM(x.net) + '</td><td class="r muted">saves ' + fmtM(x.saves) + ' − refill ' + fmtM(x.replacement) + '</td><td class="r muted">dead ' + fmtM(x.dead) + '</td><td><button data-act="player" data-id="' + x.p.id + '">Review</button></td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">No cut frees at least $250K once the spot is refilled.</p>';
    return h;
  };
}
function field(k, label, v, min, max, step) { return '<label>' + label + '<input type="number" inputmode="decimal" data-field="' + k + '" value="' + v + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>'; }

VIEWS.fa = function () {
  var h = '';
  if (S.phase === 'resign') {
    var exp = S.players.filter(function (p) { return p.rights === S.user && !p.team; }).sort(byKey(function (p) { return p.ovr; }, true));
    h += '<p class="muted">These contracts expired. Re-sign anyone you want to keep before free agency opens; the rest hit the market.</p>';
    h += faTable(exp, true);
    return h;
  }
  var pool = freeAgents();
  if (UI.faPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.faPos; });
  pool.sort(byKey(function (p) { return p.ovr; }, true));
  h += '<p class="muted">' + (S.phase === 'fa' ? 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS + '. Asking prices drop as free agency goes on, but other teams sign players every day.' : 'Unsigned players. Asks are lower this late in the year.') + '</p>';
  return h + filterBar('faPos') + faTable(pool.slice(0, 150), false);
};
function faTable(list, resign) {
  if (!list.length) return '<p class="muted">Nobody here.</p>';
  var h = '<div class="tablewrap"><table><thead><tr><th>Player</th><th class="hide-sm">Pos</th><th class="r">Age</th><th>OVR</th><th class="hide-sm">Potential</th><th class="hide-sm">Last team</th><th class="r">Asking/yr</th><th class="r hide-sm">Yrs</th><th class="r hide-sm">Gtd</th><th class="hide-sm"></th></tr></thead><tbody>';
  list.forEach(function (p) {
    var d = Market.demand(p, marketCap(), S.year), disc = S.phase === 'resign' ? 1 : 1 - Market.faDiscount(offerCtx(p, S.user).daysIntoFA);
    h += '<tr class="click" data-act="player" data-id="' + p.id + '"><td><span class="pname">' + esc(p.name) + '</span><span class="pos-sm">' + p.pos + '</span></td><td class="hide-sm">' + p.pos + '</td><td class="r">' + p.age + '</td><td>' + ovrPill(p.ovr) + '</td><td class="hide-sm">' + potText(p) + '</td><td class="hide-sm">' + (p.prevTeam || p.cutBy || '—') + '</td>' +
      '<td class="r">' + fmtM(d.apy * disc) + '</td><td class="r hide-sm">' + d.years + '</td><td class="r hide-sm">' + fmtM(d.gtd * disc) + '</td><td class="hide-sm"><button data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (resign ? 'Re-sign' : 'Offer') + '</button></td></tr>';
  });
  return h + '</tbody></table></div><p class="muted small">Tap a player for his card and to make an offer.</p>';
}

// ---------- trade ----------
function tradeState() {
  if (!UI.trade) UI.trade = { ai: aiTeams().filter(function (a) { return a !== S.user; })[0], give: { players: [], picks: [] }, get: { players: [], picks: [] }, result: null, suggestion: null };
  return UI.trade;
}
VIEWS.trade = function () {
  var tr = tradeState();
  var ev = aiTradeEval(tr.ai, tr.give, tr.get);
  var pct = Math.round(clamp(ev.ratio, 0, 1.2) / 1.2 * 100);
  var label = ev.accept ? ['g', 'They would accept'] : ev.ratio > 0.85 ? ['w', 'Close: add a little'] : ['b', 'Not interested yet'];
  var h = '<div class="tradehead"><label>Trade partner <select data-act="trade-team">' + TEAMS.filter(function (t) { return t.abbr !== S.user; }).map(function (t) { return '<option value="' + t.abbr + '"' + (t.abbr === tr.ai ? ' selected' : '') + '>' + t.abbr + ' · ' + esc(t.name) + ' (' + teamRating(t.abbr).ovr + ' OVR, ' + fmtM(space(t.abbr)) + ' space)</option>'; }).join('') + '</select></label></div>';
  h += '<div class="tradegrid">' + tradeSide(S.user, tr.give, 'give', 'You send') + tradeSide(tr.ai, tr.get, 'get', TEAM[tr.ai].name + ' send') + '</div>';
  var capU = space(S.user) + ev.capUser, capA = space(tr.ai) + ev.capAI;
  h += '<section class="tradesum"><div class="ts-top"><div class="ts-meter"><div class="row"><b>' + tr.ai + ' interest</b><span class="pill ' + label[0] + '">' + label[1] + '</span></div><div class="bar"><div style="width:' + pct + '%" class="' + label[0] + '"></div></div></div>' +
    '<div class="ts-caps"><div><span>Your cap after</span><b class="' + (capU < 0 ? 'neg' : '') + '">' + fmtM(capU) + '</b></div><div><span>' + tr.ai + ' cap after</span><b class="' + (capA < 0 ? 'neg' : '') + '">' + fmtM(capA) + '</b></div></div></div>';
  if (ev.msg) h += '<p class="neg small">' + esc(ev.msg) + '</p>';
  h += '<p class="muted small">' + (isPostJune() ? 'Post-June 1 rules: unamortized bonus splits over two years.' : 'Pre-June 1: all unamortized bonus hits the old team now.') + '</p>';
  if (tr.suggestion) h += '<p>' + tr.suggestion + '</p>';
  if (tr.result) h += '<p class="' + (tr.result.ok ? 'good' : 'neg') + '">' + esc(tr.result.text) + '</p>';
  h += '<div class="actions"><button data-act="trade-ask">What would it take?</button><button data-act="trade-clear">Clear</button><button class="go" data-act="trade-propose">Propose trade</button></div></section>';
  return h;
};
function tradeSide(abbr, side, key, title) {
  var ros = roster(abbr).sort(byKey(function (p) { return p.ovr; }, true));
  var post = isPostJune(), picks = picksOf(abbr);
  var h = '<section class="card tside"><div class="card-h"><h3>' + chip(abbr) + title + '</h3><span class="muted small">' + fmtM(space(abbr)) + ' space</span></div>';
  // picks: chosen ones as removable chips, the rest behind an "Add picks" menu per year
  var chosen = picks.filter(function (k) { return side.picks.indexOf(k.id) >= 0; });
  h += '<div class="pickrow">' + chosen.map(function (k) { return '<button class="tag on" data-act="trade-toggle" data-side="' + key + '" data-kind="picks" data-id="' + k.id + '" aria-label="Remove ' + pickLabel(k) + '">' + pickLabel(k) + ' ✕</button>'; }).join('');
  var years = []; picks.forEach(function (k) { if (years.indexOf(k.year) < 0) years.push(k.year); });
  years.forEach(function (y) {
    var left = picks.filter(function (k) { return k.year === y && side.picks.indexOf(k.id) < 0; });
    if (!left.length) return;
    h += '<select class="addpick" data-act="trade-pick" data-side="' + key + '" aria-label="Add a ' + y + ' pick"><option value="">+ ' + y + ' pick</option>' + left.map(function (k) { return '<option value="' + k.id + '">' + pickLabel(k) + '</option>'; }).join('') + '</select>';
  });
  h += '</div><p class="muted small tnote">Cap hit = what the receiving team takes on (salary only; the old team keeps the bonus as dead money).</p><div class="tablewrap short"><table><tbody>';
  ros.forEach(function (p) {
    var on = side.players.indexOf(p.id) >= 0;
    var tc = Cap.tradeCost(p, S.year, post);
    h += '<tr class="' + (on ? 'sel' : '') + '"><td class="cb"><input type="checkbox" data-act="trade-toggle" data-side="' + key + '" data-kind="players" data-id="' + p.id + '"' + (on ? ' checked' : '') + ' aria-label="Include ' + esc(p.name) + '"></td><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button></td><td>' + p.pos + '</td><td class="hide-sm r">' + p.age + '</td><td>' + ovrPill(p.ovr) + '</td><td class="r">' + fmtM(tc.newHit) + '</td><td class="r muted hide-sm">' + yrsLeftStr(p) + '</td></tr>';
  });
  return h + '</tbody></table></div></section>';
}

// ---------- draft ----------
VIEWS.draft = function () {
  if (!S.draft) return '<p class="muted">The draft happens after free agency.</p>';
  var k = currentPick(), onClock = k && k.owner === S.user;
  var pool = draftPool();
  if (UI.draftPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.draftPos; });
  var h = '<div class="grid2"><section class="card"><h3>' + (k ? 'Pick ' + k.no + ' (round ' + k.round + '): ' + teamLink(k.owner) + ' on the clock' : 'Draft complete') + '</h3>';
  h += '<p class="muted small">Your picks: ' + (picksOf(S.user).filter(function (x) { return x.year === S.year; }).map(function (x) { return '#' + x.no; }).join(', ') || 'none left') + '. Rookie contracts follow the slotted wage scale.</p>';
  if (S.year === BASE.startYear && BASE.draftOrder) h += '<p class="muted small">Draft order: real ' + (S.year - 1) + ' results' + (BASE.draftOrderFinal ? ' (final).' : ' as of ' + BASE.draftOrderGames + ' of 272 games, provisional until the data is refreshed after the season.') + ' Traded and compensatory picks aren\'t included.</p>';
  h += '<div class="actions">' + (onClock ? '<span class="pill g">You are on the clock</span>' : '<button class="primary" data-act="draft-sim">Sim to my next pick</button>') + '<button data-act="draft-auto">Auto-draft the rest</button></div></section>';
  h += '<section class="card"><h3>Recent picks</h3><ul class="news">' + S.draft.made.slice(-8).reverse().map(function (m) { var p = P(m.id); return '<li>#' + m.no + ' ' + teamLink(m.team) + ' ' + (p ? p.pos + ' ' + esc(p.name) : '') + '</li>'; }).join('') + '</ul></section></div>';
  h += filterBar('draftPos') + '<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Prospect</th><th>Pos</th><th class="hide-sm">Age</th><th class="hide-sm">College</th><th>OVR</th><th>Potential</th><th class="hide-sm">Dev</th><th></th></tr></thead><tbody>';
  pool.slice(0, 80).forEach(function (p, i) {
    h += '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td>' + p.pos + '</td><td class="hide-sm">' + p.age + '</td><td class="muted hide-sm">' + esc(p.college) + '</td><td>' + ovrPill(p.ovr) + '</td><td>' + potText(p) + '</td><td class="hide-sm">' + devBadge(p) + '</td><td>' + (onClock ? '<button class="primary" data-act="draft-pick" data-id="' + p.id + '">Draft</button>' : '') + '</td></tr>';
  });
  return h + '</tbody></table></div>';
};

// ---------- schedule, standings, leaders ----------
VIEWS.schedule = function () {
  if (!S.schedule.length) return '<p class="muted">The schedule comes out when the regular season starts.</p>';
  var h = '<div class="tablewrap"><table><thead><tr><th>Week</th><th>Opponent</th><th>Result</th></tr></thead><tbody>';
  S.schedule.forEach(function (wk, i) {
    var g = wk.filter(function (g) { return g.h === S.user || g.a === S.user; })[0];
    if (!g) { h += '<tr><td>' + (i + 1) + '</td><td class="muted">Bye</td><td></td></tr>'; return; }
    var home = g.h === S.user, opp = home ? g.a : g.h, res = '';
    if (g.hs != null) { var us = home ? g.hs : g.as, them = home ? g.as : g.hs; res = '<b class="' + (us > them ? 'good' : us < them ? 'bad' : '') + '">' + (us > them ? 'W' : us < them ? 'L' : 'T') + '</b> ' + us + '-' + them; }
    h += '<tr class="' + (i === S.week ? 'sel' : '') + '"><td>' + (i + 1) + '</td><td>' + (home ? 'vs ' : 'at ') + teamLink(opp) + ' <span class="muted">' + recStr(S.teams[opp].rec) + '</span></td><td>' + res + '</td></tr>';
  });
  h += '</tbody></table></div>';
  var wi = Math.max(0, Math.min(S.week - 1, WEEKS - 1));
  if (S.week > 0) {
    h += '<h3>Week ' + (wi + 1) + ' scores</h3><div class="scores">' + S.schedule[wi].map(function (g) { return '<div class="score">' + teamLink(g.a) + ' ' + g.as + ' at ' + teamLink(g.h) + ' ' + g.hs + '</div>'; }).join('') + '</div>';
  }
  return h;
};
VIEWS.standings = function () {
  var h = '';
  if (S.playoffs) {
    h += '<section class="card"><h3>Playoffs</h3>' + (S.playoffs.champ ? '<p><b>' + teamLink(S.playoffs.champ) + ' won the Super Bowl.</b></p>' : '') + '<p class="muted small">Seeds: AFC ' + S.playoffs.AFC.join(', ') + ' · NFC ' + S.playoffs.NFC.join(', ') + '</p>';
    h += '<ul class="news">' + S.playoffs.games.map(function (g) { return '<li><span class="muted">' + ROUND_NAMES[g.round] + '</span> ' + teamLink(g.a) + ' ' + g.as + ' at ' + teamLink(g.h) + ' ' + g.hs + '</li>'; }).join('') + '</ul></section>';
  }
  h += '<div class="grid2">';
  divisionStandings().forEach(function (d) {
    h += '<section class="card"><h3>' + d.conf + ' ' + d.div + '</h3><table><thead><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th><th>OVR</th></tr></thead><tbody>' + d.teams.map(function (a) {
      var r = S.teams[a].rec; return '<tr class="' + (a === S.user ? 'sel' : '') + '"><td>' + teamLink(a) + '</td><td>' + recStr(r) + '</td><td>' + r.pf + '</td><td>' + r.pa + '</td><td>' + teamRating(a).ovr + '</td></tr>';
    }).join('') + '</tbody></table></section>';
  });
  return h + '</div>';
};
VIEWS.leaders = function () {
  var cats = [['pyd', 'Passing yards'], ['ptd', 'Passing TD'], ['ruyd', 'Rushing yards'], ['ryd', 'Receiving yards'], ['rec', 'Receptions'], ['sk', 'Sacks'], ['dint', 'Interceptions'], ['tk', 'Tackles']];
  var h = '<div class="filters">' + cats.map(function (c) { return '<button class="' + (UI.leaders === c[0] ? 'on' : '') + '" data-act="leaders" data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
  var k = UI.leaders;
  var list = S.players.filter(function (p) { return p.s && p.s[k]; }).sort(byKey(function (p) { return p.s[k]; }, true)).slice(0, 25);
  if (!list.length) return h + '<p class="muted">No games played yet this season.</p>';
  h += '<div class="tablewrap"><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th class="r">' + cats.filter(function (c) { return c[0] === k; })[0][1] + '</th><th>G</th></tr></thead><tbody>';
  list.forEach(function (p, i) { h += '<tr class="' + (p.team === S.user ? 'sel' : '') + '"><td>' + (i + 1) + '</td><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button></td><td>' + (p.team ? teamLink(p.team) : '—') + '</td><td>' + p.pos + '</td><td class="r"><b>' + p.s[k] + '</b></td><td>' + (p.s.g || 0) + '</td></tr>'; });
  return h + '</tbody></table></div>';
};
VIEWS.news = function () { return '<section class="card">' + newsList(S.news.slice(0, 120)) + '</section>'; };
VIEWS.history = function () {
  if (!S.history.length) return '<p class="muted">Finish a season to start your history.</p>';
  return '<div class="tablewrap"><table><thead><tr><th>Season</th><th>Champion</th><th>Your record</th><th>Finish</th><th>MVP</th></tr></thead><tbody>' + S.history.slice().reverse().map(function (h) {
    return '<tr><td>' + h.year + '</td><td>' + teamLink(h.champ) + '</td><td>' + h.rec + '</td><td>' + h.userFinish + '</td><td>' + esc(h.mvp) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
};

// ---------- events ----------
function onClick(e) {
  var el = e.target.closest('[data-act]'); if (!el) return;
  var a = el.getAttribute('data-act'), d = el.dataset;
  if (a === 'close-bg' && e.target !== el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'OPTION') return;
  var r;
  switch (a) {
    case 'new': if (hasSave() && !confirm('Start a new game as ' + TEAM[d.t].name + '? This replaces your saved game.')) return; var sd = document.getElementById('seed'); newGame(DATA, d.t, sd ? sd.value.trim() : null); reindex(); UI.view = 'hub'; UI.trade = null; break;
    case 'continue': loadGame(); break;
    case 'view': UI.view = d.v; UI.msg = null; UI.modal = null; UI.sheet = null; window.scrollTo(0, 0); break;
    case 'sheet': UI.sheet = UI.sheet === d.s ? null : d.s; break;
    case 'advance': r = advance(); if (!r.ok) flash(r.msg, true); else UI.msg = null; if (S.phase === 'draft' && UI.view !== 'draft') UI.view = 'draft'; if (S.phase === 'preseason' && UI.view === 'draft') UI.view = 'roster'; break;
    case 'sim-season': UI.msg = null; var g = 0; while (S.phase === 'season' && S.week < WEEKS && g++ < 30) advance(); break;
    case 'sim-playoffs': var g2 = 0; while (S.phase === 'playoffs' && !S.playoffs.champ && g2++ < 6) advance(); UI.view = 'standings'; break;
    case 'skip-fa': UI.msg = null; var g3 = 0; while (S.phase === 'fa' && g3++ < 10) advance(); UI.view = 'draft'; break;
    case 'auto-roster': var ar = userAutoRoster(); flash(ar.msg + (ar.missing ? ' Restructure a contract or cut someone to make room.' : ''), ar.missing > 0); if (ar.missing) UI.modal = makeRoomModal(); break;
    case 'make-room': UI.modal = makeRoomModal(); break;
    case 'filter': UI[d.k] = d.p; break;
    case 'sort': UI.sort = d.s; break;
    case 'leaders': UI.leaders = d.c; break;
    case 'player': UI.offer = null; UI.offerErr = null; UI.modal = playerModal(d.id); break;
    case 'close': case 'close-bg': if (UI.sheet && !UI.modal) { UI.sheet = null; break; } UI.modal = null; UI.offer = null; break;
    case 'release':
      var p = P(d.id), pv = releasePreview(p, d.j === '1');
      if (!confirm('Release ' + p.name + '? Dead money: ' + fmtM(pv.now) + ' in ' + S.year + (pv.next ? ' and ' + fmtM(pv.next) + ' in ' + (S.year + 1) : '') + '. Cap savings this year: ' + fmtM(pv.savings) + '.')) return;
      r = release(p, d.j === '1'); UI.modal = null; flash(r.ok ? p.name + ' released.' : r.msg, !r.ok); break;
    case 'restructure':
      var rp = P(d.id), res = restructurePlayer(rp, Cap.restructureMax(rp, S.year, rp.exp));
      flash(res.saved ? 'Restructured ' + rp.name + ': ' + fmtM(res.saved) + ' saved this year.' : 'Nothing to restructure.'); UI.modal = d.back === 'room' ? makeRoomModal() : playerModal(d.id); break;
    case 'offer': UI.offer = null; UI.offerErr = null; UI.modal = offerModal(d.id, d.mode); break;
    case 'offer-ask':
      var op = P(UI.offer.id), dd = Market.demand(op, marketCap(), S.year), disc = UI.offer.mode === 'extend' || S.phase === 'resign' ? 1 : 1 - Market.faDiscount(offerCtx(op, S.user).daysIntoFA);
      UI.offer.years = dd.years; UI.offer.total = +(dd.apy * dd.years * disc / 1000).toFixed(1); UI.offer.gtd = +(dd.gtd * disc / 1000).toFixed(1); UI.offer.bonus = +(dd.gtd * disc * 0.5 / 1000).toFixed(1); break;
    case 'offer-submit': submitOffer(); break;
    case 'depth':
      var arr = S.teams[S.user].depth[d.pos], i = +d.i, j = i + (+d.d);
      if (j >= 0 && j < arr.length) { var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; } break;
    case 'auto-depth': S.teams[S.user].depth = {}; autoDepth(S.user); break;
    case 'trade-toggle':
      var tr = tradeState(), side = tr[d.side][d.kind], ix = side.indexOf(d.id);
      if (ix >= 0) side.splice(ix, 1); else side.push(d.id);
      tr.result = null; tr.suggestion = null; break;
    case 'trade-with': UI.trade = null; tradeState().give.players.push(d.id); UI.modal = null; UI.view = 'trade'; break;
    case 'trade-for': var pp = P(d.id); UI.trade = null; var ts = tradeState(); ts.ai = pp.team; ts.get.players.push(d.id); UI.modal = null; UI.view = 'trade'; break;
    case 'trade-clear': UI.trade = { ai: tradeState().ai, give: { players: [], picks: [] }, get: { players: [], picks: [] } }; break;
    case 'trade-ask':
      var t2 = tradeState(), w = whatWouldItTake(t2.ai, t2.give, t2.get);
      t2.suggestion = w.done ? 'They already like this deal.' : w.options.length ? t2.ai + ' would do it if you add: ' + w.options.map(function (o) { return o.label; }).join(' or ') + '.' : 'Nothing on your side gets this done. Ask for less or take on salary.';
      break;
    case 'trade-propose':
      var t3 = tradeState(), ev = aiTradeEval(t3.ai, t3.give, t3.get);
      if (ev.accept) { executeTrade(t3.ai, t3.give, t3.get); UI.trade = { ai: t3.ai, give: { players: [], picks: [] }, get: { players: [], picks: [] }, result: { ok: true, text: 'Trade accepted.' } }; }
      else t3.result = { ok: false, text: ev.msg || t3.ai + ' turned it down.' };
      break;
    case 'draft-sim': draftUntilUser(false); break;
    case 'fifth': var fp = P(d.id), fr = decideFifthYear(fp, d.x === '1'); flash(fr.ok ? (d.x === '1' ? 'Option exercised for ' + fp.name + '.' : 'Option declined for ' + fp.name + '.') : fr.msg, !fr.ok); UI.modal = playerModal(d.id); break;
    case 'export': UI.sheet = null; exportSave(); return;
    case 'import': document.getElementById('importfile').click(); return;
    case 'draft-auto': draftUntilUser(true); flash('Draft complete. Rookies are signed to slotted contracts.'); break;
    case 'draft-pick': makePick(currentPick(), P(d.id)); draftUntilUser(false); break;
  }
  render();
}
function onChange(e) {
  var el = e.target;
  if (el.id === 'importfile') { if (el.files && el.files[0]) importSave(el.files[0]); el.value = ''; return; }
  if (el.dataset.act === 'roster-sort') { UI.sort = el.value; render(); return; }
  if (el.dataset.act === 'trade-pick') { if (el.value) { var tp = tradeState(); tp[el.dataset.side].picks.push(el.value); tp.result = null; tp.suggestion = null; } render(); return; }
  if (el.dataset.act === 'trade-team') { UI.trade = { ai: el.value, give: tradeState().give, get: { players: [], picks: [] } }; render(); return; }
  if (el.dataset.field && UI.offer) {
    var v = parseFloat(el.value); if (isNaN(v)) return;
    UI.offer[el.dataset.field] = el.dataset.field === 'years' ? clamp(Math.round(v), 1, 7) : Math.max(0, v);
    UI.offerErr = null;
    var focus = el.dataset.field;
    render();
    var again = document.querySelector('[data-field="' + focus + '"]'); if (again) { again.focus(); }
  }
}
function submitOffer() {
  var o = UI.offer, p = P(o.id);
  if (!(o.total > 0) || o.years < 1) { UI.offerErr = 'Enter a total and number of years.'; return; }
  if (o.bonus > o.total || o.gtd > o.total) { UI.offerErr = 'Bonus and guarantees can\'t exceed the total.'; return; }
  var offer = { years: o.years, total: Math.round(o.total * 1000), bonus: Math.round(o.bonus * 1000), gtd: Math.round(Math.max(o.gtd, o.bonus) * 1000) };
  var ev = Market.evaluate(p, offer, offerCtx(p, S.user));
  if (!ev.accept) { p.rej = (p.rej || 0) + 1; UI.offerErr = p.name + ' turned it down' + (ev.mood < 0.85 ? ' and was not impressed.' : '.'); return; }
  var r = o.mode === 'extend' ? extend(p, offer) : sign(p, S.user, offer);
  if (!r.ok) { UI.offerErr = r.msg; return; }
  UI.modal = null; UI.offer = null;
  flash(p.name + ' accepted: ' + o.years + ' yr, ' + fmtM(offer.total) + '.');
}

// ---------- save / load ----------
function saveSection() {
  return '<section class="savebar"><span class="muted small">Saved in this browser automatically.</span><button class="link" data-act="export">Export save</button><button class="link" data-act="import">Import save</button></section>';
}
function importInput() { return '<input type="file" id="importfile" accept=".json,application/json" hidden>'; }
function exportSave() {
  var idx = S._idx; delete S._idx; S.rng = RNG.s;
  var json = JSON.stringify({ app: 'nfl-gm', v: 1, saved: new Date().toISOString(), S: S, BASE: BASE });
  S._idx = idx;
  var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  var a = document.createElement('a');
  a.href = url; a.download = 'nfl-gm-' + S.user + '-' + S.year + '-' + S.phase + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  flash('Save exported.'); render();
}
function importSave(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var o = JSON.parse(reader.result);
      if (o.app !== 'nfl-gm' || !o.S || !o.BASE || !o.S.players || !o.S.teams) throw new Error('not a save');
      if (S && !confirm('Load this save (' + o.S.user + ', ' + o.S.year + ')? It replaces the game in progress.')) return;
      S = o.S; BASE = o.BASE; reindex(); Market.setCurve(BASE.curve); Market.setScale(S.payScale || 1); Market.setDriftScale(S.driftScale || Market.calibrateDrift(S.players)); RNG.s = S.rng || S.seed;
      UI.view = 'hub'; UI.modal = null; UI.trade = null;
      flash('Save loaded: ' + TEAM[S.user].name + ', ' + S.year + '.');
      saveGame(); render();
    } catch (e) { alert('That file isn\'t an NFL GM save.'); }
  };
  reader.readAsText(file);
}
var SAVE_KEY = 'nflgm-save-v1', saveTimer = null;
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function scheduleSave() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveGame, 400); }
function saveGame() {
  if (!S) return;
  try {
    var idx = S._idx; delete S._idx; S.rng = RNG.s;
    var json = JSON.stringify({ S: S, BASE: BASE });
    S._idx = idx;
    localStorage.setItem(SAVE_KEY, window.LZString ? 'lz:' + LZString.compressToUTF16(json) : json);
  } catch (e) { console.warn('save failed', e); flash('Could not save: browser storage is full or blocked.', true); }
}
function loadGame() {
  try {
    var raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    var json = raw.slice(0, 3) === 'lz:' ? LZString.decompressFromUTF16(raw.slice(3)) : raw;
    var o = JSON.parse(json);
    S = o.S; BASE = o.BASE; reindex(); Market.setCurve(BASE.curve); Market.setScale(S.payScale || 1); Market.setDriftScale(S.driftScale || Market.calibrateDrift(S.players)); RNG.s = S.rng || S.seed;
    UI.view = 'hub';
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}
