// On-chain holder counts for graduated tokens.
//
// Why a separate module: on the bonding curve Curvewatch already counts holders from the trade tape it sees (token.js,
// `holders` feature). After migration the trades happen on PumpSwap and the DexScreener feed carries no holder count, so
// the only way to know how many wallets hold a graduate is to ask the chain. Plain RPC cannot do it cheaply
// (getProgramAccounts on the token program is refused by public endpoints); the Helius DAS method `getTokenAccounts`
// pages through all accounts of a mint at 1,000 per page, which is enough to answer "at least 2,500 holders?" in three
// requests. Without HELIUS_API_KEY the module is inert and every holder count is null, never zero.
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';

const log = logger('holders');
const H = config.holders;

try { db.exec('ALTER TABLE grad_snapshots ADD COLUMN holders INTEGER'); } catch { /* already there */ }
db.exec(`CREATE TABLE IF NOT EXISTS holder_counts (mint TEXT PRIMARY KEY, holders INTEGER, capped INTEGER DEFAULT 0, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS holder_history (mint TEXT NOT NULL, ts INTEGER NOT NULL, holders INTEGER, PRIMARY KEY (mint, ts))`);
const Q = {
  get: db.prepare('SELECT holders, capped, ts FROM holder_counts WHERE mint = ?'),
  put: db.prepare('INSERT INTO holder_counts (mint, holders, capped, ts) VALUES (?, ?, ?, ?) ON CONFLICT(mint) DO UPDATE SET holders = excluded.holders, capped = excluded.capped, ts = excluded.ts'),
  hist: db.prepare('SELECT ts, holders FROM holder_history WHERE mint = ? ORDER BY ts'),
  histIns: db.prepare('INSERT INTO holder_history (mint, ts, holders) VALUES (?, ?, ?)'),
};

export const holdersEnabled = () => Boolean(H.apiKey);

/** Count token accounts with a non-zero balance for a mint. Returns { holders, capped } or null on failure. */
export async function countHolders(mint, { maxPages = H.maxPages } = {}) {
  if (!holdersEnabled()) return null;
  let total = 0, page = 1, capped = 0;
  for (; page <= maxPages; page++) {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${H.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 'cw', method: 'getTokenAccounts', params: { mint, limit: 1000, page, options: { showZeroBalance: false } } }),
    }).then((x) => x.json());
    if (r.error) throw new Error(r.error.message || JSON.stringify(r.error));
    const n = r.result?.token_accounts?.length || 0;
    total += n;
    if (n < 1000) break;
    if (page === maxPages) capped = 1;
  }
  return { holders: total, capped };
}

/** Cached read: the last count for a mint, with its age, or null if never counted (or the module is off). */
export function holdersOf(mint) {
  const r = Q.get.get(mint);
  return r ? { holders: r.holders, capped: Boolean(r.capped), ts: r.ts, ageMin: (Date.now() - r.ts) / 60000 } : null;
}
export const holderHistory = (mint) => Q.hist.all(mint);

/** Growth over the last `windowMin` minutes from the stored history, or null. */
export function holderGrowth(mint, windowMin = 60) {
  const h = Q.hist.all(mint); if (h.length < 2) return null;
  const last = h[h.length - 1], cutoff = last.ts - windowMin * 60000;
  const base = [...h].reverse().find((x) => x.ts <= cutoff) || h[0];
  if (!base.holders) return null;
  return { from: base.holders, to: last.holders, deltaPct: ((last.holders - base.holders) / base.holders) * 100, minutes: (last.ts - base.ts) / 60000 };
}

/**
 * Poller: every tick, refresh the graduates that matter most (runner-band and candidate lists supplied by `pick()`),
 * oldest count first, within a request budget. Also stamps the latest grad_snapshots row so the label pipeline keeps it.
 */
export class HolderPoller {
  constructor({ pick, grads }) { this.pick = pick; this.grads = grads; this.timer = null; this.busy = false; this.calls = 0; this.errors = 0; this.lastErr = null; }
  start() { if (!holdersEnabled()) { log.info('off (no HELIUS_API_KEY): graduate holder counts stay unknown'); return; } this.timer = setInterval(() => this.tick(), H.tickMs); setTimeout(() => this.tick(), 15000); log.info(`on · up to ${H.perTick} mints per ${H.tickMs / 1000}s tick, refresh after ${H.staleMin} min`); }
  stop() { clearInterval(this.timer); }
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      const now = Date.now();
      const wanted = this.pick().filter((m) => { const c = Q.get.get(m); return !c || now - c.ts > H.staleMin * 60000; })
        .sort((a, b) => (Q.get.get(a)?.ts || 0) - (Q.get.get(b)?.ts || 0)).slice(0, H.perTick);
      for (const mint of wanted) {
        try {
          const r = await countHolders(mint); this.calls++;
          if (!r) continue;
          Q.put.run(mint, r.holders, r.capped, Date.now()); Q.histIns.run(mint, Date.now(), r.holders);
          const st = this.grads?.watch?.get(mint); if (st) { st.holders = r.holders; st.holdersCapped = Boolean(r.capped); st.holdersAt = Date.now(); }
          db.prepare('UPDATE grad_snapshots SET holders = ? WHERE id = (SELECT id FROM grad_snapshots WHERE mint = ? ORDER BY ts DESC LIMIT 1)').run(r.holders, mint);
        } catch (e) { this.errors++; this.lastErr = e.message; if (this.errors % 10 === 1) log.warn(`${mint.slice(0, 8)}: ${e.message}`); if (/401|403|api key/i.test(e.message)) break; }
        await new Promise((res) => setTimeout(res, H.paceMs));
      }
    } finally { this.busy = false; }
  }
  status() { return { enabled: holdersEnabled(), calls: this.calls, errors: this.errors, lastErr: this.lastErr, counted: db.prepare('SELECT COUNT(*) n FROM holder_counts').get().n }; }
}
