// Unit tests for the smart-wallet tracker math (in-memory DB).
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwtr-'));
const { wilsonLo, scorePositions, refreshTracked, trackerView } = await import('../src/engine/smartTracker.js');
const { db } = await import('../src/db.js');
const { recordReject, isGradRejected, categoryOf, initRejects } = await import('../src/engine/rejects.js');
initRejects();
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
t('wilson: 3/3 ranks below 40/50', () => { assert.ok(wilsonLo(3, 3) < wilsonLo(40, 50)); assert.equal(wilsonLo(0, 0), 0); assert.ok(Math.abs(wilsonLo(50, 100) - 0.4038) < 0.001); });
const tok = (mint, mcap, pos, peak = mcap) => ({ mint, symbol: mint, mcap, peakMcap: peak, peakAt: 2, graduated: false, pos: new Map(pos) });
t('position return = (sells + held at label price) / buys - 1', () => {
  // bought 1 SOL of 10M tokens at mcap 100 SOL; sold half for 1 SOL; label mcap 200 -> remaining 5M tokens worth 1 SOL -> value 2 -> +100%
  scorePositions(tok('A', 200, [['w1', { b: 1, bt: 1e7, s: 1, st: 5e6, at: 1, m: 100 }]]));
  const r = db.prepare("SELECT * FROM wallet_perf2 WHERE wallet='w1'").get();
  assert.equal(r.positions, 1); assert.equal(r.hits, 1); assert.ok(Math.abs(r.sum_ret - 1) < 1e-9);
});
t('dust positions ignored and a +40% position is not a hit', () => {
  scorePositions(tok('B', 140, [['w1', { b: 1, bt: 1e7, s: 0, st: 0, at: 1, m: 100 }], ['dust', { b: 0.001, bt: 1e4, s: 0, st: 0, at: 1, m: 100 }]]));
  const r = db.prepare("SELECT * FROM wallet_perf2 WHERE wallet='w1'").get();
  assert.equal(r.positions, 2); assert.equal(r.hits, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM wallet_perf2 WHERE wallet='dust'").get().c, 0);
});
t('realized wallets need 8+ positions and >65% hits', () => {
  for (let i = 0; i < 9; i++) scorePositions(tok('C' + i, i < 8 ? 300 : 50, [['w2', { b: 1, bt: 1e7, s: 0, st: 0, at: 1, m: 100 }]]));
  refreshTracked(); const v = trackerView();
  const w2 = v.wallets.find((w) => w.wallet === 'w2'); assert.ok(w2 && w2.basis === 'realized' && w2.k === 8 && w2.n === 9);
  assert.ok(!v.wallets.find((w) => w.wallet === 'w1')); // only 2 positions
});
t('rejects: categories, sticky first record, graduate set', () => {
  assert.equal(categoryOf('creator sold 100%'), 'creator sold'); assert.equal(categoryOf('-62% from peak'), 'drawdown from peak');
  assert.equal(categoryOf('liquidity $3.1k < $8k'), 'low liquidity'); assert.equal(categoryOf('thin pool (FDV 55× liquidity)'), 'thin pool');
  assert.equal(recordReject({ kind: 'curve', mint: 'R1', ts: 100, reason: 'bundled launch (40% of buys in first slots)' }), true);
  assert.equal(recordReject({ kind: 'curve', mint: 'R1', ts: 200, reason: 'creator sold 100%' }), false, 'first rejection wins');
  assert.equal(db.prepare("SELECT reason FROM rejects WHERE mint='R1'").get().reason.startsWith('bundled'), true);
  assert.equal(isGradRejected('G1'), false); recordReject({ kind: 'grad', mint: 'G1', reason: 'no trades in last 5 min' }); assert.equal(isGradRejected('G1'), true);
});
t('tracker view hides trades on rejected coins', () => {
  db.prepare('INSERT INTO smart_trades VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(Date.now(), 'w2', 'R1', 'R1', 1, 1, 1, 50, 's1', 1, 'realized');
  db.prepare('INSERT INTO smart_trades VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(Date.now(), 'w2', 'OK1', 'OK1', 1, 1, 1, 50, 's2', 1, 'realized');
  const v = trackerView(); assert.deepEqual(v.recent.map((r) => r.mint), ['OK1']);
});
console.log(`${n} tracker tests passed`);
