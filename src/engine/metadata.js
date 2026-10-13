// Fetch token metadata JSON (from the create event's URI) to detect Telegram / X / website links.
import { logger } from '../log.js';
const log = logger('meta');
const queue = [];
let active = 0;
const MAX_ACTIVE = 8, MAX_QUEUE = 800, TIMEOUT = 5000;
export const metaStats = { ok: 0, fail: 0, dropped: 0 };

// ipfs.io / dweb.link now return 429 for gateway traffic (Oct 2026); Pump.fun's Pinata gateway is fast.
const GATEWAYS = ['https://pump.mypinata.cloud/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];
function candidates(uri) {
  const cid = uri.startsWith('ipfs://') ? uri.slice(7) : (uri.match(/\/ipfs\/([^?#]+)/) || [])[1] || (/^(Qm[1-9A-Za-z]{44}|baf[a-z0-9]{50,})$/.test(uri) ? uri : null);
  if (cid) return GATEWAYS.map((g) => g + cid);
  return [uri];
}
const pick = (j, keys) => { for (const k of keys) { const v = j?.[k] ?? j?.extensions?.[k] ?? j?.properties?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };

export function enqueueMetadata(token) {
  if (!token.uri) { token.social.fetched = true; return; }
  if (queue.length >= MAX_QUEUE) { metaStats.dropped++; return; }
  queue.push(token); pump();
}
function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const t = queue.shift(); active++;
    fetchOne(t).finally(() => { active--; pump(); });
  }
}
async function fetchOne(t) {
  try {
    let j = null, lastErr = null;
    for (const url of candidates(t.uri)) {
      if (!/^https?:/.test(url)) break;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        j = await res.json(); break;
      } catch (e) { lastErr = e; }
    }
    if (!j) throw lastErr || new Error('no metadata');
    const tw = pick(j, ['twitter', 'x']);
    const tg = pick(j, ['telegram', 'tg']);
    const web = pick(j, ['website', 'web', 'site']);
    t.social = { twitter: /x\.com|twitter\.com/i.test(tw) || (!!tw && !/^https?:/.test(tw)), telegram: /t\.me|telegram/i.test(tg) || (!!tg && !/^https?:/.test(tg)), website: /^https?:\/\//i.test(web), fetched: true, links: { twitter: tw, telegram: tg, website: web } };
    t.onSocial?.(t);
    metaStats.ok++;
  } catch (e) { metaStats.fail++; t.social.fetched = true; log.debug(`meta fail ${t.mint}`, e.message); }
}
export const metaQueueLen = () => queue.length;
