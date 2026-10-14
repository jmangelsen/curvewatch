// Edge Lab orchestrator: registration of hypotheses, periodic worker runs, run history, views for the API.
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { db, q } from '../db.js';
import { logger } from '../log.js';
import { HYPOTHESES, HORIZONS, PASS_BAR, windowsOf } from './hypotheses.js';
import { roundTrip, zFamily } from './stats.js';
const log = logger('edgelab');

db.exec(`CREATE TABLE IF NOT EXISTS edge_runs (run_at INTEGER, key TEXT, n INTEGER, mean REAL, lo REAL, status TEXT, PRIMARY KEY (run_at, key));
CREATE INDEX IF NOT EXISTS idx_edge_runs_key ON edge_runs(key, run_at);`);
const Q = {
  ins: db.prepare('INSERT OR REPLACE INTO edge_runs VALUES (?,?,?,?,?,?)'),
  traj: db.prepare('SELECT run_at t, n, mean, lo, status FROM edge_runs WHERE key = ? ORDER BY run_at'),
  prune: db.prepare('DELETE FROM edge_runs WHERE run_at < ?'),
};
const RUN_EVERY_MS = Number(process.env.EDGE_RUN_MIN || 15) * 60000;

/** Registration: first time each hypothesis × window definition was seen. Only later tokens count toward a pass. */
const hyp = Object.fromEntries(HYPOTHESES.map((h) => [h.id, h]));
const hzn = Object.fromEntries(HORIZONS.map((h) => [h.id, h]));
const reg = {}, regHash = {};
for (const h of HYPOTHESES) for (const z of windowsOf(h, HORIZONS)) {
  const key = `${h.id}@${z.id}`;
  const hash = createHash('sha1').update(h.id + h.test.toString() + JSON.stringify(z)).digest('hex').slice(0, 8);
  const k = `edge_reg:${key}:${hash}`;
  if (!q.getKv.get(k)) q.setKv.run(k, String(Date.now()));
  reg[key] = Number(q.getKv.get(k).v); regHash[key] = hash;
}

let state = { running: false, last: null, lastError: null, startedAt: null, costs: null };
let fillsRef = () => null;

function costs() {
  const P = config.paper;
  const model = roundTrip(P.feePct, P.extraSlippagePct);
  let audited = null, auditN = 0;
  try {
    const f = fillsRef();
    if (f?.entry?.n >= 30 && f?.exit?.n >= 30) {
      auditN = Math.min(f.entry.n, f.exit.n);
      const e = Math.max(0, f.entry.medianPct) / 100, x = Math.max(0, -f.exit.medianPct) / 100;
      audited = 1 - (1 - P.feePct / 100) ** 2 * (1 - e) * (1 - x);
    }
  } catch { /* fills optional */ }
  // pass decisions use the worse (higher) of the two once the audit has 30+ fills each way
  return { model, audited, auditN, primary: Math.max(model, audited ?? 0), basis: audited != null && audited > model ? 'audited fills' : 'cost model' };
}

export function runEdgeLab() {
  if (state.running) return;
  state.running = true; state.startedAt = Date.now();
  const c = costs(); state.costs = c;
  const w = new Worker(new URL('./worker.js', import.meta.url), { workerData: { dbPath: path.join(config.dataDir, 'curvewatch.db'), reg, cost: c,
    replayCfg: { feePct: config.paper.feePct, slipPct: config.paper.extraSlippagePct, sizeSol: config.paper.sizeSol, exitDelaySec: config.paper.exitDelaySec, stopPct: config.paper.stopPct, tp: config.paper.tp1Multiple } }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
  const kill = setTimeout(() => { log.warn('edge lab run timed out'); w.terminate(); }, 180000);
  w.once('message', (msg) => {
    const at = Date.now();
    state.last = { ...msg, at, costs: c };
    db.transaction(() => { for (const t of msg.tests) Q.ins.run(at, t.key, t.counted.n, t.counted.meanPct, t.counted.loPct, t.counted.status); Q.prune.run(at - 30 * 86400000); })();
    log.info(`edge lab: ${msg.tests.length} tests in ${msg.ms} ms · ${msg.tests.filter((t) => t.counted.status === 'PASS').length} pass · ${msg.quality.entries} labeled entries`);
  });
  w.once('error', (e) => { state.lastError = e.message; log.warn('edge lab worker failed', e.stack); });
  w.once('exit', () => { clearTimeout(kill); state.running = false; });
}
export function startEdgeLab({ fills }) {
  fillsRef = fills;
  setTimeout(runEdgeLab, 45000);
  setInterval(runEdgeLab, RUN_EVERY_MS);
}

const brief = (t) => {
  const H = hyp[t.hyp], Z = hzn[t.horizon], c = t.counted;
  return { key: t.key, hyp: t.hyp, horizon: t.horizon, family: H.family, label: H.label, thesis: H.thesis, window: Z.label, reference: t.reference, registeredAt: t.registeredAt, hash: regHash[t.key],
    n: c.n, needed: c.needed, meanPct: c.meanPct, grossMeanPct: c.grossMeanPct, medianPct: c.medianPct, winPct: c.winPct, loPct: c.loPct, halves: c.halves, spanDays: c.spanDays, robustMeanPct: c.robustMeanPct,
    vsUniverse: c.vsUniverse, checks: c.checks, status: c.status, eta: t.eta,
    context: { n: t.context.n, meanPct: t.context.meanPct, grossMeanPct: t.context.grossMeanPct, loPct: t.context.loPct, status: t.context.status } };
};

export function edgeView() {
  const L = state.last;
  const base = { bar: PASS_BAR, horizons: HORIZONS, hypotheses: HYPOTHESES.map(({ test, ...h }) => h), runEveryMin: RUN_EVERY_MS / 60000, running: state.running, lastError: state.lastError };
  if (!L) return { ...base, ready: false, costs: state.costs || costs() };
  const tests = L.tests.map(brief);
  const live = tests.filter((t) => !t.reference);
  const count = (s) => live.filter((t) => t.status === s).length;
  const leader = [...live].filter((t) => t.n >= 30 && t.loPct != null).sort((a, b) => b.loPct - a.loPct)[0] || null;
  const closest = [...live].sort((a, b) => b.n - a.n)[0] || null;
  return { ...base, ready: true, runAt: L.at, ms: L.ms, m: L.m, z: zFamily(L.m), costs: L.costs, quality: L.quality, samples: L.samples, replay: L.replay,
    counts: { tests: live.length, pass: count('PASS'), candidate: count('CANDIDATE'), fail: count('FAIL'), collecting: count('COLLECTING') }, leader, closest, tests };
}

export function edgeDetail(key) {
  const L = state.last; if (!L) return null;
  const t = L.tests.find((x) => x.key === key); if (!t) return null;
  return { ...brief(t), hist: t.hist, histScope: t.histScope, byDay: t.byDay, rows: t.rows, trajectory: Q.traj.all(key), costs: L.costs, m: L.m, bar: PASS_BAR };
}
