// Dataset analytics: the calibration view is the single most important screen.
import { db } from './db.js';
import { round } from './util.js';

export function datasetStats() {
  const day = Date.now() - 86400000;
  const tot = db.prepare(`SELECT COUNT(*) n, SUM(graduated) g, MIN(created_at) first FROM tokens`).get();
  const d = db.prepare(`SELECT COUNT(*) n, SUM(graduated) g, SUM(rugged) r, SUM(has_telegram) tg, SUM(finalized) fin FROM tokens WHERE created_at>=?`).get(day);
  const hourly = db.prepare(`SELECT (created_at/3600000)*3600000 h, COUNT(*) n, SUM(graduated) g FROM tokens WHERE created_at>=? GROUP BY h ORDER BY h`).all(day);
  const alertsHourly = db.prepare(`SELECT (ts/3600000)*3600000 h, COUNT(*) n FROM alerts WHERE ts>=? GROUP BY h`).all(day);
  const snaps = db.prepare(`SELECT COUNT(*) n, SUM(max_mcap_after IS NOT NULL) labeled FROM snapshots`).get();
  return {
    totalLaunches: tot.n, totalGrads: tot.g || 0, since: tot.first,
    launches24h: d.n, grads24h: d.g || 0, rugs24h: d.r || 0, finalized24h: d.fin || 0,
    gradRate24hPct: d.fin ? ((d.g || 0) / d.n) * 100 : null,
    telegramShare24hPct: d.n ? ((d.tg || 0) / d.n) * 100 : null,
    snapshots: snaps.n, labeledSnapshots: snaps.labeled || 0,
    hourly: hourly.map((r) => ({ t: r.h, launches: r.n, grads: r.g || 0, alerts: alertsHourly.find((a) => a.h === r.h)?.n || 0 })),
  };
}

/** Score-bucket calibration at a checkpoint: does a higher score actually mean better outcomes? */
export function calibration(checkpoint = 120) {
  const rows = db.prepare(`SELECT score, reject, mcap, max_mcap_after, min_before_max, graduated_after FROM snapshots
    WHERE checkpoint=? AND max_mcap_after IS NOT NULL AND mcap>0`).all(checkpoint);
  const buckets = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const b = rows.filter((r) => !r.reject && r.score >= lo && r.score < lo + 10);
    buckets.push(summarize(`${lo}–${lo + 9}`, b));
  }
  const rejected = summarize('rejected', rows.filter((r) => r.reject));
  return { checkpoint, n: rows.length, buckets, rejected };
}
function summarize(label, b) {
  const n = b.length;
  const mult = b.map((r) => r.max_mcap_after / r.mcap);
  return {
    label, n,
    hit2xPct: n ? (mult.filter((m) => m >= 2).length / n) * 100 : null,
    hit5xPct: n ? (mult.filter((m) => m >= 5).length / n) * 100 : null,
    gradPct: n ? (b.filter((r) => r.graduated_after).length / n) * 100 : null,
    medianMaxMult: n ? round(mult.sort((a, c) => a - c)[n >> 1], 2) : null,
  };
}

export function alertStats() {
  const rows = db.prepare(`SELECT * FROM alerts WHERE finalized=1`).all();
  const n = rows.length;
  const m = rows.map((r) => r.max_multiple || 0);
  return {
    finalized: n,
    hit2xPct: n ? (m.filter((x) => x >= 2).length / n) * 100 : null,
    hit5xPct: n ? (m.filter((x) => x >= 5).length / n) * 100 : null,
    gradPct: n ? (rows.filter((r) => r.graduated).length / n) * 100 : null,
    drawdownFirstPct: n ? (rows.filter((r) => r.min_before_max / r.mcap <= 0.6).length / n) * 100 : null,
  };
}
