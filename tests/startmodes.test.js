// The two starts: "Continue from this week" (real 2026 results to date) and "Start of 2026, week 1".
// Checks every team is valid at the start, records and stats match the real data, week-1 rosters come from
// the week-1 file, nothing from 2026 leaks into week-1 ratings, and the season plays out.
// Run: node tests/startmodes.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const RAW = path.join(__dirname, '../data/raw');
const split = line => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const csv = f => { const [h, ...rows] = fs.readFileSync(path.join(RAW, f), 'utf8').trim().split('\n'); const H = split(h); return rows.map(r => { const v = split(r); const o = {}; H.forEach((k, i) => o[k] = v[i]); return o; }); };
const FIX = { LAR: 'LA', JAC: 'JAX', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LA' }, fix = t => FIX[t] || t;
function game(file, mode, team, seed) {
  const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
    if (/^(00|05|10|20|30|40|50|55)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
  ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
  const run = c => vm.runInContext(c, ctx);
  run(`newGame(DATA, "${team}", ${seed}, "${mode}"); reindex();`);
  return run;
}
const valid = run => run(`TEAMS.map(function (t) { var r = roster(t.abbr); return { t: t.abbr, n: r.length, room: fullSpace(t.abbr),
  starters: POSITIONS.filter(function (pos) { return pos !== 'LS' && starters(t.abbr, pos).length === 0 && !roster(t.abbr).some(function (p) { return p.pos === pos; }); }),
  noYear: r.filter(function (p) { return !Cap.row(p, S.year); }).length, noNum: r.filter(function (p) { return p.num == null; }).length }; })`);

// ---------- mode 1: continue from this week ----------
{
  const run = game('data.json', 'current', 'NE', 42);
  const meta = run('BASE.season');
  console.log(`mode 1: real results through week ${meta.realWeek} (${meta.realGames} games)`);
  ok('mode 1: the 2026 regular season, at the current week', run('S.year') === 2026 && run('S.phase') === 'season' && run('S.week') === meta.realWeek && meta.realWeek >= 1);
  const v = valid(run);
  ok('mode 1: all 32 teams have 53 players', v.every(t => t.n === 53), v.filter(t => t.n !== 53).map(t => t.t + ' ' + t.n).join(', '));
  ok('mode 1: all 32 teams are under the 2026 cap', v.every(t => t.room >= 0), v.filter(t => t.room < 0).map(t => t.t).join(', '));
  ok('mode 1: every player on a roster has a 2026 contract and a jersey number', v.every(t => t.noYear === 0 && t.noNum === 0));
  ok('mode 1: the 2026 cap is the real $301.2M', run('capOf(2026)') === 301200);
  // records and points: recomputed straight from nflverse games.csv when the raw file is here (else from the data's copy)
  let games;
  if (fs.existsSync(path.join(RAW, 'games.csv'))) games = csv('games.csv').filter(g => g.season === '2026' && g.game_type === 'REG' && g.result !== 'NA' && g.result !== '').map(g => [fix(g.away_team), fix(g.home_team), +g.away_score, +g.home_score]);
  else games = meta.games.filter(g => g.length === 5).map(g => [g[1], g[2], g[3], g[4]]);
  const want = {}; const W = t => want[t] = want[t] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  games.forEach(([a, h, as, hs]) => { W(a).pf += as; W(a).pa += hs; W(h).pf += hs; W(h).pa += as; if (as > hs) { W(a).w++; W(h).l++; } else if (hs > as) { W(h).w++; W(a).l++; } else { W(a).t++; W(h).t++; } });
  const got = run('(function(){ var o = {}; TEAMS.forEach(function (t) { var r = S.teams[t.abbr].rec; o[t.abbr] = { w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa }; }); return o; })()');
  const wrong = Object.keys(want).filter(t => JSON.stringify(want[t]) !== JSON.stringify(got[t]));
  ok(`mode 1: every team's record and points match the real results (${games.length} games)`, wrong.length === 0 && Object.keys(want).length === 32, wrong.map(t => t + ' ' + JSON.stringify(got[t]) + ' vs ' + JSON.stringify(want[t])).join('; '));
  console.log('  Patriots ' + got.NE.w + '-' + got.NE.l + (got.NE.t ? '-' + got.NE.t : '') + ', ' + got.NE.pf + '-' + got.NE.pa + ' points');
  // stats to date
  if (fs.existsSync(path.join(RAW, 'stats_player_reg_2026.csv'))) {
    const st = csv('stats_player_reg_2026.csv').filter(r => r.player_display_name === 'Drake Maye')[0];
    ok('mode 1: player stats to date are the real ones (Maye passing yards)', st && run('S.players.filter(function(p){return p.name==="Drake Maye"})[0].s.pyd') === Math.round(+st.passing_yards));
  }
  ok('mode 1: injured-reserve players are off the 53 but on the cap', run('S.players.filter(function(p){ return p.ir; }).length') > 100 && run('(function(){ var p = S.players.filter(function(p){ return p.ir && Cap.capHit(p, S.year) > 1000; })[0]; return !!p && Cap.teamCommitted(S.players, T(p.team), S.year, false) >= Cap.capHit(p, S.year) && roster(p.team).indexOf(p) < 0; })()'));
  ok('mode 1: trades are closed (deadline passed), free agency open', run('S.week > TRADE_DEADLINE_WEEK') && !run('tradeOpen()') && run('screenOpen("fa")'));
  const realBefore = run('JSON.stringify(S.schedule.map(function (w) { return w.filter(function (g) { return g.real; }).map(function (g) { return g.h + g.hs + g.a + g.as; }); }))');
  run('while (S.phase === "season") advance();');
  ok('mode 1: the season finishes: 17 games each, then the playoffs', run('S.phase') === 'playoffs' && run('TEAMS.every(function (t) { var r = S.teams[t.abbr].rec; return r.w + r.l + r.t === 17; })'));
  ok('mode 1: real results were never re-simulated', run('JSON.stringify(S.schedule.map(function (w) { return w.filter(function (g) { return g.real; }).map(function (g) { return g.h + g.hs + g.a + g.as; }); }))') === realBefore);
  run('while (S.phase !== "resign") advance();');
  ok('mode 1: then the 2027 offseason, with full control', run('S.phase') === 'resign' && run('S.year') === 2027 && !run('S.autopilot'));
  ok('mode 1: 2027 draft order comes from the 2026 standings', run('S.lastOrder.length') === 32);
}

// ---------- mode 2: start of 2026, week 1 ----------
{
  const run = game('data_w1.json', 'week1', 'NE', 7);
  ok('mode 2: the 2026 regular season at week 1, everyone 0-0', run('S.year') === 2026 && run('S.week') === 0 && run('TEAMS.every(function (t) { var r = S.teams[t.abbr].rec; return r.w + r.l + r.t === 0; })'));
  const v = valid(run);
  ok('mode 2: all 32 teams have 53 players', v.every(t => t.n === 53), v.filter(t => t.n !== 53).map(t => t.t + ' ' + t.n).join(', '));
  ok('mode 2: all 32 teams are under the 2026 cap', v.every(t => t.room >= 0));
  ok('mode 2: every player on a roster has a 2026 contract and a jersey number', v.every(t => t.noYear === 0 && t.noNum === 0));
  ok('mode 2: no real 2026 results or stats', run('S.schedule.every(function (w) { return w.every(function (g) { return g.hs == null; }); })') && run('S.players.every(function (p) { return !p.s || !p.s.g; })'));
  ok('mode 2: ratings use 2024-25 only (no 2026 stat lines anywhere)', run('DATA.players.every(function (p) { return !(p.lines || []).some(function (l) { return l[0] === 2026; }); })'));
  // rosters: each team's players are its real week-1 roster (from the week-1 weekly file when the raw file is here)
  if (fs.existsSync(path.join(RAW, 'roster_weekly_2026.csv'))) {
    const w1 = {}; csv('roster_weekly_2026.csv').filter(r => r.week === '1' && ['ACT', 'INA', 'RES'].includes(r.status)).forEach(r => { w1[r.gsis_id] = fix(r.team); });
    const off = run('S.players.filter(function (p) { return p.team && !p.gen; }).map(function (p) { return [p.id, p.team]; })').filter(([id, t]) => w1[id] !== t);
    ok('mode 2: every rostered player was on that team in week 1', off.length === 0, off.slice(0, 5).join(' '));
    const ne = run('roster("NE").filter(function (p) { return !p.gen; }).length');
    console.log(`  Patriots week-1 roster: ${ne} real players + ${53 - ne} depth fill-ins (players with no contract in the data)`);
  }
  ok('mode 2: trades open until the week-9 deadline', run('tradeOpen()'));
  run('while (S.week < 10) advance();');
  ok('mode 2: and closed after it', !run('tradeOpen()'));
  run('while (S.phase !== "resign") advance();');
  ok('mode 2: a full season, then the 2027 offseason', run('S.year') === 2027 && run('S.history.length') === 1);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
