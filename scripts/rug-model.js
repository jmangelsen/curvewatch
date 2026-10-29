// Provisional rug-risk model v0. Offline and read-only.
// Joins a label CSV onto a database *copy* with the same rules as scripts/join-labels.js.
// Does not import the scorer, the paper engine, or config. Does not place trades.
// Does not call a model API. Small-n output is descriptive, not a kill-rule PASS.
//
//   node scripts/rug-model.js --db /path/to/copy.db --csv winners.csv --csv rug-cases.csv [--out report.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { assertCopy, dedupe, joinOne, rowsOf } from './join-labels.js';

export const DISCLAIMER = 'Provisional description of a small labeled sheet. Not a kill-rule PASS. Not an edge. Not wired into paper or live trading.';
const FEATURES = ['snipeConcentration', 'bundleFunderOverlap', 'devHoldings', 'holderVelocity', 'timeToBondMin'];

function args(argv) {
  const o = { db: null, csv: [], out: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--db') o.db = argv[++i];
    else if (a === '--csv') o.csv.push(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else { console.error(`unknown argument ${a}`); process.exit(2); }
  }
  return o;
}

function tableExists(database, name) {
  return !!database.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/%/g, '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function grab(text, re) {
  const m = String(text || '').match(re);
  return m ? num(m[1]) : null;
}

function classify(row) {
  if (row.conflict) return 'conflict';
  const files = row.sourceFiles || [];
  const fromRug = files.some((f) => /rug/i.test(f));
  const fromWin = files.some((f) => /winner/i.test(f));
  if (fromRug && fromWin) return 'conflict';
  if (fromRug) return 'rug';
  if (fromWin) return 'winner';
  return 'unknown';
}

function chainOf(row) {
  return String(row.chain || 'solana').trim().toLowerCase();
}

function funderOverlap(database, mint, createdAt) {
  if (!tableExists(database, 'bundle_funders') || !tableExists(database, 'trades')) return { value: null, source: null };
  const parents = database.prepare('SELECT wallet, funder FROM bundle_funders').all();
  if (!parents.length) return { value: null, source: null };
  const map = new Map(parents.map((r) => [r.wallet, r.funder]));
  const sql = createdAt
    ? database.prepare(`SELECT DISTINCT wallet FROM trades WHERE mint=? AND wallet IS NOT NULL AND ts<=?`)
    : null;
  const wallets = (sql ? sql.all(mint, createdAt + 10_000) : database.prepare(`SELECT DISTINCT wallet FROM trades WHERE mint=? AND wallet IS NOT NULL`).all(mint))
    .map((r) => r.wallet).filter((w) => map.has(w));
  if (wallets.length < 2) return { value: wallets.length ? 0 : null, source: wallets.length ? 'bundle_funders' : null };
  const by = new Map();
  for (const w of wallets) by.set(map.get(w), (by.get(map.get(w)) || 0) + 1);
  let shared = 0;
  for (const n of by.values()) if (n >= 2) shared += n;
  return { value: shared / wallets.length, source: 'bundle_funders' };
}

function holderVelocity(database, mint) {
  if (!tableExists(database, 'holder_history')) return { value: null, source: null };
  const rows = database.prepare(`SELECT ts, holders FROM holder_history WHERE mint=? AND holders IS NOT NULL ORDER BY ts`).all(mint);
  if (rows.length < 2) return { value: null, source: null };
  const t0 = rows[0].ts;
  const window = rows.filter((r) => r.ts <= t0 + 3 * 3600_000);
  const last = window[window.length - 1];
  if (!last || last.ts <= t0) return { value: null, source: null };
  const hours = (last.ts - t0) / 3600_000;
  if (!(hours > 0)) return { value: null, source: null };
  return { value: (last.holders - rows[0].holders) / hours, source: 'holder_history' };
}

function bondMinutes(token, row) {
  const a = Number(token?.created_at);
  const b = Number(token?.graduated_at);
  if (a > 0 && b > a) return { value: (b - a) / 60_000, source: 'tokens' };
  const t0 = Date.parse(row.label_time || '');
  const t1 = Date.parse(row.bond_time || '');
  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) return { value: (t1 - t0) / 60_000, source: 'csv' };
  return { value: null, source: null };
}

export function featuresOf(row, database) {
  const notes = `${row.notes || ''} ${row.extras?.early_signals || ''}`;
  const extra = row.extras || {};
  const grad = row.graduate || {};
  const createdAt = Number(row.token?.created_at) || null;
  const bundler = num(extra.bundler_pct) ?? grab(notes, /bundler pct\s+([0-9.]+)\s*%/i) ?? num(grad.curve_bundle_pct);
  const biggest = grab(notes, /biggest first buyer\s+([0-9.]+)\s*%/i);
  const snipe = bundler != null ? { value: bundler, source: extra.bundler_pct ? 'csv.bundler_pct' : (grab(notes, /bundler pct/i) != null ? 'notes.bundler_pct' : 'grad_watch.curve_bundle_pct') }
    : (biggest != null ? { value: biggest, source: 'notes.biggest_first_buyer' } : { value: null, source: null });
  const overlap = database ? funderOverlap(database, row.mint, createdAt) : { value: null, source: null };
  let dev = { value: null, source: null };
  // A bare dev_sold flag is not a percent. Leaving it missing avoids treating "sold" as a zero bag.
  if (num(grad.curve_creator_hold_pct) != null) dev = { value: num(grad.curve_creator_hold_pct), source: 'grad_watch.curve_creator_hold_pct' };
  else {
    const insider = grab(notes, /insiders (?:still|now|sold to)\s+([0-9.]+)\s*%/i);
    if (insider != null) dev = { value: insider, source: 'notes.insiders' };
  }
  const vel = database ? holderVelocity(database, row.mint) : { value: null, source: null };
  const bond = bondMinutes(row.token, row);
  const values = {
    snipeConcentration: snipe.value,
    bundleFunderOverlap: overlap.value,
    devHoldings: dev.value,
    holderVelocity: vel.value,
    timeToBondMin: bond.value,
  };
  const sources = {
    snipeConcentration: snipe.source,
    bundleFunderOverlap: overlap.source,
    devHoldings: dev.source,
    holderVelocity: vel.source,
    timeToBondMin: bond.source,
  };
  return { values, sources };
}

function sigmoid(z) {
  const x = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-x));
}

function fitUnivariate(xs, ys) {
  let a = 0, b = 0;
  for (let iter = 0; iter < 30; iter++) {
    let g0 = 0, g1 = 0, h00 = 1e-4, h01 = 0, h11 = 1e-4;
    for (let i = 0; i < xs.length; i++) {
      const p = sigmoid(a + b * xs[i]);
      const w = Math.max(1e-6, p * (1 - p));
      g0 += p - ys[i];
      g1 += (p - ys[i]) * xs[i];
      h00 += w;
      h01 += w * xs[i];
      h11 += w * xs[i] * xs[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(Math.abs(det) > 1e-12)) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a -= da;
    b -= db;
    if (Math.abs(b) > 20) b = Math.sign(b) * 20;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  return { intercept: a, coef: b };
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function auc(scores, ys) {
  let pos = 0, neg = 0, good = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] == null) continue;
    if (ys[i] === 1) pos++; else neg++;
  }
  if (!pos || !neg) return null;
  for (let i = 0; i < scores.length; i++) {
    if (ys[i] !== 1 || scores[i] == null) continue;
    for (let j = 0; j < scores.length; j++) {
      if (ys[j] !== 0 || scores[j] == null) continue;
      if (scores[i] > scores[j]) good += 1;
      else if (scores[i] === scores[j]) good += 0.5;
    }
  }
  return good / (pos * neg);
}

function featureStats(rows) {
  return FEATURES.map((name) => {
    const w = rows.filter((r) => r.class === 'winner' && r.features[name] != null).map((r) => r.features[name]);
    const g = rows.filter((r) => r.class === 'rug' && r.features[name] != null).map((r) => r.features[name]);
    const mw = mean(w), mg = mean(g);
    return {
      name,
      nWinner: w.length,
      nRug: g.length,
      missing: rows.filter((r) => (r.class === 'winner' || r.class === 'rug') && r.features[name] == null).length,
      meanWinner: mw,
      meanRug: mg,
      diffRugMinusWinner: mw != null && mg != null ? mg - mw : null,
    };
  });
}

function scoreRows(train, test) {
  const models = {};
  for (const name of FEATURES) {
    const xs = [], ys = [];
    for (const row of train) {
      const x = row.features[name];
      if (x == null) continue;
      xs.push(x);
      ys.push(row.y);
    }
    const classes = new Set(ys);
    if (xs.length < 4 || classes.size < 2) { models[name] = null; continue; }
    models[name] = fitUnivariate(xs, ys);
  }
  const apply = (row) => {
    const ps = [];
    for (const name of FEATURES) {
      const m = models[name];
      const x = row.features[name];
      if (!m || x == null) continue;
      ps.push(sigmoid(m.intercept + m.coef * x));
    }
    return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
  };
  const scored = (list) => list.map((row) => ({ ...row, pRug: apply(row) }));
  const trainS = scored(train);
  const testS = scored(test);
  const metrics = (list) => {
    const used = list.filter((r) => r.pRug != null);
    const ys = used.map((r) => r.y);
    const ps = used.map((r) => r.pRug);
    const brier = used.length ? mean(used.map((r) => (r.pRug - r.y) ** 2)) : null;
    return {
      n: used.length,
      nWinner: used.filter((r) => r.y === 0).length,
      nRug: used.filter((r) => r.y === 1).length,
      auc: auc(ps, ys),
      brier,
      meanScoreWinners: mean(used.filter((r) => r.y === 0).map((r) => r.pRug)),
      meanScoreRugs: mean(used.filter((r) => r.y === 1).map((r) => r.pRug)),
    };
  };
  return {
    method: 'mean-of-univariate-logistics',
    models: Object.fromEntries(FEATURES.map((name) => [name, models[name]])),
    train: metrics(trainS),
    test: metrics(testS),
    scored: [...trainS, ...testS],
  };
}

function whenOf(row) {
  const t = Date.parse(row.label_time || '');
  if (Number.isFinite(t)) return t;
  const c = Number(row.token?.created_at);
  return Number.isFinite(c) ? c : 0;
}

export function buildReport(database, labels) {
  const prepared = labels.map((row) => {
    const cls = classify(row);
    const chain = chainOf(row);
    const feat = featuresOf(row, database);
    const usable = cls === 'winner' || cls === 'rug';
    const solana = chain === 'solana' || chain === '';
    return {
      mint: row.mint,
      symbol: row.symbol || null,
      class: cls,
      chain,
      excluded: !usable || !solana,
      excludeReason: !solana ? 'non-solana' : (cls === 'conflict' ? 'conflict' : (usable ? null : 'unlabeled')),
      label_time: row.label_time || null,
      matched: !!row.matched,
      features: feat.values,
      sources: feat.sources,
      y: cls === 'rug' ? 1 : 0,
      t: whenOf(row),
    };
  });
  const eligible = prepared.filter((r) => !r.excluded && FEATURES.some((name) => r.features[name] != null));
  const sorted = [...eligible].sort((a, b) => a.t - b.t || a.mint.localeCompare(b.mint));
  let train = sorted, test = [], holdoutNote = 'Holdout withheld: fewer than 4 scored rows. The fit below is descriptive on every scored row.';
  if (sorted.length >= 4) {
    const cut = Math.max(1, Math.floor(sorted.length * 0.7));
    train = sorted.slice(0, Math.min(cut, sorted.length - 1));
    test = sorted.slice(train.length);
    holdoutNote = 'Time-ordered 70/30 split. Ties on the clock break by mint. Provisional: small n, missing features, and a sheet that mixes early and later observations.';
  }
  const fit = scoreRows(train, test);
  const byMint = new Map(fit.scored.map((r) => [r.mint, r]));
  return {
    provisional: true,
    disclaimer: DISCLAIMER,
    readonly: true,
    n: {
      rows: prepared.length,
      winners: prepared.filter((r) => r.class === 'winner' && !r.excluded).length,
      rugs: prepared.filter((r) => r.class === 'rug' && !r.excluded).length,
      conflicts: prepared.filter((r) => r.excludeReason === 'conflict').length,
      excludedChain: prepared.filter((r) => r.excludeReason === 'non-solana').length,
      scored: eligible.length,
      unscored: prepared.filter((r) => !r.excluded && !FEATURES.some((name) => r.features[name] != null)).length,
    },
    features: featureStats(prepared.filter((r) => !r.excluded)),
    scorer: { method: fit.method, models: fit.models, features: FEATURES },
    holdout: { note: holdoutNote, train: fit.train, test: fit.test },
    rows: prepared.map((r) => {
      const s = byMint.get(r.mint);
      return {
        mint: r.mint, symbol: r.symbol, class: r.class, chain: r.chain, excluded: r.excluded, excludeReason: r.excludeReason,
        matched: r.matched, features: r.features, sources: r.sources, pRug: s?.pRug ?? null, provisional: true,
      };
    }),
  };
}

export function main(argv = process.argv) {
  const o = args(argv);
  if (o.help || !o.db || !o.csv.length) {
    console.log(`rug-model v0 — provisional, read-only scorer on a label CSV joined to a DB copy.

  node scripts/rug-model.js --db <copy.db> --csv <winners.csv> [--csv <rug-cases.csv>] [--out report.json]

${DISCLAIMER}`);
    process.exit(o.help ? 0 : 2);
  }
  const dbPath = assertCopy(o.db);
  if (!fs.existsSync(dbPath)) { console.error(`no such database ${dbPath}`); process.exit(2); }
  const labels = dedupe(o.csv.flatMap((file) => rowsOf(file)));
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  const joined = labels.map((label) => joinOne(database, label));
  const report = buildReport(database, joined);
  report.db = dbPath;
  database.close();
  const text = JSON.stringify(report, null, 2);
  if (o.out) fs.writeFileSync(o.out, text);
  else process.stdout.write(text + '\n');
  console.error(DISCLAIMER);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
