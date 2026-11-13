// Replay of a reported bug: new Patriots game (seed 42), sign Kevin Byard at his ask, auto-draft, exercise
// Drake Maye's option, auto-fill. The game must warn that the roster can't be filled, not stop silently.
// Run: node tests/roomfill.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON }; vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src/js')).sort())
  if (/^(00|10|20|30|40|50|60)-/.test(f)) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8').replace(/^if \(typeof module.*$/m, ''), ctx, { filename: f });
ctx.DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const run = c => vm.runInContext(c, ctx);
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };
const strip = h => String(h).replace(/<[^>]+>/g, '');

run('newGame(DATA, "NE", 42); reindex(); advance();');                 // re-sign window -> free agency
ok('in free agency', run('S.phase') === 'fa');

// room-needed figure on the hub and the cap screen
const rf0 = run('rosterFill(S.user)');
ok('room needed counts unsigned draft picks and open spots', rf0.picks === 7 && rf0.open === 53 - rf0.have - 7 && rf0.need === rf0.pickCost + rf0.minCost, JSON.stringify(rf0));
ok('hub shows "Room needed to fill 53"', /Room needed to fill 53/.test(strip(run('VIEWS.hub()'))));
ok('cap screen shows "Room needed to fill 53"', /Room needed to fill 53/.test(strip(run('VIEWS.cap()'))));

// the offer screen warns before the user signs Byard at his ask
const byard = run('S.players.filter(function(p){return p.name==="Kevin Byard"})[0].id');
const offerText = strip(run(`(function(){ var id = "${byard}"; UI.offer = null; var m = offerModal(id, 'sign'); UI.modal = m;
  return m(); })()`));
const shortMsg = offerText.match(/This leaves you (\S+) short of filling your roster/);
ok('offer screen warns: "This leaves you $X short of filling your roster"', !!shortMsg, offerText.slice(0, 300));
console.log('  offer warning:', shortMsg ? shortMsg[0] : '(none)');
const signed = run(`(function(){ var p = P("${byard}"), d = Market.demand(p, marketCap(), S.year);
  var off = { years: d.years, total: d.apy * d.years, bonus: Math.round(d.gtd * 0.5), gtd: d.gtd };
  return Market.evaluate(p, off, offerCtx(p, S.user)).accept && sign(p, S.user, off).ok; })()`);
ok('Byard signs at his ask', signed);

// rest of free agency, auto-draft, exercise Maye's option, leave the draft
run('while (S.phase === "fa") advance(); draftUntilUser(true);');
const maye = run('S.players.filter(function(p){return p.name==="Drake Maye"})[0].id');
ok('option exercised', run(`decideFifthYear(P("${maye}"), true).ok`));
run('advance();');
ok('in preseason', run('S.phase') === 'preseason');

// auto-fill can't reach 53: it says so and offers ways to make room
const ar = run('userAutoRoster()');
console.log('  auto-fill:', ar.msg, '(' + run('roster(S.user).length') + ' players, ' + run('fmtM(fullSpace(S.user))') + ' room)');
ok('auto-fill reports the shortfall ("Couldn\'t fill N spots: $X short")', ar.missing > 0 && /^Couldn't fill \d+ spots?: \$[\d.]+[MK] short\.$/.test(ar.msg), ar.msg);
const mr = run('makeRoomOptions(S.user)');
ok('restructure or cut options offered', mr.restructures.length + mr.cuts.length > 0);
ok('make-room screen lists them', /Restructures/.test(strip(run('makeRoomModal()()'))) && /Cut options/.test(strip(run('makeRoomModal()()'))));
const todo = strip(run('VIEWS.hub()'));
ok('preseason to-do warns the roster is under 53', /Roster is under 53/.test(todo), todo.slice(0, 400));

// and following the advice works: restructure the best option, then auto-fill again
const best = mr.restructures[0];
if (best) {
  run(`restructurePlayer(P("${best.p.id}"), Cap.restructureMax(P("${best.p.id}"), S.year, P("${best.p.id}").exp))`);
  const ar2 = run('userAutoRoster()');
  console.log('  after restructuring ' + best.p.name + ':', ar2.msg);
  ok('restructure lets auto-fill get closer to 53', ar2.missing < ar.missing);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
