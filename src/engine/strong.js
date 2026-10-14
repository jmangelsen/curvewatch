// Strong signals: the only alerts pushed to your Telegram by default.
//
// A regular alert says "this scores well". A strong signal says "setups that scored like this have,
// in YOUR recorded history, reached +TARGET% net of fees and slippage before dropping STOP%, at least
// MIN_HIT% of the time". That is a measured claim with a sample size, not a prediction.
//
// Until the history has MIN_SAMPLES similar setups, the trigger falls back to a strict score cutoff
// and the message is explicitly labeled UNCALIBRATED, so you always know which kind you are reading.
import { config } from '../config.js';
import { db } from '../db.js';
import { notify, esc } from './telegram.js';
import { market, fmtUsd } from '../market.js';
import { round } from '../util.js';
import { logger } from '../log.js';
import { gate } from './marketgate.js';

const log = logger('strong');
const C = config.strong;
const HOUR = 3600000;

db.exec(`
CREATE TABLE IF NOT EXISTS strong_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, alert_id INTEGER, mint TEXT NOT NULL, symbol TEXT, name TEXT, ts INTEGER NOT NULL,
  score REAL, mode TEXT, hit_rate REAL, hit_lo REAL, n INTEGER, ref_mcap_usd REAL, target_mcap_usd REAL, stop_mcap_usd REAL,
  gross_target REAL, gross_stop REAL, reasons TEXT, flags TEXT, sent INTEGER, outcome TEXT, peak_mult REAL, labeled INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_strong_ts ON strong_signals(ts);
`);

// Net multiple = gross multiple x round-trip cost factor. Solve for the gross moves that equal +TARGET% / -STOP% net.
const costFactor = (kind) => {
  const P = kind === 'curve' ? config.paper : config.gradPaper;
  return (1 - P.feePct / 100) ** 2 * (1 - P.extraSlippagePct / 100);
};
const grossTarget = (kind) => (1 + C.targetPct / 100) / costFactor(kind);
const grossStop = (kind) => (1 - C.stopPct / 100) / costFactor(kind);

const Q = {
  // One observation per token (its first snapshot inside the score band), so a single runner can't be counted 10 times.
  curveHist: db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN s.max_mcap_after >= s.mcap * @gt AND s.min_before_max > s.mcap * @gs THEN 1 ELSE 0 END) hits
    FROM snapshots s JOIN (SELECT mint, MIN(checkpoint) cp FROM snapshots WHERE reject IS NULL AND max_mcap_after IS NOT NULL AND checkpoint >= 60
      AND score BETWEEN @lo AND @hi AND ts > @since GROUP BY mint) f ON f.mint = s.mint AND f.cp = s.checkpoint`),
  gradHist: db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN s.max_6h >= s.price * @gt AND s.mbm_6h > s.price * @gs THEN 1 ELSE 0 END) hits
    FROM grad_snapshots s JOIN (SELECT mint, MIN(ts) t0 FROM grad_snapshots WHERE reject IS NULL AND labeled = 1 AND mbm_6h IS NOT NULL
      AND score BETWEEN @lo AND @hi AND ts > @since GROUP BY mint) f ON f.mint = s.mint AND f.t0 = s.ts`),
  insert: db.prepare(`INSERT INTO strong_signals (kind,alert_id,mint,symbol,name,ts,score,mode,hit_rate,hit_lo,n,ref_mcap_usd,target_mcap_usd,stop_mcap_usd,gross_target,gross_stop,reasons,flags,sent)
    VALUES (@kind,@alertId,@mint,@symbol,@name,@ts,@score,@mode,@hitRate,@hitLo,@n,@ref,@target,@stop,@gt,@gs,@reasons,@flags,@sent)`),
  lastHour: db.prepare(`SELECT COUNT(*) c FROM strong_signals WHERE ts > ?`),
  unlabeled: db.prepare(`SELECT * FROM strong_signals WHERE labeled = 0`),
  curveAlert: db.prepare(`SELECT finalized, mcap, max_mcap_1h, min_before_max FROM alerts WHERE id = ?`),
  gradAlert: db.prepare(`SELECT finalized, price, max_6h, min_before_max_6h FROM grad_alerts WHERE id = ?`),
  label: db.prepare(`UPDATE strong_signals SET outcome = @outcome, peak_mult = @peak, labeled = 1 WHERE id = @id`),
  recent: db.prepare(`SELECT * FROM strong_signals ORDER BY ts DESC LIMIT ?`),
  summary: db.prepare(`SELECT COUNT(*) total, SUM(ts > @d) last24h, SUM(labeled) labeled, SUM(outcome = 'hit') hits, SUM(outcome = 'stopped') stopped,
    SUM(mode = 'calibrated') calibrated FROM strong_signals`),
};

// Wilson score interval lower bound (95%): how low the true hit rate could plausibly be.
function wilsonLo(hits, n, z = 1.96) {
  if (!n) return 0;
  const p = hits / n, d = 1 + (z * z) / n;
  return ((p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d) * 100;
}

export class Strong {
  constructor() { this.counters = { evaluated: 0, fired: 0, suppressedRate: 0, belowBar: 0 }; }

  history(kind, score) {
    // cached per kind and whole score point for 10 min: the query scans the labeled set and would grow with the DB
    const ck = `${kind}:${Math.round(score)}`, hit = (this._hc ||= new Map()).get(ck);
    if (hit && Date.now() - hit.at < 600000) return hit.v;
    const v = this._history(kind, score); this._hc.set(ck, { at: Date.now(), v }); return v;
  }
  _history(kind, score) {
    const p = { gt: grossTarget(kind), gs: grossStop(kind), lo: score - C.scoreBand, hi: score + C.scoreBand, since: Date.now() - C.lookbackDays * 86400000 };
    const r = (kind === 'curve' ? Q.curveHist : Q.gradHist).get(p);
    const n = r?.n || 0, hits = r?.hits || 0;
    return { n, hits, rate: n ? (hits / n) * 100 : null, lo: wilsonLo(hits, n) };
  }

  /** Called for every regular alert. a: { id, mint, symbol, name, score, mcapUsd, reasons, flags } */
  consider(kind, a) {
    if (!C.enabled) return null;
    this.counters.evaluated++;
    const h = this.history(kind, a.score);
    const calibrated = h.n >= C.minSamples;
    const fallback = kind === 'curve' ? C.fallbackCurveScore : C.fallbackGradScore;
    const pass = calibrated ? h.rate >= C.minHitPct : a.score >= fallback;
    if (!pass) { this.counters.belowBar++; return null; }
    if (gate.enforcing) { this.counters.marketPaused = (this.counters.marketPaused || 0) + 1; log.info(`strong signal for ${a.symbol} held: market COLD`); return null; }
    if (Q.lastHour.get(Date.now() - HOUR).c >= C.maxPerHour) { this.counters.suppressedRate++; log.warn(`strong signal for ${a.symbol} suppressed (hourly cap ${C.maxPerHour})`); return null; }

    const gt = grossTarget(kind), gs = grossStop(kind);
    const row = { kind, alertId: a.id, mint: a.mint, symbol: a.symbol, name: a.name, ts: Date.now(), score: a.score, mode: calibrated ? 'calibrated' : 'uncalibrated',
      hitRate: h.rate, hitLo: h.lo, n: h.n, ref: a.mcapUsd, target: a.mcapUsd ? a.mcapUsd * gt : null, stop: a.mcapUsd ? a.mcapUsd * gs : null, gt, gs,
      reasons: JSON.stringify(a.reasons || []), flags: JSON.stringify(a.flags || []), sent: 0 };

    const where = kind === 'curve' ? 'bonding curve' : 'post-graduation (PumpSwap)';
    const horizon = kind === 'curve' ? '1h' : '6h';
    const evidence = calibrated
      ? `History: <b>${round(h.rate, 0)}%</b> of ${h.n} similar setups (score ${round(a.score - C.scoreBand, 0)}–${round(a.score + C.scoreBand, 0)}) hit +${C.targetPct}% net before −${C.stopPct}% within ${horizon} (95% low bound ${round(h.lo, 0)}%).`
      : `<b>UNCALIBRATED</b>: only ${h.n} similar setups recorded (need ${C.minSamples}). Triggered by score ≥ ${fallback} alone; treat as unproven.`;
    const links = kind === 'curve'
      ? `<a href="https://pump.fun/coin/${a.mint}">pump.fun</a> · <a href="https://dexscreener.com/solana/${a.mint}">DexScreener</a>`
      : `<a href="https://dexscreener.com/solana/${a.mint}">DexScreener</a> · <a href="https://pump.fun/coin/${a.mint}">pump.fun</a>`;
    const html = [
      `<b>STRONG SIGNAL · +${C.targetPct}% setup</b>`,
      `<b>${esc(a.symbol)}</b> · ${esc((a.name || '').slice(0, 40))} · ${where} · score <b>${Math.floor(a.score)}</b>`,
      evidence,
      a.mcapUsd ? `Ref mcap ${fmtUsd(a.mcapUsd)} → target ${fmtUsd(row.target)} (+${C.targetPct}% after costs) · stop ${fmtUsd(row.stop)} (−${C.stopPct}% after costs)` : '',
      (a.reasons || []).length ? `Why: ${esc(a.reasons.slice(0, 4).join(' · '))}` : '',
      (a.flags || []).length ? `Flags: ${esc(a.flags.slice(0, 3).join(' · '))}` : '',
      `<code>${a.mint}</code>`,
      links,
      `<i>Discovery only, not advice. Prices move in seconds; check the chart before acting.</i>`,
    ].filter(Boolean).join('\n');
    row.sent = notify(html, 'strong') ? 1 : 0;
    const id = Number(Q.insert.run(row).lastInsertRowid);
    this.counters.fired++;
    log.info(`STRONG ${kind} ${a.symbol} score ${a.score} mode ${row.mode} n=${h.n}${h.rate != null ? ` hit ${round(h.rate, 0)}%` : ''} sent=${row.sent}`);
    return { id, ...row };
  }

  /** Grade each strong signal once its parent alert is labeled: hit = reached the gross target before the gross stop. */
  label() {
    for (const s of Q.unlabeled.all()) {
      if (s.kind === 'curve') {
        const a = Q.curveAlert.get(s.alert_id); if (!a?.finalized) continue;
        const peak = a.max_mcap_1h / a.mcap, trough = a.min_before_max / a.mcap;
        Q.label.run({ id: s.id, peak, outcome: peak >= s.gross_target && trough > s.gross_stop ? 'hit' : trough <= s.gross_stop ? 'stopped' : 'flat' });
      } else {
        const a = Q.gradAlert.get(s.alert_id); if (!a?.finalized) continue;
        const peak = a.max_6h, trough = a.min_before_max_6h;
        Q.label.run({ id: s.id, peak, outcome: peak >= s.gross_target && trough > s.gross_stop ? 'hit' : trough <= s.gross_stop ? 'stopped' : 'flat' });
      }
    }
  }

  view(limit = 30) {
    const s = Q.summary.get({ d: Date.now() - 86400000 });
    const curve = this.history('curve', config.scoring.alertScore + C.scoreBand);
    const grad = this.history('grad', config.grads.alertScore + C.scoreBand);
    return {
      config: { ...C, grossTargetCurve: grossTarget('curve'), grossTargetGrad: grossTarget('grad'), grossStopCurve: grossStop('curve'), grossStopGrad: grossStop('grad') },
      summary: { ...s, hitRatePct: s.labeled ? (s.hits / s.labeled) * 100 : null },
      readiness: { curve, grad },
      counters: this.counters,
      rows: Q.recent.all(limit).map((r) => ({ ...r, reasons: JSON.parse(r.reasons || '[]'), flags: JSON.parse(r.flags || '[]') })),
      solUsd: market.solUsd,
    };
  }
}
