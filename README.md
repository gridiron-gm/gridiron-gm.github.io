# NFL GM

A franchise-mode GM game in the browser: real NFL rosters and contracts, simulated seasons, many years of play. Menus, tables and simulation, no on-field graphics.

- **Data**: rosters, stats and snap counts from [nflverse](https://github.com/nflverse/nflverse-data); contracts from OverTheCap via nflverse. Player ratings are derived from real 2025–26 production, snaps and age. No EA/Madden ratings, no logos.
- **Cap rules**: year-by-year cap hits, signing-bonus proration (max 5 years), option bonuses, void years, pre- and post-June 1 releases and trades, restructures, extensions, rookie wage scale, rollover. Dead money matches OverTheCap's published numbers (see `tests/`).
- **Caveats**: the 2027 cap ($326.5M) is projected; team cap space is approximate because dead money from cuts made before 2027 isn't in the data. Draft picks traded in real life aren't tracked (every team starts with its own picks). Seasons are 17 weeks with no byes.

## Develop
```
./scripts/fetch_data.sh                 # download nflverse data
python3 -m venv .venv && .venv/bin/pip install pyarrow
.venv/bin/python -I scripts/build_data.py
node tests/cap.test.js && node tests/market.test.js && node tests/sim.test.js 8
./build.sh                              # writes docs/
```
