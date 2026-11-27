// v2 mockup: Home, Team (roster), Moves (trade, tiles), player slide-over, timeline, Continue confirm.
// Real Patriots save (seed 42, 2027 re-sign window) through the game's own code; only markup and CSS are new.
(function () {
  var Q = new URLSearchParams(location.search), SCREEN = Q.get('screen') || 'home', U = 'NE', J = {};
  function avatar(p, size, opts) {
    opts = opts || {};
    var team = p.team || p.rights || null, c = team ? TEAM_COLORS[team] : ['#3a4352'];
    return '<span class="avw"><span class="av" style="--a:' + size + 'px;--ac:' + c[0] + '">' + Avatar.svg(p, size) + '</span>' + (opts.shield === false ? '' : shield(p.ovr, opts.s)) + '</span>';
  }
  var ICON = { home: ICONS.hub, team: ICONS.roster, moves: ICONS.trade, league: ICONS.league };
  function ic(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[k] + '"/></svg>'; }
  function movesOpen() { return phaseScreens(S.phase, S.week).filter(function (v) { return ['resign', 'fa', 'trade', 'draft', 'cuts'].indexOf(v) >= 0; }); }
  function shell(on, body, overlay, opts) {
    opts = opts || {};
    var t = TEAM[U], sp = space(U), mv = movesOpen().length, tl = timeline(S.phase, S.week), nx = tl.filter(function (x) { return x.state === 'next'; })[0];
    var bar = '<header class="bar"><div class="id"><div class="tb">' + U + '</div><div class="tn">' + esc(t.name) + '<small>' + S.year + ' · ' + recStr(S.teams[U].rec) + ' · ' + shieldTxt() + '</small></div></div>' +
      '<nav class="nav">' + [['home', 'Home'], ['team', 'Team'], ['moves', 'Moves'], ['league', 'League']].map(function (n) {
        return '<button class="' + (on === n[0] ? 'on' : '') + '">' + n[1] + (n[0] === 'moves' && mv ? '<span class="cnt">' + mv + '</span>' : '') + '</button>';
      }).join('') + '</nav><div class="right"><div class="qs"><span>Cap space <em class="ap">approx.</em></span><b>' + fmtM(sp) + '</b></div>' +
      '<button class="cont"><div><b>Continue</b><small>' + advanceLabel() + '</small></div><span class="arr">›</span></button></div></header>';
    var prog = '<button class="prog" aria-expanded="' + !!opts.tl + '"><span class="ph">' + PHASE_LABEL[S.phase] + '</span><span class="line">' + tl.map(function (x) { return '<i class="' + x.state + '"></i>'; }).join('') + '</span>' +
      '<span class="nx">Next: <b>' + nx.label + '</b> · ' + nx.sub.charAt(0).toLowerCase() + nx.sub.slice(1) + '</span><span class="chev">' + (opts.tl ? '▴' : '▾') + '</span></button>';
    if (opts.tl) prog += '<div class="tlpop"><nav class="timeline">' + tl.map(function (x) { return '<div class="tl ' + x.state + '"><b>' + x.label + '</b><small>' + x.sub + '</small></div>'; }).join('') + '</nav><p>Moves open in each phase: re-sign window: Re-sign, Trade · free agency: Free agency, Trade · draft: Draft, Trade · preseason: Free agency, Make room, Trade · season: Trade until week 9, Free agency.</p></div>';
    var bb = '<nav class="bbar">' + [['home', 'Home'], ['team', 'Team']].map(bbtn).join('') + '<div class="gowrap"><button class="go" aria-label="Continue: ' + advanceLabel() + '"><span class="arr">›</span>Continue</button></div>' + [['moves', 'Moves'], ['league', 'League']].map(bbtn).join('') + '</nav>';
    function bbtn(n) { return '<button class="' + (on === n[0] ? 'on' : '') + '">' + ic(n[0]) + n[1] + (n[0] === 'moves' && mv ? '<span class="cnt">' + mv + '</span>' : '') + '</button>'; }
    return '<div class="app" style="' + teamVars(U) + '">' + bar + prog + '<main>' + body + '</main>' + bb + (overlay || '') + '</div>';
  }
  function shieldTxt() { return 'OVR ' + teamRating(U).ovr; }

  // ---------- Home ----------
  function home(opts) {
    var exp = expiring(), ns = nextStep(exp, null), opt = ns.star, team = T(U), capT = Cap.teamCap(team, S.year), free = capT - committed(U) - Cap.teamDead(team, S.year), rf = rosterFill(U), r = teamRating(U);
    var h = '<div class="home"><section class="panel hero">' + (opt ? '<div class="ghost">' + esc(lastName(opt.name)) + '</div><div class="star">' + avatar(opt, 168, { s: 64 }) + '<div class="nm">' + esc(opt.name) + '<small>' + opt.pos + ' · age ' + opt.age + '</small></div></div>' : '') +
      '<div class="kick">Next action</div><h3>' + ns.title + '</h3><p>' + ns.sub + '</p><div class="btns">' + ns.btn + '</div></section>';
    h += '<section class="panel status"><div class="big2"><span>Cap space <em class="ap">approx.</em></span><b>' + fmtM(free) + '</b></div>' + capBar() +
      '<div class="kv"><span>Room needed to fill ' + ROSTER_MAX + '</span><b>' + fmtM(rf.need) + '</b></div><div class="kv"><span>Roster</span><b>' + roster(U).length + ' / ' + rosterMax() + '</b></div>' +
      '<div class="kv"><span>Team rating</span><b>' + r.ovr + ' <small class="muted">off ' + r.off + ' · def ' + r.def + '</small></b></div><div class="kv"><span>' + (S.year + 1) + ' space, projected <em class="ap">approx.</em></span><b>' + fmtM(space(U, S.year + 1)) + '</b></div></section>';
    var td = todo(exp, roster(U).filter(function (p) { return Cap.yearsLeft(p, S.year) === 1; }), null);
    h += '<section class="panel card3"><h3>Up next</h3><ul class="todo">' + td.slice(0, 4).join('') + '</ul></section>';
    var top = roster(U).sort(byKey(function (p) { return p.ovr; }, true)).slice(0, 4);
    h += '<section class="panel card3"><h3>Top players <button>Team ›</button></h3>' + top.map(function (p) { return '<div class="mini">' + avatar(p, 40, { shield: false }) + '<div class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + ' · ' + potInfo(p).trait + '</small></div>' + shield(p.ovr, 30) + '</div>'; }).join('') + '</section>';
    var div = divisionStandings().filter(function (d) { return d.teams.indexOf(U) >= 0; })[0];
    h += '<section class="panel card3"><h3>' + TEAM[U].conf + ' ' + TEAM[U].div + ' <button>League ›</button></h3><div class="stand"><span class="h">Team</span><span class="h">OVR</span><span class="h">W-L</span>' + div.teams.map(function (a) {
      return '<span class="' + (a === U ? 'me' : '') + '">' + chip(a) + esc(TEAM[a].name) + '</span><span>' + teamRating(a).ovr + '</span><span>' + recStr(S.teams[a].rec) + '</span>'; }).join('') + '</div>' +
      '<div class="lbl" style="margin-top:16px">Latest</div>' + newsList(S.news.slice(0, 1)) + '</section></div>';
    var overlay = '';
    if (opts && opts.confirm) overlay = '<div class="scrim2" style="display:block"></div><div class="confirm" role="dialog"><h3>Open free agency?</h3><p class="muted" style="margin:0">A few things aren\'t finished. You can still go ahead.</p><ul>' +
      '<li><b>' + exp.length + ' expiring players</b> haven\'t been re-signed. They hit free agency, including ' + exp.slice(0, 2).map(function (p) { return esc(p.name) + ' (' + p.ovr + ')'; }).join(' and ') + '.</li>' +
      '<li><b>' + esc(opt.name) + '\'s fifth-year option</b> is still open. It\'s due before the draft ends.</li></ul><div class="btns"><button class="btn">Go back</button><button class="btn pri">Open free agency ›</button></div></div>';
    return shell('home', h, overlay, opts);
  }

  // ---------- Team ----------
  var GROUPS = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OT: 'Offensive tackles', IOL: 'Interior line', EDGE: 'Edge rushers', DL: 'Defensive line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', P: 'Punters', LS: 'Long snappers' };
  function pcard2(p, slot) {
    return '<div class="pcard tc' + tier(p.ovr) + '">' + avatar(p, 64) + '<div class="pc-main"><div class="pc-name' + nameCls(p.name) + '">' + nameHtml(p.name) + '</div>' +
      '<div class="pc-meta"><b>' + p.pos + '</b> · #' + (p.num != null ? p.num : '–') + ' · ' + p.age + ' yrs · ' + (p.exp ? 'Yr ' + (p.exp + 1) : 'Rookie') + '</div>' +
      '<div class="pc-tags">' + (slot ? '<span class="slot">' + slot + '</span>' : '') + devBadge(p) + potText(p) + '</div></div><div class="pc-k">' + contractMini(p) + '</div></div>';
  }
  function team() {
    var ros = roster(U), slots = slotMap(U), depth = S.teams[U].depth;
    var h = '<div class="ttlrow"><h2>Team</h2><div class="segs"><button class="on">Roster</button><button>Depth chart</button><button>Cap</button></div><span class="sub">' + ros.length + ' players · ' + fmtM(committed(U)) + ' committed (top 51) · ' + Object.keys(slots).length + ' starters</span></div>';
    h += '<div class="filters">' + ['All', 'Offense', 'Defense', 'Special teams', 'Final year'].map(function (f, i) { return '<button class="fchip' + (i ? '' : ' on') + '">' + f + '</button>'; }).join('') +
      '<div class="seg"><div class="kebab"><button aria-label="More options">•••</button></div></div></div>';
    POSITIONS.forEach(function (pos) {
      var grp = ros.filter(function (p) { return p.pos === pos; }); if (!grp.length) return;
      var order = depth[pos] || []; grp.sort(byKey(function (p) { var i = order.indexOf(p.id); return i < 0 ? 999 - p.ovr : i; }));
      h += '<div class="grp"><h3>' + GROUPS[pos] + '</h3><span>' + grp.length + ' · ' + fmtM(sumBy(grp, function (p) { return Cap.capHit(p, S.year); })) + '</span></div><div class="cards">' + grp.map(function (p) { return pcard2(p, slots[p.id]); }).join('') + '</div>';
    });
    return h;
  }

  // ---------- Player slide-over ----------
  function slideover(p, menu) {
    var Y = S.year, pi = potInfo(p), fy = fifthYearInfo(p), subs = subList(p);
    var h = '<div class="scrim2"></div><aside class="slide" role="dialog" aria-label="' + esc(p.name) + '"><div class="ps-hero" style="' + teamVars(p.team) + '"><button class="x" aria-label="Close">✕</button><button class="btn sm back">‹ Team</button>' +
      avatar(p, 196, { s: 66 }) + '<div class="ps-id"><h2 class="' + heroCls(lastName(p.name)) + '"><span class="fn">' + esc(p.name.split(' ')[0]) + '</span>' + esc(lastName(p.name)) + '</h2>' +
      '<div class="ps-meta"><b>' + p.pos + ' · #' + p.num + '</b><span>Age ' + p.age + '</span><span>' + esc(TEAM[p.team].name) + '</span><span>' + p.draft[0] + ' R' + p.draft[1] + ' #' + p.draft[2] + '</span></div></div></div>';
    h += '<div class="minitabs"><button class="on">Overview</button><button>Stats</button><button>Contract</button></div><div class="ps-body">';
    h += '<div class="ps-row"><div class="stat"><span>Potential</span><b>' + pi.grade + '<small>' + potRange(pi) + '</small></b></div><div class="stat"><span>Dev trait</span><div style="margin-top:6px">' + devBadge(p) + '</div></div><div class="stat"><span>Cap hit ' + Y + '</span><b>' + fmtM(Cap.capHit(p, Y)) + '</b></div><div class="stat"><span>Years left</span><b>' + Cap.yearsLeft(p, Y) + '</b></div></div>';
    if (fy) h += '<div class="opt"><h4>Fifth-year option · ' + fy.year + '</h4><p>' + fmtM(fy.amount) + ', fully guaranteed when exercised. ' + esc(fy.label) + '. Decide before the draft ends.</p></div>';
    h += '<h3 class="sec">Ratings <small>from 2024–26 stats</small></h3><div class="ps-row r3">' + subs.map(function (s) { return '<div class="stat tc' + tier(s[1]) + '"><div class="attr"><span>' + s[0] + '</span><b>' + s[1] + '</b><div class="bar"><i style="width:' + s[1] + '%"></i></div></div></div>'; }).join('') + '</div>';
    h += '<h3 class="sec">Last three seasons</h3><div class="tablewrap"><table class="dense seasons"><tbody>' + (p.lines || []).map(function (l) { return '<tr><td>' + l[0] + '</td><td>' + teamLink(l[1]) + '</td><td>' + esc(l[2]) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    h += '<div class="ps-actions"><button class="btn pri">Exercise option · ' + fmtM(fy.amount) + '</button><div class="kebab"><button aria-label="More actions">•••</button>' + (menu ? '<div class="menu">' +
      '<button>Decline option<small>He becomes a free agent after ' + Y + '</small></button><button>Extend</button><button>Shop in a trade</button><hr><button class="danger">Release pre-June 1<small>' + fmtM(releasePreview(p, false).now) + ' dead in ' + Y + '</small></button><button class="danger">Designate post-June 1</button></div>' : '') + '</div></div></aside>';
    return h;
  }

  // ---------- Moves ----------
  function movesTiles() {
    var exp = expiring(), picks = picksOf(U).filter(function (k) { return k.year === S.year; });
    var h = '<div class="ttlrow"><h2>Moves</h2><span class="sub">' + PHASE_LABEL[S.phase] + ': 2 moves open. Free agency, the draft and Make room open later in the year.</span></div><div class="movetiles">' +
      '<button class="movetile"><div class="n">' + exp.length + '<small>expiring</small></div><h3>Re-sign</h3><p>Keep your expiring players before free agency opens. Top ask: ' + esc(exp[0].name) + ' at ' + fmtM(askOf(exp[0]).apy) + '/yr.</p><div class="go">Review ›</div></button>' +
      '<button class="movetile"><div class="n">' + picks.length + '<small>' + S.year + ' picks</small></div><h3>Trade</h3><p>Open through the preseason, then until the week-' + TRADE_DEADLINE_WEEK + ' deadline.</p><div class="go">Make a trade ›</div></button></div>';
    return h;
  }
  function trade() {
    var post = isPostJune(), target = S.players.filter(function (p) { return p.name === 'Garrett Wilson'; })[0], ai = target.team;
    var give = { players: roster(U).filter(function (p) { return p.name === 'Carlton Davis'; }).map(function (p) { return p.id; }), picks: picksOf(U).filter(function (k) { return k.year === S.year && k.round === 2; }).map(function (k) { return k.id; }) };
    var get = { players: [target.id], picks: [] }, ev = aiTradeEval(ai, give, get);
    var st = ev.accept ? ['g', 'They would accept'] : ev.ratio > 0.85 ? ['w', 'Close: add a little'] : ['b', 'Not interested yet'];
    var c1 = TEAM_COLORS[ai];
    var h = '<div class="ttlrow"><h2>Moves</h2><div class="segs"><button>Re-sign</button><button class="on">Trade</button></div><span class="sub">Trades close after week ' + TRADE_DEADLINE_WEEK + ' of the regular season</span></div>';
    h += '<div class="partner"><label class="pick-team" style="--ptc1:' + c1[0] + '"><b>' + ai + '</b><span>' + esc(TEAM[ai].name) + ' · ' + teamRating(ai).ovr + ' OVR · ' + fmtM(space(ai)) + ' space</span><span class="car">▾</span></label><div class="teamstrip">' +
      TEAMS.filter(function (t) { return t.abbr !== U; }).map(function (t) { return '<button class="' + (t.abbr === ai ? 'on' : '') + '" style="--c:' + TEAM_COLORS[t.abbr][0] + '">' + t.abbr + '</button>'; }).join('') + '</div></div>';
    function side(abbr, sel, title) {
      var c = TEAM_COLORS[abbr], ros = roster(abbr).sort(byKey(function (p) { return p.ovr; }, true)), picks = picksOf(abbr);
      var s = '<section class="panel tside"><div class="tside-h" style="--s1:' + (abbr === U ? 'var(--tc1)' : c[0]) + ';--s2:' + c[1] + '"><h3>' + title + '</h3><span>' + fmtM(space(abbr)) + ' space</span></div><div class="in"><div class="lbl">In the deal</div>';
      s += sel.players.map(function (id) { var p = P(id); return '<div class="tcard tc' + tier(p.ovr) + '">' + avatar(p, 54, { s: 28 }) + '<div class="pc-main"><div class="pc-name' + nameCls(p.name) + '">' + nameHtml(p.name) + '</div><div class="pc-meta"><b>' + p.pos + '</b> · #' + p.num + ' · ' + p.age + ' yrs · ' + potInfo(p).trait + '</div></div><div class="pc-k"><b>' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</b><span>cap hit · ' + yrsLeftStr(p) + '</span></div><button class="rm" aria-label="Remove">✕</button></div>'; }).join('');
      s += '<div>' + sel.picks.map(function (id) { var k = picks.filter(function (x) { return x.id === id; })[0]; return '<span class="ptok">' + pickLabel(k) + ' <small>✕</small></span>'; }).join('') + '<span class="ptok add" style="background:none;border:1px dashed var(--line2);color:var(--muted)">+ Add pick</span></div>';
      s += '<div class="lbl">Add players</div><div class="picker">' + ros.slice(0, 12).map(function (p) { var on = sel.players.indexOf(p.id) >= 0; return '<button class="prow' + (on ? ' on' : '') + '">' + avatar(p, 34, { shield: false }) + shield(p.ovr, 28) + '<span class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></span><span class="hit">' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</span><span class="add">' + (on ? '✓' : '+') + '</span></button>'; }).join('') + '</div></div></section>';
      return s;
    }
    var pct = clamp(ev.ratio, 0, 1.2) / 1.2, A = Math.PI, pt = function (f, r) { var a = A - A * f; return [(100 + (r || 80) * Math.cos(a)).toFixed(1), (96 - (r || 80) * Math.sin(a)).toFixed(1)]; };
    var col = st[0] === 'g' ? 'var(--good)' : st[0] === 'w' ? 'var(--warn)' : 'var(--bad)';
    var gauge = '<svg class="gauge" viewBox="0 0 200 112" aria-hidden="true"><path d="M ' + pt(0).join(' ') + ' A 80 80 0 0 1 ' + pt(1).join(' ') + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="16"/><path d="M ' + pt(0).join(' ') + ' A 80 80 0 0 1 ' + pt(pct).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="16"/>' +
      '<text x="100" y="94" text-anchor="middle" fill="#fff" style="font:800 38px var(--display)">' + Math.round(ev.ratio * 100) + '</text><text x="100" y="110" text-anchor="middle" fill="#9aa7ba" style="font:600 10px Inter,sans-serif;letter-spacing:.1em">INTEREST</text></svg>';
    var meter = '<section class="panel meter">' + gauge + '<div class="verdict ' + st[0] + '">' + st[1] + '</div><p class="why">' + ai + ' values your side at ' + fmtM(ev.get) + ' vs ' + fmtM(ev.give) + '.</p>' +
      '<div class="caps"><div class="stat"><span>Your cap after</span><b>' + fmtM(space(U) + ev.capUser) + '</b></div><div class="stat"><span>' + ai + ' cap after</span><b>' + fmtM(space(ai) + ev.capAI) + '</b></div></div>' +
      '<div class="row2"><button class="btn pri">Propose trade</button><div class="kebab"><button aria-label="More">•••</button></div></div></section>';
    return h + '<div class="trade">' + side(U, give, 'You send') + meter + side(ai, get, ai + ' send') + '</div>';
  }

  Promise.all([fetch('../../src/data.json').then(function (r) { return r.json(); }), fetch('jerseys.json').then(function (r) { return r.json(); })]).then(function (a) {
    window.DATA = a[0]; J = a[1]; newGame(a[0], U, 42); reindex();
    S.players.forEach(function (p) { if (J[p.id] != null) p.num = J[p.id]; });
    var maye = S.players.filter(function (p) { return p.name === 'Drake Maye'; })[0], html;
    if (SCREEN === 'team') html = shell('team', team());
    else if (SCREEN === 'player') html = shell('team', team(), slideover(maye, false));
    else if (SCREEN === 'menu') html = shell('team', team(), slideover(maye, true));
    else if (SCREEN === 'moves') html = shell('moves', trade());
    else if (SCREEN === 'movetiles') html = shell('moves', movesTiles());
    else if (SCREEN === 'timeline') html = home({ tl: true });
    else if (SCREEN === 'confirm') html = home({ confirm: true });
    else html = home();
    document.getElementById('app').innerHTML = html;
    document.fonts.ready.then(function () { setTimeout(function () {
      var sl = document.querySelector('.slide'), cf = document.querySelector('.confirm');
      var h = sl ? Math.max(innerHeight, sl.scrollHeight) : cf ? Math.max(900, innerHeight) : document.documentElement.scrollHeight;
      document.title = 'H:' + h; }, 300); });
  });
})();
