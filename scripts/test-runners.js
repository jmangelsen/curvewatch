// Runner board: ranking is bounded and ordered sensibly, eligibility filters hold, picks freeze once per day, outcomes label.
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwrn-'));
process.env.RUNNER_PICK_HOUR = '0'; process.env.RUNNER_MIN_ELIGIBLE = '2'; process.env.RUNNER_PICKS = '3';
await import('../src/engine/graduates.js');
const { db } = await import('../src/db.js');
const { Runners, rankFeatures } = await import('../src/engine/runners.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const H = 3600000, now = Date.now();
const base = { volAccel: 1, txAccel: 1, buyRatio1h: 0.5, buyRatio5: 0.5, tx5: 10, vsMig: 1.5, fromPeak: 0.8, mcapUsd: 300000, liqUsd: 40000, liqTrend: 1, socials: 1, hasSite: false, hasProfile: true, c1h: 20, fdvLiq: 7 };
t('rank is bounded 0–100 and rewards demand, penalises paid boosts and vertical moves', () => {
  const a = rankFeatures(base), hot = rankFeatures({ ...base, volAccel: 4, buyRatio1h: 0.7 }), paid = rankFeatures(base, { boosts: 20 }), vert = rankFeatures({ ...base, c1h: 220 });
  for (const r of [a, hot, paid, vert]) assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(hot.score > a.score); assert.ok(paid.score < a.score); assert.ok(vert.score < a.score);
  assert.ok(hot.reasons.some((x) => /volume/.test(x))); assert.ok(paid.flags.some((x) => /boost/.test(x)));
});
const mk = (mint, over = {}) => ({ mint, symbol: mint.slice(0, 4), name: mint, addedAt: now - 4 * H, pairCreatedAt: now - 4 * H, migPrice: 0.0001, peakPrice: 0.0002, reject: null, creatorRugger: false, info: { boosts: 0 },
  last: { mcap: 300000, liq: 40000, price: 0.00015, v1h: 50000 }, features: { ...base }, score: 40, ...over });
const grads = { watch: new Map() };
grads.watch.set('AAAA1pump', mk('AAAA1pump', { features: { ...base, volAccel: 3, buyRatio1h: 0.68 } }));
grads.watch.set('BBBB2pump', mk('BBBB2pump'));
grads.watch.set('CCCC3pump', mk('CCCC3pump', { last: { mcap: 2000000, liq: 90000, price: 0.001, v1h: 10 } }));          // above ceiling
grads.watch.set('DDDD4pump', mk('DDDD4pump', { reject: 'thin pool' }));                                                   // graduate reject
grads.watch.set('EEEE5pump', mk('EEEE5pump', { pairCreatedAt: now - 12 * H, addedAt: now - 12 * H }));                     // too old
grads.watch.set('FFFF6pump', mk('FFFF6pump', { last: { mcap: 250000, liq: 9000, price: 0.0001, v1h: 100 } }));            // pool too small
const rn = new Runners({ grads });
t('eligibility filters: ceiling, rejects, age and pool size exclude; the rest rank with the strongest first', () => {
  const live = rn.build();
  assert.deepEqual(live.map((x) => x.mint), ['AAAA1pump', 'BBBB2pump']);
  assert.equal(rn.excluded['market cap above ceiling'], 1); assert.equal(rn.excluded['graduate reject'], 1); assert.equal(rn.excluded['older than window'], 1); assert.equal(rn.excluded['pool too small'], 1);
});
t('picks freeze once per day across four cuts, and never twice', () => {
  const o = rn.maybePick(); assert.ok(o); assert.equal(o.picks.length, 2);
  const rows = db.prepare('SELECT book, COUNT(*) c FROM runner_picks GROUP BY book').all();
  assert.deepEqual(rows.map((r) => r.book).sort(), ['mcap', 'random', 'rule', 'vol']); assert.ok(rows.every((r) => r.c === 2));
  assert.equal(rn.maybePick(), null);
});
t('outcomes label from later snapshots: a 2× then a $1.5M print counts, silence counts as a miss', () => {
  db.prepare('UPDATE runner_picks SET ts = ?').run(now - 49 * H);
  const ins = db.prepare('INSERT INTO grad_snapshots (mint, ts, price, mcap, liq) VALUES (?, ?, ?, ?, ?)');
  ins.run('AAAA1pump', now - 40 * H, 0.0003, 700000, 50000); ins.run('AAAA1pump', now - 20 * H, 0.0008, 1600000, 90000);
  rn.label();
  const a = db.prepare("SELECT * FROM runner_picks WHERE mint='AAAA1pump' AND book='rule'").get(), b = db.prepare("SELECT * FROM runner_picks WHERE mint='BBBB2pump' AND book='rule'").get();
  assert.equal(a.x2_24h, 1); assert.equal(a.hit_target, 1); assert.equal(a.labeled48, 1);
  assert.equal(b.x2_24h, 0); assert.equal(b.hit_target, 0); assert.equal(b.labeled48, 1);
  const sc = rn.scorecard(); assert.equal(sc.books.rule.hits, 1); assert.equal(sc.books.rule.scored48, 2); assert.equal(sc.books.rule.hitPct, 50);
});
console.log(`${n} runners tests passed`);
