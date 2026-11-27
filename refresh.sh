#!/bin/sh
# One command to refresh all real-world data and rebuild the site:
#   ./refresh.sh
# Downloads the latest nflverse data (results, rosters, stats, contracts), rebuilds both start files
# (src/data.json: the real season at the current week; src/data_w1.json: week-1 rosters, ratings from
# the two seasons before), runs every test and rebuilds docs/. Stops at the first failure.
# Runs weekly in GitHub Actions during the season (.github/workflows/refresh-data.yml).
#   PYTHON=python   use a Python that already has pyarrow (CI)       SKIP_OTC=1   skip the OverTheCap page fetch
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-.venv/bin/python}
if [ -z "$PYTHON" ] && [ ! -x .venv/bin/python ]; then python3 -m venv .venv && .venv/bin/pip install -q pyarrow; fi
echo "1/5 Downloading nflverse data"
./scripts/fetch_data.sh
echo "2/5 Building src/data.json (current week) and src/data_w1.json (week 1)"
$PY -I scripts/build_data.py | tail -3
GG_MODE=w1 $PY -I scripts/build_data.py | tail -1
if [ -z "$SKIP_OTC" ]; then
  echo "3/5 Refreshing OverTheCap reference figures for the cap tests"
  $PY -I scripts/fetch_otc.py > /dev/null && echo "  ok"
else
  echo "3/5 OverTheCap reference figures: kept (SKIP_OTC)"
fi
echo "4/5 Running all tests"
mkdir -p .test-logs
for t in tests/*.test.js; do
  log=".test-logs/$(basename "$t").log"
  case "$t" in
    */sim.test.js) node "$t" 10 --seed 42 > "$log" 2>&1 || { cat "$log"; echo "FAILED: $t"; exit 1; } ;;
    *) node "$t" > "$log" 2>&1 || { cat "$log"; echo "FAILED: $t"; exit 1; } ;;
  esac
  echo "  $(basename "$t"): $(tail -1 "$log")"
done
echo "5/5 Building docs/"
./build.sh
echo "Done. Saved games keep their own copy of the league; start a new game to use the new data."
