// Launch-bundle reading from a trade tape. Not imported by src/version.js.
// The paper-book fingerprint hashes engine/score.js, token.js, paper.js, engine.js, and capitalPolicy.js only.
//
// Label and cluster rules are pre-registered in docs/bundle-rug-zone-v1.md.
// Bundle totals match the scorer's window: non-creator buys in the create slot and the next slot,
// or within 1500 ms when the create slot is missing. Other clusters are reported and not added to those totals.

export const TOTAL_SUPPLY = 1_000_000_000;
export const INITIAL_VTOKENS = 1_073_000_000;
export const INITIAL_REAL_TOKENS = 793_100_000;

export const LAUNCH = {
  slotLookahead: 1,
  timeFallbackMs: 1500,
  coordWindowMs: 10_000,
  coordSpanMs: 2_000,
  coordMinWallets: 3,
  coordMaxSizeCv: 0.35,
  coordMinSol: 0.05,
  coordSizeRatio: 2,
  majorityRemainingFrac: 0.5,
  minWalletsForModel: 3,
  maxWalletsListed: 40,
  maxClusters: 12,
  maxTradesRead: 20_000,
};

// Literals in src/engine/score.js. The live hard-reject percent is config.scoring.maxBundlePct (default 55).
export const SCORER_RULES = {
  minBundleWallets: 3,
  partialBundleBuyVolumePct: 25,
  defaultBundleBuyVolumePct: 55,
};

const DUST_TOKENS = 1;

export function mcapOf(vsol, vtok) {
  const vs = Number(vsol);
  const vt = Number(vtok);
  if (!(vt > 0) || !(vs > 0)) return null;
  return (vs / vt) * TOTAL_SUPPLY;
}

export function progressPct(vtok) {
  const vt = Number(vtok);
  if (!(vt > 0)) return null;
  const reserved = INITIAL_VTOKENS - INITIAL_REAL_TOKENS;
  const real = vt - reserved;
  const p = 1 - real / INITIAL_REAL_TOKENS;
  return Math.max(0, Math.min(1, p)) * 100;
}

export function coefficientOfVariation(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  if (!(mean > 0)) return 0;
  const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance) / mean;
}

export function asTrade(row) {
  const slotRaw = row.slot == null || row.slot === '' ? null : Number(row.slot);
  const sol = Number(row.sol);
  const tok = Number(row.tok);
  return {
    ts: Number(row.ts ?? row.at),
    slot: Number.isFinite(slotRaw) ? slotRaw : null,
    wallet: row.wallet ?? row.w ?? null,
    isBuy: row.isBuy === true || row.isBuy === 1 || row.b === true || row.b === 1,
    sol: Number.isFinite(sol) && sol > 0 ? sol : 0,
    tok: Number.isFinite(tok) && tok > 0 ? tok : 0,
    vsol: Number(row.vsol) || 0,
    vtok: Number(row.vtok) || 0,
    sig: row.sig || null,
  };
}

export function dedupeTrades(trades) {
  const seen = new Set();
  const out = [];
  for (const raw of trades || []) {
    const t = asTrade(raw || {});
    if (!Number.isFinite(t.ts) || !t.wallet) continue;
    if (t.sig) {
      const key = `${t.sig}|${t.wallet}|${t.isBuy ? 1 : 0}|${t.tok}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(t);
  }
  out.sort((a, b) => a.ts - b.ts || (a.slot ?? 0) - (b.slot ?? 0));
  return out;
}

export function replayBalances(trades) {
  const bal = new Map();
  const sold = new Map();
  for (const t of trades) {
    if (!t.wallet) continue;
    const have = bal.get(t.wallet) || 0;
    if (t.isBuy) {
      bal.set(t.wallet, have + t.tok);
    } else {
      const next = Math.max(0, have - t.tok);
      if (next <= DUST_TOKENS) bal.delete(t.wallet);
      else bal.set(t.wallet, next);
      sold.set(t.wallet, (sold.get(t.wallet) || 0) + t.tok);
    }
  }
  return { bal, sold };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function soldSentence(wallets) {
  const bought = wallets.reduce((s, w) => s + w.tokensBought, 0);
  if (!(bought > 0)) return null;
  const sold = wallets.reduce((s, w) => s + Math.min(w.soldTokens, w.tokensBought), 0);
  return `Sold ${round1((sold / bought) * 100)}% of the tokens bought in this cluster. Transfers between wallets are not visible.`;
}

function groupSoldPct(wallets) {
  const bought = wallets.reduce((s, w) => s + w.tokensBought, 0);
  if (!(bought > 0)) return null;
  const sold = wallets.reduce((s, w) => s + Math.min(w.soldTokens, w.tokensBought), 0);
  return (sold / bought) * 100;
}

function bySol(a, b) {
  return b.solBought - a.solBought || String(a.address).localeCompare(String(b.address));
}

function findCoordinated(candidates) {
  if (candidates.length < LAUNCH.coordMinWallets) return null;
  const byTime = [...candidates].sort((a, b) => a.firstBuyOffsetMs - b.firstBuyOffsetMs || String(a.address).localeCompare(String(b.address)));
  let best = null;
  for (let i = 0; i < byTime.length; i++) {
    const group = [];
    for (let j = i; j < byTime.length; j++) {
      if (byTime[j].firstBuyOffsetMs - byTime[i].firstBuyOffsetMs > LAUNCH.coordSpanMs) break;
      group.push(byTime[j]);
      if (group.length < LAUNCH.coordMinWallets) continue;
      const sols = group.map((w) => w.solBought);
      const lo = Math.min(...sols);
      const hi = Math.max(...sols);
      if (!(lo > 0) || hi > lo * LAUNCH.coordSizeRatio) continue;
      const sizeCv = coefficientOfVariation(sols);
      if (sizeCv > LAUNCH.coordMaxSizeCv) continue;
      const spanMs = byTime[j].firstBuyOffsetMs - byTime[i].firstBuyOffsetMs;
      const better = !best
        || group.length > best.addresses.length
        || (group.length === best.addresses.length && (sizeCv < best.sizeCv || (sizeCv === best.sizeCv && spanMs < best.spanMs)));
      if (better) best = { addresses: group.map((w) => w.address), sizeCv, spanMs };
    }
  }
  return best;
}

/**
 * @param {object} input
 * @param {Array} input.trades
 * @param {number|null} input.createdAt
 * @param {number|null} input.createSlot
 * @param {string|null} input.creator
 * @param {Map<string,string>|null} input.funders wallet -> funding parent. null means the source does not exist.
 * @param {Map<string,number>|null} input.holders live balances, when the in-memory map is still intact.
 * @param {boolean} input.truncated
 */
export function detectBundles(input) {
  const trades = dedupeTrades(input.trades || []);
  const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : (trades[0] ? trades[0].ts : null);
  const createSlot = Number.isFinite(input.createSlot) ? input.createSlot : null;
  const creator = input.creator || null;
  const funders = input.funders instanceof Map ? input.funders : null;
  const holders = input.holders instanceof Map ? input.holders : null;
  const method = createSlot != null
    ? 'create-slot-plus-one'
    : createdAt != null
      ? 'time-fallback-1500ms'
      : 'unavailable';

  const inWindow = (t) => {
    if (!t.isBuy || !t.wallet || t.wallet === creator) return false;
    if (method === 'create-slot-plus-one') return t.slot != null && t.slot >= createSlot && t.slot <= createSlot + LAUNCH.slotLookahead;
    if (method === 'time-fallback-1500ms') {
      const dt = t.ts - createdAt;
      return dt >= 0 && dt <= LAUNCH.timeFallbackMs;
    }
    return false;
  };

  let buyVolSol = 0;
  const windowAgg = new Map();
  const early = new Map();
  for (const t of trades) {
    if (t.isBuy) buyVolSol += t.sol;
    if (inWindow(t)) {
      let w = windowAgg.get(t.wallet);
      if (!w) {
        w = {
          address: t.wallet,
          solBought: 0,
          tokensBought: 0,
          firstBuyOffsetMs: createdAt == null ? null : t.ts - createdAt,
          slotOffset: method === 'create-slot-plus-one' && t.slot != null ? t.slot - createSlot : null,
        };
        windowAgg.set(t.wallet, w);
      }
      w.solBought += t.sol;
      w.tokensBought += t.tok;
    }
    if (t.isBuy && t.wallet && t.wallet !== creator && createdAt != null) {
      const dt = t.ts - createdAt;
      if (dt >= 0 && dt <= LAUNCH.coordWindowMs) {
        let e = early.get(t.wallet);
        if (!e) {
          e = { address: t.wallet, solBought: 0, tokensBought: 0, firstBuyOffsetMs: dt, slotOffset: createSlot != null && t.slot != null ? t.slot - createSlot : null };
          early.set(t.wallet, e);
        }
        e.solBought += t.sol;
        e.tokensBought += t.tok;
      }
    }
  }

  const replay = replayBalances(trades);
  const view = (agg) => {
    const still = holders ? (holders.get(agg.address) || 0) : (replay.bal.get(agg.address) || 0);
    const soldTokens = replay.sold.get(agg.address) || 0;
    const funder = funders ? (funders.get(agg.address) || null) : null;
    return {
      address: agg.address,
      solBought: agg.solBought,
      tokensBought: agg.tokensBought,
      stillHeldTokens: still,
      soldTokens,
      soldPct: agg.tokensBought > 0 ? Math.min(100, (Math.min(soldTokens, agg.tokensBought) / agg.tokensBought) * 100) : null,
      supplyHeldPct: (still / TOTAL_SUPPLY) * 100,
      firstBuyOffsetMs: agg.firstBuyOffsetMs,
      slotOffset: agg.slotOffset,
      funder,
    };
  };

  const bundleWallets = [...windowAgg.values()].map(view).sort(bySol);
  const bundleSol = bundleWallets.reduce((s, w) => s + w.solBought, 0);
  const bundleTokens = bundleWallets.reduce((s, w) => s + w.tokensBought, 0);
  const bundleStill = bundleWallets.reduce((s, w) => s + w.stillHeldTokens, 0);
  const sizeCv = coefficientOfVariation(bundleWallets.map((w) => w.solBought));

  const clusters = [];
  if (method === 'create-slot-plus-one') {
    for (const offset of [0, 1]) {
      const wallets = bundleWallets.filter((w) => w.slotOffset === offset);
      if (!wallets.length) continue;
      const still = wallets.reduce((s, w) => s + w.stillHeldTokens, 0);
      clusters.push({
        id: `slot-${offset}`,
        kind: 'same-slot',
        measured: true,
        label: offset === 0 ? 'Create slot' : 'Next slot',
        slotOffset: offset,
        walletCount: wallets.length,
        solBought: wallets.reduce((s, w) => s + w.solBought, 0),
        supplyHeldPct: (still / TOTAL_SUPPLY) * 100,
        soldPct: groupSoldPct(wallets),
        note: soldSentence(wallets),
        wallets,
      });
    }
  } else if (method === 'time-fallback-1500ms' && bundleWallets.length) {
    clusters.push({
      id: 'time-window',
      kind: 'time-window',
      measured: true,
      label: '1.5 second window',
      slotOffset: null,
      walletCount: bundleWallets.length,
      solBought: bundleSol,
      supplyHeldPct: (bundleStill / TOTAL_SUPPLY) * 100,
      soldPct: groupSoldPct(bundleWallets),
      note: soldSentence(bundleWallets),
      wallets: bundleWallets,
    });
  }

  const coordCandidates = [...early.values()].filter((w) => w.solBought >= LAUNCH.coordMinSol && w.firstBuyOffsetMs != null);
  const coord = createdAt == null ? null : findCoordinated(coordCandidates);
  let coordination = { found: false, walletCount: 0, sizeCv: null, spanMs: null };
  if (coord) {
    const byAddr = new Map([...windowAgg.values(), ...early.values()].map((w) => [w.address, w]));
    const wallets = coord.addresses.map((address) => byAddr.get(address)).filter(Boolean).map(view).sort(bySol);
    coordination = { found: true, walletCount: wallets.length, sizeCv: coord.sizeCv, spanMs: coord.spanMs };
    const still = wallets.reduce((s, w) => s + w.stillHeldTokens, 0);
    const sold = soldSentence(wallets);
    clusters.push({
      id: 'coordinated-timing',
      kind: 'coordinated-timing',
      measured: true,
      label: 'Similar size and timing',
      slotOffset: null,
      walletCount: wallets.length,
      solBought: wallets.reduce((s, w) => s + w.solBought, 0),
      supplyHeldPct: (still / TOTAL_SUPPLY) * 100,
      soldPct: groupSoldPct(wallets),
      note: ['First buys within 2 seconds, with similar sizes, inside 10 seconds of create. Not added to the same-slot bundle totals.', sold].filter(Boolean).join(' '),
      wallets,
    });
  }

  const funderPool = new Map(bundleWallets.map((w) => [w.address, w]));
  if (coord) {
    for (const address of coord.addresses) {
      if (funderPool.has(address)) continue;
      const agg = early.get(address);
      if (agg) funderPool.set(address, view(agg));
    }
  }
  const funderClusters = [];
  if (funders) {
    const groups = new Map();
    for (const w of funderPool.values()) {
      const funder = funders.get(w.address);
      if (!funder || funder === w.address) continue;
      const list = groups.get(funder) || [];
      list.push({ ...w, funder });
      groups.set(funder, list);
    }
    const ranked = [...groups.entries()].filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
    ranked.forEach(([funder, list], i) => {
      const wallets = list.sort(bySol);
      const still = wallets.reduce((s, w) => s + w.stillHeldTokens, 0);
      const sold = soldSentence(wallets);
      funderClusters.push({
        id: `shared-funder-${i + 1}`,
        kind: 'shared-funder',
        measured: true,
        label: 'Shared funder',
        slotOffset: null,
        walletCount: wallets.length,
        solBought: wallets.reduce((s, w) => s + w.solBought, 0),
        supplyHeldPct: (still / TOTAL_SUPPLY) * 100,
        soldPct: groupSoldPct(wallets),
        note: [`Funding parent ${funder}. Not added to the same-slot bundle totals.`, sold].filter(Boolean).join(' '),
        wallets,
        funder,
      });
    });
  }
  const funderStatus = !funders
    ? { measured: false, reason: 'missing' }
    : funderClusters.length
      ? { measured: true, reason: 'shared' }
      : { measured: false, reason: 'none-shared' };
  if (!funderClusters.length) {
    clusters.push({
      id: 'shared-funders',
      kind: 'shared-funder',
      measured: false,
      label: 'Shared funders',
      slotOffset: null,
      walletCount: 0,
      solBought: null,
      supplyHeldPct: null,
      soldPct: null,
      note: funders
        ? 'Not collected for this mint. No funding parent is shared by two or more of these wallets.'
        : 'Not collected. The trades table has no funding parent, and this process does not read one.',
      wallets: [],
    });
  } else {
    clusters.push(...funderClusters);
  }

  const features = bundleWallets.length >= LAUNCH.minWalletsForModel && bundleTokens > 0
    ? {
      supplyBoughtPct: (bundleTokens / TOTAL_SUPPLY) * 100,
      walletCount: bundleWallets.length,
      sizeCv,
      solBought: bundleSol,
      tokensBought: bundleTokens,
      wallets: bundleWallets.map((w) => ({ address: w.address, tokensBought: w.tokensBought })),
    }
    : null;

  return {
    method,
    slotData: createSlot != null,
    truncated: !!input.truncated,
    tradeCount: trades.length,
    buyVolSol,
    bundle: {
      wallets: bundleWallets,
      walletCount: bundleWallets.length,
      solBought: bundleSol,
      tokensBought: bundleTokens,
      stillHeldTokens: bundleStill,
      supplyHeldPct: method === 'unavailable' ? null : (bundleStill / TOTAL_SUPPLY) * 100,
      buyVolumeSharePct: method === 'unavailable' ? null : (buyVolSol > 0 ? (bundleSol / buyVolSol) * 100 : 0),
      soldPct: groupSoldPct(bundleWallets),
      sizeCv,
    },
    clusters,
    coordination,
    funders: funderStatus,
    features,
    definition: method === 'create-slot-plus-one'
      ? 'Non-creator buys in the create slot and the next slot.'
      : method === 'time-fallback-1500ms'
        ? 'Non-creator buys within 1500 ms of the recorded create time.'
        : 'No trade detail is available for a bundle window.',
  };
}

/**
 * Market cap where the frozen launch-window inventory first falls to half or below.
 * Sells consume each wallet's own window purchases. Later buys do not restore that inventory.
 * Returns null when the tape never reaches the threshold or no market cap is known at the crossing.
 */
export function labelMajoritySell(trades, positions) {
  const left = new Map();
  let total = 0;
  for (const p of positions || []) {
    const n = Number(p.tokensBought);
    if (!p.address || !(n > 0)) continue;
    left.set(p.address, (left.get(p.address) || 0) + n);
    total += n;
  }
  if (!(total > 0)) return null;
  const threshold = total * LAUNCH.majorityRemainingFrac;
  let remaining = total;
  let lastMcap = null;
  for (const t of dedupeTrades(trades || [])) {
    const mcap = mcapOf(t.vsol, t.vtok);
    if (mcap != null) lastMcap = mcap;
    if (t.isBuy || !left.has(t.wallet)) continue;
    const have = left.get(t.wallet) || 0;
    if (!(have > 0) || !(t.tok > 0)) continue;
    const use = Math.min(have, t.tok);
    left.set(t.wallet, have - use);
    remaining -= use;
    if (remaining <= threshold + 1e-9) {
      if (lastMcap == null) return null;
      return { mcapSol: lastMcap, ts: t.ts, remaining, total };
    }
  }
  return null;
}
