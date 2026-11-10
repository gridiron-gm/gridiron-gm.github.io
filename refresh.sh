#!/bin/sh
# One command to refresh all real-world data and rebuild the site:
#   ./refresh.sh
# Re-run after the 2026 season ends (final standings -> real 2027 draft order, full-season stats and
# snaps for ratings) and again once the 2027 league year opens (new contracts, cuts, restructures).
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q pyarrow; }
echo "1/5 Downloading nflverse data"
./scripts/fetch_data.sh
echo "2/5 Building src/data.json (contracts, ratings, option tables, draft order)"
.venv/bin/python -I scripts/build_data.py
echo "3/5 Refreshing OverTheCap reference figures for the cap tests"
.venv/bin/python -I scripts/fetch_otc.py > /dev/null && echo "  ok"
echo "4/5 Running tests"
node tests/cap.test.js | tail -1
node tests/market.test.js
node tests/league.test.js | tail -1
node tests/sim.test.js 4 | tail -1
echo "5/5 Building docs/"
./build.sh
echo "Done. Saved games keep their own copy of the league; start a new game to use the new data."
