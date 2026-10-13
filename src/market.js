// SOL/USD reference price (deepest USDC/USDT pool on DexScreener), shared by the API, Telegram and paper books.
import { logger } from './log.js';
const log = logger('market');
export const market = { solUsd: null, solUsdAt: 0 };

export async function refreshSolUsd(fallback) {
  try {
    const r = await fetch('https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ps = ((await r.json()) || []).filter((p) => p.baseToken?.address?.startsWith('So1111') && ['USDC', 'USDT'].includes(p.quoteToken?.symbol))
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const px = Number(ps[0]?.priceUsd);
    if (px > 0) { market.solUsd = px; market.solUsdAt = Date.now(); }
  } catch (e) {
    if (fallback) { market.solUsd = fallback; market.solUsdAt = Date.now(); }
    log.warn('SOL/USD refresh failed', e.message);
  }
  return market.solUsd;
}

/** Compact USD: $1.23M, $45.6k, $812, $0.42 */
export function fmtUsd(v, sign = false) {
  if (v == null || !Number.isFinite(v)) return '–';
  const a = Math.abs(v), sg = v < 0 ? '-' : sign && v > 0 ? '+' : '';
  const f = (x, d) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return `${sg}$${f(a / 1e9, 2)}B`;
  if (a >= 1e6) return `${sg}$${f(a / 1e6, 2)}M`;
  if (a >= 1e3) return `${sg}$${f(a / 1e3, 1)}k`;
  if (a >= 1) return `${sg}$${f(a, a >= 100 ? 0 : 2)}`;
  return `${sg}$${f(a, 4)}`;
}
/** SOL amount -> USD string (falls back to SOL if the price is unknown) */
export const solToUsd = (sol, sign = false) => (market.solUsd ? fmtUsd(sol * market.solUsd, sign) : `${sol?.toFixed?.(2) ?? '–'} SOL`);
