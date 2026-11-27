// Phase machine, draft, progression, retirements, contract rollover.

function canAdvance() {
  if (S.phase === 'preseason' && roster(S.user).length > ROSTER_MAX) return 'Cut your roster to ' + ROSTER_MAX + ' first (you have ' + roster(S.user).length + '), or use auto cut.';
  if (S.phase === 'preseason' && roster(S.user).length < 46) return 'You need at least 46 players to start the season (you have ' + roster(S.user).length + '). Sign free agents.';
  if (S.phase === 'draft' && S.draft && S.draft.i < S.draft.order.length) return 'Finish the draft first.';
  if (S.phase === 'draft' && !S.autopilot && pendingOptions(S.user).length) return 'Decide on the fifth-year option for ' + pendingOptions(S.user).map(function (p) { return p.name; }).join(', ') + ' (deadline: early May).';
  if (S.phase === 'preseason' && fullSpace(S.user) < 0) return 'From week 1 every contract counts, not just the top 51: you\'d be ' + fmtM(-fullSpace(S.user)) + ' over the cap.';
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
      // No preseason stop: after the draft every team (yours too) fills and cuts to 53 under the cap,
      // then week 1 starts. Only if your roster can't get there does the game stop on Make room.
      aiFifthYearDecisions();
      finishDraft(); S.phase = 'preseason';
      aiFillRoster(ROSTER_MAX);
      aiTeams().forEach(function (a) { cutdown(a); autoDepth(a); });
      return finalCuts();
    case 'preseason':
      return finalCuts();
    case 'season': case 'playoffs':
      return advanceSeason();
  }
  return { ok: true };
}
// Final cutdown, then the old preseason-to-week-1 steps. Stops (phase stays 'preseason') when your
// roster can't reach 53 under the cap; Continue tries again after you make room.
function finalCuts() {
  var ar = userAutoRoster();
  var over = fullSpace(S.user) < 0;
  if (!S.autopilot && !S.finalCutsShown && (ar.missing || over)) {
    S.finalCutsShown = true;
    return { ok: false, cuts: true, auto: ar, msg: over ? 'Final cuts: you\'d be ' + fmtM(-fullSpace(S.user)) + ' over the cap at week 1. Make room, then press Continue.' : ar.msg + ' Make room, then press Continue.' };
  }
  var block = canAdvance();
  if (block) return { ok: false, cuts: true, auto: ar, msg: block };
  S.finalCutsShown = false;
  (function () {
      aiFreeAgencyDay(); aiLateMarket(); aiExtensions();
      aiFillRoster(ROSTER_MAX);
      aiTeams().forEach(function (a) { cutdown(a); });
      aiLateMarket();                          // second pass: cutdowns free room for anyone still unsigned
      aiTeams().forEach(function (a) { cutdown(a); });
      S.phase = 'season';                      // top-51 rule ends: every contract counts now
      aiTeams().forEach(function (a) { aiCapFix(a, 500); });
      aiLateMarket();                          // last pass: anyone a week-1 cap clean-up let go
      aiPrepay(15000);
      // a week-1 cap clean-up can leave a team one short: top it back up to 53 (minimum deals, within its room)
      aiTeams().forEach(topUp);
      resetSeason();
  })();
  news('Week 1: rosters are set at ' + ROSTER_MAX + '.');
  return { ok: true, auto: ar };
}
// Week-1 top-up: a team left short by its cap clean-up signs undrafted rookies at the minimum, only if it
// already has the room (no cuts, no restructures).
function topUp(abbr) {
  var guard = 0, price = Cap.minSalary(FILLER_PRICE_EXP, S.year);
  while (roster(abbr).length < ROSTER_MAX && fullSpace(abbr) >= price && guard++ < 10) {
    var counts = {}; roster(abbr).forEach(function (p) { counts[p.pos] = (counts[p.pos] || 0) + 1; });
    if (!sign(makeFiller(fillNeedPos(counts)), abbr, { years: 1, total: price, bonus: 0, gtd: 0 }, true).ok) break;
  }
}
function advanceSeason() {
  switch (S.phase) {
    case 'season':
      if (S.week < WEEKS) { simWeek(); aiInSeason(); break; }
      selectProBowls();
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

// Quick start: the AI runs the whole offseason for every team, yours included (re-signings, fifth-year
// options, free agency, draft, cutdown to 53 under the cap). You take over at week 1. Returns a summary
// of what happened to your team.
function quickStart() {
  var U = S.user, Y = S.year;
  var before = {}; roster(U).forEach(function (p) { before[p.id] = 'roster'; });
  S.players.forEach(function (p) { if (p.rights === U && !p.team) before[p.id] = 'expiring'; });
  var opts = pendingOptions(U).map(function (p) { return p.id; });
  S.autopilot = true;
  var guard = 0;
  while (S.phase !== 'season' && guard++ < 60) {
    if (S.phase === 'draft' && S.draft && S.draft.i < S.draft.order.length) draftUntilUser(true);
    var r = advance();
    if (!r.ok) { userAutoRoster(); aiCapFix(U, 2000); if (S.phase !== 'preseason' && S.phase !== 'draft') break; }
  }
  S.autopilot = false;
  var after = roster(U), sum = { year: Y, left: [], resigned: [], signed: [], drafted: [], options: [] };
  Object.keys(before).forEach(function (id) {
    var p = P(id); if (!p || p.team === U) return;
    sum.left.push({ id: id, name: p.name, pos: p.pos, ovr: p.ovr, to: p.retired ? 'retired' : p.team || 'unsigned', was: before[id] });
  });
  after.forEach(function (p) {
    if (before[p.id] === 'expiring') sum.resigned.push(p.id);
    else if (!before[p.id]) (p.draft && p.draft[0] === Y && p.draft[1] ? sum.drafted : sum.signed).push(p.id);
  });
  opts.forEach(function (id) { var p = P(id); sum.options.push({ id: id, name: p.name, decision: p.fifth || (p.team === U && Cap.yearsLeft(p, Y) > 1 ? 'exercised' : 'declined') }); });
  sum.left.sort(byKey(function (x) { return x.ovr; }, true));
  var ovr = function (id) { return P(id).ovr; };
  sum.resigned.sort(byKey(ovr, true)); sum.signed.sort(byKey(ovr, true));
  sum.drafted.sort(byKey(function (id) { return P(id).draft[2]; }));
  S.quickSummary = sum;
  news('Quick start: the ' + Y + ' offseason ran on autopilot. Week 1 is next.', U);
  return sum;
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
// Each class has its own random stream (seed + year), so the prospects board can preview it before the
// draft without touching the league's main random sequence. Ratings use the class strength at the time.
function classSeed(year) { return ((S.seed | 0) ^ Math.imul(year | 0, 0x9E3779B1)) || 1; }
function genDraftClass(year, preview) {
  var saved = RNG.s; RNG.s = classSeed(year);
  var n = 0;
  var list = [];
  Object.keys(CLASS_POS).forEach(function (pos) { for (var i = 0; i < CLASS_POS[pos]; i++) list.push(pos); });
  var out = list.map(function (pos) {
    var z = RNG.normal();
    var g = clamp(z, -2.5, 3.2);
    var age = RNG.int(21, 23);
    var boost = (S.classBoost || {})[pos] || 0;               // class strength at this position
    var ovr = clamp(Math.round(54 + g * 7 + boost * 0.4 + RNG.normal() * 2), 40, 86);
    var trait = randomTrait();
    var pot = clamp(Math.round(ovr + (8 + RNG.next() * 14 + Math.max(0, g) * 3) * TRAITS[trait].upside + boost * 0.8), ovr, 99);
    var p = { id: preview ? 'X' + year + '-' + (n++) : 'D' + year + '-' + (S.nextId++), name: fakeName(), pos: pos, opos: pos, age: age, team: null, prevTeam: null,
              exp: 0, draft: [year, 0, 0], apy: 0, signed: year, gtdTotal: 0, years: [], options: [], status: 'Prospect',
              ovr: ovr, pot: pot, trait: trait, sub: {}, inj: 0, s: {}, car: {}, rej: 0, prospect: true, gen: true,
              college: RNG.pick(['Alabama', 'Georgia', 'Ohio State', 'Michigan', 'LSU', 'Texas', 'Oregon', 'USC', 'Clemson', 'Penn State', 'Florida', 'Notre Dame', 'Miami', 'Utah', 'Iowa', 'Wisconsin', 'Tennessee', 'Washington', 'Oklahoma', 'Auburn', 'Boise State', 'Toledo', 'App State', 'Tulane', 'Missouri', 'Kansas State']) };
    p.grade = prospectGrade(p);
    return p;
  });
  out.sort(byKey(function (p) { return p.grade; }, true));
  RNG.s = saved;
  return out;
}
function prospectGrade(p) { return (p.ovr * 0.55 + p.pot * 0.45) * (0.9 + Market.POS_WEIGHT[p.pos] * 0.05); }

function draftOrderTeams() {
  if (S.lastOrder) return S.lastOrder.slice();
  // first draft of the franchise: real order from last season's results (nflverse games), final once
  // the Super Bowl is in the data, provisional (current standings) before that
  if (BASE.draftOrder && BASE.draftOrder.length === 32) return BASE.draftOrder.slice();
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
  if (p.num == null) p.num = freeNumber(k.owner, p.pos);
  p.mv = Market.initialMarketShare(p, k.no);
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
// Progression = age curve + how he actually played this season. No random drift: a rating moves only
// because of aging (growth toward potential when young, decline past the position's peak) and
// performance (production vs what his rating predicted, among players with 6+ starts).
function perfScore(p) {
  var s = p.s || {}, g = s.g || 0;
  if (g < 6) return null;
  switch (p.pos) {
    case 'QB': return ((s.pyd || 0) + 20 * (s.ptd || 0) - 45 * (s.int || 0)) / g;
    case 'RB': return ((s.ruyd || 0) + (s.ryd || 0) + 6 * ((s.rutd || 0) + (s.rtd || 0))) / g;
    case 'WR': case 'TE': return ((s.ryd || 0) + 6 * (s.rtd || 0)) / g;
    case 'EDGE': case 'DL': return (s.sk || 0) / g;
    case 'LB': return (s.tk || 0) / g;
    case 'CB': case 'S': return ((s.dint || 0) * 3 + (s.tk || 0) * 0.2) / g;
    case 'K': return s.fga ? (s.fgm || 0) / s.fga : null;
    default: return null;   // OL, P, LS: no stat that separates them in this sim
  }
}
function performanceDeltas() {
  var out = {};
  POSITIONS.forEach(function (pos) {
    var list = S.players.filter(function (p) { return p.pos === pos && !p.retired && perfScore(p) != null; });
    if (list.length < 8) return;
    var n = list.length;
    var byPerf = list.slice().sort(byKey(perfScore)), byOvr = list.slice().sort(byKey(function (p) { return p.ovr; }));
    var rp = {}, ro = {};
    byPerf.forEach(function (p, i) { rp[p.id] = i / (n - 1); });
    byOvr.forEach(function (p, i) { ro[p.id] = i / (n - 1); });
    list.forEach(function (p) { out[p.id] = (rp[p.id] - ro[p.id]) * 6; });   // -6..+6
  });
  return out;
}
// Development traits: how fast a player grows, how close he gets to his potential (stop short by `stop`),
// how long he stays at his peak (`peak` extra years) and how fast he declines after it.
var TRAITS = {
  Slow:   { rate: 0.20, cap: 4, early: 0.12, earlyCap: 2, stop: 3, peak: -1, decline: 1.25, upside: 0.5 },
  Normal: { rate: 0.33, cap: 6, early: 0.22, earlyCap: 4, stop: 1, peak: 0, decline: 1.0, upside: 1.0 },
  Fast:   { rate: 0.42, cap: 7, early: 0.30, earlyCap: 5, stop: 0, peak: 1, decline: 0.85, upside: 1.4 },
  Elite:  { rate: 0.50, cap: 8, early: 0.38, earlyCap: 6, stop: 0, peak: 2, decline: 0.7, upside: 1.8 },
};
function traitOf(p) { return TRAITS[p.trait] ? p.trait : 'Normal'; }
function randomTrait() { var r = RNG.next(); return r < 0.15 ? 'Slow' : r < 0.75 ? 'Normal' : r < 0.95 ? 'Fast' : 'Elite'; }
// Yearly rating change from aging + trait + this season's performance (no random drift).
function progressDelta(p, perf) {
  var pk = Market.PEAK[p.pos] || [25, 30], t = TRAITS[traitOf(p)];
  var gap = Math.max(0, p.pot - t.stop - p.ovr);
  if (p.age < pk[0]) return Math.min(t.cap, gap * t.rate) + perf * 0.6;                       // developing
  if (p.age < pk[0] + 3 + Math.max(0, t.peak)) return Math.min(t.earlyCap, gap * t.early) + perf * 0.6;   // early prime
  if (p.age <= pk[1] + t.peak) return perf * 0.6;                                              // prime
  return -(1.5 + (p.age - (pk[1] + t.peak)) * 1.1) * t.decline + perf * 0.4;                  // decline
}
// Late bloomers: each offseason a good young player (26 or under, rated 78+) whose trait didn't promise
// much may break out: a one-season jump in rating and a higher ceiling. Fast/Elite players already grow.
var BREAKOUT = { Slow: 0.03, Normal: 0.20, Fast: 0, Elite: 0 };   // the players nobody expected
function breakout(p) {
  if (p.age > 26 || p.prospect || p.ovr < 78 || RNG.next() >= BREAKOUT[traitOf(p)]) return;
  p.ovr = Math.min(99, p.ovr + RNG.int(4, 9));
  p.pot = Math.min(99, Math.max(p.pot, p.ovr + RNG.int(2, 6)));
  p.brokeOut = (p.brokeOut || 0) + 1;
}
function progress(p, perf) {
  var pk = Market.PEAK[p.pos] || [25, 30], t = TRAITS[traitOf(p)];
  p.ovr = clamp(Math.round(p.ovr + progressDelta(p, perf)), 30, 99);
  p.pot = Math.max(p.ovr, Math.round(p.pot + (p.age < pk[0] + 3 + Math.max(0, t.peak) ? perf * 0.4 : -2)));
  p.peak = Math.max(p.peak || 0, p.ovr);
  p.age++; p.exp++;
}

// Pro Bowl: best per position in each conference by rating and this season's production.
var PRO_BOWL_SLOTS = { QB: 3, RB: 3, WR: 4, TE: 2, OT: 3, IOL: 4, EDGE: 3, DL: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 };
function selectProBowls() {
  var perf = performanceDeltas(), picked = [];
  ['AFC', 'NFC'].forEach(function (conf) {
    POSITIONS.forEach(function (pos) {
      S.players.filter(function (p) { return p.team && TEAM[p.team].conf === conf && p.pos === pos && (p.s.g || 0) >= 8; })
        .sort(byKey(function (p) { return p.ovr + (perf[p.id] || 0) * 1.5; }, true)).slice(0, PRO_BOWL_SLOTS[pos])
        .forEach(function (p) { p.pb = (p.pb || 0) + 1; (p.pbYears = p.pbYears || []).push(S.year); picked.push(p); });
    });
  });
  var mine = picked.filter(function (p) { return p.team === S.user; });
  news('Pro Bowl rosters announced' + (mine.length ? ': ' + mine.map(function (p) { return p.name; }).join(', ') + ' from your team.' : '.'));
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
  // career stats; playing time for first-round picks' option tiers (share of games started)
  S.players.forEach(function (p) {
    Object.keys(p.s || {}).forEach(function (k) { p.car[k] = (p.car[k] || 0) + p.s[k]; }); p.last = p.s;
    if (p.draft && p.draft[1] === 1 && p.draft[0] >= Y - 2) { p.pt = p.pt || {}; p.pt[Y] = Math.round(Math.min(1, (p.s.g || 0) / WEEKS) * 1000) / 1000; }
  });
  // fifth-year option salary table for next league year, from this year's cap numbers
  S.optTables = S.optTables || {};
  S.optTables[Y + 1] = Cap.optionTable(S.players, Y, BASE.optGroup, 1.07);
  var perf = performanceDeltas();
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
    breakout(p);
    progress(p, perf[p.id] || 0);
    Market.driftMarketValue(p, perf[p.id] || 0);
    p.inj = 0; p.injNote = null; p.rej = 0;
  });
  updateClassStrength();
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
// League talent stays stable through the draft, not by editing existing players: every player's
// rating moves only for aging and performance. Each offseason, positions with fewer 80+ players
// than at the start get a stronger incoming class (and vice versa).
function talentCount(pos) { return S.players.filter(function (p) { return p.pos === pos && !p.retired && !p.prospect && p.ovr >= 80; }).length; }
// forward-looking: players projected to be 80+ two seasons out (counts the young pipeline, reduces lag)
function pipelineCount(pos) { return S.players.filter(function (p) { return p.pos === pos && !p.retired && !p.prospect && Market.projOvr(p, 2) >= 80; }).length; }
function updateClassStrength() {
  S.classBoost = S.classBoost || {};
  POSITIONS.forEach(function (pos) {
    var target = S.targetPipe[pos] || 0, cur = pipelineCount(pos);
    var gap = (target - cur) / Math.max(4, target);            // share of the starting 80+ group missing
    S.classBoost[pos] = clamp(gap * 15, -8, 20);   // proportional to the projected shortfall (traits supply growth)
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
