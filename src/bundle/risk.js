// risk.v1 payload, readonly database copy, and prospective scoring.
// Does not import config.js or db.js, so a backtest does not create ./data or open the live database.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LAUNCH, asTrade, dedupeTrades, detectBundles, labelMajoritySell, mcapOf, progressPct,
} from './detect.js';
import {
  FIT, METHOD, PROSPECTIVE, fitRugModel, judgeProspective, loadModelFile, modelId, predictRange,
} from './model.js';

export const CONTRACT = 'risk.v1';
export const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const DISCLAIMER = 'Risk signal only. A bundle reading is not a guarantee that anyone will sell, and the absence of a reading is not a clearance. Not financial advice.';
export const PRE_REGISTRATION = 'docs/bundle-rug-zone-v1.md';
const PRODUCTION_DB = '/opt/curvewatch/data/curvewatch.db';

export function errorBody(error, message) {
  return { contract: CONTRACT, error, message };
}

function round(x, d) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const p = 10 ** d;
  return Math.round(x * p) / p;
}

function iso(ms) {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function insideDataDir(file) {
  const dataDir = path.resolve(process.cwd(), 'data');
  const rel = path.relative(dataDir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveFile(file) {
  const resolved = path.resolve(file);
  try { return fs.realpathSync(resolved); } catch { return resolved; }
}

export function assertReadableCopy(file) {
  if (!file) {
    const err = new Error('pass --db with a copy of the database');
    err.code = 'USAGE';
    throw err;
  }
  const resolved = resolveFile(file);
  if (resolved === PRODUCTION_DB) {
    const err = new Error('refusing the production database; pass a copy');
    err.code = 'REFUSED';
    throw err;
  }
  if (insideDataDir(resolved) || insideDataDir(path.resolve(file))) {
    const err = new Error('refusing a database inside ./data; pass a copy outside that directory');
    err.code = 'REFUSED';
    throw err;
  }
  return resolved;
}

export function assertWritableOutput(file, dbFile) {
  const resolved = path.resolve(file);
  if (path.resolve(dbFile) === resolved || resolveFile(dbFile) === resolved) {
    const err = new Error('refusing to write the source database');
    err.code = 'REFUSED';
    throw err;
  }
  if (resolved === '/opt/curvewatch' || resolved.startsWith('/opt/curvewatch/')) {
    const err = new Error('refusing to write under /opt/curvewatch');
    err.code = 'REFUSED';
    throw err;
  }
  if (insideDataDir(resolved)) {
    const err = new Error('refusing to write under ./data');
    err.code = 'REFUSED';
    throw err;
  }
  return resolved;
}

export function openReadonly(file) {
  const resolved = assertReadableCopy(file);
  const database = new Database(resolved, { readonly: true, fileMustExist: true });
  database.pragma('query_only = ON');
  return database;
}

function tableExists(database, name) {
  return !!database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

export function readFunders(database) {
  if (!tableExists(database, 'bundle_funders')) return null;
  const map = new Map();
  for (const row of database.prepare('SELECT wallet, funder FROM bundle_funders').iterate()) {
    if (row.wallet && row.funder && row.wallet !== row.funder) map.set(row.wallet, row.funder);
  }
  return map;
}

function inferQuoteOk(trades) {
  let sol = false;
  let non = false;
  for (const t of trades) {
    if (t.vsol > 0 || t.sol > 0) sol = true;
    else non = true;
  }
  if (sol) return true;
  if (non) return false;
  return true;
}

function priceFromTrades(trades) {
  let mcap = null;
  let peak = null;
  let progress = null;
  let vtok = null;
  for (const t of trades) {
    const m = mcapOf(t.vsol, t.vtok);
    if (m != null) {
      mcap = m;
      peak = peak == null ? m : Math.max(peak, m);
    }
    if (t.vtok > 0) vtok = t.vtok;
  }
  if (vtok != null) progress = progressPct(vtok);
  return { mcap, peak, progress };
}

function publicWallet(w) {
  return {
    address: w.address,
    solBought: round(w.solBought, 6),
    tokensBought: round(w.tokensBought, 4),
    stillHeldTokens: round(w.stillHeldTokens, 4),
    soldTokens: round(w.soldTokens, 4),
    soldPct: round(w.soldPct, 4),
    supplyHeldPct: round(w.supplyHeldPct, 6),
    firstBuyOffsetMs: Number.isFinite(w.firstBuyOffsetMs) ? Math.round(w.firstBuyOffsetMs) : null,
    slotOffset: Number.isFinite(w.slotOffset) ? w.slotOffset : null,
    funder: w.funder || null,
  };
}

function publicCluster(cluster) {
  const wallets = (cluster.wallets || []).map(publicWallet);
  const shown = wallets.slice(0, LAUNCH.maxWalletsListed);
  const hidden = wallets.length - shown.length;
  let note = cluster.note || null;
  if (hidden > 0) note = [note, `${hidden} more wallets were omitted from this list.`].filter(Boolean).join(' ');
  return {
    id: cluster.id,
    kind: cluster.kind,
    measured: cluster.measured === true,
    label: cluster.label,
    slotOffset: Number.isFinite(cluster.slotOffset) ? cluster.slotOffset : null,
    walletCount: cluster.walletCount,
    solBought: round(cluster.solBought, 6),
    supplyHeldPct: round(cluster.supplyHeldPct, 6),
    soldPct: round(cluster.soldPct, 4),
    note,
    wallets: shown,
  };
}

function rugZone({ range, validated, prospective, reason }) {
  const base = {
    validated: validated === true,
    method: range ? METHOD : null,
    mcapSol: { low: round(range?.lowSol, 6), high: round(range?.highSol, 6) },
    mcapUsd: { low: null, high: null },
    confidence: null,
    confidenceNote: reason,
    assumptions: [],
    prospective: {
      pass: prospective?.pass === true,
      labeled: prospective?.labeled ?? 0,
      required: prospective?.required ?? PROSPECTIVE.minN,
      coverage: prospective?.coverage ?? null,
      overCap: prospective?.overCap === true,
    },
  };
  if (!range) return { ...base, status: 'unavailable' };
  if (validated) {
    return {
      ...base,
      status: 'validated',
      confidence: prospective?.coverage ?? null,
      confidenceNote: 'Prospective coverage of logged ranges met the pre-registered bar in docs/bundle-rug-zone-v1.md. The score is that coverage. It is not a probability for this mint, and it is not a trading edge.',
      assumptions: assumptions(),
    };
  }
  return {
    ...base,
    status: 'unvalidated',
    confidenceNote: 'Unvalidated. The estimator is pre-registered in docs/bundle-rug-zone-v1.md and has not passed its prospective check. Empty confidence is unknown, and unknown is not a clearance.',
    assumptions: assumptions(),
  };
}

function assumptions() {
  return [
    'The range is the frozen model band for the market cap at which launch-window bundle wallets have sold at least half of those tokens. It is not a probability that they will sell.',
    'Coefficients come from an offline time-ordered fit. They are not refit on this mint.',
    'Balances are reconstructed from bonding-curve trades. Wallet-to-wallet transfers are invisible.',
    'A prospective pass calibrates the logged range. It is not a trading edge.',
  ];
}

function signalsOf(detected, released) {
  if (released) {
    return {
      sameSlot: { status: 'unavailable', summary: 'Trade detail is not available, so same-slot buys were not measured.' },
      sharedFunders: { status: 'not-collected', summary: 'No funding-parent data.' },
      coordinatedTiming: { status: 'unavailable', summary: 'Trade detail is not available. Timing was not measured.' },
    };
  }
  const same = detected.method === 'create-slot-plus-one'
    ? 'Create slot and the next slot, non-creator buys.'
    : detected.method === 'time-fallback-1500ms'
      ? 'No create slot. Non-creator buys within 1500 ms of create.'
      : 'Trade detail is not available.';
  let funderSummary = 'No funding-parent data.';
  if (detected.funders.measured) {
    const n = detected.clusters.filter((c) => c.kind === 'shared-funder' && c.measured).reduce((s, c) => s + c.walletCount, 0);
    const k = detected.clusters.filter((c) => c.kind === 'shared-funder' && c.measured).length;
    funderSummary = `${n} wallets share ${k} funding parent${k === 1 ? '' : 's'}. Not added to bundle totals.`;
  } else if (detected.funders.reason === 'none-shared') {
    funderSummary = 'Funding-parent rows do not show a shared funder for these wallets.';
  }
  const timing = detected.method === 'time-fallback-1500ms'
    ? 'Timing is the 1500 ms fallback. There is no second timing model.'
    : 'Timing is the slot window itself. There is no second timing model.';
  const coord = detected.coordination.found
    ? `${timing} ${detected.coordination.walletCount} wallets also bought similar sizes (coefficient of variation ${round(detected.coordination.sizeCv, 3)}). That cluster is not added to bundle totals.`
    : timing;
  return {
    sameSlot: { status: detected.method === 'unavailable' ? 'unavailable' : 'measured', summary: same },
    sharedFunders: { status: detected.funders.measured ? 'measured' : 'not-collected', summary: funderSummary },
    coordinatedTiming: {
      status: detected.method === 'unavailable' ? 'unavailable' : 'measured-as-slot-window',
      summary: coord,
    },
  };
}

function limitsFor({ released, source, truncated, fundersMeasured }) {
  const limits = [
    'Holder balances are reconstructed from bonding-curve trades. Wallet-to-wallet SPL transfers are invisible, so supply credited to a buyer can be understated after a transfer.',
    fundersMeasured
      ? 'Shared funders come from an existing bundle_funders table. This process does not fetch funding parents, and those rows are not added to bundle totals.'
      : 'Funding parents are not read. This process does not fetch them.',
    'Bundle totals count non-creator buys in the create slot and the next slot, or within 1500 ms when the create slot is missing. Coordinated-size and shared-funder rows are not added again.',
  ];
  if (released) limits.push('Trade-level detail has been released and no stored trades were found. Bundle totals are null.');
  else if (source === 'stored-trades') limits.push('This reading is reconstructed from stored bonding-curve trades.');
  else if (source === 'memory') limits.push('Supply still held uses the live in-memory balance. The trade list is the in-memory tape.');
  if (truncated) limits.push('The trade list hit its cap. Later sells can be missing from sold amounts.');
  limits.push('The stored trades table keeps mints that were recorded for a paper book or an alert, not every launch. A live memory reading is not limited to that set.');
  return limits;
}

/**
 * Build a risk.v1 body. `lite` forces the released shape even if trades were passed.
 * Returns { body, prediction }. prediction is set only when a numeric range was produced.
 */
export function buildRiskPayload(input) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const meta = input.meta || {};
  const rules = {
    bundleBuyVolumePct: Number.isFinite(input.rules?.bundleBuyVolumePct) ? input.rules.bundleBuyVolumePct : 55,
    minBundleWallets: input.rules?.minBundleWallets ?? 3,
    partialBundleBuyVolumePct: input.rules?.partialBundleBuyVolumePct ?? 25,
  };
  const solUsd = Number.isFinite(input.solUsd) && input.solUsd > 0 ? input.solUsd : null;
  const released = input.lite === true;
  const trades = released ? [] : dedupeTrades(input.trades || []);
  const detected = released
    ? null
    : detectBundles({
      trades,
      createdAt: Number.isFinite(meta.createdAt) ? meta.createdAt : null,
      createSlot: Number.isFinite(meta.createSlot) ? meta.createSlot : null,
      creator: meta.creator || null,
      funders: input.funders instanceof Map ? input.funders : null,
      holders: input.holders instanceof Map ? input.holders : null,
      truncated: !!input.truncated,
    });
  const prices = released ? { mcap: null, peak: null, progress: null } : priceFromTrades(trades);
  const quoteOk = typeof meta.quoteOk === 'boolean' ? meta.quoteOk : (released ? true : inferQuoteOk(trades));
  const mcapSol = !quoteOk ? null : (Number.isFinite(meta.mcapSol) ? meta.mcapSol : prices.mcap);
  const peakMcapSol = !quoteOk ? null : (Number.isFinite(meta.peakMcapSol) ? meta.peakMcapSol : prices.peak);
  const progress = Number.isFinite(meta.progressPct) ? meta.progressPct : prices.progress;
  const createdAt = Number.isFinite(meta.createdAt) ? meta.createdAt : null;
  const share = detected?.bundle.buyVolumeSharePct;
  const walletCount = detected ? detected.bundle.walletCount : null;
  const measured = !!detected && detected.method !== 'unavailable';
  const hardReject = measured && share != null ? share >= rules.bundleBuyVolumePct && walletCount >= rules.minBundleWallets : null;
  const partialFlag = measured && share != null ? share >= rules.partialBundleBuyVolumePct : null;
  const range = !released && quoteOk && input.model && detected?.features ? predictRange(input.model, detected.features) : null;
  const prospective = input.prospective || { pass: false, labeled: 0, required: PROSPECTIVE.minN, coverage: null, overCap: false };
  const validated = !!(range && prospective.pass === true);
  const noteReason = range
    ? null
    : input.model
      ? 'This mint has no launch-window bundle of at least 3 wallets, or the quote is not SOL, so no range is shown. Empty means unknown, and unknown is not a clearance.'
      : 'The estimator is pre-registered in docs/bundle-rug-zone-v1.md but no frozen coefficients are loaded. Empty means unknown, and unknown is not a clearance.';
  const zone = rugZone({ range, validated, prospective, reason: noteReason });
  if (solUsd && zone.mcapSol.low != null) {
    zone.mcapUsd = { low: round(zone.mcapSol.low * solUsd, 2), high: round(zone.mcapSol.high * solUsd, 2) };
  }
  let clusters = detected ? detected.clusters.map(publicCluster) : [{
    id: 'shared-funders',
    kind: 'shared-funder',
    measured: false,
    label: 'Shared funders',
    slotOffset: null,
    walletCount: 0,
    solBought: null,
    supplyHeldPct: null,
    soldPct: null,
    note: 'Not collected. The trades table has no funding parent, and this process does not read one.',
    wallets: [],
  }];
  const hiddenClusters = Math.max(0, clusters.length - LAUNCH.maxClusters);
  if (hiddenClusters > 0) clusters = clusters.slice(0, LAUNCH.maxClusters);

  const body = {
    contract: CONTRACT,
    mode: 'live',
    illustrative: false,
    validated,
    mint: input.mint,
    observedAt: iso(now),
    token: {
      name: meta.name ?? null,
      symbol: meta.symbol ?? null,
      creator: meta.creator ?? null,
      createdAt: iso(createdAt),
      ageSec: createdAt == null ? null : Math.max(0, Math.round((now - createdAt) / 1000)),
      quoteOk,
      mcapSol: round(mcapSol, 6),
      mcapUsd: solUsd && mcapSol != null ? round(mcapSol * solUsd, 2) : null,
      solUsd: solUsd == null ? null : round(solUsd, 6),
      progressPct: round(progress, 4),
      peakMcapSol: round(peakMcapSol, 6),
      graduated: !!meta.graduated,
      lite: released,
    },
    coverage: {
      tradeCount: detected ? detected.tradeCount : 0,
      truncated: !!input.truncated,
      slotData: Number.isFinite(meta.createSlot),
      method: detected ? detected.method : 'unavailable',
      detail: released ? 'released' : 'full',
      source: input.source || (released ? 'none' : 'trades'),
      limits: limitsFor({
        released,
        source: input.source,
        truncated: !!input.truncated,
        fundersMeasured: detected?.funders.measured === true,
      }),
    },
    rules: {
      bundleBuyVolumePct: rules.bundleBuyVolumePct,
      minBundleWallets: rules.minBundleWallets,
      partialBundleBuyVolumePct: rules.partialBundleBuyVolumePct,
    },
    bundle: released || !detected ? {
      definition: 'Trade detail has been released. Bundle totals are null.',
      walletCount: null,
      solBought: null,
      buyVolSol: null,
      buyVolumeSharePct: null,
      supplyHeldPct: null,
      soldPct: null,
      tokensBought: null,
      hardReject: null,
      partialFlag: null,
    } : {
      definition: detected.definition,
      walletCount: detected.bundle.walletCount,
      solBought: round(detected.bundle.solBought, 6),
      buyVolSol: round(detected.buyVolSol, 6),
      buyVolumeSharePct: round(detected.bundle.buyVolumeSharePct, 4),
      supplyHeldPct: round(detected.bundle.supplyHeldPct, 6),
      soldPct: round(detected.bundle.soldPct, 4),
      tokensBought: round(detected.bundle.tokensBought, 4),
      hardReject,
      partialFlag,
    },
    clusters,
    signals: signalsOf(detected || { method: 'unavailable', funders: { measured: false, reason: 'missing' }, coordination: { found: false }, clusters: [] }, released),
    rugZone: zone,
    disclaimer: DISCLAIMER,
  };
  if (hiddenClusters > 0) body.coverage.limits.push(`${hiddenClusters} more clusters were omitted.`);
  const prediction = range && detected?.features ? {
    model: input.model.id || modelId(input.model),
    observedAt: now,
    predSol: range.predSol,
    lowSol: range.lowSol,
    highSol: range.highSol,
    features: detected.features,
  } : null;
  return { body, prediction };
}

export function scoreLoggedPredictions(database, model) {
  const empty = { pass: false, labeled: 0, required: PROSPECTIVE.minN, coverage: null, medAbsLog: null, overCap: false };
  if (!model || !tableExists(database, 'bundle_risk_log')) return empty;
  const id = model.id || modelId(model);
  const count = database.prepare('SELECT COUNT(*) AS n FROM bundle_risk_log WHERE model = ?').get(id).n;
  if (count > PROSPECTIVE.maxRows) {
    return { pass: false, labeled: count, required: PROSPECTIVE.minN, coverage: null, medAbsLog: null, overCap: true };
  }
  if (!count || !tableExists(database, 'trades')) return empty;
  const rows = database.prepare('SELECT mint, observed_at AS observedAt, pred_sol AS predSol, low_sol AS low, high_sol AS high, features FROM bundle_risk_log WHERE model = ? ORDER BY observed_at, mint').all(id);
  const read = database.prepare('SELECT ts, slot, sig, wallet, is_buy AS isBuy, sol, tok, vsol, vtok FROM trades WHERE mint = ? ORDER BY ts, rowid');
  const cases = [];
  for (const row of rows) {
    let features;
    try { features = JSON.parse(row.features); } catch { continue; }
    const trades = read.all(row.mint).map(asTrade);
    const label = labelMajoritySell(trades, features?.wallets || []);
    if (!label) continue;
    cases.push({
      predSol: row.predSol,
      low: row.low,
      high: row.high,
      labelMcap: label.mcapSol,
      labelTs: label.ts,
      observedAt: row.observedAt,
    });
  }
  return judgeProspective(cases, model.train?.medAbsLog);
}

export function collectSamples(database) {
  const counts = { mints: 0, labeled: 0, censored: 0, noBundle: 0, skippedQuote: 0, truncated: 0, noTrades: 0 };
  const rows = [];
  if (!tableExists(database, 'trades')) return { rows, counts };
  const metas = new Map();
  if (tableExists(database, 'tokens')) {
    for (const row of database.prepare('SELECT mint, name, symbol, creator, created_at AS createdAt, create_slot AS createSlot, graduated FROM tokens').iterate()) {
      metas.set(row.mint, row);
    }
  }
  const funders = readFunders(database);
  const traded = new Set();
  let current = null;
  const flush = () => {
    if (!current) return;
    traded.add(current.mint);
    counts.mints += 1;
    const sample = finalizeMint(current, metas.get(current.mint) || null, funders);
    if (sample.kind === 'truncated') counts.truncated += 1;
    else if (sample.kind === 'quote') counts.skippedQuote += 1;
    else if (sample.kind === 'noBundle') counts.noBundle += 1;
    else if (sample.kind === 'censored') counts.censored += 1;
    else if (sample.kind === 'labeled') {
      counts.labeled += 1;
      rows.push(sample.row);
    }
    current = null;
  };
  const sql = `SELECT mint, ts, slot, sig, wallet, is_buy AS isBuy, sol, tok, vsol, vtok
    FROM trades ORDER BY mint, ts, rowid`;
  for (const raw of database.prepare(sql).iterate()) {
    if (!current || current.mint !== raw.mint) {
      flush();
      current = { mint: raw.mint, trades: [], truncated: false };
    }
    if (current.trades.length >= LAUNCH.maxTradesRead) {
      current.truncated = true;
      continue;
    }
    current.trades.push(asTrade(raw));
  }
  flush();
  if (metas.size) counts.noTrades = [...metas.keys()].filter((mint) => !traded.has(mint)).length;
  return { rows, counts };
}

function finalizeMint(bucket, meta, funders) {
  if (bucket.truncated) return { kind: 'truncated' };
  const trades = dedupeTrades(bucket.trades);
  if (!trades.length) return { kind: 'truncated' };
  const quoteOk = inferQuoteOk(trades);
  if (!quoteOk) return { kind: 'quote' };
  const createdAt = meta && Number.isFinite(meta.createdAt) ? meta.createdAt : trades[0].ts;
  const createSlot = meta
    ? (Number.isFinite(meta.createSlot) ? meta.createSlot : null)
    : (trades.find((t) => t.slot != null)?.slot ?? null);
  const detected = detectBundles({
    trades,
    createdAt,
    createSlot,
    creator: meta?.creator || null,
    funders,
    truncated: false,
  });
  if (!detected.features) return { kind: 'noBundle' };
  const label = labelMajoritySell(trades, detected.features.wallets);
  if (!label) return { kind: 'censored' };
  return {
    kind: 'labeled',
    row: {
      mint: bucket.mint,
      createdAt,
      supplyBoughtPct: detected.features.supplyBoughtPct,
      walletCount: detected.features.walletCount,
      sizeCv: detected.features.sizeCv,
      labelMcap: label.mcapSol,
    },
  };
}

export function collectReport(database, { frozenAt, modelFile } = {}) {
  const { rows, counts } = collectSamples(database);
  const fit = fitRugModel(rows, { frozenAt: frozenAt ?? new Date().toISOString() });
  let prospective = {
    pass: false,
    labeled: 0,
    required: PROSPECTIVE.minN,
    coverage: null,
    medAbsLog: null,
    overCap: false,
    reason: 'no frozen model loaded; the time-ordered fit is descriptive and is not a prospective pass',
  };
  if (modelFile) {
    const frozen = loadModelFile(modelFile);
    prospective = frozen
      ? { ...scoreLoggedPredictions(database, frozen), model: frozen.id }
      : { ...prospective, reason: 'frozen model file could not be read' };
  }
  return {
    method: METHOD,
    preRegistration: PRE_REGISTRATION,
    validated: prospective.pass === true,
    counts,
    fit,
    prospective,
    descriptiveOnly: fit.validated === false,
    fitRules: { trainFrac: FIT.trainFrac, minTrain: FIT.minTrain, minTest: FIT.minTest },
  };
}
