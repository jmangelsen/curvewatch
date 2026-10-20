# Hypothesis 3: the horde (holder accumulation as a signal)

Registered 2026-10-18, before any book or rule exists for it. Nothing below is applied to the live rules; the
fingerprint stays `96f45eab` until the Monday window.

## The claim to test

Observation (JM): coins make their big move as the holder count climbs through 200–500 and then 500–1,250. A
"horde tracker" that detects mass holder accumulation should be a key signal, and the aim is to identify and
capture the daily outliers.

Split into three testable statements, because they live on different data:

- H3a (curve stage, 0–15 min): holder growth on the bonding curve predicts graduation and a 2× from the checkpoint.
- H3b (curve stage): an entry on that growth is profitable under a realistic exit model after fee, slippage and delay.
- H3c (after graduation): crossing 200 → 500 → 1,250 holders precedes the large post-migration moves, and an entry
  on that crossing is profitable.

## What the data already says (sandbox, 14 days, SOL-quoted, finalized, gap-free)

Holder counts on the curve come from Curvewatch's own trade tape (wallets with a positive balance), so H3a and H3b
could be tested immediately. New Studio features `hordeGain30/60/120`, `hordeRate60`, `solPerHolder` expose them.

H3a is supported, strongly and in both halves of the window:

| Rule at 300 s | n | graduated | 2× after | base graduated / 2× |
|---|---|---|---|---|
| holders gained since 60 s ≥ 11 | 317 | 8.2% (22× lift) | 19.2% (CI 15–24%, 14× lift) | 0.37% / 1.36% |
| holders gained 60 → 300 s, +11–25 | 190 | 6.8% | 16.8% | |
| holders gained 60 → 300 s, +26–50 | 89 | 9.0% | 22.5% | |
| holders gained 60 → 300 s, ≤ 0 | 11,938 | 0.2% | 0.7% | |

H3b is not supported. The same tokens are already 2.3× their launch cap at the signal (median 79 SOL), 42% are
below half the entry cap one hour later and only 15% are above entry. With the project's stop (−38.5%) and target
(+125%) applied to the labels, before any fee, slippage or reaction delay:

| Variant | n | avg per trade | target hits | stops |
|---|---|---|---|---|
| gain 60 → 300 s ≥ 11 | 317 | −11.5% | 36 | ~58% |
| gain 60 → 120 s ≥ 11 | 335 | −13.8% | 39 | |
| gain 300 → 600 s ≥ 11 | 119 | −5.0% | 15 | |
| gain 60 → 300 s ≥ 11 and cap ≤ 60 SOL | 91 | −13.8% | 7 | |
| whole field at 300 s | 11,549 | −1.7% | 105 | |

Thirty-six variants (window × threshold × cap) were tried; every one is negative. The horde identifies graduates. It
does not identify a long entry that survives the curve's drawdowns with a fixed stop. This matches the rejected
Hypothesis 1 and the paper books: curve-stage flow features are "price already moved" features.

H3c cannot be tested yet. There is no holder count for any graduated token in either database: the Helius-backed
poller (`src/engine/holders.js`) is inert without a key. The free proxy that does exist, DexScreener transaction
acceleration, is not a substitute and is itself negative: snapshots with ≥ 150 transactions in 5 min, buy share
≥ 55% and 5-min rate ≥ 1.5× the hourly rate (483 snapshots, 253 pools) reached 2× within 6 h 9.5% of the time
against a 5.0% base, and the median price six hours later was 0.27× the signal price. Activity surges after
graduation are mostly distribution.

On the "1000× daily" premise: in 14 days no watched graduate reached 50× within six hours of its first snapshot;
ten reached 10× (0.6% of 1,572). The 14 "≥ 1,000×" peaks in `grad_watch` are DexScreener pricing artifacts
(stablecoin-named tickers at $150M–$1.1B market cap after five snapshots), not pumps. If specific 1000× coins were
seen this week, send the tickers or mints: tracing when the holder surge happened relative to the move in a coin
that actually did it is worth more than any proxy.

## Pre-registered plan

1. Collect post-graduation holder counts at zero cost. Helius free plan: 1M credits per month, DAS calls cost 10
   credits, 2 DAS requests per second. Budget: every new graduate polled every 15 min for its first 3 hours
   (12 polls, up to 2 pages each), then every 60 min for 24 h if it is still above $30k market cap. About 200
   graduates a day gives roughly 3,000 calls a day, ≈ 900k credits a month. Counts go to `grad_snapshots.holders`
   and `holder_history`. Needs `HELIUS_API_KEY` on the server, applied in the Monday restart window.
2. After 14 days of counts (target ≥ 1,500 graduates with ≥ 8 readings each), test H3c in the Studio:
   features `holders`, `holderGain15m`, `holderGain60m`, `holdersPerUsdLiq`; outcome 2× / 3× within 6 h and price
   above entry at 6 h; time-split halves; the rule must hold in both.
3. Only if H3c holds: a paper book `horde` with the pre-registered rule, entry at the 500-holder crossing, scale-out
   exit, judged by the same anytime-valid sequential test as Follow. No manual trades, no rule change before the
   book decides.
4. Falsifiers written down now: (a) holder growth after graduation is as negative as transaction growth (median
   price below entry at 6 h for the top decile); (b) the top-decile lift does not survive the time split; (c) the
   lift exists but the paper book's lower confidence bound stays below zero after 100 pairs.

## Cost

Engineering already spent on the Studio features. Data: $0 (free tier). Operator time: one line in `.env`.
Expected revenue: $0 until a book passes; the justification is defensible data (nobody else has a clean
holder-count history for every pump.fun graduate at 15-minute resolution).

## Case trace: `2bCC…Vpump` ("Trump $1 Coin", ticker 1), supplied by JM as a coin that "did it"

Sources: sandbox database (155 post-graduation snapshots), DexScreener pairs, Helius holder count on 2026-10-18.

| UTC, 2026-10-15 | Market cap | Trailing-hour tx | Note |
|---|---|---|---|
| 20:16:09 | launch | | TRUMP-quoted pump.fun curve. Screener saw it at 30 s, flagged `non-SOL quote`, recorded no features. |
| 20:19:27 | | | Migrated to PumpSwap 3 min 18 s after launch: the whole curve was bought through in 198 s. |
| 20:39:45 | $190k | 17,521 | First watch snapshot. Typical graduate at this age: a few hundred tx. |
| 20:49 | $625k | 24,419 | 3.3× in ten minutes. |
| 21:00 | $794k | 34,901 | First-leg top. |
| 21:21 | $321k | 47,116 | −60% in 21 min while hourly tx kept climbing: the dip was absorbed, not abandoned. |
| 23:03 | $906k | 12,441 | Reclaimed the first-leg top. |
| 23:47 | $2.94M | 26,961 | Peak, 3 h 31 min after launch. |
| 10-16 12:42 | $2.83M | 8,258 | Second peak. |
| 10-18 15:10 | $374k | 431 | −87% from peak. 10,239 holders (Helius, 11 pages). |

Multiples that actually existed: 15.5× from the first visible snapshot, 9.1× from the post-dip low, 4.7× from the
first ten-minute reading after the leg. The "1000×" is measured from a launch price that only the launch bundle
paid; outsiders could not have bought before migration. The tradeable event was a 9–15× over three hours with a
60% drawdown in the middle that would have stopped out every fixed-stop entry in this project.

What generalises, on the 14-day sandbox watch (3,792 graduates):

- A ≥ 3× first leg within 3 h of migration happened on 57 labeled graduates (1.5%, about four a day). Buying at the
  moment the leg is confirmed: 2× within 6 h 17.5%, median price at 6 h 0.33× entry.
- The pattern this coin showed, a ≥ 40% dip within an hour of that leg's top while the trailing-hour transaction count
  is still rising: n 45 snapshots on 24 coins, 2× within 6 h 26.7%, above entry at 6 h 37.8%, median 0.67×. The same
  dip with transaction count falling: 14.0%, 14.0%, median 0.37×. Base: 4.7% and 50%. A hint from 24 coins, not evidence.
- Quote token is not the story: 21% of the big movers were non-SOL curves against 20% of all watched graduates.

Consequence for the collector: graduates that have run 3× inside the first hours are counted every 5 minutes
instead of 20 (`horde.legMult`, `horde.legEveryMin`), roughly 150 extra calls a day, so the dip-and-reload hour is
resolved in holders rather than transactions. H3d is added to the pre-registration: holder count rising through a
≥ 40% dip after a ≥ 3× first leg predicts price above entry at 6 h; falsified if the top tercile of holder growth
during the dip is below entry at 6 h as often as the bottom tercile.

## Result, 2026-10-20: H3d hold is falsified. Not implemented as an entry.

25 of 26 dip-case holder curves finished (the last loop died on a credential 401 and was stopped). 26 dip cases have a usable curve.

| Slice | n | Reclaimed the pre-dip top | Above the dip price at 6 h | Median price at 6 h |
|---|---|---|---|---|
| Top tercile of holder growth through the dip | 8 | 63% | 25% | 0.19× |
| Bottom tercile | 8 | 0% | 25% | 0.25× |
| Reclaimed, any holder path | 7 | 100% | 43% | 0.54× |
| Failed to reclaim | 19 | 0% | 16% | 0.25× |

The pre-registered falsifier fired: the top tercile is above the dip at 6 h exactly as often as the bottom tercile, and its median price is worse. Holder growth predicts a reclaim of the old top. It does not predict a profitable hold.

An exploratory scale-out (buy the dip, sell if the old top is reclaimed, stop −38.5%, 1.5% per side) is +62% on the top tercile and −26% on the bottom. That exit was not pre-registered, n is 8, and the snapshots are 10–30 minutes apart. It is not in the selection engine.

FAUCET (`EZYm…pump`), added as a post-grad case: first watched print $57,272, low $6,138 (0.11×), peak $405,762 (7.08×). Similar non-SOL fades (first print $20k–$120k, fade to ≤40% inside 16 h): n 49, median peak 1.05×, median 24 h 0.10×, one other coin reached 5×. Selection decision: do not enter. Fingerprint remains `96f45eab`.
