// Schedule, game sim from team strength, injuries, stats, standings, playoffs.
var WEEKS = 17;

function makeSchedule() {
  // 17 rounds, each a perfect matching of all 32 teams: 6 division rounds + 11 non-division rounds.
  var abbrs = TEAMS.map(function (t) { return t.abbr; });
  var divs = {};
  TEAMS.forEach(function (t) { (divs[t.conf + t.div] = divs[t.conf + t.div] || []).push(t.abbr); });
  var rounds = [];
  var rr = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  for (var leg = 0; leg < 2; leg++) rr.forEach(function (pairs) {
    var games = [];
    Object.keys(divs).forEach(function (d) {
      pairs.forEach(function (pr) {
        var a = divs[d][pr[0]], b = divs[d][pr[1]];
        games.push(leg ? { h: b, a: a } : { h: a, a: b });
      });
    });
    rounds.push(games);
  });
  var met = {};
  function key(a, b) { return a < b ? a + b : b + a; }
  function sameDiv(a, b) { return TEAM[a].conf === TEAM[b].conf && TEAM[a].div === TEAM[b].div; }
  var homeCount = {};
  abbrs.forEach(function (a) { homeCount[a] = 3; });
  for (var r = 0; r < 11; r++) {
    for (var attempt = 0; attempt < 400; attempt++) {
      var left = RNG.shuffle(abbrs.slice()), games = [], okRound = true;
      while (left.length) {
        var a = left.shift();
        var idx = -1;
        for (var j = 0; j < left.length; j++) if (!sameDiv(a, left[j]) && !met[key(a, left[j])]) { idx = j; break; }
        if (idx < 0) { okRound = false; break; }
        var b = left.splice(idx, 1)[0];
        var home = homeCount[a] <= homeCount[b] ? a : b, away = home === a ? b : a;
        games.push({ h: home, a: away });
      }
      if (okRound) {
        games.forEach(function (g) { met[key(g.h, g.a)] = 1; homeCount[g.h]++; });
        rounds.push(games);
        break;
      }
    }
  }
  // interleave: spread division games across the season
  var order = [6, 0, 7, 8, 1, 9, 10, 2, 11, 12, 13, 3, 14, 15, 4, 16, 5];
  S.schedule = order.filter(function (i) { return rounds[i]; }).map(function (i) { return rounds[i].map(function (g) { return { h: g.h, a: g.a, hs: null, as: null }; }); });
}

function resetSeason() {
  Object.keys(S.teams).forEach(function (a) { S.teams[a].rec = newRec(); });
  S.players.forEach(function (p) { p.s = {}; });
  S.week = 0; S.playoffs = null;
  makeSchedule();
}

// ---------- one game ----------
function simGame(home, away, neutral) {
  var H = teamRating(home), A = teamRating(away);
  var hfa = neutral ? 0 : 1.6;
  var hExp = 22 + (H.off - A.def) * 0.55 + (H.st - A.st) * 0.05 + hfa / 2;
  var aExp = 22 + (A.off - H.def) * 0.55 + (A.st - H.st) * 0.05 - hfa / 2;
  var hs = Math.max(0, Math.round(hExp + RNG.normal() * 9.5));
  var as = Math.max(0, Math.round(aExp + RNG.normal() * 9.5));
  hs = footballScore(hs); as = footballScore(as);
  if (hs === as) { // overtime
    var r = RNG.next();
    var pH = 0.5 + (H.ovr - A.ovr) * 0.01;
    if (r < 0.06 && !neutral) {} else if (r < 0.06 + 0.94 * pH) hs += RNG.next() < 0.6 ? 3 : 6; else as += RNG.next() < 0.6 ? 3 : 6;
  }
  gameStats(home, hs, as); gameStats(away, as, hs);
  injuries(home); injuries(away);
  return { hs: hs, as: as };
}
function footballScore(x) { var bad = { 1: 0, 2: 3, 4: 3, 5: 6, 8: 7, 11: 10, 12: 13, 15: 14, 18: 17, 19: 20, 22: 21, 25: 24, 26: 27, 29: 28, 32: 31, 33: 34, 36: 35, 39: 38, 40: 41, 43: 42 }; return bad[x] != null ? bad[x] : x; }

function add(p, k, v) { p.s[k] = (p.s[k] || 0) + v; }
function gameStats(abbr, pts, ptsAgainst) {
  var qb = starters(abbr, 'QB')[0], rb = starters(abbr, 'RB'), wr = starters(abbr, 'WR'), te = starters(abbr, 'TE'), k = starters(abbr, 'K')[0];
  var lineup = [];
  ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DL', 'LB', 'CB', 'S', 'K', 'P'].forEach(function (pos) { lineup = lineup.concat(starters(abbr, pos)); });
  lineup.forEach(function (p) { add(p, 'g', 1); });
  var td = Math.max(0, Math.round(pts / 7.6 + RNG.normal() * 0.4));
  var fg = Math.max(0, Math.round((pts - td * 7) / 3));
  var passYds = Math.max(60, Math.round(205 + (qb ? (qb.ovr - 75) * 3 : -40) + (pts - 21) * 3 + RNG.normal() * 45));
  var rushYds = Math.max(20, Math.round(110 + (pts - 21) * 1.5 + RNG.normal() * 30));
  var passTd = Math.round(td * 0.62), rushTd = td - passTd;
  if (qb) {
    add(qb, 'pyd', passYds); add(qb, 'ptd', passTd);
    add(qb, 'int', RNG.next() < 0.55 - (qb.ovr - 70) * 0.012 ? (RNG.next() < 0.25 ? 2 : 1) : 0);
    add(qb, 'att', Math.round(passYds / 7.1));
  }
  var targets = [[wr[0], 0.27], [wr[1], 0.2], [te[0], 0.17], [wr[2], 0.12], [rb[0], 0.1]].filter(function (x) { return x[0]; });
  var tw = sumBy(targets, function (x) { return x[1]; });
  targets.forEach(function (x) {
    var share = x[1] / tw * (0.85 + RNG.next() * 0.3);
    add(x[0], 'rec', Math.round(passYds * share / 11.5)); add(x[0], 'ryd', Math.round(passYds * share));
  });
  for (var i = 0; i < passTd; i++) { var t = weighted(targets); if (t) add(t, 'rtd', 1); }
  if (rb[0]) { add(rb[0], 'car', Math.round(rushYds * 0.7 / 4.4)); add(rb[0], 'ruyd', Math.round(rushYds * 0.7)); add(rb[0], 'rutd', rushTd); }
  if (k) { add(k, 'fgm', fg); add(k, 'fga', fg + (RNG.next() < 0.3 ? 1 : 0)); }
  // defense: sacks/ints/tackles
  var rushers = starters(abbr, 'EDGE').map(function (p) { return [p, p.ovr / 30]; }).concat(starters(abbr, 'DL').map(function (p) { return [p, p.ovr / 60]; }));
  var sacks = Math.max(0, Math.round(2.4 + RNG.normal() * 1.3));
  for (var s = 0; s < sacks; s++) { var r = weighted(rushers); if (r) add(r, 'sk', 1); }
  var dbs = starters(abbr, 'CB').concat(starters(abbr, 'S')).map(function (p) { return [p, 1]; });
  var ints = RNG.next() < 0.6 ? RNG.int(1, 2) - (RNG.next() < 0.5 ? 1 : 0) : 0;
  for (var n = 0; n < ints; n++) { var d = weighted(dbs); if (d) add(d, 'dint', 1); }
  starters(abbr, 'LB').forEach(function (p) { add(p, 'tk', RNG.int(4, 10)); });
  starters(abbr, 'S').forEach(function (p) { add(p, 'tk', RNG.int(3, 7)); });
  starters(abbr, 'CB').forEach(function (p) { add(p, 'tk', RNG.int(2, 6)); });
}
function weighted(list) {
  var tot = sumBy(list, function (x) { return x[1]; }), r = RNG.next() * tot;
  for (var i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
  return list.length ? list[list.length - 1][0] : null;
}

function injuries(abbr) {
  roster(abbr).forEach(function (p) {
    if (p.inj || !(p.s.g)) return;
    var risk = 0.016 * (p.pos === 'RB' ? 1.5 : p.pos === 'K' || p.pos === 'P' || p.pos === 'LS' ? 0.2 : 1) * (p.age >= 31 ? 1.3 : 1);
    if (starters(abbr, p.pos).indexOf(p) < 0) risk *= 0.3;
    if (RNG.next() < risk) {
      var r = RNG.next();
      p.inj = r < 0.55 ? RNG.int(1, 2) : r < 0.85 ? RNG.int(3, 6) : r < 0.95 ? RNG.int(7, 10) : 99;
      p.injNote = p.inj === 99 ? 'Out for season' : 'Out ' + p.inj + ' wk';
      if (abbr === S.user || p.ovr >= 85) news(p.pos + ' ' + p.name + ' (' + abbr + ') injured: ' + (p.inj === 99 ? 'out for the season' : 'out ' + p.inj + ' week' + (p.inj > 1 ? 's' : '')) + '.', abbr);
    }
  });
}
function healInjuries() { S.players.forEach(function (p) { if (p.inj && p.inj < 99) { p.inj--; if (!p.inj) p.injNote = null; } }); }

function record(home, away, hs, as) {
  var H = S.teams[home].rec, A = S.teams[away].rec;
  H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
  var sd = TEAM[home].div === TEAM[away].div && TEAM[home].conf === TEAM[away].conf, sc = TEAM[home].conf === TEAM[away].conf;
  if (hs > as) { H.w++; A.l++; if (sd) { H.dw++; A.dl++; } if (sc) { H.cw++; A.cl++; } }
  else if (as > hs) { A.w++; H.l++; if (sd) { A.dw++; H.dl++; } if (sc) { A.cw++; H.cl++; } }
  else { H.t++; A.t++; }
}

function simWeek() {
  if (S.week >= WEEKS) return false;
  // options due this league year are exercised once games start
  if (S.week === 0) S.players.forEach(function (p) { if (p.team) Cap.exerciseOptions(p, S.year); });
  Object.keys(S.teams).forEach(function (a) { if (a !== S.user) autoDepth(a); });
  S.schedule[S.week].forEach(function (g) {
    var r = simGame(g.h, g.a);
    g.hs = r.hs; g.as = r.as;
    record(g.h, g.a, r.hs, r.as);
  });
  healInjuries();
  S.week++;
  return true;
}

// ---------- standings ----------
function pct(r) { var g = r.w + r.l + r.t; return g ? (r.w + r.t / 2) / g : 0; }
function standingSort(a, b) {
  var ra = S.teams[a].rec, rb = S.teams[b].rec;
  return (pct(rb) - pct(ra)) || ((rb.dw - rb.dl) - (ra.dw - ra.dl)) * 0 || ((rb.cw - rb.cl) - (ra.cw - ra.cl)) || ((rb.pf - rb.pa) - (ra.pf - ra.pa)) || (a < b ? -1 : 1);
}
function divisionStandings() {
  var out = [];
  ['AFC', 'NFC'].forEach(function (c) {
    ['East', 'North', 'South', 'West'].forEach(function (d) {
      out.push({ conf: c, div: d, teams: TEAMS.filter(function (t) { return t.conf === c && t.div === d; }).map(function (t) { return t.abbr; }).sort(standingSort) });
    });
  });
  return out;
}
function seeds(conf) {
  var divs = divisionStandings().filter(function (d) { return d.conf === conf; });
  var winners = divs.map(function (d) { return d.teams[0]; }).sort(standingSort);
  var rest = TEAMS.filter(function (t) { return t.conf === conf && winners.indexOf(t.abbr) < 0; }).map(function (t) { return t.abbr; }).sort(standingSort);
  return winners.concat(rest.slice(0, 3));
}

// ---------- playoffs ----------
function startPlayoffs() {
  S.playoffs = { round: 0, AFC: seeds('AFC'), NFC: seeds('NFC'), games: [], alive: {}, champ: null, elim: {} };
  ['AFC', 'NFC'].forEach(function (c) { S.playoffs[c].forEach(function (a) { S.playoffs.alive[a] = true; }); });
}
var ROUND_NAMES = ['Wild card', 'Divisional', 'Conference championship', 'Super Bowl'];
function simPlayoffRound() {
  var po = S.playoffs; if (!po || po.champ) return false;
  var games = [];
  if (po.round < 3) {
    ['AFC', 'NFC'].forEach(function (c) {
      var alive = po[c].filter(function (a) { return po.alive[a]; });
      var list = po.round === 0 ? alive.slice(1) : alive;   // #1 seed has a bye in the wild-card round
      for (var i = 0; i < list.length / 2; i++) games.push({ h: list[i], a: list[list.length - 1 - i], conf: c });
    });
  } else {
    var a = po.AFC.filter(function (x) { return po.alive[x]; })[0], n = po.NFC.filter(function (x) { return po.alive[x]; })[0];
    games.push({ h: a, a: n, neutral: true });
  }
  games.forEach(function (g) {
    var r = simGame(g.h, g.a, g.neutral);
    if (r.hs === r.as) r.hs += 3;
    g.hs = r.hs; g.as = r.as; g.round = po.round;
    var loser = r.hs > r.as ? g.a : g.h;
    po.alive[loser] = false; po.elim[loser] = po.round;
    po.games.push(g);
  });
  healInjuries();
  if (po.round === 3) {
    var last = po.games[po.games.length - 1];
    po.champ = last.hs > last.as ? last.h : last.a;
    news(TEAM[po.champ].name + ' win the Super Bowl (' + Math.max(last.hs, last.as) + '-' + Math.min(last.hs, last.as) + ').');
  }
  po.round++;
  return true;
}
