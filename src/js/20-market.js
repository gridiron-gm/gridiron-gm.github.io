// Market value, contract demands, offer evaluation, trade value. Money in $K.
var Market = (function () {
  'use strict';

  // Average APY of the top 3 veteran contracts at each position, as a share of the 2027 cap
  // (computed from the OverTheCap data in scripts/build_data.py).
  var TOP_SHARE = { QB: .183, EDGE: .144, WR: .120, DL: .111, CB: .100, OT: .089, IOL: .078, S: .073,
                    RB: .068, LB: .068, TE: .058, K: .021, P: .012, LS: .0054 };
  // How much each position drives winning (used for team strength and trade needs)
  var POS_WEIGHT = { QB: 3.2, OT: 1.0, IOL: 0.7, WR: 1.0, TE: 0.6, RB: 0.5, EDGE: 1.2, DL: 0.9, LB: 0.6,
                     CB: 1.0, S: 0.7, K: 0.3, P: 0.15, LS: 0.05 };
  var STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, IOL: 3, EDGE: 2, DL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };
  var PEAK = { QB: [27, 33], RB: [23, 26], WR: [24, 29], TE: [25, 30], OT: [25, 31], IOL: [25, 31], EDGE: [24, 29],
               DL: [24, 30], LB: [24, 28], CB: [23, 28], S: [24, 29], K: [25, 36], P: [25, 36], LS: [25, 36] };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // Expected overall `n` seasons ahead (deterministic part of progression).
  function projOvr(p, n) {
    var o = p.ovr, age = p.age, pk = PEAK[p.pos] || [25, 30];
    for (var i = 0; i < n; i++) {
      if (age < pk[0]) o += Math.min(4, Math.max(0, (p.pot - o) * 0.35));
      else if (age > pk[1]) o -= age - pk[1] <= 2 ? 2 : age - pk[1] <= 4 ? 4 : 6;
      age++;
    }
    return clamp(Math.round(o), 30, 99);
  }

  function talentCurve(ovr) { return Math.pow(clamp((ovr - 55) / 42, 0, 1), 1.6); }

  // Fair yearly salary for a player at a given overall, in a league year with cap `cap`.
  function valueAt(pos, ovr, cap, exp, year) {
    return Math.max(Cap.minSalary(exp || 4, year || 2027), Math.round(cap * TOP_SHARE[pos] * talentCurve(ovr)));
  }

  // What the player asks for. Uses the next two seasons' expected rating (teams pay for the future).
  function demand(p, cap, year) {
    var o = Math.round((projOvr(p, 0) * 2 + projOvr(p, 1)) / 3);
    var apy = valueAt(p.pos, o, cap, p.exp, year);
    var age = p.age;
    var years = age <= 25 ? 5 : age <= 27 ? 4 : age <= 29 ? 3 : age <= 31 ? 2 : 1;
    if (apy < 3000) years = Math.min(years, 2);
    var gShare = clamp(0.2 + 0.55 * talentCurve(o), 0.05, 0.75);
    if (apy <= Cap.minSalary(p.exp, year) + 200) gShare = 0;
    return { apy: apy, years: years, gtd: Math.round(apy * years * gShare), ovrBasis: o };
  }

  // Seeded per-player noise in [-1, 1] so a player's reaction is stable (no save-scumming by re-asking).
  function noise(id, salt) {
    var h = 2166136261;
    var s = id + '|' + salt;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 2001) / 1000 - 1;
  }

  // Evaluate an offer. ctx = {cap, year, teamOvr, isOwnTeam, rejections, fa (true in free agency), daysIntoFA}
  // Returns {accept, mood (1.0 = exactly satisfied), ask, notes:[{k, good}]}
  function evaluate(p, offer, ctx) {
    var d = demand(p, ctx.cap, ctx.year);
    var yrs = Math.max(1, offer.years);
    var total = offer.total, gtd = Math.max(offer.gtd || 0, offer.bonus || 0);
    // value players put on an offer: guaranteed money counts extra; bonus paid now counts a bit extra
    var val = total + 0.45 * gtd + 0.10 * (offer.bonus || 0);
    // compare against the same length of deal at their asking APY
    var askTotal = d.apy * yrs;
    var askGtd = Math.min(askTotal, d.gtd / d.years * yrs);
    var ask = askTotal + 0.45 * askGtd + 0.10 * askGtd * 0.5;
    var mood = val / Math.max(1, ask);
    // contract length preference: young players want shorter-or-equal, vets want security (longer)
    var lenGap = yrs - d.years;
    var lenPen = p.age >= 29 ? (lenGap < 0 ? -lenGap * 0.06 : 0) : Math.abs(lenGap) * 0.025;
    mood -= lenPen;
    // team strength: older players chase rings
    var win = (ctx.teamOvr - 75) / 100 * (p.age >= 29 ? 1.6 : 0.7);
    mood += win;
    if (ctx.isOwnTeam) mood += 0.02;                         // small loyalty bump
    if (ctx.fa) mood += Math.min(0.12, (ctx.daysIntoFA || 0) * 0.012); // asking price softens as FA drags on
    mood -= (ctx.rejections || 0) * 0.02;                    // repeated lowballs annoy
    var threshold = 1 + noise(p.id, ctx.year) * 0.03;
    var notes = [
      { k: 'money', good: val / ask >= 0.98 },
      { k: 'guarantees', good: gtd >= askGtd * 0.9 },
      { k: 'length', good: lenPen < 0.03 },
      { k: 'contender', good: win >= 0 },
    ];
    return { accept: mood >= threshold, mood: mood / threshold, ask: d, notes: notes };
  }

  // ---- trade values, in "surplus $K" ----
  var DISCOUNT = 0.85;
  function playerTradeValue(p, year, cap, viewer) {
    var rows = Cap.remaining(p, year).filter(function (r) { return !r.void; });
    var v = 0;
    var n = Math.max(1, Math.min(4, rows.length));
    for (var i = 0; i < n; i++) {
      var o = projOvr(p, i);
      var worth = valueAt(p.pos, o, cap * Math.pow(1.07, i), p.exp + i, year + i);
      var cost = rows[i] ? rows[i].cap : worth;             // after the deal ends he'd cost market price
      v += Math.pow(DISCOUNT, i) * (worth * 1.15 - cost);   // surplus
      v += Math.pow(DISCOUNT, i) * worth * 0.35;            // you also just get a good player
    }
    // remaining guaranteed money/dead money is a liability for the acquirer only through cap cost (already in)
    if (viewer && viewer.rebuilding) v *= p.age <= 26 ? 1.15 : p.age >= 30 ? 0.6 : 0.9;
    return Math.round(v);
  }

  // pick: {year, round, ovr (overall pick no., may be estimated)}
  function pickValue(pick, year, viewer) {
    var no = pick.no || (pick.round - 1) * 32 + 16;
    var v = 62000 * Math.exp(-0.0185 * (no - 1)) + 600;
    v *= Math.pow(0.85, Math.max(0, pick.year - year));
    if (viewer && viewer.rebuilding) v *= 1.15;
    return Math.round(v);
  }

  return { TOP_SHARE: TOP_SHARE, POS_WEIGHT: POS_WEIGHT, STARTERS: STARTERS, PEAK: PEAK, projOvr: projOvr,
           valueAt: valueAt, demand: demand, evaluate: evaluate, noise: noise, playerTradeValue: playerTradeValue,
           pickValue: pickValue, talentCurve: talentCurve };
})();
if (typeof module !== 'undefined') module.exports = Market;
