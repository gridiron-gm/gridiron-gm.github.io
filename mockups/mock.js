// Redesign mockup: renders Hub, Roster, Player card and Trade from a real Patriots save (seed 42).
// Uses the game's own code (src/js 00-60) for every number; only the markup and CSS are new.
(function () {
  var Q = new URLSearchParams(location.search), SCREEN = Q.get('screen') || 'hub', U = 'NE';

  // ---------- shared pieces ----------
  function tier(o) { return o >= 90 ? '90' : o >= 80 ? '80' : o >= 70 ? '70' : o >= 60 ? '60' : '50'; }
  function shield(o, s) { return '<span class="shield t' + tier(o) + '"' + (s ? ' style="--s:' + s + 'px"' : '') + '><span>' + o + '</span></span>'; }
  function dev(p) { var t = potInfo(p).trait; return '<span class="dev dev-' + t.toLowerCase() + '">' + t + '</span>'; }
  function pot(p) { var i = potInfo(p); return '<span class="pot">POT <b>' + i.grade + '</b> ' + (i.exact ? i.lo : i.lo + '–' + i.hi) + '</span>'; }
  function nm(n) { var i = n.indexOf(' '); if (i > 0 && n.length > 17) n = n[0] + '. ' + n.slice(i + 1), i = 2; return i < 0 ? '<span class="ln">' + esc(n) + '</span>' : '<span class="fn">' + esc(n.slice(0, i)) + '</span> <span class="ln">' + esc(n.slice(i + 1)) + '</span>'; }
  function last(n) { var i = n.indexOf(' '); return i < 0 ? n : n.slice(i + 1); }
  function yrs(n) { return n + ' yr' + (n === 1 ? '' : 's'); }
  function expStr(p) { return p.exp ? 'Yr ' + (p.exp + 1) : 'Rookie'; }
  function kMini(p) {
    if (!p.years || !p.years.length) return '<b>—</b><span>unsigned</span>';
    var n = Cap.yearsLeft(p, S.year);
    return '<b>' + fmtM(Cap.capHit(p, S.year)) + '</b><span class="' + (n === 1 ? 'exp' : '') + '">' + (n === 1 ? 'Final year' : yrs(n) + ' left') + '</span>';
  }
  function pcard(p) {
    return '<button class="pcard tc' + tier(p.ovr) + '">' + shield(p.ovr) + '<div class="pc-main"><div class="pc-name">' + nm(p.name) + '</div>' +
      '<div class="pc-meta"><b>' + p.pos + '</b> · ' + p.age + ' yrs · ' + expStr(p) + '</div><div class="pc-tags">' + dev(p) + pot(p) + '</div></div><div class="pc-k">' + kMini(p) + '</div></button>';
  }
  var SVG = {
    hub: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', roster: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8',
    resign: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 17l2.5-2.5L17 8', trade: 'M4 8h14l-4-4M20 16H6l4 4', more: 'M5 12h.01M12 12h.01M19 12h.01'
  };
  function ico(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + SVG[k] + '"/></svg>'; }

  // ---------- phase navigation (the step-2 rules, shown here for the re-sign window) ----------
  var ALWAYS = [['hub', 'Hub'], ['roster', 'Roster'], ['depth', 'Depth chart'], ['cap', 'Cap'], ['league', 'League']];
  function phaseScreens(ph, wk) {
    switch (ph) {
      case 'resign': return [['resign', 'Re-sign'], ['trade', 'Trade']];
      case 'fa': return [['fa', 'Free agency'], ['trade', 'Trade']];
      case 'draft': return [['draft', 'Draft'], ['trade', 'Trade']];
      case 'preseason': return [['fa', 'Free agency'], ['cuts', 'Make room'], ['trade', 'Trade']];
      case 'season': return (wk < TRADE_DEADLINE_WEEK ? [['trade', 'Trade']] : []).concat([['fa', 'Free agency']]);
      default: return [['bracket', 'Playoffs']];
    }
  }
  var TL = [['resign', 'Re-sign'], ['fa', 'Free agency'], ['draft', 'Draft'], ['preseason', 'Preseason'], ['season', 'Regular season'], ['playoffs', 'Playoffs']];
  var OPENS = { resign: 'After the Super Bowl', fa: 'Opens after the re-sign window', draft: 'Opens after free agency', preseason: 'Opens after the draft', season: 'Trade deadline after wk 9', playoffs: 'Opens after week 17' };

  function header() {
    var r = teamRating(U), rec = S.teams[U].rec;
    return '<header class="top"><div class="brand">NFL GM</div><div class="tbadge">' + U + '</div><div class="teamname"><h1>' + esc(TEAM[U].name) + '</h1><div>' + S.year + ' · ' + recStr(rec) + ' · ' + TEAM[U].conf + ' ' + TEAM[U].div + '</div></div>' +
      '<div class="topstats"><div class="tstat"><span>Team</span><b>' + shield(r.ovr, 36) + '</b></div><div class="tstat"><span>Cap space <em class="ap">approx.</em></span><b>' + fmtM(space(U)) + '</b></div><div class="tstat"><span>Roster</span><b>' + roster(U).length + '<small>/ ' + rosterMax() + '</small></b></div></div></header>';
  }
  function timeline() {
    var i = PHASES.indexOf(S.phase);
    var full = '<nav class="timeline" aria-label="Season">' + TL.map(function (t, j) {
      var cls = j === i ? 'now' : j === i + 1 ? 'next' : '', sub = j === i ? 'Now' : j < i ? 'Done' : OPENS[t[0]];
      return '<div class="tl ' + cls + '"><b>' + t[1] + '</b><small>' + sub + '</small></div>';
    }).join('') + '</nav>';
    var nx = TL[(i + 1) % TL.length];
    var compact = '<div class="tlc"><div class="pips">' + TL.map(function (t, j) { return '<i class="' + (j === i ? 'now' : '') + '"></i>'; }).join('') + '</div><b>Now · ' + PHASE_LABEL[S.phase] + '</b><span>Next: ' + nx[1] + ', ' + OPENS[nx[0]].toLowerCase() + '</span></div>';
    return full + compact;
  }
  function tabs(on) {
    var ph = phaseScreens(S.phase, S.week);
    var desk = '<nav class="tabs">' + ALWAYS.map(function (t) { return '<button class="tab' + (t[0] === on ? ' on' : '') + '">' + t[1] + '</button>'; }).join('') +
      '<span class="tabsep">' + PHASE_LABEL[S.phase] + '</span>' + ph.map(function (t) { return '<button class="tab ph' + (t[0] === on ? ' on' : '') + '">' + t[1] + '</button>'; }).join('') + '</nav>';
    var bar = [['hub', 'Hub'], ['roster', 'Roster']].concat(ph.slice(0, 2)).slice(0, 4);
    var phone = '<nav class="tabbar">' + bar.map(function (t) { return '<button class="' + (t[0] === on ? 'on' : '') + (ph.some(function (x) { return x[0] === t[0]; }) ? ' ph' : '') + '">' + ico(SVG[t[0]] ? t[0] : 'trade') + t[1] + '</button>'; }).join('') + '<button>' + ico('more') + 'More</button></nav>';
    return desk + phone;
  }
  function shell(on, body, overlay) {
    return '<div class="app" style="' + teamVars(U) + '">' + header() + timeline() + tabs(on) + '<main>' + body + '</main>' + (overlay || '') + '</div>';
  }

  // ---------- Hub ----------
  function hub() {
    var r = teamRating(U), exp = S.players.filter(function (p) { return p.rights === U && !p.team; }).sort(byKey(function (p) { return p.ovr; }, true));
    var opt = pendingOptions(U).filter(function (p) { return fifthYearInfo(p).open; })[0], fy = opt && fifthYearInfo(opt);
    var team = T(U), capT = Cap.teamCap(team, S.year), used = committed(U), dead = Cap.teamDead(team, S.year), free = capT - used - dead, rf = rosterFill(U);
    var pc = function (x) { return Math.max(0, x / capT * 100).toFixed(1) + '%'; };
    var h = '<div class="hub">';
    h += '<section class="panel hero"><div class="ghost">' + esc(last(opt.name)) + '</div><div class="star">' + shield(opt.ovr, 92) + '<div class="nm">' + esc(opt.name) + '<small>' + opt.pos + ' · age ' + opt.age + '</small></div></div>' +
      '<div class="kick">Next action</div><h3>Decide ' + esc(last(opt.name)) + '\'s fifth-year option</h3><p>' + fmtM(fy.amount) + ' for ' + fy.year + ', fully guaranteed if exercised. Due before the draft ends.</p>' +
      '<div class="btns"><button class="btn pri">Open his card</button><button class="btn">Later</button></div></section>';
    h += '<section class="panel tile wide"><div class="tile-h"><div><h3 class="ttl">Cap</h3><span class="muted small">' + fmtM(capT) + ' cap (projected)</span></div><div class="big">' + fmtM(free) + '<small>space approx.</small></div></div>' +
      '<div class="pv"><div class="capbar"><i class="u" style="width:' + pc(used) + '"></i><i class="d" style="width:' + pc(dead) + '"></i><i class="f" style="width:' + pc(free) + '"></i></div>' +
      '<div class="kv"><span>Contracts (top 51)</span><b>' + fmtM(used) + '</b></div><div class="kv"><span>Room needed to fill ' + ROSTER_MAX + '</span><b>' + fmtM(rf.need) + '</b></div>' +
      '<div class="kv"><span>' + (S.year + 1) + ' space, projected <em class="ap">approx.</em></span><b>' + fmtM(space(U, S.year + 1)) + '</b></div></div><div class="go">Open cap ›</div></section>';
    h += '<section class="panel tile ph"><div class="tile-h"><h3 class="ttl">Re-sign</h3><div class="big">' + exp.length + '<small>expiring</small></div></div><div class="pv">' +
      exp.slice(0, 3).map(function (p) { return '<div class="mini">' + shield(p.ovr, 30) + '<div class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></div><div class="val">' + fmtM(Market.demand(p, marketCap(), S.year).apy) + '<small>ask / yr</small></div></div>'; }).join('') +
      '</div><div class="go">Review all ›</div></section>';
    var picks = picksOf(U).filter(function (k) { return k.year === S.year; });
    h += '<section class="panel tile ph"><div class="tile-h"><h3 class="ttl">Trade</h3><div class="big">' + picks.length + '<small>' + S.year + ' picks</small></div></div><div class="pv"><div class="tokens">' +
      picks.map(function (k) { return '<span class="token' + (k.round === 1 ? ' r1' : '') + '">R' + k.round + (k.no ? ' #' + k.no : '') + '</span>'; }).join('') + '</div>' +
      '<p class="muted small" style="margin:12px 0 0">Open through the draft and preseason, then until the week-9 deadline.</p></div><div class="go">Make a trade ›</div></section>';
    var top = roster(U).sort(byKey(function (p) { return p.ovr; }, true));
    h += '<section class="panel tile"><div class="tile-h"><h3 class="ttl">Roster</h3><div class="big">' + top.length + '<small>of ' + rosterMax() + '</small></div></div><div class="pv">' +
      top.slice(0, 3).map(function (p) { return '<div class="mini">' + shield(p.ovr, 30) + '<div class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></div>' + dev(p) + '</div>'; }).join('') + '</div><div class="go">View roster ›</div></section>';
    var needs = teamNeeds(U).slice(0, 3);
    h += '<section class="panel tile"><div class="tile-h"><h3 class="ttl">Depth chart</h3><div class="big">' + r.ovr + '<small>team ovr</small></div></div><div class="pv">' +
      [['Offense', r.off], ['Defense', r.def]].map(function (u) { return '<div class="unit"><span>' + u[0].toUpperCase() + '</span><div class="bar"><i style="width:' + Math.max(0, (u[1] - 50) * 2) + '%"></i></div><b>' + u[1] + '</b></div>'; }).join('') +
      '<p class="muted small" style="margin:8px 0 0">Thin at ' + needs.map(function (n) { return n.pos; }).join(', ') + '</p></div><div class="go">Set lineup ›</div></section>';
    var div = TEAMS.filter(function (t) { return t.conf === TEAM[U].conf && t.div === TEAM[U].div; }).sort(byKey(function (t) { return teamRating(t.abbr).ovr; }, true));
    h += '<section class="panel tile"><div class="tile-h"><h3 class="ttl">League</h3><div class="big">0-0<small>' + TEAM[U].conf + ' ' + TEAM[U].div + '</small></div></div><div class="pv"><div class="stand"><span class="h">' + TEAM[U].conf + ' ' + TEAM[U].div + '</span><span class="h">OVR</span><span class="h">W-L</span>' +
      div.map(function (t) { var c = TEAM_COLORS[t.abbr]; return '<span class="' + (t.abbr === U ? 'me' : '') + '"><i class="chip" style="background:' + c[0] + ';border-color:' + c[1] + '"></i>' + esc(t.name) + '</span><span>' + teamRating(t.abbr).ovr + '</span><span>' + recStr(S.teams[t.abbr].rec) + '</span>'; }).join('') +
      '</div></div><div class="go">Standings, schedule, leaders ›</div></section>';
    var nw = S.news.filter(function (n) { return !n.team || n.team === U; }).slice(0, 3);
    h += '<section class="panel tile"><div class="tile-h"><h3 class="ttl">News</h3><div class="big">' + S.news.length + '<small>stories</small></div></div><div class="pv"><ul class="newsl">' +
      (nw.length ? nw.map(function (n) { return '<li>' + esc(n.msg) + '</li>'; }).join('') : '<li class="muted">Nothing yet.</li>') + '</ul></div><div class="go">All news ›</div></section>';
    h += '</div>';
    return shell('hub', h);
  }

  // ---------- Roster ----------
  var GROUPS = [['QB', 'Quarterbacks'], ['RB', 'Running backs'], ['WR', 'Wide receivers'], ['TE', 'Tight ends'], ['OT', 'Offensive tackles'], ['IOL', 'Interior line'],
    ['EDGE', 'Edge rushers'], ['DL', 'Defensive line'], ['LB', 'Linebackers'], ['CB', 'Cornerbacks'], ['S', 'Safeties'], ['K', 'Kickers'], ['P', 'Punters'], ['LS', 'Long snappers']];
  function rosterBody() {
    var ros = roster(U);
    var h = '<div class="h2"><h2>Roster</h2><span>' + ros.length + ' players · ' + fmtM(committed(U)) + ' committed (top 51)</span></div>';
    h += '<div class="filters">' + ['All', 'Offense', 'Defense', 'Special teams', 'Final year'].map(function (f, i) { return '<button class="fchip' + (i ? '' : ' on') + '">' + f + '</button>'; }).join('') +
      '<div class="seg"><button class="fchip on">Cards</button><button class="fchip">List</button></div></div>';
    GROUPS.forEach(function (g) {
      var l = ros.filter(function (p) { return p.pos === g[0]; }).sort(byKey(function (p) { return p.ovr; }, true));
      if (!l.length) return;
      h += '<div class="grp"><h3>' + g[1] + '</h3><span>' + l.length + ' · ' + fmtM(sumBy(l, function (p) { return Cap.capHit(p, S.year); })) + '</span></div><div class="cards">' + l.map(pcard).join('') + '</div>';
    });
    return h;
  }

  // ---------- Player sheet ----------
  function sheet(p) {
    var Y = S.year, pi = potInfo(p), fy = fifthYearInfo(p);
    var SUB = { pass: 'Passing', acc: 'Accuracy', run: 'Rushing', prod: 'Production', tgt: 'Targets', rec: 'Receiving', rush: 'Pass rush', tkl: 'Tackling', play: 'Playmaking', cov: 'Coverage', pow: 'Leg', net: 'Net punting' };
    var h = '<div class="scrim"></div><div class="sheet"><div class="ps-hero"><div class="ghost">' + esc(last(p.name)) + '</div><button class="x" aria-label="Close">✕</button>' + shield(p.ovr, 132) +
      '<div style="position:relative"><h2>' + '<span class="fn">' + esc(p.name.split(' ')[0]) + '</span>' + esc(last(p.name)) + '</h2><div class="ps-meta"><b>' + p.pos + '</b><span>Age ' + p.age + '</span><span>' + esc(TEAM[p.team].name) + '</span>' +
      (p.draft && p.draft[1] ? '<span>' + p.draft[0] + ' R' + p.draft[1] + ' #' + p.draft[2] + '</span>' : '') + '</div></div></div><div class="ps-body">';
    h += '<div class="ps-row"><div class="stat"><span>Potential</span><b>' + pi.grade + '<small>' + (pi.exact ? pi.lo : pi.lo + '–' + pi.hi) + '</small></b></div><div class="stat"><span>Dev trait</span><div style="margin-top:6px">' + dev(p) + '</div></div>' +
      Object.keys(p.sub || {}).slice(0, 2).map(function (k) { var v = p.sub[k]; return '<div class="stat tc' + tier(v) + '"><div class="attr"><span class="muted" style="font:600 11px Inter;text-transform:uppercase;letter-spacing:.08em">' + (SUB[k] || k) + '</span><b style="font:800 30px/1 var(--display)">' + v + '</b><div class="bar"><i style="width:' + v + '%"></i></div></div></div>'; }).join('') + '</div>';
    if (p.line26) h += '<div class="line26"><b>2026 real</b>' + esc(p.line26) + '</div>';
    h += '<h3 class="sec">Contract</h3><div class="ps-row"><div class="stat"><span>This year</span><b>' + fmtM(Cap.capHit(p, Y)) + '</b></div><div class="stat"><span>Years left</span><b>' + Cap.yearsLeft(p, Y) + '</b></div><div class="stat"><span>Gtd left</span><b>' + fmtM(Cap.gtdLeft(p, Y)) + '</b></div><div class="stat"><span>Signed</span><b>' + (p.signed || '—') + '</b></div></div>';
    h += '<table class="dense" style="margin-top:12px"><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Bonus</th><th class="r hide-sm">Roster/other</th><th class="r">Cap hit</th><th class="r">Dead if cut</th></tr></thead><tbody>' +
      Cap.remaining(p, Y).map(function (r) { return '<tr><td>' + r.y + (r.void ? ' void' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r hide-sm">' + fmtM(r.roster + r.other) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r">' + fmtM(Cap.releaseCost(p, r.y, false).dead[r.y] || 0) + '</td></tr>'; }).join('') + '</tbody></table>';
    if (fy) h += '<div class="opt"><h4>Fifth-year option · ' + fy.year + '</h4><p>' + fmtM(fy.amount) + ', fully guaranteed when exercised. ' + esc(fy.label) + '. Decide before the draft ends; declining makes him a free agent after ' + Y + '.</p><div class="btns"><button class="btn pri">Exercise option</button><button class="btn">Decline</button></div></div>';
    var pre = releasePreview(p, false), post = Cap.releaseCost(p, Y, true);
    h += '<h3 class="sec">If released</h3><div class="rels"><div class="stat"><span>Pre-June 1</span><b>' + fmtM(pre.now) + '<small>dead in ' + Y + '</small></b><div class="muted small">' + fmtM(pre.savings) + ' saved in ' + Y + '</div></div>' +
      '<div class="stat"><span>Post-June 1 designation</span><b>' + fmtM(post.dead[Y] || 0) + '<small>dead in ' + Y + '</small></b><div class="muted small">' + fmtM(post.savings) + ' saved in ' + Y + '</div></div></div>';
    h += '</div><div class="ps-actions"><button class="btn acc">Extend</button><button class="btn">Shop in a trade</button><button class="btn danger">Release</button><button class="btn danger">Post-June 1</button></div></div>';
    return h;
  }

  // ---------- Trade ----------
  function trade() {
    var post = isPostJune();
    var target = S.players.filter(function (p) { return p.name === 'Garrett Wilson'; })[0];
    var ai = target.team;
    var mine = roster(U).filter(function (p) { return p.pos !== 'QB'; }).sort(byKey(function (p) { return p.ovr; }, true));
    var give = { players: mine.filter(function (p) { return p.name === 'Carlton Davis'; }).map(function (p) { return p.id; }), picks: picksOf(U).filter(function (k) { return k.year === S.year && k.round === 2; }).slice(0, 1).map(function (k) { return k.id; }) };
    var get = { players: [target.id], picks: [] };
    var ev = aiTradeEval(ai, give, get);
    var st = ev.accept ? ['g', 'They would accept'] : ev.ratio > 0.85 ? ['w', 'Close: add a little'] : ['b', 'Not interested yet'];
    var pct = clamp(ev.ratio, 0, 1.2) / 1.2;
    var c1 = TEAM_COLORS[ai];
    var h = '<div class="h2"><h2>Trade</h2><span>Open now; closes after week 9 of the regular season</span></div>';
    h += '<div class="partner"><button class="pick-team" style="--ptc1:' + c1[0] + '"><b>' + ai + '</b><span>' + esc(TEAM[ai].name) + ' · ' + teamRating(ai).ovr + ' OVR · ' + fmtM(space(ai)) + ' space</span><span class="car">▾</span></button>' +
      '<div class="teamstrip">' + TEAMS.filter(function (t) { return t.abbr !== U; }).map(function (t) { return '<button class="' + (t.abbr === ai ? 'on' : '') + '" style="--c:' + TEAM_COLORS[t.abbr][0] + '">' + t.abbr + '</button>'; }).join('') + '</div></div>';
    function side(abbr, sel, title) {
      var c = TEAM_COLORS[abbr], ros = roster(abbr).sort(byKey(function (p) { return p.ovr; }, true)), picks = picksOf(abbr);
      var s = '<section class="panel tside"><div class="tside-h" style="--s1:' + (abbr === U ? 'var(--tc1)' : c[0]) + ';--s2:' + c[1] + '"><h3>' + title + '</h3><span>' + fmtM(space(abbr)) + ' space</span></div><div class="in">';
      s += '<div class="lbl">In the deal</div>' + sel.players.map(function (id) { var p = P(id); return '<div class="tcard tc' + tier(p.ovr) + '">' + shield(p.ovr, 44) + '<div class="pc-main"><div class="pc-name">' + nm(p.name) + '</div><div class="pc-meta"><b>' + p.pos + '</b> · ' + p.age + ' yrs · ' + dev(p) + '</div></div><div class="pc-k"><b>' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</b><span>cap hit · ' + yrs(Cap.yearsLeft(p, S.year)) + '</span></div><button class="rm" aria-label="Remove">✕</button></div>'; }).join('');
      s += '<div>' + sel.picks.map(function (id) { var k = picks.filter(function (x) { return x.id === id; })[0]; return '<span class="ptok">' + k.year + ' R' + k.round + (k.no ? ' #' + k.no : '') + ' <small>✕</small></span>'; }).join('') +
        [S.year, S.year + 1].map(function (y) { return '<button class="ptok add">+ ' + y + ' pick</button>'; }).join('') + '</div>';
      s += '<div class="lbl">Add players</div><div class="picker">' + ros.slice(0, 16).map(function (p) { var on = sel.players.indexOf(p.id) >= 0; return '<button class="prow' + (on ? ' on' : '') + '">' + shield(p.ovr, 28) + '<span class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></span><span class="hit">' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</span><span class="add">' + (on ? '✓' : '+') + '</span></button>'; }).join('') + '</div>';
      return s + '</div></section>';
    }
    var A = Math.PI, R = 80, cx = 100, cy = 96, arc = function (f) { var a = A - A * f; return (cx + R * Math.cos(a)).toFixed(1) + ' ' + (cy - R * Math.sin(a)).toFixed(1); };
    var col = st[0] === 'g' ? 'var(--good)' : st[0] === 'w' ? 'var(--warn)' : 'var(--bad)';
    var gauge = '<svg class="gauge" viewBox="0 0 200 112" aria-hidden="true"><path d="M ' + arc(0) + ' A 80 80 0 0 1 ' + arc(1) + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="16"/>' +
      '<path d="M ' + arc(0) + ' A 80 80 0 0 1 ' + arc(pct) + '" fill="none" stroke="' + col + '" stroke-width="16"/><line x1="' + arc(1 / 1.2).split(' ')[0] + '" y1="' + arc(1 / 1.2).split(' ')[1] + '" x2="' + (cx + 62 * Math.cos(A - A / 1.2)).toFixed(1) + '" y2="' + (cy - 62 * Math.sin(A - A / 1.2)).toFixed(1) + '" stroke="#fff" stroke-width="3"/>' +
      '<text x="100" y="94" text-anchor="middle" fill="#fff" style="font:800 38px var(--display)">' + Math.round(ev.ratio * 100) + '</text><text x="100" y="110" text-anchor="middle" fill="#9aa7ba" style="font:600 10px Inter;letter-spacing:.1em">INTEREST</text></svg>';
    var capU = space(U) + ev.capUser, capA = space(ai) + ev.capAI;
    var meter = '<section class="panel meter">' + gauge + '<div class="verdict ' + st[0] + '">' + st[1] + '</div><p class="why">' + ai + ' values your side at ' + fmtM(ev.get) + ' vs ' + fmtM(ev.give) + ' for what it gives up.</p>' +
      '<div class="caps"><div class="stat"><span>Your cap after</span><b>' + fmtM(capU) + '</b></div><div class="stat"><span>' + ai + ' cap after</span><b>' + fmtM(capA) + '</b></div></div>' +
      '<div class="btns"><button class="btn pri">Propose trade</button><button class="btn">What would it take?</button></div><p class="rules">' + (post ? 'Post-June 1: unamortized bonus splits over two years.' : 'Pre-June 1: all unamortized bonus hits the old team now.') + '</p></section>';
    h += '<div class="trade">' + side(U, give, 'You send') + meter + side(ai, get, ai + ' send') + '</div>';
    return shell('trade', h);
  }

  fetch('../src/data.json').then(function (r) { return r.json(); }).then(function (d) {
    window.DATA = d; newGame(d, U, 42); reindex();
    var html;
    if (SCREEN === 'roster') html = shell('roster', rosterBody());
    else if (SCREEN === 'player') html = shell('roster', rosterBody(), sheet(S.players.filter(function (p) { return p.name === 'Drake Maye'; })[0]));
    else if (SCREEN === 'trade') html = trade();
    else html = hub();
    document.getElementById('app').innerHTML = html;
    document.fonts.ready.then(function () { setTimeout(function () { var sh = document.querySelector('.sheet'); var h = sh ? sh.offsetTop + sh.offsetHeight + 60 : document.documentElement.scrollHeight; document.title = 'H:' + h; }, 300); });
  });
})();
