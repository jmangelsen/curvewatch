// Paper-only capital protection. Triggers are not guaranteed execution prices.
export const CAPITAL_POLICY = Object.freeze({
  id: 'capital-protection-v1', maxStopPct: 47,
  firstTarget: 1.10, firstFraction: 0.5,
  secondTarget: 1.20, secondFractionOfOriginal: 0.25,
  floorAfterFirst: 1.02, trailPct: 12,
});

export function cappedStop(stopPct) {
  return Math.min(CAPITAL_POLICY.maxStopPct, Number.isFinite(stopPct) && stopPct > 0 ? stopPct : CAPITAL_POLICY.maxStopPct);
}

/** Stages use total executable position equity, including already banked cash. */
export function capitalAction({ multiple, peakMultiple, stage = 0, remainingFraction = 1, stopPct = 38.5 }, rule = CAPITAL_POLICY) {
  if (multiple <= 1 - cappedStop(stopPct) / 100) return { kind: 'exit', reason: `stop -${cappedStop(stopPct)}%` };
  if (stage > 0 && multiple <= rule.floorAfterFirst) return { kind: 'exit', reason: 'capital profit floor' };
  if (stage > 0 && multiple <= peakMultiple * (1 - rule.trailPct / 100)) return { kind: 'exit', reason: `capital trailing stop ${rule.trailPct}%` };
  if (stage === 0 && multiple >= rule.firstTarget) return { kind: 'tp', fraction: rule.firstFraction, reason: `capital bank 50% at +${Math.round((rule.firstTarget - 1) * 100)}% net mark` };
  if (stage === 1 && multiple >= rule.secondTarget) return {
    kind: 'tp', fraction: Math.min(1, rule.secondFractionOfOriginal / Math.max(remainingFraction, 1e-12)),
    reason: 'capital bank another 25% of original position',
  };
  return null;
}
