// Post-graduation tracker: watches Pump.fun tokens after they migrate to PumpSwap and scores
// the survivors for a second leg ("re-ignition"). Discovery only; nothing here trades.
//
// Base rates this module has to beat (Belphor, 11,303 migrations, Aug-Oct 2026):
//   93% later traded at <= 20% of the migration price, 14% reached +50%, 4.1% reached +200%.
// So the design deliberately ignores the migration moment itself (BOOST buybacks and the dump
// happen in the first minutes) and only scores tokens that survived at least GRAD_MIN_AGE_MIN.
//
// Data: DexScreener tokens/v1 (30 mints per request), polled in one batched pass every GRAD_POLL_SEC.
// Every poll is a point in a per-token time series; features are computed from that series plus
// DexScreener's own 5m/1h/6h windows. Snapshots are stored and labeled 1h and 6h later so the score
// can be calibrated on your own data, and alerts feed a separate paper trader + kill rule.
import { recordReject, isGradRejected, countBlocked } from './rejects.js';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { db } from '../db.js';
import { killStatsFrom } from './paper.js';
import { notify } from './telegram.js';
import { round } from '../util.js';
import { logger } from '../log.js';

const log = logger('grads');
const G = config.grads, GP = config.gradPaper;
const WSOL = 'So11111111111111111111111111111111111111112';
const MIN = 60000, HOUR = 3600000;

db.exec(`
CREATE TABLE IF NOT EXISTS grad_watch (
  mint TEXT PRIMARY KEY, symbol TEXT, name TEXT, source TEXT, added_at INTEGER, pair TEXT, dex TEXT,
  pair_created_at INTEGER, mig_price REAL, mig_mcap REAL, peak_price REAL, active INTEGER DEFAULT 1, dropped_reason TEXT
);
CREATE TABLE IF NOT EXISTS grad_snapshots (
  mint TEXT NOT NULL, ts INTEGER NOT NULL, price REAL, mcap REAL, liq REAL, score REAL, reject TEXT, features TEXT,
  max_1h REAL, min_1h REAL, max_6h REAL, min_6h REAL, price_6h REAL, mbm_6h REAL, labeled INTEGER DEFAULT 0,
  PRIMARY KEY (mint, ts)
);
CREATE INDEX IF NOT EXISTS idx_gsnap_ts ON grad_snapshots(ts);
CREATE TABLE IF NOT EXISTS grad_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mint TEXT NOT NULL, symbol TEXT, name TEXT, ts INTEGER NOT NULL, score REAL,
  price REAL, mcap REAL, liq REAL, age_min REAL, vs_mig REAL, reasons TEXT, flags TEXT, features TEXT,
  max_1h REAL, max_6h REAL, min_before_max_6h REAL, price_6h REAL, finalized INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_galerts_ts ON grad_alerts(ts);
CREATE TABLE IF NOT EXISTS grad_paper (
  id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id INTEGER, mint TEXT, symbol TEXT, status TEXT,
  entry_ts INTEGER, entry_price REAL, entry_mcap REAL, size_sol REAL, units REAL, units_left REAL, realized_sol REAL DEFAULT 0,
  peak_value REAL, exit_ts INTEGER, exit_reason TEXT, exit_price REAL, pnl_sol REAL, pnl_pct REAL, events TEXT
);
`);

try { db.exec('ALTER TABLE grad_snapshots ADD COLUMN mbm_6h REAL'); } catch { /* already there */ }
try { db.exec("ALTER TABLE grad_paper ADD COLUMN book TEXT DEFAULT 'fixed'"); } catch { /* already there */ }
try { db.exec('ALTER TABLE grad_watch ADD COLUMN extended INTEGER DEFAULT 0'); } catch { /* already there */ }

const Q = {
  upsertWatch: db.prepare(`INSERT INTO grad_watch (mint,symbol,name,source,added_at,active) VALUES (@mint,@symbol,@name,@source,@addedAt,1)
    ON CONFLICT(mint) DO UPDATE SET active=1, dropped_reason=NULL`),
  updateWatch: db.prepare(`UPDATE grad_watch SET symbol=@symbol, name=@name, pair=@pair, dex=@dex, pair_created_at=@pairCreatedAt,
    mig_price=@migPrice, mig_mcap=@migMcap, peak_price=@peakPrice WHERE mint=@mint`),
  dropWatch: db.prepare(`UPDATE grad_watch SET active=0, dropped_reason=? WHERE mint=?`),
  activeWatch: db.prepare(`SELECT * FROM grad_watch WHERE active=1 AND added_at > ?`),
  insertSnap: db.prepare(`INSERT OR IGNORE INTO grad_snapshots (mint,ts,price,mcap,liq,score,reject,features) VALUES (@mint,@ts,@price,@mcap,@liq,@score,@reject,@features)`),
  dueSnaps: db.prepare(`SELECT mint, ts, price FROM grad_snapshots WHERE labeled=0 AND ts <= ? LIMIT 2000`),
  labelSnap: db.prepare(`UPDATE grad_snapshots SET max_1h=@max1, min_1h=@min1, max_6h=@max6, min_6h=@min6, price_6h=@p6, mbm_6h=@mbm, labeled=1 WHERE mint=@mint AND ts=@ts`),
  insertAlert: db.prepare(`INSERT INTO grad_alerts (mint,symbol,name,ts,score,price,mcap,liq,age_min,vs_mig,reasons,flags,features)
    VALUES (@mint,@symbol,@name,@ts,@score,@price,@mcap,@liq,@ageMin,@vsMig,@reasons,@flags,@features)`),
  updateAlert1h: db.prepare(`UPDATE grad_alerts SET max_1h=? WHERE id=?`),
  finalizeAlert: db.prepare(`UPDATE grad_alerts SET max_1h=COALESCE(max_1h,@max1), max_6h=@max6, min_before_max_6h=@mbm, price_6h=@p6, finalized=1 WHERE id=@id`),
  openAlerts: db.prepare(`SELECT * FROM grad_alerts WHERE finalized=0`),
  recentAlerts: db.prepare(`SELECT * FROM grad_alerts ORDER BY ts DESC LIMIT ?`),
  insertPaper: db.prepare(`INSERT INTO grad_paper (alert_id,mint,symbol,status,entry_ts,entry_price,entry_mcap,size_sol,units,units_left,peak_value,events,book)
    VALUES (@alertId,@mint,@symbol,'open',@entryTs,@entryPrice,@entryMcap,@sizeSol,@units,@units,@sizeSol,@events,@book)`),
  markExtended: db.prepare(`UPDATE grad_watch SET extended=1 WHERE mint=?`),
  updatePaper: db.prepare(`UPDATE grad_paper SET status=@status, units_left=@unitsLeft, realized_sol=@realized, peak_value=@peak, exit_ts=@exitTs,
    exit_reason=@exitReason, exit_price=@exitPrice, pnl_sol=@pnlSol, pnl_pct=@pnlPct, events=@events WHERE id=@id`),
  openPapers: db.prepare(`SELECT * FROM grad_paper WHERE status='open'`),
  closedPapersAsc: db.prepare(`SELECT * FROM grad_paper WHERE status='closed' AND COALESCE(book,'fixed')=? ORDER BY exit_ts ASC`),
  bookCounts: db.prepare(`SELECT COALESCE(book,'fixed') book, COUNT(*) n, SUM(status='open') open, SUM(status='closed') closed, SUM(CASE WHEN status='closed' THEN pnl_sol END) pnl FROM grad_paper GROUP BY book`),
  exitMix: db.prepare(`SELECT exit_reason reason, COUNT(*) n, AVG(pnl_pct) avg_pct, AVG((exit_ts-entry_ts)/60000.0) held_min FROM grad_paper WHERE status='closed' AND COALESCE(book,'fixed')=? GROUP BY exit_reason ORDER BY n DESC`),
  allPapers: db.prepare(`SELECT * FROM grad_paper ORDER BY id DESC LIMIT ?`),
  calib: db.prepare(`SELECT score, reject, price, max_6h, min_6h, price_6h FROM grad_snapshots WHERE labeled=1 AND max_6h IS NOT NULL AND ts > ?`),
  counts: db.prepare(`SELECT (SELECT COUNT(*) FROM grad_snapshots) snaps, (SELECT COUNT(*) FROM grad_snapshots WHERE labeled=1) labeled,
    (SELECT COUNT(*) FROM grad_alerts WHERE ts > ?) alerts24h, (SELECT COUNT(*) FROM grad_watch) everWatched`),
};

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const short = (s, n = 26) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

export class Graduates extends EventEmitter {
  constructor() {
    super();
    this.watch = new Map(); // mint -> state
    this.solUsd = null;
    this.counters = { polls: 0, requests: 0, failures: 0, alerts: 0, added: 0, dropped: 0, seeded: 0, lastPollMs: 0, lastPollAt: 0 };
    this.open = new Map(); // mint -> paper position
    this.pending = [];
    this.paperEvents = [];
    this.polling = false;
  }

  // ---- watchlist ----
  restore() {
    for (const r of Q.activeWatch.all(Date.now() - G.extMaxAgeHours * HOUR)) {
      const st = this.blank(r.mint, { symbol: r.symbol, name: r.name, source: r.source, addedAt: r.added_at, migPrice: r.mig_price, migMcap: r.mig_mcap, peakPrice: r.peak_price, pairCreatedAt: r.pair_created_at }); st.extended = !!r.extended; this.watch.set(r.mint, st);
    }
    // Restored paper positions are marked at the next poll (DexScreener prices are stateless, so this is honest).
    for (const r of Q.openPapers.all()) this.open.set(`${r.book || 'fixed'}:${r.mint}`, { id: r.id, book: r.book || 'fixed', alertId: r.alert_id, mint: r.mint, symbol: r.symbol, entryTs: r.entry_ts, entryPrice: r.entry_price, entryMcap: r.entry_mcap, sizeSol: r.size_sol, units: r.units, unitsLeft: r.units_left, realized: r.realized_sol || 0, peak: r.peak_value || r.size_sol, tp1Done: r.units_left < r.units - 1e-12, events: JSON.parse(r.events || '[]') });
    log.info(`restored ${this.watch.size} watched graduates, ${this.open.size} open paper positions`);
  }
  blank(mint, o = {}) {
    return { mint, symbol: o.symbol || null, name: o.name || null, source: o.source || 'migration', addedAt: o.addedAt || Date.now(), series: [],
      migPrice: o.migPrice ?? null, migMcap: o.migMcap ?? null, peakPrice: o.peakPrice ?? null, pairCreatedAt: o.pairCreatedAt ?? null,
      misses: 0, deadPolls: 0, last: null, score: null, reject: null, parts: {}, reasons: [], flags: [], features: null,
      lastSnapAt: 0, lastAlertAt: 0, alertId: null, info: null, creatorRugger: false };
  }
  add(mint, source = 'migration', meta = {}) {
    if (!G.enabled || !mint || this.watch.has(mint)) return;
    if (this.watch.size >= G.maxWatch) this.evict();
    const st = this.blank(mint, { ...meta, source });
    this.watch.set(mint, st);
    Q.upsertWatch.run({ mint, symbol: meta.symbol || null, name: meta.name || null, source, addedAt: st.addedAt });
    this.counters.added++;
  }
  evict() {
    // Drop the weakest (lowest liquidity) seeded or dead-looking token to make room.
    let worst = null;
    for (const s of this.watch.values()) { const l = s.last?.liq ?? 0; if (!worst || l < (worst.last?.liq ?? 0)) worst = s; }
    if (worst) this.drop(worst.mint, 'evicted (watchlist full)');
  }
  drop(mint, reason) {
    this.watch.delete(mint); Q.dropWatch.run(reason, mint); this.counters.dropped++;
  }

  async seed() {
    if (!G.seedFromDex) return;
    const urls = ['token-profiles/latest/v1', 'token-boosts/latest/v1', 'token-boosts/top/v1', 'community-takeovers/latest/v1'];
    let added = 0;
    for (const u of urls) {
      try {
        const r = await fetch(`https://api.dexscreener.com/${u}`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) continue;
        for (const x of (await r.json()) || []) {
          const mint = x.tokenAddress;
          if (x.chainId !== 'solana' || !mint?.endsWith('pump') || this.watch.has(mint)) continue;
          this.add(mint, u.startsWith('community') ? 'dex-cto' : u.includes('boost') ? 'dex-boost' : 'dex-profile'); added++;
        }
      } catch (e) { log.warn(`seed ${u} failed`, e.message); }
    }
    this.counters.seeded += added;
    if (added) log.info(`seeded ${added} Pump.fun tokens from DexScreener lists`);
  }

  // ---- polling ----
  async poll() {
    if (this.polling || !this.watch.size) return;
    this.polling = true; const t0 = Date.now();
    try {
      const mints = [...this.watch.keys()];
      for (let i = 0; i < mints.length; i += 30) {
        const chunk = mints.slice(i, i + 30);
        let pairs = [];
        try {
          this.counters.requests++;
          const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`, { signal: AbortSignal.timeout(12000) });
          if (r.status === 429) { log.warn('DexScreener rate limit; backing off this pass'); this.counters.failures++; break; }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          pairs = (await r.json()) || [];
        } catch (e) { this.counters.failures++; log.warn('dex poll failed', e.message); continue; }
        const best = new Map();
        for (const p of pairs) {
          if (p.quoteToken?.address === WSOL && Number(p.priceNative) > 0 && Number(p.priceUsd) > 0) this.solUsd = Number(p.priceUsd) / Number(p.priceNative);
          const m = p.baseToken?.address; if (!m || !this.watch.has(m)) continue;
          if (p.dexId === 'pumpfun') continue; // still on the bonding curve: not a graduate (re-added on migration)
          const cur = best.get(m);
          // Prefer the PumpSwap pool; otherwise the deepest pool.
          const rank = (x) => (x.dexId === 'pumpswap' ? 1e12 : 0) + (x.liquidity?.usd || 0);
          if (!cur || rank(p) > rank(cur)) best.set(m, p);
        }
        const now = Date.now();
        for (const m of chunk) {
          const st = this.watch.get(m); if (!st) continue;
          const p = best.get(m);
          if (!p) { if (++st.misses >= 5) this.drop(m, 'no post-graduation pool'); continue; }
          st.misses = 0;
          this.ingest(st, p, now);
        }
        if (i + 30 < mints.length) await new Promise((r) => setTimeout(r, 250)); // stay polite: ~4 req/s max
      }
      this.counters.polls++;
      this.paperTick();
    } finally {
      this.counters.lastPollMs = Date.now() - t0; this.counters.lastPollAt = Date.now(); this.polling = false;
    }
  }

  ingest(st, p, now) {
    const price = Number(p.priceUsd);
    if (!(price > 0)) return;
    const pt = { t: now, price, liq: p.liquidity?.usd || 0, mcap: p.marketCap || p.fdv || 0, fdv: p.fdv || 0,
      v5: p.volume?.m5 || 0, v1h: p.volume?.h1 || 0, v6h: p.volume?.h6 || 0, v24: p.volume?.h24 || 0,
      b5: p.txns?.m5?.buys || 0, s5: p.txns?.m5?.sells || 0, b1h: p.txns?.h1?.buys || 0, s1h: p.txns?.h1?.sells || 0,
      c5: p.priceChange?.m5 ?? null, c1h: p.priceChange?.h1 ?? null, c6h: p.priceChange?.h6 ?? null, c24: p.priceChange?.h24 ?? null };
    st.symbol = p.baseToken?.symbol || st.symbol; st.name = p.baseToken?.name || st.name;
    st.pair = p.pairAddress; st.dex = p.dexId; st.url = p.url; st.quote = p.quoteToken?.symbol;
    st.pairCreatedAt = p.pairCreatedAt || st.pairCreatedAt;
    st.info = { socials: (p.info?.socials || []).map((s) => ({ type: s.type, url: s.url })), websites: (p.info?.websites || []).map((w) => w.url), image: p.info?.imageUrl || null, boosts: p.boosts?.active || 0 };
    // Migration reference price: first reading within 15 min of pool creation. Seeded/late tokens fall back to
    // their 6h/24h change so "vs migration" stays a rough-but-honest anchor (flagged as estimated).
    if (st.migPrice == null && st.pairCreatedAt) {
      if (now - st.pairCreatedAt <= 15 * MIN) { st.migPrice = price; st.migMcap = pt.mcap; st.migEstimated = false; }
      else if (pt.c24 != null && now - st.pairCreatedAt <= 24 * HOUR) { st.migPrice = price / (1 + pt.c24 / 100); st.migMcap = pt.mcap / (1 + pt.c24 / 100); st.migEstimated = true; }
    }
    st.peakPrice = Math.max(st.peakPrice || 0, price);
    st.series.push(pt);
    const cut = now - 6 * HOUR; while (st.series.length && st.series[0].t < cut) st.series.shift();
    st.last = pt;
    if (st.series.length === 1 || st.series.length % 10 === 0) Q.updateWatch.run({ mint: st.mint, symbol: st.symbol, name: st.name, pair: st.pair, dex: st.dex, pairCreatedAt: st.pairCreatedAt, migPrice: st.migPrice, migMcap: st.migMcap, peakPrice: st.peakPrice });

    const ageMin = st.pairCreatedAt ? (now - st.pairCreatedAt) / MIN : (now - st.addedAt) / MIN;
    if (ageMin > G.maxAgeHours * 60) {
      // Past the base window a graduate is kept only while it is alive: holding its migration price, with a real pool and
      // real volume, or carrying an open paper position. Everything else ages out as before; a hard ceiling bounds the list.
      if (ageMin > G.extMaxAgeHours * 60) return this.drop(st.mint, `aged out (${G.extMaxAgeHours / 24}-day ceiling)`);
      if (!this.alive(st, pt)) return this.drop(st.mint, st.extended ? 'aged out (no longer alive)' : 'aged out');
      if (!st.extended) { st.extended = true; Q.markExtended.run(st.mint); log.info(`GRAD KEEP ${st.symbol}: alive past ${G.maxAgeHours} h, watching on`); }
    }
    if (pt.liq < G.deadLiqUsd) { if (++st.deadPolls >= 3) return this.drop(st.mint, `liquidity under $${G.deadLiqUsd}`); } else st.deadPolls = 0;

    this.score(st, ageMin);
    if (now - st.lastSnapAt >= G.snapshotEveryMin * MIN && ageMin >= G.minAgeMin) {
      st.lastSnapAt = now;
      Q.insertSnap.run({ mint: st.mint, ts: now, price, mcap: pt.mcap, liq: pt.liq, score: st.score, reject: st.reject, features: JSON.stringify(st.features) });
    }
    this.maybeAlert(st, now);
  }

  /** Alive past the base window: open paper position, or price holding vs migration (or half its peak), with liquidity and volume. */
  alive(st, pt) {
    if (this.hasOpen(st.mint)) return true;
    if (!(pt.liq >= G.minLiqUsd) || !(pt.v24 >= G.aliveVol24Usd)) return false;
    if (st.migPrice) return pt.price >= st.migPrice * G.aliveVsMig;
    return st.peakPrice ? pt.price >= st.peakPrice * 0.5 : false;
  }

  // ---- features + score ----
  window(st, fromMin, toMin) {
    const now = st.last.t;
    return st.series.filter((p) => p.t >= now - fromMin * MIN && p.t <= now - toMin * MIN);
  }
  score(st, ageMin) {
    const L = st.last;
    const tx5 = L.b5 + L.s5, tx1h = L.b1h + L.s1h;
    const volAccel = L.v1h > 0 ? L.v5 / (L.v1h / 12) : 0; // >1 means the last 5 min run hotter than the hour's average
    const txAccel = tx1h > 0 ? tx5 / (tx1h / 12) : 0;
    const buyRatio5 = tx5 ? L.b5 / tx5 : 0.5;
    const buyRatio1h = tx1h ? L.b1h / tx1h : 0.5;
    const vsMig = st.migPrice ? L.price / st.migPrice : null;
    const fromPeak = st.peakPrice ? L.price / st.peakPrice : null;
    const fdvLiq = L.liq > 0 ? L.fdv / L.liq : null;
    // Structure from our own series (needs ~40 min of polls) with DexScreener windows as fallback.
    const early = this.window(st, 90, 30), recent = this.window(st, 30, 0), base = this.window(st, 60, 10);
    const lowEarly = early.length >= 5 ? Math.min(...early.map((p) => p.price)) : null;
    const lowRecent = recent.length >= 5 ? Math.min(...recent.map((p) => p.price)) : null;
    const higherLow = lowEarly && lowRecent ? lowRecent > lowEarly * 1.03 : null;
    const baseHi = base.length >= 8 ? Math.max(...base.map((p) => p.price)) : null;
    const baseLo = base.length >= 8 ? Math.min(...base.map((p) => p.price)) : null;
    const baseRangePct = baseHi && baseLo ? (baseHi / baseLo - 1) * 100 : null;
    const breakout = baseHi ? L.price > baseHi * 1.02 : null;
    const liq30 = this.window(st, 35, 25)[0]?.liq;
    const liqTrend = liq30 ? L.liq / liq30 : null;
    const socials = st.info?.socials?.length || 0, hasSite = (st.info?.websites?.length || 0) > 0, boosts = st.info?.boosts || 0;
    const hasProfile = !!st.info?.image || socials > 0 || hasSite;
    const f = { ageMin, priceUsd: L.price, mcapUsd: L.mcap, liqUsd: L.liq, fdvLiq, vol5: L.v5, vol1h: L.v1h, vol24: L.v24, tx5, tx1h,
      volAccel, txAccel, buyRatio5, buyRatio1h, c5: L.c5, c1h: L.c1h, c6h: L.c6h, c24: L.c24, vsMig, migEstimated: !!st.migEstimated,
      fromPeak, higherLow, breakout, baseRangePct, liqTrend, socials, hasSite, hasProfile, boosts, seriesPts: st.series.length, solUsd: this.solUsd };
    st.features = f;

    let reject = null;
    if (ageMin < G.minAgeMin) reject = `warming up (< ${G.minAgeMin} min since migration)`;
    else if (L.liq < G.minLiqUsd) reject = `liquidity $${round(L.liq / 1000, 1)}k < $${round(G.minLiqUsd / 1000, 0)}k`;
    else if (vsMig != null && vsMig <= G.collapsedFrac) reject = `collapsed to ${round(vsMig * 100, 0)}% of migration price`;
    else if (tx5 === 0 && L.v5 === 0) reject = 'no trades in last 5 min';
    else if (fdvLiq != null && fdvLiq > 40) reject = `thin pool (FDV ${round(fdvLiq, 0)}× liquidity)`;
    st.reject = reject;
    if (reject && !reject.startsWith('warming') && !isGradRejected(st.mint)) {
      recordReject({ kind: 'grad', mint: st.mint, symbol: st.symbol, ts: Date.now(), reason: reject, age: ageMin * 60, mcapUsd: L.mcap, price: L.price });
    }

    const parts = {};
    parts.volume = 20 * clamp(Math.log2(Math.max(volAccel, 1e-3)) / 2); // 4x the hourly pace = full marks
    parts.activity = 10 * clamp(Math.log2(Math.max(txAccel, 1e-3)) / 2);
    parts.pressure = tx5 >= 15 ? 15 * clamp((buyRatio5 - 0.5) / 0.2) : tx5 >= 5 ? 7 * clamp((buyRatio5 - 0.5) / 0.2) : 0;
    parts.structure = (higherLow === true ? 8 : 0) + (breakout === true ? 8 : 0) + (baseRangePct != null && baseRangePct < 25 && breakout ? 4 : 0);
    parts.liquidity = 10 * clamp(Math.log10(Math.max(L.liq, 1) / G.minLiqUsd) / Math.log10(10)) + (liqTrend != null ? 5 * clamp((liqTrend - 1) / 0.25) : 0);
    parts.survival = (ageMin >= 60 ? 4 : ageMin >= 30 ? 2 : 0) + (vsMig != null ? 6 * clamp((vsMig - 0.35) / 0.65) : 2);
    parts.social = (hasProfile ? 4 : 0) + Math.min(3, socials) + (hasSite ? 1 : 0) + (boosts ? 2 : 0);
    // Penalties: chasing an already-vertical move, distribution, and paid attention without organic demand.
    if (L.c1h != null && L.c1h > 150) parts.chasing = -15; else if (L.c1h != null && L.c1h > 80) parts.chasing = -7;
    if (tx5 >= 15 && buyRatio5 < 0.42) parts.distribution = -10;
    if (boosts && volAccel < 1) parts.paidNoDemand = -5;
    if (fdvLiq != null && fdvLiq > 20) parts.thin = -6;
    const total = clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100);
    st.parts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 1)]));
    st.score = round(total, 1);

    const reasons = [], flags = [];
    if (volAccel >= 2) reasons.push(`volume ${round(volAccel, 1)}× hourly pace`);
    if (tx5 >= 15 && buyRatio5 >= 0.6) reasons.push(`${round(buyRatio5 * 100, 0)}% buys (5m, ${tx5} tx)`);
    if (breakout) reasons.push(baseRangePct != null && baseRangePct < 25 ? `breakout from ${round(baseRangePct, 0)}% base` : 'breaking 1h high');
    if (higherLow) reasons.push('higher low');
    if (liqTrend != null && liqTrend > 1.1) reasons.push(`liquidity +${round((liqTrend - 1) * 100, 0)}% / 30m`);
    if (vsMig != null && vsMig >= 1) reasons.push(`${round(vsMig, 2)}× migration price`);
    if (parts.chasing) flags.push(`already +${round(L.c1h, 0)}% in 1h`);
    if (parts.distribution) flags.push(`sellers dominate (${round(buyRatio5 * 100, 0)}% buys)`);
    if (boosts) flags.push(`paid DexScreener boost (${boosts})`);
    if (fdvLiq != null && fdvLiq > 20) flags.push(`FDV ${round(fdvLiq, 0)}× liquidity`);
    if (st.migEstimated) flags.push('migration price estimated');
    if (fromPeak != null && fromPeak < 0.5) flags.push(`${round((1 - fromPeak) * 100, 0)}% below tracked peak`);
    st.reasons = reasons; st.flags = flags;
  }

  maybeAlert(st, now) {
    if (st.reject || st.score == null || st.score < G.alertScore) return;
    if (isGradRejected(st.mint)) { if (!st._blockedAlert) { st._blockedAlert = true; countBlocked('grad'); } return; } // sticky: once rejected, never alert or trade
    if (now - st.lastAlertAt < G.alertCooldownMin * MIN) return;
    if ((st.features?.seriesPts || 0) < 5) return; // need a few polls of our own before trusting the read
    st.lastAlertAt = now;
    const f = st.features;
    const row = { mint: st.mint, symbol: st.symbol, name: st.name, ts: now, score: st.score, price: f.priceUsd, mcap: f.mcapUsd, liq: f.liqUsd,
      ageMin: f.ageMin, vsMig: f.vsMig, reasons: JSON.stringify(st.reasons), flags: JSON.stringify(st.flags), features: JSON.stringify(f) };
    const id = Number(Q.insertAlert.run(row).lastInsertRowid);
    st.alertId = id; this.counters.alerts++;
    const a = { id, ...row, reasons: st.reasons, flags: st.flags, kind: 'grad' };
    this.emit('alert', a);
    log.info(`GRAD ALERT ${st.symbol} score ${st.score} mcap $${round(f.mcapUsd / 1000, 1)}k liq $${round(f.liqUsd / 1000, 1)}k · ${st.reasons.join(' · ')}`);
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    notify([
      `<b>RE-IGNITION · ${esc(st.symbol)}</b> · score ${round(st.score, 0)}`,
      `${esc(short(st.name, 40))} · ${round(f.ageMin / 60, 1)}h since migration`,
      `Mcap $${round(f.mcapUsd / 1000, 1)}k · liquidity $${round(f.liqUsd / 1000, 1)}k${f.vsMig ? ` · ${round(f.vsMig, 2)}× migration` : ''}`,
      st.reasons.length ? `Why: ${esc(st.reasons.join(' · '))}` : '',
      st.flags.length ? `Flags: ${esc(st.flags.join(' · '))}` : '',
      `<a href="https://dexscreener.com/solana/${st.mint}">DexScreener</a> · <code>${st.mint}</code>`,
      'Discovery only. Base rate after migration is poor; size accordingly.',
    ].filter(Boolean).join('\n'), 'alert');
    if (GP.enabled && !this.hasOpen(st.mint)) this.pending.push({ mint: st.mint, alertId: id, at: now + 1 }); // enter at the NEXT poll's price
  }

  // ---- paper trading (price from the next poll after the alert; AMM impact from pool depth) ----
  impactPct(liqUsd) {
    const sizeUsd = GP.sizeSol * (this.solUsd || 150);
    const quoteSide = Math.max(1, liqUsd / 2);
    return (sizeUsd / (quoteSide + sizeUsd)) * 100; // constant-product price impact for a buy of this size
  }
  valueSol(pos, st, units = pos.unitsLeft) {
    if (!st?.last || units <= 0) return 0;
    const gross = units * st.last.price; // USD
    const sizeUsd = gross; const impact = sizeUsd / (Math.max(1, st.last.liq / 2) + sizeUsd);
    const net = gross * (1 - impact) * (1 - GP.feePct / 100) * (1 - GP.extraSlippagePct / 100);
    return net / (this.solUsd || 150);
  }
  books() { return GP.trailEnabled ? ['fixed', 'trail'] : ['fixed']; }
  hasOpen(mint) { for (const k of this.open.keys()) if (k.endsWith(':' + mint)) return true; return false; }
  paperTick() {
    const now = Date.now();
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i]; const st = this.watch.get(e.mint);
      this.pending.splice(i, 1);
      if (!st?.last || st.last.t < e.at) { if (st) this.pending.push({ ...e }); continue; }
      if (st.reject || isGradRejected(e.mint)) { countBlocked('grad'); log.info(`GRAD SKIP ${st.symbol}: rejected before entry (${st.reject || 'rejects bucket'})`); continue; }
      const fill = st.last.price * (1 + this.impactPct(st.last.liq) / 100) * (1 + GP.extraSlippagePct / 100) / (1 - GP.feePct / 100);
      const units = (GP.sizeSol * (this.solUsd || 150)) / fill;
      // Same fill, same size, one position per book. The books differ only in how they exit, so a comparison between them is clean.
      for (const book of this.books()) {
        if (this.open.has(`${book}:${e.mint}`)) continue;
        const pos = { book, alertId: e.alertId, mint: e.mint, symbol: st.symbol, entryTs: now, entryPrice: fill, entryMcap: st.last.mcap, sizeSol: GP.sizeSol, units, unitsLeft: units, realized: 0, peak: GP.sizeSol, tp1Done: false,
          events: [{ t: now, type: 'entry', price: fill, mcap: round(st.last.mcap, 0) }] };
        pos.id = Number(Q.insertPaper.run({ alertId: pos.alertId, mint: pos.mint, symbol: pos.symbol, entryTs: now, entryPrice: fill, entryMcap: pos.entryMcap, sizeSol: pos.sizeSol, units, events: JSON.stringify(pos.events), book }).lastInsertRowid);
        this.open.set(`${book}:${e.mint}`, pos); this.paperEvents.push({ type: 'entry', id: pos.id, book });
      }
      log.info(`GRAD ENTRY ${st.symbol} @ $${round(st.last.mcap / 1000, 1)}k mcap (${this.books().join(' + ')})`);
    }
    for (const [, pos] of this.open) {
      const st = this.watch.get(pos.mint);
      if (!st) { this.close(pos, null, 'token dropped from watchlist (liquidity gone)', 0); continue; }
      if (!st.last || st.last.t <= pos.entryTs) continue;
      const value = this.valueSol(pos, st);
      const total = pos.realized + value; if (total > pos.peak) pos.peak = total;
      const mult = total / pos.sizeSol, heldMin = (now - pos.entryTs) / MIN;
      const r = this.exitRule(pos, mult, total, heldMin);
      if (r === 'tp1') {
        const u = pos.unitsLeft * GP.tp1Fraction; const got = this.valueSol(pos, st, u);
        pos.unitsLeft -= u; pos.realized += got; pos.tp1Done = true;
        pos.events.push({ t: now, type: 'tp1', sol: round(got, 4), mcap: round(st.last.mcap, 0) });
        this.persist(pos); continue;
      }
      if (r) this.close(pos, st, r);
    }
  }
  /** Exit decision for one position. Returns 'tp1', a close reason, or null. Pure, so the tests can drive it directly. */
  exitRule(pos, mult, total, heldMin) {
    if (pos.book === 'trail') {
      // Trailing book: hard stop until the position is up trailArmMultiple, then a trailing stop from the running peak. No clock
      // besides a long ceiling. The question it answers: do the fixed book's 6 h hold and partial take-profit cut the winners short?
      const armed = pos.peak >= pos.sizeSol * GP.trailArmMultiple;
      if (!armed && mult <= 1 - GP.stopPct / 100) return `stop -${GP.stopPct}%`;
      if (armed && total <= pos.peak * (1 - GP.trailBookPct / 100)) return `trailing stop ${GP.trailBookPct}% (from ${round(pos.peak / pos.sizeSol, 2)}×)`;
      if (heldMin >= GP.trailMaxHoldMin) return `max hold ${GP.trailMaxHoldMin / 60} h`;
      return null;
    }
    if (!pos.tp1Done && mult >= GP.tp1Multiple) return 'tp1';
    if (mult <= 1 - GP.stopPct / 100) return `stop -${GP.stopPct}%`;
    if (pos.tp1Done && total <= pos.peak * (1 - GP.trailPct / 100)) return `trailing stop ${GP.trailPct}%`;
    if (heldMin >= GP.maxHoldMin) return 'max hold';
    return null;
  }
  persist(pos, x = {}) {
    Q.updatePaper.run({ id: pos.id, status: x.status || 'open', unitsLeft: pos.unitsLeft, realized: pos.realized, peak: pos.peak, exitTs: x.exitTs ?? null,
      exitReason: x.exitReason ?? null, exitPrice: x.exitPrice ?? null, pnlSol: x.pnlSol ?? null, pnlPct: x.pnlPct ?? null, events: JSON.stringify(pos.events) });
  }
  close(pos, st, reason, forcedValue) {
    const now = Date.now();
    const got = forcedValue ?? this.valueSol(pos, st);
    pos.realized += got; pos.unitsLeft = 0;
    const pnl = pos.realized - pos.sizeSol;
    pos.events.push({ t: now, type: 'exit', reason, sol: round(got, 4), mcap: st?.last ? round(st.last.mcap, 0) : null });
    this.persist(pos, { status: 'closed', exitTs: now, exitReason: reason, exitPrice: st?.last?.price ?? null, pnlSol: pnl, pnlPct: (pnl / pos.sizeSol) * 100 });
    this.open.delete(`${pos.book || 'fixed'}:${pos.mint}`); this.paperEvents.push({ type: 'exit', id: pos.id, book: pos.book });
    log.info(`GRAD EXIT [${pos.book || 'fixed'}] ${pos.symbol} ${reason} pnl ${round((pnl / pos.sizeSol) * 100, 1)}%`);
  }
  kill(book = 'fixed') { return killStatsFrom(Q.closedPapersAsc.all(book)); }
  /** Both exit books side by side: the fixed book is the reference, the trailing book is the challenger. */
  bookView() {
    const counts = Object.fromEntries(Q.bookCounts.all().map((r) => [r.book, r]));
    const rules = {
      fixed: `sell ${GP.tp1Fraction * 100}% at ${GP.tp1Multiple}×, then ${GP.trailPct}% trailing stop · hard stop −${GP.stopPct}% · ${GP.maxHoldMin / 60} h max hold`,
      trail: `no partial exit · hard stop −${GP.stopPct}% until +${Math.round((GP.trailArmMultiple - 1) * 100)}%, then ${GP.trailBookPct}% trailing stop from the peak · ${GP.trailMaxHoldMin / 60} h ceiling`,
    };
    const out = {};
    for (const b of this.books()) {
      const k = this.kill(b), c = counts[b] || { n: 0, open: 0, closed: 0, pnl: 0 };
      out[b] = { book: b, rule: rules[b], kill: k, n: c.n, open: c.open, closed: c.closed, pnlSol: c.pnl || 0, exits: Q.exitMix.all(b) };
    }
    // paired comparison on alerts both books have closed
    let paired = null;
    if (out.trail) {
      const rows = db.prepare(`SELECT f.alert_id, f.pnl_pct f_pct, t.pnl_pct t_pct FROM grad_paper f JOIN grad_paper t ON t.alert_id = f.alert_id AND t.book = 'trail' AND t.status = 'closed'
        WHERE COALESCE(f.book,'fixed') = 'fixed' AND f.status = 'closed'`).all();
      if (rows.length) {
        const d = rows.map((r) => r.t_pct - r.f_pct), m = d.reduce((a, b) => a + b, 0) / d.length;
        const sd = d.length > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1)) : 0, se = d.length > 1 ? sd / Math.sqrt(d.length) : 0;
        paired = { n: d.length, meanDiffPct: m, loPct: m - 1.96 * se, hiPct: m + 1.96 * se, trailWins: d.filter((x) => x > 0).length, ties: d.filter((x) => Math.abs(x) < 1e-9).length };
      }
    }
    return { books: out, paired, armMultiple: GP.trailArmMultiple, replay: this.replayTrail() };
  }
  /**
   * Replay of the trailing rule over every closed fixed-book trade, using the stored 10-minute snapshots. Same entry fill,
   * exit fee and slippage applied, price impact ignored. Coarser than the live 60 s polls, so stops and trails fire a little
   * late; the direction of the comparison is what it is for. Not counted toward any pass: it is context while the live book fills.
   */
  replayTrail() {
    const trades = db.prepare(`SELECT mint, symbol, entry_ts, entry_price, pnl_pct FROM grad_paper WHERE status='closed' AND COALESCE(book,'fixed')='fixed' ORDER BY entry_ts`).all();
    if (!trades.length) return null;
    const snaps = db.prepare('SELECT ts, price FROM grad_snapshots WHERE mint=? AND ts>=? ORDER BY ts'), watch = db.prepare('SELECT active, dropped_reason FROM grad_watch WHERE mint=?');
    const cost = (1 - GP.feePct / 100) * (1 - GP.extraSlippagePct / 100), arm = GP.trailArmMultiple, trail = 1 - GP.trailBookPct / 100, stop = 1 - GP.stopPct / 100;
    const rows = [], mix = {};
    for (const t of trades) {
      const S = snaps.all(t.mint, t.entry_ts); if (S.length < 2) continue;
      let peak = 1, reason = null, mult = null;
      for (const sn of S) { const m = (sn.price / t.entry_price) * cost; if (m > peak) peak = m;
        if (peak < arm && m <= stop) { reason = 'stop'; mult = m; break; }
        if (peak >= arm && m <= peak * trail) { reason = 'trail'; mult = peak * trail; break; }
        if ((sn.ts - t.entry_ts) / MIN >= GP.trailMaxHoldMin) { reason = 'ceiling'; mult = m; break; } }
      if (!reason) { const w = watch.get(t.mint); if (w && !w.active && /liquidity|evicted/.test(w.dropped_reason || '')) { reason = 'liquidity gone'; mult = 0; } else { reason = 'open at end of data'; mult = (S[S.length - 1].price / t.entry_price) * cost; } }
      const pct = (mult - 1) * 100; rows.push({ symbol: t.symbol, fixedPct: t.pnl_pct, trailPct: pct, reason });
      (mix[reason] ||= { reason, n: 0, sum: 0 }); mix[reason].n++; mix[reason].sum += pct;
    }
    if (!rows.length) return null;
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const d = rows.map((r) => r.trailPct - r.fixedPct), m = avg(d);
    const sd = d.length > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1)) : 0, se = d.length > 1 ? sd / Math.sqrt(d.length) : 0;
    return { n: rows.length, fixedAvgPct: avg(rows.map((r) => r.fixedPct)), trailAvgPct: avg(rows.map((r) => r.trailPct)), meanDiffPct: m, loPct: m - 1.96 * se, hiPct: m + 1.96 * se,
      trailWins: d.filter((x) => x > 0).length, winRatePct: (rows.filter((r) => r.trailPct > 0).length / rows.length) * 100, rows,
      mix: Object.values(mix).map((x) => ({ reason: x.reason, n: x.n, avgPct: x.sum / x.n })).sort((a, b) => b.n - a.n), resolutionMin: G.snapshotEveryMin };
  }

  // ---- outcome labeling (1h and 6h after each snapshot / alert) ----
  // Labels use our own poll series, so they only exist for tokens still watched; dropped tokens are labeled
  // with the floor they were dropped at (liquidity gone = loss), which is the honest direction to err in.
  label() {
    const now = Date.now();
    const pathOf = (mint, from, to) => (this.watch.get(mint)?.series || []).filter((p) => p.t > from && p.t <= to).map((p) => p.price);
    for (const s of Q.dueSnaps.all(now - 6 * HOUR)) {
      const st = this.watch.get(s.mint);
      const p1 = pathOf(s.mint, s.ts, s.ts + HOUR), p6 = pathOf(s.mint, s.ts, s.ts + 6 * HOUR);
      if (!st || p6.length < 10) { Q.labelSnap.run({ mint: s.mint, ts: s.ts, max1: null, min1: null, max6: s.price, min6: 0, p6: 0, mbm: 0 }); continue; }
      const mx = Math.max(...p6), iMax = p6.indexOf(mx);
      Q.labelSnap.run({ mint: s.mint, ts: s.ts, max1: Math.max(...p1), min1: Math.min(...p1), max6: mx, min6: Math.min(...p6), p6: p6[p6.length - 1], mbm: Math.min(s.price, ...p6.slice(0, iMax + 1)) });
    }
    for (const a of Q.openAlerts.all()) {
      const age = now - a.ts; const st = this.watch.get(a.mint);
      if (age >= HOUR && a.max_1h == null) { const p1 = pathOf(a.mint, a.ts, a.ts + HOUR); if (p1.length) Q.updateAlert1h.run(Math.max(...p1) / a.price, a.id); }
      if (age >= 6 * HOUR) {
        const p6 = pathOf(a.mint, a.ts, a.ts + 6 * HOUR);
        if (!st || !p6.length) { Q.finalizeAlert.run({ id: a.id, max1: null, max6: 1, mbm: 0, p6: 0 }); continue; }
        const mx = Math.max(...p6), iMax = p6.indexOf(mx), mbm = Math.min(...p6.slice(0, iMax + 1));
        Q.finalizeAlert.run({ id: a.id, max1: null, max6: mx / a.price, mbm: mbm / a.price, p6: p6[p6.length - 1] / a.price });
      }
    }
  }

  // ---- views ----
  row(st) {
    const f = st.features || {};
    const spark = st.series.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 48)) === 0 || i === a.length - 1).map((p) => round(p.price, 12));
    return { mint: st.mint, symbol: st.symbol, name: st.name, source: st.source, dex: st.dex, quote: st.quote, ageMin: f.ageMin, mcapUsd: f.mcapUsd, liqUsd: f.liqUsd,
      vsMig: f.vsMig, migEstimated: f.migEstimated, volAccel: f.volAccel, buyRatio5: f.buyRatio5, tx5: f.tx5, c5: f.c5, c1h: f.c1h, c24: f.c24,
      higherLow: f.higherLow, breakout: f.breakout, score: st.score, reject: st.reject, reasons: st.reasons, flags: st.flags, spark, open: this.hasOpen(st.mint) };
  }
  board(limit = 80) {
    const all = [...this.watch.values()].filter((s) => s.last);
    const live = all.filter((s) => !s.reject).sort((a, b) => b.score - a.score);
    const rejected = all.filter((s) => s.reject && !s.reject.startsWith('warming')).sort((a, b) => (b.last?.liq || 0) - (a.last?.liq || 0));
    const warming = all.filter((s) => s.reject?.startsWith('warming')).sort((a, b) => (b.last?.liq || 0) - (a.last?.liq || 0));
    return { watching: this.watch.size, priced: all.length, survivors: live.length, warmingCount: warming.length, rejectedCount: rejected.length,
      rows: live.slice(0, limit).map((s) => this.row(s)), warming: warming.slice(0, 20).map((s) => this.row(s)), rejected: rejected.slice(0, 20).map((s) => this.row(s)) };
  }
  detail(mint) {
    const st = this.watch.get(mint); if (!st) return null;
    return { ...this.row(st), features: st.features, parts: st.parts, info: st.info, url: st.url, pair: st.pair, migPrice: st.migPrice, peakPrice: st.peakPrice,
      series: st.series.map((p) => [p.t, p.mcap]), alerts: db.prepare('SELECT * FROM grad_alerts WHERE mint=? ORDER BY ts DESC LIMIT 10').all(mint) };
  }
  alerts(limit = 40) {
    return Q.recentAlerts.all(limit).map((a) => {
      const st = this.watch.get(a.mint);
      const series = st ? st.series.filter((p) => p.t > a.ts) : [];
      return { ...a, features: undefined, reasons: JSON.parse(a.reasons || '[]'), flags: JSON.parse(a.flags || '[]'),
        nowMult: st?.last ? st.last.price / a.price : a.finalized ? a.price_6h : null, peakMult: a.max_6h ?? (series.length ? Math.max(...series.map((p) => p.price)) / a.price : null), live: !!st };
    });
  }
  paper() {
    const open = [...this.open.values()].map((p) => { const st = this.watch.get(p.mint); const v = p.realized + this.valueSol(p, st); return { id: p.id, book: p.book || 'fixed', mint: p.mint, symbol: p.symbol, entryTs: p.entryTs, entryMcap: p.entryMcap, markPct: (v / p.sizeSol - 1) * 100, mcap: st?.last?.mcap ?? null, tp1Done: p.tp1Done }; });
    return { open, recent: Q.allPapers.all(120).map((r) => ({ ...r, book: r.book || 'fixed', events: JSON.parse(r.events || '[]') })), kill: this.kill('fixed'), books: this.bookView(), config: GP };
  }
  calibration() {
    const rows = Q.calib.all(Date.now() - 30 * 86400000);
    const edges = [0, 30, 45, 55, 65, 75, 101];
    const buckets = edges.slice(0, -1).map((lo, i) => ({ label: i === edges.length - 2 ? `${lo}+` : `${lo}–${edges[i + 1] - 1}`, lo, hi: edges[i + 1], n: 0, up50: 0, up100: 0, down50: 0 }));
    const rej = { label: 'rej.', n: 0, up50: 0, up100: 0, down50: 0 };
    for (const r of rows) {
      const b = r.reject ? rej : buckets.find((x) => r.score >= x.lo && r.score < x.hi); if (!b) continue;
      b.n++; const mx = r.max_6h / r.price, mn = r.min_6h / r.price;
      if (mx >= 1.5) b.up50++; if (mx >= 2) b.up100++; if (mn <= 0.5) b.down50++;
    }
    const fin = (b) => ({ ...b, up50Pct: b.n ? (b.up50 / b.n) * 100 : null, up100Pct: b.n ? (b.up100 / b.n) * 100 : null, down50Pct: b.n ? (b.down50 / b.n) * 100 : null });
    return { n: rows.length, buckets: buckets.map(fin), rejected: fin(rej) };
  }
  stats() {
    const c = Q.counts.get(Date.now() - 86400000);
    return { ...this.counters, watching: this.watch.size, open: this.open.size, solUsd: this.solUsd, ...c, alertScore: G.alertScore, minAgeMin: G.minAgeMin, minLiqUsd: G.minLiqUsd, pollSec: G.pollSec };
  }
}
