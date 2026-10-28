// Unpriced checkpoint book: score, one-shot decision, matched control, and kill-rule control.
// Main, capital, and the existing random book are not retargeted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-unpriced-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
let NOW = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => NOW;

const { config } = await import('../src/config.js');
const { db } = await import('../src/db.js');
const { scoreUnpriced, considerUnpriced, pickUnpricedControl } = await import('../src/engine/unpriced.js');
const paper = await import('../src/engine/paper.js');
const { CFG } = await import('../src/version.js');
const { Engine } = await import('../src/engine/engine.js');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };

function token(over = {}) {
  const createdAt = over.createdAt ?? NOW - 120_000;
  const trades = over.trades ?? [0, 1, 2, 3, 4].map((i) => ({ at: createdAt + 1000 * (i + 1), b: true, sol: 1, mcap: 30 }));
  return {
    mint: over.mint || 'U', symbol: 'U', createdAt, initialMcap: 30, mcap: over.mcap ?? 31, vsol: 38, vtok: 1e9,
    trades, lastScore: { reject: null, score: 10 }, lastFeatures: { netSol: over.netSol ?? 8, mcapSol: over.mcap ?? 31, ageSec: 120 },
    graduated: false, lite: false, ...over, createdAt, trades,
  };
}

test('flow with little extension scores at or above 60; an already-run price scores 0', () => {
  const quiet = scoreUnpriced(token(), { netSol: 8, mcapSol: 31 });
  assert.equal(quiet.reject, null);
  assert.ok(quiet.score >= 60, `expected >= 60, got ${quiet.score}`);
  assert.ok(quiet.features.flowPerExtension > 1);
  const ran = scoreUnpriced(token({ mcap: 80, trades: token().trades.concat([{ at: token().createdAt + 50_000, b: true, sol: 1, mcap: 70 }]) }), { netSol: 8, mcapSol: 80 });
  assert.ok(ran.reject);
  assert.equal(ran.score, 0);
  const thin = scoreUnpriced(token(), { netSol: 0.2, mcapSol: 31 });
  assert.match(thin.reject, /thin flow/);
});

test('checkpoint decision fires once, skips rejects and late tokens, and does not mark a control as taken', () => {
  const t = token();
  const yes = considerUnpriced(t, { age: 120, rejected: false, features: { netSol: 8, mcapSol: 31 }, now: NOW });
  assert.equal(yes.enter, true);
  assert.equal(t.unpricedTaken, true);
  const again = considerUnpriced(t, { age: 125, rejected: false, features: { netSol: 8, mcapSol: 31 }, now: NOW });
  assert.equal(again.acted, false);
  const rejected = token({ mint: 'R' });
  const no = considerUnpriced(rejected, { age: 120, rejected: true, features: { netSol: 8, mcapSol: 31 }, now: NOW });
  assert.equal(no.enter, undefined);
  assert.equal(no.skipped, 'rejected');
  assert.notEqual(rejected.unpricedTaken, true);
  const late = token({ mint: 'L' });
  const skipped = considerUnpriced(late, { age: 120 + config.strategies.unpriced.matchWindowSec + 5, rejected: false, now: NOW });
  assert.equal(skipped.skipped, 'late');
  assert.ok(late.unpricedAt);
});

test('control pool is the checkpoint window, excluding taken, rejected, and young tokens', () => {
  const sig = token({ mint: 'SIG', unpricedTaken: true });
  const peer = token({ mint: 'PEER', createdAt: NOW - 125_000 });
  const young = token({ mint: 'YOUNG', createdAt: NOW - 10_000 });
  const hard = token({ mint: 'HARD', rejectedHard: { reason: 'bundle' }, createdAt: NOW - 125_000 });
  const picked = pickUnpricedControl([sig, peer, young, hard], sig, NOW);
  assert.equal(picked, peer);
  peer.unpricedCtlAt = NOW;
  assert.equal(pickUnpricedControl([sig, peer], sig, NOW), null);
});

test('an unpriced entry does not open Main or capital', () => {
  const t = { mint: 'UNPRICEDMINT'.padEnd(44, 'u'), symbol: 'UP', vsol: 38, vtok: 1e9, lastTradeAt: NOW, graduated: false, lastFeatures: {}, mcap: 40 };
  paper.scheduleEntry(t, 7, { book: 'unpriced', score: 70, features: { netSol: 8 } });
  NOW += (paper.STRATEGIES.unpriced.delaySec + 1) * 1000;
  paper.tick(() => t);
  const rows = db.prepare(`SELECT book, status FROM paper_trades WHERE mint = ?`).all(t.mint);
  assert.deepEqual(rows.map((r) => r.book).sort(), ['unpriced']);
  assert.equal(rows[0].status, 'open');
  t.graduated = true; paper.onTrade(t.mint);
});

test('kill rule for unpriced uses unpricedctl; main still uses random', () => {
  const ins = db.prepare(`INSERT INTO paper_trades (mint,symbol,status,entry_ts,entry_mcap,size_sol,tokens,tokens_left,peak_value,exit_ts,exit_reason,pnl_sol,pnl_pct,events,book,cfg,gap,gated)
    VALUES (?,?, 'closed', 1, 1, 0.2, 1, 0, 0.2, ?, 'test', ?, ?, '[]', ?, ?, 0, 0)`);
  const good = Array.from({ length: 80 }, (_, i) => (i % 3 === 0 ? -15 : 22));
  const bad = Array.from({ length: 60 }, () => -20);
  const put = (book, vals) => vals.forEach((p, i) => ins.run(`${book}${i}`, 'T', NOW + i, (p / 100) * 0.2, p, book, CFG));
  put('unpriced', good);
  put('unpricedctl', bad);
  put('random', good);
  put('main', good);
  const u = paper.killRule('unpriced');
  assert.equal(u.status, 'PASS', JSON.stringify(u.checks));
  assert.ok(u.vsControl && u.vsControl.controlAvg < 0, 'control should be the losing checkpoint book');
  const m = paper.killRule('main');
  assert.equal(m.status, 'MARGINAL');
  assert.equal(paper.killRule('random').checks.control, null);
  assert.equal(paper.killRule('unpricedctl').checks.control, null);
});

test('engine scores a non-rejected token at 120s into unpriced and a peer into unpricedctl, not random', () => {
  const engine = new Engine({ pumpportal: null });
  const born = NOW - 120_000;
  const mk = (mint, mcapTrades) => {
    engine.onCreate({ mint, name: mint, symbol: mint.slice(0, 4), creator: 'C'.padEnd(44, 'c'), recvAt: born, slot: 10, quoteIsSol: true, vsol: 30, vtok: 1.073e9 });
    const t = engine.getToken(mint);
    mcapTrades(t);
    return t;
  };
  const early = (t, sol) => {
    for (let i = 0; i < 5; i++) t.applyTrade({ sig: `${t.mint}-${i}`, wallet: `W${i}${t.mint}`.slice(0, 40), isBuy: true, sol, tok: 1000, vsol: t.vsol, vtok: t.vtok, recvAt: born + 1000 * (i + 1), slot: 20 + i });
  };
  const a = 'A'.padEnd(44, 'a');
  const b = 'B'.padEnd(44, 'b');
  // A: flow with a modest extension. B: same early tape, then a price that has already run, so it is a control not an entry.
  mk(a, (t) => { t.vsol = 38; early(t, 1); });
  mk(b, (t) => { t.vsol = 31; early(t, 0.05); t.vsol = 200; });
  engine.evaluate();
  NOW += (config.paper.entryDelaySec + 1) * 1000;
  paper.tick((m) => engine.getToken(m));
  const books = db.prepare(`SELECT book FROM paper_trades WHERE mint IN (?, ?)`).all(a, b);
  const names = books.map((r) => r.book);
  assert.ok(names.includes('unpriced'), `missing unpriced: ${names.join(',')}`);
  assert.ok(names.includes('unpricedctl'), `missing control: ${names.join(',')}`);
  assert.ok(!names.includes('random'), `random book moved: ${names.join(',')}`);
  assert.ok(!names.includes('capital'), `capital book moved: ${names.join(',')}`);
  const taken = engine.getToken(a);
  assert.equal(engine.getToken(b).unpricedCtlAt != null || engine.getToken(a).unpricedCtlAt != null, true);
  assert.equal(taken.unpricedTaken, true);
});

Date.now = realNow;
db.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${n} unpriced tests passed`);
process.exit(0);
