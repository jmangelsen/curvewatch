// Orchestrator: token lifecycle, evaluation loop, snapshots, alerts, outcome labeling.
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { q, tx, db } from '../db.js';
import { Token } from './token.js';
import { score } from './score.js';
import { enqueueMetadata } from './metadata.js';
import { creatorRep, recordLaunch, recordCreatorOutcome, learnWallets, flushWallets, getSmartSet } from './intel.js';
import * as paper from './paper.js';
import { solToUsd } from '../market.js';
import { notify, sendTelegram, esc } from './telegram.js';
import { round } from '../util.js';
import { logger } from '../log.js';

const log = logger('engine');
const L = config.lifecycle;

export class Engine extends EventEmitter {
  constructor({ pumpportal }) {
    super();
    this.pp = pumpportal;
    this.tokens = new Map();
    this.pending = new Map(); // mint -> [{ev, exp}]
    this.recentCreates = []; // timestamps (rate)
    this.recentGrads = [];
    this.hourly = new Map(); // hourKey -> {launches, grads, alerts}
    this.counters = { creates: 0, trades: 0, ignoredTrades: 0, grads: 0, alerts: 0, snapshots: 0, finalized: 0 };
    this.alertTrackers = new Map(); // alertId -> {mint, s}
    this.tradeWriteQueue = [];
    this.startedAt = Date.now();
  }

  getToken = (mint) => this.tokens.get(mint);

  hour(t = Date.now()) {
    const k = Math.floor(t / 3600000) * 3600000;
    let h = this.hourly.get(k);
    if (!h) { h = { t: k, launches: 0, grads: 0, alerts: 0 }; this.hourly.set(k, h); if (this.hourly.size > 72) this.hourly.delete(this.hourly.keys().next().value); }
    return h;
  }

  onCreate(ev) {
    this.counters[`seen_${ev.src}`] = (this.counters[`seen_${ev.src}`] || 0) + 1;
    let t = this.tokens.get(ev.mint);
    if (t) { // second source for the same launch: merge useful fields
      if (t.createSlot == null && ev.slot != null) t.createSlot = ev.slot;
      if (ev.pool) t.pool = ev.pool;
      if (ev.mayhem) t.mayhem = true;
      if (!t.uri && ev.uri) { t.uri = ev.uri; if (config.scoring.metadataFetch) enqueueMetadata(t); }
      return;
    }
    t = new Token(ev);
    this.tokens.set(ev.mint, t);
    this.counters.creates++; this.recentCreates.push(Date.now()); this.hour().launches++;
    t.creatorRepAtLaunch = recordLaunch(t.creator, t.createdAt);
    q.insertToken.run({ mint: t.mint, name: t.name, symbol: t.symbol, uri: t.uri, creator: t.creator, created_at: t.createdAt, create_slot: t.createSlot,
      initial_buy_sol: null, initial_mcap: t.initialMcap, mayhem: t.mayhem ? 1 : 0, pool: t.pool });
    t.onSocial = (tok) => q.updateSocial.run(tok.social.twitter ? 1 : 0, tok.social.telegram ? 1 : 0, tok.social.website ? 1 : 0, tok.mint);
    if (config.scoring.metadataFetch) enqueueMetadata(t);
    // Stage-1 gate for metered trade subscriptions (only matters when TRADE_SOURCE=pumpportal)
    const rep = t.creatorRepAtLaunch;
    if (!(rep && rep.launches >= config.scoring.serialRuggerLaunches && rep.graduations === 0)) this.pp?.watchTrades(t.mint);
    const buf = this.pending.get(ev.mint);
    if (buf) { this.pending.delete(ev.mint); for (const p of buf) this.onTrade(p.ev); }
  }

  onTrade(ev) {
    // Use exactly one trade source to avoid double counting
    if (ev.src !== config.tradeSource) { this.counters.ignoredTrades++; return; }
    const t = this.tokens.get(ev.mint);
    if (!t) {
      // Trade raced ahead of its create event (or token predates this process): buffer briefly
      if (this.pending.size < 50000) {
        const arr = this.pending.get(ev.mint) || [];
        if (arr.length < 200) arr.push({ ev, exp: Date.now() + L.pendingTradeTtlSec * 1000 });
        this.pending.set(ev.mint, arr);
      }
      return;
    }
    if (!t.applyTrade(ev)) return;
    this.counters.trades++;
    if (!t.initialBuySol && ev.wallet === t.creator && ev.isBuy && t.trades.length <= 2) {
      t.initialBuySol = ev.sol; q.updateInitialBuy.run(ev.sol, t.initialMcap, t.mint);
    }
    if (t.recording) this.tradeWriteQueue.push([t.mint, ev.recvAt, ev.slot, ev.sig, ev.wallet, ev.isBuy ? 1 : 0, ev.sol, ev.tok, ev.vsol, ev.vtok]);
    if (t.graduated && !t._gradRecorded) this.markGrad(t);
  }

  onGraduate(ev) {
    const t = this.tokens.get(ev.mint);
    if (t) { t.graduated = true; t.graduatedAt = t.graduatedAt || Date.now(); this.markGrad(t); }
    else q.markGraduated.run(Date.now(), ev.mint); // launched before we started; still record
  }

  markGrad(t) {
    if (t._gradRecorded) return;
    t._gradRecorded = true;
    this.counters.grads++; this.recentGrads.push(Date.now()); this.hour().grads++;
    q.markGraduated.run(t.graduatedAt || Date.now(), t.mint);
    this.pp?.unwatchTrades(t.mint);
    if (t.alertId) notify(`<b>GRADUATED</b> · <b>${esc(t.symbol)}</b> graduated to PumpSwap (alert #${t.alertId}). Peak mcap ${solToUsd(t.peakMcap)}.`, 'alert');
  }

  /** Main loop body: score, snapshot, alert, age out, finalize. */
  evaluate() {
    const nowMs = Date.now();
    const smartSet = getSmartSet();
    const snapRows = [];
    for (const [mint, t] of this.tokens) {
      const age = (nowMs - t.createdAt) / 1000;
      if (!t.lite) {
        if (age <= L.activeWindowSec && !t.graduated) {
          const f = t.features({ smartSet, creatorRep: t.creatorRepAtLaunch });
          const s = score(f);
          t.lastScore = s; t.lastFeatures = f;
          if (s.score > t.maxScore) t.maxScore = s.score;
          for (const cp of L.snapshotCheckpointsSec) {
            if (age >= cp && !t.snapshots.some((x) => x.checkpoint === cp)) {
              t.addSnapshot(cp);
              snapRows.push({ mint, checkpoint: cp, ts: nowMs, mcap: t.mcap, score: s.score, reject: s.reject, features: JSON.stringify(compact(f)) });
            }
          }
          const S = config.scoring;
          if (!t.alertId && !s.reject && s.score >= S.alertScore && age >= S.minAgeSec && age <= S.maxAgeSec) this.fireAlert(t, f, s);
          this.maybeBandEntry(t, s, age);
        } else {
          t.toLite();
          if (!t.alertId && !paper.isOpen(mint)) this.pp?.unwatchTrades(mint);
        }
      }
      // Outcome labeling at the horizon
      if (!t.finalized && age >= L.outcomeHorizonSec) this.finalizeToken(t);
      // Alert outcome (1h after alert)
      if (t.alertId && !t.alertFinal && nowMs - t.alertedAt >= L.outcomeHorizonSec * 1000) this.finalizeAlert(t);
      // Eviction
      const horizon = t.alertId ? L.alertedHorizonSec : L.outcomeHorizonSec;
      if (t.finalized && (!t.alertId || t.alertFinal) && age >= horizon && !paper.isOpen(mint)) {
        this.tokens.delete(mint); this.pp?.unwatchTrades(mint);
      }
    }
    if (snapRows.length) { tx(() => { for (const r of snapRows) q.insertSnapshot.run(r); })(); this.counters.snapshots += snapRows.length; }
    // Expire pending buffers
    for (const [m, arr] of this.pending) { if (arr[0].exp < nowMs) this.pending.delete(m); }
    // Flush alerted-token trades
    if (this.tradeWriteQueue.length) { const rows = this.tradeWriteQueue.splice(0); tx(() => { for (const r of rows) q.insertTrade.run(...r); })(); }
    paper.tick(this.getToken);
    flushWallets();
    const cut = nowMs - 3600000;
    while (this.recentCreates.length && this.recentCreates[0] < cut) this.recentCreates.shift();
    while (this.recentGrads.length && this.recentGrads[0] < cut) this.recentGrads.shift();
  }

  /** Persist the full trade history (and every later trade) so entries can be replayed and audited. */
  startRecording(t) {
    if (t.recording) return;
    t.recording = true;
    for (const tr of t.trades) this.tradeWriteQueue.push([t.mint, tr.at, tr.slot, tr.sig, tr.w, tr.b ? 1 : 0, tr.sol, tr.tok, tr.vsol, tr.vtok]);
  }

  /** Parallel paper book: first time a live, unrejected score lands in [lo, hi) inside the alert age window. */
  maybeBandEntry(t, s, age) {
    const B = config.band, S = config.scoring;
    if (!B.enabled || t.bandAt || s.reject || s.score < B.lo || s.score >= B.hi || age < S.minAgeSec || age > S.maxAgeSec) return;
    t.bandAt = Date.now(); t.bandScore = s.score;
    this.startRecording(t);
    paper.scheduleEntry(t, t.alertId || null, { book: 'band', score: s.score });
    this.counters.bandEntries = (this.counters.bandEntries || 0) + 1;
  }

  fireAlert(t, f, s) {
    t.alertedAt = Date.now();
    this.startRecording(t);
    const id = Number(q.insertAlert.run({ mint: t.mint, ts: t.alertedAt, score: s.score, mcap: t.mcap, age: f.ageSec, progress: f.progressPct,
      reasons: JSON.stringify(s.reasons), flags: JSON.stringify(s.flags), features: JSON.stringify(compact(f)) }).lastInsertRowid);
    t.alertId = id;
    t.alertSnap = { mcap: t.mcap, maxAfter: t.mcap, runMin: t.mcap, minBeforeMax: t.mcap, minAfter: t.mcap };
    t.snapshots.push(t.alertSnap); // reuse the max/min tracking machinery
    this.counters.alerts++; this.hour().alerts++;
    paper.scheduleEntry(t, id, { book: 'main', score: s.score });
    const alert = { id, mint: t.mint, symbol: t.symbol, name: t.name, ts: t.alertedAt, score: s.score, mcap: t.mcap, ageSec: f.ageSec, progressPct: f.progressPct, reasons: s.reasons, flags: s.flags };
    this.emit('alert', alert);
    log.info(`ALERT #${id} ${t.symbol} score ${s.score} mcap ${round(t.mcap, 1)} SOL age ${round(f.ageSec, 0)}s`);
    const lines = [
      `<b>ALERT · ${esc(t.symbol)}</b> · ${esc(t.name)}  —  score <b>${s.score}</b>`,
      `mcap ${solToUsd(t.mcap)} · curve ${round(f.progressPct, 0)}% · age ${Math.floor(f.ageSec / 60)}m${Math.round(f.ageSec % 60)}s`,
      `${f.uniqueBuyers} buyers · net inflow ${solToUsd(f.netSol, true)} · top10 ${round(f.top10Pct, 0)}%`,
      s.reasons.length ? `+ ${esc(s.reasons.join(' · '))}` : '',
      s.flags.length ? `! ${esc(s.flags.join(' · '))}` : '',
      `<code>${t.mint}</code>`,
      `<a href="https://pump.fun/coin/${t.mint}">pump.fun</a> · <a href="https://solscan.io/token/${t.mint}">solscan</a> · <a href="https://dexscreener.com/solana/${t.mint}">dexscreener</a>`,
      `<i>Screener signal, not advice. Paper entry in ${config.paper.entryDelaySec}s.</i>`,
    ].filter(Boolean);
    notify(lines.join('\n'), 'alert');
  }

  finalizeToken(t) {
    t.finalized = true;
    const peak = t.peakMcap, m = t.mcap;
    const rugged = !t.graduated && peak > t.initialMcap * 1.3 && m < peak * 0.25;
    tx(() => {
      for (const s of t.snapshots) {
        if (s === t.alertSnap) continue;
        q.finalizeSnapshot.run({ mint: t.mint, checkpoint: s.checkpoint, maxAfter: s.maxAfter, minBeforeMax: s.minBeforeMax, minAfter: s.minAfter, mcapH: m, grad: t.graduated ? 1 : 0 });
      }
      q.finalizeToken.run({ mint: t.mint, peak, mcap: m, grad: t.graduated ? 1 : 0, gradAt: t.graduatedAt, rugged: rugged ? 1 : 0, buyers: t.buyers.size, maxScore: t.maxScore, alerted: t.alertId ? 1 : 0 });
      recordCreatorOutcome(t.creator, { graduated: t.graduated, rugged, peak });
    })();
    learnWallets(t);
    t.firstBuyAt = new Map(); t.firstBuyMcap = new Map();
    this.counters.finalized++;
  }

  finalizeAlert(t) {
    t.alertFinal = true;
    const s = t.alertSnap;
    q.finalizeAlert.run({ id: t.alertId, maxAfter: s.maxAfter, minBeforeMax: s.minBeforeMax, mcapH: t.mcap, grad: t.graduated ? 1 : 0, maxMult: s.maxAfter / s.mcap });
  }

  rates() {
    const nowMs = Date.now();
    const per = (arr, ms) => arr.filter((x) => x >= nowMs - ms).length;
    const win = Math.min(300000, nowMs - this.startedAt);
    return { launchesPerMin: win > 10000 ? per(this.recentCreates, win) / (win / 60000) : 0, launches1h: this.recentCreates.length, grads1h: this.recentGrads.length };
  }

  radar(limit = 80) {
    const rows = [];
    for (const t of this.tokens.values()) {
      if (t.lite || !t.lastScore || t.graduated || !t.quoteOk) continue;
      rows.push({ ...t.summary(), f: pickRadar(t.lastFeatures), flags: t.lastScore.flags, reasons: t.lastScore.reasons });
    }
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.f.netSol - a.f.netSol);
    return { activeCount: rows.length, tracked: this.tokens.size, rows: rows.slice(0, limit) };
  }

  tokenDetail(mint) {
    const t = this.tokens.get(mint);
    const row = db.prepare('SELECT * FROM tokens WHERE mint=?').get(mint);
    const snaps = db.prepare('SELECT * FROM snapshots WHERE mint=? ORDER BY checkpoint').all(mint);
    const alerts = db.prepare('SELECT * FROM alerts WHERE mint=?').all(mint);
    if (!t && !row) return null;
    const live = t ? {
      ...t.summary(), features: t.lastFeatures ? compact(t.lastFeatures) : null, scoreParts: t.lastScore?.parts, reasons: t.lastScore?.reasons, flags: t.lastScore?.flags,
      reject: t.lastScore?.reject, social: t.social, creatorRep: t.creatorRepAtLaunch,
      series: downsample(t.trades.map((x) => [x.at, round(x.mcap, 2)]), 240),
      lastTrades: t.trades.slice(-40).reverse().map((x) => ({ at: x.at, w: x.w, b: x.b, sol: round(x.sol, 4), mcap: round(x.mcap, 1) })),
      topHolders: [...t.holders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, v]) => ({ w, pct: round((v / 1e9) * 100, 2), creator: w === t.creator })),
    } : null;
    return { live, stored: row, snapshots: snaps.map((s) => ({ ...s, features: JSON.parse(s.features || '{}') })), alerts };
  }
}

function compact(f) { const o = {}; for (const [k, v] of Object.entries(f)) o[k] = typeof v === 'number' ? round(v, 3) : v; return o; }
function pickRadar(f) {
  if (!f) return {};
  return { netSol: round(f.netSol, 2), netSolPerMin: round(f.netSolPerMin, 2), flow60Sol: round(f.flow60Sol, 2), uniqueBuyers: f.uniqueBuyers, buyersPerMin: round(f.buyersPerMin, 1),
    top10Pct: round(f.top10Pct, 1), bundlePct: round(f.bundlePct, 1), creatorSoldPct: round(f.creatorSoldPct, 0), smartBuyers: f.smartBuyers, buySellRatio: round(f.buySellRatio, 2), drawdownPct: round(f.drawdownPct, 1) };
}
function downsample(arr, n) { if (arr.length <= n) return arr; const step = arr.length / n; const out = []; for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]); out.push(arr[arr.length - 1]); return out; }
