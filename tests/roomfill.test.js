// Replay of a reported bug: new Patriots game (seed 42), sign Kevin Byard, auto-draft, exercise Drake Maye's
// option, auto-fill. The room-needed warning before signing must match what auto-fill actually ends up
// short, and auto-fill must say so (never stop silently or leave the team over the cap at week 1).
//   A: Byard $1.5M/yr under his ask -> no shortfall predicted, roster fills to 53, still under the cap
//   B: Byard at $2M/yr over his ask -> shortfall predicted, auto-fill reports the same shortfall
// Run: node tests/roomfill.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const strip = h => String(h).replace(/<[^>]+>/g, '');

function scenario(label, overAsk) {
  const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
    if (/^(00|05|10|20|30|40|50|55|6\d)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
  ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
  const run = c => vm.runInContext(c, ctx);
  console.log(label);
  run('newGame(DATA, "NE", 42); reindex(); advance();');
  ok(label + ': in free agency', run('S.phase') === 'fa');
  const rf0 = run('rosterFill(S.user)');
  ok(label + ': room needed = unsigned picks + open spots', rf0.picks === 7 && rf0.need === rf0.pickCost + rf0.minCost);
  ok(label + ': hub and cap screen show "Room needed to fill 53"', /Room needed to fill 53/.test(strip(run('VIEWS.hub()'))) && /Room needed to fill 53/.test(strip(run('VIEWS.cap()'))));

  // the offer, as the offer screen builds it
  const byard = run('S.players.filter(function(p){return p.name==="Kevin Byard"})[0].id');
  run(`var T_BY = P("${byard}"), T_D = Market.demand(T_BY, marketCap(), S.year);
       var T_OFF = { years: T_D.years, total: T_D.apy * T_D.years + ${overAsk} * T_D.years, bonus: Math.round(T_D.gtd * 0.5), gtd: T_D.gtd };
       UI.offer = { id: T_BY.id, mode: 'sign', years: T_OFF.years, total: T_OFF.total / 1000, bonus: T_OFF.bonus / 1000, gtd: T_OFF.gtd / 1000 };`);
  const offerText = strip(run('offerModal(T_BY.id, "sign")()'));
  const offerShort = run('offerShortfall(T_BY, "sign", Cap.buildContract(T_OFF, S.year, T_BY.exp)[0].cap)');
  const warn = offerText.match(/This leaves you (\S+) short of filling your roster/);
  ok(label + ': Byard signs', run('sign(T_BY, S.user, T_OFF).ok'));

  run('while (S.phase === "fa") advance(); draftUntilUser(true);');
  const maye = run('S.players.filter(function(p){return p.name==="Drake Maye"})[0].id');
  ok(label + ': Maye option exercised', run(`decideFifthYear(P("${maye}"), true).ok`));
  // leaving the draft runs final cuts automatically (auto-fill + cut to 53); it only stops if that falls short
  const r = run('advance()'), ar = r.auto;
  ok(label + ': final cuts ran on leaving the draft', !!ar && (r.ok ? run('S.phase') === 'season' : run('S.phase') === 'preseason' && r.cuts));
  const n = run('roster(S.user).length'), room = run('fullSpace(S.user)');
  console.log(`  offer warning: ${warn ? warn[0] : '(none)'} | auto-fill: ${ar.msg} (${n} players, ${run('fmtM(fullSpace(S.user))')} room at week-1 counting)`);
  ok(label + ': offer estimate matches the real auto-fill shortfall (within $100K)', Math.abs(offerShort - ar.short) <= 100, offerShort + ' vs ' + ar.short);
  ok(label + ': auto-fill never leaves the team over the cap at week 1', room >= 0, room);
  return { run, warn, ar, n };
}

// A: at his ask
const A = scenario('A: Byard $1.5M/yr under his ask (fits, with room to spare)', -1500);
ok('A: no shortfall warning on the offer', !A.warn);
ok('A: roster filled to 53', A.n === 53 && A.ar.missing === 0, A.ar.msg);
ok('A: no under-53 warning on the to-do list', !/Roster is under 53/.test(strip(A.run('VIEWS.hub()'))));

// B: $2M a year over his ask
const B = scenario('B: Byard at $2M/yr over his ask', 2000);
ok('B: offer screen warns "This leaves you $X short of filling your roster"', !!B.warn);
ok('B: auto-fill reports "Couldn\'t fill N spots: $X short"', B.ar.missing > 0 && /^Couldn't fill \d+ spots?: \$[\d.]+[MK] short\.$/.test(B.ar.msg), B.ar.msg);
ok('B: stopped at final cuts, Moves opens Make room', B.run('S.phase') === 'preseason' && B.run('screenOpen("cuts")'));
ok('B: final-cuts to-do warns the roster is under 53', /Roster is under 53/.test(strip(B.run('VIEWS.hub()'))));
const mr = B.run('makeRoomOptions(S.user)');
ok('B: make-room screen lists restructures and cuts', mr.restructures.length > 0 && mr.cuts.length > 0 && /Cut options/.test(strip(B.run('makeRoomModal()()'))));
ok('B: cut options never include players rated 80+', mr.cuts.every(x => x.p.ovr < 80));
const firstStarter = mr.cuts.findIndex(x => x.starter);
ok('B: starters come after every backup', firstStarter < 0 || mr.cuts.slice(firstStarter).every(x => x.starter));
const repl = B.run('Cap.minSalary(FILLER_PRICE_EXP, S.year)');
ok('B: each cut shows net room = savings - minimum-salary refill', mr.cuts.every(x => x.replacement === repl && x.net === x.saves - repl));
ok('B: cuts netting under $250K are hidden', mr.cuts.every(x => x.net >= 250));
ok('B: sorted by net room (backups, then starters)', mr.cuts.every((x, i, a) => i === 0 || a[i - 1].starter < x.starter || (a[i - 1].starter === x.starter && a[i - 1].net >= x.net)));
// the "N of these cuts" line: N = how many listed cuts, in order, it takes for net room to cover the shortfall
let cum = 0, n = 0; for (const x of mr.cuts) { if (cum >= mr.short) break; cum += x.net; n++; }
const expectN = cum >= mr.short ? n : null;
ok('B: cuts-needed count matches the net figures', mr.cutsNeeded === expectN, mr.cutsNeeded + ' vs ' + expectN);
const roomText = strip(B.run('makeRoomModal()()'));
const line = roomText.match(/You'd need (\d+) of these cuts to cover the \S+ shortfall\.|Even all \d+ of these cuts net only \S+, short of \S+: restructure first\./);
ok('B: make-room screen states how many cuts it would take', !!line && (expectN ? line[1] === String(expectN) : /Even all/.test(line[0])), roomText.slice(0, 600));
ok('B: restructures listed before cuts', roomText.indexOf('Restructures') < roomText.indexOf('Cut options'));
console.log('  ' + (line ? line[0] : '(no line)'));
console.log('  cut options:', mr.cuts.map(x => `${x.p.name} (${x.p.ovr}${x.starter ? ', starter' : ''}): saves ${B.run(`fmtM(${x.saves})`)} - refill ${B.run(`fmtM(${x.replacement})`)} = net ${B.run(`fmtM(${x.net})`)}`).join('; '));
const best = mr.restructures[0];
B.run(`restructurePlayer(P("${best.p.id}"), Cap.restructureMax(P("${best.p.id}"), S.year, P("${best.p.id}").exp))`);
const ar2 = B.run('userAutoRoster()');
console.log('  after restructuring ' + best.p.name + ': ' + ar2.msg);
ok('B: following the advice fills the roster', ar2.missing === 0 && B.run('fullSpace(S.user)') >= 0, ar2.msg);
const r2 = B.run('advance()');
ok('B: after making room, Continue starts week 1', r2.ok && B.run('S.phase') === 'season' && B.run('S.week') === 0 && B.run('roster(S.user).length') === 53);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
