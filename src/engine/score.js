// Scoring = hard rejects (structural rug / manipulation tells) + weighted evidence (organic demand).
// Weights are explicit priors. Calibrate them against your own labeled data (npm run backtest),
// never against intuition or social-media claims.
import { config } from '../config.js';
import { ramp, clamp, round } from '../util.js';

export function score(f) {
  const S = config.scoring;
  const reasons = [];
  const flags = [];
  let reject = null;

  // ---------- Hard rejects ----------
  if (!f.quoteOk) reject = 'non-SOL quote';
  else if (f.mayhem) reject = 'mayhem mode';
  else if (f.creatorLaunches >= S.serialRuggerLaunches && f.creatorGraduations === 0) reject = `serial launcher (${f.creatorLaunches} launches, 0 grads)`;
  else if (f.creatorSoldPct >= S.maxCreatorSoldPct) reject = `creator sold ${round(f.creatorSoldPct, 0)}%`;
  else if (f.bundlePct >= S.maxBundlePct && f.bundleWallets >= 3) reject = `bundled launch (${round(f.bundlePct, 0)}% of buys in first slots)`;
  else if (f.top10Pct >= S.maxTop10Pct) reject = `top-10 hold ${round(f.top10Pct, 0)}%`;
  else if (f.drawdownPct >= S.maxDrawdownPct) reject = `-${round(f.drawdownPct, 0)}% from peak`;
  else if (f.progressPct >= S.maxCurveProgressPct) reject = `late: curve ${round(f.progressPct, 0)}%`;
  else if (f.repeatTradeShare > 0.6) reject = 'wash-trading pattern';

  // ---------- Evidence (max 100) ----------
  const parts = {
    flow: 22 * ramp(f.netSolPerMin, 0.5, 8),            // sustained net SOL into the curve
    momentum: 10 * ramp(f.flow60Sol, 0, 6),              // last-60s net flow (is it still alive?)
    breadth: 16 * ramp(f.buyersPerMin, 3, 35),           // distinct wallets arriving
    pressure: 8 * ramp(f.buySellRatio, 1.1, 3),
    distribution: 10 * (1 - ramp(f.top10Pct, 15, S.maxTop10Pct)),
    stage: f.progressPct >= 12 && f.progressPct <= 70 ? 8 : f.progressPct > 70 ? 3 : 2,
    social: (f.hasTelegram ? 5 : 0) + (f.hasTwitter ? 3 : 0) + (f.hasWebsite ? 2 : 0),
    smart: Math.min(15, f.smartBuyers * 5),
    creator: f.creatorGraduations > 0 ? 6 : f.creatorLaunches <= 1 ? 2 : f.creatorLaunches >= 4 ? -8 : 0,
    skin: f.initialBuySol >= 0.5 && !f.creatorSold ? 4 : 0, // dev self-buy above default + still holding
  };
  let penalties = 0;
  if (f.tinyBuyShare > 0.5) { penalties += 6; flags.push('dust-buy spam'); }
  if (f.bundlePct >= 25) { penalties += 6; flags.push(`partial bundle ${round(f.bundlePct, 0)}%`); }
  if (f.creatorSold) { penalties += 5; flags.push('creator has sold'); }
  if (f.secSinceTrade > 45) { penalties += 10; flags.push('stalling'); }
  if (f.uniqueBuyers < S.minUniqueBuyers) { penalties += 15; flags.push(`thin: ${f.uniqueBuyers} buyers`); }
  if (f.drawdownPct > 25) { penalties += 5; flags.push(`-${round(f.drawdownPct, 0)}% off peak`); }

  let total = Object.values(parts).reduce((a, b) => a + b, 0) - penalties;
  total = clamp(total, 0, 100);

  if (parts.flow > 14) reasons.push(`+${round(f.netSolPerMin, 1)} SOL/min net inflow`);
  if (parts.breadth > 10) reasons.push(`${round(f.buyersPerMin, 0)} new buyers/min`);
  if (parts.momentum > 6) reasons.push(`+${round(f.flow60Sol, 1)} SOL last 60s`);
  if (parts.distribution > 7) reasons.push(`top-10 only ${round(f.top10Pct, 0)}%`);
  if (f.smartBuyers) reasons.push(`${f.smartBuyers} smart wallet${f.smartBuyers > 1 ? 's' : ''} in`);
  if (f.hasTelegram) reasons.push('Telegram linked');
  if (f.creatorGraduations > 0) reasons.push(`creator has ${f.creatorGraduations} prior grad${f.creatorGraduations > 1 ? 's' : ''}`);
  if (parts.skin) reasons.push(`dev bought ${round(f.initialBuySol, 2)} SOL, holding`);

  return { score: reject ? 0 : round(total, 1), raw: round(total, 1), reject, reasons, flags, parts };
}
