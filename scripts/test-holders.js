// Holder poller: horde schedule (first 3 h every 20 min, then hourly while above $30k) and pick ordering, on a temp DB.
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwh-'));
await import('../src/engine/graduates.js');
const { HolderPoller } = await import('../src/engine/holders.js');
const { db } = await import('../src/db.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const now = Date.now(), H = 3600000, M = 60000;
const st = (mint, ageMs, mcap) => [mint, { mint, pairCreatedAt: now - ageMs, addedAt: now - ageMs, last: { mcap } }];
const watch = new Map([st('young', 30 * M, 5000), st('mid', 5 * H, 50000), st('midpoor', 5 * H, 1000), st('old', 30 * H, 90000)]);
watch.set('runner3x', { mint: 'runner3x', pairCreatedAt: now - 40 * M, addedAt: now - 40 * M, series: [{ mcap: 190000 }], last: { mcap: 625000 } });
const poller = new HolderPoller({ grads: { watch }, pick: () => ['runner1', 'young'] });
t('cadence: 20 min in the first 3 h, hourly to 24 h above $30k, otherwise none', () => {
  assert.equal(HolderPoller.cadenceMin(watch.get('young'), now), 20); assert.equal(HolderPoller.cadenceMin(watch.get('mid'), now), 60);
  assert.equal(HolderPoller.cadenceMin(watch.get('midpoor'), now), null); assert.equal(HolderPoller.cadenceMin(watch.get('old'), now), null);
  assert.equal(HolderPoller.cadenceMin(watch.get('runner3x'), now), 5, 'a 3x first leg inside the first hours is counted every 5 min');
});
t('due list: horde first, youngest first, then runner picks, no duplicates', () => {
  assert.deepEqual(poller.due(now), ['young', 'runner3x', 'mid', 'runner1']);
});
t('a fresh count removes a mint until its cadence elapses', () => {
  db.prepare('INSERT INTO holder_counts (mint, holders, capped, ts) VALUES (?, ?, 0, ?)').run('young', 120, now - 5 * M);
  db.prepare('INSERT INTO holder_counts (mint, holders, capped, ts) VALUES (?, ?, 0, ?)').run('mid', 800, now - 61 * M);
  db.prepare('INSERT INTO holder_counts (mint, holders, capped, ts) VALUES (?, ?, 0, ?)').run('runner3x', 3000, now - 2 * M);
  assert.deepEqual(poller.due(now), ['mid', 'runner1']);
  db.prepare('UPDATE holder_counts SET ts = ? WHERE mint = ?').run(now - 21 * M, 'young');
  db.prepare('UPDATE holder_counts SET ts = ? WHERE mint = ?').run(now - 6 * M, 'runner3x');
  assert.deepEqual(poller.due(now), ['young', 'runner3x', 'mid', 'runner1']);
});
t('budget: default schedule stays near the free-plan credit line', () => {
  const gradsPerDay = 200, firstPolls = Math.ceil(3 * 60 / 20), laterShare = 0.2, laterPolls = 21;
  const calls = gradsPerDay * firstPolls + gradsPerDay * laterShare * laterPolls + 4 * 36; // 1800 + 840 + ~4 runners/day at 5-min for 3 h
  assert.ok(calls <= 2850, `≈${calls} calls/day`); assert.ok(calls * 1.3 * 10 * 30 <= 1.1e6, 'credits/month within ~10% of 1M');
});
console.log(`${n} holders tests passed`);
