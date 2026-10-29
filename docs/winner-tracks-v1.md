# Pre-registration: winner tracks v1 (2026-10-29)

Paper only. This does not change the Main book's entry, hard rejects, or exits, and it does not change the capital-protection book or the existing `random` control. It does not reopen Hypothesis 1. No wallet key, no signing, no live order.

Historical replays and the 28-winner / 18-rug notes below are not evidence. A book has no edge unless its own prospective kill rule says PASS on its own fingerprint cohort.

Deploying this tree starts settings fingerprint `ac00c1e9` (default settings, `DATA_DIR=$(mktemp -d)`). Cohort `52746d10` ends at that restart. Do not pool it with `4033fed1` or with `96f45eab`.

## Why these books exist

The live Main score puts about 56 of 100 points on flow, momentum, breadth, and pressure, and it buys the first time the score crosses 72. That is a selection after the run. Main's hard filters also drop creator-sold coins, bundle share at or above 55%, and a curve at or above 88%. Those filters are unchanged. The new books do not use them as entry blocks.

## runnerA (fast runners)

Code: `considerRunnerA` and `runnerAExit` in `src/engine/winnerTracks.js`. Fills go through the curve paper engine. Costs match Main (delay, fee, extra slippage).

Entry, all of them, provisional:

- Curve fill from 25% to 60% inclusive.
- Market cap at most $40,000, using the existing SOL/USD reference. No price, no entry.
- First-time buyers in the last 60 seconds exceed the 60 seconds before that.
- Early bundle wallets are not net sellers on their cumulative SOL.
- Raw score (the score before a hard reject zeros it) is at least 72 and has stayed there for 20 seconds. The first observation above the line is not an entry. A dip below the line resets the clock.
- Token age at least 180 seconds, at least 3 prints in that window, and price at most 12% above the average trade mcap in the window.
- Bundled launches and dev-sold coins are allowed. The trade stores `runnerFlags` of `bundled` and/or `dev-sold`. Any other hard reject still scores as 0.

Exits, whichever is true first:

- Snipe concentration (below) is checked before the others.
- Market cap at or above $100,000, or curve fill at or above 95%.
- Early bundle wallets' net SOL over the last 60 seconds is below 0.
- Position value at or below 80% of its peak value (20% trail from the peak).
- 20 minutes after entry.
- Graduation still closes the position in the shared paper engine. The book does not hold through bonding.

Control: `runnerActl`. At each runnerA entry, one random other token in the same 25–60% curve band. Same exits and costs. Not the Main `random` book. `killRule('runnerA')` uses `runnerActl`.

## holderB (post-bond holders)

Code: `considerHolderB` and `holderBExit`. Fills are rows in `grad_paper` with `cfg` set to the current fingerprint. Fixed and trail graduate books are not opened by this path.

Decided once, on the first observation at or after 30 minutes from pool creation. Entry, all provisional:

- Price over the last 15 minutes held at least 90% of the price at the start of that window.
- Holder count is higher than the earlier stored count, and top-10% is flat or down within 0.5 percentage points.
- Curve bundle share at most 25%, and the creator still held at least 0.01% at migration.
- Not a fast-bonding snipe (below).

Missing holder, top-10, bundle, or creator data does not enter. Ramp-pattern pools are not traded by either holder book (existing honeypot guard).

Exits: stop at −38.5% (still capped at the 47% loss ceiling), sell half at 2×, or 24 hours. No trail.

Control: `holderBctl`. Every non-ramp graduate at the same 30-minute observation, including coins holderB refused. Same exits. `Graduates.kill('holderB')` uses `killStatsFrom` against `holderBctl` rows with this fingerprint only.

## Kill rule (the only PASS)

PASS for runnerA and for holderB requires all of the following on the current fingerprint, excluding gap-flagged rows and rows gated by an enforced market pause:

1. At least 50 closed trades (`KILL_MIN_TRADES`).
2. The 99% lower bound of mean P&L per trade is above zero (`KILL_CONFIDENCE`).
3. Both halves by exit time are positive, and each half has at least 10 trades.
4. The book beats its own control: the 95% lower bound of the mean difference is above zero, and the control has at least 30 closed trades.

Until that PASS, the book is not an edge. The 24-hour gate, the anytime +2% sequence, and `books.paired.capital` are not this PASS.

## Anecdotal flags (28 winners, 18 rugs)

Small n. Not a fit. The numbers are the cuts named in that note, stored as provisional config, not estimated on this database.

### Snipe concentration

`earlyHolderTape`: share of supply bought by the first 19 wallets in the first 10 seconds.

- runnerA: when that share is at least 79%, the paper size is 0.25× the normal ticket (`snipeSizeFrac`, a size cap, not from the sample) and the exit reason is `snipe concentration`, checked before curve, market cap, bundle flow, trail, and the 20-minute clock.
- holderB: when that share is at least 79% and the coin bonded within 15 seconds of create, the book does not enter. The control still does. A slow bond keeps the feature on the row and does not reject.

### Spread-out early holders

In the same 10-second window, largest bag under 5% of supply and top-5 bags under 15%. Stored as `earlyMaxBagPct`, `earlyTop5Pct`, and `spreadOut` on the holderB features. It does not gate entry.

### What is not a score

A high unique-trader count and a paid DexScreener boost did not separate holders from rugs in that note (9 of 14 rugs had a paid boost). They are stored as `uniqueTraders`, `paidBoosts`, and `loggedFlags` (`unique-traders`, `paid-boost`). They add no points. The graduate social score no longer adds 2 points for a paid boost; the flag line remains.

## Signals and labels

- Per-minute new-buyer and holder series, and per-minute net SOL of the early bundle wallets, written to `winner_signals` at curve checkpoints.
- Post-bond holder trend and top-10% trend on the holderB decision row.
- `survival_labels`: 24h and 72h. Alive when a post-horizon market cap is at least half the migration market cap. A liquidity death with no later print is not alive. No print and no death stays unlabeled. This writer does not update closed paper rows.

## Offline labels

`scripts/join-labels.js` opens a database copy readonly, refuses `/opt/curvewatch`, and does not import the scorer. It accepts the canonical label sheet, Researchy `winners.csv` (`track,mint,symbol,launch_utc,peak_mc,minutes_to_peak,mc_24h,mc_7d,bonded,early_signals,source_url`), and `rug-cases.csv` (a `mint` column; the file name supplies the rug label). One output row per mint. A mint that appears as both a winner and a rug is kept once with `conflict: true`.

## Provisional thresholds

| Setting | Value |
| --- | --- |
| runnerA curve | 25–60% |
| runnerA max mcap | $40,000 |
| runnerA min raw score / sustain | 72 / 20s |
| runnerA price window / max premium / min prints | 180s / 12% / 3 |
| runnerA exit mcap / curve / trail / hold | $100,000 / 95% / 20% / 20 min |
| runnerA bundle window / sell net | 60s / 0 SOL |
| snipe wallets / window / supply / size / fast bond | 19 / 10s / 79% / 0.25× / 15s |
| holderB age / floor / floor fraction | 30 min / 15 min / 0.90 |
| holderB max bundle / min creator hold / top-10 flat | 25% / 0.01% / 0.5 pp |
| holderB stop / half / hold | −38.5% / 0.5 at 2× / 24h |
| early max bag / early top-5 (flag only) | 5% / 15% |
| survival floor | 0.5× migration mcap |
