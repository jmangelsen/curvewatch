// Graduates backtester: replays entry thresholds × exit rules over the stored 10-minute graduate snapshots.
//
// What it can answer: "on the graduates this machine has watched, which exit shape and which score threshold would have
// lost least / made most". What it cannot do: stand in for forward data. Every variant is scored on the same history, so
// the best of G variants is biased upward by selection (shown as the "best-of-G lift" so it is not forgotten), and the
// snapshots are 10 minutes apart where the live books poll every 60 s, so stops and trails fire late in both directions.
// The honest read is the time split: a rule that only works in the first half of the sample is noise.
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';

const log = logger('gradbt');
const G = config.grads, GP = config.gradPaper;
const MIN = 60000;

/** Exit-rule grid. `id` is stable so registrations and drills can refer to it. */
export function exitGrid() {
  const out = [];
  for (const hold of [180, 360, 720, 1440]) for (const tp of [1.5, 2]) out.push({ id: `fixed:tp${tp}:h${hold}`, kind: 'fixed', label: `Fixed · sell ½ at ${tp}×, 25% trail, stop −38.5%, ${hold / 60} h hold`, tp1: tp, tp1Frac: 0.5, trail: 25, stop: 38.5, hold });
  for (const arm of [1.0, 1.2, 1.5]) for (const tr of [20, 30, 40]) out.push({ id: `trail:a${arm}:t${tr}`, kind: 'trail', label: `Trail · arm at ${arm}×, ${tr}% from peak, stop −38.5%, 72 h ceiling`, arm, trail: tr, stop: 38.5, hold: 4320 });
  for (const hold of [60, 180, 360, 720]) out.push({ id: `timed:h${hold}`, kind: 'timed', label: `Timed · stop −38.5%, sell at ${hold >= 60 ? hold / 60 + ' h' : hold + ' min'}`, stop: 38.5, hold });
  return out;
}
export const ENTRY_SCORES = [40, 50, 60, 70];
export const LIVE_IDS = { fixed: `fixed:tp${GP.tp1Multiple}:h${GP.maxHoldMin}`, trail: `trail:a${GP.trailArmMultiple}:t${GP.trailBookPct}` };

function loadSeries() {
  const rows = db.prepare(`SELECT mint, ts, price, liq, score, reject FROM grad_snapshots WHERE price > 0 ORDER BY mint, ts`).all();
  const dropped = new Map(db.prepare(`SELECT mint, dropped_reason FROM grad_watch WHERE active = 0`).all().map((r) => [r.mint, r.dropped_reason || '']));
  const series = new Map();
  for (const r of rows) { let s = series.get(r.mint); if (!s) series.set(r.mint, (s = [])); s.push(r); }
  return { series, dropped, n: rows.length, from: rows.length ? Math.min(...rows.map((r) => r.ts)) : null, to: rows.length ? Math.max(...rows.map((r) => r.ts)) : null };
}

/** One position, one exit rule, walked over the snapshots after entry. Returns { pct, reason, heldMin, truncated }. */
function walk(rule, entryFill, after, liqGone, solUsd) {
  const size = GP.sizeSol * solUsd; // USD
  let units = size / entryFill, realized = 0, peak = 1, tp1 = false, last = null;
  const value = (p, liq, u = units) => { const gross = u * p; const impact = gross / (Math.max(1, liq / 2) + gross); return gross * (1 - impact) * (1 - GP.feePct / 100) * (1 - GP.extraSlippagePct / 100); };
  for (const s of after) {
    last = s; const total = realized + value(s.price, s.liq), mult = total / size; if (mult > peak) peak = mult;
    const held = (s.ts - after[0].t0) / MIN;
    if (rule.kind === 'fixed') {
      if (!tp1 && mult >= rule.tp1) { const u = units * rule.tp1Frac; realized += value(s.price, s.liq, u); units -= u; tp1 = true; continue; }
      if (mult <= 1 - rule.stop / 100) return { pct: (mult - 1) * 100, reason: 'stop', heldMin: held };
      if (tp1 && total <= peak * size * (1 - rule.trail / 100)) return { pct: (mult - 1) * 100, reason: 'trail', heldMin: held };
      if (held >= rule.hold) return { pct: (mult - 1) * 100, reason: 'max hold', heldMin: held };
    } else if (rule.kind === 'trail') {
      const armed = peak >= rule.arm;
      if (!armed && mult <= 1 - rule.stop / 100) return { pct: (mult - 1) * 100, reason: 'stop', heldMin: held };
      if (armed && mult <= peak * (1 - rule.trail / 100)) return { pct: (mult - 1) * 100, reason: 'trail', heldMin: held };
      if (held >= rule.hold) return { pct: (mult - 1) * 100, reason: 'ceiling', heldMin: held };
    } else {
      if (mult <= 1 - rule.stop / 100) return { pct: (mult - 1) * 100, reason: 'stop', heldMin: held };
      if (held >= rule.hold) return { pct: (mult - 1) * 100, reason: 'timed exit', heldMin: held };
    }
  }
  if (liqGone) return { pct: -100, reason: 'liquidity gone', heldMin: last ? (last.ts - after[0].t0) / MIN : 0 };
  const m = last ? (realized + value(last.price, last.liq)) / size : 1;
  return { pct: (m - 1) * 100, reason: 'open at end of data', heldMin: last ? (last.ts - after[0].t0) / MIN : 0, truncated: true };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function summarize(trades) {
  const p = trades.map((t) => t.pct), n = p.length; if (!n) return { n: 0 };
  const m = mean(p), sd = n > 1 ? Math.sqrt(p.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : 0, se = n > 1 ? sd / Math.sqrt(n) : 0;
  const sorted = [...p].sort((a, b) => a - b), med = sorted[Math.floor(n / 2)];
  const byT = [...trades].sort((a, b) => a.ts - b.ts), h = Math.floor(n / 2);
  const mix = {}; for (const t of trades) { (mix[t.reason] ||= { reason: t.reason, n: 0, sum: 0 }); mix[t.reason].n++; mix[t.reason].sum += t.pct; }
  return { n, mints: new Set(trades.map((t) => t.mint)).size, meanPct: m, medianPct: med, winPct: (p.filter((x) => x > 0).length / n) * 100, loPct: m - 1.96 * se, hiPct: m + 1.96 * se,
    firstHalfPct: mean(byT.slice(0, h).map((t) => t.pct)), secondHalfPct: mean(byT.slice(h).map((t) => t.pct)), truncated: trades.filter((t) => t.truncated).length,
    liqGone: trades.filter((t) => t.reason === 'liquidity gone').length, medianHeldMin: [...trades.map((t) => t.heldMin)].sort((a, b) => a - b)[Math.floor(n / 2)],
    mix: Object.values(mix).map((x) => ({ reason: x.reason, n: x.n, avgPct: x.sum / x.n })).sort((a, b) => b.n - a.n) };
}

let cache = { at: 0, result: null, trades: new Map() };
export function runGradBacktest({ solUsd = 100, force = false } = {}) {
  if (!force && cache.result && Date.now() - cache.at < 10 * MIN) return cache.result;
  const t0 = Date.now();
  const { series, dropped, n, from, to } = loadSeries();
  const rules = exitGrid(), results = [], trades = new Map();
  const cooldown = G.alertCooldownMin * MIN;
  for (const S of ENTRY_SCORES) {
    // entries: every scored poll at or above S, one per token per cooldown window (mirrors the alert rule)
    const entries = [];
    for (const [mint, rows] of series) {
      let lastAt = -Infinity;
      for (let i = 0; i < rows.length - 1; i++) { const r = rows[i]; if (r.reject || r.score == null || r.score < S || r.ts - lastAt < cooldown) continue; lastAt = r.ts; entries.push({ mint, i }); }
    }
    for (const rule of rules) {
      const list = [];
      for (const e of entries) {
        const rows = series.get(e.mint), r = rows[e.i];
        const sizeUsd = GP.sizeSol * solUsd, impact = sizeUsd / (Math.max(1, r.liq / 2) + sizeUsd);
        const fill = r.price * (1 + impact) * (1 + GP.extraSlippagePct / 100) / (1 - GP.feePct / 100);
        const after = rows.slice(e.i + 1); if (!after.length) continue; after[0].t0 = r.ts;
        const liqGone = /liquidity|evicted/.test(dropped.get(e.mint) || '');
        const w = walk(rule, fill, after, liqGone, solUsd);
        list.push({ mint: e.mint, ts: r.ts, score: r.score, entryPrice: fill, ...w });
      }
      const key = `${S}|${rule.id}`; trades.set(key, list);
      results.push({ key, entryScore: S, rule: rule.id, kind: rule.kind, label: rule.label, live: rule.id === LIVE_IDS.fixed ? 'fixed' : rule.id === LIVE_IDS.trail ? 'trail' : null, ...summarize(list) });
    }
  }
  const G_ = rules.length * ENTRY_SCORES.length;
  // expected best-of-G lift for independent zero-mean noise: roughly sd/sqrt(n) * E[max of G normals] (~ sqrt(2 ln G))
  const liveFixed = results.find((r) => r.entryScore === G.alertScore && r.live === 'fixed');
  const seRef = liveFixed?.n > 1 ? (liveFixed.hiPct - liveFixed.loPct) / (2 * 1.96) : null;
  const result = { at: Date.now(), ms: Date.now() - t0, snapshots: n, tokens: series.size, from, to, resolutionMin: G.snapshotEveryMin, variants: G_, entryScores: ENTRY_SCORES, liveIds: LIVE_IDS,
    bestOfLiftPts: seRef != null ? seRef * Math.sqrt(2 * Math.log(G_)) : null, solUsd, results: results.sort((a, b) => (b.loPct ?? -1e9) - (a.loPct ?? -1e9)) };
  cache = { at: Date.now(), result, trades };
  log.info(`graduates backtest: ${G_} variants over ${n} snapshots in ${result.ms} ms`);
  return result;
}
export function gradBacktestTrades(key) { if (!cache.result) runGradBacktest(); return cache.trades.get(key) || null; }
