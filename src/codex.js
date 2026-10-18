// Trading codex: what the bot holds right now, on which coins, and what it held at any moment in the last day.
//
// One view over every paper book (curve books in paper.js, graduate books in graduates.js). "Now" is marked from live
// state; a past moment is marked from the recorded tape (last curve trade before that instant, or the nearest graduate
// snapshot), which makes the history an approximation and is labelled as such. Everything here is paper: no order has
// ever been sent, and the view never implies otherwise.
import { db, q } from './db.js';
import { config } from './config.js';
import * as paper from './engine/paper.js';
import { market } from './market.js';
import { mcapOf } from './util.js';
import { holdersOf } from './engine/holders.js';

const DAY = 86400000, MIN = 60000;
const GP = config.gradPaper || {};

const SQL = {
  curveMarkAt: 'SELECT vsol, vtok FROM trades WHERE mint = ? AND ts <= ? ORDER BY ts DESC LIMIT 1',
  gradMarkAt: 'SELECT mcap, price FROM grad_snapshots WHERE mint = ? AND ts <= ? ORDER BY ts DESC LIMIT 1',
  curveOpenAt: `SELECT id, book, mint, symbol, entry_ts, entry_mcap, size_sol, realized_sol, peak_value, tp_mult, stop_pct, exit_ts, exit_reason, pnl_pct, events, gated
    FROM paper_trades WHERE status IN ('open','closed') AND entry_ts <= ? AND (exit_ts IS NULL OR exit_ts > ?) AND COALESCE(gap, 0) = 0 ORDER BY entry_ts`,
  gradOpenAt: `SELECT id, COALESCE(book,'fixed') book, mint, symbol, entry_ts, entry_mcap, entry_price, size_sol, realized_sol, peak_value, exit_ts, exit_reason, pnl_pct, events
    FROM grad_paper WHERE status IN ('open','closed') AND entry_ts <= ? AND (exit_ts IS NULL OR exit_ts > ?) ORDER BY entry_ts`,
  curveTape: `SELECT id, book, mint, symbol, status, entry_ts, exit_ts, exit_reason, pnl_pct, pnl_sol, size_sol, events, gated FROM paper_trades
    WHERE status IN ('open','closed') AND COALESCE(gap, 0) = 0 AND (entry_ts > ? OR exit_ts > ?) ORDER BY COALESCE(exit_ts, entry_ts) DESC LIMIT 400`,
  gradTape: `SELECT id, COALESCE(book,'fixed') book, mint, symbol, status, entry_ts, exit_ts, exit_reason, pnl_pct, pnl_sol, size_sol, events FROM grad_paper
    WHERE status IN ('open','closed') AND (entry_ts > ? OR exit_ts > ?) ORDER BY COALESCE(exit_ts, entry_ts) DESC LIMIT 200`,
  intervals: `SELECT entry_ts, exit_ts FROM paper_trades WHERE status IN ('open','closed') AND COALESCE(gap,0) = 0 AND (exit_ts IS NULL OR exit_ts > ?)
    UNION ALL SELECT entry_ts, exit_ts FROM grad_paper WHERE status IN ('open','closed') AND (exit_ts IS NULL OR exit_ts > ?)`,
  dayCurve: `SELECT book, pnl_pct, pnl_sol, size_sol, symbol, mint, exit_reason, entry_ts, exit_ts FROM paper_trades WHERE status = 'closed' AND COALESCE(gap,0) = 0 AND COALESCE(gated,0) = 0 AND exit_ts >= ?`,
  dayGrad: `SELECT COALESCE(book,'fixed') book, pnl_pct, pnl_sol, size_sol, symbol, mint, exit_reason, entry_ts, exit_ts FROM grad_paper WHERE status = 'closed' AND exit_ts >= ?`,
  tokenMeta: 'SELECT name, image, created_at FROM tokens WHERE mint = ?',
};
const Q = new Proxy({}, { get: (c, k) => (c[k] ||= db.prepare(SQL[k])) });

const GRAD_LABEL = { fixed: 'Grad fixed', trail: 'Grad trail' };
const bookLabel = (book, venue) => (venue === 'curve' ? paper.STRATEGIES[book]?.label || book : GRAD_LABEL[book] || book);
const usd = (sol) => (market.solUsd && sol != null ? sol * market.solUsd : null);
const parseEvents = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

export function makeCodex({ engine, grads }) {
  const curveExitRule = (book) => { const S = paper.STRATEGIES[book]; if (!S) return null; return { stopPct: S.stopPct, tpMult: S.tpMult, tpFraction: S.tpFraction, trailPct: S.trailPct, maxHoldMin: S.maxHoldMin, text: S.entry }; };
  const gradExitRule = (book) => (book === 'trail'
    ? { stopPct: GP.stopPct, tpMult: null, trailPct: GP.trailBookPct, armMult: GP.trailArmMultiple, maxHoldMin: GP.trailMaxHoldMin, text: `hard stop −${GP.stopPct}% until +${Math.round((GP.trailArmMultiple - 1) * 100)}%, then ${GP.trailBookPct}% trail` }
    : { stopPct: GP.stopPct, tpMult: GP.tp1Multiple, tpFraction: GP.tp1Fraction, trailPct: GP.trailPct, maxHoldMin: GP.maxHoldMin, text: `sell ${Math.round(GP.tp1Fraction * 100)}% at ${GP.tp1Multiple}×, then ${GP.trailPct}% trail · stop −${GP.stopPct}%` });

  const meta = (mint, live) => { const r = Q.tokenMeta.get(mint); return { name: live?.name || r?.name || null, image: live?.image || r?.image || null, createdAt: live?.createdAt || r?.created_at || null }; };

  /** Live positions, marked from live state. */
  function livePositions() {
    const now = Date.now(), out = [];
    for (const p of paper.openPositions(engine.getToken)) {
      const t = engine.getToken(p.mint), m = meta(p.mint, t), S = curveExitRule(p.book);
      const value = p.markSol - p.realized;
      out.push({ key: `curve:${p.book}:${p.mint}`, id: p.id, venue: 'curve', book: p.book, bookLabel: bookLabel(p.book, 'curve'), mint: p.mint, symbol: p.symbol, name: m.name, image: m.image,
        entryTs: p.entryTs, heldSec: (now - p.entryTs) / 1000, sizeSol: p.sizeSol, markSol: p.markSol, markPct: p.markPct, realizedSol: p.realized, remainingSol: value, tp1Done: p.tp1Done, peakPct: p.peakPct, troughPct: p.troughPct,
        entryMcapSol: p.entryMcap, mcapSol: p.mcap, mcapUsd: usd(p.mcap), entryMcapUsd: usd(p.entryMcap), sizeUsd: usd(p.sizeSol), markUsd: usd(p.markSol),
        progressPct: t ? t.progress * 100 : null, buyers: t ? t.buyers.size : null, holders: t ? t.holders.size : null, lastTradeAgoSec: t ? (now - t.lastTradeAt) / 1000 : null, score: t?.lastScore?.score ?? null,
        rule: S, stopMult: S ? 1 - S.stopPct / 100 : null, tpMult: S ? (Number.isFinite(S.tpMult) ? S.tpMult : null) : null, gated: !!p.gated, live: !!t, approx: false });
    }
    for (const [, pos] of grads.open) {
      const st = grads.watch.get(pos.mint); const value = st ? grads.valueSol(pos, st) : 0; const total = pos.realized + value; const S = gradExitRule(pos.book);
      const hc = holdersOf(pos.mint), m = meta(pos.mint, null);
      out.push({ key: `grad:${pos.book}:${pos.mint}`, id: pos.id, venue: 'pumpswap', book: pos.book, bookLabel: bookLabel(pos.book, 'grad'), mint: pos.mint, symbol: pos.symbol || st?.symbol, name: st?.name || m.name, image: st?.info?.image || m.image,
        entryTs: pos.entryTs, heldSec: (now - pos.entryTs) / 1000, sizeSol: pos.sizeSol, markSol: total, markPct: (total / pos.sizeSol - 1) * 100, realizedSol: pos.realized, remainingSol: value, tp1Done: !!pos.tp1Done, peakPct: (pos.peak / pos.sizeSol - 1) * 100, troughPct: null,
        entryMcapUsd: pos.entryMcap, mcapUsd: st?.last?.mcap ?? null, liqUsd: st?.last?.liq ?? null, sizeUsd: usd(pos.sizeSol), markUsd: usd(total), priceUsd: st?.last?.price ?? null, entryPriceUsd: pos.entryPrice,
        holders: hc?.holders ?? null, lastTradeAgoSec: st?.last?.t ? (now - st.last.t) / 1000 : null, score: st?.score ?? null, c1h: st?.features?.c1h ?? null,
        rule: S, stopMult: 1 - S.stopPct / 100, tpMult: S.tpMult, gated: false, live: !!st, approx: false });
    }
    out.sort((a, b) => b.entryTs - a.entryTs);
    return out;
  }

  /** Positions open at a past instant, marked from the recorded tape. */
  function positionsAt(ts) {
    const out = [];
    for (const r of Q.curveOpenAt.all(ts, ts)) {
      const m = meta(r.mint, engine.getToken(r.mint)), S = curveExitRule(r.book), tr = Q.curveMarkAt.get(r.mint, ts);
      const mcap = tr ? mcapOf(tr.vsol, tr.vtok) : null;
      // partial sells before ts (tp1) are read from the event log so the mark respects what had already been banked
      const ev = parseEvents(r.events).filter((e) => e.t <= ts), tp1 = ev.find((e) => e.type === 'tp1');
      const frac = tp1 ? (1 - (paper.STRATEGIES[r.book]?.tpFraction ?? 0.5)) : 1, realized = tp1 ? tp1.sol : 0;
      const gross = mcap && r.entry_mcap ? mcap / r.entry_mcap : null;
      const markSol = gross != null ? realized + r.size_sol * frac * gross * (1 - config.paper.feePct / 100) : null;
      out.push({ key: `curve:${r.book}:${r.mint}`, id: r.id, venue: 'curve', book: r.book, bookLabel: bookLabel(r.book, 'curve'), mint: r.mint, symbol: r.symbol, name: m.name, image: m.image, entryTs: r.entry_ts, heldSec: (ts - r.entry_ts) / 1000,
        sizeSol: r.size_sol, markSol, markPct: markSol != null ? (markSol / r.size_sol - 1) * 100 : null, realizedSol: realized, tp1Done: !!tp1, entryMcapSol: r.entry_mcap, mcapSol: mcap, mcapUsd: usd(mcap), entryMcapUsd: usd(r.entry_mcap), sizeUsd: usd(r.size_sol), markUsd: usd(markSol),
        rule: S, stopMult: S ? 1 - S.stopPct / 100 : null, tpMult: S && Number.isFinite(S.tpMult) ? S.tpMult : null, gated: !!r.gated, live: false, approx: true, outcome: r.exit_ts ? { exitTs: r.exit_ts, reason: r.exit_reason, pnlPct: r.pnl_pct } : null });
    }
    for (const r of Q.gradOpenAt.all(ts, ts)) {
      const m = meta(r.mint, null), S = gradExitRule(r.book), snap = Q.gradMarkAt.get(r.mint, ts);
      const gross = snap?.price && r.entry_price ? snap.price / r.entry_price : null;
      const ev = parseEvents(r.events).filter((e) => e.t <= ts), tp1 = ev.find((e) => e.type === 'tp1');
      const frac = tp1 ? 1 - (GP.tp1Fraction ?? 0.5) : 1, realized = tp1 ? tp1.sol || 0 : 0;
      const markSol = gross != null ? realized + r.size_sol * frac * gross * (1 - (GP.feePct || 1) / 100) : null;
      out.push({ key: `grad:${r.book}:${r.mint}`, id: r.id, venue: 'pumpswap', book: r.book, bookLabel: bookLabel(r.book, 'grad'), mint: r.mint, symbol: r.symbol, name: m.name, image: m.image, entryTs: r.entry_ts, heldSec: (ts - r.entry_ts) / 1000,
        sizeSol: r.size_sol, markSol, markPct: markSol != null ? (markSol / r.size_sol - 1) * 100 : null, realizedSol: realized, tp1Done: !!tp1, entryMcapUsd: r.entry_mcap, mcapUsd: snap?.mcap ?? null, sizeUsd: usd(r.size_sol), markUsd: usd(markSol),
        rule: S, stopMult: 1 - S.stopPct / 100, tpMult: S.tpMult, gated: false, live: false, approx: true, outcome: r.exit_ts ? { exitTs: r.exit_ts, reason: r.exit_reason, pnlPct: r.pnl_pct } : null });
    }
    out.sort((a, b) => b.entryTs - a.entryTs);
    return out;
  }

  /** Entries, partial exits and exits in the last `hours`, newest first. */
  function tape(hours = 24, limit = 60) {
    const since = Date.now() - hours * 3600000, ev = [];
    const push = (venue, r) => {
      const label = bookLabel(r.book, venue === 'curve' ? 'curve' : 'grad');
      if (r.entry_ts > since) ev.push({ t: r.entry_ts, kind: 'entry', venue, book: r.book, bookLabel: label, mint: r.mint, symbol: r.symbol, id: r.id, sizeSol: r.size_sol, sizeUsd: usd(r.size_sol) });
      for (const e of parseEvents(r.events)) if (e.type === 'tp1' && e.t > since) ev.push({ t: e.t, kind: 'partial', venue, book: r.book, bookLabel: label, mint: r.mint, symbol: r.symbol, id: r.id, pct: e.trigger ?? null, sol: e.sol ?? null });
      if (r.exit_ts && r.exit_ts > since) ev.push({ t: r.exit_ts, kind: 'exit', venue, book: r.book, bookLabel: label, mint: r.mint, symbol: r.symbol, id: r.id, pnlPct: r.pnl_pct, pnlSol: r.pnl_sol, pnlUsd: usd(r.pnl_sol), reason: r.exit_reason, heldSec: (r.exit_ts - r.entry_ts) / 1000 });
    };
    for (const r of Q.curveTape.all(since, since)) push('curve', r);
    for (const r of Q.gradTape.all(since, since)) push('pumpswap', r);
    ev.sort((a, b) => b.t - a.t);
    return ev.slice(0, limit);
  }

  /** Open-position count per 5-minute bucket over the last 24 h, plus time-in-market. */
  function series(now = Date.now()) {
    const start = now - DAY, step = 5 * MIN, n = Math.ceil(DAY / step), counts = new Array(n).fill(0);
    let covered = 0; const segs = [];
    for (const r of Q.intervals.all(start, start)) {
      const a = Math.max(r.entry_ts, start), b = Math.min(r.exit_ts || now, now); if (b <= a) continue; segs.push([a, b]);
      for (let i = Math.floor((a - start) / step); i <= Math.min(n - 1, Math.floor((b - start) / step)); i++) counts[i]++;
    }
    segs.sort((x, y) => x[0] - y[0]); let cur = null;
    for (const [a, b] of segs) { if (!cur || a > cur[1]) { if (cur) covered += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); }
    if (cur) covered += cur[1] - cur[0];
    return { start, step, counts, timeInMarketPct: (covered / DAY) * 100 };
  }

  /** Closed trades since local midnight (dashboard timezone), all books. */
  function day() {
    const tz = config.telegram?.timezone || 'UTC';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const sinceMidnight = (Number(parts.hour) * 60 + Number(parts.minute)) * MIN, start = Date.now() - sinceMidnight;
    const rows = [...Q.dayCurve.all(start).map((r) => ({ ...r, venue: 'curve' })), ...Q.dayGrad.all(start).map((r) => ({ ...r, venue: 'pumpswap' }))];
    const pnlSol = rows.reduce((s, r) => s + (r.pnl_sol || 0), 0), wins = rows.filter((r) => (r.pnl_pct || 0) > 0).length;
    const best = rows.reduce((b, r) => (b == null || r.pnl_pct > b.pnl_pct ? r : b), null), worst = rows.reduce((w, r) => (w == null || r.pnl_pct < w.pnl_pct ? r : w), null);
    const byBook = {}; for (const r of rows) { const k = r.book; byBook[k] ||= { n: 0, pnlSol: 0, wins: 0, label: bookLabel(r.book, r.venue === 'curve' ? 'curve' : 'grad') }; byBook[k].n++; byBook[k].pnlSol += r.pnl_sol || 0; if (r.pnl_pct > 0) byBook[k].wins++; }
    return { day: `${parts.year}-${parts.month}-${parts.day}`, start, rows, trades: rows.length, wins, winRatePct: rows.length ? (wins / rows.length) * 100 : null, pnlSol, pnlUsd: usd(pnlSol), meanPct: rows.length ? rows.reduce((s, r) => s + (r.pnl_pct || 0), 0) / rows.length : null,
      best: best ? { symbol: best.symbol, mint: best.mint, pnlPct: best.pnl_pct, book: best.book } : null, worst: worst ? { symbol: worst.symbol, mint: worst.mint, pnlPct: worst.pnl_pct, book: worst.book } : null, byBook };
  }

  function now() {
    const positions = livePositions(), ts = Date.now();
    const books = {}; for (const p of positions) books[p.book] = (books[p.book] || 0) + 1;
    const exposureSol = positions.reduce((s, p) => s + (p.remainingSol ?? 0), 0), sizeSol = positions.reduce((s, p) => s + p.sizeSol, 0), markSol = positions.reduce((s, p) => s + (p.markSol ?? 0), 0);
    const tp = tape(24, 60), last = tp.find((e) => e.kind === 'exit') || null;
    return { ts, mode: 'live', inTrade: positions.length > 0, positions, coins: new Set(positions.map((p) => p.mint)).size, books,
      exposure: { sizeSol, markSol, exposureSol, sizeUsd: usd(sizeSol), markUsd: usd(markSol), exposureUsd: usd(exposureSol), pnlPct: sizeSol ? (markSol / sizeSol - 1) * 100 : null },
      watching: { curves: engine.tokens.size, graduates: grads.watch.size }, lastExit: last, tape: tp, series: series(ts), day: (({ rows, ...d }) => d)(day()), solUsd: market.solUsd || null,
      bookMeta: Object.fromEntries([...Object.keys(paper.STRATEGIES).map((b) => [b, { label: paper.STRATEGIES[b].label, venue: 'curve', control: !!paper.STRATEGIES[b].control, candidate: !!paper.STRATEGIES[b].candidate }]), ['fixed', { label: 'Grad fixed', venue: 'pumpswap' }], ['trail', { label: 'Grad trail', venue: 'pumpswap' }]]) };
  }

  function at(ts) {
    const positions = positionsAt(ts);
    const books = {}; for (const p of positions) books[p.book] = (books[p.book] || 0) + 1;
    const sizeSol = positions.reduce((s, p) => s + p.sizeSol, 0), markSol = positions.reduce((s, p) => s + (p.markSol ?? p.sizeSol), 0);
    return { ts, mode: 'moment', inTrade: positions.length > 0, positions, coins: new Set(positions.map((p) => p.mint)).size, books, exposure: { sizeSol, markSol, sizeUsd: usd(sizeSol), markUsd: usd(markSol), pnlPct: sizeSol ? (markSol / sizeSol - 1) * 100 : null }, solUsd: market.solUsd || null,
      note: 'Marks at a past moment are reconstructed from the recorded tape (last curve trade or nearest graduate snapshot before that instant) and are approximate.' };
  }

  /** Compact payload for the live stream: positions and totals only. */
  function pulse() { const n = now(); return { ts: n.ts, inTrade: n.inTrade, positions: n.positions, coins: n.coins, books: n.books, exposure: n.exposure, watching: n.watching, solUsd: n.solUsd }; }

  return { now, at, tape, series, day, pulse };
}
