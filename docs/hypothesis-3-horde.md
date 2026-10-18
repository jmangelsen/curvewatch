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
