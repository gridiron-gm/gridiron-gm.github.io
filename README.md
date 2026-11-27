# Gridiron GM

A franchise-mode GM game in the browser: real NFL rosters and contracts, simulated seasons, many years of play. Game-style menus and simulation, no on-field graphics. Play it at **https://gridiron-gm.github.io**.

- **Seasons in phases**: re-sign window, free agency, draft, regular season (trade deadline after week 9), playoffs. Final cuts to 53 happen automatically after the draft. Four destinations (Home, Team, Moves, League) and one Continue button; Moves shows only what the phase allows.
- **Quick start**: the AI runs the first offseason for every team, yours included, and you take over at week 1 with a recap of who left, who signed and your draft picks.
- **Avatars**: original helmet-and-shoulders illustrations in team colors with real jersey numbers (nflverse rosters). No photos or logos.

- **Data**: rosters, stats and snap counts from [nflverse](https://github.com/nflverse/nflverse-data); contracts from OverTheCap via nflverse. Player ratings are derived from real 2024–26 production, snaps and age. No EA/Madden ratings, no logos.
- **Cap rules**: year-by-year cap hits, signing-bonus proration (max 5 years), option bonuses, void years, pre- and post-June 1 releases and trades, restructures, extensions, rookie wage scale, fifth-year options, the offseason top-51 rule, rollover, ~7%/yr projected cap growth. Dead money matches OverTheCap's published numbers (see `tests/`).
- **Caveats**: the 2027 cap ($326.5M) is projected; team cap space is approximate because dead money from cuts made before 2027 isn't in the data. The first draft uses the real order from 2026 results (provisional until the season ends), but traded and compensatory picks aren't tracked. Pro Bowl counts come from Pro Football Reference via nflverse and may include alternates, which the CBA doesn't count. Seasons are 17 weeks with no byes.

## Refresh the data
```
./refresh.sh
```
Downloads nflverse data, rebuilds the player file, refreshes the OverTheCap reference numbers, runs the tests and rebuilds `docs/`. Run it after the 2026 season ends (real draft order, full-season stats) and again once the 2027 league year opens.

## Tests
```
node tests/cap.test.js && node tests/market.test.js && node tests/league.test.js && node tests/sim.test.js 8
```
