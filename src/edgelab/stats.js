// Edge Lab statistics. Pure functions (no I/O) so the pass logic is unit-tested.
import { PASS_BAR } from './hypotheses.js';

/** Inverse standard normal CDF (Acklam's approximation, |error| < 1.2e-9). */
export function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** One-sided z for a family-wise error rate alpha spread over m tests (Bonferroni). */
export const zFamily = (m, alpha = PASS_BAR.familyAlpha) => invNorm(1 - alpha / Math.max(1, m));

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sdev = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return null; const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };

/** Net return (%) after a round-trip cost fraction. */
export const netOf = (grossPct, cost) => ((1 + grossPct / 100) * (1 - cost) - 1) * 100;
/** Round-trip cost fraction for a per-side fee and per-side slippage (percent). */
export const roundTrip = (feePct, slipPct) => 1 - (1 - feePct / 100) ** 2 * (1 - slipPct / 100) ** 2;

/**
 * Evaluate one hypothesis × window.
 * rows: [{ ts, net }] one per token, sorted by ts. universe: [{ net }] same window and period.
 * m: number of tests in the family (for the corrected bound).
 */
export function evaluate(rows, { m = 1, universe = null, bar = PASS_BAR, reference = false } = {}) {
  const v = rows.map((r) => r.net), n = v.length;
  const mu = mean(v), sd = sdev(v), se = sd != null ? sd / Math.sqrt(n) : null;
  const z = zFamily(m, bar.familyAlpha);
  const lo = se != null ? mu - z * se : null;
  const h = Math.floor(n / 2), h1 = v.slice(0, h), h2 = v.slice(h);
  const halves = { first: mean(h1), second: mean(h2), n1: h1.length, n2: h2.length };
  const drop = Math.max(3, Math.ceil((n * bar.dropTopPct) / 100));
  const trimmed = [...v].sort((a, b) => a - b).slice(0, Math.max(0, n - drop));
  const robustMean = mean(trimmed);
  let vsUniverse = null;
  if (universe && universe.length > 1 && n > 1) {
    const u = universe.map((r) => r.net), um = mean(u), us = sdev(u);
    const diff = mu - um, dse = Math.sqrt(sd ** 2 / n + us ** 2 / u.length);
    vsUniverse = { universeMean: um, universeN: u.length, diff, lo: diff - 1.96 * dse, hi: diff + 1.96 * dse };
  }
  const spanDays = n > 1 ? (rows[n - 1].ts - rows[0].ts) / 86400000 : 0;
  const checks = {
    sample: n >= bar.minTokens,
    span: spanDays >= (bar.minSpanDays ?? 0),
    margin: lo != null && lo >= bar.marginPts,
    halves: h1.length > 0 && h2.length > 0 && halves.first > 0 && halves.second > 0,
    robust: robustMean != null && robustMean > 0,
    universe: reference ? null : vsUniverse != null && vsUniverse.lo > 0,
  };
  let status = 'COLLECTING';
  if (n >= bar.minTokens) {
    if (mu <= 0) status = 'FAIL';
    else if (!reference && checks.span && checks.margin && checks.halves && checks.robust && checks.universe) status = 'PASS';
    else status = 'CANDIDATE';
  }
  return { n, needed: bar.minTokens, meanPct: mu, medianPct: median(v), winPct: n ? (v.filter((x) => x > 0).length / n) * 100 : null, sdPct: sd, z, loPct: lo,
    halves, spanDays, robustMeanPct: robustMean, dropped: Math.min(drop, n), vsUniverse, checks, status };
}

/** Rough tokens-per-day rate and days until minTokens. */
export function eta(rows, sinceMs, now = Date.now(), minTokens = PASS_BAR.minTokens) {
  const days = Math.max((now - sinceMs) / 86400000, 1 / 24);
  const perDay = rows.length / days;
  const tokenDays = rows.length >= minTokens ? 0 : perDay > 0 ? (minTokens - rows.length) / perDay : null;
  const spanLeft = Math.max(0, (PASS_BAR.minSpanDays ?? 0) - (rows.length > 1 ? (now - rows[0].ts) / 86400000 : 0));
  return { perDay, tokenDays, spanLeft, daysLeft: tokenDays == null ? null : Math.max(tokenDays, spanLeft) };
}

export function histogram(vals, edges = [-100, -50, -30, -20, -10, -5, 0, 5, 10, 20, 30, 50, 100, 1e9]) {
  return edges.slice(0, -1).map((e, i) => ({ lo: e, hi: edges[i + 1], n: vals.filter((x) => x >= e && x < edges[i + 1]).length }));
}
