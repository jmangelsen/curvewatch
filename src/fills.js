// Fill realism: how close are paper fills to what real wallets actually got?
// For every paper entry/exit we look at real trades on the same token in the same few seconds (from the recorded
// trade tape), of similar size, and compare price per token. Real prices include the curve fee so both sides are
// on the same footing. Results are stored on the trade, then aggregated for the Health tab.
import { config } from './config.js';
import { db } from './db.js';
import { CFG } from './version.js';
import { logger } from './log.js';
const log = logger('fills');
const P = config.paper;
const WIN_MS = 5000, SIZE_LO = 0.25, SIZE_HI = 4;

const Q = {
  dueEntry: db.prepare(`SELECT id, mint, entry_ts, size_sol, tokens FROM paper_trades WHERE fill_n IS NULL AND status IN ('open','closed') AND tokens > 0 AND entry_ts < ? AND entry_ts > ? LIMIT 200`),
  dueExit: db.prepare(`SELECT id, mint, exit_ts, tokens, events FROM paper_trades WHERE exit_fill_n IS NULL AND status = 'closed' AND exit_ts < ? AND exit_ts > ? LIMIT 200`),
  real: db.prepare(`SELECT sol, tok FROM trades WHERE mint = ? AND is_buy = ? AND ts BETWEEN ? AND ? AND sol BETWEEN ? AND ? AND tok > 0`),
  setEntry: db.prepare(`UPDATE paper_trades SET fill_n = ?, fill_real_pct = ? WHERE id = ?`),
  setExit: db.prepare(`UPDATE paper_trades SET exit_fill_n = ?, exit_real_pct = ? WHERE id = ?`),
  agg: db.prepare(`SELECT book, status, exit_reason, pnl_pct, stop_pct, trigger_pct, fill_n, fill_real_pct, exit_fill_n, exit_real_pct, entry_slip_pct, entry_ts, exit_ts, signal_ts, gap, restored
    FROM paper_trades WHERE cfg = ? AND status IN ('open','closed')`),
  aggAll: db.prepare(`SELECT book, status, exit_reason, pnl_pct, stop_pct, trigger_pct, fill_n, fill_real_pct, exit_fill_n, exit_real_pct, entry_slip_pct, entry_ts, exit_ts, signal_ts, gap, restored
    FROM paper_trades WHERE status IN ('open','closed') AND entry_ts > ?`),
};
const median = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const q = (a, p) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };

/** Audit fills that are old enough for the tape to be flushed (trade rows are written in 5 s batches). */
export function auditFills() {
  const now = Date.now(), fee = P.feePct / 100;
  let n = 0;
  for (const r of Q.dueEntry.all(now - 20000, now - 2 * 86400000)) {
    const paperPx = r.size_sol / r.tokens;
    const real = Q.real.all(r.mint, 1, r.entry_ts - WIN_MS, r.entry_ts + WIN_MS, r.size_sol * SIZE_LO, r.size_sol * SIZE_HI).map((x) => (x.sol * (1 + fee)) / x.tok);
    Q.setEntry.run(real.length, real.length ? (paperPx / median(real) - 1) * 100 : null, r.id); n++;
  }
  for (const r of Q.dueExit.all(now - 20000, now - 2 * 86400000)) {
    let ev = []; try { ev = JSON.parse(r.events || '[]'); } catch { /* ignore */ }
    const sold = ev.filter((e) => e.type === 'tp1' || e.type === 'exit').reduce((s, e) => s + (e.sol || 0), 0);
    if (!(sold > 0) || !(r.tokens > 0)) { Q.setExit.run(0, null, r.id); continue; }
    const paperPx = sold / r.tokens, ts = (ev.find((e) => e.type === 'tp1') || ev.find((e) => e.type === 'exit'))?.t || r.exit_ts;
    const real = Q.real.all(r.mint, 0, ts - WIN_MS, ts + WIN_MS, 0.0001, 1e9).filter((x) => x.sol > 0).map((x) => (x.sol * (1 - fee)) / x.tok);
    Q.setExit.run(real.length, real.length ? (paperPx / median(real) - 1) * 100 : null, r.id); n++;
  }
  return n;
}

/** Aggregate for the Health tab. scope: 'test' = current fingerprint, else last 14 days. */
export function fillsView({ scope = 'test' } = {}) {
  const rows = scope === 'test' ? Q.agg.all(CFG) : Q.aggAll.all(Date.now() - 14 * 86400000);
  const ent = rows.filter((r) => r.fill_n > 0).map((r) => r.fill_real_pct);
  const ext = rows.filter((r) => r.exit_fill_n > 0).map((r) => r.exit_real_pct);
  const audited = rows.filter((r) => r.fill_n != null).length;
  const stops = rows.filter((r) => r.status === 'closed' && /^stop/.test(r.exit_reason || '') && r.pnl_pct != null);
  const over = stops.map((r) => -(r.stop_pct || P.stopPct) - r.pnl_pct); // pts past the stop (positive = worse)
  const trigToFill = stops.filter((r) => r.trigger_pct != null).map((r) => r.trigger_pct - r.pnl_pct);
  const delay = rows.filter((r) => r.signal_ts).map((r) => (r.entry_ts - r.signal_ts) / 1000);
  const slip = rows.map((r) => r.entry_slip_pct);
  const hist = (vals, edges) => edges.slice(0, -1).map((e, i) => ({ lo: e, hi: edges[i + 1], n: vals.filter((v) => v >= e && v < edges[i + 1]).length }));
  const byBook = {};
  for (const r of rows) { const b = (byBook[r.book] ||= { entries: [], exits: [], over: [] }); if (r.fill_n > 0) b.entries.push(r.fill_real_pct); if (r.exit_fill_n > 0) b.exits.push(r.exit_real_pct); if (r.status === 'closed' && /^stop/.test(r.exit_reason || '')) b.over.push(-(r.stop_pct || P.stopPct) - r.pnl_pct); }
  const med = median(ent), extMed = median(ext);
  // what the cost model should be, from the evidence
  let advice = 'Not enough audited fills yet (needs 10+ entries with comparable real trades).';
  if (ent.length >= 10) {
    if (med < -1) advice = `Paper entries were ${Math.abs(med).toFixed(1)}% cheaper than real buyers: the model is optimistic. Raise PAPER_EXTRA_SLIPPAGE_PCT from ${P.extraSlippagePct} to about ${(P.extraSlippagePct + Math.abs(med)).toFixed(1)} and re-check the kill rule.`;
    else if (med > 3) advice = `Paper entries paid ${med.toFixed(1)}% more than real buyers: the model is conservative. Leave it (conservative is safe) or lower PAPER_EXTRA_SLIPPAGE_PCT slightly.`;
    else advice = `Paper entries are within ${med >= 0 ? '+' : ''}${med.toFixed(1)}% of real buyers in the same seconds: the cost model is about right.`;
  }
  return {
    scope, cfg: CFG, rows: rows.length, audited,
    entry: { n: ent.length, coveragePct: audited ? (ent.length / audited) * 100 : null, medianPct: med, p25: q(ent, 0.25), p75: q(ent, 0.75), hist: hist(ent, [-20, -10, -5, -2, 0, 2, 5, 10, 20]) },
    exit: { n: ext.length, medianPct: extMed, p25: q(ext, 0.25), p75: q(ext, 0.75) },
    stops: { n: stops.length, medianPts: median(over), p90Pts: q(over, 0.9), triggerToFillPts: median(trigToFill), hist: hist(over, [-5, 0, 2.5, 5, 10, 20, 40, 100]) },
    entryDelay: { medianSec: median(delay), slipMedianPct: median(slip), slipP90Pct: q(slip, 0.9) },
    byBook: Object.fromEntries(Object.entries(byBook).map(([b, v]) => [b, { entryN: v.entries.length, entryMedianPct: median(v.entries), exitN: v.exits.length, exitMedianPct: median(v.exits), stopN: v.over.length, stopOverMedianPts: median(v.over) }])),
    integrity: { gap: rows.filter((r) => r.gap).length, restored: rows.filter((r) => r.restored).length,
      voided: db.prepare(`SELECT COUNT(*) n FROM paper_trades WHERE status='void' AND entry_ts > ?`).get(Date.now() - 14 * 86400000).n },
    model: { feePct: P.feePct, extraSlippagePct: P.extraSlippagePct, entryDelaySec: P.entryDelaySec, exitDelaySec: P.exitDelaySec, windowSec: WIN_MS / 1000, sizeBand: [SIZE_LO, SIZE_HI] },
    advice,
  };
}
export const startFillAudit = () => setInterval(() => { try { auditFills(); } catch (e) { log.warn('fill audit failed', e.message); } }, 30000);
