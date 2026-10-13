// Post-graduation price checks via DexScreener's free API (tokens/v1, up to 30 addresses per call).
import { logger } from '../log.js';
const log = logger('dex');
export async function dexMcaps(mints) {
  const out = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pairs = await r.json();
      for (const p of pairs || []) {
        if (p?.quoteToken?.symbol !== 'SOL' && p?.quoteToken?.address !== 'So11111111111111111111111111111111111111112') continue;
        const m = Number(p.priceNative) * 1e9;
        const mint = p.baseToken?.address;
        if (mint && Number.isFinite(m) && (!out.has(mint) || (p.liquidity?.usd || 0) > (out.get(mint).liq || 0))) out.set(mint, { mcap: m, liq: p.liquidity?.usd || 0 });
      }
    } catch (e) { log.warn('dex fetch failed', e.message); }
  }
  return out;
}
