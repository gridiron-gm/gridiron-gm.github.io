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
// restructures: OverTheCap's "restructure" column = cap saved this year by converting all but the
// minimum of base + roster + workout bonus into a bonus prorated over the remaining years (max 5)
for (const [name, ref] of Object.entries(otc)) {
  const p = JSON.parse(JSON.stringify(byId[ref.gsis]));
  const want = Math.round(ref.savings.restructure / 1000);
  const r = Cap.restructure(p, Y, Cap.restructureMax(p, Y, p.exp), p.exp);
  // Gonzalez: OverTheCap uses the 3-accrued-season minimum ($1.19M), nflverse experience gives 4 ($1.26M)
  eq(`${name} restructure savings`, r.saved, want, name === 'Christian Gonzalez' ? 60 : 2);
  rows.push({ name, kind: 'Restructure (max)', ours: M(0), otc: M(Math.round(ref.dead.restructure / 1000)), ourSav: M(r.saved), otcSav: M(want),
              match: Math.abs(r.saved - want) <= 2, note: Math.abs(r.saved - want) > 2 ? 'minimum-salary tier: OTC counts 3 accrued seasons, nflverse 4' : undefined });
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
  // an extension replaces pending option bonuses instead of stacking their cap charges on top (Josh Allen)
  const al = JSON.parse(JSON.stringify(byId[otc['Josh Allen'].gsis]));
  const alExt = Cap.buildExtension(al, { years: 4, total: 240000, bonus: 60000, gtd: 120000 }, Y);
  ok('extension drops pending option charges', alExt.every(r => !(r.opt > 0)));
  eq('extension keeps already-paid proration', alExt.reduce((s, r) => s + r.pro, 0), Cap.remaining(al, Y).reduce((s, r) => s + r.pro, 0) + 60000);
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

// ---------- 4b. Restructure ----------
console.log('Restructure (Milton Williams)');
{
  const w = JSON.parse(JSON.stringify(byId[otc['Milton Williams'].gsis]));
  const totalBefore = w.years.reduce((s, r) => s + r.cap, 0), hitBefore = Cap.capHit(w, Y);
  const max = Cap.restructureMax(w, Y, w.exp);
  const r = Cap.restructure(w, Y, max, w.exp);
  const n = Cap.yearsLeft(w, Y);
  eq('saves amount minus one year of proration', hitBefore - Cap.capHit(w, Y), r.saved);
  eq('savings = amt * (n-1)/n', r.saved, max - Math.floor(max / Math.min(5, n)));
  eq('total cap over the deal unchanged', w.years.reduce((s, x) => s + x.cap, 0), totalBefore);
  ok('base never below minimum', Cap.row(w, Y).base >= Cap.minSalary(w.exp, Y));
  ok('dead money rises after restructure', Cap.releaseCost(w, Y, false).dead[Y] > 12000);
  console.log('  restructured', M(max), 'over', n, 'yrs: saves', M(r.saved), 'in 2027');
}

// ---------- 4c. Top-51 rule ----------
console.log('Top-51 rule');
{
  const team = { abbr: 'TST', capBase: { 2027: 300000 }, dead: { 2027: 5000 }, rollover: {} };
  const ps = [];
  for (let i = 0; i < 60; i++) ps.push({ team: 'TST', years: [{ y: 2027, base: 1000 + i * 100, pro: 0, opt: 0, roster: 0, other: 0, gtd: 0, cap: 1000 + i * 100 }] });
  const all = ps.reduce((s, p) => s + p.years[0].cap, 0);
  const top = ps.map(p => p.years[0].cap).sort((a, b) => b - a).slice(0, 51).reduce((s, x) => s + x, 0);
  eq('in season: all 60 contracts count', Cap.teamCommitted(ps, team, 2027, false), all);
  eq('offseason: only the 51 largest count', Cap.teamCommitted(ps, team, 2027, true), top);
  eq('offseason space = cap - top 51 - all dead money', Cap.capSpace(ps, team, 2027, true), 300000 - top - 5000);
  ok('with 51 or fewer players both counts agree', Cap.teamCommitted(ps.slice(0, 40), team, 2027, true) === Cap.teamCommitted(ps.slice(0, 40), team, 2027, false));
  const players = data.players;
  const ne = { abbr: 'NE', capBase: { 2027: data.meta.cap }, dead: {}, rollover: {} };
  const nRos = players.filter(p => p.team === 'NE').length;
  ok('NE (' + nRos + ' under contract) unaffected until it carries more than 51', nRos > 51 || Cap.teamCommitted(players, ne, Y, true) === Cap.teamCommitted(players, ne, Y, false));
}

// ---------- 4d. Fifth-year option ----------
console.log('Fifth-year option (Drake Maye, 2024 #3)');
{
  const maye = JSON.parse(JSON.stringify(data.players.find(p => p.name === 'Drake Maye')));
  const table = data.meta.optTable;
  ok('eligible in 2027 offseason', Cap.fifthYearEligible(maye, Y));
  ok('not eligible a year early', !Cap.fifthYearEligible(maye, Y - 1));
  ok('Maye: pb corrected to 1 by data/overrides.csv', maye.pb === 1);
  ok('1 Pro Bowl -> transition tag tier', Cap.fifthYearTier(maye) === 1);
  ok('2 Pro Bowls -> franchise tag tier', Cap.fifthYearTier({ pb: 2, pt: {} }) === 0);
  ok('playing time: 62%/96%/96% meets the 75%-in-2-of-3 milestone', Cap.playingTimeMet(maye.pt));
  ok('playing time: 70/80/40 fails', !Cap.playingTimeMet({ 2024: 0.7, 2025: 0.8, 2026: 0.4 }));
  ok('playing time: 55/60/90 meets the 50%-every-season rule', Cap.playingTimeMet({ 2024: 0.55, 2025: 0.6, 2026: 0.9 }));
  ok('tier order: 1 Pro Bowl', Cap.fifthYearTier({ pb: 1, pt: {} }) === 1);
  ok('tier order: milestone only', Cap.fifthYearTier({ pb: 0, pt: { 2024: 0.8, 2025: 0.8, 2026: 0.1 } }) === 2);
  ok('tier order: basic', Cap.fifthYearTier({ pb: 0, pt: { 2024: 0.3, 2025: 0.3, 2026: 0.3 } }) === 3);
  const amt = Cap.fifthYearAmount(maye, table, 'QB');
  eq('Maye amount = QB transition tier', amt, table.QB[1]);
  ok('tiers ordered tag >= transition >= milestone >= basic', Object.values(table).every(t => t[0] >= t[1] && t[1] >= t[2] && t[2] >= t[3]));
  Cap.exerciseFifthYear(maye, Y, amt);
  const r28 = Cap.row(maye, Y + 1);
  ok('option adds 2028 year', !!r28 && Cap.yearsLeft(maye, Y) === 2);
  eq('option fully guaranteed', r28.gtd, amt);
  eq('cut pre-June 1 in 2027 now owes the option', Cap.releaseCost(maye, Y, false).dead[Y], maye.years[0].pro + maye.years[0].gtd + amt);
  ok('cannot exercise twice', !Cap.fifthYearEligible(maye, Y));
  console.log('  Maye 2028 option: ' + M(amt) + ' (' + Cap.TIER_LABEL[Cap.fifthYearTier(maye)] + ')');
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
