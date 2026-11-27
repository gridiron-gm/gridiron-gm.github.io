// Which screens are usable in each part of the NFL year. Four destinations: Home, Team, Moves, League.
//   Home:   always
//   Team:   Roster, Depth chart, Cap (always)
//   Moves:  only what the phase allows
//             re-sign window:  Re-sign, Trade
//             free agency:     Free agency, Trade
//             draft:           Draft, Trade
//             final cuts:      Make room, Free agency, Trade (only if the automatic cutdown after the draft got stuck)
//             regular season:  Trade until the deadline (after week 9), Free agency all season
//             playoffs:        nothing (no trades)
//   League: Standings, Schedule, Leaders, News, History, plus the Bracket in the playoffs and the read-only
//           Draft prospects board from late in the regular season until the draft starts.
var ALWAYS_SCREENS = ['hub', 'roster', 'depth', 'cap', 'league'];
var TEAM_SCREENS = ['roster', 'depth', 'cap'];
var MOVE_SCREENS = ['resign', 'fa', 'trade', 'draft', 'cuts'];
var LEAGUE_SCREENS = ['standings', 'schedule', 'leaders', 'news', 'history'];
var DESTINATIONS = [['home', 'Home'], ['team', 'Team'], ['moves', 'Moves'], ['league', 'League']];
var PROSPECTS_WEEK = 12;          // the prospects board opens once this many regular-season weeks are played
var SCREEN_LABEL = { hub: 'Home', roster: 'Roster', depth: 'Depth chart', cap: 'Cap', league: 'League', resign: 'Re-sign', fa: 'Free agency',
  draft: 'Draft', prospects: 'Prospects', cuts: 'Make room', trade: 'Trade', bracket: 'Bracket', moves: 'Moves',
  standings: 'Standings', schedule: 'Schedule', leaders: 'Leaders', news: 'News', history: 'History' };

// week = regular-season games played (S.week). Trades stay open through week 9 (the engine blocks week > 9).
function phaseScreens(phase, week) {
  week = week || 0;
  switch (phase) {
    case 'resign': return ['resign', 'trade', 'prospects'];
    case 'fa': return ['fa', 'trade', 'prospects'];
    case 'draft': return ['draft', 'trade'];
    case 'preseason': return ['cuts', 'fa', 'trade'];
    case 'season': return (week <= TRADE_DEADLINE_WEEK ? ['trade'] : []).concat(['fa'], week >= PROSPECTS_WEEK ? ['prospects'] : []);
    case 'playoffs': return ['bracket', 'prospects'];
  }
  return [];
}
function screensFor(phase, week) { return ALWAYS_SCREENS.concat(phaseScreens(phase, week)); }
function movesFor(phase, week) { var ph = phaseScreens(phase, week); return MOVE_SCREENS.filter(function (v) { return ph.indexOf(v) >= 0; }); }
function leagueFor(phase, week) { var ph = phaseScreens(phase, week); return LEAGUE_SCREENS.concat(['bracket', 'prospects'].filter(function (v) { return ph.indexOf(v) >= 0; })); }
// the destination a screen belongs to
function destOf(v) {
  if (v === 'hub' || v === 'home') return 'home';
  if (TEAM_SCREENS.indexOf(v) >= 0) return 'team';
  if (MOVE_SCREENS.indexOf(v) >= 0 || v === 'moves') return 'moves';
  return 'league';
}
function screenOpen(v, phase, week) {
  if (!S) return false;
  phase = phase || S.phase; week = week == null ? S.week : week;
  if (v === 'hub' || v === 'home' || v === 'league' || TEAM_SCREENS.indexOf(v) >= 0 || LEAGUE_SCREENS.indexOf(v) >= 0) return true;
  if (v === 'moves') return movesFor(phase, week).length > 0;
  return phaseScreens(phase, week).indexOf(v) >= 0;
}
function tradeOpen() { return screenOpen('trade'); }
function signingOpen() { return screenOpen('fa') || screenOpen('resign'); }

// Season timeline: five parts of the year. The final cutdown after the draft is part of the draft step.
var TIMELINE = [['resign', 'Re-sign'], ['fa', 'Free agency'], ['draft', 'Draft'], ['season', 'Regular season'], ['playoffs', 'Playoffs']];
var OPENS_AFTER = { resign: 'Opens after the Super Bowl', fa: 'Opens after the re-sign window', draft: 'Opens after free agency',
  season: 'Opens after the draft and final cuts', playoffs: 'Opens after week ' + WEEKS };
function timelineStep(phase) { return phase === 'preseason' ? 'draft' : phase; }
function timeline(phase, week) {
  var i = TIMELINE.map(function (t) { return t[0]; }).indexOf(timelineStep(phase));
  return TIMELINE.map(function (t, j) {
    var state = j === i ? 'now' : j === (i + 1) % TIMELINE.length ? 'next' : j < i ? 'done' : 'later';
    var sub = state === 'now' ? nowDetail(phase, week) : state === 'done' ? 'Done' : OPENS_AFTER[t[0]];
    return { key: t[0], label: t[1], state: state, sub: sub };
  });
}
function nowDetail(phase, week) {
  if (phase === 'season') return week >= WEEKS ? 'Regular season over' : 'Week ' + (week + 1) + (week <= TRADE_DEADLINE_WEEK ? ' · deadline after wk ' + TRADE_DEADLINE_WEEK : ' · deadline passed');
  if (phase === 'fa' && S) return 'Day ' + (S.faDay + 1) + ' of ' + FA_DAYS;
  if (phase === 'preseason') return 'Final cuts';
  if (phase === 'playoffs' && S && S.playoffs) return S.playoffs.champ ? 'Complete' : ROUND_NAMES[S.playoffs.round];
  return 'Now';
}
// The draft-prospects board shows the class for the next draft: this year's before the draft, next year's in season.
function prospectsYear() { return S.phase === 'season' || S.phase === 'playoffs' ? S.year + 1 : S.year; }
