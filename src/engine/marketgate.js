// Market conditions: is the current tape paying or punishing these setups?
//
// Signal: win rate of the last N closed paper trades (both books, current exit rules, last few hours).
// Hysteresis: turns COLD below PAUSE_BELOW and back to WARM only at RESUME_AT, so it doesn't flicker.
// Context (launch rate, graduations, SOL move) is recorded on every paper entry so a better gate can be
// fitted later from real outcomes.
//
// Default mode is SHADOW: it labels trades but changes nothing, because the replay of 60 alerts showed the
// pause would have skipped trades that did better (45% win) than the ones it kept (35%). Flip to ENFORCE
// only after the shadow comparison on the Performance tab shows gated trades actually doing worse.
import { config } from '../config.js';
import { CFG } from '../version.js';
import { db } from '../db.js';
import { market } from '../market.js';
import { logger } from '../log.js';

const log = logger('market');
const G = config.marketGate;
// Unpriced and its checkpoint control stay out of this window so they cannot move the gate that labels Main.
const recentQ = db.prepare(`SELECT pnl_pct, exit_ts FROM paper_trades WHERE status='closed' AND cfg=@cfg AND COALESCE(gap,0)=0 AND book NOT IN ('random', 'unpriced', 'unpricedctl') AND exit_ts > @since ORDER BY exit_ts DESC LIMIT @n`);

const solHist = []; // [ts, px]
export const gate = {
  state: 'UNKNOWN', since: Date.now(), winRatePct: null, n: 0, changes: [],
  context: {},
  get mode() { return G.mode; },
  get enforcing() { return G.mode === 'enforce' && this.state === 'COLD'; },
};

/** Recompute; call every ~15 s. getCtx returns { launchesPerMin, grads1h }. Returns a state change or null. */
export function updateGate(getCtx) {
  const now = Date.now();
  if (market.solUsd) { solHist.push([now, market.solUsd]); while (solHist.length && now - solHist[0][0] > 3600e3 + 120e3) solHist.shift(); }
  const old = solHist.find(([t]) => now - t <= 3600e3);
  const ctx = getCtx?.() || {};
  gate.context = {
    launchesPerMin: ctx.launchesPerMin ?? null, grads1h: ctx.grads1h ?? null,
    solUsd: market.solUsd, sol1hPct: old && market.solUsd ? (market.solUsd / old[1] - 1) * 100 : null,
  };
  const rows = recentQ.all({ cfg: CFG, since: now - G.lookbackHours * 3600e3, n: G.window });
  gate.n = rows.length;
  gate.winRatePct = rows.length ? (rows.filter((r) => r.pnl_pct > 0).length / rows.length) * 100 : null;
  let next = gate.state;
  if (rows.length < G.minTrades) next = 'UNKNOWN';
  else if (gate.state !== 'COLD' && gate.winRatePct < G.pauseBelowPct) next = 'COLD';
  else if (gate.state === 'COLD' && gate.winRatePct >= G.resumeAtPct) next = 'WARM';
  else if (gate.state === 'UNKNOWN') next = 'WARM';
  if (next !== gate.state) {
    const ch = { t: now, from: gate.state, to: next, winRatePct: gate.winRatePct, n: gate.n };
    gate.state = next; gate.since = now; gate.changes.unshift(ch); gate.changes.length = Math.min(gate.changes.length, 20);
    log.info(`market ${ch.from} -> ${ch.to} (last ${gate.n} trades win ${gate.winRatePct?.toFixed(0)}%, mode ${G.mode})`);
    return ch;
  }
  return null;
}

/** Snapshot stored on each paper entry */
export const marketTag = () => ({ state: gate.state, winRatePct: gate.winRatePct, n: gate.n, ...gate.context });

export function gateView() {
  return { state: gate.state, since: gate.since, mode: G.mode, enforcing: gate.enforcing, winRatePct: gate.winRatePct, n: gate.n,
    config: G, context: gate.context, changes: gate.changes };
}
