// Original player avatars: a front-view helmet-and-shoulders illustration in the team's colors with the
// player's jersey number on the shoulder pads. No photos, no logos. Per-player variation (skin tone,
// facemask style and color, visor, eye black) comes from a hash of the player id, so it never changes.
var Avatar = (function () {
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var SKIN = ['#f3cfae', '#e3b08a', '#c99068', '#a8704a', '#82502f', '#5c3721'];
  var uid = 0;
  function shade(hex, t) { return mixHex(hex, '#000000', t); }
  // Uniform colors per team: jersey = primary, trim = secondary; near-black or near-white trims stay readable.
  function kit(team) {
    var c = team && TEAM_COLORS[team] ? TEAM_COLORS[team] : ['#4a5566', '#c9d2de'];
    var jersey = hexLum(c[0]) < 0.012 ? mixHex(c[0], '#2a3442', 0.45) : c[0];
    var trim = c[1];
    if (Math.abs(hexLum(trim) - hexLum(jersey)) < 0.06) trim = hexLum(jersey) > 0.3 ? '#101418' : '#ffffff';
    var helmet = hexLum(c[0]) < 0.012 ? mixHex(c[0], '#3a4555', 0.5) : c[0];
    var num = hexLum(jersey) > 0.42 ? '#101418' : '#ffffff';
    return { jersey: jersey, trim: trim, helmet: helmet, num: num, stripe: team ? hash(team) % 3 : 0 };
  }
  function svg(p, size, opts) {
    opts = opts || {};
    var team = opts.team || p.team || p.rights || null, k = kit(team);
    var h = hash(p.id), bits = function (shift, mod) { return (h >>> shift) % mod; };
    var skin = SKIN[bits(0, 6)], maskStyle = bits(3, 4), maskCol = ['#cfd4db', '#f4f6f8', '#1a1d22', k.trim, '#cfd4db'][bits(6, 5)];
    var visor = bits(9, 10) < 3 ? bits(13, 3) : -1, eyeBlack = bits(16, 4) === 0, n = p.num != null && p.num !== '' ? String(p.num) : '';
    var id = 'av' + (++uid), dk = shade(k.helmet, 0.45), skinDk = shade(skin, 0.28);
    var shell = 'M22 46C20 24 33 9 50 9C67 9 80 24 78 46C78 52 76 58 72 62L66 64H34L28 62C24 58 22 52 22 46Z';
    var face = 'M32 38C32 31 40 28 50 28C60 28 68 31 68 38L67 56C63 61 57 62 50 62C43 62 37 61 33 56Z';
    var s = '<svg class="avatar" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(p.name) + (n ? ', number ' + n : '') + '">' +
      '<defs><clipPath id="' + id + 'h"><path d="' + shell + '"/></clipPath><clipPath id="' + id + 'f"><path d="' + face + '"/></clipPath>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>' +
      (visor === 2 ? '<linearGradient id="' + id + 'v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fe3ff"/><stop offset=".5" stop-color="#b979ff"/><stop offset="1" stop-color="#ffb36b"/></linearGradient>' : '') + '</defs>';
    // shoulders and jersey
    s += '<path d="M2 100V92C2 80 12 72 26 69L40 66H60L74 69C88 72 98 80 98 92V100Z" fill="' + k.jersey + '"/>' +
      '<path d="M2 100V92C2 80 12 72 26 69L40 66H60L74 69C88 72 98 80 98 92V100Z" fill="url(#' + id + 'g)" opacity=".7"/>' +
      '<path d="M5 86C9 75 21 70 36 68M95 86C91 75 79 70 64 68" fill="none" stroke="' + k.trim + '" stroke-width="3.2"/>' +
      '<path d="M41 58V68L50 78L59 68V58Z" fill="' + skinDk + '"/><path d="M39 66L50 80L61 66" fill="none" stroke="' + k.trim + '" stroke-width="3"/>';
    if (n) s += '<g font-family="\'Barlow Condensed\',\'Arial Narrow\',sans-serif" font-weight="800" font-size="' + (n.length > 1 ? 15 : 17) + '" text-anchor="middle" fill="' + k.num + '" stroke="' + k.trim + '" stroke-width="1.3" paint-order="stroke">' +
      '<text x="21" y="93" transform="rotate(-12 21 93)">' + n + '</text><text x="79" y="93" transform="rotate(12 79 93)">' + n + '</text></g>';
    // helmet
    s += '<path d="' + shell + '" fill="' + k.helmet + '"/>';
    if (k.stripe) s += '<g clip-path="url(#' + id + 'h)" fill="' + k.trim + '">' + (k.stripe === 1 ? '<rect x="46.5" y="6" width="7" height="34"/>' : '<rect x="42.5" y="6" width="3.2" height="34"/><rect x="54.3" y="6" width="3.2" height="34"/>') + '</g>';
    s += '<path d="' + shell + '" fill="url(#' + id + 'g)"/><ellipse cx="37" cy="21" rx="10" ry="5.5" fill="#fff" opacity=".22" transform="rotate(-28 37 21)"/>' +
      '<circle cx="25" cy="47" r="2.3" fill="' + dk + '"/><circle cx="75" cy="47" r="2.3" fill="' + dk + '"/>';
    // face
    s += '<path d="' + face + '" fill="' + skin + '"/><g clip-path="url(#' + id + 'f)"><rect x="30" y="27" width="40" height="8" fill="#000" opacity=".28"/>' +
      '<path d="M38 39.5H47M53 39.5H62" stroke="' + shade(skin, 0.55) + '" stroke-width="1.4" stroke-linecap="round"/>' +
      '<ellipse cx="43" cy="42.5" rx="2.6" ry="1.7" fill="#1b1410"/><ellipse cx="57" cy="42.5" rx="2.6" ry="1.7" fill="#1b1410"/>' +
      (eyeBlack ? '<rect x="39.5" y="45.3" width="7" height="2" rx="1" fill="#111"/><rect x="53.5" y="45.3" width="7" height="2" rx="1" fill="#111"/>' : '') +
      '<path d="M45 53C48 54.5 52 54.5 55 53" stroke="' + shade(skin, 0.4) + '" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>';
    if (visor >= 0) s += '<path d="M33 35C40 33 60 33 67 35V46C60 47.5 40 47.5 33 46Z" fill="' + (visor === 0 ? 'rgba(25,30,38,.55)' : visor === 1 ? 'rgba(6,7,9,.92)' : 'url(#' + id + 'v)') + '"' + (visor === 2 ? ' opacity=".82"' : '') + '/>' +
      '<path d="M35 36C42 34.6 58 34.6 65 36" stroke="#fff" stroke-opacity=".35" stroke-width="1" fill="none"/>';
    // facemask
    var bars = 'M31 47C40 50.5 60 50.5 69 47M33 54.5C42 57.5 58 57.5 67 54.5M31 47L33.5 59M69 47L66.5 59';
    if (maskStyle >= 1) bars += 'M36 60.5C44 63.5 56 63.5 64 60.5M50 49.6V62.6';
    if (maskStyle === 2) bars += 'M43.5 49.3V62.3M56.5 49.3V62.3';
    if (maskStyle === 3) bars += 'M50 36V49.6';
    s += '<path d="' + bars + '" fill="none" stroke="' + shade(maskCol, 0.35) + '" stroke-width="3.4" stroke-linecap="round"/><path d="' + bars + '" fill="none" stroke="' + maskCol + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M29 57C34 66 66 66 71 57" fill="none" stroke="#e9ecf0" stroke-opacity=".55" stroke-width="1.4"/></svg>';
    return s;
  }
  return { svg: svg, hash: hash, kit: kit };
})();
