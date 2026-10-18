// Gap backfill: recover Pump.fun graduations that happened while the collector was down.
//
// Every PumpSwap migration transaction references the Pump.fun migration account and carries the token mint as
// the only `pump`-suffixed account key. So a downtime window can be recovered with one getSignaturesForAddress
// page (1000 signatures, ~2 days of migrations) plus one getTransaction per migration, paced for public RPC.
//
// Recovered mints join the graduates watchlist with source 'backfill' and the migration time as pairCreatedAt,
// so the Runner board and the graduates tracker see the same eligible set they would have seen without the gap.
// What is NOT recovered: the bonding-curve trades, launch rows and snapshots during the gap (those stay flagged
// as gap-affected), and the token's mint time when the launch itself was missed (age then counts from migration).
import { config } from '../config.js';
import { db, q } from '../db.js';
import { logger } from '../log.js';

const log = logger('backfill');
const MIGRATION_ACCOUNT = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';
const B = {
  enabled: (process.env.BACKFILL_ENABLED ?? '1') !== '0',
  // Rotated on 429/5xx. publicnode sustains a few requests per second; api.mainnet-beta allows about one per 2 s.
  httpUrls: (process.env.RPC_HTTP_URLS || process.env.RPC_HTTP_URL || 'https://solana-rpc.publicnode.com,https://api.mainnet-beta.solana.com').split(',').map((x) => x.trim()).filter(Boolean),
  paceMs: Number(process.env.BACKFILL_PACE_MS || 500),
  maxWindowMs: Number(process.env.BACKFILL_MAX_HOURS || 12) * 3600000, // the Runner window is 2–8 h since mint; older graduates add polling cost, not signal
  minGapMs: Number(process.env.BACKFILL_MIN_GAP_SEC || 90) * 1000,
};
let urlIdx = 0;

export const backfillState = { running: false, queued: 0, runs: 0, lastRun: null, totals: { migrations: 0, added: 0, known: 0, failed: 0 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasWatch = db.prepare('SELECT 1 FROM grad_watch WHERE mint = ? LIMIT 1');
const tokenRow = db.prepare('SELECT graduated, symbol, name FROM tokens WHERE mint = ?');

async function rpc(method, params, attempt = 0) {
  const url = B.httpUrls[urlIdx % B.httpUrls.length];
  let r;
  try { r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) }); }
  catch (e) { r = { status: 599, statusText: e.message }; }
  if (r.status === 429 || r.status >= 500 || r.status === 403) {
    if (attempt >= 6) throw new Error(`rpc ${method}: HTTP ${r.status} after ${attempt} retries`);
    urlIdx++; // try the next endpoint first; back off only once every endpoint has refused in this round
    if ((attempt + 1) % B.httpUrls.length === 0) { const wait = Math.min(60000, 3000 * 2 ** Math.floor(attempt / B.httpUrls.length)); log.warn(`rpc ${r.status} on all endpoints, backing off ${wait / 1000}s`); await sleep(wait); }
    return rpc(method, params, attempt + 1);
  }
  const j = await r.json();
  if (j.error) throw new Error(`rpc ${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

/** Signatures of migration transactions with blockTime in [since, until] (ms). Pages backwards from newest. */
export async function migrationSignatures(since, until) {
  const out = []; let before;
  for (let page = 0; page < 20; page++) {
    const sigs = await rpc('getSignaturesForAddress', [MIGRATION_ACCOUNT, { limit: 1000, ...(before ? { before } : {}) }]);
    if (!sigs?.length) break;
    for (const s of sigs) {
      const t = (s.blockTime || 0) * 1000;
      if (s.err || !t) continue;
      if (t > until) continue;
      if (t < since) return out;
      out.push({ sig: s.signature, ts: t });
    }
    before = sigs[sigs.length - 1].signature;
    await sleep(B.paceMs);
  }
  return out;
}

/** The mint of a migration transaction: the single account key ending in `pump`, or null. */
export function mintFromTx(tx) {
  if (!tx) return null;
  const keys = tx.transaction?.message?.accountKeys || [];
  const la = tx.meta?.loadedAddresses || {};
  const all = [...keys.map((k) => (typeof k === 'string' ? k : k.pubkey)), ...(la.writable || []), ...(la.readonly || [])];
  const pump = all.filter((k) => typeof k === 'string' && k.endsWith('pump'));
  return pump.length === 1 ? pump[0] : null;
}

/**
 * Recover graduations in [since, until]. `grads` is the Graduates instance; `engine` optional (marks live tokens).
 * Serialised: overlapping requests run one after another (they share the pacing budget).
 */
let chain = Promise.resolve();
export function backfillGap(since, until, { grads, engine, reason = 'gap', gapId = null } = {}) {
  if (!B.enabled || !grads) return chain;
  if (gapId != null) q.setKv.run(`backfill_gap:${gapId}`, String(Date.now()));
  const span = until - since;
  if (span < B.minGapMs) return chain;
  const from = Math.max(since - 60000, until - B.maxWindowMs); // 60 s of slack before the gap; cap the window
  backfillState.queued++;
  chain = chain.then(() => run(from, until, { grads, engine, reason, gapId })).catch((e) => log.warn('backfill failed', e.message)).finally(() => { backfillState.queued--; });
  return chain;
}

async function run(since, until, { grads, engine, reason, gapId }) {
  backfillState.running = true;
  const t0 = Date.now(), res = { reason, since, until, migrations: 0, added: 0, known: 0, failed: 0, ms: 0 };
  try {
    const sigs = await migrationSignatures(since, until);
    res.migrations = sigs.length;
    log.info(`${reason}: ${sigs.length} migrations in the ${((until - since) / 3600000).toFixed(1)} h window, fetching (~${Math.round((sigs.length * B.paceMs) / 1000)} s)`);
    for (const s of sigs) {
      try {
        const tx = await rpc('getTransaction', [s.sig, { encoding: 'json', maxSupportedTransactionVersion: 255 }]);
        const mint = mintFromTx(tx);
        if (!mint) { res.failed++; continue; }
        const tok = tokenRow.get(mint);
        if (tok && !tok.graduated) q.markGraduated.run(s.ts, mint);
        const live = engine?.getToken?.(mint);
        if (live && !live.graduated) { live.graduated = true; live.graduatedAt = s.ts; }
        if (hasWatch.get(mint) || grads.watch.has(mint)) { res.known++; continue; }
        grads.add(mint, 'backfill', { symbol: tok?.symbol, name: tok?.name, pairCreatedAt: s.ts, addedAt: s.ts });
        res.added++;
      } catch (e) { res.failed++; if (res.failed <= 3) log.warn(`tx ${s.sig.slice(0, 12)}: ${e.message}`); }
      await sleep(B.paceMs);
    }
  } finally {
    res.ms = Date.now() - t0; backfillState.running = false; backfillState.runs++; backfillState.lastRun = res;
    for (const k of ['migrations', 'added', 'known', 'failed']) backfillState.totals[k] += res[k];
    q.setKv.run('backfill_last', JSON.stringify(res));
    if (gapId != null) q.setKv.run(`backfill_gap:${gapId}`, JSON.stringify(res));
    log.info(`${reason}: recovered ${res.added} graduates (${res.known} already watched, ${res.failed} unreadable) in ${(res.ms / 1000).toFixed(0)} s`);
  }
  return res;
}

/** On startup: backfill every closed gap of the last 48 h inside the backfill window (default 12 h) that has not been backfilled yet (one kv marker per gap). */
export function backfillPendingGaps({ grads, engine }) {
  if (!B.enabled) return;
  const rows = db.prepare('SELECT id, start, end FROM gaps WHERE end IS NOT NULL AND end > ? ORDER BY id').all(Date.now() - B.maxWindowMs);
  let n = 0;
  for (const g of rows) {
    if (g.end - g.start < B.minGapMs) continue;
    const k = `backfill_gap:${g.id}`;
    if (q.getKv.get(k)) continue;
    backfillGap(g.start, g.end, { grads, engine, gapId: g.id, reason: `gap #${g.id} (${((g.end - g.start) / 3600000).toFixed(1)} h)` });
    n++;
  }
  if (n) log.info(`${n} unbackfilled gap(s) queued from the backfill window`);
}

/** Per-gap backfill outcome for the Health view: null = not attempted, { pending: true } = queued/running, else the result. */
export function backfillOf(gapId) {
  const v = q.getKv.get(`backfill_gap:${gapId}`)?.v; if (!v) return null;
  if (!v.startsWith('{')) return { pending: true };
  try { return JSON.parse(v); } catch { return null; }
}
