// League state, rosters, depth charts, transactions, AI front offices.
var S = null;          // the save
var BASE = null;       // data.json meta

var PHASES = ['resign', 'fa', 'draft', 'preseason', 'season', 'playoffs'];
var PHASE_LABEL = { resign: 'Re-sign window', fa: 'Free agency', draft: 'Draft', preseason: 'Preseason cutdown',
                    season: 'Regular season', playoffs: 'Playoffs' };
var ROSTER_MAX_OFF = 90, ROSTER_MAX = 53, FA_DAYS = 6, TRADE_DEADLINE_WEEK = 9;

// seed: pass a number to make the whole league reproducible (same seed + same choices = same results)
function newGame(data, userAbbr, seed) {
  BASE = data.meta;
  Market.setCurve(BASE.curve); Market.setScale(1);
  S = { v: 1, seed: seed != null && seed !== '' && !isNaN(+seed) ? (+seed | 0) : (Date.now() % 1e9) | 0, fixedSeed: seed != null && seed !== '' && !isNaN(+seed), year: data.meta.startYear, phase: 'resign', faDay: 0, week: 0,
        user: userAbbr, teams: {}, picks: [], players: [], schedule: [], news: [], playoffs: null, history: [],
        draft: null, nextId: 1, june1: {}, lastOrder: null, awards: [] };
  RNG.s = S.seed;
  TEAMS.forEach(function (t) {
    S.teams[t.abbr] = { abbr: t.abbr, capBase: {}, dead: {}, rollover: {}, rec: newRec(), depth: {} };
  });
  data.players.forEach(function (src) {
    var p = JSON.parse(JSON.stringify(src));
    p.inj = 0; p.s = {}; p.car = {}; p.rej = 0;
    p.rights = p.team ? null : p.prevTeam;   // own team can re-sign expiring players in the re-sign window
    if (p.team && !TEAM[p.team]) p.team = null;
    S.players.push(p);
  });
  for (var y = S.year; y < S.year + 3; y++) addPicks(y);
  // starting number of 80+ players per position: draft class strength steers back toward it
  S.target80 = {}; S.classBoost = {};
  S.targetPipe = {};
  POSITIONS.forEach(function (pos) {
    S.target80[pos] = S.players.filter(function (p) { return p.pos === pos && p.ovr >= 80; }).length;
    S.targetPipe[pos] = S.players.filter(function (p) { return p.pos === pos && Market.projOvr(p, 2) >= 80; }).length;
  });
  // pay level: veterans' fair salaries ~88% of the league's cap (rookie deals and minimums fill the rest)
  S.payScale = 1;   // pay multiplier retired: market value + the fitted salary curve set prices
  TEAMS.forEach(function (t) { autoDepth(t.abbr); });
  news('Welcome to the ' + TEAM[userAbbr].name + '. The ' + S.year + ' league year has started: re-sign your expiring players before free agency opens.');
  return S;
}

function newRec() { return { w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, cw: 0, cl: 0 }; }
function addPicks(year) {
  TEAMS.forEach(function (t) {
    for (var r = 1; r <= 7; r++) S.picks.push({ id: year + '-' + r + '-' + t.abbr, year: year, round: r, orig: t.abbr, owner: t.abbr, no: null });
  });
}
function news(msg, team) { S.news.unshift({ y: S.year, ph: S.phase, w: S.week, msg: msg, team: team || null }); if (S.news.length > 300) S.news.length = 300; }

// ---------- lookups ----------
function P(id) { return S._idx ? S._idx[id] : S.players.filter(function (p) { return p.id === id; })[0]; }
function reindex() { S._idx = {}; S.players.forEach(function (p) { S._idx[p.id] = p; }); }
function roster(abbr) { return S.players.filter(function (p) { return p.team === abbr; }); }
function freeAgents() { return S.players.filter(function (p) { return !p.team && !p.retired && !p.prospect; }); }
function capOf(year) { return Cap.leagueCap(BASE.cap, BASE.startYear, year); }
// The money actually available: league cap plus the average rollover. Player prices follow this.
function marketCap() {
  var y = S.year, roll = 0;
  TEAMS.forEach(function (t) { roll += (S.teams[t.abbr].rollover || {})[y] || 0; });
  return capOf(y) + roll / 32;
}
function T(abbr) {
  var t = S.teams[abbr];
  for (var y = S.year; y < S.year + 6; y++) if (t.capBase[y] == null) t.capBase[y] = capOf(y);
  return t;
}
// Top-51 rule applies from the start of the league year until week 1, and to future-year projections.
function top51(year) { return (year || S.year) > S.year || S.phase === 'resign' || S.phase === 'fa' || S.phase === 'draft' || S.phase === 'preseason'; }
function space(abbr, year) { var y = year || S.year; return Cap.capSpace(S.players, T(abbr), y, top51(y)); }
function fullSpace(abbr, year) { return Cap.capSpace(S.players, T(abbr), year || S.year, false); }
function committed(abbr, year) { var y = year || S.year; return Cap.teamCommitted(S.players, T(abbr), y, top51(y)); }

// ---------- fifth-year option ----------
function optTableFor(year) {
  if (S.optTables && S.optTables[year]) return S.optTables[year];
  // first league year: prior year's real cap numbers from the data; tag tiers move with the cap
  var t = BASE.optTable, sc = 1 + 0.07, out = {};   // tag tiers: prior-year numbers grown with the cap
  Object.keys(t).forEach(function (g) { out[g] = [Math.round(t[g][0] * sc), Math.round(t[g][1] * sc), t[g][2], t[g][3]]; });
  return out;
}
function fifthYearInfo(p) {
  if (!Cap.fifthYearEligible(p, S.year)) return null;
  var tier = Cap.fifthYearTier(p), amt = Cap.fifthYearAmount(p, optTableFor(S.year), BASE.optGroup[p.pos]);
  return { tier: tier, label: Cap.TIER_LABEL[tier], amount: amt, year: S.year + 1, open: S.phase === 'resign' || S.phase === 'fa' || S.phase === 'draft' };
}
function decideFifthYear(p, exercise) {
  var info = fifthYearInfo(p);
  if (!info || !info.open) return { ok: false, msg: 'The option window is closed.' };
  if (exercise) {
    Cap.exerciseFifthYear(p, S.year, info.amount);
    news(TEAM[p.team].name + ' exercised the ' + info.year + ' fifth-year option on ' + p.pos + ' ' + p.name + ': ' + fmtM(info.amount) + ', fully guaranteed.', p.team);
  } else {
    p.fifth = 'declined';
    news(TEAM[p.team].name + ' declined the fifth-year option on ' + p.pos + ' ' + p.name + '; he can be a free agent after ' + S.year + '.', p.team);
  }
  return { ok: true };
}
function pendingOptions(abbr) { return roster(abbr).filter(function (p) { var i = fifthYearInfo(p); return i && i.open; }); }
// AI: pick up the option when the guaranteed amount is no more than he'd be worth next year (with some
// slack for stars, whom teams lock in).
function aiFifthYearDecisions() {
  aiTeams().forEach(function (abbr) {
    pendingOptions(abbr).forEach(function (p) {
      var info = fifthYearInfo(p);
      var worth = Market.valueAt(p.pos, Market.projOvr(p, 1), marketCap() * 1.07, p.exp + 1, S.year + 1);
      decideFifthYear(p, info.amount <= worth * (p.ovr >= 80 ? 1.9 : p.ovr >= 72 ? 1.5 : 1.15));
    });
  });
}
function isPostJune() { return S.phase === 'preseason' || S.phase === 'season' || S.phase === 'playoffs'; }
function rosterMax() { return S.phase === 'season' || S.phase === 'playoffs' ? ROSTER_MAX : ROSTER_MAX_OFF; }
function picksOf(abbr) { return S.picks.filter(function (k) { return k.owner === abbr; }).sort(byKey(function (k) { return k.year * 100 + k.round; })); }
function pickLabel(k) { return k.year + ' R' + k.round + (k.no ? ' #' + k.no : '') + (k.orig !== k.owner ? ' (' + k.orig + ')' : ''); }

// ---------- depth chart and team strength ----------
function healthy(p) { return !p.inj; }
function autoDepth(abbr) {
  var t = S.teams[abbr], ros = roster(abbr);
  POSITIONS.forEach(function (pos) {
    var at = ros.filter(function (p) { return p.pos === pos; });
    var keep = (abbr === S.user && t.depth[pos]) ? t.depth[pos].filter(function (id) { return at.some(function (p) { return p.id === id; }); }) : [];
    var rest = at.filter(function (p) { return keep.indexOf(p.id) < 0; }).sort(byKey(function (p) { return p.ovr; }, true));
    t.depth[pos] = keep.concat(rest.map(function (p) { return p.id; }));
  });
}
function starters(abbr, pos) {
  var ids = (S.teams[abbr].depth[pos] || []);
  var out = [];
  for (var i = 0; i < ids.length && out.length < Market.STARTERS[pos]; i++) { var p = P(ids[i]); if (p && p.team === abbr && healthy(p)) out.push(p); }
  return out;
}
var OFF = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL'], DEF = ['EDGE', 'DL', 'LB', 'CB', 'S'], ST = ['K', 'P'];
function unitRating(abbr, list) {
  var num = 0, den = 0;
  list.forEach(function (pos) {
    var st = starters(abbr, pos), n = Market.STARTERS[pos], w = Market.POS_WEIGHT[pos];
    for (var i = 0; i < n; i++) { num += w * (st[i] ? st[i].ovr : 35); den += w; }
  });
  return den ? num / den : 50;
}
function teamRating(abbr) {
  var o = unitRating(abbr, OFF), d = unitRating(abbr, DEF), s = unitRating(abbr, ST);
  return { off: Math.round(o), def: Math.round(d), st: Math.round(s), ovr: Math.round(o * 0.52 + d * 0.43 + s * 0.05) };
}

// ---------- needs ----------
function needAt(abbr, pos, extra) {
  // how much a player of rating `extra` would lift this position group (0 if not)
  var st = starters(abbr, pos), n = Market.STARTERS[pos];
  var worst = st.length < n ? 35 : Math.min.apply(null, st.map(function (p) { return p.ovr; }));
  return Math.max(0, (extra == null ? 80 : extra) - worst);
}
function teamNeeds(abbr) {
  return POSITIONS.filter(function (pos) { return pos !== 'LS'; }).map(function (pos) { return { pos: pos, gap: needAt(abbr, pos, 80) * Market.POS_WEIGHT[pos] }; })
    .filter(function (n) { return n.gap > 4; }).sort(byKey(function (n) { return n.gap; }, true));
}

// ---------- transactions ----------
function validateCap(abbr, delta) { return space(abbr) + delta >= 0; }

function releasePreview(p, june1) {
  var post = isPostJune() || !!june1;
  var c = Cap.releaseCost(p, S.year, post);
  return { post: post, dead: c.dead, savings: c.savings, now: c.dead[S.year] || 0, next: c.dead[S.year + 1] || 0 };
}
function canJune1(abbr) { return !isPostJune() && ((S.june1[S.year + abbr] || 0) < 2); }

function release(p, june1) {
  var abbr = p.team, pv = releasePreview(p, june1);
  if (!validateCap(abbr, pv.savings)) return { ok: false, msg: 'Releasing him would put you over the cap (savings ' + fmtM(pv.savings) + ').' };
  if (june1 && !isPostJune()) {
    if (!canJune1(abbr)) return { ok: false, msg: 'Teams get two post-June 1 designations a year.' };
    S.june1[S.year + abbr] = (S.june1[S.year + abbr] || 0) + 1;
  }
  Cap.applyDead(T(abbr), pv.dead);
  p.team = null; p.years = []; p.options = []; p.rights = null; p.rej = 0; p.cutBy = abbr;
  autoDepth(abbr);
  news(TEAM[abbr].name + ' released ' + p.pos + ' ' + p.name + (pv.post ? ' (post-June 1)' : '') + ': ' + fmtM(pv.now) + ' dead' + (pv.next ? ' now, ' + fmtM(pv.next) + ' next year' : '') + '.', abbr);
  return { ok: true };
}

function sign(p, abbr, offer, silent) {
  if (roster(abbr).length >= rosterMax()) return { ok: false, msg: 'Roster is full (' + rosterMax() + ').' };
  var yrs = Cap.buildContract(offer, S.year, p.exp);
  if (!validateCap(abbr, -yrs[0].cap)) return { ok: false, msg: 'Not enough cap space: first-year hit is ' + fmtM(yrs[0].cap) + ', you have ' + fmtM(space(abbr)) + '.' };
  var wasRights = p.rights;
  // AI teams with lots of room front-load new deals (pay more now, less later) instead of banking it
  if (abbr !== S.user || S.autopilot) {
    var excess = space(abbr) - yrs[0].cap - 25000;
    if (excess > 0 && yrs.length > 1) Cap.prepay({ years: yrs }, S.year, Math.round(excess * 0.35), p.exp);
  }
  p.team = abbr; p.years = yrs; p.options = []; p.rights = null; p.rej = 0; p.signed = S.year; p.apy = Cap.apy(yrs);
  p.gtdTotal = Math.max(offer.gtd || 0, offer.bonus || 0);
  autoDepth(abbr);
  if (!silent || abbr === S.user || p.ovr >= 80)
    news(TEAM[abbr].name + (wasRights === abbr ? ' re-signed ' : ' signed ') + p.pos + ' ' + p.name + ': ' + offer.years + ' yr, ' + fmtM(offer.total) + ' (' + fmtM(p.gtdTotal) + ' gtd).', abbr);
  return { ok: true };
}

function extensionStart() { return isPostJune() ? S.year + 1 : S.year; }
function buildExtensionYears(p, offer) {
  var start = extensionStart();
  var before = p.years.filter(function (r) { return r.y < start; });
  return before.concat(Cap.buildExtension(p, offer, start));
}
function extend(p, offer) {
  var yrs = buildExtensionYears(p, offer);
  var delta = Cap.capHit(p, S.year) - (Cap.row({ years: yrs }, S.year) || { cap: 0 }).cap;
  if (!validateCap(p.team, delta)) return { ok: false, msg: 'The new deal does not fit under this year\'s cap.' };
  p.years = yrs; p.options = (p.options || []).filter(function (o) { return o.y < extensionStart(); });
  p.apy = Cap.apy(yrs.filter(function (r) { return r.y >= extensionStart(); })); p.signed = S.year; p.rej = 0;
  p.gtdTotal = Math.max(offer.gtd || 0, offer.bonus || 0);
  news(TEAM[p.team].name + ' extended ' + p.pos + ' ' + p.name + ': ' + offer.years + ' yr, ' + fmtM(offer.total) + '.', p.team);
  return { ok: true };
}
function canExtend(p) { return p.team && Cap.yearsLeft(p, S.year) <= 2 && S.phase !== 'playoffs'; }

// offer context for Market.evaluate
function offerCtx(p, abbr) {
  return { cap: marketCap(), year: S.year, teamOvr: teamRating(abbr).ovr, isOwnTeam: p.team === abbr || p.rights === abbr,
           rejections: p.rej || 0, fa: S.phase === 'fa' || S.phase === 'draft' || S.phase === 'preseason' || S.phase === 'season',
           daysIntoFA: S.phase === 'fa' ? S.faDay : S.phase === 'resign' ? 0 : FA_DAYS + 2 };
}

// ---------- trades ----------
// side = {players:[ids], picks:[ids]}
function tradeCapDelta(abbr, out, inc) {
  var post = isPostJune(), d = 0;
  out.forEach(function (p) { d += Cap.tradeCost(p, S.year, post).oldSavings; });
  inc.forEach(function (p) { d -= Cap.tradeCost(p, S.year, post).newHit; });
  return d;
}
function assetValue(viewer, players, picks) {
  var reb = teamRating(viewer).ovr < 70;
  var v = { rebuilding: reb };
  return sumBy(players, function (p) { return Market.playerTradeValue(p, S.year, marketCap(), v); }) +
         sumBy(picks, function (k) { return Market.pickValue(k, S.year, v); });
}
function aiTradeEval(ai, aiGets, aiGives) {
  var gp = aiGets.players.map(P), gk = aiGets.picks.map(function (id) { return S.picks.filter(function (k) { return k.id === id; })[0]; });
  var op = aiGives.players.map(P), ok_ = aiGives.picks.map(function (id) { return S.picks.filter(function (k) { return k.id === id; })[0]; });
  var get = 0, give = 0;
  gp.forEach(function (p) {
    var v = assetValue(ai, [p], []);
    var lift = needAt(ai, p.pos, p.ovr);
    v = v >= 0 ? v * (lift > 5 ? 1.2 : lift > 0 ? 1.0 : 0.75) : v;  // they want players who start for them
    get += v;
  });
  gk.forEach(function (k) { get += assetValue(ai, [], [k]); });
  op.forEach(function (p) {
    var v = assetValue(ai, [p], []);
    var st = starters(ai, p.pos).some(function (s) { return s.id === p.id; });
    give += v > 0 ? v * (st ? 1.15 : 1.0) : v * 0.9;
  });
  ok_.forEach(function (k) { give += assetValue(ai, [], [k]); });
  var margin = 1500 + Math.abs(give) * 0.06;   // AI wants to win the trade a little
  var need = give + margin;
  var ratio = need <= 0 ? (get >= need ? 1.2 : 0.5) : get / need;
  var msg = '';
  var capAI = tradeCapDelta(ai, op, gp), capU = tradeCapDelta(S.user, gp, op);
  var rosAI = roster(ai).length - op.length + gp.length, rosU = roster(S.user).length - gp.length + op.length;
  var feasible = true;
  if (space(ai) + capAI < 0) { feasible = false; msg = TEAM[ai].abbr + ' can\'t fit the incoming salary (' + fmtM(space(ai) + capAI) + ' after).'; }
  else if (space(S.user) + capU < 0) { feasible = false; msg = 'You can\'t fit the incoming salary (' + fmtM(space(S.user) + capU) + ' after).'; }
  else if (rosAI > rosterMax() || rosU > rosterMax()) { feasible = false; msg = 'Roster limit (' + rosterMax() + ') exceeded.'; }
  else if (S.phase === 'season' && S.week > TRADE_DEADLINE_WEEK) { feasible = false; msg = 'The trade deadline has passed.'; }
  else if (!gp.length && !gk.length && !op.length && !ok_.length) feasible = false;
  return { get: get, give: give, ratio: ratio, accept: feasible && get >= need, feasible: feasible, msg: msg,
           capAI: capAI, capUser: capU, short: Math.max(0, need - get) };
}
function executeTrade(ai, userGives, aiGives) {
  var post = isPostJune();
  function move(ids, from, to) {
    ids.forEach(function (id) {
      var p = P(id), tc = Cap.tradeCost(p, S.year, post);
      Cap.applyDead(T(from), tc.dead);
      p.years = tc.newYears; p.team = to; p.rej = 0;
    });
  }
  move(userGives.players, S.user, ai); move(aiGives.players, ai, S.user);
  userGives.picks.forEach(function (id) { S.picks.filter(function (k) { return k.id === id; })[0].owner = ai; });
  aiGives.picks.forEach(function (id) { S.picks.filter(function (k) { return k.id === id; })[0].owner = S.user; });
  autoDepth(ai); autoDepth(S.user);
  var d = function (side) { return side.players.map(function (id) { var p = P(id); return p.pos + ' ' + p.name; }).concat(side.picks.map(function (id) { return pickLabel(S.picks.filter(function (k) { return k.id === id; })[0]); })).join(', '); };
  news('Trade: ' + S.user + ' sends ' + d(userGives) + ' to ' + ai + ' for ' + d(aiGives) + '.', S.user);
}
// Suggest what the AI wants added to make a trade work: cheapest single user asset that covers the gap.
function whatWouldItTake(ai, userGives, aiGives) {
  var ev = aiTradeEval(ai, userGives, aiGives);
  if (ev.accept) return { done: true };
  var cands = [];
  roster(S.user).forEach(function (p) {
    if (userGives.players.indexOf(p.id) >= 0) return;
    var g = { players: userGives.players.concat([p.id]), picks: userGives.picks };
    var e = aiTradeEval(ai, g, aiGives);
    if (e.accept) cands.push({ kind: 'player', id: p.id, label: p.pos + ' ' + p.name + ' (' + p.ovr + ')', cost: assetValue(S.user, [p], []) });
  });
  picksOf(S.user).forEach(function (k) {
    if (userGives.picks.indexOf(k.id) >= 0) return;
    var g = { players: userGives.players, picks: userGives.picks.concat([k.id]) };
    var e = aiTradeEval(ai, g, aiGives);
    if (e.accept) cands.push({ kind: 'pick', id: k.id, label: pickLabel(k), cost: assetValue(S.user, [], [k]) });
  });
  cands.sort(byKey(function (c) { return c.cost; }));
  return { done: false, ev: ev, options: cands.slice(0, 3) };
}

// ---------- AI front offices ----------
function aiOffer(p, abbr, mult) {
  var d = Market.demand(p, marketCap(), S.year);
  var total = Math.round(d.apy * d.years * (mult || 1));
  var gtd = Math.min(total, Math.round(d.gtd * (mult || 1)));
  return { years: d.years, total: total, bonus: Math.round(gtd * 0.5), gtd: gtd };
}
function aiTeams() { return TEAMS.map(function (t) { return t.abbr; }).filter(function (a) { return a !== S.user || S.autopilot; }); }

function restructurePlayer(p, amount) {
  var r = Cap.restructure(p, S.year, amount, p.exp);
  if (r.saved) news(TEAM[p.team].name + ' restructured ' + p.pos + ' ' + p.name + ': ' + fmtM(r.amount) + ' converted to bonus, ' + fmtM(r.saved) + ' cap saved this year.', p.team);
  return r;
}

// AI cap compliance: restructure big contracts first, then cut the worst value-for-money players.
function aiCapFix(abbr, buffer) {
  var guard = 0;
  while (space(abbr) < buffer && guard++ < 40) {
    var ros = roster(abbr);
    var rc = ros.filter(function (p) { return p.age <= 32 && p.ovr >= 70 && Cap.restructureMax(p, S.year, p.exp) > 3000; })
                .sort(byKey(function (p) { return Cap.restructureMax(p, S.year, p.exp); }, true))[0];
    if (rc) { restructurePlayer(rc, Cap.restructureMax(rc, S.year, rc.exp)); continue; }
    var cut = ros.map(function (p) { var pv = releasePreview(p, !isPostJune() && canJune1(abbr) && Cap.capHit(p, S.year) > 15000); return { p: p, pv: pv, s: pv.savings / 1000 - Math.max(0, p.ovr - 60) * 0.5 }; })
                 .filter(function (x) { return x.pv.savings > 500; })
                 // keep good young players unless there's no other way to get compliant
                 .sort(byKey(function (x) { return x.s - (x.p.ovr >= 80 && x.p.age < 30 ? 1000 : 0); }, true))[0];
    if (!cut) break;
    release(cut.p, cut.pv.post && !isPostJune());
  }
}

// End of re-sign window: AI teams keep the expiring players they want; everyone else hits free agency.
function aiResign() {
  aiTeams().forEach(function (abbr) {
    aiCapFix(abbr, 25000);
    var mine = S.players.filter(function (p) { return !p.team && p.rights === abbr; }).sort(byKey(function (p) { return p.ovr; }, true));
    mine.forEach(function (p) {
      var want = p.ovr >= 62 && p.age <= 32 && (needAt(abbr, p.pos, p.ovr) > 0 || p.ovr >= 74);
      if (!want || RNG.next() > (p.ovr >= 75 ? 0.92 : 0.75)) return;
      var off = aiOffer(p, abbr, 1.0);
      if (space(abbr) - Cap.buildContract(off, S.year, p.exp)[0].cap > 8000) sign(p, abbr, off, true);
    });
  });
  S.players.forEach(function (p) { if (!p.team) p.rights = null; });
}

// One day of free agency: AI teams sign the best fits they can afford.
function aiFreeAgencyDay() {
  var order = RNG.shuffle(aiTeams());
  var pool = freeAgents().sort(byKey(function (p) { return p.ovr; }, true));
  var rookieRoom = S.phase === 'fa' || S.phase === 'resign' ? 14000 : 3000;   // keep room for rookies
  for (var round = 0; round < 4; round++) {
    order.forEach(function (abbr) {
      if (roster(abbr).length >= rosterMax() - 2) return;
      var sp = space(abbr);
      // teams keep ~$8M of room through the first days of free agency, then spend down further
      var target = (S.phase === 'fa' && S.faDay < 3 ? 8000 : 3000) + rookieRoom;
      var disc = 1 - Market.faDiscount(S.faDay);
      if (sp <= target) return;
      var best = null, bestScore = 0;
      for (var i = 0; i < pool.length && i < 300; i++) {
        var p = pool[i];
        if (p.team) continue;
        var lift = needAt(abbr, p.pos, p.ovr) * Market.POS_WEIGHT[p.pos];
        var depth = sp > capOf(S.year) * 0.15 ? Math.max(0, p.ovr - 68) * 0.25 : 0;   // rich teams buy depth too
        if (lift + depth <= 0) continue;
        var cost = Market.demand(p, marketCap(), S.year).apy * disc;
        if (sp - cost > target - 2000) {
          var score = (lift + depth) / Math.pow(cost / 1000 + 1, 0.35) * (0.85 + RNG.next() * 0.3);
          if (score > bestScore) { best = p; bestScore = score; }
        }
      }
      if (best) {
        var mult = (0.95 + RNG.next() * 0.12) * disc;
        var off = aiOffer(best, abbr, mult);
        var ev = Market.evaluate(best, off, offerCtx(best, abbr));
        if (!ev.accept && ev.mood < 0.95) off = aiOffer(best, abbr, mult + 0.08);
        sign(best, abbr, off, true);
      }
    });
  }
}

// Late market (preseason): good players still unsigned take one-year "prove-it" deals for whatever room
// a team has, as long as it reaches about a third of their ask. Teams with the most room go first.
// room that will still be there at week 1, when every contract counts (not just the top 51)
function lateRoom(a) { return Math.min(space(a), fullSpace(a)) - 1500; }
function aiLateMarket() {
  freeAgents().filter(function (p) { return p.ovr >= 78; }).sort(byKey(function (p) { return p.ovr - (p.age >= 30 ? 10 : 0); }, true)).forEach(function (p) {
    var ask = Market.demand(p, marketCap(), S.year).apy, floor = Math.max(Cap.minSalary(p.exp, S.year), Math.round(ask * 0.35));
    var teams = aiTeams().filter(function (a) { return a !== S.user && roster(a).length < rosterMax(); })
      .map(function (a) { return { a: a, room: lateRoom(a) }; }).filter(function (t) { return t.room >= floor; })
      .sort(byKey(function (t) { return t.room + (needAt(t.a, p.pos, p.ovr) > 0 ? 20000 : 0); }, true));
    if (!teams.length) {
      // nobody has the room: the team that needs him most makes room (restructures, then cuts lesser players)
      var needy = aiTeams().filter(function (a) { return a !== S.user && roster(a).length < rosterMax(); })
        .sort(byKey(function (a) { return needAt(a, p.pos, p.ovr) * 1000 + space(a) / 1000; }, true))[0];
      if (!needy) return;
      aiCapFix(needy, floor + 1500 + Math.max(0, space(needy) - fullSpace(needy)));
      if (lateRoom(needy) < floor) return;
      teams = [{ a: needy, room: lateRoom(needy) }];
    }
    var price = Math.min(ask, teams[0].room);
    sign(p, teams[0].a, { years: 1, total: price, bonus: 0, gtd: Math.round(price * 0.5) }, true);
  });
}

// Fill thin rosters with the best veterans they can afford late in the market (asks drop to ~70%),
// or generated depth players if the pool runs dry.
// One source of truth for how open roster spots are filled and priced. Auto-fill uses it to sign players,
// and the room-needed figures use it to estimate, so warnings match what auto-fill actually does.
var FILLER_PRICE_EXP = 0;            // generated depth players are undrafted rookies at the rookie minimum
function fillNeedPos(counts) {
  return POSITIONS.map(function (pos) { return { pos: pos, short: depthTarget(pos) - (counts[pos] || 0) }; })
    .sort(byKey(function (n) { return n.short; }, true))[0].pos;
}
// Best free agent at `pos` affordable on `budget` (late-market asks drop to ~60%), else null (a generated
// depth player at the minimum). `taken` = ids already planned.
// frugal: only players who'd sign for their league minimum (or a generated depth player).
function fillChoice(pos, budget, taken, frugal) {
  var cands = freeAgents().filter(function (p) { return p.pos === pos && !(taken && taken[p.id]); }).sort(byKey(function (p) { return p.ovr; }, true));
  if (frugal) {   // cheapest player who signs for his minimum (undrafted rookies first), best rating among ties
    var best = null;
    cands.forEach(function (c) {
      var min = Cap.minSalary(c.exp, S.year), pr = Math.max(min, Math.round(Market.demand(c, marketCap(), S.year).apy * 0.6));
      if (pr <= min && (!best || pr < best.price)) best = { p: c, price: pr };
    });
    var fill = Cap.minSalary(FILLER_PRICE_EXP, S.year);
    return best && best.price <= fill ? best : { p: null, price: fill };   // never pay more than an undrafted rookie
  }
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i], min = Cap.minSalary(c.exp, S.year);
    var pr = Math.max(min, Math.round(Market.demand(c, marketCap(), S.year).apy * 0.6));
    if (frugal ? pr <= min : pr <= Math.max(min * 1.3, budget)) return { p: c, price: pr };
  }
  return { p: null, price: Cap.minSalary(FILLER_PRICE_EXP, S.year) };
}
function fillBudget(room, slotsLeft) { return (room - slotsLeft * 1100) / Math.max(2, slotsLeft / 3); }
// Plan `slots` signings for `abbr` starting from `room` of cap space, without signing anyone.
// extraPos: position of a player about to be added (counts toward depth needs).
// frugal: fill every spot the cheapest way (minimum-ish players only), i.e. the least it can cost.
function planFill(abbr, slots, room, extraPos, frugal) {
  var counts = {}, taken = {}, cost = 0;
  roster(abbr).forEach(function (p) { counts[p.pos] = (counts[p.pos] || 0) + 1; });
  if (extraPos) counts[extraPos] = (counts[extraPos] || 0) + 1;
  for (var n = slots; n > 0; n--) {
    var pos = fillNeedPos(counts), ch = fillChoice(pos, fillBudget(room, n), taken, frugal);
    if (ch.p) taken[ch.p.id] = true;
    counts[pos] = (counts[pos] || 0) + 1; cost += ch.price; room -= ch.price;
  }
  return cost;
}

function aiFillRoster(target, teams) {
  (teams || aiTeams()).forEach(function (abbr) {
    var need = (target - roster(abbr).length) * 1100;
    if (need > 0 && (abbr !== S.user || S.autopilot)) aiCapFix(abbr, need);
    var guard = 0, slots = target - roster(abbr).length;
    // if the normal plan doesn't fit the room, fill frugally (minimum-ish players) so as many spots as
    // possible get filled
    var avail = abbr === S.user && !S.autopilot ? Math.min(space(abbr), fullSpace(abbr)) : space(abbr);
    var frugal = slots > 0 && planFill(abbr, slots, avail) > avail;
    while (roster(abbr).length < target && guard++ < 80) {
      var counts = {};
      roster(abbr).forEach(function (p) { counts[p.pos] = (counts[p.pos] || 0) + 1; });
      var pos = fillNeedPos(counts);
      var ch = fillChoice(pos, fillBudget(space(abbr), target - roster(abbr).length), null, frugal);
      var p = ch.p, price = ch.price;
      var fillPrice = Cap.minSalary(FILLER_PRICE_EXP, S.year);
      // the user's auto-fill must still fit at week 1, when every contract counts (not just the top 51);
      // if the first choice doesn't fit, fall back to an undrafted rookie at the minimum
      var userRoom = abbr === S.user && !S.autopilot ? fullSpace(abbr) : Infinity;
      if (p && price > userRoom) p = null;
      if (!p) { if (fillPrice > userRoom) break; p = makeFiller(pos); price = fillPrice; }
      var r = sign(p, abbr, { years: 1, total: price, bonus: 0, gtd: 0 }, true);
      if (!r.ok) break;
    }
  });
}

// AI teams with lots of room pre-pay future salary so unused space doesn't pile up via rollover.
function aiPrepay(keep) {
  aiTeams().forEach(function (abbr) {
    var excess = space(abbr) - keep;
    if (excess <= 0) return;
    roster(abbr).filter(function (p) { return Cap.yearsLeft(p, S.year) >= 2; })
      .sort(byKey(function (p) { return Cap.capHit(p, S.year + 1); }, true))
      .forEach(function (p) { if (excess > 0) excess -= Cap.prepay(p, S.year, excess, p.exp); });
  });
}

// AI extends good players entering the last year of their deal (keeps cores together, uses cap).
function aiExtensions() {
  aiTeams().forEach(function (abbr) {
    var rich = space(abbr) > capOf(S.year) * 0.08;
    roster(abbr).filter(function (p) { return Cap.yearsLeft(p, S.year) <= (rich ? 2 : 1) && p.ovr >= (rich ? 70 : 75) && p.age <= 30; }).forEach(function (p) {
      if (!rich && RNG.next() < 0.5) return;
      var off = aiOffer(p, abbr, 1.02);
      var yrs = buildExtensionYears(p, off);
      var delta = Cap.capHit(p, S.year) - (Cap.row({ years: yrs }, S.year) || { cap: 0 }).cap;
      if (space(abbr) + delta > 10000 && Market.evaluate(p, off, offerCtx(p, abbr)).accept) extend(p, off);
    });
  });
}

var DEPTH_TARGET = { QB: 3, RB: 4, WR: 6, TE: 3, OT: 4, IOL: 5, EDGE: 5, DL: 5, LB: 5, CB: 6, S: 4, K: 1, P: 1, LS: 1 };
function depthTarget(pos) { return DEPTH_TARGET[pos]; }

// Cut down to 53: drop the least useful players, avoiding big dead money.
function cutdown(abbr) {
  var guard = 0;
  while (roster(abbr).length > ROSTER_MAX && guard++ < 100) {
    var ros = roster(abbr);
    var scored = ros.map(function (p) {
      var cnt = ros.filter(function (q) { return q.pos === p.pos && q.ovr > p.ovr; }).length;
      var surplus = cnt - depthTarget(p.pos) + 1;
      var pv = releasePreview(p, false);
      return { p: p, s: p.ovr - Math.max(0, surplus) * 6 + pv.now / 1000 * 1.5 + (p.age <= 23 ? 4 : 0), ok: space(abbr) + pv.savings >= 0 };
    }).filter(function (x) { return x.ok; }).sort(byKey(function (x) { return x.s; }));
    if (!scored.length) break;
    release(scored[0].p, false);
  }
}

var FIRST = ['James', 'Marcus', 'Tyler', 'Jalen', 'Darius', 'Caleb', 'Malik', 'Jordan', 'Isaiah', 'Trey', 'Devin', 'Cole', 'Brandon', 'Xavier', 'Elijah', 'Noah', 'Mason', 'Logan', 'Jaylen', 'Andre', 'Cam', 'Dante', 'Grant', 'Hunter', 'Kobe', 'Luke', 'Micah', 'Nate', 'Omar', 'Quinn', 'Reggie', 'Shane', 'Tre', 'Wes', 'Zach', 'Bryce', 'Carter', 'DeShawn', 'Emeka', 'Finn', 'Gabe', 'Jace', 'Keenan', 'Lamar', 'Myles', 'Nico', 'Rashad', 'Sam', 'Tavon', 'Victor', 'Ty', 'Aiden', 'Beau', 'Corey', 'Drew', 'Evan', 'Isaac', 'Jake', 'Kyle', 'Miles'];
var LAST = ['Walker', 'Brooks', 'Hayes', 'Coleman', 'Bennett', 'Reed', 'Foster', 'Price', 'Jenkins', 'Barnes', 'Morris', 'Russell', 'Griffin', 'Hughes', 'Sanders', 'Patterson', 'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'West', 'Cole', 'Owens', 'Harrison', 'Gibson', 'Ellis', 'Stephens', 'Tucker', 'Porter', 'Hunter', 'Hicks', 'Crawford', 'Boyd', 'Mason', 'Warren', 'Dixon', 'Ramos', 'Burns', 'Gordon', 'Shaw', 'Holmes', 'Rice', 'Robertson', 'Black', 'Daniels', 'Palmer', 'Mills', 'Nichols', 'Grant', 'Knight', 'Ferguson', 'Rose', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson', 'Spencer', 'Gardner', 'Stevens', 'Tran', 'Okafor', 'Adeyemi', 'Kowalski', 'Lindqvist', 'Moreau', 'Delgado', 'Fitzgerald'];
function fakeName() { return RNG.pick(FIRST) + ' ' + RNG.pick(LAST); }
function makeFiller(pos) {
  var age = RNG.int(22, 24), ovr = RNG.int(44, 55);   // undrafted rookie depth
  var p = { id: 'G' + (S.nextId++), name: fakeName(), pos: pos, opos: pos, age: age, team: null, prevTeam: null,
            exp: 0, draft: [0, 0, 0], apy: 0, signed: S.year, gtdTotal: 0, years: [], options: [], status: 'FA',
            ovr: ovr, pot: ovr + RNG.int(0, 3), sub: {}, inj: 0, s: {}, car: {}, rej: 0, gen: true };
  S.players.push(p); if (S._idx) S._idx[p.id] = p;
  return p;
}

// The user's "auto roster" button: fill thin spots with minimum-salary players, then cut to 53.
// Returns { filled, missing, short, msg }. Says so when the cap stops it short of 53.
function userAutoRoster() {
  var before = roster(S.user).length;
  aiFillRoster(ROSTER_MAX, [S.user]);
  if (S.phase === 'preseason' || S.phase === 'season') cutdown(S.user);
  autoDepth(S.user);
  var n = roster(S.user).length, missing = Math.max(0, ROSTER_MAX - n);
  var short = missing ? rosterFill(S.user).short : 0;
  return { filled: n - before, missing: missing, short: short,
           msg: missing ? 'Couldn\'t fill ' + missing + ' spot' + (missing > 1 ? 's' : '') + ': ' + fmtM(Math.max(short, 1)) + ' short.' : 'Roster filled to ' + n + '.' };
}

// ---------- room needed to fill 53 ----------
function pickNumberEstimate(k) {
  if (k.no) return k.no;
  var ord = S.lastOrder || BASE.draftOrder, i = ord ? ord.indexOf(k.orig) : -1;
  return (k.round - 1) * 32 + (i >= 0 ? i + 1 : 16);
}
function unsignedPicks(abbr) {
  if (!(S.phase === 'resign' || S.phase === 'fa' || S.phase === 'draft')) return [];
  return S.picks.filter(function (k) {
    return k.owner === abbr && k.year === S.year && !(S.draft && S.draft.order.indexOf(k.id) >= 0 && S.draft.order.indexOf(k.id) < S.draft.i);
  }).sort(byKey(pickNumberEstimate));
}
// What it costs to have 53 players at week 1 (when every contract counts): unsigned draft picks at their
// slotted first-year cap hit plus the remaining open spots at the minimum. `extraSigned` = players about
// to be added (e.g. the free agent in an offer); `extraHit` = their first-year cap hit.
function rosterFill(abbr, extraSigned, extraHit, extraPos) {
  var have = roster(abbr).length + (extraSigned || 0), spots = Math.max(0, ROSTER_MAX - have);
  var picks = unsignedPicks(abbr).slice(0, spots);
  var pickCost = sumBy(picks, function (k) {
    return Cap.buildContract(Cap.rookieDeal(pickNumberEstimate(k), S.year, capOf(S.year)), S.year, 0)[0].cap;
  });
  var open = spots - picks.length;
  var room = fullSpace(abbr) - (extraHit || 0);
  // open spots at the least auto-fill can fill them for (the same choices it makes when money is tight).
  // Before the draft is over, undrafted rookies at the rookie minimum will be the cheapest fill.
  var preDraft = S.phase === 'resign' || S.phase === 'fa' || S.phase === 'draft';
  var minCost = !open ? 0 : preDraft ? open * Cap.minSalary(0, S.year) : planFill(abbr, open, room - pickCost, extraPos, true);
  var need = pickCost + minCost;
  return { have: have, spots: spots, picks: picks.length, pickCost: pickCost, open: open, minCost: minCost, need: need, room: room, short: Math.max(0, need - room) };
}
// Best ways to make room: biggest restructure savings, and cuts that free the most for the least talent.
function makeRoomOptions(abbr) {
  var ros = roster(abbr);
  var rs = ros.map(function (p) { var m = Cap.restructureMax(p, S.year, p.exp), n = Math.min(5, Cap.remaining(p, S.year).length); return { p: p, saves: m - Math.floor(m / Math.max(1, n)) }; })
    .filter(function (x) { return x.saves > 500; }).sort(byKey(function (x) { return x.saves; }, true)).slice(0, 3);
  // cuts: a cut opens a spot that must be refilled at the minimum, so what matters is NET room (savings
  // minus that replacement). Never players rated 80+; cuts netting under $250K hidden; backups by net room,
  // then starters by net room.
  var repl = Cap.minSalary(FILLER_PRICE_EXP, S.year);
  var cuts = ros.filter(function (p) { return p.ovr < 80; }).map(function (p) {
      var pv = releasePreview(p, false), starter = starters(abbr, p.pos).indexOf(p) >= 0;
      return { p: p, saves: pv.savings, replacement: repl, net: pv.savings - repl, dead: pv.now, starter: starter };
    })
    .filter(function (x) { return x.net >= 250; })
    .sort(function (a, b) { return (a.starter - b.starter) || (b.net - a.net); }).slice(0, 5);
  // how many of the listed cuts (in order) it takes to cover the current shortfall
  var short = rosterFill(abbr).short, cum = 0, cutsNeeded = 0;
  for (var c = 0; c < cuts.length && cum < short; c++) { cum += cuts[c].net; cutsNeeded++; }
  return { restructures: rs, cuts: cuts, short: short, cutsNeeded: short > 0 && cum >= short ? cutsNeeded : (short > 0 ? null : 0), cutsTotal: sumBy(cuts, function (x) { return x.net; }) };
}
