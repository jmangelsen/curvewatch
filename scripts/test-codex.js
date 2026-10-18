// Trading codex: live view, past-moment reconstruction, tape, series and day summary over a scratch database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-codex-'));
process.env.LOG_LEVEL = 'error';
const { db } = await import('../src/db.js');
const paper = await import('../src/engine/paper.js');
await import('../src/engine/graduates.js'); // creates the graduate tables
const { makeCodex } = await import('../src/codex.js');

const now = Date.now(), H = 3600000;
const ins = db.prepare(`INSERT INTO paper_trades (mint, symbol, status, entry_ts, entry_mcap, size_sol, tokens, tokens_left, realized_sol, exit_ts, exit_reason, pnl_pct, pnl_sol, events, book, gated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`);
// closed trade: opened 3 h ago, exited 2 h ago
ins.run('MintA', 'AAA', 'closed', now - 3 * H, 100, 0.2, 1, 0, 0, now - 2 * H, 'stop', -38.5, -0.077, '[]', 'main');
// still-open trade opened 30 min ago on a different coin
ins.run('MintB', 'BBB', 'open', now - 0.5 * H, 50, 0.2, 1, 1, 0, null, null, null, null, '[]', 'main');
db.prepare('INSERT INTO trades (mint, ts, is_buy, sol, tok, vsol, vtok) VALUES (?,?,?,?,?,?,?)').run('MintA', now - 2.5 * H, 1, 1, 1, 60, 1e9 * 0.5); // mcap ≈ 60 / (0.5e9) * 1e9 = 120 (×1.2 vs entry)
db.prepare("INSERT INTO tokens (mint, name, symbol, created_at, image) VALUES ('MintA', 'Alpha', 'AAA', ?, 'ipfs://cidA')").run(now - 4 * H);

const fakeToken = { mint: 'MintB', name: 'Beta', mcap: 55, progress: 0.4, buyers: new Set(['w1', 'w2']), holders: new Map([['w1', 1]]), lastTradeAt: now - 1000, lastScore: { score: 80 }, image: null };
const engine = { getToken: (m) => (m === 'MintB' ? fakeToken : null), tokens: new Map([['MintB', fakeToken]]) };
const grads = { open: new Map(), watch: new Map(), valueSol: () => 0 };
const codex = makeCodex({ engine, grads });

// live: paper.js has no in-memory position for MintB (we inserted straight into the DB), so the live view is driven by paper.openPositions
const live = codex.now();
assert.equal(live.mode, 'live');
assert.ok(Array.isArray(live.positions));
assert.ok(live.tape.some((e) => e.kind === 'exit' && e.symbol === 'AAA' && e.pnlPct === -38.5), 'tape carries the exit');
assert.ok(live.tape.some((e) => e.kind === 'entry' && e.symbol === 'BBB'), 'tape carries the open entry');
assert.equal(live.series.counts.length, 288);
assert.ok(live.series.timeInMarketPct > 5 && live.series.timeInMarketPct < 8, `time in market ≈ 1.5 h of 24 h, got ${live.series.timeInMarketPct}`);
assert.equal(live.day.trades >= 0, true);
assert.ok(live.bookMeta.main && live.bookMeta.fixed, 'book metadata covers curve and graduate books');

// a moment 2.5 h ago: AAA was open, BBB was not; the mark is rebuilt from the recorded trade
const at = codex.at(now - 2.5 * H + 1000);
assert.equal(at.mode, 'moment');
assert.equal(at.positions.length, 1);
const a = at.positions[0];
assert.equal(a.symbol, 'AAA');
assert.equal(a.approx, true);
assert.equal(a.image, 'ipfs://cidA');
assert.ok(a.markPct > 15 && a.markPct < 20, `approx mark ≈ +20% less fees, got ${a.markPct}`);
assert.equal(a.outcome.reason, 'stop');

// a moment 10 min ago: only BBB
const at2 = codex.at(now - 10 * 60000);
assert.deepEqual(at2.positions.map((p) => p.symbol), ['BBB']);
assert.equal(at2.positions[0].markPct, null, 'no recorded trade before that instant means no mark, not a fake one');

// a moment 5 h ago: flat
assert.equal(codex.at(now - 5 * H).inTrade, false);
assert.equal(typeof paper.STRATEGIES.main.label, 'string');
console.log('5 codex tests passed');
