#!/bin/sh
# Download the free nflverse data used by scripts/build_data.py into data/raw/.
set -e
cd "$(dirname "$0")/../data/raw"
START=${START_YEAR:-2027}
PREV=$((START - 1)); PREV2=$((START - 2)); PREV3=$((START - 3))
B=https://github.com/nflverse/nflverse-data/releases/download
get() { curl -sfL -o "$2" "$1" && echo "  ok   $2" || { echo "  miss $2"; rm -f "$2"; }; }
get $B/contracts/historical_contracts.parquet historical_contracts.parquet
get $B/players/players.csv players.csv
get $B/draft_picks/draft_picks.csv draft_picks.csv
get $B/rosters/roster_$PREV.csv roster_$PREV.csv
get $B/rosters/roster_$START.csv roster_$START.csv     # appears once the new league year's rosters are published
for y in $PREV2 $PREV; do get $B/stats_player/stats_player_reg_$y.csv stats_player_reg_$y.csv; done
for y in $PREV3 $PREV2 $PREV; do get $B/snap_counts/snap_counts_$y.csv snap_counts_$y.csv; done
get https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv games.csv
get $B/pfr_advstats/advstats_season_def.csv advstats_season_def.csv   # coverage: targets, yards/target, rating allowed
