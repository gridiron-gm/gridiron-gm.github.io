// Cap and contract rules. Pure functions, no DOM. Money is integer $ thousands ($K).
//
// A contract is player.years = [{y, base, pro, opt, roster, other, gtd, cap, void?}, ...] with consecutive y.
//   base    base salary            pro    prorated bonus charged this year (signing + exercised options)
//   opt     proration of option bonuses not yet exercised (counts on the cap, not dead money until exercised)
//   roster  roster bonus           other  workout/per-game/other bonuses
//   gtd     guaranteed cash still owed for that year (base/roster/other, plus a guaranteed option bonus)
//   cap     cap number = base + pro + opt + roster + other
//   void    void year: no salary, carries leftover proration that accelerates when the deal voids
// player.options = [{y, per, span}] pending option bonuses: exercised at the start of league year y.
// Team dead money lives in team.dead = {year: $K}.
// Team dead money lives in team.dead = {year: $K}.
var Cap = (function () {
  'use strict';

  var MAX_PRORATION_YEARS = 5;
  var CAP_GROWTH = 0.07;            // projected growth for years after the data's projection
  var MIN_ROSTER_FOR_SEASON = 53;

  // Approximate league minimum salary in 2027 by accrued seasons; grows ~$45K a year.
  var MIN_2027 = [930, 1065, 1140, 1215, 1310, 1310, 1310, 1460];
  function minSalary(exp, year) {
    var i = Math.max(0, Math.min(MIN_2027.length - 1, exp | 0));
    return MIN_2027[i] + 45 * Math.max(0, year - 2027);
  }

  function row(p, year) {
    if (!p.years) return null;
    for (var i = 0; i < p.years.length; i++) if (p.years[i].y === year) return p.years[i];
    return null;
  }
  function capHit(p, year) { var r = row(p, year); return r ? r.cap : 0; }
  function yearsLeft(p, year) { return (p.years || []).filter(function (r) { return r.y >= year && !r.void; }).length; }
  function opt(r) { return r.opt || 0; }
  function recalc(r) { r.cap = r.base + r.pro + opt(r) + r.roster + r.other; return r; }
  function remaining(p, year) { return (p.years || []).filter(function (r) { return r.y >= year; }); }
  function sum(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f(arr[i]); return s; }
  function gtdLeft(p, year) { return sum(remaining(p, year), function (r) { return r.gtd; }); }
  function contractValueLeft(p, year) { return sum(remaining(p, year), function (r) { return r.base + r.roster + r.other; }); }

  // Exercise pending option bonuses due in `year` (teams exercise them when the league year's games start).
  // The option's proration becomes real (dead-money) proration, and a guaranteed option bonus leaves gtd.
  function exerciseOptions(p, year) {
    if (!p.options || !p.options.length) return 0;
    var done = 0;
    p.options = p.options.filter(function (op) {
      if (op.y !== year) return true;
      for (var y = op.y; y < op.y + op.span; y++) {
        var r = row(p, y);
        if (r) { var m = Math.min(op.per, opt(r)); r.opt = opt(r) - m; r.pro += m; }
      }
      var r0 = row(p, year);
      if (r0) {
        var cashGtd = r0.base + r0.roster;
        r0.gtd = Math.max(0, r0.gtd - Math.min(op.per * op.span, Math.max(0, r0.gtd - cashGtd)));
      }
      done++;
      return false;
    });
    return done;
  }
  // Contract has run out of real years: leftover void-year proration accelerates as dead money.
  function voidAcceleration(p, year) {
    var rows = remaining(p, year);
    if (!rows.length || !rows.every(function (r) { return r.void; })) return 0;
    return sum(rows, function (r) { return r.pro; });
  }

  // ---- Release ----
  // Pre-June 1: every remaining prorated bonus dollar and all remaining guaranteed salary hit this year.
  // Post-June 1 (or June 1 designation): this year's proration plus all remaining guaranteed salary hit
  // now; the later years' proration moves to next year's cap. (Same convention as OverTheCap.)
  function releaseCost(p, year, postJune1) {
    var rem = remaining(p, year);
    if (!rem.length) return { dead: {}, savings: 0, capHit: 0 };
    var cur = rem[0], later = rem.slice(1);
    var hit = cur.cap;
    var dead = {};
    var allGtd = sum(rem, function (r) { return r.gtd; });
    if (!postJune1) {
      dead[year] = sum(rem, function (r) { return r.pro; }) + allGtd;
    } else {
      dead[year] = cur.pro + allGtd;
      var nxt = sum(later, function (r) { return r.pro; });
      if (nxt) dead[year + 1] = nxt;
    }
    return { dead: dead, savings: hit - dead[year], capHit: hit, totalDead: sum(Object.keys(dead), function (k) { return dead[k]; }) };
  }

  function applyDead(team, dead) {
    team.dead = team.dead || {};
    Object.keys(dead).forEach(function (y) { if (dead[y]) team.dead[y] = (team.dead[y] || 0) + dead[y]; });
  }

  // ---- Trade ----
  // The old team keeps all unamortised signing bonus as dead money (pre-June 1: all now; post-June 1: this
  // year's share now, the rest next year). The new team takes base/roster/other salary and the guarantees.
  function tradeCost(p, year, postJune1) {
    var rem = remaining(p, year);
    var dead = {};
    if (rem.length) {
      if (!postJune1) dead[year] = sum(rem, function (r) { return r.pro; });
      else { dead[year] = rem[0].pro; var n = sum(rem.slice(1), function (r) { return r.pro; }); if (n) dead[year + 1] = n; }
    }
    var newYears = rem.map(function (r) {
      var n = { y: r.y, base: r.base, pro: 0, opt: opt(r), roster: r.roster, other: r.other, gtd: r.gtd };
      if (r.void) n.void = true;
      return recalc(n);
    }).filter(function (r) { return !r.void || r.cap > 0; });
    return { dead: dead, oldSavings: (rem[0] ? rem[0].cap : 0) - (dead[year] || 0), newYears: newYears, newHit: newYears[0] ? newYears[0].cap : 0 };
  }

  // ---- Building a new contract from an offer ----
  // offer = {years, total, bonus, gtd} in $K. Salary escalates ~5% a year after a low first-year base
  // (the usual way teams create cap room). Guarantees cover the signing bonus first, then salary in order.
  function buildContract(offer, startYear, exp) {
    var n = Math.max(1, Math.min(7, offer.years | 0));
    var total = Math.max(0, offer.total | 0);
    var bonus = Math.max(0, Math.min(total, offer.bonus | 0));
    var gtd = Math.max(bonus, Math.min(total, offer.gtd | 0));
    var proYears = Math.min(n, MAX_PRORATION_YEARS);
    var salaryPool = total - bonus;
    // escalating weights; first year slightly lower when there's a bonus
    var w = [];
    for (var i = 0; i < n; i++) w.push(Math.pow(1.05, i));
    var ws = w.reduce(function (a, b) { return a + b; }, 0);
    var years = [], assigned = 0, gtdSalary = gtd - bonus, proAssigned = 0;
    for (var j = 0; j < n; j++) {
      var y = startYear + j;
      var base = j === n - 1 ? salaryPool - assigned : Math.round(salaryPool * w[j] / ws);
      var floor = minSalary((exp | 0) + j, y);
      years.push({ y: y, base: base, pro: 0, opt: 0, roster: 0, other: 0, gtd: 0, cap: 0, _floor: floor });
      assigned += base;
    }
    // enforce league minimum on each year by pulling from later years
    for (var a = 0; a < n; a++) {
      var need = years[a]._floor - years[a].base;
      for (var b = n - 1; need > 0 && b > a; b--) {
        var give = Math.min(need, years[b].base - years[b]._floor);
        if (give > 0) { years[b].base -= give; years[a].base += give; need -= give; }
      }
      if (need > 0) years[a].base += need;   // total was below the league minimum: raise it
      delete years[a]._floor;
    }
    for (var k = 0; k < n; k++) {
      var r = years[k];
      if (k < proYears) {
        r.pro = k === proYears - 1 ? bonus - proAssigned : Math.round(bonus / proYears);
        proAssigned += r.pro;
      }
      var g = Math.min(gtdSalary, r.base);
      r.gtd = g; gtdSalary -= g;
      recalc(r);
    }
    return years;
  }

  // Extension: years still on the old deal keep their prorated bonus; the new money replaces their salary
  // and the new deal runs `offer.years` seasons from startYear (counting the old remaining years).
  function buildExtension(p, offer, startYear) {
    var newYears = buildContract(offer, startYear, p.exp);
    var old = remaining(p, startYear);
    old.forEach(function (o) {
      var r = newYears.filter(function (x) { return x.y === o.y; })[0];
      if (r) { r.pro += o.pro; r.opt = opt(o); recalc(r); }
      else newYears.push(recalc({ y: o.y, base: 0, pro: o.pro, opt: opt(o), roster: 0, other: 0, gtd: 0, void: true })); // old proration beyond new term
    });
    newYears.sort(function (a, b) { return a.y - b.y; });
    return newYears;
  }

  function apy(years) { var real = years.filter(function (r) { return !r.void; }); return real.length ? Math.round(sum(years, function (r) { return r.cap; }) / real.length) : 0; }

  // ---- Team totals ----
  function teamCap(team, year) {
    // adjusted cap = league cap + rollover carried into this year
    return (team.capBase && team.capBase[year] != null ? team.capBase[year] : 0) + ((team.rollover || {})[year] || 0);
  }
  function teamCommitted(players, team, year) {
    return sum(players.filter(function (p) { return p.team === team.abbr; }), function (p) { return capHit(p, year); });
  }
  function teamDead(team, year) { return (team.dead || {})[year] || 0; }
  function capSpace(players, team, year) { return teamCap(team, year) - teamCommitted(players, team, year) - teamDead(team, year); }

  function leagueCap(baseCap, baseYear, year) { return Math.round(baseCap * Math.pow(1 + CAP_GROWTH, year - baseYear)); }

  // Rollover at the end of a league year: unused space carries into next year (as the CBA allows).
  function rollover(players, team, year) {
    var left = Math.max(0, capSpace(players, team, year));
    team.rollover = team.rollover || {};
    team.rollover[year + 1] = left;
    return left;
  }

  // ---- Rookie wage scale (approximate, 2027 slotting; grows with the cap) ----
  // pick 1 ~ $48.0M/4yr, pick 32 ~ $13.5M, pick 33 ~ $10.6M, pick 100 ~ $4.8M, day 3 late ~ league minimum.
  function rookieDeal(overall, year, capNow) {
    var scale = capNow / 326500;
    var raw = overall <= 32 ? 48000 * Math.pow(overall, -0.366) : 10600 * Math.pow(overall / 33, -0.716);
    var total = Math.round(Math.max(4 * minSalary(0, year) + 60, raw * scale));
    var bonusShare = overall <= 32 ? 0.65 : overall <= 64 ? 0.4 : 0.15;
    var bonus = Math.round(total * bonusShare);
    var gtd = overall <= 32 ? total : overall <= 64 ? Math.round(total * 0.55) : bonus;
    return { years: 4, total: total, bonus: bonus, gtd: gtd };
  }

  return {
    minSalary: minSalary, row: row, capHit: capHit, yearsLeft: yearsLeft, remaining: remaining, gtdLeft: gtdLeft,
    contractValueLeft: contractValueLeft, releaseCost: releaseCost, applyDead: applyDead, tradeCost: tradeCost,
    buildContract: buildContract, buildExtension: buildExtension, apy: apy, teamCap: teamCap,
    teamCommitted: teamCommitted, teamDead: teamDead, capSpace: capSpace, leagueCap: leagueCap, rollover: rollover,
    rookieDeal: rookieDeal, exerciseOptions: exerciseOptions, voidAcceleration: voidAcceleration, recalc: recalc, MAX_PRORATION_YEARS: MAX_PRORATION_YEARS, MIN_ROSTER_FOR_SEASON: MIN_ROSTER_FOR_SEASON
  };
})();
if (typeof module !== 'undefined') module.exports = Cap;
