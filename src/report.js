// Two-week performance comparison report.
//
// Answers the questions that decide what happens next, each with a verdict that stays
// "NOT ENOUGH DATA" until the sample can actually support an answer:
//   1. Is either curve book (main >= alert score, band 65-72) profitable after costs?
//   2. Is the band book better than the main book?
//   3. Should the market-conditions pause be enforced (do COLD entries do worse than WARM)?
//   4. Is the graduates book profitable?
//   5. Are strong signals hitting +target% before -stop% often enough (breakeven = stop / (target + stop))?
//   6. Is anything ready for real money (profitable overall AND in both weeks separately)?
// Plus data coverage, because a report built on 30% of the hours is not a two-week report.
import { config } from './config.js';
import { db } from './db.js';
import { killStatsFrom, BOOKS, STRATEGIES } from './engine/paper.js';
import { CFG, CFG_SINCE } from './version.js';
import { market } from './market.js';

const DAY = 86400000, HOUR = 3600000;
// p*target = (1-p)*stop  ->  p = stop / (target + stop). +25% / -38.5% -> 60.6%
const BREAKEVEN_PCT = (config.strong.stopPct / (config.strong.targetPct + config.strong.stopPct)) * 100;

try { db.exec('CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at)'); } catch { /* ignore */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_paper_exit ON paper_trades(exit_ts)'); } catch { /* ignore */ }

const SQL = {
  curve: (`SELECT id, book, rules, gated, score, market, entry_ts, exit_ts, pnl_pct, pnl_sol, exit_reason FROM paper_trades
    WHERE status='closed' AND exit_ts >= ? AND cfg = ? AND COALESCE(gap,0) = 0 ORDER BY exit_ts`),
  grad: (`SELECT id, entry_ts, exit_ts, pnl_pct, pnl_sol, exit_reason FROM grad_paper WHERE status='closed' AND exit_ts >= ? AND COALESCE(book,'fixed') IN ('fixed','trail') ORDER BY exit_ts`),
  hours: (`SELECT DISTINCT CAST(created_at / ${HOUR} AS INTEGER) h FROM tokens WHERE created_at >= ?`),
  launches: (`SELECT created_at t FROM tokens WHERE created_at >= ?`),
  alerts: (`SELECT ts t FROM alerts WHERE ts >= ?`),
  gradAlerts: (`SELECT ts t FROM grad_alerts WHERE ts >= ?`),
  strong: (`SELECT ts t, kind, mode, outcome, labeled FROM strong_signals WHERE ts >= ?`),
};
// Prepared lazily so a fresh database can boot regardless of module import order.
const Q = new Proxy({}, { get: (c, k) => (c[k] ||= db.prepare(SQL[k])) });

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const variance = (a) => { if (a.length < 2) return null; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
function wilson(h, n, z = 1.96) {
  if (!n) return [null, null];
  const p = h / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [((c - s) / d) * 100, ((c + s) / d) * 100];
}
/** Welch 95% CI for mean(a) - mean(b), in percentage points of P&L per trade */
function diffCI(a, b) {
  if (a.length < 2 || b.length < 2) return { diff: a.length && b.length ? mean(a) - mean(b) : null, lo: null, hi: null };
  const d = mean(a) - mean(b), se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return { diff: d, lo: d - 1.96 * se, hi: d + 1.96 * se };
}
function summarize(rows) {
  const p = rows.map((r) => r.pnl_pct);
  const wins = p.filter((x) => x > 0).length;
  const m = mean(p), v = variance(p), se = v != null ? Math.sqrt(v / p.length) : null;
  const [wlo, whi] = wilson(wins, p.length);
  return {
    n: p.length, wins, winRatePct: p.length ? (wins / p.length) * 100 : null, winLo: wlo, winHi: whi,
    avgPct: m, ciLowPct: se != null ? m - 1.96 * se : null, ciHighPct: se != null ? m + 1.96 * se : null,
    pnlSol: rows.reduce((s, r) => s + (r.pnl_sol || 0), 0), medianPct: p.length ? [...p].sort((a, b) => a - b)[Math.floor(p.length / 2)] : null,
  };
}
const marketState = (r) => { try { return JSON.parse(r.market || '{}').state || 'UNKNOWN'; } catch { return 'UNKNOWN'; } };

let cache = { key: '', at: 0, data: null };

export function buildReport({ days = 14, tzOffsetMin = 0 } = {}) {
  days = Math.max(1, Math.min(60, Math.round(days)));
  const key = `${days}:${tzOffsetMin}`;
  if (cache.key === key && Date.now() - cache.at < 60000) return cache.data;

  const now = Date.now();
  const off = -tzOffsetMin * 60000; // client local time = UTC + off
  const dayIdx = (t) => Math.floor((t + off) / DAY);
  const today = dayIdx(now);
  const firstDay = today - days + 1;
  const since = firstDay * DAY - off;
  const half = since + (now - since) / 2; // week 1 / week 2 split (by exit time)

  const curve = Q.curve.all(since, CFG);
  const books = {};
  for (const b of BOOKS) books[b] = curve.filter((r) => (r.book || 'main') === b && !r.gated);
  books.grad = Q.grad.all(since);

  // ---- per-book summary, weekly split, kill rule ----
  const bookOut = {};
  for (const [k, rows] of Object.entries(books)) {
    bookOut[k] = {
      ...summarize(rows),
      week1: summarize(rows.filter((r) => r.exit_ts < half)),
      week2: summarize(rows.filter((r) => r.exit_ts >= half)),
      kill: (({ status, n, needed, checks }) => ({ status, n, needed, checks }))(killStatsFrom(rows, { control: k === 'random' || k === 'grad' || k === 'runnerActl' || k === 'unpricedctl' || !books.random ? null : k === 'runnerA' ? (books.runnerActl || null) : k === 'unpriced' ? (books.unpricedctl || null) : books.random })),
      exits: Object.entries(rows.reduce((m, r) => { const e = (r.exit_reason || '?').replace(/[-+]?\d+(\.\d+)?%?/g, '').replace(/\s+/g, ' ').trim(); m[e] = (m[e] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
    };
  }

  // ---- market conditions: WARM vs COLD (both curve books, all entries incl. gated) ----
  const byState = (st) => curve.filter((r) => marketState(r) === st);
  const warm = byState('WARM'), cold = byState('COLD');
  const gateDiff = diffCI(warm.map((r) => r.pnl_pct), cold.map((r) => r.pnl_pct));
  const marketCmp = {
    WARM: summarize(warm), COLD: summarize(cold), UNKNOWN: summarize(byState('UNKNOWN')),
    perBook: Object.fromEntries(BOOKS.map((b) => [b, { WARM: summarize(warm.filter((r) => (r.book || 'main') === b)), COLD: summarize(cold.filter((r) => (r.book || 'main') === b)) }])),
    warmMinusCold: gateDiff,
  };

  // ---- band vs main ----
  const bandVsMain = diffCI(books.band.map((r) => r.pnl_pct), books.main.map((r) => r.pnl_pct));

  // ---- strong signals ----
  const strongRows = Q.strong.all(since);
  const sLab = strongRows.filter((r) => r.labeled);
  const sHits = sLab.filter((r) => r.outcome === 'hit').length;
  const [sLo, sHi] = wilson(sHits, sLab.length);
  const strong = { n: strongRows.length, labeled: sLab.length, hits: sHits, hitRatePct: sLab.length ? (sHits / sLab.length) * 100 : null, lo: sLo, hi: sHi,
    calibrated: strongRows.filter((r) => r.mode === 'calibrated').length };

  // ---- coverage ----
  const hours = new Set(Q.hours.all(since).map((r) => r.h));
  const possibleHours = Math.max(1, Math.ceil((now - since) / HOUR));
  const coverage = { hours: hours.size, possibleHours, pct: (hours.size / possibleHours) * 100 };

  // ---- daily table ----
  const daily = [];
  const bucket = (arr, f = (r) => r.t) => { const m = new Map(); for (const r of arr) { const d = dayIdx(f(r)); m.set(d, (m.get(d) || 0) + 1); } return m; };
  const launches = bucket(Q.launches.all(since)), alerts = bucket(Q.alerts.all(since)), gAlerts = bucket(Q.gradAlerts.all(since)), strongB = bucket(strongRows);
  const hoursByDay = new Map(); for (const h of hours) { const d = dayIdx(h * HOUR); hoursByDay.set(d, (hoursByDay.get(d) || 0) + 1); }
  for (let d = firstDay; d <= today; d++) {
    const inDay = (rows) => rows.filter((r) => dayIdx(r.exit_ts) === d);
    const dayCurve = curve.filter((r) => dayIdx(r.entry_ts) === d);
    daily.push({
      day: d, date: new Date(d * DAY).toISOString().slice(0, 10),
      hours: hoursByDay.get(d) || 0, launches: launches.get(d) || 0, alerts: alerts.get(d) || 0, gradAlerts: gAlerts.get(d) || 0, strong: strongB.get(d) || 0,
      books: Object.fromEntries(Object.keys(books).map((b) => [b, summarize(inDay(books[b]))])),
      coldSharePct: dayCurve.length ? (dayCurve.filter((r) => marketState(r) === 'COLD').length / dayCurve.length) * 100 : null,
    });
  }

  // ---- cumulative equity per book (SOL; client converts to USD) ----
  const equity = {};
  for (const [k, rows] of Object.entries(books)) { let e = 0; equity[k] = rows.map((r) => [r.exit_ts, (e += r.pnl_sol || 0)]); }

  // ---- verdicts ----
  const K = config.killRule;
  const minCmp = 30, minGate = 20;
  const v = [];
  const bookVerdict = (k, label) => {
    const b = bookOut[k];
    if (b.n < K.minTrades) return { q: `Is the ${label} profitable after costs?`, verdict: 'NOT ENOUGH DATA', tone: 'wait', detail: `${b.n} of ${K.minTrades} trades.${b.n ? ` So far ${fmt(b.avgPct)} per trade, ${fmt0(b.winRatePct)} win.` : ''}` };
    if (b.ciLowPct > 0) return { q: `Is the ${label} profitable after costs?`, verdict: 'YES', tone: 'good', detail: `${fmt(b.avgPct)} per trade, 95% range ${fmt(b.ciLowPct)} to ${fmt(b.ciHighPct)} over ${b.n} trades.` };
    if (b.ciHighPct < 0) return { q: `Is the ${label} profitable after costs?`, verdict: 'NO', tone: 'bad', detail: `${fmt(b.avgPct)} per trade, 95% range ${fmt(b.ciLowPct)} to ${fmt(b.ciHighPct)}: losing with confidence.` };
    return { q: `Is the ${label} profitable after costs?`, verdict: 'UNCLEAR', tone: 'wait', detail: `${fmt(b.avgPct)} per trade, but the 95% range (${fmt(b.ciLowPct)} to ${fmt(b.ciHighPct)}) includes zero.` };
  };
  v.push(bookVerdict('main', `main book (score ≥ ${config.scoring.alertScore})`));
  v.push(bookVerdict('band', `band book (${config.band.lo}–${config.band.hi})`));
  {
    const nb = bookOut.band.n, nm = bookOut.main.n, d = bandVsMain;
    const q = `Is the ${config.band.lo}–${config.band.hi} band better than the main book?`;
    if (nb < minCmp || nm < minCmp) v.push({ q, verdict: 'NOT ENOUGH DATA', tone: 'wait', detail: `Needs ${minCmp}+ trades in each (band ${nb}, main ${nm}).${d.diff != null ? ` Gap so far: ${fmtPts(d.diff)}.` : ''}` });
    else if (d.lo > 0) v.push({ q, verdict: 'YES', tone: 'good', detail: `Band beats main by ${fmtPts(d.diff)} per trade (95% range ${fmtPts(d.lo)} to ${fmtPts(d.hi)}). Consider moving the alert threshold down.` });
    else if (d.hi < 0) v.push({ q, verdict: 'NO', tone: 'bad', detail: `Main beats band by ${fmtPts(-d.diff)} per trade (95% range ${fmtPts(-d.hi)} to ${fmtPts(-d.lo)}).` });
    else v.push({ q, verdict: 'NO DIFFERENCE YET', tone: 'wait', detail: `Gap ${fmtPts(d.diff)} per trade, 95% range ${fmtPts(d.lo)} to ${fmtPts(d.hi)} includes zero.` });
  }
  {
    const q = 'Should the market-conditions pause be enforced?';
    const nw = warm.length, nc = cold.length, d = gateDiff;
    if (nw < minGate || nc < minGate) v.push({ q, verdict: 'NOT ENOUGH DATA', tone: 'wait', detail: `Needs ${minGate}+ entries in each state (WARM ${nw}, COLD ${nc}). Keep MARKET_GATE_MODE=shadow.` });
    else if (d.lo > 0) v.push({ q, verdict: 'YES', tone: 'good', detail: `WARM entries beat COLD by ${fmtPts(d.diff)} per trade (95% range ${fmtPts(d.lo)} to ${fmtPts(d.hi)}). Set MARKET_GATE_MODE=enforce.` });
    else if (d.hi < 0) v.push({ q, verdict: 'NO', tone: 'bad', detail: `COLD entries did better than WARM by ${fmtPts(-d.diff)}. The pause would cut good trades; leave it in shadow or remove it.` });
    else v.push({ q, verdict: 'NOT PROVEN', tone: 'wait', detail: `WARM − COLD gap ${fmtPts(d.diff)} per trade, 95% range ${fmtPts(d.lo)} to ${fmtPts(d.hi)} includes zero. Keep shadow mode.` });
  }
  for (const b of BOOKS.filter((x) => !['main', 'band', 'random'].includes(x))) v.push(bookVerdict(b, `${STRATEGIES[b].label} book (${STRATEGIES[b].entry})`));
  v.push(bookVerdict('grad', 'graduates book'));
  {
    const q = 'Does any strategy beat random picks from the same moments?';
    const r = books.random || [], nr = r.length;
    const res = BOOKS.filter((b) => b !== 'random').map((b) => ({ b, d: diffCI(books[b].map((x) => x.pnl_pct), r.map((x) => x.pnl_pct)), n: books[b].length }));
    const ok = res.filter((x) => x.n >= minCmp && nr >= minCmp);
    if (!ok.length) v.push({ q, verdict: 'NOT ENOUGH DATA', tone: 'wait', detail: `Needs ${minCmp}+ trades in a book and in the Random control (Random has ${nr}).` });
    else { const win = ok.filter((x) => x.d.lo > 0); v.push(win.length ? { q, verdict: 'YES', tone: 'good', detail: win.map((x) => `${STRATEGIES[x.b].label} beats random by ${fmtPts(x.d.diff)} (95% ${fmtPts(x.d.lo)} to ${fmtPts(x.d.hi)})`).join('; ') + '.' }
      : { q, verdict: 'NO', tone: 'bad', detail: `No book's 95% range against Random is above zero (${ok.map((x) => `${STRATEGIES[x.b].label} ${fmtPts(x.d.diff)}`).join(', ')}). The score is not yet shown to beat chance.` }); }
  }
  {
    const q = `Are strong signals hitting +${config.strong.targetPct}% before −${config.strong.stopPct}% often enough?`;
    if (strong.labeled < 30) v.push({ q, verdict: 'NOT ENOUGH DATA', tone: 'wait', detail: `${strong.labeled} of 30 strong signals graded.${strong.hitRatePct != null ? ` ${fmt0(strong.hitRatePct)} hit so far.` : ''} Breakeven is ${BREAKEVEN_PCT.toFixed(0)}%.` });
    else if (strong.lo > BREAKEVEN_PCT) v.push({ q, verdict: 'YES', tone: 'good', detail: `${fmt0(strong.hitRatePct)} hit (95% low bound ${fmt0(strong.lo)}) over ${strong.labeled}, above the ${BREAKEVEN_PCT.toFixed(0)}% breakeven.` });
    else if (strong.hi < BREAKEVEN_PCT) v.push({ q, verdict: 'NO', tone: 'bad', detail: `${fmt0(strong.hitRatePct)} hit (95% high bound ${fmt0(strong.hi)}): below the ${BREAKEVEN_PCT.toFixed(0)}% breakeven.` });
    else v.push({ q, verdict: 'UNCLEAR', tone: 'wait', detail: `${fmt0(strong.hitRatePct)} hit over ${strong.labeled}; the 95% range (${fmt0(strong.lo)}–${fmt0(strong.hi)}) straddles ${BREAKEVEN_PCT.toFixed(0)}%.` });
  }
  {
    const q = 'Is anything ready for real money?';
    const ready = Object.keys(books).filter((k) => k !== 'random' && bookOut[k].kill.status === 'PASS');
    if (coverage.pct < 80) v.push({ q, verdict: 'NO', tone: 'bad', detail: `Only ${fmt0(coverage.pct)} of hours were recorded. The report needs ~80%+ coverage, which means running 24/7 on a VPS.${ready.length ? ` (${ready.join(', ')} look promising.)` : ''}` });
    else if (ready.length) v.push({ q, verdict: 'CANDIDATE', tone: 'good', detail: `${ready.join(', ')}: profitable overall with a positive 95% low bound, and positive in both weeks separately. Next step is tiny live size with hard limits, not full size.` });
    else v.push({ q, verdict: 'NO', tone: 'bad', detail: 'No book is profitable overall with confidence AND positive in both weeks separately.' });
  }

  const data = {
    generatedAt: now, days, since, until: now, splitAt: half, tzOffsetMin, rules: config.paper.rules, cfg: CFG, cfgSince: CFG_SINCE, breakevenPct: BREAKEVEN_PCT,
    band: config.band, alertScore: config.scoring.alertScore, gateMode: config.marketGate.mode, solUsd: market.solUsd,
    bookOrder: [...BOOKS, 'grad'], bookLabels: { ...Object.fromEntries(BOOKS.map((b) => [b, STRATEGIES[b].label])), grad: 'Graduates' }, bookEntry: { ...Object.fromEntries(BOOKS.map((b) => [b, STRATEGIES[b].entry])), grad: 'post-graduation re-ignition score ≥ 70' },
    coverage, books: bookOut, marketCmp, bandVsMain, strong, daily, equity, verdicts: v,
  };
  cache = { key, at: Date.now(), data };
  return data;
}

function fmt(x) { return x == null ? '–' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`; }
function fmt0(x) { return x == null ? '–' : `${Math.round(x)}%`; }
function fmtPts(x) { return x == null ? '–' : `${x > 0 ? '+' : ''}${x.toFixed(1)} pts`; }
