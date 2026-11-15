// Rating sanity checks on src/data.json. Run: node tests/ratings.test.js
// One league-wide scale: ~0-3 players 97+, 5-10 at 95+, 60-80 at 90+, starters ~75-78, backups 55-70.
// Consensus elite players (as of 2025) must be 88+, unless something real in 2026 explains it (listed below).
const data = require('../src/data.json');
const P = data.players;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('  FAIL', l, extra || ''); } };

const n97 = P.filter(p => p.ovr >= 97).length, n95 = P.filter(p => p.ovr >= 95).length, n90 = P.filter(p => p.ovr >= 90).length;
ok(`0-3 players at 97+ (${n97})`, n97 <= 3);
ok(`5-10 at 95+ (${n95})`, n95 >= 5 && n95 <= 10);
ok(`60-80 at 90+ (${n90})`, n90 >= 60 && n90 <= 80);

// starters / backups by 2026 team depth (best N at each position)
const SLOTS = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, IOL: 3, EDGE: 2, DL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1 };
const groups = {};
P.forEach(p => { const t = p.team || p.prevTeam; if (t) (groups[t + p.pos] = groups[t + p.pos] || []).push(p); });
const st = [], bk = [];
Object.values(groups).forEach(l => { l.sort((a, b) => b.ovr - a.ovr); const n = SLOTS[l[0].pos] || 0; st.push(...l.slice(0, n)); bk.push(...l.slice(n, n + 2)); });
const avg = a => a.reduce((s, p) => s + p.ovr, 0) / a.length;
ok(`average starter 75-78 (${avg(st).toFixed(1)})`, avg(st) >= 75 && avg(st) <= 78);
ok(`average backup 55-70 (${avg(bk).toFixed(1)})`, avg(bk) >= 55 && avg(bk) <= 70);

// consensus elite
const ELITE = ['Patrick Mahomes', 'Josh Allen:QB', 'Joe Burrow', 'Lamar Jackson', 'Jalen Hurts', 'Micah Parsons', 'Myles Garrett', 'T.J. Watt',
  'Aidan Hutchinson', 'Patrick Surtain II', 'Penei Sewell', 'Tristan Wirfs', 'Tyler Linderbaum', 'Chris Lindstrom', "Ja'Marr Chase", 'Justin Jefferson',
  'CeeDee Lamb', 'Amon-Ra St. Brown', 'Puka Nacua', 'Trey McBride', 'Brock Bowers', 'George Kittle', 'Saquon Barkley', 'Jahmyr Gibbs', 'Bijan Robinson',
  'Fred Warner', 'Roquan Smith', 'Kyle Hamilton', 'Dexter Lawrence', 'Chris Jones:DL'];
// Real 2026 reasons a consensus-elite player can sit below 88 (reported, not forced). Must still be 85+.
const EXCEPTIONS = { 'Jalen Hurts': 'played 5 of 9 games so far in 2026 with below-average production' };
const rows = [];
for (const e of ELITE) {
  const [name, pos] = e.split(':');
  const m = P.filter(p => p.name === name && (!pos || p.pos === pos));
  ok(`${name} in the data`, m.length > 0);
  if (!m.length) continue;
  const p = m.sort((a, b) => b.ovr - a.ovr)[0];
  rows.push(`${name} ${p.ovr}`);
  if (EXCEPTIONS[name]) { ok(`${name} 85+ (exception: ${EXCEPTIONS[name]})`, p.ovr >= 85, p.ovr); if (p.ovr < 88) console.log(`  note: ${name} ${p.ovr}: ${EXCEPTIONS[name]}`); }
  else ok(`${name} 88+`, p.ovr >= 88, p.ovr);
}
console.log('  elite: ' + rows.join(', '));
const K = P.filter(p => p.pos === 'K'), aubrey = K.find(p => p.name === 'Brandon Aubrey');
const higher = K.filter(p => p.ovr > aubrey.ovr).length;
ok(`Brandon Aubrey a top-3 kicker (${higher} rated higher, ${aubrey.ovr})`, higher <= 2);

// earlier complaints: no fringe players at the very top
for (const n of ['Darnell Wright', 'Zyon McCollum', 'Amani Hooker', 'Jaylen Warren', 'Hjalte Froholdt']) {
  const p = P.find(q => q.name === n);
  if (p) { ok(`${n} below 90 (${p.ovr})`, p.ovr < 90); }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
