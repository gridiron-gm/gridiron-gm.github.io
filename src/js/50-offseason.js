// Phase machine, draft, progression, retirements, contract rollover.

function canAdvance() {
  if (S.phase === 'preseason' && roster(S.user).length > ROSTER_MAX) return 'Cut your roster to ' + ROSTER_MAX + ' first (you have ' + roster(S.user).length + '), or use auto cut.';
  if (S.phase === 'preseason' && roster(S.user).length < 46) return 'You need at least 46 players to start the season (you have ' + roster(S.user).length + '). Sign free agents.';
  if (S.phase === 'draft' && S.draft && S.draft.i < S.draft.order.length) return 'Finish the draft first.';
  if (S.phase === 'fa' && space(S.user) < 0) return 'You are over the cap. Clear space before moving on.';
  return null;
}

function advance() {
  var block = canAdvance();
  if (block) return { ok: false, msg: block };
  switch (S.phase) {
    case 'resign':
      aiResign();
      S.phase = 'fa'; S.faDay = 0;
      news('Free agency is open. ' + freeAgents().filter(function (p) { return p.ovr >= 75; }).length + ' players rated 75+ are available.');
      break;
    case 'fa':
      if (S.faDay < FA_DAYS) { aiFreeAgencyDay(); S.faDay++; if (S.faDay < FA_DAYS) break; }
      startDraft(); S.phase = 'draft';
      break;
    case 'draft':
      finishDraft(); S.phase = 'preseason';
      aiFillRoster(ROSTER_MAX);
      aiTeams().forEach(function (a) { cutdown(a); autoDepth(a); });
      news('Preseason: get to ' + ROSTER_MAX + ' players before week 1.');
      break;
    case 'preseason':
      aiFreeAgencyDay(); aiExtensions();
      aiFillRoster(ROSTER_MAX);
      aiTeams().forEach(function (a) { cutdown(a); });
      aiPrepay(15000);
      S.week1Space = sumBy(aiTeams().filter(function (a) { return a !== S.user; }), function (a) { return space(a); }) / 31;
      resetSeason(); S.phase = 'season';
      break;
    case 'season':
      if (S.week < WEEKS) { simWeek(); aiInSeason(); break; }
      startPlayoffs(); S.phase = 'playoffs';
      news('Playoff field set. AFC: ' + S.playoffs.AFC.join(', ') + '. NFC: ' + S.playoffs.NFC.join(', ') + '.');
      break;
    case 'playoffs':
      if (!S.playoffs.champ) { simPlayoffRound(); break; }
      endOfYear();
      break;
  }
  return { ok: true };
}

// in-season: AI teams replace injured starters with free agents now and then
function aiInSeason() {
  aiTeams().forEach(function (abbr) {
    POSITIONS.forEach(function (pos) {
      if (starters(abbr, pos).length < Market.STARTERS[pos] && roster(abbr).length < ROSTER_MAX + 1) {
        var fa = freeAgents().filter(function (p) { return p.pos === pos; }).sort(byKey(function (p) { return p.ovr; }, true))[0];
        if (fa && roster(abbr).length >= ROSTER_MAX) cutdownOne(abbr, pos);
        if (fa) sign(fa, abbr, { years: 1, total: Cap.minSalary(fa.exp, S.year) + 100, bonus: 0, gtd: 0 }, true);
      }
    });
  });
}
function cutdownOne(abbr, avoidPos) {
  var c = roster(abbr).filter(function (p) { return p.pos !== avoidPos && !p.inj; }).sort(byKey(function (p) { return p.ovr + releasePreview(p).now / 1000; }))[0];
  if (c && space(abbr) + releasePreview(c).savings >= 0) release(c, false);
}

// ---------- draft ----------
var CLASS_POS = { QB: 12, RB: 22, WR: 40, TE: 18, OT: 26, IOL: 28, EDGE: 34, DL: 30, LB: 26, CB: 36, S: 22, K: 3, P: 3, LS: 2 };
function genDraftClass(year) {
  var list = [];
  Object.keys(CLASS_POS).forEach(function (pos) { for (var i = 0; i < CLASS_POS[pos]; i++) list.push(pos); });
  var out = list.map(function (pos) {
    var z = RNG.normal();
    var g = clamp(z, -2.5, 3.2);
    var age = RNG.int(21, 23);
    var ovr = clamp(Math.round(54 + g * 7 + RNG.normal() * 2), 40, 84);
    var pot = clamp(Math.round(ovr + 8 + RNG.next() * 14 + Math.max(0, g) * 3), ovr, 99);
    var p = { id: 'D' + year + '-' + (S.nextId++), name: fakeName(), pos: pos, opos: pos, age: age, team: null, prevTeam: null,
              exp: 0, draft: [year, 0, 0], apy: 0, signed: year, gtdTotal: 0, years: [], options: [], status: 'Prospect',
              ovr: ovr, pot: pot, sub: {}, inj: 0, s: {}, car: {}, rej: 0, prospect: true, gen: true,
              college: RNG.pick(['Alabama', 'Georgia', 'Ohio State', 'Michigan', 'LSU', 'Texas', 'Oregon', 'USC', 'Clemson', 'Penn State', 'Florida', 'Notre Dame', 'Miami', 'Utah', 'Iowa', 'Wisconsin', 'Tennessee', 'Washington', 'Oklahoma', 'Auburn', 'Boise State', 'Toledo', 'App State', 'Tulane', 'Missouri', 'Kansas State']) };
    p.grade = prospectGrade(p);
    return p;
  });
  out.sort(byKey(function (p) { return p.grade; }, true));
  return out;
}
function prospectGrade(p) { return (p.ovr * 0.55 + p.pot * 0.45) * (0.9 + Market.POS_WEIGHT[p.pos] * 0.05); }

function draftOrderTeams() {
  if (S.lastOrder) return S.lastOrder.slice();
  // first draft of the franchise: 2026 season not finished in the data, so use projected team strength
  return TEAMS.map(function (t) { return t.abbr; }).sort(byKey(function (a) { return teamRating(a).ovr + RNG.next() * 2; }));
}
function startDraft() {
  var order = draftOrderTeams();
  var picks = S.picks.filter(function (k) { return k.year === S.year; });
  picks.sort(function (a, b) { return a.round - b.round || order.indexOf(a.orig) - order.indexOf(b.orig); });
  picks.forEach(function (k, i) { k.no = i + 1; });
  // number next year's picks as "projected" by round only
  var cls = genDraftClass(S.year);
  cls.forEach(function (p) { S.players.push(p); if (S._idx) S._idx[p.id] = p; });
  S.draft = { order: picks.map(function (k) { return k.id; }), i: 0, made: [] };
  news('The ' + S.year + ' draft is on. ' + (picks.filter(function (k) { return k.owner === S.user; }).length) + ' picks for ' + S.user + '.');
}
function draftPool() { return S.players.filter(function (p) { return p.prospect && !p.team; }).sort(byKey(function (p) { return p.grade; }, true)); }
function currentPick() { return S.draft && S.draft.i < S.draft.order.length ? S.picks.filter(function (k) { return k.id === S.draft.order[S.draft.i]; })[0] : null; }
function makePick(k, p) {
  var deal = Cap.rookieDeal(k.no, S.year, capOf(S.year));
  p.prospect = false; p.draft = [S.year, k.round, k.no]; p.status = 'ACT';
  p.team = null;
  var yrs = Cap.buildContract(deal, S.year, 0);
  p.team = k.owner; p.years = yrs; p.apy = Cap.apy(yrs); p.gtdTotal = deal.gtd; p.signed = S.year;
  S.draft.made.push({ no: k.no, round: k.round, team: k.owner, id: p.id });
  S.draft.i++;
  if (k.owner === S.user || k.round === 1) news('Pick ' + k.no + ': ' + k.owner + ' select ' + p.pos + ' ' + p.name + ' (' + p.college + ').', k.owner);
}
function aiPick(k) {
  var pool = draftPool().slice(0, 40);
  var best = null, bs = -1;
  pool.forEach(function (p, i) {
    var lift = needAt(k.owner, p.pos, p.pot - 6);
    var s = p.grade + Math.min(8, lift * 0.25) * Market.POS_WEIGHT[p.pos] - i * 0.15 + RNG.next() * 2;
    if (p.pos === 'K' || p.pos === 'P' || p.pos === 'LS') s -= k.round < 5 ? 25 : 0;
    if (s > bs) { bs = s; best = p; }
  });
  makePick(k, best);
}
// Advance the draft until it's the user's pick (or it ends). Returns true if the user is on the clock.
function draftUntilUser(includeUser) {
  while (S.draft.i < S.draft.order.length) {
    var k = currentPick();
    if (k.owner === S.user && !includeUser) return true;
    if (k.owner === S.user) { aiPick(k); continue; }
    aiPick(k);
  }
  return false;
}
function finishDraft() {
  if (!S.draft) return;
  draftUntilUser(true);
  // undrafted prospects become free agents asking for the minimum
  S.players.forEach(function (p) { if (p.prospect) { p.prospect = false; p.status = 'UDFA'; p.ovr = Math.min(p.ovr, 62); } });
  S.picks = S.picks.filter(function (k) { return k.year !== S.year; });
  addPicks(S.year + 3);
  TEAMS.forEach(function (t) { autoDepth(t.abbr); });
}

// ---------- end of year ----------
function progress(p) {
  var pk = Market.PEAK[p.pos] || [25, 30];
  var d;
  if (p.age < pk[0]) d = Math.min(5, Math.max(-1, (p.pot - p.ovr) * (0.12 + RNG.next() * 0.2) + RNG.normal() * 1.5));
  else if (p.age <= pk[1]) d = RNG.normal() * 2.2 + 0.3;
  else d = -(1.5 + (p.age - pk[1]) * 1.1) + RNG.normal() * 2;
  p.ovr = clamp(Math.round(p.ovr + d), 30, 99);
  p.pot = Math.max(p.ovr, Math.round(p.pot - (p.age >= pk[0] ? 2 : RNG.next() * 2)));
  p.age++; p.exp++;
}
function retires(p) {
  var pk = (Market.PEAK[p.pos] || [25, 30])[1];
  var over = p.age - pk;
  var prob = over <= 0 ? 0.005 : Math.min(0.95, 0.06 * over + (p.ovr < 65 ? 0.2 : 0) + (p.age >= 36 ? 0.3 : 0));
  if (!p.team && p.age >= 30) prob += 0.25;          // unsigned vets often hang it up
  if (p.ovr >= 88 && p.age <= 38) prob *= 0.4;
  return RNG.next() < prob;
}

function endOfYear() {
  var po = S.playoffs, Y = S.year;
  var ur = S.teams[S.user].rec;
  S.history.push({ year: Y, champ: po.champ, user: S.user, rec: ur.w + '-' + ur.l + (ur.t ? '-' + ur.t : ''),
                   userFinish: po.champ === S.user ? 'Won Super Bowl' : po.elim[S.user] != null ? 'Lost in ' + ROUND_NAMES[po.elim[S.user]].toLowerCase() : 'Missed playoffs',
                   mvp: seasonMvp() });
  // next draft order: non-playoff teams by record, then playoff teams by round lost, champ last
  var all = TEAMS.map(function (t) { return t.abbr; });
  all.sort(function (a, b) {
    var ea = po.champ === a ? 9 : po.elim[a] != null ? po.elim[a] + 1 : 0, eb = po.champ === b ? 9 : po.elim[b] != null ? po.elim[b] + 1 : 0;
    return ea - eb || (pct(S.teams[a].rec) - pct(S.teams[b].rec)) || ((S.teams[a].rec.pf - S.teams[a].rec.pa) - (S.teams[b].rec.pf - S.teams[b].rec.pa));
  });
  S.lastOrder = all;
  // career stats
  S.players.forEach(function (p) { Object.keys(p.s || {}).forEach(function (k) { p.car[k] = (p.car[k] || 0) + p.s[k]; }); p.last = p.s; });
  // market inflation: if teams sat on lots of unused room this year, next year's asking prices rise
  if (S.week1Space != null) {
    var slack = S.week1Space / capOf(Y) - 0.03;
    // look ahead too: money already free next year (expiring deals) beyond a normal ~30% of the cap
    var ai = aiTeams().filter(function (a) { return a !== S.user; });
    var nextFree = sumBy(ai, function (a) { return space(a, Y + 1) + Cap.teamCommitted(S.players, T(a), Y) * 0; }) / ai.length + (sumBy(ai, function (a) { return Math.max(0, space(a, Y)); }) / ai.length);
    slack = Math.max(slack, (nextFree / capOf(Y + 1) - 0.33) * 0.55);
    var unsigned = freeAgents().filter(function (p) { return p.ovr >= 80; }).length;
    if (unsigned > 8) slack = Math.min(slack, -0.06 * Math.min(3, unsigned / 8));
    S.payScale = clamp(S.payScale * (1 + clamp(slack * 1.5, -0.06, 0.22)), 0.6, 2.5);
    Market.setScale(S.payScale);
  }
  // cap rollover into next league year
  TEAMS.forEach(function (t) { Cap.rollover(S.players, T(t.abbr), Y); });
  var retired = [];
  S.players.forEach(function (p) {
    if (p.retired) return;
    if (retires(p)) {
      if (p.team) { var c = Cap.releaseCost(p, Y + 1, false); Cap.applyDead(T(p.team), c.dead); }
      p.retired = Y; p.retiredFrom = p.team; p.team = null; p.years = []; p.options = [];
      retired.push(p);
      return;
    }
    progress(p);
    p.inj = 0; p.injNote = null; p.rej = 0;
  });
  normalizeRatings();
  if (retired.length) news(retired.length + ' players retired, including ' + retired.sort(byKey(function (p) { return p.ovr; }, true)).slice(0, 4).map(function (p) { return p.name; }).join(', ') + '.');
  // keep the save small: unsigned veterans who sat out a year retire; drop retired non-notables
  S.players.forEach(function (p) {
    if (!p.team && !p.retired && !p.rights && (p.ovr < 58 || p.age >= 32 || (p.gen && p.ovr < 62))) { p.retired = Y; p.retiredFrom = null; }
  });
  S.players = S.players.filter(function (p) { return !p.retired || (p.ovr >= 85 && !p.gen); });
  S.players.forEach(function (p) { if (p.retired) { p.years = []; p.s = {}; p.sub = {}; } });
  S.year = Y + 1;
  // contracts: expired deals -> pending free agents with re-sign rights; void years accelerate
  S.players.forEach(function (p) {
    if (!p.team) return;
    var acc = Cap.voidAcceleration(p, S.year);
    if (acc) Cap.applyDead(T(p.team), (function () { var d = {}; d[S.year] = acc; return d; })());
    if (Cap.yearsLeft(p, S.year) === 0) { p.rights = p.team; p.prevTeam = p.team; p.team = null; p.years = []; p.options = []; }
  });
  S.june1 = {};
  TEAMS.forEach(function (t) { T(t.abbr); autoDepth(t.abbr); S.teams[t.abbr].rec = newRec(); });
  S.phase = 'resign'; S.week = 0; S.playoffs = null; S.draft = null; S.schedule = [];
  reindex();
  var exp = S.players.filter(function (p) { return p.rights === S.user; }).length;
  news('The ' + S.year + ' league year begins. ' + exp + ' of your players have expiring contracts. Cap: ' + fmtM(capOf(S.year)) + ' (projected) plus ' + fmtM(S.teams[S.user].rollover[S.year] || 0) + ' rollover.');
}
// Market clearing for the new league year: compare the money teams have free with the fair value of
// everyone who needs a contract (expired deals + free agents good enough to roster), and move the
// league pay level toward the price that spends it.
function clearMarket() {
  var y = S.year;
  var free = sumBy(TEAMS, function (t) { return Math.max(0, space(t.abbr, y)); });
  var rostered = S.players.filter(function (p) { return p.team; }).length;
  var openSlots = Math.max(0, 53 * 32 - rostered - 224);          // minus incoming draft class
  var pool = S.players.filter(function (p) { return !p.team && !p.retired && !p.prospect; }).sort(byKey(function (p) { return p.ovr; }, true)).slice(0, openSlots);
  var fair = sumBy(pool, function (p) { return Market.valueAt(p.pos, p.ovr, marketCap(), p.exp, y); });
  var rookies = 32 * 12000 * capOf(y) / capOf(BASE.startYear);
  var avail = free - rookies - 32 * 6000;                          // teams keep a little room
  if (fair <= 0 || avail <= 0) return;
  var ratio = clamp(avail / fair, 0.85, 1.2);
  S.payScale = clamp(S.payScale * Math.pow(ratio, 0.7), 0.7, 2.2);
  Market.setScale(S.payScale);
}

// Map each position's ratings back onto the starting distribution (rank order preserved).
function normalizeRatings() {
  POSITIONS.forEach(function (pos) {
    var ref = S.dist[pos]; if (!ref || !ref.length) return;
    var list = S.players.filter(function (p) { return p.pos === pos && !p.retired && !p.prospect; }).sort(byKey(function (p) { return p.ovr + p.pot * 0.001; }, true));
    list.forEach(function (p, i) {
      // top-anchored: the i-th best player gets the i-th best starting rating, so the number of
      // good players per position stays constant even as the pool of fringe players changes size
      var target = i < ref.length ? ref[i] : ref[ref.length - 1] - Math.min(8, (i - ref.length) * 0.05);
      var d = target - p.ovr;
      p.ovr = clamp(target, 30, 99); p.pot = clamp(Math.max(p.ovr, p.pot + d), 30, 99);
    });
  });
}
function seasonMvp() {
  var best = null, bs = -1;
  S.players.forEach(function (p) {
    if (!p.s || !p.s.g) return;
    var v = p.pos === 'QB' ? ((p.s.pyd || 0) / 20 + (p.s.ptd || 0) * 5 - (p.s.int || 0) * 3) * 1.3 : (p.s.ruyd || 0) / 10 + (p.s.ryd || 0) / 10 + ((p.s.rutd || 0) + (p.s.rtd || 0)) * 6 + (p.s.sk || 0) * 8;
    v *= (0.6 + pct(S.teams[p.team] ? S.teams[p.team].rec : newRec()));
    if (v > bs) { bs = v; best = p; }
  });
  return best ? best.pos + ' ' + best.name + ' (' + best.team + ')' : '';
}
