// GET /api/risk/:mint behind the dashboard auth middleware in src/server.js.
// Does not import src/version.js or any fingerprinted engine file.

import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';
import { SCORER_RULES } from './detect.js';
import { PROSPECTIVE, loadModelFile, modelId } from './model.js';
import { MINT_RE, buildRiskPayload, errorBody, readFunders, scoreLoggedPredictions } from './risk.js';

const log = logger('risk');
const STORED_TRADE_CAP = 20_000;
const LOG_SQL = `CREATE TABLE IF NOT EXISTS bundle_risk_log (
  mint TEXT NOT NULL,
  model TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  pred_sol REAL,
  low_sol REAL,
  high_sol REAL,
  features TEXT NOT NULL,
  PRIMARY KEY (mint, model)
)`;

const scoreCache = new Map();
let modelCache = { path: undefined, model: null, warned: false };

export function clearRiskCaches() {
  scoreCache.clear();
  modelCache = { path: undefined, model: null, warned: false };
}

function currentModel(override) {
  if (override) return override;
  const file = process.env.BUNDLE_RUG_MODEL || '';
  if (!file) return null;
  if (modelCache.path === file) return modelCache.model;
  const model = loadModelFile(file);
  modelCache = { path: file, model, warned: !model };
  if (!model) log.warn('BUNDLE_RUG_MODEL could not be loaded');
  return model;
}

function ensureLog(database) {
  database.exec(LOG_SQL);
}

function cachedScore(database, model) {
  const id = model.id || modelId(model);
  let n = 0;
  try {
    const row = database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'bundle_risk_log'").get();
    if (row) n = database.prepare('SELECT COUNT(*) AS n FROM bundle_risk_log WHERE model = ?').get(id).n;
  } catch (e) {
    log.warn('risk score skipped', e.message);
    return { pass: false, labeled: 0, required: PROSPECTIVE.minN, coverage: null, medAbsLog: null, overCap: false };
  }
  const key = `${id}:${n}`;
  const hit = scoreCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.result;
  const result = scoreLoggedPredictions(database, model);
  scoreCache.set(key, { at: Date.now(), result });
  return result;
}

function metaFrom(live, stored) {
  const createdAt = live?.createdAt ?? stored?.created_at ?? null;
  const createSlot = live?.createSlot != null ? live.createSlot : (stored?.create_slot != null ? stored.create_slot : null);
  return {
    name: live?.name ?? stored?.name ?? null,
    symbol: live?.symbol ?? stored?.symbol ?? null,
    creator: live?.creator ?? stored?.creator ?? null,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
    createSlot: Number.isFinite(createSlot) ? createSlot : null,
    quoteOk: live ? !!live.quoteOk : null,
    graduated: live ? !!live.graduated : !!stored?.graduated,
    mcapSol: live && !live.lite && live.quoteOk && Number.isFinite(live.mcap) ? live.mcap : null,
    peakMcapSol: live && !live.lite && live.quoteOk && Number.isFinite(live.peakMcap) ? live.peakMcap : null,
    progressPct: live && !live.lite && Number.isFinite(live.progress) ? live.progress * 100 : null,
  };
}

export function loadMint(database, engine, mint) {
  const live = engine?.getToken?.(mint) || null;
  let stored = null;
  let trades = [];
  try {
    stored = database.prepare('SELECT mint, name, symbol, creator, created_at, create_slot, graduated FROM tokens WHERE mint = ?').get(mint) || null;
    trades = database.prepare('SELECT ts, slot, sig, wallet, is_buy AS isBuy, sol, tok, vsol, vtok FROM trades WHERE mint = ? ORDER BY ts, rowid').all(mint);
  } catch (e) {
    if (!/no such table/i.test(e.message) || !live) throw e;
  }
  if (live && !live.lite) {
    return {
      source: 'memory',
      lite: false,
      truncated: Array.isArray(live.trades) && live.trades.length >= (config.lifecycle.maxTradesPerToken || 4000),
      meta: metaFrom(live, stored),
      trades: live.trades || [],
      holders: live.holders instanceof Map ? live.holders : null,
      funders: safeFunders(database),
    };
  }
  if (!live && !stored && !trades.length) return null;
  if (!trades.length) {
    return {
      source: 'none',
      lite: true,
      truncated: false,
      meta: metaFrom(live, stored),
      trades: [],
      holders: null,
      funders: null,
    };
  }
  const meta = metaFrom(live, stored);
  if (live?.lite && live.quoteOk === false) meta.quoteOk = false;
  return {
    source: 'stored-trades',
    lite: false,
    truncated: trades.length >= STORED_TRADE_CAP,
    meta,
    trades,
    holders: null,
    funders: safeFunders(database),
  };
}

function safeFunders(database) {
  try { return readFunders(database); } catch (e) {
    if (/no such table/i.test(e.message)) return null;
    throw e;
  }
}

function maybeRecord(engine, mint) {
  const token = engine?.getToken?.(mint);
  if (!token || token.lite || token.recording || typeof engine.startRecording !== 'function') return;
  engine.startRecording(token);
}

export function registerRiskRoute(app, deps = {}) {
  const database = deps.db || db;
  app.get('/api/risk/:mint', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    const mint = String(req.params.mint || '');
    if (!MINT_RE.test(mint)) {
      return res.status(400).json(errorBody('invalid_mint', 'The mint must be a base58 string of 32 to 44 characters.'));
    }
    try {
      const loaded = deps.load ? deps.load(mint) : loadMint(database, deps.engine, mint);
      if (!loaded) return res.status(404).json(errorBody('not_seen', 'This collector has no tape for that mint.'));
      const model = currentModel(deps.model || null);
      const prospective = model
        ? cachedScore(database, model)
        : { pass: false, labeled: 0, required: PROSPECTIVE.minN, coverage: null, medAbsLog: null, overCap: false };
      const { body, prediction } = buildRiskPayload({
        mint,
        now: deps.now ? deps.now() : Date.now(),
        solUsd: typeof deps.solUsd === 'function' ? deps.solUsd() : null,
        rules: {
          bundleBuyVolumePct: config.scoring.maxBundlePct,
          minBundleWallets: SCORER_RULES.minBundleWallets,
          partialBundleBuyVolumePct: SCORER_RULES.partialBundleBuyVolumePct,
        },
        model,
        prospective,
        ...loaded,
      });
      if (prediction) {
        try {
          ensureLog(database);
          database.prepare(`INSERT OR IGNORE INTO bundle_risk_log (mint, model, observed_at, pred_sol, low_sol, high_sol, features)
            VALUES (@mint, @model, @observedAt, @predSol, @lowSol, @highSol, @features)`).run({
            mint,
            model: prediction.model,
            observedAt: prediction.observedAt,
            predSol: prediction.predSol,
            lowSol: prediction.lowSol,
            highSol: prediction.highSol,
            features: JSON.stringify(prediction.features),
          });
          maybeRecord(deps.engine, mint);
        } catch (e) {
          log.warn('risk log failed', e.message);
        }
      }
      return res.json(body);
    } catch (e) {
      log.warn('risk read failed', e.message);
      return res.status(503).json(errorBody('unavailable', 'The process cannot read its database.'));
    }
  });
}
