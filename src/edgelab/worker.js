// Edge Lab worker: labels forward returns and evaluates every hypothesis × window off the main thread.
// Read-only database connection (WAL lets it read while the scanner writes).
import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { HYPOTHESES, HORIZONS, PASS_BAR } from './hypotheses.js';
import { evaluate, netOf, eta, histogram } from './stats.js';

const { dbPath, reg, cost, replayCfg } = workerData;
const t0 = Date.now();
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.pragma('busy_timeout = 5000');

// ---------- 1. forward-return labels ----------
const entryCps = [...new Set(HORIZONS.map((h) => h.entry))], exitCps = [...new Set(HORIZONS.map((h) => h.exit))];
const exitMcap = new Map(); // mint -> { cp: mcap }
for (const r of db.prepare(`SELECT mint, checkpoint c, mcap FROM snapshots WHERE checkpoint IN (${exitCps.join(',')}) AND COALESCE(gap,0) = 0`).iterate()) {
  let o = exitMcap.get(r.mint); if (!o) exitMcap.set(r.mint, (o = {})); o[r.c] = r.mcap;
}
const tok = new Map();
for (const r of db.prepare(`SELECT t.mint, t.symbol, t.graduated, t.graduated_at, t.peak_mcap_1h, t.mcap_1h, t.finalized, COALESCE(t.gap,0) gap
  FROM tokens t WHERE t.mint IN (SELECT mint FROM snapshots WHERE features IS NOT NULL)`).iterate()) tok.set(r.mint, r);

const quality = { entries: 0, exitSnapshot: 0, exitGraduated: 0, exitFinal: 0, pending: 0, excludedGap: 0, badMcap: 0 };
const samples = Object.fromEntries(HORIZONS.map((h) => [h.id, []])); // horizon -> [{ mint, ts, gross, f, s }]
for (const r of db.prepare(`SELECT mint, checkpoint c, ts, mcap, score, features FROM snapshots WHERE features IS NOT NULL AND reject IS NULL AND COALESCE(gap,0) = 0 AND checkpoint IN (${entryCps.join(',')}) ORDER BY ts`).iterate()) {
  let f; try { f = JSON.parse(r.features); } catch { continue; }
  const T = tok.get(r.mint);
  for (const h of HORIZONS) {
    if (h.entry !== r.c) continue;
    quality.entries++;
    if (!(r.mcap > 0)) { quality.badMcap++; continue; }
    let exit = exitMcap.get(r.mint)?.[h.exit], kind = 'snap';
    // a token-level gap flag (restart mid-window) only matters when we would fall back to its final label
    if (exit == null && T?.gap) { quality.excludedGap++; continue; }
    if (exit == null) {
      if (T?.graduated && T.graduated_at && T.graduated_at <= r.ts + (h.exit - h.entry) * 1000 + 60000) { exit = T.peak_mcap_1h; kind = 'grad'; }
      else if (T?.finalized === 1) { exit = T.mcap_1h; kind = 'final'; } // evicted while idle: price unchanged since
    }
    if (!(exit > 0)) { quality.pending++; continue; }
    quality[kind === 'snap' ? 'exitSnapshot' : kind === 'grad' ? 'exitGraduated' : 'exitFinal']++;
    samples[h.id].push({ mint: r.mint, ts: r.ts, gross: (exit / r.mcap - 1) * 100, f, s: { score: r.score, mcap: r.mcap } });
  }
}

// ---------- 2. evaluate ----------
const tests = HYPOTHESES.flatMap((hy) => HORIZONS.map((hz) => ({ hy, hz, key: `${hy.id}@${hz.id}` })));
const m = tests.filter((t) => !t.hy.reference).length;
const out = [];
const universeTest = HYPOTHESES.find((h) => h.reference)?.test || (() => true);
for (const { hy, hz, key } of tests) {
  const since = reg[key] ?? Date.now();
  const all = samples[hz.id].filter((x) => { try { return hy.test(x.f, x.s); } catch { return false; } });
  const toRow = (x) => ({ ts: x.ts, net: netOf(x.gross, cost.primary), gross: x.gross, mint: x.mint });
  const counted = all.filter((x) => x.ts >= since).map(toRow), context = all.map(toRow);
  const uCounted = samples[hz.id].filter((x) => x.ts >= since && universeTest(x.f, x.s)).map(toRow);
  const ev = evaluate(counted, { m, universe: uCounted, reference: !!hy.reference });
  const ctx = evaluate(context, { m, universe: samples[hz.id].map(toRow), reference: !!hy.reference });
  const grossMean = (a) => (a.length ? a.reduce((s, x) => s + x.gross, 0) / a.length : null);
  const byDay = {};
  for (const r of context) { const d = Math.floor(r.ts / 86400000) * 86400000; const o = (byDay[d] ||= { t: d, n: 0, sum: 0, counted: 0 }); o.n++; o.sum += r.net; if (r.ts >= since) o.counted++; }
  out.push({
    key, hyp: hy.id, horizon: hz.id, registeredAt: since, reference: !!hy.reference,
    counted: { ...ev, grossMeanPct: grossMean(counted) }, context: { ...ctx, grossMeanPct: grossMean(context) },
    eta: eta(counted, since),
    hist: histogram((counted.length >= 30 ? counted : context).map((r) => r.net)), histScope: counted.length >= 30 ? 'counted' : 'all history',
    byDay: Object.values(byDay).sort((a, b) => a.t - b.t).map((o) => ({ t: o.t, n: o.n, counted: o.counted, meanPct: o.sum / o.n })),
    rows: context.slice(-400).reverse().map((r) => ({ mint: r.mint, symbol: tok.get(r.mint)?.symbol || null, ts: r.ts, grossPct: r.gross, netPct: r.net, counted: r.ts >= since ? 1 : 0 })),
  });
}

// ---------- 3. exit replay on recorded paper trades (tape) ----------
function replay() {
  const R = db.prepare(`SELECT id, mint, book, entry_ts, signal_ts, exit_ts FROM paper_trades WHERE status = 'closed' AND COALESCE(gap,0) = 0 AND signal_ts IS NOT NULL ORDER BY entry_ts DESC LIMIT 2500`).all();
  const q = db.prepare('SELECT ts, vsol, vtok FROM trades WHERE mint = ? AND ts BETWEEN ? AND ? ORDER BY ts, slot');
  const FEE = replayCfg.feePct / 100, SLIP = replayCfg.slipPct / 100, SIZE = replayCfg.sizeSol, DELAY = replayCfg.exitDelaySec * 1000;
  const data = [];
  for (const r of R) { const t = q.all(r.mint, r.signal_ts - 120000, r.signal_ts + 2400000).filter((x) => x.vsol > 0 && x.vtok > 0); if (t.length >= 5) data.push({ r, t }); }
  const at = (t, ts) => { let lo = 0, hi = t.length - 1, i = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (t[mid].ts <= ts) { i = mid; lo = mid + 1; } else hi = mid - 1; } return i; };
  const buyTok = (s) => { const inn = SIZE * (1 - FEE); return (s.vtok - (s.vsol * s.vtok) / (s.vsol + inn)) * (1 - SLIP); };
  const sellSol = (tk, s) => (s.vsol - (s.vsol * s.vtok) / (s.vtok + tk)) * (1 - FEE) * (1 - SLIP);
  function sim({ r, t }, P) {
    const eI = P.entry === 'signal' ? at(t, r.signal_ts) : at(t, r.entry_ts); if (eI < 0) return null;
    const tk = buyTok(t[eI]), t0e = t[eI].ts; let trig = null;
    for (let k = eI + 1; k < t.length; k++) {
      const s = t[k], mlt = sellSol(tk, s) / SIZE, held = (s.ts - t0e) / 1000;
      if (trig != null) { if (s.ts >= trig) return mlt - 1; continue; }
      if (P.tp && mlt >= P.tp) trig = s.ts + DELAY;
      else if (P.stop != null && mlt <= 1 - P.stop) trig = s.ts + DELAY;
      else if (P.tstop && held >= P.tstop && mlt < 1) trig = s.ts + DELAY;
      else if (held >= (P.maxHold || 1800)) return mlt - 1;
    }
    return sellSol(tk, t[t.length - 1]) / SIZE - 1;
  }
  const S = replayCfg.stopPct / 100, TP = replayCfg.tp;
  const rules = [
    { id: 'current', label: `Current: stop −${replayCfg.stopPct}%, target +${Math.round((TP - 1) * 100)}%`, P: { tp: TP, stop: S } },
    { id: 's20', label: 'Stop −20%', P: { tp: TP, stop: 0.2 } },
    { id: 's10', label: 'Stop −10%', P: { tp: TP, stop: 0.1 } },
    { id: 's30', label: 'Stop −30%', P: { tp: TP, stop: 0.3 } },
    { id: 's50', label: 'Stop −50%', P: { tp: TP, stop: 0.5 } },
    { id: 'nostop', label: 'No stop (target or 30 min)', P: { tp: TP, stop: null } },
    { id: 'tstop30', label: `Stop −${replayCfg.stopPct}% + exit at 30 s if not up`, P: { tp: TP, stop: S, tstop: 30 } },
    { id: 'oct14', label: 'Oct 14 best: signal entry, −10% stop, +8% target, 30 s time stop', P: { entry: 'signal', tp: 1.08, stop: 0.1, tstop: 30 } },
  ];
  const res = rules.map((ru) => {
    const v = []; for (const d of data) { const x = sim(d, ru.P); if (x != null) v.push({ ts: d.r.entry_ts, net: x * 100 }); }
    v.sort((a, b) => a.ts - b.ts);
    const e = evaluate(v, { m: 1, bar: { ...PASS_BAR, minTokens: 50 } });
    return { id: ru.id, label: ru.label, n: e.n, meanPct: e.meanPct, lo95: e.n > 1 ? e.meanPct - 1.96 * (e.sdPct / Math.sqrt(e.n)) : null, winPct: e.winPct, halves: e.halves };
  });
  return { trades: R.length, withTape: data.length, rules: res };
}
let rep = null; try { rep = replay(); } catch (e) { rep = { error: e.message }; }

db.close();
parentPort.postMessage({ ok: true, ms: Date.now() - t0, m, quality, tests: out, replay: rep, samples: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.length])) });
