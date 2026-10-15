// Create-event decoder: quote mint detection (SOL = zero key) on synthetic buffers shaped like the live Oct 2026 layout.
import assert from 'node:assert/strict';
import bs58 from 'bs58';
const { decodeCreate, DISC } = await import('../src/sources/decode.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const str = (s) => { const b = Buffer.from(s); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const pk = (s) => Buffer.from(bs58.decode(s));
const MINT = 'HbHDzkme7cAnTAHNZfVzTwR9wzj6BsxU3nRksMxjpump', USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', ZERO = '11111111111111111111111111111111';
const build = (quote, vsolLamports) => Buffer.concat([Buffer.from(DISC.create, 'hex'), str('Doge Pepe'), str('DOPE'), str('https://x'), pk(MINT), pk(MINT), pk(MINT), pk(MINT),
  u64(1760000000), u64(1073000000000000n), u64(vsolLamports), u64(793100000000000n), u64(1000000000000000n), pk('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), Buffer.from([0, 0]), pk(quote), u64(vsolLamports), Buffer.alloc(10)]);
t('SOL-quoted create: zero quote key -> quoteIsSol true, even with non-standard reserves', () => {
  const c = decodeCreate(build(ZERO, 36900000000n));
  assert.equal(c.quoteIsSol, true); assert.equal(c.quoteMint, null); assert.equal(c.vsol, 36.9); assert.equal(c.initialVQuote, 36900000000);
});
t('USDC-quoted create: quote mint decoded, quoteIsSol false', () => {
  const c = decodeCreate(build(USDC, 4292000000n));
  assert.equal(c.quoteIsSol, false); assert.equal(c.quoteMint, USDC);
});
t('older short layout: quote unknown (null), nothing thrown', () => {
  const short = build(ZERO, 30000000000n).subarray(0, 8 + 4 + 9 + 4 + 4 + 4 + 9 + 32 * 4 + 8 * 5);
  const c = decodeCreate(short); assert.equal(c.quoteIsSol, null); assert.equal(c.vsol, 30);
});
console.log(`${n} decode tests passed`);
