// In-memory state for one token on the bonding curve + feature extraction.
import { CURVE, config } from '../config.js';
import { mcapOf, progressOf, median } from '../util.js';

const RESERVED_VTOK = CURVE.INITIAL_VTOKENS - CURVE.INITIAL_REAL_TOKENS; // 279.9M virtual-only tokens
const K_SOL = CURVE.INITIAL_VSOL * CURVE.INITIAL_VTOKENS;

export class Token {
  constructor(c) {
    this.mint = c.mint;
    this.name = (c.name || '').slice(0, 64);
    this.symbol = (c.symbol || '').slice(0, 24);
    this.uri = c.uri || '';
    this.creator = c.creator || null;
    this.createdAt = c.recvAt || Date.now();
    this.createSlot = c.slot ?? null;
    this.pool = c.pool || 'pump';
    this.mayhem = !!c.mayhem;
    this.vsol = c.vsol || CURVE.INITIAL_VSOL;
    this.vtok = c.vtok || CURVE.INITIAL_VTOKENS;
    // SOL-quoted curves satisfy vsol * vtok = 30 * 1.073e9 (constant product). USDC-paired launches (since
    // May 2026) use a different reserve scale and fail this invariant; they are tracked but never scored.
    this.quoteOk = this.invariantOk(this.vsol, this.vtok);
    this.social = { twitter: false, telegram: false, website: false, fetched: false };
    this.trades = [];
    this.sigs = new Set();
    this.holders = new Map(); // wallet -> tokens
    this.firstBuyMcap = new Map(); // wallet -> mcap at their first buy
    this.firstBuyAt = new Map(); // wallet -> ms of first buy
    this.walletTrades = new Map(); // wallet -> trade count
    this.buyers = new Set();
    this.sellers = new Set();
    this.creatorMaxHeld = 0;
    this.creatorSoldTok = 0;
    this.initialBuySol = 0;
    this.initialMcap = mcapOf(this.vsol, this.vtok);
    this.peakMcap = this.initialMcap;
    this.peakAt = this.createdAt;
    this.lastTradeAt = this.createdAt;
    this.graduated = false;
    this.graduatedAt = null;
    this.snapshots = []; // {checkpoint, ts, mcap, maxAfter, runMin, minBeforeMax, minAfter}
    this.lastScore = null;
    this.maxScore = 0;
    this.alertId = null;
    this.alertedAt = null;
    this.lite = false; // true once trade-level detail is released (after active window)
    this.rejectedHard = null;
  }

  invariantOk(vsol, vtok) { return Math.abs((vsol * vtok) / K_SOL - 1) < 0.03; }
  get ageSec() { return (Date.now() - this.createdAt) / 1000; }
  get mcap() { return mcapOf(this.vsol, this.vtok); }
  get progress() { return progressOf(this.vtok - RESERVED_VTOK); }

  /** Apply a trade. Returns false if duplicate. */
  applyTrade(t) {
    const key = `${t.sig}:${t.wallet}:${t.isBuy ? 1 : 0}:${t.tok}`;
    if (this.sigs.has(key)) return false;
    this.sigs.add(key);
    const at = t.recvAt || Date.now();
    if (t.vsol > 0 && t.vtok > 0) { this.vsol = t.vsol; this.vtok = t.vtok; if (this.trades.length < 3) this.quoteOk = this.invariantOk(t.vsol, t.vtok); }
    const m = this.mcap;
    this.lastTradeAt = at;
    if (m > this.peakMcap) { this.peakMcap = m; this.peakAt = at; }
    if (this.progress >= 0.999 && !this.graduated) { this.graduated = true; this.graduatedAt = at; }

    for (const s of this.snapshots) {
      if (m > s.maxAfter) { s.maxAfter = m; s.minBeforeMax = s.runMin; }
      if (m < s.runMin) s.runMin = m;
      if (m < s.minAfter) s.minAfter = m;
    }
    if (this.lite) return true;

    if (this.createSlot == null && t.slot != null && this.trades.length === 0) this.createSlot = t.slot;
    if (this.trades.length < config.lifecycle.maxTradesPerToken) {
      this.trades.push({ at, slot: t.slot, w: t.wallet, b: t.isBuy, sol: t.sol, tok: t.tok, mcap: m, sig: t.sig, vsol: t.vsol, vtok: t.vtok });
    }
    const w = t.wallet;
    this.walletTrades.set(w, (this.walletTrades.get(w) || 0) + 1);
    const bal = this.holders.get(w) || 0;
    if (t.isBuy) {
      this.buyers.add(w);
      if (!this.firstBuyMcap.has(w)) { this.firstBuyMcap.set(w, m); this.firstBuyAt.set(w, at); }
      this.holders.set(w, bal + t.tok);
      if (w === this.creator) {
        this.creatorMaxHeld = Math.max(this.creatorMaxHeld, bal + t.tok);
        if (this.trades.length <= 2 && !this.initialBuySol) this.initialBuySol = t.sol;
      }
    } else {
      this.sellers.add(w);
      const nb = Math.max(0, bal - t.tok);
      if (nb <= 1) this.holders.delete(w); else this.holders.set(w, nb);
      if (w === this.creator) this.creatorSoldTok += t.tok;
    }
    return true;
  }

  /** Release trade-level memory after the active window; keep price tracking for outcome labels. */
  toLite() {
    this.lite = true;
    this.trades = []; this.sigs = new Set(); this.holders = new Map(); this.walletTrades = new Map(); this.sellers = new Set();
  }

  addSnapshot(checkpoint) {
    const m = this.mcap;
    const s = { checkpoint, ts: Date.now(), mcap: m, maxAfter: m, runMin: m, minBeforeMax: m, minAfter: m };
    this.snapshots.push(s);
    return s;
  }

  /** Compute the feature vector used by the scorer. */
  features(ctx = {}) {
    const age = Math.max(1, this.ageSec);
    const rateAge = Math.max(30, age); // avoid absurd per-minute rates in the first seconds
    const nowMs = Date.now();
    const tr = this.trades;
    let buys = 0, sells = 0, buyVol = 0, sellVol = 0, tiny = 0;
    let vol60Buy = 0, vol60Sell = 0, buyers60 = new Set();
    const buySizes = [];
    for (const t of tr) {
      if (t.b) { buys++; buyVol += t.sol; buySizes.push(t.sol); if (t.sol < 0.01) tiny++; } else { sells++; sellVol += t.sol; }
      if (nowMs - t.at <= 60000) { if (t.b) { vol60Buy += t.sol; buyers60.add(t.w); } else vol60Sell += t.sol; }
    }
    // Bundle detection: SOL bought in the create slot + next slot by non-creator wallets.
    let bundleSol = 0; const bundleWallets = new Set();
    if (this.createSlot != null) {
      for (const t of tr) {
        if (t.slot == null) continue;
        if (t.slot - this.createSlot > 1) break;
        if (t.b && t.w !== this.creator) { bundleSol += t.sol; bundleWallets.add(t.w); }
      }
    } else {
      // Fallback without slots: buys within 1.5s of creation
      for (const t of tr) { if (t.at - this.createdAt > 1500) break; if (t.b && t.w !== this.creator) { bundleSol += t.sol; bundleWallets.add(t.w); } }
    }
    // Holder concentration (wallets only; the curve itself is not a holder in this map)
    const bals = [...this.holders.values()].sort((a, b) => b - a);
    const top10 = bals.slice(0, 10).reduce((s, x) => s + x, 0);
    const creatorHeld = this.holders.get(this.creator) || 0;
    let repeat = 0; for (const [, c] of this.walletTrades) if (c >= 4) repeat += c;
    const netSol = this.vsol - CURVE.INITIAL_VSOL;
    const smartBuyers = ctx.smartSet ? [...this.buyers].filter((w) => ctx.smartSet.has(w)) : [];
    const creatorRep = ctx.creatorRep || null;

    return {
      ageSec: age,
      mcapSol: this.mcap,
      progressPct: this.progress * 100,
      netSol,
      netSolPerMin: netSol / (rateAge / 60),
      flow60Sol: vol60Buy - vol60Sell,
      buys, sells,
      buySellRatio: sells ? buys / sells : buys,
      buyVolSol: buyVol, sellVolSol: sellVol,
      uniqueBuyers: this.buyers.size,
      buyersPerMin: this.buyers.size / (rateAge / 60),
      buyers60: buyers60.size,
      holders: this.holders.size,
      top10Pct: (top10 / CURVE.TOTAL_SUPPLY) * 100,
      creatorHoldPct: (creatorHeld / CURVE.TOTAL_SUPPLY) * 100,
      creatorSoldPct: this.creatorMaxHeld > 0 ? Math.min(100, (this.creatorSoldTok / this.creatorMaxHeld) * 100) : 0,
      creatorSold: this.creatorSoldTok > 0,
      initialBuySol: this.initialBuySol,
      bundlePct: buyVol > 0 ? (bundleSol / buyVol) * 100 : 0,
      bundleWallets: bundleWallets.size,
      repeatTradeShare: tr.length ? repeat / tr.length : 0,
      tinyBuyShare: buys ? tiny / buys : 0,
      medianBuySol: median(buySizes),
      drawdownPct: this.peakMcap > 0 ? (1 - this.mcap / this.peakMcap) * 100 : 0,
      secSinceTrade: (nowMs - this.lastTradeAt) / 1000,
      hasTwitter: this.social.twitter, hasTelegram: this.social.telegram, hasWebsite: this.social.website,
      smartBuyers: smartBuyers.length,
      creatorLaunches: creatorRep ? creatorRep.launches : 0,
      creatorGraduations: creatorRep ? creatorRep.graduations : 0,
      creatorRugs: creatorRep ? creatorRep.rugs : 0,
      mayhem: this.mayhem,
      quoteOk: this.quoteOk,
    };
  }

  summary() {
    return {
      mint: this.mint, name: this.name, symbol: this.symbol, creator: this.creator, createdAt: this.createdAt,
      ageSec: this.ageSec, mcapSol: this.mcap, progressPct: this.progress * 100, peakMcap: this.peakMcap,
      buyers: this.buyers.size, trades: this.trades.length, graduated: this.graduated, social: this.social,
      score: this.lastScore?.score ?? null, reject: this.lastScore?.reject ?? null, alertId: this.alertId, lite: this.lite,
    };
  }
}
