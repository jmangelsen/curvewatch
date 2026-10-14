// Smart-wallet tracker.
//   1. Scores every wallet position when its token is labeled (1 h): return = (SOL from sells + tokens still held at
//      the label price) / SOL spent - 1. A "hit" is a return >= +profitPct (default +50%).
//   2. Ranks wallets with >= minPositions scored positions and a hit rate above minRate (default 65%) by the Wilson
//      95% lower bound of that rate (so 3 of 3 does not outrank 40 of 50), drops spray bots, keeps the top N (15).
//   3. Records every trade those wallets make, live, and keeps their open positions marked to the curve.
// Until enough wallets have scored positions, the list is filled from the older peak-based record (wallets table:
// a "win" there means the token peaked at 3x+ after their early buy or graduated). Those rows are labeled "proxy".
import { db } from '../db.js';
import { config } from '../config.js';
import { logger } from '../log.js';
const log = logger('tracker');
const T = () => config.smartTracker;

db.exec(`
CREATE TABLE IF NOT EXISTS wallet_perf (
  wallet TEXT PRIMARY KEY, positions INTEGER DEFAULT 0, hits INTEGER DEFAULT 0, profitable INTEGER DEFAULT 0, touched INTEGER DEFAULT 0,
  sum_ret REAL DEFAULT 0, buy_sol REAL DEFAULT 0, pnl_sol REAL DEFAULT 0, first_seen INTEGER, last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS wallet_positions (
  wallet TEXT, mint TEXT, symbol TEXT, first_at INTEGER, entry_mcap REAL, buy_sol REAL, sell_sol REAL, held_tok REAL,
  label_mcap REAL, ret REAL, hit INTEGER, touched INTEGER, graduated INTEGER, scored_at INTEGER, PRIMARY KEY (wallet, mint)
);
CREATE INDEX IF NOT EXISTS idx_wpos_wallet ON wallet_positions(wallet, first_at);
CREATE TABLE IF NOT EXISTS smart_trades (
  ts INTEGER, wallet TEXT, mint TEXT, symbol TEXT, is_buy INTEGER, sol REAL, tok REAL, mcap REAL, sig TEXT, rank INTEGER, basis TEXT
);
CREATE INDEX IF NOT EXISTS idx_strades_ts ON smart_trades(ts);
CREATE INDEX IF NOT EXISTS idx_strades_wallet ON smart_trades(wallet, ts);
`);
const Q = {
  upPerf: db.prepare(`INSERT INTO wallet_perf (wallet, positions, hits, profitable, touched, sum_ret, buy_sol, pnl_sol, first_seen, last_seen)
    VALUES (@w, 1, @hit, @prof, @touch, @ret, @b, @pnl, @t, @t)
    ON CONFLICT(wallet) DO UPDATE SET positions = positions + 1, hits = hits + @hit, profitable = profitable + @prof, touched = touched + @touch,
      sum_ret = sum_ret + @ret, buy_sol = buy_sol + @b, pnl_sol = pnl_sol + @pnl, last_seen = @t`),
  insPos: db.prepare(`INSERT OR REPLACE INTO wallet_positions VALUES (@w, @mint, @sym, @at, @m, @b, @s, @held, @lm, @ret, @hit, @touch, @grad, @t)`),
  insTrade: db.prepare(`INSERT INTO smart_trades VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
  prune: db.prepare(`DELETE FROM smart_trades WHERE ts < ?`),
  prunePos: db.prepare(`DELETE FROM wallet_positions WHERE scored_at < ?`),
  pruneEmpty: db.prepare(`DELETE FROM wallet_perf WHERE last_seen < ? AND positions < 3`),
};

let tracked = new Map(); // wallet -> row
let pool = new Set(); // wallets with 3+ scored positions: their individual positions are stored
let lastRefresh = 0, startedAt = null;
const live = []; // recent tracked trades, newest last
let engineRef = null;

/** Wilson score lower bound (95%). */
export function wilsonLo(k, n, z = 1.96) {
  if (!n) return 0;
  const p = k / n, d = 1 + (z * z) / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
}

/** Score every wallet position on a token at its 1 h label. */
export const scorePositions = (t) => {
  if (!t.pos?.size) return;
  const C = T(), price = t.mcap / 1e9, now = Date.now(); // mcap in SOL for a 1e9 supply -> SOL per token
  const batch = [];
  for (const [w, p] of t.pos) {
    if (p.b < C.minBuySol) continue;
    const held = Math.max(0, p.bt - p.st);
    const value = p.s + held * price;
    const ret = value / p.b - 1;
    const peakAfter = t.peakAt >= p.at ? t.peakMcap : p.m;
    batch.push({ w, mint: t.mint, sym: t.symbol || null, at: p.at, m: p.m, b: p.b, s: p.s, held, lm: t.mcap, ret, hit: ret * 100 >= C.profitPct ? 1 : 0,
      prof: ret > 0 ? 1 : 0, touch: peakAfter / p.m >= 1 + C.profitPct / 100 ? 1 : 0, pnl: value - p.b, grad: t.graduated ? 1 : 0, t: now });
  }
  if (!batch.length) return;
  db.transaction(() => { for (const r of batch) { Q.upPerf.run(r); if (pool.has(r.w) || tracked.has(r.w)) Q.insPos.run(r); } })();
};

export function refreshTracked() {
  const C = T(), now = Date.now();
  const days = (r) => Math.max(1, (now - r.first_seen) / 86400000);
  const real = db.prepare(`SELECT * FROM wallet_perf WHERE positions >= ? AND CAST(hits AS REAL) / positions > ?`).all(C.minPositions, C.minRate)
    .filter((r) => r.positions / days(r) <= C.maxPositionsPerDay)
    .map((r) => ({ wallet: r.wallet, basis: 'realized', n: r.positions, k: r.hits, rate: r.hits / r.positions, lo: wilsonLo(r.hits, r.positions), avgRet: r.sum_ret / r.positions, pnlSol: r.pnl_sol, buySol: r.buy_sol,
      touchRate: r.touched / r.positions, firstSeen: r.first_seen, lastSeen: r.last_seen }));
  real.sort((a, b) => b.lo - a.lo || b.n - a.n);
  let list = real.slice(0, C.topN);
  if (list.length < C.topN) {
    const have = new Set(list.map((r) => r.wallet));
    const proxy = db.prepare(`SELECT wallet, early_buys, wins, graduations, first_seen, last_seen FROM wallets WHERE early_buys >= 5 AND CAST(wins AS REAL) / early_buys > ?`).all(C.minRate)
      .filter((r) => !have.has(r.wallet) && r.early_buys / days(r) <= C.maxPositionsPerDay)
      .map((r) => ({ wallet: r.wallet, basis: 'proxy', n: r.early_buys, k: r.wins, rate: r.wins / r.early_buys, lo: wilsonLo(r.wins, r.early_buys), graduations: r.graduations, firstSeen: r.first_seen, lastSeen: r.last_seen }))
      .sort((a, b) => b.lo - a.lo || b.n - a.n);
    list = [...list, ...proxy.slice(0, C.topN - list.length)];
  }
  // attach live realized stats to proxy rows when available
  const perf = db.prepare('SELECT * FROM wallet_perf WHERE wallet = ?');
  list.forEach((r, i) => { r.rank = i + 1; if (r.basis === 'proxy') { const p = perf.get(r.wallet); if (p) { r.realN = p.positions; r.realHits = p.hits; r.avgRet = p.positions ? p.sum_ret / p.positions : null; r.pnlSol = p.pnl_sol; } } });
  tracked = new Map(list.map((r) => [r.wallet, r]));
  pool = new Set(db.prepare('SELECT wallet FROM wallet_perf WHERE positions >= 3 ORDER BY positions DESC LIMIT 50000').all().map((r) => r.wallet));
  lastRefresh = now;
  log.info(`tracked wallets: ${list.length} (${list.filter((r) => r.basis === 'realized').length} realized, ${list.filter((r) => r.basis === 'proxy').length} proxy) · candidates ${real.length} · pool ${pool.size}`);
}

export const isTracked = (w) => !!w && tracked.has(w);
export function onTrackedTrade(ev, t) {
  const r = tracked.get(ev.wallet); if (!r) return;
  const at = ev.recvAt || Date.now();
  const row = { ts: at, wallet: ev.wallet, mint: ev.mint, symbol: t?.symbol || null, is_buy: ev.isBuy ? 1 : 0, sol: ev.sol, tok: ev.tok, mcap: t?.mcap ?? null, sig: ev.sig || null, rank: r.rank, basis: r.basis };
  try { Q.insTrade.run(row.ts, row.wallet, row.mint, row.symbol, row.is_buy, row.sol, row.tok, row.mcap, row.sig, row.rank, row.basis); } catch (e) { log.warn('insert', e.message); }
  live.push(row); if (live.length > 500) live.shift();
}

export function startTracker({ engine }) {
  engineRef = engine; startedAt = Date.now();
  const k = db.prepare("SELECT v FROM kv WHERE k = 'tracker_started'").get();
  if (!k) db.prepare("INSERT INTO kv (k, v) VALUES ('tracker_started', ?)").run(String(startedAt)); else startedAt = Number(k.v);
  refreshTracked();
  setInterval(() => { try { refreshTracked(); } catch (e) { log.warn('refresh', e.message); } }, T().refreshMin * 60000);
  setInterval(() => { const n = Date.now(); Q.prune.run(n - 30 * 86400000); Q.prunePos.run(n - 30 * 86400000); Q.pruneEmpty.run(n - 7 * 86400000); }, 3600000);
}

/** Open positions of tracked wallets on tokens still in memory, marked to the current curve price. */
function openPositions() {
  const out = [];
  for (const t of engineRef?.tokens?.values?.() || []) {
    if (!t.pos?.size || t.finalized) continue;
    for (const [w, p] of t.pos) { const r = tracked.get(w); if (!r) continue;
      const held = Math.max(0, p.bt - p.st); if (held <= 1 && p.s === 0) continue;
      const value = p.s + held * (t.mcap / 1e9);
      out.push({ wallet: w, rank: r.rank, mint: t.mint, symbol: t.symbol, first_at: p.at, entry_mcap: p.m, mcap: t.mcap, buy_sol: p.b, sell_sol: p.s, ret: (value / p.b - 1) * 100, holding: held > 1 });
    }
  }
  return out.sort((a, b) => b.first_at - a.first_at);
}

export function trackerView() {
  const C = T(), list = [...tracked.values()];
  const recent = db.prepare('SELECT * FROM smart_trades ORDER BY ts DESC LIMIT 200').all();
  const day = db.prepare('SELECT COUNT(*) n, SUM(is_buy) buys, COUNT(DISTINCT mint) tokens FROM smart_trades WHERE ts > ?').get(Date.now() - 86400000);
  const scored = db.prepare('SELECT COUNT(*) wallets, SUM(positions) positions, SUM(positions >= ?) eligible FROM wallet_perf').get(C.minPositions);
  return { config: C, startedAt, lastRefresh, wallets: list, recent, open: openPositions(), day, scored,
    counts: { tracked: list.length, realized: list.filter((r) => r.basis === 'realized').length, proxy: list.filter((r) => r.basis === 'proxy').length } };
}

export function walletDetail(w) {
  const r = tracked.get(w) || null;
  const perf = db.prepare('SELECT * FROM wallet_perf WHERE wallet = ?').get(w) || null;
  const old = db.prepare('SELECT * FROM wallets WHERE wallet = ?').get(w) || null;
  const positions = db.prepare('SELECT * FROM wallet_positions WHERE wallet = ? ORDER BY first_at DESC LIMIT 300').all(w);
  const trades = db.prepare('SELECT * FROM smart_trades WHERE wallet = ? ORDER BY ts DESC LIMIT 300').all(w);
  return { wallet: w, tracked: r, perf, proxy: old, positions, trades, open: openPositions().filter((p) => p.wallet === w) };
}
