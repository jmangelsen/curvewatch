// Edge Lab pass-logic tests (pure statistics, no database).
import assert from 'node:assert/strict';
import { evaluate, invNorm, zFamily, netOf, roundTrip } from '../src/edgelab/stats.js';
import { HYPOTHESES, HORIZONS, PASS_BAR } from '../src/edgelab/hypotheses.js';

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', e.message); } };
// deterministic pseudo-random
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => { const u = Math.max(rnd(), 1e-9), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const DAY = 86400000;
// spread over ~5 days by default so the span check holds unless a test says otherwise
const rows = (n, mu, sd, spanMs = 5 * DAY) => Array.from({ length: n }, (_, i) => ({ ts: Math.round((i / Math.max(1, n - 1)) * spanMs), net: mu + sd * gauss() }));

test('invNorm matches known quantiles', () => {
  assert.ok(Math.abs(invNorm(0.975) - 1.95996) < 1e-4);
  assert.ok(Math.abs(invNorm(0.99) - 2.32635) < 1e-4);
  assert.ok(Math.abs(invNorm(0.5)) < 1e-9);
});
test('Bonferroni z grows with the number of tests', () => {
  assert.ok(Math.abs(zFamily(1) - 2.32635) < 1e-4);
  assert.ok(zFamily(90) > 3.5 && zFamily(90) < 3.9, `z(90)=${zFamily(90)}`);
});
test('round-trip cost and net return', () => {
  assert.ok(Math.abs(roundTrip(1.25, 3) - 0.0819) < 0.001);
  assert.ok(Math.abs(netOf(10, 0.1) - (-1)) < 1e-9);
});
test('under 300 tokens is COLLECTING even when strongly positive', () => {
  assert.equal(evaluate(rows(299, 20, 5), { m: 1, universe: rows(500, 0, 5) }).status, 'COLLECTING');
});
test('clear edge on 400 tokens PASSES every check', () => {
  const e = evaluate(rows(400, 10, 10), { m: 90, universe: rows(2000, -1, 10) });
  assert.equal(e.status, 'PASS', JSON.stringify(e.checks));
  assert.ok(Object.values(e.checks).every((x) => x === true));
});
test('negative mean on 300+ tokens FAILS', () => {
  assert.equal(evaluate(rows(400, -3, 10), { m: 90, universe: rows(2000, -1, 10) }).status, 'FAIL');
});
test('positive but too noisy for the corrected bound is CANDIDATE, not PASS', () => {
  const e = evaluate(rows(400, 3, 40), { m: 90, universe: rows(2000, 0, 40) });
  assert.equal(e.status, 'CANDIDATE'); assert.equal(e.checks.margin, false);
});
test('one moonshot carrying the average fails the robust check', () => {
  const r = rows(400, -2, 1); r[200].net = 5000; // +5000% outlier
  const e = evaluate(r, { m: 1, universe: rows(2000, -2, 1) });
  assert.ok(e.meanPct > 0); assert.equal(e.checks.robust, false); assert.notEqual(e.status, 'PASS');
});
test('an edge only in the first half fails the halves check', () => {
  const r = [...rows(200, 15, 5, 2 * DAY), ...rows(200, -5, 5, 2 * DAY).map((x) => ({ ...x, ts: x.ts + 3 * DAY }))];
  const e = evaluate(r, { m: 1, universe: rows(2000, -5, 5) });
  assert.equal(e.checks.halves, false); assert.notEqual(e.status, 'PASS');
});
test('a rising market (universe also positive) fails the universe check', () => {
  const e = evaluate(rows(400, 8, 5), { m: 1, universe: rows(4000, 8, 5) });
  assert.equal(e.checks.universe, false); assert.equal(e.status, 'CANDIDATE');
});
test('300+ tokens from a single hour cannot pass (span check)', () => {
  const e = evaluate(rows(400, 10, 10, 3600000), { m: 1, universe: rows(2000, -1, 10, 3600000) });
  assert.equal(e.checks.span, false); assert.equal(e.status, 'CANDIDATE');
});
test('reference hypotheses can never PASS', () => {
  assert.notEqual(evaluate(rows(400, 10, 5), { m: 1, universe: rows(400, 0, 5), reference: true }).status, 'PASS');
});
test('registry: unique ids, sane thresholds, pass bar is 300 tokens', () => {
  assert.equal(new Set(HYPOTHESES.map((h) => h.id)).size, HYPOTHESES.length);
  assert.equal(PASS_BAR.minTokens, 300);
  for (const z of HORIZONS) assert.ok(z.exit > z.entry);
  const f = { smartBuyers: 2, bundlePct: 0, flow60Sol: 1, progressPct: 5, uniqueBuyers: 12, tinyBuyShare: 0.1, repeatTradeShare: 0.1, mcapSol: 50 };
  for (const h of HYPOTHESES) assert.equal(typeof h.test(f, { score: 70, mcap: 50 }), 'boolean', h.id);
});

console.log(`\n${fail ? fail + ' failed, ' : 'all '}${pass} passed`);
process.exit(fail ? 1 : 0);
