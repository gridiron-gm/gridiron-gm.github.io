# NFL GM

Browser franchise sim with real NFL rosters and contracts. Static site on GitHub Pages from `docs/`.

## Layout
- `scripts/fetch_data.sh` downloads nflverse files into `data/raw/` (gitignored).
- `scripts/build_data.py` (run with `.venv/bin/python -I`) builds `src/data.json`: contracts (OverTheCap via nflverse) split into base / prorated / pending option / roster+other / guarantees / void years, plus ratings derived from 2025-26 stats, snaps, age, and a draft-slot or contract-size prior. Money is integer $K.
- `src/js/10-cap.js` cap and contract rules (pure, tested). `20-market.js` asking prices, offer evaluation, trade values. `30-league.js` state, transactions, AI front offices. `40-season.js` schedule, sim, playoffs. `50-offseason.js` phases, draft, progression, rollover, market feedback. `60-ui.js` screens. `70-main.js` boot.
- `build.sh` inlines CSS/JS into `docs/index.html` and copies `docs/data.json`.

## Rules for changes
- Edit `src/`, never `docs/` directly. Run `./build.sh` after every change.
- Run the tests after touching game logic: `node tests/cap.test.js`, `node tests/market.test.js`, `node tests/sim.test.js 8`.
- `tests/otc_reference.json` holds OverTheCap's published 2027 dead money for 5 players; the cap engine must keep matching it.
- Label the league cap "projected" and team cap space "approx." in the UI.
- No keyboard-hint text in the UI; buttons only.
