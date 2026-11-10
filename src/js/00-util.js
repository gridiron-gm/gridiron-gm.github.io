// Helpers, team definitions, seeded RNG.
var TEAMS = [
  ['ARI', 'Arizona Cardinals', 'NFC', 'West', '#97233F'], ['ATL', 'Atlanta Falcons', 'NFC', 'South', '#A71930'],
  ['BAL', 'Baltimore Ravens', 'AFC', 'North', '#241773'], ['BUF', 'Buffalo Bills', 'AFC', 'East', '#00338D'],
  ['CAR', 'Carolina Panthers', 'NFC', 'South', '#0085CA'], ['CHI', 'Chicago Bears', 'NFC', 'North', '#0B162A'],
  ['CIN', 'Cincinnati Bengals', 'AFC', 'North', '#FB4F14'], ['CLE', 'Cleveland Browns', 'AFC', 'North', '#FF3C00'],
  ['DAL', 'Dallas Cowboys', 'NFC', 'East', '#003594'], ['DEN', 'Denver Broncos', 'AFC', 'West', '#FB4F14'],
  ['DET', 'Detroit Lions', 'NFC', 'North', '#0076B6'], ['GB', 'Green Bay Packers', 'NFC', 'North', '#203731'],
  ['HOU', 'Houston Texans', 'AFC', 'South', '#03202F'], ['IND', 'Indianapolis Colts', 'AFC', 'South', '#002C5F'],
  ['JAX', 'Jacksonville Jaguars', 'AFC', 'South', '#006778'], ['KC', 'Kansas City Chiefs', 'AFC', 'West', '#E31837'],
  ['LV', 'Las Vegas Raiders', 'AFC', 'West', '#A5ACAF'], ['LAC', 'Los Angeles Chargers', 'AFC', 'West', '#0080C6'],
  ['LA', 'Los Angeles Rams', 'NFC', 'West', '#003594'], ['MIA', 'Miami Dolphins', 'AFC', 'East', '#008E97'],
  ['MIN', 'Minnesota Vikings', 'NFC', 'North', '#4F2683'], ['NE', 'New England Patriots', 'AFC', 'East', '#002244'],
  ['NO', 'New Orleans Saints', 'NFC', 'South', '#D3BC8D'], ['NYG', 'New York Giants', 'NFC', 'East', '#0B2265'],
  ['NYJ', 'New York Jets', 'AFC', 'East', '#125740'], ['PHI', 'Philadelphia Eagles', 'NFC', 'East', '#004C54'],
  ['PIT', 'Pittsburgh Steelers', 'AFC', 'North', '#FFB612'], ['SF', 'San Francisco 49ers', 'NFC', 'West', '#AA0000'],
  ['SEA', 'Seattle Seahawks', 'NFC', 'West', '#69BE28'], ['TB', 'Tampa Bay Buccaneers', 'NFC', 'South', '#D50A0A'],
  ['TEN', 'Tennessee Titans', 'AFC', 'South', '#4B92DB'], ['WAS', 'Washington Commanders', 'NFC', 'East', '#5A1414'],
].map(function (t) { return { abbr: t[0], name: t[1], conf: t[2], div: t[3], color: t[4] }; });
var TEAM = {}; TEAMS.forEach(function (t) { TEAM[t.abbr] = t; });

var POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];
var POS_LABEL = { OT: 'OT', IOL: 'IOL', EDGE: 'EDGE', DL: 'DL' };

// Seeded RNG (mulberry32); state lives in the save so sims are reproducible.
var RNG = {
  s: 1,
  next: function () {
    var t = (RNG.s = (RNG.s + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  int: function (a, b) { return a + Math.floor(RNG.next() * (b - a + 1)); },
  pick: function (arr) { return arr[Math.floor(RNG.next() * arr.length)]; },
  normal: function () { var u = 1 - RNG.next(), v = RNG.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
  shuffle: function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(RNG.next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
};

function fmtM(k, dp) {
  if (k == null) return '–';
  var neg = k < 0; k = Math.abs(k);
  var s = k >= 1000 ? '$' + (k / 1000).toFixed(dp == null ? 1 : dp) + 'M' : '$' + Math.round(k) + 'K';
  return neg ? '−' + s : s;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sumBy(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f(arr[i]); return s; }
function byKey(f, desc) { return function (a, b) { var x = f(a), y = f(b); return desc ? (y > x ? 1 : y < x ? -1 : 0) : (x > y ? 1 : x < y ? -1 : 0); }; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function chip(abbr) { var t = TEAM[abbr]; return t ? '<span class="chip" style="background:' + t.color + '"></span>' : ''; }
