// Quick start: the AI runs the whole offseason for every team (yours included) and you take over at week 1.
// Checks every team is at 53 and under the cap with every contract counted, and the recap is complete.
// Run: node tests/quickstart.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
for (const [team, seed] of [['NE', 42], ['NE', 7], ['KC', 123], ['DAL', 5]]) {
  const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
    if (/^(00|05|10|20|30|40|50|55)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
  ctx.DATA = data;
  const run = c => vm.runInContext(c, ctx);
  const t0 = Date.now();
  run(`newGame(DATA, "${team}", ${seed}); reindex(); var SUM = quickStart();`);
  const label = `${team} seed ${seed}`;
  const st = run(`({ phase: S.phase, week: S.week, auto: !!S.autopilot, sizes: TEAMS.map(function(t){ return roster(t.abbr).length; }),
    over: TEAMS.filter(function(t){ return fullSpace(t.abbr) < 0; }).map(function(t){ return t.abbr + ' ' + fmtM(fullSpace(t.abbr)); }),
    mine: fullSpace(S.user), nums: S.players.filter(function(p){ return p.team && p.num == null; }).length,
    drafted: SUM.drafted.length, picks: S.draft ? S.draft.made.filter(function(m){ return m.team === S.user; }).length : -1,
    opts: SUM.options.length, left: SUM.left.length, signed: SUM.signed.length + SUM.resigned.length })`);
  ok(`${label}: reaches week 1 of the regular season`, st.phase === 'season' && st.week === 0);
  ok(`${label}: you take over (autopilot off)`, !st.auto);
  ok(`${label}: all 32 teams at 53 players`, st.sizes.every(n => n === 53), st.sizes.join(','));
  ok(`${label}: all 32 teams under the cap with every contract counted`, st.over.length === 0, st.over.join('; '));
  ok(`${label}: everyone on a roster has a jersey number`, st.nums === 0, st.nums);
  ok(`${label}: recap lists all your draft picks`, st.drafted === st.picks && st.drafted > 0, st.drafted + ' vs ' + st.picks);
  ok(`${label}: recap covers comings and goings`, st.left > 0 && st.signed > 0);
  console.log(`  ${label}: week 1 in ${Date.now() - t0} ms; recap: ${st.drafted} picks, ${st.signed} signed, ${st.left} left, ${st.opts} option decisions; your room ${run('fmtM(fullSpace(S.user))')}`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
