// Anytime-valid sequential test for the mean trade return of a paper book.
//
// Why: a fixed-n gate ("300 trades, then look") is only valid if you look once. Dashboards are looked at continuously, and
// every look at a classical interval inflates the false-positive rate. A confidence sequence (CS) is valid at every n
// simultaneously, so a decision can be taken the moment the sequence excludes zero — early for a clear loser, later for a
// marginal one — without peeking penalties.
//
// Method: hedged betting CS for a bounded mean (Waudby-Smith & Ramdas, JRSS-B 2024, "Estimating means of bounded random
// variables by betting"). Returns r are clipped to [LO, HI] and mapped to x = (r - LO) / (HI - LO) in [0, 1]. For each
// candidate mean m on a grid, a bettor wagers a predictable fraction λ_t of capital that x_t exceeds m (and a mirrored
// bettor that it falls short). Capital K_t(m) = Π (1 + λ_t (x_t - m)) is a non-negative supermartingale when m is the true
// mean, so by Ville's inequality P(sup_t K_t(m) ≥ 1/α) ≤ α. The CS at time t is {m : max(K⁺, K⁻) < 1/α}. λ_t uses the
// running variance (predictable plug-in), truncated so capital can never hit zero.
//
// Decision rule (pre-registered per hypothesis): KILL when the upper bound of the CS for the mean after-cost return is
// below 0; PASS when the lower bound is above the margin; otherwise CONTINUE. α = 0.05 two-sided; one sequence per book.
export const LO = -1, HI = 3; // a paper trade cannot lose more than 100%; wins are winsorised at +300% (declared, not hidden)
const GRID = 401; // candidate means on [LO, HI]

export function confidenceSequence(returns, { alpha = 0.05, lo = LO, hi = HI, grid = GRID } = {}) {
  const n = returns.length;
  const xs = returns.map((r) => (Math.min(hi, Math.max(lo, r)) - lo) / (hi - lo));
  const ms = Array.from({ length: grid }, (_, i) => i / (grid - 1));
  const logKplus = new Float64Array(grid), logKminus = new Float64Array(grid);
  let mean = 0.5, m2 = 0.25, count = 0; // running mean / variance with a prior pseudo-observation at 0.5 (predictable)
  const thresh = Math.log(1 / alpha);
  for (let t = 0; t < n; t++) {
    const x = xs[t];
    const varHat = (m2 + 0.25) / (count + 1); // predictable: uses x_1..x_{t-1} only
    const lamRaw = Math.sqrt((2 * Math.log(2 / alpha)) / (varHat * (t + 1) * Math.log(t + 2)));
    for (let i = 0; i < grid; i++) {
      const m = ms[i];
      const lp = Math.min(lamRaw, 0.5 / Math.max(m, 1e-9)); // keeps 1 + λ(x - m) > 0 for x ≥ 0
      const lm = Math.min(lamRaw, 0.5 / Math.max(1 - m, 1e-9));
      logKplus[i] += Math.log(1 + lp * (x - m));
      logKminus[i] += Math.log(1 - lm * (x - m));
    }
    count++; const d = x - mean; mean += d / count; m2 += d * (x - mean);
  }
  // CS = candidate means not yet rejected by either bettor (hedged: reject when max(K⁺, K⁻) ≥ 1/α)
  let iLo = -1, iHi = -1;
  for (let i = 0; i < grid; i++) { const rej = Math.max(logKplus[i], logKminus[i]) >= thresh; if (!rej) { if (iLo < 0) iLo = i; iHi = i; } }
  if (iLo < 0) { // every grid point rejected (degenerate, tiny n cannot do this); fall back to the sample mean
    const sm = n ? xs.reduce((a, b) => a + b, 0) / n : 0.5; return { n, lo: back(sm, lo, hi), hi: back(sm, lo, hi), mean: n ? returns.reduce((a, b) => a + b, 0) / n : null, alpha };
  }
  const sampleMean = n ? returns.reduce((a, b) => a + Math.min(hi, Math.max(lo, b)), 0) / n : null;
  return { n, lo: back(ms[iLo], lo, hi), hi: back(ms[iHi], lo, hi), mean: sampleMean, alpha };
}
const back = (m, lo, hi) => lo + m * (hi - lo);

/**
 * Pre-registered decision for a book: returns are after-cost fractional P&L per trade (0.05 = +5%).
 * KILL: CS upper < 0 (mean is negative at 95% anytime confidence). PASS: CS lower > passMargin.
 */
export function sequentialVerdict(returns, { alpha = 0.05, passMargin = 0, minTrades = 20 } = {}) {
  const cs = confidenceSequence(returns, { alpha });
  let decision = 'CONTINUE';
  if (cs.n >= minTrades && cs.hi < 0) decision = 'KILL';
  else if (cs.n >= minTrades && cs.lo > passMargin) decision = 'PASS';
  return { ...cs, decision, passMargin, minTrades, width: cs.hi - cs.lo };
}
