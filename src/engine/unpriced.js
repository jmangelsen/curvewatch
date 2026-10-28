// Pre-registered paper book: "momentum not yet priced", scored once at a fixed checkpoint.
// Priors are frozen in this file and in config.strategies.unpriced. They were not fitted on outcomes.
// See docs/decisions/2026-10-28-unpriced-checkpoint.md. Paper only. Does not change Main, capital, or random.
import { CURVE, config } from '../config.js';
import { ramp, clamp, round } from '../util.js';

/**
 * Score one token from its own early tape.
 * High when net flow is large relative to how far price has already extended, and when the
 * current price is not far above the volume-weighted price early buyers paid.
 * Returns score 0 when the move is already extended, flow is thin, or there are too few early buys.
 */
export function scoreUnpriced(token, features = {}) {
  const U = config.strategies.unpriced;
  const earlyMs = U.earlySec * 1000;
  const born = token.createdAt || 0;
  const mcap = Number.isFinite(features.mcapSol) ? features.mcapSol : token.mcap;
  let earlyLow = Number.isFinite(token.initialMcap) ? token.initialMcap : mcap;
  let vwapNum = 0, vwapDen = 0, earlyBuys = 0;
  for (const t of token.trades || []) {
    if (t.at - born > earlyMs) break;
    if (t.mcap > 0 && t.mcap < earlyLow) earlyLow = t.mcap;
    if (t.b && t.sol > 0 && t.mcap > 0) { vwapNum += t.mcap * t.sol; vwapDen += t.sol; earlyBuys++; }
  }
  const netSol = features.netSol != null ? features.netSol : ((token.vsol || 0) - CURVE.INITIAL_VSOL);
  const extensionPct = earlyLow > 0 && mcap > 0 ? (mcap / earlyLow - 1) * 100 : 0;
  const flowPerExtension = netSol / Math.max(extensionPct / 100, 0.05);
  const earlyVwap = vwapDen > 0 ? vwapNum / vwapDen : earlyLow;
  const vsEarlyVwap = mcap > 0 ? earlyVwap / mcap : 0;
  let reject = null;
  if (extensionPct > U.maxExtensionPct) reject = `already extended ${round(extensionPct, 0)}%`;
  else if (netSol < U.minNetSol) reject = `thin flow ${round(netSol, 2)} SOL`;
  else if (earlyBuys < 3) reject = `fewer than 3 early buys (${earlyBuys})`;
  const parts = {
    flowNotPriced: 60 * ramp(flowPerExtension, 2, 40),
    vwapRoom: 40 * ramp(vsEarlyVwap, 0.85, 1.15),
  };
  const total = clamp(parts.flowNotPriced + parts.vwapRoom, 0, 100);
  return {
    score: reject ? 0 : round(total, 1),
    raw: round(total, 1),
    reject,
    parts,
    features: {
      extensionPct: round(extensionPct, 2),
      flowPerExtension: round(flowPerExtension, 3),
      vsEarlyVwap: round(vsEarlyVwap, 3),
      earlyVwap: round(earlyVwap, 2),
      earlyBuys,
      netSol: round(netSol, 3),
    },
  };
}

/**
 * One decision per token, the first time age reaches the checkpoint.
 * Tokens already older than the match window (restart, late create) are marked and skipped:
 * this book does not chase a coin after the checkpoint.
 */
export function considerUnpriced(token, { age, rejected, features = null, now = Date.now() } = {}) {
  const U = config.strategies.unpriced;
  if (!U?.enabled || token.unpricedAt) return { acted: false };
  if (age < U.checkpointSec) return { acted: false };
  if (age > U.checkpointSec + U.matchWindowSec) {
    token.unpricedAt = now;
    return { acted: true, skipped: 'late' };
  }
  token.unpricedAt = now;
  if (rejected) return { acted: true, skipped: 'rejected' };
  const scored = scoreUnpriced(token, features || {});
  token.unpricedScore = scored.score;
  if (scored.reject || scored.score < U.minScore) return { acted: true, skipped: scored.reject || 'below threshold', scored };
  token.unpricedTaken = true;
  return { acted: true, enter: true, scored };
}

/** Random other non-rejected token sitting in the same checkpoint window. Not the Main random book. */
export function pickUnpricedControl(tokens, sig, now = Date.now()) {
  const U = config.strategies.unpriced;
  const pool = [];
  for (const t of tokens) {
    if (t === sig || t.lite || t.graduated || t.unpricedCtlAt || t.unpricedTaken || t.rejectedHard) continue;
    if (!t.lastScore || t.lastScore.reject) continue;
    const age = (now - t.createdAt) / 1000;
    if (age < U.checkpointSec || age > U.checkpointSec + U.matchWindowSec) continue;
    pool.push(t);
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
