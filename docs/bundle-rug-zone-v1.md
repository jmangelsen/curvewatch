# Bundle rug zone v1

Pre-registered 2026-10-28, before any fit on the production tape. This is a research label and a frozen equation. It is not a trading rule, it does not change the paper books, and it is not evidence of an edge.

The paper-book fingerprint is `FINGERPRINT_FILES` in `src/version.js`: the scorer, tape, paper engine, capital policy, curve math, smart-wallet rule, strong book, market gate, and unpriced checkpoint, plus the env-overridable settings those use. Nothing in this file, `src/bundle/`, or `scripts/bundle-rug-backtest.js` is in that hash, so this reader does not move the cohort.

`GET /api/risk/:mint` speaks contract `risk.v1` (landing-site `site/README.md` on `grok/landing-site`). `validated` is false until the prospective check below passes. A pass calibrates a market-cap band. It does not mean a sell will happen, and it does not mean a book has an edge.

## What is measured

From the bonding-curve trade tape (in-memory while the token is still in its active window, otherwise `trades` rows):

- **Launch window.** Non-creator buys in the create slot and the next slot. If the create slot was never stored, non-creator buys within 1500 ms of the recorded create time. This is the same window `Token.features()` uses for `bundlePct` and `bundleWallets`. These wallets are the only ones included in `bundle` totals.
- **Supply and sells.** Still-held tokens are the replayed curve balance (or the live holder map when that map is still in memory). Sold tokens are curve sells. Wallet-to-wallet SPL transfers are invisible. `soldPct` is the share of that wallet's launch-window tokens covered by its sells, capped at 100.
- **Coordinated size and timing.** A separate cluster, not added to `bundle` totals: at least 3 non-creator wallets, each buying at least 0.05 SOL inside 10 seconds of create, whose first buys span at most 2 seconds, whose sizes are within 2× of each other, and whose size coefficient of variation is at most 0.35. The signal `coordinatedTiming` stays `measured-as-slot-window` because the scorer's timing model is still the slot window.
- **Shared funders.** Only when a `bundle_funders(wallet, funder)` table is already in the database. This process does not fetch funding parents and does not invent them. Two or more launch-window or coordinated wallets with the same parent form a `shared-funder` cluster. Those rows are not added to `bundle` totals. With no table, the cluster is `measured: false`.

The scorer stops at the first trade whose slot is more than one past create. This reader counts every buy in the two slots, including one that arrives after a later slot. On a tape that is already in time order the two agree.

Hard reject and the partial flag use the scorer's thresholds: buy-volume share `>= MAX_BUNDLE_PCT` (default 55) and at least 3 wallets, and partial at `>= 25`. A false flag is not a clearance.

## Label

Operational definition of "bundle wallets sold most of their holdings", fixed before looking at a production copy:

> Replay sells in time order. Each sell consumes that wallet's own launch-window token buys (later buys do not restore them). The label is the bonding-curve market cap, in SOL, on the first trade where the remaining launch-window inventory is at or below half of what those wallets bought in the window. The market cap is the trade's virtual reserves (`vsol / vtok × 1e9`), or the last earlier trade that had reserves. If the inventory never falls to half, or no market cap is known at the crossing, the mint is censored and is not a training row.

The model uses this label only for wallets in the launch window, and only when that set has at least 3 wallets and the curve is SOL-quoted. One wallet selling its own coins cannot consume another wallet's inventory.

## Predictor

Features are frozen at the launch window. They do not include sells.

- `supplyBoughtPct` — tokens bought in the window, divided by 1,000,000,000, times 100
- `walletCount` — wallets in that window
- `sizeCv` — sample coefficient of variation of those wallets' window SOL

Equation, fit by ordinary least squares on `log(labelMcap)`:

```text
log(mcapSol) = intercept + b1*log(supplyBoughtPct) + b2*log(walletCount) + b3*sizeCv
```

The reported band is `exp(prediction + q10)` to `exp(prediction + q90)`, where `q10` and `q90` are the 10th and 90th percentiles of training log residuals. Coefficients are not in this document. They are fit offline and frozen in a file the operator chooses. No coefficient file is shipped with this registration.

Time-ordered split, fixed now: sort labeled mints by create time, train on the first 70 percent, test on the last 30 percent. Ties at the cut stay out of the training side. The fit runs only when training has at least 30 labeled mints and the test has at least 10. The test coverage is descriptive. It is not the prospective check.

## Prospective check

A live reading that produces a band appends one row to `bundle_risk_log` (first write for that mint and model id wins) and, when the token is still in memory, calls the existing `startRecording` so later curve trades are stored. That write does not open a paper position and does not change a score.

A case counts only when all of the following are true:

1. The logged model id is the frozen file's id (hash of method, freeze time, coefficients, residual quantiles, and training median absolute log error).
2. The majority-sell trade is strictly after `observed_at`. A sell that was already on the tape when the prediction was logged does not count.
3. The label uses the wallet list and token amounts stored on the log row, not a refit.
4. The label market cap and the logged band are finite and positive.

`validated` is true only when every one of these holds on those cases:

- at least 50 such cases
- at least 80 percent of the label market caps fall inside the logged band
- the median absolute log error is at most 1.5 times the training median absolute log error stored in the frozen file

The request path scores at most 1000 logged rows. Above that, `validated` stays false and the offline script is the check. The request path caches a score for 10 minutes. Thresholds live in `src/bundle/model.js`. A model file cannot lower them.

Until that check passes, the API returns `validated: false`, `rugZone.status` is `unvalidated` when a band is shown and `unavailable` when it is not, and `rugZone.confidence` is null. Confidence, after a pass, is the prospective coverage. It is not a probability for the mint on the screen.

The offline script (`scripts/bundle-rug-backtest.js`) reads a copy in readonly mode. It refuses `/opt/curvewatch/data/curvewatch.db` and any path under `./data`. It does not write the source database. `--model-out` writes coefficients for review. `--model` scores a frozen file against `bundle_risk_log` in the copy. The time-split section of the report stays descriptive.

## What this sample is not

- The `trades` table stores mints that were recorded for a paper book or an alert, not every launch. An offline fit on a database copy inherits that selection. A live memory reading can see a mint that was never recorded; without `startRecording` its later sells are dropped at the active-window release (default 900 seconds) and the prediction cannot be scored.
- No funding-parent feed exists. Empty funder rows are not a finding that wallets are unrelated.
- Curve balances miss SPL transfers, so supply share can be understated after a fan-out.
- The band is conditional on a majority sell. It is not a probability that the sell will happen, and it is not a price target for a paper book.
- Historical coverage, including the time-ordered test, is not validation. Hypothesis 1 stays closed. Do not describe this band as an edge unless a paper book's own prospective kill rule passes on its own cohort. This document does not open a book.

## Next step on a real copy

1. On the server, back up with SQLite `.backup` to a path outside `/opt/curvewatch` and outside `./data`. Do not point this script at the live file.
2. Run `node scripts/bundle-rug-backtest.js --db /path/to/copy.db --model-out /path/outside/bundle-rug-mcap-v1.json`.
3. Read the counts, the equation, and the time-split coverage. If the fit is `insufficient` or `singular`, do not invent coefficients. Do not call a high test coverage a pass.
4. Loading a frozen file is `BUNDLE_RUG_MODEL` plus a process restart. A restart gap-flags open paper evidence. Do not restart without an explicit approval in the session.
5. After predictions have had time to resolve, score the same frozen file with `--model` on a new copy. `validated` flips only when the check above passes. Even then the band is a calibration result, not a trading edge.
