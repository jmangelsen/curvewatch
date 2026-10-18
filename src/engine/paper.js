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
import { verdictFor } from '../verdicts.js';
import { CFG } from '../version.js';
import { countBlocked } from './rejects.js';
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
  random: { id: 'random', label: 'Random', entry: `control: at each Main/Band/Flow signal, a random other eligible token of similar age (±${SC.random.ageTolPct}%) and mcap (±${SC.random.mcapTolPct}%)`,
    delaySec: P.entryDelaySec, tpMult: P.tp1Multiple, tpFraction: 1, stopPct: P.stopPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin, control: true,
    thesis: 'Not a strategy: the baseline. If a book cannot beat random picks from the same moments, its signal adds nothing.' },
  confirm: { id: 'confirm', label: 'Confirm', entry: `main or band signal, wait ${SC.confirm.waitSec}s, enter only if price ≥ signal price${SC.confirm.minRetPct ? ` +${SC.confirm.minRetPct}%` : ''}`,
    delaySec: SC.confirm.waitSec, tpMult: (1 + SC.confirm.tpGrossPct / 100) * COST, tpFraction: 1, stopPct: SC.confirm.stopNetPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin,
    requireMinRet: SC.confirm.minRetPct / 100,
    thesis: `Let the first-minute dump happen, buy only what survives, take a quicker +${SC.confirm.tpGrossPct}% (gross).` },
  // ---- candidates, registered 2026-10-16 ----
  clean: { id: 'clean', label: 'Clean strong', entry: `strong curve signal and creator with 0 rugs who has not sold, bundle < ${SC.clean.maxBundlePct}%, top-10 < ${SC.clean.maxTop10Pct}%`,
    delaySec: P.entryDelaySec, tpMult: P.tp1Multiple, tpFraction: 1, stopPct: P.stopPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin, candidate: true,
    thesis: 'Strong signals are the best-calibrated entries this machine has; the filters remove the launches where the exit is a rug or a bundle unwind rather than a market.' },
  hold120: { id: 'hold120', label: 'Hold 120s', entry: `main or band signal before ${SC.hold120.checkpointSec}s of age; enter at the ${SC.hold120.checkpointSec}s checkpoint only if price ≥ signal price`,
    delaySec: 0, tpMult: P.tp1Multiple, tpFraction: 1, stopPct: P.stopPct, trailPct: P.trailPct, maxHoldMin: P.maxHoldMin, requireMinRet: 0, candidate: true,
    thesis: 'The alert fires on fading momentum; waiting for the fixed 2-minute checkpoint and requiring the price to have held removes the entries that were already rolling over.' },
  timed: { id: 'timed', label: 'Timed 1h', entry: `main signal; no stop and no target, sell at ${SC.timed.holdMin} min (or curve close / idle)`,
    delaySec: P.entryDelaySec, tpMult: Infinity, tpFraction: 1, stopPct: 100, trailPct: 100, maxHoldMin: SC.timed.holdMin, candidate: true,
    thesis: 'About half of all trades hit the stop before the target. This variant rides the whole distribution for an hour; the graduates sweep found timed exits least bad, which is untested on the curve until now.' },
};
export const BOOKS = Object.keys(STRATEGIES).filter((b) => b === 'main' || SC[b]?.enabled !== false);

// ---- schema additions ----
for (const col of ['signal_mcap REAL', 'signal_ts INTEGER', 'features TEXT', 'trough_value REAL', 'peak_ts INTEGER', 'max_drop_pct REAL', 'cause TEXT', 'cause_detail TEXT', 'tp_mult REAL', 'stop_pct REAL', 'entry_slip_pct REAL', 'skip_reason TEXT', 'cfg TEXT', 'gap INTEGER', 'restored INTEGER', 'fill_n INTEGER', 'fill_real_pct REAL', 'exit_fill_n INTEGER', 'exit_real_pct REAL', 'trigger_pct REAL']) {
  try { db.exec(`ALTER TABLE paper_trades ADD COLUMN ${col}`); } catch { /* exists */ }
}
const Qx = {
  enrich: db.prepare(`UPDATE paper_trades SET signal_mcap=@signalMcap, signal_ts=@signalTs, features=@features, tp_mult=@tpMult, stop_pct=@stopPct, entry_slip_pct=@slip, cfg=@cfg WHERE id=@id`),
  gap: db.prepare(`UPDATE paper_trades SET gap=1 WHERE id=?`),
  restored: db.prepare(`UPDATE paper_trades SET restored=1, gap=COALESCE(gap,@gap) WHERE id=@id`),
  trigger: db.prepare(`UPDATE paper_trades SET trigger_pct=? WHERE id=?`),
  lastTrade: db.prepare(`SELECT ts, vsol, vtok FROM trades WHERE mint=? ORDER BY ts DESC, slot DESC LIMIT 1`),
  track: db.prepare(`UPDATE paper_trades SET trough_value=@trough, peak_ts=@peakTs, max_drop_pct=@maxDrop WHERE id=@id`),
  cause: db.prepare(`UPDATE paper_trades SET cause=@cause, cause_detail=@detail, trough_value=@trough, peak_ts=@peakTs, max_drop_pct=@maxDrop WHERE id=@id`),
  skip: db.prepare(`INSERT INTO paper_trades (alert_id,mint,symbol,status,entry_ts,entry_mcap,size_sol,tokens,tokens_left,peak_value,events,book,rules,gated,score,market,signal_mcap,signal_ts,features,skip_reason,entry_slip_pct,cfg)
    VALUES (@alertId,@mint,@symbol,'skipped',@ts,@mcap,0,0,0,0,'[]',@book,@rules,0,@score,@market,@signalMcap,@signalTs,@features,@reason,@slip,@cfg)`),
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
export function scheduleEntry(token, alertId, { book = 'main', score = null, features = null, delaySec = null } = {}) {
  const S = STRATEGIES[book];
  if (!P.enabled || !S || !BOOKS.includes(book) || open.has(key(book, token.mint)) || pendingEntries.some((e) => e.book === book && e.mint === token.mint)) return;
  pendingEntries.push({ mint: token.mint, alertId, book, score, features: pickFeatures(features || token.lastFeatures), signalMcap: token.mcap, signalTs: Date.now(), at: Date.now() + (delaySec ?? S.delaySec) * 1000, token });
}

// Restored positions whose token is no longer in the engine's memory (process restart): a minimal curve mirror,
// rebuilt from the last recorded trade and kept current from the live trade stream.
const ghosts = new Map();
class Ghost {
  constructor(mint, symbol, row) { this.mint = mint; this.symbol = symbol; this.vsol = row.vsol; this.vtok = row.vtok; this.lastTradeAt = row.ts; this.graduated = false; this.ghost = true; }
  get mcap() { return (this.vsol / this.vtok) * 1e9; }
}
let getEngineToken = () => null;
const tok = (mint) => getEngineToken(mint) || ghosts.get(mint);
/** Feed a trade for a mint the engine no longer tracks. Returns true if a restored position consumed it. */
export function ghostTrade(ev) {
  const g = ghosts.get(ev.mint); if (!g) return false;
  if (ev.vsol > 0 && ev.vtok > 0) { g.vsol = ev.vsol; g.vtok = ev.vtok; }
  g.lastTradeAt = Date.now();
  db.prepare(`INSERT INTO trades (mint,ts,slot,sig,wallet,is_buy,sol,tok,vsol,vtok) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(ev.mint, ev.recvAt || Date.now(), ev.slot, ev.sig, ev.wallet, ev.isBuy ? 1 : 0, ev.sol, ev.tok, ev.vsol, ev.vtok);
  onTrade(ev.mint);
  return true;
}
export const ghostGraduate = (mint) => { const g = ghosts.get(mint); if (g) { g.graduated = true; onTrade(mint); } };

/**
 * Restore open positions after a restart instead of voiding them. The position keeps marking from the last recorded
 * curve state. If the process was down longer than health.restoreMaxDownSec, trades in the gap were missed, so the
 * position is flagged gap=1 (finishes normally, shown in the terminal, excluded from stats).
 */
export function restoreOpen(getToken, { downSec = null } = {}) {
  getEngineToken = getToken;
  const flagged = downSec == null || downSec > config.health.restoreMaxDownSec ? 1 : 0;
  let n = 0, v = 0;
  for (const row of q.openPapers.all()) {
    let t = getToken(row.mint);
    if (!t) {
      const last = Qx.lastTrade.get(row.mint);
      if (!last || !(last.vsol > 0)) { q.voidPaper.run(Date.now(), row.id); v++; log.warn(`voided open paper trade ${row.id} (${row.symbol}): no recorded curve state`); continue; }
      t = new Ghost(row.mint, row.symbol, last); ghosts.set(row.mint, t);
    }
    const pos = rowToPos(row); pos.gap = flagged; open.set(key(pos.book, row.mint), pos);
    Qx.restored.run({ id: row.id, gap: flagged || null }); n++;
  }
  if (n || v) log.info(`restored ${n} open paper trades${flagged && n ? ` (flagged: down ${downSec == null ? '?' : Math.round(downSec)}s)` : ''}, voided ${v}`);
}

/** A data gap started: every open position's path is now incomplete. */
export function markGap() {
  let n = 0;
  for (const pos of open.values()) if (!pos.gap) { pos.gap = 1; Qx.gap.run(pos.id); n++; }
  return n;
}
const rowToPos = (r) => {
  const S = STRATEGIES[r.book || 'main'] || STRATEGIES.main;
  return { id: r.id, book: r.book || 'main', alertId: r.alert_id, mint: r.mint, symbol: r.symbol, entryTs: r.entry_ts, entryMcap: r.entry_mcap, sizeSol: r.size_sol, tokens: r.tokens, tokensLeft: r.tokens_left,
    realized: r.realized_sol || 0, peakValue: r.peak_value || r.size_sol, troughValue: r.trough_value || r.size_sol, peakTs: r.peak_ts || r.entry_ts, maxDrop: r.max_drop_pct || 0, lastMark: null,
    tp1Done: (r.realized_sol || 0) > 0, signalMcap: r.signal_mcap, gap: r.gap || 0, tpMult: r.tp_mult || S.tpMult, stopPct: r.stop_pct || S.stopPct, S, events: JSON.parse(r.events || '[]') };
};

export function tick(getToken) {
  if (getToken) getEngineToken = getToken;
  const t = Date.now();
  // ---- entries ----
  for (let i = pendingEntries.length - 1; i >= 0; i--) {
    const e = pendingEntries[i];
    if (e.at > t) continue;
    pendingEntries.splice(i, 1);
    const S = STRATEGIES[e.book];
    const token = tok(e.mint) || e.token;
    const slip = e.signalMcap ? (token.mcap / e.signalMcap - 1) * 100 : null;
    const skip = (reason) => {
      Qx.skip.run({ alertId: e.alertId, mint: e.mint, symbol: token.symbol, ts: t, mcap: token.mcap, book: e.book, rules: P.rules, score: e.score, market: JSON.stringify(marketTag()),
        signalMcap: e.signalMcap, signalTs: e.signalTs, features: JSON.stringify(e.features), reason, slip, cfg: CFG });
      paperEvents.push({ type: 'skip', pos: { book: e.book, mint: e.mint, symbol: token.symbol, reason, slipPct: slip } });
    };
    if (token.graduated) { skip('curve closed before entry'); continue; }
    { const rj = token.rejectedHard?.reason || token.lastScore?.reject; if (rj) { skip(`rejected before entry: ${rj}`); countBlocked('fill'); continue; } }
    if (S.requireMinRet != null && token.mcap < e.signalMcap * (1 + S.requireMinRet)) { skip(`price ${round(slip, 1)}% vs signal after ${S.delaySec}s (needs ≥ ${round(S.requireMinRet * 100, 0)}%)`); continue; }
    const tokens = curveBuy(token.vsol, token.vtok, P.sizeSol, P.feePct) * (1 - P.extraSlippagePct / 100);
    const gated = gate.enforcing ? 1 : 0;
    const pos = { book: e.book, S, alertId: e.alertId, mint: e.mint, symbol: token.symbol, entryTs: t, entryMcap: token.mcap, sizeSol: P.sizeSol, tokens, tokensLeft: tokens, realized: 0,
      peakValue: P.sizeSol, troughValue: P.sizeSol, peakTs: t, maxDrop: 0, lastMark: null, tp1Done: false, gated, signalMcap: e.signalMcap, tpMult: S.tpMult, stopPct: S.stopPct,
      events: [{ t, type: 'entry', mcap: round(token.mcap, 1) }] };
    pos.id = Number(q.insertPaper.run({ alertId: pos.alertId, mint: pos.mint, symbol: pos.symbol, entryTs: t, entryMcap: pos.entryMcap, sizeSol: pos.sizeSol, tokens, events: JSON.stringify(pos.events),
      book: e.book, rules: P.rules, gated, score: e.score, market: JSON.stringify(marketTag()) }).lastInsertRowid);
    Qx.enrich.run({ id: pos.id, signalMcap: e.signalMcap, signalTs: e.signalTs, features: JSON.stringify(e.features), tpMult: S.tpMult, stopPct: S.stopPct, slip, cfg: CFG });
    open.set(key(e.book, e.mint), pos);
    paperEvents.push({ type: 'entry', pos: pub(pos, token) });
    log.info(`ENTRY [${pos.book}] ${pos.symbol} @ ${round(pos.entryMcap, 1)} SOL mcap (signal ${round(e.signalMcap, 1)}, ${slip >= 0 ? '+' : ''}${round(slip, 1)}%)`);
  }
  // ---- exits (also checked on every trade via onTrade) ----
  for (const pos of [...open.values()]) checkExit(pos, t);
  // persist MFE/MAE every ~10 s so restarts and the terminal see them
  if (t - (tick._lastTrack || 0) > 10000) {
    tick._lastTrack = t;
    for (const pos of open.values()) Qx.track.run({ id: pos.id, trough: pos.troughValue, peakTs: pos.peakTs, maxDrop: pos.maxDrop });
  }
  for (const [m] of ghosts) if (!BOOKS.some((b) => open.has(key(b, m)))) ghosts.delete(m);
}

/** Event-driven exit check: call after every trade on a token (stops no longer wait for the 1 s tick). */
export function onTrade(mint) {
  if (!open.size) return;
  const t = Date.now();
  for (const b of BOOKS) { const pos = open.get(key(b, mint)); if (pos) checkExit(pos, t); }
}

function checkExit(pos, t) {
  const k = key(pos.book, pos.mint);
  if (!open.has(k)) return;
  const token = tok(pos.mint);
  if (!token) { q.voidPaper.run(t, pos.id); open.delete(k); return; }
  const S = pos.S || STRATEGIES[pos.book] || STRATEGIES.main;
  const value = valueOf(pos, token);
  const total = pos.realized + value;
  if (pos.lastMark != null && pos.lastMark > 0) pos.maxDrop = Math.max(pos.maxDrop, (1 - total / pos.lastMark) * 100);
  pos.lastMark = total;
  if (total > pos.peakValue) { pos.peakValue = total; pos.peakTs = t; }
  if (total < pos.troughValue) pos.troughValue = total;
  const mult = total / pos.sizeSol;
  // a triggered exit fills after the reaction delay, at whatever the curve price is then
  if (pos.pendingExit) {
    if (t >= pos.pendingExit.at) {
      const pe = pos.pendingExit; pos.pendingExit = null;
      if (pe.kind === 'tp') {
        const frac = S.tpFraction ?? P.tp1Fraction, sellTok = pos.tokensLeft * frac, got = valueOf(pos, token, sellTok);
        pos.tokensLeft -= sellTok; pos.realized += got; pos.tp1Done = true;
        pos.events.push({ t, type: 'tp1', sol: round(got, 4), mcap: round(token.mcap, 1), trigger: round((pe.mult - 1) * 100, 1) });
        if (pos.tokensLeft <= 1e-9) { closePos(pos, null, pe.reason); return; }
        persist(pos);
      } else closePos(pos, token, pe.reason);
    }
    return;
  }
  const heldMin = (t - pos.entryTs) / 60000;
  const trigger = (kind, reason) => {
    Qx.trigger.run((mult - 1) * 100, pos.id);
    if (P.exitDelaySec <= 0) { pos.pendingExit = { at: t, kind, reason, mult }; checkExit(pos, t); return; }
    pos.pendingExit = { at: t + P.exitDelaySec * 1000, kind, reason, mult };
  };
  if (token.graduated) { closePos(pos, token, 'graduated (sold at curve close)'); return; }
  if (!pos.tp1Done && mult >= pos.tpMult) return trigger('tp', `take profit +${round((pos.tpMult - 1) * 100, 0)}%`);
  if (mult <= 1 - pos.stopPct / 100) return trigger('exit', `stop -${pos.stopPct}%`);
  if (pos.tp1Done && total <= pos.peakValue * (1 - S.trailPct / 100)) return trigger('exit', `trailing stop ${S.trailPct}%`);
  if (heldMin >= S.maxHoldMin) return trigger('exit', 'max hold');
  if ((t - token.lastTradeAt) / 60000 >= P.idleExitMin) return trigger('exit', 'idle curve');
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
  ghosts.delete(pos.mint);
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
export const openPositions = (getToken) => [...open.values()].map((p) => pub(p, getToken(p.mint) || ghosts.get(p.mint)));
export const isOpen = (mint) => BOOKS.some((b) => open.has(key(b, mint))) || pendingEntries.some((e) => e.mint === mint);
export const hasOpen = (mint) => BOOKS.some((b) => open.has(key(b, mint)));
export const openCount = () => open.size;

/** Welch difference of means with a 95% interval (percent points). */
export function diffCI(a, b, z = 1.96) {
  if (a.length < 2 || b.length < 2) return { diff: a.length && b.length ? mean(a) - mean(b) : null, lo: null, hi: null };
  const d = mean(a) - mean(b), se = Math.sqrt(vari(a) / a.length + vari(b) / b.length);
  return { diff: d, lo: d - z * se, hi: d + z * se };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const vari = (a) => { const m = mean(a); return a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1); };
const zFor = (c) => (c >= 0.995 ? 2.807 : c >= 0.99 ? 2.576 : c >= 0.975 ? 2.241 : 1.96);

/**
 * Kill rule. PASS requires ALL of:
 *  1. at least minTrades closed trades (gap-flagged trades excluded upstream),
 *  2. the 99% low bound of average P&L per trade above zero (six books tested at once; 95% would let ~26% pass by luck),
 *  3. both halves (by exit time) positive on their own,
 *  4. when a control book is given: beating it (95% low bound of the difference above zero, control needs 30+ trades).
 * MARGINAL = positive but not all four. FAIL = average at or below zero.
 */
export function killStatsFrom(rows, { control = null } = {}) {
  const K = config.killRule, z = zFor(K.confidence);
  const w = rows.slice(-K.windowTrades).map((r) => r.pnl_pct / 100);
  const n = w.length;
  const m = n ? mean(w) : 0;
  const sd = n > 1 ? Math.sqrt(vari(w)) : 0;
  const se = n > 1 ? sd / Math.sqrt(n) : 0;
  const lo = m - 1.96 * se, hi = m + 1.96 * se, lo99 = m - z * se;
  const wins = w.filter((x) => x > 0), losses = w.filter((x) => x <= 0);
  const pf = losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0) || 1e-9) : wins.length ? Infinity : 0;
  const h = Math.floor(n / 2), h1 = w.slice(0, h), h2 = w.slice(h);
  const halves = { first: h1.length ? mean(h1) * 100 : null, second: h2.length ? mean(h2) * 100 : null, n1: h1.length, n2: h2.length };
  let vsControl = null;
  if (control) { const c = control.slice(-K.windowTrades).map((r) => r.pnl_pct); const d = diffCI(w.map((x) => x * 100), c); vsControl = { ...d, controlN: c.length, controlAvg: c.length ? mean(c) : null }; }
  const checks = {
    sample: n >= K.minTrades,
    confidence: n > 1 && lo99 > 0,
    halves: h1.length >= 10 && h2.length >= 10 && halves.first > 0 && halves.second > 0,
    control: control ? vsControl.controlN >= 30 && vsControl.lo != null && vsControl.lo > 0 : null,
  };
  let status = 'COLLECTING';
  if (n >= K.minTrades) status = m <= 0 ? 'FAIL' : checks.confidence && checks.halves && checks.control !== false ? 'PASS' : 'MARGINAL';
  let eq = 0; const equity = rows.map((r) => ({ t: r.exit_ts, eq: (eq += r.pnl_sol) }));
  return {
    status, n, needed: K.minTrades, expectancyPct: m * 100, ciLowPct: lo * 100, ciHighPct: hi * 100, ci99LowPct: lo99 * 100, confidencePct: K.confidence * 100,
    winRatePct: n ? (wins.length / n) * 100 : 0, profitFactor: Number.isFinite(pf) ? pf : null, halves, vsControl, checks,
    totalPnlSol: rows.reduce((a, r) => a + r.pnl_sol, 0), allTrades: rows.length, equity: equity.slice(-500),
    bestPct: n ? Math.max(...w) * 100 : 0, worstPct: n ? Math.min(...w) * 100 : 0,
  };
}
/** Trades that count: current settings fingerprint, not gap-flagged, not gated by an enforced market pause. */
export const closedCurrent = () => q.closedPapersAsc.all().filter((r) => r.cfg === CFG && !r.gap);
const bookRows = (rows, b) => rows.filter((r) => (r.book || 'main') === b && !r.gated);
export const killRule = (book = 'main') => { const rows = closedCurrent(); return killStatsFrom(bookRows(rows, book), { control: book === 'random' || !BOOKS.includes('random') ? null : bookRows(rows, 'random') }); };
const brief = (k) => ({ status: k.status, n: k.n, needed: k.needed, expectancyPct: k.expectancyPct, ciLowPct: k.ciLowPct, ciHighPct: k.ciHighPct, winRatePct: k.winRatePct, profitFactor: k.profitFactor, totalPnlSol: k.totalPnlSol });
/** Side-by-side comparison for the Performance tab */
// ---- 24-hour gate ----
// The bar written down on 2026-10-16 before looking at the next day: a book passes when, over a rolling day, it has at
// least minN closed trades, a positive mean after costs, a 95% lower bound above minLo, the random control is not also
// positive (a market-wide pump does not count), and the rule was fixed before the window opened.
const sinceStmt = { get: db.prepare('SELECT v FROM kv WHERE k = ?'), set: db.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?)') };
for (const b of BOOKS) sinceStmt.set.run(`book_since:${b}:${CFG}`, String(Date.now())); // first time this book ran under these rules
export function gate24h() {
  const G = config.gate24h, now = Date.now(), start = now - G.hours * 3600000;
  const rows = closedCurrent().filter((r) => !r.gated && r.exit_ts >= start && r.pnl_pct != null);
  const stat = (rs) => {
    const n = rs.length; if (!n) return { n: 0, meanPct: null, loPct: null, hiPct: null, winRatePct: null, pnlSol: 0 };
    const mean = rs.reduce((a, r) => a + r.pnl_pct, 0) / n, sd = Math.sqrt(rs.reduce((a, r) => a + (r.pnl_pct - mean) ** 2, 0) / Math.max(1, n - 1)), se = sd / Math.sqrt(n);
    return { n, meanPct: round(mean, 2), loPct: round(mean - 1.96 * se, 2), hiPct: round(mean + 1.96 * se, 2), winRatePct: round((rs.filter((r) => r.pnl_pct > 0).length / n) * 100, 1), pnlSol: round(rs.reduce((a, r) => a + (r.pnl_sol || 0), 0), 4), sdPct: round(sd, 1) };
  };
  const ctrl = stat(rows.filter((r) => (r.book || 'main') === 'random'));
  const out = {};
  for (const b of BOOKS) {
    const rs = rows.filter((r) => (r.book || 'main') === b), st = stat(rs);
    const since = Number(sinceStmt.get.get(`book_since:${b}:${CFG}`)?.v || now);
    const checks = {
      sample: { ok: st.n >= G.minN, text: `${st.n} / ${G.minN} closed trades in the window` },
      mean: { ok: st.meanPct != null && st.meanPct > G.minMeanPct, text: `mean after costs ${st.meanPct != null ? `${st.meanPct > 0 ? '+' : ''}${st.meanPct}%` : '–'} (needs > ${G.minMeanPct}%)` },
      bound: { ok: st.loPct != null && st.loPct > G.minLoPct, text: `95% lower bound ${st.loPct != null ? `${st.loPct > 0 ? '+' : ''}${st.loPct}%` : '–'} (needs > ${G.minLoPct}%)` },
      control: { ok: b === 'random' ? true : !(ctrl.n >= 30 && ctrl.meanPct > 0), text: b === 'random' ? 'is the control' : `random control ${ctrl.n ? `${ctrl.meanPct > 0 ? '+' : ''}${ctrl.meanPct}% on ${ctrl.n}` : 'no trades'} (must not be positive)` },
      fixed: { ok: since <= start, text: since <= start ? `rule fixed ${((now - since) / 3600000).toFixed(0)} h ago, before the window` : `rule fixed ${((now - since) / 3600000).toFixed(1)} h ago; the window must start after that (${((since - start) / 3600000).toFixed(1)} h to go)` },
    };
    const hard = Object.values(checks).every((c) => c.ok);
    const status = b === 'random' ? (st.n ? 'CONTROL' : 'COLLECTING') : st.n < G.minN ? 'COLLECTING' : hard ? 'PASS' : 'FAIL';
    // hourly path through the window, for the drill
    const hours = []; for (let h = 0; h < G.hours; h++) { const a = start + h * 3600000, hr = rs.filter((r) => r.exit_ts >= a && r.exit_ts < a + 3600000); const x = stat(hr); hours.push({ t: a, n: x.n, meanPct: x.meanPct, pnlSol: x.pnlSol }); }
    out[b] = { book: b, label: STRATEGIES[b].label, candidate: !!STRATEGIES[b].candidate, status, ...st, checks, since, hours };
  }
  return { config: G, windowStart: start, now, control: ctrl, order: BOOKS, books: out };
}

export function books() {
  const cur = closedCurrent();
  const byState = (rows, st) => rows.filter((r) => { try { return JSON.parse(r.market || '{}').state === st; } catch { return false; } });
  const out = {};
  for (const b of BOOKS) {
    const rows = cur.filter((r) => (r.book || 'main') === b);
    const S = STRATEGIES[b];
    out[b] = { kill: (({ equity, ...k }) => k)(killRule(b)), open: [...open.values()].filter((p) => p.book === b).length, label: S.label, entry: S.entry,
      byMarket: { WARM: brief(killStatsFrom(byState(rows, 'WARM'))), COLD: brief(killStatsFrom(byState(rows, 'COLD'))), UNKNOWN: brief(killStatsFrom(byState(rows, 'UNKNOWN'))) } };
  }
  const older = q.closedPapersAsc.all().filter((r) => r.cfg !== CFG || r.gap);
  return { rules: P.rules, cfg: CFG, order: BOOKS, books: out, gate: gate24h(), verdict: verdictFor('curve-stage-entry'), legacyV1: brief(killStatsFrom(older)), excluded: { olderVersions: older.filter((r) => r.cfg !== CFG).length, gap: older.filter((r) => r.cfg === CFG && r.gap).length } };
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
