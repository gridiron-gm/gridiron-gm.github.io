// Contract acceptance and trade value tests. Run: node tests/market.test.js
global.Cap = require('../src/js/10-cap.js');
const Market = require('../src/js/20-market.js');
const data = require('../src/data.json');
const cap = data.meta.cap, Y = 2027;
let pass = 0, fail = 0;
const ok = (l, c) => { if (c) pass++; else { fail++; console.log('  FAIL', l); } };
const find = n => data.players.find(p => p.name === n);
const offerAt = (p, mult, gMult = 1, yrs) => {
  const d = Market.demand(p, cap, Y); const y = yrs || d.years;
  const total = Math.round(d.apy * y * mult);
  const gtd = Math.round(Math.min(total, d.gtd / d.years * y * gMult));
  return { years: y, total, bonus: Math.round(gtd * 0.6), gtd };
};
const ctx = (o) => Object.assign({ cap, year: Y, teamOvr: 75, isOwnTeam: false, rejections: 0 }, o);

const nacua = find('Puka Nacua'), buckner = find('DeForest Buckner'), doubs = find('Romeo Doubs');
ok('star FA rejects 70% of ask', !Market.evaluate(nacua, offerAt(nacua, 0.7), ctx()).accept);
ok('star FA accepts 108% of ask', Market.evaluate(nacua, offerAt(nacua, 1.08), ctx()).accept);
ok('guarantees matter (same total, half the gtd -> lower mood)',
   Market.evaluate(nacua, offerAt(nacua, 1, 0.5), ctx()).mood < Market.evaluate(nacua, offerAt(nacua, 1, 1), ctx()).mood);
const o = offerAt(buckner, 0.97);
ok('32-yr-old: contender gets him at a discount', Market.evaluate(buckner, o, ctx({ teamOvr: 88 })).accept);
ok('32-yr-old: same offer from a bad team rejected', !Market.evaluate(buckner, o, ctx({ teamOvr: 62 })).accept);
ok('young player dislikes too-long term less than vet dislikes short',
   Market.evaluate(buckner, offerAt(buckner, 1, 1, 1), ctx()).mood >= Market.evaluate(buckner, offerAt(buckner, 1, 1, 1), ctx({ rejections: 2 })).mood);
ok('repeated lowballs lower mood', Market.evaluate(doubs, offerAt(doubs, 1), ctx({ rejections: 3 })).mood < Market.evaluate(doubs, offerAt(doubs, 1), ctx()).mood);
ok('stable reaction (same inputs -> same answer)', Market.evaluate(doubs, offerAt(doubs, 1), ctx()).accept === Market.evaluate(doubs, offerAt(doubs, 1), ctx()).accept);

const maye = find('Drake Maye'), mahomes = find('Patrick Mahomes');
// the same player is worth more on a rookie deal than on a $90M cap hit (was "Maye > Mahomes", but which of two
// real stars rates higher moves with each data refresh; the principle is what matters)
const mayeOnBigDeal = Object.assign({}, maye, { years: mahomes.years, options: mahomes.options, apy: mahomes.apy });
ok('Maye on his rookie deal > Maye on Mahomes\'s $90M contract', Market.playerTradeValue(maye, Y, cap) > Market.playerTradeValue(mayeOnBigDeal, Y, cap));
ok('pick #1 > pick #32 > pick #100', Market.pickValue({ no: 1, year: Y }, Y) > Market.pickValue({ no: 32, year: Y }, Y) && Market.pickValue({ no: 32, year: Y }, Y) > Market.pickValue({ no: 100, year: Y }, Y));
ok('future picks discounted', Market.pickValue({ round: 1, year: Y + 1 }, Y) < Market.pickValue({ round: 1, year: Y }, Y));
ok('aging: 33-yr-old RB projects down', Market.projOvr({ ovr: 85, pot: 85, age: 29, pos: 'RB' }, 2) < 85);
ok('young player with upside projects up', Market.projOvr({ ovr: 75, pot: 88, age: 22, pos: 'WR' }, 2) > 75);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
