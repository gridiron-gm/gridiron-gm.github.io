# Gridiron GM

Browser franchise sim with real NFL rosters and contracts. Static site on GitHub Pages from `docs/` (repo gridiron-gm/gridiron-gm.github.io, live at https://gridiron-gm.github.io).

## Layout
- `./refresh.sh` is the one command to refresh real data: downloads nflverse files (`scripts/fetch_data.sh`), rebuilds `src/data.json`, refreshes the OverTheCap reference numbers, runs the tests, builds `docs/`.
- `scripts/build_data.py` (run with `.venv/bin/python -I`) builds `src/data.json`: contracts (OverTheCap via nflverse) split into base / prorated / pending option / roster+other / guarantees / void years, plus ratings derived from 2024-26 stats, snaps, age, and a draft-slot or contract-size prior. Money is integer $K.
- `src/js/10-cap.js` cap and contract rules (pure, tested). `20-market.js` asking prices, offer evaluation, trade values. `30-league.js` state, transactions, AI front offices. `40-season.js` schedule, sim, playoffs. `50-offseason.js` phases, draft, progression, rollover, market feedback. `55-phases.js` which screens each part of the year shows (tested in `tests/phases.test.js`). `05-avatar.js` original SVG player avatars. `60-ui.js` shell (nav, Continue, start/quick start, events, saves); `61-home-team.js`, `62-player.js` (slide-over card), `63-moves.js`, `64-league.js` screens. `70-main.js` boot. There is no preseason stop: leaving the draft runs final cuts (`finalCuts` in 50-offseason.js). New games start inside the real 2026 season: `newGame(data, team, seed, 'current' | 'week1')` (tests/startmodes.test.js); with no mode it starts at the 2027 offseason (used by the cap/market/roomfill tests). `autoManageOffseason()` runs your offseason, re-signing first (tests/automanage.test.js). `scripts/build_data.py` with `GG_MODE=w1` writes `src/data_w1.json`. `./refresh.sh` runs weekly in GitHub Actions.
- `build.sh` inlines CSS/JS into `docs/index.html` and copies `docs/data.json`.

## Rules for changes
- Edit `src/`, never `docs/` directly. Run `./build.sh` after every change.
- Run the tests after touching game logic: `node tests/cap.test.js`, `node tests/market.test.js`, `node tests/league.test.js`, `node tests/roomfill.test.js`, `node tests/fa_market.test.js`, `node tests/ratings.test.js`, `node tests/trade.test.js`, `node tests/sim.test.js 8` (add `freeze` to hold the pay level at 1.0).
- `tests/otc_reference.json` holds OverTheCap's published 2027 dead money, cap savings and restructure savings for 5 players; the cap engine must keep matching it.
- Every player's rating moves only for aging and performance (no re-normalization). League talent is kept stable by draft-class strength per position (`updateClassStrength`).
- `data/overrides.csv` holds hand-checked corrections (e.g. original-ballot Pro Bowl counts); `build_data.py` applies it. Cite a source in each row.
- `node tests/fa_market.js` reports year-1 asks vs real 2026 free-agent deals.
- Label the league cap "projected" and team cap space "approx." in the UI.
- No keyboard-hint text in the UI; buttons only.
