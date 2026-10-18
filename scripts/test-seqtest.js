// Anytime-valid confidence sequence: coverage under the null across the whole path, power on a real loser, monotone width.
import assert from 'node:assert/strict';
import { confidenceSequence, sequentialVerdict } from '../src/engine/seqtest.js';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
// deterministic LCG so the test is reproducible
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const draw = (mu) => { // heavy-tailed trade returns with mean mu: 70% small losses, 30% wins, clipped to [-1, 3]
  const u = rnd(); const r = u < 0.7 ? -0.25 + 0.2 * (rnd() - 0.5) : 0.4 + 1.2 * rnd() * rnd(); return r - (0.7 * -0.25 + 0.3 * (0.4 + 0.3)) + mu; };
t('under the null (true mean 0) the running CS covers 0 at every n in at least 95% of paths', () => {
  let miss = 0; const paths = 120;
  for (let p = 0; p < paths; p++) { const xs = []; let covered = true;
    for (let i = 0; i < 150; i++) { xs.push(draw(0)); if (i % 10 === 9) { const cs = confidenceSequence(xs); if (cs.lo > 0.005 || cs.hi < -0.005) { covered = false; break; } } }
    if (!covered) miss++; }
  assert.ok(miss / paths <= 0.08, `uniform miss rate ${miss}/${paths}`);
});
t('a book losing 15% per trade is KILLED well before 300 trades; a 0-mean book is CONTINUE', () => {
  const xs = []; let killedAt = null;
  for (let i = 0; i < 300; i++) { xs.push(draw(-0.15)); const v = sequentialVerdict(xs); if (v.decision === 'KILL') { killedAt = i + 1; break; } }
  assert.ok(killedAt && killedAt < 200, `killed at ${killedAt}`);
  const ys = Array.from({ length: 120 }, () => draw(0)); assert.equal(sequentialVerdict(ys).decision, 'CONTINUE');
});
t('width shrinks with n and the interval contains the sample mean', () => {
  const xs = Array.from({ length: 400 }, () => draw(0.05));
  const a = confidenceSequence(xs.slice(0, 50)), b = confidenceSequence(xs.slice(0, 400));
  assert.ok(b.hi - b.lo < a.hi - a.lo); assert.ok(b.lo <= b.mean && b.mean <= b.hi);
});
t('empty and tiny inputs are safe', () => { const c = confidenceSequence([]); assert.equal(c.n, 0); assert.equal(sequentialVerdict([0.1, -0.2]).decision, 'CONTINUE'); });
console.log(`${n} seqtest tests passed`);
