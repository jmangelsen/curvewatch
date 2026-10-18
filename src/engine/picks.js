// Conversational pick lists: "graduates reigniting" and "soon to be grads".
//
// Both are ranked watch lists over data the machine already records; neither has demonstrated forecasting skill yet.
// They are logged to pick_log every time they are served so a scorecard can be built later against what happened.
// Pure ranking functions are exported for tests; the Picks class wires them to the live engine and graduate watchlist.
import { db } from '../db.js';
import { config } from '../config.js';
import { round } from '../util.js';
import { isGradRejected } from './rejects.js';
import { holdersOf, holderGrowth, holdersEnabled } from './holders.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const HOUR = 3600000;

db.exec(`CREATE TABLE IF NOT EXISTS pick_log (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, kind TEXT NOT NULL, rank INTEGER NOT NULL, mint TEXT NOT NULL, symbol TEXT,
  score REAL, mcap_usd REAL, price REAL, holders INTEGER, reasons TEXT, flags TEXT, features TEXT, source TEXT);
CREATE INDEX IF NOT EXISTS idx_pick_log_ts ON pick_log(kind, ts)`);
const Q = { ins: db.prepare(`INSERT INTO pick_log (ts, kind, rank, mint, symbol, score, mcap_usd, price, holders, reasons, flags, features, source)
  VALUES (@ts, @kind, @rank, @mint, @symbol, @score, @mcapUsd, @price, @holders, @reasons, @flags, @features, @source)`),
  token: db.prepare('SELECT created_at FROM tokens WHERE mint = ?'),
  curveRejected: db.prepare("SELECT 1 FROM rejects WHERE mint = ? AND kind = 'curve' LIMIT 1") };

/**
 * Reignition score for a graduate. The idea: a token that already proved it can graduate, cooled off (price off its peak,
 * volume faded) and is now getting bid again with accelerating volume, rising buy share and a higher low. Pure.
 */
export function reigniteRank(f, { boosts = 0, holders = null, growth = null } = {}) {
  const parts = {};
  parts.volume = 30 * clamp(Math.log2(Math.max(f.volAccel ?? 0, 1e-3)) / 2);            // 4× hourly pace = full
  parts.activity = 10 * clamp(Math.log2(Math.max(f.txAccel ?? 0, 1e-3)) / 2);
  parts.demand = 15 * clamp(((f.buyRatio1h ?? 0.5) - 0.5) / 0.15) + 5 * clamp(((f.buyRatio5 ?? 0.5) - 0.5) / 0.2);
  parts.structure = (f.higherLow === true ? 10 : 0) + (f.breakout === true ? 10 : 0);
  // "reignite" means it was down first: reward being off the peak (room) but not dead (still above half of it)
  parts.room = f.fromPeak == null ? 3 : f.fromPeak < 0.35 ? 0 : f.fromPeak < 0.85 ? 10 : 4;
  parts.depth = 5 * clamp(((f.liqUsd || 0) / Math.max(f.mcapUsd || 1, 1)) / 0.12) + (f.liqTrend != null ? 5 * clamp((f.liqTrend - 1) / 0.2) : 0);
  if (holders != null) parts.holders = 10 * clamp((Math.log10(Math.max(holders, 1)) - 2) / 1.4) + (growth?.deltaPct > 5 ? 5 : 0); // 2,500 holders ≈ full
  if (boosts > 0) parts.paid = -8;
  if (f.c1h != null && f.c1h > 120) parts.vertical = -12;
  if (f.fdvLiq != null && f.fdvLiq > 25) parts.thin = -8;
  const score = round(clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), 1);
  const reasons = [], flags = [];
  if ((f.volAccel ?? 0) >= 1.5) reasons.push(`volume ${round(f.volAccel, 1)}× its hourly pace`);
  if ((f.buyRatio1h ?? 0) >= 0.58) reasons.push(`${round(f.buyRatio1h * 100, 0)}% buys over 1h`);
  if (f.higherLow) reasons.push('higher low'); if (f.breakout) reasons.push('breaking its 1h high');
  if (f.fromPeak != null && f.fromPeak < 0.85 && f.fromPeak >= 0.35) reasons.push(`${round((1 - f.fromPeak) * 100, 0)}% below peak, room to reclaim`);
  if (holders != null) reasons.push(`${holders.toLocaleString('en-US')} holders${growth?.deltaPct != null ? ` (${growth.deltaPct >= 0 ? '+' : ''}${round(growth.deltaPct, 0)}% in ${round(growth.minutes, 0)} min)` : ''}`);
  if (boosts > 0) flags.push(`paid boost (${boosts})`); if (parts.vertical) flags.push(`already +${round(f.c1h, 0)}% in 1h`); if (parts.thin) flags.push(`FDV ${round(f.fdvLiq, 0)}× liquidity`);
  if (f.fromPeak != null && f.fromPeak < 0.35) flags.push(`${round((1 - f.fromPeak) * 100, 0)}% below its peak`);
  return { score, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 1)])), reasons, flags };
}

/**
 * "Soon to be grads": a live curve token that is far along the curve, still being bought, broadly held for its stage
 * and not rejected. Pure. `f` is token.features(), `s` the latest score/reject.
 */
export function soonRank(f, { reject = null, score = null } = {}) {
  const parts = {};
  parts.progress = 45 * clamp((f.progressPct - 30) / 60);                                // 90% of the curve = full
  parts.flow = 15 * clamp((f.flow60Sol ?? 0) / 3) + 10 * clamp((f.netSolPerMin ?? 0) / 2);
  parts.breadth = 10 * clamp((f.uniqueBuyers ?? 0) / 150) + 5 * clamp((f.buyers60 ?? 0) / 8);
  parts.fresh = f.secSinceTrade <= 60 ? 5 : f.secSinceTrade <= 180 ? 2 : 0;
  parts.quality = 10 * clamp(((score ?? 0) - 40) / 50);
  if ((f.top10Pct ?? 0) > 35) parts.concentrated = -10;
  if (f.creatorSold) parts.creatorSold = -6;
  if ((f.drawdownPct ?? 0) > 35) parts.dumping = -12;
  const sc = round(clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), 1);
  const reasons = [], flags = [];
  reasons.push(`${round(f.progressPct, 0)}% of the curve`);
  if ((f.flow60Sol ?? 0) > 0.5) reasons.push(`net +${round(f.flow60Sol, 1)} SOL in the last minute`);
  if ((f.uniqueBuyers ?? 0) >= 80) reasons.push(`${f.uniqueBuyers} unique buyers`);
  if ((f.holders ?? 0) >= 100) reasons.push(`${f.holders} holders on the curve`);
  if (parts.concentrated) flags.push(`top-10 wallets hold ${round(f.top10Pct, 0)}%`); if (parts.creatorSold) flags.push('creator has sold'); if (parts.dumping) flags.push(`${round(f.drawdownPct, 0)}% off its peak`);
  if (reject) flags.push(`reject: ${reject}`);
  return { score: sc, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 1)])), reasons, flags };
}

export class Picks {
  constructor({ engine, grads }) { this.engine = engine; this.grads = grads; }

  /** Top graduates reigniting right now. `n` rows, plus the candidate count examined. */
  reigniting(n = 5, { minLiqUsd = 20000, maxAgeH = 72, minHolders = null, log = true, source = 'api' } = {}) {
    const now = Date.now(), rows = []; let examined = 0;
    for (const st of this.grads?.watch?.values() || []) {
      const f = st.features, L = st.last; if (!f || !L || !(L.mcap > 0)) continue;
      const born = Q.token.get(st.mint)?.created_at || st.pairCreatedAt || st.addedAt, ageH = (now - born) / HOUR;
      if (ageH > maxAgeH || !(L.liq >= minLiqUsd)) continue;
      if (st.reject || st.creatorRugger || isGradRejected(st.mint) || Q.curveRejected.get(st.mint)) continue;
      examined++;
      const hc = holdersOf(st.mint), holders = hc?.holders ?? null;
      if (minHolders != null && !(holders >= minHolders)) continue;
      const r = reigniteRank(f, { boosts: st.info?.boosts || 0, holders, growth: holders != null ? holderGrowth(st.mint, 60) : null });
      if ((f.volAccel ?? 0) < 1.2 && !f.breakout) continue;                                      // not reigniting: nothing is accelerating
      rows.push({ mint: st.mint, symbol: st.symbol, name: st.name, score: r.score, parts: r.parts, reasons: r.reasons, flags: r.flags, mcapUsd: L.mcap, liqUsd: L.liq, price: L.price,
        ageH: round(ageH, 1), holders, holdersAgeMin: hc ? round(hc.ageMin, 0) : null, volAccel: f.volAccel, fromPeak: f.fromPeak, c1h: f.c1h, features: f });
    }
    rows.sort((a, b) => b.score - a.score || (b.volAccel || 0) - (a.volAccel || 0));
    const top = rows.slice(0, n);
    if (log) this.log('reignite', top, source);
    return { rows: top, examined, holdersTracked: holdersEnabled(), minHolders };
  }

  /** Top live curve tokens closest to graduating with buyers still arriving. */
  soon(n = 5, { minProgress = 35, log = true, source = 'api' } = {}) {
    const rows = []; let examined = 0;
    for (const t of this.engine?.tokens?.values() || []) {
      if (t.graduated || t.lite) continue;
      const f = t.features(); if (f.progressPct < minProgress || f.secSinceTrade > 600) continue;
      examined++;
      const reject = t.rejectedHard?.reason || t.lastScore?.reject || null; if (reject) continue;   // rejected coins are never served
      const r = soonRank(f, { reject, score: t.lastScore?.score ?? null });
      rows.push({ mint: t.mint, symbol: t.symbol, name: t.name, score: r.score, parts: r.parts, reasons: r.reasons, flags: r.flags, progressPct: round(f.progressPct, 1), mcapSol: t.mcap,
        mcapUsd: this.grads?.solUsd ? t.mcap * this.grads.solUsd : null, price: null, holders: f.holders, uniqueBuyers: f.uniqueBuyers, flow60Sol: round(f.flow60Sol ?? 0, 2), ageMin: round(f.ageSec / 60, 1), curveScore: t.lastScore?.score ?? null,
        features: { progressPct: f.progressPct, flow60Sol: f.flow60Sol, netSolPerMin: f.netSolPerMin, uniqueBuyers: f.uniqueBuyers, holders: f.holders, top10Pct: f.top10Pct, drawdownPct: f.drawdownPct, ageSec: f.ageSec } });
    }
    rows.sort((a, b) => b.score - a.score || b.progressPct - a.progressPct);
    const top = rows.slice(0, n);
    if (log) this.log('soon', top, source);
    return { rows: top, examined };
  }

  log(kind, rows, source) {
    const ts = Date.now();
    const tx = db.transaction(() => rows.forEach((x, i) => Q.ins.run({ ts, kind, rank: i + 1, mint: x.mint, symbol: x.symbol, score: x.score, mcapUsd: x.mcapUsd ?? null, price: x.price ?? null, holders: x.holders ?? null,
      reasons: JSON.stringify(x.reasons), flags: JSON.stringify(x.flags), features: JSON.stringify(x.features), source })));
    tx();
  }
}
