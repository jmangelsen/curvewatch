// Data health: is the data good enough to trust the results?
// - Gap detection: the trade firehose normally carries dozens of events per second. A silence longer than the
//   calibrated threshold is a feed gap. Paper trades open during a gap, and outcome labels whose window overlaps a
//   gap, are flagged and excluded from stats (their marks/peaks were computed on missing data).
// - Process downtime (restart, crash, reboot) is a gap too, reconstructed from a heartbeat.
// - Launch capture: creates are seen by PumpPortal AND by the RPC log feed; the overlap measures silent loss.
// - Calibration: thresholds come from this machine's own baseline (last 7 days), not guesses.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { statSync, statfsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, q } from './db.js';
import { logger } from './log.js';
const log = logger('health');

db.exec(`
CREATE TABLE IF NOT EXISTS feed_minutes (
  minute INTEGER PRIMARY KEY, trades INTEGER, creates INTEGER, creates_pp INTEGER, creates_rpc INTEGER, creates_both INTEGER,
  reconnects INTEGER, gap_sec REAL, up_sec REAL, loop_p99_ms REAL, rss_mb REAL, cpu_pct REAL
);
CREATE TABLE IF NOT EXISTS gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT, start INTEGER NOT NULL, end INTEGER, reason TEXT, open_trades INTEGER DEFAULT 0, tokens_flagged INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gaps_start ON gaps(start);
`);
for (const [t, c] of [['snapshots', 'gap INTEGER'], ['tokens', 'gap INTEGER'], ['alerts', 'gap INTEGER']]) { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* exists */ } }

const Q = {
  minute: db.prepare(`INSERT OR REPLACE INTO feed_minutes VALUES (@minute,@trades,@creates,@pp,@rpc,@both,@reconnects,@gapSec,@upSec,@p99,@rss,@cpu)`),
  minutes: db.prepare(`SELECT * FROM feed_minutes WHERE minute >= ? ORDER BY minute`),
  openGap: db.prepare(`INSERT INTO gaps (start, reason, open_trades) VALUES (?, ?, ?)`),
  closeGap: db.prepare(`UPDATE gaps SET end = ?, tokens_flagged = ? WHERE id = ?`),
  gapsSince: db.prepare(`SELECT * FROM gaps WHERE COALESCE(end, ?) >= ? ORDER BY start DESC`),
  overlap: db.prepare(`SELECT COUNT(*) n FROM gaps WHERE start < @b AND COALESCE(end, @now) > @a`),
  flagSnaps: db.prepare(`UPDATE snapshots SET gap = 1 WHERE mint = ?`),
  flagToken: db.prepare(`UPDATE tokens SET gap = 1 WHERE mint = ?`),
  flagAlert: db.prepare(`UPDATE alerts SET gap = 1 WHERE id = ?`),
  prune: db.prepare(`DELETE FROM feed_minutes WHERE minute < ?`),
  prunePairs: db.prepare(`DELETE FROM gaps WHERE start < ?`),
};

const H = config.health;
export const health = {
  gapSec: H.gapSec, lowRatePerMin: null, baseline: null, calibratedAt: null, calibrationNote: 'default (needs 60+ clean minutes)',
  lastTradeAt: Date.now(), openGapId: null, openGapStart: null, startedAt: Date.now(), restoredDowntimeSec: null,
};
let feedsRef = [], paperRef = null, engineRef = null;
const cur = { trades: 0, creates: 0, pp: 0, rpc: 0, both: 0, reconnects: 0, gapMs: 0 };
const createSeen = new Map(); // mint -> { t, pp, rpc }
const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
let cpuPrev = process.cpuUsage(), cpuAt = Date.now();
const lastMin = { p99: null, p50: null, cpu: null };

export function initHealth({ feeds, paper, engine }) {
  feedsRef = feeds; paperRef = paper; engineRef = engine;
  for (const f of feeds) f.on('down', () => { cur.reconnects++; });
  backfill();
  calibrate();
  // Downtime since the last heartbeat is a gap (restart, crash, reboot)
  const hb = Number(q.getKv.get('health_hb')?.v || 0);
  if (hb) {
    const down = (Date.now() - hb) / 1000;
    health.restoredDowntimeSec = down;
    if (down > health.gapSec) {
      health.openGapId = Number(Q.openGap.run(hb, `process down ${Math.round(down)}s (restart, crash or reboot)`, 0).lastInsertRowid);
      health.openGapStart = hb;
      log.warn(`process was down ${Math.round(down)}s: recorded as a data gap`);
    }
  }
  setInterval(tick, 1000);
  setInterval(flushMinute, 60000);
  setInterval(() => q.setKv.run('health_hb', String(Date.now())), 5000);
  setInterval(calibrate, 3600000);
  setInterval(() => { const t = Date.now() - 30 * 86400000; Q.prune.run(Math.floor(t / 60000)); Q.prunePairs.run(t); }, 6 * 3600000);
}

/**
 * One-time history backfill (first run with this module). Pump.fun launches ~10-60 tokens per minute (slowest 1% of
 * 428 recorded minutes still had 10), so a minute with zero recorded launches means the scanner was not running.
 * Rows are marked backfilled (trades = NULL) and never used for rate calibration.
 */
function backfill() {
  if (q.getKv.get('health_backfilled')) return;
  q.setKv.run('health_backfilled', String(Date.now()));
  const since = Date.now() - 14 * 86400000;
  const first = db.prepare('SELECT MIN(minute) m FROM feed_minutes WHERE trades IS NOT NULL').get().m;
  const rows = db.prepare('SELECT created_at / 60000 AS m, COUNT(*) n FROM tokens WHERE created_at > ? AND created_at < ? GROUP BY 1 ORDER BY 1').all(since, first ? first * 60000 : Date.now());
  if (!rows.length) return;
  const ins = db.prepare('INSERT OR IGNORE INTO feed_minutes (minute, trades, creates, up_sec, gap_sec, reconnects) VALUES (?, NULL, ?, 60, 0, NULL)');
  const gap = db.prepare('INSERT INTO gaps (start, end, reason) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      ins.run(rows[i].m, rows[i].n);
      const missing = i ? rows[i].m - rows[i - 1].m - 1 : 0;
      if (missing >= 1) gap.run((rows[i - 1].m + 1) * 60000, rows[i].m * 60000, `not running (backfilled: ${missing} min with no recorded launches)`);
    }
  })();
  log.info(`backfilled ${rows.length} minutes of coverage history from the launch record`);
}

/** Call for every trade event from the active trade source. */
export function onTradeEvent() {
  cur.trades++;
  health.lastTradeAt = Date.now();
  if (health.openGapId) closeGap();
}
/** Call for every create event (from any source). */
export function onCreateEvent(ev) {
  const src = ev.src === 'pumpportal' ? 'pp' : 'rpc';
  let s = createSeen.get(ev.mint);
  if (!s) { s = { t: Date.now(), pp: false, rpc: false }; createSeen.set(ev.mint, s); cur.creates++; }
  if (!s[src]) { s[src] = true; cur[src]++; if (s.pp && s.rpc) cur.both++; }
}

function tick() {
  const now = Date.now();
  if (!health.openGapId && now - health.lastTradeAt > health.gapSec * 1000) openGap(health.lastTradeAt);
  if (health.openGapId) cur.gapMs += 1000;
  // forget create pairs after 2 min
  if (createSeen.size > 5000) for (const [m, s] of createSeen) { if (now - s.t > 120000) createSeen.delete(m); else break; }
}
function gapReason() {
  const fs = feedsRef.map((f) => ({ name: f.name, connected: f.stats.connected, healthy: f.healthy() }));
  const trade = fs.filter((f) => (config.tradeSource === 'rpc' ? f.name.startsWith('rpc') : f.name === 'pumpportal'));
  if (trade.every((f) => !f.connected)) return `all trade feeds disconnected (${trade.map((f) => f.name).join(', ')})`;
  return `trade feeds connected but silent (${trade.filter((f) => f.connected).map((f) => f.name).join(', ')})`;
}
function openGap(start) {
  const open = paperRef ? paperRef.markGap() : 0;
  health.openGapId = Number(Q.openGap.run(start, gapReason(), open).lastInsertRowid);
  health.openGapStart = start;
  log.warn(`data gap opened: no trades for ${health.gapSec}s · ${open} open paper trades flagged`);
}
function closeGap() {
  const id = health.openGapId, start = health.openGapStart, end = Date.now();
  health.openGapId = null; health.openGapStart = null;
  // tokens alive during the gap: their outcome labels are incomplete
  let flagged = 0;
  if (engineRef) for (const t of engineRef.tokens.values()) if (!t.finalized && t.createdAt < end) { t.gapFlag = true; flagged++; }
  Q.closeGap.run(end, flagged, id);
  log.warn(`data gap closed after ${((end - start) / 1000).toFixed(0)}s · ${flagged} live tokens flagged`);
}

/** Did any gap overlap [a, b]? Used when labeling outcomes. */
export const gapOverlaps = (a, b) => Q.overlap.get({ a, b, now: Date.now() }).n > 0;
export function flagFinalized(t) { if (t.gapFlag || gapOverlaps(t.createdAt, Date.now())) { Q.flagSnaps.run(t.mint); Q.flagToken.run(t.mint); return true; } return false; }
export function flagAlert(id, from) { if (gapOverlaps(from, Date.now())) { Q.flagAlert.run(id); return true; } return false; }

function flushMinute() {
  const now = Date.now();
  const cpu = process.cpuUsage(cpuPrev); const dt = (now - cpuAt) * 1000;
  lastMin.cpu = dt > 0 ? ((cpu.user + cpu.system) / dt) * 100 : null; cpuPrev = process.cpuUsage(); cpuAt = now;
  lastMin.p99 = loop.percentile(99) / 1e6; lastMin.p50 = loop.percentile(50) / 1e6; loop.reset();
  const minute = Math.floor(now / 60000) - 1;
  const upSec = Math.min(60, (now - health.startedAt) / 1000);
  Q.minute.run({ minute, trades: cur.trades, creates: cur.creates, pp: cur.pp, rpc: cur.rpc, both: cur.both, reconnects: cur.reconnects,
    gapSec: Math.min(60, cur.gapMs / 1000), upSec, p99: lastMin.p99, rss: process.memoryUsage().rss / 1048576, cpu: lastMin.cpu });
  for (const k of Object.keys(cur)) cur[k] = 0;
}

/**
 * Calibrate thresholds from this machine's own clean minutes (last 7 days).
 * Gap threshold: with a trade rate λ per second (5th-percentile minute), a natural silence of s seconds has
 * probability e^(-λ·s). We pick s so that chance is below one in a million, clamped to [10, 60] seconds.
 * Low-rate alarm: below 40% of the 5th-percentile minute for 5 minutes = partial loss (socket alive, data thinning).
 */
export function calibrate() {
  const rows = Q.minutes.all(Math.floor((Date.now() - 7 * 86400000) / 60000)).filter((r) => r.up_sec >= 59 && !r.gap_sec && r.trades > 0);
  if (rows.length < 60) { health.calibrationNote = `default ${H.gapSec}s (needs 60 clean minutes, have ${rows.length})`; return; }
  const tr = rows.map((r) => r.trades).sort((a, b) => a - b);
  const p = (x) => tr[Math.min(tr.length - 1, Math.floor(x * tr.length))];
  const p5 = p(0.05), med = p(0.5);
  const lambda = p5 / 60;
  const s = Math.min(60, Math.max(10, Math.ceil(Math.log(1e6) / Math.max(lambda, 0.01))));
  health.gapSec = H.gapSecOverride || s;
  health.lowRatePerMin = Math.round(p5 * 0.4);
  health.baseline = { minutes: rows.length, medianPerMin: med, p5PerMin: p5, p95PerMin: p(0.95) };
  health.calibratedAt = Date.now();
  health.calibrationNote = `${health.gapSec}s from ${rows.length} clean minutes: slowest 5% of minutes still had ${p5} trades (${lambda.toFixed(1)}/s), so a natural ${health.gapSec}s silence has under a one-in-a-million chance`;
}

// ---------- view ----------
function dirSize(p) { try { return statSync(p).size; } catch { return 0; } }
function latestBackup() {
  const dirs = [process.env.BACKUP_DIR, path.join(config.dataDir, '..', 'backups'), path.join(config.dataDir, 'backups')].filter(Boolean);
  for (const d of dirs) {
    try { const f = readdirSync(d).filter((x) => x.endsWith('.db.gz')).map((x) => ({ x, t: statSync(path.join(d, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0]; if (f) return { dir: d, file: f.x, at: f.t }; } catch { /* none */ }
  }
  return null;
}
const pct = (a, b) => (b ? (a / b) * 100 : null);
export function coverage(sinceMs) {
  const rows = Q.minutes.all(Math.floor(sinceMs / 60000));
  const possible = Math.max(1, (Date.now() - Math.max(sinceMs, 0)) / 60000);
  const good = rows.reduce((s, r) => s + Math.max(0, Math.min(r.up_sec, 60) - (r.gap_sec || 0)), 0) / 60;
  return { goodMin: good, possibleMin: possible, pct: Math.min(100, (good / possible) * 100) };
}

export function healthView({ status, fills, labels }) {
  const now = Date.now();
  const mins = Q.minutes.all(Math.floor((now - 24 * 3600000) / 60000));
  const last5 = mins.slice(-5), last60 = mins.slice(-60);
  const rate5 = last5.length ? last5.reduce((s, r) => s + r.trades, 0) / last5.length : null;
  const sum = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0);
  const capPP = sum(last60, 'creates_pp'), capRPC = sum(last60, 'creates_rpc'), capBoth = sum(last60, 'creates_both');
  const gaps = Q.gapsSince.all(now, now - 14 * 86400000);
  const g24 = gaps.filter((g) => (g.end || now) >= now - 86400000);
  const gapMin24 = g24.reduce((s, g) => s + ((g.end || now) - Math.max(g.start, now - 86400000)), 0) / 60000;
  const dbFile = path.join(config.dataDir, 'curvewatch.db');
  const dbBytes = dirSize(dbFile), walBytes = dirSize(`${dbFile}-wal`);
  let disk = null; try { const s = statfsSync(config.dataDir); disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }; } catch { /* unsupported */ }
  // DB growth: one sample per day
  const day = new Date().toISOString().slice(0, 10);
  const sizes = JSON.parse(q.getKv.get('health_dbsizes')?.v || '{}');
  if (!sizes[day]) { sizes[day] = dbBytes + walBytes; const keys = Object.keys(sizes).sort(); while (keys.length > 30) delete sizes[keys.shift()]; q.setKv.run('health_dbsizes', JSON.stringify(sizes)); }
  const ks = Object.keys(sizes).sort(); const growthPerDay = ks.length >= 2 ? (sizes[ks[ks.length - 1]] - sizes[ks[0]]) / ((Date.parse(ks[ks.length - 1]) - Date.parse(ks[0])) / 86400000) : null;
  const backup = latestBackup();
  const mem = process.memoryUsage();
  const tables = Object.fromEntries(['tokens', 'snapshots', 'trades', 'alerts', 'paper_trades', 'wallets', 'grad_snapshots'].map((t) => { try { return [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]; } catch { return [t, null]; } }));
  const cov24 = coverage(now - 86400000), cov7 = coverage(now - 7 * 86400000), cov14 = coverage(now - 14 * 86400000);
  const covTest = coverage(labels.cfgSince);

  // ---- checks (thresholds documented in the README) ----
  const C = [];
  const add = (id, label, value, state, detail) => C.push({ id, label, value, state, detail });
  const tri = (ok, warn) => (ok ? 'pass' : warn ? 'warn' : 'fail');
  const testAgeH = (now - labels.cfgSince) / 3600000;
  add('cov24', 'Coverage, last 24 h', cov24.pct, tri(cov24.pct >= 95, cov24.pct >= 80), `${Math.round(cov24.goodMin)} of ${Math.round(Math.min(1440, cov24.possibleMin))} min with live trade data. Pass ≥ 95%, warn ≥ 80%.`);
  add('covTest', 'Coverage, current test', covTest.pct, tri(covTest.pct >= 80, covTest.pct >= 60), `Since ${new Date(labels.cfgSince).toISOString().slice(0, 16).replace('T', ' ')} UTC (${testAgeH.toFixed(0)} h). The two-week verdict needs ≥ 80%.`);
  const lowRate = health.lowRatePerMin;
  add('rate', 'Trade rate vs baseline', rate5, rate5 == null ? 'warn' : lowRate == null ? (rate5 > 0 ? 'pass' : 'fail') : tri(rate5 >= lowRate, rate5 >= lowRate * 0.5),
    health.baseline ? `${Math.round(rate5 ?? 0)}/min over 5 min; baseline median ${health.baseline.medianPerMin}/min, alarm below ${lowRate}/min (40% of the slowest 5% of minutes).` : `${Math.round(rate5 ?? 0)}/min. Baseline calibrates after 60 clean minutes.`);
  add('gaps', 'Gaps, last 24 h', g24.length, tri(g24.length <= 2 && gapMin24 < 10, g24.length <= 8 && gapMin24 < 60), `${g24.length} gaps, ${gapMin24.toFixed(1)} min total. Threshold ${health.gapSec}s silence.`);
  const rc1h = sum(last60, 'reconnects');
  add('reconnects', 'Reconnects, last hour', rc1h, tri(rc1h <= 6, rc1h <= 30), 'Public RPC drops often; the second connection usually covers it. More than 30/h: add a paid RPC URL first in RPC_WS_URLS.');
  const capRate = capPP ? pct(capBoth, capPP) : null;
  if (config.tradeSource === 'rpc') add('capture', 'Launch capture (RPC vs PumpPortal)', capRate, capRate == null ? 'warn' : tri(capRate >= 97, capRate >= 90), capRate == null ? 'No PumpPortal creates in the last hour to compare against.' : `${capBoth} of ${capPP} PumpPortal launches also seen on-chain by the RPC feed (RPC saw ${capRPC}). Below 97% means the RPC feed is silently dropping messages.`);
  add('loop', 'Event-loop lag p99', lastMin.p99, lastMin.p99 == null ? 'warn' : tri(lastMin.p99 < 50, lastMin.p99 < 200), 'Delay before the process can react to a new message. Above 200 ms, stop and entry checks run late.');
  const rss = mem.rss / 1048576;
  add('mem', 'Memory (RSS)', rss, tri(rss < 600, rss < 900), 'Heap is capped at 768 MB in Docker. Typical: 150–300 MB.');
  if (disk) { const daysLeft = growthPerDay > 0 ? disk.freeBytes / growthPerDay : null; add('disk', 'Disk free', disk.freeBytes / 1e9, tri(disk.freeBytes > 5e9 && (daysLeft == null || daysLeft > 30), disk.freeBytes > 1e9), `${(disk.freeBytes / 1e9).toFixed(1)} GB free${daysLeft ? `, about ${Math.round(daysLeft)} days at the current growth rate` : ''}.`); }
  add('labels', 'Outcome labeling backlog', labels.overdueAlerts, tri(labels.overdueAlerts === 0, labels.overdueAlerts <= 5), `${labels.overdueAlerts} alerts past their 1 h horizon without a label; ${labels.pendingTokens} tokens still inside their window.`);
  if (fills?.entry?.n >= 10) add('fills', 'Paper entry fills vs real buyers', fills.entry.medianPct, tri(fills.entry.medianPct >= -0.5, fills.entry.medianPct >= -2), `Median ${fills.entry.medianPct >= 0 ? '+' : ''}${fills.entry.medianPct.toFixed(1)}%: paper paid ${fills.entry.medianPct >= 0 ? 'more' : 'less'} per token than real buyers of similar size in the same seconds. Negative means the model is optimistic.`);
  if (fills?.stops?.n >= 10) add('stops', 'Stop overshoot', fills.stops.medianPts, tri(fills.stops.medianPts <= 5, fills.stops.medianPts <= 10), `Median stop exit lands ${fills.stops.medianPts.toFixed(1)} pts past the −${config.paper.stopPct}% stop (worst 10%: ${fills.stops.p90Pts.toFixed(1)} pts).`);
  add('backup', 'Last backup', backup ? (now - backup.at) / 3600000 : null, backup ? tri(now - backup.at < 26 * 3600000, now - backup.at < 72 * 3600000) : 'warn', backup ? `${backup.file} in ${backup.dir}` : 'No backup found. On the VPS, the installer adds a nightly cron at 03:15.');
  add('sol', 'SOL/USD price age', status.solUsdAt ? (now - status.solUsdAt) / 60000 : null, status.solUsdAt ? tri(now - status.solUsdAt < 10 * 60000, now - status.solUsdAt < 60 * 60000) : 'warn', 'Used for every USD figure.');
  const fails = C.filter((c) => c.state === 'fail').length, warns = C.filter((c) => c.state === 'warn').length;
  const overall = !status.healthy || health.openGapId ? 'DOWN' : fails ? 'DEGRADED' : warns > 2 ? 'WATCH' : 'HEALTHY';

  return {
    now, overall, checks: C, openGap: health.openGapId ? { since: health.openGapStart, sec: (now - health.openGapStart) / 1000 } : null,
    calibration: { gapSec: health.gapSec, lowRatePerMin: health.lowRatePerMin, baseline: health.baseline, at: health.calibratedAt, note: health.calibrationNote },
    coverage: { h24: cov24, d7: cov7, d14: cov14, test: covTest },
    minutes: mins.map((r) => [r.minute, r.trades, r.gap_sec || 0, r.up_sec, r.reconnects]),
    gaps: gaps.slice(0, 50).map((g) => ({ ...g, sec: ((g.end || now) - g.start) / 1000, open: !g.end })),
    feeds: status.feeds.map((f) => ({ name: f.name, healthy: f.healthy, connected: f.connected, evPerSec: f.evPerSec, msgPerSec: f.msgPerSec, kbPerSec: f.kbPerSec,
      reconnects: f.reconnects, connects: f.connects, secSinceMessage: f.secSinceMessage, lastError: f.lastError, since: f.since, failedTx: f.failedTx ?? null })),
    capture: { pp: capPP, rpc: capRPC, both: capBoth, pct: capRate },
    system: { rssMb: rss, heapMb: mem.heapUsed / 1048576, loopP50: lastMin.p50, loopP99: lastMin.p99, cpuPct: lastMin.cpu, uptimeSec: (now - health.startedAt) / 1000,
      node: process.version, dbBytes, walBytes, disk, growthPerDay, tables, backup, restoredDowntimeSec: health.restoredDowntimeSec },
    labels, fills,
  };
}
