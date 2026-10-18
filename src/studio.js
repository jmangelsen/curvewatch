// Curve Studio: compare the path of every graduated coin against the field, find the features that separate them, and
// test candidate rules on held-out time before anything is hard-coded. Read-only over the research tables; nothing here
// changes a book, a gate or the settings fingerprint.
//
// Honesty rules baked in:
//  - only finalized, gap-free tokens (a restart or feed gap inside a token's window makes its labels unknowable)
//  - non-SOL-quoted curves (USDC / PUMP / stock-token quotes) are excluded: their SOL market cap is meaningless and
//    their "graduations" happen at a few dollars of liquidity (23% of all graduates in the sandbox were this)
//  - every rate carries n and a Wilson interval; the rule tester reports both halves of a time split, not a single number
import { db } from './db.js';
import { config } from './config.js';
import { market } from './market.js';

const CPS = [30, 60, 120, 180, 300, 600];
const DAY = 86400000, HOUR = 3600000;
const cache = new Map();
const memo = (k, ttlMs, fn) => { const c = cache.get(k); if (c && c.exp > Date.now()) return c.v; const v = fn(); cache.set(k, { v, exp: Date.now() + ttlMs }); return v; };
export const clearStudioCache = () => cache.clear();

const quantile = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const qs = (arr) => { const s = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return { n: s.length, p10: quantile(s, 0.1), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p90: quantile(s, 0.9) }; };
/** Wilson 95% interval for a proportion, in percent. */
export function wilson(k, n, z = 1.96) {
  if (!n) return { lo: null, hi: null };
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: ((c - s) / d) * 100, hi: ((c + s) / d) * 100 };
}
const r = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const NONSOL = `SELECT DISTINCT mint FROM snapshots WHERE reject = 'non-SOL quote'`;
const famOf = (rj) => !rj ? '(pass)' : /^serial launcher/.test(rj) ? 'serial launcher' : /from peak$/.test(rj) ? 'drawdown from peak' : /^top-10 hold/.test(rj) ? 'top-10 concentration' : /^creator sold/.test(rj) ? 'creator sold' : /^bundled/.test(rj) ? 'bundled launch' : /^late:/.test(rj) ? 'late (curve nearly full)' : rj;

// ---------- curve stage (0–10 min): every token, snapshot checkpoints ----------
function curveBase(days) {
  return memo(`curve:${days}`, 5 * 60000, () => {
    const since = Date.now() - days * DAY;
    const rows = db.prepare(`SELECT s.mint, s.checkpoint cp, s.mcap, s.max_mcap_after mx, s.graduated_after g, s.reject rj, s.score, t.symbol, t.created_at ca, t.graduated_at ga, t.initial_mcap im
      FROM snapshots s JOIN tokens t ON t.mint = s.mint
      WHERE s.max_mcap_after IS NOT NULL AND t.finalized = 1 AND COALESCE(t.gap, 0) = 0 AND t.created_at > ? AND s.mint NOT IN (${NONSOL})`).all(since);
    const byMint = new Map();
    for (const x of rows) {
      let m = byMint.get(x.mint);
      if (!m) { m = { mint: x.mint, symbol: x.symbol, ca: x.ca, ga: x.ga, im: x.im, g: 0, path: {}, mx: {}, rj: {}, score: {} }; byMint.set(x.mint, m); }
      m.path[x.cp] = x.mcap; m.mx[x.cp] = x.mx; m.rj[x.cp] = x.rj; m.score[x.cp] = x.score; if (x.g) m.g = 1;
    }
    return { since, tokens: [...byMint.values()] };
  });
}

export function curves({ days = 14, lines = 300 } = {}) {
  const { tokens } = curveBase(days);
  const grads = tokens.filter((t) => t.g), non = tokens.filter((t) => !t.g);
  // 2x runners: never graduated but doubled from the 60 s mark (the tradeable "almost" cohort)
  const x2 = non.filter((t) => t.path[60] > 0 && t.mx[60] >= 2 * t.path[60]);
  const band = (set) => CPS.map((cp) => { const q = qs(set.map((t) => t.path[cp]).filter((v) => v > 0)); return { cp, ...q }; });
  const cohorts = {
    grad: { label: 'Graduated', n: grads.length, band: band(grads) },
    x2: { label: 'Doubled, no graduation', n: x2.length, band: band(x2) },
    non: { label: 'Did not graduate', n: non.length, band: band(non) },
  };
  // separation per checkpoint: how much of the grad cohort sits above the field's 90th percentile
  const separation = CPS.map((cp, i) => { const p90 = cohorts.non.band[i].p90, gl = grads.map((t) => t.path[cp]).filter((v) => v > 0); return { cp, gradMedian: r(cohorts.grad.band[i].p50, 1), fieldMedian: r(cohorts.non.band[i].p50, 1), gradAboveFieldP90Pct: gl.length ? r((gl.filter((v) => v > p90).length / gl.length) * 100, 1) : null }; });
  const pick = (set, n, newestFirst = true) => (newestFirst ? [...set].sort((a, b) => b.ca - a.ca) : set.filter((_, i) => i % Math.max(1, Math.floor(set.length / n)) === 0)).slice(0, n)
    .map((t) => ({ mint: t.mint, symbol: t.symbol, g: t.g, ca: t.ca, tGradSec: t.g && t.ga ? Math.round((t.ga - t.ca) / 1000) : null, path: CPS.map((cp) => [cp, t.path[cp] ?? null]), peak: Math.max(...CPS.map((cp) => t.mx[cp] || 0)), rejectedAt: CPS.find((cp) => t.rj[cp]) ?? null, firstReject: famOf(CPS.map((cp) => t.rj[cp]).find(Boolean) || null) }));
  const ttg = grads.map((t) => (t.ga && t.ca ? (t.ga - t.ca) / 60000 : null)).filter((v) => v != null && v >= 0);
  const ttgQ = qs(ttg);
  const bins = [[0, 5], [5, 10], [10, 20], [20, 40], [40, 60], [60, 180], [180, 1440], [1440, 1e9]];
  const ttgHist = bins.map(([a, b]) => ({ label: b >= 1e9 ? '> 1 day' : b > 60 ? `${a / 60}–${b / 60} h` : `${a}–${b} min`, n: ttg.filter((v) => v >= a && v < b).length }));
  // graduates lost to the reject rules at each checkpoint
  const rejectCost = CPS.map((cp) => { const g = grads.filter((t) => cp in t.path); const rejected = g.filter((t) => t.rj[cp]); return { cp, grads: g.length, rejectedGrads: rejected.length, pct: g.length ? r((rejected.length / g.length) * 100, 1) : null }; });
  return { days, generatedAt: Date.now(), solUsd: market.solUsd, cps: CPS, n: tokens.length, cohorts, separation,
    lines: { grad: pick(grads, lines), x2: pick(x2, Math.min(150, lines)), non: pick(non, Math.min(150, lines), false) },
    timeToGrad: { n: ttg.length, p25: r(ttgQ.p25, 1), p50: r(ttgQ.p50, 1), p75: r(ttgQ.p75, 1), hist: ttgHist }, rejectCost,
    notes: ['Only finalized, gap-free, SOL-quoted tokens. Market cap in SOL at each checkpoint (evaluate loop runs every 5 s, so a "30 s" point was taken at 30–35 s).',
      'Time to graduation is right-censored at the 1 h label horizon: a token that graduates later than 1 h after launch is counted as a non-graduate here (alerted tokens are the exception, tracked 24 h).',
      'Doubled = never graduated but the curve later reached 2× its 60 s market cap: the cohort an entry rule would also catch.'] };
}

// ---------- post-graduation stage (0–6 h): DexScreener series of watched graduates ----------
export function postgrad({ days = 14, lines = 300 } = {}) {
  return memo(`post:${days}:${lines}`, 5 * 60000, () => {
    const since = Date.now() - days * DAY;
    const rows = db.prepare(`SELECT s.mint, s.ts, s.price, s.mcap, s.liq, s.price_6h p6, s.max_6h mx6, s.censored c, s.labeled l, w.symbol, w.added_at aa, w.dropped_reason dr
      FROM grad_snapshots s JOIN grad_watch w ON w.mint = s.mint WHERE w.added_at > ? AND s.price > 0 ORDER BY s.mint, s.ts`).all(since);
    const by = new Map();
    for (const x of rows) { let m = by.get(x.mint); if (!m) { m = { mint: x.mint, symbol: x.symbol, aa: x.aa, first: x, pts: [], dr: x.dr }; by.set(x.mint, m); } m.pts.push(x); }
    const toks = [];
    for (const m of by.values()) {
      const f = m.first; if (!f.l || f.c) continue; // the first snapshot must be labeled and not censored to know the 6 h outcome
      const p0 = f.price, mc0 = f.mcap || null;
      const path = []; const seen = new Set();
      for (const p of m.pts) { const off = Math.round((p.ts - f.ts) / 600000) * 10; if (off < 0 || off > 360 || seen.has(off)) continue; seen.add(off); path.push([off, p.price / p0, p.mcap || null]); }
      if (path.length < 3) continue;
      const out6 = f.p6 == null ? null : f.p6 / p0, mx6 = f.mx6 == null ? null : f.mx6 / p0;
      const cohort = out6 == null ? 'unknown' : out6 <= 0.02 ? 'dead' : out6 >= 2 ? 'runner' : out6 >= 1 ? 'held' : 'faded';
      toks.push({ mint: m.mint, symbol: m.symbol, aa: m.aa, mcap0: mc0, liq0: f.liq, out6: r(out6, 3), mx6: r(mx6, 3), cohort, path });
    }
    const offs = []; for (let o = 0; o <= 360; o += 10) offs.push(o);
    const band = (set) => offs.map((o) => { const vals = []; for (const t of set) { const p = t.path.find((x) => x[0] === o); if (p) vals.push(p[1]); } return { t: o, ...qs(vals) }; });
    const C = { runner: 'Ran ≥ 2× in 6 h', held: 'Held above entry', faded: 'Faded below entry', dead: 'Dead (≤ 2% left)' };
    const cohorts = {}; for (const [k, label] of Object.entries(C)) { const set = toks.filter((t) => t.cohort === k); cohorts[k] = { label, n: set.length, band: band(set) }; }
    const pick = (k, n) => toks.filter((t) => t.cohort === k).sort((a, b) => b.aa - a.aa).slice(0, n).map((t) => ({ mint: t.mint, symbol: t.symbol, cohort: t.cohort, out6: t.out6, mx6: t.mx6, mcap0: r(t.mcap0, 0), path: t.path.map((p) => [p[0], r(p[1], 4)]) }));
    const all = band(toks);
    return { days, generatedAt: Date.now(), n: toks.length, offsets: offs, cohorts, all, lines: { runner: pick('runner', lines), held: pick('held', Math.min(120, lines)), faded: pick('faded', Math.min(120, lines)), dead: pick('dead', Math.min(80, lines)) },
      mix: Object.fromEntries(Object.keys(C).map((k) => [k, { n: cohorts[k].n, pct: toks.length ? r((cohorts[k].n / toks.length) * 100, 1) : null }])),
      notes: ['Price multiple versus the first 10-minute snapshot after the pool appeared (DexScreener USD price). Cohort = where the price stood 6 h later.',
        'Right-censored tokens (evicted or aged out before 6 h) are excluded rather than counted as losses. Restart-safe since the 2026-10-18 audit fix.'] };
  });
}

// ---------- features: what separates graduates ----------
export const NUMERIC = ['mcapSol', 'progressPct', 'netSol', 'netSolPerMin', 'flow60Sol', 'uniqueBuyers', 'buyers60', 'buyersPerMin', 'buySellRatio', 'medianBuySol', 'tinyBuyShare', 'top10Pct', 'bundlePct',
  'creatorHoldPct', 'creatorSoldPct', 'holders', 'repeatTradeShare', 'smartBuyers', 'drawdownPct', 'secSinceTrade', 'initialBuySol', 'creatorLaunches', 'creatorGraduations', 'creatorRugs', 'buyVolSol', 'sellVolSol', 'buys', 'sells'];
export const LABELS = { mcapSol: 'market cap (SOL)', progressPct: 'curve progress %', netSol: 'net SOL in', netSolPerMin: 'net SOL / min', flow60Sol: '60 s net inflow (SOL)', uniqueBuyers: 'unique buyers', buyers60: 'buyers, last 60 s', buyersPerMin: 'buyers / min',
  buySellRatio: 'buy : sell ratio', medianBuySol: 'median buy (SOL)', tinyBuyShare: 'tiny-buy share', top10Pct: 'top-10 holders %', bundlePct: 'bundle %', creatorHoldPct: 'creator hold %', creatorSoldPct: 'creator sold %', holders: 'holders', repeatTradeShare: 'repeat-trade share',
  smartBuyers: 'smart-wallet buyers', drawdownPct: 'drawdown from peak %', secSinceTrade: 'seconds since last trade', initialBuySol: 'creator initial buy (SOL)', creatorLaunches: 'creator launches', creatorGraduations: 'creator graduations', creatorRugs: 'creator rugs', buyVolSol: 'buy volume (SOL)', sellVolSol: 'sell volume (SOL)', buys: 'buys', sells: 'sells',
  score: 'score', tGrad: 'time to graduation (min)' };

function featRows(cp, days) {
  return memo(`feat:${cp}:${days}`, 5 * 60000, () => {
    const since = Date.now() - days * DAY;
    const rows = db.prepare(`SELECT s.mint, s.mcap, s.max_mcap_after mx, s.graduated_after g, s.score, s.features f, t.created_at ca, t.symbol FROM snapshots s JOIN tokens t ON t.mint = s.mint
      WHERE s.checkpoint = ? AND s.features IS NOT NULL AND s.max_mcap_after IS NOT NULL AND t.finalized = 1 AND COALESCE(t.gap, 0) = 0 AND t.created_at > ? AND s.mint NOT IN (${NONSOL})`).all(cp, since);
    return rows.map((x) => { let f = {}; try { f = JSON.parse(x.f) || {}; } catch { /* skip */ } return { mint: x.mint, symbol: x.symbol, ca: x.ca, g: x.g ? 1 : 0, x2: x.mcap > 0 && x.mx >= 2 * x.mcap ? 1 : 0, x3: x.mcap > 0 && x.mx >= 3 * x.mcap ? 1 : 0, mult: x.mcap > 0 ? x.mx / x.mcap : null, f: { ...f, score: x.score } }; });
  });
}
const outcomeOf = (row, o) => (o === 'x2' ? row.x2 : o === 'x3' ? row.x3 : row.g);
function deciles(rows, feature, outcome) {
  const vals = rows.map((x) => [Number(x.f[feature]), x]).filter(([v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  if (vals.length < 50) return null;
  const k = 10, out = [];
  for (let i = 0; i < k; i++) {
    const a = Math.floor((i * vals.length) / k), b = Math.floor(((i + 1) * vals.length) / k), slice = vals.slice(a, b);
    if (!slice.length) continue;
    const hits = slice.filter(([, x]) => outcomeOf(x, outcome)).length;
    out.push({ d: i + 1, lo: r(slice[0][0], 3), hi: r(slice[slice.length - 1][0], 3), n: slice.length, hits, rate: r((hits / slice.length) * 100, 2), ...wilson(hits, slice.length) });
  }
  return out;
}
export function features({ cp = 60, days = 14, outcome = 'grad' } = {}) {
  const rows = featRows(cp, days);
  const base = rows.length ? rows.filter((x) => outcomeOf(x, outcome)).length / rows.length : 0;
  const ranked = [];
  for (const feat of [...NUMERIC, 'score']) {
    const d = deciles(rows, feat, outcome); if (!d) continue;
    const top = d[d.length - 1], bot = d[0];
    const rho = spearman(d.map((x) => x.d), d.map((x) => x.rate));
    const best = d.reduce((m, x) => (x.rate > m.rate ? x : m), d[0]);
    ranked.push({ feature: feat, label: LABELS[feat] || feat, n: d.reduce((s, x) => s + x.n, 0), topRate: top.rate, bottomRate: bot.rate, topLift: base ? r(top.rate / (base * 100), 2) : null, bottomLift: base ? r(bot.rate / (base * 100), 2) : null,
      bestDecile: best.d, bestRate: best.rate, bestLift: base ? r(best.rate / (base * 100), 2) : null, bestLo: r(best.lo, 2), monotone: r(rho, 2), direction: rho > 0.3 ? 'higher is better' : rho < -0.3 ? 'lower is better' : 'not monotone', deciles: d });
  }
  ranked.sort((a, b) => (b.bestLo ?? 0) - (a.bestLo ?? 0));
  // reject families vs outcome at this checkpoint (all SOL tokens, not just the pass set)
  const fam = db.prepare(`SELECT s.reject rj, COUNT(*) n, SUM(s.graduated_after) g, SUM(CASE WHEN s.mcap > 0 AND s.max_mcap_after >= 2 * s.mcap THEN 1 ELSE 0 END) x2 FROM snapshots s JOIN tokens t ON t.mint = s.mint
    WHERE s.checkpoint = ? AND s.max_mcap_after IS NOT NULL AND t.finalized = 1 AND COALESCE(t.gap, 0) = 0 AND t.created_at > ? AND s.mint NOT IN (${NONSOL}) GROUP BY s.reject`).all(cp, Date.now() - days * DAY);
  const famMap = new Map();
  for (const x of fam) { const k = famOf(x.rj); const m = famMap.get(k) || { family: k, n: 0, g: 0, x2: 0 }; m.n += x.n; m.g += x.g || 0; m.x2 += x.x2 || 0; famMap.set(k, m); }
  const famRows = [...famMap.values()].map((m) => ({ ...m, gradRate: r((m.g / m.n) * 100, 2), x2Rate: r((m.x2 / m.n) * 100, 2), ...wilson(m.g, m.n) })).sort((a, b) => b.n - a.n);
  const totalG = famRows.reduce((s, x) => s + x.g, 0), passG = famRows.find((x) => x.family === '(pass)')?.g || 0;
  return { cp, days, outcome, generatedAt: Date.now(), n: rows.length, baseRatePct: r(base * 100, 2), ranked, rejectFamilies: famRows, gradsLostToRejectsPct: totalG ? r(((totalG - passG) / totalG) * 100, 1) : null, totalGrads: totalG,
    notes: [`Feature vectors exist only for tokens the scorer did not reject at ${cp} s (${rows.length} tokens); the reject-family table covers every SOL-quoted token at that checkpoint.`,
      'Deciles are equal-count bins of the feature; a decile rate well above the base rate with a lower bound (Wilson 95%) still above base is the only kind of signal worth testing as a rule.'] };
}
function spearman(a, b) {
  const rank = (v) => { const s = [...v].map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const out = []; s.forEach(([, i], k) => (out[i] = k + 1)); return out; };
  const ra = rank(a), rb = rank(b), n = a.length; if (n < 3) return 0;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db2 = 0; for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db2 += (rb[i] - mb) ** 2; }
  return da && db2 ? num / Math.sqrt(da * db2) : 0;
}

// ---------- rule tester ----------
const OPS = { gte: (v, t) => v >= t, lte: (v, t) => v <= t, gt: (v, t) => v > t, lt: (v, t) => v < t };
export function testRule({ cp = 60, days = 14, feature, op = 'gte', threshold, outcome = 'grad', and = [] } = {}) {
  if (!feature || !(feature in LABELS)) throw new Error('unknown feature');
  if (!(op in OPS)) throw new Error('unknown operator');
  const thr = Number(threshold); if (!Number.isFinite(thr)) throw new Error('threshold must be a number');
  const rows = featRows(cp, days);
  const conds = [{ feature, op, thr }, ...and.filter((c) => c && c.feature in LABELS && c.op in OPS && Number.isFinite(Number(c.threshold))).map((c) => ({ feature: c.feature, op: c.op, thr: Number(c.threshold) }))];
  const match = (x) => conds.every((c) => { const v = Number(x.f[c.feature]); return Number.isFinite(v) && OPS[c.op](v, c.thr); });
  const stats = (set) => { const n = set.length, k = set.filter((x) => outcomeOf(x, outcome)).length; const mults = set.map((x) => Math.min(5, x.mult ?? 0)); return { n, hits: k, ratePct: n ? r((k / n) * 100, 2) : null, ...wilson(k, n), avgCappedMult: n ? r(mults.reduce((s, v) => s + v, 0) / n, 3) : null }; };
  const sel = rows.filter(match), all = stats(rows), s = stats(sel);
  const lift = all.ratePct ? r(s.ratePct / all.ratePct, 2) : null;
  // time split: first half of the window versus second half, by launch time
  const sorted = [...rows].sort((a, b) => a.ca - b.ca), mid = sorted[Math.floor(sorted.length / 2)]?.ca;
  const halves = [sorted.filter((x) => x.ca < mid), sorted.filter((x) => x.ca >= mid)].map((h, i) => { const hs = stats(h.filter(match)), hb = stats(h); return { half: i ? 'later half' : 'earlier half', from: h[0]?.ca ?? null, to: h[h.length - 1]?.ca ?? null, selected: hs, base: hb, lift: hb.ratePct ? r(hs.ratePct / hb.ratePct, 2) : null }; });
  const holdsUp = halves.every((h) => h.selected.n >= 20 && h.lift != null && h.lift > 1 && h.selected.lo != null && h.selected.lo > (h.base.ratePct || 0));
  const dec = deciles(rows, feature, outcome);
  const verdict = s.n < 30 ? 'too few tokens match (need ≥ 30 in each half of the window before this means anything)' : holdsUp ? 'lift present in both halves with the lower bound above base: worth a pre-registered paper book, not a rule yet' : lift != null && lift > 1 ? 'lift in the pooled window but not in both halves: treat as noise until more data arrives' : 'no lift: the rule selects tokens that do no better than the field';
  const opTxt = { gte: '≥', lte: '≤', gt: '>', lt: '<' };
  const ruleTxt = conds.map((c) => `${LABELS[c.feature] || c.feature} ${opTxt[c.op]} ${c.thr}`).join(' AND ');
  const snippet = `// candidate (NOT applied; changes the settings fingerprint when it is)\n// at the ${cp} s checkpoint: enter only if ${ruleTxt}\nstrategies.candidate_${feature}: { checkpointSec: ${cp}, require: ${JSON.stringify(conds.map((c) => ({ feature: c.feature, op: c.op, threshold: c.thr })))}, outcome: '${outcome}' }`;
  return { cp, days, outcome, rule: ruleTxt, conds, generatedAt: Date.now(), selected: s, base: all, lift, halves, holdsUp, verdict, deciles: dec, snippet,
    sample: sel.sort((a, b) => b.ca - a.ca).slice(0, 200).map((x) => ({ mint: x.mint, symbol: x.symbol, ca: x.ca, g: x.g, x2: x.x2, mult: r(x.mult, 2), value: r(Number(x.f[feature]), 3) })),
    notes: ['Outcome rates are label rates (graduated, or the curve later reached 2×/3× the checkpoint market cap), not paper P&L: no entry delay, fee, slippage or exit rule is applied here. A real test is a pre-registered book.',
      'The two halves are a time split on launch time; a rule found on the pooled window will usually look better pooled than on either half.'] };
}

export function overview({ days = 14 } = {}) {
  const c = curves({ days, lines: 0 }), f = features({ cp: 60, days });
  const p = postgrad({ days, lines: 0 });
  const best = f.ranked[0] || null;
  return { days, generatedAt: Date.now(), tokens: c.n, grads: c.cohorts.grad.n, gradRatePct: c.n ? r((c.cohorts.grad.n / c.n) * 100, 2) : null, x2: c.cohorts.x2.n, timeToGrad: c.timeToGrad, gradsLostToRejectsPct: f.gradsLostToRejectsPct,
    best: best ? { feature: best.feature, label: best.label, bestLift: best.bestLift, bestDecile: best.bestDecile, direction: best.direction } : null, post: { n: p.n, mix: p.mix }, cfg: config.paper?.rules || null };
}

// ---------- drill-downs (served through /api/drill/studio_* on the worker thread) ----------
const C = (h, k, fmt = 'text', o = {}) => ({ h, k, fmt, ...o });
const pctFmt = (x) => (x == null ? '–' : `${x.toFixed(2)}%`);
export function drill({ key }) {
  const [kind, ...rest] = String(key).split(':');
  const days = Number(rest.find((x) => /^d\d+$/.test(x))?.slice(1)) || 14;
  const tokRow = (t) => ({ ...t, drill: `tok:${t.mint}`, label: t.symbol || t.mint.slice(0, 6) });
  if (kind === 'studio_grads' || kind === 'studio_x2' || kind === 'studio_field') {
    const c = curves({ days, lines: 600 });
    const set = kind === 'studio_grads' ? c.lines.grad : kind === 'studio_x2' ? c.lines.x2 : c.lines.non;
    const label = kind === 'studio_grads' ? 'Graduated' : kind === 'studio_x2' ? 'Doubled without graduating' : 'Did not graduate (sample)';
    const rows = set.map((t) => tokRow({ mint: t.mint, symbol: t.symbol, ca: t.ca, m30: t.path[0]?.[1], m60: t.path[1]?.[1], m120: t.path[2]?.[1], m300: t.path[4]?.[1], peak: t.peak, tGradMin: t.tGradSec != null ? t.tGradSec / 60 : null, rejectedAt: t.rejectedAt, firstReject: t.firstReject }));
    return { title: `${label} · last ${days} days`, explain: `Market cap in SOL at each checkpoint for every token in the cohort (newest first). ${c.notes.join(' ')}`,
      stats: [['Tokens', rows.length, 'num'], ['Cohort size', kind === 'studio_grads' ? c.cohorts.grad.n : kind === 'studio_x2' ? c.cohorts.x2.n : c.cohorts.non.n, 'num'], ['Median at 60 s', (kind === 'studio_grads' ? c.cohorts.grad : kind === 'studio_x2' ? c.cohorts.x2 : c.cohorts.non).band[1].p50, 'num']],
      tables: [{ title: 'Tokens', cols: [C('Launched', 'ca', 'time'), C('Token', 'symbol', 'token'), C('30 s', 'm30', 'num'), C('60 s', 'm60', 'num'), C('2 min', 'm120', 'num'), C('5 min', 'm300', 'num'), C('Peak', 'peak', 'num'), C('Graduated after (min)', 'tGradMin', 'num'), C('First reject', 'firstReject'), C('Rejected at (s)', 'rejectedAt', 'num')], rows }] };
  }
  if (kind === 'studio_ttg') {
    const c = curves({ days, lines: 600 });
    return { title: `Time to graduation · last ${days} days`, explain: `Minutes from launch to the curve filling, for the ${c.timeToGrad.n} SOL-quoted graduates with complete labels. Censored at 1 h (see notes). Median ${c.timeToGrad.p50} min.`,
      stats: [['Graduates', c.timeToGrad.n, 'num'], ['p25', c.timeToGrad.p25, 'min'], ['Median', c.timeToGrad.p50, 'min'], ['p75', c.timeToGrad.p75, 'min']],
      series: { label: 'Graduates per time-to-graduation bin', kind: 'bar', fmt: 'num', points: c.timeToGrad.hist.map((h, i) => [i, h.n]) },
      tables: [{ title: 'Distribution', cols: [C('Bin', 'label'), C('Graduates', 'n', 'num')], rows: c.timeToGrad.hist }, { title: 'Fastest graduates', cols: [C('Launched', 'ca', 'time'), C('Token', 'symbol', 'token'), C('Minutes', 'tGradMin', 'num'), C('60 s mcap', 'm60', 'num')], rows: c.lines.grad.filter((t) => t.tGradSec != null).sort((a, b) => a.tGradSec - b.tGradSec).slice(0, 100).map((t) => tokRow({ mint: t.mint, symbol: t.symbol, ca: t.ca, tGradMin: t.tGradSec / 60, m60: t.path[1]?.[1] })) }] };
  }
  if (kind === 'studio_rejects') {
    const cp = Number(rest[0]) || 60; const f = features({ cp, days });
    return { title: `Reject rules versus graduation · ${cp} s checkpoint`, explain: `Every SOL-quoted token with complete labels, grouped by the reason the scorer rejected it at ${cp} s. ${f.gradsLostToRejectsPct}% of the ${f.totalGrads} graduates were in a rejected group at this checkpoint. A family whose graduation rate beats the pass group is a rule that is throwing away winners (whether those winners were tradeable is a separate question the paper books answer).`,
      stats: [['Graduates lost to rejects', f.gradsLostToRejectsPct, 'pct'], ['Pass-group grad rate', f.rejectFamilies.find((x) => x.family === '(pass)')?.gradRate, 'pct'], ['Tokens', f.rejectFamilies.reduce((s, x) => s + x.n, 0), 'num']],
      tables: [{ title: 'By reject family', cols: [C('Family', 'family'), C('Tokens', 'n', 'num'), C('Graduates', 'g', 'num'), C('Grad rate', 'gradRate', 'pct'), C('CI low', 'lo', 'pct'), C('CI high', 'hi', 'pct'), C('Doubled', 'x2', 'num'), C('2× rate', 'x2Rate', 'pct')], rows: f.rejectFamilies }] };
  }
  if (kind === 'studio_feature') {
    const [feature, cpS, outcome] = rest; const cp = Number(cpS) || 60; const f = features({ cp, days, outcome: outcome || 'grad' });
    const x = f.ranked.find((y) => y.feature === feature); if (!x) return { title: 'Feature', explain: 'No decile table for this feature (fewer than 50 tokens carry it).', tables: [] };
    return { title: `${x.label} · ${cp} s · ${outcome === 'x2' ? 'doubled' : outcome === 'x3' ? 'tripled' : 'graduated'} rate by decile`, explain: `${x.n} unrejected tokens split into ten equal-count bins by ${x.label}. Base rate ${pctFmt(f.baseRatePct)}. Best decile ${x.bestDecile} at ${pctFmt(x.bestRate)} (lift ${x.bestLift}×, Wilson lower bound ${pctFmt(x.bestLo)}). ${x.direction}. ${f.notes[1]}`,
      stats: [['Tokens', x.n, 'num'], ['Base rate', f.baseRatePct, 'pct'], ['Best decile', x.bestDecile, 'num'], ['Best-decile rate', x.bestRate, 'pct'], ['Lift', x.bestLift, 'mult'], ['Monotone (ρ)', x.monotone, 'num']],
      series: { label: `${outcome === 'x2' ? '2×' : outcome === 'x3' ? '3×' : 'graduation'} rate by decile (%)`, kind: 'bar', fmt: 'pct', points: x.deciles.map((d) => [d.d, d.rate]) },
      tables: [{ title: 'Deciles', cols: [C('Decile', 'd', 'num'), C('From', 'lo', 'num'), C('To', 'hi', 'num'), C('Tokens', 'n', 'num'), C('Hits', 'hits', 'num'), C('Rate', 'rate', 'pct'), C('CI low', 'lo', 'pct', { k: 'lo' }), C('CI high', 'hi', 'pct')], rows: x.deciles.map((d) => ({ ...d, lo: d.lo, hi: d.hi })) }] };
  }
  if (kind === 'studio_rule') {
    const [feature, op, thr, cpS, outcome] = rest; const t = testRule({ cp: Number(cpS) || 60, days, feature, op, threshold: thr, outcome: outcome || 'grad' });
    return { title: `Rule: ${t.rule}`, explain: `${t.verdict}. ${t.notes.join(' ')}`,
      stats: [['Matched', t.selected.n, 'num'], ['Hit rate', t.selected.ratePct, 'pct'], ['Base rate', t.base.ratePct, 'pct'], ['Lift', t.lift, 'mult'], ['Earlier-half lift', t.halves[0]?.lift, 'mult'], ['Later-half lift', t.halves[1]?.lift, 'mult']],
      tables: [{ title: 'Time split', cols: [C('Window', 'half'), C('From', 'from', 'time'), C('To', 'to', 'time'), C('Matched', 'n', 'num'), C('Hits', 'hits', 'num'), C('Rate', 'rate', 'pct'), C('Base', 'base', 'pct'), C('Lift', 'lift', 'mult')], rows: t.halves.map((h) => ({ half: h.half, from: h.from, to: h.to, n: h.selected.n, hits: h.selected.hits, rate: h.selected.ratePct, base: h.base.ratePct, lift: h.lift })) },
        { title: 'Matched tokens (newest 200)', cols: [C('Launched', 'ca', 'time'), C('Token', 'symbol', 'token'), C('Value', 'value', 'num'), C('Graduated', 'g', 'num'), C('Doubled', 'x2', 'num'), C('Max multiple', 'mult', 'mult')], rows: t.sample.map(tokRow) }] };
  }
  if (kind === 'studio_post') {
    const cohort = rest[0] || 'runner'; const p = postgrad({ days, lines: 600 });
    const set = p.lines[cohort] || []; const label = p.cohorts[cohort]?.label || cohort;
    return { title: `${label} · after graduation · last ${days} days`, explain: `${p.cohorts[cohort]?.n ?? 0} watched graduates whose price 6 h after the first snapshot put them in this group. ${p.notes.join(' ')}`,
      stats: [['Tokens', p.cohorts[cohort]?.n ?? 0, 'num'], ['Share of graduates', p.mix[cohort]?.pct, 'pct'], ['Median multiple at 1 h', p.cohorts[cohort]?.band.find((b) => b.t === 60)?.p50, 'mult'], ['Median multiple at 6 h', p.cohorts[cohort]?.band.find((b) => b.t === 360)?.p50, 'mult']],
      tables: [{ title: 'Tokens', cols: [C('Token', 'symbol', 'token'), C('First mcap', 'mcap0', 'usd'), C('Best in 6 h', 'mx6', 'mult'), C('At 6 h', 'out6', 'mult'), C('Points', 'pts', 'num')], rows: set.map((t) => ({ ...t, pts: t.path.length, drill: `tok:${t.mint}`, label: t.symbol, kind: 'grad' })) }] };
  }
  return null;
}
