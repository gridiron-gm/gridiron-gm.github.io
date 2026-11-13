// Screens and interaction. Rendering is plain template strings; events are delegated via data-act.
var UI = { view: 'hub', posFilter: 'ALL', sort: 'ovr', faPos: 'ALL', trade: null, modal: null, draftPos: 'ALL', leaders: 'pyd', msg: null };
var $app = function () { return document.getElementById('app'); };

function setView(v) { UI.view = v; UI.msg = null; render(); window.scrollTo(0, 0); }
function flash(msg, bad) { UI.msg = { text: msg, bad: !!bad }; }

// ---------- formatting ----------
function ovrPill(o) { var c = o >= 85 ? 'g' : o >= 70 ? 'n' : 'w'; return '<span class="ovr ' + c + '">' + o + '</span>'; }
function capLabel() { return fmtM(capOf(S.year)) + ' cap (projected)'; }
function teamLink(a) { return chip(a) + '<b>' + a + '</b>'; }
function recStr(r) { return r.w + '-' + r.l + (r.t ? '-' + r.t : ''); }
function yrsLeftStr(p) { var n = Cap.yearsLeft(p, S.year); return n ? n + ' yr' : '—'; }
function statusStr(p) { return p.inj ? '<span class="bad">' + esc(p.injNote || 'Injured') + '</span>' : ''; }

// ---------- top-level ----------
function render() {
  if (!S) return renderStart();
  var t = TEAM[S.user], r = teamRating(S.user), sp = space(S.user);
  var nav = [['hub', 'Hub'], ['roster', 'Roster'], ['depth', 'Depth chart'], ['cap', 'Cap'], ['trade', 'Trade'], ['fa', S.phase === 'resign' ? 'Re-sign' : 'Free agents']];
  if (S.phase === 'draft') nav.push(['draft', 'Draft']);
  nav = nav.concat([['schedule', 'Schedule'], ['standings', 'Standings'], ['leaders', 'Leaders'], ['news', 'News'], ['history', 'History']]);
  var html = '<header class="top"><div class="brand">' + chip(S.user) + '<span class="tname">' + esc(t.name) + '</span>' +
    '<span class="muted">' + S.year + ' · ' + PHASE_LABEL[S.phase] + phaseDetail() + '</span></div>' +
    '<div class="topstats"><span>OVR <b>' + r.ovr + '</b></span><span>Cap space <b class="' + (sp < 0 ? 'bad' : '') + '">' + fmtM(sp) + '</b> <span class="muted">approx.</span></span>' +
    '<span>Roster <b>' + roster(S.user).length + '/' + rosterMax() + '</b></span></div>' + advanceButtons() + '</header>' +
    '<nav class="nav">' + nav.map(function (n) { return '<button class="' + (UI.view === n[0] ? 'on' : '') + '" data-act="view" data-v="' + n[0] + '">' + n[1] + '</button>'; }).join('') + '</nav>';
  if (UI.msg) html += '<div class="msg ' + (UI.msg.bad ? 'bad' : '') + '">' + esc(UI.msg.text) + '</div>';
  html += '<main>' + (VIEWS[UI.view] || VIEWS.hub)() + '</main>';
  if (UI.modal) html += '<div class="overlay" data-act="close-bg"><div class="modal">' + UI.modal() + '</div></div>';
  $app().innerHTML = html;
  scheduleSave();
}
function phaseDetail() {
  if (S.phase === 'fa') return ' · day ' + (S.faDay + 1) + ' of ' + FA_DAYS;
  if (S.phase === 'season') return ' · week ' + (S.week + 1 > WEEKS ? WEEKS : S.week + 1);
  if (S.phase === 'playoffs' && S.playoffs) return S.playoffs.champ ? ' · complete' : ' · ' + ROUND_NAMES[S.playoffs.round];
  return '';
}
function advanceButtons() {
  var label = { resign: 'Open free agency', fa: S.faDay < FA_DAYS - 1 ? 'Next FA day' : 'Go to draft', draft: 'Finish draft',
                preseason: 'Start season', season: S.week < WEEKS ? 'Sim week ' + (S.week + 1) : 'Start playoffs',
                playoffs: S.playoffs && S.playoffs.champ ? 'Start ' + (S.year + 1) + ' offseason' : 'Sim ' + (S.playoffs ? ROUND_NAMES[S.playoffs.round].toLowerCase() : 'playoffs') }[S.phase];
  var extra = '';
  if (S.phase === 'season' && S.week < WEEKS) extra = '<button data-act="sim-season">Sim to playoffs</button>';
  if (S.phase === 'playoffs' && S.playoffs && !S.playoffs.champ) extra = '<button data-act="sim-playoffs">Sim all playoffs</button>';
  if (S.phase === 'fa') extra = '<button data-act="skip-fa">Skip to draft</button>';
  if (S.phase === 'preseason') extra = '<button data-act="auto-roster">Auto-fill and cut to ' + ROSTER_MAX + '</button>';
  return '<div class="adv">' + extra + '<button class="primary" data-act="advance">' + label + ' ›</button></div>';
}

function renderStart() {
  var has = hasSave();
  $app().innerHTML = '<div class="start"><h1>NFL GM</h1><p class="muted">Real rosters and contracts (OverTheCap via nflverse). Ratings are derived from 2025–26 stats and snaps. Start in the ' + (window.DATA ? DATA.meta.startYear : 2027) + ' offseason.</p>' +
    '<p class="actions">' + (has ? '<button class="primary" data-act="continue">Continue saved game</button>' : '') + '<button data-act="import">Import save</button></p>' + importInput() +
    '<p class="seedrow"><label>Seed <input id="seed" inputmode="numeric" placeholder="random" size="10"></label> <span class="muted small">Optional. The same seed and the same moves replay the same league.</span></p>' +
    '<h2>Pick a team</h2><div class="teamgrid">' + TEAMS.slice().sort(byKey(function (t) { return t.name; })).map(function (t) {
      return '<button class="teambtn' + (t.abbr === 'NE' ? ' pick' : '') + '" data-act="new" data-t="' + t.abbr + '">' + chip(t.abbr) + '<b>' + t.abbr + '</b><span>' + esc(t.name) + '</span></button>';
    }).join('') + '</div>' + (has ? '<p class="muted small">Starting a new game replaces your saved game.</p>' : '') + '</div>';
}

// ---------- views ----------
var VIEWS = {};

VIEWS.hub = function () {
  var r = teamRating(S.user), rec = S.teams[S.user].rec, needs = teamNeeds(S.user).slice(0, 4);
  var exp = S.players.filter(function (p) { return p.rights === S.user && !p.team; });
  var lastYear = roster(S.user).filter(function (p) { return Cap.yearsLeft(p, S.year) === 1; });
  var nextGame = S.phase === 'season' && S.week < WEEKS ? S.schedule[S.week].filter(function (g) { return g.h === S.user || g.a === S.user; })[0] : null;
  var h = '<div class="grid4">' +
    metric('Team OVR', r.ovr, 'Off ' + r.off + ' · Def ' + r.def) +
    metric('Cap space', fmtM(space(S.user)), 'approx. · ' + capLabel()) +
    metric('Record', recStr(rec), S.phase === 'season' || S.phase === 'playoffs' ? divRank() : 'Season not started') +
    metric('Dead money', fmtM(Cap.teamDead(T(S.user), S.year)), S.year + ' cap') + roomMetric() + '</div>';
  h += '<div class="grid2">';
  h += '<section class="card"><h3>To do</h3><ul class="todo">' + todo(exp, lastYear, nextGame).join('') + '</ul></section>';
  h += '<section class="card"><h3>Needs</h3>' + (needs.length ? needs.map(function (n) {
    var st = starters(S.user, n.pos); return '<div class="row"><b>' + n.pos + '</b><span class="muted">' + (st.length ? 'starters ' + st.map(function (p) { return p.ovr; }).join(', ') : 'no starter') + '</span></div>';
  }).join('') : '<p class="muted">No glaring holes.</p>') + '</section></div>';
  h += '<section class="card"><h3>Team news</h3>' + newsList(S.news.filter(function (n) { return !n.team || n.team === S.user; }).slice(0, 8)) + '</section>';
  h += saveSection();
  return h;
};
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
  var sorts = { ovr: function (p) { return -p.ovr; }, cap: function (p) { return -Cap.capHit(p, S.year); }, pos: function (p) { return POSITIONS.indexOf(p.pos) * 100 - p.ovr; }, age: function (p) { return p.age; } };
  ros.sort(byKey(sorts[UI.sort]));
  var h = filterBar('posFilter') + '<div class="sortbar">Sort: ' + ['ovr', 'pos', 'cap', 'age'].map(function (s) { return '<button class="' + (UI.sort === s ? 'on' : '') + '" data-act="sort" data-s="' + s + '">' + { ovr: 'Rating', pos: 'Position', cap: 'Cap hit', age: 'Age' }[s] + '</button>'; }).join('') + '</div>';
  h += '<div class="tablewrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th class="hide-sm">POT</th><th class="r">' + S.year + ' cap hit</th><th class="r">Left</th><th class="r hide-sm">Gtd left</th><th class="r hide-sm">Dead if cut</th><th class="hide-sm"></th></tr></thead><tbody>';
  ros.forEach(function (p) {
    var pv = releasePreview(p, false);
    h += '<tr><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button> ' + statusStr(p) + '</td><td>' + p.pos + '</td><td>' + p.age + '</td><td>' + ovrPill(p.ovr) + '</td><td class="muted hide-sm">' + p.pot + '</td>' +
      '<td class="r">' + fmtM(Cap.capHit(p, S.year)) + '</td><td class="r">' + yrsLeftStr(p) + '</td><td class="r hide-sm">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td><td class="r hide-sm">' + fmtM(pv.now) + '</td>' +
      '<td class="hide-sm"><button data-act="player" data-id="' + p.id + '">Actions</button></td></tr>';
  });
  return h + '</tbody></table></div>';
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
  var h = '<p class="muted">League cap ' + fmtM(capOf(S.year)) + ' for ' + S.year + ' is projected; later years assume ~7% growth. Cap space is approximate: it counts every contract on the roster, this game\'s dead money and rollover, but not dead money from cuts made before the game started. Until week 1 only the 51 largest cap numbers count (the top-51 rule); from week 1 every contract counts. Future years are shown under the top-51 rule.</p>';
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
  h += '</tbody></table></div><h3>Contracts</h3><div class="tablewrap"><table><thead><tr><th>Player</th><th>Pos</th>' + years.map(function (y) { return '<th class="r">' + y + '</th>'; }).join('') + '<th class="r">Gtd left</th></tr></thead><tbody>';
  roster(S.user).sort(byKey(function (p) { return Cap.capHit(p, S.year); }, true)).forEach(function (p) {
    h += '<tr><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button></td><td>' + p.pos + '</td>' + years.map(function (y) {
      var r = Cap.row(p, y); return '<td class="r' + (r && r.void ? ' muted' : '') + '">' + (r ? fmtM(r.cap) + (r.void ? ' void' : '') : '') + '</td>';
    }).join('') + '<td class="r">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
};

// ---------- player card ----------
function playerModal(id) {
  return function () {
    var p = P(id); if (!p) return '';
    var mine = p.team === S.user, Y = S.year;
    var h = '<div class="mhead"><div><h2>' + esc(p.name) + '</h2><p class="muted">' + p.pos + (p.opos && p.opos !== p.pos ? ' (' + p.opos + ')' : '') + ' · age ' + p.age + ' · ' + (p.team ? teamLink(p.team) : p.rights ? 'expiring, ' + p.rights + ' has rights' : 'free agent') +
      (p.draft && p.draft[1] ? ' · drafted ' + p.draft[0] + ' R' + p.draft[1] + ' #' + p.draft[2] : '') + '</p></div><button class="x" data-act="close" aria-label="Close">✕</button></div>';
    h += '<div class="grid4">' + metric('Overall', p.ovr, 'potential ' + p.pot) + Object.keys(p.sub || {}).slice(0, 2).map(function (k) { return metric({ pass: 'Passing', acc: 'Accuracy', run: 'Rushing', prod: 'Production', tgt: 'Targets', rec: 'Receiving', rush: 'Pass rush', tkl: 'Tackling', play: 'Playmaking', cov: 'Coverage', pow: 'Leg', net: 'Net punting' }[k] || k, p.sub[k], 'from real stats'); }).join('') + '</div>';
    if (p.line26) h += '<p class="muted small">2026 (real, to date): ' + esc(p.line26) + '</p>';
    if (p.s && p.s.g) h += '<p class="small">' + S.year + ' season: ' + statText(p.s, p.pos) + '</p>';
    if (p.years && p.years.length) {
      h += '<div class="tablewrap"><table><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Bonus prorated</th><th class="r">Option (pending)</th><th class="r">Roster/other</th><th class="r">Cap hit</th><th class="r">Gtd</th><th class="r">Dead if cut pre-June 1</th></tr></thead><tbody>';
      Cap.remaining(p, Y).forEach(function (r) {
        var dc = Cap.releaseCost(p, r.y, false).dead[r.y] || 0;
        h += '<tr class="' + (r.void ? 'muted' : '') + '"><td>' + r.y + (r.void ? ' (void)' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r">' + fmtM(r.opt || 0) + '</td><td class="r">' + fmtM(r.roster + r.other) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r">' + fmtM(r.gtd) + '</td><td class="r">' + fmtM(dc) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    var fy = fifthYearInfo(p);
    if (fy) {
      h += '<div class="option"><h3>Fifth-year option: ' + fy.year + '</h3><p>' + fmtM(fy.amount) + ', fully guaranteed when exercised. <span class="muted">' + esc(fy.label) + ' (Pro Bowls: ' + (p.pb || 0) + '; playing time ' +
        Object.keys(p.pt || {}).sort().map(function (k) { return k + ' ' + Math.round(p.pt[k] * 100) + '%'; }).join(', ') + ').</span></p>';
      if (mine && fy.open) h += '<p class="muted small">Decide before the early-May deadline (before the draft ends). Declining makes him a free agent after ' + Y + '.</p><div class="actions"><button class="primary" data-act="fifth" data-id="' + p.id + '" data-x="1">Exercise option</button><button data-act="fifth" data-id="' + p.id + '" data-x="0">Decline option</button></div>';
      h += '</div>';
    } else if (p.fifth) h += '<p class="small muted">Fifth-year option ' + p.fifth + '.</p>';
    if (mine) {
      var pre = releasePreview(p, false), post = Cap.releaseCost(p, Y, true);
      h += '<div class="release"><h3>Release</h3><div class="grid2">';
      if (!isPostJune()) {
        h += '<div><b>Pre-June 1</b><br>' + fmtM(pre.now) + ' dead in ' + Y + '<br><span class="muted">Cap change ' + Y + ': ' + fmtM(pre.savings) + ' saved</span><br><button data-act="release" data-id="' + p.id + '" data-j="0">Release pre-June 1</button></div>';
        h += '<div><b>Post-June 1 designation</b><br>' + fmtM(post.dead[Y] || 0) + ' in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '<br><span class="muted">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved · ' + (canJune1(S.user) ? (2 - (S.june1[S.year + S.user] || 0)) + ' designations left' : 'none left') + '</span><br><button data-act="release" data-id="' + p.id + '" data-j="1">Designate post-June 1</button></div>';
      } else {
        h += '<div><b>After June 1</b><br>' + fmtM(post.dead[Y] || 0) + ' in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '<br><span class="muted">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved</span><br><button data-act="release" data-id="' + p.id + '" data-j="0">Release</button></div>';
      }
      h += '</div></div><div class="actions">';
      if (canExtend(p)) h += '<button data-act="offer" data-id="' + p.id + '" data-mode="extend">Extend</button>';
      var rmax = Cap.restructureMax(p, Y, p.exp);
      if (rmax > 500) {
        var n = Math.min(5, Cap.yearsLeft(p, Y));
        h += '<button data-act="restructure" data-id="' + p.id + '">Restructure (save ' + fmtM(rmax - Math.floor(rmax / n)) + ' now)</button>';
      }
      h += '<button data-act="trade-with" data-id="' + p.id + '">Shop in a trade</button></div>';
      if (rmax > 500) h += '<p class="muted small">Restructure converts ' + fmtM(rmax) + ' of ' + Y + ' base salary into a bonus prorated over ' + Math.min(5, Cap.yearsLeft(p, Y)) + ' years. Future cap hits and dead money go up.</p>';
    } else if (!p.team && !p.retired) {
      var canOffer = (S.phase === 'resign' && p.rights === S.user) || S.phase !== 'resign';
      h += '<div class="actions">' + (canOffer ? '<button class="primary" data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (p.rights === S.user ? 'Re-sign' : 'Make an offer') + '</button>' : '<span class="muted">Free agency opens after the re-sign window.</span>') + '</div>';
    } else if (p.team) {
      h += '<div class="actions"><button data-act="trade-for" data-id="' + p.id + '">Trade for him</button></div>';
    }
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
    h += '<h3>Cut options</h3><p class="muted small">Most cap freed per rating point lost. Players rated 80+ are left out; starters come last.</p>' + (o.cuts.length ? '<table><tbody>' + o.cuts.map(function (x) {
      return '<tr><td>' + esc(x.p.name) + ' <span class="muted">' + x.p.pos + ' · ' + x.p.ovr + ' · ' + (x.starter ? 'starter' : 'backup') + '</span></td><td class="r">saves ' + fmtM(x.saves) + ' (' + fmtM(x.perPoint) + '/rating pt)</td><td class="r muted">dead ' + fmtM(x.dead) + '</td><td><button data-act="player" data-id="' + x.p.id + '">Review</button></td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">No cuts that save money.</p>');
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
  var h = '<div class="tablewrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th class="hide-sm">POT</th><th class="hide-sm">Last team</th><th class="r">Asking/yr</th><th class="r">Yrs</th><th class="r hide-sm">Gtd</th><th></th></tr></thead><tbody>';
  list.forEach(function (p) {
    var d = Market.demand(p, marketCap(), S.year), disc = S.phase === 'resign' ? 1 : 1 - Market.faDiscount(offerCtx(p, S.user).daysIntoFA);
    h += '<tr><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button></td><td>' + p.pos + '</td><td>' + p.age + '</td><td>' + ovrPill(p.ovr) + '</td><td class="muted hide-sm">' + p.pot + '</td><td class="hide-sm">' + (p.prevTeam || p.cutBy || '—') + '</td>' +
      '<td class="r">' + fmtM(d.apy * disc) + '</td><td class="r">' + d.years + '</td><td class="r hide-sm">' + fmtM(d.gtd * disc) + '</td><td><button data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (resign ? 'Re-sign' : 'Offer') + '</button></td></tr>';
  });
  return h + '</tbody></table></div>';
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
  h += '<div class="grid2">' + tradeSide(S.user, tr.give, 'give', 'You send') + tradeSide(tr.ai, tr.get, 'get', tr.ai + ' sends') + '</div>';
  h += '<section class="card tradesum"><div class="row"><b>' + tr.ai + ' interest</b><span class="pill ' + label[0] + '">' + label[1] + '</span></div><div class="bar"><div style="width:' + pct + '%" class="' + label[0] + '"></div></div>';
  h += '<p class="muted small">' + (ev.msg ? '<span class="bad">' + esc(ev.msg) + '</span> ' : '') + 'Your cap after: ' + fmtM(space(S.user) + ev.capUser) + ' · ' + tr.ai + ' cap after: ' + fmtM(space(tr.ai) + ev.capAI) + (isPostJune() ? ' · post-June 1 rules: unamortized bonus splits over two years' : ' · pre-June 1: all unamortized bonus hits now') + '</p>';
  if (tr.suggestion) h += '<p>' + tr.suggestion + '</p>';
  if (tr.result) h += '<p class="' + (tr.result.ok ? 'good' : 'bad') + '">' + esc(tr.result.text) + '</p>';
  h += '<div class="actions"><button data-act="trade-ask">What would it take?</button><button data-act="trade-clear">Clear</button><button class="primary" data-act="trade-propose">Propose trade</button></div></section>';
  return h;
};
function tradeSide(abbr, side, key, title) {
  var ros = roster(abbr).sort(byKey(function (p) { return p.ovr; }, true));
  var post = isPostJune();
  var h = '<section class="card"><h3>' + chip(abbr) + title + '</h3><div class="pickrow">';
  picksOf(abbr).forEach(function (k) {
    var on = side.picks.indexOf(k.id) >= 0;
    h += '<button class="tag' + (on ? ' on' : '') + '" data-act="trade-toggle" data-side="' + key + '" data-kind="picks" data-id="' + k.id + '">' + pickLabel(k) + '</button>';
  });
  h += '</div><div class="tablewrap short"><table><tbody>';
  ros.forEach(function (p) {
    var on = side.players.indexOf(p.id) >= 0;
    var tc = Cap.tradeCost(p, S.year, post);
    h += '<tr class="' + (on ? 'sel' : '') + '"><td><input type="checkbox" data-act="trade-toggle" data-side="' + key + '" data-kind="players" data-id="' + p.id + '"' + (on ? ' checked' : '') + ' aria-label="Include ' + esc(p.name) + '"></td><td><button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button></td><td>' + p.pos + '</td><td class="hide-sm">' + p.age + '</td><td>' + ovrPill(p.ovr) + '</td><td class="r">' + fmtM(tc.newHit) + '</td><td class="r muted hide-sm">' + yrsLeftStr(p) + '</td></tr>';
  });
  return h + '</tbody></table></div><p class="muted small">Cap hit shown is what the receiving team takes on (salary only; the old team keeps the bonus as dead money).</p></section>';
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
  h += filterBar('draftPos') + '<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Prospect</th><th>Pos</th><th>Age</th><th>College</th><th>OVR</th><th>POT</th><th></th></tr></thead><tbody>';
  pool.slice(0, 80).forEach(function (p, i) {
    h += '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td>' + p.pos + '</td><td>' + p.age + '</td><td class="muted">' + esc(p.college) + '</td><td>' + ovrPill(p.ovr) + '</td><td>' + p.pot + '</td><td>' + (onClock ? '<button class="primary" data-act="draft-pick" data-id="' + p.id + '">Draft</button>' : '') + '</td></tr>';
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
  if (el.tagName === 'SELECT') return;
  var r;
  switch (a) {
    case 'new': if (hasSave() && !confirm('Start a new game as ' + TEAM[d.t].name + '? This replaces your saved game.')) return; var sd = document.getElementById('seed'); newGame(DATA, d.t, sd ? sd.value.trim() : null); reindex(); UI.view = 'hub'; UI.trade = null; break;
    case 'continue': loadGame(); break;
    case 'view': UI.view = d.v; UI.msg = null; UI.modal = null; window.scrollTo(0, 0); break;
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
    case 'close': case 'close-bg': UI.modal = null; UI.offer = null; break;
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
    case 'export': exportSave(); return;
    case 'import': document.getElementById('importfile').click(); return;
    case 'draft-auto': draftUntilUser(true); flash('Draft complete. Rookies are signed to slotted contracts.'); break;
    case 'draft-pick': makePick(currentPick(), P(d.id)); draftUntilUser(false); break;
  }
  render();
}
function onChange(e) {
  var el = e.target;
  if (el.id === 'importfile') { if (el.files && el.files[0]) importSave(el.files[0]); el.value = ''; return; }
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
  return '<section class="card"><h3>Save</h3><p class="muted small">The game saves in this browser automatically. Export a save file to back it up or move it to another device.</p><div class="actions"><button data-act="export">Export save</button><button data-act="import">Import save</button></div>' + importInput() + '</section>';
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
      S = o.S; BASE = o.BASE; reindex(); Market.setCurve(BASE.curve); Market.setScale(S.payScale || 1); RNG.s = S.rng || S.seed;
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
    S = o.S; BASE = o.BASE; reindex(); Market.setCurve(BASE.curve); Market.setScale(S.payScale || 1); RNG.s = S.rng || S.seed;
    UI.view = 'hub';
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}
