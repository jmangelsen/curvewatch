# Pre-registration: Hypothesis 2, smart-wallet follow (2026-10-18)

## What the preserved data says (study on the sandbox database, Oct 13–18)

Launches (27,994 labeled snapshots at 2, 5 and 10 minutes of age, 11,115 tokens, trained Oct 13–15, validated Oct 16):

- An L2 logistic model on the stored features predicts graduation and +100% moves with out-of-time AUC 0.95–0.99.
- The top decile by predicted probability returns −9 to −13% at a fixed 1-hour horizon, and −11 to −18% with take-profit/stop exits; deciles 0–8 are dead tokens with median return exactly 0. Buying "early and promising" (high probability, progress below 30%) returns −8 to −12%.
- Conclusion: predictability is high and profitability is negative. By the time a launch looks good its price already reflects it, and the exit is sold into. No long-only selection on launch features has positive expectancy after an 11% round trip. This closes the launch side for long entries; the launch model remains useful as a feature and as an avoidance signal.

Graduates (75,190 labeled snapshots, 2,695 mints):

- Labeling defect found: a token that left the watchlist before the 6-hour horizon was scored as −100%. 2,288 of those drops were evictions for a full watchlist, not deaths. 31,920 rows (42%) were affected and are now right-censored (NULL outcome, `censored=1`); only genuine deaths (liquidity gone, pool gone) keep a loss label. Watch capacity raised to 1,500 and seeded rows are evicted first.
- Ramp/honeypot pattern found: the strongest-looking "winners" (92–100% win rate, +12–17% per 6 h) were pools whose price climbed in a straight line while liquidity stayed frozen, with 24-hour changes of +4,000% to +500,000% and market caps up to $224M within 4 hours of migration, ending with liquidity pulled. 363 of 2,695 mints matched. They are now a reject reason (`ramp pattern`), so no book trades them and no scorecard counts them. USDC had also been added as a "graduate" from a migration message; quote mints are now ignored.
- After both repairs, every age and liquidity band of real graduates loses 5–37% per 6 hours on average (per-mint first signal, censored excluded, which is the optimistic reading). Momentum filters, dip-buying and liquidity floors do not change the sign.

Smart wallets (5,848 scored positions, 588 wallets; one clean walk-forward day):

- Wallets ranked on prior days only: their positions on Oct 16 returned +11.4% (95% cluster-bootstrap interval +2.5 to +20.1, 213 positions, 150 tokens) versus +7.8% for all positions that day. Before cost; thin; the only positive conditional mean in the data.

## Hypothesis

Buys of at least 0.2 SOL by wallets with an empirical-Bayes posterior mean position return of at least +10% (realized basis, at least 5 scored positions), on tokens at most 30 minutes old that pass the screen, have positive expectancy after cost under the v2 exit rules, and beat a matched random control from the same moments.

## Mechanism claimed

Information asymmetry: some wallets know something (coordination, insider access, better latency, better taste) before the price shows it. If the claim is true, following them is early enough to be paid; if what they know is only latency, the follower arrives after the move and the book loses, which is the likely failure.

## Method

- Ranking: normal-normal empirical-Bayes shrinkage of each wallet's mean clipped position return toward the population mean, with between-wallet variance estimated by method of moments net of sampling noise. Three lucky positions cannot outrank forty solid ones. (`src/engine/smartTracker.js`, `ebPosteriors`.)
- Book: `follow`, exits identical to Main (take-profit 50% at 1.5×, stop 38.5%, trail, max hold). Control: `followctl`, a random eligible token matched on age (±) and market cap at each Follow entry. Rejected coins are never traded. (`src/engine/engine.js`, `maybeFollow`.)
- Decision: hedged betting confidence sequence (Waudby-Smith & Ramdas 2024) on after-cost returns clipped to [−100%, +300%], α = 0.05, anytime-valid, checked after every closed trade. KILL when the upper bound is below 0 after at least 20 trades. PASS when the lower bound is above +2% after at least 20 trades and Follow minus control excludes 0. (`src/engine/seqtest.js`; gate card and `seq:` drill.)
- No rule change while open. Any change restarts the sequence (the settings fingerprint already enforces this).

## Expected value, stated before the first trade

Prior probability the hypothesis passes: about 20%. If it passes, expectancy is a few percent per trade on a few dozen trades a day at tiny size: not a business, an edge worth a second, larger test. If it fails, the sequence will say so in roughly 100–150 trades (one to three days at current wallet activity) and the data remains.

## What would make this conclusion wrong

- Latency: the follower's fill is after the wallet's, by design. The paper fill audit already measures this; if Follow loses while the followed wallets' own positions win, the edge exists but is not reachable from here.
- Wallet turnover: ranked wallets may stop being good (regime, or they were lucky). The posterior updates every 10 minutes as positions score; the book is tested as a process, not as a fixed list.
- Few eligible wallets (2 at opening). Trade count may be low; the sequence simply takes longer.
