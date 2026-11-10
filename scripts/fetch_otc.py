"""Fetch OverTheCap's published dead-money table for a few players (2027 league year) for validation.
Writes tests/otc_reference.json. Run: .venv/bin/python -I scripts/fetch_otc.py
"""
import html, json, os, re, time, urllib.request
import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ['Patrick Mahomes', 'Josh Allen', 'Milton Williams', 'Christian Gonzalez', 'Romeo Doubs']
YEAR = '2027'

rows = [r for r in pq.read_table(os.path.join(ROOT, 'data/raw/historical_contracts.parquet'),
        columns=['player', 'is_active', 'player_page', 'gsis_id', 'year_signed']).to_pylist() if r['is_active'] and r['player'] in NAMES]
best = {}
for r in rows:
    if r['player'] not in best or r['year_signed'] > best[r['player']]['year_signed']: best[r['player']] = r

def money(x):
    x = x.strip(); neg = x.startswith('(')
    v = int(re.sub(r'[^0-9]', '', x) or 0)
    return -v if neg else v

out = {}
for name in NAMES:
    r = best[name]
    req = urllib.request.Request(r['player_page'], headers={'User-Agent': 'Mozilla/5.0'})
    s = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    i = s.find('Dead Money &amp; Cap Savings')
    if i < 0: i = s.find('Dead Money & Cap Savings')
    chunk = s[i:i + 40000]
    for tr in re.findall(r'<tr>.*?</tr>', chunk, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if not tds or re.sub(r'<[^>]+>', '', tds[0]).strip()[:4] != YEAR: continue
        def grab(kind):
            m = re.search(r'player-' + kind + r'[^>]*>(.*?)</td>', tr, re.S)
            return {c: money(html.unescape(re.sub(r'<[^>]+>', '', v))) for c, v in
                    re.findall(r'<div class="(cut|june_1_cut|trade|june_1_trade|restructure|extension)"[^>]*>(.*?)</div>', m.group(1), re.S)}
        cap = money(re.sub(r'<[^>]+>', '', re.search(r'<strong>(.*?)</strong>', tr).group(1)))
        out[name] = {'gsis': r['gsis_id'], 'page': r['player_page'], 'cap': cap,
                     'dead': grab('dead-money'), 'savings': grab('cap-savings')}
        break
    time.sleep(1.5)
json.dump(out, open(os.path.join(ROOT, 'tests', 'otc_reference.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
