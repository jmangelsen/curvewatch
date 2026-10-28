// Settings fingerprint: one short hash for everything that decides which trades happen and how they exit.
// Every paper trade stores it; stats only compare trades from the same fingerprint, so a change starts a new test.
// Importing this module reads config (and therefore .env) and hashes source files. It does not open the database
// and it does not write. Process startup calls recordCohortStart().
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from './config.js';

// Code that changes which trades are taken or what they earn. util.js is the curve cost math;
// intel.js is the smart-wallet set rule; strong.js feeds the clean book; marketgate.js can block entries;
// unpriced.js is the checkpoint book. The learned wallet membership still moves inside a cohort; hashing
// the rule freezes the definition, not a snapshot of wallets (a snapshot would reset the test on every refresh).
export const FINGERPRINT_FILES = [
  'engine/score.js',
  'engine/token.js',
  'engine/paper.js',
  'engine/engine.js',
  'engine/capitalPolicy.js',
  'util.js',
  'engine/intel.js',
  'engine/strong.js',
  'engine/marketgate.js',
  'engine/unpriced.js',
];

const code = FINGERPRINT_FILES.map((f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).join('\n');

// Env-overridable settings that change selection or P&L. Secrets are not included.
export function fingerprintSettings(cfg = config) {
  return {
    paper: cfg.paper,
    strategies: cfg.strategies,
    band: cfg.band,
    scoring: cfg.scoring,
    lifecycle: cfg.lifecycle,
    killRule: cfg.killRule,
    smartWallets: cfg.smartWallets,
    marketGate: cfg.marketGate,
    strong: cfg.strong,
  };
}

const settings = fingerprintSettings();
export const CFG = createHash('sha1').update(JSON.stringify(settings)).update(code).digest('hex').slice(0, 8);
export const SETTINGS_ONLY = createHash('sha1').update(JSON.stringify(settings)).digest('hex').slice(0, 8);

export let CFG_SINCE = null;
let historyDb = null;

/** First time this fingerprint ran. Idempotent. Call from process startup, not from import. */
export function recordCohortStart(q, database = null) {
  if (database) historyDb = database;
  const k = `cfg_since:${CFG}`;
  if (!q.getKv.get(k)) q.setKv.run(k, String(Date.now()));
  CFG_SINCE = Number(q.getKv.get(k).v);
  return CFG_SINCE;
}

export function cfgHistory() {
  if (!historyDb) return [];
  return historyDb.prepare(`SELECT k, v FROM kv WHERE k LIKE 'cfg_since:%' ORDER BY CAST(v AS INTEGER) DESC LIMIT 10`).all()
    .map((r) => ({ cfg: r.k.slice(10), since: Number(r.v) }));
}
