# Gridiron GM

A franchise-mode GM game in the browser: real NFL rosters and contracts, simulated seasons, many years of play. Game-style menus and simulation, no on-field graphics. Play it at **https://gridiron-gm.github.io**.

- **Two starts**: *Continue from this week* drops you into the real 2026 season with real results, standings and stats to date (current rosters and contracts; the trade deadline has passed). *Start of 2026, week 1* replays 2026 with week-1 rosters and ratings built only from 2024–25 stats. Either way you then run the 2027 offseason.
- **Seasons in phases**: re-sign window, free agency, draft, regular season (18 weeks with a bye, trade deadline after week 9), playoffs. Final cuts to 53 happen automatically after the draft. Four destinations (Home, Team, Moves, League) and one Continue button; Moves shows only what the phase allows.
- **Auto-manage offseason**: at the start of each offseason the AI can run yours: your best expiring players are re-signed first, then free agency, the draft and cuts to 53, with a recap at week 1.
- **Avatars**: original helmet-and-shoulders illustrations in team colors with real jersey numbers (nflverse rosters). No photos or logos.
- **Kept current**: a GitHub Action refreshes the data every Tuesday during the season, runs all tests, and redeploys only if they pass.
- **Data**: rosters, stats and snap counts from [nflverse](https://github.com/nflverse/nflverse-data); contracts from OverTheCap via nflverse. Player ratings are derived from real 2024–26 production, snaps and age. No EA/Madden ratings, no logos.
- **Cap rules**: year-by-year cap hits, signing-bonus proration (max 5 years), option bonuses, void years, pre- and post-June 1 releases and trades, restructures, extensions, rookie wage scale, fifth-year options, the offseason top-51 rule, rollover, ~7%/yr projected cap growth. Dead money matches OverTheCap's published numbers (see `tests/`).
- **Caveats**: the 2027 cap ($326.5M) is projected; team cap space is approximate because dead money from cuts made before 2027 isn't in the data. The first draft uses the real order from 2026 results (provisional until the season ends), but traded and compensatory picks aren't tracked. Pro Bowl counts come from Pro Football Reference via nflverse and may include alternates, which the CBA doesn't count. Seasons are 17 weeks with no byes.

## Refresh the data
```
./refresh.sh
```
Downloads nflverse data, rebuilds both start files (`src/data.json` for the current week, `src/data_w1.json` for week 1), refreshes the OverTheCap reference numbers, runs every test and rebuilds `docs/`; it stops at the first failure. The weekly GitHub Action (`.github/workflows/refresh-data.yml`, Tuesdays September–February, also runnable from the Actions tab) does the same with `SKIP_OTC=1` and commits only when everything passes.

## Tests
```
for t in tests/*.test.js; do node $t | tail -1; done
```
