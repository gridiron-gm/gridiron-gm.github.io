// Home and Team (Roster, Depth chart, Cap behind one toggle).

// ---------- shared pieces ----------
// A player card. opts.right = right column html; opts.slot = depth slot label; opts.rank = board rank.
function pcard(p, opts) {
  opts = opts || {};
  return '<div class="pcard tc' + tier(p.ovr) + '" role="button" tabindex="0" data-act="player" data-id="' + p.id + '">' + (opts.rank ? '<span class="rank">' + opts.rank + '</span>' : '') + avatar(p, 64) +
    '<div class="pc-main"><div class="pc-name' + nameCls(p.name) + '">' + nameHtml(p.name) + '</div>' +
    '<div class="pc-meta"><b>' + p.pos + '</b>' + (p.num != null ? ' · #' + p.num : '') + ' · ' + p.age + ' yrs · ' + (opts.meta || (p.exp ? 'Yr ' + (p.exp + 1) : 'Rookie')) + '</div>' +
    '<div class="pc-tags">' + (opts.slot ? '<span class="slot">' + opts.slot + '</span>' : '') + devBadge(p) + potText(p) + statusStr(p) + '</div></div>' +
    '<div class="pc-k">' + (opts.right != null ? opts.right : contractMini(p)) + '</div></div>';
}
function contractMini(p) {
  if (!p.years || !p.years.length) return '<b>—</b><span>unsigned</span>';
  var n = Cap.yearsLeft(p, S.year);
  return '<b>' + fmtM(Cap.capHit(p, S.year)) + '</b><span class="' + (n === 1 ? 'exp' : '') + '">' + (n === 1 ? 'Final year' : n ? n + ' yrs left' : 'void years only') + '</span>';
}
function askOf(p) {
  var d = Market.demand(p, marketCap(), S.year), disc = S.phase === 'resign' ? 1 : 1 - Market.faDiscount(offerCtx(p, S.user).daysIntoFA);
  return { apy: d.apy * disc, years: d.years, gtd: d.gtd * disc };
}
function mini(p, right) { return '<div class="mini" role="button" tabindex="0" data-act="player" data-id="' + p.id + '">' + avatar(p, 40, { shield: false }) + '<div class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></div>' + right + '</div>'; }
function expiring() { return S.players.filter(function (p) { return p.rights === S.user && !p.team; }).sort(byKey(function (p) { return p.ovr; }, true)); }
function capBar(year) {
  var team = T(S.user), y = year || S.year, capT = Cap.teamCap(team, y), used = committed(S.user, y), dead = Cap.teamDead(team, y), free = capT - used - dead;
  var pct = function (x) { return Math.max(0, Math.min(100, x / capT * 100)).toFixed(1) + '%'; };
  return '<div class="capbar"><i class="u" style="width:' + pct(used) + '"></i><i class="d" style="width:' + pct(dead) + '"></i><i class="f" style="width:' + pct(Math.max(0, free)) + '"></i></div>' +
    '<div class="cblegend"><span><i style="background:#6a92e6"></i>Contracts' + (top51(y) ? ' (top 51)' : '') + '</span><span><i style="background:var(--bad)"></i>Dead</span><span><i style="background:var(--good)"></i>' + (free < 0 ? '<b class="neg">Over by ' + fmtM(-free) + '</b>' : 'Free') + '</span></div>';
}
function roomLine() {
  var rf = rosterFill(S.user);
  if (!rf.spots) return '';
  return '<div class="kv"><span>Room needed to fill ' + ROSTER_MAX + '</span><b class="' + (rf.short ? 'neg' : '') + '">' + fmtM(rf.need) + '</b></div><div class="kv sub"><span>' + (rf.picks ? rf.picks + ' draft picks + ' : '') + rf.open + ' spots at minimum' + (rf.short ? ' · <span class="neg">' + fmtM(rf.short) + ' short</span>' : '') + '</span></div>';
}
function divRank() {
  var d = divisionStandings().filter(function (d) { return d.teams.indexOf(S.user) >= 0; })[0];
  return ['1st', '2nd', '3rd', '4th'][d.teams.indexOf(S.user)] + ' in ' + TEAM[S.user].conf + ' ' + d.div;
}
function newsList(items) {
  return items.length ? '<ul class="newsl">' + items.map(function (n) { return '<li><span class="when">' + n.y + ' ' + PHASE_LABEL[n.ph] + (n.ph === 'season' ? ' · wk ' + n.w : '') + '</span>' + esc(n.msg) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Nothing yet.</p>';
}
function teamPlayers(abbr) { return roster(abbr).concat(reserve(abbr)); }
function nextGameOf() { return S.phase === 'season' && S.week < WEEKS ? S.schedule[S.week].filter(function (g) { return g.h === S.user || g.a === S.user; })[0] : null; }

// ---------- Home ----------
VIEWS.hub = function () {
  var exp = expiring(), nextGame = nextGameOf(), lastYear = roster(S.user).filter(function (p) { return Cap.yearsLeft(p, S.year) === 1; });
  var ns = nextStep(exp, nextGame), team = T(S.user), capT = Cap.teamCap(team, S.year), dead = Cap.teamDead(team, S.year), free = capT - committed(S.user) - dead, r = teamRating(S.user);
  var h = '<div class="home"><section class="panel hero' + (ns.bad ? ' bad' : '') + '">';
  if (ns.star) h += '<div class="ghost">' + esc(lastName(ns.star.name)) + '</div><div class="star">' + avatar(ns.star, 168, { s: 64 }) + '<div class="nm">' + esc(ns.star.name) + '<small>' + ns.star.pos + ' · age ' + ns.star.age + '</small></div></div>';
  else if (ns.big) h += '<div class="big">' + ns.big + '</div>';
  h += '<div class="kick">Next action</div><h3>' + ns.title + '</h3><p>' + ns.sub + '</p><div class="btns">' + ns.btn + '</div></section>';
  h += '<section class="panel status" data-act="view" data-v="cap" role="button" tabindex="0"><div class="big2"><span>Cap space <em class="ap">approx.</em></span><b class="' + (free < 0 ? 'neg' : '') + '">' + fmtM(free) + '</b></div><div class="muted small">' + capLabel() + '</div>' + capBar() +
    '<div class="kv"><span>Dead money</span><b class="' + (dead ? 'neg' : '') + '">' + fmtM(dead) + '</b></div>' + roomLine() +
    '<div class="kv"><span>Roster</span><b>' + roster(S.user).length + ' / ' + rosterMax() + '</b></div><div class="kv"><span>Team rating</span><b>' + r.ovr + ' <small class="muted">off ' + r.off + ' · def ' + r.def + '</small></b></div>' +
    '<div class="kv"><span>' + (S.year + 1) + ' space, projected <em class="ap">approx.</em></span><b>' + fmtM(space(S.user, S.year + 1)) + '</b></div></section>';
  var td = todo(exp, lastYear, nextGame);
  h += '<section class="panel card3"><h3>Up next' + (S.quickSummary && S.quickSummary.year === S.year && S.phase === 'season' && S.week < 3 ? ' <button data-act="recap">Offseason recap ›</button>' : '') + '</h3>' + (td.length ? '<ul class="todo">' + td.slice(0, 5).join('') + '</ul>' : '<p class="muted">Nothing pressing. Press Continue when you\'re ready.</p>') + '</section>';
  var top = roster(S.user).sort(byKey(function (p) { return p.ovr; }, true)).slice(0, 4);
  h += '<section class="panel card3"><h3>Top players <button data-act="dest" data-d="team">Team ›</button></h3>' + top.map(function (p) { return mini(p, shield(p.ovr, 30)).replace('<small>' + p.pos + ' · ' + p.age + '</small>', '<small>' + p.pos + ' · ' + p.age + ' · ' + potInfo(p).trait + '</small>'); }).join('') + '</section>';
  var div = divisionStandings().filter(function (d) { return d.teams.indexOf(S.user) >= 0; })[0];
  h += '<section class="panel card3"><h3>' + TEAM[S.user].conf + ' ' + TEAM[S.user].div + ' <button data-act="dest" data-d="league">League ›</button></h3><div class="stand"><span class="h">Team</span><span class="h">OVR</span><span class="h">W-L</span>' + div.teams.map(function (a) {
    return '<span class="' + (a === S.user ? 'me' : '') + '">' + chip(a) + esc(TEAM[a].name) + '</span><span>' + teamRating(a).ovr + '</span><span>' + recStr(S.teams[a].rec) + '</span>'; }).join('') + '</div>' +
    '<div class="lbl" style="margin-top:16px">Latest</div>' + newsList(S.news.filter(function (n) { return !n.team || n.team === S.user; }).slice(0, 2)) + '</section></div>';
  return h;
};
// The single most important thing to do now, with one button. Continue (top bar) always moves the year on.
function nextStep(exp, nextGame) {
  var btn = function (act, label, extra) { return '<button class="btn pri" data-act="' + act + '"' + (extra || '') + '>' + label + '</button>'; };
  var opt = pendingOptions(S.user).filter(function (p) { return fifthYearInfo(p).open; })[0];
  if (opt) { var i = fifthYearInfo(opt); return { star: opt, title: 'Decide ' + esc(lastName(opt.name)) + '\'s fifth-year option', sub: fmtM(i.amount) + ' for ' + i.year + ', fully guaranteed if exercised. Due before the draft ends.', btn: btn('player', 'Open his card', ' data-id="' + opt.id + '"') }; }
  if (space(S.user) < 0) return { bad: true, big: fmtM(-space(S.user)) + '<small>over the cap</small>', title: 'Get under the cap', sub: 'You are ' + fmtM(-space(S.user)) + ' over. Restructure, cut or trade.', btn: btn('make-room', 'Make room') };
  var rf = rosterFill(S.user), n = roster(S.user).length;
  if (S.phase === 'preseason') return { bad: true, big: n + '<small>of ' + ROSTER_MAX + '</small>', title: 'Final cuts need you', sub: 'The automatic cutdown couldn\'t get your roster to ' + ROSTER_MAX + ' under the cap' + (rf.short ? ' (' + fmtM(rf.short) + ' short)' : '') + '. Make room, then press Continue.', btn: btn('view', 'Make room', ' data-v="cuts"') };
  if (S.phase === 'season' && n < ROSTER_MAX)
    return { bad: !!rf.short, big: n + '<small>of ' + ROSTER_MAX + '</small>', title: 'Fill your roster to ' + ROSTER_MAX, sub: n + ' players now.' + (rf.short ? ' You need ' + fmtM(rf.short) + ' more room.' : ''), btn: rf.short ? btn('make-room', 'Make room') : btn('auto-roster', 'Auto-fill') };
  switch (S.phase) {
    case 'resign': return { big: exp.length + '<small>expiring</small>', title: 'Re-sign your expiring players', sub: exp.length + ' contracts expired. Anyone you don\'t re-sign hits free agency. Or let the AI run your whole offseason to week 1.', btn: btn('view', 'Review', ' data-v="resign"') + '<button class="btn" data-act="auto-manage">Auto-manage offseason</button>' };
    case 'fa': return { big: 'Day ' + (S.faDay + 1) + '<small>of ' + FA_DAYS + '</small>', title: 'Free agency is open', sub: 'Asks drop each day, but other teams sign players too. ' + fmtM(space(S.user)) + ' of room.', btn: btn('view', 'Browse free agents', ' data-v="fa"') };
    case 'draft':
      if (!draftLeft()) return { big: roster(S.user).length + '<small>on the roster</small>', title: 'Draft complete', sub: 'Continue runs final cuts to ' + ROSTER_MAX + ' for every team and starts week 1. You only stop if your roster can\'t get there under the cap.', btn: btn('view', 'See your picks', ' data-v="draft"') };
      var k = currentPick(); return k && k.owner === S.user ? { big: '#' + k.no + '<small>round ' + k.round + '</small>', title: 'You\'re on the clock', sub: 'Pick ' + k.no + ', round ' + k.round + '.', btn: btn('view', 'Draft board', ' data-v="draft"') } : { big: k ? '#' + k.no + '<small>on the clock</small>' : '', title: 'The draft is on', sub: 'Continue sims to your next pick.', btn: btn('view', 'Draft board', ' data-v="draft"') };
    case 'season':
      if (nextGame) { var opp = nextGame.h === S.user ? nextGame.a : nextGame.h; return { big: 'Wk ' + (S.week + 1) + '<small>' + (nextGame.h === S.user ? 'home' : 'away') + '</small>', title: (nextGame.h === S.user ? 'vs ' : 'at ') + esc(TEAM[opp].name), sub: 'Their team rating ' + teamRating(opp).ovr + ', yours ' + teamRating(S.user).ovr + '. Continue plays the week.', btn: btn('view', 'Schedule', ' data-v="schedule"') }; }
      return { title: 'Regular season over', sub: 'The playoff field is set. Continue starts the playoffs.', btn: btn('view', 'Standings', ' data-v="standings"') };
    default: return { big: S.playoffs && S.playoffs.champ ? S.playoffs.champ + '<small>champions</small>' : '', title: S.playoffs && S.playoffs.champ ? esc(TEAM[S.playoffs.champ].name) + ' won the Super Bowl' : 'Playoffs', sub: S.playoffs && S.playoffs.champ ? 'Continue starts the next offseason.' : 'Continue sims the next round.', btn: btn('view', 'Bracket', ' data-v="bracket"') };
  }
}
function todo(exp, lastYear, nextGame) {
  var out = [];
  pendingOptions(S.user).forEach(function (p) { var i = fifthYearInfo(p); if (i.open) out.push('<li>Fifth-year option decision: <button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button> (' + fmtM(i.amount) + ' for ' + i.year + ', due before the draft ends)</li>'); });
  if (S.phase === 'resign') out.push('<li>' + exp.length + ' expiring players can be re-signed before free agency. <button class="link" data-act="view" data-v="resign">Review</button></li>');
  if (S.phase === 'fa') out.push('<li>Free agency day ' + (S.faDay + 1) + ': other teams sign players each day. <button class="link" data-act="view" data-v="fa">Browse free agents</button></li>');
  if (S.phase === 'draft' && draftLeft()) out.push('<li>The draft is on. <button class="link" data-act="view" data-v="draft">Go to the draft board</button></li>');
  var rf = rosterFill(S.user);
  if ((S.phase === 'preseason' || S.phase === 'season') && roster(S.user).length < ROSTER_MAX)
    out.push('<li class="bad">Roster is under ' + ROSTER_MAX + ' (' + roster(S.user).length + ' players).' + (rf.short ? ' You need ' + fmtM(rf.short) + ' more room to fill it.' : '') + ' <button class="link" data-act="make-room">Make room</button></li>');
  else if (rf.short && S.phase !== 'playoffs') out.push('<li class="bad">Filling ' + ROSTER_MAX + ' needs ' + fmtM(rf.need) + ' but you have ' + fmtM(rf.room) + ' at week-1 counting: ' + fmtM(rf.short) + ' short. <button class="link" data-act="make-room">Make room</button></li>');
  if (nextGame) out.push('<li>Week ' + (S.week + 1) + ': ' + (nextGame.h === S.user ? 'vs ' : 'at ') + teamLink(nextGame.h === S.user ? nextGame.a : nextGame.h) + ' (' + teamRating(nextGame.h === S.user ? nextGame.a : nextGame.h).ovr + ' OVR)</li>');
  if (S.phase === 'season' && S.week === TRADE_DEADLINE_WEEK) out.push('<li>Last week before the trade deadline. <button class="link" data-act="view" data-v="trade">Trade</button></li>');
  if (lastYear.length && S.phase !== 'playoffs') out.push('<li>' + lastYear.length + ' players are in the last year of their deal: ' + lastYear.sort(byKey(function (p) { return p.ovr; }, true)).slice(0, 4).map(function (p) { return '<button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button>'; }).join(', ') + '</li>');
  if (space(S.user) < 0) out.push('<li class="bad">You are over the cap. Release, trade or restructure players.</li>');
  return out;
}

// ---------- Team: Roster ----------
var POS_GROUPS = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OT: 'Offensive tackles', IOL: 'Interior line', EDGE: 'Edge rushers', DL: 'Defensive line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', P: 'Punters', LS: 'Long snappers' };
var RGROUPS = [['ALL', 'All'], ['OFF', 'Offense'], ['DEF', 'Defense'], ['ST', 'Special teams'], ['FINAL', 'Final year']];
function inGroup(p, g) { return g === 'ALL' || (g === 'OFF' && OFF.indexOf(p.pos) >= 0) || (g === 'DEF' && DEF.indexOf(p.pos) >= 0) || (g === 'ST' && /^(K|P|LS)$/.test(p.pos)) || (g === 'FINAL' && Cap.yearsLeft(p, S.year) === 1); }
var SORTS = [['pos', 'By position'], ['ovr', 'By rating'], ['cap', 'By cap hit'], ['age', 'By age']];
VIEWS.roster = function () {
  var all = roster(S.user), ros = all.filter(function (p) { return inGroup(p, UI.rgroup); }), slots = slotMap(S.user);
  var h = titleRow('Team', segs(TEAM_SCREENS, 'roster'), all.length + ' players · ' + fmtM(committed(S.user)) + ' committed' + (top51(S.year) ? ' (top 51)' : '') + ' · ' + Object.keys(slots).length + ' starters');
  var menu = SORTS.map(function (s) { return [(UI.sort === s[0] ? '✓ ' : '') + s[1], 'roster-sort', { s: s[0] }]; }).concat(['-', [(UI.rosterMode === 'list' ? 'Card view' : 'List view'), 'roster-mode', { m: UI.rosterMode === 'list' ? 'cards' : 'list' }]]);
  h += '<div class="filters">' + RGROUPS.map(function (g) { return '<button class="fchip' + (UI.rgroup === g[0] ? ' on' : '') + '" data-act="rgroup" data-p="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '<div class="seg">' + kebab('roster', menu, true) + '</div></div>';
  if (!ros.length) return h + '<p class="muted">Nobody here.</p>';
  var sorts = { ovr: function (p) { return -p.ovr; }, cap: function (p) { return -Cap.capHit(p, S.year); }, age: function (p) { return p.age; } };
  var groups = [];
  if (UI.sort === 'pos' || !sorts[UI.sort]) {
    var depth = S.teams[S.user].depth;
    POSITIONS.forEach(function (pos) {
      var grp = ros.filter(function (p) { return p.pos === pos; });
      if (!grp.length) return;
      var order = depth[pos] || [];
      grp.sort(byKey(function (p) { var i = order.indexOf(p.id); return i < 0 ? 999 - p.ovr : i; }));
      groups.push([POS_GROUPS[pos], grp]);
    });
  } else groups.push([null, ros.slice().sort(byKey(sorts[UI.sort]))]);
  if (UI.rosterMode === 'list') {
    h += '<div class="panel tablewrap"><table class="dense"><thead><tr><th></th><th>Player</th><th>Pos</th><th class="r">Age</th><th class="hide-sm">Potential</th><th class="hide-sm">Dev</th><th class="r">' + S.year + ' cap</th><th class="r">Left</th><th class="r hide-sm">Gtd left</th><th class="r hide-sm">Dead if cut</th></tr></thead><tbody>';
    groups.forEach(function (g) {
      g[1].forEach(function (p) {
        h += '<tr class="click" data-act="player" data-id="' + p.id + '"><td>' + avatar(p, 34, { s: 22 }) + '</td><td><span class="pn">' + esc(p.name) + '</span> ' + (slots[p.id] ? '<span class="slot">' + slots[p.id] + '</span>' : '') + statusStr(p) + '</td><td>' + p.pos + '</td><td class="r">' + p.age + '</td><td class="hide-sm">' + potText(p) + '</td><td class="hide-sm">' + devBadge(p) + '</td>' +
          '<td class="r">' + fmtM(Cap.capHit(p, S.year)) + '</td><td class="r">' + yrsLeftStr(p) + '</td><td class="r hide-sm">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td><td class="r hide-sm">' + fmtM(releasePreview(p, false).now) + '</td></tr>';
      });
    });
    return h + '</tbody></table></div>';
  }
  groups.forEach(function (g) {
    if (g[0]) h += '<div class="grp"><h3>' + g[0] + '</h3><span>' + g[1].length + ' · ' + fmtM(sumBy(g[1], function (p) { return Cap.capHit(p, S.year); })) + '</span></div>';
    h += '<div class="cards">' + g[1].map(function (p) { return pcard(p, { slot: slots[p.id] }); }).join('') + '</div>';
  });
  var ir = reserve(S.user).filter(function (p) { return inGroup(p, UI.rgroup); });
  if (ir.length) h += '<div class="grp"><h3>Injured reserve</h3><span>' + ir.length + ' · off the 53, still on the cap</span></div><div class="cards">' + ir.map(function (p) { return pcard(p); }).join('') + '</div>';
  return h;
};

// ---------- Team: Depth chart ----------
VIEWS.depth = function () {
  var t = S.teams[S.user], r = teamRating(S.user);
  var h = titleRow('Team', segs(TEAM_SCREENS, 'depth'), 'Offense ' + r.off + ' · Defense ' + r.def + ' · injured players are skipped on game day', kebab('depth', [['Reset to best available', 'auto-depth']], true)) + '<div class="depthgrid">';
  POSITIONS.forEach(function (pos) {
    var ids = (t.depth[pos] || []).filter(function (id) { var p = P(id); return p && p.team === S.user; }), nS = Market.STARTERS[pos];
    h += '<section class="panel"><h3>' + POS_GROUPS[pos] + '<small>' + nS + ' start</small></h3>';
    if (!ids.length) h += '<p class="bad">Nobody at ' + pos + '.</p>';
    ids.forEach(function (id, i) {
      var p = P(id), lab = i < nS ? (nS === 1 && /^(K|P|LS)$/.test(pos) ? pos : pos + (i + 1)) : '';
      h += '<div class="drow' + (i < nS ? ' starter' : '') + '"><span class="no' + (lab ? '' : ' bk') + '">' + (lab ? '<span class="slot">' + lab + '</span>' : i + 1) + '</span>' + avatar(p, 34, { s: 22 }) +
        '<button class="nm" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button>' + statusStr(p) +
        '<button class="mv" data-act="depth" data-pos="' + pos + '" data-i="' + i + '" data-d="-1" aria-label="Move ' + esc(p.name) + ' up"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button class="mv" data-act="depth" data-pos="' + pos + '" data-i="' + i + '" data-d="1" aria-label="Move ' + esc(p.name) + ' down"' + (i === ids.length - 1 ? ' disabled' : '') + '>▼</button></div>';
    });
    h += '</section>';
  });
  return h + '</div>';
};

// ---------- Team: Cap ----------
VIEWS.cap = function () {
  var team = T(S.user), years = [0, 1, 2, 3, 4].map(function (i) { return S.year + i; }), sp = space(S.user), rf = rosterFill(S.user);
  var h = titleRow('Team', segs(TEAM_SCREENS, 'cap'), capLabel());
  h += '<section class="panel pad" style="margin-bottom:14px"><div class="ps-row caprow">' +
    '<div class="stat"><span>League cap' + (capProjected(S.year) ? ' (projected)' : '') + '</span><b>' + fmtM(capOf(S.year)) + '</b></div><div class="stat"><span>Contracts' + (top51(S.year) ? ' (top 51)' : '') + '</span><b>' + fmtM(committed(S.user)) + '</b></div>' +
    '<div class="stat"><span>Dead money</span><b class="' + (Cap.teamDead(team, S.year) ? 'neg' : '') + '">' + fmtM(Cap.teamDead(team, S.year)) + '</b></div><div class="stat"><span>Cap space (approx.)</span><b class="' + (sp < 0 ? 'neg' : 'good') + '">' + fmtM(sp) + '</b></div>' +
    '<div class="stat"><span>Room needed to fill ' + ROSTER_MAX + '</span><b class="' + (rf.short ? 'neg' : '') + '">' + fmtM(rf.need) + '</b></div></div>' + capBar() + '</section>';
  h += '<section class="panel tablewrap" style="margin-bottom:14px"><table class="dense"><thead><tr><th></th>' + years.map(function (y, i) { return '<th class="r' + (i > 2 ? ' hide-sm' : '') + '">' + y + '</th>'; }).join('') + '</tr></thead><tbody>';
  var row = function (label, f, cls) { return '<tr class="' + (cls || '') + '"><td>' + label + '</td>' + years.map(function (y, i) { return '<td class="r' + (i > 2 ? ' hide-sm' : '') + '">' + f(y) + '</td>'; }).join('') + '</tr>'; };
  h += row('League cap', function (y) { return fmtM(capOf(y)) + (capProjected(y) ? ' <span class="muted small">proj.</span>' : ''); });
  h += row('Rollover', function (y) { return fmtM((team.rollover || {})[y] || 0); });
  h += row('Active contracts', function (y) { return fmtM(committed(S.user, y)) + (top51(y) ? ' <span class="muted small">top 51</span>' : ''); });
  h += row('Dead money', function (y) { return fmtM(Cap.teamDead(team, y)); });
  h += row('Cap space (approx.)', function (y) { var s = space(S.user, y); return '<b class="' + (s < 0 ? 'bad' : '') + '">' + fmtM(s) + '</b>'; }, 'total');
  h += row('Room needed to fill ' + ROSTER_MAX, function (y) { return y === S.year ? '<span class="' + (rf.short ? 'bad' : '') + '">' + fmtM(rf.need) + '</span>' : ''; });
  h += row('Players under contract', function (y) { return teamPlayers(S.user).filter(function (p) { var r = Cap.row(p, y); return r && !r.void; }).length; });
  h += '</tbody></table></section><h3 class="sec">Contracts</h3><section class="panel tablewrap"><table class="dense"><thead><tr><th></th><th>Player</th><th class="hide-sm">Pos</th>' + years.map(function (y, i) { return '<th class="r' + (i > 2 ? ' hide-sm' : '') + '">' + y + '</th>'; }).join('') + '<th class="r hide-sm">Gtd left</th></tr></thead><tbody>';
  teamPlayers(S.user).sort(byKey(function (p) { return Cap.capHit(p, S.year); }, true)).forEach(function (p) {
    h += '<tr class="click" data-act="player" data-id="' + p.id + '"><td>' + avatar(p, 30, { shield: false }) + '</td><td><span class="pn">' + esc(p.name) + '</span>' + (p.ir ? ' <span class="inj">IR</span>' : '') + '</td><td class="hide-sm">' + p.pos + '</td>' + years.map(function (y, i) {
      var r = Cap.row(p, y); return '<td class="r' + (r && r.void ? ' muted' : '') + (i > 2 ? ' hide-sm' : '') + '">' + (r ? fmtM(r.cap) + (r.void ? ' void' : '') : '') + '</td>';
    }).join('') + '<td class="r hide-sm">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td></tr>';
  });
  return h + '</tbody></table></section><p class="note">League cap ' + fmtM(capOf(S.year)) + ' for ' + S.year + (capProjected(S.year) ? ' is projected' : ' is the real figure') + '; later years are projected at ~7% growth. Cap space is approximate: it counts every contract on the roster, this game\'s dead money and rollover, but not dead money from cuts made before the game started. Until week 1 only the 51 largest cap numbers count (the top-51 rule); from week 1 every contract counts. Future years are shown under the top-51 rule.</p>';
};
