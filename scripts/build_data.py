"""Build src/data.json from nflverse raw files in data/raw.

Run:  .venv/bin/python -I scripts/build_data.py
Inputs (download with scripts/fetch_data.sh):
  historical_contracts.parquet  OverTheCap contracts via nflverse
  roster_2026.csv               current rosters (team, status, birth date)
  players.csv                   id crosswalk (gsis <-> pfr)
  stats_player_reg_2025/2026    season stats
  snap_counts_2025/2026         per-game snaps
Money is stored in $ thousands (integers) so the JS engine never deals with floats.
"""
import csv, json, math, os, statistics as st
from collections import defaultdict
import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
START_YEAR = 2027          # first league year of the franchise
CAP_2027 = None            # $K, projected: implied by OverTheCap cap_percent figures (computed below)
REF_DATE = (2027, 3, 11)   # league year start, for ages
SEASON = START_YEAR - 1    # the real season a new game starts in (2026)
# GG_MODE=w1: the 'Start of 2026, week 1' file: week-1 rosters and ratings from 2024-25 stats only (nothing
# from 2026 leaks in). Written to src/data_w1.json. The default build is the current-week file (src/data.json).
W1 = os.environ.get('GG_MODE') == 'w1'

NAME_TO_ABBR = {
 '49ers':'SF','Bears':'CHI','Bengals':'CIN','Bills':'BUF','Broncos':'DEN','Browns':'CLE','Buccaneers':'TB',
 'Cardinals':'ARI','Chargers':'LAC','Chiefs':'KC','Colts':'IND','Commanders':'WAS','Cowboys':'DAL',
 'Dolphins':'MIA','Eagles':'PHI','Falcons':'ATL','Giants':'NYG','Jaguars':'JAX','Jets':'NYJ','Lions':'DET',
 'Packers':'GB','Panthers':'CAR','Patriots':'NE','Raiders':'LV','Rams':'LA','Ravens':'BAL','Saints':'NO',
 'Seahawks':'SEA','Steelers':'PIT','Texans':'HOU','Titans':'TEN','Vikings':'MIN'}
ROSTER_FIX = {'LAR':'LA','JAC':'JAX','WSH':'WAS','OAK':'LV','SD':'LAC','STL':'LA'}

# Game positions
POS_MAP = {'QB':'QB','RB':'RB','FB':'RB','WR':'WR','TE':'TE','LT':'OT','RT':'OT','T':'OT','OT':'OT',
           'LG':'IOL','RG':'IOL','G':'IOL','C':'IOL','OG':'IOL','IOL':'IOL','OL':'IOL',
           'IDL':'DL','DT':'DL','NT':'DL','DL':'DL','DE':'EDGE','ED':'EDGE','EDGE':'EDGE','OLB':'EDGE',
           'LB':'LB','ILB':'LB','MLB':'LB','CB':'CB','DB':'CB','S':'S','FS':'S','SS':'S','SAF':'S',
           'K':'K','P':'P','LS':'LS'}

def k(x):  # $M float -> $K int
    return int(round((x or 0) * 1000))

def age_on(bd):
    if not bd: return None
    y, m, d = map(int, bd[:10].split('-'))
    a = REF_DATE[0] - y - ((REF_DATE[1], REF_DATE[2]) < (m, d))
    return a

def fnum(x):
    try: return float(x)
    except (TypeError, ValueError): return 0.0

# ---------- rosters ----------
roster = {}
ROSTER_FILE = next((f for f in (f'roster_{START_YEAR}.csv', f'roster_{START_YEAR - 1}.csv')
                    if os.path.exists(os.path.join(RAW, f)) and os.path.getsize(os.path.join(RAW, f)) > 1000))
print('rosters from', ROSTER_FILE)
for r in csv.DictReader(open(os.path.join(RAW, ROSTER_FILE))):
    if r['status'] in ('CUT', 'RET', 'TRD', 'TRT'): continue
    roster[r['gsis_id']] = r
# jersey numbers (latest week a player appears with one; used for the player avatars)
jersey = {}
for r in csv.DictReader(open(os.path.join(RAW, ROSTER_FILE))):
    n = (r.get('jersey_number') or '').strip()
    if r['gsis_id'] and n:
        w = int(r.get('week') or 0)
        if r['gsis_id'] not in jersey or w >= jersey[r['gsis_id']][0]: jersey[r['gsis_id']] = (w, int(float(n)))

players_xw = {}
for r in csv.DictReader(open(os.path.join(RAW, 'players.csv'))):
    players_xw[r['gsis_id']] = r
pfr_to_gsis = {r['pfr_id']: g for g, r in players_xw.items() if r['pfr_id']}

# ---------- contracts ----------
contracts = {}
all_contracts = defaultdict(list)
for r in pq.read_table(os.path.join(RAW, 'historical_contracts.parquet')).to_pylist():
    if r['gsis_id']: all_contracts[r['gsis_id']].append(r)
    if not r['is_active'] or not r['gsis_id']: continue
    prev = contracts.get(r['gsis_id'])
    if prev is None or (r['year_signed'] or 0) >= (prev['year_signed'] or 0):
        contracts[r['gsis_id']] = r

def contract_years(c, start=START_YEAR):
    """Future league years (>= start) of a contract.

    Returns (years, options).
    - Option bonuses: OverTheCap's option_bonus column is the sum of overlapping 5-year prorations. We
      split it back into individual options. Options exercised before start are real proration (go in
      `pro`, accelerate as dead money). Options from start on are pending: their proration is charged
      to the cap in `opt` but is not dead money until exercised (Cap.exerciseOptions does that).
    - Void years (cap charge but no real salary) are kept with void=True so leftover proration accelerates
      when the deal voids.
    """
    hist = {}
    for s in c['season_history'] or []:
        if (s['year'] or '').isdigit() and int(s['year']) >= (c['year_signed'] or 0):
            hist[int(s['year'])] = s
    yrs = sorted(y for y in hist if k(hist[y]['cap_number']) > 0 or k(hist[y]['option_bonus']) > 0)
    # decompose option bonuses
    options, active = [], []          # active: [per_year, last_year]
    for y in yrs:
        o = k(hist[y]['option_bonus'])
        running = sum(per for per, last in active if last >= y)
        new = o - running
        if new > 50:
            last_y = max(yy for yy in yrs if k(hist[yy]['option_bonus']) > 0)
            span = min(5, last_y - y + 1)
            active.append((new, y + span - 1))
            options.append({'y': y, 'per': new, 'span': span})
    out = []
    for y in yrs:
        if y < start: continue
        s = hist[y]
        cap = k(s['cap_number'])
        if cap <= 0: continue
        base, pro, rost = k(s['base_salary']), k(s['prorated_bonus']), k(s['roster_bonus'])
        o_exer = sum(op['per'] for op in options if op['y'] < start and op['y'] <= y < op['y'] + op['span'])
        o_pend = k(s['option_bonus']) - o_exer
        cash = k(s['cash_paid'])
        void = cap < base + rost or (cash == 0 and base > 0 and y >= start and y > SEASON)   # no cash paid = void year (not the season in progress)
        if void:
            base = rost = 0
        other = cap - base - pro - rost - o_exer - o_pend   # workout, per-game, other bonuses
        if void:
            # void year shows all leftover acceleration. Pending (unexercised) option money in this and
            # later void years stays pending; the rest is real proration that accelerates.
            other = 0
            opt_left = sum(k(hist[yy]['option_bonus']) for yy in yrs if yy >= y) - o_exer
            o_pend = max(0, min(cap - o_exer, opt_left))
            pro = cap - o_exer - o_pend
        row = {'y': y, 'base': base, 'pro': pro + o_exer, 'opt': o_pend, 'roster': rost, 'other': other,
               'gtd': 0 if void else min(k(s['guaranteed_salary']), base + rost + max(other, 0) +
                                         sum(op['per'] * op['span'] for op in options if op['y'] == y)),
               'cap': base + pro + o_exer + o_pend + rost + other}
        if void: row['void'] = True
        else:
            wo = min(max(other, 0), k(s['workout_bonus']))
            if wo: row['wo'] = wo          # workout bonus (part of `other`); convertible in a restructure
        out.append(row)
    out.sort(key=lambda s: s['y'])
    run = []
    for s in out:   # contiguous run from start
        if s['y'] == start + len(run): run.append(s)
        else: break
    while run and run[0].get('void'): run.pop(0)
    if not run or all(r.get('void') for r in run): return [], []
    pend = [{'y': op['y'], 'per': op['per'], 'span': op['span']} for op in options if op['y'] >= start]
    return run, pend

# ---------- stats + snaps ----------
stats = {2024: {}, 2025: {}, 2026: {}}
for yr in (2024, 2025, 2026):
    for r in csv.DictReader(open(os.path.join(RAW, f'stats_player_reg_{yr}.csv'))):
        stats[yr][r['player_id']] = r

SNAP_YEARS = (2024, 2025, 2026)
snaps = {yr: defaultdict(lambda: {'g': 0, 'off': 0.0, 'def': 0.0, 'st': 0.0, 'g_off': 0, 'g_def': 0, 'g_st': 0}) for yr in SNAP_YEARS}
team_games = {yr: defaultdict(set) for yr in SNAP_YEARS}
for yr in SNAP_YEARS:
    for r in csv.DictReader(open(os.path.join(RAW, f'snap_counts_{yr}.csv'))):
        if r['game_type'] != 'REG': continue
        g = pfr_to_gsis.get(r['pfr_player_id'])
        team_games[yr][r['team']].add(r['game_id'])
        if not g: continue
        s = snaps[yr][g]
        s['g'] += 1; s['off'] += fnum(r['offense_pct']); s['def'] += fnum(r['defense_pct']); s['st'] += fnum(r['st_pct'])
        for side, col in (('off', 'offense_pct'), ('def', 'defense_pct'), ('st', 'st_pct')):
            if fnum(r[col]) > 0: s['g_' + side] += 1
games_in = {yr: max(len(v) for v in team_games[yr].values()) for yr in SNAP_YEARS}

def snap_share(g, yr, side):
    """Average snap share over the whole team season (missed games count as 0)."""
    s = snaps[yr].get(g)
    if not s: return 0.0
    return s[side] / games_in[yr]

# ---------- rating model ----------
def per_game(st_, key):
    gp = fnum(st_.get('games')) or 1
    return fnum(st_.get(key)) / gp

def features(g, pos, yrs=None):
    """Weighted blend of production features. On-field rating: 2025 (.45) + 2026-to-date (.55).
    Market value uses only seasons before the 2026 free-agency period: 2024 (.4) + 2025 (.6)."""
    if yrs is None: yrs = ((2024, 0.45), (2025, 0.55)) if W1 else ((2025, 0.45), (2026, 0.55))
    feats = {}
    tot_w = 0
    for yr, w in yrs:
        s = stats[yr].get(g, {})
        side = 'off' if pos in ('QB', 'RB', 'WR', 'TE', 'OT', 'IOL') else 'def' if pos in ('DL', 'EDGE', 'LB', 'CB', 'S') else 'st'
        f = {'snap': snap_share(g, yr, side)}
        if pos == 'QB':
            db = fnum(s.get('attempts')) + fnum(s.get('sacks_suffered')) + 1
            f['epa'] = (fnum(s.get('passing_epa')) + fnum(s.get('rushing_epa'))) / db if db > 60 else -0.1
            f['cpoe'] = fnum(s.get('passing_cpoe')) if db > 60 else -3
            f['vol'] = per_game(s, 'passing_yards')
        elif pos == 'RB':
            car = fnum(s.get('carries'))
            f['ypc'] = fnum(s.get('rushing_yards')) / car if car > 30 else 3.5
            f['scrim'] = per_game(s, 'rushing_yards') + per_game(s, 'receiving_yards')
            f['epa'] = (fnum(s.get('rushing_epa')) + fnum(s.get('receiving_epa'))) / (car + fnum(s.get('targets')) + 1)
        elif pos in ('WR', 'TE'):
            f['yds'] = per_game(s, 'receiving_yards')
            f['ts'] = fnum(s.get('target_share'))
            f['epa'] = fnum(s.get('receiving_epa')) / (fnum(s.get('targets')) + 5)
        elif pos in ('DL', 'EDGE'):
            f['pr'] = per_game(s, 'def_sacks') * 2 + per_game(s, 'def_qb_hits') + per_game(s, 'def_tackles_for_loss') * 0.7
        elif pos == 'LB':
            f['tk'] = per_game(s, 'def_tackles_solo') + 0.5 * per_game(s, 'def_tackle_assists')
            f['play'] = per_game(s, 'def_tackles_for_loss') + per_game(s, 'def_sacks') * 1.5 + per_game(s, 'def_pass_defended')
        elif pos in ('CB', 'S'):
            f['ball'] = per_game(s, 'def_pass_defended') + per_game(s, 'def_interceptions') * 2.5
            f['tk'] = per_game(s, 'def_tackles_solo')
        elif pos == 'K':
            att = fnum(s.get('fg_att'))
            f['acc'] = fnum(s.get('fg_made')) / att if att >= 5 else 0.78
            f['long'] = fnum(s.get('fg_made_50_59')) + 2 * fnum(s.get('fg_made_60_'))   # 60+ range counts double
        elif pos == 'P':
            pa = fnum(s.get('pt_att'))
            f['net'] = fnum(s.get('pt_net_yards')) / pa if pa >= 10 else 38
        for kk, v in f.items(): feats[kk] = feats.get(kk, 0) + w * v
        tot_w += w
    return feats

WEIGHTS = {  # feature weights per position; snap share is how much the real coaching staff trusts him
 'QB': {'snap': 1.0, 'epa': 1.6, 'cpoe': 0.6, 'vol': 0.6},
 'RB': {'snap': 1.0, 'ypc': 0.5, 'scrim': 1.0, 'epa': 0.5},
 'WR': {'snap': 0.9, 'yds': 1.2, 'ts': 0.8, 'epa': 0.4},
 'TE': {'snap': 1.1, 'yds': 1.0, 'ts': 0.5, 'epa': 0.3},
 'OT': {'snap': 1.0}, 'IOL': {'snap': 1.0},
 'DL': {'snap': 1.1, 'pr': 0.9}, 'EDGE': {'snap': 0.8, 'pr': 1.3},
 'LB': {'snap': 1.1, 'tk': 0.6, 'play': 0.6},
 'CB': {'snap': 1.2, 'ball': 0.7, 'tk': 0.2}, 'S': {'snap': 1.2, 'ball': 0.5, 'tk': 0.4},
 'K': {'acc': 1.0, 'long': 0.5, 'snap': 0.3}, 'P': {'net': 1.0, 'snap': 0.3}, 'LS': {'snap': 1.0},
}

# ---------- the real 2026 season: rosters (weekly), for the two season starts ----------
# Current file: each player's latest weekly row. Week-1 file: his week-1 row. ACT/INA = on the 53, RES = injured reserve.
weekly = defaultdict(dict)
for r in csv.DictReader(open(os.path.join(RAW, f'roster_weekly_{SEASON}.csv'))):
    if r['gsis_id'] and r['game_type'] == 'REG': weekly[r['gsis_id']][int(r['week'])] = r
season_team = {}
for g, wk in weekly.items():
    r = wk.get(1) if W1 else wk[max(wk)]
    if not r or r['status'] not in ('ACT', 'INA', 'RES'): continue
    t = ROSTER_FIX.get(r['team'], r['team'])
    if t in NAME_TO_ABBR.values(): season_team[g] = (t, r['status'] == 'RES')

# ---------- assemble players ----------
players = []
for g, c in contracts.items():
    r = roster.get(g)
    pos_src = c['position']
    pos = POS_MAP.get(pos_src) or POS_MAP.get((r or {}).get('depth_chart_position', '')) or POS_MAP.get((r or {}).get('position', ''))
    if not pos: continue
    team = None
    if r:
        team = ROSTER_FIX.get(r['team'], r['team'])
    else:
        team = NAME_TO_ABBR.get(c['team'])
    years, options = contract_years(c)
    xw = players_xw.get(g, {})
    bd = (r or {}).get('birth_date') or xw.get('birth_date') or c['date_of_birth']
    age = age_on(bd)
    if age is None:
        dy = c['draft_year'] or (int(xw['rookie_season']) if xw.get('rookie_season') else None)
        age = (START_YEAR - dy + 22) if dy else 27
    if not r and not years and g not in season_team:
        continue  # not on a 2026 roster and no future contract: effectively out of the league
    on_roster = r is not None
    p = {
        'id': g, 'name': c['player'], 'pos': pos, 'opos': pos_src, 'age': age,
        'team': team if (years and team in NAME_TO_ABBR.values()) else None,
        'prevTeam': team if team in NAME_TO_ABBR.values() else None,
        'exp': int(xw['years_of_experience']) if xw.get('years_of_experience', '').isdigit() else max(0, age - 22),
        'draft': [c['draft_year'] or 0, c['draft_round'] or 0, c['draft_overall'] or 0],
        'apy': k(c['apy']), 'signed': c['year_signed'], 'gtdTotal': k(c['guaranteed']),
        'years': years, 'options': options,
        'status': (r or {}).get('status', 'FA'),
    }
    if g in jersey: p['num'] = jersey[g][1]
    p['_f'] = features(g, pos)
    p['_fp'] = features(g, pos, ((2024, 0.4), (2025, 0.6)))
    players.append(p)

by_pos = defaultdict(list)
for p in players: by_pos[p['pos']].append(p)

# ---------- on-field rating ----------
# 1. Production per season (2024, 2025, 2026-to-date) as rates per game PLAYED, weighted toward recent
#    seasons; missed games never lower a rating. CB/S coverage uses PFR per-target data (yards/target,
#    passer rating and completion % allowed) once a player has enough targets.
# 2. Track record (no salary): Pro Bowls / All-Pros fading with age, draft slot early in a career, and
#    otherwise regression toward a ~70 player. Small samples lean on it.
# 3. One league-wide scale, then position ceilings so each position's best lands around 93-97.
RATE_YEARS = {2024: 0.35, 2025: 0.50} if W1 else {2024: 0.15, 2025: 0.35, 2026: 0.50}   # recency weights (times games played)
STARTER_SLOTS = {'QB': 1, 'RB': 1, 'WR': 3, 'TE': 1, 'OT': 2, 'IOL': 3, 'EDGE': 2, 'DL': 2, 'LB': 2, 'CB': 3, 'S': 2, 'K': 1, 'P': 1, 'LS': 1}
OFF_POS = ('QB', 'RB', 'WR', 'TE', 'OT', 'IOL')
def side_of(pos): return 'off' if pos in OFF_POS else 'st' if pos in ('K', 'P', 'LS') else 'def'
RWEIGHTS = dict(WEIGHTS)
# coverage: lower yards/target, rating and completion % allowed are better (negative weights)
RWEIGHTS['CB'] = {'snap': 0.6, 'ypt': -0.8, 'rat': -0.8, 'cmp': -0.4, 'ball': 0.2}
RWEIGHTS['S'] = {'snap': 0.8, 'ypt': -0.5, 'rat': -0.5, 'cmp': -0.2, 'tk': 0.3, 'ball': 0.2}
RWEIGHTS['K'] = {'acc': 1.0, 'long': 1.0, 'snap': 0.1}       # accuracy and range (50+ yard makes)
COV_KEYS = ('ypt', 'rat', 'cmp')
MIN_TGT = {2024: 25, 2025: 25, 2026: 12}                     # targets needed before coverage numbers count
PROD_W = {'OT': 0.45, 'IOL': 0.45, 'LS': 0.3, 'LB': 0.8}     # how much stats can separate players here
Z70 = -1.0                                                  # starter-relative score of a ~70-rated player

# PFR advanced defense (season level). Multi-team seasons: use the combined "2TM"/"3TM" row.
coverage = defaultdict(dict)
_cov_rows = defaultdict(list)
for r in csv.DictReader(open(os.path.join(RAW, 'advstats_season_def.csv'))):
    if r['season'].isdigit() and int(r['season']) in RATE_YEARS and r['pfr_id'] in pfr_to_gsis:
        _cov_rows[(pfr_to_gsis[r['pfr_id']], int(r['season']))].append(r)
for (g, yr), rows in _cov_rows.items():
    r = next((x for x in rows if x['tm'].endswith('TM')), rows[0])
    tgt = fnum(r['tgt'])
    if tgt > 0:
        coverage[g][yr] = {'tgt': tgt, 'ypt': fnum(r['yds_tgt']), 'rat': fnum(r['rat']), 'cmp': fnum(r['cmp_percent'])}

def season_rate(g, pos, yr):
    sn = snaps[yr].get(g); side = side_of(pos)
    gp_snap = sn['g_' + side] if sn else 0
    gp = max(gp_snap, int(fnum(stats[yr].get(g, {}).get('games'))))
    if gp == 0: return None, 0
    f = features(g, pos, ((yr, 1.0),))                      # per-game stat features for that season
    f['snap'] = (sn[side] / gp_snap) if gp_snap else 0.0     # share of snaps in games he played
    if pos in ('CB', 'S'):
        c = coverage.get(g, {}).get(yr)
        if c and c['tgt'] >= MIN_TGT[yr]:
            for k_ in COV_KEYS: f[k_] = c[k_]
    return f, gp

pb_now, ap_now = {}, {}
for r in csv.DictReader(open(os.path.join(RAW, 'draft_picks.csv'))):
    if r['gsis_id']:
        if r['probowls'].isdigit(): pb_now[r['gsis_id']] = int(r['probowls'])
        if r['allpro'].isdigit(): ap_now[r['gsis_id']] = int(r['allpro'])
_ovp = os.path.join(ROOT, 'data', 'overrides.csv')
if os.path.exists(_ovp):
    for r in csv.DictReader(open(_ovp)):
        if r['field'] == 'pb': pb_now[r['gsis_id']] = int(r['value'])

for p in players:
    p['_seasons'] = {}
    for yr in RATE_YEARS:
        f, gp = season_rate(p['id'], p['pos'], yr)
        if f: p['_seasons'][yr] = [f, gp, None]

def zscore(vals):
    m = st.mean(vals); sd = st.pstdev(vals) or 1.0
    return m, sd

for pos, lst in by_pos.items():
    w = RWEIGHTS[pos]
    # production z per season, against that season's regulars at the position (missing coverage = average)
    for yr in RATE_YEARS:
        regs = [p for p in lst if yr in p['_seasons'] and p['_seasons'][yr][1] >= 4 and p['_seasons'][yr][0]['snap'] >= 0.3]
        if len(regs) < 5: continue
        mu, sd = {}, {}
        for k_ in w:
            vals = [p['_seasons'][yr][0][k_] for p in regs if k_ in p['_seasons'][yr][0]]
            if len(vals) >= 5: mu[k_], sd[k_] = st.mean(vals), (st.pstdev(vals) or 1)
        for p in lst:
            sea = p['_seasons'].get(yr)
            if not sea: continue
            f = sea[0]
            sea[2] = sum(w[k_] * (f[k_] - mu[k_]) / sd[k_] for k_ in w if k_ in mu and k_ in f) / sum(abs(v) for v in w.values())
    pw = PROD_W.get(pos, 1.0)
    for p in lst:
        num = den = games = 0.0
        for yr, rw in RATE_YEARS.items():
            sea = p['_seasons'].get(yr)
            if not sea or sea[2] is None: continue
            gp = sea[1]
            if pos in ('CB', 'S') and 'ypt' not in sea[0]: gp *= 0.5     # too few targets: lean on track record
            num += rw * gp * sea[2]; den += rw * gp
            games += gp * rw / 0.5                                      # 2026 game = 1, 2025 = .7, 2024 = .3
        p['_prod'] = num / den if den else None
        p['_rel'] = (games / (games + 10.0)) * pw if den else 0.0
    # production on the starter-relative scale (distance above this position's starter-level group)
    n_st = max(8, int(32 * STARTER_SLOTS.get(pos, 1) * 1.5))
    known = sorted((p['_prod'] for p in lst if p['_prod'] is not None and p['_rel'] >= 0.3), reverse=True)[:n_st] or [0.0]
    m, sd = zscore(known)
    def rookie_deal(p): return p['draft'][0] and p['signed'] == p['draft'][0]
    vet_apy = sorted(p['apy'] for p in lst if not rookie_deal(p))
    spec = 0.6 if pos in ('K', 'P', 'LS') else 1.0           # specialists: narrow range of impact
    # contract rank counts only in proportion to recent playing time (a big salary can't prop up a player
    # who isn't on the field), and most where stats can't separate players (linemen)
    mkt_w = {'OT': 1.6, 'IOL': 1.6, 'LS': 0.8}.get(pos, 0.6)
    for p in lst:
        prod_z = (p['_prod'] - m) / sd if p['_prod'] is not None else Z70
        pb, ap = pb_now.get(p['id'], 0), ap_now.get(p['id'], 0)
        # honors count for less the further a player is past 29 (career totals can't say how recent they are)
        fade = 1.0 if p['age'] <= 29 else max(0.2, 1 - 0.18 * (p['age'] - 29))
        pick = p['draft'][2] or 0
        draft = (1 - math.log(pick) / math.log(260)) if pick else 0.0
        young = max(0.0, 1 - p['exp'] / 5)                     # draft slot fades over five seasons
        prior = Z70 + (0.35 * min(pb, 4) + 0.35 * min(ap, 2)) * fade + 1.6 * draft * young
        if vet_apy and not rookie_deal(p):
            played = min(1.0, sum(sea[1] * RATE_YEARS[yr] / 0.5 for yr, sea in p['_seasons'].items()) / 20.0)
            apy_pct = sum(1 for a_ in vet_apy if a_ <= p['apy']) / len(vet_apy)
            prior += mkt_w * apy_pct * played
        rel = p['_rel']
        p['_z'] = (rel * (0.75 * prod_z + 0.25 * prior) + (1 - rel) * prior) * spec

# one league-wide scale: rank everyone together, then map rank -> rating through fixed anchors
ANCHORS = [(1, 99), (3, 97), (8, 95), (25, 93), (70, 90), (160, 85), (320, 79), (520, 74), (800, 68), (1150, 62), (1600, 56), (2100, 50), (2600, 45)]
def rank_to_ovr(rk):
    for (r0, o0), (r1, o1) in zip(ANCHORS, ANCHORS[1:]):
        if rk <= r1: return o0 + (o1 - o0) * (rk - r0) / (r1 - r0)
    return ANCHORS[-1][1]
pool = sorted(players, key=lambda p: -p['_z'])
for i, p in enumerate(pool): p['_ovr'] = rank_to_ovr(i + 1)
# position ceilings: each position's best lands between 93 and 97 (strongest tops first), specialists at
# 90 or below; ratings above 80 are stretched or squeezed within the position to fit the ceiling
best = sorted(((max(by_pos[pos], key=lambda p: p['_z']), pos) for pos in by_pos if pos not in ('K', 'P', 'LS')), key=lambda x: -x[0]['_z'])
CEILS = [97, 97, 96, 96, 95, 95, 95, 94, 94, 94, 93]
ceiling = {pos: CEILS[min(i, len(CEILS) - 1)] for i, (_, pos) in enumerate(best)}
ceiling.update({'K': 90, 'P': 88, 'LS': 80})
for pos, lst in by_pos.items():
    top = max(p['_ovr'] for p in lst)
    T = ceiling[pos]
    for p in lst:
        o = p['_ovr']
        if o > 80 and top > 80: o = 80 + (o - 80) * (T - 80) / (top - 80)
        elif top <= 80: o = min(o, T)
        p['ovr'] = int(math.floor(max(40, min(T, o)) + 1e-9))

# ---------- development trait (Slow / Normal / Fast / Elite) ----------
# From the data: improvement 2024 -> 2026 relative to what's normal for his age, draft slot (young players)
# and early Pro Bowls. League split: top 5% Elite, next 20% Fast, bottom 15% Slow, the rest Normal.
def expected_trend(age):   # typical yearly change in production z by age
    return 0.25 if age <= 24 else 0.1 if age <= 27 else 0.0 if age <= 29 else -0.2
for p in players:
    zs = {yr: v[2] for yr, v in p['_seasons'].items() if v[2] is not None and v[1] >= 4}
    ys = sorted(zs)
    trend = (zs[ys[-1]] - zs[ys[0]]) / (ys[-1] - ys[0]) if len(ys) >= 2 else 0.0
    rel = max(-1.5, min(1.5, trend - expected_trend(p['age'] - 1))) if len(ys) >= 2 else 0.0
    pick = p['draft'][2] or 0
    draft = (1 - math.log(pick) / math.log(260)) if pick else 0.0
    young = p['age'] <= 26
    p['_dev'] = 0.8 * rel + draft * (0.7 if young else 0.25) + (0.9 if young and pb_now.get(p['id'], 0) > 0 else 0) + (max(0, p['ovr'] - 80) / 15 if young else 0)
ranked = sorted(players, key=lambda p: -p['_dev'])
n = len(ranked)
for i, p in enumerate(ranked):
    q = i / n
    p['trait'] = 'Elite' if q < 0.05 else 'Fast' if q < 0.25 else 'Slow' if q >= 0.85 else 'Normal'
TRAIT_UPSIDE = {'Slow': 0.5, 'Normal': 1.0, 'Fast': 1.4, 'Elite': 1.8}
for p in players:
    up = max(0, 27 - p['age']) * 2.2 * TRAIT_UPSIDE[p['trait']]   # potential: youth upside, scaled by trait
    p['pot'] = min(99, max(p['ovr'], round(p['ovr'] + up)))

# ---------- market value (separate from the on-field rating) ----------
# How the real NFL values each player, using only information from before the 2026 free-agency period:
#   veterans: most recent pre-2026 contract APY as a share of the cap that year, adjusted for age and
#             2024-25 production; players on rookie deals: draft slot plus 2024-25 production.
# Coefficients are fit on 2024-25 UFA signings; the 2026 UFA class is held out as the test set.
CAP_HIST = {2015: 143280, 2016: 155270, 2017: 167000, 2018: 177200, 2019: 188200, 2020: 198200, 2021: 182500,
            2022: 208200, 2023: 224800, 2024: 255400, 2025: 279200, 2026: 301200}
# production percentile within position from 2024-25 stats only
for pos, lst in by_pos.items():
    w = WEIGHTS[pos]
    regs = [p for p in lst if p['_fp'].get('snap', 0) > 0.15] or lst
    mu = {f: st.mean(p['_fp'].get(f, 0) for p in regs) for f in w}
    sd = {f: (st.pstdev(p['_fp'].get(f, 0) for p in regs) or 1) for f in w}
    for p in lst:
        z = sum(w[f] * (p['_fp'].get(f, 0) - mu[f]) / sd[f] for f in w) / sum(w.values())
        trust = min(1.0, p['_fp'].get('snap', 0) / 0.45)
        p['_prod'] = trust * z + (1 - trust) * -1.0
    sc = sorted(p['_prod'] for p in lst)
    for p in lst:
        p['_prodPct'] = (sum(1 for x in sc if x < p['_prod']) + 0.5) / len(sc)

ROOKIE_TYPES = ('Drafted', 'UDFA')
def history(g):
    c = contracts.get(g)
    if not c: return []
    seen, out = set(), []
    for h in c['contract_history'] or []:
        if h['contract_type'] == 'Practice' or not h['apy'] or h['year_signed'] not in CAP_HIST: continue
        key = (h['year_signed'], h['team'], round(h['apy'], 3), h['contract_type'])
        if key in seen: continue
        seen.add(key); out.append(h)
    return sorted(out, key=lambda h: h['year_signed'])

def mv_features(p, before_year, age):
    """Feature row for the market model using contracts signed before `before_year`."""
    prior = [h for h in history(p['id']) if h['year_signed'] < before_year]
    last = prior[-1] if prior else None
    top = math.log(TOP_SHARE[p['pos']])
    prod = p['_prodPct'] - 0.5
    side = 'off' if p['pos'] in ('QB', 'RB', 'WR', 'TE', 'OT', 'IOL') else 'def' if p['pos'] not in ('K', 'P', 'LS') else 'st'
    snap = snap_share(p['id'], 2025, side)           # 2025 playing time (before 2026 free agency)
    grp = {'QB': 0, 'RB': 1, 'WR': 1, 'TE': 1, 'OT': 2, 'IOL': 2, 'EDGE': 3, 'DL': 3, 'LB': 4, 'CB': 5, 'S': 5}.get(p['pos'], 6)
    dummies = [1.0 if grp == i else 0.0 for i in range(1, 7)]       # position-group effects (QB = base)
    if last and last['contract_type'] not in ROOKIE_TYPES:
        share = max(0.002, last['apy'] * 1000 / CAP_HIST[last['year_signed']])
        return 'vet', [1.0, math.log(share), prod, max(0, age - 29), top, before_year - last['year_signed'], snap] + dummies
    pick = p['draft'][2] or 300
    return 'rookie', [1.0, math.log(pick), prod, top, age - 26, snap, prod * prod, 1.0 if p['draft'][1] == 1 else 0.0] + dummies

TOP_SHARE = {'QB': .183, 'EDGE': .144, 'WR': .120, 'DL': .111, 'CB': .100, 'OT': .089, 'IOL': .078, 'S': .073,
             'RB': .068, 'LB': .068, 'TE': .058, 'K': .021, 'P': .012, 'LS': .0054}

def lstsq(X, y, ridge=0.5):
    n = len(X[0])
    A = [[sum(r[i] * r[j] for r in X) + (ridge if i == j and i > 0 else 0) for j in range(n)] for i in range(n)]
    b = [sum(r[i] * t for r, t in zip(X, y)) for i in range(n)]
    for i in range(n):                         # Gaussian elimination
        piv = max(range(i, n), key=lambda k: abs(A[k][i])); A[i], A[piv] = A[piv], A[i]; b[i], b[piv] = b[piv], b[i]
        for k in range(i + 1, n):
            f = A[k][i] / A[i][i]
            for j in range(i, n): A[k][j] -= f * A[i][j]
            b[k] -= f * b[i]
    x = [0.0] * n
    for i in reversed(range(n)): x[i] = (b[i] - sum(A[i][j] * x[j] for j in range(i + 1, n))) / A[i][i]
    return x

TRAIN_YEARS = (2022, 2023, 2024, 2025)
by_id = {p['id']: p for p in players}
train = {'vet': ([], []), 'rookie': ([], [])}
holdout = []
for p in players:
    for h in history(p['id']):
        if h['contract_type'] != 'UFA': continue
        share = h['apy'] * 1000 / CAP_HIST[h['year_signed']]
        # train on the same kind of deal as the test set: real multi-million contracts (>= ~$2M at the 2026 cap)
        if h['year_signed'] in TRAIN_YEARS and share >= 0.0066:
            kind, x = mv_features(p, h['year_signed'], p['age'] - (START_YEAR - h['year_signed']))
            train[kind][0].append(x); train[kind][1].append(math.log(share))
        elif h['year_signed'] == 2026 and h['apy'] >= 2.0:
            holdout.append({'id': p['id'], 'name': p['player'] if 'player' in p else p['name'], 'pos': p['pos'],
                            'years': h['yrs'], 'total': h['total'], 'gtd': h['guarantees'], 'share': round(share, 5)})
coef = {k: lstsq(X, y) for k, (X, y) in train.items()}
# Least squares on weak inputs shrinks predictions toward the average (top free agents come out too low,
# fringe ones too high). Stretch each model's predictions around its mean by the factor that works best
# on the TRAINING deals (the 2026 test class is never used to choose it).
stretch = {}
for kind_, (X, y) in train.items():   # (don't reuse `k`: it's the $M -> $K helper)
    pr = [sum(a * b for a, b in zip(x, coef[kind_])) for x in X]
    m = sum(pr) / len(pr)
    def hit(f): return sum(abs(math.exp(m + f * (q - m) - t) - 1) <= 0.3 for q, t in zip(pr, y)) / len(y)
    best_f = max((f / 20 for f in range(20, 61)), key=hit)
    stretch[kind_] = (m, best_f, round(hit(1.0), 3), round(hit(best_f), 3))
print('stretch (mean, factor, train within-30% before, after):', stretch)
def predict(kind, x):
    q = sum(a * b for a, b in zip(x, coef[kind])); m, f = stretch[kind][0], stretch[kind][1]
    return math.exp(m + f * (q - m))

def resid(k):
    X, y = train[k]
    e = sorted(abs(sum(a * b for a, b in zip(x, coef[k])) - t) for x, t in zip(X, y))
    return e[len(e) // 2]
print('market model fit:', {k: (len(train[k][1]), [round(c, 3) for c in coef[k]], 'median |log err| %.2f' % resid(k)) for k in coef})
for p in players:
    kind, x = mv_features(p, 2026, p['age'] - 1)
    p['mv'] = round(max(0.0028, predict(kind, x)), 5)   # share of the cap
    p['mvKind'] = kind
if not W1: json.dump(sorted(holdout, key=lambda h: -h['share']), open(os.path.join(ROOT, 'tests', 'fa_holdout_2026.json'), 'w'), indent=0)
# The held-out comparison is reported in one place only: tests/fa_market.test.js reads the market
# values written to src/data.json, so the pipeline and the game can't disagree.
print('held-out 2026 UFA deals ($2M+):', len(holdout))

# ---------- salary curve: pay by rating, fit on ALL current contracts (minimums and rookie deals too) ----------
# share = floor + L * TOP[pos] * ((ovr - a) / (99 - a)) ** b. Shape (a, b) fit on every current contract;
# level L set so a full league (best 53 x 32 players) is paid ~95% of the cap: pay fills the cap.
cur = [p for p in players if p['years'] and p['signed'] in CAP_HIST or (p['years'] and p['signed'] == START_YEAR)]
pts = [(p['pos'], p['ovr'], p['apy'] / CAP_HIST.get(p['signed'], CAP_2027)) for p in players if p['years'] and p['signed'] in CAP_HIST]
FLOOR = 0.0029
FILL = 0.95
top_league = sorted(players, key=lambda p: -p['ovr'])[:53 * 32]
best = None
for a in range(10, 72, 2):
    for b10 in range(10, 50, 2):
        b = b10 / 10
        g = [TOP_SHARE[pos] * max(0.0, (o - a) / (99 - a)) ** b for pos, o, _ in pts]
        gl = sum(TOP_SHARE[p['pos']] * max(0.0, (p['ovr'] - a) / (99 - a)) ** b for p in top_league)
        L = (FILL * 32 - FLOOR * len(top_league)) / max(1e-9, gl)
        err = sum((FLOOR + L * gi - sh) ** 2 for gi, (_, _, sh) in zip(g, pts))
        if not best or err < best[0]: best = (err, a, b, L)
_, CA, CB, CL = best
print('salary curve fit on %d contracts: a=%d b=%.1f L=%.3f' % (len(pts), CA, CB, CL))
top1696 = sorted(players, key=lambda p: -p['ovr'])[:53 * 32]
fill = sum(FLOOR + CL * TOP_SHARE[p['pos']] * max(0.0, (p['ovr'] - CA) / (99 - CA)) ** CB for p in top1696) / 32
print('curve pay for the best 53x32 players = %.0f%% of the cap per team' % (fill * 100))

# ---------- position-specific sub-ratings (display only: OVR does not use them) ----------
# Each is a recency-weighted rate from real stats (2024 .15 / 2025 .35 / 2026 .50, same as OVR), turned into a
# percentile within the position, then blended with OVR so backups with tiny samples don't look elite.
pfrdef = defaultdict(dict)
for (g, yr), rows in _cov_rows.items():
    r = next((x for x in rows if x['tm'].endswith('TM')), rows[0])
    pfrdef[g][yr] = {k_: fnum(r[k_]) for k_ in ('g', 'tgt', 'cmp', 'yds', 'prss', 'comb', 'm_tkl', 'int')}

def _n(s, *keys): return sum(fnum(s.get(k_)) for k_ in keys)
def _gp(s): return fnum(s.get('games'))
def _sn(g, yr, side):
    x = snaps[yr].get(g); return (x[side] / x['g_' + side], 1) if x and x['g_' + side] else (0, 0)
def _avail(g, yr, side):
    x = snaps[yr].get(g); return ((x['g_' + side] if x else 0), games_in[yr])
def _pd(key_num, key_den, sign=1):
    return lambda g, yr, s, d: ((sign * sum(d[k_] for k_ in key_num) if d else 0), (sum(d[k_] for k_ in key_den) if d else 0))
SURE = _pd(('m_tkl',), ('comb', 'm_tkl'), -1)
COVY = _pd(('yds',), ('tgt',), -1)
COVC = _pd(('cmp',), ('tgt',), -1)
BLITZ = lambda g, yr, s, d: ((d['prss'] if d else 0), (d['g'] if d else 0))
SUPPORT = lambda g, yr, s, d: (_n(s, 'def_tackles_solo'), _gp(s))
BALL = lambda g, yr, s, d: (_n(s, 'def_pass_defended') + 2.5 * _n(s, 'def_interceptions'), _gp(s))
SUBS = {   # key, label, per-season (numerator, denominator), minimum total denominator
 'QB': [('arm', 'Arm', lambda g, yr, s, d: (_n(s, 'passing_air_yards'), _n(s, 'attempts')), 120),
        ('acc', 'Accuracy', lambda g, yr, s, d: (fnum(s.get('passing_cpoe')) * _n(s, 'attempts'), _n(s, 'attempts')), 120),
        ('dec', 'Decisions', lambda g, yr, s, d: (-_n(s, 'passing_interceptions'), _n(s, 'attempts')), 120),
        ('pkt', 'Pocket', lambda g, yr, s, d: (-_n(s, 'sacks_suffered'), _n(s, 'attempts', 'sacks_suffered')), 120),
        ('mob', 'Mobility', lambda g, yr, s, d: (_n(s, 'rushing_yards'), _gp(s)), 4),
        ('eff', 'Efficiency', lambda g, yr, s, d: (_n(s, 'passing_epa', 'rushing_epa'), _n(s, 'attempts', 'sacks_suffered', 'carries')), 120)],
 'RB': [('rush', 'Rushing', lambda g, yr, s, d: (_n(s, 'rushing_yards'), _n(s, 'carries')), 40),
        ('brk', 'Breakaway', lambda g, yr, s, d: (_n(s, 'rushing_20'), _n(s, 'carries')), 40),
        ('rec', 'Receiving', lambda g, yr, s, d: (_n(s, 'receiving_yards'), _gp(s)), 4),
        ('sec', 'Ball security', lambda g, yr, s, d: (-_n(s, 'rushing_fumbles_lost', 'receiving_fumbles_lost'), _n(s, 'carries', 'receptions')), 50),
        ('load', 'Workload', lambda g, yr, s, d: (_n(s, 'carries', 'receptions'), _gp(s)), 4)],
 'WR': [('hands', 'Hands', lambda g, yr, s, d: (_n(s, 'receptions'), _n(s, 'targets')), 20),
        ('deep', 'Deep threat', lambda g, yr, s, d: (_n(s, 'receiving_air_yards'), _n(s, 'targets')), 20),
        ('yac', 'After catch', lambda g, yr, s, d: (_n(s, 'receiving_yards_after_catch'), _n(s, 'receptions')), 12),
        ('prod', 'Production', lambda g, yr, s, d: (_n(s, 'receiving_yards'), _gp(s)), 4),
        ('use', 'Usage', lambda g, yr, s, d: (fnum(s.get('target_share')) * _gp(s), _gp(s)), 4)],
 'TE': [('hands', 'Hands', lambda g, yr, s, d: (_n(s, 'receptions'), _n(s, 'targets')), 15),
        ('yac', 'After catch', lambda g, yr, s, d: (_n(s, 'receiving_yards_after_catch'), _n(s, 'receptions')), 10),
        ('prod', 'Production', lambda g, yr, s, d: (_n(s, 'receiving_yards'), _gp(s)), 4),
        ('use', 'Usage', lambda g, yr, s, d: (fnum(s.get('target_share')) * _gp(s), _gp(s)), 4),
        ('role', 'Snap share', lambda g, yr, s, d: _sn(g, yr, 'off'), 1)],
 'OT': [('avail', 'Availability', lambda g, yr, s, d: _avail(g, yr, 'off'), 8),
        ('role', 'Snap share', lambda g, yr, s, d: _sn(g, yr, 'off'), 1),
        ('disc', 'Discipline', lambda g, yr, s, d: (-_n(s, 'penalties'), _avail(g, yr, 'off')[0]), 8),
        ('exp', 'Experience', None, 0)],
 'EDGE': [('rush', 'Pass rush', lambda g, yr, s, d: (2 * _n(s, 'def_sacks') + _n(s, 'def_qb_hits'), _gp(s)), 4),
          ('prs', 'Pressure', BLITZ, 4),
          ('run', 'Run stop', lambda g, yr, s, d: (_n(s, 'def_tackles_for_loss'), _gp(s)), 4),
          ('sure', 'Sure tackling', SURE, 15),
          ('role', 'Snap share', lambda g, yr, s, d: _sn(g, yr, 'def'), 1)],
 'LB': [('tkl', 'Tackling', lambda g, yr, s, d: (_n(s, 'def_tackles_solo') + 0.5 * _n(s, 'def_tackle_assists'), _gp(s)), 4),
        ('sure', 'Sure tackling', SURE, 20),
        ('cov', 'Coverage', COVY, 12),
        ('blitz', 'Blitz', BLITZ, 4),
        ('play', 'Playmaking', lambda g, yr, s, d: (_n(s, 'def_tackles_for_loss', 'def_pass_defended') + 2 * _n(s, 'def_interceptions', 'def_fumbles_forced'), _gp(s)), 4)],
 'CB': [('cov', 'Coverage', COVY, 20), ('tight', 'Tight coverage', COVC, 20), ('ball', 'Ball skills', BALL, 4),
        ('sure', 'Sure tackling', SURE, 15), ('sup', 'Run support', SUPPORT, 4)],
 'S': [('cov', 'Coverage', COVY, 12), ('ball', 'Ball skills', BALL, 4), ('sure', 'Sure tackling', SURE, 15),
       ('sup', 'Run support', SUPPORT, 4), ('blitz', 'Blitz', BLITZ, 4)],
 'K': [('acc', 'Accuracy', lambda g, yr, s, d: (_n(s, 'fg_made'), _n(s, 'fg_att')), 8),
       ('leg', 'Leg', lambda g, yr, s, d: (_n(s, 'fg_made_50_59') + 2 * _n(s, 'fg_made_60_'), _gp(s)), 4),
       ('rng', 'Range', lambda g, yr, s, d: (_n(s, 'fg_long') * _gp(s), _gp(s)), 4),
       ('pat', 'Extra points', lambda g, yr, s, d: (_n(s, 'pat_made'), _n(s, 'pat_att')), 10)],
 'P': [('net', 'Net', lambda g, yr, s, d: (_n(s, 'pt_net_yards'), _n(s, 'pt_att')), 15),
       ('pow', 'Power', lambda g, yr, s, d: (_n(s, 'pt_yards'), _n(s, 'pt_att')), 15),
       ('place', 'Placement', lambda g, yr, s, d: (_n(s, 'pt_inside_20'), _n(s, 'pt_att')), 15),
       ('ctrl', 'Control', lambda g, yr, s, d: (-_n(s, 'pt_touchback'), _n(s, 'pt_att')), 15)],
 'LS': [('avail', 'Availability', lambda g, yr, s, d: _avail(g, yr, 'st'), 8), ('exp', 'Experience', None, 0)],
}
SUBS['IOL'] = SUBS['OT']; SUBS['DL'] = SUBS['EDGE']
SUB_LABELS = {pos: [[k_, lab] for k_, lab, _, _ in lst] for pos, lst in SUBS.items()}
SUB_MISSING = 45   # percentile score used when a player has too small a sample
for pos, lst in by_pos.items():
    for key, lab, fn, mind in SUBS[pos]:
        raw = {}
        for p in lst:
            if fn is None: raw[p['id']] = p['exp']; continue
            num = den = 0.0
            for yr, w in RATE_YEARS.items():
                s = stats[yr].get(p['id'], {}); d = pfrdef.get(p['id'], {}).get(yr)
                n_, d_ = fn(p['id'], yr, s, d)
                num += w * n_; den += w * d_
            tot = sum(fn(p['id'], yr, stats[yr].get(p['id'], {}), pfrdef.get(p['id'], {}).get(yr))[1] for yr in RATE_YEARS)
            if tot >= mind and den > 0: raw[p['id']] = num / den
        vals = sorted(raw.values())
        for p in lst:
            v = raw.get(p['id'])
            score = SUB_MISSING if v is None else 40 + 59 * sum(1 for x in vals if x <= v) / len(vals)   # ties share the top of their range
            p.setdefault('sub', {})[key] = max(25, min(99, round(0.35 * p['ovr'] + 0.65 * score)))

# stat lines for the player card: 2024, 2025 and 2026 (to date)
def statline(g, pos, yr):
    s = stats[yr].get(g) or {}
    gp = int(fnum(s.get('games')))
    if not gp: return None
    i = lambda k_: int(fnum(s.get(k_)))
    if pos == 'QB':
        att = i('attempts'); cp = f" · {100 * i('completions') / att:.1f}%" if att else ''
        return f"{gp} G · {i('passing_yards')} yds · {i('passing_tds')} TD · {i('passing_interceptions')} INT{cp} · {i('rushing_yards')} rush yds"
    if pos == 'RB': return f"{gp} G · {i('carries')} car · {i('rushing_yards')} rush yds · {i('rushing_tds')} TD · {i('receptions')} rec · {i('receiving_yards')} rec yds"
    if pos in ('WR', 'TE'): return f"{gp} G · {i('receptions')} rec · {i('targets')} tgt · {i('receiving_yards')} yds · {i('receiving_tds')} TD"
    if pos in ('DL', 'EDGE', 'LB'): return f"{gp} G · {fnum(s.get('def_sacks')):g} sacks · {i('def_qb_hits')} QB hits · {i('def_tackles_for_loss')} TFL · {i('def_tackles_solo')} solo tkl"
    if pos in ('CB', 'S'): return f"{gp} G · {i('def_interceptions')} INT · {i('def_pass_defended')} PD · {i('def_tackles_solo')} solo tkl"
    if pos == 'K': return f"{gp} G · {i('fg_made')}/{i('fg_att')} FG · long {i('fg_long')} · {i('pat_made')}/{i('pat_att')} XP"
    if pos == 'P':
        pa = i('pt_att'); return f"{gp} G · {pa} punts" + (f" · {fnum(s.get('pt_net_yards')) / pa:.1f} net · {i('pt_inside_20')} inside 20" if pa else '')
    return f"{gp} G"
def statlines(g, pos):
    out = []
    for yr in ((2024, 2025) if W1 else (2024, 2025, 2026)):
        t = statline(g, pos, yr)
        if t: out.append([yr, (stats[yr].get(g) or {}).get('recent_team') or '', t])
    return out

# Pro Bowls (Pro Football Reference counts via nflverse draft_picks) and playing time for recent
# first-round picks: both drive the fifth-year option amount.
pro_bowls = {}
for r in csv.DictReader(open(os.path.join(RAW, 'draft_picks.csv'))):
    if r['gsis_id'] and r['probowls'].isdigit(): pro_bowls[r['gsis_id']] = int(r['probowls'])
OFF_POS = ('QB', 'RB', 'WR', 'TE', 'OT', 'IOL')
for p in players:
    p['lines'] = statlines(p['id'], p['pos'])
    for k_ in ('_f', '_score', '_fp', '_prod', '_prodPct', '_seasons', '_prior_raw', '_games', '_z', '_rel', '_ovr', '_dev'): p.pop(k_, None)
    p['pb'] = pro_bowls.get(p['id'], 0)
    if p['draft'][1] == 1 and p['draft'][0] >= START_YEAR - 4:
        side = 'off' if p['pos'] in OFF_POS else 'def' if p['pos'] not in ('K', 'P', 'LS') else 'st'
        p['pt'] = {str(yr): round(snap_share(p['id'], yr, side), 3) for yr in SNAP_YEARS if yr >= p['draft'][0] and not (W1 and yr >= SEASON)}

# ---------- league cap: implied by OverTheCap's cap_percent on big cap hits ----------
implied = []
for c in contracts.values():
    for s_ in c['season_history'] or []:
        if s_['year'] == str(START_YEAR) and s_['cap_percent'] and (s_['cap_number'] or 0) > 40:
            implied.append(s_['cap_number'] / s_['cap_percent'])
CAP_2027 = int(round(st.median(implied) * 10)) * 100 if implied else 326_500
print('implied', START_YEAR, 'cap', CAP_2027, 'from', len(implied), 'contracts')

# ---------- fifth-year option salary tables (prior league year's cap numbers by CBA position group) ----------
OPT_GROUP = {'QB': 'QB', 'RB': 'RB', 'WR': 'WR', 'TE': 'TE', 'OT': 'OL', 'IOL': 'OL', 'EDGE': 'DE', 'DL': 'DT',
             'LB': 'LB', 'CB': 'CB', 'S': 'S', 'K': 'KP', 'P': 'KP', 'LS': 'KP'}
prior = defaultdict(list)
for c in contracts.values():
    grp = OPT_GROUP.get(POS_MAP.get(c['position'], ''), None)
    if not grp: continue
    for s_ in c['season_history'] or []:
        if s_['year'] == str(START_YEAR - 1) and (s_['cap_number'] or 0) > 0:
            prior[grp].append(k(s_['cap_number']))
def avg(lst): return int(round(sum(lst) / len(lst))) if lst else 0
opt_table = {}
for grp, lst in prior.items():
    lst.sort(reverse=True)
    # [2+ Pro Bowls ~ franchise tag (top 5), 1 Pro Bowl ~ transition tag (top 10),
    #  playing-time milestone (3rd-20th), basic (3rd-25th)]
    opt_table[grp] = [avg(lst[:5]), avg(lst[:10]), avg(lst[2:20]), avg(lst[2:25])]

# ---------- draft order from real results of the previous season (nflverse games) ----------
def draft_order(season):
    games = [g for g in csv.DictReader(open(os.path.join(RAW, 'games.csv'))) if g['season'] == str(season) and g['home_score'] != '']
    rec = defaultdict(lambda: [0, 0, 0]); opps = defaultdict(list)
    for g in games:
        if g['game_type'] != 'REG': continue
        h, a, hs, as_ = g['home_team'], g['away_team'], int(g['home_score']), int(g['away_score'])
        opps[h].append(a); opps[a].append(h)
        if hs > as_: rec[h][0] += 1; rec[a][1] += 1
        elif as_ > hs: rec[a][0] += 1; rec[h][1] += 1
        else: rec[h][2] += 1; rec[a][2] += 1
    def wp(t): r = rec[t]; n = sum(r); return (r[0] + r[2] / 2) / n if n else 0
    def sos(t): return sum(wp(o) for o in opps[t]) / len(opps[t]) if opps[t] else 0
    stage = {}   # playoff exit round: 1 WC, 2 DIV, 3 CON, 4 SB loser, 5 champion
    for g in games:
        rnd = {'WC': 1, 'DIV': 2, 'CON': 3, 'SB': 4}.get(g['game_type'])
        if not rnd: continue
        hs, as_ = int(g['home_score']), int(g['away_score'])
        loser, winner = (g['away_team'], g['home_team']) if hs > as_ else (g['home_team'], g['away_team'])
        stage[loser] = rnd
        if rnd == 4: stage[winner] = 5
    teams = sorted(NAME_TO_ABBR.values())
    order = sorted(teams, key=lambda t: (stage.get(t, 0), wp(t), sos(t)))
    reg = sum(1 for g in games if g['game_type'] == 'REG')
    final = reg >= 272 and any(v == 5 for v in stage.values())
    return order, final, reg
d_order, d_final, d_games = draft_order(START_YEAR - 1)
print('draft order', 'final' if d_final else f'provisional ({d_games} of 272 games played)', d_order[:5], '...')

# ---------- hand-edited corrections (data/overrides.csv) ----------
# nflverse can't tell original-ballot Pro Bowls from alternates, so known corrections live here.
OVERRIDE_FIELDS = {'pb': int, 'age': int, 'exp': int, 'ovr': int, 'pot': int, 'pos': str, 'team': str}
ov_path = os.path.join(ROOT, 'data', 'overrides.csv')
if os.path.exists(ov_path):
    by_id = {p['id']: p for p in players}
    for r in csv.DictReader(open(ov_path)):
        p = by_id.get(r['gsis_id'])
        if not p: print('override: no player', r['gsis_id'], r['name']); continue
        if r['field'] not in OVERRIDE_FIELDS: print('override: unknown field', r['field']); continue
        old = p.get(r['field']); p[r['field']] = OVERRIDE_FIELDS[r['field']](r['value'])
        print(f"override: {p['name']} {r['field']} {old} -> {p[r['field']]}")

players.sort(key=lambda p: (p['team'] or 'ZZZ', -p['ovr']))
# ---------- season fields: 2026 contract row, team / injured reserve, stats to date ----------
def season_row(g):
    for c in sorted(all_contracts.get(g, []), key=lambda c: -(c['year_signed'] or 0)):
        if (c['year_signed'] or 0) > SEASON: continue
        run, _ = contract_years(c, SEASON)
        if run and run[0]['y'] == SEASON:
            row = dict(run[0]); row.pop('void', None); return row
    return None
STAT_MAP = {'pyd': ('passing_yards',), 'ptd': ('passing_tds',), 'int': ('passing_interceptions',), 'att': ('attempts',), 'car': ('carries',),
            'ruyd': ('rushing_yards',), 'rutd': ('rushing_tds',), 'rec': ('receptions',), 'ryd': ('receiving_yards',), 'rtd': ('receiving_tds',),
            'sk': ('def_sacks',), 'dint': ('def_interceptions',), 'tk': ('def_tackles_solo', 'def_tackle_assists'), 'fgm': ('fg_made',), 'fga': ('fg_att',)}
for p in players:
    st_ = season_team.get(p['id'])
    if not st_: continue
    p['t26'] = st_[0]
    if st_[1]: p['ir26'] = 1
    row = season_row(p['id'])
    if row: p['y26'] = row
    else:
        # OverTheCap has no yearly detail for many 2026 signings: 2026 rookies get their slotted rookie deal
        # in the game (from the pick number); other deals become flat rows at their average per year.
        c = contracts.get(p['id'])
        if c and c['draft_year'] == SEASON and c['draft_overall'] and (c['year_signed'] or 0) >= SEASON: p['rk26'] = c['draft_overall']
        elif c and c['years'] and (c['year_signed'] or 0) + c['years'] - 1 >= SEASON:
            ap = k(c['apy']); gt = k(c['guaranteed'] or 0)
            p['f26'] = [{'y': y, 'base': ap, 'pro': 0, 'opt': 0, 'roster': 0, 'other': 0, 'gtd': min(ap, gt) if y == max(SEASON, c['year_signed']) else 0, 'cap': ap}
                        for y in range(max(SEASON, c['year_signed']), c['year_signed'] + c['years'])]
    if not W1:
        sr = stats[SEASON].get(p['id'])
        if sr and fnum(sr.get('games')):
            s26 = {'g': int(fnum(sr['games']))}
            for key, cols in STAT_MAP.items():
                v = sum(fnum(sr.get(c_)) for c_ in cols)
                if v: s26[key] = int(v) if key != 'sk' else round(v, 1)
            p['s26'] = s26
# 53-man limit: extra active players (practice-squad elevations, roster exemptions) leave the 53, lowest rated first
by_team = defaultdict(list)
for p in players:
    if p.get('t26') and not p.get('ir26'): by_team[p['t26']].append(p)
for t, lst in by_team.items():
    lst.sort(key=lambda p: -p['ovr'])
    for p in lst[53:]: p.pop('t26', None); p.pop('y26', None); p.pop('rk26', None); p.pop('f26', None)
sizes = sorted(min(53, len(l)) for l in by_team.values())
print('2026 active rosters (%s): %d-%d players with contracts; %d on injured reserve; 2026 rows: %d detailed, %d rookie scale, %d flat, %d none' % (
    'week 1' if W1 else 'current', sizes[0], sizes[-1], sum(1 for p in players if p.get('ir26')), sum(1 for p in players if p.get('t26') and p.get('y26')),
    sum(1 for p in players if p.get('t26') and p.get('rk26')), sum(1 for p in players if p.get('t26') and p.get('f26')), sum(1 for p in players if p.get('t26') and not (p.get('y26') or p.get('rk26') or p.get('f26')))))
# schedule and results
sched = []
for r in csv.DictReader(open(os.path.join(RAW, 'games.csv'))):
    if r['season'] != str(SEASON) or r['game_type'] != 'REG': continue
    hm, aw = ROSTER_FIX.get(r['home_team'], r['home_team']), ROSTER_FIX.get(r['away_team'], r['away_team'])
    played = r['result'] not in ('', 'NA') and not W1
    sched.append([int(r['week']), aw, hm] + ([int(r['away_score']), int(r['home_score'])] if played else []))
sched.sort(key=lambda x: x[0])
n_weeks = max(x[0] for x in sched)
real_week = 0
for w in range(1, n_weeks + 1):
    wk = [x for x in sched if x[0] == w]
    if wk and all(len(x) == 5 for x in wk): real_week = w
    else: break
season_meta = {'year': SEASON, 'cap': CAP_HIST[SEASON], 'weeks': n_weeks, 'realWeek': real_week, 'realGames': sum(1 for x in sched if len(x) == 5),
               'mode': 'week1' if W1 else 'current', 'games': sched}
print('2026 schedule: %d games, %d weeks; real results through week %d (%d games played)' % (len(sched), n_weeks, real_week, season_meta['realGames']))

out = {'meta': {'startYear': START_YEAR, 'season': season_meta, 'cap': CAP_2027, 'curve': {'a': CA, 'b': CB, 'L': round(CL, 4), 'floor': FLOOR}, 'capProjected': True, 'subLabels': SUB_LABELS, 'optTable': opt_table, 'optGroup': OPT_GROUP,
                'draftOrder': d_order, 'draftOrderFinal': d_final, 'draftOrderGames': d_games, 'rosterFile': ROSTER_FILE,
                'source': 'nflverse (contracts: OverTheCap), built ' + __import__('datetime').date.today().isoformat()},
       'players': players}
json.dump(out, open(os.path.join(ROOT, 'src', 'data_w1.json' if W1 else 'data.json'), 'w'), separators=(',', ':'))
print(len(players), 'players;', sum(1 for p in players if p['team']), 'under contract for', START_YEAR)
for t in ('NE', 'KC'):
    tp = [p for p in players if p['team'] == t]
    print(t, len(tp), 'cap', sum(p['years'][0]['cap'] for p in tp), 'top', [(p['name'], p['pos'], p['ovr']) for p in tp[:8]])
