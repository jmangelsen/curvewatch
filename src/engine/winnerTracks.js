// Winner tracks v1. Paper only. Provisional priors live in config.strategies.runnerA and holderB.
// See docs/winner-tracks-v1.md. This file does not place trades and does not rewrite closed rows.
// Main's scorer and hard rejects are not imported; runnerA reads the raw score the scorer already computed.
import { config, CURVE } from '../config.js';
import { db } from '../db.js';
import { cappedStop } from './capitalPolicy.js';
import { round } from '../util.js';

const MIN = 60000;
const HOUR = 3600000;

db.exec(`
CREATE TABLE IF NOT EXISTS winner_signals (
  mint TEXT NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (mint, ts, kind)
);
CREATE TABLE IF NOT EXISTS survival_labels (
  mint TEXT NOT NULL, horizon_h INTEGER NOT NULL, ts INTEGER NOT NULL,
  alive INTEGER, mcap REAL, ref_mcap REAL, source TEXT,
  PRIMARY KEY (mint, horizon_h)
);
`);

const insSignal = db.prepare(`INSERT OR REPLACE INTO winner_signals (mint, ts, kind, payload) VALUES (?, ?, ?, ?)`);
const insSurvival = db.prepare(`INSERT OR IGNORE INTO survival_labels (mint, horizon_h, ts, alive, mcap, ref_mcap, source) VALUES (?, ?, ?, ?, ?, ?, ?)`);

/** Early bundle wallets: same slot rule the scorer uses (create slot + next, else the first 1.5s). */
export function bundleWallets(token) {
  const wallets = new Set();
  const trades = token?.trades || [];
  if (token?.createSlot != null) {
    for (const t of trades) {
      if (t.slot == null) continue;
      if (t.slot - token.createSlot > 1) break;
      if (t.b && t.w && t.w !== token.creator) wallets.add(t.w);
    }
  } else if (token?.createdAt) {
    for (const t of trades) {
      if (t.at - token.createdAt > 1500) break;
      if (t.b && t.w && t.w !== token.creator) wallets.add(t.w);
    }
  }
  return wallets;
}

/** Net SOL of those wallets, cumulative and in the recent window, plus a per-minute series. */
export function bundleFlow(token, now = Date.now(), windowSec = config.strategies.runnerA.bundleWindowSec) {
  const wallets = bundleWallets(token);
  let buySol = 0, sellSol = 0, recentNet = 0;
  const windowMs = windowSec * 1000;
  const byMin = new Map();
  const born = token?.createdAt || now;
  for (const t of token?.trades || []) {
    if (!t?.w || !wallets.has(t.w) || !(t.sol > 0)) continue;
    const signed = t.b ? t.sol : -t.sol;
    if (t.b) buySol += t.sol; else sellSol += t.sol;
    if (t.at <= now && now - t.at <= windowMs) recentNet += signed;
    const minute = Math.max(0, Math.floor((t.at - born) / MIN));
    byMin.set(minute, (byMin.get(minute) || 0) + signed);
  }
  const series = [...byMin.entries()].sort((a, b) => a[0] - b[0]).slice(-90).map(([minute, netSol]) => ({ minute, netSol: round(netSol, 4) }));
  return {
    wallets: wallets.size,
    buySol: round(buySol, 4),
    sellSol: round(sellSol, 4),
    netSol: round(buySol - sellSol, 4),
    recentNetSol: wallets.size ? round(recentNet, 4) : null,
    netSellers: wallets.size > 0 && sellSol > buySol,
    series,
  };
}

/**
 * Per-minute new-buyer and holder series from the in-memory tape.
 * buyersRising compares first-time buyers in the last 60s with the 60s before that.
 */
export function minuteGrowth(token, now = Date.now()) {
  const born = token?.createdAt || now;
  const trades = [...(token?.trades || [])].filter((t) => t && t.at <= now).sort((a, b) => a.at - b.at);
  const first = new Map();
  for (const t of trades) if (t.b && t.w && !first.has(t.w)) first.set(t.w, t.at);
  // Live tokens keep first-buy times after `trades` hits its cap. A plain fixture has no map, so the tape above is the fallback.
  const firstTimes = token?.firstBuyAt instanceof Map && token.firstBuyAt.size ? token.firstBuyAt : first;
  let recent = 0, prior = 0;
  for (const at of firstTimes.values()) {
    if (at > now - MIN && at <= now) recent++;
    else if (at > now - 2 * MIN && at <= now - MIN) prior++;
  }
  const endMin = Math.max(0, Math.floor((now - born) / MIN));
  const startMin = Math.max(0, endMin - 89);
  const bal = new Map();
  let ti = 0;
  const buyerSeries = [], holderSeries = [];
  for (let m = 0; m <= endMin && m < 400; m++) {
    const end = born + (m + 1) * MIN;
    let newBuyers = 0;
    while (ti < trades.length && trades[ti].at < end) {
      const t = trades[ti++];
      if (!t.w) continue;
      if (t.b && first.get(t.w) === t.at) newBuyers++;
      const b = bal.get(t.w) || 0;
      if (t.b) bal.set(t.w, b + (Number(t.tok) || 0));
      else {
        const nb = b - (Number(t.tok) || 0);
        if (nb <= 1) bal.delete(t.w); else bal.set(t.w, nb);
      }
    }
    if (m >= startMin) {
      buyerSeries.push({ minute: m, newBuyers });
      holderSeries.push({ minute: m, holders: bal.size });
    }
  }
  const rise = config.strategies.runnerA.buyerRise ?? 0;
  return { recentBuyers: recent, prevBuyers: prior, buyersRising: recent > prior + rise, buyerSeries, holderSeries };
}

/** How far the live mcap sits above the average trade mcap in the window. */
/**
 * Remember a print the capped `trades` array dropped. Called from the engine after applyTrade.
 * token.js is not modified: the opening tape the scorer uses stays exactly as it was.
 */
export function notePrint(token, trade) {
  if (!token || token.lite || !trade || !(trade.at > 0)) return;
  if (!Array.isArray(token.recentTrades)) token.recentTrades = [];
  token.recentTrades.push(trade);
  const keepMs = Math.max(180, config.strategies?.runnerA?.priceWindowSec || 180) * 1000;
  const cut = trade.at - keepMs;
  while (token.recentTrades.length && token.recentTrades[0].at < cut) token.recentTrades.shift();
  if (token.recentTrades.length > 4000) token.recentTrades.splice(0, token.recentTrades.length - 4000);
}

export function pricePremium(token, now = Date.now(), windowSec = config.strategies.runnerA.priceWindowSec) {
  const from = now - windowSec * 1000;
  const caps = [];
  const seen = new Set();
  const take = (t) => {
    if (!t || !(t.at >= from) || t.at > now || !(t.mcap > 0)) return;
    const id = t.sig ? `${t.sig}:${t.w || ''}:${t.b ? 1 : 0}` : null;
    if (id) { if (seen.has(id)) return; seen.add(id); }
    caps.push(t.mcap);
  };
  for (const t of token?.trades || []) take(t);
  for (const t of token?.recentTrades || []) take(t);
  const mcap = Number(token?.mcap);
  if (!caps.length || !(mcap > 0)) return { avg: null, premiumPct: null, prints: caps.length };
  const avg = caps.reduce((a, b) => a + b, 0) / caps.length;
  return { avg, premiumPct: (mcap / avg - 1) * 100, prints: caps.length };
}

export function curveSignalSnapshot(token, now = Date.now()) {
  const growth = minuteGrowth(token, now);
  const flow = bundleFlow(token, now);
  const px = pricePremium(token, now);
  return {
    buyersPerMin: growth.recentBuyers,
    prevBuyersPerMin: growth.prevBuyers,
    buyersRising: growth.buyersRising,
    buyerSeries: growth.buyerSeries,
    holderSeries: growth.holderSeries,
    bundleWallets: flow.wallets,
    bundleNetSol: flow.netSol,
    bundleRecentNetSol: flow.recentNetSol,
    bundleSeries: flow.series,
    pricePremiumPct: px.premiumPct == null ? null : round(px.premiumPct, 2),
    pricePrints: px.prints,
    ...earlyHolderTape(token, now),
  };
}

export function recordSignal(mint, ts, kind, payload) {
  if (!mint) return;
  insSignal.run(mint, ts, kind, JSON.stringify(payload));
}

export function recordCurveSignal(token, now = Date.now()) {
  if (!token?.mint) return;
  recordSignal(token.mint, now, 'curve', curveSignalSnapshot(token, now));
}

const allowedReject = (reject) => reject == null || /^creator sold /.test(reject) || /^bundled launch /.test(reject);

/**
 * Opening tape. First `snipeWallets` buyers inside `snipeWindowSec`, as a share of supply,
 * plus the largest early bag and the top-5 early bags in that same window.
 * Anecdotal cuts live in config and are not a fit. Unique-trader counts are not an input.
 */
export function earlyHolderTape(token, now = Date.now()) {
  const R = config.strategies.runnerA;
  const H = config.strategies.holderB;
  const born = token?.createdAt || 0;
  const windowMs = R.snipeWindowSec * 1000;
  const net = new Map();
  const order = [];
  for (const t of token?.trades || []) {
    if (!t?.w || t.at > now || t.at > born + windowMs) continue;
    if (!net.has(t.w)) { net.set(t.w, 0); order.push(t.w); }
    const cur = net.get(t.w);
    net.set(t.w, t.b ? cur + (Number(t.tok) || 0) : Math.max(0, cur - (Number(t.tok) || 0)));
  }
  const supply = CURVE.TOTAL_SUPPLY;
  const pct = (tok) => (supply > 0 ? (tok / supply) * 100 : null);
  const first = order.slice(0, R.snipeWallets);
  const snipeTok = first.reduce((s, w) => s + Math.max(0, net.get(w) || 0), 0);
  const bags = order.map((w) => Math.max(0, net.get(w) || 0)).sort((a, b) => b - a);
  const earlyMaxBagPct = order.length ? pct(bags[0] || 0) : null;
  const earlyTop5Pct = order.length ? pct(bags.slice(0, 5).reduce((s, x) => s + x, 0)) : null;
  const snipeSupplyPct = order.length ? pct(snipeTok) : null;
  const spreadOut = earlyMaxBagPct != null && earlyTop5Pct != null && earlyMaxBagPct < H.earlyMaxBagPct && earlyTop5Pct < H.earlyTop5Pct;
  return {
    wallets: order.length,
    firstN: first.length,
    snipeSupplyPct: snipeSupplyPct == null ? null : round(snipeSupplyPct, 2),
    earlyMaxBagPct: earlyMaxBagPct == null ? null : round(earlyMaxBagPct, 2),
    earlyTop5Pct: earlyTop5Pct == null ? null : round(earlyTop5Pct, 2),
    spreadOut,
  };
}

const snipeHot = (pct) => pct != null && pct >= config.strategies.runnerA.snipeSupplyPct;

/**
 * runnerA entry. One attempt can succeed; failing gates are retried on the next evaluation.
 * The sustain clock starts the first time the effective score is above the line and resets if it falls back.
 * That first observation is never an entry.
 * Bundled and dev-sold coins are allowed and flagged. Any other hard reject scores as 0.
 */
export function considerRunnerA(token, input = {}) {
  const R = config.strategies.runnerA;
  if (!R?.enabled || token.runnerAAt) return { acted: false };
  const now = input.now ?? Date.now();
  const f = input.features || token.lastFeatures || {};
  const reject = input.reject != null ? input.reject : null;
  const raw = Number.isFinite(input.raw) ? input.raw : (Number.isFinite(input.score) ? input.score : 0);
  const allowed = allowedReject(reject);
  const effective = allowed ? raw : 0;
  if (effective >= R.minScore) {
    if (token.runnerScoreSince == null) token.runnerScoreSince = now;
  } else token.runnerScoreSince = null;
  const progressPct = Number.isFinite(f.progressPct) ? f.progressPct : (token.progress != null ? token.progress * 100 : null);
  const mcapSol = Number.isFinite(f.mcapSol) ? f.mcapSol : Number(token.mcap);
  const solUsd = input.solUsd;
  const mcapUsd = solUsd > 0 && mcapSol > 0 ? mcapSol * solUsd : null;
  const growth = minuteGrowth(token, now);
  const flow = bundleFlow(token, now);
  const px = pricePremium(token, now, R.priceWindowSec);
  const ageSec = token.createdAt ? (now - token.createdAt) / 1000 : (Number(f.ageSec) || 0);
  const sustainedMs = token.runnerScoreSince != null ? now - token.runnerScoreSince : 0;
  const early = earlyHolderTape(token, now);
  const snipe = snipeHot(early.snipeSupplyPct);
  const flags = [];
  if ((f.creatorSoldPct || 0) > 0 || f.creatorSold) flags.push('dev-sold');
  if ((f.bundlePct || 0) >= config.scoring.maxBundlePct || /^bundled launch /.test(reject || '')) flags.push('bundled');
  if (snipe) flags.push('snipe');
  const loggedFlags = [];
  if (f.uniqueBuyers != null) loggedFlags.push('unique-traders');
  const gates = {
    score: allowed && effective >= R.minScore,
    curve: progressPct != null && progressPct >= R.minCurvePct && progressPct <= R.maxCurvePct,
    mcap: mcapUsd != null && mcapUsd <= R.maxMcapUsd,
    buyers: growth.buyersRising === true,
    bundle: flow.netSellers === false,
    sustain: token.runnerScoreSince != null && sustainedMs > 0 && sustainedMs >= R.sustainSec * 1000,
    premium: ageSec >= R.priceWindowSec && px.prints >= R.minPrints && px.premiumPct != null && px.premiumPct <= R.maxPremiumPct,
    history: ageSec >= R.minHistorySec,
  };
  const features = {
    progressPct, mcapSol, mcapUsd, ageSec,
    effectiveScore: round(effective, 1),
    sustainSec: round(sustainedMs / 1000, 1),
    buyersPerMinRecent: growth.recentBuyers,
    buyersPerMinPrior: growth.prevBuyers,
    bundleNetSol: flow.netSol,
    bundleRecentNetSol: flow.recentNetSol,
    pricePremiumPct: px.premiumPct == null ? null : round(px.premiumPct, 2),
    snipeSupplyPct: early.snipeSupplyPct,
    earlyMaxBagPct: early.earlyMaxBagPct,
    earlyTop5Pct: early.earlyTop5Pct,
    sizeFrac: snipe ? R.snipeSizeFrac : 1,
    uniqueTraders: f.uniqueBuyers ?? null,
    loggedFlags,
    runnerFlags: flags,
    provisional: true,
  };
  if (Object.values(gates).every(Boolean)) {
    token.runnerAAt = now;
    return { acted: true, enter: true, flags, features, effective, gates, sizeFrac: features.sizeFrac };
  }
  return { acted: false, enter: false, flags, features, effective, gates, sustainedMs, sizeFrac: features.sizeFrac };
}

/** Random other token whose curve fill is inside runnerA's band. Same exits, no score filter. */
export function inRunnerBand(token) {
  const R = config.strategies.runnerA;
  if (!token || token.graduated || token.lite) return false;
  const pct = token.progress != null ? token.progress * 100 : token.lastFeatures?.progressPct;
  return pct != null && pct >= R.minCurvePct && pct <= R.maxCurvePct;
}

export function pickRunnerAControl(tokens, sig) {
  const pool = [];
  for (const t of tokens) {
    if (t === sig || t.runnerACtlAt || t.runnerAAt) continue;
    if (!inRunnerBand(t)) continue;
    pool.push(t);
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Whichever is true on this mark. Snipe concentration is first: it is the earliest exit. Graduation is handled by the paper engine before this runs. */
export function runnerAExit({ progressPct = null, mcapUsd = null, bundleRecentNetSol = null, snipeSupplyPct = null, multiple, peakMultiple, heldMin }) {
  const R = config.strategies.runnerA;
  if (snipeHot(snipeSupplyPct)) return { reason: 'snipe concentration' };
  if (progressPct != null && progressPct >= R.exitCurvePct) return { reason: `curve ${R.exitCurvePct}%` };
  if (mcapUsd != null && mcapUsd >= R.exitMcapUsd) return { reason: `mcap $${Math.round(R.exitMcapUsd / 1000)}k` };
  if (bundleRecentNetSol != null && bundleRecentNetSol < R.bundleSellMaxNetSol) return { reason: 'bundle wallets net selling' };
  if (peakMultiple > 0 && multiple <= peakMultiple * (1 - R.trailPct / 100)) return { reason: `trailing stop ${R.trailPct}%` };
  if (heldMin >= R.maxHoldMin) return { reason: `max hold ${R.maxHoldMin}m` };
  return null;
}

export function curveContext(token, now = Date.now()) {
  if (!token) return {};
  // Migration often fires before the next evaluate(), so lastFeatures is still empty. Read the tape
  // once here; otherwise holderB never learns bundle or creator holdings and waits forever.
  let f = token.lastFeatures || null;
  if ((!f || f.bundlePct == null || f.creatorHoldPct == null) && typeof token.features === 'function' && ((token.trades && token.trades.length) || (token.holders && token.holders.size))) {
    try { f = { ...token.features(), ...(f || {}) }; } catch { /* tape not readable */ }
  }
  f = f || {};
  const early = earlyHolderTape(token, now);
  const out = { createdAt: token.createdAt ?? null, spreadOut: early.spreadOut };
  if (f.bundlePct != null) out.bundlePct = f.bundlePct;
  if (f.creatorHoldPct != null) out.creatorHoldPct = f.creatorHoldPct;
  if (f.uniqueBuyers != null) out.uniqueBuyers = f.uniqueBuyers;
  if (early.snipeSupplyPct != null) out.snipeSupplyPct = early.snipeSupplyPct;
  if (early.earlyMaxBagPct != null) out.earlyMaxBagPct = early.earlyMaxBagPct;
  if (early.earlyTop5Pct != null) out.earlyTop5Pct = early.earlyTop5Pct;
  return out;
}

/** Price held a floor: the low of the window is at least floorFrac of the price at the start of the window. */
export function heldFloor(series, now, floorMin, floorFrac) {
  const start = now - floorMin * MIN;
  const pts = (series || []).filter((p) => p && p.t >= start && p.t <= now && p.price > 0).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return { ok: false, reason: 'thin' };
  if (pts[pts.length - 1].t - pts[0].t < (floorMin - 1) * MIN) return { ok: false, reason: 'span' };
  const floor = pts[0].price * floorFrac;
  const low = Math.min(...pts.map((p) => p.price));
  return { ok: low + 1e-9 >= floor, low, floor, startPrice: pts[0].price };
}

/** Post-bond holder count and top-10% concentration. Null when a series has fewer than two points. */
export function postBondTrend({ holderPoints = [], top10Points = [], flatPp = 0 } = {}) {
  const h = holderPoints.filter((p) => p && Number.isFinite(p.value));
  const holdersRising = h.length >= 2 ? h[h.length - 1].value > h[0].value : null;
  const holderDelta = h.length >= 2 ? h[h.length - 1].value - h[0].value : null;
  const t = top10Points.filter((p) => p && Number.isFinite(p.value));
  const top10DeltaPp = t.length >= 2 ? t[t.length - 1].value - t[0].value : null;
  const top10FlatOrFalling = top10DeltaPp == null ? null : top10DeltaPp <= flatPp;
  return { holdersRising, holderDelta, top10FlatOrFalling, top10DeltaPp, holderSeries: h, top10Series: t };
}

/**
 * holderB entry, decided once the graduate is at least minAgeMin old AND the measurements exist.
 * A missing holder series, top-10 series, bundle share, creator holding, or a price window that
 * does not yet span the floor is not a decision: the caller retries. Opening the control on that
 * gap bought nearly every graduate. A measured refusal still opens the control. Ramp-pattern pools
 * are not traded (the existing honeypot guard: a buyer cannot exit).
 */
export function considerHolderB(st, input = {}) {
  const H = config.strategies.holderB;
  if (!H?.enabled) return { ready: false };
  const now = input.now ?? Date.now();
  const born = st.pairCreatedAt || st.graduatedAt || st.addedAt || null;
  if (!born) return { ready: false, reason: 'no birth' };
  const ageMin = (now - born) / MIN;
  if (ageMin < H.minAgeMin) return { ready: false, reason: 'age', ageMin };
  if (st.ramp) return { ready: true, enter: false, control: false, reason: 'ramp', ageMin };
  const floor = heldFloor(st.series, now, H.floorMin, H.floorFrac);
  const trend = postBondTrend({
    holderPoints: input.holderPoints || [],
    top10Points: input.top10Points || [],
    flatPp: H.top10FlatPp,
  });
  const curve = st.curveFlags || {};
  const bundlePct = input.bundlePct != null ? input.bundlePct : st.curveBundlePct;
  const creatorHoldPct = input.creatorHoldPct != null ? input.creatorHoldPct : st.curveCreatorHoldPct;
  const snipeSupplyPct = input.snipeSupplyPct != null ? input.snipeSupplyPct : curve.snipeSupplyPct ?? null;
  const earlyMaxBagPct = input.earlyMaxBagPct != null ? input.earlyMaxBagPct : curve.earlyMaxBagPct ?? null;
  const earlyTop5Pct = input.earlyTop5Pct != null ? input.earlyTop5Pct : curve.earlyTop5Pct ?? null;
  const spreadOut = earlyMaxBagPct != null && earlyTop5Pct != null && earlyMaxBagPct < H.earlyMaxBagPct && earlyTop5Pct < H.earlyTop5Pct;
  const createdAt = input.createdAt ?? curve.createdAt ?? null;
  const bondAt = st.pairCreatedAt || st.graduatedAt || null;
  const bondAgeSec = createdAt != null && bondAt != null ? (bondAt - createdAt) / 1000 : null;
  const fastBond = bondAgeSec != null && bondAgeSec >= 0 && bondAgeSec <= config.strategies.runnerA.snipeFastBondSec;
  const snipeReject = snipeHot(snipeSupplyPct) && fastBond;
  const bundleOk = bundlePct != null && bundlePct <= H.maxBundlePct;
  const devOk = creatorHoldPct != null && creatorHoldPct >= H.minCreatorHoldPct;
  const unmeasured = floor.reason === 'thin' || floor.reason === 'span'
    || trend.holdersRising == null || trend.top10FlatOrFalling == null
    || bundlePct == null || creatorHoldPct == null;
  if (unmeasured) return { ready: false, reason: 'unmeasured', ageMin, floor, trend };
  const paidBoosts = Number(input.boosts) || 0;
  const uniqueTraders = input.uniqueBuyers != null ? input.uniqueBuyers : curve.uniqueBuyers ?? null;
  const loggedFlags = [];
  if (paidBoosts > 0) loggedFlags.push('paid-boost');
  if (uniqueTraders != null) loggedFlags.push('unique-traders');
  if (spreadOut) loggedFlags.push('spread-out-early');
  if (snipeHot(snipeSupplyPct)) loggedFlags.push('snipe');
  const enter = !!(floor.ok && trend.holdersRising === true && trend.top10FlatOrFalling === true && bundleOk && devOk && !snipeReject);
  return {
    ready: true, enter, control: true, ageMin, floor, trend, snipeReject,
    features: {
      ageMin: round(ageMin, 2),
      bundlePct: bundlePct ?? null,
      creatorHoldPct: creatorHoldPct ?? null,
      floorOk: floor.ok,
      holdersRising: trend.holdersRising,
      top10FlatOrFalling: trend.top10FlatOrFalling,
      holderDelta: trend.holderDelta,
      top10DeltaPp: trend.top10DeltaPp == null ? null : round(trend.top10DeltaPp, 3),
      snipeSupplyPct, earlyMaxBagPct, earlyTop5Pct, spreadOut,
      fastBond, bondAgeSec: bondAgeSec == null ? null : round(bondAgeSec, 1),
      uniqueTraders, paidBoosts, loggedFlags,
      provisional: true,
    },
  };
}

/** Stop, half off at 2x, or the 24h clock. No trail. The 47% loss ceiling is applied by the caller first. */
export function holderBExit({ multiple, heldMin, tp1Done = false }) {
  const H = config.strategies.holderB;
  const stop = cappedStop(H.stopPct);
  if (multiple <= 1 - stop / 100) return { kind: 'exit', reason: `stop -${stop}%` };
  if (!tp1Done && multiple >= H.tp1Multiple) return { kind: 'tp', fraction: H.tp1Fraction, reason: `take half at ${H.tp1Multiple}x` };
  if (heldMin >= H.maxHoldMin) return { kind: 'exit', reason: 'max hold 24h' };
  return null;
}

/** Top-10% of supply from raw token amounts (6 decimals). Null when the list is empty. */
export function top10PctFromAmounts(amounts, rawSupply = CURVE.TOTAL_SUPPLY * 10 ** CURVE.TOKEN_DECIMALS) {
  const bals = (amounts || []).map((a) => Number(a)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
  if (!bals.length || !(rawSupply > 0)) return null;
  const top = bals.slice(0, 10).reduce((s, x) => s + x, 0);
  return (top / rawSupply) * 100;
}

/**
 * 24h and 72h survival. alive when a post-horizon mcap is still at least survivalFloorFrac of the reference.
 * A liquidity death with no later print is alive=0. No print and no death stays unlabeled.
 */
export function survivalFromSnapshots({ graduatedAt, refMcap, snapshots = [], droppedReason = null, now, horizons = null, floorFrac = null } = {}) {
  const H = config.strategies.holderB;
  const hs = horizons || H.survivalHorizonsH;
  const floor = floorFrac == null ? H.survivalFloorFrac : floorFrac;
  if (!graduatedAt || now == null) return [];
  const died = /liquidity under|no post-graduation pool/.test(droppedReason || '');
  const out = [];
  for (const h of hs) {
    const due = graduatedAt + h * HOUR;
    if (now < due) continue;
    const at = snapshots.filter((s) => s.ts >= due && s.mcap > 0).sort((a, b) => a.ts - b.ts)[0] || null;
    if (!at && !died) continue;
    if (at && !(refMcap > 0)) continue;
    const mcap = at?.mcap ?? null;
    const alive = at && mcap >= refMcap * floor ? 1 : 0;
    out.push({ horizonH: h, ts: at?.ts || now, alive, mcap, refMcap: refMcap ?? null });
  }
  return out;
}

/** Write due survival labels from grad_watch + grad_snapshots. No-op until those tables exist. Does not touch paper rows. */
export function recordDueSurvival(now = Date.now()) {
  const watch = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='grad_watch'`).get();
  const snaps = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='grad_snapshots'`).get();
  if (!watch || !snaps) return 0;
  const maxAge = config.grads.extMaxAgeHours * HOUR;
  const rows = db.prepare(`
    SELECT mint, pair_created_at AS born, mig_mcap AS ref, dropped_reason AS reason
    FROM grad_watch
    WHERE pair_created_at IS NOT NULL AND pair_created_at <= ? AND pair_created_at >= ?
  `).all(now - 24 * HOUR, now - maxAge);
  const have = new Set(db.prepare(`SELECT mint, horizon_h FROM survival_labels`).all().map((r) => `${r.mint}:${r.horizon_h}`));
  const one = db.prepare(`SELECT ts, mcap FROM grad_snapshots WHERE mint=? ORDER BY ts`);
  let n = 0;
  for (const row of rows) {
    const pending = (config.strategies.holderB.survivalHorizonsH || []).filter((h) => !have.has(`${row.mint}:${h}`) && now >= row.born + h * HOUR);
    if (!pending.length) continue;
    const shots = one.all(row.mint);
    const labeled = survivalFromSnapshots({ graduatedAt: row.born, refMcap: row.ref, snapshots: shots, droppedReason: row.reason, now, horizons: pending });
    for (const s of labeled) {
      insSurvival.run(row.mint, s.horizonH, s.ts, s.alive, s.mcap, s.refMcap, 'grad_snapshots');
      n++;
    }
  }
  return n;
}
