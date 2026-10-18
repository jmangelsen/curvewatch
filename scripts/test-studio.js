// Curve Studio: cohort exclusions, Wilson intervals, decile ranking and the time-split rule tester (temp DB, no network).
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwst-'));
const { db } = await import('../src/db.js');
await import('../src/engine/graduates.js'); // creates the grad_* tables, as the main process does before the studio worker starts
const S = await import('../src/studio.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('wilson interval brackets the point estimate and shrinks with n', () => {
  const a = S.wilson(5, 50), b = S.wilson(50, 500);
  assert.ok(a.lo < 10 && a.hi > 10 && b.lo < 10 && b.hi > 10); assert.ok(b.hi - b.lo < a.hi - a.lo); assert.deepEqual(S.wilson(0, 0), { lo: null, hi: null });
});

// synthetic field: 400 tokens, 40 graduate; graduates have high flow60Sol; 20 non-SOL tokens that "graduate" must be excluded; 10 gap tokens excluded
const now = Date.now();
const insTok = db.prepare(`INSERT INTO tokens (mint,name,symbol,created_at,initial_mcap,finalized,graduated,graduated_at,gap) VALUES (?,?,?,?,?,?,?,?,?)`);
const insSnap = db.prepare(`INSERT INTO snapshots (mint,checkpoint,ts,mcap,score,reject,features,max_mcap_after,min_before_max,min_mcap_after,mcap_at_horizon,graduated_after) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
for (let i = 0; i < 400; i++) {
  const mint = `M${String(i).padStart(4, '0')}`, g = i % 10 === 0 ? 1 : 0, ca = now - (400 - i) * 60000 * 20;
  insTok.run(mint, `Tok ${i}`, `T${i}`, ca, 28, 1, g, g ? ca + 300000 : null, 0);
  for (const cp of [30, 60, 120, 180, 300, 600]) { const mcap = 28 * (g ? 1 + cp / 100 : 1 + (i % 7) / 50); const f = JSON.stringify({ flow60Sol: g ? 5 + (i % 5) : (i % 9) / 3, uniqueBuyers: g ? 30 : 5 + (i % 11), mcapSol: mcap }); insSnap.run(mint, cp, ca + cp * 1000, mcap, 50, null, f, g ? mcap * 3 : mcap * (1 + (i % 4) / 10), mcap, mcap, mcap, g); }
}
for (let i = 0; i < 20; i++) { const mint = `NS${i}`, ca = now - 3600000 * (i + 2); insTok.run(mint, 'NonSol', 'NS', ca, 28000, 1, 1, ca + 60000, 0); insSnap.run(mint, 60, ca + 60000, 28000, 0, 'non-SOL quote', null, 90000, 28000, 28000, 90000, 1); }
for (let i = 0; i < 10; i++) { const mint = `GAP${i}`, ca = now - 3600000 * (i + 2); insTok.run(mint, 'Gap', 'GP', ca, 28, 1, 1, ca + 60000, 1); insSnap.run(mint, 60, ca + 60000, 28, 50, null, '{"flow60Sol":9}', 90, 28, 28, 90, 1); }

t('curves: non-SOL and gap tokens are excluded, cohorts and bands are built', () => {
  const c = S.curves({ days: 30, lines: 50 });
  assert.equal(c.n, 400); assert.equal(c.cohorts.grad.n, 40); assert.equal(c.cohorts.non.n, 360);
  assert.ok(c.cohorts.grad.band[5].p50 > c.cohorts.non.band[5].p50, 'graduates sit above the field at 10 min');
  assert.equal(c.lines.grad.length, 40); assert.ok(c.lines.grad.every((l) => l.tGradSec === 300));
  assert.equal(c.rejectCost[1].rejectedGrads, 0); assert.equal(c.timeToGrad.n, 40); assert.equal(c.timeToGrad.p50, 5);
});
t('features: flow60Sol ranks first with a monotone decile profile; reject families include the pass group only', () => {
  const f = S.features({ cp: 60, days: 30 });
  assert.equal(f.n, 400); assert.equal(f.baseRatePct, 10);
  const fl = f.ranked.find((x) => x.feature === 'flow60Sol'); assert.ok(f.ranked.indexOf(fl) <= 1, 'planted feature ranks at the top'); assert.equal(fl.direction, 'higher is better'); assert.ok(fl.bestLift >= 5);
  assert.deepEqual(f.rejectFamilies.map((x) => x.family), ['(pass)']); assert.equal(f.gradsLostToRejectsPct, 0);
});
t('rule tester: the planted rule holds in both halves; an unrelated rule does not; bad input throws', () => {
  const r1 = S.testRule({ cp: 60, days: 30, feature: 'flow60Sol', op: 'gte', threshold: 5, outcome: 'grad' });
  assert.equal(r1.selected.n, 40); assert.equal(r1.selected.ratePct, 100); assert.equal(r1.lift, 10); assert.equal(r1.holdsUp, true); assert.equal(r1.halves.length, 2);
  assert.match(r1.snippet, /NOT applied/);
  const r2 = S.testRule({ cp: 60, days: 30, feature: 'uniqueBuyers', op: 'lte', threshold: 10, outcome: 'grad' });
  assert.equal(r2.selected.hits, 0); assert.equal(r2.holdsUp, false);
  assert.throws(() => S.testRule({ feature: 'nope', threshold: 1 }), /unknown feature/); assert.throws(() => S.testRule({ feature: 'flow60Sol', threshold: 'x' }), /threshold/);
  const r3 = S.testRule({ cp: 60, days: 30, feature: 'flow60Sol', op: 'gte', threshold: 5, outcome: 'x2' }); assert.equal(r3.selected.ratePct, 100, '2x outcome from max_mcap_after');
});
t('drills: every studio key returns a titled table', () => {
  for (const k of ['studio_grads:d30', 'studio_x2:d30', 'studio_field:d30', 'studio_ttg:d30', 'studio_rejects:60:d30', 'studio_feature:flow60Sol:60:grad:d30', 'studio_rule:flow60Sol:gte:5:60:grad:d30', 'studio_post:runner:d30']) {
    const d = S.drill({ key: k }); assert.ok(d && d.title && Array.isArray(d.tables), k);
  }
  assert.equal(S.drill({ key: 'studio_nope' }), null);
});
console.log(`${n} studio tests passed`);
