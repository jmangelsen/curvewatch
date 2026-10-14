// Paper trader and strategy lab: the judge of whether any strategy has an edge.
//
// Every book is a strategy with its own entry rule and exits. All books share the same honest cost model:
// entry after a delay at the real curve price, exact bonding-curve math, the curve fee each side, plus extra
// slippage for same-second competition. A position therefore starts around -5% net.
//
// Every trade records WHY it happened and WHY it ended the way it did: the signal price, features at entry,
// best and worst moments (MFE/MAE), the largest single-trade drop, and a cause label assigned at exit.
import { config } from '../config.js';
import { db, q } from '../db.js';
import { curveBuy, curveSell, round } from '../util.js';
import { logger } from '../log.js';
import { gate, marketTag } from './marketgate.js';
const log = logger('paper');
const P = config.paper;
const SC = config.strategies;

// Round-trip cost factor: net multiple = gross multiple x COST
export const COST = (1 - P.feePct / 100) ** 2 * (1 - P.extraSlippagePct / 100);

// ---- strategy registry ----
export const STRATEGIES = {
  main: { id: 'main', label: 'Main', entry: `score ≥ ${config.scoring.alertScore}`, delaySec: P.entryDelaySec, tpMult: P.tp1Multiple, tpFraction: P.tp1Fraction, stopPct: P.stopPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin,
    thesis: 'The full score (flow, buyers, holder spread, creator history) is high enough to alert.' },
  band: { id: 'band', label: 'Band', entry: `score first lands in ${config.band.lo}–${config.band.hi}`, delaySec: P.entryDelaySec, tpMult: P.tp1Multiple, tpFraction: P.tp1Fraction, stopPct: P.stopPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin,
    thesis: 'Enter before the score peaks; 72+ looked late in labeled snapshots.' },
  flow: { id: 'flow', label: 'Flow', entry: `score ≥ ${SC.flow.minScore}, 60s net inflow ≥ ${SC.flow.minFlow60Sol} SOL, median buy ≥ ${SC.flow.minMedianBuySol} SOL`, delaySec: P.entryDelaySec,
    tpMult: P.tp1Multiple, tpFraction: 1, stopPct: P.stopPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin,
    thesis: 'Real money arriving (inflow and buy size), not bot dust. Only two features that held up in both halves of the data.' },
  confirm: { id: 'confirm', label: 'Confirm', entry: `main or band signal, wait ${SC.confirm.waitSec}s, enter only if price ≥ signal price${SC.confirm.minRetPct ? ` +${SC.confirm.minRetPct}%` : ''}`,
    delaySec: SC.confirm.waitSec, tpMult: (1 + SC.confirm.tpGrossPct / 100) * COST, tpFraction: 1, stopPct: SC.confirm.stopNetPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin,
    requireMinRet: SC.confirm.minRetPct / 100,
    thesis: `Let the first-minute dump happen, buy only what survives, take a quicker +${SC.confirm.tpGrossPct}% (gross).` },
};
export const BOOKS = Object.keys(STRATEGIES).filter((b) => b === 'main' || SC[b]?.enabled !== false);

// ---- schema additions ----
for (const col of ['signal_mcap REAL', 'signal_ts INTEGER', 'features TEXT', 'trough_value REAL', 'peak_ts INTEGER', 'max_drop_pct REAL', 'cause TEXT', 'cause_detail TEXT', 'tp_mult REAL', 'stop_pct REAL', 'entry_slip_pct REAL', 'skip_reason TEXT']) {
  try { db.exec(`ALTER TABLE paper_trades ADD COLUMN ${col}`); } catch { /* exists */ }
}
const Qx = {
  enrich: db.prepare(`UPDATE paper_trades SET signal_mcap=@signalMcap, signal_ts=@signalTs, features=@features, tp_mult=@tpMult, stop_pct=@stopPct, entry_slip_pct=@slip WHERE id=@id`),
  track: db.prepare(`UPDATE paper_trades SET trough_value=@trough, peak_ts=@peakTs, max_drop_pct=@maxDrop WHERE id=@id`),
  cause: db.prepare(`UPDATE paper_trades SET cause=@cause, cause_detail=@detail, trough_value=@trough, peak_ts=@peakTs, max_drop_pct=@maxDrop WHERE id=@id`),
  skip: db.prepare(`INSERT INTO paper_trades (alert_id,mint,symbol,status,entry_ts,entry_mcap,size_sol,tokens,tokens_left,peak_value,events,book,rules,gated,score,market,signal_mcap,signal_ts,features,skip_reason,entry_slip_pct)
    VALUES (@alertId,@mint,@symbol,'skipped',@ts,@mcap,0,0,0,0,'[]',@book,@rules,0,@score,@market,@signalMcap,@signalTs,@features,@reason,@slip)`),
};

const open = new Map(); // `${book}:${mint}` -> position
const key = (book, mint) => `${book}:${mint}`;
const pendingEntries = [];
export const paperEvents = [];

// Features worth keeping per trade (explains entries without storing the whole vector)
const KEEP = ['ageSec', 'mcapSol', 'progressPct', 'netSol', 'netSolPerMin', 'flow60Sol', 'uniqueBuyers', 'buyersPerMin', 'buySellRatio', 'medianBuySol', 'tinyBuyShare',
  'top10Pct', 'bundlePct', 'creatorHoldPct', 'creatorSoldPct', 'drawdownPct', 'smartBuyers', 'hasTwitter', 'initialBuySol'];
const pickFeatures = (f) => { if (!f) return null; const o = {}; for (const k of KEEP) if (f[k] != null) o[k] = typeof f[k] === 'number' ? round(f[k], 3) : f[k]; return o; };

function valueOf(pos, token, tokens = pos.tokensLeft) {
  if (tokens <= 0) return 0;
  return curveSell(token.vsol, token.vtok, tokens, P.feePct) * (1 - P.extraSlippagePct / 100);
}

/** Queue a paper entry for one book. opts: { book, score, features } */
export function scheduleEntry(token, alertId, { book = 'main', score = null, features = null } = {}) {
  const S = STRATEGIES[book];
  if (!P.enabled || !S || !BOOKS.includes(book) || open.has(key(book, token.mint)) || pendingEntries.some((e) => e.book === book && e.mint === token.mint)) return;
  pendingEntries.push({ mint: token.mint, alertId, book, score, features: pickFeatures(features || token.lastFeatures), signalMcap: token.mcap, signalTs: Date.now(), at: Date.now() + S.delaySec * 1000, token });
}

export function restoreOpen(getToken) {
  // In-memory curve state is lost on restart, so open positions cannot be marked honestly.
  for (const row of q.openPapers.all()) {
    if (getToken(row.mint)) { open.set(key(row.book || 'main', row.mint), rowToPos(row)); continue; }
    q.voidPaper.run(Date.now(), row.id);
    log.warn(`voided open paper trade ${row.id} (${row.symbol}) after restart`);
  }
}
const rowToPos = (r) => {
  const S = STRATEGIES[r.book || 'main'] || STRATEGIES.main;
  return { id: r.id, book: r.book || 'main', alertId: r.alert_id, mint: r.mint, symbol: r.symbol, entryTs: r.entry_ts, entryMcap: r.entry_mcap, sizeSol: r.size_sol, tokens: r.tokens, tokensLeft: r.tokens_left,
    realized: r.realized_sol || 0, peakValue: r.peak_value || r.size_sol, troughValue: r.trough_value || r.size_sol, peakTs: r.peak_ts || r.entry_ts, maxDrop: r.max_drop_pct || 0, lastMark: null,
    tp1Done: (r.realized_sol || 0) > 0, signalMcap: r.signal_mcap, tpMult: r.tp_mult || S.tpMult, stopPct: r.stop_pct || S.stopPct, S, events: JSON.parse(r.events || '[]') };
};

export function tick(getToken) {
  const t = Date.now();
  // ---- entries ----
  for (let i = pendingEntries.length - 1; i >= 0; i--) {
    const e = pendingEntries[i];
    if (e.at > t) continue;
    pendingEntries.splice(i, 1);
    const S = STRATEGIES[e.book];
    const token = getToken(e.mint) || e.token;
    const slip = e.signalMcap ? (token.mcap / e.signalMcap - 1) * 100 : null;
    const skip = (reason) => {
      Qx.skip.run({ alertId: e.alertId, mint: e.mint, symbol: token.symbol, ts: t, mcap: token.mcap, book: e.book, rules: P.rules, score: e.score, market: JSON.stringify(marketTag()),
        signalMcap: e.signalMcap, signalTs: e.signalTs, features: JSON.stringify(e.features), reason, slip });
      paperEvents.push({ type: 'skip', pos: { book: e.book, mint: e.mint, symbol: token.symbol, reason, slipPct: slip } });
    };
    if (token.graduated) { skip('curve closed before entry'); continue; }
    if (S.requireMinRet != null && token.mcap < e.signalMcap * (1 + S.requireMinRet)) { skip(`price ${round(slip, 1)}% vs signal after ${S.delaySec}s (needs ≥ ${round(S.requireMinRet * 100, 0)}%)`); continue; }
    const tokens = curveBuy(token.vsol, token.vtok, P.sizeSol, P.feePct) * (1 - P.extraSlippagePct / 100);
    const gated = gate.enforcing ? 1 : 0;
    const pos = { book: e.book, S, alertId: e.alertId, mint: e.mint, symbol: token.symbol, entryTs: t, entryMcap: token.mcap, sizeSol: P.sizeSol, tokens, tokensLeft: tokens, realized: 0,
      peakValue: P.sizeSol, troughValue: P.sizeSol, peakTs: t, maxDrop: 0, lastMark: null, tp1Done: false, gated, signalMcap: e.signalMcap, tpMult: S.tpMult, stopPct: S.stopPct,
      events: [{ t, type: 'entry', mcap: round(token.mcap, 1) }] };
    pos.id = Number(q.insertPaper.run({ alertId: pos.alertId, mint: pos.mint, symbol: pos.symbol, entryTs: t, entryMcap: pos.entryMcap, sizeSol: pos.sizeSol, tokens, events: JSON.stringify(pos.events),
      book: e.book, rules: P.rules, gated, score: e.score, market: JSON.stringify(marketTag()) }).lastInsertRowid);
    Qx.enrich.run({ id: pos.id, signalMcap: e.signalMcap, signalTs: e.signalTs, features: JSON.stringify(e.features), tpMult: S.tpMult, stopPct: S.stopPct, slip });
    open.set(key(e.book, e.mint), pos);
    paperEvents.push({ type: 'entry', pos: pub(pos, token) });
    log.info(`ENTRY [${pos.book}] ${pos.symbol} @ ${round(pos.entryMcap, 1)} SOL mcap (signal ${round(e.signalMcap, 1)}, ${slip >= 0 ? '+' : ''}${round(slip, 1)}%)`);
  }
  // ---- exits ----
  for (const [k, pos] of open) {
    const token = getToken(pos.mint);
    if (!token) { q.voidPaper.run(t, pos.id); open.delete(k); continue; }
    const S = pos.S || STRATEGIES[pos.book] || STRATEGIES.main;
    const value = valueOf(pos, token);
    const total = pos.realized + value;
    if (pos.lastMark != null && pos.lastMark > 0) pos.maxDrop = Math.max(pos.maxDrop, (1 - total / pos.lastMark) * 100);
    pos.lastMark = total;
    if (total > pos.peakValue) { pos.peakValue = total; pos.peakTs = t; }
    if (total < pos.troughValue) pos.troughValue = total;
    const mult = total / pos.sizeSol;
    const heldMin = (t - pos.entryTs) / 60000;
    if (token.graduated) { closePos(pos, token, 'graduated (sold at curve close)'); continue; }
    if (!pos.tp1Done && mult >= pos.tpMult) {
      const frac = S.tpFraction ?? P.tp1Fraction;
      const sellTok = pos.tokensLeft * frac;
      const got = valueOf(pos, token, sellTok);
      pos.tokensLeft -= sellTok; pos.realized += got; pos.tp1Done = true;
      pos.events.push({ t, type: 'tp1', sol: round(got, 4), mcap: round(token.mcap, 1) });
      if (pos.tokensLeft <= 1e-9) { closePos(pos, null, `take profit +${round((pos.tpMult - 1) * 100, 0)}%`); continue; }
      persist(pos);
      continue;
    }
    if (mult <= 1 - pos.stopPct / 100) { closePos(pos, token, `stop -${pos.stopPct}%`); continue; }
    if (pos.tp1Done && total <= pos.peakValue * (1 - S.trailPct / 100)) { closePos(pos, token, `trailing stop ${S.trailPct}%`); continue; }
    if (heldMin >= S.maxHoldMin) { closePos(pos, token, 'max hold'); continue; }
    if ((t - token.lastTradeAt) / 60000 >= P.idleExitMin) { closePos(pos, token, 'idle curve'); continue; }
  }
  // persist MFE/MAE every ~10 s so restarts and the terminal see them
  if (t - (tick._lastTrack || 0) > 10000) {
    tick._lastTrack = t;
    for (const pos of open.values()) Qx.track.run({ id: pos.id, trough: pos.troughValue, peakTs: pos.peakTs, maxDrop: pos.maxDrop });
  }
}

function persist(pos, extra = {}) {
  q.updatePaper.run({ id: pos.id, status: extra.status || 'open', tokensLeft: pos.tokensLeft, realized: pos.realized, peakValue: pos.peakValue,
    exitTs: extra.exitTs || null, exitReason: extra.exitReason || null, pnlSol: extra.pnlSol ?? null, pnlPct: extra.pnlPct ?? null, events: JSON.stringify(pos.events) });
}

/** Why did this trade end the way it did? Deterministic, from the trade's own path. */
export function classify({ pnlPct, reason, peakNet, troughNet, maxDropPct, slipPct, heldMin, peakAfterMin }) {
  const costNote = `round-trip costs ≈ ${round((1 - COST) * 100, 1)}%`;
  if (pnlPct > 0) {
    if (/take profit/.test(reason)) return { cause: 'TARGET', detail: `Reached the target in ${round(heldMin, 1)} min; worst point on the way was ${signedPct(troughNet)}.` };
    if (/graduated/.test(reason)) return { cause: 'GRADUATED', detail: `Curve filled and graduated; sold at the close for ${signedPct(pnlPct / 100)}.` };
    return { cause: 'SMALL WIN', detail: `Closed green (${signedPct(pnlPct / 100)}) by ${reason}, peak was ${signedPct(peakNet)}.` };
  }
  if (maxDropPct >= 25) return { cause: 'DUMP', detail: `A single sell knocked the position down ${round(maxDropPct, 0)}% in one step (large holder or dev exit). Peak before it: ${signedPct(peakNet)}.` };
  if (peakNet >= 0.08) return { cause: 'GAVE BACK', detail: `Was up ${signedPct(peakNet)} net about ${round(peakAfterMin, 1)} min in, then reversed to ${reason}. The target was further than this move went.` };
  if (slipPct != null && slipPct >= 10 && peakNet < 0) return { cause: 'LATE ENTRY', detail: `Price ran ${signedPct(slipPct / 100)} between signal and entry; it never went green after that (${costNote}).` };
  if (/idle|max hold/.test(reason)) return { cause: 'STALLED', detail: `Trading activity died (${reason}); best point was ${signedPct(peakNet)}.` };
  return { cause: 'NO FOLLOW-THROUGH', detail: `Never went green after costs (best ${signedPct(peakNet)}, ${costNote}). Buying stopped right after the signal: a selection problem, not an exit problem.` };
}
const signedPct = (x) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${round(x * 100, 1)}%`);

function closePos(pos, token, reason) {
  const t = Date.now();
  const got = token ? valueOf(pos, token) : 0;
  pos.realized += got; pos.tokensLeft = 0;
  const pnl = pos.realized - pos.sizeSol;
  const pnlPct = (pnl / pos.sizeSol) * 100;
  if (pos.realized < pos.troughValue) pos.troughValue = pos.realized;
  pos.events.push({ t, type: 'exit', reason, sol: round(got, 4), mcap: token ? round(token.mcap, 1) : null });
  persist(pos, { status: 'closed', exitTs: t, exitReason: reason, pnlSol: pnl, pnlPct });
  const c = classify({ pnlPct, reason, peakNet: pos.peakValue / pos.sizeSol - 1, troughNet: pos.troughValue / pos.sizeSol - 1, maxDropPct: pos.maxDrop,
    slipPct: pos.signalMcap ? (pos.entryMcap / pos.signalMcap - 1) * 100 : null, heldMin: (t - pos.entryTs) / 60000, peakAfterMin: (pos.peakTs - pos.entryTs) / 60000 });
  Qx.cause.run({ id: pos.id, cause: c.cause, detail: c.detail, trough: pos.troughValue, peakTs: pos.peakTs, maxDrop: pos.maxDrop });
  open.delete(key(pos.book, pos.mint));
  paperEvents.push({ type: 'exit', pos: { ...pub(pos, token), pnlSol: pnl, pnlPct, reason, cause: c.cause, causeDetail: c.detail } });
  log.info(`EXIT [${pos.book}] ${pos.symbol} ${reason} pnl ${round(pnl, 4)} SOL (${round(pnlPct, 1)}%) · ${c.cause}`);
}

function pub(pos, token) {
  const value = token ? valueOf(pos, token) : 0;
  return { id: pos.id, book: pos.book, gated: pos.gated || 0, mint: pos.mint, symbol: pos.symbol, entryTs: pos.entryTs, entryMcap: pos.entryMcap, sizeSol: pos.sizeSol, realized: pos.realized,
    markSol: pos.realized + value, markPct: ((pos.realized + value) / pos.sizeSol - 1) * 100, mcap: token?.mcap ?? null, tp1Done: pos.tp1Done,
    peakPct: (pos.peakValue / pos.sizeSol - 1) * 100, troughPct: (pos.troughValue / pos.sizeSol - 1) * 100, signalMcap: pos.signalMcap };
}
export const openPositions = (getToken) => [...open.values()].map((p) => pub(p, getToken(p.mint)));
export const isOpen = (mint) => BOOKS.some((b) => open.has(key(b, mint))) || pendingEntries.some((e) => e.mint === mint);

/** Kill rule: is average return per trade (after fees, delay, slippage) reliably above zero? */
export function killStatsFrom(rows) {
  const K = config.killRule;
  const w = rows.slice(-K.windowTrades).map((r) => r.pnl_pct / 100);
  const n = w.length;
  const mean = n ? w.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const se = n > 1 ? sd / Math.sqrt(n) : 0;
  const lo = mean - 1.96 * se, hi = mean + 1.96 * se;
  const wins = w.filter((x) => x > 0), losses = w.filter((x) => x <= 0);
  const pf = losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0) || 1e-9) : wins.length ? Infinity : 0;
  let status = 'COLLECTING';
  if (n >= K.minTrades) status = lo > 0 ? 'PASS' : mean > 0 ? 'MARGINAL' : 'FAIL';
  let eq = 0; const equity = rows.map((r) => ({ t: r.exit_ts, eq: (eq += r.pnl_sol) }));
  return {
    status, n, needed: K.minTrades, expectancyPct: mean * 100, ciLowPct: lo * 100, ciHighPct: hi * 100,
    winRatePct: n ? (wins.length / n) * 100 : 0, profitFactor: Number.isFinite(pf) ? pf : null,
    totalPnlSol: rows.reduce((a, r) => a + r.pnl_sol, 0), allTrades: rows.length, equity: equity.slice(-500),
    bestPct: n ? Math.max(...w) * 100 : 0, worstPct: n ? Math.min(...w) * 100 : 0,
  };
}
/** Kill rule for one book under the current exit rules. Gated trades (market pause enforced) are excluded. */
const closedCurrent = () => q.closedPapersAsc.all().filter((r) => (r.rules || 'v1') === P.rules);
export const killRule = (book = 'main') => killStatsFrom(closedCurrent().filter((r) => (r.book || 'main') === book && !r.gated));
const brief = (k) => ({ status: k.status, n: k.n, needed: k.needed, expectancyPct: k.expectancyPct, ciLowPct: k.ciLowPct, ciHighPct: k.ciHighPct, winRatePct: k.winRatePct, profitFactor: k.profitFactor, totalPnlSol: k.totalPnlSol });
/** Side-by-side comparison for the Performance tab */
export function books() {
  const cur = closedCurrent();
  const byState = (rows, st) => rows.filter((r) => { try { return JSON.parse(r.market || '{}').state === st; } catch { return false; } });
  const out = {};
  for (const b of BOOKS) {
    const rows = cur.filter((r) => (r.book || 'main') === b);
    const S = STRATEGIES[b];
    out[b] = { kill: killRule(b), open: [...open.values()].filter((p) => p.book === b).length, label: S.label, entry: S.entry,
      byMarket: { WARM: brief(killStatsFrom(byState(rows, 'WARM'))), COLD: brief(killStatsFrom(byState(rows, 'COLD'))), UNKNOWN: brief(killStatsFrom(byState(rows, 'UNKNOWN'))) } };
  }
  const v1 = q.closedPapersAsc.all().filter((r) => (r.rules || 'v1') === 'v1');
  return { rules: P.rules, order: BOOKS, books: out, legacyV1: brief(killStatsFrom(v1)) };
}

/** One-time backfill: label older closed trades (recorded before cause tracking) from the stored trade tape. */
export function backfillCauses() {
  const rows = db.prepare(`SELECT p.*, a.mcap a_mcap, a.ts a_ts, a.features a_features FROM paper_trades p LEFT JOIN alerts a ON a.id = p.alert_id WHERE p.status = 'closed' AND p.cause IS NULL`).all();
  if (!rows.length) return 0;
  const path = db.prepare(`SELECT vsol / vtok * 1e9 AS mc FROM trades WHERE mint = ? AND ts BETWEEN ? AND ? ORDER BY ts, slot`);
  const upd = db.prepare(`UPDATE paper_trades SET cause=@cause, cause_detail=@detail, trough_value=COALESCE(trough_value,@trough), max_drop_pct=COALESCE(max_drop_pct,@maxDrop),
    signal_mcap=COALESCE(signal_mcap,@sm), signal_ts=COALESCE(signal_ts,@st), entry_slip_pct=COALESCE(entry_slip_pct,@slip), features=COALESCE(features,@f) WHERE id=@id`);
  const tx = db.transaction(() => {
    for (const r of rows) {
      const mcs = path.all(r.mint, r.entry_ts, r.exit_ts).map((x) => x.mc);
      let trough = 1, maxDrop = 0, prev = null;
      for (const mc of mcs) { const m = (mc / r.entry_mcap) * COST; trough = Math.min(trough, m); if (prev) maxDrop = Math.max(maxDrop, (1 - mc / prev) * 100); prev = mc; }
      const sm = r.signal_mcap ?? r.a_mcap ?? null, slip = sm ? (r.entry_mcap / sm - 1) * 100 : null;
      const c = classify({ pnlPct: r.pnl_pct, reason: r.exit_reason || '', peakNet: (r.peak_value || r.size_sol) / r.size_sol - 1, troughNet: Math.min(trough, 1 + r.pnl_pct / 100) - 1, maxDropPct: maxDrop,
        slipPct: slip, heldMin: (r.exit_ts - r.entry_ts) / 60000, peakAfterMin: (r.exit_ts - r.entry_ts) / 120000 });
      let f = null; try { f = r.a_features ? JSON.stringify(pickFeatures(JSON.parse(r.a_features))) : null; } catch { /* ignore */ }
      upd.run({ id: r.id, cause: c.cause, detail: c.detail + ' (labeled after the fact)', trough: r.size_sol * Math.min(trough, 1 + r.pnl_pct / 100), maxDrop, sm, st: r.a_ts ?? null, slip, f });
    }
  });
  tx();
  return rows.length;
}
