// Curvewatch entrypoint: wires feeds -> engine -> storage/alerts/dashboard, plus ops jobs.
import { config } from './config.js';
import { retention, q } from './db.js';
import { PumpPortalFeed } from './sources/pumpportal.js';
import { RpcLogsFeed } from './sources/rpcLogs.js';
import { Engine } from './engine/engine.js';
import { refreshSmartWallets } from './engine/intel.js';
import * as paper from './engine/paper.js';
import { metaStats, metaQueueLen } from './engine/metadata.js';
import { sendTelegram, tgEnabled, tgStats, esc as tgEsc } from './engine/telegram.js';
import { TELEGRAM_DAILY_BLOCK, telegramFullText } from './compliance.js';
import { startTgBot } from './engine/tgBot.js';
import { Runners } from './engine/runners.js';
import { fmtUsd } from './market.js';
import { dexMcaps } from './engine/dex.js';
import { startServer } from './server.js';
import { Graduates } from './engine/graduates.js';
import { market, refreshSolUsd, solToUsd } from './market.js';
import { Strong } from './engine/strong.js';
import { updateGate, gateView, gate } from './engine/marketgate.js';
import { config as cfg } from './config.js';
import { datasetStats, alertStats } from './stats.js';
import { round } from './util.js';
import { logger } from './log.js';
import { db } from './db.js';
import { initRejects, rejectsView } from './engine/rejects.js';
import { initHealth, healthView, health, onGapClosed } from './health.js';
import { backfillGap, backfillPendingGaps, backfillState } from './engine/backfill.js';
import { auditFills, fillsView, startFillAudit } from './fills.js';
import { benchmarks } from './benchmarks.js';
import { makeDrill } from './drill.js';
import { startEdgeLab, edgeView, edgeDetail } from './edgelab/index.js';
import { startTracker, trackerView } from './engine/smartTracker.js';
import { CFG, CFG_SINCE, cfgHistory } from './version.js';

initRejects(); // sticky rejects bucket (backfills once from history)

const log = logger('main');
const startedAt = Date.now();

const pp = new PumpPortalFeed();
const rpcs = config.tradeSource === 'rpc' ? Array.from({ length: Math.max(1, config.rpc.parallel) }, (_, i) => new RpcLogsFeed(i)) : [];
const engine = new Engine({ pumpportal: pp });
const grads = new Graduates();
// Recover graduations missed while the collector was down (restart, crash, sleep): see engine/backfill.js
onGapClosed(({ start, end, id }) => backfillGap(start, end, { grads, engine, gapId: id, reason: `gap ${new Date(start).toISOString().slice(11, 16)}–${new Date(end).toISOString().slice(11, 16)} UTC` }));
const strong = new Strong();
engine.on('alert', (a) => { try { const row = strong.consider('curve', { ...a, mcapUsd: market.solUsd ? a.mcap * market.solUsd : null }); if (row) { const why = engine.cleanEntry(a.mint); if (why) log.info(`clean book skipped ${a.symbol}: ${why}`); } } catch (e) { log.warn('strong (curve) failed', e.message); } });
grads.on('alert', (a) => { try { strong.consider('grad', { ...a, mcapUsd: a.mcap }); } catch (e) { log.warn('strong (grad) failed', e.message); } });

const refreshPx = () => refreshSolUsd(grads.solUsd).then((px) => { if (px && !grads.solUsd) grads.solUsd = px; });

pp.on('create', (e) => engine.onCreate(e));
pp.on('trade', (e) => engine.onTrade(e));
pp.on('migrate', (e) => { engine.onGraduate(e); const t = engine.getToken(e.mint); grads.add(e.mint, 'migration', { symbol: t?.symbol, name: t?.name }); });
for (const rpc of rpcs) {
  rpc.on('create', (e) => engine.onCreate(e)); // redundancy: launches still flow if PumpPortal is down
  rpc.on('trade', (e) => engine.onTrade(e));
  rpc.on('complete', (e) => { engine.onGraduate(e); const t = engine.getToken(e.mint); grads.add(e.mint, 'migration', { symbol: t?.symbol, name: t?.name }); });
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
    telegramStats: tgStats(),
    solUsd: market.solUsd, solUsdAt: market.solUsdAt,
    grads: grads.stats(),
    gradKill: (({ status, n, needed, expectancyPct, ciLowPct, ciHighPct, totalPnlSol }) => ({ status, n, needed, expectancyPct, ciLowPct, ciHighPct, totalPnlSol }))(grads.kill()),
    alertScore: config.scoring.alertScore,
    band: (({ status, n, needed, expectancyPct, ciLowPct, ciHighPct, totalPnlSol, winRatePct }) => ({ status, n, needed, expectancyPct, ciLowPct, ciHighPct, totalPnlSol, winRatePct, lo: config.band.lo, hi: config.band.hi }))(paper.killRule('band')),
    paperRules: config.paper.rules, cfg: CFG, cfgSince: CFG_SINCE,
    health: { gapSec: health.gapSec, openGap: !!health.openGapId, backfill: backfillState },
    market: { state: gate.state, mode: gate.mode, enforcing: gate.enforcing, winRatePct: gate.winRatePct, n: gate.n },
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
    `Paper (${config.paper.rules} exits): ${k.allTrades} trades · expectancy ${round(k.expectancyPct, 1)}% [${round(k.ciLowPct, 1)}, ${round(k.ciHighPct, 1)}] · total ${round(k.totalPnlSol, 3)} SOL`,
    `Kill rule: <b>${k.status}</b>${k.status === 'COLLECTING' ? ` (${k.n}/${k.needed})` : ''}`,
    '', TELEGRAM_DAILY_BLOCK,
  ].join('\n'));
  // Mondays: the complete disclosures as their own message, so anyone who only reads Telegram has seen the full text.
  if (new Date().getUTCDay() === 1 || q.getKv.get('tg_disclosures_sent') == null) { q.setKv.run('tg_disclosures_sent', today); sendTelegram(telegramFullText(tgEsc)); }
}, 60000);

// ---- post-graduation tracker ----
if (cfg.grads.enabled) {
  setInterval(() => grads.poll().catch((e) => log.error('grad poll failed', e.stack)), cfg.grads.pollSec * 1000);
  setInterval(() => grads.seed(), 5 * 60 * 1000);
  setInterval(() => { try { grads.label(); } catch (e) { log.warn('grad label failed', e.message); } }, 5 * 60 * 1000);
}
setInterval(refreshPx, 60000);
// Market conditions (rolling paper win rate). Only announces changes on Telegram when enforcing.
setInterval(() => {
  try {
    const ch = updateGate(() => ({ launchesPerMin: engine.rates().launchesPerMin, grads1h: engine.rates().grads1h }));
    if (ch && config.marketGate.mode === 'enforce') sendTelegram(`<b>Market ${ch.to}</b> · last ${ch.n} paper trades won ${Math.round(ch.winRatePct ?? 0)}%. ${ch.to === 'COLD' ? 'Strong signals paused.' : 'Strong signals resumed.'}`);
  } catch (e) { log.warn('market gate failed', e.message); }
}, 15000);
setInterval(() => { try { strong.label(); } catch (e) { log.warn('strong label failed', e.message); } }, 5 * 60 * 1000);

// ---- boot ----
await refreshPx();
if (cfg.grads.enabled) {
  grads.restore();
  // Cold start: recent graduations we recorded ourselves, then DexScreener's Pump.fun profiles/boosts.
  for (const r of db.prepare('SELECT mint, symbol, name FROM tokens WHERE graduated=1 AND graduated_at > ?').all(Date.now() - cfg.grads.maxAgeHours * 3600000)) grads.add(r.mint, 'migration', r);
  grads.seed().then(() => grads.poll());
}
refreshSmartWallets();
initHealth({ feeds, paper, engine });
setTimeout(() => backfillPendingGaps({ grads, engine }), 15000); // after feeds are up, so a startup gap closes first
// Tokens and alerts that were mid-window when the process stopped can never be labeled (in-memory state is gone).
// Mark them lost (finalized = -1, gap = 1) so they are neither counted as backlog nor used in calibration.
{
  const la = db.prepare(`UPDATE alerts SET finalized = -1, gap = 1 WHERE finalized = 0`).run().changes;
  const lt = db.prepare(`UPDATE tokens SET gap = 1 WHERE finalized = 0 AND COALESCE(gap,0) = 0`).run().changes;
  if (la || lt) log.info(`restart: ${la} alerts and ${lt} tokens were mid-window and cannot be labeled (marked lost)`);
  q.setKv.run('lost_on_restart', String(Number(q.getKv.get('lost_on_restart')?.v || 0) + la));
}
paper.restoreOpen(engine.getToken, { downSec: health.restoredDowntimeSec });
setInterval(() => { try { paper.tick(engine.getToken); } catch (e) { log.error('paper tick failed', e.stack); } }, 1000);
startFillAudit();
startEdgeLab({ fills: () => fillsView({ scope: 'all' }) });
startTracker({ engine });
const healthData = (scope) => {
  const t = Date.now();
  const overdueAlerts = db.prepare(`SELECT COUNT(*) n FROM alerts WHERE finalized = 0 AND ts < ?`).get(t - (config.lifecycle.outcomeHorizonSec + 600) * 1000).n;
  let pendingTokens = 0; for (const x of engine.tokens.values()) if (!x.finalized) pendingTokens++;
  const gapLabels = db.prepare(`SELECT COUNT(*) n FROM tokens WHERE gap = 1 AND created_at > ?`).get(t - 7 * 86400000).n;
  const lostAlerts = db.prepare(`SELECT COUNT(*) n FROM alerts WHERE finalized = -1 AND ts > ?`).get(t - 7 * 86400000).n;
  const labeled7d = db.prepare(`SELECT COUNT(*) n FROM tokens WHERE finalized = 1 AND created_at > ?`).get(t - 7 * 86400000).n;
  return healthView({ status: status(), fills: fillsView({ scope }), labels: { overdueAlerts, pendingTokens, gapLabels, lostAlerts, labeled7d, cfg: CFG, cfgSince: CFG_SINCE, cfgHistory: cfgHistory(),
    random: { pool: engine.counters.randomPool ?? null, noMatch: engine.counters.randomNoMatch || 0 } } });
};
try { const nb = paper.backfillCauses(); if (nb) log.info(`labeled causes for ${nb} older paper trades`); } catch (e) { log.warn('cause backfill failed', e.message); }
const runners = new Runners({ grads });
if (config.runners.enabled) runners.start();
runners.on('picks', (o) => {
  if (!tgEnabled() || !o.picks.length) return;
  const L = [`<b>Runner board · ${o.day}</b> · ${o.k} of ${o.eligible} eligible young graduates, ranked by the registered rule${o.late ? ' (late pick)' : ''}`,
    ...o.picks.map((x, i) => `${i + 1}. <b>${tgEsc(x.symbol || x.mint.slice(0, 6))}</b> · ${fmtUsd(x.mcap)} · ${x.ageH.toFixed(1)} h · score ${x.score.toFixed(0)}${x.reasons.length ? ` · ${tgEsc(x.reasons.slice(0, 2).join(', '))}` : ''}${x.flags.length ? ` · flag: ${tgEsc(x.flags[0])}` : ''}`),
    '', `Target: ${fmtUsd(config.runners.targetMcapUsd)} within 48 h. Base rate for this list so far is on the Runners tab; in the registration sample 6% of eligible coins reached it and 72% halved within a day. A ranked watch set, not a forecast with demonstrated skill.`];
  sendTelegram(L.join('\n'));
});
startServer({ engine, status, grads, strong, runners, gateView, healthData, fillsView, benchmarks, drill: makeDrill({ engine, grads, edgeView, edgeDetail, runners }), edgeView, edgeDetail, trackerView, rejectsView });
startTgBot({ engine, grads, strong, status, runners }); // two-way lookups; no-op unless Telegram is configured
feeds.forEach((f) => f.start());
log.info(`curvewatch started · trade source: ${config.tradeSource} · alert score ≥ ${config.scoring.alertScore}`);
if (tgEnabled()) sendTelegram(`<b>Curvewatch online</b> · trade source ${config.tradeSource} · alert score ≥ ${config.scoring.alertScore}`);

const shutdown = (sig) => { log.info(`${sig}: shutting down`); feeds.forEach((f) => f.stop()); try { q.setKv.run('health_hb', String(Date.now())); } catch {} try { db.close(); } catch {} process.exit(0); };
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => log.error('uncaught', e.stack));
process.on('unhandledRejection', (e) => log.error('unhandled', String(e?.stack || e)));
