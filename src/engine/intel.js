// Proprietary intelligence built from YOUR labeled history: creator reputation + smart-wallet set.
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { logger } from '../log.js';
const log = logger('intel');

const creatorCache = new Map(); // wallet -> {launches, graduations, rugs}
let smartSet = new Set();
let smartList = [];

export function creatorRep(wallet) {
  if (!wallet) return null;
  let c = creatorCache.get(wallet);
  if (!c) {
    const row = q.getCreator.get(wallet);
    c = row ? { launches: row.launches, graduations: row.graduations, rugs: row.rugs } : { launches: 0, graduations: 0, rugs: 0 };
    creatorCache.set(wallet, c);
    if (creatorCache.size > 200000) creatorCache.delete(creatorCache.keys().next().value);
  }
  return c;
}

/** Called on token creation. Returns reputation BEFORE this launch. */
export function recordLaunch(wallet, t) {
  if (!wallet) return null;
  const before = { ...creatorRep(wallet) };
  q.upsertCreatorLaunch.run(wallet, t, t);
  creatorCache.get(wallet).launches++;
  return before;
}

export function recordCreatorOutcome(wallet, { graduated, rugged, peak }) {
  if (!wallet) return;
  q.creatorOutcome.run(graduated ? 1 : 0, rugged ? 1 : 0, peak || 0, wallet);
  const c = creatorCache.get(wallet);
  if (c) { if (graduated) c.graduations++; if (rugged) c.rugs++; }
}

const walletBatch = [];
/** Learn from a finalized token: which early buyers caught a >= winMultiple move. */
export function learnWallets(token) {
  const W = config.smartWallets;
  const early = token.createdAt + W.earlyWindowSec * 1000;
  for (const [w, at] of token.firstBuyAt) {
    if (at > early || w === token.creator) continue;
    const entry = token.firstBuyMcap.get(w) || token.initialMcap;
    // Peak AFTER their entry is approximated by token peak if the peak came after entry
    const peakAfter = token.peakAt >= at ? token.peakMcap : entry;
    const win = peakAfter / entry >= W.winMultiple || token.graduated ? 1 : 0;
    walletBatch.push({ w, win, grad: token.graduated ? 1 : 0, t: at });
  }
}
export const flushWallets = tx(() => { for (const r of walletBatch.splice(0)) q.upsertWallet.run(r); });

export function refreshSmartWallets() {
  const W = config.smartWallets;
  try {
    const rows = q.smartWallets.all(W.minEarlyBuys, W.minWins, W.minWinRate).filter((r) => r.buys_per_day <= W.maxEarlyBuysPerDay);
    smartList = rows.sort((a, b) => b.win_rate - a.win_rate);
    smartSet = new Set(rows.map((r) => r.wallet));
    log.info(`smart wallets: ${smartSet.size}`);
  } catch (e) { log.warn('refresh failed', e.message); }
}
export const getSmartSet = () => smartSet;
export const getSmartList = (n = 50) => smartList.slice(0, n);
