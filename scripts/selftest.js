#!/usr/bin/env node
// Offline self-test: decoder against a real captured mainnet TradeEvent, curve math, scorer sanity.
import assert from 'node:assert/strict';
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/curvewatch-selftest';
const { decodeTrade, DISC } = await import('../src/sources/decode.js');
const { curveBuy, curveSell, mcapOf, progressOf } = await import('../src/util.js');
const { score } = await import('../src/engine/score.js');

const sample = 'vdt/007mYe5MBgeLuqPapzvX2GTVMgRO3mEXTqZGzTLWbYIru8g4b3BrvwIAAAAA49Lq5TcAAAABbaCQjs3x3Mo0Pyx9Fvbg1CMWvZimKvmjSx+pC3TxU6hAoc5qAAAAAB0kc08SAAAAuY/UkEZ0AQAdeE9TCwAAALn3wUS1dQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfAAAAAAAAALiuBgAAAAAATKUtBBQXYy0buIhYCr9Onn1PXnhS1K3v0Fb3rHaDiG0eAAAAAAAAADocAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgAAAGJ1eV9leGFjdF9xdW90ZV9pbgAAAAAAAAAAAAAAAAAAAAAAiBMAAAAAAABcVwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHBrvwIAAAAAHSRzTxIAAAAdeE9TCwAAAAAAAAAAAAAAAAAAAAAAAACSBDcFAAAAAA==';
const buf = Buffer.from(sample, 'base64');
assert.equal(buf.subarray(0, 8).toString('hex'), DISC.trade);
const t = decodeTrade(buf);
assert.equal(t.mint, '67mKRAh4fKZdsmHUsMVXgCdPxYrZMVzZu7N53fCupump');
assert.equal(t.isBuy, true);
assert.ok(Math.abs(t.vsol - 78.642357277) < 1e-6);
assert.equal(t.creator, '6AC4ugGNiZnNUBS5cFPXX6dQf8et6gypLSKTtjzdoziG');
console.log('decode ok   ', t.mint, `${t.sol.toFixed(4)} SOL`, `mcap ${mcapOf(t.vsol, t.vtok).toFixed(1)} SOL`);

assert.ok(Math.abs(mcapOf(30, 1_073_000_000) - 27.96) < 0.01, 'launch mcap ~27.96 SOL');
const tok = curveBuy(30, 1_073_000_000, 1, 1.25);
const back = curveSell(30 + 0.9875, 1_073_000_000 - tok, tok, 1.25);
assert.ok(back < 1 && back > 0.97, 'round trip loses ~2.5% to fees');
assert.equal(progressOf(0), 1); assert.equal(progressOf(793_100_000), 0);
console.log('curve ok    ', `1 SOL round-trip returns ${back.toFixed(4)} SOL`);

const good = { quoteOk: true, mayhem: false, creatorLaunches: 0, creatorGraduations: 0, creatorRugs: 0, creatorSoldPct: 0, creatorSold: false, bundlePct: 3, bundleWallets: 1, top10Pct: 20, drawdownPct: 5, progressPct: 35, repeatTradeShare: 0.05, netSolPerMin: 9, flow60Sol: 7, buyersPerMin: 40, buySellRatio: 3, hasTelegram: true, hasTwitter: true, hasWebsite: false, smartBuyers: 1, initialBuySol: 1, tinyBuyShare: 0.1, secSinceTrade: 2, uniqueBuyers: 60, netSol: 20 };
const g = score(good); assert.ok(g.score > 85 && !g.reject, `strong token scores high (${g.score})`);
const b = score({ ...good, bundlePct: 70, bundleWallets: 6 }); assert.ok(b.reject?.startsWith('bundled'));
const s = score({ ...good, creatorLaunches: 12, creatorGraduations: 0 }); assert.ok(s.reject?.startsWith('serial'));
console.log('score ok    ', `strong=${g.score}`, `bundled→${b.reject}`, `serial→${s.reject}`);
console.log('\nall self-tests passed');
