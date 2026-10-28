// Interpretable rug-zone model. Pre-registered in docs/bundle-rug-zone-v1.md.
// log(mcapSol) = intercept + b1*log(supplyBoughtPct) + b2*log(walletCount) + b3*sizeCv
// The range is that point plus the training residual quantiles. A time-ordered split is descriptive.
// validated becomes true only in judgeProspective, and only on later labels.

import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const METHOD = 'bundle-rug-mcap-v1';

export const FIT = {
  trainFrac: 0.7,
  minTrain: 30,
  minTest: 10,
};

export const PROSPECTIVE = {
  minN: 50,
  minCoverage: 0.8,
  maeMultiple: 1.5,
  maxRows: 1000,
};

const COEF_KEYS = ['intercept', 'logSupplyBoughtPct', 'logWalletCount', 'sizeCv'];

export function median(sorted) {
  const n = sorted.length;
  if (!n) return null;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const m = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];
    const div = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

function ols(rows) {
  const k = 4;
  const xtx = Array.from({ length: k }, () => Array(k).fill(0));
  const xty = Array(k).fill(0);
  for (const row of rows) {
    const x = [1, Math.log(row.supplyBoughtPct), Math.log(row.walletCount), row.sizeCv];
    for (let i = 0; i < k; i++) {
      xty[i] += x[i] * row.y;
      for (let j = 0; j < k; j++) xtx[i][j] += x[i] * x[j];
    }
  }
  const beta = solveLinear(xtx, xty);
  if (!beta || beta.some((v) => !Number.isFinite(v))) return null;
  return Object.fromEntries(COEF_KEYS.map((key, i) => [key, beta[i]]));
}

export function predictLog(coefficients, features) {
  return coefficients.intercept
    + coefficients.logSupplyBoughtPct * Math.log(features.supplyBoughtPct)
    + coefficients.logWalletCount * Math.log(features.walletCount)
    + coefficients.sizeCv * features.sizeCv;
}

export function featureVector(features) {
  if (!features) return null;
  const supply = Number(features.supplyBoughtPct);
  const wallets = Number(features.walletCount);
  const sizeCv = Number(features.sizeCv);
  if (!(supply > 0) || !(wallets >= 3) || !Number.isFinite(sizeCv) || sizeCv < 0) return null;
  return { supplyBoughtPct: supply, walletCount: wallets, sizeCv };
}

export function parseModel(json) {
  if (!json || json.method !== METHOD) return null;
  const src = json.coefficients || {};
  const coefficients = {};
  for (const key of COEF_KEYS) {
    if (!Number.isFinite(src[key])) return null;
    coefficients[key] = src[key];
  }
  const q = json.residualQuantiles || {};
  if (!Number.isFinite(q.q10) || !Number.isFinite(q.q90) || q.q10 > q.q90) return null;
  const medAbsLog = Number(json.train?.medAbsLog);
  if (!Number.isFinite(medAbsLog) || medAbsLog < 0) return null;
  const frozenAtMs = Date.parse(json.frozenAt);
  if (!Number.isFinite(frozenAtMs)) return null;
  return {
    method: METHOD,
    frozenAt: new Date(frozenAtMs).toISOString(),
    coefficients,
    residualQuantiles: { q10: q.q10, q90: q.q90 },
    train: {
      n: Number.isFinite(json.train?.n) ? json.train.n : null,
      medAbsLog,
      endAt: json.train?.endAt ?? null,
    },
    features: ['logSupplyBoughtPct', 'logWalletCount', 'sizeCv'],
    label: { majorityRemainingFrac: 0.5, minWallets: 3 },
  };
}

export function modelId(model) {
  const canonical = JSON.stringify({
    method: model.method,
    frozenAt: model.frozenAt,
    coefficients: model.coefficients,
    residualQuantiles: model.residualQuantiles,
    medAbsLog: model.train.medAbsLog,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function loadModelFile(file) {
  try {
    const parsed = parseModel(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!parsed) return null;
    return { ...parsed, id: modelId(parsed) };
  } catch {
    return null;
  }
}

export function predictRange(model, features) {
  const x = featureVector(features);
  if (!x || !model?.coefficients || !model.residualQuantiles) return null;
  const logY = predictLog(model.coefficients, x);
  if (!Number.isFinite(logY)) return null;
  const pred = Math.exp(logY);
  const low = Math.exp(logY + model.residualQuantiles.q10);
  const high = Math.exp(logY + model.residualQuantiles.q90);
  if (!(pred > 0) || !(low > 0) || !(high > 0)) return null;
  if (!Number.isFinite(pred + low + high)) return null;
  return { predSol: pred, lowSol: Math.min(low, high), highSol: Math.max(low, high) };
}

function equation(coefficients) {
  const term = (name, value) => `${value >= 0 ? '+ ' : '- '}${Math.abs(value).toFixed(6)}*${name}`;
  return `log(mcapSol) = ${coefficients.intercept.toFixed(6)} ${term('log(supplyBoughtPct)', coefficients.logSupplyBoughtPct)} ${term('log(walletCount)', coefficients.logWalletCount)} ${term('sizeCv', coefficients.sizeCv)}`;
}

export function timeSplit(rows, trainFrac) {
  const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt || String(a.mint).localeCompare(String(b.mint)));
  let cut = Math.floor(sorted.length * trainFrac);
  if (cut <= 0 || cut >= sorted.length) return null;
  while (cut > 0 && sorted[cut - 1].createdAt >= sorted[cut].createdAt) cut -= 1;
  if (cut <= 0 || cut >= sorted.length) return null;
  if (!(sorted[cut - 1].createdAt < sorted[cut].createdAt)) return null;
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) };
}

function usableRows(samples) {
  return (samples || []).filter((row) => row
    && row.labelMcap > 0
    && row.supplyBoughtPct > 0
    && row.walletCount >= 3
    && Number.isFinite(row.sizeCv)
    && row.sizeCv >= 0
    && Number.isFinite(row.createdAt));
}

/**
 * Fit on samples that already carry a majority-sell label. Time order is by createdAt.
 * The returned model is descriptive. validated is always false here.
 */
export function fitRugModel(samples, opts = {}) {
  const trainFrac = opts.trainFrac ?? FIT.trainFrac;
  const minTrain = opts.minTrain ?? FIT.minTrain;
  const minTest = opts.minTest ?? FIT.minTest;
  const labeled = usableRows(samples);
  const fail = (reason) => ({ ok: false, reason, validated: false, labeled: labeled.length, method: METHOD });
  const split = timeSplit(labeled, trainFrac);
  if (!split) return fail('split');
  if (split.train.length < minTrain || split.test.length < minTest) return fail('insufficient');
  const train = split.train.map((row) => ({ ...row, y: Math.log(row.labelMcap) }));
  const coefficients = ols(train);
  if (!coefficients) return fail('singular');
  const trainErr = train.map((row) => Math.abs(row.y - predictLog(coefficients, row))).sort((a, b) => a - b);
  const trainResiduals = train.map((row) => row.y - predictLog(coefficients, row)).sort((a, b) => a - b);
  const medAbsLog = median(trainErr);
  const q10 = quantile(trainResiduals, 0.1);
  const q90 = quantile(trainResiduals, 0.9);
  if (medAbsLog == null || q10 == null || q90 == null) return fail('residuals');
  const frozenAt = new Date(opts.frozenAt ?? Date.now()).toISOString();
  const parsed = parseModel({
    method: METHOD,
    frozenAt,
    coefficients,
    residualQuantiles: { q10, q90 },
    train: { n: train.length, medAbsLog, endAt: split.train[split.train.length - 1].createdAt },
  });
  if (!parsed) return fail('invalid');
  let hits = 0;
  const testErr = [];
  for (const row of split.test) {
    const range = predictRange(parsed, row);
    if (!range) continue;
    const tol = Math.abs(row.labelMcap) * 1e-8 + 1e-12;
    if (row.labelMcap >= range.lowSol - tol && row.labelMcap <= range.highSol + tol) hits += 1;
    testErr.push(Math.abs(Math.log(row.labelMcap) - Math.log(range.predSol)));
  }
  testErr.sort((a, b) => a - b);
  const model = { ...parsed, id: modelId(parsed) };
  return {
    ok: true,
    validated: false,
    method: METHOD,
    model,
    equation: equation(coefficients),
    split: {
      trainFrac,
      train: split.train.length,
      test: split.test.length,
      trainEnd: split.train[split.train.length - 1].createdAt,
      testStart: split.test[0].createdAt,
    },
    train: { n: split.train.length, medAbsLog, q10, q90 },
    test: {
      n: split.test.length,
      coverage: split.test.length ? hits / split.test.length : null,
      medAbsLog: median(testErr),
    },
    labeled: labeled.length,
  };
}

/**
 * Prospective check on predictions that were logged before the majority sell.
 * Thresholds are the constants in this file, not fields a model file can lower.
 */
export function judgeProspective(cases, trainMedAbsLog) {
  const required = PROSPECTIVE.minN;
  const list = cases || [];
  if (list.length > PROSPECTIVE.maxRows) {
    return { pass: false, labeled: list.length, required, coverage: null, medAbsLog: null, overCap: true };
  }
  const usable = [];
  for (const row of list) {
    if (!(row.labelTs > row.observedAt)) continue;
    if (!(row.labelMcap > 0) || !(row.low > 0) || !(row.high > 0) || !(row.predSol > 0)) continue;
    usable.push(row);
  }
  const n = usable.length;
  if (!n) return { pass: false, labeled: 0, required, coverage: null, medAbsLog: null, overCap: false };
  const lowHigh = (row) => [Math.min(row.low, row.high), Math.max(row.low, row.high)];
  const inside = usable.filter((row) => {
    const [low, high] = lowHigh(row);
    return row.labelMcap >= low && row.labelMcap <= high;
  }).length;
  const coverage = inside / n;
  const errs = usable.map((row) => Math.abs(Math.log(row.labelMcap) - Math.log(row.predSol))).sort((a, b) => a - b);
  const medAbsLog = median(errs);
  const gate = Number.isFinite(trainMedAbsLog) ? trainMedAbsLog * PROSPECTIVE.maeMultiple : Number.POSITIVE_INFINITY;
  const pass = n >= required && coverage + 1e-12 >= PROSPECTIVE.minCoverage && medAbsLog <= gate + 1e-12;
  return { pass, labeled: n, required, coverage, medAbsLog, overCap: false };
}
