// Screens and interaction (Gridiron GM). Rendering is plain template strings; events are delegated via data-act.
// Four destinations (Home, Team, Moves, League) and one Continue button. Which screens exist right now is
// decided by 55-phases.js; locked screens never render. Screens live in 61-64; this file is the shell.
var UI = { view: 'hub', last: {}, rgroup: 'ALL', sort: 'pos', rosterMode: 'cards', faPos: 'ALL', trade: null, modal: null, draftPos: 'ALL', leaders: 'pyd', msg: null, menu: null, tl: false, ptab: 'overview', pick: null, mode: 'quick' };
var $app = function () { return document.getElementById('app'); };
function flash(msg, bad) { UI.msg = { text: msg, bad: !!bad }; }

// ---------- formatting ----------
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
function heroCls(last) { var L = String(last).length; return L > 14 ? 'n4' : L > 11 ? 'n3' : L > 9 ? 'n2' : ''; }
function nameHtml(n) { n = String(n); var i = n.indexOf(' '); return i < 0 ? esc(n) : '<span class="fn">' + esc(n.slice(0, i)) + '</span> ' + esc(n.slice(i + 1)); }
function lastName(n) { n = String(n); var i = n.indexOf(' '); return i < 0 ? n : n.slice(i + 1); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
function numStr(p) { return p.num != null ? '#' + p.num : ''; }
// Original avatar (05-avatar.js) in a team-tinted frame, with the rating shield on its corner.
function avatar(p, size, opts) {
  opts = opts || {};
  var team = p.team || p.rights || null, c = team && TEAM_COLORS[team] ? TEAM_COLORS[team][0] : '#3a4352';
  return '<span class="avw"><span class="av" style="--a:' + size + 'px;--ac:' + c + '">' + Avatar.svg(p, size) + '</span>' + (opts.shield === false ? '' : shield(p.ovr, opts.s)) + '</span>';
}
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
  var out = [];
  labels.forEach(function (l) { if (p.sub && p.sub[l[0]] != null) out.push([l[1], p.sub[l[0]]]); });
  if (!out.length) Object.keys(p.sub || {}).forEach(function (k) { out.push([OLD_SUB[k] || k, p.sub[k]]); });
  return out;
}

// ---------- icons ----------
var ICONS = { home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  team: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8',
  moves: 'M4 8h14l-4-4M20 16H6l4 4', league: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3' };
function icon(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg>'; }

// ---------- shell ----------
var VIEWS = {};
function render() {
  if (!S) return renderStart();
  if (!screenOpen(UI.view)) UI.view = 'hub';
  UI.last[destOf(UI.view)] = UI.view;
  var enter = UI._lastView !== UI.view;
  var html = '<div class="app" style="' + teamVars(S.user) + '">' + barHtml() + progHtml();
  if (UI.msg) html += '<div class="msg' + (UI.msg.bad ? ' bad' : '') + '" role="status">' + esc(UI.msg.text) + '</div>';
  html += '<main' + (enter ? ' class="enter"' : '') + '>' + (VIEWS[UI.view] || VIEWS.hub)() + saveSection() + '</main>' + bbarHtml();
  if (UI.modal) {
    if (UI.modal.kind === 'slide') html += '<div class="scrim2" data-act="close-bg"></div><aside class="slide' + (UI.modalNew ? ' in' : '') + '" role="dialog" aria-modal="true">' + UI.modal() + '</aside>';
    else html += '<div class="overlay" data-act="close-bg"><div class="sheet narrow' + (UI.modalNew ? ' rise' : '') + '" role="dialog" aria-modal="true">' + UI.modal() + '</div></div>';
    UI.modalNew = false;
  }
  html += importInput() + '</div>';
  var keep = UI.modal && UI.modal.kind === 'slide' && document.querySelector('.slide') ? document.querySelector('.slide').scrollTop : 0;
  $app().innerHTML = html;
  if (keep && document.querySelector('.slide')) document.querySelector('.slide').scrollTop = keep;
  if (enter) { UI._lastView = UI.view; window.scrollTo(0, 0); }
  scheduleSave();
}
function openModal(f, kind) { f.kind = kind || f.kind || 'dialog'; UI.modal = f; UI.modalNew = true; UI.menu = null; }
function barHtml() {
  var t = TEAM[S.user], sp = space(S.user), mv = movesFor(S.phase, S.week).length, on = destOf(UI.view), c = continueInfo(), extra = extraActions();
  return '<header class="bar"><div class="id"><div class="tb">' + S.user + '</div><div class="tn">' + esc(t.name) + '<small>' + S.year + ' · ' + recStr(S.teams[S.user].rec) + ' · OVR ' + teamRating(S.user).ovr + '</small></div></div>' +
    '<nav class="nav" aria-label="Main">' + DESTINATIONS.map(function (n) {
      return '<button class="' + (on === n[0] ? 'on' : '') + '" data-act="dest" data-d="' + n[0] + '">' + n[1] + (n[0] === 'moves' && mv ? '<span class="cnt">' + mv + '</span>' : '') + '</button>';
    }).join('') + '</nav><div class="right"><div class="qs"><span><span class="lbl-l">Cap space</span><span class="lbl-s">Cap</span> <em class="ap">approx.</em></span><b class="' + (sp < 0 ? 'neg' : '') + '">' + fmtM(sp) + '</b></div>' +
    (extra.length ? kebab('bar', extra, true) : '') +
    '<button class="cont" data-act="continue"><div><b>Continue</b><small>' + c.sub + '</small></div><span class="arr">›</span></button></div></header>';
}
function progHtml() {
  var tl = timeline(S.phase, S.week), nx = tl.filter(function (x) { return x.state === 'next'; })[0];
  var h = '<button class="prog" data-act="tl" aria-expanded="' + UI.tl + '"><span class="ph">' + PHASE_LABEL[S.phase] + '<em>' + phaseDetail() + '</em></span><span class="line">' + tl.map(function (x) { return '<i class="' + x.state + '"></i>'; }).join('') + '</span>' +
    '<span class="nx">Next: <b>' + nx.label + '</b> · ' + nx.sub.charAt(0).toLowerCase() + nx.sub.slice(1) + '</span><span class="chev">' + (UI.tl ? '▴' : '▾') + '</span></button>';
  if (UI.tl) h += '<div class="tlpop"><nav class="timeline" aria-label="Season">' + tl.map(function (x) { return '<div class="tl ' + x.state + '"><b>' + x.label + '</b><small>' + x.sub + '</small></div>'; }).join('') + '</nav>' +
    '<p>Moves by phase: re-sign window: Re-sign, Trade · free agency: Free agency, Trade · draft: Draft, Trade (final cuts to 53 happen automatically after it) · season: Trade through week ' + TRADE_DEADLINE_WEEK + ', Free agency all season · playoffs: none.</p></div>';
  return h;
}
function phaseDetail() {
  if (S.phase === 'fa') return 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS;
  if (S.phase === 'season') return 'Week ' + Math.min(S.week + 1, WEEKS);
  if (S.phase === 'playoffs' && S.playoffs) return S.playoffs.champ ? 'Complete' : ROUND_NAMES[S.playoffs.round];
  if (S.phase === 'draft' && S.draft) { var k = currentPick(); return k ? 'Pick ' + k.no : 'Complete'; }
  return '';
}
function bbarHtml() {
  var on = destOf(UI.view), mv = movesFor(S.phase, S.week).length;
  var b = function (n) { return '<button class="' + (on === n[0] ? 'on' : '') + '" data-act="dest" data-d="' + n[0] + '">' + icon(n[0]) + n[1] + (n[0] === 'moves' && mv ? '<span class="cnt">' + mv + '</span>' : '') + '</button>'; };
  return '<nav class="bbar" aria-label="Main">' + DESTINATIONS.slice(0, 2).map(b).join('') + '<div class="gowrap"><button class="go" data-act="continue" aria-label="Continue: ' + continueInfo().sub + '"><span class="arr">›</span>Continue</button></div>' + DESTINATIONS.slice(2).map(b).join('') + '</nav>';
}
// "..." menus: a key, a list of [label, act, data, cls, sub]; only one is open at a time.
function kebab(key, items, down) {
  return '<div class="kebab"><button data-act="menu" data-m="' + key + '" aria-label="More actions" aria-expanded="' + (UI.menu === key) + '">•••</button>' + (UI.menu === key ? '<div class="menu' + (down ? ' down' : '') + '">' + items.map(function (it) {
    if (it === '-') return '<hr>';
    return '<button class="' + (it[3] || '') + '" data-act="' + it[1] + '"' + Object.keys(it[2] || {}).map(function (k) { return ' data-' + k + '="' + it[2][k] + '"'; }).join('') + '>' + it[0] + (it[4] ? '<small>' + it[4] + '</small>' : '') + '</button>';
  }).join('') + '</div>' : '') + '</div>';
}
function segs(list, cur) { return '<div class="segs" role="tablist">' + list.map(function (v) { return '<button role="tab" aria-selected="' + (v === cur) + '" class="' + (v === cur ? 'on' : '') + '" data-act="view" data-v="' + v + '">' + SCREEN_LABEL[v] + '</button>'; }).join('') + '</div>'; }
function titleRow(title, seg, sub, end) { return '<div class="ttlrow"><h2>' + title + '</h2>' + (seg || '') + (sub ? '<span class="sub">' + sub + '</span>' : '') + (end ? '<div class="end">' + end + '</div>' : '') + '</div>'; }
function h2(title, sub, btns) { return titleRow(title, '', sub, btns); }

// ---------- Continue: the one button that moves the year forward ----------
function draftLeft() { return S.draft && S.draft.i < S.draft.order.length; }
function userPicksLeft() { return S.draft ? S.draft.order.slice(S.draft.i).filter(function (id) { var k = S.picks.filter(function (x) { return x.id === id; })[0]; return k && k.owner === S.user; }).length : 0; }
function continueInfo() {
  switch (S.phase) {
    case 'resign': return { sub: 'Open free agency' };
    case 'fa': return { sub: S.faDay < FA_DAYS - 1 ? 'Free agency day ' + (S.faDay + 2) : 'Start the draft' };
    case 'draft':
      if (draftLeft()) { var k = currentPick(); return { sub: k.owner === S.user ? 'Make your pick' : userPicksLeft() ? 'Sim to your pick' : 'Finish the draft' }; }
      return { sub: 'Final cuts and week 1' };
    case 'preseason': return { sub: 'Final cuts and week 1' };
    case 'season': return { sub: S.week < WEEKS ? 'Sim week ' + (S.week + 1) : 'Start the playoffs' };
    default: return { sub: S.playoffs && S.playoffs.champ ? 'Start the ' + (S.year + 1) + ' offseason' : 'Sim the ' + (S.playoffs ? ROUND_NAMES[S.playoffs.round].toLowerCase() : 'playoffs') };
  }
}
// Unfinished things worth a second look before moving on. "block" ones must be settled first.
function continueIssues() {
  var out = [], exp = expiring(), n = roster(S.user).length;
  if (S.phase === 'resign' && exp.length) out.push({ html: '<b>' + plural(exp.length, 'expiring player') + '</b> haven\'t been re-signed. They hit free agency, including ' + exp.slice(0, 2).map(function (p) { return esc(p.name) + ' (' + p.ovr + ')'; }).join(' and ') + '.' });
  if ((S.phase === 'resign' || S.phase === 'fa') && pendingOptions(S.user).length) pendingOptions(S.user).forEach(function (p) { out.push({ html: '<b>' + esc(p.name) + '\'s fifth-year option</b> is still open. It\'s due before the draft ends.' }); });
  if (S.phase === 'draft' && !draftLeft()) pendingOptions(S.user).forEach(function (p) { var i = fifthYearInfo(p); out.push({ block: true, html: '<b>' + esc(p.name) + '\'s fifth-year option</b> (' + fmtM(i.amount) + ' for ' + i.year + ') must be decided before the draft ends.', opt: p.id }); });
  if (S.phase === 'season' && S.week < WEEKS && n < ROSTER_MAX) out.push({ html: 'Your roster has <b>' + n + ' players</b>, under ' + ROSTER_MAX + '. Free agents are available all season.' });
  if (S.phase === 'season' && fullSpace(S.user) < 0) out.push({ html: 'You are <b>' + fmtM(-fullSpace(S.user)) + ' over the cap</b>.' });
  if (S.phase === 'fa' && space(S.user) < 0) out.push({ block: true, html: 'You are <b>' + fmtM(-space(S.user)) + ' over the cap</b>. Clear space before moving on.' });
  return out;
}
function confirmDialog(issues) {
  var f = function () {
    var iss = continueIssues(), block = iss.some(function (x) { return x.block; });
    return '<div class="confirm-in"><h3>' + continueInfo().sub + '?</h3><p class="muted">' + (block ? 'Settle this first.' : 'A few things aren\'t finished. You can still go ahead.') + '</p><ul class="issues">' + iss.map(function (x) {
      return '<li>' + x.html + (x.opt ? '<div class="btns" style="margin-top:8px"><button class="btn pri sm" data-act="fifth" data-id="' + x.opt + '" data-x="1" data-back="confirm">Exercise option</button><button class="btn sm" data-act="fifth" data-id="' + x.opt + '" data-x="0" data-back="confirm">Decline option</button></div>' : '') + '</li>';
    }).join('') + (iss.length ? '' : '<li class="ok">All set.</li>') + '</ul><div class="btns end"><button class="btn" data-act="close">Go back</button>' + (block ? '' : '<button class="btn pri" data-act="continue" data-force="1">' + continueInfo().sub + ' ›</button>') + '</div></div>';
  };
  f.kind = 'dialog'; f.confirm = true;
  return f;
}
function doContinue() {
  var before = S.phase;
  if (S.phase === 'draft' && draftLeft()) {
    var k = currentPick();
    if (k.owner === S.user) { UI.view = 'draft'; flash('You\'re on the clock: pick ' + k.no + '. Choose from the board.'); return; }
    draftUntilUser(false);
    UI.view = 'draft';
    if (draftLeft()) flash('You\'re on the clock: pick ' + currentPick().no + '.'); else flash('The draft is complete. Continue runs final cuts and starts week 1.');
    return;
  }
  var r = advance();
  if (!r.ok) { flash(r.msg, true); if (r.cuts) UI.view = 'cuts'; return; }
  UI.msg = null; UI.modal = null;
  if (S.phase !== before) {
    UI.trade = null;
    UI.view = S.phase === 'draft' ? 'draft' : S.phase === 'playoffs' ? 'bracket' : 'hub';
    if (before === 'draft' || before === 'preseason') flash('Final cuts done: ' + roster(S.user).length + ' players, ' + fmtM(fullSpace(S.user)) + ' of cap room. Week 1 is next.');
  }
}
function extraActions() {
  var out = [];
  if (S.phase === 'fa') out.push(['Skip to the draft', 'skip-fa', null, '', 'Sims the rest of free agency']);
  if (S.phase === 'draft' && draftLeft()) out.push(['Auto-draft the rest', 'draft-auto', null, '', 'The AI makes your remaining picks']);
  if (S.phase === 'season' && S.week < WEEKS) out.push(['Sim to the playoffs', 'sim-season', null, '', 'Plays every remaining week']);
  if (S.phase === 'playoffs' && S.playoffs && !S.playoffs.champ) out.push(['Sim all playoffs', 'sim-playoffs']);
  return out;
}

// ---------- start screen and quick start ----------
function renderStart() {
  var has = hasSave();
  var h = '<div class="startpage"><div class="start"><h1 class="logo"><span>Franchise mode</span>Gridiron GM</h1>' +
    '<p class="lead">Real rosters and contracts (OverTheCap via nflverse). Ratings come from 2024–26 stats and snaps. Your first season is ' + (window.DATA ? DATA.meta.startYear : 2027) + '.</p>' +
    '<div class="btns">' + (has ? '<button class="btn pri" data-act="continue-save">Continue saved game</button>' : '') + '<button class="btn" data-act="import">Import save</button></div>' + importInput() +
    '<h2 class="h3">Pick a team</h2><div class="teamgrid">' + TEAMS.slice().sort(byKey(function (t) { return t.name; })).map(function (t) {
      return '<button class="teambtn" style="' + teamVars(t.abbr) + '" data-act="pick-team" data-t="' + t.abbr + '"><b>' + t.abbr + '</b><span>' + esc(t.name) + '</span></button>';
    }).join('') + '</div>' + (has ? '<p class="note">Starting a new game replaces your saved game.</p>' : '') + '</div></div>';
  if (UI.pick) {
    var t = TEAM[UI.pick], Y = window.DATA ? DATA.meta.startYear : 2027;
    h += '<div class="overlay" data-act="close-bg"><div class="sheet narrow rise" role="dialog" aria-modal="true"><div class="ps-hero slim" style="' + teamVars(UI.pick) + '"><button class="x" data-act="close-pick" aria-label="Close">✕</button><div class="tb big">' + UI.pick + '</div><div class="ps-id"><h2>' + esc(t.name) + '</h2><div class="ps-meta"><span>' + t.conf + ' ' + t.div + '</span><span>OVR ' + startRating(UI.pick) + '</span></div></div></div>' +
      '<div class="ps-body"><div class="modes">' +
      '<button class="mode' + (UI.mode === 'quick' ? ' on' : '') + '" data-act="mode" data-m="quick"><b>Quick start · Week 1</b><span>The AI runs the ' + Y + ' offseason for every team, yours included: re-signings, fifth-year options, free agency, the draft and cuts to 53 under the cap. You take over at week 1 and get a recap.</span><em>Recommended</em></button>' +
      '<button class="mode' + (UI.mode === 'full' ? ' on' : '') + '" data-act="mode" data-m="full"><b>Full offseason</b><span>Run the ' + Y + ' offseason yourself, starting in the re-sign window.</span></button></div>' +
      '<p class="seedrow"><label for="seed">Seed</label><input id="seed" inputmode="numeric" placeholder="random" size="10"><span>Optional. The same seed and the same moves replay the same league.</span></p>' +
      '<div class="btns end"><button class="btn" data-act="close-pick">Back</button><button class="btn pri" data-act="new" data-t="' + UI.pick + '">' + (UI.mode === 'quick' ? 'Start at week 1' : 'Start the offseason') + ' ›</button></div></div></div></div>';
  }
  $app().innerHTML = h;
}
function startRating(abbr) { if (!window.DATA) return ''; var ps = DATA.players.filter(function (p) { return p.team === abbr; }).sort(function (a, b) { return b.ovr - a.ovr; }); return ps.length ? Math.round(ps.slice(0, 22).reduce(function (s, p) { return s + p.ovr; }, 0) / Math.min(22, ps.length)) : ''; }
function summaryModal() {
  var f = function () {
    var s = S.quickSummary; if (!s) return '';
    var list = function (ids, right) { return ids.length ? ids.map(function (id) { var p = P(id); return '<div class="mini" data-act="player" data-id="' + id + '" role="button" tabindex="0">' + avatar(p, 40, { shield: false }) + '<div class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + ' · ' + right(p) + '</small></div>' + shield(p.ovr, 30) + '</div>'; }).join('') : '<p class="muted">None.</p>'; };
    var h = '<div class="ps-hero slim" style="' + teamVars(S.user) + '"><button class="x" data-act="close" aria-label="Close">✕</button><div class="ps-id"><h2>Your ' + s.year + ' offseason</h2><div class="ps-meta"><span>Ran on autopilot</span><span>' + roster(S.user).length + ' players</span><span>' + fmtM(fullSpace(S.user)) + ' cap room approx.</span></div></div></div><div class="ps-body recap">';
    if (s.options.length) h += '<h3 class="sec">Fifth-year options</h3>' + s.options.map(function (o) { return '<p>' + esc(o.name) + ': <b>' + o.decision + '</b>.</p>'; }).join('');
    h += '<h3 class="sec">Draft picks <small>' + s.drafted.length + '</small></h3>' + list(s.drafted, function (p) { return 'round ' + p.draft[1] + ', pick ' + p.draft[2] + ' · ' + numStr(p); });
    h += '<h3 class="sec">Signed <small>' + (s.resigned.length + s.signed.length) + '</small></h3>' + list(s.resigned.concat(s.signed), function (p) { return (s.resigned.indexOf(p.id) >= 0 ? 're-signed · ' : '') + fmtM(Cap.capHit(p, S.year)) + ' · ' + yrsLeftStr(p); });
    h += '<h3 class="sec">Left <small>' + s.left.length + '</small></h3><div class="tablewrap"><table class="dense"><tbody>' + s.left.slice(0, 25).map(function (x) {
      return '<tr><td>' + shield(x.ovr, 28) + '</td><td><span class="pn">' + esc(x.name) + '</span> <span class="muted small">' + x.pos + '</span></td><td class="r">' + (x.to === 'retired' ? 'retired' : x.to === 'unsigned' ? '<span class="muted">unsigned</span>' : 'to ' + teamLink(x.to)) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      (s.left.length > 25 ? '<p class="note">And ' + (s.left.length - 25) + ' more, mostly depth players whose contracts expired.</p>' : '');
    return h + '</div><div class="ps-actions"><button class="btn pri" data-act="close">Go to week 1 ›</button></div>';
  };
  f.kind = 'dialog';
  return f;
}
function startGame(abbr, mode) {
  var sd = document.getElementById('seed');
  newGame(DATA, abbr, sd ? sd.value.trim() : null); reindex();
  UI.view = 'hub'; UI.trade = null; UI._preview = null; UI.pick = null; UI.last = {};
  if (mode === 'quick') {
    $app().innerHTML = '<div class="startpage"><div class="start"><h1 class="logo"><span>Quick start</span>Simulating the offseason</h1><p class="lead">Re-signings, free agency, the draft and cuts to 53 for all 32 teams…</p></div></div>';
    setTimeout(function () { quickStart(); openModal(summaryModal()); render(); }, 30);
    return true;
  }
  return false;
}

// ---------- events ----------
function onClick(e) {
  var el = e.target.closest('[data-act]');
  if (!el) { if (UI.menu) { UI.menu = null; render(); } return; }
  var a = el.getAttribute('data-act'), d = el.dataset;
  if (a === 'close-bg' && e.target !== el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'OPTION' || el.tagName === 'INPUT') return;
  if (a !== 'menu') UI.menu = null;
  var r;
  switch (a) {
    case 'pick-team': UI.pick = d.t; UI.mode = 'quick'; renderStart(); return;
    case 'mode': UI.mode = d.m; var sv = document.getElementById('seed') ? document.getElementById('seed').value : ''; renderStart(); if (document.getElementById('seed')) document.getElementById('seed').value = sv; return;
    case 'close-pick': UI.pick = null; renderStart(); return;
    case 'new':
      if (hasSave() && !confirm('Start a new game as ' + TEAM[d.t].name + '? This replaces your saved game.')) return;
      if (startGame(d.t, UI.mode)) return;
      break;
    case 'continue-save': loadGame(); break;
    case 'dest':
      var opts = d.d === 'team' ? TEAM_SCREENS : d.d === 'league' ? leagueFor(S.phase, S.week) : d.d === 'moves' ? movesFor(S.phase, S.week) : ['hub'];
      var prev = UI.last[d.d];
      UI.view = d.d === 'home' ? 'hub' : prev && opts.indexOf(prev) >= 0 ? prev : d.d === 'moves' ? (opts.length === 1 ? opts[0] : 'moves') : opts[0];
      if (d.d === 'moves' && opts.length > 1 && UI.view !== 'moves' && destOf(UI._lastView) === 'moves') UI.view = 'moves';
      UI.msg = null; UI.modal = null; UI.tl = false; break;
    case 'view': UI.view = d.v; UI.msg = null; UI.modal = null; UI.tl = false; break;
    case 'tl': UI.tl = !UI.tl; break;
    case 'menu': UI.menu = UI.menu === d.m ? null : d.m; break;
    case 'continue':
      if (UI.modal && UI.modal.confirm) UI.modal = null;
      var iss = continueIssues();
      if (iss.length && !d.force && !(S.phase === 'draft' && draftLeft())) { openModal(confirmDialog(iss)); break; }
      doContinue(); break;
    case 'sim-season': UI.msg = null; var g = 0; while (S.phase === 'season' && S.week < WEEKS && g++ < 30) advance(); break;
    case 'sim-playoffs': var g2 = 0; while (S.phase === 'playoffs' && !S.playoffs.champ && g2++ < 6) advance(); UI.view = 'bracket'; break;
    case 'skip-fa': UI.msg = null; var g3 = 0; while (S.phase === 'fa' && g3++ < 10) advance(); UI.view = 'draft'; break;
    case 'auto-roster': var ar = userAutoRoster(); flash(ar.msg + (ar.missing ? ' Restructure a contract or cut someone to make room.' : ''), ar.missing > 0); UI.modal = null; if (ar.missing) { if (screenOpen('cuts')) UI.view = 'cuts'; else openModal(makeRoomModal()); } break;
    case 'make-room': if (screenOpen('cuts')) { UI.view = 'cuts'; UI.modal = null; } else openModal(makeRoomModal()); break;
    case 'filter': UI[d.k] = d.p; break;
    case 'rgroup': UI.rgroup = d.p; break;
    case 'roster-mode': UI.rosterMode = d.m; break;
    case 'roster-sort': UI.sort = d.s; break;
    case 'leaders': UI.leaders = d.c; break;
    case 'player': UI.offer = null; UI.offerErr = null; UI.ptab = 'overview'; openModal(playerModal(d.id), 'slide'); break;
    case 'ptab': UI.ptab = d.t; break;
    case 'close': case 'close-bg': UI.modal = null; UI.offer = null; break;
    case 'release':
      var p = P(d.id), pv = releasePreview(p, d.j === '1');
      if (!confirm('Release ' + p.name + '? Dead money: ' + fmtM(pv.now) + ' in ' + S.year + (pv.next ? ' and ' + fmtM(pv.next) + ' in ' + (S.year + 1) : '') + '. Cap savings this year: ' + fmtM(pv.savings) + '.')) { render(); return; }
      r = release(p, d.j === '1'); UI.modal = null; flash(r.ok ? p.name + ' released.' : r.msg, !r.ok); break;
    case 'restructure':
      var rp = P(d.id), res = restructurePlayer(rp, Cap.restructureMax(rp, S.year, rp.exp));
      flash(res.saved ? 'Restructured ' + rp.name + ': ' + fmtM(res.saved) + ' saved this year.' : 'Nothing to restructure.');
      if (d.back === 'room') { if (UI.modal) UI.modal = makeRoomModal(); } else { UI.modal = playerModal(d.id); UI.modal.kind = 'slide'; }
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
    case 'fifth':
      var fp = P(d.id), fr = decideFifthYear(fp, d.x === '1');
      flash(fr.ok ? (d.x === '1' ? 'Option exercised for ' + fp.name + '.' : 'Option declined for ' + fp.name + '.') : fr.msg, !fr.ok);
      if (d.back === 'confirm') openModal(confirmDialog()); else { UI.modal = playerModal(d.id); UI.modal.kind = 'slide'; }
      break;
    case 'recap': if (S.quickSummary) openModal(summaryModal()); break;
    case 'export': exportSave(); return;
    case 'import': document.getElementById('importfile').click(); return;
    case 'draft-auto': draftUntilUser(true); UI.view = 'draft'; flash('Draft complete. Rookies are signed to slotted contracts. Continue runs final cuts and starts week 1.'); break;
    case 'draft-pick': UI.modal = null; makePick(currentPick(), P(d.id)); draftUntilUser(false); break;
  }
  render();
}
function onChange(e) {
  var el = e.target;
  if (el.id === 'importfile') { if (el.files && el.files[0]) importSave(el.files[0]); el.value = ''; return; }
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
  // cards and recap rows are role="button": Enter/Space opens them like a click
  var t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
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
// Older saves have no jersey numbers: take them from the data, then number anyone left over.
function fillNumbers() {
  if (typeof DATA === 'undefined' || !DATA) return;
  var byId = {}; DATA.players.forEach(function (p) { if (p.num != null) byId[p.id] = p.num; });
  S.players.forEach(function (p) { if (p.num == null && byId[p.id] != null) p.num = byId[p.id]; });
  S.players.forEach(function (p) { if (p.num == null && p.team) p.num = freeNumber(p.team, p.pos); });
}
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
      fillNumbers();
      UI.view = 'hub'; UI.modal = null; UI.trade = null; UI._preview = null; UI.pick = null;
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
    fillNumbers();
    UI.view = 'hub'; UI._preview = null;
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}
