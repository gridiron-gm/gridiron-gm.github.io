// Screens and interaction (Gridiron GM). Rendering is plain template strings; events are delegated via data-act.
// Which screens exist right now is decided by 55-phases.js; locked screens never render.
var UI = { sheet: null, view: 'hub', leagueView: 'standings', rgroup: 'ALL', sort: 'pos', rosterMode: 'cards', faPos: 'ALL', trade: null, modal: null, draftPos: 'ALL', leaders: 'pyd', msg: null };
var $app = function () { return document.getElementById('app'); };

function setView(v) { UI.view = v; UI.msg = null; render(); }
function flash(msg, bad) { UI.msg = { text: msg, bad: !!bad }; }

// ---------- formatting ----------
// Rating shield, colored by tier: 90+ gold, 80s green, 70s blue, 60s gray, under 60 dark.
function tier(o) { return o >= 90 ? '90' : o >= 80 ? '80' : o >= 70 ? '70' : o >= 60 ? '60' : '50'; }
function shield(o, s) { return '<span class="shield t' + tier(o) + '"' + (s ? ' style="--s:' + s + 'px"' : '') + '><span>' + o + '</span></span>'; }
function ovrPill(o, big) { return shield(o, big ? 64 : 32); }
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
function potRange(i) { return i.exact ? '' + i.lo : i.lo + '–' + i.hi; }
function potText(p) { var i = potInfo(p); return '<span class="pot">POT <b>' + i.grade + '</b> ' + potRange(i) + '</span>'; }
function devBadge(p) { var t = potInfo(p).trait; return '<span class="dev dev-' + t.toLowerCase() + '">' + t + '</span>'; }
function capLabel() { return fmtM(capOf(S.year)) + ' cap (projected)'; }
function teamLink(a) { return '<span class="tl-team">' + chip(a) + '<b>' + a + '</b></span>'; }
function recStr(r) { return r.w + '-' + r.l + (r.t ? '-' + r.t : ''); }
function yrsLeftStr(p) { var n = Cap.yearsLeft(p, S.year); return n ? n + ' yr' : '—'; }
function statusStr(p) { return p.inj ? ' <span class="inj">' + esc(p.injNote || 'Injured') + '</span>' : ''; }
// Full names everywhere: long names get a smaller font instead of being cut to an initial.
function nameCls(n) { var L = String(n).length; return L > 21 ? ' n4' : L > 18 ? ' n3' : L > 15 ? ' n2' : ''; }
function nameHtml(n) { n = String(n); var i = n.indexOf(' '); return i < 0 ? esc(n) : '<span class="fn">' + esc(n.slice(0, i)) + '</span> ' + esc(n.slice(i + 1)); }
function heroCls(last) { var L = String(last).length; return L > 14 ? 'n4' : L > 11 ? 'n3' : L > 9 ? 'n2' : ''; }
function lastName(n) { n = String(n); var i = n.indexOf(' '); return i < 0 ? n : n.slice(i + 1); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
// Starters from the depth chart, labeled by slot (QB1, WR2 ...). Specialists are just "K", "P", "LS".
function slotMap(abbr) {
  var t = S.teams[abbr], out = {};
  POSITIONS.forEach(function (pos) {
    var ids = (t.depth[pos] || []).filter(function (id) { var p = P(id); return p && p.team === abbr; });
    for (var i = 0; i < Math.min(ids.length, Market.STARTERS[pos]); i++) out[ids[i]] = Market.STARTERS[pos] === 1 && /^(K|P|LS)$/.test(pos) ? pos : pos + (i + 1);
  });
  return out;
}
// Position-specific sub-rating labels come with the data; older saves fall back to the old two-rating names.
var OLD_SUB = { pass: 'Passing', acc: 'Accuracy', run: 'Rushing', prod: 'Production', tgt: 'Targets', rec: 'Receiving', rush: 'Pass rush', tkl: 'Tackling', play: 'Playmaking', cov: 'Coverage', pow: 'Leg', net: 'Net punting' };
function subList(p) {
  var labels = ((typeof DATA !== 'undefined' && DATA && DATA.meta.subLabels) || (BASE && BASE.subLabels) || {})[p.pos] || [];
  var keys = Object.keys(p.sub || {}), out = [];
  labels.forEach(function (l) { if (p.sub && p.sub[l[0]] != null) out.push([l[1], p.sub[l[0]]]); });
  if (!out.length) keys.forEach(function (k) { out.push([OLD_SUB[k] || k, p.sub[k]]); });
  return out;
}

// ---------- icons ----------
var ICONS = { hub: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  roster: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8',
  resign: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 17l2.5-2.5L17 8', fa: 'M12 5v14M5 12h14',
  trade: 'M4 8h14l-4-4M20 16H6l4 4', draft: 'M4 4h16v4H4zM6 8v12h12V8M10 12h4', prospects: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5',
  cuts: 'M6 6l12 12M18 6L6 18', bracket: 'M4 5h5v5H4zM4 14h5v5H4zM9 7.5h4v9H9M13 12h7', league: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  depth: 'M4 6h16M4 12h10M4 18h6', cap: 'M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6', more: 'M5 12h.01M12 12h.01M19 12h.01' };
function icon(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[k] || ICONS.more) + '"/></svg>'; }

// ---------- top-level ----------
function render() {
  if (!S) return renderStart();
  if (!screenOpen(UI.view)) UI.view = 'hub';
  if (LEAGUE_SCREENS.indexOf(UI.view) >= 0) UI.leagueView = UI.view;
  var enter = UI._lastView !== UI.view;
  var html = '<div class="app" style="' + teamVars(S.user) + '">' + headerHtml() + timelineHtml() + tabsHtml();
  if (UI.msg) html += '<div class="msg' + (UI.msg.bad ? ' bad' : '') + '" role="status">' + esc(UI.msg.text) + '</div>';
  html += '<main' + (enter ? ' class="enter"' : '') + '>' + (VIEWS[UI.view] || VIEWS.hub)() + saveSection() + '</main>' + tabbarHtml();
  if (UI.sheet === 'more') html += moreHtml();
  if (UI.modal) {
    html += '<div class="overlay" data-act="close-bg"><div class="sheet' + (UI.modal.narrow ? ' narrow' : '') + (UI.modalNew ? ' rise' : '') + '" role="dialog" aria-modal="true">' + UI.modal() + '</div></div>';
    UI.modalNew = false;
  }
  html += importInput() + '</div>';
  $app().innerHTML = html;
  // any change of screen (menu, tab bar, or a game action that switches screens) starts at the top
  if (enter) { UI._lastView = UI.view; window.scrollTo(0, 0); }
  scheduleSave();
}
function openModal(f) { UI.modal = f; UI.modalNew = true; }
function headerHtml() {
  var t = TEAM[S.user], r = teamRating(S.user), sp = space(S.user);
  return '<header class="top"><div class="brand">Gridiron GM</div><div class="tbadge">' + S.user + '</div><div class="teamname"><h1>' + esc(t.name) + '</h1><div>' + S.year + ' · ' + recStr(S.teams[S.user].rec) + ' · ' + t.conf + ' ' + t.div + '</div></div>' +
    '<div class="topstats"><div class="tstat"><span>Team</span><b>' + shield(r.ovr, 36) + '</b></div>' +
    '<div class="tstat"><span><span class="lbl-l">Cap space</span><span class="lbl-s">Cap</span> <em class="ap">approx.</em></span><b class="' + (sp < 0 ? 'neg' : '') + '">' + fmtM(sp) + '</b></div>' +
    '<div class="tstat"><span>Roster</span><b>' + roster(S.user).length + '<small>/ ' + rosterMax() + '</small></b></div></div>' + advanceButtons() + '</header>';
}
function phaseDetail() {
  if (S.phase === 'fa') return ' · day ' + (S.faDay + 1) + ' of ' + FA_DAYS;
  if (S.phase === 'season') return ' · week ' + (S.week + 1 > WEEKS ? WEEKS : S.week + 1);
  if (S.phase === 'playoffs' && S.playoffs) return S.playoffs.champ ? ' · complete' : ' · ' + ROUND_NAMES[S.playoffs.round];
  return '';
}
function timelineHtml() {
  var tl = timeline(S.phase, S.week), nx = tl.filter(function (t) { return t.state === 'next'; })[0];
  var full = '<nav class="timeline" aria-label="Season">' + tl.map(function (t) { return '<div class="tl ' + t.state + '"><b>' + t.label + '</b><small>' + t.sub + '</small></div>'; }).join('') + '</nav>';
  var compact = '<div class="tlc"><div class="pips">' + tl.map(function (t) { return '<i class="' + t.state + '"></i>'; }).join('') + '</div><b>Now · ' + PHASE_LABEL[S.phase] + phaseDetail() + '</b><span>Next: ' + nx.label + ', ' + nx.sub.charAt(0).toLowerCase() + nx.sub.slice(1) + '</span></div>';
  return full + compact;
}
function viewFor(v) { return v === 'league' ? UI.leagueView || 'standings' : v; }
function tabsHtml() {
  var on = navTab(UI.view), ph = phaseScreens(S.phase, S.week);
  var b = function (v, cls) { return '<button class="tab' + cls + (on === v ? ' on' : '') + '" data-act="view" data-v="' + v + '">' + SCREEN_LABEL[v] + '</button>'; };
  return '<nav class="tabs" aria-label="Screens">' + ALWAYS_SCREENS.map(function (v) { return b(v, ''); }).join('') + '<span class="tabsep">' + PHASE_LABEL[S.phase] + '</span>' + ph.map(function (v) { return b(v, ' ph'); }).join('') + '</nav>';
}
function tabbarItems() { return ['hub', 'roster'].concat(phaseScreens(S.phase, S.week)).concat(['league']).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 4); }
function tabbarHtml() {
  var on = navTab(UI.view), ph = phaseScreens(S.phase, S.week), items = tabbarItems();
  var label = { prospects: 'Prospects', fa: 'Free agents', cuts: 'Cuts' };
  return '<nav class="tabbar" aria-label="Screens">' + items.map(function (v) {
    return '<button class="' + (on === v ? 'on' : '') + (ph.indexOf(v) >= 0 ? ' ph' : '') + '" data-act="view" data-v="' + v + '">' + icon(v) + (label[v] || SCREEN_LABEL[v]) + '</button>';
  }).join('') + '<button class="' + (UI.sheet === 'more' || items.indexOf(on) < 0 ? 'on' : '') + '" data-act="sheet" data-s="more">' + icon('more') + 'More</button></nav>';
}
function moreHtml() {
  var on = navTab(UI.view), ph = phaseScreens(S.phase, S.week), items = tabbarItems();
  var rest = screensFor(S.phase, S.week).filter(function (v) { return items.indexOf(v) < 0; });
  return '<div class="morebg" data-act="sheet" data-s="more"></div><div class="more"><h4>' + PHASE_LABEL[S.phase] + '</h4><div class="mgrid">' + rest.map(function (v) {
    return '<button class="' + (on === v ? 'on' : '') + (ph.indexOf(v) >= 0 ? ' ph' : '') + '" data-act="view" data-v="' + v + '">' + SCREEN_LABEL[v] + '</button>';
  }).join('') + '</div><h4>Save</h4><div class="mgrid"><button data-act="export">Export save</button><button data-act="import">Import save</button></div></div>';
}
function advanceLabel() {
  return { resign: 'Open free agency', fa: S.faDay < FA_DAYS - 1 ? 'Next FA day' : 'Go to draft', draft: 'Finish draft',
           preseason: 'Start season', season: S.week < WEEKS ? 'Sim week ' + (S.week + 1) : 'Start playoffs',
           playoffs: S.playoffs && S.playoffs.champ ? 'Start ' + (S.year + 1) + ' offseason' : 'Sim ' + (S.playoffs ? ROUND_NAMES[S.playoffs.round].toLowerCase() : 'playoffs') }[S.phase];
}
function advanceButtons() {
  var extra = '';
  if (S.phase === 'season' && S.week < WEEKS) extra = '<button class="btn sm" data-act="sim-season">Sim to playoffs</button>';
  if (S.phase === 'playoffs' && S.playoffs && !S.playoffs.champ) extra = '<button class="btn sm" data-act="sim-playoffs">Sim all playoffs</button>';
  if (S.phase === 'fa') extra = '<button class="btn sm" data-act="skip-fa">Skip to draft</button>';
  if (S.phase === 'preseason') extra = '<button class="btn sm" data-act="auto-roster">Auto-fill to ' + ROSTER_MAX + '</button>';
  return '<div class="adv"><button class="btn pri" data-act="advance">' + advanceLabel() + ' ›</button>' + extra + '</div>';
}

// ---------- start screen ----------
function renderStart() {
  var has = hasSave();
  $app().innerHTML = '<div class="startpage"><div class="start"><h1 class="logo"><span>Franchise mode</span>Gridiron GM</h1>' +
    '<p class="lead">Real rosters and contracts (OverTheCap via nflverse). Ratings come from 2024–26 stats and snaps. You start in the ' + (window.DATA ? DATA.meta.startYear : 2027) + ' offseason.</p>' +
    '<div class="btns">' + (has ? '<button class="btn pri" data-act="continue">Continue saved game</button>' : '') + '<button class="btn" data-act="import">Import save</button></div>' + importInput() +
    '<p class="seedrow"><label for="seed">Seed</label><input id="seed" inputmode="numeric" placeholder="random" size="10"><span>Optional. The same seed and the same moves replay the same league.</span></p>' +
    '<h2 class="h3">Pick a team</h2><div class="teamgrid">' + TEAMS.slice().sort(byKey(function (t) { return t.name; })).map(function (t) {
      return '<button class="teambtn" style="' + teamVars(t.abbr) + '" data-act="new" data-t="' + t.abbr + '"><b>' + t.abbr + '</b><span>' + esc(t.name) + '</span></button>';
    }).join('') + '</div>' + (has ? '<p class="note">Starting a new game replaces your saved game.</p>' : '') + '</div></div>';
}

// ---------- shared pieces ----------
var VIEWS = {};
function h2(title, sub, btns) { return '<div class="h2"><h2>' + title + '</h2>' + (sub ? '<span>' + sub + '</span>' : '') + (btns ? '<div class="btns">' + btns + '</div>' : '') + '</div>'; }
// A player card. opts.right = right column html; opts.slot = depth slot label; opts.rank = board rank.
function pcard(p, opts) {
  opts = opts || {};
  return '<div class="pcard tc' + tier(p.ovr) + '" role="button" tabindex="0" data-act="player" data-id="' + p.id + '">' + (opts.rank ? '<span class="rank">' + opts.rank + '</span>' : '') + shield(p.ovr) +
    '<div class="pc-main"><div class="pc-name' + nameCls(p.name) + '">' + nameHtml(p.name) + '</div>' +
    '<div class="pc-meta"><b>' + p.pos + '</b> · ' + p.age + ' yrs · ' + (opts.meta || (p.exp ? 'Yr ' + (p.exp + 1) : 'Rookie')) + '</div>' +
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
function mini(p, right) { return '<div class="mini">' + shield(p.ovr, 30) + '<div class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></div>' + right + '</div>'; }
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
function nextGameOf() { return S.phase === 'season' && S.week < WEEKS ? S.schedule[S.week].filter(function (g) { return g.h === S.user || g.a === S.user; })[0] : null; }

// ---------- Hub ----------
VIEWS.hub = function () {
  var exp = expiring(), nextGame = nextGameOf();
  var lastYear = roster(S.user).filter(function (p) { return Cap.yearsLeft(p, S.year) === 1; });
  var ns = nextStep(exp, nextGame);
  var h = '<div class="hub"><section class="panel hero' + (ns.bad ? ' bad' : '') + '">';
  if (ns.star) h += '<div class="ghost">' + esc(lastName(ns.star.name)) + '</div><div class="star">' + shield(ns.star.ovr, 92) + '<div class="nm">' + esc(ns.star.name) + '<small>' + ns.star.pos + ' · age ' + ns.star.age + '</small></div></div>';
  else if (ns.big) h += '<div class="big">' + ns.big + '</div>';
  h += '<div class="kick">Next action</div><h3>' + ns.title + '</h3><p>' + ns.sub + '</p><div class="btns">' + ns.btn + '</div></section>';
  h += capTile();
  var tiles = phaseScreens(S.phase, S.week).map(phaseTile).filter(Boolean);
  var td = todo(exp, lastYear, nextGame);
  if (td.length) tiles.push('<section class="panel tile static wide"><div class="tile-h"><h3 class="ttl">To do</h3><div class="big">' + td.length + '<small>' + (td.length === 1 ? 'item' : 'items') + '</small></div></div><div class="pv"><ul class="todo">' + td.join('') + '</ul></div></section>');
  tiles.push(rosterTile(), depthTile(), leagueTile(), newsTile());
  var rem = tiles.length % 3;   // no holes in the desktop grid: the last tile stretches
  if (rem) tiles[tiles.length - 1] = tiles[tiles.length - 1].replace('class="panel tile', 'class="panel tile ' + (rem === 1 ? 'w12' : 'w8'));
  return h + tiles.join('') + '</div>';
};
function tileOpen(v, cls) { return '<section class="panel tile' + (cls || '') + '" data-act="view" data-v="' + v + '">'; }
function tileHead(title, big, small) { return '<div class="tile-h"><h3 class="ttl">' + title + '</h3><div class="big">' + big + '<small>' + small + '</small></div></div>'; }
function capTile() {
  var team = T(S.user), capT = Cap.teamCap(team, S.year), used = committed(S.user), dead = Cap.teamDead(team, S.year), free = capT - used - dead;
  var top = roster(S.user).sort(byKey(function (p) { return Cap.capHit(p, S.year); }, true)).slice(0, 3);
  return tileOpen('cap', ' wide') + '<div class="tile-h"><div><h3 class="ttl">Cap</h3><span class="muted small">' + capLabel() + '</span></div><div class="big ' + (free < 0 ? 'neg' : '') + '">' + fmtM(free) + '<small>space approx.</small></div></div>' +
    '<div class="pv">' + capBar() + '<div class="kv"><span>Contracts' + (top51(S.year) ? ' (top 51)' : '') + '</span><b>' + fmtM(used) + '</b></div><div class="kv"><span>Dead money</span><b class="' + (dead ? 'neg' : '') + '">' + fmtM(dead) + '</b></div>' + roomLine() +
    '<div class="kv"><span>' + (S.year + 1) + ' space, projected <em class="ap">approx.</em></span><b>' + fmtM(space(S.user, S.year + 1)) + '</b></div>' +
    '<div class="lbl" style="margin-top:14px">Top cap hits</div>' + top.map(function (p) { return mini(p, '<div class="val">' + fmtM(Cap.capHit(p, S.year)) + '<small>' + yrsLeftStr(p) + ' left</small></div>'); }).join('') + '</div><div class="go">Open cap ›</div></section>';
}
function phaseTile(v) {
  if (v === 'resign') {
    var exp = expiring();
    return tileOpen('resign', ' ph') + tileHead('Re-sign', exp.length, 'expiring') + '<div class="pv">' + exp.slice(0, 3).map(function (p) { return mini(p, '<div class="val">' + fmtM(askOf(p).apy) + '<small>ask / yr</small></div>'); }).join('') + '</div><div class="go">Review all ›</div></section>';
  }
  if (v === 'fa') {
    var pool = freeAgents().sort(byKey(function (p) { return p.ovr; }, true)), n75 = pool.filter(function (p) { return p.ovr >= 75; }).length;
    return tileOpen('fa', ' ph') + tileHead(S.phase === 'preseason' ? 'Late market' : 'Free agency', n75, 'rated 75+') + '<div class="pv">' + pool.slice(0, 3).map(function (p) { return mini(p, '<div class="val">' + fmtM(askOf(p).apy) + '<small>ask / yr</small></div>'); }).join('') + '</div><div class="go">Browse free agents ›</div></section>';
  }
  if (v === 'draft') {
    var k = currentPick(), mine = picksOf(S.user).filter(function (x) { return x.year === S.year && !draftedWith(x); });
    return tileOpen('draft', ' ph') + tileHead('Draft', k ? '#' + k.no : 'Done', k ? 'on the clock: ' + k.owner : 'draft complete') + '<div class="pv"><div class="tokens">' + mine.map(function (x) { return '<span class="token' + (x.round === 1 ? ' r1' : '') + '">R' + x.round + (x.no ? ' #' + x.no : '') + '</span>'; }).join('') + '</div></div><div class="go">Draft board ›</div></section>';
  }
  if (v === 'prospects') {
    var cls = previewClass().slice(0, 3);
    return tileOpen('prospects', ' ph') + tileHead('Prospects', prospectsYear(), 'draft class') + '<div class="pv">' + cls.map(function (p) { return mini(p, '<div class="val">' + potInfo(p).grade + '<small>potential</small></div>'); }).join('') + '</div><div class="go">Scout the class ›</div></section>';
  }
  if (v === 'cuts') {
    var n = roster(S.user).length, rf = rosterFill(S.user);
    return tileOpen('cuts', ' ph') + tileHead('Make room', n + '<small style="display:inline;font-size:16px"> / ' + ROSTER_MAX + '</small>', n > ROSTER_MAX ? (n - ROSTER_MAX) + ' to cut' : n < ROSTER_MAX ? (ROSTER_MAX - n) + ' to add' : 'at 53') +
      '<div class="pv"><div class="kv"><span>Room at week-1 counting</span><b>' + fmtM(rf.room) + '</b></div>' + (rf.short ? '<div class="kv"><span>Short to fill ' + ROSTER_MAX + '</span><b class="neg">' + fmtM(rf.short) + '</b></div>' : '') + '</div><div class="go">Cutdowns and restructures ›</div></section>';
  }
  if (v === 'trade') {
    var picks = picksOf(S.user).filter(function (x) { return x.year === S.year && !draftedWith(x); });
    if (!picks.length) picks = picksOf(S.user).filter(function (x) { return x.year === S.year + 1; });
    return tileOpen('trade', ' ph') + tileHead('Trade', picks.length, (picks[0] ? picks[0].year : S.year) + ' picks') + '<div class="pv"><div class="tokens">' + picks.map(function (x) { return '<span class="token' + (x.round === 1 ? ' r1' : '') + '">R' + x.round + (x.no ? ' #' + x.no : '') + '</span>'; }).join('') + '</div>' +
      '<p class="muted small" style="margin:12px 0 0">' + (S.phase === 'season' ? 'Deadline after week ' + TRADE_DEADLINE_WEEK + '. ' + plural(Math.max(0, TRADE_DEADLINE_WEEK - S.week), 'week') + ' left.' : 'Open through the preseason, then until the week-' + TRADE_DEADLINE_WEEK + ' deadline.') + '</p></div><div class="go">Make a trade ›</div></section>';
  }
  if (v === 'bracket') {
    var po = S.playoffs, conf = TEAM[S.user].conf, sd = po ? po[conf].indexOf(S.user) + 1 : 0;
    var status = !sd ? 'Missed the playoffs' : po.champ === S.user ? 'Super Bowl champions' : po.alive[S.user] ? 'Still alive' : 'Eliminated in the ' + ROUND_NAMES[po.elim[S.user]].toLowerCase();
    return tileOpen('bracket', ' ph') + tileHead('Playoffs', sd ? '#' + sd : '—', sd ? conf + ' seed' : 'no seed') + '<div class="pv"><p style="margin:0">' + status + '.</p><p class="muted small">' + (po && po.champ ? TEAM[po.champ].name + ' won the Super Bowl.' : 'Next: ' + (po ? ROUND_NAMES[po.round] : '')) + '</p></div><div class="go">Bracket ›</div></section>';
  }
  return '';
}
function draftedWith(k) { return S.draft && S.draft.made.some(function (m) { return k.no && m.no === k.no && k.year === S.year; }); }
function rosterTile() {
  var top = roster(S.user).sort(byKey(function (p) { return p.ovr; }, true));
  return tileOpen('roster') + tileHead('Roster', top.length, 'of ' + rosterMax()) + '<div class="pv">' + top.slice(0, 3).map(function (p) { return mini(p, devBadge(p)); }).join('') + '</div><div class="go">View roster ›</div></section>';
}
function depthTile() {
  var r = teamRating(S.user), needs = teamNeeds(S.user).slice(0, 3);
  return tileOpen('depth') + tileHead('Depth chart', r.ovr, 'team ovr') + '<div class="pv">' + [['Offense', r.off], ['Defense', r.def]].map(function (u) {
    return '<div class="unit"><span>' + u[0].toUpperCase() + '</span><div class="bar"><i style="width:' + clamp((u[1] - 50) * 2, 0, 100) + '%"></i></div><b>' + u[1] + '</b></div>';
  }).join('') + '<p class="muted small" style="margin:8px 0 0">' + (needs.length ? 'Thin at ' + needs.map(function (n) { return n.pos; }).join(', ') : 'No glaring holes') + '</p></div><div class="go">Set lineup ›</div></section>';
}
function leagueTile() {
  var t = TEAM[S.user], div = divisionStandings().filter(function (d) { return d.teams.indexOf(S.user) >= 0; })[0];
  return tileOpen('league') + tileHead('League', recStr(S.teams[S.user].rec), S.phase === 'season' || S.phase === 'playoffs' ? divRank() : t.conf + ' ' + t.div) +
    '<div class="pv"><div class="stand"><span class="h">' + t.conf + ' ' + t.div + '</span><span class="h">OVR</span><span class="h">W-L</span>' + div.teams.map(function (a) {
      return '<span class="' + (a === S.user ? 'me' : '') + '">' + chip(a) + esc(TEAM[a].name) + '</span><span>' + teamRating(a).ovr + '</span><span>' + recStr(S.teams[a].rec) + '</span>';
    }).join('') + '</div></div><div class="go">Standings, schedule, leaders ›</div></section>';
}
function newsTile() {
  var nw = S.news.filter(function (n) { return !n.team || n.team === S.user; }).slice(0, 3);
  return tileOpen('news') + tileHead('News', S.news.length, S.news.length === 1 ? 'story' : 'stories') + '<div class="pv">' + newsList(nw) + '</div><div class="go">All news ›</div></section>';
}
// The single most important thing to do now, with one button.
function nextStep(exp, nextGame) {
  var btn = function (act, label, extra) { return '<button class="btn pri" data-act="' + act + '"' + (extra || '') + '>' + label + '</button>'; };
  var opt = pendingOptions(S.user).filter(function (p) { return fifthYearInfo(p).open; })[0];
  if (opt) { var i = fifthYearInfo(opt); return { star: opt, title: 'Decide ' + esc(lastName(opt.name)) + '\'s fifth-year option', sub: fmtM(i.amount) + ' for ' + i.year + ', fully guaranteed if exercised. Due before the draft ends.', btn: btn('player', 'Open his card', ' data-id="' + opt.id + '"') }; }
  if (space(S.user) < 0) return { bad: true, big: fmtM(-space(S.user)) + '<small>over the cap</small>', title: 'Get under the cap', sub: 'You are ' + fmtM(-space(S.user)) + ' over. Restructure, cut or trade.', btn: btn('make-room', 'Make room') };
  var rf = rosterFill(S.user), n = roster(S.user).length;
  if ((S.phase === 'preseason' || S.phase === 'season') && n < ROSTER_MAX)
    return { bad: !!rf.short, big: n + '<small>of ' + ROSTER_MAX + '</small>', title: 'Fill your roster to ' + ROSTER_MAX, sub: n + ' players now.' + (rf.short ? ' You need ' + fmtM(rf.short) + ' more room.' : ''), btn: rf.short ? btn('make-room', 'Make room') : btn('auto-roster', 'Auto-fill') };
  if (S.phase === 'preseason' && n > ROSTER_MAX) return { big: n + '<small>of ' + ROSTER_MAX + '</small>', title: 'Cut down to ' + ROSTER_MAX, sub: n + ' players on the roster.', btn: btn('view', 'Make cuts', ' data-v="cuts"') + '<button class="btn" data-act="auto-roster">Auto-cut</button>' };
  switch (S.phase) {
    case 'resign': return { big: exp.length + '<small>expiring</small>', title: 'Re-sign your expiring players', sub: exp.length + ' contracts expired. Anyone you don\'t re-sign hits free agency.', btn: btn('view', 'Review', ' data-v="resign"') };
    case 'fa': return { big: 'Day ' + (S.faDay + 1) + '<small>of ' + FA_DAYS + '</small>', title: 'Free agency is open', sub: 'Asks drop each day, but other teams sign players too. ' + fmtM(space(S.user)) + ' of room.', btn: btn('view', 'Browse free agents', ' data-v="fa"') };
    case 'draft': var k = currentPick(); return k && k.owner === S.user ? { big: '#' + k.no + '<small>round ' + k.round + '</small>', title: 'You\'re on the clock', sub: 'Pick ' + k.no + ', round ' + k.round + '.', btn: btn('view', 'Draft board', ' data-v="draft"') } : { big: k ? '#' + k.no + '<small>on the clock</small>' : '', title: 'The draft is on', sub: 'Sim to your next pick or auto-draft.', btn: btn('view', 'Draft board', ' data-v="draft"') };
    case 'preseason': return { big: ROSTER_MAX + '<small>on the roster</small>', title: 'Start the season', sub: 'Roster is at ' + ROSTER_MAX + '. Check the depth chart first if you like.', btn: btn('advance', 'Start season') };
    case 'season':
      if (nextGame) { var opp = nextGame.h === S.user ? nextGame.a : nextGame.h; return { big: 'Wk ' + (S.week + 1) + '<small>' + (nextGame.h === S.user ? 'home' : 'away') + '</small>', title: (nextGame.h === S.user ? 'vs ' : 'at ') + esc(TEAM[opp].name), sub: 'Their team rating ' + teamRating(opp).ovr + ', yours ' + teamRating(S.user).ovr + '.', btn: btn('advance', 'Sim week ' + (S.week + 1)) }; }
      return { title: 'Regular season over', sub: 'The playoff field is set.', btn: btn('advance', 'Start playoffs') };
    default: return { big: S.playoffs && S.playoffs.champ ? S.playoffs.champ + '<small>champions</small>' : '', title: S.playoffs && S.playoffs.champ ? esc(TEAM[S.playoffs.champ].name) + ' won the Super Bowl' : 'Playoffs', sub: S.playoffs && S.playoffs.champ ? 'Start the next offseason when you\'re ready.' : 'Sim the next round.', btn: btn('view', 'Bracket', ' data-v="bracket"') + '<button class="btn" data-act="advance">' + advanceLabel() + '</button>' };
  }
}
function todo(exp, lastYear, nextGame) {
  var out = [];
  pendingOptions(S.user).forEach(function (p) { var i = fifthYearInfo(p); if (i.open) out.push('<li>Fifth-year option decision: <button class="link" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button> (' + fmtM(i.amount) + ' for ' + i.year + ', due before the draft ends)</li>'); });
  if (S.phase === 'resign') out.push('<li>' + exp.length + ' expiring players can be re-signed before free agency. <button class="link" data-act="view" data-v="resign">Review</button></li>');
  if (S.phase === 'fa') out.push('<li>Free agency day ' + (S.faDay + 1) + ': other teams sign players each day. <button class="link" data-act="view" data-v="fa">Browse free agents</button></li>');
  if (S.phase === 'draft') out.push('<li>The draft is on. <button class="link" data-act="view" data-v="draft">Go to the draft board</button></li>');
  if (S.phase === 'preseason') out.push('<li>Get to ' + ROSTER_MAX + ' players (now ' + roster(S.user).length + '). <button class="link" data-act="auto-roster">Auto-fill and cut</button></li>');
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

// ---------- Roster ----------
var POS_GROUPS = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OT: 'Offensive tackles', IOL: 'Interior line', EDGE: 'Edge rushers', DL: 'Defensive line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', P: 'Punters', LS: 'Long snappers' };
var RGROUPS = [['ALL', 'All'], ['OFF', 'Offense'], ['DEF', 'Defense'], ['ST', 'Special teams'], ['FINAL', 'Final year']];
function inGroup(p, g) { return g === 'ALL' || (g === 'OFF' && OFF.indexOf(p.pos) >= 0) || (g === 'DEF' && DEF.indexOf(p.pos) >= 0) || (g === 'ST' && /^(K|P|LS)$/.test(p.pos)) || (g === 'FINAL' && Cap.yearsLeft(p, S.year) === 1); }
VIEWS.roster = function () {
  var all = roster(S.user), ros = all.filter(function (p) { return inGroup(p, UI.rgroup); }), slots = slotMap(S.user);
  var h = h2('Roster', all.length + ' players · ' + fmtM(committed(S.user)) + ' committed' + (top51(S.year) ? ' (top 51)' : '') + ' · ' + Object.keys(slots).length + ' starters');
  h += '<div class="filters">' + RGROUPS.map(function (g) { return '<button class="fchip' + (UI.rgroup === g[0] ? ' on' : '') + '" data-act="rgroup" data-p="' + g[0] + '">' + g[1] + '</button>'; }).join('') +
    '<div class="seg"><select data-act="roster-sort" aria-label="Sort">' + [['pos', 'By position'], ['ovr', 'Rating'], ['cap', 'Cap hit'], ['age', 'Age']].map(function (o) { return '<option value="' + o[0] + '"' + (UI.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
    '<button class="fchip' + (UI.rosterMode === 'cards' ? ' on' : '') + '" data-act="roster-mode" data-m="cards">Cards</button><button class="fchip' + (UI.rosterMode === 'list' ? ' on' : '') + '" data-act="roster-mode" data-m="list">List</button></div></div>';
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
        h += '<tr class="click" data-act="player" data-id="' + p.id + '"><td>' + shield(p.ovr, 30) + '</td><td><span class="pn">' + esc(p.name) + '</span> ' + (slots[p.id] ? '<span class="slot">' + slots[p.id] + '</span>' : '') + statusStr(p) + '</td><td>' + p.pos + '</td><td class="r">' + p.age + '</td><td class="hide-sm">' + potText(p) + '</td><td class="hide-sm">' + devBadge(p) + '</td>' +
          '<td class="r">' + fmtM(Cap.capHit(p, S.year)) + '</td><td class="r">' + yrsLeftStr(p) + '</td><td class="r hide-sm">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td><td class="r hide-sm">' + fmtM(releasePreview(p, false).now) + '</td></tr>';
      });
    });
    return h + '</tbody></table></div>';
  }
  groups.forEach(function (g) {
    if (g[0]) h += '<div class="grp"><h3>' + g[0] + '</h3><span>' + g[1].length + ' · ' + fmtM(sumBy(g[1], function (p) { return Cap.capHit(p, S.year); })) + '</span></div>';
    h += '<div class="cards">' + g[1].map(function (p) { return pcard(p, { slot: slots[p.id] }); }).join('') + '</div>';
  });
  return h;
};

// ---------- Depth chart ----------
VIEWS.depth = function () {
  var t = S.teams[S.user], r = teamRating(S.user);
  var h = h2('Depth chart', 'Offense ' + r.off + ' · Defense ' + r.def + ' · injured players are skipped on game day', '<button class="btn sm" data-act="auto-depth">Reset to best available</button>') + '<div class="depthgrid">';
  POSITIONS.forEach(function (pos) {
    var ids = (t.depth[pos] || []).filter(function (id) { var p = P(id); return p && p.team === S.user; }), nS = Market.STARTERS[pos];
    h += '<section class="panel"><h3>' + POS_GROUPS[pos] + '<small>' + nS + ' start</small></h3>';
    if (!ids.length) h += '<p class="bad">Nobody at ' + pos + '.</p>';
    ids.forEach(function (id, i) {
      var p = P(id), lab = i < nS ? (nS === 1 && /^(K|P|LS)$/.test(pos) ? pos : pos + (i + 1)) : '';
      h += '<div class="drow' + (i < nS ? ' starter' : '') + '"><span class="no' + (lab ? '' : ' bk') + '">' + (lab ? '<span class="slot">' + lab + '</span>' : i + 1) + '</span>' + shield(p.ovr, 30) +
        '<button class="nm" data-act="player" data-id="' + p.id + '">' + esc(p.name) + '</button>' + statusStr(p) +
        '<button class="mv" data-act="depth" data-pos="' + pos + '" data-i="' + i + '" data-d="-1" aria-label="Move ' + esc(p.name) + ' up"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button class="mv" data-act="depth" data-pos="' + pos + '" data-i="' + i + '" data-d="1" aria-label="Move ' + esc(p.name) + ' down"' + (i === ids.length - 1 ? ' disabled' : '') + '>▼</button></div>';
    });
    h += '</section>';
  });
  return h + '</div>';
};

// ---------- Cap ----------
VIEWS.cap = function () {
  var team = T(S.user), years = [0, 1, 2, 3, 4].map(function (i) { return S.year + i; }), sp = space(S.user), rf = rosterFill(S.user);
  var h = h2('Cap', capLabel());
  h += '<section class="panel pad" style="margin-bottom:14px"><div class="ps-row" style="grid-template-columns:repeat(5,1fr)">' +
    '<div class="stat"><span>League cap (projected)</span><b>' + fmtM(capOf(S.year)) + '</b></div><div class="stat"><span>Contracts' + (top51(S.year) ? ' (top 51)' : '') + '</span><b>' + fmtM(committed(S.user)) + '</b></div>' +
    '<div class="stat"><span>Dead money</span><b class="' + (Cap.teamDead(team, S.year) ? 'neg' : '') + '">' + fmtM(Cap.teamDead(team, S.year)) + '</b></div><div class="stat"><span>Cap space (approx.)</span><b class="' + (sp < 0 ? 'neg' : 'good') + '">' + fmtM(sp) + '</b></div>' +
    '<div class="stat"><span>Room needed to fill ' + ROSTER_MAX + '</span><b class="' + (rf.short ? 'neg' : '') + '">' + fmtM(rf.need) + '</b></div></div>' + capBar() + '</section>';
  h += '<section class="panel tablewrap" style="margin-bottom:14px"><table class="dense"><thead><tr><th></th>' + years.map(function (y) { return '<th class="r">' + y + '</th>'; }).join('') + '</tr></thead><tbody>';
  var row = function (label, f, cls) { return '<tr class="' + (cls || '') + '"><td>' + label + '</td>' + years.map(function (y) { return '<td class="r">' + f(y) + '</td>'; }).join('') + '</tr>'; };
  h += row('League cap (projected)', function (y) { return fmtM(capOf(y)); });
  h += row('Rollover', function (y) { return fmtM((team.rollover || {})[y] || 0); });
  h += row('Active contracts', function (y) { return fmtM(committed(S.user, y)) + (top51(y) ? ' <span class="muted small">top 51</span>' : ''); });
  h += row('Dead money', function (y) { return fmtM(Cap.teamDead(team, y)); });
  h += row('Cap space (approx.)', function (y) { var s = space(S.user, y); return '<b class="' + (s < 0 ? 'bad' : '') + '">' + fmtM(s) + '</b>'; }, 'total');
  h += row('Room needed to fill ' + ROSTER_MAX, function (y) { return y === S.year ? '<span class="' + (rf.short ? 'bad' : '') + '">' + fmtM(rf.need) + '</span>' : ''; });
  h += row('Players under contract', function (y) { return roster(S.user).filter(function (p) { var r = Cap.row(p, y); return r && !r.void; }).length; });
  h += '</tbody></table></section><h3 class="sec">Contracts</h3><section class="panel tablewrap"><table class="dense"><thead><tr><th>Player</th><th class="hide-sm">Pos</th>' + years.map(function (y, i) { return '<th class="r' + (i > 2 ? ' hide-sm' : '') + '">' + y + '</th>'; }).join('') + '<th class="r hide-sm">Gtd left</th></tr></thead><tbody>';
  roster(S.user).sort(byKey(function (p) { return Cap.capHit(p, S.year); }, true)).forEach(function (p) {
    h += '<tr class="click" data-act="player" data-id="' + p.id + '"><td><span class="pn">' + esc(p.name) + '</span></td><td class="hide-sm">' + p.pos + '</td>' + years.map(function (y, i) {
      var r = Cap.row(p, y); return '<td class="r' + (r && r.void ? ' muted' : '') + (i > 2 ? ' hide-sm' : '') + '">' + (r ? fmtM(r.cap) + (r.void ? ' void' : '') : '') + '</td>';
    }).join('') + '<td class="r hide-sm">' + fmtM(Cap.gtdLeft(p, S.year)) + '</td></tr>';
  });
  return h + '</tbody></table></section><p class="note">League cap ' + fmtM(capOf(S.year)) + ' for ' + S.year + ' is projected; later years assume ~7% growth. Cap space is approximate: it counts every contract on the roster, this game\'s dead money and rollover, but not dead money from cuts made before the game started. Until week 1 only the 51 largest cap numbers count (the top-51 rule); from week 1 every contract counts. Future years are shown under the top-51 rule.</p>';
};

// ---------- Player card ----------
function findPlayer(id) { return P(id) || (UI._preview && UI._preview.list.filter(function (p) { return p.id === id; })[0]); }
function playerModal(id) {
  return function () {
    var p = findPlayer(id); if (!p) return '';
    var mine = p.team === S.user, Y = S.year, pi = potInfo(p);
    var who = p.prospect ? (p.college ? esc(p.college) : 'Draft prospect') : p.team ? esc(TEAM[p.team].name) : p.rights ? 'Expiring · ' + p.rights + ' has rights' : p.retired ? 'Retired' : 'Free agent';
    var h = '<div class="ps-hero" style="' + teamVars(p.team || p.rights || S.user) + '"><div class="ghost">' + esc(lastName(p.name)) + '</div><button class="x" data-act="close" aria-label="Close">✕</button>' + shield(p.ovr, 132) +
      '<div class="ps-id"><h2 class="' + heroCls(lastName(p.name)) + '">' + (p.name.indexOf(' ') > 0 ? '<span class="fn">' + esc(p.name.split(' ')[0]) + '</span>' + esc(lastName(p.name)) : esc(p.name)) + '</h2>' +
      '<div class="ps-meta"><b>' + p.pos + (p.opos && p.opos !== p.pos ? ' (' + p.opos + ')' : '') + '</b><span>Age ' + p.age + '</span><span>' + who + '</span>' + (p.draft && p.draft[1] ? '<span>' + p.draft[0] + ' R' + p.draft[1] + ' #' + p.draft[2] + '</span>' : '') + (p.inj ? '<span class="inj">' + esc(p.injNote || 'Injured') + '</span>' : '') + '</div></div></div><div class="ps-body">';
    var tiles = [['Potential', '<b>' + pi.grade + '<small>' + potRange(pi) + '</small></b>'], ['Dev trait', '<div style="margin-top:6px">' + devBadge(p) + '</div>']];
    if (p.years && p.years.length) tiles.push(['This year', '<b>' + fmtM(Cap.capHit(p, Y)) + '</b>'], ['Years left', '<b>' + (Cap.yearsLeft(p, Y) || '—') + '</b>']);
    else if (!p.prospect) { var a = askOf(p); tiles.push(['Asking', '<b>' + fmtM(a.apy) + '<small>/ yr</small></b>'], ['Years', '<b>' + a.years + '</b>']); }
    else tiles.push(['Draft class', '<b>' + p.draft[0] + '</b>'], ['Grade', '<b>' + Math.round(p.grade) + '</b>']);
    h += '<div class="ps-row">' + tiles.map(function (t) { return '<div class="stat"><span>' + t[0] + '</span>' + t[1] + '</div>'; }).join('') + '</div>';
    var subs = subList(p);
    if (subs.length) h += '<h3 class="sec">Ratings <small>from 2024–26 stats, recent seasons weighted most</small></h3><div class="ps-row r3">' + subs.map(function (s) {
      return '<div class="stat tc' + tier(s[1]) + '"><div class="attr"><span>' + s[0] + '</span><b>' + s[1] + '</b><div class="bar"><i style="width:' + s[1] + '%"></i></div></div></div>';
    }).join('') + '</div>';
    var lines = (p.lines || (p.line26 ? [[2026, p.prevTeam || '', p.line26]] : [])).slice();
    if (p.s && p.s.g) lines.push([Y, p.team || '', statText(p.s, p.pos) + ' <span class="muted">(this season)</span>']);
    if (p.last && p.last.g && Y - 1 > 2026 && !lines.some(function (l) { return +l[0] === Y - 1; })) lines.push([Y - 1, '', statText(p.last, p.pos) + ' <span class="muted">(simulated)</span>']);
    lines.sort(function (a, b) { return a[0] - b[0]; });
    if (lines.length) h += '<h3 class="sec">Stats</h3><div class="tablewrap"><table class="dense seasons"><tbody>' + lines.map(function (l) { return '<tr><td>' + l[0] + '</td><td>' + (l[1] ? teamLink(l[1]) : '') + '</td><td>' + (/<span/.test(l[2]) ? l[2] : esc(l[2])) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (p.years && p.years.length) {
      h += '<h3 class="sec">Contract</h3><div class="ps-row"><div class="stat"><span>Cap hit ' + Y + '</span><b>' + fmtM(Cap.capHit(p, Y)) + '</b></div><div class="stat"><span>Gtd left</span><b>' + fmtM(Cap.gtdLeft(p, Y)) + '</b></div><div class="stat"><span>Signed</span><b>' + (p.signed || '—') + '</b></div><div class="stat"><span>APY</span><b>' + fmtM(p.apy || 0) + '</b></div></div>';
      h += '<div class="tablewrap" style="margin-top:12px"><table class="dense"><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Bonus</th><th class="r hide-sm">Option</th><th class="r hide-sm">Roster/other</th><th class="r">Cap hit</th><th class="r hide-sm">Gtd</th><th class="r">Dead if cut</th></tr></thead><tbody>';
      Cap.remaining(p, Y).forEach(function (r) {
        h += '<tr class="' + (r.void ? 'void' : '') + '"><td>' + r.y + (r.void ? ' void' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r hide-sm">' + fmtM(r.opt || 0) + '</td><td class="r hide-sm">' + fmtM(r.roster + r.other) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r hide-sm">' + fmtM(r.gtd) + '</td><td class="r">' + fmtM(Cap.releaseCost(p, r.y, false).dead[r.y] || 0) + '</td></tr>';
      });
      h += '</tbody></table></div><p class="note">Bonus = prorated signing bonus. Dead if cut = pre-June 1 release in that year.</p>';
    }
    var fy = !p.prospect && fifthYearInfo(p);
    if (fy) {
      h += '<div class="opt"><h4>Fifth-year option · ' + fy.year + '</h4><p>' + fmtM(fy.amount) + ', fully guaranteed when exercised. ' + esc(fy.label) + ' (Pro Bowls: ' + (p.pb || 0) + '; playing time ' +
        Object.keys(p.pt || {}).sort().map(function (k) { return k + ' ' + Math.round(p.pt[k] * 100) + '%'; }).join(', ') + ').</p>';
      if (mine && fy.open) h += '<p class="small muted">Decide before the early-May deadline (before the draft ends). Declining makes him a free agent after ' + Y + '.</p><div class="btns"><button class="btn pri" data-act="fifth" data-id="' + p.id + '" data-x="1">Exercise option</button><button class="btn" data-act="fifth" data-id="' + p.id + '" data-x="0">Decline option</button></div>';
      h += '</div>';
    } else if (p.fifth) h += '<p class="note">Fifth-year option ' + p.fifth + '.</p>';
    var acts = '';
    if (mine) {
      var pre = releasePreview(p, false), post = Cap.releaseCost(p, Y, true);
      h += '<h3 class="sec">If released</h3><div class="rels">';
      if (!isPostJune()) {
        h += '<div class="stat"><span>Pre-June 1</span><b>' + fmtM(pre.now) + '<small>dead in ' + Y + '</small></b><div class="muted small">Cap change ' + Y + ': ' + fmtM(pre.savings) + ' saved</div></div>';
        h += '<div class="stat"><span>Post-June 1 designation</span><b>' + fmtM(post.dead[Y] || 0) + '<small>in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '</small></b><div class="muted small">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved · ' + (canJune1(S.user) ? (2 - (S.june1[S.year + S.user] || 0)) + ' designations left' : 'none left') + '</div></div>';
      } else {
        h += '<div class="stat"><span>After June 1</span><b>' + fmtM(post.dead[Y] || 0) + '<small>in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '</small></b><div class="muted small">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved</div></div>';
      }
      h += '</div>';
      var rmax = Cap.restructureMax(p, Y, p.exp), nYrs = Math.min(5, Cap.remaining(p, Y).length);
      if (rmax > 500) h += '<p class="note">Restructure converts ' + fmtM(rmax) + ' of ' + Y + ' salary into a bonus prorated over ' + nYrs + ' years. Future cap hits and dead money go up.</p>';
      if (canExtend(p)) acts += '<button class="btn acc" data-act="offer" data-id="' + p.id + '" data-mode="extend">Extend</button>';
      if (rmax > 500) acts += '<button class="btn" data-act="restructure" data-id="' + p.id + '">Restructure (save ' + fmtM(rmax - Math.floor(rmax / nYrs)) + ')</button>';
      if (tradeOpen()) acts += '<button class="btn" data-act="trade-with" data-id="' + p.id + '">Shop in a trade</button>';
      if (!isPostJune()) acts += '<button class="btn danger" data-act="release" data-id="' + p.id + '" data-j="0">Release pre-June 1</button><button class="btn danger" data-act="release" data-id="' + p.id + '" data-j="1">Designate post-June 1</button>';
      else acts += '<button class="btn danger" data-act="release" data-id="' + p.id + '" data-j="0">Release</button>';
    } else if (p.prospect) {
      acts = p.team ? '' : '<span class="muted">' + (UI.view === 'draft' && currentPick() && currentPick().owner === S.user ? 'Pick him from the draft board.' : 'Scouting report. He can be drafted when your pick comes up.') + '</span>';
    } else if (!p.team && !p.retired) {
      var canOffer = S.phase === 'resign' ? p.rights === S.user : screenOpen('fa');
      acts = canOffer ? '<button class="btn acc" data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (p.rights === S.user ? 'Re-sign' : 'Make an offer') + '</button>' :
        '<span class="muted">' + (S.phase === 'resign' ? 'Free agency opens after the re-sign window.' : 'Free agent signings reopen in the preseason.') + '</span>';
    } else if (p.team) {
      acts = tradeOpen() ? '<button class="btn acc" data-act="trade-for" data-id="' + p.id + '">Trade for him</button>' : '<span class="muted">' + (S.phase === 'season' ? 'The trade deadline has passed.' : 'Trades reopen after the Super Bowl.') + '</span>';
    }
    h += '</div>';
    if (acts) h += '<div class="ps-actions">' + acts + '</div>';
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
  var f = function () {
    var o = UI.offer, abbr = S.user;
    var offer = { years: o.years, total: Math.round(o.total * 1000), bonus: Math.round(o.bonus * 1000), gtd: Math.round(o.gtd * 1000) };
    var yrs = mode === 'extend' ? buildExtensionYears(p, offer) : Cap.buildContract(offer, S.year, p.exp);
    var ev = Market.evaluate(p, offer, offerCtx(p, abbr));
    var hitNow = (Cap.row({ years: yrs }, S.year) || { cap: 0 }).cap - (mode === 'extend' ? Cap.capHit(p, S.year) : 0);
    var mood = ev.mood >= 1 ? ['g', 'Likely to accept', 'var(--good)'] : ev.mood >= 0.93 ? ['w', 'Close', 'var(--warn)'] : ['b', 'Not close', 'var(--bad)'];
    var h = '<div class="ps-hero slim" style="' + teamVars(p.team || p.rights || S.user) + '"><button class="x" data-act="close" aria-label="Close">✕</button>' + shield(p.ovr, 72) + '<div class="ps-id"><h2>' + (mode === 'extend' ? 'Extend ' : p.rights === S.user ? 'Re-sign ' : 'Offer: ') + esc(p.name) + '</h2>' +
      '<div class="ps-meta"><b>' + p.pos + '</b><span>Age ' + p.age + '</span><span>Asking about ' + fmtM(d.apy) + '/yr for ' + d.years + ' yrs, ' + fmtM(d.gtd) + ' guaranteed</span></div></div></div><div class="ps-body">';
    h += '<div class="offergrid">' + field('years', 'Years', o.years, 1, 7, 1) + field('total', 'Total $M', o.total, 0.5, 600, 0.1) + field('bonus', 'Signing bonus $M', o.bonus, 0, 300, 0.1) + field('gtd', 'Guaranteed $M', o.gtd, 0, 600, 0.1) + '</div>';
    if (mode !== 'extend' && ev.lateFloor) h += '<p class="warnbox">Late market: he\'ll sign for ' + fmtM(ev.lateFloor) + ' a year or more (' + (S.phase === 'season' ? '12%' : '25%') + ' of his ask), the same prove-it terms AI teams get.</p>';
    if (mode === 'extend') h += '<p class="note">Extension starts ' + extensionStart() + '. Prorated bonus already on the books stays in its years.</p>';
    h += '<div class="mood"><span class="verdict ' + mood[0] + '">' + mood[1] + '</span><div class="bar"><i style="width:' + clamp(ev.mood * 80, 4, 100).toFixed(0) + '%;background:' + mood[2] + '"></i></div></div>';
    h += '<div class="notes">' + ev.notes.map(function (n) { return '<span class="' + (n.good ? 'g' : 'b') + '">' + n.k + (n.good ? ' ✓' : ' ✗') + '</span>'; }).join('') + '</div>';
    h += '<h3 class="sec">Contract</h3><div class="tablewrap"><table class="dense"><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Bonus</th><th class="r">Cap hit</th><th class="r hide-sm">Gtd</th><th class="r">Dead if cut</th></tr></thead><tbody>';
    var tmp = { years: yrs };
    yrs.filter(function (r) { return r.y >= S.year; }).forEach(function (r) {
      h += '<tr class="' + (r.void ? 'void' : '') + '"><td>' + r.y + (r.void ? ' (void)' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r hide-sm">' + fmtM(r.gtd) + '</td><td class="r">' + fmtM(Cap.releaseCost(tmp, r.y, false).dead[r.y] || 0) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="kv" style="margin-top:12px"><span>Cap space after <em class="ap">approx.</em></span><b class="' + (space(abbr) - hitNow < 0 ? 'neg' : '') + '">' + fmtM(space(abbr) - hitNow) + '</b></div>';
    var fillShort = offerShortfall(p, mode, hitNow);
    if (fillShort > 0) h += '<p class="warnbox">This leaves you ' + fmtM(fillShort) + ' short of filling your roster (' + ROSTER_MAX + ' players at week 1).</p>';
    if (UI.offerErr) h += '<p class="badbox">' + esc(UI.offerErr) + '</p>';
    h += '</div><div class="ps-actions"><button class="btn pri" data-act="offer-submit">Make offer</button><button class="btn" data-act="offer-ask">Fill in asking price</button></div>';
    return h;
  };
  f.narrow = true;
  return f;
}
// Shortfall to fill 53 after this deal (0 if fine). Only matters before the season.
function offerShortfall(p, mode, hitNow) {
  if (S.phase === 'playoffs') return 0;
  return rosterFill(S.user, mode === 'extend' ? 0 : 1, hitNow, mode === 'extend' ? null : p.pos).short;
}
function field(k, label, v, min, max, step) { return '<label>' + label + '<input type="number" inputmode="decimal" data-field="' + k + '" value="' + v + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>'; }

// ---------- Make room (a screen in the preseason, a pop-up elsewhere) ----------
function makeRoomBody() {
  var o = makeRoomOptions(S.user), rf = rosterFill(S.user);
  var h = '<div class="ps-row r3"><div class="stat"><span>Needed to fill ' + ROSTER_MAX + '</span><b>' + fmtM(rf.need) + '</b></div><div class="stat"><span>Room, every contract counted</span><b>' + fmtM(rf.room) + '</b></div><div class="stat"><span>Short</span><b class="' + (rf.short ? 'neg' : 'good') + '">' + fmtM(rf.short) + '</b></div></div>';
  h += '<p class="note">Filling ' + ROSTER_MAX + ' needs ' + fmtM(rf.need) + '; you have ' + fmtM(rf.room) + ' with every contract counted' + (rf.short ? ': <b class="bad">' + fmtM(rf.short) + ' short</b>' : '') + '.</p>';
  h += '<h3 class="sec">Restructures</h3>' + (o.restructures.length ? '<div class="tablewrap"><table class="dense"><tbody>' + o.restructures.map(function (x) {
    return '<tr><td>' + shield(x.p.ovr, 30) + '</td><td><span class="pn">' + esc(x.p.name) + '</span> <span class="muted">' + x.p.pos + '</span></td><td class="r">saves <b>' + fmtM(x.saves) + '</b> now</td><td class="r"><button class="btn sm" data-act="restructure" data-id="' + x.p.id + '" data-back="room">Restructure</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">No contracts left to restructure.</p>');
  h += '<h3 class="sec">Cut options</h3><p class="note">Net room = cap saved minus the ' + fmtM(Cap.minSalary(FILLER_PRICE_EXP, S.year)) + ' it costs to refill the spot at the minimum. Players rated 80+ and cuts netting under $250K are left out; starters come last.</p>';
  if (o.cuts.length && o.short > 0) h += '<p class="warnbox">' + (o.cutsNeeded ? 'You\'d need ' + o.cutsNeeded + ' of these cuts to cover the ' + fmtM(o.short) + ' shortfall.' : 'Even all ' + o.cuts.length + ' of these cuts net only ' + fmtM(o.cutsTotal) + ', short of ' + fmtM(o.short) + ': restructure first.') + '</p>';
  h += o.cuts.length ? '<div class="tablewrap"><table class="dense"><thead><tr><th></th><th>Player</th><th class="r">Net</th><th class="r hide-sm">Saves − refill</th><th class="r hide-sm">Dead</th><th></th></tr></thead><tbody>' + o.cuts.map(function (x) {
    return '<tr><td>' + shield(x.p.ovr, 30) + '</td><td><span class="pn">' + esc(x.p.name) + '</span> <span class="muted small">' + x.p.pos + ' · ' + (x.starter ? 'starter' : 'backup') + '</span></td><td class="r"><b>net ' + fmtM(x.net) + '</b></td><td class="r muted hide-sm">saves ' + fmtM(x.saves) + ' − refill ' + fmtM(x.replacement) + '</td><td class="r muted hide-sm">dead ' + fmtM(x.dead) + '</td><td class="r"><button class="btn sm" data-act="player" data-id="' + x.p.id + '">Review</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">No cut frees at least $250K once the spot is refilled.</p>';
  return h;
}
function makeRoomModal() {
  var f = function () { return '<div class="ps-hero slim" style="' + teamVars(S.user) + '"><button class="x" data-act="close" aria-label="Close">✕</button><div class="ps-id"><h2>Make room</h2><div class="ps-meta"><span>Restructures first, then cuts</span></div></div></div><div class="ps-body">' + makeRoomBody() + '</div>'; };
  f.narrow = true;
  return f;
}
VIEWS.cuts = function () {
  var n = roster(S.user).length, slots = slotMap(S.user);
  var h = h2('Make room', n + ' on the roster · cut to ' + ROSTER_MAX + ' before week 1', '<button class="btn pri sm" data-act="auto-roster">Auto-fill and cut to ' + ROSTER_MAX + '</button>');
  h += '<section class="panel pad">' + makeRoomBody() + '</section>';
  var bubble = roster(S.user).filter(function (p) { return !slots[p.id]; }).sort(byKey(function (p) { return p.ovr; })).slice(0, 12);
  if (bubble.length) h += '<h3 class="sec">On the bubble <small>lowest-rated non-starters</small></h3><div class="cards">' + bubble.map(function (p) {
    var pv = releasePreview(p, false);
    return pcard(p, { right: '<b>' + fmtM(pv.savings) + '</b><span>saved if cut · ' + fmtM(pv.now) + ' dead</span>' });
  }).join('') + '</div>';
  return h;
};

// ---------- Re-sign and free agency ----------
function signCard(p, resign) {
  var a = askOf(p);
  return pcard(p, { meta: (p.prevTeam || p.cutBy || 'FA') + ' last', right: '<b>' + fmtM(a.apy) + '</b><span>ask / yr · ' + a.years + ' yrs</span><button class="btn acc sm" data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (resign ? 'Re-sign' : 'Offer') + '</button>' });
}
VIEWS.resign = function () {
  var exp = expiring();
  var h = h2('Re-sign', plural(exp.length, 'expiring contract') + '. Re-sign anyone you want to keep before free agency opens; the rest hit the market.');
  return h + (exp.length ? '<div class="cards">' + exp.map(function (p) { return signCard(p, true); }).join('') + '</div>' : '<p class="muted">Nobody here.</p>');
};
VIEWS.fa = function () {
  var pool = freeAgents();
  if (UI.faPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.faPos; });
  pool.sort(byKey(function (p) { return p.ovr; }, true));
  var sub = S.phase === 'fa' ? 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS + '. Asking prices drop as free agency goes on, but other teams sign players every day.' : S.phase === 'preseason' ? 'Late market: unsigned players, asks are lower this late.' : 'Unsigned players, available all season.';
  return h2(S.phase === 'preseason' ? 'Free agency · late market' : 'Free agency', sub) + posChips('faPos') + (pool.length ? '<div class="cards">' + pool.slice(0, 120).map(function (p) { return signCard(p, false); }).join('') + '</div>' : '<p class="muted">Nobody here.</p>');
};
function posChips(key) {
  return '<div class="filters posrow">' + ['ALL'].concat(POSITIONS).map(function (p) { return '<button class="fchip' + (UI[key] === p ? ' on' : '') + '" data-act="filter" data-k="' + key + '" data-p="' + p + '">' + (p === 'ALL' ? 'All' : p) + '</button>'; }).join('') + '</div>';
}

// ---------- Trade ----------
function tradeState() {
  if (!UI.trade) UI.trade = { ai: aiTeams().filter(function (a) { return a !== S.user; })[0], give: { players: [], picks: [] }, get: { players: [], picks: [] }, result: null, suggestion: null };
  return UI.trade;
}
VIEWS.trade = function () {
  var tr = tradeState(), ai = tr.ai, c1 = TEAM_COLORS[ai];
  var ev = aiTradeEval(ai, tr.give, tr.get);
  var empty = !tr.give.players.length && !tr.give.picks.length && !tr.get.players.length && !tr.get.picks.length;
  var st = empty ? ['w', 'Build a deal'] : ev.accept ? ['g', 'They would accept'] : ev.ratio > 0.85 ? ['w', 'Close: add a little'] : ['b', 'Not interested yet'];
  var h = h2('Trade', S.phase === 'season' ? 'Deadline after week ' + TRADE_DEADLINE_WEEK + ' (' + plural(Math.max(0, TRADE_DEADLINE_WEEK - S.week), 'week') + ' left)' : 'Open now; closes after week ' + TRADE_DEADLINE_WEEK + ' of the regular season');
  h += '<div class="partner"><label class="pick-team" style="--ptc1:' + (hexLum(c1[0]) > 0.2 ? mixHex(c1[0], '#0a0f18', 0.45) : c1[0]) + '"><b>' + ai + '</b><span>' + esc(TEAM[ai].name) + ' · ' + teamRating(ai).ovr + ' OVR · ' + fmtM(space(ai)) + ' space</span><span class="car">▾</span>' +
    '<select data-act="trade-team" aria-label="Trade partner">' + TEAMS.filter(function (t) { return t.abbr !== S.user; }).map(function (t) { return '<option value="' + t.abbr + '"' + (t.abbr === ai ? ' selected' : '') + '>' + t.abbr + ' · ' + esc(t.name) + '</option>'; }).join('') + '</select></label>' +
    '<div class="teamstrip">' + TEAMS.filter(function (t) { return t.abbr !== S.user; }).map(function (t) { return '<button class="' + (t.abbr === ai ? 'on' : '') + '" style="--c:' + TEAM_COLORS[t.abbr][0] + '" data-act="trade-partner" data-t="' + t.abbr + '">' + t.abbr + '</button>'; }).join('') + '</div></div>';
  var pct = clamp(ev.ratio, 0, 1.2) / 1.2, A = Math.PI, R = 80, cx = 100, cy = 96;
  var pt = function (f, r) { var a = A - A * f; return [(cx + (r || R) * Math.cos(a)).toFixed(1), (cy - (r || R) * Math.sin(a)).toFixed(1)]; };
  var col = st[0] === 'g' ? 'var(--good)' : st[0] === 'w' ? 'var(--warn)' : 'var(--bad)';
  var gauge = '<svg class="gauge" viewBox="0 0 200 112" aria-hidden="true"><path d="M ' + pt(0).join(' ') + ' A 80 80 0 0 1 ' + pt(1).join(' ') + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="16"/>' +
    (empty ? '' : '<path d="M ' + pt(0).join(' ') + ' A 80 80 0 0 1 ' + pt(Math.max(0.005, pct)).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="16"/>') + '<line x1="' + pt(1 / 1.2)[0] + '" y1="' + pt(1 / 1.2)[1] + '" x2="' + pt(1 / 1.2, 62)[0] + '" y2="' + pt(1 / 1.2, 62)[1] + '" stroke="#fff" stroke-width="3"/>' +
    '<text x="100" y="94" text-anchor="middle" fill="#fff" style="font:800 38px var(--display)">' + (empty ? '–' : Math.round(ev.ratio * 100)) + '</text><text x="100" y="110" text-anchor="middle" fill="#9aa7ba" style="font:600 10px Inter,sans-serif;letter-spacing:.1em">INTEREST</text></svg>';
  var capU = space(S.user) + ev.capUser, capA = space(ai) + ev.capAI;
  var meter = '<section class="panel meter">' + gauge + '<div class="verdict ' + st[0] + '">' + st[1] + '</div><p class="why">' + (empty ? 'Add players or picks on either side.' : ai + ' values your side at ' + fmtM(ev.get) + ' vs ' + fmtM(ev.give) + ' for what it gives up.') + '</p>' +
    '<div class="caps"><div class="stat"><span>Your cap after</span><b class="' + (capU < 0 ? 'neg' : '') + '">' + fmtM(capU) + '</b></div><div class="stat"><span>' + ai + ' cap after</span><b class="' + (capA < 0 ? 'neg' : '') + '">' + fmtM(capA) + '</b></div></div>' +
    (ev.msg && !empty ? '<p class="badbox">' + esc(ev.msg) + '</p>' : '') +
    '<div class="btns"><button class="btn pri" data-act="trade-propose"' + (empty ? ' disabled' : '') + '>Propose trade</button><button class="btn" data-act="trade-ask">What would it take?</button><button class="btn sm" data-act="trade-clear">Clear</button></div>' +
    (tr.suggestion ? '<p class="say">' + tr.suggestion + '</p>' : '') + (tr.result ? '<p class="say ' + (tr.result.ok ? 'good' : 'bad') + '">' + esc(tr.result.text) + '</p>' : '') +
    '<p class="rules">' + (isPostJune() ? 'Post-June 1 rules: unamortized bonus splits over two years.' : 'Pre-June 1: all unamortized bonus hits the old team now.') + ' Cap hit = what the receiving team takes on.</p></section>';
  return h + '<div class="trade">' + tradeSide(S.user, tr.give, 'give', 'You send') + meter + tradeSide(ai, tr.get, 'get', ai + ' send') + '</div>';
};
function tradeSide(abbr, side, key, title) {
  var c = TEAM_COLORS[abbr], post = isPostJune(), picks = picksOf(abbr), ros = roster(abbr).sort(byKey(function (p) { return p.ovr; }, true));
  var s1 = abbr === S.user ? 'var(--tc1)' : hexLum(c[0]) > 0.2 ? mixHex(c[0], '#0a0f18', 0.45) : hexLum(c[0]) < 0.02 ? mixHex(c[0], '#1b2431', 0.35) : c[0];
  var h = '<section class="panel tside"><div class="tside-h" style="--s1:' + s1 + ';--s2:' + c[1] + '"><h3>' + title + '</h3><span>' + fmtM(space(abbr)) + ' space</span></div><div class="in"><div class="lbl">In the deal</div>';
  if (!side.players.length && !side.picks.length) h += '<div class="empty">Nothing yet</div>';
  h += side.players.map(function (id) {
    var p = P(id); if (!p) return '';
    return '<div class="tcard tc' + tier(p.ovr) + '">' + shield(p.ovr, 44) + '<div class="pc-main"><div class="pc-name' + nameCls(p.name) + '">' + nameHtml(p.name) + '</div><div class="pc-meta"><b>' + p.pos + '</b> · ' + p.age + ' yrs · ' + potInfo(p).trait + '</div></div>' +
      '<div class="pc-k"><b>' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</b><span>cap hit · ' + yrsLeftStr(p) + '</span></div><button class="rm" data-act="trade-toggle" data-side="' + key + '" data-kind="players" data-id="' + p.id + '" aria-label="Remove ' + esc(p.name) + '">✕</button></div>';
  }).join('');
  h += '<div>' + picks.filter(function (k) { return side.picks.indexOf(k.id) >= 0; }).map(function (k) { return '<button class="ptok" data-act="trade-toggle" data-side="' + key + '" data-kind="picks" data-id="' + k.id + '" aria-label="Remove ' + pickLabel(k) + '">' + pickLabel(k) + ' <small>✕</small></button>'; }).join('');
  var years = []; picks.forEach(function (k) { if (years.indexOf(k.year) < 0) years.push(k.year); });
  years.forEach(function (y) {
    var left = picks.filter(function (k) { return k.year === y && side.picks.indexOf(k.id) < 0; });
    if (left.length) h += '<select class="ptok add" data-act="trade-pick" data-side="' + key + '" aria-label="Add a ' + y + ' pick"><option value="">+ ' + y + ' pick</option>' + left.map(function (k) { return '<option value="' + k.id + '">' + pickLabel(k) + '</option>'; }).join('') + '</select>';
  });
  h += '</div><div class="lbl">Add players</div><div class="picker">' + ros.map(function (p) {
    var on = side.players.indexOf(p.id) >= 0;
    return '<button class="prow' + (on ? ' on' : '') + '" data-act="trade-toggle" data-side="' + key + '" data-kind="players" data-id="' + p.id + '" aria-pressed="' + on + '">' + shield(p.ovr, 28) + '<span class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></span><span class="hit">' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</span><span class="add">' + (on ? '✓' : '+') + '</span></button>';
  }).join('') + '</div></div></section>';
  return h;
}

// ---------- Draft and prospects ----------
VIEWS.draft = function () {
  if (!S.draft) return h2('Draft', 'The draft happens after free agency.');
  var k = currentPick(), onClock = k && k.owner === S.user, pool = draftPool();
  if (UI.draftPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.draftPos; });
  var mine = picksOf(S.user).filter(function (x) { return x.year === S.year; });
  var h = h2('Draft', S.year + ' draft · rookie contracts follow the slotted wage scale');
  h += '<div class="clock"><section class="panel hero">' + (k ? '<div class="big">#' + k.no + '<small>round ' + k.round + '</small></div><div class="kick">' + (onClock ? 'You are on the clock' : 'On the clock') + '</div><h3>' + esc(TEAM[k.owner].name) + '</h3>' : '<div class="kick">Draft complete</div><h3>All picks made</h3>') +
    '<p>Your picks: ' + (mine.map(function (x) { return '#' + x.no; }).join(', ') || 'none left') + '.</p><div class="btns">' + (onClock ? '<span class="btn acc" style="pointer-events:none">Pick from the board</span>' : k ? '<button class="btn pri" data-act="draft-sim">Sim to my next pick</button>' : '') + (k ? '<button class="btn" data-act="draft-auto">Auto-draft the rest</button>' : '') + '</div></section>';
  h += '<section class="panel pad"><h3 class="ttl" style="margin-bottom:10px">Recent picks</h3><ul class="newsl">' + (S.draft.made.slice(-7).reverse().map(function (m) { var p = P(m.id); return '<li>#' + m.no + ' ' + teamLink(m.team) + ' ' + (p ? p.pos + ' ' + esc(p.name) : '') + '</li>'; }).join('') || '<li class="muted">No picks yet.</li>') + '</ul></section></div>';
  if (S.year === BASE.startYear && BASE.draftOrder) h += '<p class="note">Draft order: real ' + (S.year - 1) + ' results' + (BASE.draftOrderFinal ? ' (final).' : ' as of ' + BASE.draftOrderGames + ' of 272 games, provisional until the data is refreshed after the season.') + ' Traded and compensatory picks aren\'t included.</p>';
  h += posChips('draftPos') + '<div class="cards">' + pool.slice(0, 80).map(function (p, i) {
    return pcard(p, { rank: i + 1, meta: esc(p.college || ''), right: '<b>' + Math.round(p.grade) + '</b><span>grade</span>' + (onClock ? '<button class="btn acc sm" data-act="draft-pick" data-id="' + p.id + '">Draft</button>' : '') });
  }).join('') + '</div>';
  return h;
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
  var h = h2('Draft prospects', 'The ' + prospectsYear() + ' class · read-only scouting board. Ratings are scouting estimates and can still move before the draft.');
  return h + posChips('draftPos') + '<div class="cards">' + pool.slice(0, 100).map(function (p, i) {
    return pcard(p, { rank: i + 1, meta: esc(p.college || ''), right: '<b>' + Math.round(p.grade) + '</b><span>grade</span>' });
  }).join('') + '</div>';
};

// ---------- League: standings, schedule, leaders, news, history ----------
function leagueTabs() {
  return '<div class="subtabs">' + LEAGUE_SCREENS.map(function (v) { return '<button class="fchip' + (UI.view === v ? ' on' : '') + '" data-act="view" data-v="' + v + '">' + SCREEN_LABEL[v] + '</button>'; }).join('') + '</div>';
}
VIEWS.standings = function () {
  var h = h2('League', S.year + ' · ' + PHASE_LABEL[S.phase]) + leagueTabs();
  if (S.playoffs && S.playoffs.champ) h += '<p class="warnbox">' + esc(TEAM[S.playoffs.champ].name) + ' won the Super Bowl.</p>';
  h += '<div class="divs">';
  divisionStandings().forEach(function (d) {
    h += '<section class="panel"><h3>' + d.conf + ' ' + d.div + '</h3><table class="dense"><thead><tr><th>Team</th><th class="r">W-L</th><th class="r hide-sm">PF</th><th class="r hide-sm">PA</th><th class="r">OVR</th></tr></thead><tbody>' + d.teams.map(function (a) {
      var r = S.teams[a].rec; return '<tr class="' + (a === S.user ? 'me' : '') + '"><td>' + teamLink(a) + '</td><td class="r">' + recStr(r) + '</td><td class="r hide-sm">' + r.pf + '</td><td class="r hide-sm">' + r.pa + '</td><td class="r">' + teamRating(a).ovr + '</td></tr>';
    }).join('') + '</tbody></table></section>';
  });
  return h + '</div>';
};
VIEWS.schedule = function () {
  var h = h2('League', S.year + ' schedule') + leagueTabs();
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
  var h = h2('League', S.year + ' leaders') + leagueTabs() + '<div class="filters">' + cats.map(function (c) { return '<button class="fchip' + (UI.leaders === c[0] ? ' on' : '') + '" data-act="leaders" data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
  var k = UI.leaders, list = S.players.filter(function (p) { return p.s && p.s[k]; }).sort(byKey(function (p) { return p.s[k]; }, true)).slice(0, 25);
  if (!list.length) return h + '<p class="muted">No games played yet this season.</p>';
  h += '<section class="panel tablewrap"><table class="dense"><thead><tr><th>#</th><th></th><th>Player</th><th>Team</th><th class="hide-sm">Pos</th><th class="r">' + cats.filter(function (c) { return c[0] === k; })[0][1] + '</th><th class="r hide-sm">G</th></tr></thead><tbody>';
  list.forEach(function (p, i) { h += '<tr class="click' + (p.team === S.user ? ' me' : '') + '" data-act="player" data-id="' + p.id + '"><td>' + (i + 1) + '</td><td>' + shield(p.ovr, 30) + '</td><td><span class="pn">' + esc(p.name) + '</span></td><td>' + (p.team ? teamLink(p.team) : '—') + '</td><td class="hide-sm">' + p.pos + '</td><td class="r"><b>' + p.s[k] + '</b></td><td class="r hide-sm">' + (p.s.g || 0) + '</td></tr>'; });
  return h + '</tbody></table></section>';
};
VIEWS.news = function () { return h2('League', 'News') + leagueTabs() + '<section class="panel pad">' + newsList(S.news.slice(0, 120)) + '</section>'; };
VIEWS.history = function () {
  var h = h2('League', 'History') + leagueTabs();
  if (!S.history.length) return h + '<p class="muted">Finish a season to start your history.</p>';
  return h + '<section class="panel tablewrap"><table class="dense"><thead><tr><th>Season</th><th>Champion</th><th>Your record</th><th>Finish</th><th class="hide-sm">MVP</th></tr></thead><tbody>' + S.history.slice().reverse().map(function (x) {
    return '<tr><td><b>' + x.year + '</b></td><td>' + teamLink(x.champ) + '</td><td>' + x.rec + '</td><td>' + x.userFinish + '</td><td class="hide-sm">' + esc(x.mvp) + '</td></tr>';
  }).join('') + '</tbody></table></section>';
};
VIEWS.league = VIEWS.standings;

// ---------- Playoff bracket ----------
VIEWS.bracket = function () {
  var po = S.playoffs;
  if (!po) return h2('Playoffs', 'The bracket is set after week ' + WEEKS + '.');
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
    var gs = games(conf, r);
    return '<div class="bcol"><h4>' + (r === 0 ? 'Wild card' : r === 1 ? 'Divisional' : 'Conference') + '</h4>' + (r === 0 ? '<div class="bgame">' + team(po[conf][0], 'bye', false) + '</div>' : '') + gs.map(box).join('') + '</div>';
  };
  var h = h2('Playoffs', S.year + ' · ' + (po.champ ? 'complete' : ROUND_NAMES[po.round] + ' next'));
  if (po.champ) h += '<section class="panel hero champ" style="grid-column:auto;min-height:0"><div class="big">' + po.champ + '</div><div class="kick">Super Bowl champions</div><h3>' + esc(TEAM[po.champ].name) + '</h3><p>' + (po.champ === S.user ? 'Your team won it all.' : 'Start the next offseason when you\'re ready.') + '</p></section>';
  h += '<div class="bracket">' + col('AFC', 0) + col('AFC', 1) + col('AFC', 2) + '<div class="bcol sb"><h4>Super Bowl</h4>' + games(null, 3).map(box).join('') + '</div>' + col('NFC', 2) + col('NFC', 1) + col('NFC', 0) + '</div>';
  return h + '<p class="note">AFC on the left, NFC on the right. The #1 seed in each conference has a bye in the wild-card round.</p>';
};

// ---------- events ----------
function onClick(e) {
  var el = e.target.closest('[data-act]'); if (!el) return;
  var a = el.getAttribute('data-act'), d = el.dataset;
  if (a === 'close-bg' && e.target !== el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'OPTION') return;
  var r;
  switch (a) {
    case 'new': if (hasSave() && !confirm('Start a new game as ' + TEAM[d.t].name + '? This replaces your saved game.')) return; var sd = document.getElementById('seed'); newGame(DATA, d.t, sd ? sd.value.trim() : null); reindex(); UI.view = 'hub'; UI.trade = null; UI._preview = null; break;
    case 'continue': loadGame(); break;
    case 'view': UI.view = viewFor(d.v); UI.msg = null; UI.modal = null; UI.sheet = null; break;
    case 'sheet': UI.sheet = UI.sheet === d.s ? null : d.s; break;
    case 'advance':
      var before = S.phase; r = advance(); if (!r.ok) flash(r.msg, true); else UI.msg = null; UI.modal = null;
      if (S.phase !== before) { UI.view = S.phase === 'draft' ? 'draft' : S.phase === 'playoffs' ? 'bracket' : 'hub'; UI.trade = null; }
      break;
    case 'sim-season': UI.msg = null; var g = 0; while (S.phase === 'season' && S.week < WEEKS && g++ < 30) advance(); break;
    case 'sim-playoffs': var g2 = 0; while (S.phase === 'playoffs' && !S.playoffs.champ && g2++ < 6) advance(); UI.view = 'bracket'; break;
    case 'skip-fa': UI.msg = null; var g3 = 0; while (S.phase === 'fa' && g3++ < 10) advance(); UI.view = 'draft'; break;
    case 'auto-roster': var ar = userAutoRoster(); flash(ar.msg + (ar.missing ? ' Restructure a contract or cut someone to make room.' : ''), ar.missing > 0); UI.modal = null; if (ar.missing) { if (screenOpen('cuts')) UI.view = 'cuts'; else openModal(makeRoomModal()); } break;
    case 'make-room': if (screenOpen('cuts')) { UI.view = 'cuts'; UI.modal = null; } else openModal(makeRoomModal()); break;
    case 'filter': UI[d.k] = d.p; break;
    case 'rgroup': UI.rgroup = d.p; break;
    case 'roster-mode': UI.rosterMode = d.m; break;
    case 'leaders': UI.leaders = d.c; break;
    case 'player': UI.offer = null; UI.offerErr = null; openModal(playerModal(d.id)); break;
    case 'close': case 'close-bg': UI.modal = null; UI.offer = null; break;
    case 'release':
      var p = P(d.id), pv = releasePreview(p, d.j === '1');
      if (!confirm('Release ' + p.name + '? Dead money: ' + fmtM(pv.now) + ' in ' + S.year + (pv.next ? ' and ' + fmtM(pv.next) + ' in ' + (S.year + 1) : '') + '. Cap savings this year: ' + fmtM(pv.savings) + '.')) return;
      r = release(p, d.j === '1'); UI.modal = null; flash(r.ok ? p.name + ' released.' : r.msg, !r.ok); break;
    case 'restructure':
      var rp = P(d.id), res = restructurePlayer(rp, Cap.restructureMax(rp, S.year, rp.exp));
      flash(res.saved ? 'Restructured ' + rp.name + ': ' + fmtM(res.saved) + ' saved this year.' : 'Nothing to restructure.');
      if (d.back === 'room') { if (UI.modal) UI.modal = makeRoomModal(); } else UI.modal = playerModal(d.id);
      break;
    case 'offer':
      if (!signingOpen() && d.mode !== 'extend') { flash('Signings are closed right now.', true); break; }
      UI.offer = null; UI.offerErr = null; openModal(offerModal(d.id, d.mode)); break;
    case 'offer-ask':
      var op = P(UI.offer.id), dd = Market.demand(op, marketCap(), S.year), disc = UI.offer.mode === 'extend' || S.phase === 'resign' ? 1 : 1 - Market.faDiscount(offerCtx(op, S.user).daysIntoFA);
      UI.offer.years = dd.years; UI.offer.total = +(dd.apy * dd.years * disc / 1000).toFixed(1); UI.offer.gtd = +(dd.gtd * disc / 1000).toFixed(1); UI.offer.bonus = +(dd.gtd * disc * 0.5 / 1000).toFixed(1); break;
    case 'offer-submit': submitOffer(); break;
    case 'depth':
      var arr = S.teams[S.user].depth[d.pos], i = +d.i, j = i + (+d.d);
      if (j >= 0 && j < arr.length) { var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; } break;
    case 'auto-depth': S.teams[S.user].depth = {}; autoDepth(S.user); flash('Depth chart reset to the best available players.'); break;
    case 'trade-toggle':
      var tr = tradeState(), side = tr[d.side][d.kind], ix = side.indexOf(d.id);
      if (ix >= 0) side.splice(ix, 1); else side.push(d.id);
      tr.result = null; tr.suggestion = null; break;
    case 'trade-partner': UI.trade = { ai: d.t, give: tradeState().give, get: { players: [], picks: [] } }; break;
    case 'trade-with': if (!tradeOpen()) break; UI.trade = null; tradeState().give.players.push(d.id); UI.modal = null; UI.view = 'trade'; break;
    case 'trade-for': if (!tradeOpen()) break; var pp = P(d.id); UI.trade = null; var ts = tradeState(); ts.ai = pp.team; ts.get.players.push(d.id); UI.modal = null; UI.view = 'trade'; break;
    case 'trade-clear': UI.trade = { ai: tradeState().ai, give: { players: [], picks: [] }, get: { players: [], picks: [] } }; break;
    case 'trade-ask':
      var t2 = tradeState(), w = whatWouldItTake(t2.ai, t2.give, t2.get);
      t2.suggestion = w.done ? 'They already like this deal.' : w.options.length ? t2.ai + ' would do it if you add: ' + w.options.map(function (o) { return o.label; }).join(' or ') + '.' : 'Nothing on your side gets this done. Ask for less or take on salary.';
      break;
    case 'trade-propose':
      if (!tradeOpen()) { flash('Trades are closed right now.', true); break; }
      var t3 = tradeState(), ev = aiTradeEval(t3.ai, t3.give, t3.get);
      if (ev.accept) { executeTrade(t3.ai, t3.give, t3.get); UI.trade = { ai: t3.ai, give: { players: [], picks: [] }, get: { players: [], picks: [] }, result: { ok: true, text: 'Trade accepted.' } }; flash('Trade accepted.'); }
      else t3.result = { ok: false, text: ev.msg || t3.ai + ' turned it down.' };
      break;
    case 'draft-sim': draftUntilUser(false); break;
    case 'fifth': var fp = P(d.id), fr = decideFifthYear(fp, d.x === '1'); flash(fr.ok ? (d.x === '1' ? 'Option exercised for ' + fp.name + '.' : 'Option declined for ' + fp.name + '.') : fr.msg, !fr.ok); UI.modal = playerModal(d.id); break;
    case 'export': UI.sheet = null; exportSave(); return;
    case 'import': UI.sheet = null; document.getElementById('importfile').click(); return;
    case 'draft-auto': draftUntilUser(true); flash('Draft complete. Rookies are signed to slotted contracts.'); break;
    case 'draft-pick': UI.modal = null; makePick(currentPick(), P(d.id)); draftUntilUser(false); break;
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
function onKey(e) {
  // cards are role="button": Enter/Space opens them like a click
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('pcard')) { e.preventDefault(); e.target.click(); }
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
  return '<section class="savebar"><span>Saved in this browser automatically.</span><button class="link" data-act="export">Export save</button><button class="link" data-act="import">Import save</button></section>';
}
function importInput() { return '<input type="file" id="importfile" accept=".json,application/json" hidden>'; }
var SAVE_APP = 'gridiron-gm', OLD_SAVE_APPS = ['nfl-gm'];
function exportSave() {
  var idx = S._idx; delete S._idx; S.rng = RNG.s;
  var json = JSON.stringify({ app: SAVE_APP, v: 1, saved: new Date().toISOString(), S: S, BASE: BASE });
  S._idx = idx;
  var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  var a = document.createElement('a');
  a.href = url; a.download = 'gridiron-gm-' + S.user + '-' + S.year + '-' + S.phase + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  flash('Save exported.'); render();
}
function importSave(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var o = JSON.parse(reader.result);
      if ((o.app !== SAVE_APP && OLD_SAVE_APPS.indexOf(o.app) < 0) || !o.S || !o.BASE || !o.S.players || !o.S.teams) throw new Error('not a save');
      if (S && !confirm('Load this save (' + o.S.user + ', ' + o.S.year + ')? It replaces the game in progress.')) return;
      S = o.S; BASE = o.BASE; reindex(); Market.setCurve(BASE.curve); Market.setScale(S.payScale || 1); Market.setDriftScale(S.driftScale || Market.calibrateDrift(S.players)); RNG.s = S.rng || S.seed;
      UI.view = 'hub'; UI.modal = null; UI.trade = null; UI._preview = null;
      flash('Save loaded: ' + TEAM[S.user].name + ', ' + S.year + '.');
      saveGame(); render();
    } catch (e) { alert('That file isn\'t a Gridiron GM save.'); }
  };
  reader.readAsText(file);
}
var SAVE_KEY = 'nflgm-save-v1', saveTimer = null;   // storage key kept from the old name so existing saves carry over
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
    UI.view = 'hub'; UI._preview = null;
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}
