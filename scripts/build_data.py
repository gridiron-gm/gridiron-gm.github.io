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
CAP_2027 = 326_500         # $K, projected (implied by OverTheCap cap_percent figures)
REF_DATE = (2027, 3, 11)   # league year start, for ages

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
for r in csv.DictReader(open(os.path.join(RAW, 'roster_2026.csv'))):
    if r['status'] in ('CUT', 'RET', 'TRD', 'TRT'): continue
    roster[r['gsis_id']] = r

players_xw = {}
for r in csv.DictReader(open(os.path.join(RAW, 'players.csv'))):
    players_xw[r['gsis_id']] = r
pfr_to_gsis = {r['pfr_id']: g for g, r in players_xw.items() if r['pfr_id']}

# ---------- contracts ----------
contracts = {}
for r in pq.read_table(os.path.join(RAW, 'historical_contracts.parquet')).to_pylist():
    if not r['is_active'] or not r['gsis_id']: continue
    prev = contracts.get(r['gsis_id'])
    if prev is None or (r['year_signed'] or 0) >= (prev['year_signed'] or 0):
        contracts[r['gsis_id']] = r

def contract_years(c):
    """Future league years (>= START_YEAR) of a contract.

    Returns (years, options).
    - Option bonuses: OverTheCap's option_bonus column is the sum of overlapping 5-year prorations. We
      split it back into individual options. Options exercised before START_YEAR are real proration (go in
      `pro`, accelerate as dead money). Options from START_YEAR on are pending: their proration is charged
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
        if y < START_YEAR: continue
        s = hist[y]
        cap = k(s['cap_number'])
        if cap <= 0: continue
        base, pro, rost = k(s['base_salary']), k(s['prorated_bonus']), k(s['roster_bonus'])
        o_exer = sum(op['per'] for op in options if op['y'] < START_YEAR and op['y'] <= y < op['y'] + op['span'])
        o_pend = k(s['option_bonus']) - o_exer
        cash = k(s['cash_paid'])
        void = cap < base + rost or (cash == 0 and base > 0 and y > START_YEAR)
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
        out.append(row)
    out.sort(key=lambda s: s['y'])
    run = []
    for s in out:   # contiguous run from START_YEAR
        if s['y'] == START_YEAR + len(run): run.append(s)
        else: break
    while run and run[0].get('void'): run.pop(0)
    if not run or all(r.get('void') for r in run): return [], []
    pend = [{'y': op['y'], 'per': op['per'], 'span': op['span']} for op in options if op['y'] >= START_YEAR]
    return run, pend

# ---------- stats + snaps ----------
stats = {2025: {}, 2026: {}}
for yr in (2025, 2026):
    for r in csv.DictReader(open(os.path.join(RAW, f'stats_player_reg_{yr}.csv'))):
        stats[yr][r['player_id']] = r

snaps = {2025: defaultdict(lambda: {'g': 0, 'off': 0.0, 'def': 0.0, 'st': 0.0}),
         2026: defaultdict(lambda: {'g': 0, 'off': 0.0, 'def': 0.0, 'st': 0.0})}
team_games = {2025: defaultdict(set), 2026: defaultdict(set)}
for yr in (2025, 2026):
    for r in csv.DictReader(open(os.path.join(RAW, f'snap_counts_{yr}.csv'))):
        if r['game_type'] != 'REG': continue
        g = pfr_to_gsis.get(r['pfr_player_id'])
        team_games[yr][r['team']].add(r['game_id'])
        if not g: continue
        s = snaps[yr][g]
        s['g'] += 1; s['off'] += fnum(r['offense_pct']); s['def'] += fnum(r['defense_pct']); s['st'] += fnum(r['st_pct'])
games_in = {yr: max(len(v) for v in team_games[yr].values()) for yr in (2025, 2026)}

def snap_share(g, yr, side):
    """Average snap share over the whole team season (missed games count as 0)."""
    s = snaps[yr].get(g)
    if not s: return 0.0
    return s[side] / games_in[yr]

# ---------- rating model ----------
def per_game(st_, key):
    gp = fnum(st_.get('games')) or 1
    return fnum(st_.get(key)) / gp

def features(g, pos):
    """Weighted blend of 2025 (weight .45) and 2026-to-date (weight .55) production features."""
    feats = {}
    tot_w = 0
    for yr, w in ((2025, 0.45), (2026, 0.55)):
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
            f['long'] = fnum(s.get('fg_made_50_59')) + fnum(s.get('fg_made_60_'))
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
    if not r and not years:
        continue  # not on a 2026 roster and no future contract: effectively out of the league
    on_roster = r is not None
    p = {
        'id': g, 'name': c['player'], 'pos': pos, 'opos': pos_src, 'age': age,
        'team': team if (years and team in NAME_TO_ABBR.values()) else None,
        'prevTeam': team if team in NAME_TO_ABBR.values() else None,
        'exp': int(xw['years_of_experience']) + 1 if xw.get('years_of_experience', '').isdigit() else max(0, age - 22),
        'draft': [c['draft_year'] or 0, c['draft_round'] or 0, c['draft_overall'] or 0],
        'apy': k(c['apy']), 'signed': c['year_signed'], 'gtdTotal': k(c['guaranteed']),
        'years': years, 'options': options,
        'status': (r or {}).get('status', 'FA'),
    }
    p['_f'] = features(g, pos)
    players.append(p)

# z-score features within position, blend, percentile-map to an overall
by_pos = defaultdict(list)
for p in players: by_pos[p['pos']].append(p)

def to_ovr(pct):
    # percentile within position (all players incl. backups) -> overall.
    # ~95th pct -> 93, 90th -> 88, 75th -> 74, median -> 56
    return round(42 + 57 * pct ** 2.6)

for pos, lst in by_pos.items():
    w = WEIGHTS[pos]
    regs = [p for p in lst if p['_f'].get('snap', 0) > 0.15] or lst
    mu = {f: st.mean(p['_f'].get(f, 0) for p in regs) for f in w}
    sd = {f: (st.pstdev(p['_f'].get(f, 0) for p in regs) or 1) for f in w}
    def rookie_deal(p):
        return p['draft'][0] and p['signed'] == p['draft'][0]
    vet_apy = sorted(p['apy'] for p in lst if not rookie_deal(p))
    # how much the stats can tell apart players at this position (OL/LB stats say little)
    stat_w = {'OT': 0.45, 'IOL': 0.45, 'LB': 0.7, 'LS': 0.3}.get(pos, 1.0)
    for p in lst:
        z = sum(w[f] * (p['_f'].get(f, 0) - mu[f]) / sd[f] for f in w) / sum(w.values())
        # prior = how the league itself values him: veteran contract size, or draft slot for rookie deals
        if rookie_deal(p):
            pick = p['draft'][2] or 260
            prior = (1 - math.log(pick) / math.log(260)) * 2.2 - 1.0
        else:
            apy_pct = sum(1 for a in vet_apy if a <= p['apy']) / max(1, len(vet_apy))
            prior = (apy_pct - 0.5) * 2.2
        played = p['_f'].get('snap', 0)
        trust = min(1.0, played / 0.45) * stat_w   # little playing time or weak stats -> lean on the prior
        p['_score'] = trust * z + (1 - trust) * prior
    scores = sorted(p['_score'] for p in lst)
    n = len(scores)
    for p in lst:
        pct = (sum(1 for s in scores if s < p['_score']) + 0.5) / n
        ovr = to_ovr(pct)
        if p['age'] >= 33: ovr -= (p['age'] - 32)  # decline already baked in a little for old vets
        p['ovr'] = max(40, min(99, ovr))
        # potential: youth upside
        up = max(0, 27 - p['age']) * 2.2
        p['pot'] = min(99, max(p['ovr'], round(p['ovr'] + up)))

# position-specific sub-ratings (0-99) from the same features, for display and sim flavor
SUBS = {'QB': [('pass', 'epa'), ('acc', 'cpoe')], 'RB': [('run', 'ypc'), ('prod', 'scrim')],
        'WR': [('prod', 'yds'), ('tgt', 'ts')], 'TE': [('rec', 'yds'), ('tgt', 'ts')],
        'DL': [('rush', 'pr')], 'EDGE': [('rush', 'pr')], 'LB': [('tkl', 'tk'), ('play', 'play')],
        'CB': [('cov', 'ball')], 'S': [('cov', 'ball'), ('tkl', 'tk')], 'K': [('acc', 'acc'), ('pow', 'long')],
        'P': [('net', 'net')], 'OT': [('play', 'snap')], 'IOL': [('play', 'snap')], 'LS': []}
for pos, lst in by_pos.items():
    for lab, f in SUBS[pos]:
        vals = sorted(p['_f'].get(f, 0) for p in lst)
        for p in lst:
            pct = (sum(1 for v in vals if v < p['_f'].get(f, 0)) + 0.5) / len(vals)
            p.setdefault('sub', {})[lab] = round(40 + 59 * pct)

# last-season stat lines for the player card
def statline(g, pos):
    s = stats[2026].get(g) or {}
    if not s: return None
    gp = int(fnum(s.get('games')))
    if pos == 'QB': return f"{gp} G · {int(fnum(s['passing_yards']))} yds · {int(fnum(s['passing_tds']))} TD · {int(fnum(s['passing_interceptions']))} INT"
    if pos == 'RB': return f"{gp} G · {int(fnum(s['rushing_yards']))} rush yds · {int(fnum(s['rushing_tds']))} TD"
    if pos in ('WR', 'TE'): return f"{gp} G · {int(fnum(s['receptions']))} rec · {int(fnum(s['receiving_yards']))} yds · {int(fnum(s['receiving_tds']))} TD"
    if pos in ('DL', 'EDGE', 'LB'): return f"{gp} G · {fnum(s['def_sacks']):g} sacks · {int(fnum(s['def_tackles_solo']))} solo tkl"
    if pos in ('CB', 'S'): return f"{gp} G · {int(fnum(s['def_interceptions']))} INT · {int(fnum(s['def_pass_defended']))} PD"
    if pos == 'K': return f"{gp} G · {int(fnum(s['fg_made']))}/{int(fnum(s['fg_att']))} FG"
    return f"{gp} G"

for p in players:
    p['line26'] = statline(p['id'], p['pos'])
    del p['_f']; del p['_score']

players.sort(key=lambda p: (p['team'] or 'ZZZ', -p['ovr']))
out = {'meta': {'startYear': START_YEAR, 'cap': CAP_2027, 'capProjected': True,
                'source': 'nflverse (contracts: OverTheCap), built ' + __import__('datetime').date.today().isoformat()},
       'players': players}
json.dump(out, open(os.path.join(ROOT, 'src', 'data.json'), 'w'), separators=(',', ':'))
print(len(players), 'players;', sum(1 for p in players if p['team']), 'under contract for', START_YEAR)
for t in ('NE', 'KC'):
    tp = [p for p in players if p['team'] == t]
    print(t, len(tp), 'cap', sum(p['years'][0]['cap'] for p in tp), 'top', [(p['name'], p['pos'], p['ovr']) for p in tp[:8]])
