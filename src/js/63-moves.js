// Moves: only what the phase allows (Re-sign, Free agency, Trade, Draft, Make room). One open move opens
// directly; several show big tiles and a toggle between them.
function movesHead(cur, sub, end) {
  var open = movesFor(S.phase, S.week);
  return titleRow('Moves', open.length > 1 ? segs(open, cur) : '', sub, end);
}
VIEWS.moves = function () {
  var open = movesFor(S.phase, S.week);
  if (!open.length) return titleRow('Moves', '', PHASE_LABEL[S.phase]) + '<section class="panel locked"><h3>No moves in the playoffs</h3><p class="muted">Trades and signings reopen after the Super Bowl, starting with the re-sign window.</p></section>';
  var tile = function (v) {
    var n = '', small = '', p = '';
    if (v === 'resign') { var exp = expiring(); n = exp.length; small = 'expiring'; p = exp.length ? 'Keep your expiring players before free agency opens. Top ask: ' + esc(exp[0].name) + ' at ' + fmtM(askOf(exp[0]).apy) + '/yr.' : 'Nobody left to re-sign.'; }
    if (v === 'fa') { var pool = freeAgents(); n = pool.filter(function (x) { return x.ovr >= 75; }).length; small = 'rated 75+'; p = S.phase === 'fa' ? 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS + '. Asks drop each day, but other teams sign players too.' : 'Unsigned players, available all season.'; }
    if (v === 'trade') { var py = S.phase === 'season' || S.phase === 'playoffs' ? S.year + 1 : S.year, picks = picksOf(S.user).filter(function (k) { return k.year === py; }); n = picks.length; small = py + ' picks'; p = S.phase === 'season' ? 'Deadline after week ' + TRADE_DEADLINE_WEEK + '.' : 'Open until the week-' + TRADE_DEADLINE_WEEK + ' deadline.'; }
    if (v === 'draft') { var k = currentPick(); n = k ? '#' + k.no : '✓'; small = k ? 'on the clock' : 'complete'; p = 'Your picks: ' + (picksOf(S.user).filter(function (x) { return x.year === S.year; }).map(function (x) { return '#' + x.no; }).join(', ') || 'none left') + '.'; }
    if (v === 'cuts') { n = roster(S.user).length; small = 'of ' + ROSTER_MAX; p = 'Final cuts got stuck: make room, then press Continue.'; }
    return '<button class="movetile" data-act="view" data-v="' + v + '"><div class="n">' + n + '<small>' + small + '</small></div><h3>' + SCREEN_LABEL[v] + '</h3><p>' + p + '</p><div class="go">Open ›</div></button>';
  };
  return titleRow('Moves', '', PHASE_LABEL[S.phase] + ': ' + plural(open.length, 'move') + ' open.') + '<div class="movetiles">' + open.map(tile).join('') + '</div>';
};

// ---------- Re-sign and free agency ----------
function signCard(p, resign) {
  var a = askOf(p);
  return pcard(p, { meta: (p.prevTeam || p.cutBy || 'FA') + ' last', right: '<b>' + fmtM(a.apy) + '</b><span>ask / yr · ' + a.years + ' yrs</span><button class="btn acc sm" data-act="offer" data-id="' + p.id + '" data-mode="sign">' + (resign ? 'Re-sign' : 'Offer') + '</button>' });
}
VIEWS.resign = function () {
  var exp = expiring();
  return movesHead('resign', plural(exp.length, 'expiring contract') + '. Anyone you don\'t re-sign hits free agency.') + (exp.length ? '<div class="cards">' + exp.map(function (p) { return signCard(p, true); }).join('') + '</div>' : '<p class="muted">Nobody here.</p>');
};
function posChips(key) {
  return '<div class="filters posrow">' + ['ALL'].concat(POSITIONS).map(function (p) { return '<button class="fchip' + (UI[key] === p ? ' on' : '') + '" data-act="filter" data-k="' + key + '" data-p="' + p + '">' + (p === 'ALL' ? 'All' : p) + '</button>'; }).join('') + '</div>';
}
VIEWS.fa = function () {
  var pool = freeAgents();
  if (UI.faPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.faPos; });
  pool.sort(byKey(function (p) { return p.ovr; }, true));
  var sub = S.phase === 'fa' ? 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS + '. Asks drop each day; other teams sign players too.' : 'Unsigned players. Good young players still unsigned take cheap one-year deals.';
  return movesHead('fa', sub) + posChips('faPos') + (pool.length ? '<div class="cards">' + pool.slice(0, 120).map(function (p) { return signCard(p, false); }).join('') + '</div>' : '<p class="muted">Nobody here.</p>');
};

// ---------- offer ----------
function offerModal(id, mode) {
  var p = P(id), d = Market.demand(p, marketCap(), S.year);
  if (!UI.offer || UI.offer.id !== id) UI.offer = { id: id, mode: mode, years: d.years, total: +(d.apy * d.years / 1000).toFixed(1), bonus: +(d.gtd * 0.5 / 1000).toFixed(1), gtd: +(d.gtd / 1000).toFixed(1) };
  var f = function () {
    var o = UI.offer, abbr = S.user;
    var offer = { years: o.years, total: Math.round(o.total * 1000), bonus: Math.round(o.bonus * 1000), gtd: Math.round(o.gtd * 1000) };
    var yrs = mode === 'extend' ? buildExtensionYears(p, offer) : Cap.buildContract(offer, S.year, p.exp);
    var ev = Market.evaluate(p, offer, offerCtx(p, abbr));
    var hitNow = (Cap.row({ years: yrs }, S.year) || { cap: 0 }).cap - (mode === 'extend' ? Cap.capHit(p, S.year) : 0);
    var mood = ev.mood >= 1 ? ['g', 'Likely to accept', 'var(--good)'] : ev.mood >= 0.93 ? ['w', 'Close', 'var(--warn)'] : ['b', 'Not close', 'var(--bad)'];
    var h = '<div class="ps-hero slim" style="' + teamVars(p.team || p.rights || S.user) + '"><button class="x" data-act="close" aria-label="Close">✕</button>' + avatar(p, 72, { s: 30 }) + '<div class="ps-id"><h2>' + (mode === 'extend' ? 'Extend ' : p.rights === S.user ? 'Re-sign ' : 'Offer: ') + esc(p.name) + '</h2>' +
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
    h += '</tbody></table></div><div class="kv" style="margin-top:12px"><span>Cap space after <em class="ap">approx.</em></span><b class="' + (space(abbr) - hitNow < 0 ? 'neg' : '') + '">' + fmtM(space(abbr) - hitNow) + '</b></div>';
    var fillShort = offerShortfall(p, mode, hitNow);
    if (fillShort > 0) h += '<p class="warnbox">This leaves you ' + fmtM(fillShort) + ' short of filling your roster (' + ROSTER_MAX + ' players at week 1).</p>';
    if (UI.offerErr) h += '<p class="badbox">' + esc(UI.offerErr) + '</p>';
    return h + '</div><div class="ps-actions"><button class="btn pri" data-act="offer-submit">Make offer</button>' + kebab('offer', [['Fill in asking price', 'offer-ask']]) + '</div>';
  };
  f.kind = 'dialog';
  return f;
}
// Shortfall to fill 53 after this deal (0 if fine). Only matters before the season.
function offerShortfall(p, mode, hitNow) {
  if (S.phase === 'playoffs') return 0;
  return rosterFill(S.user, mode === 'extend' ? 0 : 1, hitNow, mode === 'extend' ? null : p.pos).short;
}
function field(k, label, v, min, max, step) { return '<label>' + label + '<input type="number" inputmode="decimal" data-field="' + k + '" value="' + v + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>'; }

// ---------- Make room (a Moves screen while final cuts are stuck, a pop-up elsewhere) ----------
function makeRoomBody() {
  var o = makeRoomOptions(S.user), rf = rosterFill(S.user);
  var h = '<div class="ps-row r3"><div class="stat"><span>Needed to fill ' + ROSTER_MAX + '</span><b>' + fmtM(rf.need) + '</b></div><div class="stat"><span>Room, every contract counted</span><b>' + fmtM(rf.room) + '</b></div><div class="stat"><span>Short</span><b class="' + (rf.short ? 'neg' : 'good') + '">' + fmtM(rf.short) + '</b></div></div>';
  h += '<p class="note">Filling ' + ROSTER_MAX + ' needs ' + fmtM(rf.need) + '; you have ' + fmtM(rf.room) + ' with every contract counted' + (rf.short ? ': <b class="bad">' + fmtM(rf.short) + ' short</b>' : '') + '.</p>';
  h += '<h3 class="sec">Restructures</h3>' + (o.restructures.length ? '<div class="tablewrap"><table class="dense"><tbody>' + o.restructures.map(function (x) {
    return '<tr><td>' + avatar(x.p, 30, { shield: false }) + '</td><td><span class="pn">' + esc(x.p.name) + '</span> <span class="muted">' + x.p.pos + '</span></td><td class="r">saves <b>' + fmtM(x.saves) + '</b> now</td><td class="r"><button class="btn sm" data-act="restructure" data-id="' + x.p.id + '" data-back="room">Restructure</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">No contracts left to restructure.</p>');
  h += '<h3 class="sec">Cut options</h3><p class="note">Net room = cap saved minus the ' + fmtM(Cap.minSalary(FILLER_PRICE_EXP, S.year)) + ' it costs to refill the spot at the minimum. Players rated 80+ and cuts netting under $250K are left out; starters come last.</p>';
  if (o.cuts.length && o.short > 0) h += '<p class="warnbox">' + (o.cutsNeeded ? 'You\'d need ' + o.cutsNeeded + ' of these cuts to cover the ' + fmtM(o.short) + ' shortfall.' : 'Even all ' + o.cuts.length + ' of these cuts net only ' + fmtM(o.cutsTotal) + ', short of ' + fmtM(o.short) + ': restructure first.') + '</p>';
  h += o.cuts.length ? '<div class="tablewrap"><table class="dense"><thead><tr><th></th><th>Player</th><th class="r">Net</th><th class="r hide-sm">Saves − refill</th><th class="r hide-sm">Dead</th><th></th></tr></thead><tbody>' + o.cuts.map(function (x) {
    return '<tr><td>' + shield(x.p.ovr, 28) + '</td><td><span class="pn">' + esc(x.p.name) + '</span> <span class="muted small">' + x.p.pos + ' · ' + (x.starter ? 'starter' : 'backup') + '</span></td><td class="r"><b>net ' + fmtM(x.net) + '</b></td><td class="r muted hide-sm">saves ' + fmtM(x.saves) + ' − refill ' + fmtM(x.replacement) + '</td><td class="r muted hide-sm">dead ' + fmtM(x.dead) + '</td><td class="r"><button class="btn sm" data-act="player" data-id="' + x.p.id + '">Review</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">No cut frees at least $250K once the spot is refilled.</p>';
  return h;
}
function makeRoomModal() {
  var f = function () { return '<div class="ps-hero slim" style="' + teamVars(S.user) + '"><button class="x" data-act="close" aria-label="Close">✕</button><div class="ps-id"><h2>Make room</h2><div class="ps-meta"><span>Restructures first, then cuts</span></div></div></div><div class="ps-body">' + makeRoomBody() + '</div>'; };
  f.kind = 'dialog';
  return f;
}
VIEWS.cuts = function () {
  var n = roster(S.user).length, slots = slotMap(S.user);
  var h = movesHead('cuts', n + ' on the roster · final cuts to ' + ROSTER_MAX + ' under the cap, then Continue starts week 1', kebab('cuts', [['Auto-fill and cut to ' + ROSTER_MAX, 'auto-roster']], true));
  h += '<section class="panel pad">' + makeRoomBody() + '</section>';
  var bubble = roster(S.user).filter(function (p) { return !slots[p.id]; }).sort(byKey(function (p) { return p.ovr; })).slice(0, 12);
  if (bubble.length) h += '<h3 class="sec">On the bubble <small>lowest-rated non-starters</small></h3><div class="cards">' + bubble.map(function (p) {
    var pv = releasePreview(p, false);
    return pcard(p, { right: '<b>' + fmtM(pv.savings) + '</b><span>saved if cut · ' + fmtM(pv.now) + ' dead</span>' });
  }).join('') + '</div>';
  return h;
};

// ---------- Trade ----------
function tradeState() {
  if (!UI.trade) UI.trade = { ai: aiTeams().filter(function (a) { return a !== S.user; })[0], give: { players: [], picks: [] }, get: { players: [], picks: [] }, result: null, suggestion: null };
  return UI.trade;
}
function deepTeam(c) { return hexLum(c) > 0.2 ? mixHex(c, '#0a0f18', 0.45) : hexLum(c) < 0.02 ? mixHex(c, '#1b2431', 0.35) : c; }
VIEWS.trade = function () {
  var tr = tradeState(), ai = tr.ai, c1 = TEAM_COLORS[ai];
  var ev = aiTradeEval(ai, tr.give, tr.get);
  var empty = !tr.give.players.length && !tr.give.picks.length && !tr.get.players.length && !tr.get.picks.length;
  var st = empty ? ['w', 'Build a deal'] : ev.accept ? ['g', 'They would accept'] : ev.ratio > 0.85 ? ['w', 'Close: add a little'] : ['b', 'Not interested yet'];
  var h = movesHead('trade', S.phase === 'season' ? 'Deadline after week ' + TRADE_DEADLINE_WEEK + ' (' + plural(Math.max(0, TRADE_DEADLINE_WEEK - S.week), 'week') + ' left)' : 'Trades close after week ' + TRADE_DEADLINE_WEEK + ' of the regular season');
  h += '<div class="partner"><label class="pick-team" style="--ptc1:' + deepTeam(c1[0]) + '"><b>' + ai + '</b><span>' + esc(TEAM[ai].name) + ' · ' + teamRating(ai).ovr + ' OVR · ' + fmtM(space(ai)) + ' space</span><span class="car">▾</span>' +
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
    '<div class="row2"><button class="btn pri" data-act="trade-propose"' + (empty ? ' disabled' : '') + '>Propose trade</button>' + kebab('trade', [['What would it take?', 'trade-ask'], ['Clear the deal', 'trade-clear']]) + '</div>' +
    (tr.suggestion ? '<p class="say">' + tr.suggestion + '</p>' : '') + (tr.result ? '<p class="say ' + (tr.result.ok ? 'good' : 'bad') + '">' + esc(tr.result.text) + '</p>' : '') +
    '<p class="rules">' + (isPostJune() ? 'Post-June 1 rules: unamortized bonus splits over two years.' : 'Pre-June 1: all unamortized bonus hits the old team now.') + ' Cap hit = what the receiving team takes on.</p></section>';
  return h + '<div class="trade">' + tradeSide(S.user, tr.give, 'give', 'You send') + meter + tradeSide(ai, tr.get, 'get', ai + ' send') + '</div>';
};
function tradeSide(abbr, side, key, title) {
  var c = TEAM_COLORS[abbr], post = isPostJune(), picks = picksOf(abbr), ros = roster(abbr).sort(byKey(function (p) { return p.ovr; }, true));
  var h = '<section class="panel tside"><div class="tside-h" style="--s1:' + (abbr === S.user ? 'var(--tc1)' : deepTeam(c[0])) + ';--s2:' + c[1] + '"><h3>' + title + '</h3><span>' + fmtM(space(abbr)) + ' space</span></div><div class="in"><div class="lbl">In the deal</div>';
  if (!side.players.length && !side.picks.length) h += '<div class="empty">Nothing yet</div>';
  h += side.players.map(function (id) {
    var p = P(id); if (!p) return '';
    return '<div class="tcard tc' + tier(p.ovr) + '">' + avatar(p, 54, { s: 28 }) + '<div class="pc-main"><div class="pc-name' + nameCls(p.name) + '">' + nameHtml(p.name) + '</div><div class="pc-meta"><b>' + p.pos + '</b>' + (p.num != null ? ' · #' + p.num : '') + ' · ' + p.age + ' yrs · ' + potInfo(p).trait + '</div></div>' +
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
    return '<button class="prow' + (on ? ' on' : '') + '" data-act="trade-toggle" data-side="' + key + '" data-kind="players" data-id="' + p.id + '" aria-pressed="' + on + '">' + avatar(p, 34, { shield: false }) + shield(p.ovr, 28) + '<span class="nm">' + esc(p.name) + '<small>' + p.pos + ' · ' + p.age + '</small></span><span class="hit">' + fmtM(Cap.tradeCost(p, S.year, post).newHit) + '</span><span class="add">' + (on ? '✓' : '+') + '</span></button>';
  }).join('') + '</div></div></section>';
  return h;
}

// ---------- Draft ----------
VIEWS.draft = function () {
  if (!S.draft) return movesHead('draft', 'The draft happens after free agency.');
  var k = currentPick(), onClock = k && k.owner === S.user, pool = draftPool();
  if (UI.draftPos !== 'ALL') pool = pool.filter(function (p) { return p.pos === UI.draftPos; });
  var mine = picksOf(S.user).filter(function (x) { return x.year === S.year; });
  var made = S.draft.made.filter(function (m) { return m.team === S.user; });
  var h = movesHead('draft', S.year + ' draft · rookie contracts follow the slotted wage scale', k ? kebab('draft', [['Auto-draft the rest', 'draft-auto', null, '', 'The AI makes your remaining picks']], true) : '');
  h += '<div class="clock"><section class="panel hero">' + (k ? '<div class="big">#' + k.no + '<small>round ' + k.round + '</small></div><div class="kick">' + (onClock ? 'You are on the clock' : 'On the clock') + '</div><h3>' + esc(TEAM[k.owner].name) + '</h3>' : '<div class="kick">Draft complete</div><h3>All picks made</h3>') +
    '<p>' + (k ? 'Your picks: ' + (mine.map(function (x) { return '#' + x.no; }).join(', ') || 'none left') + '. ' + (onClock ? 'Choose from the board below.' : 'Continue sims to your next pick.') : 'Continue runs final cuts to ' + ROSTER_MAX + ' for every team and starts week 1.') + '</p></section>';
  h += '<section class="panel pad"><h3 class="ttl" style="margin-bottom:10px">' + (made.length ? 'Your class' : 'Recent picks') + '</h3>' + (made.length ? made.map(function (m) { var p = P(m.id); return p ? mini(p, '<div class="val">#' + m.no + '<small>round ' + m.round + '</small></div>') : ''; }).join('') :
    '<ul class="newsl">' + (S.draft.made.slice(-7).reverse().map(function (m) { var p = P(m.id); return '<li>#' + m.no + ' ' + teamLink(m.team) + ' ' + (p ? p.pos + ' ' + esc(p.name) : '') + '</li>'; }).join('') || '<li class="muted">No picks yet.</li>') + '</ul>') + '</section></div>';
  if (S.year === BASE.startYear && BASE.draftOrder) h += '<p class="note">Draft order: real ' + (S.year - 1) + ' results' + (BASE.draftOrderFinal ? ' (final).' : ' as of ' + BASE.draftOrderGames + ' of 272 games, provisional until the data is refreshed after the season.') + ' Traded and compensatory picks aren\'t included.</p>';
  if (!k) return h;
  return h + posChips('draftPos') + '<div class="cards">' + pool.slice(0, 80).map(function (p, i) {
    return pcard(p, { rank: i + 1, meta: esc(p.college || ''), right: '<b>' + Math.round(p.grade) + '</b><span>grade</span>' + (onClock ? '<button class="btn acc sm" data-act="draft-pick" data-id="' + p.id + '">Draft</button>' : '') });
  }).join('') + '</div>';
};
