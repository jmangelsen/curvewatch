// Settings fingerprint: one short hash for everything that decides which trades happen and how they exit.
// Every paper trade stores it; stats only compare trades from the same fingerprint, so a change starts a new test.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { db, q } from './db.js';

const files = ['engine/score.js', 'engine/token.js', 'engine/paper.js', 'engine/engine.js'];
const code = files.map((f) => { try { return readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'); } catch { return ''; } }).join('\n');
const settings = { paper: config.paper, strategies: config.strategies, band: config.band, scoring: config.scoring, lifecycle: config.lifecycle, killRule: config.killRule };
export const CFG = createHash('sha1').update(JSON.stringify(settings)).update(code).digest('hex').slice(0, 8);
export const SETTINGS_ONLY = createHash('sha1').update(JSON.stringify(settings)).digest('hex').slice(0, 8);

// first time this fingerprint ran = start of the current test
const k = `cfg_since:${CFG}`;
if (!q.getKv.get(k)) q.setKv.run(k, String(Date.now()));
export const CFG_SINCE = Number(q.getKv.get(k).v);
export function cfgHistory() {
  return db.prepare(`SELECT k, v FROM kv WHERE k LIKE 'cfg_since:%' ORDER BY CAST(v AS INTEGER) DESC LIMIT 10`).all()
    .map((r) => ({ cfg: r.k.slice(10), since: Number(r.v) }));
}
