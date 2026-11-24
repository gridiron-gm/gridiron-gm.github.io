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
// Official primary and secondary colors (no logos). `color` above stays the bright chip color.
var TEAM_COLORS = {
  ARI: ['#97233F', '#FFB612'], ATL: ['#A71930', '#A5ACAF'], BAL: ['#241773', '#9E7C0C'], BUF: ['#00338D', '#C60C30'],
  CAR: ['#0085CA', '#BFC0BF'], CHI: ['#0B162A', '#C83803'], CIN: ['#FB4F14', '#000000'], CLE: ['#311D00', '#FF3C00'],
  DAL: ['#003594', '#869397'], DEN: ['#FB4F14', '#002244'], DET: ['#0076B6', '#B0B7BC'], GB: ['#203731', '#FFB612'],
  HOU: ['#03202F', '#A71930'], IND: ['#002C5F', '#A2AAAD'], JAX: ['#006778', '#D7A22A'], KC: ['#E31837', '#FFB81C'],
  LV: ['#000000', '#A5ACAF'], LAC: ['#0080C6', '#FFC20E'], LA: ['#003594', '#FFA300'], MIA: ['#008E97', '#FC4C02'],
  MIN: ['#4F2683', '#FFC62F'], NE: ['#002244', '#C60C30'], NO: ['#D3BC8D', '#101820'], NYG: ['#0B2265', '#A71930'],
  NYJ: ['#125740', '#FFFFFF'], PHI: ['#004C54', '#A5ACAF'], PIT: ['#FFB612', '#101820'], SF: ['#AA0000', '#B3995D'],
  SEA: ['#002244', '#69BE28'], TB: ['#D50A0A', '#FF7900'], TEN: ['#0C2340', '#4B92DB'], WAS: ['#5A1414', '#FFB612'],
};
function hexLum(hex) {
  var c = hex.replace('#', ''), v = [0, 2, 4].map(function (i) { var x = parseInt(c.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function mixHex(hex, to, t) {
  var a = hex.replace('#', ''), b = to.replace('#', ''), out = '#';
  for (var i = 0; i < 6; i += 2) { var x = Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t); out += ('0' + x.toString(16)).slice(-2); }
  return out;
}
// CSS variables for a team: band (primary), accent readable on the dark UI, and text colors on each.
function teamVars(abbr) {
  var c = TEAM_COLORS[abbr] || ['#2a3442', '#7aa2d6'], c1 = c[0], c2 = c[1];
  var acc = hexLum(c2) >= 0.1 ? c2 : hexLum(c1) >= 0.1 ? c1 : mixHex(c1, '#ffffff', 0.45);
  // the full-bleed background: lift near-black primaries, deepen bright ones (gold, orange) so white text reads on it
  var band = hexLum(c1) < 0.02 ? mixHex(c1, '#1b2431', 0.35) : hexLum(c1) > 0.2 ? mixHex(c1, '#0a0f18', 0.5) : c1;
  // links/text in the accent: lighten it so it reads as a link, not as a red warning
  var accText = mixHex(acc, '#ffffff', hexLum(acc) < 0.3 ? 0.45 : 0.15);
  // tc2: the secondary as a fill (near-black or white secondaries fall back to the readable accent);
  // tc2b: a brightened version for thin accent lines and small labels on the dark UI
  var fill2 = hexLum(c2) < 0.02 || hexLum(c2) > 0.85 ? acc : c2;
  var bright2 = hexLum(fill2) < 0.25 ? mixHex(fill2, '#ffffff', 0.35) : fill2;
  var deep2 = hexLum(fill2) > 0.18 ? mixHex(fill2, '#000000', 0.42) : fill2;   // big fills behind white text
  return '--tc1:' + band + ';--tc2:' + fill2 + ';--tc2b:' + bright2 + ';--tc2d:' + deep2 + ';--acc:' + acc + ';--acc-text:' + accText + ';--on-tc1:' + (hexLum(band) > 0.4 ? '#101418' : '#ffffff') +
    ';--on-tc2:' + (hexLum(fill2) > 0.4 ? '#101418' : '#ffffff') + ';--on-acc:' + (hexLum(acc) > 0.4 ? '#101418' : '#ffffff');
}

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
  if (Math.round(k) === 0) return '$0';
  var neg = k < 0; k = Math.abs(k);
  var s = k >= 1000 ? '$' + (k / 1000).toFixed(dp == null ? 1 : dp) + 'M' : '$' + Math.round(k) + 'K';
  return neg ? '−' + s : s;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sumBy(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f(arr[i]); return s; }
function byKey(f, desc) { return function (a, b) { var x = f(a), y = f(b); return desc ? (y > x ? 1 : y < x ? -1 : 0) : (x > y ? 1 : x < y ? -1 : 0); }; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function chip(abbr) { var c = TEAM_COLORS[abbr]; return c ? '<span class="chip" style="background:' + c[0] + ';border-color:' + c[1] + '"></span>' : ''; }
