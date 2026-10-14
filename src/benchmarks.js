// Benchmarks: does each strategy beat something, and what?
//  1. vs Random: the control book bought random eligible tokens at the same moments. Beating zero is not enough.
//  2. Same-token pairs: books that traded the same token, compared on just those tokens. Isolates the effect of
//     entry timing / exits from token selection.
//  3. Selection lift: does an alert pick tokens that graduate or double more often than the base rate?
//  4. External base rates for graduates (Belphor migration outcomes) vs what this machine observed.
import { db } from './db.js';
import { config } from './config.js';
import { BOOKS, STRATEGIES, closedCurrent, diffCI } from './engine/paper.js';
import { CFG } from './version.js';

const BELPHOR = { url: 'https://www.belphor.com/data/migration-outcomes', n: 11303, fellTo20Pct: 93, reached50Pct: 14, reached200Pct: 4.1, liq60kReached50Pct: 23 };
let cache = { at: 0, data: null };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const wilson = (k, n, z = 1.96) => { if (!n) return [null, null]; const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return [((c - m) / d) * 100, ((c + m) / d) * 100]; };

export function benchmarks() {
  if (Date.now() - cache.at < 60000) return cache.data;
  const rows = closedCurrent().filter((r) => !r.gated);
  const by = (b) => rows.filter((r) => (r.book || 'main') === b);
  const rnd = by('random').map((r) => r.pnl_pct);
  const minN = 30;
  // 1. vs random
  const vsRandom = BOOKS.filter((b) => b !== 'random').map((b) => {
    const p = by(b).map((r) => r.pnl_pct), d = diffCI(p, rnd);
    let verdict = 'COLLECTING';
    if (p.length >= minN && rnd.length >= minN) verdict = d.lo > 0 ? 'BEATS RANDOM' : d.hi < 0 ? 'WORSE THAN RANDOM' : 'NO DIFFERENCE';
    return { book: b, label: STRATEGIES[b].label, n: p.length, avgPct: mean(p), winRatePct: p.length ? (p.filter((x) => x > 0).length / p.length) * 100 : null, ...d, verdict };
  });
  const random = { n: rnd.length, avgPct: mean(rnd), winRatePct: rnd.length ? (rnd.filter((x) => x > 0).length / rnd.length) * 100 : null, needed: minN };
  // 2. same-token pairs vs main
  const main = new Map(by('main').map((r) => [r.mint, r.pnl_pct]));
  const pairs = BOOKS.filter((b) => !['main', 'random'].includes(b)).map((b) => {
    const d = by(b).filter((r) => main.has(r.mint)).map((r) => r.pnl_pct - main.get(r.mint));
    const m = mean(d), sd = d.length > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1)) : null, se = sd != null ? sd / Math.sqrt(d.length) : null;
    return { book: b, label: STRATEGIES[b].label, shared: d.length, diffPts: m, lo: se != null ? m - 1.96 * se : null, hi: se != null ? m + 1.96 * se : null };
  });
  // 3. selection lift (last 7 days, gap-flagged labels excluded)
  const since = Date.now() - 7 * 86400000;
  const base = db.prepare(`SELECT COUNT(*) n, SUM(graduated) g, SUM(peak_mcap_1h >= 2 * initial_mcap) x2 FROM tokens WHERE finalized=1 AND created_at > ? AND COALESCE(gap,0)=0`).get(since);
  const al = db.prepare(`SELECT COUNT(*) n, SUM(graduated) g, SUM(max_multiple >= 2) x2 FROM alerts WHERE finalized=1 AND ts > ? AND COALESCE(gap,0)=0`).get(since);
  const snap = db.prepare(`SELECT COUNT(*) n, SUM(max_mcap_after >= 2 * mcap) x2 FROM snapshots WHERE checkpoint = 120 AND reject IS NULL AND max_mcap_after IS NOT NULL AND ts > ? AND COALESCE(gap,0)=0`).get(since);
  const rate = (k, n) => (n ? (k / n) * 100 : null);
  const lift = {
    window: '7 days', alertScore: config.scoring.alertScore,
    graduation: { base: rate(base.g, base.n), baseN: base.n, alert: rate(al.g, al.n), alertN: al.n, alertCI: wilson(al.g || 0, al.n), lift: base.n && al.n && base.g ? rate(al.g, al.n) / rate(base.g, base.n) : null },
    double: { base: rate(snap.x2, snap.n), baseN: snap.n, baseLabel: 'unrejected tokens at 2 min', alert: rate(al.x2, al.n), alertN: al.n, alertCI: wilson(al.x2 || 0, al.n), lift: snap.n && al.n && snap.x2 ? rate(al.x2, al.n) / rate(snap.x2, snap.n) : null },
  };
  // 4. graduates vs external base rate
  const gw = db.prepare(`SELECT w.mint, w.mig_price mp, w.peak_price pk, (SELECT price FROM grad_snapshots s WHERE s.mint = w.mint ORDER BY ts DESC LIMIT 1) last,
    (SELECT MAX(ts) - MIN(ts) FROM grad_snapshots s WHERE s.mint = w.mint) span FROM grad_watch w WHERE w.mig_price > 0`).all();
  const tracked = gw.filter((r) => r.span >= 6 * 3600000);
  const ours = {
    n: tracked.length, minHours: 6,
    reached50Pct: rate(tracked.filter((r) => r.pk >= 1.5 * r.mp).length, tracked.length),
    reached200Pct: rate(tracked.filter((r) => r.pk >= 3 * r.mp).length, tracked.length),
    fellTo20Pct: rate(tracked.filter((r) => r.last != null && r.last <= 0.2 * r.mp).length, tracked.length),
    allWatched: gw.length,
  };
  const data = { generatedAt: Date.now(), cfg: CFG, random, vsRandom, pairs, lift, grads: { ours, belphor: BELPHOR } };
  cache = { at: Date.now(), data };
  return data;
}
