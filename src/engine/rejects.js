// Rejects bucket. A coin that fails any hard filter once is rejected for good ("sticky"): no alerts, no paper
// entries in any book, no tracked-wallet trades recorded, no Edge Lab samples after that moment.
//   kind 'curve' = new Pump.fun launch on the bonding curve (engine/score.js hard rejects)
//   kind 'grad'  = graduated coin on PumpSwap (engine/graduates.js rejects; the post-migration warm-up is not a reject)
import { db, q } from '../db.js';
import { logger } from '../log.js';
const log = logger('rejects');

db.exec(`
CREATE TABLE IF NOT EXISTS rejects (
  kind TEXT NOT NULL, mint TEXT NOT NULL, symbol TEXT, first_ts INTEGER NOT NULL, reason TEXT, cat TEXT,
  age_sec REAL, mcap REAL, mcap_usd REAL, price REAL, checkpoint INTEGER, score_raw REAL, PRIMARY KEY (kind, mint)
);
CREATE INDEX IF NOT EXISTS idx_rejects_ts ON rejects(kind, first_ts);
CREATE INDEX IF NOT EXISTS idx_rejects_cat ON rejects(kind, cat, first_ts);
`);

/** Reason text -> stable category. */
export function categoryOf(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('non-sol')) return 'non-SOL quote';
  if (r.includes('mayhem')) return 'mayhem mode';
  if (r.includes('serial')) return 'serial launcher';
  if (r.includes('creator sold')) return 'creator sold';
  if (r.includes('bundled')) return 'bundled launch';
  if (r.includes('top-10')) return 'top-10 concentration';
  if (r.includes('from peak')) return 'drawdown from peak';
  if (r.includes('late')) return 'late on curve';
  if (r.includes('wash')) return 'wash trading';
  if (r.includes('collapsed')) return 'collapsed vs migration';
  if (r.includes('no trades')) return 'no trades (5 min)';
  if (r.includes('thin pool')) return 'thin pool';
  if (r.includes('liquidity')) return 'low liquidity';
  return 'other';
}

const ins = db.prepare(`INSERT OR IGNORE INTO rejects (kind, mint, symbol, first_ts, reason, cat, age_sec, mcap, mcap_usd, price, checkpoint, score_raw)
  VALUES (@kind, @mint, @symbol, @ts, @reason, @cat, @age, @mcap, @mcapUsd, @price, @checkpoint, @raw)`);
const gradSet = new Set(); // graduated coins are watched for hours; keep the full rejected set in memory
let counters = { curve: 0, grad: 0, blocked: { alert: 0, entry: 0, fill: 0, grad: 0, tracker: 0 } };

/** Record the first rejection of a coin. Returns true the first time. */
export function recordReject({ kind, mint, symbol = null, ts = Date.now(), reason, age = null, mcap = null, mcapUsd = null, price = null, checkpoint = null, raw = null }) {
  try {
    const r = ins.run({ kind, mint, symbol, ts, reason, cat: categoryOf(reason), age, mcap, mcapUsd, price, checkpoint, raw });
    if (kind === 'grad') gradSet.add(mint);
    if (r.changes) { counters[kind]++; return true; }
  } catch (e) { log.warn('record', e.message); }
  return false;
}
export const isGradRejected = (mint) => gradSet.has(mint);
export const countBlocked = (what) => { counters.blocked[what] = (counters.blocked[what] || 0) + 1; };
export const rejectCounters = () => counters;

/** One-time backfill from recorded snapshots, then load the graduate set. */
export function initRejects() {
  const done = q.getKv.get('rejects_backfill_v1');
  if (!done) {
    const t0 = Date.now();
    const curve = db.prepare(`SELECT s.mint, MIN(s.ts) ts, s.reject reason, s.checkpoint, s.mcap, s.score, t.symbol, t.created_at
      FROM snapshots s LEFT JOIN tokens t ON t.mint = s.mint WHERE s.reject IS NOT NULL GROUP BY s.mint`).all();
    let grad = [];
    try {
      grad = db.prepare(`SELECT g.mint, MIN(g.ts) ts, g.reject reason, g.mcap, g.price, w.symbol
        FROM grad_snapshots g LEFT JOIN tokens w ON w.mint = g.mint WHERE g.reject IS NOT NULL AND g.reject NOT LIKE 'warming%' GROUP BY g.mint`).all();
    } catch { /* graduates table not created yet */ }
    db.transaction(() => {
      for (const r of curve) ins.run({ kind: 'curve', mint: r.mint, symbol: r.symbol, ts: r.ts, reason: r.reason, cat: categoryOf(r.reason), age: r.created_at ? (r.ts - r.created_at) / 1000 : r.checkpoint, mcap: r.mcap, mcapUsd: null, price: null, checkpoint: r.checkpoint, raw: null });
      for (const r of grad) ins.run({ kind: 'grad', mint: r.mint, symbol: r.symbol, ts: r.ts, reason: r.reason, cat: categoryOf(r.reason), age: null, mcap: null, mcapUsd: r.mcap, price: r.price, checkpoint: null, raw: null });
    })();
    q.setKv.run('rejects_backfill_v1', String(Date.now()));
    log.info(`backfilled ${curve.length} curve and ${grad.length} graduate rejects in ${Date.now() - t0} ms`);
  }
  for (const r of db.prepare("SELECT mint FROM rejects WHERE kind = 'grad'").iterate()) gradSet.add(r.mint);
  log.info(`rejects ready · ${gradSet.size} graduates in the bucket`);
}

// ---------------- views ----------------
const H = 3600000, D = 24 * H;
/** Outcome after rejection. Curve: max mcap after the rejecting snapshot (snapshots.max_mcap_after). Grad: 6 h high after the rejecting poll. */
const curveRows = db.prepare(`SELECT r.*, t.name, t.graduated, t.peak_mcap_1h, s.max_mcap_after, s.min_before_max
  FROM rejects r LEFT JOIN tokens t ON t.mint = r.mint LEFT JOIN snapshots s ON s.mint = r.mint AND s.checkpoint = r.checkpoint
  WHERE r.kind = 'curve' AND r.first_ts > ? AND (? IS NULL OR r.cat = ?) ORDER BY r.first_ts DESC LIMIT ?`);
const gradRows = () => {
  try { return db.prepare(`SELECT r.*, g.max_6h, g.min_6h, g.price_6h, g.liq FROM rejects r LEFT JOIN grad_snapshots g ON g.mint = r.mint AND g.ts = r.first_ts
    WHERE r.kind = 'grad' AND r.first_ts > ? AND (? IS NULL OR r.cat = ?) ORDER BY r.first_ts DESC LIMIT ?`); } catch { return null; }
};
let gradStmt = null;
const shape = (r) => {
  if (r.kind === 'curve') {
    const after = r.max_mcap_after && r.mcap ? r.max_mcap_after / r.mcap : null;
    return { ...r, afterX: after, labeled: r.max_mcap_after != null, missed: after != null && after >= 2 };
  }
  const after = r.max_6h && r.price ? r.max_6h / r.price : null;
  return { ...r, afterX: after, labeled: r.max_6h != null, missed: after != null && after >= 2 };
};
export function rejectRows(kind, { sinceMs = Date.now() - D, cat = null, limit = 500 } = {}) {
  if (kind === 'grad') { gradStmt = gradStmt || gradRows(); return gradStmt ? gradStmt.all(sinceMs, cat, cat, limit).map(shape) : []; }
  return curveRows.all(sinceMs, cat, cat, limit).map(shape);
}

const byCat = db.prepare('SELECT cat, COUNT(*) n FROM rejects WHERE kind = ? AND first_ts > ? GROUP BY cat ORDER BY n DESC');
const countSince = db.prepare('SELECT COUNT(*) n FROM rejects WHERE kind = ? AND first_ts > ?');
const launches = db.prepare('SELECT COUNT(*) n FROM tokens WHERE created_at > ?');
const gradsSeen = () => { try { return db.prepare('SELECT COUNT(DISTINCT mint) n FROM grad_snapshots WHERE ts > ?'); } catch { return null; } };
let gradsStmt = null;
const missedCurve = db.prepare(`SELECT r.cat, COUNT(*) n, SUM(s.max_mcap_after >= 2 * r.mcap) x2, SUM(t.graduated) grads FROM rejects r
  JOIN snapshots s ON s.mint = r.mint AND s.checkpoint = r.checkpoint LEFT JOIN tokens t ON t.mint = r.mint
  WHERE r.kind = 'curve' AND r.first_ts > ? AND s.max_mcap_after IS NOT NULL GROUP BY r.cat`);
const missedGrad = () => { try { return db.prepare(`SELECT r.cat, COUNT(*) n, SUM(g.max_6h >= 2 * r.price) x2 FROM rejects r JOIN grad_snapshots g ON g.mint = r.mint AND g.ts = r.first_ts
  WHERE r.kind = 'grad' AND r.first_ts > ? AND g.max_6h IS NOT NULL GROUP BY r.cat`); } catch { return null; } };
let missedGradStmt = null;
const blockedSkips = db.prepare("SELECT book, COUNT(*) n FROM paper_trades WHERE status = 'skipped' AND skip_reason LIKE 'rejected%' AND entry_ts > ? GROUP BY book");

export function rejectsView({ windowH = 24 } = {}) {
  const since = Date.now() - windowH * H, hour = Date.now() - H;
  gradsStmt = gradsStmt || gradsSeen(); missedGradStmt = missedGradStmt || missedGrad();
  const mc = missedCurve.all(since), mg = missedGradStmt ? missedGradStmt.all(since) : [];
  const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  let blocked = []; try { blocked = blockedSkips.all(since); } catch { /* table name differs */ }
  return {
    windowH,
    curve: { n: countSince.get('curve', since).n, hour: countSince.get('curve', hour).n, launches: launches.get(since).n, byCat: byCat.all('curve', since),
      outcome: { labeled: sum(mc, 'n'), x2: sum(mc, 'x2'), grads: sum(mc, 'grads'), byCat: mc } },
    grad: { n: countSince.get('grad', since).n, hour: countSince.get('grad', hour).n, seen: gradsStmt ? gradsStmt.get(since).n : null, byCat: byCat.all('grad', since),
      outcome: { labeled: sum(mg, 'n'), x2: sum(mg, 'x2'), byCat: mg } },
    blocked: { live: counters.blocked, skips: blocked },
    recent: { curve: rejectRows('curve', { sinceMs: since, limit: 60 }), grad: rejectRows('grad', { sinceMs: since, limit: 60 }) },
  };
}
