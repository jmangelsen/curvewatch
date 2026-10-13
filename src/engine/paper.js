// Paper trader: the judge of whether the screener has an edge.
// Entry happens AFTER a human reaction delay at the real curve price at that moment, using exact
// bonding-curve math, the 1.25% fee each side, and extra slippage for same-second competition.
import { config } from '../config.js';
import { q } from '../db.js';
import { curveBuy, curveSell, round } from '../util.js';
import { logger } from '../log.js';
const log = logger('paper');
const P = config.paper;

const open = new Map(); // mint -> position
const pendingEntries = [];
export const paperEvents = [];

function valueOf(pos, token, tokens = pos.tokensLeft) {
  if (tokens <= 0) return 0;
  return curveSell(token.vsol, token.vtok, tokens, P.feePct) * (1 - P.extraSlippagePct / 100);
}

export function scheduleEntry(token, alertId) {
  if (!P.enabled || open.has(token.mint)) return;
  pendingEntries.push({ mint: token.mint, alertId, at: Date.now() + P.entryDelaySec * 1000, token });
}

export function restoreOpen(getToken) {
  // In-memory curve state is lost on restart, so open positions cannot be marked honestly.
  // They are voided (excluded from the kill rule) rather than guessed.
  for (const row of q.openPapers.all()) {
    if (getToken(row.mint)) { open.set(row.mint, rowToPos(row)); continue; }
    q.voidPaper.run(Date.now(), row.id);
    log.warn(`voided open paper trade ${row.id} (${row.symbol}) after restart`);
  }
}
const rowToPos = (r) => ({ id: r.id, alertId: r.alert_id, mint: r.mint, symbol: r.symbol, entryTs: r.entry_ts, entryMcap: r.entry_mcap, sizeSol: r.size_sol, tokens: r.tokens, tokensLeft: r.tokens_left, realized: r.realized_sol || 0, peakValue: r.peak_value || r.size_sol, tp1Done: (r.realized_sol || 0) > 0, events: JSON.parse(r.events || '[]') });

export function tick(getToken) {
  const t = Date.now();
  // Entries
  for (let i = pendingEntries.length - 1; i >= 0; i--) {
    const e = pendingEntries[i];
    if (e.at > t) continue;
    pendingEntries.splice(i, 1);
    const token = getToken(e.mint) || e.token;
    if (token.graduated) continue; // missed it: curve closed
    const tokens = curveBuy(token.vsol, token.vtok, P.sizeSol, P.feePct) * (1 - P.extraSlippagePct / 100);
    const pos = { alertId: e.alertId, mint: e.mint, symbol: token.symbol, entryTs: t, entryMcap: token.mcap, sizeSol: P.sizeSol, tokens, tokensLeft: tokens, realized: 0, peakValue: P.sizeSol, tp1Done: false, events: [{ t, type: 'entry', mcap: round(token.mcap, 1) }] };
    pos.id = Number(q.insertPaper.run({ alertId: pos.alertId, mint: pos.mint, symbol: pos.symbol, entryTs: t, entryMcap: pos.entryMcap, sizeSol: pos.sizeSol, tokens, events: JSON.stringify(pos.events) }).lastInsertRowid);
    open.set(e.mint, pos);
    paperEvents.push({ type: 'entry', pos: pub(pos, token) });
    log.info(`ENTRY ${pos.symbol} @ ${round(pos.entryMcap, 1)} SOL mcap`);
  }
  // Exits
  for (const [mint, pos] of open) {
    const token = getToken(mint);
    if (!token) { q.voidPaper.run(t, pos.id); open.delete(mint); continue; }
    const value = valueOf(pos, token);
    const total = pos.realized + value;
    if (total > pos.peakValue) pos.peakValue = total;
    const mult = total / pos.sizeSol;
    const heldMin = (t - pos.entryTs) / 60000;
    if (token.graduated) { closePos(pos, token, 'graduated (sold at curve close)'); continue; }
    if (!pos.tp1Done && mult >= P.tp1Multiple) {
      const sellTok = pos.tokensLeft * P.tp1Fraction;
      const got = valueOf(pos, token, sellTok);
      pos.tokensLeft -= sellTok; pos.realized += got; pos.tp1Done = true;
      pos.events.push({ t, type: 'tp1', sol: round(got, 4), mcap: round(token.mcap, 1) });
      persist(pos);
      continue;
    }
    if (mult <= 1 - P.stopPct / 100) { closePos(pos, token, `stop -${P.stopPct}%`); continue; }
    if (pos.tp1Done && total <= pos.peakValue * (1 - P.trailPct / 100)) { closePos(pos, token, `trailing stop ${P.trailPct}%`); continue; }
    if (heldMin >= P.maxHoldMin) { closePos(pos, token, 'max hold'); continue; }
    if ((t - token.lastTradeAt) / 60000 >= P.idleExitMin) { closePos(pos, token, 'idle curve'); continue; }
  }
}

function persist(pos, extra = {}) {
  q.updatePaper.run({ id: pos.id, status: extra.status || 'open', tokensLeft: pos.tokensLeft, realized: pos.realized, peakValue: pos.peakValue,
    exitTs: extra.exitTs || null, exitReason: extra.exitReason || null, pnlSol: extra.pnlSol ?? null, pnlPct: extra.pnlPct ?? null, events: JSON.stringify(pos.events) });
}

function closePos(pos, token, reason) {
  const t = Date.now();
  const got = token ? valueOf(pos, token) : 0;
  pos.realized += got; pos.tokensLeft = 0;
  const pnl = pos.realized - pos.sizeSol;
  pos.events.push({ t, type: 'exit', reason, sol: round(got, 4), mcap: token ? round(token.mcap, 1) : null });
  persist(pos, { status: 'closed', exitTs: t, exitReason: reason, pnlSol: pnl, pnlPct: (pnl / pos.sizeSol) * 100 });
  open.delete(pos.mint);
  paperEvents.push({ type: 'exit', pos: { ...pub(pos, token), pnlSol: pnl, pnlPct: (pnl / pos.sizeSol) * 100, reason } });
  log.info(`EXIT ${pos.symbol} ${reason} pnl ${round(pnl, 4)} SOL (${round((pnl / pos.sizeSol) * 100, 1)}%)`);
}

function pub(pos, token) {
  const value = token ? valueOf(pos, token) : 0;
  return { id: pos.id, mint: pos.mint, symbol: pos.symbol, entryTs: pos.entryTs, entryMcap: pos.entryMcap, sizeSol: pos.sizeSol, realized: pos.realized,
    markSol: pos.realized + value, markPct: ((pos.realized + value) / pos.sizeSol - 1) * 100, mcap: token?.mcap ?? null, tp1Done: pos.tp1Done };
}
export const openPositions = (getToken) => [...open.values()].map((p) => pub(p, getToken(p.mint)));
export const isOpen = (mint) => open.has(mint) || pendingEntries.some((e) => e.mint === mint);

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
export const killRule = () => killStatsFrom(q.closedPapersAsc.all());
