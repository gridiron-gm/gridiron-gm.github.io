#!/bin/sh
# Download the free nflverse data used by scripts/build_data.py
set -e
cd "$(dirname "$0")/../data/raw"
B=https://github.com/nflverse/nflverse-data/releases/download
for f in rosters/roster_2026.csv players/players.csv stats_player/stats_player_reg_2025.csv stats_player/stats_player_reg_2026.csv snap_counts/snap_counts_2025.csv snap_counts/snap_counts_2026.csv contracts/historical_contracts.parquet; do
  curl -sLO "$B/$f"
done
ls -la
