Task: weekly evidence review of the Capital protection challenger vs Main. Use only the fingerprint /api/status reports. 4033fed1, 52746d10, and ac00c1e9 are separate cohorts; do not pool them. 96f45eab stays closed.

Input: JSON from /api/paper and /api/terminal/strategies?days=7 (pasted below).
Report:
- n paired comparisons, paired mean difference, interval, and whether it excludes zero.
- Count: Main losers rescued, Main winners turned into losers, losses worse than 47% in each book.
- Realized fill vs trigger slippage on stop exits (how far past 47% / 38.5% fills landed).
- Whether results are consistent with the historical audit (+1.17 pts, interval -0.14 to +2.49) or not.
- Verdict using only: COLLECTING / FAIL / MARGINAL / PASS (kill-rule definitions in README section 1).
Rules: no pooling with 96f45eab, no optimism, no parameter tuning suggestions until n >= 50 pairs.
Any tuning proposal must be labeled as starting a new cohort.

<paste JSON here>
