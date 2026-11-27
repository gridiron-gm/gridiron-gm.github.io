// League: Standings, Schedule, Leaders, News, History behind one toggle, plus the Bracket in the playoffs and
// the read-only Draft prospects board from late in the season until the draft.
function leagueHead(cur, sub) { return titleRow('League', segs(leagueFor(S.phase, S.week), cur), sub); }
VIEWS.standings = function () {
  var h = leagueHead('standings', S.year + ' · ' + PHASE_LABEL[S.phase]);
  if (S.playoffs && S.playoffs.champ) h += '<p class="warnbox">' + esc(TEAM[S.playoffs.champ].name) + ' won the Super Bowl.</p>';
  h += '<div class="divs">';
  divisionStandings().forEach(function (d) {
    h += '<section class="panel"><h3>' + d.conf + ' ' + d.div + '</h3><table class="dense"><thead><tr><th>Team</th><th class="r">W-L</th><th class="r hide-sm">PF</th><th class="r hide-sm">PA</th><th class="r">OVR</th></tr></thead><tbody>' + d.teams.map(function (a) {
      var r = S.teams[a].rec; return '<tr class="' + (a === S.user ? 'me' : '') + '"><td>' + teamLink(a) + '</td><td class="r">' + recStr(r) + '</td><td class="r hide-sm">' + r.pf + '</td><td class="r hide-sm">' + r.pa + '</td><td class="r">' + teamRating(a).ovr + '</td></tr>';
    }).join('') + '</tbody></table></section>';
  });
  return h + '</div>';
};
VIEWS.league = VIEWS.standings;
VIEWS.schedule = function () {
  var h = leagueHead('schedule', S.year + ' schedule');
  if (!S.schedule.length) return h + '<p class="muted">The schedule comes out when the regular season starts.</p>';
  h += '<div class="sched">';
  S.schedule.forEach(function (wk, i) {
    var g = wk.filter(function (g) { return g.h === S.user || g.a === S.user; })[0];
    if (!g) { h += '<div class="wk"><span class="n">' + (i + 1) + '</span><span class="opp muted">Bye</span><span></span></div>'; return; }
    var home = g.h === S.user, opp = home ? g.a : g.h, res = '';
    if (g.hs != null) { var us = home ? g.hs : g.as, them = home ? g.as : g.hs; res = '<span class="res"><i class="' + (us > them ? 'w' : us < them ? 'l' : 't') + '">' + (us > them ? 'W' : us < them ? 'L' : 'T') + '</i>' + us + '-' + them + '</span>'; }
    else res = '<span class="muted small">' + teamRating(opp).ovr + ' OVR</span>';
    h += '<div class="wk' + (i === S.week && S.phase === 'season' ? ' cur' : '') + '"><span class="n">' + (i + 1) + '</span><span class="opp">' + chip(opp) + (home ? 'vs ' : 'at ') + esc(TEAM[opp].name) + '<small>' + recStr(S.teams[opp].rec) + '</small></span>' + res + '</div>';
  });
  h += '</div>';
  if (S.week > 0) {
    var wi = Math.max(0, Math.min(S.week - 1, WEEKS - 1));
    h += '<h3 class="sec">Week ' + (wi + 1) + ' scores</h3><div class="scores">' + S.schedule[wi].map(function (g) {
      var aw = g.as > g.hs;
      return '<div class="score"><span class="' + (aw ? '' : 'l') + '">' + teamLink(g.a) + '</span><b class="' + (aw ? '' : 'l') + '">' + g.as + '</b><span class="' + (aw ? 'l' : '') + '">' + teamLink(g.h) + '</span><b class="' + (aw ? 'l' : '') + '">' + g.hs + '</b></div>';
    }).join('') + '</div>';
  }
  return h;
};
VIEWS.leaders = function () {
  var cats = [['pyd', 'Passing yards'], ['ptd', 'Passing TD'], ['ruyd', 'Rushing yards'], ['ryd', 'Receiving yards'], ['rec', 'Receptions'], ['sk', 'Sacks'], ['dint', 'Interceptions'], ['tk', 'Tackles']];
  var h = leagueHead('leaders', S.year + ' leaders') + '<div class="filters">' + cats.map(function (c) { return '<button class="fchip' + (UI.leaders === c[0] ? ' on' : '') + '" data-act="leaders" data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
  var k = UI.leaders, list = S.players.filter(function (p) { return p.s && p.s[k]; }).sort(byKey(function (p) { return p.s[k]; }, true)).slice(0, 25);
  if (!list.length) return h + '<p class="muted">No games played yet this season.</p>';
  h += '<section class="panel tablewrap"><table class="dense"><thead><tr><th>#</th><th></th><th>Player</th><th>Team</th><th class="hide-sm">Pos</th><th class="r">' + cats.filter(function (c) { return c[0] === k; })[0][1] + '</th><th class="r hide-sm">G</th></tr></thead><tbody>';
  list.forEach(function (p, i) { h += '<tr class="click' + (p.team === S.user ? ' me' : '') + '" data-act="player" data-id="' + p.id + '"><td>' + (i + 1) + '</td><td>' + avatar(p, 34, { s: 22 }) + '</td><td><span class="pn">' + esc(p.name) + '</span></td><td>' + (p.team ? teamLink(p.team) : '—') + '</td><td class="hide-sm">' + p.pos + '</td><td class="r"><b>' + p.s[k] + '</b></td><td class="r hide-sm">' + (p.s.g || 0) + '</td></tr>'; });
  return h + '</tbody></table></section>';
};
VIEWS.news = function () { return leagueHead('news', 'Latest first') + '<section class="panel pad">' + newsList(S.news.slice(0, 120)) + '</section>'; };
VIEWS.history = function () {
  var h = leagueHead('history', 'Your seasons');
  if (!S.history.length) return h + '<p class="muted">Finish a season to start your history.</p>';
  return h + '<section class="panel tablewrap"><table class="dense"><thead><tr><th>Season</th><th>Champion</th><th>Your record</th><th>Finish</th><th class="hide-sm">MVP</th></tr></thead><tbody>' + S.history.slice().reverse().map(function (x) {
    return '<tr><td><b>' + x.year + '</b></td><td>' + teamLink(x.champ) + '</td><td>' + x.rec + '</td><td>' + x.userFinish + '</td><td class="hide-sm">' + esc(x.mvp) + '</td></tr>';
  }).join('') + '</tbody></table></section>';
};

// Read-only board of the next class (its own random stream, so this preview is the real class).
function previewClass() {
  var y = prospectsYear(), key = y + JSON.stringify(S.classBoost || {});
  if (!UI._preview || UI._preview.key !== key) UI._preview = { key: key, list: genDraftClass(y, true) };
  return UI._preview.list;
}
VIEWS.prospects = function () {
  var pool = previewClass();
  if (UI.draftPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.draftPos; });
  return leagueHead('prospects', 'The ' + prospectsYear() + ' class · read-only. Ratings are scouting estimates and can still move before the draft.') + posChips('draftPos') + '<div class="cards">' + pool.slice(0, 100).map(function (p, i) {
    return pcard(p, { rank: i + 1, meta: esc(p.college || ''), right: '<b>' + Math.round(p.grade) + '</b><span>grade</span>' });
  }).join('') + '</div>';
};

// ---------- Playoff bracket ----------
VIEWS.bracket = function () {
  var po = S.playoffs;
  if (!po) return leagueHead('bracket', 'The bracket is set after week ' + WEEKS + '.');
  var seed = function (a) { var i = po.AFC.indexOf(a); return (i < 0 ? po.NFC.indexOf(a) : i) + 1; };
  var team = function (a, score, lost) { return '<div class="bteam' + (lost ? ' lost' : '') + (a === S.user ? ' me' : '') + '"><span class="sd">' + seed(a) + '</span><span>' + chip(a) + a + '</span><b>' + (score == null ? '' : score) + '</b></div>'; };
  var box = function (g) {
    if (!g) return '<div class="bgame tbd"><div class="bteam"><span class="sd"></span><span>TBD</span><b></b></div><div class="bteam"><span class="sd"></span><span>TBD</span><b></b></div></div>';
    var done = g.hs != null;
    return '<div class="bgame">' + team(g.a, g.as, done && g.as < g.hs) + team(g.h, g.hs, done && g.hs < g.as) + '</div>';
  };
  var games = function (conf, r) {
    var played = po.games.filter(function (g) { return g.round === r && (r === 3 || g.conf === conf); });
    if (played.length) return played;
    if (r === po.round && !po.champ) {
      if (r === 3) return [{ h: po.AFC.filter(function (x) { return po.alive[x]; })[0], a: po.NFC.filter(function (x) { return po.alive[x]; })[0] }];
      var alive = po[conf].filter(function (a) { return po.alive[a]; }), list = r === 0 ? alive.slice(1) : alive, out = [];
      for (var i = 0; i < list.length / 2; i++) out.push({ h: list[i], a: list[list.length - 1 - i] });
      return out;
    }
    return [null, null, null, null].slice(0, [3, 2, 1, 1][r]);
  };
  var col = function (conf, r) {
    return '<div class="bcol"><h4>' + (r === 0 ? 'Wild card' : r === 1 ? 'Divisional' : 'Conference') + '</h4>' + (r === 0 ? '<div class="bgame">' + team(po[conf][0], 'bye', false) + '</div>' : '') + games(conf, r).map(box).join('') + '</div>';
  };
  var h = leagueHead('bracket', S.year + ' · ' + (po.champ ? 'complete' : ROUND_NAMES[po.round] + ' next'));
  if (po.champ) h += '<section class="panel hero champ"><div class="big">' + po.champ + '</div><div class="kick">Super Bowl champions</div><h3>' + esc(TEAM[po.champ].name) + '</h3><p>' + (po.champ === S.user ? 'Your team won it all.' : 'Continue starts the next offseason.') + '</p></section>';
  h += '<div class="bracket">' + col('AFC', 0) + col('AFC', 1) + col('AFC', 2) + '<div class="bcol sb"><h4>Super Bowl</h4>' + games(null, 3).map(box).join('') + '</div>' + col('NFC', 2) + col('NFC', 1) + col('NFC', 0) + '</div>';
  return h + '<p class="note">AFC on the left, NFC on the right. The #1 seed in each conference has a bye in the wild-card round.</p>';
};
