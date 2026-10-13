#!/usr/bin/env node
// Backtest on YOUR labeled snapshots. Answers: at checkpoint X, if I acted on score >= T,
// what happened next (path-aware: a stop that would trigger before the high counts as a stop)?
// Usage: node scripts/backtest.js [checkpointSec=120] [stopPct=40] [entryHaircutPct=8]
//   entryHaircutPct models delay + slippage + 1.25% fee: entry price = snapshot mcap * (1 + haircut).
import Database from 'better-sqlite3';
import path from 'node:path';
const dbPath = path.resolve(process.env.DATA_DIR || './data', 'curvewatch.db');
const db = new Database(dbPath, { readonly: true });
const cp = Number(process.argv[2] || 120), stop = Number(process.argv[3] || 40) / 100, hair = Number(process.argv[4] || 8) / 100;
const FEE = 0.0125;

const rows = db.prepare(`SELECT * FROM snapshots WHERE checkpoint=? AND max_mcap_after IS NOT NULL AND mcap>0`).all(cp)
  .map((r) => ({ ...r, f: JSON.parse(r.features || '{}') }));
if (!rows.length) { console.log(`No labeled snapshots at ${cp}s yet. Labels appear 1h after launch; let it run.`); process.exit(0); }

// Simple path-aware exit model: take 50% at 2x, rest exits at min(max, horizon) w/ trailing approximation.
function sim(r) {
  const entry = r.mcap * (1 + hair);
  const maxM = r.max_mcap_after / entry, minBefore = r.min_before_max / entry, end = r.mcap_at_horizon / entry;
  if (minBefore <= 1 - stop) return (1 - stop) * (1 - FEE) - 1; // stopped before the high
  let out = 0;
  if (maxM >= 2) { out += 0.5 * 2 * (1 - FEE); out += 0.5 * Math.max(1 - stop, Math.max(end, maxM * 0.65)) * (1 - FEE); }
  else out = Math.max(1 - stop, Math.min(end, maxM * 0.65 > 1 ? maxM * 0.65 : end)) * (1 - FEE);
  return out - 1;
}

const pct = (x) => (x == null ? '   –  ' : `${x.toFixed(1).padStart(5)}%`);
console.log(`\nCurvewatch backtest · checkpoint ${cp}s · ${rows.length} labeled tokens · stop ${stop * 100}% · entry haircut ${hair * 100}%\n`);
console.log('score≥  alerts  per-day   hit2x   hit5x   grad   avgPnL  medPnL   winRate');
const days = Math.max(1, (Math.max(...rows.map((r) => r.ts)) - Math.min(...rows.map((r) => r.ts))) / 86400000);
for (let T = 30; T <= 95; T += 5) {
  const s = rows.filter((r) => !r.reject && r.score >= T);
  if (!s.length) { console.log(`${String(T).padStart(5)}   ${'0'.padStart(6)}`); continue; }
  const m = s.map((r) => r.max_mcap_after / (r.mcap * (1 + hair)));
  const p = s.map(sim).sort((a, b) => a - b);
  const avg = p.reduce((a, b) => a + b, 0) / p.length;
  console.log(`${String(T).padStart(5)}  ${String(s.length).padStart(6)}  ${(s.length / days).toFixed(1).padStart(7)}  ${pct((m.filter((x) => x >= 2).length / s.length) * 100)}  ${pct((m.filter((x) => x >= 5).length / s.length) * 100)}  ${pct((s.filter((r) => r.graduated_after).length / s.length) * 100)}  ${pct(avg * 100)}  ${pct(p[p.length >> 1] * 100)}  ${pct((p.filter((x) => x > 0).length / p.length) * 100)}`);
}

// Feature lift: which features actually separate 2x+ outcomes from the rest? (quintiles)
console.log('\nFeature lift (non-rejected): 2x-hit rate by quintile, Q1=lowest → Q5=highest');
const base = rows.filter((r) => !r.reject);
const hit = (r) => r.max_mcap_after / (r.mcap * (1 + hair)) >= 2;
const baseRate = base.filter(hit).length / Math.max(1, base.length);
console.log(`base 2x rate: ${(baseRate * 100).toFixed(2)}%  (n=${base.length})`);
const feats = ['netSolPerMin', 'flow60Sol', 'buyersPerMin', 'uniqueBuyers', 'buySellRatio', 'top10Pct', 'bundlePct', 'creatorHoldPct', 'initialBuySol', 'medianBuySol', 'progressPct', 'drawdownPct', 'smartBuyers', 'creatorLaunches'];
for (const k of feats) {
  const v = base.filter((r) => typeof r.f[k] === 'number').sort((a, b) => a.f[k] - b.f[k]);
  if (v.length < 50) continue;
  const q = [];
  for (let i = 0; i < 5; i++) { const sl = v.slice(Math.floor((i * v.length) / 5), Math.floor(((i + 1) * v.length) / 5)); q.push(sl.filter(hit).length / Math.max(1, sl.length)); }
  console.log(`${k.padEnd(16)} ${q.map((x) => `${(x * 100).toFixed(1).padStart(5)}%`).join('  ')}   lift Q5/base ${(q[4] / Math.max(1e-9, baseRate)).toFixed(2)}x`);
}
for (const k of ['hasTelegram', 'hasTwitter', 'hasWebsite', 'creatorSold']) {
  const y = base.filter((r) => r.f[k] === true), n = base.filter((r) => r.f[k] === false);
  if (y.length < 20 || n.length < 20) continue;
  console.log(`${k.padEnd(16)} yes ${((y.filter(hit).length / y.length) * 100).toFixed(1)}% (n=${y.length})  no ${((n.filter(hit).length / n.length) * 100).toFixed(1)}% (n=${n.length})`);
}
const rej = rows.filter((r) => r.reject);
if (rej.length) console.log(`\nRejected tokens: ${rej.length}, 2x-hit ${((rej.filter(hit).length / rej.length) * 100).toFixed(1)}%  (if this is close to the passed rate, the rejects are not earning their keep)`);
console.log('\nRead this as evidence, not proof: a few hundred labels per bucket is the minimum before trusting a number.\n');
