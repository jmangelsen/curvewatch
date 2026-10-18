// Drill-downs: every tile on the dashboard opens a detail sheet backed by this module.
// Each handler returns a generic shape the client renders the same way:
//   { title, explain, stats: [[label, value, fmt]], series: { label, fmt, kind, points: [[t, v]] }, table: { cols, rows }, note }
// Values are raw (SOL amounts, SOL mcaps, ms timestamps); the client converts SOL to USD with the live price.
import { db } from './db.js';
import { config } from './config.js';
import { runGradBacktest, gradBacktestTrades } from './engine/gradBacktest.js';
import { SECTIONS, SHORT, simulationParams } from './compliance.js';
import { market, fmtUsd } from './market.js';
import { CFG, CFG_SINCE, cfgHistory } from './version.js';
import { benchmarks } from './benchmarks.js';
import { trackerView, walletDetail } from './engine/smartTracker.js';
import { rejectsView, rejectRows } from './engine/rejects.js';
import { closedCurrent, killStatsFrom, STRATEGIES, gate24h, pairedBooks } from './engine/paper.js';
import { sequentialVerdict, confidenceSequence } from './engine/seqtest.js';

const H = 3600000, D = 86400000;
const solHist = []; // [t, usd] one per minute, 48 h, in memory
const sampleSol = () => { if (market.solUsd) { solHist.push([Date.now(), market.solUsd]); if (solHist.length > 2880) solHist.shift(); } };
setTimeout(sampleSol, 15000); setInterval(sampleSol, 60000);

const C = (h, k, fmt = 'text', o = {}) => ({ h, k, fmt, ...o });
const T_ = () => config.smartTracker;
const n1 = (v) => (Math.round(v * 10) / 10).toString();
const bucket = (rows, size, since, val = () => 1) => {
  const m = new Map();
  for (let t = Math.floor(since / size) * size; t <= Date.now(); t += size) m.set(t, 0);
  for (const r of rows) { const b = Math.floor(r.t / size) * size; if (m.has(b)) m.set(b, m.get(b) + val(r)); }
  return [...m.entries()];
};
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const tradeCols = [C('Closed', 'exit_ts', 'time'), C('Book', 'book', 'book'), C('Token', 'symbol', 'token'), C('P&L', 'pnl_pct', 'spct'), C('P&L $', 'pnl_sol', 'susd'),
  C('Held', 'held', 'age'), C('Exit', 'exit_reason')];
const tradeRow = (r) => ({ ...r, held: r.exit_ts && r.entry_ts ? (r.exit_ts - r.entry_ts) / 1000 : null });
const byBook = (rows) => Object.entries(rows.reduce((m, r) => ((m[r.book || 'main'] ||= []).push(r), m), {})).map(([b, rs]) => { const k = killStatsFrom(rs); return { book: b, n: k.n, avg: k.expectancyPct, win: k.winRatePct, pnl: k.totalPnlSol, worst: k.worstPct, best: k.bestPct }; });
const bookCols = [C('Book', 'book', 'book'), C('Trades', 'n', 'num'), C('Avg', 'avg', 'spct'), C('Win', 'win', 'pct'), C('Best', 'best', 'spct'), C('Worst', 'worst', 'spct'), C('P&L $', 'pnl', 'susd')];

function paperDrill(focus) {
  const rows = closedCurrent().filter((r) => !r.gated && r.book !== 'random');
  const main = rows.filter((r) => (r.book || 'main') === 'main');
  const k = killStatsFrom(main);
  const sorted = [...rows].sort((a, b) => b.exit_ts - a.exit_ts).slice(0, 200).map(tradeRow);
  const dist = [[-100, -40], [-40, -25], [-25, -15], [-15, -5], [-5, 0], [0, 10], [10, 25], [25, 50], [50, 100], [100, 1e9]].map(([lo, hi]) => [`${lo}…${hi > 1e8 ? '' : hi}`, rows.filter((r) => r.pnl_pct >= lo && r.pnl_pct < hi).length]);
  let eq = 0;
  const T = { pnl: 'Paper P&L', exp: 'Expectancy per trade', win: 'Win rate', pf: 'Profit factor', best: 'Best and worst trades', n: 'Trades in window' }[focus] || 'Paper trading';
  return {
    title: T,
    explain: {
      pnl: 'Sum of realized profit and loss across closed Main-book paper trades in the current test, after the curve fee both ways, extra slippage, and entry/exit delays. Converted from SOL at the live SOL price.',
      exp: 'Average return per closed trade, after costs. The kill rule needs the 99% lower bound of this above zero, both halves of the test positive, and beating the Random control.',
      win: 'Share of closed trades with a positive net return. Win rate alone is misleading: a 40% win rate is profitable if winners are much larger than losers.',
      pf: 'Gross winning returns divided by gross losing returns. Above 1.0 means winners outweigh losers.',
      best: 'Largest and smallest single-trade returns. One outlier can carry an average; check whether the result survives without it.',
      n: 'Closed trades that count toward the current test: same settings fingerprint, no data gap, not paused by the market gate.',
    }[focus] || 'Closed paper trades in the current test.',
    stats: [['Trades (Main)', k.n, 'num'], ['Avg / trade', k.expectancyPct, 'spct'], ['95% range', `${k.ciLowPct?.toFixed(1)} … ${k.ciHighPct?.toFixed(1)}%`, 'text'], ['Win rate', k.winRatePct, 'pct'],
      ['Profit factor', k.profitFactor, 'num2'], ['Total', k.totalPnlSol, 'susd'], ['Best', k.bestPct, 'spct'], ['Worst', k.worstPct, 'spct']],
    series: focus === 'win' || focus === 'best'
      ? { label: 'Distribution of trade returns (%)', kind: 'cat', fmt: 'num', points: dist }
      : { label: 'Cumulative P&L, all books (USD)', kind: 'line', fmt: 'susd', points: [...rows].sort((a, b) => a.exit_ts - b.exit_ts).map((r) => [r.exit_ts, (eq += r.pnl_sol)]) },
    tables: [{ title: 'By book', cols: bookCols, rows: byBook(rows) }, { title: 'Closed trades, newest first', cols: tradeCols, rows: sorted }],
    note: `Settings fingerprint ${CFG}, test since ${new Date(CFG_SINCE).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
  };
}

export function makeDrill({ engine, grads, edgeView = () => null, edgeDetail = () => null, runners = null, codex = null }) {
  const H_ = {
    launches() {
      const since = Date.now() - 3 * H;
      const rows = all(`SELECT created_at t FROM tokens WHERE created_at > ?`, since);
      const last = all(`SELECT mint, symbol, created_at, initial_mcap, initial_buy_sol, creator, graduated, peak_mcap_1h, has_twitter, has_telegram FROM tokens ORDER BY created_at DESC LIMIT 60`);
      const perMin = bucket(rows, 60000, since);
      const v = perMin.map((p) => p[1]).sort((a, b) => a - b);
      return { title: 'Launches per minute', explain: 'Every Pump.fun create event seen by the feeds. This is the market activity baseline: fewer launches usually means fewer runners and a colder tape.',
        stats: [['Last 60 min', rows.filter((r) => r.t > Date.now() - H).length, 'num'], ['Median / min (3 h)', v[v.length >> 1], 'num'], ['Slowest 5%', v[Math.floor(v.length * 0.05)], 'num'], ['Busiest 5%', v[Math.floor(v.length * 0.95)], 'num']],
        series: { label: 'Launches per minute, last 3 h', kind: 'bar', fmt: 'num', points: perMin },
        tables: [{ title: 'Newest launches', cols: [C('Time', 'created_at', 'time'), C('Token', 'symbol', 'token'), C('Start mcap', 'initial_mcap', 'mcap'), C('Dev buy', 'initial_buy_sol', 'solusd'), C('Socials', 'soc'), C('Peak 1 h', 'peak_mcap_1h', 'mcap'), C('Grad', 'graduated', 'yes')],
          rows: last.map((r) => ({ ...r, soc: [r.has_twitter && 'X', r.has_telegram && 'TG'].filter(Boolean).join(' ') || '–' })) }] };
    },
    tracking() {
      const toks = [...engine.tokens.values()].filter((t) => !t.lite).sort((a, b) => b.mcap - a.mcap).slice(0, 80);
      return { title: 'Tokens tracked now', explain: 'Tokens held in memory with a full trade history: every launch for its first minutes, plus anything still active on its curve. Rows open the token detail.',
        stats: [['In memory', engine.tokens.size, 'num'], ['Full tracking', toks.length, 'num'], ['Scored, not rejected', toks.filter((t) => t.lastScore && !t.lastScore.reject).length, 'num']],
        tables: [{ title: 'By market cap', cols: [C('Token', 'symbol', 'token'), C('Age', 'age', 'age'), C('Mcap', 'mcap', 'mcap'), C('Curve', 'progress', 'pct'), C('Buyers', 'buyers', 'num'), C('Score', 'score', 'num0'), C('Status', 'status')],
          rows: toks.map((t) => ({ mint: t.mint, symbol: t.symbol, age: t.ageSec, mcap: t.mcap, progress: t.progress, buyers: t.buyers?.size, score: t.lastScore?.score, status: t.graduated ? 'graduated' : t.lastScore?.reject || (t.alertId ? 'alerted' : 'watching') })) }] };
    },
    grads() {
      const since = Date.now() - D;
      const rows = all(`SELECT mint, symbol, created_at, graduated_at, alerted, max_score FROM tokens WHERE graduated = 1 AND graduated_at > ? ORDER BY graduated_at DESC`, since);
      const launches = one(`SELECT COUNT(*) n FROM tokens WHERE created_at > ?`, since).n;
      return { title: 'Graduations', explain: 'Tokens that completed the bonding curve and migrated to a DEX pool. Base rate for "does the screener pick better than average".',
        stats: [['Last hour', rows.filter((r) => r.graduated_at > Date.now() - H).length, 'num'], ['Last 24 h', rows.length, 'num'], ['Rate (24 h)', launches ? (rows.length / launches) * 100 : null, 'pct2'], ['Alerted first', rows.filter((r) => r.alerted).length, 'num']],
        series: { label: 'Graduations per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows.map((r) => ({ t: r.graduated_at })), H, since) },
        tables: [{ title: 'Graduated tokens, last 24 h', cols: [C('Graduated', 'graduated_at', 'time'), C('Token', 'symbol', 'token'), C('Time to grad', 'ttg', 'age'), C('Max score', 'max_score', 'num0'), C('Alerted', 'alerted', 'yes')],
          rows: rows.map((r) => ({ ...r, ttg: (r.graduated_at - r.created_at) / 1000 })) }] };
    },
    alerts() {
      const rows = all(`SELECT id, mint, ts, score, mcap, age_sec, progress, max_multiple, graduated, finalized, gap, (SELECT symbol FROM tokens t WHERE t.mint = a.mint) symbol FROM alerts a ORDER BY ts DESC LIMIT 150`);
      const lab = rows.filter((r) => r.finalized === 1);
      return { title: 'Alerts', explain: `Tokens whose score crossed ${config.scoring.alertScore}. Each is labeled 1 hour later with the best multiple reached and whether it graduated. "Lost" = the process restarted inside the hour, so the outcome is unknown and excluded.`,
        stats: [['Shown', rows.length, 'num'], ['Labeled', lab.length, 'num'], ['Reached 2x', lab.length ? (lab.filter((r) => r.max_multiple >= 2).length / lab.length) * 100 : null, 'pct'], ['Graduated', lab.length ? (lab.filter((r) => r.graduated).length / lab.length) * 100 : null, 'pct'], ['Lost to restarts', rows.filter((r) => r.finalized === -1).length, 'num']],
        series: { label: 'Alerts per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows.map((r) => ({ t: r.ts })), H, Date.now() - D) },
        tables: [{ title: 'Newest alerts', cols: [C('Time', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num0'), C('Mcap', 'mcap', 'mcap'), C('Age', 'age_sec', 'age'), C('Best 1 h', 'max_multiple', 'mult'), C('Grad', 'graduated', 'yes'), C('Label', 'label')],
          rows: rows.map((r) => ({ ...r, label: r.finalized === 1 ? (r.gap ? 'gap' : 'done') : r.finalized === -1 ? 'lost' : 'pending' })) }] };
    },
    paper_pnl: () => paperDrill('pnl'), paper_exp: () => paperDrill('exp'), paper_win: () => paperDrill('win'), paper_pf: () => paperDrill('pf'), paper_best: () => paperDrill('best'), paper_n: () => paperDrill('n'),
    sol() {
      return { title: 'SOL / USD', explain: 'Reference price from the deepest SOL/USDC pool. Every dollar figure on the dashboard uses it. History is kept in memory for 48 hours.',
        stats: [['Now', market.solUsd, 'usd2'], ['Updated', market.solUsdAt ? (Date.now() - market.solUsdAt) / 1000 : null, 'age'], ['1 h change', solHist.length > 60 ? (market.solUsd / solHist[solHist.length - 61][1] - 1) * 100 : null, 'spct']],
        series: { label: 'SOL price since restart', kind: 'line', fmt: 'usd2', points: solHist } };
    },
    // ---- graduates tab ----
    g_watch() {
      const rows = all(`SELECT w.mint, w.symbol, w.added_at, w.mig_mcap, w.mig_price, w.peak_price, w.dex, s.price, s.mcap, s.liq, s.score, s.reject FROM grad_watch w
        LEFT JOIN grad_snapshots s ON s.mint = w.mint AND s.ts = (SELECT MAX(ts) FROM grad_snapshots x WHERE x.mint = w.mint) WHERE w.active = 1 ORDER BY s.score DESC NULLS LAST LIMIT 150`);
      return { title: 'Watched graduates', explain: 'Migrated tokens polled on their DEX pool. Each poll scores the chart for a second leg (re-ignition). "vs migration" compares the current price with the price at migration.',
        stats: [['Watching', rows.length, 'num'], ['Above migration', rows.filter((r) => r.price && r.mig_price && r.price > r.mig_price).length, 'num'], ['Scored', rows.filter((r) => r.score != null && !r.reject).length, 'num']],
        tables: [{ title: 'By score', cols: [C('Token', 'symbol', 'token'), C('Since mig', 'age', 'age'), C('Mcap', 'mcap', 'usd'), C('Liquidity', 'liq', 'usd'), C('vs migration', 'vs', 'spct'), C('Peak vs mig', 'pk', 'spct'), C('Score', 'score', 'num0'), C('Status', 'reject')],
          rows: rows.map((r) => ({ ...r, age: (Date.now() - r.added_at) / 1000, vs: r.price && r.mig_price ? (r.price / r.mig_price - 1) * 100 : null, pk: r.peak_price && r.mig_price ? (r.peak_price / r.mig_price - 1) * 100 : null, reject: r.reject || 'scored' })) }] };
    },
    g_alerts() {
      const rows = all(`SELECT * FROM grad_alerts ORDER BY ts DESC LIMIT 100`);
      const lab = rows.filter((r) => r.finalized);
      return { title: 'Re-ignition alerts', explain: 'Graduates whose post-migration chart scored above the alert line. Labeled 6 hours later with the best move and the drawdown before it.',
        stats: [['Last 24 h', rows.filter((r) => r.ts > Date.now() - D).length, 'num'], ['Labeled', lab.length, 'num'], ['Reached +50% in 6 h', lab.length ? (lab.filter((r) => r.max_6h >= 1.5 * r.price).length / lab.length) * 100 : null, 'pct']],
        series: { label: 'Alerts per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows.map((r) => ({ t: r.ts })), H, Date.now() - D) },
        tables: [{ title: 'Newest', cols: [C('Time', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num0'), C('Mcap', 'mcap', 'usd'), C('Liquidity', 'liq', 'usd'), C('vs mig', 'vm', 'spct'), C('Best 6 h', 'b6', 'spct')],
          rows: rows.map((r) => ({ ...r, vm: r.vs_mig != null ? (r.vs_mig - 1) * 100 : null, b6: r.max_6h && r.price ? (r.max_6h / r.price - 1) * 100 : null })) }] };
    },
    g_labeled() {
      const since = Date.now() - D;
      const rows = all(`SELECT ts t, labeled FROM grad_snapshots WHERE ts > ?`, since);
      const tot = one(`SELECT COUNT(*) n, SUM(labeled) l FROM grad_snapshots`);
      // score band -> what happened in the next 6 h (labeled, non-rejected polls only)
      const bands = all(`SELECT CASE WHEN score >= 85 THEN '85+' WHEN score >= 70 THEN '70–84' WHEN score >= 50 THEN '50–69' WHEN score >= 30 THEN '30–49' ELSE '< 30' END band,
          MIN(score) lo, COUNT(*) n, AVG(max_6h >= 1.5 * price) p50, AVG(max_6h >= 2 * price) p100, AVG(price_6h >= price) up, AVG(min_6h <= 0.615 * price) stop
        FROM grad_snapshots WHERE labeled = 1 AND reject IS NULL AND price > 0 AND max_6h IS NOT NULL GROUP BY band ORDER BY lo DESC`);
      const recent = all(`SELECT g.mint, g.ts, g.score, g.mcap, g.liq, g.price, g.max_6h, g.min_6h, g.price_6h, g.reject, w.symbol FROM grad_snapshots g LEFT JOIN grad_watch w ON w.mint = g.mint
        WHERE g.labeled = 1 AND g.price > 0 ORDER BY g.ts DESC LIMIT 150`);
      return { title: 'Labeled graduate snapshots', explain: 'Every poll of a graduate is stored with its features; 6 hours later it is labeled with what happened next. These rows train and check the re-ignition score. The band table is the calibration: if higher scores do not reach +50% more often, the score has no information.',
        stats: [['Recorded', tot.n, 'num'], ['Labeled', tot.l, 'num'], ['Last 24 h', rows.length, 'num']],
        series: { label: 'Snapshots per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows, H, since) },
        tables: [
          { title: 'Outcome by score band (6 h after the poll)', cols: [C('Score', 'band'), C('Polls', 'n', 'num'), C('Reached +50%', 'p50', 'pct'), C('Reached +100%', 'p100', 'pct'), C('Higher at 6 h', 'up', 'pct'), C('Hit −38.5% first', 'stop', 'pct')],
            rows: bands.map((b) => ({ ...b, p50: b.p50 * 100, p100: b.p100 * 100, up: b.up * 100, stop: b.stop * 100 })) },
          { title: 'Newest labeled polls', cols: [C('Time', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num0'), C('Mcap', 'mcap', 'usd'), C('Liquidity', 'liq', 'usd'), C('Best 6 h', 'b6', 'spct'), C('Worst 6 h', 'w6', 'spct'), C('At 6 h', 'a6', 'spct'), C('Status', 'reject')],
            rows: recent.map((r) => ({ ...r, b6: r.max_6h ? (r.max_6h / r.price - 1) * 100 : null, w6: r.min_6h ? (r.min_6h / r.price - 1) * 100 : null, a6: r.price_6h ? (r.price_6h / r.price - 1) * 100 : null, reject: r.reject || 'scored' })) },
        ] };
    },
    g_liq() {
      const rows = all(`SELECT w.mint, w.symbol, w.added_at, w.mig_price, s.liq, s.mcap, s.price, s.score, s.reject FROM grad_watch w JOIN grad_snapshots s ON s.mint = w.mint AND s.ts = (SELECT MAX(ts) FROM grad_snapshots x WHERE x.mint = w.mint) WHERE w.active = 1 AND s.liq > 0 ORDER BY s.liq DESC`);
      const edges = [0, 5e3, 1e4, 2e4, 4e4, 6e4, 1e5, 2.5e5, 1e12], min = config.grads?.minLiqUsd ?? 0;
      const byLiq = all(`SELECT CASE WHEN liq >= 60000 THEN '$60k+' WHEN liq >= 20000 THEN '$20–60k' WHEN liq >= ? THEN 'min–$20k' ELSE 'below min' END band, MIN(liq) lo, COUNT(*) n,
          AVG(max_6h >= 1.5 * price) p50, AVG(min_6h <= 0.615 * price) stop FROM grad_snapshots WHERE labeled = 1 AND price > 0 AND liq > 0 AND max_6h IS NOT NULL GROUP BY band ORDER BY lo DESC`, min);
      return { title: 'Liquidity filter', explain: `Graduates below the minimum pool liquidity are watched but never alerted or traded: thin pools make paper fills unrealistic. Belphor's data shows pools above $60k liquidity reached +50% far more often (23% vs 14%). The band table checks that claim on this machine's own labeled polls.`,
        stats: [['Minimum', min, 'usd'], ['Watched with a pool', rows.length, 'num'], ['Above minimum', rows.filter((r) => r.liq >= min).length, 'num'], ['Below minimum', rows.filter((r) => r.liq < min).length, 'num']],
        series: { label: 'Watched graduates by pool liquidity (USD)', kind: 'cat', fmt: 'num', points: edges.slice(0, -1).map((e, i) => [`${e >= 1e3 ? e / 1e3 + 'k' : e}${i === edges.length - 2 ? '+' : ''}`, rows.filter((r) => r.liq >= e && r.liq < edges[i + 1]).length]) },
        tables: [
          { title: 'Outcome by pool liquidity (labeled polls, 6 h)', cols: [C('Pool', 'band'), C('Polls', 'n', 'num'), C('Reached +50%', 'p50', 'pct'), C('Hit −38.5% first', 'stop', 'pct')], rows: byLiq.map((b) => ({ ...b, p50: b.p50 * 100, stop: b.stop * 100 })) },
          { title: 'Watched graduates by liquidity', cols: [C('Token', 'symbol', 'token'), C('Since mig', 'age', 'age'), C('Liquidity', 'liq', 'usd'), C('Mcap', 'mcap', 'usd'), C('vs migration', 'vs', 'spct'), C('Score', 'score', 'num0'), C('Status', 'st')],
            rows: rows.map((r) => ({ ...r, age: (Date.now() - r.added_at) / 1000, vs: r.price && r.mig_price ? (r.price / r.mig_price - 1) * 100 : null, st: r.liq < min ? 'below minimum' : r.reject || 'scored' })) },
        ] };
    },
    g_paper() {
      const rows = all(`SELECT * FROM grad_paper WHERE status = 'closed' AND COALESCE(book,'fixed') = 'fixed' ORDER BY exit_ts DESC LIMIT 200`);
      const trail = all(`SELECT * FROM grad_paper WHERE status = 'closed' AND book = 'trail' ORDER BY exit_ts DESC LIMIT 200`);
      const k = killStatsFrom([...rows].reverse()), kt = killStatsFrom([...trail].reverse());
      let eq = 0, eqt = 0;
      const curve = (rs, acc) => [...rs].reverse().map((r) => [r.exit_ts, (acc.v += r.pnl_sol)]);
      return { title: 'Graduates paper books', explain: 'Two paper books on the same re-ignition alerts, filled at the same price. The fixed book sells half at the first target and is closed after 6 hours. The trailing book has no partial exit and no clock: a hard stop until it is up 20%, then a trailing stop from the peak. Comparing them shows whether the fixed book\'s clock is what caps the winners.',
        stats: [['Fixed · closed', k.n, 'num'], ['Fixed · avg / trade', k.expectancyPct, 'spct'], ['Trail · closed', kt.n, 'num'], ['Trail · avg / trade', kt.expectancyPct, 'spct'], ['Fixed total', k.totalPnlSol, 'susd'], ['Trail total', kt.totalPnlSol, 'susd']],
        series: { label: 'Cumulative P&L, fixed book (USD)', kind: 'line', fmt: 'susd', points: curve(rows, { v: eq }) },
        tables: [
          { title: 'Exit reasons · fixed book', cols: [C('Reason', 'exit_reason'), C('Trades', 'n', 'num'), C('Avg P&L', 'avg_pct', 'spct'), C('Avg held', 'held_min', 'min')], rows: all(`SELECT exit_reason, COUNT(*) n, AVG(pnl_pct) avg_pct, AVG((exit_ts-entry_ts)/60000.0) held_min FROM grad_paper WHERE status='closed' AND COALESCE(book,'fixed')='fixed' GROUP BY 1 ORDER BY 2 DESC`) },
          { title: 'Exit reasons · trailing book', cols: [C('Reason', 'exit_reason'), C('Trades', 'n', 'num'), C('Avg P&L', 'avg_pct', 'spct'), C('Avg held', 'held_min', 'min')], rows: all(`SELECT exit_reason, COUNT(*) n, AVG(pnl_pct) avg_pct, AVG((exit_ts-entry_ts)/60000.0) held_min FROM grad_paper WHERE status='closed' AND book='trail' GROUP BY 1 ORDER BY 2 DESC`) },
          ...(() => { const R = grads?.replayTrail?.(); return R ? [{ title: `Trailing rule replayed on the fixed book's ${R.n} closed alerts (${R.resolutionMin}-min snapshots · context only)`,
            cols: [C('Token', 'symbol'), C('Fixed book', 'fixedPct', 'spct'), C('Trailing rule', 'trailPct', 'spct'), C('Difference', 'diff', 'spct'), C('Trail exit', 'reason')],
            rows: R.rows.map((r) => ({ ...r, diff: r.trailPct - r.fixedPct })).sort((a, b) => b.diff - a.diff) }] : []; })(),
          { title: 'Closed trades · fixed', cols: tradeCols.filter((c) => c.k !== 'book'), rows: rows.map(tradeRow) },
          { title: 'Closed trades · trailing', cols: tradeCols.filter((c) => c.k !== 'book'), rows: trail.map(tradeRow) },
        ] };
    },
    // ---- intel ----
    ds_launches() {
      const rows = all(`SELECT (created_at / ${D}) * ${D} t, COUNT(*) n, SUM(graduated) g, SUM(rugged) r FROM tokens GROUP BY 1 ORDER BY 1`);
      return { title: 'Dataset by day', explain: 'Every launch is stored and labeled after an hour (peak, graduated, rugged). This is the raw material for calibration.',
        stats: [['Launches', rows.reduce((s, r) => s + r.n, 0), 'num'], ['Graduations', rows.reduce((s, r) => s + (r.g || 0), 0), 'num'], ['Days', rows.length, 'num']],
        series: { label: 'Launches per day', kind: 'bar', fmt: 'num', points: rows.map((r) => [r.t, r.n]) },
        tables: [{ title: 'Per day', cols: [C('Day', 't', 'day'), C('Launches', 'n', 'num'), C('Graduated', 'g', 'num'), C('Grad rate', 'gr', 'pct2'), C('Rugged', 'r', 'num')], rows: rows.reverse().map((r) => ({ ...r, gr: r.n ? ((r.g || 0) / r.n) * 100 : null })) }] };
    },
    ds_rugs() {
      const rows = all(`SELECT mint, symbol, created_at, creator, peak_mcap_1h, mcap_1h FROM tokens WHERE rugged = 1 AND created_at > ? ORDER BY created_at DESC LIMIT 100`, Date.now() - D);
      return { title: 'Rugs, last 24 h', explain: 'Tokens labeled rugged at the 1 hour mark (fell hard after the creator or top holders sold).',
        stats: [['Count', rows.length, 'num']],
        series: { label: 'Rugs per hour', kind: 'bar', fmt: 'num', points: bucket(rows.map((r) => ({ t: r.created_at })), H, Date.now() - D) },
        tables: [{ title: 'Rugged tokens', cols: [C('Launched', 'created_at', 'time'), C('Token', 'symbol', 'token'), C('Peak 1 h', 'peak_mcap_1h', 'mcap'), C('At 1 h', 'mcap_1h', 'mcap'), C('Creator', 'creator', 'wallet')], rows }] };
    },
    ds_snaps() {
      const rows = all(`SELECT checkpoint, COUNT(*) n, SUM(max_mcap_after IS NOT NULL) l, SUM(reject IS NULL) ok, SUM(COALESCE(gap,0)) g FROM snapshots GROUP BY 1 ORDER BY 1`);
      return { title: 'Labeled snapshots', explain: 'Feature snapshots taken at fixed ages after launch, later labeled with the outcome. Gap-flagged rows are kept but excluded from calibration.',
        tables: [{ title: 'By checkpoint (seconds after launch)', cols: [C('Checkpoint', 'checkpoint', 'num'), C('Rows', 'n', 'num'), C('Labeled', 'l', 'num'), C('Not rejected', 'ok', 'num'), C('Gap-flagged', 'g', 'num')], rows }] };
    },
    // ---- strong signals ----
    strong() {
      const rows = all(`SELECT * FROM strong_signals ORDER BY ts DESC LIMIT 100`);
      const lab = rows.filter((r) => r.labeled);
      return { title: 'Strong signals', explain: 'Alerts whose calibrated chance of a +25% move after costs clears the bar. These are the only signals sent to Telegram.',
        stats: [['Total', rows.length, 'num'], ['Sent', rows.filter((r) => r.sent).length, 'num'], ['Labeled', lab.length, 'num'], ['Hit', lab.length ? (lab.filter((r) => r.outcome === 'hit').length / lab.length) * 100 : null, 'pct'], ['Calibrated', rows.filter((r) => r.mode === 'calibrated').length, 'num']],
        series: { label: 'Strong signals per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows.map((r) => ({ t: r.ts })), H, Date.now() - D) },
        tables: [{ title: 'Newest', cols: [C('Time', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num0'), C('Ref mcap', 'ref_mcap_usd', 'usd'), C('Hit rate', 'hit_rate', 'pct'), C('Mode', 'mode'), C('Sent', 'sent', 'yes'), C('Outcome', 'outcome'), C('Peak', 'peak_mult', 'mult')], rows }] };
    },
    // ---- report ----
    rep_cov() {
      const rows = all(`SELECT (minute * 60000 / ${H}) * ${H} t, SUM(MIN(up_sec, 60) - COALESCE(gap_sec, 0)) / 60.0 m FROM feed_minutes WHERE minute > ? GROUP BY 1 ORDER BY 1`, Math.floor((Date.now() - 14 * D) / 60000));
      return { title: 'Hours recorded', explain: 'Minutes with live trade data, per hour. The two-week verdict needs 80%+ coverage; minutes inside a gap do not count.',
        stats: [['Hours with data', rows.reduce((s, r) => s + r.m, 0) / 60, 'num1'], ['Possible (14 d)', 336, 'num']],
        series: { label: 'Recorded minutes per hour, last 14 days', kind: 'bar', fmt: 'num', points: rows.map((r) => [r.t, Math.round(r.m)]) } };
    },
    rep_trades() { const rows = closedCurrent(); return { title: 'Closed paper trades by book', explain: 'Every book trades in parallel on the same signals with different entry or exit rules, so results are directly comparable.', tables: [{ title: 'Books', cols: bookCols, rows: byBook(rows) }, { title: 'Newest', cols: tradeCols, rows: [...rows].reverse().slice(0, 150).map(tradeRow) }] }; },
    rep_gate() {
      const rows = closedCurrent().filter((r) => r.book !== 'random');
      const st = (r) => { try { return JSON.parse(r.market || '{}').state || 'UNKNOWN'; } catch { return 'UNKNOWN'; } };
      const g = ['WARM', 'COLD', 'UNKNOWN'].map((s) => { const k = killStatsFrom(rows.filter((r) => st(r) === s)); return { state: s, n: k.n, avg: k.expectancyPct, win: k.winRatePct, pnl: k.totalPnlSol }; });
      return { title: 'Market pause', explain: `Each entry is tagged WARM or COLD from the rolling win rate of recent trades. In shadow mode nothing is blocked; the table shows whether pausing in COLD would have helped.`,
        tables: [{ title: 'Results by market state at entry', cols: [C('State', 'state'), C('Trades', 'n', 'num'), C('Avg', 'avg', 'spct'), C('Win', 'win', 'pct'), C('P&L $', 'pnl', 'susd')], rows: g }] };
    },
    // ---- health ----
    h_cov: () => ({ ...H_.rep_cov(), title: 'Coverage (hours recorded)' }),
    h_gaps() {
      const rows = all(`SELECT * FROM gaps ORDER BY start DESC LIMIT 200`);
      return { title: 'Data gaps', explain: 'A gap opens when the trade feed is silent longer than the calibrated threshold, or when the process was down. Paper trades open during a gap and outcome labels overlapping one are excluded from stats.',
        stats: [['Recorded', rows.length, 'num'], ['Minutes lost', rows.reduce((s, g) => s + ((g.end || Date.now()) - g.start), 0) / 60000, 'num1']],
        series: { label: 'Gap minutes per day', kind: 'bar', fmt: 'num1', points: bucket(rows.map((g) => ({ t: g.start, v: ((g.end || Date.now()) - g.start) / 60000 })), D, Date.now() - 14 * D, (r) => r.v) },
        tables: [{ title: 'All gaps', cols: [C('Start', 'start', 'time'), C('Length', 'sec', 'age'), C('Reason', 'reason'), C('Trades flagged', 'open_trades', 'num'), C('Labels flagged', 'tokens_flagged', 'num')], rows: rows.map((g) => ({ ...g, sec: ((g.end || Date.now()) - g.start) / 1000 })) }] };
    },
    h_capture() {
      const rows = all(`SELECT minute, creates_pp, creates_rpc, creates_both FROM feed_minutes WHERE minute > ? AND creates_pp IS NOT NULL ORDER BY minute`, Math.floor((Date.now() - 6 * H) / 60000));
      return { title: 'Launch capture', explain: 'Launches seen by PumpPortal that the on-chain RPC feed also saw. The RPC feed is the trade source, so a drop here means it is silently missing messages.',
        series: { label: 'Capture % per minute, last 6 h', kind: 'line', fmt: 'pct', points: rows.filter((r) => r.creates_pp).map((r) => [r.minute * 60000, (r.creates_both / r.creates_pp) * 100]) },
        tables: [{ title: 'Per minute', cols: [C('Minute', 't', 'time'), C('PumpPortal', 'creates_pp', 'num'), C('RPC', 'creates_rpc', 'num'), C('Both', 'creates_both', 'num'), C('Capture', 'p', 'pct')],
          rows: rows.reverse().slice(0, 120).map((r) => ({ ...r, t: r.minute * 60000, p: r.creates_pp ? (r.creates_both / r.creates_pp) * 100 : null })) }] };
    },
    h_rate() {
      const rows = all(`SELECT minute, trades, reconnects FROM feed_minutes WHERE minute > ? AND trades IS NOT NULL ORDER BY minute`, Math.floor((Date.now() - 6 * H) / 60000));
      return { title: 'Trade rate', explain: 'Trade events per minute from the active trade feed. The gap threshold and the low-rate alarm are calibrated from the slowest 5% of clean minutes.',
        series: { label: 'Trades per minute, last 6 h', kind: 'bar', fmt: 'num', points: rows.map((r) => [r.minute * 60000, r.trades]) },
        tables: [{ title: 'Reconnects by minute (non-zero)', cols: [C('Minute', 't', 'time'), C('Trades', 'trades', 'num'), C('Reconnects', 'reconnects', 'num')], rows: rows.filter((r) => r.reconnects).reverse().map((r) => ({ ...r, t: r.minute * 60000 })) }] };
    },
    h_sys() {
      const rows = all(`SELECT minute, rss_mb, loop_p99_ms, cpu_pct FROM feed_minutes WHERE minute > ? AND rss_mb IS NOT NULL ORDER BY minute`, Math.floor((Date.now() - 24 * H) / 60000));
      return { title: 'Process health', explain: 'Memory, event-loop lag and CPU, sampled every minute. Rising memory over days means a leak; lag above 200 ms means stops and entries react late.',
        series: { label: 'Event-loop lag p99 (ms), last 24 h', kind: 'line', fmt: 'num', points: rows.filter((r) => r.loop_p99_ms != null).map((r) => [r.minute * 60000, r.loop_p99_ms]) },
        tables: [{ title: 'Hourly', cols: [C('Hour', 't', 'time'), C('RSS MB', 'rss', 'num0'), C('Lag p99 ms', 'lag', 'num1'), C('CPU %', 'cpu', 'num1')],
          rows: Object.values(rows.reduce((m, r) => { const t = Math.floor((r.minute * 60000) / H) * H; const o = (m[t] ||= { t, rss: 0, lag: 0, cpu: 0, k: 0 }); o.rss = Math.max(o.rss, r.rss_mb); o.lag = Math.max(o.lag, r.loop_p99_ms || 0); o.cpu += r.cpu_pct || 0; o.k++; return m; }, {})).map((o) => ({ ...o, cpu: o.cpu / o.k })).reverse() }] };
    },
    h_fills() {
      const rows = all(`SELECT id, book, symbol, mint, entry_ts, fill_n, fill_real_pct, exit_fill_n, exit_real_pct, entry_slip_pct, (entry_ts - signal_ts) / 1000.0 delay FROM paper_trades WHERE cfg = ? AND fill_n IS NOT NULL ORDER BY entry_ts DESC LIMIT 200`, CFG);
      return { title: 'Fill audit, trade by trade', explain: 'For each paper fill: the median price real wallets paid (or got) on the same token within ±5 s, at similar size, fee included. Negative entry = paper bought cheaper than reality (optimistic).',
        tables: [{ title: 'Audited trades', cols: [C('Entry', 'entry_ts', 'time'), C('Book', 'book', 'book'), C('Token', 'symbol', 'token'), C('Delay', 'delay', 'age'), C('Slip', 'entry_slip_pct', 'spct'), C('Entry vs real', 'fill_real_pct', 'spct'), C('Real buys', 'fill_n', 'num'), C('Exit vs real', 'exit_real_pct', 'spct'), C('Real sells', 'exit_fill_n', 'num')], rows }] };
    },
    h_stops() {
      const rows = all(`SELECT id, book, symbol, mint, entry_ts, exit_ts, pnl_pct, pnl_sol, stop_pct, trigger_pct, exit_reason FROM paper_trades WHERE cfg = ? AND status = 'closed' AND exit_reason LIKE 'stop%' ORDER BY exit_ts DESC LIMIT 200`, CFG);
      return { title: 'Stop exits', explain: `A stop triggers at −${config.paper.stopPct}% but sells ${config.paper.exitDelaySec}s later at whatever the curve pays. On thin curves the price keeps falling during that delay; this table shows by how much.`,
        tables: [{ title: 'Stops, newest first', cols: [C('Closed', 'exit_ts', 'time'), C('Book', 'book', 'book'), C('Token', 'symbol', 'token'), C('Triggered at', 'trigger_pct', 'spct'), C('Filled at', 'pnl_pct', 'spct'), C('Overshoot', 'over', 'num1'), C('Held', 'held', 'age')],
          rows: rows.map((r) => ({ ...tradeRow(r), over: -(r.stop_pct || config.paper.stopPct) - r.pnl_pct })) }] };
    },
    h_cfg() {
      const hist = cfgHistory();
      const counts = Object.fromEntries(all(`SELECT cfg, COUNT(*) n, SUM(status='closed') c FROM paper_trades GROUP BY cfg`).map((r) => [r.cfg, r]));
      return { title: 'Settings fingerprints', explain: 'A hash of every strategy setting plus the scoring and paper-engine code. A change starts a new test so old and new rules are never mixed in one verdict.',
        tables: [{ title: 'History', cols: [C('Fingerprint', 'cfg'), C('First seen', 'since', 'time'), C('Paper rows', 'n', 'num'), C('Closed', 'c', 'num'), C('Current', 'cur', 'yes')], rows: hist.map((h) => ({ ...h, n: counts[h.cfg]?.n || 0, c: counts[h.cfg]?.c || 0, cur: h.cfg === CFG ? 1 : 0 })) }] };
    },
    h_labels() {
      const cut = Date.now() - H - 5 * 60000;
      const over = all(`SELECT a.ts, a.mint, t.symbol, a.score FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint WHERE a.finalized = 0 AND COALESCE(a.gap,0) = 0 AND a.ts < ? ORDER BY a.ts`, cut);
      const pend = one(`SELECT COUNT(*) n FROM alerts WHERE finalized = 0 AND ts >= ?`, cut).n;
      const tokPend = one(`SELECT COUNT(*) n FROM tokens WHERE finalized = 0 AND created_at > ?`, Date.now() - H).n;
      const done = all(`SELECT (ts / ${H}) * ${H} t, COUNT(*) n FROM alerts WHERE finalized = 1 AND ts > ? GROUP BY 1 ORDER BY 1`, Date.now() - D);
      return { title: 'Outcome labeling', explain: 'Every alert and token is labeled one hour after it appears (peak, graduated, rugged). An overdue alert means the labeler fell behind or the token left memory before its hour was up.',
        stats: [['Overdue alerts', over.length, 'num'], ['Alerts inside their hour', pend, 'num'], ['Tokens inside their hour', tokPend, 'num']],
        series: { label: 'Alerts labeled per hour, last 24 h', kind: 'bar', fmt: 'num', points: done.map((r) => [r.t, r.n]) },
        tables: [{ title: 'Overdue alerts', cols: [C('Alerted', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num1')], rows: over }] };
    },
    launches24() {
      const since = Date.now() - D;
      const rows = all(`SELECT created_at t, graduated g FROM tokens WHERE created_at > ?`, since);
      const hourly = bucket(rows, H, since);
      const gh = bucket(rows.filter((r) => r.g), H, since);
      return { title: 'Launches, last 24 h', explain: 'Every Pump.fun launch this machine saw, per hour. Hours with low counts usually line up with feed gaps on the Health tab.',
        stats: [['Launches', rows.length, 'num'], ['Graduated', rows.filter((r) => r.g).length, 'num'], ['Grad rate', rows.length ? (rows.filter((r) => r.g).length / rows.length) * 100 : null, 'pct2'], ['Busiest hour', Math.max(0, ...hourly.map((p) => p[1])), 'num']],
        series: { label: 'Launches per hour', kind: 'bar', fmt: 'num', points: hourly },
        tables: [{ title: 'Per hour, newest first', cols: [C('Hour', 't', 'time'), C('Launches', 'n', 'num'), C('Graduated', 'g', 'num')], rows: hourly.map(([t, n], i) => ({ t, n, g: gh[i]?.[1] || 0 })).reverse() }] };
    },
    ds_grads() {
      const d = H_.ds_launches();
      return { ...d, title: 'Graduations by day', explain: 'Tokens that completed the bonding curve, by launch day, with the daily graduation rate.',
        series: { label: 'Graduations per day', kind: 'bar', fmt: 'num', points: d.tables[0].rows.slice().reverse().map((r) => [r.t, r.g || 0]) } };
    },
    // ---- benchmarks ----
    b_random() {
      const rows = closedCurrent().filter((r) => r.book === 'random').reverse();
      return { title: 'Random control book', explain: `At each Main, Band or Flow signal, a random other token that passed the hard filters, similar in age (±${config.strategies.random.ageTolPct}%) and mcap (±${config.strategies.random.mcapTolPct}%), is bought with the same exits and costs.`,
        tables: [{ title: 'Closed control trades', cols: tradeCols.filter((c) => c.k !== 'book'), rows: rows.map(tradeRow) }] };
    },
    b_lift() {
      const L = benchmarks().lift, since = Date.now() - 7 * D;
      const days = all(`SELECT (created_at / ${D}) * ${D} t, COUNT(*) n, SUM(graduated) g, SUM(peak_mcap_1h >= 2 * initial_mcap) x2 FROM tokens WHERE finalized = 1 AND created_at > ? AND COALESCE(gap,0) = 0 GROUP BY 1 ORDER BY 1`, since);
      const ad = all(`SELECT (ts / ${D}) * ${D} t, COUNT(*) n, SUM(graduated) g, SUM(max_multiple >= 2) x2 FROM alerts WHERE finalized = 1 AND ts > ? AND COALESCE(gap,0) = 0 GROUP BY 1`, since);
      const am = Object.fromEntries(ad.map((r) => [r.t, r]));
      const rows = days.map((d) => { const a = am[d.t] || { n: 0, g: 0, x2: 0 }; const br = d.n ? (d.g / d.n) * 100 : null, ar = a.n ? (a.g / a.n) * 100 : null;
        return { t: d.t, base: d.n, baseGrad: br, alerts: a.n, alertGrad: ar, lift: br && ar != null ? ar / br : null, alert2x: a.n ? (a.x2 / a.n) * 100 : null }; }).reverse();
      const recent = all(`SELECT a.ts, a.mint, t.symbol, a.score, a.max_multiple, a.graduated FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint WHERE a.finalized = 1 AND a.ts > ? AND COALESCE(a.gap,0) = 0 ORDER BY a.ts DESC LIMIT 200`, since);
      return { title: 'Selection lift', explain: `Do alerts (score ≥ ${L.alertScore}) pick tokens that graduate or double more often than the base rate? Last ${L.window}, gap-flagged labels excluded. Lift is not profit: most alerted tokens fall through the stop before any move.`,
        stats: [['Graduation: alerts', L.graduation.alert, 'pct'], ['Graduation: all launches', L.graduation.base, 'pct2'], ['Graduation lift', L.graduation.lift, 'mult'], ['Alerts labeled', L.graduation.alertN, 'num'],
          ['Reached 2x: alerts', L.double.alert, 'pct'], [`Reached 2x: ${L.double.baseLabel}`, L.double.base, 'pct'], ['2x lift', L.double.lift, 'mult'], ['Base sample', L.double.baseN, 'num']],
        series: { label: 'Graduation lift by day', kind: 'bar', fmt: 'num2', points: [...rows].reverse().filter((r) => r.lift != null).map((r) => [r.t, r.lift]) },
        tables: [{ title: 'By day', cols: [C('Day', 't', 'day'), C('Launches', 'base', 'num'), C('Grad rate', 'baseGrad', 'pct2'), C('Alerts', 'alerts', 'num'), C('Alert grad rate', 'alertGrad', 'pct'), C('Lift', 'lift', 'mult'), C('Alert 2x', 'alert2x', 'pct')], rows },
          { title: 'Labeled alerts, newest first', cols: [C('Time', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num1'), C('Peak multiple', 'max_multiple', 'mult'), C('Graduated', 'graduated', 'yes')], rows: recent }] };
    },
  };
  const bookDrill = (b) => {
    const rows = closedCurrent().filter((r) => (r.book || 'main') === b && !r.gated);
    const k = killStatsFrom(rows); let eq = 0;
    const S = STRATEGIES[b] || {};
    return { title: `${S.label || b} book`, explain: `${S.entry || ''}${S.thesis ? ' ' + S.thesis : ''}`.trim() || 'Paper trades for this book.',
      stats: [['Closed', k.n, 'num'], ['Avg / trade', k.expectancyPct, 'spct'], ['95% range', `${k.ciLowPct?.toFixed(1)} … ${k.ciHighPct?.toFixed(1)}%`, 'text'], ['Win rate', k.winRatePct, 'pct'], ['Total', k.totalPnlSol, 'susd'], ['Worst', k.worstPct, 'spct']],
      series: { label: 'Cumulative P&L (USD)', kind: 'line', fmt: 'susd', points: rows.map((r) => [r.exit_ts, (eq += r.pnl_sol)]) },
      tables: [{ title: 'Closed trades, newest first', cols: tradeCols.filter((c) => c.k !== 'book'), rows: [...rows].reverse().map(tradeRow) }] };
  };
  // ---- Runner board ----
  const rnScorecard = () => {
    if (!runners) return null; const sc = runners.scorecard(), B = sc.books, name = { rule: 'Registered rule', random: 'Random from eligible', mcap: 'Top by market cap', vol: 'Top by 1h volume' };
    const fmtCi = (c) => (c ? `${c.lo}–${c.hi}%` : '–');
    return { title: 'Runner board scorecard', explain: `Each day the same eligible set is cut four ways at the same moment; only the ranking differs. The rule has skill only if its hit rate beats the random cut with intervals that do not overlap. Target: market cap ≥ ${fmtUsd(sc.target)} within 48 h of the pick; secondary: 2× the pick-time market cap within 24 h. Picks are frozen and labeled from the graduate snapshots that follow; a coin that stops being watched counts as a miss.`,
      stats: [['Rule picks scored', B.rule.scored48, 'num'], ['Rule hit rate', B.rule.hitPct, 'pct'], ['Random hit rate', B.random.hitPct, 'pct'], ['Rule 2× in 24h', B.rule.x2Pct, 'pct'], ['Random 2× in 24h', B.random.x2Pct, 'pct'], ['Rule halved in 24h', B.rule.halvedPct, 'pct']],
      tables: [
        { title: 'By cut', cols: [C('Cut', 'name'), C('Picks', 'picks', 'num'), C('Scored 48h', 'scored48', 'num'), C(`Hit ${fmtUsd(sc.target)}`, 'hits', 'num'), C('Hit %', 'hitPct', 'pct'), C('95% CI', 'hitCi'), C('2× 24h %', 'x2Pct', 'pct'), C('2× CI', 'x2Ci'), C('Halved %', 'halvedPct', 'pct'), C('Median peak ×', 'medianPeakMult', 'num')],
          rows: Object.entries(B).map(([k, v]) => ({ name: name[k], ...v, hitCi: fmtCi(v.hitCi), x2Ci: fmtCi(v.x2Ci) })) },
        { title: 'By day', cols: [C('Day', 'day'), C('Picks', 'picks', 'num'), C('Scored', 'scored48', 'num'), C('Hits', 'hits', 'num'), C('2×', 'x2', 'num'), C('Random hits', 'rnd_hits', 'num'), C('Random 2×', 'rnd_x2', 'num')], rows: sc.days.map((r) => ({ ...r, drill: `rn_day:${r.day}`, label: `Picks ${r.day}` })) },
      ] };
  };
  const rnDay = (day) => {
    if (!runners) return null; const v = runners.dayView(day); const name = { rule: 'Registered rule', random: 'Random from eligible', mcap: 'Top by market cap', vol: 'Top by 1h volume' };
    const rows = v.rows.map((r) => ({ ...r, cut: name[r.book] || r.book, outcome: r.labeled48 ? (r.hit_target ? 'hit target' : r.x2_24h ? '2× only' : r.halved_24h ? 'halved' : 'no run') : r.labeled24 ? (r.x2_24h ? '2× (48h pending)' : r.halved_24h ? 'halved (48h pending)' : 'pending') : 'pending',
      peakMult: r.peak48 ? round(r.peak48 / r.mcap, 2) : r.peak24 ? round(r.peak24 / r.mcap, 2) : null, nowMult: r.nowMcap ? round(r.nowMcap / r.mcap, 2) : null, why: r.reasons.join(' · '), flag: r.flags.join(' · '), drill: `tok:${r.mint}`, label: r.symbol || r.mint.slice(0, 6) }));
    return { title: `Runner picks · ${day}`, explain: `Frozen at ${rows[0] ? new Date(rows[0].ts).toISOString().slice(11, 16) : '–'} UTC. Peak × is the highest market cap after the pick divided by the pick-time market cap; now × is the current multiple for coins still watched. Tap a row for the token record.`,
      tables: [{ title: 'Picks', cols: [C('Cut', 'cut'), C('#', 'rank', 'num'), C('Token', 'symbol'), C('Pick mcap', 'mcap', 'usd'), C('Age h', 'age_h', 'num'), C('Score', 'score', 'num'), C('Peak ×', 'peakMult', 'num'), C('Now ×', 'nowMult', 'num'), C('Outcome', 'outcome'), C('Reasons', 'why'), C('Flags', 'flag')], rows }] };
  };
  const rnLive = () => {
    if (!runners) return null; const v = runners.view();
    return { title: 'Runner board · eligible now', explain: `${v.eligible} of ${v.watched} watched graduates pass the filters (${v.config.minAgeH}–${v.config.maxAgeH} h old, ${fmtUsd(v.config.minMcapUsd)}–${fmtUsd(v.config.maxMcapUsd)}, pool ≥ ${fmtUsd(v.config.minLiqUsd)}, no rejects, creator not a rugger, target not already printed). Picks freeze daily at ${String(v.config.pickHour).padStart(2, '0')}:00 ${v.config.timezone}.`,
      tables: [
        { title: 'Ranked', cols: [C('#', 'rank', 'num'), C('Token', 'symbol'), C('Mcap', 'mcap', 'usd'), C('Pool', 'liq', 'usd'), C('Age h', 'ageH', 'num'), C('Score', 'score', 'num'), C('× mig', 'vsMig', 'num'), C('Reasons', 'why'), C('Flags', 'flag')], rows: v.live.map((x, i) => ({ ...x, rank: i + 1, why: x.reasons.join(' · '), flag: x.flags.join(' · '), drill: `tok:${x.mint}`, label: x.symbol || x.mint.slice(0, 6) })) },
        { title: 'Why the rest are excluded', cols: [C('Reason', 'k'), C('Count', 'n', 'num')], rows: Object.entries(v.excluded).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })) },
      ] };
  };
  // ---- 24h gate ----
  const gateDrill = (b) => {
    const g = gate24h(), x = g.books[b]; if (!x) return null;
    const hrs = x.hours.filter((h) => h.n);
    const line = { PASS: 'Every check cleared on a full rolling day. That is the first time this product has produced evidence worth acting on; the next step is to leave the rule untouched and see whether it holds a second day.',
      FAIL: 'Enough trades, but at least one check failed. The failed line below is the reason; the fix is a different rule, not another day of the same one.',
      COLLECTING: `Fewer than ${g.config.minN} closed trades in the window. At ${g.config.minN} trades the error on the mean is about ±${x.sdPct ? (1.96 * x.sdPct / Math.sqrt(g.config.minN)).toFixed(1) : '4'} points; before that a positive number is mostly noise.`,
      CONTROL: 'The random control: picks from the same moments with the same costs. If it is positive, the market was rising and no book gets credit for the day.' }[x.status];
    return { title: `24-hour gate · ${x.label}`, explain: `${line} Window: the ${g.config.hours} hours ending now. Rule: ${STRATEGIES[b]?.entry || b}.`,
      stats: [['Status', x.status, 'text'], ['Closed in window', x.n, 'num'], ['Mean / trade', x.meanPct, 'spct'], ['95% low', x.loPct, 'spct'], ['Win rate', x.winRatePct, 'pct'], ['P&L in window', x.pnlSol, 'susd']],
      series: hrs.length > 1 ? { label: 'Mean return per trade by exit hour', kind: 'bars', fmt: 'spct', points: hrs.map((h) => [h.t, h.meanPct]) } : undefined,
      tables: [
        { title: 'Checks', cols: [C('Check', 'k'), C('Result', 'ok'), C('Detail', 'text')], rows: Object.entries(x.checks).map(([k, c]) => ({ k: { sample: 'Sample size', mean: 'Mean after costs', bound: 'Lower bound', control: 'Random control', fixed: 'Rule fixed before window' }[k], ok: c.ok ? 'pass' : 'fail', text: c.text })) },
        { title: 'By exit hour', cols: [C('Hour (UTC)', 'hour'), C('Closed', 'n', 'num'), C('Mean', 'meanPct', 'spct'), C('P&L', 'pnlSol', 'susd')], rows: hrs.map((h) => ({ hour: new Date(h.t).toISOString().slice(5, 13).replace('T', ' ') + ':00', n: h.n, meanPct: h.meanPct, pnlSol: h.pnlSol })) },
      ] };
  };
  // ---- Sequential test (hypothesis 2) ----
  const seqDrill = (b) => {
    const S = STRATEGIES[b]; if (!S) return null;
    const rows = closedCurrent().filter((r) => (r.book || 'main') === b && !r.gated && r.pnl_pct != null).sort((a, c) => a.exit_ts - c.exit_ts);
    const rets = rows.map((r) => r.pnl_pct / 100);
    const v = sequentialVerdict(rets, { passMargin: 0.02, minTrades: 20 });
    // path of the sequence: bounds after every 5th trade (cheap enough: grid 401 × n)
    const pts = []; for (let n = 5; n <= rets.length; n += Math.max(1, Math.floor(rets.length / 60))) { const c = confidenceSequence(rets.slice(0, n)); pts.push({ n, lo: c.lo * 100, hi: c.hi * 100, mean: c.mean * 100 }); }
    const ctl = b === 'follow' ? sequentialVerdict(closedCurrent().filter((r) => r.book === 'followctl' && !r.gated && r.pnl_pct != null).map((r) => r.pnl_pct / 100), { passMargin: 0.02, minTrades: 20 }) : null;
    const line = { KILL: 'The anytime-valid upper bound is below zero: the book loses money at 95% confidence, and no amount of further trades changes the decision. The rule is dead as specified.',
      PASS: 'The anytime-valid lower bound is above the +2% margin. This is the first evidence worth acting on; the next step is to leave the rule untouched and watch whether the bound holds, and to check the control stayed flat.',
      CONTINUE: 'The sequence still contains zero. Unlike a fixed-n gate this can be read after every trade without inflating the error rate; the width below is how far the data is from a decision.' }[v.decision];
    return { title: `Sequential test · ${S.label}`, explain: `${line} Method: hedged betting confidence sequence (Waudby-Smith & Ramdas) on after-cost returns clipped to [−100%, +300%], α = 0.05. Rule: ${S.entry}.`,
      stats: [['Decision', v.decision, 'text'], ['Closed trades', v.n, 'num'], ['Mean / trade', v.mean == null ? null : v.mean * 100, 'spct'], ['CS lower', v.lo * 100, 'spct'], ['CS upper', v.hi * 100, 'spct'], ['Width', v.width * 100, 'pct']],
      series: pts.length > 1 ? { label: 'Confidence sequence lower bound by trade count', kind: 'line', fmt: 'spct', points: pts.map((p) => [p.n, p.lo]) } : undefined,
      sections: ctl ? [{ h: 'Matched control (Follow control)', p: `${ctl.n} trades · mean ${ctl.mean == null ? '–' : (ctl.mean * 100).toFixed(1)}% · sequence ${(ctl.lo * 100).toFixed(1)}% to ${(ctl.hi * 100).toFixed(1)}% · ${ctl.decision}. A PASS for Follow also requires Follow minus control to exclude zero.` }] : undefined,
      tables: [{ title: 'Sequence path', cols: [C('Trades', 'n', 'num'), C('Mean', 'mean', 'spct'), C('Lower', 'lo', 'spct'), C('Upper', 'hi', 'spct')], rows: pts },
        { title: 'Closed trades, oldest first', cols: [C('Token', 'symbol'), C('Exit', 'exit', 'text'), C('P&L', 'pnl_pct', 'spct'), C('Reason', 'exit_reason', 'text')], rows: rows.slice(-200).map((r) => ({ symbol: r.symbol, exit: new Date(r.exit_ts).toISOString().slice(5, 16).replace('T', ' '), pnl_pct: r.pnl_pct, exit_reason: r.exit_reason, drill: `tok:${r.mint}`, label: r.symbol })) }] };
  };
  // ---- Paired exit comparison (Scale-out vs Main) ----
  const pairDrill = (a, b = 'main') => {
    const P = pairedBooks(a, b); if (!STRATEGIES[a] || !STRATEGIES[b]) return null;
    const pm = (v) => (v == null ? null : v * 100);
    const verdict = !P.n ? 'No pair has closed yet; both books take every Main signal, so pairs accumulate at the Main signal rate.'
      : P.cs.hi < 0 ? 'The sequence is entirely below zero: the scale-out exit loses money relative to Main at 95% confidence on identical entries.'
      : P.cs.lo > 0 ? 'The sequence is entirely above zero: the scale-out exit beats Main at 95% confidence on identical entries. Check the hit count before celebrating; a handful of +125% trades can carry this.'
      : `Not decided. The anytime-valid interval on the per-entry difference still contains zero; width ${((P.cs.hi - P.cs.lo) * 100).toFixed(1)} points.`;
    return { title: `${STRATEGIES[a].label} vs ${STRATEGIES[b].label} · paired on identical entries`,
      explain: `${verdict} Method: for each Main signal both books hold the same token from the same fill; the statistic is the difference in after-cost return per entry (${STRATEGIES[a].label} minus ${STRATEGIES[b].label}), so token selection cancels and only the exit rule remains. Interval: hedged betting confidence sequence, α = 0.05, valid at every n. Pre-deployment measurement on 2,639 recorded signals: 7 ever reached +125%; simulated difference −15.5% vs −15.6%, so the registered expectation is a null result.`,
      stats: [['Pairs closed', P.n, 'num'], ['Mean difference', pm(P.mean), 'spct'], ['CS lower', P.n ? pm(P.cs.lo) : null, 'spct'], ['CS upper', P.n ? pm(P.cs.hi) : null, 'spct'], [`${STRATEGIES[a].label} mean`, pm(P.meanA == null ? null : P.meanA / 100), 'spct'], [`${STRATEGIES[b].label} mean`, pm(P.meanB == null ? null : P.meanB / 100), 'spct'], ['Scale-out better', P.wins, 'num'], ['Main better', P.losses, 'num'], ['Identical', P.ties, 'num'], ['Reached +125%', P.tpHits, 'num']],
      series: P.n > 1 ? { label: 'Cumulative mean difference by pair (percentage points)', kind: 'line', fmt: 'spct', points: P.pairs.map((x, i, arr) => [i + 1, arr.slice(0, i + 1).reduce((s, y) => s + y.diff, 0) / (i + 1)]) } : undefined,
      sections: [{ h: 'How to read it', p: 'Identical pairs are expected to dominate early: both books share the same hard stop, so any trade that stops out before +125% closes at the same price in both. The books only diverge on trades that run past +50% (Main takes profit) or +125% (Scale-out takes profit). The decision therefore rests on a minority of trades, which is why the sequence and the hit count are shown together.' }],
      tables: [{ title: 'Pairs, oldest first', cols: [C('Token', 'symbol'), C('Exit', 'exit', 'text'), C(`${STRATEGIES[a].label}`, 'a', 'spct'), C(`${STRATEGIES[b].label}`, 'b', 'spct'), C('Diff', 'diff', 'spct'), C('Peak', 'peak', 'mult'), C('Scale-out exit', 'aReason', 'text'), C('Main exit', 'bReason', 'text')],
        rows: P.pairs.slice(-300).reverse().map((x) => ({ symbol: x.symbol, exit: new Date(x.exitTs).toISOString().slice(5, 16).replace('T', ' '), a: x.a, b: x.b, diff: x.diff, peak: x.aPeak, aReason: x.aReason, bReason: x.bReason, drill: `tok:${x.mint}`, label: x.symbol })) }] };
  };
  // ---- Trading codex ----
  const codexDay = () => {
    if (!codex) return null; const d = codex.day();
    const tz = config.telegram?.timezone || 'UTC', hourOf = (ts) => Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts)));
    const byHour = {}; for (const r of d.rows) { const h = hourOf(r.exit_ts); byHour[h] = (byHour[h] || 0) + (r.pnl_sol || 0); }
    return { title: `Today's closed trades · ${d.day}`, explain: `Every paper position closed since local midnight, across all books (curve and graduate). ${d.trades ? `${d.wins} of ${d.trades} closed above zero; mean ${d.meanPct.toFixed(1)}% per trade.` : 'Nothing has closed yet today.'} Paper only: no order has ever been sent.`,
      stats: [['Closed', d.trades, 'num'], ['Win rate', d.winRatePct, 'pct'], ['P&L', d.pnlSol, 'susd'], ['Mean / trade', d.meanPct, 'spct'], ['Best', d.best ? d.best.pnlPct : null, 'spct'], ['Worst', d.worst ? d.worst.pnlPct : null, 'spct']],
      series: Object.keys(byHour).length > 1 ? { label: 'P&L by exit hour (SOL)', kind: 'bar', fmt: 'susd', points: Object.entries(byHour).sort((a, b) => a[0] - b[0]).map(([h, v]) => [Number(h), v]) } : undefined,
      tables: [{ title: 'By book', cols: [C('Book', 'book', 'book'), C('Closed', 'n', 'num'), C('Wins', 'wins', 'num'), C('P&L', 'pnlSol', 'susd')], rows: Object.entries(d.byBook).map(([book, x]) => ({ book, ...x })).sort((a, b) => b.n - a.n) },
        { title: 'Trades, newest first', cols: [C('Exit', 'exit', 'text'), C('Token', 'symbol', 'token'), C('Book', 'book', 'book'), C('Held', 'heldMin', 'min'), C('P&L', 'pnl_pct', 'spct'), C('SOL', 'pnl_sol', 'susd'), C('Why', 'exit_reason', 'text')],
          rows: d.rows.sort((a, b) => b.exit_ts - a.exit_ts).map((r) => ({ ...r, exit: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(r.exit_ts)), heldMin: (r.exit_ts - r.entry_ts) / 60000, drill: `tok:${r.mint}`, label: r.symbol })) }] };
  };
  const codexTape = () => {
    if (!codex) return null; const ev = codex.tape(24, 400);
    const kinds = { entry: 0, partial: 0, exit: 0 }; for (const e of ev) kinds[e.kind]++;
    return { title: 'Trade tape · last 24 h', explain: 'Every paper entry, partial take-profit and exit in the last 24 hours across all books, newest first. Tap a row for the token record.',
      stats: [['Entries', kinds.entry, 'num'], ['Partials', kinds.partial, 'num'], ['Exits', kinds.exit, 'num'], ['Exits above zero', ev.filter((e) => e.kind === 'exit' && e.pnlPct > 0).length, 'num']],
      tables: [{ title: 'Events', cols: [C('Time', 't', 'time'), C('Event', 'kind', 'text'), C('Token', 'symbol', 'token'), C('Book', 'book', 'book'), C('P&L', 'pnlPct', 'spct'), C('Detail', 'detail', 'text')],
        rows: ev.map((e) => ({ ...e, detail: e.kind === 'exit' ? e.reason : e.kind === 'partial' ? `sold at +${Math.round(e.pct || 0)}%` : `size ${e.sizeSol} SOL`, drill: `tok:${e.mint}`, label: e.symbol })) }] };
  };
  const codexEquity = () => {
    if (!codex) return null; const e = codex.equity(24);
    return { title: 'Realised P&L · last 24 h · all books', explain: `Cumulative realised paper P&L by exit time across every book. ${e.trades} closed, ${e.wins} above zero; profit factor ${e.profitFactor == null ? '–' : e.profitFactor === Infinity ? '∞' : e.profitFactor.toFixed(2)}; max drawdown ${e.maxDrawdownSol.toFixed(3)} SOL. Books with different rules are mixed here, so read the by-book table before drawing conclusions. Paper only.`,
      stats: [['Closed', e.trades, 'num'], ['Win rate', e.winRatePct, 'pct'], ['P&L', e.pnlSol, 'susd'], ['Profit factor', e.profitFactor === Infinity ? null : e.profitFactor, 'num'], ['Max drawdown', -e.maxDrawdownSol, 'susd'], ['Worst run', e.maxLossStreak, 'num']],
      series: e.points.length > 2 ? { label: 'Cumulative realised P&L (SOL)', kind: 'line', fmt: 'susd', points: e.points.map((x) => [x.t, x.v]) } : undefined,
      tables: [{ title: 'By book', cols: [C('Book', 'book', 'book'), C('Closed', 'n', 'num'), C('Wins', 'wins', 'num'), C('P&L', 'pnlSol', 'susd')], rows: Object.entries(e.byBook).map(([book, x]) => ({ book, ...x })).sort((a, b) => b.pnlSol - a.pnlSol) },
        { title: 'Closed trades, newest first', cols: [C('Exit', 't', 'time'), C('Token', 'symbol', 'token'), C('Book', 'book', 'book'), C('P&L', 'pnlPct', 'spct'), C('SOL', 'pnlSol', 'susd')], rows: e.points.filter((x) => x.symbol).reverse().map((x) => ({ ...x, drill: `tok:${x.mint}`, label: x.symbol })) }] };
  };
  const codexMarket = () => {
    if (!codex) return null; const s = codex.series(), n = codex.now();
    return { title: 'Time in market · last 24 h', explain: `The bot had at least one open paper position for ${s.timeInMarketPct.toFixed(0)}% of the last 24 hours. Right now: ${n.positions.length} open across ${n.coins} coin${n.coins === 1 ? '' : 's'}; watching ${n.watching.curves} live curves and ${n.watching.graduates} graduates.`,
      stats: [['Time in market', s.timeInMarketPct, 'pct'], ['Open now', n.positions.length, 'num'], ['Coins', n.coins, 'num'], ['Peak concurrent', Math.max(0, ...s.counts), 'num']],
      series: { label: 'Open positions per 5 minutes', kind: 'bar', fmt: 'num', points: s.counts.map((c, i) => [s.start + i * s.step, c]) } };
  };
  // ---- Edge Lab ----
  const testCols = [C('Hypothesis', 'label'), C('Window', 'window'), C('Tokens', 'n', 'num'), C('Net mean', 'meanPct', 'spct'), C('Lower bound', 'loPct', 'spct'), C('Status', 'status')];
  const edgeList = (title, explain, filter) => () => {
    const v = edgeView(); if (!v?.ready) return { title, explain: 'The first Edge Lab run starts about 45 seconds after launch and repeats every 15 minutes.' };
    const rows = v.tests.filter(filter).sort((a, b) => (b.loPct ?? -1e9) - (a.loPct ?? -1e9));
    return { title, explain, stats: [['Tests', rows.length, 'num'], ['Pass', rows.filter((t) => t.status === 'PASS').length, 'num'], ['Candidates', rows.filter((t) => t.status === 'CANDIDATE').length, 'num']],
      tables: [{ title: 'Tests, best lower bound first', cols: testCols, rows: rows.map((t) => ({ ...t, drill: `edge:${t.key}` })) }] };
  };
  Object.assign(H_, {
    edge_all: edgeList('All Edge Lab tests', 'Every hypothesis at every holding window. Tap a row for its full evidence.', (t) => !t.reference),
    edge_pass: edgeList('Passing tests', 'Tests that clear every part of the pass bar.', (t) => t.status === 'PASS'),
    edge_candidate: edgeList('Candidates', 'Positive after costs on 300+ tokens but missing at least one check.', (t) => t.status === 'CANDIDATE'),
    edge_fail: edgeList('Failed tests', 'Average return after costs at or below zero on 300+ tokens.', (t) => t.status === 'FAIL'),
    edge_collecting: edgeList('Still collecting', 'Fewer than 300 tokens since the hypothesis was registered.', (t) => t.status === 'COLLECTING'),
    edge_quality() {
      const v = edgeView(); const Ql = v?.quality || {};
      return { title: 'Labeling quality', explain: 'How each entry snapshot got its exit price. Snapshot = the token\'s own later snapshot. Graduated = curve closed inside the window (exit at graduation). Final = evicted while idle (no trades, so price unchanged). Pending or gap-flagged entries are excluded.',
        stats: [['Entries', Ql.entries, 'num'], ['Exit: own snapshot', Ql.exitSnapshot, 'num'], ['Exit: graduation', Ql.exitGraduated, 'num'], ['Exit: idle final', Ql.exitFinal, 'num'], ['Excluded: pending', Ql.pending, 'num'], ['Excluded: gap', Ql.excludedGap, 'num']],
        tables: [{ title: 'Labeled entries by window', cols: [C('Window', 'w'), C('Labeled tokens', 'n', 'num')], rows: Object.entries(v?.samples || {}).map(([w, n]) => ({ w, n })) }] };
    },
    edge_replay() {
      const v = edgeView(), R = v?.replay;
      return { title: 'Exit replay on recorded trades', explain: 'Every closed paper trade replayed on the recorded price tape under different exit rules, same costs and exit delay. Shows what the stop setting is doing with live data.',
        stats: [['Trades', R?.trades, 'num'], ['With tape', R?.withTape, 'num']],
        tables: [{ title: 'Rules', cols: [C('Rule', 'label'), C('Trades', 'n', 'num'), C('Avg', 'meanPct', 'spct'), C('95% low', 'lo95', 'spct'), C('Win', 'winPct', 'pct'), C('1st half', 'h1', 'spct'), C('2nd half', 'h2', 'spct')],
          rows: (R?.rules || []).map((r) => ({ ...r, h1: r.halves?.first, h2: r.halves?.second })) }] };
    },
    edge_costs() {
      const v = edgeView(), c = v?.costs || {};
      return { title: 'Cost basis', explain: 'Round-trip cost subtracted from every forward return. Pass decisions use the higher of the model and the audited real-fill cost once the fill audit has 30+ entries and exits.',
        stats: [['Model', c.model * 100, 'pct'], ['Audited fills', c.audited == null ? null : c.audited * 100, 'pct'], ['Audit sample', c.auditN, 'num'], ['Used', (c.primary ?? 0) * 100, 'pct'], ['Basis', c.basis, 'text']] };
    },
    edge_bar() {
      const v = edgeView(), B = v?.bar || {};
      return { title: 'Pass bar', explain: `All six must hold. The lower bound uses z = ${v?.z ? v.z.toFixed(2) : '–'}: a ${B.familyAlpha * 100}% family-wise error rate spread over ${v?.m ?? '–'} tests (Bonferroni), so the chance that any test passes by luck is about 1%.`,
        tables: [{ title: 'Checks', cols: [C('Check', 'c'), C('Rule', 'r')], rows: [
          { c: 'Sample', r: `${B.minTokens}+ distinct tokens launched after the hypothesis was registered` },
          { c: 'Span', r: `Those tokens span at least ${B.minSpanDays} days, so one hot hour cannot carry a pass` },
          { c: 'Margin', r: `Lower bound of net mean ≥ +${B.marginPts} points after costs` },
          { c: 'Halves', r: 'Net mean positive in the first and second half by time' },
          { c: 'Robust', r: `Still positive with the best ${B.dropTopPct}% of tokens removed (at least 3)` },
          { c: 'Universe', r: 'Beats all unrejected tokens in the same window (95% lower bound of the difference > 0)' }] }] };
    },
  });
  const edgeKey = (key) => {
    const d = edgeDetail(key); if (!d) return { title: 'Edge Lab test', explain: 'Not computed yet. Results appear after the first run.' };
    const ck = d.checks || {};
    const mark = (x) => (x == null ? 'n/a' : x ? 'pass' : 'not yet');
    return { title: d.label, explain: `${d.thesis} Window: ${d.window}. Registered ${new Date(d.registeredAt).toISOString().slice(0, 16).replace('T', ' ')} UTC (definition ${d.hash}); only tokens after that count.`,
      stats: [['Status', d.status, 'text'], ['Tokens counted', d.n, 'num'], ['Needed', d.needed, 'num'], ['Net mean', d.meanPct, 'spct'], ['Gross mean', d.grossMeanPct, 'spct'], ['Lower bound', d.loPct, 'spct'],
        ['Median', d.medianPct, 'spct'], ['Win rate', d.winPct, 'pct'], ['1st / 2nd half', `${d.halves?.first?.toFixed(1) ?? '–'} / ${d.halves?.second?.toFixed(1) ?? '–'}%`, 'text'], ['Best 1% removed', d.robustMeanPct, 'spct'],
        ['vs universe', d.vsUniverse?.diff, 'spct'], ['ETA to 300', d.eta?.daysLeft == null ? '–' : d.eta.daysLeft === 0 ? 'reached' : `${d.eta.daysLeft.toFixed(1)} days`, 'text'],
        ['Check: sample', mark(ck.sample), 'text'], ['Check: span', `${mark(ck.span)} (${(d.spanDays ?? 0).toFixed(1)} of ${d.bar.minSpanDays} days)`, 'text'], ['Check: margin', mark(ck.margin), 'text'], ['Check: halves', mark(ck.halves), 'text'], ['Check: robust', mark(ck.robust), 'text'], ['Check: universe', mark(ck.universe), 'text'],
        ['All history n / mean', `${d.context.n} / ${d.context.meanPct?.toFixed(1) ?? '–'}%`, 'text']],
      series: d.trajectory.length > 1 ? { label: 'Lower bound over runs (net, %)', kind: 'line', fmt: 'num1', points: d.trajectory.filter((r) => r.lo != null).map((r) => [r.t, r.lo]) }
        : { label: `Net return distribution (${d.histScope}, tokens)`, kind: 'cat', fmt: 'num', points: d.hist.map((b) => [`${b.lo}${b.hi > 1e8 ? '+' : ''}`, b.n]) },
      tables: [
        { title: `Net return distribution (${d.histScope})`, cols: [C('From %', 'lo', 'num'), C('To %', 'hi', 'num'), C('Tokens', 'n', 'num')], rows: d.hist.map((b) => ({ ...b, hi: b.hi > 1e8 ? null : b.hi })) },
        { title: 'By day (all history)', cols: [C('Day', 't', 'day'), C('Tokens', 'n', 'num'), C('Counted', 'counted', 'num'), C('Net mean', 'meanPct', 'spct')], rows: [...d.byDay].reverse() },
        { title: 'Tokens, newest first', cols: [C('Entry', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Gross', 'grossPct', 'spct'), C('Net', 'netPct', 'spct'), C('Counted', 'counted', 'yes')], rows: d.rows },
      ],
      note: `Costs: ${(d.costs.primary * 100).toFixed(1)}% round trip (${d.costs.basis}). Entry is at the snapshot price with no delay, which is optimistic; the +${d.bar.marginPts} point margin partly covers that.` };
  };
  // ---- smart-wallet tracker ----
  const sw = (w) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '–');
  const walletCols = [C('#', 'rank', 'num'), C('Wallet', 'short', 'wallet'), C('Basis', 'basis'), C('Positions', 'n', 'num'), C('Hits', 'k', 'num'), C('Hit rate', 'ratePct', 'pct'), C('95% low', 'loPct', 'pct'), C('Avg return', 'avgPct', 'spct'), C('P&L', 'pnlSol', 'susd')];
  const wRow = (r) => ({ ...r, short: sw(r.wallet), ratePct: r.rate * 100, loPct: r.lo * 100, avgPct: r.avgRet == null ? null : r.avgRet * 100, drill: `wallet:${r.wallet}`, label: `Wallet ${sw(r.wallet)}`, window: '' });
  const tradeColsW = [C('Time', 'ts', 'time'), C('Wallet', 'short', 'wallet'), C('Rank', 'rank', 'num'), C('Side', 'side'), C('Token', 'symbol', 'token'), C('SOL', 'sol', 'solusd'), C('Mcap', 'mcap', 'mcap')];
  Object.assign(H_, {
    tracker() {
      const v = trackerView(), C_ = v.config;
      return { title: 'Tracked smart wallets', explain: `Top ${C_.topN} wallets whose positions returned at least +${C_.profitPct}% more than ${C_.minRate * 100}% of the time, ranked by the 95% lower bound of that rate. "Realized" = scored from this machine's own position tracking (SOL out from sells plus tokens still held at the 1 h label price, divided by SOL in), ${C_.minPositions}+ positions. "Proxy" fills empty slots until enough wallets qualify: older record where a win means the token peaked at 3x+ after the wallet's early buy or graduated. Tap a wallet for its positions and trades.`,
        stats: [['Tracked', v.counts.tracked, 'num'], ['Realized basis', v.counts.realized, 'num'], ['Proxy basis', v.counts.proxy, 'num'], ['Wallets scored', v.scored.wallets, 'num'], ['Positions scored', v.scored.positions, 'num'], [`Eligible (${C_.minPositions}+ positions)`, v.scored.eligible, 'num'], ['Their trades 24 h', v.day.n, 'num'], ['Tokens they touched 24 h', v.day.tokens, 'num']],
        tables: [{ title: 'Tracked wallets', cols: walletCols, rows: v.wallets.map(wRow) }] };
    },
    tr_trades() {
      const v = trackerView();
      const rows = all("SELECT * FROM smart_trades s WHERE ts > ? AND NOT EXISTS (SELECT 1 FROM rejects r WHERE r.kind = 'curve' AND r.mint = s.mint) ORDER BY ts DESC LIMIT 1000", Date.now() - 7 * D).map((r) => ({ ...r, short: sw(r.wallet), side: r.is_buy ? 'buy' : 'sell' }));
      return { title: 'Tracked wallet trades', explain: 'Every buy and sell by a tracked wallet on a Pump.fun curve, recorded live as it happened. Last 7 days, newest first. Tap a row for the token.',
        stats: [['Trades 24 h', v.day.n, 'num'], ['Buys 24 h', v.day.buys, 'num'], ['Tokens 24 h', v.day.tokens, 'num'], ['Shown', rows.length, 'num']],
        series: { label: 'Tracked wallet trades per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows.filter((r) => r.ts > Date.now() - D).map((r) => ({ t: r.ts })), H, Date.now() - D) },
        tables: [{ title: 'Trades', cols: tradeColsW, rows }] };
    },
    tr_open() {
      const v = trackerView();
      return { title: 'Open positions of tracked wallets', explain: 'Positions on tokens still inside their first hour, marked to the current curve price (no exit costs).',
        stats: [['Open positions', v.open.length, 'num'], ['Tokens', new Set(v.open.map((r) => r.mint)).size, 'num']],
        tables: [{ title: 'Open positions', cols: [C('Entered', 'first_at', 'time'), C('Wallet', 'short', 'wallet'), C('Rank', 'rank', 'num'), C('Token', 'symbol', 'token'), C('Entry mcap', 'entry_mcap', 'mcap'), C('Now', 'mcap', 'mcap'), C('In', 'buy_sol', 'solusd'), C('Return', 'ret', 'spct')], rows: v.open.map((r) => ({ ...r, short: sw(r.wallet) })) }] };
    },
  });
  const walletDrill = (w) => {
    const d = walletDetail(w), r = d.tracked, p = d.perf;
    const posRows = d.positions.map((x) => ({ ...x, retPct: x.ret * 100 }));
    let eq = 0;
    return { title: `Wallet ${sw(w)}`, explain: `${r ? `Rank ${r.rank} of the tracked list (${r.basis} basis).` : 'Not currently in the tracked list.'} Full address: ${w}. Positions are scored at each token's 1 h label: SOL from sells plus tokens still held at the label price, over SOL spent.`,
      stats: [['Scored positions', p?.positions, 'num'], [`Hit +${T_().profitPct}%`, p ? (p.hits / Math.max(1, p.positions)) * 100 : null, 'pct'], ['Profitable', p ? (p.profitable / Math.max(1, p.positions)) * 100 : null, 'pct'],
        ['Touched +50% at peak', p ? (p.touched / Math.max(1, p.positions)) * 100 : null, 'pct'], ['Avg return', p ? (p.sum_ret / Math.max(1, p.positions)) * 100 : null, 'spct'], ['SOL in', p?.buy_sol, 'solusd'], ['P&L', p?.pnl_sol, 'susd'],
        ['Proxy record', d.proxy ? `${d.proxy.wins} wins of ${d.proxy.early_buys} early buys` : '–', 'text'], ['Open now', d.open.length, 'num'], ['Trades recorded', d.trades.length, 'num']],
      series: posRows.length > 1 ? { label: 'Cumulative P&L of scored positions (USD)', kind: 'line', fmt: 'susd', points: [...posRows].reverse().map((x) => [x.first_at, (eq += (x.sell_sol + x.held_tok * (x.label_mcap / 1e9)) - x.buy_sol)]) } : null,
      tables: [
        { title: 'Open positions', cols: [C('Entered', 'first_at', 'time'), C('Token', 'symbol', 'token'), C('Entry mcap', 'entry_mcap', 'mcap'), C('Now', 'mcap', 'mcap'), C('In', 'buy_sol', 'solusd'), C('Return', 'ret', 'spct')], rows: d.open },
        { title: 'Trades (live record)', cols: [C('Time', 'ts', 'time'), C('Side', 'side'), C('Token', 'symbol', 'token'), C('SOL', 'sol', 'solusd'), C('Mcap', 'mcap', 'mcap')], rows: d.trades.map((x) => ({ ...x, side: x.is_buy ? 'buy' : 'sell' })) },
        { title: 'Scored positions', cols: [C('Entered', 'first_at', 'time'), C('Token', 'symbol', 'token'), C('Entry mcap', 'entry_mcap', 'mcap'), C('In', 'buy_sol', 'solusd'), C('Out', 'sell_sol', 'solusd'), C('Return', 'retPct', 'spct'), C('Hit', 'hit', 'yes'), C('Graduated', 'graduated', 'yes')], rows: posRows },
      ], note: `Solscan: https://solscan.io/account/${w}` };
  };
  // ---- rejects bucket ----
  const rejCols = (kind) => [C('Rejected', 'first_ts', 'time'), C('Token', 'symbol', 'token'), C('Reason', 'reason'), C('Age', 'age_sec', 'age'),
    kind === 'grad' ? C('Mcap at reject', 'mcap_usd', 'usd') : C('Mcap at reject', 'mcap', 'mcap'), C(kind === 'grad' ? 'High 6 h after' : 'High after', 'afterX', 'mult'), ...(kind === 'curve' ? [C('Graduated', 'graduated', 'yes')] : [])];
  const KN = { curve: 'New coins', grad: 'Graduated coins' };
  const rejSummary = (rows) => { const lab = rows.filter((r) => r.labeled); return { lab: lab.length, x2: lab.filter((r) => r.missed).length }; };
  const rejDrill = (kind, cat = null, onlyMissed = false) => {
    const v = rejectsView(), V = v[kind];
    let rows = rejectRows(kind, { cat, limit: 2000 }); if (onlyMissed) rows = rows.filter((r) => r.missed);
    const sm = rejSummary(rows), base = kind === 'curve' ? V.launches : V.seen;
    const title = onlyMissed ? `${KN[kind]}: rejected, then 2x+` : cat ? `${KN[kind]} rejected: ${cat}` : `${KN[kind]} in the rejects bucket`;
    return { title, explain: `${kind === 'curve' ? 'New Pump.fun launches' : 'Graduated Pump.fun coins'} that failed a hard filter at least once in the last 24 h. Rejection is sticky: from that moment the coin gets no alerts, no paper entries in any book, no tracked-wallet trades recorded and no Edge Lab samples. "High after" is the highest market cap ${kind === 'curve' ? 'reached after the rejecting snapshot (within the 1 h window)' : 'in the 6 h after the rejecting poll'}, as a multiple of the market cap at rejection; it shows what the filter cost when it was wrong. Tap a row for the coin.`,
      stats: [['Coins', rows.length, 'num'], ...(cat || onlyMissed ? [] : [[kind === 'curve' ? 'Share of launches' : 'Share of graduates seen', base ? (V.n / base) * 100 : null, 'pct']]), ['Outcome known', sm.lab, 'num'], ['Went 2x+ after reject', sm.x2, 'num'], ['2x+ rate', sm.lab ? (sm.x2 / sm.lab) * 100 : null, 'pct']],
      series: { label: 'Rejected per hour', kind: 'bar', fmt: 'num', points: bucket(rows.map((r) => ({ t: r.first_ts })), H, Date.now() - D) },
      tables: [{ title: cat ? 'Coins' : 'By reason', cols: cat ? rejCols(kind) : [C('Reason', 'cat'), C('Coins', 'n', 'num'), C('Share', 'share', 'pct')], rows: cat ? rows.map((r) => ({ ...r, kind })) : V.byCat.map((c) => ({ ...c, share: (c.n / Math.max(1, V.n)) * 100, drill: `rej_cat:${kind}:${c.cat}`, label: c.cat, window: '' })) },
        ...(cat ? [] : [{ title: 'Most recent', cols: rejCols(kind), rows: rows.slice(0, 500).map((r) => ({ ...r, kind })) }])] };
  };
  Object.assign(H_, {
    rej_curve: () => rejDrill('curve'), rej_grad: () => rejDrill('grad'),
    rej_missed_curve: () => rejDrill('curve', null, true), rej_missed_grad: () => rejDrill('grad', null, true),
    rej_blocked() {
      const v = rejectsView(), b = v.blocked.live;
      const rows = all("SELECT entry_ts, book, symbol, mint, skip_reason, score FROM paper_trades WHERE status = 'skipped' AND skip_reason LIKE 'rejected%' AND entry_ts > ? ORDER BY entry_ts DESC LIMIT 500", Date.now() - D);
      return { title: 'Trades blocked by the rejects rule', explain: 'Signals that would have produced an alert, a paper entry or a tracked-wallet trade record on a coin already in the rejects bucket. Live counters reset on restart; the table lists paper fills skipped because the coin was rejected between signal and fill.',
        stats: [['Alerts blocked', b.alert, 'num'], ['Fills skipped', b.fill, 'num'], ['Graduate entries blocked', b.grad, 'num'], ['Tracked trades not recorded', b.tracker, 'num'], ['Skipped fills 24 h', rows.length, 'num']],
        tables: [{ title: 'Skipped paper fills', cols: [C('Time', 'entry_ts', 'time'), C('Book', 'book', 'book'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num1'), C('Reason', 'skip_reason')], rows }] };
    },
  });
  // ---- uptime tape: everything that happened in a window [a, b) ----
  const EV_LABEL = { entry: 'Entry', exit: 'Exit', tp1: 'Take profit (partial)', stop: 'Stop triggered', trigger: 'Exit triggered', confirm: 'Confirm check', skip: 'Skipped' };
  const tapeDrill = (a, b) => {
    const px = market.solUsd || null, mins = Math.round((b - a) / 60000);
    const fm = all('SELECT minute, trades, creates, reconnects, gap_sec, up_sec FROM feed_minutes WHERE minute >= ? AND minute < ? ORDER BY minute', Math.floor(a / 60000), Math.ceil(b / 60000));
    const fmm = new Map(fm.map((r) => [r.minute, r]));
    const events = [];
    const pull = (rows, kind) => { for (const r of rows) { let ev = []; try { ev = JSON.parse(r.events || '[]'); } catch { /* ignore */ }
      if (!ev.some((e) => e.type === 'entry')) ev.unshift({ t: r.entry_ts, type: 'entry', mcap: r.entry_mcap });
      if (r.exit_ts && !ev.some((e) => e.type === 'exit')) ev.push({ t: r.exit_ts, type: 'exit', reason: r.exit_reason });
      for (const e of ev) { if (!(e.t >= a && e.t < b)) continue;
        const usdM = e.mcap == null ? null : kind === 'grad' ? e.mcap : px ? e.mcap * px : null;
        events.push({ ts: e.t, event: EV_LABEL[e.type] || e.type, type: e.type, book: kind === 'grad' ? `graduates · ${r.book || 'fixed'}` : r.book || 'main', symbol: r.symbol, mint: r.mint, kind, mcapUsd: usdM,
          pnl_pct: e.type === 'exit' ? r.pnl_pct : null, pnl_sol: e.type === 'exit' ? r.pnl_sol : null, reason: e.reason || (e.type === 'exit' ? r.exit_reason : ''), trade: r.id, status: r.status }); } } };
    // a trade is relevant if it was open at any point in the window
    pull(all('SELECT * FROM paper_trades WHERE entry_ts < ? AND (exit_ts IS NULL OR exit_ts >= ?)', b, a), 'curve');
    pull(all('SELECT * FROM grad_paper WHERE entry_ts < ? AND (exit_ts IS NULL OR exit_ts >= ?)', b, a), 'grad');
    events.sort((x, y) => x.ts - y.ts);
    const openAt = all(`SELECT p.id, p.book, p.symbol, p.mint, p.entry_ts, p.entry_mcap, p.exit_ts FROM paper_trades p WHERE p.entry_ts < ? AND (p.exit_ts IS NULL OR p.exit_ts >= ?) ORDER BY p.entry_ts`, b, a)
      .map((r) => ({ ...r, mcapUsd: px ? r.entry_mcap * px : null, state: r.exit_ts && r.exit_ts < b ? 'closed in window' : r.entry_ts >= a ? 'opened in window' : 'held through' }));
    const alerts = all('SELECT a.ts, a.mint, t.symbol, a.score, a.mcap, a.max_multiple FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint WHERE a.ts >= ? AND a.ts < ? ORDER BY a.ts', a, b);
    const exits = events.filter((e) => e.type === 'exit');
    const up = fm.reduce((x, r) => x + Math.min(60, r.up_sec || 0), 0) / 60, gap = fm.reduce((x, r) => x + (r.gap_sec || 0), 0);
    const fmt = (t) => new Date(t).toISOString().slice(11, 16);
    const tables = [
      { title: 'Paper trade events, in time order', cols: [C('Time', 'ts', 'time'), C('Event', 'event'), C('Book', 'book', 'book'), C('Token', 'symbol', 'token'), C('Mcap', 'mcapUsd', 'usd'), C('P&L', 'pnl_pct', 'spct'), C('P&L $', 'pnl_sol', 'susd'), C('Detail', 'reason')], rows: events },
      { title: 'Positions open during the window', cols: [C('Entered', 'entry_ts', 'time'), C('Book', 'book', 'book'), C('Token', 'symbol', 'token'), C('Entry mcap', 'mcapUsd', 'usd'), C('State', 'state'), C('Closed', 'exit_ts', 'time')], rows: openAt },
      { title: 'Alerts fired', cols: [C('Time', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num1'), C('Mcap', 'mcap', 'mcap'), C('Peak multiple', 'max_multiple', 'mult')], rows: alerts },
    ];
    if (mins > 1) {
      const per = [];
      for (let m = Math.floor(a / 60000); m < Math.ceil(b / 60000); m++) { const r = fmm.get(m), t = m * 60000, ev = events.filter((e) => e.ts >= t && e.ts < t + 60000);
        per.push({ t, trades: r?.trades ?? null, gap: r?.gap_sec || 0, up: r ? Math.min(60, r.up_sec || 0) : 0, entries: ev.filter((e) => e.type === 'entry').length, exits: ev.filter((e) => e.type === 'exit').length,
          alerts: alerts.filter((x) => x.ts >= t && x.ts < t + 60000).length, drill: `tape:${t}-${t + 60000}`, label: `Minute ${fmt(t)} UTC`, window: '' }); }
      tables.push({ title: 'Minute by minute (tap a minute)', cols: [C('Minute', 't', 'time'), C('Market trades', 'trades', 'num'), C('Entries', 'entries', 'num'), C('Exits', 'exits', 'num'), C('Alerts', 'alerts', 'num'), C('Gap s', 'gap', 'num'), C('Up s', 'up', 'num')], rows: per.reverse() });
    }
    return { title: mins <= 1 ? `Minute ${fmt(a)} UTC` : `${fmt(a)}–${fmt(b)} UTC`, explain: `Everything recorded between ${new Date(a).toISOString().replace('T', ' ').slice(0, 16)} and ${new Date(b).toISOString().slice(11, 16)} UTC: market trade flow from the feed, every paper trade event (entries, partial take-profits, stops, exits) across the curve books and the graduates book, positions held through the window, and alerts. Tap a trade for the token detail.`,
      stats: [['Window', mins <= 1 ? '1 minute' : mins < 60 ? `${mins} minutes` : `${n1(mins / 60)} h`, 'text'], ['Feed up', `${n1(up)} of ${mins} min`, 'text'], ['Gap seconds', gap, 'num'], ['Market trades', fm.reduce((x, r) => x + (r.trades || 0), 0), 'num'],
        ['Launches', fm.reduce((x, r) => x + (r.creates || 0), 0), 'num'], ['Paper entries', events.filter((e) => e.type === 'entry').length, 'num'], ['Paper exits', exits.length, 'num'],
        ['Exit P&L $', exits.reduce((x, e) => x + (e.pnl_sol || 0), 0), 'susd'], ['Open during window', openAt.length, 'num'], ['Alerts', alerts.length, 'num']],
      series: mins > 1 ? { label: 'Market trades per minute', kind: 'bar', fmt: 'num', points: fm.map((r) => [r.minute * 60000, r.trades || 0]) } : null,
      tables };
  };
  // ---- one token: everything recorded about it ----
  const tokDrill = (mint) => {
    const T = one('SELECT * FROM tokens WHERE mint = ?', mint) || {};
    const live = engine.getToken?.(mint);
    const snaps = all('SELECT checkpoint, ts, mcap, score, reject, max_mcap_after, graduated_after, gap FROM snapshots WHERE mint = ? ORDER BY checkpoint', mint);
    const trades = all('SELECT ts, is_buy, sol, wallet, vsol, vtok FROM trades WHERE mint = ? ORDER BY ts DESC LIMIT 300', mint);
    const papers = all('SELECT id, book, entry_ts, exit_ts, pnl_pct, pnl_sol, exit_reason, status FROM paper_trades WHERE mint = ? ORDER BY entry_ts DESC', mint);
    const alerts = all('SELECT ts, score, mcap, max_multiple, graduated FROM alerts WHERE mint = ? ORDER BY ts DESC', mint);
    const buys = trades.filter((t) => t.is_buy), sells = trades.filter((t) => !t.is_buy);
    const sum = (a) => a.reduce((x, t) => x + (t.sol || 0), 0);
    return { title: `${T.symbol || live?.symbol || mint.slice(0, 6)}: full record`, explain: 'Everything this machine stored about the token: checkpoint snapshots, recorded trades (kept only for tokens that alerted or were paper traded), paper trades and alerts.',
      stats: [['Created', T.created_at, 'time'], ['Graduated', T.graduated ? 'yes' : 'no', 'text'], ['Peak mcap 1 h', T.peak_mcap_1h, 'mcap'], ['Mcap at 1 h', T.mcap_1h, 'mcap'],
        ['Snapshots', snaps.length, 'num'], ['Trades recorded', trades.length, 'num'], ['Buy volume', sum(buys), 'solusd'], ['Sell volume', sum(sells), 'solusd'], ['Paper trades', papers.length, 'num'], ['Alerts', alerts.length, 'num']],
      series: snaps.length > 1 ? { label: 'Market cap at each checkpoint (USD)', kind: 'cat', fmt: 'mcap', points: snaps.map((r) => [`${r.checkpoint}s`, r.mcap]) } : null,
      tables: [
        { title: 'Checkpoint snapshots', cols: [C('Age', 'checkpoint', 'age'), C('Time', 'ts', 'time'), C('Mcap', 'mcap', 'mcap'), C('Score', 'score', 'num1'), C('Rejected', 'reject'), C('Max after', 'max_mcap_after', 'mcap'), C('Graduated after', 'graduated_after', 'yes')], rows: snaps },
        { title: 'Paper trades', cols: [C('Entered', 'entry_ts', 'time'), C('Book', 'book', 'book'), C('Status', 'status'), C('P&L', 'pnl_pct', 'spct'), C('P&L $', 'pnl_sol', 'susd'), C('Exit', 'exit_reason')], rows: papers },
        { title: 'Alerts', cols: [C('Time', 'ts', 'time'), C('Score', 'score', 'num1'), C('Mcap', 'mcap', 'mcap'), C('Peak multiple', 'max_multiple', 'mult'), C('Graduated', 'graduated', 'yes')], rows: alerts },
        { title: 'Recorded trades, newest first', cols: [C('Time', 'ts', 'time'), C('Side', 'side'), C('SOL', 'sol', 'solusd'), C('Wallet', 'wallet', 'wallet')], rows: trades.map((t) => ({ ...t, side: t.is_buy ? 'buy' : 'sell' })) },
      ] };
  };
  const symOf = db.prepare('SELECT symbol FROM grad_watch WHERE mint = ?');
  function gbtDrill(k) {
    const BT = runGradBacktest({ solUsd: market.solUsd || 100 });
    if (k === 'all') {
      return { title: 'Graduates backtest sweep', explain: `${BT.variants} variants (${BT.entryScores.length} entry thresholds × ${BT.variants / BT.entryScores.length} exit rules) replayed over ${BT.snapshots.toLocaleString()} stored ${BT.resolutionMin}-minute snapshots of ${BT.tokens.toLocaleString()} graduates. Every variant is scored on the same history, so the best row is flattered by selection: the expected best-of-${BT.variants} lift on pure noise is about ${BT.bestOfLiftPts == null ? '?' : BT.bestOfLiftPts.toFixed(0)} points. Trust the time split (first half / second half) over the rank.`,
        stats: [['Variants', BT.variants, 'num'], ['Snapshots', BT.snapshots, 'num'], ['Graduates', BT.tokens, 'num'], ['Best-of lift', BT.bestOfLiftPts, 'spct']],
        tables: [{ title: 'All variants, best lower bound first', cols: [C('Entry ≥', 'entryScore', 'num0'), C('Exit rule', 'label'), C('Trades', 'n', 'num'), C('Tokens', 'mints', 'num'), C('Mean', 'meanPct', 'spct'), C('95% low', 'loPct', 'spct'), C('1st half', 'firstHalfPct', 'spct'), C('2nd half', 'secondHalfPct', 'spct'), C('Win', 'winPct', 'pct'), C('Liq gone', 'liqGone', 'num'), C('Live', 'live')],
          rows: BT.results.map((r) => ({ ...r, live: r.live || '', drill: `gbt:${r.key}` })) }] };
    }
    const R = BT.results.find((r) => r.key === k), T = gradBacktestTrades(k); if (!R || !T) return null;
    return { title: `${R.label} · entries at score ≥ ${R.entryScore}`, explain: `Every scored poll at or above ${R.entryScore} (one per token per ${config.grads.alertCooldownMin} min) is entered at that poll's price plus price impact, fee and slippage, then walked forward through the stored snapshots under this exit rule. "Liquidity gone" means the token was later dropped for a dead pool while the position was still open; it is booked at −100%. "Open at end of data" positions are marked at the last price.`,
      stats: [['Trades', R.n, 'num'], ['Mean', R.meanPct, 'spct'], ['95% low', R.loPct, 'spct'], ['Win rate', R.winPct, 'pct'], ['First half', R.firstHalfPct, 'spct'], ['Second half', R.secondHalfPct, 'spct']],
      series: { label: 'P&L per trade (%) in entry order', kind: 'bar', fmt: 'spct', points: [...T].sort((a, b) => a.ts - b.ts).map((t) => [t.ts, t.pct]) },
      tables: [
        { title: 'Exit mix', cols: [C('Exit', 'reason'), C('Trades', 'n', 'num'), C('Avg P&L', 'avgPct', 'spct')], rows: R.mix },
        { title: 'Trades', cols: [C('Entered', 'ts', 'time'), C('Token', 'symbol', 'token'), C('Score', 'score', 'num0'), C('P&L', 'pct', 'spct'), C('Held', 'heldMin', 'min'), C('Exit', 'reason')],
          rows: [...T].sort((a, b) => b.ts - a.ts).map((t) => ({ ...t, symbol: symOf.get(t.mint)?.symbol || t.mint.slice(0, 6) })) },
      ] };
  }
  return (key) => {
    if (key === 'about_numbers') {
      return { key, generatedAt: Date.now(), title: 'Disclosures: how the numbers are produced', explain: SHORT,
        sections: SECTIONS,
        tables: [{ title: 'Simulation parameters currently in force', cols: [C('Setting', 'k'), C('Value', 'v')], rows: simulationParams(config) }] };
    }
    const fn = key.startsWith('gbt:') ? () => gbtDrill(key.slice(4)) : key.startsWith('book_') ? () => bookDrill(key.slice(5)) : key.startsWith('gate:') ? () => gateDrill(key.slice(5)) : key.startsWith('seq:') ? () => seqDrill(key.slice(4)) : key.startsWith('pair:') ? () => pairDrill(key.slice(5)) : key === 'codex_day' ? codexDay : key === 'codex_tape' ? codexTape : key === 'codex_market' ? codexMarket : key === 'codex_equity' ? codexEquity : key === 'rn_scorecard' ? rnScorecard : key === 'rn_live' ? rnLive : key.startsWith('rn_day:') ? () => rnDay(key.slice(7)) : key.startsWith('edge:') ? () => edgeKey(key.slice(5)) : key.startsWith('tok:') ? () => tokDrill(key.slice(4)) : key.startsWith('rej_cat:') ? () => { const [, kind, ...c] = key.split(':'); return rejDrill(kind, c.join(':')); } : key.startsWith('wallet:') ? () => walletDrill(key.slice(7)) : key.startsWith('tape:') ? () => { const [x, y] = key.slice(5).split('-').map(Number); return tapeDrill(x, Math.min(y, x + 6 * H)); } : H_[key];
    if (!fn) return null;
    const out = fn();
    return { key, generatedAt: Date.now(), solUsd: market.solUsd, ...out };
  };
}
export { STRATEGIES };

/** Paper trade entry/exit times for the uptime tape markers. */
export function tapeMarks(sinceMs) {
  const c = db.prepare('SELECT entry_ts e, exit_ts x, pnl_pct p FROM paper_trades WHERE entry_ts >= ? OR exit_ts >= ?').all(sinceMs, sinceMs);
  const g = db.prepare('SELECT entry_ts e, exit_ts x, pnl_pct p FROM grad_paper WHERE entry_ts >= ? OR exit_ts >= ?').all(sinceMs, sinceMs);
  return [...c, ...g].map((r) => [r.e, r.x, r.p]);
}
