// Curvewatch entrypoint: wires feeds -> engine -> storage/alerts/dashboard, plus ops jobs.
import { config } from './config.js';
import { retention, q } from './db.js';
import { PumpPortalFeed } from './sources/pumpportal.js';
import { RpcLogsFeed } from './sources/rpcLogs.js';
import { Engine } from './engine/engine.js';
import { refreshSmartWallets } from './engine/intel.js';
import * as paper from './engine/paper.js';
import { metaStats, metaQueueLen } from './engine/metadata.js';
import { sendTelegram, tgEnabled } from './engine/telegram.js';
import { dexMcaps } from './engine/dex.js';
import { startServer } from './server.js';
import { datasetStats, alertStats } from './stats.js';
import { round } from './util.js';
import { logger } from './log.js';
import { db } from './db.js';

const log = logger('main');
const startedAt = Date.now();

const pp = new PumpPortalFeed();
const rpcs = config.tradeSource === 'rpc' ? Array.from({ length: Math.max(1, config.rpc.parallel) }, (_, i) => new RpcLogsFeed(i)) : [];
const engine = new Engine({ pumpportal: pp });

pp.on('create', (e) => engine.onCreate(e));
pp.on('trade', (e) => engine.onTrade(e));
pp.on('migrate', (e) => engine.onGraduate(e));
for (const rpc of rpcs) {
  rpc.on('create', (e) => engine.onCreate(e)); // redundancy: launches still flow if PumpPortal is down
  rpc.on('trade', (e) => engine.onTrade(e));
  rpc.on('complete', (e) => engine.onGraduate(e));
}

const feeds = [pp, ...rpcs];
// Healthy = the trade path is alive. In rpc mode any one RPC connection suffices (each also carries creates).
const isHealthy = (fs) => (rpcs.length ? fs.filter((f) => f.name.startsWith('rpc')).some((f) => f.healthy) : fs[0].healthy);
function status() {
  const mem = process.memoryUsage();
  const fs = feeds.map((f) => ({ name: f.name, healthy: f.healthy(), ...f.stats, ...f.rates(), secSinceMessage: f.stats.lastMessageAt ? (Date.now() - f.stats.lastMessageAt) / 1000 : null }));
  const k = paper.killRule();
  return {
    healthy: isHealthy(fs),
    uptimeSec: (Date.now() - startedAt) / 1000,
    startedAt, now: Date.now(),
    tradeSource: config.tradeSource,
    feeds: fs,
    engine: { ...engine.counters, tracked: engine.tokens.size, pending: engine.pending.size, ...engine.rates() },
    metadata: { ...metaStats, queue: metaQueueLen() },
    memMb: round(mem.rss / 1048576, 0),
    kill: { status: k.status, n: k.n, needed: k.needed, expectancyPct: k.expectancyPct, ciLowPct: k.ciLowPct, ciHighPct: k.ciHighPct, totalPnlSol: k.totalPnlSol, winRatePct: k.winRatePct },
    telegram: tgEnabled(),
    alertScore: config.scoring.alertScore,
  };
}

// ---- main loops ----
setInterval(() => { try { engine.evaluate(); } catch (e) { log.error('evaluate failed', e.stack); } }, config.lifecycle.evalIntervalSec * 1000);
setInterval(refreshSmartWallets, 10 * 60 * 1000);
setInterval(() => { try { retention(); } catch (e) { log.warn('retention failed', e.message); } }, 6 * 3600 * 1000);

// Post-graduation DexScreener checks for alerted tokens (6h and 24h after alert)
setInterval(async () => {
  const t = Date.now();
  const due = db.prepare(`SELECT id, mint, ts, dex_mcap_6h, dex_mcap_24h FROM alerts WHERE graduated=1 AND ts > ? AND (
     (dex_mcap_6h IS NULL AND ts <= ?) OR (dex_mcap_24h IS NULL AND ts <= ?))`).all(t - 26 * 3600000, t - 6 * 3600000, t - 24 * 3600000);
  if (!due.length) return;
  const m = await dexMcaps([...new Set(due.map((d) => d.mint))]);
  for (const d of due) {
    const v = m.get(d.mint); if (!v) continue;
    q.updateAlertDex.run({ id: d.id, m6: d.dex_mcap_6h == null && t - d.ts >= 6 * 3600000 ? v.mcap : null, m24: d.dex_mcap_24h == null && t - d.ts >= 24 * 3600000 ? v.mcap : null });
  }
}, 5 * 60 * 1000);

// Healthcheck ping (dead-man switch) + feed-down warning
let downSince = null, warned = false;
setInterval(async () => {
  const s = status();
  if (s.healthy) {
    if (warned) sendTelegram('<b>System</b> · feeds recovered.');
    downSince = null; warned = false;
    if (config.healthcheckUrl) fetch(config.healthcheckUrl, { signal: AbortSignal.timeout(8000) }).catch(() => {});
  } else {
    downSince = downSince || Date.now();
    if (!warned && Date.now() - downSince > 180000) { warned = true; sendTelegram(`<b>System</b> · feed unhealthy for 3+ min: ${s.feeds.filter((f) => !f.healthy).map((f) => f.name).join(', ')}`); }
  }
}, 60000);

// Daily summary at DAILY_SUMMARY_HOUR in TZ_NAME
setInterval(() => {
  if (!tgEnabled()) return;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.telegram.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) !== config.telegram.dailySummaryHour) return;
  if (q.getKv.get('last_summary')?.v === today) return;
  q.setKv.run('last_summary', today);
  const d = datasetStats(), a = alertStats(), k = paper.killRule();
  sendTelegram([
    `<b>Curvewatch daily · ${today}</b>`,
    `Launches 24h: ${d.launches24h} · graduated: ${d.grads24h} (${d.gradRate24hPct != null ? round(d.gradRate24hPct, 2) : '–'}%)`,
    `Alerts finalized: ${a.finalized} · hit 2x: ${a.hit2xPct != null ? round(a.hit2xPct, 0) : '–'}% · graduated: ${a.gradPct != null ? round(a.gradPct, 0) : '–'}%`,
    `Paper: ${k.allTrades} trades · expectancy ${round(k.expectancyPct, 1)}% [${round(k.ciLowPct, 1)}, ${round(k.ciHighPct, 1)}] · total ${round(k.totalPnlSol, 3)} SOL`,
    `Kill rule: <b>${k.status}</b>${k.status === 'COLLECTING' ? ` (${k.n}/${k.needed})` : ''}`,
  ].join('\n'));
}, 60000);

// ---- boot ----
refreshSmartWallets();
paper.restoreOpen(engine.getToken);
startServer({ engine, status });
feeds.forEach((f) => f.start());
log.info(`curvewatch started · trade source: ${config.tradeSource} · alert score ≥ ${config.scoring.alertScore}`);
if (tgEnabled()) sendTelegram(`<b>Curvewatch online</b> · trade source ${config.tradeSource} · alert score ≥ ${config.scoring.alertScore}`);

const shutdown = (sig) => { log.info(`${sig}: shutting down`); feeds.forEach((f) => f.stop()); try { db.close(); } catch {} process.exit(0); };
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => log.error('uncaught', e.stack));
process.on('unhandledRejection', (e) => log.error('unhandled', String(e?.stack || e)));
