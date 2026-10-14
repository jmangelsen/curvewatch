// Trade terminal backend: what traded when, what it made or lost, and why.
// Everything here is derived from recorded data (paper trades, their entry features, and the stored trade tape).
import { config } from './config.js';
import { db } from './db.js';
import { STRATEGIES, BOOKS, COST } from './engine/paper.js';
import { market } from './market.js';

const Q = {
  list: db.prepare(`SELECT id, book, rules, status, mint, symbol, score, signal_ts, signal_mcap, entry_ts, entry_mcap, exit_ts, exit_reason, pnl_pct, pnl_sol, peak_value, trough_value, size_sol,
    max_drop_pct, cause, cause_detail, entry_slip_pct, skip_reason, market, gated FROM paper_trades WHERE rules = @rules AND (@book = '' OR book = @book) AND id < @before ORDER BY id DESC LIMIT @limit`),
  one: db.prepare(`SELECT p.*, t.name, t.creator, t.created_at FROM paper_trades p LEFT JOIN tokens t ON t.mint = p.mint WHERE p.id = ?`),
  bySymbol: db.prepare(`SELECT id FROM paper_trades WHERE rules = ? AND status IN ('closed','open') AND lower(symbol) = lower(?) ORDER BY id DESC LIMIT 1`),
  path: db.prepare(`SELECT ts, vsol / vtok * 1e9 AS mc, is_buy b, sol FROM trades WHERE mint = ? AND ts BETWEEN ? AND ? ORDER BY ts, slot`),
  closed: db.prepare(`SELECT id, book, symbol, mint, score, entry_ts, exit_ts, pnl_pct, pnl_sol, peak_value, trough_value, size_sol, max_drop_pct, cause, entry_slip_pct, features, market, exit_reason
    FROM paper_trades WHERE status = 'closed' AND rules = ? AND exit_ts >= ? ORDER BY exit_ts`),
  skipped: db.prepare(`SELECT book, skip_reason FROM paper_trades WHERE status = 'skipped' AND rules = ? AND entry_ts >= ?`),
};

const median = (a) => { const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const parse = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const pct = (x, d = 1) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`);

const FEATURE_LABEL = {
  flow60Sol: ['60s net inflow', 'SOL'], medianBuySol: ['median buy', 'SOL'], netSolPerMin: ['net inflow / min', 'SOL'], buyersPerMin: ['buyers / min', ''], uniqueBuyers: ['unique buyers', ''],
  buySellRatio: ['buy/sell ratio', '×'], top10Pct: ['top-10 holders', '%'], bundlePct: ['bundled buys', '%'], creatorHoldPct: ['creator holds', '%'], drawdownPct: ['drawdown from high', '%'],
  ageSec: ['age at signal', 's'], progressPct: ['curve progress', '%'], mcapSol: ['mcap at signal', 'SOL'], tinyBuyShare: ['tiny-buy share', ''], initialBuySol: ['creator initial buy', 'SOL'],
};

export function tradeList({ book = '', limit = 50, before = 1e15 } = {}) {
  return Q.list.all({ rules: config.paper.rules, book, limit: Math.min(200, limit), before }).map((r) => ({
    ...r, market: parse(r.market), peakPct: r.size_sol ? (r.peak_value / r.size_sol - 1) * 100 : null, troughPct: r.size_sol && r.trough_value ? (r.trough_value / r.size_sol - 1) * 100 : null,
  }));
}

/** Full forensics for one trade: path, features vs the book's winners/losers, narrative. */
export function tradeDetail(idOrSymbol) {
  let id = Number(idOrSymbol);
  if (!Number.isFinite(id)) id = Q.bySymbol.get(config.paper.rules, String(idOrSymbol).replace(/^\$/, ''))?.id;
  const r = id ? Q.one.get(id) : null;
  if (!r) return null;
  const S = STRATEGIES[r.book] || STRATEGIES.main;
  const t0 = (r.signal_ts || r.entry_ts) - 60000, t1 = (r.exit_ts || Date.now()) + 120000;
  let path = Q.path.all(r.mint, t0, t1);
  if (path.length > 400) { const step = path.length / 400; path = Array.from({ length: 400 }, (_, i) => path[Math.floor(i * step)]).concat(path[path.length - 1]); }
  const features = parse(r.features) || {};
  // compare against the same book's winners and losers (last 14 days)
  const peers = Q.closed.all(config.paper.rules, Date.now() - 14 * 86400000).filter((x) => x.book === r.book && x.id !== r.id);
  const W = peers.filter((x) => x.pnl_pct > 0).map((x) => parse(x.features) || {}), L = peers.filter((x) => x.pnl_pct <= 0).map((x) => parse(x.features) || {});
  const cmp = Object.keys(FEATURE_LABEL).filter((k) => features[k] != null).map((k) => ({
    key: k, label: FEATURE_LABEL[k][0], unit: FEATURE_LABEL[k][1], value: features[k], winnersMedian: median(W.map((f) => f[k])), losersMedian: median(L.map((f) => f[k])),
  }));
  const peakPct = r.size_sol ? (r.peak_value / r.size_sol - 1) * 100 : null, troughPct = r.size_sol && r.trough_value ? (r.trough_value / r.size_sol - 1) * 100 : null;
  const lines = [];
  lines.push(`${S.label} book · entry rule: ${S.entry}.`);
  if (r.status === 'skipped') lines.push(`Skipped: ${r.skip_reason}.`);
  else {
    lines.push(`Signal at ${solUsd(r.signal_mcap)} mcap, entered ${r.signal_ts ? Math.round((r.entry_ts - r.signal_ts) / 1000) : '?'}s later at ${solUsd(r.entry_mcap)} (${pct(r.entry_slip_pct)} vs signal). Costs put it at about ${pct(-(1 - COST) * 100)} from the start.`);
    if (r.status === 'closed') lines.push(`Best point ${pct(peakPct)}, worst ${pct(troughPct)}, largest single drop ${r.max_drop_pct != null ? `${r.max_drop_pct.toFixed(0)}%` : '–'}. Exit: ${r.exit_reason} after ${((r.exit_ts - r.entry_ts) / 60000).toFixed(1)} min → ${pct(r.pnl_pct)}.`);
    if (r.cause) lines.push(`Why: ${r.cause} — ${r.cause_detail}`);
    const strong = cmp.filter((c) => c.winnersMedian != null && c.losersMedian != null && c.winnersMedian !== c.losersMedian)
      .map((c) => ({ ...c, side: Math.abs(c.value - c.winnersMedian) < Math.abs(c.value - c.losersMedian) ? 'winners' : 'losers' }));
    const lw = strong.filter((c) => c.side === 'winners').length, ll = strong.filter((c) => c.side === 'losers').length;
    if (strong.length >= 3) lines.push(`At entry it looked more like this book's ${lw >= ll ? 'winners' : 'losers'} on ${Math.max(lw, ll)} of ${strong.length} features (${W.length} winners, ${L.length} losers to compare).`);
  }
  return { trade: { ...r, features, market: parse(r.market), events: parse(r.events) || [], peakPct, troughPct }, strategy: S, path, compare: cmp, narrative: lines, solUsd: market.solUsd };
}

/** Per-strategy report: what worked, what didn't, and why. */
export function strategyReport({ days = 14 } = {}) {
  const since = Date.now() - days * 86400000;
  const rows = Q.closed.all(config.paper.rules, since);
  const skipped = Q.skipped.all(config.paper.rules, since);
  const out = [];
  for (const b of BOOKS) {
    const S = STRATEGIES[b];
    const R = rows.filter((r) => r.book === b);
    const n = R.length, wins = R.filter((r) => r.pnl_pct > 0);
    const p = R.map((r) => r.pnl_pct), m = mean(p), s = sd(p);
    const ci = s != null ? [m - (1.96 * s) / Math.sqrt(n), m + (1.96 * s) / Math.sqrt(n)] : [null, null];
    const causes = {};
    for (const r of R) { const c = r.cause || (r.pnl_pct > 0 ? 'WIN (unlabeled)' : 'LOSS (unlabeled)'); (causes[c] ||= { n: 0, pnl: 0 }); causes[c].n++; causes[c].pnl += r.pnl_pct; }
    const causeList = Object.entries(causes).map(([cause, v]) => ({ cause, n: v.n, sharePct: (v.n / n) * 100, avgPct: v.pnl / v.n })).sort((a, b) => b.n - a.n);
    // features: winners vs losers, ranked by standardized gap
    const fW = wins.map((r) => parse(r.features) || {}), fL = R.filter((r) => r.pnl_pct <= 0).map((r) => parse(r.features) || {});
    const feats = Object.keys(FEATURE_LABEL).map((k) => {
      const a = fW.map((f) => f[k]).filter(Number.isFinite), z = fL.map((f) => f[k]).filter(Number.isFinite);
      if (a.length < 3 || z.length < 3) return null;
      // rank-based separation (AUC): 0.5 = no difference, 1 = winners always higher, 0 = always lower. Robust to outliers.
      let gt = 0; for (const x of a) for (const y of z) gt += x > y ? 1 : x === y ? 0.5 : 0;
      const auc = gt / (a.length * z.length);
      return { key: k, label: FEATURE_LABEL[k][0], unit: FEATURE_LABEL[k][1], winners: median(a), losers: median(z), auc, gap: (auc - 0.5) * 2, nW: a.length, nL: z.length };
    }).filter(Boolean).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, 5);
    const sk = skipped.filter((x) => x.book === b);
    const peakMed = median(R.map((r) => (r.size_sol ? (r.peak_value / r.size_sol - 1) * 100 : null)));
    const slipMed = median(R.map((r) => r.entry_slip_pct));
    const heldMed = median(R.map((r) => (r.exit_ts - r.entry_ts) / 60000));
    // narrative
    const worked = [], didnt = [], next = [];
    if (!n) didnt.push('No closed trades yet.');
    else {
      const tgt = causeList.find((c) => c.cause === 'TARGET');
      if (tgt) worked.push(`${tgt.n} of ${n} trades (${tgt.sharePct.toFixed(0)}%) reached the target.`);
      if (feats[0] && Math.abs(feats[0].gap) >= 0.3 && feats[0].winners !== feats[0].losers) worked.push(`Winners had ${feats[0].gap > 0 ? 'higher' : 'lower'} ${feats[0].label} (median ${fmtF(feats[0].winners, feats[0].unit)} vs ${fmtF(feats[0].losers, feats[0].unit)} for losers; a winner beat a loser on it ${Math.round((feats[0].gap > 0 ? feats[0].auc : 1 - feats[0].auc) * 100)}% of the time). Small samples: a lead, not a rule.`);
      const top = causeList.find((c) => !['TARGET', 'GRADUATED', 'SMALL WIN'].includes(c.cause));
      if (top) {
        didnt.push(`Most common loss: ${top.cause} (${top.n} trades, ${top.sharePct.toFixed(0)}%, avg ${pct(top.avgPct)}).`);
        next.push({ 'NO FOLLOW-THROUGH': 'Selection problem: entries are on tokens whose buying stops right after the signal. Tighten entry filters (the Flow book tests inflow + buy size).',
          'GAVE BACK': 'Exit problem: trades go green then reverse. A closer target or a breakeven stop should help; compare against the Confirm book (+20% gross target).',
          'LATE ENTRY': 'Timing problem: price runs between signal and entry. Faster execution or the Confirm book’s wait-and-check approach.',
          DUMP: 'Holder risk: single large sells. Add holder-concentration and creator-hold filters.',
          STALLED: 'Activity dies after entry. A shorter max hold or an idle exit earlier.' }[top.cause] || 'Inspect individual losers with `why <id>`.');
      }
      if (slipMed != null && slipMed > 5) didnt.push(`Median entry ran ${pct(slipMed)} past the signal price before the fill.`);
      if (peakMed != null) (peakMed <= 2 ? didnt : worked).push(`Median best point per trade: ${pct(peakMed)} after costs${peakMed <= 2 ? ': the typical trade never got meaningfully green' : ''}.`);
    }
    const breakeven = (100 * S.stopPct) / ((S.tpMult - 1) * 100 + S.stopPct); // p*TP = (1-p)*STOP
    out.push({
      book: b, label: S.label, entry: S.entry, thesis: S.thesis, exits: { tpNetPct: (S.tpMult - 1) * 100, stopNetPct: S.stopPct, maxHoldMin: S.maxHoldMin, delaySec: S.delaySec },
      n, winRatePct: n ? (wins.length / n) * 100 : null, avgPct: m, ciLowPct: ci[0], ciHighPct: ci[1], pnlSol: R.reduce((a, r) => a + r.pnl_sol, 0), breakevenWinPct: breakeven,
      verdict: n < config.killRule.minTrades ? 'COLLECTING' : ci[0] > 0 ? 'WORKING' : ci[1] < 0 ? 'NOT WORKING' : 'UNPROVEN',
      causes: causeList, features: feats, skipped: { n: sk.length, reasons: topReasons(sk) }, medians: { peakPct: peakMed, entrySlipPct: slipMed, heldMin: heldMed }, worked, didnt, next,
    });
  }
  out.sort((a, b) => (b.avgPct ?? -1e9) - (a.avgPct ?? -1e9));
  return { days, generatedAt: Date.now(), strategies: out, costPct: (1 - COST) * 100, solUsd: market.solUsd };
}

export function timeline({ days = 14 } = {}) {
  const rows = Q.closed.all(config.paper.rules, Date.now() - days * 86400000);
  return { solUsd: market.solUsd, books: BOOKS.map((b) => ({ id: b, label: STRATEGIES[b].label })),
    trades: rows.map((r) => ({ id: r.id, book: r.book, symbol: r.symbol, t: r.exit_ts, entry: r.entry_ts, pnlPct: r.pnl_pct, pnlSol: r.pnl_sol, cause: r.cause, reason: r.exit_reason })) };
}

function topReasons(sk) {
  const m = {};
  for (const s of sk) { const k = (s.skip_reason || '?').replace(/-?\d+(\.\d+)?%/g, 'x%'); m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, n]) => ({ reason, n }));
}
function fmtF(v, unit) { if (v == null) return '–'; const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2; return `${v.toFixed(d)}${unit && unit !== '×' ? ` ${unit}` : unit}`; }
function solUsd(sol) { if (sol == null) return '–'; const v = market.solUsd ? sol * market.solUsd : null; if (v == null) return `${sol.toFixed(1)} SOL`; return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}k`; }
