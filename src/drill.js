// Drill-downs: every tile on the dashboard opens a detail sheet backed by this module.
// Each handler returns a generic shape the client renders the same way:
//   { title, explain, stats: [[label, value, fmt]], series: { label, fmt, kind, points: [[t, v]] }, table: { cols, rows }, note }
// Values are raw (SOL amounts, SOL mcaps, ms timestamps); the client converts SOL to USD with the live price.
import { db } from './db.js';
import { config } from './config.js';
import { market } from './market.js';
import { CFG, CFG_SINCE, cfgHistory } from './version.js';
import { closedCurrent, killStatsFrom, STRATEGIES } from './engine/paper.js';

const H = 3600000, D = 86400000;
const solHist = []; // [t, usd] one per minute, 48 h, in memory
const sampleSol = () => { if (market.solUsd) { solHist.push([Date.now(), market.solUsd]); if (solHist.length > 2880) solHist.shift(); } };
setTimeout(sampleSol, 15000); setInterval(sampleSol, 60000);

const C = (h, k, fmt = 'text', o = {}) => ({ h, k, fmt, ...o });
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

export function makeDrill({ engine, grads }) {
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
      return { title: 'Labeled graduate snapshots', explain: 'Every poll of a graduate is stored with its features; 6 hours later it is labeled with what happened next. These rows train and check the re-ignition score.',
        stats: [['Recorded', tot.n, 'num'], ['Labeled', tot.l, 'num'], ['Last 24 h', rows.length, 'num']],
        series: { label: 'Snapshots per hour, last 24 h', kind: 'bar', fmt: 'num', points: bucket(rows, H, since) } };
    },
    g_liq() {
      const rows = all(`SELECT s.liq FROM grad_watch w JOIN grad_snapshots s ON s.mint = w.mint AND s.ts = (SELECT MAX(ts) FROM grad_snapshots x WHERE x.mint = w.mint) WHERE w.active = 1 AND s.liq > 0`);
      const edges = [0, 5e3, 1e4, 2e4, 4e4, 6e4, 1e5, 2.5e5, 1e12];
      return { title: 'Liquidity filter', explain: `Graduates below the minimum pool liquidity are watched but never alerted or traded: thin pools make paper fills unrealistic. Belphor's data shows pools above $60k liquidity reached +50% far more often (23% vs 14%).`,
        stats: [['Minimum', config.grads?.minLiqUsd ?? null, 'usd'], ['Watched with a pool', rows.length, 'num']],
        series: { label: 'Watched graduates by pool liquidity (USD)', kind: 'cat', fmt: 'num', points: edges.slice(0, -1).map((e, i) => [`${e >= 1e3 ? e / 1e3 + 'k' : e}${i === edges.length - 2 ? '+' : ''}`, rows.filter((r) => r.liq >= e && r.liq < edges[i + 1]).length]) } };
    },
    g_paper() {
      const rows = all(`SELECT * FROM grad_paper WHERE status = 'closed' ORDER BY exit_ts DESC LIMIT 200`);
      const k = killStatsFrom([...rows].reverse());
      let eq = 0;
      return { title: 'Graduates paper book', explain: 'Paper trades on re-ignition alerts, filled at the next poll price plus price impact from pool depth, with fees and extra slippage.',
        stats: [['Closed', k.n, 'num'], ['Avg / trade', k.expectancyPct, 'spct'], ['Win rate', k.winRatePct, 'pct'], ['Total', k.totalPnlSol, 'susd']],
        series: { label: 'Cumulative P&L (USD)', kind: 'line', fmt: 'susd', points: [...rows].reverse().map((r) => [r.exit_ts, (eq += r.pnl_sol)]) },
        tables: [{ title: 'Closed trades', cols: tradeCols.filter((c) => c.k !== 'book'), rows: rows.map(tradeRow) }] };
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
        tables: [{ title: 'Rugged tokens', cols: [C('Launched', 'created_at', 'time'), C('Token', 'symbol', 'token'), C('Peak 1 h', 'peak_mcap_1h', 'mcap'), C('At 1 h', 'mcap_1h', 'mcap'), C('Creator', 'creator', 'short')], rows }] };
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
    h_cov: () => H_.rep_cov(),
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
    h_labels() { return H_.alerts(); },
    // ---- benchmarks ----
    b_random() {
      const rows = closedCurrent().filter((r) => r.book === 'random').reverse();
      return { title: 'Random control book', explain: `At each Main, Band or Flow signal, a random other token that passed the hard filters, similar in age (±${config.strategies.random.ageTolPct}%) and mcap (±${config.strategies.random.mcapTolPct}%), is bought with the same exits and costs.`,
        tables: [{ title: 'Closed control trades', cols: tradeCols.filter((c) => c.k !== 'book'), rows: rows.map(tradeRow) }] };
    },
    b_lift() { return H_.alerts(); },
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
  return (key) => {
    const fn = key.startsWith('book_') ? () => bookDrill(key.slice(5)) : H_[key];
    if (!fn) return null;
    const out = fn();
    return { key, generatedAt: Date.now(), solUsd: market.solUsd, ...out };
  };
}
export { STRATEGIES };
