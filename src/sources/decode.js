// Decoders for Pump.fun program (6EF8...F6P) Anchor events emitted in transaction logs as
// "Program data: <base64>". Layouts verified against live mainnet data on 2026-10-13.
// Only the leading, stable fields are decoded; newer trailing fields are ignored on purpose so that
// protocol upgrades that append fields do not break ingestion.
import crypto from 'node:crypto';
import bs58 from 'bs58';

const disc = (name) => crypto.createHash('sha256').update(`event:${name}`).digest().subarray(0, 8).toString('hex');
export const DISC = {
  trade: disc('TradeEvent'), // bddb7fd34ee661ee
  create: disc('CreateEvent'), // 1b72a94ddeeb6376
  complete: disc('CompleteEvent'),
};

class Reader {
  constructor(buf) { this.b = buf; this.o = 8; }
  need(n) { if (this.o + n > this.b.length) throw new Error('short buffer'); }
  pk() { this.need(32); const v = bs58.encode(this.b.subarray(this.o, this.o + 32)); this.o += 32; return v; }
  u64() { this.need(8); const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { this.need(8); const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  u8() { this.need(1); return this.b[this.o++]; }
  str() { this.need(4); const n = this.b.readUInt32LE(this.o); this.o += 4; if (n > 512) throw new Error('bad string'); this.need(n); const v = this.b.subarray(this.o, this.o + n).toString('utf8'); this.o += n; return v; }
}

const LAMPORTS = 1e9;
const TOKEN_UNIT = 1e6;

export function decodeTrade(buf) {
  const r = new Reader(buf);
  const mint = r.pk();
  const sol = Number(r.u64()) / LAMPORTS;
  const tok = Number(r.u64()) / TOKEN_UNIT;
  const isBuy = r.u8() === 1;
  const wallet = r.pk();
  const ts = Number(r.i64());
  const vsol = Number(r.u64()) / LAMPORTS;
  const vtok = Number(r.u64()) / TOKEN_UNIT;
  const rsol = Number(r.u64()) / LAMPORTS;
  const rtok = Number(r.u64()) / TOKEN_UNIT;
  let creator = null;
  try { r.pk(); r.u64(); r.u64(); creator = r.pk(); } catch { /* older layout */ }
  return { kind: 'trade', mint, sol, tok, isBuy, wallet, ts, vsol, vtok, rsol, rtok, creator };
}

export function decodeCreate(buf) {
  const r = new Reader(buf);
  const name = r.str();
  const symbol = r.str();
  const uri = r.str();
  const mint = r.pk();
  const bondingCurve = r.pk();
  const user = r.pk();
  let creator = user, ts = null, vtok = null, vsol = null, rtok = null, flags = null, quoteMint = null, quoteIsSol = null, initialVQuote = null;
  try {
    creator = r.pk();
    ts = Number(r.i64());
    vtok = Number(r.u64()) / TOKEN_UNIT;
    vsol = Number(r.u64()) / LAMPORTS;
    rtok = Number(r.u64()) / TOKEN_UNIT;
    // Appended by the 2025-26 upgrades: token_total_supply u64, token_program pubkey, two u8 flags, quote_mint pubkey
    // (Pubkey::default() for every SOL-quoted coin; USDC / custom-pair / pump-coin quotes carry the real mint), then
    // initial_virtual_quote_reserves u64 (exactly 30 SOL on SOL curves, which is how the offset was verified on live events,
    // Oct 15 2026). The flag bytes are NOT used as the mayhem flag: the first one is set on ~20% of launches while PumpPortal
    // reports ~5% in mayhem mode, so it is some other option. Mayhem keeps coming from PumpPortal only.
    r.u64(); r.pk(); flags = [r.u8(), r.u8()];
    const q = r.pk(); quoteIsSol = /^1+$/.test(q); quoteMint = quoteIsSol ? null : q;
    initialVQuote = Number(r.u64());
  } catch { /* older or shorter layout: quote unknown, decided from the first trade instead */ }
  return { kind: 'create', name, symbol, uri, mint, bondingCurve, creator, ts, vsol, vtok, rtok, flags, quoteMint, quoteIsSol, initialVQuote };
}

export function decodeComplete(buf) {
  const r = new Reader(buf);
  const user = r.pk();
  const mint = r.pk();
  return { kind: 'complete', user, mint };
}

/** Parse every Pump.fun event out of one logsNotification. */
export function eventsFromLogs(logs) {
  const out = [];
  for (const l of logs) {
    if (!l.startsWith('Program data: ')) continue;
    let buf;
    try { buf = Buffer.from(l.slice(14), 'base64'); } catch { continue; }
    if (buf.length < 8) continue;
    const h = buf.subarray(0, 8).toString('hex');
    try {
      if (h === DISC.trade) out.push(decodeTrade(buf));
      else if (h === DISC.create) out.push(decodeCreate(buf));
      else if (h === DISC.complete) out.push(decodeComplete(buf));
    } catch { /* malformed / unknown layout: skip */ }
  }
  return out;
}
