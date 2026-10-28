# Pre-registration: Unpriced checkpoint book (2026-10-28)

Paper only. This book does not change Main, the capital-protection book, or the existing `random` control. It does not reopen Hypothesis 1. Historical replays are not evidence for this book. It has no edge unless its own prospective kill rule says PASS on its own fingerprint cohort.

Deploying this file set starts a new settings fingerprint (`52746d10` on default settings). Cohort `4033fed1` ends at that restart and must not be pooled with the new one. `96f45eab` stays closed.

## Hypothesis

At a fixed age of 120 seconds, among tokens that are not hard-rejected, a score that buys flow which has not yet been paid for in price has a higher after-cost mean return than a random other non-rejected token scored at the same checkpoint.

The failure this is aimed at: the live Main score puts about 56 of 100 points on flow, momentum, breadth, and pressure, and it fires on the first crossing of 72. That is a selection after the run. This book does not use that score and does not fire on a crossing.

## Features (frozen)

Computed in `src/engine/unpriced.js` from the token's own tape. No fitted weights.

- Early window: the first 60 seconds (`UNPRICED_EARLY_SEC`).
- `earlyLow`: the smaller of `initialMcap` and the lowest trade mcap inside the early window.
- `extensionPct`: `(mcap / earlyLow - 1) * 100`. How far price has already run.
- `flowPerExtension`: `netSol / max(extensionPct / 100, 0.05)`. Net SOL into the curve per unit of price extension. The 0.05 floor stops a flat price from dividing by zero.
- `earlyVwap`: SOL-weighted average trade mcap of buys inside the early window.
- `vsEarlyVwap`: `earlyVwap / mcap`. 1 means the checkpoint price equals what early buyers paid. Above 1 means the checkpoint is cheaper than that VWAP.

Score, 0–100, only if none of the gates below fire:

- `flowNotPriced` = `60 * ramp(flowPerExtension, 2, 40)`
- `vwapRoom` = `40 * ramp(vsEarlyVwap, 0.85, 1.15)`

Gates (score 0):

- `extensionPct > 80` (`UNPRICED_MAX_EXTENSION_PCT`) — the move is already priced.
- `netSol < 1` (`UNPRICED_MIN_NET_SOL`) — there is no flow to be early to.
- fewer than 3 buys inside the early window.

## Entry

- Once per token, on the first evaluation whose age is inside `[120, 150]` seconds (`UNPRICED_CHECKPOINT_SEC` and `UNPRICED_MATCH_WINDOW_SEC`).
- The token must not be hard-rejected by the existing scorer. A hard reject still excludes it from every book, including this one.
- Enter the `unpriced` book when the score is at least 60 (`UNPRICED_MIN_SCORE`).
- A token already older than 150 seconds when first seen (restart, late create) is marked and skipped. This book does not chase.
- Fill and costs match Main: 15 second delay, curve price, 1.25% fee each side, 3% extra slippage. Exits match Main: +25% net take-profit, 38.5% stop (capped at 47%), the shared trail, 60 minute max hold, 10 minute idle curve, and graduation. This is a selection test, not an exit test.

## Control

`unpricedctl`. At each Unpriced entry, one random other token that is also inside the 120–150 second window, is not hard-rejected, and was not taken by `unpriced`. Same delay, costs, and exits.

This is not the existing `random` book. That book stays matched to Main, Band, and Flow signals. Unpriced does not call it.

If no peer is in the window, the entry is still recorded and the control counter increments. The kill rule cannot PASS until the control itself has at least 30 closed trades.

## Kill rule (the only PASS)

`killRule('unpriced')` in `src/engine/paper.js`. PASS requires all of the following on the current fingerprint, excluding gap-flagged rows and rows gated by an enforced market pause:

1. At least 50 closed trades (`KILL_MIN_TRADES`).
2. The 99% lower bound of mean P&L per trade is above zero (`KILL_CONFIDENCE`).
3. Both halves by exit time are positive, and each half has at least 10 trades.
4. It beats `unpricedctl`: the 95% lower bound of the mean difference is above zero, and the control has at least 30 closed trades.

Until that PASS, the book is not an edge. Paper only. No live trading, no wallet key, no signing.

## What would make the registration wrong

- The checkpoint is still after the move that matters, and 120 seconds is just a later version of the same chase.
- The control window is thin, so the pairs are not from the same moment even though the ages match.
- Costs (no failed transactions, no priority fee, no MEV) remain optimistic. A PASS here would still not be a live-money result.
