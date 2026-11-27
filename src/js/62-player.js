// Player card: slides over from the right (full screen on phone). Overview / Stats / Contract tabs,
// one primary action, everything else in the "..." menu. Actions follow the phase gates.
function findPlayer(id) { return P(id) || (UI._preview && UI._preview.list.filter(function (p) { return p.id === id; })[0]); }
// [label, act, data, cls, sub] for the card's actions; the first is the primary button
function playerActions(p) {
  var Y = S.year, mine = p.team === S.user, out = [];
  if (mine) {
    var fy = fifthYearInfo(p);
    if (fy && fy.open) out.push(['Exercise option · ' + fmtM(fy.amount), 'fifth', { id: p.id, x: 1 }], ['Decline option', 'fifth', { id: p.id, x: 0 }, '', 'He can be a free agent after ' + Y]);
    if (canExtend(p)) out.push(['Extend', 'offer', { id: p.id, mode: 'extend' }]);
    var rmax = Cap.restructureMax(p, Y, p.exp), nYrs = Math.min(5, Cap.remaining(p, Y).length);
    if (rmax > 500) out.push(['Restructure', 'restructure', { id: p.id }, '', 'Saves ' + fmtM(rmax - Math.floor(rmax / nYrs)) + ' this year']);
    if (tradeOpen()) out.push(['Shop in a trade', 'trade-with', { id: p.id }]);
    var pre = releasePreview(p, false);
    if (!isPostJune()) out.push(['Release pre-June 1', 'release', { id: p.id, j: 0 }, 'danger', fmtM(pre.now) + ' dead in ' + Y], ['Designate post-June 1', 'release', { id: p.id, j: 1 }, 'danger', canJune1(S.user) ? (2 - (S.june1[S.year + S.user] || 0)) + ' designations left' : 'None left']);
    else out.push(['Release', 'release', { id: p.id, j: 0 }, 'danger', fmtM(pre.now) + ' dead']);
  } else if (!p.team && !p.retired && !p.prospect) {
    var canOffer = S.phase === 'resign' ? p.rights === S.user : screenOpen('fa');
    if (canOffer) out.push([p.rights === S.user ? 'Re-sign' : 'Make an offer', 'offer', { id: p.id, mode: 'sign' }]);
  } else if (p.team && !p.prospect && tradeOpen()) out.push(['Trade for him', 'trade-for', { id: p.id }]);
  return out;
}
function playerNote(p) {
  if (p.team === S.user || p.retired) return '';
  if (p.prospect) return UI.view === 'draft' && currentPick() && currentPick().owner === S.user ? 'Pick him from the draft board.' : 'Scouting report. He can be drafted when your pick comes up.';
  if (!p.team) return S.phase === 'resign' ? 'Free agency opens after the re-sign window.' : S.phase === 'draft' ? 'Free agent signings reopen at week 1.' : S.phase === 'playoffs' ? 'Free agent signings reopen after the Super Bowl.' : '';
  return S.phase === 'season' ? 'The trade deadline has passed.' : 'Trades reopen after the Super Bowl.';
}
function playerModal(id) {
  var f = function () {
    var p = findPlayer(id); if (!p) return '';
    var Y = S.year, pi = potInfo(p), tab = UI.ptab || 'overview';
    var who = p.prospect ? (p.college ? esc(p.college) : 'Draft prospect') : p.team ? esc(TEAM[p.team].name) : p.rights ? 'Expiring · ' + p.rights + ' has rights' : p.retired ? 'Retired' : 'Free agent';
    var h = '<div class="ps-hero" style="' + teamVars(p.team || p.rights || S.user) + '"><button class="x" data-act="close" aria-label="Close">✕</button><button class="btn sm back" data-act="close">‹ Back</button>' + avatar(p, 196, { s: 66 }) +
      '<div class="ps-id"><h2 class="' + heroCls(lastName(p.name)) + '">' + (p.name.indexOf(' ') > 0 ? '<span class="fn">' + esc(p.name.split(' ')[0]) + '</span>' + esc(lastName(p.name)) : esc(p.name)) + '</h2>' +
      '<div class="ps-meta"><b>' + p.pos + (p.opos && p.opos !== p.pos ? ' (' + p.opos + ')' : '') + (p.num != null ? ' · #' + p.num : '') + '</b><span>Age ' + p.age + '</span><span>' + who + '</span>' + (p.draft && p.draft[1] ? '<span>' + p.draft[0] + ' R' + p.draft[1] + ' #' + p.draft[2] + '</span>' : '') + (p.inj ? '<span class="inj">' + esc(p.injNote || 'Injured') + '</span>' : '') + '</div></div></div>';
    var tabs = [['overview', 'Overview'], ['stats', 'Stats']].concat(p.years && p.years.length ? [['contract', 'Contract']] : []);
    if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'overview';
    h += '<div class="minitabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '" data-act="ptab" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div class="ps-body">';
    if (tab === 'overview') {
      var tiles = [['Potential', '<b>' + pi.grade + '<small>' + potRange(pi) + '</small></b>'], ['Dev trait', '<div style="margin-top:6px">' + devBadge(p) + '</div>']];
      if (p.years && p.years.length) tiles.push(['Cap hit ' + Y, '<b>' + fmtM(Cap.capHit(p, Y)) + '</b>'], ['Years left', '<b>' + (Cap.yearsLeft(p, Y) || '—') + '</b>']);
      else if (!p.prospect) { var a = askOf(p); tiles.push(['Asking', '<b>' + fmtM(a.apy) + '<small>/ yr</small></b>'], ['Years', '<b>' + a.years + '</b>']); }
      else tiles.push(['Draft class', '<b>' + p.draft[0] + '</b>'], ['Grade', '<b>' + Math.round(p.grade) + '</b>']);
      h += '<div class="ps-row">' + tiles.map(function (t) { return '<div class="stat"><span>' + t[0] + '</span>' + t[1] + '</div>'; }).join('') + '</div>';
      var fy = !p.prospect && fifthYearInfo(p);
      if (fy) h += '<div class="opt"><h4>Fifth-year option · ' + fy.year + '</h4><p>' + fmtM(fy.amount) + ', fully guaranteed when exercised. ' + esc(fy.label) + ' (Pro Bowls: ' + (p.pb || 0) + '; playing time ' +
        Object.keys(p.pt || {}).sort().map(function (k) { return k + ' ' + Math.round(p.pt[k] * 100) + '%'; }).join(', ') + ').' + (p.team === S.user && fy.open ? ' Decide before the draft ends; declining makes him a free agent after ' + Y + '.' : '') + '</p></div>';
      else if (p.fifth) h += '<p class="note">Fifth-year option ' + p.fifth + '.</p>';
      var subs = subList(p);
      if (subs.length) h += '<h3 class="sec">Ratings <small>from 2024–26 stats, recent seasons weighted most</small></h3><div class="ps-row r3">' + subs.map(function (s) {
        return '<div class="stat tc' + tier(s[1]) + '"><div class="attr"><span>' + s[0] + '</span><b>' + s[1] + '</b><div class="bar"><i style="width:' + s[1] + '%"></i></div></div></div>';
      }).join('') + '</div>';
    }
    if (tab === 'overview' || tab === 'stats') {
      var lines = (p.lines || (p.line26 ? [[2026, p.prevTeam || '', p.line26]] : [])).slice();
      if (p.last && p.last.g && Y - 1 > 2026 && !lines.some(function (l) { return +l[0] === Y - 1; })) lines.push([Y - 1, '', statText(p.last, p.pos) + ' <span class="muted">(simulated)</span>']);
      if (p.s && p.s.g) lines.push([Y, p.team || '', statText(p.s, p.pos) + ' <span class="muted">(this season)</span>']);
      lines.sort(function (a, b) { return a[0] - b[0]; });
      if (tab === 'overview') lines = lines.slice(-3);
      if (lines.length) h += '<h3 class="sec">' + (tab === 'overview' ? 'Recent seasons' : 'Season stats') + '</h3><div class="tablewrap"><table class="dense seasons"><tbody>' + lines.map(function (l) { return '<tr><td>' + l[0] + '</td><td>' + (l[1] ? teamLink(l[1]) : '') + '</td><td>' + (/<span/.test(l[2]) ? l[2] : esc(l[2])) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      else if (tab === 'stats') h += '<p class="muted">No NFL games yet.</p>';
      if (tab === 'stats' && p.car && p.car.g) h += '<h3 class="sec">Career in this league</h3><p>' + statText(p.car, p.pos) + '</p>';
    }
    if (tab === 'contract' && p.years && p.years.length) {
      h += '<div class="ps-row"><div class="stat"><span>Cap hit ' + Y + '</span><b>' + fmtM(Cap.capHit(p, Y)) + '</b></div><div class="stat"><span>Gtd left</span><b>' + fmtM(Cap.gtdLeft(p, Y)) + '</b></div><div class="stat"><span>Signed</span><b>' + (p.signed || '—') + '</b></div><div class="stat"><span>APY</span><b>' + fmtM(p.apy || 0) + '</b></div></div>';
      h += '<div class="tablewrap" style="margin-top:12px"><table class="dense"><thead><tr><th>Year</th><th class="r">Base</th><th class="r">Bonus</th><th class="r hide-sm">Option</th><th class="r hide-sm">Roster/other</th><th class="r">Cap hit</th><th class="r hide-sm">Gtd</th><th class="r">Dead if cut</th></tr></thead><tbody>';
      Cap.remaining(p, Y).forEach(function (r) {
        h += '<tr class="' + (r.void ? 'void' : '') + '"><td>' + r.y + (r.void ? ' void' : '') + '</td><td class="r">' + fmtM(r.base) + '</td><td class="r">' + fmtM(r.pro) + '</td><td class="r hide-sm">' + fmtM(r.opt || 0) + '</td><td class="r hide-sm">' + fmtM(r.roster + r.other) + '</td><td class="r"><b>' + fmtM(r.cap) + '</b></td><td class="r hide-sm">' + fmtM(r.gtd) + '</td><td class="r">' + fmtM(Cap.releaseCost(p, r.y, false).dead[r.y] || 0) + '</td></tr>';
      });
      h += '</tbody></table></div><p class="note">Bonus = prorated signing bonus. Dead if cut = pre-June 1 release in that year.</p>';
      if (p.team === S.user) {
        var pre = releasePreview(p, false), post = Cap.releaseCost(p, Y, true);
        h += '<h3 class="sec">If released</h3><div class="rels">';
        if (!isPostJune()) {
          h += '<div class="stat"><span>Pre-June 1</span><b>' + fmtM(pre.now) + '<small>dead in ' + Y + '</small></b><div class="muted small">Cap change ' + Y + ': ' + fmtM(pre.savings) + ' saved</div></div>';
          h += '<div class="stat"><span>Post-June 1 designation</span><b>' + fmtM(post.dead[Y] || 0) + '<small>in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '</small></b><div class="muted small">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved</div></div>';
        } else h += '<div class="stat"><span>After June 1</span><b>' + fmtM(post.dead[Y] || 0) + '<small>in ' + Y + (post.dead[Y + 1] ? ' + ' + fmtM(post.dead[Y + 1]) + ' in ' + (Y + 1) : '') + '</small></b><div class="muted small">Cap change ' + Y + ': ' + fmtM(post.savings) + ' saved</div></div>';
        h += '</div>';
        var rmax = Cap.restructureMax(p, Y, p.exp), nYrs = Math.min(5, Cap.remaining(p, Y).length);
        if (rmax > 500) h += '<p class="note">Restructure converts ' + fmtM(rmax) + ' of ' + Y + ' salary into a bonus prorated over ' + nYrs + ' years. Future cap hits and dead money go up.</p>';
      }
    }
    h += '</div>';
    var acts = playerActions(p), note = playerNote(p);
    if (acts.length || note) {
      var first = acts[0];
      h += '<div class="ps-actions">' + (first ? '<button class="btn ' + (first[3] === 'danger' ? 'danger' : 'pri') + '" data-act="' + first[1] + '"' + Object.keys(first[2]).map(function (k) { return ' data-' + k + '="' + first[2][k] + '"'; }).join('') + '>' + first[0] + '</button>' : '<span class="muted">' + note + '</span>') +
        (acts.length > 1 ? kebab('card', acts.slice(1)) : '') + '</div>';
    }
    return h;
  };
  f.kind = 'slide';
  return f;
}
function statText(s, pos) {
  var parts = [s.g + ' G'];
  if (s.pyd) parts.push(s.pyd + ' pass yds', (s.ptd || 0) + ' TD', (s.int || 0) + ' INT');
  if (s.ruyd) parts.push(s.ruyd + ' rush yds', (s.rutd || 0) + ' rush TD');
  if (s.ryd) parts.push((s.rec || 0) + ' rec', s.ryd + ' rec yds', (s.rtd || 0) + ' TD');
  if (s.sk) parts.push(s.sk + ' sacks');
  if (s.dint) parts.push(s.dint + ' INT');
  if (s.tk) parts.push(s.tk + ' tkl');
  if (s.fga) parts.push(s.fgm + '/' + s.fga + ' FG');
  return parts.join(' · ');
}
