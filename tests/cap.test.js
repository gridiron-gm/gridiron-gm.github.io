// Cap engine tests. Run: node tests/cap.test.js
const fs = require('fs');
const path = require('path');
const Cap = require('../src/js/10-cap.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data.json'), 'utf8'));
const otc = JSON.parse(fs.readFileSync(path.join(__dirname, 'otc_reference.json'), 'utf8'));
const byId = Object.fromEntries(data.players.map(p => [p.id, p]));
const Y = 2027;

let pass = 0, fail = 0;
function eq(label, got, want, tol = 1) {   // $K, tolerance 1K for rounding of $M source data
  if (Math.abs(got - want) <= tol) { pass++; }
  else { fail++; console.log('  FAIL', label, 'got', got, 'want', want); }
}
function ok(label, cond) { if (cond) pass++; else { fail++; console.log('  FAIL', label); } }
const M = k => '$' + (k / 1000).toFixed(2) + 'M';

// ---------- 1. Dead money vs OverTheCap ----------
console.log('\nDead money and cap savings vs OverTheCap, 2027 league year');
const rows = [];
for (const [name, ref] of Object.entries(otc)) {
  const p = byId[ref.gsis];
  ok(name + ' in data', !!p);
  if (!p) continue;
  const K = v => Math.round(v / 1000);
  const cutPre = Cap.releaseCost(p, Y, false), cutPost = Cap.releaseCost(p, Y, true);
  const trPre = Cap.tradeCost(p, Y, false), trPost = Cap.tradeCost(p, Y, true);
  const cases = [
    ['Cut pre-June 1', cutPre.dead[Y], cutPre.savings, ref.dead.cut, ref.savings.cut],
    ['Cut post-June 1', cutPost.dead[Y], cutPost.savings, ref.dead.june_1_cut, ref.savings.june_1_cut],
    ['Trade pre-June 1', trPre.dead[Y], trPre.oldSavings, ref.dead.trade, ref.savings.trade],
    ['Trade post-June 1', trPost.dead[Y], trPost.oldSavings, ref.dead.june_1_trade, ref.savings.june_1_trade],
  ];
  for (const [kind, dead, sav, rDead, rSav] of cases) {
    eq(`${name} ${kind} dead`, dead, K(rDead), 2);
    eq(`${name} ${kind} savings`, sav, K(rSav), 2);
    rows.push({ name, kind, ours: M(dead), otc: M(K(rDead)), ourSav: M(sav), otcSav: M(K(rSav)),
                match: Math.abs(dead - K(rDead)) <= 2 && Math.abs(sav - K(rSav)) <= 2 });
  }
  // post-June 1 leftovers land in 2028
  const left28 = Cap.remaining(p, Y).slice(1).reduce((s, r) => s + r.pro, 0);
  eq(`${name} post-June 1 cut 2028 dead`, cutPost.dead[Y + 1] || 0, left28);
}
console.table(rows);
fs.writeFileSync(path.join(__dirname, 'otc_comparison.json'), JSON.stringify(rows, null, 1));

// ---------- 1b. Option bonuses and void years (Josh Allen) ----------
console.log('Option exercise and void years (Josh Allen)');
{
  const a = JSON.parse(JSON.stringify(byId[otc['Josh Allen'].gsis]));
  const capBefore = a.years.map(r => r.cap);
  const deadBefore = Cap.releaseCost(a, Y, false).dead[Y];
  ok('2027 option pending', a.options.some(o => o.y === Y));
  Cap.exerciseOptions(a, Y);
  ok('cap numbers unchanged by exercise', a.years.every((r, i) => r.cap === capBefore[i]));
  eq('pre-June 1 dead unchanged after exercise ($147.74M)', Cap.releaseCost(a, Y, false).dead[Y], deadBefore);
  eq('guaranteed option left gtd (2027 gtd = base)', a.years[0].gtd, a.years[0].base);
  ok('void year flagged', a.years[a.years.length - 1].void === true);
  eq('yearsLeft ignores void years', Cap.yearsLeft(a, Y), 4);
  // run the contract out: in the void year, leftover proration accelerates
  const voidY = a.years[a.years.length - 1].y;
  for (let y = Y + 1; y < voidY; y++) Cap.exerciseOptions(a, y);
  ok('void acceleration > 0 once only void years remain', Cap.voidAcceleration(a, voidY) > 0);
}

// ---------- 2. Contract construction ----------
console.log('Contract construction');
{
  const c = Cap.buildContract({ years: 4, total: 120000, bonus: 40000, gtd: 70000 }, 2027, 5);
  ok('4 years', c.length === 4);
  eq('total cash = total', c.reduce((s, r) => s + r.base + r.pro, 0), 120000);
  ok('bonus prorated evenly', c.every(r => r.pro === 10000));
  eq('guarantees = gtd - bonus', c.reduce((s, r) => s + r.gtd, 0), 30000);
  ok('guarantees front-loaded', c[0].gtd === c[0].base && c[3].gtd === 0);
  ok('salary escalates', c[0].base < c[3].base);
  ok('cap = base + pro', c.every(r => r.cap === r.base + r.pro));
  ok('all data rows: cap = parts', data.players.every(p => p.years.every(r => r.cap === r.base + r.pro + (r.opt||0) + r.roster + r.other)));

  const long = Cap.buildContract({ years: 7, total: 210000, bonus: 50000, gtd: 50000 }, 2027, 3);
  ok('bonus proration capped at 5 years', long.filter(r => r.pro > 0).length === 5);
  eq('7-yr bonus fully allocated', long.reduce((s, r) => s + r.pro, 0), 50000);

  const cheap = Cap.buildContract({ years: 3, total: 100, bonus: 0, gtd: 0 }, 2027, 0);
  ok('league minimum enforced', cheap.every((r, i) => r.base >= Cap.minSalary(i, 2027 + i)));

  // release of a contract we just built: pre-June 1 dead = all remaining bonus + remaining guarantees
  const p = { years: c, exp: 5 };
  const rc = Cap.releaseCost(p, 2027, false);
  eq('new deal cut yr1: dead = 40M bonus + 30M gtd', rc.dead[2027], 70000);
  const rc2 = Cap.releaseCost(p, 2029, false);
  eq('cut in yr3: 2 yrs bonus left, no gtd', rc2.dead[2029], 20000);
  const rc3 = Cap.releaseCost(p, 2029, true);
  eq('post-June 1 in yr3: 10M now', rc3.dead[2029], 10000);
  eq('post-June 1 in yr3: 10M next year', rc3.dead[2030], 10000);
}

// ---------- 3. Extensions ----------
console.log('Extension on a real contract (Christian Gonzalez)');
{
  const g = byId[otc['Christian Gonzalez'].gsis];
  const before = Cap.remaining(g, Y);
  const ext = Cap.buildExtension(g, { years: 5, total: 150000, bonus: 45000, gtd: 90000 }, Y);
  const oldPro = before.reduce((s, r) => s + r.pro, 0);
  const extPro = ext.reduce((s, r) => s + r.pro, 0);
  eq('old proration kept + new bonus', extPro, oldPro + 45000);
  ok('extension runs 5 years', ext.length === 5 && ext[0].y === Y);
  ok('every row cap = parts', ext.every(r => r.cap === r.base + r.pro + (r.opt||0) + r.roster + r.other));
}

// ---------- 4. Team cap, dead money, rollover ----------
console.log('Team cap, dead money, rollover (Patriots)');
{
  const players = data.players.map(p => Object.assign({}, p));
  const ne = { abbr: 'NE', capBase: { 2027: data.meta.cap, 2028: Cap.leagueCap(data.meta.cap, Y, 2028) }, dead: {}, rollover: {} };
  const committed = Cap.teamCommitted(players, ne, Y);
  const space0 = Cap.capSpace(players, ne, Y);
  eq('space = cap - committed', space0, data.meta.cap - committed);
  console.log('  NE 2027 committed', M(committed), ' approx. space', M(space0), ' (projected cap', M(data.meta.cap) + ')');

  const w = players.find(p => p.id === otc['Milton Williams'].gsis);
  const cost = Cap.releaseCost(w, Y, false);
  Cap.applyDead(ne, cost.dead);
  w.team = null; w.years = [];
  eq('cut Williams pre-June 1: space grows by savings', Cap.capSpace(players, ne, Y), space0 + cost.savings);
  console.log('  after cutting Milton Williams pre-June 1:', M(Cap.capSpace(players, ne, Y)), 'dead', M(Cap.teamDead(ne, Y)));

  const left = Cap.rollover(players, ne, Y);
  eq('rollover carries unused space', Cap.teamCap(ne, 2028), Cap.leagueCap(data.meta.cap, Y, 2028) + left);
}

// ---------- 5. Rookie scale ----------
console.log('Rookie scale');
{
  const r1 = Cap.rookieDeal(1, 2027, data.meta.cap), r32 = Cap.rookieDeal(32, 2027, data.meta.cap), r33 = Cap.rookieDeal(33, 2027, data.meta.cap), r200 = Cap.rookieDeal(200, 2027, data.meta.cap);
  console.log('  #1', M(r1.total), ' #32', M(r32.total), ' #33', M(r33.total), ' #200', M(r200.total));
  ok('scale decreases', r1.total > r32.total && r32.total > r33.total && r33.total > r200.total);
  ok('first-rounders fully guaranteed', r1.gtd === r1.total && r32.gtd === r32.total);
  ok('late picks near minimum', r200.total < 4 * Cap.minSalary(0, 2027) + 400);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
