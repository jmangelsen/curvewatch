// Edge Lab hypothesis registry. Each hypothesis is a fixed filter on the feature snapshot a token had at an entry
// age, tested at fixed holding windows. Thresholds are written down BEFORE testing; a hypothesis only counts tokens
// launched after it was registered (its definition hash first seen), so ideas formed on old data cannot pass on it.
// Changing a filter changes its hash and restarts its count. Add new ideas at the bottom; never edit one to fit.
//
// f = compact features at the snapshot (see engine.compact), s = { score, mcap, reject }

export const HORIZONS = [
  { id: '30-60', entry: 30, exit: 60, label: 'enter at 30 s, exit at 60 s' },
  { id: '30-120', entry: 30, exit: 120, label: 'enter at 30 s, exit at 2 min' },
  { id: '60-180', entry: 60, exit: 180, label: 'enter at 1 min, exit at 3 min' },
  { id: '120-300', entry: 120, exit: 300, label: 'enter at 2 min, exit at 5 min' },
  { id: '300-600', entry: 300, exit: 600, label: 'enter at 5 min, exit at 10 min' },
];

export const HYPOTHESES = [
  // ---- reference ----
  { id: 'universe', family: 'Reference', label: 'Every unrejected token', reference: true,
    thesis: 'The base rate. Everything else is compared against this.', test: () => true },
  { id: 'alert72', family: 'Reference', label: 'Current alert rule (score ≥ 72)',
    thesis: 'What Main trades today. Replay on Oct 14 said it underperforms random picks.', test: (f, s) => s.score >= 72 },
  { id: 'band6572', family: 'Reference', label: 'Score 65–72 (Band)', thesis: 'The near-miss band Band trades.', test: (f, s) => s.score >= 65 && s.score < 72 },
  // ---- smart money ----
  { id: 'smart1', family: 'Smart money', label: '1+ smart wallet bought', thesis: 'Wallets with a record of early wins know something.', test: (f) => f.smartBuyers >= 1 },
  { id: 'smart2', family: 'Smart money', label: '2+ smart wallets bought', thesis: 'Best lead on Oct 14 (+3.0% raw per snapshot) but unstable per token.', test: (f) => f.smartBuyers >= 2 },
  { id: 'smart2clean', family: 'Smart money', label: '2+ smart wallets, not bundled (<30%)', thesis: 'Smart money without a coordinated bundle behind it.', test: (f) => f.smartBuyers >= 2 && (f.bundlePct ?? 0) < 30 },
  // ---- quiet / early ----
  { id: 'quiet', family: 'Quiet early', label: 'Quiet: 60 s flow < 5 SOL and curve < 20%', thesis: 'Oct 14 scan: the least active fifth did best; the score buys spikes that fade.', test: (f) => f.flow60Sol < 5 && f.progressPct < 20 },
  { id: 'quietorganic', family: 'Quiet early', label: 'Quiet, 10+ buyers, not botted', thesis: 'Quiet but with real distinct buyers and few tiny or repeat bot trades.',
    test: (f) => f.flow60Sol < 5 && f.progressPct < 20 && f.uniqueBuyers >= 10 && (f.tinyBuyShare ?? 1) < 0.3 && (f.repeatTradeShare ?? 1) < 0.2 },
  // ---- flow ----
  { id: 'momentum', family: 'Flow', label: 'Hot: buy/sell ≥ 2 and net ≥ 5 SOL/min', thesis: 'Classic momentum. Expected to fail (mean reversion); kept as a check.', test: (f) => f.buySellRatio >= 2 && f.netSolPerMin >= 5 },
  { id: 'whalebuys', family: 'Flow', label: 'Large buys: median buy ≥ 0.5 SOL', thesis: 'Sized buyers rather than dust.', test: (f) => f.medianBuySol >= 0.5 },
  { id: 'dipbuy', family: 'Flow', label: 'Dip: drawdown ≥ 30% with net inflow > 0', thesis: 'Buy the pullback after a pump while money is still net in.', test: (f) => f.drawdownPct >= 30 && f.netSol > 0 },
  { id: 'organic', family: 'Flow', label: 'Organic: 15+ buyers, tiny < 30%, repeat < 20%', thesis: 'Many real buyers, little bot noise.', test: (f) => f.uniqueBuyers >= 15 && (f.tinyBuyShare ?? 1) < 0.3 && (f.repeatTradeShare ?? 1) < 0.2 },
  // ---- holders / creator ----
  { id: 'spread', family: 'Holders', label: 'Spread out: top 10 < 15%, 10+ buyers', thesis: 'No concentrated holder to dump on buyers.', test: (f) => f.top10Pct < 15 && f.uniqueBuyers >= 10 },
  { id: 'devholds', family: 'Creator', label: 'Dev holds 1–10%, sold nothing', thesis: 'Creator still has skin in the game.', test: (f) => f.creatorHoldPct >= 1 && f.creatorHoldPct <= 10 && !f.creatorSoldPct },
  { id: 'firstdev', family: 'Creator', label: 'First-time creator', thesis: 'Not a serial launcher.', test: (f) => (f.creatorLaunches ?? 0) <= 1 },
  { id: 'provendev', family: 'Creator', label: 'Creator has graduated a token before', thesis: 'A track record of getting tokens through the curve.', test: (f) => f.creatorGraduations >= 1 },
  // ---- social / size ----
  { id: 'socials', family: 'Social', label: 'X, Telegram and website all set', thesis: 'More effort from the team.', test: (f) => !!(f.hasTwitter && f.hasTelegram && f.hasWebsite) },
  { id: 'midcap', family: 'Size', label: 'Market cap 40–90 SOL', thesis: 'Past the dust stage, far from graduation. Oct 14 paper data looked least bad here.', test: (f, s) => f.mcapSol >= 40 && f.mcapSol < 90 },
];

// Pass bar (all must hold). Written here so the UI, README and tests read the same numbers.
export const PASS_BAR = {
  minTokens: 300,          // distinct tokens since the hypothesis was registered
  minSpanDays: 3,          // those tokens must span 3+ days: 300 tokens from one hot hour is one market mood, not 300 trials
  marginPts: 2,            // net mean lower bound must clear +2 points after costs
  familyAlpha: 0.01,       // one-sided, Bonferroni across every hypothesis × window tested
  halvesPositive: true,    // net mean > 0 in both halves of the sample (by time)
  dropTopPct: 1,           // still net positive with the best 1% of tokens removed (at least 3)
  beatUniverse: true,      // 95% lower bound of (hypothesis − universe) net mean > 0
};
