# Decision: curve-stage entry hypothesis rejected (2026-10-18)

## Decision

Stop treating the curve-stage 24-hour gate as a path to live capital. The paper books keep running as data collection only. No money is deployed on this rule or its variants. The data is preserved in full for the next hypothesis.

## Hypothesis under test

A token on the Pump.fun bonding curve whose composite score crosses the alert threshold (rule fingerprint `518d883a`, fixed since 2026-10-16 05:48 UTC) can be bought at the signal and sold under the v2 exit rules for a positive expectancy after realistic round-trip cost.

Pre-registered pass condition: rolling 24 h window, at least 300 closed trades, mean P&L above 0, 95% lower bound above −3 points, random control not positive, rule unchanged for 24 h before the window.

## Evidence (sandbox database, closed trades, gap-flagged and gated entries excluded; queried 2026-10-18 01:55 UTC)

| Book | Trades | Mean P&L | 95% interval | Win rate | Profit factor |
|---|---|---|---|---|---|
| Main | 116 | −14.6% | −21.6 to −7.6 | 41% | 0.45 |
| Random control | 100 | −12.4% | −16.1 to −8.6 | 12% | 0.19 |
| Band | 133 | −12.7% | −19.3 to −6.1 | 39% | 0.50 |
| Confirm | 74 | −13.1% | −20.1 to −6.1 | 50% | 0.38 |
| Hold120 | 70 | −19.9% | −27.9 to −11.9 | 29% | 0.30 |
| Timed | 86 | −19.1% | −44.4 to +6.1 | 12% | 0.60 |
| Clean | 25 | −6.8% | −22.8 to +9.2 | 52% | 0.68 |
| Flow | 26 | −12.1% | −28.1 to +4.0 | 46% | 0.54 |

Main minus Random: −2.2 points (−10.2 to +5.7). Edge lab on the production server: 98 rule variants, 0 pass, 4,231 labeled entries. Independent server instance (first 2.5 h): Main −20.2% over 12 trades, Random −9.8% over 17.

## Why this is a rejection and not "wait for n = 300"

The upper bound of Main's 95% interval is −7.6% at n = 116. Reaching n = 300 narrows the interval; it does not move its centre. The result is structural: a 40–50% win rate with winners too small to pay for losers, under an audited round-trip cost of about 10.9% (model assumed 5.4%). The signal is not selecting better entries than chance.

## What is preserved

- Raw trades (now 60 days in the database, then archived), snapshots (180 days, then archived), paper trades, labels, alerts, rejects, graduates snapshots, wallet history: all kept. Aged rows are exported to `DATA_DIR/archive/<table>-<month>.csv.gz` before pruning (`src/db.js` `archiveBefore`).
- Frozen snapshot of the sandbox database at the time of the decision: `curvewatch-sandbox-curve-stage-test-20261018.db.gz`, stored on the production server under `/opt/curvewatch/archive/` and in the workspace `curvewatch-archive/`.
- Server backups: 30 daily copies.

## What this does not say

- It does not say post-graduation momentum (Runner board) fails; that hypothesis is independent and untested (first picks freeze 2026-10-18 09:00 Denver, 48-hour scorecard from 2026-10-20).
- It does not say a lower-cost execution path (lower slippage, maker fills) would also fail; the cost term is large enough that this is a separate question, not a tuning of this one.

## Candidate next hypotheses (not yet pre-registered)

1. Post-graduation runner selection (already instrumented).
2. Short-side or avoidance signals: the labeled data is rich in what loses; a filter that predicts the −50% outcomes has value for anyone trading this venue, including as a data product.
3. Smart-wallet following with explicit fill-cost modelling, using the wallet tracker tables.

Each must be pre-registered with its own kill condition before trades are counted.
