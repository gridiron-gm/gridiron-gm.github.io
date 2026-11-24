// Which screens are usable in each part of the NFL year. Locked screens disappear from the navigation.
//   Always:          Hub, Roster, Depth chart, Cap, League (standings, schedule, leaders, news, history)
//   Re-sign window:  + Re-sign, Trade
//   Free agency:     + Free agency, Trade
//   Draft:           + Draft, Trade
//   Preseason:       + Free agency (late market), Make room / cutdowns, Trade
//   Regular season:  + Trade until the deadline (after week 9), Free agency all season
//   Playoffs:        + Playoff bracket (no trades)
//   Draft prospects (read-only board): from late in the regular season until the draft starts.
var ALWAYS_SCREENS = ['hub', 'roster', 'depth', 'cap', 'league'];
var LEAGUE_SCREENS = ['standings', 'schedule', 'leaders', 'news', 'history'];
var PROSPECTS_WEEK = 12;          // the prospects board opens once this many regular-season weeks are played
var SCREEN_LABEL = { hub: 'Hub', roster: 'Roster', depth: 'Depth chart', cap: 'Cap', league: 'League', resign: 'Re-sign', fa: 'Free agency',
  draft: 'Draft', prospects: 'Draft prospects', cuts: 'Make room', trade: 'Trade', bracket: 'Playoffs',
  standings: 'Standings', schedule: 'Schedule', leaders: 'Leaders', news: 'News', history: 'History' };

// week = regular-season games played (S.week). Trades stay open through week 9 (the engine blocks week > 9).
function phaseScreens(phase, week) {
  week = week || 0;
  switch (phase) {
    case 'resign': return ['resign', 'trade', 'prospects'];
    case 'fa': return ['fa', 'trade', 'prospects'];
    case 'draft': return ['draft', 'trade'];
    case 'preseason': return ['fa', 'cuts', 'trade'];
    case 'season': return (week <= TRADE_DEADLINE_WEEK ? ['trade'] : []).concat(['fa'], week >= PROSPECTS_WEEK ? ['prospects'] : []);
    case 'playoffs': return ['bracket', 'prospects'];
  }
  return [];
}
function screensFor(phase, week) { return ALWAYS_SCREENS.concat(phaseScreens(phase, week)); }
function navTab(v) { return LEAGUE_SCREENS.indexOf(v) >= 0 ? 'league' : v; }
function screenOpen(v, phase, week) {
  if (!S) return false;
  return screensFor(phase || S.phase, week == null ? S.week : week).indexOf(navTab(v)) >= 0;
}
function tradeOpen() { return screenOpen('trade'); }
function signingOpen() { return screenOpen('fa') || screenOpen('resign'); }

// Season timeline: the six parts of the year, the current one, and when each later one opens.
var TIMELINE = [['resign', 'Re-sign'], ['fa', 'Free agency'], ['draft', 'Draft'], ['preseason', 'Preseason'], ['season', 'Regular season'], ['playoffs', 'Playoffs']];
var OPENS_AFTER = { resign: 'Opens after the Super Bowl', fa: 'Opens after the re-sign window', draft: 'Opens after free agency',
  preseason: 'Opens after the draft', season: 'Opens after the preseason', playoffs: 'Opens after week ' + WEEKS };
function timeline(phase, week) {
  var i = PHASES.indexOf(phase);
  return TIMELINE.map(function (t, j) {
    var state = j === i ? 'now' : j === (i + 1) % TIMELINE.length ? 'next' : j < i ? 'done' : 'later';
    var sub = state === 'now' ? nowDetail(phase, week) : state === 'done' ? 'Done' : OPENS_AFTER[t[0]];
    return { key: t[0], label: t[1], state: state, sub: sub };
  });
}
function nowDetail(phase, week) {
  if (phase === 'season') return week >= WEEKS ? 'Regular season over' : 'Week ' + (week + 1) + (week <= TRADE_DEADLINE_WEEK ? ' · deadline after wk ' + TRADE_DEADLINE_WEEK : ' · deadline passed');
  if (phase === 'fa' && S) return 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS;
  if (phase === 'playoffs' && S && S.playoffs) return S.playoffs.champ ? 'Complete' : ROUND_NAMES[S.playoffs.round];
  return 'Now';
}
// The draft-prospects board shows the class for the next draft: this year's before the draft, next year's in season.
function prospectsYear() { return S.phase === 'season' || S.phase === 'playoffs' ? S.year + 1 : S.year; }
